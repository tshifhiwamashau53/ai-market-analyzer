function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function compactMarket(m) {
  if (!m) return null;
  const i = m.indicators || {};
  const candles = Array.isArray(m.candles) ? m.candles.map(c => ({
    time: c.time, open: safeNumber(c.open), high: safeNumber(c.high),
    low: safeNumber(c.low), close: safeNumber(c.close), volume: safeNumber(c.volume)
  })) : [];
  return {
    asset: m.asset || m.symbol || null,
    timeframe: m.timeframe || m.interval || null,
    provider: m.provider || m.source || null,
    timestamp: m.timestamp || null,
    price: safeNumber(m.price ?? m.currentPrice),
    bid: safeNumber(m.bid), ask: safeNumber(m.ask), spread: safeNumber(m.spread),
    changePercent: safeNumber(m.changePercent),
    poc: safeNumber(m.poc ?? i.poc),
    candles,
    indicators: {
      ema20: safeNumber(i.ema20), ema50: safeNumber(i.ema50),
      rsi14: safeNumber(i.rsi14 ?? i.rsi), macd: safeNumber(i.macd),
      macdSignal: safeNumber(i.macdSignal ?? i.macd_signal),
      atr14: safeNumber(i.atr14 ?? i.atr), vwap: safeNumber(i.vwap),
      support: safeNumber(i.support), resistance: safeNumber(i.resistance),
      structure: i.structure || null, candlePattern: i.candlePattern || null,
      structureDetail: i.structureDetail || null, poc: safeNumber(i.poc ?? m.poc),
      vah: safeNumber(i.vah), val: safeNumber(i.val),
      volatilityPercent: safeNumber(i.volatilityPercent)
    },
    momentum: m.momentum || null,
    volatility: safeNumber(m.volatility ?? i.volatilityPercent)
  };
}

