import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { YahooFinanceBrowser, ChartResult, ChartQuote } from '../service/YahooFinanceBrowserService';
import { calculateMA, calculateRSI, calculateMACD, calculateBollingerBands, analyzeVolume } from './calc';
import type { DataPlan, Group, Transaction, TimeSeries, CrossState } from './types';
import { User } from './User';
import { createChart, type ChartContext } from './chart';
import { TradeChart, ChartDataPoint } from './TradeChart';

const CHART_DIR = join(__dirname, '../../../../datas/finance/chart');
const TICKERS_PATH = join(__dirname, '../../../../datas/finance/tickers.json');
const GROUPS_PATH = join(__dirname, '../../../../datas/finance/groups.json');

// interval 문자열을 밀리초로 변환
const parseIntervalToMs = (interval: string): number => {
  const match = interval.match(/^(\d+)([mhd])$/);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2];
    if (unit === 'm') return value * 60 * 1000;
    if (unit === 'h') return value * 60 * 60 * 1000;
    if (unit === 'd') return value * 24 * 60 * 60 * 1000;
  }
  return 5 * 60 * 1000; // default 5분
};

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

  // 먼저 파일 존재 여부 체크해서 없는 심볼만 필터링
  const intervalDir = join(CHART_DIR, dataPlan.interval);
  const symbolsToFetch: string[] = [];
  let alreadyExistsCount = 0;

  allSymbols.forEach(symbol => {
    const outputPath = join(intervalDir, `${symbol}.json`);
    if (existsSync(outputPath)) {
      alreadyExistsCount++;
    } else {
      symbolsToFetch.push(symbol);
    }
  });

  console.log(`⏭️  Already exists: ${alreadyExistsCount} symbols`);
  console.log(`📥 Need to fetch: ${symbolsToFetch.length} symbols`);

  // 모든 파일이 이미 있으면 바로 리턴
  if (symbolsToFetch.length === 0) {
    console.log('✅ All chart data already exists, skipping fetch');
    return;
  }

  const yahooService = new YahooFinanceBrowser();
  await yahooService.init(); // Initialize browser once

  const startDate = new Date(dataPlan.dataFrom);
  const endDate = new Date(dataPlan.dataTo);

  let processedCount = 0;
  let failedCount = 0;

  // Process in batches for parallel execution
  const BATCH_SIZE = 5; // Process 5 symbols at once

  for (let batchStart = 0; batchStart < symbolsToFetch.length; batchStart += BATCH_SIZE) {
    const batch = symbolsToFetch.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(symbolsToFetch.length / BATCH_SIZE);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Batch ${batchNumber}/${totalBatches}: Processing ${batch.length} symbols in parallel`);
    console.log(`${'='.repeat(60)}`);

    // Process batch in parallel
    const batchPromises = batch.map(async (symbol, index) => {
      const globalIndex = batchStart + index;
      console.log(`[${globalIndex + 1}/${symbolsToFetch.length}] Processing: ${symbol}`);

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
    if (batchStart + BATCH_SIZE < symbolsToFetch.length) {
      const waitTime = 3000; // 3 seconds between batches
      console.log(`\n⏳ Waiting ${waitTime / 1000} seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Chart data collection completed!');
  console.log(`📊 Summary:`);
  console.log(`   - Interval: ${dataPlan.interval}`);
  console.log(`   - Date range: ${dataPlan.dataFrom} to ${dataPlan.dataTo}`);
  console.log(`   - Total symbols: ${allSymbols.size}`);
  console.log(`   - Already exists: ${alreadyExistsCount}`);
  console.log(`   - Processed: ${processedCount}`);
  console.log(`   - Failed: ${failedCount}`);
  console.log('='.repeat(60));

  // Close browser
  await yahooService.close();
}

