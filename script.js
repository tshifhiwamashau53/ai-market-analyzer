const $ = id => document.getElementById(id);
const input = $('chartInput'), dropzone = $('dropzone'), previewWrap = $('previewWrap'), preview = $('chartPreview'), analyzeBtn = $('analyzeBtn');
let imageReady = false, localVisual = null;
const setText = (id,v) => { const e=$(id); if(e) e.textContent = v ?? '—'; };
const esc = (v='') => String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const status = t => setText('analysisMeta',t);

function showPreview(file){
 if(!file)return;
 if(!file.type?.startsWith('image/'))return alert('Please select a PNG, JPG or WEBP chart screenshot.');
 if(file.size>10*1024*1024)return alert('Please choose an image smaller than 10 MB.');
 const r=new FileReader();
 r.onload=()=>{preview.onload=()=>{imageReady=true;previewWrap.hidden=false;dropzone.hidden=true;status(`${file.name} · screenshot loaded`);localVisual=analyzeChartImage(preview);setTimeout(runScreenshotAnalysis,150);};preview.onerror=()=>{imageReady=false;localVisual=null;alert('The image could not be read.');};preview.src=r.result;};r.readAsDataURL(file);
}
input.addEventListener('change',e=>showPreview(e.target.files?.[0]));
dropzone.addEventListener('click',e=>{if(e.target!==input)input.click();});
dropzone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}});
['dragenter','dragover'].forEach(t=>dropzone.addEventListener(t,e=>{e.preventDefault();dropzone.classList.add('dragover');}));
['dragleave','drop'].forEach(t=>dropzone.addEventListener(t,e=>{e.preventDefault();dropzone.classList.remove('dragover');}));
dropzone.addEventListener('drop',e=>showPreview(e.dataTransfer?.files?.[0]));
$('removeImage').addEventListener('click',()=>{input.value='';preview.src='';previewWrap.hidden=true;dropzone.hidden=false;imageReady=false;localVisual=null;resetResults();status('Upload a chart screenshot to begin');});
analyzeBtn.addEventListener('click',runScreenshotAnalysis);

function resetResults(){
 setText('bias','WAIT');setText('biasReason','Upload a chart screenshot.');setText('confidence','—');
 if($('confidenceBar'))$('confidenceBar').style.width='0%';
 setText('currentPrice','Not extracted');setText('currentPriceNote','Exact prices are not invented from screenshot pixels.');setText('sourceNote','Local screenshot analysis');
 setText('entryLevel','Visual zone');setText('stopLossLevel','Visual invalidation');setText('tp1Level','Next visible zone');setText('tp2Level','Next major zone');setText('tp3Level','Extended zone');
 if($('reasoning'))$('reasoning').innerHTML='<li>Waiting for screenshot analysis.</li><li>No paid AI API is required.</li>';
 setText('researchSummary','Upload your chart screenshot. Analysis runs locally in your browser.');
 if($('warningBox'))$('warningBox').hidden=true;
}

