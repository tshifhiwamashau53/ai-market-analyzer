import pandas as pd
from app.indicators.technical import compute_indicators

def ema_strategy(df:pd.DataFrame)->pd.Series:
    close=df["close"].astype(float)
    ema20=close.ewm(span=20,adjust=False).mean()
    ema50=close.ewm(span=50,adjust=False).mean()
    signal=(ema20>ema50).astype(int).replace(0,-1)
    return close.pct_change().shift(-1)*signal
