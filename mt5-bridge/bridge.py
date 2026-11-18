import os
from datetime import datetime, timezone

from flask import Flask, jsonify, request
from flask_cors import CORS
import MetaTrader5 as mt5

app = Flask(__name__)
HOST = "127.0.0.1"
PORT = int(os.getenv("MT5_BRIDGE_PORT", "8765"))
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "MT5_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
CORS(
    app,
    resources={r"/*": {"origins": ALLOWED_ORIGINS}},
    allow_headers=["Content-Type"],
    methods=["GET", "OPTIONS"],
)

TIMEFRAMES = {
    "1m": mt5.TIMEFRAME_M1,
    "5m": mt5.TIMEFRAME_M5,
    "15m": mt5.TIMEFRAME_M15,
    "30m": mt5.TIMEFRAME_M30,
    "1h": mt5.TIMEFRAME_H1,
    "4h": mt5.TIMEFRAME_H4,
    "1d": mt5.TIMEFRAME_D1,
}


def connect_mt5():
    """Use the terminal currently open and logged in on this computer."""
    if mt5.terminal_info() is not None:
        return True
    return bool(mt5.initialize())


def terminal_metadata():
    if not connect_mt5():
        code, message = mt5.last_error()
        raise RuntimeError(f"MetaTrader 5 connection failed: {code} {message}")

    terminal = mt5.terminal_info()
    account = mt5.account_info()
    if terminal is None:
        raise RuntimeError("MetaTrader 5 terminal information is unavailable")

    return {
        "connected": True,
        "terminalConnected": True,
        "broker": getattr(account, "company", "") if account else "",
        "company": getattr(account, "company", "") if account else "",
        "server": getattr(account, "server", "") if account else "",
        "terminal": getattr(terminal, "name", "") or "MetaTrader 5",
    }


def ensure_symbol(symbol: str):
    symbol = symbol.strip()
    if not symbol:
        raise RuntimeError("A symbol is required")
    if not mt5.symbol_select(symbol, True):
        raise RuntimeError(f"MT5 symbol is not available: {symbol}")
    info = mt5.symbol_info(symbol)
    if info is None:
        raise RuntimeError(f"MT5 symbol information is unavailable: {symbol}")
    return info


def quote_from_symbol(symbol: str):
    if not connect_mt5():
        code, message = mt5.last_error()
        raise RuntimeError(f"MetaTrader 5 connection failed: {code} {message}")

    info = ensure_symbol(symbol)
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise RuntimeError(f"No quote is available for {symbol}")

    bid, ask = float(tick.bid), float(tick.ask)
    last = float(tick.last or 0)
    price = last if last > 0 else (bid + ask) / 2
    if price <= 0 or bid <= 0 or ask <= 0 or ask < bid:
        raise RuntimeError("MetaTrader 5 returned an invalid quote")

    timestamp = datetime.fromtimestamp(
        int(tick.time), tz=timezone.utc
    ).isoformat().replace("+00:00", "Z")

    metadata = terminal_metadata()
    return {
        "ok": True,
        "symbol": symbol,
        "providerSymbol": symbol,
        "displayName": getattr(info, "description", "") or symbol,
        "price": price,
        "bid": bid,
        "ask": ask,
        "spread": ask - bid,
        "timestamp": timestamp,
        "provider": "MetaTrader 5",
        "source": metadata["server"] or "Local MetaTrader 5 terminal",
        "marketState": "LIVE",
        "digits": int(getattr(info, "digits", 0)),
        "point": float(getattr(info, "point", 0) or 0),
        "currencyBase": getattr(info, "currency_base", "") or "",
        "currencyProfit": getattr(info, "currency_profit", "") or "",
        "path": getattr(info, "path", "") or "",
    }


def discover_symbols():
    if not connect_mt5():
        code, message = mt5.last_error()
        raise RuntimeError(f"MetaTrader 5 connection failed: {code} {message}")

    items = mt5.symbols_get()
    if items is None:
        code, message = mt5.last_error()
        raise RuntimeError(f"Could not discover MT5 symbols: {code} {message}")

    result = []
    for info in items:
        name = str(info.name)
        tick = mt5.symbol_info_tick(name)
        bid, ask = (float(tick.bid), float(tick.ask)) if tick else (0.0, 0.0)
        if bid < 0 or ask < 0 or (bid and ask and ask < bid):
            continue
        result.append({
            "symbol": name,
            "displayName": getattr(info, "description", "") or name,
            "path": getattr(info, "path", "") or "",
            "currencyBase": getattr(info, "currency_base", "") or "",
            "currencyProfit": getattr(info, "currency_profit", "") or "",
            "digits": int(getattr(info, "digits", 0)),
            "bid": bid,
            "ask": ask,
            "spread": ask - bid if bid and ask else 0.0,
            "visible": bool(getattr(info, "visible", False)),
        })

    result.sort(key=lambda item: (not item["visible"], item["symbol"].lower()))
    return result


