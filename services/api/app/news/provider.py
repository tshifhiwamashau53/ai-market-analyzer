from typing import Any
import httpx

async def fetch_news(query: str, api_key: str | None = None, limit: int = 8) -> list[dict[str, Any]]:
    if not api_key:
        return []
    url = "https://newsapi.org/v2/everything"
    params = {"q": query, "language": "en", "sortBy": "publishedAt", "pageSize": min(limit, 20), "apiKey": api_key}
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()
    return [
        {"title": a.get("title"), "description": a.get("description"), "url": a.get("url"), "published_at": a.get("publishedAt"), "source": (a.get("source") or {}).get("name")}
        for a in data.get("articles", [])
    ]
