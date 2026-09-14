# AI Market Analyzer

An AI-assisted market chart research application. Upload a chart screenshot and the app combines visual chart analysis with a live reference quote, current market headlines and an economic calendar.

## Current version

- Chart screenshot upload and preview
- Live reference market quote fetched when a chart is loaded/analyzed
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

GitHub Pages can host the frontend, but it cannot safely run the server-side API endpoints in `/api` or protect an AI API key. The live version should therefore be deployed on a serverless host that supports the repository's `/api` functions.

The frontend now calls:

```text
GET  /api/market?asset=XAUUSD
GET  /api/news?asset=XAUUSD
GET  /api/calendar
POST /api/analyze
```

If the site is opened only as a GitHub Pages static site, the live backend calls will fail and the app will clearly show that the backend is unavailable. It no longer invents a fake live price or fake chart analysis.

## Backend environment variables

Set these as server-side environment variables on the deployment platform:

```text
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.6-luna
```

Never put `OPENAI_API_KEY` in `script.js`, `index.html`, GitHub Pages files, or any browser-visible code.

## Architecture

```text
User uploads chart
        |
        v
Web application
        |
        +--------------------+
        |                    |
        v                    v
Live market quote      News + calendar
        |                    |
        +---------+----------+
                  v
             Vision AI
                  |
                  v
        Structured research output
                  |
       +----------+----------+
       |          |          |
      Bias       SL/TP     News risk
```

## Live price note

The backend uses reference market quotes. For XAUUSD and US30, the reference feed may use an underlying futures/index quote, so a broker CFD price can differ slightly. The app passes the live reference quote to the vision model and explicitly tells it not to invent a price.

## GitHub

Repository: `tshifhiwamashau53/ai-market-analyzer`

## Disclaimer

This project is for educational and research purposes. Automated market analysis is probabilistic and can be wrong. The displayed levels are analytical estimates, not guarantees or financial advice. Always verify the chart, price feed and economic-event information independently.
