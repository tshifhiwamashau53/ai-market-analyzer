import os
from datetime import datetime, timezone

from flask import Flask, jsonify, request
from flask_cors import CORS
import MetaTrader5 as mt5

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

DEFAULT_SYMBOL = os.getenv("MT5_SYMBOL", "XAUUSDm")
HOST = "127.0.0.1"
PORT = int(os.getenv("MT5_BRIDGE_PORT", "8765"))


def connect_mt5():
    if mt5.terminal_info() is not None:
        return True
    return bool(mt5.initialize())


def get_quote(symbol: str):
    if not connect_mt5():
        code, message = mt5.last_error()
        raise RuntimeError(f"MT5 connection failed: {code} {message}")

    if not mt5.symbol_select(symbol, True):
        raise RuntimeError(f"MT5 symbol is not available: {symbol}")

    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise RuntimeError(f"No live tick returned for {symbol}")

    bid = float(tick.bid)
    ask = float(tick.ask)
    last = float(tick.last or 0)
    price = last if last > 0 else (bid + ask) / 2
    timestamp = datetime.fromtimestamp(int(tick.time), tz=timezone.utc).isoformat().replace("+00:00", "Z")

    if price <= 0 or bid <= 0 or ask <= 0:
        raise RuntimeError("MT5 returned an invalid live quote")

    return {
        "ok": True,
        "asset": "XAUUSD",
        "providerSymbol": symbol,
        "price": price,
        "bid": bid,
        "ask": ask,
        "spread": ask - bid,
        "timestamp": timestamp,
        "provider": "Exness MT5",
        "source": "Local MetaTrader 5 terminal",
        "marketState": "LIVE",
        "broker": "Exness",
        "note": "Read-only broker quote from the locally connected Exness MT5 terminal."
    }


@app.get("/health")
def health():
    connected = connect_mt5()
    terminal = mt5.terminal_info() if connected else None
    return jsonify({
        "ok": connected,
        "provider": "Exness MT5",
        "terminalConnected": bool(terminal),
        "symbol": DEFAULT_SYMBOL,
        "readOnly": True
    }), (200 if connected else 503)


@app.get("/quote")
def quote():
    symbol = request.args.get("symbol", DEFAULT_SYMBOL).strip() or DEFAULT_SYMBOL
    try:
        return jsonify(get_quote(symbol))
    except Exception as exc:
        return jsonify({
            "ok": False,
            "error": "EXNESS_MT5_QUOTE_UNAVAILABLE",
            "details": str(exc)
        }), 503


if __name__ == "__main__":
    print(f"Exness MT5 read-only bridge listening on http://{HOST}:{PORT}")
    print(f"Configured XAUUSD symbol: {DEFAULT_SYMBOL}")
    app.run(host=HOST, port=PORT, debug=False)
