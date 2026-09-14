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
import type { TossIndicatorItem } from '../../services/toss/TossService';

const tagName = 'center-stock-indicator-page';

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class StockIndicatorPage extends w.HTMLElement {

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
        titleBody: '주요 지표 | @dooboostore',
        ogTitle:   '주요 지표 | @dooboostore',
        desc:      '코스피·나스닥·환율·금리 등 주요 지표 한눈에',
        ogDesc:    '코스피·나스닥·환율·금리 등 주요 지표 한눈에',
        ogImage: '/assets/images/stock-indicator-og.png',
        twitterImage: '/assets/images/stock-indicator-og.png',
        twitterTitle:   '주요 지표 | @dooboostore',
        twitterDesc:    '코스피·나스닥·환율·금리 등 주요 지표 한눈에',
      };
    }

    private router!: Router;
    private tossService!: TossService;

    @onInitialize
    async onInit(
      @inject(TossService.SYMBOL) tossService: TossService,
      router: Router,
    ) {
      this.tossService = tossService;
      this.router = router;
      await this.load();
    }

    private spark(prices: readonly number[]): string {
      const pts = prices.filter(Number.isFinite);
      if (pts.length < 2) return '';
      const W = 220, H = 44, P = 3;
      const lo = Math.min(...pts), hi = Math.max(...pts);
      const span = hi - lo || 1;
      const xy = pts.map((v, i) =>
        `${(P + i * (W - 2 * P) / (pts.length - 1)).toFixed(1)},${(H - P - (v - lo) / span * (H - 2 * P)).toFixed(1)}`);
      const up = pts[pts.length - 1] >= pts[0];
      return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">` +
        `<polyline points="${xy.join(' ')}" fill="none" stroke="${up ? '#d32f2f' : '#1976d2'}" stroke-width="2"/></svg>`;
    }

    private async load() {
      this.setLoading(true);
      this.setError('');
      try {
        const res = await this.tossService.getIndicators();
        const listEl = this.shadowRoot?.querySelector('#ind-list') as HTMLElement;
        if (!listEl) return;
        const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
        listEl.innerHTML = (res.indicators ?? []).map((it: TossIndicatorItem) => {
          const chg = it.price.basePrice > 0
            ? ((it.price.latestPrice - it.price.basePrice) / it.price.basePrice) * 100 : 0;
          const up = it.price.changeType === 'UP' || (it.price.changeType === 'SAME' && chg >= 0);
          const candles = it.miniChart?.candles ?? [];
          const kws = (res.badgedIndices ?? []).filter(b => b.indexCode === it.code);
          return `
          <div class="ind-card">
            <div class="ind-head">
              ${it.logoImageUrl ? `<img class="ind-logo" src="${it.logoImageUrl}" alt="" loading="lazy" onerror="this.style.display='none'" />` : ''}
              <div><div class="ind-name">${esc(it.displayName || it.name)}</div>
              <div class="ind-sub">${esc(it.nation.toUpperCase())}</div></div>
              <div class="ind-price ${up ? 'up' : 'down'}">${it.price.latestPrice.toLocaleString()}
                <small>(${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%)</small></div>
            </div>
            <div class="ind-spark">${this.spark(candles.map(c => c.price))}</div>
            ${kws.length ? `<div class="kw-row">${kws.map(b => `
              <span class="kw-chip${b.isAnomaly ? ' hot' : ''}" title="${esc(b.aiSignalTitle || '')}">${b.direction === 'UP' ? '▲' : '▼'} ${esc(b.keyword || b.displayName)} ${b.changeRate >= 0 ? '+' : ''}${(b.changeRate * 100).toFixed(2)}%</span>`
            ).join('')}</div>` : ''}
          </div>`;
        }).join('') || '<div class="empty">지표 없음</div>';
      } catch (e) {
        console.error(e);
        this.setError('주요지표를 불러오지 못했습니다.');
      } finally {
        this.setLoading(false);
      }
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
          await (navigator as any).share({ title: '주요 지표 | @dooboostore', text: '주요 지표를 한눈에 확인하세요!', url });
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
          .content { padding:16px; max-width:960px; margin:0 auto; display:flex; flex-direction:column; gap:12px; }
          .card { background:#fff; border-radius:14px; box-shadow:0 4px 14px rgba(0,0,0,0.07); overflow:hidden; }
          .card-header { background:linear-gradient(135deg,#1565c0,#1976d2); color:#fff;
            padding:10px 14px; font-size:14px; font-weight:700; }
          .card-body { padding:12px 14px; }
          #ind-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:10px; }
          .ind-card { background:#fff; border-radius:14px; box-shadow:0 4px 14px rgba(0,0,0,0.07);
            padding:14px; display:flex; flex-direction:column; gap:8px; }
          .ind-head { display:flex; align-items:center; gap:10px; }
          .ind-logo { width:32px; height:32px; border-radius:50%; flex-shrink:0; }
          .ind-name { font-size:15px; font-weight:700; color:#0f172a; }
          .ind-sub { font-size:12px; color:#64748b; }
          .ind-price { margin-left:auto; font-size:17px; font-weight:800; text-align:right; }
          .ind-price small { font-size:12px; font-weight:400; display:block; }
          .ind-price.up { color:#d32f2f; }
          .ind-price.down { color:#1976d2; }
          .ind-spark { background:#f8fafc; border:1px solid #eef2f7; border-radius:8px; padding:4px; }
          #kw-list { display:flex; flex-wrap:wrap; gap:8px; }
          .kw-row { display:flex; flex-wrap:wrap; gap:6px; margin-top:2px; }
          .kw-chip { font-size:12px; font-weight:700; padding:6px 12px; border-radius:20px;
            background:#f1f5f9; color:#334155; border:1px solid #e2e8f0; }
          .kw-chip.hot { background:#fef2f2; color:#d32f2f; border-color:#fecaca; }
          .empty { color:#94a3b8; padding:20px 0; text-align:center; }
          #loading { display:none; padding:30px; text-align:center; color:#64748b; }
          #error-msg { display:none; color:#d32f2f; font-size:13px; }
        </style>
        <div class="header">
          <button class="header-back" aria-label="Go home" title="홈으로" data-back>
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
          </button>
          <div class="header-title">📈 주요 지표</div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-stock-indicator.svg?style=plastic&amp;"/>
        </div>
        <div class="content">
          <div id="error-msg"></div>
          <div id="loading">불러오는 중…</div>
          <div id="ind-list"></div>
        </div>
        <button class="share-fab" aria-label="공유하기" title="공유하기">🔗</button>`;
    }
  }

  return tagName;
};
