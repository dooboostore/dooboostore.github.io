import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-polyreg';

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
function gen(n: number, seed: number): Pt[] {
  const r = mulberry(seed);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const x = 8 + 34 * r();
    pts.push({ x, y: 30 * x - 300 + (r() + r() - 1) * 110 });
  }
  return pts.sort((a, b) => a.x - b.x);
}
const TRAIN = gen(15, 31);
const TEST = gen(40, 97);

/** 릿지 회귀: (XᵀX + αI)w = Xᵀy — 절편(마지막 항)은 규제 제외 */
function ridge(data: Pt[], deg: number, alpha: number): number[] {
  const d = deg + 1;
  const A: number[][] = Array.from({ length: d }, () => new Array(d + 1).fill(0));
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      let s = 0;
      for (const p of data) s += Math.pow(p.x, i + j);
      A[i][j] = s + (i === j && i < d - 1 ? alpha : 0);
    }
    let s = 0;
    for (const p of data) s += p.y * Math.pow(p.x, i);
    A[i][d] = s;
  }
  for (let c = 0; c < d; c++) {
    let piv = c;
    for (let r = c + 1; r < d; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    const div = A[c][c] || 1e-9;
    for (let j = c; j <= d; j++) A[c][j] /= div;
    for (let r = 0; r < d; r++) {
      if (r === c) continue;
      const f = A[r][c];
      for (let j = c; j <= d; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map(row => row[d]);
}

const evalPoly = (w: number[], x: number) => w.reduce((s, c, i) => s + c * Math.pow(x, i), 0);
const mse = (w: number[], data: Pt[]) => data.reduce((s, p) => s + (evalPoly(w, p.x) - p.y) ** 2, 0) / data.length;

const MD = `
## 특성 공학과 규제 — 과대적합의 고삐
- 특성을 제곱·세제곱으로 늘리면(**다항 특성**) 복잡한 곡선을 맞출 수 있지만, 차수가 높을수록 훈련 데이터에 딱 붙어버립니다(과대적합).
- **규제**는 가중치가 커지는 데 벌금을 매겨 곡선을 얌전하게 만듭니다. **릿지**(L2, 제곱합 벌금)는 가중치를 작게, **라쏘**(L1, 절댓값 벌금)는 일부를 0으로(특성 선택 효과).
- **alpha**가 벌금의 세기입니다. 0이면 규제 없음, 키울수록 직선에 수렴합니다. 테스트 오차가 최소인 alpha를 찾으세요.
- 책의 코드: \`PolynomialFeatures\` → \`Ridge(alpha=α)\` / \`Lasso(alpha=α)\`
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlPolyReg extends w.HTMLElement {
    private deg = 5;
    private alphaExp = -4; // -4 → alpha 0, 그 외 10^exp

    private get alpha() { return this.alphaExp <= -4 ? 0 : Math.pow(10, this.alphaExp); }

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#mp-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      const coef = ridge(TRAIN, this.deg, this.alpha);
      const trErr = mse(coef, TRAIN);
      const teErr = mse(coef, TEST);
      const wnorm = Math.sqrt(coef.slice(0, -1).reduce((s, c) => s + c * c, 0));
      const XMIN = 5, XMAX = 45;
      const allY = TRAIN.concat(TEST).map(p => p.y);
      const YMIN = Math.min(...allY, 0) - 60, YMAX = Math.max(...allY) + 60;
      const px = (x: number) => ((x - XMIN) / (XMAX - XMIN)) * W;
      const py = (y: number) => H - ((y - YMIN) / (YMAX - YMIN)) * H;
      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const x = XMIN + ((XMAX - XMIN) * i) / 120;
          const X = px(x), Y = py(evalPoly(coef, x));
          i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = '#94a3b8';
        TEST.forEach(p => {
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y), 2.5, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.fillStyle = '#ef4444';
        TRAIN.forEach(p => {
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y), 4, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mp-deg-val', String(this.deg));
      setText('#mp-alpha-val', this.alpha === 0 ? '0 (없음)' : this.alpha.toExponential(0));
      setText('#mp-err', `훈련 ${trErr.toFixed(0)} · 테스트 ${teErr.toFixed(0)} · |w|=${wnorm.toExponential(1)}`);
    }

    @addEventListener('#mp-deg', 'input')
    onDeg(e: Event) { this.deg = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#mp-alpha', 'input')
    onAlpha(e: Event) { this.alphaExp = Number((e.target as HTMLInputElement).value); this.refresh(); }

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
          .ctl b { min-width:64px; text-align:right; color:#1e293b; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .mp-err { text-align:center; font-size:12.5px; font-weight:700; color:#1e293b; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:8px; font-family:monospace; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
        </style>

        <div class="mm-def">
  <div><b>정의</b> 다항회귀+규제는 특성을 제곱·세제곱으로 늘려 곡선을 맞추고 벌금(alpha)으로 가중치를 누르는 방법입니다.</div>
  <div><b>언제</b> 곡선 관계인데 과대적합을 잡아야 할 때 씁니다.</div>
  <div><b>예시</b> 성장 곡선, 릿지/라쏘</div>
</div>
<div class="mm-intro">
          차수 5에서 시작합니다. <b>alpha를 0→크게</b> 올려보세요 — 울퉁불퉁한 곡선이 얌전해지며 테스트 오차가 내려갔다가, 너무 키우면 다시 올라갑니다.
        </div>

        <div class="ctl"><label>다항 차수 <input id="mp-deg" type="range" min="1" max="9" step="1" value="${this.deg}"><b id="mp-deg-val">${this.deg}</b></label></div>
        <div class="ctl"><label>규제 alpha <input id="mp-alpha" type="range" min="-4" max="3" step="0.5" value="${this.alphaExp}"><b id="mp-alpha-val"></b></label></div>
        <canvas id="mp-canvas" width="${W}" height="${H}"></canvas>
        <div class="mp-err" id="mp-err"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
