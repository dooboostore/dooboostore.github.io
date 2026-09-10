import {
  elementDefine,
  onConnectedBodyShadow,
  onConnectedBefore,
  onInitialize,
  addEventListener,
  innerHtml,
  setAttribute,
} from '@dooboostore/simple-web-component';
import { Router } from '@dooboostore/core-web';
import { inject } from '@dooboostore/simple-boot';
import { TossService } from '../../services/toss/TossService';
import { YahooFinanceService } from '../../services/yahoo/YahooFinanceService';

const tagName = 'center-stock-chart-page';

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class StockChartPage extends w.HTMLElement {

    @onConnectedBefore
    @innerHtml((c, helper) => helper.$w.document.querySelector('title'), { valueKey: 'titleBody' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:title"]'), "content", { valueKey: "ogTitle" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="description"]'), "content", { valueKey: "desc" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:description"]'), "content", { valueKey: "ogDesc" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:image"]'), "content", { valueKey: "ogImage" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:image"]'), "content", { valueKey: "twitterImage" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:title"]'), "content", { valueKey: "twitterTitle" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:description"]'), "content", { valueKey: "twitterDesc" })
    setPageMeta() {
      return {
        titleBody: '종목 차트 | @dooboostore',
        ogTitle:   '종목 차트 | @dooboostore',
        desc:      '종목 검색 후 일봉 차트 확인',
        ogDesc:    '종목 검색 후 일봉 차트 확인',
        ogImage: '/assets/images/stock-chart-og.png',
        twitterImage: '/assets/images/stock-chart-og.png',
        twitterTitle:   '종목 차트 | @dooboostore',
        twitterDesc:    '종목 검색 후 일봉 차트 확인',
      };
    }

    private router!: Router;
    private tossService!: TossService;
    private yahooService!: YahooFinanceService;
    private currentName = '';
    private currentCode = '';
    private timeframe = 'day:1';
    private candles: { date: string; open: number; high: number; low: number; close: number; volume: number }[] = [];

    private static readonly TF_TABS: { v: string; label: string; count: number }[] = [
      { v: 'min:1', label: '1분', count: 200 },
      { v: 'min:5', label: '5분', count: 200 },
      { v: 'day:1', label: '일봉', count: 120 },
      { v: 'week:1', label: '주봉', count: 120 },
      { v: 'month:1', label: '월봉', count: 120 },
      { v: 'year:1', label: '연봉', count: 30 },
    ];

    @onInitialize
    async onInit(
      @inject(TossService.SYMBOL) tossService: TossService,
      @inject(YahooFinanceService.SYMBOL) yahooService: YahooFinanceService,
      router: Router,
    ) {
      this.tossService = tossService;
      this.yahooService = yahooService;
      this.router = router;
      // 직접 진입(?code=) 시 shadow DOM 준비 후 로드 (onInit 시점엔 엘리먼트 없음)
      requestAnimationFrame(() => {
        try {
          const params = router?.getSearchParams?.();
          const code = params?.get('code');
          const tf = params?.get('tf');
          if (tf && StockChartPage.TF_TABS.some(t => t.v === tf)) this.timeframe = tf;
          if (code?.trim()) {
            const norm = /^[A-Z]/.test(code.trim()) ? code.trim() : `A${code.trim()}`;
            const input = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
            if (input) input.value = norm;
            void this.loadChart(norm, norm);
          }
        } catch {}
      });
    }

    private syncToUrl() {
      try {
        this.router?.replaceUpsertSearchParam?.(
          { code: this.currentCode, tf: this.timeframe }, { config: { noEventAndPublish: true } });
      } catch {
        try {
          const url = new URL(window.location.href);
          if (this.currentCode) url.searchParams.set('code', this.currentCode);
          url.searchParams.set('tf', this.timeframe);
          window.history.replaceState(null, '', url.toString());
        } catch {}
      }
    }

    private esc(s: string) {
      return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    }

    private async doSearch() {
      const input = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      const modal = this.shadowRoot?.querySelector('#search-modal') as HTMLElement;
      const resEl = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      const q = input?.value.trim() ?? '';
      if (!q || !resEl || !modal) return;
      modal.classList.add('open');
      resEl.innerHTML = '<div class="empty">검색 중…</div>';
      try {
        const items = await this.tossService.searchProduct(q).catch(() => []);
        resEl.innerHTML = items.slice(0, 10).map((p: any) =>
          `<button class="res" data-code="${this.esc(p.productCode)}" data-name="${this.esc(p.productName ?? p.productCode)}">` +
          `<span class="res-name">${this.esc(p.productName ?? p.productCode)}</span>` +
          `<span class="res-code">${this.esc(p.productCode)}</span></button>`
        ).join('') || '<div class="empty">검색 결과 없음</div>';
      } catch (e) {
        resEl.innerHTML = '<div class="empty">검색 실패</div>';
      }
    }

    private closeSearch() {
      const modal = this.shadowRoot?.querySelector('#search-modal') as HTMLElement;
      if (modal) modal.classList.remove('open');
    }

    private async loadChart(code: string, name: string) {
      const titleEl = this.shadowRoot?.querySelector('#chart-title') as HTMLElement;
      if (titleEl) titleEl.textContent = `${name} (${code})`;
      this.currentName = name;
      this.currentCode = code;
      this.syncToUrl();
      // 코드로 들어오면 종목명으로 교체 (overview → searchProduct 순)
      if (name === code) {
        try {
          const overview = await this.tossService.getOverview(code).catch(() => null);
          let resolved = overview?.company?.name?.trim();
          if (!resolved) {
            const prod = (await this.tossService.searchProduct(code).catch(() => []))?.[0] as any;
            resolved = prod?.productName?.trim();
          }
          if (resolved) {
            this.currentName = resolved;
            if (titleEl) titleEl.textContent = `${resolved} (${code})`;
            const input = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
            if (input) input.value = resolved;
          }
        } catch {}
      }
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as HTMLElement | null;
      if (!chartEl) return;
      this.syncTabs();
      try {
        const tab = StockChartPage.TF_TABS.find(t => t.v === this.timeframe)!;
        const isMin = this.timeframe.startsWith('min:');
        const res = await this.tossService.getChart(code, { count: tab.count, timeframe: this.timeframe as any });
        const raw = [...(res?.candles ?? [])].sort((a, b) => a.dt.localeCompare(b.dt));
        if (!raw.length) {
          chartEl.innerHTML = '';
          if (titleEl) titleEl.textContent = `${name} — 데이터 없음`;
          return;
        }
        this.candles = raw.map(c => ({
          date: isMin ? `${c.dt.slice(5, 10)} ${c.dt.slice(11, 16)}` : c.dt.slice(0, 10),
          open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
        }));
        void this.updatePriceLine(code);
        const firstTs = Date.parse(raw[0]?.dt ?? '');
        this.historyStartTs = Number.isFinite(firstTs) ? Math.floor(firstTs / 1000) : null;
        chartEl.innerHTML = this.chartInnerHtml();
        const info = this.shadowRoot?.querySelector('#candle-info') as HTMLElement;
        if (info) info.textContent = `총 ${this.candles.length}봉 · 클릭하면 봉 정보 표시`;
      } catch (e) {
        console.error(e);
        if (titleEl) titleEl.textContent = `${name} — 불러오기 실패`;
      }
    }

    private async updatePriceLine(code: string) {
      const el = this.shadowRoot?.querySelector('#price-line') as HTMLElement;
      if (!el) return;
      try {
        const sp = await this.tossService.getStockPrice(code).catch(() => null);
        if (!sp || !(sp.close > 0) || code !== this.currentCode) return;
        const chg = sp.base > 0 ? ((sp.close - sp.base) / sp.base) * 100 : 0;
        const cls = chg >= 0 ? 'up' : 'down';
        const isUsd = (sp.currency || '').toUpperCase() === 'USD';
        const price = isUsd
          ? `$${sp.close.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : `${sp.close.toLocaleString()}원`;
        el.innerHTML = `<span class="${cls}">${price} ` +
          `<small>(${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%)</small></span>`;
      } catch {}
    }

    private syncTabs() {
      this.shadowRoot?.querySelectorAll('.tab-tf').forEach(el => {
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.value === this.timeframe);
      });
    }
    private edgeArmed = false;
    private extending = false;
    /** 가장 오래된 봉의 unix초 (Yahoo 페이징 커서) */
    private historyStartTs: number | null = null;

    /** 좌측 끝에 닿으면 과거 봉 추가 (Yahoo period分页=무한. 주/월/년·해외는 Toss 350 한도) */
    private async extendHistory() {
      if (this.extending || !this.currentCode || !this.candles.length) return;
      this.extending = true;
      try {
        const chartEl = this.shadowRoot?.querySelector('stock-chart') as any;
        const v = chartEl?.getView?.() as { start: number; end: number } | null;
        const isMin = this.timeframe.startsWith('min:');
        const kr = /^A\d{6}$/.test(this.currentCode);
        let fresh: { date: string; open: number; high: number; low: number; close: number; volume: number }[] = [];
        // Yahoo 일봉 페이징은 day:1에서만 (주/월/년은粒度 다름)
        if (kr && !isMin && this.timeframe === 'day:1') {
          // Yahoo 무한 페이징: 가장 오래된 봉 기준 400일치 이전
          const sym = `${this.currentCode.slice(1)}.KS`;
          const oldest = this.candles[0].date;
          const p2 = Math.floor(new Date(`${oldest}T00:00:00+09:00`).getTime() / 1000) - 86400;
          const p1 = p2 - 400 * 86400;
          if (!(p2 > 0)) return;
          const bars = await this.yahooService.getDailyRange(sym, p1, p2).catch(() => []);
          const have = new Set(this.candles.map(c => c.date));
          fresh = bars
            .filter(b => !have.has(b.date))
            .map(b => ({
              date: b.date,
              open: b.open ?? b.close, high: b.high ?? b.close,
              low: b.low ?? b.close, close: b.close, volume: b.volume ?? 0,
            }));
        } else if (kr && isMin && this.historyStartTs) {
          // 분봉 Yahoo 페이징 (1m 30일 한도 내, 3일씩)
          const sym = `${this.currentCode.slice(1)}.KS`;
          const iv = this.timeframe === 'min:5' ? '5m' : '1m';
          const p2 = this.historyStartTs - 60;
          const p1 = p2 - 3 * 86400;
          if (!(p2 > 0)) return;
          const bars = await this.yahooService.getDailyRange(sym, p1, p2, iv).catch(() => []);
          const have = new Set(this.candles.map(c => c.date));
          fresh = bars
            .map(b => {
              const d = b.date.length > 10 ? `${b.date.slice(5, 10)} ${b.date.slice(11, 16)}` : b.date;
              return {
                date: d,
                open: b.open ?? b.close, high: b.high ?? b.close,
                low: b.low ?? b.close, close: b.close, volume: b.volume ?? 0,
              };
            })
            .filter(c => !have.has(c.date));
          const tsList = bars.map(b => b.ts ?? 0).filter(t => t > 0);
          if (tsList.length) this.historyStartTs = Math.min(...tsList);
        } else if (this.candles.length < 350) {
          // Yahoo 무한 페이징: 가장 오래된 봉 기준 400일치 이전
          const sym = `${this.currentCode.slice(1)}.KS`;
          const oldest = this.candles[0].date;
          const p2 = Math.floor(new Date(`${oldest}T00:00:00+09:00`).getTime() / 1000) - 86400;
          const p1 = p2 - 400 * 86400;
          if (!(p2 > 0)) return;
          const bars = await this.yahooService.getDailyRange(sym, p1, p2).catch(() => []);
          const have = new Set(this.candles.map(c => c.date));
          fresh = bars
            .filter(b => !have.has(b.date))
            .map(b => ({
              date: b.date,
              open: b.open ?? b.close, high: b.high ?? b.close,
              low: b.low ?? b.close, close: b.close, volume: b.volume ?? 0,
            }));
        } else if (this.candles.length < 350) {
          // Toss 폴백 (커서 없음, 350 한도)
          const tab = StockChartPage.TF_TABS.find(t => t.v === this.timeframe)!;
          const res = await this.tossService.getChart(this.currentCode, { count: 350, timeframe: this.timeframe as any });
          const raw = [...(res?.candles ?? [])].sort((a, b) => a.dt.localeCompare(b.dt));
          const have = new Set(this.candles.map(c => c.date));
          const fmt = (dt: string) => isMin ? `${dt.slice(5, 10)} ${dt.slice(11, 16)}` : dt.slice(0, 10);
          void tab;
          fresh = raw
            .map(c => ({
              date: fmt(c.dt), open: c.open, high: c.high,
              low: c.low, close: c.close, volume: c.volume,
            }))
            .filter(c => !have.has(c.date));
        }
        if (!fresh.length) return;
        const added = fresh.length;
        this.candles = [...fresh, ...this.candles];
        if (chartEl) {
          chartEl.innerHTML = this.chartInnerHtml();
          // mutation observer가 새 봉 수집한 뒤에 복원 (동기 setView는 옛 개수 기준이라 1봉으로 잘림)
          if (v) {
            requestAnimationFrame(() => {
              try { chartEl.setView(v.start + added, v.end + added); } catch {}
            });
          }
        }
        const info = this.shadowRoot?.querySelector('#candle-info') as HTMLElement;
        if (info) info.textContent = `총 ${this.candles.length}봉 · 클릭하면 봉 정보 표시`;
      } catch (e) {
        console.warn('[stock-chart] extend failed');
      } finally {
        this.extending = false;
      }
    }

    private chartInnerHtml(): string {
      return `<volume></volume>` +
        `<ma period="5" color="#ef4444" type="sma"></ma>` +
        `<ma period="20" color="#f59e0b" type="sma"></ma>` +
        `<ma period="60" color="#6366f1" type="sma"></ma>` +
        `<macd><fast period="12"></fast><slow period="26"></slow><signal period="9"></signal></macd>` +
        `<rsi period="14"><overbought level="70"></overbought><oversold level="30"></oversold></rsi>` +
        this.candles.map(c =>
          `<candle date="${c.date}" open="${c.open}" high="${c.high}" low="${c.low}" close="${c.close}" volume="${c.volume}"></candle>`
        ).join('');
    }

    private zoom(factor: number) {
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as any;
      if (!chartEl || typeof chartEl.getView !== 'function' || typeof chartEl.setView !== 'function') return;
      try {
        const v = chartEl.getView();
        if (!v) return;
        const c = (v.start + v.end) / 2;
        const half = Math.max(2, ((v.end - v.start) / 2) * factor);
        const n = this.candles.length;
        const s = Math.max(0, Math.round(c - half));
        chartEl.setView(s, Math.min(n - 1, Math.round(c + half)));
      } catch {}
    }

@addEventListener('.share-fab', 'click')
    async onShare() {
      const url = window.location.href;
      const btn = this.shadowRoot?.querySelector('.share-fab') as HTMLElement;
      const flash = () => {
        if (!btn) return;
        const old = btn.textContent;
        btn.textContent = '✓';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = old; btn.classList.remove('copied'); }, 1500);
      };
      try {
        if ((navigator as any).share) {
          await (navigator as any).share({ title: '종목 차트 | @dooboostore', text: '종목 차트를 확인하세요!', url });
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

    @addEventListener('#stock-search-btn', 'click')
    onSearchBtn() { void this.doSearch(); }

    @addEventListener('#stock-search', 'keydown')
    onSearchKey(e: KeyboardEvent) {
      if (e.key === 'Enter') void this.doSearch();
    }

    @addEventListener('#search-results', 'click')
    onResultClick(e: Event) {
      const btn = (e.target as HTMLElement).closest('[data-code]') as HTMLElement | null;
      if (!btn) return;
      this.closeSearch();
      void this.loadChart(btn.dataset.code!, btn.dataset.name || btn.dataset.code!);
    }

    @addEventListener('#search-modal', 'click')
    onSearchBackdrop(e: Event) {
      if ((e.target as HTMLElement).id === 'search-modal') this.closeSearch();
    }

    @addEventListener('#search-close', 'click')
    onSearchClose() {
      this.closeSearch();
    }

    @addEventListener('.tab-tf', 'click', { delegate: true })
    onTfTab(e: Event) {
      const btn = (e.target as HTMLElement).closest('.tab-tf') as HTMLElement | null;
      if (!btn || btn.dataset.value === this.timeframe) return;
      this.timeframe = btn.dataset.value!;
      if (this.currentCode) void this.loadChart(this.currentCode, this.currentName || this.currentCode);
    }

    @addEventListener('#zoom-in', 'click')
    onZoomIn() { this.zoom(0.7); }

    @addEventListener('#zoom-out', 'click')
    onZoomOut() { this.zoom(1.4); }

    @addEventListener('#zoom-reset', 'click')
    onZoomReset() {
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as any;
      try { chartEl?.resetView?.(); } catch {}
    }

    @addEventListener('stock-chart', 'view-edge')
    onViewEdge(e: Event) {
      if (!this.edgeArmed) return;
      if ((e as CustomEvent).detail?.edge === 'start') void this.extendHistory();
    }

    @addEventListener('stock-chart', 'pointerdown')
    onChartTouch() {
      this.edgeArmed = true;
    }

    @addEventListener('stock-chart', 'wheel')
    onChartWheel() {
      this.edgeArmed = true;
    }

    @addEventListener('stock-chart', 'click')
    onCandleClick(e: Event) {
      // 엘리먼트 내장 리드아웃(enabled-readout)이 캔버스에 표시. 여긴 텍스트 요약만.
      const c = (e.target as HTMLElement).closest('candle') as HTMLElement | null;
      const info = this.shadowRoot?.querySelector('#candle-info') as HTMLElement;
      if (!c || !info) return;
      const g = (k: string) => c.getAttribute(k) ?? '-';
      const o = Number(g('open')), h = Number(g('high')), l = Number(g('low')), cl = Number(g('close'));
      const chg = o > 0 ? ((cl - o) / o) * 100 : 0;
      info.innerHTML = `<b>${g('date')}</b> 시 ${Number(o).toLocaleString()} · 고 ${Number(h).toLocaleString()} · ` +
        `저 ${Number(l).toLocaleString()} · 종 ${Number(cl).toLocaleString()} ` +
        `<span style="color:${chg >= 0 ? '#d32f2f' : '#1976d2'}">(${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%)</span> · ` +
        `거래량 ${Number(g('volume')).toLocaleString()}`;
    }

    @addEventListener('.header-back', 'click')
    onBack() { this.router.go('/'); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; min-height:100vh; background:#f0f2f5; font-family:var(--font-family,sans-serif); }
          * { box-sizing:border-box; }
          .header { display:flex; align-items:center; gap:12px; padding:16px 20px;
            background:linear-gradient(135deg,#1565c0 0%,#1976d2 60%,#42a5f5 100%); color:#fff; }
          .header-back { background:rgba(255,255,255,0.2); border:none; color:#fff;
            width:38px; height:38px; border-radius:8px; cursor:pointer;
            display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
          .header-back:hover { background:rgba(255,255,255,0.35); }
          .header-title { font-size:20px; font-weight:700; flex:1; }
          .share-fab { position:fixed; bottom:24px; right:24px; width:54px; height:54px; border-radius:50%;
            background:linear-gradient(135deg,#1565c0,#42a5f5); color:#fff; border:none;
            box-shadow:0 6px 20px rgba(25,118,210,0.45); cursor:pointer; font-size:20px;
            display:flex; align-items:center; justify-content:center; z-index:900; }
          .share-fab:hover { transform:scale(1.08); }
          .share-fab.copied { background:linear-gradient(135deg,#00B050,#00B050); }
          .header-hits { height:20px; border-radius:4px; opacity:0.9; margin-left:auto; }
          @media(max-width:600px){ .header{padding:12px 14px} .header-title{font-size:17px} }
          .content { padding:16px; max-width:1100px; margin:0 auto; display:flex; flex-direction:column; gap:12px; }
          .card { background:#fff; border-radius:14px; box-shadow:0 4px 14px rgba(0,0,0,0.07); overflow:hidden; }
          .card-header { background:linear-gradient(135deg,#1565c0,#1976d2); color:#fff;
            padding:10px 14px; font-size:14px; font-weight:700; }
          .card-body { padding:12px 14px; }
          .search-row { display:flex; gap:8px; }
          #stock-search { flex:1; padding:10px 12px; font-size:14px; border-radius:10px;
            border:1.5px solid #e2e8f0; background:#f8fafc; color:#0f172a; }
          #stock-search-btn { padding:10px 18px; border-radius:10px; border:none; cursor:pointer;
            background:linear-gradient(135deg,#1565c0,#42a5f5); color:#fff; font-weight:700; }
          #search-results { display:flex; flex-direction:column; gap:6px; }
          .modal-backdrop { display:none; position:fixed; inset:0; background:rgba(15,23,42,0.55);
            z-index:1000; align-items:flex-end; justify-content:center; }
          .modal-backdrop.open { display:flex; }
          @media(min-width:640px){ .modal-backdrop { align-items:center; padding:24px; } }
          .modal-panel { background:#fff; border-radius:16px 16px 0 0; width:100%; max-width:560px;
            max-height:80vh; overflow-y:auto; box-shadow:0 -8px 30px rgba(0,0,0,0.25); }
          @media(min-width:640px){ .modal-panel { border-radius:16px; } }
          .modal-bar { position:sticky; top:0; display:flex; align-items:center; gap:8px;
            padding:10px 14px; border-bottom:1px solid #f1f5f9; background:#fff; z-index:1; }
          .modal-title { font-size:15px; font-weight:800; color:#0f172a; flex:1; }
          .modal-close { width:32px; height:32px; border-radius:8px; border:1px solid #e2e8f0;
            background:#fff; color:#64748b; cursor:pointer; font-size:16px; line-height:1; }
          .modal-body { padding:12px 14px; }
          .res { display:flex; align-items:baseline; gap:10px; text-align:left; background:#f8fafc;
            border:1.5px solid #e2e8f0; border-radius:10px; padding:10px 12px; cursor:pointer; }
          .res:hover { border-color:#42a5f5; }
          .res-name { font-weight:700; color:#0f172a; }
          .res-code { color:#64748b; font-size:12px; margin-left:auto; }
          #chart-title { font-size:16px; font-weight:800; color:#0f172a; margin-bottom:8px; }
          #price-line { font-size:20px; font-weight:800; margin-bottom:8px; min-height:28px; }
          #price-line .up { color:#d32f2f; }
          #price-line .down { color:#1976d2; }
          #price-line small { font-size:13px; font-weight:400; }
          .toolbar { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:8px; }
          .tab-tf { padding:5px 13px; border-radius:20px; border:1.5px solid #e2e8f0;
            background:#f8fafc; color:#64748b; font-size:12px; font-weight:600; cursor:pointer; }
          .tab-tf.active { background:linear-gradient(135deg,#1565c0,#42a5f5); color:#fff; border-color:transparent; }
          .zoom-btn { padding:5px 12px; border-radius:20px; border:1.5px solid #e2e8f0; background:#fff;
            color:#334155; font-size:12px; font-weight:800; cursor:pointer; }
          #candle-info { font-size:13px; color:#334155; margin-bottom:8px; min-height:20px; }
          stock-chart { display:block; width:100%; height:520px; }
          @media(max-width:600px){ stock-chart { height:380px; } }
          .empty { color:#94a3b8; padding:12px 0; text-align:center; font-size:13px; }
        </style>
        <div class="header">
          <button class="header-back" aria-label="Go home" title="홈으로">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
          </button>
          <div class="header-title">📉 종목 차트</div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-stock-chart.svg?style=plastic&amp;"/>
        </div>
        <div class="content">
          <div class="card">
            <div class="card-header">🔍 종목 검색</div>
            <div class="card-body">
              <div class="search-row">
                <input id="stock-search" type="search" placeholder="종목명 또는 코드 (예: 삼성전자)" autocomplete="off" />
                <button id="stock-search-btn">검색</button>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-body">
              <div id="chart-title">종목을 검색하세요</div>
              <div id="price-line"></div>
              <div class="toolbar">
                <button class="tab-tf" data-value="min:1">1분</button>
                <button class="tab-tf" data-value="min:5">5분</button>
                <button class="tab-tf active" data-value="day:1">일봉</button>
                <button class="tab-tf" data-value="week:1">주봉</button>
                <button class="tab-tf" data-value="month:1">월봉</button>
                <button class="tab-tf" data-value="year:1">연봉</button>
                <span style="flex:1"></span>
                <button class="zoom-btn" id="zoom-in">＋ 확대</button>
                <button class="zoom-btn" id="zoom-out">－ 축소</button>
                <button class="zoom-btn" id="zoom-reset">⤾ 전체</button>
              </div>
              <div id="candle-info">종목을 검색하세요</div>
              <stock-chart enabled-control enabled-readout></stock-chart>
            </div>
          </div>
        </div>
        <button class="share-fab" aria-label="공유하기" title="공유하기">🔗</button>
        <div class="modal-backdrop" id="search-modal">
          <div class="modal-panel" role="dialog" aria-modal="true">
            <div class="modal-bar">
              <span class="modal-title">종목 검색 결과</span>
              <button class="modal-close" id="search-close" aria-label="닫기">✕</button>
            </div>
            <div class="modal-body"><div id="search-results"></div></div>
          </div>
        </div>`;
    }
  }

  return tagName;
};
