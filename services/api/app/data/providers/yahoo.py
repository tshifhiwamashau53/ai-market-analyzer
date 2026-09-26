import asyncio
from datetime import datetime, timezone
import pandas as pd
import yfinance as yf
from .base import MarketDataProvider

SYMBOL_MAP={"XAUUSD":"GC=F","XAUUSDm":"GC=F","GOLD":"GC=F","BTCUSD":"BTC-USD","BTCUSDm":"BTC-USD","EURUSD":"EURUSD=X","EURUSDm":"EURUSD=X","US30":"^DJI","DJI":"^DJI"}
INTRADAY_LIMITS={"1m":7,"2m":60,"5m":60,"15m":60,"30m":60,"60m":730,"90m":60}

def provider_symbol(symbol:str)->str:
    return SYMBOL_MAP.get(symbol.strip().upper(),symbol.strip().upper())

def _validate_period_interval(period:str,interval:str):
    if interval not in {"1m","2m","5m","15m","30m","60m","90m","1h","1d","5d","1wk","1mo","3mo"}:
        raise ValueError(f"Unsupported interval: {interval}")
    days=INTRADAY_LIMITS.get(interval)
    if days and period.endswith("d"):
        try:
            if int(period[:-1])>days: raise ValueError(f"Yahoo Finance limits {interval} history to about {days} days.")
        except ValueError as exc:
            if str(exc).startswith("Yahoo Finance"): raise
    if interval in {"5m","15m","30m","60m","90m","1h"} and period in {"1y","2y","5y","10y","max"}:
        raise ValueError(f"Yahoo Finance does not provide {interval} history for {period}; choose a shorter period.")

class YahooFinanceProvider(MarketDataProvider):
    async def history(self,symbol:str,period:str="6mo",interval:str="1d")->pd.DataFrame:
        requested=symbol.upper().strip(); resolved=provider_symbol(requested); _validate_period_interval(period,interval)
        actual_interval="60m" if interval=="1h" else interval
        def fetch():
            return yf.download(resolved,period=period,interval=actual_interval,auto_adjust=False,progress=False,threads=False)
        frame=await asyncio.to_thread(fetch)
        if frame.empty: raise ValueError(f"No market data returned for {requested} (provider symbol: {resolved}).")
        if isinstance(frame.columns,pd.MultiIndex): frame.columns=frame.columns.get_level_values(0)
        frame=frame.rename(columns={c:str(c).lower() for c in frame.columns})
        required=["open","high","low","close","volume"]; missing=[c for c in required if c not in frame.columns]
        if missing: raise ValueError(f"Missing market columns for {requested}: {missing}")
        frame=frame[required].dropna().copy(); frame.index=pd.to_datetime(frame.index,utc=True)
        frame=frame[~frame.index.duplicated(keep="last")].sort_index()
        frame.attrs["requested_symbol"]=requested; frame.attrs["provider_symbol"]=resolved; frame.attrs["data_source"]="Yahoo Finance"
        return frame

    async def quote(self,symbol:str)->dict:
        requested=symbol.upper().strip(); resolved=provider_symbol(requested)
        def fetch(): return yf.Ticker(resolved).fast_info
        info=await asyncio.to_thread(fetch); price=float(info.last_price); previous=float(info.previous_close) if info.previous_close else None
        change=price-previous if previous else None
        return {"symbol":requested,"provider_symbol":resolved,"price":price,"change":change,"change_percent":(change/previous*100) if change is not None and previous else None,"timestamp":datetime.now(timezone.utc)}
