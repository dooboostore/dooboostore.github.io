import { Sim } from '@dooboostore/simple-boot';
import { ConstructorType } from '@dooboostore/core';

export namespace StockService {
  export const SYMBOL = Symbol.for('StockService');
}

export interface Candle {
  dt: string;
  base: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}

export interface CurrentPrice {
  price: number;
  strength: number;  // 체결강도 (0-100)
  priceChangePercent?: number; // 이전 price 대비 변동률
}

export interface MinCandlesResponse {
  code: string;
  nextDateTime: string;
  candles: Candle[];
}

export interface StockService {
  findStockCode(keyword: string): string;
  getMinCandles(code: string, count: number): MinCandlesResponse;
  getMinLastCompleteCandle(code: string): Candle;
  getCurrentCandle(code: string): Candle;
  getCurrent(code: string): CurrentPrice;
  getCurrentPrice(code: string): number; // 현재 price 값 반환
}

// 더미 데이터용 주식 정보
const STOCKS = [
  { code: 'A000660', name: '삼성전자' },
  { code: 'A000831', name: 'SK하이닉스' },
];

// 팩토리: Accommodation 패턴
export default (container: symbol): ConstructorType<StockService> => {
  @Sim({ symbol: StockService.SYMBOL, container: container })
  class StockServiceImpl implements StockService {
    private candleCache: Map<string, Candle[]> = new Map();
    private currentCandleCache: Map<string, Candle> = new Map();
    private currentPriceCache: Map<string, { price: number; strength: number }> = new Map();
    private candleStartTime: Map<string, number> = new Map();
    private priceUpdateInterval: NodeJS.Timeout | null = null;

    constructor() {
      // 생성자에서 더미 데이터 초기화
      this.initializeDummyData();
      
      // 1초마다 현재 가격과 체결강도 업데이트 (1분마다 candle 완성)
      this.startPriceUpdate();
    }

    /**
     * 더미 데이터 초기화 - 이전 close → 다음 open으로 연결되는 자연스러운 흐름
     */
    private initializeDummyData(): void {
      const codes = ['A000660', 'A000831'];
      const now = Date.now();

      // 종목별 시작 가격
      const startPrices: Record<string, number> = {
        'A000660': 1840000,
        'A000831': 1840000,
      };

      for (const code of codes) {
        const candles: Candle[] = [];

        // 첫 캔들 시작가
        let prevClose = startPrices[code];

        for (let i = 255; i >= 0; i--) {
          const candleTime = new Date(now - i * 60 * 1000);

          // open = 이전 close (갭 없이 연결)
          const openPrice = prevClose;

          // 1분 동안의 가격 변동: ±0.5% 이내
          const changeRate = (Math.random() * 0.01 - 0.005);
          const closePrice = Math.floor(openPrice * (1 + changeRate));

          // high/low: open~close 범위에서 약간 벗어남
          const highPrice = Math.floor(Math.max(openPrice, closePrice) * (1 + Math.random() * 0.003));
          const lowPrice  = Math.floor(Math.min(openPrice, closePrice) * (1 - Math.random() * 0.003));

          candles.push({
            dt: candleTime.toISOString().replace('Z', '+09:00'),
            base: openPrice,
            open: openPrice,
            high: highPrice,
            low: lowPrice,
            close: closePrice,
            volume: Math.floor(Math.random() * 80000 + 10000),
            amount: 0,
          });

          prevClose = closePrice;
        }

        this.candleCache.set(code, candles);

        // 현재 캔들: 마지막 close에서 시작
        const currentOpen = prevClose;
        const currentClose = Math.floor(currentOpen * (1 + (Math.random() * 0.006 - 0.003)));
        const currentHigh  = Math.floor(Math.max(currentOpen, currentClose) * (1 + Math.random() * 0.002));
        const currentLow   = Math.floor(Math.min(currentOpen, currentClose) * (1 - Math.random() * 0.002));

        this.currentCandleCache.set(code, {
          dt: new Date(now).toISOString().replace('Z', '+09:00'),
          base: currentOpen,
          open: currentOpen,
          high: currentHigh,
          low: currentLow,
          close: currentClose,
          volume: 0,
          amount: 0,
        });

        this.currentPriceCache.set(code, {
          price: currentClose,
          strength: Math.floor(Math.random() * 40 + 80),
        });

        this.candleStartTime.set(code, now);
      }
        // temporary debug: log completed candle volume
        try {
          console.log('[CANDLE-COMPLETE]', code, 'completedVol=', currentCandle.volume);
        } catch (e) {
          // ignore
        }
      // removed debug log
    }

    /**
     * 1초마다 현재 가격과 체결강도 업데이트 (1분마다 candle 완성)
     */
    private startPriceUpdate(): void {
      this.priceUpdateInterval = setInterval(() => {
        this.updateCurrentPrice();
      }, 1000); // 1초(1000ms)마다 실행
    }

    /**
     * 현재 가격과 체결강도 업데이트 및 1분마다 candle 완성
     */
    private updateCurrentPrice(): void {
      const codes = ['A000660', 'A000831'];
      const now = Date.now();
      
      for (const code of codes) {
        const currentCandle = this.currentCandleCache.get(code);
        const prevData = this.currentPriceCache.get(code) || { price: 1840000, strength: 50 };
        const candleStartTime = this.candleStartTime.get(code) || now;
        
        if (!currentCandle) continue;
        
        // 매초 소폭 변동: ±0.05% 이내 (실제 틱 움직임처럼)
        const changePercent = (Math.random() * 0.005 - 0.0025);
        const targetPrice = prevData.price * (1 + changePercent);
        const targetStrength = Math.floor(Math.random() * 40 + 80);

        // 보간 없이 바로 적용 (이미 변동폭이 작으므로)
        const smoothPrice = targetPrice;
        const smoothStrength = prevData.strength + (targetStrength - prevData.strength) * 0.1;
        
        const result = {
          price: Math.floor(smoothPrice),
          strength: Math.floor(smoothStrength),
          priceChangePercent: ((smoothPrice - prevData.price) / prevData.price) * 100, // 이전 price 대비 변동률
        };
        
        // 현재 candle 업데이트
        currentCandle.close = result.price;
        currentCandle.high = Math.max(currentCandle.high, result.price);
        currentCandle.low = Math.min(currentCandle.low, result.price);
        
        // volume: 매초 랜덤하게 누적 (실제처럼 들쭉날쭉)
        const prevVolume = currentCandle.volume;
        // 평균 833/초 기준, 0~3배 사이 랜덤 → 0~2500 사이
        const addVolume = Math.floor(Math.random() * Math.random() * 2500);
        currentCandle.volume = prevVolume + addVolume;
        
        // 캐시 업데이트
        this.currentPriceCache.set(code, result);
        
        // 1분(60000ms) 경과 확인
        if (now - candleStartTime >= 60000) {
          this.completeCandle(code, now);
        }
      }
    }

    /**
     * 현재 candle을 완성하고 새로운 candle 시작
     * 새 캔들의 open = 이전 캔들의 close (갭 없이 연결)
     */
    private completeCandle(code: string, now: number): void {
      const candles = this.candleCache.get(code) || [];
      const currentCandle = this.currentCandleCache.get(code);

      if (!currentCandle) return;

      // 현재 candle을 완성된 candle로 추가
      candles.push({ ...currentCandle });

      // 최대 256개 유지
      if (candles.length > 256) {
        candles.shift();
      }

      this.candleCache.set(code, candles);

      // 새 캔들: open = 이전 close (연속성 유지)
      const newOpen  = currentCandle.close;
      const changeRate = (Math.random() * 0.01 - 0.005); // ±0.5%
      const newClose = Math.floor(newOpen * (1 + changeRate));
      const newHigh  = Math.floor(Math.max(newOpen, newClose) * (1 + Math.random() * 0.003));
      const newLow   = Math.floor(Math.min(newOpen, newClose) * (1 - Math.random() * 0.003));

      this.currentCandleCache.set(code, {
        dt: new Date(now).toISOString().replace('Z', '+09:00'),
        base: newOpen,
        open: newOpen,
        high: newHigh,
        low: newLow,
        close: newClose,
        volume: 0,
        amount: 0,
      });

      this.candleStartTime.set(code, now);

      // removed debug log
    }

    /**
     * 주식 코드 검색
     */
    findStockCode(keyword: string): string {
      const stock = STOCKS.find(
        (s) =>
          s.code.includes(keyword) ||
          s.name.includes(keyword)
      );
      
      if (!stock) {
        console.warn('[StockService] Stock not found for keyword:', keyword);
        return '';
      }
      
      // removed debug log
      return stock.code;
    }

    /**
     * 1분 단위 캔들 데이터 조회
     */
    getMinCandles(code: string, count: number): MinCandlesResponse {
      const candles = this.candleCache.get(code) || [];
      
      // 최근 count개의 캔들 반환
      const selectedCandles = candles.slice(Math.max(0, candles.length - count));
      
      // 다음 시간 계산
      const lastCandle = selectedCandles[selectedCandles.length - 1];
      const lastTime = new Date(lastCandle.dt);
      const nextTime = new Date(lastTime.getTime() + 60 * 1000);
      
      // removed debug log
      
      return {
        code,
        nextDateTime: nextTime.toISOString().replace('Z', '+09:00'),
        candles: selectedCandles,
      };
    }

    /**
     * 마지막 완성된 1분 캔들 조회
     */
    getMinLastCompleteCandle(code: string): Candle {
      const candles = this.candleCache.get(code) || [];
      
      if (candles.length === 0) {
        console.warn('[StockService] No candles found for code:', code);
        return {
          dt: new Date().toISOString().replace('Z', '+09:00'),
          base: 0,
          open: 0,
          high: 0,
          low: 0,
          close: 0,
          volume: 0,
          amount: 0,
        };
      }
      
      const lastCandle = candles[candles.length - 1];
      // removed debug log
      
      return lastCandle;
    }

    /**
     * 현재 진행 중인 캔들 조회
     */
    getCurrentCandle(code: string): Candle {
      const currentCandle = this.currentCandleCache.get(code);
      
      if (!currentCandle) {
        console.warn('[StockService] No current candle found for code:', code);
        return {
          dt: new Date().toISOString().replace('Z', '+09:00'),
          base: 0,
          open: 0,
          high: 0,
          low: 0,
          close: 0,
          volume: 0,
          amount: 0,
        };
      }
      
      return { ...currentCandle };
    }

    /**
     * 현재 가격과 체결강도 조회
     */
    getCurrent(code: string): CurrentPrice {
      const cachedPrice = this.currentPriceCache.get(code);
      
      if (!cachedPrice) {
        console.warn('[StockService] No cached price found for code:', code);
        return {
          price: 0,
          strength: 0,
        };
      }
      
      // removed debug log
      
      return cachedPrice;
    }

    /**
     * 현재 price 값만 반환
     */
    getCurrentPrice(code: string): number {
      const cachedPrice = this.currentPriceCache.get(code);
      return cachedPrice?.price || 0;
    }
  }
  
  return StockServiceImpl;
};
