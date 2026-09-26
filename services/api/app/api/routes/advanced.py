import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from app.data.providers.yahoo import YahooFinanceProvider
from app.ml.forecasting.baseline import baseline_forecast
from app.schemas.advanced import AdvancedAnalysisResponse, TimeframeSnapshot, StrategyAssessment
from app.strategy.mtf import snapshot
from app.strategy.accumulation_vp import evaluate

router = APIRouter(prefix="/advanced", tags=["advanced"])
provider = YahooFinanceProvider()

@router.get("/{symbol}", response_model=AdvancedAnalysisResponse)
async def advanced(symbol: str, execution_timeframe: str = "15m"):
    symbol = symbol.upper()
    allowed = {"1h", "15m", "5m"}
    if execution_timeframe not in allowed:
        raise HTTPException(400, "execution_timeframe must be 1h, 15m, or 5m")

    frames = {"4h": "60m", "1h": "1h", "15m": "15m", "5m": "5m"}
    periods = {"4h": "60d", "1h": "60d", "15m": "30d", "5m": "30d"}
    try:
        data = await asyncio.gather(*[
            provider.history(symbol, periods[tf], interval)
            for tf, interval in frames.items()
        ])
    except Exception as exc:
        raise HTTPException(502, f"Advanced market data unavailable: {exc}")

    data[0] = (
        data[0].resample("4h")
        .agg({"open":"first","high":"max","low":"min","close":"last","volume":"sum"})
        .dropna()
    )

    snaps = [snapshot(df, tf) for tf, df in zip(frames, data)]
    execution_index = list(frames).index(execution_timeframe)
    execution_df = data[execution_index]
    higher = snaps[0].direction
    result = evaluate(execution_df, higher)
    current = snaps[execution_index].price
    forecast = baseline_forecast(execution_df, 7)

    quality = "GOOD"
    if len(execution_df) < 100:
        quality = "LIMITED_HISTORY"

    action = "BUY" if result.confirmed and result.direction == "BULLISH" else "SELL" if result.confirmed and result.direction == "BEARISH" else "WAIT"

    return AdvancedAnalysisResponse(
        symbol=symbol,
        execution_timeframe=execution_timeframe,
        current_price=current,
        higher_timeframe_bias=higher,
        market_state=result.stage,
        action=action,
        confidence=result.score / 100,
        timeframes=[
            TimeframeSnapshot(
                timeframe=s.timeframe,
                direction=s.direction,
                structure=s.structure,
                momentum=s.momentum,
                price=s.price,
                ema20=s.indicators.get("ema20"),
                ema50=s.indicators.get("ema50"),
                rsi14=s.indicators.get("rsi"),
                atr14=s.indicators.get("atr"),
                vwap=s.indicators.get("vwap"),
                poc=s.indicators.get("poc"),
                support=s.indicators.get("support"),
                resistance=s.indicators.get("resistance"),
            ) for s in snaps
        ],
        strategy=StrategyAssessment(
            stage=result.stage,
            direction=result.direction,
            confirmed=result.confirmed,
            score=result.score,
            entry=result.entry,
            planned_entry=result.planned_entry,
            stop_loss=result.stop_loss,
            targets=result.targets,
            invalidation=result.invalidation,
            risk_reward=result.risk_reward,
            range_high=result.range_high,
            range_low=result.range_low,
            poc=result.poc,
            breakout_level=result.breakout_level,
            waiting_for=result.waiting_for,
            reasons=result.reasons,
        ),
        forecast=forecast,
        data_quality=quality,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
