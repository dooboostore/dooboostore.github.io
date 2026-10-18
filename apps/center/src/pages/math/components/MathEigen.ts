import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-eigen';

const MD = `
## 고유값·고유벡터란?
- 행렬 A를 곱해도 **방향은 그대로**, 길이만 배로 늘거나 줄어드는 특별한 벡터가 **고유벡터(eigenvector)**입니다. 그 배율이 **고유값(eigenvalue, λ)**.
- 수식: \`Av = λv\`
- 대칭행렬(3×3)은 **항상 서로 직각인 고유벡터 3개**를 가지고, 고유값은 모두 실수입니다.
- 회색 화살표(월드 X·Y·Z 축을 A로 옮긴 것)는 방향이 뒤틀리지만, **빨강(λ1)·파랑(λ2)·초록(λ3) 화살표만은 방향이 그대로 유지된 채 길이만 바뀝니다** — 이게 고유벡터의 정의 그 자체입니다.
- λ가 0에 가까워지면 그 방향은 완전히 찌그러집니다(그 방향의 정보를 잃음) — 특이행렬.
- 슬라이더는 실제로는 "어떤 기울어진 축 기준으로 보면 대각행렬"이 되도록 미리 만든 고유값(λ1,λ2,λ3)입니다. 그런데도 아래 계산은 축을 미리 알려주지 않고 **일반적인 야코비(Jacobi) 고유값 분해**로 처음부터 다시 찾아낸 결과입니다 — 정확히 같은 값이 나오는 걸 확인할 수 있습니다.
- **어디에 쓰이나요?** — PCA의 주성분 방향, 건물·다리의 고유진동수(공진 방지), 로봇 팔의 관성모멘트 텐서, 딥러닝 손실함수의 곡률(헤시안) 분석.
`;

type Mat3 = number[][];

function matMul(A: Mat3, B: Mat3): Mat3 {
  const C: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += A[i][k] * B[k][j]; C[i][j] = s; }
  return C;
}
function matVec(A: Mat3, v: number[]): [number, number, number] {
  return [
    A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2],
    A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2],
    A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2],
  ];
}
function transpose(M: Mat3): Mat3 {
  return [[M[0][0], M[1][0], M[2][0]], [M[0][1], M[1][1], M[2][1]], [M[0][2], M[1][2], M[2][2]]];
}
function det3(M: Mat3): number {
  return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1])
    - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
    + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
}

function rotMat(yawDeg: number, pitchDeg: number, rollDeg: number): Mat3 {
  const y = (yawDeg * Math.PI) / 180, p = (pitchDeg * Math.PI) / 180, r = (rollDeg * Math.PI) / 180;
  const cy = Math.cos(y), sy = Math.sin(y);
  const cp = Math.cos(p), sp = Math.sin(p);
  const cr = Math.cos(r), sr = Math.sin(r);
  const Ry: Mat3 = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
  const Rx: Mat3 = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]];
  const Rz: Mat3 = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]];
  return matMul(Rz, matMul(Rx, Ry));
}

// 고유벡터가 월드 X/Y/Z 축과 일부러 어긋나도록 기울여 둔다 (야코비 분해가 진짜로 축을 "찾아내야" 하도록)
const TILT = rotMat(25, 15, 10);

/** 야코비 고유값 손풀이 (대칭행렬 전용): 회전을 반복해 비대각 성분을 0으로 만든다. */
function jacobiEigen(Ain: Mat3, maxSweeps = 60) {
  const a = Ain.map(r => r.slice());
  const v: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q];
    if (off < 1e-14) break;
    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-16) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        const app = a[p][p], aqq = a[q][q], apq = a[p][q];
        a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
        a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
        a[p][q] = 0; a[q][p] = 0;
        for (let i = 0; i < 3; i++) {
          if (i !== p && i !== q) {
            const aip = a[i][p], aiq = a[i][q];
            a[i][p] = c * aip - s * aiq; a[p][i] = a[i][p];
            a[i][q] = s * aip + c * aiq; a[q][i] = a[i][q];
          }
        }
        for (let i = 0; i < 3; i++) {
          const vip = v[i][p], viq = v[i][q];
          v[i][p] = c * vip - s * viq;
          v[i][q] = s * vip + c * viq;
        }
      }
    }
  }
  const values = [a[0][0], a[1][1], a[2][2]];
  const vectors = [0, 1, 2].map(i => [v[0][i], v[1][i], v[2][i]]);
  const order = [0, 1, 2].sort((i, j) => Math.abs(values[j]) - Math.abs(values[i]));
  return { values: order.map(i => values[i]), vectors: order.map(i => vectors[i]) };
}

