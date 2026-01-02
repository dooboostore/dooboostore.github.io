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
  holdingAfter: number; // 매매 후 보유량
  avgBuyPrice?: number; // 매도 시 평균 매수가
  profit?: number; // 매도 시 손익
  reason?: string; // 매도 이유 (TAKE_PROFIT, STOP_LOSS, DEAD_CROSS, DEAD_CROSS_ADDITIONAL, etc.)
  isPyramiding?: boolean; // 매수 시 피라미딩 여부
  isReBuy?: boolean; // 매수 시 재매수 여부 (익절/손절 후 재매수)
  isGoldenCrossEntry?: boolean; // 골든크로스 진입 시점 매수 여부
  label?: string; // 차트에 표시할 라벨 (세로로 표시됨)
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
  priceSlope: number;     // 이전 봉 대비 가격 변화
  volumeSlope: number;    // 이전 봉 대비 거래량 변화
  actualClose: number;    // 실제 종가
  priceMA: Map<number, number>;   // 가격 이평선
  volumeMA: Map<number, number>;  // 거래량 이평선
  maSlope: Map<number, number>;   // 이전 봉 대비 이평선 변화
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
  buy?: {
    rate?: number;           // 잔액 대비 매수 비율 (0~1)
    moreRate?: number;       // 추가 매수 비율 (피라미딩용, 0~1)
    moreRateType?: 'balance' | 'position' | 'initial';  // balance: 잔고 기준, position: 현재 포지션 기준, initial: 첫 매수금액 기준
    slopeThresholdRate?: number; // 첫 매수 시점 기울기 임계값 (0~1, 예: 0.04 = 4%)
    slopeThresholdType?: 'up' | 'down' | 'any';  // up: 상승 시, down: 하락 시, any: 무관
    moreSlopeThresholdRate?: number; // 피라미딩 매수 기울기 임계값 (없으면 slopeThresholdRate 사용)
    moreSlopeThresholdType?: 'up' | 'down' | 'any';  // 피라미딩 매수 기울기 타입 (없으면 slopeThresholdType 사용)
    groupCrossCheck?: boolean; // 그룹 골든크로스 체크
  };
  sell?: {
    rate?: number;           // 보유량 대비 매도 비율 (0~1)
    moreRate?: number;       // 추가 매도 비율 (피라미딩용, 0~1)
    moreRateType?: 'holding' | 'initial';  // holding: 현재 보유량 기준, initial: 첫 매도수량 기준
    slopeThresholdRate?: number; // 첫 매도 시점 기울기 임계값 (0~1, 예: 0.04 = 4%)
    slopeThresholdType?: 'up' | 'down' | 'any';  // up: 상승 시, down: 하락 시, any: 무관
    moreSlopeThresholdRate?: number; // 피라미딩 매도 기울기 임계값 (없으면 slopeThresholdRate 사용)
    moreSlopeThresholdType?: 'up' | 'down' | 'any';  // 피라미딩 매도 기울기 타입 (없으면 slopeThresholdType 사용)
    stopLossRate?: number; // 손절 비율 (0~1, 예: 0.05 = 5%)
    groupCrossCheck?: boolean; // 그룹 데드크로스 체크
    // 익절 설정
    takeProfit?: {
      thresholdRate: number;      // 첫 익절 기준 수익률 (0~1, 예: 0.10 = 10%)
      moreThresholdRate?: number; // 추가 익절 간격 (0~1, 예: 0.10 = 10%씩, 없으면 thresholdRate 사용)
      rate: number;               // 첫 익절 매도 비율 (0~1)
      moreRate?: number;          // 추가 익절 매도 비율 (0~1, 없으면 rate 사용)
    };
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
