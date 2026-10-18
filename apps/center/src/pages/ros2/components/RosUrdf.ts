import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ros2-urdf';

const SVG_W = 320, SVG_H = 240;
const CX = 60, CY = 190, S = 70;
const L1 = 1.0, L2 = 0.8;

const URDF_SNIPPET = `&lt;robot name="arm">
  &lt;link name="base"/>
  &lt;joint name="j1" type="revolute">
    &lt;origin xyz="0 0 0.1" rpy="0 0 0"/>
    &lt;axis xyz="0 0 1"/>
    &lt;limit lower="-1.57" upper="1.57"/>
  &lt;/joint>
  &lt;link name="link1"/>
  &lt;joint name="j2" type="revolute">
    &lt;origin xyz="1.0 0 0" rpy="0 0 0"/>
    &lt;axis xyz="0 0 1"/>
  &lt;/joint>
  &lt;link name="link2"/>
&lt;/robot>`;

const MD = `
## URDF — 로봇의 설계도
- **link**(몸통: 크기·질량·겉모습) + **joint**(관절: 종류·축·범위)의 반복입니다. 위 2축 암이 최소 예시.
- joint 종류: **revolute**(회전+범위), **continuous**(무한 회전 바퀴), **prismatic**(직선 슬라이드), **fixed**(용접).
- URDF → TF(static/dynamic) → RViz/Gazebo/MoveIt가 같은 설계도를 읽습니다. 설계도 하나, 소비자 여럿.
- 확인: \`ros2 run robot_state_publisher robot_state_publisher --ros-args -p robot_description:="$(cat arm.urdf)"\`
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosUrdf extends w.HTMLElement {
    private th1 = 40;
    private th2 = -60;

    private refresh() {
      const a1 = (this.th1 * Math.PI) / 180;
      const a2 = (this.th2 * Math.PI) / 180;
      const ex = L1 * Math.cos(a1), ey = L1 * Math.sin(a1);
      const wx = ex + L2 * Math.cos(a1 + a2), wy = ey + L2 * Math.sin(a1 + a2);
      const px = (X: number) => CX + X * S, py = (Y: number) => CY - Y * S;

      const setAttr = (sel: string, attr: string, val: string) =>
        this.shadowRoot?.querySelector(sel)?.setAttribute(attr, val);
      setAttr('#ru-l1', 'x2', String(px(ex).toFixed(1)));
      setAttr('#ru-l1', 'y2', String(py(ey).toFixed(1)));
      setAttr('#ru-l2', 'x1', String(px(ex).toFixed(1)));
      setAttr('#ru-l2', 'y1', String(py(ey).toFixed(1)));
      setAttr('#ru-l2', 'x2', String(px(wx).toFixed(1)));
      setAttr('#ru-l2', 'y2', String(py(wy).toFixed(1)));
      setAttr('#ru-j1', 'cx', String(px(0).toFixed(1)));
      setAttr('#ru-j1', 'cy', String(py(0).toFixed(1)));
      setAttr('#ru-j2', 'cx', String(px(ex).toFixed(1)));
      setAttr('#ru-j2', 'cy', String(py(ey).toFixed(1)));
      setAttr('#ru-ee', 'cx', String(px(wx).toFixed(1)));
      setAttr('#ru-ee', 'cy', String(py(wy).toFixed(1)));
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#ru-t1-val', `${this.th1}°`);
      setText('#ru-t2-val', `${this.th2}°`);
      setText('#ru-ee-pos', `끝점: x=${wx.toFixed(2)}m, y=${wy.toFixed(2)}m`);
    }

    @addEventListener('#ru-t1', 'input')
    onT1(e: Event) { this.th1 = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#ru-t2', 'input')
    onT2(e: Event) { this.th2 = Number((e.target as HTMLInputElement).value); this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .ru-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .ru-intro b { color:#22314e; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:50px; text-align:right; color:#1e293b; }
          svg { display:block; width:100%; max-width:${SVG_W}px; margin:12px auto; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
          .ru-ee { text-align:center; font-size:12.5px; font-weight:700; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 12px; margin-top:8px; font-family:monospace; }
          pre.ru-urdf { background:#0f172a; color:#7dd3fc; font-size:10.5px; line-height:1.6; border-radius:8px; padding:12px; overflow-x:auto; font-family:monospace; margin-top:12px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="ru-intro">
          2축 암의 관절(joint)을 돌려보세요. <b>끝점 좌표가 바뀌는 게 순기구학(FK)</b> — MoveIt이 수천 번 푸는 그 계산입니다.
        </div>

        <div class="ctl"><label>j1 (어깨) <input id="ru-t1" type="range" min="-90" max="90" step="5" value="${this.th1}"><b id="ru-t1-val"></b></label></div>
        <div class="ctl"><label>j2 (팔꿈치) <input id="ru-t2" type="range" min="-120" max="120" step="5" value="${this.th2}"><b id="ru-t2-val"></b></label></div>

        <svg viewBox="0 0 ${SVG_W} ${SVG_H}">
          <line x1="10" y1="${CY}" x2="${SVG_W - 10}" y2="${CY}" stroke="#cbd5e1" stroke-width="2"/>
          <rect x="${CX - 14}" y="${CY - 8}" width="28" height="8" fill="#64748b"/>
          <line id="ru-l1" x1="${CX}" y1="${CY}" x2="0" y2="0" stroke="#f59e0b" stroke-width="8" stroke-linecap="round"/>
          <line id="ru-l2" x1="0" y1="0" x2="0" y2="0" stroke="#3b82c4" stroke-width="8" stroke-linecap="round"/>
          <circle id="ru-j1" cx="${CX}" cy="${CY}" r="6" fill="#1e293b"/>
          <circle id="ru-j2" cx="0" cy="0" r="6" fill="#1e293b"/>
          <circle id="ru-ee" cx="0" cy="0" r="5" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
        </svg>
        <div class="ru-ee" id="ru-ee-pos"></div>

        <pre class="ru-urdf">${URDF_SNIPPET}</pre>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
