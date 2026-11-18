# MetaTrader 5 Read-Only Bridge

This bridge reads market data from the MetaTrader 5 desktop terminal running on your Windows computer. It is broker-neutral: it uses the account and trade server already connected in MT5, whether that account is with Exness or another MT5-supported broker.

The bridge is deliberately **read-only**. It has no order-placement, order-modification, position-closing, or account-management endpoints.

## Requirements

- Windows computer
- MetaTrader 5 desktop terminal installed and logged in to your broker
- Python 3.10 or newer

## Install and start

Open PowerShell in the `mt5-bridge` folder:

```powershell
py -m pip install -r requirements.txt
py bridge.py
```

The bridge listens only on `http://127.0.0.1:8765`. Keep it on your own computer. Do not port-forward the port or expose it to the public internet.

Open the app at `http://localhost:3000`. The app reads the active terminal's broker/server details and available symbols. The terminal must already be logged in.

## Supported read-only endpoints

- `GET /health` — terminal connection and broker/server metadata
- `GET /symbols` — symbols available from the connected terminal
- `GET /resolve?asset=XAUUSD` — find a matching broker symbol
- `GET /quote?symbol=XAUUSD.a` — current bid/ask quote
- `GET /candles?symbol=XAUUSD.a&interval=5m&limit=200` — historical candles

Supported intervals: `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, and `1d`.

## Broker symbol names

Brokers may use different suffixes or prefixes, for example `XAUUSD`, `XAUUSD.a`, or `XAUUSDm`. Use the exact symbol shown in the MT5 Market Watch list for the most reliable result. The resolver tries an exact match first and then a prefix/partial match.

## Security and limitations

- The bridge binds to localhost only.
- CORS is limited to the local development app origins by default.
- No broker password or account credentials are stored by this project.
- Market data availability depends on the connected broker, terminal permissions, symbol visibility, and downloaded history.
- This bridge does not place or modify trades.
