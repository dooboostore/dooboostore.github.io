import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-rotmatrix';

const MD = `
## 회전행렬(rotation matrix)이란?
- 3D 회전을 나타내는 **3×3 숫자표**입니다. 벡터 v에 곱하면(\`v' = Rv\`) 방향은 바뀌지만 길이는 그대로 유지됩니다.
- **각 열은 "원래 x축·y축·z축이 회전 후 어디를 가리키는지"**를 나타냅니다 — 1열 = 몸체 x축이 가는 곳(주황 화살표), 2열 = y축(보라), 3열 = z축(분홍). 그래서 열 색과 화살표 색을 맞춰 놨습니다.
- 축별 행렬을 곱해서 만듭니다: \`R = Rz(roll)·Rx(pitch)·Ry(yaw)\`
- **진짜 회전행렬이 되려면 조건이 두 개**입니다:
  1. \`RᵀR = I\` — 열들이 서로 직각이고 길이가 1 (정규직교)
  2. \`det(R) = +1\` — 방향이 보존됨(뒤집히지 않음)
- 정규직교 조건만 만족하고 det(R) = **-1**이면, 그건 회전이 아니라 **반사(거울상)**입니다. 아래 "반사로 만들기" 체크박스로 직접 확인해 보세요 — 직교성 오차는 여전히 0인데 det만 -1로 바뀌고, 몸체 축 하나가 뒤집힙니다.
- 이 R이 바로 **"오일러·쿼터니언·Gram-Schmidt 비교"** 페이지의 오일러 패널이 계산하는 행렬이고, **"rank(상자)"** 페이지의 상자 부피는 이것과 같은 개념(3×3 행렬식)입니다.
- **어디에 쓰이나요?** — 3D 그래픽·게임 오브젝트 회전, 로봇 팔 관절 자세, 카메라 자세(extrinsic) 표현, 좌표계 변환.
`;

type Mat3 = number[][];
type Vec3 = [number, number, number];

