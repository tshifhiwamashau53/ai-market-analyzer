(function(){
'use strict';
const $=id=>document.getElementById(id);
const setText=(id,v)=>{const e=$(id);if(e)e.textContent=v??'—';};
let lastPlan=null;
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}
function body(c){return Math.abs((c.bodyBottom??c.mid)-(c.bodyTop??c.mid));}
function range(c){return Math.max(2,c.low-c.high);}

function buildScalpPlan(v){
 const cs=(v?.candles||[]).filter(c=>Number.isFinite(c.mid)&&Number.isFinite(c.high)&&Number.isFinite(c.low)).slice(-50);
 if(cs.length<10)return null;
 const last=cs.at(-1), recent=cs.slice(-12), avgRange=Math.max(3,avg(recent.map(range))), avgBody=Math.max(2,avg(cs.slice(-9,-1).map(body)));
 const highs=[],lows=[];
 for(let i=2;i<cs.length-2;i++){
  if(cs[i].high<=cs[i-1].high&&cs[i].high<=cs[i+1].high&&cs[i].high<=cs[i-2].high&&cs[i].high<=cs[i+2].high)highs.push({i,y:cs[i].high});
  if(cs[i].low>=cs[i-1].low&&cs[i].low>=cs[i+1].low&&cs[i].low>=cs[i-2].low&&cs[i].low>=cs[i+2].low)lows.push({i,y:cs[i].low});
 }
 const ph=highs.at(-1)?.y??Math.min(...cs.slice(0,-2).map(c=>c.high));
 const pl=lows.at(-1)?.y??Math.max(...cs.slice(0,-2).map(c=>c.low));
 const bull=!!last.bull,bear=!bull;
 const displacementBull=bull&&body(last)>avgBody*1.15;
 const displacementBear=bear&&body(last)>avgBody*1.15;
 const sweepBull=last.low>=pl-avgRange*.30&&last.low<=pl+avgRange*.30&&last.mid<pl+avgRange*.35&&bull;
 const sweepBear=last.high>=ph-avgRange*.30&&last.high<=ph+avgRange*.30&&last.mid>ph-avgRange*.35&&bear;
 const momentum=v.movement==='UPWARD'?2:v.movement==='DOWNWARD'?-2:0;
 let score=momentum+(displacementBull?2:0)-(displacementBear?2:0)+(sweepBull?2:0)-(sweepBear?2:0);
 let bias=score>=3?'BUY':score<=-3?'SELL':'WAIT';
 // For a screenshot analyzer, the most recent confirmed directional move is the entry signal.
 if(bias==='WAIT'&&v.movement==='UPWARD'&&bull)bias='BUY';
 if(bias==='WAIT'&&v.movement==='DOWNWARD'&&bear)bias='SELL';
 if(bias==='WAIT')return{bias:'WAIT',quality:v.confidence,reason:'No clear directional entry'};
 const swingHigh=Math.min(...cs.map(c=>c.high));
 const swingLow=Math.max(...cs.map(c=>c.low));
 const span=Math.max(25,swingLow-swingHigh);
 let entryY=last.mid,slY,tpYs=[];
 if(bias==='BUY'){
   entryY=clamp(avg(recent.slice(-3).map(c=>c.mid)),8,v.height-8);
   slY=clamp(Math.max(last.low,swingLow)+span*.035,entryY+10,v.height-6);
   const risk=Math.max(10,slY-entryY),step=Math.max(12,risk*1.25);
   tpYs=[entryY-step,entryY-step*1.9,entryY-step*2.7].map(y=>clamp(y,6,entryY-8));
 }else{
   entryY=clamp(avg(recent.slice(-3).map(c=>c.mid)),8,v.height-8);
   slY=clamp(Math.min(last.high,swingHigh)-span*.035,6,entryY-10);
   const risk=Math.max(10,entryY-slY),step=Math.max(12,risk*1.25);
   tpYs=[entryY+step,entryY+step*1.9,entryY+step*2.7].map(y=>clamp(y,entryY+8,v.height-6));
 }
 const quality=clamp(v.confidence+(displacementBull||displacementBear?5:0)+(sweepBull||sweepBear?5:0),35,92);
 const reason=[v.movement!=='RANGE / UNCLEAR'?`short-term ${v.movement.toLowerCase()} movement`:null,displacementBull||displacementBear?'directional displacement':null,sweepBull||sweepBear?'liquidity sweep':null].filter(Boolean);
 return{bias,quality,entryY,slY,tpYs,signalX:cs.at(-1).x,displacement:displacementBull||displacementBear,sweep:sweepBull||sweepBear,reason:reason.length?reason:['directional candle structure']};
}

function tag(c,x,y,text,kind,font,w,h){
 const pad=8,tw=c.measureText(text).width+pad*2,lh=font+12;
 const bx=clamp(x,w*.05,w-tw-w*.04),by=clamp(y-lh-7,3,h-lh-3);
 c.save();c.fillStyle=kind==='sl'?'#b23b4b':kind==='entry'?'#1769aa':'#18794e';c.fillRect(bx,by,tw,lh);c.fillStyle='#fff';c.fillText(text,bx+pad,by+font+3);c.restore();
}
function drawSignal(c,x,y,buy,w,h,font){
 const dir=buy?-1:1;c.save();c.strokeStyle=buy?'#1769aa':'#b23b4b';c.fillStyle=buy?'#1769aa':'#b23b4b';c.lineWidth=4;c.lineCap='round';
 c.beginPath();c.moveTo(x,y+dir*42);c.lineTo(x,y+dir*9);c.stroke();
 c.beginPath();c.moveTo(x-11,y+dir*20);c.lineTo(x,y);c.lineTo(x+11,y+dir*20);c.stroke();c.restore();
 tag(c,x+16,y,buy?'BUY ENTRY':'SELL ENTRY','entry',font,w,h);
}
function line(c,y,label,kind,x0,x1,font,w,h){
 y=clamp(y,4,h-4);c.save();c.lineWidth=kind==='entry'?3:2;c.setLineDash(kind==='entry'?[14,7]:[10,8]);c.strokeStyle=kind==='sl'?'#b23b4b':kind==='entry'?'#1769aa':'#18794e';c.beginPath();c.moveTo(x0,y);c.lineTo(x1,y);c.stroke();c.restore();tag(c,x0+5,y,label,kind,font,w,h);
}
function drawScalpPlan(){
 const img=$('chartPreview'),canvas=$('annotationCanvas'),panel=$('annotatedPanel');
 if(!img||!canvas||!panel||!img.naturalWidth||!lastPlan)return;
 const s=Math.min(1,1800/img.naturalWidth),w=Math.round(img.naturalWidth*s),h=Math.round(img.naturalHeight*s);canvas.width=w;canvas.height=h;
 const c=canvas.getContext('2d');c.drawImage(img,0,0,w,h);const sy=h/(lastPlan.imageHeight||h),sx=w/(lastPlan.imageWidth||w);const x0=Math.round(w*.055),x1=Math.round(w*.89),font=Math.max(14,Math.round(w*.012));c.font=`800 ${font}px Inter,Arial,sans-serif`;
 if(lastPlan.bias==='WAIT'){c.save();c.fillStyle='rgba(25,35,40,.9)';c.fillRect(12,12,230,font+18);c.fillStyle='#fff';c.fillText('WAIT — NO CLEAR ENTRY',22,12+font+5);c.restore();panel.hidden=false;lastPlan.dataUrl=canvas.toDataURL('image/png');return;}
 const entry=lastPlan.entryY*sy,sl=lastPlan.slY*sy,buy=lastPlan.bias==='BUY';
 line(c,entry,'ENTRY','entry',x0,x1,font,w,h);line(c,sl,'SL','sl',x0,x1,font,w,h);lastPlan.tpYs.forEach((y,i)=>line(c,y*sy,`TP${i+1}`,'tp',x0,x1,font,w,h));
 drawSignal(c,clamp((lastPlan.signalX||w*.7)*sx,x0+30,x1-30),entry,buy,w,h,font);
 c.save();c.fillStyle='rgba(15,25,30,.88)';const badge=`SCALP ${buy?'BUY':'SELL'}`;const bw=c.measureText(badge).width+24;c.fillRect(12,12,bw,font+18);c.fillStyle='#fff';c.fillText(badge,24,12+font+5);c.restore();
 panel.hidden=false;lastPlan.dataUrl=canvas.toDataURL('image/png');
}
function saveAnnotated(){if(!lastPlan?.dataUrl)drawScalpPlan();if(!lastPlan?.dataUrl)return;const a=document.createElement('a');a.href=lastPlan.dataUrl;a.download='ai-market-analyzer-signal-chart.png';document.body.appendChild(a);a.click();a.remove();}
function runScalpAnalysis(){
 const img=$('chartPreview');if(!img||!img.naturalWidth){setText('analysisMeta','Upload a chart screenshot first');return;}
 setText('analysisMeta','Reading screenshot and drawing entry signal…');const v=window.analyzeChartImage?window.analyzeChartImage(img):null;
 if(!v?.available){setText('bias','WAIT');setText('biasReason','The screenshot could not be read.');return;}
 lastPlan=buildScalpPlan(v);if(!lastPlan){setText('bias','WAIT');setText('biasReason','Not enough visible candles.');return;}lastPlan.imageWidth=v.width;lastPlan.imageHeight=v.height;
 setText('bias',lastPlan.bias);setText('biasReason',lastPlan.bias==='BUY'?`BUY ENTRY: ${lastPlan.reason.join(', ')}.`:lastPlan.bias==='SELL'?`SELL ENTRY: ${lastPlan.reason.join(', ')}.`:'No clear entry — WAIT.');setText('confidence',lastPlan.quality);if($('confidenceBar'))$('confidenceBar').style.width=`${lastPlan.quality}%`;
 setText('entryLevel',lastPlan.bias==='WAIT'?'NO SETUP':'DRAWN ON CHART');setText('stopLossLevel',lastPlan.bias==='WAIT'?'—':'DRAWN ON CHART');setText('tp1Level',lastPlan.bias==='WAIT'?'—':'DRAWN ON CHART');setText('tp2Level',lastPlan.bias==='WAIT'?'—':'DRAWN ON CHART');setText('tp3Level',lastPlan.bias==='WAIT'?'—':'DRAWN ON CHART');setText('currentPriceNote','Market-price detection is OFF. Right-hand price scale is ignored.');setText('sourceNote','Local screenshot analysis');
 const r=$('reasoning');if(r)r.innerHTML='';[`Direction: ${v.movement}.`,...lastPlan.reason.map(x=>x.charAt(0).toUpperCase()+x.slice(1)+'.'),lastPlan.bias==='WAIT'?'No trade is drawn because the entry is unclear.':'The original screenshot is returned with BUY/SELL ENTRY, SL and TP1–TP3 drawn directly inside the chart.','No market price is read or invented.'].forEach(t=>{const li=document.createElement('li');li.textContent=t;r?.appendChild(li);});
 setText('researchSummary',lastPlan.bias==='WAIT'?'WAIT: upload a clearer chart or another timeframe.':`The screenshot has been converted into an annotated ${lastPlan.bias} scalp chart with a visible entry arrow, SL and TP targets.`);if($('warningBox')){$('warningBox').hidden=false;$('warningBox').textContent='Screenshot-only analysis. This is an educational visual signal, not a guaranteed trade result.';}
 setText('proStructure',v.movement);setText('proStructureText',`Visible short-term structure: ${v.movement.toLowerCase()}.`);setText('proPattern',lastPlan.displacement?'DISPLACEMENT':'CANDLE STRUCTURE');setText('proPatternText',lastPlan.displacement?'Directional displacement detected.':'Directional candle structure detected.');setText('proBos',lastPlan.sweep?'LIQUIDITY':'STRUCTURE');setText('proQuality',`${lastPlan.quality}%`);const smc=$('proSMC');if(smc)smc.innerHTML=`<div>Signal: ${lastPlan.bias}</div><div>Entry: drawn on chart</div><div>Price scale: ignored</div>`;const areas=$('proAreas');if(areas)areas.innerHTML=lastPlan.bias==='WAIT'?'<div>WAIT — no forced setup</div>':'<div>ENTRY: drawn on chart</div><div>SL: drawn on chart</div><div>TP1: drawn on chart</div><div>TP2: drawn on chart</div><div>TP3: drawn on chart</div>';
 setTimeout(drawScalpPlan,50);
}
window.runScreenshotAnalysis=runScalpAnalysis;
const oldBtn=$('analyzeBtn');if(oldBtn){const clone=oldBtn.cloneNode(true);oldBtn.replaceWith(clone);clone.addEventListener('click',runScalpAnalysis);}
$('saveAnnotated')?.addEventListener('click',saveAnnotated);$('chartPreview')?.addEventListener('load',()=>setTimeout(runScalpAnalysis,150));$('removeImage')?.addEventListener('click',()=>{lastPlan=null;});
})();