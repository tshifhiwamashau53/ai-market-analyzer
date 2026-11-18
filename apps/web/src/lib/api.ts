export type ApiCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketHistory = {
  symbol: string;
  interval: string;
  candles: ApiCandle[];
  source: string;
};

const bridgeBase = (
  process.env.NEXT_PUBLIC_MT5_BRIDGE_URL || "http://127.0.0.1:8765"
).replace(/\/$/, "");

async function bridgeRequest<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(bridgeBase + path, { cache: "no-store" });
  } catch {
    throw new Error(
      "Cannot reach the local MT5 bridge. Start MT5 and run the bridge on this computer."
    );
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload?.details || payload?.error || "The MT5 bridge request failed."
    );
  }
  return payload as T;
}

export async function marketHistory(
  symbol: string,
  _period = "6mo",
  interval = "1d"
): Promise<MarketHistory> {
  const query = new URLSearchParams({
    symbol: symbol.trim(),
    interval,
    limit: "300",
  });

  const [history, health] = await Promise.all([
    bridgeRequest<{
      providerSymbol: string;
      timeframe: string;
      candles: ApiCandle[];
    }>("/candles?" + query.toString()),
    bridgeRequest<{ server?: string; company?: string }>("/health"),
  ]);

  return {
    symbol: history.providerSymbol,
    interval: history.timeframe,
    candles: history.candles,
    source: [health.company, health.server, "MetaTrader 5"].filter(Boolean).join(" · "),
  };
}

export type Mt5Symbol = {
  symbol: string;
  displayName: string;
  path: string;
  bid: number;
  ask: number;
  spread: number;
  digits: number;
  visible: boolean;
};

export type Mt5Health = {
  ok: boolean;
  connected: boolean;
  terminalConnected: boolean;
  broker: string;
  company: string;
  server: string;
  terminal: string;
};

export async function getMt5Health(): Promise<Mt5Health> {
  return bridgeRequest<Mt5Health>("/health");
}

export async function getMt5Symbols(): Promise<Mt5Symbol[]> {
  const result = await bridgeRequest<{ symbols: Mt5Symbol[] }>("/symbols");
  return result.symbols;
}
