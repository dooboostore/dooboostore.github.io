import { elementDefine, onConnectedBodyShadow, onConnectedBefore, onConnectedAfter, onInitialize, event, eventDelegate, eventDocument, innerHtml, setAttribute } from '@dooboostore/simple-web-component';
import { Router } from '@dooboostore/core-web';
import { inject } from '@dooboostore/simple-boot';
import { TossService, TossChartTimeframe } from '../../services/toss/TossService';
import { TrendRange, computeMacdSeries, computeRsiSeries, computeObvSeries, isResolveMode, TradingSimulator } from '@dooboostore/algorithm';
import type { ExitConfig, MaConfig, ResolveMode, SimCandle, SimResult, SimTrade, TradeAction } from '@dooboostore/algorithm';
import lzString from 'lz-string';
const { decompressFromEncodedURIComponent } = lzString;

// NOTE: 축소본 — 종목코드/캔들수/타임프레임/종료일시/투자원금/수수료/시작보유주 7개 파라미터만 유지.
// 전략(MA/실현/최적화/추세/내역) 섹션은 StockTradingSimulationPage.orig.bak 에 보관, 나중에 가져다 씀.

const tagName = 'center-stock-trading-simulation-page';

// TrendRange 네임스페이스 re-export (테스트 호환)
export { TrendRange };

/** 표시용 추세 구간 (TendRange + 라벨·색상·표시 범위) */
export interface DisplayZone {
  uuid: string;
  from: number;
  to: number;
  trend: number;
  label: string;
  color: string;
}

/** scoreRate → 표시 라벨·색상 (0.6 초과=상승, 0.4 미만=하락) */
export function zoneRegimeOf(scoreRate: number): { label: string; color: string } {
  if (scoreRate > 0.6) return { label: '상승', color: '#ef4444' };
  if (scoreRate < 0.4) return { label: '하락', color: '#3e63dd' };
  return { label: '횡보', color: '#94a3b8' };
}

/** 추세 레짐별 전략 1세트 (단일 모드도 길이 1 배열로 통일) */
export interface StrategySet {
  id: number;
  label: string;
  trend: number;
  from: number;
  to: number;
  color: string;
  maConfigs: MaConfig[];
  exitConfigs: ExitConfig[];
  mres: ResolveMode;
  xres: ResolveMode;
  profit: number;
  rate: number;
  trades: number;
}

/** 전략 세트 탭 색상 */
const SET_PALETTE = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#db2777'];

/** 매매조건 구간 탭 1개 (참고구간 + 구간별 최적화 설정 + 탐색 결과) */
export interface TradeRange {
  id: number; uuid: string; label: string; color: string; start: number; end: number;
  refMode: 'none' | 'range' | 'ranges' | 'custom'; refRangeId: number; refRangeIds: number[]; refStart: number; refEnd: number;
  riskAversion: number; trendScore: number; buyPctRate: number; sellPctRate: number;
  maResolveMode: ResolveMode; exitResolveMode: ResolveMode;
  /** 추세 확정 여부 (미확정 꼬리=false → 표시만, 매매 제외) */
  confirmed: boolean;
  best: TradingSimulator.BestConfig | null; sim: SimResult | null;
  /** 구간 자체 성적 (시작 평가 → 끝 평가) */
  localRate: number; localProfit: number;
}

/** 표시 구간과 보유 세트 diff (이름 우선 + 범위 검증 — 데이터 바뀌면 재생성) */
export function diffZoneSets(
  sets: { label: string; from: number; to: number }[],
  zones: { label: string; from: number; to: number }[],
): { keepIdx: number[]; freshZones: { label: string; from: number; to: number }[] } {
  const key = (x: { label: string; from: number; to: number }) => `${x.label}|${x.from}-${x.to}`;
  const have = new Set(sets.map(key));
  const keepIdx: number[] = [];
  sets.forEach((s, i) => {
    if (zones.some(g => g.label === s.label && g.from === s.from && g.to === s.to)) keepIdx.push(i);
  });
  const freshZones = zones.filter(g => !have.has(key(g)));
  return { keepIdx, freshZones };
}

/** findBestConfig 반환값 요약 로그 (호출측 수신 확인용) */
export function logBestResult(tag: string, best: any): void {
  if (!best) { console.log(`[sim] ${tag} → null`); return; }
  let anyN = 0, totalN = 0;
  const sigs: string[] = [];
  for (const m of best.maConfigs ?? []) {
    for (const s of (m?.pyramiding?.signals ?? []) as any[]) {
      totalN += 7;
      if (s.candleFilter === 'any') anyN++;
      if (s.volumeFilter === 'any') anyN++;
      if (s.alignment === 'any') anyN++;
      if (s.condTrade?.type === 'any') anyN++;
      if (s.condCandle?.type === 'any') anyN++;
      if (s.condCandle?.operator === 'any') anyN++;
      if (s.condMa?.type === 'any') anyN++;
      sigs.push(`MA${m.period} ${s.signal}/${s.action} ${s.percent}% cons${s.consecutive} sa${s.skipAfter ?? 0} [${s.candleFilter},${s.volumeFilter},${s.alignment}]`);
    }
  }
  console.log(`[sim] ${tag} → periods=[${(best.maConfigs ?? []).map((m: any) => m.period).join(',')}] any=${anyN}/${totalN} mres=${best.mres} xres=${best.xres}\n  ${sigs.join('\n  ')}`);
}

/** URL 복원용 실현 조건 정규화 (null = 사용 불가) */
export function normExitList(arr: any): ExitConfig[] | null {
  if (!Array.isArray(arr) || !arr.length) return null;
  const valid = arr.filter((x: any) => x && typeof x.basis === 'string');
  return valid.filter((x: any) => x.basis !== 'none').map((x: any) => ({
    basis: (['profitRise', 'profitFall', 'peakFall', 'peakRise'] as string[]).includes(x.basis) ? x.basis : 'profitRise',
    percent: Math.max(1, Math.min(100, Number(x.percent) || 15)),
    sellPercent: Math.max(1, Math.min(100, Number(x.sellPercent) || 100)),
    skip: Math.max(0, Math.min(20, Number(x.skip) || 5)),
    candle: x.candle === 'bull' ? 'bull' : x.candle === 'bear' ? 'bear' : 'any',
    volume: x.volume === 'higher' ? 'higher' : x.volume === 'lower' ? 'lower' : 'any',
  } as ExitConfig));
}

/** URL 복원용 MA 조건 정규화 (null = 사용 불가) */
export function normMaList(arr: any): MaConfig[] | null {
  if (!Array.isArray(arr) || !arr.length) return null;
  const valid = arr.filter((x: any) => x && typeof x.period === 'number' && typeof x.color === 'string' && x.pyramiding && (x.pyramiding.signals || (x.pyramiding.golden && x.pyramiding.dead)));
  if (!valid.length) return null;
  const normCandle = (v: any) => v === 'bull' ? 'bull' : v === 'bear' ? 'bear' : 'any' as const;
  const normVol = (v: any) => v === 'higher' ? 'higher' : v === 'lower' ? 'lower' : 'any' as const;
  const normAlign = (v: any) => ['aligned', 'reverse', 'largerAbove', 'largerBelow', 'smallerAbove', 'smallerBelow'].includes(v) ? v : 'any' as const;
  const TRADE_CONDS = ['consecutiveBuy', 'consecutiveSell', 'consecutiveSelected'] as const;
  const CANDLE_CONDS = ['consecutiveBullish', 'consecutiveBearish'] as const;
  const MA_CONDS = ['maDeviation', 'maSlope'] as const;
  const normOp = (v: any) => ['<', '<=', '=', '>=', '>', '!='].includes(v) ? v : 'any' as const;
  const normCond = (c: any, validConds: readonly string[], isMa: boolean) => ({
    type: validConds.includes(c?.type) ? c.type : 'any' as const,
    operator: normOp(c?.operator),
    value: isMa ? Math.max(-50, Math.min(50, Number(c?.value) || 0)) : Math.max(1, Math.min(20, Math.floor(Number(c?.value) || 1)))
  });
  const normSignal = (s: any) => {
    const legacy = s.condition ?? {};
    const route = (group: any, validConds: readonly string[]) => group ?? ((validConds as readonly string[]).includes(legacy.type) ? legacy : undefined);
    return {
      signal: s.signal === 'dead' ? 'dead' as const : 'golden' as const,
      action: s.action === 'sell' ? 'sell' as const : 'buy' as const,
      percent: Math.max(1, Math.min(100, Number(s.percent) || 20)),
      candleFilter: normCandle(s.candleFilter),
      volumeFilter: normVol(s.volumeFilter),
      consecutive: Math.max(1, Math.min(10, Math.floor(Number(s.consecutive) || 2))),
      skipAfter: Math.max(0, Math.min(20, Math.floor(Number(s.skipAfter) || 0))),
      alignment: normAlign(s.alignment),
      condTrade: normCond(route(s.condTrade, TRADE_CONDS), TRADE_CONDS, false),
      condCandle: normCond(route(s.condCandle, CANDLE_CONDS), CANDLE_CONDS, false),
      condMa: normCond(route(s.condMa, MA_CONDS), MA_CONDS, true)
    };
  };
  const list = valid.map((x: any) => {
    let signals: any[] = [];
    if (Array.isArray(x.pyramiding.signals)) {
      signals = x.pyramiding.signals.map(normSignal).filter((s: any) => s.signal === 'golden' || s.signal === 'dead');
    } else {
      const g = x.pyramiding?.golden ?? {}; const d = x.pyramiding?.dead ?? {};
      if (g && g.action !== 'none') signals.push(normSignal({ signal: 'golden', ...g }));
      if (d && d.action !== 'none') signals.push(normSignal({ signal: 'dead', ...d }));
      if (!signals.length) signals.push(normSignal({ signal: 'golden', action: 'buy', percent: 20, candleFilter: 'any', volumeFilter: 'any', consecutive: 2, alignment: 'any', condTrade: { type: 'any', operator: 'any', value: 1 }, condCandle: { type: 'any', operator: 'any', value: 1 }, condMa: { type: 'any', operator: 'any', value: 1 } }));
    }
    return {
      period: Math.max(2, Math.min(500, Math.floor(Number(x.period)) || 10)),
      color: typeof x.color === 'string' && /^#([0-9a-fA-F]{3,8})$/.test(x.color) ? x.color : '#6366f1',
      pyramiding: { signals },
    };
  });
  list.sort((a, b) => a.period - b.period);
  return list as MaConfig[];
}

/** URL sets 직렬화 키맵 (compact):
 *  set: l=label t=trend f=from e=to c=color m=maConfigs x=exitConfigs mr=mres xr=xres
 *  ma: p=period c=color s=signals[] / signal: g=signal a=action p=percent cf=candleFilter
  *  vf=volumeFilter n=consecutive al=alignment sa=skipAfter ct/cc/cm=condTrade/condCandle/condMa
 *  cond: t=type o=operator v=value / exit: b=basis p=percent s=sellPercent k=skip c=candle v=volume */
export function compactSetsForUrl(sets: StrategySet[]): any[] {
  return sets.map(s => ({
    l: s.label, t: s.trend, f: s.from, e: s.to, c: s.color,
    m: s.maConfigs.map(m => ({
      p: m.period, c: m.color,
      s: ((m as any).pyramiding?.signals ?? []).map((g: any) => ({
        g: g.signal, a: g.action, p: g.percent, cf: g.candleFilter, vf: g.volumeFilter,
        n: g.consecutive, al: g.alignment, sa: g.skipAfter ?? 0,
        ct: { t: g.condTrade?.type, o: g.condTrade?.operator, v: g.condTrade?.value },
        cc: { t: g.condCandle?.type, o: g.condCandle?.operator, v: g.condCandle?.value },
        cm: { t: g.condMa?.type, o: g.condMa?.operator, v: g.condMa?.value },
      })),
    })),
    x: s.exitConfigs.map(x => ({ b: (x as any).basis, p: (x as any).percent, s: (x as any).sellPercent, k: (x as any).skip, c: (x as any).candle, v: (x as any).volume })),
    mr: s.mres, xr: s.xres,
  }));
}

/** compact → verbose 복원 (레거시 verbose는 그대로 통과) */
export function expandSetsFromUrl(arr: any[]): any[] {
  return arr.map((s: any) => {
    if (s && typeof s === 'object' && ('maConfigs' in s || 'exitConfigs' in s)) return s;
    const sig = (g: any) => ({
      signal: g?.g, action: g?.a, percent: g?.p, candleFilter: g?.cf, volumeFilter: g?.vf,
      consecutive: g?.n, alignment: g?.al, skipAfter: g?.sa,
      condTrade: { type: g?.ct?.t, operator: g?.ct?.o, value: g?.ct?.v },
      condCandle: { type: g?.cc?.t, operator: g?.cc?.o, value: g?.cc?.v },
      condMa: { type: g?.cm?.t, operator: g?.cm?.o, value: g?.cm?.v },
    });
    return {
      label: s?.l, trend: s?.t, from: s?.f, to: s?.e, color: s?.c,
      mres: s?.mr, xres: s?.xr,
      maConfigs: (s?.m ?? []).map((m: any) => ({ period: m?.p, color: m?.c, pyramiding: { signals: (m?.s ?? []).map(sig) } })),
      exitConfigs: (s?.x ?? []).map((x: any) => ({ basis: x?.b, percent: x?.p, sellPercent: x?.s, skip: x?.k, candle: x?.c, volume: x?.v })),
    };
  });
}

/** sets 파라미터 파싱 — 레거시 verbose JSON 우선, 실패 시 압축 compact.
 *  쓰기측이 pre-encode + set()이라 저장 시 2중 인코딩되므로, 압축 해체 전 1회 디코딩한다. */
export function parseSetsParam(raw: string): any[] | null {
  try {
    const arr = JSON.parse(decodeURIComponent(raw));
    if (Array.isArray(arr)) return arr;
  } catch { /* compact 시도 */ }
  try {
    let enc = raw;
    try { enc = decodeURIComponent(raw); } catch { enc = raw; }
    const str = decompressFromEncodedURIComponent(enc);
    if (!str) return null;
    const arr = JSON.parse(str);
    if (Array.isArray(arr)) return arr;
  } catch { /* null */ }
  return null;
}

