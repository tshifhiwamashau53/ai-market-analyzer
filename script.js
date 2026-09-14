const $ = (id) => document.getElementById(id);
const input = $('chartInput');
const dropzone = $('dropzone');
const previewWrap = $('previewWrap');
const preview = $('chartPreview');
const analyzeBtn = $('analyzeBtn');
let imageReady = false;
let localVisual = null;

function setText(id, value) { const el = $(id); if (el) el.textContent = value ?? '—'; }
function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function status(text) { setText('analysisMeta', text); }

function showPreview(file) {
  if (!file) return;
  if (!file.type?.startsWith('image/')) return alert('Please select a PNG, JPG or WEBP chart screenshot.');
  if (file.size > 10*1024*1024) return alert('Please choose an image smaller than 10 MB.');
  const reader = new FileReader();
  reader.onload = () => {
    preview.onload = () => {
      imageReady = true;
      previewWrap.hidden = false;
      dropzone.hidden = true;
      status(`${file.name} · screenshot loaded`);
      localVisual = analyzeChartImage(preview);
      setTimeout(runScreenshotAnalysis, 250);
    };
    preview.onerror = () => { imageReady=false; localVisual=null; previewWrap.hidden=true; dropzone.hidden=false; alert('The image could not be read.'); };
    preview.src = reader.result;
  };
  reader.readAsDataURL(file);
}

input.addEventListener('change', e => showPreview(e.target.files?.[0]));
dropzone.addEventListener('click', e => { if (e.target !== input) input.click(); });
dropzone.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();} });
['dragenter','dragover'].forEach(t=>dropzone.addEventListener(t,e=>{e.preventDefault();dropzone.classList.add('dragover');}));
['dragleave','drop'].forEach(t=>dropzone.addEventListener(t,e=>{e.preventDefault();dropzone.classList.remove('dragover');}));
dropzone.addEventListener('drop',e=>showPreview(e.dataTransfer?.files?.[0]));
$('removeImage').addEventListener('click',()=>{input.value='';preview.src='';previewWrap.hidden=true;dropzone.hidden=false;imageReady=false;localVisual=null;resetResults();status('Upload a chart screenshot to begin');});
analyzeBtn.addEventListener('click',runScreenshotAnalysis);

function resetResults(){
 setText('bias','WAIT'); setText('biasReason','Upload a chart screenshot.'); setText('confidence','—');
 if($('confidenceBar')) $('confidenceBar').style.width='0%';
 setText('currentPrice','Not extracted'); setText('currentPriceNote','Exact prices are not invented from screenshot pixels.');
 setText('sourceNote','Local screenshot analysis'); setText('entryLevel','Visual zone'); setText('stopLossLevel','Visual invalidation');
 setText('tp1Level','Next visible zone'); setText('tp2Level','Next major zone'); setText('tp3Level','Extended zone');
 if($('reasoning')) $('reasoning').innerHTML='<li>Waiting for screenshot analysis.</li><li>No paid AI API is required.</li>';
 setText('researchSummary','Upload your chart screenshot. Analysis runs locally in your browser.');
 if($('warningBox')) $('warningBox').hidden=true;
}

