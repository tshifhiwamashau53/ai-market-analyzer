/* Chart Analyzer Pro
   Local, educational chart-structure engine inspired by common chart-analyzer workflows.
   It uses the uploaded image only; it does not invent market data or claim prediction certainty.
*/
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const preview=$('chartPreview');
  const analyzeBtn=$('analyzeBtn');
  if(!preview||!analyzeBtn)return;

  function raster(img){
    const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
    if(!iw||!ih)return null;
    const max=1800,s=Math.min(1,max/iw),w=Math.max(1,Math.round(iw*s)),h=Math.max(1,Math.round(ih*s));
    const c=document.createElement('canvas');c.width=w;c.height=h;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);
    return {c,ctx,d:ctx.getImageData(0,0,w,h).data,w,h,s};
  }
  function candlePixels(d,w,x,y){
    const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];
    return {bull:g>r*1.12&&g>b*1.03&&g-r>18,bear:r>g*1.15&&r>b*1.08&&r-g>18};
  }
  function extract(img){
    const q=raster(img);if(!q)return null;const {d,w,h}=q;
    const right=Math.floor(w*.84),left=Math.floor(w*.04);
    const cols=[];
    for(let x=left;x<right;x++){
      let bull=0,bear=0,top=h,bottom=0;
      for(let y=0;y<h;y++){
        const f=candlePixels(d,w,x,y);
        if(f.bull||f.bear){top=Math.min(top,y);bottom=Math.max(bottom,y);if(f.bull)bull++;if(f.bear)bear++;}
      }
      const n=bull+bear;
      if(n>=Math.max(3,h*.006))cols.push({x,n,bull,bear,top,bottom});
    }
    const candles=[];
    for(const c of cols){
      const last=candles[candles.length-1];
      if(last&&c.x-last.x<=Math.max(3,w*.012)){
        last.x=Math.round((last.x+c.x)/2);last.n=Math.max(last.n,c.n);last.bull+=c.bull;last.bear+=c.bear;last.top=Math.min(last.top,c.top);last.bottom=Math.max(last.bottom,c.bottom);
      }else candles.push({...c});
    }
    const pts=candles.slice(-80).map((c,i)=>({i,x:c.x,y:(c.top+c.bottom)/2,range:c.bottom-c.top,bull:c.bull>=c.bear,body:c.n}));
    if(pts.length<8)return {q,candles:pts,quality:25};
    const highs=[],lows=[];
    for(let i=2;i<pts.length-2;i++){
      const p=pts[i];
      if(p.y<pts[i-1].y&&p.y<pts[i-2].y&&p.y<pts[i+1].y&&p.y<pts[i+2].y)highs.push(p);
      if(p.y>pts[i-1].y&&p.y>pts[i-2].y&&p.y>pts[i+1].y&&p.y>pts[i+2].y)lows.push(p);
    }
    const n=Math.max(4,Math.floor(pts.length*.22));
    const early=pts.slice(0,n).reduce((a,p)=>a+p.y,0)/n;
    const late=pts.slice(-n).reduce((a,p)=>a+p.y,0)/n;
    const slope=early-late;
    const bias=slope>h*.025?'BULLISH':slope<-h*.025?'BEARISH':'NEUTRAL';
    const recentHigh=highs.at(-1),prevHigh=highs.at(-2),recentLow=lows.at(-1),prevLow=lows.at(-2);
    let structure='RANGE / MIXED';
    if(recentHigh&&prevHigh&&recentLow&&prevLow){
      const hh=recentHigh.y<prevHigh.y,hl=recentLow.y<prevLow.y;
      const lh=recentHigh.y>prevHigh.y,ll=recentLow.y>prevLow.y;
      if(hh&&hl)structure='HIGHER HIGHS / HIGHER LOWS';
      else if(lh&&ll)structure='LOWER HIGHS / LOWER LOWS';
    }
    const last=pts.at(-1),before=pts.at(-2),prior=pts.at(-3);
    let pattern='No dominant pattern';
    if(last.range>Math.max(8,(before?.range||0)*1.7))pattern=last.bull?'Strong bullish expansion candle':'Strong bearish expansion candle';
    else if(last.body<Math.max(3,last.range*.25))pattern='Indecision / doji-like candle';
    else if(last.bull&&!before?.bull&&last.body>(before?.body||0)*1.25)pattern='Bullish reversal / engulfing-like sequence';
    else if(!last.bull&&before?.bull&&last.body>(before?.body||0)*1.25)pattern='Bearish reversal / engulfing-like sequence';
    const support=[...lows].slice(-3).map(p=>p.y),resistance=[...highs].slice(-3).map(p=>p.y);
    const liquidity=[];
    if(recentLow&&prevLow&&recentLow.y>prevLow.y&&last.y<prevLow.y)liquidity.push('Possible sell-side liquidity sweep');
    if(recentHigh&&prevHigh&&recentHigh.y<prevHigh.y&&last.y>prevHigh.y)liquidity.push('Possible buy-side liquidity sweep');
    let bos='None confirmed from image';
    if(prevHigh&&last.y<prevHigh.y)bos='Possible bearish BOS';
    if(prevLow&&last.y>prevLow.y)bos='Possible bullish BOS';
    const fvg=[];
    for(let i=2;i<pts.length;i++){
      const a=pts[i-2],b=pts[i-1],c=pts[i];
      if(c.bull&&c.y<a.y-a.range*.35)fvg.push('Possible bullish imbalance');
      if(!c.bull&&c.y>a.y+a.range*.35)fvg.push('Possible bearish imbalance');
    }
    const quality=Math.max(30,Math.min(94,Math.round(45+Math.min(30,pts.length)+((highs.length+lows.length)>=6?12:0))));
    return {q,candles:pts,highs,lows,bias,structure,pattern,support,resistance,liquidity,bos,fvg:[...new Set(fvg)].slice(-2),quality};
  }

  function ensureUI(){
    if($('proAnalysis'))return;
    const host=$('results');if(!host)return;
    const section=document.createElement('section');section.className='pro-analysis';section.id='proAnalysis';
    section.innerHTML=`
      <div class="pro-head"><div><span class="pro-kicker">07 / ADVANCED CHART READING</span><h2>Pattern & market structure</h2></div><span class="pro-badge">LOCAL VISION</span></div>
      <div class="pro-grid">
        <article class="pro-card"><span>MARKET STRUCTURE</span><strong id="proStructure">—</strong><p id="proStructureText">Waiting for chart.</p></article>
        <article class="pro-card"><span>PRIMARY PATTERN</span><strong id="proPattern">—</strong><p id="proPatternText">Candlestick sequence detection.</p></article>
        <article class="pro-card"><span>BREAK OF STRUCTURE</span><strong id="proBos">—</strong><p>Image-based structural read.</p></article>
        <article class="pro-card"><span>READ QUALITY</span><strong id="proQuality">—</strong><p>Quality of the screenshot read, not a win probability.</p></article>
      </div>
      <div class="pro-grid pro-wide">
        <article class="pro-card"><span>SMART MONEY CONCEPTS</span><div id="proSMC" class="pro-list">Waiting for analysis.</div></article>
        <article class="pro-card"><span>KEY AREAS</span><div id="proAreas" class="pro-list">Waiting for analysis.</div></article>
      </div>`;
    host.appendChild(section);
  }
  function set(id,v){const e=$(id);if(e)e.textContent=v;}
  function list(id,items){const e=$(id);if(!e)return;e.innerHTML=(items.length?items:['No strong image evidence detected']).map(x=>`<div>${String(x).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))}</div>`).join('');}
  function run(){
    if(!preview.src||!preview.complete)return;
    ensureUI();
    const a=extract(preview);if(!a)return;
    set('proStructure',a.structure);
    set('proStructureText',a.bias==='NEUTRAL'?'Direction is mixed or ranging.':'The detected swing direction leans '+a.bias.toLowerCase()+'.');
    set('proPattern',a.pattern);
    set('proPatternText','Pattern is a visual classification, not a guaranteed outcome.');
    set('proBos',a.bos);
    set('proQuality',a.quality+'%');
    const smc=[];
    if(a.liquidity.length)smc.push(...a.liquidity);
    smc.push(a.bos);
    if(a.fvg.length)smc.push(...a.fvg);
    if(a.structure.includes('HIGHER'))smc.push('Bullish structure / demand context');
    if(a.structure.includes('LOWER'))smc.push('Bearish structure / supply context');
    list('proSMC',smc);
    const areas=[];
    if(a.support.length)areas.push('Support zone detected around the recent swing lows');
    if(a.resistance.length)areas.push('Resistance zone detected around the recent swing highs');
    areas.push('Use the visible price scale to confirm exact numeric levels.');
    list('proAreas',areas);
  }
  analyzeBtn.addEventListener('click',()=>setTimeout(run,350));
  preview.addEventListener('load',()=>setTimeout(run,350));
  ensureUI();
})();
