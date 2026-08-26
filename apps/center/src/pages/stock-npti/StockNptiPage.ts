import { elementDefine, onConnectedBodyShadow, onConnectedBefore, onInitialize, addEventListener, addEventListenerDocument, innerHtmlLight, innerHtml, setAttribute } from '@dooboostore/simple-web-component';
import { Router } from '@dooboostore/core-web';
import { inject } from '@dooboostore/simple-boot';
import { BuybackService, BuybackChartPoint } from '../../services/buyback/BuybackService';
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

// 조합 유형 4글자를 차원 색상으로 (E-I 수급/레드, N-S 추세/그린, P-J 변동/보라, F-T 심리/블루)
function coloredType(type:string): string {
  return type.split('').map(ch=>`<span style="color:${AXIS_DIM_COLOR[ch] ?? '#fff'}">${ch}</span>`).join('');
}

// 이전(prev)과 비교해 바뀐 글자만 차원 색상, 같은 글자는 옅게
function coloredTypeChange(prev: string, cur: string): string {
  return cur.split('').map((ch,i)=> ch === prev[i]
    ? `<span style="color:rgba(255,255,255,0.45)">${ch}</span>`
    : `<span style="color:${AXIS_DIM_COLOR[ch] ?? '#fff'};font-weight:800">${ch}</span>`).join('');
}

// 조합 글자 아래에 각 축 % 표시 (히어로용)
const HERO_IDX: Record<string,number> = { E:0, N:1, F:2, P:3, I:4, S:5, T:6, J:7 };
function coloredTypeHero(type: string, scores: number[]): string {
  return type.split('').map(ch=>{
    const v = scores[HERO_IDX[ch]] ?? 50;
    return `<span class="hero-letter" style="color:${AXIS_DIM_COLOR[ch] ?? '#fff'}">${ch}<span class="hero-pct">${Math.round(v)}%</span></span>`;
  }).join('');
}

