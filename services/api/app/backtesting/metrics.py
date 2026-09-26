import numpy as np
import pandas as pd

def performance(returns:pd.Series)->dict:
    r=pd.Series(returns).dropna().astype(float)
    equity=(1+r).cumprod()
    total=float(equity.iloc[-1]-1) if len(equity) else 0.0
    drawdown=equity/equity.cummax()-1 if len(equity) else pd.Series(dtype=float)
    max_dd=float(drawdown.min()) if len(drawdown) else 0.0
    sharpe=float(r.mean()/r.std()*np.sqrt(252)) if len(r)>1 and r.std()>0 else 0.0
    return {"total_return":total,"max_drawdown":max_dd,"sharpe":sharpe,"observations":int(len(r))}
