import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-cvgrid';

const W = 340, ROW_H = 30;
const DEGS = [1, 2, 3, 4, 5];
const ALPHAS = [0, 1, 100];

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
function genPool(): Pt[] {
  const r = mulberry(3);
  const pts: Pt[] = [];
  for (let i = 0; i < 24; i++) {
    const x = -3 + 6 * r();
    pts.push({ x, y: x * x + (r() + r() - 1) * 4 });
  }
  return pts;
}
const POOL = genPool();

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

function cvScore(deg: number, alpha: number, k: number): number {
  const r = mulberry(1000 + deg * 10 + k);
  const idx = POOL.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const folds: Pt[][] = Array.from({ length: k }, () => []);
  idx.forEach((v, i) => folds[i % k].push(POOL[v]));
  let sum = 0;
  for (let f = 0; f < k; f++) {
    const valid = folds[f];
    const train = folds.flatMap((g, i) => (i === f ? [] : g));
    const wcoef = ridge(train, deg, alpha);
    sum += valid.reduce((s, p) => s + (evalPoly(wcoef, p.x) - p.y) ** 2, 0) / valid.length;
  }
  return sum / k;
}

const MD = `
## 교차 검증과 그리드 서치 — 모의고사 여러 회
- 테스트 세트는 **실전 딱 한 번**만 씁니다. 그 전에 모델을 고르는 용도로 훈련 세트를 또 쪼갭니다. 돌아가며 한 조각씩 빼고 평가하는 게 **k-겹 교차 검증**입니다.
- 아래 표는 차수 × alpha 조합 15개를 k번씩 돌린 **그리드 서치** 축소판입니다. 초록 칸(낮은 오차)이 정답 조합입니다.
- 책의 코드: \`cross_validate()\` → \`GridSearchCV(param_grid)\` → \`best_params_\`, \`best_score_\`
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlCvGrid extends w.HTMLElement {
    private k = 5;

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#mc-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      const scores: number[][] = DEGS.map(d => ALPHAS.map(a => cvScore(d, a, this.k)));
      const flat = scores.flat();
      const mn = Math.min(...flat), mx = Math.max(...flat);
      let bi = 0, bj = 0;
      scores.forEach((row, i) => row.forEach((v, j) => {
        if (v === mn) { bi = i; bj = j; }
      }));
      const H = DEGS.length * ROW_H + 26;
      if (canvas) canvas.height = H;
      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);
        ctx.font = '10px sans-serif';
        ALPHAS.forEach((a, j) => {
          ctx.fillStyle = '#64748b';
          const X = 64 + ((W - 70) * j) / ALPHAS.length;
          ctx.fillText(`α=${a}`, X + 8, 14);
        });
        DEGS.forEach((d, i) => {
          const Y = 20 + i * ROW_H;
          ctx.fillStyle = '#1e293b';
          ctx.fillText(`차수 ${d}`, 6, Y + ROW_H / 2 + 3);
          ALPHAS.forEach((a, j) => {
            const v = scores[i][j];
            const t = (v - mn) / (mx - mn || 1);
            const g = Math.round(220 - t * 160);
            const r = Math.round(220 - (1 - t) * 60);
            ctx.fillStyle = `rgb(${r},${g},180)`;
            const X = 64 + ((W - 70) * j) / ALPHAS.length;
            ctx.fillRect(X, Y + 2, (W - 70) / ALPHAS.length - 4, ROW_H - 4);
            if (i === bi && j === bj) {
              ctx.strokeStyle = '#14532d';
              ctx.lineWidth = 3;
              ctx.strokeRect(X, Y + 2, (W - 70) / ALPHAS.length - 4, ROW_H - 4);
              ctx.lineWidth = 1;
            }
            ctx.fillStyle = '#1e293b';
            ctx.fillText(v.toFixed(1), X + 10, Y + ROW_H / 2 + 3);
          });
        });
      }
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mc-k-val', String(this.k));
      setText('#mc-best', `최적: 차수 ${DEGS[bi]} · α=${ALPHAS[bj]} · CV 오차 ${mn.toFixed(2)} (진한 테두리)`);
    }

    @addEventListener('#mc-k', 'input')
    onK(e: Event) { this.k = Number((e.target as HTMLInputElement).value); this.refresh(); }

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
          .mc-best { text-align:center; font-size:12.5px; font-weight:800; color:#14532d; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:8px; font-family:monospace; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
        </style>

        <div class="mm-def">
  <div><b>정의</b> 데이터를 여러 겹으로 나눠 돌아가며 검증하는 교차 검증과, 하이퍼파라미터 조합을 전부 시험하는 그리드 서치를 합친 모델 선택 방법입니다.</div>
  <div><b>언제</b> 모델과 하이퍼파라미터를 고를 때 씁니다.</div>
  <div><b>예시</b> 다항식 차수·alpha 선택, GridSearchCV best_params_, best_score_ 확인</div>
</div>
        <div class="mm-intro">
          24개 점으로 차수×alpha 15조합을 겨룹니다. <b>겹 수 k</b>를 바꿔도 최적 칸이 흔들리지 않는지 확인해보세요.
        </div>

        <div class="ctl"><label>겹 수 k <input id="mc-k" type="range" min="2" max="10" step="1" value="${this.k}"><b id="mc-k-val">${this.k}</b></label></div>
        <canvas id="mc-canvas" width="${W}" height="180"></canvas>
        <div class="mc-best" id="mc-best"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
