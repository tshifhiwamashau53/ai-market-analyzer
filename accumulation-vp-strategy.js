/* Accumulation -> Volume Profile -> Breakout -> POC Pullback -> Continuation
   Screenshot-only strategy engine. POC is estimated from visible candle pixels.
   No live data, API keys, or invented prices are used.
*/
(function(){
'use strict';
const $=id=>document.getElementById(id);
const img=$('chartPreview'),btn=$('analyzeBtn'),results=$('results');
if(!img||!btn)return;

function raster(image){
  const iw=image.naturalWidth||image.width, ih=image.naturalHeight||image.height;
  if(!iw||!ih)return null;
  const max=1800,s=Math.min(1,max/iw),w=Math.max(1,Math.round(iw*s)),h=Math.max(1,Math.round(ih*s));
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,w,h);
  return {c,ctx,d:ctx.getImageData(0,0,w,h).data,w,h,s};
}
function pixel(d,w,x,y){
  const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];
  return {bull:g>90&&g>r*1.15&&g>b*1.03&&g-r>18,bear:r>100&&r>g*1.18&&r>b*1.08&&r-g>20};
}
function extract(image){
  const q=raster(image); if(!q)return null;
  const {d,w,h}=q,left=Math.round(w*.04),right=Math.round(w*.82);
  const cols=[];
  for(let x=left;x<right;x++){
    let bull=0,bear=0,top=h,bottom=0;
    for(let y=0;y<h;y++){
      const p=pixel(d,w,x,y);
      if(p.bull||p.bear){top=Math.min(top,y);bottom=Math.max(bottom,y);if(p.bull)bull++;if(p.bear)bear++;}
    }
    if(bull+bear>=Math.max(2,Math.round(h*.004)))cols.push({x,bull,bear,top,bottom,n:bull+bear});
  }
  const candles=[];
  for(const c of cols){
    const last=candles.at(-1);
    if(last&&c.x-last.x<=Math.max(3,w*.012)){
      last.x=Math.round((last.x+c.x)/2);last.n=Math.max(last.n,c.n);
      last.bull+=c.bull;last.bear+=c.bear;last.top=Math.min(last.top,c.top);last.bottom=Math.max(last.bottom,c.bottom);
    }else candles.push({...c});
  }
  const pts=candles.slice(-120).map((c,i)=>({
    i,x:c.x,top:c.top,bottom:c.bottom,mid:(c.top+c.bottom)/2,
    range:Math.max(1,c.bottom-c.top),bull:c.bull>=c.bear,activity:c.n
  }));
  return {q,pts};
}
function average(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:0;}
function median(a){if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)];}
function analyze(image){
  const e=extract(image);if(!e||e.pts.length<12)return {ok:false,reason:'Not enough visible candle structure was detected.'};
  const {q,pts}=e,n=pts.length;
  const recent=pts.slice(-Math.min(30,n)), base=pts.slice(-Math.min(70,n),-Math.min(30,n));
  const rangeBase=median(base.map(x=>x.range).filter(Number.isFinite))||median(pts.map(x=>x.range));
  const recentRange=Math.max(...recent.map(x=>x.mid))-Math.min(...recent.map(x=>x.mid));
  const earlyRange=Math.max(...pts.slice(-45,-15).map(x=>x.mid))-Math.min(...pts.slice(-45,-15).map(x=>x.mid));
  const compression=recentRange<=Math.max(12,earlyRange*.72);
  const accWindow=recent.slice(0,Math.max(8,Math.floor(recent.length*.55)));
  const accHigh=Math.min(...accWindow.map(x=>x.top));
  const accLow=Math.max(...accWindow.map(x=>x.bottom));
  const accMid=(accHigh+accLow)/2;
  const accHeight=Math.max(1,accLow-accHigh);
  const profile=new Array(40).fill(0);
  for(const c of accWindow){
    const lo=Math.min(39,Math.max(0,Math.floor((c.bottom-accHigh)/accHeight*39)));
    const hi=Math.min(39,Math.max(0,Math.floor((c.top-accHigh)/accHeight*39)));
    const weight=1+Math.log2(1+c.activity);
    for(let k=hi;k<=lo;k++)profile[k]+=weight;
  }
  let pocBin=0;for(let i=1;i<profile.length;i++)if(profile[i]>profile[pocBin])pocBin=i;
  const pocY=accHigh+(pocBin+.5)/40*accHeight;
  const last=pts.at(-1),prev=pts.at(-2),prev2=pts.at(-3);
  const breakoutUp=last.mid<accHigh- Math.max(2,accHeight*.06) && prev.mid<accHigh;
  const breakoutDown=last.mid>accLow+ Math.max(2,accHeight*.06) && prev.mid>accLow;
  const wasUp=pts.slice(-8,-3).some(x=>x.mid<accHigh-Math.max(2,accHeight*.04));
  const wasDown=pts.slice(-8,-3).some(x=>x.mid>accLow+Math.max(2,accHeight*.04));
  const nearPoc=Math.abs(last.mid-pocY)<=Math.max(8,accHeight*.16);
  const continuationUp=last.mid<pocY&&last.bull&&last.mid<prev.mid&&prev.mid<prev2.mid;
  const continuationDown=last.mid>pocY&&!last.bull&&last.mid>prev.mid&&prev.mid>prev2.mid;
  const longSlope=average(pts.slice(-40,-20).map(x=>x.mid))-average(pts.slice(-20).map(x=>x.mid));
  const shortSlope=average(pts.slice(-12,-6).map(x=>x.mid))-average(pts.slice(-6).map(x=>x.mid));
  const htfBias=longSlope>q.h*.012?'BULLISH':longSlope<-q.h*.012?'BEARISH':'NEUTRAL';
  const breakout=breakoutUp||wasUp?'BULLISH':breakoutDown||wasDown?'BEARISH':'NONE';
  const pullback=(breakout==='BULLISH'||breakout==='BEARISH')&&nearPoc;
  let continuation='WAITING';
  if(pullback&&breakout==='BULLISH'&&(continuationUp||last.bull))continuation='BULLISH';
  if(pullback&&breakout==='BEARISH'&&(continuationDown||!last.bull))continuation='BEARISH';
  let signal='WAIT';
  if(compression&&breakout==='BULLISH'&&pullback&&continuation==='BULLISH'&&htfBias==='BULLISH')signal='BUY';
  if(compression&&breakout==='BEARISH'&&pullback&&continuation==='BEARISH'&&htfBias==='BEARISH')signal='SELL';
  const stages=[
    ['ACCUMULATION',compression?'DETECTED':'NOT CONFIRMED'],
    ['VOLUME PROFILE',compression?'ESTIMATED':'WAITING'],
    ['BREAKOUT',breakout==='NONE'?'WAITING':breakout],
    ['POC PULLBACK',pullback?'CONFIRMED':'WAITING'],
    ['CONTINUATION',continuation],
  ];
  let confidence=42+(compression?12:0)+(breakout!=='NONE'?10:0)+(pullback?14:0)+(continuation!=='WAITING'?10:0)+(htfBias!=='NEUTRAL'?8:0);
  confidence=Math.min(92,confidence);
  return {ok:true,q,pts,accHigh,accLow,pocY,compression,breakout,pullback,continuation,htfBias,signal,confidence,stages};
}
function ensureUI(){
  if($('strategyPanel'))return;
  const host=results||document.body,section=document.createElement('section');
  section.id='strategyPanel';section.className='strategy-panel';
  section.innerHTML=`
  <div class="strategy-head"><div><span>ACCUMULATION • VP • POC</span><h2>Five-Stage Setup</h2></div><strong id="strategySignal">WAIT</strong></div>
  <div class="strategy-flow" id="strategyFlow"></div>
  <div class="strategy-grid">
    <div><span>HTF BIAS</span><b id="strategyHTF">—</b></div>
    <div><span>POC</span><b id="strategyPOC">Estimated</b></div>
    <div><span>BREAKOUT</span><b id="strategyBreakout">—</b></div>
    <div><span>SETUP STATE</span><b id="strategyState">—</b></div>
  </div>
  <p id="strategyExplanation">Waiting for chart analysis.</p>
  <div class="strategy-note">POC is estimated from visible screenshot pixels. It is not exchange volume-at-price data.</div>`;
  host.appendChild(section);
}
function style(){
  if($('strategyStyle'))return;
  const s=document.createElement('style');s.id='strategyStyle';s.textContent=`
  .strategy-panel{margin-top:12px;background:#fbfcfd;border:1px solid #dce2e8;border-radius:18px;padding:18px;box-shadow:0 10px 28px rgba(38,49,61,.05);font-family:Inter,system-ui,sans-serif}
  .strategy-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.strategy-head span{font:500 9px 'DM Mono',monospace;letter-spacing:.12em;color:#1d7f5b}.strategy-head h2{margin:6px 0 0;font-size:20px}.strategy-head strong{font:800 20px 'DM Mono';color:#1d7f5b}
  .strategy-flow{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:16px 0}.strategy-step{border:1px solid #dce2e8;border-radius:10px;padding:10px;background:#f6f8f9}.strategy-step span{display:block;font:500 8px 'DM Mono';color:#6c7683}.strategy-step b{display:block;margin-top:5px;font-size:11px}
  .strategy-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#dce2e8;border:1px solid #dce2e8;border-radius:10px;overflow:hidden}.strategy-grid div{background:#fbfcfd;padding:11px}.strategy-grid span{display:block;font:500 8px 'DM Mono';color:#6c7683;margin-bottom:5px}.strategy-grid b{font:700 11px 'DM Mono';color:#1d7f5b}
  .strategy-panel p{font-size:12px;line-height:1.55;color:#4f5965;margin:14px 0 0}.strategy-note{font:9px 'DM Mono';color:#7a8490!important}
  @media(max-width:650px){.strategy-flow{grid-template-columns:1fr 1fr}.strategy-grid{grid-template-columns:1fr 1fr}}
  `;document.head.appendChild(s);
}
function draw(a){
  const canvas=$('annotationCanvas');if(!canvas||!a.ok)return;
  const w=img.naturalWidth,h=img.naturalHeight,max=1800,s=Math.min(1,max/w);canvas.width=Math.round(w*s);canvas.height=Math.round(h*s);
  const c=canvas.getContext('2d');c.drawImage(img,0,0,canvas.width,canvas.height);
  const sx=canvas.width/w,sy=canvas.height/h;
  const x0=Math.round(a.pts[Math.max(0,a.pts.length-30)].x*sx),x1=canvas.width*.84;
  const yH=a.accHigh*sy,yL=a.accLow*sy,yP=a.pocY*sy;
  c.save();c.lineWidth=Math.max(2,canvas.width*.0018);
  c.setLineDash([9,6]);c.strokeStyle='rgba(29,127,91,.85)';
  c.beginPath();c.moveTo(x0,yP);c.lineTo(x1,yP);c.stroke();c.setLineDash([]);
  c.fillStyle='rgba(29,127,91,.12)';c.fillRect(x0,yH,x1-x0,Math.max(2,yL-yH));
  label(c,'ACCUMULATION',x0+8,yH+24);
  label(c,'POC',x0+8,yP-8);
  if(a.signal!=='WAIT'){
    const yEntry=yP;
    const risk=Math.max(18,(yL-yH)*.45);
    const ySL=a.signal==='BUY'?yP+risk:yP-risk;
    const yTP=a.signal==='BUY'?yP-risk*2:yP+risk*2;
    lineLabel(c,'ENTRY',yEntry,a.signal==='BUY'?'#1d7f5b':'#b84b59');
    lineLabel(c,'SL',ySL,'#b84b59');
    lineLabel(c,'TP',yTP,'#1d7f5b');
    c.strokeStyle=a.signal==='BUY'?'#1d7f5b':'#b84b59';c.lineWidth=3;c.beginPath();c.moveTo(x1*.55,yEntry);c.lineTo(x1*.72,yTP);c.stroke();
  }
  c.restore();
  const panel=$('annotatedPanel');if(panel)panel.hidden=false;
  function label(ctx,t,x,y){ctx.font='700 '+Math.max(12,Math.round(canvas.width*.01))+'px Inter,Arial';const m=ctx.measureText(t);ctx.fillStyle='rgba(23,61,48,.9)';ctx.fillRect(x,y-18,m.width+14,23);ctx.fillStyle='#fff';ctx.fillText(t,x+7,y-2);}
  function lineLabel(ctx,t,y,col){ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(canvas.width*.06,y);ctx.lineTo(canvas.width*.82,y);ctx.stroke();label(ctx,t,canvas.width*.06,y-3);}
}
function run(){
  if(!img.src||!img.complete)return;
  ensureUI();style();
  const a=analyze(img);if(!a.ok){
    $('strategyExplanation').textContent=a.reason;return;
  }
  $('strategySignal').textContent=a.signal;
  $('strategyHTF').textContent=a.htfBias+' (screenshot proxy)';
  $('strategyPOC').textContent='Estimated from VP';
  $('strategyBreakout').textContent=a.breakout;
  $('strategyState').textContent=a.pullback?(a.continuation!=='WAITING'?'CONTINUATION':'POC RETEST'):'WAITING FOR POC RETEST';
  $('strategyFlow').innerHTML=a.stages.map(s=>'<div class="strategy-step"><span>'+s[0]+'</span><b>'+s[1]+'</b></div>').join('');
  $('strategyExplanation').textContent=a.signal==='BUY'?'All five stages align with the detected bullish screenshot bias.':a.signal==='SELL'?'All five stages align with the detected bearish screenshot bias.':'The sequence is incomplete or the higher-timeframe proxy does not agree, so the analyzer stays on WAIT.';
  draw(a);
}
btn.addEventListener('click',()=>setTimeout(run,1600));
img.addEventListener('load',()=>setTimeout(run,400));
ensureUI();style();
})();