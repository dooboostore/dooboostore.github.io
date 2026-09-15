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
import { GpuRentalService } from '../../services/gpu/GpuRentalService';
import type { GpuPriceHistory } from '../../services/gpu/GpuRentalService';

const tagName = 'center-gpu-rental-page';

type OverlayRange = '3m' | '6m' | '1y' | 'all';
const OVERLAY_RANGE_DAYS: Record<OverlayRange, number> = { '3m': 90, '6m': 180, '1y': 365, all: Infinity };
const OVERLAY_RANGE_LABELS: Record<OverlayRange, string> = { '3m': '3개월', '6m': '6개월', '1y': '1년', all: '전체' };
const OVERLAY_RANGES: OverlayRange[] = ['3m', '6m', '1y', 'all'];

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class GpuRentalPage extends w.HTMLElement {

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
        titleBody: 'GPU 렌탈 시세 | @dooboostore',
        ogTitle:   'GPU 렌탈 시세 | @dooboostore',
        desc:      'vast.ai GPU 시간당 렌탈료 한눈에',
        ogDesc:    'vast.ai GPU 시간당 렌탈료 한눈에',
        ogImage: '/assets/images/gpu-rental-og.png',
        twitterImage: '/assets/images/gpu-rental-og.png',
        twitterTitle:   'GPU 렌탈 시세 | @dooboostore',
        twitterDesc:    'vast.ai GPU 시간당 렌탈료 한눈에',
      };
    }

    private router!: Router;
    private gpuService!: GpuRentalService;
    private lastHist: Record<string, GpuPriceHistory> = {};

    @onInitialize
    async onInit(
      @inject(GpuRentalService.SYMBOL) gpuService: GpuRentalService,
      router: Router,
    ) {
      this.gpuService = gpuService;
      this.router = router;
      this.readHideFromUrl();
      await this.load();
    }

    private money(v: number) {
      return `$${v.toFixed(3)}`;
    }

    private async load() {
      this.setLoading(true);
      this.setError('');
      try {
        const hist = await this.gpuService.getPriceHistory().catch(
          () => ({} as Record<string, GpuPriceHistory>));
        w.requestAnimationFrame(() => this.renderList(hist));
      } catch (e) {
        console.error(e);
        this.setError('시세를 불러오지 못했습니다.');
        this.setLoading(false);
      }
    }

    private spark(rows: number[]): string {
      const pts = (rows ?? []).filter(Number.isFinite);
      if (pts.length < 2) return '';
      const W = 220, H = 40, P = 3;
      const lo = Math.min(...pts), hi = Math.max(...pts);
      const span = hi - lo || 1;
      const xy = pts.map((v, i) =>
        `${(P + i * (W - 2 * P) / (pts.length - 1)).toFixed(1)},${(H - P - (v - lo) / span * (H - 2 * P)).toFixed(1)}`);
      const up = pts[pts.length - 1] >= pts[0];
      return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">` +
        `<polyline points="${xy.join(' ')}" fill="none" stroke="${up ? '#d32f2f' : '#1976d2'}" stroke-width="2"/></svg>`;
    }

    private static readonly TIER_ORDER = [
      'Flagship Datacenter', 'Flagship Consumer',
      'Datacenter Other', 'Consumer Other', 'Unknown',
    ];

    private renderList(hist: Record<string, GpuPriceHistory>) {
      this.lastHist = hist;
      const listEl = this.shadowRoot?.querySelector('#gpu-list') as HTMLElement;
      this.setLoading(false);
      if (!listEl) return;
      const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
      const names = Object.keys(hist);
      if (!names.length) { listEl.innerHTML = '<div class="empty">데이터 없음</div>'; return; }
      const byTier = new Map<string, string[]>();
      for (const n of names) {
        const t = hist[n].tier || 'Unknown';
        if (!byTier.has(t)) byTier.set(t, []);
        byTier.get(t)!.push(n);
      }
      for (const arr of byTier.values()) arr.sort((a, b) => hist[b].curMedian - hist[a].curMedian);
      const maxMed = Math.max(0.01, ...names.map(n => hist[n].curMedian));
      listEl.innerHTML = GpuRentalPage.TIER_ORDER.filter(t => byTier.has(t)).map(t => `
        <div class="tier-section"><div class="tier-title">${esc(t)} ${byTier.get(t)!.length}</div>
        <div class="tier-grid">
        ${byTier.get(t)!.map(name => {
          const h = hist[name];
          const meds = h.daily.map(d => d.median);
          const barW = h.curMedian ? Math.max(2, (h.curMedian / maxMed) * 100) : 0;
          return `
          <div class="gpu-card${this.overlayHidden.has(name) ? ' dimmed' : ''}" data-gpu="${esc(name)}" role="button" tabindex="0" style="border-left-color:${this.gpuColor(name)}">
            <div class="gpu-head">
              <span class="gpu-name">${esc(name)}</span>
              <span class="gpu-count">${h.available}건</span>
            </div>
            <div class="gpu-sub">${h.vramGb != null ? h.vramGb + 'GB' : ''}</div>
            <div class="gpu-prices">
              <span class="gpu-min">최저 <b>${this.money(h.curMin)}</b>/h</span>
              <span class="gpu-med">중간 <b>${this.money(h.curMedian)}</b>/h</span>
            </div>
            <span class="gpu-bar"><span class="fill" style="width:${barW.toFixed(0)}%"></span></span>
            ${this.spark(meds)}
          </div>`;
        }).join('')}
        </div></div>`).join('');
      this.renderOverlay(hist);
    }

    private gpuColor(name: string): string {
      let h = 0;
      for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
      return `hsl(${h},65%,45%)`;
    }

    private overlayGeom: {
      names: string[]; W: number; H: number; P: number;
      lo: number; span: number; t0: string; t1: string;
    } | null = null;
    private overlayHidden = new Set<string>();
    private overlayRange: OverlayRange = '3m';
    private overlayFilteredDaily = new Map<string, readonly { date: string; median: number }[]>();

    /** URL → 숨김 복원 / URL 갱신 (history 쌓지 않음) */
    private readHideFromUrl() {
      try {
        const sp = new URLSearchParams(window.location.search);
        const raw = sp.get('hide');
        this.overlayHidden = new Set(
          (raw ? raw.split(',') : []).map(s => decodeURIComponent(s)).filter(Boolean));
      } catch {}
    }

    private pushHideToUrl() {
      try {
        const url = new URL(window.location.href);
        if (this.overlayHidden.size) {
          url.searchParams.set('hide', [...this.overlayHidden].map(encodeURIComponent).join(','));
        } else {
          url.searchParams.delete('hide');
        }
        window.history.replaceState(null, '', url.toString());
      } catch {}
    }

    /** 램 페이지처럼 전 GPU 겹치기 차트 */
    private renderOverlay(hist: Record<string, GpuPriceHistory>) {
      const el = this.shadowRoot?.querySelector('#gpu-overlay') as HTMLElement;
      if (!el) return;
      const rangeBar = `<div class="overlay-range-bar">${OVERLAY_RANGES.map(r =>
        `<button class="range-btn${r === this.overlayRange ? ' active' : ''}" data-range="${r}">${OVERLAY_RANGE_LABELS[r]}</button>`
      ).join('')}</div>`;

      const allNames = Object.keys(hist).filter(g => (hist[g]?.daily?.length ?? 0) > 1);
      if (!allNames.length) { el.innerHTML = `${rangeBar}<div class="empty">히스토리 없음</div>`; return; }

      const rangeDays = OVERLAY_RANGE_DAYS[this.overlayRange];
      const latestDate = allNames.reduce((mx, g) => {
        const d = hist[g].daily[hist[g].daily.length - 1]?.date;
        return d && d > mx ? d : mx;
      }, '');
      const cutoff = new Date(latestDate || Date.now());
      cutoff.setDate(cutoff.getDate() - rangeDays);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      this.overlayFilteredDaily.clear();
      for (const g of allNames) {
        const rows = Number.isFinite(rangeDays) ? hist[g].daily.filter(d => d.date >= cutoffStr) : hist[g].daily;
        if (rows.length > 1) this.overlayFilteredDaily.set(g, rows);
      }
      const names = [...this.overlayFilteredDaily.keys()];
      if (!names.length) { el.innerHTML = `${rangeBar}<div class="empty">선택한 기간에 데이터가 없습니다</div>`; return; }

      const W = 900, H = 260, P = 8;
      const allV = names.flatMap(g => this.overlayFilteredDaily.get(g)!.map(d => d.median)).filter(Number.isFinite);
      const lo = Math.min(...allV), hi = Math.max(...allV);
      const span = hi - lo || 1;
      const dates = names.flatMap(g => this.overlayFilteredDaily.get(g)!.map(d => d.date)).sort();
      const t0 = dates[0], t1 = dates[dates.length - 1];
      const X = (d: string) => P + (d >= t1 ? 1 : d <= t0 ? 0 :
        (new Date(d).getTime() - new Date(t0).getTime()) / Math.max(1, new Date(t1).getTime() - new Date(t0).getTime())) * (W - 2 * P);
      const Y = (v: number) => P + (1 - (v - lo) / span) * (H - 2 * P);
      const lines = names.filter(g => !this.overlayHidden.has(g)).map(g => {
        const pts = this.overlayFilteredDaily.get(g)!.map(d => `${X(d.date).toFixed(1)},${Y(d.median).toFixed(1)}`).join(' ');
        return `<polyline points="${pts}" fill="none" stroke="${this.gpuColor(g)}" stroke-width="1.8"><title>${g}</title></polyline>`;
      }).join('');
      const legend = names.map(g =>
        `<button class="lg${this.overlayHidden.has(g) ? ' off' : ''}" data-lg="${g}"><span class="dot" style="background:${this.overlayHidden.has(g) ? '#cbd5e1' : this.gpuColor(g)}"></span>${g}</button>`).join('');
      el.innerHTML = rangeBar +
        `<svg id="overlay-svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">${lines}</svg>` +
        `<div class="legend">${legend}</div>` +
        `<div id="overlay-tip"></div>`;
      this.overlayGeom = { names, W, H, P, lo, span, t0, t1 };
    }

    @addEventListener('#gpu-overlay', 'click')
    onOverlayClick(e: Event) {
      const rangeBtn = (e.target as HTMLElement).closest('[data-range]') as HTMLElement | null;
      if (rangeBtn?.dataset.range) {
        const range = rangeBtn.dataset.range as OverlayRange;
        if (range !== this.overlayRange) {
          this.overlayRange = range;
          this.renderOverlay(this.lastHist);
        }
        return;
      }
      const btn = (e.target as HTMLElement).closest('[data-lg]') as HTMLElement | null;
      if (!btn?.dataset.lg) return;
      const g = btn.dataset.lg;
      if (this.overlayHidden.has(g)) this.overlayHidden.delete(g);
      else this.overlayHidden.add(g);
      this.pushHideToUrl();
      this.renderOverlay(this.lastHist);
      this.refreshCardStates();
    }

    /** legend 선택을 아래 카드에 부각 (숨김은 흐리게) */
    private refreshCardStates() {
      this.shadowRoot?.querySelectorAll('#gpu-list [data-gpu]').forEach(el => {
        const name = (el as HTMLElement).dataset.gpu!;
        (el as HTMLElement).classList.toggle('dimmed', this.overlayHidden.has(name));
      });
    }

    @addEventListener('#gpu-overlay', 'mousemove')
    onOverlayHover(e: Event) {
      const svg = (e.target as HTMLElement).closest('#overlay-svg') as SVGSVGElement | null;
      const tip = this.shadowRoot?.querySelector('#overlay-tip') as HTMLElement;
      const G = this.overlayGeom;
      if (!svg || !tip || !G) return;
      const me = e as MouseEvent;
      const rect = (svg as unknown as HTMLElement).getBoundingClientRect();
      const fx = (me.clientX - rect.left) / rect.width;
      const allDates: string[] = [];
      for (const g of G.names) {
        if (this.overlayHidden.has(g)) continue;
        for (const d of this.overlayFilteredDaily.get(g) ?? []) allDates.push(d.date);
      }
      const uniq = [...new Set(allDates)].sort();
      if (!uniq.length) return;
      const idx = Math.max(0, Math.min(uniq.length - 1, Math.round(fx * (uniq.length - 1))));
      const date = uniq[idx];
      const rows = G.names
        .filter(g => !this.overlayHidden.has(g))
        .map(g => {
          const f = (this.overlayFilteredDaily.get(g) ?? []).find(d => d.date === date);
          return f ? `<div><span class="dot" style="background:${this.gpuColor(g)}"></span>${g} <b>$${f.median.toFixed(2)}</b></div>` : '';
        }).join('');
      if (!rows) { tip.style.display = 'none'; return; }
      tip.innerHTML = `<b>${date}</b>${rows}`;
      tip.style.display = 'block';
      tip.style.left = `${Math.min(rect.width - 170, Math.max(0, me.clientX - rect.left + 12))}px`;
      tip.style.top = '8px';
    }

    @addEventListener('#gpu-overlay', 'mouseleave')
    onOverlayLeave() {
      const tip = this.shadowRoot?.querySelector('#overlay-tip') as HTMLElement;
      if (tip) tip.style.display = 'none';
    }

    /** GPU 디테일 모달 (큰 차트 + 스펙) */
    private openDetail(gpu: string, hist: Record<string, GpuPriceHistory>) {
      const h = hist[gpu];
      if (!h) return;
      const modal = this.shadowRoot?.querySelector('#gpu-modal') as HTMLElement;
      const body = this.shadowRoot?.querySelector('#gpu-modal-body') as HTMLElement;
      const title = this.shadowRoot?.querySelector('#gpu-modal-title') as HTMLElement;
      if (!modal || !body) return;
      const med = h.daily.map(d => d.median);
      const mx = Math.max(...med), mn = Math.min(...med);
      const first = med[0], last = med[med.length - 1];
      const chg = first > 0 ? ((last - first) / first) * 100 : 0;
      if (title) title.textContent = gpu;
      const W = 560, H = 220, P = 8;
      const lo = mn, hi = mx, span = hi - lo || 1;
      const pts = med.map((v, i) =>
        `${(P + i * (W - 2 * P) / Math.max(1, med.length - 1)).toFixed(1)},${(P + (1 - (v - lo) / span) * (H - 2 * P)).toFixed(1)}`).join(' ');
      body.innerHTML = `
        <div class="d-stats">
          <span>VRAM <b>${h.vramGb != null ? h.vramGb + 'GB' : '-'}</b></span>
          <span>등급 <b>${h.tier || '-'}</b></span>
          <span>가용 <b>${h.available}건</b></span>
          <span>90일 ${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%</span>
          <span>H <b>$${mx.toFixed(2)}</b> / L <b>$${mn.toFixed(2)}</b></span>
        </div>
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">
          <polyline points="${pts}" fill="none" stroke="${this.gpuColor(gpu)}" stroke-width="2"/></svg>`;
      modal.classList.add('open');
    }

    private closeDetail() {
      const modal = this.shadowRoot?.querySelector('#gpu-modal') as HTMLElement;
      if (modal) modal.classList.remove('open');
    }

    private setLoading(on: boolean) {
      const el = this.shadowRoot?.querySelector('#loading') as HTMLElement;
      if (el) el.style.display = on ? 'block' : 'none';
    }

    private setError(msg: string) {
      const el = this.shadowRoot?.querySelector('#error-msg') as HTMLElement;
      if (!el) return;
      el.textContent = msg;
      el.style.display = msg ? 'block' : 'none';
    }

    @addEventListener('#gpu-list', 'click')
    onGpuClick(e: Event) {
      const el = (e.target as HTMLElement).closest('[data-gpu]') as HTMLElement | null;
      if (!el?.dataset.gpu) return;
      this.openDetail(el.dataset.gpu, this.lastHist);
    }

    @addEventListener('#gpu-modal', 'click')
    onGpuModalBackdrop(e: Event) {
      if ((e.target as HTMLElement).id === 'gpu-modal') this.closeDetail();
    }

    @addEventListener('#gpu-modal-close', 'click')
    onGpuModalClose() {
      this.closeDetail();
    }

    @addEventListener('.header-back', 'click')
    onBack() { this.router.go('/'); }

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
          await (navigator as any).share({ title: 'GPU 렌탈 시세 | @dooboostore', text: 'GPU 시간당 렌탈료 한눈에!', url });
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
          :host { display:block; min-height:100vh; background:#f0f2f5; font-family:var(--font-family,sans-serif); }
          * { box-sizing:border-box; }
          .header { display:flex; align-items:center; gap:12px; padding:16px 20px;
            background:linear-gradient(135deg,#1565c0 0%,#1976d2 60%,#42a5f5 100%); color:#fff; }
          .header-back { background:rgba(255,255,255,0.2); border:none; color:#fff;
            width:38px; height:38px; border-radius:8px; cursor:pointer;
            display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
          .header-back:hover { background:rgba(255,255,255,0.35); }
          .header-title { font-size:20px; font-weight:700; flex:1; }
          .header-hits { height:20px; border-radius:4px; opacity:0.9; margin-left:auto; }
          @media(max-width:600px){ .header{padding:12px 14px} .header-title{font-size:17px} }
          .content { padding:16px; max-width:960px; margin:0 auto; display:flex; flex-direction:column; gap:12px; }
          #gpu-list { display:flex; flex-direction:column; gap:14px; }
          .tier-title { font-size:15px; font-weight:800; color:#0f172a; margin-bottom:8px; }
          .tier-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:10px; }
          .gpu-sub { font-size:12px; color:#64748b; }
          .gpu-card { cursor:pointer; border-left:4px solid transparent; }
          .gpu-card.dimmed { opacity:0.45; }
          #gpu-overlay { background:#fff; border-radius:14px; box-shadow:0 4px 14px rgba(0,0,0,0.07); padding:14px; position:relative; }
          .overlay-range-bar { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
          .overlay-range-bar .range-btn { font-size:12px; font-weight:600; padding:6px 14px; border-radius:10px;
            border:1.5px solid #e2e8f0; background:#fff; color:#334155; cursor:pointer; }
          .overlay-range-bar .range-btn:hover { background:#f1f5f9; }
          .overlay-range-bar .range-btn.active { background:#1565c0; color:#fff; border-color:#1565c0; }
          #gpu-overlay .legend { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
          #gpu-overlay .lg { font-size:11px; color:#475569; display:flex; align-items:center; gap:4px;
            background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:16px; padding:3px 10px; cursor:pointer; }
          #gpu-overlay .lg.off { opacity:0.45; }
          #gpu-overlay .dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
          #overlay-tip { display:none; position:absolute; background:rgba(15,23,42,0.92); color:#fff;
            padding:10px 14px; border-radius:10px; font-size:12px; pointer-events:none; z-index:10;
            min-width:160px; line-height:1.7; }
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
          .modal-body { padding:12px 14px; }
          .d-stats { display:flex; flex-wrap:wrap; gap:10px; font-size:13px; color:#475569; margin-bottom:10px; }
          .d-stats b { color:#0f172a; }
          .gpu-card { background:#fff; border-radius:14px; box-shadow:0 4px 14px rgba(0,0,0,0.07);
            padding:14px; display:flex; flex-direction:column; gap:8px; }
          .gpu-head { display:flex; align-items:baseline; gap:8px; }
          .gpu-name { font-size:15px; font-weight:800; color:#0f172a; }
          .gpu-count { font-size:12px; color:#64748b; margin-left:auto; }
          .gpu-prices { display:flex; gap:12px; font-size:13px; color:#475569; }
          .gpu-prices b { color:#0f172a; font-size:15px; }
          .gpu-bar { display:block; height:6px; border-radius:3px; background:#e2e8f0; overflow:hidden; }
          .gpu-bar .fill { display:block; height:100%; background:linear-gradient(90deg,#42a5f5,#1565c0); }
          .empty { color:#94a3b8; text-align:center; font-size:13px; }
          #loading { display:none; padding:30px; text-align:center; color:#64748b; }
          #error-msg { display:none; color:#d32f2f; font-size:13px; }
          .share-fab { position:fixed; bottom:24px; right:24px; width:54px; height:54px; border-radius:50%;
            background:linear-gradient(135deg,#1565c0,#42a5f5); color:#fff; border:none;
            box-shadow:0 6px 20px rgba(25,118,210,0.45); cursor:pointer; font-size:20px;
            display:flex; align-items:center; justify-content:center; z-index:900; }
          .share-fab:hover { transform:scale(1.08); }
          .share-fab.copied { background:linear-gradient(135deg,#00B050,#00B050); }
          .note { font-size:12px; color:#94a3b8; text-align:center; }
        </style>
        <div class="header">
          <button class="header-back" aria-label="Go home" title="홈으로">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
          </button>
          <div class="header-title">🎮 GPU 렌탈 시세</div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-gpu-rental.svg?style=plastic&amp;"/>
        </div>
        <div class="content">
          <div id="error-msg"></div>
          <div id="loading">불러오는 중… (13종 순차 조회)</div>
          <div id="gpu-overlay"></div>
          <div id="gpu-list"></div>
          <div class="note">출처: vast.ai on-demand · 시간당 USD · 추이: 공개 90일 median</div>
        </div>
        <button class="share-fab" aria-label="공유하기" title="공유하기">🔗</button>
        <div class="modal-backdrop" id="gpu-modal">
          <div class="modal-panel" role="dialog" aria-modal="true">
            <div class="modal-bar">
              <span class="modal-title" id="gpu-modal-title">GPU 상세</span>
              <button class="modal-close" id="gpu-modal-close" aria-label="닫기">✕</button>
            </div>
            <div class="modal-body" id="gpu-modal-body"></div>
          </div>
        </div>`;
    }
  }

  return tagName;
};