function analyzeChartImage(img){
 try{
  const width=img.naturalWidth||img.width,height=img.naturalHeight||img.height;if(!width||!height)return{available:false,signals:['Image dimensions could not be read.']};
  const scale=Math.min(1,1000/width),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);const p=ctx.getImageData(0,0,w,h).data;
  let red=0,green=0,dark=0,bright=0;const row=new Array(h).fill(0),col=new Array(w).fill(0);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,r=p[i],g=p[i+1],b=p[i+2],mx=Math.max(r,g,b);if(mx>215)bright++;if(mx<65)dark++;const R=r>115&&r>g*1.22&&r>b*1.12,G=g>95&&g>r*1.16&&g>b*1.03;if(R||G){col[x]++;row[y]++;if(R)red++;if(G)green++;}}
  const colored=red+green;const visualBias=colored<30?'NEUTRAL':green>red*1.1?'BULLISH':red>green*1.1?'BEARISH':'NEUTRAL';
  const density=Math.min(100,Math.round(colored/(w*h)*10000));const background=dark>bright?'DARK':'LIGHT';
  const bins=5,points=[];for(let b=0;b<bins;b++){let s=Math.floor(b*w/bins),e=Math.floor((b+1)*w/bins),ys=0,n=0;for(let x=s;x<e;x++)if(col[x]){let total=0,weighted=0;for(let y=0;y<h;y++){total+=row[y];weighted+=y*row[y];}if(total){ys+=weighted/total;n++;}}points.push(n?ys/n:null);}
  const valid=points.filter(Number.isFinite);let structure='RANGE / UNCLEAR',slope=0;if(valid.length>=2){slope=valid[0]-valid[valid.length-1];const threshold=h*.035;if(slope>threshold)structure='BULLISH';else if(slope<-threshold)structure='BEARISH';}
  const rowThreshold=Math.max(3,Math.round(w*.006)),zones=[];for(let y=0;y<h;y++)if(row[y]>=rowThreshold)zones.push(y);const clusters=[];for(const y of zones){const last=clusters[clusters.length-1];if(!last||y-last[last.length-1]>Math.max(4,h*.012))clusters.push([y]);else last.push(y);}const centers=clusters.filter(c=>c.length>=2).map(c=>Math.round(c.reduce((a,b)=>a+b,0)/c.length));
  const upper=centers.filter(y=>y<h*.45).slice(0,3),lower=centers.filter(y=>y>h*.55).slice(-3);
  const confidence=Math.min(92,Math.max(40,(visualBias==='NEUTRAL'?48:58)+Math.min(20,Math.round(Math.abs(green-red)/Math.max(1,colored)*20))+Math.min(18,Math.round(Math.abs(slope)/Math.max(1,h)*120))));
  return{available:true,width,height,visualBias,structure,confidence,background,density,green,red,upper,lower,signals:[`${visualBias==='NEUTRAL'?'No strong':visualBias==='BULLISH'?'Bullish':'Bearish'} candle-color bias detected.`,`Visual structure: ${structure}.`,`Chart activity density: ${density}%.`,`Detected ${green.toLocaleString()} bullish-color pixels vs ${red.toLocaleString()} bearish-color pixels.`,`Detected ${centers.length} high-activity horizontal zones.`]};
 }catch(e){return{available:false,signals:['The screenshot loaded, but local image analysis failed.']};}
}

function runScreenshotAnalysis(){
 if(!imageReady||!localVisual){status('Upload a chart screenshot first');return;}
 status('Analyzing screenshot locally…');const v=localVisual;let bias=v.visualBias;if(bias==='NEUTRAL')bias=v.structure==='BULLISH'?'BULLISH':v.structure==='BEARISH'?'BEARISH':'NEUTRAL';const confidence=v.confidence||50;
 setText('bias',bias==='BULLISH'?'BUY BIAS':bias==='BEARISH'?'SELL BIAS':'WAIT');
 setText('biasReason',bias==='BULLISH'?'Bullish visual bias detected. Wait for confirmation around the visible zones.':bias==='BEARISH'?'Bearish visual bias detected. Wait for confirmation around the visible zones.':'No strong directional edge was detected. WAIT is the current result.');
 setText('confidence',confidence);if($('confidenceBar'))$('confidenceBar').style.width=`${confidence}%`;
 setText('currentPrice','Not reliably extracted');setText('currentPriceNote','Screenshot-only mode does not invent an exact market price.');setText('sourceNote','Local screenshot analysis');
 setText('entryLevel',bias==='BULLISH'?'Near support + bullish confirmation':bias==='BEARISH'?'Near resistance + bearish confirmation':'No clear entry');
 setText('stopLossLevel',bias==='BULLISH'?'Below bullish invalidation zone':bias==='BEARISH'?'Above bearish invalidation zone':'Not recommended');
 setText('tp1Level',bias==='BULLISH'?'Next visible resistance':bias==='BEARISH'?'Next visible support':'—');setText('tp2Level',bias==='BULLISH'?'Next major resistance':bias==='BEARISH'?'Next major support':'—');setText('tp3Level',bias==='BULLISH'?'Extended resistance':bias==='BEARISH'?'Extended support':'—');
 const reasons=[...v.signals,`Background detected as ${v.background}.`,v.lower.length?`Possible support zones: ${v.lower.map(z=>Math.round(z/v.height*100)+'% chart height').join(', ')}.`:'No reliable lower support zone detected.',v.upper.length?`Possible resistance zones: ${v.upper.map(z=>Math.round(z/v.height*100)+'% chart height').join(', ')}.`:'No reliable upper resistance zone detected.','Exact price levels are intentionally not fabricated from pixels.'];
 if($('reasoning'))$('reasoning').innerHTML=reasons.map(r=>`<li>${escapeHtml(r)}</li>`).join('');
 setText('researchSummary',bias==='BULLISH'?'Local screenshot analysis found a bullish visual bias. This is an analytical estimate, not a guaranteed trade signal.':bias==='BEARISH'?'Local screenshot analysis found a bearish visual bias. This is an analytical estimate, not a guaranteed trade signal.':'Local screenshot analysis found no strong directional edge. WAIT is the current result.');
 if($('warningBox')){$('warningBox').hidden=false;$('warningBox').textContent='Screenshot-only mode: live market feeds, TradingView and news are disabled. The analyzer works from visible image patterns only.';}
 status('LOCAL ANALYSIS COMPLETE');
}
resetResults();
