import pandas as pd

def swing_levels(df: pd.DataFrame, window: int = 5) -> dict:
    if len(df) < window * 2 + 1:
        return {"swing_high": None, "swing_low": None}
    highs = df["high"].rolling(window * 2 + 1, center=True).max()
    lows = df["low"].rolling(window * 2 + 1, center=True).min()
    swing_highs = df.loc[df["high"].eq(highs), "high"].dropna()
    swing_lows = df.loc[df["low"].eq(lows), "low"].dropna()
    return {
        "swing_high": float(swing_highs.iloc[-1]) if len(swing_highs) else None,
        "swing_low": float(swing_lows.iloc[-1]) if len(swing_lows) else None,
    }

def structure_state(df: pd.DataFrame) -> str:
    if len(df) < 20:
        return "UNKNOWN"
    recent = df.tail(20)
    midpoint = float(recent["close"].iloc[:-1].mean())
    close = float(recent["close"].iloc[-1])
    return "BULLISH" if close > midpoint else "BEARISH" if close < midpoint else "NEUTRAL"
