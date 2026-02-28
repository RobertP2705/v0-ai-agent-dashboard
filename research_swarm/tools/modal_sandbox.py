"""Modal Sandbox tool -- runs arbitrary Python code in an isolated container."""

from __future__ import annotations

import modal

TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "modal_sandbox",
        "description": (
            "Execute Python code in an isolated Modal sandbox container. "
            "Use this to reproduce paper implementations, run experiments, "
            "and test code. Returns stdout, stderr, and exit code."
        ),
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
                    "description": "pip packages to install (e.g. ['torch', 'numpy']).",
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


def modal_sandbox(
    code: str,
    requirements: list[str] | None = None,
    timeout: int = 600,
) -> dict:
    reqs = requirements or []
    app_ref = modal.App.lookup("research-swarm", create_if_missing=True)

    image = modal.Image.debian_slim(python_version="3.11").pip_install(
        *reqs, "wandb",
    )

    sb = modal.Sandbox.create(app=app_ref, image=image, timeout=timeout)
    try:
        write_proc = sb.exec(
            "bash", "-c",
            f"cat > /root/experiment.py << 'PYEOF'\n{code}\nPYEOF",
        )
        write_proc.wait()

        proc = sb.exec("python", "/root/experiment.py", timeout=timeout)
        stdout = proc.stdout.read()
        stderr = proc.stderr.read()
        proc.wait()

        return {
            "stdout": stdout[:10000],
            "stderr": stderr[:5000],
            "exit_code": proc.returncode,
        }
    finally:
        sb.terminate()
