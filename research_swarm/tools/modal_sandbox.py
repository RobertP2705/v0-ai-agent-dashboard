"""Modal Sandbox tool -- runs arbitrary Python code in an isolated container.

Sandboxes are created, run your code, then terminated (ephemeral). In the Modal
dashboard (modal.com or `modal dashboard`), look under the app "research-swarm"
for Runs/Jobs; each sandbox run may appear briefly and then disappear when done.
"""

from __future__ import annotations

import modal

TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "modal_sandbox",
        "description": "Execute Python code in an isolated Modal sandbox container with optional GPU. Use this to reproduce paper implementations, run experiments, and test code. The container has git installed. WANDB_API_KEY and GITHUB_TOKEN are available. Returns stdout, stderr, and exit code.",
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
                    "description": "Max execution time in seconds (default 600).",
                },
            },
            "required": ["code"],
        },
    },
}


def _sandbox_result(stdout: str, stderr: str, exit_code: int | None, error: str | None = None) -> dict:
    """Always return a dict with int exit_code so the agent never sees None."""
    out = {
        "stdout": (stdout or "")[:10000],
        "stderr": (stderr or "")[:5000],
        "exit_code": exit_code if exit_code is not None else -1,
    }
    if error:
        out["stderr"] = (out["stderr"] + "\n[Sandbox error] " + error).strip()[:5000]
    return out


def modal_sandbox(
    code: str,
    requirements: list[str] | None = None,
    setup_commands: list[str] | None = None,
    gpu: str | None = None,
    timeout: int = 600,
) -> dict:
    reqs = requirements or []
    try:
        app_ref = modal.App.lookup("research-swarm", create_if_missing=True)
    except Exception as e:
        return _sandbox_result("", "", -1, f"App lookup failed: {e}")

    image = (
        modal.Image.debian_slim(python_version="3.11")
        .run_commands("apt-get update && apt-get install -y --no-install-recommends git")
        .pip_install(*reqs, "wandb")
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
        return _sandbox_result("", "", -1, f"Sandbox.create failed: {e}")

    try:
        if setup_commands:
            for cmd in setup_commands:
                setup_proc = sb.exec("bash", "-c", cmd)
                setup_proc.wait()
                if setup_proc.returncode != 0:
                    err = (setup_proc.stderr.read() or "")[:2000]
                    return _sandbox_result(
                        setup_proc.stdout.read() or "",
                        err,
                        setup_proc.returncode,
                        f"setup_commands failed: {cmd}",
                    )

        write_proc = sb.exec(
            "bash", "-c",
            f"cat > /root/experiment.py << 'PYEOF'\n{code}\nPYEOF",
        )
        write_proc.wait()
        if write_proc.returncode != 0:
            return _sandbox_result("", write_proc.stderr.read() or "", write_proc.returncode or -1, "Failed to write experiment.py")

        proc = sb.exec("python", "/root/experiment.py", timeout=timeout)
        stdout = proc.stdout.read()
        stderr = proc.stderr.read()
        proc.wait()
        exit_code = proc.returncode if proc.returncode is not None else -1
        return _sandbox_result(stdout, stderr, exit_code)
    except Exception as e:
        return _sandbox_result("", "", -1, str(e))
    finally:
        try:
            sb.terminate()
        except Exception:
            pass
