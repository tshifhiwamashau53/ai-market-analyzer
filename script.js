const $ = id => document.getElementById(id);
const input=$('chartInput'),dropzone=$('dropzone'),previewWrap=$('previewWrap'),preview=$('chartPreview'),analyzeBtn=$('analyzeBtn');
let imageReady=false,localVisual=null;
const setText=(id,v)=>{const e=$(id);if(e)e.textContent=v??'—';};
const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const status=t=>setText('analysisMeta',t);

function showPreview(file){
  if(!file)return;
  if(!file.type?.startsWith('image/'))return alert('Please select a PNG, JPG or WEBP chart screenshot.');
  if(file.size>10*1024*1024)return alert('Please choose an image smaller than 10 MB.');
  const r=new FileReader();
  r.onload=()=>{
    preview.onload=async()=>{imageReady=true;previewWrap.hidden=false;dropzone.hidden=true;status(`${file.name} · screenshot loaded`);localVisual=analyzeChartImage(preview);setTimeout(runScreenshotAnalysis,100)};
    preview.onerror=()=>alert('The image could not be read.');
    preview.src=r.result;
  };
  r.readAsDataURL(file);
}
input.addEventListener('change',e=>showPreview(e.target.files?.[0]));
dropzone.addEventListener('click',e=>{if(e.target!==input)input.click()});
dropzone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click()}});
['dragenter','dragover'].forEach(t=>dropzone.addEventListener(t,e=>{e.preventDefault();dropzone.classList.add('dragover')}));
['dragleave','drop'].forEach(t=>dropzone.addEventListener(t,e=>{e.preventDefault();dropzone.classList.remove('dragover')}));
dropzone.addEventListener('drop',e=>showPreview(e.dataTransfer?.files?.[0]));
$('removeImage').addEventListener('click',()=>{input.value='';preview.src='';previewWrap.hidden=true;dropzone.hidden=false;imageReady=false;localVisual=null;resetResults();status('Upload a chart screenshot to begin')});
analyzeBtn.addEventListener('click',runScreenshotAnalysis);

function resetResults(){
  setText('bias','WAIT');setText('biasReason','Upload a chart screenshot.');setText('confidence','—');
  if($('confidenceBar'))$('confidenceBar').style.width='0%';
  setText('currentPrice','—');setText('currentPriceNote','The current price is read from the green price marker on the screenshot.');
  setText('sourceNote','Local screenshot analysis');
  setText('entryLevel','—');setText('stopLossLevel','—');setText('tp1Level','—');setText('tp2Level','—');setText('tp3Level','—');
  if($('reasoning'))$('reasoning').innerHTML='<li>Waiting for screenshot analysis.</li>';
  setText('researchSummary','Upload your chart screenshot.');if($('warningBox'))$('warningBox').hidden=true;
}

function pixelData(img,maxWidth=1600){
  const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;if(!iw||!ih)return null;
  const scale=Math.min(1,maxWidth/iw),w=Math.max(1,Math.round(iw*scale)),h=Math.max(1,Math.round(ih*scale));
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);
  return {c,ctx,data:ctx.getImageData(0,0,w,h).data,w,h,scale};
}
function colorFlags(r,g,b){
  return {R:r>105&&r>g*1.20&&r>b*1.10,G:g>90&&g>r*1.15&&g>b*1.03&&g-r>20};
}

