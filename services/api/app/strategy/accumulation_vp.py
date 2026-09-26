from dataclasses import dataclass
import pandas as pd
from app.indicators.technical import compute_indicators

@dataclass
class StrategyResult:
    stage: str
    direction: str
    confirmed: bool
    score: float
    entry: float | None
    stop_loss: float | None
    targets: list[float]
    invalidation: float | None
    waiting_for: list[str]
    reasons: list[str]

def evaluate(df: pd.DataFrame, higher_bias: str) -> StrategyResult:
    ind = compute_indicators(df)
    price = float(df.close.iloc[-1])
    atr = ind.get("atr")
    poc = ind.get("poc")
    ema20 = ind.get("ema20")
    ema50 = ind.get("ema50")
    reasons, waiting = [], []
    score = 0.0
    direction = "NEUTRAL"
    if higher_bias in {"BULLISH", "BEARISH"}:
        direction = higher_bias
        score += 20
        reasons.append(f"Higher-timeframe bias is {higher_bias}.")
    if ema20 and ema50:
        aligned = (direction == "BULLISH" and ema20 > ema50) or (direction == "BEARISH" and ema20 < ema50)
        if aligned:
            score += 20
            reasons.append("Execution timeframe EMA alignment agrees with the higher-timeframe bias.")
        else:
            waiting.append("EMA alignment with higher-timeframe bias.")
    if poc is not None:
        distance = abs(price - poc)
        if atr and distance <= atr:
            score += 20
            reasons.append("Price is near the volume-profile POC.")
        else:
            waiting.append("A pullback toward the POC.")
    if len(df) >= 10:
        recent = df.tail(10)
        broke_up = float(recent.close.iloc[-1]) > float(recent.high.iloc[:-1].max())
        broke_down = float(recent.close.iloc[-1]) < float(recent.low.iloc[:-1].min())
        breakout = (direction == "BULLISH" and broke_up) or (direction == "BEARISH" and broke_down)
        if breakout:
            score += 20
            reasons.append("Recent price action shows a directional range break.")
        else:
            waiting.append("Confirmed breakout/continuation structure.")
    if atr and atr > 0:
        score += 20
    confirmed = score >= 70 and not waiting
    entry = price if confirmed else None
    if confirmed and atr:
        risk = 1.25 * atr
        stop = price - risk if direction == "BULLISH" else price + risk
        targets = [price + 2*risk, price + 3*risk] if direction == "BULLISH" else [price - 2*risk, price - 3*risk]
    else:
        stop, targets = None, []
    return StrategyResult("CONFIRMED" if confirmed else ("PULLBACK" if poc is not None else "WAITING"), direction, confirmed, min(score,100), entry, stop, targets, stop, waiting, reasons)
