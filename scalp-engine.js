(function(){
'use strict';
const $=id=>document.getElementById(id);
const setText=(id,v)=>{const e=$(id);if(e)e.textContent=v??'—';};
let lastPlan=null;

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function uniqueSorted(values){return [...new Set(values.map(v=>Math.round(v)))].sort((a,b)=>a-b);}

function buildScalpPlan(visual){
  const candles=(visual?.candles||[]).filter(c=>Number.isFinite(c.mid)&&Number.isFinite(c.high)&&Number.isFinite(c.low));
  if(candles.length<6)return null;
  const recent=candles.slice(-24);
  const highs=recent.map(c=>c.high), lows=recent.map(c=>c.low);
  const bias=visual.movement==='UPWARD'?'BUY':visual.movement==='DOWNWARD'?'SELL':'WAIT';
  const last=recent.at(-1);
  const range=Math.max(8,(Math.max(...highs)-Math.min(...lows))*.16);
  const swingHigh=Math.min(...highs);
  const swingLow=Math.max(...lows);
  let entryY=last.mid, slY, tp1Y, tp2Y, tp3Y;
  if(bias==='BUY'){
    slY=clamp(swingLow+range,last.mid+8,visual.height-8);
    tp1Y=clamp(last.mid-range*1.5,8,last.mid-10);
    tp2Y=clamp(last.mid-range*2.5,8,tp1Y-8);
    tp3Y=clamp(last.mid-range*3.5,8,tp2Y-8);
  }else if(bias==='SELL'){
    slY=clamp(swingHigh-range,last.mid+8,visual.height-8);
    tp1Y=clamp(last.mid+range*1.5,last.mid+10,visual.height-8);
    tp2Y=clamp(last.mid+range*2.5,tp1Y+8,visual.height-8);
    tp3Y=clamp(last.mid+range*3.5,tp2Y+8,visual.height-8);
  }else{
    // No forced trade in an unclear/ranging screenshot.
    return {bias:'WAIT',entryY:last.mid,slY:null,tpYs:[],quality:visual.confidence};
  }
  return {bias,entryY,slY,tpYs:[tp1Y,tp2Y,tp3Y],quality:visual.confidence};
}

function drawScalpPlan(){
  const img=$('chartPreview'),canvas=$('annotationCanvas'),panel=$('annotatedPanel');
  if(!img||!canvas||!panel||!img.naturalWidth||!lastPlan)return;
  const max=1800,s=Math.min(1,max/img.naturalWidth),w=Math.round(img.naturalWidth*s),h=Math.round(img.naturalHeight*s);
  canvas.width=w;canvas.height=h;
  const c=canvas.getContext('2d');c.drawImage(img,0,0,w,h);
  const sx=w/(lastPlan.imageWidth||w),sy=h/(lastPlan.imageHeight||h);
  const x0=Math.round(w*.08),x1=Math.round(w*.90);
  const font=Math.max(14,Math.round(w*.012));
  c.font=`800 ${font}px Inter,Arial,sans-serif`;c.lineWidth=Math.max(2,Math.round(w*.0018));

  function line(y,dash,label,kind){
    if(!Number.isFinite(y))return;
    y=clamp(y*sy,4,h-4);
    c.save();c.setLineDash(dash);c.lineWidth=Math.max(2,Math.round(w*.002));
    c.strokeStyle=kind==='sl'?'#b84b59':'#1d7f5b';
    c.beginPath();c.moveTo(x0,y);c.lineTo(x1,y);c.stroke();c.restore();
    const text=label;
    const pad=7,tw=c.measureText(text).width+pad*2,lh=font+10,boxY=clamp(y-lh-4,2,h-lh-2);
    c.fillStyle=kind==='sl'?'#b84b59':'#1d7f5b';c.fillRect(x0,boxY,tw,lh);
    c.fillStyle='#fff';c.fillText(text,x0+pad,boxY+font+2);
  }

  // Only SL and TP lines are drawn. No price value is detected, calculated or printed.
  line(lastPlan.slY,[12,8],'SL','sl');
  lastPlan.tpYs.forEach((y,i)=>line(y,[10,7],`TP${i+1}`,'tp'));

  c.save();
  c.fillStyle='rgba(15,25,30,.82)';
  const badge=`SCALP ${lastPlan.bias}`;
  const bw=c.measureText(badge).width+24;
  c.fillRect(12,12,bw,font+18);
  c.fillStyle='#fff';c.fillText(badge,24,12+font+5);
  c.restore();
  panel.hidden=false;
  lastPlan.dataUrl=canvas.toDataURL('image/png');
}

function saveAnnotated(){
  if(!lastPlan?.dataUrl)drawScalpPlan();
  if(!lastPlan?.dataUrl)return;
  const a=document.createElement('a');a.href=lastPlan.dataUrl;a.download='ai-market-analyzer-scalp-plan.png';document.body.appendChild(a);a.click();a.remove();
}

function runScalpAnalysis(){
  const img=$('chartPreview');
  if(!img||!img.naturalWidth){setText('analysisMeta','Upload a chart screenshot first');return;}
  setText('analysisMeta','Scanning screenshot · scalp mode');
  const visual=window.analyzeChartImage?window.analyzeChartImage(img):null;
  if(!visual?.available){setText('bias','WAIT');setText('biasReason','The screenshot could not be read reliably.');return;}
  const plan=buildScalpPlan(visual);
  lastPlan=plan;
  if(!plan){setText('bias','WAIT');setText('biasReason','Not enough visible candle structure for a scalp read.');return;}
  lastPlan.imageWidth=visual.width;lastPlan.imageHeight=visual.height;

  setText('bias',plan.bias);
  setText('biasReason',plan.bias==='BUY'?'Short-term bullish structure detected. SL and TP zones are drawn visually on the chart.':plan.bias==='SELL'?'Short-term bearish structure detected. SL and TP zones are drawn visually on the chart.':'Structure is unclear or ranging. No forced scalp setup is drawn.');
  setText('confidence',visual.confidence);
  if($('confidenceBar'))$('confidenceBar').style.width=`${visual.confidence}%`;
  setText('entryLevel','VISUAL ENTRY AREA');
  setText('stopLossLevel',plan.slY?'DRAWN ON CHART':'—');
  setText('tp1Level',plan.tpYs[0]?'DRAWN ON CHART':'—');
  setText('tp2Level',plan.tpYs[1]?'DRAWN ON CHART':'—');
  setText('tp3Level',plan.tpYs[2]?'DRAWN ON CHART':'—');
  setText('currentPriceNote','Market-price detection is disabled. No current price is read, inferred or displayed.');
  setText('sourceNote','Browser computer vision · screenshot only');

  const r=$('reasoning');
  if(r)r.innerHTML='';
  const reasons=[];
  reasons.push(`Visible short-term direction: ${visual.movement}.`);
  reasons.push(`Visible candle samples used: ${visual.candles.length}.`);
  reasons.push(plan.bias==='WAIT'?'No scalp direction was strong enough to force a setup.':`Scalp mode selected: ${plan.bias}.`);
  reasons.push('SL and TP are positioned from the detected chart geometry, not from OCR price values.');
  reasons.push('The right-hand price scale is not used.');
  if(r)reasons.forEach(x=>{const li=document.createElement('li');li.textContent=x;r.appendChild(li);});
  setText('researchSummary',plan.bias==='WAIT'?'The visible structure is too unclear for a scalp setup. Upload a cleaner chart or use a different timeframe.':`Scalp ${plan.bias} structure detected. The annotated image shows the proposed stop-loss and three take-profit zones directly inside the chart.`);
  if($('warningBox')){$('warningBox').hidden=false;$('warningBox').textContent='Visual-only setup: SL/TP positions are based on screenshot geometry. No market price is detected or invented.';}
  setText('proStructure',visual.movement);
  setText('proStructureText',`Short-term visual structure: ${visual.movement.toLowerCase()}.`);
  setText('proPattern',visual.candles.length>=12?'CANDLE SEQUENCE':'LIMITED SAMPLE');
  setText('proPatternText','Local pixel-based candle sequence read.');
  setText('proBos',visual.movement==='RANGE / UNCLEAR'?'UNCLEAR':'STYLE READ');
  setText('proQuality',`${visual.confidence}%`);
  const smc=$('proSMC');if(smc)smc.innerHTML='<div>Liquidity: visual only</div><div>Structure: short-term</div><div>Price scale: ignored</div>';
  const areas=$('proAreas');if(areas)areas.innerHTML='<div>SL: drawn on chart</div><div>TP1: drawn on chart</div><div>TP2: drawn on chart</div><div>TP3: drawn on chart</div>';
  setTimeout(drawScalpPlan,50);
}

// Replace the old analysis click handler so the OCR/price engine cannot run.
window.runScreenshotAnalysis=runScalpAnalysis;
const oldBtn=$('analyzeBtn');
if(oldBtn){const clone=oldBtn.cloneNode(true);oldBtn.replaceWith(clone);clone.addEventListener('click',runScalpAnalysis);}
$('saveAnnotated')?.addEventListener('click',saveAnnotated);
$('chartPreview')?.addEventListener('load',()=>setTimeout(runScalpAnalysis,100));
$('removeImage')?.addEventListener('click',()=>{lastPlan=null;});
})();
