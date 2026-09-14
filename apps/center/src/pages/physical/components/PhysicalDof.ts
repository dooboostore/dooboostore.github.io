import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-physical-dof';

const L1 = 1, L2 = 1, L3 = 1;
const TARGET: [number, number] = [1.2, 0.8];
const THETA1_MIN = -70, THETA1_MAX = 140; // 검증된 실현 가능 범위(-74.5~142도) 안쪽으로 여유를 둠

const MD = `
## 자유도(Degrees of Freedom, DOF)와 여분 자유도(redundancy)
- **자유도**는 "독립적으로 움직일 수 있는 방향의 개수"입니다. 회전관절(revolute joint) 하나 = 자유도 1개. 3개의 관절을 가진 평면 팔은 자유도 3개입니다.
- 반면 **목표(작업공간, task space)**는 이 팔이 실제로 맞추고 싶은 것 — 여기서는 "평면 위의 한 점(x,y)"이라 **차원이 2**입니다.
- **자유도(3) > 작업공간 차원(2)** 이면, 목표를 만족하는 관절 각도 조합이 **딱 하나가 아니라 무한히 많습니다.** 남는 자유도(3-2=1개)를 "여분 자유도(redundant DOF)"라고 부릅니다.
- 아래에서 "끝점 목표"는 항상 고정한 채, **"여분 관절각(팔꿈치 자세)"** 슬라이더만 움직여 보세요 — **끝점(초록 점)은 정확히 같은 자리에 그대로 있는데 팔의 모양(팔꿈치 위치)만 바뀝니다.** 이게 여분 자유도가 만드는 "제자리 움직임(self-motion)"입니다.
- 2관절(2DOF) 팔이었다면 이런 여유가 없어서 목표점 하나에 팔 모양이 (거의) 딱 하나로 정해졌을 것입니다 — **"SE(3) 좌표계 체인"·"자코비안·특이점"** 페이지의 팔이 그 경우입니다.
- **어디에 쓰이나요?** — 사람 팔도 손 위치를 고정한 채 팔꿈치를 움직일 수 있는 여분 자유도 팔입니다. 로봇 팔에 여분 자유도를 일부러 추가하면, 끝점은 고정한 채 팔꿈치를 돌려서 **장애물을 피하거나 특이점(singularity)을 회피**할 수 있습니다.
`;

function ik2(dx: number, dy: number, a: number, b: number) {
  const r2 = dx * dx + dy * dy;
  let c = (r2 - a * a - b * b) / (2 * a * b);
  const feasible = c >= -1 && c <= 1;
  c = Math.max(-1, Math.min(1, c));
  const phi = Math.acos(c);
  const thetaB = Math.atan2(dy, dx) - Math.atan2(b * Math.sin(phi), a + b * Math.cos(phi));
  const thetaC = thetaB + phi;
  return { thetaB, thetaC, feasible };
}

