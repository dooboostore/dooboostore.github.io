import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-kabsch';

const MD = `
## Kabsch 알고리즘이란?
- 서로 대응되는 두 점 집합(P, Q)이 있을 때, **한쪽을 다른 쪽에 가장 잘 포개는 회전 R과 이동 t를 찾는** 알고리즘입니다.
- 로봇/드론이 센서로 측정한 점들(빨강, P)을 기준 모델(파랑, Q)에 맞춰 정렬하거나, 3D 스캔 정합, 단백질 구조 비교(RMSD) 등에 씁니다.
- 원리: 두 점집합을 각각 중심(centroid)으로 옮긴 뒤, 공분산 행렬 \`H = Pᵀ·Q\`를 만들고 **H를 SVD(특이값분해)** 해서 \`H = U·Σ·Vᵀ\`를 얻습니다. 최적 회전은 \`R = V·diag(1,1,d)·Uᵀ\` (d는 반사(거울상)를 방지하는 부호 보정).
- PCA가 "점구름 하나의 고유벡터(축)"를 찾는 거라면, Kabsch는 "두 점구름을 맞추는 회전"을 SVD로 찾는 것입니다 — 같은 선형대수 도구(고유값·특이값 분해)를 다르게 쓴 것뿐입니다.
- 슬라이더로 회전각(yaw·pitch·roll)을 바꾸면 빨강(측정된 점, 회전됨)이 움직이고, 초록(Kabsch로 정렬한 결과)이 항상 파랑(기준) 위에 다시 포개집니다. 노이즈를 넣으면 완벽히는 안 겹치지만, 오차가 최소인 최적 회전을 찾아냅니다.
- **어디에 쓰이나요?** — 로봇 팔·드론의 마커 기반 포즈 추정, LiDAR/3D 스캔 정합(ICP의 핵심 스텝), 단백질 구조 비교(RMSD), 카메라 캘리브레이션.
`;

// 기준 모형(Q): 중심점 + 팔 4개(길이 다름, 비대칭) — 회전이 눈에 잘 띄도록
const Q_RAW: [number, number, number][] = [
  [0, 0, 0],
  [3, 0, 0],
  [0, 2, 0],
  [0, 0, 2.5], // z축으로 솟은 팔
  [0.8, 0.8, 0],
];

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

function cross(a: number[], b: number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function norm3(a: number[]): number { return Math.hypot(a[0], a[1], a[2]); }

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

/** 야코비 고유값 손풀이 (대칭행렬 전용) — H^T H 를 대각화해 SVD를 얻는 데 쓴다. */
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

function colsToMat(cols: number[][]): Mat3 {
  return [[cols[0][0], cols[1][0], cols[2][0]], [cols[0][1], cols[1][1], cols[2][1]], [cols[0][2], cols[1][2], cols[2][2]]];
}

function mean(points: number[][]): [number, number, number] {
  const n = points.length;
  const m = [0, 0, 0];
  points.forEach(p => { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; });
  return [m[0] / n, m[1] / n, m[2] / n];
}

function sub(a: number[], b: number[]): [number, number, number] { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dist(a: number[], b: number[]): number { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

/** Kabsch 손풀이: P를 Q에 가장 잘 포개는 회전 R, 이동 t를 구한다. */
function kabsch(P: [number, number, number][], Q: [number, number, number][]) {
  const n = P.length;
  const meanP = mean(P), meanQ = mean(Q);
  const Pc = P.map(p => sub(p, meanP));
  const Qc = Q.map(p => sub(p, meanQ));
  const H: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let k = 0; k < n; k++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) H[i][j] += Pc[k][i] * Qc[k][j];

  const HTH = matMul(transpose(H), H);
  const { values, vectors } = jacobiEigen(HTH);
  const s = values.map(x => Math.sqrt(Math.max(0, x)));
  const [v0, v1] = vectors;
  const Hv0 = matVec(H, v0), Hv1 = matVec(H, v1);
  const u0 = s[0] > 1e-9 ? Hv0.map(x => x / s[0]) : [1, 0, 0];
  const u1raw = s[1] > 1e-9 ? Hv1.map(x => x / s[1]) : [0, 1, 0];
  const dot01 = u0[0] * u1raw[0] + u0[1] * u1raw[1] + u0[2] * u1raw[2];
  const u1o = [u1raw[0] - dot01 * u0[0], u1raw[1] - dot01 * u0[1], u1raw[2] - dot01 * u0[2]];
  const u1n = norm3(u1o) || 1;
  const u1 = u1o.map(x => x / u1n);
  const u2 = cross(u0, u1);

  const V = colsToMat(vectors);
  const U = colsToMat([u0, u1, u2]);
  const d = Math.sign(det3(U) * det3(V)) || 1;
  const D: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, d]];
  const R = matMul(matMul(V, D), transpose(U));

  const t = sub(meanQ, matVec(R, meanP));
  const aligned = P.map(p => { const rp = matVec(R, sub(p, meanP)); return [rp[0] + meanQ[0], rp[1] + meanQ[1], rp[2] + meanQ[2]] as [number, number, number]; });
  const rmsd = Math.sqrt(aligned.reduce((acc, a, i) => acc + dist(a, Q[i]) ** 2, 0) / n);
  return { R, t, aligned, rmsd, meanP, meanQ };
}

