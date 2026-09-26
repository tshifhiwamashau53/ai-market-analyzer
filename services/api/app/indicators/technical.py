import numpy as np
import pandas as pd

def _last(s):
    v = s.iloc[-1] if len(s) else np.nan
    return None if pd.isna(v) else float(v)

def compute_indicators(df):
    close=df["close"].astype(float); high=df["high"].astype(float); low=df["low"].astype(float); volume=df["volume"].astype(float)
    ema20=close.ewm(span=20,adjust=False).mean()
    ema50=close.ewm(span=50,adjust=False).mean()
    delta=close.diff()
    gain=delta.clip(lower=0).rolling(14).mean()
    loss=(-delta.clip(upper=0)).rolling(14).mean()
    rs=gain/loss.replace(0,np.nan)
    rsi=100-(100/(1+rs))
    tr=pd.concat([high-low,(high-close.shift()).abs(),(low-close.shift()).abs()],axis=1).max(axis=1)
    atr=tr.rolling(14).mean()
    fast=close.ewm(span=12,adjust=False).mean()
    slow=close.ewm(span=26,adjust=False).mean()
    macd=fast-slow
    signal=macd.ewm(span=9,adjust=False).mean()
    typical=(high+low+close)/3
    cumulative_volume=volume.replace(0,np.nan).cumsum()
    vwap=(typical*volume).cumsum()/cumulative_volume
    lookback=min(50,len(df))
    support=float(low.tail(lookback).min()) if lookback else None
    resistance=float(high.tail(lookback).max()) if lookback else None
    lo=float(low.tail(lookback).min()) if lookback else 0
    hi=float(high.tail(lookback).max()) if lookback else 0
    poc=None
    if hi>lo:
        edges=np.linspace(lo,hi,33)
        typical_values=typical.tail(lookback).to_numpy()
        weights=volume.tail(lookback).clip(lower=0).to_numpy()
        if weights.sum()<=0: weights=np.ones_like(typical_values)
        buckets=np.clip(np.digitize(typical_values,edges)-1,0,31)
        profile=np.bincount(buckets,weights=weights,minlength=32)
        i=int(profile.argmax())
        poc=float((edges[i]+edges[i+1])/2)
    return {
        "ema20":_last(ema20),"ema50":_last(ema50),"rsi":_last(rsi),
        "macd":_last(macd),"macd_signal":_last(signal),"atr":_last(atr),
        "vwap":_last(vwap),"poc":poc,"support":support,"resistance":resistance
    }
