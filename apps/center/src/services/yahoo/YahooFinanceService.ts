import { Sim } from '@dooboostore/simple-boot';
import { ConstructorType } from '@dooboostore/core';

export namespace YahooFinanceService {
  export const SYMBOL = Symbol.for('YahooFinanceService');
}

/** 일봉 1건 (날짜 + 종가, OHLCV 옵션) */
export interface YahooDailyBar {
  readonly date: string; // YYYY-MM-DD (분봉은 ISO 전체)
  readonly close: number;
  readonly open?: number;
  readonly high?: number;
  readonly low?: number;
  readonly volume?: number;
  /** 원본 unix초 (페이징용) */
  readonly ts?: number;
}

/** 매크로 3종 (TNX/WTI/S&P500) 일봉 묶음 */
export interface YahooMacroDaily {
  readonly tnx: readonly YahooDailyBar[];
  readonly wti: readonly YahooDailyBar[];
  readonly spx: readonly YahooDailyBar[];
}

export interface YahooFinanceService {
  /** Yahoo chart 일봉 조회 (symbol 예: '^TNX', 'CL=F', '^GSPC', '005930.KS') */
  getDaily(symbol: string, range?: string): Promise<readonly YahooDailyBar[]>;
  /** 기간 지정 일봉 조회 (period1/period2 unix초, 무한스크롤용) */
  /** 기간 지정 조회 (period1/period2 unix초, 무한스크롤용. interval 기본 1d) */
  getDailyRange(symbol: string, period1: number, period2: number, interval?: string): Promise<readonly YahooDailyBar[]>;
  /** 매크로 3종 일괄 조회 (엔진 MarketSeries 재료) */
  getMacroDaily(range?: string): Promise<YahooMacroDaily>;
}

export default (container: symbol): ConstructorType<YahooFinanceService> => {
  @Sim({ symbol: YahooFinanceService.SYMBOL, container })
  class YahooFinanceServiceImpl implements YahooFinanceService {
    // TossService와 동일 CORS 프록시 (서버/브라우저 모두 동작)
    private readonly CORS_PROXY = 'https://sparkling-dew-b13c.visualkhh.workers.dev/?url=';
    private readonly CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

    private async fetchJson<T>(url: string): Promise<T> {
      // 정적 배포 전제: 전부 workers 프록시 경유 (dev 포함)
      const target = `${this.CORS_PROXY}${encodeURIComponent(url)}`;
      const res = await fetch(target, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    }

    private async chart(symbol: string, query: string, interval = '1d'): Promise<readonly YahooDailyBar[]> {
      const url = `${this.CHART_BASE}/${encodeURIComponent(symbol)}?${query}&interval=${interval}`;
      const json = await this.fetchJson<any>(url);
      const res = json?.chart?.result?.[0];
      if (!res) throw new Error('Invalid chart response');
      const ts: number[] = res.timestamp ?? [];
      const q = res.indicators?.quote?.[0] ?? {};
      const cl: (number | null)[] = q.close ?? [];
      const op: (number | null)[] = q.open ?? [];
      const hi: (number | null)[] = q.high ?? [];
      const lo: (number | null)[] = q.low ?? [];
      const vo: (number | null)[] = q.volume ?? [];
      const out: YahooDailyBar[] = [];
      const isMin = interval.startsWith('1m') || interval.startsWith('min');
      ts.forEach((t, i) => {
        const c = cl[i];
        if (c == null || !Number.isFinite(c)) return;
        out.push({
          date: isMin
            ? new Date(t * 1000).toISOString().slice(0, 16)
            : new Date(t * 1000).toISOString().slice(0, 10),
          close: c, ts: t,
          open: op[i] ?? undefined, high: hi[i] ?? undefined,
          low: lo[i] ?? undefined, volume: vo[i] ?? undefined,
        });
      });
      return out;
    }

    async getDaily(symbol: string, range = '1y'): Promise<readonly YahooDailyBar[]> {
      return this.chart(symbol, `range=${encodeURIComponent(range)}`);
    }

    async getDailyRange(symbol: string, period1: number, period2: number, interval = '1d'): Promise<readonly YahooDailyBar[]> {
      return this.chart(symbol, `period1=${period1}&period2=${period2}`, interval);
    }

    async getMacroDaily(range = '1y'): Promise<YahooMacroDaily> {
      const [tnx, wti, spx] = await Promise.all([
        this.getDaily('^TNX', range),
        this.getDaily('CL=F', range),
        this.getDaily('^GSPC', range),
      ]);
      return { tnx, wti, spx };
    }
  }
  return YahooFinanceServiceImpl as unknown as ConstructorType<YahooFinanceService>;
};
