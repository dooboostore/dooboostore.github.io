import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { YahooFinanceBrowser, ChartResult, ChartQuote } from '../service/YahooFinanceBrowserService';
import { calculateMA, calculateRSI, calculateMACD, calculateBollingerBands, analyzeVolume, checkGoldenCross, checkDeadCross } from './calc';
import type { DataPlan, Group, TickData, SymbolSnapshot } from './types';
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
  const allMAPeriods = Array.from(
    new Set([
      ...user.maPeriods,
      user.goldenCross.from,
      user.goldenCross.to,
      ...(user.goldenCross.below || []),
      user.deadCross.from,
      user.deadCross.to,
      ...(user.deadCross.above || [])
    ])
  ).sort((a, b) => a - b);

  // 확장된 Quote 타입
  type ExtendedQuote = ChartQuote & {
    priceChangeRate: number; // 종가 등락률 (close 기준)
    openChangeRate: number; // 시가 등락률
    highChangeRate: number; // 고가 등락률
    lowChangeRate: number; // 저가 등락률
    volumeChangeRate: number; // 시작 거래량 대비 등락률
    priceSlope: number; // 이전 봉 대비 priceChangeRate 변화
    volumeSlope: number; // 이전 봉 대비 volumeChangeRate 변화
    priceMA: Map<number, number>; // 가격 등락률 이평선
    volumeMA: Map<number, number>; // 거래량 등락률 이평선
    maSlope: Map<number, number>; // 이전 봉 대비 이평선 값 변화
    crossStatus?: 'GOLDEN' | 'DEAD'; // 크로스 상태 (발생 후 유지)
  };

  type SymbolData = { label: string; open: number; openVolume: number; isGroup: boolean; quotes: ExtendedQuote[] };
  const symbols = new Map<string, SymbolData>();

  user
    .getSymbolsInGroup()
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
            return (
              it.date.getTime() >= dataStartDate.getTime() &&
              it.date.getTime() <= dataEndDate.getTime() &&
              it.close !== null &&
              it.close !== undefined
            );
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
              priceSlope: 0, // 나중에 계산
              volumeSlope: 0, // 나중에 계산
              priceMA,
              volumeMA,
              maSlope: new Map<number, number>(), // 나중에 계산
              crossStatus: undefined
            };
          });

          // slope 계산 (이전 봉 대비 변화)
          for (let i = 1; i < quotes.length; i++) {
            const prev = quotes[i - 1];
            const curr = quotes[i];
            
            // 가격/거래량 slope
            curr.priceSlope = curr.priceChangeRate - prev.priceChangeRate;
            curr.volumeSlope = curr.volumeChangeRate - prev.volumeChangeRate;
            
            // 이평선 slope
            curr.priceMA.forEach((value, period) => {
              const prevValue = prev.priceMA.get(period);
              if (prevValue !== undefined) {
                curr.maSlope.set(period, value - prevValue);
              }
            });
          }

          // 크로스 상태 계산 (상태 유지)
          let currentStatus: 'GOLDEN' | 'DEAD' | undefined = undefined;

          quotes.forEach((quote, index) => {
            const currMA = quote.priceMA;
            const currFrom = currMA.get(user.goldenCross.from);
            const currTo = currMA.get(user.goldenCross.to);

            // 첫 번째 봉: 현재 상태 판단
            if (index === 0) {
              if (currFrom !== undefined && currTo !== undefined) {
                if (currFrom > currTo) {
                  let belowOk = true;
                  if (user.goldenCross.below) {
                    for (const period of user.goldenCross.below) {
                      const belowMA = currMA.get(period);
                      if (belowMA !== undefined && belowMA >= currFrom) {
                        belowOk = false;
                        break;
                      }
                    }
                  }
                  if (belowOk) currentStatus = 'GOLDEN';
                } else if (currFrom < currTo) {
                  let aboveOk = true;
                  if (user.deadCross.above) {
                    for (const period of user.deadCross.above) {
                      const aboveMA = currMA.get(period);
                      if (aboveMA !== undefined && aboveMA <= currFrom) {
                        aboveOk = false;
                        break;
                      }
                    }
                  }
                  if (aboveOk) currentStatus = 'DEAD';
                }
              }
              quote.crossStatus = currentStatus;
              return;
            }

            const prevMA = quotes[index - 1].priceMA;

            const goldenResult = checkGoldenCross(prevMA, currMA, user.goldenCross);
            if (goldenResult.triggered) {
              currentStatus = 'GOLDEN';
            } else {
              const deadResult = checkDeadCross(prevMA, currMA, user.deadCross);
              if (deadResult.triggered) {
                currentStatus = 'DEAD';
              } else {
                // 크로스 발생했지만 조건 미충족 시 상태 초기화
                const prevFrom = prevMA.get(user.goldenCross.from);
                const prevTo = prevMA.get(user.goldenCross.to);

                if (prevFrom !== undefined && prevTo !== undefined && currFrom !== undefined && currTo !== undefined) {
                  if (prevFrom < prevTo && currFrom >= currTo) {
                    currentStatus = undefined;
                  } else if (prevFrom > prevTo && currFrom <= currTo) {
                    currentStatus = undefined;
                  }
                }
              }
            }

            quote.crossStatus = currentStatus;
          });

          symbols.set(symbol, {
            label: tickers.find(t => t.symbol === symbol)?.label || symbol,
            open: openPrice,
            openVolume: openVolume,
            isGroup: false,
            quotes
          });
        }
        console.log(
          `Loaded ${dataPlan.interval} chart for ${symbol}, ${allQuotes.length} -> ${filteredQuotes.length} data points (duplicates removed)`
        );
      } else {
        console.log(`${dataPlan.interval} chart not found for ${symbol}, skipping`);
      }
    });

  // 그룹별 평균 계산
  user.groups.forEach(group => {
    // 그룹에 속한 심볼들의 데이터 수집
    const groupSymbolsData = group.symbols.map(symbol => symbols.get(symbol)).filter(data => data !== undefined);

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
        const priceMaValues = validQuotes.map(q => q.priceMA.get(period)).filter(v => v !== undefined) as number[];
        if (priceMaValues.length > 0) {
          avgPriceMA.set(period, priceMaValues.reduce((a, b) => a + b, 0) / priceMaValues.length);
        }

        // 거래량 이평선 평균
        const volumeMaValues = validQuotes.map(q => q.volumeMA.get(period)).filter(v => v !== undefined) as number[];
        if (volumeMaValues.length > 0) {
          avgVolumeMA.set(period, volumeMaValues.reduce((a, b) => a + b, 0) / volumeMaValues.length);
        }
      });

      // 첫 번째 심볼의 시간 정보 사용
      const baseQuote = symbolQuotesAtTime[0];

      groupQuotes.push({
        date: baseQuote.date,
        open: 0, // 그룹은 시작가 의미 없음
        high: 0,
        low: 0,
        close: avgPriceChangeRate, // 평균 등락률을 close에 저장
        volume: 0,
        openChangeRate: avgPriceChangeRate, // 그룹은 OHLC 모두 같은 값
        highChangeRate: avgPriceChangeRate,
        lowChangeRate: avgPriceChangeRate,
        priceChangeRate: avgPriceChangeRate,
        volumeChangeRate: avgVolumeChangeRate,
        priceSlope: 0, // 나중에 계산
        volumeSlope: 0, // 나중에 계산
        priceMA: avgPriceMA,
        volumeMA: avgVolumeMA,
        maSlope: new Map<number, number>() // 나중에 계산
      });
    }

    // 그룹 slope 계산
    for (let i = 1; i < groupQuotes.length; i++) {
      const prev = groupQuotes[i - 1];
      const curr = groupQuotes[i];
      
      curr.priceSlope = curr.priceChangeRate - prev.priceChangeRate;
      curr.volumeSlope = curr.volumeChangeRate - prev.volumeChangeRate;
      
      curr.priceMA.forEach((value, period) => {
        const prevValue = prev.priceMA.get(period);
        if (prevValue !== undefined) {
          curr.maSlope.set(period, value - prevValue);
        }
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

    console.log(
      `Group ${group.label}: Created with ${groupQuotes.length} data points (avg of ${groupSymbolsData.length} symbols)`
    );
  });

  // algoFrom ~ algoTo 기간으로 데이터 필터링 + algoFrom 기준 보정
  const algoSymbols = new Map<string, SymbolData>();

  symbols.forEach((symbolData, key) => {
    // algoFrom 직전 데이터 찾기
    const allQuotes = symbolData.quotes;
    let basePrice = 0;
    let baseVolume = 0;
    let basePriceChangeRate = 0; // 기준 등락률 (보정용)
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

    const filteredQuotes = allQuotes.filter(
      q => q.date.getTime() >= algoStartDate.getTime() && q.date.getTime() <= algoEndDate.getTime()
    );

    if (filteredQuotes.length > 0 && basePrice > 0) {
      // 기준가 대비 등락률로 보정 (이평선도 같이 보정)
      // 거래량 등락률은 이전 봉 대비라서 보정 불필요
      const adjustedQuotes = filteredQuotes.map(q => {
        const openChangeRate = (((q.open || q.close!) - basePrice) / basePrice) * 100;
        const highChangeRate = (((q.high || q.close!) - basePrice) / basePrice) * 100;
        const lowChangeRate = (((q.low || q.close!) - basePrice) / basePrice) * 100;
        const priceChangeRate = ((q.close! - basePrice) / basePrice) * 100;

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
          priceMA: adjustedPriceMA,
          // volumeMA도 그대로 사용
          priceSlope: 0, // 재계산 예정
          maSlope: new Map<number, number>() // 재계산 예정
        };
      });

      // slope 재계산 (보정된 값 기준)
      for (let i = 1; i < adjustedQuotes.length; i++) {
        const prev = adjustedQuotes[i - 1];
        const curr = adjustedQuotes[i];
        
        curr.priceSlope = curr.priceChangeRate - prev.priceChangeRate;
        // volumeSlope는 보정 안 했으니 그대로
        
        curr.priceMA.forEach((value, period) => {
          const prevValue = prev.priceMA.get(period);
          if (prevValue !== undefined) {
            curr.maSlope.set(period, value - prevValue);
          }
        });
      }

      // 첫 번째 봉의 초기 상태 재판단 후, 그 상태를 이어가도록 수정
      if (adjustedQuotes.length > 0) {
        const firstQuote = adjustedQuotes[0];
        const currMA = firstQuote.priceMA;
        const currFrom = currMA.get(user.goldenCross.from);
        const currTo = currMA.get(user.goldenCross.to);

        let initialStatus: 'GOLDEN' | 'DEAD' | undefined = undefined;

        if (currFrom !== undefined && currTo !== undefined) {
          if (currFrom > currTo) {
            let belowOk = true;
            if (user.goldenCross.below && user.goldenCross.below.length > 0) {
              for (const period of user.goldenCross.below) {
                const belowMA = currMA.get(period);
                if (belowMA !== undefined && belowMA >= currFrom) {
                  belowOk = false;
                  break;
                }
              }
            }
            initialStatus = belowOk ? 'GOLDEN' : undefined;
          } else if (currFrom < currTo) {
            let aboveOk = true;
            if (user.deadCross.above && user.deadCross.above.length > 0) {
              for (const period of user.deadCross.above) {
                const aboveMA = currMA.get(period);
                if (aboveMA !== undefined && aboveMA <= currFrom) {
                  aboveOk = false;
                  break;
                }
              }
            }
            initialStatus = aboveOk ? 'DEAD' : undefined;
          }
        }

        // 첫 번째 봉 상태 설정
        firstQuote.crossStatus = initialStatus;

        // 나머지 봉들: 크로스 발생 시점만 상태 변경, 아니면 이전 상태 유지
        let currentStatus = initialStatus;
        for (let i = 1; i < adjustedQuotes.length; i++) {
          const quote = adjustedQuotes[i];
          const prevQuote = adjustedQuotes[i - 1];
          const prevMA = prevQuote.priceMA;
          const qMA = quote.priceMA;

          const goldenResult = checkGoldenCross(prevMA, qMA, user.goldenCross);
          if (goldenResult.triggered) {
            currentStatus = 'GOLDEN';
          } else {
            const deadResult = checkDeadCross(prevMA, qMA, user.deadCross);
            if (deadResult.triggered) {
              currentStatus = 'DEAD';
            } else {
              // 크로스 발생했지만 조건 미충족 시 상태 초기화
              const prevFrom = prevMA.get(user.goldenCross.from);
              const prevTo = prevMA.get(user.goldenCross.to);
              const qFrom = qMA.get(user.goldenCross.from);
              const qTo = qMA.get(user.goldenCross.to);

              if (prevFrom !== undefined && prevTo !== undefined && qFrom !== undefined && qTo !== undefined) {
                // 골든크로스 발생했지만 조건 미충족
                if (prevFrom < prevTo && qFrom >= qTo) {
                  currentStatus = undefined;
                }
                // 데드크로스 발생했지만 조건 미충족
                else if (prevFrom > prevTo && qFrom <= qTo) {
                  currentStatus = undefined;
                }
              }

              // 현재 상태가 undefined이고 조건을 충족하면 상태 업데이트
              if (currentStatus === undefined && qFrom !== undefined && qTo !== undefined) {
                if (qFrom > qTo) {
                  // 골든 상태 체크
                  let belowOk = true;
                  if (user.goldenCross.below) {
                    for (const period of user.goldenCross.below) {
                      const belowMA = qMA.get(period);
                      if (belowMA !== undefined && belowMA >= qFrom) {
                        belowOk = false;
                        break;
                      }
                    }
                  }
                  if (belowOk) currentStatus = 'GOLDEN';
                } else if (qFrom < qTo) {
                  // 데드 상태 체크
                  let aboveOk = true;
                  if (user.deadCross.above) {
                    for (const period of user.deadCross.above) {
                      const aboveMA = qMA.get(period);
                      if (aboveMA !== undefined && aboveMA <= qFrom) {
                        aboveOk = false;
                        break;
                      }
                    }
                  }
                  if (aboveOk) currentStatus = 'DEAD';
                }
              }
            }
          }
          quote.crossStatus = currentStatus;
        }
      }

      algoSymbols.set(key, {
        ...symbolData,
        quotes: adjustedQuotes
      });

      console.log(
        `Filtered ${key}: ${symbolData.quotes.length} -> ${filteredQuotes.length} data points (basePrice: ${basePrice})`
      );
    }
  });

  // 데이터 계산

  // timeline - 실제 시간 흐름 시뮬레이션
  let currentTime = new Date(algoStartDate.getTime());
  const timelineInterval = interval;  // 체크 주기 (데이터 interval과 동일하게 설정, 필요시 변경 가능)
  
  while (currentTime <= algoEndDate) {
    // currentTime 이전의 quotes를 가진 모든 symbolData 수집
    const snapshots: SymbolSnapshot[] = [];
    
    algoSymbols.forEach((symbolData, symbol) => {
      // currentTime 이전의 quotes만 필터링
      const filteredQuotes = symbolData.quotes.filter(q => q.date.getTime() <= currentTime.getTime());
      if (filteredQuotes.length === 0) return;
      
      // TickData 배열로 변환
      const tickQuotes: TickData[] = filteredQuotes.map(q => ({
        time: q.date,
        symbol,
        open: q.openChangeRate,
        high: q.highChangeRate,
        low: q.lowChangeRate,
        close: q.priceChangeRate,
        volume: q.volumeChangeRate,
        priceSlope: q.priceSlope,
        volumeSlope: q.volumeSlope,
        actualClose: q.close!,
        priceMA: q.priceMA,
        volumeMA: q.volumeMA,
        maSlope: q.maSlope,
        crossStatus: q.crossStatus
      }));
      
      snapshots.push({
        symbol,
        label: symbolData.label,
        isGroup: symbolData.isGroup,
        quotes: tickQuotes
      });
    });
    
    // User에게 전달
    if (snapshots.length > 0) {
      user.onTick(currentTime, snapshots);
    }
    
    currentTime = new Date(currentTime.getTime() + timelineInterval);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Trading simulation completed');
  console.log('='.repeat(60));
  
  // 거래 내역 요약
  const transactions = user.account.transactions;
  const buyTxs = transactions.filter(tx => tx.type === 'BUY');
  const sellTxs = transactions.filter(tx => tx.type === 'SELL');
  
  const totalBuyAmount = buyTxs.reduce((sum, tx) => sum + tx.total, 0);
  const totalSellAmount = sellTxs.reduce((sum, tx) => sum + tx.total, 0);
  const totalProfit = sellTxs.reduce((sum, tx) => sum + (tx.profit || 0), 0);
  const totalFees = transactions.reduce((sum, tx) => sum + tx.fees, 0);
  
  // 보유 주식 평가액 계산 (마지막 가격 기준)
  let holdingsValue = 0;
  user.account.holdings.forEach((holding, symbol) => {
    const symbolData = algoSymbols.get(symbol);
    if (symbolData && symbolData.quotes.length > 0) {
      const lastQuote = symbolData.quotes[symbolData.quotes.length - 1];
      holdingsValue += holding.quantity * (lastQuote.close || 0);
    }
  });
  const totalValue = user.account.balance + holdingsValue;
  const totalReturnRate = ((totalValue - user.account.initialBalance) / user.account.initialBalance * 100);
  const totalProfitLoss = totalValue - user.account.initialBalance;
  
  console.log(`\n📊 거래 요약:`);
  console.log(`   초기 잔고: ${user.account.initialBalance.toLocaleString()}원`);
  console.log(`   최종 잔고: ${user.account.balance.toLocaleString()}원`);
  console.log(`   보유 주식 평가액: ${holdingsValue.toLocaleString()}원`);
  console.log(`   총 평가금액: ${totalValue.toLocaleString()}원 (${totalProfitLoss >= 0 ? '+' : ''}${totalProfitLoss.toLocaleString()}원, ${totalReturnRate >= 0 ? '+' : ''}${totalReturnRate.toFixed(2)}%)`);
  console.log(`   매수 횟수: ${buyTxs.length}회 (총 ${totalBuyAmount.toLocaleString()}원)`);
  console.log(`   매도 횟수: ${sellTxs.length}회 (총 ${totalSellAmount.toLocaleString()}원)`);
  console.log(`   실현 손익: ${totalProfit.toLocaleString()}원`);
  console.log(`   총 수수료: ${totalFees.toLocaleString()}원`);
  
  // 보유 종목
  if (user.account.holdings.size > 0) {
    console.log(`\n📦 보유 종목:`);
    user.account.holdings.forEach((holding, symbol) => {
      const symbolData = algoSymbols.get(symbol);
      const label = symbolData?.label || symbol;
      let currentPrice = holding.avgPrice;
      let profitRate = 0;
      if (symbolData && symbolData.quotes.length > 0) {
        currentPrice = symbolData.quotes[symbolData.quotes.length - 1].close || holding.avgPrice;
        profitRate = ((currentPrice - holding.avgPrice) / holding.avgPrice * 100);
      }
      const evalValue = holding.quantity * currentPrice;
      console.log(`   ${symbol} (${label}): ${holding.quantity}주 @ 평균 ${holding.avgPrice.toLocaleString()}원 → 현재 ${currentPrice.toLocaleString()}원 (${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}%, ${evalValue.toLocaleString()}원)`);
    });
  }
  
  // 수익률 계산 (평가금액 기준)
  console.log(`\n📈 총 수익률: ${totalReturnRate >= 0 ? '+' : ''}${totalReturnRate.toFixed(2)}% (${totalProfitLoss >= 0 ? '+' : ''}${totalProfitLoss.toLocaleString()}원)`);
  console.log('='.repeat(60));


  //  그래프 그려보기
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
      ma: q.priceMA,
      actualClose: q.close, // 실제 종가
      crossStatus: q.crossStatus // 크로스 상태
    }));

    // 해당 심볼의 거래 내역
    const symbolTransactions = user.symbolTransactionsMap.get(key) || [];
    
    // 요약 정보 계산
    const holding = user.account.getHolding(key);
    const totalHolding = holding?.quantity || 0;
    const lastPrice = chartData.length > 0 ? chartData[chartData.length - 1].actualClose || 0 : 0;
    const avgPrice = holding?.avgPrice || 0;
    const totalProfitRate = avgPrice > 0 ? ((lastPrice - avgPrice) / avgPrice) * 100 : 0;
    const totalProfit = totalHolding * (lastPrice - avgPrice);

    const chart = new TradeChart()
      .setTitle(`${symbolData.label} ${key} (${symbolData.isGroup ? 'Group' : 'Symbol'})`)
      .setData(chartData)
      .setMAPeriods(user.maPeriods)
      .setIsGroup(symbolData.isGroup)
      .setTransactions(symbolTransactions)
      .setSummary(totalHolding, totalProfitRate, totalProfit)
      .draw();

    const filename = symbolData.isGroup ? `group-${key}.png` : `symbol-${key}.png`;
    writeFileSync(join(outputDir, filename), chart.toBuffer());
    console.log(`Chart saved: ${filename}`);
  });

  console.log('✅ All charts generated');
};

// const dataPlan: DataPlan = {
//   interval: '1d',
//   dataFrom: '2025-07-01T00:00:00+09:00', // 데이터 수집 시작 (6개월 전)
//   dataTo: '2026-01-03T00:00:00+09:00', // 데이터 수집 종료
//   algoFrom: '2025-10-01T00:00:00+09:00', // 알고리즘 실행 시작 (3개월 전)
//   algoTo: '2026-01-03T00:00:00+09:00' // 알고리즘 실행 종료
// };
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
