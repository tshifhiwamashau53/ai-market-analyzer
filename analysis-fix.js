(() => {
  const byId = id => document.getElementById(id);
  const text = (id, value) => { const el = byId(id); if (el) el.textContent = value ?? '—'; };
  const setStatus = value => text('analysisMeta', value);
  const image = () => byId('chartPreview');

  function scan(img) {
    const canvas = document.createElement('canvas');
    const max = 1800;
    const scale = Math.min(1, max / (img.naturalWidth || img.width));
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0,0,w,h).data;
    let greenStrong=0,redStrong=0;
    const points=[];
    for(let y=0;y<h;y+=2){
      let green=0,red=0;
      for(let x=Math.floor(w*.03);x<=Math.floor(w*.82);x+=2){
        const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];
        if(g>90 && g>r*1.15 && g>b*1.03 && g-r>18) green++;
        if(r>95 && r>g*1.18 && r>b*1.08) red++;
      }
      if(green||red){ points.push({y,green,red}); greenStrong+=green; redStrong+=red; }
    }
    const bias = greenStrong > redStrong*1.10 ? 'BULLISH' : redStrong > greenStrong*1.10 ? 'BEARISH' : 'NEUTRAL';
    let movement='RANGE / UNCLEAR';
    if(points.length>=8){
      const q=Math.max(3,Math.floor(points.length*.18));
      const a=points.slice(0,q).reduce((s,p)=>s+p.y,0)/q;
      const b=points.slice(-q).reduce((s,p)=>s+p.y,0)/q;
      if(a-b>h*.015) movement='UPWARD';
      else if(a-b<-h*.015) movement='DOWNWARD';
    }
    const agreement = Math.max(greenStrong,redStrong) / Math.max(1,greenStrong+redStrong);
    let confidence = Math.round(45 + agreement*25 + (movement==='RANGE / UNCLEAR'?0:10));
    confidence=Math.max(35,Math.min(80,confidence));
    return {bias,movement,confidence,greenStrong,redStrong,w,h,canvas};
  }

  async function ocrPrice(img){
    if(!window.Tesseract) return null;
    try{
      const c=document.createElement('canvas');
      const max=1800, scale=Math.min(1,max/(img.naturalWidth||img.width));
      const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
      const h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
      c.width=w;c.height=h;
      const ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);
      const strip=document.createElement('canvas');
      const left=Math.floor(w*.72);strip.width=w-left;strip.height=h;
      strip.getContext('2d').drawImage(c,left,0,strip.width,h,0,0,strip.width,h);
      setStatus('Reading price labels…');
      const result=await Tesseract.recognize(strip,'eng',{logger:m=>{if(m.status==='recognizing text')setStatus('Reading price labels… '+Math.round((m.progress||0)*100)+'%')}});
      const raw=result?.data?.text||'';
      const nums=[];
      for(const m of raw.matchAll(/\d{1,6}(?:[.,]\d{1,5})?/g)){
        const n=Number(m[0].replace(',','.'));
        if(Number.isFinite(n) && n>0) nums.push(n);
      }
      if(!nums.length)return null;
      const counts=new Map();nums.forEach(n=>counts.set(n,(counts.get(n)||0)+1));
      return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0][0];
    }catch(e){console.warn('OCR fallback:',e);return null;}
  }

  function targets(price, bias){
    if(!Number.isFinite(price) || bias==='NEUTRAL') return ['—','—','—','—','—'];
    const step = Math.max(Math.abs(price)*0.001, 1);
    const long = bias==='BULLISH';
    const entry=price;
    const sl=long?price-step*1.5:price+step*1.5;
    const tp1=long?price+step*1.5:price-step*1.5;
    const tp2=long?price+step*3:price-step*3;
    const tp3=long?price+step*5:price-step*5;
    return [entry,sl,tp1,tp2,tp3].map(v=>v.toFixed(Math.abs(price)>=1000?2:4));
  }

  async function runFixedAnalysis(){
    const img=image();
    if(!img || !img.src || !img.complete || !(img.naturalWidth||img.width)){
      alert('Please upload a chart screenshot first.'); return;
    }
    const btn=byId('analyzeBtn');
    if(btn) btn.classList.add('loading');
    if(btn) btn.disabled=true;
    try{
      setStatus('Scanning chart…');
      const result=scan(img);
      text('bias',result.bias);
      text('biasReason',`${result.movement} structure detected from the uploaded screenshot.`);
      text('confidence',result.confidence);
      const bar=byId('confidenceBar');if(bar)bar.style.width=result.confidence+'%';
      text('sourceNote','Local chart image + manual price / OCR');

      const manualRaw=byId('manualCurrentPrice')?.value?.trim() || '';
      const manualPrice=Number(manualRaw);
      let price=Number.isFinite(manualPrice) && manualPrice>0 ? manualPrice : null;

      if(price!==null){
        text('currentPrice',price.toFixed(Math.abs(price)>=1000?2:4));
        text('currentPriceNote','Using the current price you entered from the green chart marker.');
        setStatus('Chart scanned · using entered current price');
      }else{
        text('currentPrice','Reading…');
        setStatus('Chart scanned · reading price');
        price=await ocrPrice(img);
        if(price!==null){
          text('currentPrice',price.toFixed(Math.abs(price)>=1000?2:4));
          text('currentPriceNote','Price read from the screenshot using OCR.');
        }
      }

      if(price!==null){
        const levels=targets(price,result.bias);
        text('entryLevel',levels[0]);text('stopLossLevel',levels[1]);text('tp1Level',levels[2]);text('tp2Level',levels[3]);text('tp3Level',levels[4]);
      }else{
        text('currentPrice','Not read');
        text('currentPriceNote','Enter the green current-price marker above the chart for a reliable price anchor.');
        ['entryLevel','stopLossLevel','tp1Level','tp2Level','tp3Level'].forEach(id=>text(id,'—'));
      }

      const reasons=byId('reasoning');
      if(reasons) reasons.innerHTML=`<li>Detected visual bias: ${result.bias}.</li><li>Detected price movement: ${result.movement}.</li><li>${manualRaw && price!==null ? 'Manual current price was used as the price anchor.' : 'Price was read from the screenshot with OCR.'}</li><li>Entry, SL and TP are calculated from the detected direction and price anchor; verify them against visible support, resistance and liquidity before trading.</li>`;
      text('researchSummary',`The screenshot was analyzed locally. Direction: ${result.bias}. Structure: ${result.movement}. Confidence: ${result.confidence}%. ${manualRaw && price!==null ? 'The manually entered current price was used as the primary price anchor.' : 'OCR was used for the price anchor.'}`);
      const warning=byId('warningBox');if(warning){warning.hidden=false;warning.textContent='The typed current price is used as the primary anchor. The suggested Entry / SL / TP are still analytical estimates, not guaranteed valid trading levels. Verify them against the actual chart structure and live market before any trading decision.';}
      setStatus(price!==null?'Analysis complete':'Analysis complete · current price unavailable');
    }catch(err){
      console.error(err);
      setStatus('Analysis failed');
      text('researchSummary','The chart could not be analyzed. Try a clear screenshot containing the candles and visible price scale.');
      alert('Analysis failed. Please try the screenshot again.');
    }finally{
      if(btn){btn.disabled=false;btn.classList.remove('loading');}
    }
  }

  const initAnalysisFix = () => {
    const btn=byId('analyzeBtn');
    if(btn && !btn.dataset.fixedAnalysisBound){
      btn.dataset.fixedAnalysisBound='1';
      btn.addEventListener('click',event=>{
        event.stopImmediatePropagation();
        runFixedAnalysis();
      },true);
      window.runFixedAnalysis=runFixedAnalysis;
    }
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initAnalysisFix);
  else initAnalysisFix();
})();
