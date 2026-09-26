const $=id=>document.getElementById(id);
const state={asset:'XAUUSD',timeframe:'15m',markets:{},current:null,image:null,visual:null};

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
function analysisImage(){
  const img=$('chartPreview');
  if(!img?.naturalWidth) return null;
  const max=1400, scale=Math.min(1,max/img.naturalWidth), w=Math.max(1,Math.round(img.naturalWidth*scale)), h=Math.max(1,Math.round(img.naturalHeight*scale));
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const x=c.getContext('2d'); x.drawImage(img,0,0,w,h);
  return c.toDataURL('image/jpeg',0.78);
}
async function runAIAnalysis(){
  const payload={asset:state.asset,timeframe:state.timeframe,depth:$('depth')?.value||'deep',markets:state.markets,visualAnalysis:state.visual,strategy:'NONE — use pure technical analysis: market structure, candle-by-candle price action, support/resistance, trend, momentum, volatility, and multi-timeframe context. Identify candle patterns such as doji, hammer, shooting star, engulfing, pin bar, inside bar and strong momentum candles. Explain the evidence for bullish, bearish or neutral direction. Classify the actionable state as BUY AREA, SELL AREA, WAIT, or NO TRADE. Provide conditional entry/reference levels, invalidation and targets only when supported by the data. Do not use the old accumulation/volume-profile/breakout strategy.'};
  const image=analysisImage(); if(image) payload.image=image;
  try{
    set('apiMode','ENGINE — AI TECHNICAL + FUNDAMENTAL ANALYSIS'); status(true,'AI CONNECTED');
    const r=await fetch(apiBase()+'analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error||'OpenAI analysis unavailable');
    const a=j.analysis||{};
    if(a.market_state) set('marketState',a.market_state==='WAIT'?'WAIT / NEUTRAL':a.market_state+' CONTEXT');
    if(a.higher_timeframe_bias) set('bias',a.higher_timeframe_bias);
    if(a.summary) set('biasReason',a.summary);
    if(Number.isFinite(Number(a.analysis_quality))){const q=Math.max(0,Math.min(100,Number(a.analysis_quality)));set('quality',Math.round(q)+' / 100');$('qualityBar').style.width=q+'%';}
    if(a.setup_stage) set('setupState',a.setup_stage); if(a.reference_level!==null&&a.reference_level!==undefined) set('support',fmt(a.reference_level)); if(a.invalidation_level!==null&&a.invalidation_level!==undefined) set('resistance',fmt(a.invalidation_level));
    if(a.poc!==null&&a.poc!==undefined) set('poc',fmt(a.poc));
    const reasons=[a.candle_reading?'Candle reading: '+a.candle_reading:'',a.direction_reason?'Direction: '+a.direction_reason:'',a.action_reason?'Action timing: '+a.action_reason:'',a.entry_plan?'Entry plan: '+a.entry_plan:'',a.news_assessment?'News assessment: '+a.news_assessment:'',...(Array.isArray(a.reasoning)?a.reasoning:[]),a.waiting_for?'Waiting for: '+a.waiting_for:'',a.data_quality?'Data quality: '+a.data_quality:''].filter(Boolean);
    if(reasons.length) $('reasoning').innerHTML=reasons.slice(0,8).map(x=>'<li>'+esc(x)+'</li>').join('');
    state.ai=a; set('analyzedAt',new Date().toLocaleTimeString());
  }catch(e){
    set('apiMode','ENGINE — LOCAL FALLBACK');
    const li=$('reasoning'); if(li) li.innerHTML += '<li>OpenAI layer unavailable: '+esc(e.message)+'</li>';
    status(true,'MARKET DATA');
  }
}
async function loadMacro(){try{const [news,cal]=await Promise.all([getJson(basePath()+'api/news?asset='+encodeURIComponent(state.asset)),getJson(basePath()+'api/calendar')]);const count=(news.items||[]).length+(cal.events||[]).length,risk=count>=8?'HIGH':count>=3?'MEDIUM':'LOW';set('macroRisk',risk);$('macro').innerHTML=(news.items||[]).slice(0,4).map(x=>'<div><b>'+esc(x.title)+'</b><br><small>'+esc(x.source||'News')+' · '+esc(x.pubDate||'')+'</small></div>').join('')||'No recent headlines returned.'}catch(e){set('macroRisk','UNAVAILABLE');$('macro').textContent='Macro feeds are unavailable. Technical analysis can still run from market data.'}}
async function analyzeMarket(){
 const btn=$('analyzeMarket');btn.disabled=true;btn.innerHTML='Analyzing…';status(false,'LOADING');state.asset=$('asset').value;state.timeframe=$('timeframe').value;
 try{const tfs=['4h','1h','15m','5m'],loaded=await Promise.allSettled(tfs.map(loadMarket));state.markets={};loaded.forEach((r,i)=>{if(r.status==='fulfilled')state.markets[tfs[i]]=r.value});const m=state.markets[state.timeframe]||state.markets['15m']||state.markets['5m']||state.markets['1h']||state.markets['4h'];if(!m)throw new Error('No verified market-data endpoint is reachable. GitHub Pages is static, so the live API must be deployed separately.');state.current=m;const setup=classifyStages(state.markets['4h'],state.markets['1h'],state.markets['15m'],state.markets['5m']);renderTimeframes();renderMain(m,setup);await loadMacro();await runAIAnalysis();status(true,'LIVE + AI')}catch(e){status(false,'DATA OFFLINE');set('marketState','DATA UNAVAILABLE');set('bias','NEUTRAL');set('biasReason',e.message);set('dataSource','DATA SOURCE — unavailable')}finally{btn.disabled=false;btn.innerHTML='Analyze Market <span>↗</span>'}
}

function visualDetect(img){
 const max=1500,s=Math.min(1,max/img.naturalWidth),w=Math.max(1,Math.round(img.naturalWidth*s)),h=Math.max(1,Math.round(img.naturalHeight*s)),c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,w,h);const d=x.getImageData(0,0,w,h).data;let bull=0,bear=0,top=h,bottom=0;
 for(let y=0;y<h;y++)for(let xx=0;xx<w*.84;xx++){const i=(y*w+xx)*4,r=d[i],g=d[i+1],b=d[i+2];if(g>90&&g>r*1.15&&g>b*1.03&&g-r>18){bull++;top=Math.min(top,y);bottom=Math.max(bottom,y)}else if(r>100&&r>g*1.18&&r>b*1.08&&r-g>20){bear++;top=Math.min(top,y);bottom=Math.max(bottom,y)}}
 const total=bull+bear,bias=total<30?'NEUTRAL':bull>bear*1.18?'BULLISH':bear>bull*1.18?'BEARISH':'NEUTRAL';return {available:total>=30,bias,bull,bear,width:w,height:h,top,bottom}
}
function drawAnnotation(v){
 const img=$('chartPreview'),canvas=$('annotationCanvas');if(!img?.naturalWidth||!v)return;const s=Math.min(1,1800/img.naturalWidth),w=Math.round(img.naturalWidth*s),h=Math.round(img.naturalHeight*s);canvas.width=w;canvas.height=h;const c=canvas.getContext('2d');c.drawImage(img,0,0,w,h);const x0=w*.05,x1=w*.88,y=(v.top+v.bottom)/2;
 c.save();c.setLineDash([10,7]);c.lineWidth=3;c.strokeStyle=v.bias==='BULLISH'?'#176b4e':v.bias==='BEARISH'?'#a63f4c':'#176a9b';c.beginPath();c.moveTo(x0,y);c.lineTo(x1,y);c.stroke();c.setLineDash([]);c.fillStyle='rgba(20,25,29,.9)';c.fillRect(14,14,220,36);c.fillStyle='#fff';c.font='800 16px Inter,Arial';c.fillText(v.bias==='NEUTRAL'?'WAIT / NEUTRAL':v.bias+' VISUAL BIAS',25,38);
 if(v.bias!=='NEUTRAL'){const spread=Math.max(24,(v.bottom-v.top)*.18),entry=y,sl=v.bias==='BULLISH'?y+spread:y-spread,tp1=v.bias==='BULLISH'?y-spread*1.8:y+spread*1.8,tp2=v.bias==='BULLISH'?y-spread*2.7:y+spread*2.7;drawLine(entry,'REFERENCE','#176a9b');drawLine(sl,'INVALIDATION','#a63f4c');drawLine(tp1,'TARGET 1','#176b4e');drawLine(tp2,'TARGET 2','#176b4e')}
 c.restore();function drawLine(yy,label,col){c.save();c.strokeStyle=col;c.lineWidth=2;c.setLineDash([7,7]);c.beginPath();c.moveTo(x0,yy);c.lineTo(x1,yy);c.stroke();c.setLineDash([]);c.fillStyle=col;c.fillRect(x0,yy-13,105,24);c.fillStyle='#fff';c.font='700 10px Inter,Arial';c.fillText(label,x0+7,yy+3);c.restore()}$('annotationPanel').hidden=false;state.annotationData=canvas.toDataURL('image/png')
}
function analyzeScreenshot(){const img=$('chartPreview');if(!img?.naturalWidth)return;const v=visualDetect(img);state.visual=v;set('visualState',v.bias);set('visualReason',v.available?'Detected '+v.bull+' bullish-colour pixels and '+v.bear+' bearish-colour pixels. This is a visual proxy, not price OCR.':'Not enough reliable candle-colour pixels were detected.');drawAnnotation(v)}
function setupUpload(){
 const input=$('chartInput'),preview=$('chartPreview');input.addEventListener('change',()=>{const f=input.files?.[0];if(!f)return;if(!f.type.startsWith('image/')){alert('Choose a chart image.');return}if(f.size>25*1024*1024){alert('Choose an image smaller than 25 MB.');return}const r=new FileReader();r.onload=()=>{preview.onload=()=>{$('previewWrap').hidden=false;$('dropzone').hidden=true;$('analyzeChart').disabled=false;analyzeScreenshot()};preview.src=r.result};r.readAsDataURL(f)});
 $('removeImage').addEventListener('click',()=>{input.value='';preview.src='';$('previewWrap').hidden=true;$('dropzone').hidden=false;$('analyzeChart').disabled=true;$('annotationPanel').hidden=true});$('analyzeChart').addEventListener('click',analyzeScreenshot);$('saveOriginal').addEventListener('click',()=>{if(!preview.src)return;const a=document.createElement('a');a.href=preview.src;a.download='chart-original.png';a.click()});$('saveAnnotated').addEventListener('click',()=>{if(!state.annotationData)analyzeScreenshot();if(!state.annotationData)return;const a=document.createElement('a');a.href=state.annotationData;a.download='chart-analysis.png';a.click()})
}
document.addEventListener('DOMContentLoaded',()=>{setupUpload();$('asset').addEventListener('change',()=>{state.asset=$('asset').value});$('timeframe').addEventListener('change',()=>{state.timeframe=$('timeframe').value});$('analyzeMarket').addEventListener('click',analyzeMarket);analyzeMarket()});