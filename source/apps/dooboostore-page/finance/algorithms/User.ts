/**
 * 사용자 클래스 - 트레이딩 설정, 계좌, 매수/매도 로직 포함
 */

import type { TradingConfig, GoldenCrossConfig, DeadCrossConfig, Group, Transaction } from './types';
import { Account } from './Account';

export class User {
  // 계좌
  account: Account;

  // 골든크로스 설정
  goldenCross: GoldenCrossConfig = {
    from: 5,
    to: 20,
    below: [50]
  };

  // 데드크로스 설정
  deadCross: DeadCrossConfig = {
    from: 5,
    to: 20,
    above: [50]
  };

  // 이동평균선 기간
  maPeriods: number[] = [5, 10, 20, 50];

  // 트레이딩 설정
  config: TradingConfig = {
    tradeFees: {
      buy: 0.00015,
      sell: 0.00245
    },

    features: {
      pyramiding: false,
      stopLoss: true,
      takeProfit: true,
      trailingStop: false,
      deadCrossAdditionalSell: true,
      timeFilter: false,
      maGapFilter: false,
      consecutiveLossProtection: false,
      positionSizing: false,
      volumeStrengthFilter: false,
      slopeFilter: false,
      obvFilter: false,
      rsiFilter: false,
      macdFilter: false,
      bollingerBandsFilter: false,
      volumeAnalysisFilter: false,
      onlySymbolGoldenCross: true
    },

    buy: {
      symbolSize: 3,
      stockRate: 0.1,
      stockSize: 100,
      minVolumeStrength: 50,
      minSlope: 0,
      maxMaGap: 0.05,
      positionSizePercent: 0.1,
      minObvSlope: 0,
      minRsi: 30,
      maxRsi: 70,
      macdBullish: true,
      bollingerPosition: 'lower',
      minBollingerPercentB: 0.2,
      maxBollingerPercentB: 0.5,
      volumeTrendRequired: 'increasing',
      avoidPriceVolumeDivergence: true
    },

    sell: {
      symbolSize: 3,
      stockRate: 0.5,
      additionalSellThreshold: 0.01,
      stopLoss: -0.1,
      takeProfit: 0.5,
      trailingStopPercent: 0.02
    },

    timeFilter: {
      excludeHours: [9, 15]
    },

    riskManagement: {
      maxConsecutiveLosses: 3
    },

    scoreWeights: {
      slope: 0.5,
      volume: 0.3,
      maGap: 0.2
    }
  };

  // 관리하는 그룹들
  groups: Group[] = [];

  // 심볼별 거래 내역 (차트용)
  symbolTransactionsMap: Map<string, Transaction[]> = new Map();

  constructor(initialBalance: number, groups: Group[] = []) {
    this.account = new Account(initialBalance);
    this.groups = groups;
  }

  // 필요한 모든 MA 기간 (중복 제거, 정렬)
  getAllMAPeriods(): number[] {
    return Array.from(
      new Set([...this.maPeriods, this.goldenCross.from, this.goldenCross.to, this.deadCross.from, this.deadCross.to])
    ).sort((a, b) => a - b);
  }

  getSymbolsInGroup(label?: string): string[] {
    if (!label) {
      const allSymbols = new Set<string>();
      this.groups.forEach(group => {
        group.symbols.forEach(symbol => allSymbols.add(symbol));
      });
      return Array.from(allSymbols);
    }
    const group = this.groups.find(g => g.label === label);
    return Array.from(new Set<string>(group ? group.symbols : []));
  }

  // 매수 (TODO: 나중에 구현)
  buyStock(): boolean {
    // TODO: 구현 예정
    return false;
  }

  // 매도 (TODO: 나중에 구현)
  sellStock(): boolean {
    // TODO: 구현 예정
    return false;
  }
}