function buildPrompt(body) {
  const markets = body.markets || {};
  return [
    'You are the Adaptive Market Intelligence Engine for a stateless, API-driven market analysis platform.',
    'Analyze ONLY verified data supplied in this request. NEVER fabricate, extrapolate, guess, or fill missing prices, candles, volume, indicators, news, macro data, or levels.',
    'Do not use screenshots or visual inputs. Numerical OHLCV and supplied structured data are the sole market-data source.',
    'Do not use a predefined named strategy or fixed sequence. Diagnose the market regime first, then select the analytical framework supported by the evidence.',
    'Capital preservation first. If data is insufficient, ambiguous, conflicting, choppy, stale, or the entry has passed, return WAIT.',
    'Analyze OHLCV for HH, HL, LH, LL, BoS, CHoCH, liquidity sweeps, FVG/imbalances, displacement, candle closing strength and relative volume when sufficient data exists.',
    'Classify the regime using measurable evidence: trend continuation, range/mean reversion, breakout/momentum, volume-profile behavior, or another evidence-supported framework.',
    'Use macro, intermediate and execution timeframes. If intermediate structure strongly conflicts with macro bias without a confirmed structural shift, return WAIT.',
    'Use supplied fundamental/news/calendar data when present. Do not invent events. If a supplied tier-1 event is imminent and its outcome is unknown, return WAIT.',
    'For BUY or SELL, entry must align with an observed structural node or retest. Stop loss must invalidate the thesis and include an ATR volatility buffer when ATR is available. Targets must correspond to supplied historical liquidity, order-block or volume-profile levels. Never invent a target.',
    'Calculate R:R from actual entry, stop and targets. If TP1 R:R is below 1:1.5, return WAIT.',
    'Confidence is evidentiary confluence from 0-100, NOT win-rate probability. Below 60 must be WAIT.',
    'When WAIT, specify the exact missing threshold, level, confirmation, structural shift, or data condition required to unlock a trade.',
    'Return ONLY the requested JSON schema.',
    JSON.stringify({
      instrument: body.asset,
      executionTimeframe: body.timeframe,
      markets: {
        '4h': compactMarket(markets['4h']), '1h': compactMarket(markets['1h']),
        '15m': compactMarket(markets['15m']), '5m': compactMarket(markets['5m'])
      },
      fundamentals: body.fundamentals ?? null,
      news: Array.isArray(body.news) ? body.news : [],
      calendar: Array.isArray(body.calendar) ? body.calendar : []
    }, null, 2)
  ].join('\\n');
}

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    decision: { type: 'string', enum: ['BUY','SELL','WAIT'] },
    confidence: { type: 'number', minimum: 0, maximum: 100 },
    instrument: { type: 'string' }, timeframe: { type: 'string' },
    currentPrice: { type: ['number','null'] }, marketCondition: { type: 'string' },
    analysisFramework: { type: 'string' },
    higherTimeframeBias: { type: 'string', enum: ['BULLISH','BEARISH','NEUTRAL'] },
    entry: { type: ['number','null'] },
    entryZone: { type: 'object', additionalProperties: false, properties: {
      low:{type:['number','null']}, high:{type:['number','null']}
    }, required:['low','high'] },
    stopLoss: { type: ['number','null'] },
    takeProfits: { type:'object', additionalProperties:false, properties:{
      tp1:{type:['number','null']},tp2:{type:['number','null']},tp3:{type:['number','null']}
    }, required:['tp1','tp2','tp3'] },
    riskReward: { type:'object', additionalProperties:false, properties:{
      tp1:{type:['number','null']},tp2:{type:['number','null']},tp3:{type:['number','null']}
    }, required:['tp1','tp2','tp3'] },
    priceAction: { type:'object', additionalProperties:false, properties:{
      trend:{type:'string'},structure:{type:'string'},momentum:{type:'string'},
      liquidity:{type:'string'},keyLevels:{type:'array',items:{type:'string'}}
    }, required:['trend','structure','momentum','liquidity','keyLevels'] },
    technicalEvidence:{type:'array',items:{type:'string'}},
    fundamentalAnalysis:{type:'object',additionalProperties:false,properties:{
      bias:{type:'string',enum:['BULLISH','BEARISH','NEUTRAL']},
      keyFactors:{type:'array',items:{type:'string'}},researchAvailable:{type:'boolean'}
    },required:['bias','keyFactors','researchAvailable']},
    newsAnalysis:{type:'object',additionalProperties:false,properties:{
      bias:{type:'string'},risk:{type:'string',enum:['LOW','MEDIUM','HIGH','UNKNOWN']},
      importantEvents:{type:'array',items:{type:'string'}}
    },required:['bias','risk','importantEvents']},
    setupConditions:{type:'array',items:{type:'string'}},
    invalidationConditions:{type:'array',items:{type:'string'}},
    waitFor:{type:'array',items:{type:'string'}},
    reasoning:{type:'array',items:{type:'string'}},
    warnings:{type:'array',items:{type:'string'}}
  },
  required:['decision','confidence','instrument','timeframe','currentPrice','marketCondition',
    'analysisFramework','higherTimeframeBias','entry','entryZone','stopLoss','takeProfits',
    'riskReward','priceAction','technicalEvidence','fundamentalAnalysis','newsAnalysis',
    'setupConditions','invalidationConditions','waitFor','reasoning','warnings']
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST required' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(200).json({ ok: true, available: false, mode: 'UNAVAILABLE', message: 'AI analysis requires the configured API key. No local signal is generated without the AI engine.' });
  }

  try {
    const body = req.body || {};
    const asset = String(body.asset || '').toUpperCase();
    if (!asset) return res.status(400).json({ error: 'An asset is required.' });

    const prompt = buildPrompt(body);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
        input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
        reasoning: { effort: 'medium' },
        text: {
          format: {
            type: 'json_schema',
            name: 'adaptive_market_analysis',
            strict: true,
            schema
          }
        }
      })
    });

    const raw = await response.json();
    if (!response.ok) {
      return res.status(response.status >= 500 ? 502 : response.status).json({
        error: 'AI request failed.',
        details: raw?.error?.message || 'Unknown API error.'
      });
    }

    const outputText = raw.output_text || raw.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text;
    if (!outputText) return res.status(502).json({ error: 'AI returned no structured analysis.' });

    let analysis;
    try { analysis = JSON.parse(outputText); }
    catch { return res.status(502).json({ error: 'AI returned invalid JSON.' }); }

    return res.status(200).json({
      ok: true,
      available: true,
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
