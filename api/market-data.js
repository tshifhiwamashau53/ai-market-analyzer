const BINANCE_SYMBOLS = {
  BTCUSD: 'BTCUSDT',
  ETHUSD: 'ETHUSDT',
  SOLUSD: 'SOLUSDT'
};

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / period;
}

function ema(values, period) {
  if (values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let result = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let i = period; i < values.length; i += 1) result = (values[i] - result) * multiplier + result;
  return result;
}

function rsi(closes, period = 14) {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change; else losses += Math.abs(change);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function atr(candles, period = 14) {
  if (candles.length <= period) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];
    trs.push(Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close)));
  }
  return sma(trs, period);
}

export default async function handler(req, res) {
  const asset = String(req.query?.asset || '').toUpperCase();
  const interval = String(req.query?.interval || '15');
  const limit = Math.min(Math.max(Number(req.query?.limit) || 150, 50), 500);
  const symbol = BINANCE_SYMBOLS[asset];

  if (!symbol) {
    return res.status(200).json({
      ok: false,
      asset,
      provider: 'Not configured',
      message: 'Automatic OHLC data is currently enabled for BTCUSD, ETHUSD and SOLUSD. The TradingView chart remains available for other instruments.'
    });
  }

  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'AI-Market-Analyzer/1.0' } });
    if (!response.ok) throw new Error(`Market provider returned ${response.status}`);
    const raw = await response.json();
    const candles = raw.map(row => ({
      time: new Date(Number(row[0])).toISOString(),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5])
    }));
    const closes = candles.map(c => c.close);
    const latest = candles[candles.length - 1];
    const previous = candles[candles.length - 2];
    const price = latest.close;
    const change = previous ? ((price - previous.close) / previous.close) * 100 : 0;
    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);
    const rsi14 = rsi(closes, 14);
    const atr14 = atr(candles, 14);
    const recent = candles.slice(-20);
    const support = Math.min(...recent.map(c => c.low));
    const resistance = Math.max(...recent.map(c => c.high));
    let structure = 'NEUTRAL';
    if (ema20 && ema50 && price > ema20 && ema20 > ema50) structure = 'BULLISH';
    if (ema20 && ema50 && price < ema20 && ema20 < ema50) structure = 'BEARISH';

    return res.status(200).json({
      ok: true,
      asset,
      provider: 'Binance public market data',
      providerSymbol: symbol,
      timeframe: interval,
      timestamp: latest.time,
      price,
      changePercent: change,
      bid: null,
      ask: null,
      candles,
      indicators: { ema20, ema50, rsi14, atr14, support, resistance, structure },
      note: 'Read-only market research data. Values are supplied for analysis and are not trade execution instructions.'
    });
  } catch (error) {
    return res.status(502).json({ ok: false, asset, error: 'Live market data unavailable', details: error.message });
  }
}
