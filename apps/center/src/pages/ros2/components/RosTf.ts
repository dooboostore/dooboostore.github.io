import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { markdownParse } from '@center-src/utils/markdown';

const tagName = 'center-ros2-tf';

const SVG_W = 360, SVG_H = 220;
const S = 60; // px per meter
const OX = 40, OY = 170; // map 원점
// base_link → camera_link 고정 오프셋 (로봇 위 카메라)
const CAM_DX = 0.3, CAM_DY = 0.2;

const MD = `
## TF2 — "카메라가 본 점은 월드 어디?"
- 로봇의 모든 부위는 **프레임**입니다: map → odom → base_link → camera_link 체인.
- 각 화살표가 **위치+자세 변환** 하나. TF가 물어보면 체인을 거꾸로 타고 올라가 "A에서 본 점을 B 기준으로" 바꿔줍니다.
- **static**(고정: 카메라 장착 위치, 1회 발행·latch) vs **dynamic**(움직임: odom→base_link, 연속 발행) — 위 로봇을 움직여보세요. 카메라는 로봇에 붙어서 같이 갑니다.
- **왜 odom이 따로 있나 (REP-105)**: map→base를 하나로 이으면, 지도 보정(루프 클로저) 순간 로봇 pose가 뚝 끊깁니다. 그래서 끊김을 map→odom 하나에 가두고, odom→base는 항상 매끄럽게 유지합니다. 지역 주행·제어는 odom 기준, 전역 목표는 map 기준 — 아래 보정 버튼으로 끊김이 어디에 갇히는지 확인해보세요.
- 확인: \`ros2 run tf2_ros tf2_echo map camera_link\`, 전체 트리: \`ros2 run rqt_tf_tree rqt_tf_tree\`
\`\`\`mermaid
flowchart LR
    map -- "보정 (뚝뚝)" --> odom -- "매끄러움 (연속)" --> base_link -- "고정 (URDF)" --> camera_link
\`\`\`
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosTf extends w.HTMLElement {
    private rx = 1.5;
    private ryaw = 30;
    private corrected = false; // 루프 클로저 보정 on/off
    private static readonly DRIFT = 0.4; // odom 드리프트량 (m)

    private get mapOdom(): number {
      return this.corrected ? -RosTf.DRIFT : 0;
    }

    private refresh() {
      const t = (this.ryaw * Math.PI) / 180;
      const odomBase = this.rx; // odom→base: 항상 매끄러움 (드리프트 포함, 끊김 없음)
      const mapBase = this.rx + this.mapOdom; // map→base: 보정 순간 뚝 끊김
      const bx = OX + odomBase * S, by = OY;
      // 카메라 월드 좌표 = base 회전 * 오프셋 + base 위치
      const cx = this.rx + CAM_DX * Math.cos(t) - CAM_DY * Math.sin(t);
      const cy = 0 + CAM_DX * Math.sin(t) + CAM_DY * Math.cos(t);
      const px = OX + cx * S, py = OY - cy * S;
      const hx = bx + Math.cos(t) * 26, hy = by - Math.sin(t) * 26;

      const setAttr = (sel: string, attr: string, val: string) =>
        this.shadowRoot?.querySelector(sel)?.setAttribute(attr, val);
      setAttr('#rt-robot', 'transform', `translate(${bx.toFixed(1)},${by.toFixed(1)}) rotate(${(-this.ryaw).toFixed(1)})`);
      setAttr('#rt-heading', 'x1', String(bx.toFixed(1)));
      setAttr('#rt-heading', 'y1', String(by.toFixed(1)));
      setAttr('#rt-heading', 'x2', String(hx.toFixed(1)));
      setAttr('#rt-heading', 'y2', String(hy.toFixed(1)));
      setAttr('#rt-cam', 'cx', String(px.toFixed(1)));
      setAttr('#rt-cam', 'cy', String(py.toFixed(1)));
      setAttr('#rt-link', 'x1', String(bx.toFixed(1)));
      setAttr('#rt-link', 'y1', String(by.toFixed(1)));
      setAttr('#rt-link', 'x2', String(px.toFixed(1)));
      setAttr('#rt-link', 'y2', String(py.toFixed(1)));
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#rt-x-val', `${this.rx.toFixed(1)} m`);
      setText('#rt-yaw-val', `${this.ryaw}°`);
      setText('#rt-campose', `camera_link (map 기준): x=${cx.toFixed(2)}m, y=${cy.toFixed(2)}m`);
      // odom 분리 데모 수치
      setText('#rt-odom-base', `odom→base: ${odomBase.toFixed(2)}m (매끄러움, 그대로)`);
      setText('#rt-map-odom', `map→odom: ${this.mapOdom >= 0 ? '+' : ''}${this.mapOdom.toFixed(2)}m (보정이 여기 갇힘)`);
      setText('#rt-map-base', `map→base: ${mapBase.toFixed(2)}m ${this.corrected ? '(뚝! 0.4m 점프)' : '(보정 전)'}`);
      const fix = this.shadowRoot?.querySelector('#rt-fix') as HTMLButtonElement;
      if (fix) fix.textContent = this.corrected ? '↩ 보정 되돌리기' : '⚡ 루프 클로저 보정 발생시키기';
      // 보정 마커: map→odom 오프셋을 빨간 점선으로 표시
      const moX = OX + this.mapOdom * S;
      const mo = this.shadowRoot?.querySelector('#rt-mapodom') as SVGElement;
      if (mo) {
        mo.setAttribute('x1', String(OX));
        mo.setAttribute('x2', String(moX.toFixed(1)));
      }
      const moLbl = this.shadowRoot?.querySelector('#rt-mapodom-lbl') as SVGElement;
      if (moLbl) {
        moLbl.setAttribute('x', String(((OX + moX) / 2).toFixed(1)));
        (moLbl as unknown as HTMLElement).textContent =
          this.corrected ? `map→odom ${this.mapOdom.toFixed(1)}m` : '';
      }
    }

    @addEventListener('#rt-x', 'input')
    onX(e: Event) { this.rx = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#rt-yaw', 'input')
    onYaw(e: Event) { this.ryaw = Number((e.target as HTMLInputElement).value); this.refresh(); }

    @addEventListener('#rt-fix', 'click')
    onFix() { this.corrected = !this.corrected; this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); markdownParse(this.shadowRoot?.querySelector('#rt-md') as HTMLElement, MD); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .rt-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rt-intro b { color:#22314e; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:60px; text-align:right; color:#1e293b; }
          svg { display:block; width:100%; max-width:${SVG_W}px; margin:12px auto; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
          .rt-tree { text-align:center; font-size:12px; font-weight:700; color:#22314e; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px; margin-top:8px; }
          .rt-tree small { color:#64748b; font-weight:600; }
          .rt-pose { text-align:center; font-size:12.5px; font-weight:700; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 12px; margin-top:8px; font-family:monospace; }
          .rt-odom { display:flex; flex-direction:column; gap:4px; margin-top:10px; }
          .rt-odom-row { font-size:12px; font-weight:700; border-radius:8px; padding:8px 12px; }
          .rt-fix-btn { display:block; margin:10px auto 0; padding:7px 16px; border-radius:16px; border:1.5px solid #f59e0b; background:#fffbeb; color:#92400e; font-size:12px; font-weight:800; cursor:pointer; }
          .rt-fix-btn:hover { background:#fef3c7; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rt-intro">
          로봇을 움직이면 카메라도 같이 갑니다. <b>TF 체인</b>이 그 관계를 들고 있어서, "카메라가 본 점"을 map 기준으로 바꿀 수 있습니다.<br>
          그런데 <b>odom이 왜 따로 있나요?</b> 바퀴·IMU 적산(odom)은 매끄럽지만 서서히 틀어지고(드리프트), 지도 정합(map)은 정확하지만 가끔 뚝 끊깁니다(루프 클로저). 둘을 직결하면 제어기가 끊김을 그대로 맞습니다 — 그래서 <b>끊김은 map→odom 하나에 가두고, odom→base는 매끄럽게</b> 유지합니다(REP-105).
        </div>

        <div class="ctl"><label>로봇 x <input id="rt-x" type="range" min="0.5" max="4" step="0.1" value="${this.rx}"><b id="rt-x-val"></b></label></div>
        <div class="ctl"><label>로봇 yaw <input id="rt-yaw" type="range" min="-90" max="90" step="5" value="${this.ryaw}"><b id="rt-yaw-val"></b></label></div>

        <svg viewBox="0 0 ${SVG_W} ${SVG_H}">
          <line x1="10" y1="${OY}" x2="${SVG_W - 10}" y2="${OY}" stroke="#cbd5e1" stroke-width="1"/>
          <line x1="${OX}" y1="${OY}" x2="${OX}" y2="14" stroke="#cbd5e1" stroke-width="1"/>
          <text x="${OX - 4}" y="${OY + 16}" font-size="10" font-weight="700" fill="#64748b">map</text>
          <line id="rt-mapodom" x1="${OX}" y1="${OY - 34}" x2="${OX}" y2="${OY - 34}" stroke="#ef4444" stroke-width="2" stroke-dasharray="5,3"/>
          <text id="rt-mapodom-lbl" x="${OX}" y="${OY - 40}" font-size="9" font-weight="700" fill="#ef4444" text-anchor="middle"></text>
          <line id="rt-link" x1="0" y1="0" x2="0" y2="0" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4,3"/>
          <g id="rt-robot" transform="">
            <polygon points="0,-12 22,0 0,12 -6,0" fill="#f59e0b"/>
          </g>
          <line id="rt-heading" x1="0" y1="0" x2="0" y2="0" stroke="#f59e0b" stroke-width="1.5"/>
          <circle id="rt-cam" cx="0" cy="0" r="6" fill="#3b82c4" stroke="#1e40af" stroke-width="1.5"/>
        </svg>
        <div class="rt-tree">map → odom → base_link <small>(dynamic, 연속)</small> → camera_link <small>(static, 고정)</small></div>
        <div class="rt-pose" id="rt-campose"></div>

        <div class="rt-odom">
          <div class="rt-odom-row" id="rt-odom-base" style="background:#dcfce7;color:#166534"></div>
          <div class="rt-odom-row" id="rt-map-odom" style="background:#fee2e2;color:#991b1b"></div>
          <div class="rt-odom-row" id="rt-map-base" style="background:#f0f9ff;color:#0c4a6e"></div>
        </div>
        <button class="rt-fix-btn" id="rt-fix"></button>
        <div class="math-desc" style="margin-top:6px">버튼을 눌러보세요: 로봇(odom→base)은 그대로인데 map→base만 0.4m 점프합니다. 지역 제어는 odom을 보니 끊김을 모르고, 전역 목표는 map 기준이라 보정 혜택을 봅니다. 이게 odom을 따로 두는 이유입니다.</div>

        <div class="md" id="rt-md"></div>
      `;
    }
  }

  return tagName;
};
