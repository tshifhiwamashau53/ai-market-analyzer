from datetime import datetime
from pydantic import BaseModel, Field

class Candle(BaseModel):
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0

class Quote(BaseModel):
    symbol: str
    price: float
    change: float | None = None
    change_percent: float | None = None
    timestamp: datetime

class MarketHistory(BaseModel):
    symbol: str
    interval: str
    candles: list[Candle]
    source: str

class IndicatorSnapshot(BaseModel):
    ema20: float | None = None
    ema50: float | None = None
    rsi: float | None = None
    macd: float | None = None
    macd_signal: float | None = None
    bb_upper: float | None = None
    bb_lower: float | None = None
    atr: float | None = None
    vwap: float | None = None

class MarketAnalysisRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=30)
    interval: str = "1d"
    period: str = "6mo"
    depth: str = "standard"

class PredictionPoint(BaseModel):
    time: datetime
    value: float
    lower: float | None = None
    upper: float | None = None

class AnalysisResponse(BaseModel):
    symbol: str
    current_price: float
    direction: str
    action: str
    confidence: float
    setup: str
    entry: float | None
    stop_loss: float | None
    take_profit: float | None
    invalidation: float | None
    indicators: IndicatorSnapshot
    prediction: list[PredictionPoint]
    sentiment: dict
    reasons: list[str]
    risk_notes: list[str]
