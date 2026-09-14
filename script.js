const $ = (id) => document.getElementById(id);
const input = $('chartInput');
const dropzone = $('dropzone');
const previewWrap = $('previewWrap');
const preview = $('chartPreview');
const analyzeBtn = $('analyzeBtn');
const MT5_BRIDGE = 'http://127.0.0.1:8765';
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
  $('analysisMeta').textContent = 'Ready for analysis';
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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function fetchExnessMT5Quote() {
  const symbol = encodeURIComponent(window.MT5_XAUUSD_SYMBOL || 'XAUUSDm');
  const data = await fetchJson(`${MT5_BRIDGE}/quote?symbol=${symbol}&fresh=${Date.now()}`);
  if (data.provider !== 'Exness MT5' || data.broker !== 'Exness') throw new Error('EXNESS MT5 QUOTE REJECTED: unexpected broker/source.');
  if (!data.timestamp || !Number.isFinite(Number(data.bid)) || !Number.isFinite(Number(data.ask))) throw new Error('EXNESS MT5 QUOTE REJECTED: missing Bid/Ask/timestamp.');
  const capturedAt = new Date(data.timestamp).getTime();
  const ageSeconds = (Date.now() - capturedAt) / 1000;
  if (!Number.isFinite(capturedAt) || ageSeconds < -10 || ageSeconds > 10) throw new Error(`LIVE XAUUSD UNAVAILABLE: Exness MT5 quote is stale (${Math.max(0, Math.round(ageSeconds))}s old).`);
  return { ...data, asset: 'XAUUSD', price: Number(data.price), clientCapturedAt: new Date().toISOString(), clientAgeSeconds: Math.max(0, Math.round(ageSeconds)) };
}

async function fetchLiveMarket({ requiredFresh = false } = {}) {
  const asset = $('asset').value;
  if (asset === 'XAUUSD') {
    try {
      const data = await fetchExnessMT5Quote();
      liveMarket = data;
      renderLiveQuote(data, true);
      return liveMarket;
    } catch (error) {
      liveMarket = null;
      $('liveSource').textContent = error.message;
      $('liveSource').classList.add('error');
      if (requiredFresh) throw error;
      throw error;
    }
  }
  const data = await fetchJson(`/api/market?asset=${encodeURIComponent(asset)}&fresh=${Date.now()}`);
  const capturedAt = new Date(data.timestamp).getTime();
  const ageSeconds = (Date.now() - capturedAt) / 1000;
  if (!Number.isFinite(data.price) || data.price <= 0) throw new Error('The market provider returned an invalid price.');
  if (!Number.isFinite(capturedAt) || ageSeconds < -10 || ageSeconds > 90) throw new Error(`LIVE PRICE UNAVAILABLE: quote is stale (${Math.max(0, Math.round(ageSeconds))}s old).`);
  liveMarket = { ...data, clientCapturedAt: new Date().toISOString(), clientAgeSeconds: Math.max(0, Math.round(ageSeconds)) };
  renderLiveQuote(liveMarket, false);
  return liveMarket;
}

