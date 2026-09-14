const $ = (id) => document.getElementById(id);
const input = $('chartInput');
const dropzone = $('dropzone');
const previewWrap = $('previewWrap');
const preview = $('chartPreview');
const analyzeBtn = $('analyzeBtn');
let imageReady = false;

function showPreview(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > 10 * 1024 * 1024) {
    alert('Please choose an image smaller than 10 MB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = (event) => {
    preview.src = event.target.result;
    previewWrap.hidden = false;
    dropzone.hidden = true;
    imageReady = true;
    $('analysisMeta').textContent = `${file.name} · ready`;
  };
  reader.readAsDataURL(file);
}

input.addEventListener('change', (e) => showPreview(e.target.files[0]));
['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, e => {
  e.preventDefault();
  dropzone.classList.add('dragover');
}));
['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
}));
dropzone.addEventListener('drop', e => showPreview(e.dataTransfer.files[0]));
$('removeImage').addEventListener('click', () => {
  input.value = '';
  preview.src = '';
  previewWrap.hidden = true;
  dropzone.hidden = false;
  imageReady = false;
  $('analysisMeta').textContent = 'Waiting for chart';
});

function setText(id, value) { $(id).textContent = value; }
function renderDemo() {
  // Frontend demo only. Replace this block with a POST to your secure backend.
  const asset = $('asset').value;
  const tf = $('timeframe').value;
  const sample = {
    XAUUSD: ['BULLISH', 'Price structure is leaning upward; wait for confirmation at a key liquidity area.', '2668.0–2673.0', '2658.0', '2685.0', '2700.0', '2718.0'],
    BTCUSD: ['BULLISH', 'Higher-timeframe structure is constructive, but volatility requires confirmation.', '108500–109200', '106900', '110800', '112600', '115000'],
    US30: ['NEUTRAL', 'Conflicting structure detected. A cleaner setup is preferred before entry.', '—', '—', '—', '—', '—'],
    EURUSD: ['BEARISH', 'Downward structure is dominant in this demo state; confirmation is still required.', '1.1720–1.1740', '1.1765', '1.1685', '1.1650', '1.1600'],
    GBPUSD: ['NEUTRAL', 'Price is between important levels. Waiting for a confirmed break or rejection.', '—', '—', '—', '—', '—'],
    ETHUSD: ['BULLISH', 'Momentum is constructive in this demo state, subject to confirmation.', '4280–4310', '4205', '4370', '4450', '4560']
  };
  const data = sample[asset] || sample.XAUUSD;
  setText('bias', data[0]);
  setText('biasReason', data[1]);
  setText('entry', data[2]);
  setText('sl', data[3]);
  setText('tp1', data[4]);
  setText('tp2', data[5]);
  setText('tp3', data[6]);
  setText('rr1', data[3] === '—' ? '—' : '1R+');
  setText('rr2', data[3] === '—' ? '—' : '2R+');
  setText('rr3', data[3] === '—' ? '—' : '3R+');
  setText('entryNote', data[2] === '—' ? 'No clean entry in this demo state.' : `${asset} · ${tf} · ${$('style').value}`);
  const confidence = data[0] === 'NEUTRAL' ? 48 : 72;
  setText('confidence', confidence);
  $('confidenceBar').style.width = `${confidence}%`;
  setText('analysisMeta', `${asset} · ${tf} · demo analysis`);
  $('reasoning').innerHTML = [
    `Market bias: ${data[0].toLowerCase()} based on the current demo state.`,
    'Key structure and liquidity should be validated against the actual chart.',
    $('includeNews').checked ? 'News scan is queued for the secure backend.' : 'News context disabled by the user.'
  ].map(x => `<li>${x}</li>`).join('');
  $('newsStatus').textContent = $('includeNews').checked ? 'BACKEND READY' : 'DISABLED';
}

analyzeBtn.addEventListener('click', async () => {
  if (!imageReady) {
    alert('Upload a chart screenshot first.');
    return;
  }
  analyzeBtn.classList.add('loading');
  analyzeBtn.disabled = true;
  analyzeBtn.querySelector('span').textContent = 'Analyzing…';
  await new Promise(resolve => setTimeout(resolve, 900));
  renderDemo();
  analyzeBtn.querySelector('span').textContent = 'Analyze again';
  analyzeBtn.disabled = false;
  analyzeBtn.classList.remove('loading');
  $('dashboard').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
