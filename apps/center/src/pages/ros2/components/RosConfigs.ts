import { elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ros2-configs';

const MD = `
## 설정 파일 — 코드는 뼈대, 값은 yaml
- 로봇 동작은 코드가 아니라 **yaml 설정값**이 정합니다. 아래 4개가 실전에서 가장 자주 만지는 파일입니다.
- 값은 예시입니다. 버전별로 상이하니 확정은 \`ros2 param list\`로 실측하십시오.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosConfigs extends w.HTMLElement {
    @onConnectedAfter
    onReady() {}

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .rt-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rt-intro b { color:#22314e; }
          .rt-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; padding:10px 14px; margin-top:10px; }
          .rt-def b { color:#0c4a6e; display:inline-block; min-width:36px; }
          .rt-set { margin-top:10px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
          .rt-set-title { font-size:12px; font-weight:800; color:#0c4a6e; background:#f0f9ff; padding:7px 12px; }
          .rt-row { display:flex; gap:8px; padding:7px 12px; border-top:1px solid #eef2f7; font-size:11.5px; line-height:1.6; }
          .rt-row code { flex-shrink:0; min-width:170px; color:#0c4a6e; font-family:monospace; font-weight:700; }
          .rt-row span { color:#475569; }
          .rt-link { font-size:11.5px; margin-top:6px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rt-intro">
          주행이 이상하면 Nav2/costmap부터, 지도가 이상하면 slam_toolbox, 바퀴·팔이 안 들으면 ros2_control·EKF 순으로 보십시오.
        </div>

        <div class="rt-def">
          <div><b>정의</b> 로봇 동작은 코드가 아니라 yaml 설정값이 정한다. 아래 4개가 실전에서 가장 자주 만지는 파일.</div>
          <div><b>언제</b> 주행이 이상하면 Nav2/costmap부터, 지도가 이상하면 slam_toolbox, 바퀴·팔이 안 들으면 ros2_control·EKF 순으로 본다.</div>
          <div><b>예시</b> 값은 예시 — 버전별 상이. 확정은 <code>ros2 param list</code>로 실측.</div>
        </div>

        <div class="rt-set"><div class="rt-set-title">nav2_params.yaml — planner / controller / costmap</div>
          <div class="rt-row"><code>planner_server.expected_planner_frequency</code><span>전역 경로 재계산 주기 (예: 20.0 Hz). 너무 높으면 CPU, 낮으면 반응 저하</span></div>
          <div class="rt-row"><code>controller_server.controller_frequency</code><span>지역 제어 루프 주기. cmd_vel 출력 Hz와 일치시킬 것</span></div>
          <div class="rt-row"><code>goal_checker.xy_goal_tolerance</code><span>도착 판정 반경 (예: 0.25 m). 작을수록 끈질기게 맞춤</span></div>
          <div class="rt-row"><code>local_costmap.robot_radius</code><span>로봇 반경. 실제보다 작으면 긁고, 크면 못 지나감</span></div>
          <div class="rt-row"><code>inflation_layer.inflation_radius</code><span>장애물 팽창 반경. 좁은 통로 통과 여부가 여기서 갈림</span></div>
          <div class="rt-row"><code>velocity_smoother.velocity_timeout</code><span>이 시간 명령 없으면 정지. 안전장치라 건드리지 말 것</span></div>
          <div class="rt-row"><code>amcl.min/max_particles</code><span>파티클 수 범위 (예: 500/2000). 많을수록 정확, 무거움</span></div>
        </div>

        <div class="rt-set"><div class="rt-set-title">mapper_params_online_async.yaml — slam_toolbox</div>
          <div class="rt-row"><code>mode</code><span>mapping(지도 작성) / localization(기존 지도 위치추정)</span></div>
          <div class="rt-row"><code>solver_plugin</code><span>최적화 솔버 (예: solver_plugins::CeresSolver)</span></div>
          <div class="rt-row"><code>minimum_travel_distance</code><span>이만큼 움직여야 스캔 반영 (예: 0.5 m). 작으면 노이즈 누적</span></div>
          <div class="rt-row"><code>map_update_interval</code><span>지도 발행 주기 (예: 5.0 s)</span></div>
          <div class="rt-row"><code>transform_timeout</code><span>TF 대기 한계. 초과하면 경고 후 스킵</span></div>
        </div>

        <div class="rt-set"><div class="rt-set-title">controllers.yaml — ros2_control</div>
          <div class="rt-row"><code>controller_manager.update_rate</code><span>제어 루프 Hz (예: 100). 실전 앞단 RL 탭의 Δt 논의와 직결</span></div>
          <div class="rt-row"><code>diff_drive_controller.wheel_separation</code><span>바퀴 간격 (m). 실측 필수 — 틀리면 회전이 틀어짐</span></div>
          <div class="rt-row"><code>diff_drive_controller.wheel_radius</code><span>바퀴 반경 (m). 이것도 실측</span></div>
          <div class="rt-row"><code>diff_drive_controller.cmd_vel_timeout</code><span>명령 끊김 허용 시간 (예: 0.5 s). 초과 시 자동 정지</span></div>
          <div class="rt-row"><code>joint_trajectory_controller.joints</code><span>팔 관절 이름 목록. URDF와 1:1 대응해야 함</span></div>
          <div class="rt-row"><code>joint_state_broadcaster</code><span>/joint_states 발행기. 없으면 TF·MoveIt 전부 멈춤</span></div>
        </div>

        <div class="rt-set"><div class="rt-set-title">ekf.yaml — robot_localization</div>
          <div class="rt-row"><code>frequency</code><span>융합 출력 Hz (예: 30). odom→base_link 발행 주기</span></div>
          <div class="rt-row"><code>two_d_mode</code><span>평면 로봇이면 true. z·roll·pitch 무시해 안정</span></div>
          <div class="rt-row"><code>sensor_timeout</code><span>센서 끊김 허용 시간. 초과분은 융합에서 제외</span></div>
          <div class="rt-row"><code>odom0_config</code><span>15개 true/false 배열. 어느 센서의 위치·속도·자세를 믿을지 지정 (순서 틀리면 발산)</span></div>
          <div class="rt-row"><code>publish_tf</code><span>odom→base_link TF 발행 여부. 남이 발행하면 false (중복 발행 금지)</span></div>
        </div>
        <div class="rt-link">전체 목록은 각 패키지 문서 + <code>ros2 param list</code> 실측이 정석.</div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
