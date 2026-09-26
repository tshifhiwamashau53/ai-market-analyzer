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

def _structure(df: pd.DataFrame) -> str:
    if len(df) < 12:
        return "INSUFFICIENT"
    h, l = df.high.astype(float), df.low.astype(float)
    sh = h.rolling(3, center=True).max().dropna()
    sl = l.rolling(3, center=True).min().dropna()
    highs = sh.tail(4).to_numpy()
    lows = sl.tail(4).to_numpy()
    if len(highs) >= 2 and len(lows) >= 2:
        if highs[-1] > highs[-2] and lows[-1] > lows[-2]: return "HH_HL"
        if highs[-1] < highs[-2] and lows[-1] < lows[-2]: return "LH_LL"
    return "RANGE"

def snapshot(df: pd.DataFrame, timeframe: str) -> Snapshot:
    ind = compute_indicators(df)
    price = float(df.close.iloc[-1])
    ema20, ema50 = ind.get("ema20"), ind.get("ema50")
    ema_dir = "BULLISH" if ema20 and ema50 and ema20 > ema50 else "BEARISH" if ema20 and ema50 and ema20 < ema50 else "NEUTRAL"
    structure = _structure(df)
    if structure == "HH_HL": direction = "BULLISH"
    elif structure == "LH_LL": direction = "BEARISH"
    else: direction = ema_dir
    delta = float(df.close.iloc[-1] - df.close.iloc[-6]) if len(df) >= 6 else 0
    momentum = "RISING" if delta > 0 else "FALLING" if delta < 0 else "FLAT"
    return Snapshot(timeframe, direction, structure, momentum, price, ind)
