const $=id=>document.getElementById(id);
const state={asset:'XAUUSD',timeframe:'15m',markets:{},current:null,ai:null};

const fmt=v=>{const n=Number(v);if(!Number.isFinite(n))return '—';if(Math.abs(n)>=1000)return n.toLocaleString(undefined,{maximumFractionDigits:2});if(Math.abs(n)>=100)return n.toFixed(2);if(Math.abs(n)>=1)return n.toFixed(4);return n.toFixed(6)};
const pct=v=>Number.isFinite(Number(v))?(Number(v)>=0?'+':'')+Number(v).toFixed(2)+'%':'—';
const set=(id,v)=>{const e=$(id);if(e)e.textContent=v??'—'};
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function status(live,text){const dot=$('connectionDot'),label=$('connectionText');dot?.parentElement.classList.toggle('live',!!live);if(label)label.textContent=text}
function basePath(){return location.pathname.includes('/ai-market-analyzer')?'/ai-market-analyzer/':'/'}
async function getJson(url){const r=await fetch(url,{cache:'no-store'}),j=await r.json().catch(()=>({}));if(!r.ok||j.ok===false)throw new Error(j.error||j.message||('HTTP '+r.status));return j}

function ema(values,p){if(values.length<p)return null;const k=2/(p+1);let x=values.slice(0,p).reduce((a,b)=>a+b,0)/p;for(let i=p;i<values.length;i++)x=(values[i]-x)*k+x;return x}
function rsi(values,p=14){if(values.length<=p)return null;let gain=0,loss=0;for(let i=1;i<=p;i++){const d=values[i]-values[i-1];if(d>=0)gain+=d;else loss-=d}let ag=gain/p,al=loss/p;for(let i=p+1;i<values.length;i++){const d=values[i]-values[i-1],g=Math.max(0,d),l=Math.max(0,-d);ag=(ag*(p-1)+g)/p;al=(al*(p-1)+l)/p}return al===0?100:100-100/(1+ag/al)}
function atr(c,p=14){if(c.length<=p)return null;const tr=[];for(let i=1;i<c.length;i++)tr.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close)));return tr.slice(-p).reduce((a,b)=>a+b,0)/p}
function vwap(c){let pv=0,v=0;for(const x of c){const vol=Number(x.volume);if(!Number.isFinite(vol)||vol<=0)continue;pv+=((x.high+x.low+x.close)/3)*vol;v+=vol}return v?pv/v:null}
function enrich(m){const c=(m.candles||[]).filter(x=>[x.open,x.high,x.low,x.close].every(Number.isFinite));if(c.length<30)return m;const closes=c.map(x=>x.close),price=closes.at(-1),e20=ema(closes,20),e50=ema(closes,50),r=rsi(closes),a=atr(c),v=vwap(c),recent=c.slice(-30),support=Math.min(...recent.map(x=>x.low)),resistance=Math.max(...recent.map(x=>x.high)),structure=price>e20&&e20>e50?'BULLISH':price<e20&&e20<e50?'BEARISH':'NEUTRAL',momentum=price>e20&&r>=55?'POSITIVE':price<e20&&r<=45?'NEGATIVE':'MIXED',volPct=a&&price?a/price*100:0;return {...m,indicators:{...(m.indicators||{}),ema20:e20,ema50:e50,rsi14:r,atr14:a,vwap:v,support,resistance,structure},momentum,volatility:volPct}}
async function loadMarket(tf){return enrich(await getJson(basePath()+'api/market-data?asset='+encodeURIComponent(state.asset)+'&interval='+encodeURIComponent(tf)+'&limit=220'))}

