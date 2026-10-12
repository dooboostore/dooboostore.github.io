import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { markdownParse } from '@center-src/utils/markdown';

const tagName = 'center-ros2-comm';

type Scenario = 'stream' | 'once' | 'long';

const VERDICT: Record<Scenario, string> = {
  stream: '→ 토픽 (Topic). 10Hz 센서 스트림은 발행-구독. 받는 쪽이 없어도 발행자는 계속 쏩니다. 예: ros2 topic echo /scan',
  once: '→ 서비스 (Service). 한 번 요청-한 번 응답. 서버가 없으면 요청이 실패합니다. 예: ros2 service call /spawn turtlesim/srv/Spawn "{x: 5.0, y: 5.0}"',
  long: '→ 액션 (Action). goal 수락 → 진행중 feedback → 최종 result + 중간 취소 가능. 내비게이션 정석. 예: ros2 action send_goal /navigate_to_pose nav2_msgs/action/NavigateToPose ...',
};

const MD = `
## 셋의 차이 — 한 줄 정리
- **토픽**: 1:N 방송, 받는 쪽 없어도 발행. 센서 스트림·상태 공유용. (ros.org 표현: anonymous publish/subscribe)
- **서비스**: 1:1 요청-응답, 동기. 설정 변경·단발 계산용. 서버 없으면 실패.
- **액션**: 1:1 + 시간 걸리는 일 + 중간보고(feedback) + 취소. 내비게이션·매니퓰레이션용.
- 헷갈리면 위 시나리오 버튼: "계속 흘러야 하나 / 한 번이면 되나 / 오래 걸리고 중간보고가 필요한가"가 판단 기준입니다.
${'```'}mermaid
flowchart LR
    Q{계속 흘러야 하나?} -- 예 --> T[토픽]
    Q -- 한 번이면 --> S[서비스]
    Q -- 오래 + 중간보고 --> A[액션]
