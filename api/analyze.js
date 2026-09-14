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

    const systemPrompt = `You are the research engine for an educational market-intelligence application. ${hasNumericPrice ? 'Use the supplied current market price as context.' : 'The embedded TradingView chart is the live market display, but its exact quote is not exposed to page JavaScript. Never invent or estimate a numeric current price.'} ${hasImage ? 'Analyze the supplied chart screenshot for visible structure and explain only what is actually visible.' : 'No chart image was supplied, so do not pretend to see chart patterns; use only the supplied market context and macro information.'} Return ONLY valid JSON with this exact shape: {"bias":"BULLISH|BEARISH|NEUTRAL|NO TRADE","confidence":0,"reason":"","reasoning":["","",""],"summary":"","priceContext":"","newsRisk":"LOW|MEDIUM|HIGH","warning":""}. Confidence must be 0-100. Keep the response informational and research-oriented. Do not provide order instructions, entry prices, stop-losses, take-profit targets, position sizing, or guarantees. Never invent a price or chart feature. If evidence is insufficient, use NO TRADE or NEUTRAL and explain why.`;

    const userPrompt = `Asset: ${asset}\nTimeframe: ${timeframe}\nAnalysis style: ${style}\nResearch profile: ${risk}\nChart supplied: ${hasImage ? 'YES' : 'NO'}\n\nMARKET CONTEXT:\n${JSON.stringify(market, null, 2)}\n\nCURRENT MACRO NEWS:\n${JSON.stringify(news || [], null, 2)}\n\nECONOMIC CALENDAR:\n${JSON.stringify(calendar || [], null, 2)}\n\nProvide a concise research summary. ${hasImage ? 'Describe only visible chart evidence and compare it with the supplied market context.' : 'Focus on the selected asset, macro conditions, market-data availability and what additional chart evidence would be useful.'}`;

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
