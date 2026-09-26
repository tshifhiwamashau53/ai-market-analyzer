from typing import Any
import asyncio
import httpx
import yfinance as yf

async def _yahoo_news(query: str, limit: int) -> list[dict[str, Any]]:
    def fetch():
        try:
            return yf.Search(query, news_count=limit).news
        except Exception:
            return []
    items=await asyncio.to_thread(fetch)
    out=[]
    for item in items or []:
        content=item.get("content") or {}
        provider=content.get("provider") or {}
        canonical=content.get("canonicalUrl") or {}
        out.append({
            "title":content.get("title") or item.get("title"),
            "description":content.get("summary") or item.get("summary"),
            "url":canonical.get("url") if isinstance(canonical,dict) else item.get("link"),
            "published_at":content.get("pubDate") or item.get("providerPublishTime"),
            "source":provider.get("displayName") or item.get("publisher") or "Yahoo Finance",
        })
    return out[:limit]

async def fetch_news(query: str, api_key: str | None = None, limit: int = 8) -> list[dict[str, Any]]:
    if api_key:
        url="https://newsapi.org/v2/everything"
        params={"q":query,"language":"en","sortBy":"publishedAt","pageSize":min(limit,20),"apiKey":api_key}
        async with httpx.AsyncClient(timeout=10) as client:
            response=await client.get(url,params=params)
            response.raise_for_status()
            data=response.json()
        return [{"title":a.get("title"),"description":a.get("description"),"url":a.get("url"),"published_at":a.get("publishedAt"),"source":(a.get("source") or {}).get("name")} for a in data.get("articles",[])]
    return await _yahoo_news(query, limit)
