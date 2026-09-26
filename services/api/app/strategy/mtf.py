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
    d=df.tail(12)
    mid=len(d)//2
    first_high=float(d.high.iloc[:mid].max()); second_high=float(d.high.iloc[mid:].max())
    first_low=float(d.low.iloc[:mid].min()); second_low=float(d.low.iloc[mid:].min())
    if second_high>first_high and second_low>first_low:
        return "HIGHER_HIGH_HIGHER_LOW"
    if second_high<first_high and second_low<first_low:
        return "LOWER_HIGH_LOWER_LOW"
    return "RANGE"

def snapshot(df: pd.DataFrame, timeframe: str) -> Snapshot:
    ind=compute_indicators(df)
    price=float(df.close.iloc[-1])
    ema20,ema50=ind.get("ema20"),ind.get("ema50")
    structure=_structure(df)
    if structure=="HIGHER_HIGH_HIGHER_LOW":
        direction="BULLISH"
    elif structure=="LOWER_HIGH_LOWER_LOW":
        direction="BEARISH"
    elif ema20 is not None and ema50 is not None:
        direction="BULLISH" if ema20>ema50 else "BEARISH" if ema20<ema50 else "NEUTRAL"
    else:
        direction="NEUTRAL"
    if len(df)>=6:
        delta=float(df.close.iloc[-1]-df.close.iloc[-6])
        momentum="RISING" if delta>0 else "FALLING" if delta<0 else "FLAT"
    else:
        momentum="MIXED"
    return Snapshot(timeframe,direction,structure,momentum,price,ind)
