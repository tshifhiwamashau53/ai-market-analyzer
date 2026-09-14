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
    if (!market || String(market.asset || '').toUpperCase() !== selectedAsset) return res.status(400).json({ error: 'Market context for the selected asset is required.' });

    const price = Number(market.price);
    const hasNumericPrice = Number.isFinite(price) && price > 0;
    const quoteTime = new Date(market.timestamp).getTime();
    const hasTimestamp = Number.isFinite(quoteTime);
    const hasMachineData = Boolean(market.dataAvailable && Array.isArray(market.candles) && market.candles.length >= 50);

    const systemPrompt = `You are the research engine for an educational market-intelligence application. ${hasNumericPrice ? 'Use the supplied current market price as factual context.' : 'There is no verified numeric price; never invent one.'} ${hasMachineData ? 'Use the supplied OHLC candles and calculated indicators to assess trend, momentum, volatility and recent support/resistance.' : 'No machine-readable OHLC feed is available for this instrument, so do not pretend you have automatic chart data.'} ${hasImage ? 'You may also analyze the supplied chart screenshot, but describe only features actually visible in it.' : 'No chart screenshot was supplied, so do not claim to see visual chart patterns.'} Return ONLY valid JSON with this exact shape: {"bias":"BULLISH|BEARISH|NEUTRAL|NO TRADE","confidence":0,"reason":"","reasoning":["","",""],"summary":"","priceContext":"","newsRisk":"LOW|MEDIUM|HIGH","warning":""}. Confidence must be 0-100. This is research/education only. Do not provide order instructions, exact entries, stop-losses, take-profit targets, position sizing, or guarantees. Never invent prices, candles, indicators, news or chart features. If evidence conflicts or is insufficient, use NEUTRAL or NO TRADE. Explain the evidence clearly.`;

    const userPrompt = `Asset: ${asset}\nTimeframe: ${timeframe}\nAnalysis style: ${style}\nResearch profile: ${risk}\nChart supplied: ${hasImage ? 'YES' : 'NO'}\nMachine-readable market data: ${hasMachineData ? 'YES' : 'NO'}\n\nMARKET CONTEXT:\n${JSON.stringify(market, null, 2)}\n\nCURRENT MACRO NEWS:\n${JSON.stringify(news || [], null, 2)}\n\nECONOMIC CALENDAR:\n${JSON.stringify(calendar || [], null, 2)}\n\nAnalyze the selected market now. Summarize the directional bias, confidence, trend/momentum evidence, volatility, recent support/resistance context, and important macro risks. ${hasMachineData ? 'Use the supplied indicators and candle history as the primary machine-readable technical evidence.' : 'State that automatic technical data is unavailable rather than inventing it.'}`;

    const userContent = [{ type: 'input_text', text: userPrompt }];
    if (hasImage) userContent.push({ type: 'input_image', image_url: image });

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
        input: [{ role: 'system', content: [{ type: 'input_text', text: systemPrompt }] }, { role: 'user', content: userContent }],
        max_output_tokens: 1100
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'AI provider error' });
    const result = JSON.parse(cleanJson(extractOutputText(data)));

    return res.status(200).json({
      ...result,
      chartUsed: hasImage,
      machineDataUsed: hasMachineData,
      model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
      analyzedAt: new Date().toISOString(),
      livePriceUsed: hasNumericPrice ? price : null,
      livePriceTimestamp: hasTimestamp ? market.timestamp : null,
      liveProvider: market.provider || 'TradingView',
      liveBid: Number.isFinite(Number(market.bid)) ? Number(market.bid) : null,
      liveAsk: Number.isFinite(Number(market.ask)) ? Number(market.ask) : null
    });
  } catch (error) {
    return res.status(500).json({ error: 'AI analysis failed', details: error.message });
  }
}
