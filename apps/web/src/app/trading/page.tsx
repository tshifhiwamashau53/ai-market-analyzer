"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, Search } from "lucide-react";
import { getMt5Health, getMt5Symbols, type Mt5Health, type Mt5Symbol } from "@/lib/api";

export default function Mt5ConnectionPage() {
  const [health, setHealth] = useState<Mt5Health | null>(null);
  const [symbols, setSymbols] = useState<Mt5Symbol[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [connection, instruments] = await Promise.all([getMt5Health(), getMt5Symbols()]);
      setHealth(connection);
      setSymbols(instruments);
    } catch (err) {
      setHealth(null);
      setSymbols([]);
      setError(err instanceof Error ? err.message : "Unable to connect to MT5.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return symbols;
    return symbols.filter((item) =>
      item.symbol.toLowerCase().includes(needle) ||
      item.displayName.toLowerCase().includes(needle) ||
      item.path.toLowerCase().includes(needle)
    );
  }, [query, symbols]);

  return (
    <main className="wrap" style={{ maxWidth: 1120, paddingTop: 32 }}>
      <header className="head" style={{ marginBottom: 24 }}>
        <div>
          <div className="eyebrow">LOCAL METATRADER 5 TERMINAL</div>
          <h1>Broker connection</h1>
          <p className="sub">Read-only connection to the broker account already logged into MT5.</p>
        </div>
        <a className="badge" href="/">Back to market data</a>
      </header>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="head">
          <div>
            <div className="eyebrow">CONNECTION STATUS</div>
            <h2>{health?.connected ? "MT5 connected" : "MT5 not connected"}</h2>
          </div>
          <button className="button" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
        {error && <p role="alert" className="negative">{error}</p>}
        {loading && <p className="sub">Checking the local terminal…</p>}
        {health?.connected && (
          <div className="grid three">
            <div className="indicator"><span>BROKER / COMPANY</span><b>{health.company || health.broker || "MT5 broker"}</b></div>
            <div className="indicator"><span>TRADE SERVER</span><b>{health.server || "Not reported"}</b></div>
            <div className="indicator"><span>TERMINAL</span><b>{health.terminal || "MetaTrader 5"}</b></div>
          </div>
        )}
        <p className="sub mt-3">This screen only reads connection information and market symbols. It cannot send, modify or close orders.</p>
      </section>

      <section className="card" style={{ padding: 20 }}>
        <div className="head">
          <div>
            <div className="eyebrow">MARKET WATCH DISCOVERY</div>
            <h2>Available instruments ({filtered.length})</h2>
          </div>
          <Activity size={18} />
        </div>
        <label className="field">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter symbols or instrument names" />
        </label>
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["Symbol", "Description", "Bid", "Ask", "Spread"].map((heading) => (
                <th key={heading} style={{ padding: 10, borderBottom: "1px solid var(--line)" }}>{heading}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.slice(0, 300).map((item) => (
                <tr key={item.symbol}>
                  <td style={{ padding: 10 }}>{item.symbol}</td>
                  <td style={{ padding: 10 }}>{item.displayName}</td>
                  <td style={{ padding: 10 }}>{item.bid || "—"}</td>
                  <td style={{ padding: 10 }}>{item.ask || "—"}</td>
                  <td style={{ padding: 10 }}>{item.spread || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && <p className="sub mt-3">No matching instruments. Check the symbol name in MT5 Market Watch.</p>}
        </div>
      </section>
    </main>
  );
}
