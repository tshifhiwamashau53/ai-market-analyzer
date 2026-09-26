import pandas as pd
import numpy as np

def _last(s):
    v=s.iloc[-1] if len(s) else np.nan
    return None if pd.isna(v) else float(v)

def compute_indicators(df):
    close=df["close"].astype(float); high=df["high"].astype(float); low=df["low"].astype(float); volume=df["volume"].astype(float)
    ema20=close.ewm(span=20,adjust=False).mean(); ema50=close.ewm(span=50,adjust=False).mean()
    delta=close.diff(); gain=delta.clip(lower=0).rolling(14).mean(); loss=(-delta.clip(upper=0)).rolling(14).mean()
    rs=gain/loss.replace(0,np.nan); rsi=100-(100/(1+rs))
    tr=pd.concat([high-low,(high-close.shift()).abs(),(low-close.shift()).abs()],axis=1).max(axis=1); atr=tr.rolling(14).mean()
    fast=close.ewm(span=12,adjust=False).mean(); slow=close.ewm(span=26,adjust=False).mean(); macd=fast-slow; signal=macd.ewm(span=9,adjust=False).mean()
    typical=(high+low+close)/3; vwap=(typical*volume).cumsum()/volume.replace(0,np.nan).cumsum()
    return {"ema20":_last(ema20),"ema50":_last(ema50),"rsi":_last(rsi),"macd":_last(macd),"macd_signal":_last(signal),"atr":_last(atr),"vwap":_last(vwap)}
