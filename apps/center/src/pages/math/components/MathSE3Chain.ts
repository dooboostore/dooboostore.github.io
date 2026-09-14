import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-se3chain';

const MD = `
## 동차변환행렬(SE(3))과 좌표계 체인이란?
- 회전(3×3)과 이동(3×1 벡터)을 **하나의 4×4 행렬**로 합친 것입니다: \`T = [[R, t], [0 0 0, 1]]\`
- 점 p=(x,y,z)를 (x,y,z,**1**)로 한 칸 늘려서 T를 곱하면, 회전과 이동이 **한 번의 행렬곱**으로 동시에 적용됩니다. 4번째 성분 "1"이 바로 동차좌표(homogeneous coordinate)입니다.
- 로봇 팔은 관절(joint)마다 자기 국소(local) 좌표계를 갖고, 각 관절의 변환행렬을 **부모→자식 순서로 곱해서** 최종 손끝(end-effector) 위치를 구합니다: \`T_전체 = T1 · T2 · T3\`
- 이 페이지는 회전축이 다른 관절 3개(베이스 요·어깨 피치·팔꿈치 피치)를 체인으로 연결한 간단한 3관절 팔입니다. 각 관절 슬라이더를 움직이면 그 뒤에 달린 링크 전체가 함께 따라 움직입니다.
- 이미 만든 **"회전행렬"**과 **"병진(평행이동)"** 페이지가 바로 이 T 행렬의 왼쪽 3×3(회전)과 마지막 열(이동) 부분입니다 — 둘을 하나로 합친 것이 SE(3)(3차원 강체운동군)입니다.
- **어디에 쓰이나요?** — 로봇 팔의 순방향 기구학(forward kinematics), 카메라·센서 좌표계 변환, 게임 오브젝트의 부모-자식 Transform 계층 구조.
`;

type Mat4 = number[][];
type Vec3 = [number, number, number];

function mat4Mul(A: Mat4, B: Mat4): Mat4 {
  const C: Mat4 = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += A[i][k] * B[k][j]; C[i][j] = s; }
  return C;
}
function ident4(): Mat4 { return [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]; }
function rz4(deg: number): Mat4 { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]; }
function ry4(deg: number): Mat4 { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1]]; }
function trans4(x: number, y: number, z: number): Mat4 { return [[1, 0, 0, x], [0, 1, 0, y], [0, 0, 1, z], [0, 0, 0, 1]]; }
function pos(T: Mat4): Vec3 { return [T[0][3], T[1][3], T[2][3]]; }

const L1 = 1, L2 = 2, L3 = 1.5;

function chain(theta1: number, theta2: number, theta3: number) {
  const T0 = ident4();
  const T1 = mat4Mul(mat4Mul(T0, rz4(theta1)), trans4(0, 0, L1));
  const T2 = mat4Mul(mat4Mul(T1, ry4(theta2)), trans4(L2, 0, 0));
  const T3 = mat4Mul(mat4Mul(T2, ry4(theta3)), trans4(L3, 0, 0));
  return { T0, T1, T2, T3 };
}

