import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ros2-eco';

type Goal = 'viz' | 'sim' | 'nav' | 'arm' | 'remote';

const TOOLS = [
  { name: 'RViz', role: '3D 시각화', use: '토픽을 3D 장면으로 확인 (TF·포인트클라우드·마커)', cmd: 'ros2 run rviz2 rviz2' },
  { name: 'RQt', role: '인트로스펙션·디버깅', use: 'rqt_graph(노드 연결도)·rqt_plot(시계열)·rqt_console(로그)·rqt_tf_tree', cmd: 'rqt' },
  { name: 'Gazebo (gz sim)', role: '물리 시뮬레이터', use: '로봇 없이 주행·조작 실험. ROS 버전별 권장 조합 확인', cmd: 'gz sim' },
  { name: 'Nav2', role: '이동 내비게이션', use: 'A→B 경로·회피·복구. 액션 /navigate_to_pose', cmd: 'ros2 launch nav2_bringup navigation_launch.py' },
  { name: 'MoveIt', role: '팔 모션 플래닝', use: '역기구학·충돌 회피·그립 계획', cmd: 'ros2 launch moveit2_tutorials demo.launch.py' },
  { name: 'ros2_control', role: '하드웨어 추상화', use: '실제 모터↔제어기 표준 인터페이스', cmd: 'ros2 control list_controllers' },
  { name: 'Foxglove', role: '웹 시각화', use: '브라우저에서 bag·토픽 확인 (원격 모니터링)', cmd: 'foxglove-studio' },
];

const VERDICT: Record<Goal, string> = {
  viz: '→ RViz (+ Foxglove 원격). 토픽이 눈에 보여야 디버깅이 됩니다.',
  sim: '→ Gazebo. ROS-Gazebo 권장 조합 확인 후 ros_gz_bridge로 연결.',
  nav: '→ Nav2. 지도→AMCL→플래너→컨트롤러 파이프라인, 액션으로 목표 전송.',
  arm: '→ MoveIt + ros2_control. URDF 올리고 플래닝→실행.',
  remote: '→ Foxglove + compressed 토픽 (대역폭!) + rosbag 기록.',
};

const MD = `
## 생태계 — ros.org가 말하는 4기둥 그대로
- **Plumbing**(통신): 토픽·서비스·액션·DDS — 지금까지 본 것.
- **Tools**: launch·introspection(rqt)·RViz·rosbag·Gazebo — 개발 속도용.
- **Capabilities**: Nav2·MoveIt·image_proc 같은 알고리즘 패키지 — 바퀴를 재발명하지 않기.
- **Community**: ROSCon·Discourse·StackExchange·Zulip + 자매 조직(Autoware·MoveIt·Nav2·OpenCV·PX4·micro-ROS·ROS-Industrial).
- 패키지 검색은 **index.ros.org**, 문서는 **docs.ros.org**, 질문은 **Robotics Stack Exchange**가 정석 루트입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosEco extends w.HTMLElement {
    private goal: Goal = 'viz';

    private refresh() {
      const v = this.shadowRoot?.querySelector('#re-verdict') as HTMLElement;
      if (v) v.textContent = VERDICT[this.goal];
      this.shadowRoot?.querySelectorAll('.re-goal').forEach(el =>
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.goal === this.goal));
    }

    @addEventListener('.re-goal', 'click', { delegate: true })
    onGoal(e: Event) {
      const btn = (e.target as HTMLElement).closest('.re-goal') as HTMLElement;
      if (!btn) return;
      this.goal = btn.dataset.goal as Goal;
      this.refresh();
    }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .re-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .re-intro b { color:#22314e; }
          .re-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:8px; margin-top:10px; }
          .re-card { border:1.5px solid #e2e8f0; border-radius:10px; padding:10px 12px; }
          .re-card h4 { margin:0 0 2px; font-size:13px; color:#22314e; }
          .re-role { font-size:11px; font-weight:800; color:#0369a1; }
          .re-use { font-size:11.5px; color:#475569; margin-top:4px; line-height:1.5; }
          .re-cmd { font-size:10.5px; color:#64748b; font-family:monospace; margin-top:6px; word-break:break-all; }
          .re-goals { display:flex; gap:6px; justify-content:center; margin-top:16px; flex-wrap:wrap; }
          .re-goal { padding:6px 12px; border-radius:16px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#22314e; font-size:12px; font-weight:700; cursor:pointer; }
          .re-goal.active { background:linear-gradient(135deg,#22314e,#7dd3fc); color:#fff; border-color:transparent; }
          .re-verdict { font-size:12.5px; font-weight:700; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 12px; margin-top:8px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="re-intro">
          도구는 <b>목적별로</b> 고릅니다. 아래 목표를 눌러보세요.
        </div>

        <div class="re-grid">
          ${TOOLS.map(t => `<div class="re-card"><h4>${t.name}</h4><div class="re-role">${t.role}</div><div class="re-use">${t.use}</div><div class="re-cmd">${t.cmd}</div></div>`).join('')}
        </div>

        <div class="re-goals">
          <button class="re-goal" data-goal="viz">눈으로 확인</button>
          <button class="re-goal" data-goal="sim">가상 실험</button>
          <button class="re-goal" data-goal="nav">이동 로봇</button>
          <button class="re-goal" data-goal="arm">로봇 팔</button>
          <button class="re-goal" data-goal="remote">원격 모니터링</button>
        </div>
        <div class="re-verdict" id="re-verdict"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
