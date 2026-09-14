const OCR = (() => {
  let running = false;
  let lastImage = null;

  function cleanNumber(text) {
    let s = String(text || '').replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/[Ss]/g, '5').replace(/\s/g, '');
    s = s.replace(/[^0-9.,-]/g, '');
    if (!s || !/\d/.test(s)) return null;
    if ((s.match(/,/g) || []).length && (s.match(/\./g) || []).length) s = s.replace(/,/g, '');
    else if ((s.match(/,/g) || []).length === 1 && s.split(',')[1]?.length !== 3) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function priceWords(result, width, height) {
    const words = result?.data?.words || [];
    return words.map(w => {
      const n = cleanNumber(w.text);
      const b = w.bbox || {};
      return n ? { value:n, x:(b.x0+b.x1)/2, y:(b.y0+b.y1)/2, conf:w.confidence || 0 } : null;
    }).filter(Boolean).filter(p => p.conf >= 35 && p.value > 0.01 && p.value < 100000000 && p.x > width * 0.45);
  }

  function uniquePrices(items) {
    const out = [];
    for (const p of items.sort((a,b)=>a.y-b.y || b.x-a.x)) {
      const same = out.find(q => Math.abs(q.y-p.y) < 14 && Math.abs(q.value-p.value) / Math.max(q.value,1) < 0.0005);
      if (!same) out.push(p);
    }
    return out;
  }

  async function read(image) {
    if (!window.Tesseract || !image || running) return [];
    running = true;
    statusSafe('Reading price labels from screenshot…');
    try {
      const result = await Tesseract.recognize(image, 'eng', { logger:m => {
        if (m.status === 'recognizing text' && Number.isFinite(m.progress)) statusSafe(`Reading screenshot prices… ${Math.round(m.progress*100)}%`);
      }});
      const w=image.naturalWidth||image.width, h=image.naturalHeight||image.height;
      const prices=uniquePrices(priceWords(result,w,h));
      lastImage={prices,width:w,height:h};
      return prices;
    } catch(e) {
      lastImage={prices:[],width:image.naturalWidth||image.width,height:image.naturalHeight||image.height};
      return [];
    } finally { running=false; }
  }

  function statusSafe(text) {
    const el=document.getElementById('analysisMeta'); if(el) el.textContent=text;
  }

  function fmt(n) {
    if (n >= 10000) return n.toLocaleString('en-US',{maximumFractionDigits:2});
    if (n >= 1000) return n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    return n.toLocaleString('en-US',{minimumFractionDigits:n<100?2:2,maximumFractionDigits:5});
  }

  function apply(prices) {
    if (!prices?.length) {
      const note=document.getElementById('currentPriceNote'); if(note) note.textContent='No reliable price label was read. Try a clear screenshot with the price scale visible.';
      return;
    }
    const img=document.getElementById('chartPreview');
    const h=img?.naturalHeight||lastImage?.height||1;
    const candleMidY = window.localVisual?.candles?.at(-1)?.mid;
    const right=prices.filter(p=>p.x > (lastImage?.width||1)*0.68);
    const candidates=right.length?right:prices;
    let current=candidates[0];
    if(Number.isFinite(candleMidY)) current=candidates.reduce((a,b)=>Math.abs(b.y-candleMidY)<Math.abs(a.y-candleMidY)?b:a);
    const ordered=prices.slice().sort((a,b)=>a.y-b.y);
    const above=ordered.filter(p=>p.y < current.y-8).sort((a,b)=>current.y-b.y);
    const below=ordered.filter(p=>p.y > current.y+8).sort((a,b)=>a.y-current.y-(b.y-current.y));
    const bias=(document.getElementById('bias')?.textContent||'').toUpperCase();
    const higher=above.map(p=>p.value).filter(v=>v>current.value).sort((a,b)=>a-b);
    const lower=below.map(p=>p.value).filter(v=>v<current.value).sort((a,b)=>b-a);
    let resistance=higher, support=lower;
    const entry=current.value;
    let sl,tp1,tp2,tp3;
    if (bias.includes('BUY')) { sl=support[0]??null; tp1=resistance[0]??null; tp2=resistance[1]??null; tp3=resistance[2]??null; }
    else if (bias.includes('SELL')) { sl=resistance[0]??null; tp1=support[0]??null; tp2=support[1]??null; tp3=support[2]??null; }
    else { sl=null; tp1=resistance[0]??support[0]??null; tp2=resistance[1]??support[1]??null; tp3=resistance[2]??support[2]??null; }

    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v==null?'—':fmt(v);};
    set('currentPrice',entry);
    const note=document.getElementById('currentPriceNote');if(note)note.textContent=`OCR price read from the uploaded screenshot (${prices.length} visible numeric labels detected).`;
    const src=document.getElementById('sourceNote');if(src)src.textContent='Screenshot OCR + local candle analysis';
    set('entryLevel',entry);
    set('stopLossLevel',sl);
    set('tp1Level',tp1);set('tp2Level',tp2);set('tp3Level',tp3);
    const reasoning=document.getElementById('reasoning');
    if(reasoning){const li=document.createElement('li');li.textContent=`Price levels are mapped from visible screenshot labels using OCR: current ${fmt(entry)}${sl?`, SL ${fmt(sl)}`:''}${tp1?`, TP1 ${fmt(tp1)}`:''}.`;reasoning.appendChild(li);}
    const warning=document.getElementById('warningBox');if(warning)warning.textContent='Price-based mode: entry, SL and TP use numeric price labels detected directly from the uploaded screenshot. If labels are cropped, blurry or misread, verify them manually.';
    statusSafe('LOCAL PRICE + CANDLE ANALYSIS COMPLETE');
  }

  async function analyze() {
    const img=document.getElementById('chartPreview');
    if(!img || !img.complete || !img.naturalWidth) return;
    const prices=await read(img);
    apply(prices);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    const input=document.getElementById('chartInput');
    const button=document.getElementById('analyzeBtn');
    if(input) input.addEventListener('change',()=>setTimeout(analyze,700));
    if(button) button.addEventListener('click',()=>setTimeout(analyze,350));
  });
  return {analyze};
})();
