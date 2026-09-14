import os
from datetime import datetime, timezone

from flask import Flask, jsonify, request
from flask_cors import CORS
import MetaTrader5 as mt5

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

HOST = "127.0.0.1"
PORT = int(os.getenv("MT5_BRIDGE_PORT", "8765"))

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
    if mt5.terminal_info() is not None:
        return True
    return bool(mt5.initialize())


def ensure_symbol(symbol: str):
    symbol = symbol.strip()
    if not symbol:
        raise RuntimeError("A symbol is required")
    if not mt5.symbol_select(symbol, True):
        raise RuntimeError(f"MT5 symbol is not available: {symbol}")
    info = mt5.symbol_info(symbol)
    if info is None:
        raise RuntimeError(f"MT5 symbol information unavailable: {symbol}")
    return info


def quote_from_symbol(symbol: str):
    if not connect_mt5():
        code, message = mt5.last_error()
        raise RuntimeError(f"MT5 connection failed: {code} {message}")

    info = ensure_symbol(symbol)
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise RuntimeError(f"No live tick returned for {symbol}")

    bid = float(tick.bid)
    ask = float(tick.ask)
    last = float(tick.last or 0)
    price = last if last > 0 else (bid + ask) / 2

    if price <= 0 or bid <= 0 or ask <= 0 or ask < bid:
        raise RuntimeError("MT5 returned an invalid live quote")

    timestamp = datetime.fromtimestamp(int(tick.time), tz=timezone.utc).isoformat().replace("+00:00", "Z")

    return {
        "ok": True,
        "asset": symbol,
        "providerSymbol": symbol,
        "displayName": getattr(info, "description", "") or symbol,
        "price": price,
        "bid": bid,
        "ask": ask,
        "spread": ask - bid,
        "timestamp": timestamp,
        "provider": "Exness MT5",
        "source": "Local MetaTrader 5 terminal",
        "marketState": "LIVE",
        "broker": "Exness",
        "digits": int(getattr(info, "digits", 0)),
        "point": float(getattr(info, "point", 0) or 0),
        "currencyBase": getattr(info, "currency_base", "") or "",
        "currencyProfit": getattr(info, "currency_profit", "") or "",
        "path": getattr(info, "path", "") or "",
        "note": "Read-only broker quote from the locally connected Exness MT5 terminal."
    }


def discover_symbols():
    if not connect_mt5():
        code, message = mt5.last_error()
        raise RuntimeError(f"MT5 connection failed: {code} {message}")

    symbols = mt5.symbols_get()
    if symbols is None:
        code, message = mt5.last_error()
        raise RuntimeError(f"Could not discover MT5 symbols: {code} {message}")

    result = []
    for info in symbols:
        name = str(info.name)
        try:
            tick = mt5.symbol_info_tick(name)
            bid = float(tick.bid) if tick else 0
            ask = float(tick.ask) if tick else 0
        except Exception:
            bid = ask = 0

        if bid <= 0 or ask <= 0 or ask < bid:
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
            "spread": ask - bid,
            "visible": bool(getattr(info, "visible", False)),
            "tradeMode": int(getattr(info, "trade_mode", 0)),
        })

    result.sort(key=lambda item: item["symbol"].lower())
    return result


def resolve_symbol(asset: str):
    target = asset.strip().upper()
    if not target:
        raise RuntimeError("An asset is required")

    symbols = discover_symbols()
    exact = [s for s in symbols if s["symbol"].upper() == target]
    if exact:
        return exact[0]["symbol"]

    candidates = [
        s for s in symbols
        if s["symbol"].upper().startswith(target)
        and s["symbol"].upper().replace(target, "", 1) in {"M", "C", "S", "Z", "PRO", "RAW", "ZERO"}
    ]
    if candidates:
        return candidates[0]["symbol"]

    prefix = [s for s in symbols if s["symbol"].upper().startswith(target)]
    if prefix:
        return prefix[0]["symbol"]

    raise RuntimeError(f"No available MT5 instrument matches {target}")


