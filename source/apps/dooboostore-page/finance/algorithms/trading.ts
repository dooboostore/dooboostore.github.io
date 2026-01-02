/**
 * 매수/매도 로직
 */

import type { 
  Transaction, 
  Account, 
  Holding, 
  TradingConfig, 
  GoldenCrossConfig,
  CrossState,
  Group
} from './types';
import type { ChartQuote } from '../service/YahooFinanceBrowserService';
import type { MACDResult, BollingerBandsResult, VolumeAnalysisResult } from './calc';

export type TradingContext = {
  config: TradingConfig;
  account: Account;
  symbols: Map<string, { open: number; quotes: ChartQuote[] }>;
  goldenCross: GoldenCrossConfig;
  symbolCrossState: Map<string, CrossState>;
  symbolLastSellPrice: Map<string, number>;
  symbolGoldenCycleFirstBuy: Map<string, boolean>;
  symbolTimeSeriesMap: Map<string, any[]>;
  transactions: Transaction[];
  symbolTransactionsMap: Map<string, Transaction[]>;
  consecutiveLosses: number;
  tradingPaused: boolean;
};

/**
 * 매수 실행
 */
export const buyStock = (
  ctx: TradingContext,
  symbol: string,
  group: Group,
  currentTime: Date,
  changeRate: number,
  volumeStrength: number,
  fromMA: { value: number; slope: number },
  toMA: { value: number; slope: number },
  obvSlope: number,
  rsi?: number,
  macd?: MACDResult,
  bollingerBands?: BollingerBandsResult,
  volumeAnalysis?: VolumeAnalysisResult,
  isReBuy: boolean = false,
  isGoldenCrossEntry: boolean = false
): boolean => {
  const { config, account, symbols, goldenCross, symbolTimeSeriesMap, transactions, symbolTransactionsMap } = ctx;

  // 시간 필터 체크
  if (config.features.timeFilter) {
    const hour = currentTime.getHours();
    if (config.timeFilter.excludeHours.includes(hour)) {
      console.log(`    ⚠️  Trading hour ${hour} is excluded, skipping buy`);
      return false;
    }
  }

  // 거래 중단 상태 체크
  if (config.features.consecutiveLossProtection && ctx.tradingPaused) {
    console.log(`    ⚠️  Trading paused due to consecutive losses, skipping buy`);
    return false;
  }

  // 거래량 강도 체크
  if (config.features.volumeStrengthFilter) {
    if (volumeStrength < config.buy.minVolumeStrength) {
      console.log(`    ⚠️  Volume strength too low (${volumeStrength.toFixed(1)}%), skipping buy`);
      return false;
    }
  }

  // 기울기 체크
  if (config.features.slopeFilter) {
    if (fromMA.slope < config.buy.minSlope) {
      console.log(`    ⚠️  Slope too low (${fromMA.slope.toFixed(2)}%), skipping buy`);
      return false;
    }
  }

  // MA 간격 체크
  if (config.features.maGapFilter) {
    const maGap = (fromMA.value - toMA.value) / Math.abs(toMA.value);
    if (maGap > config.buy.maxMaGap) {
      console.log(`    ⚠️  MA gap too wide (${(maGap * 100).toFixed(2)}%), skipping buy`);
      return false;
    }
  }

  // OBV 기울기 체크
  if (config.features.obvFilter) {
    if (obvSlope < config.buy.minObvSlope) {
      console.log(`    ⚠️  OBV slope too low (${obvSlope.toFixed(2)}%), skipping buy`);
      return false;
    }
  }

  // RSI 체크
  if (config.features.rsiFilter && rsi !== undefined) {
    if (rsi > config.buy.maxRsi) {
      console.log(`    ⚠️  RSI too high (${rsi.toFixed(2)}, overbought), skipping buy`);
      return false;
    }
    if (rsi < config.buy.minRsi) {
      console.log(`    ⚠️  RSI too low (${rsi.toFixed(2)}, oversold), skipping buy`);
      return false;
    }
  }

  // MACD 체크
  if (config.features.macdFilter && macd) {
    if (config.buy.macdBullish && macd.histogram <= 0) {
      console.log(`    ⚠️  MACD histogram not bullish (${macd.histogram.toFixed(4)}), skipping buy`);
      return false;
    }
  }

  // 볼린저 밴드 체크
  if (config.features.bollingerBandsFilter && bollingerBands) {
    if (bollingerBands.percentB < config.buy.minBollingerPercentB) {
      console.log(`    ⚠️  Price too close to lower band (%B: ${(bollingerBands.percentB * 100).toFixed(1)}%), skipping buy`);
      return false;
    }
    if (bollingerBands.percentB > config.buy.maxBollingerPercentB) {
      console.log(`    ⚠️  Price too high in band (%B: ${(bollingerBands.percentB * 100).toFixed(1)}%), skipping buy`);
      return false;
    }
  }

  // 거래량 분석 체크
  if (config.features.volumeAnalysisFilter && volumeAnalysis) {
    if (config.buy.volumeTrendRequired === 'increasing' && volumeAnalysis.volumeTrend !== 'increasing') {
      console.log(`    ⚠️  Volume trend not increasing (${volumeAnalysis.volumeTrend}), skipping buy`);
      return false;
    }
    if (config.buy.avoidPriceVolumeDivergence && volumeAnalysis.priceVolumeDivergence) {
      console.log(`    ⚠️  Price-volume divergence detected, skipping buy`);
      return false;
    }
  }

  const symbolData = symbols.get(symbol);
  if (!symbolData) return false;

  const quotesUntilNow = symbolData.quotes.filter(q =>
    q.date.getTime() <= currentTime.getTime() && q.close !== null && q.close !== undefined
  );
  const currentQuote = quotesUntilNow[quotesUntilNow.length - 1];
  if (!currentQuote || !currentQuote.close) return false;

  const price = currentQuote.close;
  const holding = account.holdings.get(symbol);
  
  // 피라미딩 여부 결정
  let isPyramiding = false;

  if (holding) {
    // 골든크로스 진입 시점이면 피라미딩이 아님
    if (isGoldenCrossEntry) {
      console.log(`    📈 Golden cross entry with existing position - treating as first buy, not pyramiding`);
      isPyramiding = false;
    } else {
      if (!config.features.pyramiding) {
        console.log(`    ⚠️  Already holding ${symbol}, pyramiding disabled`);
        return false;
      }

      isPyramiding = true;

      // 기울기가 더 가파르면 추가 매수
      const symbolTimeSeries = symbolTimeSeriesMap.get(symbol);
      if (symbolTimeSeries && symbolTimeSeries.length >= 2) {
        const prevData = symbolTimeSeries[symbolTimeSeries.length - 2];
        const prevFromMA = prevData.ma.get(goldenCross.from);
        if (prevFromMA && fromMA.slope <= prevFromMA.slope) {
          console.log(`    ⚠️  Slope not increasing (${fromMA.slope.toFixed(2)}% vs ${prevFromMA.slope.toFixed(2)}%), skipping pyramiding`);
          return false;
        }
      }
      console.log(`    📈 Pyramiding: Adding to existing position`);
    }
  }

  // 자금 관리
  let quantity: number;
  const investmentAmount = account.balance * config.buy.stockRate;
  quantity = Math.floor(investmentAmount / price);

  // 피라미딩 시 수량 조정
  if (holding && config.features.pyramiding && isPyramiding) {
    const currentHolding = holding.quantity;
    const firstInvestment = holding.avgPrice * currentHolding;
    let pyramidInvestment = firstInvestment;
    let accumulatedQuantity = 0;

    while (accumulatedQuantity < currentHolding) {
      const qty = Math.floor(pyramidInvestment / holding.avgPrice);
      accumulatedQuantity += qty;
      pyramidInvestment = pyramidInvestment / 2;
    }

    const nextInvestment = pyramidInvestment;
    quantity = Math.floor(nextInvestment / price);
    quantity = Math.max(1, quantity);
  }

  if (quantity === 0) {
    console.log(`    ⚠️  Not enough balance to buy ${symbol}`);
    return false;
  }

  const cost = price * quantity;
  const fees = cost * config.tradeFees.buy;
  const total = cost + fees;

  if (total > account.balance) {
    console.log(`    ⚠️  Not enough balance: need ${total.toLocaleString()}원, have ${account.balance.toLocaleString()}원`);
    return false;
  }

  // 계좌 업데이트
  account.balance -= total;

  if (holding) {
    const newQuantity = holding.quantity + quantity;
    const newAvgPrice = (holding.avgPrice * holding.quantity + price * quantity) / newQuantity;
    holding.quantity = newQuantity;
    holding.avgPrice = newAvgPrice;
    holding.maxPrice = Math.max(holding.maxPrice, price);
    holding.buyTime = new Date(currentTime);
  } else {
    account.holdings.set(symbol, { 
      quantity, 
      avgPrice: price, 
      maxPrice: price, 
      buyTime: new Date(currentTime) 
    });
  }

  // 거래 내역 저장
  const tx: Transaction = {
    time: new Date(currentTime),
    type: 'BUY',
    symbol,
    quantity,
    price,
    fees,
    total,
    isPyramiding,
    isReBuy,
    isGoldenCrossEntry
  };

  transactions.push(tx);

  if (!symbolTransactionsMap.has(symbol)) {
    symbolTransactionsMap.set(symbol, []);
  }
  symbolTransactionsMap.get(symbol)!.push({ ...tx });

  const pyramidingLabel = isPyramiding ? ' (Pyramiding)' : '';
  console.log(`    ✅ BUY ${symbol}: ${quantity}주 @ ${price.toLocaleString()}원${pyramidingLabel} (isPyramiding: ${isPyramiding}, group: ${group.label}, slope: ${fromMA.slope.toFixed(2)}%, vol: ${volumeStrength.toFixed(1)}%, rsi: ${rsi?.toFixed(1) || 'N/A'}, macd: ${macd?.histogram.toFixed(4) || 'N/A'}, bb: ${bollingerBands ? (bollingerBands.percentB * 100).toFixed(1) + '%' : 'N/A'})`);
  console.log(`    💵 Balance: ${account.balance.toLocaleString()}원`);

  return true;
};

