import { elementDefine, onConnectedBodyShadow, onConnectedBefore, onConnectedAfter, onInitialize, addEventListener, addEventListenerDocument, innerHtml, setAttribute } from '@dooboostore/simple-web-component';
import { Router } from '@dooboostore/core-web';
import { inject } from '@dooboostore/simple-boot';
import { TossService, TossChartTimeframe } from '../../services/toss/TossService';

const tagName = 'center-stock-trading-simulation-page';

// ── 완전 초기값 (필드 초기값·초기화 공통 사용) ──
const DEFAULT_CANDLE_COUNT = 360;
const DEFAULT_TIMEFRAME: TossChartTimeframe = 'day:1';
const DEFAULT_CAPITAL = 100_000_000;
const DEFAULT_MA_CONFIGS = [
  { period: 5, color: '#ef4444', pyramiding: { golden: { action: 'buy' as const, percent: 15, candleFilter: 'bull' as const, volumeFilter: 'higher' as const, consecutive: 3, maxTrades: 2, trigger: 'event' as const, alignment: 'aligned' as const }, dead: { action: 'sell' as const, percent: 15, candleFilter: 'bear' as const, volumeFilter: 'any' as const, consecutive: 2, maxTrades: 2, trigger: 'event' as const, alignment: 'any' as const } } },
  { period: 20, color: '#f59e0b', pyramiding: { golden: { action: 'buy' as const, percent: 25, candleFilter: 'bull' as const, volumeFilter: 'higher' as const, consecutive: 3, maxTrades: 2, trigger: 'event' as const, alignment: 'aligned' as const }, dead: { action: 'sell' as const, percent: 25, candleFilter: 'bear' as const, volumeFilter: 'any' as const, consecutive: 2, maxTrades: 2, trigger: 'event' as const, alignment: 'any' as const } } },
  { period: 60, color: '#10b981', pyramiding: { golden: { action: 'buy' as const, percent: 30, candleFilter: 'bull' as const, volumeFilter: 'higher' as const, consecutive: 3, maxTrades: 2, trigger: 'event' as const, alignment: 'aligned' as const }, dead: { action: 'sell' as const, percent: 30, candleFilter: 'bear' as const, volumeFilter: 'any' as const, consecutive: 2, maxTrades: 2, trigger: 'event' as const, alignment: 'any' as const } } },
  { period: 120, color: '#6366f1', pyramiding: { golden: { action: 'buy' as const, percent: 50, candleFilter: 'bull' as const, volumeFilter: 'higher' as const, consecutive: 3, maxTrades: 2, trigger: 'event' as const, alignment: 'aligned' as const }, dead: { action: 'sell' as const, percent: 50, candleFilter: 'bear' as const, volumeFilter: 'any' as const, consecutive: 2, maxTrades: 2, trigger: 'event' as const, alignment: 'any' as const } } },
];
const DEFAULT_TP = { enabled: true, percent: 15, sellPercent: 80, skip: 5, candleFilter: 'bull' as const, volumeFilter: 'higher' as const };
const DEFAULT_SL = { enabled: true, percent: 10, sellPercent: 50, skip: 5, candleFilter: 'bear' as const, volumeFilter: 'lower' as const };
const DEFAULT_SHOW_CROSS = false;

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
    private currentCode = 'A005930';
    private currentName = '삼성전자';
    private chartCandles: { date: string; open: number; high: number; low: number; close: number; volume: number }[] = [];
    // --- 트레이딩 설정 (상수에서 초기화) ---
    private candleCount = DEFAULT_CANDLE_COUNT;
    private timeframe: TossChartTimeframe = DEFAULT_TIMEFRAME;
    private initialCapital = DEFAULT_CAPITAL;
    private maConfigs: { period: number; color: string; pyramiding: { golden: { action: 'buy'|'sell'; percent: number; candleFilter: 'any' | 'bull' | 'bear'; volumeFilter: 'any' | 'higher' | 'lower'; consecutive: number; maxTrades: number; trigger: 'state' | 'event'; alignment: 'any' | 'aligned' | 'reverse' }; dead: { action: 'buy'|'sell'; percent: number; candleFilter: 'any' | 'bull' | 'bear'; volumeFilter: 'any' | 'higher' | 'lower'; consecutive: number; maxTrades: number; trigger: 'state' | 'event'; alignment: 'any' | 'aligned' | 'reverse' } } }[] = JSON.parse(JSON.stringify(DEFAULT_MA_CONFIGS));
    // --- 익절/손절 (상수에서 초기화) ---
    private takeProfitEnabled = DEFAULT_TP.enabled;
    private takeProfitPercent = DEFAULT_TP.percent;
    private takeProfitSellPercent = DEFAULT_TP.sellPercent;
    private takeProfitSkip = DEFAULT_TP.skip;
    private takeProfitCandleFilter: 'any'|'bull'|'bear' = DEFAULT_TP.candleFilter;
    private takeProfitVolumeFilter: 'any'|'higher'|'lower' = DEFAULT_TP.volumeFilter;
    private showCross = DEFAULT_SHOW_CROSS;
    private stopLossEnabled = DEFAULT_SL.enabled;
    private stopLossPercent = DEFAULT_SL.percent;
    private stopLossSellPercent = DEFAULT_SL.sellPercent;
    private stopLossSkip = DEFAULT_SL.skip;
    private stopLossCandleFilter: 'any'|'bull'|'bear' = DEFAULT_SL.candleFilter;
    private stopLossVolumeFilter: 'any'|'higher'|'lower' = DEFAULT_SL.volumeFilter;
    // --- 시뮬레이션 결과 (마지막 계산값)
    private simCash = 0;
    private simShares = 0;
    private simFirstPrice = 0;
    private simLastPrice = 0;
    private simTrades: { idx: number; date: string; price: number; action: 'buy'|'sell'; maPeriod: number; percent: number; sharesDelta: number; amount: number; cashAfter: number; sharesAfter: number; label?: string; profitRate: number | null; avgPrice: number; holdingValue: number }[] = [];

    private restoreSimFromUrl() {
      try {
        const p = this.router?.getSearchParams?.();
        if (!p) return;
        const cap = p.get('cap');
        if (cap) { const v = Number(cap); if (Number.isFinite(v) && v >= 10000) this.initialCapital = Math.floor(v); }
        const cnt = p.get('cnt');
        if (cnt) { const v = Number(cnt); if (Number.isFinite(v) && v >= 30 && v <= 1000) this.candleCount = Math.floor(v); }
        const tf = p.get('tf');
        if (tf && /^(min:\d+|day:1|week:1|month:1)$/.test(tf)) this.timeframe = tf as TossChartTimeframe;
        const tpEn = p.get('tpEn'); if (tpEn) this.takeProfitEnabled = tpEn === '1';
        const tp = p.get('tp'); if (tp) { const v = Number(tp); if (Number.isFinite(v) && v >= 0 && v <= 100) this.takeProfitPercent = v; }
        const tpSell = p.get('tpSell'); if (tpSell) { const v = Number(tpSell); if (Number.isFinite(v) && v >= 1 && v <= 100) this.takeProfitSellPercent = Math.floor(v); }
        const tpSkip = p.get('tpSkip'); if (tpSkip) { const v = Number(tpSkip); if (Number.isFinite(v) && v >= 0 && v <= 20) this.takeProfitSkip = Math.floor(v); }
        const tpCandle = p.get('tpCandle'); if (tpCandle && ['any','bull','bear'].includes(tpCandle)) this.takeProfitCandleFilter = tpCandle as any;
        const tpVol = p.get('tpVol'); if (tpVol && ['any','higher','lower'].includes(tpVol)) this.takeProfitVolumeFilter = tpVol as any;
        const cross = p.get('cross'); if (cross) this.showCross = cross === '1';
        const slEn = p.get('slEn'); if (slEn) this.stopLossEnabled = slEn === '1';
        const sl = p.get('sl'); if (sl) { const v = Number(sl); if (Number.isFinite(v) && v >= 0 && v <= 100) this.stopLossPercent = v; }
        const slSell = p.get('slSell'); if (slSell) { const v = Number(slSell); if (Number.isFinite(v) && v >= 1 && v <= 100) this.stopLossSellPercent = Math.floor(v); }
        const slSkip = p.get('slSkip'); if (slSkip) { const v = Number(slSkip); if (Number.isFinite(v) && v >= 0 && v <= 20) this.stopLossSkip = Math.floor(v); }
        const slCandle = p.get('slCandle'); if (slCandle && ['any','bull','bear'].includes(slCandle)) this.stopLossCandleFilter = slCandle as any;
        const slVol = p.get('slVol'); if (slVol && ['any','higher','lower'].includes(slVol)) this.stopLossVolumeFilter = slVol as any;
        const mas = p.get('mas');
        if (mas) {
          try {
            const decoded = decodeURIComponent(mas);
            const arr = JSON.parse(decoded);
            if (Array.isArray(arr) && arr.length) {
              const valid = arr.filter((x: any) => x && typeof x.period === 'number' && typeof x.color === 'string' && x.pyramiding && x.pyramiding.golden && x.pyramiding.dead);
              if (valid.length) {
                const normCandle = (v: any) => v === 'bull' ? 'bull' : v === 'bear' ? 'bear' : 'any' as const;
                const normVol = (v: any) => v === 'higher' ? 'higher' : v === 'lower' ? 'lower' : 'any' as const;
                const normTrigger = (v: any) => v === 'state' ? 'state' : 'event' as const;
                const normAlign = (v: any) => v === 'aligned' ? 'aligned' : v === 'reverse' ? 'reverse' : 'any' as const;
                this.maConfigs = valid.map((x: any) => {
                  // 구 구조: consecutive/maxTrades/trigger가 루트에 있던 경우 호환
                  const g = x.pyramiding?.golden ?? {};
                  const d = x.pyramiding?.dead ?? {};
                  return {
                    period: Math.max(2, Math.min(500, Math.floor(Number(x.period)) || 10)),
                    color: typeof x.color === 'string' && /^#([0-9a-fA-F]{3,8})$/.test(x.color) ? x.color : '#6366f1',
                    pyramiding: {
                      golden: { action: g.action === 'sell' ? 'sell' : 'buy', percent: Math.max(0, Math.min(100, Number(g.percent) || 0)), candleFilter: normCandle(g.candleFilter ?? x.candleFilter), volumeFilter: normVol(g.volumeFilter), consecutive: Math.max(1, Math.min(10, Math.floor(Number(g.consecutive ?? x.consecutive)) || 2)), maxTrades: Math.max(1, Math.min(20, Math.floor(Number(g.maxTrades ?? x.maxTrades)) || 2)), trigger: normTrigger(g.trigger ?? x.trigger), alignment: normAlign(g.alignment) },
                      dead: { action: d.action === 'sell' ? 'sell' : 'buy', percent: Math.max(0, Math.min(100, Number(d.percent) || 0)), candleFilter: normCandle(d.candleFilter ?? x.candleFilter), volumeFilter: normVol(d.volumeFilter), consecutive: Math.max(1, Math.min(10, Math.floor(Number(d.consecutive ?? x.consecutive)) || 2)), maxTrades: Math.max(1, Math.min(20, Math.floor(Number(d.maxTrades ?? x.maxTrades)) || 2)), trigger: normTrigger(d.trigger ?? x.trigger), alignment: normAlign(d.alignment) },
                    },
                  };
                });
              }
            }
          } catch {}
        }
      } catch {}
    }

    private syncSimParamsToUrl() {
      try {
        const masStr = encodeURIComponent(JSON.stringify(this.maConfigs));
        this.router?.replaceUpsertSearchParam?.({
          cap: String(this.initialCapital), cnt: String(this.candleCount), tf: this.timeframe, mas: masStr,
          tpEn: this.takeProfitEnabled ? '1' : '0', tp: String(this.takeProfitPercent), tpSell: String(this.takeProfitSellPercent), tpSkip: String(this.takeProfitSkip), tpCandle: this.takeProfitCandleFilter, tpVol: this.takeProfitVolumeFilter,
          cross: this.showCross ? '1' : '0',
          slEn: this.stopLossEnabled ? '1' : '0', sl: String(this.stopLossPercent), slSell: String(this.stopLossSellPercent), slSkip: String(this.stopLossSkip), slCandle: this.stopLossCandleFilter, slVol: this.stopLossVolumeFilter,
        });
      } catch {}
    }

    private applySimConfigToForm() {
      const capEl = this.shadowRoot?.querySelector('#sim-capital') as HTMLInputElement;
      const cntEl = this.shadowRoot?.querySelector('#sim-candle-count') as HTMLInputElement;
      const tfEl = this.shadowRoot?.querySelector('#sim-timeframe') as HTMLSelectElement;
      if (capEl) capEl.value = String(this.initialCapital);
      if (cntEl) cntEl.value = String(this.candleCount);
      if (tfEl) tfEl.value = this.timeframe;
      const tpEnEl = this.shadowRoot?.querySelector('#sim-tp-enabled') as HTMLInputElement;
      const tpEl = this.shadowRoot?.querySelector('#sim-tp') as HTMLInputElement;
      const tpSellEl = this.shadowRoot?.querySelector('#sim-tp-sell') as HTMLInputElement;
      const tpSkipEl = this.shadowRoot?.querySelector('#sim-tp-skip') as HTMLInputElement;
      const tpCandleEl = this.shadowRoot?.querySelector('#sim-tp-candle') as HTMLSelectElement;
      const tpVolEl = this.shadowRoot?.querySelector('#sim-tp-volume') as HTMLSelectElement;
      const crossEl = this.shadowRoot?.querySelector('#sim-show-cross') as HTMLInputElement;
      const slEnEl = this.shadowRoot?.querySelector('#sim-sl-enabled') as HTMLInputElement;
      const slEl = this.shadowRoot?.querySelector('#sim-sl') as HTMLInputElement;
      const slSellEl = this.shadowRoot?.querySelector('#sim-sl-sell') as HTMLInputElement;
      const slSkipEl = this.shadowRoot?.querySelector('#sim-sl-skip') as HTMLInputElement;
      const slCandleEl = this.shadowRoot?.querySelector('#sim-sl-candle') as HTMLSelectElement;
      const slVolEl = this.shadowRoot?.querySelector('#sim-sl-volume') as HTMLSelectElement;
      if (tpEnEl) tpEnEl.checked = this.takeProfitEnabled;
      if (tpEl) tpEl.value = String(this.takeProfitPercent);
      if (tpSellEl) tpSellEl.value = String(this.takeProfitSellPercent);
      if (tpSkipEl) tpSkipEl.value = String(this.takeProfitSkip);
      if (tpCandleEl) tpCandleEl.value = this.takeProfitCandleFilter;
      if (tpVolEl) tpVolEl.value = this.takeProfitVolumeFilter;
      if (crossEl) crossEl.checked = this.showCross;
      if (slEnEl) slEnEl.checked = this.stopLossEnabled;
      if (slEl) slEl.value = String(this.stopLossPercent);
      if (slSellEl) slSellEl.value = String(this.stopLossSellPercent);
      if (slSkipEl) slSkipEl.value = String(this.stopLossSkip);
      if (slCandleEl) slCandleEl.value = this.stopLossCandleFilter;
      if (slVolEl) slVolEl.value = this.stopLossVolumeFilter;
    }

    @onInitialize
    async onInit(@inject(TossService.SYMBOL) tossService: TossService, router: Router) {
      this.tossService = tossService;
      this.router = router;
      this.restoreSimFromUrl();
      // 초기 파라미터 없으면 code처럼 바로 셋팅 (공유 URL에 기본값 포함)
      try {
        const p = router?.getSearchParams?.();
        const needInit = !p?.get('cap') || !p?.get('cnt') || !p?.get('tf') || !p?.get('mas');
        if (needInit) this.syncSimParamsToUrl();
      } catch {}
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

    private async loadStock(code: string, name: string) {
      this.currentCode = code;
      this.currentName = name;
      try {
        const cur = this.router?.getSearchParams?.()?.get('code');
        if (cur !== code) this.router?.replaceUpsertSearchParam?.({ code });
      } catch {}
      const searchInput = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      if (searchInput) searchInput.value = name;
      const titleEl = this.shadowRoot?.querySelector('#chart-title') as HTMLElement;
      const tfLabel = this.timeframe.replace('day:','일봉 ').replace('week:','주봉 ').replace('month:','월봉 ').replace('min:','분봉 ');
      if (titleEl) titleEl.textContent = `${name} (${code.replace(/^A/, '')}) · ${tfLabel} ${this.candleCount}개`;

      try {
        const chartRes = await this.tossService.getChart(code, { count: this.candleCount, timeframe: this.timeframe }).catch(() => null);
        const raw = chartRes?.candles ?? [];
        const isMin = this.timeframe.startsWith('min:');
        const isDayWeekMonth = this.timeframe === 'day:1' || this.timeframe === 'week:1' || this.timeframe === 'month:1';
        const sortedRaw = [...raw].sort((a, b) => a.dt.localeCompare(b.dt));
        const candles = sortedRaw.map(c => ({ date: isMin ? c.dt.slice(11, 16) : isDayWeekMonth ? c.dt.slice(5, 10) : c.dt, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
        this.chartCandles = candles;

        // 차트에 tick(골든/데드 크로스 시 line/tooltip 포함) + ma 주입
        const chartEl = this.shadowRoot?.querySelector('stock-chart') as HTMLElement;
        if (chartEl) {
          chartEl.innerHTML = this.buildTicksHtml(candles) + this.maConfigs.map(ma => `<ma color="${ma.color}" size="${ma.period}"></ma>`).join('');
        }
        this.updateResultDisplay();

        // 개요로 이름 재확정
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
              const tfLabel2 = this.timeframe.replace('day:','일봉 ').replace('week:','주봉 ').replace('month:','월봉 ').replace('min:','분봉 ');
              if (titleEl) titleEl.textContent = `${this.currentName} (${code.replace(/^A/, '')}) · ${tfLabel2} ${this.candleCount}개`;
            }
          } catch {}
        }
      } catch (e) { console.error(e); }
    }

    @addEventListener('.header-back', 'click')
    onBack() { this.router.go('/'); }

    @addEventListener('#stock-search-btn', 'click')
    onSearchBtn() { this.doSearch(); }

    private async doSearch() {
      const input = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      const q = input?.value.trim();
      if (!q) return;
      const list = await this.tossService.searchProduct(q);
      const box = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      if (!box) return;
      box.innerHTML = list.slice(0, 10).map(it => `
        <div class="search-item" data-code="${it.productCode}" data-name="${it.productName}">
          <div style="flex:1"><div style="font-weight:700;font-size:13px">${it.productName}</div><div style="font-size:11px;color:#64748b">${it.productCode} · ${it.market}</div></div>
          <div style="font-size:11px;color:#0ea5e9">선택</div>
        </div>`).join('') || `<div style="padding:12px;color:#64748b">결과 없음</div>`;
      box.classList.add('show');
    }

    @addEventListener('#stock-search', 'keydown')
    onSearchKey(e: KeyboardEvent) {
      if (e.key === 'Enter') { e.preventDefault(); this.doSearch(); }
      if (e.key === 'Escape') {
        const b = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
        b?.classList.remove('show');
      }
    }

    @addEventListener('#stock-search-clear', 'click')
    onClearSearch() {
      const input = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      if (input) input.value = '';
      const box = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      box?.classList.remove('show');
      input?.focus();
    }

    @addEventListenerDocument('click')
    onDocClick(e: MouseEvent) {
      const box = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      if (!box?.classList.contains('show')) return;
      const wrap = this.shadowRoot?.querySelector('.search-wrap') as HTMLElement;
      const target = e.target as Node;
      if (wrap && target.isConnected && wrap.contains(target)) return;
      box.classList.remove('show');
    }

    @addEventListener('#search-results', 'click', { delegate: true })
    onPick(e: Event) {
      const el = (e.target as HTMLElement).closest('.search-item') as HTMLElement;
      if (!el) return;
      const code = el.dataset.code!;
      const name = el.dataset.name!;
      const box = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      box?.classList.remove('show');
      const input = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      if (input) input.value = name;
      this.loadStock(code, name);
    }

    @onConnectedAfter
    onAfterConnected() {
      // URL에서 복원된 설정으로 폼/리스트 동기화
      this.applySimConfigToForm();
      this.renderMaList();
    }

    @addEventListener('#sim-config', 'change')
    onConfigFormChange() {
      const prevCount = this.candleCount;
      const prevTf = this.timeframe;
      this.syncConfigFromForm();
      this.syncSimParamsToUrl();
      if (prevCount !== this.candleCount || prevTf !== this.timeframe) {
        this.loadStock(this.currentCode, this.currentName);
      } else {
        this.syncMasToChart();
      }
    }

    @addEventListener('#sim-config', 'input')
    onConfigFormInput() {
      const prevCount = this.candleCount;
      const prevTf = this.timeframe;
      this.syncConfigFromForm();
      // input 중에는 URL 갱신 없이 차트만 갱신해 포커스 유지 (change에서 URL 반영)
      if (prevCount !== this.candleCount || prevTf !== this.timeframe) {
        this.loadStock(this.currentCode, this.currentName);
      } else {
        this.syncMasToChart();
      }
    }

    @addEventListener('#add-ma-btn', 'click')
    onAddMa() {
      const maxPeriod = this.maConfigs.length ? Math.max(...this.maConfigs.map(m => m.period)) : 0;
      const nextPeriod = Math.min(500, (maxPeriod || 0) + 10 || 10);
      const colors = ['#ef4444','#f59e0b','#10b981','#6366f1','#ec4899','#06b6d4'];
      const color = colors[this.maConfigs.length % colors.length];
      this.maConfigs.push({ period: nextPeriod, color, pyramiding: { golden: { action: 'buy', percent: 20, candleFilter: 'bull', volumeFilter: 'higher', consecutive: 2, maxTrades: 2, trigger: 'event', alignment: 'aligned' }, dead: { action: 'sell', percent: 20, candleFilter: 'bear', volumeFilter: 'any', consecutive: 2, maxTrades: 2, trigger: 'event', alignment: 'any' } } });
      this.renderMaList();
      this.syncConfigFromForm();
      this.syncSimParamsToUrl();
      this.syncMasToChart();
    }

    @addEventListener('#sim-preset-select', 'change')
    onPresetChange(e: Event) {
      const sel = e.target as HTMLSelectElement;
      const v = sel.value;
      if (!v) return;
      const isTp = v.startsWith('tp-');
      const isUp = v.endsWith('-up');
      // 기본 MA 4개는 유지하되 액션만 반전, TP/SL은 보유면 OFF
      const base = JSON.parse(JSON.stringify(DEFAULT_MA_CONFIGS)) as typeof this.maConfigs;
      const ma = base.map(m => {
        if (!isUp) {
          // 하락추매: 매수/매도 액션만 반전, 캔들/거래량/연속 등 조건은 유지
          m.pyramiding.golden.action = m.pyramiding.golden.action === 'buy' ? 'sell' : 'buy';
          m.pyramiding.dead.action = m.pyramiding.dead.action === 'buy' ? 'sell' : 'buy';
        }
        return m;
      });
      this.candleCount = DEFAULT_CANDLE_COUNT;
      this.timeframe = DEFAULT_TIMEFRAME;
      this.initialCapital = DEFAULT_CAPITAL;
      this.maConfigs = ma;
      this.takeProfitEnabled = isTp ? DEFAULT_TP.enabled : false;
      this.takeProfitPercent = DEFAULT_TP.percent;
      this.takeProfitSellPercent = DEFAULT_TP.sellPercent;
      this.takeProfitSkip = DEFAULT_TP.skip;
      this.takeProfitCandleFilter = DEFAULT_TP.candleFilter;
      this.takeProfitVolumeFilter = DEFAULT_TP.volumeFilter;
      this.stopLossEnabled = isTp ? DEFAULT_SL.enabled : false;
      this.stopLossPercent = DEFAULT_SL.percent;
      this.stopLossSellPercent = DEFAULT_SL.sellPercent;
      this.stopLossSkip = DEFAULT_SL.skip;
      this.stopLossCandleFilter = DEFAULT_SL.candleFilter;
      this.stopLossVolumeFilter = DEFAULT_SL.volumeFilter;
      this.showCross = DEFAULT_SHOW_CROSS;
      this.applySimConfigToForm();
      this.renderMaList();
      this.syncSimParamsToUrl();
      this.loadStock(this.currentCode, this.currentName);
      sel.value = '';
    }

    @addEventListener('#sim-reset-btn', 'click')
    onResetSim() {
      this.candleCount = DEFAULT_CANDLE_COUNT;
      this.timeframe = DEFAULT_TIMEFRAME;
      this.initialCapital = DEFAULT_CAPITAL;
      this.maConfigs = JSON.parse(JSON.stringify(DEFAULT_MA_CONFIGS));
      this.takeProfitEnabled = DEFAULT_TP.enabled;
      this.takeProfitPercent = DEFAULT_TP.percent;
      this.takeProfitSellPercent = DEFAULT_TP.sellPercent;
      this.takeProfitSkip = DEFAULT_TP.skip;
      this.takeProfitCandleFilter = DEFAULT_TP.candleFilter;
      this.takeProfitVolumeFilter = DEFAULT_TP.volumeFilter;
      this.showCross = DEFAULT_SHOW_CROSS;
      this.stopLossEnabled = DEFAULT_SL.enabled;
      this.stopLossPercent = DEFAULT_SL.percent;
      this.stopLossSellPercent = DEFAULT_SL.sellPercent;
      this.stopLossSkip = DEFAULT_SL.skip;
      this.stopLossCandleFilter = DEFAULT_SL.candleFilter;
      this.stopLossVolumeFilter = DEFAULT_SL.volumeFilter;
      this.applySimConfigToForm();
      this.renderMaList();
      this.syncSimParamsToUrl();
      this.loadStock(this.currentCode, this.currentName);
    }

    @addEventListener('#sim-share-fab', 'click')
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

    @addEventListener('#ma-list', 'click', { delegate: true })
    onRemoveMa(e: Event) {
      const btn = (e.target as HTMLElement).closest('.ma-remove') as HTMLElement;
      if (!btn) return;
      const idx = Number(btn.dataset.idx);
      if (Number.isFinite(idx)) {
        this.maConfigs.splice(idx, 1);
        this.renderMaList();
        this.syncConfigFromForm();
        this.syncSimParamsToUrl();
        this.syncMasToChart();
      }
    }

    private buildTicksHtml(candles: { date: string; open: number; high: number; low: number; close: number; volume: number }[]): string {
      // 이동평균별 MA 배열 미리 계산
      const maMap = new Map<number, (number | null)[]>();
      for (const ma of this.maConfigs) {
        const vals: (number | null)[] = [];
        let sum = 0;
        for (let i = 0; i < candles.length; i++) {
          sum += candles[i].close;
          if (i >= ma.period) sum -= candles[i - ma.period].close;
          vals.push(i >= ma.period - 1 ? sum / ma.period : null);
        }
        maMap.set(ma.period, vals);
      }
      const sortedMas = [...this.maConfigs].sort((a, b) => a.period - b.period);
      const isAligned = (idx: number): boolean => {
        const formed = sortedMas.map(ma => ({ period: ma.period, v: maMap.get(ma.period)![idx] }))
          .filter(x => x.v != null) as { period: number; v: number }[];
        if (formed.length < 2) return true;
        for (let k = 0; k < formed.length - 1; k++) {
          if (!(formed[k].v > formed[k + 1].v)) return false;
        }
        return true;
      };
      const isReverseAligned = (idx: number): boolean => {
        const formed = sortedMas.map(ma => ({ period: ma.period, v: maMap.get(ma.period)![idx] }))
          .filter(x => x.v != null) as { period: number; v: number }[];
        if (formed.length < 2) return true;
        for (let k = 0; k < formed.length - 1; k++) {
          if (!(formed[k].v < formed[k + 1].v)) return false;
        }
        return true;
      };

      // 시뮬레이션: 투자원금/보유주식 기반 피라미딩 + G/D 라인 (연속발생 N회 충족 시 매매) + 익절/손절 (평균단가 기준, 중복 방지)
      let cash = this.initialCapital;
      let shares = 0;
      let totalCost = 0;
      const trades: typeof this.simTrades = [];
      const tradeAtIdx: Map<number, { action: 'buy'|'sell'; label: string; color: string; position: string }[]> = new Map();
      const crossAtIdx: Map<number, { label: string; color: string }[]> = new Map();
      const goldenStreak = new Map<number, number>();
      const deadStreak = new Map<number, number>();
      const goldenTradeCnt = new Map<number, number>();
      const deadTradeCnt = new Map<number, number>();
      let maSkipRemaining = 0;

      for (let i = 1; i < candles.length; i++) {
        // 익절/손절 우선 체크 — 체결 시 해당 봉에서는 MA 매매 스킵 + 이후 N회 스킵 (중복 방지)
        if (shares > 0 && totalCost > 0) {
          const avg = totalCost / shares;
          const currClose = candles[i].close;
          const profitRate = ((currClose - avg) / avg) * 100;
          let shouldTP = this.takeProfitEnabled && profitRate >= this.takeProfitPercent;
          let shouldSL = this.stopLossEnabled && profitRate <= -this.stopLossPercent;
          // 익절 캔들/거래량 필터
          if (shouldTP) {
            if (this.takeProfitCandleFilter !== 'any') {
              const isBull = candles[i].close > candles[i].open;
              const isBear = candles[i].close < candles[i].open;
              if (this.takeProfitCandleFilter === 'bull' && !isBull) shouldTP = false;
              if (this.takeProfitCandleFilter === 'bear' && !isBear) shouldTP = false;
            }
            if (shouldTP && this.takeProfitVolumeFilter !== 'any' && i > 0) {
              if (this.takeProfitVolumeFilter === 'higher' && !(candles[i].volume > candles[i-1].volume)) shouldTP = false;
              if (this.takeProfitVolumeFilter === 'lower' && !(candles[i].volume < candles[i-1].volume)) shouldTP = false;
            }
          }
          if (shouldSL) {
            if (this.stopLossCandleFilter !== 'any') {
              const isBull = candles[i].close > candles[i].open;
              const isBear = candles[i].close < candles[i].open;
              if (this.stopLossCandleFilter === 'bull' && !isBull) shouldSL = false;
              if (this.stopLossCandleFilter === 'bear' && !isBear) shouldSL = false;
            }
            if (shouldSL && this.stopLossVolumeFilter !== 'any' && i > 0) {
              if (this.stopLossVolumeFilter === 'higher' && !(candles[i].volume > candles[i-1].volume)) shouldSL = false;
              if (this.stopLossVolumeFilter === 'lower' && !(candles[i].volume < candles[i-1].volume)) shouldSL = false;
            }
          }
          if (shouldTP || shouldSL) {
            const isTP = shouldTP;
            const sellPct = isTP ? this.takeProfitSellPercent : this.stopLossSellPercent;
            const sellShares = Math.floor(shares * (sellPct / 100));
            if (sellShares > 0) {
              const proceeds = sellShares * currClose;
              shares -= sellShares;
              cash += proceeds;
              totalCost -= sellShares * avg;
              if (shares === 0) totalCost = 0;
              const label = isTP ? '익' : '손';
              const color = isTP ? '#10b981' : '#ef4444';
              const profitRate = ((currClose - avg) / avg) * 100;
              const avgPriceAfter = shares > 0 ? totalCost / shares : 0;
              const holdingValue = shares * currClose;
              trades.push({ idx: trades.length + 1, date: candles[i].date, price: currClose, action: 'sell', maPeriod: 0, percent: sellPct, sharesDelta: sellShares, amount: proceeds, cashAfter: cash, sharesAfter: shares, label, profitRate, avgPrice: avgPriceAfter, holdingValue });
              const arr = tradeAtIdx.get(i) ?? [];
              arr.push({ action: 'sell', label, color, position: 'candle-top' });
              tradeAtIdx.set(i, arr);
              maSkipRemaining = isTP ? this.takeProfitSkip : this.stopLossSkip;
              continue; // MA 매매 스킵 (해당 봉 + 이후 N회)
            }
          }
        }
        // 익절/손절 이후 MA 스킵 카운트
        if (maSkipRemaining > 0) {
          maSkipRemaining--;
          continue;
        }
        for (const ma of sortedMas) {
          const vals = maMap.get(ma.period)!;
          const prevMA = vals[i - 1];
          const currMA = vals[i];
          if (prevMA == null || currMA == null) continue;
          const prevClose = candles[i - 1].close;
          const currClose = candles[i].close;
          const gTrig = ((ma.pyramiding.golden as any).trigger ?? (ma as any).trigger ?? 'event') as 'state' | 'event';
          const dTrig = ((ma.pyramiding.dead as any).trigger ?? (ma as any).trigger ?? 'event') as 'state' | 'event';
          const isAbove = currClose > currMA;
          const isBelow = currClose < currMA;
          const isCrossGolden = prevClose <= prevMA && currClose > currMA;
          const isCrossDead = prevClose >= prevMA && currClose < currMA;
          let sig: 'golden' | 'dead' | null = null;
          let sigTrigger: 'state' | 'event' = 'event';
          if (gTrig === 'state' ? isAbove : isCrossGolden) { sig = 'golden'; sigTrigger = gTrig; }
          else if (dTrig === 'state' ? isBelow : isCrossDead) { sig = 'dead'; sigTrigger = dTrig; }
          // G/D 라인/툴팁 — 발생시: 크로스 틱에만, 상태: 매 틱 상태 유지 시
          if (sig) {
            const isGolden = sig === 'golden';
            const crossLabel = isGolden ? 'G' : 'D';
            const crossColor = isGolden ? '#fbbf24' : '#f87171';
            const arrC = crossAtIdx.get(i) ?? [];
            if (!arrC.some(x => x.label === crossLabel)) {
              arrC.push({ label: crossLabel, color: crossColor });
              crossAtIdx.set(i, arrC);
            }
          }
          // 연속/최대: 골든/데드 각각 설정
          const need = Math.max(1, Math.min(10, sig === 'golden' ? ((ma.pyramiding.golden as any).consecutive ?? (ma as any).consecutive ?? 2) : ((ma.pyramiding.dead as any).consecutive ?? (ma as any).consecutive ?? 2)));
          const maxTrades = Math.max(1, Math.min(20, sig === 'golden' ? ((ma.pyramiding.golden as any).maxTrades ?? (ma as any).maxTrades ?? 2) : ((ma.pyramiding.dead as any).maxTrades ?? (ma as any).maxTrades ?? 2)));
          const triggerForNeed = sig ? (sig === 'golden' ? gTrig : dTrig) : 'event';
          // 발생시 + need>1이면 크로스 없는 유지 틱에서도 sig를 이어가야 하므로, sig가 없으면 상태 유지로 재평가
          if (!sig && triggerForNeed === 'event') {
            // 이 분기는 sig가 크로스 기반이라 유지 틱에서는 sig가 없지만, streak이 유지 중이면 이어가기
            const aboveStreak = goldenStreak.get(ma.period) ?? 0;
            const belowStreak = deadStreak.get(ma.period) ?? 0;
            if (isAbove && aboveStreak > 0) { sig = 'golden'; sigTrigger = gTrig; }
            else if (isBelow && belowStreak > 0) { sig = 'dead'; sigTrigger = dTrig; }
            else {
              if (!isAbove) goldenStreak.set(ma.period, 0);
              if (!isBelow) deadStreak.set(ma.period, 0);
              continue;
            }
          }
          if (!sig) continue;
          // 이동평균선 배열 조건 (골든/데드 각각)
          {
            const align = sig === 'golden' ? ((ma.pyramiding.golden as any).alignment ?? 'aligned') : ((ma.pyramiding.dead as any).alignment ?? 'any');
            if (align === 'aligned' && !isAligned(i)) {
              if (sig === 'golden') { goldenStreak.set(ma.period, 0); goldenTradeCnt.set(ma.period, 0); }
              else { deadStreak.set(ma.period, 0); deadTradeCnt.set(ma.period, 0); }
              continue;
            }
            if (align === 'reverse' && !isReverseAligned(i)) {
              if (sig === 'golden') { goldenStreak.set(ma.period, 0); goldenTradeCnt.set(ma.period, 0); }
              else { deadStreak.set(ma.period, 0); deadTradeCnt.set(ma.period, 0); }
              continue;
            }
          }
          const trigger = sigTrigger;
          if (trigger === 'event') {
            const aboveStreak = (goldenStreak.get(ma.period) ?? 0);
            const belowStreak = (deadStreak.get(ma.period) ?? 0);
            if (sig === 'golden') {
              const cur = isAbove ? aboveStreak + 1 : 1;
              goldenStreak.set(ma.period, cur);
              deadStreak.set(ma.period, 0);
              deadTradeCnt.set(ma.period, 0);
              if (cur < need) continue;
              if ((goldenTradeCnt.get(ma.period) ?? 0) >= maxTrades) continue;
            } else if (sig === 'dead') {
              const cur = isBelow ? belowStreak + 1 : 1;
              deadStreak.set(ma.period, cur);
              goldenStreak.set(ma.period, 0);
              goldenTradeCnt.set(ma.period, 0);
              if (cur < need) continue;
              if ((deadTradeCnt.get(ma.period) ?? 0) >= maxTrades) continue;
            } else {
              if (isAbove && aboveStreak > 0) {
                const cur = aboveStreak + 1;
                goldenStreak.set(ma.period, cur);
                if (cur < need) continue;
                if ((goldenTradeCnt.get(ma.period) ?? 0) >= maxTrades) continue;
                sig = 'golden';
              } else if (isBelow && belowStreak > 0) {
                const cur = belowStreak + 1;
                deadStreak.set(ma.period, cur);
                if (cur < need) continue;
                if ((deadTradeCnt.get(ma.period) ?? 0) >= maxTrades) continue;
                sig = 'dead';
              } else {
                if (!isAbove) { goldenStreak.set(ma.period, 0); goldenTradeCnt.set(ma.period, 0); }
                if (!isBelow) { deadStreak.set(ma.period, 0); deadTradeCnt.set(ma.period, 0); }
                continue;
              }
            }
          } else {
            if (sig === 'golden') {
              const cur = (goldenStreak.get(ma.period) ?? 0) + 1;
              goldenStreak.set(ma.period, cur);
              deadStreak.set(ma.period, 0);
              deadTradeCnt.set(ma.period, 0);
              if (cur < need) continue;
              if ((goldenTradeCnt.get(ma.period) ?? 0) >= maxTrades) continue;
            } else if (sig === 'dead') {
              const cur = (deadStreak.get(ma.period) ?? 0) + 1;
              deadStreak.set(ma.period, cur);
              goldenStreak.set(ma.period, 0);
              goldenTradeCnt.set(ma.period, 0);
              if (cur < need) continue;
              if ((deadTradeCnt.get(ma.period) ?? 0) >= maxTrades) continue;
            } else {
              if (!isAbove) { goldenStreak.set(ma.period, 0); goldenTradeCnt.set(ma.period, 0); }
              if (!isBelow) { deadStreak.set(ma.period, 0); deadTradeCnt.set(ma.period, 0); }
              continue;
            }
          }
          // 캔들 종료 타입 필터 (양봉/음봉) — 골든/데드 각각
          {
            const filter = sig === 'golden' ? (ma.pyramiding.golden.candleFilter ?? 'any') : (ma.pyramiding.dead.candleFilter ?? 'any');
            if (filter !== 'any') {
              const isBull = candles[i].close > candles[i].open;
              const isBear = candles[i].close < candles[i].open;
              if (filter === 'bull' && !isBull) continue;
              if (filter === 'bear' && !isBear) continue;
            }
          }
          // 거래량 필터 — 전거래량 대비 (골든/데드 각각)
          {
            const vFilter = sig === 'golden' ? (ma.pyramiding.golden.volumeFilter ?? 'any') : (ma.pyramiding.dead.volumeFilter ?? 'any');
            if (vFilter !== 'any' && i > 0) {
              const prevVol = candles[i - 1].volume;
              const curVol = candles[i].volume;
              if (vFilter === 'higher' && !(curVol > prevVol)) continue;
              if (vFilter === 'lower' && !(curVol < prevVol)) continue;
            }
          }
          // 실제 매수/매도 집행 (피라미딩 설정에 따름)
          const cfg = sig === 'golden' ? ma.pyramiding.golden : ma.pyramiding.dead;
          const pct = Math.max(0, Math.min(100, cfg.percent));
          if (pct <= 0) continue;
          if (cfg.action === 'buy') {
            const cost = Math.floor(cash * (pct / 100));
            if (cost < 1000 || cash < cost) continue;
            const buyShares = Math.floor(cost / currClose);
            if (buyShares <= 0) continue;
            const actualCost = buyShares * currClose;
            shares += buyShares;
            cash -= actualCost;
            totalCost += actualCost;
            const buyAvgPrice = shares > 0 ? totalCost / shares : 0;
            const buyHoldingValue = shares * currClose;
            trades.push({ idx: trades.length + 1, date: candles[i].date, price: currClose, action: 'buy', maPeriod: ma.period, percent: pct, sharesDelta: buyShares, amount: actualCost, cashAfter: cash, sharesAfter: shares, profitRate: null, avgPrice: buyAvgPrice, holdingValue: buyHoldingValue });
            const arr = tradeAtIdx.get(i) ?? [];
            arr.push({ action: 'buy', label: 'B', color: '#3b82f6', position: 'candle-top' });
            tradeAtIdx.set(i, arr);
            if (sig === 'golden') {
              const c = (goldenTradeCnt.get(ma.period) ?? 0) + 1;
              goldenTradeCnt.set(ma.period, c);
              if (c >= maxTrades) { goldenStreak.set(ma.period, 0); goldenTradeCnt.set(ma.period, 0); }
            } else {
              const c = (deadTradeCnt.get(ma.period) ?? 0) + 1;
              deadTradeCnt.set(ma.period, c);
              if (c >= maxTrades) { deadStreak.set(ma.period, 0); deadTradeCnt.set(ma.period, 0); }
            }
          } else {
            if (shares <= 0 || totalCost <= 0) continue;
            const sellShares = Math.floor(shares * (pct / 100));
            if (sellShares <= 0) continue;
            const avg = totalCost / shares;
            const profitRateSell = ((currClose - avg) / avg) * 100;
            const proceeds = sellShares * currClose;
            shares -= sellShares;
            cash += proceeds;
            totalCost -= sellShares * avg;
            if (shares === 0) totalCost = 0;
            const avgPriceAfterSell = shares > 0 ? totalCost / shares : 0;
            const holdingValueAfterSell = shares * currClose;
            trades.push({ idx: trades.length + 1, date: candles[i].date, price: currClose, action: 'sell', maPeriod: ma.period, percent: pct, sharesDelta: sellShares, amount: proceeds, cashAfter: cash, sharesAfter: shares, profitRate: profitRateSell, avgPrice: avgPriceAfterSell, holdingValue: holdingValueAfterSell });
            const arr = tradeAtIdx.get(i) ?? [];
            arr.push({ action: 'sell', label: 'S', color: '#ef4444', position: 'candle-bottom' });
            tradeAtIdx.set(i, arr);
            if (sig === 'golden') {
              const c = (goldenTradeCnt.get(ma.period) ?? 0) + 1;
              goldenTradeCnt.set(ma.period, c);
              if (c >= maxTrades) { goldenStreak.set(ma.period, 0); goldenTradeCnt.set(ma.period, 0); }
            } else {
              const c = (deadTradeCnt.get(ma.period) ?? 0) + 1;
              deadTradeCnt.set(ma.period, c);
              if (c >= maxTrades) { deadStreak.set(ma.period, 0); deadTradeCnt.set(ma.period, 0); }
            }
          }
        }
      }

      // 결과 저장 (보유주식수/평가금액/수익률 계산용)
      this.simCash = cash;
      this.simShares = shares;
      this.simFirstPrice = candles.length ? candles[0].close : 0;
      this.simLastPrice = candles.length ? candles[candles.length - 1].close : 0;
      this.simTrades = trades;

      return candles.map((c, i) => {
        const crosses = crossAtIdx.get(i) ?? [];
        const trades = tradeAtIdx.get(i) ?? [];
        // G/D: 크로스표시 체크 시에만 라인+라벨 생성
        const crossHtml = this.showCross ? crosses.map(x => `<line width="1" color="${x.color}"></line><tooltip position="${x.label==='G'?'bottom':'top'}" label="${x.label}" label-color="${x.color}" line-color="${x.color}"></tooltip>`).join('') : '';
        // B/S: 실제 체결 — 캔들 팁에 붙는 라벨 (fill로 강조, 라인 없음)
        const tradeHtml = trades.map(t => `<tooltip position="${t.position}" label="${t.label}" fill-color="${t.color}" label-color="#fff"></tooltip>`).join('');
        return `<candle date="${c.date}" open="${c.open}" high="${c.high}" low="${c.low}" close="${c.close}" volume="${c.volume}">${crossHtml}${tradeHtml}</candle>`;
      }).join('');
    }

    private syncMasToChart() {
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as HTMLElement;
      if (!chartEl || !this.chartCandles.length) return;
      chartEl.innerHTML = this.buildTicksHtml(this.chartCandles) + this.maConfigs.map(ma => `<ma color="${ma.color}" size="${ma.period}"></ma>`).join('');
      this.updateResultDisplay();
    }

    private updateResultDisplay() {
      const evalAmt = this.simCash + this.simShares * this.simLastPrice;
      const profit = evalAmt - this.initialCapital;
      const rate = this.initialCapital ? (profit / this.initialCapital) * 100 : 0;
      const fmt = (n: number) => Math.round(n).toLocaleString();
      const fmtRate = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
      const sharesEl = this.shadowRoot?.querySelector('#sim-shares') as HTMLElement;
      const evalEl = this.shadowRoot?.querySelector('#sim-eval') as HTMLElement;
      const rateEl = this.shadowRoot?.querySelector('#sim-rate') as HTMLElement;
      const cashEl = this.shadowRoot?.querySelector('#sim-cash') as HTMLElement;
      const holdingEl = this.shadowRoot?.querySelector('#sim-holding') as HTMLElement;
      const profitEl = this.shadowRoot?.querySelector('#sim-profit') as HTMLElement;
      const countEl = this.shadowRoot?.querySelector('#sim-trade-count') as HTMLElement;
      if (sharesEl) sharesEl.textContent = `${Math.floor(this.simShares).toLocaleString()}주`;
      if (evalEl) evalEl.textContent = `${fmt(evalAmt)}원`;
      if (rateEl) {
        rateEl.textContent = fmtRate(rate);
        rateEl.style.color = rate > 0 ? '#dc2626' : rate < 0 ? '#2563eb' : '#64748b';
      }
      if (cashEl) cashEl.textContent = `${fmt(this.simCash)}원`;
      if (holdingEl) holdingEl.textContent = `${fmt(Math.floor(this.simShares) * this.simLastPrice)}원`;
      if (profitEl) {
        profitEl.textContent = `${profit >= 0 ? '+' : ''}${fmt(profit)}원`;
        profitEl.style.color = profit > 0 ? '#dc2626' : profit < 0 ? '#2563eb' : '#64748b';
      }
      if (countEl) countEl.textContent = `${this.simTrades.length}건`;
      // 단순 보유(첫틱 종가 → 마지막틱 종가) 가정 수익률/평가액 — 거래 없어도 항상 표시
      const holdRate = this.simFirstPrice ? ((this.simLastPrice - this.simFirstPrice) / this.simFirstPrice) * 100 : 0;
      const holdEval = this.simFirstPrice ? Math.round(this.initialCapital * (this.simLastPrice / this.simFirstPrice)) : this.initialCapital;
      const holdRateEl = this.shadowRoot?.querySelector('#sim-hold-rate') as HTMLElement;
      const holdEvalEl = this.shadowRoot?.querySelector('#sim-hold-eval') as HTMLElement;
      const holdFirstEl = this.shadowRoot?.querySelector('#sim-hold-first') as HTMLElement;
      const holdLastEl = this.shadowRoot?.querySelector('#sim-hold-last') as HTMLElement;
      if (holdRateEl) {
        holdRateEl.textContent = this.simFirstPrice ? fmtRate(holdRate) : '-';
        holdRateEl.style.color = holdRate > 0 ? '#dc2626' : holdRate < 0 ? '#2563eb' : '#64748b';
      }
      if (holdEvalEl) holdEvalEl.textContent = this.simFirstPrice ? `${fmt(holdEval)}원` : '-';
      if (holdFirstEl) holdFirstEl.textContent = this.simFirstPrice ? `${fmt(this.simFirstPrice)}원` : '-';
      if (holdLastEl) holdLastEl.textContent = this.simLastPrice ? `${fmt(this.simLastPrice)}원` : '-';
      // 모달이 열려있으면 리스트도 갱신
      const modal = this.shadowRoot?.querySelector('#sim-history-modal') as HTMLElement;
      if (modal?.classList.contains('show')) this.renderHistoryList();
    }

    @addEventListener('#sim-history-btn', 'click')
    onHistoryOpen() {
      this.renderHistoryList();
      const modal = this.shadowRoot?.querySelector('#sim-history-modal') as HTMLElement;
      modal?.classList.add('show');
    }

    @addEventListener('#sim-history-close', 'click')
    onHistoryClose() {
      const modal = this.shadowRoot?.querySelector('#sim-history-modal') as HTMLElement;
      modal?.classList.remove('show');
    }

    @addEventListener('#sim-history-modal', 'click')
    onHistoryBackdrop(e: Event) {
      const modal = e.currentTarget as HTMLElement;
      if (e.target === modal) modal.classList.remove('show');
    }

    @addEventListenerDocument('keydown')
    onHistoryEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        const modal = this.shadowRoot?.querySelector('#sim-history-modal') as HTMLElement;
        if (modal?.classList.contains('show')) modal.classList.remove('show');
      }
    }

    private renderHistoryList() {
      const body = this.shadowRoot?.querySelector('#sim-history-body') as HTMLElement;
      if (!body) return;
      const fmtHold = (n: number) => Math.round(n).toLocaleString();
      const holdRate = this.simFirstPrice ? ((this.simLastPrice - this.simFirstPrice) / this.simFirstPrice) * 100 : 0;
      const holdEval = this.simFirstPrice ? Math.round(this.initialCapital * (this.simLastPrice / this.simFirstPrice)) : this.initialCapital;
      const holdHeader = this.simFirstPrice ? `<div style="padding:8px 14px;font-size:11px;color:#64748b;display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid #f1f5f9;background:#fffbeb"> <span>단순보유 <b style="color:${holdRate>0?'#dc2626':holdRate<0?'#2563eb':'#64748b'}">${holdRate>=0?'+':''}${holdRate.toFixed(2)}%</b> (${fmtHold(this.simFirstPrice)}원 → ${fmtHold(this.simLastPrice)}원)</span> <span>평가 <b style="color:#1e293b">${fmtHold(holdEval)}원</b></span> <span style="margin-left:auto;color:#94a3b8">첫틱~마지막틱 종가 기준</span></div>` : '';
      if (!this.simTrades.length) {
        body.innerHTML = `${holdHeader}<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px">체결된 거래가 없습니다.<br/>정렬(단기>장기 이동평균) 후 골든/데드 크로스에서만 체결됩니다.</div>`;
        return;
      }
      const fmt = (n: number) => Math.round(n).toLocaleString();
      const fmtDate = (s: string) => {
        if (s.includes('T')) {
          const d = s.slice(0, 10);
          const t = s.slice(11, 16);
          if (/^\d{2}:\d{2}$/.test(t)) return `${d} ${t}`;
          return d;
        }
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        return s.slice(0, 16);
      };
      const evalAmt = this.simCash + this.simShares * this.simLastPrice;
      const buyCnt = this.simTrades.filter(t=>t.action==='buy').length;
      const sellCnt = this.simTrades.filter(t=>t.action==='sell' && t.maPeriod!==0).length;
      const tpCnt = this.simTrades.filter(t=>(t as any).label==='익').length;
      const slCnt = this.simTrades.filter(t=>(t as any).label==='손').length;
      const holdingVal = Math.round(this.simShares * this.simLastPrice);
      body.innerHTML = `
        <div style="padding:8px 14px;font-size:11px;color:#64748b;display:flex;flex-direction:column;gap:4px;border-bottom:1px solid #f1f5f9;background:#f8fafc">
          <div style="display:flex;gap:8px;flex-wrap:wrap"><span>총 <b style="color:#1e293b">${this.simTrades.length}건</b> = 매수 <b style="color:#2563eb">${buyCnt}건</b> · 매도 <b style="color:#dc2626">${sellCnt}건</b> · 익절 <b style="color:#059669">${tpCnt}건</b> · 손절 <b style="color:#dc2626">${slCnt}건</b></span></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><span>최종 평가 <b style="color:#1e293b">${fmt(evalAmt)}원</b> = 보유주식 ${Math.floor(this.simShares).toLocaleString()}주 (${fmt(holdingVal)}원) + 현금 ${fmt(Math.round(this.simCash))}원</span></div>
        </div>
        <div style="overflow:auto;max-height:60vh">
        <table style="width:100%;border-collapse:collapse;font-size:11px;white-space:nowrap">
          <thead style="position:sticky;top:0;background:#fff;z-index:1">
            <tr style="color:#64748b;border-bottom:0px; solid #e2e8f0;background:#f8fafc">
              <th colspan="8" style="padding:6px 10px;text-align:center;font-weight:800;color:#334155;border-right:1px solid #e2e8f0">매매</th>
              <th colspan="5" style="padding:6px 10px;text-align:center;font-weight:800;color:#1e40af;background:#eef2ff">보유</th>
            </tr>
            <tr style="color:#64748b;border-bottom:1px solid #e2e8f0">
              <th style="padding:8px 10px;text-align:left">#</th><th style="padding:8px 10px;text-align:left">날짜</th><th style="padding:8px 10px;text-align:center">구분</th><th style="padding:8px 10px;text-align:center">MA</th><th style="padding:8px 10px;text-align:right">매매시 시세</th><th style="padding:8px 10px;text-align:right">수량</th><th style="padding:8px 10px;text-align:right">금액</th><th style="padding:8px 10px;text-align:right">수익률</th><th style="padding:8px 10px;text-align:right;background:#eef2ee">거래후 보유주식</th><th style="padding:8px 10px;text-align:right;background:#eef2ee">평가금액</th><th style="padding:8px 10px;text-align:right;background:#eef2ee">주당평균가격</th><th style="padding:8px 10px;text-align:right;background:#eef2ee">현금</th><th style="padding:8px 10px;text-align:right;background:#eef2ee">총자산</th>
            </tr>
          </thead>
          <tbody>
            ${this.simTrades.map((t, i) => {
              const isTpSl = t.maPeriod === 0;
              const isTp = (t as any).label === '익';
              const badgeText = isTpSl ? (isTp ? '익절' : '손절') : (t.action==='buy'?'매수 B':'매도 S');
              const badgeBg = isTpSl ? (isTp ? '#10b981' : '#ef4444') : (t.action==='buy'?'#3b82f6':'#ef4444');
              const maText = isTpSl ? `${isTp ? '익절' : '손절'} ${t.percent}%` : `MA${t.maPeriod} ${t.percent}%`;
              const profitText = t.profitRate == null ? '-' : `${t.profitRate >= 0 ? '+' : ''}${t.profitRate.toFixed(2)}%`;
              const profitColor = t.profitRate == null ? '#94a3b8' : t.profitRate > 0 ? '#dc2626' : t.profitRate < 0 ? '#2563eb' : '#64748b';
              const avgPriceText = t.sharesAfter > 0 ? `${fmt(Math.round(t.avgPrice))}원` : '-';
              const holdingValText = `${fmt(Math.round(t.holdingValue))}원`;
              const total = Math.round(t.cashAfter + t.holdingValue);
              const prevTotal = i === 0 ? this.initialCapital : Math.round(this.simTrades[i-1].cashAfter + this.simTrades[i-1].holdingValue);
              const totalColor = total > prevTotal ? '#dc2626' : total < prevTotal ? '#2563eb' : '#1e293b';
              return `
              <tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:7px 10px;color:#94a3b8">${t.idx}</td>
                <td style="padding:7px 10px">${fmtDate(t.date)}</td>
                <td style="padding:7px 10px;text-align:center"><span style="display:inline-block;min-width:42px;padding:2px 6px;border-radius:999px;font-weight:700;font-size:10px;color:#fff;background:${badgeBg}">${badgeText}</span></td>
                <td style="padding:7px 10px;text-align:center;color:#64748b">${maText}</td>
                <td style="padding:7px 10px;text-align:right">${fmt(t.price)}원</td>
                <td style="padding:7px 10px;text-align:right">${Math.floor(t.sharesDelta).toLocaleString()}주</td>
                <td style="padding:7px 10px;text-align:right">${fmt(t.amount)}원</td>
                <td style="padding:7px 10px;text-align:right;color:${profitColor};font-weight:700">${profitText}</td>
                <td style="padding:7px 10px;text-align:right">${Math.floor(t.sharesAfter).toLocaleString()}주</td>
                <td style="padding:7px 10px;text-align:right">${holdingValText}</td>
                <td style="padding:7px 10px;text-align:right">${avgPriceText}</td>
                <td style="padding:7px 10px;text-align:right">${fmt(t.cashAfter)}원</td>
                <td style="padding:7px 10px;text-align:right;font-weight:700;color:${totalColor}">${fmt(total)}원</td>
              </tr>
              `; }).join('')}
          </tbody>
        </table>
        </div>`;
    }

    private syncConfigFromForm() {
      const capEl = this.shadowRoot?.querySelector('#sim-capital') as HTMLInputElement;
      const cntEl = this.shadowRoot?.querySelector('#sim-candle-count') as HTMLInputElement;
      const tfEl = this.shadowRoot?.querySelector('#sim-timeframe') as HTMLSelectElement;
      if (capEl) {
        const v = Number(capEl.value.replace(/,/g, ''));
        if (Number.isFinite(v)) this.initialCapital = Math.max(10000, Math.floor(v));
      }
      if (cntEl) {
        const v = Number(cntEl.value);
        if (Number.isFinite(v)) this.candleCount = Math.max(30, Math.min(1000, Math.floor(v)));
      }
      if (tfEl && tfEl.value) this.timeframe = tfEl.value as TossChartTimeframe;
      // MA rows
      const rows = this.shadowRoot?.querySelectorAll('#ma-list .ma-row');
      if (rows) {
        const newConfigs: typeof this.maConfigs = [];
        rows.forEach((row: any) => {
          const period = Number(row.querySelector('.ma-period')?.value) || 0;
          const goldenAct = (row.querySelector('.ma-golden-action') as HTMLSelectElement)?.value as 'buy'|'sell' || 'buy';
          const goldenPct = Number((row.querySelector('.ma-golden-pct') as HTMLInputElement)?.value) || 0;
          const goldenCandle = (row.querySelector('.ma-golden-candle') as HTMLSelectElement)?.value as 'any'|'bull'|'bear' || 'any';
          const goldenVol = (row.querySelector('.ma-golden-volume') as HTMLSelectElement)?.value as 'any'|'higher'|'lower' || 'any';
          const goldenCon = Number(row.querySelector('.ma-golden-consecutive')?.value) || 2;
          const goldenMax = Number(row.querySelector('.ma-golden-max')?.value) || 2;
          const goldenTrig = (row.querySelector('.ma-golden-trigger') as HTMLSelectElement)?.value as 'state'|'event' || 'event';
          const goldenAlign = (row.querySelector('.ma-golden-alignment') as HTMLSelectElement)?.value as 'any'|'aligned'|'reverse' || 'aligned';
          const deadAct = (row.querySelector('.ma-dead-action') as HTMLSelectElement)?.value as 'buy'|'sell' || 'sell';
          const deadPct = Number((row.querySelector('.ma-dead-pct') as HTMLInputElement)?.value) || 0;
          const deadCandle = (row.querySelector('.ma-dead-candle') as HTMLSelectElement)?.value as 'any'|'bull'|'bear' || 'any';
          const deadVol = (row.querySelector('.ma-dead-volume') as HTMLSelectElement)?.value as 'any'|'higher'|'lower' || 'any';
          const deadCon = Number(row.querySelector('.ma-dead-consecutive')?.value) || 2;
          const deadMax = Number(row.querySelector('.ma-dead-max')?.value) || 2;
          const deadTrig = (row.querySelector('.ma-dead-trigger') as HTMLSelectElement)?.value as 'state'|'event' || 'event';
          const deadAlign = (row.querySelector('.ma-dead-alignment') as HTMLSelectElement)?.value as 'any'|'aligned'|'reverse' || 'any';
          const color = row.querySelector('.ma-color')?.getAttribute('data-color') || '#6366f1';
          if (period > 0) newConfigs.push({ period, color, pyramiding: { golden: { action: goldenAct, percent: Math.max(0, Math.min(100, goldenPct)), candleFilter: goldenCandle === 'bull' ? 'bull' : goldenCandle === 'bear' ? 'bear' : 'any', volumeFilter: goldenVol === 'higher' ? 'higher' : goldenVol === 'lower' ? 'lower' : 'any', consecutive: Math.max(1, Math.min(10, Math.floor(goldenCon) || 2)), maxTrades: Math.max(1, Math.min(20, Math.floor(goldenMax) || 2)), trigger: goldenTrig === 'state' ? 'state' : 'event', alignment: goldenAlign === 'reverse' ? 'reverse' : goldenAlign === 'any' ? 'any' : 'aligned' }, dead: { action: deadAct, percent: Math.max(0, Math.min(100, deadPct)), candleFilter: deadCandle === 'bull' ? 'bull' : deadCandle === 'bear' ? 'bear' : 'any', volumeFilter: deadVol === 'higher' ? 'higher' : deadVol === 'lower' ? 'lower' : 'any', consecutive: Math.max(1, Math.min(10, Math.floor(deadCon) || 2)), maxTrades: Math.max(1, Math.min(20, Math.floor(deadMax) || 2)), trigger: deadTrig === 'state' ? 'state' : 'event', alignment: deadAlign === 'reverse' ? 'reverse' : deadAlign === 'aligned' ? 'aligned' : 'any' } } });
        });
        if (newConfigs.length) this.maConfigs = newConfigs;
      }
      // 익절/손절
      const tpEnEl = this.shadowRoot?.querySelector('#sim-tp-enabled') as HTMLInputElement;
      const tpEl = this.shadowRoot?.querySelector('#sim-tp') as HTMLInputElement;
      const tpSellEl = this.shadowRoot?.querySelector('#sim-tp-sell') as HTMLInputElement;
      const tpSkipEl = this.shadowRoot?.querySelector('#sim-tp-skip') as HTMLInputElement;
      const tpCandleEl = this.shadowRoot?.querySelector('#sim-tp-candle') as HTMLSelectElement;
      const tpVolEl = this.shadowRoot?.querySelector('#sim-tp-volume') as HTMLSelectElement;
      const slEnEl = this.shadowRoot?.querySelector('#sim-sl-enabled') as HTMLInputElement;
      const slEl = this.shadowRoot?.querySelector('#sim-sl') as HTMLInputElement;
      const slSellEl = this.shadowRoot?.querySelector('#sim-sl-sell') as HTMLInputElement;
      const slSkipEl = this.shadowRoot?.querySelector('#sim-sl-skip') as HTMLInputElement;
      const slCandleEl = this.shadowRoot?.querySelector('#sim-sl-candle') as HTMLSelectElement;
      const slVolEl = this.shadowRoot?.querySelector('#sim-sl-volume') as HTMLSelectElement;
      if (tpEnEl) this.takeProfitEnabled = !!tpEnEl.checked;
      if (tpEl) { const v = Number(tpEl.value); if (Number.isFinite(v) && v >= 1 && v <= 100) this.takeProfitPercent = Math.floor(v); }
      if (tpSellEl) { const v = Number(tpSellEl.value); if (Number.isFinite(v) && v >= 1 && v <= 100) this.takeProfitSellPercent = Math.floor(v); }
      if (tpSkipEl) { const v = Number(tpSkipEl.value); if (Number.isFinite(v) && v >= 0 && v <= 20) this.takeProfitSkip = Math.floor(v); }
      if (tpCandleEl && ['any','bull','bear'].includes(tpCandleEl.value)) this.takeProfitCandleFilter = tpCandleEl.value as any;
      if (tpVolEl && ['any','higher','lower'].includes(tpVolEl.value)) this.takeProfitVolumeFilter = tpVolEl.value as any;
      if (slEnEl) this.stopLossEnabled = !!slEnEl.checked;
      if (slEl) { const v = Number(slEl.value); if (Number.isFinite(v) && v >= 1 && v <= 100) this.stopLossPercent = Math.floor(v); }
      if (slSellEl) { const v = Number(slSellEl.value); if (Number.isFinite(v) && v >= 1 && v <= 100) this.stopLossSellPercent = Math.floor(v); }
      if (slSkipEl) { const v = Number(slSkipEl.value); if (Number.isFinite(v) && v >= 0 && v <= 20) this.stopLossSkip = Math.floor(v); }
      if (slCandleEl && ['any','bull','bear'].includes(slCandleEl.value)) this.stopLossCandleFilter = slCandleEl.value as any;
      if (slVolEl && ['any','higher','lower'].includes(slVolEl.value)) this.stopLossVolumeFilter = slVolEl.value as any;
      const crossEl = this.shadowRoot?.querySelector('#sim-show-cross') as HTMLInputElement;
      if (crossEl) this.showCross = !!crossEl.checked;
    }

    private renderMaList() {
      const list = this.shadowRoot?.querySelector('#ma-list') as HTMLElement;
      if (!list) return;
      // 포커스 유지: 이미 렌더된 경우 값만 갱신해 포커스/커서 유지
      if (list.children.length === this.maConfigs.length && list.children.length > 0) {
        const active = this.shadowRoot?.activeElement as HTMLElement | null;
        this.maConfigs.forEach((ma, idx) => {
          const row = list.children[idx] as HTMLElement;
          if (!row) return;
          const setVal = (sel: string, val: string) => {
            const el = row.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null;
            if (!el) return;
            if (el === active) return; // 포커스 중인 입력은 건드리지 않음
            if ((el as HTMLInputElement).value !== val) (el as HTMLInputElement).value = val;
          };
          const setSel = (sel: string, val: string) => {
            const el = row.querySelector(sel) as HTMLSelectElement | null;
            if (!el || el === active) return;
            if (el.value !== val) el.value = val;
          };
          const colorEl = row.querySelector('.ma-color') as HTMLElement | null;
          if (colorEl) { colorEl.setAttribute('data-color', ma.color); (colorEl as HTMLElement).style.background = ma.color; }
          setVal('.ma-period', String(ma.period));
          setVal('.ma-golden-consecutive', String(ma.pyramiding.golden.consecutive ?? 2));
          setVal('.ma-golden-max', String(ma.pyramiding.golden.maxTrades ?? 2));
          setSel('.ma-golden-trigger', ma.pyramiding.golden.trigger);
          setSel('.ma-golden-candle', ma.pyramiding.golden.candleFilter);
          setSel('.ma-golden-volume', ma.pyramiding.golden.volumeFilter);
          setSel('.ma-golden-action', ma.pyramiding.golden.action);
          setVal('.ma-golden-pct', String(ma.pyramiding.golden.percent));
          setSel('.ma-golden-alignment', ma.pyramiding.golden.alignment);
          setVal('.ma-dead-consecutive', String(ma.pyramiding.dead.consecutive ?? 2));
          setVal('.ma-dead-max', String(ma.pyramiding.dead.maxTrades ?? 2));
          setSel('.ma-dead-trigger', ma.pyramiding.dead.trigger);
          setSel('.ma-dead-candle', ma.pyramiding.dead.candleFilter);
          setSel('.ma-dead-volume', ma.pyramiding.dead.volumeFilter);
          setSel('.ma-dead-action', ma.pyramiding.dead.action);
          setVal('.ma-dead-pct', String(ma.pyramiding.dead.percent));
          setSel('.ma-dead-alignment', ma.pyramiding.dead.alignment);
        });
        return;
      }
      list.innerHTML = this.maConfigs.map((ma, idx) => `
        <div class="ma-row" data-idx="${idx}">
          <div class="ma-row-head">
            <div class="ma-identity">
              <span class="ma-color" data-color="${ma.color}" style="background:${ma.color}"></span>
              <input class="ma-period" type="number" min="2" max="500" style="font-size: 16px;" value="${ma.period}" title="틱수" />
              <span class="ma-unit">MA</span>
            </div>
            <button type="button" class="ma-remove" data-idx="${idx}" title="삭제">✕</button>
          </div>
          <div class="ma-row-fields">
            <div class="ma-field">
              <div class="ma-field-head"><span class="ma-field-label golden">골든</span><div class="ma-action-box"><select class="ma-golden-action"><option value="buy" ${ma.pyramiding.golden.action==='buy'?'selected':''}>매수</option><option value="sell" ${ma.pyramiding.golden.action==='sell'?'selected':''}>매도</option></select><input class="ma-golden-pct" type="number" min="1" max="100" value="${ma.pyramiding.golden.percent}" style="font-size: 16px;" /><span class="pct">%</span></div></div>
              <div class="ma-field-opts">
                <label class="ma-mini-opt ma-mini-opt--grouped" title="크로스 후 상태가 몇 봉 연속 유지돼야 매매할지, 이후 최대 몇 번까지 분할 매매할지"><span class="ma-mini-group">연속발생 <input class="ma-golden-consecutive" type="number" min="1" max="10" style="font-size: 16px;" value="${ma.pyramiding.golden.consecutive ?? 2}" />회</span><span class="ma-mini-group">최대 <input class="ma-golden-max" type="number" min="1" max="20" style="font-size: 16px;" value="${ma.pyramiding.golden.maxTrades ?? 2}" />회 매매</span></label>
                <label class="ma-mini-opt" title="상태면 종가가 MA 위/아래에 머무는 동안 매 틱 매매, 발생시는 크로스 순간에만">지속 <select class="ma-golden-trigger"><option value="event" ${ma.pyramiding.golden.trigger==='event'?'selected':''}>발생시</option><option value="state" ${ma.pyramiding.golden.trigger==='state'?'selected':''}>상태</option></select></label>
                <label class="ma-mini-opt">캔들 <select class="ma-golden-candle"><option value="any" ${ma.pyramiding.golden.candleFilter==='any'?'selected':''}>무관</option><option value="bull" ${ma.pyramiding.golden.candleFilter==='bull'?'selected':''}>양봉일때</option><option value="bear" ${ma.pyramiding.golden.candleFilter==='bear'?'selected':''}>음봉일때</option></select></label>
                <label class="ma-mini-opt">거래량 <select class="ma-golden-volume"><option value="any" ${ma.pyramiding.golden.volumeFilter==='any'?'selected':''}>무관</option><option value="higher" ${ma.pyramiding.golden.volumeFilter==='higher'?'selected':''}>이전보다 높을때</option><option value="lower" ${ma.pyramiding.golden.volumeFilter==='lower'?'selected':''}>이전보다 낮을때</option></select></label>
                <label class="ma-mini-opt">이동평균선 <select class="ma-golden-alignment"><option value="any" ${ma.pyramiding.golden.alignment==='any'?'selected':''}>무관</option><option value="aligned" ${(ma.pyramiding.golden.alignment ?? 'aligned')==='aligned'?'selected':''}>정배열</option><option value="reverse" ${ma.pyramiding.golden.alignment==='reverse'?'selected':''}>역배열</option></select></label>
              </div>
            </div>
            <div class="ma-field">
              <div class="ma-field-head"><span class="ma-field-label dead">데드</span><div class="ma-action-box"><select class="ma-dead-action"><option value="buy" ${ma.pyramiding.dead.action==='buy'?'selected':''}>매수</option><option value="sell" ${ma.pyramiding.dead.action==='sell'?'selected':''}>매도</option></select><input class="ma-dead-pct" type="number" min="1" max="100" value="${ma.pyramiding.dead.percent}" style="font-size: 16px;" /><span class="pct">%</span></div></div>
              <div class="ma-field-opts">
                <label class="ma-mini-opt ma-mini-opt--grouped" title="크로스 후 상태가 몇 봉 연속 유지돼야 매매할지, 이후 최대 몇 번까지 분할 매매할지"><span class="ma-mini-group">연속발생 <input class="ma-dead-consecutive" type="number" min="1" max="10" value="${ma.pyramiding.dead.consecutive ?? 2}" style="font-size: 16px;"/>회</span><span class="ma-mini-group">최대 <input class="ma-dead-max" type="number" min="1" max="20" value="${ma.pyramiding.dead.maxTrades ?? 2}" style="font-size: 16px;"/>회 매매</span></label>
                <label class="ma-mini-opt">지속 <select class="ma-dead-trigger"><option value="event" ${ma.pyramiding.dead.trigger==='event'?'selected':''}>발생시</option><option value="state" ${ma.pyramiding.dead.trigger==='state'?'selected':''}>상태</option></select></label>
                <label class="ma-mini-opt">캔들 <select class="ma-dead-candle"><option value="any" ${ma.pyramiding.dead.candleFilter==='any'?'selected':''}>무관</option><option value="bull" ${ma.pyramiding.dead.candleFilter==='bull'?'selected':''}>양봉일때</option><option value="bear" ${ma.pyramiding.dead.candleFilter==='bear'?'selected':''}>음봉일때</option></select></label>
                <label class="ma-mini-opt">거래량 <select class="ma-dead-volume"><option value="any" ${ma.pyramiding.dead.volumeFilter==='any'?'selected':''}>무관</option><option value="higher" ${ma.pyramiding.dead.volumeFilter==='higher'?'selected':''}>이전보다 높을때</option><option value="lower" ${ma.pyramiding.dead.volumeFilter==='lower'?'selected':''}>이전보다 낮을때</option></select></label>
                <label class="ma-mini-opt">이동평균선 <select class="ma-dead-alignment"><option value="any" ${ma.pyramiding.dead.alignment==='any'?'selected':''}>무관</option><option value="aligned" ${ma.pyramiding.dead.alignment==='aligned'?'selected':''}>정배열</option><option value="reverse" ${ma.pyramiding.dead.alignment==='reverse'?'selected':''}>역배열</option></select></label>
              </div>
            </div>
          </div>
        </div>
      `).join('');
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
          .search-wrap input{flex:1;min-width:0;height:30px;padding:0 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.4);outline:none;font-size:12px;background:#fff;box-sizing:border-box}
          .search-wrap input:focus{border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,0.25)}
          .search-wrap button,.search-clear{height:30px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.35);background:rgba(255,255,255,0.2);color:#fff;font-weight:600;cursor:pointer;font-size:12px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center}
          .search-wrap button:hover,.search-clear:hover{background:rgba(255,255,255,0.35)}
          .search-results{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);overflow:hidden;display:none;z-index:10;color:#334155}
          .search-results.show{display:block}
          .search-item{padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f1f5f9;color:#334155}
          .search-item:hover{background:#f8fafc}
          .chart-wrap{height:340px;padding:4px 12px 8px}
          @media(max-width:600px){ .chart-wrap{height:280px} }
          stock-chart{width:100%;height:100%;display:block}
          .config-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
          @media(max-width:600px){ .config-grid{grid-template-columns:1fr} }
          .config-field{display:flex;flex-direction:column;gap:4px}
          .config-field label{font-size:11px;font-weight:700;color:#64748b}
          .config-field input,.config-field select{height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff}
          .config-field input:focus,.config-field select:focus{border-color:#f59e0b}
          .ma-list{display:flex;flex-direction:column;gap:14px;margin-top:12px}
          .ma-row{display:flex;flex-direction:column;gap:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:18px;padding:16px;box-shadow:0 2px 10px rgba(251,191,36,0.07)}
          .ma-row-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
          .ma-identity{display:flex;align-items:center;gap:10px}
          .ma-color{width:18px;height:18px;border-radius:50%;flex-shrink:0;border:2.5px solid #fff;box-shadow:0 0 0 2px #fbbf24}
          .ma-period{width:60px;height:36px;text-align:center;font-weight:800;font-size:15px;border-radius:10px;border:1.5px solid #f59e0b;background:#fff;outline:none;box-shadow:0 1px 2px rgba(0,0,0,0.04)}
          .ma-period:focus{border-color:#d97706;box-shadow:0 0 0 3px #fef3c7}
          .ma-unit{font-size:12px;color:#92400e;font-weight:800;letter-spacing:0.04em}
          .ma-remove{width:32px;height:32px;border-radius:10px;border:1px solid #fecaca;background:#fff;color:#fca5a5;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;transition:all .15s}
          .ma-remove:hover{background:#fef2f2;color:#ef4444;border-color:#fca5a5}
          .ma-row-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}
          .ma-field{display:flex;flex-direction:column;gap:10px;background:#fff;border:1px solid #fde68a;border-radius:14px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,0.03)}
          .ma-field-head{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;min-width:0}
          .ma-field-label{font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px;min-width:38px;text-align:center;letter-spacing:0.02em;flex-shrink:0}
          .ma-field-label.golden{background:#dcfce7;color:#166534;border:1px solid #bbf7d0}
          .ma-field-label.dead{background:#fee2e2;color:#991b1b;border:1px solid #fecaca}
          .ma-action-box{flex:1;display:inline-flex;align-items:center;gap:6px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:4px 6px;min-width:0;flex-wrap:nowrap;white-space:nowrap}
          .ma-action-box select{flex:1;min-width:64px;max-width:90px;height:28px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;font-weight:700;background:#fff;padding:0 6px}
          .ma-action-box input{flex:0 0 52px;width:52px;height:28px;border-radius:8px;border:1px solid #e2e8f0;font-size:13px;font-weight:800;text-align:center;background:#fff}
          .ma-action-box .pct{font-size:11px;color:#92400e;font-weight:800;flex-shrink:0}
          .ma-field-opts{display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:start}
          .ma-field-opts .ma-mini-opt:first-child{grid-column:1 / -1}
          .ma-field-opts .ma-mini-opt:last-child:nth-child(even){grid-column:1 / -1}
          .ma-mini-opt{display:flex;align-items:center;gap:6px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:6px 8px;font-size:10px;font-weight:700;color:#78350f;transition:border-color .15s;min-width:0;overflow:hidden;flex-wrap:wrap}
          .ma-mini-opt--grouped{gap:14px;justify-content:space-between}
          .ma-mini-group{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
          .ma-mini-opt:hover{border-color:#fcd34d}
          .ma-mini-opt span{white-space:nowrap;flex-shrink:0}
          .ma-mini-opt input{width:36px;height:26px;text-align:center;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;font-weight:800;background:#fff;flex-shrink:0}
          .ma-mini-opt select{flex:1;min-width:60px;max-width:100%;height:26px;border-radius:8px;border:1px solid #e2e8f0;font-size:10px;font-weight:700;background:#fff;padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
          #stock-search {font-size: 16px !important;}
          @media(max-width:600px){
            .ma-row{padding:12px}
            .ma-row-fields{grid-template-columns:1fr}
            .ma-field{padding:10px}
            .ma-field-opts{grid-template-columns:1fr}
            .ma-field-opts .ma-mini-opt:first-child{grid-column:auto}
            .ma-field-opts .ma-mini-opt:last-child:nth-child(even){grid-column:auto}
            .ma-mini-opt select{font-size:11px}
          }
          @media(max-width:820px) and (min-width:601px){
            .ma-row-fields{grid-template-columns:1fr}
            .ma-field-opts{grid-template-columns:1fr 1fr}
          }
          .add-ma-btn{margin-top:8px;width:100%;height:32px;border:1px dashed #fbbf24;background:#fffbeb;color:#d97706;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700}
          .add-ma-btn:hover{background:#fef3c7}
          .tp-sl-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
          .tp-sl-opts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
          @media(max-width:600px){
            .tp-sl-grid{grid-template-columns:1fr}
            .tp-sl-opts{grid-template-columns:1fr}
          }
          .share-fab{position:fixed;bottom:24px;right:24px;width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff;border:none;box-shadow:0 6px 20px rgba(245,158,11,0.45);cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:900;transition:transform .15s ease,box-shadow .15s ease}
          .share-fab:hover{transform:scale(1.08);box-shadow:0 8px 24px rgba(245,158,11,0.55)}
          .share-fab.copied{background:#10b981;box-shadow:0 6px 20px rgba(16,185,129,0.45)}
          .sim-reset-btn{margin-left:auto;height:28px;padding:0 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.5);background:rgba(255,255,255,0.18);color:#fff;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
          .sim-reset-btn:hover{background:rgba(255,255,255,0.28)}
          .result-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:12px 14px;background:#f8fafc;border-top:1px solid #f1f5f9}
          .result-item{background:white;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;text-align:center}
          .result-label{font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.02em}
          .result-value{margin-top:4px;font-size:16px;font-weight:800;color:#1e293b;line-height:1}
          .result-sub{display:flex;gap:10px;flex-wrap:wrap;padding:8px 14px 12px;background:#f8fafc;border-top:1px solid #f1f5f9;font-size:11px;color:#64748b}
          .result-sub b{color:#334155}
          .history-btn{margin-left:auto;height:26px;padding:0 10px;border-radius:999px;border:1px solid #f59e0b;background:#fff;color:#d97706;font-size:11px;font-weight:700;cursor:pointer}
          .history-btn:hover{background:#fffbeb}
          .history-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,0.45);z-index:50;padding:16px}
          .history-modal.show{display:flex}
          .history-panel{width:min(860px,100%);max-height:85vh;background:#fff;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,0.2);overflow:hidden;display:flex;flex-direction:column}
          .history-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #f1f5f9}
          .history-title{font-size:14px;font-weight:800;color:#1e293b}
          .history-close{width:32px;height:32px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#64748b;cursor:pointer}
          .history-close:hover{background:#f8fafc}
          @media(max-width:600px){ .result-grid{grid-template-columns:1fr} .result-value{font-size:15px} .history-panel{max-height:90vh} }
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
            <div style="padding:8px 14px;font-size:12px;color:#64748b" id="chart-title">삼성전자 (005930) · 일봉 1년</div>
            <div class="chart-wrap">
              <stock-chart id="sim-chart" enabled-control enabled-readout show-last-line></stock-chart>
            </div>
            <div class="result-grid" id="sim-result">
              <div class="result-item"><div class="result-label">보유주식수</div><div class="result-value" id="sim-shares">-주</div></div>
              <div class="result-item"><div class="result-label">평가금액</div><div class="result-value" id="sim-eval">-원</div></div>
              <div class="result-item"><div class="result-label">수익률</div><div class="result-value" id="sim-rate">-</div></div>
            </div>
            <div class="result-sub" id="sim-result-detail">
              <span>현금 <b id="sim-cash">-원</b></span>
              <span>주식평가 <b id="sim-holding">-원</b></span>
              <span>손익 <b id="sim-profit">-원</b></span>
              <span style="color:#94a3b8"><span id="sim-trade-count">0건</span> 체결</span>
              <button type="button" class="history-btn" id="sim-history-btn">거래내역보기</button>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 14px 12px;background:#fffbeb;border-top:1px solid #fef3c7;font-size:11px;color:#92400e" id="sim-hold-row">
              <span>단순보유 <b id="sim-hold-rate" style="color:#64748b">-</b> <span style="color:#94a3b8">(<span id="sim-hold-first">-</span> → <span id="sim-hold-last">-</span>)</span></span>
              <span>평가 <b id="sim-hold-eval">-원</b></span>
              <span style="margin-left:auto;color:#94a3b8">첫틱~마지막틱 종가 기준 · 매수 후 보유 가정</span>
            </div>
          </div>

          <form class="card" id="sim-config" style="margin-top:12px" onsubmit="return false">
            <div class="card-header" style="--accent:#f59e0b"><span class="card-title">⚙️ 설정</span><label style="display:inline-flex;align-items:center;gap:4px;margin-left:auto;font-size:11px;font-weight:700;color:#fff;cursor:pointer;user-select:none"><input id="sim-show-cross" type="checkbox" style="width:14px;height:14px" />크로스표시</label><select id="sim-preset-select" class="sim-preset-select" style="margin-left:8px;height:28px;padding:0 8px;border-radius:999px;border:1px solid rgba(255,255,255,0.5);background:rgba(255,255,255,0.18);color:#fff;font-size:11px;font-weight:700;cursor:pointer"><option value="" style="color:#334155">초기화 선택</option><option value="tp-up" style="color:#334155">[실현] 상승매수, 하락매도</option><option value="tp-down" style="color:#334155">[실현] 상승매도, 하락매수</option><option value="hold-up" style="color:#334155">[보유] 상승매수, 하락매도</option><option value="hold-down" style="color:#334155">[보유] 상승매도, 하락매수</option></select></div>
            <div style="padding:12px 14px;display:flex;flex-direction:column;gap:12px">
              <div class="config-grid">
                <div class="config-field"><label>투자원금 (원)</label><input id="sim-capital" type="number" min="100000" step="100000" value="100000000" style="font-size: 16px;" /></div>
                <div class="config-field"><label>캔들 수</label><input id="sim-candle-count" type="number" min="30" max="1000" value="360" style="font-size: 16px;"/></div>
                <div class="config-field"><label>타임프레임</label>
                  <select id="sim-timeframe">
                    <option value="min:1">1분</option><option value="min:3">3분</option><option value="min:5">5분</option><option value="min:15">15분</option><option value="min:30">30분</option><option value="min:60">60분</option>
                    <option value="day:1" selected>일봉</option><option value="week:1">주봉</option><option value="month:1">월봉</option>
                  </select>
                </div>
              </div>
              <div style="border-top:1px solid #fef3c7;padding-top:12px">
                <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:8px">익절 / 손절 (평균단가 기준 · MA와 중복매매 방지)</div>
                <div class="tp-sl-grid">
                  <label style="display:flex;flex-direction:column;gap:6px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:10px">
                    <span style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:#166534"><input id="sim-tp-enabled" type="checkbox" checked style="width:14px;height:14px; font-size: 16px;" /> 익절</span>
                    <span style="display:flex;align-items:center;gap:6px;font-size:11px;color:#14532d;flex-wrap:wrap">수익 <input id="sim-tp" type="number" min="1" max="100" value="15" style="width:52px;height:28px;border-radius:8px;border:1px solid #bbf7d0;text-align:center;font-weight:700;font-size: 16px;" />% 시 <input id="sim-tp-sell" type="number" min="1" max="100" value="100" style="width:52px;height:28px;border-radius:8px;border:1px solid #bbf7d0;text-align:center;font-weight:700;font-size: 16px;" />% 매도</span>
                    <div class="tp-sl-opts">
                      <label class="ma-mini-opt" style="background:#fff;border-color:#bbf7d0;color:#14532d;justify-content:center">캔들 <select id="sim-tp-candle" style="flex:1;min-width:60px;height:26px;border-radius:8px;border:1px solid #bbf7d0;font-size:10px;font-weight:700;background:#fff;padding:0 4px"><option value="any">무관</option><option value="bull">양봉</option><option value="bear">음봉</option></select></label>
                      <label class="ma-mini-opt" style="background:#fff;border-color:#bbf7d0;color:#14532d;justify-content:center">거래량 <select id="sim-tp-volume" style="flex:1;min-width:60px;height:26px;border-radius:8px;border:1px solid #bbf7d0;font-size:10px;font-weight:700;background:#fff;padding:0 4px"><option value="any">무관</option><option value="higher">높을때</option><option value="lower">낮을때</option></select></label>
                      <label class="ma-mini-opt" style="background:#fff;border-color:#bbf7d0;color:#14532d;justify-content:center">이후 <input id="sim-tp-skip" type="number" min="0" max="20" value="5" style="width:36px;height:26px;border-radius:8px;border:1px solid #bbf7d0;text-align:center;font-weight:700;font-size:12px;" />회 MA매매 스킵</label>
                    </div>
                  </label>
                  <label style="display:flex;flex-direction:column;gap:6px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:10px">
                    <span style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:#991b1b"><input id="sim-sl-enabled" type="checkbox" checked style="width:14px;height:14px" /> 손절</span>
                    <span style="display:flex;align-items:center;gap:6px;font-size:11px;color:#7f1d1d;flex-wrap:wrap">손실 <input id="sim-sl" type="number" min="1" max="100" value="10" style="width:52px;height:28px;border-radius:8px;border:1px solid #fecaca;text-align:center;font-weight:700;font-size: 16px;" />% 시 <input id="sim-sl-sell" type="number" min="1" max="100" value="100" style="width:52px;height:28px;border-radius:8px;border:1px solid #fecaca;text-align:center;font-weight:700;font-size: 16px;" />% 매도</span>
                    <div class="tp-sl-opts">
                      <label class="ma-mini-opt" style="background:#fff;border-color:#fecaca;color:#7f1d1d;justify-content:center">캔들 <select id="sim-sl-candle" style="flex:1;min-width:60px;height:26px;border-radius:8px;border:1px solid #fecaca;font-size:10px;font-weight:700;background:#fff;padding:0 4px"><option value="any">무관</option><option value="bull">양봉</option><option value="bear">음봉</option></select></label>
                      <label class="ma-mini-opt" style="background:#fff;border-color:#fecaca;color:#7f1d1d;justify-content:center">거래량 <select id="sim-sl-volume" style="flex:1;min-width:60px;height:26px;border-radius:8px;border:1px solid #fecaca;font-size:10px;font-weight:700;background:#fff;padding:0 4px"><option value="any">무관</option><option value="higher">높을때</option><option value="lower">낮을때</option></select></label>
                      <label class="ma-mini-opt" style="background:#fff;border-color:#fecaca;color:#7f1d1d;justify-content:center">이후 <input id="sim-sl-skip" type="number" min="0" max="20" value="5" style="width:36px;height:26px;border-radius:8px;border:1px solid #fecaca;text-align:center;font-weight:700;font-size:12px;" />회 MA매매 스킵</label>
                    </div>
                  </label>
                </div>
                <div style="font-size:10px;color:#94a3b8;margin-top:6px">평균단가(총매입금액/보유주수) 대비 현재 종가 수익률 기준 · <b>수익 N%</b> 도달 시 보유주수의 M% 익절, <b>손실 N%</b> 도달 시 M% 손절. 체결 시 해당 봉 + 이후 N회 동안 이동평균선 매매를 건너뜁니다 (중복 방지).</div>
              </div>
              <div style="margin-top:12px">
                <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:6px">이동평균선 (추가/삭제, 틱수·피라미딩 설정)</div>
                <div id="ma-list" class="ma-list"></div>
                <button type="button" class="add-ma-btn" id="add-ma-btn">+ 이동평균선 추가</button>
                <div style="font-size:10px;color:#94a3b8;margin-top:6px">골든/데드: 종가가 해당 MA를 상향/하향 돌파 시 · <b>매수 %</b>는 보유현금 기준, <b>매도 %</b>는 보유주식 기준.</div>
              </div>
            </div>
          </form>
        </main>

        <div class="history-modal" id="sim-history-modal" role="dialog" aria-modal="true" aria-label="거래내역">
          <div class="history-panel">
            <div class="history-head">
              <div class="history-title">📋 거래내역</div>
              <button type="button" class="history-close" id="sim-history-close" aria-label="닫기">✕</button>
            </div>
            <div id="sim-history-body"></div>
          </div>
        </div>
        <button id="sim-share-fab" class="share-fab" title="공유하기">🔗</button>
      `;
    }
  }

  return tagName;
};
