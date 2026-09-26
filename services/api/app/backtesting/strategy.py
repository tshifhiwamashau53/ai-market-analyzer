import pandas as pd
from app.strategy.accumulation_vp import evaluate

def strategy_returns(df: pd.DataFrame, window: int = 180) -> pd.Series:
    prices = df.astype(float).reset_index(drop=True)
    returns = []
    i = max(80, 60)
    while i < len(prices) - 1:
        window_df = prices.iloc[max(0, i-window):i].copy()
        close = window_df.close
        ema20 = close.ewm(span=20, adjust=False).mean().iloc[-1]
        ema50 = close.ewm(span=50, adjust=False).mean().iloc[-1]
        bias = "BULLISH" if ema20 > ema50 else "BEARISH" if ema20 < ema50 else "NEUTRAL"
        result = evaluate(window_df, bias)
        if not result.confirmed or result.entry is None or result.stop_loss is None or not result.targets:
            i += 1
            continue
        entry = float(prices.close.iloc[i])
        stop = float(result.stop_loss)
        target = float(result.targets[1]) if len(result.targets) > 1 else float(result.targets[0])
        direction = result.direction
        exit_price = None
        j = i + 1
        while j < len(prices):
            bar = prices.iloc[j]
            if direction == "BULLISH":
                if float(bar.low) <= stop:
                    exit_price = stop
                    break
                if float(bar.high) >= target:
                    exit_price = target
                    break
            else:
                if float(bar.high) >= stop:
                    exit_price = stop
                    break
                if float(bar.low) <= target:
                    exit_price = target
                    break
            j += 1
        if exit_price is None:
            break
        ret = (exit_price-entry)/entry if direction == "BULLISH" else (entry-exit_price)/entry
        returns.append(ret)
        i = max(j + 1, i + 1)
    return pd.Series(returns, dtype=float)
