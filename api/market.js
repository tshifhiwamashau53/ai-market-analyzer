const SYMBOLS = {
  XAUUSD: 'GC=F',
  BTCUSD: 'BTC-USD',
  US30: '^DJI',
  EURUSD: 'EURUSD=X',
  GBPUSD: 'GBPUSD=X',
  ETHUSD: 'ETH-USD'
};

export default async function handler(req, res) {
  const asset = String(req.query?.asset || 'XAUUSD').toUpperCase();
  const symbol = SYMBOLS[asset];
  if (!symbol) return res.status(400).json({ error: 'Unsupported asset' });

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m&includePrePost=true`;
    const response = await fetch(url, { headers: { 'User-Agent': 'AI-Market-Analyzer/1.0' } });
    if (!response.ok) throw new Error(`Market provider returned ${response.status}`);
    const json = await response.json();
    const meta = json.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) throw new Error('No current price returned');

    const price = Number(meta.regularMarketPrice);
    const previous = Number(meta.previousClose ?? meta.chartPreviousClose ?? price);
    const change = price - previous;
    const changePct = previous ? (change / previous) * 100 : 0;

    return res.status(200).json({
      asset,
      providerSymbol: symbol,
      price,
      previousClose: previous,
      change,
      changePct,
      currency: meta.currency || 'USD',
      exchange: meta.exchangeName || meta.fullExchangeName || '',
      marketState: meta.marketState || '',
      timestamp: new Date().toISOString(),
      note: asset === 'XAUUSD' || asset === 'US30'
        ? 'Reference quote. Broker/CFD prices can differ from the underlying futures/index quote.'
        : 'Reference market quote.'
    });
  } catch (error) {
    return res.status(502).json({ error: 'Live market quote unavailable', details: error.message });
  }
}
