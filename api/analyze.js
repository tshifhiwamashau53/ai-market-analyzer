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
    if (!image || !image.startsWith('data:image/')) return res.status(400).json({ error: 'A chart image is required.' });

    const systemPrompt = `You are the analysis engine for an educational market-chart research application. Analyze the supplied chart screenshot visually and combine it with the supplied live market quote and macro context. Do not claim certainty. If the screenshot and live quote conflict, explicitly say so. Never invent a price that is not visible or supplied. Return ONLY valid JSON with this exact shape: {"bias":"BULLISH|BEARISH|NEUTRAL|NO TRADE","confidence":0,"entry":"","stopLoss":"","tp1":"","tp2":"","tp3":"","rr1":"","rr2":"","reason":"","reasoning":["","",""],"priceContext":"","newsRisk":"LOW|MEDIUM|HIGH","warning":""}. Confidence must be 0-100. Use NO TRADE when the chart is unclear or conditions conflict. Treat all levels as analytical estimates for research, not guaranteed outcomes.`;

    const userPrompt = `Asset: ${asset}\nTimeframe: ${timeframe}\nAnalysis style: ${style}\nRisk profile: ${risk}\n\nLIVE MARKET QUOTE:\n${JSON.stringify(market || {}, null, 2)}\n\nCURRENT MACRO NEWS:\n${JSON.stringify(news || [], null, 2)}\n\nECONOMIC CALENDAR:\n${JSON.stringify(calendar || [], null, 2)}\n\nAnalyze the uploaded screenshot. Identify visible market structure, trend, liquidity/sweeps, support/resistance, and whether the live reference price is consistent with the screenshot. Give conservative, research-oriented levels and a clear NO TRADE result if evidence is insufficient.`;

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
    return res.status(200).json({ ...result, model: process.env.OPENAI_MODEL || 'gpt-5.6-luna', analyzedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'AI analysis failed', details: error.message });
  }
}
