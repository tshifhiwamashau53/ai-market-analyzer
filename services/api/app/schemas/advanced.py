from typing import Any
from pydantic import BaseModel, Field

class TimeframeSnapshot(BaseModel):
    timeframe: str
    direction: str
    structure: str
    momentum: str
    price: float
    ema20: float | None = None
    ema50: float | None = None
    rsi14: float | None = None
    atr14: float | None = None
    vwap: float | None = None
    poc: float | None = None
    support: float | None = None
    resistance: float | None = None

class StrategyAssessment(BaseModel):
    stage: str
    direction: str
    confirmed: bool
    score: float = Field(ge=0, le=100)
    entry: float | None = None
    stop_loss: float | None = None
    targets: list[float] = []
    invalidation: float | None = None
    waiting_for: list[str] = []
    reasons: list[str] = []

class AdvancedAnalysisResponse(BaseModel):
    symbol: str
    execution_timeframe: str
    current_price: float
    higher_timeframe_bias: str
    market_state: str
    action: str
    confidence: float = Field(ge=0, le=1)
    timeframes: list[TimeframeSnapshot]
    strategy: StrategyAssessment
    forecast: list[dict[str, Any]]
    data_quality: str
    generated_at: str