const DEFAULT_CANDLE_COUNT = 360;
const DEFAULT_TIMEFRAME: TossChartTimeframe = 'day:1';
const DEFAULT_CAPITAL = 100_000_000;
const DEFAULT_FEE_PERCENT = 0.015;
const DEFAULT_STOCK_CODE = 'A005930';

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class StockTradingSimulationPage extends w.HTMLElement {
    @onConnectedBefore
    @innerHtml((c, helper) => helper.$w.document.querySelector('title'), { valueKey: 'titleBody' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:title"]'), 'content', { valueKey: 'ogTitle' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="description"]'), 'content', { valueKey: 'desc' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:description"]'), 'content', { valueKey: 'ogDesc' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:image"]'), 'content', { valueKey: 'ogImage' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:image"]'), 'content', { valueKey: 'twitterImage' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:title"]'), 'content', { valueKey: 'twitterTitle' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:description"]'), 'content', { valueKey: 'twitterDesc' })
    setPageMeta() {
      return {
        titleBody: '주식 트레이딩 시뮬레이션 | @dooboostore',
        ogTitle: '주식 트레이딩 시뮬레이션 | @dooboostore',
        desc: '이동평균 골든/데드 크로스로 매매를 시뮬레이션하고 수익률을 확인해보세요.',
        ogDesc: '이동평균 골든/데드 크로스로 매매를 시뮬레이션하고 수익률을 확인해보세요.',
        ogImage: '/assets/images/stock-trading-simulation-og.png',
        twitterImage: '/assets/images/stock-trading-simulation-og.png',
        twitterTitle: '주식 트레이딩 시뮬레이션 | @dooboostore',
        twitterDesc: '이동평균 골든/데드 크로스로 매매를 시뮬레이션하고 수익률을 확인해보세요.',
      };
    }

    private router!: Router;
    private tossService!: TossService;
    // --- 7개 파라미터 (값 없으면 DEFAULT) ---
    private currentCode = DEFAULT_STOCK_CODE; // 종목번호 (code)
    private currentName = DEFAULT_STOCK_CODE;
    private candleCount = DEFAULT_CANDLE_COUNT; // 캔들수 (cnt)
    private timeframe: TossChartTimeframe = DEFAULT_TIMEFRAME; // 타임프레임 (tf)
    private endDate = ''; // 종료일 (ed, '' = 최신)
    private endTime = ''; // 종료시각 (분봉만)
    private initialCapital = DEFAULT_CAPITAL; // 투자원금 (cap)
    private feePercent = DEFAULT_FEE_PERCENT; // 수수료 (fee)
    private initialShares = 100; // 시작 보유주 (sh)
    private initialAvgPrice = 0; // 시작 평단 (자동: 선택 구간 첫 캔들 종가, URL 미동기화)
    /** 시작 자기자본 = 현금 + 보유평가(수량×평단) */
    private startEquity(): number {
      return this.initialCapital + this.initialShares * this.initialAvgPrice;
    }
    /** 시작 평단 = 선택 구간 첫 캔들 종가로 갱신 + 표시 동기화 */
    private refreshInitAvg(): void {
      if (!this.chartCandles.length) return;
      const [zs] = this.simRange();
      const c = this.chartCandles[Math.max(0, Math.min(zs, this.chartCandles.length - 1))];
      if (c) {
        this.initialAvgPrice = Math.round(c.close);
        const apEl = this.shadowRoot?.querySelector('#sim-init-avg') as HTMLInputElement;
        if (apEl) apEl.value = String(this.initialAvgPrice);
      }
    }
    // --- 차트 상태 (파라미터 아님) ---
    private chartCandles: SimCandle[] = [];
    private rangeStart = 0;
    private rangeEnd = -1;
    // URL(rs/re)로 복원된 구간 — 다음 로드 1회에만 전체 리셋을 건너뜀
    private rangeFromUrl = false;
    // --- 구간 탭 (매매조건 카드) ---
    // 참고구간: none(없음) / range(다른 구간 참조) / custom(직접 구간 선택) — findBestConfig 입력용(UI만)
    private tradeRanges: TradeRange[] = [];
    // 리플레이 전용 작업 구간 — 매매조건 카드와 분리. 차트 rect·잠정 판단용으로만 사용
    private replayRanges: TradeRange[] = [];
    // --- 실거래 체인 결과 (구간 시간순 simulate 연결, 상단 결과카드 표시용) ---
    private live: { eval: number; cash: number; shares: number; profit: number; rate: number; fee: number; count: number; fails: number } | null = null;
    // 추세자동매매 리플레이 — null이면 비활성. 실행 중 렌더는 체인 대신 아래 스냅샷으로 직접 그림
    private replay: { running: boolean; S: number; E: number; t: number; gen: number } | null = null;
    private replayLog: { absIdx: number; trade: SimTrade }[] = [];
    // 리플레이 실원장 — 틱마다 확정 체결 1건씩만 반영 (실패행 무시)
    private ledgerCash = 0;
    private ledgerShares = 0;
    private ledgerAvg = 0;
    // 청개구리 — 켜면 탐색 조건의 매수↔매도를 뒤집어 정반대로 매매
    private contrarian = false;
    // 리플레이 전용 청개구리 — 추세자동매매 틱에서만 읽음
    private replayContrarian = false;
    private activeRangeId = 0;
    private nextRangeId = 1;
    /** 구간을 캔들 범위로 클램프 */
    private clampTradeRange(z: { start: number; end: number }) {
      const n = this.chartCandles.length;
      if (!n) { z.start = 0; z.end = 0; return; }
      const e = Math.max(0, Math.min(Math.floor(z.end), n - 1));
      z.start = Math.max(0, Math.min(Math.floor(z.start), e));
      z.end = e;
    }
    private lastStockPrice: { close: number; base: number | null } | null = null;

    private restoreSimFromUrl() {
      try {
        const p = this.router?.getSearchParams?.();
        if (!p) return;
        const cap = p.get('cap');
        if (cap) { const v = Number(cap); if (Number.isFinite(v) && v >= 10000) this.initialCapital = Math.floor(v); }
        const sh = p.get('sh');
        if (sh) { const v = Number(sh); if (Number.isFinite(v) && v >= 0) this.initialShares = Math.floor(v); }
        const cnt = p.get('cnt');
        if (cnt) { const v = Number(cnt); if (Number.isFinite(v) && v >= 30 && v <= 1000) this.candleCount = Math.floor(v); }
        const tf = p.get('tf');
        if (tf && /^(min:\d+|day:1|week:1|month:1)$/.test(tf)) this.timeframe = tf as TossChartTimeframe;
        const ed = p.get('ed');
        if (ed && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(ed)) {
          const probe = new Date(ed.length <= 10 ? `${ed}T23:59:00` : `${ed}:00`);
          if (Number.isFinite(probe.getTime()) && probe.getTime() <= Date.now()) {
            this.endDate = ed.slice(0, 10);
            this.endTime = ed.length > 10 ? ed.slice(11, 16) : '';
          }
        }
        const fee = p.get('fee');
        if (fee) { const v = Number(fee); if (Number.isFinite(v) && v >= 0 && v <= 1) this.feePercent = v; }
        const rs = p.get('rs'); const re = p.get('re');
        if (rs !== null || re !== null) {
          const s = rs !== null ? Math.floor(Number(rs)) : 0;
          const e = re !== null ? Math.floor(Number(re)) : -1;
          if (Number.isFinite(s) && s >= 0 && Number.isFinite(e) && (e < 0 || e >= s)) {
            this.rangeStart = s; this.rangeEnd = e; this.rangeFromUrl = true;
          }
        }
      } catch {}
    }

    private simUrlParams(): Record<string, string> {
      return {
        code: this.currentCode,
        cap: String(this.initialCapital),
        sh: String(this.initialShares),
        cnt: String(this.candleCount),
        tf: this.timeframe,
        ed: this.endDate ? (this.endTime ? `${this.endDate}T${this.endTime}` : this.endDate) : '',
        fee: String(this.feePercent),
        rs: String(this.rangeStart),
        re: String(this.rangeEnd),
      };
    }

    private syncSimParamsToUrl() {
      try {
        this.router?.replaceUpsertSearchParam?.(this.simUrlParams());
      } catch {}
    }

    private syncUrlWithoutReload() {
      try {
        const url = new URL(window.location.href);
        const params = this.simUrlParams();
        for (const [k, v] of Object.entries(params)) {
          if (v) url.searchParams.set(k, v);
          else url.searchParams.delete(k);
        }
        window.history.replaceState(null, '', url.toString());
      } catch {}
    }

    private applySimConfigToForm() {
      const active = this.shadowRoot?.activeElement as HTMLElement | null;
      const capEl = this.shadowRoot?.querySelector('#sim-capital') as HTMLInputElement;
      const cntEl = this.shadowRoot?.querySelector('#sim-candle-count') as HTMLInputElement;
      const tfEl = this.shadowRoot?.querySelector('#sim-timeframe') as HTMLSelectElement;
      if (capEl && capEl !== active) capEl.value = String(this.initialCapital);
      const shEl = this.shadowRoot?.querySelector('#sim-init-shares') as HTMLInputElement;
      if (shEl && shEl !== active) shEl.value = String(this.initialShares);
      const apEl = this.shadowRoot?.querySelector('#sim-init-avg') as HTMLInputElement;
      if (apEl && apEl !== active) apEl.value = String(this.initialAvgPrice);
      const feeEl = this.shadowRoot?.querySelector('#sim-fee') as HTMLInputElement;
      if (feeEl && feeEl !== active) feeEl.value = String(this.feePercent);
      if (cntEl && cntEl !== active) cntEl.value = String(this.candleCount);
      if (tfEl && tfEl !== active) tfEl.value = this.timeframe;
      const endDateEl = this.shadowRoot?.querySelector('#sim-end-date') as HTMLInputElement;
      const endDtEl = this.shadowRoot?.querySelector('#sim-end-datetime') as HTMLInputElement;
      if (endDateEl && endDateEl !== active) endDateEl.value = this.endDate;
      if (endDtEl && endDtEl !== active) endDtEl.value = this.endTime ? `${this.endDate}T${this.endTime}` : '';
      this.updateEndTimeVisibility();
    }

    @onInitialize
    async onInit(@inject(TossService.SYMBOL) tossService: TossService, router: Router) {
      this.tossService = tossService;
      this.router = router;
      this.restoreSimFromUrl();
      try {
        const code = router?.getSearchParams?.()?.get('code');
        if (code) {
          const norm = code.trim();
          if (norm) {
            this.currentCode = /^[A-Z]/.test(norm) ? norm : `A${norm.replace(/^A/, '')}`;
            this.currentName = norm;
            try {
              let nm: string | undefined = (await this.tossService.getOverview(this.currentCode).catch(() => null))?.company?.name?.trim();
              if (!nm) {
                const prod = (await this.tossService.searchProduct(norm).catch(() => []))?.[0];
                nm = prod?.productName?.trim();
              }
              if (nm) this.currentName = nm;
            } catch {}
          }
        }
      } catch {}
      await this.loadStock(this.currentCode, this.currentName);
    }

    private updateChartTitle() {
      const titleEl = this.shadowRoot?.querySelector('#chart-title') as HTMLElement;
      if (!titleEl) return;
      const tfLabel = this.timeframe.replace('day:', '일봉 ').replace('week:', '주봉 ').replace('month:', '월봉 ').replace('min:', '분봉 ');
      const activeLen = this.getActiveCandles().length;
      const rangeSuffix = (this.chartCandles.length && activeLen !== this.chartCandles.length)
        ? ` (구간 ${activeLen}개)`
        : '';
      const endSuffix = (this.endDate && this.chartCandles.length)
        ? ` (~${this.chartCandles[this.chartCandles.length - 1]?.date ?? this.endDate})` : '';
      const countText = `${this.candleCount}개${rangeSuffix}${endSuffix}`;
      let pricePart = '';
      if (this.lastStockPrice && this.lastStockPrice.close != null) {
        const close = this.lastStockPrice.close;
        const base = this.lastStockPrice.base;
        const rate = base && base !== 0 ? ((close - base) / base) * 100 : null;
        const rateStr = rate == null ? '' : ` ${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`;
        const rateColor = rate == null ? '#64748b' : rate > 0 ? '#dc2626' : rate < 0 ? '#2563eb' : '#64748b';
        const isUS = /^(US|NAS|AMX|NYS)/.test(this.currentCode);
        const priceStr = `${Math.round(close).toLocaleString()}${isUS ? '$' : '원'}`;
        titleEl.innerHTML = `${this.currentName} (${this.currentCode.replace(/^A/, '')}) · <span style="font-weight:800;color:#1e293b">${priceStr}</span>${rateStr ? ` <span style="font-weight:700;color:${rateColor}">${rateStr}</span>` : ''} · ${tfLabel} ${countText}`;
        return;
      }
      if (this.chartCandles.length >= 2) {
        const last = this.chartCandles[this.chartCandles.length - 1];
        const prev = this.chartCandles[this.chartCandles.length - 2];
        const rate = prev.close ? ((last.close - prev.close) / prev.close) * 100 : 0;
        const rateStr = `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`;
        const isUS = /^(US|NAS|AMX|NYS)/.test(this.currentCode);
        const priceStr = `${Math.round(last.close).toLocaleString()}${isUS ? '$' : '원'}`;
        titleEl.innerHTML = `${this.currentName} (${this.currentCode.replace(/^A/, '')}) · <span style="font-weight:800;color:#1e293b">${priceStr}</span> <span style="font-weight:700;color:${rate > 0 ? '#dc2626' : rate < 0 ? '#2563eb' : '#64748b'}">${rateStr}</span> · ${tfLabel} ${countText}`;
        return;
      } else if (this.chartCandles.length === 1) {
        const last = this.chartCandles[0];
        const isUS = /^(US|NAS|AMX|NYS)/.test(this.currentCode);
        pricePart = ` · ${Math.round(last.close).toLocaleString()}${isUS ? '$' : '원'}`;
      }
      titleEl.textContent = `${this.currentName} (${this.currentCode.replace(/^A/, '')})${pricePart} · ${tfLabel} ${countText}`;
    }

    private async loadStock(code: string, name: string) {
      this.stopReplay();
      // 종목 변경·다시불러오기 → 매매조건·거래내역 완전 초기화
      this.tradeRanges = [];
      this.replayRanges = [];
      this.activeRangeId = 0;
      this.nextRangeId = 1;
      this.live = null;
      this.ledgerCash = 0;
      this.ledgerShares = 0;
      this.ledgerAvg = 0;
      this.currentCode = code;
      this.currentName = name;
      try {
        const cur = this.router?.getSearchParams?.()?.get('code');
        if (cur !== code) this.router?.replaceUpsertSearchParam?.({ code });
      } catch {}
      const searchInput = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      if (searchInput) searchInput.value = name;
      this.updateChartTitle();

      try {
        const from = this.endDateToFrom();
        const chartRes = await this.tossService.getChart(code, { count: this.candleCount, timeframe: this.timeframe, ...(from ? { from } : {}) }).catch(() => null);
        const raw = chartRes?.candles ?? [];
        const isMin = this.timeframe.startsWith('min:');
        const isDayWeekMonth = this.timeframe === 'day:1' || this.timeframe === 'week:1' || this.timeframe === 'month:1';
        const sortedRaw = [...raw].sort((a, b) => a.dt.localeCompare(b.dt));
        const candles = sortedRaw.map(c => ({ date: isMin ? `${c.dt.slice(5, 10)} ${c.dt.slice(11, 16)}` : isDayWeekMonth ? c.dt.slice(2, 10) : c.dt, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
        this.chartCandles = candles;
        // 로드 시 구간 전체 선택으로 리셋 (URL 구간 복원 시 1회 건너뜀)
        const keepRange = this.rangeFromUrl;
        this.rangeFromUrl = false;
        if (!keepRange) { this.rangeStart = 0; this.rangeEnd = -1; }
        this.syncRangeSliderBounds(!keepRange);
        // 시작 평단 = 선택 구간 첫 캔들 종가
        this.refreshInitAvg();
        // 원장·저널 초기화 (보유 있으면 초기보유 1건)
        this.initLedgerAndJournal();
        // 구간 클램프 + 슬라이더 범위 갱신
        this.tradeRanges.forEach(z => {
          this.clampTradeRange(z);
          const r = { start: z.refStart, end: z.refEnd };
          this.clampTradeRange(r);
          z.refStart = r.start; z.refEnd = r.end;
        });

        const chartEl = this.shadowRoot?.querySelector('stock-chart') as HTMLElement;
        if (chartEl) {
          chartEl.innerHTML = this.buildChartHtml();
        }
        this.refreshRealized();
        this.updateChartTitle();
        try {
          const sp = await this.tossService.getStockPrice(code).catch(() => null);
          if (sp && sp.close != null && sp.base != null) {
            this.lastStockPrice = { close: Number(sp.close), base: Number(sp.base) };
            this.updateChartTitle();
          }
        } catch {}

        if (!chartRes) {
          const inp2 = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
          if (inp2 && this.currentName === code) inp2.value = this.currentName;
        } else {
          try {
            const overview = await this.tossService.getOverview(code).catch(() => null);
            let resolvedName = overview?.company?.name?.trim();
            if (!resolvedName) {
              const prod = (await this.tossService.searchProduct(code).catch(() => []))?.[0];
              resolvedName = prod?.productName?.trim();
            }
            const isCodeLike = (v: string) => /^(A\d{6}|US.+|\d{6})$/.test(v.trim());
            if (resolvedName && (this.currentName === code || isCodeLike(this.currentName))) {
              this.currentName = resolvedName;
              const inp2 = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
              if (inp2) inp2.value = this.currentName;
              this.updateChartTitle();
            }
          } catch {}
        }
      } catch (e) { console.error(e); }
    }

    @event('.header-back', 'click')
    onBack() { this.router.go('/'); }

    @event('#stock-search-btn', 'click')
    onSearchBtn() { this.doSearch(); }

    private async doSearch() {
      const input = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      const q = input?.value.trim();
      if (!q) return;
      const box = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      const btn = this.shadowRoot?.querySelector('#stock-search-btn') as HTMLButtonElement;
      if (box) { box.innerHTML = `<div style="padding:12px;color:#64748b;display:flex;align-items:center;gap:8px"><span style="width:14px;height:14px;border:2px solid #e2e8f0;border-top-color:#f59e0b;border-radius:50%;display:inline-block;animation:spin 0.7s linear infinite"></span> 검색 중...</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>`; box.classList.add('show'); }
      if (btn) { btn.disabled = true; btn.textContent = '검색 중'; }
      if (input) input.setAttribute('aria-busy', 'true');
      let list: readonly any[] = [];
      try { list = await this.tossService.searchProduct(q); } catch { list = []; }
      if (!box) return;
      let priceMap = new Map<string, { close: number; base: number }>();
      try {
        const codes = list.slice(0, 10).map(it => it.productCode);
        const prices = await this.tossService.getStockPrices(codes).catch(() => [] as readonly any[]);
        for (const p of prices as any[]) {
          if (!p?.productCode || p.close == null || p.base == null) continue;
          priceMap.set(p.productCode, { close: Number(p.close), base: Number(p.base) });
        }
      } catch {}
      const fmtPrice = (v: number | null) => v == null ? '-' : Math.round(v).toLocaleString();
      box.innerHTML = list.slice(0, 10).map(it => {
        const isUS = /^(NSQ|NYS|NAS|AMX)/.test(it.market);
        const pm = priceMap.get(it.productCode);
        const close = pm?.close ?? (isUS ? it.close.usd : it.close.krw);
        const base = pm?.base ?? (isUS ? it.base.usd : it.base.krw);
        const rate = close != null && base != null && base !== 0 ? ((close - base) / base) * 100 : null;
        const rateStr = rate == null ? '' : `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`;
        const rateColor = rate == null ? '#64748b' : rate > 0 ? '#dc2626' : rate < 0 ? '#2563eb' : '#64748b';
        const priceStr = close == null ? '' : `${fmtPrice(close)}${isUS ? '$' : '원'}`;
        return `
        <div class="search-item" data-code="${it.productCode}" data-name="${it.productName}">
          <div style="flex:1"><div style="font-weight:700;font-size:13px">${it.productName}</div><div style="font-size:11px;color:#64748b">${it.productCode} · ${it.market}</div></div>
          <div style="text-align:right;min-width:92px"><div style="font-size:12px;font-weight:800;color:#1e293b">${priceStr}</div><div style="font-size:11px;font-weight:700;color:${rateColor}">${rateStr}</div></div>
          <div style="font-size:11px;color:#0ea5e9;margin-left:8px">선택</div>
        </div>`;
      }).join('') || `<div style="padding:12px;color:#64748b">결과 없음</div>`;
      box.classList.add('show');
      if (btn) { btn.disabled = false; btn.textContent = '검색'; }
      if (input) input.removeAttribute('aria-busy');
    }

    @event('#stock-search', 'keydown')
    onSearchKey(e: KeyboardEvent) {
      if (e.key === 'Enter') { e.preventDefault(); this.doSearch(); }
      if (e.key === 'Escape') {
        const b = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
        b?.classList.remove('show');
      }
    }

    @event('#stock-search-clear', 'click')
    onClearSearch() {
      const input = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      if (input) input.value = '';
      const box = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      box?.classList.remove('show');
      input?.focus();
    }

    @eventDocument('click')
    onDocClick(e: MouseEvent) {
      const box = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      if (!box?.classList.contains('show')) return;
      const wrap = this.shadowRoot?.querySelector('.search-wrap') as HTMLElement;
      const target = e.target as Node;
      if (wrap && target.isConnected && wrap.contains(target)) return;
      box.classList.remove('show');
    }

    @eventDelegate('#search-results', 'click')
    onPick(e: Event) {
      const el = (e.target as HTMLElement).closest('.search-item') as HTMLElement;
      if (!el) return;
      const code = el.dataset.code!;
      const name = el.dataset.name!;
      const box = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      box?.classList.remove('show');
      const input = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      if (input) input.value = name;
      // 종목 변경 시 종료일 초기화 (최신 기준)
      this.endDate = ''; this.endTime = '';
      const endDateEl = this.shadowRoot?.querySelector('#sim-end-date') as HTMLInputElement;
      if (endDateEl) endDateEl.value = '';
      const endDtEl = this.shadowRoot?.querySelector('#sim-end-datetime') as HTMLInputElement;
      if (endDtEl) endDtEl.value = '';
      this.loadStock(code, name);
    }

    @onConnectedAfter
    onAfterConnected() {
      this.applySimConfigToForm();
      this.syncRangeSliderBounds();
      this.updateChartTitle();
      this.renderRangeTabs();
      this.renderRangeBody();
    }

    private renderRangeTabs() {
      const wrap = this.shadowRoot?.querySelector('#sim-range-tabs-row') as HTMLElement;
      const bar = this.shadowRoot?.querySelector('#sim-range-tabs') as HTMLElement;
      if (!wrap || !bar) return;
      // 탭이 있을 때만 row(탭바+전체 최적화) 표시
      wrap.style.display = this.tradeRanges.length ? 'flex' : 'none';
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const hi = (n: number) => n > 0 ? '#dc2626' : n < 0 ? '#2563eb' : '#64748b';
      bar.innerHTML = this.tradeRanges.map(z => {
        const isActive = z.id === this.activeRangeId;
        // 단순보유 수익률 (구간 첫~끝 종가 기준) — 최적화 전부터 표시
        let hold = '';
        if (this.chartCandles.length) {
          const s = Math.max(0, Math.min(z.start, this.chartCandles.length - 1));
          const e = Math.max(s, Math.min(z.end, this.chartCandles.length - 1));
          const f = this.chartCandles[s]?.close, l = this.chartCandles[e]?.close;
          if (f) {
            const r = ((l - f) / f) * 100;
            hold = ` <span style="color:${isActive ? 'rgba(255,255,255,0.85)' : '#94a3b8'}">(${r >= 0 ? '+' : ''}${r.toFixed(1)}%)</span>`;
          }
        }
        const rate = z.sim ? ` <span style="font-weight:800;color:${isActive ? '#fff' : hi(z.localRate)}">${z.localRate >= 0 ? '+' : ''}${z.localRate.toFixed(1)}%</span>` : '';
        const refIds = z.refMode === 'ranges' ? z.refRangeIds : z.refMode === 'range' ? [z.refRangeId] : [];
        const refN = refIds.filter(id => this.tradeRanges.some(x => x.id === id)).length;
        const refMark = refN ? ` <span style="color:${isActive ? 'rgba(255,255,255,0.85)' : '#94a3b8'}">↩${refN}</span>` : '';
        const unMark = !z.confirmed ? ` <span style="color:${isActive ? 'rgba(255,255,255,0.85)' : '#b45309'}">잠정</span>` : '';
        return `<button type="button" class="range-tab${isActive ? ' active' : ''}" data-id="${z.id}"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${z.color};margin-right:6px;vertical-align:1px"></span>${esc(z.label)}${unMark}${rate}${hold}${refMark}</button>`;
      }).join('');
    }

    private renderRangeBody() {
      const body = this.shadowRoot?.querySelector('#sim-range-body') as HTMLElement;
      if (!body) return;
      const active = this.tradeRanges.find(z => z.id === this.activeRangeId);
      if (!active) {
        body.innerHTML = `<div class="empty-state">구간추가+ 버튼으로 구간을 추가하세요</div>`;
        return;
      }
      const escName = active.label.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const n = this.chartCandles.length;
      this.clampTradeRange(active);
      const riskOpts = [[0.5, '균형'], [1, '안정'], [0, '적극']].map(([v, l]) => `<option value="${v}"${active.riskAversion === v ? ' selected' : ''}>${l}</option>`).join('');
      const resOpts = (cur: string) => [['minFirst', '최소값 우선'], ['maxFirst', '최대값 우선'], ['all', '복리 합산']].map(([v, l]) => `<option value="${v}"${cur === v ? ' selected' : ''}>${l}</option>`).join('');
      body.innerHTML = `
        <div class="range-body-head">
          <input type="color" class="range-color-input" data-id="${active.id}" value="${active.color}" title="구간 색상" />
          <input class="range-name-input" data-id="${active.id}" value="${escName}" maxlength="20" title="구간 이름 (클릭해서 수정)" />
          <button type="button" class="range-delete" data-id="${active.id}">✕ 삭제</button>
        </div>
        <div class="trade-range-row">
          <span class="trade-range-lab" id="trade-range-start-${active.id}">-</span>
          <range-slider id="trade-range-${active.id}" data-id="${active.id}" orientation="horizontal" min="0" max="${Math.max(0, n - 1)}" step="1" style="flex:1">
            <thumb-group label="구간" color="${active.color}">
              <thumb name="start" value="${active.start}"></thumb>
              <thumb name="end" min="start" value="${active.end}"></thumb>
            </thumb-group>
          </range-slider>
          <span class="trade-range-lab end" id="trade-range-end-${active.id}">-</span>
          <span class="trade-range-lab" id="trade-range-count-${active.id}" style="color:${active.color}">-</span>
        </div>
        <div class="ref-row">
          <span class="ref-lab">참고구간:</span>
          <div class="ref-toggles" data-id="${active.id}">
            <button type="button" class="ref-toggle special${active.refMode === 'none' ? ' on' : ''}" data-ref="none" data-id="${active.id}">없음</button>
            <button type="button" class="ref-toggle special${active.refMode === 'custom' ? ' on' : ''}" data-ref="custom" data-id="${active.id}">직접입력</button>
            ${this.tradeRanges.filter(z => z.id !== active.id).map(z => `<button type="button" class="ref-toggle${((active.refMode === 'ranges' ? active.refRangeIds : active.refMode === 'range' ? [active.refRangeId] : []) as number[]).includes(z.id) ? ' on' : ''}" data-ref="range:${z.id}" data-id="${active.id}" title="${z.label.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${z.color};margin-right:4px"></span>${z.label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</button>`).join('')}
          </div>
          ${(() => {
            const ids = active.refMode === 'ranges' ? active.refRangeIds : active.refMode === 'range' ? [active.refRangeId] : [];
            const list = (ids as number[]).map(id => this.tradeRanges.find(z => z.id === id)).filter(Boolean) as TradeRange[];
            if (!list.length || !this.chartCandles.length) return '';
            const total = list.reduce((s, rz) => s + Math.max(0, rz.end - rz.start + 1), 0);
            return `<span class="ref-info">↩ ${list.length}개 구간 (총 ${total}개)</span>`;
          })()}
        </div>
        ${active.refMode === 'custom' ? `
        <div class="trade-range-row">
          <span class="trade-range-lab" id="ref-range-start-${active.id}">-</span>
          <range-slider id="ref-range-${active.id}" data-ref="${active.id}" orientation="horizontal" min="0" max="${Math.max(0, n - 1)}" step="1" style="flex:1">
            <thumb-group label="참고구간" color="#94a3b8">
              <thumb name="start" value="${active.refStart}"></thumb>
              <thumb name="end" min="start" value="${active.refEnd}"></thumb>
            </thumb-group>
          </range-slider>
          <span class="trade-range-lab end" id="ref-range-end-${active.id}">-</span>
          <span class="trade-range-lab" id="ref-range-count-${active.id}" style="color:#94a3b8">-</span>
        </div>` : ''}
        <div class="sim-strip" id="sim-strip-${active.id}">${this.renderSimStrip(active)}</div>
        <div class="opt-row">
          <label class="opt-item"><select id="sim-risk-${active.id}" data-id="${active.id}" title="risk">${riskOpts}</select></label>
          <label class="opt-item">상승예측 <input id="sim-trend-${active.id}" data-id="${active.id}" title="상승예측 0~100" type="number" min="0" max="100" step="1" value="${Math.round(active.trendScore * 100)}" />%</label>
          <label class="opt-item">매수적용률 <input id="sim-buy-rate-${active.id}" data-id="${active.id}" type="number" min="0" max="100" step="1" value="${active.buyPctRate}" />%</label>
          <label class="opt-item">매도적용률 <input id="sim-sell-rate-${active.id}" data-id="${active.id}" type="number" min="0" max="100" step="1" value="${active.sellPctRate}" />%</label>
          <button type="button" class="opt-btn" data-id="${active.id}">🎲 최적화</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="section-box ma">
            <div class="section-head"><span class="section-title ma">📈 진입</span><span class="section-desc">이동평균 골든/데드 신호 조건</span>
              <label style="display:inline-flex;align-items:center;gap:4px;margin-left:auto;font-size:11px;font-weight:700;color:#92400e;white-space:nowrap" title="같은 봉에 겹친 조건 확정 방식 (매수/매도% 기준)">조건중복<select id="sim-resolve-mode-${active.id}" data-id="${active.id}" style="height:32px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;background:#fff;color:#92400e;padding:0 4px;outline:none">${resOpts(active.maResolveMode)}</select></label>
            </div>
            <div id="ma-list" class="ma-list">${this.maListHtml(active)}</div>
            <button type="button" class="add-ma-btn" id="add-ma-btn">+ 이동평균선 추가</button>
          </div>
          <div class="section-box exit">
            <div class="section-head"><span class="section-title exit">💜 실현</span><span class="section-desc">보유분 청산 조건</span>
              <label style="display:inline-flex;align-items:center;gap:4px;margin-left:auto;font-size:11px;font-weight:700;color:#5b21b6;white-space:nowrap" title="같은 봉에 겹친 실현 조건 확정 방식 (매도% 기준)">조건중복<select id="sim-exit-resolve-mode-${active.id}" data-id="${active.id}" style="height:32px;border-radius:8px;border:1px solid #c4b5fd;font-size:11px;font-weight:800;background:#ede9fe;color:#5b21b6;padding:0 4px;outline:none">${resOpts(active.exitResolveMode)}</select></label>
            </div>
            <div id="exit-list">${this.exitListHtml(active)}</div>
            <button type="button" class="add-exit-btn" id="add-exit-btn">+ 실현 조건 추가</button>
            <div style="font-size:10px;color:#94a3b8;margin-top:6px">조건 충족 시 보유주수의 일부를 청산하고, 이후 N회 MA 매매를 스킵합니다.</div>
          </div>
        </div>`;
      const slider = body.querySelector(`#trade-range-${active.id}`) as any;
      if (slider && typeof slider.setValues === 'function') {
        slider.setValues({ start: active.start, end: active.end });
      }
      // 참고 토글은 직접 바인딩 (위임 리타게팅 이슈 우회 — 렌더마다 재생성이라 중복 없음)
      body.querySelectorAll('.ref-toggle').forEach((b) => {
        (b as HTMLElement).onclick = (ev) => this.onRefToggleWrap(ev);
      });
      this.updateTradeRangeLabels(active.id);
      if (active.refMode === 'custom') {
        const rs = { start: active.refStart, end: active.refEnd };
        if (!this.chartCandles.length) { rs.start = 0; rs.end = 0; }
        else {
          rs.end = Math.max(0, Math.min(Math.floor(rs.end), this.chartCandles.length - 1));
          rs.start = Math.max(0, Math.min(Math.floor(rs.start), rs.end));
        }
        active.refStart = rs.start; active.refEnd = rs.end;
        const rslider = body.querySelector(`#ref-range-${active.id}`) as any;
        if (rslider && typeof rslider.setValues === 'function') {
          rslider.setValues({ start: rs.start, end: rs.end });
        }
        this.updateRefRangeLabels(active.id);
      }
    }

    private updateRefRangeLabels(id: number) {
      const z = this.tradeRanges.find(z => z.id === id);
      if (!z || !this.chartCandles.length) return;
      const sEl = this.shadowRoot?.querySelector(`#ref-range-start-${id}`) as HTMLElement;
      const eEl = this.shadowRoot?.querySelector(`#ref-range-end-${id}`) as HTMLElement;
      const cEl = this.shadowRoot?.querySelector(`#ref-range-count-${id}`) as HTMLElement;
      if (sEl) sEl.textContent = this.chartCandles[z.refStart]?.date ?? '-';
      if (eEl) eEl.textContent = this.chartCandles[z.refEnd]?.date ?? '-';
      if (cEl) cEl.textContent = `${z.refEnd - z.refStart + 1}개`;
    }

    private updateTradeRangeLabels(id: number) {
      const z = this.tradeRanges.find(z => z.id === id);
      if (!z || !this.chartCandles.length) return;
      const sEl = this.shadowRoot?.querySelector(`#trade-range-start-${id}`) as HTMLElement;
      const eEl = this.shadowRoot?.querySelector(`#trade-range-end-${id}`) as HTMLElement;
      const cEl = this.shadowRoot?.querySelector(`#trade-range-count-${id}`) as HTMLElement;
      if (sEl) sEl.textContent = this.chartCandles[z.start]?.date ?? '-';
      if (eEl) eEl.textContent = this.chartCandles[z.end]?.date ?? '-';
      if (cEl) cEl.textContent = `${z.end - z.start + 1}개`;
    }

    /** ✨ 자동추세구간: MACD+RSI+OBV 합성 추세로 상승/하락/횡보 분할 → 기존 등록 전부 삭제 후 재배치 */
    @event('#sim-auto-trend-mode', 'change')
    onAutoTrendMode(e: Event) {
      const sel = e.target as HTMLSelectElement;
      const mode = sel.value;
      sel.value = '';
      if (mode === 'merged') this.onAutoTrend();
      else if (mode === 'single') this.onAutoTrend({ mergeCut: 1 });
      else if (mode === 'manual') this.onAddRange();
    }

    private onAutoTrend(config?: TrendRange.TrendRangeConfig) {
      const n = this.chartCandles.length;
      if (!n) return;
      // 차트 하단 구간슬라이더 선택 범위만 분할 (지표 히스토리는 전체 캔들로 계산)
      const [zs, ze] = this.simRange();
      if (ze < zs) return;
      const closes = this.chartCandles.map(c => c.close);
      const vols = this.chartCandles.map(c => c.volume);
      const macd = computeMacdSeries(closes, 12, 26, 9);
      const rsi = computeRsiSeries(closes, 14);
      const obv = computeObvSeries(closes, vols);
      const bars: TrendRange.TrendBar[] = [];
      for (let i = zs; i <= ze; i++) {
        const c = this.chartCandles[i];
        bars.push({ macd: macd.macd[i], rsi: rsi[i], obv: obv[i], open: c.open, high: c.high, low: c.low, close: c.close });
      }
      const zones = TrendRange.trendRanges(bars, {
        ...config,
        groupBy: r => zoneRegimeOf(r).label,
      });
      let upN = 0, dnN = 0, sideN = 0;
      this.tradeRanges = zones.map((g, i) => {
        const regime = zoneRegimeOf(g.scoreRate);
        const no = regime.label === '상승' ? ++upN : regime.label === '하락' ? ++dnN : ++sideN;
        // 강도 배분: 방향 쪽에 strength%, 반대쪽에 나머지. 중립(0.5)은 50/50.
        const sPct = Math.max(0, Math.min(100, Math.round(g.strengthRate * 100)));
        const dirUp = g.scoreRate > 0.5, dirDn = g.scoreRate < 0.5;
        // 첫 구간: 불러온 처음~자기 바로 앞을 직접입력 참고. 이후 구간: 앞선 모든 구간을 누적 참고
        const ownStart = Math.max(zs, Math.min(zs + g.startIndex, ze));
        return {
          id: i + 1,
          uuid: g.uuid,
          label: `${regime.label} ${no}`,
          color: regime.color,
          start: Math.max(zs, Math.min(zs + g.startIndex, ze)),
          end: Math.max(zs, Math.min(zs + g.endIndex, ze)),
          refMode: (i === 0 ? (ownStart > 0 ? 'custom' : 'none') : 'ranges') as 'none' | 'range' | 'ranges' | 'custom',
          refRangeId: i > 0 ? 1 : 0, refRangeIds: Array.from({ length: i }, (_, k) => k + 1),
          refStart: 0, refEnd: i === 0 ? ownStart - 1 : Math.max(0, n - 1),
          riskAversion: g.strengthRate > 0.5 ? 0 : g.strengthRate < 0.5 ? 1 : 0.5,
          // 잠정 꼬리는 예상 rate를 prior로 (없으면 실측). 상승예측 입력에 그대로 보임
          trendScore: g.forecastRate ?? Math.max(0, Math.min(1, g.scoreRate)),
          buyPctRate: !dirUp && !dirDn ? 50 : dirUp ? sPct : 100 - sPct,
          sellPctRate: !dirUp && !dirDn ? 50 : dirUp ? 100 - sPct : sPct,
          maResolveMode: 'minFirst', exitResolveMode: 'minFirst',
          confirmed: g.confirmed,
          best: null, sim: null, localRate: 0, localProfit: 0,
        };
      });
      this.nextRangeId = this.tradeRanges.length + 1;
      this.activeRangeId = this.tradeRanges.length ? this.tradeRanges[0].id : 0;
      this.refreshRealized();
    }

    /** 구간의 참고구간 캔들 (ranges=참조 구간들 시간순 연결, range=참조 구간 1개, custom=직접 선택, none=자기 구간) */
    private refCandles(z: { refMode: 'none' | 'range' | 'ranges' | 'custom'; refRangeId: number; refRangeIds?: number[]; refStart: number; refEnd: number; start: number; end: number }): SimCandle[] {
      if (!this.chartCandles.length) return [];
      if (z.refMode === 'ranges') {
        const list = (z.refRangeIds ?? [])
          .map(id => this.tradeRanges.find(x => x.id === id))
          .filter(Boolean) as TradeRange[];
        if (list.length) return list.sort((a, b) => a.start - b.start).flatMap(rz => this.chartCandles.slice(rz.start, rz.end + 1));
      } else if (z.refMode === 'range') {
        const rz = this.tradeRanges.find(x => x.id === z.refRangeId);
        if (rz) return this.chartCandles.slice(rz.start, rz.end + 1);
      } else if (z.refMode === 'custom') {
        return this.chartCandles.slice(z.refStart, z.refEnd + 1);
      }
      return this.chartCandles.slice(z.start, z.end + 1);
    }

    private maListHtml(z: TradeRange): string {
      if (!z.best?.maConfigs?.length) return `<div class="empty-state">최적화를 실행하거나 아래 버튼으로 추가하세요</div>`;
      const signalFieldHtml = (sig: any, sIdx: number) => `
            <div class="ma-field" data-sidx="${sIdx}">
              <div class="ma-field-head">
                <div class="ma-action-box">
                  <select class="ma-signal" data-v="${sig.signal}" title="신호 종류"><option value="golden" ${sig.signal === 'golden' ? 'selected' : ''}>● 골든</option><option value="dead" ${sig.signal === 'dead' ? 'selected' : ''}>● 데드</option></select>
                  <select class="ma-action" data-v="${sig.action}"><option value="buy" ${sig.action === 'buy' ? 'selected' : ''}>매수</option><option value="sell" ${sig.action === 'sell' ? 'selected' : ''}>매도</option></select>
                  <input class="ma-pct" type="number" min="1" max="100" value="${sig.percent}" /><span class="pct">%</span>
                </div>
                <button type="button" class="signal-remove" data-sidx="${sIdx}" title="신호 삭제">✕</button>
              </div>
              <div class="ma-field-opts">
                <label class="ma-mini-opt"><span class="ma-help" data-help="크로스 상태 유지(발생 포함). 크로스 발생봉을 1봉째로 셈하고, 종가가 MA 위(골든)/아래(데드)에 입력한 봉수만큼 연속 머물면 그 봉에 매매합니다. 유지되는 동안 매 봉 체결됩니다.">유지</span> <input class="ma-consecutive" type="number" min="1" max="10" value="${sig.consecutive ?? 2}" />봉째 매매</label>
                <label class="ma-mini-opt"><span class="ma-help" data-help="이 신호로 매매한 뒤 쉬는 봉 수. 0이면 매 봉 발동. 유지 조건으로 연속 매수되는 것을 끊을 때 사용.">매매후</span> <input class="ma-skipafter" type="number" min="0" max="20" value="${sig.skipAfter ?? 0}" />봉 쉼</label>
                <label class="ma-mini-opt"><span class="ma-help" data-help="캔들 종가 기준 필터.">캔들</span> <select class="ma-candle"><option value="any" ${sig.candleFilter === 'any' ? 'selected' : ''}>무관</option><option value="bull" ${sig.candleFilter === 'bull' ? 'selected' : ''}>양봉</option><option value="bear" ${sig.candleFilter === 'bear' ? 'selected' : ''}>음봉</option></select></label>
                <label class="ma-mini-opt"><span class="ma-help" data-help="전봉 거래량 대비 필터.">거래량</span> <select class="ma-volume"><option value="any" ${sig.volumeFilter === 'any' ? 'selected' : ''}>무관</option><option value="higher" ${sig.volumeFilter === 'higher' ? 'selected' : ''}>증가</option><option value="lower" ${sig.volumeFilter === 'lower' ? 'selected' : ''}>감소</option></select></label>
                <label class="ma-mini-opt"><span class="ma-help" data-help="현재 MA와 다른 MA들의 위치 관계">배열</span> <select class="ma-alignment"><option value="any" ${sig.alignment === 'any' ? 'selected' : ''}>무관</option><option value="aligned" ${sig.alignment === 'aligned' ? 'selected' : ''}>정배열</option><option value="reverse" ${sig.alignment === 'reverse' ? 'selected' : ''}>역배열</option><option value="largerAbove" ${sig.alignment === 'largerAbove' ? 'selected' : ''}>큰MA 위</option><option value="largerBelow" ${sig.alignment === 'largerBelow' ? 'selected' : ''}>큰MA 아래</option><option value="smallerAbove" ${sig.alignment === 'smallerAbove' ? 'selected' : ''}>작은MA 위</option><option value="smallerBelow" ${sig.alignment === 'smallerBelow' ? 'selected' : ''}>작은MA 아래</option></select></label>
                <label class="ma-mini-opt"><span class="ma-help" data-help="최근 체결 끝에서 해당 방향이 이어진 횟수. 연속선택은 이 신호와 같은 방향. 무관=항상 통과.">연속매매</span> <select class="ma-condtrade-type"><option value="any" ${sig.condTrade?.type === 'any' ? 'selected' : ''}>무관</option><option value="consecutiveBuy" ${sig.condTrade?.type === 'consecutiveBuy' ? 'selected' : ''}>연속매수</option><option value="consecutiveSell" ${sig.condTrade?.type === 'consecutiveSell' ? 'selected' : ''}>연속매도</option><option value="consecutiveSelected" ${sig.condTrade?.type === 'consecutiveSelected' ? 'selected' : ''}>연속선택</option></select><select class="ma-condtrade-op" style="${(sig.condTrade?.type ?? 'any') === 'any' ? 'display:none' : ''}"><option value="<" ${sig.condTrade?.operator === '<' ? 'selected' : ''}>&lt;</option><option value="<=" ${sig.condTrade?.operator === '<=' ? 'selected' : ''}>&lt;=</option><option value="=" ${sig.condTrade?.operator === '=' ? 'selected' : ''}>=</option><option value="!=" ${sig.condTrade?.operator === '!=' ? 'selected' : ''}>!=</option><option value=">=" ${sig.condTrade?.operator === '>=' ? 'selected' : ''}>&gt;=</option><option value=">" ${sig.condTrade?.operator === '>' ? 'selected' : ''}>&gt;</option></select><input class="ma-condtrade-val" type="number" min="1" max="20" step="1" value="${sig.condTrade?.value ?? 1}" style="${(sig.condTrade?.type ?? 'any') === 'any' ? 'display:none' : ''}" /></label><label class="ma-mini-opt"><span class="ma-help" data-help="현재봉까지 같은 캔들이 이어진 개수. 무관=항상 통과.">연속봉</span> <select class="ma-condcandle-type"><option value="any" ${sig.condCandle?.type === 'any' ? 'selected' : ''}>무관</option><option value="consecutiveBullish" ${sig.condCandle?.type === 'consecutiveBullish' ? 'selected' : ''}>연속양봉</option><option value="consecutiveBearish" ${sig.condCandle?.type === 'consecutiveBearish' ? 'selected' : ''}>연속음봉</option></select><select class="ma-condcandle-op" style="${(sig.condCandle?.type ?? 'any') === 'any' ? 'display:none' : ''}"><option value="<" ${sig.condCandle?.operator === '<' ? 'selected' : ''}>&lt;</option><option value="<=" ${sig.condCandle?.operator === '<=' ? 'selected' : ''}>&lt;=</option><option value="=" ${sig.condCandle?.operator === '=' ? 'selected' : ''}>=</option><option value="!=" ${sig.condCandle?.operator === '!=' ? 'selected' : ''}>!=</option><option value=">=" ${sig.condCandle?.operator === '>=' ? 'selected' : ''}>&gt;=</option><option value=">" ${sig.condCandle?.operator === '>' ? 'selected' : ''}>&gt;</option></select><input class="ma-condcandle-val" type="number" min="1" max="20" step="1" value="${sig.condCandle?.value ?? 1}" style="${(sig.condCandle?.type ?? 'any') === 'any' ? 'display:none' : ''}" /></label><label class="ma-mini-opt"><span class="ma-help" data-help="이격도=(종가-MA)/MA×100%. 기울기=(MA-전봉MA)/전봉MA×100%. 무관=항상 통과.">평균선</span> <select class="ma-condma-type"><option value="any" ${sig.condMa?.type === 'any' ? 'selected' : ''}>무관</option><option value="maDeviation" ${sig.condMa?.type === 'maDeviation' ? 'selected' : ''}>이격도</option><option value="maSlope" ${sig.condMa?.type === 'maSlope' ? 'selected' : ''}>기울기</option></select><select class="ma-condma-op" style="${(sig.condMa?.type ?? 'any') === 'any' ? 'display:none' : ''}"><option value="<" ${sig.condMa?.operator === '<' ? 'selected' : ''}>&lt;</option><option value="<=" ${sig.condMa?.operator === '<=' ? 'selected' : ''}>&lt;=</option><option value="=" ${sig.condMa?.operator === '=' ? 'selected' : ''}>=</option><option value="!=" ${sig.condMa?.operator === '!=' ? 'selected' : ''}>!=</option><option value=">=" ${sig.condMa?.operator === '>=' ? 'selected' : ''}>&gt;=</option><option value=">" ${sig.condMa?.operator === '>' ? 'selected' : ''}>&gt;</option></select><input class="ma-condma-val" type="number" min="-50" max="50" step="0.1" value="${sig.condMa?.value ?? 0}" style="width:54px;${(sig.condMa?.type ?? 'any') === 'any' ? 'display:none' : ''}" /></label>
              </div>
            </div>`;
      return z.best.maConfigs.map((ma: any, idx: number) => `
        <div class="ma-row" data-idx="${idx}">
          <div class="ma-row-head">
            <div class="ma-identity">
              <span class="ma-color" data-color="${ma.color}" style="background:${ma.color}" title="선 색상 변경"><input class="ma-color-input" type="color" value="${ma.color}" tabindex="-1" /></span>
              <input class="ma-period" type="number" min="2" max="500" value="${ma.period}" title="틱수" />
              <span class="ma-unit ma-help" data-help="이동평균 기간(틱수). 예: 5MA = 최근 5봉 종가 평균.">MA</span>
              <span style="font-size:10px;color:#b45309;background:#fef3c7;border:1px solid #fde68a;border-radius:999px;padding:2px 8px;font-weight:800">${ma.pyramiding.signals.length}개 신호</span>
            </div>
            <div class="ma-row-actions">
              <button type="button" class="add-signal-btn" data-idx="${idx}" title="신호 추가">+ 신호</button>
              <button type="button" class="ma-remove" data-idx="${idx}" title="MA 삭제">✕</button>
            </div>
          </div>
          <div class="ma-row-fields">
            ${ma.pyramiding.signals.map((sig: any, sIdx: number) => signalFieldHtml(sig, sIdx)).join('')}
          </div>
        </div>
      `).join('');
    }

    private exitListHtml(z: TradeRange): string {
      if (!z.best?.exitConfigs?.length) return `<div class="empty-state">조건 없음 — 청산 없이 보유</div>`;
      return z.best.exitConfigs.map((ex: any, idx: number) => `
        <div class="ma-row exit-row" data-idx="${idx}">
          <div class="exit-head">
            <div class="exit-title"><span class="exit-badge">${idx + 1}</span> 실현 조건</div>
            <button type="button" class="ma-remove exit-remove" data-idx="${idx}" title="삭제">✕</button>
          </div>
          <div class="exit-main">
            <span class="lbl ma-help" data-help="수익률±=(현재가-평균)/평균, 보유고점−=(보유중최고가-현재)/보유중최고가, 보유저점+=(현재-보유중최저가)/보유중최저가. 고점/저점은 보유 기간 중에 갱신되는 값으로, 종목의 신고가·신저가와 무관합니다.">조건</span>
            <select class="exit-basis" data-idx="${idx}"><option value="profitRise" ${ex.basis === 'profitRise' ? 'selected' : ''}>수익률 +</option><option value="profitFall" ${ex.basis === 'profitFall' ? 'selected' : ''}>수익률 −</option><option value="peakFall" ${ex.basis === 'peakFall' ? 'selected' : ''}>보유고점 −</option><option value="peakRise" ${ex.basis === 'peakRise' ? 'selected' : ''}>보유저점 +</option></select>
            <span class="exit-inputs">
              <input class="exit-pct" data-idx="${idx}" type="number" min="1" max="100" value="${ex.percent}" />% 도달 시
              <input class="exit-sell" data-idx="${idx}" type="number" min="1" max="100" value="${ex.sellPercent}" />% 청산
            </span>
          </div>
          <div class="exit-opts tp-sl-opts">
            <label class="exit-opt"><span class="ma-help" data-help="캔들 필터">캔들</span> <select class="exit-candle" data-idx="${idx}"><option value="any" ${ex.candle === 'any' ? 'selected' : ''}>무관</option><option value="bull" ${ex.candle === 'bull' ? 'selected' : ''}>양봉</option><option value="bear" ${ex.candle === 'bear' ? 'selected' : ''}>음봉</option></select></label>
            <label class="exit-opt"><span class="ma-help" data-help="거래량 필터">거래량</span> <select class="exit-volume" data-idx="${idx}"><option value="any" ${ex.volume === 'any' ? 'selected' : ''}>무관</option><option value="higher" ${ex.volume === 'higher' ? 'selected' : ''}>증가</option><option value="lower" ${ex.volume === 'lower' ? 'selected' : ''}>감소</option></select></label>
            <label class="exit-opt"><span>스킵</span> <input class="exit-skip" data-idx="${idx}" type="number" min="0" max="20" value="${ex.skip}" />회</label>
          </div>
        </div>
      `).join('');
    }

    private renderSimStrip(z: { sim: SimResult | null; localRate: number; localProfit: number }): string {
      if (!z.sim) return `<span style="color:#94a3b8">최적화를 실행하세요</span>`;
      const fails = z.sim.trades.filter(t => t.action === 'buy-fail' || t.action === 'sell-fail').length;
      const done = z.sim.trades.length - fails;
      const hi = (n: number) => n > 0 ? '#dc2626' : n < 0 ? '#2563eb' : '#1e293b';
      const rate = `${z.localRate >= 0 ? '+' : ''}${z.localRate.toFixed(2)}%`;
      const profit = `${z.localProfit >= 0 ? '+' : ''}${Math.round(z.localProfit).toLocaleString()}원`;
      // 단순보유 (구간 첫~끝 종가 보유 가정) 비교
      let hold = '';
      const zs = (z as any).start as number, ze = (z as any).end as number;
      const f = this.chartCandles[Math.max(0, Math.min(zs, this.chartCandles.length - 1))]?.close;
      const l = this.chartCandles[Math.max(0, Math.min(ze, this.chartCandles.length - 1))]?.close;
      if (f) {
        const r = ((l - f) / f) * 100;
        hold = ` · 단순보유 <b style="color:${hi(r)}">${r >= 0 ? '+' : ''}${r.toFixed(2)}%</b>`;
      }
      return `수익률 <b style="color:${hi(z.localRate)}">${rate}</b> · 손익 <b style="color:${hi(z.localProfit)}">${profit}</b> · 체결 <b>${done}건</b>${fails ? ` (실패 <b>${fails}건</b>)` : ''}${hold}`;
    }

    private updateSimStrip(id: number) {
      const z = this.tradeRanges.find(z => z.id === id);
      const el = this.shadowRoot?.querySelector(`#sim-strip-${id}`) as HTMLElement;
      if (!z || !el) return;
      el.innerHTML = this.renderSimStrip(z);
    }

    /** 활성 구간의 MA/실현 폼 → best 커밋 (타이핑 중 body 리렌더 없음) */
    private parseRangeConditions(): TradeRange | null {
      const z = this.tradeRanges.find(z => z.id === this.activeRangeId);
      if (!z) return null;
      this.syncOptFromForm(z.id);
      if (!z.best) return z;
      const rows = this.shadowRoot?.querySelectorAll('#ma-list .ma-row');
      if (rows && rows.length) {
        const newConfigs: any[] = [];
        rows.forEach((row: any) => {
          const period = Number(row.querySelector('.ma-period')?.value) || 0;
          const color = row.querySelector('.ma-color')?.getAttribute('data-color') || '#6366f1';
          const fields = row.querySelectorAll('.ma-field');
          const signals: any[] = [];
          fields.forEach((field: any) => {
            const signal = (field.querySelector('.ma-signal') as HTMLSelectElement)?.value as 'golden' | 'dead' || 'golden';
            const action = (field.querySelector('.ma-action') as HTMLSelectElement)?.value as 'buy' | 'sell' || 'buy';
            const pct = Number((field.querySelector('.ma-pct') as HTMLInputElement)?.value) || 20;
            const candle = (field.querySelector('.ma-candle') as HTMLSelectElement)?.value as any || 'any';
            const volume = (field.querySelector('.ma-volume') as HTMLSelectElement)?.value as any || 'any';
            const con = Number(field.querySelector('.ma-consecutive')?.value) || 2;
            const saRaw = (field.querySelector('.ma-skipafter') as HTMLInputElement)?.value;
            const skipAfter = saRaw === '' || saRaw == null ? 0 : Math.max(0, Math.min(20, Math.floor(Number(saRaw) || 0)));
            const align = (field.querySelector('.ma-alignment') as HTMLSelectElement)?.value as any || 'any';
            const ctType = (field.querySelector('.ma-condtrade-type') as HTMLSelectElement)?.value as any || 'any';
            const ctOp = (field.querySelector('.ma-condtrade-op') as HTMLSelectElement)?.value as any || 'any';
            const ctVal = Number((field.querySelector('.ma-condtrade-val') as HTMLInputElement)?.value) || 1;
            const ccType = (field.querySelector('.ma-condcandle-type') as HTMLSelectElement)?.value as any || 'any';
            const ccOp = (field.querySelector('.ma-condcandle-op') as HTMLSelectElement)?.value as any || 'any';
            const ccVal = Number((field.querySelector('.ma-condcandle-val') as HTMLInputElement)?.value) || 1;
            const cmType = (field.querySelector('.ma-condma-type') as HTMLSelectElement)?.value as any || 'any';
            const cmOp = (field.querySelector('.ma-condma-op') as HTMLSelectElement)?.value as any || 'any';
            const cmVal = Number((field.querySelector('.ma-condma-val') as HTMLInputElement)?.value) || 0;
            const normOp2 = (v: any) => ['<', '<=', '=', '!=', '>=', '>'].includes(v) ? v : 'any';
            signals.push({ signal: signal === 'dead' ? 'dead' : 'golden', action: action === 'sell' ? 'sell' : 'buy', percent: Math.max(1, Math.min(100, pct)), candleFilter: candle === 'bull' ? 'bull' : candle === 'bear' ? 'bear' : 'any', volumeFilter: volume === 'higher' ? 'higher' : volume === 'lower' ? 'lower' : 'any', consecutive: Math.max(1, Math.min(10, Math.floor(con) || 2)), skipAfter, alignment: align as any, condTrade: { type: ['consecutiveBuy', 'consecutiveSell', 'consecutiveSelected'].includes(ctType) ? ctType : 'any', operator: normOp2(ctOp), value: Math.max(1, Math.min(20, Math.floor(Number(ctVal) || 1))) }, condCandle: { type: ['consecutiveBullish', 'consecutiveBearish'].includes(ccType) ? ccType : 'any', operator: normOp2(ccOp), value: Math.max(1, Math.min(20, Math.floor(Number(ccVal) || 1))) }, condMa: { type: ['maDeviation', 'maSlope'].includes(cmType) ? cmType : 'any', operator: normOp2(cmOp), value: Math.max(-50, Math.min(50, Number(cmVal) || 0)) } });
          });
          if (period > 0) newConfigs.push({ period, color, pyramiding: { signals: signals.length ? signals : [{ signal: 'golden', action: 'buy', percent: 20, candleFilter: 'any', volumeFilter: 'any', consecutive: 2, alignment: 'any', condTrade: { type: 'any', operator: 'any', value: 1 }, condCandle: { type: 'any', operator: 'any', value: 1 }, condMa: { type: 'any', operator: 'any', value: 1 } }] } });
        });
        if (newConfigs.length) z.best.maConfigs = newConfigs.sort((a, b) => a.period - b.period);
      }
      const exitRows = this.shadowRoot?.querySelectorAll('#exit-list .ma-row');
      if (exitRows) {
        const newExits: any[] = [];
        exitRows.forEach((row: any) => {
          const basis = (row.querySelector('.exit-basis') as HTMLSelectElement)?.value as any || 'profitRise';
          const pct = Number((row.querySelector('.exit-pct') as HTMLInputElement)?.value) || 0;
          const sell = Number((row.querySelector('.exit-sell') as HTMLInputElement)?.value) || 0;
          const skip = Number((row.querySelector('.exit-skip') as HTMLInputElement)?.value) || 0;
          const candle = (row.querySelector('.exit-candle') as HTMLSelectElement)?.value as any || 'any';
          const volume = (row.querySelector('.exit-volume') as HTMLSelectElement)?.value as any || 'any';
          newExits.push({ basis: ['profitRise', 'profitFall', 'peakFall', 'peakRise'].includes(basis) ? basis : 'profitRise', percent: Math.max(1, Math.min(100, pct)), sellPercent: Math.max(1, Math.min(100, sell)), skip: Math.max(0, Math.min(20, skip)), candle: candle === 'bull' ? 'bull' : candle === 'bear' ? 'bear' : 'any', volume: volume === 'higher' ? 'higher' : volume === 'lower' ? 'lower' : 'any' });
        });
        if (newExits.length) z.best.exitConfigs = newExits;
        else if (exitRows.length === 0) z.best.exitConfigs = [];
      }
      return z;
    }

    private updateMaRowFieldsSingle() {
      this.shadowRoot?.querySelectorAll('.ma-row').forEach(row => {
        const fields = row.querySelector('.ma-row-fields') as HTMLElement;
        if (!fields) return;
        const signals = row.querySelectorAll('.ma-field');
        const isSingle = signals.length <= 1;
        fields.classList.toggle('is-single', isSingle);
      });
    }

    private syncOptFromForm(id: number) {
      const z = this.tradeRanges.find(z => z.id === id);
      if (!z) return;
      const riskEl = this.shadowRoot?.querySelector(`#sim-risk-${id}`) as HTMLSelectElement;
      if (riskEl && ['0', '0.5', '1'].includes(riskEl.value)) z.riskAversion = Number(riskEl.value);
      const trendEl = this.shadowRoot?.querySelector(`#sim-trend-${id}`) as HTMLInputElement;
      if (trendEl) { const v = Number(trendEl.value); if (Number.isFinite(v)) z.trendScore = Math.max(0, Math.min(1, Math.round(v) / 100)); }
      const buyEl = this.shadowRoot?.querySelector(`#sim-buy-rate-${id}`) as HTMLInputElement;
      if (buyEl) { const v = Number(buyEl.value); if (Number.isFinite(v)) z.buyPctRate = Math.max(0, Math.min(100, Math.floor(v))); }
      const sellEl = this.shadowRoot?.querySelector(`#sim-sell-rate-${id}`) as HTMLInputElement;
      if (sellEl) { const v = Number(sellEl.value); if (Number.isFinite(v)) z.sellPctRate = Math.max(0, Math.min(100, Math.floor(v))); }
      const mresEl = this.shadowRoot?.querySelector(`#sim-resolve-mode-${id}`) as HTMLSelectElement;
      if (mresEl && isResolveMode(mresEl.value)) z.maResolveMode = mresEl.value;
      const xresEl = this.shadowRoot?.querySelector(`#sim-exit-resolve-mode-${id}`) as HTMLSelectElement;
      if (xresEl && isResolveMode(xresEl.value)) z.exitResolveMode = xresEl.value;
    }

    /** 단일 구간 10라운드 최적화 → 최고 수익률 저장, 승자 유무 반환.
     *  forceRef 지정 시(전체 최적화) 구간 개별 참고설정 대신 앞 구간 누적 캔들로 탐색. 빈 배열도 허용(→ prior 추론). */
    private async optimizeRange(
      z: TradeRange,
      onProgress?: (done: number) => void,
      forceRef?: SimCandle[],
    ): Promise<boolean> {
      this.syncOptFromForm(z.id);
      // 최적화 입력은 참고구간 캔들 (없으면 자기 구간), 실행은 자기 구간
      const ref = forceRef ?? this.refCandles(z);
      const own = this.chartCandles.slice(z.start, z.end + 1);
      if (!own.length) return false;
      if (!forceRef && !ref.length) return false;
      let winner: { best: TradingSimulator.BestConfig; sim: SimResult } | null = null;
      for (let r = 0; r < 10; r++) {
        const found = TradingSimulator.findBestConfig(ref, {
          trend: z.trendScore, riskAversion: z.riskAversion,
          buyPctRate: z.buyPctRate / 100, sellPctRate: z.sellPctRate / 100,
        });
        if (found) {
          const sim = TradingSimulator.simulate(own, found, {
            initialCapital: this.initialCapital, feePercent: this.feePercent,
            initialShares: this.initialShares, initialAvgPrice: this.initialAvgPrice,
            requireAll: true,
          });
          if (!winner || sim.rate > winner.sim.rate) winner = { best: found, sim };
        }
        if (r % 5 === 4) {
          onProgress?.(r + 1);
          await new Promise(rr => setTimeout(rr, 0));
        }
      }
      if (winner) {
        let best = winner.best;
        let sim = winner.sim;
        // 청개구리: 확정된 승자 조건을 마지막에 뒤집고 뒤집힌 조건으로 다시 시뮬
        if (this.contrarian) {
          best = this.flipSignalActions(best);
          sim = TradingSimulator.simulate(own, best, {
            initialCapital: this.initialCapital, feePercent: this.feePercent,
            initialShares: this.initialShares, initialAvgPrice: this.initialAvgPrice,
            requireAll: true,
          });
        }
        z.best = best;
        z.sim = sim;
        // 이긴 쪽 모드로 실행 설정 동기화
        z.maResolveMode = best.maResolveMode;
        z.exitResolveMode = best.exitResolveMode;
        console.log('[sim] optimize winner:', z.label, `rate=${sim.rate.toFixed(2)}% profit=${Math.round(sim.profit)}`);
        return true;
      }
      console.log('[sim] optimize: no winner', z.label);
      return false;
    }

    @eventDelegate('#sim-range-body', 'click')
    async onOptimizeClick(e: Event) {
      const btn = (e.target as HTMLElement).closest('.opt-btn') as HTMLButtonElement;
      if (!btn) return;
      const z = this.tradeRanges.find(z => z.id === Number(btn.dataset.id));
      if (!z || !this.chartCandles.length) return;
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = '최적 탐색 중...';
      try {
        await this.optimizeRange(z, done => { btn.textContent = `최적 탐색 중... (${done}/10)`; });
        this.refreshRealized();
      } finally {
        btn.disabled = false;
        if (orig) btn.textContent = orig;
      }
    }

    @event('#sim-optimize-all-btn', 'click', { preventDefault: true, stopPropagation: true })
    async onOptimizeAllClick(e: Event) {
      const btn = e.target as HTMLButtonElement;
      if (!this.tradeRanges.length || !this.chartCandles.length) return;
      btn.disabled = true;
      const orig = btn.textContent;
      try {
        // 시간순으로 앞에서부터 — 각 구간은 앞선 모든 구간의 캔들을 누적 참고로 탐색
        // 미확정 꼬리는 훈련·실행 모두 제외
        const ordered = [...this.tradeRanges].sort((a, b) => a.start - b.start);
        let prefix: SimCandle[] = [];
        for (let i = 0; i < ordered.length; i++) {
          const z = ordered[i];
          btn.textContent = `전체 최적화 (${i + 1}/${ordered.length})`;
          await this.optimizeRange(z, done => { btn.textContent = `전체 최적화 (${i + 1}/${ordered.length}) · ${done}/10`; }, [...prefix]);
          prefix = prefix.concat(this.chartCandles.slice(z.start, z.end + 1));
        }
        this.refreshRealized();
      } finally {
        btn.disabled = false;
        if (orig) btn.textContent = orig;
      }
    }

    /** 리플레이 버튼 표시 (대기/재생중 n/N/일시정지 n/N) */
    private paintReplayBtn() {
      const btn = this.shadowRoot?.querySelector('#sim-replay-btn') as HTMLElement;
      if (!btn || !btn.isConnected) return;
      const rp = this.replay;
      if (!rp || !rp.running) {
        const tag = rp ? ` ${rp.t - rp.S + 1}/${rp.E - rp.S + 1}` : '';
        btn.textContent = `▶ 추세자동매매${tag}`;
      } else {
        btn.textContent = `⏸ ${rp.t - rp.S + 1}/${rp.E - rp.S + 1}`;
      }
    }

    @event('#sim-contrarian', 'change')
    onContrarianChange() {
      const el = this.shadowRoot?.querySelector('#sim-contrarian') as HTMLInputElement;
      if (!el) return;
      this.contrarian = !!el.checked;
      // 현재 설정된 조건을 뒤집어 다시 매매 (뒤집기는 involution이라 토글 복원 시 원상복귀)
      for (const z of this.tradeRanges) {
        if (z.best) z.best = this.flipSignalActions(z.best);
      }
      this.refreshRealized();
    }

    @event('#sim-replay-contrarian', 'change')
    onReplayContrarianChange() {
      const el = this.shadowRoot?.querySelector('#sim-replay-contrarian') as HTMLInputElement;
      if (!el) return;
      // 리플레이 전용 — 실행 중인 루프가 다음 틱부터 읽음. 저장된 조건은 건드리지 않음
      this.replayContrarian = !!el.checked;
    }

    /** 청개구리: MA 신호의 매수↔매도 뒤집기 (청산 조건·신호 종류는 그대로) */
    private flipSignalActions(best: TradingSimulator.BestConfig): TradingSimulator.BestConfig {
      const out = JSON.parse(JSON.stringify(best)) as TradingSimulator.BestConfig;
      for (const m of (out as any).maConfigs ?? []) {
        for (const s of (m?.pyramiding?.signals ?? [])) {
          if (s.action === 'buy') s.action = 'sell';
          else if (s.action === 'sell') s.action = 'buy';
        }
      }
      return out;
    }

    @event('#sim-replay-btn', 'click')
    onReplayClick() {
      const rp = this.replay;
      if (rp?.running) { rp.running = false; this.paintReplayBtn(); return; } // 일시정지
      if (rp && !rp.running) {
        if (rp.t >= rp.E) { this.startReplay(); return; } // 완료됨 → 처음부터 다시
        rp.running = true; this.paintReplayBtn(); void this.replayLoop(); return; // 재개
      }
      this.startReplay();
    }

    /** 원장·저널 초기화 — 초기 보유금액·보유주·평단(선택 구간 첫 종가) 셋팅.
     *  보유주가 있으면 초기보유 1건을 내역 맨 앞에 (사유: 초기보유).
     *  페이지 진입·종목 로드·리플레이 시작 시 호출. refreshInitAvg() 선행 필요. */
    private initLedgerAndJournal() {
      // 실원장 초기화 — 이후 틱마다 확정 체결 1건씩만 반영
      this.ledgerCash = this.initialCapital;
      this.ledgerShares = Math.max(0, Math.floor(this.initialShares));
      this.ledgerAvg = this.initialAvgPrice;
      this.replayLog = [];
      // 시작 보유가 있으면 초기보유 1건을 내역 맨 앞에 (사유: 초기보유)
      if (this.ledgerShares > 0 && this.chartCandles.length) {
        const [S] = this.simRange();
        const c = this.chartCandles[Math.max(0, Math.min(S, this.chartCandles.length - 1))];
        const amt = Math.round(this.ledgerShares * this.ledgerAvg);
        this.replayLog.push({ absIdx: S, trade: {
          idx: 1, date: c.date, price: this.ledgerAvg, action: 'buy', barIdx: S,
          reason: `초기보유 ${this.ledgerShares.toLocaleString()}주 @ ${Math.round(this.ledgerAvg).toLocaleString()}원`,
          maPeriod: 0, percent: 100, sharesDelta: this.ledgerShares, amount: amt, fee: 0,
          cashAfter: this.ledgerCash, sharesAfter: this.ledgerShares, profitRate: null,
          avgPrice: this.ledgerAvg, holdingValue: amt, conds: [], condDetail: [],
        }});
      }
    }

    /** 리플레이 시작 — 설정·내역 초기화 후 선택 구간 처음부터 (구간은 병합자동으로 매 틱 재생성) */
    private startReplay() {
      const [S, E] = this.simRange();
      if (!this.chartCandles.length || E <= S) return;
      this.replayRanges = [];
      this.live = null;
      this.refreshInitAvg(); // 시작 평단 = 선택 구간 첫 캔들 종가
      this.initLedgerAndJournal();
      this.replay = { running: true, S, E, t: S - 1, gen: 0 };
      this.renderRangeTabs();
      this.renderRangeBody();
      this.updateResultDisplay();
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as HTMLElement;
      if (chartEl) chartEl.innerHTML = this.buildChartHtml();
      this.paintReplayBtn();
      void this.replayLoop();
    }

    private async replayLoop() {
      const rp = this.replay;
      if (!rp) return;
      const gen = (rp.gen = (rp.gen ?? 0) + 1);
      while (rp.running && rp.t < rp.E && this.isConnected && this.replay === rp && rp.gen === gen) {
        rp.t += 1;
        this.paintReplayBtn();
        await this.replayTick(rp.t);
        if (!rp.running) break;
        this.renderReplayTick();
        await new Promise(r => setTimeout(r, 30));
      }
      if (this.replay === rp && rp.gen === gen) {
        rp.running = false;
        this.paintReplayBtn();
      }
    }

    /** 리플레이 1틱 — t까지 히스토리로 병합자동 구간+잠정 예상 조건 탐색 후 당일봉만 집행·기록.
     *  카드 P&L은 당일 조건의 구간 전체(prefix) 백테스트 기준, 저널·마커는 실제 집행분만. */
    private async replayTick(t: number) {
      const rp = this.replay;
      if (!rp) return;
      const S = rp.S;
      const hist = this.chartCandles.slice(0, t + 1);
      const closes = hist.map(c => c.close), vols = hist.map(c => c.volume);
      const macd = computeMacdSeries(closes, 12, 26, 9);
      const rsi = computeRsiSeries(closes, 14);
      const obv = computeObvSeries(closes, vols);
      const bars: TrendRange.TrendBar[] = [];
      for (let i = S; i <= t; i++) {
        const c = hist[i];
        bars.push({ macd: macd.macd[i], rsi: rsi[i], obv: obv[i], open: c.open, high: c.high, low: c.low, close: c.close });
      }
      const zones = TrendRange.trendRanges(bars, { groupBy: r => zoneRegimeOf(r).label });
      let upN = 0, dnN = 0, sideN = 0;
      this.replayRanges = zones.map((g, i) => {
        const regime = zoneRegimeOf(g.scoreRate);
        const no = regime.label === '상승' ? ++upN : regime.label === '하락' ? ++dnN : ++sideN;
        // 강도 배분: 방향 쪽에 strength%, 반대쪽에 나머지. 중립(0.5)은 50/50. (전체최적화와 동일)
        const sPct = Math.max(0, Math.min(100, Math.round(g.strengthRate * 100)));
        const dirUp = g.scoreRate > 0.5, dirDn = g.scoreRate < 0.5;
        return {
          id: i + 1,
          uuid: g.uuid,
          label: `${regime.label} ${no}`,
          color: regime.color,
          start: Math.max(S, Math.min(S + g.startIndex, t)),
          end: Math.max(S, Math.min(S + g.endIndex, t)),
          refMode: 'none' as const, refRangeId: 0, refRangeIds: [] as number[], refStart: 0, refEnd: 0,
          riskAversion: g.strengthRate > 0.5 ? 0 : g.strengthRate < 0.5 ? 1 : 0.5,
          trendScore: g.forecastRate ?? Math.max(0, Math.min(1, g.scoreRate)),
          buyPctRate: !dirUp && !dirDn ? 50 : dirUp ? sPct : 100 - sPct,
          sellPctRate: !dirUp && !dirDn ? 50 : dirUp ? 100 - sPct : sPct,
          maResolveMode: 'minFirst' as ResolveMode, exitResolveMode: 'minFirst' as ResolveMode,
          confirmed: g.confirmed,
          best: null, sim: null, localRate: 0, localProfit: 0,
        };
      });
      const prov = this.replayRanges[this.replayRanges.length - 1];
      if (!prov) return;
      // 잠정 예상으로 당일 조건 탐색 (선택 구간만 학습 — 실행 슬라이스와 일치, 미래 없음).
      // 5라운드 돌려 최고 수익률로 승자 선정 후, 마지막봉 체결 여부만 본다
      const train = this.chartCandles.slice(S, t + 1);
      const own = this.chartCandles.slice(S, t + 1);
      let winner: { best: TradingSimulator.BestConfig; sim: SimResult } | null = null;
      for (let r = 0; r < 5; r++) {
        const best = TradingSimulator.findBestConfig(train as SimCandle[], {
          trend: prov.trendScore, riskAversion: prov.riskAversion,
          buyPctRate: prov.buyPctRate / 100, sellPctRate: prov.sellPctRate / 100, trials: 1,
        });
        if (!best) continue;
        // 실제 집행 내역 그대로 이어붙임 — in-engine trades 순회와 동일 시맨틱.
        // exit/fail 포함: 연속매매 카운트가 끊기는 지점까지 일치. 저널은 t 이전봉만이라 당일 누수 없음
        const prevActions: TradeAction[] = this.replayLog.map(e => e.trade.action);
        const sim = TradingSimulator.simulate(own as SimCandle[], best, {
          initialCapital: this.ledgerCash, feePercent: this.feePercent,
          initialShares: this.ledgerShares, initialAvgPrice: this.ledgerAvg,
          requireAll: true, prevActions,
        });
        if (!winner || sim.rate > winner.sim.rate) winner = { best, sim };
      }
      if (!winner) return;
      let { best, sim } = winner;
      // 청개구리: 확정된 승자 조건을 마지막에 뒤집고 뒤집힌 조건으로 다시 시뮬
      if (this.replayContrarian) {
        best = this.flipSignalActions(best);
        const prevActions: TradeAction[] = this.replayLog.map(e => e.trade.action);
        sim = TradingSimulator.simulate(own as SimCandle[], best, {
          initialCapital: this.ledgerCash, feePercent: this.feePercent,
          initialShares: this.ledgerShares, initialAvgPrice: this.ledgerAvg,
          requireAll: true, prevActions,
        });
      }
      // 잠정 구간 조건은 UI에 셋팅하지 않음 — 다음 틱에 바뀌는 잠정이라 표시가 오히려 혼란 (체인 미실행 — 리플레이는 아래 prefix 백테스트로 그림)
      // 맨마지막 거래내역이 당일봉 체결이면 실원장 기준으로 정산해 1건 적용, 아니면 패스 (0건).
      // sim-world 값이 아닌 원장 값으로 보유주식·현금·수수료를 다시 계산 (9주→357주 방지)
      const localT = t - S;
      const last = sim.trades.length ? sim.trades[sim.trades.length - 1] : null;
      if (last && last.barIdx === localT &&
        (last.action === 'buy' || last.action === 'sell' || last.action === 'exit')) {
        const settled = TradingSimulator.settleTradeToLedger(
          { cash: this.ledgerCash, shares: this.ledgerShares, avgPrice: this.ledgerAvg },
          last, this.feePercent, this.replayLog.length + 1);
        this.ledgerCash = settled.state.cash;
        this.ledgerShares = settled.state.shares;
        this.ledgerAvg = settled.state.avgPrice;
        this.replayLog.push({ absIdx: t, trade: { ...settled.trade, barIdx: t, reason: `[${prov.label}] ${settled.trade.reason}` } });
      }
      // 카드 P&L은 실원장 기준 (저널 누적과 동일 world)
      const startEq = this.startEquity();
      const lastClose = this.chartCandles[t].close;
      const evalAmt = this.ledgerCash + this.ledgerShares * lastClose;
      const profit = evalAmt - startEq;
      let fee = 0, count = 0, fails = 0;
      for (const e of this.replayLog) {
        fee += e.trade.fee || 0;
        if (e.trade.action === 'buy' || e.trade.action === 'sell' || e.trade.action === 'exit') count++;
        else if (e.trade.action === 'buy-fail' || e.trade.action === 'sell-fail') fails++;
      }
      this.live = {
        eval: evalAmt, cash: this.ledgerCash, shares: this.ledgerShares, profit,
        rate: startEq ? (profit / startEq) * 100 : 0, fee, count, fails,
      };
    }

    /** 리플레이 틱 렌더 — 체인 없이 스냅샷 직접 그림 */
    private renderReplayTick() {
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as HTMLElement;
      if (chartEl) chartEl.innerHTML = this.buildChartHtml();
      this.updateResultDisplay();
      this.renderRangeTabs();
      this.renderRangeBody();
    }

    /** 수동 구간 추가 (select 수동구간에서 호출) */
    onAddRange() {
      const id = this.nextRangeId++;
      const n = this.chartCandles.length;
      this.tradeRanges.push({
        id, uuid: crypto.randomUUID(), label: `구간 ${id}`,
        color: SET_PALETTE[(id - 1) % SET_PALETTE.length],
        start: 0, end: Math.max(0, n - 1),
        refMode: 'none', refRangeId: 0, refRangeIds: [], refStart: 0, refEnd: Math.max(0, n - 1),
        riskAversion: 0.5, trendScore: 0.5, buyPctRate: 100, sellPctRate: 100,
        maResolveMode: 'minFirst', exitResolveMode: 'minFirst',
        confirmed: true,
        best: null, sim: null, localRate: 0, localProfit: 0,
      });
      this.activeRangeId = id;
      this.refreshRealized();
    }

    @eventDelegate('#sim-range-body', 'input')
    onRangeBodyInput(e: Event) {
      const t = e.target as HTMLElement;
      const colorEl = t.closest('.range-color-input') as HTMLInputElement;
      if (colorEl) {
        const z = this.tradeRanges.find(z => z.id === Number(colorEl.dataset.id));
        if (z && /^#[0-9a-fA-F]{6}$/.test(colorEl.value)) {
          z.color = colorEl.value;
          this.renderRangeTabs();
          this.syncMasToChart();
        }
        return;
      }
      const slider = t.closest('range-slider') as any;
      if (!slider || !slider.value || typeof slider.value !== 'object') return;
      const s = Number(slider.value.start);
      const ed = Number(slider.value.end);
      if (!Number.isFinite(s) || !Number.isFinite(ed) || !this.chartCandles.length) return;
      const e2 = Math.max(0, Math.min(Math.floor(ed), this.chartCandles.length - 1));
      const s2 = Math.max(0, Math.min(Math.floor(s), e2));
      const rid = slider.hasAttribute('data-ref') ? slider.getAttribute('data-ref') : slider.dataset.id;
      const z = this.tradeRanges.find(z => z.id === Number(rid));
      if (!z) return;
      if (slider.hasAttribute('data-ref')) {
        z.refStart = s2; z.refEnd = e2;
        this.updateRefRangeLabels(z.id);
      } else {
        z.start = s2; z.end = e2;
        this.updateTradeRangeLabels(z.id);
      }
      // 지오메트리 변경 → 체인 재계산 (best 유지, body 포커스 보존)
      this.refreshRealized(true);
    }

    /** 참고 토글 직접 바인딩 진입점 (위임과 중복 방지 위해 위임 핸들러 없음) */
    private onRefToggleWrap(e: Event) {
      const btn = (e.target as HTMLElement).closest('.ref-toggle') as HTMLElement;
      console.log('[sim] ref-toggle click:', (e.target as HTMLElement)?.tagName, btn?.dataset?.ref);
      if (btn) this.applyRefToggle(btn);
    }

    private applyRefToggle(btn: HTMLElement) {
      const z = this.tradeRanges.find(z => z.id === Number(btn.dataset.id));
      if (!z) return;
      const v = btn.dataset.ref ?? '';
      if (v === 'custom') {
        z.refMode = 'custom';
        z.refStart = z.start; z.refEnd = z.end;
      } else if (v === 'none') {
        z.refMode = 'none'; z.refRangeId = 0; z.refRangeIds = [];
      } else if (v.startsWith('range:')) {
        const rid = Number(v.slice('range:'.length));
        if (!this.tradeRanges.some(x => x.id === rid && rid !== z.id)) return;
        const cur = new Set(z.refMode === 'ranges' ? z.refRangeIds : z.refMode === 'range' ? [z.refRangeId] : []);
        if (cur.has(rid)) cur.delete(rid);
        else cur.add(rid);
        const ids = [...cur].filter(id => this.tradeRanges.some(x => x.id === id && id !== z.id));
        if (ids.length >= 2) {
          z.refMode = 'ranges'; z.refRangeIds = ids; z.refRangeId = ids[0];
        } else if (ids.length === 1) {
          z.refMode = 'range'; z.refRangeId = ids[0]; z.refRangeIds = ids;
        } else {
          z.refMode = 'none'; z.refRangeId = 0; z.refRangeIds = [];
        }
      } else {
        return;
      }
      console.log('[sim] ref-toggle:', z.label, '→', z.refMode, JSON.stringify(z.refRangeIds));
      this.refreshRealized();
    }

    @eventDelegate('#sim-range-tabs', 'click')
    onRangeTabClick(e: Event) {
      const btn = (e.target as HTMLElement).closest('.range-tab') as HTMLElement;
      if (!btn) return;
      const id = Number(btn.dataset.id);
      if (!Number.isFinite(id) || id === this.activeRangeId) return;
      this.activeRangeId = id;
      this.renderRangeTabs();
      this.renderRangeBody();
      this.syncMasToChart();
    }

    @eventDelegate('#sim-range-body', 'change')
    onRangeRename(e: Event) {
      const input = (e.target as HTMLElement).closest('.range-name-input') as HTMLInputElement;
      if (!input) return;
      const id = Number(input.dataset.id);
      const z = this.tradeRanges.find(z => z.id === id);
      if (!z) return;
      const v = input.value.trim().slice(0, 20);
      if (v) z.label = v;
      this.renderRangeTabs();
      this.renderRangeBody();
      this.syncMasToChart();
    }

    @eventDelegate('#sim-range-body', 'click')
    onRangeDelete(e: Event) {
      const btn = (e.target as HTMLElement).closest('.range-delete') as HTMLElement;
      if (!btn) return;
      const id = Number(btn.dataset.id);
      if (!Number.isFinite(id)) return;
      const idx = this.tradeRanges.findIndex(z => z.id === id);
      if (idx < 0) return;
      this.tradeRanges.splice(idx, 1);
      // 삭제된 구간을 참조하던 참고구간은 끊음
      for (const z of this.tradeRanges) {
        if (z.refMode === 'range' && z.refRangeId === id) { z.refMode = 'none'; z.refRangeId = 0; z.refRangeIds = []; }
        else if (z.refMode === 'ranges') {
          z.refRangeIds = z.refRangeIds.filter(rid => rid !== id);
          if (!z.refRangeIds.length) { z.refMode = 'none'; }
          else if (z.refRangeIds.length === 1) { z.refMode = 'range'; z.refRangeId = z.refRangeIds[0]; }
        }
      }
      if (this.activeRangeId === id) {
        const next = this.tradeRanges[Math.min(idx, this.tradeRanges.length - 1)];
        this.activeRangeId = next ? next.id : 0;
      }
      this.refreshRealized();
    }

    /** best 껍데기 보장 (직접 추가 시작용) */
    private ensureBest(z: TradeRange): TradingSimulator.BestConfig {
      if (!z.best) {
        z.best = { maConfigs: [], exitConfigs: [], maResolveMode: z.maResolveMode, exitResolveMode: z.exitResolveMode };
      }
      return z.best;
    }

    @eventDelegate('#sim-range-body', 'input')
    onMaExitInput(e: Event) {
      const t = e.target as HTMLElement;
      if (!t.closest('.ma-row') && !t.closest('.opt-row')) return;
      if (t.classList.contains('ma-color-input')) {
        const dot = t.closest('.ma-color') as HTMLElement;
        const v = (t as HTMLInputElement).value;
        if (dot && /^#[0-9a-fA-F]{6}$/.test(v)) { dot.setAttribute('data-color', v); dot.style.background = v; }
      }
      if (this.parseRangeConditions()) this.refreshRealized(true);
    }

    @eventDelegate('#sim-range-body', 'change')
    onMaExitChange(e: Event) {
      const t = e.target as HTMLElement;
      if (!t.closest('.ma-row') && !t.closest('.section-box') && !t.closest('.opt-row')) return;
      if (t.classList.contains('ma-action') || t.classList.contains('ma-signal')) {
        (t as HTMLElement).dataset.v = (t as HTMLSelectElement).value;
      }
      if (t.classList.contains('ma-condtrade-type') || t.classList.contains('ma-condcandle-type') || t.classList.contains('ma-condma-type')) {
        const label = t.closest('label') as HTMLElement;
        if (label) {
          const isAny = (t as HTMLSelectElement).value === 'any';
          const selects = label.querySelectorAll('select');
          const input = label.querySelector('input') as HTMLElement;
          const op = selects[1] as HTMLElement;
          if (op) op.style.display = isAny ? 'none' : '';
          if (input) input.style.display = isAny ? 'none' : '';
        }
      }
      if (this.parseRangeConditions()) {
        this.updateMaRowFieldsSingle();
        this.refreshRealized(true);
      }
    }

    @eventDelegate('#sim-range-body', 'click')
    onAddMaBtn(e: Event) {
      if (!(e.target as HTMLElement).closest('#add-ma-btn')) return;
      const z = this.tradeRanges.find(z => z.id === this.activeRangeId);
      if (!z) return;
      this.parseRangeConditions();
      const best = this.ensureBest(z);
      const maxPeriod = best.maConfigs.length ? Math.max(...best.maConfigs.map((m: any) => m.period)) : 0;
      const cap = Math.max(5, Math.min(500, this.candleCount - 1));
      const nextPeriod = Math.min(cap, (maxPeriod || 0) + 10 || 10);
      const colors = ['#ef4444', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#06b6d4'];
      const color = colors[best.maConfigs.length % colors.length];
      best.maConfigs.push({
        period: nextPeriod, color, pyramiding: {
          signals: [
            { signal: 'golden', action: 'buy', percent: 20, candleFilter: 'bull', volumeFilter: 'higher', consecutive: 2, alignment: 'aligned', condTrade: { type: 'consecutiveSelected', operator: '>=', value: 4 }, condCandle: { type: 'any', operator: 'any', value: 1 }, condMa: { type: 'any', operator: 'any', value: 1 } },
            { signal: 'dead', action: 'sell', percent: 20, candleFilter: 'bear', volumeFilter: 'any', consecutive: 2, alignment: 'any', condTrade: { type: 'consecutiveSelected', operator: '>=', value: 4 }, condCandle: { type: 'any', operator: 'any', value: 1 }, condMa: { type: 'any', operator: 'any', value: 1 } },
          ],
        },
      } as any);
      best.maConfigs.sort((a: any, b: any) => a.period - b.period);
      this.refreshRealized();
    }

    @eventDelegate('#sim-range-body', 'click')
    onAddExitBtn(e: Event) {
      if (!(e.target as HTMLElement).closest('#add-exit-btn')) return;
      const z = this.tradeRanges.find(z => z.id === this.activeRangeId);
      if (!z) return;
      this.parseRangeConditions();
      const best = this.ensureBest(z);
      best.exitConfigs.push({ basis: 'profitRise', percent: 15, sellPercent: 100, skip: 5, candle: 'any', volume: 'any' } as any);
      this.refreshRealized();
    }

    @eventDelegate('#sim-range-body', 'click')
    onAddSignalBtn(e: Event) {
      const btn = (e.target as HTMLElement).closest('.add-signal-btn') as HTMLElement;
      if (!btn) return;
      const z = this.tradeRanges.find(z => z.id === this.activeRangeId);
      const idx = Number(btn.dataset.idx);
      if (!z?.best || !Number.isFinite(idx)) return;
      this.parseRangeConditions();
      const ma = z.best.maConfigs[idx] as any;
      if (!ma) return;
      ma.pyramiding.signals.push({ signal: 'golden', action: 'buy', percent: 20, candleFilter: 'any', volumeFilter: 'any', consecutive: 2, alignment: 'any', condTrade: { type: 'any', operator: 'any', value: 1 }, condCandle: { type: 'any', operator: 'any', value: 1 }, condMa: { type: 'any', operator: 'any', value: 1 } });
      this.refreshRealized();
    }

    @eventDelegate('#sim-range-body', 'click')
    onSignalRemoveBtn(e: Event) {
      const btn = (e.target as HTMLElement).closest('.signal-remove') as HTMLElement;
      if (!btn) return;
      const z = this.tradeRanges.find(z => z.id === this.activeRangeId);
      const row = (e.target as HTMLElement).closest('.ma-row') as HTMLElement;
      if (!z?.best || !row) return;
      const idx = Number(row.dataset.idx);
      const sIdx = Number(btn.dataset.sidx);
      if (!Number.isFinite(idx) || !Number.isFinite(sIdx)) return;
      this.parseRangeConditions();
      const ma = z.best.maConfigs[idx] as any;
      if (!ma) return;
      ma.pyramiding.signals.splice(sIdx, 1);
      if (!ma.pyramiding.signals.length) {
        ma.pyramiding.signals.push({ signal: 'golden', action: 'buy', percent: 20, candleFilter: 'any', volumeFilter: 'any', consecutive: 2, alignment: 'any', condTrade: { type: 'any', operator: 'any', value: 1 }, condCandle: { type: 'any', operator: 'any', value: 1 }, condMa: { type: 'any', operator: 'any', value: 1 } });
      }
      this.refreshRealized();
    }

    @eventDelegate('#sim-range-body', 'click')
    onMaRemoveBtn(e: Event) {
      const btn = (e.target as HTMLElement).closest('.ma-remove') as HTMLElement;
      if (!btn || btn.classList.contains('exit-remove')) return;
      const z = this.tradeRanges.find(z => z.id === this.activeRangeId);
      const idx = Number(btn.dataset.idx);
      if (!z?.best || !Number.isFinite(idx)) return;
      this.parseRangeConditions();
      z.best.maConfigs.splice(idx, 1);
      this.refreshRealized();
    }

    @eventDelegate('#sim-range-body', 'click')
    onExitRemoveBtn(e: Event) {
      const btn = (e.target as HTMLElement).closest('.exit-remove') as HTMLElement;
      if (!btn) return;
      const z = this.tradeRanges.find(z => z.id === this.activeRangeId);
      const idx = Number(btn.dataset.idx);
      if (!z?.best || !Number.isFinite(idx)) return;
      this.parseRangeConditions();
      z.best.exitConfigs.splice(idx, 1);
      this.refreshRealized();
    }

    @eventDelegate('#sim-range-body', 'click')
    onCondHelpClick(e: Event) {
      const raw = ((e as any).composedPath?.()?.[0] ?? e.target) as HTMLElement;
      const help = raw.closest('.ma-help') as HTMLElement;
      if (!help) return;
      e.preventDefault();
      e.stopPropagation();
      let tip = help.getAttribute('data-help');
      if (!tip) return;
      tip = tip.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const pop = this.shadowRoot?.querySelector('#ma-help-popover') as HTMLElement;
      if (!pop) return;
      if (pop.classList.contains('show') && pop.textContent === tip) {
        pop.classList.remove('show');
        return;
      }
      pop.textContent = tip;
      pop.classList.add('show');
      const rect = help.getBoundingClientRect();
      const popW = 280;
      let left = rect.left + rect.width / 2 - popW / 2;
      left = Math.max(8, Math.min(window.innerWidth - popW - 8, left));
      let top = rect.bottom + 8;
      if (top + 60 > window.innerHeight) top = rect.top - 50;
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
      setTimeout(() => {
        const hide = (ev: Event) => {
          const t = ((ev as any).composedPath?.()?.[0] ?? ev.target) as Node;
          if (pop.contains(t) || help.contains(t as Node)) return;
          pop.classList.remove('show');
          document.removeEventListener('click', hide);
        };
        setTimeout(() => document.addEventListener('click', hide), 0);
      }, 0);
    }

    /** 원장 기준 4종 스냅샷 (원금/수수료/보유주/평단) */
    private basisSnapshot(): [number, number, number, number] {
      return [this.initialCapital, this.feePercent, this.initialShares, this.initialAvgPrice];
    }

    /** 원장 기준 변경 시 거래 상태 전체 초기화.
     *  저널·체결·원장은 전부 옛 기준 산출물이므로 파기. 조건(best)은 유지. */
    private resetTradingState() {
      this.stopReplay(); // 루프 정지 + 저널 비움 (이미 멈춰있으면 no-op)
      this.live = null;
      this.ledgerCash = 0;
      this.ledgerShares = 0;
      this.ledgerAvg = 0;
      for (const z of this.tradeRanges) { z.sim = null; z.localRate = 0; z.localProfit = 0; }
    }

    private handleConfigForm() {
      const before = this.basisSnapshot();
      this.syncConfigFromForm();
      this.syncUrlWithoutReload();
      if (this.basisSnapshot().some((v, i) => v !== before[i])) this.resetTradingState();
      this.refreshRealized();
    }

    @event('#sim-config', 'change')
    onConfigFormChange() {
      this.handleConfigForm();
    }

    @event('#sim-config', 'input')
    onConfigFormInput() {
      this.handleConfigForm();
    }

    /** 종료일시 → from ISO (일봉 이하는 날짜 00:00, 분봉은 date+time). '' = 최신 */
    private endDateToFrom(): string {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(this.endDate)) return '';
      const isMin = this.timeframe.startsWith('min:');
      const hm = isMin && /^\d{2}:\d{2}$/.test(this.endTime) ? this.endTime : '00:00';
      return `${this.endDate}T${hm}:00+09:00`;
    }

    @event('#sim-candle-form', 'change')
    onCandleFormChange() {
      const prevCount = this.candleCount;
      const prevTf = this.timeframe;
      const prevEnd = `${this.endDate}|${this.endTime}`;
      this.syncConfigFromForm();
      this.updateEndTimeVisibility();
      this.syncSimParamsToUrl();
      if (prevCount !== this.candleCount || prevTf !== this.timeframe || prevEnd !== `${this.endDate}|${this.endTime}`) {
        this.loadStock(this.currentCode, this.currentName);
      }
    }

    private updateEndTimeVisibility() {
      const isMin = this.timeframe.startsWith('min:');
      const dateField = this.shadowRoot?.querySelector('#sim-end-date-field') as HTMLElement;
      const dtField = this.shadowRoot?.querySelector('#sim-end-datetime-field') as HTMLElement;
      if (dateField) dateField.style.display = isMin ? 'none' : '';
      if (dtField) dtField.style.display = isMin ? '' : 'none';
    }

    private applySimRange(start: number, end: number, focus: boolean) {
      const n = this.chartCandles.length;
      if (!n) return;
      const e = Math.max(0, Math.min(Math.floor(end), n - 1));
      const s = Math.max(0, Math.min(Math.floor(start), e));
      if (s === this.rangeStart && e === this.rangeEnd) return;
      this.rangeStart = s;
      this.rangeEnd = e;
      this.updateRangeLabels();
      this.refreshInitAvg();
      this.refreshRealized();
      this.syncUrlWithoutReload();
      if (focus) this.focusSimRangeOnChart();
    }

    @event('#sim-range', 'input')
    onSimRangeInput(e: Event) {
      const v = (e.target as any)?.value;
      if (!v || typeof v !== 'object') return;
      const s = Number(v.start);
      const ed = Number(v.end);
      if (!Number.isFinite(s) || !Number.isFinite(ed)) return;
      this.applySimRange(s, ed, false);
    }

    @event('#sim-range', 'change')
    onSimRangeChange(e: Event) {
      const v = (e.target as any)?.value;
      if (!v || typeof v !== 'object') return;
      const s = Number(v.start);
      const ed = Number(v.end);
      if (!Number.isFinite(s) || !Number.isFinite(ed)) return;
      this.applySimRange(s, ed, true);
    }

    private buildTicksHtml(candles: SimCandle[], markers?: Map<number, string>): string {
      return candles.map((c, i) => {
        const m = markers?.get(i) ?? '';
        return `<candle date="${c.date}" open="${c.open}" high="${c.high}" low="${c.low}" close="${c.close}" volume="${c.volume}">${m}</candle>`;
      }).join('');
    }

    /** 전 구간 매매내역 병합 — 사유 앞에 구간 라벨링, 절대 인덱스순 정렬.
     *  리플레이 중이면 기록된 리플레이 저널 그대로 (시간순 append라 정렬済) */
    private mergedTrades(): { absIdx: number; trade: SimTrade }[] {
      if (this.replay) return this.replayLog;
      const out: { absIdx: number; trade: SimTrade }[] = [];
      for (const z of this.tradeRanges) {
        if (!z.sim) continue;
        for (const t of z.sim.trades) {
          const abs = z.start + t.barIdx;
          if (abs < 0 || abs >= this.chartCandles.length) continue;
          out.push({ absIdx: abs, trade: { ...t, reason: `[${z.label}] ${t.reason}` } });
        }
      }
      return out.sort((a, b) => a.absIdx - b.absIdx);
    }

    /** 거래내역 모달 렌더 (전 구간 병합, 절대 시간순) */
    private renderHistoryList() {
      const body = this.shadowRoot?.querySelector('#sim-history-body') as HTMLElement;
      const count = this.shadowRoot?.querySelector('#sim-history-count') as HTMLElement;
      if (!body) return;
      const rows = this.mergedTrades();
      if (count) count.textContent = rows.length ? `총 ${rows.length}건` : '';
      const fmt0 = (n: number) => Math.round(n).toLocaleString();
      // 선택구간 첫~끝 종가 단순보유 (팝업 상단 비교용 — 내역 없어도 표시)
      let holdHeader = '';
      {
        const [hzs, hze] = this.simRange();
        const f = this.chartCandles[hzs]?.close, l = this.chartCandles[hze]?.close;
        if (f && l) {
          const r = ((l - f) / f) * 100;
          const hc = r > 0 ? '#dc2626' : r < 0 ? '#2563eb' : '#64748b';
          holdHeader = `<div style="padding:8px 14px;font-size:11px;color:#64748b;display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid #f1f5f9;background:#fffbeb"><span>단순보유 <b style="color:${hc}">${r >= 0 ? '+' : ''}${r.toFixed(2)}%</b> (${fmt0(f)}원 → ${fmt0(l)}원)</span><span style="margin-left:auto;color:#94a3b8">선택구간 첫~끝 종가 기준</span></div>`;
        }
      }
      if (!rows.length) {
        body.innerHTML = `${holdHeader}<div style="padding:24px;text-align:center;color:#94a3b8;font-size:12px">거래내역이 없습니다. 구간 최적화를 실행하세요.</div>`;
        return;
      }
      const fmt = (n: number) => Math.round(n).toLocaleString();
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const badge = (t: SimTrade): [string, string] => {
        if (t.action === 'buy') return ['매수', '#3b82f6'];
        if (t.action === 'sell') return ['매도', '#ef4444'];
        if (t.action === 'exit') return [t.label || '청산', '#8b5cf6'];
        return ['실패', '#94a3b8'];
      };
      const doneRows = rows.filter(({ trade: t }) => t.action === 'buy' || t.action === 'sell' || t.action === 'exit');
      const failRows = rows.filter(({ trade: t }) => t.action === 'buy-fail' || t.action === 'sell-fail').length;
      const buyCnt = rows.filter(({ trade: t }) => t.action === 'buy').length;
      const sellCnt = rows.filter(({ trade: t }) => t.action === 'sell').length;
      const exitCnt = rows.filter(({ trade: t }) => t.action === 'exit').length;
      const totalFee = rows.reduce((s, { trade: t }) => s + (t.fee || 0), 0);
      const liveEval = this.live
        ? `<span>최종 평가 <b>${fmt0(this.live.eval)}원</b> <span style="color:#94a3b8">(보유 ${Math.floor(this.live.shares).toLocaleString()}주 ${fmt0(this.live.eval - this.live.cash)}원 + 현금 ${fmt0(this.live.cash)}원)</span></span>`
        : `<span>최종 평가 <b>-</b></span>`;
      const summaryHtml = `<div class="hist-summary">`
        + `<div class="hist-stat"><div class="k">총 체결</div><div class="v">${doneRows.length}건${failRows ? `<div class="s">실패 ${failRows}건</div>` : ''}</div></div>`
        + `<div class="hist-stat"><div class="k">매수</div><div class="v" style="color:#2563eb">${buyCnt}건</div></div>`
        + `<div class="hist-stat"><div class="k">매도</div><div class="v" style="color:#ef4444">${sellCnt}건</div>${exitCnt ? `<div class="s">(청산 ${exitCnt}건)</div>` : ''}</div>`
        + `<div class="hist-stat"><div class="k">수수료</div><div class="v" style="font-size:12px">${fmt0(totalFee)}원</div></div>`
        + `</div><div class="hist-sub">${liveEval}</div>`;
      const startEq = this.startEquity();
      body.innerHTML = `${holdHeader}${summaryHtml}<table class="hist-table">
        <thead><tr class="hgroup"><th colspan="10">매매 시점</th><th colspan="6" class="hold">이후 보유상태</th></tr><tr><th>#</th><th>날짜</th><th>구간</th><th>구분</th><th>시세</th><th>수량</th><th>금액</th><th>수수료</th><th>조건상세</th><th>사유</th><th class="hold">수익률</th><th class="hold">보유주식</th><th class="hold">평균가격</th><th class="hold">보유주식평가금액</th><th class="hold">현금</th><th class="hold">최종평가금액</th></tr></thead>
        <tbody>${rows.map(({ trade: t }, i) => {
          const [bt, bc] = badge(t);
          const m = /^\[(.+?)\]/.exec(t.reason);
          const range = m ? m[1] : '-';
          const reason = t.reason;
          const pr = t.profitRate;
          const prStr = pr == null ? '-' : `${pr >= 0 ? '+' : ''}${pr.toFixed(2)}%`;
          const prColor = pr == null ? '#94a3b8' : pr > 0 ? '#dc2626' : pr < 0 ? '#2563eb' : '#64748b';
          const conds = [...(t.conds ?? []), ...(t.condDetail ?? [])].filter(Boolean);
          const finalEval = t.cashAfter + t.holdingValue;
          const finalRate = startEq ? ((finalEval - startEq) / startEq) * 100 : 0;
          const finalColor = finalRate > 0 ? '#dc2626' : finalRate < 0 ? '#2563eb' : '#64748b';
          return `<tr class="hrow"><td class="num">${i + 1}</td><td>${esc(this.chartCandles[Math.max(0, Math.min(t.barIdx, this.chartCandles.length - 1))]?.date ?? '')}</td><td>${esc(range)}</td><td><span class="hist-badge" style="background:${bc}">${bt}</span></td><td class="num">${fmt(t.price)}원</td><td class="num">${Math.floor(t.sharesDelta).toLocaleString()}주</td><td class="num">${fmt(t.amount)}원</td><td class="num">${fmt(t.fee || 0)}원</td><td class="reason">${conds.map(c => esc(c)).join('<br>') || '-'}</td><td class="reason">${esc(reason)}</td><td class="num hold" style="color:${prColor};font-weight:700">${prStr}</td><td class="num hold">${Math.floor(t.sharesAfter).toLocaleString()}주</td><td class="num hold">${t.sharesAfter > 0 ? fmt(t.avgPrice) + '원' : '-'}</td><td class="num hold">${fmt(t.holdingValue)}원</td><td class="num hold">${fmt(t.cashAfter)}원</td><td class="num hold" style="color:${finalColor};font-weight:700">${fmt(finalEval)}원 (${finalRate >= 0 ? '+' : ''}${finalRate.toFixed(2)}%)</td></tr>`;
        }).join('')}</tbody></table>`;
    }

    @event('#sim-history-btn', 'click')
    onHistoryOpen() {
      this.renderHistoryList();
      const modal = this.shadowRoot?.querySelector('#sim-history-modal') as HTMLElement;
      modal?.classList.add('show');
    }

    @event('#sim-history-close', 'click')
    onHistoryClose() {
      const modal = this.shadowRoot?.querySelector('#sim-history-modal') as HTMLElement;
      modal?.classList.remove('show');
    }

    @event('#sim-history-modal', 'click')
    onHistoryBackdrop(e: Event) {
      const modal = e.currentTarget as HTMLElement;
      if (e.target === modal) modal.classList.remove('show');
    }

    @eventDocument('keydown')
    onHistoryEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        const modal = this.shadowRoot?.querySelector('#sim-history-modal') as HTMLElement;
        modal?.classList.remove('show');
      }
    }
    private allSimMarkers(): Map<number, string> {
      const out = new Map<number, string>();
      for (const { absIdx, trade: t } of this.mergedTrades()) {
        let label = 'S', color = '#ef4444', pos = 'candle-bottom';
        if (t.action === 'buy') { label = 'B'; color = '#3b82f6'; pos = 'candle-top'; }
        else if (t.action === 'exit') { label = t.label || '청'; color = '#8b5cf6'; pos = 'candle-top'; }
        else if (t.action === 'buy-fail' || t.action === 'sell-fail') { label = '✕'; color = '#94a3b8'; pos = 'candle-bottom'; }
        out.set(absIdx, (out.get(absIdx) ?? '') + `<tooltip position="${pos}" label="${label}" fill-color="${color}" label-color="#fff"></tooltip>`);
      }
      return out;
    }

    /** 선택 구간 [start, end] */
    private simRange(): [number, number] {
      const n = this.chartCandles.length;
      if (!n) return [0, -1];
      const end = this.rangeEnd < 0 ? n - 1 : Math.min(this.rangeEnd, n - 1);
      return [Math.max(0, Math.min(this.rangeStart, end)), end];
    }

    private getActiveCandles(): SimCandle[] {
      if (!this.chartCandles.length) return [];
      const end = this.rangeEnd < 0 ? this.chartCandles.length - 1 : Math.min(this.rangeEnd, this.chartCandles.length - 1);
      const start = Math.max(0, Math.min(this.rangeStart, end));
      return this.chartCandles.slice(start, end + 1);
    }

    /** 캔들 로드 후 슬라이더 범위 재설정 (reset=true면 전체 선택) */
    private syncRangeSliderBounds(reset = false) {
      const n = this.chartCandles.length;
      const slider = this.shadowRoot?.querySelector('#sim-range') as any;
      if (!n) return;
      if (reset || this.rangeEnd < 0) { this.rangeStart = 0; this.rangeEnd = n - 1; }
      this.rangeStart = Math.max(0, Math.min(this.rangeStart, n - 1));
      this.rangeEnd = Math.max(this.rangeStart, Math.min(this.rangeEnd < 0 ? n - 1 : this.rangeEnd, n - 1));
      if (slider) {
        slider.setAttribute('min', '0');
        slider.setAttribute('max', String(n - 1));
        slider.setAttribute('step', '1');
        if (typeof slider.setValues === 'function') {
          slider.setValues({ start: this.rangeStart, end: this.rangeEnd });
        }
      }
      this.updateRangeLabels();
    }

    private updateRangeLabels() {
      const n = this.chartCandles.length;
      const sEl = this.shadowRoot?.querySelector('#sim-range-start') as HTMLElement | null;
      const eEl = this.shadowRoot?.querySelector('#sim-range-end') as HTMLElement | null;
      const cEl = this.shadowRoot?.querySelector('#sim-range-count') as HTMLElement | null;
      const hEl = this.shadowRoot?.querySelector('#sim-range-hold') as HTMLElement | null;
      if (!n) {
        if (sEl) sEl.textContent = '-';
        if (eEl) eEl.textContent = '-';
        if (cEl) cEl.textContent = '0개';
        if (hEl) hEl.textContent = '-';
        return;
      }
      const end = this.rangeEnd < 0 ? n - 1 : Math.min(this.rangeEnd, n - 1);
      const start = Math.max(0, Math.min(this.rangeStart, end));
      if (sEl) sEl.textContent = this.chartCandles[start]?.date ?? '-';
      if (eEl) eEl.textContent = this.chartCandles[end]?.date ?? '-';
      if (cEl) cEl.textContent = `${end - start + 1}개`;
      if (hEl) {
        const f = this.chartCandles[start]?.close, l = this.chartCandles[end]?.close;
        if (f && l) {
          const r = ((l - f) / f) * 100;
          hEl.textContent = `${r >= 0 ? '+' : ''}${r.toFixed(2)}%`;
          hEl.style.color = r > 0 ? '#dc2626' : r < 0 ? '#2563eb' : '#94a3b8';
        } else {
          hEl.textContent = '-';
        }
      }
      const sliderEl = this.shadowRoot?.querySelector('#sim-range') as any;
      if (sliderEl && typeof sliderEl.setValues === 'function') {
        const cur = sliderEl.value;
        if (!cur || cur.start !== start || cur.end !== end) {
          sliderEl.setValues({ start, end });
        }
      }
    }

    /** 차트는 불러온 캔들 전체 + 구간 rect 오버레이 */
    private buildChartHtml(): string {
      const n = this.chartCandles.length;
      if (!n) return '';
      const end = this.rangeEnd < 0 ? n - 1 : Math.min(this.rangeEnd, n - 1);
      const start = Math.max(0, Math.min(this.rangeStart, end));
      const ticksHtml = this.buildTicksHtml(this.chartCandles, this.allSimMarkers());
      const sDate = this.chartCandles[start]?.date ?? '';
      const eDate = this.chartCandles[end]?.date ?? '';
      const liveRect = (start > 0 || end < n - 1) && sDate && eDate
        ? `<rect date-start="${sDate}" date-end="${eDate}" fill="rgba(124,58,237,0.08)" stroke="#7c3aed" stroke-width="1" target="all"></rect>`
        : '';
      // 구간별 선택 구간 rect (구간 색상 + 라벨)
      // 리플레이 중에는 작업 구간(replayRanges), 평소에는 사용자 구간(tradeRanges)
      const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const rectSrc = this.replay ? this.replayRanges : this.tradeRanges;
      const rangeRects = rectSrc.map(z => {
        const zs = Math.max(0, Math.min(z.start, n - 1));
        const ze = Math.max(zs, Math.min(z.end, n - 1));
        const zsDate = this.chartCandles[zs]?.date ?? '';
        const zeDate = this.chartCandles[ze]?.date ?? '';
        if (!zsDate || !zeDate) return '';
        const un = !z.confirmed;
        if (un) return `<rect date-start="${zsDate}" date-end="${zeDate}" fill="#94a3b80D" stroke="#94a3b8" stroke-width="1" stroke-dasharray="5,5" label="${escAttr(z.label)} (잠정)" color="#64748b" target="all"></rect>`;
        return `<rect date-start="${zsDate}" date-end="${zeDate}" fill="${z.color}1F" stroke="${z.color}" stroke-width="1" label="${escAttr(z.label)}" color="${z.color}" target="all"></rect>`;
      }).join('');
      return `<volume></volume><macd></macd><rsi></rsi><obv></obv>` + ticksHtml + liveRect + rangeRects;
    }

    /** 차트 뷰를 선택 구간으로 포커싱 (슬라이더 조작 시에만 호출) */
    private focusSimRangeOnChart() {
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as any;
      const n = this.chartCandles.length;
      if (!chartEl || !n || typeof chartEl.setView !== 'function') return;
      const end = this.rangeEnd < 0 ? n - 1 : Math.min(this.rangeEnd, n - 1);
      const start = Math.max(0, Math.min(this.rangeStart, end));
      if (start > 0 || end < n - 1) chartEl.setView(start, end);
    }

    private syncMasToChart() {
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as HTMLElement;
      if (!chartEl || !this.chartCandles.length) return;
      chartEl.innerHTML = this.buildChartHtml();
      this.updateResultDisplay();
    }

    /** 리플레이 정지 (표시 스냅샷은 유지, 설정 변경 시 일반 뷰로 복귀) */
    private stopReplay() {
      if (!this.replay) return;
      this.replay.running = false;
      this.replay = null;
      this.replayLog = [];
      this.paintReplayBtn();
    }

    /** 전 구간 시간순 실거래 체인: best 있으면 실행, 없으면 보유 통과. 상단 카드+탭+스트립+차트 갱신 */
    private refreshRealized(skipBody = false) {
      this.stopReplay();
      const n = this.chartCandles.length;
      const ranges = [...this.tradeRanges].sort((a, b) => a.start - b.start);
      if (!n || !ranges.length) {
        for (const z of this.tradeRanges) { z.sim = null; z.localRate = 0; z.localProfit = 0; }
        this.live = null;
        this.updateResultDisplay();
        this.renderRangeTabs();
        if (skipBody) this.updateSimStrip(this.activeRangeId);
        else this.renderRangeBody();
        this.syncMasToChart();
        return;
      }
      let cash = this.initialCapital;
      let shares = Math.max(0, Math.floor(this.initialShares));
      let avg = this.initialAvgPrice;
      const prevActions: TradeAction[] = [];
      const startEquity = this.startEquity();
      let fee = 0, count = 0, fails = 0;
      for (const z of ranges) {
        const own = this.chartCandles.slice(z.start, z.end + 1);
        // best 없으면 실행 없이 그대로 통과 (sim 없음 → 수익률 미표시)
        if (!z.best || !own.length) { z.sim = null; z.localRate = 0; z.localProfit = 0; continue; }
        const rangeStartEq = cash + shares * own[0].close;
        const sim = TradingSimulator.simulate(own, z.best, {
          initialCapital: cash, feePercent: this.feePercent,
          initialShares: shares, initialAvgPrice: avg, requireAll: true,
          prevActions: [...prevActions],
        });
        z.sim = sim;
        for (const t of sim.trades) prevActions.push(t.action);
        const rangeEndEq = sim.cash + Math.max(0, Math.floor(sim.shares)) * own[own.length - 1].close;
        z.localProfit = rangeEndEq - rangeStartEq;
        z.localRate = rangeStartEq ? (z.localProfit / rangeStartEq) * 100 : 0;
        cash = sim.cash;
        shares = Math.max(0, Math.floor(sim.shares));
        const lastHeld = sim.trades.length ? [...sim.trades].reverse().find(t => t.sharesAfter > 0) : undefined;
        avg = shares > 0 ? (lastHeld ? lastHeld.avgPrice : avg) : 0;
        fee += sim.trades.reduce((s, t) => s + (t.fee || 0), 0);
        for (const t of sim.trades) {
          if (t.action === 'buy-fail' || t.action === 'sell-fail') fails++;
          else if (t.action === 'buy' || t.action === 'sell' || t.action === 'exit') count++;
        }
      }
      const evalAmt = cash + shares * this.chartCandles[n - 1].close;
      const profit = evalAmt - startEquity;
      this.live = { eval: evalAmt, cash, shares, profit, rate: startEquity ? (profit / startEquity) * 100 : 0, fee, count, fails };
      this.updateResultDisplay();
      this.renderRangeTabs();
      if (skipBody) this.updateSimStrip(this.activeRangeId);
      else this.renderRangeBody();
      this.syncMasToChart();
    }

    /** 결과 표시 — 실거래 체인(live) 우선, 없으면 보유 현황 */
    private updateResultDisplay() {
      const set = (id: string, text: string, color?: string) => {
        const el = this.shadowRoot?.querySelector(id) as HTMLElement;
        if (!el) return;
        el.textContent = text;
        if (color) el.style.color = color;
      };
      const fmt = (n: number) => `${Math.round(n).toLocaleString()}원`;
      const fmtRate = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
      const hi = (n: number) => n > 0 ? '#dc2626' : n < 0 ? '#2563eb' : '#64748b';
      // 선택구간 단순보유 (선택 첫~끝 종가, 시작 자기자본 기준) — live 유무 무관 공통
      const holdAllEl = this.shadowRoot?.querySelector('#sim-hold-all') as HTMLElement;
      if (holdAllEl) {
        const [hzs, hze] = this.simRange();
        const f = this.chartCandles[hzs]?.close, l = this.chartCandles[hze]?.close;
        if (f && l) {
          const r = ((l - f) / f) * 100;
          holdAllEl.textContent = `${fmtRate(r)} (${fmt(this.startEquity() * (l / f))})`;
          holdAllEl.style.color = hi(r);
        } else {
          holdAllEl.textContent = '-';
        }
      }
      if (this.live) {
        const L = this.live;
        set('#sim-shares', `${L.shares.toLocaleString()}주`);
        set('#sim-eval', fmt(L.eval));
        set('#sim-rate', fmtRate(L.rate), hi(L.rate));
        set('#sim-cash', fmt(L.cash));
        set('#sim-holding', fmt(L.eval - L.cash));
        set('#sim-profit', `${L.profit >= 0 ? '+' : ''}${Math.round(L.profit).toLocaleString()}원`, hi(L.profit));
        set('#sim-fee-total', fmt(L.fee));
        set('#sim-trade-count', `${L.count}건`);
        return;
      }
      const lastCandle = this.chartCandles.length ? this.chartCandles[this.chartCandles.length - 1].close : 0;
      const last = this.lastStockPrice?.close ?? lastCandle;
      if (!last) {
        set('#sim-shares', `${Math.max(0, Math.floor(this.initialShares)).toLocaleString()}주`);
        set('#sim-eval', '-'); set('#sim-rate', '-');
        set('#sim-cash', fmt(this.initialCapital));
        set('#sim-holding', '-'); set('#sim-profit', '-');
        set('#sim-fee-total', '0원'); set('#sim-trade-count', '0건');
        return;
      }
      const shares = Math.max(0, Math.floor(this.initialShares));
      const holding = shares * last;
      const cash = this.initialCapital;
      const evalAmt = cash + holding;
      const profit = evalAmt - this.startEquity();
      const rate = this.startEquity() ? (profit / this.startEquity()) * 100 : 0;
      set('#sim-shares', `${shares.toLocaleString()}주`);
      set('#sim-eval', fmt(evalAmt));
      set('#sim-rate', fmtRate(rate), hi(rate));
      set('#sim-cash', fmt(cash));
      set('#sim-holding', fmt(holding));
      set('#sim-profit', `${profit >= 0 ? '+' : ''}${Math.round(profit).toLocaleString()}원`, hi(profit));
      set('#sim-fee-total', '0원');
      set('#sim-trade-count', '0건');
    }

    private syncConfigFromForm() {
      const capEl = this.shadowRoot?.querySelector('#sim-capital') as HTMLInputElement;
      const cntEl = this.shadowRoot?.querySelector('#sim-candle-count') as HTMLInputElement;
      const tfEl = this.shadowRoot?.querySelector('#sim-timeframe') as HTMLSelectElement;
      if (capEl) {
        const v = Number(capEl.value.replace(/,/g, ''));
        if (Number.isFinite(v)) this.initialCapital = Math.max(10000, Math.floor(v));
      }
      const shEl = this.shadowRoot?.querySelector('#sim-init-shares') as HTMLInputElement;
      if (shEl) {
        const v = Number(shEl.value.replace(/,/g, ''));
        if (Number.isFinite(v)) this.initialShares = Math.max(0, Math.floor(v));
      }
      const feeEl = this.shadowRoot?.querySelector('#sim-fee') as HTMLInputElement;
      if (feeEl) { const v = Number(feeEl.value); if (Number.isFinite(v) && v >= 0 && v <= 1) this.feePercent = v; }
      if (cntEl) {
        const v = Number(cntEl.value);
        if (Number.isFinite(v)) this.candleCount = Math.max(30, Math.min(1000, Math.floor(v)));
      }
      if (tfEl && tfEl.value) this.timeframe = tfEl.value as TossChartTimeframe;
      const isMinTf = this.timeframe.startsWith('min:');
      const endDateEl = this.shadowRoot?.querySelector('#sim-end-date') as HTMLInputElement;
      const endDtEl = this.shadowRoot?.querySelector('#sim-end-datetime') as HTMLInputElement;
      const rawEnd = isMinTf ? (endDtEl?.value || '').slice(0, 16) : (endDateEl?.value || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(rawEnd)) {
        const probe = new Date(rawEnd.length <= 10 ? `${rawEnd}T23:59:00` : `${rawEnd}:00`);
        if (Number.isFinite(probe.getTime()) && probe.getTime() <= Date.now()) {
          this.endDate = rawEnd.slice(0, 10);
          this.endTime = rawEnd.length > 10 ? rawEnd.slice(11, 16) : '';
        } else {
          this.endDate = ''; this.endTime = '';
        }
      } else {
        this.endDate = ''; this.endTime = '';
      }
    }

    @event('#sim-reload-btn', 'click', { preventDefault: true, stopPropagation: true })
    onReloadCandles() {
      this.syncConfigFromForm();
      this.syncSimParamsToUrl();
      this.loadStock(this.currentCode, this.currentName);
    }

    @event('#sim-candle-form', 'submit', { preventDefault: true, stopPropagation: true })
    onCandleFormSubmit() {
      this.syncConfigFromForm();
      this.syncSimParamsToUrl();
      this.loadStock(this.currentCode, this.currentName);
    }

    @event('#sim-share-fab', 'click')
    async onShareFab() {
      const url = window.location.href;
      const title = `주식 트레이딩 · ${this.currentName}`;
      const text = `[${this.currentName}]의 종목 트레이딩을 확인해보세요!`;
      const fab = this.shadowRoot?.querySelector('#sim-share-fab') as HTMLElement;
      const flash = () => {
        if (!fab) return;
        fab.textContent = '✓';
        fab.classList.add('copied');
        setTimeout(() => { if (fab.textContent === '✓') { fab.textContent = '🔗'; fab.classList.remove('copied'); } }, 1500);
      };
      try {
        if ((navigator as any).share) {
          await (navigator as any).share({ title, text, url });
        } else {
          await navigator.clipboard?.writeText(url);
          flash();
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          try { await navigator.clipboard?.writeText(url); flash(); } catch {}
        }
      }
    }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display: block; min-height: 100vh; background: #f0f2f5; font-family: var(--font-family, sans-serif); }
          .header { display:flex; align-items:center; gap:12px; padding:16px 24px; background:linear-gradient(135deg,#f59e0b 0%,#f97316 60%,#fb923c 100%); color:white; }
          .header-back { background:rgba(255,255,255,0.2); border:none; color:white; width:40px; height:40px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:20px; }
          .header-back:hover { background:rgba(255,255,255,0.3); }
          .header-title { font-size:20px; font-weight:700; flex:1; }
          .header-hits { height:20px; border-radius:4px; opacity:0.9; margin-left:auto; }
          .content { padding:20px; }
          @media(max-width:600px){ .header{padding:14px 16px} .header-title{font-size:18px} .content{padding:12px} }
          .card{background:white;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);overflow:hidden}
          .card-header{background:var(--accent);color:white;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;border-radius:12px 12px 0 0}
          .card-title{font-size:15px;font-weight:700}
          .search-wrap{display:flex;gap:6px;align-items:center;position:relative;min-width:0;flex:1}
          .search-icon{font-size:12px;opacity:.6;color:#c7d2fe}
          .search-wrap input{flex:1;min-width:0;height:32px;padding:0 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.4);outline:none;font-size:12px;background:#fff;box-sizing:border-box}
          .search-wrap input:focus{border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,0.25)}
          .search-wrap button,.search-clear{height:32px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.35);background:rgba(255,255,255,0.2);color:#fff;font-weight:600;cursor:pointer;font-size:12px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center}
          .search-wrap button:hover,.search-clear:hover{background:rgba(255,255,255,0.35)}
          .search-results{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);overflow:hidden;display:none;z-index:10;color:#334155}
          .search-results.show{display:block}
          .search-item{padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f1f5f9;color:#334155}
          .search-item:hover{background:#f8fafc}
          .chart-wrap{height:340px;padding:4px 12px 8px}
          @media(max-width:600px){ .chart-wrap{height:280px} }
          stock-chart{width:100%;height:100%;display:block}
          .config-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
          @media(max-width:900px){ .config-grid{grid-template-columns:1fr 1fr} }
          @media(max-width:600px){ .config-grid{grid-template-columns:1fr} }
          .config-field{display:flex;flex-direction:column;gap:4px}
          .config-field label{font-size:11px;font-weight:700;color:#64748b}
          .config-field input,.config-field select{height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff}
          .config-field input:focus,.config-field select:focus{border-color:#f59e0b}
          #stock-search {font-size: 16px !important;}
          .share-fab{position:fixed;bottom:24px;right:24px;width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff;border:none;box-shadow:0 6px 20px rgba(245,158,11,0.45);cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:900;transition:transform .15s ease,box-shadow .15s ease}
          .share-fab:hover{transform:scale(1.08);box-shadow:0 8px 24px rgba(245,158,11,0.55)}
          .share-fab.copied{background:#10b981;box-shadow:0 6px 20px rgba(16,185,129,0.45)}
          .result-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:12px 14px;background:#f8fafc;border-top:1px solid #f1f5f9}
          .result-item{background:white;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;text-align:center}
          .result-label{font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.02em}
          .result-value{margin-top:4px;font-size:16px;font-weight:800;color:#1e293b;line-height:1}
          .result-sub{display:flex;gap:10px;flex-wrap:wrap;padding:8px 14px 12px;background:#f8fafc;border-top:1px solid #f1f5f9;font-size:11px;color:#64748b}
          .result-sub b{color:#334155}
          @media(max-width:600px){ .result-value{font-size:15px} }
          .section-box{border:1px solid #e2e8f0;background:#f8fafc;border-radius:12px;padding:12px}
          .section-box.ma{border-color:#fde68a;background:#fffdf5}
          .section-box.exit{border-color:#ede9fe;background:#faf9ff}
          .section-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
          .section-title{font-size:12px;font-weight:800}
          .section-title.ma{color:#92400e}
          .section-title.exit{color:#5b21b6}
          .section-desc{font-size:10px;color:#94a3b8;font-weight:500}
          .empty-state{padding:12px;color:#94a3b8;font-size:11px;border:1px dashed #e2e8f0;border-radius:10px;background:#fff;text-align:center}
          .head-btn{height:32px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.35);background:rgba(255,255,255,0.2);color:#fff;font-weight:700;font-size:12px;cursor:pointer;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;line-height:1;white-space:nowrap}
          .head-btn:hover{background:rgba(255,255,255,0.35)}
          .range-tabs{display:flex;gap:6px;overflow-x:auto;padding:2px;scrollbar-width:thin;align-items:center}
          .range-tab{flex:0 0 auto;height:32px;padding:0 14px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;color:#64748b;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
          .range-tab:hover{border-color:#f59e0b;color:#d97706}
          .range-tab.active{background:#f59e0b;border-color:#f59e0b;color:#fff}
          .range-body-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
          .range-delete{margin-left:auto;height:28px;padding:0 10px;border-radius:8px;border:1px solid #fecaca;background:#fff;color:#f87171;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap}
          .range-delete:hover{background:#fef2f2;color:#ef4444}
          .range-name-input{font-size:13px;font-weight:800;color:#1e293b;border:1px solid transparent;border-radius:8px;padding:4px 8px;background:transparent;outline:none;min-width:0;flex:1;max-width:220px}
          .range-name-input:hover{border-color:#e2e8f0;background:#fff}
          .range-name-input:focus{border-color:#f59e0b;background:#fff}
          .trade-range-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
          .trade-range-row range-slider{flex:1;min-width:0}
          .trade-range-lab{font-size:10px;font-weight:700;color:#64748b;white-space:nowrap;min-width:40px}
          .trade-range-lab.end{text-align:right}
          .range-color-input{width:30px;height:30px;padding:0;border:none;border-radius:50%;background:none;cursor:pointer;flex-shrink:0}
          .range-color-input::-webkit-color-swatch-wrapper{padding:0}
          .range-color-input::-webkit-color-swatch{border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #e2e8f0}
          .range-color-input::-moz-color-swatch{border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #e2e8f0}
          .ref-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
          .ref-lab{font-size:11px;font-weight:700;color:#64748b;white-space:nowrap}
          .ref-toggles{display:flex;gap:6px;overflow-x:auto;flex:1;min-width:0;padding:2px;scrollbar-width:thin}
          .ref-toggle{flex:0 0 auto;height:32px;padding:0 12px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;color:#64748b;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap}
          .ref-toggle:hover{border-color:#f59e0b;color:#d97706}
          .ref-toggle.on{background:#f59e0b;border-color:#f59e0b;color:#fff}
          .ref-toggle.special{border-style:dashed;color:#94a3b8}
          .ref-toggle.special.on{background:#334155;border-color:#334155;color:#fff}
          .ref-info{font-size:10px;font-weight:700;color:#64748b;background:#f1f5f9;border-radius:999px;padding:3px 10px;white-space:nowrap}
          .opt-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
          .opt-item{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#334155;white-space:nowrap}
          .opt-item select{height:32px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;color:#334155;font-size:11px;font-weight:700;padding:0 10px;cursor:pointer;outline:none}
          .opt-item input{width:64px;height:32px;border-radius:999px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;padding:0 8px;outline:none;text-align:center}
          .opt-btn{margin-left:auto;height:32px;padding:0 14px;border-radius:999px;border:1px solid #f59e0b;background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(245,158,11,0.3);white-space:nowrap}
          .opt-btn:disabled{opacity:.6;cursor:wait}
          .opt-all-btn{flex-shrink:0;align-self:center;height:32px;padding:0 16px;border-radius:10px;border:none;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(124,58,237,0.35);white-space:nowrap;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;line-height:1}
          .opt-all-btn:hover{filter:brightness(1.08)}
          .opt-all-btn:disabled{opacity:.6;cursor:wait}
          .sim-strip{font-size:11px;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px}
          .sim-strip b{color:#1e293b}
          .ma-list{display:flex;flex-direction:column;gap:12px;margin-top:10px}
          .ma-row{display:flex;flex-direction:column;gap:10px;background:#fffbeb;border:1px solid #fde68a;border-radius:16px;padding:14px;box-shadow:0 1px 4px rgba(180,120,20,0.06)}
          .ma-row-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
          .ma-identity{display:flex;align-items:center;gap:8px}
          .ma-color{position:relative;width:16px;height:16px;border-radius:50%;flex-shrink:0;border:2px solid #fff;box-shadow:0 0 0 2px #fbbf24;cursor:pointer;overflow:hidden}
          .ma-color-input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:none;padding:0}
          .ma-period{width:58px;height:32px;text-align:center;font-weight:800;font-size:14px;border-radius:8px;border:1px solid #f59e0b;background:#fff;outline:none}
          .ma-period:focus{border-color:#d97706;box-shadow:0 0 0 3px #fef3c7}
          .ma-unit{font-size:12px;color:#92400e;font-weight:800}
          .ma-remove{width:32px;height:32px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#94a3b8;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;transition:all .15s}
          .ma-remove:hover{background:#fef2f2;color:#ef4444;border-color:#fecaca}
          .ma-row-actions{display:flex;gap:6px;align-items:center}
          .add-signal-btn{height:32px;padding:0 10px;border:1px solid #fcd34d;background:#fff;color:#b45309;border-radius:8px;cursor:pointer;font-size:11px;font-weight:800;white-space:nowrap}
          .add-signal-btn:hover{background:#fef3c7}
          .ma-row-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
          .ma-row-fields.is-single{grid-template-columns:1fr}
          .ma-field{display:flex;flex-direction:column;gap:8px;background:#fff;border:1px solid #fde68a;border-radius:12px;padding:10px}
          .ma-field-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
          .ma-action-box{flex:1;display:flex;align-items:center;gap:6px;min-width:0}
          .ma-signal,.ma-action{height:32px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;font-weight:800;background:#f8fafc;padding:0 6px;color:#334155}
          .ma-signal[data-v="golden"]{color:#b45309;border-color:#fcd34d;background:#fffbeb}
          .ma-signal[data-v="dead"]{color:#b91c1c;border-color:#fecaca;background:#fef2f2}
          .ma-action[data-v="sell"]{color:#dc2626}
          .ma-action[data-v="buy"]{color:#2563eb}
          .ma-pct{width:52px;height:32px;border-radius:8px;border:1px solid #e2e8f0;font-size:13px;font-weight:800;text-align:center;background:#fff}
          .ma-action-box .pct{font-size:11px;color:#92400e;font-weight:800}
          .signal-remove{border:1px solid #fecaca;background:#fff;color:#fca5a5;border-radius:8px;min-width:28px;height:28px;font-size:11px;font-weight:800;cursor:pointer;flex-shrink:0}
          .signal-remove:hover{background:#fef2f2;color:#ef4444;border-color:#fca5a5}
          .ma-field-opts{display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:start}
          .ma-mini-opt{display:flex;align-items:center;gap:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px 8px;font-size:11px;font-weight:600;color:#475569;min-width:0;flex-wrap:wrap}
          .ma-mini-opt input{width:40px;height:32px;text-align:center;border-radius:8px;border:1px solid #e2e8f0;font-size:13px;font-weight:700;background:#fff}
          .ma-mini-opt select{flex:1;min-width:60px;height:32px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:600;background:#fff;padding:0 4px;color:#334155}
          .ma-condtrade-val,.ma-condcandle-val,.ma-condma-val{width:54px !important}
          /* 실현(청산) — 바이올렛 테마로 MA와 명확히 구분 */
          #exit-list{display:flex;flex-direction:column;gap:10px}
          .ma-row.exit-row{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:16px;padding:14px;box-shadow:0 1px 4px rgba(109,88,246,0.08)}
          .exit-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
          .exit-title{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:#5b21b6}
          .exit-badge{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#7c3aed;color:#fff;font-size:10px;font-weight:800}
          .exit-remove:hover{background:#ede9fe !important;color:#7c3aed !important;border-color:#c4b5fd !important}
          .exit-main{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px;background:#fff;border:1px solid #ede9fe;border-radius:10px;padding:8px}
          .exit-main .lbl{font-size:11px;font-weight:800;color:#6d28d9}
          .exit-basis{height:32px;border-radius:8px;border:1px solid #c4b5fd;font-size:11px;font-weight:800;background:#ede9fe;color:#5b21b6;padding:0 8px}
          .exit-inputs{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#6d28d9;font-weight:700}
          .exit-pct,.exit-sell{width:52px;height:32px;border-radius:8px;border:1px solid #e2e8f0;text-align:center;font-weight:800;font-size:13px;background:#fff}
          .exit-opts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:8px}
          .exit-opt{display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #ede9fe;border-radius:8px;padding:6px 8px;font-size:11px;font-weight:600;color:#5b21b6;justify-content:center}
          .exit-opt select{flex:1;min-width:60px;height:32px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:600;background:#fff;padding:0 4px;color:#334155}
          .exit-skip{width:38px;height:32px;border-radius:8px;border:1px solid #e2e8f0;text-align:center;font-weight:800;font-size:13px;background:#fff}
          .add-ma-btn{margin-top:8px;width:100%;height:32px;border:1px dashed #fbbf24;background:#fff;color:#b45309;border-radius:8px;cursor:pointer;font-size:12px;font-weight:800}
          .add-ma-btn:hover{background:#fef3c7}
          .add-exit-btn{margin-top:8px;width:100%;height:32px;border:1px dashed #a78bfa;background:#fff;color:#6d28d9;border-radius:8px;cursor:pointer;font-size:12px;font-weight:800}
          .add-exit-btn:hover{background:#ede9fe}
          .ma-help{cursor:help;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px}
          .ma-popover{position:fixed;max-width:280px;background:#1e293b;color:#fff;font-size:11px;line-height:1.5;padding:10px 12px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.25);z-index:999;display:none;pointer-events:none;white-space:normal}
          .ma-popover.show{display:block;pointer-events:auto}
          @media(max-width:600px){
            .ma-row,.ma-row.exit-row{padding:10px}
            .ma-row-fields{grid-template-columns:1fr}
            .ma-field{padding:10px}
            .ma-field-opts{grid-template-columns:1fr}
            .exit-opts{grid-template-columns:1fr}
            .section-box.ma,.section-box.exit{padding:10px}
          }
          @media(max-width:820px) and (min-width:601px){
            .ma-row-fields{grid-template-columns:1fr}
            .ma-field-opts{grid-template-columns:1fr 1fr}
          }
          .cond-ma{background:#fff;border:1px solid #fde68a;border-radius:10px;padding:8px 10px;margin-bottom:6px;font-size:11px;color:#475569}
          .cond-ma:last-child{margin-bottom:0}
          .cond-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:1px}
          .cond-ma b{color:#92400e}
          .cond-line{margin-top:4px;line-height:1.6}
          .cond-exit{background:#fff;border:1px solid #ede9fe;border-radius:10px;padding:8px 10px;margin-bottom:6px;font-size:11px;color:#475569}
          .cond-exit:last-child{margin-bottom:0}
          .cond-exit b{color:#5b21b6}
          .hist-modal{position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:950;display:none;align-items:center;justify-content:center;padding:16px}
          .hist-modal.show{display:flex}
          .hist-box{background:#fff;border-radius:12px;max-width:860px;width:100%;max-height:82vh;display:flex;flex-direction:column;overflow:hidden}
          .hist-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:800;color:#1e293b}
          .hist-close{margin-left:auto;height:28px;padding:0 12px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#64748b;font-size:11px;font-weight:800;cursor:pointer}
          .hist-body{overflow:auto;padding:0 0 12px}
          .hist-table{width:100%;min-width:1120px;border-collapse:collapse;font-size:11px;color:#334155}
          .hist-table th{position:sticky;top:0;background:#f8fafc;color:#64748b;font-size:10px;padding:8px 6px;border-bottom:1px solid #e2e8f0;white-space:nowrap;z-index:1}
          .hist-table .hgroup th{position:static;padding:6px 8px;text-align:center;font-size:11px;font-weight:800;color:#334155;background:#f1f5f9;border-bottom:1px solid #e2e8f0}
          .hist-table .hgroup th.hold{color:#5b21b6;background:#ede9fe}
          .hist-table th.hold,.hist-table td.hold{background:#faf9ff}
          .hist-table td{padding:7px 6px;border-bottom:1px solid #f1f5f9;white-space:nowrap;vertical-align:top}
          .hist-table td.num{text-align:right;font-variant-numeric:tabular-nums}
          .hist-table td.reason{white-space:normal;min-width:220px;max-width:320px;color:#475569;font-size:11px;line-height:1.6}
          .hist-table tr.hrow:hover td{background:#f8fafc}
          .hist-table tr.hrow:hover td.hold{background:#f5f3ff}
          .hist-badge{display:inline-block;min-width:34px;text-align:center;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:800;color:#fff}
          .hist-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:10px 14px;background:#f8fafc;border-bottom:1px solid #f1f5f9}
          .hist-stat{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:7px 4px;text-align:center}
          .hist-stat .k{font-size:10px;font-weight:700;color:#94a3b8}
          .hist-stat .v{margin-top:2px;font-size:14px;font-weight:800;color:#1e293b}
          .hist-stat .s{font-size:10px;font-weight:700;color:#7c3aed}
          .hist-sub{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:8px 14px;font-size:11px;color:#64748b;border-bottom:1px solid #f1f5f9;background:#fff}
          .hist-sub b{color:#1e293b}
          @media(max-width:600px){.hist-summary{grid-template-columns:repeat(2,1fr)}}
        </style>

        <div class="header">
          <button class="header-back" aria-label="Go home" title="홈으로">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
          </button>
          <div class="header-title">📈 주식 트레이딩 시뮬레이션</div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-stock-trading-simulation.svg?style=plastic&amp;"/>
        </div>

        <main class="content">
          <div class="card">
            <div class="card-header" style="--accent:#f59e0b">
              <div class="search-wrap">
                <span class="search-icon">🔍</span>
                <input id="stock-search" placeholder="종목 검색 — 예: 삼성전자, SK하이닉스" value="" />
                <button id="stock-search-clear" class="search-clear" title="지우기">✕</button>
                <button id="stock-search-btn">검색</button>
                <div id="search-results" class="search-results"></div>
              </div>
            </div>
            <div style="padding:8px 14px;font-size:12px;color:#64748b" id="chart-title">로딩 중...</div>
            <div class="chart-wrap">
              <stock-chart id="sim-chart" enabled-control enabled-readout show-last-line></stock-chart>
            </div>
            <div id="sim-range-row" style="display:flex;align-items:center;gap:8px;padding:4px 14px 10px;background:#fff;border-top:1px solid #f1f5f9;font-size:11px;color:#64748b">
              <div style="display:flex;flex-direction:column;gap:4px;min-width:70px">
                <span id="sim-range-start" style="font-weight:700;white-space:nowrap;font-size:10px;line-height:14px">-</span>
              </div>
              <range-slider id="sim-range" orientation="horizontal" min="0" max="359" step="1" style="flex:1">
                <thumb-group label="구간" color="#7c3aed">
                  <thumb name="start" value="0"></thumb>
                  <thumb name="end" min="start" value="359"></thumb>
                </thumb-group>
              </range-slider>
              <div style="display: flex; flex-direction: column;gap:4px;min-width:70px;align-items:flex-end">
                <span id="sim-range-end" style="font-weight:700;white-space:nowrap;text-align:right;font-size:10px;line-height:14px">-</span>
                <span id="sim-range-count" style="font-weight:800;color:#7c3aed;white-space:nowrap;font-size:10px;line-height:14px">-</span>
                <span id="sim-range-hold" title="선택구간 첫~끝 종가 단순보유" style="font-weight:800;color:#94a3b8;white-space:nowrap;font-size:10px;line-height:14px">-</span>
              </div>
            </div>
            <div id="sim-replay-row" style="display:flex;align-items:center;gap:8px;padding:6px 14px 10px;background:#fff;border-top:1px solid #f1f5f9;font-size:11px;color:#64748b">
              <label style="display:inline-flex;align-items:center;gap:4px;font-weight:700;cursor:pointer;white-space:nowrap" title="반대로 매매: 탐색 조건의 매수↔매도를 뒤집음"><input type="checkbox" id="sim-replay-contrarian" style="width:14px;height:14px;accent-color:#8b5cf6" />🐸 청개구리</label>
              <button type="button" id="sim-replay-btn" title="추세자동매매 재생" style="margin-left:auto;font-size:11px;font-weight:800;color:#d97706;border:1px solid #f59e0b;background:#fff;border-radius:6px;padding:4px 10px;cursor:pointer;white-space:nowrap;line-height:16px">▶ 추세자동매매</button>
            </div>
            <form id="sim-candle-form" style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;padding:8px 14px;background:#fffbeb;border-top:1px solid #fef3c7" onsubmit="return false">
              <div class="config-field" style="flex:1;min-width:90px"><label style="font-size:11px;font-weight:700;color:#64748b">캔들 수</label><input id="sim-candle-count" type="number" min="30" max="1000" value="360" style="width:100%;height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff;box-sizing:border-box;font-size:16px;"/></div>
              <div class="config-field" style="flex:1;min-width:120px"><label style="font-size:11px;font-weight:700;color:#64748b">타임프레임</label><select id="sim-timeframe" style="width:100%;height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff;box-sizing:border-box"><option value="min:1">1분</option><option value="min:3">3분</option><option value="min:5">5분</option><option value="min:15">15분</option><option value="min:30">30분</option><option value="min:60">60분</option><option value="day:1" selected>일봉</option><option value="week:1">주봉</option><option value="month:1">월봉</option></select></div>
              <div class="config-field" id="sim-end-date-field" style="flex:1;min-width:110px"><label style="font-size:11px;font-weight:700;color:#64748b">종료일 (비우면 최신)</label><input id="sim-end-date" type="date" style="width:100%;height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff;box-sizing:border-box;"/></div>
              <div class="config-field" id="sim-end-datetime-field" style="flex:1;min-width:150px;display:none"><label style="font-size:11px;font-weight:700;color:#64748b">종료일시 (비우면 최신)</label><input id="sim-end-datetime" type="datetime-local" step="60" style="width:100%;height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff;box-sizing:border-box;"/></div>
              <button type="submit" id="sim-reload-btn" style="height:32px;padding:0 14px;border-radius:999px;border:1px solid #f59e0b;background:#fff;color:#d97706;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;align-self:end">다시불러오기</button>
            </form>
          </div>

          <form class="card" id="sim-config" style="margin-top:12px" onsubmit="return false">
            <div class="card-header" style="--accent:#f59e0b"><span class="card-title">⚙️ 설정</span></div>
            <div style="background:#f8fafc;border-bottom:1px solid #f1f5f9">
              <div class="result-grid" id="sim-result">
                <div class="result-item"><div class="result-label">보유주식수</div><div class="result-value" id="sim-shares">-주</div></div>
                <div class="result-item"><div class="result-label">평가금액</div><div class="result-value" id="sim-eval">-원</div></div>
                <div class="result-item"><div class="result-label">수익률</div><div class="result-value" id="sim-rate">-</div></div>
              </div>
              <div class="result-sub" id="sim-result-detail">
                <span>현금 <b id="sim-cash">-원</b></span>
                <span>주식평가 <b id="sim-holding">-원</b></span>
                <span>손익 <b id="sim-profit">-원</b></span>
                <span>수수료 <b id="sim-fee-total">-원</b></span>
                <span style="color:#94a3b8"><span id="sim-trade-count">0건</span> 체결</span>
                <span style="color:#94a3b8">선택구간 단순보유 <b id="sim-hold-all">-</b></span>
                <button type="button" id="sim-history-btn" style="margin-left:auto;height:28px;padding:0 12px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;color:#334155;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap">거래내역보기</button>
              </div>
            </div>
            <div style="padding:12px 14px;display:flex;flex-direction:column;gap:12px">
              <div class="config-grid">
                <div class="config-field"><label>투자원금 (원)</label><input id="sim-capital" type="number" min="100000" step="100000" value="100000000" style="font-size: 16px;" /></div>
                <div class="config-field"><label>수수료 (%)</label><input id="sim-fee" type="number" min="0" max="1" step="0.001" value="0.015" style="font-size: 16px;" /></div>
                <div class="config-field"><label>시작 보유 (주)</label><input id="sim-init-shares" type="number" min="0" step="1" value="100" style="font-size: 16px;" /></div>
                <div class="config-field"><label>시작 평단 (원, 자동)</label><input id="sim-init-avg" type="number" value="0" readonly tabindex="-1" style="font-size: 16px;background:#f1f5f9;color:#64748b;cursor:default;" /></div>
              </div>
            </div>
          </form>

          <div class="card" id="sim-conditions" style="margin-top:12px">
            <div class="card-header" style="--accent:#f59e0b"><span class="card-title">📋 매매조건</span><span style="margin-left:auto;display:inline-flex;gap:6px;align-items:center"><label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:#fff;cursor:pointer;white-space:nowrap" title="반대로 매매: 설정된 조건의 매수↔매도를 뒤집어 표시·집행"><input type="checkbox" id="sim-contrarian" style="width:14px;height:14px;accent-color:#8b5cf6" />🐸 청개구리</label><select id="sim-auto-trend-mode" class="head-btn" style="appearance:auto;padding-right:6px" title="구간 생성 방식"><option value="">✨ 자동추세구간+</option><option value="merged">병합추세구간</option><option value="single">단일추세구간</option><option value="manual">수동구간</option></select></span></div>
            <div style="padding:12px 14px;display:flex;flex-direction:column;gap:8px">
              <div id="sim-range-tabs-row" style="display:none;gap:8px;align-items:center">
                <div class="range-tabs" id="sim-range-tabs" style="flex:1;min-width:0"></div>
                <button type="button" class="opt-all-btn" id="sim-optimize-all-btn">🚀 전체 최적화</button>
              </div>
              <div id="sim-range-body"></div>
            </div>
          </div>
        </main>

          <button id="sim-share-fab" class="share-fab" title="공유하기">🔗</button>
          <div class="hist-modal" id="sim-history-modal">
            <div class="hist-box">
              <div class="hist-head"><span>📒 거래내역</span><span id="sim-history-count" style="font-size:11px;color:#94a3b8;font-weight:700"></span><button type="button" class="hist-close" id="sim-history-close">닫기 ✕</button></div>
              <div class="hist-body" id="sim-history-body"></div>
            </div>
          </div>
      `;
    }
  }

  return tagName;
};
