function roundPrice(value) {
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) >= 100) return Number(value.toFixed(2));
  if (Math.abs(value) >= 1) return Number(value.toFixed(4));
  return Number(value.toFixed(6));
}

function directionFromIndicators(market, visual) {
  const i = market?.indicators || {};
  const price = Number(market?.price);
  const ema20 = Number(i.ema20);
  const ema50 = Number(i.ema50);
  const rsi = Number(i.rsi14);
  if (![price, ema20, ema50].every(Number.isFinite)) return { action: 'WAIT', score: 0, signals: [] };

  let score = 0;
  const signals = [];
  if (price > ema20) { score += 1; signals.push('Price is above EMA 20.'); }
  else { score -= 1; signals.push('Price is below EMA 20.'); }
  if (ema20 > ema50) { score += 2; signals.push('EMA 20 is above EMA 50, supporting bullish market structure.'); }
  else { score -= 2; signals.push('EMA 20 is below EMA 50, supporting bearish market structure.'); }
  if (Number.isFinite(rsi)) {
    if (rsi >= 55 && rsi < 70) { score += 1; signals.push(`RSI ${rsi.toFixed(1)} shows positive momentum without being deeply overbought.`); }
    else if (rsi <= 45 && rsi > 30) { score -= 1; signals.push(`RSI ${rsi.toFixed(1)} shows negative momentum without being deeply oversold.`); }
    else if (rsi >= 70) signals.push(`RSI ${rsi.toFixed(1)} is overbought, so a bullish entry has higher pullback risk.`);
    else if (rsi <= 30) signals.push(`RSI ${rsi.toFixed(1)} is oversold, so a bearish entry has higher rebound risk.`);
  }
  if (visual?.available && (visual.visualBias === 'BULLISH' || visual.visualBias === 'BEARISH')) {
    const visualScore = visual.visualBias === 'BULLISH' ? 1 : -1;
    score += visualScore;
    signals.push(`Local screenshot pixel analysis detected ${visual.visualBias.toLowerCase()} candle-color bias.`);
  }
  const action = score >= 2 ? 'BUY' : score <= -2 ? 'SELL' : 'WAIT';
  return { action, score, signals };
}

