/**
 * 금융 알고리즘 설정
 */

import type { TradingConfig, GoldenCrossConfig, DeadCrossConfig } from './types';

// 이동평균선 설정
export const MA_PERIODS: number[] = [5, 10, 20, 50];

// 골든크로스 설정: 5일선이 20일선을 상향 돌파, 5일선이 50일선보다 위
export const GOLDEN_CROSS: GoldenCrossConfig = {
  from: 5,
  to: 20,
  under: [50],
  minSlope: 0.0005
};

// 데드크로스 설정: 5일선이 20일선을 하향 돌파, 5일선이 50일선 아래로 떨어지면 전량 매도
export const DEAD_CROSS: DeadCrossConfig = {
  from: 5,
  to: 20,
  below: [50]
};

// 초기 잔고
export const INITIAL_BALANCE = 300000000; // 3억원

// 트레이딩 설정
export const DEFAULT_CONFIG: TradingConfig = {
  tradeFees: {
    buy: 0.00015,      // 매수 수수료 0.015%
    sell: 0.00245,     // 매도 수수료 0.015% + 거래세 0.23% = 0.245%
  },

  // 기능 활성화 플래그
  features: {
    pyramiding: true,           // 피라미딩 (추가 매수)
    stopLoss: true,             // 손절 (항상 체크)
    takeProfit: true,           // 익절 (항상 체크)
    trailingStop: false,        // 트레일링 스톱 (데드크로스 상태에서만)
    deadCrossAdditionalSell: true, // 데드크로스 상태에서 추가 하락 시 추가 매도
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
    symbolSize: 3, // 상위 3개 종목 선택
    stockRate: 0.10,  // 잔고의 10%씩 투자
    stockSize: 100,  // [DEPRECATED] 고정 주식 수 (stockRate 사용 시 무시됨)
    minVolumeStrength: 50, // 최소 거래량 강도 50%
    minSlope: 0.01, // 최소 기울기
    maxMaGap: 0.05, // MA 간격 최대 5%
    positionSizePercent: 0.1, // 잔고의 10%씩 투자
    minObvSlope: 0, // 최소 OBV 기울기
    minRsi: 30, // 최소 RSI (30 이하면 과매도)
    maxRsi: 70, // 최대 RSI (70 이상이면 과매수)
    macdBullish: true, // MACD 히스토그램이 양수여야 함
    bollingerPosition: 'lower', // 볼린저 밴드 하단 근처에서 매수
    minBollingerPercentB: 0.2, // %B 최소값
    maxBollingerPercentB: 0.5, // %B 최대값
    volumeTrendRequired: 'increasing', // 거래량 추세
    avoidPriceVolumeDivergence: true // 가격-거래량 다이버전스 회피
  },

  sell: {
    symbolSize: 3, // 상위 3개 종목 선택
    stockRate: 0.5,  // 보유 주식의 50%씩 매도
    additionalSellThreshold: 0.01, // 추가 매도 기준: 이전 매도 대비 1% 추가 하락
    stopLoss: -0.10, // -10% 손절
    takeProfit: 0.50, // +50% 익절
    trailingStopPercent: 0.02 // 최고가 대비 -2% 트레일링 스톱
  },

  timeFilter: {
    excludeHours: [9, 15] // 9시대, 15시대 거래 제외
  },

  riskManagement: {
    maxConsecutiveLosses: 3 // 연속 손실 3번 이상이면 거래 중단
  },

  scoreWeights: {
    slope: 0.5,        // 기울기 가중치 50%
    volume: 0.3,       // 거래량 강도 가중치 30%
    maGap: 0.2        // MA 간격 가중치 20%
  }
};

/**
 * interval 문자열을 밀리초로 변환
 */
export const parseIntervalToMs = (interval: string): number => {
  if (interval === '1m') {
    return 1 * 60 * 1000;
  } else if (interval === '5m') {
    return 5 * 60 * 1000;
  } else if (interval === '1d') {
    return 24 * 60 * 60 * 1000;
  } else {
    const match = interval.match(/^(\d+)([mhd])$/);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];
      if (unit === 'm') {
        return value * 60 * 1000;
      } else if (unit === 'h') {
        return value * 60 * 60 * 1000;
      } else if (unit === 'd') {
        return value * 24 * 60 * 60 * 1000;
      }
    }
    return 1 * 60 * 1000; // default to 1 minute
  }
};
