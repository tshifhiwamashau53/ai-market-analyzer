(function(){
'use strict';
const $=id=>document.getElementById(id);
const setText=(id,v)=>{const e=$(id);if(e)e.textContent=v??'—';};
let plan=null;

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function avg(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:0;}
function body(c){return Math.abs((c.bodyBottom??c.mid)-(c.bodyTop??c.mid));}
function hi(c){return Math.min(c.high,c.low);}
function lo(c){return Math.max(c.high,c.low);}
function candleRange(c){return Math.max(2,lo(c)-hi(c));}
function bullish(c){return c.bull===true;}

// Image coordinates: smaller Y = higher price, larger Y = lower price.
function findSetup(v){
 const cs=(v?.candles||[]).filter(c=>Number.isFinite(c.mid)&&Number.isFinite(c.high)&&Number.isFinite(c.low)).slice(-80);
 if(cs.length<16)return {bias:'WAIT'};
 const recent=cs.slice(-24), last=cs.at(-1);
 const avgBody=Math.max(3,avg(cs.slice(-20,-1).map(body)));
 const avgRange=Math.max(5,avg(cs.slice(-20,-1).map(candleRange)));

 // Local swing levels in screen coordinates.
 const swingHighs=[],swingLows=[];
 for(let i=2;i<cs.length-2;i++){
   const h=hi(cs[i]),l=lo(cs[i]);
   if(h<=hi(cs[i-1])&&h<=hi(cs[i+1])&&h<=hi(cs[i-2])&&h<=hi(cs[i+2])) swingHighs.push({i,y:h});
   if(l>=lo(cs[i-1])&&l>=lo(cs[i+1])&&l>=lo(cs[i-2])&&l>=lo(cs[i+2])) swingLows.push({i,y:l});
 }
 const priorHigh=swingHighs.filter(x=>x.i<cs.length-3).at(-1);
 const priorLow=swingLows.filter(x=>x.i<cs.length-3).at(-1);

 // A sweep goes beyond a previous swing and closes back inside.
 const sweepLow=!!priorLow && lo(last)>priorLow.y+Math.max(2,avgRange*.10) && last.mid<priorLow.y;
 const sweepHigh=!!priorHigh && hi(last)<priorHigh.y-Math.max(2,avgRange*.10) && last.mid>priorHigh.y;

 // Strong displacement candle.
 const dispUp=bullish(last)&&body(last)>=avgBody*1.35&&last.mid<avg(recent.slice(-4,-1).map(c=>c.mid));
 const dispDown=!bullish(last)&&body(last)>=avgBody*1.35&&last.mid>avg(recent.slice(-4,-1).map(c=>c.mid));

 // Also accept a clean directional push when there is no obvious sweep.
 const firstMid=avg(recent.slice(0,5).map(c=>c.mid));
 const lastMid=avg(recent.slice(-5).map(c=>c.mid));
 const trendUp=firstMid-lastMid>avgRange*.35;
 const trendDown=lastMid-firstMid>avgRange*.35;

 let bias='WAIT';
 if((sweepLow&&dispUp)||(dispUp&&trendUp))bias='BUY';
 else if((sweepHigh&&dispDown)||(dispDown&&trendDown))bias='SELL';
 if(bias==='WAIT')return {bias:'WAIT'};

 // Order block = last candle of the opposite colour before displacement.
 let obIndex=cs.length-2;
 for(let i=cs.length-2;i>=Math.max(0,cs.length-8);i--){
   if(bias==='BUY'&&!bullish(cs[i])){obIndex=i;break;}
   if(bias==='SELL'&&bullish(cs[i])){obIndex=i;break;}
 }
 const ob=cs[obIndex];
 const obTop=hi(ob),obBottom=lo(ob);
 const obBodyTop=Math.min(ob.bodyTop??obTop,ob.bodyBottom??obBottom);
 const obBodyBottom=Math.max(ob.bodyTop??obTop,ob.bodyBottom??obBottom);
 // Use the candle body as the entry zone, with the full candle as a small safety extension.
 const pad=Math.max(2,candleRange(ob)*.06);
 let entryTop,entryBottom,slY,tpYs=[];
 if(bias==='BUY'){
   entryTop=Math.max(0,obBodyTop-pad);
   entryBottom=Math.min(v.height,obBodyBottom+pad);
   const sweepY=Math.max(...cs.slice(Math.max(0,obIndex-10),obIndex+1).map(lo));
   slY=clamp(Math.max(entryBottom+8,sweepY+Math.max(4,avgRange*.06)),entryBottom+8,v.height-5);
   const risk=Math.max(14,slY-(entryTop+entryBottom)/2);
   const mid=(entryTop+entryBottom)/2;
   tpYs=[mid-risk*1.5,mid-risk*2.5,mid-risk*3.5].map(y=>clamp(y,5,v.height-5));
 }else{
   entryTop=Math.max(0,obBodyTop-pad);
   entryBottom=Math.min(v.height,obBodyBottom+pad);
   const sweepY=Math.min(...cs.slice(Math.max(0,obIndex-10),obIndex+1).map(hi));
   slY=clamp(Math.min(entryTop-8,sweepY-Math.max(4,avgRange*.06)),5,entryTop-8);
   const risk=Math.max(14,(entryTop+entryBottom)/2-slY);
   const mid=(entryTop+entryBottom)/2;
   tpYs=[mid+risk*1.5,mid+risk*2.5,mid+risk*3.5].map(y=>clamp(y,5,v.height-5));
 }
 return {bias,entryTop,entryBottom,entryY:(entryTop+entryBottom)/2,slY,tpYs,obIndex,signalX:ob.x};
}

function label(c,x,y,text,type,w,h,font){
 const pad=7,lh=font+10,tw=c.measureText(text).width+pad*2;
 const bx=clamp(x,w*.035,w-tw-w*.02),by=clamp(y-lh-5,4,h-lh-4);
 c.save();
 c.fillStyle=type==='sl'?'#b42338':type==='tp'?'#16804a':'#1269a5';
 c.fillRect(bx,by,tw,lh);c.fillStyle='#fff';c.font=`800 ${font}px Arial`;c.fillText(text,bx+pad,by+font+2);c.restore();
}
function drawLine(c,y,text,type,x0,x1,w,h,font){
 c.save();c.lineWidth=text==='ENTRY'?3:2;c.setLineDash(text==='ENTRY'?[10,6]:[7,7]);c.strokeStyle=type==='sl'?'#b42338':type==='tp'?'#16804a':'#1269a5';c.beginPath();c.moveTo(x0,y);c.lineTo(x1,y);c.stroke();c.restore();label(c,x0+5,y,text,type,w,h,font);
}
function drawZone(c,top,bottom,x0,x1,buy,w,h,font){
 const colour=buy?'#1269a5':'#b42338';
 c.save();c.fillStyle=buy?'rgba(18,105,165,.20)':'rgba(180,35,56,.20)';c.strokeStyle=colour;c.lineWidth=2;c.fillRect(x0,top,x1-x0,bottom-top);c.strokeRect(x0,top,x1-x0,bottom-top);c.restore();
 label(c,x0+8,(top+bottom)/2,buy?'BUY INSIDE ORDER BLOCK':'SELL INSIDE ORDER BLOCK','entry',w,h,font);
}
function drawPath(c,entry,tp1,x0,x1,buy){
 // Simple visual trail from the order block toward TP1.
 c.save();c.fillStyle=buy?'rgba(18,105,165,.07)':'rgba(180,35,56,.07)';
 const top=Math.min(entry,tp1),bottom=Math.max(entry,tp1);c.fillRect(x0,top,x1-x0,bottom-top);c.restore();
}
function drawSignal(c,x,y,buy,w,h,font){
 c.save();c.strokeStyle=buy?'#1269a5':'#b42338';c.fillStyle=c.strokeStyle;c.lineWidth=4;c.beginPath();
 if(buy){c.moveTo(x,y+34);c.lineTo(x,y);c.lineTo(x-10,y+13);c.moveTo(x,y);c.lineTo(x+10,y+13);}else{c.moveTo(x,y-34);c.lineTo(x,y);c.lineTo(x-10,y-13);c.moveTo(x,y);c.lineTo(x+10,y-13);}c.stroke();c.restore();label(c,x+12,y,buy?'BUY':'SELL','entry',w,h,font);
}
function draw(){
 const img=$('chartPreview'),canvas=$('annotationCanvas');if(!img||!canvas||!plan||!img.naturalWidth)return;
 const scale=Math.min(1,1800/img.naturalWidth),w=Math.round(img.naturalWidth*scale),h=Math.round(img.naturalHeight*scale);canvas.width=w;canvas.height=h;
 const c=canvas.getContext('2d');c.drawImage(img,0,0,w,h);
 const sx=w/(plan.imageWidth||w),sy=h/(plan.imageHeight||h),x0=Math.round(w*.04),x1=Math.round(w*.89),font=Math.max(13,Math.round(w*.012));c.font=`800 ${font}px Arial`;
 if(plan.bias==='WAIT'){
   c.save();c.fillStyle='rgba(20,28,34,.92)';c.fillRect(12,12,250,font+18);c.fillStyle='#fff';c.fillText('WAIT — NO CLEAR ENTRY',22,12+font+5);c.restore();return;
 }
 const buy=plan.bias==='BUY',top=plan.entryTop*sy,bottom=plan.entryBottom*sy,entry=plan.entryY*sy,sl=plan.slY*sy,tp1=plan.tpYs[0]*sy;
 drawPath(c,entry,tp1,x0,x1,buy);drawZone(c,Math.min(top,bottom),Math.max(top,bottom),x0,x1,buy,w,h,font);drawLine(c,entry,'ENTRY','entry',x0,x1,w,h,font);drawLine(c,sl,'SL','sl',x0,x1,w,h,font);plan.tpYs.forEach((y,i)=>drawLine(c,y*sy,`TP${i+1}`,'tp',x0,x1,w,h,font));
 drawSignal(c,clamp((plan.signalX||plan.imageWidth*.7)*sx,x0+30,x1-30),entry,buy,w,h,font);
 c.save();const title=buy?'BUY':'SELL';c.fillStyle='rgba(20,28,34,.94)';c.fillRect(12,12,120,font+18);c.fillStyle='#fff';c.font=`900 ${font+2}px Arial`;c.fillText(title,24,12+font+6);c.restore();
 const panel=$('annotatedPanel');if(panel)panel.hidden=false;
 plan.dataUrl=canvas.toDataURL('image/png');
}
function save(){if(!plan?.dataUrl)draw();if(!plan?.dataUrl)return;const a=document.createElement('a');a.href=plan.dataUrl;a.download='chart-setup.png';document.body.appendChild(a);a.click();a.remove();}
function run(){
 const img=$('chartPreview');if(!img||!img.naturalWidth){setText('bias','WAIT');return;}
 const visual=window.analyzeChartImage?window.analyzeChartImage(img):null;if(!visual?.available){setText('bias','WAIT');return;}
 plan=findSetup(visual);plan.imageWidth=visual.width;plan.imageHeight=visual.height;
 setText('bias',plan.bias);setText('biasReason',plan.bias==='BUY'?'BUY — enter inside the highlighted bullish order block.':plan.bias==='SELL'?'SELL — enter inside the highlighted bearish order block.':'WAIT — no clear order-block entry.');
 setText('analysisMeta',plan.bias==='WAIT'?'No clear setup':'Setup found');
 setText('entryLevel',plan.bias==='WAIT'?'—':'ORDER BLOCK');setText('stopLossLevel',plan.bias==='WAIT'?'—':'ON CHART');setText('tp1Level',plan.bias==='WAIT'?'—':'ON CHART');setText('tp2Level',plan.bias==='WAIT'?'—':'ON CHART');setText('tp3Level',plan.bias==='WAIT'?'—':'ON CHART');setText('currentPriceNote','Price reading OFF');setText('sourceNote','Screenshot only');
 setText('researchSummary',plan.bias==='BUY'?'BUY — enter inside the bullish order block.':plan.bias==='SELL'?'SELL — enter inside the bearish order block.':'WAIT — no clear entry.');
 const r=$('reasoning');if(r)r.innerHTML=`<li>${plan.bias==='BUY'?'Buy inside the highlighted bullish order block.':plan.bias==='SELL'?'Sell inside the highlighted bearish order block.':'Wait for a clearer setup.'}</li><li>ENTRY, SL and TP are drawn on the chart.</li>`;
 if($('confidence'))$('confidence').textContent='—';if($('confidenceBar'))$('confidenceBar').style.width='0%';
 if($('proAnalysis'))$('proAnalysis').hidden=true;
 setTimeout(draw,30);
}
window.runScreenshotAnalysis=run;
const b=$('analyzeBtn');if(b){const clone=b.cloneNode(true);b.replaceWith(clone);clone.addEventListener('click',run);}
$('saveAnnotated')?.addEventListener('click',save);
$('saveOriginal')?.addEventListener('click',()=>{const img=$('chartPreview');if(!img?.src)return;const a=document.createElement('a');a.href=img.src;a.download='chart-original.png';a.click();});
$('chartPreview')?.addEventListener('load',()=>setTimeout(run,100));
$('removeImage')?.addEventListener('click',()=>{plan=null;});
})();