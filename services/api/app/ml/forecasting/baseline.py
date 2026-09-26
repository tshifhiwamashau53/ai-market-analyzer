from datetime import datetime,timedelta,timezone
import numpy as np

def baseline_forecast(df,horizon=7):
    close=df["close"].astype(float).dropna(); last=float(close.iloc[-1])
    returns=close.pct_change().dropna(); drift=float(returns.tail(30).mean()) if len(returns) else 0.0
    vol=float(returns.tail(60).std()) if len(returns)>2 else 0.0
    points=[]
    for i in range(1,horizon+1):
        value=last*((1+drift)**i); width=last*max(vol,0.001)*(i**0.5)
        points.append({"time":datetime.now(timezone.utc)+timedelta(days=i),"value":value,"lower":max(0,value-width),"upper":value+width})
    return points