function renderLiveQuote(data, broker) {
  $('liveAsset').textContent = data.asset || $('asset').value;
  $('heroAsset').textContent = data.asset || $('asset').value;
  $('livePrice').textContent = formatPrice(data.price);
  $('heroPrice').textContent = formatPrice(data.price);
  if (broker) {
    $('liveChange').textContent = `Spread ${formatPrice(data.spread)}`;
    $('liveUpdated').textContent = `Bid ${formatPrice(data.bid)} · Ask ${formatPrice(data.ask)} · ${data.clientAgeSeconds}s old`;
    $('liveSource').textContent = `${data.provider} · ${data.providerSymbol} · read-only broker quote`;
  } else {
    const sign = Number(data.change) >= 0 ? '+' : '';
    $('liveChange').textContent = `${sign}${Number(data.changePct || 0).toFixed(2)}%`;
    $('liveUpdated').textContent = `Captured ${formatDate(data.timestamp)} · ${data.clientAgeSeconds}s old`;
    $('liveSource').textContent = `${data.provider || data.exchange || 'Market feed'} · ${data.note || 'Live reference quote.'}`;
  }
  $('liveSource').classList.remove('error');
  setText('currentPrice', formatPrice(data.price));
  setText('currentPriceNote', `${data.asset || $('asset').value} · captured ${formatDate(data.timestamp)}`);
  setText('bidAsk', `${formatPrice(data.bid)} / ${formatPrice(data.ask)}`);
  setText('spreadNote', data.spread != null ? `Spread ${formatPrice(data.spread)}` : 'Bid/Ask supplied by reference feed.');
  setText('providerName', data.provider || data.exchange || '—');
  setText('providerSymbol', data.providerSymbol || data.symbol || data.asset || '—');
  setText('quoteCaptured', formatDate(data.timestamp));
  setText('marketState', data.marketState || 'LIVE');
}

async function fetchLiveNews() {
  const data = await fetchJson(`/api/news?asset=${encodeURIComponent($('asset').value)}&fresh=${Date.now()}`);
  liveNews = data.items || [];
  renderMacroNews();
  return liveNews;
}

async function fetchLiveCalendar() {
  const data = await fetchJson(`/api/calendar?fresh=${Date.now()}`);
  liveCalendar = data.events || [];
  renderCalendar();
  return liveCalendar;
}

async function refreshLiveContext({ requireFreshMarket = false } = {}) {
  $('liveSource').textContent = $('asset').value === 'XAUUSD' ? 'Connecting to local Exness MT5…' : 'Fetching a fresh current market quote…';
  $('liveSource').classList.remove('error');
  try {
    await fetchLiveMarket({ requiredFresh: requireFreshMarket });
    await Promise.all([fetchLiveNews(), fetchLiveCalendar()]);
    return true;
  } catch (error) {
    $('liveSource').textContent = error.message;
    $('liveSource').classList.add('error');
    if (requireFreshMarket) throw error;
    return false;
  }
}

function renderMacroNews() {
  if (!liveNews.length) {
    $('newsList').innerHTML = '<article class="news-item"><div class="news-top"><span>LIVE FEED</span><b>WAITING</b></div><h3>No current headlines loaded</h3><p>The backend must be running for market-moving headlines to appear.</p></article>';
    $('newsStatus').textContent = 'WAITING';
    return;
  }
  $('newsStatus').textContent = 'LIVE';
  $('newsList').innerHTML = liveNews.map(item => `<article class="news-item"><div class="news-top"><span>${formatDate(item.pubDate)}</span><b>LIVE</b><em>${item.source || 'News'}</em></div><h3>${item.title}</h3><p>Current headline related to ${$('asset').value}. Verify the full report at the original source.</p><small>${item.source || 'Market news'}</small></article>`).join('');
}

function renderCalendar() {
  const filter = $('calendarFilter').value;
  const events = filter === 'all' ? liveCalendar : liveCalendar.filter(e => e.currency === filter);
  if (!events.length) {
    $('calendarList').innerHTML = '<article class="calendar-item"><div class="calendar-date"><strong>LIVE FEED</strong><span>Waiting</span></div><div class="calendar-event"><h3>No current calendar events loaded</h3><p>Connect the backend calendar feed to display current releases.</p></div></article>';
    return;
  }
  $('calendarList').innerHTML = events.map(e => `<article class="calendar-item"><div class="calendar-date"><strong>${formatDate(e.date)}</strong><span>${e.currency || ''}</span></div><div class="calendar-event"><div><b>${e.currency || ''}</b><span class="impact-high">${e.impact || 'EVENT'}</span></div><h3>${e.title}</h3><p>Actual: ${e.actual ?? '—'} · Forecast: ${e.forecast ?? '—'} · Previous: ${e.previous ?? '—'}</p></div></article>`).join('');
}
$('calendarFilter').addEventListener('change', renderCalendar);
$('asset').addEventListener('change', async () => { await refreshLiveContext(); });

