const $=id=>document.getElementById(id);
const state={asset:'XAUUSD',timeframe:'15m',markets:{},current:null,ai:null,activePage:'analyzer'};
const SIGNAL_KEY='ai-market-analyzer-signals-v1';

const fmt=v=>{const n=Number(v);if(!Number.isFinite(n))return '—';if(Math.abs(n)>=1000)return n.toLocaleString(undefined,{maximumFractionDigits:2});if(Math.abs(n)>=100)return n.toFixed(2);if(Math.abs(n)>=1)return n.toFixed(4);return n.toFixed(6)};
const pct=v=>Number.isFinite(Number(v))?(Number(v)>=0?'+':'')+Number(v).toFixed(2)+'%':'—';
const set=(id,v)=>{const e=$(id);if(e)e.textContent=v??'—'};
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function status(live,text){const dot=$('connectionDot'),label=$('connectionText');dot?.parentElement.classList.toggle('live',!!live);if(label)label.textContent=text}
function basePath(){return location.pathname.includes('/ai-market-analyzer')?'/ai-market-analyzer/':'/'}
async function getJson(url){const r=await fetch(url,{cache:'no-store'}),j=await r.json().catch(()=>({}));if(!r.ok||j.ok===false)throw new Error(j.error||j.message||('HTTP '+r.status));return j}

function tvInterval(){return ({'5m':'5','15m':'15','1h':'60'})[state.timeframe]||'15'}
function chartSymbol(){return state.asset==='BTCUSD'?'COINBASE:BTCUSD':'OANDA:XAUUSD'}
function chartLabel(){return state.asset==='BTCUSD'?{eyebrow:'BTCUSD',title:'Bitcoin / US Dollar'}:{eyebrow:'XAUUSD',title:'Gold / US Dollar'}}
function mountTradingView(){
 const host=$('tradingview-selected');if(!host)return;
 host.innerHTML='<div class="tradingview-widget-container__widget"></div>';
 const script=document.createElement('script');script.type='text/javascript';script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';script.async=true;
 script.text=JSON.stringify({autosize:true,symbol:chartSymbol(),interval:tvInterval(),timezone:'Africa/Johannesburg',theme:'light',style:'1',locale:'en',allow_symbol_change:false,calendar:false,hide_top_toolbar:false,hide_legend:false,save_image:false,hide_side_toolbar:false,support_host:'https://www.tradingview.com'});
 host.appendChild(script);
 const label=chartLabel();set('chartAssetEyebrow',label.eyebrow);set('chartAssetTitle',label.title);
 document.querySelectorAll('.asset-tab').forEach(tab=>{const active=tab.dataset.chartAsset===state.asset;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',active?'true':'false')});
}
function ema(values,p){if(values.length<p)return null;const k=2/(p+1);let x=values.slice(0,p).reduce((a,b)=>a+b,0)/p;for(let i=p;i<values.length;i++)x=(values[i]-x)*k+x;return x}
function rsi(values,p=14){if(values.length<=p)return null;let gain=0,loss=0;for(let i=1;i<=p;i++){const d=values[i]-values[i-1];if(d>=0)gain+=d;else loss-=d}let ag=gain/p,al=loss/p;for(let i=p+1;i<values.length;i++){const d=values[i]-values[i-1],g=Math.max(0,d),l=Math.max(0,-d);ag=(ag*(p-1)+g)/p;al=(al*(p-1)+l)/p}return al===0?100:100-100/(1+ag/al)}
function atr(c,p=14){if(c.length<=p)return null;const tr=[];for(let i=1;i<c.length;i++)tr.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close)));return tr.slice(-p).reduce((a,b)=>a+b,0)/p}
function vwap(c){let pv=0,v=0;for(const x of c){const vol=Number(x.volume);if(!Number.isFinite(vol)||vol<=0)continue;pv+=((x.high+x.low+x.close)/3)*vol;v+=vol}return v?pv/v:null}
function enrich(m){const c=(m.candles||[]).filter(x=>[x.open,x.high,x.low,x.close].every(Number.isFinite));if(c.length<30)return m;const closes=c.map(x=>x.close),price=closes.at(-1),e20=ema(closes,20),e50=ema(closes,50),r=rsi(closes),a=atr(c),v=vwap(c),recent=c.slice(-30),support=Math.min(...recent.map(x=>x.low)),resistance=Math.max(...recent.map(x=>x.high)),structure=price>e20&&e20>e50?'BULLISH':price<e20&&e20<e50?'BEARISH':'NEUTRAL',momentum=price>e20&&r>=55?'POSITIVE':price<e20&&r<=45?'NEGATIVE':'MIXED',volPct=a&&price?a/price*100:0;return {...m,indicators:{...(m.indicators||{}),ema20:e20,ema50:e50,rsi14:r,atr14:a,vwap:v,support,resistance,structure},momentum,volatility:volPct}}
async function loadMarket(tf){return enrich(await getJson(basePath()+'api/market-data?asset='+encodeURIComponent(state.asset)+'&interval='+encodeURIComponent(tf)+'&limit=220'))}

