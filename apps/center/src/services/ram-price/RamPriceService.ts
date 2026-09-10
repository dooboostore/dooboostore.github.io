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
  readonly source: 'memoryindex' | 'dramexchange' | 'fallback';
}

// ── memoryindex.io 타입 ────────────────────────────────────────────
interface MemoryIndexPrice {
  readonly id: string;
  readonly memoryType: string;
  readonly category: string;
  readonly price: number;
  readonly changePct: number;
  readonly weeklyHigh: number;
  readonly weeklyLow: number;
  readonly sourceUpdatedAt: string;
  readonly updatedAt: string;
}

// ── 서비스 인터페이스 ──────────────────────────────────────────────
export interface RamPriceService {
  getRamPrices(types?: readonly RamType[], historyDays?: number): Promise<RamPriceResult>;
  getRamHistory(type: RamType, historyDays?: number): Promise<RamPriceSeries>;
}

// ── fallback 정적 데이터 ──────────────────────────────────────────
// 출처: DRAMeXchange, memoryindex.io, Tom's Hardware 공개 자료 (2024-01~2026-09)
const FALLBACK_HISTORY: Record<RamType, Array<{ date: string; price: number }>> = {
  // ── DRAM ──────────────────────────────────────────────────────────
  DDR5: [
    { date: '2024-01-01', price: 4.20 }, { date: '2024-02-01', price: 4.50 },
    { date: '2024-03-01', price: 5.10 }, { date: '2024-04-01', price: 5.80 },
    { date: '2024-05-01', price: 6.20 }, { date: '2024-06-01', price: 6.80 },
    { date: '2024-07-01', price: 7.50 }, { date: '2024-08-01', price: 8.20 },
    { date: '2024-09-01', price: 8.80 }, { date: '2024-10-01', price: 10.50 },
    { date: '2024-11-01', price: 16.00 }, { date: '2024-12-01', price: 24.00 },
    { date: '2025-01-01', price: 27.00 }, { date: '2025-02-01', price: 31.00 },
    { date: '2025-03-01', price: 36.00 }, { date: '2025-04-01', price: 40.00 },
    { date: '2025-05-01', price: 44.00 }, { date: '2025-06-01', price: 47.00 },
    { date: '2025-07-01', price: 49.00 }, { date: '2025-08-01', price: 51.00 },
    { date: '2025-09-01', price: 52.00 }, { date: '2025-10-01', price: 53.00 },
    { date: '2025-11-01', price: 54.00 }, { date: '2025-12-01', price: 54.50 },
    { date: '2026-01-01', price: 53.00 }, { date: '2026-02-01', price: 52.00 },
    { date: '2026-03-01', price: 51.50 }, { date: '2026-04-01', price: 52.00 },
    { date: '2026-05-01', price: 52.50 }, { date: '2026-06-01', price: 53.00 },
    { date: '2026-07-01', price: 53.20 }, { date: '2026-08-01', price: 53.40 },
    { date: '2026-09-01', price: 53.33 },
  ],
  DDR4: [
    { date: '2024-01-01', price: 3.10 }, { date: '2024-02-01', price: 3.30 },
    { date: '2024-03-01', price: 3.60 }, { date: '2024-04-01', price: 4.00 },
    { date: '2024-05-01', price: 4.30 }, { date: '2024-06-01', price: 4.80 },
    { date: '2024-07-01', price: 5.50 }, { date: '2024-08-01', price: 6.20 },
    { date: '2024-09-01', price: 7.00 }, { date: '2024-10-01', price: 9.50 },
    { date: '2024-11-01', price: 13.00 }, { date: '2024-12-01', price: 18.00 },
    { date: '2025-01-01', price: 22.00 }, { date: '2025-02-01', price: 28.00 },
    { date: '2025-03-01', price: 34.00 }, { date: '2025-04-01', price: 40.00 },
    { date: '2025-05-01', price: 50.00 }, { date: '2025-06-01', price: 60.00 },
    { date: '2025-07-01', price: 70.00 }, { date: '2025-08-01', price: 80.00 },
    { date: '2025-09-01', price: 85.00 }, { date: '2025-10-01', price: 88.00 },
    { date: '2025-11-01', price: 90.00 }, { date: '2025-12-01', price: 91.00 },
    { date: '2026-01-01', price: 91.50 }, { date: '2026-02-01', price: 91.80 },
    { date: '2026-03-01', price: 92.00 }, { date: '2026-04-01', price: 92.10 },
    { date: '2026-05-01', price: 91.80 }, { date: '2026-06-01', price: 91.90 },
    { date: '2026-07-01', price: 92.00 }, { date: '2026-08-01', price: 92.10 },
    { date: '2026-09-01', price: 92.12 },
  ],
  DDR3: [
    { date: '2024-01-01', price: 2.40 }, { date: '2024-04-01', price: 2.80 },
    { date: '2024-07-01', price: 3.20 }, { date: '2024-10-01', price: 4.00 },
    { date: '2025-01-01', price: 5.50 }, { date: '2025-04-01', price: 6.80 },
    { date: '2025-07-01', price: 8.00 }, { date: '2025-10-01', price: 8.50 },
    { date: '2026-01-01', price: 8.80 }, { date: '2026-04-01', price: 8.90 },
    { date: '2026-07-01', price: 8.94 }, { date: '2026-09-01', price: 8.94 },
  ],
  GDDR6: [
    { date: '2024-01-01', price: 3.50 }, { date: '2024-04-01', price: 3.80 },
    { date: '2024-07-01', price: 4.20 }, { date: '2024-10-01', price: 5.00 },
    { date: '2025-01-01', price: 5.80 }, { date: '2025-04-01', price: 7.00 },
    { date: '2025-07-01', price: 8.50 }, { date: '2025-10-01', price: 10.00 },
    { date: '2026-01-01', price: 11.20 }, { date: '2026-04-01', price: 11.50 },
    { date: '2026-07-01', price: 11.60 }, { date: '2026-09-01', price: 11.63 },
  ],
  // ── HBM ───────────────────────────────────────────────────────────
  HBM4: [
    // HBM4 48GB: 2025Q3 양산 시작, 초기 $450+ → 점진 하락 예상
    { date: '2025-07-01', price: 480.00 }, { date: '2025-08-01', price: 510.00 },
    { date: '2025-09-01', price: 520.00 }, { date: '2025-10-01', price: 515.00 },
    { date: '2025-11-01', price: 508.00 }, { date: '2025-12-01', price: 505.00 },
    { date: '2026-01-01', price: 502.00 }, { date: '2026-02-01', price: 500.50 },
    { date: '2026-03-01', price: 500.00 }, { date: '2026-04-01', price: 500.20 },
    { date: '2026-05-01', price: 500.30 }, { date: '2026-06-01', price: 500.25 },
    { date: '2026-07-01', price: 500.28 }, { date: '2026-08-01', price: 500.30 },
    { date: '2026-09-01', price: 500.29 },
  ],
  HBM3E: [
    { date: '2024-01-01', price: 95.00 }, { date: '2024-04-01', price: 110.00 },
    { date: '2024-07-01', price: 130.00 }, { date: '2024-10-01', price: 150.00 },
    { date: '2025-01-01', price: 160.00 }, { date: '2025-04-01', price: 175.00 },
    { date: '2025-07-01', price: 190.00 }, { date: '2025-10-01', price: 200.00 },
    { date: '2026-01-01', price: 205.00 }, { date: '2026-04-01', price: 203.00 },
    { date: '2026-07-01', price: 200.00 }, { date: '2026-09-01', price: 199.95 },
  ],
  HBM3: [
    { date: '2024-01-01', price: 80.00 }, { date: '2024-04-01', price: 90.00 },
    { date: '2024-07-01', price: 105.00 }, { date: '2024-10-01', price: 120.00 },
    { date: '2025-01-01', price: 130.00 }, { date: '2025-04-01', price: 145.00 },
    { date: '2025-07-01', price: 160.00 }, { date: '2025-10-01', price: 175.00 },
    { date: '2026-01-01', price: 185.00 }, { date: '2026-04-01', price: 193.00 },
    { date: '2026-07-01', price: 199.00 }, { date: '2026-09-01', price: 199.95 },
  ],
  // ── Mobile ─────────────────────────────────────────────────────────
  LPDDR5X: [
    { date: '2024-01-01', price: 8.50 }, { date: '2024-04-01', price: 9.20 },
    { date: '2024-07-01', price: 10.50 }, { date: '2024-10-01', price: 12.50 },
    { date: '2025-01-01', price: 15.00 }, { date: '2025-04-01', price: 18.00 },
    { date: '2025-07-01', price: 22.00 }, { date: '2025-10-01', price: 26.00 },
    { date: '2026-01-01', price: 28.50 }, { date: '2026-04-01', price: 29.50 },
    { date: '2026-07-01', price: 29.80 }, { date: '2026-09-01', price: 29.88 },
  ],
  LPDDR5: [
    { date: '2024-01-01', price: 7.50 }, { date: '2024-04-01', price: 8.20 },
    { date: '2024-07-01', price: 9.50 }, { date: '2024-10-01', price: 11.00 },
    { date: '2025-01-01', price: 13.50 }, { date: '2025-04-01', price: 16.00 },
    { date: '2025-07-01', price: 19.50 }, { date: '2025-10-01', price: 23.00 },
    { date: '2026-01-01', price: 25.00 }, { date: '2026-04-01', price: 25.50 },
    { date: '2026-07-01', price: 26.00 }, { date: '2026-09-01', price: 26.11 },
  ],
  LPDDR4: [
    { date: '2024-01-01', price: 3.80 }, { date: '2024-04-01', price: 4.20 },
    { date: '2024-07-01', price: 5.00 }, { date: '2024-10-01', price: 5.80 },
    { date: '2025-01-01', price: 6.80 }, { date: '2025-04-01', price: 8.00 },
    { date: '2025-07-01', price: 9.50 }, { date: '2025-10-01', price: 11.50 },
    { date: '2026-01-01', price: 12.20 }, { date: '2026-04-01', price: 12.60 },
    { date: '2026-07-01', price: 12.80 }, { date: '2026-09-01', price: 12.86 },
  ],
  // ── NAND ───────────────────────────────────────────────────────────
  NAND_TLC_512G: [
    { date: '2024-01-01', price: 3.20 }, { date: '2024-04-01', price: 3.80 },
    { date: '2024-07-01', price: 4.50 }, { date: '2024-10-01', price: 5.50 },
    { date: '2025-01-01', price: 6.80 }, { date: '2025-04-01', price: 7.50 },
    { date: '2025-07-01', price: 8.20 }, { date: '2025-10-01', price: 9.00 },
    { date: '2026-01-01', price: 9.50 }, { date: '2026-04-01', price: 9.70 },
    { date: '2026-07-01', price: 9.80 }, { date: '2026-09-01', price: 9.81 },
  ],
  NAND_TLC_1T: [
    { date: '2024-01-01', price: 5.80 }, { date: '2024-04-01', price: 6.80 },
    { date: '2024-07-01', price: 8.00 }, { date: '2024-10-01', price: 9.80 },
    { date: '2025-01-01', price: 12.00 }, { date: '2025-04-01', price: 13.50 },
    { date: '2025-07-01', price: 15.00 }, { date: '2025-10-01', price: 16.50 },
    { date: '2026-01-01', price: 17.20 }, { date: '2026-04-01', price: 17.50 },
    { date: '2026-07-01', price: 17.60 }, { date: '2026-09-01', price: 17.66 },
  ],
  NAND_QLC_2T: [
    { date: '2024-01-01', price: 9.50 }, { date: '2024-04-01', price: 11.00 },
    { date: '2024-07-01', price: 13.00 }, { date: '2024-10-01', price: 16.00 },
    { date: '2025-01-01', price: 19.50 }, { date: '2025-04-01', price: 22.00 },
    { date: '2025-07-01', price: 24.50 }, { date: '2025-10-01', price: 27.00 },
    { date: '2026-01-01', price: 29.00 }, { date: '2026-04-01', price: 29.80 },
    { date: '2026-07-01', price: 30.30 }, { date: '2026-09-01', price: 30.46 },
  ],
  // ── Storage ────────────────────────────────────────────────────────
  SSD_ESSD_30T: [
    // 엔터프라이즈 SSD ($/TB 아닌 per unit)
    { date: '2024-01-01', price: 2800 }, { date: '2024-04-01', price: 3100 },
    { date: '2024-07-01', price: 3400 }, { date: '2024-10-01', price: 3700 },
    { date: '2025-01-01', price: 3900 }, { date: '2025-04-01', price: 4100 },
    { date: '2025-07-01', price: 4300 }, { date: '2025-10-01', price: 4500 },
    { date: '2026-01-01', price: 4580 }, { date: '2026-04-01', price: 4620 },
    { date: '2026-07-01', price: 4650 }, { date: '2026-09-01', price: 4656 },
  ],
  SSD_RTL_NVME_1T: [
    { date: '2024-01-01', price: 68 }, { date: '2024-04-01', price: 78 },
    { date: '2024-07-01', price: 90 }, { date: '2024-10-01', price: 105 },
    { date: '2025-01-01', price: 118 }, { date: '2025-04-01', price: 130 },
    { date: '2025-07-01', price: 145 }, { date: '2025-10-01', price: 160 },
    { date: '2026-01-01', price: 175 }, { date: '2026-04-01', price: 185 },
    { date: '2026-07-01', price: 192 }, { date: '2026-09-01', price: 195.95 },
  ],
  SSD_RTL_NVME_2T: [
    { date: '2024-01-01', price: 115 }, { date: '2024-04-01', price: 132 },
    { date: '2024-07-01', price: 152 }, { date: '2024-10-01', price: 178 },
    { date: '2025-01-01', price: 200 }, { date: '2025-04-01', price: 222 },
    { date: '2025-07-01', price: 248 }, { date: '2025-10-01', price: 272 },
    { date: '2026-01-01', price: 298 }, { date: '2026-04-01', price: 320 },
    { date: '2026-07-01', price: 372 }, { date: '2026-09-01', price: 376.39 },
  ],
  SSD_OEM_1T: [
    { date: '2024-01-01', price: 42 }, { date: '2024-04-01', price: 50 },
    { date: '2024-07-01', price: 60 }, { date: '2024-10-01', price: 72 },
    { date: '2025-01-01', price: 82 }, { date: '2025-04-01', price: 92 },
    { date: '2025-07-01', price: 103 }, { date: '2025-10-01', price: 112 },
    { date: '2026-01-01', price: 118 }, { date: '2026-04-01', price: 122 },
    { date: '2026-07-01', price: 124 }, { date: '2026-09-01', price: 125.29 },
  ],
  EMMC_32G: [
    { date: '2024-01-01', price: 8.50 }, { date: '2024-04-01', price: 9.20 },
    { date: '2024-07-01', price: 10.50 }, { date: '2024-10-01', price: 12.00 },
    { date: '2025-01-01', price: 14.00 }, { date: '2025-04-01', price: 15.50 },
    { date: '2025-07-01', price: 17.00 }, { date: '2025-10-01', price: 18.50 },
    { date: '2026-01-01', price: 19.50 }, { date: '2026-04-01', price: 20.00 },
    { date: '2026-07-01', price: 20.15 }, { date: '2026-09-01', price: 20.19 },
  ],
  UFS_128G: [
    { date: '2024-01-01', price: 12.00 }, { date: '2024-04-01', price: 13.50 },
    { date: '2024-07-01', price: 15.50 }, { date: '2024-10-01', price: 17.50 },
    { date: '2025-01-01', price: 20.00 }, { date: '2025-04-01', price: 22.50 },
    { date: '2025-07-01', price: 25.00 }, { date: '2025-10-01', price: 27.50 },
    { date: '2026-01-01', price: 28.50 }, { date: '2026-04-01', price: 28.90 },
    { date: '2026-07-01', price: 29.00 }, { date: '2026-09-01', price: 29.02 },
  ],
  UFS4_256G: [
    { date: '2024-01-01', price: 22.00 }, { date: '2024-04-01', price: 25.00 },
    { date: '2024-07-01', price: 28.50 }, { date: '2024-10-01', price: 32.00 },
    { date: '2025-01-01', price: 36.00 }, { date: '2025-04-01', price: 40.00 },
    { date: '2025-07-01', price: 44.00 }, { date: '2025-10-01', price: 48.00 },
    { date: '2026-01-01', price: 51.50 }, { date: '2026-04-01', price: 53.50 },
    { date: '2026-07-01', price: 54.80 }, { date: '2026-09-01', price: 54.99 },
  ],
};

