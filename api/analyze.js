function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function compactMarket(m) {
  if (!m) return null;
  const i = m.indicators || {};
  return {
    asset: m.asset,
    timeframe: m.timeframe,
    provider: m.provider,
    timestamp: m.timestamp,
    price: safeNumber(m.price),
    changePercent: safeNumber(m.changePercent),
    poc: safeNumber(m.poc),
    indicators: {
      ema20: safeNumber(i.ema20),
      ema50: safeNumber(i.ema50),
      rsi14: safeNumber(i.rsi14),
      atr14: safeNumber(i.atr14),
      vwap: safeNumber(i.vwap),
      support: safeNumber(i.support),
      resistance: safeNumber(i.resistance),
      structure: i.structure || 'NEUTRAL'
    },
    momentum: m.momentum || 'MIXED',
    volatility: safeNumber(m.volatility)
  };
}

function buildPrompt(body) {
  const markets = body.markets || {};
  return [
    'You are the AI reasoning layer of a read-only market research dashboard.',
    'Do not place orders, connect to a broker, or claim certainty or guaranteed profitability.',
    'Analyze the supplied numerical market data and, if present, the supplied chart screenshot.',
    'Use this sequence as the requested framework: higher-timeframe bias -> accumulation -> volume profile/POC -> breakout -> pullback to POC -> continuation.',
    'Only mark a stage as confirmed when the supplied evidence supports it. If evidence is missing, say WAITING or UNCONFIRMED.',
    'Treat confidence as analysis quality/confluence, NOT probability of profit.',
    'If the screenshot and numerical data disagree, explicitly mention the disagreement.',
    'Never invent a current price. Use only supplied market data.',
    '',
    JSON.stringify({
      asset: body.asset,
      executionTimeframe: body.timeframe,
      depth: body.depth || 'deep',
      markets: {
        '4h': compactMarket(markets['4h']),
        '1h': compactMarket(markets['1h']),
        '15m': compactMarket(markets['15m']),
        '5m': compactMarket(markets['5m'])
      },
      strategy: body.strategy || null,
      visualAnalysis: body.visualAnalysis || null,
      news: Array.isArray(body.news) ? body.news.slice(0, 8) : [],
      calendar: Array.isArray(body.calendar) ? body.calendar.slice(0, 8) : []
    }, null, 2)
  ].join('\n');
}

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    market_state: { type: 'string', enum: ['BULLISH', 'BEARISH', 'NEUTRAL', 'WAIT'] },
    higher_timeframe_bias: { type: 'string', enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
    setup_stage: { type: 'string' },
    analysis_quality: { type: 'number', minimum: 0, maximum: 100 },
    summary: { type: 'string' },
    waiting_for: { type: 'string' },
    reference_level: { type: ['number', 'null'] },
    invalidation_level: { type: ['number', 'null'] },
    target_levels: { type: 'array', items: { type: 'number' } },
    poc: { type: ['number', 'null'] },
    reasoning: { type: 'array', items: { type: 'string' } },
    risk_notes: { type: 'array', items: { type: 'string' } },
    data_quality: { type: 'string', enum: ['GOOD', 'PARTIAL', 'INSUFFICIENT'] }
  },
  required: [
    'market_state',
    'higher_timeframe_bias',
    'setup_stage',
    'analysis_quality',
    'summary',
    'waiting_for',
    'reference_level',
    'invalidation_level',
    'target_levels',
    'poc',
    'reasoning',
    'risk_notes',
    'data_quality'
  ]
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST required' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: 'OPENAI_API_KEY is not configured on Vercel.',
      setup: 'Add OPENAI_API_KEY to the Vercel project Environment Variables and redeploy.'
    });
  }

  try {
    const body = req.body || {};
    const asset = String(body.asset || '').toUpperCase();
    if (!asset) return res.status(400).json({ error: 'An asset is required.' });

    const prompt = buildPrompt(body);
    const input = [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }];

    if (typeof body.image === 'string' && body.image.startsWith('data:image/')) {
      input[0].content.push({
        type: 'input_image',
        image_url: body.image,
        detail: 'high'
      });
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.5',
        tools: [{ type: 'web_search' }],
        tool_choice: { type: 'web_search' },
        input,
        reasoning: { effort: 'medium' },
        text: {
          format: {
            type: 'json_schema',
            name: 'market_analysis',
            strict: true,
            schema
          }
        }
      })
    });

    const raw = await response.json();
    if (!response.ok) {
      return res.status(response.status >= 500 ? 502 : response.status).json({
        error: 'OpenAI request failed.',
        details: raw?.error?.message || 'Unknown OpenAI API error.'
      });
    }

    const text = raw.output_text || raw.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text;
    if (!text) return res.status(502).json({ error: 'OpenAI returned no analysis text.' });

    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: 'OpenAI returned invalid structured analysis.' });
    }

    return res.status(200).json({
      ok: true,
      model: raw.model || process.env.OPENAI_MODEL || 'gpt-5.6-luna',
      analysis,
      responseId: raw.id || null,
      analyzedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      error: 'AI analysis failed.',
      details: error?.message || 'Unknown server error.'
    });
  }
}