function candlePattern(c){const body=Math.abs(c.close-c.open),range=c.high-c.low,upper=c.high-Math.max(c.open,c.close),lower=Math.min(c.open,c.close)-c.low;if(!range)return 'UNDEFINED';if(body/range<0.1)return 'DOJI';if(body/range<0.3&&lower>body*2&&upper<body)return 'HAMMER';if(body/range<0.3&&upper>body*2&&lower<body)return c.close<=c.open?'SHOOTING STAR':'INVERTED HAMMER';if(body/range>0.8)return c.close>c.open?'STRONG BULLISH CANDLE':'STRONG BEARISH CANDLE';return c.close>c.open?'BULLISH CANDLE':'BEARISH CANDLE'}
function readCandles(m){const c=m?.candles||[];if(c.length<3)return null;const last=c.at(-1),prev=c.at(-2),pattern=candlePattern(last),prevPattern=candlePattern(prev);const engulfBull=last.close>last.open&&prev.close<prev.open&&last.open<=prev.close&&last.close>=prev.open;const engulfBear=last.close<last.open&&prev.close>prev.open&&last.open>=prev.close&&last.close<=prev.open;return {pattern,prevPattern,engulfBull,engulfBear,last,prev}}
function structureReading(m){const c=m?.candles||[];if(c.length<20)return {state:'INSUFFICIENT',reason:'Not enough candles'};const recent=c.slice(-20),prior=c.slice(-40,-20),rh=Math.max(...recent.slice(0,-1).map(x=>x.high)),rl=Math.min(...recent.slice(0,-1).map(x=>x.low)),last=c.at(-1),hh=last.high>rh,ll=last.low<rl,i=m.indicators||{},state=i.structure==='BULLISH'&&hh?'BULLISH BREAK':i.structure==='BEARISH'&&ll?'BEARISH BREAK':i.structure,reason=hh?'Price has taken the recent 20-candle high.':ll?'Price has taken the recent 20-candle low.':i.structure==='BULLISH'?'Price is above rising EMA structure.':i.structure==='BEARISH'?'Price is below falling EMA structure.':'Price is between conflicting structure signals.';return {state,reason,hh,ll,rangeHigh:rh,rangeLow:rl,priorHigh:prior.length?Math.max(...prior.map(x=>x.high)):null,priorLow:prior.length?Math.min(...prior.map(x=>x.low)):null}}
function localAction(m,htfBias){const candle=readCandles(m),i=m?.indicators||{};if(!candle||!Number.isFinite(i.rsi14))return {state:'WAIT',plan:'Wait for enough verified candle data.',reason:'Insufficient evidence.'};const bull=candle.engulfBull||candle.pattern==='HAMMER'||candle.pattern==='STRONG BULLISH CANDLE',bear=candle.engulfBear||candle.pattern==='SHOOTING STAR'||candle.pattern==='STRONG BEARISH CANDLE',alignedBull=htfBias==='BULLISH'&&i.structure==='BULLISH',alignedBear=htfBias==='BEARISH'&&i.structure==='BEARISH';if(alignedBull&&bull&&i.rsi14<70)return {state:'BUY AREA',plan:'Wait for bullish confirmation near a defined support/reference area.',reason:'Higher-timeframe and execution-timeframe structure align bullishly, with a bullish candle signal.'};if(alignedBear&&bear&&i.rsi14>30)return {state:'SELL AREA',plan:'Wait for bearish confirmation near a defined resistance/reference area.',reason:'Higher-timeframe and execution-timeframe structure align bearishly, with a bearish candle signal.'};return {state:'WAIT',plan:alignedBull?'Wait for a bullish candle confirmation or a clean retest.':alignedBear?'Wait for a bearish candle confirmation or a clean retest.':'Wait until market structure becomes clearer.',reason:'Current evidence is mixed or lacks enough confirmation.'}}
function timeframeBias(){const ms=['4h','1h','15m','5m'].map(k=>state.markets[k]?.indicators?.structure).filter(Boolean),bull=ms.filter(x=>x==='BULLISH').length,bear=ms.filter(x=>x==='BEARISH').length;return bull>bear?'BULLISH':bear>bull?'BEARISH':'NEUTRAL'}
function qualityScore(m){const i=m?.indicators||{},c=readCandles(m),s=structureReading(m),bias=timeframeBias();let q=35;if(i.structure===bias&&bias!=='NEUTRAL')q+=20;if(c&&(c.engulfBull||c.engulfBear||c.pattern==='HAMMER'||c.pattern==='SHOOTING STAR'||c.pattern.startsWith('STRONG')))q+=15;if(s.state.includes('BREAK'))q+=10;if(Number.isFinite(i.rsi14)&&i.rsi14>45&&i.rsi14<65)q+=10;return Math.min(95,q)}
function renderTimeframes(){const map=[['4H','4h'],['1H','1h'],['15M','15m'],['5M','5m']];$('timeframes').innerHTML=map.map(([name,key])=>{const m=state.markets[key],s=m?.indicators?.structure||'—',r=m?.indicators?.rsi14;return '<div><span>'+name+'</span><b>'+s+'</b><small>RSI '+(Number.isFinite(r)?r.toFixed(1):'—')+'</small></div>'}).join('')}
function renderMain(m){const i=m.indicators||{},price=Number(m.price),bias=timeframeBias(),candle=readCandles(m),structure=structureReading(m),action=localAction(m,bias),quality=qualityScore(m);set('marketState',bias==='NEUTRAL'?'NEUTRAL CONTEXT':bias+' CONTEXT');set('bias',bias);set('biasReason',bias==='NEUTRAL'?'Timeframes are mixed; the engine remains neutral until structure separates.':bias+' is the dominant structure across the multi-timeframe scan.');set('quality',quality+' / 100');$('qualityBar').style.width=quality+'%';set('price',fmt(price));set('change',pct(m.changePercent));set('poc','Not used');set('support',fmt(i.support));set('resistance',fmt(i.resistance));set('volatility',Number.isFinite(m.volatility)?m.volatility.toFixed(3)+'% ATR':'—');const vals=[['EMA 20',fmt(i.ema20)],['EMA 50',fmt(i.ema50)],['RSI 14',Number.isFinite(i.rsi14)?i.rsi14.toFixed(1):'—'],['ATR 14',fmt(i.atr14)],['VWAP',fmt(i.vwap)],['STRUCTURE',i.structure||'—']];$('indicators').innerHTML=vals.map(x=>'<div><span>'+x[0]+'</span><b>'+x[1]+'</b></div>').join('');$('stageFlow').innerHTML=[['01','MARKET STRUCTURE',structure.state],['02','SWING RANGE',structure.hh?'HIGH TAKEN':structure.ll?'LOW TAKEN':'WITHIN RANGE'],['03','SUPPORT / RESISTANCE',fmt(i.support)+' / '+fmt(i.resistance)],['04','MOMENTUM',m.momentum||'MIXED'],['05','CANDLE CONFIRMATION',candle?.pattern||'UNAVAILABLE']].map(x=>'<div><b>'+x[0]+'</b><span>'+x[1]+'</span><strong>'+x[2]+'</strong></div>').join('');set('setupState',action.state);set('actionState',action.state);set('lastCandle',candle?.pattern||'—');set('previousCandle',candle?.prevPattern||'—');set('entryPlan',action.plan);set('actionReason',action.reason);set('dataSource','DATA SOURCE — '+(m.provider||'market API')+' · synced to TradingView symbol');const age=m.timestamp?Math.max(0,(Date.now()-new Date(m.timestamp).getTime())/1000):null;set('dataAge',age!==null?'LAST UPDATE — '+Math.round(age)+'s AGO':'LAST UPDATE — —');set('apiMode',state.ai?.available?'ENGINE — OPENAI + TECHNICAL':'ENGINE — LOCAL TECHNICAL');set('analyzedAt',new Date().toLocaleTimeString());const reasons=[candle?('Latest candle: '+candle.pattern+'. Previous: '+candle.prevPattern+'.'):'Candle data unavailable.','Structure: '+structure.state+'. '+structure.reason,'Multi-timeframe bias: '+bias+'.','EMA structure: '+(i.structure||'neutral')+'; EMA20 '+fmt(i.ema20)+', EMA50 '+fmt(i.ema50)+'.','Momentum: '+(m.momentum||'mixed')+'; RSI14 '+(Number.isFinite(i.rsi14)?i.rsi14.toFixed(1):'—')+'.','ATR volatility: '+fmt(i.atr14)+'; support '+fmt(i.support)+', resistance '+fmt(i.resistance)+'.'];$('reasoning').innerHTML=reasons.map(x=>'<li>'+esc(x)+'</li>').join('')}
async function loadMacro(){try{const [news,cal]=await Promise.all([getJson(basePath()+'api/news?asset='+encodeURIComponent(state.asset)),getJson(basePath()+'api/calendar')]);const events=[...(news.items||[]).map(x=>({title:x.title,impact:'NEWS'})),...(cal.events||[])];const high=events.filter(x=>['HIGH','EXTREME'].includes(String(x.impact).toUpperCase())).length;const risk=high?'HIGH':events.length>=3?'MEDIUM':'LOW';set('macroRisk',risk);$('macro').innerHTML=events.slice(0,6).map(x=>'<div><b>'+esc(x.title)+'</b><br><small>'+esc(x.impact||'NEWS')+'</small></div>').join('')||'No recent headlines returned.';return {news:news.items||[],calendar:cal.events||[]}}catch(e){set('macroRisk','UNAVAILABLE');$('macro').textContent='Macro feeds are unavailable. Technical analysis can still run.';return {news:[],calendar:[]}}}
async function runAIAnalysis(macro){const payload={asset:state.asset,timeframe:state.timeframe,depth:$('depth').value,markets:state.markets,news:macro?.news||[],calendar:macro?.calendar||[],chartSource:'TradingView embedded live chart; analysis is based on synchronized OHLC market data for the same instrument and timeframe.'};try{const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'AI request failed');state.ai=j;const a=j.analysis;if(!a){set('apiMode','ENGINE — LOCAL TECHNICAL');return}set('actionState',a.action_state||'WAIT');set('setupState',a.action_state||'WAIT');set('lastCandle',a.candle_reading||$('lastCandle').textContent);set('entryPlan',a.entry_plan||'—');set('actionReason',a.action_reason||a.direction_reason||'—');set('bias',a.higher_timeframe_bias||timeframeBias());set('marketState',a.market_state||'WAIT');set('quality',Number.isFinite(Number(a.analysis_quality))?Number(a.analysis_quality).toFixed(0)+' / 100':$('quality').textContent);$('qualityBar').style.width=Math.min(100,Math.max(0,Number(a.analysis_quality)||0))+'%';set('biasReason',a.direction_reason||'');set('apiMode','ENGINE — OPENAI + TECHNICAL + NEWS');const rr=Array.isArray(a.reasoning)?a.reasoning:[];if(rr.length)$('reasoning').innerHTML=rr.map(x=>'<li>'+esc(x)+'</li>').join('');if(a.news_assessment||a.news_events?.length){set('macroRisk',a.news_events?.length?'REVIEW':'LOW');$('macro').innerHTML='<p>'+esc(a.news_assessment||'')+'</p>'+(a.news_events||[]).map(x=>'<div><small>'+esc(x)+'</small></div>').join('')}}catch(e){state.ai={available:false,error:e.message};set('apiMode','ENGINE — LOCAL TECHNICAL')}}
async function analyzeMarket(){const btn=$('analyzeMarket');btn.disabled=true;btn.innerHTML='Analyzing…';status(false,'LOADING');state.asset=$('asset').value;state.timeframe=$('timeframe').value;mountTradingView();try{const tfs=['4h','1h','15m','5m'],loaded=await Promise.allSettled(tfs.map(loadMarket));state.markets={};loaded.forEach((r,i)=>{if(r.status==='fulfilled')state.markets[tfs[i]]=r.value});const m=state.markets[state.timeframe]||state.markets['15m']||state.markets['5m']||state.markets['1h']||state.markets['4h'];if(!m)throw new Error('No live market-data endpoint is reachable. Deploy the API on Vercel for server-side market access.');state.current=m;renderTimeframes();renderMain(m);const macro=await loadMacro();await runAIAnalysis(macro);if(state.ai?.analysis)recordSignal(state.ai.analysis);resolveOpenSignals(m);status(true,state.ai?.analysis?'LIVE + AI':'LIVE + LOCAL')}catch(e){status(false,'DATA OFFLINE');set('marketState','DATA UNAVAILABLE');set('bias','NEUTRAL');set('biasReason',e.message);set('dataSource','DATA SOURCE — unavailable')}finally{btn.disabled=false;btn.innerHTML='Analyze Market <span>↗</span>'}}
document.addEventListener('DOMContentLoaded',()=>{
 state.asset=$('asset').value;state.timeframe=$('timeframe').value;
 document.querySelectorAll('.asset-tab').forEach(tab=>tab.addEventListener('click',()=>{state.asset=tab.dataset.chartAsset;$('asset').value=state.asset;mountTradingView()}));
 $('asset').addEventListener('change',()=>{state.asset=$('asset').value;mountTradingView()});
 $('timeframe').addEventListener('change',()=>{state.timeframe=$('timeframe').value;mountTradingView()});
 $('analyzeMarket').addEventListener('click',analyzeMarket);
 mountTradingView();
 analyzeMarket();
});


