"""Web search tool using httpx + a search API (Tavily or SerpAPI)."""

from __future__ import annotations

import os

import httpx

TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": (
            "Search the web for information on a given query. "
            "Optionally restrict to a specific site (e.g. 'reddit.com', 'twitter.com', 'news.ycombinator.com'). "
            "Returns a list of results with titles, URLs, and snippets."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query.",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 5).",
                },
                "site": {
                    "type": "string",
                    "description": (
                        "Optional domain to restrict search to, e.g. 'reddit.com', "
                        "'twitter.com', 'news.ycombinator.com', 'github.com'."
                    ),
                },
            },
            "required": ["query"],
        },
    },
}


def web_search(query: str, max_results: int = 5, site: str | None = None) -> list[dict]:
    if site:
        query = f"site:{site} {query}"

    tavily_key = os.environ.get("TAVILY_API_KEY")
    serpapi_key = os.environ.get("SERPAPI_KEY")

    if tavily_key:
        return _tavily_search(query, max_results, tavily_key)
    if serpapi_key:
        return _serpapi_search(query, max_results, serpapi_key)

    return [{"error": "No search API key configured. Set TAVILY_API_KEY or SERPAPI_KEY."}]


def _tavily_search(query: str, max_results: int, api_key: str) -> list[dict]:
    resp = httpx.post(
        "https://api.tavily.com/search",
        json={"query": query, "max_results": max_results, "search_depth": "advanced"},
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return [
        {"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("content", "")}
        for r in data.get("results", [])
    ]


def _serpapi_search(query: str, max_results: int, api_key: str) -> list[dict]:
    resp = httpx.get(
        "https://serpapi.com/search.json",
        params={"q": query, "num": max_results, "api_key": api_key},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return [
        {"title": r.get("title", ""), "url": r.get("link", ""), "snippet": r.get("snippet", "")}
        for r in data.get("organic_results", [])[:max_results]
    ]
