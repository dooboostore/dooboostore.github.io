import { Sim } from '@dooboostore/simple-boot';
import { ConstructorType } from '@dooboostore/core';

export namespace RamPriceService {
  export const SYMBOL = Symbol.for('RamPriceService');
}

// ── 카테고리 ────────────────────────────────────────────────────────
export type RamCategory = 'DRAM' | 'HBM' | 'MOBILE' | 'NAND' | 'STORAGE';

export const RAM_CATEGORY_LABELS: Record<RamCategory, string> = {
  DRAM:    'DRAM (PC/서버)',
  HBM:     'HBM (AI 가속기)',
  MOBILE:  '모바일 메모리',
  NAND:    'NAND 플래시',
  STORAGE: '저장장치 (SSD/eMMC/UFS)',
};

// ── 메모리/저장장치 타입 정의 ───────────────────────────────────────
export type RamType =
  // DRAM
  | 'DDR5'
  | 'DDR4'
  | 'DDR3'
  | 'GDDR6'
  // HBM
  | 'HBM4'
  | 'HBM3E'
  | 'HBM3'
  // Mobile
  | 'LPDDR5X'
  | 'LPDDR5'
  | 'LPDDR4'
  // NAND
  | 'NAND_TLC_512G'
  | 'NAND_TLC_1T'
  | 'NAND_QLC_2T'
  // Storage
  | 'SSD_ESSD_30T'
  | 'SSD_RTL_NVME_1T'
  | 'SSD_RTL_NVME_2T'
  | 'SSD_OEM_1T'
  | 'EMMC_32G'
  | 'UFS_128G'
  | 'UFS4_256G';

export interface RamTypeInfo {
  readonly id: RamType;
  readonly label: string;
  readonly description: string;
  readonly color: string;
  readonly category: RamCategory;
  /** memoryindex.io id */
  readonly miId: string;
}

