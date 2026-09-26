from dataclasses import dataclass
import numpy as np
import pandas as pd

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
    risk_reward: float | None = None
    planned_entry: float | None = None
    range_high: float | None = None
    range_low: float | None = None
    poc: float | None = None
    breakout_level: float | None = None

def _atr(df: pd.DataFrame, n: int = 14) -> float | None:
    h, l, c = df.high.astype(float), df.low.astype(float), df.close.astype(float)
    tr = pd.concat([h-l, (h-c.shift()).abs(), (l-c.shift()).abs()], axis=1).max(axis=1)
    v = tr.rolling(n).mean().iloc[-1]
    return None if pd.isna(v) else float(v)

def _poc(df: pd.DataFrame, bins: int = 32) -> float | None:
    d = df[["low","high","close","volume"]].astype(float).dropna()
    if d.empty: return None
    lo, hi = float(d.low.min()), float(d.high.max())
    if hi <= lo: return float(d.close.iloc[-1])
    typical = (d.low+d.high+d.close)/3
    weights = d.volume.clip(lower=0)
    if float(weights.sum()) <= 0: weights = pd.Series(1.0,index=d.index)
    edges = np.linspace(lo,hi,bins+1)
    bucket = np.clip(np.digitize(typical,edges)-1,0,bins-1)
    profile = np.bincount(bucket,weights=weights.to_numpy(),minlength=bins)
    i = int(profile.argmax())
    return float((edges[i]+edges[i+1])/2)

def _swings(df: pd.DataFrame, n: int = 8):
    d=df.tail(n)
    return float(d.high.max()),float(d.low.min())

def evaluate(df: pd.DataFrame, higher_bias: str) -> StrategyResult:
    if len(df) < 60:
        return StrategyResult("INSUFFICIENT_DATA","NEUTRAL",False,0,None,None,[],None,
            ["At least 60 execution-timeframe candles are required."],["More market history"])
    frame=df.astype(float).copy()
    price=float(frame.close.iloc[-1]); atr=_atr(frame)
    if atr is None or atr<=0:
        return StrategyResult("WAITING","NEUTRAL",False,0,None,None,[],None,
            ["ATR is not available yet."],["Valid ATR"])
    lookback=min(48,len(frame)-12)
    base=frame.iloc[-(lookback+12):-12]
    range_high=float(base.high.max()); range_low=float(base.low.min())
    range_width=range_high-range_low
    tr=pd.concat([frame.high-frame.low,(frame.high-frame.close.shift()).abs(),
                  (frame.low-frame.close.shift()).abs()],axis=1).max(axis=1)
    median_atr=float(tr.rolling(14).mean().tail(lookback).median())
    accumulation=range_width<=max(6*atr,1.8*median_atr) if median_atr>0 else range_width<=6*atr
    poc=_poc(base)
    recent=frame.tail(14)
    breakout_up=float(recent.close.max())>range_high+0.10*atr
    breakout_down=float(recent.close.min())<range_low-0.10*atr
    volume_mean=float(frame.volume.tail(21).iloc[:-1].mean()) if len(frame)>=22 else 0
    current_volume=float(frame.volume.iloc[-1])
    volume_available=volume_mean>0 and current_volume>0
    volume_confirmed=(current_volume>=1.10*volume_mean) if volume_available else True
    bullish=higher_bias=="BULLISH"; bearish=higher_bias=="BEARISH"
    direction="BULLISH" if bullish else "BEARISH" if bearish else "NEUTRAL"
    directional_breakout=(bullish and breakout_up) or (bearish and breakout_down)
    pullback=False
    if poc is not None:
        pullback=abs(price-poc)<=max(.75*atr,.006*max(price,1))
        if directional_breakout and bullish: pullback=pullback and price>=poc
        if directional_breakout and bearish: pullback=pullback and price<=poc
    last,prev=frame.iloc[-1],frame.iloc[-2]
    continuation=(bullish and float(last.close)>float(prev.high)) or (bearish and float(last.close)<float(prev.low))
    score=0.0; reasons=[]; waiting=[]
    if direction!="NEUTRAL": score+=20; reasons.append(f"Higher-timeframe bias is {direction}.")
    else: waiting.append("A directional higher-timeframe bias.")
    if accumulation: score+=15; reasons.append("Recent price action shows a compressed accumulation range.")
    else: waiting.append("A tighter accumulation/range contraction before the breakout.")
    if directional_breakout: score+=20; reasons.append("Price has broken the accumulation range in the higher-timeframe direction.")
    else: waiting.append("A confirmed directional breakout of the accumulation range.")
    if directional_breakout and volume_confirmed:
        score+=10; reasons.append("Breakout volume is above the recent volume baseline." if volume_available else "Breakout confirmed without usable volume data.")
    else: waiting.append("Breakout volume confirmation.")
    if pullback: score+=20; reasons.append("Price has returned toward the volume-profile POC after the breakout.")
    else: waiting.append("A pullback toward the post-breakout POC.")
    if continuation: score+=15; reasons.append("Current price action confirms continuation in the selected direction.")
    else: waiting.append("A continuation candle/structure confirmation from the POC area.")
    confirmed=score>=80 and directional_breakout and pullback and continuation and direction!="NEUTRAL"
    swing_high,swing_low=_swings(frame)
    planned_entry=poc if poc is not None else (range_high if bullish else range_low if bearish else None)
    entry=price if confirmed else None; stop=None; targets=[]; rr=None
    if confirmed:
        if bullish:
            stop=min(swing_low,poc if poc is not None else swing_low)-.25*atr
            risk=max(entry-stop,.75*atr); stop=entry-risk
            targets=[entry+risk,entry+2*risk,entry+3*risk]
        else:
            stop=max(swing_high,poc if poc is not None else swing_high)+.25*atr
            risk=max(stop-entry,.75*atr); stop=entry+risk
            targets=[entry-risk,entry-2*risk,entry-3*risk]
        rr=1.0
    if confirmed: stage="CONTINUATION_CONFIRMED"
    elif directional_breakout and not pullback: stage="WAITING_FOR_PULLBACK_TO_POC"
    elif directional_breakout and pullback and not continuation: stage="WAITING_FOR_CONTINUATION"
    elif accumulation: stage="ACCUMULATION"
    else: stage="WAITING_FOR_BREAKOUT"
    if not confirmed and planned_entry is not None:
        waiting.insert(0,f"Planned entry/reference is {planned_entry:.5f}; no signal is confirmed yet.")
    return StrategyResult(stage,direction,confirmed,min(score,100),entry,stop,targets,stop,
        list(dict.fromkeys(waiting)),reasons,rr,planned_entry,range_high,range_low,poc,
        range_high if bullish else range_low if bearish else None)
