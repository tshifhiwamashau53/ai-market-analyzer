import pandas as pd
from app.strategy.accumulation_vp import evaluate

def _frame(n=100):
    idx=pd.date_range("2026-01-01",periods=n,freq="h",tz="UTC")
    close=[100+(i%8)*0.2 for i in range(n)]
    return pd.DataFrame({
        "open":close,
        "high":[x+0.5 for x in close],
        "low":[x-0.5 for x in close],
        "close":close,
        "volume":[1000]*n,
    },index=idx)

def test_strategy_requires_history():
    result=evaluate(_frame(40),"BULLISH")
    assert result.stage=="INSUFFICIENT_DATA"
    assert not result.confirmed

def test_strategy_exposes_wait_state_and_reference():
    result=evaluate(_frame(),"BULLISH")
    assert result.direction=="BULLISH"
    assert 0<=result.score<=100
    assert isinstance(result.waiting_for,list)
    assert result.planned_entry is not None
    assert result.poc is not None

def test_strategy_never_confirms_without_direction():
    result=evaluate(_frame(),"NEUTRAL")
    assert result.direction=="NEUTRAL"
    assert not result.confirmed
    assert result.entry is None
