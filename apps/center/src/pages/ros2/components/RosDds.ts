import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ros2-dds';

type Rmw = 'fastdds' | 'cyclone' | 'connext';

const RMW_INFO: Record<Rmw, { label: string; desc: string }> = {
  fastdds: { label: 'Fast DDS (기본)', desc: '기본 RMW. 별도 설정 없이 바로 동작, 수십만 개발자가 검증. 처음이면 이대로.' },
  cyclone: { label: 'Cyclone DDS', desc: 'Eclipse 재단 경량 DDS. 임베디드·소규모 시스템에서 인기. RMW_IMPLEMENTATION 교체 한 줄로 전환.' },
  connext: { label: 'Connext DDS', desc: 'RTI 상용 등급. 대규모·고신뢰 요구 시스템용 (라이선스 확인).' },
};

const MD = `
## DDS — ROS 1 마스터가 사라진 이유
- ROS 1은 **마스터(roscore)** 가 노드 명단을 들고 있었습니다. 마스터가 죽으면 전체가 멈추는 단일 실패점이었죠.
- ROS 2는 **DDS**(OMG 표준 미들웨어) 위에서 노드들이 **멀티캐스트 discovery**로 서로를 찾습니다. 중개자 없이 P2P — 그래서 마스터가 없습니다.
- **RMW**는 그 DDS를 갈아끼우는 어댑터입니다. \`RMW_IMPLEMENTATION=rmw_cyclonedds_cpp\` 한 줄로 미들웨어 교체.
- **도메인 ID**(0~232, ROS_DOMAIN_ID)는 전파 범위 구분자입니다. ID가 다르면 같은 WiFi에서도 서로 안 보입니다 — 위에서 직접 확인해보세요.
- 출처: ros.org why-ros "open standards (OMG DDS)" · docs Lyrical "RMW implementations".
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosDds extends w.HTMLElement {
    private rmw: Rmw = 'fastdds';
    private domainA = 0;
    private domainB = 0;

    private refresh() {
      const info = RMW_INFO[this.rmw];
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#rd-info', info.desc);
      setText('#rd-da-val', String(this.domainA));
      setText('#rd-db-val', String(this.domainB));
      setText('#rd-lbl-a', `id ${this.domainA}`);
      setText('#rd-lbl-b', `id ${this.domainB}`);
      const match = this.domainA === this.domainB;
      const v = this.shadowRoot?.querySelector('#rd-verdict') as HTMLElement;
      if (v) {
        v.textContent = match
          ? `✅ 같은 도메인(${this.domainA}) — discovery 성공, 토픽이 오갑니다`
          : `🚫 도메인 ${this.domainA} vs ${this.domainB} — 서로 안 보입니다 (격리)`;
        v.style.background = match ? '#dcfce7' : '#fee2e2';
        v.style.color = match ? '#166534' : '#991b1b';
        v.style.borderColor = match ? '#bbf7d0' : '#fecaca';
      }
      const line = this.shadowRoot?.querySelector('#rd-link') as SVGElement;
      if (line) {
        line.setAttribute('stroke', match ? '#22c55e' : '#e2e8f0');
        line.setAttribute('stroke-dasharray', match ? '0' : '5,4');
      }
      this.shadowRoot?.querySelectorAll('.rd-rmw').forEach(el =>
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.rmw === this.rmw));
    }

    @addEventListener('.rd-rmw', 'click', { delegate: true })
    onRmw(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rd-rmw') as HTMLElement;
      if (!btn) return;
      this.rmw = btn.dataset.rmw as Rmw;
      this.refresh();
    }
    @addEventListener('#rd-da', 'input')
    onDa(e: Event) { this.domainA = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#rd-db', 'input')
    onDb(e: Event) { this.domainB = Number((e.target as HTMLInputElement).value); this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .rd-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rd-intro b { color:#22314e; }
          .rd-stack { display:flex; flex-direction:column; align-items:center; gap:4px; margin:12px 0; }
          .rd-layer { width:100%; max-width:360px; text-align:center; font-size:12px; font-weight:700; border-radius:8px; padding:7px; }
          .rd-arrow { color:#94a3b8; font-size:14px; }
          .rd-rmws { display:flex; gap:6px; justify-content:center; margin:10px 0; flex-wrap:wrap; }
          .rd-rmw { padding:6px 12px; border-radius:16px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:12px; font-weight:700; cursor:pointer; }
          .rd-rmw.active { background:linear-gradient(135deg,#22314e,#7dd3fc); color:#fff; border-color:transparent; }
          .rd-info { font-size:12px; text-align:center; color:#475569; min-height:20px; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:40px; text-align:right; color:#1e293b; }
          svg { display:block; width:100%; max-width:380px; margin:12px auto; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
          .rd-verdict { text-align:center; font-size:12.5px; font-weight:700; border-radius:8px; padding:8px 12px; margin-top:10px; border:1px solid; }
          .rd-cmd { display:flex; gap:6px; align-items:center; background:#0f172a; border-radius:6px; padding:6px 8px; margin-top:8px; }
          .rd-cmd code { flex:1; color:#7dd3fc; font-size:11.5px; font-family:monospace; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rd-intro">
          ROS 1의 <b>roscore 마스터</b>는 단일 실패점이었습니다. ROS 2는 <b>DDS discovery</b>로 중개자 없이 찾습니다. 두 PC의 도메인을 바꿔보세요.
        </div>

        <div class="rd-stack">
          <div class="rd-layer" style="background:#dbeafe;color:#1e40af">내 노드 (rclcpp/rclpy)</div>
          <div class="rd-arrow">↓ rcl</div>
          <div class="rd-layer" style="background:#fef3c7;color:#92400e">RMW 어댑터 (갈아끼움 가능)</div>
          <div class="rd-arrow">↓</div>
          <div class="rd-layer" style="background:#dcfce7;color:#166534">DDS (멀티캐스트 discovery, 마스터 없음)</div>
        </div>

        <div class="rd-rmws">
          ${(Object.keys(RMW_INFO) as Rmw[]).map(k => `<button class="rd-rmw" data-rmw="${k}">${RMW_INFO[k].label}</button>`).join('')}
        </div>
        <div class="rd-info" id="rd-info"></div>
        <div class="rd-cmd"><code>RMW_IMPLEMENTATION=rmw_cyclonedds_cpp ros2 run demo_nodes_cpp talker</code></div>

        <div class="ctl"><label>PC-A 도메인 <input id="rd-da" type="range" min="0" max="9" step="1" value="${this.domainA}"><b id="rd-da-val"></b></label></div>
        <div class="ctl"><label>PC-B 도메인 <input id="rd-db" type="range" min="0" max="9" step="1" value="${this.domainB}"><b id="rd-db-val"></b></label></div>

        <svg viewBox="0 0 380 90">
          <rect x="20" y="20" width="110" height="50" rx="10" fill="#dbeafe"/><text x="75" y="42" font-size="12" font-weight="700" fill="#1e40af" text-anchor="middle">PC-A</text><text x="75" y="58" font-size="10" fill="#1e40af" text-anchor="middle" id="rd-lbl-a">id 0</text>
          <rect x="250" y="20" width="110" height="50" rx="10" fill="#dcfce7"/><text x="305" y="42" font-size="12" font-weight="700" fill="#166534" text-anchor="middle">PC-B</text><text x="305" y="58" font-size="10" fill="#166534" text-anchor="middle" id="rd-lbl-b">id 0</text>
          <line id="rd-link" x1="130" y1="45" x2="250" y2="45" stroke="#22c55e" stroke-width="3"/>
        </svg>
        <div class="rd-verdict" id="rd-verdict"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
