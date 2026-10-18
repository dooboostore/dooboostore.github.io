import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-unsupervised';

const W = 340, H = 230;

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = { x: number; y: number };
function genData(): Pt[] {
  const r = mulberry(55);
  const g = () => (r() + r() + r() - 1.5) / 1.5;
  const pts: Pt[] = [];
  for (let i = 0; i < 15; i++) pts.push({ x: 12 + g() * 4, y: 150 + g() * 70 });
  for (let i = 0; i < 15; i++) pts.push({ x: 26 + g() * 4, y: 480 + g() * 80 });
  for (let i = 0; i < 15; i++) pts.push({ x: 30 + g() * 5, y: 200 + g() * 60 });
  pts.push({ x: 5, y: 700 }, { x: 38, y: 90 });
  return pts;
}
const DATA = genData();

const EXAMPLES = [
  ['고객 군집', '구매 패턴 비슷한 고객끼리 묶어 마케팅'],
  ['이상 탐지', '카드 부정거래·공장 불량 같은 소수 이상치 포착'],
  ['추천 시스템', '비슷한 취향 사용자 묶음으로 추천'],
  ['유전자 분석', '발현 패턴 비슷한 유전자 그룹핑'],
  ['이미지 압축', '비슷한 색 픽셀을 대표색으로 (양자화)'],
  ['토픽 모델링', '단어 뭉치로 문서 주제 추정'],
];

const MD = `
## 비지도 학습 — 정답 없이 무리짓기
- 라벨이 없습니다. 대신 **비슷한 것끼리 모으기(군집)**, **낮은 차원으로 누르기(차원 축소)**, **튀는 것 찾기(이상 탐지)** 가 임무입니다.
- 아래 버튼은 가장 쉬운 이상 탐지입니다. 각 점에서 가장 가까운 이웃까지의 거리를 재서, 유난히 먼 점(외톨이)을 골라냅니다.
- 책 6장이 비지도 학습입니다. 군집(k-평균)·주성분 분석 탭에서 본격적으로 다룹니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlUnsupervised extends w.HTMLElement {
    private scored = false;

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#mu-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      const XMIN = 0, XMAX = 42, YMAX = 800;
      const px = (x: number) => (x / XMAX) * W;
      const py = (y: number) => H - (y / YMAX) * H;
      let outliers: Pt[] = [];
      if (this.scored) {
        const ds = DATA.map(p => {
          let best = Infinity;
          DATA.forEach(q => {
            if (q === p) return;
            const d = Math.hypot(p.x - q.x, (p.y - q.y) / 20);
            if (d < best) best = d;
          });
          return { p, d: best };
        });
        ds.sort((a, b) => b.d - a.d);
        outliers = ds.slice(0, 3).map(v => v.p);
      }
      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);
        DATA.forEach(p => {
          const isO = outliers.includes(p);
          ctx.fillStyle = isO ? '#ef4444' : '#64748b';
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y), isO ? 7 : 4.5, 0, Math.PI * 2);
          ctx.fill();
          if (isO) {
            ctx.strokeStyle = '#991b1b';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.lineWidth = 1;
          }
        });
      }
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mu-msg', this.scored
        ? '빨간 점 3개 = 가장 가까운 이웃이 유난히 먼 외톨이 (정답 없이 찾음)'
        : '라벨이 하나도 없습니다. 그래도 "튀는 점"은 찾을 수 있습니다');
      const btn = this.shadowRoot?.querySelector('#mu-btn') as HTMLButtonElement;
      if (btn) btn.textContent = this.scored ? '↺ 숨기기' : '🔍 외톨이 찾기 (이웃 거리 기준)';
    }

    @addEventListener('#mu-btn', 'click')
    onBtn() { this.scored = !this.scored; this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const cards = EXAMPLES.map(e =>
        `<div class="ms-card"><b>${e[0]}</b><span>${e[1]}</span></div>`).join('');
      return `
        <style>
          :host { display:block; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .ms-btn { display:block; margin:8px auto; padding:7px 18px; border-radius:16px; border:1.5px solid #14532d; background:#f0fdf4; color:#14532d; font-size:12px; font-weight:800; cursor:pointer; }
          .ms-msg { text-align:center; font-size:12.5px; font-weight:700; color:#1e293b; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:8px; }
          .ms-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:6px; margin-top:10px; }
          .ms-card { border:1.5px solid #e2e8f0; border-radius:8px; padding:8px 10px; background:#fff; }
          .ms-card b { display:block; font-size:12px; color:#14532d; }
          .ms-card span { font-size:11px; color:#64748b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
        </style>

        <div class="mm-def">
          <div><b>정의</b> 라벨 없이 데이터의 무리(군집), 낮은 차원 구조, 튀는 점(이상)을 찾는 학습입니다.</div>
          <div><b>언제</b> 정답 라벨이 없을 때 씁니다.</div>
          <div><b>예시</b> 고객 군집, 이상 탐지, 토픽 모델링</div>
        </div>
        <div class="mm-intro">
          점 47개, <b>라벨 0개</b>. 그래도 구조는 보입니다 — 무리 3개와 외톨이 2개. 버튼을 눌러 정답 없이 외톨이를 골라내 보세요.
        </div>

        <button class="ms-btn" id="mu-btn"></button>
        <canvas id="mu-canvas" width="${W}" height="${H}"></canvas>
        <div class="ms-msg" id="mu-msg"></div>

        <div class="ms-grid">${cards}</div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
