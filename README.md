# AI Market Analyzer

A GitHub Pages-compatible frontend for an AI-assisted trading chart analysis application.

## Current version

- Chart screenshot upload and preview
- Asset and timeframe selection
- Analysis-style and risk-profile controls
- Market-bias dashboard
- Entry zone, stop loss and three target levels
- Risk/reward display
- Confidence indicator
- AI reasoning area
- News and macro-context area
- Responsive desktop/mobile layout

The current Analyze button uses demo data so the interface can be tested without exposing API keys.

## Architecture

```text
GitHub Pages
    |
    v
Static frontend (HTML/CSS/JavaScript)
    |
    v
Secure backend API
    |
    +--> Vision AI
    +--> Market data provider
    +--> News/economic calendar provider
    |
    v
Structured analysis
    |
    v
Bias / Entry / SL / TP / News impact
```

## Security

Do not put an AI provider API key, broker secret, or private data-provider key in `script.js` or any GitHub Pages file. The production frontend should send the chart and settings to a secure backend, where secrets remain server-side.

## Planned backend

The next phase will add a secure API endpoint such as `POST /api/analyze`. The request will contain the uploaded chart plus asset, timeframe, analysis style and news preference. The backend will combine chart vision, market data and current news, then return validated structured fields for the dashboard.

## GitHub Pages

Deploy from **Settings → Pages → Deploy from a branch → main → /(root)**.

## Disclaimer

This project is for educational and research purposes. Automated market analysis is probabilistic and can be wrong. It is not financial advice.
