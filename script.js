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
function volumeProfile(c,bins=40){if(!c.length)return null;const lo=Math.min(...c.map(x=>x.low)),hi=Math.max(...c.map(x=>x.high)),step=(hi-lo)/bins;if(!Number.isFinite(step)||step<=0)return null;const profile=Array(bins).fill(0);for(const x of c){const price=(x.high+x.low+x.close)/3,i=Math.max(0,Math.min(bins-1,Math.floor((price-lo)/step)));profile[i]+=Math.max(1,Number(x.volume)||1)}let max=0;for(let i=1;i<bins;i++)if(profile[i]>profile[max])max=i;return lo+(max+.5)*step}
function enrich(m){const c=(m.candles||[]).filter(x=>[x.open,x.high,x.low,x.close].every(Number.isFinite));if(c.length<30)return m;const closes=c.map(x=>x.close),price=closes.at(-1),e20=ema(closes,20),e50=ema(closes,50),r=rsi(closes),a=atr(c),v=vwap(c),recent=c.slice(-30),support=Math.min(...recent.map(x=>x.low)),resistance=Math.max(...recent.map(x=>x.high)),structure=price>e20&&e20>e50?'BULLISH':price<e20&&e20<e50?'BEARISH':'NEUTRAL',momentum=price>e20&&r>=55?'POSITIVE':price<e20&&r<=45?'NEGATIVE':'MIXED',volPct=a&&price?a/price*100:0;return {...m,indicators:{...(m.indicators||{}),ema20:e20,ema50:e50,rsi14:r,atr14:a,vwap:v,support,resistance,structure},poc:volumeProfile(c),momentum,volatility:volPct}}
async function loadMarket(tf){return enrich(await getJson(basePath()+'api/market-data?asset='+encodeURIComponent(state.asset)+'&interval='+encodeURIComponent(tf)+'&limit=220'))}

