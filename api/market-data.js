const BINANCE_SYMBOLS={BTCUSD:'BTCUSDT',ETHUSD:'ETHUSDT',SOLUSD:'SOLUSDT'};
const YAHOO_SYMBOLS={BTCUSD:'BTC-USD',ETHUSD:'ETH-USD',SOLUSD:'SOL-USD',US30:'^DJI',EURUSD:'EURUSD=X',GBPUSD:'GBPUSD=X'};
const TWELVE_SYMBOLS={XAUUSD:'XAU/USD',US30:'DJI',EURUSD:'EUR/USD',GBPUSD:'GBP/USD'};

function sma(a,p){if(a.length<p)return null;const s=a.slice(-p);return s.reduce((x,y)=>x+y,0)/p}
function ema(a,p){if(a.length<p)return null;const k=2/(p+1);let x=a.slice(0,p).reduce((s,v)=>s+v,0)/p;for(let i=p;i<a.length;i++)x=(a[i]-x)*k+x;return x}
function rsi(a,p=14){if(a.length<=p)return null;let g=0,l=0;for(let i=1;i<=p;i++){const d=a[i]-a[i-1];if(d>=0)g+=d;else l-=d}let ag=g/p,al=l/p;for(let i=p+1;i<a.length;i++){const d=a[i]-a[i-1],up=Math.max(0,d),dn=Math.max(0,-d);ag=(ag*(p-1)+up)/p;al=(al*(p-1)+dn)/p}return al===0?100:100-100/(1+ag/al)}
function atr(c,p=14){if(c.length<=p)return null;const tr=[];for(let i=1;i<c.length;i++)tr.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close)));return sma(tr,p)}
function vwap(c){let pv=0,v=0;for(const x of c){const q=Number(x.volume);if(!Number.isFinite(q)||q<=0)continue;pv+=((x.high+x.low+x.close)/3)*q;v+=q}return v?pv/v:null}
function profile(c,bins=40){if(!c.length)return null;const lo=Math.min(...c.map(x=>x.low)),hi=Math.max(...c.map(x=>x.high)),step=(hi-lo)/bins;if(!(step>0))return null;const p=Array(bins).fill(0);for(const x of c){const price=(x.high+x.low+x.close)/3,i=Math.max(0,Math.min(bins-1,Math.floor((price-lo)/step)));p[i]+=Math.max(1,Number(x.volume)||1)}let max=0;for(let i=1;i<bins;i++)if(p[i]>p[max])max=i;return lo+(max+.5)*step}
function indicators(c){
 const closes=c.map(x=>x.close),price=closes.at(-1),e20=ema(closes,20),e50=ema(closes,50),r=rsi(closes),a=atr(c),v=vwap(c),recent=c.slice(-30);
 const support=Math.min(...recent.map(x=>x.low)),resistance=Math.max(...recent.map(x=>x.high));
 const structure=price>e20&&e20>e50?'BULLISH':price<e20&&e20<e50?'BEARISH':'NEUTRAL';
 return {ema20:e20,ema50:e50,rsi14:r,atr14:a,vwap:v,support,resistance,structure,poc:profile(c)};
}
async function binance(asset,interval,limit){
 const symbol=BINANCE_SYMBOLS[asset];if(!symbol)throw new Error('Binance symbol not configured');
 const u='https://api.binance.com/api/v3/klines?symbol='+symbol+'&interval='+encodeURIComponent(interval)+'&limit='+limit;
 const res=await fetch(u,{cache:'no-store',headers:{'User-Agent':'AI-Market-Analyzer/3.0'}});if(!res.ok)throw new Error('Binance returned '+res.status);const raw=await res.json();
 const candles=raw.map(x=>({time:new Date(Number(x[0])).toISOString(),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5])}));
 return {candles,provider:'Binance public market data',providerSymbol:symbol}
}
async function yahoo(asset,interval,limit){
 const symbol=YAHOO_SYMBOLS[asset];if(!symbol)throw new Error('Yahoo symbol not configured');
 const range=interval==='4h'?'60d':interval==='1h'?'60d':'30d',u='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range='+range+'&interval='+encodeURIComponent(interval)+'&includePrePost=true';
 const res=await fetch(u,{cache:'no-store',headers:{'User-Agent':'AI-Market-Analyzer/3.0'}});if(!res.ok)throw new Error('Yahoo returned '+res.status);const j=await res.json(),r=j.chart?.result?.[0];if(!r)throw new Error('Yahoo returned no chart data');
 const q=r.indicators?.quote?.[0]||{},v=r.indicators?.quote?.[0]?.volume||[],t=r.timestamp||[],candles=[];
 for(let i=0;i<t.length;i++){const open=Number(q.open?.[i]),high=Number(q.high?.[i]),low=Number(q.low?.[i]),close=Number(q.close?.[i]);if([open,high,low,close].every(Number.isFinite))candles.push({time:new Date(t[i]*1000).toISOString(),open,high,low,close,volume:Number(v[i])||0})}
 return {candles:candles.slice(-limit),provider:'Yahoo Finance reference data',providerSymbol:symbol}
}
async function twelve(asset,interval,limit,key){
 const symbol=TWELVE_SYMBOLS[asset];if(!symbol)throw new Error('Twelve Data symbol not configured');
 const u='https://api.twelvedata.com/time_series?symbol='+encodeURIComponent(symbol)+'&interval='+encodeURIComponent(interval)+'&outputsize='+limit+'&apikey='+encodeURIComponent(key);
 const res=await fetch(u,{cache:'no-store'});const j=await res.json();if(!res.ok||j.status==='error'||!Array.isArray(j.values))throw new Error(j.message||'Twelve Data unavailable');
 const candles=j.values.slice().reverse().map(x=>({time:new Date(x.datetime).toISOString(),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume)||0}));
 return {candles,provider:'Twelve Data',providerSymbol:symbol}
}
export default async function handler(req,res){
 const asset=String(req.query?.asset||'BTCUSD').toUpperCase(),interval=String(req.query?.interval||'15m'),limit=Math.min(Math.max(Number(req.query?.limit)||220,60),500);
 if(!['5m','15m','1h','4h'].includes(interval))return res.status(400).json({ok:false,error:'Unsupported interval'});
 try{
   let raw;
   const key=process.env.TWELVE_DATA_API_KEY;
   if(key&&TWELVE_SYMBOLS[asset]) raw=await twelve(asset,interval,limit,key);
   else if(BINANCE_SYMBOLS[asset]) raw=await binance(asset,interval,limit);
   else if(YAHOO_SYMBOLS[asset]) raw=await yahoo(asset,interval,limit);
   else return res.status(503).json({ok:false,error:'No market-data provider configured for '+asset,details:'For XAUUSD, configure TWELVE_DATA_API_KEY or connect a broker/MT5 read-only feed. No gold futures price is substituted for spot.'});
   const candles=raw.candles.filter(x=>[x.open,x.high,x.low,x.close].every(Number.isFinite));if(candles.length<60)throw new Error('Provider returned fewer than 60 usable candles');
   const latest=candles.at(-1),previous=candles.at(-2),changePercent=previous?((latest.close-previous.close)/previous.close)*100:0;
   const ind=indicators(candles);
   return res.status(200).json({ok:true,dataAvailable:true,asset,provider:raw.provider,providerSymbol:raw.providerSymbol,timeframe:interval,timestamp:latest.time,price:latest.close,changePercent,candles,indicators:ind,note:'Read-only market research data. Broker pricing can differ from reference feeds.'});
 }catch(error){return res.status(502).json({ok:false,asset,error:'Live market data unavailable',details:error.message})}
}