export const RAM_TYPES: readonly RamTypeInfo[] = [
  // ── DRAM ────────────────────────────────────────────────────────
  {
    id: 'DDR5',      label: 'DDR5 16Gb',
    description: 'DDR5 16Gb (2Gx8) 4800/5600 — 최신 PC/서버 메인스트림',
    color: '#d32f2f', category: 'DRAM', miId: 'DDR5-16G',
  },
  {
    id: 'DDR4',      label: 'DDR4 16Gb',
    description: 'DDR4 16Gb (2Gx8) 3200 — PC/서버 레거시 표준',
    color: '#1976d2', category: 'DRAM', miId: 'DDR4-16G',
  },
  {
    id: 'DDR3',      label: 'DDR3 4Gb',
    description: 'DDR3L 4Gb (512Mx8) 1600 — 구형 서버/임베디드',
    color: '#388e3c', category: 'DRAM', miId: 'DDR3-4G',
  },
  {
    id: 'GDDR6',     label: 'GDDR6 16Gb',
    description: 'GDDR6 16Gb 그래픽 메모리 — GPU/게임 콘솔',
    color: '#f57c00', category: 'DRAM', miId: 'GDDR6-16G',
  },
  // ── HBM ─────────────────────────────────────────────────────────
  {
    id: 'HBM4',      label: 'HBM4 48GB',
    description: 'HBM4 48GB 16-Hi Stack — 차세대 AI 가속기 (Blackwell Ultra/MI400)',
    color: '#ad1457', category: 'HBM', miId: 'HBM4-48G',
  },
  {
    id: 'HBM3E',     label: 'HBM3E 36GB',
    description: 'HBM3E 36GB 12-Hi Stack — AI 가속기 (H200/MI300X)',
    color: '#00838f', category: 'HBM', miId: 'HBM3E-36G',
  },
  {
    id: 'HBM3',      label: 'HBM3 24GB',
    description: 'HBM3 24GB 12-Hi Stack — 이전 세대 AI 가속기 (H100)',
    color: '#c2185b', category: 'HBM', miId: 'HBM3-24G',
  },
  // ── Mobile ───────────────────────────────────────────────────────
  {
    id: 'LPDDR5X',   label: 'LPDDR5X 16Gb',
    description: 'LPDDR5X 16Gb (2GB) 8533 — 플래그십 스마트폰/노트북',
    color: '#e65100', category: 'MOBILE', miId: 'LPDDR5X-16G',
  },
  {
    id: 'LPDDR5',    label: 'LPDDR5 16Gb',
    description: 'LPDDR5 16Gb (2GB) 6400 — 중급 모바일',
    color: '#7b1fa2', category: 'MOBILE', miId: 'LPDDR5-16G',
  },
  {
    id: 'LPDDR4',    label: 'LPDDR4X 8Gb',
    description: 'LPDDR4X 8Gb (1GB) 4266 — 보급형 모바일',
    color: '#6a1b9a', category: 'MOBILE', miId: 'LPDDR4X-8G',
  },
  // ── NAND ─────────────────────────────────────────────────────────
  {
    id: 'NAND_TLC_512G', label: 'TLC NAND 512Gb',
    description: '3D TLC NAND 512Gb 다이 — SSD/스토리지 핵심 부품',
    color: '#1565c0', category: 'NAND', miId: 'NAND-TLC-512G',
  },
  {
    id: 'NAND_TLC_1T',   label: 'TLC NAND 1Tb',
    description: '3D TLC NAND 1Tb 다이 — 고용량 SSD',
    color: '#0277bd', category: 'NAND', miId: 'NAND-TLC-1T',
  },
  {
    id: 'NAND_QLC_2T',   label: 'QLC NAND 2Tb',
    description: '3D QLC NAND 2Tb 다이 — 대용량 소비자/엔터프라이즈 SSD',
    color: '#01579b', category: 'NAND', miId: 'NAND-QLC-2T',
  },
  // ── Storage ──────────────────────────────────────────────────────
  {
    id: 'SSD_ESSD_30T',    label: 'eSSD 30.72TB',
    description: '엔터프라이즈 QLC SSD 30.72TB — 데이터센터',
    color: '#2e7d32', category: 'STORAGE', miId: 'eSSD-30T',
  },
  {
    id: 'SSD_RTL_NVME_1T', label: 'NVMe SSD 1TB (소비자)',
    description: '소비자용 NVMe SSD 1TB (시장 평균가)',
    color: '#558b2f', category: 'STORAGE', miId: 'RTL-NVME1T',
  },
  {
    id: 'SSD_RTL_NVME_2T', label: 'NVMe SSD 2TB (소비자)',
    description: '소비자용 NVMe SSD 2TB (시장 평균가)',
    color: '#33691e', category: 'STORAGE', miId: 'RTL-NVME2T',
  },
  {
    id: 'SSD_OEM_1T',      label: 'OEM SSD 1TB',
    description: 'Client OEM PCIe 4.0 SSD 1TB TLC — PC 제조사 납품용',
    color: '#827717', category: 'STORAGE', miId: 'OEM-SSD-1T',
  },
  {
    id: 'EMMC_32G',        label: 'eMMC 32GB',
    description: 'eMMC 5.1 32GB — 보급형 스마트폰/IoT',
    color: '#e65100', category: 'STORAGE', miId: 'eMMC-32G',
  },
  {
    id: 'UFS_128G',        label: 'UFS 3.1 128GB',
    description: 'UFS 3.1 128GB — 안드로이드 플래그십 내장 스토리지',
    color: '#bf360c', category: 'STORAGE', miId: 'UFS3.1-128G',
  },
  {
    id: 'UFS4_256G',       label: 'UFS 4.0 256GB',
    description: 'UFS 4.0 256GB — 최신 플래그십 고속 스토리지',
    color: '#8d1f00', category: 'STORAGE', miId: 'UFS4.0-256G',
  },
] as const;

// ── 카테고리별 기본 표시 타입 (처음 선택 상태) ───────────────────────
export const DEFAULT_SELECTED: readonly RamType[] = [
  'DDR5', 'DDR4', 'HBM4', 'HBM3E', 'LPDDR5X',
  'NAND_TLC_512G', 'SSD_RTL_NVME_1T',
];

// ── 가격 데이터 포인트 ─────────────────────────────────────────────
export interface RamPricePoint {
  readonly date: string;      // YYYY-MM-DD
  readonly price: number;     // USD
  readonly changePct?: number;
  readonly weeklyHigh?: number;
  readonly weeklyLow?: number;
}

export interface RamPriceSeries {
  readonly type: RamType;
  readonly info: RamTypeInfo;
  readonly history: readonly RamPricePoint[];
  readonly latestPrice: number;
  readonly latestChangePct: number;
  readonly high52w: number;
  readonly low52w: number;
}

