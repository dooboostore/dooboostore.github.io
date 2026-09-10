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
import { RamPriceService, RAM_TYPES, RAM_CATEGORY_LABELS, DEFAULT_SELECTED } from '../../services/ram-price/RamPriceService';
import type {
  RamPriceSeries,
  RamType,
  RamCategory,
  RamPriceResult,
} from '../../services/ram-price/RamPriceService';

const tagName = 'center-ram-price-page';

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
      return {
        titleBody:    '반도체 RAM 가격 추이 | @dooboostore',
        ogTitle:      '반도체 RAM 가격 추이 | @dooboostore',
        desc:         'DDR5·DDR4·DDR3·LPDDR5·LPDDR4·HBM3E·HBM3 반도체 메모리 칩 가격 추이를 한눈에',
        ogDesc:       'DDR5·DDR4·DDR3·LPDDR5·LPDDR4·HBM3E·HBM3 반도체 메모리 칩 가격 추이를 한눈에',
        ogImage:      '/assets/images/ram-price-og.png',
        twitterImage: '/assets/images/ram-price-og.png',
        twitterTitle: '반도체 RAM 가격 추이 | @dooboostore',
        twitterDesc:  'DDR5·DDR4·LPDDR5·HBM3E 등 메모리 칩 스팟 가격',
      };
    }

    private router!: Router;
    private ramPriceService!: RamPriceService;
    private data: RamPriceResult | null = null;
    private selectedTypes: Set<RamType> = new Set(DEFAULT_SELECTED);
    private activeRange: '3m' | '6m' | '1y' | 'all' = '1y';
    private activeCategory: RamCategory | 'ALL' = 'ALL';

    // SVG 차트 레이아웃 상수
    private readonly W = 900;
    private readonly H = 360;
    private readonly PT = 40;
    private readonly PB = 52;
    private readonly PL = 72;
    private readonly PR = 20;

    // 툴팁 데이터: date별 시리즈 값 lookup
    private tooltipMap: Map<string, Map<RamType, number>> = new Map();
    private allDates: string[] = [];

    @onInitialize
    async onInit(
      @inject(RamPriceService.SYMBOL) ramPriceService: RamPriceService,
      router: Router,
    ) {
      this.ramPriceService = ramPriceService;
      this.router = router;
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
        this.renderData();
      } catch (e) {
        console.error(e);
        this.setError('RAM 가격 데이터를 불러오지 못했습니다.');
      } finally {
        this.setLoading(false);
      }
    }

    // ── SVG 차트 ─────────────────────────────────────────────────
    private buildLineChart(series: readonly RamPriceSeries[]): string {
      const { W, H, PT, PB, PL, PR } = this;
      const cW = W - PL - PR, cH = H - PT - PB;

      const activeSeries = series.filter(s => this.selectedTypes.has(s.type));
      if (!activeSeries.length) return '<div class="empty-chart">표시할 데이터를 선택하세요</div>';

      const allDates = [...new Set(activeSeries.flatMap(s => s.history.map(h => h.date)))].sort();
      if (allDates.length < 2) return '<div class="empty-chart">데이터 부족</div>';

      this.allDates = allDates;

      // 툴팁용 date→{type:price} 맵 빌드
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
      const pMin = Math.min(...allPrices);
      const pMax = Math.max(...allPrices);
      const pSpan = pMax - pMin || 1;

      const yStep = this.niceStep(pSpan / 5);
      const yFirst = Math.floor(pMin / yStep) * yStep;
      const yTicks: number[] = [];
      for (let v = yFirst; v <= pMax + yStep * 0.5; v += yStep) {
        if (v >= pMin - yStep * 0.1) yTicks.push(parseFloat(v.toFixed(8)));
      }

      const toX = (date: string) =>
        PL + ((new Date(date).getTime() - tMin) / tSpan) * cW;
      const toY = (price: number) =>
        PT + cH - ((price - pMin) / pSpan) * cH;

      const xTickCount = Math.min(8, allDates.length);
      const xStep = Math.max(1, Math.floor(allDates.length / xTickCount));
      const xTicks = allDates.filter((_, i) => i % xStep === 0);

      const gridLines = yTicks.map(v =>
        `<line x1="${PL}" y1="${toY(v).toFixed(1)}" x2="${W - PR}" y2="${toY(v).toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`
      ).join('');

      const yLabels = yTicks.map(v =>
        `<text x="${PL - 6}" y="${toY(v).toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="#94a3b8">${v >= 100 ? `$${v.toFixed(0)}` : `$${v.toFixed(1)}`}</text>`
      ).join('');

      const xLabels = xTicks.map(d =>
        `<text x="${toX(d).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="10" fill="#94a3b8">${d.slice(0, 7)}</text>`
      ).join('');

      const paths = activeSeries.map(s => {
        if (!s.history.length) return '';
        const pts = s.history.map(h => `${toX(h.date).toFixed(1)},${toY(h.price).toFixed(1)}`).join(' ');
        return `<polyline data-type="${s.type}" points="${pts}" fill="none" stroke="${s.info.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
      }).join('');

      const dots = activeSeries.map(s => {
        const last = s.history[s.history.length - 1];
        if (!last) return '';
        return `<circle cx="${toX(last.date).toFixed(1)}" cy="${toY(last.price).toFixed(1)}" r="3.5" fill="${s.info.color}" stroke="#fff" stroke-width="1.5"/>`;
      }).join('');

      // 인터랙션용 오버레이 rect
      const overlay = `<rect id="chart-overlay" x="${PL}" y="${PT}" width="${cW}" height="${cH}" fill="transparent" style="cursor:crosshair"/>`;

      // 수직 크로스헤어 라인 (초기 숨김)
      const crosshair = `<line id="crosshair-line" x1="0" y1="${PT}" x2="0" y2="${H - PB}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3" opacity="0" pointer-events="none"/>`;

      return `
        <svg id="price-chart-svg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible">
          ${gridLines}
          ${yLabels}
          ${xLabels}
          ${paths}
          ${dots}
          ${crosshair}
          ${overlay}
          <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${H - PB}" stroke="#cbd5e1" stroke-width="1"/>
          <line x1="${PL}" y1="${H - PB}" x2="${W - PR}" y2="${H - PB}" stroke="#cbd5e1" stroke-width="1"/>
        </svg>
        <div id="chart-tooltip" style="display:none;position:absolute;background:rgba(15,23,42,0.92);color:#fff;padding:10px 14px;border-radius:10px;font-size:12px;pointer-events:none;z-index:100;min-width:140px;box-shadow:0 4px 16px rgba(0,0,0,0.25);line-height:1.7;white-space:nowrap"></div>`;
    }

    private niceStep(rawStep: number): number {
      if (rawStep <= 0) return 1;
      const exp = Math.pow(10, Math.floor(Math.log10(rawStep)));
      const frac = rawStep / exp;
      if (frac < 1.5) return 1 * exp;
      if (frac < 3.5) return 2 * exp;
      if (frac < 7.5) return 5 * exp;
      return 10 * exp;
    }

    // ── SVG 툴팁 마우스 핸들러 ──────────────────────────────────
    private bindChartTooltip() {
      const chartArea = this.shadowRoot?.querySelector('#chart-area') as HTMLElement;
      const svg = chartArea?.querySelector('#price-chart-svg') as SVGSVGElement;
      const overlay = svg?.querySelector('#chart-overlay') as SVGRectElement;
      const crosshair = svg?.querySelector('#crosshair-line') as SVGLineElement;
      const tooltip = chartArea?.querySelector('#chart-tooltip') as HTMLElement;
      if (!svg || !overlay || !tooltip || !crosshair) return;

      const { W, H, PT, PB, PL, PR } = this;
      const cW = W - PL - PR;

      const findClosestDate = (svgX: number): string | null => {
        if (!this.allDates.length) return null;
        const tMin = new Date(this.allDates[0]).getTime();
        const tMax = new Date(this.allDates[this.allDates.length - 1]).getTime();
        const tSpan = tMax - tMin || 1;
        const ratio = Math.max(0, Math.min(1, (svgX - PL) / cW));
        const targetT = tMin + ratio * tSpan;

        let closest = this.allDates[0];
        let minDiff = Infinity;
        for (const d of this.allDates) {
          const diff = Math.abs(new Date(d).getTime() - targetT);
          if (diff < minDiff) { minDiff = diff; closest = d; }
        }
        return closest;
      };

      const getSvgPoint = (e: MouseEvent): { x: number; y: number } => {
        const rect = svg.getBoundingClientRect();
        const vbWidth = W, vbHeight = H;
        const scaleX = vbWidth / rect.width;
        const scaleY = vbHeight / rect.height;
        return {
          x: (e.clientX - rect.left) * scaleX,
          y: (e.clientY - rect.top) * scaleY,
        };
      };

      const showTooltip = (e: MouseEvent) => {
        if (!this.data) return;
        const { x } = getSvgPoint(e);
        if (x < PL - 4 || x > W - PR + 4) { hideTooltip(); return; }

        const date = findClosestDate(x);
        if (!date) { hideTooltip(); return; }

        // 크로스헤어 위치
        const tMin = new Date(this.allDates[0]).getTime();
        const tMax = new Date(this.allDates[this.allDates.length - 1]).getTime();
        const tSpan = tMax - tMin || 1;
        const lineX = PL + ((new Date(date).getTime() - tMin) / tSpan) * cW;
        crosshair.setAttribute('x1', lineX.toFixed(1));
        crosshair.setAttribute('x2', lineX.toFixed(1));
        crosshair.setAttribute('opacity', '1');

        // 툴팁 내용 빌드
        const vals = this.tooltipMap.get(date);
        const activeSeries = this.data.series.filter(s => this.selectedTypes.has(s.type));
        const dateLabel = new Date(date).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
        let html = `<div style="font-weight:700;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:5px">${dateLabel}</div>`;
        for (const s of activeSeries) {
          const price = vals?.get(s.type);
          if (price == null) continue;
          html += `<div style="display:flex;align-items:center;gap:6px">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.info.color};flex-shrink:0"></span>
            <span style="flex:1">${s.info.label}</span>
            <span style="font-weight:700;color:${s.info.color}">$${price.toFixed(2)}</span>
          </div>`;
        }
        tooltip.innerHTML = html;

        // 툴팁 위치 (화면 넘침 방지)
        const rect = svg.getBoundingClientRect();
        const svgScale = rect.width / W;
        const screenX = rect.left + lineX * svgScale;
        const screenY = rect.top + (PT + (H - PT - PB) / 2) * svgScale;
        const containerRect = chartArea.getBoundingClientRect();
        let left = screenX - containerRect.left + 14;
        const ttW = 180;
        if (left + ttW > containerRect.width - 8) left = screenX - containerRect.left - ttW - 10;
        tooltip.style.display = 'block';
        tooltip.style.left = `${Math.max(4, left)}px`;
        tooltip.style.top = `${screenY - containerRect.top - 40}px`;
      };

      const hideTooltip = () => {
        tooltip.style.display = 'none';
        crosshair.setAttribute('opacity', '0');
      };

      overlay.addEventListener('mousemove', showTooltip as EventListener);
      overlay.addEventListener('mouseleave', hideTooltip);
      // 터치 지원
      overlay.addEventListener('touchmove', (e: Event) => {
        const te = e as TouchEvent;
        if (te.touches.length) {
          te.preventDefault();
          showTooltip(te.touches[0] as unknown as MouseEvent);
        }
      }, { passive: false });
      overlay.addEventListener('touchend', hideTooltip);
    }

    // ── 스파크라인 ───────────────────────────────────────────────
    private spark(prices: readonly number[], color: string): string {
      const pts = prices.filter(Number.isFinite);
      if (pts.length < 2) return '';
      const W = 160, H = 36, P = 2;
      const lo = Math.min(...pts), hi = Math.max(...pts);
      const span = hi - lo || 1;
      const xy = pts.map((v, i) =>
        `${(P + i * (W - 2 * P) / (pts.length - 1)).toFixed(1)},${(H - P - (v - lo) / span * (H - 2 * P)).toFixed(1)}`
      );
      return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="none">
        <polyline points="${xy.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    }

    // ── 렌더 ────────────────────────────────────────────────────
    private renderData() {
      if (!this.data) return;

      const chartEl = this.shadowRoot?.querySelector('#chart-area') as HTMLElement;
      if (chartEl) {
        chartEl.innerHTML = this.buildLineChart(this.data.series);
        // 다음 틱에 SVG가 DOM에 붙은 후 이벤트 바인딩
        requestAnimationFrame(() => this.bindChartTooltip());
      }

      const cardsEl = this.shadowRoot?.querySelector('#cards-grid') as HTMLElement;
      if (!cardsEl) return;
      const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

      // 카테고리 필터 적용
      const filteredSeries = this.activeCategory === 'ALL'
        ? this.data.series
        : this.data.series.filter(s => s.info.category === this.activeCategory);

      // 카테고리별 섹션으로 그룹화
      const groups = new Map<RamCategory, RamPriceSeries[]>();
      for (const s of filteredSeries) {
        if (!groups.has(s.info.category)) groups.set(s.info.category, []);
        groups.get(s.info.category)!.push(s);
      }

      const categoryOrder: RamCategory[] = ['DRAM', 'HBM', 'MOBILE', 'NAND', 'STORAGE'];
      let html = '';
      for (const cat of categoryOrder) {
        const items = groups.get(cat);
        if (!items?.length) continue;
        html += `<div class="cat-section">
          <div class="cat-section-title">${esc(RAM_CATEGORY_LABELS[cat])}</div>
          <div class="cat-cards-row">`;
        for (const s of items) {
          const up = s.latestChangePct >= 0;
          const pct = s.latestChangePct;
          const prices = s.history.map(h => h.price);
          const isSelected = this.selectedTypes.has(s.type);
          // 엔터프라이즈 SSD는 단위 표기 다름
          const priceLabel = s.info.category === 'STORAGE' && s.latestPrice >= 100
            ? `$${s.latestPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
            : `$${s.latestPrice.toFixed(2)}`;
          html += `
            <div class="price-card${isSelected ? ' active' : ''}" data-type="${s.type}" role="button" tabindex="0"
              style="--card-color:${s.info.color};${isSelected ? `border-color:${s.info.color}` : ''}">
              <div class="card-top">
                <div class="card-type-badge" style="background:${s.info.color}20;color:${s.info.color}">${esc(s.info.label)}</div>
                <div class="card-price ${up ? 'up' : 'down'}">
                  ${priceLabel}
                  <span class="card-pct">${up ? '+' : ''}${pct.toFixed(2)}%</span>
                </div>
              </div>
              <div class="card-desc">${esc(s.info.description)}</div>
              <div class="card-stats">
                <span title="52주 고가">H: <b>${s.high52w >= 100 ? `$${s.high52w.toFixed(0)}` : `$${s.high52w.toFixed(2)}`}</b></span>
                <span title="52주 저가">L: <b>${s.low52w >= 100 ? `$${s.low52w.toFixed(0)}` : `$${s.low52w.toFixed(2)}`}</b></span>
              </div>
              <div class="card-spark">${this.spark(prices, s.info.color)}</div>
            </div>`;
        }
        html += `</div></div>`;
      }
      cardsEl.innerHTML = html;

      const srcEl = this.shadowRoot?.querySelector('#data-source') as HTMLElement;
      if (srcEl) {
        srcEl.textContent = this.data.source === 'fallback'
          ? '데이터 출처: 정적 참고 데이터 (실시간 API 연결 중…)'
          : '데이터 출처: memoryindex.io / DRAMeXchange';
      }
      const updEl = this.shadowRoot?.querySelector('#updated-at') as HTMLElement;
      if (updEl) {
        updEl.textContent = `업데이트: ${new Date(this.data.updatedAt).toLocaleString('ko-KR')}`;
      }
    }

    // ── 이벤트 ───────────────────────────────────────────────────

    @addEventListener('.header-back', 'click')
    onBack() { this.router.go('/'); }

    @addEventListener('#ram-price-share-fab', 'click')
    async onShareFab() {
      const url = (this.ownerDocument as Document).defaultView?.location.href ?? w.location.href;
      const fab = this.shadowRoot?.querySelector('#ram-price-share-fab') as HTMLElement;
      const flash = () => {
        if (!fab) return;
        fab.textContent = '✓';
        fab.classList.add('copied');
        setTimeout(() => {
          if (fab.textContent === '✓') { fab.textContent = '🔗'; fab.classList.remove('copied'); }
        }, 1500);
      };
      try {
        if ((navigator as any).share) {
          await (navigator as any).share({
            title: '반도체 RAM 가격 추이 | @dooboostore',
            text: 'DDR5·DDR4·HBM 등 반도체 메모리 칩 가격 추이를 확인해보세요!',
            url,
          });
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

    @addEventListener('#cards-grid', 'click')
    onCardClick(e: MouseEvent) {
      const card = (e.target as HTMLElement).closest('.price-card') as HTMLElement;
      if (!card) return;
      const type = card.dataset.type as RamType;
      if (!type) return;
      if (this.selectedTypes.has(type)) {
        if (this.selectedTypes.size > 1) this.selectedTypes.delete(type);
      } else {
        this.selectedTypes.add(type);
      }
      this.renderData();
    }

    @addEventListener('#select-all-btn', 'click')
    onSelectAll() {
      RAM_TYPES.forEach(t => this.selectedTypes.add(t.id));
      this.renderData();
    }

    @addEventListener('#deselect-all-btn', 'click')
    onDeselectAll() {
      this.selectedTypes = new Set([RAM_TYPES[0].id]);
      this.renderData();
    }

    @addEventListener('.cat-tab', 'click')
    onCategoryTab(e: MouseEvent) {
      const tab = (e.target as HTMLElement).closest('.cat-tab') as HTMLElement;
      if (!tab) return;
      this.activeCategory = (tab.dataset.cat as RamCategory | 'ALL') ?? 'ALL';
      this.shadowRoot?.querySelectorAll('.cat-tab').forEach(t =>
        t.classList.toggle('active', (t as HTMLElement).dataset.cat === this.activeCategory));
      this.renderData();
    }

    @addEventListener('.range-btn', 'click')
    async onRangeChange(e: MouseEvent) {
      const btn = e.target as HTMLElement;
      const range = btn.dataset.range as typeof this.activeRange;
      if (!range || range === this.activeRange) return;
      this.activeRange = range;
      this.shadowRoot?.querySelectorAll('.range-btn').forEach(b =>
        b.classList.toggle('active', (b as HTMLElement).dataset.range === range));
      await this.loadData();
    }

    private setLoading(on: boolean) {
      const el = this.shadowRoot?.querySelector('#loading') as HTMLElement;
      if (el) el.style.display = on ? 'flex' : 'none';
    }

    private setError(msg: string) {
      const el = this.shadowRoot?.querySelector('#error-msg') as HTMLElement;
      if (!el) return;
      el.textContent = msg;
      el.style.display = msg ? 'block' : 'none';
    }

    @onConnectedBodyShadow
    render() {
      const rangeButtons = (['3m', '6m', '1y', 'all'] as const).map(r =>
        `<button class="range-btn${r === this.activeRange ? ' active' : ''}" data-range="${r}">${
          r === '3m' ? '3개월' : r === '6m' ? '6개월' : r === '1y' ? '1년' : '전체'
        }</button>`
      ).join('');

      return `
        <style>
          :host{display:block;min-height:100vh;background:#f0f2f5;font-family:var(--font-family,sans-serif);}
          *{box-sizing:border-box;}

          /* ── 헤더 (다른 페이지와 통일) ── */
          .header{display:flex;align-items:center;gap:12px;padding:16px 20px;
            background:linear-gradient(135deg,#1a237e 0%,#283593 40%,#3949ab 100%);color:#fff;}
          .header-back{background:rgba(255,255,255,0.2);border:none;color:#fff;
            width:38px;height:38px;border-radius:8px;cursor:pointer;
            display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
          .header-back:hover{background:rgba(255,255,255,0.35);}
          .header-titles{flex:1;min-width:0;}
          .header-title{font-size:20px;font-weight:700;line-height:1.2;}
          .header-sub{font-size:12px;opacity:0.8;margin-top:2px;}
          .header-hits{height:20px;border-radius:4px;opacity:0.9;margin-left:auto;flex-shrink:0;}
          @media(max-width:600px){.header{padding:12px 14px}.header-title{font-size:17px}.header-hits{display:none}}

          /* ── 공유 FAB (다른 페이지와 통일) ── */
          .share-fab{position:fixed;bottom:24px;right:24px;width:54px;height:54px;border-radius:50%;
            background:linear-gradient(135deg,#1565c0,#42a5f5);color:#fff;border:none;
            box-shadow:0 6px 20px rgba(21,101,192,0.45);cursor:pointer;font-size:20px;
            display:flex;align-items:center;justify-content:center;z-index:900;
            transition:transform .15s ease,box-shadow .15s ease;}
          .share-fab:hover{transform:scale(1.08);box-shadow:0 8px 24px rgba(21,101,192,0.55);}
          .share-fab.copied{background:#10b981;box-shadow:0 6px 20px rgba(16,185,129,0.45);}

          /* ── 레이아웃 ── */
          .content{padding:16px;max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:16px;}

          /* ── 로딩/에러 ── */
          #loading{display:none;align-items:center;justify-content:center;padding:60px;font-size:16px;color:#64748b;gap:12px;}
          .spinner{width:32px;height:32px;border:3px solid #e2e8f0;border-top-color:#3949ab;border-radius:50%;animation:spin 0.8s linear infinite;}
          @keyframes spin{to{transform:rotate(360deg);}}
          #error-msg{display:none;color:#d32f2f;font-size:13px;background:#fef2f2;padding:12px 16px;border-radius:10px;border:1px solid #fecaca;}

          /* ── 기간 버튼 ── */
          .range-bar{display:flex;gap:6px;flex-wrap:wrap;}
          .range-btn{font-size:13px;font-weight:600;padding:7px 16px;border-radius:10px;
            border:1.5px solid #e2e8f0;background:#fff;color:#334155;cursor:pointer;}
          .range-btn:hover{background:#f1f5f9;}
          .range-btn.active{background:#1a237e;color:#fff;border-color:#1a237e;}

          /* ── 차트 카드 ── */
          .chart-card{background:#fff;border-radius:16px;box-shadow:0 4px 14px rgba(0,0,0,0.07);overflow:hidden;}
          .chart-header{padding:14px 18px 4px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;}
          .chart-title{font-size:16px;font-weight:700;color:#0f172a;}
          .chart-unit{font-size:12px;color:#94a3b8;}
          #chart-area{padding:8px 16px 14px;min-height:200px;position:relative;}
          .empty-chart{display:flex;align-items:center;justify-content:center;min-height:200px;color:#94a3b8;font-size:14px;}

          /* ── 범례 ── */
          .legend-bar{padding:10px 18px;display:flex;flex-wrap:wrap;gap:10px;border-top:1px solid #f1f5f9;}
          .legend-item{display:flex;align-items:center;gap:5px;font-size:12px;color:#334155;}
          .legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}

          /* ── 컨트롤 버튼 ── */
          .ctrl-btn{font-size:12px;font-weight:600;padding:5px 12px;border-radius:8px;
            border:1px solid #e2e8f0;background:#f8fafc;color:#334155;cursor:pointer;}
          .ctrl-btn:hover{background:#f1f5f9;}

          /* ── 카드 그리드 ── */
          #cards-grid{display:flex;flex-direction:column;gap:20px;}
          .cat-section{}
          .cat-section-title{font-size:14px;font-weight:700;color:#475569;
            padding:0 2px 8px;border-bottom:2px solid #e2e8f0;margin-bottom:10px;
            display:flex;align-items:center;gap:6px;}
          .cat-section-title::before{content:'';display:inline-block;width:4px;height:16px;
            border-radius:2px;background:currentColor;opacity:0.6;}
          .cat-cards-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;}
          .price-card{background:#fff;border-radius:14px;padding:14px;
            box-shadow:0 4px 14px rgba(0,0,0,0.07);cursor:pointer;
            border:2px solid #e2e8f0;transition:all 0.18s ease;}
          .price-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.1);}
          .price-card.active{box-shadow:0 0 0 2px var(--card-color,#3949ab),0 6px 18px rgba(0,0,0,0.09);}
          .card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;}
          .card-type-badge{font-size:12px;font-weight:700;padding:3px 9px;border-radius:6px;}
          .card-price{font-size:18px;font-weight:800;text-align:right;}
          .card-price.up{color:#d32f2f;}
          .card-price.down{color:#1976d2;}
          .card-pct{font-size:12px;font-weight:500;display:block;}
          .card-desc{font-size:11px;color:#64748b;margin-bottom:6px;line-height:1.5;}
          .card-stats{display:flex;gap:12px;font-size:11px;color:#94a3b8;margin-bottom:8px;}
          .card-stats b{color:#334155;font-weight:600;}
          .card-spark{background:#f8fafc;border-radius:6px;padding:3px;display:flex;align-items:center;justify-content:center;overflow:hidden;}

          /* ── 정보 바 ── */
          .info-bar{background:#fff;border-radius:12px;padding:10px 16px;
            box-shadow:0 2px 8px rgba(0,0,0,0.05);font-size:12px;color:#94a3b8;
            display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;}

          /* ── 카테고리 탭 ── */
          .cat-tabs{display:flex;flex-wrap:wrap;gap:6px;}
          .cat-tab{font-size:12px;font-weight:600;padding:6px 14px;border-radius:20px;
            border:1.5px solid #e2e8f0;background:#fff;color:#334155;cursor:pointer;white-space:nowrap;}
          .cat-tab:hover{background:#f1f5f9;}
          .cat-tab.active{background:#1a237e;color:#fff;border-color:#1a237e;}
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
            <div class="header-sub">DDR5 · DDR4 · LPDDR · HBM — 메모리 칩 스팟 가격</div>
          </div>
          <img class="header-hits" alt="Hits"
            src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-ram-price.svg?style=plastic&amp;"/>
        </div>

        <div class="content">
          <div id="error-msg"></div>
          <div id="loading">
            <div class="spinner"></div>
            <span>가격 데이터 불러오는 중…</span>
          </div>

          <div class="range-bar">${rangeButtons}</div>

          <div class="chart-card">
            <div class="chart-header">
              <div>
                <div class="chart-title">메모리 칩 가격 추이 (USD / 개)</div>
                <div class="chart-unit">출처: DRAMeXchange / memoryindex.io · 마우스를 차트에 올리면 날짜별 가격을 확인하세요</div>
              </div>
              <div style="display:flex;gap:6px">
                <button id="select-all-btn" class="ctrl-btn">전체 선택</button>
                <button id="deselect-all-btn" class="ctrl-btn">해제</button>
              </div>
            </div>
            <div id="chart-area">
              <div class="empty-chart">데이터 불러오는 중…</div>
            </div>
            <div class="legend-bar">
              ${RAM_TYPES.map(t => `
                <div class="legend-item">
                  <span class="legend-dot" style="background:${t.color}"></span>${t.label}
                </div>`).join('')}
            </div>
          </div>

          <!-- 카테고리 필터 탭 -->
          <div class="cat-tabs" id="cat-tabs">
            <button class="cat-tab active" data-cat="ALL">전체</button>
            <button class="cat-tab" data-cat="DRAM">DRAM (PC/서버)</button>
            <button class="cat-tab" data-cat="HBM">HBM (AI 가속기)</button>
            <button class="cat-tab" data-cat="MOBILE">모바일 메모리</button>
            <button class="cat-tab" data-cat="NAND">NAND 플래시</button>
            <button class="cat-tab" data-cat="STORAGE">저장장치</button>
          </div>

          <div id="cards-grid"></div>

          <div class="info-bar">
            <span id="data-source">데이터 출처: memoryindex.io</span>
            <span id="updated-at"></span>
          </div>
        </div>

        <button id="ram-price-share-fab" class="share-fab" title="공유">🔗</button>`;
    }
  }

  return tagName;
};
