import asyncio
from datetime import datetime, timezone
import pandas as pd
import yfinance as yf
from .base import MarketDataProvider

class YahooFinanceProvider(MarketDataProvider):
    async def history(self, symbol: str, period: str = "6mo", interval: str = "1d") -> pd.DataFrame:
        def fetch():
            return yf.download(symbol, period=period, interval=interval, auto_adjust=False, progress=False)
        frame = await asyncio.to_thread(fetch)
        if frame.empty:
            raise ValueError(f"No market data returned for {symbol}")
        if isinstance(frame.columns, pd.MultiIndex):
            frame.columns = frame.columns.get_level_values(0)
        frame = frame.rename(columns={c: str(c).lower() for c in frame.columns})
        required = ["open", "high", "low", "close", "volume"]
        missing = [c for c in required if c not in frame.columns]
        if missing:
            raise ValueError(f"Missing market columns: {missing}")
        frame = frame[required].dropna().copy()
        frame.index = pd.to_datetime(frame.index, utc=True)
        return frame

    async def quote(self, symbol: str) -> dict:
        def fetch():
            ticker = yf.Ticker(symbol)
            return ticker.fast_info
        info = await asyncio.to_thread(fetch)
        price = float(info.last_price)
        previous = float(info.previous_close) if info.previous_close else None
        change = price - previous if previous else None
        return {
            "symbol": symbol.upper(),
            "price": price,
            "change": change,
            "change_percent": (change / previous * 100) if change is not None and previous else None,
            "timestamp": datetime.now(timezone.utc),
        }
