import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { markdownParse } from '@center-src/utils/markdown';

const tagName = 'center-ros2-launch';

const MD = `
## Launch — 실행 설계도
- launch 파일은 **"어떤 노드를, 어떤 파라미터·리맵으로, 어떻게 묶어 켤지"** 적은 파이썬 설계도입니다. 로봇 부팅 = launch 한 줄.
- **Node**(패키지·실행파일·이름), **parameters**(yaml 로드), **remappings**(토픽 이름 바꾸기), **arguments**가 4대 부품입니다.
- 로봇마다 launch를 겹겹이 include합니다: 센서 launch + 내비 launch + 각 로봇 설정 yaml — 아래 체크박스가 그 조합을 흉내냅니다.
- 실행: \`ros2 launch my_bot bringup.launch.py\`, 목록 확인: \`ros2 launch my_bot --show-args\`
${'```'}mermaid
flowchart TD
    L[bringup.launch.py] --> T[talker]
    L --> LS[listener]
    T -- chatter --> LS
${'```'}
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosLaunch extends w.HTMLElement {
    private listener = true;
    private simTime = true;
    private remap = false;
    private logLevel = false;

    private buildCode(): string {
      const L: string[] = [
        'from launch import LaunchDescription',
        'from launch_ros.actions import Node',
        '',
        'def generate_launch_description():',
        '    return LaunchDescription([',
        '        Node(package="demo_nodes_cpp", executable="talker", name="talker"',
        '             parameters=[{"use_sim_time": ' + (this.simTime ? 'True' : 'False') + '}]' +
          (this.remap ? ',\n             remappings=[("chatter", "cmd")]' : '') + '),',
      ];
      if (this.listener) {
        L.push('        Node(package="demo_nodes_py", executable="listener", name="listener"' +
          (this.logLevel ? ',\n             arguments=["--ros-args", "--log-level", "debug"]' : '') + '),');
      }
      L.push('    ])');
      return L.join('\n');
    }

    private refresh() {
      const pre = this.shadowRoot?.querySelector('#rl-code') as HTMLElement;
      if (pre) pre.textContent = this.buildCode();
      const run = this.shadowRoot?.querySelector('#rl-run') as HTMLElement;
      if (run) run.textContent = '$ ros2 launch demo_bringup talker_listener.launch.py';
      const opts: [string, boolean][] = [
        ['#rl-listener', this.listener],
        ['#rl-simtime', this.simTime],
        ['#rl-remap', this.remap],
        ['#rl-log', this.logLevel],
      ];
      opts.forEach(([sel, v]) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLInputElement;
        if (el) el.checked = v;
      });
    }

    @addEventListener('#rl-listener', 'change')
    onListener(e: Event) { this.listener = (e.target as HTMLInputElement).checked; this.refresh(); }
    @addEventListener('#rl-simtime', 'change')
    onSimTime(e: Event) { this.simTime = (e.target as HTMLInputElement).checked; this.refresh(); }
    @addEventListener('#rl-remap', 'change')
    onRemap(e: Event) { this.remap = (e.target as HTMLInputElement).checked; this.refresh(); }
    @addEventListener('#rl-log', 'change')
    onLog(e: Event) { this.logLevel = (e.target as HTMLInputElement).checked; this.refresh(); }

    @addEventListener('#rl-copy', 'click')
    async onCopy(e: Event) {
      const btn = e.target as HTMLElement;
      try {
        await navigator.clipboard?.writeText(this.buildCode());
        const old = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = old; }, 1200);
      } catch {}
    }

    @onConnectedAfter
    onReady() { this.refresh(); markdownParse(this.shadowRoot?.querySelector('#rl-md') as HTMLElement, MD); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .rl-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rl-intro b { color:#22314e; }
          .rl-opts { display:flex; gap:14px; flex-wrap:wrap; margin:10px 0; font-size:12px; font-weight:700; color:#475569; }
          .rl-opts label { display:flex; gap:6px; align-items:center; cursor:pointer; }
          pre.rl-code { background:#0f172a; color:#7dd3fc; font-size:11px; line-height:1.6; border-radius:8px; padding:12px; overflow-x:auto; font-family:monospace; }
          .rl-run { display:flex; gap:6px; align-items:center; background:#0f172a; border-radius:6px; padding:6px 8px; margin-top:6px; }
          .rl-run code { flex:1; color:#7dd3fc; font-size:11.5px; font-family:monospace; }
          .rl-run button { background:#1e293b; color:#e2e8f0; border:1px solid #334155; border-radius:5px; font-size:10.5px; padding:3px 8px; cursor:pointer; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rl-intro">
          체크박스를 켜고 끄면 아래 <b>launch.py가 살아 움직입니다</b>. 부품 4종(Node·parameters·remappings·arguments)이 코드 어디에 들어가는지 보세요.
        </div>

        <div class="rl-opts">
          <label><input type="checkbox" id="rl-listener"> listener 노드</label>
          <label><input type="checkbox" id="rl-simtime"> use_sim_time</label>
          <label><input type="checkbox" id="rl-remap"> 리맵 chatter→cmd</label>
          <label><input type="checkbox" id="rl-log"> 디버그 로그</label>
        </div>

        <pre class="rl-code" id="rl-code"></pre>
        <div class="rl-run"><code id="rl-run"></code><button id="rl-copy">코드 복사</button></div>

        <div class="md" id="rl-md"></div>
      `;
    }
  }

  return tagName;
};