function candlePattern(c){
 const body=Math.abs(c.close-c.open),range=c.high-c.low,upper=c.high-Math.max(c.open,c.close),lower=Math.min(c.open,c.close)-c.low;
 if(!range||body/range<0.1)return 'DOJI';
 if(body/range<0.3&&lower>body*2&&upper<body)return c.close>=c.open?'HAMMER':'HAMMER-LIKE';
 if(body/range<0.3&&upper>body*2&&lower<body)return c.close<=c.open?'SHOOTING STAR':'INVERTED HAMMER';
 if(body/range>0.8)return c.close>c.open?'STRONG BULLISH CANDLE':'STRONG BEARISH CANDLE';
 return c.close>c.open?'BULLISH CANDLE':'BEARISH CANDLE';
}
function readCandles(m){
 const c=m?.candles||[]; if(c.length<3)return null;
 const last=c.at(-1),prev=c.at(-2),pattern=candlePattern(last);
 const prevPattern=candlePattern(prev);
 const engulfBull=last.close>last.open&&prev.close<prev.open&&last.open<=prev.close&&last.close>=prev.open;
 const engulfBear=last.close<last.open&&prev.close>prev.open&&last.open>=prev.close&&last.close<=prev.open;
 return {pattern,prevPattern,engulfBull,engulfBear,last,prev};
}
function classifyStages(m4,m1,m15,m5){
 const ms=[m4,m1,m15,m5].filter(Boolean),bull=ms.filter(m=>m.indicators?.structure==='BULLISH').length,bear=ms.filter(m=>m.indicators?.structure==='BEARISH').length;
 const bias=bull>bear?'BULLISH':bear>bull?'BEARISH':'NEUTRAL',m=m15||m5||m1||m4,c=m?.candles||[],recent=c.slice(-40),ranges=recent.map(x=>x.high-x.low),avg=ranges.length?ranges.reduce((a,b)=>a+b,0)/ranges.length:0,old=c.slice(-80,-40).map(x=>x.high-x.low),oldAvg=old.length?old.reduce((a,b)=>a+b,0)/old.length:avg,compression=avg>0&&avg<oldAvg*.82,last=recent.at(-1),prior=recent.slice(-10,-1),rangeHigh=prior.length?Math.max(...prior.map(x=>x.high)):null,rangeLow=prior.length?Math.min(...prior.map(x=>x.low)):null,breakoutUp=last&&rangeHigh&&last.close>rangeHigh,breakoutDown=last&&rangeLow&&last.close<rangeLow,poc=m?.poc,nearPoc=Number.isFinite(poc)&&m.indicators?.atr14?Math.abs(last.close-poc)<=m.indicators.atr14*.45:false,continuationUp=last&&last.close>last.open&&m.indicators.structure==='BULLISH',continuationDown=last&&last.close<last.open&&m.indicators.structure==='BEARISH',breakout=breakoutUp?'BULLISH':breakoutDown?'BEARISH':'WAITING',continuation=continuationUp?'BULLISH':continuationDown?'BEARISH':'WAITING';
 const stages=[['ACCUMULATION',compression?'DETECTED':'NOT CONFIRMED'],['VOLUME PROFILE',Number.isFinite(poc)?'POC ESTIMATED':'UNAVAILABLE'],['BREAKOUT',breakout],['POC PULLBACK',nearPoc?'NEAR POC':'WAITING'],['CONTINUATION',continuation]];
 const aligned=(bias==='BULLISH'&&continuation==='BULLISH')||(bias==='BEARISH'&&continuation==='BEARISH'),quality=Math.min(95,40+(compression?12:0)+(breakout!=='WAITING'?15:0)+(nearPoc?13:0)+(continuation!=='WAITING'?10:0)+(aligned?10:0));
 return {bias,breakout,nearPoc,continuation,stages,quality}
}
function renderTimeframes(){const map=[['4H','4h'],['1H','1h'],['15M','15m'],['5M','5m']];$('timeframes').innerHTML=map.map(([name,key])=>{const m=state.markets[key],s=m?.indicators?.structure||'—',r=m?.indicators?.rsi14;return '<div><span>'+name+'</span><b>'+s+'</b><small>RSI '+(Number.isFinite(r)?r.toFixed(1):'—')+'</small></div>'}).join('')}
function renderMain(m,setup){
 const i=m.indicators||{},price=Number(m.price);
 set('marketState',setup.bias==='NEUTRAL'?'NEUTRAL CONTEXT':setup.bias+' CONTEXT');set('bias',setup.bias);set('biasReason',setup.bias==='NEUTRAL'?'Higher timeframes are not aligned. The engine stays neutral until structure separates.':setup.bias+' structure is present across the multi-timeframe scan; lower-timeframe confirmation is still required.');
 set('quality',setup.quality+' / 100');$('qualityBar').style.width=setup.quality+'%';set('price',fmt(price));set('change',pct(m.changePercent));set('poc',fmt(m.poc));set('support',fmt(i.support));set('resistance',fmt(i.resistance));set('volatility',Number.isFinite(m.volatility)?m.volatility.toFixed(3)+'% ATR':'—');
 const vals=[['EMA 20',fmt(i.ema20)],['EMA 50',fmt(i.ema50)],['RSI 14',Number.isFinite(i.rsi14)?i.rsi14.toFixed(1):'—'],['ATR 14',fmt(i.atr14)],['VWAP',fmt(i.vwap)],['STRUCTURE',i.structure||'—']];$('indicators').innerHTML=vals.map(x=>'<div><span>'+x[0]+'</span><b>'+x[1]+'</b></div>').join('');
 $('stageFlow').innerHTML=setup.stages.map((x,n)=>'<div><b>0'+(n+1)+'</b><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join('');set('setupState',setup.continuation==='WAITING'?'WAITING FOR CONFIRMATION':setup.continuation+' CONTINUATION');
 set('dataSource','DATA SOURCE — '+(m.provider||'market API'));const age=m.timestamp?Math.max(0,(Date.now()-new Date(m.timestamp).getTime())/1000):null;set('dataAge',age!==null?'LAST UPDATE — '+Math.round(age)+'s AGO':'LAST UPDATE — —');set('apiMode','ENGINE — TECHNICAL + CANDLE ANALYSIS');set('analyzedAt',new Date().toLocaleTimeString());
 const candle=readCandles(m); const candleText=candle?('Latest candle: '+candle.pattern+'. Previous: '+candle.prevPattern+'.'+(candle.engulfBull?' Bullish engulfing detected.':'')+(candle.engulfBear?' Bearish engulfing detected.':'')):'Candle data unavailable.'; const reasons=[candleText,'HTF alignment: '+setup.bias+'.','EMA structure: '+(i.structure||'neutral')+'; EMA20 '+fmt(i.ema20)+', EMA50 '+fmt(i.ema50)+'.','Momentum: '+(m.momentum||'mixed')+'; RSI14 '+(Number.isFinite(i.rsi14)?i.rsi14.toFixed(1):'—')+'.','POC reference: '+fmt(m.poc)+'; current reference: '+fmt(m.price)+'.','ATR volatility: '+fmt(i.atr14)+'; recent support '+fmt(i.support)+', resistance '+fmt(i.resistance)+'.'];$('reasoning').innerHTML=reasons.map(x=>'<li>'+esc(x)+'</li>').join('')
}
function apiBase(){return '/api/'}
async function loadMacro(){try{const [news,cal]=await Promise.all([getJson(basePath()+'api/news?asset='+encodeURIComponent(state.asset)),getJson(basePath()+'api/calendar')]);const count=(news.items||[]).length+(cal.events||[]).length,risk=count>=8?'HIGH':count>=3?'MEDIUM':'LOW';set('macroRisk',risk);$('macro').innerHTML=(news.items||[]).slice(0,4).map(x=>'<div><b>'+esc(x.title)+'</b><br><small>'+esc(x.source||'News')+' · '+esc(x.pubDate||'')+'</small></div>').join('')||'No recent headlines returned.'}catch(e){set('macroRisk','UNAVAILABLE');$('macro').textContent='Macro feeds are unavailable. Technical analysis can still run from market data.'}}
async function analyzeMarket(){
 const btn=$('analyzeMarket');btn.disabled=true;btn.innerHTML='Analyzing…';status(false,'LOADING');state.asset=$('asset').value;state.timeframe=$('timeframe').value;
 try{const tfs=['4h','1h','15m','5m'],loaded=await Promise.allSettled(tfs.map(loadMarket));state.markets={};loaded.forEach((r,i)=>{if(r.status==='fulfilled')state.markets[tfs[i]]=r.value});const m=state.markets[state.timeframe]||state.markets['15m']||state.markets['5m']||state.markets['1h']||state.markets['4h'];if(!m)throw new Error('No verified market-data endpoint is reachable. GitHub Pages is static, so the live API must be deployed separately.');state.current=m;const setup=classifyStages(state.markets['4h'],state.markets['1h'],state.markets['15m'],state.markets['5m']);renderTimeframes();renderMain(m,setup);await loadMacro();await runAIAnalysis();status(true,'LIVE + AI')}catch(e){status(false,'DATA OFFLINE');set('marketState','DATA UNAVAILABLE');set('bias','NEUTRAL');set('biasReason',e.message);set('dataSource','DATA SOURCE — unavailable')}finally{btn.disabled=false;btn.innerHTML='Analyze Market <span>↗</span>'}
}

document.addEventListener('DOMContentLoaded',()=>{$('asset').addEventListener('change',()=>{state.asset=$('asset').value});$('timeframe').addEventListener('change',()=>{state.timeframe=$('timeframe').value});$('analyzeMarket').addEventListener('click',analyzeMarket);analyzeMarket()});