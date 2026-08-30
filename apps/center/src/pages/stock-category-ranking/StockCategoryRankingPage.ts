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
  TicsRankingResult,
  TicsDuration,
  TicsNation,
  TicsSortBy,
} from '../../services/toss/TossService';

const tagName = 'center-stock-category-ranking-page';

const DURATION_LABELS: Record<TicsDuration, string> = {
  '1d': '1일', '1w': '1주', '1m': '1개월', '3m': '3개월', '1y': '1년',
};

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class StockCategoryRankingPage extends w.HTMLElement {

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
        titleBody: '카테고리 랭킹 | @dooboostore',
        ogTitle:   '카테고리 랭킹 | @dooboostore',
        desc:      '국내/해외 TICS 카테고리별 등락률·거래대금·시가총액 버블 차트',
        ogDesc:    '국내/해외 TICS 카테고리별 등락률·거래대금·시가총액 버블 차트',
        ogImage: "/assets/images/stock-category-og.png",
        twitterImage: "/assets/images/stock-category-og.png",
        twitterTitle:   '카테고리 랭킹 | @dooboostore',
        twitterDesc:    '국내/해외 TICS 카테고리별 등락률·거래대금·시가총액 버블 차트',
      };
    }

    private router!: Router;
    private tossService!: TossService;

    private nation: TicsNation    = 'KR';
    private sortBy: TicsSortBy    = 'TRADING_AMOUNT';
    private duration: TicsDuration = '1d';
    private result: TicsRankingResult | null = null;

    @onInitialize
    async onInit(
      @inject(TossService.SYMBOL) tossService: TossService,
      router: Router,
    ) {
      this.tossService = tossService;
      this.router = router;
      await this.loadData();
    }

    private async loadData() {
      this.setLoadingState(true);
      const errEl = this.shadowRoot?.querySelector('#error-msg') as HTMLElement;
      if (errEl) errEl.style.display = 'none';
      try {
        this.result = await this.tossService.getTicsRanking({
          nation: this.nation, duration: this.duration, sortBy: this.sortBy,
        });
        requestAnimationFrame(() => {
          this.updateBubbles();
          this.updateBasedAt();
          this.updateCategoryList();
        });
      } catch (e) {
        console.error(e);
        if (errEl) { errEl.textContent = '데이터를 불러오지 못했습니다.'; errEl.style.display = 'block'; }
      } finally {
        this.setLoadingState(false);
      }
    }

    private setLoadingState(on: boolean) {
      const spinner = this.shadowRoot?.querySelector('#loading')    as HTMLElement;
      const area    = this.shadowRoot?.querySelector('#chart-area') as HTMLElement;
      if (spinner) spinner.style.display = on ? 'flex' : 'none';
      if (area)    area.style.opacity    = on ? '0.3'  : '1';
    }

    /** <bubble-chart>의 자식 <bubble> 노드를 갱신 */
    private updateBubbles() {
      const chart = this.shadowRoot?.querySelector('bubble-chart') as HTMLElement;
      if (!chart || !this.result) return;
      const items = [...this.result.tics].slice(0, 30);
      chart.innerHTML = items.map(it => {
        const meta = JSON.stringify({
          rank:           String(it.rank),
          imageUrl:       it.imageUrl,
          stockCount:     String(it.stockCount),
          leadingName:    it.leadingStock.name,
          leadingLogoUrl: it.leadingStock.logoImageUrl,
          leadingSignal:  it.leadingStock.signal ?? '',
        });
        return `<bubble
          label="${it.name}"
          x="${it.totalMarketCapKrw}"
          y="${it.fluctuationRate}"
          r="${it.tradingAmountKrw}"
          meta='${meta}'
        ></bubble>`;
      }).join('');
    }

    private updateBasedAt() {
      const el = this.shadowRoot?.querySelector('#based-at') as HTMLElement;
      if (!el || !this.result) return;
      const d = new Date(this.result.basedAt);
      el.textContent = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} 기준`;
    }

    private fmtAmount(v: number): string {
      if (Math.abs(v) >= 1e12) return (v / 1e12).toFixed(1) + '조';
      if (Math.abs(v) >= 1e8) return (Math.round(v / 1e8).toLocaleString()) + '억';
      if (Math.abs(v) >= 1e4) return (Math.round(v / 1e4).toLocaleString()) + '만';
      return v.toLocaleString();
    }
    private fmtRate(v: number): string {
      const s = v >= 0 ? '+' : '';
      return s + (v * 100).toFixed(2) + '%';
    }

    private updateCategoryList() {
      const listEl = this.shadowRoot?.querySelector('#category-list') as HTMLElement;
      const countEl = this.shadowRoot?.querySelector('#list-count') as HTMLElement;
      if (!listEl) return;
      if (!this.result || this.result.tics.length === 0) {
        listEl.innerHTML = `<div class="list-empty">데이터가 없습니다.</div>`;
        if (countEl) countEl.textContent = '';
        return;
      }
      if (countEl) countEl.textContent = `전체 ${this.result.tics.length}개`;
      listEl.innerHTML = `
        <table class="cat-table">
          <thead>
            <tr>
              <th style="width:36px;text-align:center">#</th>
              <th>카테고리</th>
              <th class="num">등락률</th>
              <th class="num">거래대금</th>
              <th class="num">시가총액</th>
              <th>시그널</th>
            </tr>
          </thead>
          <tbody>
            ${this.result.tics.map(it => {
              const up = it.fluctuationRate >= 0;
              const rateClass = up ? 'up' : 'down';
              const rateText = this.fmtRate(it.fluctuationRate);
              const signal = it.leadingStock.signal ? `<span class="cat-signal">${it.leadingStock.signal}</span>` : `<span style="color:#cbd5e1">-</span>`;
              return `
                <tr>
                  <td><div class="cat-rank ${it.rank <= 3 ? 'top' + it.rank : ''}">${it.rank}</div></td>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px;min-width:0">
                      <img class="cat-thumb" src="${it.imageUrl}" alt="" onerror="this.style.display='none'" />
                      <div style="min-width:0">
                        <div class="cat-name">${it.name}</div>
                        <div class="cat-sub">${it.stockCount}종목 · ${it.leadingStock.name}</div>
                      </div>
                    </div>
                  </td>
                  <td style="text-align:right"><span class="cat-rate ${rateClass}">${rateText}</span></td>
                  <td class="cat-amount">${this.fmtAmount(it.tradingAmountKrw)}</td>
                  <td class="cat-cap">${this.fmtAmount(it.totalMarketCapKrw)}</td>
                  <td>${signal}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }

    @addEventListener('.header-back', 'click')
    onBack() { this.router.go('/'); }

    @addEventListener('.tab-nation', 'click', { delegate: true })
    onNationTab(e: Event) {
      const btn = (e.target as HTMLElement).closest('.tab-nation') as HTMLElement;
      if (!btn || btn.dataset.value === this.nation) return;
      this.nation = btn.dataset.value as TicsNation;
      this.syncTabs(); this.loadData();
    }

    @addEventListener('.tab-sort', 'click', { delegate: true })
    onSortTab(e: Event) {
      const btn = (e.target as HTMLElement).closest('.tab-sort') as HTMLElement;
      if (!btn || btn.dataset.value === this.sortBy) return;
      this.sortBy = btn.dataset.value as TicsSortBy;
      this.syncTabs(); this.loadData();
    }

    @addEventListener('.tab-duration', 'click', { delegate: true })
    onDurationTab(e: Event) {
      const btn = (e.target as HTMLElement).closest('.tab-duration') as HTMLElement;
      if (!btn || btn.dataset.value === this.duration) return;
      this.duration = btn.dataset.value as TicsDuration;
      this.syncTabs(); this.loadData();
    }

    private syncTabs() {
      this.shadowRoot?.querySelectorAll('.tab-nation').forEach(el =>
        el.classList.toggle('active', (el as HTMLElement).dataset.value === this.nation));
      this.shadowRoot?.querySelectorAll('.tab-sort').forEach(el =>
        el.classList.toggle('active', (el as HTMLElement).dataset.value === this.sortBy));
      this.shadowRoot?.querySelectorAll('.tab-duration').forEach(el =>
        el.classList.toggle('active', (el as HTMLElement).dataset.value === this.duration));
    }

    @onConnectedBodyShadow
    render() {
      const durationTabs = (Object.keys(DURATION_LABELS) as TicsDuration[])
        .map(d => `<button class="tab tab-duration${d === this.duration ? ' active' : ''}" data-value="${d}">${DURATION_LABELS[d]}</button>`)
        .join('');

      return `
        <style>
          :host { display:block; min-height:100vh; background:#f0f2f5; font-family:var(--font-family,sans-serif); }
          * { box-sizing:border-box; }

          .header {
            display:flex; align-items:center; gap:12px; padding:16px 20px;
            background:linear-gradient(135deg,#1565c0 0%,#1976d2 60%,#42a5f5 100%); color:#fff;
          }
          .header-back {
            background:rgba(255,255,255,0.2); border:none; color:#fff;
            width:38px; height:38px; border-radius:8px; cursor:pointer;
            display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;
          }
          .header-back:hover { background:rgba(255,255,255,0.35); }
          .header-title { font-size:20px; font-weight:700; flex:1; }
          .header-hits { height:20px; border-radius:4px; opacity:0.9; margin-left:auto; }
          @media(max-width:600px){ .header{padding:12px 14px} .header-title{font-size:17px} }

          .content { padding:16px; display:flex; flex-direction:column; gap:12px; }
          @media(max-width:600px){ .content{padding:10px;gap:10px} }

          .card { background:#fff; border-radius:14px; box-shadow:0 4px 14px rgba(0,0,0,0.07); overflow:hidden; }
          .card-header {
            background:linear-gradient(135deg,#1565c0,#1976d2); color:#fff;
            padding:10px 14px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;
          }
          .card-title { font-size:14px; font-weight:700; }
          .card-body  { padding:12px 14px; }

          .tab-group { display:flex; gap:6px; flex-wrap:wrap; }
          .tab {
            padding:5px 13px; border-radius:20px; border:1.5px solid #e2e8f0;
            background:#f8fafc; color:#64748b; font-size:12px; font-weight:600;
            cursor:pointer; transition:all .15s ease; white-space:nowrap;
          }
          .tab:hover { border-color:#94a3b8; color:#334155; }
          .tab.active {
            background:linear-gradient(135deg,#1565c0,#42a5f5);
            color:#fff; border-color:transparent;
            box-shadow:0 2px 8px rgba(21,101,192,0.3);
          }

          bubble-chart { display:block; width:100%; height:auto; min-height:420px; }
          @media(max-width:480px){ bubble-chart{ min-height:380px; } }

          #list-area .card-header { justify-content:space-between; }
          .list-count { font-size:11px; opacity:.85; font-weight:600; }
          #category-list { overflow-x:auto; }
          .cat-table { width:100%; border-collapse:collapse; min-width:620px; }
          .cat-table th {
            padding:8px 10px; background:#f8fafc; border-top:1px solid #f1f5f9; border-bottom:1px solid #f1f5f9;
            font-size:10px; font-weight:700; color:#94a3b8; text-align:left; white-space:nowrap; letter-spacing:.02em;
          }
          .cat-table th.num { text-align:right; }
          .cat-table td { padding:9px 10px; border-top:1px solid #f1f5f9; vertical-align:middle; }
          .cat-table tbody tr:hover { background:#f8fafc; }
          .cat-rank {
            width:28px; height:28px; border-radius:8px; flex-shrink:0;
            display:flex; align-items:center; justify-content:center;
            font-size:12px; font-weight:800; background:#f1f5f9; color:#64748b;
          }
          .cat-rank.top1 { background:#fef3c7; color:#b45309; }
          .cat-rank.top2 { background:#f1f5f9; color:#475569; border:1px solid #e2e8f0; }
          .cat-rank.top3 { background:#fce7d6; color:#9a3412; }
          .cat-thumb { width:32px; height:32px; border-radius:8px; object-fit:cover; background:#f1f5f9; flex-shrink:0; display:block; }
          .cat-name { font-size:13px; font-weight:700; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px; }
          .cat-sub { font-size:11px; color:#94a3b8; }
          .cat-rate { font-size:12px; font-weight:800; padding:2px 7px; border-radius:10px; white-space:nowrap; display:inline-block; }
          .cat-rate.up { background:#fef2f2; color:#e5484d; }
          .cat-rate.down { background:#eff6ff; color:#3e63dd; }
          .cat-amount, .cat-cap { font-size:12px; color:#475569; font-weight:600; white-space:nowrap; text-align:right; }
          .cat-cap { color:#94a3b8; }
          .cat-signal { font-size:11px; color:#64748b; background:#f1f5f9; padding:2px 6px; border-radius:8px; font-weight:600; white-space:nowrap; display:inline-block; max-width:140px; overflow:hidden; text-overflow:ellipsis; }
          @media(max-width:640px){ .cat-table{ min-width:520px; } }
          .list-empty { padding:32px; text-align:center; font-size:13px; color:#94a3b8; }

          #loading {
            display:none; justify-content:center; align-items:center;
            padding:40px; gap:10px; color:#64748b; font-size:14px;
          }
          .spinner {
            width:22px; height:22px; border:3px solid #e2e8f0;
            border-top-color:#1976d2; border-radius:50%;
            animation:spin .7s linear infinite;
          }
          @keyframes spin { to{transform:rotate(360deg)} }
          #error-msg { display:none; text-align:center; padding:20px; color:#e5484d; font-size:13px; }
          .based-at { font-size:10px; color:#94a3b8; padding:0 14px 10px; text-align:right; }
        </style>

        <div class="header">
           <button class="header-back" aria-label="Go home" title="홈으로">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
            </button>
          <div class="header-title">📊 카테고리 랭킹</div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-stock-category-ranking.svg?style=plastic&amp;"/>
        </div>

        <div class="content">
          <div class="card">
            <div class="card-header"><span class="card-title">🔍 조건 선택</span></div>
            <div class="card-body" style="display:flex;flex-direction:column;gap:10px">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span style="font-size:11px;font-weight:700;color:#64748b;min-width:44px">국가</span>
                <div class="tab-group">
                  <button class="tab tab-nation active" data-value="KR">🇰🇷 국내</button>
                  <button class="tab tab-nation"        data-value="US">🇺🇸 해외</button>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span style="font-size:11px;font-weight:700;color:#64748b;min-width:44px">기준</span>
                <div class="tab-group">
                  <button class="tab tab-sort active" data-value="TRADING_AMOUNT">거래대금</button>
                  <button class="tab tab-sort"        data-value="FLUCTUATION_RATE">등락률</button>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span style="font-size:11px;font-weight:700;color:#64748b;min-width:44px">기간</span>
                <div class="tab-group">${durationTabs}</div>
              </div>
            </div>
          </div>

          <div class="card" id="chart-area">
            <div class="card-header">
              <span class="card-title">카테고리 랭킹</span>
            </div>
            <div id="error-msg"></div>
            <div id="loading"><div class="spinner"></div>불러오는 중…</div>
            <bubble-chart enabled-zoom></bubble-chart>
            <div class="based-at" id="based-at"></div>
          </div>

          <div class="card" id="list-area">
            <div class="card-header">
              <span class="card-title">📋 전체 리스트</span>
              <span class="list-count" id="list-count"></span>
            </div>
            <div id="category-list"></div>
          </div>
        </div>
      `;
    }
  }

  return tagName;
};
