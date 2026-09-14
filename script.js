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

const TV_SYMBOLS = {
  XAUUSD: 'OANDA:XAUUSD',
  XAGUSD: 'OANDA:XAGUSD',
  BTCUSD: 'COINBASE:BTCUSD',
  ETHUSD: 'COINBASE:ETHUSD',
  SOLUSD: 'COINBASE:SOLUSD',
  US30: 'CAPITALCOM:US30',
  NAS100: 'CAPITALCOM:NAS100',
  SPX500: 'CAPITALCOM:SPX500',
  EURUSD: 'OANDA:EURUSD',
  GBPUSD: 'OANDA:GBPUSD',
  USDJPY: 'OANDA:USDJPY',
  AUDUSD: 'OANDA:AUDUSD'
};
const TV_INTERVALS = { '5M': '5', '15M': '15', '1H': '60', '4H': '240', '1D': 'D' };
const NEWS_ASSETS = new Set(Object.keys(TV_SYMBOLS));

function setText(id, value) { if ($(id)) $(id).textContent = value ?? '—'; }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }

function showPreview(file) {
  if (!file) return;
  if (!file.type || !file.type.toLowerCase().startsWith('image/')) { alert('Please select an image file.'); return; }
  if (file.size > 10 * 1024 * 1024) { alert('Please choose an image smaller than 10 MB.'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result !== 'string' || !reader.result.startsWith('data:image/')) { alert('The image could not be loaded. Please try another image.'); return; }
    imageDataUrl = reader.result;
    preview.onload = () => { imageReady = true; previewWrap.hidden = false; dropzone.hidden = true; setText('analysisMeta', `${file.name} · TradingView chart loaded`); };
    preview.onerror = () => { imageReady = false; imageDataUrl = ''; preview.src = ''; previewWrap.hidden = true; dropzone.hidden = false; alert('The browser could not display this image. Please try PNG or JPG.'); };
    preview.src = reader.result;
  };
  reader.onerror = () => alert('The image could not be read. Please try another image.');
  reader.readAsDataURL(file);
}
input.addEventListener('change', e => { const file = e.target.files && e.target.files[0]; if (file) showPreview(file); });
dropzone.addEventListener('click', e => { if (e.target !== input) input.click(); });
dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
['dragenter','dragover'].forEach(type => dropzone.addEventListener(type, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('dragover'); }));
['dragleave','drop'].forEach(type => dropzone.addEventListener(type, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop', e => { const file = e.dataTransfer?.files?.[0]; if (file) showPreview(file); });
$('removeImage').addEventListener('click', () => { input.value = ''; preview.onload = null; preview.onerror = null; preview.src = ''; previewWrap.hidden = true; dropzone.hidden = false; imageReady = false; imageDataUrl = ''; setText('analysisMeta', 'Ready for analysis'); });

function formatDate(value) { if (!value) return '—'; const d = new Date(value); if (Number.isNaN(d.getTime())) return value; return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
async function fetchJson(url, options = {}) { const response = await fetch(url, { cache: 'no-store', ...options }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`); return data; }

function renderTradingView() {
  const container = $('tradingview_chart');
  if (!container) return;
  const asset = $('asset').value;
  const interval = TV_INTERVALS[$('timeframe').value] || '5';
  const symbol = TV_SYMBOLS[asset] || TV_SYMBOLS.XAUUSD;
  setText('tvStatus', 'LOADING');
  setText('liveAsset', asset);
  setText('heroAsset', asset);
  setText('livePrice', 'See chart');
  setText('heroPrice', '—');
  setText('liveChange', 'TradingView');
  setText('liveUpdated', `Chart: ${symbol} · ${$('timeframe').value}`);
  setText('liveSource', 'TradingView live chart · selected instrument');
  $('liveSource')?.classList.remove('error');
  setText('providerSymbol', symbol);
  setText('quoteCaptured', $('timeframe').value);
  setText('currentPrice', 'See TradingView');
  setText('currentPriceNote', `${asset} · ${$('timeframe').value} · TradingView live chart`);
  setText('sourceNote', `${symbol} · live embedded chart`);

  container.innerHTML = '<div class="tradingview-widget-container" style="height:100%;width:100%"><div class="tradingview-widget-container__widget" style="height:calc(100% - 32px);width:100%"></div><div class="tradingview-widget-copyright"><a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span class="blue-text">Chart</span></a><span class="trademark"> by TradingView</span></div></div>';
  const widget = container.querySelector('.tradingview-widget-container__widget');
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  script.async = true;
  script.innerHTML = JSON.stringify({ autosize: true, symbol, interval, timezone: 'Africa/Johannesburg', theme: 'dark', style: '1', locale: 'en', allow_symbol_change: false, hide_side_toolbar: false, hide_top_toolbar: false, hide_legend: false, hide_volume: false, withdateranges: true, save_image: false, calendar: false, details: false, hotlist: false, support_host: 'https://www.tradingview.com' });
  script.addEventListener('error', () => { container.innerHTML = '<div class="tv-error">TradingView chart failed to load. Refresh the page or check whether your network blocks TradingView.</div>'; setText('tvStatus', 'LOAD ERROR'); });
  widget.appendChild(script);
  setText('tvStatus', 'LIVE FEED');
}

function buildMarketContext() {
  const asset = $('asset').value;
  return { ok: true, asset, provider: 'TradingView', providerSymbol: TV_SYMBOLS[asset] || asset, timeframe: $('timeframe').value, timestamp: new Date().toISOString(), marketState: 'LIVE DISPLAY', chartAnalysis: imageReady ? 'TradingView screenshot supplied to AI' : 'No chart screenshot supplied', note: 'The embedded TradingView iframe is live, but its internal chart pixels are cross-origin and cannot be read by webpage JavaScript. Visual AI analysis uses the supplied TradingView screenshot when available.' };
}
async function fetchLiveMarket() { liveMarket = buildMarketContext(); renderTradingView(); return liveMarket; }
async function fetchLiveNews() { const asset = $('asset').value; if (!NEWS_ASSETS.has(asset)) return []; const data = await fetchJson(`/api/news?asset=${encodeURIComponent(asset)}&fresh=${Date.now()}`); liveNews = data.items || []; renderMacroNews(); return liveNews; }
async function fetchLiveCalendar() { const data = await fetchJson(`/api/calendar?fresh=${Date.now()}`); liveCalendar = data.events || []; renderCalendar(); return liveCalendar; }
async function refreshLiveContext() { try { await fetchLiveMarket(); await Promise.all([fetchLiveNews(), fetchLiveCalendar()]); return true; } catch (error) { setText('liveSource', error.message); $('liveSource')?.classList.add('error'); return false; } }

function renderMacroNews() {
  if (!liveNews.length) { $('newsList').innerHTML = '<article class="news-item"><div class="news-top"><span>LIVE FEED</span><b>WAITING</b></div><h3>No current headlines loaded</h3><p>The news feed did not return current headlines.</p></article>'; setText('newsStatus','WAITING'); return; }
  setText('newsStatus','LIVE');
  $('newsList').innerHTML = liveNews.map(item => `<article class="news-item"><div class="news-top"><span>${escapeHtml(formatDate(item.pubDate))}</span><b>LIVE</b><em>${escapeHtml(item.source || 'News')}</em></div><h3>${escapeHtml(item.title)}</h3><p>Current headline related to ${escapeHtml($('asset').value)}. Verify the full report at the original source.</p><small>${escapeHtml(item.source || 'Market news')}</small></article>`).join('');
}
function renderCalendar() {
  const filter = $('calendarFilter').value;
  const events = filter === 'all' ? liveCalendar : liveCalendar.filter(e => e.currency === filter);
  if (!events.length) { $('calendarList').innerHTML = '<article class="calendar-item"><div class="calendar-date"><strong>LIVE FEED</strong><span>Waiting</span></div><div class="calendar-event"><h3>No current calendar events loaded</h3><p>The calendar feed could not return current events.</p></div></article>'; return; }
  $('calendarList').innerHTML = events.map(e => `<article class="calendar-item"><div class="calendar-date"><strong>${escapeHtml(formatDate(e.date))}</strong><span>${escapeHtml(e.currency || '')}</span></div><div class="calendar-event"><div><b>${escapeHtml(e.currency || '')}</b><span class="impact-high">${escapeHtml(e.impact || 'EVENT')}</span></div><h3>${escapeHtml(e.title)}</h3><p>Actual: ${escapeHtml(e.actual ?? '—')} · Forecast: ${escapeHtml(e.forecast ?? '—')} · Previous: ${escapeHtml(e.previous ?? '—')}</p></div></article>`).join('');
}
$('calendarFilter').addEventListener('change', renderCalendar);
$('asset').addEventListener('change', async () => { setText('analysisMeta', `${$('asset').value} selected · updating TradingView`); await refreshLiveContext(); });
$('timeframe').addEventListener('change', async () => { setText('analysisMeta', `${$('asset').value} · ${$('timeframe').value} selected`); renderTradingView(); liveMarket = buildMarketContext(); });

function renderAnalysis(data) {
  const confidence = Math.max(0, Math.min(100, Number(data.confidence) || 0));
  setText('bias', data.bias || 'NEUTRAL');
  setText('biasReason', data.reason || 'The available evidence does not support a strong directional conclusion.');
  setText('confidence', confidence);
  $('confidenceBar').style.width = `${confidence}%`;
  setText('currentPrice', 'See TradingView');
  setText('currentPriceNote', data.chartUsed ? 'AI inspected the supplied TradingView chart screenshot.' : 'AI did not receive chart pixels. Upload the current TradingView chart for visual analysis.');
  setText('analysisMeta', `${$('asset').value} · ${$('timeframe').value} · ${formatDate(data.analyzedAt)}`);
  setText('researchSummary', data.summary || data.reason || 'No summary returned.');
  setText('providerSymbol', TV_SYMBOLS[$('asset').value] || $('asset').value);
  setText('quoteCaptured', $('timeframe').value);
  $('reasoning').innerHTML = [...(Array.isArray(data.reasoning) ? data.reasoning : []), `Chart evidence: ${data.priceContext || 'No numeric quote was invented.'}`, `Macro risk: ${data.newsRisk || 'UNKNOWN'}.`].map(x => `<li>${escapeHtml(x)}</li>`).join('');
  const warning = data.warning || ''; $('warningBox').hidden = !warning; $('warningBox').textContent = warning;
  $('dashboard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

analyzeBtn.addEventListener('click', async () => {
  analyzeBtn.classList.add('loading'); analyzeBtn.disabled = true;
  analyzeBtn.querySelector('span').textContent = imageReady ? 'Analyzing TradingView chart…' : 'Analyzing market context…';
  try {
    await refreshLiveContext();
    const payload = { image: imageReady ? imageDataUrl : null, asset: $('asset').value, timeframe: $('timeframe').value, style: $('style').value, risk: $('risk').value, market: liveMarket, news: $('includeNews').checked ? liveNews : [], calendar: $('includeNews').checked ? liveCalendar : [] };
    const data = await fetchJson('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    renderAnalysis(data);
  } catch (error) {
    setText('bias','ANALYSIS UNAVAILABLE'); setText('biasReason',error.message); setText('analysisMeta','Check the connected data sources'); setText('researchSummary','No research summary was generated.'); $('reasoning').innerHTML = '<li>The TradingView chart can still be viewed directly above.</li><li>For visual candle/structure analysis, upload a screenshot from the current TradingView chart.</li>'; $('warningBox').hidden = false; $('warningBox').textContent = error.message;
  } finally { analyzeBtn.querySelector('span').textContent = 'Analyze selected market'; analyzeBtn.disabled = false; analyzeBtn.classList.remove('loading'); }
});

renderMacroNews();
renderCalendar();
renderTradingView();
refreshLiveContext().catch(() => {});
