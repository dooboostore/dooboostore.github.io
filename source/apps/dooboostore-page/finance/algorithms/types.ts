/**
 * 금융 알고리즘 타입 정의
 */

// 데이터 플랜
export type DataPlan = {
  interval: string;
  dataFrom: string;  // 데이터 수집 시작일 (이동평균선 계산용)
  dataTo: string;    // 데이터 수집 종료일
  algoFrom: string;  // 알고리즘 실행 시작일
  algoTo: string;    // 알고리즘 실행 종료일
};

// 그룹
export type Group = {
  group: string;
  label: string;
  symbols: string[];
};

// 거래 내역
export type Transaction = {
  time: Date;
  type: 'BUY' | 'SELL';
  symbol: string;
  quantity: number;
  price: number;
  fees: number;
  total: number;
  avgBuyPrice?: number; // 매도 시 평균 매수가
  profit?: number; // 매도 시 손익
  reason?: string; // 매도 이유 (TAKE_PROFIT, STOP_LOSS, DEAD_CROSS, DEAD_CROSS_ADDITIONAL, etc.)
  isPyramiding?: boolean; // 매수 시 피라미딩 여부
  isReBuy?: boolean; // 매수 시 재매수 여부 (익절/손절 후 재매수)
  isGoldenCrossEntry?: boolean; // 골든크로스 진입 시점 매수 여부
};

// 보유 종목 정보
export type Holding = {
  quantity: number;
  avgPrice: number;
  maxPrice: number;
  buyTime: Date;
};

// 계좌 정보
export type Account = {
  balance: number;
  holdings: Map<string, Holding>;
};

// 시계열 데이터
export type TimeSeries = {
  time: Date;
  avgChangeRate: number;
  avgVolumeStrength: number;
  ma: Map<number, { value: number, slope: number }>;
  goldenCross?: boolean; // 골든크로스 발생 여부
  deadCross?: boolean; // 데드크로스 발생 여부
};

// 골든크로스 설정
export type GoldenCrossConfig = {
  from: number;
  to: number;
  below?: number[];
};

// 데드크로스 설정
export type DeadCrossConfig = {
  from: number;
  to: number;
  above?: number[];
};

// 크로스 상태
export type CrossState = 'GOLDEN' | 'DEAD' | 'NONE';

// 틱 데이터 (User.onTick에 전달되는 데이터)
export type TickData = {
  time: Date;
  symbol: string;
  open: number;           // 시가 등락률
  high: number;           // 고가 등락률
  low: number;            // 저가 등락률
  close: number;          // 종가 등락률
  volume: number;         // 거래량 등락률
  actualClose: number;    // 실제 종가
  priceMA: Map<number, number>;   // 가격 이평선
  volumeMA: Map<number, number>;  // 거래량 이평선
  crossStatus?: 'GOLDEN' | 'DEAD';  // 크로스 상태
};

// 심볼 스냅샷 (User.onTick에 전달되는 심볼별 데이터)
export type SymbolSnapshot = {
  symbol: string;
  label: string;
  isGroup: boolean;
  quotes: TickData[];  // currentTime 이전의 모든 quotes
};

// 거래 설정
export type TradingConfig = {
  tradeFees: {
    buy: number;
    sell: number;
  };
  features?: Partial<{
    pyramiding: boolean;
    stopLoss: boolean;
    takeProfit: boolean;
    trailingStop: boolean;
    deadCrossAdditionalSell: boolean;
    timeFilter: boolean;
    maGapFilter: boolean;
    consecutiveLossProtection: boolean;
    positionSizing: boolean;
    volumeStrengthFilter: boolean;
    slopeFilter: boolean;
    obvFilter: boolean;
    rsiFilter: boolean;
    macdFilter: boolean;
    bollingerBandsFilter: boolean;
    volumeAnalysisFilter: boolean;
    onlySymbolGoldenCross: boolean;
  }>;
  buy?: Partial<{
    symbolSize: number;
    stockRate: number;
    stockSize: number;
    minVolumeStrength: number;
    minSlope: number;
    maxMaGap: number;
    positionSizePercent: number;
    minObvSlope: number;
    minRsi: number;
    maxRsi: number;
    macdBullish: boolean;
    bollingerPosition: string;
    minBollingerPercentB: number;
    maxBollingerPercentB: number;
    volumeTrendRequired: string;
    avoidPriceVolumeDivergence: boolean;
  }>;
  sell?: Partial<{
    symbolSize: number;
    stockRate: number;
    additionalSellThreshold: number;
    stopLoss: number;
    takeProfit: number;
    trailingStopPercent: number;
  }>;
  timeFilter?: {
    excludeHours: number[];
  };
  riskManagement?: {
    maxConsecutiveLosses: number;
  };
  scoreWeights?: {
    slope: number;
    volume: number;
    maGap: number;
  };
};
