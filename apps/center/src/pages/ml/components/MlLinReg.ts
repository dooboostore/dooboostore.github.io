import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-linreg';

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
  const r = mulberry(9);
  const pts: Pt[] = [];
  for (let i = 0; i < 25; i++) {
    const x = 8 + 34 * r();
    pts.push({ x, y: 30 * x - 300 + (r() + r() - 1) * 90 });
  }
  return pts;
}
const DATA = genData();

function leastSquares(data: Pt[]): [number, number] {
  const n = data.length;
  const mx = data.reduce((s, p) => s + p.x, 0) / n;
  const my = data.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, den = 0;
  data.forEach(p => { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; });
  const w = num / (den || 1);
  return [w, my - w * mx];
}

const MD = `
## 선형 회귀 — 최소제곱 직선 한 방
- k-NN의 한계: 훈련 범위 밖(50cm 농어)은 이웃이 없어 엉뚱한 답을 냅니다. 직선 방정식이면 **범위 밖도 예측(외삽)** 됩니다.
- 직선 \`y = w·x + b\`에서 오차 제곱합이 최소가 되는 w, b를 **최소제곱법**으로 바로 구합니다. 책의 코드: \`LinearRegression()\` → \`fit()\` → \`coef_\`, \`intercept_\`.
- 기울기·절편 슬라이더를 흔들어 MSE가 커지는 걸 보고, "최적핏" 버튼으로 최소점에 꽂히는 걸 확인해보세요.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlLinReg extends w.HTMLElement {
    private wv = 20;
    private bv = -100;

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#ml-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      const XMIN = 5, XMAX = 50, YMIN = -300, YMAX = 1100;
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
        ctx.moveTo(px(XMIN), py(this.wv * XMIN + this.bv));
        ctx.lineTo(px(XMAX), py(this.wv * XMAX + this.bv));
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = '#3b82c4';
        DATA.forEach(p => {
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y), 4, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      const mse = DATA.reduce((s, p) => s + (this.wv * p.x + this.bv - p.y) ** 2, 0) / DATA.length;
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#ml-w-val', this.wv.toFixed(1));
      setText('#ml-b-val', this.bv.toFixed(0));
      setText('#ml-mse', `y = ${this.wv.toFixed(1)}·x + (${this.bv.toFixed(0)}) · MSE = ${mse.toFixed(0)}`);
      const inp = (sel: string, v: number) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLInputElement;
        if (el) el.value = String(v);
      };
      inp('#ml-w', this.wv);
      inp('#ml-b', this.bv);
    }

    @addEventListener('#ml-w', 'input')
    onW(e: Event) { this.wv = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#ml-b', 'input')
    onB(e: Event) { this.bv = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#ml-opt', 'click')
    onOpt() {
      const [wo, bo] = leastSquares(DATA);
      this.wv = Math.round(wo * 10) / 10;
      this.bv = Math.round(bo);
      this.refresh();
    }

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
          .ctl b { min-width:52px; text-align:right; color:#1e293b; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .ml-btn { display:block; margin:8px auto; padding:7px 18px; border-radius:16px; border:1.5px solid #14532d; background:#f0fdf4; color:#14532d; font-size:12px; font-weight:800; cursor:pointer; }
          .ml-mse { text-align:center; font-size:12.5px; font-weight:700; color:#1e293b; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:8px; font-family:monospace; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
        </style>

        <div class="mm-def">
  <div><b>정의</b> 선형회귀는 오차 제곱합이 최소가 되는 직선 y = w·x + b를 찾는 방법입니다.</div>
  <div><b>언제</b> 선형 관계가 있고 범위 밖 예측(외삽)이 필요할 때 씁니다.</div>
  <div><b>예시</b> 농어 무게, 광고비-매출</div>
</div>
<div class="mm-intro">
          농어 길이→무게 직선을 손으로 맞춰보세요. <b>기울기·절편</b>을 흔들면 MSE가 변하고, "최적핏"이 최소제곱 해를 꽂아줍니다.
        </div>

        <div class="ctl"><label>기울기 w <input id="ml-w" type="range" min="-10" max="60" step="0.5" value="${this.wv}"><b id="ml-w-val"></b></label></div>
        <div class="ctl"><label>절편 b <input id="ml-b" type="range" min="-800" max="400" step="10" value="${this.bv}"><b id="ml-b-val"></b></label></div>
        <button class="ml-btn" id="ml-opt">최적핏 (최소제곱)</button>
        <canvas id="ml-canvas" width="${W}" height="${H}"></canvas>
        <div class="ml-mse" id="ml-mse"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
