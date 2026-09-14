function extractOutputText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  return (data.output || []).flatMap(item => item.content || []).map(part => part.text || '').join('');
}

function cleanJson(text) {
  return text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'OPENAI_API_KEY is not configured on the backend.' });

  try {
    const body = req.body || {};
    const { image, asset, timeframe, style, risk, market, news, calendar } = body;
    const selectedAsset = String(asset || '').toUpperCase();

    if (!image || !image.startsWith('data:image/')) return res.status(400).json({ error: 'A chart image is required.' });
    if (!market || market.asset !== selectedAsset) {
      return res.status(400).json({ error: 'A fresh live market quote for the selected asset is required.' });
    }

    const price = Number(market.price);
    const quoteTime = new Date(market.timestamp).getTime();
    const ageSeconds = (Date.now() - quoteTime) / 1000;

    if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: 'Live price is invalid. Analysis blocked.' });
    if (!Number.isFinite(quoteTime) || ageSeconds < -10 || ageSeconds > 10) {
      return res.status(409).json({ error: `LIVE PRICE UNAVAILABLE: quote is stale (${Math.max(0, Math.round(ageSeconds))}s old).` });
    }

    // XAUUSD is broker-specific in this application. Never silently replace the
    // Exness MT5 quote with a public reference/futures price.
    if (selectedAsset === 'XAUUSD') {
      const bid = Number(market.bid);
      const ask = Number(market.ask);
      if (market.provider !== 'Exness MT5' || market.broker !== 'Exness') {
        return res.status(409).json({ error: 'EXNESS MT5 QUOTE REQUIRED: XAUUSD must come from the Exness MT5 bridge.' });
      }
      if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0 || ask < bid) {
        return res.status(409).json({ error: 'EXNESS MT5 QUOTE INVALID: Bid/Ask are required for XAUUSD.' });
      }
    }

    const systemPrompt = `You are the analysis engine for an educational market-chart research application. Analyze the supplied chart screenshot visually and combine it with the supplied VERIFIED LIVE market quote and macro context. The live quote is authoritative for the current reference price. Do not claim certainty. If the screenshot and live quote conflict, explicitly say so. Never invent a price that is not visible or supplied. Return ONLY valid JSON with this exact shape: {"bias":"BULLISH|BEARISH|NEUTRAL|NO TRADE","confidence":0,"entry":"","stopLoss":"","tp1":"","tp2":"","tp3":"","rr1":"","rr2":"","rr3":"","reason":"","reasoning":["","",""],"priceContext":"","newsRisk":"LOW|MEDIUM|HIGH","warning":""}. Confidence must be 0-100. Use NO TRADE when the chart is unclear or conditions conflict. Treat all levels as analytical estimates for research, not guaranteed outcomes.`;

    const userPrompt = `Asset: ${asset}\nTimeframe: ${timeframe}\nAnalysis style: ${style}\nRisk profile: ${risk}\n\nVERIFIED LIVE MARKET QUOTE (captured ${market.timestamp}; age ${Math.round(ageSeconds)} seconds):\n${JSON.stringify(market, null, 2)}\n\nCURRENT MACRO NEWS:\n${JSON.stringify(news || [], null, 2)}\n\nECONOMIC CALENDAR:\n${JSON.stringify(calendar || [], null, 2)}\n\nAnalyze the uploaded screenshot. Identify visible market structure, trend, liquidity/sweeps, support/resistance, and whether the verified live reference price is consistent with the screenshot. Base all proposed levels around the supplied current price rather than an old chart price. Give conservative, research-oriented levels and a clear NO TRADE result if evidence is insufficient.`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
        input: [
          { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
          { role: 'user', content: [
            { type: 'input_text', text: userPrompt },
            { type: 'input_image', image_url: image }
          ] }
        ],
        max_output_tokens: 900
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'AI provider error' });

    const text = cleanJson(extractOutputText(data));
    const result = JSON.parse(text);
    return res.status(200).json({
      ...result,
      model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
      analyzedAt: new Date().toISOString(),
      livePriceUsed: price,
      livePriceTimestamp: market.timestamp,
      liveProvider: market.provider,
      liveBid: Number.isFinite(Number(market.bid)) ? Number(market.bid) : null,
      liveAsk: Number.isFinite(Number(market.ask)) ? Number(market.ask) : null
    });
  } catch (error) {
    return res.status(500).json({ error: 'AI analysis failed', details: error.message });
  }
}