def resolve_symbol(asset: str):
    target = asset.strip().upper()
    if not target:
        raise RuntimeError("An asset is required")

    symbols = discover_symbols()
    exact = [item for item in symbols if item["symbol"].upper() == target]
    if exact:
        return exact[0]["symbol"]

    # Broker suffixes/prefixes vary. Return an exact match first, then a
    # visible prefix match; the caller can always pass the full MT5 symbol.
    prefix = [
        item for item in symbols
        if item["symbol"].upper().startswith(target)
    ]
    if prefix:
        return prefix[0]["symbol"]

    contains = [
        item for item in symbols
        if target in item["symbol"].upper()
    ]
    if contains:
        return contains[0]["symbol"]

    raise RuntimeError(f"No available MT5 instrument matches {target}")


def historical_rates(symbol: str, interval: str, limit: int):
    if not connect_mt5():
        code, message = mt5.last_error()
        raise RuntimeError(f"MetaTrader 5 connection failed: {code} {message}")

    ensure_symbol(symbol)
    timeframe = TIMEFRAMES.get(interval.lower())
    if timeframe is None:
        raise RuntimeError(f"Unsupported interval: {interval}")

    rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, limit)
    if rates is None or len(rates) == 0:
        code, message = mt5.last_error()
        raise RuntimeError(f"No historical candles for {symbol}: {code} {message}")

    return [
        {
            "time": datetime.fromtimestamp(
                int(row["time"]), tz=timezone.utc
            ).isoformat().replace("+00:00", "Z"),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row["tick_volume"]),
        }
        for row in rates
    ]


@app.get("/health")
def health():
    try:
        metadata = terminal_metadata()
        return jsonify({"ok": True, **metadata, "readOnly": True})
    except Exception as exc:
        return jsonify({
            "ok": False,
            "connected": False,
            "terminalConnected": False,
            "provider": "MetaTrader 5",
            "error": "MT5_NOT_CONNECTED",
            "details": str(exc),
            "readOnly": True,
        }), 503


@app.get("/symbols")
def symbols():
    try:
        items = discover_symbols()
        return jsonify({
            "ok": True,
            "provider": "MetaTrader 5",
            "readOnly": True,
            "count": len(items),
            "symbols": items,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        })
    except Exception as exc:
        return jsonify({
            "ok": False,
            "error": "MT5_SYMBOL_DISCOVERY_FAILED",
            "details": str(exc),
        }), 503


@app.get("/resolve")
def resolve():
    asset = request.args.get("asset", "").strip()
    try:
        return jsonify({
            "ok": True,
            "asset": asset.upper(),
            "providerSymbol": resolve_symbol(asset),
            "provider": "MetaTrader 5",
        })
    except Exception as exc:
        return jsonify({
            "ok": False,
            "error": "MT5_SYMBOL_NOT_FOUND",
            "details": str(exc),
        }), 404


@app.get("/quote")
def quote():
    symbol = request.args.get("symbol", "").strip()
    if not symbol:
        return jsonify({
            "ok": False,
            "error": "SYMBOL_REQUIRED",
            "details": "Use /resolve?asset=EURUSD or /symbols first.",
        }), 400

    try:
        return jsonify(quote_from_symbol(symbol))
    except Exception as exc:
        return jsonify({
            "ok": False,
            "error": "MT5_QUOTE_UNAVAILABLE",
            "details": str(exc),
        }), 503


@app.get("/candles")
def candles():
    asset = request.args.get("asset", "").strip().upper()
    interval = request.args.get("interval", "5m").strip().lower()
    requested_symbol = request.args.get("symbol", "").strip()

    try:
        symbol = requested_symbol or resolve_symbol(asset)
        limit = min(max(int(request.args.get("limit", "200")), 1), 500)
        items = historical_rates(symbol, interval, limit)
        latest = items[-1]
        return jsonify({
            "ok": True,
            "asset": asset,
            "providerSymbol": symbol,
            "provider": "MetaTrader 5",
            "source": "Local MetaTrader 5 terminal",
            "timeframe": interval,
            "timestamp": latest["time"],
            "price": latest["close"],
            "candles": items,
            "readOnly": True,
        })
    except ValueError:
        return jsonify({
            "ok": False,
            "error": "INVALID_CANDLE_LIMIT",
            "details": "The candle limit must be a whole number.",
        }), 400
    except Exception as exc:
        return jsonify({
            "ok": False,
            "error": "MT5_CANDLES_UNAVAILABLE",
            "details": str(exc),
        }), 503


if __name__ == "__main__":
    print(f"MetaTrader 5 read-only bridge listening on http://{HOST}:{PORT}")
    print("Available endpoints: /health, /symbols, /resolve, /quote, /candles")
    print("Order placement and account modification are not implemented.")
    app.run(host=HOST, port=PORT, debug=False)
