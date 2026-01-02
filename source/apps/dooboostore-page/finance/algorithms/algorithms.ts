import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { YahooFinanceBrowser, ChartResult, ChartQuote } from '../service/YahooFinanceBrowserService';
import {
  calculateMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  analyzeVolume,
} from './calc';
import type { DataPlan, Group, Transaction, TimeSeries, Account, CrossState } from './types';
import { DEFAULT_CONFIG, GOLDEN_CROSS, DEAD_CROSS, MA_PERIODS, INITIAL_BALANCE, parseIntervalToMs } from './config';
import { buyStock, sellStock, checkStopLossAndTakeProfit, type TradingContext } from './trading';
import { createChart, type ChartContext } from './chart';

const CHART_DIR = join(__dirname, '../../../../datas/finance/chart');
const TICKERS_PATH = join(__dirname, '../../../../datas/finance/tickers.json');
const GROUPS_PATH = join(__dirname, '../../../../datas/finance/groups.json');

async function load5MinuteCharts(dataPlan: DataPlan) {
  console.log('📊 Starting chart data collection...');
  console.log(`   Interval: ${dataPlan.interval}`);
  console.log(`   Data From: ${dataPlan.dataFrom}`);
  console.log(`   Data To: ${dataPlan.dataTo}`);

  // Load groups
  if (!existsSync(GROUPS_PATH)) {
    console.error(`❌ Groups file not found: ${GROUPS_PATH}`);
    return;
  }

  const groups: Group[] = JSON.parse(readFileSync(GROUPS_PATH, 'utf-8'));
  console.log(`📋 Loaded ${groups.length} groups`);

  // Collect all unique symbols
  const allSymbols = new Set<string>();
  groups.forEach(group => {
    group.symbols.forEach(symbol => allSymbols.add(symbol));
  });

  console.log(`🎯 Total unique symbols: ${allSymbols.size}`);

  const yahooService = new YahooFinanceBrowser();
  await yahooService.init(); // Initialize browser once
  const symbols = Array.from(allSymbols);

  // Use interval from dataPlan
  const intervals = [dataPlan.interval];
  const startDate = new Date(dataPlan.dataFrom);
  const endDate = new Date(dataPlan.dataTo);

  let processedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // Process in batches for parallel execution
  const BATCH_SIZE = 5; // Process 5 symbols at once

  for (let batchStart = 0; batchStart < symbols.length; batchStart += BATCH_SIZE) {
    const batch = symbols.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(symbols.length / BATCH_SIZE);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Batch ${batchNumber}/${totalBatches}: Processing ${batch.length} symbols in parallel`);
    console.log(`${'='.repeat(60)}`);

    // Process batch in parallel
    const batchPromises = batch.map(async (symbol, index) => {
      const globalIndex = batchStart + index;
      console.log(`[${globalIndex + 1}/${symbols.length}] Processing: ${symbol}`);

      // Check if file already exists
      let alreadyExists = false;
      const intervalDir = join(CHART_DIR, dataPlan.interval);
      const outputPath = join(intervalDir, `${symbol}.json`);
      if (existsSync(outputPath)) {
        console.log(`  ⏭️  Already exists: ${outputPath}`);
        alreadyExists = true;
        skippedCount++;
        return { status: 'skipped', symbol };
      }

      if (alreadyExists) {
        return { status: 'skipped', symbol };
      }

      try {
        let chartData: ChartResult | null = null;
        let usedInterval = dataPlan.interval;

        // Try to fetch data with the specified interval
        try {
          console.log(`  [${symbol}] Fetching with interval: ${dataPlan.interval}`);

          chartData = await yahooService.chart(symbol, {
            period1: startDate,
            period2: endDate,
            interval: dataPlan.interval
          });

          if (chartData && chartData.quotes && chartData.quotes.length > 0) {
            console.log(`  ✅ [${symbol}] Success with ${dataPlan.interval} (${chartData.quotes.length} data points)`);
          } else {
            console.log(`  ❌ [${symbol}] No data available`);
            failedCount++;
            return { status: 'failed', symbol };
          }
        } catch (error) {
          const errorMsg = (error as Error).message;
          console.log(`  ⚠️ [${symbol}] Failed: ${errorMsg}`);
          failedCount++;
          return { status: 'failed', symbol };
        }

        if (!chartData || !chartData.quotes || chartData.quotes.length === 0) {
          console.log(`  ❌ [${symbol}] No data available`);
          failedCount++;
          return { status: 'failed', symbol };
        }

        // Save
        const intervalDir = join(CHART_DIR, usedInterval);
        if (!existsSync(intervalDir)) {
          mkdirSync(intervalDir, { recursive: true });
        }

        const outputPath = join(intervalDir, `${symbol}.json`);
        writeFileSync(outputPath, JSON.stringify(chartData, null, 2), 'utf-8');
        console.log(`  💾 [${symbol}] Saved: ${outputPath}`);
        processedCount++;
        return { status: 'success', symbol };

      } catch (error) {
        console.error(`  ❌ [${symbol}] Error: ${(error as Error).message}`);
        failedCount++;
        return { status: 'failed', symbol };
      }
    });

    // Wait for batch to complete
    await Promise.all(batchPromises);

    // Wait between batches to avoid rate limiting
    if (batchStart + BATCH_SIZE < symbols.length) {
      // const waitTime = 10000; // 10 seconds between batches
      const waitTime = 10; // 10 seconds between batches
      console.log(`\n⏳ Waiting ${waitTime / 1000} seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Chart data collection completed!');
  console.log(`📊 Summary:`);
  console.log(`   - Interval: ${dataPlan.interval}`);
  console.log(`   - Date range: ${dataPlan.dataFrom} to ${dataPlan.dataTo}`);
  console.log(`   - Total symbols: ${symbols.length}`);
  console.log(`   - Processed: ${processedCount}`);
  console.log(`   - Skipped (already exists): ${skippedCount}`);
  console.log(`   - Failed: ${failedCount}`);
  console.log('='.repeat(60));

  // Close browser
  await yahooService.close();
}

const algorithms = async (dataPlan: DataPlan) => {
  console.log('🤖 Starting algorithm with dataPlan:');
  console.log(`   Interval: ${dataPlan.interval}`);
  console.log(`   Data Range: ${dataPlan.dataFrom} ~ ${dataPlan.dataTo}`);
  console.log(`   Algorithm Range: ${dataPlan.algoFrom} ~ ${dataPlan.algoTo}`);
  
  // Parse dates from dataPlan
  const dataStartDate = new Date(dataPlan.dataFrom);
  const dataEndDate = new Date(dataPlan.dataTo);
  const algoStartDate = new Date(dataPlan.algoFrom);
  const algoEndDate = new Date(dataPlan.algoTo);
  
  // Determine time increment based on interval
  const interval = parseIntervalToMs(dataPlan.interval);

  // 설정 (config.ts에서 import)
  const maPeriods = MA_PERIODS;
  const goldenCross = GOLDEN_CROSS;
  const deadCross = DEAD_CROSS;
  const config = DEFAULT_CONFIG;

  // 계좌 정보
  const account: Account = {
    balance: INITIAL_BALANCE,
    holdings: new Map()
  };

  // 심볼별 크로스 상태 추적
  const symbolCrossState = new Map<string, CrossState>();

  // 심볼별 마지막 매도 가격 추적 (데드크로스 추가 매도용)
  const symbolLastSellPrice = new Map<string, number>();
  
  // 심볼별 골든크로스 사이클 첫 매수 여부 추적
  const symbolGoldenCycleFirstBuy = new Map<string, boolean>();

  // 매수 가능 그룹 화이트리스트
  const buyableGroups = new Set<string>();

  // 리스크 관리
  let consecutiveLosses = 0;
  let tradingPaused = false;

  // 거래 내역
  const transactions: Transaction[] = [];

  // 심볼별 거래 내역 맵 (차트 생성용)
  const symbolTransactionsMap = new Map<string, Transaction[]>();

  // 필요한 모든 이평선 기간 계산 (중복 제거)
  const allMAPeriods = Array.from(new Set([
    ...maPeriods,
    goldenCross.from,
    goldenCross.to,
    deadCross.from,
    deadCross.to
  ])).sort((a, b) => a - b);

  // 개별 종목 매수 함수
  const buyStock = (
    symbol: string,
    group: Group,
    currentTime: Date,
    changeRate: number,
    volumeStrength: number,
    fromMA: { value: number, slope: number },
    toMA: { value: number, slope: number },
    obvSlope: number,
    rsi?: number,
    macd?: { macd: number, signal: number, histogram: number },
    bollingerBands?: { upper: number, middle: number, lower: number, percentB: number },
    volumeAnalysis?: { volumeTrend: 'increasing' | 'decreasing' | 'neutral', priceVolumeDivergence: boolean },
    isReBuy: boolean = false,  // 재매수 여부
    isGoldenCrossEntry: boolean = false  // 골든크로스 진입 시점 매수 여부
  ) => {
    // 시간 필터 체크
    if (config.features.timeFilter) {
      const hour = currentTime.getHours();
      if (config.timeFilter.excludeHours.includes(hour)) {
        console.log(`    ⚠️  Trading hour ${hour} is excluded, skipping buy`);
        return;
      }
    }

    // 거래 중단 상태 체크
    if (config.features.consecutiveLossProtection && tradingPaused) {
      console.log(`    ⚠️  Trading paused due to consecutive losses, skipping buy`);
      return;
    }

    // 거래량 강도 체크
    if (config.features.volumeStrengthFilter) {
      if (volumeStrength < config.buy.minVolumeStrength) {
        console.log(`    ⚠️  Volume strength too low (${volumeStrength.toFixed(1)}%), skipping buy`);
        return;
      }
    }

    // 기울기 체크
    if (config.features.slopeFilter) {
      if (fromMA.slope <= config.buy.minSlope) {
        console.log(`    ⚠️  Slope too low (${fromMA.slope.toFixed(2)}%), skipping buy`);
        return;
      }
    }

    // MA 간격 체크 (너무 벌어지면 이미 늦음)
    if (config.features.maGapFilter) {
      const maGap = (fromMA.value - toMA.value) / Math.abs(toMA.value);
      if (maGap > config.buy.maxMaGap) {
        console.log(`    ⚠️  MA gap too wide (${(maGap * 100).toFixed(2)}%), skipping buy`);
        return;
      }
    }

    // OBV 기울기 체크
    if (config.features.obvFilter) {
      if (obvSlope < config.buy.minObvSlope) {
        console.log(`    ⚠️  OBV slope too low (${obvSlope.toFixed(2)}%), skipping buy`);
        return;
      }
    }

    // RSI 체크
    if (config.features.rsiFilter && rsi !== undefined) {
      if (rsi > config.buy.maxRsi) {
        console.log(`    ⚠️  RSI too high (${rsi.toFixed(2)}, overbought), skipping buy`);
        return;
      }
      if (rsi < config.buy.minRsi) {
        console.log(`    ⚠️  RSI too low (${rsi.toFixed(2)}, oversold), skipping buy`);
        return;
      }
    }

    // MACD 체크
    if (config.features.macdFilter && macd) {
      if (config.buy.macdBullish && macd.histogram <= 0) {
        console.log(`    ⚠️  MACD histogram not bullish (${macd.histogram.toFixed(4)}), skipping buy`);
        return;
      }
    }

    // 볼린저 밴드 체크
    if (config.features.bollingerBandsFilter && bollingerBands) {
      if (bollingerBands.percentB < config.buy.minBollingerPercentB) {
        console.log(`    ⚠️  Price too close to lower band (%B: ${(bollingerBands.percentB * 100).toFixed(1)}%), skipping buy`);
        return;
      }
      if (bollingerBands.percentB > config.buy.maxBollingerPercentB) {
        console.log(`    ⚠️  Price too high in band (%B: ${(bollingerBands.percentB * 100).toFixed(1)}%), skipping buy`);
        return;
      }
    }

    // 거래량 분석 체크
    if (config.features.volumeAnalysisFilter && volumeAnalysis) {
      if (config.buy.volumeTrendRequired === 'increasing' && volumeAnalysis.volumeTrend !== 'increasing') {
        console.log(`    ⚠️  Volume trend not increasing (${volumeAnalysis.volumeTrend}), skipping buy`);
        return;
      }
      if (config.buy.avoidPriceVolumeDivergence && volumeAnalysis.priceVolumeDivergence) {
        console.log(`    ⚠️  Price-volume divergence detected, skipping buy`);
        return;
      }
    }

    const symbolData = symbols.get(symbol);
    if (!symbolData) return;

    const quotesUntilNow = symbolData.quotes.filter(q =>
      q.date.getTime() <= currentTime.getTime() && q.close !== null && q.close !== undefined
    );
    const currentQuote = quotesUntilNow[quotesUntilNow.length - 1];
    if (!currentQuote || !currentQuote.close) return;

    const price = currentQuote.close;
    const holding = account.holdings.get(symbol);
    
    // 피라미딩 여부는 나중에 결정 (피라미딩 체크 로직 통과 후)
    // 골든크로스 진입 시점이면 피라미딩이 아님
    let isPyramiding = false;

    // 피라미딩 체크 (이미 보유 중인 경우)
    if (holding) {
      // 골든크로스 진입 시점이면 피라미딩이 아님 (첫 매수로 처리)
      if (isGoldenCrossEntry) {
        console.log(`    📈 Golden cross entry with existing position - treating as first buy, not pyramiding`);
        isPyramiding = false;
      } else {
        if (!config.features.pyramiding) {
          console.log(`    ⚠️  Already holding ${symbol}, pyramiding disabled`);
          return;
        }

        // 여기까지 왔으면 피라미딩
        isPyramiding = true;

        // 기울기가 더 가파르면 추가 매수
        const symbolTimeSeries = symbolTimeSeriesMap.get(symbol);
        if (symbolTimeSeries && symbolTimeSeries.length >= 2) {
          const prevData = symbolTimeSeries[symbolTimeSeries.length - 2];
          const prevFromMA = prevData.ma.get(goldenCross.from);
          if (prevFromMA && fromMA.slope <= prevFromMA.slope) {
            console.log(`    ⚠️  Slope not increasing (${fromMA.slope.toFixed(2)}% vs ${prevFromMA.slope.toFixed(2)}%), skipping pyramiding`);
            return;
          }
        }
        console.log(`    📈 Pyramiding: Adding to existing position`);
      }
    }

    // 자금 관리: 잔고 기반 비율 투자
    let quantity: number;
    
    // 잔고의 stockRate 비율만큼 투자
    const investmentAmount = account.balance * config.buy.stockRate;
    quantity = Math.floor(investmentAmount / price);
    
    // 피라미딩 시 수량 조정: 매수 횟수에 따라 절반씩 감소
    if (holding && config.features.pyramiding) {
      // 현재 보유 수량으로 몇 번째 매수인지 계산
      const currentHolding = holding.quantity;
      
      // 첫 매수 시 투자 금액 역산
      const firstInvestment = holding.avgPrice * currentHolding;
      let pyramidInvestment = firstInvestment;
      let accumulatedQuantity = 0;
      
      // 몇 번째 매수인지 찾기
      while (accumulatedQuantity < currentHolding) {
        const qty = Math.floor(pyramidInvestment / holding.avgPrice);
        accumulatedQuantity += qty;
        pyramidInvestment = pyramidInvestment / 2;
      }
      
      // 다음 투자 금액은 절반
      const nextInvestment = pyramidInvestment;
      quantity = Math.floor(nextInvestment / price);
      quantity = Math.max(1, quantity); // 최소 1주
      
      console.log(`    📊 Pyramiding quantity: ${quantity}주 (investment: ${nextInvestment.toLocaleString()}원, current holding: ${currentHolding}주)`);
    } else {
      console.log(`    💰 Investment: ${investmentAmount.toLocaleString()}원 (${(config.buy.stockRate * 100).toFixed(1)}% of balance)`);
    }

    if (quantity === 0) {
      console.log(`    ⚠️  Insufficient balance for even 1 share (price: ${price.toLocaleString()}원, available: ${investmentAmount.toLocaleString()}원)`);
      return;
    }

    const cost = price * quantity;
    const fees = cost * config.tradeFees.buy;
    const total = cost + fees;

    if (account.balance < total) {
      console.log(`    ❌ Insufficient balance for ${symbol} (need: ${total.toLocaleString()}, have: ${account.balance.toLocaleString()})`);
      return;
    }

    // 계좌 업데이트
    account.balance -= total;

    if (holding) {
      // 기존 보유 종목 - 평균단가 재계산
      const totalQuantity = holding.quantity + quantity;
      const totalCost = (holding.avgPrice * holding.quantity) + (price * quantity);
      holding.quantity = totalQuantity;
      holding.avgPrice = totalCost / totalQuantity;
      holding.maxPrice = Math.max(holding.maxPrice, price);
      holding.buyTime = new Date(currentTime); // 피라미딩 시 매수 시간 갱신
    } else {
      // 신규 매수
      account.holdings.set(symbol, { quantity, avgPrice: price, maxPrice: price, buyTime: new Date(currentTime) });
    }

    // 거래 내역 저장
    transactions.push({
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
    });

    // 심볼별 거래 내역 저장
    if (!symbolTransactionsMap.has(symbol)) {
      symbolTransactionsMap.set(symbol, []);
    }
    symbolTransactionsMap.get(symbol)!.push({
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
    });

    const pyramidingLabel = isPyramiding ? ' (Pyramiding)' : '';
    console.log(`    ✅ BUY ${symbol}: ${quantity}주 @ ${price.toLocaleString()}원${pyramidingLabel} (isPyramiding: ${isPyramiding}, group: ${group.label}, slope: ${fromMA.slope.toFixed(2)}%, vol: ${volumeStrength.toFixed(1)}%, rsi: ${rsi?.toFixed(1) || 'N/A'}, macd: ${macd?.histogram.toFixed(4) || 'N/A'}, bb: ${bollingerBands ? (bollingerBands.percentB * 100).toFixed(1) + '%' : 'N/A'})`);
    console.log(`    💵 Balance: ${account.balance.toLocaleString()}원`);
    
    return true; // 매수 성공
  };

  // 개별 종목 매도 함수
  const sellStock = (
    symbol: string,
    currentTime: Date,
    changeRate: number,
    volumeStrength: number,
    fromMA: { value: number, slope: number },
    toMA: { value: number, slope: number },
    reason: string = 'DEAD_CROSS',
    forceFullSell: boolean = false // 강제 전량 매도 플래그
  ) => {
    const holding = account.holdings.get(symbol);
    if (!holding || holding.quantity === 0) return;

    const symbolData = symbols.get(symbol);
    if (!symbolData) return;

    const quotesUntilNow = symbolData.quotes.filter(q =>
      q.date.getTime() <= currentTime.getTime() && q.close !== null && q.close !== undefined
    );
    const currentQuote = quotesUntilNow[quotesUntilNow.length - 1];
    if (!currentQuote || !currentQuote.close) return;

    // 매도 수량 계산: stockRate 비율만큼 매도
    let quantity: number;
    if (forceFullSell || reason === 'STOP_LOSS' || reason === 'TAKE_PROFIT' || reason === 'TRAILING_STOP') {
      // 강제 전량 매도 또는 손절/익절/트레일링스톱은 전량 매도
      quantity = holding.quantity;
    } else {
      // 데드크로스는 stockRate 비율만큼 매도
      quantity = Math.round(holding.quantity * config.sell.stockRate);
      if (quantity === 0) quantity = 1; // 최소 1주
      if (quantity > holding.quantity) quantity = holding.quantity; // 보유량 초과 방지
      
      // 남은 수량이 너무 적으면 전량 매도
      const remaining = holding.quantity - quantity;
      if (remaining > 0 && remaining < 5) { // 5주 미만 남으면
        quantity = holding.quantity; // 전량 매도
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
      // 전량 매도
      account.holdings.delete(symbol);
    } else {
      // 일부 매도 - 수량만 감소
      holding.quantity -= quantity;
    }

    // 거래 내역 저장
    const profit = (price - holding.avgPrice) * quantity - fees;
    const profitRate = ((price - holding.avgPrice) / holding.avgPrice) * 100;

    // 연속 손실 카운트 업데이트 (기능 활성화 시에만)
    if (config.features.consecutiveLossProtection) {
      if (profit < 0) {
        consecutiveLosses++;
        if (consecutiveLosses >= config.riskManagement.maxConsecutiveLosses) {
          tradingPaused = true;
          console.log(`    🚨 Trading PAUSED due to ${consecutiveLosses} consecutive losses`);
        }
      } else {
        consecutiveLosses = 0; // 수익 나면 리셋
        if (tradingPaused) {
          tradingPaused = false;
          console.log(`    ✅ Trading RESUMED after profit`);
        }
      }
    }

    transactions.push({
      time: new Date(currentTime),
      type: 'SELL',
      symbol,
      quantity,
      price,
      fees,
      total,
      avgBuyPrice: holding.avgPrice,
      profit,
      reason // 매도 이유 추가
    });

    // 심볼별 거래 내역 저장
    if (!symbolTransactionsMap.has(symbol)) {
      symbolTransactionsMap.set(symbol, []);
    }
    symbolTransactionsMap.get(symbol)!.push({
      time: new Date(currentTime),
      type: 'SELL',
      symbol,
      quantity,
      price,
      fees,
      total,
      avgBuyPrice: holding.avgPrice,
      profit,
      reason // 매도 이유 추가
    });

    const remainingQty = account.holdings.get(symbol)?.quantity || 0;
    const emoji = reason === 'STOP_LOSS' ? '🛑' : reason === 'TAKE_PROFIT' ? '🎯' : reason === 'TRAILING_STOP' ? '📉' : '☠️';
    const remainingInfo = remainingQty > 0 ? ` (남은 수량: ${remainingQty}주)` : '';
    console.log(`    ${emoji} SELL ${symbol} (${reason}): ${quantity}주 @ ${price.toLocaleString()}원 (profit: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()}원 / ${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}%)${remainingInfo}`);
    console.log(`    💵 Balance: ${account.balance.toLocaleString()}원`);
  };

  // 손절/익절 체크 함수 (이번 시점에 판 종목 리스트 반환)
  const checkStopLossAndTakeProfit = (currentTime: Date): Set<string> => {
    const toSell: { symbol: string, reason: string, price: number, holding: { quantity: number, avgPrice: number, maxPrice: number, buyTime: Date } }[] = [];
    const soldSymbols = new Set<string>(); // 이번 시점에 판 종목들

    account.holdings.forEach((holding, symbol) => {
      // 같은 시점에 매수한 종목은 익절/손절 체크 제외
      if (holding.buyTime.getTime() === currentTime.getTime()) {
        return; // 스킵
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
      
      // 066970 종목만 디버그 로그
      if (symbol === '066970.KS' && profitRate > 0.02) {
        const currentState = symbolCrossState.get(symbol);
        console.log(`  [DEBUG] ${symbol} profit check: ${(profitRate * 100).toFixed(2)}% (state: ${currentState}, takeProfit enabled: ${config.features.takeProfit})`);
      }

      const currentState = symbolCrossState.get(symbol);
      
      // 손절 체크 (기능 활성화 시에만) - 데드크로스 상태에서만 (최우선)
      if (config.features.stopLoss && currentState === 'DEAD' && profitRate <= config.sell.stopLoss) {
        if (symbol === '066970.KS') {
          console.log(`  [DEBUG] ${symbol} STOP LOSS triggered!`);
        }
        toSell.push({ symbol, reason: 'STOP_LOSS', price: currentPrice, holding });
      }
      // 익절 체크 (기능 활성화 시에만) - 항상 체크 (손절이 없을 때만)
      else if (config.features.takeProfit && profitRate >= config.sell.takeProfit) {
        if (symbol === '066970.KS') {
          console.log(`  [DEBUG] ${symbol} TAKE PROFIT triggered! ${(profitRate * 100).toFixed(2)}% >= ${(config.sell.takeProfit * 100).toFixed(2)}%`);
        }
        toSell.push({ symbol, reason: 'TAKE_PROFIT', price: currentPrice, holding });
      }
      // 트레일링 스톱 체크 (최고가 대비) - 데드크로스 상태에서만
      else if (config.features.trailingStop) {
        const currentState = symbolCrossState.get(symbol);
        if (currentState === 'DEAD') {
          const drawdownFromMax = (currentPrice - holding.maxPrice) / holding.maxPrice;
          if (drawdownFromMax <= -config.sell.trailingStopPercent) {
            toSell.push({ symbol, reason: 'TRAILING_STOP', price: currentPrice, holding });
          }
        }
      }
    });

    // 손절/익절/트레일링 스톱 실행
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

        // 계좌 업데이트
        account.balance += total;
        account.holdings.delete(item.symbol);

        // 판 종목 기록
        soldSymbols.add(item.symbol);

        // 연속 손실 카운트 업데이트 (기능 활성화 시에만)
        if (config.features.consecutiveLossProtection) {
          if (profit < 0) {
            consecutiveLosses++;
            if (consecutiveLosses >= config.riskManagement.maxConsecutiveLosses) {
              tradingPaused = true;
              console.log(`    🚨 Trading PAUSED due to ${consecutiveLosses} consecutive losses`);
            }
          } else {
            consecutiveLosses = 0; // 수익 나면 리셋
            if (tradingPaused) {
              tradingPaused = false;
              console.log(`    ✅ Trading RESUMED after profit`);
            }
          }
        }

        // 거래 내역 저장
        transactions.push({
          time: new Date(currentTime),
          type: 'SELL',
          symbol: item.symbol,
          quantity,
          price,
          fees,
          total,
          avgBuyPrice: item.holding.avgPrice,
          profit,
          reason: item.reason // 매도 이유 추가
        });

        // 심볼별 거래 내역 저장
        if (!symbolTransactionsMap.has(item.symbol)) {
          symbolTransactionsMap.set(item.symbol, []);
        }
        symbolTransactionsMap.get(item.symbol)!.push({
          time: new Date(currentTime),
          type: 'SELL',
          symbol: item.symbol,
          quantity,
          price,
          fees,
          total,
          avgBuyPrice: item.holding.avgPrice,
          profit,
          reason: item.reason // 매도 이유 추가
        });

        const emoji = item.reason === 'STOP_LOSS' ? '🛑' : item.reason === 'TAKE_PROFIT' ? '🎯' : '📉';
        const maxPriceInfo = item.reason === 'TRAILING_STOP' ? ` (max: ${item.holding.maxPrice.toLocaleString()})` : '';
        console.log(`  ${emoji} ${item.reason} ${item.symbol}: ${quantity}주 @ ${price.toLocaleString()}원 (${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}%, profit: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()}원)${maxPriceInfo}`);
      });

      console.log(`  💵 Balance: ${account.balance.toLocaleString()}원`);
    }

    return soldSymbols; // 이번 시점에 판 종목 리스트 반환
  };

  // 전처리
  const groups: Group[] = JSON.parse(readFileSync(GROUPS_PATH, 'utf-8'));
  const tickers: { symbol: string, label: string }[] = JSON.parse(readFileSync(TICKERS_PATH, 'utf-8'));
  const tickerLabelMap = new Map<string, string>();
  tickers.forEach(ticker => {
    tickerLabelMap.set(ticker.symbol, ticker.label);
  });

  const symbols = new Map<string, { open: number, quotes: ChartQuote[] }>();
  groups.forEach(group => {
    group.symbols.filter(it => !symbols.has(it)).forEach(symbol => {
      const chartPath = join(CHART_DIR, dataPlan.interval, `${symbol}.json`);
      if (existsSync(chartPath)) {
        const chartData: ChartResult = JSON.parse(readFileSync(chartPath, 'utf-8'));
        const quotes = chartData.quotes
          .map(it => {
            const ait = it as unknown as (Omit<ChartQuote, 'date'> & { date: string });
            return {
              ...it,
              date: new Date(ait.date)
            };
          })
          .filter((it) => {
            // 전체 데이터 로드 (dataFrom ~ dataTo)
            return it.date.getTime() >= dataStartDate.getTime() && it.date.getTime() <= dataEndDate.getTime();
          });
        if (quotes.length) {
          symbols.set(symbol, { open: quotes[0]?.open || 0, quotes });
        }
        console.log(`Loaded ${dataPlan.interval} chart for ${symbol}, ${chartData.quotes.length} data points`);
      } else {
        console.log(`${dataPlan.interval} chart not found for ${symbol}, skipping`);
      }
    });
  });

  // 시계열 데이터 저장 (그룹별 + 심볼별)
  type TimeSeries = {
    time: Date;
    avgChangeRate: number;
    avgVolumeStrength: number;
    ma: Map<number, { value: number, slope: number }>; // 이동평균선 값과 기울기 (기간 -> {값, 기울기})
    obv?: number; // On-Balance Volume
    obvSlope?: number; // OBV 기울기
    rsi?: number; // RSI (Relative Strength Index)
    macd?: { macd: number, signal: number, histogram: number }; // MACD
    bollingerBands?: { upper: number, middle: number, lower: number, percentB: number }; // 볼린저 밴드
    volumeAnalysis?: { volumeTrend: 'increasing' | 'decreasing' | 'neutral', priceVolumeDivergence: boolean }; // 거래량 분석
    goldenCross?: boolean; // 골든크로스 발생 여부
    deadCross?: boolean; // 데드크로스 발생 여부
  };
  const groupTimeSeriesMap = new Map<string, TimeSeries[]>();
  const symbolTimeSeriesMap = new Map<string, TimeSeries[]>();

  groups.forEach(group => {
    groupTimeSeriesMap.set(group.group, []);
  });

  symbols.forEach((_, symbol) => {
    symbolTimeSeriesMap.set(symbol, []);
  });

  // 계산 함수들은 calc.ts에서 import

  let currentTime = new Date(dataStartDate);  // 데이터 시작 시점부터 (MA 계산을 위해 전체 기간)

  // const config = {
  //   tradFees: 0.0005,
  //   buy: {
  //     symbolSize: 3,
  //     stockSize:2,
  //   },
  //   sell: {
  //     symbolSize: 3,
  //     stockSize:2,
  //   }
  // }
  //
  // const account = {
  //   balance: 1000000,
  // }
  //
  // const user = {
  //   detectGoldenCross: (group: string) => {
  //     // 아래 변수 에서 추출해서  매수매도하면될듯  account update하고  바로 체결된다고 생각하고.
  //     // groupTimeSeriesMap
  //     // groupTimeSeriesMap
  //
  //   },
  //   detectDeadCross: (group: string) =>{
  //     // 아래 변수 에서 추출해서  매수매도하면될듯  account update하고  바로 체결된다고 생각하고.
  //     // groupTimeSeriesMap
  //     // symbolTimeSeriesMap
  //   }
  // }


  while (currentTime <= dataEndDate) {  // 데이터 종료 시점까지 (차트 전체 기간)
    const isAlgoActive = currentTime.getTime() >= algoStartDate.getTime() && currentTime.getTime() <= algoEndDate.getTime();  // 거래 활성화 여부
    
    if (isAlgoActive) {
      console.log(`\n⏰ Current time: ${currentTime.toISOString()}`);
    }

    // 손절/익절 체크 (알고리즘 활성 기간에만)
    const soldSymbolsThisTime = isAlgoActive ? checkStopLossAndTakeProfit(currentTime) : new Set<string>();
    
    // 이번 시점에 매수한 종목 추적 (중복 매수 방지)
    const boughtSymbolsThisTime = new Set<string>();

    // 각 그룹별 등락률 계산
    groups.forEach(group => {
      let totalChangeRate = 0;
      let totalVolumeStrength = 0;
      let validSymbolCount = 0;

      console.log(`\n📊 Group: ${group.label}`);

      group.symbols.forEach(symbol => {
        const symbolData = symbols.get(symbol);
        if (!symbolData) return;

        const { open, quotes } = symbolData;

        // currentTime까지의 quotes (close가 있는 것만)
        const quotesUntilNow = quotes.filter(q =>
          q.date.getTime() <= currentTime.getTime() && q.close !== null && q.close !== undefined
        );

        // 가장 최근 quote
        const currentQuote = quotesUntilNow[quotesUntilNow.length - 1];

        if (!currentQuote || !currentQuote.close || !open) return;

        // 시작가 대비 등락률 계산
        const changeRate = ((currentQuote.close - open) / open) * 100;
        totalChangeRate += changeRate;

        // 거래량 강도 계산 (현재 제외한 이전 거래량들의 평균)
        const currentVolume = currentQuote.volume || 0;
        let volumeStrength = 0;
        const previousQuotes = quotesUntilNow.slice(0, -1); // 현재 제외

        if (previousQuotes.length > 0 && currentVolume > 0) {
          // 이전 거래량 중 0이 아닌 것들만 사용
          const validPreviousVolumes = previousQuotes.filter(q => (q.volume || 0) > 0);

          if (validPreviousVolumes.length > 0) {
            const avgVolume = validPreviousVolumes.reduce((sum, q) => sum + (q.volume || 0), 0) / validPreviousVolumes.length;
            volumeStrength = avgVolume > 0 ? ((currentVolume - avgVolume) / avgVolume) * 100 : 0;
            totalVolumeStrength += volumeStrength;
          }
        }

        validSymbolCount++;

        // OBV 계산
        let obv = 0;
        let obvSlope = 0;
        let isSymbolGoldenCross = false;
        let isSymbolDeadCross = false;

        quotesUntilNow.forEach((quote, i) => {
          if (i === 0) {
            obv = 0; // 초기값
            return;
          }
          const prevClose = quotesUntilNow[i - 1].close;
          if (quote.close && prevClose) {
            if (quote.close > prevClose) {
              obv += (quote.volume || 0);
            } else if (quote.close < prevClose) {
              obv -= (quote.volume || 0);
            }
            // 같으면 OBV 유지
          }
        });

        // OBV 기울기 계산 (이전 OBV 대비)
        const symbolTimeSeries = symbolTimeSeriesMap.get(symbol)!;
        if (symbolTimeSeries.length > 0) {
          const prevData = symbolTimeSeries[symbolTimeSeries.length - 1];
          if (prevData.obv && prevData.obv !== 0) {
            obvSlope = ((obv - prevData.obv) / Math.abs(prevData.obv)) * 100;
          }
        }

        // RSI 계산
        const prices = quotesUntilNow.map(q => q.close!).filter(p => p !== null && p !== undefined);
        const rsi = calculateRSI(prices, 14);

        // MACD 계산
        const macd = calculateMACD(prices);

        // 볼린저 밴드 계산
        const bollingerBands = calculateBollingerBands(prices);

        // 거래량 분석
        const volumes = quotesUntilNow.map(q => q.volume || 0);
        const volumeAnalysis = analyzeVolume(volumes, prices);

        // 심볼별 이동평균선 계산
        const changeRates = symbolTimeSeries.map(t => t.avgChangeRate);
        changeRates.push(changeRate); // 현재 값 추가

        const currentIndex = changeRates.length - 1;
        const maValues = new Map<number, { value: number, slope: number }>();

        allMAPeriods.forEach(period => {
          const maValue = calculateMA(changeRates, period, currentIndex);
          if (maValue !== null) {
            // 기울기 계산: 이전 MA값 대비 변화를 0~1로 정규화 (1 = 100% 변화)
            let slope = 0;
            const prevTimeSeries = symbolTimeSeries[symbolTimeSeries.length - 1];
            if (prevTimeSeries) {
              const prevMA = prevTimeSeries.ma.get(period);
              if (prevMA) {
                const change = maValue - prevMA.value;
                const maxChange = 100; // 100% 변화를 최대로 가정
                slope = Math.min(1, Math.abs(change) / maxChange);
              }
            }
            maValues.set(period, { value: maValue, slope });
          }
        });

        // 골든크로스 / 데드크로스 감지 (알고리즘 활성 기간에만)
        const prevTimeSeries = symbolTimeSeries[symbolTimeSeries.length - 1];
        if (isAlgoActive && prevTimeSeries) {
          // 매 시점마다 현재 상태 계산 (데드크로스가 우선)
          const currFromMADead = maValues.get(deadCross.from);
          const currToMADead = maValues.get(deadCross.to);
          const currFromMAGolden = maValues.get(goldenCross.from);
          const currToMAGolden = maValues.get(goldenCross.to);

          const prevFromMADead = prevTimeSeries.ma.get(deadCross.from);
          const prevToMADead = prevTimeSeries.ma.get(deadCross.to);
          const prevFromMAGolden = prevTimeSeries.ma.get(goldenCross.from);
          const prevToMAGolden = prevTimeSeries.ma.get(goldenCross.to);

          // 1. 데드크로스 상태 체크 (우선순위 1)
          if (currFromMADead && currToMADead) {
            if (currFromMADead.value < currToMADead.value) {
              // 현재 데드크로스 상태
              const prevState = symbolCrossState.get(symbol);

              // 데드크로스 진입 (이전에 데드가 아니었는데 지금 데드)
              if (prevState !== 'DEAD') {
                const timeStr = `${currentTime.getHours()}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
                console.log(`  ☠️  DEAD CROSS [${timeStr}]: ${symbol} - MA${deadCross.from} (${currFromMADead.value.toFixed(2)}) < MA${deadCross.to} (${currToMADead.value.toFixed(2)})`);

                // 데드크로스 플래그 설정 (차트 표시용)
                isSymbolDeadCross = true;

                // below 조건 체크 (마지노선): from이 below 기준선 아래로 떨어졌는지
                let belowConditionMet = false;
                if (deadCross.below && deadCross.below.length > 0) {
                  for (const belowPeriod of deadCross.below) {
                    const belowMA = maValues.get(belowPeriod);
                    if (belowMA && currFromMADead.value < belowMA.value) {
                      belowConditionMet = true;
                      console.log(`    🚨 BELOW THRESHOLD: MA${deadCross.from} (${currFromMADead.value.toFixed(2)}) < MA${belowPeriod} (${belowMA.value.toFixed(2)}) - FULL SELL!`);
                      break;
                    }
                  }
                }

                // 데드크로스 진입 시 첫 매도 (알고리즘 활성 기간에만)
                if (isAlgoActive && account.holdings.has(symbol)) {
                  const holding = account.holdings.get(symbol)!;
                  
                  // 같은 시점에 매수한 종목은 매도 제외
                  if (holding.buyTime.getTime() === currentTime.getTime()) {
                    console.log(`    ⚠️  Bought at same time, skipping dead cross sell`);
                    return; // 이 심볼은 스킵
                  }
                  
                  const symbolData = symbols.get(symbol);
                  
                  if (symbolData) {
                    const quotesUntilNow = symbolData.quotes.filter(q =>
                      q.date.getTime() <= currentTime.getTime() && q.close !== null && q.close !== undefined
                    );
                    const currentQuote = quotesUntilNow[quotesUntilNow.length - 1];
                    
                    if (currentQuote && currentQuote.close) {
                      const currentPrice = currentQuote.close;
                      const profitRate = (currentPrice - holding.avgPrice) / holding.avgPrice;
                      
                      // 손절 조건 체크 (최우선)
                      if (config.features.stopLoss && profitRate <= config.sell.stopLoss) {
                        console.log(`    🛑 STOP LOSS condition met (${(profitRate * 100).toFixed(2)}%), FULL SELL!`);
                        sellStock(symbol, currentTime, changeRate, volumeStrength, currFromMADead, currToMADead, 'STOP_LOSS', true); // 전량 손절
                      }
                      // below 조건 체크 (마지노선)
                      else if (belowConditionMet) {
                        console.log(`    ✅ Holding detected, FULL SELL due to below threshold`);
                        sellStock(symbol, currentTime, changeRate, volumeStrength, currFromMADead, currToMADead, 'DEAD_CROSS_BELOW', true); // 전량 매도
                      }
                      // 일반 데드크로스 첫 매도
                      else {
                        console.log(`    ✅ Holding detected, first sell on dead cross entry`);
                        sellStock(symbol, currentTime, changeRate, volumeStrength, currFromMADead, currToMADead, 'DEAD_CROSS');
                      }
                      
                      // 마지막 매도 가격 기록
                      symbolLastSellPrice.set(symbol, currentPrice);
                    }
                  }
                }
              } else {
                // 데드크로스 상태 유지 중 (알고리즘 활성 기간에만 매도)
                
                // 먼저 below 조건 체크 (마지노선): from이 below 기준선 아래로 떨어졌는지
                let belowConditionMet = false;
                if (isAlgoActive && deadCross.below && deadCross.below.length > 0 && account.holdings.has(symbol)) {
                  for (const belowPeriod of deadCross.below) {
                    const belowMA = maValues.get(belowPeriod);
                    if (belowMA && currFromMADead.value < belowMA.value) {
                      // 이전에는 위였는데 지금 아래로 떨어졌는지 확인
                      const prevFromMA = prevTimeSeries.ma.get(deadCross.from);
                      const prevBelowMA = prevTimeSeries.ma.get(belowPeriod);
                      
                      if (prevFromMA && prevBelowMA && prevFromMA.value >= prevBelowMA.value) {
                        belowConditionMet = true;
                        const timeStr = `${currentTime.getHours()}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
                        console.log(`    🚨 BELOW THRESHOLD [${timeStr}]: MA${deadCross.from} (${currFromMADead.value.toFixed(2)}) dropped below MA${belowPeriod} (${belowMA.value.toFixed(2)}) - FULL SELL!`);
                        sellStock(symbol, currentTime, changeRate, volumeStrength, currFromMADead, currToMADead, 'DEAD_CROSS_BELOW', true); // 전량 매도
                        break;
                      }
                    }
                  }
                }
                
                // below 조건으로 전량 매도하지 않았으면 추가 하락 체크 (알고리즘 활성 기간에만)
                if (isAlgoActive && !belowConditionMet && config.features.deadCrossAdditionalSell && account.holdings.has(symbol)) {
                  const lastSellPrice = symbolLastSellPrice.get(symbol);
                  
                  if (lastSellPrice) {
                    const symbolData = symbols.get(symbol);
                    if (symbolData) {
                      const quotesUntilNow = symbolData.quotes.filter(q =>
                        q.date.getTime() <= currentTime.getTime() && q.close !== null && q.close !== undefined
                      );
                      const currentQuote = quotesUntilNow[quotesUntilNow.length - 1];
                      
                      if (currentQuote && currentQuote.close) {
                        const currentPrice = currentQuote.close;
                        const priceDecline = (lastSellPrice - currentPrice) / lastSellPrice;
                        
                        // 이전 매도 대비 추가 하락이 threshold 이상이면 추가 매도
                        if (priceDecline >= config.sell.additionalSellThreshold) {
                          const timeStr = `${currentTime.getHours()}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
                          console.log(`    📉 Additional decline detected [${timeStr}]: ${symbol} - ${(priceDecline * 100).toFixed(2)}% down from last sell (${lastSellPrice.toLocaleString()} → ${currentPrice.toLocaleString()})`);
                          console.log(`    ✅ Attempting additional sell`);
                          
                          sellStock(symbol, currentTime, changeRate, volumeStrength, currFromMADead, currToMADead, 'DEAD_CROSS_ADDITIONAL');
                          
                          // 마지막 매도 가격 업데이트
                          symbolLastSellPrice.set(symbol, currentPrice);
                        }
                      }
                    }
                  }
                }
              }

              // 데드크로스 상태로 설정
              symbolCrossState.set(symbol, 'DEAD');
            }
            // 2. 골든크로스 상태 체크 (데드크로스가 아닐 때만)
            else if (currFromMAGolden && currToMAGolden && currFromMAGolden.value > currToMAGolden.value) {
              // 현재 골든크로스 상태
              const prevState = symbolCrossState.get(symbol);
              
              // 골든크로스 진입 여부 플래그
              let isGoldenCrossEntry = false;

              // 골든크로스 진입 (이전에 골든이 아니었는데 지금 골든)
              if (prevState !== 'GOLDEN') {
                isGoldenCrossEntry = true;  // 진입 플래그 설정
                symbolGoldenCycleFirstBuy.set(symbol, false); // 새 골든크로스 사이클 시작 - 아직 매수 안함
                const timeStr = `${currentTime.getHours()}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
                console.log(`  🌟 GOLDEN CROSS [${timeStr}]: ${symbol} - MA${goldenCross.from} (${currFromMAGolden.value.toFixed(2)}) > MA${goldenCross.to} (${currToMAGolden.value.toFixed(2)})`);

                // under 조건 체크
                let underConditionMet = true;
                if (goldenCross.under && goldenCross.under.length > 0) {
                  for (const underPeriod of goldenCross.under) {
                    const underMA = maValues.get(underPeriod);
                    if (underMA && currFromMAGolden.value <= underMA.value) {
                      underConditionMet = false;
                      console.log(`    ⚠️  Under condition failed: MA${goldenCross.from} (${currFromMAGolden.value.toFixed(2)}) <= MA${underPeriod} (${underMA.value.toFixed(2)})`);
                      break;
                    }
                  }
                }

                // 기울기 조건 체크
                let slopeConditionMet = true;
                if (goldenCross.minSlope !== undefined && currFromMAGolden.slope < goldenCross.minSlope) {
                  slopeConditionMet = false;
                  console.log(`    ⚠️  Slope condition failed: MA${goldenCross.from} slope (${currFromMAGolden.slope.toFixed(6)}) < minSlope (${goldenCross.minSlope})`);
                }

                // 모든 조건을 만족할 때만 골든크로스로 인정 (차트 표시용)
                if (underConditionMet && slopeConditionMet) {
                  isSymbolGoldenCross = true;
                  console.log(`    ✅ All golden cross conditions met - marking on chart`);
                } else {
                  console.log(`    ⚠️  Golden cross conditions not met - not marking on chart`);
                }
                
                // 마지막 매도 가격 초기화 (골든크로스로 전환되면 리셋)
                symbolLastSellPrice.delete(symbol);
              }

              // 골든크로스 상태로 설정
              symbolCrossState.set(symbol, 'GOLDEN');

              // 매수 조건 체크 (알고리즘 활성 기간에만)
              // pyramiding이 활성화되어 있으면 보유 중이어도 매수 시도
              const canBuy = isAlgoActive && (!account.holdings.has(symbol) || config.features.pyramiding);
              
              if (canBuy) {
                // under 조건 체크
                let underConditionMet = true;
                if (goldenCross.under && goldenCross.under.length > 0) {
                  for (const underPeriod of goldenCross.under) {
                    const underMA = maValues.get(underPeriod);
                    if (underMA && currFromMAGolden.value <= underMA.value) {
                      underConditionMet = false;
                      console.log(`    ⚠️  Under condition failed: MA${goldenCross.from} (${currFromMAGolden.value.toFixed(2)}) <= MA${underPeriod} (${underMA.value.toFixed(2)})`);
                      break;
                    }
                  }
                }

                // 기울기 조건 체크
                let slopeConditionMet = true;
                if (goldenCross.minSlope !== undefined && currFromMAGolden.slope < goldenCross.minSlope) {
                  slopeConditionMet = false;
                  console.log(`    ⚠️  Slope condition failed: MA${goldenCross.from} slope (${currFromMAGolden.slope.toFixed(6)}) < minSlope (${goldenCross.minSlope})`);
                }

                // 조건이 충족되면 매수 시도
                if (underConditionMet && slopeConditionMet) {
                  // 이전에 조건 불만족이었는지 확인 (중복 매수 방지)
                  let shouldBuy = false;

                  // prevState가 undefined이거나 GOLDEN이 아닌 경우 (골든크로스 진입 또는 첫 시작)
                  if (isGoldenCrossEntry) {
                    // 골든크로스 진입 시점 - 조건 만족하면 매수
                    shouldBuy = true;
                    // 골든크로스 진입 시 조건 만족하면 차트에 G 마크 표시 (이미 설정되어 있으면 유지)
                    if (!isSymbolGoldenCross) {
                      isSymbolGoldenCross = true;
                      console.log(`    ✅ Golden cross entry with conditions met - marking on chart`);
                    }
                  } else if (prevFromMAGolden && prevToMAGolden) {
                    // 골든크로스 유지 중
                    
                    // 현재 상태가 골든크로스인지 확인 (데드크로스 상태에서는 재매수 안함)
                    const currentState = symbolCrossState.get(symbol);
                    
                    // 케이스 1: 보유하지 않음 (익절/손절 후) → 재매수 (골든크로스 상태일 때만)
                    if (!account.holdings.has(symbol) && currentState === 'GOLDEN') {
                      // 이번 시점에 판 종목은 재매수 안함 (다음 시점에 재매수)
                      if (soldSymbolsThisTime.has(symbol)) {
                        const timeStr = `${currentTime.getHours()}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
                        console.log(`  ⏸️  SKIP RE-BUY [${timeStr}]: ${symbol} - Sold in this time point, will re-buy next time if still in golden cross`);
                      } else {
                        shouldBuy = true;
                        const timeStr = `${currentTime.getHours()}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
                        
                        // 골든크로스 사이클에서 첫 매수인 경우 (G 마크는 진입 시점에만 표시)
                        const hasFirstBuyInCycle = symbolGoldenCycleFirstBuy.get(symbol) || false;
                        if (!hasFirstBuyInCycle) {
                          console.log(`  🔄 RE-BUY OPPORTUNITY [${timeStr}]: ${symbol} - First buy in golden cross cycle (label: "b")`);
                        } else {
                          console.log(`  🔄 RE-BUY OPPORTUNITY [${timeStr}]: ${symbol} - No holdings in golden cross state (RE-BUY, label: "!b")`);
                        }
                      }
                    }
                    // 케이스 2: 이전에 조건 불만족이었다가 지금 만족 (피라미딩)
                    else {
                      let prevUnderConditionMet = true;
                      if (goldenCross.under && goldenCross.under.length > 0) {
                        for (const underPeriod of goldenCross.under) {
                          const prevUnderMA = prevTimeSeries.ma.get(underPeriod);
                          if (prevUnderMA && prevFromMAGolden.value <= prevUnderMA.value) {
                            prevUnderConditionMet = false;
                            break;
                          }
                        }
                      }

                      let prevSlopeConditionMet = true;
                      if (goldenCross.minSlope !== undefined && prevFromMAGolden.slope < goldenCross.minSlope) {
                        prevSlopeConditionMet = false;
                      }

                      if (!prevUnderConditionMet || !prevSlopeConditionMet) {
                        shouldBuy = true;
                        const timeStr = `${currentTime.getHours()}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
                        console.log(`  ✨ CONDITIONS MET [${timeStr}]: ${symbol} - Conditions satisfied while in golden cross state`);
                        
                        // 골든크로스 사이클에서 첫 매수인 경우 (G 마크는 진입 시점에만 표시)
                        const hasFirstBuyInCycle = symbolGoldenCycleFirstBuy.get(symbol) || false;
                        if (!hasFirstBuyInCycle) {
                          console.log(`    ✅ First buy in golden cross cycle`);
                        }
                        // 피라미딩은 골든크로스 마크 표시 안 함
                      }
                    }
                  }

                  if (shouldBuy) {
                    // 이번 시점에 이미 매수한 종목은 스킵 (중복 매수 방지)
                    if (boughtSymbolsThisTime.has(symbol)) {
                      const timeStr = `${currentTime.getHours()}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
                      console.log(`  ⏭️  SKIP BUY [${timeStr}]: ${symbol} - Already bought in this time point`);
                    } else {
                      // 종목이 속한 그룹 찾기
                      const symbolGroup = groups.find(g => g.symbols.includes(symbol));
                      if (symbolGroup) {
                        // 재매수 여부 판단:
                        // - 골든크로스 사이클에서 첫 매수: isReBuy: false (라벨 "b")
                        // - 골든크로스 사이클에서 재매수: isReBuy: true (라벨 "!b")
                        const hasFirstBuyInCycle = symbolGoldenCycleFirstBuy.get(symbol) || false;
                        const isReBuy = hasFirstBuyInCycle && !account.holdings.has(symbol);
                        
                        let bought = false;
                        if (config.features.onlySymbolGoldenCross) {
                          console.log(`    ✅ onlySymbolGoldenCross enabled, attempting buy without group check (isReBuy: ${isReBuy}, hasFirstBuy: ${hasFirstBuyInCycle}, isGoldenCrossEntry: ${isGoldenCrossEntry})`);
                          bought = buyStock(symbol, symbolGroup, currentTime, changeRate, volumeStrength, currFromMAGolden, currToMAGolden, obvSlope, rsi || undefined, macd || undefined, bollingerBands || undefined, volumeAnalysis, isReBuy, isGoldenCrossEntry);
                        } else {
                          if (buyableGroups.has(symbolGroup.group)) {
                            console.log(`    ✅ Group ${symbolGroup.label} is in buyable list, attempting buy (isReBuy: ${isReBuy}, hasFirstBuy: ${hasFirstBuyInCycle}, isGoldenCrossEntry: ${isGoldenCrossEntry})`);
                            bought = buyStock(symbol, symbolGroup, currentTime, changeRate, volumeStrength, currFromMAGolden, currToMAGolden, obvSlope, rsi || undefined, macd || undefined, bollingerBands || undefined, volumeAnalysis, isReBuy, isGoldenCrossEntry);
                          } else {
                            console.log(`    ⚠️  Group ${symbolGroup.label} is NOT in buyable list, skipping buy`);
                          }
                        }
                        
                        // 매수 성공 시 이번 시점 매수 목록에 추가 + 골든크로스 사이클 첫 매수 플래그 설정
                        if (bought) {
                          boughtSymbolsThisTime.add(symbol);
                          symbolGoldenCycleFirstBuy.set(symbol, true); // 이 골든크로스 사이클에서 매수했음
                        }
                      }
                    }
                  }
                }
              }
            }
            // 3. 중립 상태 (골든도 데드도 아님)
            else {
              symbolCrossState.set(symbol, 'NONE');
            }
          }
        }

        // 심볼별 시계열 데이터 저장
        if (isSymbolGoldenCross) {
          console.log(`  📊 [DEBUG] ${symbol}: Saving goldenCross=true to timeSeries at ${currentTime.toISOString()}`);
        }
        if (isSymbolDeadCross) {
          console.log(`  📊 [DEBUG] ${symbol}: Saving deadCross=true to timeSeries at ${currentTime.toISOString()}`);
        }

        symbolTimeSeriesMap.get(symbol)?.push({
          time: new Date(currentTime),
          avgChangeRate: changeRate,
          avgVolumeStrength: volumeStrength,
          ma: maValues,
          obv,
          obvSlope,
          rsi: rsi || undefined,
          macd: macd || undefined,
          bollingerBands: bollingerBands || undefined,
          volumeAnalysis: volumeAnalysis,
          goldenCross: isSymbolGoldenCross, // 골든크로스 발생 시점에만 true
          deadCross: isSymbolDeadCross // 데드크로스 발생 시점에만 true
        });

        console.log(`  ${symbol}: ${changeRate >= 0 ? '+' : ''}${changeRate.toFixed(2)}% | Vol: ${volumeStrength >= 0 ? '+' : ''}${volumeStrength.toFixed(1)}% (${currentVolume.toLocaleString()})`);
      });

      // 그룹 전체 평균
      if (validSymbolCount > 0) {
        const avgChangeRate = totalChangeRate / validSymbolCount;
        const avgVolumeStrength = totalVolumeStrength / validSymbolCount;
        console.log(`  ✨ Group Average: ${avgChangeRate >= 0 ? '+' : ''}${avgChangeRate.toFixed(2)}% | Vol: ${avgVolumeStrength >= 0 ? '+' : ''}${avgVolumeStrength.toFixed(1)}%`);

        // 그룹 이동평균선 계산
        const groupTimeSeries = groupTimeSeriesMap.get(group.group)!;
        const groupChangeRates = groupTimeSeries.map(t => t.avgChangeRate);
        groupChangeRates.push(avgChangeRate); // 현재 값 추가

        const currentIndex = groupChangeRates.length - 1;
        const maValues = new Map<number, { value: number, slope: number }>();

        let isGoldenCross = false;
        let isDeadCross = false;

        allMAPeriods.forEach(period => {
          const maValue = calculateMA(groupChangeRates, period, currentIndex);
          if (maValue !== null) {
            // 기울기 계산: 이전 MA값 대비 변화를 0~1로 정규화 (1 = 100% 변화)
            let slope = 0;
            const prevGroupTimeSeries = groupTimeSeries[groupTimeSeries.length - 1];
            if (prevGroupTimeSeries) {
              const prevMA = prevGroupTimeSeries.ma.get(period);
              if (prevMA) {
                const change = maValue - prevMA.value;
                const maxChange = 100; // 100% 변화를 최대로 가정
                slope = Math.min(1, Math.abs(change) / maxChange);
              }
            }
            maValues.set(period, { value: maValue, slope });
          }
        });

        // 골든크로스 / 데드크로스 감지 (그룹) - 화이트리스트 관리 (알고리즘 활성 기간에만)
        const prevGroupTimeSeries = groupTimeSeries[groupTimeSeries.length - 1];
        if (isAlgoActive && prevGroupTimeSeries) {
          // 골든크로스 체크
          const prevFromMAGolden = prevGroupTimeSeries.ma.get(goldenCross.from);
          const prevToMAGolden = prevGroupTimeSeries.ma.get(goldenCross.to);
          const currFromMAGolden = maValues.get(goldenCross.from);
          const currToMAGolden = maValues.get(goldenCross.to);

          if (prevFromMAGolden && prevToMAGolden && currFromMAGolden && currToMAGolden) {
            // 골든크로스: 이전에는 아래였는데 지금은 위로
            if (prevFromMAGolden.value <= prevToMAGolden.value && currFromMAGolden.value > currToMAGolden.value) {
              const timeStr = `${currentTime.getHours()}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
              console.log(`  🌟 GOLDEN CROSS (GROUP) [${timeStr}]: ${group.label} - MA${goldenCross.from} crossed above MA${goldenCross.to}`);

              // 화이트리스트에 추가
              buyableGroups.add(group.group);
              console.log(`    ✅ Added to buyable groups (total: ${buyableGroups.size})`);

              // 골든크로스 표시
              isGoldenCross = true;

              // 그룹 골든크로스 발생 시, 이미 골든크로스 상태인 심볼들 매수 (알고리즘 활성 기간에만)
              if (isAlgoActive) {
                console.log(`    🔍 Checking for symbols already in golden cross state...`);
              const symbolsToBuy: { symbol: string, changeRate: number, volumeStrength: number, fromMA: { value: number, slope: number }, toMA: { value: number, slope: number }, obvSlope: number, rsi?: number, macd?: { macd: number, signal: number, histogram: number }, bollingerBands?: { upper: number, middle: number, lower: number, percentB: number }, volumeAnalysis?: { volumeTrend: 'increasing' | 'decreasing' | 'neutral', priceVolumeDivergence: boolean }, score: number }[] = [];

              group.symbols.forEach(symbol => {
                console.log(`      🔎 Checking symbol: ${symbol}`);
                const symbolTimeSeries = symbolTimeSeriesMap.get(symbol);
                if (!symbolTimeSeries || symbolTimeSeries.length === 0) {
                  console.log(`        ❌ No time series data for ${symbol}`);
                  return;
                }

                console.log(`        ✓ Time series length: ${symbolTimeSeries.length}`);

                // 현재 시점의 심볼 데이터
                const currentSymbolData = symbolTimeSeries[symbolTimeSeries.length - 1];
                const fromMA = currentSymbolData.ma.get(goldenCross.from);
                const toMA = currentSymbolData.ma.get(goldenCross.to);

                console.log(`        MA${goldenCross.from}: ${fromMA?.value.toFixed(4) || 'N/A'}, MA${goldenCross.to}: ${toMA?.value.toFixed(4) || 'N/A'}`);

                // 이미 골든크로스 상태인지 확인 (from이 to보다 위에 있음)
                if (fromMA && toMA && fromMA.value > toMA.value) {
                  console.log(`        ✓ ${symbol} is already in golden cross state (MA${goldenCross.from}: ${fromMA.value.toFixed(4)}% > MA${goldenCross.to}: ${toMA.value.toFixed(4)}%)`);

                  // 데드크로스 상태이면 매수 안함
                  const currentState = symbolCrossState.get(symbol);
                  if (currentState === 'DEAD') {
                    console.log(`        ❌ ${symbol} is in DEAD CROSS state, skipping`);
                    return;
                  }

                  // under 조건 체크 (옵셔널)
                  let underConditionMet = true;
                  if (goldenCross.under && goldenCross.under.length > 0) {
                    for (const underPeriod of goldenCross.under) {
                      const underMA = currentSymbolData.ma.get(underPeriod);
                      if (underMA) {
                        if (fromMA.value <= underMA.value) {
                          underConditionMet = false;
                          console.log(`        ⚠️  Under condition failed: MA${goldenCross.from} (${fromMA.value.toFixed(4)}%) is NOT above MA${underPeriod} (${underMA.value.toFixed(4)}%)`);
                          break;
                        } else {
                          console.log(`        ✅ Under condition met: MA${goldenCross.from} (${fromMA.value.toFixed(4)}%) is above MA${underPeriod} (${underMA.value.toFixed(4)}%)`);
                        }
                      }
                    }
                  }

                  // 기울기 조건 체크 (옵셔널)
                  let slopeConditionMet = true;
                  if (goldenCross.minSlope !== undefined) {
                    if (fromMA.slope < goldenCross.minSlope) {
                      slopeConditionMet = false;
                      console.log(`        ⚠️  Slope condition failed: MA${goldenCross.from} slope (${fromMA.slope.toFixed(3)}) is below minimum (${goldenCross.minSlope})`);
                    } else {
                      console.log(`        ✅ Slope condition met: MA${goldenCross.from} slope (${fromMA.slope.toFixed(3)}) >= ${goldenCross.minSlope}`);
                    }
                  }

                  if (!underConditionMet || !slopeConditionMet) {
                    console.log(`        ❌ Skipping due to conditions not met`);
                    return;
                  }

                  // 이미 보유 중이면 스킵 (pyramiding이 비활성화된 경우)
                  if (account.holdings.has(symbol) && !config.features.pyramiding) {
                    console.log(`        ⚠️  Already holding ${symbol}, skipping (pyramiding disabled)`);
                    return;
                  }

                  // 점수 계산
                  let score = 0;
                  if (config.features.slopeFilter) {
                    score += fromMA.slope * config.scoreWeights.slope;
                  }
                  if (config.features.volumeStrengthFilter) {
                    score += currentSymbolData.avgVolumeStrength * config.scoreWeights.volume;
                  }
                  if (config.features.maGapFilter) {
                    const maGap = (fromMA.value - toMA.value) / Math.abs(toMA.value);
                    score += (1 - maGap) * config.scoreWeights.maGap * 100; // 간격이 좁을수록 높은 점수
                  }

                  console.log(`        ✓ Adding to buy list with score: ${score.toFixed(2)}`);

                  symbolsToBuy.push({
                    symbol,
                    changeRate: currentSymbolData.avgChangeRate,
                    volumeStrength: currentSymbolData.avgVolumeStrength,
                    fromMA,
                    toMA,
                    obvSlope: currentSymbolData.obvSlope || 0,
                    rsi: currentSymbolData.rsi,
                    macd: currentSymbolData.macd,
                    bollingerBands: currentSymbolData.bollingerBands,
                    volumeAnalysis: currentSymbolData.volumeAnalysis,
                    score
                  });
                } else {
                  console.log(`        ❌ ${symbol} is NOT in golden cross state`);
                }
              });

              // 점수 순으로 정렬하여 상위 N개 매수
              if (symbolsToBuy.length > 0) {
                symbolsToBuy.sort((a, b) => b.score - a.score);
                const topSymbols = symbolsToBuy.slice(0, config.buy.symbolSize);

                console.log(`    📈 Buying top ${topSymbols.length} symbols already in golden cross:`);
                topSymbols.forEach(item => {
                  // 이번 시점에 이미 매수한 종목은 스킵 (중복 매수 방지)
                  if (boughtSymbolsThisTime.has(item.symbol)) {
                    console.log(`      ⏭️  Skipping ${item.symbol} - Already bought in this time point`);
                    return;
                  }
                  
                  // 그룹 골든크로스 매수는 피라미딩이므로 isReBuy: false
                  const bought = buyStock(item.symbol, group, currentTime, item.changeRate, item.volumeStrength, item.fromMA, item.toMA, item.obvSlope, item.rsi, item.macd, item.bollingerBands, item.volumeAnalysis, false);
                  
                  // 매수 성공 시 이번 시점 매수 목록에 추가
                  if (bought) {
                    boughtSymbolsThisTime.add(item.symbol);
                  }
                });
              } else {
                console.log(`    ⚠️  No symbols in golden cross state found`);
              }
              } else {
                console.log(`    ⏸️  Skipping group golden cross buy - Algorithm not active yet`);
              }
            }
          }

          // 데드크로스 체크
          const prevFromMADead = prevGroupTimeSeries.ma.get(deadCross.from);
          const prevToMADead = prevGroupTimeSeries.ma.get(deadCross.to);
          const currFromMADead = maValues.get(deadCross.from);
          const currToMADead = maValues.get(deadCross.to);

          if (prevFromMADead && prevToMADead && currFromMADead && currToMADead) {
            // 데드크로스: 이전에는 위였는데 지금은 아래로
            if (prevFromMADead.value >= prevToMADead.value && currFromMADead.value < currToMADead.value) {
              const timeStr = `${currentTime.getHours()}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
              console.log(`  ☠️  DEAD CROSS (GROUP) [${timeStr}]: ${group.label} - MA${deadCross.from} crossed below MA${deadCross.to}`);

              // 화이트리스트에서 제거
              if (buyableGroups.has(group.group)) {
                buyableGroups.delete(group.group);
                console.log(`    ❌ Removed from buyable groups (total: ${buyableGroups.size})`);
              }

              // 데드크로스 표시
              isDeadCross = true;
            }
          }
        }

        // 시계열 데이터 저장
        groupTimeSeriesMap.get(group.group)?.push({
          time: new Date(currentTime),
          avgChangeRate,
          avgVolumeStrength,
          ma: maValues,
          goldenCross: isGoldenCross,
          deadCross: isDeadCross
        });
      }
    });

    // 다음 시간으로 이동
    currentTime = new Date(currentTime.getTime() + interval);
    // 500ms 대기
    // await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Simulation completed');

  // 최종 결과 출력
  console.log('\n' + '='.repeat(60));
  console.log('📊 TRADING SUMMARY');
  console.log('='.repeat(60));
  console.log(`Initial Balance: ${INITIAL_BALANCE.toLocaleString()}원`);
  console.log(`Final Balance: ${account.balance.toLocaleString()}원`);

  // 보유 종목 평가
  let holdingsValue = 0;
  if (account.holdings.size > 0) {
    console.log(`\n📦 Current Holdings:`);
    account.holdings.forEach((holding, symbol) => {
      const symbolData = symbols.get(symbol);
      if (symbolData) {
        const lastQuote = symbolData.quotes[symbolData.quotes.length - 1];
        if (lastQuote && lastQuote.close) {
          const currentValue = lastQuote.close * holding.quantity;
          const profit = (lastQuote.close - holding.avgPrice) * holding.quantity;
          holdingsValue += currentValue;
          const label = tickerLabelMap.get(symbol) || symbol;
          console.log(`  ${label} (${symbol}): ${holding.quantity}주 @ ${holding.avgPrice.toLocaleString()}원 → 현재 ${lastQuote.close.toLocaleString()}원 (평가손익: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()}원)`);
        }
      }
    });
  }

  const totalAssets = account.balance + holdingsValue;
  const totalProfit = totalAssets - INITIAL_BALANCE;
  const returnRate = (totalProfit / INITIAL_BALANCE) * 100;

  console.log(`\nHoldings Value: ${holdingsValue.toLocaleString()}원`);
  console.log(`\nbalance Value: ${account.balance.toLocaleString()}원`);
  console.log(`Total Assets (balance+holding): ${totalAssets.toLocaleString()}원`);
  console.log(`Total Profit: ${totalProfit >= 0 ? '+' : ''}${totalProfit.toLocaleString()}원 (${returnRate >= 0 ? '+' : ''}${returnRate.toFixed(2)}%)`);
  console.log(`Total Transactions: ${transactions.length}`);
  console.log('='.repeat(60));

  // 거래 내역 출력
  if (transactions.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('📋 TRANSACTION HISTORY');
    console.log('='.repeat(60));

    transactions.forEach((tx, index) => {
      const timeStr = `${tx.time.getHours()}:${tx.time.getMinutes().toString().padStart(2, '0')}`;
      const label = tickerLabelMap.get(tx.symbol) || tx.symbol;
      const emoji = tx.type === 'BUY' ? '💰' : '💸';
      const typeStr = tx.type === 'BUY' ? 'BUY ' : 'SELL';

      console.log(`${index + 1}. [${timeStr}] ${emoji} ${typeStr} ${label} (${tx.symbol})`);

      if (tx.type === 'BUY') {
        console.log(`   ${tx.quantity}주 @ ${tx.price.toLocaleString()}원 = ${(tx.price * tx.quantity).toLocaleString()}원 (수수료: ${tx.fees.toLocaleString()}원)`);
      } else {
        // 매도 시 손익 표시
        const profitStr = tx.profit !== undefined ?
          `${tx.profit >= 0 ? '+' : ''}${tx.profit.toLocaleString()}원` :
          '0원';
        const profitRate = tx.avgBuyPrice ?
          ((tx.price - tx.avgBuyPrice) / tx.avgBuyPrice * 100).toFixed(2) :
          '0.00';
        const profitRateStr = `${parseFloat(profitRate) >= 0 ? '+' : ''}${profitRate}%`;

        console.log(`   ${tx.quantity}주 @ ${tx.price.toLocaleString()}원 (매수가: ${tx.avgBuyPrice?.toLocaleString()}원)`);
        console.log(`   손익: ${profitStr} (${profitRateStr}) | 수수료: ${tx.fees.toLocaleString()}원`);
      }
    });

    console.log('='.repeat(60));
  }

  // 그래프 생성
  console.log('\n📈 Generating charts...');

  // 차트 컨텍스트 생성
  const chartCtx: ChartContext = {
    maPeriods,
    dataPlan,
    symbols
  };

  // 각 그룹별 차트 생성
  groups.forEach(group => {
    const timeSeries = groupTimeSeriesMap.get(group.group);
    if (timeSeries) {
      // 알고리즘 시작일부터 필터링
      const filteredTimeSeries = timeSeries.filter(t => t.time.getTime() >= algoStartDate.getTime());
      createChart(chartCtx, group.label, filteredTimeSeries, `group-${group.group}.png`);
    }
  });

  // 각 심볼별 차트 생성
  console.log('\n📊 Generating symbol charts...');
  symbolTimeSeriesMap.forEach((timeSeries, symbol) => {
    if (timeSeries && timeSeries.length > 0) {
      // 알고리즘 시작일부터 필터링
      const filteredTimeSeries = timeSeries.filter(t => t.time.getTime() >= algoStartDate.getTime());
      const symbolTxs = symbolTransactionsMap.get(symbol) || [];
      const label = tickerLabelMap.get(symbol) || symbol;
      const title = `${label} (${symbol})`;
      createChart(chartCtx, title, filteredTimeSeries, `symbol-${symbol}.png`, symbolTxs);
    }
  });

  console.log('✅ All charts generated');
};

const dataPlan: DataPlan = {
  interval: '1d',
  dataFrom: '2025-04-01',  // 데이터 수집 시작 (MA50 계산을 위해 1개월 더 일찍)
  dataTo: '2026-01-02',    // 데이터 수집 종료
  algoFrom: '2025-11-01',  // 알고리즘 실행 시작
  algoTo: '2026-01-02'     // 알고리즘 실행 종료
};

export default {
  run: async () => {
    console.log('Finance algorithms run');
    await load5MinuteCharts(dataPlan);
    await algorithms(dataPlan);
  }
};
