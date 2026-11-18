"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, Search } from "lucide-react";
import MarketChart from "@/components/MarketChart";
import { marketHistory, type MarketHistory } from "@/lib/api";

const formatPrice = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 6 });

export default function Home() {
  const [symbol, setSymbol] = useState("XAUUSD");
  const [search, setSearch] = useState("");
  const [timeframe, setTimeframe] = useState("1h");
  const [history, setHistory] = useState<MarketHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await marketHistory(symbol, "6mo", timeframe);
      setHistory(result);
    } catch (err) {
      setHistory(null);
      setError(err instanceof Error ? err.message : "Unable to load MT5 market data.");
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    void load();
  }, [load]);

  const latest = history?.candles.at(-1);

  return (
    <div>
      <header className="topbar">
        <div className="brand">
          <span className="brandmark"><Activity size={20} /></span>
          MT5 Market Data
        </div>
        <div className="status"><i className="dot" /> READ-ONLY CONNECTION</div>
      </header>

      <main className="wrap">
        <section className="hero">
          <div>
            <div className="eyebrow">BROKER-NEUTRAL MARKET DATA</div>
            <h1>Explore your markets.<br /><span>Read the data.</span></h1>
            <p className="sub">
              Reads quotes and historical candles from the MetaTrader 5 terminal
              currently connected on this computer. The bridge does not place or
              modify trades.
            </p>
          </div>
        </section>

        <div className="toolbar">
          <div className="field">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && search.trim()) setSymbol(search.trim());
              }}
              placeholder="MT5 symbol, e.g. XAUUSD.a"
            />
            <button onClick={() => {
              if (search.trim()) setSymbol(search.trim());
            }}>LOAD</button>
          </div>
          <select className="select" value={timeframe} onChange={(event) => setTimeframe(event.target.value)}>
            <option value="1d">1D</option>
            <option value="4h">4H</option>
            <option value="1h">1H</option>
            <option value="30m">30M</option>
            <option value="15m">15M</option>
            <option value="5m">5M</option>
            <option value="1m">1M</option>
          </select>
          <button className="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} /> REFRESH
          </button>
          <a className="button" href="/trading/">MT5 CONNECTION</a>
        </div>

        {error && <div className="card mt-4 p-4 text-[var(--negative)]" role="alert">{error}</div>}
        {loading && <div className="card mt-4 p-8">Loading data from the connected MT5 terminal…</div>}

        {!loading && history && latest && (
          <>
            <section className="grid kpis mt-4">
              <div className="card kpi">
                <div className="eyebrow">CONNECTED SYMBOL</div>
                <strong>{history.symbol}</strong>
                <p>{history.source}</p>
              </div>
              <div className="card kpi">
                <div className="eyebrow">LATEST CLOSE</div>
                <strong>{formatPrice(latest.close)}</strong>
                <p>{new Date(latest.time).toLocaleString()}</p>
              </div>
              <div className="card kpi">
                <div className="eyebrow">TIMEFRAME</div>
                <strong>{history.interval.toUpperCase()}</strong>
                <p>{history.candles.length} candles loaded</p>
              </div>
              <div className="card kpi">
                <div className="eyebrow">DATA SOURCE</div>
                <strong>MT5 TERMINAL</strong>
                <p>Broker-provided feed</p>
              </div>
            </section>

            <section className="card chart-card mt-4">
              <div className="head">
                <div>
                  <div className="eyebrow">{history.symbol} · {history.interval}</div>
                  <h2>Historical market data</h2>
                </div>
                <span className="badge">READ ONLY</span>
              </div>
              <div className="chart">
                <MarketChart candles={history.candles.map((candle) => ({
                  ...candle,
                  time: Math.floor(new Date(candle.time).getTime() / 1000) as never,
                }))} />
              </div>
            </section>
          </>
        )}

        <footer className="footer">
          <span>MT5 Market Data</span>
          <span>Read-only. No order placement or account modification.</span>
        </footer>
      </main>
    </div>
  );
}
