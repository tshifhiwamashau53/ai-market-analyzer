import asyncio
from datetime import datetime, timezone
import pandas as pd
import yfinance as yf
from .base import MarketDataProvider

SYMBOL_MAP = {
    "XAUUSD": "GC=F",
    "XAUUSDm": "GC=F",
    "GOLD": "GC=F",
    "BTCUSD": "BTC-USD",
    "BTCUSDm": "BTC-USD",
    "EURUSD": "EURUSD=X",
    "EURUSDm": "EURUSD=X",
    "US30": "^DJI",
    "DJI": "^DJI",
}

def provider_symbol(symbol: str) -> str:
    value = symbol.strip().upper()
    return SYMBOL_MAP.get(value, value)

class YahooFinanceProvider(MarketDataProvider):
    async def history(self, symbol: str, period: str = "6mo", interval: str = "1d") -> pd.DataFrame:
        requested = symbol.upper()
        resolved = provider_symbol(requested)

        def fetch():
            return yf.download(
                resolved,
                period=period,
                interval=interval,
                auto_adjust=False,
                progress=False,
                threads=False,
            )

        frame = await asyncio.to_thread(fetch)
        if frame.empty:
            raise ValueError(f"No market data returned for {requested} (provider symbol: {resolved})")

        if isinstance(frame.columns, pd.MultiIndex):
            frame.columns = frame.columns.get_level_values(0)

        frame = frame.rename(columns={c: str(c).lower() for c in frame.columns})
        required = ["open", "high", "low", "close", "volume"]
        missing = [c for c in required if c not in frame.columns]
        if missing:
            raise ValueError(f"Missing market columns for {requested}: {missing}")

        frame = frame[required].dropna().copy()
        frame.index = pd.to_datetime(frame.index, utc=True)
        frame = frame[~frame.index.duplicated(keep="last")].sort_index()
        frame.attrs["requested_symbol"] = requested
        frame.attrs["provider_symbol"] = resolved
        return frame

    async def quote(self, symbol: str) -> dict:
        requested = symbol.upper()
        resolved = provider_symbol(requested)

        def fetch():
            ticker = yf.Ticker(resolved)
            return ticker.fast_info

        info = await asyncio.to_thread(fetch)
        price = float(info.last_price)
        previous = float(info.previous_close) if info.previous_close else None
        change = price - previous if previous else None

        return {
            "symbol": requested,
            "provider_symbol": resolved,
            "price": price,
            "change": change,
            "change_percent": (change / previous * 100) if change is not None and previous else None,
            "timestamp": datetime.now(timezone.utc),
        }
