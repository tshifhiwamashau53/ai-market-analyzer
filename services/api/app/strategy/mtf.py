from dataclasses import dataclass
import pandas as pd
from app.indicators.technical import compute_indicators

@dataclass
class Snapshot:
    timeframe: str
    direction: str
    structure: str
    momentum: str
    price: float
    indicators: dict

def snapshot(df: pd.DataFrame, timeframe: str) -> Snapshot:
    ind = compute_indicators(df)
    price = float(df.close.iloc[-1])
    ema20, ema50 = ind.get("ema20"), ind.get("ema50")
    direction = "BULLISH" if ema20 and ema50 and ema20 > ema50 else "BEARISH" if ema20 and ema50 and ema20 < ema50 else "NEUTRAL"
    structure = direction
    if len(df) >= 6:
        delta = float(df.close.iloc[-1] - df.close.iloc[-6])
        momentum = "RISING" if delta > 0 else "FALLING" if delta < 0 else "FLAT"
    else:
        momentum = "MIXED"
    return Snapshot(timeframe, direction, structure, momentum, price, ind)