// baselineAmount 지정 시 캔들만으로 E(수급) 계산 — 전체 평균 대비 해당 구간 거래대금 비율
function computeScores8(candles: BuybackChartPoint[], marketValue = 1e14, baselineAmount?: number){
  const slice = candles;
  if(!slice.length) return [50,50,50,50,50,50,50,50];
  let E: number;
  if(baselineAmount && baselineAmount > 0){
    const avgAmt = avg(slice.map(c=>c.close*c.volume));
    E = clamp(50 + ((avgAmt/baselineAmount) - 1)*30, 0, 100);
  } else {
    const totalAmount = slice.reduce((s,c)=>s + c.close*c.volume, 0);
    // 연간 거래대금 회전율 (누적 거래대금 ÷ 시가총액, 보통 0.5~3) — 1이면 50, 높을수록 수급 활발
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
  // 반환 순서: E,N,F,P, 100-E,100-N,100-F,100-P (NPTI_AXES_8과 일치)
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
    private buybackService!: BuybackService;
    private candles: BuybackChartPoint[] = [];
    private marketValue = 1e14;
    private baselineAmount = 0;
    private currentCode = '005930';
    private currentName = '삼성전자';
    private windowSize = 50;
    private viewStart = 0;
    private segScores: number[][] = [];

    @onInitialize
    async onInit(@inject(BuybackService.SYMBOL) buybackService: BuybackService, router: Router){
      this.buybackService = buybackService;
      this.router = router;
      // 공유 URL 쿼리 파라미터 (?code=005930) 처리 — 코드로 fetch 후 이름 해석. 없으면 기본 삼성전자
      try{
        const code = router?.getSearchParams?.()?.get('code');
        if(code && /^\d{6}$/.test(code)){
          this.currentCode = code;
          this.currentName = code;
          try{
            const found = (await this.buybackService.searchCompany(code))[0];
            if(found?.name && /^\d{6}$/.test(found.code)) this.currentName = found.name;
          }catch{}
        }
      }catch{}
      await this.loadStock(this.currentCode, this.currentName);
    }

    private async loadStock(code:string, name:string){
      this.currentCode = code;
      this.currentName = name;
      // URL 쿼리 파라미터에 종목 코드 반영 (공유 가능한 링크) — 값이 다를 때만, 재초기화 무한루프 방지
      try{
        const cur = this.router?.getSearchParams?.()?.get('code');
        if(cur !== code) this.router?.replaceUpsertSearchParam?.({ code });
      }catch{}
      this.renderContent();
      try{
        const [chart, status] = await Promise.all([
          this.buybackService.getChart(code, 12),
          this.buybackService.getStockStatus({ code, name, color: '#6366f1' }).catch(()=>null)
        ]);
        this.candles = chart;
        // currentName이 코드(6자리 숫자)면 stock status의 종목명(com_abbrv)으로 해석
        const resolvedName = status?.priceInfo?.com_abbrv?.trim();
        if(resolvedName && /^\d{6}$/.test(this.currentName)) this.currentName = resolvedName;
        const cap = Number(status?.priceInfo?.mktcap) || 0;
        this.marketValue = cap > 0 ? cap : 1e14;
        this.baselineAmount = this.candles.length ? avg(this.candles.map(c=>c.close*c.volume)) : 0;
        this.viewStart = Math.max(0, this.candles.length - this.windowSize);
        this.renderContent();
        this.drawChart();
        this.drawRadar();
        this.drawSegments();
      }catch(e){ console.error(e); }
    }

    private buildChartTicks(): string {
      // 전체 1년 캔들을 모두 그리고, 현재 윈도우는 <rect date-start/date-end>로 하이라이트
      const slice = this.candles.slice(this.viewStart, this.viewStart+this.windowSize);
      const startDate = slice[0]?.date;
      const endDate = slice[slice.length-1]?.date;
      const rect = (startDate && endDate)
        ? `<rect date-start="${startDate}" date-end="${endDate}" target="candle" fill="rgba(99,102,241,0.12)" stroke="rgba(99,102,241,0.6)" stroke-width="1"></rect>`
          + `<rect date-start="${startDate}" date-end="${endDate}" target="volume" fill="rgba(99,102,241,0.22)" stroke="rgba(99,102,241,0.7)" stroke-width="1"></rect>`
        : '';
      return this.candles.map(c=>
        `<tick date="${c.date}" open="${c.open}" high="${c.high}" low="${c.low}" close="${c.close}" volume="${c.volume}"></tick>`
      ).join('') + rect;
    }

    private buildRadarScoreHtml(bodyScores: number[], curScores: number[]): string {
      // <axis>로 축 정의(순서=12시부터 시계방향, label/color/label-value), <score-set>으로 오버레이 폴리곤
      const axesHtml = NPTI_AXES_8.map((axis,i)=>
        `<axis id="${axis}" label="${NPTI_AXIS_INFO[axis].name}" label-value="${axis} ${Math.round(bodyScores[i])}%" color="${AXIS_DIM_COLOR[axis]}"></axis>`
      ).join('');
      const bodySet = `<score-set stroke-style="rgba(148,163,184,0.6)" fill-style="rgba(148,163,184,0.18)">${NPTI_AXES_8.map((axis,i)=>`<score axis="${axis}" value="${bodyScores[i]}"></score>`).join('')}</score-set>`;
      const winSet = `<score-set stroke-style="rgba(99,102,241,0.9)" fill-style="rgba(99,102,241,0.32)">${NPTI_AXES_8.map((axis,i)=>`<score axis="${axis}" value="${curScores[i]}"></score>`).join('')}</score-set>`;
      return axesHtml + bodySet + winSet;
    }

    private drawChart(){
      const el = this.querySelector('stock-chart') as HTMLElement;
      if(!el) return;
      el.innerHTML = this.buildChartTicks();
    }

    private drawRadar(){
      const el = this.querySelector('stock-radar') as HTMLElement;
      if(!el) return;
      const scores = this.candles.length ? computeScores8(this.candles.slice(this.viewStart, this.viewStart+this.windowSize), this.marketValue, this.baselineAmount) : [50,50,50,50,50,50,50,50];
      const bodyScores = this.candles.length ? computeScores8(this.candles, this.marketValue) : scores;
      el.innerHTML = this.buildRadarScoreHtml(bodyScores, scores);
      const t = this.querySelector('#npti-type') as HTMLElement;
      if(t){
        if(this.candles.length) t.innerHTML = coloredTypeHero(nptiType(bodyScores), bodyScores);
        else t.innerHTML = '--';
      }
      const legend = this.querySelector('#radar-legend') as HTMLElement;
      if(legend){
        const type = nptiType(scores);
        legend.innerHTML = `<span class="npti-badge seg-badge window-badge" style="margin-top:0;cursor:pointer" data-type="${type}">${coloredType(type)}</span>`;
      }
    }

    private drawSegments(){
      const wrap = this.querySelector('#npti-segments') as HTMLElement;
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
                <span class="npti-badge seg-badge" style="margin-top:0;cursor:pointer" data-type="${st.type}">${i===0 ? coloredType(st.type) : coloredTypeChange(steps[i-1].type, st.type)}</span>
                <span class="flow-label">${st.label}</span>
              </div>${i < steps.length-1 ? '<div class="flow-arrow">›</div>' : ''}`).join('')}
          </div>
        </div>`;
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
      const title = this.querySelector('#npti-popup-title') as HTMLElement;
      const body = this.querySelector('#npti-popup-body') as HTMLElement;
      const popup = this.querySelector('#npti-popup') as HTMLElement;
      if(title) title.textContent = `${info.code} · ${info.name}`;
      if(body) body.innerHTML = this.renderDoc(info, scores);
      if(popup) popup.classList.add('show');
    }

    private closePopup(){
      const popup = this.querySelector('#npti-popup') as HTMLElement;
      if(popup) popup.classList.remove('show');
    }

    @innerHtmlLight
    private renderContent(): string {
      const bodyScores = this.candles.length ? computeScores8(this.candles, this.marketValue) : [50,50,50,50,50,50,50,50];
      const curScores = this.candles.length ? computeScores8(this.candles.slice(this.viewStart, this.viewStart+this.windowSize), this.marketValue, this.baselineAmount) : bodyScores;
      const radarScoresHtml = this.candles.length ? this.buildRadarScoreHtml(bodyScores, curScores) : '';
      const browseAxesHtml = [['E-I','수급',['E','I']],['N-S','추세',['N','S']],['F-T','심리',['F','T']],['P-J','변동성',['P','J']]]
        .map(([pair, pname, axes])=>`
          <div class="browse-pair" style="${pairFillStyle(pair as string)}">
            <div class="browse-pair-head">
              <span class="browse-pair-label" style="color:${DIM_COLOR_NAME[pair]}">${pair}</span>
              <span class="browse-pair-name" style="color:${DIM_COLOR_NAME[pair]}">${pname}</span>
            </div>
            <div class="browse-pair-btns">
              ${(axes as string[]).map(c=>`<button class="browse-btn" data-type="${c}"><span class="btn-code">${c}</span><span class="btn-name">${NPTI_AXIS_INFO[c].name}</span></button>`).join('')}
            </div>
          </div>`).join('');
      const browseTypesHtml = NPTI_TYPE_ORDER.map(c=>`<button class="browse-btn browse-type-btn" data-type="${c}"><span class="btn-code">${NPTI_TYPE_INFO[c].emoji ?? ''} ${c}</span><span class="btn-name">${NPTI_TYPE_INFO[c].name}</span></button>`).join('');
      return `
        <style>
          .company-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px}
          .full-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
          @media(max-width:900px){.full-grid{grid-template-columns:1fr}}
          .card{background:white;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);overflow:hidden}
          .card.npti-card{overflow:visible}
          .card-header{background:var(--accent);color:white;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;border-radius:12px 12px 0 0}
          .card-header-actions{display:flex;flex-direction:column;align-items:flex-end;gap:3px}
          .card-title{font-size:15px;font-weight:700}
          .card-code{font-size:11px;opacity:0.8;margin-top:1px}
          .card-header-updated{font-size:9px;opacity:0.7}
          .search-wrap{display:flex;gap:6px;align-items:center;position:relative;min-width:0}
          .search-header{flex:1;min-width:200px}
          .search-icon{font-size:12px;opacity:.6;color:#c7d2fe}
          .search-wrap input{flex:1;min-width:0;height:30px;padding:0 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.4);outline:none;font-size:12px;background:#fff;box-sizing:border-box}
          .search-wrap input:focus{border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,0.25)}
          .search-wrap button,.search-clear{height:30px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.35);background:rgba(255,255,255,0.2);color:#fff;font-weight:600;cursor:pointer;font-size:12px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center}
          .search-wrap button:hover,.search-clear:hover{background:rgba(255,255,255,0.35)}
          .search-results{position:absolute;top:calc(100% - 4px);left:0;right:0;background:#fff;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);overflow:hidden;display:none;z-index:10;color:#334155}
          .search-results.show{display:block}
          .search-item{padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f1f5f9;color:#334155}
          .search-item:hover{background:#f8fafc}
          .search-item img{width:28px;height:28px;border-radius:50%}
          .controls{display:flex;flex-direction:column;gap:10px;width:100%;margin-top:12px;background:#f8fafc;border:1px solid #eef2ff;border-radius:12px;padding:12px 14px;box-sizing:border-box;min-width:0}
          .ctrl-row{display:flex;align-items:center;gap:8px;min-width:0}
          .ctrl-label{font-size:12px;font-weight:700;color:#64748b;min-width:60px;white-space:nowrap}
          .ctrl-value{min-width:38px;text-align:center;background:#eef2ff;color:#6366f1;font-weight:800;font-size:13px;border-radius:6px;padding:2px 8px;font-variant-numeric:tabular-nums;box-sizing:border-box}
          .ctrl-unit{font-size:11px;color:#94a3b8;white-space:nowrap}
          .ctrl-row input[type=range]{flex:1;min-width:0;width:auto}
          .controls input[type=range]{-webkit-appearance:none;appearance:none;width:140px;height:6px;border-radius:999px;background:#e2e8f0;outline:none;cursor:pointer;margin:0}
          .controls input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;border-radius:50%;background:#6366f1;border:2px solid #fff;box-shadow:0 1px 4px rgba(99,102,241,0.4);cursor:pointer;transition:transform .15s ease}
          .controls input[type=range]::-webkit-slider-thumb:hover{transform:scale(1.15)}
          .controls input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#6366f1;border:2px solid #fff;box-shadow:0 1px 4px rgba(99,102,241,0.4);cursor:pointer}
          .controls input[type=range]::-moz-range-track{height:6px;border-radius:999px;background:#e2e8f0}
          .chart-wrap{height:130px;padding:4px 12px 8px}
          stock-chart{width:100%;height:100%;display:block}
          .radar-wrap{display:flex;flex-direction:column;align-items:center;padding:4px 12px 0}
          .npti-hero{display:flex;flex-direction:column;align-items:center;padding:16px 12px 6px}
          .npti-hero-label{font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:1px;margin-bottom:8px}
          .npti-hero-type{font-size:44px;font-weight:900;letter-spacing:0;line-height:1;cursor:pointer;background:#0f172a;border-radius:16px;padding:14px 22px;color:#fff;box-shadow:0 4px 16px rgba(15,23,42,0.18);transition:transform .18s ease,box-shadow .18s ease;display:flex;align-items:center;justify-content:center;gap:12px}
          .hero-letter{display:flex;flex-direction:column;align-items:center;gap:3px}
          .hero-pct{font-size:10px;font-weight:600;color:rgba(255,255,255,0.55);letter-spacing:0}
          .npti-hero-type:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(15,23,42,0.24)}
          .window-panel{margin:10px 12px 12px;border:1px dashed #c7d2fe;border-radius:12px;padding:12px;background:#f5f7ff}
          .window-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
          .window-panel-title{font-size:12px;font-weight:800;color:#6366f1}
          #npti-radar{width:360px;height:360px;max-width:100%}
          stock-radar{width:100%;height:100%;display:block}
          .npti-badge{margin-top:8px;background:#0f172a;color:#fff;border-radius:999px;padding:6px 14px;font-weight:800;letter-spacing:0.5px}
          .flow-wrap{position:relative;width:100%;padding:2px 0 4px}
          .flow-steps{position:relative;display:flex;align-items:flex-start;justify-content:space-between;gap:6px;z-index:1}
          .flow-step{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;flex:1}
          .flow-arrow{color:#94a3b8;font-weight:800;font-size:18px;flex-shrink:0;line-height:1;margin-top:6px}
          .flow-label{font-size:10px;font-weight:700;color:#94a3b8;white-space:nowrap}
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
          .layer-popup{position:fixed;inset:0;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;display:none}
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
          @media(max-width:600px){
            .controls{padding:10px 12px}
            .ctrl-label{min-width:56px}
            .chart-wrap{height:110px}
            #npti-radar{width:300px;height:300px}
            .search-wrap input{font-size:16px}
          }
        </style>

        <div class="card npti-card">
            <div class="card-header" style="--accent:#6366f1">
              <div class="search-wrap search-header">
                <span class="search-icon">🔍</span>
                <input id="stock-search" placeholder="종목 검색 — 예: 삼성전자, SK하이닉스" value="${this.currentName}" />
                <button id="stock-search-clear" class="search-clear" title="지우기">✕</button>
                <button id="stock-search-btn">검색</button>
                <div id="search-results" class="search-results"></div>
              </div>
            </div>
            <div class="npti-hero">
              <div class="npti-hero-label">🧬 ${this.currentName} <span style="color:#cbd5e1;font-weight:600">${this.currentCode}</span> · 전체 1년 NPTI</div>
              <div id="npti-type" class="npti-hero-type" data-type="${this.candles.length ? nptiType(bodyScores) : ''}">${this.candles.length ? coloredTypeHero(nptiType(bodyScores), bodyScores) : '--'}</div>
              <div class="hint" style="margin-top:8px;display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap">
                <span>클릭: 유형 설명</span>
                <a id="npti-formula-link" class="formula-link" role="link" tabindex="0">계산식</a>
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#94a3b8"></span><span>회색(전체)</span>
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#6366f1"></span><span>보라(선택)</span>
              </div>
            </div>
            <div class="radar-wrap">
              <stock-radar id="npti-radar">${radarScoresHtml}</stock-radar>
            </div>
            <div class="chart-wrap"><stock-chart id="npti-chart" hidden-x-label hidden-y-label>${this.buildChartTicks()}</stock-chart></div>
            <div class="window-panel">
              <div class="window-panel-head">
                <span class="window-panel-title">🔎 영역별 선택 NPTI</span>
                <div id="radar-legend" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center"></div>
              </div>
              <div class="controls">
                <div class="ctrl-row">
                  <div class="ctrl-label">영역 개수</div>
                  <span class="ctrl-value" id="win-label">${this.windowSize}</span>
<!--                  <span class="ctrl-unit">봉</span>-->
                  <input id="win-slider" type="range" min="5" max="120" step="1" value="${this.windowSize}" />
                </div>
                <div class="ctrl-row">
                  <div class="ctrl-label">시작 위치</div>
                  <span class="ctrl-value" id="win-start-label">${this.viewStart}</span>
                  <input id="win-start" type="range" min="0" max="${Math.max(0,this.candles.length-this.windowSize)}" value="${this.viewStart}" />
                </div>
              </div>
            </div>
            <div style="border-top:1px solid #eef2ff;padding:12px">
              <div class="hint" style="margin-bottom:8px;color:#64748b">전체 구간별 변화 추이</div>
              <div id="npti-segments"></div>
            </div>
          </div>
        </div>

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
        </div>

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
                <strong>4글자 판정 기준</strong> (각 쌍 주축 점수가 <strong>50% 초과</strong>면 주축 글자, 아니면 보완축 글자):<br/>
                E/I → E&gt;50%면 <strong>E</strong> 아니면 I · N/S → N&gt;50%면 <strong>N</strong> 아니면 S · F/T → F&gt;50%면 <strong>F</strong> 아니면 T · P/J → P&gt;50%면 <strong>P</strong> 아니면 J<br/><br/>
                <strong>4글자 조합 순서</strong>: E/I → N/S → F/T → P/J<br/>
                예) <code>E 70% · N 62% · F 78% · P 55%</code> → <strong>E N F P = ENFP</strong> 🚀
              </div>
            </div>
          </div>
        </div>

        <button id="npti-share-fab" class="share-fab" title="공유">🔗</button>

        <footer class="copyright">© ${new Date().getFullYear()} dooboostore</footer>
      `;
    }

    @addEventListener('.header-back','click')
    onBack(){ this.router.go('/'); }

    @addEventListener('#stock-search-btn','click', { delegate:true, root:'light' })
    onSearchBtn(){
      this.doSearch();
    }

    private async doSearch(){
      const input = this.querySelector('#stock-search') as HTMLInputElement;
      const q = input?.value.trim();
      if(!q) return;
      const list = await this.buybackService.searchCompany(q);
      const box = this.querySelector('#search-results') as HTMLElement;
      box.innerHTML = list.slice(0,10).map(it=>`
        <div class="search-item" data-code="${it.code}" data-name="${it.name}">
          <div style="flex:1"><div style="font-weight:700;font-size:13px">${it.name}</div><div style="font-size:11px;color:#64748b">${it.code}</div></div>
          <div style="font-size:11px;color:#0ea5e9">선택</div>
        </div>`).join('') || `<div style="padding:12px;color:#64748b">결과 없음</div>`;
      box.classList.add('show');
    }

    @addEventListener('#stock-search','keydown', { delegate:true, root:'light' })
    onSearchKey(e:KeyboardEvent){
      if(e.key==='Enter'){ e.preventDefault(); this.doSearch(); }
      if(e.key==='Escape'){ const b=this.querySelector('#search-results') as HTMLElement; b.classList.remove('show'); }
    }

    @addEventListener('#stock-search-clear','click', { delegate:true, root:'light' })
    onClearSearch(){
      const input = this.querySelector('#stock-search') as HTMLInputElement;
      if(input) input.value = '';
      const box = this.querySelector('#search-results') as HTMLElement;
      box?.classList.remove('show');
      input?.focus();
    }

    @addEventListenerDocument('click')
    onDocClick(e:MouseEvent){
      const box = this.querySelector('#search-results') as HTMLElement;
      if(!box?.classList.contains('show')) return;
      const wrap = this.querySelector('.search-wrap') as HTMLElement;
      const target = e.target as Node;
      if(wrap && target.isConnected && wrap.contains(target)) return;
      box.classList.remove('show');
    }

    @addEventListener('.search-item','click', { delegate:true, root:'light' })
    onPick(e:Event){
      const el = (e.target as HTMLElement).closest('.search-item') as HTMLElement;
      if(!el) return;
      const code = el.dataset.code!; const name = el.dataset.name!;
      (this.querySelector('#search-results') as HTMLElement).classList.remove('show');
      (this.querySelector('#stock-search') as HTMLInputElement).value = name;
      this.loadStock(code, name);
    }

    @addEventListener('#win-slider','input', { delegate:true, root:'light' })
    onWinSlider(e:Event){
      const v = Number((e.target as HTMLInputElement).value);
      this.windowSize = v;
      const label = this.querySelector('#win-label') as HTMLElement;
      if(label) label.textContent = String(v);
      const maxStart = Math.max(0, this.candles.length - this.windowSize);
      const startInput = this.querySelector('#win-start') as HTMLInputElement;
      if(startInput){
        startInput.max = String(maxStart);
        if(this.viewStart>maxStart){
          this.viewStart = maxStart;
          const sl = this.querySelector('#win-start-label') as HTMLElement;
          if(sl) sl.textContent = String(this.viewStart);
        }
      }
      this.drawChart();
      this.drawRadar();
      this.drawSegments();
    }

    @addEventListener('#win-start','input', { delegate:true, root:'light' })
    onStartSlider(e:Event){
      this.viewStart = Number((e.target as HTMLInputElement).value);
      const label = this.querySelector('#win-start-label') as HTMLElement;
      if(label) label.textContent = String(this.viewStart);
      this.drawChart();
      this.drawRadar();
    }

    @addEventListener('#npti-type, .seg-badge', 'click', { delegate:true, root:'light' })
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
        const badges = this.querySelectorAll('.seg-badge:not(.window-badge)');
        const idx = Array.from(badges).indexOf(el);
        if(idx >= 0 && this.segScores[idx]) scores = this.segScores[idx];
      }
      this.openPopup(code, scores);
    }

    @addEventListener('.browse-btn', 'click', { delegate:true, root:'light' })
    onBrowseClick(e:Event){
      const btn = (e.target as HTMLElement).closest('.browse-btn') as HTMLElement;
      const code = btn?.dataset.type;
      if(code) this.openPopup(code);
    }

    @addEventListener('#npti-popup-close', 'click', { delegate:true, root:'light' })
    onPopupClose(){ this.closePopup(); }

    @addEventListener('#npti-popup', 'click', { delegate:true, root:'light' })
    onPopupOverlay(e:Event){
      if((e.target as HTMLElement) === e.currentTarget) this.closePopup();
    }

    @addEventListener('#npti-formula-link', 'click', { delegate:true, root:'light' })
    onFormulaBtn(){
      const popup = this.querySelector('#npti-formula-popup') as HTMLElement;
      if(popup) popup.classList.add('show');
    }

    @addEventListener('#npti-share-fab', 'click', { delegate:true, root:'light' })
    async onShareFab(){
      const url = window.location.href;
      const title = `주식 NPTI · ${this.currentName}`;
      const text = `[${this.currentName}]의 NPTI를 확인해보세요!`;
      const fab = this.querySelector('#npti-share-fab') as HTMLElement;
      const flash = () => {
        if(!fab) return;
        fab.textContent = '✓';
        fab.classList.add('copied');
        setTimeout(()=>{ if(fab.textContent === '✓'){ fab.textContent = '🔗'; fab.classList.remove('copied'); } }, 1500);
      };
      try{
        // Web Share API 우선 (모바일 공유 시트), 미지원/실패 시 클립보드 복사 폴백
        if(navigator.share){
          await navigator.share({ title, text, url });
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

    @addEventListener('#npti-formula-close', 'click', { delegate:true, root:'light' })
    onFormulaClose(){
      const popup = this.querySelector('#npti-formula-popup') as HTMLElement;
      if(popup) popup.classList.remove('show');
    }

    @addEventListener('#npti-formula-popup', 'click', { delegate:true, root:'light' })
    onFormulaOverlay(e:Event){
      if((e.target as HTMLElement) === e.currentTarget){
        const popup = this.querySelector('#npti-formula-popup') as HTMLElement;
        if(popup) popup.classList.remove('show');
      }
    }

    @onConnectedBodyShadow
    render(){
      return `
        <style>
          :host { display: block; min-height: 100vh; background: #f0f2f5; font-family: var(--font-family, sans-serif); }
          .header {
            display: flex; align-items: center; gap: 12px;
            padding: 16px 24px;
            background: linear-gradient(135deg, #1565c0 0%, #1976d2 60%, #42a5f5 100%);
            color: white;
          }
          .header-back {
            background: rgba(255,255,255,0.2); border: none; color: white;
            width: 40px; height: 40px; border-radius: 8px; cursor: pointer;
            display: flex; align-items: center; justify-content: center; font-size: 20px;
          }
          .header-back:hover { background: rgba(255,255,255,0.3); }
          .header-title { font-size: 22px; font-weight: 700; flex: 1; }
          .header-subtitle { font-size: 12px; opacity: 0.85; }
          .header-hits { height: 20px; border-radius: 4px; opacity: 0.9; margin-left: auto; }
          .content { padding: 20px; }
          @media (max-width: 600px) {
            .header { padding: 14px 16px; }
            .header-title { font-size: 18px; }
            .content { padding: 12px; }
          }
        </style>

        <div class="header">
          <button class="header-back" aria-label="Go home" title="홈으로">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
          </button>
          <div>
            <div class="header-title">🧬 주식 NPTI</div>
          </div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-stock-npti.svg?style=plastic&amp;"/>
        </div>

        <main class="content">
          <slot></slot>
        </main>
      `;
    }
  }

  return tagName;
};