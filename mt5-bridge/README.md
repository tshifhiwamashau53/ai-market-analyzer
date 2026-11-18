# Exness MT5 Local Trading Bridge

This bridge connects to the MetaTrader 5 terminal running on your own Windows computer. Market data endpoints are read-only; separate authenticated routes provide account status, protected market orders, and closing an open position. Trading is **disabled by default**.

## Requirements and setup

- Windows, Python 3.10+, installed and logged into the intended Exness MT5 account.
- Keep this bridge local. It binds only to `127.0.0.1`; do not port-forward it, put it on a public server, or commit secrets.

```powershell
py -m pip install -r requirements.txt
$env:MT5_BRIDGE_TOKEN = "$(py -c \"import secrets; print(secrets.token_urlsafe(32))\")"
py bridge.py
```

Open `http://localhost:3000/trading/` in the same computer's web browser. Paste the token into the console. It is held for the current browser session only. HTTPS-hosted websites generally cannot call a local HTTP bridge because of browser mixed-content restrictions; use the local development UI or a properly secured local HTTPS setup.

## Enablement and safety caps

First use the MT5 demo account. To enable the bridge's live-order endpoints, configure these process environment variables and restart it:

```powershell
$env:MT5_ENABLE_LIVE_TRADING = "YES"
$env:MT5_MAX_ORDER_VOLUME = "0.01"
$env:MT5_MAX_OPEN_POSITIONS = "1"
$env:MT5_MAX_DAILY_LOSS = "10"
$env:MT5_ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
py bridge.py
```

Set limits appropriate to your account and currency. `MT5_MAX_DAILY_LOSS` uses the account's deposit currency and blocks new entries once today's realized plus open floating P/L reaches the configured loss. The bridge also enforces MT5 symbol lot minimum/maximum/step, requires a stop-loss and take-profit on entry, checks orders with the broker before submission, and limits concurrent open positions. This is a best-effort local guard, not a guarantee against gaps, slippage, terminal/network failure, or losses; it cannot guarantee a daily loss ceiling.

Live orders require all of: a local bearer token, explicit server enablement, MT5 terminal Algo Trading enabled, a fresh per-order confirmation in the UI and matching confirmation on the request. Each order is sent directly to the connected account. Closing a position submits a real opposite market order. There is no unattended signal execution or auto-trading loop.

## Endpoints

Read-only: `/health`, `/symbols`, `/resolve?asset=XAUUSD`, `/quote?symbol=XAUUSDm`, `/candles?asset=XAUUSD&interval=5m&limit=200`.

Bearer-token protected: `GET /trading/status`, `POST /trading/order`, `POST /trading/close`. The web UI provides the required confirmation, protective levels and position controls. Never paste the token into a public/shared browser, expose the bridge beyond localhost, or store broker passwords/API keys in the repository.

Use your broker's supported account and review local/regulatory requirements before trading. This software is provided as-is, not financial advice or a guarantee of correct execution.
