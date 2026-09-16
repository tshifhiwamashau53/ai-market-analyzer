(function(){
'use strict';
const $=id=>document.getElementById(id);
const setText=(id,v)=>{const e=$(id);if(e)e.textContent=v??'—';};
let lastPlan=null;
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}
function body(c){return Math.abs((c.bodyBottom??c.mid)-(c.bodyTop??c.mid));}
function range(c){return Math.max(2,c.low-c.high);}

function swings(cs){
 const highs=[],lows=[];
 for(let i=2;i<cs.length-2;i++){
  if(cs[i].high<=cs[i-1].high&&cs[i].high<=cs[i+1].high&&cs[i].high<=cs[i-2].high&&cs[i].high<=cs[i+2].high) highs.push({i,y:cs[i].high});
  if(cs[i].low>=cs[i-1].low&&cs[i].low>=cs[i+1].low&&cs[i].low>=cs[i-2].low&&cs[i].low>=cs[i+2].low) lows.push({i,y:cs[i].low});
 }
 return {highs,lows};
}

function buildScalpPlan(v){
 const cs=(v?.candles||[]).filter(c=>Number.isFinite(c.mid)&&Number.isFinite(c.high)&&Number.isFinite(c.low)).slice(-70);
 if(cs.length<14)return null;
 const {highs,lows}=swings(cs),last=cs.at(-1),recent=cs.slice(-10);
 const ar=Math.max(3,avg(recent.map(range))),ab=Math.max(2,avg(cs.slice(-12,-1).map(body)));
 const prevHigh=highs.filter(s=>s.i<cs.length-3).at(-1)?.y;
 const prevLow=lows.filter(s=>s.i<cs.length-3).at(-1)?.y;
 const bullish=last.bull,bearish=!bullish;
 const sweepLow=Number.isFinite(prevLow)&&last.low>=prevLow-ar*.12&&last.low<=prevLow+ar*.30&&last.mid<prevLow+ar*.25&&bullish;
 const sweepHigh=Number.isFinite(prevHigh)&&last.high<=prevHigh+ar*.12&&last.high>=prevHigh-ar*.30&&last.mid>prevHigh-ar*.25&&bearish;
 const displacementUp=bullish&&body(last)>ab*1.25;
 const displacementDown=bearish&&body(last)>ab*1.25;
 const prior=cs.slice(-6,-1);
 const priorHigh=Math.min(...prior.map(c=>c.high));
 const priorLow=Math.max(...prior.map(c=>c.low));
 const bosUp=bullish&&last.mid<priorHigh;
 const bosDown=bearish&&last.mid>priorLow;
 let bias='WAIT';
 if((sweepLow&&displacementUp)|| (displacementUp&&v.movement==='UPWARD'&&last.mid<avg(recent.slice(-3).map(c=>c.mid)))) bias='BUY';
 if((sweepHigh&&displacementDown)|| (displacementDown&&v.movement==='DOWNWARD'&&last.mid>avg(recent.slice(-3).map(c=>c.mid)))) bias='SELL';
 if(bias==='WAIT')return{bias:'WAIT',quality:Math.min(70,v.confidence),reason:'No clear order-block entry'};

 // Order block = last opposing candle immediately before the displacement leg.
 let obIndex=cs.length-2;
 for(let i=cs.length-2;i>=Math.max(0,cs.length-7);i--){
   if((bias==='BUY'&&!cs[i].bull)||(bias==='SELL'&&cs[i].bull)){obIndex=i;break;}
 }
 const ob=cs[obIndex];
 const pad=Math.max(2,range(ob)*.12);
 let entryTop,entryBottom,slY,tp1,tp2,tp3;
 if(bias==='BUY'){
   entryTop=ob.bodyTop??ob.high; entryBottom=ob.bodyBottom??ob.low;
   entryTop=Math.max(entryTop,ob.high-pad); entryBottom=Math.min(entryBottom,ob.low+pad);
   const zoneMid=(entryTop+entryBottom)/2;
   const swingLow=Math.max(...cs.slice(Math.max(0,obIndex-8),obIndex+1).map(c=>c.low));
   slY=clamp(swingLow+ar*.10,zoneMid+10,v.height-8);
   const risk=Math.max(12,slY-zoneMid);
   tp1=zoneMid-risk*1.5;tp2=zoneMid-risk*2.5;tp3=zoneMid-risk*3.5;
 }else{
   entryTop=ob.bodyBottom??ob.high; entryBottom=ob.bodyTop??ob.low;
   entryTop=Math.min(entryTop,ob.high-pad); entryBottom=Math.max(entryBottom,ob.low+pad);
   const zoneMid=(entryTop+entryBottom)/2;
   const swingHigh=Math.min(...cs.slice(Math.max(0,obIndex-8),obIndex+1).map(c=>c.high));
   slY=clamp(swingHigh-ar*.10,8,zoneMid-10);
   const risk=Math.max(12,zoneMid-slY);
   tp1=zoneMid+risk*1.5;tp2=zoneMid+risk*2.5;tp3=zoneMid+risk*3.5;
 }
 const quality=clamp(v.confidence+(sweepLow||sweepHigh?8:0)+(displacementUp||displacementDown?7:0),45,90);
 return{bias,quality,entryTop,entryBottom,entryY:(entryTop+entryBottom)/2,slY,tpYs:[tp1,tp2,tp3],signalX:ob.x,obIndex,sweep:sweepLow||sweepHigh,displacement:displacementUp||displacementDown,reason:[bias==='BUY'?'bullish order block':'bearish order block',sweepLow||sweepHigh?'liquidity sweep':'structure reaction',displacementUp||displacementDown?'displacement':'retest setup']};
}

function tag(c,x,y,text,kind,font,w,h){
 const pad=8,tw=c.measureText(text).width+pad*2,lh=font+12;const bx=clamp(x,w*.04,w-tw-w*.04),by=clamp(y-lh-6,3,h-lh-3);
 c.save();c.fillStyle=kind==='sl'?'#b23b4b':kind==='entry'?'#1769aa':'#18794e';c.fillRect(bx,by,tw,lh);c.fillStyle='#fff';c.fillText(text,bx+pad,by+font+3);c.restore();
}
function line(c,y,label,kind,x0,x1,font,w,h){c.save();c.lineWidth=kind==='entry'?3:2;c.setLineDash(kind==='entry'?[14,7]:[9,8]);c.strokeStyle=kind==='sl'?'#b23b4b':kind==='entry'?'#1769aa':'#18794e';c.beginPath();c.moveTo(x0,y);c.lineTo(x1,y);c.stroke();c.restore();tag(c,x0+4,y,label,kind,font,w,h);}
function zone(c,top,bottom,x0,x1,buy,font){c.save();c.fillStyle=buy?'rgba(23,105,170,.18)':'rgba(178,59,75,.18)';c.strokeStyle=buy?'#1769aa':'#b23b4b';c.lineWidth=2;c.fillRect(x0,top,x1-x0,bottom-top);c.strokeRect(x0,top,x1-x0,bottom-top);c.restore();tag(c,x0+5,(top+bottom)/2,buy?'BULLISH ORDER BLOCK':'BEARISH ORDER BLOCK','entry',font,Math.max(x1+20,canvasWidth(c)),Math.max(bottom+20,canvasHeight(c)));}
function canvasWidth(c){return c.canvas.width}function canvasHeight(c){return c.canvas.height}
function signal(c,x,y,buy,w,h,font){c.save();c.strokeStyle=buy?'#1769aa':'#b23b4b';c.fillStyle=c.strokeStyle;c.lineWidth=4;c.beginPath();c.moveTo(x,y+(buy?38:-38));c.lineTo(x,y+(buy?7:-7));c.stroke();c.beginPath();if(buy){c.moveTo(x-11,y+17);c.lineTo(x,y);c.lineTo(x+11,y+17)}else{c.moveTo(x-11,y-17);c.lineTo(x,y);c.lineTo(x+11,y-17)}c.stroke();c.restore();tag(c,x+15,y,buy?'BUY':'SELL','entry',font,w,h);}
function drawScalpPlan(){
 const img=$('chartPreview'),canvas=$('annotationCanvas'),panel=$('annotatedPanel');if(!img||!canvas||!panel||!img.naturalWidth||!lastPlan)return;
 const s=Math.min(1,1800/img.naturalWidth),w=Math.round(img.naturalWidth*s),h=Math.round(img.naturalHeight*s);canvas.width=w;canvas.height=h;const c=canvas.getContext('2d');c.drawImage(img,0,0,w,h);
 const sy=h/(lastPlan.imageHeight||h),sx=w/(lastPlan.imageWidth||w),x0=Math.round(w*.045),x1=Math.round(w*.89),font=Math.max(14,Math.round(w*.012));c.font=`800 ${font}px Inter,Arial,sans-serif`;
 if(lastPlan.bias==='WAIT'){c.save();c.fillStyle='rgba(25,35,40,.92)';c.fillRect(12,12,230,font+18);c.fillStyle='#fff';c.fillText('WAIT — NO CLEAR ENTRY',22,12+font+5);c.restore();panel.hidden=false;lastPlan.dataUrl=canvas.toDataURL('image/png');return;}
 const buy=lastPlan.bias==='BUY',top=lastPlan.entryTop*sy,bottom=lastPlan.entryBottom*sy,entry=lastPlan.entryY*sy,sl=lastPlan.slY*sy;
 zone(c,Math.min(top,bottom),Math.max(top,bottom),x0,x1,buy,font);line(c,entry,'ENTRY','entry',x0,x1,font,w,h);line(c,sl,'SL','sl',x0,x1,font,w,h);lastPlan.tpYs.forEach((y,i)=>line(c,y*sy,`TP${i+1}`,'tp',x0,x1,font,w,h));signal(c,clamp((lastPlan.signalX||w*.65)*sx,x0+30,x1-30),entry,buy,w,h,font);
 c.save();c.fillStyle='rgba(15,25,30,.9)';const title=buy?'BUY — BULLISH ORDER BLOCK':'SELL — BEARISH ORDER BLOCK',bw=c.measureText(title).width+24;c.fillRect(12,12,bw,font+18);c.fillStyle='#fff';c.fillText(title,24,12+font+5);c.restore();panel.hidden=false;lastPlan.dataUrl=canvas.toDataURL('image/png');
}
function saveAnnotated(){if(!lastPlan?.dataUrl)drawScalpPlan();if(!lastPlan?.dataUrl)return;const a=document.createElement('a');a.href=lastPlan.dataUrl;a.download='chart-entry-signal.png';document.body.appendChild(a);a.click();a.remove();}
function runScalpAnalysis(){
 const img=$('chartPreview');if(!img||!img.naturalWidth){setText('analysisMeta','Upload a chart screenshot');return;}
 const v=window.analyzeChartImage?window.analyzeChartImage(img):null;if(!v?.available){setText('bias','WAIT');setText('biasReason','Chart could not be read.');return;}
 lastPlan=buildScalpPlan(v);if(!lastPlan)return;lastPlan.imageWidth=v.width;lastPlan.imageHeight=v.height;
 setText('analysisMeta',lastPlan.bias==='WAIT'?'No clear setup':'Signal found');setText('bias',lastPlan.bias);setText('biasReason',lastPlan.bias==='BUY'?'BUY — enter inside the bullish order block.':lastPlan.bias==='SELL'?'SELL — enter inside the bearish order block.':'WAIT — no clear entry.');setText('confidence',lastPlan.quality);if($('confidenceBar'))$('confidenceBar').style.width=`${lastPlan.quality}%`;
 setText('entryLevel',lastPlan.bias==='WAIT'?'NO SETUP':'ORDER BLOCK');setText('stopLossLevel',lastPlan.bias==='WAIT'?'—':'DRAWN ON CHART');setText('tp1Level',lastPlan.bias==='WAIT'?'—':'DRAWN ON CHART');setText('tp2Level',lastPlan.bias==='WAIT'?'—':'DRAWN ON CHART');setText('tp3Level',lastPlan.bias==='WAIT'?'—':'DRAWN ON CHART');setText('currentPriceNote','Price detection OFF');setText('sourceNote','Screenshot only');
 const r=$('reasoning');if(r)r.innerHTML='';[lastPlan.bias==='BUY'?'BUY TRADE':'SELL TRADE',lastPlan.bias==='WAIT'?'No setup found':'Entry is inside the order block.','SL and TP are drawn on the chart.'].forEach(t=>{const li=document.createElement('li');li.textContent=t;r?.appendChild(li);});
 setText('researchSummary',lastPlan.bias==='WAIT'?'WAIT — no clear setup.':`${lastPlan.bias} — use the highlighted ${lastPlan.bias==='BUY'?'bullish':'bearish'} order block for the entry.`);if($('warningBox'))$('warningBox').hidden=true;
 setText('proStructure','—');setText('proStructureText','');setText('proPattern','ORDER BLOCK');setText('proPatternText',lastPlan.bias==='WAIT'?'No clear order block':'Highlighted entry zone');setText('proBos','—');setText('proQuality',`${lastPlan.quality}%`);const smc=$('proSMC');if(smc)smc.innerHTML='';const areas=$('proAreas');if(areas)areas.innerHTML='';setTimeout(drawScalpPlan,40);
}
window.runScreenshotAnalysis=runScalpAnalysis;
const oldBtn=$('analyzeBtn');if(oldBtn){const clone=oldBtn.cloneNode(true);oldBtn.replaceWith(clone);clone.addEventListener('click',runScalpAnalysis);}
$('saveAnnotated')?.addEventListener('click',saveAnnotated);$('chartPreview')?.addEventListener('load',()=>setTimeout(runScalpAnalysis,120));$('removeImage')?.addEventListener('click',()=>{lastPlan=null;});
})();