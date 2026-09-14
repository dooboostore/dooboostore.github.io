import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-pca';

const MD = `
## PCA(주성분분석, Principal Component Analysis)란?
- 점(데이터)들이 흩어져 있을 때, **분산(퍼짐)이 가장 큰 방향부터 순서대로** 찾아내는 방법입니다. 그 방향들이 **주성분(principal component, PC)**입니다.
- 데이터의 **공분산 행렬(covariance matrix)**을 만들고, 그 행렬의 **고유벡터가 주성분 방향**, **고유값이 그 방향의 분산**입니다. — 바로 앞 "고유값·고유벡터" 페이지에서 본 원리를 실제 데이터에 그대로 적용한 것입니다.
- PC1(빨강)이 가장 많이 퍼진 방향, PC2(파랑)가 그다음, PC3(초록)이 가장 적게 퍼진 방향이며, 세 방향은 항상 서로 직각입니다.
- 슬라이더로 sx·sy·sz(점구름의 각 축 방향 퍼짐)를 바꾸면 점구름 모양이 바뀌고, PCA가 찾아내는 축도 따라 바뀝니다. 점구름이 회전되어 있어도(월드 X/Y/Z와 안 맞아도) PCA는 항상 실제로 퍼진 방향을 정확히 찾아냅니다.
- **설명 분산비(explained variance ratio)**: 전체 퍼짐 중 각 PC가 차지하는 비율. PC1+PC2만으로도 대부분을 설명하면, 그 2개 축만 남기고 3차원 → 2차원으로 압축해도 정보 손실이 적다는 뜻입니다.
- **어디에 쓰이나요?** — 고차원 데이터를 2~3차원으로 압축(차원 축소), 얼굴 인식(Eigenface), 노이즈 제거, 데이터 시각화, 특징(feature) 추출.
`;

// ── 시드 고정 난수 (매번 같은 점구름) ──
function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGaussian(rng: () => number) {
  let spare: number | null = null;
  return (): number => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
}

const N = 70;
const gauss = makeGaussian(mulberry32(20260914));
// 표준정규 기본 점(고정) — 슬라이더로는 이 점들을 축별로 늘리기만 한다
const BASE_POINTS: [number, number, number][] = Array.from({ length: N }, () => [gauss(), gauss(), gauss()]);

// ── 3x3 행렬 유틸 (자체 구현: 겉에서 한 줄로 읽히고 파고들면 손풀이) ──
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

// 점구름을 살짝 기울여서, 월드 X/Y/Z 축과 일부러 안 맞게 둔다 (PCA가 진짜로 축을 "찾아내야" 하도록)
const TILT = rotMat(25, 15, 10);

function worldPoints(sx: number, sy: number, sz: number): [number, number, number][] {
  return BASE_POINTS.map(([bx, by, bz]) => matVec(TILT, [sx * bx, sy * by, sz * bz]));
}

function covarianceOf(points: [number, number, number][]) {
  const n = points.length;
  const mean = [0, 0, 0];
  points.forEach(p => { mean[0] += p[0]; mean[1] += p[1]; mean[2] += p[2]; });
  mean[0] /= n; mean[1] /= n; mean[2] /= n;
  const cov: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  points.forEach(p => {
    const dx = p[0] - mean[0], dy = p[1] - mean[1], dz = p[2] - mean[2];
    cov[0][0] += dx * dx; cov[0][1] += dx * dy; cov[0][2] += dx * dz;
    cov[1][1] += dy * dy; cov[1][2] += dy * dz;
    cov[2][2] += dz * dz;
  });
  cov[1][0] = cov[0][1]; cov[2][0] = cov[0][2]; cov[2][1] = cov[1][2];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] /= (n - 1);
  return { mean, cov };
}

/** 야코비 고유값 손풀이: 대칭행렬만 대상으로, 회전을 반복해 비대각 성분을 0으로 만든다. */
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
  const order = [0, 1, 2].sort((i, j) => values[j] - values[i]);
  return { values: order.map(i => values[i]), vectors: order.map(i => vectors[i]) };
}

function pca(sx: number, sy: number, sz: number) {
  const pts = worldPoints(sx, sy, sz);
  const { mean, cov } = covarianceOf(pts);
  const { values, vectors } = jacobiEigen(cov);
  const total = values[0] + values[1] + values[2] || 1;
  const ratios = values.map(v => Math.max(0, v) / total);
  return { pts, mean, values, vectors, ratios };
}