function analyzeChartImage(img){
 try{
  const iw=img.naturalWidth||img.width, ih=img.naturalHeight||img.height;
  if(!iw||!ih)return{available:false,signals:['Image dimensions could not be read.']};
  const scale=Math.min(1,1400/iw),w=Math.max(1,Math.round(iw*scale)),h=Math.max(1,Math.round(ih*scale));
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);const p=ctx.getImageData(0,0,w,h).data;
  let red=0,green=0,dark=0,bright=0,colored=0;const col=new Array(w).fill(0),row=new Array(h).fill(0),redCol=new Array(w).fill(0),greenCol=new Array(w).fill(0);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=(y*w+x)*4,r=p[i],g=p[i+1],b=p[i+2],mx=Math.max(r,g,b);if(mx>215)bright++;if(mx<65)dark++;
   const R=r>115&&r>g*1.22&&r>b*1.12,G=g>95&&g>r*1.16&&g>b*1.03;
   if(R||G){colored++;col[x]++;row[y]++;if(R){red++;redCol[x]++;}if(G){green++;greenCol[x]++;}}
  }
  const density=Math.round(colored/(w*h)*100),colorRatio=colored/Math.max(1,w*h);
  const visualBias=colored<30?'NEUTRAL':green>red*1.1?'BULLISH':red>green*1.1?'BEARISH':'NEUTRAL';
  const background=dark>bright?'DARK':'LIGHT';

  // Find the likely chart plot area by locating sustained colored activity. This reduces the effect of logos, menus and sidebars.
  const activeCols=[];const colCut=Math.max(2,Math.round(h*.004));
  for(let x=0;x<w;x++)if(col[x]>=colCut)activeCols.push(x);
  let plotL=0,plotR=w-1;
  if(activeCols.length>20){plotL=Math.max(0,Math.min(...activeCols)-Math.round(w*.01));plotR=Math.min(w-1,Math.max(...activeCols)+Math.round(w*.01));}

  // Candle-like columns: narrow vertical colored structures with a meaningful local peak.
  const candleCandidates=[];
  const step=Math.max(1,Math.round(w/900));
  for(let x=plotL;x<=plotR;x+=step){
   const height=col[x],r=redCol[x],g=greenCol[x];
   if(height<Math.max(3,Math.round(h*.012))||Math.max(r,g)<2)continue;
   const left=col[Math.max(plotL,x-step)],right=col[Math.min(plotR,x+step)];
   if(height>=left*.75&&height>=right*.75){
    const bias=g>r*1.12?'BULLISH':r>g*1.12?'BEARISH':'MIXED';
    candleCandidates.push({x,height,r,g,bias});
   }
  }
  // Merge neighboring detections into candle groups.
  const candles=[];
  for(const q of candleCandidates){const last=candles[candles.length-1];if(last&&q.x-last.x<=Math.max(3,w*.012)){last.x=Math.round((last.x+q.x)/2);last.height=Math.max(last.height,q.height);last.r=Math.max(last.r,q.r);last.g=Math.max(last.g,q.g);}else candles.push({...q});}
  const usable=candles.slice(-60);

  // Estimate each candle's vertical center from its colored pixels.
  for(const cd of usable){
   const x=Math.round(cd.x),radius=Math.max(1,Math.round(w*.004));let ys=[],rs=0,gs=0;
   for(let xx=Math.max(plotL,x-radius);xx<=Math.min(plotR,x+radius);xx++){
    for(let y=0;y<h;y++){const i=(y*w+xx)*4,r=p[i],g=p[i+1],b=p[i+2],R=r>115&&r>g*1.22&&r>b*1.12,G=g>95&&g>r*1.16&&g>b*1.03;if(R||G){ys.push(y);if(R)rs++;if(G)gs++;}}
   }
   if(ys.length){cd.high=Math.min(...ys);cd.low=Math.max(...ys);cd.mid=(cd.high+cd.low)/2;cd.bodyBias=gs>rs*1.12?'BULLISH':rs>gs*1.12?'BEARISH':'MIXED';}
  }

  // Market structure from the sequence of detected candle midpoints.
  const pts=usable.filter(x=>Number.isFinite(x.mid));let movement='RANGE / UNCLEAR';let slope=0;
  if(pts.length>=5){const first=pts.slice(0,Math.max(2,Math.floor(pts.length*.35))).reduce((a,b)=>a+b.mid,0)/Math.max(2,Math.floor(pts.length*.35));const last=pts.slice(-Math.max(2,Math.floor(pts.length*.35))).reduce((a,b)=>a+b.mid,0)/Math.max(2,Math.floor(pts.length*.35));slope=first-last;const threshold=h*.025;if(slope>threshold)movement='UPWARD';else if(slope<-threshold)movement='DOWNWARD';}
  const highs=[],lows=[];
  for(let i=2;i<pts.length-2;i++){if(pts[i].high<pts[i-1].high&&pts[i].high<pts[i+1].high)highs.push(pts[i]);if(pts[i].low>pts[i-1].low&&pts[i].low>pts[i+1].low)lows.push(pts[i]);}
  let structure='UNCLEAR';
  if(highs.length>=2&&lows.length>=2){const hh=highs.at(-1).high<highs.at(-2).high,hl=lows.at(-1).low<lows.at(-2).low;const lh=highs.at(-1).high>highs.at(-2).high,ll=lows.at(-1).low>lows.at(-2).low;if(hh&&hl)structure='HIGHER HIGHS / HIGHER LOWS';else if(lh&&ll)structure='LOWER HIGHS / LOWER LOWS';else structure='MIXED / RANGE';}

  // Wick/rejection and BOS/CHOCH heuristics from recent extrema.
  let rejection='NONE DETECTED',bos='NONE DETECTED',sweep='NONE DETECTED';
  if(pts.length>=6){const recent=pts.slice(-6),last=recent.at(-1);const range=Math.max(...recent.map(q=>q.low))-Math.min(...recent.map(q=>q.high));const body=Math.max(2,Math.abs((recent.at(-2)?.mid||last.mid)-last.mid));const upper=last.mid-last.high,lower=last.low-last.mid;if(lower>body*1.8&&lower>range*.18)rejection='LOWER-WICK REJECTION';if(upper>body*1.8&&upper>range*.18)rejection='UPPER-WICK REJECTION';const priorHigh=Math.min(...recent.slice(0,-1).map(q=>q.high)),priorLow=Math.max(...recent.slice(0,-1).map(q=>q.low));if(last.high<priorHigh&&last.low<priorLow)bos='BEARISH BREAK';if(last.high>priorHigh&&last.low>priorLow)bos='BULLISH BREAK';if((last.low<priorLow&&last.mid>priorLow)||(last.high>priorHigh&&last.mid<priorHigh))sweep='POSSIBLE LIQUIDITY SWEEP';}

  // Horizontal zones: repeated rows of activity, reported only as chart percentages.
  const rowThreshold=Math.max(3,Math.round(w*.006)),rows=[];for(let y=0;y<h;y++)if(row[y]>=rowThreshold)rows.push(y);const clusters=[];
  for(const y of rows){const last=clusters.at(-1);if(!last||y-last.at(-1)>Math.max(4,h*.012))clusters.push([y]);else last.push(y);}
  const centers=clusters.filter(a=>a.length>=2).map(a=>Math.round(a.reduce((x,y)=>x+y,0)/a.length));
  const upper=centers.filter(y=>y<h*.45).slice(0,3),lower=centers.filter(y=>y>h*.55).slice(-3);

  let confidence=42; if(visualBias!=='NEUTRAL')confidence+=10;if(movement!=='RANGE / UNCLEAR')confidence+=8;if(structure!=='UN CLEAR'&&structure!=='UN CLEAR')confidence+=8;if(rejection!=='NONE DETECTED')confidence+=6;if(bos!=='NONE DETECTED')confidence+=7;if(sweep!=='NONE DETECTED')confidence+=5;if(pts.length>=8)confidence+=5;if(colorRatio>.18)confidence-=10;confidence=Math.max(30,Math.min(91,confidence));
  const signals=[
   `${visualBias==='NEUTRAL'?'No strong':visualBias==='BULLISH'?'Bullish':'Bearish'} candle-color bias detected.`,
   `Detected ${pts.length} candle-like structures in the active chart area.`,
   `Visual movement: ${movement}.`,
   `Market structure estimate: ${structure}.`,
   `Candle rejection: ${rejection}.`,
   `Break-of-structure heuristic: ${bos}.`,
   `Liquidity sweep heuristic: ${sweep}.`,
   `Chart color activity: ${density}% of sampled pixels.`,
   `Detected ${green.toLocaleString()} bullish-color pixels vs ${red.toLocaleString()} bearish-color pixels.`
  ];
  if(colorRatio>.18)signals.push('High color coverage detected; indicators or chart UI may distort pixel detection.');
  return{available:true,width:w,height:h,visualBias,movement,structure,rejection,bos,sweep,confidence,background,density,green,red,upper,lower,candles:pts,signals};
 }catch(e){return{available:false,signals:['The screenshot loaded, but local image analysis failed.']};}
}