/**
 * 매도 실행
 */
export const sellStock = (
  ctx: TradingContext,
  symbol: string,
  currentTime: Date,
  fromMA: { value: number; slope: number },
  toMA: { value: number; slope: number },
  reason: string = 'DEAD_CROSS',
  forceFullSell: boolean = false
): void => {
  const { config, account, symbols, transactions, symbolTransactionsMap } = ctx;

  const holding = account.holdings.get(symbol);
  if (!holding || holding.quantity === 0) return;

  const symbolData = symbols.get(symbol);
  if (!symbolData) return;

  const quotesUntilNow = symbolData.quotes.filter(q =>
    q.date.getTime() <= currentTime.getTime() && q.close !== null && q.close !== undefined
  );
  const currentQuote = quotesUntilNow[quotesUntilNow.length - 1];
  if (!currentQuote || !currentQuote.close) return;

  // 매도 수량 계산
  let quantity: number;
  if (forceFullSell || reason === 'STOP_LOSS' || reason === 'TAKE_PROFIT' || reason === 'TRAILING_STOP') {
    quantity = holding.quantity;
  } else {
    quantity = Math.round(holding.quantity * config.sell.stockRate);
    if (quantity === 0) quantity = 1;
    if (quantity > holding.quantity) quantity = holding.quantity;

    const remaining = holding.quantity - quantity;
    if (remaining > 0 && remaining < 5) {
      quantity = holding.quantity;
      console.log(`    ⚠️  Remaining quantity too small (${remaining}), selling all`);
    }
  }

  const price = currentQuote.close;
  const revenue = price * quantity;
  const fees = revenue * config.tradeFees.sell;
  const total = revenue - fees;

  // 계좌 업데이트
  account.balance += total;

  if (quantity >= holding.quantity) {
    account.holdings.delete(symbol);
  } else {
    holding.quantity -= quantity;
  }

  // 손익 계산
  const profit = (price - holding.avgPrice) * quantity - fees;
  const profitRate = ((price - holding.avgPrice) / holding.avgPrice) * 100;

  // 연속 손실 카운트 업데이트
  if (config.features.consecutiveLossProtection) {
    if (profit < 0) {
      ctx.consecutiveLosses++;
      if (ctx.consecutiveLosses >= config.riskManagement.maxConsecutiveLosses) {
        ctx.tradingPaused = true;
        console.log(`    🚨 Trading PAUSED due to ${ctx.consecutiveLosses} consecutive losses`);
      }
    } else {
      ctx.consecutiveLosses = 0;
      if (ctx.tradingPaused) {
        ctx.tradingPaused = false;
        console.log(`    ✅ Trading RESUMED after profit`);
      }
    }
  }

  // 거래 내역 저장
  const tx: Transaction = {
    time: new Date(currentTime),
    type: 'SELL',
    symbol,
    quantity,
    price,
    fees,
    total,
    avgBuyPrice: holding.avgPrice,
    profit,
    reason
  };

  transactions.push(tx);

  if (!symbolTransactionsMap.has(symbol)) {
    symbolTransactionsMap.set(symbol, []);
  }
  symbolTransactionsMap.get(symbol)!.push({ ...tx });

  const remainingQty = account.holdings.get(symbol)?.quantity || 0;
  const emoji = reason === 'STOP_LOSS' ? '🛑' : reason === 'TAKE_PROFIT' ? '🎯' : reason === 'TRAILING_STOP' ? '📉' : '☠️';
  const remainingInfo = remainingQty > 0 ? ` (남은 수량: ${remainingQty}주)` : '';
  console.log(`    ${emoji} SELL ${symbol} (${reason}): ${quantity}주 @ ${price.toLocaleString()}원 (profit: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()}원 / ${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}%)${remainingInfo}`);
  console.log(`    💵 Balance: ${account.balance.toLocaleString()}원`);
};

