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
    to: 10,
    above: [10]
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
      rate: 0.1, // 잔액 대비 매수 비율 (0~1)
      moreRate: 0.05, // 추가 매수 비율 (피라미딩용, 0~1)  undefined 이면 피라미딩 안함
      moreRateType: 'balance' as const, // balance: 잔고 기준, position: 현재 포지션 기준, initial: 첫 매수금액 기준
      slopeThresholdRate: 0.0, // 첫 매수 시점 기울기 임계값 (0~1, 예: 0.04 = 4%)  undefined 이면 기울기 필터링 안함
      slopeThresholdType: 'up' as const, // up: 상승 시, down: 하락 시, any: 무관

      moreSlopeThresholdRate: 0.02 as number | undefined, // 피라미딩 매수 기울기 임계값 (없으면 slopeThresholdRate 사용)
      moreSlopeThresholdType: 'up' as const, // 피라미딩 매수 기울기 타입 (없으면 slopeThresholdType 사용)
      groupCrossCheck: true // symbol이 속한 그룹이 골든크로스 상태인지 추가 확인  undefined 이면 체크안함
    },

    sell: {
      rate: 0.5, // 보유량 대비 매도 비율 (0~1)
      moreRate: 0.25, // 추가 매도 비율 (피라미딩용, 0~1)  undefined 이면 피라미딩 안함
      moreRateType: 'holding' as const, // holding: 현재 보유량 기준, initial: 첫 매도수량 기준
      slopeThresholdRate: 0.0, // 첫 매도 시점 기울기 임계값 (0~1, 예: 0.04 = 4%)
      slopeThresholdType: 'down' as const, // up: 상승 시, down: 하락 시, any: 무관

      moreSlopeThresholdRate: 0.004 as number | undefined, // 피라미딩 매도 기울기 임계값 (없으면 slopeThresholdRate 사용)
      moreSlopeThresholdType: 'down' as const, // 피라미딩 매도 기울기 타입 (없으면 slopeThresholdType 사용)
      stopLossRate: 0.02, // 손절 비율 (0~1, 예: 0.10 = 10%)  undefined 이면 손절 안함
      groupCrossCheck: true, // symbol이 속한 그룹이 데드크로스 상태인지 추가 확인  undefined 이면 체크안함
      // 익절 설정 (피라미딩 익절)
      takeProfit: {
        // 평균 매수가(avgPrice) 대비 현재가의 수익률로 익절 판단해
        thresholdRate: 0.05, // 첫 익절 기준 수익률 (10%)
        moreThresholdRate: 0.05, // 추가 익절 간격 (10%씩, 즉 20%, 30%, 40%...)
        rate: 0.3, // 첫 익절 매도 비율 (30%)
        moreRate: 0.3 // 추가 익절 매도 비율 (30%)
      }
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

  // 심볼별 첫 매도 여부 추적 (데드크로스 구간에서 피라미딩 구분용)
  private firstSellDone = new Map<string, boolean>();

  // 심볼별 첫 매수 금액 (피라미딩 계산용)
  private initialBuyAmount = new Map<string, number>();

  // 심볼별 첫 매도 수량 (피라미딩 계산용)
  private initialSellQuantity = new Map<string, number>();

  // 심볼별 익절 횟수 추적 (피라미딩 익절용)
  private takeProfitCount = new Map<string, number>();

  // 심볼별 손절 후 새 골든크로스 대기 상태 (손절 후 재매수 방지)
  private waitingNewGoldenCross = new Map<string, boolean>();

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

      // 이번 틱에서 매도 발생 여부 (매도 후 같은 틱에서 매수 금지)
      let soldThisTick = false;

      // 매도 체크 (보유 중일 때)
      if (hasHolding) {
        // 손절 체크
        if (this.config.sell?.stopLossRate !== undefined) {
          const lossRate = (latestQuote.actualClose - holding.avgPrice) / holding.avgPrice;
          if (lossRate <= -this.config.sell.stopLossRate) {
            console.log(`🚨 STOP_LOSS 발동! ${symbol}: 손실률 ${(lossRate * 100).toFixed(2)}%`);
            this.sellStock(symbol, latestQuote, 1.0, 'STOP_LOSS', false); // 전량 손절
            this.takeProfitCount.set(symbol, 0); // 익절 카운트 리셋
            this.waitingNewGoldenCross.set(symbol, true); // 새 골든크로스 대기 상태로 전환
            return;
          }
        }

        // 익절 체크 (피라미딩 익절)
        const takeProfit = this.config.sell?.takeProfit;
        if (takeProfit) {
          const profitRate = (latestQuote.actualClose - holding.avgPrice) / holding.avgPrice;
          const count = this.takeProfitCount.get(symbol) || 0;

          // 다음 익절 기준 수익률 계산
          const moreThreshold = takeProfit.moreThresholdRate ?? takeProfit.thresholdRate;
          const nextThreshold = takeProfit.thresholdRate + count * moreThreshold;

          if (profitRate >= nextThreshold) {
            const sellRate = count === 0 ? takeProfit.rate : (takeProfit.moreRate ?? takeProfit.rate);

            console.log(
              `💰 TAKE_PROFIT 발동! ${symbol}: 수익률 ${(profitRate * 100).toFixed(2)}% >= ${(nextThreshold * 100).toFixed(2)}% (${count + 1}차 익절)`
            );
            this.sellStock(symbol, latestQuote, sellRate, `TAKE_PROFIT_${count + 1}`, count > 0);
            this.takeProfitCount.set(symbol, count + 1);
            soldThisTick = true;
          }
        }

        // 데드크로스 매도
        if (latestQuote.crossStatus === 'DEAD') {
          const isFirstSell = !this.firstSellDone.get(symbol);

          // 기울기 임계값 결정: 피라미딩은 moreSlopeThresholdRate, 없으면 slopeThresholdRate 사용
          const slopeThresholdRate = isFirstSell
            ? this.config.sell?.slopeThresholdRate
            : (this.config.sell?.moreSlopeThresholdRate ?? this.config.sell?.slopeThresholdRate);

          // 기울기 타입 결정: 피라미딩은 moreSlopeThresholdType, 없으면 slopeThresholdType 사용
          const slopeType = isFirstSell
            ? (this.config.sell?.slopeThresholdType ?? 'any')
            : (this.config.sell?.moreSlopeThresholdType ?? this.config.sell?.slopeThresholdType ?? 'any');

          let canSell = true;

          // 기울기 체크 - priceSlope는 % 단위, slopeThresholdRate는 0~1 비율
          // slopeType: 'up'=상승 시, 'down'=하락 시, 'any'=방향 무관 (절대값으로 임계값 체크)
          if (slopeThresholdRate !== undefined) {
            const thresholdPercent = slopeThresholdRate * 100;

            console.log(
              `[${symbol}] 매도 기울기 체크: priceSlope=${latestQuote.priceSlope.toFixed(4)}%, threshold=${thresholdPercent.toFixed(2)}%, type=${slopeType} [${isFirstSell ? '첫매도' : '피라미딩'}]`
            );

            if (slopeType === 'down') {
              // 하락 시에만 매도: priceSlope <= -threshold
              if (latestQuote.priceSlope > -thresholdPercent) {
                canSell = false;
                console.log(
                  `[${symbol}] 매도 스킵: 기울기 부족 (${latestQuote.priceSlope.toFixed(4)}% > -${thresholdPercent.toFixed(2)}%) [${isFirstSell ? '첫매도' : '피라미딩'}]`
                );
              }
            } else if (slopeType === 'up') {
              // 상승 시에만 매도: priceSlope >= threshold
              if (latestQuote.priceSlope < thresholdPercent) {
                canSell = false;
                console.log(
                  `[${symbol}] 매도 스킵: 기울기 부족 (${latestQuote.priceSlope.toFixed(4)}% < ${thresholdPercent.toFixed(2)}%) [${isFirstSell ? '첫매도' : '피라미딩'}]`
                );
              }
            } else {
              // 'any': 방향 무관, 절대값으로 임계값 체크
              if (Math.abs(latestQuote.priceSlope) < thresholdPercent) {
                canSell = false;
                console.log(
                  `[${symbol}] 매도 스킵: 기울기 부족 (|${latestQuote.priceSlope.toFixed(4)}%| < ${thresholdPercent.toFixed(2)}%) [${isFirstSell ? '첫매도' : '피라미딩'}]`
                );
              }
            }
          }

          // 그룹 크로스 체크
          if (canSell && this.config.sell?.groupCrossCheck) {
            if (groupCrossStatus !== 'DEAD') {
              canSell = false;
            }
          }

          if (canSell) {
            if (isFirstSell) {
              // 첫 매도
              const rate = this.config.sell?.rate ?? 0.5;
              this.sellStock(symbol, latestQuote, rate, 'DEAD_CROSS', false);
              this.firstSellDone.set(symbol, true);
              soldThisTick = true;
            } else {
              // 추가 매도 (피라미딩)
              if (this.config.sell?.moreRate !== undefined) {
                this.sellStock(symbol, latestQuote, this.config.sell.moreRate, 'DEAD_CROSS_MORE', true);
                soldThisTick = true;
              }
            }
          }
        } else {
          // 데드크로스 아니면 첫 매도 플래그 리셋
          this.firstSellDone.set(symbol, false);
        }
      }

      // 매도 발생 시 같은 틱에서 매수 금지
      if (soldThisTick) return;

      // 손절 후 새 골든크로스 대기 상태 체크
      if (this.waitingNewGoldenCross.get(symbol)) {
        // 데드크로스가 나오면 대기 상태 해제 (다음 골든크로스에서 매수 가능)
        if (latestQuote.crossStatus === 'DEAD' || latestQuote.crossStatus === undefined) {
          this.waitingNewGoldenCross.set(symbol, false);
          console.log(`[${symbol}] 손절 후 데드크로스 확인 - 새 골든크로스 대기 해제`);
        } else {
          // 아직 골든크로스 상태면 매수 금지
          console.log(`[${symbol}] 손절 후 새 골든크로스 대기 중 - 매수 스킵`);
          return;
        }
      }

      // 매수 체크 (골든크로스)
      if (latestQuote.crossStatus === 'GOLDEN') {
        // 현재 보유 여부 다시 확인 (매도로 인해 변경되었을 수 있음)
        const currentHolding = this.account.getHolding(symbol);
        const isPyramiding = currentHolding !== undefined && currentHolding.quantity > 0;

        // 기울기 임계값 결정: 피라미딩은 moreSlopeThresholdRate, 없으면 slopeThresholdRate 사용
        const slopeThresholdRate = isPyramiding
          ? (this.config.buy?.moreSlopeThresholdRate ?? this.config.buy?.slopeThresholdRate)
          : this.config.buy?.slopeThresholdRate;

        // 기울기 타입 결정: 피라미딩은 moreSlopeThresholdType, 없으면 slopeThresholdType 사용
        const slopeType = isPyramiding
          ? (this.config.buy?.moreSlopeThresholdType ?? this.config.buy?.slopeThresholdType ?? 'up')
          : (this.config.buy?.slopeThresholdType ?? 'up');

        let canBuy = true;

        // 기울기 체크 - priceSlope는 % 단위, slopeThresholdRate는 0~1 비율
        // slopeType: 'up'=상승 시, 'down'=하락 시, 'any'=방향 무관 (절대값으로 임계값 체크)
        if (slopeThresholdRate !== undefined) {
          const thresholdPercent = slopeThresholdRate * 100;

          console.log(
            `[${symbol}] 기울기 체크: priceSlope=${latestQuote.priceSlope.toFixed(4)}%, threshold=${thresholdPercent.toFixed(2)}%, type=${slopeType} [${isPyramiding ? '피라미딩' : '신규'}]`
          );

          if (slopeType === 'up') {
            // 상승 시에만 매수: priceSlope >= threshold
            if (latestQuote.priceSlope < thresholdPercent) {
              canBuy = false;
              console.log(
                `[${symbol}] 매수 스킵: 기울기 부족 (${latestQuote.priceSlope.toFixed(4)}% < ${thresholdPercent.toFixed(2)}%) [${isPyramiding ? '피라미딩' : '신규'}]`
              );
            }
          } else if (slopeType === 'down') {
            // 하락 시에만 매수: priceSlope <= -threshold
            if (latestQuote.priceSlope > -thresholdPercent) {
              canBuy = false;
              console.log(
                `[${symbol}] 매수 스킵: 기울기 부족 (${latestQuote.priceSlope.toFixed(4)}% > -${thresholdPercent.toFixed(2)}%) [${isPyramiding ? '피라미딩' : '신규'}]`
              );
            }
          } else {
            // 'any': 방향 무관, 절대값으로 임계값 체크
            if (Math.abs(latestQuote.priceSlope) < thresholdPercent) {
              canBuy = false;
              console.log(
                `[${symbol}] 매수 스킵: 기울기 부족 (|${latestQuote.priceSlope.toFixed(4)}%| < ${thresholdPercent.toFixed(2)}%) [${isPyramiding ? '피라미딩' : '신규'}]`
              );
            }
          }
        }

        // 그룹 크로스 체크
        if (canBuy && this.config.buy?.groupCrossCheck) {
          if (groupCrossStatus !== 'GOLDEN') {
            canBuy = false;
            console.log(`[${symbol}] 매수 스킵: 그룹 크로스 상태 불일치 (그룹: ${groupCrossStatus})`);
          }
        }

        if (canBuy) {
          console.log(
            `[${symbol}] 매수 조건 충족: crossStatus=${latestQuote.crossStatus}, slope=${latestQuote.priceSlope.toFixed(4)}, groupCross=${groupCrossStatus} [${isPyramiding ? '피라미딩' : '신규'}]`
          );
          if (isPyramiding) {
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
    let buyAmount: number;

    if (isPyramiding) {
      const moreRateType = this.config.buy?.moreRateType || 'balance';
      if (moreRateType === 'balance') {
        buyAmount = this.account.balance * rate;
      } else if (moreRateType === 'position') {
        const holding = this.account.getHolding(symbol);
        const positionValue = holding ? holding.quantity * quote.actualClose : 0;
        buyAmount = positionValue * rate;
      } else {
        // initial
        const initialAmount = this.initialBuyAmount.get(symbol) || 0;
        buyAmount = initialAmount * rate;
      }
    } else {
      buyAmount = this.account.balance * rate;
      // 첫 매수 금액 저장
      this.initialBuyAmount.set(symbol, buyAmount);
    }

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
    const holdingAfter = this.account.getHolding(symbol)?.quantity || 0;
    const tx: Transaction = {
      time: quote.time,
      type: 'BUY',
      symbol,
      quantity,
      price: quote.actualClose,
      fees,
      total,
      holdingAfter,
      isPyramiding
    };
    this.account.addTransaction(tx);

    // 심볼별 거래 내역 기록
    if (!this.symbolTransactionsMap.has(symbol)) {
      this.symbolTransactionsMap.set(symbol, []);
    }
    this.symbolTransactionsMap.get(symbol)!.push(tx);

    console.log(
      `📈 BUY ${symbol}: ${quantity}주 @ ${quote.actualClose.toLocaleString()}원 (${isPyramiding ? '피라미딩' : '신규'})`
    );
    return true;
  }

  // 매도
  private sellStock(symbol: string, quote: TickData, rate: number, reason: string, isMore: boolean = false): boolean {
    const holding = this.account.getHolding(symbol);
    if (!holding || holding.quantity <= 0) return false;

    let sellQuantity: number;

    if (isMore) {
      const moreRateType = this.config.sell?.moreRateType || 'holding';
      if (moreRateType === 'holding') {
        sellQuantity = Math.floor(holding.quantity * rate);
      } else {
        // initial
        const initialQty = this.initialSellQuantity.get(symbol) || 0;
        sellQuantity = Math.floor(initialQty * rate);
      }
    } else {
      sellQuantity = Math.floor(holding.quantity * rate);
      // 첫 매도 수량 저장
      this.initialSellQuantity.set(symbol, sellQuantity);
    }

    if (sellQuantity <= 0) {
      // 남은 수량이 적어서 비율 계산으로 0이 된 경우, 전량 매도
      if (holding.quantity > 0 && holding.quantity <= 10) {
        sellQuantity = holding.quantity;
      } else {
        return false;
      }
    }
    // 보유량보다 많이 팔 수 없음
    sellQuantity = Math.min(sellQuantity, holding.quantity);

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
      // 포지션 청산 시 익절 카운트 리셋
      this.takeProfitCount.set(symbol, 0);
    }

    // 거래 내역 기록
    const holdingAfter = holding.quantity; // 이미 위에서 차감됨
    const tx: Transaction = {
      time: quote.time,
      type: 'SELL',
      symbol,
      quantity: sellQuantity,
      price: quote.actualClose,
      fees,
      total,
      holdingAfter,
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

    const profitPercent = (((quote.actualClose - holding.avgPrice) / holding.avgPrice) * 100).toFixed(2);
    console.log(
      `📉 SELL ${symbol}: ${sellQuantity}주 @ ${quote.actualClose.toLocaleString()}원 (${reason}, ${profitPercent}%)`
    );
    return true;
  }
}
