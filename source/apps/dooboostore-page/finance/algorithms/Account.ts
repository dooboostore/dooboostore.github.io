/**
 * 계좌 클래스 - 잔고와 보유 종목 관리
 */

import type { Transaction } from './types';

export interface Holding {
  quantity: number;
  avgPrice: number;
  maxPrice: number;
  buyTime: Date;
}

export class Account {
  initialBalance: number;
  balance: number;
  holdings: Map<string, Holding>;
  transactions: Transaction[];

  // 리스크 관리
  consecutiveLosses: number = 0;
  tradingPaused: boolean = false;

  constructor(initialBalance: number) {
    this.initialBalance = initialBalance;
    this.balance = initialBalance;
    this.holdings = new Map();
    this.transactions = [];
  }

  // 보유 종목 가져오기
  getHolding(symbol: string): Holding | undefined {
    return this.holdings.get(symbol);
  }

  // 보유 여부 확인
  hasHolding(symbol: string): boolean {
    return this.holdings.has(symbol);
  }

  // 보유 종목 설정
  setHolding(symbol: string, holding: Holding): void {
    this.holdings.set(symbol, holding);
  }

  // 보유 종목 삭제
  deleteHolding(symbol: string): void {
    this.holdings.delete(symbol);
  }

  // 거래 내역 추가
  addTransaction(tx: Transaction): void {
    this.transactions.push(tx);
  }

  // 총 자산 계산 (잔고 + 보유 종목 평가액)
  getTotalAssets(getCurrentPrice: (symbol: string) => number | null): number {
    let holdingsValue = 0;
    this.holdings.forEach((holding, symbol) => {
      const price = getCurrentPrice(symbol);
      if (price) {
        holdingsValue += price * holding.quantity;
      }
    });
    return this.balance + holdingsValue;
  }

  // 연속 손실 업데이트
  updateConsecutiveLosses(profit: number, maxConsecutiveLosses: number): void {
    if (profit < 0) {
      this.consecutiveLosses++;
      if (this.consecutiveLosses >= maxConsecutiveLosses) {
        this.tradingPaused = true;
        console.log(`    🚨 Trading PAUSED due to ${this.consecutiveLosses} consecutive losses`);
      }
    } else {
      this.consecutiveLosses = 0;
      if (this.tradingPaused) {
        this.tradingPaused = false;
        console.log(`    ✅ Trading RESUMED after profit`);
      }
    }
  }
}
