from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.api.routes import health, market, analysis, backtest, ws, advanced

s = get_settings()
app = FastAPI(title=s.app_name, version="2.0.0")
origins = [x.strip() for x in s.frontend_url.split(",") if x.strip()]
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
app.include_router(backtest.router)
app.include_router(advanced.router)
app.include_router(ws.router)
