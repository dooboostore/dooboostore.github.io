/**
 * 사용자 클래스 - 트레이딩 설정, 계좌, 매수/매도 로직 포함
 */

import type { TradingConfig, GoldenCrossConfig, DeadCrossConfig, Group, Transaction, TickData, SymbolSnapshot } from './types';
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
      // pyramiding: false,
      // stopLoss: true,
      // takeProfit: true,
      // trailingStop: false,
      // deadCrossAdditionalSell: true,
      // timeFilter: false,
      // maGapFilter: false,
      // consecutiveLossProtection: false,
      // positionSizing: false,
      // volumeStrengthFilter: false,
      // slopeFilter: false,
      // obvFilter: false,
      // rsiFilter: false,
      // macdFilter: false,
      // bollingerBandsFilter: false,
      // volumeAnalysisFilter: false,
      // onlySymbolGoldenCross: true
    },

    buy: {
      rate: 0.1, // 잔액 대비 매수 비율
      moreRate: 0.05, // 추가 매수 비율 (피라미딩용)  undefined 이면 피라미딩 안함
      slopeThreshold: 0.1, // 매수 시점 기울기 임계값  undefined 이면 기울기 필터링 안함  (goldenCross.from 기간의 기울기)
      groupCrossCheck: true // symbol이 속한 그룹이 골든크로스 상태인지 추가 확인  undefined 이면 체크안함
    },

    sell: {
      rate: 0.5, // 보유량 대비 매도 비율
      moreRate: 0.25, // 추가 매도 비율 (피라미딩용)  undefined 이면 피라미딩 안함
      stopLossPercent: 0.05, // 손절 퍼센트  undefined 이면 손절 안함  (deadCross.from 기간의 기울기)
      groupCrossCheck: true // symbol이 속한 그룹이 데드크로스 상태인지 추가 확인  undefined 이면 체크안함
    }

    // timeFilter: {
    //   excludeHours: [9, 15]
    // },
    //
    // riskManagement: {
    //   maxConsecutiveLosses: 3
    // },
    //
    // scoreWeights: {
    //   slope: 0.5,
    //   volume: 0.3,
    //   maGap: 0.2
    // }
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

  // 심볼별 마지막 처리된 데이터 시간 (중복 매매 방지)
  private lastProcessedTime = new Map<string, number>();

  /**
   * 틱 데이터 수신 - 매매 판단 진입점
   * @param currentTime 현재 시뮬레이션 시간
   * @param snapshots 각 심볼별 스냅샷 (currentTime 이전의 모든 quotes 포함)
   */
  onTick(currentTime: Date, snapshots: SymbolSnapshot[]): void {
    for (const snapshot of snapshots) {
      const { symbol, quotes } = snapshot;
      if (quotes.length === 0) continue;

      const latestQuote = quotes[quotes.length - 1];
      const quoteTime = latestQuote.time.getTime();
      const lastTime = this.lastProcessedTime.get(symbol) || 0;

      // 이미 처리한 데이터면 스킵 (중복 매매 방지)
      if (quoteTime <= lastTime) continue;

      // 새로운 데이터 처리
      this.lastProcessedTime.set(symbol, quoteTime);

      // TODO: 매매 로직 구현
      // - latestQuote.crossStatus로 골든/데드 크로스 상태 확인
      // - quotes 배열로 과거 데이터 참조 가능
      // - 매수 조건 충족 시: this.buyStock(symbol, latestQuote)
      // - 매도 조건 충족 시: this.sellStock(symbol, latestQuote)
    }
  }

  // 매수 (TODO: 나중에 구현)
  private buyStock(symbol: string, quote: TickData): boolean {
    // TODO: 구현 예정
    return false;
  }

  // 매도 (TODO: 나중에 구현)
  private sellStock(symbol: string, quote: TickData): boolean {
    // TODO: 구현 예정
    return false;
  }
}
