# AI Market Analyzer PRO

Frontend-first quantitative market research application.

## Current build

The repository contains a Next.js + TypeScript frontend with:

- Responsive FinTech dashboard
- Asset search and switching
- XAUUSD, BTCUSD, EURUSD and US30 local datasets
- Lightweight Charts candlestick visualization
- Predicted trajectory visualization
- EMA, RSI, MACD, Bollinger Bands, ATR and VWAP
- Market structure and candle-reading panels
- Entry, stop-loss and take-profit reference levels
- Multi-timeframe bias interface
- Sentiment/NLP interface ready for future backend integration
- Local backtesting and risk metrics
- Read-only architecture with execution disabled

The current market data is deterministic local demo data. It is not live market data and the forecast display is a UI/testing component, not a claim of predictive accuracy.

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL shown by Next.js.

To verify a production build:

```bash
npm run build
```

Because the frontend is configured for static export, the generated site is written to `apps/web/out`.

## Architecture

```
apps/web/
  src/app/          Next.js App Router
  src/components/   Dashboard and chart UI
  src/lib/          Local data, indicators and backtesting
  src/types/        Shared frontend contracts

services/api/       Reserved for future FastAPI service
packages/shared-types/ Reserved for future API contracts
```

The backend is intentionally not connected yet. FastAPI, PostgreSQL, Redis, live market providers, news sentiment and ML inference can be attached later without rebuilding the dashboard.

Never put private API keys in browser-side code.
