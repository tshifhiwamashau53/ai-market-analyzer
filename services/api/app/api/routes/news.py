from fastapi import APIRouter, Query
from app.config import get_settings
from app.news.provider import fetch_news
from app.ml.sentiment.finbert import FinBERTSentiment

router = APIRouter(prefix="/news", tags=["news"])
sentiment = FinBERTSentiment()
settings = get_settings()

@router.get("")
async def news(query: str = Query(min_length=1, max_length=120), limit: int = Query(8, ge=1, le=20)):
    articles = await fetch_news(query, settings.news_api_key, limit)
    for article in articles:
        text = " ".join(x for x in [article.get("title"), article.get("description")] if x)
        result = sentiment.analyze(text) if text else None
        article["sentiment"] = result.__dict__ if result else None
    return {"query": query, "articles": articles, "provider_configured": bool(settings.news_api_key)}