function pts3d(list: [number, number, number][]) {
  return list.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)},${p[2].toFixed(2)}`).join(' ');
}

function notesHtml(values: number[], ratios: number[]) {
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
  return `<div>λ1=${values[0].toFixed(2)} (${pct(ratios[0])}), λ2=${values[1].toFixed(2)} (${pct(ratios[1])}), λ3=${values[2].toFixed(2)} (${pct(ratios[2])})</div>` +
    `<div style="margin-top:6px">PC1+PC2 = ${pct(ratios[0] + ratios[1])} — 이 두 축만 남겨도 정보의 ${pct(ratios[0] + ratios[1])}가 유지됩니다 (3D→2D 압축)</div>`;
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathPCA extends w.HTMLElement {
    private sx = 2.4;
    private sy = 1.2;
    private sz = 0.4;

    private refresh() {
      const { sx, sy, sz } = this;
      const { pts, mean, values, vectors, ratios } = pca(sx, sy, sz);

      const applied = this.shadowRoot?.querySelector('#math-pca-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: sx=${sx.toFixed(1)}, sy=${sy.toFixed(1)}, sz=${sz.toFixed(1)} → λ1=${values[0].toFixed(2)}, λ2=${values[1].toFixed(2)}, λ3=${values[2].toFixed(2)}`;

      const notes = this.shadowRoot?.querySelector('#math-pca-notes') as HTMLElement;
      if (notes) notes.innerHTML = notesHtml(values, ratios);

      (['sx', 'sy', 'sz'] as const).forEach(k => {
        const val = this.shadowRoot?.querySelector(`#pca-${k}-val`) as HTMLElement;
        if (val) val.textContent = this[k].toFixed(1);
      });

      pts.forEach((p, i) => {
        const el = this.shadowRoot?.querySelector(`#pca-pt-${i}`) as HTMLElement;
        if (!el) return;
        el.setAttribute('x', p[0].toFixed(2));
        el.setAttribute('y', p[1].toFixed(2));
        el.setAttribute('z', p[2].toFixed(2));
      });

      vectors.forEach((v, i) => {
        const len = 2 * Math.sqrt(Math.max(0, values[i]));
        const tip = [mean[0] + v[0] * len, mean[1] + v[1] * len, mean[2] + v[2] * len];
        const el = this.shadowRoot?.querySelector(`#pca-pc-${i}`) as HTMLElement;
        if (!el) return;
        el.setAttribute('x1', mean[0].toFixed(2));
        el.setAttribute('y1', mean[1].toFixed(2));
        el.setAttribute('z1', mean[2].toFixed(2));
        el.setAttribute('x2', tip[0].toFixed(2));
        el.setAttribute('y2', tip[1].toFixed(2));
        el.setAttribute('z2', tip[2].toFixed(2));
        el.setAttribute('label', `PC${i + 1} (${(ratios[i] * 100).toFixed(0)}%)`);
      });
    }

    @addEventListener('#pca-sx', 'input')
    onSxInput(e: Event) { this.sx = Number((e.target as HTMLInputElement).value) || 0.1; this.refresh(); }
    @addEventListener('#pca-sy', 'input')
    onSyInput(e: Event) { this.sy = Number((e.target as HTMLInputElement).value) || 0.1; this.refresh(); }
    @addEventListener('#pca-sz', 'input')
    onSzInput(e: Event) { this.sz = Number((e.target as HTMLInputElement).value) || 0.1; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { sx, sy, sz } = this;
      const { pts, mean, values, vectors, ratios } = pca(sx, sy, sz);
      const pointTags = pts.map((p, i) =>
        `<point3d id="pca-pt-${i}" x="${p[0].toFixed(2)}" y="${p[1].toFixed(2)}" z="${p[2].toFixed(2)}" color="#94a3b8" size="2.5"></point3d>`
      ).join('\n          ');
      const colors = ['#e5484d', '#3e63dd', '#10b981'];
      const pcTags = vectors.map((v, i) => {
        const len = 2 * Math.sqrt(Math.max(0, values[i]));
        const tip = [mean[0] + v[0] * len, mean[1] + v[1] * len, mean[2] + v[2] * len];
        return `<vector3d id="pca-pc-${i}" x1="${mean[0].toFixed(2)}" y1="${mean[1].toFixed(2)}" z1="${mean[2].toFixed(2)}" x2="${tip[0].toFixed(2)}" y2="${tip[1].toFixed(2)}" z2="${tip[2].toFixed(2)}" color="${colors[i]}" label="PC${i + 1} (${(ratios[i] * 100).toFixed(0)}%)"></vector3d>`;
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
        <div class="math-title">점구름(회색) → 공분산 행렬의 고유벡터 = 주성분(PC1·PC2·PC3)</div>
        <div class="math-formula">수식: Cov(X)v = λv (공분산 행렬의 고유값 분해)</div>
        <div class="math-applied" id="math-pca-applied">적용: sx=${sx.toFixed(1)}, sy=${sy.toFixed(1)}, sz=${sz.toFixed(1)} → λ1=${values[0].toFixed(2)}, λ2=${values[1].toFixed(2)}, λ3=${values[2].toFixed(2)}</div>
        <div class="math-desc">sx·sy·sz(점구름의 축별 퍼짐)를 바꾸면 빨강(PC1)·파랑(PC2)·초록(PC3) 화살표가 실제 퍼진 방향을 따라 다시 계산됩니다. 드래그로 돌려서 확인해 보세요.</div>
        <cartesian-chart-3d range="8" style="height:340px">
          ${pointTags}
          ${pcTags}
        </cartesian-chart-3d>
        <div class="math-legend"><span><b style="color:#94a3b8">● 데이터 점</b></span><span><b style="color:#e5484d">→ PC1(최대분산)</b></span><span><b style="color:#3e63dd">→ PC2</b></span><span><b style="color:#10b981">→ PC3(최소분산)</b></span></div>
        <div class="math-notes" id="math-pca-notes">${notesHtml(values, ratios)}</div>
        <div class="ctl"><label>sx <input id="pca-sx" type="range" min="0.2" max="3" step="0.1" value="${sx}"><b id="pca-sx-val">${sx.toFixed(1)}</b></label></div>
        <div class="ctl"><label>sy <input id="pca-sy" type="range" min="0.2" max="3" step="0.1" value="${sy}"><b id="pca-sy-val">${sy.toFixed(1)}</b></label></div>
        <div class="ctl"><label>sz <input id="pca-sz" type="range" min="0.2" max="3" step="0.1" value="${sz}"><b id="pca-sz-val">${sz.toFixed(1)}</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
