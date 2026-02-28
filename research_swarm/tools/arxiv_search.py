"""arXiv paper search tool using the arxiv Python package."""

from __future__ import annotations

TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "arxiv_search",
        "description": "Search arXiv for academic papers. Returns titles, authors, abstracts, and PDF links.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query for arXiv papers.",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of papers to return (default 5).",
                },
                "sort_by": {
                    "type": "string",
                    "enum": ["relevance", "lastUpdatedDate", "submittedDate"],
                    "description": "Sort order (default relevance).",
                },
            },
            "required": ["query"],
        },
    },
}


def arxiv_search(
    query: str,
    max_results: int = 5,
    sort_by: str = "relevance",
) -> list[dict]:
    import arxiv

    sort_map = {
        "relevance": arxiv.SortCriterion.Relevance,
        "lastUpdatedDate": arxiv.SortCriterion.LastUpdatedDate,
        "submittedDate": arxiv.SortCriterion.SubmittedDate,
    }

    client = arxiv.Client()
    search = arxiv.Search(
        query=query,
        max_results=max_results,
        sort_by=sort_map.get(sort_by, arxiv.SortCriterion.Relevance),
    )

    results = []
    for paper in client.results(search):
        results.append({
            "title": paper.title,
            "authors": [a.name for a in paper.authors[:5]],
            "abstract": paper.summary[:500],
            "published": paper.published.isoformat() if paper.published else None,
            "pdf_url": paper.pdf_url,
            "arxiv_id": paper.entry_id,
            "categories": paper.categories,
        })

    return results
