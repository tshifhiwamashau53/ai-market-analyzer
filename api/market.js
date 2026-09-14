const SYMBOLS = {
  XAUUSD: 'XAU/USD',
  BTCUSD: 'BTC/USD',
  US30: 'DJI',
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
  ETHUSD: 'ETH/USD'
};

const YAHOO_SYMBOLS = {
  BTCUSD: 'BTC-USD',
  US30: '^DJI',
  EURUSD: 'EURUSD=X',
  GBPUSD: 'GBPUSD=X',
  ETHUSD: 'ETH-USD'
};

function fail(res, status, error, details = '') {
  return res.status(status).json({ ok: false, error, details });
}

async function twelveDataQuote(symbol, apiKey) {
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, { cache: 'no-store' });
  const json = await response.json();
  if (!response.ok || json.status === 'error' || !json.close) {
    throw new Error(json.message || `Twelve Data returned ${response.status}`);
  }

  const price = Number(json.close);
  const previous = Number(json.previous_close ?? json.close);
  const timestamp = json.timestamp
    ? new Date(Number(json.timestamp) * 1000).toISOString()
    : new Date().toISOString();

  if (!Number.isFinite(price) || price <= 0) throw new Error('Provider returned an invalid price');

  return {
    price,
    previousClose: previous,
    change: Number(json.change ?? price - previous),
    changePct: Number(json.percent_change ?? (previous ? ((price - previous) / previous) * 100 : 0)),
    timestamp,
    exchange: json.exchange || json.mic_code || 'Twelve Data',
    currency: 'USD',
    marketState: 'LIVE',
    provider: 'Twelve Data'
  };
}

async function yahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m&includePrePost=true&_=${Date.now()}`;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'AI-Market-Analyzer/2.0' }
  });
  if (!response.ok) throw new Error(`Yahoo returned ${response.status}`);
  const json = await response.json();
  const meta = json.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error('No current price returned');

  const price = Number(meta.regularMarketPrice);
  const previous = Number(meta.previousClose ?? meta.chartPreviousClose ?? price);
  const epoch = Number(meta.regularMarketTime || Math.floor(Date.now() / 1000));
  if (!Number.isFinite(price) || price <= 0) throw new Error('Provider returned an invalid price');

  return {
    price,
    previousClose: previous,
    change: price - previous,
    changePct: previous ? ((price - previous) / previous) * 100 : 0,
    timestamp: new Date(epoch * 1000).toISOString(),
    exchange: meta.exchangeName || meta.fullExchangeName || 'Yahoo Finance',
    currency: meta.currency || 'USD',
    marketState: meta.marketState || '',
    provider: 'Yahoo Finance'
  };
}

export default async function handler(req, res) {
  const asset = String(req.query?.asset || 'XAUUSD').toUpperCase();
  if (!SYMBOLS[asset]) return fail(res, 400, 'Unsupported asset');

  try {
    const apiKey = process.env.TWELVE_DATA_API_KEY;
    let quote;

    // XAUUSD must come from a spot-capable quote provider. GC=F is gold futures,
    // so it is deliberately NOT used as a fake XAUUSD replacement.
    if (apiKey) {
      quote = await twelveDataQuote(SYMBOLS[asset], apiKey);
    } else if (asset !== 'XAUUSD') {
      quote = await yahooQuote(YAHOO_SYMBOLS[asset]);
    } else {
      return fail(
        res,
        503,
        'XAUUSD live spot feed is not configured',
        'Add TWELVE_DATA_API_KEY (or connect a broker/MT5 feed) before analyzing XAUUSD.'
      );
    }

    const ageSeconds = Math.max(0, (Date.now() - new Date(quote.timestamp).getTime()) / 1000);
    if (!Number.isFinite(ageSeconds) || ageSeconds > 90) {
      return fail(res, 503, 'Live quote is stale', `Quote age is ${Math.round(ageSeconds)} seconds.`);
    }

    return res.status(200).json({
      ok: true,
      asset,
      providerSymbol: SYMBOLS[asset],
      price: quote.price,
      previousClose: quote.previousClose,
      change: quote.change,
      changePct: quote.changePct,
      currency: quote.currency,
      exchange: quote.exchange,
      marketState: quote.marketState,
      provider: quote.provider,
      timestamp: quote.timestamp,
      ageSeconds: Math.round(ageSeconds),
      note: asset === 'XAUUSD'
        ? 'Live XAU/USD spot reference. Your MT4/MT5 broker can differ because of broker pricing, spread and execution.'
        : 'Live reference quote. Your broker/CFD feed can differ because of pricing, spread and execution.'
    });
  } catch (error) {
    return fail(res, 502, 'Live market quote unavailable', error.message);
  }
}
