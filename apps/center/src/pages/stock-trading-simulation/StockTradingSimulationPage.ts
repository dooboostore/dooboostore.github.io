import { elementDefine, onConnectedBodyShadow, onConnectedBefore, onConnectedAfter, onInitialize, event, eventDelegate, eventDocument, innerHtml, setAttribute, propertyShadow, callPropertyShadow } from '@dooboostore/simple-web-component';
import { Router } from '@dooboostore/core-web';
import { inject } from '@dooboostore/simple-boot';
import { TossService, TossChartTimeframe } from '../../services/toss/TossService';
import { TrendRange } from '@dooboostore/algorithm';
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
}

// NOTE: 축소본 — 종목코드/캔들수/타임프레임/종료일시/투자원금/수수료/시작보유주 7개 파라미터만 유지.
// 전략(MA/실현/최적화/추세/내역) 섹션은 StockTradingSimulationPage.orig.bak 에 보관, 나중에 가져다 씀.

const tagName = 'center-stock-trading-simulation-page';

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
    // --- 7개 파라미터: 폼 바인딩 값이 원천, 미렌더 시 DEFAULT 폴백 ---
    private currentCode = DEFAULT_STOCK_CODE; // 종목번호 (code)
    private currentName = DEFAULT_STOCK_CODE;
    /** 설정 폼 값 바인딩 (shadow 경계 프록시) */
    @propertyShadow('#sim-config', 'value')
    configValue!: { capital: number; fee: number; shares: number; avg: number };

    /** 캔들 폼 값 바인딩 (shadow 경계 프록시) */
    @propertyShadow('#sim-candle-form', 'value')
    candleValue!: { count: number; timeframe: string; endDate: string; endTime: string; macdFast: number; macdSlow: number; macdSignal: number; rsiPeriod: number; rsiOb: number; rsiOs: number };

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
    /** 선택 구간 첫 캔들 종가로 초기보유 1건 시드 */
    private seedInitialTrade(): void {
      this.trades = [];
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
    private lastStockPrice: { close: number; base: number | null } | null = null;

    private restoreSimFromUrl() {
      try {
        const p = this.router?.getSearchParams?.();
        if (!p) return;
        const cfg = this.configValue as any ?? {};
        const cnd = this.candleValue as any ?? {};
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
          if (Number.isFinite(probe.getTime()) && probe.getTime() <= Date.now()) {
            cnd.endDate = ed.slice(0, 10);
            cnd.endTime = ed.length > 10 ? ed.slice(11, 16) : '';
          }
        }
        const fee = p.get('fee');
        if (fee) { const v = Number(fee); if (Number.isFinite(v) && v >= 0 && v <= 1) cfg.fee = v; }
        const mf = p.get('mf');
        if (mf) { const v = Number(mf); if (Number.isFinite(v)) cnd.macdFast = Math.floor(v); }
        const msl = p.get('msl');
        if (msl) { const v = Number(msl); if (Number.isFinite(v)) cnd.macdSlow = Math.floor(v); }
        const msg = p.get('msg');
        if (msg) { const v = Number(msg); if (Number.isFinite(v)) cnd.macdSignal = Math.floor(v); }
        const rp = p.get('rp');
        if (rp) { const v = Number(rp); if (Number.isFinite(v)) cnd.rsiPeriod = Math.floor(v); }
        const ob = p.get('ob');
        if (ob) { const v = Number(ob); if (Number.isFinite(v)) cnd.rsiOb = Math.floor(v); }
        const os = p.get('os');
        if (os) { const v = Number(os); if (Number.isFinite(v)) cnd.rsiOs = Math.floor(v); }
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

    private simUrlParams(): Record<string, string> {
      return {
        code: this.currentCode,
        cap: String(this.configValue.capital),
        sh: String(this.configValue.shares),
        cnt: String(this.candleValue.count),
        tf: this.candleValue.timeframe,
        ed: this.candleValue.endDate ? (this.candleValue.endTime ? `${this.candleValue.endDate}T${this.candleValue.endTime}` : this.candleValue.endDate) : '',
        fee: String(this.configValue.fee),
        rs: String(this.range.start),
        re: String(this.range.end),
        mf: String(this.candleValue.macdFast),
        msl: String(this.candleValue.macdSlow),
        msg: String(this.candleValue.macdSignal),
        rp: String(this.candleValue.rsiPeriod),
        ob: String(this.candleValue.rsiOb),
        os: String(this.candleValue.rsiOs),
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
        this.seedInitialTrade();
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
      this.candleValue.endDate = ''; this.candleValue.endTime = '';
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
    }

    @event('#sim-config', 'change')
    onConfigFormChange() {
      this.handleConfigForm();
    }

    @event('#sim-config', 'input')
    onConfigFormInput() {
      this.handleConfigForm();
    }

    /** 캔들 폼 → 상태 반영 (보조지표 포함, 추세 구간 판정에는 영향 없음) */
    private syncCandleForm() {
      const v = this.candleValue as any;
      if (!v || typeof v.count !== 'number') return;
      if (Number.isFinite(v.count)) this.candleValue.count = Math.max(30, Math.min(1000, Math.floor(v.count)));
      if (v.timeframe) this.candleValue.timeframe = v.timeframe as TossChartTimeframe;
      this.candleValue.endDate = /^\d{4}-\d{2}-\d{2}$/.test(v.endDate) ? v.endDate : '';
      this.candleValue.endTime = /^\d{2}:\d{2}$/.test(v.endTime) ? v.endTime : '';
      if (this.candleValue.endDate) {
        const probe = new Date(this.candleValue.endDate.length <= 10 && !v.endTime ? `${this.candleValue.endDate}T23:59:00` : `${this.candleValue.endDate}T${this.candleValue.endTime || '00:00'}:00`);
        if (!Number.isFinite(probe.getTime()) || probe.getTime() > Date.now()) { this.candleValue.endDate = ''; this.candleValue.endTime = ''; }
      }
      this.candleValue.macdFast = Math.max(2, Math.min(100, Math.floor(v.macdFast)));
      this.candleValue.macdSlow = Math.max(2, Math.min(200, Math.floor(v.macdSlow)));
      if (this.candleValue.macdSlow <= this.candleValue.macdFast) this.candleValue.macdSlow = this.candleValue.macdFast + 1;
      this.candleValue.macdSignal = Math.max(2, Math.min(50, Math.floor(v.macdSignal)));
      this.candleValue.rsiPeriod = Math.max(2, Math.min(100, Math.floor(v.rsiPeriod)));
      this.candleValue.rsiOb = Math.max(50, Math.min(100, Math.floor(v.rsiOb)));
      this.candleValue.rsiOs = Math.max(0, Math.min(50, Math.floor(v.rsiOs)));
    }

    @event('#sim-candle-form', 'change')
    onCandleFormChange() {
      this.handleCandleForm();
    }

    @event('#sim-candle-form', 'input')
    onCandleFormInput() {
      this.handleCandleForm();
    }

    @event('#sim-candle-form', 'submit', { preventDefault: true, stopPropagation: true })
    onCandleFormSubmit() {
      this.syncConfigFromForm();
      this.syncSimParamsToUrl();
      this.loadStock(this.currentCode, this.currentName);
    }

    private handleCandleForm() {
      const prevCount = this.candleValue.count;
      const prevTf = this.candleValue.timeframe;
      const prevEnd = `${this.candleValue.endDate}|${this.candleValue.endTime}`;
      this.syncConfigFromForm();
      this.syncCandleForm();
      this.syncSimParamsToUrl();
      this.trades = [];
      if (prevCount !== this.candleValue.count || prevTf !== this.candleValue.timeframe || prevEnd !== `${this.candleValue.endDate}|${this.candleValue.endTime}`) {
        this.loadStock(this.currentCode, this.currentName);
      } else {
        this.syncMasToChart();
      }
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

    private buildTicksHtml(candles: Candle[], markers?: Map<number, string>): string {
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
      const hEl = this.shadowRoot?.querySelector('#sim-range-hold') as HTMLElement | null;
      if (!n) {
        if (sEl) sEl.textContent = '-';
        if (eEl) eEl.textContent = '-';
        if (cEl) cEl.textContent = '0개';
        if (hEl) hEl.textContent = '-';
        return;
      }
      const end = this.range.end < 0 ? n - 1 : Math.min(this.range.end, n - 1);
      const start = Math.max(0, Math.min(this.range.start, end));
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
      const cur = this.rangeValue as any;
      if (cur && typeof cur === 'object' && (cur.start !== start || cur.end !== end)) {
        this.rangeValue = { start, end };
      }
    }

    /** 차트는 불러온 캔들 전체 + 선택 구간 rect 오버레이 */
    private buildChartHtml(): string {
      const n = this.chartCandles.length;
      if (!n) return '';
      const end = this.range.end < 0 ? n - 1 : Math.min(this.range.end, n - 1);
      const start = Math.max(0, Math.min(this.range.start, end));
      const ticksHtml = this.buildTicksHtml(this.chartCandles);
      const sDate = this.chartCandles[start]?.date ?? '';
      const eDate = this.chartCandles[end]?.date ?? '';
      const liveRect = (start > 0 || end < n - 1) && sDate && eDate
        ? `<rect date-start="${sDate}" date-end="${eDate}" fill="rgba(124,58,237,0.08)" stroke="#7c3aed" stroke-width="1" target="all"></rect>`
        : '';
      return `<volume></volume><macd><fast period="${this.candleValue.macdFast}"/><slow period="${this.candleValue.macdSlow}"/><signal period="${this.candleValue.macdSignal}"/></macd><rsi period="${this.candleValue.rsiPeriod}"><overbought level="${this.candleValue.rsiOb}"/><oversold level="${this.candleValue.rsiOs}"/></rsi><obv></obv>` + ticksHtml + liveRect;
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
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as HTMLElement;
      if (!chartEl || !this.chartCandles.length) return;
      chartEl.innerHTML = this.buildChartHtml();
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
      if (!last) {
        set('#sim-shares', `${Math.max(0, Math.floor(this.configValue.shares)).toLocaleString()}주`);
        set('#sim-eval', '-'); set('#sim-rate', '-');
        set('#sim-cash', fmt(this.configValue.capital));
        set('#sim-holding', '-'); set('#sim-profit', '-');
        return;
      }
      const shares = Math.max(0, Math.floor(this.configValue.shares));
      const holding = shares * last;
      const cash = this.configValue.capital;
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

    @event('#sim-reload-btn', 'click', { preventDefault: true, stopPropagation: true })
    onReloadCandles() {
      this.syncConfigFromForm();
      this.syncSimParamsToUrl();
      this.loadStock(this.currentCode, this.currentName);
    }

    @event('#sim-history-popup', 'history-open')
    @callPropertyShadow('#sim-history-popup', 'show')
    onHistoryOpen() {
      return [this.trades];
    }

    @event('#sim-add-condition-btn', 'click')
    onAddConditionClick() {
      // TODO: 조건 row 템플릿 확정 후 렌더 (지금은 버튼만)
      console.log('[sim] add-condition clicked');
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
            <sim-candle-form id="sim-candle-form" count="360" timeframe="day:1" macd-fast="12" macd-slow="26" macd-signal="9" rsi-period="14" rsi-ob="70" rsi-os="30"></sim-candle-form>
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
            <sim-config-form id="sim-config" capital="100000000" fee="0.015" shares="100"></sim-config-form>
          </div>

          <div class="card" id="sim-conditions" style="margin-top:12px">
            <div class="card-header" style="--accent:#f59e0b"><span class="card-title">📋 매매조건</span></div>
            <div style="padding:12px 14px">
              <div id="sim-condition-rows" style="display:flex;flex-direction:column;gap:8px"></div>
              <button type="button" id="sim-add-condition-btn" style="margin-top:8px;width:100%;height:32px;border:1px dashed #fbbf24;background:#fff;color:#b45309;border-radius:8px;cursor:pointer;font-size:12px;font-weight:800">+ 조건추가</button>
            </div>
          </div>
        </main>

          <button id="sim-share-fab" class="share-fab" title="공유하기">🔗</button>
      `;
    }
  }

  return tagName;
};