// ── 시드 고정 노이즈 (노이즈 슬라이더로는 이 값들을 스케일만 한다) ──
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
const gauss = makeGaussian(mulberry32(20260101));
const BASE_NOISE: [number, number, number][] = Q_RAW.map(() => [gauss(), gauss(), gauss()]);

const Q_MEAN = mean(Q_RAW);
const Q: [number, number, number][] = Q_RAW.map(p => sub(p, Q_MEAN));

function makeP(yaw: number, pitch: number, roll: number, noise: number): [number, number, number][] {
  const Rtrue = rotMat(yaw, pitch, roll);
  return Q.map((p, i) => {
    const rp = matVec(Rtrue, p);
    return [rp[0] + BASE_NOISE[i][0] * noise, rp[1] + BASE_NOISE[i][1] * noise, rp[2] + BASE_NOISE[i][2] * noise] as [number, number, number];
  });
}

function edgeTags(idPrefix: string, center: number[], arms: number[][], color: string, label?: string) {
  return arms.map((p, i) =>
    `<vector3d id="${idPrefix}-${i}" x1="${center[0].toFixed(2)}" y1="${center[1].toFixed(2)}" z1="${center[2].toFixed(2)}" x2="${p[0].toFixed(2)}" y2="${p[1].toFixed(2)}" z2="${p[2].toFixed(2)}" color="${color}"${label && i === 0 ? ` label="${label}"` : ''}></vector3d>`
  ).join('\n          ');
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathKabsch extends w.HTMLElement {
    private yaw = 50;
    private pitch = 30;
    private roll = 20;
    private noise = 0;

    private refresh() {
      const { yaw, pitch, roll, noise } = this;
      const P = makeP(yaw, pitch, roll, noise);
      const { aligned, rmsd, R } = kabsch(P, Q);

      const applied = this.shadowRoot?.querySelector('#math-kabsch-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: 회전(${yaw.toFixed(0)}°,${pitch.toFixed(0)}°,${roll.toFixed(0)}°) + 노이즈 ${noise.toFixed(2)} → RMSD = ${rmsd.toFixed(3)}`;

      const notes = this.shadowRoot?.querySelector('#math-kabsch-notes') as HTMLElement;
      if (notes) {
        notes.innerHTML = `<div>RMSD(정렬 후 오차) = ${rmsd.toFixed(4)}</div>` +
          `<div>det(R) = ${det3(R).toFixed(3)} (1이면 회전, -1이면 반사)</div>` +
          `<div style="margin-top:6px">${rmsd < 0.02 ? '노이즈가 없어 초록이 파랑에 정확히 포개집니다.' : '노이즈가 있어 완벽히는 안 겹치지만, 오차가 최소가 되는 최적 회전을 찾았습니다.'}</div>`;
      }

      (['yaw', 'pitch', 'roll'] as const).forEach(k => {
        const val = this.shadowRoot?.querySelector(`#kabsch-${k}-val`) as HTMLElement;
        if (val) val.textContent = `${this[k].toFixed(0)}°`;
      });
      const nVal = this.shadowRoot?.querySelector('#kabsch-noise-val') as HTMLElement;
      if (nVal) nVal.textContent = noise.toFixed(2);

      const setEdges = (idPrefix: string, center: number[], arms: number[][]) => {
        arms.forEach((p, i) => {
          const el = this.shadowRoot?.querySelector(`#${idPrefix}-${i}`) as HTMLElement;
          if (!el) return;
          el.setAttribute('x1', center[0].toFixed(2)); el.setAttribute('y1', center[1].toFixed(2)); el.setAttribute('z1', center[2].toFixed(2));
          el.setAttribute('x2', p[0].toFixed(2)); el.setAttribute('y2', p[1].toFixed(2)); el.setAttribute('z2', p[2].toFixed(2));
        });
      };
      setEdges('kabsch-p', P[0], P.slice(1));
      setEdges('kabsch-aligned', aligned[0], aligned.slice(1));
    }

    @addEventListener('#kabsch-yaw', 'input')
    onYawInput(e: Event) { this.yaw = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#kabsch-pitch', 'input')
    onPitchInput(e: Event) { this.pitch = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#kabsch-roll', 'input')
    onRollInput(e: Event) { this.roll = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#kabsch-noise', 'input')
    onNoiseInput(e: Event) { this.noise = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { yaw, pitch, roll, noise } = this;
      const P = makeP(yaw, pitch, roll, noise);
      const { aligned, rmsd, R } = kabsch(P, Q);
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
        <div class="math-title">파랑(기준) vs 빨강(회전된 측정값) → 초록(Kabsch로 정렬한 결과)</div>
        <div class="math-formula">수식: H = Pᵀ·Q, H = U·Σ·Vᵀ(SVD), R = V·diag(1,1,d)·Uᵀ</div>
        <div class="math-applied" id="math-kabsch-applied">적용: 회전(${yaw.toFixed(0)}°,${pitch.toFixed(0)}°,${roll.toFixed(0)}°) + 노이즈 ${noise.toFixed(2)} → RMSD = ${rmsd.toFixed(3)}</div>
        <div class="math-desc">yaw·pitch·roll로 빨강을 돌리면, Kabsch가 계산한 초록이 항상 파랑 위에 다시 포개집니다. 드래그로 돌려서 확인해 보세요.</div>
        <cartesian-chart-3d range="5" style="height:340px">
          ${edgeTags('kabsch-q', Q[0], Q.slice(1), '#3e63dd', 'Q(기준)')}
          ${edgeTags('kabsch-p', P[0], P.slice(1), '#e5484d', 'P(측정,회전됨)')}
          ${edgeTags('kabsch-aligned', aligned[0], aligned.slice(1), '#10b981', 'R·P(정렬결과)')}
        </cartesian-chart-3d>
        <div class="math-legend"><span><b style="color:#3e63dd">→ Q(기준)</b></span><span><b style="color:#e5484d">→ P(측정, 회전됨)</b></span><span><b style="color:#10b981">→ R·P(정렬 결과)</b></span></div>
        <div class="math-notes" id="math-kabsch-notes">
          <div>RMSD(정렬 후 오차) = ${rmsd.toFixed(4)}</div>
          <div>det(R) = ${det3(R).toFixed(3)} (1이면 회전, -1이면 반사)</div>
          <div style="margin-top:6px">${rmsd < 0.02 ? '노이즈가 없어 초록이 파랑에 정확히 포개집니다.' : '노이즈가 있어 완벽히는 안 겹치지만, 오차가 최소가 되는 최적 회전을 찾았습니다.'}</div>
        </div>
        <div class="ctl"><label>yaw <input id="kabsch-yaw" type="range" min="0" max="360" step="1" value="${yaw}"><b id="kabsch-yaw-val">${yaw.toFixed(0)}°</b></label></div>
        <div class="ctl"><label>pitch <input id="kabsch-pitch" type="range" min="0" max="360" step="1" value="${pitch}"><b id="kabsch-pitch-val">${pitch.toFixed(0)}°</b></label></div>
        <div class="ctl"><label>roll <input id="kabsch-roll" type="range" min="0" max="360" step="1" value="${roll}"><b id="kabsch-roll-val">${roll.toFixed(0)}°</b></label></div>
        <div class="ctl"><label>noise <input id="kabsch-noise" type="range" min="0" max="0.3" step="0.02" value="${noise}"><b id="kabsch-noise-val">${noise.toFixed(2)}</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
