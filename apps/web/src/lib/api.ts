export type ApiCandle={time:string;open:number;high:number;low:number;close:number;volume:number};
export type MarketHistory={symbol:string;interval:string;candles:ApiCandle[];source:string};
export type Analysis={
 symbol:string;current_price:number;direction:string;action:string;confidence:number;setup:string;
 entry:number|null;stop_loss:number|null;take_profit:number|null;invalidation:number|null;
 indicators:Record<string,number|null>;prediction:{time:string;value:number;lower:number|null;upper:number|null}[];
 sentiment:Record<string,unknown>;reasons:string[];risk_notes:string[];
 higher_timeframe_bias?:string; waiting_for?:string;
};

const base=(process.env.NEXT_PUBLIC_API_URL||"").replace(/\/$/,"");

async function request(path:string,init?:RequestInit){
 const r=await fetch(base+path,{...init,cache:"no-store"});
 if(!r.ok) throw new Error((await r.text())||("API "+r.status));
 return r.json();
}

async function vercelMarket(symbol:string,interval:string,limit=220){
 return request("/api/market-data?asset="+encodeURIComponent(symbol)+"&interval="+encodeURIComponent(interval)+"&limit="+limit);
}

function normalizeMarket(raw:any,symbol:string,interval:string):MarketHistory{
 return {
  symbol,
  interval,
  source:raw.provider||"Market data provider",
  candles:Array.isArray(raw.candles)?raw.candles:[]
 };
}

export const marketHistory=async(symbol:string,period="6mo",interval="1d"):Promise<MarketHistory>=>{
 if(base) return request("/market/"+encodeURIComponent(symbol)+"/history?period="+period+"&interval="+interval);
 const raw=await vercelMarket(symbol,interval==="1d"?"1h":interval);
 return normalizeMarket(raw,symbol,interval);
};

function localAnalysis(m:any,symbol:string,tf:string):Analysis{
 const i=m?.indicators||{};
 const price=Number(m?.price)||0;
 const direction=i.structure==="BULLISH"?"BULLISH":i.structure==="BEARISH"?"BEARISH":"NEUTRAL";
 const atr=Number(i.atr14);
 const actionable=Number.isFinite(atr)&&atr>0&&direction!=="NEUTRAL";
 const entry=actionable?price:null;
 const stop=actionable?(direction==="BULLISH"?price-1.25*atr:price+1.25*atr):null;
 const target=actionable?(direction==="BULLISH"?price+2.5*atr:price-2.5*atr):null;
 return {
  symbol,current_price:price,direction,action:actionable?(direction==="BULLISH"?"BUY":"SELL"):"WAIT",
  confidence:Math.min(0.95,Math.max(0.5,0.5+(Number.isFinite(Number(i.ema20))&&Number.isFinite(Number(i.ema50))?Math.min(0.35,Math.abs(i.ema20-i.ema50)/Math.max(price,1)*10):0))),
  setup:"LOCAL_TECHNICAL_BASELINE",entry,stop_loss:stop,take_profit:target,invalidation:stop,
  indicators:{ema20:i.ema20??null,ema50:i.ema50??null,rsi:i.rsi14??null,atr:i.atr14??null,vwap:i.vwap??null,poc:i.poc??null},
  prediction:[],sentiment:{status:"Vercel local mode"},reasons:[i.structure||"No structure","Real market data supplied by the Vercel market-data route."],
  risk_notes:["Analysis is informational. Validate the strategy with out-of-sample testing."]
 };
}

export const analyzeMarket=async(symbol:string,period="6mo",interval="15m"):Promise<Analysis>=>{
 if(base) return request("/analysis",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol,period,interval,depth:"deep"})});
 const timeframes=["4h","1h","15m","5m"];
 const raws=await Promise.all(timeframes.map(tf=>vercelMarket(symbol,tf,220)));
 const markets=Object.fromEntries(timeframes.map((tf,i)=>[tf,raws[i]]));
 const response=await request("/api/analyze",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({asset:symbol.toUpperCase(),timeframe:interval,depth:"deep",markets})
 });
 if(!response?.available&&response?.mode==="LOCAL") return localAnalysis(markets[interval]||markets["15m"],symbol,interval);
 const a=response.analysis||{};
 const current=Number(markets[interval]?.price||markets["15m"]?.price||0);
 const ind=markets[interval]?.indicators||markets["15m"]?.indicators||{};
 const targets=Array.isArray(a.target_levels)?a.target_levels:[];
 return {
  symbol:symbol.toUpperCase(),current_price:current,
  direction:a.market_state||"NEUTRAL",action:a.action_state==="BUY AREA"?"BUY":a.action_state==="SELL AREA"?"SELL":"WAIT",
  confidence:Math.max(0,Math.min(1,Number(a.analysis_quality||0)/100)),
  setup:a.setup_stage||"RESEARCH",entry:a.reference_level??null,stop_loss:a.invalidation_level??null,
  take_profit:targets[0]??null,invalidation:a.invalidation_level??null,
  indicators:{ema20:ind.ema20??null,ema50:ind.ema50??null,rsi:ind.rsi14??null,atr:ind.atr14??null,vwap:ind.vwap??null,poc:ind.poc??null},
  prediction:[],sentiment:{status:a.news_assessment||"Integrated news research"},reasons:Array.isArray(a.reasoning)?a.reasoning:[a.direction_reason||""],
  risk_notes:Array.isArray(a.risk_notes)?a.risk_notes:[],higher_timeframe_bias:a.higher_timeframe_bias,waiting_for:a.waiting_for
 };
};

export const backtestMarket=(symbol:string,period="2y",interval="1d")=>request("/backtest/"+encodeURIComponent(symbol)+"?period="+period+"&interval="+interval) as Promise<{symbol:string;metrics:{total_return:number;max_drawdown:number;sharpe:number;observations:number}}>;
