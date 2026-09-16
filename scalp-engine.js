(function(){
'use strict';
const $=id=>document.getElementById(id);
const setText=(id,v)=>{const e=$(id);if(e)e.textContent=v??'—';};
let lastPlan=null;

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}
function body(c){return Math.abs((c.bodyBottom??c.mid)-(c.bodyTop??c.mid));}
function candleRange(c){return Math.max(1,c.low-c.high);}

function pivots(candles){
  const highs=[],lows=[];
  for(let i=2;i<candles.length-2;i++){
    const c=candles[i];
    if(c.high<=candles[i-1].high&&c.high<=candles[i-2].high&&c.high<candles[i+1].high&&c.high<candles[i+2].high)highs.push({i,y:c.high});
    if(c.low>=candles[i-1].low&&c.low>=candles[i-2].low&&c.low>candles[i+1].low&&c.low>candles[i+2].low)lows.push({i,y:c.low});
  }
  return {highs,lows};
}

function buildScalpPlan(visual){
  const candles=(visual?.candles||[]).filter(c=>Number.isFinite(c.mid)&&Number.isFinite(c.high)&&Number.isFinite(c.low));
  if(candles.length<10)return null;
  const recent=candles.slice(-40);
  const {highs,lows}=pivots(recent);
  const last=recent.length-1;
  const lastC=recent[last];
  const ranges=recent.slice(-12).map(c=>candleRange(c));
  const normalRange=Math.max(2,avg(ranges));
  const lastBody=body(lastC);
  const bullish=!!lastC.bull;
  const bearish=!bullish;

  let sweepBuy=null,sweepSell=null;
  for(let i=Math.max(2,recent.length-10);i<recent.length;i++){
    const c=recent[i];
    const priorLow=lows.filter(p=>p.i<i).at(-1);
    const priorHigh=highs.filter(p=>p.i<i).at(-1);
    if(priorLow&&c.low>priorLow.y&&c.low>priorLow.y-normalRange*0.05){
      // bullish sweep = wick probes the prior low and closes back above it
      if(c.low<=priorLow.y+normalRange*.12&&c.mid<priorLow.y+normalRange*.35) sweepBuy={i,level:priorLow.y};
    }
    if(priorHigh&&c.high>=priorHigh.y-normalRange*.12&&c.mid>priorHigh.y-normalRange*.35) sweepSell={i,level:priorHigh.y};
  }

  const displacementBull=bullish&&lastBody>normalRange*.55;
  const displacementBear=bearish&&lastBody>normalRange*.55;
  const recentHigh=highs.filter(p=>p.i<last).at(-1);
  const recentLow=lows.filter(p=>p.i<last).at(-1);
  const bosBull=recentHigh&&lastC.mid<recentHigh.y&&lastC.bodyTop<recentHigh.y&&recent.slice(-3).some(c=>c.mid<recentHigh.y);
  const bosBear=recentLow&&lastC.mid>recentLow.y&&lastC.bodyBottom>recentLow.y&&recent.slice(-3).some(c=>c.mid>recentLow.y);

  let bias='WAIT',score=0,setup='No forced scalp';
  if(visual.movement==='UPWARD')score+=1;
  if(visual.movement==='DOWNWARD')score-=1;
  if(displacementBull)score+=2;
  if(displacementBear)score-=2;
  if(sweepBuy)score+=2;
  if(sweepSell)score-=2;
  if(bosBull)score+=2;
  if(bosBear)score-=2;
  if(score>=3){bias='BUY';setup=sweepBuy&&bosBull?'LIQUIDITY SWEEP → BOS':'MOMENTUM / STRUCTURE';}
  if(score<=-3){bias='SELL';setup=sweepSell&&bosBear?'LIQUIDITY SWEEP → BOS':'MOMENTUM / STRUCTURE';}

  const recentHighY=Math.min(...recent.map(c=>c.high));
  const recentLowY=Math.max(...recent.map(c=>c.low));
  const visualSpan=Math.max(20,recentLowY-recentHighY);
  let slY,tpYs=[];
  if(bias==='BUY'){
    const anchor=sweepBuy?.level ?? recentLowY;
    slY=clamp(anchor+visualSpan*.035,lastC.mid+8,visual.height-8);
    const base=Math.max(normalRange*1.4,visualSpan*.10);
    tpYs=[clamp(lastC.mid-base,8,lastC.mid-10),clamp(lastC.mid-base*1.75,8,lastC.mid-18),clamp(lastC.mid-base*2.45,8,lastC.mid-26)];
  }else if(bias==='SELL'){
    const anchor=sweepSell?.level ?? recentHighY;
    slY=clamp(anchor-visualSpan*.035,lastC.mid+8,visual.height-8);
    const base=Math.max(normalRange*1.4,visualSpan*.10);
    tpYs=[clamp(lastC.mid+base,lastC.mid+10,visual.height-8),clamp(lastC.mid+base*1.75,lastC.mid+18,visual.height-8),clamp(lastC.mid+base*2.45,lastC.mid+26,visual.height-8)];
  }

  let confidence=visual.confidence;
  if(sweepBuy||sweepSell)confidence+=6;
  if(displacementBull||displacementBear)confidence+=5;
  if(bosBull||bosBear)confidence+=6;
  confidence=clamp(confidence,30,94);
  return {bias,setup,slY,tpYs,quality:confidence,lastY:lastC.mid,sweep:!!(sweepBuy||sweepSell),displacement:displacementBull||displacementBear,bos:!!(bosBull||bosBear),retest:false,entryY:lastC.mid};
}

function drawScalpPlan(){
  const img=$('chartPreview'),canvas=$('annotationCanvas'),panel=$('annotatedPanel');
  if(!img||!canvas||!panel||!img.naturalWidth||!lastPlan)return;
  const max=1800,s=Math.min(1,max/img.naturalWidth),w=Math.round(img.naturalWidth*s),h=Math.round(img.naturalHeight*s);
  canvas.width=w;canvas.height=h;
  const c=canvas.getContext('2d');c.drawImage(img,0,0,w,h);
  const sy=h/(lastPlan.imageHeight||h),font=Math.max(14,Math.round(w*.012));
  const x0=Math.round(w*.07),x1=Math.round(w*.89);
  c.font=`800 ${font}px Inter,Arial,sans-serif`;
  function line(y,label,kind){
    if(!Number.isFinite(y))return;
    y=clamp(y*sy,5,h-5);
    c.save();c.lineWidth=Math.max(2,Math.round(w*.002));c.setLineDash(kind==='sl'?[12,8]:[9,7]);c.strokeStyle=kind==='sl'?'#b84b59':'#1d7f5b';c.beginPath();c.moveTo(x0,y);c.lineTo(x1,y);c.stroke();c.restore();
    const pad=7,tw=c.measureText(label).width+pad*2,lh=font+10,boxY=clamp(y-lh-4,2,h-lh-2);
    c.fillStyle=kind==='sl'?'#b84b59':'#1d7f5b';c.fillRect(x0,boxY,tw,lh);c.fillStyle='#fff';c.fillText(label,x0+pad,boxY+font+2);
  }
  if(lastPlan.bias!=='WAIT'){
    line(lastPlan.slY,'SL','sl');
    lastPlan.tpYs.forEach((y,i)=>line(y,`TP${i+1}`,'tp'));
  }
  c.save();c.fillStyle='rgba(15,25,30,.86)';const badge=`SCALP ${lastPlan.bias}`;const bw=c.measureText(badge).width+24;c.fillRect(12,12,bw,font+18);c.fillStyle='#fff';c.fillText(badge,24,12+font+5);c.restore();
  panel.hidden=false;lastPlan.dataUrl=canvas.toDataURL('image/png');
}

function saveAnnotated(){if(!lastPlan?.dataUrl)drawScalpPlan();if(!lastPlan?.dataUrl)return;const a=document.createElement('a');a.href=lastPlan.dataUrl;a.download='ai-market-analyzer-scalp-plan.png';document.body.appendChild(a);a.click();a.remove();}

function runScalpAnalysis(){
  const img=$('chartPreview');if(!img||!img.naturalWidth){setText('analysisMeta','Upload a chart screenshot first');return;}
  setText('analysisMeta','Scanning screenshot · structure + scalp mode');
  const visual=window.analyzeChartImage?window.analyzeChartImage(img):null;
  if(!visual?.available){setText('bias','WAIT');setText('biasReason','The screenshot could not be read reliably.');return;}
  const plan=buildScalpPlan(visual);lastPlan=plan;
  if(!plan){setText('bias','WAIT');setText('biasReason','Not enough visible candle structure for a scalp read.');return;}
  lastPlan.imageWidth=visual.width;lastPlan.imageHeight=visual.height;
  setText('bias',plan.bias);
  setText('biasReason',plan.bias==='BUY'?`Bullish scalp structure: ${plan.setup}. SL and TP zones are drawn visually.`:plan.bias==='SELL'?`Bearish scalp structure: ${plan.setup}. SL and TP zones are drawn visually.`:'Structure is mixed. No forced scalp setup is drawn.');
  setText('confidence',plan.quality);if($('confidenceBar'))$('confidenceBar').style.width=`${plan.quality}%`;
  setText('entryLevel',plan.bias==='WAIT'?'NO SETUP':'VISUAL ENTRY AREA');
  setText('stopLossLevel',plan.bias==='WAIT'?'—':'DRAWN ON CHART');
  setText('tp1Level',plan.bias==='WAIT'?'—':'DRAWN ON CHART');setText('tp2Level',plan.bias==='WAIT'?'—':'DRAWN ON CHART');setText('tp3Level',plan.bias==='WAIT'?'—':'DRAWN ON CHART');
  setText('currentPriceNote','Market-price detection is disabled. The right-hand price scale is ignored.');setText('sourceNote','Browser computer vision · screenshot only');
  const r=$('reasoning');if(r)r.innerHTML='';
  const reasons=[`Visible direction: ${visual.movement}.`,`Candle samples used: ${visual.candles.length}.`,plan.sweep?'Liquidity sweep pattern detected visually.':'No clear liquidity sweep detected.',plan.displacement?'Displacement candle detected visually.':'No strong displacement detected.',plan.bos?'Break-of-structure condition detected visually.':'No confirmed break-of-structure condition.',plan.bias==='WAIT'?'No setup was forced.':`Scalp bias: ${plan.bias}.`,'SL and TP are drawn from chart geometry only. No price value is read or invented.'];
  if(r)reasons.forEach(x=>{const li=document.createElement('li');li.textContent=x;r.appendChild(li);});
  setText('researchSummary',plan.bias==='WAIT'?'The screenshot does not show enough aligned structure for a scalp setup.':`Scalp ${plan.bias}: ${plan.setup}. The annotated chart shows SL and TP1–TP3 directly inside the plot area.`);
  if($('warningBox')){$('warningBox').hidden=false;$('warningBox').textContent='Visual-only analysis. Market price/OCR is disabled. SL and TP positions are based only on visible chart geometry.';}
  setText('proStructure',plan.bos?'BOS / STRUCTURE':visual.movement);setText('proStructureText',plan.bos?'A visual break-of-structure condition was detected.':`Short-term visual structure: ${visual.movement.toLowerCase()}.`);
  setText('proPattern',plan.displacement?'DISPLACEMENT':'CANDLE SEQUENCE');setText('proPatternText',plan.displacement?'A relatively strong directional candle was detected.':'Local pixel-based candle sequence read.');
  setText('proBos',plan.bos?'DETECTED':'UNCLEAR');setText('proQuality',`${plan.quality}%`);
  const smc=$('proSMC');if(smc)smc.innerHTML=`<div>Liquidity sweep: ${plan.sweep?'detected':'not confirmed'}</div><div>Displacement: ${plan.displacement?'detected':'not confirmed'}</div><div>Price scale: ignored</div>`;
  const areas=$('proAreas');if(areas)areas.innerHTML=plan.bias==='WAIT'?'<div>No forced scalp levels</div>':'<div>SL: drawn on chart</div><div>TP1: drawn on chart</div><div>TP2: drawn on chart</div><div>TP3: drawn on chart</div>';
  setTimeout(drawScalpPlan,50);
}

window.runScreenshotAnalysis=runScalpAnalysis;
const oldBtn=$('analyzeBtn');if(oldBtn){const clone=oldBtn.cloneNode(true);oldBtn.replaceWith(clone);clone.addEventListener('click',runScalpAnalysis);}
$('saveAnnotated')?.addEventListener('click',saveAnnotated);
$('chartPreview')?.addEventListener('load',()=>setTimeout(runScalpAnalysis,100));
$('removeImage')?.addEventListener('click',()=>{lastPlan=null;});
})();
