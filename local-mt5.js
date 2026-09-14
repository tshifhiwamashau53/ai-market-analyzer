/* Local MT5 adapter: keeps broker data on the user's computer and avoids paid AI APIs. */
(function () {
  const originalFetch = window.fetch.bind(window);
  const BRIDGE = 'http://127.0.0.1:8765';

  function ema(values, period) {
    if (values.length < period) return null;
    const k = 2 / (period + 1);
    let value = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < values.length; i += 1) value += (values[i] - value) * k;
    return value;
  }

  function rsi(values, period) {
    if (values.length <= period) return null;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i += 1) {
      const d = values[i] - values[i - 1];
      if (d >= 0) gain += d; else loss += Math.abs(d);
    }
    let avgGain = gain / period, avgLoss = loss / period;
    for (let i = period + 1; i < values.length; i += 1) {
      const d = values[i] - values[i - 1];
      avgGain = ((avgGain * (period - 1)) + Math.max(d, 0)) / period;
      avgLoss = ((avgLoss * (period - 1)) + Math.max(-d, 0)) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
  }

  function atr(candles, period) {
    if (candles.length <= period) return null;
    const tr = [];
    for (let i = 1; i < candles.length; i += 1) {
      const c = candles[i], p = candles[i - 1];
      tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    }
    return tr.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  function buildResponse(data, asset, interval) {
    const candles = Array.isArray(data.candles) ? data.candles : [];
    const closes = candles.map(c => Number(c.close));
    const latest = candles[candles.length - 1];
    if (!latest || candles.length < 50) throw new Error('MT5 returned fewer than 50 candles. Open the requested symbol in MT5 and try again.');
    const recent = candles.slice(-20);
    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);
    const rsi14 = rsi(closes, 14);
    const atr14 = atr(candles, 14);
    const support = Math.min(...recent.map(c => Number(c.low)));
    const resistance = Math.max(...recent.map(c => Number(c.high)));
    let structure = 'NEUTRAL';
    if (latest.close > ema20 && ema20 > ema50) structure = 'BULLISH';
    else if (latest.close < ema20 && ema20 < ema50) structure = 'BEARISH';
    return {
      ok: true,
      asset,
      provider: 'Exness MT5 (local)',
      providerSymbol: data.providerSymbol,
      timeframe: interval,
      timestamp: latest.time,
      price: latest.close,
      bid: data.bid ?? null,
      ask: data.ask ?? null,
      candles,
      indicators: { ema20, ema50, rsi14, atr14, support, resistance, structure },
      note: 'Read-only OHLC data supplied directly by the local MT5 bridge.'
    };
  }

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url;
    try {
      const parsed = new URL(url, window.location.href);
      if (parsed.pathname === '/api/market-data' && parsed.searchParams.get('asset') === 'XAUUSD') {
        const interval = parsed.searchParams.get('interval') || '5m';
        const bridge = await originalFetch(`${BRIDGE}/candles?asset=XAUUSD&interval=${encodeURIComponent(interval)}&limit=200`, { cache: 'no-store' });
        if (!bridge.ok) throw new Error('Local MT5 bridge returned an error.');
        const raw = await bridge.json();
        const payload = buildResponse(raw, 'XAUUSD', interval);
        return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    } catch (error) {
      console.warn('Local MT5 adapter:', error.message);
    }
    return originalFetch(input, init);
  };
})();