/**
 * 손절/익절 체크
 */
export const checkStopLossAndTakeProfit = (
  ctx: TradingContext,
  currentTime: Date
): Set<string> => {
  const { config, account, symbols, symbolCrossState, transactions, symbolTransactionsMap } = ctx;
  const toSell: { symbol: string; reason: string; price: number; holding: Holding }[] = [];
  const soldSymbols = new Set<string>();

  account.holdings.forEach((holding, symbol) => {
    // 같은 시점에 매수한 종목은 제외
    if (holding.buyTime.getTime() === currentTime.getTime()) {
      return;
    }

    const symbolData = symbols.get(symbol);
    if (!symbolData) return;

    const quotesUntilNow = symbolData.quotes.filter(q =>
      q.date.getTime() <= currentTime.getTime() && q.close !== null && q.close !== undefined
    );
    const currentQuote = quotesUntilNow[quotesUntilNow.length - 1];
    if (!currentQuote || !currentQuote.close) return;

    const currentPrice = currentQuote.close;

    // 최고가 업데이트
    if (currentPrice > holding.maxPrice) {
      holding.maxPrice = currentPrice;
    }

    const profitRate = (currentPrice - holding.avgPrice) / holding.avgPrice;
    const currentState = symbolCrossState.get(symbol);

    // 손절 체크 (데드크로스 상태에서만)
    if (config.features.stopLoss && currentState === 'DEAD' && profitRate <= config.sell.stopLoss) {
      toSell.push({ symbol, reason: 'STOP_LOSS', price: currentPrice, holding });
    }
    // 익절 체크
    else if (config.features.takeProfit && profitRate >= config.sell.takeProfit) {
      toSell.push({ symbol, reason: 'TAKE_PROFIT', price: currentPrice, holding });
    }
    // 트레일링 스톱 체크 (데드크로스 상태에서만)
    else if (config.features.trailingStop && currentState === 'DEAD') {
      const drawdownFromMax = (currentPrice - holding.maxPrice) / holding.maxPrice;
      if (drawdownFromMax <= -config.sell.trailingStopPercent) {
        toSell.push({ symbol, reason: 'TRAILING_STOP', price: currentPrice, holding });
      }
    }
  });

  // 매도 실행
  if (toSell.length > 0) {
    console.log(`\n⚠️  [STOP LOSS / TAKE PROFIT / TRAILING STOP] at ${currentTime.getHours()}:${currentTime.getMinutes().toString().padStart(2, '0')}`);

    toSell.forEach(item => {
      const quantity = item.holding.quantity;
      const price = item.price;
      const revenue = price * quantity;
      const fees = revenue * config.tradeFees.sell;
      const total = revenue - fees;
      const profit = (price - item.holding.avgPrice) * quantity - fees;
      const profitRate = ((price - item.holding.avgPrice) / item.holding.avgPrice) * 100;

      account.balance += total;
      account.holdings.delete(item.symbol);
      soldSymbols.add(item.symbol);

      // 연속 손실 카운트
      if (config.features.consecutiveLossProtection) {
        if (profit < 0) {
          ctx.consecutiveLosses++;
          if (ctx.consecutiveLosses >= config.riskManagement.maxConsecutiveLosses) {
            ctx.tradingPaused = true;
            console.log(`    🚨 Trading PAUSED due to ${ctx.consecutiveLosses} consecutive losses`);
          }
        } else {
          ctx.consecutiveLosses = 0;
          if (ctx.tradingPaused) {
            ctx.tradingPaused = false;
            console.log(`    ✅ Trading RESUMED after profit`);
          }
        }
      }

      // 거래 내역 저장
      const tx: Transaction = {
        time: new Date(currentTime),
        type: 'SELL',
        symbol: item.symbol,
        quantity,
        price,
        fees,
        total,
        avgBuyPrice: item.holding.avgPrice,
        profit,
        reason: item.reason
      };

      transactions.push(tx);

      if (!symbolTransactionsMap.has(item.symbol)) {
        symbolTransactionsMap.set(item.symbol, []);
      }
      symbolTransactionsMap.get(item.symbol)!.push({ ...tx });

      const emoji = item.reason === 'STOP_LOSS' ? '🛑' : item.reason === 'TAKE_PROFIT' ? '🎯' : '📉';
      const maxPriceInfo = item.reason === 'TRAILING_STOP' ? ` (max: ${item.holding.maxPrice.toLocaleString()})` : '';
      console.log(`  ${emoji} ${item.reason} ${item.symbol}: ${quantity}주 @ ${price.toLocaleString()}원 (${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}%, profit: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()}원)${maxPriceInfo}`);
    });

    console.log(`  💵 Balance: ${account.balance.toLocaleString()}원`);
  }

  return soldSymbols;
};
