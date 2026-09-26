from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.api.routes import health, market, analysis, backtest, ws, advanced, news, model

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

origins = [x.strip() for x in settings.frontend_url.split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(market.router)
app.include_router(analysis.router)
app.include_router(advanced.router)
app.include_router(backtest.router)
app.include_router(news.router)
app.include_router(model.router)
app.include_router(ws.router)

@app.get("/")
async def root():
    return {
        "name": settings.app_name,
        "status": "ok",
        "docs": "/docs",
        "execution": "disabled",
    }
