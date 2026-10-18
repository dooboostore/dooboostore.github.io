import { Sim } from '@dooboostore/simple-boot';
import { ConstructorType } from '@dooboostore/core';

export namespace GpuRentalService {
  export const SYMBOL = Symbol.for('GpuRentalService');
}

export interface GpuRentalService {
  /** 공식 공개 가격 히스토리 (90일 median + 메타, Attribution: vast.ai) */
  getPriceHistory(): Promise<Record<string, GpuPriceHistory>>;
}

/** GPU 히스토리 1종 */
export interface GpuPriceHistory {
  readonly name: string;
  readonly vramGb: number | null;
  readonly tier: string;
  readonly available: number;
  readonly curMin: number;
  readonly curMedian: number;
  readonly daily: readonly { date: string; median: number }[];
}

export default (container: symbol): ConstructorType<GpuRentalService> => {
  @Sim({ symbol: GpuRentalService.SYMBOL, container })
  class GpuRentalServiceImpl implements GpuRentalService {
    private readonly CORS_PROXY = 'https://sparkling-dew-b13c.visualkhh.workers.dev/?url=';

    private async fetchJson<T>(url: string): Promise<T> {
      const res = await fetch(`${this.CORS_PROXY}${encodeURIComponent(url)}`, {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    }

    async getPriceHistory(): Promise<Record<string, GpuPriceHistory>> {
      const json = await this.fetchJson<any>(
        'https://storage.googleapis.com/vast-public-gpu-pricing/gpu-pricing-public.json',
      );
      const gpus = json?.gpus ?? {};
      const out: Record<string, GpuPriceHistory> = {};
      for (const [slug, g] of Object.entries<any>(gpus)) {
        const name = String(g?.name ?? slug);
        const daily = Array.isArray(g?.daily) ? g.daily : [];
        const cur = g?.current ?? {};
        out[name] = {
          name,
          vramGb: g?.vram_gb ?? null,
          tier: String(g?.tier ?? ''),
          available: Number(g?.available ?? cur?.available ?? 0),
          curMin: Number(cur?.min ?? 0),
          curMedian: Number(cur?.median ?? 0),
          daily: daily
            .filter(d => d && d.date && Number.isFinite(Number(d.median)))
            .map(d => ({ date: String(d.date), median: Number(d.median) }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        };
      }
      return out;
    }
  }
  return GpuRentalServiceImpl as unknown as ConstructorType<GpuRentalService>;
};
