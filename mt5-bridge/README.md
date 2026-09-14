# Exness MT5 Read-Only Quote Bridge

This folder provides a small local Python service that reads the current XAUUSD quote from a MetaTrader 5 terminal connected to Exness.

The bridge is intentionally **read-only**. It exposes market data only and contains no order-placement or account-management code.

## What it returns

- XAUUSD symbol used by the terminal (default: `XAUUSDm`)
- Bid
- Ask
- Spread
- Last/mid price
- MT5 tick timestamp
- Broker/source metadata

Exness' own Python + MT5 example uses the `MetaTrader5` Python package and shows `XAUUSDm` as an example symbol. Symbol suffixes can vary, so set `MT5_SYMBOL` to the exact XAUUSD symbol shown in your MT5 Market Watch.

## Requirements

- Windows computer
- MetaTrader 5 installed and connected to the Exness account you intend to use
- Python 3.10+

## Install

From this directory:

```powershell
py -m pip install -r requirements.txt
```

## Start

```powershell
py bridge.py
```

The service listens only on:

```text
http://127.0.0.1:8765
```

Test:

```text
http://127.0.0.1:8765/health
http://127.0.0.1:8765/quote?symbol=XAUUSDm
```

If your Exness MT5 Market Watch uses another XAUUSD symbol, set it before starting the bridge:

```powershell
$env:MT5_SYMBOL="XAUUSD"
py bridge.py
```

Do not put passwords, account numbers, API keys or other secrets in this repository.
