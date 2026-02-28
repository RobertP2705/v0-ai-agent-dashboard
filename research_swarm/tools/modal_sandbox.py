"""Modal Sandbox tool -- runs arbitrary Python code in an isolated container."""

from __future__ import annotations

import modal

TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "modal_sandbox",
        "description": (
            "Execute Python code in an isolated Modal sandbox container with optional GPU. "
<<<<<<< Updated upstream
            "Use this to reproduce paper implementations, run experiments, "
            "and test code. The sandbox has WANDB_API_KEY and GITHUB_TOKEN "
            "environment variables available. Returns stdout, stderr, and exit code."
<<<<<<< HEAD
>>>>>>> b1d96c3 (wand working)
=======
            "Execute Python code in an isolated Modal sandbox container with optional GPU. "
            "Use this to reproduce paper implementations, run experiments, "
            "and test code. The sandbox has WANDB_API_KEY and GITHUB_TOKEN "
            "environment variables available. Returns stdout, stderr, and exit code."
>>>>>>> b1d96c3 (wand working)
=======
            "The container has git installed. Use for experiments, git clone, etc. "
            "WANDB_API_KEY and GITHUB_TOKEN are available. Returns stdout, stderr, and exit code."
>>>>>>> Stashed changes
=======
>>>>>>> b18c20807117ea39a3ed0b7a4eb38de785851667
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


def modal_sandbox(
    code: str,
    requirements: list[str] | None = None,
    setup_commands: list[str] | None = None,
    gpu: str | None = None,
    timeout: int = 600,
) -> dict:
    reqs = requirements or []
    app_ref = modal.App.lookup("research-swarm", create_if_missing=True)

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

    sb = modal.Sandbox.create(**sandbox_kwargs)
    try:
        if setup_commands:
            for cmd in setup_commands:
                setup_proc = sb.exec("bash", "-c", cmd)
                setup_proc.wait()

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