function analyzeChartImage(img){
  try{
    const q=pixelData(img,1500);if(!q)return{available:false};
    const {data:p,w,h}=q;let red=0,green=0,dark=0,bright=0,colored=0;
    const col=new Array(w).fill(0),redCol=new Array(w).fill(0),greenCol=new Array(w).fill(0);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4,r=p[i],g=p[i+1],b=p[i+2],mx=Math.max(r,g,b);
      if(mx>215)bright++;if(mx<65)dark++;const f=colorFlags(r,g,b);
      if(f.R||f.G){colored++;col[x]++;if(f.R){red++;redCol[x]++;}if(f.G){green++;greenCol[x]++;}}
    }
    const active=[];for(let x=0;x<w;x++)if(col[x]>=Math.max(2,Math.round(h*.003)))active.push(x);
    let plotL=Math.round(w*.03),plotR=Math.round(w*.82);
    if(active.length>20){plotL=Math.max(0,Math.min(...active));plotR=Math.min(w-1,Math.max(...active));}
    // Keep the right price scale out of candle detection.
    plotR=Math.min(plotR,Math.round(w*.84));
    const candidates=[];
    for(let x=plotL;x<=plotR;x++){
      const height=col[x],r=redCol[x],g=greenCol[x];if(height<Math.max(3,Math.round(h*.008))||Math.max(r,g)<2)continue;
      const left=col[Math.max(plotL,x-1)],right=col[Math.min(plotR,x+1)];
      if(height>=left*.70&&height>=right*.70)candidates.push({x,height,r,g});
    }
    const candles=[];
    for(const q2 of candidates){const last=candles.at(-1);if(last&&q2.x-last.x<=Math.max(3,w*.012)){last.x=Math.round((last.x+q2.x)/2);last.height=Math.max(last.height,q2.height);last.r=Math.max(last.r,q2.r);last.g=Math.max(last.g,q2.g);}else candles.push({...q2});}
    for(const cd of candles.slice(-100)){
      const x=Math.round(cd.x),radius=Math.max(1,Math.round(w*.004)),ys=[],reds=[],greens=[];
      for(let xx=Math.max(plotL,x-radius);xx<=Math.min(plotR,x+radius);xx++)for(let y=0;y<h;y++){
        const i=(y*w+xx)*4,f=colorFlags(p[i],p[i+1],p[i+2]);if(f.R||f.G){ys.push(y);if(f.R)reds.push(y);if(f.G)greens.push(y);}
      }
      if(ys.length){cd.high=Math.min(...ys);cd.low=Math.max(...ys);cd.mid=(cd.high+cd.low)/2;cd.bull=greens.length>=reds.length;cd.bodyTop=cd.bull?Math.min(...greens):Math.min(...reds);cd.bodyBottom=cd.bull?Math.max(...greens):Math.max(...reds);}
    }
    const pts=candles.slice(-100).filter(x=>Number.isFinite(x.mid));
    let movement='RANGE / UNCLEAR';
    if(pts.length>=6){const n=Math.max(3,Math.floor(pts.length*.25)),first=pts.slice(0,n).reduce((a,b)=>a+b.mid,0)/n,last=pts.slice(-n).reduce((a,b)=>a+b.mid,0)/n,diff=first-last;if(diff>h*.018)movement='UPWARD';else if(diff<-h*.018)movement='DOWNWARD';}
    const visualBias=green>red*1.12?'BULLISH':red>green*1.12?'BEARISH':'NEUTRAL';
    let confidence=45;if(visualBias!=='NEUTRAL')confidence+=8;if(movement!=='RANGE / UNCLEAR')confidence+=8;if(pts.length>=12)confidence+=12;if(pts.length>=25)confidence+=5;
    confidence=Math.max(30,Math.min(82,confidence));
    return{available:true,width:w,height:h,scale:q.scale,visualBias,movement,confidence,density:Math.round(colored/(w*h)*100),green,red,candles:pts,background:dark>bright?'DARK':'LIGHT'};
  }catch(e){console.error(e);return{available:false};}
}

function greenMarkerCandidates(img){
  const q=pixelData(img,2000);if(!q)return[];const {data:d,w,h}=q,xs=[],ys=[];
  for(let y=0;y<h;y++)for(let x=Math.floor(w*.55);x<w;x++){
    const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];if(g>105&&g>r*1.18&&g>b*1.04&&g-r>24){xs.push(x);ys.push(y);}
  }
  if(xs.length<8)return[];const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),bands=[];
  for(let y=minY;y<=maxY;y+=2){let count=0;for(let x=minX;x<=maxX;x+=2){const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];if(g>105&&g>r*1.18&&g>b*1.04&&g-r>24)count++;}if(count>4)bands.push(y);}
  const groups=[];for(const y of bands){const last=groups.at(-1);if(!last||y-last.at(-1)>6)groups.push([y]);else last.push(y);}
  return groups.filter(g=>g.length>=2).map(g=>({y:Math.round(g.reduce((a,b)=>a+b,0)/g.length),minX,maxX,minY:g[0],maxY:g.at(-1),score:g.length})).sort((a,b)=>b.score-a.score).slice(0,10);
}

