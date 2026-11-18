# AI Market Analyzer PRO

Quantitative market-research workspace with local Exness MT5 market data and an optional, explicitly enabled live-trading console.

## Run locally

```bash
npm install
npm run dev
```

Open the local Next.js URL (normally `http://localhost:3000`). The app uses locally generated/demo data where a provider is not configured; do not treat demo values as live quotes.

## Exness MT5 live console

The optional bridge at `mt5-bridge/` connects to a MetaTrader 5 terminal on the user's Windows machine. Read its setup and safety notes in [mt5-bridge/README.md](mt5-bridge/README.md). Live order routing is off by default and requires local environment flags, a private bearer token, MT5 Algo Trading, protective stop/target levels, and confirmation for each real order. The console is at `/trading/`.

Start with an MT5 demo account and conservative server-side limits. Never expose the local bridge to the public internet or commit credentials. Live trading risks loss; safeguards cannot guarantee an execution price or maximum loss.

## Build

```bash
npm run build
```

The frontend is configured for static export into `apps/web/out`. Local bridge trading requires the browser UI and MT5 bridge to run on the same machine; browsers may block local HTTP requests from an HTTPS-hosted site.
