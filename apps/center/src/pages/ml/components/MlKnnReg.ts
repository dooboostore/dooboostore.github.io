import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-knnreg';

const W = 340, H = 240;

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
  const r = mulberry(5);
  const pts: Pt[] = [];
  for (let i = 0; i < 16; i++) {
    const x = 10 * r();
    pts.push({ x, y: Math.sin(x) * 2 + (r() - 0.5) * 1.5 });
  }
  return pts.sort((a, b) => a.x - b.x);
}
const DATA = genData();

const MD = `
## k-최근접 이웃 회귀 — 이웃 평균이 답
- 분류가 다수결이라면 회귀는 **이웃 k개의 타깃 평균**입니다. \`KNeighborsRegressor(n_neighbors=k)\` 한 줄이면 끝.
- **k=1**이면 훈련 점에 딱 붙는 울퉁불퉁 곡선(과대적합), **k를 키우면** 매끄럽지만 봉우리가 뭉개집니다(과소적합).
- 성능 지표는 **결정계수 R²** — 1에 가까울수록 잘 맞춤. 책 3-1절의 과대/과소적합 그림이 바로 이 곡선입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlKnnReg extends w.HTMLElement {
    private k = 3;

    private predict(x: number): number {
      const ds = DATA.map(p => ({ p, d: Math.abs(p.x - x) }));
      ds.sort((a, b) => a.d - b.d);
      return ds.slice(0, this.k).reduce((s, v) => s + v.p.y, 0) / this.k;
    }

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#mk-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      const XMIN = -0.5, XMAX = 10.5, YMIN = -3.5, YMAX = 3.5;
      const px = (x: number) => ((x - XMIN) / (XMAX - XMIN)) * W;
      const py = (y: number) => H - ((y - YMIN) / (YMAX - YMIN)) * H;
      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#cbd5e1';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(0, py(0)); ctx.lineTo(W, py(0));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i <= 160; i++) {
          const x = XMIN + ((XMAX - XMIN) * i) / 160;
          const X = px(x), Y = py(this.predict(x));
          i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = '#3b82c4';
        DATA.forEach(p => {
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y), 4, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      const mean = DATA.reduce((s, p) => s + p.y, 0) / DATA.length;
      const ssTot = DATA.reduce((s, p) => s + (p.y - mean) ** 2, 0);
      const ssRes = DATA.reduce((s, p) => s + (p.y - this.predict(p.x)) ** 2, 0);
      const r2 = 1 - ssRes / ssTot;
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mk-k-val', String(this.k));
      setText('#mk-r2', `훈련 R² = ${r2.toFixed(3)} (1에 가까울수록 잘 맞춤)`);
    }

    @addEventListener('#mk-k', 'input')
    onK(e: Event) { this.k = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:40px; text-align:right; color:#1e293b; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .mk-r2 { text-align:center; font-size:12.5px; font-weight:700; color:#1e293b; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:8px; font-family:monospace; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
        </style>

        <div class="mm-def">
  <div><b>정의</b> k-NN 회귀는 가까운 이웃 k개의 타깃 평균을 예측값으로 쓰는 방법입니다.</div>
  <div><b>언제</b> 매끄러운 보간이 필요하고 데이터가 소규모일 때 씁니다.</div>
  <div><b>예시</b> 결측값 대치, 집값 추정</div>
</div>
<div class="mm-intro">
          파란 점 16개의 평균 곡선을 그립니다. <b>k를 1→15</b>로 올려보세요 — 울퉁불퉁함이 매끄러움으로 바뀌고 R²가 따라 움직입니다.
        </div>

        <div class="ctl"><label>이웃 수 k <input id="mk-k" type="range" min="1" max="15" step="1" value="${this.k}"><b id="mk-k-val">${this.k}</b></label></div>
        <canvas id="mk-canvas" width="${W}" height="${H}"></canvas>
        <div class="mk-r2" id="mk-r2"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
