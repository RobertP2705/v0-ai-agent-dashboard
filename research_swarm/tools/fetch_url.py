"""Fetch and extract readable text from a URL (Reddit threads, blog posts, docs, etc.)."""

from __future__ import annotations

import re

import httpx

TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "fetch_url",
        "description": (
            "Fetch a URL and return its text content. "
            "Works on Reddit threads, blog posts, documentation pages, GitHub READMEs, "
            "Hacker News threads, and most public web pages. "
            "Returns the extracted text (truncated to ~12 000 chars)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The full URL to fetch.",
                },
            },
            "required": ["url"],
        },
    },
}

_MAX_CHARS = 12_000


def fetch_url(url: str) -> dict:
    reddit_json = _try_reddit_json(url)
    if reddit_json is not None:
        return reddit_json

    try:
        resp = httpx.get(
            url,
            timeout=20,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; ResearchBot/1.0)",
                "Accept": "text/html,application/json,text/plain",
            },
        )
        resp.raise_for_status()
    except Exception as exc:
        return {"error": f"Failed to fetch URL: {exc}", "url": url}

    content_type = resp.headers.get("content-type", "")
    if "json" in content_type:
        return {"url": url, "content": _truncate(resp.text)}

    text = _extract_text(resp.text)
    return {"url": url, "content": _truncate(text)}


def _try_reddit_json(url: str) -> dict | None:
    """Reddit URLs can be fetched as JSON by appending .json."""
    if "reddit.com" not in url:
        return None
    json_url = url.rstrip("/") + ".json"
    try:
        resp = httpx.get(
            json_url,
            timeout=20,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; ResearchBot/1.0)"},
        )
        resp.raise_for_status()
        data = resp.json()
        return {"url": url, "content": _truncate(_flatten_reddit(data))}
    except Exception:
        return None


def _flatten_reddit(data) -> str:
    """Pull title, selftext, and top comments from Reddit JSON."""
    parts: list[str] = []
    if isinstance(data, list) and len(data) > 0:
        listing = data[0].get("data", {}).get("children", [])
        for child in listing:
            d = child.get("data", {})
            if d.get("title"):
                parts.append(f"# {d['title']}")
            if d.get("selftext"):
                parts.append(d["selftext"])

        if len(data) > 1:
            comments = data[1].get("data", {}).get("children", [])
            for c in comments[:15]:
                body = c.get("data", {}).get("body", "")
                if body:
                    parts.append(f"---\n{body}")
    return "\n\n".join(parts) if parts else str(data)[:_MAX_CHARS]


def _extract_text(html: str) -> str:
    """Best-effort HTML to plain text without heavy dependencies."""
    text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&#\d+;", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _truncate(text: str) -> str:
    if len(text) <= _MAX_CHARS:
        return text
    return text[:_MAX_CHARS] + "\n\n[...truncated]"