function signalStore(){
  try{return JSON.parse(localStorage.getItem(SIGNAL_KEY)||'[]')}catch(e){return []}
}
function saveSignals(items){localStorage.setItem(SIGNAL_KEY,JSON.stringify(items))}
function weekStart(d=new Date()){
  const x=new Date(d); const day=x.getDay(); const diff=day===0?-6:1-day;
  x.setDate(x.getDate()+diff); x.setHours(0,0,0,0); return x;
}
function currentWeekSignals(){
  const start=weekStart();
  return signalStore().filter(s=>new Date(s.createdAt)>=start);
}
function recordSignal(a){
  if(!a)return;
  const direction=String(a.action_state||'').toUpperCase();
  if(!['BUY','SELL','BUY AREA','SELL AREA'].some(x=>direction===x))return;
  const entry=Number(a.entry_price),sl=Number(a.stop_loss),tp=Number(a.take_profit_1);
  if(!Number.isFinite(entry)||!Number.isFinite(sl)||!Number.isFinite(tp))return;
  const items=signalStore();
  const last=items[0];
  if(last && last.asset===state.asset && last.timeframe===state.timeframe && Date.now()-new Date(last.createdAt).getTime()<300000)return;
  items.unshift({id:Date.now().toString(),createdAt:new Date().toISOString(),asset:state.asset,timeframe:state.timeframe,direction:direction.includes('SELL')?'SELL':'BUY',entry,sl,tp,tp2:Number.isFinite(Number(a.take_profit_2))?Number(a.take_profit_2):null,status:'OPEN',resolvedAt:null});
  saveSignals(items.slice(0,500));
}
function resolveOpenSignals(m){
  const price=Number(m?.price); if(!Number.isFinite(price))return;
  const items=signalStore(); let changed=false;
  for(const s of items){
    if(s.status!=='OPEN'||s.asset!==state.asset)continue;
    if(s.direction==='BUY'){
      if(price<=s.sl){s.status='LOST';s.resolvedAt=new Date().toISOString();changed=true}
      else if(price>=s.tp){s.status='WON';s.resolvedAt=new Date().toISOString();changed=true}
    }else{
      if(price>=s.sl){s.status='LOST';s.resolvedAt=new Date().toISOString();changed=true}
      else if(price<=s.tp){s.status='WON';s.resolvedAt=new Date().toISOString();changed=true}
    }
  }
  if(changed)saveSignals(items);
}
function drawPerformanceCharts(items){
  const resolved=items.filter(s=>s.status==='WON'||s.status==='LOST');
  const pie=$('performancePie'),bar=$('performanceBar');
  if(!pie||!bar)return;
  const p=pie.getContext('2d'),b=bar.getContext('2d');
  p.clearRect(0,0,pie.width,pie.height);b.clearRect(0,0,bar.width,bar.height);
  const won=resolved.filter(s=>s.status==='WON').length,lost=resolved.filter(s=>s.status==='LOST').length,total=won+lost;
  const cx=140,cy=140,r=92;
  p.strokeStyle='#dce2e7';p.lineWidth=1;
  if(!total){p.beginPath();p.arc(cx,cy,r,0,Math.PI*2);p.stroke();p.fillStyle='#707b84';p.font='12px Inter';p.textAlign='center';p.fillText('No resolved signals',cx,cy+5)}
  else{
    let angle=-Math.PI/2;
    [[won,'#176b4e'],[lost,'#a63f4c']].forEach(([v,color])=>{const next=angle+(v/total)*Math.PI*2;p.beginPath();p.moveTo(cx,cy);p.arc(cx,cy,r,angle,next);p.closePath();p.fillStyle=color;p.fill();angle=next});
    p.fillStyle='#fbfcfd';p.beginPath();p.arc(cx,cy,48,0,Math.PI*2);p.fill();
    p.fillStyle='#14191d';p.font='700 22px DM Mono';p.textAlign='center';p.fillText(String(total),cx,cy+7);
  }
  p.textAlign='left';p.font='600 11px Inter';p.fillStyle='#176b4e';p.fillText('WON  '+won,260,110);p.fillStyle='#a63f4c';p.fillText('LOST '+lost,260,140);
  const labels=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const counts=labels.map((_,i)=>({won:0,lost:0}));
  resolved.forEach(s=>{const d=new Date(s.resolvedAt||s.createdAt);let idx=d.getDay()-1;if(idx<0)idx=6;if(idx>=0&&idx<7)counts[idx][s.status==='WON'?'won':'lost']++});
  const max=Math.max(1,...counts.map(x=>Math.max(x.won,x.lost)));
  const base=245,top=35,left=45,width=550,height=210,slot=width/7;
  b.strokeStyle='#dce2e7';b.lineWidth=1;b.beginPath();b.moveTo(left,base);b.lineTo(left+width,base);b.stroke();
  labels.forEach((lab,i)=>{const x=left+i*slot+slot/2;const bw=15;const wh=counts[i].won/max*height;const lh=counts[i].lost/max*height;b.fillStyle='#176b4e';b.fillRect(x-bw-2,base-wh,bw,wh);b.fillStyle='#a63f4c';b.fillRect(x+2,base-lh,bw,lh);b.fillStyle='#707b84';b.font='10px DM Mono';b.textAlign='center';b.fillText(lab,x,265)});
}
function renderPerformance(){
  const items=currentWeekSignals(),resolved=items.filter(s=>s.status==='WON'||s.status==='LOST'),won=resolved.filter(s=>s.status==='WON').length,lost=resolved.filter(s=>s.status==='LOST').length;
  set('perfTotal',items.length);set('perfWon',won);set('perfLost',lost);set('perfRate',resolved.length?Math.round(won/resolved.length*100)+'%':'—');
  const start=weekStart(),end=new Date(start);end.setDate(end.getDate()+6);
  set('performanceWeek',start.toLocaleDateString(undefined,{day:'2-digit',month:'short'})+' — '+end.toLocaleDateString(undefined,{day:'2-digit',month:'short'}));
  const hist=$('signalHistory');
  hist.innerHTML=items.length?items.slice(0,100).map(s=>'<div class="signal-row"><div><b>'+esc(s.direction)+' · '+esc(s.asset)+'</b><small>'+new Date(s.createdAt).toLocaleString()+' · '+esc(s.timeframe)+'</small></div><div><span>ENTRY '+fmt(s.entry)+'</span><span>SL '+fmt(s.sl)+'</span><span>TP '+fmt(s.tp)+'</span></div><strong class="result-'+s.status.toLowerCase()+'">'+esc(s.status)+'</strong></div>').join(''):'<p class="muted">No signals recorded this week.</p>';
  drawPerformanceCharts(items);
}
function showPage(page){
  state.activePage=page;
  $('analyzerPage').hidden=page!=='analyzer';
  $('performancePage').hidden=page!=='performance';
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  if(page==='performance')renderPerformance();
}
