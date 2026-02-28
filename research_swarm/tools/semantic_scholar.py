"""Semantic Scholar API search tool."""

from __future__ import annotations

import httpx

TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "semantic_scholar_search",
        "description": "Search Semantic Scholar for academic papers. Returns titles, authors, abstracts, citation counts, and URLs.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query.",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of papers to return (default 5).",
                },
                "year_range": {
                    "type": "string",
                    "description": "Filter by year range, e.g. '2023-2026' (optional).",
                },
            },
            "required": ["query"],
        },
    },
}


def semantic_scholar_search(
    query: str,
    max_results: int = 5,
    year_range: str | None = None,
) -> list[dict]:
    params: dict = {
        "query": query,
        "limit": max_results,
        "fields": "title,authors,abstract,citationCount,url,year,externalIds,openAccessPdf",
    }
    if year_range:
        params["year"] = year_range

    resp = httpx.get(
        "https://api.semanticscholar.org/graph/v1/paper/search",
        params=params,
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    return [
        {
            "title": p.get("title", ""),
            "authors": [a.get("name", "") for a in (p.get("authors") or [])[:5]],
            "abstract": (p.get("abstract") or "")[:500],
            "citation_count": p.get("citationCount", 0),
            "year": p.get("year"),
            "url": p.get("url", ""),
            "arxiv_id": (p.get("externalIds") or {}).get("ArXiv"),
            "pdf_url": (p.get("openAccessPdf") or {}).get("url"),
        }
        for p in data.get("data", [])
    ]