function matMul(A: Mat3, B: Mat3): Mat3 {
  const C: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += A[i][k] * B[k][j]; C[i][j] = s; }
  return C;
}
function matVec(A: Mat3, v: number[]): Vec3 {
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
function frobOrthoError(R: Mat3): number {
  const RtR = matMul(transpose(R), R);
  let s = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += (RtR[i][j] - (i === j ? 1 : 0)) ** 2;
  return Math.sqrt(s);
}

function rotX(deg: number): Mat3 { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
function rotY(deg: number): Mat3 { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
function rotZ(deg: number): Mat3 { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; }
function rotMat(yawDeg: number, pitchDeg: number, rollDeg: number): Mat3 {
  return matMul(rotZ(rollDeg), matMul(rotX(pitchDeg), rotY(yawDeg)));
}

const COLS = [
  { color: '#f59e0b', name: 'x' },
  { color: '#8b5cf6', name: 'y' },
  { color: '#ec4899', name: 'z' },
];

function matrixGridHtml(R: Mat3) {
  let cells = '';
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      cells += `<div class="rm-cell" style="border-top:3px solid ${COLS[j].color}">${R[i][j].toFixed(2)}</div>`;
    }
  }
  return cells;
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathRotationMatrix extends w.HTMLElement {
    private yaw = 35;
    private pitch = 25;
    private roll = 15;
    private reflect = false;

    private currentR(): Mat3 {
      const R = rotMat(this.yaw, this.pitch, this.roll);
      if (this.reflect) return R.map((row, i) => row.map((v, j) => (j === 2 ? -v : v)));
      return R;
    }

    private refresh() {
      const R = this.currentR();
      const dt = det3(R);
      const orthoErr = frobOrthoError(R);
      const dtColor = Math.abs(dt - 1) < 1e-6 ? '#10b981' : '#ef4444';

      const applied = this.shadowRoot?.querySelector('#rm-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: yaw=${this.yaw.toFixed(0)}°, pitch=${this.pitch.toFixed(0)}°, roll=${this.roll.toFixed(0)}°${this.reflect ? ' + 반사(z열 반전)' : ''} → det(R)=${dt.toFixed(3)}`;

      const grid = this.shadowRoot?.querySelector('#rm-grid') as HTMLElement;
      if (grid) grid.innerHTML = matrixGridHtml(R);

      const notes = this.shadowRoot?.querySelector('#rm-notes') as HTMLElement;
      if (notes) {
        notes.innerHTML = `<div>직교성 오차 ‖RᵀR-I‖ = ${orthoErr.toExponential(2)} (0에 가까우면 정규직교)</div>` +
          `<div style="color:${dtColor};font-weight:800">det(R) = ${dt.toFixed(3)} ${dt > 0 ? '→ 회전(방향 유지)' : '→ 반사(방향 뒤집힘, 회전 아님)'}</div>`;
      }

      (['yaw', 'pitch', 'roll'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#rm-${k}-val`) as HTMLElement;
        if (el) el.textContent = `${this[k].toFixed(0)}°`;
      });

      COLS.forEach((c, j) => {
        const tip: Vec3 = [R[0][j] * 1.6, R[1][j] * 1.6, R[2][j] * 1.6];
        const el = this.shadowRoot?.querySelector(`#rm-axis-${c.name}`) as HTMLElement;
        if (!el) return;
        el.setAttribute('x2', tip[0].toFixed(3)); el.setAttribute('y2', tip[1].toFixed(3)); el.setAttribute('z2', tip[2].toFixed(3));
      });
    }

    @addEventListener('#rm-yaw', 'input')
    onYaw(e: Event) { this.yaw = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#rm-pitch', 'input')
    onPitch(e: Event) { this.pitch = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#rm-roll', 'input')
    onRoll(e: Event) { this.roll = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#rm-reflect', 'change')
    onReflect(e: Event) { this.reflect = (e.target as HTMLInputElement).checked; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { yaw, pitch, roll, reflect } = this;
      const R = this.currentR();
      const dt = det3(R);
      const orthoErr = frobOrthoError(R);
      const dtColor = Math.abs(dt - 1) < 1e-6 ? '#10b981' : '#ef4444';
      const axisTags = COLS.map((c, j) => {
        const tip: Vec3 = [R[0][j] * 1.6, R[1][j] * 1.6, R[2][j] * 1.6];
        return `<vector3d id="rm-axis-${c.name}" x1="0" y1="0" z1="0" x2="${tip[0].toFixed(3)}" y2="${tip[1].toFixed(3)}" z2="${tip[2].toFixed(3)}" color="${c.color}" label="${c.name}"></vector3d>`;
      }).join('\n          ');
      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; color:#6366f1; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .math-notes { font-size:12px; font-weight:700; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin-top:8px; line-height:1.7; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:44px; text-align:right; color:#1e293b; }
          .ctl-check { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:10px; cursor:pointer; }
          .rm-wrap { display:flex; gap:16px; flex-wrap:wrap; align-items:flex-start; margin-top:8px; }
          .rm-grid { display:grid; grid-template-columns:repeat(3,56px); gap:4px; }
          .rm-cell { background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 4px; text-align:center; font-family:ui-monospace,monospace; font-size:13px; font-weight:700; color:#1e293b; }
          .rm-legend { font-size:10.5px; color:#94a3b8; margin-top:4px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">R = Rz(roll)·Rx(pitch)·Ry(yaw) — 열 색 = 몸체 축 화살표 색</div>
        <div class="math-applied" id="rm-applied">적용: yaw=${yaw.toFixed(0)}°, pitch=${pitch.toFixed(0)}°, roll=${roll.toFixed(0)}°${reflect ? ' + 반사(z열 반전)' : ''} → det(R)=${dt.toFixed(3)}</div>
        <div class="math-desc">슬라이더를 움직이면 오른쪽 9개 숫자(행렬)와 왼쪽 화살표(몸체 축)가 함께 바뀝니다. 1열=주황(x), 2열=보라(y), 3열=분홍(z).</div>
        <div class="rm-wrap">
          <cartesian-chart-3d range="2" style="height:260px; flex:1; min-width:220px">
            ${axisTags}
          </cartesian-chart-3d>
          <div class="rm-grid" id="rm-grid">${matrixGridHtml(R)}</div>
        </div>
        <div class="rm-legend">화살표: <b style="color:#f59e0b">■</b> x(1열) <b style="color:#8b5cf6">■</b> y(2열) <b style="color:#ec4899">■</b> z(3열) — 그래프의 빨강·초록·파랑은 월드 좌표계</div>
        <div class="math-notes" id="rm-notes">
          <div>직교성 오차 ‖RᵀR-I‖ = ${orthoErr.toExponential(2)} (0에 가까우면 정규직교)</div>
          <div style="color:${dtColor};font-weight:800">det(R) = ${dt.toFixed(3)} ${dt > 0 ? '→ 회전(방향 유지)' : '→ 반사(방향 뒤집힘, 회전 아님)'}</div>
        </div>
        <div class="ctl"><label>yaw <input id="rm-yaw" type="range" min="0" max="360" step="1" value="${yaw}"><b id="rm-yaw-val">${yaw.toFixed(0)}°</b></label></div>
        <div class="ctl"><label>pitch <input id="rm-pitch" type="range" min="-90" max="90" step="1" value="${pitch}"><b id="rm-pitch-val">${pitch.toFixed(0)}°</b></label></div>
        <div class="ctl"><label>roll <input id="rm-roll" type="range" min="0" max="360" step="1" value="${roll}"><b id="rm-roll-val">${roll.toFixed(0)}°</b></label></div>
        <label class="ctl-check"><input id="rm-reflect" type="checkbox" ${reflect ? 'checked' : ''}> 반사로 만들기 (z열 부호 반전 → det=-1, 회전 아님이 됨)</label>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