/** 슬라이더 값 a,b,c(=고유값)로부터, 일부러 기울어진 대칭행렬 A를 만든다. */
function buildA(a: number, b: number, c: number): Mat3 {
  const D: Mat3 = [[a, 0, 0], [0, b, 0], [0, 0, c]];
  return matMul(transpose(TILT), matMul(D, TILT));
}

function eig(a: number, b: number, c: number) {
  const A = buildA(a, b, c);
  const { values, vectors } = jacobiEigen(A);
  return { A, values, vectors };
}

function fmt3(v: number[]) { return `${v[0].toFixed(2)}, ${v[1].toFixed(2)}, ${v[2].toFixed(2)}`; }

function notesHtml(a: number, b: number, c: number) {
  const { A, values, vectors } = eig(a, b, c);
  const dot = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const singular = values.some(l => Math.abs(l) < 0.05);
  return `<div>tr(A) = λ1+λ2+λ3 = ${(values[0] + values[1] + values[2]).toFixed(2)}</div>` +
    `<div>det(A) = λ1·λ2·λ3 = ${det3(A).toFixed(2)} (= ${(values[0] * values[1] * values[2]).toFixed(2)})</div>` +
    `<div>λ1=${values[0].toFixed(2)}, λ2=${values[1].toFixed(2)}, λ3=${values[2].toFixed(2)}</div>` +
    `<div>v1≈(${fmt3(vectors[0])}), v2≈(${fmt3(vectors[1])}), v3≈(${fmt3(vectors[2])})</div>` +
    `<div>직교성 확인: v1·v2=${dot(vectors[0], vectors[1]).toFixed(4)}, v1·v3=${dot(vectors[0], vectors[2]).toFixed(4)}, v2·v3=${dot(vectors[1], vectors[2]).toFixed(4)} (모두 0이면 직각)</div>` +
    (singular ? `<div style="margin-top:6px;color:#ef4444">λ ≈ 0인 축이 있음 → 그 방향이 완전히 찌그러짐 (특이행렬, 정보 손실)</div>` : '');
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathEigen extends w.HTMLElement {
    private a = 3;
    private b = 1.5;
    private c = 0.5;

    private refresh() {
      const { a, b, c } = this;
      const { values, vectors } = eig(a, b, c);

      const applied = this.shadowRoot?.querySelector('#math-eigen-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: λ1=${values[0].toFixed(2)}, λ2=${values[1].toFixed(2)}, λ3=${values[2].toFixed(2)} (기울어진 축 기준 고유값 a=${a.toFixed(1)}, b=${b.toFixed(1)}, c=${c.toFixed(1)})`;

      const notes = this.shadowRoot?.querySelector('#math-eigen-notes') as HTMLElement;
      if (notes) notes.innerHTML = notesHtml(a, b, c);

      (['a', 'b', 'c'] as const).forEach(k => {
        const val = this.shadowRoot?.querySelector(`#eigen-${k}-val`) as HTMLElement;
        if (val) val.textContent = this[k].toFixed(1);
      });

      vectors.forEach((v, i) => {
        const tip = [v[0] * values[i], v[1] * values[i], v[2] * values[i]];
        const el = this.shadowRoot?.querySelector(`#eigen-v${i}`) as HTMLElement;
        if (!el) return;
        el.setAttribute('x2', tip[0].toFixed(3)); el.setAttribute('y2', tip[1].toFixed(3)); el.setAttribute('z2', tip[2].toFixed(3));
        el.setAttribute('label', `v${i + 1} (λ${i + 1}=${values[i].toFixed(2)})`);
      });

      const A = buildA(a, b, c);
      const axes: [number, number, number][] = [[1.4, 0, 0], [0, 1.4, 0], [0, 0, 1.4]];
      axes.forEach((e, i) => {
        const ae = matVec(A, e);
        const el = this.shadowRoot?.querySelector(`#eigen-ax${i}`) as HTMLElement;
        if (!el) return;
        el.setAttribute('x2', ae[0].toFixed(3)); el.setAttribute('y2', ae[1].toFixed(3)); el.setAttribute('z2', ae[2].toFixed(3));
      });
    }

    @addEventListener('#eigen-a', 'input')
    onAInput(e: Event) { this.a = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#eigen-b', 'input')
    onBInput(e: Event) { this.b = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#eigen-c', 'input')
    onCInput(e: Event) { this.c = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { a, b, c } = this;
      const { values, vectors } = eig(a, b, c);
      const A = buildA(a, b, c);
      const colors = ['#e5484d', '#3e63dd', '#10b981'];
      const eigTags = vectors.map((v, i) => {
        const tip = [v[0] * values[i], v[1] * values[i], v[2] * values[i]];
        return `<vector3d id="eigen-v${i}" x1="0" y1="0" z1="0" x2="${tip[0].toFixed(3)}" y2="${tip[1].toFixed(3)}" z2="${tip[2].toFixed(3)}" color="${colors[i]}" label="v${i + 1} (λ${i + 1}=${values[i].toFixed(2)})"></vector3d>`;
      }).join('\n          ');
      const axes: [number, number, number][] = [[1.4, 0, 0], [0, 1.4, 0], [0, 0, 1.4]];
      const axTags = axes.map((e, i) => {
        const ae = matVec(A, e);
        return `<vector3d id="eigen-ax${i}" x1="0" y1="0" z1="0" x2="${ae[0].toFixed(3)}" y2="${ae[1].toFixed(3)}" z2="${ae[2].toFixed(3)}" color="#94a3b8"></vector3d>`;
      }).join('\n          ');
      return `
        <style>
          :host { display:block; }
          .math-title { font-size:15px; font-weight:800; color:#1e293b; text-align:center; margin-bottom:8px; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; color:#6366f1; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .math-legend { display:flex; gap:12px; font-size:11px; color:#64748b; margin-top:8px; flex-wrap:wrap; }
          .math-legend b { font-weight:800; }
          .math-notes { font-size:12px; font-weight:700; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin-top:8px; line-height:1.7; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:44px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-title">회색: 임의 방향(뒤틀림) → 빨강·파랑·초록: 고유벡터(방향 유지, 길이만 λ배)</div>
        <div class="math-formula">수식: Av = λv (대칭행렬 A, 야코비 고유값 분해로 직접 계산)</div>
        <div class="math-applied" id="math-eigen-applied">적용: λ1=${values[0].toFixed(2)}, λ2=${values[1].toFixed(2)}, λ3=${values[2].toFixed(2)} (기울어진 축 기준 고유값 a=${a.toFixed(1)}, b=${b.toFixed(1)}, c=${c.toFixed(1)})</div>
        <div class="math-desc">a·b·c(고유값)를 바꾸면 빨강·파랑·초록 화살표 길이가 바뀝니다. 드래그로 돌려서 세 화살표가 항상 서로 직각인 걸 확인해 보세요.</div>
        <cartesian-chart-3d range="4" style="height:340px">
          ${axTags}
          ${eigTags}
        </cartesian-chart-3d>
        <div class="math-legend"><span><b style="color:#94a3b8">→ 임의 방향(뒤틀림)</b></span><span><b style="color:#e5484d">→ v1(λ1)</b></span><span><b style="color:#3e63dd">→ v2(λ2)</b></span><span><b style="color:#10b981">→ v3(λ3)</b></span></div>
        <div class="math-notes" id="math-eigen-notes">${notesHtml(a, b, c)}</div>
        <div class="ctl"><label>λ1 (a) <input id="eigen-a" type="range" min="-3" max="3" step="0.1" value="${a}"><b id="eigen-a-val">${a.toFixed(1)}</b></label></div>
        <div class="ctl"><label>λ2 (b) <input id="eigen-b" type="range" min="-3" max="3" step="0.1" value="${b}"><b id="eigen-b-val">${b.toFixed(1)}</b></label></div>
        <div class="ctl"><label>λ3 (c) <input id="eigen-c" type="range" min="-3" max="3" step="0.1" value="${c}"><b id="eigen-c-val">${c.toFixed(1)}</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
