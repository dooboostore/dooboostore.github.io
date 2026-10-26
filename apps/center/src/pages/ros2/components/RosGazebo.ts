import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ros2-gazebo';

const MD = `
## Gazebo — 만들기 전에 부숴라
- 물리+렌더 기반 시뮬레이터입니다. 실기 전에 주행·조작·충돌을 검증하고, CI 회귀 시험에도 씁니다.
- ROS 버전과 Gazebo 버전 짝이 맞아야 합니다. 안 맞으면 ros_gz 브리지 연결이 꼬여 소스 빌드행입니다.
- ROS↔Gazebo 연결은 ros_gz 브리지 한 줄: \`/토픽@ROS타입@gz타입\` + 방향([\` ROS→GZ, ]\` GZ→ROS).
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosGazebo extends w.HTMLElement {
    private gzDistro = 'jazzy';

    private refresh() {
      const map: Record<string, { gz: string; why: string }> = {
        humble: { gz: 'Fortress (LTS)', why: 'Humble(22.04) 세대의 LTS 조합. Classic 이주 대상이면 여기로.' },
        jazzy: { gz: 'Harmonic (LTS)', why: 'Jazzy(24.04) 권장 조합. ros_gz 브리지로 연결.' },
        lyrical: { gz: 'Harmonic 이후 LTS (docs 확인)', why: 'Lyrical(26.04)은 docs의 권장 조합표를 확인하세요.' },
      };
      const m = map[this.gzDistro];
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#rt-gz-ver', `권장 Gazebo: ${m.gz}`);
      setText('#rt-gz-why', m.why);
      this.shadowRoot?.querySelectorAll('.rt-gz').forEach(el =>
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.d === this.gzDistro));
    }

    @addEventListener('.rt-gz', 'click', { delegate: true })
    onGz(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rt-gz') as HTMLElement;
      if (!btn) return;
      this.gzDistro = btn.dataset.d ?? 'jazzy';
      this.refresh();
    }

    @addEventListener('.rt-copy', 'click', { delegate: true })
    async onCopy(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rt-copy') as HTMLElement;
      if (!btn) return;
      try {
        await navigator.clipboard?.writeText(btn.dataset.copy ?? '');
        const old = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = old; }, 1200);
      } catch {}
    }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const copyBtn = (cmd: string) => `<button class="rt-copy" data-copy="${cmd.replace(/"/g, '&quot;')}">복사</button>`;
      return `
        <style>
          :host { display:block; }
          .rt-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rt-intro b { color:#22314e; }
          .rt-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; padding:10px 14px; margin-top:10px; }
          .rt-def b { color:#0c4a6e; display:inline-block; min-width:36px; }
          .rt-cmd { display:flex; gap:6px; align-items:center; background:#0f172a; border-radius:6px; padding:6px 8px; margin-top:6px; }
          .rt-cmd code { flex:1; color:#7dd3fc; font-size:11.5px; font-family:monospace; overflow-x:auto; white-space:nowrap; }
          .rt-copy { flex-shrink:0; background:#1e293b; color:#e2e8f0; border:1px solid #334155; border-radius:5px; font-size:10.5px; padding:3px 8px; cursor:pointer; }
          .rt-link { font-size:11.5px; margin-top:6px; }
          .rt-link a { color:#0369a1; }
          .rt-set { margin-top:10px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
          .rt-set-title { font-size:12px; font-weight:800; color:#0c4a6e; background:#f0f9ff; padding:7px 12px; }
          .rt-row { display:flex; gap:8px; padding:7px 12px; border-top:1px solid #eef2f7; font-size:11.5px; line-height:1.6; }
          .rt-row code { flex-shrink:0; min-width:170px; color:#0c4a6e; font-family:monospace; font-weight:700; }
          .rt-row span { color:#475569; }
          .rt-gz { padding:5px 12px; border-radius:14px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:11.5px; font-weight:700; cursor:pointer; }
          .rt-gz.active { background:#22314e; color:#fff; border-color:#22314e; }
          .rt-gzrow { display:flex; gap:6px; justify-content:center; margin-top:8px; }
          .rt-verdict { text-align:center; font-size:12.5px; font-weight:800; color:#0c4a6e; margin-top:8px; }
          .rt-note { font-size:11.5px; color:#64748b; text-align:center; margin-top:4px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rt-intro">
          물리+렌더 기반 로봇 시뮬레이터. <b>"Simulate before you build"</b> — 만들기 전에 부수고 고칩니다.
        </div>

        <div class="rt-def">
          <div><b>정의</b> 물리(PhysX 계열)+렌더 기반 로봇 시뮬레이터. "Simulate before you build" — 만들기 전에 부수고 고친다.</div>
          <div><b>언제</b> 실기 전에 주행·조작·충돌을 검증할 때, CI에서 회귀 시험 돌릴 때.</div>
          <div><b>예시</b> 터틀봇 주행 연습, Manip 파지 연습, 센서(라이다·카메라) 합성 데이터.</div>
        </div>
        <div class="rt-gzrow">
          <button class="rt-gz" data-d="humble">Humble</button>
          <button class="rt-gz" data-d="jazzy">Jazzy</button>
          <button class="rt-gz" data-d="lyrical">Lyrical</button>
        </div>
        <div class="rt-verdict" id="rt-gz-ver"></div>
        <div class="rt-note" id="rt-gz-why"></div>
        <div class="rt-cmd"><code>sudo apt install ros-jazzy-ros-gz</code>${copyBtn('sudo apt install ros-jazzy-ros-gz')}</div>
        <div class="rt-cmd"><code>gz sim</code>${copyBtn('gz sim')}</div>
        <div class="rt-set"><div class="rt-set-title">⚙️ 자주 쓰는 설정값 (gz sim · SDF · 브리지)</div><div class="rt-row"><code>gz sim -r</code><span>시작 즉시 시뮬 실행 (기본은 일시정지 상태)</span></div><div class="rt-row"><code>gz sim -s / -g</code><span>서버만 / GUI만 띄우기. 헤드리스 서버+원격 GUI 조합에 씀</span></div><div class="rt-row"><code>gz sim -v 4</code><span>로그 상세도 0~5. 물리·플러그인 에러 추적용</span></div><div class="rt-row"><code>--headless-rendering</code><span>GPU 화면 없이 렌더링. 서버실에서 센서 돌릴 때</span></div><div class="rt-row"><code>SDF max_step_size</code><span>물리 1스텝 시간 (예: 0.001 = 1kHz). 작을수록 정확, 느림</span></div><div class="rt-row"><code>SDF real_time_factor</code><span>실시간 배율. 1.0=실시간, 0.5=절반 속도 슬로모</span></div><div class="rt-row"><code>ros_gz_bridge</code><span>/토픽@ROS타입@gz타입 — 뒤에 [ 면 ROS→GZ, ] 면 GZ→ROS 방향</span></div></div>
        <div class="rt-note">ROS↔Gazebo 연결은 ros_gz 브리지. 버전 짝이 안 맞으면 소스 빌드행.</div>
        <div class="rt-link">공식: <a href="https://gazebosim.org/" target="_blank" rel="noopener">gazebosim.org</a> · 문서 <a href="https://gazebosim.org/docs" target="_blank" rel="noopener">docs</a></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
