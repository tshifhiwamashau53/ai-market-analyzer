# AI Market Analyzer

An API-free market research application for chart context, technical analysis, market news and economic events.

## Current version

- Chart screenshot upload and local preview
- No OpenAI API key required
- Local rule-based market analysis
- EMA 20 / EMA 50 trend structure
- RSI 14 momentum
- ATR 14 volatility estimate
- Recent support and resistance estimates
- BUY-side / SELL-side directional bias as **BULLISH / BEARISH / NEUTRAL** research output
- Confidence score
- Mathematical entry reference, stop-loss estimate and three target estimates when verified OHLC data is available
- Current market-moving news feed
- Economic calendar
- TradingView live chart
- Responsive desktop/mobile layout

## Important: no paid AI API

The application no longer calls OpenAI or any paid AI/vision service. The `/api/analyze` endpoint is now a local rule engine. It receives the available market data and calculates the research output using deterministic JavaScript rules.

A screenshot can still be uploaded for reference. It remains in the browser and is **not** sent to an AI provider. The local engine does not pretend to understand pixels that it cannot reliably measure.

## Backend

The repository uses serverless `/api` functions for data retrieval and local calculations:

```text
GET  /api/market?asset=BTCUSD
GET  /api/news?asset=XAUUSD
GET  /api/calendar
GET  /api/market-data?asset=BTCUSD&interval=5m
POST /api/analyze
```

These are application endpoints, not paid AI APIs. The local analyzer itself does not require an AI API key.

## Market data

Machine-readable OHLC analysis is currently enabled for BTCUSD, ETHUSD and SOLUSD through public Binance market data. Other instruments continue to use the TradingView chart unless another verified OHLC provider is configured.

For XAUUSD, the repository also contains an optional local MT5 read-only bridge under `mt5-bridge/`. This can provide broker-specific XAUUSD quotes from a connected MetaTrader 5 terminal, but the current local rule engine does not invent OHLC history from a single quote.

## MT5 bridge

The `mt5-bridge/` folder contains a small Python service that reads a current quote from a locally connected MetaTrader 5 terminal. It is read-only and contains no order placement or account-management functions.

Start it from the `mt5-bridge` directory:

```powershell
py -m pip install -r requirements.txt
py bridge.py
```

Then verify:

```text
http://127.0.0.1:8765/health
http://127.0.0.1:8765/quote?symbol=XAUUSDm
```

## Architecture

```text
User
  |
  +--> TradingView chart
  |
  +--> Optional screenshot (browser only)
  |
  +--> Public/read-only market data
            |
            v
     Local rule engine
       |   |   |   |
      EMA RSI ATR S/R
            |
            v
   Bias + confidence + levels
            |
            +--> News + calendar context
```

## Disclaimer

This project is for educational and research purposes. Automated market analysis is probabilistic and can be wrong. Entry, stop-loss and target values are mathematical estimates, not guarantees or financial advice. Always verify the chart, broker quote and economic-event information independently.
