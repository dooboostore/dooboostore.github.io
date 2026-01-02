/**
 * 금융 지표 계산 함수 모음
 * 순수 계산 로직만 포함
 */

/**
 * 이동평균(MA) 계산
 * @param data 가격 데이터 배열
 * @param period 이동평균 기간
 * @param currentIndex 현재 인덱스
 * @returns 이동평균 값 또는 null (데이터 부족 시)
 */
export const calculateMA = (data: number[], period: number, currentIndex: number): number | null => {
  if (currentIndex < period - 1) return null;
  const sum = data.slice(currentIndex - period + 1, currentIndex + 1).reduce((a, b) => a + b, 0);
  return sum / period;
};

/**
 * EMA(지수이동평균) 계산
 * @param data 가격 데이터 배열
 * @param period EMA 기간
 * @returns EMA 배열
 */
export const calculateEMA = (data: number[], period: number): number[] => {
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

/**
 * RSI(상대강도지수) 계산
 * @param prices 가격 데이터 배열
 * @param period RSI 기간 (기본값: 14)
 * @returns RSI 값 (0-100) 또는 null (데이터 부족 시)
 */
export const calculateRSI = (prices: number[], period: number = 14): number | null => {
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

export type MACDResult = {
  macd: number;
  signal: number;
  histogram: number;
};

/**
 * MACD 계산
 * @param prices 가격 데이터 배열
 * @param fastPeriod 빠른 EMA 기간 (기본값: 12)
 * @param slowPeriod 느린 EMA 기간 (기본값: 26)
 * @param signalPeriod 시그널 EMA 기간 (기본값: 9)
 * @returns MACD, Signal, Histogram 또는 null (데이터 부족 시)
 */
export const calculateMACD = (
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult | null => {
  if (prices.length < slowPeriod + signalPeriod) return null;

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

export type BollingerBandsResult = {
  upper: number;
  middle: number;
  lower: number;
  percentB: number;
};

/**
 * 볼린저 밴드 계산
 * @param prices 가격 데이터 배열
 * @param period 이동평균 기간 (기본값: 20)
 * @param stdDev 표준편차 배수 (기본값: 2)
 * @returns 상단/중간/하단 밴드 및 %B 또는 null (데이터 부족 시)
 */
export const calculateBollingerBands = (
  prices: number[],
  period: number = 20,
  stdDev: number = 2
): BollingerBandsResult | null => {
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

export type VolumeAnalysisResult = {
  volumeTrend: 'increasing' | 'decreasing' | 'neutral';
  priceVolumeDivergence: boolean;
};

/**
 * 거래량 분석
 * @param volumes 거래량 데이터 배열
 * @param prices 가격 데이터 배열
 * @returns 거래량 추세 및 가격-거래량 다이버전스 여부
 */
export const analyzeVolume = (
  volumes: number[],
  prices: number[]
): VolumeAnalysisResult => {
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

/**
 * OBV(On Balance Volume) 기울기 계산
 * @param obvValues OBV 값 배열
 * @param period 기울기 계산 기간
 * @returns OBV 기울기 (%)
 */
export const calculateOBVSlope = (obvValues: number[], period: number = 5): number => {
  if (obvValues.length < period) return 0;
  
  const recentOBV = obvValues.slice(-period);
  const firstOBV = recentOBV[0];
  const lastOBV = recentOBV[recentOBV.length - 1];
  
  if (firstOBV === 0) return 0;
  
  return ((lastOBV - firstOBV) / Math.abs(firstOBV)) * 100;
};

/**
 * 변동률 계산
 * @param currentPrice 현재 가격
 * @param previousPrice 이전 가격
 * @returns 변동률 (%)
 */
export const calculateChangeRate = (currentPrice: number, previousPrice: number): number => {
  if (previousPrice === 0) return 0;
  return ((currentPrice - previousPrice) / previousPrice) * 100;
};

/**
 * 거래량 강도 계산 (현재 거래량 / 평균 거래량)
 * @param currentVolume 현재 거래량
 * @param volumes 거래량 데이터 배열
 * @param period 평균 계산 기간 (기본값: 20)
 * @returns 거래량 강도 (%)
 */
export const calculateVolumeStrength = (
  currentVolume: number,
  volumes: number[],
  period: number = 20
): number => {
  if (volumes.length < period) return 100;
  
  const recentVolumes = volumes.slice(-period);
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / period;
  
  if (avgVolume === 0) return 0;
  
  return (currentVolume / avgVolume) * 100;
};

/**
 * MA 기울기 계산
 * @param currentMA 현재 MA 값
 * @param previousMA 이전 MA 값
 * @returns 기울기 (%)
 */
export const calculateMASlope = (currentMA: number, previousMA: number): number => {
  if (previousMA === 0) return 0;
  return ((currentMA - previousMA) / previousMA) * 100;
};
