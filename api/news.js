const QUERY_BY_ASSET = {
  XAUUSD: 'gold XAUUSD Federal Reserve CPI inflation interest rates',
  BTCUSD: 'bitcoin BTC Federal Reserve macro markets',
  US30: 'Dow Jones US stocks Federal Reserve inflation macro',
  EURUSD: 'EUR USD ECB Federal Reserve inflation rates',
  GBPUSD: 'GBP USD Bank of England Federal Reserve inflation rates',
  ETHUSD: 'ethereum crypto Federal Reserve macro markets'
};

function clean(value = '') {
  return value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
}

export default async function handler(req, res) {
  const asset = String(req.query?.asset || 'XAUUSD').toUpperCase();
  const query = QUERY_BY_ASSET[asset] || QUERY_BY_ASSET.XAUUSD;

  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetch(rssUrl, { headers: { 'User-Agent': 'AI-Market-Analyzer/1.0' } });
    if (!response.ok) throw new Error(`News provider returned ${response.status}`);
    const xml = await response.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 8).map(match => {
      const item = match[1];
      const title = clean((item.match(/<title>([\s\S]*?)<\/title>/i) || [,''])[1]);
      const link = clean((item.match(/<link>([\s\S]*?)<\/link>/i) || [,''])[1]);
      const pubDate = clean((item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [,''])[1]);
      const source = clean((item.match(/<source[^>]*>([\s\S]*?)<\/source>/i) || [,''])[1]);
      return { title, link, pubDate, source };
    }).filter(item => item.title && item.link);

    return res.status(200).json({ asset, updatedAt: new Date().toISOString(), items });
  } catch (error) {
    return res.status(502).json({ error: 'Live news unavailable', details: error.message, items: [] });
  }
}