function setText(id, value) { if ($(id)) $(id).textContent = value ?? '—'; }

function renderAnalysis(data) {
  const confidence = Math.max(0, Math.min(100, Number(data.confidence) || 0));
  setText('bias', data.bias || 'NEUTRAL');
  setText('biasReason', data.reason || 'The available evidence does not support a strong directional conclusion.');
  setText('confidence', confidence);
  $('confidenceBar').style.width = `${confidence}%`;
  setText('currentPrice', formatPrice(data.livePriceUsed ?? liveMarket?.price));
  setText('currentPriceNote', `Verified at ${formatDate(data.livePriceTimestamp || liveMarket?.timestamp)}`);
  setText('bidAsk', `${formatPrice(data.liveBid ?? liveMarket?.bid)} / ${formatPrice(data.liveAsk ?? liveMarket?.ask)}`);
  setText('spreadNote', liveMarket?.spread != null ? `Spread ${formatPrice(liveMarket.spread)}` : 'Bid/Ask supplied by provider.');
  setText('analysisMeta', `${$('asset').value} · ${$('timeframe').value} · ${formatDate(data.analyzedAt)}`);
  setText('researchSummary', data.summary || data.reason || 'No summary returned.');
  setText('providerName', data.liveProvider || liveMarket?.provider || '—');
  setText('providerSymbol', liveMarket?.providerSymbol || '—');
  setText('quoteCaptured', formatDate(data.livePriceTimestamp || liveMarket?.timestamp));
  setText('marketState', 'LIVE');
  $('reasoning').innerHTML = [
    ...(Array.isArray(data.reasoning) ? data.reasoning : []),
    `Current price context: ${data.priceContext || formatPrice(liveMarket?.price)}.`,
    `Macro risk: ${data.newsRisk || 'UNKNOWN'}.`
  ].map(x => `<li>${x}</li>`).join('');
  const warning = data.warning || '';
  $('warningBox').hidden = !warning;
  $('warningBox').textContent = warning;
  $('dashboard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

analyzeBtn.addEventListener('click', async () => {
  analyzeBtn.classList.add('loading');
  analyzeBtn.disabled = true;
  analyzeBtn.querySelector('span').textContent = 'Refreshing live market context…';
  try {
    await refreshLiveContext({ requireFreshMarket: true });
    if (!liveMarket) throw new Error('LIVE PRICE UNAVAILABLE');
    analyzeBtn.querySelector('span').textContent = imageReady ? 'Reading live quote + chart…' : 'Reading live quote + context…';
    const payload = {
      image: imageReady ? imageDataUrl : null,
      asset: $('asset').value,
      timeframe: $('timeframe').value,
      style: $('style').value,
      risk: $('risk').value,
      market: liveMarket,
      news: $('includeNews').checked ? liveNews : [],
      calendar: $('includeNews').checked ? liveCalendar : []
    };
    const data = await fetchJson('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    renderAnalysis(data);
  } catch (error) {
    liveMarket = null;
    setText('bias', 'LIVE DATA UNAVAILABLE');
    setText('biasReason', error.message);
    setText('analysisMeta', 'Analysis blocked until a fresh quote is verified');
    setText('researchSummary', 'No conclusion was generated because the application could not verify a fresh live quote.');
    $('reasoning').innerHTML = '<li>No analysis was generated.</li><li>The app will not substitute an old, demo, generic or futures price for a missing broker quote.</li>';
    $('warningBox').hidden = false;
    $('warningBox').textContent = error.message;
  } finally {
    analyzeBtn.querySelector('span').textContent = 'Analyze current market';
    analyzeBtn.disabled = false;
    analyzeBtn.classList.remove('loading');
  }
});

renderMacroNews();
renderCalendar();
refreshLiveContext().catch(() => {});
setInterval(() => { fetchLiveMarket().catch(() => {}); }, 10000);
