import { elementDefine, onConnectedBodyShadow, onConnectedBefore, onConnectedAfter, onInitialize, addEventListener, addEventListenerDocument, innerHtml, setAttribute } from '@dooboostore/simple-web-component';
import { Router } from '@dooboostore/core-web';
import { inject } from '@dooboostore/simple-boot';
import { TossService } from '../../services/toss/TossService';
import {
  NPTI_AXIS_INFO,
  NPTI_TYPE_INFO,
  NPTI_TYPE_ORDER,
  NPTI_AXES_8,
  NptiTypeInfo,
  AXIS_DIM_COLOR,
  DIM_COLOR_NAME,
  pairFillStyle,
} from './NptiTypes';

const tagName = 'center-stock-npti-page';

function clamp(v:number, lo=0, hi=100){ return Math.max(lo, Math.min(hi, v)); }
function avg(arr:number[]){ return arr.length? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

const HERO_IDX: Record<string,number> = { E:0, N:1, F:2, P:3, I:4, S:5, T:6, J:7 };

function gradientLetterStyle(ch: string, scores?: number[]): string {
  const color = AXIS_DIM_COLOR[ch] ?? '#fff';
  if(!scores) return `color:${color};`;
  const v = scores[HERO_IDX[ch]] ?? 50;
  const fillPct = Math.round(v);
  if(fillPct <= 0) return `color:#ffffff;`;
  const gradient = `linear-gradient(to top, ${color} 0%, ${color} ${fillPct}%, #ffffff ${fillPct}%, #ffffff 100%)`;
  return `background:${gradient};-webkit-background-clip:text;background-clip:text;color:transparent;`;
}

function coloredType(type: string, scores?: number[]): string {
  return type.split('').map(ch =>
    `<span style="${gradientLetterStyle(ch, scores)}">${ch}</span>`
  ).join('');
}

function coloredTypeChange(prev: string, cur: string, scores?: number[]): string {
  return cur.split('').map((ch,i) => {
    const baseStyle = gradientLetterStyle(ch, scores);
    const changed = ch !== prev[i];
    const color = AXIS_DIM_COLOR[ch] ?? '#fff';
    const style = changed
      ? `${baseStyle};text-decoration:underline;text-decoration-color:${color};text-underline-offset:3px;font-weight:800`
      : baseStyle;
    return `<span style="${style}">${ch}</span>`;
  }).join('');
}

// 조합 글자만 색상 표시 (히어로용) — 점수에 따라 아래→위 그라데이션
function coloredTypeHero(type: string, scores?: number[]): string {
  const letters = type.split('').map(ch => {
    return `<span class="hero-letter" style="${gradientLetterStyle(ch, scores)}">${ch}</span>`;
  }).join('');
  return `<span class="npti-hero-letters">${letters}</span>`;
}

function badgeInner(type: string, colored: string): string {
  const name = NPTI_TYPE_INFO[type]?.name ?? '';
  return name ? `<span class="badge-name">${name}</span>${colored}` : colored;
}

type NptiChartPoint = { date: string; open: number; high: number; low: number; close: number; volume: number; };
function computeScores8(candles: NptiChartPoint[], marketValue = 1e14, baselineAmount?: number){
  const slice = candles;
  if(!slice.length) return [50,50,50,50,50,50,50,50];
  let E: number;
  if(baselineAmount && baselineAmount > 0){
    const avgAmt = avg(slice.map(c=>c.close*c.volume));
    E = clamp(50 + ((avgAmt/baselineAmount) - 1)*30, 0, 100);
  } else {
    const totalAmount = slice.reduce((s,c)=>s + c.close*c.volume, 0);
    const turnover = totalAmount / marketValue;
    E = clamp(50 + (turnover - 1)*30, 0, 100);
  }
  const start = slice[0].close;
  const end = slice[slice.length-1].close;
  const ret = start ? ((end-start)/start)*100 : 0;
  const N = clamp(50 + ret*0.8, 0, 100);
  const volats = slice.map(c=> c.open? ((c.high-c.low)/c.open)*100 : 0);
  const P = clamp(avg(volats)*8, 0, 100);
  const closes = slice.map(c=> {
    const range = c.high - c.low;
    if(range===0) return 50;
    return ((c.close - c.low)/range)*100;
  });
  const F = clamp(avg(closes), 0, 100);
  return [clamp(E),clamp(N),clamp(F),clamp(P),clamp(100-E),clamp(100-N),clamp(100-F),clamp(100-P)];
}

function nptiType(scores:number[]){
  const E = scores[0]>50?'E':'I';
  const N = scores[1]>50?'N':'S';
  const F = scores[2]>50?'F':'T';
  const P = scores[3]>50?'P':'J';
  return E+N+F+P;
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if(existing) return tagName;

  @elementDefine(tagName, { window: w })
  class StockNptiPage extends w.HTMLElement {
    @onConnectedBefore
    @innerHtml((c, helper) => helper.$w.document.querySelector("title"), { valueKey: "titleBody" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:title"]'), "content", { valueKey: "ogTitle" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="description"]'), "content", { valueKey: "desc" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:description"]'), "content", { valueKey: "ogDesc" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:image"]'), "content", { valueKey: "ogImage" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:image"]'), "content", { valueKey: "twitterImage" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:title"]'), "content", { valueKey: "twitterTitle" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:description"]'), "content", { valueKey: "twitterDesc" })
    setPageMeta() {
      return {
        titleBody: "주식 NPTI | @dooboostore",
        ogTitle: "주식 NPTI | @dooboostore",
        desc: "내 종목의 MBTI는? 캔들 데이터로 산출한 8축 NPTI로 종목의 성격을 분석해보세요.",
        ogDesc: "내 종목의 MBTI는? 캔들 데이터로 산출한 8축 NPTI로 종목의 성격을 분석해보세요.",
        ogImage: "/assets/images/stock-npti-og.png",
        twitterImage: "/assets/images/stock-npti-og.png",
        twitterTitle: "주식 NPTI | @dooboostore",
        twitterDesc: "내 종목의 MBTI는? 캔들 데이터로 산출한 8축 NPTI로 종목의 성격을 분석해보세요.",
      };
    }

    private router!: Router;
    private tossService!: TossService;
    private candles: NptiChartPoint[] = [];
    private marketValue = 1e14;
    private baselineAmount = 0;
    private currentCode = 'A005930';
    private currentName = '삼성전자';
    private windowSize = 50;
    private viewStart = 0;
    private segScores: number[][] = [];
    private selectedRadioValue: string = 'body';

    @onInitialize
    async onInit(@inject(TossService.SYMBOL) tossService: TossService, router: Router){
      this.tossService = tossService;
      this.router = router;
      try{
        const code = router?.getSearchParams?.()?.get('code');
        if(code){
          const norm = code.trim();
          if(norm){
            this.currentCode = /^[A-Z]/.test(norm) ? norm : `A${norm.replace(/^A/,'')}`;
            this.currentName = norm;
            try{
              let nm: string | undefined = (await this.tossService.getOverview(this.currentCode).catch(()=>null))?.company?.name?.trim();
              if(!nm){
                const prod = (await this.tossService.searchProduct(norm).catch(()=>[]))?.[0];
                nm = prod?.productName?.trim();
              }
              if(nm) this.currentName = nm;
            }catch{}
          }
        }
      }catch{}
      await this.loadStock(this.currentCode, this.currentName);
    }

    @onConnectedAfter
    onConnectedAfterInit(){
      // details toggle은 @addEventListener('#window-panel-details', 'toggle')로 처리
    }

    private async loadStock(code:string, name:string){
      this.currentCode = code;
      this.currentName = name;
      try{
        const cur = this.router?.getSearchParams?.()?.get('code');
        if(cur !== code) this.router?.replaceUpsertSearchParam?.({ code });
      }catch{}

      // 검색창 value만 업데이트
      const searchInput = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      if(searchInput) searchInput.value = name;

      try{
        const [chartRes, overview] = await Promise.all([
          this.tossService.getChart(code, { count: 365, timeframe: 'day:1' }).catch(()=>null),
          this.tossService.getOverview(code).catch(()=>null)
        ]);
        const raw = chartRes?.candles ?? [];
        this.candles = raw.map(c=>({ date: c.dt.slice(0,10), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }))
          .sort((a,b)=> a.date.localeCompare(b.date));
        let resolvedName = overview?.company?.name?.trim();
        if(!resolvedName){
          try{
            const prod = (await this.tossService.searchProduct(code).catch(()=>[]))?.[0];
            if(!prod && name !== code){
              const prod2 = (await this.tossService.searchProduct(name).catch(()=>[]))?.[0];
              resolvedName = prod2?.productName?.trim();
            } else resolvedName = prod?.productName?.trim();
          }catch{}
        }
        const isCodeLike = (v:string)=> /^(A\d{6}|US.+|\d{6})$/.test(v.trim());
        if(resolvedName && (this.currentName === code || isCodeLike(this.currentName))) this.currentName = resolvedName;
        // 검색창도 이름으로 갱신
        const inp2 = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
        if(inp2 && this.currentName !== code) inp2.value = this.currentName;
        const cap = Number(overview?.marketValueKrw ?? overview?.marketValue ?? 0);
        this.marketValue = cap > 0 ? cap : 1e14;
        this.baselineAmount = this.candles.length ? avg(this.candles.map(c=>c.close*c.volume)) : 0;
        this.viewStart = Math.max(0, this.candles.length - this.windowSize);

        this.updateHeroSection();
        this.drawChart();
        this.drawRadar();
        this.drawSegments();
        this.updateSelectedInfo(this.selectedRadioValue);
        this.updateWinSliderMax();
      }catch(e){ console.error(e); }
    }

    private buildChartTicks(showRect = false): string {
      const rect = showRect ? (() => {
        const slice = this.candles.slice(this.viewStart, this.viewStart+this.windowSize);
        const startDate = slice[0]?.date;
        const endDate = slice[slice.length-1]?.date;
        return (startDate && endDate)
          ? `<rect date-start="${startDate}" date-end="${endDate}" target="candle" fill="rgba(99,102,241,0.12)" stroke="rgba(99,102,241,0.6)" stroke-width="1"></rect>`
            + `<rect date-start="${startDate}" date-end="${endDate}" target="volume" fill="rgba(99,102,241,0.22)" stroke="rgba(99,102,241,0.7)" stroke-width="1"></rect>`
          : '';
      })() : '';
      return this.candles.map(c=>
        `<candle date="${c.date}" open="${c.open}" high="${c.high}" low="${c.low}" close="${c.close}" volume="${c.volume}"></candle>`
      ).join('') + rect;
    }

    private buildRadarScoreHtml(bodyScores: number[], curScores: number[], showWin = false): string {
      const axesHtml = NPTI_AXES_8.map((axis,i)=>
        `<axis id="${axis}" label="${axis} ${NPTI_AXIS_INFO[axis].name.replace(/·/g, '\n')}" color="${AXIS_DIM_COLOR[axis]}"></axis>`
      ).join('');
      const bodySet = `<score-set stroke-style="rgba(148,163,184,0.6)" fill-style="rgba(148,163,184,0.18)">${NPTI_AXES_8.map((axis,i)=>`<score axis="${axis}" value="${bodyScores[i]}"></score>`).join('')}</score-set>`;
      const winSet = showWin
        ? `<score-set stroke-style="rgba(99,102,241,0.9)" fill-style="rgba(99,102,241,0.32)">${NPTI_AXES_8.map((axis,i)=>`<score axis="${axis}" value="${curScores[i]}"></score>`).join('')}</score-set>`
        : '';
      return axesHtml + bodySet + winSet;
    }

    private drawChart(){
      const el = this.shadowRoot?.querySelector('stock-chart') as HTMLElement;
      if(!el) return;
      const details = this.shadowRoot?.querySelector('#window-panel-details') as HTMLDetailsElement;
      const showRect = details?.open ?? false;
      el.innerHTML = this.buildChartTicks(showRect);
    }

    private drawRadar(){
      const el = this.shadowRoot?.querySelector('stock-radar') as HTMLElement;
      if(!el) return;
      const winScores = this.candles.length ? computeScores8(this.candles.slice(this.viewStart, this.viewStart+this.windowSize), this.marketValue, this.baselineAmount) : [50,50,50,50,50,50,50,50];
      const bodyScores = this.candles.length ? computeScores8(this.candles, this.marketValue) : winScores;

      let grayScores: number[];
      if(this.selectedRadioValue === 'body'){
        grayScores = bodyScores;
      } else if(this.selectedRadioValue.startsWith('seg-')){
        const idx = Number(this.selectedRadioValue.replace('seg-', ''));
        grayScores = this.segScores[idx] ?? bodyScores;
      } else {
        grayScores = bodyScores;
      }

      const details = this.shadowRoot?.querySelector('#window-panel-details') as HTMLDetailsElement;
      const showWin = details?.open ?? false;

      el.innerHTML = this.buildRadarScoreHtml(grayScores, winScores, showWin);

      // npti-type은 shadow DOM (form 안)
      const t = this.shadowRoot?.querySelector('#npti-type') as HTMLElement;
      if(t){
        if(this.candles.length) {
          const type = nptiType(bodyScores);
          t.innerHTML = `<span class="hero-name">${NPTI_TYPE_INFO[type]?.name ?? ''}</span>${coloredTypeHero(type, bodyScores)}`;
          t.dataset.type = type;
        } else t.innerHTML = '--';
      }

      const legend = this.shadowRoot?.querySelector('#radar-legend') as HTMLElement;
      if(legend){
        const type = nptiType(winScores);
        legend.innerHTML = `<span class="npti-badge seg-badge window-badge" style="margin-top:0;cursor:pointer; width: 60px; text-align: center" data-type="${type}">${badgeInner(type, coloredType(type, winScores))}</span>`;
      }
    }

    private drawSegments(){
      const wrap = this.shadowRoot?.querySelector('#npti-segments') as HTMLElement;
      if(!wrap) return;
      const segs = [
        { label:'앞 30%', from:0, to: Math.floor(this.candles.length*0.3) },
        { label:'30-60%', from:Math.floor(this.candles.length*0.3), to: Math.floor(this.candles.length*0.6) },
        { label:'60-90%', from:Math.floor(this.candles.length*0.6), to: Math.floor(this.candles.length*0.9) },
        { label:'최근 10%', from:Math.floor(this.candles.length*0.9), to: this.candles.length },
      ];
      const steps = segs.map(s=>{
        const slice = this.candles.slice(s.from, s.to);
        const sc = slice.length? computeScores8(slice, this.marketValue, this.baselineAmount) : [50,50,50,50,50,50,50,50];
        return { label: s.label, type: nptiType(sc), scores: sc };
      });
      this.segScores = steps.map(st=>st.scores);
      wrap.innerHTML = `
        <div class="flow-wrap">
          <div class="flow-steps">
            ${steps.map((st,i)=>`
              <div class="flow-step">
                <label class="npti-result-item">
                  <input type="radio" name="npti-pick" value="seg-${i}" class="npti-radio">
                  <span class="npti-radio-icon" title="이 결과로 레이더 보기">
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  </span>
                  <span class="npti-badge seg-badge" style="margin-top:0;cursor:pointer" data-type="${st.type}" data-seg="${i}">${badgeInner(st.type, i===0 ? coloredType(st.type, st.scores) : coloredTypeChange(steps[i-1].type, st.type, st.scores))}</span>
                </label>
                <span class="flow-label">${st.label}</span>
              </div>${i < steps.length-1 ? '<div class="flow-arrow">›</div>' : ''}`).join('')}
          </div>
        </div>`;
    }

    // #npti-select-form 안의 npti-hero + segments-section 업데이트
    private updateHeroSection(): void {
      const form = this.shadowRoot?.querySelector('#npti-select-form') as HTMLElement;
      if(!form) return;
      form.innerHTML = `
        <div class="npti-hero">
          <div class="npti-hero-label">🧬 ${this.currentName} <span style="color:#cbd5e1;font-weight:600">${this.currentCode}</span> · 전체 1년 NPTI</div>
          <label class="npti-result-item">
            <input type="radio" name="npti-pick" value="body" checked class="npti-radio">
            <span class="npti-radio-icon" title="이 결과로 레이더 보기">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </span>
            <div id="npti-type" class="npti-hero-type">--</div>
          </label>
        </div>
        <div class="segments-section">
          <div class="hint" style="margin-bottom:8px;color:#64748b">전체 구간별 변화 추이</div>
          <div id="npti-segments"></div>
        </div>
      `;
      // radio 선택 상태 초기화
      this.selectedRadioValue = 'body';
    }

    private updateWinSliderMax(): void {
      const maxStart = Math.max(0, this.candles.length - this.windowSize);

      const winSlider = this.shadowRoot?.querySelector('#win-slider') as HTMLInputElement;
      if(winSlider){
        winSlider.max = String(this.candles.length > 0 ? this.candles.length : 120);
        winSlider.value = String(this.windowSize);
      }
      const winLabel = this.shadowRoot?.querySelector('#win-label') as HTMLElement;
      if(winLabel) winLabel.textContent = String(this.windowSize);

      const winStart = this.shadowRoot?.querySelector('#win-start') as HTMLInputElement;
      if(winStart){
        winStart.max = String(maxStart);
        winStart.value = String(this.viewStart);
      }
      const winStartLabel = this.shadowRoot?.querySelector('#win-start-label') as HTMLElement;
      if(winStartLabel) winStartLabel.textContent = String(this.viewStart);
    }

    private typeInfo(code: string): NptiTypeInfo | null {
      return NPTI_TYPE_INFO[code] || NPTI_AXIS_INFO[code] || null;
    }

    private renderDoc(info: NptiTypeInfo, scores?: number[]): string {
      const scoresHtml = scores ? `
        <div class="doc-scores">
          <div class="doc-scores-title">📊 항목별 점수 (0~100)</div>
          <div class="doc-scores-row">
            ${NPTI_AXES_8.map((axis,i)=>`<span class="doc-score"><span style="color:${AXIS_DIM_COLOR[axis]};font-weight:800">${axis}</span> ${Math.round(scores[i])}%</span>`).join('')}
          </div>
        </div>` : '';
      return `<div class="doc-name">${info.emoji ?? ''} ${info.code} · ${info.name}</div>
        <div class="doc-tagline">${info.tagline}</div>
        ${scoresHtml}
        <div class="doc-desc">${info.desc}</div>`;
    }

    private openPopup(code: string, scores?: number[]){
      const info = this.typeInfo(code);
      if(!info) return;
      const title = this.shadowRoot?.querySelector('#npti-popup-title') as HTMLElement;
      const body = this.shadowRoot?.querySelector('#npti-popup-body') as HTMLElement;
      const popup = this.shadowRoot?.querySelector('#npti-popup') as HTMLElement;
      if(title) title.textContent = `${info.code} · ${info.name}`;
      if(body) body.innerHTML = this.renderDoc(info, scores);
      if(popup) popup.classList.add('show');
    }

    private closePopup(){
      const popup = this.shadowRoot?.querySelector('#npti-popup') as HTMLElement;
      if(popup) popup.classList.remove('show');
    }

    @addEventListener('.header-back', 'click')
    onBack(){ this.router.go('/'); }

    @addEventListener('#stock-search-btn', 'click')
    onSearchBtn(){ this.doSearch(); }

    private async doSearch(){
      const input = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      const q = input?.value.trim();
      if(!q) return;
      const list = await this.tossService.searchProduct(q);
      const box = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      if(!box) return;
      box.innerHTML = list.slice(0,10).map(it=>`
        <div class="search-item" data-code="${it.productCode}" data-name="${it.productName}">
          <div style="flex:1"><div style="font-weight:700;font-size:13px">${it.productName}</div><div style="font-size:11px;color:#64748b">${it.productCode} · ${it.market}</div></div>
          <div style="font-size:11px;color:#0ea5e9">선택</div>
        </div>`).join('') || `<div style="padding:12px;color:#64748b">결과 없음</div>`;
      box.classList.add('show');
    }

    @addEventListener('#stock-search', 'keydown')
    onSearchKey(e:KeyboardEvent){
      if(e.key==='Enter'){ e.preventDefault(); this.doSearch(); }
      if(e.key==='Escape'){
        const b = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
        b?.classList.remove('show');
      }
    }

    @addEventListener('#stock-search-clear', 'click')
    onClearSearch(){
      const input = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      if(input) input.value = '';
      const box = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      box?.classList.remove('show');
      input?.focus();
    }

    @addEventListenerDocument('click')
    onDocClick(e:MouseEvent){
      const box = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      if(!box?.classList.contains('show')) return;
      const wrap = this.shadowRoot?.querySelector('.search-wrap') as HTMLElement;
      const target = e.target as Node;
      if(wrap && target.isConnected && wrap.contains(target)) return;
      box.classList.remove('show');
    }

    @addEventListener('#search-results', 'click', { delegate: true })
    onPick(e:Event){
      const el = (e.target as HTMLElement).closest('.search-item') as HTMLElement;
      if(!el) return;
      const code = el.dataset.code!;
      const name = el.dataset.name!;
      const box = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      box?.classList.remove('show');
      const input = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      if(input) input.value = name;
      this.loadStock(code, name);
    }

    @addEventListener('#win-slider', 'input')
    onWinSlider(e:Event){
      const v = Number((e.target as HTMLInputElement).value);
      this.windowSize = v;
      const label = this.shadowRoot?.querySelector('#win-label') as HTMLElement;
      if(label) label.textContent = String(v);
      const maxStart = Math.max(0, this.candles.length - this.windowSize);
      const startInput = this.shadowRoot?.querySelector('#win-start') as HTMLInputElement;
      if(startInput){
        startInput.max = String(maxStart);
        if(this.viewStart > maxStart){
          this.viewStart = maxStart;
          const sl = this.shadowRoot?.querySelector('#win-start-label') as HTMLElement;
          if(sl) sl.textContent = String(this.viewStart);
          startInput.value = String(this.viewStart);
        }
      }
      this.drawChart();
      this.drawRadar();
      // drawSegments는 캔들 전체 4구간 분석이라 윈도우 크기와 무관 — 호출 안 함
    }

    @addEventListener('#win-start', 'input')
    onStartSlider(e:Event){
      this.viewStart = Number((e.target as HTMLInputElement).value);
      const label = this.shadowRoot?.querySelector('#win-start-label') as HTMLElement;
      if(label) label.textContent = String(this.viewStart);
      this.drawChart();
      this.drawRadar();
    }

    // light DOM 이벤트 (form 안 badge 클릭)
    @addEventListener('#npti-type, .seg-badge', 'click', { delegate: true })
    onBadgeClick(e:Event){
      const el = (e.target as HTMLElement).closest('#npti-type, .seg-badge') as HTMLElement;
      const code = el?.dataset.type;
      if(!code) return;
      let scores: number[] | undefined;
      if(el.id === 'npti-type' && this.candles.length){
        scores = computeScores8(this.candles, this.marketValue);
      } else if(el.classList.contains('window-badge') && this.candles.length){
        scores = computeScores8(this.candles.slice(this.viewStart, this.viewStart+this.windowSize), this.marketValue, this.baselineAmount);
      } else if(el.classList.contains('seg-badge')){
        const badges = this.shadowRoot?.querySelectorAll('.seg-badge:not(.window-badge)');
        const idx = Array.from(badges ?? []).indexOf(el);
        if(idx >= 0 && this.segScores[idx]) scores = this.segScores[idx];
      }
      this.openPopup(code, scores);
    }

    @addEventListener('#npti-select-form', 'change', { delegate: true })
    onRadioChange(e: Event){
      const radio = e.target as HTMLInputElement;
      if(radio.type !== 'radio') return;
      this.selectedRadioValue = radio.value;
      this.updateSelectedInfo(radio.value);
      this.drawRadar();
    }

    @addEventListener('#window-panel-details', 'toggle')
    onWindowPanelToggle(){
      const details = this.shadowRoot?.querySelector('#window-panel-details') as HTMLDetailsElement;
      if(!details?.open){
        const legend = this.shadowRoot?.querySelector('#radar-legend') as HTMLElement;
        if(legend) legend.innerHTML = '';
      }
      this.drawChart();
      this.drawRadar();
    }

    private updateSelectedInfo(value: string): void {
      const infoEl = this.shadowRoot?.querySelector('#npti-selected-info') as HTMLElement;
      if(!infoEl) return;
      let type = '';
      if(value === 'body'){
        const t = this.shadowRoot?.querySelector('#npti-type') as HTMLElement;
        type = t?.dataset.type ?? '';
      } else if(value.startsWith('seg-')){
        const idx = Number(value.replace('seg-', ''));
        const badge = this.shadowRoot?.querySelector(`.seg-badge[data-seg="${idx}"]`) as HTMLElement;
        type = badge?.dataset.type ?? '';
      }
      const info = NPTI_TYPE_INFO[type];
      if(!info){ infoEl.innerHTML = ''; return; }
      infoEl.innerHTML = `
        <div class="npti-selected-emoji">${info.emoji ?? ''}</div>
        <div class="npti-selected-name">${coloredType(type)} <span class="npti-selected-name-text">${info.name}</span></div>
        <div class="npti-selected-tagline">${info.tagline ?? ''}</div>
      `;
    }

    @addEventListener('.browse-btn', 'click', { delegate: true })
    onBrowseClick(e:Event){
      const btn = (e.target as HTMLElement).closest('.browse-btn') as HTMLElement;
      const code = btn?.dataset.type;
      if(code) this.openPopup(code);
    }

    @addEventListener('#npti-popup-close', 'click')
    onPopupClose(){ this.closePopup(); }

    @addEventListener('#npti-popup', 'click')
    onPopupOverlay(e:Event){
      if((e.target as HTMLElement) === e.currentTarget) this.closePopup();
    }

    @addEventListener('#npti-formula-link', 'click')
    onFormulaBtn(){
      const popup = this.shadowRoot?.querySelector('#npti-formula-popup') as HTMLElement;
      if(popup) popup.classList.add('show');
    }

    @addEventListener('#npti-share-fab', 'click')
    async onShareFab(){
      const url = window.location.href;
      const title = `주식 NPTI · ${this.currentName}`;
      const text = `[${this.currentName}]의 NPTI를 확인해보세요!`;
      const fab = this.shadowRoot?.querySelector('#npti-share-fab') as HTMLElement;
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

    @addEventListener('#npti-formula-close', 'click')
    onFormulaClose(){
      const popup = this.shadowRoot?.querySelector('#npti-formula-popup') as HTMLElement;
      if(popup) popup.classList.remove('show');
    }

    @addEventListener('#npti-formula-popup', 'click')
    onFormulaOverlay(e:Event){
      if((e.target as HTMLElement) === e.currentTarget){
        const popup = this.shadowRoot?.querySelector('#npti-formula-popup') as HTMLElement;
        if(popup) popup.classList.remove('show');
      }
    }

    @onConnectedBodyShadow
    render(){
      const browsePairs: [string, string, string[]][] = [
        ['E-I','수급',['E','I']],['N-S','추세',['N','S']],['F-T','심리',['F','T']],['P-J','변동성',['P','J']]
      ];
      const browseAxesHtml = browsePairs.map(([pair, pname, axes])=>`
          <div class="browse-pair" style="${pairFillStyle(pair)}">
            <div class="browse-pair-head">
              <span class="browse-pair-label" style="color:${DIM_COLOR_NAME[pair]}">${pair}</span>
              <span class="browse-pair-name" style="color:${DIM_COLOR_NAME[pair]}">${pname}</span>
            </div>
            <div class="browse-pair-btns">
              ${axes.map(c=>`<button class="browse-btn" data-type="${c}"><span class="btn-code">${c}</span><span class="btn-name">${NPTI_AXIS_INFO[c].name}</span></button>`).join('')}
            </div>
          </div>`).join('');
      const browseTypesHtml = NPTI_TYPE_ORDER.map(c=>`<button class="browse-btn browse-type-btn" data-type="${c}"><span class="btn-code">${NPTI_TYPE_INFO[c].emoji ?? ''} ${c}</span><span class="btn-name">${NPTI_TYPE_INFO[c].name}</span></button>`).join('');

      return `
        <style>
          :host { display: block; min-height: 100vh; background: #f0f2f5; font-family: var(--font-family, sans-serif); }
          .header { display:flex; align-items:center; gap:12px; padding:16px 24px; background:linear-gradient(135deg,#1565c0 0%,#1976d2 60%,#42a5f5 100%); color:white; }
          .header-back { background:rgba(255,255,255,0.2); border:none; color:white; width:40px; height:40px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:20px; }
          .header-back:hover { background:rgba(255,255,255,0.3); }
          .header-title { font-size:22px; font-weight:700; flex:1; }
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
          .controls{display:flex;flex-direction:column;gap:10px;width:100%;margin-top:12px;background:#f8fafc;border:1px solid #eef2ff;border-radius:12px;padding:12px 14px;box-sizing:border-box;min-width:0}
          .ctrl-row{display:flex;align-items:center;gap:8px;min-width:0}
          .ctrl-label{font-size:12px;font-weight:700;color:#64748b;min-width:60px;white-space:nowrap}
          .ctrl-value{min-width:38px;text-align:center;background:#eef2ff;color:#6366f1;font-weight:800;font-size:13px;border-radius:6px;padding:2px 8px;font-variant-numeric:tabular-nums;box-sizing:border-box}
          .ctrl-row input[type=range]{flex:1;min-width:0;width:auto}
          .controls input[type=range]{-webkit-appearance:none;appearance:none;height:6px;border-radius:999px;background:#e2e8f0;outline:none;cursor:pointer;margin:0}
          .controls input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;border-radius:50%;background:#6366f1;border:2px solid #fff;box-shadow:0 1px 4px rgba(99,102,241,0.4);cursor:pointer;transition:transform .15s ease}
          .controls input[type=range]::-webkit-slider-thumb:hover{transform:scale(1.15)}
          .controls input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#6366f1;border:2px solid #fff;cursor:pointer}
          .controls input[type=range]::-moz-range-track{height:6px;border-radius:999px;background:#e2e8f0}
          .chart-wrap{height:130px;padding:4px 12px 8px}
          stock-chart{width:100%;height:100%;display:block}
          .radar-wrap{display:flex;flex-direction:column;align-items:center;padding:4px 12px 0}
          .npti-hero{display:flex;flex-direction:column;align-items:center;padding:16px 12px 16px;overflow:visible}
          .npti-hero-label{font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:1px;margin-bottom:8px}
          .npti-hero-type{font-size:44px;font-weight:900;letter-spacing:0;line-height:1;cursor:pointer;background:#0f172a;border-radius:16px;padding:14px 22px;color:#fff;box-shadow:0 4px 16px rgba(15,23,42,0.18);transition:transform .18s ease,box-shadow .18s ease;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
          .hero-letter{display:inline-flex;align-items:center}
          .npti-hero-letters{display:flex;align-items:center;gap:12px}
          .npti-hero-type:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(15,23,42,0.24)}
          .hero-name{font-size:12px;font-weight:600;color:rgba(255,255,255,0.5);letter-spacing:0.3px;white-space:nowrap}
          .badge-name{display:block;font-size:9px;font-weight:500;color:rgba(255,255,255,0.55);margin-bottom:3px;white-space:nowrap;text-align:center}
          .window-panel{margin:10px 12px 12px;border:1px dashed #c7d2fe;border-radius:12px;padding:12px;background:#f5f7ff}
          .window-panel summary{list-style:none;cursor:pointer}
          .window-panel summary::-webkit-details-marker{display:none}
          .window-panel[open] .window-panel-head{margin-bottom:8px}
          .window-panel-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
          .window-panel-title{font-size:12px;font-weight:800;color:#6366f1;flex:1}
          .window-panel-head::after{content:'›';font-size:16px;font-weight:800;color:#6366f1;transition:transform .2s ease;display:inline-block;transform:rotate(90deg)}
          .window-panel[open] .window-panel-head::after{transform:rotate(270deg)}
          #npti-radar{width:360px;height:360px;max-width:100%}
          stock-radar{width:100%;height:100%;display:block}
          .npti-badge{margin-top:8px;background:#0f172a;color:#fff;border-radius:15px;padding:6px 14px;font-weight:800;letter-spacing:0.5px}
          .flow-wrap{position:relative;width:100%;padding:2px 0 4px}
          .flow-steps{position:relative;display:flex;align-items:flex-start;justify-content:space-between;gap:1px;z-index:1}
          .flow-step{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0;flex:1}
          .flow-arrow{color:#94a3b8;font-weight:800;font-size:18px;flex-shrink:0;line-height:1;margin-top:12px}
          .flow-label{font-size:10px;font-weight:700;color:#94a3b8;white-space:nowrap}
          .segments-section{border-top:1px solid #eef2ff;padding:12px}
          .npti-result-item{position:relative;display:inline-flex;cursor:pointer}
          .npti-radio{position:absolute;opacity:0;width:0;height:0;pointer-events:none}
          .npti-radio-icon{position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:#94a3b8;border:1.5px solid #94a3b8;display:flex;align-items:center;justify-content:center;color:#fff;z-index:2;transition:all .18s ease;box-shadow:0 1px 4px rgba(0,0,0,0.15)}
          .npti-result-item:hover .npti-radio-icon{background:#6366f1;border-color:#6366f1;box-shadow:0 2px 8px rgba(99,102,241,0.3)}
          .npti-radio:checked ~ .npti-radio-icon{background:#6366f1;border-color:#6366f1;color:#fff;box-shadow:0 2px 10px rgba(99,102,241,0.55)}
          .npti-selected-info{padding:16px 16px 4px;display:flex;flex-direction:column;align-items:center;gap:4px;min-height:0;transition:all .2s ease}
          .npti-selected-info:empty{padding:0}
          .npti-selected-emoji{font-size:40px;line-height:1}
          .npti-selected-name{font-size:22px;font-weight:900;display:flex;align-items:center;gap:8px}
          .npti-selected-name-text{font-size:16px;font-weight:700;color:#334155}
          .npti-selected-tagline{font-size:12px;color:#94a3b8;text-align:center;line-height:1.5}
          .hint{font-size:11px;color:#64748b}
          .browse-section{padding:12px}
          .browse-section-title{font-size:11px;font-weight:700;color:#64748b;margin-bottom:8px;display:flex;align-items:center;gap:6px}
          .browse-section-title::before{content:'';width:3px;height:11px;background:#6366f1;border-radius:2px}
          .browse-types{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:6px;min-width:0}
          .browse-types .browse-btn{min-width:0;width:100%}
          .browse-axes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;min-width:0}
          @media(max-width:700px){.browse-axes{grid-template-columns:repeat(2,minmax(0,1fr))}}
          .browse-pair{display:flex;flex-direction:column;gap:6px;min-width:0;background:var(--axis-fill,#f8fafc);border:1px solid var(--axis-border,#f1f5f9);border-radius:12px;padding:10px}
          .browse-pair .browse-btn{--axis-fill:#fff;--axis-border:#e2e8f0;--axis-color:#334155;--axis-name:#94a3b8;flex:1;min-width:0;flex-shrink:1}
          .browse-pair-head{display:flex;align-items:center;gap:6px;min-width:0}
          .browse-pair-label{font-size:12px;font-weight:800;color:#334155;white-space:nowrap}
          .browse-pair-name{font-size:10px;font-weight:700;color:#94a3b8;white-space:nowrap}
          .browse-pair-btns{display:flex;gap:6px;min-width:0}
          .browse-pair-btns .browse-btn .btn-name{max-width:100%;overflow:hidden;text-overflow:ellipsis}
          .browse-btn{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:56px;padding:8px 12px 7px;background:var(--axis-fill,#fff);border:1px solid var(--axis-border,#e2e8f0);border-radius:10px;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all .18s ease;box-shadow:0 1px 2px rgba(15,23,42,0.04)}
          .browse-btn.browse-type-btn{min-width:64px}
          .browse-btn .btn-code{font-size:14px;font-weight:800;color:var(--axis-color,#0f172a);letter-spacing:0.5px;line-height:1}
          .browse-btn .btn-name{font-size:9px;font-weight:500;color:var(--axis-name,#64748b);line-height:1.2}
          .browse-btn:hover{background:#f5f7ff;border-color:var(--axis-border,#c7d2fe);transform:translateY(-1px)}
          .browse-btn:hover .btn-code{color:var(--axis-color,#6366f1)}
          .browse-btn.active{background:#6366f1;border-color:#6366f1;box-shadow:0 2px 8px rgba(99,102,241,0.35);transform:translateY(-1px)}
          .browse-btn.active .btn-code,.browse-btn.active .btn-name{color:#fff}
          .layer-popup{position:fixed;inset:0;background:rgba(15,23,42,0.55);display:none;align-items:center;justify-content:center;z-index:1000;padding:16px}
          .layer-popup.show{display:flex}
          .layer-popup-box{background:#fff;border-radius:14px;overflow:hidden;width:100%;max-width:440px;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.3)}
          .layer-popup-header{background:linear-gradient(135deg,#0f172a,#6366f1);color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px}
          .layer-popup-title{font-size:15px;font-weight:800}
          .layer-popup-close{background:rgba(255,255,255,0.2);border:none;color:#fff;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:18px;line-height:1}
          .layer-popup-close:hover{background:rgba(255,255,255,0.35)}
          .layer-popup-body{padding:16px;overflow-y:auto;font-size:13px;line-height:1.7;color:#334155}
          .layer-popup-body .doc-name{font-size:18px;font-weight:800;color:#0f172a}
          .layer-popup-body .doc-tagline{font-size:12px;color:#6366f1;margin:4px 0 10px}
          .layer-popup-body ul{margin:8px 0 0;padding-left:18px}
          .layer-popup-body li{margin:3px 0}
          #npti-formula-link{text-decoration: underline}
          .doc-scores{background:#f8fafc;border:1px solid #eef2ff;border-radius:8px;padding:8px 12px;margin:0 0 10px}
          .doc-scores-title{font-size:11px;font-weight:700;color:#64748b;margin-bottom:6px}
          .doc-scores-row{display:flex;flex-wrap:wrap;gap:5px}
          .doc-score{font-size:11px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:2px 7px;font-variant-numeric:tabular-nums}
          .formula-link{color:#6366f1;text-decoration:underline;text-underline-offset:2px;cursor:pointer;font-weight:600}
          .formula-link:hover{color:#4f46e5}
          .share-fab{position:fixed;bottom:24px;right:24px;width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;box-shadow:0 6px 20px rgba(99,102,241,0.45);cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:900;transition:transform .15s ease,box-shadow .15s ease}
          .share-fab:hover{transform:scale(1.08);box-shadow:0 8px 24px rgba(99,102,241,0.55)}
          .share-fab.copied{background:#10b981;box-shadow:0 6px 20px rgba(16,185,129,0.45)}
          .formula-body p{margin:0 0 10px}
          .formula-body table{width:100%;border-collapse:collapse;font-size:12px;margin:4px 0 10px}
          .formula-body th,.formula-body td{text-align:left;padding:5px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top}
          .formula-body th{color:#64748b;font-weight:700;white-space:nowrap}
          .formula-body td code{background:#f1f5f9;border-radius:4px;padding:1px 5px;font-size:11px;color:#6366f1}
          .formula-example{margin-top:6px;background:#f8fafc;border:1px solid #eef2ff;border-radius:8px;padding:8px 12px;font-size:12px;line-height:1.8}
          .copyright{text-align:center;padding:14px 16px;color:#aaa;font-size:12px;margin-top:8px}
          .card-footer-formula{border-top:1px solid #f1f5f9;padding:8px 14px;display:flex;justify-content:flex-start;align-items:center}
          .card-footer-formula .formula-link{font-size:11px;color:#b0b8c6;text-decoration:none;font-weight:400}
          .card-footer-formula .formula-link:hover{color:#6366f1}
          @media(max-width:600px){
            .controls{padding:10px 12px} .ctrl-label{min-width:56px}
            .chart-wrap{height:110px} #npti-radar{width:300px;height:300px}
            .search-wrap input{font-size:16px}
          }
        </style>

        <div class="header">
          <button class="header-back" aria-label="Go home" title="홈으로">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
          </button>
          <div class="header-title">🧬 주식 NPTI</div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-stock-npti.svg?style=plastic&amp;"/>
        </div>

        <main class="content">
          <div class="card">
            <div class="card-header" style="--accent:#6366f1">
              <div class="search-wrap">
                <span class="search-icon">🔍</span>
                <input id="stock-search" placeholder="종목 검색 — 예: 삼성전자, SK하이닉스" value="" />
                <button id="stock-search-clear" class="search-clear" title="지우기">✕</button>
                <button id="stock-search-btn">검색</button>
                <div id="search-results" class="search-results"></div>
              </div>
            </div>

            <!-- 동적: 종목 로드 시 updateHeroSection()으로 채워짐 -->
            <form id="npti-select-form">
              <div class="npti-hero">
                <div class="npti-hero-label">🧬 · 전체 1년 NPTI</div>
                <label class="npti-result-item">
                  <input type="radio" name="npti-pick" value="body" checked class="npti-radio">
                  <span class="npti-radio-icon" title="이 결과로 레이더 보기">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  </span>
                  <div id="npti-type" class="npti-hero-type">--</div>
                </label>
              </div>
              <div class="segments-section">
                <div class="hint" style="margin-bottom:8px;color:#64748b">전체 구간별 변화 추이</div>
                <div id="npti-segments"></div>
              </div>
            </form>

            <!-- 선택된 NPTI 결과 표시 -->
            <div id="npti-selected-info" class="npti-selected-info"></div>

            <!-- 레이더 차트 (고정, 내용만 업데이트) -->
            <div class="radar-wrap">
              <stock-radar id="npti-radar"></stock-radar>
            </div>

            <!-- 캔들 차트 (고정, 내용만 업데이트) -->
            <div class="chart-wrap">
              <stock-chart id="npti-chart" hidden-x-label hidden-y-label></stock-chart>
            </div>

            <!-- 영역별 선택 (details, 고정) -->
            <details id="window-panel-details" class="window-panel">
              <summary class="window-panel-head">
                <span class="window-panel-title">🔎 영역별 선택 NPTI</span>
              </summary>
              <div id="radar-legend" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:8px"></div>
              <div class="controls">
                <div class="ctrl-row">
                  <div class="ctrl-label">영역 개수</div>
                  <span class="ctrl-value" id="win-label">50</span>
                  <input id="win-slider" type="range" min="5" max="120" step="1" value="50" />
                </div>
                <div class="ctrl-row">
                  <div class="ctrl-label">시작 위치</div>
                  <span class="ctrl-value" id="win-start-label">0</span>
                  <input id="win-start" type="range" min="0" max="0" value="0" />
                </div>
              </div>
            </details>
          </div>

          <!-- 도감 카드 (고정) -->
          <div class="card" style="margin-top:16px">
            <div class="card-header" style="--accent:#6366f1">
              <div class="card-title">📚 NPTI 도감(설명)</div>
            </div>
            <div class="browse-section">
              <div class="browse-section-title">항목별</div>
              <div id="browse-axes" class="browse-axes">${browseAxesHtml}</div>
            </div>
            <div class="browse-section" style="border-top:1px solid #f1f5f9">
              <div class="browse-section-title">조합별</div>
              <div id="browse-types" class="browse-types">${browseTypesHtml}</div>
            </div>
            <div class="card-footer-formula">
              <a id="npti-formula-link" class="formula-link" role="link" tabindex="0">NPTI 계산식</a>
            </div>
          </div>

          <!-- 팝업들 (고정) -->
          <div id="npti-popup" class="layer-popup">
            <div class="layer-popup-box">
              <div class="layer-popup-header">
                <span id="npti-popup-title" class="layer-popup-title"></span>
                <button id="npti-popup-close" class="layer-popup-close" title="닫기">×</button>
              </div>
              <div id="npti-popup-body" class="layer-popup-body"></div>
            </div>
          </div>

          <div id="npti-formula-popup" class="layer-popup">
            <div class="layer-popup-box">
              <div class="layer-popup-header">
                <span class="layer-popup-title">🧮 NPTI 계산 공식</span>
                <button id="npti-formula-close" class="layer-popup-close" title="닫기">×</button>
              </div>
              <div class="layer-popup-body formula-body">
                <p><strong>8축 = 4쌍(양극)</strong>. 한 쌍의 합은 항상 <strong>100%</strong> — 예) E 70%면 I는 자동으로 30%.</p>
                <table>
                  <tr><th>쌍</th><th>축 공식 (0~100)</th></tr>
                  <tr><td><code>E</code> 수급</td><td>Σ(종가×거래량) ÷ 시가총액 × 스케일 → <strong>거래대금 회전율</strong></td></tr>
                  <tr><td><code>I</code></td><td><strong>100 − E</strong></td></tr>
                  <tr><td><code>N</code> 추세</td><td>50 + (구간 수익률 × 0.8) → <strong>상승/하락 방향</strong></td></tr>
                  <tr><td><code>S</code></td><td><strong>100 − N</strong></td></tr>
                  <tr><td><code>P</code> 변동성</td><td>평균((고가−저가) ÷ 시가 × 8) → <strong>출렁임 크기</strong></td></tr>
                  <tr><td><code>J</code></td><td><strong>100 − P</strong></td></tr>
                  <tr><td><code>F</code> 심리</td><td>평균((종가−저가) ÷ (고가−저가) × 100) → <strong>종가 위치</strong></td></tr>
                  <tr><td><code>T</code></td><td><strong>100 − F</strong></td></tr>
                </table>
                <p><strong>데이터</strong>: 일봉 캔들 1년(네이버 금융) + 시가총액(KRX). 윈도우는 조회 구간입니다.</p>
                <div style="background:#f8fafc;border:1px solid #eef2ff;border-radius:8px;padding:8px 12px;font-size:12px;line-height:1.9">
                  <div><strong>본체</strong>: 시가총액 포함(전체 1년) — E는 거래대금/시가총액 회전율</div>
                  <div><strong>구간/윈도우</strong>: 캔들만으로 계산 — E는 전체 평균 대비 해당 구간 거래대금 비율</div>
                </div>
                <div class="formula-example">
                  <strong>4글자 판정 기준</strong> (각 쌍 주축 점수가 <strong>50% 초과</strong>면 주축 글자):<br/>
                  E/I · N/S · F/T · P/J → 각 주축 &gt;50%면 주축, 아니면 보완축<br/><br/>
                  <strong>조합 순서</strong>: E/I → N/S → F/T → P/J<br/>
                  예) <code>E 70% · N 62% · F 78% · P 55%</code> → <strong>ENFP</strong> 🚀
                </div>
              </div>
            </div>
          </div>

          <button id="npti-share-fab" class="share-fab" title="공유">🔗</button>

          <footer class="copyright">© ${new Date().getFullYear()} dooboostore</footer>
        </main>
      `;
    }
  }

  return tagName;
};