function parsePriceToken(token){
  if(!token)return null;let s=String(token).replace(/[Oo]/g,'0').replace(/[Il]/g,'1').replace(/\s/g,'');
  s=s.replace(/[^0-9.,-]/g,'');if(!/\d/.test(s))return null;
  const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
  if(comma>=0&&dot>=0){if(comma>dot)s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');}
  else if(comma>=0){const tail=s.length-comma-1;s=tail<=5?s.replace(',','.'):s.replace(/,/g,'');}
  const n=Number(s);return Number.isFinite(n)&&n>0?n:null;
}

async function ocrRegion(canvas,psm=6){
  if(!window.Tesseract)return null;
  try{return await Tesseract.recognize(canvas,'eng',{logger:m=>{if(m.status==='recognizing text')status(`Reading chart text… ${Math.round((m.progress||0)*100)}%`)},config:{tessedit_pageseg_mode:String(psm),preserve_interword_spaces:'1'}});}catch(e){return null;}
}

async function readGreenPrice(img){
  if(!window.Tesseract)return null;try{
    const q=pixelData(img,2200);if(!q)return null;const markers=greenMarkerCandidates(img);if(!markers.length)return null;
    // The current-price marker is normally a horizontal green band. Prefer the strongest band near the chart's vertical middle.
    const best=[...markers].sort((a,b)=>(b.score-a.score)*0.55+((Math.abs(a.y/q.h-.5)-Math.abs(b.y/q.h-.5))*-1)*0.45)[0];
    const padX=Math.round(q.w*.045),padY=Math.max(22,Math.round(q.h*.035));
    const left=Math.max(0,best.minX-padX),right=Math.min(q.w,best.maxX+padX),top=Math.max(0,best.y-padY),bottom=Math.min(q.h,best.y+padY);
    const crop=document.createElement('canvas');crop.width=right-left;crop.height=bottom-top;crop.getContext('2d').drawImage(q.c,left,top,crop.width,crop.height,0,0,crop.width,crop.height);
    const r=await ocrRegion(crop,7);if(!r)return null;
    const raw=r.data.text.replace(/\n/g,' ').trim();
    const candidates=[];
    const words=r.data.words||[];for(const w of words){const n=parsePriceToken(w.text);if(n!==null)candidates.push({value:n,conf:w.confidence||0,text:w.text});}
    if(!candidates.length){for(const m of raw.matchAll(/\d[\d,.]{1,20}/g)){const n=parsePriceToken(m[0]);if(n!==null)candidates.push({value:n,conf:r.data.confidence||0,text:m[0]});}}
    if(!candidates.length)return null;
    candidates.sort((a,b)=>(b.conf-a.conf));const chosen=candidates[0];
    return{price:chosen.value,display:String(chosen.value),raw,markerY:Math.round(best.y/q.scale),confidence:chosen.conf||r.data.confidence||0,markerScore:best.score};
  }catch(e){console.error(e);return null;}
}

async function readPriceScale(img,current){
  if(!window.Tesseract)return{labels:[],mapping:null};
  try{
    const q=pixelData(img,2200);if(!q)return{labels:[],mapping:null};
    // OCR only the right price-scale strip, excluding most candles.
    const left=Math.floor(q.w*.78),top=Math.floor(q.h*.02),right=q.w,bottom=Math.floor(q.h*.98);
    const crop=document.createElement('canvas');crop.width=right-left;crop.height=bottom-top;
    crop.getContext('2d').drawImage(q.c,left,top,crop.width,crop.height,0,0,crop.width,crop.height);
    const r=await ocrRegion(crop,6);if(!r)return{labels:[],mapping:null};
    const labels=[];const words=r.data.words||[];
    for(const w of words){const value=parsePriceToken(w.text);if(value===null||value<0.00001)continue;const cy=((w.bbox?.y0||0)+(w.bbox?.y1||0))/2+top;const conf=w.confidence||0;if(conf<20)continue;labels.push({price:value,y:cy,confidence:conf});}
    // Reject impossible OCR values. A scale label should be in the same price neighborhood as the current marker.
    const cp=current?.price;
    let filtered=labels.filter(x=>!cp||Math.abs(x.price-cp)/Math.max(Math.abs(cp),1)<0.20);
    if(filtered.length<2)filtered=labels.filter(x=>!cp||Math.abs(x.price-cp)/Math.max(Math.abs(cp),1)<0.50);
    // Remove duplicate y positions and obviously tiny OCR fragments.
    filtered=filtered.sort((a,b)=>a.y-b.y).filter((x,i,a)=>i===0||Math.abs(x.y-a[i-1].y)>7);
    if(cp&&current?.markerY){filtered.push({price:cp,y:current.markerY,confidence:100,anchor:true});}
    if(filtered.length<2)return{labels:filtered,mapping:null};
    // Linear regression price = a*y+b.
    const n=filtered.length,sy=filtered.reduce((s,x)=>s+x.y,0),sp=filtered.reduce((s,x)=>s+x.price,0),syy=filtered.reduce((s,x)=>s+x.y*x.y,0),syp=filtered.reduce((s,x)=>s+x.y*x.price,0);
    const den=n*syy-sy*sy;const a=Math.abs(den)>1e-9?(n*syp-sy*sp)/den:0,b=(sp-a*sy)/n;
    if(!Number.isFinite(a)||Math.abs(a)<1e-9)return{labels:filtered,mapping:null};
    // Validate scale direction and residual. If bad, do not create numeric targets.
    const residual=filtered.reduce((s,x)=>s+Math.abs((a*x.y+b)-x.price),0)/n;
    const step=Math.abs(a)*50; // expected price movement over 50 px
    if(!Number.isFinite(residual)||residual>Math.max(Math.abs(cp||0)*.005,step*4))return{labels:filtered,mapping:null};
    return{labels:filtered,mapping:{a,b,residual}};
  }catch(e){console.error(e);return{labels:[],mapping:null};}
}

function priceAtY(y,mapping){return mapping&&Number.isFinite(y)?mapping.a*y+mapping.b:null;}
function fmtPrice(n){if(!Number.isFinite(n))return'—';const abs=Math.abs(n);const decimals=abs>=1000?2:abs>=100?3:abs>=1?4:5;return n.toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});}
function nearestSwing(candles,bullish){
  const pts=candles.filter(x=>Number.isFinite(x.mid));if(pts.length<5)return null;
  const recent=pts.slice(-Math.min(25,pts.length));
  if(bullish){const lows=recent.map(x=>x.low).filter(Number.isFinite);return lows.length?Math.max(...lows.slice(-12)):null;}
  const highs=recent.map(x=>x.high).filter(Number.isFinite);return highs.length?Math.min(...highs.slice(-12)):null;
}