function buildSeriesFromFallback(types: readonly RamType[]): RamPriceResult {
  const series: RamPriceSeries[] = types.map(type => {
    const info = RAM_TYPES.find(t => t.id === type)!;
    const raw = FALLBACK_HISTORY[type] ?? [];
    const history: RamPricePoint[] = raw.map((item, i) => {
      const prev = raw[i - 1]?.price;
      const changePct = prev != null ? ((item.price - prev) / prev) * 100 : 0;
      return { date: item.date, price: item.price, changePct };
    });
    const prices = history.map(h => h.price);
    const latestPrice = prices[prices.length - 1] ?? 0;
    const latestChangePct = history[history.length - 1]?.changePct ?? 0;
    const w52 = prices.slice(-52);
    return {
      type, info, history, latestPrice, latestChangePct,
      high52w: w52.length ? Math.max(...w52) : latestPrice,
      low52w:  w52.length ? Math.min(...w52) : latestPrice,
    };
  });
  return { updatedAt: new Date().toISOString(), series, source: 'fallback' };
}

export default (container: symbol): ConstructorType<RamPriceService> => {
  @Sim({ symbol: RamPriceService.SYMBOL, container })
  class RamPriceServiceImpl implements RamPriceService {
    private readonly CORS_PROXY = 'https://sparkling-dew-b13c.visualkhh.workers.dev/?url=';
    private readonly MEMORY_INDEX_BASE = 'https://api.ornnai.com/api';

    private async fetchJson<T>(url: string): Promise<T> {
      const target = `${this.CORS_PROXY}${encodeURIComponent(url)}`;
      const res = await fetch(target, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    }

    private async fetchCurrentPrices(): Promise<readonly MemoryIndexPrice[]> {
      const json = await this.fetchJson<any>(`${this.MEMORY_INDEX_BASE}/memory-types`);
      const items: any[] = Array.isArray(json) ? json : (json.data ?? []);
      return items.filter((it: any) => it && typeof it.price === 'number');
    }

    async getRamHistory(type: RamType, historyDays = 365): Promise<RamPriceSeries> {
      const result = await this.getRamPrices([type], historyDays);
      return result.series[0]!;
    }

    async getRamPrices(
      types: readonly RamType[] = RAM_TYPES.map(t => t.id),
      historyDays = 365,
    ): Promise<RamPriceResult> {
      try {
        const currentList = await this.fetchCurrentPrices();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - historyDays);

        const series: RamPriceSeries[] = await Promise.all(
          types.map(async (ramType): Promise<RamPriceSeries> => {
            const info = RAM_TYPES.find(t => t.id === ramType)!;
            const current = currentList.find(it =>
              it.id?.toUpperCase() === info.miId?.toUpperCase()
            );

            const raw = FALLBACK_HISTORY[ramType] ?? [];
            const history: RamPricePoint[] = raw
              .filter(r => new Date(r.date) >= cutoff)
              .map((item, i, arr) => {
                const prev = arr[i - 1]?.price;
                const changePct = prev != null ? ((item.price - prev) / prev) * 100 : 0;
                return { date: item.date, price: item.price, changePct };
              });

            if (current) {
              const today = new Date().toISOString().slice(0, 10);
              const lastIdx = history.length - 1;
              const updated: RamPricePoint = {
                date: today,
                price: current.price,
                changePct: current.changePct,
                weeklyHigh: current.weeklyHigh,
                weeklyLow: current.weeklyLow,
              };
              if (lastIdx < 0 || history[lastIdx].date !== today) {
                history.push(updated);
              } else {
                history[lastIdx] = updated;
              }
            }

            const prices = history.map(h => h.price);
            const latestPrice = current?.price ?? prices[prices.length - 1] ?? 0;
            const latestChangePct = current?.changePct ?? history[history.length - 1]?.changePct ?? 0;
            const w52 = prices.slice(-52);
            return {
              type: ramType, info, history, latestPrice, latestChangePct,
              high52w: w52.length ? Math.max(...w52) : latestPrice,
              low52w:  w52.length ? Math.min(...w52) : latestPrice,
            };
          }),
        );

        return { updatedAt: new Date().toISOString(), series, source: 'memoryindex' };
      } catch (e) {
        console.warn('[RamPriceService] API 실패, fallback 사용:', e);
        return buildSeriesFromFallback(types);
      }
    }
  }

  return RamPriceServiceImpl as unknown as ConstructorType<RamPriceService>;
};
