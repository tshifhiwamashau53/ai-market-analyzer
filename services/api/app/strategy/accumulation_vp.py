from dataclasses import dataclass
import numpy as np
import pandas as pd
from app.indicators.technical import compute_indicators

@dataclass
class StrategyResult:
    stage: str
    direction: str
    confirmed: bool
    score: float
    entry: float | None
    planned_entry: float | None
    stop_loss: float | None
    targets: list[float]
    invalidation: float | None
    risk_reward: float | None
    waiting_for: list[str]
    reasons: list[str]
    range_high: float | None = None
    range_low: float | None = None
    poc: float | None = None

def _atr(df: pd.DataFrame, n: int = 14) -> float:
    h, l, c = df.high.astype(float), df.low.astype(float), df.close.astype(float)
    tr = pd.concat([h-l, (h-c.shift()).abs(), (l-c.shift()).abs()], axis=1).max(axis=1)
    v = tr.rolling(n).mean().iloc[-1]
    return float(v) if pd.notna(v) and v > 0 else max(float((h-l).tail(10).mean()), 1e-9)

def _poc(df: pd.DataFrame, lookback: int = 50, bins: int = 32) -> float | None:
    d = df.tail(min(lookback, len(df)))
    if d.empty or float(d.high.max()) <= float(d.low.min()):
        return None
    lo, hi = float(d.low.min()), float(d.high.max())
    typical = ((d.high + d.low + d.close) / 3).to_numpy()
    volume = d.volume.astype(float).clip(lower=0).to_numpy()
    if volume.sum() <= 0:
        volume = np.ones_like(typical)
    edges = np.linspace(lo, hi, bins + 1)
    bucket = np.clip(np.digitize(typical, edges) - 1, 0, bins - 1)
    profile = np.bincount(bucket, weights=volume, minlength=bins)
    i = int(profile.argmax())
    return float((edges[i] + edges[i+1]) / 2)

def evaluate(df: pd.DataFrame, higher_bias: str) -> StrategyResult:
    if len(df) < 60:
        return StrategyResult("INSUFFICIENT_DATA", "NEUTRAL", False, 0, None, None, None, [], None, None,
                              ["At least 60 bars are required for the strategy state machine."], [])

    d = df.astype(float).copy()
    price = float(d.close.iloc[-1])
    atr = _atr(d)
    poc = _poc(d)
    ind = compute_indicators(d)
    ema20, ema50 = ind.get("ema20"), ind.get("ema50")

    lookback = min(48, len(d) - 2)
    base = d.iloc[-lookback-1:-1]
    range_high, range_low = float(base.high.max()), float(base.low.min())
    width = range_high - range_low
    recent_atr = d.high.sub(d.low).tail(20).mean()
    accumulation = width <= max(6 * atr, 1.8 * recent_atr)

    volume = d.volume.astype(float)
    volume_available = volume.tail(20).sum() > 0
    avg_volume = float(volume.tail(20).iloc[:-1].mean()) if volume_available else 0
    last_volume = float(volume.iloc[-1])
    volume_confirmed = (not volume_available) or last_volume >= avg_volume * 1.10

    bullish_breakout = price > range_high + 0.10 * atr
    bearish_breakout = price < range_low - 0.10 * atr
    breakout_dir = "BULLISH" if bullish_breakout else "BEARISH" if bearish_breakout else "NEUTRAL"

    recent = d.tail(14)
    prior = d.iloc[-15:-1] if len(d) >= 15 else d.iloc[:-1]
    prior_high, prior_low = float(prior.high.max()), float(prior.low.min())
    recent_breakout = "BULLISH" if float(recent.close.max()) > prior_high + 0.10*atr else "BEARISH" if float(recent.close.min()) < prior_low - 0.10*atr else "NEUTRAL"

    direction = higher_bias if higher_bias in {"BULLISH", "BEARISH"} else breakout_dir
    if direction == "NEUTRAL":
        direction = recent_breakout

    aligned = direction in {"BULLISH", "BEARISH"} and (
        (direction == "BULLISH" and ema20 and ema50 and ema20 > ema50) or
        (direction == "BEARISH" and ema20 and ema50 and ema20 < ema50)
    )

    breakout = breakout_dir == direction or recent_breakout == direction
    poc_near = poc is not None and abs(price - poc) <= 0.85 * atr
    pullback = breakout and poc_near
    continuation = (
        (direction == "BULLISH" and price > float(d.close.iloc[-2]) and price > float(d.high.iloc[-2])) or
        (direction == "BEARISH" and price < float(d.close.iloc[-2]) and price < float(d.low.iloc[-2]))
    )

    score = 0.0
    reasons, waiting = [], []
    if higher_bias == direction and direction != "NEUTRAL":
        score += 25; reasons.append(f"4H higher-timeframe bias is {direction}.")
    else:
        waiting.append("Higher-timeframe directional bias.")
    if accumulation:
        score += 15; reasons.append("Recent range shows volatility compression consistent with accumulation.")
    else:
        waiting.append("A defined accumulation/range before the breakout.")
    if breakout and volume_confirmed:
        score += 20; reasons.append("Directional breakout is present with volume confirmation.")
    else:
        waiting.append("A confirmed breakout with supporting volume.")
    if pullback:
        score += 20; reasons.append("Price has returned close to the volume-profile POC after the breakout.")
    else:
        waiting.append("A pullback toward the POC after the breakout.")
    if continuation and aligned:
        score += 20; reasons.append("Continuation price action and EMA structure agree with the bias.")
    else:
        waiting.append("Continuation confirmation aligned with the higher-timeframe bias.")

    confirmed = score >= 80 and breakout and pullback and continuation and aligned
    planned_entry = poc if poc is not None else (range_high if direction == "BULLISH" else range_low) if direction != "NEUTRAL" else None
    entry = price if confirmed else None

    stop = None
    targets: list[float] = []
    rr = None
    if confirmed and direction in {"BULLISH", "BEARISH"}:
        swing = float(d.low.tail(8).min()) if direction == "BULLISH" else float(d.high.tail(8).max())
        stop = min(swing, poc or swing) - 0.25*atr if direction == "BULLISH" else max(swing, poc or swing) + 0.25*atr
        risk = abs(entry - stop)
        if risk < 0.5 * atr:
            stop = entry - 0.75*atr if direction == "BULLISH" else entry + 0.75*atr
            risk = abs(entry - stop)
        targets = [entry + risk*n if direction == "BULLISH" else entry - risk*n for n in (1,2,3)]
        rr = 3.0
    stage = "CONFIRMED" if confirmed else "CONTINUATION" if breakout and pullback else "PULLBACK_TO_POC" if breakout else "BREAKOUT" if accumulation else "ACCUMULATION" if accumulation else "WAITING"
    return StrategyResult(stage, direction or "NEUTRAL", confirmed, min(score,100), entry, planned_entry,
                          stop, targets, stop, rr, waiting if not confirmed else [], reasons,
                          range_high, range_low, poc)
