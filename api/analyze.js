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
    const hasImage = typeof image === 'string' && image.startsWith('data:image/');

    if (!selectedAsset) return res.status(400).json({ error: 'An asset is required.' });
    if (!market || String(market.asset || '').toUpperCase() !== selectedAsset) return res.status(400).json({ error: 'A fresh live market quote for the selected asset is required.' });

    const price = Number(market.price);
    const quoteTime = new Date(market.timestamp).getTime();
    const ageSeconds = (Date.now() - quoteTime) / 1000;
    if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: 'Live price is invalid. Analysis blocked.' });
    if (!Number.isFinite(quoteTime) || ageSeconds < -10 || ageSeconds > 10) return res.status(409).json({ error: `LIVE PRICE UNAVAILABLE: quote is stale (${Math.max(0, Math.round(ageSeconds))}s old).` });

    if (selectedAsset === 'XAUUSD') {
      const bid = Number(market.bid);
      const ask = Number(market.ask);
      if (market.provider !== 'Exness MT5' || market.broker !== 'Exness') return res.status(409).json({ error: 'EXNESS MT5 QUOTE REQUIRED: XAUUSD must come from the Exness MT5 bridge.' });
      if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0 || ask < bid) return res.status(409).json({ error: 'EXNESS MT5 QUOTE INVALID: Bid/Ask are required for XAUUSD.' });
    }

    const systemPrompt = `You are the research engine for an educational market-intelligence application. Use the VERIFIED LIVE quote as the authoritative current-price reference. ${hasImage ? 'Analyze the supplied chart screenshot for visible structure and explain what it shows.' : 'No chart image was supplied, so do not pretend to see chart patterns; use only the supplied live quote and macro context.'} Return ONLY valid JSON with this exact shape: {"bias":"BULLISH|BEARISH|NEUTRAL|NO TRADE","confidence":0,"reason":"","reasoning":["","",""],"summary":"","priceContext":"","newsRisk":"LOW|MEDIUM|HIGH","warning":""}. Confidence must be 0-100. Keep the response informational and research-oriented. Do not provide order instructions, entry prices, stop-losses, take-profit targets, position sizing, or guarantees. Never invent a price or chart feature. If evidence is insufficient, use NO TRADE or NEUTRAL and explain why.`;

    const userPrompt = `Asset: ${asset}\nTimeframe: ${timeframe}\nAnalysis style: ${style}\nResearch profile: ${risk}\nChart supplied: ${hasImage ? 'YES' : 'NO'}\n\nVERIFIED LIVE MARKET QUOTE (captured ${market.timestamp}; age ${Math.round(ageSeconds)} seconds):\n${JSON.stringify(market, null, 2)}\n\nCURRENT MACRO NEWS:\n${JSON.stringify(news || [], null, 2)}\n\nECONOMIC CALENDAR:\n${JSON.stringify(calendar || [], null, 2)}\n\nProvide a concise research summary. ${hasImage ? 'Describe only visible chart evidence and compare it with the current quote.' : 'Focus on current price context, quote quality, macro conditions and what additional chart evidence would be useful.'}`;

    const userContent = [{ type: 'input_text', text: userPrompt }];
    if (hasImage) userContent.push({ type: 'input_image', image_url: image });

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
        input: [
          { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
          { role: 'user', content: userContent }
        ],
        max_output_tokens: 900
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'AI provider error' });
    const result = JSON.parse(cleanJson(extractOutputText(data)));

    return res.status(200).json({
      ...result,
      chartUsed: hasImage,
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
