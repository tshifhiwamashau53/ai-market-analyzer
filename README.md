# AI Market Analyzer

A no-paid-AI market research application that can load a chart screenshot, detect basic chart visuals locally in the browser, calculate technical indicators, evaluate market structure, and produce a BUY / SELL / WAIT research result.

## Target version

1. Upload a chart screenshot.
2. Detect basic chart information locally in the browser.
3. Calculate technical indicators from verified OHLC data when available.
4. Determine **BUY / SELL / WAIT**.
5. Identify support, resistance and market structure.
6. Generate suggested entry, stop-loss and take-profit levels when verified price/ATR data exists.
7. Show a confidence score.
8. Explain the reasons behind the result.
9. No `OPENAI_API_KEY`.
10. No paid AI API.
11. No credit/billing failure screen.

## Local screenshot detection

Uploaded screenshots stay in the browser. The app uses a small canvas-based pixel detector to identify basic visual signals such as red/green candle-color balance, chart color density and the approximate vertical range containing detected colored chart marks.

This is deliberately a **local heuristic**, not a claim that the browser can perfectly understand every chart screenshot. The screenshot detector is used as an additional signal and does not invent exact prices from pixels.

## Technical engine

The deterministic local engine calculates:

- EMA 20
- EMA 50
- RSI 14
- ATR 14
- Recent support
- Recent resistance
- Basic bullish/bearish/neutral market structure
- BUY / SELL / WAIT decision
- Confidence score
- Entry reference
- Stop-loss estimate
- TP1 / TP2 / TP3 estimates

When evidence is mixed, the engine returns **WAIT** instead of forcing a trade direction.

## No paid AI API

The application does not call OpenAI or another paid AI/vision service. `/api/analyze` is a deterministic rule engine.

There is no `OPENAI_API_KEY` requirement and no dependency on AI credits. If the serverless analyzer cannot be reached, the browser continues with a local fallback instead of showing an AI-credit failure screen.

## Market data

BTCUSD, ETHUSD and SOLUSD can use public read-only Binance OHLC data through `/api/market-data`.

XAUUSD can use the optional local MT5 bridge. This is important for the intended XAUUSD 5M workflow because the bridge can provide broker-specific historical candles instead of inventing gold prices from a screenshot.

## MT5 bridge

The `mt5-bridge/` folder contains a read-only Python service connected to the locally installed MetaTrader 5 terminal. It does not place trades or manage an account.

Install and start it:

```powershell
py -m pip install -r requirements.txt
py bridge.py
```

Verify the connection:

```text
http://127.0.0.1:8765/health
```

Resolve the broker's XAUUSD symbol:

```text
http://127.0.0.1:8765/resolve?asset=XAUUSD
```

Read a quote:

```text
http://127.0.0.1:8765/quote?symbol=XAUUSDm
```

Read historical candles:

```text
http://127.0.0.1:8765/candles?asset=XAUUSD&interval=5m&limit=200
```

The web app automatically tries the local MT5 candle feed for XAUUSD before falling back to the normal serverless market-data route.

## App endpoints

```text
GET  /api/market?asset=BTCUSD
GET  /api/news?asset=XAUUSD
GET  /api/calendar
GET  /api/market-data?asset=BTCUSD&interval=5m
POST /api/analyze
```

These are application/data endpoints, not paid AI APIs.

## Architecture

```text
Chart screenshot
      |
      v
Browser canvas pixel detector
      |
      +-------------------+
      |                   |
Verified OHLC data     Visual signals
      |                   |
      +---------+---------+
                v
        Local rule engine
       EMA / RSI / ATR / S-R
                |
                v
          BUY / SELL / WAIT
                |
       +--------+--------+
       |        |        |
    Entry      SL       TP1/2/3
       |
       +--> Confidence + explanation
       |
       +--> News / economic-event context
```

## Disclaimer

This project is for educational and research purposes. Automated market analysis is probabilistic and can be wrong. Entry, stop-loss and target values are mathematical estimates, not guarantees or financial advice. Always verify the chart, broker quote and economic-event information independently.
