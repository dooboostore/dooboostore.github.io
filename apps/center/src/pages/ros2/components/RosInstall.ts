import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ros2-install';

type OS = 'ubuntu' | 'windows' | 'rhel' | 'macos' | 'docker';
type Step = { title: string; cmds: string[]; note?: string };

const UBUNTU: Step[] = [
  { title: '① 로케일 (UTF-8)', cmds: ['locale', 'sudo apt update && sudo apt install locales', 'sudo locale-gen en_US en_US.UTF-8', 'sudo update-locale LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8', 'export LANG=en_US.UTF-8'] },
  { title: '② Universe 저장소', cmds: ['sudo apt install software-properties-common', 'sudo add-apt-repository universe'] },
  { title: '③ ROS 2 apt 소스 등록 (Jazzy 예시)', cmds: ['sudo apt update && sudo apt install curl -y', 'export ROS_APT_SOURCE_VERSION=$(curl -s https://api.github.com/repos/ros-infrastructure/ros-apt-source/releases/latest | grep -F tag_name | awk -F\x27"\x27 \x27{print $4}\x27)', 'curl -L -o /tmp/ros2-apt-source.deb https://github.com/ros-infrastructure/ros-apt-source/releases/download/${ROS_APT_SOURCE_VERSION}/ros2-apt-source_${ROS_APT_SOURCE_VERSION}.$(. /etc/os-release && echo ${UBUNTU_CODENAME:-${VERSION_CODENAME}})_all.deb', 'sudo dpkg -i /tmp/ros2-apt-source.deb'], note: 'Lyrical이면 ros-jazzy → ros-lyrical, Ubuntu 26.04에서 수행' },
  { title: '④ 설치 (Desktop 권장)', cmds: ['sudo apt update', 'sudo apt upgrade', 'sudo apt install ros-jazzy-desktop', 'sudo apt install ros-dev-tools'], note: '가볍게는 ros-jazzy-ros-base (통신·CLI만, GUI 없음)' },
  { title: '⑤ 환경 설정', cmds: ['source /opt/ros/jazzy/setup.bash', 'echo source /opt/ros/jazzy/setup.bash >> ~/.bashrc'] },
  { title: '⑥ 동작 확인', cmds: ['ros2 run demo_nodes_cpp talker', 'ros2 run demo_nodes_py listener   # 새 터미널'], note: 'talker 숫자가 listener에 찍히면 성공' },
];

const OTHER: Record<Exclude<OS, 'ubuntu'>, Step[]> = {
  windows: [
    { title: 'Windows 11 바이너리 (Lyrical) / Win 10 (Jazzy)', cmds: ['docs.ros.org → Installing on Windows (binary)', 'call C:\\dev\\ros2_lyrical\\local_setup.bat', 'ros2 run demo_nodes_cpp talker'], note: 'Tier 1: Windows 11(Lyrical) · VS 빌드 도구 필요. 초보는 Ubuntu VM 권장 (ros.org 공식 권고)' },
  ],
  rhel: [
    { title: 'RHEL 10 / Fedora (RPM)', cmds: ['sudo dnf install ros-lyrical-desktop', 'source /opt/ros/lyrical/setup.bash'], note: 'Jazzy는 RHEL 9. docs → Installing on RHEL/Fedora' },
  ],
  macos: [
    { title: 'macOS (소스 빌드)', cmds: ['docs.ros.org → macOS (source)', 'colcon build --symlink-install'], note: '바이너리 미제공. Kilted가 Apple Silicon 네이티브 데모 진행 중(2025-12 Discourse)' },
  ],
  docker: [
    { title: 'Docker (설치 없이 체험)', cmds: ['docker pull osrf/ros:lyrical-desktop', 'docker run -it --rm osrf/ros:lyrical-desktop', 'ros2 run demo_nodes_cpp talker'], note: 'Tier 1 OS가 아니면 ros.org가 권하는 길: VM 또는 Docker' },
  ],
};

