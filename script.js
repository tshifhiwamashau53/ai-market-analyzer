const $ = (id) => document.getElementById(id);
const input = $('chartInput');
const dropzone = $('dropzone');
const previewWrap = $('previewWrap');
const preview = $('chartPreview');
const analyzeBtn = $('analyzeBtn');
let imageReady = false;

function showPreview(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > 10 * 1024 * 1024) { alert('Please choose an image smaller than 10 MB.'); return; }
  const reader = new FileReader();
  reader.onload = (event) => { preview.src = event.target.result; previewWrap.hidden = false; dropzone.hidden = true; imageReady = true; $('analysisMeta').textContent = `${file.name} · ready`; };
  reader.readAsDataURL(file);
}
input.addEventListener('change', (e) => showPreview(e.target.files[0]));
['dragenter','dragover'].forEach(type => dropzone.addEventListener(type, e => { e.preventDefault(); dropzone.classList.add('dragover'); }));
['dragleave','drop'].forEach(type => dropzone.addEventListener(type, e => { e.preventDefault(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop', e => showPreview(e.dataTransfer.files[0]));
$('removeImage').addEventListener('click', () => { input.value=''; preview.src=''; previewWrap.hidden=true; dropzone.hidden=false; imageReady=false; $('analysisMeta').textContent='Waiting for chart'; });

const macroNews = [
  {date:'11 Sep 2026', impact:'HIGH', tag:'INFLATION', title:'US August CPI accelerates', text:'Headline CPI rose 0.4% month-on-month and 3.4% year-on-year. Sticky inflation increased attention on Federal Reserve policy and rate expectations.', assets:'USD · XAUUSD · BTCUSD · US indices'},
  {date:'13 Sep 2026', impact:'HIGH', tag:'CENTRAL BANK', title:'Fed decision dominates the week', text:'The Federal Open Market Committee meets 15–16 September. Markets are focused on the rate decision, policy guidance and updated projections.', assets:'USD · XAUUSD · BTCUSD · US indices'},
  {date:'RECENT', impact:'HIGH', tag:'RATES', title:'Rate expectations remain volatile', text:'Recent inflation and employment data have increased uncertainty around the path of US interest rates. Unexpected data can quickly reprice yields and currencies.', assets:'USD · XAUUSD · EURUSD · GBPUSD'}
];

const calendarEvents = [
  {date:'15–16 Sep 2026', time:'Scheduled', currency:'USD', impact:'HIGH', event:'FOMC meeting', note:'Federal Reserve policy meeting; rate decision and guidance are the key market focus.'},
  {date:'16 Sep 2026', time:'14:00 ET', currency:'USD', impact:'HIGH', event:'FOMC Rate Decision', note:'Interest-rate decision. Watch the statement and market repricing rather than the headline alone.'},
  {date:'16 Sep 2026', time:'08:30 ET', currency:'USD', impact:'HIGH', event:'US Retail Sales', note:'Consumer spending data; can influence growth and rate expectations.'},
  {date:'17 Sep 2026', time:'08:30 ET', currency:'USD', impact:'HIGH', event:'US Initial Jobless Claims', note:'Weekly labor-market indicator. Usually lower impact than NFP but useful for trend confirmation.'},
  {date:'30 Sep 2026', time:'08:30 ET', currency:'USD', impact:'HIGH', event:'US PCE / Personal Income & Outlays', note:'PCE inflation is closely watched by the Federal Reserve.'},
  {date:'02 Oct 2026', time:'08:30 ET', currency:'USD', impact:'HIGH', event:'US Nonfarm Payrolls', note:'Major labor-market release that can produce sharp volatility in USD and related markets.'}
];

function renderMacroNews() {
  $('newsList').innerHTML = macroNews.map(item => `<article class="news-item"><div class="news-top"><span>${item.date}</span><b class="impact-high">${item.impact}</b><em>${item.tag}</em></div><h3>${item.title}</h3><p>${item.text}</p><small>${item.assets}</small></article>`).join('');
}

function renderCalendar() {
  const filter = $('calendarFilter').value;
  const events = filter === 'all' ? calendarEvents : calendarEvents.filter(e => e.currency === filter);
  $('calendarList').innerHTML = events.map(e => `<article class="calendar-item"><div class="calendar-date"><strong>${e.date}</strong><span>${e.time}</span></div><div class="calendar-event"><div><b>${e.currency}</b><span class="impact-high">${e.impact}</span></div><h3>${e.event}</h3><p>${e.note}</p></div></article>`).join('');
}
$('calendarFilter').addEventListener('change', renderCalendar);
renderMacroNews();
renderCalendar();

function setText(id, value) { $(id).textContent = value; }
function renderDemo() {
  const asset = $('asset').value, tf = $('timeframe').value;
  const sample = {
    XAUUSD:['BULLISH','Price structure is leaning upward; wait for confirmation at a key liquidity area.','2668.0–2673.0','2658.0','2685.0','2700.0','2718.0'],
    BTCUSD:['BULLISH','Higher-timeframe structure is constructive, but volatility requires confirmation.','108500–109200','106900','110800','112600','115000'],
    US30:['NEUTRAL','Conflicting structure detected. A cleaner setup is preferred before entry.','—','—','—','—','—'],
    EURUSD:['BEARISH','Downward structure is dominant in this demo state; confirmation is still required.','1.1720–1.1740','1.1765','1.1685','1.1650','1.1600'],
    GBPUSD:['NEUTRAL','Price is between important levels. Waiting for a confirmed break or rejection.','—','—','—','—','—'],
    ETHUSD:['BULLISH','Momentum is constructive in this demo state, subject to confirmation.','4280–4310','4205','4370','4450','4560']
  };
  const data=sample[asset]||sample.XAUUSD;
  setText('bias',data[0]); setText('biasReason',data[1]); setText('entry',data[2]); setText('sl',data[3]); setText('tp1',data[4]); setText('tp2',data[5]); setText('tp3',data[6]);
  setText('rr1',data[3]==='—'?'—':'1R+'); setText('rr2',data[3]==='—'?'—':'2R+'); setText('rr3',data[3]==='—'?'—':'3R+');
  setText('entryNote',data[2]==='—'?'No clean entry in this demo state.':`${asset} · ${tf} · ${$('style').value}`);
  const confidence=data[0]==='NEUTRAL'?48:72; setText('confidence',confidence); $('confidenceBar').style.width=`${confidence}%`;
  setText('analysisMeta',`${asset} · ${tf} · demo analysis`);
  $('reasoning').innerHTML=[`Market bias: ${data[0].toLowerCase()} based on the current demo state.`,`Key structure and liquidity should be validated against the actual chart.`,`Macro risk: ${$('includeNews').checked?'high-impact events are included in the context scan.':'news context disabled.'}`].map(x=>`<li>${x}</li>`).join('');
  $('newsStatus').textContent=$('includeNews').checked?'MACRO ACTIVE':'DISABLED';
}

analyzeBtn.addEventListener('click', async () => {
  if (!imageReady) { alert('Upload a chart screenshot first.'); return; }
  analyzeBtn.classList.add('loading'); analyzeBtn.disabled=true; analyzeBtn.querySelector('span').textContent='Analyzing…';
  await new Promise(resolve=>setTimeout(resolve,900)); renderDemo();
  analyzeBtn.querySelector('span').textContent='Analyze again'; analyzeBtn.disabled=false; analyzeBtn.classList.remove('loading');
  $('dashboard').scrollIntoView({behavior:'smooth',block:'start'});
});
