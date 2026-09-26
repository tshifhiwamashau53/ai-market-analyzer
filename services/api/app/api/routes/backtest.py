from fastapi import APIRouter,HTTPException
from app.data.providers.yahoo import YahooFinanceProvider
from app.backtesting.strategy import ema_strategy
from app.backtesting.metrics import performance
router=APIRouter(prefix="/backtest",tags=["backtest"])
provider=YahooFinanceProvider()

@router.get("/{symbol}")
async def backtest(symbol:str,period:str="2y",interval:str="1d"):
    try: df=await provider.history(symbol.upper(),period,interval)
    except Exception as e: raise HTTPException(502,str(e))
    returns=ema_strategy(df).dropna()
    return {"symbol":symbol.upper(),"period":period,"interval":interval,"strategy":"EMA20/EMA50","metrics":performance(returns)}
