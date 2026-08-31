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
  TicsComparisonChartResult,
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
    private chartLayerData: TicsComparisonChartResult | null = null;

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
      const chart = this.shadowRoot?.querySelector('bubble-chart:not(#expanded-bubble-chart)') as HTMLElement;
      if (!chart || !this.result) return;
      const items = [...this.result.tics].slice(0, 30);
      chart.innerHTML = items.map(it => {
        const turnover = it.totalMarketCapKrw ? it.tradingAmountKrw / it.totalMarketCapKrw : 0;
        return `<bubble
          label="${it.name}"
          x="${turnover}"
          y="${it.fluctuationRate}"
          r="${it.totalMarketCapKrw}"
          amount="${it.tradingAmountKrw}"
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
              <th class="num">회전율</th>
              <th class="num">거래대금</th>
              <th class="num">시가총액</th>
            </tr>
          </thead>
          <tbody>
            ${this.result.tics.map(it => {
              const up = it.fluctuationRate >= 0;
              const rateClass = up ? 'up' : 'down';
              const rateText = this.fmtRate(it.fluctuationRate);
              const turnover = it.totalMarketCapKrw ? it.tradingAmountKrw / it.totalMarketCapKrw : 0;
              const turnoverText = this.fmtRate(turnover);
              const signalText = it.leadingStock.signal || '';
              return `
                <tr class="cat-row" data-tics-id="${it.ticsId}" data-name="${it.name.replace(/"/g,'&quot;')}" data-img="${it.imageUrl}">
                  <td><div class="cat-rank ${it.rank <= 3 ? 'top' + it.rank : ''}">${it.rank}</div></td>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px;min-width:0">
                      <img class="cat-thumb" src="${it.imageUrl}" alt="" onerror="this.style.display='none'" />
                      <div style="min-width:0">
                        <div class="cat-name" style="display:flex;align-items:center;gap:0;flex-wrap:wrap">${it.name}${signalText ? `<span class="cat-signal-inline">${signalText}</span>` : ''}</div>
                        <div class="cat-sub">${it.stockCount}종목 · ${it.leadingStock.name}</div>
                      </div>
                    </div>
                  </td>
                  <td style="text-align:right"><span class="cat-rate ${rateClass}">${rateText}</span></td>
                  <td style="text-align:right"><span class="cat-turnover">${turnoverText}</span></td>
                  <td class="cat-amount">${this.fmtAmount(it.tradingAmountKrw)}</td>
                  <td class="cat-cap">${this.fmtAmount(it.totalMarketCapKrw)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }

    @addEventListener('#btn-list-view', 'click')
    onListView() {
      this.shadowRoot?.querySelector('#list-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    // ── 전체 리스트 클릭 → 레이어 팝업 + 비교 차트 ──
    @addEventListener('#category-list', 'click', { delegate: true })
    async onCategoryClick(e: Event) {
      const row = (e.target as HTMLElement).closest('.cat-row') as HTMLElement | null;
      if (!row?.dataset.ticsId) return;
      const ticsId = Number(row.dataset.ticsId);
      const name = row.dataset.name || '차트';
      const img = row.dataset.img || '';
      await this.openTicsChart(ticsId, name, img);
    }

    @addEventListener('#tics-layer-close', 'click')
    onChartClose() { this.closeTicsChart(); }

    @addEventListener('#tics-layer-backdrop', 'click')
    onChartBackdrop() { this.closeTicsChart(); }

    @addEventListener('#category-share-fab', 'click')
    async onShareFab(){
      const url = (this.ownerDocument as Document).defaultView?.location.href ?? window.location.href;
      const title = `카테고리 랭킹 | @dooboostore`;
      const text = `카테고리 랭킹을 확인해보세요!`;
      const fab = this.shadowRoot?.querySelector('#category-share-fab') as HTMLElement;
      const flash = () => {
        if(!fab) return;
        fab.textContent = '✓';
        fab.classList.add('copied');
        setTimeout(()=>{ if(fab.textContent === '✓'){ fab.textContent = '🔗'; fab.classList.remove('copied'); } }, 1500);
      };
      try{
        if((navigator as any).share){
          await (navigator as any).share({ title, text, url });
        } else {
          await navigator.clipboard?.writeText(url);
          flash();
        }
      }catch(err:any){
        if(err?.name !== 'AbortError'){
          try{ await navigator.clipboard?.writeText(url); flash(); }catch{}
        }
      }
    }

    private closeTicsChart() {
      const layer = this.shadowRoot?.querySelector('#tics-chart-layer') as HTMLElement;
      if (layer) { layer.classList.remove('open'); layer.setAttribute('aria-hidden','true'); }
      // body 스크롤 복원
      try { (this.ownerDocument as Document).body.style.overflow = ''; } catch {}
    }

    private async openTicsChart(ticsId: number, name: string, imgUrl: string) {
      const layer = this.shadowRoot?.querySelector('#tics-chart-layer') as HTMLElement;
      const titleEl = this.shadowRoot?.querySelector('#tics-layer-title') as HTMLElement;
      const ratesEl = this.shadowRoot?.querySelector('#tics-layer-rates') as HTMLElement;
      const loadingEl = this.shadowRoot?.querySelector('#tics-layer-loading') as HTMLElement;
      const errorEl = this.shadowRoot?.querySelector('#tics-layer-error') as HTMLElement;
      const canvas = this.shadowRoot?.querySelector('#tics-chart-canvas') as HTMLCanvasElement;
      if (!layer || !canvas) return;
      if (titleEl) titleEl.innerHTML = `${imgUrl ? `<img src="${imgUrl}" alt="" onerror="this.style.display='none'">` : ''}<span>${name}</span>`;
      if (ratesEl) ratesEl.innerHTML = '';
      if (errorEl) errorEl.style.display = 'none';
      if (loadingEl) loadingEl.style.display = 'block';
      canvas.style.display = 'none';
      layer.classList.add('open'); layer.setAttribute('aria-hidden','false');
      try { (this.ownerDocument as Document).body.style.overflow = 'hidden'; } catch {}
      try {
        const data = await this.tossService.getTicsComparisonChart({ ticsId, nation: this.nation });
        this.chartLayerData = data;
        if (loadingEl) loadingEl.style.display = 'none';
        canvas.style.display = 'block';
        // 범례
        const legendEl = this.shadowRoot?.querySelector('#tics-layer-legend') as HTMLElement;
        if (legendEl) {
          const colors: Record<string,string> = {};
          data.indicators.forEach((ind,i) => colors[ind.code] = i===0 ? '#1565c0' : i===1 ? '#94a3b8' : '#e5484d');
          legendEl.innerHTML = data.indicators.map(ind => {
            const c = ind.isPrimary ? '#1565c0' : '#94a3b8';
            const label = ind.type === 'INDEX' ? ind.name : ind.name;
            return `<span style="display:flex;align-items:center;gap:5px"><span style="width:14px;height:3px;border-radius:2px;background:${c}"></span>${label}</span>`;
          }).join('');
        }
        // 등락률 칩 (TICS vs 코스피 비교)
        if (ratesEl) {
          ratesEl.innerHTML = data.indicators.map(ind => {
            const title = ind.isPrimary ? ind.name : ind.name + '(비교)';
            const chips = ind.fluctuationRates.map(r => {
              const up = r.value >= 0;
              const cls = up ? 'up' : 'down';
              const sign = r.value >= 0 ? '+' : '';
              return `<span class="tics-rate-chip ${cls}">${sign}${r.value.toFixed(2)}%</span>`;
            }).join('');
            return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-size:11px;font-weight:800;color:#0f172a">${title}</span>${chips}</div>`;
          }).join('<div style="width:100%"></div>');
        }
        this.drawTicsChart(canvas, data);
      } catch (err) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (errorEl) { errorEl.textContent = '차트를 불러오지 못했습니다.'; errorEl.style.display = 'block'; }
        console.error(err);
      }
    }

    private drawTicsChart(canvas: HTMLCanvasElement, data: TicsComparisonChartResult) {
      const ctx = canvas.getContext('2d');
      if (!ctx || !data.indicators.length) return;
      const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.round(rect.width) || 700;
      const cssH = 260;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      // 전체 indicators 기준으로 Y 범위 계산 (TICS + 코스피 비교)
      const allVals = data.indicators.flatMap(ind => ind.prices.map(p => p.value));
      if (allVals.length === 0) return;
      const minV = Math.min(...allVals);
      const maxV = Math.max(...allVals);
      const pad = (maxV - minV) * 0.1 || Math.abs(maxV) * 0.05 || 1;
      const yMin = minV - pad;
      const yMax = maxV + pad;

      const padL = 46, padR = 14, padT = 12, padB = 28;
      const plotW = cssW - padL - padR;
      const plotH = cssH - padT - padB;
      // X는 첫 번째 indicator 길이 기준 (모든 indicator 동일한 날짜)
      const refLen = data.indicators[0].prices.length;
      const toX = (i: number) => padL + (i / Math.max(1, refLen - 1)) * plotW;
      const toY = (v: number) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

      // 배경 그리드
      ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1;
      for (let g = 0; g <= 4; g++) {
        const y = padT + (plotH * g) / 4;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(cssW - padR, y); ctx.stroke();
      }
      // 0선
      if (yMin <= 0 && yMax >= 0) {
        const zy = toY(0);
        ctx.strokeStyle = '#cbd5e1'; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(padL, zy); ctx.lineTo(cssW - padR, zy); ctx.stroke();
        ctx.setLineDash([]);
      }

      // 각 indicator 라인 그리기 (TICS는 파랑/채움, 코스피는 회색)
      data.indicators.forEach(ind => {
        const isPrimary = ind.isPrimary;
        const prices = ind.prices;
        ctx.beginPath();
        ctx.strokeStyle = isPrimary ? '#1565c0' : '#94a3b8';
        if (!isPrimary) ctx.setLineDash([6, 4]);
        ctx.lineWidth = isPrimary ? 2.2 : 1.8;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        prices.forEach((p, i) => {
          const x = toX(i), y = toY(p.value);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        if (!isPrimary) ctx.setLineDash([]);
        // primary만 영역 채우기
        if (isPrimary) {
          ctx.lineTo(toX(prices.length - 1), padT + plotH);
          ctx.lineTo(toX(0), padT + plotH);
          ctx.closePath();
          ctx.fillStyle = 'rgba(21,101,192,0.08)';
          ctx.fill();
        }
      });

      // Y 라벨
      ctx.fillStyle = '#94a3b8'; ctx.font = '10px -apple-system,sans-serif'; ctx.textAlign = 'right';
      for (let g = 0; g <= 4; g++) {
        const v = yMax - (yMax - yMin) * g / 4;
        const y = padT + (plotH * g) / 4;
        ctx.fillText(v.toFixed(1) + '%', padL - 6, y + 3);
      }
      // X 라벨 (시작/중간/끝)
      ctx.textAlign = 'center'; ctx.fillStyle = '#94a3b8';
      const refPrices = data.indicators[0].prices;
      const xLabels = [0, Math.floor(refPrices.length / 2), refPrices.length - 1];
      xLabels.forEach(i => {
        const d = refPrices[i]?.date ?? '';
        const label = d.slice(5).replace('-', '/'); // MM/DD
        if (label) ctx.fillText(label, toX(i), cssH - 6);
      });
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

          bubble-chart { display:block; width:100%; height:auto;  }
          @media(max-width:480px){ bubble-chart{ min-height:380px; } }

          #list-area .card-header { justify-content:space-between; }
          #chart-area .card-header { justify-content:space-between; }
          .btn-list-view {
            background:rgba(255,255,255,0.9); border:none; color:#1565c0;
            padding:6px 12px; border-radius:20px; font-size:11px; font-weight:800;
            cursor:pointer; display:flex; align-items:center; gap:4px; flex-shrink:0;
            transition:all .15s ease;
          }
          .btn-list-view:hover { background:#fff; transform:translateY(-1px); box-shadow:0 2px 8px rgba(0,0,0,0.12); }
          .btn-list-view:active { transform:translateY(0); }
          .list-count { font-size:11px; opacity:.85; font-weight:600; }
          #category-list { overflow-x:auto; }
          .cat-table { width:100%; border-collapse:collapse; min-width:680px; }
          .cat-table th {
            padding:8px 10px; background:#f8fafc; border-top:1px solid #f1f5f9; border-bottom:1px solid #f1f5f9;
            font-size:10px; font-weight:700; color:#94a3b8; text-align:left; white-space:nowrap; letter-spacing:.02em;
          }
          .cat-table th.num { text-align:right; }
          .cat-table td { padding:9px 10px; border-top:1px solid #f1f5f9; vertical-align:middle; }
          .cat-table tbody tr:hover { background:#f8fafc; }
          .cat-table tbody tr.cat-row { cursor:pointer; }
          .cat-table tbody tr.cat-row:active { background:#eef2ff; }
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
          .cat-turnover { font-size:11px; font-weight:700; color:#0369a1; background:#e0f2fe; padding:2px 7px; border-radius:10px; white-space:nowrap; display:inline-block; }
          .cat-amount, .cat-cap { font-size:12px; color:#475569; font-weight:600; white-space:nowrap; text-align:right; }
          .cat-cap { color:#94a3b8; }
          .cat-signal { font-size:11px; color:#64748b; background:#f1f5f9; padding:2px 6px; border-radius:8px; font-weight:600; white-space:nowrap; display:inline-block; max-width:140px; overflow:hidden; text-overflow:ellipsis; }
          .cat-signal-inline { font-size:10px; font-weight:700; color:#0c4a6e; background:#e0f2fe; border:1px solid #bae6fd; padding:2px 7px; border-radius:10px; margin-left:6px; white-space:nowrap; display:inline-block; vertical-align:middle; line-height:1.2; }
          @media(max-width:640px){ .cat-table{ min-width:580px; } }
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

          /* ── 차트 레이어 팝업 ── */
          #tics-chart-layer { display:none; position:fixed; inset:0; z-index:1000; }
          #tics-chart-layer.open { display:block; }
          .tics-layer-backdrop {
            position:absolute; inset:0; background:rgba(15,23,42,0.55); backdrop-filter:blur(2px);
          }
          .tics-layer-panel {
            position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
            width:min(720px, calc(100% - 24px)); max-height:calc(100vh - 24px);
            background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,0.25);
            display:flex; flex-direction:column; overflow:hidden;
          }
          .tics-layer-header {
            display:flex; align-items:center; justify-content:space-between; gap:12px;
            padding:14px 16px; border-bottom:1px solid #f1f5f9; flex-shrink:0;
          }
          .tics-layer-title { font-size:15px; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:8px; min-width:0; }
          .tics-layer-title img { width:28px; height:28px; border-radius:7px; object-fit:cover; background:#f1f5f9; flex-shrink:0; }
          .tics-layer-close {
            width:32px; height:32px; border-radius:8px; border:1px solid #e2e8f0; background:#fff;
            color:#64748b; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0;
          }
          .tics-layer-close:hover { background:#f8fafc; }
          .tics-layer-body { padding:14px 16px 16px; overflow:auto; }
          .tics-layer-rates { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
          .tics-rate-chip { padding:4px 8px; border-radius:20px; font-size:11px; font-weight:700; background:#f8fafc; border:1px solid #e2e8f0; color:#475569; }
          .tics-rate-chip.up { background:#fef2f2; border-color:#fecaca; color:#e5484d; }
          .tics-rate-chip.down { background:#eff6ff; border-color:#bfdbfe; color:#3e63dd; }
          #tics-chart-canvas { display:block; width:100%; height:260px; }
          .tics-layer-loading, .tics-layer-error { padding:24px; text-align:center; font-size:13px; color:#64748b; }
          .tics-layer-error { color:#e5484d; }
          @media(max-width:640px){ .tics-layer-panel{ width:calc(100% - 12px); } #tics-chart-canvas{ height:220px; } }
          .share-fab{position:fixed;bottom:24px;right:24px;width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#1565c0,#42a5f5);color:#fff;border:none;box-shadow:0 6px 20px rgba(21,101,192,0.45);cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:900;transition:transform .15s ease,box-shadow .15s ease}
          .share-fab:hover{transform:scale(1.08);box-shadow:0 8px 24px rgba(21,101,192,0.55)}
          .share-fab.copied{background:#10b981;box-shadow:0 6px 20px rgba(16,185,129,0.45)}
          .copyright{text-align:center;padding:14px 16px;color:#aaa;font-size:12px;margin-top:8px}
          .btn-size-view{background:rgba(255,255,255,0.9);border:none;color:#1565c0;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:4px;flex-shrink:0;transition:all .15s ease}
          .btn-size-view:hover{background:#fff;transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,0.12)}
          #chart-expand-layer{display:none;position:fixed;inset:0;z-index:1001}
          #chart-expand-layer.open{display:block}
          .chart-expand-backdrop{position:absolute;inset:0;background:rgba(15,23,42,0.55);backdrop-filter:blur(2px)}
          .chart-expand-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1100px,calc(100% - 24px));height:min(86vh,760px);background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.25);display:flex;flex-direction:column;overflow:hidden}
          .chart-expand-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #f1f5f9;flex-shrink:0}
          .chart-expand-title{font-size:15px;font-weight:800;color:#0f172a}
          .chart-expand-close{width:32px;height:32px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
          .chart-expand-close:hover{background:#f8fafc}
          .chart-expand-body{flex:1;min-height:0;display:flex;flex-direction:column;padding:12px;overflow:hidden}
          .chart-expand-body #expanded-bubble-chart{flex:1;min-height:0}
          @media(max-width:640px){.chart-expand-panel{width:calc(100% - 12px);height:86vh}.chart-expand-body #expanded-bubble-chart{min-height:420px}}
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
              <div style="margin-left:auto;display:flex;gap:8px">
                <button class="btn-list-view" id="btn-list-view" aria-label="전체 리스트 보기">📋 리스트 보기</button>
              </div>
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

        <div id="tics-chart-layer" aria-hidden="true">
          <div class="tics-layer-backdrop" id="tics-layer-backdrop"></div>
          <div class="tics-layer-panel" role="dialog" aria-modal="true">
            <div class="tics-layer-header">
              <div class="tics-layer-title" id="tics-layer-title">차트</div>
              <button class="tics-layer-close" id="tics-layer-close" aria-label="닫기">✕</button>
            </div>
              <div class="tics-layer-body">
              <div class="tics-layer-rates" id="tics-layer-rates"></div>
              <div id="tics-layer-legend" style="display:flex;gap:12px;align-items:center;margin-bottom:10px;font-size:11px;color:#64748b"></div>
              <div id="tics-layer-loading" class="tics-layer-loading" style="display:none"><div class="spinner" style="margin:0 auto 10px"></div>차트 불러오는 중…</div>
              <div id="tics-layer-error" class="tics-layer-error" style="display:none"></div>
              <canvas id="tics-chart-canvas" width="700" height="260"></canvas>
            </div>
          </div>
        </div>

        <button id="category-share-fab" class="share-fab" title="공유">🔗</button>
        <footer class="copyright">© ${new Date().getFullYear()} dooboostore</footer>
      `;
    }
  }

  return tagName;
};
