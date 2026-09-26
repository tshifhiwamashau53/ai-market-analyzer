export type ApiCandle={time:string;open:number;high:number;low:number;close:number;volume:number};
export type MarketHistory={symbol:string;interval:string;candles:ApiCandle[];source:string};
export type Analysis={symbol:string;current_price:number;direction:string;action:string;confidence:number;setup:string;entry:number|null;stop_loss:number|null;take_profit:number|null;invalidation:number|null;indicators:Record<string,number|null>;prediction:{time:string;value:number;lower:number|null;upper:number|null}[];sentiment:Record<string,unknown>;reasons:string[];risk_notes:string[]};
const base=(process.env.NEXT_PUBLIC_API_URL||"http://localhost:8000").replace(/\/$/,"");
async function request(path:string,init?:RequestInit){
  const r=await fetch(base+path,{...init,cache:"no-store"});
  if(!r.ok) throw new Error((await r.text())||("API "+r.status));
  return r.json();
}
export const marketHistory=(symbol:string,period="6mo",interval="1d")=>request("/market/"+encodeURIComponent(symbol)+"/history?period="+period+"&interval="+interval) as Promise<MarketHistory>;
export const analyzeMarket=(symbol:string,period="6mo",interval="1d")=>request("/analysis",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol,period,interval,depth:"standard"})}) as Promise<Analysis>;
