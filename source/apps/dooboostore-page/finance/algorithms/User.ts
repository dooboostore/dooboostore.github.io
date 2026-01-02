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
      slopeThreshold: 0.1, // 매수 시점 기울기 임계값  undefined 이면 기울기 필터링 안함
      groupCrossCheck: true // symbol이 속한 그룹이 골든크로스 상태인지 추가 확인  undefined 이면 체크안함
    },

    sell: {
      rate: 0.5, // 보유량 대비 매도 비율
      moreRate: 0.25, // 추가 매도 비율 (피라미딩용)  undefined 이면 피라미딩 안함
      stopLossPercent: 0.05, // 손절 퍼센트  undefined 이면 손절 안함
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

  // 심볼이 속한 그룹 찾기
  private getGroupForSymbol(symbol: string): Group | undefined {
    return this.groups.find(g => g.symbols.includes(symbol));
  }

  /**
   * 틱 데이터 수신 - 매매 판단 진입점
   * @param currentTime 현재 시뮬레이션 시간
   * @param snapshots 각 심볼별 스냅샷 (currentTime 이전의 모든 quotes 포함)
   */
  onTick(currentTime: Date, snapshots: SymbolSnapshot[]): void {
    // 그룹/심볼 분리 (Map으로 중복 방지)
    const groupSnapshots = new Map<string, SymbolSnapshot>();
    const symbolSnapshots = new Map<string, SymbolSnapshot>();
    
    for (const snapshot of snapshots) {
      if (snapshot.isGroup) {
        groupSnapshots.set(snapshot.symbol, snapshot);
      } else {
        symbolSnapshots.set(snapshot.symbol, snapshot);
      }
    }

    symbolSnapshots.forEach((snapshot, symbol) => {
      const { quotes } = snapshot;
      if (quotes.length === 0) return;

      const latestQuote = quotes[quotes.length - 1];
      const quoteTime = latestQuote.time.getTime();
      const lastTime = this.lastProcessedTime.get(symbol) || 0;

      // 이미 처리한 데이터면 스킵 (중복 매매 방지)
      if (quoteTime <= lastTime) return;

      // 새로운 데이터 처리
      this.lastProcessedTime.set(symbol, quoteTime);

      // 그룹 크로스 상태 확인
      const group = this.getGroupForSymbol(symbol);
      let groupCrossStatus: 'GOLDEN' | 'DEAD' | undefined = undefined;
      if (group) {
        const groupSnapshot = groupSnapshots.get(group.group);
        if (groupSnapshot && groupSnapshot.quotes.length > 0) {
          groupCrossStatus = groupSnapshot.quotes[groupSnapshot.quotes.length - 1].crossStatus;
        }
      }

      // 보유 여부 확인
      const holding = this.account.getHolding(symbol);
      const hasHolding = holding !== undefined && holding.quantity > 0;

      // 매도 체크 (보유 중일 때)
      if (hasHolding) {
        // 손절 체크
        if (this.config.sell?.stopLossPercent !== undefined) {
          const lossPercent = (latestQuote.actualClose - holding.avgPrice) / holding.avgPrice;
          if (lossPercent <= -this.config.sell.stopLossPercent) {
            this.sellStock(symbol, latestQuote, 1.0, 'STOP_LOSS'); // 전량 손절
            return;
          }
        }

        // 데드크로스 매도
        if (latestQuote.crossStatus === 'DEAD') {
          let canSell = true;

          // 기울기 체크 (priceSlope가 음수여야 함)
          if (this.config.buy?.slopeThreshold !== undefined) {
            if (latestQuote.priceSlope > -this.config.buy.slopeThreshold) {
              canSell = false;
            }
          }

          // 그룹 크로스 체크
          if (canSell && this.config.sell?.groupCrossCheck) {
            if (groupCrossStatus !== 'DEAD') {
              canSell = false;
            }
          }

          if (canSell) {
            const rate = this.config.sell?.rate ?? 0.5;
            this.sellStock(symbol, latestQuote, rate, 'DEAD_CROSS');
          }
        }
      }

      // 매수 체크 (골든크로스)
      if (latestQuote.crossStatus === 'GOLDEN') {
        let canBuy = true;

        // 기울기 체크 (priceSlope가 양수여야 함)
        if (this.config.buy?.slopeThreshold !== undefined) {
          if (latestQuote.priceSlope < this.config.buy.slopeThreshold) {
            canBuy = false;
          }
        }

        // 그룹 크로스 체크
        if (canBuy && this.config.buy?.groupCrossCheck) {
          if (groupCrossStatus !== 'GOLDEN') {
            canBuy = false;
          }
        }

        if (canBuy) {
          if (hasHolding) {
            // 피라미딩 (추가 매수)
            if (this.config.buy?.moreRate !== undefined) {
              this.buyStock(symbol, latestQuote, this.config.buy.moreRate, true);
            }
          } else {
            // 신규 매수
            const rate = this.config.buy?.rate ?? 0.1;
            this.buyStock(symbol, latestQuote, rate, false);
          }
        }
      }
    });
  }

  // 매수
  private buyStock(symbol: string, quote: TickData, rate: number, isPyramiding: boolean): boolean {
    const buyAmount = this.account.balance * rate;
    if (buyAmount <= 0 || quote.actualClose <= 0) return false;

    const quantity = Math.floor(buyAmount / quote.actualClose);
    if (quantity <= 0) return false;

    const fees = buyAmount * this.config.tradeFees.buy;
    const total = buyAmount + fees;

    if (total > this.account.balance) return false;

    // 잔고 차감
    this.account.balance -= total;

    // 보유 종목 업데이트
    const existing = this.account.getHolding(symbol);
    if (existing) {
      const totalQuantity = existing.quantity + quantity;
      const totalCost = existing.avgPrice * existing.quantity + quote.actualClose * quantity;
      existing.avgPrice = totalCost / totalQuantity;
      existing.quantity = totalQuantity;
      if (quote.actualClose > existing.maxPrice) {
        existing.maxPrice = quote.actualClose;
      }
    } else {
      this.account.setHolding(symbol, {
        quantity,
        avgPrice: quote.actualClose,
        maxPrice: quote.actualClose,
        buyTime: quote.time
      });
    }

    // 거래 내역 기록
    const tx: Transaction = {
      time: quote.time,
      type: 'BUY',
      symbol,
      quantity,
      price: quote.actualClose,
      fees,
      total,
      isPyramiding
    };
    this.account.addTransaction(tx);

    // 심볼별 거래 내역 기록
    if (!this.symbolTransactionsMap.has(symbol)) {
      this.symbolTransactionsMap.set(symbol, []);
    }
    this.symbolTransactionsMap.get(symbol)!.push(tx);

    console.log(`📈 BUY ${symbol}: ${quantity}주 @ ${quote.actualClose.toLocaleString()}원 (${isPyramiding ? '피라미딩' : '신규'})`);
    return true;
  }

  // 매도
  private sellStock(symbol: string, quote: TickData, rate: number, reason: string): boolean {
    const holding = this.account.getHolding(symbol);
    if (!holding || holding.quantity <= 0) return false;

    const sellQuantity = Math.floor(holding.quantity * rate);
    if (sellQuantity <= 0) return false;

    const sellAmount = sellQuantity * quote.actualClose;
    const fees = sellAmount * this.config.tradeFees.sell;
    const total = sellAmount - fees;

    // 손익 계산
    const costBasis = holding.avgPrice * sellQuantity;
    const profit = total - costBasis;

    // 잔고 증가
    this.account.balance += total;

    // 보유 종목 업데이트
    holding.quantity -= sellQuantity;
    if (holding.quantity <= 0) {
      this.account.deleteHolding(symbol);
    }

    // 거래 내역 기록
    const tx: Transaction = {
      time: quote.time,
      type: 'SELL',
      symbol,
      quantity: sellQuantity,
      price: quote.actualClose,
      fees,
      total,
      avgBuyPrice: holding.avgPrice,
      profit,
      reason
    };
    this.account.addTransaction(tx);

    // 심볼별 거래 내역 기록
    if (!this.symbolTransactionsMap.has(symbol)) {
      this.symbolTransactionsMap.set(symbol, []);
    }
    this.symbolTransactionsMap.get(symbol)!.push(tx);

    const profitPercent = ((quote.actualClose - holding.avgPrice) / holding.avgPrice * 100).toFixed(2);
    console.log(`📉 SELL ${symbol}: ${sellQuantity}주 @ ${quote.actualClose.toLocaleString()}원 (${reason}, ${profitPercent}%)`);
    return true;
  }
}
