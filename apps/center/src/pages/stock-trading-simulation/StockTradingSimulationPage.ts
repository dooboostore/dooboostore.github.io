import { elementDefine, onConnectedBodyShadow, onConnectedBefore, onConnectedAfter, onInitialize, event, eventDelegate, eventDocument, innerHtml, setAttribute, propertyShadow, callPropertyShadow } from '@dooboostore/simple-web-component';
import { Router } from '@dooboostore/core-web';
import { inject } from '@dooboostore/simple-boot';
import { TossService, TossChartTimeframe } from '../../services/toss/TossService';
import { TrendRange, TradingSimulator } from '@dooboostore/algorithm';
import type { Candle } from '@dooboostore/algorithm';

// TrendRange 네임스페이스 re-export (테스트 호환)
export { TrendRange };

/** 거래내역 1건 (초기보유 시드 + 이후 매매 누적용) */
export interface TradeEntry {
  idx: number;
  date: string;
  action: 'buy' | 'sell';
  price: number;
  shares: number;
  amount: number;
  reason: string;
  /** 체결 근거 조건 (엔진 스냅샷) */
  condition?: TradingSimulator.TradeCondition;
  /** 체결 시점에 걸려 있던 전체 조건 */
  candidates?: TradingSimulator.TradeCondition[];
}

// NOTE: 축소본 — 종목코드/캔들수/타임프레임/종료일시/투자원금/수수료/시작보유주 7개 파라미터만 유지.
// 전략(MA/실현/최적화/추세/내역) 섹션은 StockTradingSimulationPage.orig.bak 에 보관, 나중에 가져다 씀.

const tagName = 'center-stock-trading-simulation-page';

