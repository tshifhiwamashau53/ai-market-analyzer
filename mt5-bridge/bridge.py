import os
from datetime import datetime, time, timezone

from flask import Flask, jsonify, request
from flask_cors import CORS
import MetaTrader5 as mt5

app = Flask(__name__)
HOST = "127.0.0.1"
PORT = int(os.getenv("MT5_BRIDGE_PORT", "8765"))
BRIDGE_TOKEN = os.getenv("MT5_BRIDGE_TOKEN", "")
LIVE_ENABLED = os.getenv("MT5_ENABLE_LIVE_TRADING", "NO").strip().upper() == "YES"
MAX_ORDER_VOLUME = float(os.getenv("MT5_MAX_ORDER_VOLUME", "0.10"))
MAX_OPEN_POSITIONS = int(os.getenv("MT5_MAX_OPEN_POSITIONS", "3"))
MAX_DAILY_LOSS = float(os.getenv("MT5_MAX_DAILY_LOSS", "50"))
ALLOWED_ORIGINS = [x.strip() for x in os.getenv("MT5_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if x.strip()]
CORS(app, resources={r"/*": {"origins": ALLOWED_ORIGINS}}, allow_headers=["Content-Type", "Authorization"], methods=["GET", "POST", "OPTIONS"])

TIMEFRAMES = {
    "1m": mt5.TIMEFRAME_M1, "5m": mt5.TIMEFRAME_M5, "15m": mt5.TIMEFRAME_M15,
    "30m": mt5.TIMEFRAME_M30, "1h": mt5.TIMEFRAME_H1, "4h": mt5.TIMEFRAME_H4,
    "1d": mt5.TIMEFRAME_D1,
}
LIVE_CONFIRMATION = "I UNDERSTAND THIS PLACES A REAL EXNESS ORDER"


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
    bid, ask = float(tick.bid), float(tick.ask)
    last = float(tick.last or 0)
    price = last if last > 0 else (bid + ask) / 2
    if price <= 0 or bid <= 0 or ask <= 0 or ask < bid:
        raise RuntimeError("MT5 returned an invalid live quote")
    timestamp = datetime.fromtimestamp(int(tick.time), tz=timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "ok": True, "asset": symbol, "providerSymbol": symbol,
        "displayName": getattr(info, "description", "") or symbol, "price": price,
        "bid": bid, "ask": ask, "spread": ask - bid, "timestamp": timestamp,
        "provider": "Exness MT5", "source": "Local MetaTrader 5 terminal", "marketState": "LIVE",
        "broker": "Exness", "digits": int(getattr(info, "digits", 0)),
        "point": float(getattr(info, "point", 0) or 0),
        "currencyBase": getattr(info, "currency_base", "") or "",
        "currencyProfit": getattr(info, "currency_profit", "") or "",
        "path": getattr(info, "path", "") or "",
        "note": "Broker quote from the locally connected Exness MT5 terminal."
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
        tick = mt5.symbol_info_tick(name)
        bid, ask = (float(tick.bid), float(tick.ask)) if tick else (0, 0)
        if bid <= 0 or ask <= 0 or ask < bid:
            continue
        result.append({"symbol": name, "displayName": getattr(info, "description", "") or name,
                       "path": getattr(info, "path", "") or "", "currencyBase": getattr(info, "currency_base", "") or "",
                       "currencyProfit": getattr(info, "currency_profit", "") or "", "digits": int(getattr(info, "digits", 0)),
                       "bid": bid, "ask": ask, "spread": ask - bid, "visible": bool(getattr(info, "visible", False)),
                       "tradeMode": int(getattr(info, "trade_mode", 0))})
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
    candidates = [s for s in symbols if s["symbol"].upper().startswith(target)
                  and s["symbol"].upper().replace(target, "", 1) in {"M", "C", "S", "Z", "PRO", "RAW", "ZERO"}]
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
    return [{"time": datetime.fromtimestamp(int(row["time"]), tz=timezone.utc).isoformat().replace("+00:00", "Z"),
             "open": float(row["open"]), "high": float(row["high"]), "low": float(row["low"]),
             "close": float(row["close"]), "volume": float(row["tick_volume"])} for row in rates]


def require_trading_auth():
    if not BRIDGE_TOKEN:
        return jsonify({"ok": False, "error": "TRADING_AUTH_NOT_CONFIGURED", "details": "Set MT5_BRIDGE_TOKEN before using trading endpoints."}), 503
    supplied = request.headers.get("Authorization", "")
    if supplied != f"Bearer {BRIDGE_TOKEN}":
        return jsonify({"ok": False, "error": "UNAUTHORIZED"}), 401
    return None


def account_snapshot():
    account = mt5.account_info()
    if account is None:
        raise RuntimeError("MT5 account information is unavailable")
    positions = mt5.positions_get() or ()
    start = datetime.combine(datetime.now().date(), time.min).astimezone()
    deals = mt5.history_deals_get(start, datetime.now().astimezone()) or ()
    realized = sum(float(getattr(d, "profit", 0)) + float(getattr(d, "commission", 0)) + float(getattr(d, "swap", 0)) for d in deals)
    floating = sum(float(getattr(p, "profit", 0)) + float(getattr(p, "swap", 0)) for p in positions)
    return account, positions, realized, floating


def position_json(p):
    return {"ticket": int(p.ticket), "symbol": p.symbol, "type": "BUY" if p.type == mt5.POSITION_TYPE_BUY else "SELL",
            "volume": float(p.volume), "priceOpen": float(p.price_open), "priceCurrent": float(p.price_current),
            "stopLoss": float(p.sl), "takeProfit": float(p.tp), "profit": float(p.profit),
            "swap": float(p.swap), "time": datetime.fromtimestamp(int(p.time), tz=timezone.utc).isoformat().replace("+00:00", "Z")}


def trading_ready():
    if not connect_mt5():
        return None, (jsonify({"ok": False, "error": "MT5_NOT_CONNECTED"}), 503)
    if not LIVE_ENABLED:
        return None, (jsonify({"ok": False, "error": "LIVE_TRADING_DISABLED", "details": "Set MT5_ENABLE_LIVE_TRADING=YES locally to enable order requests."}), 403)
    if not mt5.terminal_info() or not mt5.terminal_info().trade_allowed:
        return None, (jsonify({"ok": False, "error": "MT5_AUTOTRADING_DISABLED", "details": "Enable algorithmic trading in the local MT5 terminal."}), 403)
    return account_snapshot(), None


@app.get("/health")
def health():
    connected = connect_mt5()
    terminal = mt5.terminal_info() if connected else None
    return jsonify({"ok": connected, "provider": "Exness MT5", "terminalConnected": bool(terminal),
                    "readOnly": True, "liveTradingConfigured": LIVE_ENABLED, "instrumentDiscovery": "enabled", "historicalCandles": "enabled"}), (200 if connected else 503)


@app.get("/symbols")
def symbols():
    try:
        items = discover_symbols()
        return jsonify({"ok": True, "provider": "Exness MT5", "broker": "Exness", "readOnly": True,
                        "count": len(items), "symbols": items, "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")})
    except Exception as exc:
        return jsonify({"ok": False, "error": "EXNESS_MT5_SYMBOL_DISCOVERY_FAILED", "details": str(exc)}), 503


@app.get("/resolve")
def resolve():
    asset = request.args.get("asset", "").strip()
    try:
        return jsonify({"ok": True, "asset": asset.upper(), "providerSymbol": resolve_symbol(asset), "provider": "Exness MT5", "broker": "Exness"})
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
        symbol = request.args.get("symbol", "").strip() or resolve_symbol(asset)
        items = historical_rates(symbol, interval, min(max(int(request.args.get("limit", "200")), 50), 500))
        latest = items[-1]
        return jsonify({"ok": True, "asset": asset, "providerSymbol": symbol, "provider": "Exness MT5", "broker": "Exness",
                        "source": "Local MetaTrader 5 terminal", "timeframe": interval, "timestamp": latest["time"],
                        "price": latest["close"], "bid": None, "ask": None, "candles": items,
                        "note": "Historical OHLC data from the locally connected MT5 terminal."})
    except Exception as exc:
        return jsonify({"ok": False, "error": "EXNESS_MT5_CANDLES_UNAVAILABLE", "details": str(exc)}), 503


@app.get("/trading/status")
def trading_status():
    auth_error = require_trading_auth()
    if auth_error:
        return auth_error
    try:
        snapshot, error = trading_ready()
        if error:
            # Status remains useful when live execution is disabled; it never places an order.
            if not connect_mt5():
                return error
        account, positions, realized, floating = account_snapshot()
        terminal = mt5.terminal_info()
        return jsonify({"ok": True, "provider": "Exness MT5", "connected": True,
                        "liveTradingConfigured": LIVE_ENABLED, "terminalTradingAllowed": bool(terminal and terminal.trade_allowed),
                        "account": {"login": int(account.login), "server": str(account.server), "currency": str(account.currency),
                                    "balance": float(account.balance), "equity": float(account.equity), "margin": float(account.margin),
                                    "freeMargin": float(account.margin_free), "leverage": int(account.leverage),
                                    "tradeMode": int(account.trade_mode)},
                        "risk": {"maxOrderVolume": MAX_ORDER_VOLUME, "maxOpenPositions": MAX_OPEN_POSITIONS,
                                 "maxDailyLoss": MAX_DAILY_LOSS, "realizedToday": realized, "floatingPnl": floating,
                                 "dailyLossLimitReached": realized + floating <= -MAX_DAILY_LOSS},
                        "positions": [position_json(p) for p in positions]})
    except Exception as exc:
        return jsonify({"ok": False, "error": "TRADING_STATUS_UNAVAILABLE", "details": str(exc)}), 503


@app.post("/trading/order")
def place_order():
    auth_error = require_trading_auth()
    if auth_error:
        return auth_error
    data = request.get_json(silent=True) or {}
    if data.get("confirmation") != LIVE_CONFIRMATION:
        return jsonify({"ok": False, "error": "LIVE_CONFIRMATION_REQUIRED", "details": "Explicit real-order confirmation is required."}), 400
    try:
        snapshot, error = trading_ready()
        if error:
            return error
        account, positions, realized, floating = snapshot
        if realized + floating <= -MAX_DAILY_LOSS:
            return jsonify({"ok": False, "error": "DAILY_LOSS_LIMIT_REACHED"}), 403
        if len(positions) >= MAX_OPEN_POSITIONS:
            return jsonify({"ok": False, "error": "MAX_OPEN_POSITIONS_REACHED"}), 403
        symbol = str(data.get("symbol", "")).strip()
        side = str(data.get("side", "")).upper()
        volume = float(data.get("volume", 0))
        sl, tp = float(data.get("stopLoss", 0)), float(data.get("takeProfit", 0))
        if side not in {"BUY", "SELL"} or not symbol:
            return jsonify({"ok": False, "error": "INVALID_ORDER", "details": "Provide symbol and BUY or SELL side."}), 400
        info = ensure_symbol(symbol)
        if not (info.volume_min <= volume <= min(info.volume_max, MAX_ORDER_VOLUME)):
            return jsonify({"ok": False, "error": "VOLUME_OUT_OF_BOUNDS", "details": f"Volume must be between {info.volume_min} and {min(info.volume_max, MAX_ORDER_VOLUME)}."}), 400
        step = float(info.volume_step or 0.01)
        if abs(round(volume / step) * step - volume) > 1e-8:
            return jsonify({"ok": False, "error": "INVALID_VOLUME_STEP", "details": f"Volume must use step {step}."}), 400
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            raise RuntimeError("No live quote for requested symbol")
        price = float(tick.ask if side == "BUY" else tick.bid)
        digits = int(info.digits)
        sl, tp = round(sl, digits), round(tp, digits)
        if side == "BUY" and not (0 < sl < price < tp):
            return jsonify({"ok": False, "error": "INVALID_PROTECTIVE_LEVELS", "details": "For BUY, require stop loss < live ask < take profit."}), 400
        if side == "SELL" and not (0 < tp < price < sl):
            return jsonify({"ok": False, "error": "INVALID_PROTECTIVE_LEVELS", "details": "For SELL, require take profit < live bid < stop loss."}), 400
        filling = info.filling_mode
        fill_mode = mt5.ORDER_FILLING_IOC if filling & 2 else (mt5.ORDER_FILLING_FOK if filling & 1 else mt5.ORDER_FILLING_RETURN)
        payload = {"action": mt5.TRADE_ACTION_DEAL, "symbol": symbol,
                   "type": mt5.ORDER_TYPE_BUY if side == "BUY" else mt5.ORDER_TYPE_SELL,
                   "volume": volume, "price": price, "sl": sl, "tp": tp,
                   "deviation": int(data.get("deviation", 20)), "magic": 20261118,
                   "comment": "AI Market Analyzer live order", "type_time": mt5.ORDER_TIME_GTC, "type_filling": fill_mode}
        check = mt5.order_check(payload)
        if check is None or check.retcode not in (0, mt5.TRADE_RETCODE_DONE):
            return jsonify({"ok": False, "error": "BROKER_ORDER_CHECK_FAILED", "details": str(check or mt5.last_error())}), 400
        result = mt5.order_send(payload)
        if result is None or result.retcode not in (mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_DONE_PARTIAL):
            return jsonify({"ok": False, "error": "BROKER_REJECTED_ORDER", "details": str(result or mt5.last_error())}), 502
        return jsonify({"ok": True, "message": "Order accepted by MT5", "order": int(result.order),
                        "deal": int(result.deal), "symbol": symbol, "side": side, "volume": float(result.volume),
                        "price": float(result.price), "stopLoss": sl, "takeProfit": tp, "retcode": int(result.retcode)})
    except (TypeError, ValueError) as exc:
        return jsonify({"ok": False, "error": "INVALID_ORDER_FIELDS", "details": str(exc)}), 400
    except Exception as exc:
        return jsonify({"ok": False, "error": "ORDER_SUBMISSION_FAILED", "details": str(exc)}), 503


@app.post("/trading/close")
def close_position():
    auth_error = require_trading_auth()
    if auth_error:
        return auth_error
    data = request.get_json(silent=True) or {}
    if data.get("confirmation") != LIVE_CONFIRMATION:
        return jsonify({"ok": False, "error": "LIVE_CONFIRMATION_REQUIRED"}), 400
    try:
        _, error = trading_ready()
        if error:
            return error
        ticket = int(data.get("ticket", 0))
        matches = mt5.positions_get(ticket=ticket) or ()
        if not matches:
            return jsonify({"ok": False, "error": "POSITION_NOT_FOUND"}), 404
        position = matches[0]
        tick = mt5.symbol_info_tick(position.symbol)
        if tick is None:
            raise RuntimeError("No live quote available to close position")
        is_buy = position.type == mt5.POSITION_TYPE_BUY
        payload = {"action": mt5.TRADE_ACTION_DEAL, "symbol": position.symbol, "position": int(position.ticket),
                   "volume": float(position.volume), "type": mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY,
                   "price": float(tick.bid if is_buy else tick.ask), "deviation": 20, "magic": 20261118,
                   "comment": "AI Market Analyzer close", "type_time": mt5.ORDER_TIME_GTC,
                   "type_filling": mt5.ORDER_FILLING_IOC}
        check = mt5.order_check(payload)
        if check is None or check.retcode not in (0, mt5.TRADE_RETCODE_DONE):
            return jsonify({"ok": False, "error": "BROKER_ORDER_CHECK_FAILED", "details": str(check or mt5.last_error())}), 400
        result = mt5.order_send(payload)
        if result is None or result.retcode not in (mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_DONE_PARTIAL):
            return jsonify({"ok": False, "error": "BROKER_REJECTED_CLOSE", "details": str(result or mt5.last_error())}), 502
        return jsonify({"ok": True, "message": "Close order accepted by MT5", "ticket": ticket, "deal": int(result.deal), "retcode": int(result.retcode)})
    except (TypeError, ValueError) as exc:
        return jsonify({"ok": False, "error": "INVALID_POSITION_TICKET", "details": str(exc)}), 400
    except Exception as exc:
        return jsonify({"ok": False, "error": "POSITION_CLOSE_FAILED", "details": str(exc)}), 503


if __name__ == "__main__":
    print(f"Exness MT5 local bridge listening on http://{HOST}:{PORT}")
    print("Market data: /symbols, /resolve, /quote, /candles")
    print("Authenticated trading status: /trading/status")
    print(f"Live order routing configured: {LIVE_ENABLED}; do not expose this service to the internet")
    app.run(host=HOST, port=PORT, debug=False)
