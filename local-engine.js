/* Fully client-side analysis engine. No AI provider or paid API is used. */
(function () {
  const originalFetch = window.fetch.bind(window);

  function roundPrice(value) {
    if (!Number.isFinite(value)) return null;
    if (Math.abs(value) >= 1) return Number(value.toFixed(4));
    return Number(value.toFixed(6));
  }

  function analyzeMarket(market, risk) {
    const i = market && market.indicators ? market.indicators : {};
    const price = Number(market && market.price);
    const ema20 = Number(i.ema20), ema50 = Number(i.ema50), rsi = Number(i.rsi14), atr = Number(i.atr14);
    if (![price, ema20, ema50, atr].every(Number.isFinite) || atr <= 0) {
      return { bias: 'WAIT', confidence: 0, reason: 'Verified OHLC indicators are not available yet.', entry: null, stopLoss: null, takeProfit1: null, takeProfit2: null, takeProfit3: null, riskDistance: null, reasoning: ['Waiting for at least 50 verified candles.', 'No price levels were invented.'], machineDataUsed: false };
    }

    let score = 0;
    const signals = [];
    if (price > ema20) { score += 1; signals.push('Price is above EMA 20.'); }
    else { score -= 1; signals.push('Price is below EMA 20.'); }
    if (ema20 > ema50) { score += 2; signals.push('EMA 20 is above EMA 50, supporting bullish structure.'); }
    else if (ema20 < ema50) { score -= 2; signals.push('EMA 20 is below EMA 50, supporting bearish structure.'); }
    if (Number.isFinite(rsi)) {
      if (rsi >= 55 && rsi < 70) { score += 1; signals.push(`RSI ${rsi.toFixed(1)} supports bullish momentum.`); }
      else if (rsi <= 45 && rsi > 30) { score -= 1; signals.push(`RSI ${rsi.toFixed(1)} supports bearish momentum.`); }
      else if (rsi >= 70) signals.push(`RSI ${rsi.toFixed(1)} is overbought; pullback risk is elevated.`);
      else if (rsi <= 30) signals.push(`RSI ${rsi.toFixed(1)} is oversold; rebound risk is elevated.`);
    }

    const bias = score >= 2 ? 'BUY' : score <= -2 ? 'SELL' : 'WAIT';
    const support = Number(i.support), resistance = Number(i.resistance);
    const multiplier = risk === 'Conservative' ? 1.25 : risk === 'Aggressive' ? 0.85 : 1;
    const distance = atr * multiplier;
    let stopLoss = null, targets = [null, null, null], riskDistance = null;
    if (bias === 'BUY') {
      stopLoss = Number.isFinite(support) && support < price ? Math.min(support, price - distance) : price - distance;
      riskDistance = Math.max(price - stopLoss, distance * 0.75);
      targets = [price + riskDistance, price + riskDistance * 2, price + riskDistance * 3];
    } else if (bias === 'SELL') {
      stopLoss = Number.isFinite(resistance) && resistance > price ? Math.max(resistance, price + distance) : price + distance;
      riskDistance = Math.max(stopLoss - price, distance * 0.75);
      targets = [price - riskDistance, price - riskDistance * 2, price - riskDistance * 3];
    }

    const confidence = bias === 'WAIT' ? Math.min(58, 50 + (Number.isFinite(rsi) ? 4 : 0)) : Math.min(92, 52 + Math.abs(score) * 10 + (Number.isFinite(rsi) ? 5 : 0));
    return {
      bias, confidence,
      reason: bias === 'WAIT' ? `Signals are mixed. ${signals.join(' ')}` : `The local technical model is ${bias === 'BUY' ? 'bullish' : 'bearish'}. ${signals.join(' ')}`,
      reasoning: [
        ...signals,
        `ATR 14: ${roundPrice(atr)}.`,
        Number.isFinite(support) ? `Recent support: ${roundPrice(support)}.` : 'Recent support: unavailable.',
        Number.isFinite(resistance) ? `Recent resistance: ${roundPrice(resistance)}.` : 'Recent resistance: unavailable.',
        `Market structure: ${i.structure || 'NEUTRAL'}.`,
        'Analysis was calculated locally in this browser from verified OHLC data.'
      ],
      summary: `Local API-free analysis for ${market.asset || 'the selected market'} on ${market.timeframe || 'the selected timeframe'}. EMA 20/50, RSI 14, ATR 14 and recent support/resistance were calculated locally.`,
      entry: roundPrice(price), stopLoss: roundPrice(stopLoss), takeProfit1: roundPrice(targets[0]), takeProfit2: roundPrice(targets[1]), takeProfit3: roundPrice(targets[2]), riskDistance: roundPrice(riskDistance),
      priceContext: `Current verified price: ${roundPrice(price)}.`,
      newsRisk: Array.isArray(market.news) && market.news.length ? 'MEDIUM' : 'UNKNOWN',
      warning: 'Educational research only. BUY/SELL/WAIT and price levels are estimates, not guarantees or trade execution instructions.',
      machineDataUsed: true
    };
  }

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url;
    try {
      const parsed = new URL(url, window.location.href);
      if (parsed.pathname === '/api/analyze' && init && String(init.method || 'GET').toUpperCase() === 'POST') {
        const body = JSON.parse(init.body || '{}');
        const result = analyzeMarket(body.market, body.risk);
        result.chartUsed = typeof body.image === 'string' && body.image.startsWith('data:image/');
        result.model = 'LOCAL-BROWSER-RULE-ENGINE';
        result.analyzedAt = new Date().toISOString();
        result.livePriceUsed = Number.isFinite(Number(body.market && body.market.price)) ? Number(body.market.price) : null;
        result.livePriceTimestamp = body.market && body.market.timestamp || null;
        result.liveProvider = body.market && body.market.provider || 'Local market data';
        result.indicators = body.market && body.market.indicators || {};
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    } catch (error) {
      console.warn('Local engine:', error.message);
    }
    return originalFetch(input, init);
  };
})();
