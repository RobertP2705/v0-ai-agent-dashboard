"""Modal Sandbox tool -- runs arbitrary Python code in an isolated container.

Sandboxes are created, run your code, then terminated (ephemeral). In the Modal
dashboard (modal.com or `modal dashboard`), look under the app "research-swarm"
for Runs/Jobs; each sandbox run may appear briefly and then disappear when done.

When progress_queue is provided, stdout/stderr are streamed as ("stdout", chunk)
and ("stderr", chunk); final result is ("done", result_dict). Caller can yield
progress to the UI so the model sees the sandbox is still running.
"""

from __future__ import annotations

import queue
import threading
from typing import Any

import modal

TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "modal_sandbox",
        "description": "Execute Python code in an isolated Modal sandbox container with optional GPU. Use this to reproduce paper implementations, run experiments, and test code. The container has git installed. WANDB_API_KEY and GITHUB_TOKEN are available. Returns stdout, stderr, and exit code. print() output is captured. For subprocesses, use subprocess.run(..., capture_output=True, text=True) then print(result.stdout, result.stderr, result.returncode) to see their output.",
        "parameters": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "Python code to execute.",
                },
                "requirements": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "pip packages to install (e.g. ['torch', 'numpy', 'einops']).",
                },
                "setup_commands": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Shell commands to run before the code (e.g. ['apt-get install -y libgl1']).",
                },
                "gpu": {
                    "type": "string",
                    "description": "GPU type (e.g. 'T4', 'A10G', 'A100'). Omit for CPU-only.",
                },
                "timeout": {
                    "type": "integer",
                    "description": "Max execution time in seconds. Default 1200 (20 min). Use 1800+ for training runs.",
                },
            },
            "required": ["code"],
        },
    },
}


# Heredoc delimiter (quoted in the shell so user code is not expanded). Must not appear in user code.
_EXPERIMENT_END = "EXPERIMENT_END_MARKER"


def _sandbox_result(stdout: str, stderr: str, exit_code: int | None, error: str | None = None) -> dict:
    """Always return a dict with int exit_code so the agent never sees None."""
    out = {
        "stdout": (stdout or "")[:10000],
        "stderr": (stderr or "")[:5000],
        "exit_code": exit_code if exit_code is not None else -1,
    }
    if error:
        out["stderr"] = (out["stderr"] + "\n[Sandbox error] " + error).strip()[:5000]
    # When we got no output at all, add a hint so the model knows capture may have failed
    if not (out["stdout"] or out["stderr"]) and out["exit_code"] != 0:
        out["stderr"] = (
            out["stderr"] + "\n[No stdout/stderr captured. Process may have been killed, failed to start, "
            "or streams were not connected. Try using subprocess.run(..., capture_output=True) and print() the result.]"
        ).strip()[:5000]
    return out


