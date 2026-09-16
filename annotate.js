(function(){
'use strict';
const $=id=>document.getElementById(id);
const img=$('chartPreview'),canvas=$('annotationCanvas'),panel=$('annotatedPanel');
if(!img||!canvas||!panel)return;
let lastImage=null;
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function priceText(id){const e=$(id);return e?e.textContent.trim():'';}
function draw(){
  if(!img.src||!img.naturalWidth)return;
  const w=img.naturalWidth,h=img.naturalHeight;const max=1800,s=Math.min(1,max/w);canvas.width=Math.round(w*s);canvas.height=Math.round(h*s);
  const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(img,0,0,canvas.width,canvas.height);
  const cw=canvas.width,ch=canvas.height;
  c.font=`700 ${Math.max(14,Math.round(cw*.012))}px Inter,Arial,sans-serif`;c.lineWidth=Math.max(2,cw*.002);
  const pad=Math.round(cw*.018);
  const bias=priceText('bias');
  c.fillStyle='rgba(10,20,25,.78)';c.fillRect(pad,pad,Math.min(cw*.36,420),Math.round(ch*.075));
  c.fillStyle='#fff';c.fillText(`MARKET BIAS: ${bias}`,pad*1.8,pad+Math.round(ch*.047));
  const current=priceText('currentPrice');
  const entry=priceText('entryLevel'),sl=priceText('stopLossLevel'),tp1=priceText('tp1Level'),tp2=priceText('tp2Level'),tp3=priceText('tp3Level');
  const manual=parseFloat(($('manualCurrentPrice')||{}).value);
  let anchorY=null;
  // Use the visible green horizontal price marker when possible.
  const ctx=c.getImageData(0,0,cw,ch).data;let best={score:0,y:null};
  for(let y=Math.round(ch*.05);y<Math.round(ch*.95);y+=2){let score=0;for(let x=Math.round(cw*.55);x<cw;x+=3){const i=(y*cw+x)*4,r=ctx[i],g=ctx[i+1],b=ctx[i+2];if(g>105&&g>r*1.18&&g>b*1.04&&g-r>24)score++;}if(score>best.score)best={score,y};}
  if(best.score>Math.max(8,cw*.01))anchorY=best.y;
  if(anchorY!==null){c.strokeStyle='rgba(29,127,91,.9)';c.setLineDash([10,7]);c.beginPath();c.moveTo(cw*.05,anchorY);c.lineTo(cw*.96,anchorY);c.stroke();c.setLineDash([]);label(c,`CURRENT ${manual>0?manual.toFixed(3):current}`,cw*.58,anchorY-12,'#1d7f5b');}
  // Draw reference bands from numeric labels when they exist. We only draw if the price is calibrated and an anchor exists.
  if(anchorY!==null&&manual>0){
    const values=[['ENTRY',manual,'#2a9d70'],['SL',numeric(sl),'#b84b59'],['TP1',numeric(tp1),'#2a9d70'],['TP2',numeric(tp2),'#2a9d70'],['TP3',numeric(tp3),'#2a9d70']].filter(x=>Number.isFinite(x[1]));
    // Visual spacing is intentionally conservative; exact price-to-pixel mapping remains the engine's responsibility.
    const step=Math.max(22,Math.round(ch*.045));values.forEach((v,i)=>{const y=clamp(anchorY+(v[0]==='SL'?step: v[0].startsWith('TP')?-step*(i+1):0),pad,ch-pad);c.strokeStyle=v[2];c.globalAlpha=.75;c.beginPath();c.moveTo(cw*.08,y);c.lineTo(cw*.9,y);c.stroke();c.globalAlpha=1;label(c,`${v[0]} ${v[1].toFixed(3)}`,cw*.08,y-6,v[2]);});
  }
  panel.hidden=false;lastImage=canvas.toDataURL('image/png');
}
function numeric(s){if(!s||s==='—'||/not|current|above|below|safely|recommended/i.test(s))return NaN;const n=Number(String(s).replace(/,/g,''));return Number.isFinite(n)?n:NaN;}
function label(c,text,x,y,bg){const m=c.measureText(text);const pad=6;const yy=clamp(y-18,0,c.canvas.height-28);c.fillStyle=bg;c.fillRect(x-pad,yy,m.width+pad*2,24);c.fillStyle='#fff';c.fillText(text,x,yy+17);}
function save(){if(!lastImage)draw();if(!lastImage)return;const a=document.createElement('a');a.href=lastImage;a.download='ai-market-analyzer-annotated.png';document.body.appendChild(a);a.click();a.remove();}
$('saveAnnotated')?.addEventListener('click',save);$('saveOriginal')?.addEventListener('click',()=>{if(!img.src)return;const a=document.createElement('a');a.href=img.src;a.download='chart-screenshot.png';document.body.appendChild(a);a.click();a.remove();});
$('analyzeBtn')?.addEventListener('click',()=>setTimeout(draw,1400));img.addEventListener('load',()=>setTimeout(draw,300));
})();
