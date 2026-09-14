# AI Market Analyzer

An AI-assisted market-chart research application. Upload a chart screenshot and the app combines visual chart analysis with a live market quote, current market headlines and an economic calendar.

## Current version

- Chart screenshot upload and preview
- Fresh quote required when Analyze is pressed
- **XAUUSD uses a local Exness MT5 read-only quote bridge**
- XAUUSD Bid, Ask, spread and MT5 tick timestamp are passed to the analysis backend
- XAUUSD analysis is blocked if the Exness MT5 quote is missing or stale
- Automatic quote refresh while the page is open
- Asset and timeframe selection
- Price Action, ICT / Liquidity, SMC and Technical Overview modes
- Conservative, Balanced and Aggressive research profiles
- Vision AI endpoint for screenshot analysis
- Market bias, confidence, entry zone, stop loss and three target levels
- Risk/reward display
- Current market-moving news feed
- Live high/medium-impact economic calendar
- Actual / forecast / previous calendar fields when the provider supplies them
- Responsive desktop/mobile layout

## Important: GitHub Pages vs live backend

GitHub Pages can host the frontend, but it cannot safely run the server-side API endpoints in `/api` or protect an AI API key. The live backend should therefore be deployed on a serverless host that supports the repository's `/api` functions.

The frontend calls:

```text
GET  /api/market?asset=BTCUSD
GET  /api/news?asset=XAUUSD
GET  /api/calendar
POST /api/analyze
```

For XAUUSD, the browser also calls the local read-only MT5 bridge:

```text
GET http://127.0.0.1:8765/health
GET http://127.0.0.1:8765/quote?symbol=XAUUSDm
```

If the local Exness MT5 bridge is unavailable, XAUUSD analysis is blocked. The app does not substitute Yahoo, gold futures or a stale demo price for XAUUSD.

## Exness MT5 bridge

The `mt5-bridge/` folder contains a small Python service that reads the current quote from the locally connected MetaTrader 5 terminal.

Exness' own documentation demonstrates Python integration with MetaTrader 5 and uses `XAUUSDm` as an example symbol. Symbol suffixes can vary by account/terminal, so the bridge allows `MT5_SYMBOL` to be changed to the exact symbol shown in MT5 Market Watch. citeturn0search0

The bridge is **read-only**. It contains no trade execution, order placement or account-management functions.

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

Keep MetaTrader 5 running and connected to Exness while using XAUUSD in the analyzer. Exness confirms XAUUSD is available on its MT5 platform and that MT5 provides real-time instrument prices. citeturn0search1turn0search5

## Backend environment variables

Set these as server-side environment variables on the deployment platform:

```text
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.6-luna
```

Never put `OPENAI_API_KEY`, broker passwords, account numbers or other secrets in `script.js`, `index.html`, GitHub Pages files, or the repository.

## Architecture

```text
                    +----------------------+
                    | Exness MT5 terminal  |
                    +----------+-----------+
                               |
                         local read-only
                               |
                    +----------v-----------+
                    | Python MT5 bridge    |
                    | Bid / Ask / spread   |
                    +----------+-----------+
                               |
                     browser sends quote
                               |
User uploads chart              |
        |                       |
        v                       v
Web application ---------> /api/analyze
        |                       |
        +------ News + calendar+
                                |
                                v
                           Vision AI
                                |
                                v
                    Structured research output
```

## Disclaimer

This project is for educational and research purposes. Automated market analysis is probabilistic and can be wrong. The displayed levels are analytical estimates, not guarantees or financial advice. Always verify the chart, broker quote and economic-event information independently.
