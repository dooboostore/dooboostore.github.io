import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { YahooFinanceBrowser, ChartResult, ChartQuote } from '../service/YahooFinanceBrowserService';
import { createCanvas } from 'canvas';

const QUOTE_DIR = join(__dirname, '../../../../datas/finance/quote');
const CHART_DIR = join(__dirname, '../../../../datas/finance/chart');
const EVENT_DIR = join(__dirname, '../../../../datas/finance/event');
const ITEM_DIR = join(__dirname, '../../../../datas/finance/item');
const OUTPUT_DIR = join(__dirname, '../../../../datas/finance/output');
const TICKERS_PATH = join(__dirname, '../../../../datas/finance/tickers.json');
const GROUPS_PATH = join(__dirname, '../../../../datas/finance/groups.json');
const ITEMS_PATH = join(__dirname, '../../../../datas/finance/items.json');

type DataPlan = {
  interval: string;
  from: string;
  to: string;
};

type Group = {
  group: string;
  label: string;
  symbols: string[];
};

async function load5MinuteCharts(dataPlan: DataPlan) {
  console.log('📊 Starting chart data collection...');
  console.log(`   Interval: ${dataPlan.interval}`);
  console.log(`   From: ${dataPlan.from}`);
  console.log(`   To: ${dataPlan.to}`);

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
  const startDate = new Date(dataPlan.from);
  const endDate = new Date(dataPlan.to);

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
  console.log(`   - Date range: ${dataPlan.from} to ${dataPlan.to}`);
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
  console.log(`   From: ${dataPlan.from}`);
  console.log(`   To: ${dataPlan.to}`);
  
  // Parse dates from dataPlan
  const startDate = new Date(dataPlan.from);
  const endDate = new Date(dataPlan.to);
  
  // Determine time increment based on interval
  let intervalMs: number;
  if (dataPlan.interval === '1m') {
    intervalMs = 1 * 60 * 1000; // 1 minute
  } else if (dataPlan.interval === '5m') {
    intervalMs = 5 * 60 * 1000; // 5 minutes
  } else if (dataPlan.interval === '1d') {
    intervalMs = 24 * 60 * 60 * 1000; // 1 day
  } else {
    // Parse interval like '2m', '15m', '1h', etc.
    const match = dataPlan.interval.match(/^(\d+)([mhd])$/);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];
      if (unit === 'm') {
        intervalMs = value * 60 * 1000;
      } else if (unit === 'h') {
        intervalMs = value * 60 * 60 * 1000;
      } else if (unit === 'd') {
        intervalMs = value * 24 * 60 * 60 * 1000;
      } else {
        intervalMs = 1 * 60 * 1000; // default to 1 minute
      }
    } else {
      intervalMs = 1 * 60 * 1000; // default to 1 minute
    }
  }
  
  const interval = intervalMs;

  // 이동평균선 설정
  const maPeriods: number[] = [5, 10, 20, 50]; // 사용할 이동평균 기간들

  // 골든크로스 / 데드크로스 설정
  const goldenCross = { from: 5, to: 20, under: [50], minSlope: 0.0005 }; // 5일선이 20일선을 상향 돌파, 5일선이 50일선보다 위
  const deadCross = { from: 5, to: 20 };   // 5일선이 20일선을 하향 돌파 (골든크로스와 동일한 기준)

  // 트레이딩 설정
  const config = {
    tradeFees: {
      // buy: 0,      // 매수 수수료 0.015%
      // sell: 0     // 매도 수수료 0.015% + 거래세 0.23% = 0.245%
      buy: 0.00015,      // 매수 수수료 0.015%
      sell: 0.00245,     // 매도 수수료 0.015% + 거래세 0.23% = 0.245%
    },

    // 기능 활성화 플래그
    features: {
      pyramiding: true,           // 피라미딩 (추가 매수)
      stopLoss: false,            // 손절 (데드크로스 상태에서만)
      takeProfit: false,          // 익절 (데드크로스 상태에서만)
      trailingStop: false,        // 트레일링 스톱 (데드크로스 상태에서만)
      timeFilter: false,          // 시간 필터 (9시, 15시 제외)
      maGapFilter: false,         // MA 간격 필터
      consecutiveLossProtection: false, // 연속 손실 방지
      positionSizing: false,      // 자금 관리 (잔고의 10%씩)
      volumeStrengthFilter: false, // 거래량 강도 필터
      slopeFilter: false,         // 기울기 필터
      obvFilter: false,           // OBV 필터
      rsiFilter: false,           // RSI 필터
      macdFilter: false,          // MACD 필터 (모멘텀)
      bollingerBandsFilter: false, // 볼린저 밴드 필터 (변동성)
      volumeAnalysisFilter: false, // 거래량 분석 필터 (강화)
      onlySymbolGoldenCross: true // 심볼 골든크로스만으로 매수 (그룹 골든크로스 무시)
    },

    buy: {
      symbolSize: 2, // 상위 2개 종목 선택 (집중 투자)
      stockRate: 0.01,  // 잔고의 10%씩 투자
      stockSize: 100,  // [DEPRECATED] 고정 주식 수 (stockRate 사용 시 무시됨)
      minVolumeStrength: 50, // 최소 거래량 강도 50% (더 강한 신호)
      minSlope: 0, // 최소 기울기
      maxMaGap: 0.05, // MA 간격 최대 5% (너무 벌어지면 늦음)
      positionSizePercent: 0.1, // 잔고의 10%씩 투자
      minObvSlope: 0, // 최소 OBV 기울기 (양수면 OBV 상승 중)
      minRsi: 30, // 최소 RSI (30 이하면 과매도)
      maxRsi: 70, // 최대 RSI (70 이상이면 과매수, 매수 안함)
      macdBullish: true, // MACD 히스토그램이 양수여야 함 (상승 모멘텀)
      bollingerPosition: 'lower', // 볼린저 밴드 하단 근처에서 매수 ('lower', 'middle', 'upper', 'any')
      minBollingerPercentB: 0.2, // %B 최소값 (0.2 = 하단 20% 위치)
      maxBollingerPercentB: 0.5, // %B 최대값 (0.5 = 중간 위치)
      volumeTrendRequired: 'increasing', // 거래량 추세 ('increasing', 'any')
      avoidPriceVolumeDivergence: true // 가격-거래량 다이버전스 회피
    },
    sell: {
      symbolSize: 3, // 상위 3개 종목 선택 (그룹 데드크로스 시 사용)
      stockRate: 0.5,  // 보유 주식의 50%씩 매도 (0.1 = 10%, 0.5 = 50%, 1.0 = 100%)
      stopLoss: -0.02, // -2% 손절
      takeProfit: 0.03, // +3% 익절
      trailingStopPercent: 0.02 // 최고가 대비 -2% 트레일링 스톱
    },
    timeFilter: {
      excludeHours: [9, 15] // 9시대, 15시대 거래 제외 (변동성 큼)
    },
    riskManagement: {
      maxConsecutiveLosses: 3 // 연속 손실 3번 이상이면 거래 중단
    },
    scoreWeights: {
      slope: 0.5,        // 기울기 가중치 50% (증가)
      volume: 0.3,       // 거래량 강도 가중치 30% (감소)
      maGap: 0.2        // MA 간격 가중치 20%
    }
  };

  // 계좌 정보
  const account = {
    balance: 300000000, // 초기 잔고 3억원
    holdings: new Map<string, { quantity: number, avgPrice: number, maxPrice: number }>() // 보유 종목 (종목코드 -> {수량, 평균단가, 최고가})
  };

  // 심볼별 크로스 상태 추적
  const symbolCrossState = new Map<string, 'GOLDEN' | 'DEAD' | 'NONE'>(); // 각 심볼의 현재 크로스 상태

  // 매수 가능 그룹 화이트리스트
  const buyableGroups = new Set<string>(); // 골든크로스 발생한 그룹들

  // 리스크 관리
  let consecutiveLosses = 0; // 연속 손실 횟수
  let tradingPaused = false; // 거래 중단 플래그

  // 거래 내역
  type Transaction = {
    time: Date;
    type: 'BUY' | 'SELL';
    symbol: string;
    quantity: number;
    price: number;
    fees: number;
    total: number;
    avgBuyPrice?: number; // 매도 시 평균 매수가
    profit?: number; // 매도 시 손익
  };
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
    volumeAnalysis?: { volumeTrend: 'increasing' | 'decreasing' | 'neutral', priceVolumeDivergence: boolean }
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

    // 피라미딩 체크 (이미 보유 중인 경우)
    if (holding) {
      if (!config.features.pyramiding) {
        console.log(`    ⚠️  Already holding ${symbol}, pyramiding disabled`);
        return;
      }

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
    } else {
      // 신규 매수
      account.holdings.set(symbol, { quantity, avgPrice: price, maxPrice: price });
    }

    // 거래 내역 저장
    transactions.push({
      time: new Date(currentTime),
      type: 'BUY',
      symbol,
      quantity,
      price,
      fees,
      total
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
      total
    });

    console.log(`    ✅ BUY ${symbol}: ${quantity}주 @ ${price.toLocaleString()}원 (group: ${group.label}, slope: ${fromMA.slope.toFixed(2)}%, vol: ${volumeStrength.toFixed(1)}%, rsi: ${rsi?.toFixed(1) || 'N/A'}, macd: ${macd?.histogram.toFixed(4) || 'N/A'}, bb: ${bollingerBands ? (bollingerBands.percentB * 100).toFixed(1) + '%' : 'N/A'})`);
    console.log(`    💵 Balance: ${account.balance.toLocaleString()}원`);
  };

  // 개별 종목 매도 함수
  const sellStock = (
    symbol: string,
    currentTime: Date,
    changeRate: number,
    volumeStrength: number,
    fromMA: { value: number, slope: number },
    toMA: { value: number, slope: number },
    reason: string = 'DEAD_CROSS'
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
    if (reason === 'STOP_LOSS' || reason === 'TAKE_PROFIT' || reason === 'TRAILING_STOP') {
      // 손절/익절/트레일링스톱은 전량 매도
      quantity = holding.quantity;
    } else {
      // 데드크로스는 stockRate 비율만큼 매도
      quantity = Math.floor(holding.quantity * config.sell.stockRate);
      if (quantity === 0) quantity = 1; // 최소 1주
      if (quantity > holding.quantity) quantity = holding.quantity; // 보유량 초과 방지
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
      profit
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
      profit
    });

    const remainingQty = account.holdings.get(symbol)?.quantity || 0;
    const emoji = reason === 'STOP_LOSS' ? '🛑' : reason === 'TAKE_PROFIT' ? '🎯' : reason === 'TRAILING_STOP' ? '📉' : '☠️';
    const remainingInfo = remainingQty > 0 ? ` (남은 수량: ${remainingQty}주)` : '';
    console.log(`    ${emoji} SELL ${symbol} (${reason}): ${quantity}주 @ ${price.toLocaleString()}원 (profit: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()}원 / ${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}%)${remainingInfo}`);
    console.log(`    💵 Balance: ${account.balance.toLocaleString()}원`);
  };

  // 손절/익절 체크 함수
  const checkStopLossAndTakeProfit = (currentTime: Date) => {
    const toSell: { symbol: string, reason: string, price: number, holding: { quantity: number, avgPrice: number, maxPrice: number } }[] = [];

    account.holdings.forEach((holding, symbol) => {
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

      // ⚠️ 중요: 데드크로스 상태일 때만 손절/익절/트레일링스톱 실행
      const currentState = symbolCrossState.get(symbol);
      if (currentState !== 'DEAD') {
        // 데드크로스 상태가 아니면 손절/익절 안함
        return;
      }

      // 손절 체크 (기능 활성화 시에만)
      if (config.features.stopLoss && profitRate <= config.sell.stopLoss) {
        toSell.push({ symbol, reason: 'STOP_LOSS', price: currentPrice, holding });
      }
      // 익절 체크 (기능 활성화 시에만)
      else if (config.features.takeProfit && profitRate >= config.sell.takeProfit) {
        toSell.push({ symbol, reason: 'TAKE_PROFIT', price: currentPrice, holding });
      }
      // 트레일링 스톱 체크 (최고가 대비) - 기능 활성화 시에만
      else if (config.features.trailingStop) {
        const drawdownFromMax = (currentPrice - holding.maxPrice) / holding.maxPrice;
        if (drawdownFromMax <= -config.sell.trailingStopPercent) {
          toSell.push({ symbol, reason: 'TRAILING_STOP', price: currentPrice, holding });
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
          profit
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
          profit
        });

        const emoji = item.reason === 'STOP_LOSS' ? '🛑' : item.reason === 'TAKE_PROFIT' ? '🎯' : '📉';
        const maxPriceInfo = item.reason === 'TRAILING_STOP' ? ` (max: ${item.holding.maxPrice.toLocaleString()})` : '';
        console.log(`  ${emoji} ${item.reason} ${item.symbol}: ${quantity}주 @ ${price.toLocaleString()}원 (${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}%, profit: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()}원)${maxPriceInfo}`);
      });

      console.log(`  💵 Balance: ${account.balance.toLocaleString()}원`);
    }
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
            return it.date.getTime() >= startDate.getTime() && it.date.getTime() <= endDate.getTime();
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

  // 이동평균 계산 함수
  const calculateMA = (data: number[], period: number, currentIndex: number): number | null => {
    if (currentIndex < period - 1) return null;
    const sum = data.slice(currentIndex - period + 1, currentIndex + 1).reduce((a, b) => a + b, 0);
    return sum / period;
  };

  // RSI 계산 함수
  const calculateRSI = (prices: number[], period: number = 14): number | null => {
    if (prices.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    // 첫 번째 기간의 평균 상승/하락 계산
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  };

  // MACD 계산 함수
  const calculateMACD = (prices: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): { macd: number, signal: number, histogram: number } | null => {
    if (prices.length < slowPeriod + signalPeriod) return null;

    // EMA 계산 함수
    const calculateEMA = (data: number[], period: number): number[] => {
      const ema: number[] = [];
      const multiplier = 2 / (period + 1);

      // 첫 번째 EMA는 SMA로 시작
      let sum = 0;
      for (let i = 0; i < period; i++) {
        sum += data[i];
      }
      ema.push(sum / period);

      // 나머지 EMA 계산
      for (let i = period; i < data.length; i++) {
        ema.push((data[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
      }

      return ema;
    };

    const fastEMA = calculateEMA(prices, fastPeriod);
    const slowEMA = calculateEMA(prices, slowPeriod);

    // MACD 라인 계산
    const macdLine: number[] = [];
    const offset = fastPeriod - slowPeriod;
    for (let i = 0; i < slowEMA.length; i++) {
      macdLine.push(fastEMA[i + offset] - slowEMA[i]);
    }

    // Signal 라인 계산 (MACD의 EMA)
    const signalLine = calculateEMA(macdLine, signalPeriod);

    // 현재 값
    const macd = macdLine[macdLine.length - 1];
    const signal = signalLine[signalLine.length - 1];
    const histogram = macd - signal;

    return { macd, signal, histogram };
  };

  // 볼린저 밴드 계산 함수
  const calculateBollingerBands = (prices: number[], period: number = 20, stdDev: number = 2): { upper: number, middle: number, lower: number, percentB: number } | null => {
    if (prices.length < period) return null;

    // 중간 밴드 (SMA)
    const recentPrices = prices.slice(-period);
    const middle = recentPrices.reduce((a, b) => a + b, 0) / period;

    // 표준편차 계산
    const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - middle, 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);

    // 상단/하단 밴드
    const upper = middle + (stdDev * standardDeviation);
    const lower = middle - (stdDev * standardDeviation);

    // %B 계산 (현재 가격이 밴드 내 어디에 위치하는지)
    const currentPrice = prices[prices.length - 1];
    const percentB = (currentPrice - lower) / (upper - lower);

    return { upper, middle, lower, percentB };
  };

  // 거래량 분석 함수
  const analyzeVolume = (volumes: number[], prices: number[]): { volumeTrend: 'increasing' | 'decreasing' | 'neutral', priceVolumeDivergence: boolean } => {
    if (volumes.length < 10 || prices.length < 10) {
      return { volumeTrend: 'neutral', priceVolumeDivergence: false };
    }

    // 최근 5개와 이전 5개 거래량 비교
    const recentVolumes = volumes.slice(-5);
    const previousVolumes = volumes.slice(-10, -5);

    const recentAvg = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const previousAvg = previousVolumes.reduce((a, b) => a + b, 0) / previousVolumes.length;

    let volumeTrend: 'increasing' | 'decreasing' | 'neutral' = 'neutral';
    if (recentAvg > previousAvg * 1.2) {
      volumeTrend = 'increasing';
    } else if (recentAvg < previousAvg * 0.8) {
      volumeTrend = 'decreasing';
    }

    // 가격-거래량 다이버전스 체크
    const recentPrices = prices.slice(-5);
    const previousPrices = prices.slice(-10, -5);

    const priceIncreasing = recentPrices[recentPrices.length - 1] > previousPrices[previousPrices.length - 1];
    const volumeIncreasing = volumeTrend === 'increasing';

    // 가격은 오르는데 거래량은 줄어들면 다이버전스 (약세 신호)
    const priceVolumeDivergence = priceIncreasing && !volumeIncreasing;

    return { volumeTrend, priceVolumeDivergence };
  };

  let currentTime = new Date(startDate);

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


  while (currentTime <= endDate) {
    console.log(`\n⏰ Current time: ${currentTime.toISOString()}`);

    // 손절/익절 체크 (매 시점마다)
    checkStopLossAndTakeProfit(currentTime);

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

        // 골든크로스 / 데드크로스 감지
        const prevTimeSeries = symbolTimeSeries[symbolTimeSeries.length - 1];
        if (prevTimeSeries) {
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
              }

              // 데드크로스 상태로 설정
              symbolCrossState.set(symbol, 'DEAD');

              // 보유 중인 종목이면 매도
              if (account.holdings.has(symbol)) {
                console.log(`    ✅ Holding detected, attempting sell`);
                sellStock(symbol, currentTime, changeRate, volumeStrength, currFromMADead, currToMADead, 'DEAD_CROSS');
              }
            }
            // 2. 골든크로스 상태 체크 (데드크로스가 아닐 때만)
            else if (currFromMAGolden && currToMAGolden && currFromMAGolden.value > currToMAGolden.value) {
              // 현재 골든크로스 상태
              const prevState = symbolCrossState.get(symbol);

              // 골든크로스 진입 (이전에 골든이 아니었는데 지금 골든)
              if (prevState !== 'GOLDEN') {
                const timeStr = `${currentTime.getHours()}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
                console.log(`  🌟 GOLDEN CROSS [${timeStr}]: ${symbol} - MA${goldenCross.from} (${currFromMAGolden.value.toFixed(2)}) > MA${goldenCross.to} (${currToMAGolden.value.toFixed(2)})`);

                // 골든크로스 플래그 설정 (차트 표시용)
                isSymbolGoldenCross = true;
              }

              // 골든크로스 상태로 설정
              symbolCrossState.set(symbol, 'GOLDEN');

              // 매수 조건 체크
              // pyramiding이 활성화되어 있으면 보유 중이어도 매수 시도
              const canBuy = !account.holdings.has(symbol) || config.features.pyramiding;
              
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

                  if (prevState !== 'GOLDEN') {
                    // 골든크로스 진입 시점 - 조건 만족하면 매수
                    shouldBuy = true;
                  } else if (prevFromMAGolden && prevToMAGolden) {
                    // 골든크로스 유지 중 - 이전에 조건 불만족이었다가 지금 만족하면 매수
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
                      isSymbolGoldenCross = true; // 차트에 표시
                    }
                  }

                  if (shouldBuy) {
                    // 종목이 속한 그룹 찾기
                    const symbolGroup = groups.find(g => g.symbols.includes(symbol));
                    if (symbolGroup) {
                      if (config.features.onlySymbolGoldenCross) {
                        console.log(`    ✅ onlySymbolGoldenCross enabled, attempting buy without group check`);
                        buyStock(symbol, symbolGroup, currentTime, changeRate, volumeStrength, currFromMAGolden, currToMAGolden, obvSlope, rsi || undefined, macd || undefined, bollingerBands || undefined, volumeAnalysis);
                      } else {
                        if (buyableGroups.has(symbolGroup.group)) {
                          console.log(`    ✅ Group ${symbolGroup.label} is in buyable list, attempting buy`);
                          buyStock(symbol, symbolGroup, currentTime, changeRate, volumeStrength, currFromMAGolden, currToMAGolden, obvSlope, rsi || undefined, macd || undefined, bollingerBands || undefined, volumeAnalysis);
                        } else {
                          console.log(`    ⚠️  Group ${symbolGroup.label} is NOT in buyable list, skipping buy`);
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

        // 골든크로스 / 데드크로스 감지 (그룹) - 화이트리스트 관리
        const prevGroupTimeSeries = groupTimeSeries[groupTimeSeries.length - 1];
        if (prevGroupTimeSeries) {
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

              // 그룹 골든크로스 발생 시, 이미 골든크로스 상태인 심볼들 매수
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
                  buyStock(item.symbol, group, currentTime, item.changeRate, item.volumeStrength, item.fromMA, item.toMA, item.obvSlope, item.rsi, item.macd, item.bollingerBands, item.volumeAnalysis);
                });
              } else {
                console.log(`    ⚠️  No symbols in golden cross state found`);
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
  console.log(`Initial Balance: 300,000,000원`);
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
          console.log(`  ${symbol}: ${holding.quantity}주 @ ${holding.avgPrice.toLocaleString()}원 → 현재 ${lastQuote.close.toLocaleString()}원 (평가손익: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()}원)`);
        }
      }
    });
  }

  const totalAssets = account.balance + holdingsValue;
  const totalProfit = totalAssets - 300000000;
  const returnRate = (totalProfit / 300000000) * 100;

  console.log(`\nHoldings Value: ${holdingsValue.toLocaleString()}원`);
  console.log(`Total Assets: ${totalAssets.toLocaleString()}원`);
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

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 차트 생성 공통 함수
  const createChart = (title: string, timeSeries: TimeSeries[], filename: string, symbolTransactions?: Transaction[]) => {
    if (!timeSeries || timeSeries.length === 0) return;

    const width = 1200;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const padding = { top: 60, right: 60, bottom: 60, left: 80 };
    const gap = 40;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = (height - padding.top - padding.bottom - gap) / 2;

    const topChartY = padding.top;
    const bottomChartY = padding.top + chartHeight + gap;

    const changeRates = timeSeries.map(d => d.avgChangeRate);
    const volumeStrengths = timeSeries.map(d => d.avgVolumeStrength);

    // 이미 계산된 이동평균선 값들 추출 (등락률용)
    const changeRateMAData = new Map<number, (number | null)[]>();
    maPeriods.forEach(period => {
      changeRateMAData.set(period, timeSeries.map(t => {
        const ma = t.ma.get(period);
        return ma ? ma.value : null;
      }));
    });

    // 거래량 강도용 이동평균선 계산 (실시간으로 계산)
    const volumeMAData = new Map<number, (number | null)[]>();
    maPeriods.forEach(period => {
      const maValues: (number | null)[] = [];
      for (let i = 0; i < volumeStrengths.length; i++) {
        if (i < period - 1) {
          maValues.push(null);
        } else {
          const sum = volumeStrengths.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
          maValues.push(sum / period);
        }
      }
      volumeMAData.set(period, maValues);
    });

    const minChangeRate = Math.min(...changeRates);
    const maxChangeRate = Math.max(...changeRates);
    const rangeChangeRate = maxChangeRate - minChangeRate;

    const minVolume = Math.min(...volumeStrengths);
    const maxVolume = Math.max(...volumeStrengths);
    const rangeVolume = maxVolume - minVolume;

    // 제목
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, 35);

    // MA 색상 매핑
    const maColors: Record<number, string> = {
      5: '#9C27B0',
      10: '#FF9800',
      20: '#4CAF50',
      50: '#F44336'
    };

    // 범례 (상단 차트)
    ctx.font = '12px Arial';
    let legendX = width - 350;
    const legendY = topChartY + 10;

    ctx.fillStyle = '#2196F3';
    ctx.fillRect(legendX, legendY, 20, 2);
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.fillText('등락률', legendX + 25, legendY + 4);
    legendX += 70;

    maPeriods.forEach(period => {
      ctx.fillStyle = maColors[period] || '#999999';
      ctx.fillRect(legendX, legendY, 15, 2);
      ctx.fillStyle = '#000000';
      ctx.fillText(`MA${period}`, legendX + 20, legendY + 4);
      legendX += 55;
    });

    // 범례 (하단 차트)
    legendX = width - 350;
    const legendY3 = bottomChartY + 10;

    ctx.fillStyle = '#FF5722';
    ctx.fillRect(legendX, legendY3, 20, 2);
    ctx.fillStyle = '#000000';
    ctx.fillText('거래량 강도', legendX + 25, legendY3 + 4);
    legendX += 90;

    maPeriods.forEach(period => {
      ctx.fillStyle = maColors[period] || '#999999';
      ctx.fillRect(legendX, legendY3, 15, 2);
      ctx.fillStyle = '#000000';
      ctx.fillText(`MA${period}`, legendX + 20, legendY3 + 4);
      legendX += 55;
    });

    // ========== 상단 차트: 등락률 ==========

    ctx.strokeStyle = '#e0e0e0';
    ctx.fillStyle = '#2196F3';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 10; i++) {
      const value = minChangeRate + (rangeChangeRate * i / 10);
      const y = topChartY + chartHeight - (chartHeight * i / 10);

      ctx.strokeStyle = '#e0e0e0';
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();

      ctx.fillStyle = '#2196F3';
      ctx.fillText(`${value.toFixed(2)}%`, padding.left - 10, y + 4);
    }

    const zeroY = topChartY + chartHeight - ((0 - minChangeRate) / rangeChangeRate * chartHeight);
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(padding.left + chartWidth, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    const drawLine = (data: (number | null)[], minVal: number, range: number, color: string, lineWidth: number, baseY: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();

      let started = false;
      data.forEach((value, index) => {
        if (value === null) return;

        const x = padding.left + (chartWidth * index / (data.length - 1));
        const y = baseY + chartHeight - ((value - minVal) / range * chartHeight);

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
    };

    // 등락률 이동평균선 그리기 (역순으로 그려서 짧은 기간이 위에 오도록)
    [...maPeriods].reverse().forEach(period => {
      const maValues = changeRateMAData.get(period);
      if (maValues) {
        drawLine(maValues, minChangeRate, rangeChangeRate, maColors[period] || '#999999', 1.5, topChartY);
      }
    });

    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 3;
    ctx.beginPath();

    timeSeries.forEach((data, index) => {
      const x = padding.left + (chartWidth * index / (timeSeries.length - 1));
      const y = topChartY + chartHeight - ((data.avgChangeRate - minChangeRate) / rangeChangeRate * chartHeight);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // ========== 하단 차트: 거래량 강도 ==========

    ctx.strokeStyle = '#e0e0e0';
    ctx.fillStyle = '#FF5722';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 10; i++) {
      const value = minVolume + (rangeVolume * i / 10);
      const y = bottomChartY + chartHeight - (chartHeight * i / 10);

      ctx.strokeStyle = '#e0e0e0';
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();

      ctx.fillStyle = '#FF5722';
      ctx.fillText(`${value.toFixed(1)}%`, padding.left - 10, y + 4);
    }

    const zeroY2 = bottomChartY + chartHeight - ((0 - minVolume) / rangeVolume * chartHeight);
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY2);
    ctx.lineTo(padding.left + chartWidth, zeroY2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 거래량 강도 이동평균선 그리기 (역순으로 그려서 짧은 기간이 위에 오도록)
    [...maPeriods].reverse().forEach(period => {
      const maValues = volumeMAData.get(period);
      if (maValues) {
        drawLine(maValues, minVolume, rangeVolume, maColors[period] || '#999999', 1.5, bottomChartY);
      }
    });

    ctx.strokeStyle = '#FF5722';
    ctx.lineWidth = 3;
    ctx.beginPath();

    timeSeries.forEach((data, index) => {
      const x = padding.left + (chartWidth * index / (timeSeries.length - 1));
      const y = bottomChartY + chartHeight - ((data.avgVolumeStrength - minVolume) / rangeVolume * chartHeight);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // ========== X축 ==========
    ctx.fillStyle = '#666666';
    ctx.textAlign = 'center';
    const timeStep = Math.max(1, Math.floor(timeSeries.length / 10));
    for (let i = 0; i < timeSeries.length; i += timeStep) {
      const x = padding.left + (chartWidth * i / (timeSeries.length - 1));
      const time = timeSeries[i].time;
      
      // interval에 따라 날짜 형식 결정
      let timeStr: string;
      if (dataPlan.interval === '1d') {
        // 일봉: MM/DD 형식
        timeStr = `${(time.getMonth() + 1).toString().padStart(2, '0')}/${time.getDate().toString().padStart(2, '0')}`;
      } else if (dataPlan.interval.includes('h')) {
        // 시간봉: MM/DD HH:00 형식
        timeStr = `${(time.getMonth() + 1).toString().padStart(2, '0')}/${time.getDate().toString().padStart(2, '0')} ${time.getHours()}:00`;
      } else {
        // 분봉: MM/DD HH:MM 형식
        timeStr = `${(time.getMonth() + 1).toString().padStart(2, '0')}/${time.getDate().toString().padStart(2, '0')} ${time.getHours()}:${time.getMinutes().toString().padStart(2, '0')}`;
      }
      
      ctx.fillText(timeStr, x, height - padding.bottom + 20);
    }

    // 등락률 차트 위에 골든크로스/데드크로스 표시 (그룹 또는 심볼)
    if (!symbolTransactions || symbolTransactions.length === 0) {
      // 그룹 차트: 골든크로스/데드크로스 표시 (아래쪽)
      timeSeries.forEach((data, index) => {
        const x = padding.left + (chartWidth * index / (timeSeries.length - 1));

        if (data.goldenCross) {
          // 골든크로스 수직 점선 (초록색)
          ctx.strokeStyle = '#4CAF50';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(x, topChartY);
          ctx.lineTo(x, topChartY + chartHeight);
          ctx.stroke();
          ctx.setLineDash([]);

          // 골든크로스 화살표 (초록색, 차트 하단)
          ctx.fillStyle = '#4CAF50';
          ctx.font = 'bold 24px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('▲', x, topChartY + chartHeight - 5);

          // 'G' 레이블 (화살표 안쪽)
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 10px Arial';
          ctx.fillText('G', x, topChartY + chartHeight - 10);
        }

        if (data.deadCross) {
          // 데드크로스 수직 점선 (빨간색)
          ctx.strokeStyle = '#F44336';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(x, topChartY);
          ctx.lineTo(x, topChartY + chartHeight);
          ctx.stroke();
          ctx.setLineDash([]);

          // 데드크로스 화살표 (빨간색, 차트 하단)
          ctx.fillStyle = '#F44336';
          ctx.font = 'bold 24px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('▼', x, topChartY + chartHeight - 5);

          // 'D' 레이블 (화살표 안쪽)
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 10px Arial';
          ctx.fillText('D', x, topChartY + chartHeight - 10);
        }
      });
    } else {
      // 심볼 차트: 골든크로스/데드크로스 표시 (아래쪽)
      // console.log(`  [CHART DEBUG] ${title}: Checking ${timeSeries.length} data points for crosses`);
      let goldenCount = 0;
      let deadCount = 0;
      
      // First pass: count crosses and log details
      timeSeries.forEach((data, index) => {
        if (data.goldenCross) {
          goldenCount++;
          console.log(`  [CHART DEBUG] ${title}: Golden cross at index ${index}, time: ${data.time.toISOString()}`);
        }
        if (data.deadCross) {
          deadCount++;
          console.log(`  [CHART DEBUG] ${title}: Dead cross at index ${index}, time: ${data.time.toISOString()}`);
        }
      });
      
      console.log(`  [CHART DEBUG] ${title}: Found ${goldenCount} golden crosses, ${deadCount} dead crosses`);
      
      // Second pass: draw arrows
      timeSeries.forEach((data, index) => {
        const x = padding.left + (chartWidth * index / (timeSeries.length - 1));

        if (data.goldenCross) {
          // 골든크로스 수직 점선 (초록색)
          ctx.strokeStyle = '#4CAF50';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(x, topChartY);
          ctx.lineTo(x, topChartY + chartHeight);
          ctx.stroke();
          ctx.setLineDash([]);

          // 골든크로스 화살표 (초록색, 차트 하단)
          ctx.fillStyle = '#4CAF50';
          ctx.font = 'bold 20px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('▲', x, topChartY + chartHeight - 5);

          // 'G' 레이블 (화살표 안쪽)
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 9px Arial';
          ctx.fillText('G', x, topChartY + chartHeight - 9);
        }

        if (data.deadCross) {
          console.log(`  [CHART DEBUG] Drawing dead cross arrow at index ${index}, time: ${data.time.toISOString()}, x: ${x}`);
          
          // 데드크로스 수직 점선 (빨간색)
          ctx.strokeStyle = '#F44336';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(x, topChartY);
          ctx.lineTo(x, topChartY + chartHeight);
          ctx.stroke();
          ctx.setLineDash([]);

          // 데드크로스 화살표 (빨간색, 차트 하단)
          ctx.fillStyle = '#F44336';
          ctx.font = 'bold 20px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('▼', x, topChartY + chartHeight - 5);

          // 'D' 레이블 (화살표 안쪽)
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 9px Arial';
          ctx.fillText('D', x, topChartY + chartHeight - 9);
        }
      });
    }

    // 심볼 차트에 매수/매도 표시 (위쪽)
    if (symbolTransactions && symbolTransactions.length > 0) {
      const startTime = timeSeries[0].time.getTime();
      const endTime = timeSeries[timeSeries.length - 1].time.getTime();
      const timeRange = endTime - startTime;

      symbolTransactions.forEach(tx => {
        const txTime = tx.time.getTime();
        if (txTime < startTime || txTime > endTime) return;

        // X 위치 계산
        const timeOffset = txTime - startTime;
        const xRatio = timeOffset / timeRange;
        const x = padding.left + (chartWidth * xRatio);

        if (tx.type === 'BUY') {
          // 매수 수직 점선 (파란색)
          ctx.strokeStyle = '#2196F3';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(x, topChartY);
          ctx.lineTo(x, topChartY + chartHeight);
          ctx.stroke();
          ctx.setLineDash([]);

          // 매수 화살표 (파란색, 차트 상단)
          ctx.fillStyle = '#2196F3';
          ctx.font = 'bold 24px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('▲', x, topChartY + 20);

          // 'B' 레이블 (화살표 안쪽)
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 10px Arial';
          ctx.fillText('B', x, topChartY + 16);
        } else {
          // 매도 수직 점선 (주황색)
          ctx.strokeStyle = '#FF9800';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(x, topChartY);
          ctx.lineTo(x, topChartY + chartHeight);
          ctx.stroke();
          ctx.setLineDash([]);

          // 매도 화살표 (주황색, 차트 상단)
          ctx.fillStyle = '#FF9800';
          ctx.font = 'bold 24px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('▼', x, topChartY + 20);

          // 'S' 레이블 (화살표 안쪽)
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 10px Arial';
          ctx.fillText('S', x, topChartY + 16);
        }
      });
    }

    // 저장
    const buffer = canvas.toBuffer('image/png');
    const outputPath = join(OUTPUT_DIR, filename);
    writeFileSync(outputPath, buffer);
    console.log(`  💾 Saved chart: ${outputPath}`);
  };

  // 각 그룹별 차트 생성
  groups.forEach(group => {
    const timeSeries = groupTimeSeriesMap.get(group.group);
    if (timeSeries) {
      createChart(group.label, timeSeries, `group-${group.group}.png`);
    }
  });

  // 각 심볼별 차트 생성
  console.log('\n📊 Generating symbol charts...');
  symbolTimeSeriesMap.forEach((timeSeries, symbol) => {
    if (timeSeries && timeSeries.length > 0) {
      const symbolTxs = symbolTransactionsMap.get(symbol) || [];
      const label = tickerLabelMap.get(symbol) || symbol;
      const title = `${label} (${symbol})`;
      createChart(title, timeSeries, `symbol-${symbol}.png`, symbolTxs);
    }
  });

  console.log('✅ All charts generated');
};

const dataPlan: DataPlan = {
  interval: '1d',
  from: '2025-05-01',
  to: '2025-12-31'
};

export default {
  run: async () => {
    console.log('Finance algorithms run');
    await load5MinuteCharts(dataPlan);
    await algorithms(dataPlan);
  }
};
