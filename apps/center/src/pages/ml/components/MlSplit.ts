import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-split';

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
const TRUE = (x: number) => x * x;

function gen(n: number, seed: number, noise: number): Pt[] {
  const r = mulberry(seed);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const x = -3 + 6 * r();
    pts.push({ x, y: TRUE(x) + (r() + r() - 1) * noise });
  }
  return pts.sort((a, b) => a.x - b.x);
}

const TRAIN = gen(12, 11, 4);
const TEST = gen(40, 77, 4);

/** 가우스 소거법으로 정규방정식 풀이 (차수 ≤ 9) */
function polyfit(data: Pt[], deg: number): number[] {
  const d = deg + 1;
  const A: number[][] = Array.from({ length: d }, () => new Array(d + 1).fill(0));
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      let s = 0;
      for (const p of data) s += Math.pow(p.x, i + j);
      A[i][j] = s;
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
## 훈련 세트와 테스트 세트 — 시험 문제 유출 금지
- 모델은 **훈련 세트**로 배우고, **테스트 세트**(처음 보는 문제)로 평가합니다. 훈련 점수만 좋으면 소용없습니다.
- 차수가 낮으면 둘 다 나쁨(**과소적합**), 차수를 올리면 훈련 오차는 계속 줄지만 테스트 오차가 다시 커집니다(**과대적합**). 테스트 오차가 가장 작은 차수가 정답입니다.
- 책의 코드: \`train_test_split()\` → \`fit()\` → \`score()\` (테스트 점수)
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlSplit extends w.HTMLElement {
    private deg = 2;

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#ms-canvas') as HTMLCanvasElement;
      const wcoef = polyfit(TRAIN, this.deg);
      const trErr = mse(wcoef, TRAIN);
      const teErr = mse(wcoef, TEST);
      const XMIN = -3.2, XMAX = 3.2, YMIN = -6, YMAX = 16;
      const px = (x: number) => ((x - XMIN) / (XMAX - XMIN)) * W;
      const py = (y: number) => H - ((y - YMIN) / (YMAX - YMIN)) * H;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#3b82c4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 100; i++) {
          const x = XMIN + ((XMAX - XMIN) * i) / 100;
          const X = px(x), Y = py(evalPoly(wcoef, x));
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
      setText('#ms-deg-val', String(this.deg));
      setText('#ms-train', `훈련 MSE: ${trErr.toFixed(2)}`);
      setText('#ms-test', `테스트 MSE: ${teErr.toFixed(2)}`);
      const verdict = this.shadowRoot?.querySelector('#ms-verdict') as HTMLElement;
      if (verdict) {
        const msg = this.deg <= 1 ? '📉 과소적합 — 너무 단순해서 둘 다 못 맞춤'
          : teErr < 8 ? '✅ 적절 — 테스트 오차가 가장 작은 구간' : '📈 과대적합 — 훈련만 외우고 테스트는 틀림';
        verdict.textContent = msg;
        verdict.style.background = teErr < 8 ? '#dcfce7' : '#fef2f2';
        verdict.style.color = teErr < 8 ? '#166534' : '#991b1b';
        verdict.style.borderColor = teErr < 8 ? '#bbf7d0' : '#fecaca';
      }
    }

    @addEventListener('#ms-deg', 'input')
    onDeg(e: Event) { this.deg = Number((e.target as HTMLInputElement).value); this.refresh(); }

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
          .ms-errs { display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px; text-align:center; margin-top:8px; }
          .ms-err { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px; font-weight:700; color:#1e293b; }
          .ms-verdict { text-align:center; font-size:12.5px; font-weight:700; border-radius:8px; padding:8px 12px; margin-top:8px; border:1px solid; }
          .mm-legend { display:flex; gap:12px; justify-content:center; font-size:11px; color:#64748b; margin-top:6px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
        </style>

        <div class="mm-def">
  <div><b>정의</b> 훈련/테스트 분할은 데이터를 학습용과 평가용으로 나누어 처음 보는 문제로 실력을 재는 방법입니다.</div>
  <div><b>언제</b> 모델을 평가할 때마다 항상 씁니다.</div>
  <div><b>예시</b> 시험 문제 유출 금지, train_test_split</div>
</div>
<div class="mm-intro">
          빨간 점 12개로 배우고 회색 점 40개로 시험봅니다. <b>차수</b>를 올려보세요 — 훈련 오차는 계속 줄지만 테스트 오차는 U자로 다시 커집니다.
        </div>

        <div class="ctl"><label>다항 차수 <input id="ms-deg" type="range" min="0" max="9" step="1" value="${this.deg}"><b id="ms-deg-val">${this.deg}</b></label></div>
        <canvas id="ms-canvas" width="${W}" height="${H}"></canvas>
        <div class="mm-legend"><span><span style="color:#ef4444">●</span> 훈련(12)</span><span><span style="color:#94a3b8">●</span> 테스트(40)</span></div>
        <div class="ms-errs"><div class="ms-err" id="ms-train"></div><div class="ms-err" id="ms-test"></div></div>
        <div class="ms-verdict" id="ms-verdict"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
