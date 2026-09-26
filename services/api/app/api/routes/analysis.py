from fastapi import APIRouter,HTTPException
from app.data.providers.yahoo import YahooFinanceProvider
from app.indicators.technical import compute_indicators
from app.ml.forecasting.baseline import baseline_forecast
from app.schemas.market import AnalysisResponse,MarketAnalysisRequest,IndicatorSnapshot
router=APIRouter(prefix="/analysis",tags=["analysis"])
provider=YahooFinanceProvider()

@router.post("",response_model=AnalysisResponse)
async def analyze(req:MarketAnalysisRequest):
    try: df=await provider.history(req.symbol.upper(),req.period,req.interval)
    except Exception as e: raise HTTPException(502,str(e))
    ind=compute_indicators(df); last=float(df.close.iloc[-1]); ema20=ind.get("ema20") or last; ema50=ind.get("ema50") or last
    direction="BULLISH" if ema20>ema50 else "BEARISH" if ema20<ema50 else "NEUTRAL"
    action="BUY" if direction=="BULLISH" else "SELL" if direction=="BEARISH" else "WAIT"
    atr=ind.get("atr"); entry=last
    if action=="BUY" and atr: stop=last-1.5*atr; target=last+3*atr
    elif action=="SELL" and atr: stop=last+1.5*atr; target=last-3*atr
    else: stop=target=None
    confidence=min(0.95,max(0.5,0.5+abs(ema20-ema50)/last*10)) if last else 0.5
    return AnalysisResponse(symbol=req.symbol.upper(),current_price=last,direction=direction,action=action,confidence=confidence,setup="EMA_TREND_BASELINE",entry=entry if action!="WAIT" else None,stop_loss=stop,take_profit=target,invalidation=stop,indicators=IndicatorSnapshot(**ind),prediction=baseline_forecast(df),sentiment={"status":"not_configured"},reasons=["EMA20/EMA50 trend alignment","Baseline forecast is statistical, not a trained neural model"],risk_notes=["Validate with out-of-sample backtesting before relying on the signal."])