def historical_rates(symbol: str, interval: str, limit: int):
    if not connect_mt5():
        code, message = mt5.last_error()
        raise RuntimeError(f"MT5 connection failed: {code} {message}")
    ensure_symbol(symbol)
    timeframe = TIMEFRAMES.get(interval.lower())
    if timeframe is None:
        raise RuntimeError(f"Unsupported interval: {interval}")
    rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, limit)
    if rates is None or len(rates) < 50:
        code, message = mt5.last_error()
        raise RuntimeError(f"Not enough historical candles for {symbol}: {code} {message}")

    candles = []
    for row in rates:
        candles.append({
            "time": datetime.fromtimestamp(int(row["time"]), tz=timezone.utc).isoformat().replace("+00:00", "Z"),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row["tick_volume"]),
        })
    return candles


@app.get("/health")
def health():
    connected = connect_mt5()
    terminal = mt5.terminal_info() if connected else None
    return jsonify({
        "ok": connected,
        "provider": "Exness MT5",
        "terminalConnected": bool(terminal),
        "readOnly": True,
        "instrumentDiscovery": "enabled",
        "historicalCandles": "enabled"
    }), (200 if connected else 503)


@app.get("/symbols")
def symbols():
    try:
        items = discover_symbols()
        return jsonify({
            "ok": True,
            "provider": "Exness MT5",
            "broker": "Exness",
            "readOnly": True,
            "count": len(items),
            "symbols": items,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        })
    except Exception as exc:
        return jsonify({"ok": False, "error": "EXNESS_MT5_SYMBOL_DISCOVERY_FAILED", "details": str(exc)}), 503


@app.get("/resolve")
def resolve():
    asset = request.args.get("asset", "").strip()
    try:
        symbol = resolve_symbol(asset)
        return jsonify({"ok": True, "asset": asset.upper(), "providerSymbol": symbol, "provider": "Exness MT5", "broker": "Exness"})
    except Exception as exc:
        return jsonify({"ok": False, "error": "EXNESS_MT5_SYMBOL_NOT_FOUND", "details": str(exc)}), 404


@app.get("/quote")
def quote():
    symbol = request.args.get("symbol", "").strip()
    try:
        if not symbol:
            return jsonify({"ok": False, "error": "SYMBOL_REQUIRED", "details": "Use /resolve?asset=XAUUSD or /symbols first."}), 400
        return jsonify(quote_from_symbol(symbol))
    except Exception as exc:
        return jsonify({"ok": False, "error": "EXNESS_MT5_QUOTE_UNAVAILABLE", "details": str(exc)}), 503


@app.get("/candles")
def candles():
    asset = request.args.get("asset", "XAUUSD").strip().upper()
    interval = request.args.get("interval", "5m").strip().lower()
    try:
        requested_symbol = request.args.get("symbol", "").strip()
        symbol = requested_symbol or resolve_symbol(asset)
        limit = min(max(int(request.args.get("limit", "200")), 50), 500)
        items = historical_rates(symbol, interval, limit)
        latest = items[-1]
        return jsonify({
            "ok": True,
            "asset": asset,
            "providerSymbol": symbol,
            "provider": "Exness MT5",
            "broker": "Exness",
            "source": "Local MetaTrader 5 terminal",
            "timeframe": interval,
            "timestamp": latest["time"],
            "price": latest["close"],
            "bid": None,
            "ask": None,
            "candles": items,
            "note": "Read-only historical OHLC data from the locally connected MT5 terminal."
        })
    except Exception as exc:
        return jsonify({"ok": False, "error": "EXNESS_MT5_CANDLES_UNAVAILABLE", "details": str(exc)}), 503


if __name__ == "__main__":
    print(f"Exness MT5 read-only bridge listening on http://{HOST}:{PORT}")
    print("Instrument discovery: /symbols")
    print("Symbol resolver: /resolve?asset=XAUUSD")
    print("Live quote: /quote?symbol=XAUUSDm")
    print("Historical OHLC: /candles?asset=XAUUSD&interval=5m&limit=200")
    app.run(host=HOST, port=PORT, debug=False)
