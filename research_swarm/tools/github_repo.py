"""GitHub repository management tool -- create repos, commit, and push code."""

from __future__ import annotations

import os

TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "github_push",
        "description": (
            "Create or update a GitHub repository with experiment code. "
            "Creates the repo if it doesn't exist, then commits and pushes the provided files."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "repo_name": {
                    "type": "string",
                    "description": "Repository name (will be created under the authenticated user).",
                },
                "files": {
                    "type": "object",
                    "description": "Dict of {filepath: content} to commit (e.g. {'main.py': 'print(1)', 'README.md': '# Experiment'}).",
                },
                "commit_message": {
                    "type": "string",
                    "description": "Git commit message.",
                },
                "description": {
                    "type": "string",
                    "description": "Repository description (used only on creation).",
                },
            },
            "required": ["repo_name", "files", "commit_message"],
        },
    },
}


def github_push(
    repo_name: str,
    files: dict[str, str],
    commit_message: str,
    description: str = "",
) -> dict:
    from github import Github, GithubException

    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        return {"error": "GITHUB_TOKEN not set"}

    g = Github(token)
    user = g.get_user()

    try:
        repo = user.get_repo(repo_name)
    except GithubException:
        repo = user.create_repo(
            repo_name,
            description=description or f"Research experiment: {repo_name}",
            auto_init=True,
            private=False,
        )

    created = []
    updated = []
    for path, content in files.items():
        try:
            existing = repo.get_contents(path)
            repo.update_file(
                path=path,
                message=commit_message,
                content=content,
                sha=existing.sha,
            )
            updated.append(path)
        except GithubException:
            repo.create_file(
                path=path,
                message=commit_message,
                content=content,
            )
            created.append(path)

    return {
        "repo_url": repo.html_url,
        "repo_full_name": repo.full_name,
        "files_created": created,
        "files_updated": updated,
        "commit_message": commit_message,
    }