def modal_sandbox(
    code: str,
    requirements: list[str] | None = None,
    setup_commands: list[str] | None = None,
    gpu: str | None = None,
    timeout: int = 1200,
    progress_queue: queue.Queue[tuple[str, Any]] | None = None,
) -> dict:
    reqs = requirements or []
    try:
        app_ref = modal.App.lookup("research-swarm", create_if_missing=True)
    except Exception as e:
        return _sandbox_result("", "", -1, f"App lookup failed: {e}")

    # Use a fixed image (no pip_install here) so image build never fails due to bad/incompatible reqs.
    # We install requirements at runtime via setup_commands so pip errors show up in stderr.
    image = (
        modal.Image.debian_slim(python_version="3.11")
        .run_commands("apt-get update && apt-get install -y --no-install-recommends git")
    )

    sandbox_kwargs: dict = dict(
        app=app_ref,
        image=image,
        timeout=timeout,
        secrets=[modal.Secret.from_name("search-api-keys")],
    )
    if gpu:
        sandbox_kwargs["gpu"] = gpu

    try:
        sb = modal.Sandbox.create(**sandbox_kwargs)
    except Exception as e:
        err_msg = str(e)
        if "Image build" in err_msg or "im-" in err_msg:
            err_msg += " (Tip: image uses a fixed base with only git; requirements are installed at runtime. If you see this, the base image build failed—check Modal dashboard build logs.)"
        return _sandbox_result("", "", -1, f"Sandbox.create failed: {err_msg}")

    try:
        # Install requirements at runtime so image build is always fast and reliable
        if reqs:
            pip_cmd = "pip install --no-cache-dir " + " ".join(f'"{r}"' for r in reqs) + " wandb"
            pip_proc = sb.exec("bash", "-c", pip_cmd)
            pip_proc.wait()
            if pip_proc.returncode != 0:
                stderr = (pip_proc.stderr.read() or "")[:4000]
                stdout = (pip_proc.stdout.read() or "")[:2000]
                try:
                    sb.terminate()
                except Exception:
                    pass
                res = _sandbox_result(
                    stdout,
                    stderr,
                    pip_proc.returncode or -1,
                    f"pip install failed for requirements. Try fewer/different packages or use setup_commands for tricky deps.",
                )
                if progress_queue is not None:
                    progress_queue.put(("done", res))
                return res
        if setup_commands:
            for cmd in setup_commands:
                setup_proc = sb.exec("bash", "-c", cmd)
                setup_proc.wait()
                if setup_proc.returncode != 0:
                    err = (setup_proc.stderr.read() or "")[:2000]
                    try:
                        sb.terminate()
                    except Exception:
                        pass
                    res = _sandbox_result(
                        setup_proc.stdout.read() or "",
                        err,
                        setup_proc.returncode,
                        f"setup_commands failed: {cmd}",
                    )
                    if progress_queue is not None:
                        progress_queue.put(("done", res))
                    return res

        write_proc = sb.exec(
            "bash", "-c",
            f"cat > /root/experiment.py << '{_EXPERIMENT_END}'\n{code}\n{_EXPERIMENT_END}",
        )
        write_proc.wait()
        if write_proc.returncode != 0:
            try:
                sb.terminate()
            except Exception:
                pass
            res = _sandbox_result("", write_proc.stderr.read() or "", write_proc.returncode or -1, "Failed to write experiment.py")
            if progress_queue is not None:
                progress_queue.put(("done", res))
            return res

        # PTY so Python sees a TTY and line-buffers stdout (print() is captured). -u and PYTHONUNBUFFERED as backup.
        proc = sb.exec(
            "python", "-u", "/root/experiment.py",
            timeout=timeout,
            env={"PYTHONUNBUFFERED": "1"},
            pty=True,
        )
        if progress_queue is not None:
            stdout_chunks: list[str] = []
            stderr_chunks: list[str] = []

            def read_stream(stream, kind: str, chunks_list: list[str]):
                try:
                    while True:
                        data = stream.read(4096)
                        if not data:
                            break
                        s = data.decode() if isinstance(data, bytes) else data
                        chunks_list.append(s)
                        progress_queue.put((kind, s))
                except Exception:
                    pass

            t_stdout = threading.Thread(target=read_stream, args=(proc.stdout, "stdout", stdout_chunks), daemon=True)
            t_stderr = threading.Thread(target=read_stream, args=(proc.stderr, "stderr", stderr_chunks), daemon=True)
            t_stdout.start()
            t_stderr.start()
            try:
                proc.wait()
            except Exception as e:
                if progress_queue is not None:
                    progress_queue.put(("done", _sandbox_result("".join(stdout_chunks), "".join(stderr_chunks), -1, str(e))))
                raise
            t_stdout.join(timeout=5)
            t_stderr.join(timeout=5)
            stdout = "".join(stdout_chunks)
            stderr = "".join(stderr_chunks)
            exit_code = proc.returncode if proc.returncode is not None else -1
            result = _sandbox_result(stdout, stderr, exit_code)
            progress_queue.put(("done", result))
            return result
        # Read streams in background (same as streaming path) so we capture output before process exits
        _stdout_chunks: list[str] = []
        _stderr_chunks: list[str] = []

        def _read(stream, chunks: list[str]):
            try:
                while True:
                    data = stream.read(4096)
                    if not data:
                        break
                    s = data.decode() if isinstance(data, bytes) else data
                    chunks.append(s)
            except Exception:
                pass

        _t1 = threading.Thread(target=_read, args=(proc.stdout, _stdout_chunks), daemon=True)
        _t2 = threading.Thread(target=_read, args=(proc.stderr, _stderr_chunks), daemon=True)
        _t1.start()
        _t2.start()
        proc.wait()
        _t1.join(timeout=5)
        _t2.join(timeout=5)
        stdout = "".join(_stdout_chunks)
        stderr = "".join(_stderr_chunks)
        exit_code = proc.returncode if proc.returncode is not None else -1
        return _sandbox_result(stdout, stderr, exit_code)
    except Exception as e:
        res = _sandbox_result("", "", -1, str(e))
        if progress_queue is not None:
            progress_queue.put(("done", res))
        return res
    finally:
        try:
            sb.terminate()
        except Exception:
            pass
