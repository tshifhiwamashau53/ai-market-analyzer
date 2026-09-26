import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from app.config import get_settings
from app.data.providers.yahoo import YahooFinanceProvider
from app.ml.forecasting.baseline import baseline_forecast
from app.schemas.advanced import AdvancedAnalysisResponse, TimeframeSnapshot, StrategyAssessment
from app.strategy.mtf import snapshot
from app.strategy.accumulation_vp import evaluate

router = APIRouter(prefix="/advanced", tags=["advanced"])
provider = YahooFinanceProvider()
settings = get_settings()

@router.get("/{symbol}", response_model=AdvancedAnalysisResponse)
async def advanced(symbol: str, execution_timeframe: str = "15m"):
    symbol = symbol.upper()
    frames = {"4h": "60m", "1h": "1h", "15m": "15m", "5m": "5m"}
    periods = {"4h": "60d", "1h": "60d", "15m": "30d", "5m": "30d"}
    try:
        data = await asyncio.gather(*[
            provider.history(symbol, periods[tf], interval)
            for tf, interval in frames.items()
        ])
    except Exception as exc:
        raise HTTPException(502, f"Advanced market data unavailable: {exc}")
    snaps = [snapshot(df, tf) for tf, df in zip(frames, data)]
    higher = snaps[0].direction
    result = evaluate(data[2], higher)
    current = snaps[2].price
    forecast = baseline_forecast(data[2], 7)
    confidence = result.score / 100
    return AdvancedAnalysisResponse(
        symbol=symbol,
        execution_timeframe=execution_timeframe,
        current_price=current,
        higher_timeframe_bias=higher,
        market_state=higher,
        action=("BUY" if result.direction == "BULLISH" else "SELL" if result.direction == "BEARISH" else "WAIT") if result.confirmed else "WAIT",
        confidence=confidence,
        timeframes=[
            TimeframeSnapshot(timeframe=s.timeframe,direction=s.direction,structure=s.structure,momentum=s.momentum,price=s.price,
                              ema20=s.indicators.get("ema20"),ema50=s.indicators.get("ema50"),rsi14=s.indicators.get("rsi"),
                              atr14=s.indicators.get("atr"),vwap=s.indicators.get("vwap"),poc=s.indicators.get("poc"),
                              support=s.indicators.get("support"),resistance=s.indicators.get("resistance"))
            for s in snaps
        ],
        strategy=StrategyAssessment(stage=result.stage,direction=result.direction,confirmed=result.confirmed,score=result.score,
                                     entry=result.entry,stop_loss=result.stop_loss,targets=result.targets,
                                     invalidation=result.invalidation,waiting_for=result.waiting_for,reasons=result.reasons),
        forecast=forecast,
        data_quality="GOOD",
        generated_at=datetime.now(timezone.utc).isoformat()
    )