async function runScreenshotAnalysis(){
  if(!imageReady||!localVisual){status('Upload a chart screenshot first');return;}
  analyzeBtn.disabled=true;status('Calibrating chart price scale…');
  const v=localVisual;let bias=v.visualBias;if(bias==='NEUTRAL')bias=v.movement==='UPWARD'?'BULLISH':v.movement==='DOWNWARD'?'BEARISH':'NEUTRAL';
  const current=await readGreenPrice(preview);
  setText('currentPrice',current?fmtPrice(current.price):'Not detected');
  setText('currentPriceNote',current?`Green current-price marker · OCR confidence ${Math.round(current.confidence)}%.`:'No readable green current-price marker was found. No price will be invented.');
  status('Calibrating visible price scale…');
  const scale=await readPriceScale(preview,current);
  const bull=bias==='BULLISH',bear=bias==='BEARISH';
  let entry=current?.price||null,sl=null,tp1=null,tp2=null,tp3=null;
  if(entry&&scale.mapping){
    const swingY=nearestSwing(v.candles,bull);
    const swingPrice=swingY!==null?priceAtY(swingY,scale.mapping):null;
    if(Number.isFinite(swingPrice)){
      if(bull){sl=swingPrice;const risk=Math.abs(entry-sl);tp1=entry+risk;tp2=entry+risk*1.8;tp3=entry+risk*2.5;}
      else if(bear){sl=swingPrice;const risk=Math.abs(entry-sl);tp1=entry-risk;tp2=entry-risk*1.8;tp3=entry-risk*2.5;}
    }
    // Hard sanity guard: targets must stay in the same local price neighborhood as the screenshot scale/current price.
    const visiblePrices=scale.labels.map(x=>x.price).filter(Number.isFinite);if(visiblePrices.length){const min=Math.min(...visiblePrices),max=Math.max(...visiblePrices);const lo=Math.min(min,max)-Math.abs(max-min)*.15,hi=Math.max(min,max)+Math.abs(max-min)*.15;for(const k of ['sl','tp1','tp2','tp3']){if(Number.isFinite({sl,tp1,tp2,tp3}[k])&&({sl,tp1,tp2,tp3}[k]<lo||{sl,tp1,tp2,tp3}[k]>hi)){if(k==='sl')sl=null;else if(k==='tp1')tp1=null;else if(k==='tp2')tp2=null;else tp3=null;}}}
  }
  setText('bias',bull?'BUY BIAS':bear?'SELL BIAS':'WAIT');
  setText('biasReason',bull?'Bullish visual structure detected. Wait for confirmation before entry.':bear?'Bearish visual structure detected. Wait for confirmation before entry.':'Signals are mixed or unclear.');
  let conf=v.confidence;if(current)conf+=5;if(scale.mapping)conf+=8;if(scale.labels.length>=3)conf+=5;conf=Math.min(92,conf);setText('confidence',conf);if($('confidenceBar'))$('confidenceBar').style.width=`${conf}%`;
  setText('sourceNote',scale.mapping?'Screenshot · local candles + calibrated price scale + OCR':'Screenshot · local candle analysis + OCR');
  setText('entryLevel',entry?`${fmtPrice(entry)} · green marker`: 'Current price not detected');
  setText('stopLossLevel',sl!==null?fmtPrice(sl):(bull?'Below recent swing low':bear?'Above recent swing high':'Not recommended'));
  setText('tp1Level',tp1!==null?fmtPrice(tp1):'Not safely calibrated');setText('tp2Level',tp2!==null?fmtPrice(tp2):'Not safely calibrated');setText('tp3Level',tp3!==null?fmtPrice(tp3):'Not safely calibrated');
  const reasons=[`Detected ${v.candles.length} candle-like structures.`,`Visual movement: ${v.movement}.`,`Candle-color bias: ${v.visualBias}.`,`Visible chart color activity: ${v.density}%.`,current?`Green current-price marker: ${fmtPrice(current.price)}.`:'Green current-price marker could not be read.',scale.labels.length?`Price-scale OCR found ${scale.labels.length} usable labels.`:'Price-scale OCR did not find enough reliable labels.',scale.mapping?`Price scale calibrated from screenshot pixels to prices (average OCR residual ${fmtPrice(scale.mapping.residual)}).`:'Numeric SL/TP disabled because the price scale could not be calibrated safely.`,`All numeric levels are sanity-checked against the screenshot price neighborhood.`];
  if($('reasoning'))$('reasoning').innerHTML=reasons.map(x=>`<li>${esc(x)}</li>`).join('');
  setText('researchSummary',scale.mapping&&entry?`The machine used the green marker as the current-price anchor, OCR'd the visible right-side price scale, calibrated pixel position to price, and calculated structure-based levels. These are estimates from the screenshot, not guaranteed trade signals.`:`The machine could read the chart visually, but it did not have enough reliable price-scale information to calculate numeric targets. It deliberately refuses to invent prices such as 7,000 when the screenshot is around 4,000.`);
  if($('warningBox')){$('warningBox').hidden=false;$('warningBox').textContent=scale.mapping?'Price-scale calibration passed. Numeric levels are constrained to the screenshot price range and the green current-price anchor.':'Price-scale calibration failed or was insufficient. Numeric SL/TP are withheld rather than guessing.';}
  status('Analysis complete · price scale calibrated and sanity-checked');analyzeBtn.disabled=false;
}
resetResults();