${'```'}
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosComm extends w.HTMLElement {
    private scenario: Scenario = 'stream';

    private refresh() {
      const v = this.shadowRoot?.querySelector('#rc-verdict') as HTMLElement;
      if (v) v.textContent = VERDICT[this.scenario];
      this.shadowRoot?.querySelectorAll('.rc-sc').forEach(el =>
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.sc === this.scenario));
    }

    @addEventListener('.rc-sc', 'click', { delegate: true })
    onSc(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rc-sc') as HTMLElement;
      if (!btn) return;
      this.scenario = btn.dataset.sc as Scenario;
      this.refresh();
    }

    @onConnectedAfter
    onReady() { this.refresh(); markdownParse(this.shadowRoot?.querySelector('#rc-md') as HTMLElement, MD); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .rc-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rc-intro b { color:#22314e; }
          .rc-grid { display:flex; flex-direction:column; gap:10px; margin-top:10px; }
          .rc-card { border:1.5px solid #e2e8f0; border-radius:10px; padding:10px 12px; }
          .rc-card h4 { margin:0 0 6px; font-size:13px; }
          svg { display:block; width:100%; max-width:380px; margin:6px auto; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
          .rc-cli { font-size:11px; color:#64748b; font-family:monospace; margin-top:4px; }
          .rc-scs { display:flex; gap:6px; justify-content:center; margin-top:14px; flex-wrap:wrap; }
          .rc-sc { padding:6px 12px; border-radius:16px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#22314e; font-size:12px; font-weight:700; cursor:pointer; }
          .rc-sc.active { background:linear-gradient(135deg,#22314e,#7dd3fc); color:#fff; border-color:transparent; }
          .rc-verdict { font-size:12.5px; font-weight:700; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 12px; margin-top:8px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rc-intro">
          ROS 2 통신은 셋. 점들이 실제로 흐릅니다 — <b>주황=요청·목표(→), 초록=응답·결과(←), 파랑=지속 스트림·피드백</b>.
        </div>

        <div class="rc-grid">
          <div class="rc-card">
            <h4>📻 토픽 — 1:N 방송 (지속 스트림)</h4>
            <svg viewBox="0 0 380 70">
              <rect x="8" y="18" width="86" height="34" rx="8" fill="#dbeafe"/><text x="51" y="39" font-size="11" font-weight="700" fill="#1e40af" text-anchor="middle">talker</text>
              <rect x="286" y="6" width="86" height="26" rx="8" fill="#dcfce7"/><text x="329" y="23" font-size="10" font-weight="700" fill="#166534" text-anchor="middle">listener A</text>
              <rect x="286" y="38" width="86" height="26" rx="8" fill="#dcfce7"/><text x="329" y="55" font-size="10" font-weight="700" fill="#166534" text-anchor="middle">listener B</text>
              <line x1="94" y1="35" x2="286" y2="19" stroke="#3b82c4" stroke-width="2"/>
              <line x1="94" y1="35" x2="286" y2="51" stroke="#3b82c4" stroke-width="2"/>
              <circle r="4" fill="#3b82c4"><animateMotion dur="1.6s" repeatCount="indefinite" path="M94,35 L286,19"/></circle>
              <circle r="4" fill="#3b82c4"><animateMotion dur="1.6s" begin="0.8s" repeatCount="indefinite" path="M94,35 L286,51"/></circle>
            </svg>
            <div class="rc-cli">ros2 topic list · ros2 topic echo /chatter · ros2 topic hz /scan</div>
          </div>
          <div class="rc-card">
            <h4>📞 서비스 — 1:1 요청·응답 (단발)</h4>
            <svg viewBox="0 0 380 70">
              <rect x="8" y="18" width="86" height="34" rx="8" fill="#fef3c7"/><text x="51" y="39" font-size="11" font-weight="700" fill="#92400e" text-anchor="middle">client</text>
              <rect x="286" y="18" width="86" height="34" rx="8" fill="#fef3c7"/><text x="329" y="39" font-size="11" font-weight="700" fill="#92400e" text-anchor="middle">server</text>
              <line x1="94" y1="28" x2="286" y2="28" stroke="#f59e0b" stroke-width="2"/>
              <line x1="286" y1="44" x2="94" y2="44" stroke="#22c55e" stroke-width="2" stroke-dasharray="5,3"/>
              <circle r="4" fill="#f59e0b"><animateMotion dur="2s" repeatCount="indefinite" path="M94,28 L286,28"/></circle>
              <circle r="4" fill="#22c55e"><animateMotion dur="2s" begin="1s" repeatCount="indefinite" path="M286,44 L94,44"/></circle>
            </svg>
            <div class="rc-cli">ros2 service list · ros2 service call /spawn turtlesim/srv/Spawn ...</div>
          </div>
          <div class="rc-card">
            <h4>🧭 액션 — 목표·피드백·결과 (장시간)</h4>
            <svg viewBox="0 0 380 86">
              <rect x="8" y="26" width="86" height="34" rx="8" fill="#ede9fe"/><text x="51" y="47" font-size="11" font-weight="700" fill="#5b21b6" text-anchor="middle">client</text>
              <rect x="286" y="26" width="86" height="34" rx="8" fill="#ede9fe"/><text x="329" y="47" font-size="11" font-weight="700" fill="#5b21b6" text-anchor="middle">server</text>
              <line x1="94" y1="32" x2="286" y2="32" stroke="#f59e0b" stroke-width="2"/>
              <line x1="286" y1="44" x2="94" y2="44" stroke="#3b82c4" stroke-width="2" stroke-dasharray="4,3"/>
              <line x1="94" y1="56" x2="286" y2="56" stroke="#22c55e" stroke-width="2" stroke-dasharray="7,3"/>
              <circle r="4" fill="#f59e0b"><animateMotion dur="3s" repeatCount="indefinite" path="M94,32 L286,32"/></circle>
              <circle r="3.5" fill="#3b82c4"><animateMotion dur="1.2s" repeatCount="indefinite" path="M286,44 L94,44"/></circle>
              <circle r="4" fill="#22c55e"><animateMotion dur="3s" begin="2.4s" repeatCount="indefinite" path="M94,56 L286,56"/></circle>
            </svg>
            <div class="rc-cli">goal → feedback(중간보고) → result · 중간 취소 가능 · ros2 action send_goal ...</div>
          </div>
        </div>

        <div class="math-desc" style="margin-top:14px">상황을 고르면 셋 중 하나를 추천합니다:</div>
        <div class="rc-scs">
          <button class="rc-sc" data-sc="stream">10Hz 센서 스트림</button>
          <button class="rc-sc" data-sc="once">한 번만 계산 요청</button>
          <button class="rc-sc" data-sc="long">2분짜리 이동+중간보고</button>
        </div>
        <div class="rc-verdict" id="rc-verdict"></div>

        <div class="md" id="rc-md"></div>
      `;
    }
  }

  return tagName;
};