function matrixGridHtml(T: Mat4) {
  let cells = '';
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const isTrans = j === 3 && i < 3;
      cells += `<div class="se3-cell" style="${isTrans ? 'background:#fef3c7;color:#92400e;' : ''}">${T[i][j].toFixed(2)}</div>`;
    }
  }
  return cells;
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathSE3Chain extends w.HTMLElement {
    private theta1 = 40;
    private theta2 = 30;
    private theta3 = -40;

    private refresh() {
      const { theta1, theta2, theta3 } = this;
      const { T0, T1, T2, T3 } = chain(theta1, theta2, theta3);
      const p0 = pos(T0), p1 = pos(T1), p2 = pos(T2), p3 = pos(T3);

      const applied = this.shadowRoot?.querySelector('#se3-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: θ1=${theta1.toFixed(0)}°, θ2=${theta2.toFixed(0)}°, θ3=${theta3.toFixed(0)}° → 손끝 위치 = (${p3[0].toFixed(2)}, ${p3[1].toFixed(2)}, ${p3[2].toFixed(2)})`;

      const grid = this.shadowRoot?.querySelector('#se3-grid') as HTMLElement;
      if (grid) grid.innerHTML = matrixGridHtml(T3);

      (['theta1', 'theta2', 'theta3'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#se3-${k}-val`) as HTMLElement;
        if (el) el.textContent = `${this[k].toFixed(0)}°`;
      });

      const setLink = (id: string, from: Vec3, to: Vec3) => {
        const el = this.shadowRoot?.querySelector(id) as HTMLElement;
        if (!el) return;
        el.setAttribute('x1', from[0].toFixed(3)); el.setAttribute('y1', from[1].toFixed(3)); el.setAttribute('z1', from[2].toFixed(3));
        el.setAttribute('x2', to[0].toFixed(3)); el.setAttribute('y2', to[1].toFixed(3)); el.setAttribute('z2', to[2].toFixed(3));
      };
      setLink('#se3-link1', p0, p1);
      setLink('#se3-link2', p1, p2);
      setLink('#se3-link3', p2, p3);
    }

    @addEventListener('#se3-theta1', 'input')
    onT1(e: Event) { this.theta1 = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#se3-theta2', 'input')
    onT2(e: Event) { this.theta2 = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#se3-theta3', 'input')
    onT3(e: Event) { this.theta3 = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { theta1, theta2, theta3 } = this;
      const { T0, T1, T2, T3 } = chain(theta1, theta2, theta3);
      const p0 = pos(T0), p1 = pos(T1), p2 = pos(T2), p3 = pos(T3);
      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; color:#6366f1; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:44px; text-align:right; color:#1e293b; }
          .se3-wrap { display:flex; gap:16px; flex-wrap:wrap; align-items:flex-start; margin-top:8px; }
          .se3-grid { display:grid; grid-template-columns:repeat(4,50px); gap:4px; }
          .se3-cell { background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 2px; text-align:center; font-family:ui-monospace,monospace; font-size:11.5px; font-weight:700; color:#1e293b; }
          .se3-legend { font-size:10.5px; color:#94a3b8; margin-top:4px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">T_전체 = T1·T2·T3 (관절마다 회전+이동을 합친 4×4 행렬)</div>
        <div class="math-applied" id="se3-applied">적용: θ1=${theta1.toFixed(0)}°, θ2=${theta2.toFixed(0)}°, θ3=${theta3.toFixed(0)}° → 손끝 위치 = (${p3[0].toFixed(2)}, ${p3[1].toFixed(2)}, ${p3[2].toFixed(2)})</div>
        <div class="math-desc">θ1(베이스 요)·θ2(어깨 피치)·θ3(팔꿈치 피치)를 바꾸면 그 뒤 링크 전체가 함께 따라 움직입니다. 오른쪽 노란 칸이 T3의 이동(translation) 부분 = 손끝 위치입니다.</div>
        <div class="se3-wrap">
          <cartesian-chart-3d range="4.5" style="height:280px; flex:1; min-width:220px">
            <vector3d id="se3-link1" x1="${p0[0]}" y1="${p0[1]}" z1="${p0[2]}" x2="${p1[0].toFixed(3)}" y2="${p1[1].toFixed(3)}" z2="${p1[2].toFixed(3)}" color="#94a3b8" label="joint1"></vector3d>
            <vector3d id="se3-link2" x1="${p1[0].toFixed(3)}" y1="${p1[1].toFixed(3)}" z1="${p1[2].toFixed(3)}" x2="${p2[0].toFixed(3)}" y2="${p2[1].toFixed(3)}" z2="${p2[2].toFixed(3)}" color="#f59e0b" label="joint2"></vector3d>
            <vector3d id="se3-link3" x1="${p2[0].toFixed(3)}" y1="${p2[1].toFixed(3)}" z1="${p2[2].toFixed(3)}" x2="${p3[0].toFixed(3)}" y2="${p3[1].toFixed(3)}" z2="${p3[2].toFixed(3)}" color="#ec4899" label="손끝"></vector3d>
          </cartesian-chart-3d>
          <div class="se3-grid" id="se3-grid">${matrixGridHtml(T3)}</div>
        </div>
        <div class="se3-legend">회색=link1(베이스→어깨), 주황=link2(어깨→팔꿈치), 분홍=link3(팔꿈치→손끝). 노란 칸=T3의 이동(위치) 성분.</div>
        <div class="ctl"><label>θ1 (베이스 요) <input id="se3-theta1" type="range" min="0" max="360" step="1" value="${theta1}"><b id="se3-theta1-val">${theta1.toFixed(0)}°</b></label></div>
        <div class="ctl"><label>θ2 (어깨 피치) <input id="se3-theta2" type="range" min="-90" max="90" step="1" value="${theta2}"><b id="se3-theta2-val">${theta2.toFixed(0)}°</b></label></div>
        <div class="ctl"><label>θ3 (팔꿈치 피치) <input id="se3-theta3" type="range" min="-150" max="150" step="1" value="${theta3}"><b id="se3-theta3-val">${theta3.toFixed(0)}°</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
