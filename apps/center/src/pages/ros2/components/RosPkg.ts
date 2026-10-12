import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { markdownParse } from '@center-src/utils/markdown';

const tagName = 'center-ros2-pkg';

const STEPS: { title: string; cmds: string[]; note: string }[] = [
  { title: '① 워크스페이스', cmds: ['mkdir -p ~/ros2_ws/src', 'cd ~/ros2_ws'], note: 'src에 패키지 소스, 나머지는 빌드 산출물. overlay(덮어쓰기) 구조의 시작.' },
  { title: '② 패키지 생성', cmds: ['cd ~/ros2_ws/src', 'ros2 pkg create my_bot --build-type ament_python --dependencies rclpy std_msgs'], note: 'package.xml(메타+의존성) + setup.py + 노드 뼈대 자동 생성.' },
  { title: '③ 빌드 (colcon)', cmds: ['cd ~/ros2_ws', 'colcon build --symlink-install', 'colcon build --packages-select my_bot'], note: 'symlink-install: 파이썬은 재빌드 없이 수정 즉시 반영. 특정 패키지만은 --packages-select.' },
  { title: '④ 소싱 + 실행', cmds: ['source ~/ros2_ws/install/setup.bash', 'ros2 run my_bot talker', 'ros2 launch my_bot bringup.launch.py'], note: 'install/setup.bash를 매 터미널에서 source — underlay(/opt/ros) 위에 overlay가 얹힘.' },
];

const TREE = `ros2_ws/
├─ src/
│  └─ my_bot/
│     ├─ package.xml      ← 이름·버전·의존성
│     ├─ setup.py         ← 진입점(executable) 등록
│     └─ my_bot/
│        └─ talker.py     ← 노드 코드
├─ build/    (중간 산출물)
├─ install/  ← setup.bash가 PATH·PYTHONPATH에 얹는 곳
└─ log/      ← 빌드 로그`;

const MD = `
## 패키지·colcon — ROS 개발의 그릇
- **패키지**가 최소 공유 단위입니다. package.xml에 의존성을 적으면 rosdep·bloom(릴리스)이 자동 처리.
- **colcon build**는 src 전체를 한 번에 빌드하는 오케스트레이터(CMake·Python 혼합 지원).
- **underlay → overlay**: /opt/ros(바이너리) 위에 ~/ros2_ws(내 코드). setup.bash 체이닝으로 겹치면 내 것이 이김.
- 의존성 설치: \`rosdep install --from-paths src --ignore-src -r -y\`
${'```'}mermaid
flowchart TD
    U[/opt/ros - underlay/] --> O[~/ros2_ws - overlay/]
    O --> R[ros2 run / ros2 launch]
${'```'}
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosPkg extends w.HTMLElement {
    private step = 0;

    private refresh() {
      const s = STEPS[this.step];
      const box = this.shadowRoot?.querySelector('#rp-step') as HTMLElement;
      if (box) {
        box.innerHTML = `<div class="rp-step-title">${s.title}</div>` +
          s.cmds.map(c => `<div class="rp-cmd"><code>${c}</code><button class="rp-copy" data-copy="${c.replace(/"/g, '&quot;')}">복사</button></div>`).join('') +
          `<div class="rp-note">${s.note}</div>`;
      }
      const dots = this.shadowRoot?.querySelector('#rp-dots') as HTMLElement;
      if (dots) dots.textContent = `${this.step + 1} / ${STEPS.length}`;
      const prev = this.shadowRoot?.querySelector('#rp-prev') as HTMLButtonElement;
      const next = this.shadowRoot?.querySelector('#rp-next') as HTMLButtonElement;
      if (prev) prev.disabled = this.step === 0;
      if (next) next.disabled = this.step === STEPS.length - 1;
    }

    @addEventListener('#rp-prev', 'click')
    onPrev() { if (this.step > 0) { this.step--; this.refresh(); } }
    @addEventListener('#rp-next', 'click')
    onNext() { if (this.step < STEPS.length - 1) { this.step++; this.refresh(); } }

    @addEventListener('.rp-copy', 'click', { delegate: true })
    async onCopy(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rp-copy') as HTMLElement;
      if (!btn) return;
      try {
        await navigator.clipboard?.writeText(btn.dataset.copy ?? '');
        const old = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = old; }, 1200);
      } catch {}
    }

    @onConnectedAfter
    onReady() { this.refresh(); markdownParse(this.shadowRoot?.querySelector('#rp-md') as HTMLElement, MD); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .rp-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rp-intro b { color:#22314e; }
          pre.rp-tree { background:#0f172a; color:#7dd3fc; font-size:11px; line-height:1.7; border-radius:8px; padding:12px; overflow-x:auto; font-family:monospace; }
          .rp-nav { display:flex; gap:8px; justify-content:center; align-items:center; margin:12px 0 4px; }
          .rp-nav button { padding:6px 16px; border-radius:16px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#22314e; font-size:12px; font-weight:700; cursor:pointer; }
          .rp-nav button:disabled { opacity:0.35; cursor:default; }
          .rp-dots { font-size:12px; font-weight:800; color:#22314e; }
          .rp-step-title { font-size:13px; font-weight:800; color:#22314e; margin:10px 0 4px; }
          .rp-cmd { display:flex; gap:6px; align-items:center; background:#0f172a; border-radius:6px; padding:6px 8px; margin-top:4px; }
          .rp-cmd code { flex:1; color:#7dd3fc; font-size:11.5px; overflow-x:auto; white-space:nowrap; font-family:monospace; }
          .rp-copy { flex-shrink:0; background:#1e293b; color:#e2e8f0; border:1px solid #334155; border-radius:5px; font-size:10.5px; padding:3px 8px; cursor:pointer; }
          .rp-note { font-size:11.5px; color:#64748b; margin-top:4px; }
          #rp-step { min-height:120px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rp-intro">
          처음 패키지 만드는 4단계를 버튼으로 밟아보세요. <b>트리 구조</b>와 단계별 명령이 함께 나옵니다.
        </div>

        <pre class="rp-tree">${TREE}</pre>

        <div class="rp-nav">
          <button id="rp-prev">← 이전</button>
          <span class="rp-dots" id="rp-dots"></span>
          <button id="rp-next">다음 →</button>
        </div>
        <div id="rp-step"></div>

        <div class="md" id="rp-md"></div>
      `;
    }
  }

  return tagName;
};
