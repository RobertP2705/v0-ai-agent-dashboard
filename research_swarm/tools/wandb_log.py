"""Weights & Biases logging tool."""

from __future__ import annotations

import os

TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "wandb_log",
        "description": (
            "Log metrics, config, and artifacts to a Weights & Biases run. "
            "Creates a new run if run_id is not provided."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "project": {
                    "type": "string",
                    "description": "W&B project name.",
                },
                "run_name": {
                    "type": "string",
                    "description": "Human-readable run name.",
                },
                "config": {
                    "type": "object",
                    "description": "Hyperparameters / config dict to log.",
                },
                "metrics": {
                    "type": "object",
                    "description": "Metrics dict to log (e.g. {'loss': 0.5, 'accuracy': 0.9}).",
                },
                "notes": {
                    "type": "string",
                    "description": "Optional notes for the run.",
                },
            },
            "required": ["project", "metrics"],
        },
    },
}


def wandb_log(
    project: str,
    metrics: dict,
    run_name: str | None = None,
    config: dict | None = None,
    notes: str | None = None,
) -> dict:
    import wandb

    api_key = os.environ.get("WANDB_API_KEY")
    if not api_key:
        return {"error": "WANDB_API_KEY not set"}

    wandb.login(key=api_key)
    run = wandb.init(
        project=project,
        name=run_name,
        config=config or {},
        notes=notes,
        reinit=True,
    )

    wandb.log(metrics)
    run_url = run.get_url()
    run.finish()

    return {
        "run_url": run_url,
        "run_id": run.id,
        "project": project,
        "metrics_logged": list(metrics.keys()),
    }
