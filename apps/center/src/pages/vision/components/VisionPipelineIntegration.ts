import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-pipeline-integration';

const MD = `
## 통합 비전 파이프라인 — 두 갈래, 하나의 목표
- **경로 A**(ArUco → solvePnP → PoseStamped): 정확한 6DOF 포즈 — "정답 소스"이자 정밀 작업용.
- **경로 B**(색 검출 → 거리 추정 → PointStamped): 마커 없는 자연 물체 — 18강의 모호성 해결책을 실제로 가동.
- **메시지 선택의 근거**: 마커는 자세까지 나오므로 \`PoseStamped\`(위치+자세), 색 물체는 자세를 정의하기 어려우므로 \`PointStamped\`(위치만) — **정직한 인터페이스가 좋은 인터페이스**입니다.
- 새로 만드는 것은 **연결부와 품질 게이트뿐** — 각 상자는 전부 이전 강의(16~21강)에서 만든 조각의 재사용입니다.
- **품질 게이트**: 재투영 오차가 문턱을 넘으면 발행하지 않습니다. "나쁜 데이터를 흘리지 않는 것"도 인터페이스의 일부입니다.
- **RViz2**: 픽셀(2D)이 포즈(3D)로 승격되는 순간을 \`camera_link\` 기준 3D 장면으로 확인합니다 — 품질 게이트가 막은 포즈는 RViz에도 올라오지 않습니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionPipelineIntegration extends w.HTMLElement {
    private reprojError = 1.2;
    private threshold = 2.0;

    private refresh() {
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#pi-err-val', `${this.reprojError.toFixed(1)}px`);

      const pass = this.reprojError <= this.threshold;
      const log = this.shadowRoot?.querySelector('#pi-log') as HTMLElement;
      if (log) {
        if (pass) {
          log.textContent = `✅ reproj=${this.reprojError.toFixed(1)}px ≤ ${this.threshold.toFixed(1)}px → pub.publish(PoseStamped)`;
          log.style.background = '#dcfce7'; log.style.color = '#166534'; log.style.borderColor = '#bbf7d0';
        } else {
          log.textContent = `🚫 reproj=${this.reprojError.toFixed(1)}px > ${this.threshold.toFixed(1)}px → "reproj ${this.reprojError.toFixed(1)}px — drop"`;
          log.style.background = '#fee2e2'; log.style.color = '#991b1b'; log.style.borderColor = '#fecaca';
        }
      }
      const gate = this.shadowRoot?.querySelector('#pi-gate-box') as HTMLElement;
      if (gate) gate.style.background = pass ? '#dcfce7' : '#fee2e2';

      const pathA = this.shadowRoot?.querySelector('#pi-patha-box') as HTMLElement;
      if (pathA) pathA.style.background = pass ? '#ea580c' : '#b91c1c';

      const rviz = this.shadowRoot?.querySelector('#pi-rviz') as HTMLElement;
      if (rviz) {
        const poseFill = pass ? '#7c3aed' : '#475569';
        const poseOpacity = pass ? 1 : 0.35;
        const poseLabel = pass ? 'object_pose' : 'DROP';
        rviz.innerHTML =
          `<rect x="0" y="0" width="200" height="120" rx="8" fill="#0f172a"/>` +
          // camera_link 원점 축
          `<circle cx="25" cy="95" r="2.5" fill="#fff"/>` +
          `<line x1="25" y1="95" x2="65" y2="95" stroke="#ef4444" stroke-width="2"/><circle cx="65" cy="95" r="2" fill="#ef4444"/>` +
          `<line x1="25" y1="95" x2="10" y2="62" stroke="#22c55e" stroke-width="2"/><circle cx="10" cy="62" r="2" fill="#22c55e"/>` +
          `<line x1="25" y1="95" x2="25" y2="55" stroke="#3b82f6" stroke-width="2"/><circle cx="25" cy="55" r="2" fill="#3b82f6"/>` +
          `<text x="25" y="110" font-size="8" fill="#94a3b8" text-anchor="middle">camera_link</text>` +
          // 경로 A: 마커 포즈(자세 포함 — 회전된 사각형)
          `<g transform="rotate(20 125 42)" opacity="${poseOpacity}"><rect x="111" y="28" width="28" height="28" fill="none" stroke="${poseFill}" stroke-width="2.5"/></g>` +
          `<text x="125" y="20" font-size="8" fill="${poseFill}" text-anchor="middle">${poseLabel}</text>` +
          // 경로 B: 색 물체 위치(위치만 — 원)
          `<circle cx="165" cy="80" r="11" fill="none" stroke="#dc2626" stroke-width="2.5"/>` +
          `<text x="165" y="100" font-size="8" fill="#dc2626" text-anchor="middle">object_point</text>`;
      }
    }

    @addEventListener('#pi-err', 'input')
    onErr(e: Event) { this.reprojError = Number((e.target as HTMLInputElement).value); this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .pi-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .pi-intro b { color:#0369a1; }
          .pi-diagram { display:flex; flex-direction:column; align-items:center; gap:8px; margin:14px 0; font-size:11px; }
          .pi-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:center; }
          .pi-box { padding:7px 12px; border-radius:8px; font-weight:700; color:#fff; }
          .pi-gray { background:#64748b; }
          .pi-teal { background:#0d9488; }
          .pi-orange { background:#ea580c; }
          .pi-red { background:#dc2626; }
          .pi-purple { background:#7c3aed; }
          .pi-blue { background:#2563eb; }
          .pi-arrow { color:#94a3b8; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:10px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:40px; text-align:right; color:#1e293b; }
          #pi-gate-box { text-align:center; padding:10px; border-radius:8px; margin-top:10px; font-size:11px; font-weight:700; transition:background .15s; }
          .pi-log { text-align:center; font-size:12px; font-weight:700; font-family:monospace; border-radius:8px; padding:8px 10px; margin-top:8px; border:1px solid; }
          .pi-rviz-box { text-align:center; margin-top:14px; }
          #pi-rviz-svg { width:200px; height:120px; border-radius:8px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="pi-intro">
          16~21강에서 만든 조각(색 검출기, 카메라 지문, 이미지 배관, PnP)을 이어 <b>"카메라가 물체를 보면 3D 포즈가 토픽으로 흘러나오는 시스템"</b>을 완성합니다. 픽셀(2D)이 포즈(3D)로 승격되는 순간입니다. 아래 슬라이더로 경로 A의 재투영 오차를 바꿔가며 <b>품질 게이트</b>가 나쁜 포즈를 걸러내는 걸 확인해보세요.
        </div>

        <div class="pi-diagram">
          <div class="pi-row"><div class="pi-box pi-gray">/image_raw + /camera_info</div></div>
          <div class="pi-arrow">↓</div>
          <div class="pi-row"><div class="pi-box pi-teal">왜곡 보정(20강)</div></div>
          <div class="pi-arrow">↓</div>
          <div class="pi-row">
            <div class="pi-box pi-orange" id="pi-patha-box">ArUco 검출 → solvePnP(18강)</div>
            <div class="pi-box pi-red">색 검출(19강) → 거리 추정</div>
          </div>
          <div class="pi-arrow">↓</div>
          <div class="pi-row">
            <div class="pi-box pi-purple">/object_pose (PoseStamped)</div>
            <div class="pi-box pi-blue">/object_point (PointStamped)</div>
          </div>
        </div>

        <div class="math-desc">경로 A(마커): 정밀 6DOF · 경로 B(색): 위치만 — 아래는 경로 A의 품질 게이트 시뮬레이션</div>

        <div class="ctl"><label>재투영 오차 <input id="pi-err" type="range" min="0" max="5" step="0.1" value="${this.reprojError}"><b id="pi-err-val">${this.reprojError.toFixed(1)}px</b></label></div>
        <div id="pi-gate-box">품질 게이트: 문턱 ${this.threshold.toFixed(1)}px</div>
        <div class="pi-log" id="pi-log"></div>

        <div class="pi-rviz-box">
          <svg id="pi-rviz-svg" viewBox="0 0 200 120"><g id="pi-rviz"></g></svg>
          <div class="math-desc">RViz2 — camera_link 기준 3D 장면(네모=마커 포즈, 원=색 물체 위치). 게이트가 막으면 포즈가 회색으로 사라집니다.</div>
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
