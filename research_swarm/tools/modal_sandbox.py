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
from typing import Any

import modal

TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "modal_sandbox",
        "description": "Execute Python code in an isolated Modal sandbox container with optional GPU. Use this to reproduce paper implementations, run experiments, and test code. The container has git installed. WANDB_API_KEY and GITHUB_TOKEN are available. GIT_TERMINAL_PROMPT=0 is set so git never prompts for credentials. For git clone: use the EXACT repo URL from the research context (never placeholder URLs like https://github.com/username/repo.git). Use subprocess.run(['git', 'clone', url, dir], capture_output=True, text=True, env={**os.environ, 'GIT_TERMINAL_PROMPT': '0'}) and print(stdout, stderr, returncode); do not use os.system() for git clone. For private GitHub repos use https://x-access-token:<GITHUB_TOKEN>@github.com/owner/repo.git. Returns stdout, stderr, and exit code. print() output is captured.",
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
                # Prevent git from prompting for credentials if model runs git clone in setup_commands
                setup_proc = sb.exec("bash", "-c", "export GIT_TERMINAL_PROMPT=0 && " + cmd)
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
        # GIT_TERMINAL_PROMPT=0 prevents git from prompting for username/password (would block forever in container).
        proc = sb.exec(
            "python", "-u", "/root/experiment.py",
            timeout=timeout,
            env={"PYTHONUNBUFFERED": "1", "GIT_TERMINAL_PROMPT": "0"},
            pty=True,
        )
        # Modal docs: "read() blocks until the process finishes and returns the entire output stream."
        # Do not read in background threads—wait() then read() in main thread for reliable capture.
        try:
            proc.wait()
        except Exception as e:
            if progress_queue is not None:
                progress_queue.put(("done", _sandbox_result("", "", -1, str(e))))
            raise
        _raw_stdout = proc.stdout.read()
        _raw_stderr = proc.stderr.read()
        stdout = _raw_stdout.decode() if isinstance(_raw_stdout, bytes) else (_raw_stdout or "")
        stderr = _raw_stderr.decode() if isinstance(_raw_stderr, bytes) else (_raw_stderr or "")
        exit_code = proc.returncode if proc.returncode is not None else -1
        result = _sandbox_result(stdout, stderr, exit_code)
        if progress_queue is not None:
            if stdout:
                progress_queue.put(("stdout", stdout))
            if stderr:
                progress_queue.put(("stderr", stderr))
            progress_queue.put(("done", result))
            return result
        return result
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