const DEFAULT_CANDLE_COUNT = 300;
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
    // --- 7개 파라미터: 폼 바인딩 값이 원천, 미렌더 시 DEFAULT 폴백 ---
    private currentCode = DEFAULT_STOCK_CODE; // 종목번호 (code)
    private currentName = DEFAULT_STOCK_CODE;
    /** 설정 폼 값 바인딩 (shadow 경계 프록시) */
    @propertyShadow('#sim-config', 'value')
    configValue!: { capital: number; fee: number; shares: number; avg: number };

    /** 캔들 폼 값 바인딩 (shadow 경계 프록시) */
    @propertyShadow('#sim-candle-form', 'value')
    candleValue!: { count: number; timeframe: string; endDate: string; endTime: string };

    /** 보조지표 폼 값 바인딩 (shadow 경계 프록시) */
    @propertyShadow('#sim-indicators', 'value')
    indicatorValue!: { macdFast: number; macdSlow: number; macdSignal: number; rsiPeriod: number; rsiOb: number; rsiOs: number; maShort: number; maMid: number; maLong: number; maExponential: boolean };

    /** 시작 자기자본 = 현금 + 보유평가(수량×평단) */
    private startEquity(): number {
      return this.configValue.capital + this.configValue.shares * this.configValue.avg;
    }
    private refreshInitAvg(): void {
      if (!this.chartCandles.length) return;
      const [zs] = this.simRange();
      const c = this.chartCandles[Math.max(0, Math.min(zs, this.chartCandles.length - 1))];
      if (c) this.configValue.avg = Math.round(c.close);
    }
    // --- 차트 상태 (파라미터 아님) ---
    private chartCandles: Candle[] = [];
    // --- 거래내역 (config·candle 변경 시 전체 파기, 차트 로드 시 초기보유로 시드) ---
    private trades: TradeEntry[] = [];
    /** 자동매매 루프 시작점 — seed 시점의 원금/보유 (루프가 갉아먹기 전 값, URL 저장용) */
    private baseCapital: number | null = null;
    private baseShares: number | null = null;
    /** 자동매매 결과 — 루프 산출 현금/보유 (입력 폼과 분리, 결과 표시용). null이면 입력값 그대로 표시 */
    private autoCash: number | null = null;
    private autoShares: number | null = null;
    /** 선택 구간 첫 캔들 종가로 초기보유 1건 시드 */
    private seedInitialTrade(): void {
      this.trades = [];
      this.autoCash = null;
      this.autoShares = null;
      // NOTE: lastBest(스위프 고정 s,m)는 여기서 지우지 않음 — runAutoTradeLoop가 매 실행마다
      // seed를 호출하므로 지우면 락이 즉시 날아가 루프가 항상 폴백값으로 돔. 해제는 전략 해제·종목 로드에서 명시.
      this.baseCapital = this.configValue.capital ?? 0;
      this.baseShares = Math.max(0, Math.floor(Number(this.configValue.shares) || 0));
      if (!this.chartCandles.length) return;
      const [zs] = this.simRange();
      const c = this.chartCandles[Math.max(0, Math.min(zs, this.chartCandles.length - 1))];
      const shares = Math.max(0, Math.floor(Number(this.configValue.shares) || 0));
      if (!c || shares <= 0) return;
      const price = Math.round(c.close);
      this.trades = [{
        idx: 1, date: c.date, action: 'buy', price, shares,
        amount: Math.round(shares * price), reason: '초기보유주식',
      }];
    }
    private range = { start: 0, end: -1 };
    // URL(rs/re)로 복원된 구간 — 다음 로드 1회에만 전체 리셋을 건너뜀
    private rangeFromUrl = false;
    // URL(pl)로 복원된 재생 위치 — 다음 로드 1회에만 적용
    private playFromUrl: number | null = null;
    private lastStockPrice: { close: number; base: number | null } | null = null;

    private restoreSimFromUrl() {
      try {
        const p = this.router?.getSearchParams?.();
        if (!p) return;
        const cfg = this.configValue as any ?? {};
        const cnd = this.candleValue as any ?? {};
        const ind = this.indicatorValue as any ?? {};
        const cap = p.get('cap');
        if (cap) { const v = Number(cap); if (Number.isFinite(v) && v >= 10000) cfg.capital = Math.floor(v); }
        const sh = p.get('sh');
        if (sh) { const v = Number(sh); if (Number.isFinite(v) && v >= 0) cfg.shares = Math.floor(v); }
        const cnt = p.get('cnt');
        if (cnt) { const v = Number(cnt); if (Number.isFinite(v) && v >= 30 && v <= 1000) cnd.count = Math.floor(v); }
        const tf = p.get('tf');
        if (tf && /^(min:\d+|day:1|week:1|month:1)$/.test(tf)) cnd.timeframe = tf;
        const ed = p.get('ed');
        if (ed && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(ed)) {
          const probe = new Date(ed.length <= 10 ? `${ed}T23:59:00` : `${ed}:00`);
          if (Number.isFinite(probe.getTime())) {
            cnd.endDate = ed.slice(0, 10);
            cnd.endTime = ed.length > 10 ? ed.slice(11, 16) : '';
          }
        }
        const fee = p.get('fee');
        if (fee) { const v = Number(fee); if (Number.isFinite(v) && v >= 0 && v <= 1) cfg.fee = v; }
        const mf = p.get('mf');
        if (mf) { const v = Number(mf); if (Number.isFinite(v)) ind.macdFast = Math.floor(v); }
        const msl = p.get('msl');
        if (msl) { const v = Number(msl); if (Number.isFinite(v)) ind.macdSlow = Math.floor(v); }
        const msg = p.get('msg');
        if (msg) { const v = Number(msg); if (Number.isFinite(v)) ind.macdSignal = Math.floor(v); }
        const rp = p.get('rp');
        if (rp) { const v = Number(rp); if (Number.isFinite(v)) ind.rsiPeriod = Math.floor(v); }
        const ob = p.get('ob');
        if (ob) { const v = Number(ob); if (Number.isFinite(v)) ind.rsiOb = Math.floor(v); }
        const os = p.get('os');
        if (os) { const v = Number(os); if (Number.isFinite(v)) ind.rsiOs = Math.floor(v); }
        const mma = p.get('mma');
        if (mma) { const v = Number(mma); if (Number.isFinite(v)) ind.maShort = Math.floor(v); }
        const mmi = p.get('mmi');
        if (mmi) { const v = Number(mmi); if (Number.isFinite(v)) ind.maMid = Math.floor(v); }
        const mml = p.get('mml');
        if (mml) { const v = Number(mml); if (Number.isFinite(v)) ind.maLong = Math.floor(v); }
        const mex = p.get('mex');
        if (mex !== null) ind.maExponential = mex === '1';
        const st = p.get('st');
        if (st === 'balanced' || st === 'pyramid-up' || st === 'pyramid-down') {
          const sel = this.shadowRoot?.querySelector('#sim-strategy') as HTMLSelectElement | null;
          if (sel) sel.value = st;
        }
        const pl = p.get('pl');
        if (pl !== null) { const v = Math.floor(Number(pl)); if (Number.isFinite(v) && v >= 0) this.playFromUrl = v; }
        const frog = p.get('frog');
        if (frog !== null) {
          this.frogActive = frog === '1';
          this.paintFrogButton();
        }
        const rs = p.get('rs'); const re = p.get('re');
        if (rs !== null || re !== null) {
          const s = rs !== null ? Math.floor(Number(rs)) : 0;
          const e = re !== null ? Math.floor(Number(re)) : -1;
          if (Number.isFinite(s) && s >= 0 && Number.isFinite(e) && (e < 0 || e >= s)) {
            this.range = { start: s, end: e }; this.rangeFromUrl = true;
          }
        }
      } catch {}
    }

    private simUrlParams(playOverride?: number): Record<string, string> {
      return {
        code: this.currentCode,
        // 루프 산출값이 아닌 사용자 입력 원금/보유 저장
        cap: String(this.baseCapital ?? this.configValue.capital),
        sh: String(this.baseShares ?? this.configValue.shares),
        cnt: String(this.candleValue.count),
        tf: this.candleValue.timeframe,
        ed: this.candleValue.endDate ? (this.candleValue.endTime ? `${this.candleValue.endDate}T${this.candleValue.endTime}` : this.candleValue.endDate) : '',
        fee: String(this.configValue.fee),
        rs: String(this.range.start),
        re: String(this.range.end),
        mf: String(this.indicatorValue.macdFast),
        msl: String(this.indicatorValue.macdSlow),
        msg: String(this.indicatorValue.macdSignal),
        rp: String(this.indicatorValue.rsiPeriod),
        ob: String(this.indicatorValue.rsiOb),
        os: String(this.indicatorValue.rsiOs),
        mma: String(this.indicatorValue.maShort),
        mmi: String(this.indicatorValue.maMid),
        mml: String(this.indicatorValue.maLong),
        mex: (this.indicatorValue as any).maExponential ? '1' : '0',
        st: (this.shadowRoot?.querySelector('#sim-strategy') as HTMLSelectElement | null)?.value ?? '',
        frog: this.frogActive ? '1' : '0',
        // 명시 위치 > 슬라이더 수집값 > 복원 대기값 — 단 thumb 엘리먼트가 있을 때만 (제거 직후 stale 값 방지)
        pl: (() => {
          if (!this.shadowRoot?.querySelector('#sim-range thumb-group thumb[name="play"]')) return '';
          const v = playOverride ?? this.playIndex() ?? this.playFromUrl;
          return v == null ? '' : String(v);
        })(),
      };
    }

    private syncSimParamsToUrl(playOverride?: number) {
      try {
        // URL 기록만 (라우트 이벤트 미발행 — 발행하면 페이지 리부트됨)
        this.router?.replaceUpsertSearchParam?.(this.simUrlParams(playOverride), { config: { noEventAndPublish: true } });
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

    @onInitialize
    async onInit(@inject(TossService.SYMBOL) tossService: TossService, router: Router) {
      this.tossService = tossService;
      this.router = router;
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
    }

    private updateChartTitle() {
      const titleEl = this.shadowRoot?.querySelector('#chart-title') as HTMLElement;
      if (!titleEl) return;
      const tfLabel = this.candleValue.timeframe.replace('day:', '일봉 ').replace('week:', '주봉 ').replace('month:', '월봉 ').replace('min:', '분봉 ');
      const activeLen = this.getActiveCandles().length;
      const rangeSuffix = (this.chartCandles.length && activeLen !== this.chartCandles.length)
        ? ` (구간 ${activeLen}개)`
        : '';
      const endSuffix = (this.candleValue.endDate && this.chartCandles.length)
        ? ` (~${this.chartCandles[this.chartCandles.length - 1]?.date ?? this.candleValue.endDate})` : '';
      const countText = `${this.candleValue.count}개${rangeSuffix}${endSuffix}`;
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

    /** 종료일시 → from ISO (일봉 이하는 날짜 00:00, 분봉은 date+time). '' = 최신 */
    private endDateToFrom(): string {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(this.candleValue.endDate)) return '';
      const isMin = this.candleValue.timeframe.startsWith('min:');
      const hm = isMin && /^\d{2}:\d{2}$/.test(this.candleValue.endTime) ? this.candleValue.endTime : '00:00';
      return `${this.candleValue.endDate}T${hm}:00+09:00`;
    }

    private async loadStock(code: string, name: string) {
      this.currentCode = code;
      this.currentName = name;
      // 진입 시점 이름 고정 — onInit이 늦게 currentName을 바꿔도 resolve 조건이 깨지지 않게
      const entryName = name;
      const isCodeLike = (v: string) => /^(A\d{6}|US.+|\d{6})$/.test(v.trim());
      try {
        const cur = this.router?.getSearchParams?.()?.get('code');
        if (cur !== code) this.router?.replaceUpsertSearchParam?.({ code });
      } catch {}
      const searchInput = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      if (searchInput) searchInput.value = name;
      this.updateChartTitle();

      try {
        const from = this.endDateToFrom();
        const chartRes = await this.tossService.getChart(code, { count: this.candleValue.count, timeframe: this.candleValue.timeframe as TossChartTimeframe, ...(from ? { from } : {}) }).catch(() => null);
        const raw = chartRes?.candles ?? [];
        const isMin = this.candleValue.timeframe.startsWith('min:');
        const isDayWeekMonth = this.candleValue.timeframe === 'day:1' || this.candleValue.timeframe === 'week:1' || this.candleValue.timeframe === 'month:1';
        const sortedRaw = [...raw].sort((a, b) => a.dt.localeCompare(b.dt));
        const candles = sortedRaw.map(c => ({ date: isMin ? `${c.dt.slice(5, 10)} ${c.dt.slice(11, 16)}` : isDayWeekMonth ? c.dt.slice(2, 10) : c.dt, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
        this.chartCandles = candles;
        // 로드 시 구간 전체 선택으로 리셋 (URL 구간 복원 시 1회 건너뜀)
        const keepRange = this.rangeFromUrl;
        this.rangeFromUrl = false;
        if (!keepRange) { this.range = { start: 0, end: -1 }; }
        this.syncRangeSliderBounds(!keepRange);
        // 시작 평단 = 선택 구간 첫 캔들 종가
        this.refreshInitAvg();

        const chartEl = this.shadowRoot?.querySelector('stock-chart') as HTMLElement;
        if (chartEl) {
          chartEl.innerHTML = this.buildChartHtml();
        }
        // 새 데이터 로드 → 줌 해제 (전체 표시)
        this.resetChartZoom();
        // 새 데이터면 이전 종목의 스위프 고정값 무효 — 전략 있으면 복원에서 재스위프 (진행 중 스위프 무효화)
        this.sweepGen++;
        this.lastBest = null;
        this.seedInitialTrade();
        this.refreshRealized();
        await this.restorePlayAfterLoad();
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
          if (inp2 && entryName === code) inp2.value = this.currentName;
        } else {
          try {
            const overview = await this.tossService.getOverview(code).catch(() => null);
            let resolvedName = overview?.company?.name?.trim();
            if (!resolvedName) {
              const prod = (await this.tossService.searchProduct(code).catch(() => []))?.[0];
              resolvedName = prod?.productName?.trim();
            }
            if (resolvedName && (entryName === code || isCodeLike(entryName))) {
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

    /** sim-strategy → strategyRate (balanced 0.5 / pyramid-up 1 / pyramid-down 0) */
    private strategyRateOf(): number {
      const v = (this.shadowRoot?.querySelector('#sim-strategy') as HTMLSelectElement | null)?.value ?? '';
      return v === 'pyramid-up' ? 1 : v === 'pyramid-down' ? 0 : 0.5;
    }

    /** 청개구리 — 활성 시 findBestConfig 매수/매도 뒤집기 (queryParam frog=1) */
    private frogActive = false;
    private paintFrogButton() {
      const btn = this.shadowRoot?.querySelector('#sim-frog') as HTMLButtonElement | null;
      if (!btn) return;
      btn.setAttribute('aria-pressed', String(this.frogActive));
      btn.style.filter = this.frogActive ? 'none' : 'grayscale(1)';
      btn.style.opacity = this.frogActive ? '1' : '0.5';
      btn.style.background = this.frogActive ? '#dcfce7' : '#f8fafc';
      btn.style.borderColor = this.frogActive ? '#86efac' : '#e2e8f0';
    }
    /** 스위프 베스트 클릭 → fresh 랜덤으로 다시 100회 돌려 (s, m) 교체 후 현재 위치 재실행 */
    @event('#sim-sweep-best', 'click')
    async onSweepReroll() {
      if (!this.chartCandles.length) return;
      await this.sweepAndLockFullRange();
      const at = this.playIndex();
      if (at != null) this.onPlayScrub(at, true);
      else this.updateRangeLabels();
    }

    @event('#sim-frog', 'click')
    onFrogToggle() {
      this.frogActive = !this.frogActive;
      this.paintFrogButton();
      this.syncSimParamsToUrl();
      // 개구리는 매수/매도 뒤집기만 — 고정 (s, m) 유지, 현재 위치까지 같은 값으로 재실행
      const at = this.playIndex();
      if (at != null) this.onPlayScrub(at, true);
      else this.updateRangeLabels();
    }

    /** 전략 선택 → 재생 thumb 추가/제거 (group 내, min=start·max=end 구속) */
    @event('#sim-strategy', 'change')
    async onStrategyChange() {
      const sel = (this.shadowRoot?.querySelector('#sim-strategy') as HTMLSelectElement | null)?.value ?? '';
      const group = this.shadowRoot?.querySelector('#sim-range thumb-group');
      if (!sel || !group) {
        group?.querySelector('thumb[name="play"]')?.remove();
        this.clearPlayhead();
        // 전략 해제 → 고정값·자동매매 내역·결과 파기, 입력값 표시로 복귀 (진행 중 스위프 무효화)
        this.sweepGen++;
        this.lastBest = null;
        this.seedInitialTrade();
        this.refreshRealized();
        this.syncSimParamsToUrl();
        this.updateRangeLabels();
        this.updateForecastSeries(null);
        return;
      }
      this.ensurePlayThumb();
      this.syncSimParamsToUrl();
      // 선택 시점에 풀구간 100회 스위프로 (s, m) 고정 후, 재생 위치까지 고정값 단일 처리
      const at = this.playIndex();
      await this.sweepAndLockFullRange();
      this.onPlayScrub(at ?? this.range.start, true);
    }

    /** 재생 thumb 보장 (없으면 지정 위치에 생성) */
    private ensurePlayThumb(initial?: number) {
      const group = this.shadowRoot?.querySelector('#sim-range thumb-group');
      if (!group || group.querySelector('thumb[name="play"]')) return;
      const thumb = document.createElement('thumb');
      thumb.setAttribute('name', 'play');
      thumb.setAttribute('min', 'start');
      thumb.setAttribute('max', 'end');
      thumb.setAttribute('value', String(initial ?? this.range.start));
      thumb.setAttribute('size', '26');
      thumb.setAttribute('fill', '#ef4444');
      thumb.setAttribute('color', '#b91c1c');
      group.appendChild(thumb);
    }

    /** slider 값에서 재생 위치 읽기 */
    private playIndex(): number | null {
      const v = Number((this.rangeValue as any)?.play);
      return Number.isFinite(v) ? Math.floor(v) : null;
    }

    /** 로드 완료 후 재생 상태 복원 (전략 선택 + URL pl 1회 적용) */
    private async restorePlayAfterLoad() {
      const sel = (this.shadowRoot?.querySelector('#sim-strategy') as HTMLSelectElement | null)?.value ?? '';
      if (!sel) return;
      const target = this.playFromUrl ?? this.range.start;
      this.playFromUrl = null;
      this.ensurePlayThumb(target);
      // 복원 시에도 풀구간 스위프로 고정 후 재생 위치까지 자동매매 연산 + 최적 스위프 표시
      await this.sweepAndLockFullRange();
      this.onPlayScrub(target, true);
    }

    /** 드래그 중 스로틀 상태 — leading 즉시 1회 + trailing 최신 1회 */
    private playThrottleTimer: number | null = null;
    private playPendingIdx: number | null = null;
    private lastPlayRunAt = 0;

    /** 재생 thumb 스크럽 — 선·개수는 즉시, bestconfig+simulate는 commit 즉시 / 드래그 중 스로틀(150ms) 지속 실행 */
    private onPlayScrub(playIdx: number, commit: boolean) {
      const n = this.chartCandles.length;
      if (!n) return;
      const end = this.range.end < 0 ? n - 1 : Math.min(this.range.end, n - 1);
      const start = Math.max(0, Math.min(this.range.start, end));
      const p = Math.max(start, Math.min(Math.floor(playIdx), end));
      this.paintPlayhead(this.chartCandles[p]?.date);
      const cEl = this.shadowRoot?.querySelector('#sim-range-count') as HTMLElement | null;
      if (cEl) cEl.textContent = `${p - start + 1}/${end - start + 1}봉`;
      // 손떼기(commit) — 예약 취소 후 URL 동기화 + 즉시 연산
      if (commit) {
        if (this.playThrottleTimer != null) { clearTimeout(this.playThrottleTimer); this.playThrottleTimer = null; }
        this.playPendingIdx = null;
        this.syncSimParamsToUrl(p);
        this.runAutoTradeLoop(p);
        this.lastPlayRunAt = Date.now();
        this.updateRangeLabels();
        this.updateForecastSeries(p);
        return;
      }
      // 드래그 중 — 고정 (s, m)으로 bestconfig+simulate 지속 실행 (URL은 손떼기 때만)
      this.playPendingIdx = p;
      const wait = 150 - (Date.now() - this.lastPlayRunAt);
      if (wait <= 0) {
        if (this.playThrottleTimer != null) { clearTimeout(this.playThrottleTimer); this.playThrottleTimer = null; }
        this.runPlayPending();
      } else if (this.playThrottleTimer == null) {
        this.playThrottleTimer = window.setTimeout(() => {
          this.playThrottleTimer = null;
          this.runPlayPending();
        }, wait);
      }
    }

    /** 예약된 최신 위치 1건 실행 (드래그 중 스로틀용, URL 미동기화) */
    private runPlayPending() {
      const p = this.playPendingIdx;
      this.playPendingIdx = null;
      if (p == null) return;
      this.runAutoTradeLoop(p);
      this.lastPlayRunAt = Date.now();
      this.updateRangeLabels();
      this.updateForecastSeries(p);
    }

    /** play 위치(=현재 시점) 기준 예측 콘 — [구간처음..play]로 10봉 예측해 play 다음부터 오버레이.
     *  중간선 + 상·하단 3개 <series>. playIdx 인자 있으면 확정값 사용, null이면 강제 제거,
     *  생략 시 DOM 실체 기준 읽기 (rangeValue.play가 thumb 제거 직후 stale할 수 있어서 DOM을 믿음).
     *  차트 mutation observer가 속성 변경을 감지해 다시 그림. */
    private updateForecastSeries(playIdx?: number | null) {
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as HTMLElement | null;
      if (!chartEl || !this.chartCandles.length) return;
      const prevAll = [...chartEl.querySelectorAll(':scope > series[id^="sim-forecast"]')];
      const n = this.chartCandles.length;
      const end = this.range.end < 0 ? n - 1 : Math.min(this.range.end, n - 1);
      const start = Math.max(0, Math.min(this.range.start, end));
      const hasThumb = !!this.shadowRoot?.querySelector('#sim-range thumb-group thumb[name="play"]');
      const at = playIdx !== undefined ? playIdx : (hasThumb ? this.playIndex() : null);
      if (at == null) { prevAll.forEach(el => el.remove()); return; }
      const p = Math.max(start, Math.min(Math.floor(at), end));
      const slice = this.chartCandles.slice(start, p + 1);
      // 중간선 = forecast() 단일 예측 — 등락률 반전 복리 + 0.25 댐핑.
      // 라벨에 directionProbability(5봉 후 상승확률) 병기 — 베팅사이즈 근거.
      const ind = this.indicatorValue as any ?? {};
      const maSize = Math.max(2, Math.floor(Number(ind.maLong) || 40));
      const mid = TradingSimulator.forecast(slice, maSize);
      if (!mid.length) { prevAll.forEach(el => el.remove()); return; }
      const base = slice[slice.length - 1]?.close ?? 0;
      const pct = base > 0 ? ((mid[mid.length - 1] - base) / base) * 100 : 0;
      const upP = TradingSimulator.directionProbability(slice);
      const edge = Math.abs(upP - 0.5) * 2;
      // 확신 색 구분 — edge>0.2 진한 보라(굵게), 미만 회색(얇게). 회색은 쉬라는 뜻.
      const confident = edge > 0.2;
      const label = `예측 ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% · 상승 ${(upP * 100).toFixed(0)}%`;
      const specs = [
        { id: 'sim-forecast', values: mid, color: confident ? '#8b5cf6' : '#9ca3af', width: confident ? '3' : '1', label },
      ];
      for (const s of specs) {
        const prev = chartEl.querySelector(`:scope > series#${CSS.escape(s.id)}`);
        if (prev) {
          prev.setAttribute('values', s.values.join(','));
          prev.setAttribute('anchor', `at:${p + 1}`);
          prev.setAttribute('color', s.color);
          prev.setAttribute('width', s.width);
          if (s.label) prev.setAttribute('label', s.label);
          else prev.removeAttribute('label');
        } else {
          const el = document.createElement('series');
          el.setAttribute('id', s.id);
          el.setAttribute('values', s.values.join(','));
          el.setAttribute('anchor', `at:${p + 1}`);
          el.setAttribute('color', s.color);
          el.setAttribute('dash', '5 4');
          el.setAttribute('width', s.width);
          if (s.label) el.setAttribute('label', s.label);
          chartEl.appendChild(el);
        }
      }
      // 예측 꼬리분이 현재 뷰를 넘으면 끝까지만 확장 (축소는 안 함, 차트 끝 초과분은 미래 슬롯)
      const chart = chartEl as any;
      if (typeof chart.getView === 'function' && typeof chart.setView === 'function') {
        const v = chart.getView();
        const need = Math.min(n - 1, p + mid.length);
        if (v && need > v.end) chart.setView(v.start, need);
      }
    }

    /**
     * 누적 자동매매 — [첫봉] → [첫+둘] → … → [첫..p] 확장 윈도우마다
     * findBestConfig → simulate(fromBar=마지막봉) → 마지막봉 매매만 거래내역에 반영.
     * 고정된 (s, m)으로 단일 실행 — 스위프·고정은 sweepAndLockFullRange() 담당.
     * 반영 후 보유주식·평가금액 표시(autoCash/autoShares) + 화면 새로고침.
     * 입력 폼(configValue)은 절대 건드리지 않음.
     */
    private lastBest: { s: number; m: number; ret: number } | null = null;
    private runAutoTradeLoop(p: number) {
      const n = this.chartCandles.length;
      if (!n) return;
      // 매번 seed 상태로 리셋 후 전체 루프 재실행 (중복 누적 방지)
      this.seedInitialTrade();
      const end = this.range.end < 0 ? n - 1 : Math.min(this.range.end, n - 1);
      const start = Math.max(0, Math.min(this.range.start, end));
      const upto = Math.max(start, Math.min(Math.floor(p), end));
      // 고정값 우선, 없으면(전략 미선택 등) 기존 단일 실행과 동일 폴백
      const s = this.lastBest?.s ?? this.strategyRateOf();
      const m = this.lastBest?.m ?? 0.5;
      const r = this.runLoopOnce(start, upto, s, m);
      this.applyLoopResult(r.accepted, r.cash, r.shares, upto);
    }

    /**
     * 전략 선택/개구리 변경 시: 선택 구간 전체[처음..끝] 단일 평가로 100회 스위프 → 최적 (s, m) 고정.
     * 매번 fresh 난수라 바꿀 때마다 다른 고정값. 우측 컬럼(sim-sweep-best)에 표시.
     * 스크럽 재생(확장 윈도우 루프)은 runAutoTradeLoop가 고정값으로 담당 — 여기서 돌리면 100×봉수 폭증.
     */
    /** 스위프 세대 — 전략을 와따가따하면 이전 스위프는 중단, 최신만 lastBest 기록 */
    private sweepGen = 0;
    private async sweepAndLockFullRange() {
      const gen = ++this.sweepGen;
      const n = this.chartCandles.length;
      if (!n) { this.lastBest = null; return; }
      const end = this.range.end < 0 ? n - 1 : Math.min(this.range.end, n - 1);
      const start = Math.max(0, Math.min(this.range.start, end));
      const ind = this.indicatorValue as any ?? {};
      const indicators = {
        macdFast: ind.macdFast, macdSlow: ind.macdSlow, macdSignal: ind.macdSignal,
        rsiPeriod: ind.rsiPeriod, rsiOb: ind.rsiOb, rsiOs: ind.rsiOs,
        maShort: ind.maShort, maMid: ind.maMid, maLong: ind.maLong,
        maExponential: !!ind.maExponential,
      };
      const fee = (this.configValue.fee ?? 0) / 100;
      const capital = this.configValue.capital ?? 0;
      const seedShares = Math.max(0, Math.floor(Number(this.configValue.shares) || 0));
      const seedHist: TradingSimulator.UserTrade[] = seedShares > 0
        ? [{ date: this.chartCandles[start].date, action: 'buy', price: Math.round(this.chartCandles[start]?.close ?? 0), shares: seedShares, initial: true }]
        : [];
      const win = this.chartCandles.slice(start, end + 1) as Candle[];
      const startEq = capital + seedShares * (win[0]?.close ?? 0);
      // 스위프 시작 표시 — 진행 중(…) → 10회마다 중간 최적값 → 최종 고정값
      const swEl = this.shadowRoot?.querySelector('#sim-sweep-best') as HTMLElement | null;
      if (swEl) swEl.textContent = '…';
      let best: { s: number; m: number; ret: number } | null = null;
      // 매번 fresh 난수 — 전략을 바꿀 때마다 다른 (s, m) 쌍 탐색 (같은 조건 재선택해도 다른 값)
      const rand = Math.random;
      for (let i = 0; i < 100; i++) {
        if (gen !== this.sweepGen) return; // 더 최신 스위프 시작됨 — 이전 것은 중단
        const s = rand();
        const m = rand();
        const cfg = TradingSimulator.findBestConfig(win, {
          strategyRate: s,
          marketRate: m,
          invertActions: this.frogActive,
          indicators,
        });
        const res = TradingSimulator.simulate({
          candles: win, config: cfg, history: [...seedHist], indicators,
          capital, fee, risk: { takeProfitPct: 100 }, // 2026-09-11 스위프 확정 (118종목)
        });
        const accepted = res.trades.filter(t => t.action === 'buy' || t.action === 'sell');
        const { cash, shares } = this.replayFills(accepted, capital, seedShares, fee);
        const endEq = cash + shares * (win[win.length - 1]?.close ?? 0);
        const ret = startEq > 0 ? ((endEq - startEq) / startEq) * 100 : 0;
        if (!best || ret > best.ret) best = { s, m, ret };
        if (i % 10 === 9) {
          if (gen !== this.sweepGen) return;
          this.lastBest = best;
          this.updateRangeLabels();
          await new Promise(r => setTimeout(r, 0));
        }
      }
      if (gen !== this.sweepGen) return;
      this.lastBest = best;
      this.updateRangeLabels();
    }

    /** 승인 내역 → 최종 현금/보유 (엔진과 동일 수식) */
    private replayFills(accepted: TradingSimulator.UserTrade[], capital: number, seedShares: number, fee: number) {
      let cash = capital;
      let shares = seedShares;
      for (const h of accepted) {
        if (h.action === 'buy') {
          const qty = Math.min(h.shares, Math.floor(cash / (h.price * (1 + fee))));
          cash -= qty * h.price * (1 + fee);
          shares += qty;
        } else if (h.action === 'sell') {
          const qty = Math.min(h.shares, shares);
          cash += qty * h.price * (1 - fee);
          shares -= qty;
        }
      }
      return { cash, shares };
    }

    /** 단일 루프 1회 — 지정 strategyRate·marketRate로 확장 윈도우 순회, 승인 내역 + 최종 현금/보유 반환 */
    private runLoopOnce(start: number, upto: number, sRate: number, mRate = 0.5) {
      const ind = this.indicatorValue as any ?? {};
      const indicators = {
        macdFast: ind.macdFast, macdSlow: ind.macdSlow, macdSignal: ind.macdSignal,
        rsiPeriod: ind.rsiPeriod, rsiOb: ind.rsiOb, rsiOs: ind.rsiOs,
        maShort: ind.maShort, maMid: ind.maMid, maLong: ind.maLong,
        maExponential: !!ind.maExponential,
      };
      const fee = (this.configValue.fee ?? 0) / 100; // 화면 % → 엔진 비율
      // 시작점 — 초기보유는 history(initial:true)로, 원금은 그대로 전달
      const seedShares = Math.max(0, Math.floor(Number(this.configValue.shares) || 0));
      const capital = this.configValue.capital ?? 0;
      const seedHist: TradingSimulator.UserTrade[] = seedShares > 0
        ? [{ date: this.chartCandles[start].date, action: 'buy', price: Math.round(this.chartCandles[start]?.close ?? 0), shares: seedShares, initial: true }]
        : [];
      const accepted: TradingSimulator.UserTrade[] = [];
      let bs: TradingSimulator.BatchState | undefined;
      for (let k = 1; k <= upto - start + 1; k++) {
        const win = this.chartCandles.slice(start, start + k) as Candle[];
        const cfg = TradingSimulator.findBestConfig(win, {
          strategyRate: sRate,
          marketRate: mRate,
          invertActions: this.frogActive,
          indicators,
        });
        const res = TradingSimulator.simulate({
          candles: win, config: cfg, history: [...seedHist, ...accepted],
          indicators, capital, fee, risk: { takeProfitPct: 100 }, fromBar: k - 1, batchState: bs, // 2026-09-11 스위프 확정 (118종목)
        });
        bs = res.batchState;
        for (const t of res.trades) {
          if (t.action === 'buy' || t.action === 'sell') accepted.push(t);
        }
      }
      // 최종 포지션 재생 (엔진과 동일 수식)
      const { cash, shares } = this.replayFills(accepted, capital, seedShares, fee);
      return { accepted, cash, shares };
    }

    /** 루프 결과 반영 — 표시용 현금/보유 + 거래내역 행 + 화면 새로고침 */
    private applyLoopResult(accepted: TradingSimulator.UserTrade[], cash: number, shares: number, upto: number) {
      this.autoCash = Math.max(0, Math.round(cash));
      this.autoShares = shares;
      const rows: TradeEntry[] = accepted.map((t, i) => ({
        idx: this.trades.length + i + 1,
        date: t.date,
        action: t.action as 'buy' | 'sell',
        price: t.price,
        shares: t.shares,
        amount: Math.round(t.price * t.shares),
        reason: t.condition
          ? `자동매매 · ${t.condition.description ?? `${t.condition.left} ${t.condition.operator} ${t.condition.right}`} ${t.condition.percent}%`
          : t.reason
            ? `자동매매 · ${t.reason}`
            : '자동매매',
        condition: t.condition ? { ...t.condition } : undefined,
        candidates: t.candidates?.map(c => ({ ...c })),
      }));
      this.trades = [...this.trades, ...rows];
      this.refreshRealized();
      // 차트 재빌드로 지워진 재생선 복원
      this.paintPlayhead(this.chartCandles[upto]?.date);
    }

    /** 재생 현재위치선 — 해당 candle 자식 <line> (수직 타임라인, 뮤테이션 옵저버가 다시 그림) */
    private paintPlayhead(date?: string) {
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as HTMLElement | null;
      if (!chartEl || !date) return;
      chartEl.querySelector(':scope > candle > line#sim-playhead')?.remove();
      chartEl.querySelector(':scope > candle > tooltip#sim-playhead-tip')?.remove();
      const candleEl = [...chartEl.querySelectorAll(':scope > candle')]
        .find(t => t.getAttribute('date') === date) as HTMLElement | undefined;
      if (!candleEl) return;
      const line = document.createElement('line');
      line.setAttribute('id', 'sim-playhead');
      line.setAttribute('width', '2');
      line.setAttribute('color', '#ef4444');
      line.setAttribute('target', 'all');
      candleEl.appendChild(line);
      const tip = document.createElement('tooltip');
      tip.setAttribute('id', 'sim-playhead-tip');
      tip.setAttribute('label', '자동매매');
      tip.setAttribute('position', 'top');
      tip.setAttribute('fill-color', '#ef4444');
      candleEl.appendChild(tip);
    }

    private clearPlayhead() {
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as HTMLElement | null;
      chartEl?.querySelector(':scope > candle > line#sim-playhead')?.remove();
      chartEl?.querySelector(':scope > candle > tooltip#sim-playhead-tip')?.remove();
    }

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
      // 종목 변경 시 종료일 초기화 (최신 기준) + 자동매매 상태 완전 초기화
      this.candleValue.endDate = ''; this.candleValue.endTime = '';
      this.resetAutoTradeUI();
      this.syncSimParamsToUrl();
      this.loadStock(code, name);
    }

    @onConnectedAfter
    onAfterConnected() {
      this.syncRangeSliderBounds();
      this.updateChartTitle();
      // 자식 폼 바인딩 완료 상태에서 URL 복원 → 확정값 URL 반영 → 로드
      this.restoreSimFromUrl();
      this.syncRangeSliderBounds();
      this.syncSimParamsToUrl();
      this.updateChartTitle();
      void this.loadStock(this.currentCode, this.currentName);
    }

    private handleConfigForm() {
      this.syncConfigFromForm();
      this.syncUrlWithoutReload();
      this.trades = [];
      this.seedInitialTrade();
      this.refreshRealized();
      this.rerunAutoTradeIfActive();
    }

    /** 자동매매 진행 중이면 현재 재생 위치까지 다시 돌림 */
    private rerunAutoTradeIfActive() {
      const sel = (this.shadowRoot?.querySelector('#sim-strategy') as HTMLSelectElement | null)?.value ?? '';
      if (!sel) return;
      const at = this.playIndex();
      if (at == null) return;
      this.onPlayScrub(at, true);
    }

    @event('#sim-config', 'change')
    onConfigFormChange() {
      this.handleConfigForm();
    }

    @event('#sim-config', 'input')
    onConfigFormInput() {
      this.handleConfigForm();
    }

    /** 캔들 폼 → 상태 반영 */
    private syncCandleForm() {
      const v = this.candleValue as any;
      if (!v || typeof v.count !== 'number') return;
      if (Number.isFinite(v.count)) this.candleValue.count = Math.max(30, Math.min(1000, Math.floor(v.count)));
      if (v.timeframe) this.candleValue.timeframe = v.timeframe as TossChartTimeframe;
      this.candleValue.endDate = /^\d{4}-\d{2}-\d{2}$/.test(v.endDate) ? v.endDate : '';
      this.candleValue.endTime = /^\d{2}:\d{2}$/.test(v.endTime) ? v.endTime : '';
      if (this.candleValue.endDate) {
        const probe = new Date(this.candleValue.endDate.length <= 10 && !v.endTime ? `${this.candleValue.endDate}T23:59:00` : `${this.candleValue.endDate}T${this.candleValue.endTime || '00:00'}:00`);
        // 형식이 깨졌을 때만 파기. 미래여도 입력 유지 (서버가 최신으로 응답)
        if (!Number.isFinite(probe.getTime())) { this.candleValue.endDate = ''; this.candleValue.endTime = ''; }
      }
      this.syncIndicatorForm();
    }

    /** 보조지표 폼 → 상태 반영 (추세 구간 판정에는 영향 없음) */
    private syncIndicatorForm() {
      const v = this.indicatorValue as any;
      if (!v) return;
      this.indicatorValue.macdFast = Math.max(2, Math.min(100, Math.floor(Number(v.macdFast) || 12)));
      this.indicatorValue.macdSlow = Math.max(2, Math.min(200, Math.floor(Number(v.macdSlow) || 26)));
      if (this.indicatorValue.macdSlow <= this.indicatorValue.macdFast) this.indicatorValue.macdSlow = this.indicatorValue.macdFast + 1;
      this.indicatorValue.macdSignal = Math.max(2, Math.min(50, Math.floor(Number(v.macdSignal) || 9)));
      this.indicatorValue.rsiPeriod = Math.max(2, Math.min(100, Math.floor(Number(v.rsiPeriod) || 14)));
      this.indicatorValue.rsiOb = Math.max(50, Math.min(100, Math.floor(Number(v.rsiOb) || 70)));
      this.indicatorValue.rsiOs = Math.max(0, Math.min(50, Math.floor(Number(v.rsiOs) || 30)));
      this.indicatorValue.maShort = Math.max(2, Math.min(500, Math.floor(Number(v.maShort) || 5)));
      this.indicatorValue.maMid = Math.max(2, Math.min(500, Math.floor(Number(v.maMid) || 10)));
      this.indicatorValue.maLong = Math.max(2, Math.min(500, Math.floor(Number(v.maLong) || 40)));
      this.indicatorValue.maExponential = !!v.maExponential;
    }

    @event('#sim-candle-form', 'change', { preventDefault: true, stopPropagation: true })
    onCandleFormSubmit() {
      this.syncConfigFromForm();
      this.syncCandleForm();
      this.syncIndicatorForm();
      this.trades = [];
      // 조회 조건 변경 → 자동매매 상태 리셋 (판을 갈아엎으니 전략·개구리·재생 위치 초기화)
      this.resetAutoTradeUI();
      this.syncSimParamsToUrl();
      this.loadStock(this.currentCode, this.currentName);
    }

    /** 다시불러오기(submit) — 로드는 onCandleFormSubmit이 수행 */
    @event('#sim-candle-form', 'submit', { preventDefault: true, stopPropagation: true })
    onCandleFormReload() {
      this.onCandleFormSubmit();
    }

    /** 자동매매 UI 상태 초기화 (전략/개구리/재생 위치) */
    private resetAutoTradeUI() {
      const sel = this.shadowRoot?.querySelector('#sim-strategy') as HTMLSelectElement | null;
      if (sel) sel.value = '';
      this.frogActive = false;
      this.paintFrogButton();
      this.shadowRoot?.querySelector('#sim-range thumb-group thumb[name="play"]')?.remove();
      this.clearPlayhead();
      this.playFromUrl = null;
      this.resetChartZoom();
    }

    /** 차트 줌 해제 — 전체 구간 표시 */
    private resetChartZoom() {
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as any;
      if (chartEl && typeof chartEl.resetView === 'function') {
        try { chartEl.resetView(); } catch {}
      }
    }

    @event('#sim-indicators', 'change')
    onIndicatorsChange() {
      this.syncIndicatorForm();
      this.syncSimParamsToUrl();
      this.syncMasToChart();
      this.rerunAutoTradeIfActive();
    }

    @event('#sim-indicators', 'input')
    onIndicatorsInput() {
      this.syncIndicatorForm();
      this.syncSimParamsToUrl();
      this.syncMasToChart();
      this.rerunAutoTradeIfActive();
    }

    private applySimRange(start: number, end: number, focus: boolean) {
      const n = this.chartCandles.length;
      if (!n) return;
      const e = Math.max(0, Math.min(Math.floor(end), n - 1));
      const s = Math.max(0, Math.min(Math.floor(start), e));
      if (s === this.range.start && e === this.range.end) return;
      this.range = { start: s, end: e };
      this.updateRangeLabels();
      this.refreshInitAvg();
      this.seedInitialTrade();
      this.refreshRealized();
      this.updateForecastSeries();
      this.syncUrlWithoutReload();
      // 구간 변경으로 차트 재빌드 시 재생선 복원
      const pl = Number((this.rangeValue as any)?.play);
      if (Number.isFinite(pl)) this.onPlayScrub(pl, false);
      if (focus) this.focusSimRangeOnChart();
    }

    @event('#sim-range', 'input')
    onSimRangeInput(e: Event) {
      const v = (e.target as any)?.value;
      if (!v || typeof v !== 'object') return;
      const s = Number(v.start);
      const ed = Number(v.end);
      if (!Number.isFinite(s) || !Number.isFinite(ed)) return;
      const pl = Number((v as any).play);
      if (Number.isFinite(pl) && s === this.range.start && ed === (this.range.end < 0 ? this.chartCandles.length - 1 : this.range.end)) {
        this.onPlayScrub(pl, false);
        return;
      }
      this.applySimRange(s, ed, false);
    }

    @event('#sim-range', 'change')
    onSimRangeChange(e: Event) {
      const v = (e.target as any)?.value;
      if (!v || typeof v !== 'object') return;
      const s = Number(v.start);
      const ed = Number(v.end);
      if (!Number.isFinite(s) || !Number.isFinite(ed)) return;
      const pl = Number((v as any).play);
      if (Number.isFinite(pl) && s === this.range.start && ed === (this.range.end < 0 ? this.chartCandles.length - 1 : this.range.end)) {
        this.onPlayScrub(pl, true);
        return;
      }
      this.applySimRange(s, ed, true);
    }

    private buildCandlesHtml(candles: Candle[], markers?: Map<number, string>): string {
      return candles.map((c, i) => {
        const m = markers?.get(i) ?? '';
        return `<candle date="${c.date}" open="${c.open}" high="${c.high}" low="${c.low}" close="${c.close}" volume="${c.volume}">${m}</candle>`;
      }).join('');
    }

    /** 선택 구간 [start, end] */
    private simRange(): [number, number] {
      const n = this.chartCandles.length;
      if (!n) return [0, -1];
      const end = this.range.end < 0 ? n - 1 : Math.min(this.range.end, n - 1);
      return [Math.max(0, Math.min(this.range.start, end)), end];
    }

    private getActiveCandles(): Candle[] {
      if (!this.chartCandles.length) return [];
      const end = this.range.end < 0 ? this.chartCandles.length - 1 : Math.min(this.range.end, this.chartCandles.length - 1);
      const start = Math.max(0, Math.min(this.range.start, end));
      return this.chartCandles.slice(start, end + 1);
    }

    /** 구간 슬라이더 값 바인딩 (shadow 경계 프록시) */
    @propertyShadow('#sim-range', 'value')
    rangeValue!: { start: number; end: number };

    /** 캔들 로드 후 슬라이더 범위 재설정 (reset=true면 전체 선택) */
    private syncRangeSliderBounds(reset = false) {
      const n = this.chartCandles.length;
      if (!n) return;
      if (reset || this.range.end < 0) { this.range = { start: 0, end: n - 1 }; }
      this.range.start = Math.max(0, Math.min(this.range.start, n - 1));
      this.range.end = Math.max(this.range.start, Math.min(this.range.end < 0 ? n - 1 : this.range.end, n - 1));
      const slider = this.shadowRoot?.querySelector('#sim-range') as HTMLElement | null;
      if (slider) {
        slider.setAttribute('min', '0');
        slider.setAttribute('max', String(n - 1));
        slider.setAttribute('step', '1');
      }
      const cur = this.rangeValue as any;
      if (!cur || cur.start !== this.range.start || cur.end !== this.range.end) {
        this.rangeValue = { start: this.range.start, end: this.range.end };
      }
      this.updateRangeLabels();
    }

    private updateRangeLabels() {
      const n = this.chartCandles.length;
      const sEl = this.shadowRoot?.querySelector('#sim-range-start') as HTMLElement | null;
      const eEl = this.shadowRoot?.querySelector('#sim-range-end') as HTMLElement | null;
      const cEl = this.shadowRoot?.querySelector('#sim-range-count') as HTMLElement | null;
      if (!n) {
        if (sEl) sEl.textContent = '-';
        if (eEl) eEl.textContent = '-';
        if (cEl) cEl.textContent = '0개';
        return;
      }
      const end = this.range.end < 0 ? n - 1 : Math.min(this.range.end, n - 1);
      const start = Math.max(0, Math.min(this.range.start, end));
      if (sEl) sEl.textContent = this.chartCandles[start]?.date ?? '-';
      if (eEl) eEl.textContent = this.chartCandles[end]?.date ?? '-';
      const hasPlay = !!this.shadowRoot?.querySelector('#sim-range thumb-group thumb[name="play"]');
      if (cEl) {
        // 자동매매 진행중(play thumb 존재)이면 현재위치 N/M봉 형식 (폭 고정)
        const plRaw = Number((this.rangeValue as any)?.play);
        if (hasPlay && Number.isFinite(plRaw)) {
          const p = Math.max(start, Math.min(Math.floor(plRaw), end));
          cEl.textContent = `${p - start + 1}/${end - start + 1}봉`;
        } else {
          cEl.textContent = `${end - start + 1}개`;
        }
      }
      // 최적 스위프 결과는 우측 컬럼 고정 자리 표시 (자리 고정, 값 없으면 '-')
      const swEl = this.shadowRoot?.querySelector('#sim-sweep-best') as HTMLElement | null;
      if (swEl) {
        if (this.lastBest) {
          swEl.textContent = `s${this.lastBest.s.toFixed(1)}/m${this.lastBest.m.toFixed(1)} ${this.lastBest.ret >= 0 ? '+' : ''}${this.lastBest.ret.toFixed(1)}%`;
        } else {
          swEl.textContent = '-';
        }
      }
      const cur = this.rangeValue as any;
      if (cur && typeof cur === 'object' && (cur.start !== start || cur.end !== end)) {
        this.rangeValue = { start, end };
      }
    }

    /** 차트는 불러온 캔들 전체 + 선택 구간 rect 오버레이 + 거래내역 B/S 툴팁 */
    private buildChartHtml(): string {
      const n = this.chartCandles.length;
      if (!n) return '';
      const end = this.range.end < 0 ? n - 1 : Math.min(this.range.end, n - 1);
      const start = Math.max(0, Math.min(this.range.start, end));
      // 거래내역 → 봉 인덱스별 B/S 툴팁 (매수=아래 빨강, 매도=위 파랑)
      const markers = new Map<number, string>();
      const idxByDate = new Map(this.chartCandles.map((c, i) => [c.date, i] as const));
      for (const t of this.trades) {
        const idx = idxByDate.get(t.date);
        if (idx == null) continue;
        const isBuy = t.action === 'buy';
        const tip = `<tooltip position="${isBuy ? 'candle-bottom' : 'candle-top'}" label="${isBuy ? 'B' : 'S'}" fill-color="${isBuy ? '#dc2626' : '#2563eb'}" label-color="#fff"></tooltip>`;
        markers.set(idx, (markers.get(idx) ?? '') + tip);
      }
      const candlesHtml = this.buildCandlesHtml(this.chartCandles, markers);
      const sDate = this.chartCandles[start]?.date ?? '';
      const eDate = this.chartCandles[end]?.date ?? '';
      const liveRect = (start > 0 || end < n - 1) && sDate && eDate
        ? `<rect date-start="${sDate}" date-end="${eDate}" fill="rgba(124,58,237,0.08)" stroke="#7c3aed" stroke-width="1" target="all"></rect>`
        : '';
      return `<volume></volume><ma period="${this.indicatorValue.maShort}" color="#ef4444" type="${this.indicatorValue.maExponential ? 'exponential' : 'sma'}"></ma><ma period="${this.indicatorValue.maMid}" color="#f59e0b" type="${this.indicatorValue.maExponential ? 'exponential' : 'sma'}"></ma><ma period="${this.indicatorValue.maLong}" color="#6366f1" type="${this.indicatorValue.maExponential ? 'exponential' : 'sma'}"></ma><macd><fast period="${this.indicatorValue.macdFast}"></fast><slow period="${this.indicatorValue.macdSlow}"></slow><signal period="${this.indicatorValue.macdSignal}"></signal></macd><rsi period="${this.indicatorValue.rsiPeriod}"><overbought level="${this.indicatorValue.rsiOb}"></overbought><oversold level="${this.indicatorValue.rsiOs}"></oversold></rsi><obv></obv>` + candlesHtml + liveRect;
    }

    /** 차트 뷰를 선택 구간으로 포커싱 (슬라이더 조작 시에만 호출) */
    private focusSimRangeOnChart() {
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as any;
      const n = this.chartCandles.length;
      if (!chartEl || !n || typeof chartEl.setView !== 'function') return;
      const end = this.range.end < 0 ? n - 1 : Math.min(this.range.end, n - 1);
      const start = Math.max(0, Math.min(this.range.start, end));
      if (start > 0 || end < n - 1) chartEl.setView(start, end);
    }

    private syncMasToChart() {
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as HTMLElement | null;
      if (!chartEl || !this.chartCandles.length) return;
      chartEl.innerHTML = this.buildChartHtml();
      this.updateForecastSeries();
      this.updateResultDisplay();
    }
    /** 화면 갱신 (결과 표시 + 차트) */
    private refreshRealized() {
      this.updateResultDisplay();
      this.syncMasToChart();
    }

    /** 결과 표시 — 보유 현황 (단순보유 기준) */
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
      const lastCandle = this.chartCandles.length ? this.chartCandles[this.chartCandles.length - 1].close : 0;
      const last = this.lastStockPrice?.close ?? lastCandle;
      // 자동매매 결과 있으면 그 값으로, 없으면 입력값 그대로 표시
      const dispShares = this.autoShares ?? Math.max(0, Math.floor(this.configValue.shares));
      const dispCash = this.autoCash ?? this.configValue.capital;
      if (!last) {
        set('#sim-shares', `${dispShares.toLocaleString()}주`);
        set('#sim-eval', '-'); set('#sim-rate', '-');
        set('#sim-cash', fmt(dispCash));
        set('#sim-holding', '-'); set('#sim-profit', '-');
        return;
      }
      const shares = dispShares;
      const holding = shares * last;
      const cash = dispCash;
      const evalAmt = cash + holding;
      const profit = evalAmt - this.startEquity();
      const rate = this.startEquity() ? (profit / this.startEquity()) * 100 : 0;
      set('#sim-shares', `${shares.toLocaleString()}주`);
      set('#sim-eval', fmt(evalAmt));
      set('#sim-rate', fmtRate(rate), hi(rate));
      set('#sim-cash', fmt(cash));
      set('#sim-holding', fmt(holding));
      set('#sim-profit', `${profit >= 0 ? '+' : ''}${Math.round(profit).toLocaleString()}원`, hi(profit));
    }

    private syncConfigFromForm() {
      const fv = this.configValue as { capital: number; fee: number; shares: number } | undefined;
      if (!fv) return;
      if (Number.isFinite(fv.capital)) this.configValue.capital = Math.max(10000, Math.floor(fv.capital));
      if (Number.isFinite(fv.shares)) this.configValue.shares = Math.max(0, Math.floor(fv.shares));
      if (Number.isFinite(fv.fee) && fv.fee >= 0 && fv.fee <= 1) this.configValue.fee = fv.fee;
    }

    @event('#sim-history-popup', 'history-open')
    @callPropertyShadow('#sim-history-popup', 'show')
    onHistoryOpen() {
      return [this.enrichedHistory()];
    }

    /** 거래내역 + 매매 후 보유 장부 (현금·보유 재생, 시작자기자본 대비 증감률) */
    private enrichedHistory() {
      const fee = (this.configValue.fee ?? 0) / 100; // 화면 % → 엔진 비율
      let cash = this.baseCapital ?? this.configValue.capital ?? 0;
      let shares = 0;
      const base = (this.baseCapital ?? 0) + (this.baseShares ?? 0) * (this.trades[0]?.price ?? 0);
      return this.trades.map(t => {
        if (t.reason === '초기보유주식' && t.action === 'buy') {
          shares += Math.max(0, Math.floor(t.shares));
        } else if (t.action === 'buy') {
          const qty = Math.min(t.shares, Math.floor(cash / (t.price * (1 + fee))));
          cash -= qty * t.price * (1 + fee);
          shares += qty;
        } else {
          const qty = Math.min(t.shares, shares);
          cash += qty * t.price * (1 - fee);
          shares -= qty;
        }
        const holdingEval = shares * t.price;
        const totalEval = cash + holdingEval;
        const totalRate = base > 0 ? ((totalEval - base) / base) * 100 : 0;
        return { ...t, sharesAfter: shares, holdingEval, totalEval, totalRate };
      });
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
              <div style="display:flex;flex-direction:column;gap:6px;min-width:96px">
                <select id="sim-strategy" style="height:30px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;color:#475569;background:#fff;padding:0 6px">
                  <option value="" selected>자동매매 선택</option>
                  <option value="balanced">균형</option>
                  <option value="pyramid-up">불타기</option>
                  <option value="pyramid-down">물타기</option>
                </select>
                <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
                  <button id="sim-frog" title="청개구리 (매수/매도 뒤집기)" aria-pressed="false" style="width:28px;height:28px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;filter:grayscale(1);opacity:0.5">🐸</button>
                  <span id="sim-range-count" style="font-weight:800;color:#7c3aed;white-space:nowrap;font-size:10px;line-height:14px;text-align:right">-</span>
                </div>
              </div>
              <range-slider id="sim-range" orientation="horizontal" min="0" max="359" step="1" style="flex:1">
                <thumb-group label="구간" color="#7c3aed">
                  <thumb name="start" value="0"></thumb>
                  <thumb name="end" min="start" value="359"></thumb>
                </thumb-group>
              </range-slider>
              <div style="display: flex; flex-direction: column;gap:4px;min-width:70px;align-items:flex-end">
                <span id="sim-range-start" style="font-weight:700;white-space:nowrap;text-align:right;font-size:10px;line-height:14px">-</span>
                <span id="sim-range-end" style="font-weight:700;white-space:nowrap;text-align:right;font-size:10px;line-height:14px">-</span>
                <span id="sim-sweep-best" title="클릭: 다시 뽑기" style="font-weight:700;white-space:nowrap;text-align:right;font-size:10px;line-height:14px;color:#64748b;cursor:pointer">-</span>
              </div>
            </div>
            <sim-indicator-form id="sim-indicators" macd-fast="12" macd-slow="26" macd-signal="9" rsi-period="14" rsi-ob="70" rsi-os="30" ma-short="5" ma-mid="10" ma-long="40"></sim-indicator-form>
            <sim-candle-form id="sim-candle-form" count="300" timeframe="day:1"></sim-candle-form>
          </div>

            <div class="card" id="sim-config-card" style="margin-top:12px">
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
                <span style="color:#94a3b8">선택구간 단순보유 <b id="sim-hold-all">-</b></span>
                <trade-history-popup id="sim-history-popup" style="margin-left:auto"></trade-history-popup>
              </div>
            </div>
            <sim-config-form id="sim-config" capital="100000000" fee="0.015" shares="0"></sim-config-form>
          </div>
        </main>

          <button id="sim-share-fab" class="share-fab" title="공유하기">🔗</button>
      `;
    }
  }

  return tagName;
};
