from fastapi import APIRouter, HTTPException
from app.data.providers.yahoo import YahooFinanceProvider
from app.backtesting.strategy import strategy_returns
from app.backtesting.metrics import performance

router = APIRouter(prefix="/backtest", tags=["backtest"])
provider = YahooFinanceProvider()

@router.get("/{symbol}")
async def backtest(symbol: str, period: str = "2y", interval: str = "1d"):
    try:
        df = await provider.history(symbol.upper(), period, interval)
    except Exception as exc:
        raise HTTPException(502, str(exc))
    returns = strategy_returns(df).dropna()
    metrics = performance(returns)
    wins = returns[returns > 0]
    losses = returns[returns < 0]
    metrics.update({
        "strategy": "Accumulation → VP/POC → breakout → pullback → continuation",
        "win_rate": float((returns > 0).mean()) if len(returns) else 0.0,
        "profit_factor": float(wins.sum() / abs(losses.sum())) if len(losses) and losses.sum() != 0 else 0.0,
        "expectancy": float(returns.mean()) if len(returns) else 0.0,
        "winning_trades": int(len(wins)),
        "losing_trades": int(len(losses)),
    })
    return {
        "symbol": symbol.upper(),
        "period": period,
        "interval": interval,
        "metrics": metrics,
        "validation_note": "Historical backtests are not guarantees of future performance; validate across regimes and out-of-sample periods.",
    }