function candlePattern(c){
 const body=Math.abs(c.close-c.open),range=c.high-c.low,upper=c.high-Math.max(c.open,c.close),lower=Math.min(c.open,c.close)-c.low;
 if(!range)return 'UNDEFINED';
 if(body/range<0.1)return 'DOJI';
 if(body/range<0.3&&lower>body*2&&upper<body)return 'HAMMER';
 if(body/range<0.3&&upper>body*2&&lower<body)return c.close<=c.open?'SHOOTING STAR':'INVERTED HAMMER';
 if(body/range>0.8)return c.close>c.open?'STRONG BULLISH CANDLE':'STRONG BEARISH CANDLE';
 return c.close>c.open?'BULLISH CANDLE':'BEARISH CANDLE';
}
function readCandles(m){
 const c=m?.candles||[];if(c.length<3)return null;
 const last=c.at(-1),prev=c.at(-2),pattern=candlePattern(last),prevPattern=candlePattern(prev);
 const engulfBull=last.close>last.open&&prev.close<prev.open&&last.open<=prev.close&&last.close>=prev.open;
 const engulfBear=last.close<last.open&&prev.close>prev.open&&last.open>=prev.close&&last.close<=prev.open;
 return {pattern,prevPattern,engulfBull,engulfBear,last,prev};
}
function structureReading(m){
 const c=m?.candles||[];if(c.length<20)return {state:'INSUFFICIENT',reason:'Not enough candles'};
 const recent=c.slice(-20),prior=c.slice(-40,-20);
 const rh=Math.max(...recent.slice(0,-1).map(x=>x.high)),rl=Math.min(...recent.slice(0,-1).map(x=>x.low));
 const last=c.at(-1),hh=last.high>rh,ll=last.low<rl;
 const i=m.indicators||{};
 const state=i.structure==='BULLISH'&&hh?'BULLISH BREAK':i.structure==='BEARISH'&&ll?'BEARISH BREAK':i.structure;
 const reason=hh?'Price has taken the recent 20-candle high.':ll?'Price has taken the recent 20-candle low.':i.structure==='BULLISH'?'Price is above rising EMA structure.':i.structure==='BEARISH'?'Price is below falling EMA structure.':'Price is between conflicting structure signals.';
 return {state,reason,hh,ll,rangeHigh:rh,rangeLow:rl,priorHigh:prior.length?Math.max(...prior.map(x=>x.high)):null,priorLow:prior.length?Math.min(...prior.map(x=>x.low)):null};
}
function localAction(m,htfBias){
 const candle=readCandles(m),i=m?.indicators||{},structure=structureReading(m);
 if(!candle||!Number.isFinite(i.rsi14))return {state:'WAIT',plan:'Wait for enough verified candle data.',reason:'Insufficient evidence.'};
 const bull=candle.engulfBull||candle.pattern==='HAMMER'||candle.pattern==='STRONG BULLISH CANDLE';
 const bear=candle.engulfBear||candle.pattern==='SHOOTING STAR'||candle.pattern==='STRONG BEARISH CANDLE';
 const alignedBull=htfBias==='BULLISH'&&i.structure==='BULLISH';
 const alignedBear=htfBias==='BEARISH'&&i.structure==='BEARISH';
 if(alignedBull&&bull&&i.rsi14<70)return {state:'BUY AREA',plan:'Wait for bullish confirmation near a defined support/reference area.',reason:'Higher-timeframe and execution-timeframe structure align bullishly, with a bullish candle signal.'};
 if(alignedBear&&bear&&i.rsi14>30)return {state:'SELL AREA',plan:'Wait for bearish confirmation near a defined resistance/reference area.',reason:'Higher-timeframe and execution-timeframe structure align bearishly, with a bearish candle signal.'};
 return {state:'WAIT',plan:alignedBull?'Wait for a bullish candle confirmation or a clean retest.':alignedBear?'Wait for a bearish candle confirmation or a clean retest.':'Wait until market structure becomes clearer.',reason:'Current evidence is mixed or lacks enough confirmation.'};
}
function timeframeBias(){
 const ms=['4h','1h','15m','5m'].map(k=>state.markets[k]?.indicators?.structure).filter(Boolean);
 const bull=ms.filter(x=>x==='BULLISH').length,bear=ms.filter(x=>x==='BEARISH').length;
 return bull>bear?'BULLISH':bear>bull?'BEARISH':'NEUTRAL';
}
function qualityScore(m){
 const i=m?.indicators||{},c=readCandles(m),s=structureReading(m),bias=timeframeBias();
 let q=35;
 if(i.structure===bias&&bias!=='NEUTRAL')q+=20;
 if(c&&(c.engulfBull||c.engulfBear||c.pattern==='HAMMER'||c.pattern==='SHOOTING STAR'||c.pattern.startsWith('STRONG')))q+=15;
 if(s.state.includes('BREAK'))q+=10;
 if(Number.isFinite(i.rsi14)&&i.rsi14>45&&i.rsi14<65)q+=10;
 return Math.min(95,q);
}
function renderTimeframes(){const map=[['4H','4h'],['1H','1h'],['15M','15m'],['5M','5m']];$('timeframes').innerHTML=map.map(([name,key])=>{const m=state.markets[key],s=m?.indicators?.structure||'—',r=m?.indicators?.rsi14;return '<div><span>'+name+'</span><b>'+s+'</b><small>RSI '+(Number.isFinite(r)?r.toFixed(1):'—')+'</small></div>'}).join('')}
function renderMain(m){
 const i=m.indicators||{},price=Number(m.price),bias=timeframeBias(),candle=readCandles(m),structure=structureReading(m),action=localAction(m,bias),quality=qualityScore(m);
 set('marketState',bias==='NEUTRAL'?'NEUTRAL CONTEXT':bias+' CONTEXT');set('bias',bias);set('biasReason',bias==='NEUTRAL'?'Timeframes are mixed; the engine remains neutral until structure separates.':bias+' is the dominant structure across the multi-timeframe scan.');set('quality',quality+' / 100');$('qualityBar').style.width=quality+'%';set('price',fmt(price));set('change',pct(m.changePercent));set('poc','Not used');set('support',fmt(i.support));set('resistance',fmt(i.resistance));set('volatility',Number.isFinite(m.volatility)?m.volatility.toFixed(3)+'% ATR':'—');
 const vals=[['EMA 20',fmt(i.ema20)],['EMA 50',fmt(i.ema50)],['RSI 14',Number.isFinite(i.rsi14)?i.rsi14.toFixed(1):'—'],['ATR 14',fmt(i.atr14)],['VWAP',fmt(i.vwap)],['STRUCTURE',i.structure||'—']];$('indicators').innerHTML=vals.map(x=>'<div><span>'+x[0]+'</span><b>'+x[1]+'</b></div>').join('');
 $('stageFlow').innerHTML=[['01','MARKET STRUCTURE',structure.state],['02','SWING RANGE',structure.hh?'HIGH TAKEN':structure.ll?'LOW TAKEN':'WITHIN RANGE'],['03','SUPPORT / RESISTANCE',fmt(i.support)+' / '+fmt(i.resistance)],['04','MOMENTUM',m.momentum||'MIXED'],['05','CANDLE CONFIRMATION',candle?.pattern||'UNAVAILABLE']].map(x=>'<div><b>'+x[0]+'</b><span>'+x[1]+'</span><strong>'+x[2]+'</strong></div>').join('');
 set('setupState',action.state);set('actionState',action.state);set('lastCandle',candle?.pattern||'—');set('previousCandle',candle?.prevPattern||'—');set('entryPlan',action.plan);set('actionReason',action.reason);
 set('dataSource','DATA SOURCE — '+(m.provider||'market API')+' · synced to TradingView symbol');const age=m.timestamp?Math.max(0,(Date.now()-new Date(m.timestamp).getTime())/1000):null;set('dataAge',age!==null?'LAST UPDATE — '+Math.round(age)+'s AGO':'LAST UPDATE — —');set('apiMode',state.ai?.available?'ENGINE — OPENAI + TECHNICAL':'ENGINE — LOCAL TECHNICAL');set('analyzedAt',new Date().toLocaleTimeString());
 const reasons=[candle?('Latest candle: '+candle.pattern+'. Previous: '+candle.prevPattern+'.'):'Candle data unavailable.','Structure: '+structure.state+'. '+structure.reason,'Multi-timeframe bias: '+bias+'.','EMA structure: '+(i.structure||'neutral')+'; EMA20 '+fmt(i.ema20)+', EMA50 '+fmt(i.ema50)+'.','Momentum: '+(m.momentum||'mixed')+'; RSI14 '+(Number.isFinite(i.rsi14)?i.rsi14.toFixed(1):'—')+'.','ATR volatility: '+fmt(i.atr14)+'; support '+fmt(i.support)+', resistance '+fmt(i.resistance)+'.'];$('reasoning').innerHTML=reasons.map(x=>'<li>'+esc(x)+'</li>').join('');
}
async function loadMacro(){
 try{const [news,cal]=await Promise.all([getJson(basePath()+'api/news?asset='+encodeURIComponent(state.asset)),getJson(basePath()+'api/calendar')]);const events=[...(news.items||[]).map(x=>({title:x.title,impact:'NEWS'})),...(cal.events||[])];const high=events.filter(x=>['HIGH','EXTREME'].includes(String(x.impact).toUpperCase())).length;const risk=high?'HIGH':events.length>=3?'MEDIUM':'LOW';set('macroRisk',risk);$('macro').innerHTML=events.slice(0,6).map(x=>'<div><b>'+esc(x.title)+'</b><br><small>'+esc(x.impact||'NEWS')+'</small></div>').join('')||'No recent headlines returned.';return {news:news.items||[],calendar:cal.events||[]}}catch(e){set('macroRisk','UNAVAILABLE');$('macro').textContent='Macro feeds are unavailable. Technical analysis can still run.';return {news:[],calendar:[]}}
}
async function runAIAnalysis(macro){
 const markets=state.markets;
 const payload={asset:state.asset,timeframe:state.timeframe,depth:$('depth').value,markets,news:macro?.news||[],calendar:macro?.calendar||[],chartSource:'TradingView embedded live chart; analysis is based on synchronized OHLC market data for the same instrument and timeframe.'};
 try{
  const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'AI request failed');
  state.ai=j;const a=j.analysis;
  if(!a){set('apiMode','ENGINE — LOCAL TECHNICAL');return}
  set('actionState',a.action_state||'WAIT');set('setupState',a.action_state||'WAIT');set('lastCandle',a.candle_reading||$('lastCandle').textContent);set('entryPlan',a.entry_plan||'—');set('actionReason',a.action_reason||a.direction_reason||'—');set('bias',a.higher_timeframe_bias||timeframeBias());set('marketState',a.market_state||'WAIT');set('quality',Number.isFinite(Number(a.analysis_quality))?Number(a.analysis_quality).toFixed(0)+' / 100':$('quality').textContent);$('qualityBar').style.width=Math.min(100,Math.max(0,Number(a.analysis_quality)||0))+'%';set('biasReason',a.direction_reason||'');set('apiMode','ENGINE — OPENAI + TECHNICAL + NEWS');
  const rr=Array.isArray(a.reasoning)?a.reasoning:[];if(rr.length)$('reasoning').innerHTML=rr.map(x=>'<li>'+esc(x)+'</li>').join('');
  if(a.news_assessment||a.news_events?.length){set('macroRisk',a.news_events?.length?'REVIEW':'LOW');$('macro').innerHTML='<p>'+esc(a.news_assessment||'')+'</p>'+(a.news_events||[]).map(x=>'<div><small>'+esc(x)+'</small></div>').join('')}
 }catch(e){state.ai={available:false,error:e.message};set('apiMode','ENGINE — LOCAL TECHNICAL');}
}
async function analyzeMarket(){
 const btn=$('analyzeMarket');btn.disabled=true;btn.innerHTML='Analyzing…';status(false,'LOADING');state.asset=$('asset').value;state.timeframe=$('timeframe').value;
 try{
  const tfs=['4h','1h','15m','5m'],loaded=await Promise.allSettled(tfs.map(loadMarket));state.markets={};loaded.forEach((r,i)=>{if(r.status==='fulfilled')state.markets[tfs[i]]=r.value});
  const m=state.markets[state.timeframe]||state.markets['15m']||state.markets['5m']||state.markets['1h']||state.markets['4h'];if(!m)throw new Error('No live market-data endpoint is reachable. Deploy the API on Vercel for server-side market access.');
  state.current=m;renderTimeframes();renderMain(m);const macro=await loadMacro();await runAIAnalysis(macro);status(true,state.ai?.analysis?'LIVE + AI':'LIVE + LOCAL');
 }catch(e){status(false,'DATA OFFLINE');set('marketState','DATA UNAVAILABLE');set('bias','NEUTRAL');set('biasReason',e.message);set('dataSource','DATA SOURCE — unavailable')}
 finally{btn.disabled=false;btn.innerHTML='Analyze Market <span>↗</span>'}
}
document.addEventListener('DOMContentLoaded',()=>{$('asset').addEventListener('change',()=>{state.asset=$('asset').value});$('timeframe').addEventListener('change',()=>{state.timeframe=$('timeframe').value});$('analyzeMarket').addEventListener('click',analyzeMarket);analyzeMarket()});
