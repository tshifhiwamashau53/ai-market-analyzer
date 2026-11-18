# AI Market Analyzer

A market-data viewer that reads prices and historical candles from a locally running MetaTrader 5 desktop terminal.

## Run the web app

```bash
npm install
npm run dev
```

## Start the MT5 data bridge

The broker-neutral, read-only bridge is in [mt5-bridge/](mt5-bridge/README.md). It uses whichever broker account is already logged into the local MT5 terminal.

```powershell
cd mt5-bridge
py -m pip install -r requirements.txt
py bridge.py
```

Then open the web app at `http://localhost:3000`. The bridge listens on `127.0.0.1:8765` and exposes market-data endpoints only.

## Build

```bash
npm run build
```

The frontend is configured for static export into `apps/web/out`.

## Safety

This project provides read-only market data. It does not place, modify, or close orders, and it does not store broker login credentials. Do not expose the local bridge to the public internet.
