const $ = (id) => document.getElementById(id);
const input = $('chartInput');
const dropzone = $('dropzone');
const previewWrap = $('previewWrap');
const preview = $('chartPreview');
const analyzeBtn = $('analyzeBtn');
let imageReady = false;
let imageDataUrl = '';
let liveMarket = null;
let liveNews = [];
let liveCalendar = [];

function showPreview(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > 10 * 1024 * 1024) { alert('Please choose an image smaller than 10 MB.'); return; }
  const reader = new FileReader();
  reader.onload = async (event) => {
    imageDataUrl = event.target.result;
    preview.src = imageDataUrl;
    previewWrap.hidden = false;
    dropzone.hidden = true;
    imageReady = true;
    $('analysisMeta').textContent = `${file.name} · chart loaded`;
    await refreshLiveContext();
  };
  reader.readAsDataURL(file);
}

input.addEventListener('change', (e) => showPreview(e.target.files[0]));
['dragenter','dragover'].forEach(type => dropzone.addEventListener(type, e => { e.preventDefault(); dropzone.classList.add('dragover'); }));
['dragleave','drop'].forEach(type => dropzone.addEventListener(type, e => { e.preventDefault(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop', e => showPreview(e.dataTransfer.files[0]));
$('removeImage').addEventListener('click', () => {
  input.value = '';
  preview.src = '';
  previewWrap.hidden = true;
  dropzone.hidden = false;
  imageReady = false;
  imageDataUrl = '';
  liveMarket = null;
  $('analysisMeta').textContent = 'Waiting for chart';
  $('livePrice').textContent = '—';
  $('liveChange').textContent = '—';
  $('liveUpdated').textContent = 'Waiting for live quote…';
});

function formatPrice(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 10) return n.toFixed(3);
  return n.toFixed(5);
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function fetchLiveMarket() {
  const asset = $('asset').value;
  const data = await fetchJson(`/api/market?asset=${encodeURIComponent(asset)}`);
  liveMarket = data;
  $('liveAsset').textContent = asset;
  $('livePrice').textContent = formatPrice(data.price);
  const sign = data.change >= 0 ? '+' : '';
  $('liveChange').textContent = `${sign}${Number(data.changePct || 0).toFixed(2)}%`;
  $('liveUpdated').textContent = `Updated ${formatDate(data.timestamp)}`;
  $('liveSource').textContent = `${data.exchange || 'Market feed'} · ${data.note}`;
  $('liveSource').classList.remove('error');
  return data;
}

async function fetchLiveNews() {
  const data = await fetchJson(`/api/news?asset=${encodeURIComponent($('asset').value)}`);
  liveNews = data.items || [];
  renderMacroNews();
  return liveNews;
}

async function fetchLiveCalendar() {
  const data = await fetchJson('/api/calendar');
  liveCalendar = data.events || [];
  renderCalendar();
  return liveCalendar;
}

async function refreshLiveContext() {
  $('liveSource').textContent = 'Fetching current market quote…';
  $('liveSource').classList.remove('error');
  try {
    await Promise.all([fetchLiveMarket(), fetchLiveNews(), fetchLiveCalendar()]);
  } catch (error) {
    $('liveSource').textContent = `Live backend unavailable: ${error.message}`;
    $('liveSource').classList.add('error');
  }
}

function renderMacroNews() {
  if (!liveNews.length) {
    $('newsList').innerHTML = '<article class="news-item"><div class="news-top"><span>LIVE FEED</span><b class="impact-high">WAITING</b></div><h3>No live headlines loaded</h3><p>The backend must be running for current market-moving headlines to appear.</p></article>';
    $('newsStatus').textContent = 'WAITING';
    return;
  }
  $('newsStatus').textContent = 'LIVE';
  $('newsList').innerHTML = liveNews.map(item => `<article class="news-item"><div class="news-top"><span>${formatDate(item.pubDate)}</span><b class="impact-high">LIVE</b><em>${item.source || 'News'}</em></div><h3>${item.title}</h3><p>Current headline related to ${$('asset').value}. Open the source to verify the full report.</p><small>${item.source || 'Market news'}</small></article>`).join('');
}

function renderCalendar() {
  const filter = $('calendarFilter').value;
  const events = filter === 'all' ? liveCalendar : liveCalendar.filter(e => e.currency === filter);
  if (!events.length) {
    $('calendarList').innerHTML = '<article class="calendar-item"><div class="calendar-date"><strong>LIVE FEED</strong><span>Waiting</span></div><div class="calendar-event"><h3>No live calendar events loaded</h3><p>Connect the backend calendar feed to display current releases.</p></div></article>';
    return;
  }
  $('calendarList').innerHTML = events.map(e => `<article class="calendar-item"><div class="calendar-date"><strong>${formatDate(e.date)}</strong><span>${e.currency || ''}</span></div><div class="calendar-event"><div><b>${e.currency || ''}</b><span class="impact-high">${e.impact || 'EVENT'}</span></div><h3>${e.title}</h3><p>Actual: ${e.actual ?? '—'} · Forecast: ${e.forecast ?? '—'} · Previous: ${e.previous ?? '—'}</p></div></article>`).join('');
}
$('calendarFilter').addEventListener('change', renderCalendar);
$('asset').addEventListener('change', async () => { if (imageReady) await refreshLiveContext(); });

function setText(id, value) { $(id).textContent = value ?? '—'; }

function renderAnalysis(data) {
  const confidence = Math.max(0, Math.min(100, Number(data.confidence) || 0));
  setText('bias', data.bias || 'NO TRADE');
  setText('biasReason', data.reason || 'Insufficient evidence for a reliable setup.');
  setText('entry', data.entry || '—');
  setText('sl', data.stopLoss || '—');
  setText('tp1', data.tp1 || '—');
  setText('tp2', data.tp2 || '—');
  setText('tp3', data.tp3 || '—');
  setText('rr1', data.rr1 || '—');
  setText('rr2', data.rr2 || '—');
  setText('rr3', data.rr3 || '—');
  setText('confidence', confidence);
  $('confidenceBar').style.width = `${confidence}%`;
  setText('entryNote', liveMarket ? `${$('asset').value} · ${$('timeframe').value} · live reference ${formatPrice(liveMarket.price)}` : 'Live price unavailable.');
  setText('analysisMeta', `${$('asset').value} · ${$('timeframe').value} · ${formatDate(data.analyzedAt)}`);
  $('reasoning').innerHTML = [
    ...(Array.isArray(data.reasoning) ? data.reasoning : []),
    `Live price context: ${data.priceContext || (liveMarket ? formatPrice(liveMarket.price) : 'unavailable')}.`,
    `Macro risk: ${data.newsRisk || 'UNKNOWN'}.`,
    data.warning || 'Verify the chart, quote and event data independently before making decisions.'
  ].map(x => `<li>${x}</li>`).join('');
  $('newsStatus').textContent = $('includeNews').checked ? 'LIVE' : 'DISABLED';
}

analyzeBtn.addEventListener('click', async () => {
  if (!imageReady) { alert('Upload a chart screenshot first.'); return; }
  analyzeBtn.classList.add('loading');
  analyzeBtn.disabled = true;
  analyzeBtn.querySelector('span').textContent = 'Reading live market + chart…';

  try {
    await refreshLiveContext();
    const payload = {
      image: imageDataUrl,
      asset: $('asset').value,
      timeframe: $('timeframe').value,
      style: $('style').value,
      risk: $('risk').value,
      market: liveMarket,
      news: $('includeNews').checked ? liveNews : [],
      calendar: $('includeNews').checked ? liveCalendar : []
    };
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Analysis failed');
    renderAnalysis(data);
    $('dashboard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setText('bias', 'NO TRADE');
    setText('biasReason', `Analysis could not run: ${error.message}`);
    setText('analysisMeta', 'Backend connection required');
    $('reasoning').innerHTML = '<li>The screenshot was loaded, but the live AI backend did not return an analysis.</li><li>Deploy the repository with the required backend environment variables.</li><li>No demo price or fake setup is shown anymore.</li>';
  } finally {
    analyzeBtn.querySelector('span').textContent = 'Analyze market';
    analyzeBtn.disabled = false;
    analyzeBtn.classList.remove('loading');
  }
});

renderMacroNews();
renderCalendar();

// Keep the displayed quote fresh while the page is open.
setInterval(() => { if (imageReady) fetchLiveMarket().catch(() => {}); }, 30000);