export interface RamPriceResult {
  readonly updatedAt: string;
  readonly series: readonly RamPriceSeries[];
  readonly source: 'memoryindex' | 'dramexchange';
}

// ── 서비스 인터페이스 ──────────────────────────────────────────────
export interface RamPriceService {
  getRamPrices(types?: readonly RamType[], historyDays?: number): Promise<RamPriceResult>;
  getRamHistory(type: RamType, historyDays?: number): Promise<RamPriceSeries>;
}

/** memoryindex.io가 실시간으로 보고하는 시세 한 건 */
interface LiveQuote {
  readonly price: number;
  readonly changePct: number;
  /** 공식 보드 API에서만 제공 (마퀴 HTML 폴백에는 없음) */
  readonly chg30dPct?: number;
  readonly chgYoyPct?: number;
}

export default (container: symbol): ConstructorType<RamPriceService> => {
  @Sim({ symbol: RamPriceService.SYMBOL, container })
  class RamPriceServiceImpl implements RamPriceService {
    private readonly CORS_PROXY = 'https://sparkling-dew-b13c.visualkhh.workers.dev/?url=';

    private async fetchJson<T>(url: string): Promise<T> {
      const target = `${this.CORS_PROXY}${encodeURIComponent(url)}`;
      const res = await fetch(target, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    }

    /** 공식 무료 API — 전체 보드 (키 없이 10계약, 12시간 지연). spot가 + 24h/30일/전년비 변동률 제공 */
    private async fetchBoardPrices(): Promise<Map<string, LiveQuote>> {
      const result = new Map<string, LiveQuote>();
      try {
        const json = await this.fetchJson<any>(
          'https://memoryindex.io/api/public/v1/prices',
        );
        const mem: any[] = json?.memory ?? [];
        for (const m of mem) {
          const price = Number(m.spot_usd ?? m.price);
          if (m?.ticker && Number.isFinite(price)) {
            const chg30dPct = Number(m.chg_30d_pct);
            const chgYoyPct = Number(m.chg_yoy_pct);
            result.set(String(m.ticker), {
              price,
              changePct: Number(m.chg_24h_pct ?? 0),
              chg30dPct: Number.isFinite(chg30dPct) ? chg30dPct : undefined,
              chgYoyPct: Number.isFinite(chgYoyPct) ? chgYoyPct : undefined,
            });
          }
        }
      } catch (e) {
        console.warn('[RamPriceService] board API 실패:', e);
      }
      return result;
    }

    /** 폴백 — 메인 페이지 시세 마퀴 HTML 파싱 (현재가 + 24h%만 제공, 30일/전년비 없음) */
    private async fetchLivePrices(): Promise<Map<string, LiveQuote>> {
      const result = new Map<string, LiveQuote>();
      try {
        const proxyUrl = `${this.CORS_PROXY}${encodeURIComponent('https://memoryindex.io/')}`;
        const res = await fetch(proxyUrl, {
          headers: {
            accept: 'text/html',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          },
        });
        if (!res.ok) return result;
        const html = await res.text();

        // 패턴: text-muted-foreground">ID</span><span ...>$price</span><span ...>±pct%</span>
        // 예: DDR5-16G</span><span class="text-foreground">$53.33</span><span class="text-down">-2.00%</span>
        const re = /text-muted-foreground">([A-Za-z0-9\-+.]+)<\/span><span[^>]*>\$([0-9,]+(?:\.[0-9]+)?)<\/span><span[^>]*>([+-][0-9.]+)%<\/span>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html)) !== null) {
          const id = m[1];
          const price = parseFloat(m[2].replace(/,/g, ''));
          const changePct = parseFloat(m[3]);
          if (id && Number.isFinite(price) && !result.has(id)) {
            result.set(id, { price, changePct });
          }
        }
      } catch (e) {
        console.warn('[RamPriceService] HTML 파싱 실패:', e);
      }
      return result;
    }

    /**
     * memoryindex.io가 실시간으로 보고하는 24h/30일/전년비 변동률을 앵커 삼아 일별 곡선을 로그 보간한다.
     * memoryindex.io 자신의 차트도 "deterministic back-cast from the last print and the
     * year-over-year move"(최신가 + 전년비 변동률로 역산한 추정 곡선)라고 명시하고 있어서,
     * 저장된 일별 시세 대신 매번 fetch로 받은 실시간 변동률로부터 같은 방식으로 유도한다.
     * 30일/전년비 변동률이 없는 티커(마퀴 폴백)는 오늘 한 점만 반환한다.
     */
    private buildHistory(quote: LiveQuote, historyDays: number, today: string): RamPricePoint[] {
      type Anchor = { daysAgo: number; price: number };
      const anchors: Anchor[] = [{ daysAgo: 0, price: quote.price }];
      if (quote.chg30dPct != null) {
        anchors.unshift({ daysAgo: 30, price: quote.price / (1 + quote.chg30dPct / 100) });
      }
      if (quote.chgYoyPct != null) {
        anchors.unshift({ daysAgo: 365, price: quote.price / (1 + quote.chgYoyPct / 100) });
      }
      if (anchors.length < 2) {
        return [{ date: today, price: quote.price, changePct: quote.changePct }];
      }

      const priceAtDaysAgo = (daysAgo: number): number => {
        const oldest = anchors[0], newest = anchors[anchors.length - 1];
        if (daysAgo >= oldest.daysAgo) return oldest.price;
        if (daysAgo <= newest.daysAgo) return newest.price;
        for (let i = 0; i < anchors.length - 1; i++) {
          const outer = anchors[i], inner = anchors[i + 1];
          if (daysAgo <= outer.daysAgo && daysAgo >= inner.daysAgo) {
            const span = outer.daysAgo - inner.daysAgo || 1;
            const frac = (outer.daysAgo - daysAgo) / span;
            return Math.exp(Math.log(outer.price) + frac * (Math.log(inner.price) - Math.log(outer.price)));
          }
        }
        return quote.price;
      };

      const maxAnchorDaysAgo = anchors[0].daysAgo;
      const startDaysAgo = Math.min(historyDays, maxAnchorDaysAgo);
      const history: RamPricePoint[] = [];
      // 요청 범위가 앵커 범위보다 넓으면, 그 밖 구간은 가장 오래된 앵커값으로 평평한 한 점만 찍는다
      if (historyDays > maxAnchorDaysAgo) {
        const d = new Date();
        d.setDate(d.getDate() - historyDays);
        history.push({ date: d.toISOString().slice(0, 10), price: anchors[0].price, changePct: 0 });
      }
      for (let daysAgo = startDaysAgo; daysAgo >= 0; daysAgo--) {
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        const price = daysAgo === 0 ? quote.price : priceAtDaysAgo(daysAgo);
        const prev = history.length ? history[history.length - 1].price : undefined;
        history.push({
          date: d.toISOString().slice(0, 10),
          price,
          changePct: prev != null && prev > 0 ? ((price - prev) / prev) * 100 : 0,
        });
      }
      return history;
    }

    async getRamHistory(type: RamType, historyDays = 365): Promise<RamPriceSeries> {
      const result = await this.getRamPrices([type], historyDays);
      return result.series[0]!;
    }

    async getRamPrices(
      types: readonly RamType[] = RAM_TYPES.map(t => t.id),
      historyDays = 365,
    ): Promise<RamPriceResult> {
      // memoryindex.io에서 매번 직접 fetch — 로컬 시드 파일은 전혀 쓰지 않는다.
      const board = await this.fetchBoardPrices();
      const live = board.size ? board : await this.fetchLivePrices();
      const today = new Date().toISOString().slice(0, 10);

      const series: RamPriceSeries[] = types.map((ramType): RamPriceSeries => {
        const info = RAM_TYPES.find(t => t.id === ramType)!;
        const quote = live.get(info.miId)
          ?? [...live.entries()].find(([k]) => k.toUpperCase() === info.miId.toUpperCase())?.[1]
          ?? null;

        const history = quote ? this.buildHistory(quote, historyDays, today) : [];
        const prices = history.map(h => h.price);
        const latestPrice = quote?.price ?? 0;
        const latestChangePct = quote?.changePct ?? 0;
        return {
          type: ramType, info, history, latestPrice, latestChangePct,
          high52w: prices.length ? Math.max(...prices) : latestPrice,
          low52w:  prices.length ? Math.min(...prices) : latestPrice,
        };
      });

      return { updatedAt: new Date().toISOString(), series, source: 'memoryindex' };
    }
  }

  return RamPriceServiceImpl as unknown as ConstructorType<RamPriceService>;
};
