from fastapi import APIRouter,HTTPException,Query
from app.config import get_settings
from app.data.cache import Cache
from app.data.providers.yahoo import YahooFinanceProvider
from app.schemas.market import Candle,MarketHistory,Quote
router=APIRouter(prefix="/market",tags=["market"])
provider=YahooFinanceProvider(); cache=Cache(get_settings().redis_url)

@router.get("/{symbol}/history",response_model=MarketHistory)
async def history(symbol:str,period:str=Query("6mo"),interval:str=Query("1d")):
    key="history:"+symbol.upper()+":"+period+":"+interval
    cached=await cache.get_json(key)
    if cached: return cached
    try: df=await provider.history(symbol.upper(),period,interval)
    except Exception as e: raise HTTPException(502,str(e))
    candles=[Candle(time=i.to_pydatetime(),open=float(r.open),high=float(r.high),low=float(r.low),close=float(r.close),volume=float(r.volume)) for i,r in df.iterrows()]
    result=MarketHistory(symbol=symbol.upper(),interval=interval,candles=candles,source="Yahoo Finance")
    await cache.set_json(key,result.model_dump(mode="json"),60)
    return result

@router.get("/{symbol}/quote",response_model=Quote)
async def quote(symbol:str):
    try: return await provider.quote(symbol.upper())
    except Exception as e: raise HTTPException(502,str(e))
