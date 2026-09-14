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
import {
  RamPriceService,
  RAM_TYPES,
  RAM_CATEGORY_LABELS,
  DEFAULT_SELECTED,
} from '../../services/ram-price/RamPriceService';
import type {
  RamPriceSeries,
  RamType,
  RamCategory,
  RamPriceResult,
} from '../../services/ram-price/RamPriceService';

const tagName = 'center-ram-price-page';

/** URL query param key */
const QP_TYPES = 'types';
const QP_RANGE = 'range';

type ActiveRange = '3m' | '6m' | '1y' | 'all';
const VALID_RANGES: ActiveRange[] = ['3m', '6m', '1y', 'all'];

/** URL → 상태 복원 */
function parseParams(search: string): { types: Set<RamType>; range: ActiveRange } {
  const sp = new URLSearchParams(search);
  const rawTypes = sp.get(QP_TYPES);
  const rawRange = sp.get(QP_RANGE) as ActiveRange | null;
  const allIds = new Set(RAM_TYPES.map(t => t.id as RamType));

  let types: Set<RamType>;
  if (rawTypes) {
    const parsed = rawTypes.split(',').filter(t => allIds.has(t as RamType)) as RamType[];
    types = parsed.length ? new Set(parsed) : new Set(DEFAULT_SELECTED);
  } else {
    types = new Set(DEFAULT_SELECTED);
  }
  const range: ActiveRange = rawRange && VALID_RANGES.includes(rawRange) ? rawRange : '1y';
  return { types, range };
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RamPricePage extends w.HTMLElement {

    // ── OG / meta ──────────────────────────────────────────────────
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
      console.log('----------rrrrrrrrrrrrrrrrrrrrrram!!!!!!!!!!!!!!!!!!!')
      return {
        titleBody:    '반도체 RAM 가격 추이 | @dooboostore',
        ogTitle:      '반도체 RAM 가격 추이 | @dooboostore',
        desc:         'DDR5·DDR4·HBM4·NAND·SSD 등 반도체 메모리 칩 가격 추이를 한눈에',
        ogDesc:       'DDR5·DDR4·HBM4·NAND·SSD 등 반도체 메모리 칩 가격 추이를 한눈에',
        ogImage:      '/assets/images/ram-price-og.png',
        twitterImage: '/assets/images/ram-price-og.png',
        twitterTitle: '반도체 RAM 가격 추이 | @dooboostore',
        twitterDesc:  'DDR5·DDR4·HBM4·NAND·SSD 등 메모리 칩 스팟 가격',
      };
    }

    private router!: Router;
    private ramPriceService!: RamPriceService;
    private data: RamPriceResult | null = null;

    // ── 상태 (URL과 동기화) ─────────────────────────────────────
    private selectedTypes: Set<RamType> = new Set(DEFAULT_SELECTED);
    private activeRange: ActiveRange = '1y';
    /** 카드 섹션 필터 탭 (차트 선택과 별개) */
    private viewCategory: RamCategory | 'ALL' = 'ALL';

    // SVG 차트 상수
    private readonly CW = 900;
    private readonly CH = 360;
    private readonly PT = 40;
    private readonly PB = 52;
    private readonly PL = 72;
    private readonly PR = 20;

    private tooltipMap: Map<string, Map<RamType, number>> = new Map();
    private allDates: string[] = [];

    // ── URL 읽기/쓰기 ────────────────────────────────────────────
    private get _loc(): Location {
      return (this.ownerDocument as Document).defaultView?.location ?? w.location;
    }

    private readFromUrl() {
      const { types, range } = parseParams(this._loc.search);
      this.selectedTypes = types;
      this.activeRange = range;
    }

    /** replaceState로 URL 갱신 (history 쌓지 않음) */
    private pushToUrl() {
      const sp = new URLSearchParams(this._loc.search);
      sp.set(QP_TYPES, [...this.selectedTypes].join(','));
      sp.set(QP_RANGE, this.activeRange);
      const newUrl = `${this._loc.pathname}?${sp.toString()}${this._loc.hash}`;
      (this.ownerDocument as Document).defaultView?.history.replaceState(null, '', newUrl);
    }

    @onInitialize
    async onInit(
      @inject(RamPriceService.SYMBOL) ramPriceService: RamPriceService,
      router: Router,
    ) {
      this.ramPriceService = ramPriceService;
      this.router = router;
      // URL 파라미터로 초기 상태 복원
      this.readFromUrl();
      await this.loadData();
    }

    private async loadData() {
      this.setLoading(true);
      this.setError('');
      try {
        const historyDays = this.activeRange === 'all' ? 1800
          : this.activeRange === '1y' ? 365
          : this.activeRange === '6m' ? 180 : 90;

        this.data = await this.ramPriceService.getRamPrices(
          RAM_TYPES.map(t => t.id),
          historyDays,
        );
        this.renderAll();
      } catch (e) {
        console.error(e);
        this.setError('RAM 가격 데이터를 불러오지 못했습니다.');
      } finally {
        this.setLoading(false);
      }
    }

    // ── SVG 차트 ─────────────────────────────────────────────────
    private buildLineChart(series: readonly RamPriceSeries[]): string {
      const { CW: W, CH: H, PT, PB, PL, PR } = this;
      const cW = W - PL - PR, cH = H - PT - PB;

      const activeSeries = series.filter(s => this.selectedTypes.has(s.type));
      if (!activeSeries.length) return '<div class="empty-chart">차트에 표시할 타입을 선택하세요</div>';

      const allDates = [...new Set(activeSeries.flatMap(s => s.history.map(h => h.date)))].sort();
      if (allDates.length < 2) return '<div class="empty-chart">데이터 부족</div>';
      this.allDates = allDates;

      this.tooltipMap.clear();
      for (const s of activeSeries) {
        for (const h of s.history) {
          if (!this.tooltipMap.has(h.date)) this.tooltipMap.set(h.date, new Map());
          this.tooltipMap.get(h.date)!.set(s.type, h.price);
        }
      }

      const tMin = new Date(allDates[0]).getTime();
      const tMax = new Date(allDates[allDates.length - 1]).getTime();
      const tSpan = tMax - tMin || 1;
      const allPrices = activeSeries.flatMap(s => s.history.map(h => h.price)).filter(Number.isFinite);
      if (!allPrices.length) return '<div class="empty-chart">데이터 없음</div>';
      const pMin = Math.min(...allPrices), pMax = Math.max(...allPrices);
      const pSpan = pMax - pMin || 1;

      const toX = (d: string) => PL + ((new Date(d).getTime() - tMin) / tSpan) * cW;
      const toY = (p: number) => PT + cH - ((p - pMin) / pSpan) * cH;

      const yStep = this.niceStep(pSpan / 5);
      const yFirst = Math.floor(pMin / yStep) * yStep;
      const yTicks: number[] = [];
      for (let v = yFirst; v <= pMax + yStep * 0.5; v += yStep) {
        if (v >= pMin - yStep * 0.1) yTicks.push(parseFloat(v.toFixed(8)));
      }
      const xStep = Math.max(1, Math.floor(allDates.length / Math.min(8, allDates.length)));
      const xTicks = allDates.filter((_, i) => i % xStep === 0);

      const gridLines = yTicks.map(v =>
        `<line x1="${PL}" y1="${toY(v).toFixed(1)}" x2="${W - PR}" y2="${toY(v).toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`).join('');
      const yLabels = yTicks.map(v =>
        `<text x="${PL - 6}" y="${toY(v).toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="#94a3b8">${v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : v >= 100 ? `$${v.toFixed(0)}` : `$${v.toFixed(1)}`}</text>`).join('');
      const xLabels = xTicks.map(d =>
        `<text x="${toX(d).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="10" fill="#94a3b8">${d.slice(0, 7)}</text>`).join('');
      const paths = activeSeries.map(s => {
        if (!s.history.length) return '';
        const pts = s.history.map(h => `${toX(h.date).toFixed(1)},${toY(h.price).toFixed(1)}`).join(' ');
        return `<polyline points="${pts}" fill="none" stroke="${s.info.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
      }).join('');
      const dots = activeSeries.map(s => {
        const last = s.history[s.history.length - 1];
        if (!last) return '';
        return `<circle cx="${toX(last.date).toFixed(1)}" cy="${toY(last.price).toFixed(1)}" r="3.5" fill="${s.info.color}" stroke="#fff" stroke-width="1.5"/>`;
      }).join('');

      return `
        <svg id="price-chart-svg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible">
          ${gridLines}${yLabels}${xLabels}${paths}${dots}
          <line id="crosshair-line" x1="0" y1="${PT}" x2="0" y2="${H - PB}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3" opacity="0" pointer-events="none"/>
          <rect id="chart-overlay" x="${PL}" y="${PT}" width="${cW}" height="${cH}" fill="transparent" style="cursor:crosshair"/>
          <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${H - PB}" stroke="#cbd5e1" stroke-width="1"/>
          <line x1="${PL}" y1="${H - PB}" x2="${W - PR}" y2="${H - PB}" stroke="#cbd5e1" stroke-width="1"/>
        </svg>
        <div id="chart-tooltip" style="display:none;position:absolute;background:rgba(15,23,42,0.92);color:#fff;padding:10px 14px;border-radius:10px;font-size:12px;pointer-events:none;z-index:100;min-width:160px;box-shadow:0 4px 16px rgba(0,0,0,0.25);line-height:1.7;white-space:nowrap"></div>`;
    }

    private niceStep(rawStep: number): number {
      if (rawStep <= 0) return 1;
      const exp = Math.pow(10, Math.floor(Math.log10(rawStep)));
      const frac = rawStep / exp;
      return frac < 1.5 ? exp : frac < 3.5 ? 2 * exp : frac < 7.5 ? 5 * exp : 10 * exp;
    }

    // ── SVG 툴팁 ─────────────────────────────────────────────────
    private bindChartTooltip() {
      const area = this.shadowRoot?.querySelector('#chart-area') as HTMLElement;
      const svg = area?.querySelector('#price-chart-svg') as SVGSVGElement;
      const overlay = svg?.querySelector('#chart-overlay') as SVGRectElement;
      const crosshair = svg?.querySelector('#crosshair-line') as SVGLineElement;
      const tooltip = area?.querySelector('#chart-tooltip') as HTMLElement;
      if (!svg || !overlay || !tooltip || !crosshair) return;

      const { CW: W, CH: H, PT, PB, PL, PR } = this;
      const cW = W - PL - PR;

      const findDate = (svgX: number): string | null => {
        if (!this.allDates.length) return null;
        const tMin = new Date(this.allDates[0]).getTime();
        const tMax = new Date(this.allDates[this.allDates.length - 1]).getTime();
        const tSpan = tMax - tMin || 1;
        const t = tMin + Math.max(0, Math.min(1, (svgX - PL) / cW)) * tSpan;
        return this.allDates.reduce((best, d) =>
          Math.abs(new Date(d).getTime() - t) < Math.abs(new Date(best).getTime() - t) ? d : best
        );
      };

      const toSvgX = (e: MouseEvent) => {
        const r = svg.getBoundingClientRect();
        return (e.clientX - r.left) * (W / r.width);
      };

      const show = (e: MouseEvent) => {
        if (!this.data) return;
        const svgX = toSvgX(e);
        if (svgX < PL - 4 || svgX > W - PR + 4) { hide(); return; }
        const date = findDate(svgX);
        if (!date) { hide(); return; }

        const tMin = new Date(this.allDates[0]).getTime();
        const tMax = new Date(this.allDates[this.allDates.length - 1]).getTime();
        const lx = PL + ((new Date(date).getTime() - tMin) / (tMax - tMin || 1)) * cW;
        crosshair.setAttribute('x1', lx.toFixed(1));
        crosshair.setAttribute('x2', lx.toFixed(1));
        crosshair.setAttribute('opacity', '1');

        const vals = this.tooltipMap.get(date);
        const active = this.data.series.filter(s => this.selectedTypes.has(s.type));
        const dl = new Date(date).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
        let html = `<div style="font-weight:700;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:5px">${dl}</div>`;
        for (const s of active) {
          const p = vals?.get(s.type);
          if (p == null) continue;
          const pl = p >= 1000 ? `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
            : p >= 100 ? `$${p.toFixed(0)}` : `$${p.toFixed(2)}`;
          html += `<div style="display:flex;align-items:center;gap:6px">
            <span style="width:10px;height:10px;border-radius:50%;background:${s.info.color};flex-shrink:0;display:inline-block"></span>
            <span style="flex:1;font-size:11px">${s.info.label}</span>
            <span style="font-weight:700;color:${s.info.color}">${pl}</span></div>`;
        }
        tooltip.innerHTML = html;

        const rect = svg.getBoundingClientRect();
        const sc = rect.width / W;
        const cx = rect.left + lx * sc;
        const ar = area.getBoundingClientRect();
        let left = cx - ar.left + 14;
        const ttW = 200;
        if (left + ttW > ar.width - 8) left = cx - ar.left - ttW - 10;
        const cy = rect.top + (PT + (H - PT - PB) / 2) * sc;
        tooltip.style.display = 'block';
        tooltip.style.left = `${Math.max(4, left)}px`;
        tooltip.style.top = `${cy - ar.top - 40}px`;
      };

      const hide = () => {
        tooltip.style.display = 'none';
        crosshair.setAttribute('opacity', '0');
      };

      overlay.addEventListener('mousemove', show as EventListener);
      overlay.addEventListener('mouseleave', hide);
      overlay.addEventListener('touchmove', (e: Event) => {
        const te = e as TouchEvent;
        if (te.touches.length) { te.preventDefault(); show(te.touches[0] as unknown as MouseEvent); }
      }, { passive: false });
      overlay.addEventListener('touchend', hide);
    }

    // ── 스파크라인 ───────────────────────────────────────────────
    private spark(prices: readonly number[], color: string): string {
      const pts = prices.filter(Number.isFinite);
      if (pts.length < 2) return '';
      const W = 160, H = 36, P = 2;
      const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
      const xy = pts.map((v, i) =>
        `${(P + i * (W - 2 * P) / (pts.length - 1)).toFixed(1)},${(H - P - (v - lo) / span * (H - 2 * P)).toFixed(1)}`);
      return `<svg viewBox="0 0 ${W} ${H}" width="${W}" style="width: 100%; height: 100%;" height="${H}" preserveAspectRatio="none">
        <polyline points="${xy.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    }

    // ── 가격 포맷 ─────────────────────────────────────────────────
    private fmtPrice(p: number): string {
      if (p >= 1000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
      if (p >= 100)  return `$${p.toFixed(0)}`;
      return `$${p.toFixed(2)}`;
    }

    // ── 전체 렌더 ────────────────────────────────────────────────
    private renderAll() {
      this.renderRangeButtons();
      this.renderChart();
      this.renderGroupToggles();
      this.renderLegend();
      this.renderCards();
      this.renderMeta();
    }

    private renderRangeButtons() {
      this.shadowRoot?.querySelectorAll('.range-btn').forEach(b =>
        b.classList.toggle('active', (b as HTMLElement).dataset.range === this.activeRange));
    }

    private renderChart() {
      if (!this.data) return;
      const chartEl = this.shadowRoot?.querySelector('#chart-area') as HTMLElement;
      if (!chartEl) return;
      chartEl.innerHTML = this.buildLineChart(this.data.series);
      w.requestAnimationFrame(() => this.bindChartTooltip());
    }

    /** 범례 칩 — 타입별 표시 토글 (카드 클릭은 미니 팝업) */
    private renderLegend() {
      if (!this.data) return;
      const bar = this.shadowRoot?.querySelector('#legend-bar') as HTMLElement;
      if (!bar) return;
      const esc = (s: string) => String(s).replace(/[&<>"]/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
      bar.innerHTML = this.data.series.map(s => {
        const on = this.selectedTypes.has(s.type);
        return `<button class="legend-chip${on ? '' : ' off'}" data-legend="${s.type}" title="표시 토글">` +
          `<span class="legend-dot" style="background:${on ? s.info.color : '#cbd5e1'}"></span>${esc(s.info.label)}</button>`;
      }).join('');
    }

    /** 카드 클릭 → 미니차트 레이어팝업 */
    private openCardPopup(type: RamType) {
      const s = this.data?.series.find(x => x.type === type);
      if (!s) return;
      const modal = this.shadowRoot?.querySelector('#ram-modal') as HTMLElement;
      const body = this.shadowRoot?.querySelector('#ram-modal-body') as HTMLElement;
      const title = this.shadowRoot?.querySelector('#ram-modal-title') as HTMLElement;
      if (!modal || !body) return;
      if (title) title.textContent = s.info.label;
      const pts = s.history.map(h => h.price);
      const up = pts.length > 1 && pts[pts.length - 1] >= pts[0];
      body.innerHTML = `
        <div class="d-stats">
          <span>현재 <b>${this.fmtPrice(s.latestPrice)}</b></span>
          <span>등락 <b>${s.latestChangePct >= 0 ? '+' : ''}${s.latestChangePct.toFixed(2)}%</b></span>
          <span>H <b>${this.fmtPrice(s.high52w)}</b> / L <b>${this.fmtPrice(s.low52w)}</b></span>
        </div>
        ${this.spark(pts, s.info.color)}
        <div class="d-sub">${up ? '▲' : '▼'} 기간 추이</div>`;
      modal.classList.add('open');
    }

    private closeCardPopup() {
      const modal = this.shadowRoot?.querySelector('#ram-modal') as HTMLElement;
      if (modal) modal.classList.remove('open');
    }

    /** 그룹 토글 버튼 — 각 카테고리의 선택 상태(전체ON/일부/전체OFF)를 반영 */
    private renderGroupToggles() {
      if (!this.data) return;
      const bar = this.shadowRoot?.querySelector('#group-toggle-bar') as HTMLElement;
      if (!bar) return;
      const esc = (s: string) => String(s).replace(/[&<>"]/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

      const categories: RamCategory[] = ['DRAM', 'HBM', 'MOBILE', 'NAND', 'STORAGE'];
      bar.innerHTML = categories.map(cat => {
        const types = RAM_TYPES.filter(t => t.category === cat).map(t => t.id);
        const selectedCount = types.filter(t => this.selectedTypes.has(t)).length;
        const allOn = selectedCount === types.length;
        const someOn = selectedCount > 0 && !allOn;
        const state = allOn ? 'all' : someOn ? 'some' : 'none';
        return `<button class="group-toggle-btn state-${state}" data-cat="${cat}" title="${esc(RAM_CATEGORY_LABELS[cat])} 그룹 선택/해제">
          <span class="gt-icon">${allOn ? '✓' : someOn ? '◑' : '○'}</span>
          <span class="gt-label">${esc(RAM_CATEGORY_LABELS[cat])}</span>
          <span class="gt-count">${selectedCount}/${types.length}</span>
        </button>`;
      }).join('');
    }

    private renderCards() {
      if (!this.data) return;
      const cardsEl = this.shadowRoot?.querySelector('#cards-grid') as HTMLElement;
      if (!cardsEl) return;
      const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

      const filtered = (this.viewCategory === 'ALL'
        ? this.data.series
        : this.data.series.filter(s => s.info.category === this.viewCategory)
      ).filter(s => s.history.length > 0 && s.latestPrice > 0); // 데이터 없는 카드 숨김

      const categories: RamCategory[] = ['DRAM', 'HBM', 'MOBILE', 'NAND', 'STORAGE'];
      const groups = new Map<RamCategory, RamPriceSeries[]>();
      for (const s of filtered) {
        if (!groups.has(s.info.category)) groups.set(s.info.category, []);
        groups.get(s.info.category)!.push(s);
      }

      let html = '';
      for (const cat of categories) {
        const items = groups.get(cat);
        if (!items?.length) continue;
        html += `<div class="cat-section">
          <div class="cat-section-title">${esc(RAM_CATEGORY_LABELS[cat])}</div>
          <div class="cat-cards-row">`;
        for (const s of items) {
          const up = s.latestChangePct >= 0;
          const isSelected = this.selectedTypes.has(s.type);
          html += `
            <div class="price-card${isSelected ? ' active' : ''}" data-type="${s.type}" role="button" tabindex="0"
              style="--card-color:${s.info.color};${isSelected ? `border-color:${s.info.color}` : ''}">
              <div class="card-top">
                <div class="card-type-badge" style="background:${s.info.color}20;color:${s.info.color}">${esc(s.info.label)}</div>
                <div class="card-price ${up ? 'up' : 'down'}">
                  ${this.fmtPrice(s.latestPrice)}
                  <span class="card-pct">${up ? '+' : ''}${s.latestChangePct.toFixed(2)}%</span>
                </div>
              </div>
              <div class="card-desc">${esc(s.info.description)}</div>
              <div class="card-stats">
                <span>H: <b>${this.fmtPrice(s.high52w)}</b></span>
                <span>L: <b>${this.fmtPrice(s.low52w)}</b></span>
              </div>
              <div class="card-spark">${this.spark(s.history.map(h => h.price), s.info.color)}</div>
            </div>`;
        }
        html += `</div></div>`;
      }
      cardsEl.innerHTML = html || '<div style="color:#94a3b8;padding:20px;text-align:center">해당 카테고리에 데이터가 없습니다</div>';
    }

    private renderMeta() {
      if (!this.data) return;
      const srcEl = this.shadowRoot?.querySelector('#data-source') as HTMLElement;
      if (srcEl) srcEl.textContent = '데이터 출처: memoryindex.io (실시간)';
      const updEl = this.shadowRoot?.querySelector('#updated-at') as HTMLElement;
      if (updEl) updEl.textContent = `업데이트: ${new Date(this.data.updatedAt).toLocaleString('ko-KR')}`;
    }

    // ── 이벤트 ───────────────────────────────────────────────────

    @addEventListener('.header-back', 'click')
    onBack() { this.router.go('/'); }

    /** 기간 버튼 */
    @addEventListener('.range-btn', 'click')
    async onRangeChange(e: MouseEvent) {
      const btn = (e.target as HTMLElement).closest('.range-btn') as HTMLElement;
      const range = btn?.dataset.range as ActiveRange | undefined;
      if (!range || range === this.activeRange) return;
      this.activeRange = range;
      this.pushToUrl();
      this.renderRangeButtons();
      await this.loadData();
    }

    /** 카드 개별 클릭 → 미니차트 팝업 (토글은 범례 칩) */
    @addEventListener('#cards-grid', 'click')
    onCardClick(e: MouseEvent) {
      const card = (e.target as HTMLElement).closest('.price-card') as HTMLElement;
      if (!card) return;
      const type = card.dataset.type as RamType;
      if (!type) return;
      this.openCardPopup(type);
    }

    @addEventListener('#legend-bar', 'click')
    onLegendClick(e: MouseEvent) {
      const chip = (e.target as HTMLElement).closest('[data-legend]') as HTMLElement | null;
      if (!chip?.dataset.legend) return;
      const type = chip.dataset.legend as RamType;
      if (this.selectedTypes.has(type)) {
        if (this.selectedTypes.size > 1) this.selectedTypes.delete(type);
      } else {
        this.selectedTypes.add(type);
      }
      this.pushToUrl();
      this.renderChart();
      this.renderGroupToggles();
      this.renderLegend();
      this.renderCards();
    }

    @addEventListener('#ram-modal', 'click')
    onRamModalBackdrop(e: MouseEvent) {
      if ((e.target as HTMLElement).id === 'ram-modal') this.closeCardPopup();
    }

    @addEventListener('#ram-modal-close', 'click')
    onRamModalClose() {
      this.closeCardPopup();
    }

    /** 그룹 토글 버튼 — 해당 카테고리 전체 ON/OFF */
    @addEventListener('#group-toggle-bar', 'click')
    onGroupToggle(e: MouseEvent) {
      const btn = (e.target as HTMLElement).closest('.group-toggle-btn') as HTMLElement;
      if (!btn) return;
      const cat = btn.dataset.cat as RamCategory;
      if (!cat) return;
      const types = RAM_TYPES.filter(t => t.category === cat).map(t => t.id);
      const allOn = types.every(t => this.selectedTypes.has(t));
      if (allOn) {
        // 전체 OFF — 단, 전체가 꺼지면 안 되므로 다른 선택이 있을 때만
        const remaining = [...this.selectedTypes].filter(t => !types.includes(t));
        if (remaining.length > 0) types.forEach(t => this.selectedTypes.delete(t));
        else { /* 마지막 그룹이면 무시 */ return; }
      } else {
        // 전체 ON
        types.forEach(t => this.selectedTypes.add(t));
      }
      this.pushToUrl();
      this.renderChart();
      this.renderGroupToggles();
      this.renderLegend();
      this.renderCards();
    }

    /** 전체 선택 */
    @addEventListener('#select-all-btn', 'click')
    onSelectAll() {
      RAM_TYPES.forEach(t => this.selectedTypes.add(t.id));
      this.pushToUrl();
      this.renderChart();
      this.renderGroupToggles();
      this.renderLegend();
      this.renderCards();
    }

    /** 전체 해제 (최소 1개 유지) */
    @addEventListener('#deselect-all-btn', 'click')
    onDeselectAll() {
      this.selectedTypes = new Set([RAM_TYPES[0].id]);
      this.pushToUrl();
      this.renderChart();
      this.renderGroupToggles();
      this.renderLegend();
      this.renderCards();
    }

    /** 카드 보기 필터 탭 (차트 선택과 무관) */
    @addEventListener('.view-cat-tab', 'click')
    onViewCatTab(e: MouseEvent) {
      const tab = (e.target as HTMLElement).closest('.view-cat-tab') as HTMLElement;
      if (!tab) return;
      this.viewCategory = (tab.dataset.cat as RamCategory | 'ALL') ?? 'ALL';
      this.shadowRoot?.querySelectorAll('.view-cat-tab').forEach(t =>
        t.classList.toggle('active', (t as HTMLElement).dataset.cat === this.viewCategory));
      this.renderCards();
    }

    /** 공유 FAB */
    @addEventListener('#ram-price-share-fab', 'click')
    async onShareFab() {
      const url = this._loc.href;
      const fab = this.shadowRoot?.querySelector('#ram-price-share-fab') as HTMLElement;
      const flash = () => {
        if (!fab) return;
        fab.textContent = '✓'; fab.classList.add('copied');
        setTimeout(() => { if (fab.textContent === '✓') { fab.textContent = '🔗'; fab.classList.remove('copied'); } }, 1500);
      };
      try {
        if ((navigator as any).share) {
          await (navigator as any).share({ title: '반도체 RAM 가격 추이 | @dooboostore', text: 'DDR5·DDR4·HBM 등 반도체 메모리 칩 가격 추이를 확인해보세요!', url });
        } else {
          await navigator.clipboard?.writeText(url); flash();
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') { try { await navigator.clipboard?.writeText(url); flash(); } catch {} }
      }
    }

    private setLoading(on: boolean) {
      const el = this.shadowRoot?.querySelector('#loading') as HTMLElement;
      if (el) el.style.display = on ? 'flex' : 'none';
    }
    private setError(msg: string) {
      const el = this.shadowRoot?.querySelector('#error-msg') as HTMLElement;
      if (!el) return;
      el.textContent = msg; el.style.display = msg ? 'block' : 'none';
    }

    @onConnectedBodyShadow
    render() {
      const rangeLabels: Record<ActiveRange, string> = { '3m': '3개월', '6m': '6개월', '1y': '1년', 'all': '전체' };
      const rangeButtons = VALID_RANGES.map(r =>
        `<button class="range-btn${r === this.activeRange ? ' active' : ''}" data-range="${r}">${rangeLabels[r]}</button>`
      ).join('');

      return `
        <style>
          :host{display:block;min-height:100vh;background:#f0f2f5;font-family:var(--font-family,sans-serif);}
          *{box-sizing:border-box;}
          .header{display:flex;align-items:center;gap:12px;padding:16px 20px;
            background:linear-gradient(135deg,#1a237e 0%,#283593 40%,#3949ab 100%);color:#fff;}
          .header-back{background:rgba(255,255,255,0.2);border:none;color:#fff;width:38px;height:38px;
            border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
          .header-back:hover{background:rgba(255,255,255,0.35);}
          .header-titles{flex:1;min-width:0;}
          .header-title{font-size:20px;font-weight:700;line-height:1.2;}
          .header-sub{font-size:12px;opacity:0.8;margin-top:2px;}
          .header-hits{height:20px;border-radius:4px;opacity:0.9;margin-left:auto;flex-shrink:0;}
          @media(max-width:600px){.header{padding:12px 14px}.header-title{font-size:17px}.header-hits{display:none}}
          .share-fab{position:fixed;bottom:24px;right:24px;width:54px;height:54px;border-radius:50%;
            background:linear-gradient(135deg,#1565c0,#42a5f5);color:#fff;border:none;
            box-shadow:0 6px 20px rgba(21,101,192,0.45);cursor:pointer;font-size:20px;
            display:flex;align-items:center;justify-content:center;z-index:900;
            transition:transform .15s ease,box-shadow .15s ease;}
          .share-fab:hover{transform:scale(1.08);box-shadow:0 8px 24px rgba(21,101,192,0.55);}
          .share-fab.copied{background:#10b981;box-shadow:0 6px 20px rgba(16,185,129,0.45);}
          .modal-backdrop{display:none;position:fixed;inset:0;background:rgba(15,23,42,0.55);
            z-index:1000;align-items:flex-end;justify-content:center;}
          .modal-backdrop.open{display:flex;}
          @media(min-width:640px){.modal-backdrop{align-items:center;padding:24px;}}
          .modal-panel{background:#fff;border-radius:16px 16px 0 0;width:100%;max-width:640px;
            max-height:86vh;overflow-y:auto;box-shadow:0 -8px 30px rgba(0,0,0,0.25);}
          @media(min-width:640px){.modal-panel{border-radius:16px;}}
          .modal-bar{position:sticky;top:0;display:flex;align-items:center;gap:8px;
            padding:10px 14px;border-bottom:1px solid #f1f5f9;background:#fff;z-index:1;}
          .modal-title{font-size:15px;font-weight:800;color:#0f172a;flex:1;}
          .modal-close{width:32px;height:32px;border-radius:8px;border:1px solid #e2e8f0;
            background:#fff;color:#64748b;cursor:pointer;font-size:16px;line-height:1;}
          .modal-body{padding:12px 14px;}
          .d-stats{display:flex;flex-wrap:wrap;gap:10px;font-size:13px;color:#475569;margin-bottom:10px;}
          .d-stats b{color:#0f172a;}
          .d-sub{font-size:12px;color:#64748b;margin-top:6px;}
          .content{padding:16px;max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:16px;}
          #loading{display:none;align-items:center;justify-content:center;padding:60px;font-size:16px;color:#64748b;gap:12px;}
          .spinner{width:32px;height:32px;border:3px solid #e2e8f0;border-top-color:#3949ab;border-radius:50%;animation:spin 0.8s linear infinite;}
          @keyframes spin{to{transform:rotate(360deg);}}
          #error-msg{display:none;color:#d32f2f;font-size:13px;background:#fef2f2;padding:12px 16px;border-radius:10px;border:1px solid #fecaca;}

          /* 기간 버튼 */
          .top-bar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;}
          .range-bar{display:flex;gap:6px;flex-wrap:wrap;flex:1;}
          .range-btn{font-size:13px;font-weight:600;padding:7px 16px;border-radius:10px;border:1.5px solid #e2e8f0;background:#fff;color:#334155;cursor:pointer;}
          .range-btn:hover{background:#f1f5f9;}
          .range-btn.active{background:#1a237e;color:#fff;border-color:#1a237e;}
          .ctrl-btn{font-size:12px;font-weight:600;padding:6px 12px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#334155;cursor:pointer;}
          .ctrl-btn:hover{background:#f1f5f9;}

          /* 차트 카드 */
          .chart-card{background:#fff;border-radius:16px;box-shadow:0 4px 14px rgba(0,0,0,0.07);overflow:hidden;}
          .chart-header{padding:14px 18px 4px;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px;}
          .chart-title{font-size:16px;font-weight:700;color:#0f172a;}
          .chart-unit{font-size:12px;color:#94a3b8;margin-top:2px;}
          #chart-area{padding:8px 16px 14px;min-height:200px;position:relative;}
          .empty-chart{display:flex;align-items:center;justify-content:center;min-height:200px;color:#94a3b8;font-size:14px;}
          .legend-bar{padding:10px 18px;display:flex;flex-wrap:wrap;gap:8px;border-top:1px solid #f1f5f9;}
          .legend-chip{display:flex;align-items:center;gap:5px;font-size:11px;color:#334155;
            background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:16px;padding:3px 10px;cursor:pointer;}
          .legend-chip.off{opacity:.45;}
          .legend-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#334155;}
          .legend-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;}

          /* 그룹 토글 */
          #group-toggle-bar{display:flex;flex-wrap:wrap;gap:8px;}
          .group-toggle-btn{display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:12px;
            border:1.5px solid #e2e8f0;background:#fff;cursor:pointer;font-size:12px;font-weight:600;
            color:#334155;transition:all .15s ease;}
          .group-toggle-btn:hover{background:#f1f5f9;}
          .group-toggle-btn.state-all{background:#1a237e;color:#fff;border-color:#1a237e;}
          .group-toggle-btn.state-some{background:#e8eaf6;color:#1a237e;border-color:#9fa8da;}
          .group-toggle-btn.state-none{background:#fff;color:#94a3b8;border-color:#e2e8f0;}
          .gt-icon{font-size:13px;width:16px;text-align:center;}
          .gt-count{font-size:11px;opacity:0.7;background:rgba(0,0,0,0.1);padding:1px 5px;border-radius:10px;}
          .group-toggle-btn.state-all .gt-count{background:rgba(255,255,255,0.25);}

          /* 카드 보기 탭 */
          .view-cat-tabs{display:flex;flex-wrap:wrap;gap:6px;}
          .view-cat-tab{font-size:12px;font-weight:600;padding:5px 14px;border-radius:20px;
            border:1.5px solid #e2e8f0;background:#fff;color:#334155;cursor:pointer;white-space:nowrap;}
          .view-cat-tab:hover{background:#f1f5f9;}
          .view-cat-tab.active{background:#3949ab;color:#fff;border-color:#3949ab;}

          /* 카드 그리드 */
          #cards-grid{display:flex;flex-direction:column;gap:20px;}
          .cat-section-title{font-size:13px;font-weight:700;color:#475569;
            padding:0 0 8px;border-bottom:2px solid #e2e8f0;margin-bottom:10px;}
          .cat-cards-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;}
          .price-card{background:#fff;border-radius:14px;padding:13px;
            box-shadow:0 3px 10px rgba(0,0,0,0.06);cursor:pointer;
            border:2px solid #e2e8f0;transition:all .15s ease;}
          .price-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1);}
          .price-card.active{box-shadow:0 0 0 2px var(--card-color,#3949ab),0 4px 14px rgba(0,0,0,0.08);}
          .card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:5px;}
          .card-type-badge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:5px;white-space:nowrap;}
          .card-price{font-size:16px;font-weight:800;text-align:right;white-space:nowrap;}
          .card-price.up{color:#d32f2f;} .card-price.down{color:#1976d2;}
          .card-pct{font-size:11px;font-weight:500;display:block;}
          .card-desc{font-size:10.5px;color:#64748b;margin-bottom:5px;line-height:1.5;}
          .card-stats{display:flex;gap:10px;font-size:10.5px;color:#94a3b8;margin-bottom:7px;}
          .card-stats b{color:#334155;font-weight:600;}
          .card-spark{background:#f8fafc;border-radius:5px;padding:2px;display:flex;align-items:center;justify-content:center;overflow:hidden;}

          /* 정보 바 */
          .info-bar{background:#fff;border-radius:12px;padding:10px 16px;
            box-shadow:0 2px 8px rgba(0,0,0,0.05);font-size:12px;color:#94a3b8;
            display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;}

          /* URL 표시 */
          .url-hint{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;
            padding:8px 12px;font-size:11px;color:#64748b;display:flex;align-items:center;gap:8px;}
          .url-hint-icon{flex-shrink:0;opacity:0.5;}
        </style>

        <div class="header">
          <button class="header-back" aria-label="홈으로" title="홈으로">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>
            </svg>
          </button>
          <div class="header-titles">
            <div class="header-title">💾 반도체 RAM 가격 추이</div>
            <div class="header-sub">DDR5 · DDR4 · HBM4 · NAND · SSD — 메모리 칩 스팟 가격</div>
          </div>
          <img class="header-hits" alt="Hits"
            src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-ram-price.svg?style=plastic&amp;"/>
        </div>

        <div class="content">
          <div id="error-msg"></div>
          <div id="loading"><div class="spinner"></div><span>가격 데이터 불러오는 중…</span></div>

          <!-- 기간 + 전체선택/해제 -->
          <div class="top-bar">
            <div class="range-bar">${rangeButtons}</div>
            <button id="select-all-btn" class="ctrl-btn">전체 선택</button>
            <button id="deselect-all-btn" class="ctrl-btn">전체 해제</button>
          </div>

          <!-- URL 공유 힌트 -->
          <div class="url-hint">
            <span class="url-hint-icon">🔗</span>
            <span>선택한 타입과 기간이 URL에 반영됩니다 — 공유 버튼으로 현재 설정 그대로 공유하세요</span>
          </div>

          <!-- 라인 차트 -->
          <div class="chart-card">
            <div class="chart-header">
              <div>
                <div class="chart-title">메모리 칩 가격 추이 (USD)</div>
                <div class="chart-unit">출처: DRAMeXchange / memoryindex.io · 차트에 마우스를 올리면 날짜별 가격 확인</div>
              </div>
            </div>
            <div id="chart-area"><div class="empty-chart">데이터 불러오는 중…</div></div>
            <!-- 그룹별 체크박스 legend -->
            <div class="legend-bar" id="legend-bar"></div>
          </div>

          <div id="cards-grid"></div>

          <div class="info-bar">
            <span id="data-source">데이터 출처: memoryindex.io</span>
            <span id="updated-at"></span>
          </div>
        </div>

        <button id="ram-price-share-fab" class="share-fab" title="공유">🔗</button>
        <div class="modal-backdrop" id="ram-modal">
          <div class="modal-panel" role="dialog" aria-modal="true">
            <div class="modal-bar">
              <span class="modal-title" id="ram-modal-title">상세</span>
              <button class="modal-close" id="ram-modal-close" aria-label="닫기">✕</button>
            </div>
            <div class="modal-body" id="ram-modal-body"></div>
          </div>
        </div>`;
    }
  }

  return tagName;
};