function runScreenshotAnalysis(){
 if(!imageReady||!localVisual){status('Upload a chart screenshot first');return;}
 status('Analyzing candles and market structure locally…');const v=localVisual;
 let bias=v.visualBias;
 if(v.bos==='BULLISH BREAK'||v.sweep==='POSSIBLE LIQUIDITY SWEEP'&&v.rejection==='LOWER-WICK REJECTION')bias='BULLISH';
 else if(v.bos==='BEARISH BREAK'||v.sweep==='POSSIBLE LIQUIDITY SWEEP'&&v.rejection==='UPPER-WICK REJECTION')bias='BEARISH';
 else if(bias==='NEUTRAL')bias=v.movement==='UPWARD'?'BULLISH':v.movement==='DOWNWARD'?'BEARISH':'NEUTRAL';
 if(v.structure==='HIGHER HIGHS / HIGHER LOWS'&&bias==='BEARISH')bias='WAIT';
 if(v.structure==='LOWER HIGHS / LOWER LOWS'&&bias==='BULLISH')bias='WAIT';
 const confidence=bias==='WAIT'?Math.max(30,(v.confidence||50)-12):(v.confidence||50);
 setText('bias',bias==='BULLISH'?'BUY BIAS':bias==='BEARISH'?'SELL BIAS':'WAIT');
 setText('biasReason',bias==='BULLISH'?'Bullish structure or rejection is visible. Wait for confirmation before entry.':bias==='BEARISH'?'Bearish structure or rejection is visible. Wait for confirmation before entry.':'Signals conflict or the screenshot does not provide enough structure. WAIT is safer.');
 setText('confidence',confidence);if($('confidenceBar'))$('confidenceBar').style.width=`${confidence}%`;
 setText('currentPrice','Not reliably extracted');setText('currentPriceNote','Exact prices require OCR or verified OHLC data; this version does not invent them.');setText('sourceNote','Local browser image analysis');
 setText('entryLevel',bias==='BULLISH'?'Retest support / bullish confirmation':bias==='BEARISH'?'Retest resistance / bearish confirmation':'No clear entry');
 setText('stopLossLevel',bias==='BULLISH'?'Below recent swing low':bias==='BEARISH'?'Above recent swing high':'Not recommended');
 setText('tp1Level',bias==='BULLISH'?'Nearest resistance zone':bias==='BEARISH'?'Nearest support zone':'—');setText('tp2Level',bias==='BULLISH'?'Next structure high':bias==='BEARISH'?'Next structure low':'—');setText('tp3Level',bias==='BULLISH'?'Extended resistance':'Extended support');
 const reasons=[...v.signals,`Background detected as ${v.background}.`,v.lower.length?`Possible support zones: ${v.lower.map(z=>Math.round(z/v.height*100)+'% chart height').join(', ')}.`:'No reliable lower support zone detected.',v.upper.length?`Possible resistance zones: ${v.upper.map(z=>Math.round(z/v.height*100)+'% chart height').join(', ')}.`:'No reliable upper resistance zone detected.','Exact entry, SL and TP prices are intentionally not fabricated from image pixels.'];
 if($('reasoning'))$('reasoning').innerHTML=reasons.map(x=>`<li>${esc(x)}</li>`).join('');
 setText('researchSummary',bias==='BULLISH'?'The local engine found a bullish visual setup using candle color, structure and rejection/BOS heuristics. This is an estimate, not a guaranteed trade signal.':bias==='BEARISH'?'The local engine found a bearish visual setup using candle color, structure and rejection/BOS heuristics. This is an estimate, not a guaranteed trade signal.':'The local engine found mixed or insufficient evidence. WAIT is the current result.');
 if($('warningBox')){$('warningBox').hidden=false;$('warningBox').textContent='Screenshot-only mode: no TradingView, MT5, live feed, news or paid AI API is used. Candle detection and structure recognition are local image heuristics and can be wrong.';}
 status('LOCAL CANDLE + STRUCTURE ANALYSIS COMPLETE');
}
resetResults();
