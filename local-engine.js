/* Fully client-side chart analysis. No AI provider, paid AI API, or OpenAI key. */
(function () {
  const originalFetch = window.fetch.bind(window);

  function roundPrice(value) {
    if (!Number.isFinite(value)) return null;
    if (Math.abs(value) >= 1) return Number(value.toFixed(4));
    return Number(value.toFixed(6));
  }

  function analyzeMarket(market, risk, visual) {
    const i = market && market.indicators ? market.indicators : {};
    const price = Number(market && market.price);
    const ema20 = Number(i.ema20), ema50 = Number(i.ema50), rsi = Number(i.rsi14), atr = Number(i.atr14);
    const visualBias = visual && visual.visualBias ? visual.visualBias : 'NEUTRAL';
    const visualSignals = Array.isArray(visual && visual.signals) ? visual.signals : [];

    if (![price, ema20, ema50, atr].every(Number.isFinite) || atr <= 0) {
      const bias = visualBias === 'BULLISH' ? 'BUY' : visualBias === 'BEARISH' ? 'SELL' : 'WAIT';
      return {
        bias,
        confidence: visual && visual.available ? Math.min(72, 45 + Math.round((visual.chartDensity || 0) / 3)) : 0,
        reason: visual && visual.available
          ? `The uploaded screenshot was scanned locally. ${visualSignals.join(' ')}`
          : 'Verified OHLC indicators are not available yet.',
        entry: null, stopLoss: null, takeProfit1: null, takeProfit2: null, takeProfit3: null,
        riskDistance: null,
        reasoning: [
          ...visualSignals,
          'Numeric entry, SL and TP levels require verified market prices.',
          'No price levels were invented.'
        ],
        summary: 'The uploaded chart was analyzed locally with browser pixel detection. Numeric trade levels are withheld until verified OHLC data is available.',
        warning: 'Screenshot analysis is a visual heuristic, not computer vision with guaranteed candle/price recognition. Educational research only.',
        machineDataUsed: false,
        screenshotUsed: Boolean(visual && visual.available)
      };
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

    // The screenshot is an additional local signal. It never overrides strong market data by itself.
    if (visualBias === 'BULLISH') { score += 1; signals.push('Uploaded screenshot shows a bullish candle-color bias.'); }
    else if (visualBias === 'BEARISH') { score -= 1; signals.push('Uploaded screenshot shows a bearish candle-color bias.'); }
    signals.push(...visualSignals.slice(0, 3));

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

    const confidence = bias === 'WAIT'
      ? Math.min(65, 50 + (Number.isFinite(rsi) ? 4 : 0))
      : Math.min(94, 52 + Math.abs(score) * 9 + (Number.isFinite(rsi) ? 5 : 0));

    return {
      bias,
      confidence,
      reason: bias === 'WAIT'
        ? `Signals are mixed. ${signals.join(' ')}`
        : `The local technical model is ${bias === 'BUY' ? 'bullish' : 'bearish'}. ${signals.join(' ')}`,
      reasoning: [
        ...signals,
        `ATR 14: ${roundPrice(atr)}.`,
        Number.isFinite(support) ? `Recent support: ${roundPrice(support)}.` : 'Recent support: unavailable.',
        Number.isFinite(resistance) ? `Recent resistance: ${roundPrice(resistance)}.` : 'Recent resistance: unavailable.',
        `Market structure: ${i.structure || 'NEUTRAL'}.`,
        visual && visual.available ? 'The uploaded screenshot was also scanned locally and used as a secondary visual signal.' : 'No screenshot was supplied.',
        'All calculations were performed locally in this browser from available OHLC data.'
      ],
      summary: `Local API-free analysis for ${market.asset || 'the selected market'} on ${market.timeframe || 'the selected timeframe'}. The uploaded screenshot, when supplied, is combined with EMA 20/50, RSI 14, ATR 14 and recent support/resistance.`,
      entry: roundPrice(price),
      stopLoss: roundPrice(stopLoss),
      takeProfit1: roundPrice(targets[0]),
      takeProfit2: roundPrice(targets[1]),
      takeProfit3: roundPrice(targets[2]),
      riskDistance: roundPrice(riskDistance),
      priceContext: `Current verified price: ${roundPrice(price)}.`,
      newsRisk: Array.isArray(market.news) && market.news.length ? 'MEDIUM' : 'UNKNOWN',
      warning: 'Educational research only. BUY/SELL/WAIT and price levels are estimates, not guarantees or trade execution instructions.',
      machineDataUsed: true,
      screenshotUsed: Boolean(visual && visual.available)
    };
  }

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url;
    try {
      const parsed = new URL(url, window.location.href);
      if (parsed.pathname === '/api/analyze' && init && String(init.method || 'GET').toUpperCase() === 'POST') {
        const body = JSON.parse(init.body || '{}');
        const result = analyzeMarket(body.market, body.risk, body.visualAnalysis);
        result.chartUsed = typeof body.image === 'string' && body.image.startsWith('data:image/');
        result.model = 'LOCAL-BROWSER-CHART-ENGINE';
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