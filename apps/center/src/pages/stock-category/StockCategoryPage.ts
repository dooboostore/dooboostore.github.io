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
import type {
  TossTicsAllItem,
  TossTicsDetailsResult,
} from '../../services/toss/TossService';

const tagName = 'center-stock-category-page';

interface FlatItem {
  id: number;
  title: string;
  depth: number;
  parent: string | null;
  companyCount: number;
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class StockCategoryPage extends w.HTMLElement {

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
        titleBody: '종목 카테고리 | @dooboostore',
        ogTitle:   '종목 카테고리 | @dooboostore',
        desc:      'TICS 카테고리 검색·등락률·미니차트·구성종목',
        ogDesc:    'TICS 카테고리 검색·등락률·미니차트·구성종목',
        ogImage: '/assets/images/stock-category-list-og.png',
        twitterImage: '/assets/images/stock-category-list-og.png',
        twitterTitle:   '종목 카테고리 | @dooboostore',
        twitterDesc:    'TICS 카테고리 검색·등락률·미니차트·구성종목',
      };
    }

    private router!: Router;
    private tossService!: TossService;
    private flat: FlatItem[] = [];
    private detailsCache = new Map<number, TossTicsDetailsResult>();
    private sparkCache = new Map<number, string>();
    private selectedId: number | null = null;
    private query = '';
    private rateById = new Map<number, { rate: number; amount: number; cap: number; stocks: number; leader: string; img: string }>();

    @onInitialize
    async onInit(
      @inject(TossService.SYMBOL) tossService: TossService,
      router: Router,
    ) {
      this.tossService = tossService;
      this.router = router;
      await this.loadAll();
    }

    private async loadAll() {
      this.setLoading(true);
      this.setError('');
      try {
        const [tree, ranking] = await Promise.all([
          this.tossService.getTicsAll(),
          this.tossService.getTicsRankingKrByFluctuation('1d').catch(() => null),
        ]);
        this.rateById.clear();
        for (const t of ranking?.tics ?? []) {
          this.rateById.set(t.ticsId, {
            rate: t.fluctuationRate, amount: t.tradingAmountKrw,
            cap: t.totalMarketCapKrw, stocks: t.stockCount, leader: t.leadingStock.name,
            img: t.imageUrl,
          });
        }
        this.flat = [];
        const walk = (items: readonly TossTicsAllItem[], parent: string | null) => {
          for (const it of items) {
            this.flat.push({
              id: it.id, title: it.title, depth: it.depth,
              parent, companyCount: it.companyCount,
            });
            if (it.subItems?.length) walk(it.subItems, it.title);
          }
        };
        walk(tree.ticsItems ?? [], null);
        this.renderSummary();
      } catch (e) {
        console.error(e);
        this.setError('카테고리를 불러오지 못했습니다.');
      } finally {
        this.setLoading(false);
      }
    }

    private filtered(): FlatItem[] {
      const q = this.query.trim();
      if (!q) return this.flat.filter(f => f.depth === 0);
      return this.flat.filter(f => f.title.includes(q));
    }

    private fmtRate(v: number) {
      return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
    }

    private renderSummary() {
      const listEl = this.shadowRoot?.querySelector('#cat-list') as HTMLElement;
      const countEl = this.shadowRoot?.querySelector('#cat-count') as HTMLElement;
      const titleEl = this.shadowRoot?.querySelector('#list-title') as HTMLElement;
      if (!listEl) return;
      const items = this.filtered();
      if (countEl) countEl.textContent = `${items.length}개`;
      if (titleEl) titleEl.textContent = this.query.trim() ? `"${this.query.trim()}" 검색` : '전체 카테고리';
      const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
      const maxAbs = Math.max(0.01, ...items.map(f => Math.abs(this.rateById.get(f.id)?.rate ?? 0)));
      listEl.innerHTML = items.map(f => {
        const r = this.rateById.get(f.id);
        const up = (r?.rate ?? 0) >= 0;
        const barW = r ? Math.max(2, Math.abs(r.rate) / maxAbs * 100) : 0;
        return `
        <button class="cat-card${this.selectedId === f.id ? ' selected' : ''}" data-id="${f.id}">
          <span class="cat-head">${r?.img ? `<img class="cat-thumb" src="${r.img}" alt="" loading="lazy" onerror="this.style.display='none'" />` : ''}<span class="cat-title">${esc(f.title)}</span></span>
          <span class="cat-meta">${f.depth === 0 ? '대분류' : `소분류 · ${esc(f.parent ?? '')}`} · ${r?.stocks ?? f.companyCount}개사${r?.leader ? ` · ${esc(r.leader)}` : ''}</span>
          ${r ? `
          <span class="cat-rate ${up ? 'up' : 'down'}">${this.fmtRate(r.rate)}</span>
          <span class="cat-bar"><span class="fill ${up ? 'up' : 'down'}" style="width:${barW.toFixed(0)}%"></span></span>
          <span class="card-spark" data-spark="${f.id}"></span>`
          : '<span class="cat-rate na">등락률 없음</span>'}
        </button>`;
      }).join('') || '<div class="empty">검색 결과 없음</div>';
      this.observeSparks();
    }

    /** 카드 미니차트 지연 로딩 (보일 때만 1호출 + 캐시) */
    private sparkObserver: IntersectionObserver | null = null;
    private observeSparks() {
      const listEl = this.shadowRoot?.querySelector('#cat-list');
      if (!listEl) return;
      if (!this.sparkObserver) {
        this.sparkObserver = new IntersectionObserver(entries => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const el = e.target as HTMLElement;
            this.sparkObserver?.unobserve(el);
            const id = Number((el as HTMLElement).dataset.spark);
            if (el.dataset.done || !id) continue;
            el.dataset.done = '1';
            this.sparkline(id).then(svg => {
              if (!el.isConnected) return;
              if (svg) el.innerHTML = svg;
              else el.innerHTML = '<span class="spark-na">차트 없음</span>';
            });
          }
        }, { rootMargin: '200px' });
      }
      listEl.querySelectorAll('[data-spark]:not([data-done])').forEach(el => {
        this.sparkObserver?.observe(el);
      });
    }

    /** 미니 스파크라인 SVG (comparison-chart prices, 캐시).
     *  프록시 실패(dev 오리진 등) 시 Toss 직접 호출 폴백. 둘 다 실패면 '' (슬롯에 ─ 표시). */
    private async sparkline(id: number): Promise<string> {
      const hit = this.sparkCache.get(id);
      if (hit !== undefined) return hit;
      const toSvg = (prices: number[]): string => {
        const pts = prices.filter(Number.isFinite);
        if (pts.length < 2) return '';
        const W = 260, H = 48, P = 4;
        const lo = Math.min(...pts), hi = Math.max(...pts);
        const span = hi - lo || 1;
        const xy = pts.map((v, i) =>
          `${(P + i * (W - 2 * P) / (pts.length - 1)).toFixed(1)},${(H - P - (v - lo) / span * (H - 2 * P)).toFixed(1)}`);
        const up = pts[pts.length - 1] >= pts[0];
        return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">` +
          `<polyline points="${xy.join(' ')}" fill="none" stroke="${up ? '#d32f2f' : '#1976d2'}" stroke-width="2"/></svg>`;
      };
      try {
        const r = await this.tossService.getTicsComparisonChart({ ticsId: id, nation: 'KR' });
        const svg = toSvg((r.indicators?.[0]?.prices ?? []).map(p => p.value));
        this.sparkCache.set(id, svg);
        return svg;
      } catch (e) {
        // 프록시 실패 시 직접 호출 (prod 오리진 등)
        try {
          const r = await fetch(
            `https://wts-info-api.tossinvest.com/api/v1/dashboard/wts/overview/tics/${id}/comparison-chart?nation=KR&securitiesType=STOCK&indicatorCode=KGG01P`,
            { headers: { accept: 'application/json' } });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const j = await r.json();
          const svg = toSvg(((j?.result?.indicators?.[0]?.prices ?? []) as any[]).map(p => p.value));
          this.sparkCache.set(id, svg);
          return svg;
        } catch (e2) {
          console.warn('[stock-category] sparkline failed:', id, String(e2).slice(0, 120));
          this.sparkCache.set(id, '');
          return '';
        }
      }
    }

    private openModal(title: string) {
      const m = this.shadowRoot?.querySelector('#cat-modal') as HTMLElement;
      const t = this.shadowRoot?.querySelector('#modal-title') as HTMLElement;
      if (t) t.textContent = title;
      if (m) m.classList.add('open');
    }

    private closeModal() {
      const m = this.shadowRoot?.querySelector('#cat-modal') as HTMLElement;
      if (m) m.classList.remove('open');
    }

    private async selectCategory(id: number) {
      this.selectedId = id;
      this.renderSummary();
      const panel = this.shadowRoot?.querySelector('#cat-detail') as HTMLElement;
      if (!panel) return;
      const picked = this.flat.find(f => f.id === id);
      this.openModal(picked ? picked.title : '카테고리 상세');
      panel.innerHTML = '<div class="loading">불러오는 중…</div>';
      try {
        let d = this.detailsCache.get(id);
        if (!d) {
          d = await this.tossService.getTicsDetails(id);
          this.detailsCache.set(id, d);
        }
        const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
        const spark = await this.sparkline(id);
        panel.innerHTML = `
          <h3><small>${d.companyCount}개사${d.etfCount ? ` · ETF ${d.etfCount}` : ''}</small></h3>
          ${d.description ? `<p class="desc">${esc(d.description)}</p>` : ''}
          ${spark ? `<div class="spark">${spark}</div>` : ''}
          ${this.stockTabs(d.stocks ?? [])}
          <div class="stocks" id="detail-stocks"></div>`;
        this.renderDetailStocks(panel, '');
      } catch (e) {
        console.error(e);
        panel.innerHTML = '<div class="empty">상세를 불러오지 못했습니다.</div>';
      }
    }

    private stockTabs(stocks: readonly { type: string }[]): string {
      const types = [...new Set(stocks.map(s => s.type || '기타'))];
      if (types.length <= 1) return '';
      return `<div class="tab-group" id="detail-tabs">` +
        `<button class="tab active" data-type="">전체 ${stocks.length}</button>` +
        types.map(t => {
          const n = stocks.filter(s => (s.type || '기타') === t).length;
          return `<button class="tab" data-type="${t}">${t} ${n}</button>`;
        }).join('') + `</div>`;
    }

    private renderDetailStocks(panel: HTMLElement, type: string) {
      const grid = panel.querySelector('#detail-stocks') as HTMLElement;
      if (!grid) return;
      const d = this.detailsCache.get(this.selectedId!);
      if (!d) return;
      const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
      const list = (d.stocks ?? []).filter(s => !type || (s.type || '기타') === type);
      grid.innerHTML = list.map(s => `
        <div class="stock" data-code="${esc(s.code)}">
          <span class="s-row">${s.logoImageUrl ? `<img class="s-logo" src="${esc(s.logoImageUrl)}" alt="" loading="lazy" onerror="this.style.display='none'" />` : ''}<span class="s-name">${esc(s.name)}${s.representative ? ' ★' : ''}</span></span>
          <span class="s-code">${esc(s.code)} · ${esc(s.type || '')}</span>
          <span class="s-price" data-price>—</span>
          <span class="s-spark" data-spark></span>
        </div>`).join('') || '<div class="empty">구성종목 없음</div>';
      panel.querySelectorAll('#detail-tabs .tab').forEach(el => {
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.type === type);
      });
      this.fillPrices(panel);
      void this.fillSparks(panel);
    }

    /** 구성종목 현재가 일괄 표시 (50개씩 배치 호출) */
    /** 구성종목 미니차트 배치 1호출 (mini-chart API) */
    private async fillSparks(panel: HTMLElement) {
      const els = [...panel.querySelectorAll<HTMLElement>('[data-code]')];
      if (!els.length) return;
      try {
        const res = await this.tossService.getMiniCharts(els.map(el => el.dataset.code!));
        const byCode = new Map((res.miniCharts ?? []).map(m => [m.code, m] as const));
        for (const el of els) {
          const slot = el.querySelector('[data-spark]');
          if (!slot) continue;
          const mc = byCode.get(el.dataset.code!);
          const closes = (mc?.candles ?? []).map(c => c.close).filter(Number.isFinite);
          if (closes.length < 2) continue;
          const W = 220, H = 36, P = 2;
          const lo = Math.min(...closes), hi = Math.max(...closes);
          const span = hi - lo || 1;
          const xy = closes.map((v, i) =>
            `${(P + i * (W - 2 * P) / (closes.length - 1)).toFixed(1)},${(H - P - (v - lo) / span * (H - 2 * P)).toFixed(1)}`);
          const up = closes[closes.length - 1] >= closes[0];
          slot.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">` +
            `<polyline points="${xy.join(' ')}" fill="none" stroke="${up ? '#d32f2f' : '#1976d2'}" stroke-width="1.5"/></svg>`;
        }
      } catch (e) {
        console.warn('[stock-category] minicharts failed');
      }
    }
    private priceObserver: IntersectionObserver | null = null;
    private pricePending = new Set<HTMLElement>();
    private priceTimer: number | null = null;

    private async fillPrices(panel: HTMLElement) {
      const els = [...panel.querySelectorAll<HTMLElement>('[data-code]:not([data-priced])')];
      if (!els.length) return;
      if (!this.priceObserver) {
        this.priceObserver = new IntersectionObserver(entries => {
          let need = false;
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const el = e.target as HTMLElement;
            this.priceObserver?.unobserve(el);
            if (el.dataset.priced) continue;
            this.pricePending.add(el);
            need = true;
          }
          if (need) this.schedulePriceFlush();
        }, { rootMargin: '300px' });
      }
      els.forEach(el => this.priceObserver?.observe(el));
    }

    private schedulePriceFlush() {
      if (this.priceTimer != null) return;
      this.priceTimer = window.setTimeout(() => {
        this.priceTimer = null;
        void this.flushPrices();
      }, 300);
    }

    private async flushPrices() {
      const batch = [...this.pricePending].filter(el => el.isConnected && !el.dataset.priced).slice(0, 50);
      if (!batch.length) return;
      try {
        const prices = await this.tossService.getStockPrices(batch.map(el => el.dataset.code!));
        const byCode = new Map(prices.map(p => [p.productCode, p] as const));
        for (const el of batch) {
          this.pricePending.delete(el);
          el.dataset.priced = '1';
          const p = byCode.get(el.dataset.code!);
          const slot = el.querySelector('[data-price]');
          if (!slot) continue;
          if (!p || !(p.close > 0)) { slot.textContent = '시세 없음'; continue; }
          const chg = p.base > 0 ? ((p.close - p.base) / p.base) * 100 : 0;
          const cls = chg >= 0 ? 'up' : 'down';
          const isUsd = ((p as any).currency || '').toUpperCase() === 'USD';
          const price = isUsd
            ? `$${p.close.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : `${p.close.toLocaleString()}원`;
          slot.innerHTML = `<span class="${cls}">${price} ` +
            `<small>(${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%)</small></span>`;
        }
      } catch (e) {
        console.warn('[stock-category] prices failed');
        batch.forEach(el => this.pricePending.delete(el));
      }
      if (this.pricePending.size) this.schedulePriceFlush();
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
          await (navigator as any).share({ title: '종목 카테고리 | @dooboostore', text: 'TICS 카테고리 검색·구성종목 확인하기!', url });
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

    @addEventListener('#cat-search', 'input')
    onSearch(e: Event) {
      this.query = (e.target as HTMLInputElement).value;
      this.renderSummary();
    }

    @addEventListener('.header-back', 'click')
    onBack() { this.router.go('/'); }

    @addEventListener('#modal-close', 'click')
    onModalClose() {
      this.closeModal();
    }

    @addEventListener('#cat-modal', 'click')
    onModalBackdrop(e: Event) {
      if ((e.target as HTMLElement).id === 'cat-modal') this.closeModal();
    }

    @addEventListener('#cat-detail', 'click')
    onDetailClick(e: Event) {
      const tab = (e.target as HTMLElement).closest('#detail-tabs .tab') as HTMLElement | null;
      if (tab) {
        const panel = this.shadowRoot?.querySelector('#cat-detail') as HTMLElement;
        if (panel) this.renderDetailStocks(panel, tab.dataset.type ?? '');
        return;
      }
      this.onStockClick(e);
    }

    onStockClick(e: Event) {
      const el = (e.target as HTMLElement).closest('[data-code]') as HTMLElement | null;
      if (!el?.dataset.code) return;
      const url = `/stock-chart?code=${encodeURIComponent(el.dataset.code)}`;
      try {
        void this.router.go(url);
      } catch {
        try { window.location.assign(url); } catch {}
      }
    }

    @addEventListener('#cat-list', 'click')
    onListClick(e: Event) {
      const btn = (e.target as HTMLElement).closest('[data-id]') as HTMLElement | null;
      if (!btn) return;
      this.selectCategory(Number(btn.dataset.id));
    }

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
          .content { padding:16px; display:flex; flex-direction:column; gap:12px; max-width:960px; margin:0 auto; }
          @media(max-width:600px){ .content{padding:10px;gap:10px} }
          .card { background:#fff; border-radius:14px; box-shadow:0 4px 14px rgba(0,0,0,0.07); overflow:hidden; }
          .card-header { background:linear-gradient(135deg,#1565c0,#1976d2); color:#fff;
            padding:10px 14px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
          .card-title { font-size:14px; font-weight:700; }
          .card-body { padding:12px 14px; }
          #cat-search { width:100%; padding:10px 12px; font-size:14px; border-radius:10px;
            border:1.5px solid #e2e8f0; background:#f8fafc; color:#0f172a; box-sizing:border-box; }
          .row { display:flex; align-items:baseline; gap:8px; margin:2px 0 0; }
          #list-title { font-size:14px; font-weight:700; color:#0f172a; }
          #cat-count { color:#64748b; font-size:12px; }
          #cat-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px; }
          .cat-card { text-align:left; background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:12px;
            padding:12px 14px; cursor:pointer; color:#0f172a; display:flex; flex-direction:column; gap:4px; }
          .cat-card:hover { border-color:#42a5f5; }
          .cat-card.selected { border-color:#1565c0; background:#e8f1fd; }
          .cat-title { font-size:15px; font-weight:700; }
          .cat-head { display:flex; align-items:center; gap:8px; }
          .cat-thumb { width:28px; height:28px; border-radius:8px; flex-shrink:0; }
          .s-row { display:flex; align-items:center; gap:8px; }
          .s-logo { width:24px; height:24px; border-radius:50%; flex-shrink:0; }
          .cat-meta { font-size:12px; color:#64748b; }
          .cat-rate { font-size:16px; font-weight:800; }
          .cat-rate.up { color:#d32f2f; }
          .cat-rate.down { color:#1976d2; }
          .cat-rate.na { font-size:12px; color:#94a3b8; font-weight:400; }
          .cat-bar { display:block; height:6px; border-radius:3px; background:#e2e8f0; overflow:hidden; }
          .cat-bar .fill { display:block; height:100%; }
          .cat-bar .fill.up { background:#d32f2f; }
          .cat-bar .fill.down { background:#1976d2; }
          .card-spark { display:block; min-height:40px; background:#f8fafc;
            border:1px solid #eef2f7; border-radius:6px; padding:2px; }
          /* empty 숨김 금지 — display:none이면 rect 0이라 observer가 영원히 안 뜸 */
          .spark-na { display:block; text-align:center; font-size:11px; color:#cbd5e1; padding:8px 0; }
          #cat-detail h3 { margin:0 0 4px; font-size:17px; color:#0f172a; }
          #cat-detail h3 small { color:#64748b; font-weight:400; }
          #cat-detail .desc { color:#475569; font-size:13px; }
          #cat-detail .spark { margin:4px 0 8px; background:#f8fafc; border:1px solid #e2e8f0;
            border-radius:8px; padding:6px; }
          .stocks { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:8px; margin-top:12px; }
          .stock { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px;
            display:flex; flex-direction:column; gap:2px; cursor:pointer; }
          .stock:hover { border-color:#42a5f5; }
          .s-name { font-size:14px; color:#0f172a; }
          .s-code { font-size:12px; color:#64748b; }
          .s-price { font-size:13px; font-weight:700; color:#0f172a; }
          .s-price .up { color:#d32f2f; }
          .s-price .down { color:#1976d2; }
          .s-price small { font-weight:400; }
          .tab-group { display:flex; gap:6px; flex-wrap:wrap; margin:10px 0 2px; }
          .tab { padding:5px 13px; border-radius:20px; border:1.5px solid #e2e8f0;
            background:#f8fafc; color:#64748b; font-size:12px; font-weight:600; cursor:pointer; }
          .tab.active { background:linear-gradient(135deg,#1565c0,#42a5f5); color:#fff; border-color:transparent; }
          .s-spark { display:block; min-height:30px; }
          .empty, .loading { color:#94a3b8; padding:20px 0; text-align:center; grid-column:1 / -1; }
          #loading { display:none; padding:30px; text-align:center; color:#64748b; }
          #error-msg { display:none; color:#d32f2f; font-size:13px; }
          .modal-backdrop { display:none; position:fixed; inset:0; background:rgba(15,23,42,0.55);
            z-index:1000; align-items:flex-end; justify-content:center; }
          .modal-backdrop.open { display:flex; }
          @media(min-width:640px){ .modal-backdrop { align-items:center; padding:24px; } }
          .modal-panel { background:#fff; border-radius:16px 16px 0 0; width:100%; max-width:640px;
            max-height:86vh; overflow-y:auto; box-shadow:0 -8px 30px rgba(0,0,0,0.25); }
          @media(min-width:640px){ .modal-panel { border-radius:16px; } }
          .modal-bar { position:sticky; top:0; display:flex; align-items:center; gap:8px;
            padding:10px 14px; border-bottom:1px solid #f1f5f9; background:#fff; z-index:1; }
          .modal-title { font-size:15px; font-weight:800; color:#0f172a; flex:1; }
          .modal-close { width:32px; height:32px; border-radius:8px; border:1px solid #e2e8f0;
            background:#fff; color:#64748b; cursor:pointer; font-size:16px; line-height:1; }
        </style>
        <div class="header">
          <button class="header-back" aria-label="Go home" title="홈으로">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
          </button>
          <div class="header-title">🗂️ 종목 카테고리</div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-stock-category.svg?style=plastic&amp;"/>
        </div>
        <div class="content">
          <div class="card">
            <div class="card-header"><span class="card-title">🔍 카테고리 검색</span></div>
            <div class="card-body">
              <input id="cat-search" type="search" placeholder="카테고리 검색 (예: 항공사, 과자)" autocomplete="off" />
              <div id="error-msg"></div>
              <div id="loading">불러오는 중…</div>
              <div class="row"><span id="list-title">전체 카테고리</span><span id="cat-count"></span></div>
            </div>
          </div>
          <div id="cat-list"></div>
        </div>
        <button class="share-fab" aria-label="공유하기" title="공유하기">🔗</button>
        <div class="modal-backdrop" id="cat-modal">
          <div class="modal-panel" role="dialog" aria-modal="true">
            <div class="modal-bar">
              <span class="modal-title" id="modal-title">카테고리 상세</span>
              <button class="modal-close" id="modal-close" aria-label="닫기">✕</button>
            </div>
            <div class="card-body" id="cat-detail"><div class="empty">카테고리를 선택하세요</div></div>
          </div>
        </div>`;
    }
  }

  return tagName;
};