function buildLevels(market, action, risk) {
  const price = Number(market?.price);
  const i = market?.indicators || {};
  const atr = Number(i.atr14);
  const support = Number(i.support);
  const resistance = Number(i.resistance);
  if (!Number.isFinite(price) || !Number.isFinite(atr) || atr <= 0 || !['BUY', 'SELL'].includes(action)) return { entry: Number.isFinite(price) ? roundPrice(price) : null, stopLoss: null, takeProfit1: null, takeProfit2: null, takeProfit3: null, riskDistance: null };

  const multiplier = risk === 'Conservative' ? 1.25 : risk === 'Aggressive' ? 0.85 : 1;
  const distance = atr * multiplier;
  let stopLoss;
  let targets;
  if (action === 'BUY') {
    stopLoss = Number.isFinite(support) && support < price ? Math.min(support, price - distance) : price - distance;
    const riskDistance = Math.max(price - stopLoss, distance * 0.75);
    targets = [price + riskDistance, price + riskDistance * 2, price + riskDistance * 3];
  } else {
    stopLoss = Number.isFinite(resistance) && resistance > price ? Math.max(resistance, price + distance) : price + distance;
    const riskDistance = Math.max(stopLoss - price, distance * 0.75);
    targets = [price - riskDistance, price - riskDistance * 2, price - riskDistance * 3];
  }
  return {
    entry: roundPrice(price),
    stopLoss: roundPrice(stopLoss),
    takeProfit1: roundPrice(targets[0]),
    takeProfit2: roundPrice(targets[1]),
    takeProfit3: roundPrice(targets[2]),
    riskDistance: roundPrice(Math.abs(price - stopLoss))
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  try {
    const body = req.body || {};
    const { image, visualAnalysis, asset, timeframe, style, risk, market, news, calendar } = body;
    const selectedAsset = String(asset || '').toUpperCase();
    if (!selectedAsset) return res.status(400).json({ error: 'An asset is required.' });
    if (!market || String(market.asset || '').toUpperCase() !== selectedAsset) return res.status(400).json({ error: 'Market context for the selected asset is required.' });

    const price = Number(market.price);
    const machineData = Boolean(market.dataAvailable && Array.isArray(market.candles) && market.candles.length >= 50 && market.indicators);
    const local = machineData ? directionFromIndicators(market, visualAnalysis) : { action: 'WAIT', score: 0, signals: [] };
    const levels = machineData ? buildLevels(market, local.action, risk) : { entry: null, stopLoss: null, takeProfit1: null, takeProfit2: null, takeProfit3: null, riskDistance: null };
    const newsCount = Array.isArray(news) ? news.length : 0;
    const calendarCount = Array.isArray(calendar) ? calendar.length : 0;
    const confidence = machineData ? Math.min(92, 50 + Math.abs(local.score) * 9 + (Number.isFinite(Number(market.indicators.rsi14)) ? 5 : 0) + (visualAnalysis?.available ? 4 : 0)) : visualAnalysis?.available ? Math.min(65, 40 + Math.round((visualAnalysis.chartDensity || 0) / 4)) : 0;
    const macroRisk = calendarCount >= 3 ? 'HIGH' : newsCount >= 3 || calendarCount > 0 ? 'MEDIUM' : 'LOW';
    const screenshotNote = typeof image === 'string' && image.startsWith('data:image/')
      ? 'The screenshot stayed in the browser. A local pixel detector extracted visual candle-color signals; no AI image service was used.'
      : 'No screenshot was supplied.';

    const indicators = market.indicators || {};
    const reason = machineData
      ? `${local.action === 'WAIT' ? 'The technical signals are mixed, so the local engine chooses WAIT.' : `The local technical model produces a ${local.action} bias.`} ${local.signals.join(' ')}`
      : 'Verified numeric OHLC data is not available, so the local engine will not invent entry, stop-loss or take-profit prices.';
    const summary = machineData
      ? `Local, API-free analysis for ${selectedAsset} on ${timeframe}. EMA 20/50, RSI 14, ATR 14, recent support/resistance and optional screenshot pixels were evaluated. Macro context: ${macroRisk.toLowerCase()} risk.`
      : `Local screenshot detection completed where possible, but verified OHLC data is unavailable for ${selectedAsset}. The result remains WAIT rather than inventing trade levels.`;

    return res.status(200).json({
      bias: local.action,
      confidence,
      reason,
      reasoning: [
        ...local.signals,
        Number.isFinite(Number(indicators.atr14)) ? `ATR 14: ${roundPrice(Number(indicators.atr14))}.` : 'ATR 14: unavailable.',
        Number.isFinite(Number(indicators.support)) ? `Recent support estimate: ${roundPrice(Number(indicators.support))}.` : 'Recent support: unavailable.',
        Number.isFinite(Number(indicators.resistance)) ? `Recent resistance estimate: ${roundPrice(Number(indicators.resistance))}.` : 'Recent resistance: unavailable.',
        indicators.structure ? `Market structure: ${indicators.structure}.` : 'Market structure: unavailable.',
        visualAnalysis?.available ? `Local screenshot detection: ${visualAnalysis.visualBias} visual bias with ${visualAnalysis.chartDensity}% color density.` : 'Local screenshot detection: unavailable.',
        screenshotNote
      ],
      summary,
      priceContext: Number.isFinite(price) ? `Current machine-readable price: ${roundPrice(price)}.` : 'No verified numeric price available.',
      newsRisk: macroRisk,
      warning: machineData
        ? 'Educational research only. Entry, stop-loss and target levels are mathematical estimates based on current market data and can be wrong, especially around major news.'
        : `WAIT mode: no trade levels were generated because verified OHLC data is unavailable for ${selectedAsset}. ${screenshotNote}`,
      chartUsed: typeof image === 'string' && image.startsWith('data:image/'),
      machineDataUsed: machineData,
      model: 'LOCAL-RULE-ENGINE',
      analyzedAt: new Date().toISOString(),
      livePriceUsed: Number.isFinite(price) ? price : null,
      livePriceTimestamp: market.timestamp || null,
      liveProvider: market.provider || 'Public market data',
      liveBid: Number.isFinite(Number(market.bid)) ? Number(market.bid) : null,
      liveAsk: Number.isFinite(Number(market.ask)) ? Number(market.ask) : null,
      entry: levels.entry,
      stopLoss: levels.stopLoss,
      takeProfit1: levels.takeProfit1,
      takeProfit2: levels.takeProfit2,
      takeProfit3: levels.takeProfit3,
      riskDistance: levels.riskDistance,
      indicators: {
        ema20: Number.isFinite(Number(indicators.ema20)) ? roundPrice(Number(indicators.ema20)) : null,
        ema50: Number.isFinite(Number(indicators.ema50)) ? roundPrice(Number(indicators.ema50)) : null,
        rsi14: Number.isFinite(Number(indicators.rsi14)) ? Number(Number(indicators.rsi14).toFixed(2)) : null,
        atr14: Number.isFinite(Number(indicators.atr14)) ? roundPrice(Number(indicators.atr14)) : null,
        support: Number.isFinite(Number(indicators.support)) ? roundPrice(Number(indicators.support)) : null,
        resistance: Number.isFinite(Number(indicators.resistance)) ? roundPrice(Number(indicators.resistance)) : null,
        structure: indicators.structure || 'NEUTRAL'
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Local market analysis failed', details: error.message });
  }
}
