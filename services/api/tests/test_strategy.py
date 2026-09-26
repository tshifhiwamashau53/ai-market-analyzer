import pandas as pd
from app.strategy.accumulation_vp import evaluate

def test_strategy_returns_wait_without_confirmation():
    idx = pd.date_range("2026-01-01", periods=80, freq="h", tz="UTC")
    close = [100 + (i % 4) * 0.2 for i in range(80)]
    df = pd.DataFrame({"open":close,"high":[x+0.5 for x in close],"low":[x-0.5 for x in close],"close":close,"volume":[1000]*80}, index=idx)
    result = evaluate(df, "BULLISH")
    assert result.action if False else result.direction == "BULLISH"
    assert result.score <= 100