const algorithms = async (dataPlan: DataPlan, user: User) => {
  const account = user.account;
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

  // User에서 설정 가져오기
  const maPeriods = user.maPeriods;
  const goldenCross = user.goldenCross;
  const deadCross = user.deadCross;
  const config = user.config;


  // 전처리
  const groups = user.groups;
  const tickers: { symbol: string; label: string }[] = JSON.parse(readFileSync(TICKERS_PATH, 'utf-8'));
  
  // 필요한 모든 MA 기간 (중복 제거)
  const allMAPeriods = Array.from(new Set([
    ...user.maPeriods,
    user.goldenCross.from,
    user.goldenCross.to,
    ...(user.goldenCross.under || []),
    user.deadCross.from,
    user.deadCross.to,
    ...(user.deadCross.below || [])
  ])).sort((a, b) => a - b);

  // 확장된 Quote 타입
  type ExtendedQuote = ChartQuote & {
    priceChangeRate: number;  // 종가 등락률 (close 기준)
    openChangeRate: number;   // 시가 등락률
    highChangeRate: number;   // 고가 등락률
    lowChangeRate: number;    // 저가 등락률
    volumeChangeRate: number; // 시작 거래량 대비 등락률
    priceMA: Map<number, number>;  // 가격 등락률 이평선
    volumeMA: Map<number, number>; // 거래량 등락률 이평선
  };

  type SymbolData = { label: string, open: number; openVolume: number; isGroup: boolean; quotes: ExtendedQuote[] };
  const symbols = new Map<string, SymbolData>();
  
  user.getSymbolsInGroup()
    .filter(it => !symbols.has(it))
    .forEach(symbol => {
      const chartPath = join(CHART_DIR, dataPlan.interval, `${symbol}.json`);
      if (existsSync(chartPath)) {
        const chartData: ChartResult = JSON.parse(readFileSync(chartPath, 'utf-8'));
        const allQuotes = chartData.quotes
          .map(it => {
            const ait = it as unknown as Omit<ChartQuote, 'date'> & { date: string };
            return {
              ...it,
              date: new Date(ait.date)
            };
          })
          .filter(it => {
            // 전체 데이터 로드 (dataFrom ~ dataTo) + close가 null이 아닌 것만
            return it.date.getTime() >= dataStartDate.getTime() && 
                   it.date.getTime() <= dataEndDate.getTime() &&
                   it.close !== null && it.close !== undefined;
          });
        
        // 연속 중복 데이터 제거 (같은 close, volume 값이 연속되면 첫 번째만 유지)
        const filteredQuotes = allQuotes.filter((quote, index) => {
          if (index === 0) return true;
          const prevQuote = allQuotes[index - 1];
          return !(quote.close === prevQuote.close && quote.volume === prevQuote.volume);
        });

        if (filteredQuotes.length) {
          const openPrice = filteredQuotes[0]?.open || 0;
          const openVolume = filteredQuotes[0]?.volume || 0;
          
          // 등락률 배열 계산 (이평선 계산용)
          const priceChangeRates: number[] = [];
          const volumeChangeRates: number[] = [];
          
          // 확장된 quotes 생성
          const quotes: ExtendedQuote[] = filteredQuotes.map((quote, index) => {
            // OHLC 등락률 계산
            const openChangeRate = openPrice > 0 ? (((quote.open || quote.close!) - openPrice) / openPrice) * 100 : 0;
            const highChangeRate = openPrice > 0 ? (((quote.high || quote.close!) - openPrice) / openPrice) * 100 : 0;
            const lowChangeRate = openPrice > 0 ? (((quote.low || quote.close!) - openPrice) / openPrice) * 100 : 0;
            const priceChangeRate = openPrice > 0 ? ((quote.close! - openPrice) / openPrice) * 100 : 0;
            priceChangeRates.push(priceChangeRate);
            
            // 이전 봉 대비 거래량 등락률
            let volumeChangeRate = 0;
            if (index > 0) {
              const prevVolume = filteredQuotes[index - 1].volume || 0;
              const currVolume = quote.volume || 0;
              volumeChangeRate = prevVolume > 0 ? ((currVolume - prevVolume) / prevVolume) * 100 : 0;
            }
            volumeChangeRates.push(volumeChangeRate);
            
            // 이평선 계산
            const priceMA = new Map<number, number>();
            const volumeMA = new Map<number, number>();
            
            allMAPeriods.forEach(period => {
              const priceMaValue = calculateMA(priceChangeRates, period, index);
              if (priceMaValue !== null) {
                priceMA.set(period, priceMaValue);
              }
              
              const volumeMaValue = calculateMA(volumeChangeRates, period, index);
              if (volumeMaValue !== null) {
                volumeMA.set(period, volumeMaValue);
              }
            });
            
            return {
              ...quote,
              openChangeRate,
              highChangeRate,
              lowChangeRate,
              priceChangeRate,
              volumeChangeRate,
              priceMA,
              volumeMA
            };
          });
          
          symbols.set(symbol, {label: tickers.find(t => t.symbol === symbol)?.label || symbol, open: openPrice, openVolume: openVolume, isGroup: false, quotes } );
        }
        console.log(
          `Loaded ${dataPlan.interval} chart for ${symbol}, ${allQuotes.length} -> ${filteredQuotes.length} data points (duplicates removed)`
        );
      } else {
        console.log(`${dataPlan.interval} chart not found for ${symbol}, skipping`);
      }
    });



  // 그룹별 평균 계산
  user.groups.forEach((group) => {
    // 그룹에 속한 심볼들의 데이터 수집
    const groupSymbolsData = group.symbols
      .map(symbol => symbols.get(symbol))
      .filter(data => data !== undefined);
    
    if (groupSymbolsData.length === 0) {
      console.log(`Group ${group.label}: No symbol data found, skipping`);
      return;
    }
    
    // 모든 심볼의 quotes 길이 중 최소값 (동일 시점 맞추기)
    const minQuotesLength = Math.min(...groupSymbolsData.map(d => d.quotes.length));
    
    if (minQuotesLength === 0) {
      console.log(`Group ${group.label}: No quotes found, skipping`);
      return;
    }
    
    // 그룹 평균 quotes 생성
    const groupQuotes: ExtendedQuote[] = [];
    
    for (let i = 0; i < minQuotesLength; i++) {
      // 해당 시점의 모든 심볼 데이터
      const symbolQuotesAtTime = groupSymbolsData.map(d => d.quotes[i]);
      const validQuotes = symbolQuotesAtTime.filter(q => q.close !== null && q.close !== undefined);
      
      if (validQuotes.length === 0) continue;
      
      // 평균 계산
      const avgPriceChangeRate = validQuotes.reduce((sum, q) => sum + q.priceChangeRate, 0) / validQuotes.length;
      const avgVolumeChangeRate = validQuotes.reduce((sum, q) => sum + q.volumeChangeRate, 0) / validQuotes.length;
      
      // 이평선 평균 계산
      const avgPriceMA = new Map<number, number>();
      const avgVolumeMA = new Map<number, number>();
      
      allMAPeriods.forEach(period => {
        // 가격 이평선 평균
        const priceMaValues = validQuotes
          .map(q => q.priceMA.get(period))
          .filter(v => v !== undefined) as number[];
        if (priceMaValues.length > 0) {
          avgPriceMA.set(period, priceMaValues.reduce((a, b) => a + b, 0) / priceMaValues.length);
        }
        
        // 거래량 이평선 평균
        const volumeMaValues = validQuotes
          .map(q => q.volumeMA.get(period))
          .filter(v => v !== undefined) as number[];
        if (volumeMaValues.length > 0) {
          avgVolumeMA.set(period, volumeMaValues.reduce((a, b) => a + b, 0) / volumeMaValues.length);
        }
      });
      
      // 첫 번째 심볼의 시간 정보 사용
      const baseQuote = symbolQuotesAtTime[0];
      
      groupQuotes.push({
        date: baseQuote.date,
        open: 0,  // 그룹은 시작가 의미 없음
        high: 0,
        low: 0,
        close: avgPriceChangeRate,  // 평균 등락률을 close에 저장
        volume: 0,
        openChangeRate: avgPriceChangeRate,  // 그룹은 OHLC 모두 같은 값
        highChangeRate: avgPriceChangeRate,
        lowChangeRate: avgPriceChangeRate,
        priceChangeRate: avgPriceChangeRate,
        volumeChangeRate: avgVolumeChangeRate,
        priceMA: avgPriceMA,
        volumeMA: avgVolumeMA
      });
    }
    
    // 그룹 데이터를 symbols에 추가 (group.group을 키로 사용)
    symbols.set(group.group, {
      label: group.label,
      open: 0,
      openVolume: 0,
      isGroup: true,
      quotes: groupQuotes
    });
    
    console.log(`Group ${group.label}: Created with ${groupQuotes.length} data points (avg of ${groupSymbolsData.length} symbols)`);
  });


  // algoFrom ~ algoTo 기간으로 데이터 필터링 + algoFrom 기준 보정
  const algoSymbols = new Map<string, SymbolData>();
  
  symbols.forEach((symbolData, key) => {
    // algoFrom 직전 데이터 찾기
    const allQuotes = symbolData.quotes;
    let basePrice = 0;
    let baseVolume = 0;
    let basePriceChangeRate = 0;  // 기준 등락률 (보정용)
    let baseVolumeChangeRate = 0;
    
    // algoFrom 직전 데이터의 close를 기준으로
    for (let i = allQuotes.length - 1; i >= 0; i--) {
      if (allQuotes[i].date.getTime() < algoStartDate.getTime()) {
        basePrice = allQuotes[i].close || 0;
        baseVolume = allQuotes[i].volume || 0;
        basePriceChangeRate = allQuotes[i].priceChangeRate;
        baseVolumeChangeRate = allQuotes[i].volumeChangeRate;
        break;
      }
    }
    
    // 직전 데이터가 없으면 첫 번째 데이터의 open 사용
    if (basePrice === 0 && allQuotes.length > 0) {
      const firstAlgoQuote = allQuotes.find(q => q.date.getTime() >= algoStartDate.getTime());
      if (firstAlgoQuote) {
        basePrice = firstAlgoQuote.open || firstAlgoQuote.close || 0;
        baseVolume = firstAlgoQuote.volume || 0;
        basePriceChangeRate = 0;
        baseVolumeChangeRate = 0;
      }
    }
    
    const filteredQuotes = allQuotes.filter(q => 
      q.date.getTime() >= algoStartDate.getTime() && q.date.getTime() <= algoEndDate.getTime()
    );
    
    if (filteredQuotes.length > 0 && basePrice > 0) {
      // 기준가 대비 등락률로 보정 (이평선도 같이 보정)
      // 거래량 등락률은 이전 봉 대비라서 보정 불필요
      const adjustedQuotes = filteredQuotes.map(q => {
        const openChangeRate = ((q.open || q.close!) - basePrice) / basePrice * 100;
        const highChangeRate = ((q.high || q.close!) - basePrice) / basePrice * 100;
        const lowChangeRate = ((q.low || q.close!) - basePrice) / basePrice * 100;
        const priceChangeRate = (q.close! - basePrice) / basePrice * 100;
        
        // 이평선도 같은 기준으로 보정 (기존 값 - 기준 등락률)
        const adjustedPriceMA = new Map<number, number>();
        q.priceMA.forEach((value, period) => {
          adjustedPriceMA.set(period, value - basePriceChangeRate);
        });
        
        return {
          ...q,
          openChangeRate,
          highChangeRate,
          lowChangeRate,
          priceChangeRate,
          // volumeChangeRate는 이전 봉 대비라서 그대로 사용
          priceMA: adjustedPriceMA
          // volumeMA도 그대로 사용
        };
      });
      
      algoSymbols.set(key, {
        ...symbolData,
        quotes: adjustedQuotes
      });
      console.log(`Filtered ${key}: ${symbolData.quotes.length} -> ${filteredQuotes.length} data points (basePrice: ${basePrice})`);
    }
  });


  // 테스트로 그래프 그려보기
  const outputDir = join(__dirname, '../../../../datas/finance/output');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // 각 심볼/그룹별 차트 생성
  algoSymbols.forEach((symbolData, key) => {
    console.log(`Drawing chart for: ${key} (${symbolData.quotes.length} data points)`);
    
    // ChartDataPoint로 변환 (OHLC 캔들 + 거래량)
    const chartData: ChartDataPoint[] = symbolData.quotes.map(q => ({
      time: q.date,
      open: q.openChangeRate,
      high: q.highChangeRate,
      low: q.lowChangeRate,
      close: q.priceChangeRate,
      volume: q.volumeChangeRate,
      ma: q.priceMA
    }));
    
    const chart = new TradeChart()
      .setTitle(`${symbolData.label} ${key} (${symbolData.isGroup ? 'Group' : 'Symbol'})`)
      .setData(chartData)
      .setMAPeriods(user.maPeriods)
      .draw();
    
    const filename = symbolData.isGroup ? `group-${key}.png` : `symbol-${key}.png`;
    writeFileSync(join(outputDir, filename), chart.toBuffer());
    console.log(`Chart saved: ${filename}`);
  });







  // 데이터 계산


  // timeline
  // let currentTime = new Date(algoStartDate.getTime());
  // const timelineInterval = interval;
  // while (currentTime <= algoEndDate) {
  //   console.log(`\n⏰ Processing time: ${currentTime.toISOString()}`);
  //
  //   currentTime = new Date(currentTime.getTime() + interval);
  // }


  console.log('✅ All charts generated');
};

const dataPlan: DataPlan = {
  interval: '5m',
  dataFrom: '2025-12-20T09:00:00+09:00', // 데이터 수집 시작 (5분봉은 최대 60일)
  dataTo: '2026-01-02T16:00:00+09:00', // 데이터 수집 종료
  algoFrom: '2025-12-30T09:00:00+09:00', // 알고리즘 실행 시작
  algoTo: '2026-01-02T16:00:00+09:00' // 알고리즘 실행 종료
};

export default {
  run: async () => {
    console.log('Finance algorithms run');

    // 그룹 로드
    const groups: Group[] = JSON.parse(readFileSync(GROUPS_PATH, 'utf-8'));

    // User 생성 (초기 잔고 3억원, 그룹 포함)
    const user = new User(300000000, groups);

    await load5MinuteCharts(dataPlan);
    await algorithms(dataPlan, user);
  }
};