const OS_LABEL: Record<OS, string> = { ubuntu: 'Ubuntu (deb)', windows: 'Windows', rhel: 'RHEL/Fedora', macos: 'macOS', docker: 'Docker' };

const MD = `
## 설치 원칙 — ros.org가 말하는 3가지
- **Tier 1 OS에 설치**: 배포판별 지정 OS(REP-2000)에만 바이너리 제공. 짝이 안 맞으면 소스 빌드·VM·Docker 중 선택.
- **binary vs source**: 당장 쓰려면 binary(deb/RPM), 코어 기여·최신 개발판이면 source 빌드.
- **Desktop vs ros-base**: 처음이면 Desktop(ROS+RViz+데모+튜토리얼). 서버·임베디드는 ros-base.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosInstall extends w.HTMLElement {
    private os: OS = 'ubuntu';

    private steps(): Step[] {
      return this.os === 'ubuntu' ? UBUNTU : OTHER[this.os];
    }

    private refresh() {
      const box = this.shadowRoot?.querySelector('#ri-steps') as HTMLElement;
      if (box) {
        box.innerHTML = this.steps().map((s, i) =>
          `<div class="ri-step"><div class="ri-step-title">${s.title}</div>` +
          s.cmds.map(c => `<div class="ri-cmd"><code>${c}</code><button class="ri-copy" data-copy="${c.replace(/"/g, '&quot;')}">복사</button></div>`).join('') +
          (s.note ? `<div class="ri-note">${s.note}</div>` : '') +
          `</div>`).join('');
      }
      this.shadowRoot?.querySelectorAll('.ri-os').forEach(el =>
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.os === this.os));
    }

    @addEventListener('.ri-os', 'click', { delegate: true })
    onOs(e: Event) {
      const btn = (e.target as HTMLElement).closest('.ri-os') as HTMLElement;
      if (!btn) return;
      this.os = btn.dataset.os as OS;
      this.refresh();
    }

    @addEventListener('.ri-copy', 'click', { delegate: true })
    async onCopy(e: Event) {
      const btn = (e.target as HTMLElement).closest('.ri-copy') as HTMLElement;
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
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .ri-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .ri-intro b { color:#22314e; }
          .ri-oss { display:flex; gap:6px; justify-content:center; margin:10px 0 4px; flex-wrap:wrap; }
          .ri-os { padding:6px 14px; border-radius:16px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:12px; font-weight:700; cursor:pointer; }
          .ri-os.active { background:linear-gradient(135deg,#22314e,#7dd3fc); color:#fff; border-color:transparent; }
          .ri-step { margin-top:12px; }
          .ri-step-title { font-size:13px; font-weight:800; color:#22314e; margin-bottom:4px; }
          .ri-cmd { display:flex; gap:6px; align-items:center; background:#0f172a; border-radius:6px; padding:6px 8px; margin-top:4px; }
          .ri-cmd code { flex:1; color:#7dd3fc; font-size:11.5px; overflow-x:auto; white-space:nowrap; font-family:monospace; }
          .ri-copy { flex-shrink:0; background:#1e293b; color:#e2e8f0; border:1px solid #334155; border-radius:5px; font-size:10.5px; padding:3px 8px; cursor:pointer; }
          .ri-copy:hover { border-color:#7dd3fc; }
          .ri-note { font-size:11.5px; color:#64748b; margin-top:4px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="ri-intro">
          OS를 고르면 단계별 명령이 나옵니다. <b>복사 버튼</b>으로 터미널에 붙여넣으세요. Ubuntu 기준 전체 흐름: 로케일 → Universe → apt 소스 → Desktop → 환경 설정 → talker/listener 확인.
        </div>

        <div class="ri-oss">
          ${(Object.keys(OS_LABEL) as OS[]).map(o => `<button class="ri-os${o === this.os ? ' active' : ''}" data-os="${o}">${OS_LABEL[o]}</button>`).join('')}
        </div>
        <div id="ri-steps"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
