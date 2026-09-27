export type ApiCandle={time:string;open:number;high:number;low:number;close:number;volume:number};
export type MarketHistory={symbol:string;interval:string;candles:ApiCandle[];source:string};
export type Analysis={
 decision:"BUY"|"SELL"|"WAIT"; confidence:number; instrument:string; timeframe:string;
 currentPrice:number|null; marketCondition:string; analysisFramework:string;
 higherTimeframeBias:"BULLISH"|"BEARISH"|"NEUTRAL";
 entry:number|null; entryZone:{low:number|null;high:number|null}; stopLoss:number|null;
 takeProfits:{tp1:number|null;tp2:number|null;tp3:number|null};
 riskReward:{tp1:number|null;tp2:number|null;tp3:number|null};
 priceAction:{trend:string;structure:string;momentum:string;liquidity:string;keyLevels:string[]};
 technicalEvidence:string[];
 fundamentalAnalysis:{bias:"BULLISH"|"BEARISH"|"NEUTRAL";keyFactors:string[];researchAvailable:boolean};
 newsAnalysis:{bias:string;risk:"LOW"|"MEDIUM"|"HIGH"|"UNKNOWN";importantEvents:string[]};
 setupConditions:string[]; invalidationConditions:string[]; waitFor:string[]; reasoning:string[]; warnings:string[];
};
export type AdvancedAnalysis={symbol:string;execution_timeframe:string;current_price:number;higher_timeframe_bias:string;market_state:string;action:string;confidence:number;timeframes:{timeframe:string;direction:string;structure:string;momentum:string;price:number;ema20:number|null;ema50:number|null;rsi14:number|null;atr14:number|null;vwap:number|null;poc:number|null;support:number|null;resistance:number|null}[];strategy:{stage:string;direction:string;confirmed:boolean;score:number;entry:number|null;planned_entry:number|null;stop_loss:number|null;targets:number[];invalidation:number|null;risk_reward:number|null;range_high:number|null;range_low:number|null;poc:number|null;breakout_level:number|null;waiting_for:string[];reasons:string[]};forecast:{time:string;value:number;lower:number;upper:number}[];data_quality:string;generated_at:string};
export const advancedMarket=(symbol:string,executionTimeframe="15m")=>request("/advanced/"+encodeURIComponent(symbol)+"?execution_timeframe="+encodeURIComponent(executionTimeframe)) as Promise<AdvancedAnalysis>;
export const backtestMarket=(symbol:string,period="2y",interval="1d")=>request("/backtest/"+encodeURIComponent(symbol)+"?period="+period+"&interval="+interval) as Promise<{symbol:string;period:string;interval:string;metrics:{total_return:number;max_drawdown:number;sharpe:number;observations:number;win_rate:number;profit_factor:number;expectancy:number;winning_trades:number;losing_trades:number};validation_note:string}>;
function unavailableAnalysis(symbol:string,tf:string):Analysis{return{
 decision:"WAIT",confidence:0,instrument:symbol.toUpperCase(),timeframe:tf,currentPrice:null,
 marketCondition:"AI engine unavailable",analysisFramework:"WAIT — AI API not configured",
 higherTimeframeBias:"NEUTRAL",entry:null,entryZone:{low:null,high:null},stopLoss:null,
 takeProfits:{tp1:null,tp2:null,tp3:null},riskReward:{tp1:null,tp2:null,tp3:null},
 priceAction:{trend:"UNKNOWN",structure:"UNKNOWN",momentum:"UNKNOWN",liquidity:"UNKNOWN",keyLevels:[]},
 technicalEvidence:[],fundamentalAnalysis:{bias:"NEUTRAL",keyFactors:[],researchAvailable:false},
 newsAnalysis:{bias:"UNKNOWN",risk:"UNKNOWN",importantEvents:[]},setupConditions:[],
 invalidationConditions:[],waitFor:["Configure the AI API and supply verified market data."],
 reasoning:["No local trading signal is generated when the AI engine is unavailable."],
 warnings:["WAIT: analysis is unavailable."]
};}
export const analyzeMarket=async(symbol:string,period="6mo",interval="15m"):Promise<Analysis>=>{
 const timeframes=["4h","1h","15m","5m"];
 const raws=await Promise.all(timeframes.map(tf=>vercelMarket(symbol,tf,220)));
 const markets=Object.fromEntries(timeframes.map((tf,i)=>[tf,raws[i]]));
 const response=await request("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({asset:symbol.toUpperCase(),timeframe:interval,depth:"deep",markets})});
 if(response?.available===false) return unavailableAnalysis(symbol,interval);
 return response.analysis as Analysis;
};