/** theta1(여분 관절각, deg)이 주어졌을 때 끝점이 정확히 TARGET에 오도록 나머지 두 관절을 풀어 전체 팔 자세를 계산 */
function solveArm(theta1Deg: number) {
  const theta1 = (theta1Deg * Math.PI) / 180;
  const p0: [number, number] = [0, 0];
  const p1: [number, number] = [L1 * Math.cos(theta1), L1 * Math.sin(theta1)];
  const dx = TARGET[0] - p1[0], dy = TARGET[1] - p1[1];
  const { thetaB, thetaC, feasible } = ik2(dx, dy, L2, L3);
  const p2: [number, number] = [p1[0] + L2 * Math.cos(thetaB), p1[1] + L2 * Math.sin(thetaB)];
  const p3: [number, number] = [p2[0] + L3 * Math.cos(thetaC), p2[1] + L3 * Math.sin(thetaC)];
  const err = Math.hypot(p3[0] - TARGET[0], p3[1] - TARGET[1]);
  return { p0, p1, p2, p3, feasible, err };
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class PhysicalDof extends w.HTMLElement {
    private theta1 = 30;

    private refresh() {
      const { theta1 } = this;
      const { p0, p1, p2, p3, feasible, err } = solveArm(theta1);

      const applied = this.shadowRoot?.querySelector('#dof-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: 여분 관절각=${theta1.toFixed(0)}° → 끝점=(${p3[0].toFixed(3)}, ${p3[1].toFixed(3)}), 목표와 오차=${err.toExponential(1)} (사실상 0)`;

      const t1Val = this.shadowRoot?.querySelector('#dof-theta1-val') as HTMLElement;
      if (t1Val) t1Val.textContent = `${theta1.toFixed(0)}°`;

      const link1 = this.shadowRoot?.querySelector('#dof-link1') as HTMLElement;
      if (link1) { link1.setAttribute('x1', String(p0[0])); link1.setAttribute('y1', String(p0[1])); link1.setAttribute('x2', p1[0].toFixed(4)); link1.setAttribute('y2', p1[1].toFixed(4)); }
      const link2 = this.shadowRoot?.querySelector('#dof-link2') as HTMLElement;
      if (link2) { link2.setAttribute('x1', p1[0].toFixed(4)); link2.setAttribute('y1', p1[1].toFixed(4)); link2.setAttribute('x2', p2[0].toFixed(4)); link2.setAttribute('y2', p2[1].toFixed(4)); }
      const link3 = this.shadowRoot?.querySelector('#dof-link3') as HTMLElement;
      if (link3) { link3.setAttribute('x1', p2[0].toFixed(4)); link3.setAttribute('y1', p2[1].toFixed(4)); link3.setAttribute('x2', p3[0].toFixed(4)); link3.setAttribute('y2', p3[1].toFixed(4)); }

      const j1 = this.shadowRoot?.querySelector('#dof-j1') as HTMLElement;
      if (j1) { j1.setAttribute('x', p1[0].toFixed(4)); j1.setAttribute('y', p1[1].toFixed(4)); }
      const j2 = this.shadowRoot?.querySelector('#dof-j2') as HTMLElement;
      if (j2) { j2.setAttribute('x', p2[0].toFixed(4)); j2.setAttribute('y', p2[1].toFixed(4)); }

      const notes = this.shadowRoot?.querySelector('#dof-notes') as HTMLElement;
      if (notes) notes.innerHTML = feasible
        ? `<div>끝점(초록)은 (${TARGET[0]}, ${TARGET[1]})에 고정된 채 그대로입니다 — 여분 관절각만 바뀌어 팔꿈치 모양(파란 관절 2개)이 움직입니다.</div>`
        : `<div style="color:#ef4444">이 각도에서는 나머지 두 관절로 목표에 닿을 수 없습니다(도달 범위 밖) — 슬라이더 범위를 실현 가능한 구간으로 제한해 두었습니다.</div>`;
    }

    @addEventListener('#dof-theta1', 'input')
    onTheta1(e: Event) { this.theta1 = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { theta1 } = this;
      const { p0, p1, p2, p3, err } = solveArm(theta1);
      const reach = L1 + L2 + L3;
      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; color:#0f766e; margin-bottom:8px; }
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
        <div class="math-formula">3관절 평면 팔(3DOF) — 목표(2D 위치, 2제약)보다 자유도가 하나 많음(여분 자유도 1)</div>
        <div class="math-applied" id="dof-applied">적용: 여분 관절각=${theta1.toFixed(0)}° → 끝점=(${p3[0].toFixed(3)}, ${p3[1].toFixed(3)}), 목표와 오차=${err.toExponential(1)} (사실상 0)</div>
        <div class="math-desc">끝점(초록 목표점)은 항상 (${TARGET[0]}, ${TARGET[1]})에 고정됩니다. 슬라이더는 "이 목표를 유지한 채" 팔꿈치 모양만 바꿉니다.</div>
        <cartesian-chart x-min="-2.2" x-max="2.2" y-min="-2.2" y-max="2.2" x-label="x" y-label="y" style="height:280px">
          <circle x="0" y="0" r="${reach}" color="#e2e8f0" dash="4,4"></circle>
          <vector id="dof-link1" x1="${p0[0]}" y1="${p0[1]}" x2="${p1[0].toFixed(4)}" y2="${p1[1].toFixed(4)}" color="#0f766e" width="4"></vector>
          <vector id="dof-link2" x1="${p1[0].toFixed(4)}" y1="${p1[1].toFixed(4)}" x2="${p2[0].toFixed(4)}" y2="${p2[1].toFixed(4)}" color="#14b8a6" width="4"></vector>
          <vector id="dof-link3" x1="${p2[0].toFixed(4)}" y1="${p2[1].toFixed(4)}" x2="${p3[0].toFixed(4)}" y2="${p3[1].toFixed(4)}" color="#5eead4" width="4"></vector>
          <marker x="${p0[0]}" y="${p0[1]}" color="#1e293b" size="6" label="베이스"></marker>
          <marker id="dof-j1" x="${p1[0].toFixed(4)}" y="${p1[1].toFixed(4)}" color="#0284c7" size="6" label="관절1"></marker>
          <marker id="dof-j2" x="${p2[0].toFixed(4)}" y="${p2[1].toFixed(4)}" color="#0284c7" size="6" label="관절2(팔꿈치)"></marker>
          <marker x="${TARGET[0]}" y="${TARGET[1]}" color="#16a34a" size="8" label="목표(끝점 고정)"></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#0284c7">● 관절(파랑, 움직임)</b></span><span><b style="color:#16a34a">● 끝점 목표(초록, 고정)</b></span><span><b style="color:#e2e8f0">- - 최대 도달 반경</b></span></div>
        <div class="math-notes" id="dof-notes">
          <div>끝점(초록)은 (${TARGET[0]}, ${TARGET[1]})에 고정된 채 그대로입니다 — 여분 관절각만 바뀌어 팔꿈치 모양(파란 관절 2개)이 움직입니다.</div>
        </div>
        <div class="ctl"><label>여분 관절각(팔꿈치 자세) <input id="dof-theta1" type="range" min="${THETA1_MIN}" max="${THETA1_MAX}" step="1" value="${theta1}"><b id="dof-theta1-val">${theta1.toFixed(0)}°</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
