export type Direction="BULLISH"|"BEARISH"|"NEUTRAL";
export type Action="BUY AREA"|"SELL AREA"|"WAIT"|"NO TRADE";
export type Candle={time:number;open:number;high:number;low:number;close:number;volume:number};
export type Indicators={ema20:number;ema50:number;rsi:number;macd:number;signal:number;bbUpper:number;bbLower:number;atr:number;vwap:number};
export type Analysis={direction:Direction;action:Action;quality:number;entry:number;sl:number;tp:number;invalidation:number;setup:string;waiting:string;reason:string[];candle:string;structure:string;momentum:string};
export type AssetData={symbol:string;name:string;price:number;change:number;candles:Candle[];indicators:Indicators;analysis:Analysis};