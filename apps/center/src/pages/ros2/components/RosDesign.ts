import {
  addEventListener,
  elementDefine,
  onConnectedBodyShadow,
  subscribeSwcAppRouteChange,
  swcAppRouteGo,
  swcAppRouteQueryParam,
} from '@dooboostore/simple-web-component';
import { markdownCancel, markdownParse, selectEdges } from '@center-src/utils/markdown';
import { renderCatalog, NODE_IDS } from './RosDesignNodes';

const tagName = 'center-ros2-design';

type Section =
  | 'overview' | 'arch' | 'sense' | 'plan' | 'nav' | 'arm' | 'base' | 'tf'
  | 'ctrl' | 'nodes' | 'catalog' | 'learn' | 'isaac' | 'scenario' | 'check' | 'changes';

const F = '```';


// mermaid 공통 색 — RosPatterns와 같은 팔레트 (초록=확정, 주황=학습, 보라=VLM, 노랑=HW, 빨강=안전)
const CLS = `    classDef std fill:#c8e6c9,stroke:#2e7d32,color:#1b1b1b;
    classDef rl fill:#ffe0b2,stroke:#e65100,color:#1b1b1b;
    classDef ai fill:#d1c4e9,stroke:#4527a0,color:#1b1b1b;
    classDef hw fill:#fff9c4,stroke:#f9a825,color:#1b1b1b;
    classDef safe fill:#ffcdd2,stroke:#c62828,color:#1b1b1b;
    classDef ext fill:#ffffff,stroke:#8A97A0,stroke-dasharray:4 3,color:#475569;`;

/**
 * 흐름 따라가기 — e: 이 단계에 강조할 화살표 "출발>도착"(도식의 노드 id), t: 제목, d: 설명.
 * 같은 두 노드 사이 화살표가 여럿이면 "출발>도착#2"처럼 mermaid 선 번호를 붙인다 (L_출발_도착_2).
 * diagram: 섹션 안 몇 번째 도식인지 (기본 0).
 */
type FlowStep = { e: string[]; t: string; d: string };
type Flow = { label: string; diagram?: number; steps: FlowStep[] };
const flowEdge = (s: string) => {
  const [pair, n] = s.split('#');
  const [from, to] = pair.split('>');
  return { from, to, id: `L_${from}_${to}_${n ?? 0}` };
};

const ARCH_FLOWS: Flow[] = [
  {
    label: '컵 가져오기 — 처음부터 끝까지',
    steps: [
      { e: ['U>UI'], t: '사람이 명령한다', d: '"테이블 위 컵 가져다줘" — user_input(콘솔)에 입력합니다. 모든 일은 여기서 시작합니다.' },
      { e: ['UI>VLM'], t: '명령이 VLM으로', d: '✉️ /cmd/user_command (std_msgs/String) 문자열 하나가 vlm_task_planner에 들어갑니다.' },
      { e: ['PCH>PC', 'PC>PER'], t: '카메라는 늘 보고 있다', d: 'pole_cam 영상·depth가 USB로 드라이버 → perception으로 계속 흐릅니다. 명령과 상관없이 상시 입력입니다.' },
      { e: ['PER>VLM', 'PER>CO'], t: '무엇이 어디 있나', d: '✉️ /tracked_objects — 컵 id 3, 테이블 id 5, 의자 id 7. VLM은 계획에, coordinator는 id 검증에 씁니다.' },
      { e: ['VLM>CO'], t: 'VLM이 순서만 정한다', d: '✉️ /sub_goals [navigate(테이블 앞) → pick(컵) → navigate(사람) → place]. 어떻게 움직일지는 정하지 않습니다.' },
      { e: ['VLM>SIM'], t: '계획 응답이 조작 창에', d: '📁 /sub_goals 파일 → 시뮬레이터 조작 창 응답줄. VLM 거절(보류)도 say 계획으로 보여준다.' },
      { e: ['CO>NAV'], t: '이동 시작', d: 'coordinator가 검증 후 테이블 앞 (3.45, 0.9)을 계산해 🎬 /navigate_to_pose 액션을 보냅니다. 팔은 stow.' },
      { e: ['PC>RTAB', 'CM>EKF', 'EKF>RTAB', 'RTAB>NAV', 'EKF>NAV'], t: '내가 지도 어디에 있나', d: 'rtabmap이 map→odom, EKF가 odom→base_footprint를 냅니다. 둘을 이으면 Nav2가 지도 기준 로봇 위치를 압니다.' },
      { e: ['PC>COST', 'COST>NAV'], t: '장애물 지도', d: 'pole_cam 점구름이 costmap voxel layer에 쌓여 의자를 피하는 경로를 만듭니다.' },
      { e: ['COST>NT', 'EKF>NT', 'NAV>NT'], t: '앞단 판단 보조 — 무엇을 보고 판단하나', d: 'rl_nav_tuner 입력: local costmap(통로 폭 0.9m, 의자까지 거리), /odometry/filtered(현재 속도), /plan(남은 거리).' },
      { e: ['NT>NAV', 'NT>RLN'], t: '앞단 판단 보조 — 결정', d: '좁은 통로·의자 근처 → 프리셋 B. /speed_limit 60%(≈0.15m/s)를 Nav2와 rl_nav_correction에, max_vel_theta 1.0을 set_parameters로.' },
      { e: ['NAV>RLN'], t: 'Nav2 속도 명령', d: '✉️ /cmd_vel_nav = (0.12 m/s, 0.30 rad/s), 20Hz. 같은 선으로 /plan도 받습니다(경로 오차 계산용).' },
      { e: ['CM>RLN', 'RLN>VS'], t: '뒷단 RL 보정', d: '/odom·/imu로 실제 움직임을 보니 카펫에서 경로를 4cm 벗어남 → Δ(+0.02, +0.05) → (0.14, 0.35). /speed_limit 상한 0.15 안이라 통과.' },
      { e: ['VS>CMN', 'PC>CMN'], t: '안전 — 가속 제한 → 충돌 감시', d: 'velocity_smoother가 가속을 자르고, collision_monitor가 점구름으로 의자까지 거리를 봅니다(0.5m, 통과).' },
      { e: ['CMN>CM'], t: '최종 /cmd_vel', d: 'diff_drive_controller가 바퀴 속도로 바꿉니다 (좌 2.72, 우 5.76 rad/s).' },
      { e: ['CM>HW', 'HW>CM'], t: '모터로', d: '100Hz로 쓰기(SyncWrite) · 읽기(SyncRead). 테이블 앞에 도착하면 Nav2 액션 결과가 "성공".' },
      { e: ['GCH>GC', 'GC>GS', 'PER>GS', 'CO>GS'], t: '어떻게 잡을까', d: '/tracked_objects로 대상 컵을 찾고 gripper_cam 근접 점구름으로 후보를 매김. 📞 /score_grasps → [B 0.87, C 0.62, A 0.41].' },
      { e: ['CO>MG'], t: '집기 실행', d: '🎬 /plan_kinematic_path 후보 B → /execute_trajectory — 접근·파지·들어올리기를 move_group이 직접 계획·실행.' },
      { e: ['MG>CM'], t: '팔 궤적', d: '🎬 /arm_controller/follow_joint_trajectory로 관절 궤적이 controller_manager에 들어갑니다.' },
      { e: ['CM>RLA', 'RLA>CM'], t: '팔 처짐 보정', d: 'JTC 목표 [0.00, 0.62, −0.31, 1.10] + Δ[0, +0.03, −0.01, 0] → joint2 중력 처짐 보상.' },
      { e: ['CM>HW', 'HW>CM'], t: '팔 모터로', d: '같은 OpenCR 버스로 팔 관절 목표를 쓰고 현재값을 읽습니다.' },
      { e: ['CM>ASM', 'ASM>CO'], t: '안전 감시는 항상', d: '/joint_states를 arm_safety_monitor가 계속 봅니다. 이상이 없으면 조용합니다.' },
      { e: ['CO>NAV', 'CO>MG'], t: '사람에게 가서 내려놓기', d: '컵을 든 채 footprint를 키우고 이동 → place(위로 이동 후 벌리기). 경로는 위 이동 단계와 같습니다.' },
      { e: ['CO>VLM'], t: '완료 보고', d: '✉️ /task_status 완료 — VLM은 다음 명령을 기다립니다.' },
      { e: ['CO>UI', 'UI>U'], t: '사람에게 알림', d: '✉️ /robot_say → 🔊 "컵 가져왔어요". 끝.' },
    ],
  },
  {
    label: '베이스 속도 명령 한 주기 (20Hz)',
    steps: [
      { e: ['NAV>RLN'], t: 'Nav2 controller', d: '경로를 따라가는 속도 /cmd_vel_nav를 냅니다.' },
      { e: ['CM>RLN', 'NT>RLN', 'RLN>VS'], t: 'RL 보정', d: '/odom·/imu(실제 움직임)를 보고 Δ를 더한 뒤(±0.05m/s, ±0.10rad/s) /speed_limit 상한으로 다시 자릅니다.' },
      { e: ['VS>CMN', 'PC>CMN'], t: '가속 제한 → 충돌 감시', d: '갑작스러운 가속을 막고, 점구름 다각형 안에 장애물이 있으면 감속·정지.' },
      { e: ['CMN>CM'], t: 'diff_drive_controller', d: '/cmd_vel을 바퀴 각속도로 바꿉니다.' },
      { e: ['CM>HW', 'HW>CM'], t: '쓰고 읽기', d: '바퀴 목표 속도를 쓰고, 실제 바퀴 회전과 IMU를 읽습니다.' },
      { e: ['CM>EKF', 'EKF>NAV'], t: '피드백', d: '/odom·/imu → EKF → /odometry/filtered. Nav2가 다음 명령을 계산할 때 현재 속도로 씁니다.' },
    ],
  },
  {
    label: '팔 한 주기 — controller_manager read → update → write',
    steps: [
      { e: ['MG>CM'], t: '입력', d: 'move_group이 팔 궤적을 보냅니다 (동작 시작 때 1회). 다음 update에서 쓰입니다.' },
      { e: ['HW>CM'], t: 'read', d: 'OpenCR에서 관절 위치·속도·전류와 IMU를 읽습니다.' },
      { e: ['CM>ASM', 'CM>EKF', 'CM>RLN'], t: 'update — 상태 발행', d: '/joint_states(→ arm_safety_monitor), /odom·/imu(→ EKF, rl_nav_correction).' },
      { e: ['CM>RLA'], t: 'update — JTC 목표', d: 'JTC가 이번 주기 목표 관절각을 rl_arm_correction에 reference로 넘깁니다.' },
      { e: ['RLA>CM'], t: 'update — 보정', d: 'Δ(±0.05rad)를 더해 command로 씁니다.' },
      { e: ['CM>HW'], t: 'write', d: '최종 명령을 OpenCR로. 다음 주기 read로 돌아갑니다 (100Hz).' },
      { e: ['ASM>CM'], t: '이상 시에만', d: 'arm_safety_monitor가 문제를 찾으면 팔 궤적을 취소합니다 (주기와 무관한 비동기 호출).' },
    ],
  },
  {
    label: '위치 추정 — map·odom은 어디서 오나',
    steps: [
      { e: ['HW>CM'], t: '바퀴·IMU 원자료', d: 'OpenCR에서 바퀴 회전과 IMU를 읽습니다.' },
      { e: ['CM>EKF'], t: '/odom · /imu', d: 'diff_drive가 바퀴만으로 계산한 /odom, imu broadcaster의 /imu가 EKF로.' },
      { e: ['EKF>NAV'], t: 'odom→base_footprint', d: 'EKF가 둘을 융합해 연속적인(대신 드리프트 있는) odom→base_footprint TF를 냅니다.' },
      { e: ['PCH>PC', 'PC>RTAB', 'EKF>RTAB'], t: 'RTAB-Map 입력', d: 'pole_cam 컬러·depth + /odometry/filtered로 지도와 맞춰봅니다.' },
      { e: ['RTAB>NAV'], t: 'map→odom', d: 'rtabmap이 드리프트를 상쇄하는 map→odom을 냅니다. 가끔 점프하지만 odom 쪽은 끊기지 않습니다 (맵핑·위치추정 탭 참고).' },
    ],
  },
  {
    label: '파지 실패 → 재시도 → 재계획 → 다시 집기',
    steps: [
      { e: ['CO>GS'], t: '후보 점수', d: '📞 /score_grasps → [B 0.87, C 0.62, A 0.41].' },
      { e: ['CO>MG'], t: '1순위 B 시도 → 실패', d: '그리퍼가 완전히 닫힘(빈손) → coordinator가 놓친 것으로 판단.' },
      { e: ['CO>MG'], t: '2순위 C 재시도 → 또 실패', d: 'VLM을 부르지 않고 coordinator가 직접 다음 후보로. 실행 세부는 coordinator의 권한입니다.' },
      { e: ['CO>VLM'], t: '재계획 요청', d: '✉️ /task_status (step 2, FAILED, reason: grasp_failed_all). 후보를 다 써서 이제 VLM 차례입니다.' },
      { e: ['PER>VLM', 'VLM>CO'], t: 'VLM이 새 계획', d: '지금 보이는 물체(/tracked_objects)를 다시 보고 ✉️ /sub_goals — 예) [navigate(테이블 옆, 컵 방향으로 정렬), pick(컵 3), navigate(사람), place].' },
      { e: ['CO>NAV'], t: '새 계획 실행 — 다른 방향으로 이동', d: '검증 후 팔을 접고 🎬 /navigate_to_pose 새 접근 위치. 4축 팔은 컵이 팔 평면 안에 있어야 옆 파지가 되므로 방향이 중요합니다.' },
      { e: ['GC>GS', 'CO>GS'], t: '새 위치에서 후보 다시', d: '장면을 갱신하고 gripper_cam 새 점구름으로 📞 /score_grasps를 다시 — 예) [D 0.81, B 0.70].' },
      { e: ['CO>MG'], t: '다시 집기 → 성공', d: '🎬 plan+execute 후보 D → 파지 성공. 성공하면 원래 계획대로 사람에게 전달하러 이어갑니다.' },
      { e: ['CO>UI', 'UI>U'], t: '재계획도 실패하면 — 알리고 정지', d: 'pick 단계가 두 번째로 실패(같은 단계 2회 연속)하면 ✉️ /robot_say → 🔊 "컵을 잡을 수 없어요" 후 정지. 이건 재계획을 해 보고도 안 될 때만입니다.' },
    ],
  },
  {
    label: '이동 실패 → 복구 → 재계획',
    steps: [
      { e: ['CO>NAV'], t: '이동 중 막힘', d: '🎬 /navigate_to_pose 진행 중, 의자가 통로를 막아 경로가 안 나오거나 로봇이 제자리에 갇힙니다.' },
      { e: ['NAV>RLN', 'RLN>VS', 'VS>CMN', 'CMN>CM'], t: 'Nav2가 먼저 스스로 복구', d: 'bt_navigator가 Spin·BackUp·Wait 복구를 시도합니다. 복구 중 속도 명령도 같은 안전 체인을 거칩니다 (BackUp은 0.1m 이하).' },
      { e: ['CO>NAV'], t: '복구도 실패 → ABORTED', d: '정해진 재시도 횟수를 넘기면 NavigateToPose가 ABORTED로 끝나고, 결과가 coordinator에 돌아옵니다.' },
      { e: ['CO>VLM'], t: '실패 보고', d: '✉️ /task_status (step 1, FAILED, reason: nav_failed). VLM은 FAILED를 받으면 재계획합니다.' },
      { e: ['VLM>CO'], t: '재계획', d: '✉️ /sub_goals 다시 — 예) "테이블 반대편으로 접근", "의자를 피해 다른 방향". coordinator가 다시 검증합니다.' },
      { e: ['CO>NAV'], t: '새 목표로 재시도', d: '🎬 /navigate_to_pose (새 접근 위치).' },
      { e: ['CO>UI', 'UI>U'], t: '또 실패하면 알리고 정지', d: '같은 단계가 2회 연속 실패하면 ✉️ /robot_say → 🔊 "테이블까지 갈 수 없어요".' },
    ],
  },
];

const SENSE_FLOWS: Flow[] = [
  {
    label: 'pole_cam 영상 → 물체 추적 → 다른 노드로',
    steps: [
      { e: ['PCH>PC'], t: '카메라 → 드라이버', d: '카메라는 🔌 USB 3로 realsense2_camera 드라이버에 붙습니다. 카메라 자체는 토픽을 내지 않고, 토픽은 드라이버 노드가 발행합니다.' },
      { e: ['PC>PER', 'PC>PER#2'], t: '영상 + depth → perception', d: '컬러 영상·camera_info와 컬러에 정렬된 depth가 30Hz(best_effort)로 들어갑니다. 정렬(align_depth)이 돼 있어야 픽셀마다 거리를 바로 읽습니다.' },
      { e: ['JS>RSP', 'RSP>PER'], t: '카메라가 어디 있나 (TF)', d: '/joint_states → robot_state_publisher → /tf. perception이 카메라 좌표의 물체를 map 기준으로 바꿀 때 이 TF를 씁니다.' },
      { e: ['PER>O2'], t: '추적 결과 발행', d: '✉️ /tracked_objects 10Hz(reliable) — id·class·map 기준 위치·크기·신뢰도. VLM·coordinator·grasp_scorer가 같은 물체를 id로 가리킵니다.' },
    ],
  },
  {
    label: 'pole_cam 하나가 어디까지 쓰이나',
    steps: [
      { e: ['PCH>PC'], t: '한 대의 카메라', d: 'LiDAR가 없어서 거리 정보는 전부 이 RealSense에서 나옵니다.' },
      { e: ['PC>PER', 'PC>PER#2'], t: '① 인지', d: '영상·depth → perception → 물체 추적.' },
      { e: ['PC>O3'], t: '② 위치추정', d: '컬러 + 정렬 depth → rtabmap (SLAM·위치추정, map→odom).' },
      { e: ['PC>O4'], t: '③ 장애물', d: '점구름 → Nav2 costmap(voxel layer), MoveIt octomap, collision_monitor. 10~15Hz로 다운샘플.' },
    ],
  },
  {
    label: 'gripper_cam — 집기 직전 근접 보기',
    steps: [
      { e: ['GCH>GC'], t: '그리퍼에 붙은 카메라', d: '팔과 함께 움직입니다. pole_cam과 다른 USB 3 컨트롤러에 꽂고 serial_no로 구분합니다.' },
      { e: ['GC>PER', 'GC>PER#2'], t: '영상 + depth → perception', d: '근접에서 컵을 다시 확인합니다.' },
      { e: ['JS>RSP', 'RSP>PER'], t: '움직이는 카메라의 위치', d: '팔이 움직이는 중이라 영상 시각(header.stamp)의 TF로 변환해야 위치가 어긋나지 않습니다.' },
      { e: ['GC>O5'], t: '근접 점구름 → grasp_scorer', d: 'pick 단계에서만. D435 계열은 0.2~0.3m보다 가까우면 depth가 비므로 접근 시작점(약 0.3m)에서 미리 찍어 둡니다.' },
    ],
  },
];

const PLAN_FLOWS: Flow[] = [
  {
    label: '명령 하나 처리',
    steps: [
      { e: ['USER>UI'], t: '사람이 말한다', d: '"테이블 위 컵 가져다줘".' },
      { e: ['UI>VLM', 'TO>VLM'], t: 'VLM에 명령', d: '/cmd/user_command 문자열 + 지금 보이는 물체 목록(/tracked_objects)을 함께 보고 계획합니다.' },
      { e: ['VLM>CO', 'TO>CO'], t: '계획 → coordinator 검증', d: '/sub_goals [navigate, pick, navigate, place]. coordinator가 형식·허용 동작·대상 id가 /tracked_objects에 실제 있는지 확인합니다.' },
      { e: ['CO>O3a'], t: '이동', d: '팔을 stow로 접고 🎬 NavigateToPose (3.45, 0.9).' },
      { e: ['NI>NT', 'NT>O3b', 'NT>O3b#2'], t: '이동 중 속도 프리셋', d: 'rl_nav_tuner가 costmap·현재 속도·남은 거리를 보고 1~2초마다 /speed_limit과 set_parameters로 바꿉니다.' },
      { e: ['CO>O4a#2'], t: '장면 갱신', d: '베이스가 멈추고 0.5초 안정 대기 → /clear_octomap → 테이블·컵을 /apply_planning_scene으로 등록.' },
      { e: ['CO>GS'], t: '파지 후보 점수', d: '📞 /score_grasps → [B 0.87, C 0.62, A 0.41]. pick 직전 한 번이라 서비스.' },
      { e: ['CO>O4a'], t: '집기 실행', d: '🎬 /execute_task_solution 후보 B. 실패하면 다음 후보로 다시 집기.' },
      { e: ['CO>VLM'], t: '단계 결과 보고', d: '/task_status. place까지 이동·집기를 반복한 뒤 마지막에 완료 보고.' },
      { e: ['CO>UI'], t: '말할 내용', d: '/robot_say "컵 가져왔어요".' },
      { e: ['UI>USER'], t: '음성 안내', d: 'voice_ui가 TTS로 말합니다. 끝.' },
    ],
  },
  {
    label: '파지 실패 → 재시도 → 재계획 → 다시 집기',
    steps: [
      { e: ['CO>O4a'], t: '후보 B 실패', d: '그리퍼가 완전히 닫힘(빈손) → 놓친 것으로 판단.' },
      { e: ['CO>O4a'], t: '후보 C 재시도 → 또 실패', d: 'VLM을 부르지 않고 coordinator가 직접 2순위로 (규칙 4). 실행 세부는 coordinator의 권한입니다.' },
      { e: ['CO>VLM'], t: '재계획 요청', d: '/task_status (step 2, FAILED, reason: grasp_failed_all).' },
      { e: ['TO>VLM', 'VLM>CO'], t: '새 계획', d: 'VLM이 /tracked_objects를 다시 보고 /sub_goals — 예) [navigate(테이블 옆, 컵 방향 정렬), pick(컵 3), navigate(사람), place]. coordinator가 다시 검증.' },
      { e: ['CO>O3a'], t: '새 접근 위치로 이동', d: '팔을 접고 NavigateToPose (다른 방향).' },
      { e: ['CO>O4a#2', 'CO>GS'], t: '장면 갱신 · 후보 다시', d: '멈춘 뒤 octomap 지우기·컵 등록 → 새 위치에서 /score_grasps 다시.' },
      { e: ['CO>O4a'], t: '다시 집기 → 성공', d: '컵 attach. 성공하면 원래 계획대로 사람에게 전달(이동 → place)로 이어갑니다.' },
      { e: ['CO>UI', 'UI>USER'], t: '재계획도 실패하면 — 알리고 정지', d: 'pick이 두 번째로 실패(같은 단계 2회 연속, 규칙 5)할 때만 "컵을 잡을 수 없어요".' },
    ],
  },
  {
    label: '팔 안전 이벤트로 멈출 때',
    steps: [
      { e: ['SE>CO'], t: '접촉 감지 보고', d: 'arm_safety_monitor가 궤적을 취소하고 /arm_safety_event를 보냅니다 (4장).' },
      { e: ['CO>VLM'], t: '단계 실패 보고', d: 'coordinator가 pick 단계를 실패로 기록하고 /task_status (FAILED, reason: arm_contact)로 VLM에 알립니다.' },
      { e: ['VLM>CO'], t: '재계획', d: '✉️ /sub_goals 다시 — 예) 다른 방향에서 접근. coordinator가 검증합니다.' },
      { e: ['CO>O3a', 'CO>O4a#2', 'CO>GS', 'CO>O4a'], t: '새 계획 실행', d: '이동 → 장면 갱신 → 후보 점수 → 집기를 다시. 성공하면 원래 계획대로 이어갑니다.' },
      { e: ['CO>UI', 'UI>USER'], t: '또 실패하면 알리고 정지', d: '같은 단계가 2회 연속 실패할 때만 음성으로 알리고 정지.' },
    ],
  },
  {
    label: '이동 실패 → 재계획',
    steps: [
      { e: ['CO>O3a'], t: '이동 요청', d: '🎬 NavigateToPose (3.45, 0.9).' },
      { e: ['CO>O3a'], t: '결과 ABORTED', d: 'Nav2가 복구(Spin·BackUp·Wait)까지 해보고도 못 가면 액션이 ABORTED로 끝나 coordinator에 돌아옵니다 (3장).' },
      { e: ['CO>VLM'], t: '실패 보고', d: '/task_status (step 1, FAILED, reason: nav_failed).' },
      { e: ['VLM>CO', 'TO>VLM'], t: '재계획', d: 'VLM이 지금 보이는 물체(/tracked_objects)를 다시 보고 새 /sub_goals — 예) 테이블 반대편 접근.' },
      { e: ['CO>O3a'], t: '새 목표로 재시도', d: '검증 후 다시 NavigateToPose.' },
      { e: ['CO>UI', 'UI>USER'], t: '또 실패하면 알리고 정지', d: '같은 단계 2회 연속 실패 → /robot_say "테이블까지 갈 수 없어요".' },
    ],
  },
];

const NAV_FLOWS: Flow[] = [
  {
    label: 'Nav2 이동 명령 하나',
    steps: [
      { e: ['LMN>BT', 'LMN>PS', 'LMN>CS', 'LMN>BS'], t: '시작할 때 1회', d: 'lifecycle_manager가 Nav2 서버들을 configure → activate. rtabmap은 관리 대상이 아닙니다.' },
      { e: ['RGBD>RTAB', 'ODOM>RTAB', 'RTAB>PS', 'RTAB>CS'], t: '위치는 늘 들어온다', d: 'rtabmap(위치추정 모드)이 /map(transient_local)과 map→odom을 냅니다. map→odom이 나오기 전엔 coordinator가 목표를 보내지 않습니다.' },
      { e: ['IN>BT'], t: '목표 도착', d: 'coordinator의 NavigateToPose가 bt_navigator로.' },
      { e: ['BT>PS', 'PTS>PS'], t: '경로 계산', d: '🎬 compute_path_to_pose. global_costmap은 pole_cam 점구름(voxel layer)으로 장애물을 채웁니다.' },
      { e: ['PS>O5a'], t: '/plan', d: '경로가 나옵니다. rl_nav_correction도 경로 오차 계산에 씁니다.' },
      { e: ['BT>CS', 'PTS>CS', 'ODOM>CS', 'TUNE>CS'], t: '경로 따라가기', d: '🎬 follow_path. controller_server(DWB)가 local_costmap·현재 속도(/odometry/filtered)·rl_nav_tuner 상한을 보고 명령을 만듭니다.' },
      { e: ['CS>O5a'], t: '/cmd_vel_nav 20Hz', d: '베이스 체인(5장)으로. 주행 중 경로 계산~따라가기가 약 1Hz로 반복(재계획)됩니다.' },
      { e: ['BT>BS'], t: '막혔을 때만 복구', d: 'Spin·BackUp·Wait. pole_cam이 뒤를 못 보므로 BackUp은 빼거나 0.1m 이하로.' },
      { e: ['BS>O5a'], t: '복구 중 속도 명령', d: '같은 /cmd_vel_nav로 내서 안전 필터를 거치게 합니다. 끝나면 경로 계산부터 다시.' },
    ],
  },
  {
    label: '막힘 → 복구 → 그래도 안 되면 coordinator에 실패',
    steps: [
      { e: ['BT>CS', 'CS>O5a'], t: '따라가다 막힘', d: '의자가 통로를 막아 controller_server가 진행하지 못합니다 (progress checker가 멈춤 감지).' },
      { e: ['BT>PS'], t: '경로 다시 계산', d: '막힌 곳을 피하는 경로를 찾아봅니다. 찾으면 따라가기로 계속.' },
      { e: ['BT>BS', 'BS>O5a'], t: '복구 동작', d: '경로가 안 나오면 Spin·BackUp·Wait. 복구 속도 명령도 안전 체인을 거칩니다.' },
      { e: ['BT>PS', 'BT>CS'], t: '복구 후 재시도', d: '경로 계산부터 다시. 행동 트리에 정해진 재시도 횟수만큼 반복합니다.' },
      { e: ['IN>BT'], t: '결과 ABORTED → coordinator', d: '횟수를 넘기면 NavigateToPose 액션이 ABORTED로 끝납니다. 그다음 재계획은 coordinator·VLM 몫입니다 (2장 "이동 실패 → 재계획").' },
    ],
  },
  {
    label: 'RTAB-Map — 지도 만들기 → 운영',
    diagram: 1,
    steps: [
      { e: ['OP>TEL'], t: '① 매핑: 사람이 몬다', d: 'teleop_twist_keyboard로 0.1~0.15m/s 천천히. 같은 곳을 여러 방향에서 보고 출발점으로 돌아와 루프 클로저.' },
      { e: ['TEL>DD1'], t: '/cmd_vel', d: 'diff_drive_controller가 바퀴를 굴립니다.' },
      { e: ['DD1>EKF1', 'EKF1>RT1'], t: '휠+IMU 오도메트리', d: '/odom → ekf → /odometry/filtered → rtabmap. 하향 카메라라 시각 오도메트리는 끕니다(visual_odometry:=false).' },
      { e: ['CH1>RS1', 'RS1>RT1'], t: '카메라 영상', d: 'pole_cam 컬러 + 정렬 depth로 장면을 기억합니다.' },
      { e: ['RT1>DB'], t: 'DB 저장', d: '~/.ros/rtabmap.db에 노드·그래프·특징점. 지도는 이 파일 하나입니다.' },
      { e: ['DB>RT2'], t: '② 운영: 같은 DB를 불러옴', d: 'localization:=true. 지도는 더 키우지 않고 위치만 찾습니다.' },
      { e: ['CH2>RS2', 'RS2>RT2'], t: '지금 보이는 장면', d: '처음 몇 초간 지도와 맞는 장면을 찾아야 위치가 잡힙니다.' },
      { e: ['RT2>NAV2', 'RT2>NAV2#2'], t: '/map · map→odom → Nav2', d: '위치를 찾으면 map→odom을 내기 시작합니다. 이때부터 Nav2 목표를 보낼 수 있습니다.' },
    ],
  },
];

const ARM_FLOWS: Flow[] = [
  {
    label: '집기 한 번',
    steps: [
      { e: ['SC>MG', 'PCD>MG'], t: '준비 — 장면', d: '2장 pick 단계에서 octomap을 지우고 테이블·컵을 등록해 둡니다. octomap은 pole_cam 점구름으로 다시 쌓입니다.' },
      { e: ['IN>MG'], t: '실행 요청', d: 'coordinator가 ExecuteTaskSolution (MTC: 접근 → 열기 → 파지 → attach → 들어올리기 → 후퇴).' },
      { e: ['MG>JTC'], t: '팔 궤적', d: '🎬 follow_joint_trajectory. MTC 단계마다 팔 궤적 또는 그리퍼 명령을 번갈아 보냅니다.' },
      { e: ['MOT>HWI'], t: 'read', d: '다이나믹셀에서 위치·속도·전류(→ effort)를 읽습니다. 여기서부터 controller_manager 100Hz 한 주기.' },
      { e: ['HWI>JTC', 'HWI>RAC', 'HWI>RAC#2', 'HWI>JSB'], t: 'state interface', d: '읽은 값이 같은 메모리로 각 컨트롤러에 보입니다. 토픽이 아닙니다.' },
      { e: ['JSB>O1', 'JSB>ASM'], t: '/joint_states', d: 'robot_state_publisher(TF)·move_group, 그리고 arm_safety_monitor(전류 감시)로.' },
      { e: ['JTC>RAC'], t: 'JTC 목표 → reference', d: '이번 주기 목표 관절각 [0.00, 0.62, −0.31, 1.10]을 rl_arm_correction에 넘깁니다.' },
      { e: ['RAC>HWI'], t: '보정 → command', d: '중력 처짐 보상 Δ[0, +0.03, −0.01, 0]을 더해 씁니다 (±0.05rad 클리핑).' },
      { e: ['HWI>MOT'], t: 'write', d: '다이나믹셀로 보내고 다음 주기 read로.' },
      { e: ['MG>GRC', 'GRC>HWI'], t: '그리퍼 단계', d: 'MTC가 열기·닫기 단계에선 🎬 gripper_cmd → gripper_controller가 보정 단계와 같은 update에서 command를 씁니다.' },
    ],
  },
  {
    label: '접촉 감지로 멈출 때',
    steps: [
      { e: ['JSB>ASM'], t: '전류 감시', d: '/joint_states의 effort가 기준보다 높은 상태가 0.1초 넘게 이어지면 접촉으로 판단.' },
      { e: ['ASM>JTC'], t: '궤적 취소', d: '📞 follow_joint_trajectory/_action/cancel_goal → JTC가 현재 자세를 유지합니다.' },
      { e: ['ASM>O2'], t: 'coordinator에 보고', d: '/arm_safety_event → 단계 실패로 처리 (2장 재시도 규칙).' },
    ],
  },
];

const BASE_FLOWS: Flow[] = [
  {
    label: '속도 명령 한 주기',
    steps: [
      { e: ['CIN>RNC', 'PIN>RNC', 'SL>RNC'], t: 'rl_nav_correction 입력', d: 'Nav2 /cmd_vel_nav(20Hz), /plan(경로 오차), /speed_limit(상한).' },
      { e: ['RNC>VS'], t: 'RL 보정', d: 'Δ를 더하고 min(프리셋 상한, /speed_limit)으로 다시 자름. 입력이 0.2초 넘게 끊기면 Δ=0으로 통과만.' },
      { e: ['VS>CMN'], t: '가속 제한', d: 'velocity_smoother가 급가속·급감속을 자릅니다.' },
      { e: ['PTS>CMN', 'CMN>DD'], t: '충돌 감시 → /cmd_vel', d: 'pole_cam 점구름으로 approach(1초 뒤 충돌 예상 시 감속)·slowdown(0.3m, 40%)·stop(0.15m) 다각형 검사.' },
      { e: ['WM>BHW'], t: 'read', d: '바퀴 위치·속도와 IMU를 읽습니다 (controller_manager 한 주기 시작).' },
      { e: ['BHW>DD', 'BHW>IMUB'], t: 'state interface', d: '읽은 값이 diff_drive·imu broadcaster에 보입니다.' },
      { e: ['DD>EKF', 'IMUB>EKF', 'DD>RNC', 'IMUB>RNC'], t: '/odom · /imu', d: 'EKF로, 그리고 rl_nav_correction의 다음 보정 계산으로 (피드백).' },
      { e: ['DD>BHW'], t: '바퀴 목표 속도', d: 'diff_drive가 collision_monitor의 /cmd_vel로 좌·우 바퀴 속도를 씁니다.' },
      { e: ['BHW>WM'], t: 'write', d: '모터로 보내고 다음 주기 read로.' },
      { e: ['EKF>O3'], t: 'EKF 출력', d: '/odometry/filtered와 odom→base_footprint TF → Nav2·rl_nav_tuner.' },
    ],
  },
  {
    label: 'odom은 어디서 오나 — 바퀴·IMU → EKF',
    steps: [
      { e: ['WM>BHW'], t: '원자료', d: '바퀴 회전량과 IMU 각속도·가속도.' },
      { e: ['BHW>DD', 'BHW>IMUB'], t: '컨트롤러가 읽음', d: 'diff_drive는 바퀴만으로 위치를 적분, imu broadcaster는 IMU 값을 그대로.' },
      { e: ['DD>EKF', 'IMUB>EKF'], t: 'EKF로 융합', d: '바퀴만 쓰면 회전이 특히 부정확합니다. 속도 위주로 넣어 미끄러짐을 줄입니다.' },
      { e: ['EKF>O3'], t: 'odom TF는 EKF 하나만', d: 'diff_drive는 enable_odom_tf: false. 둘 다 내면 TF가 싸워 로봇이 떨립니다 (맵핑·위치추정 탭 "문제 1").' },
    ],
  },
];

// links: 도식의 subgraph(섹터) id → 이동할 섹션, nodes: 도식의 노드 id → 노드 사전 카드 id.
// 렌더된 SVG에서 클릭 핸들러로 붙인다.
const SECTIONS: Record<Section, { label: string; md: string; links?: Record<string, Section>; nodes?: Record<string, string>; flows?: Flow[] }> = {
  overview: {
    label: '개요·원칙',
    md: `
## 컵 가져오기 로봇 — ROS 2 실전 노드 설계 (최종본)

"테이블 위 컵 가져다줘" 같은 자연어 명령을 받아 **이동 + 집기 + 전달**을 스스로 하는 모바일 매니퓰레이터입니다. 확정적 알고리즘(Nav2·MoveIt 2·ros2_control)이 실행을 책임지고, 학습 모델은 **앞에서 판단을 돕거나 뒤에서 실행을 보정**만 합니다.

### 가정 (하드웨어가 다르면 이 값만 바꾼다)

| 항목 | 가정 |
| --- | --- |
| 배포판 | ROS 2 Jazzy (Ubuntu 24.04) — 속도 명령은 체인 전체 **TwistStamped** |
| 베이스 | TurtleBot3 Waffle Pi, 차동 구동, 바퀴 반경 0.033m · 간격 0.287m, 최대 0.26m/s, **LiDAR 미사용** (거리 센서는 RealSense 2대뿐) |
| 팔 | OpenMANIPULATOR-X (4축 + 그리퍼, XM430-W350), 도달 거리 약 0.38m, 가반하중 약 0.5kg |
| 제어보드 | OpenCR 1개가 바퀴·팔·IMU를 모두 연결 (turtlebot3_manipulation 구성) |
| gripper_cam | 그리퍼에 붙은 **Intel RealSense 깊이 카메라**(RGB-D), 팔과 함께 움직임 — 근접 파지용 |
| pole_cam | 폴대 고정 **Intel RealSense 깊이 카메라**(RGB-D), 전방 하향 — **인지·SLAM·장애물·octomap 전부 담당** |
| 연산 | 로봇 탑재 PC 1대 + 학습용 GPU PC 1대 (Isaac Sim / Isaac Lab) |
| 환경 | 현관–거실 실내, 마루·카펫 혼재, 의자 사이 통로 약 0.9m |
| 대표 작업 | 현관에서 4m 떨어진 **낮은 거실 테이블(높이 0.45m)** 위 컵을 집어 사람에게 전달 |

> **도달 범위 주의:** OM-X를 Waffle 상판에 얹으면 그리퍼 최고 높이가 약 0.6m 안팎입니다. 식탁(0.72~0.75m)은 닿지 않으므로, 대표 작업을 낮은 테이블로 잡거나 팔 거치대를 높여야 합니다. 높이를 바꾸면 MoveIt 도달성부터 다시 확인합니다.

### 계층과 원칙

| 계층 | 역할 | 대표 노드 | 결정 주기 | 학습 |
| --- | --- | --- | --- | --- |
| ① 작업 계획 | 무엇을, 어떤 순서로 | vlm_task_planner | 명령·최종 실패마다 (수 초) | 사전학습 VLM, 추가 학습 없음 |
| ② 임무 관리 | 검증·실행·재시도·안전 규칙 | coordinator | 이벤트마다 | 없음 |
| ③ 앞단 판단 보조 | 어떤 방식으로 할지 고르기 | grasp_scorer, rl_nav_tuner | pick 직전 1회 / 1~2초에 1회 | 지도학습 / 강화학습(또는 규칙) |
| ④ 확정 실행 | 궤적·속도 계산, 충돌 회피 | Nav2, MoveIt 2 (+MTC) | 20~100Hz | 없음 |
| ⑤ 뒷단 실행 보정 | 명령에 작은 Δ를 더해 현실 오차 보정 | rl_nav_correction, rl_arm_correction | 20Hz / 100Hz | 강화학습 (residual) |
| ⑥ 안전 | 최종 명령 제한·감속·차단 | velocity_smoother, collision_monitor, JTC 허용오차, arm_safety_monitor, 전류 한계 | 매 주기 | 없음 |
| ⑦ 하드웨어 | read → update → write | controller_manager + OpenCR | 100Hz | 없음 |

**지켜야 할 다섯 규칙**

- **보정은 범위를 제한한다.** 선속도 Δ ±0.05m/s, 각속도 Δ ±0.10rad/s, 관절 Δ ±0.05rad. 그리고 Δ를 더한 결과는 **현재 프리셋 속도 상한으로 다시 클리핑**한다.
- **안전장치는 학습 노드보다 뒤에 둔다.** RL 출력까지 포함한 최종 명령을 마지막에 거른다.
- **학습 노드는 끌 수 있어야 한다.** 노드를 내리지 않고 \`enabled:=false\`(Δ=0, 기본 프리셋)로 바꾸면 원래 시스템과 같아야 한다.
- **위는 느리고 추상적, 아래는 빠르고 구체적.** VLM은 제어 루프에 넣지 않는다.
- **판단 권한은 한 층에 하나.** 파지점 2순위 선택 같은 실행 세부는 coordinator가 하고, VLM은 작업 순서만 다시 짠다.

**토픽 이름 규칙 — 명령은 /cmd, 상태는 /state**

- **외부에서 들어오는 명령은 전부 \`/cmd/...\`.** 보내고 끝 (cmd_vel 관례 — 응답 없음). \`/cmd/user_command\` · \`/cmd/manual/cmd_vel\` · \`/cmd/manual/arm\` · \`/cmd/e_stop\` · \`/cmd/operation_mode\` · \`/cmd/map_mode\` · \`/cmd/fake_opencr/set_pose\`(테스트베드).
- **상태는 \`/state/<이름>\`, 발행은 state_manager 하나만.** 다른 노드는 구독만 한다. 상태를 바꾸고 싶으면 \`/cmd/<이름>\`을 보내고 결과는 \`/state/<이름>\`으로 본다 (\`/cmd/operation_mode\` → \`/state/operation_mode\`, \`/cmd/map_mode\` → \`/state/map_mode\`, \`/cmd/e_stop\` → \`/state/emergency\`). ROS에는 발행자 제한 기능이 없으므로 규칙으로 지키고, 테스트베드 input_manager(호스트 파일 → 토픽)는 \`/state/*\` 를 거부한다.
- **응답이 꼭 필요한 요청은 토픽이 아니라 서비스** (예: \`/map_saver/save_map\`).

### 외부 서비스 (ROS 바깥)

| | 역할 | 연결 |
| --- | --- | --- |
| 시뮬레이터 (SIL, \`lv2_module6/simulator\`) | 실기 없이 테스트베드를 돌리는 상대역. ROS 토픽을 직접 쏘지 않고 **\`lv2_module6/debug/\` 파일로** 주고받는다: 장면 렌더 (fake_camera가 읽음), 플랜트 물리 C/S (가상 시리얼), 조작 창 (명령·수동·지도·스캔), 스캔 지도 오버레이·저장 (\`ros2_ws/map/\`) | 파일 |
| ai-service | 호스트 VLM 서버. vlm_task_planner가 HTTP로 계획을 받아온다 | HTTP |
`,
  },

  arch: {
    label: '전체 아키텍처',
    md: `
## 전체 아키텍처 — 7계층

위에서 아래로 흐르고, 왼쪽이 팔, 오른쪽이 베이스입니다. 학습 노드(주황)는 ③과 ⑤에만 있고, 안전(빨강)은 항상 학습 노드 뒤에 있습니다. 실선=토픽, 굵은 선=액션, 점선=서비스·파라미터·피드백·매핑 단계 전용. 화살표 라벨은 **[종류 이모지] 이름 (메시지 타입)** 형식입니다. 어디서 시작해 어떤 순서로 흐르는지는 도식 바로 위 **▶ 흐름 따라가기**에서 상황을 골라 화살표 하나씩 따라가 보세요.

> 👆 **섹터 영역을 누르면 해당 상세 섹션으로, 노드를 누르면 노드 사전의 해당 카드로 이동합니다.**

${F}mermaid
flowchart TB
    U(((사람)))
    subgraph EXT["외부 서비스 (ROS 바깥)"]
        SIM["🖥️ simulator (SIL)<br/>장면 렌더·플랜트"]
        AIS["🖥️ ai-service<br/>호스트 VLM 서버"]
        FC["🧪 fake_camera ×2<br/>테스트베드 전용"]
    end
    subgraph S0["센서·인지"]
        subgraph SHS["물리 하드웨어 (센서)"]
            PCH{{"pole_cam<br/>RealSense RGB-D"}}
            GCH{{"gripper_cam<br/>RealSense RGB-D"}}
        end
        PC["📦 realsense2_camera<br/>pole_cam 드라이버"]
        GC["📦 realsense2_camera<br/>gripper_cam 드라이버"]
        PER["🛠️ perception"]
    end
    subgraph S1["① 작업 계획"]
        UI["🖥️ user_input<br/>콘솔 명령 입력"]
        VLM["🛠️ vlm_task_planner"]
    end
    subgraph S2["② 임무 관리"]
        CO["🛠️ coordinator"]
        SM["🛠️ state_manager<br/>상태 주인"]
    end
    subgraph S3["③ 앞단 판단 보조"]
        GS["🛠️ grasp_scorer"]
        NT["🛠️ rl_nav_tuner"]
    end
    subgraph S4["④ 확정 실행"]
        MG["📦 move_group<br/>plan + execute"]
        NAV["📦 Nav2<br/>bt_navigator · planner · controller"]
        RTAB["📦 rtabmap<br/>RGB-D SLAM<br/>매핑 · 위치추정 모드"]
        EKF["📦 robot_localization<br/>ekf_node<br/>휠 + IMU 융합"]
        COST["📦 costmap_2d<br/>voxel layer · global · local"]
    end
    subgraph S5["⑤ 뒷단 보정"]
        RLA["🛠️ rl_arm_correction<br/>chainable controller"]
        RLN["🛠️ rl_nav_correction"]
    end
    subgraph S6["⑥ 안전"]
        ASM["🛠️ arm_safety_monitor"]
        TM["📦 twist_mux<br/>자동·수동 선택"]
        VS["📦 velocity_smoother"]
        CMN["📦 collision_monitor"]
        MC["🛠️ manual_control<br/>수동 패스스루"]

    end
    subgraph S7["⑦ 하드웨어"]
        CM["📦 controller_manager<br/>JTC · gripper · diff_drive · imu"]
        subgraph SHA["물리 하드웨어 (구동)"]
            HW{{"OpenCR → 다이나믹셀<br/>팔 4축·그리퍼·바퀴 2·IMU"}}
        end
    end
    U -->|"⌨️ 명령 입력"| UI
    U -->|"🕹️ 수동 조작<br/>(조작 창)"| MC
    U -->|"🕹️ /cmd/operation_mode<br/>(수동 시작)"| SM
    SIM -->|"📁 /cmd/map_mode<br/>(SLAM 패널)"| SM
    UI -->|"✉️ /cmd/user_command<br/>(std_msgs/String)"| VLM
    VLM -->|"🌐 HTTP VLM 호출"| AIS
    AIS -->|"🌐 계획"| VLM
    UI -->|"🔊 안내<br/>“컵 가져왔어요”"| U
    SM -->|"✉️ /state/operation_mode<br/>AUTO · MANUAL"| CO
    SM -->|"✉️ /state/operation_mode<br/>AUTO · MANUAL"| MC
    MC -->|"✉️ /cmd_vel_manual<br/>(geometry_msgs/<br/>TwistStamped)"| TM
    SM -->|"✉️ /state/emergency"| TM

    SM -->|"✉️ /state/emergency"| CO
    PCH -->|"🔌 USB 3<br/>(RealSense SDK)"| PC
    GCH -->|"🔌 USB 3<br/>(RealSense SDK)"| GC
    PC -->|"✉️ /pole_cam/color ·<br/>aligned_depth_to_color<br/>(sensor_msgs/Image)"| PER
    U -->|"🖱️ 조작 창"| SIM
    U -->|"🛑 /cmd/e_stop<br/>(std_msgs/Bool)"| SM
        SIM -.->|"📁 렌더 파일"| FC
    FC -->|"✉️ 같은 토픽명<br/>(PC·GC 자리 대체)"| PER
    SIM -.->|"📁 가상 시리얼 C/S<br/>(fake_opencr — faker 기본)"| CM
    GC -->|"✉️ /gripper_cam/color ·<br/>aligned_depth_to_color<br/>(sensor_msgs/Image)"| PER
    GC -->|"✉️ /gripper_cam/depth<br/>/color/points<br/>(sensor_msgs/<br/>PointCloud2)"| GS
    PC -->|"✉️ /pole_cam/color ·<br/>aligned_depth_to_color<br/>(sensor_msgs/Image)"| RTAB
    RTAB -->|"✉️ /map · /tf map→odom<br/>(nav_msgs/<br/>OccupancyGrid ·<br/>tf2_msgs/TFMessage)"| NAV
    CM -->|"✉️ /odom · /imu<br/>(nav_msgs/Odometry ·<br/>sensor_msgs/Imu)"| EKF
    EKF -->|"✉️ /odometry/filtered<br/>(nav_msgs/Odometry)"| RTAB
    EKF -->|"✉️ /odometry/filtered ·<br/>/tf odom→base_footprint<br/>(nav_msgs/Odometry ·<br/>tf2_msgs/TFMessage)"| NAV
    PC -->|"✉️ /pole_cam/depth<br/>/color/points<br/>(sensor_msgs/<br/>PointCloud2)"| COST
    COST ---|"🧩 planner·controller<br/>서버 안 플러그인<br/>(같은 프로세스)"| NAV
    PER -->|"✉️ /tracked_objects<br/>(cupbot_interfaces/<br/>TrackedObjectArray)"| VLM
    PER -->|"✉️ /tracked_objects<br/>(cupbot_interfaces/<br/>TrackedObjectArray)"| CO
    PER -->|"✉️ /tracked_objects<br/>대상 컵 위치·크기<br/>(cupbot_interfaces/<br/>TrackedObjectArray)"| GS
    VLM -->|"✉️ /sub_goals<br/>(cupbot_interfaces/<br/>SubGoalArray)"| CO
    VLM -.->|"📁 /sub_goals 파일<br/>→ 조작 창 응답줄<br/>(VLM 거절도 say로)"| SIM
    CO -->|"✉️ /task_status<br/>(cupbot_interfaces/<br/>TaskStatus)"| VLM
    CO -.->|"📞 /score_grasps<br/>(cupbot_interfaces/srv/<br/>ScoreGrasps)"| GS
    COST -->|"✉️ /local_costmap/costmap<br/>통로 폭·최근접 장애물<br/>(nav_msgs/OccupancyGrid)"| NT
    EKF -->|"✉️ /odometry/filtered<br/>현재 속도<br/>(nav_msgs/Odometry)"| NT
    NAV -->|"✉️ /plan<br/>남은 거리<br/>(nav_msgs/Path)"| NT
    NT -.->|"✉️ /speed_limit<br/>(nav2_msgs/SpeedLimit)<br/>📞 set_parameters<br/>(rcl_interfaces/srv/<br/>SetParameters)"| NAV
    NT -->|"✉️ /speed_limit<br/>재클리핑 상한<br/>(nav2_msgs/SpeedLimit)"| RLN
    CO ==>|"🎬 /plan_kinematic_path<br/>(moveit_msgs/srv/<br/>GetMotionPlan)"| MG
    CO ==>|"🎬 /execute_trajectory<br/>(moveit_msgs/action/<br/>ExecuteTrajectory)"| MG
    CO ==>|"🎬 /navigate_to_pose<br/>(nav2_msgs/action/<br/>NavigateToPose)"| NAV
    MG ==>|"🎬 /arm_controller<br/>/follow_joint_trajectory<br/>(control_msgs/action/<br/>FollowJointTrajectory)"| CM
    CM -->|"🧩 읽기 reference<br/>JTC 목표 관절각<br/>+ 관절·그리퍼 state"| RLA
    RLA -->|"🧩 쓰기 command<br/>목표각 + Δ<br/>(±0.05rad 클리핑)"| CM
    NAV -->|"✉️ /cmd_vel_nav<br/>(geometry_msgs/<br/>TwistStamped)"| RLN
    CM -->|"✉️ /odom · /imu<br/>실제 속도·각속도<br/>(nav_msgs/Odometry ·<br/>sensor_msgs/Imu)"| RLN
    RLN -->|"✉️ /cmd_vel_corrected<br/>(geometry_msgs/<br/>TwistStamped)"| TM
    TM -->|"✉️ /cmd_vel_mux<br/>(geometry_msgs/<br/>TwistStamped)"| VS
    VS -->|"✉️ /cmd_vel_smoothed<br/>(geometry_msgs/<br/>TwistStamped)"| CMN
    CMN -->|"✉️ /cmd_vel<br/>(geometry_msgs/<br/>TwistStamped)"| CM
    %% 보이지 않는 배치 힌트: /cmd_vel 라벨이 reference 라벨을 덮지 않게 한다
    RLA ~~~ CMN
    PC -->|"✉️ /pole_cam/depth<br/>/color/points<br/>(sensor_msgs/<br/>PointCloud2)"| CMN
    CM -->|"✉️ /joint_states<br/>(sensor_msgs/JointState)"| ASM
    ASM -.->|"📞 cancel_goal<br/>이상 시에만<br/>(action_msgs/srv/<br/>CancelGoal)"| CM
    ASM -->|"✉️ /arm_safety_event<br/>(cupbot_interfaces/<br/>ArmSafetyEvent)"| CO
    CO -->|"✉️ /robot_say<br/>(std_msgs/String)"| UI
    CM -->|"🔌 쓰기 SyncWrite<br/>Goal Position·Velocity<br/>(Dynamixel Protocol 2.0)"| HW
    HW -->|"🔌 읽기 SyncRead<br/>Present Pos·Vel·Current<br/>+ IMU (OpenCR)"| CM
${CLS}
    class PER,CO,PC,GC,UI,MG,TM,MC,SM std;
    class AIS,SIM,FC ext;
    class VLM ai;
    class GS,NT,RLA,RLN rl;
    class MTC,NAV,RTAB,EKF,COST,CM std;
    class ASM,VS,CMN safe;
    class PCH,GCH,HW hw;
    style EXT fill:#ffffff,stroke:#8A97A0,stroke-dasharray:4 3
    style S0 fill:#f8fafc,stroke:#94a3b8
    style S1 fill:#f8fafc,stroke:#94a3b8
    style S2 fill:#f8fafc,stroke:#94a3b8
    style S3 fill:#f8fafc,stroke:#94a3b8
    style S4 fill:#f8fafc,stroke:#94a3b8
    style S5 fill:#f8fafc,stroke:#94a3b8
    style S6 fill:#f8fafc,stroke:#94a3b8
    style S7 fill:#f8fafc,stroke:#94a3b8
    style SHS fill:#fffde7,stroke:#f9a825,stroke-width:2px
    style SHA fill:#fffde7,stroke:#f9a825,stroke-width:2px
${F}

- **물리 하드웨어는 노란 영역, 토픽은 내지 않는다.** 장치(육각형)는 신호가 오가는 곳 가까이에 두고 같은 노란 "물리 하드웨어" 영역으로 표시했다 — 센서 쪽(카메라)과 구동 쪽(OpenCR·모터·IMU). RealSense 카메라 2대는 🔌 USB 3로 realsense2_camera 드라이버 노드에 붙고, 토픽은 드라이버 노드가 발행한다. 모터·IMU는 OpenCR → hardware interface(controller_manager) 경로로 같은 원칙을 따른다.
- **학습 노드도 입력을 보고 판단한다.** rl_nav_tuner는 local costmap(통로 폭·최근접 장애물), \`/odometry/filtered\`(현재 속도), \`/plan\`(남은 거리)을 보고 1~2초마다 프리셋 A/B/C를 고른다. rl_nav_correction은 \`/cmd_vel_nav\`가 올 때마다 \`/plan\`(경로 오차), \`/odom\`·\`/imu\`(실제 움직임), \`/speed_limit\`(재클리핑 상한)으로 Δ를 계산한다. grasp_scorer는 \`/tracked_objects\`로 대상 컵을 찾고 gripper_cam 점구름으로 후보를 매긴다.
- **rl_arm_correction은 ROS 노드가 아니다.** controller_manager 안에서 JTC 바로 뒤에 체인으로 붙는 컨트롤러 플러그인이다 (컨트롤러 탭 참고).
- **controller_manager 한 주기(100Hz)는 read → update → write.** MTC의 팔 궤적과 collision_monitor의 \`/cmd_vel\`은 언제든 도착해 다음 update에서 쓰인다. update에서 \`/joint_states\`(→ arm_safety_monitor)와 \`/odom\`·\`/imu\`(→ EKF, rl_nav_correction)를 발행하고, JTC 목표에 rl_arm_correction의 Δ를 더해 write로 보낸다. arm_safety_monitor의 궤적 취소만 주기와 무관한 비동기 호출이다. 단계별로는 **흐름 따라가기 → "팔 한 주기"**에서 볼 수 있다.
- **controller_manager는 하나.** 베이스·팔·그리퍼·IMU가 같은 OpenCR에 붙어 있으므로 hardware component 하나에 컨트롤러들을 함께 올린다.
- **LiDAR가 없으므로 /scan도 없다.** 장애물은 pole_cam PointCloud2를 Nav2 costmap(voxel layer)·collision_monitor·MoveIt octomap에 그대로 넣는다.
- **SLAM·위치추정은 RTAB-Map.** RGB-D 영상 + 휠/IMU 오도메트리로 지도를 만들고(매핑 모드), 운영 중에는 같은 DB로 위치만 추정한다(위치추정 모드). slam_toolbox·amcl은 LaserScan이 필요해서 쓰지 않는다 (Nav2·SLAM 섹션의 3-1).
- **TF 발행자는 딱 둘로 나뉜다.** map→odom은 rtabmap, odom→base_footprint는 robot_localization EKF(바퀴 \`/odom\` + \`/imu\` 융합)만 낸다. EKF의 \`/odometry/filtered\`는 rtabmap의 오도메트리 입력이자 Nav2 controller의 현재 속도 입력이다. diff_drive_controller는 \`enable_odom_tf: false\`로 TF를 내지 않는다 (베이스·TF 섹션 참고).
- **gripper_cam도 RealSense.** 파지 직전 근접 점구름을 grasp_scorer에 주고, 접근 단계의 미세 정렬에 쓴다.
`,
    links: { S0: 'sense', S1: 'plan', S2: 'plan', S3: 'learn', S4: 'nav', S5: 'learn', S6: 'base', S7: 'ctrl', SHS: 'sense', SHA: 'ctrl', U: 'scenario' },
    nodes: {
      PCH: 'realsense_pole', PC: 'realsense_pole', GCH: 'realsense_gripper', GC: 'realsense_gripper', PER: 'perception',
      UI: 'user_input', VLM: 'vlm_task_planner', CO: 'coordinator', GS: 'grasp_scorer', NT: 'rl_nav_tuner',
      MG: 'move_group', NAV: 'bt_navigator', RTAB: 'rtabmap', EKF: 'ekf', COST: 'costmap',
      RLA: 'rl_arm_correction', RLN: 'rl_nav_correction', ASM: 'arm_safety_monitor', TM: 'twist_mux', VS: 'velocity_smoother', CMN: 'collision_monitor',
      MC: 'manual_control', SM: 'state_manager',
      CM: 'controller_manager', HW: 'hw_interface',
    },
    flows: ARCH_FLOWS,
  },

  sense: {
    label: '1 센서·인지',
    md: `
## 1. 센서·인지

센서 장치(육각형)는 🔌 USB로 드라이버 노드에 연결되고, **토픽은 드라이버 노드가 발행**합니다. 카메라 드라이버가 영상·depth·camera_info를 내고, perception이 물체를 map 기준 3D로 추적합니다. gripper_cam은 팔과 함께 움직이므로 **영상 시각의 TF**로 변환해야 위치가 어긋나지 않습니다(\`lookupTransform\`에 header.stamp 사용, 메시지 필터로 동기화).


${F}mermaid
flowchart TB
    GCH{{"gripper_cam<br/>RealSense RGB-D"}}
    PCH{{"pole_cam<br/>RealSense RGB-D"}}
    GC["📦 realsense2_camera<br/>gripper_cam 드라이버"]
    PC["📦 realsense2_camera<br/>pole_cam 드라이버"]
    RSP["📦 robot_state_publisher"]
    JS(["/joint_states ← 4"])
    PER["🛠️ perception<br/>detect · fusion · tracking"]
    O2(["→ 2 vlm · coordinator · grasp_scorer"])
    O3(["→ 3 rtabmap<br/>SLAM · 위치추정"])
    O4(["→ 3 costmap · 4 octomap<br/>· 5 collision_monitor"])
    O5(["→ 2 grasp_scorer<br/>근접 파지 점구름"])
    JS --> RSP
    GCH -->|"🔌 USB 3<br/>(RealSense SDK)"| GC
    PCH -->|"🔌 USB 3<br/>(RealSense SDK)"| PC
    GC -->|"✉️ /gripper_cam/color<br/>/image_raw · camera_info<br/>(sensor_msgs/Image ·<br/>CameraInfo)"| PER
    GC -->|"✉️ /gripper_cam<br/>/aligned_depth<br/>_to_color/image_raw<br/>(sensor_msgs/Image)"| PER
    GC -->|"✉️ /gripper_cam/depth<br/>/color/points<br/>(sensor_msgs/<br/>PointCloud2)"| O5
    PC -->|"✉️ /pole_cam/color<br/>/image_raw · camera_info<br/>(sensor_msgs/Image ·<br/>CameraInfo)"| PER
    PC -->|"✉️ /pole_cam/aligned_depth<br/>_to_color/image_raw<br/>(sensor_msgs/Image)"| PER
    PC -->|"✉️ /pole_cam/depth<br/>/color/points<br/>(sensor_msgs/<br/>PointCloud2)"| O4
    PC -->|"✉️ /pole_cam/color ·<br/>aligned_depth_to_color<br/>(sensor_msgs/Image)"| O3
    RSP -->|"✉️ /tf · /tf_static<br/>(tf2_msgs/TFMessage)"| PER
    PER -->|"✉️ /tracked_objects<br/>(cupbot_interfaces/<br/>TrackedObjectArray)"| O2
${CLS}
    class PER,RSP,GC,PC std;
    class GCH,PCH hw;
    class JS,O2,O3,O4,O5 ext;
${F}

| 이름 | 종류 | 메시지 타입 | 보내는 쪽 → 받는 쪽 | 주기 · QoS |
| --- | --- | --- | --- | --- |
| /gripper_cam/color/image_raw | 토픽 | sensor_msgs/Image | realsense2_camera (gripper_cam) → perception | 15~30Hz · best_effort |
| /gripper_cam/color/camera_info | 토픽 | sensor_msgs/CameraInfo | realsense2_camera (gripper_cam) → perception | 15~30Hz |
| /gripper_cam/aligned_depth_to_color/image_raw | 토픽 | sensor_msgs/Image | realsense2_camera (gripper_cam) → perception | 15~30Hz · best_effort |
| /gripper_cam/depth/color/points | 토픽 | sensor_msgs/PointCloud2 | realsense2_camera (gripper_cam) → grasp_scorer | pick 단계에서만 |
| /pole_cam/color/image_raw | 토픽 | sensor_msgs/Image | realsense2_camera (pole_cam 드라이버) → perception | 30Hz · best_effort |
| /pole_cam/aligned_depth_to_color/image_raw | 토픽 | sensor_msgs/Image | realsense2_camera (pole_cam 드라이버) → perception, rtabmap | 30Hz · best_effort |
| /pole_cam/depth/color/points | 토픽 | sensor_msgs/PointCloud2 | realsense2_camera (\`pointcloud.enable\`) → costmap, move_group, collision_monitor | 10~15Hz (다운샘플) |
| /tf, /tf_static | 토픽 | tf2_msgs/TFMessage | robot_state_publisher, rtabmap, ekf → 전체 | 10~100Hz |
| /tracked_objects | 토픽 | 커스텀 TrackedObjectArray | perception → vlm_task_planner, coordinator, grasp_scorer | 10Hz · reliable |

- **TrackedObject 한 항목:** id, class, map 기준 pose(+공분산), 크기, 신뢰도, 마지막 관측 시각. VLM·coordinator가 같은 물체를 id로 가리킨다.
- **/scan이 없다:** LiDAR를 쓰지 않으므로 LaserScan 기반 노드(slam_toolbox, amcl)는 빠진다. 거리 정보는 전부 RealSense depth에서 온다. 굳이 스캔이 필요하면 \`pointcloud_to_laserscan\`(target_frame=base_footprint, 높이 범위 지정)을 쓰고, \`depthimage_to_laserscan\`은 하향 카메라에선 바닥을 장애물로 잡으니 쓰지 않는다.
- **RealSense 2대 운용:** 드라이버를 카메라마다 하나씩 띄우고 \`serial_no\`로 구분, \`camera_namespace:=''\`·\`camera_name:=pole_cam / gripper_cam\`으로 토픽을 위 이름에 맞춘다. 가능하면 서로 다른 USB 3 컨트롤러에 꽂고, 대역폭·CPU를 아끼려 640×480 · 15~30fps로 둔다. 둘 다 \`align_depth.enable:=true\`.
- **gripper_cam 근접 한계:** D435 계열은 최소 측정 거리가 대략 0.2~0.3m라 그리퍼가 컵에 바짝 붙으면 depth가 비어 버린다. 근접 점구름이 중요하면 D405 같은 근거리 모델을 고르거나, 점구름은 접근 시작점(약 0.3m)에서 미리 찍어 둔다.
- **gripper_cam은 움직인다:** 점구름을 쓸 때 영상 시각의 TF(gripper_cam_link)로 변환해야 팔이 움직이는 동안에도 위치가 맞는다.
`,
    nodes: {
      GCH: 'realsense_gripper', GC: 'realsense_gripper', PCH: 'realsense_pole', PC: 'realsense_pole',
      RSP: 'robot_state_publisher', JS: 'joint_state_broadcaster', PER: 'perception',
      O2: 'coordinator', O3: 'rtabmap', O4: 'costmap', O5: 'grasp_scorer',
    },
    flows: SENSE_FLOWS,
  },

  plan: {
    label: '2 계획·임무',
    md: `
## 2. 계획·임무

VLM이 작업 순서를 정하고, coordinator가 검증한 뒤 Nav2와 MoveIt에 **액션**으로 실행을 맡깁니다. 앞단 학습 노드 두 개가 여기에 붙습니다.

${F}mermaid
flowchart TB
    USER(((사람)))
    UI["🛠️ voice_ui<br/>음성인식 · TTS · 입력 UI"]
    TO(["/tracked_objects ← 1"])
    NI(["/local_costmap/costmap · /odometry/filtered<br/>· /plan ← 3·5"])
    SE(["/arm_safety_event ← 4"])
    VLM["🛠️ vlm_task_planner"]
    CO["🛠️ coordinator<br/>검증 · 실행 · 재시도 · 안전규칙"]
    GS["🛠️ grasp_scorer"]
    NT["🛠️ rl_nav_tuner"]
    O3a(["→ 3 bt_navigator"])
    O3b(["→ 3 controller_server"])
    O4a(["→ 4 move_group (MTC)"])
    USER -->|"🗣️ 말·텍스트<br/>“테이블 위 컵 가져다줘”"| UI
    UI -->|"✉️ /cmd/user_command<br/>(std_msgs/String)"| VLM
    CO -->|"✉️ /robot_say<br/>(std_msgs/String)"| UI
    UI -->|"🔊 음성 안내<br/>“컵 가져왔어요”<br/>“컵을 잡을 수 없어요”"| USER
    TO --> VLM
    TO --> CO
    SE --> CO
    VLM -->|"✉️ /sub_goals<br/>(cupbot_interfaces/<br/>SubGoalArray)"| CO
    CO -->|"✉️ /task_status<br/>(cupbot_interfaces/<br/>TaskStatus)"| VLM
    CO -.->|"📞 /score_grasps<br/>(cupbot_interfaces/srv/<br/>ScoreGrasps)"| GS
    NI --> NT
    NT -->|"✉️ /speed_limit<br/>(nav2_msgs/SpeedLimit)"| O3b
    NT -.->|"📞 /controller_server<br/>/set_parameters<br/>(rcl_interfaces/srv/<br/>SetParameters)"| O3b
    CO ==>|"🎬 /navigate_to_pose<br/>(nav2_msgs/action/<br/>NavigateToPose)"| O3a
    CO ==>|"🎬 /execute_task_solution<br/>(moveit_task_<br/>constructor_msgs/action/<br/>ExecuteTaskSolution)"| O4a
    CO -.->|"📞 /apply_planning_scene ·<br/>/clear_octomap<br/>(moveit_msgs/srv/<br/>ApplyPlanningScene ·<br/>std_srvs/srv/Empty)"| O4a
${CLS}
    class VLM ai;
    class CO,UI std;
    class GS,NT rl;
    class TO,NI,SE,O3a,O3b,O4a ext;
${F}

| 이름 | 종류 | 메시지 타입 | 보내는 쪽 → 받는 쪽 | 주기 · QoS |
| --- | --- | --- | --- | --- |
| /cmd/user_command | 토픽 | std_msgs/String | voice_ui → vlm_task_planner | 명령마다 · reliable |
| /robot_say | 토픽 | std_msgs/String | coordinator → voice_ui (TTS) | 알릴 때 · reliable |
| /sub_goals | 토픽 | 커스텀 SubGoalArray | vlm_task_planner → coordinator | 계획마다 · reliable + transient_local |
| /task_status | 토픽 | 커스텀 TaskStatus | coordinator → vlm_task_planner, UI | 단계 완료·실패 시 · reliable |
| /score_grasps | 서비스 | 커스텀 ScoreGrasps.srv | coordinator → grasp_scorer | pick 직전 1회 |
| /speed_limit | 토픽 | nav2_msgs/SpeedLimit | rl_nav_tuner → controller_server, rl_nav_correction | 프리셋 변경 시 · reliable |
| /controller_server/set_parameters | 서비스 | rcl_interfaces/srv/SetParameters | rl_nav_tuner → controller_server | 프리셋 변경 시 |
| /navigate_to_pose | 액션 | nav2_msgs/action/NavigateToPose | coordinator → bt_navigator | 이동 단계마다 |
| /execute_task_solution | 액션 | moveit_task_constructor_msgs/action/ExecuteTaskSolution | coordinator(MTC 태스크) → move_group | pick·place마다 |
| /apply_planning_scene | 서비스 | moveit_msgs/srv/ApplyPlanningScene | coordinator → move_group | pick 전 (테이블·컵 등록) |
| /clear_octomap | 서비스 | std_srvs/srv/Empty | coordinator → move_group | pick 직전 |

**coordinator가 지키는 실행 규칙**

1. **VLM 출력 검증:** 형식(JSON 스키마), 허용 동작(navigate·pick·place·say), 대상 id가 /tracked_objects에 실제로 있는지.
   - pick·place의 대상 \`tray\` = 로봇 뒤 적재함 (MISSION ③ MOVE_TO_B — 손에 들고 옮기면 인정 안 됨). 칸은 coordinator 파라미터 \`tray_slots\`(base_footprint, MoveIt 실측으로 닿는 곳 — 앞줄 x −0.095 · 뒷줄 x −0.135, y ±0.05), 실린 수는 coordinator가 센다 (꽉 차면 \`tray_full\`, 비면 \`tray_empty\`). 같은 구역에 여러 번 place하면 \`place_spacing\`(0.08m)씩 비켜 놓는다. 템플릿(오프라인): 명령에 \`MOVE_TO_B\`가 있으면 퍽(최대 4개)마다 navigate·pick·place tray → navigate 구역 → (pick tray · place 구역)×개수
2. **이동 전 팔 접기:** navigate 전에 팔을 stow 자세로. 컵을 든 채 이동하면 footprint를 키운 파라미터(\`/local_costmap/local_costmap/set_parameters\` footprint)로 바꾼다.
3. **팔은 베이스가 멈췄을 때만:** NavigateToPose 성공 후 0.5초 안정 대기 → planning scene 갱신 → pick.
4. **파지 재시도는 coordinator 몫:** grasp_scorer 후보를 점수순으로 최대 2개 시도. 모두 실패하면 그때 /task_status로 VLM에 재계획을 요청한다.
5. **재시도 한도:** 같은 단계 2회 실패면 \`/robot_say\`로 voice_ui에 보내 사람에게 음성으로 알리고 정지.

**명령 하나가 처리되는 순서** — 단계별로는 도식 위 **▶ 흐름 따라가기**에서 볼 수 있다.

- 명령 → VLM 계획 → coordinator가 /sub_goals를 받아 검증
- 이동 단계: NavigateToPose. 이동하는 동안 rl_nav_tuner가 1~2초마다 속도 상한·파라미터를 바꾼다
- pick 단계: 장면 갱신(octomap 지우기·컵 등록) → 파지 후보 점수 → MTC 실행. 실패하면 다음 후보로 재시도
- 단계가 끝날 때마다 /task_status (place까지 이동·pick을 반복한 뒤 마지막 완료 보고)
- 결과를 음성으로 알림
- 번호 없는 화살표(/tracked_objects, /arm_safety_event, 내비 상태)는 늘 들어오는 입력이다.

- grasp_scorer는 pick 직전에 한 번만 물으면 되므로 토픽보다 서비스가 맞다.
- rl_nav_tuner의 출력은 **속도 상한(/speed_limit 토픽)** 과 **DWB kinematic 파라미터(set_parameters)** 두 경로로만 나간다. 자세한 건 학습 탭의 프리셋 표 참고.
`,
    nodes: {
      UI: 'voice_ui', TO: 'perception', SE: 'arm_safety_monitor', VLM: 'vlm_task_planner', CO: 'coordinator', GS: 'grasp_scorer', NT: 'rl_nav_tuner',
      O3a: 'bt_navigator', O3b: 'controller_server', O4a: 'move_group',
    },
    flows: PLAN_FLOWS,
  },

  nav: {
    label: '3 Nav2·SLAM',
    md: `
## 3. Nav2

bt_navigator가 행동 트리로 "경로 계산 → 따라가기 → 막히면 복구"를 지휘합니다. LiDAR가 없으므로 **장애물은 pole_cam 점구름**, **위치는 RTAB-Map**(위치추정 모드)이 공급합니다. planner_server 안에 global_costmap, controller_server 안에 local_costmap과 DWB가 들어 있고, **behavior_server**가 Spin·BackUp·Wait 복구를 맡습니다(기본 BT가 호출하므로 반드시 띄운다).

${F}mermaid
flowchart TB
    IN(["NavigateToPose ← 2 coordinator"])
    TUNE(["/speed_limit · set_parameters ← 2 rl_nav_tuner"])
    PTS(["pole_cam 점구름 ← 1<br/>/pole_cam/depth/color/points"])
    RGBD(["pole_cam color · depth ← 1"])
    ODOM(["/odometry/filtered ← 5 ekf"])
    BT["📦 bt_navigator<br/>행동 트리"]
    PS["📦 planner_server<br/>+ global_costmap"]
    CS["📦 controller_server<br/>+ local_costmap · DWB"]
    BS["📦 behavior_server<br/>Spin · BackUp · Wait"]
    RTAB["📦 rtabmap<br/>위치추정 모드"]
    LMN["📦 lifecycle_manager_navigation"]
    O5a(["→ 5 rl_nav_correction"])
    IN ==> BT
    BT ==>|"🎬 /compute_path_to_pose<br/>(nav2_msgs/action/<br/>ComputePathToPose)"| PS
    BT ==>|"🎬 /follow_path<br/>(nav2_msgs/action/<br/>FollowPath)"| CS
    BT ==>|"🎬 /spin · /backup ·<br/>/wait<br/>(nav2_msgs/action/<br/>Spin · BackUp · Wait)"| BS
    RGBD --> RTAB
    ODOM --> RTAB
    RTAB -->|"✉️ /map transient_local<br/>(nav_msgs/OccupancyGrid)"| PS
    RTAB -->|"✉️ /tf map→odom<br/>(tf2_msgs/TFMessage)"| CS
    PTS --> PS
    PTS --> CS
    ODOM --> CS
    TUNE -.-> CS
    PS -->|"✉️ /plan<br/>(nav_msgs/Path)"| O5a
    CS -->|"✉️ /cmd_vel_nav<br/>(geometry_msgs/<br/>TwistStamped)"| O5a
    BS -->|"✉️ /cmd_vel_nav<br/>(geometry_msgs/<br/>TwistStamped)"| O5a
    LMN -.->|"📞 change_state<br/>(lifecycle_msgs/srv/<br/>ChangeState)"| BT
    LMN -.->|"📞 change_state<br/>(lifecycle_msgs/srv/<br/>ChangeState)"| PS
    LMN -.->|"📞 change_state<br/>(lifecycle_msgs/srv/<br/>ChangeState)"| CS
    LMN -.->|"📞 change_state<br/>(lifecycle_msgs/srv/<br/>ChangeState)"| BS
${CLS}
    class BT,PS,CS,BS,RTAB,LMN std;
    class IN,TUNE,PTS,RGBD,ODOM,O5a ext;
${F}

| 이름 | 종류 | 메시지 타입 | 보내는 쪽 → 받는 쪽 | 주기 · QoS |
| --- | --- | --- | --- | --- |
| /compute_path_to_pose | 액션 | nav2_msgs/action/ComputePathToPose | bt_navigator → planner_server | 약 1Hz 재계획 |
| /follow_path | 액션 | nav2_msgs/action/FollowPath | bt_navigator → controller_server | 경로 변경 시 |
| /spin, /backup, /wait | 액션 | nav2_msgs/action/Spin 등 | bt_navigator → behavior_server | 복구 시 |
| /map | 토픽 | nav_msgs/OccupancyGrid | rtabmap → global_costmap | 갱신 시 · **transient_local** |
| /plan | 토픽 | nav_msgs/Path | planner_server → rl_nav_correction, RViz | 계획마다 |
| /cmd_vel_nav | 토픽 | geometry_msgs/TwistStamped | controller_server, behavior_server → rl_nav_correction | 20Hz |
| */change_state | 서비스 | lifecycle_msgs/srv/ChangeState | lifecycle_manager → 관리 대상 노드 | 시작·종료 시 |

**순서** — 단계별로는 도식 위 **▶ 흐름 따라가기**에서 볼 수 있다.

- 시작할 때 1회: lifecycle_manager가 Nav2 서버들을 configure → activate 한다
- coordinator의 NavigateToPose 도착
- 경로 계산 → /plan 발행
- 경로 따라가기 → /cmd_vel_nav 20Hz. 주행 중 경로 계산~따라가기가 약 1Hz로 반복된다(재계획)
- 막혔을 때만: 복구 동작(Spin·BackUp·Wait) → 복구 중 속도 명령. 끝나면 경로 계산부터 다시
- 번호 없는 화살표(/map, map→odom, 점구름, /odometry/filtered, rl_nav_tuner)는 늘 들어오는 입력이다.

- **costmap 장애물 층:** LaserScan이 없으므로 \`voxel_layer\`(또는 STVL)에 PointCloud2를 \`observation_sources\`로 넣는다. \`min_obstacle_height 0.03\`, \`max_obstacle_height 0.40\`으로 바닥과 테이블 상판 위를 거른다.
- **시야 사각지대:** pole_cam 수평 화각은 약 87°라 옆·뒤가 안 보인다. 한 번 본 장애물이 시야 밖에서도 남도록 voxel layer의 clearing을 보수적으로 두고, BT의 **BackUp 복구는 빼거나 거리를 0.1m 이하로** 제한한다(뒤를 못 보므로 collision_monitor도 막아 주지 못한다). Spin도 짧게. 구현: \`ros_system/config/navigate_to_pose.xml\`(Nav2 기본 BT 복사본에서 BackUp만 0.10m · 0.05m/s)을 \`ros_system.launch.py\`가 \`default_nav_to_pose_bt_xml\`로 넘긴다. 기본 0.30m로는 벽에 박혀 odom이 밀리고 → 위치추정이 벽 안으로 → 출발점부터 경로 실패 → 또 후진이 반복되는 것을 테스트베드에서 봤다.
- **lifecycle:** rtabmap은 Nav2 lifecycle 관리 대상이 아니다. localization용 lifecycle_manager는 필요 없고, navigation용 하나만 둔다.
- **나머지 Nav2 서버:** smoother_server, waypoint_follower는 이 작업에 필수는 아니지만 기본 bringup에 포함돼 있어 같이 띄워도 된다. velocity_smoother·collision_monitor는 5장에서 다룬다.
- **리매핑 둘:** Nav2 기본 bringup은 controller_server 출력을 /cmd_vel_nav, velocity_smoother 입력을 /cmd_vel_nav로 잇는다. 여기서는 (1) velocity_smoother 입력을 /cmd_vel_mux로 바꿔 twist_mux를 끼우고, (2) rl_nav_correction 출력 /cmd_vel_corrected를 twist_mux 자동 입력에 잇는다. behavior_server의 출력도 같은 /cmd_vel_nav로 맞춰 복구 동작도 안전 필터를 거치게 한다. 수동(/cmd_vel_manual)은 twist_mux가 자동보다 우선, /cmd/e_stop이면 전부 차단.
- **Twist vs TwistStamped:** Jazzy에서는 Nav2 \`enable_stamped_cmd_vel: true\`, diff_drive_controller는 TwistStamped만 받는다. 체인 전체를 하나로 통일한다.

## 3-1. 지도 생성 (SLAM) — RTAB-Map

LiDAR가 없으므로 **RGB-D SLAM인 RTAB-Map**을 씁니다. pole_cam의 컬러 + 정렬된 depth와 휠/IMU 오도메트리(/odometry/filtered)로 지도를 만들고, 결과는 **rtabmap.db** 하나에 저장됩니다. 운영 때는 같은 DB를 위치추정 모드로 열어 map→odom만 냅니다. Nav2가 쓰는 2D 지도(/map)는 RTAB-Map이 depth에서 바로 만들어 줍니다.

${F}mermaid
flowchart TB
    subgraph M["① 매핑 단계 (처음 한 번)"]
        direction LR
        OP(((사람)))
        TEL["📦 teleop_twist_keyboard"]
        DD1["📦 diff_drive_controller"]
        EKF1["📦 ekf"]
        CH1{{"pole_cam<br/>RealSense RGB-D"}}
        RS1["📦 realsense2_camera"]
        RT1["📦 rtabmap<br/>매핑 모드"]
        DB[("~/.ros/rtabmap.db")]
        OP -->|"⌨️ 키보드<br/>i 전진 · , 후진<br/>j / l 회전 · k 정지"| TEL
        TEL -->|"✉️ /cmd_vel<br/>(geometry_msgs/<br/>TwistStamped)"| DD1 -->|"✉️ /odom<br/>(nav_msgs/Odometry)"| EKF1 -->|"✉️ /odometry/filtered<br/>(nav_msgs/Odometry)"| RT1
        CH1 -->|"🔌 USB 3<br/>(RealSense SDK)"| RS1
        RS1 -->|"✉️ /pole_cam/color ·<br/>aligned_depth_to_color<br/>(sensor_msgs/Image)"| RT1
        RT1 -->|"💾 저장<br/>(노드 · 그래프 · 특징점)"| DB
    end
    subgraph O["② 운영 단계 (매번)"]
        direction LR
        CH2{{"pole_cam<br/>RealSense RGB-D"}}
        RS2["📦 realsense2_camera"]
        RT2["📦 rtabmap<br/>위치추정 모드"]
        NAV2["📦 Nav2"]
        CH2 -->|"🔌 USB 3<br/>(RealSense SDK)"| RS2
        RS2 -->|"✉️ /pole_cam/color ·<br/>aligned_depth_to_color<br/>(sensor_msgs/Image)"| RT2
        RT2 -->|"✉️ /map transient_local<br/>(nav_msgs/OccupancyGrid)"| NAV2
        RT2 -->|"✉️ /tf map→odom<br/>(tf2_msgs/TFMessage)"| NAV2
    end
    DB -.->|"💾 같은 DB를 불러옴<br/>(rtabmap.db)"| RT2
${CLS}
    class TEL,DD1,EKF1,RS1,RT1,RS2,RT2,NAV2 std;
    class CH1,CH2 hw;
${F}

| 단계 | 실행 노드 | 하는 일 | 결과 |
| --- | --- | --- | --- |
| 1. 지도 생성 | rtabmap (매핑 모드, \`localization:=false\`) | 텔레옵으로 0.1~0.15m/s로 천천히 돌며 RGB-D + 오도메트리로 지도 작성. 같은 장소를 다른 방향에서도 보고, 출발점으로 돌아와 루프 클로저 | rtabmap.db, /map, map→odom TF |
| 2. 저장 | rtabmap (자동) | 종료 시 DB가 자동 저장된다. 2D 지도를 따로 보관하려면 map_saver_cli | rtabmap.db (+ home.yaml/pgm 선택) |
| 3. 운영 | rtabmap (위치추정 모드, \`localization:=true\`) | 저장된 DB로 현재 위치를 찾고 map→odom 발행. 지도는 더 키우지 않음 | /map, map→odom TF |

${F}bash
# 1) 매핑 — 기존 DB를 지우고 새로 (-d)
ros2 launch rtabmap_launch rtabmap.launch.py \
  rgb_topic:=/pole_cam/color/image_raw \
  depth_topic:=/pole_cam/aligned_depth_to_color/image_raw \
  camera_info_topic:=/pole_cam/color/camera_info \
  frame_id:=base_footprint odom_topic:=/odometry/filtered \
  visual_odometry:=false approx_sync:=true qos:=1 \
  rtabmap_args:="-d --Reg/Force3DoF true --Grid/Sensor 0" subscribe_scan_cloud:=true scan_cloud_topic:=/pole_cam/depth/color/points_filtered

# 2) (선택) Nav2·RViz용 2D 지도 파일 따로 보관
ros2 run nav2_map_server map_saver_cli -f ~/maps/home

# 3) 운영 — 같은 DB로 위치추정만
ros2 launch rtabmap_launch rtabmap.launch.py ...(위와 같은 토픽 인자) localization:=true
${F}

- **오도메트리는 휠+IMU(ekf)로:** \`visual_odometry:=false\`로 두고 /odometry/filtered를 넣는다. 카메라가 하향이라 시각 오도메트리는 바닥 질감에 약하다.
- **평면 로봇 고정:** \`Reg/Force3DoF true\`로 x·y·yaw만 추정하게 해서 기울어짐 오차를 막는다.
- **지도 품질 팁:** 화각이 좁으므로 천천히, 같은 공간을 여러 방향에서 본다. 흰 벽·유리처럼 특징이 없는 곳은 루프 클로저가 안 되니 근처 가구를 함께 비추며 지나간다. 조명이 크게 다르면(낮/밤) 위치 찾기가 약해지니 두 조건 모두에서 매핑해 둔다.
- **시작 위치:** 위치추정 모드는 처음 몇 초간 지도와 맞는 장면을 찾아야 map→odom이 나온다. 그 전에는 Nav2 목표를 보내지 않는다(coordinator가 TF를 기다림).
- **가구가 크게 바뀌면** 다시 매핑한다. 의자처럼 자주 움직이는 물체는 costmap이 실시간 점구름으로 잡는다.
- **대안:** \`pointcloud_to_laserscan\`으로 가짜 스캔을 만들어 slam_toolbox + amcl을 쓸 수도 있지만, 화각 87°의 짧은 스캔이라 매칭이 자주 실패한다. RGB-D만 있다면 RTAB-Map이 표준 선택이다.
`,
    nodes: {
      IN: 'coordinator', TUNE: 'rl_nav_tuner', PTS: 'realsense_pole', RGBD: 'realsense_pole', ODOM: 'ekf',
      BT: 'bt_navigator', PS: 'planner_server', CS: 'controller_server', BS: 'behavior_server', RTAB: 'rtabmap',
      LMN: 'lifecycle_manager', O5a: 'rl_nav_correction',
      TEL: 'teleop', DD1: 'diff_drive_controller', EKF1: 'ekf', CH1: 'realsense_pole', RS1: 'realsense_pole',
      CH2: 'realsense_pole', RS2: 'realsense_pole', RT1: 'rtabmap', RT2: 'rtabmap', NAV2: 'bt_navigator',
    },
    flows: NAV_FLOWS,
  },

  arm: {
    label: '4 팔·MoveIt',
    md: `
## 4. 팔: MoveIt 2 + MTC + ros2_control

pick·place는 MoveIt Task Constructor(MTC) 태스크로 짭니다. 접근(직선) → 그리퍼 열기 → 파지 → **컵 attach** → 들어올리기(직선) → 후퇴를 한 번에 계획하고, move_group이 \`arm_controller\`(JointTrajectoryController)에 궤적을 넘깁니다. controller_manager 안쪽은 토픽이 아니라 같은 프로세스의 메모리로 연결됩니다.

${F}mermaid
flowchart TB
    IN(["ExecuteTaskSolution ← 2"])
    SC(["/apply_planning_scene · /clear_octomap ← 2"])
    PCD(["/pole_cam/depth/color/points ← 1"])
    MG["📦 move_group<br/>계획 · 충돌검사 · octomap"]
    ASM["🛠️ arm_safety_monitor<br/>전류 기반 접촉 감지"]
    subgraph CM["controller_manager (프로세스 내부 100Hz)"]
        JTC["📦 arm_controller<br/>JTC + 경로 허용오차"]
        RAC["🛠️ rl_arm_correction<br/>chainable controller"]
        GRC["📦 gripper_controller"]
        JSB["📦 joint_state_broadcaster"]
        HWI["📦 turtlebot3_manipulation<br/>hardware interface"]
        JTC -->|"🧩 reference interface 관절각<br/>(double)"| RAC
        RAC -->|"🧩 command interface<br/>(double)"| HWI
        GRC -->|"🧩 command interface<br/>(double)"| HWI
        HWI -->|"🧩 state interface<br/>(double)"| JTC
        HWI -->|"🧩 state interface<br/>joint1~4 position·velocity<br/>(double)"| RAC
        HWI -->|"🧩 state interface<br/>gripper position·effort<br/>(파지 여부 판단)"| RAC
        HWI -->|"🧩 state interface<br/>(double)"| JSB
    end
    MOT{{"OpenCR → 다이나믹셀"}}
    O1(["→ 1 robot_state_publisher · move_group"])
    O2(["→ 2 coordinator"])
    IN ==> MG
    SC -.-> MG
    PCD --> MG
    MG ==>|"🎬 /arm_controller<br/>/follow_joint_trajectory<br/>(control_msgs/action/<br/>FollowJointTrajectory)"| JTC
    MG ==>|"🎬 /gripper_controller<br/>/gripper_cmd<br/>(control_msgs/action/<br/>GripperCommand)"| GRC
    HWI -->|"🔌 쓰기 SyncWrite<br/>Goal Position<br/>(관절 4 · 그리퍼)"| MOT
    MOT -->|"🔌 읽기 SyncRead<br/>Present Pos·Vel·Current<br/>(Current → effort)"| HWI
    JSB -->|"✉️ /joint_states<br/>(sensor_msgs/JointState)"| O1
    JSB -->|"✉️ /joint_states effort<br/>(sensor_msgs/JointState)"| ASM
    ASM -.->|"📞 follow_joint_trajectory<br/>/_action/cancel_goal<br/>(action_msgs/srv/<br/>CancelGoal)"| JTC
    ASM -->|"✉️ /arm_safety_event<br/>(cupbot_interfaces/<br/>ArmSafetyEvent)"| O2
${CLS}
    class MG,JTC,GRC,JSB,HWI std;
    class RAC rl;
    class ASM safe;
    class MOT hw;
    class IN,SC,PCD,O1,O2 ext;
${F}

**순서** — 단계별로는 도식 위 **▶ 흐름 따라가기**에서 볼 수 있다.

- coordinator가 MTC 태스크 실행 요청 (장면 갱신은 그 전에 2장 pick 단계에서 끝남)
- MTC 단계마다 팔 궤적(JTC) 또는 그리퍼 명령 중 하나를 보낸다. 접근 → 그리퍼 열기 → 파지 → … 순서로 번갈아
- controller_manager 100Hz 한 주기 (read → update → write)
  - read: 다이나믹셀에서 위치·속도·전류를 읽는다
  - 읽은 값이 state interface로 각 컨트롤러에 보인다 (같은 메모리)
  - update: joint_state_broadcaster가 /joint_states 발행
  - update: JTC가 이번 주기 목표 관절각을 rl_arm_correction의 reference로 넘긴다
  - update: rl_arm_correction(목표각 + Δ)과 gripper_controller가 command를 쓴다
  - write: 다이나믹셀로 보내고 다음 주기 read로
- 이상 시에만: arm_safety_monitor가 /joint_states의 전류를 보고 접촉을 찾으면 궤적 취소 → coordinator에 보고

| 이름 | 종류 | 메시지 타입 | 보내는 쪽 → 받는 쪽 | 주기 |
| --- | --- | --- | --- | --- |
| /arm_controller/follow_joint_trajectory | 액션 | control_msgs/action/FollowJointTrajectory | move_group → arm_controller | 궤적마다 |
| /gripper_controller/gripper_cmd | 액션 | control_msgs/action/GripperCommand | move_group(MTC) → gripper_controller | 잡기·놓기 |
| rl_arm_correction/jointN/position | reference 인터페이스 | double | arm_controller → rl_arm_correction | 100Hz |
| jointN/position (command·state) | 하드웨어 인터페이스 | double | 컨트롤러 ↔ hardware interface | 100Hz |
| /joint_states | 토픽 | sensor_msgs/JointState | joint_state_broadcaster → robot_state_publisher, move_group, arm_safety_monitor | 100Hz |

### 4-1. 파지 계획에서 꼭 챙길 것

- **4축 팔의 한계:** OM-X는 4자유도라 임의의 6D 자세를 못 만든다. grasp 후보는 IK로 도달 가능한 것만 남기고, IK 솔버는 위치 위주(pick_ik 등)를 쓴다. "옆에서 수평" 파지는 팔 평면 안에 컵이 있어야 가능하므로, coordinator가 베이스를 컵 방향으로 정렬해 세운다.
- **octomap 속 목표 컵:** pole_cam 포인트클라우드에는 목표 컵도 voxel로 들어간다. 그대로면 그리퍼 접근이 충돌로 거부된다. pick 직전 /clear_octomap → 컵·테이블을 CollisionObject로 등록 → MTC에서 그리퍼와 컵의 충돌을 허용(ACM)한다.
- **잡은 뒤 attach:** 컵을 AttachedCollisionObject로 gripper_link에 붙여야 들고 움직이는 궤적에서 컵이 고려된다. place 후 detach.
- **베이스가 움직였으면 장면 초기화:** octomap은 map 기준으로 쌓이므로 이동 뒤 낡은 voxel이 남는다. 매 pick 전에 지운다.

### 4-2. 팔 충돌 처리 — 세 겹

MoveIt은 궤적을 만들 때 한 번 검사합니다. 실행 중 끼어든 물체, 등록 안 된 물체, rl_arm_correction의 Δ는 계획 검사로 못 잡으므로 실행·하드웨어 층으로 보강합니다.

| 층 | 수단 | 검사 시점 | 잡는 것 | 구현 |
| --- | --- | --- | --- | --- |
| 1. 계획 | planning scene + octomap | 궤적 생성 시 | 테이블·컵·자기 충돌, 보이는 미등록 물체 | move_group 설정 |
| 2a. 실행 (추종) | JTC \`constraints\` 경로·목표 허용오차 | 매 주기 | 추종 오차가 커진 상황 (막힘·끼임) | JTC YAML — 넘으면 JTC가 스스로 abort |
| 2b. 실행 (전류) | arm_safety_monitor | 100Hz | 사람 손처럼 실행 중 생긴 접촉 | 직접 작성 |
| 3. 하드웨어 | 속도·가속도 스케일 0.3~0.5, 다이나믹셀 전류 한계 | 항상 | 부딪혔을 때 충격 크기 | 설정 |

**arm_safety_monitor 동작**

1. **입력:** /joint_states의 effort(= 다이나믹셀 Present Current). 하드웨어 인터페이스가 effort state interface를 내보내도록 설정해야 실린다.
2. **판단:** 관절별 기준 전류 대비 임계치 초과가 0.1초 이상 이어지면 접촉. 컵을 든 상태를 포함해 정상 동작 전류를 먼저 기록하고 그보다 충분히 높게 잡는다.
3. **정지:** \`/arm_controller/follow_joint_trajectory/_action/cancel_goal\`로 진행 중 goal 전체를 취소 → JTC가 현재 자세 유지.
4. **보고:** /arm_safety_event → coordinator가 단계 실패로 처리.

\`\`\`yaml
# arm_controller (JTC) — 추종 오차 감지는 직접 짜지 않고 내장 기능으로
arm_controller:
  ros__parameters:
    joints: [joint1, joint2, joint3, joint4]
    command_joints:            # 체인: 하드웨어 대신 rl_arm_correction의 reference에 쓴다
      - rl_arm_correction/joint1
      - rl_arm_correction/joint2
      - rl_arm_correction/joint3
      - rl_arm_correction/joint4
    command_interfaces: [position]
    state_interfaces: [position, velocity]
    constraints:
      stopped_velocity_tolerance: 0.02
      goal_time: 0.5
      joint2: { trajectory: 0.10, goal: 0.03 }   # 경로 중 0.1rad 넘게 벗어나면 abort
\`\`\`
`,
    links: { CM: 'ctrl' },
    nodes: {
      IN: 'coordinator', SC: 'coordinator', PCD: 'realsense_pole', MG: 'move_group', ASM: 'arm_safety_monitor',
      JTC: 'arm_controller', RAC: 'rl_arm_correction', GRC: 'gripper_controller', JSB: 'joint_state_broadcaster',
      HWI: 'hw_interface', MOT: 'hw_interface', O1: 'robot_state_publisher', O2: 'coordinator',
    },
    flows: ARM_FLOWS,
  },

  base: {
    label: '5 베이스',
    md: `
## 5. 베이스: 보정 → 다듬기 → 안전 → 구동

속도 명령은 RL 보정, velocity_smoother(가속 제한), collision_monitor(충돌 감속·정지) 순서로 지나간 뒤 diff_drive_controller로 들어갑니다. 바퀴 오도메트리와 IMU는 **robot_localization EKF**가 융합해 odom→base_footprint를 냅니다.

${F}mermaid
flowchart TB
    CIN(["/cmd_vel_nav ← 3"])
    PIN(["/plan ← 3"])
    SL(["/speed_limit ← 2"])
    PTS(["pole_cam 점구름 ← 1<br/>/pole_cam/depth/color/points"])
    RNC["🛠️ rl_nav_correction<br/>cmd + Δ → 상한 클리핑"]
    VS["📦 velocity_smoother"]
    CMN["📦 collision_monitor"]
    EKF["📦 robot_localization ekf"]
    subgraph CM["controller_manager (프로세스 내부)"]
        DD["📦 diff_drive_controller"]
        IMUB["📦 imu_sensor_broadcaster"]
        BHW["📦 hardware interface"]
        DD -->|"🧩 command interface<br/>(double)"| BHW
        BHW -->|"🧩 state interface<br/>(double)"| DD
        BHW -->|"🧩 state interface<br/>(double)"| IMUB
    end
    WM{{"바퀴 모터 ×2 · IMU (OpenCR)"}}
    O3(["→ 3 Nav2 · 2 rl_nav_tuner"])
    CIN --> RNC
    PIN --> RNC
    SL --> RNC
    RNC -->|"✉️ /cmd_vel_corrected<br/>(geometry_msgs/<br/>TwistStamped)"| VS
    VS -->|"✉️ /cmd_vel_smoothed<br/>(geometry_msgs/<br/>TwistStamped)"| CMN
    PTS --> CMN
    CMN -->|"✉️ /cmd_vel<br/>(geometry_msgs/<br/>TwistStamped)"| DD
    BHW -->|"🔌 쓰기 SyncWrite<br/>Goal Velocity<br/>(바퀴 2개)"| WM
    WM -->|"🔌 읽기 SyncRead<br/>Present Pos·Vel (바퀴)<br/>+ IMU 자세·각속도·가속도"| BHW
    DD -->|"✉️ /odom<br/>(nav_msgs/Odometry)"| EKF
    IMUB -->|"✉️ /imu<br/>(sensor_msgs/Imu)"| EKF
    IMUB -->|"✉️ /imu<br/>(sensor_msgs/Imu)"| RNC
    DD -->|"✉️ /odom<br/>(nav_msgs/Odometry)"| RNC
    EKF -->|"✉️ /odometry/filtered ·<br/>/tf odom→base_footprint<br/>(nav_msgs/Odometry ·<br/>tf2_msgs/TFMessage)"| O3
${CLS}
    class VS,EKF,DD,IMUB,BHW std;
    class RNC rl;
    class CMN safe;
    class WM hw;
    class CIN,PIN,SL,PTS,O3 ext;
${F}

**순서** — 단계별로는 도식 위 **▶ 흐름 따라가기**에서 볼 수 있다.

- 속도 명령 체인 (20Hz): Nav2 명령 → RL 보정 → 가속 제한 → 충돌 감시 → diff_drive_controller
- controller_manager 한 주기 (read → update → write)
  - read: 바퀴 위치·속도와 IMU를 읽는다
  - 읽은 값이 state interface로 diff_drive·imu broadcaster에 보인다
  - update: /odom, /imu 발행. rl_nav_correction은 이 값을 **다음 보정 계산**에 쓴다 (피드백)
  - update: diff_drive가 /cmd_vel로 바퀴 목표 속도를 쓴다
  - write: 모터로 보내고 다음 주기 read로
- EKF가 /odom·/imu를 융합해 /odometry/filtered와 odom→base_footprint TF를 낸다

| 이름 | 종류 | 메시지 타입 | 보내는 쪽 → 받는 쪽 | 주기 |
| --- | --- | --- | --- | --- |
| /cmd_vel_corrected | 토픽 | geometry_msgs/TwistStamped | rl_nav_correction → twist_mux (자동 입력) | 20Hz |
| /cmd_vel_manual | 토픽 | geometry_msgs/TwistStamped | manual_control → twist_mux (자동보다 우선) | 수동 때만 |
| /cmd_vel_mux | 토픽 | geometry_msgs/TwistStamped | twist_mux → velocity_smoother (/state/emergency ← /cmd/e_stop 이면 차단) | 20Hz |
| /cmd_vel_smoothed | 토픽 | geometry_msgs/TwistStamped | velocity_smoother → collision_monitor | 20Hz |
| /cmd_vel | 토픽 | geometry_msgs/TwistStamped | collision_monitor → diff_drive_controller | 20Hz |
| /odom | 토픽 | nav_msgs/Odometry | diff_drive_controller → ekf, rl_nav_correction | 50Hz |
| /imu | 토픽 | sensor_msgs/Imu | imu_sensor_broadcaster → ekf, rl_nav_correction | 100Hz · best_effort |
| /odometry/filtered | 토픽 | nav_msgs/Odometry | ekf → rtabmap, controller_server, rl_nav_tuner | 50Hz |

- **diff_drive_controller 토픽 이름:** 기본은 \`/diff_drive_controller/cmd_vel\`, \`/diff_drive_controller/odom\`. launch에서 /cmd_vel, /odom으로 리매핑한다.
- **odom TF는 EKF가:** diff_drive_controller의 \`enable_odom_tf: false\`, ekf의 \`publish_tf: true\`. 둘 다 내면 TF가 싸운다.
- **collision_monitor 설정 예:** 다각형 3개 — approach(1.0초 뒤 충돌 예상 시 감속), slowdown(0.3m 안 40%), stop(0.15m 안 정지). 입력은 pole_cam PointCloud2 하나(바닥 제거 높이 0.03~0.40m). **전방 화각 안만 지켜 주므로** 후진·제자리 회전은 behavior_server 설정에서 짧게 제한한다.
- **rl_nav_correction의 마지막 줄:** Δ를 더한 뒤 |v| ≤ min(프리셋 상한, /speed_limit), |ω| ≤ max_vel_theta로 다시 자른다. 입력이 0.2초 넘게 끊기면 Δ=0으로 통과만 시킨다.
`,
    links: { CM: 'ctrl' },
    nodes: {
      CIN: 'controller_server', PIN: 'planner_server', SL: 'rl_nav_tuner', PTS: 'realsense_pole', RNC: 'rl_nav_correction',
      VS: 'velocity_smoother', CMN: 'collision_monitor', EKF: 'ekf', DD: 'diff_drive_controller',
      IMUB: 'imu_sensor_broadcaster', BHW: 'hw_interface', WM: 'hw_interface', O3: 'bt_navigator',
    },
    flows: BASE_FLOWS,
  },

  tf: {
    label: '6 TF·QoS',
    md: `
## 6. TF 트리

모든 좌표가 나무 하나로 이어져야 perception의 컵 위치를 Nav2와 MoveIt이 같은 좌표로 씁니다.

${F}mermaid
flowchart TB
    MAP["map"]
    ODOM["odom"]
    FP["base_footprint"]
    BASE["base_link"]
    IMU["imu_link"]
    POLE["pole_cam_link → optical"]
    ARM["link1 … link5"]
    GRIP["end_effector_link · gripper"]
    GCAM["gripper_cam_link → optical"]
    MAP -->|"✉️ /tf ·<br/>rtabmap<br/>(tf2_msgs/TFMessage)"| ODOM
    ODOM -->|"✉️ /tf ·<br/>robot_localization ekf<br/>(tf2_msgs/TFMessage)"| FP
    FP -->|"✉️ /tf_static ·<br/>robot_state_publisher<br/>(tf2_msgs/TFMessage)"| BASE
    BASE -->|"✉️ /tf_static ·<br/>robot_state_publisher<br/>(tf2_msgs/TFMessage)"| IMU
    BASE -->|"✉️ /tf_static ·<br/>robot_state_publisher<br/>(tf2_msgs/TFMessage)"| POLE
    BASE -->|"✉️ /tf ·<br/>robot_state_publisher<br/>← /joint_states<br/>(tf2_msgs/TFMessage)"| ARM
    ARM -->|"✉️ /tf ·<br/>robot_state_publisher<br/>← /joint_states<br/>(tf2_msgs/TFMessage)"| GRIP
    GRIP -->|"✉️ /tf_static ·<br/>robot_state_publisher<br/>(tf2_msgs/TFMessage)"| GCAM
${F}

| 변환 | 발행자 | 성격 |
| --- | --- | --- |
| map → odom | rtabmap (매핑·위치추정 모드 모두) | 가끔 점프 (루프 클로저·재위치 추정) |
| odom → base_footprint | robot_localization ekf | 연속, 드리프트 있음 |
| base_footprint → base_link → 센서·팔 | robot_state_publisher (URDF) | 고정 또는 /joint_states로 변함 |
| *_link → *_optical_frame | robot_state_publisher | 고정 (카메라 광학 좌표: z 앞, x 오른쪽, y 아래) |

- Nav2 \`robot_base_frame\`, ekf \`base_link_frame\`, MoveIt 가상 조인트의 부모를 **모두 base_footprint**로 통일한다 (TurtleBot3 관례).
- MoveIt planning frame은 base_footprint. 컵·테이블은 map 기준으로 받지만, 베이스가 멈춘 뒤 등록하므로 rtabmap 루프 클로저 점프 영향을 안 받는다.

## QoS 정리

| 데이터 | Reliability | Durability | Depth | 이유 |
| --- | --- | --- | --- | --- |
| 카메라·점구름·IMU | best_effort | volatile | 1~5 | 최신 값만 의미 있음, 재전송이 지연만 키움 |
| /cmd_vel 체인 | reliable | volatile | 1 | 명령 유실 방지, 오래된 명령은 버림 |
| /map, /tf_static | reliable | transient_local | 1 | 늦게 붙는 노드도 받아야 함 |
| /sub_goals, /task_status | reliable | transient_local | 10 | 재시작한 coordinator·UI도 마지막 계획을 받음 |
| /tracked_objects | reliable | volatile | 5 | 매 주기 갱신, 누락 시 다음 값으로 충분 |

> best_effort 발행자를 reliable 구독자가 받으면 **연결 자체가 안 된다.** 센서 토픽 구독은 \`rclcpp::SensorDataQoS()\` / \`qos_profile_sensor_data\`를 쓴다.
`,
  },

  ctrl: {
    label: 'ros2_control 연결',
    md: `
## ros2_control 연결 — 이 로봇 요약

controller_manager는 장치를 모릅니다. 장치별 연결·전송은 **하드웨어 플러그인**이 맡고, controller_manager는 그 플러그인과 컨트롤러 플러그인을 정해진 순서로 불러 쓰기만 합니다 — "인터페이스만 맞춰라, 내가 불러다 쓸게." 개념·한 주기 흐름·플러그인 만들기·연결 5단계는 **ros2_control 탭**에 따로 정리했습니다.

<p><button class="rd-tab" data-concept="ros2control" data-cs="concept">📘 ros2_control 탭 — 개념부터 보기 →</button> <button class="rd-tab" data-concept="ros2control" data-cs="flow">▶ 한 주기 흐름 스텝퍼</button> <button class="rd-tab" data-concept="ros2control" data-cs="connect">🔧 연결 5단계</button> <button class="rd-tab" data-concept="ros2control" data-cs="robot">🤖 이 로봇 적용</button></p>

${F}mermaid
flowchart TB
    URDF["📄 URDF 속 ros2_control 태그<br/>플러그인 · 포트 · 관절별 인터페이스"]
    YAML["📄 controllers.yaml<br/>컨트롤러 이름 · 타입 · 파라미터"]
    SP["📦 spawner<br/>컨트롤러 올리기 · 켜기"]
    subgraph CMG["📦 controller_manager (ros2_control_node · 100Hz)"]
        subgraph CTRL["컨트롤러 — 장치를 모름"]
            C1["arm_controller (JTC)"]
            C2["rl_arm_correction"]
            C3["diff_drive_controller"]
            C4["broadcaster들"]
        end
        RM["Resource Manager<br/>인터페이스 목록 · 쓰기 소유권"]
        subgraph HWC["hardware component — 장치마다 하나"]
            P1["📦 TurtleBot3Manipulation<br/>SystemHardware<br/>(fork: effort 추가)"]
            P2["예: 다른 모터용 플러그인<br/>(CAN · EtherCAT …)"]
        end
    end
    D1{{"OpenCR → 다이나믹셀<br/>팔·그리퍼·바퀴·IMU"}}
    D2{{"다른 장치"}}
    URDF -->|"❶ ✉️ /robot_description<br/>(std_msgs/String)"| RM
    YAML -->|"❷ ⚙️ 파라미터 파일"| CTRL
    SP -->|"❸ 📞 load · switch_controller<br/>(controller_manager_msgs)"| CTRL
    CTRL -->|"❼ 🧩 command 쓰기<br/>(double)"| RM
    RM -->|"❻ 🧩 state 읽기<br/>(double)"| CTRL
    RM -->|"❽ 🧩 write()"| HWC
    HWC -->|"❺ 🧩 read()"| RM
    P1 -->|"❾ 🔌 쓰기 SyncWrite<br/>(Dynamixel Protocol 2.0)"| D1
    D1 -->|"❹ 🔌 읽기 SyncRead<br/>(Dynamixel Protocol 2.0)"| P1
    P2 -.->|"🔌 장치 고유 프로토콜"| D2
${CLS}
    class C1,C3,C4,RM,P1,P2,SP std;
    class C2 rl;
    class D1,D2 hw;
    class URDF,YAML ext;
${F}

**화살표 순서 (❶~❾)**

- ❶~❸ 시작할 때 1회: URDF로 하드웨어 플러그인을 올리고 → 컨트롤러 파라미터를 읽고 → spawner가 컨트롤러를 올려 켠다
- ❹~❾ 100Hz 반복 (read → update → write)
  - ❹~❺ read: 장치에서 읽은 값을 hardware component가 state interface에 채운다
  - ❻~❼ update: 컨트롤러가 state를 읽고 command를 쓴다
  - ❽~❾ write: command를 장치로 보내고 다음 주기 ❹로
- 다른 장치용 플러그인(점선)은 예시라 번호가 없다.

### 이 로봇에서 연결하는 것

| 항목 | 값 |
| --- | --- |
| 하드웨어 플러그인 | turtlebot3_manipulation_hardware/TurtleBot3ManipulationSystemHardware — **fork해서 effort 추가** |
| URDF param | opencr_id 200 · opencr_usb_port /dev/ttyACM0 · opencr_baud_rate 1000000 |
| 관절·센서 | wheel_left/right_joint · joint1~4 · gripper_left/right_joint · imu · battery |
| 컨트롤러 | joint_state_broadcaster · imu_sensor_broadcaster · diff_drive_controller · rl_arm_correction(chainable) · arm_controller(JTC, 체인) · gripper_controller |
| spawner 순서 | … → **rl_arm_correction → arm_controller** → gripper_controller (체인은 뒤에서부터) |

> ⚠️ 공식 TurtleBot3 Manipulation 플러그인(jazzy)은 팔·그리퍼의 position·velocity만 내보내고 **effort(전류)는 내보내지 않는다.** OpenCR 제어 테이블의 present_current를 읽어 effort로 내보내도록 fork해야 arm_safety_monitor·rl_arm_correction이 동작한다 (검토 반영 25번).

### 수치 변환 (다이나믹셀 XM430)

| 변환 | 계산 | 결과 |
| --- | --- | --- |
| 관절 0.65rad → 틱 | 2048 + 0.65 × 4096 / 2π | 약 2472 |
| 틱 2468 → rad | (2468 − 2048) × 2π / 4096 | 약 0.644rad |
| 바퀴 2.72rad/s → 속도 단위 | 2.72 × 60 / 2π = 26.0rpm, ÷ 0.229 | 약 113 |

`,
    links: { CMG: 'ctrl', HWC: 'ctrl', CTRL: 'ctrl' },
    nodes: {
      C1: 'arm_controller', C2: 'rl_arm_correction', C3: 'diff_drive_controller', C4: 'joint_state_broadcaster',
      RM: 'controller_manager', P1: 'hw_interface', D1: 'hw_interface',
    },
  },

  nodes: {
    label: '직접작성·제공',
    md: `
## 직접 작성 노드와 제공 노드

전체 약 25개 노드 중 직접 작성은 8개입니다. 나머지는 생태계 패키지를 가져와 설정하고 연결하는 일입니다.

| 노드 | 구분 | 형태 | 핵심 작업 |
| --- | --- | --- | --- |
| perception | 직접 | ROS 2 노드 (Python/C++) | 검출 모델 추론, 3D 위치, ID 추적, /tracked_objects |
| vlm_task_planner | 직접 | ROS 2 노드 | VLM 호출, 프롬프트, JSON 출력 파싱 → /sub_goals |
| coordinator | 직접 | ROS 2 노드 (BT 권장: BehaviorTree.CPP) | 계획 검증, 액션 호출, 실행 규칙, 재시도, MTC 태스크 구성 |
| grasp_scorer | 직접 | ROS 2 서비스 노드 | 모델 로드, IK 가능 후보만 채점, /score_grasps 응답 |
| rl_nav_tuner | 직접 | ROS 2 노드 | 상황 요약 → 프리셋 선택 → /speed_limit + set_parameters |
| rl_nav_correction | 직접 | ROS 2 노드 (C++ 권장) | 관측 구성, 정책 추론, Δ 제한, 상한 클리핑, 끊김 시 Δ=0 |
| rl_arm_correction | 직접 | ros2_control chainable controller (C++) | reference에 Δ 더하기, enabled 파라미터 |
| arm_safety_monitor | 직접 | ROS 2 노드 | 전류로 접촉 감지, 궤적 취소, coordinator 보고 |
| realsense2_camera ×2 (pole_cam, gripper_cam) | 제공 | Intel RealSense ROS 2 래퍼 | 장치를 USB 3로 열고 토픽 발행 — serial_no, camera_name, 해상도·fps, align_depth, pointcloud 켜기 |
| robot_state_publisher | 제공 | ROS 2 기본 | URDF에 pole_cam·gripper_cam 추가 |
| robot_localization (ekf) | 제공 | ROS 2 패키지 | /odom + /imu 융합, odom TF 발행 |
| bt_navigator, planner_server, controller_server, behavior_server, velocity_smoother, collision_monitor, lifecycle_manager | 제공 | Nav2 | nav2_params.yaml (voxel layer에 점구름), 리매핑 |
| rtabmap | 제공 | rtabmap_ros | 매핑/위치추정 모드, RGB-D 토픽·오도메트리 입력, Reg/Force3DoF |
| move_group + MTC | 제공 | MoveIt 2 | Setup Assistant 설정 패키지, pick_ik, octomap 센서, 속도 스케일 |
| controller_manager, JTC, gripper_controller, diff_drive_controller, imu_sensor_broadcaster, joint_state_broadcaster | 제공 | ros2_control | 컨트롤러 YAML, URDF ros2_control 태그 |
| hardware interface | 제공 | turtlebot3_manipulation | 포트, baud rate, 관절 ID |

### 노드 외에 직접 만드는 것

- **커스텀 인터페이스 패키지 (\`cupbot_interfaces\`):** TrackedObject(Array), SubGoal(Array), TaskStatus, ArmSafetyEvent, ScoreGrasps.srv
- **launch 파일:** 전체 기동, 리매핑 (velocity_smoother 입력 → /cmd_vel_mux, diff_drive_controller 토픽 → /cmd_vel·/odom), 학습 노드 on/off 인자
- **설정 파일:** nav2_params.yaml, ekf.yaml, controllers.yaml, collision_monitor 다각형, MoveIt 설정 패키지
- **Isaac Lab 환경 코드:** 관측·행동·보상·랜덤화 정의 (ROS 노드 아님)

### 패키지 구성 예

${F}text
cupbot_ws/src/
├── cupbot_interfaces/      # msg · srv
├── cupbot_description/     # URDF (TB3 + OM-X + 카메라 2대) · ros2_control 태그
├── cupbot_bringup/         # launch · nav2/ekf/controllers yaml
├── cupbot_moveit_config/   # Setup Assistant 결과
├── cupbot_perception/      # perception
├── cupbot_mission/         # vlm_task_planner · coordinator
├── cupbot_learning/        # grasp_scorer · rl_nav_tuner · rl_nav_correction · arm_safety_monitor
└── cupbot_controllers/     # rl_arm_correction (pluginlib C++)
${F}
`,
  },

  catalog: {
    label: '노드 사전',
    md: '',
  },

  learn: {
    label: '학습 설계',
    md: `
## 학습 개념: 지도학습 vs 강화학습

지도학습은 정답이 붙은 문제를 보고 맞히도록 배우고, 강화학습은 직접 행동하며 받은 점수로 더 좋은 행동을 찾습니다. **정답을 만들 수 있으면 더 쉽고 안정적인 지도학습을 먼저** 씁니다.

| 기준 | 지도학습 | 강화학습 |
| --- | --- | --- |
| 배우는 것 | 입력 → 정답 예측 | 상황 → 행동 (정책) |
| 신호 | 정답 라벨 | 보상 |
| 데이터 | 미리 모은 데이터 | 학습 중 환경에서 생성 |
| 결과 | 시도 한 번에 결과 한 번 | 여러 행동이 이어진 뒤 쌓임 |
| Isaac의 역할 | 데이터 공장 (Isaac Sim) | 연습장 (Isaac Lab, 학습 내내 실행) |
| 이 시스템 | perception, grasp_scorer | rl_nav_correction, rl_arm_correction, (rl_nav_tuner) |

**파지는 왜 지도학습인가** — 잡기 한 번에 성공·실패가 한 번 확정되고, 모델은 후보의 결과만 예측할 뿐 선택은 coordinator가 한다. 바퀴 보정은 초당 20번 Δ를 주고 경로 이탈의 원인을 여러 Δ에 나눠 따져야 하므로 강화학습이다.

## 노드별 학습 설계

학습 대상은 다섯 개, VLM은 프롬프트로만 씁니다. 학습 후 ONNX로 내보내 ROS 2 노드(또는 컨트롤러) 안에서 추론합니다.

| 노드 | 방법 | 도구 | 입력 | 출력 | 정답 · 보상 |
| --- | --- | --- | --- | --- | --- |
| perception | 지도학습 | Isaac Sim Replicator → YOLO 등 파인튜닝 + 실사진 수백 장 | RGB | 클래스, 박스(·마스크) | 자동 라벨 |
| grasp_scorer | 지도학습 | Isaac Sim 파지 시도 → PyTorch 분류 | 컵 포인트클라우드, **IK 가능한** 파지 후보 | 성공 확률 0~1 | 들어 흔든 뒤 유지 1, 낙하 0 |
| rl_nav_correction | RL (residual) | Isaac Lab + PPO | 기본 명령, 엔코더 속도, IMU 각속도, 경로 횡·방향 오차, 직전 Δ | Δv, Δω | 경로·속도 추종 오차 −, 보정량 −, 떨림 − |
| rl_arm_correction | RL (residual) | Isaac Lab + PPO | 목표·현재 관절각·속도, 추종 오차, 파지 여부(그리퍼 state interface로 판단), 직전 Δ | 관절별 Δ | 추종 오차 −, 보정량 −, 떨림 − |
| rl_nav_tuner | **규칙으로 시작**, 필요할 때 RL | 규칙 → (Isaac Lab + PPO) | 통로 폭, 최근접 장애물, 목표 거리, 현재 속도 | 프리셋 A/B/C | 빠른 도착 +, 충돌·근접 큰 −, 출렁임 − |
| vlm_task_planner | 학습 없음 | 사전학습 VLM + 프롬프트 | 명령, /tracked_objects, 이미지 | /sub_goals (JSON) | — |

### residual 보정이 배우는 것

목표 정보는 기본 명령 안에 이미 들어 있습니다. 보정 정책은 **명령과 실제 움직임의 차이**만 메웁니다. 예) 카펫에서 엔코더는 0.30rad/s인데 IMU는 0.24rad/s → 미끄러짐으로 보고 각속도를 조금 더 준다. 위치는 맵 좌표 대신 **경로 대비 상대 오차**로 넣어 특정 장소를 외우지 않게 합니다.

${F}python
obs = [cmd_base_v, cmd_base_w, wheel_v, wheel_w, imu_w,
       lateral_err, heading_err, last_action_v, last_action_w]
delta = action * [0.05, 0.10]                       # action ∈ [-1, 1]
cmd   = clip(cmd_base + delta, -v_limit, v_limit)   # 프리셋·speed_limit 상한으로 재클리핑
reward = (- 2.0 * lateral_err**2
          - 1.0 * heading_err**2
          - 0.5 * (actual_vel - cmd)**2              # 속도 추종: 기본 제어기 종류에 덜 민감
          - 0.1 * (action**2).sum()
          - 0.05 * ((action - last_action)**2).sum())
${F}

> **비교 기준을 정직하게:** 미끄러짐 보정의 확정적 기본은 EKF(엔코더+IMU 융합)와 Nav2 제어기의 폐루프다. "EKF 켠 상태" 대비 RL 효과를 재야 부풀려지지 않는다.

### rl_nav_tuner 프리셋 — 실행 중 바뀌는 값만 쓴다

DWB의 **critic 가중치(PathDist.scale 등)는 초기화 때 읽혀** 실행 중 바꿔도 반영되지 않을 수 있습니다. 그래서 프리셋은 실행 중 반영되는 두 경로만 씁니다.

| 값 | 경로 | A: 넓은 공간 | B: 좁은 통로 | C: 목표 직전 |
| --- | --- | --- | --- | --- |
| 속도 상한 | /speed_limit (nav2_msgs/SpeedLimit, 백분율) | 100% | 60% (≈0.15m/s) | 40% (≈0.10m/s) |
| FollowPath.max_vel_theta | set_parameters (DWB kinematic) | 1.82 | 1.0 | 0.8 |
| FollowPath.acc_lim_x | set_parameters | 2.5 | 1.5 | 1.0 |
| FollowPath.decel_lim_x | set_parameters | −2.5 | −1.5 | −1.0 |

- 값은 실행 중인 controller_server 메모리에만 반영되고 yaml은 안 바뀐다. 재시작하면 기본값.
- 쓰기 전 \`ros2 param set /controller_server FollowPath.max_vel_theta 1.0\` 후 실제 동작이 바뀌는지 먼저 확인한다.
- 가중치까지 바꿔야 하면 controller_server에 \`FollowPath\`·\`FollowPathNarrow\` 두 플러그인을 등록하고 BT에서 controller_id로 고르게 한다(정적 설정 두 벌).
- rl_nav_correction도 /speed_limit을 구독해 같은 상한으로 클리핑한다 → 보정이 프리셋을 넘지 않는다.

### 랜덤화 범위 예

| 대상 | 랜덤화 항목 | 범위 |
| --- | --- | --- |
| perception | 조명, 배경, 질감, 카메라 노이즈·노출 | 장면마다 |
| grasp_scorer | 컵 종류·크기·위치·회전, 마찰, 질량(물 양) | 머그·종이컵·유리컵, 마찰 0.3~1.0, 0.1~0.4kg |
| rl_nav_correction | 바닥 마찰, 바퀴 반경, 질량, 명령 지연, IMU 노이즈, **기본 제어기 게인** | 0.3~1.0, ±3%, ±20%, 0~60ms |
| rl_arm_correction | 관절 마찰, 물건 무게, 모터 게인, 지연, 백래시 | 무게 0~0.3kg 등 |
| rl_nav_tuner | 장애물 배치, 통로 폭, 목표 위치 | 통로 0.7~2.0m |
`,
  },

  isaac: {
    label: 'Isaac 파이프라인',
    md: `
## Isaac Sim / Isaac Lab 학습 파이프라인

Isaac Sim은 물리 시뮬레이터, Isaac Lab은 그 위에서 환경 수천 개를 병렬로 돌려 강화학습을 하는 프레임워크입니다. 지도학습은 Isaac Sim이 데이터를 만들고 학습은 밖에서, 강화학습은 Isaac Lab이 학습 내내 함께 돕니다.

${F}mermaid
flowchart LR
    subgraph PREP["공통 준비"]
        URDF["URDF → USD"]
        SYS["시스템 식별<br/>질량·마찰·게인"]
        ENV["환경<br/>테이블·컵·카펫"]
    end
    subgraph SL["지도학습"]
        GEN["Isaac Sim<br/>파지 시도 · Replicator"]
        DS[("데이터셋")]
        TR["PyTorch 학습"]
    end
    subgraph RLP["강화학습"]
        LAB["Isaac Lab<br/>4096 env · PPO"]
    end
    ONNX["ONNX"]
    ROS["ROS 2 노드 · 컨트롤러"]
    URDF --> SYS --> ENV
    ENV --> GEN --> DS --> TR --> ONNX
    ENV --> LAB --> ONNX
    ONNX --> ROS
${CLS}
    class GEN,TR,LAB rl;
    class ROS std;
${F}

### 공통 준비

1. **로봇 가져오기:** TB3 + OM-X URDF를 USD로 변환. 바퀴·관절 drive 게인 설정.
2. **물리 맞추기 (시스템 식별):** 실기와 시뮬에 같은 명령을 주고 반응을 비교해 질량, 관절 마찰, 바퀴 마찰, 모터 게인, 지연을 맞춘다. 실기 rosbag을 기준 데이터로 쓴다.
3. **환경 만들기:** 테이블, 컵, 의자, 마루·카펫 바닥.

### 지도학습 흐름 (grasp_scorer)

1. 장면마다 컵 종류·크기·위치·회전·마찰을 무작위로.
2. 컵 주변에 파지 후보를 수십 개 만들고 **OM-X IK로 도달 불가능한 것은 버린다.**
3. 후보마다 그리퍼를 닫고 10cm 들어올리고 살짝 흔든다.
4. 유지 1, 낙하 0으로 (포인트클라우드, 자세, 라벨) 저장.
5. 병렬로 수만~수십만 개를 모은 뒤 Isaac을 끄고 PyTorch로 분류 모델 학습.
6. ONNX로 내보내 grasp_scorer에서 사용.

perception도 같은 틀입니다. Replicator로 조명·배경·질감을 바꿔 찍으면 박스·마스크 정답이 자동으로 붙고, 실사진 수백 장을 섞으면 현실 성능이 크게 오릅니다.

### 강화학습 흐름 (rl_nav_correction)

1. **환경 정의:** 장면, 기본 제어기, 관측, 행동, 보상을 Isaac Lab 파이썬으로.
2. **기본 제어기 대체:** 병렬 환경에서 Nav2를 돌릴 수 없으므로 pure pursuit를 넣고, **게인을 랜덤화**해 DWB와의 차이에 덜 민감하게 한다. velocity_smoother의 가속 제한도 환경에 넣는다.
3. **랜덤화 이벤트:** 에피소드마다 마찰, 바퀴 반경, 질량, 지연, 노이즈.
4. **학습:** headless로 4096개 환경, PPO. 보상 곡선이 평평해지면 수렴.
5. **확인:** play 모드로 카펫에서 경로 이탈이 줄어드는지.
6. **배포:** ONNX → ROS 2 노드가 **같은 순서·단위·정규화·주기**로 관측을 만든다.

${F}bash
# 스크립트 경로·옵션은 Isaac Lab 버전마다 다르다 — 사용하는 버전 문서를 따른다
python scripts/reinforcement_learning/rsl_rl/train.py --task Cupbot-NavResidual-v0 --num_envs 4096 --headless
${F}

- **rl_nav_tuner를 RL로 학습하기 어렵다:** 프리셋 효과는 DWB 동작에 달려 있는데, Isaac Lab 병렬 환경에는 DWB가 없다. 규칙 기반으로 시작하고, RL이 필요하면 Gazebo + 실제 Nav2로 소수 환경 학습을 하거나 DWB 근사 모델을 만든다.

### Isaac에서 쓸 수 있는 학습 종류

| 종류 | 도구 | 이 시스템의 용도 |
| --- | --- | --- |
| 강화학습 | Isaac Lab + PPO (rsl_rl, rl_games, skrl) | 뒷단 보정 2개, (rl_nav_tuner) |
| 합성 데이터 지도학습 | Replicator, 스크립트 데이터 수집 | perception, grasp_scorer |
| 모방학습 | Isaac Lab 원격조종, Isaac Lab Mimic, robomimic | 나중에 pick/place 동작 자체를 학습할 때 |

공통 기법: 도메인 랜덤화, 쉬운 환경부터 어려운 환경으로 가는 커리큘럼, 시뮬 정답으로 학습한 선생 정책을 실제 센서만 쓰는 학생 정책이 따라 하는 teacher–student.
`,
  },

  scenario: {
    label: '시나리오',
    md: `
## 시나리오

같은 설계가 상황마다 어떻게 움직이는지 봅니다. 1번이 정상 흐름이고, 2~7번은 일이 꼬였을 때입니다.

| # | 시나리오 | 무엇을 보나 |
| --- | --- | --- |
| 1 | 테이블 위 컵 가져오기 | 정상 흐름 — 명령부터 전달까지 |
| 2 | 파지 실패 → 재계획 → 다시 집기 | 재시도는 coordinator, 재계획은 VLM |
| 3 | 가는 길이 막혔다 | Nav2 자체 복구 → 안 되면 재계획 |
| 4 | 이동 중 아이가 앞을 지나간다 | 재계획 없이 collision_monitor가 감속·정지 |
| 5 | 집는 중 사람이 팔을 잡았다 | 전류로 접촉 감지 → 궤적 취소 |
| 6 | 전원 켜자마자 명령 | 위치(map→odom)를 찾을 때까지 기다림 |
| 7 | 학습 노드를 모두 끄고 같은 명령 | 끄면 무엇이 달라지나 |

## 시나리오 1: 테이블 위 컵 가져오기 (정상 흐름)

로봇은 현관, 낮은 테이블(높이 0.45m)은 4m 떨어진 거실, 가는 길에 카펫과 의자. 아래 값은 각 노드가 실제로 주고받는 메시지 예시입니다.

${F}mermaid
sequenceDiagram
    autonumber
    participant U as 사람
    participant I as voice_ui
    participant V as vlm_task_planner
    participant C as coordinator
    participant N as Nav2
    participant G as grasp_scorer
    participant M as move_group (MTC)
    U->>I: 🗣️ “테이블 위 컵 가져다줘”
    I->>V: ✉️ /cmd/user_command "테이블 위 컵 가져다줘" (std_msgs/String)
    V->>C: ✉️ /sub_goals [navigate, pick, navigate, place] (cupbot_interfaces/SubGoalArray)
    C->>C: 검증 (허용 동작, id 존재) · 팔 stow
    C->>N: 🎬 /navigate_to_pose x 3.45, y 0.9, yaw 0 (nav2_msgs/action/NavigateToPose)
    N-->>C: 🎬 result 성공
    C->>M: 📞 /clear_octomap · /apply_planning_scene (std_srvs/srv/Empty · moveit_msgs/srv/ApplyPlanningScene)
    C->>G: 📞 /score_grasps IK 가능 후보 3개 (cupbot_interfaces/srv/ScoreGrasps)
    G-->>C: 📞 response [B 0.87, C 0.62, A 0.41]
    C->>M: 🎬 /execute_task_solution 후보 B (moveit_task_constructor_msgs/action/ExecuteTaskSolution)
    M-->>C: 🎬 result 실패 — 그리퍼 빈손
    C->>M: 🎬 /execute_task_solution 후보 C (moveit_task_constructor_msgs/action/ExecuteTaskSolution)
    M-->>C: 🎬 result 성공 · 컵 attach
    C->>N: 🎬 /navigate_to_pose 사람 앞 · 📞 footprint 확장 (nav2_msgs/action/NavigateToPose · rcl_interfaces/srv/SetParameters)
    C->>M: 🎬 /execute_task_solution place · detach (moveit_task_constructor_msgs/action/ExecuteTaskSolution)
    C->>V: ✉️ /task_status 완료 (cupbot_interfaces/TaskStatus)
    C->>I: ✉️ /robot_say “컵 가져왔어요” (std_msgs/String)
    I->>U: 🔊 “컵 가져왔어요”
${F}

### 1단계: 인식과 계획

1. **사람:** "테이블 위 컵 가져다줘" → /cmd/user_command
2. **perception:** pole_cam 영상·depth로 물체 추적

${F}yaml
/tracked_objects:
  - { id: 3, class: cup,   pos: [4.05, 0.85, 0.50], conf: 0.93 }
  - { id: 5, class: table, pos: [4.00, 0.90, 0.45], size: [0.8, 0.5, 0.45] }
  - { id: 7, class: chair, pos: [3.20, 0.20, 0.00] }
${F}

3. **vlm_task_planner:** 무엇을, 어떤 순서로만.

${F}json
{ "sub_goals": [
  { "step": 1, "skill": "navigate", "target": 5, "relation": "front", "offset_m": 0.20 },
  { "step": 2, "skill": "pick",     "target": 3 },
  { "step": 3, "skill": "navigate", "target": "person" },
  { "step": 4, "skill": "place",    "target": "person_front" } ] }
${F}

4. **coordinator:** 허용 동작인지, id 3·5가 목록에 있는지 확인. 테이블 앞 가장자리(x=3.75)에서 0.2m + 로봇 반경 약 0.1m 떨어진 **(3.45, 0.9)** 를 계산해 NavigateToPose. 팔은 stow.

### 2단계: 테이블로 이동

1. **rl_nav_tuner(규칙):** 통로 0.9m · 의자 근처 → 프리셋 B. /speed_limit 60%(≈0.15m/s), max_vel_theta 1.0.
2. **Nav2:** planner_server가 의자를 피하는 경로, controller_server가 20Hz로 명령. 예) /cmd_vel_nav = (0.12, 0.30)
3. **rl_nav_correction:** 카펫에서 IMU 각속도 0.24, 경로에서 4cm 벗어남 → Δ = (+0.02, +0.05) → (0.14, 0.35). 상한 0.15 이내라 그대로 통과.
4. **velocity_smoother → collision_monitor:** 의자까지 0.5m라 통과. slowdown 다각형(0.3m) 안이면 40%, stop(0.15m) 안이면 정지.
5. **diff_drive_controller:** 좌 2.72, 우 5.76rad/s. 도착하면 Nav2 성공 → coordinator가 pick으로.

### 3단계: 컵 집기

1. **coordinator:** 0.5초 안정 대기 → /clear_octomap → 테이블·컵 CollisionObject 등록 → /score_grasps.

${F}text
후보 (OM-X IK 가능한 것만)
  B: 옆에서 수평   → 0.87  ← 1순위
  C: 위에서 비스듬히 → 0.62  ← 2순위
  A: 위에서 수직   → 0.41  (가장자리가 얇아 미끄러짐)
${F}

2. **move_group(MTC):** 후보 B로 접근(직선 8cm) → 열기 → 파지 → attach → 들어올리기(직선 5cm) 계획. 속도 스케일 0.4.
3. **arm_controller:** 매 주기 목표 관절각. 예) [0.00, 0.62, −0.31, 1.10]
4. **rl_arm_correction:** 팔을 뻗자 중력으로 joint2가 0.59에 머묾 → Δ = [0.00, +0.03, −0.01, 0.00] → [0.00, 0.65, −0.32, 1.10]
5. **gripper_controller:** GripperCommand로 닫기. 컵을 든 뒤 처짐이 커지면 정책이 Δ를 키운다.

### 실패와 재시도

1. GripperCommand 결과 그리퍼 관절 위치가 완전히 닫힘(빈손)에 가깝다 → 놓친 것으로 판단.
2. **coordinator가 직접** 2순위 후보 C로 재시도 (VLM 호출 없음).
3. C도 실패하면 /task_status (step 2, reason: grasp_failed_all)로 VLM에 재계획 요청 — 예) "다른 방향에서 접근하도록 navigate 재지정".
4. 같은 단계가 두 번 연속 실패하면 coordinator가 \`/robot_say\`로 "컵을 잡을 수 없어요"를 보내고(voice_ui가 음성으로 말함) 정지.

### 4단계: 전달

컵을 든 채 이동할 땐 footprint를 키우고 프리셋 상한을 낮춘다(액체 출렁임 방지). 사람 앞에서 place → detach → 팔 stow → /task_status 완료.

> **학습 노드를 모두 꺼도**(enabled:=false, 규칙 프리셋) 이 시나리오는 끝까지 동작한다. 차이는 카펫에서 경로를 조금 더 벗어나고, 팔이 처져 파지 성공률이 떨어지는 정도다.

## 시나리오 2: 파지 실패 → 재계획 → 다시 집기

컵 손잡이 쪽이 미끄러워 옆에서 잡는 후보가 연달아 실패한 경우입니다.

${F}mermaid
sequenceDiagram
    autonumber
    participant C as coordinator
    participant G as grasp_scorer
    participant M as move_group (MTC)
    participant V as vlm_task_planner
    participant N as Nav2
    C->>G: 📞 /score_grasps
    G-->>C: [B 0.87, C 0.62, A 0.41]
    C->>M: 🎬 /execute_task_solution 후보 B
    M-->>C: 실패 — 그리퍼 빈손
    C->>M: 🎬 /execute_task_solution 후보 C
    M-->>C: 실패
    C->>V: ✉️ /task_status step 2 FAILED (grasp_failed_all)
    V->>C: ✉️ /sub_goals [navigate 테이블 옆(컵 방향 정렬), pick, navigate 사람, place]
    C->>N: 🎬 /navigate_to_pose 새 접근 위치 (팔 stow)
    N-->>C: 성공
    C->>M: 📞 /clear_octomap · /apply_planning_scene
    C->>G: 📞 /score_grasps
    G-->>C: [D 0.81, B 0.70]
    C->>M: 🎬 /execute_task_solution 후보 D
    M-->>C: 성공 · 컵 attach
    Note over C: 원래 계획대로 사람에게 전달
${F}

- **재시도는 coordinator, 재계획은 VLM.** 후보를 바꿔 다시 잡는 건 실행 세부라 coordinator가 직접 합니다(계획·임무 규칙 4). 후보를 다 쓴 뒤에야 VLM이 "어디서 어떻게 접근할지"를 다시 정합니다.
- **4축 팔이라 접근 방향이 핵심이다.** 옆 파지는 컵이 팔 평면 안에 있어야 되므로, 새 계획은 베이스를 컵 방향으로 정렬해 세우는 것부터 바꿉니다.
- **재계획 뒤에도 또 실패하면** 같은 단계 2회 실패라 \`/robot_say\` "컵을 잡을 수 없어요" 후 정지합니다(규칙 5).
- 후보 D 같은 값은 예시입니다.

## 시나리오 3: 가는 길이 막혔다 → 복구 → 재계획

의자가 밀려 들어와 0.9m 통로가 막힌 경우입니다.

${F}mermaid
sequenceDiagram
    autonumber
    participant C as coordinator
    participant B as bt_navigator
    participant P as planner_server
    participant S as behavior_server
    participant V as vlm_task_planner
    C->>B: 🎬 /navigate_to_pose (3.45, 0.9)
    B->>P: 🎬 /compute_path_to_pose
    P-->>B: 실패 — 통로가 막혀 경로 없음
    B->>S: 🎬 /spin · /wait (복구)
    S-->>B: 완료
    B->>P: 🎬 /compute_path_to_pose (재시도)
    P-->>B: 또 실패
    B-->>C: result ABORTED (재시도 횟수 초과)
    C->>V: ✉️ /task_status step 1 FAILED (nav_failed)
    V->>C: ✉️ /sub_goals [navigate 테이블 반대편, pick, ...]
    C->>B: 🎬 /navigate_to_pose 테이블 반대편
    B-->>C: 성공
    Note over C: 이어서 pick
${F}

- **Nav2가 먼저 스스로 푼다.** 경로 재계산 → 복구(Spin·Wait) → 다시 계산을 행동 트리에 정해진 횟수만큼 반복합니다. pole_cam이 뒤를 못 보므로 BackUp은 빼거나 0.1m 이하입니다.
- **그래도 안 되면 그때 coordinator·VLM 차례.** 액션이 ABORTED로 끝나면 coordinator가 FAILED로 보고하고 VLM이 다른 접근 위치로 다시 계획합니다.
- 같은 단계가 2회 연속 실패하면 사람에게 알리고 정지합니다(규칙 5).

## 시나리오 4: 이동 중 아이가 앞을 지나간다

재계획이 필요 없는 경우입니다. 명령 체인의 마지막 관문이 속도만 줄였다가 풉니다.

${F}mermaid
sequenceDiagram
    participant N as controller_server
    participant R as rl_nav_correction
    participant S as velocity_smoother
    participant X as collision_monitor
    participant D as diff_drive_controller
    N->>R: ✉️ /cmd_vel_nav (0.12, 0.30)
    R->>S: ✉️ /cmd_vel_corrected (0.14, 0.35)
    S->>X: ✉️ /cmd_vel_smoothed
    Note over X: 점구름에서 0.3m 안에 물체 → slowdown
    X->>D: ✉️ /cmd_vel 40%로 감속
    Note over X: 0.15m 안 → stop
    X->>D: ✉️ /cmd_vel 0 (정지)
    Note over X: 아이가 비켜남
    X->>D: ✉️ /cmd_vel 원래 명령 그대로
${F}

- **안전장치는 학습 노드 뒤에 있다.** RL 보정이 무엇을 내든 collision_monitor가 최종 명령을 거릅니다(개요의 규칙).
- **Nav2 액션은 계속 진행 중**이라 coordinator는 개입하지 않습니다. 다만 오래 막혀 있으면 controller_server가 멈춤으로 보고 시나리오 3처럼 복구로 넘어갑니다.
- **전방 화각 안만 지켜 준다.** pole_cam 화각(약 87°) 밖, 옆·뒤는 못 봅니다.

## 시나리오 5: 집는 중 사람이 팔을 잡았다

MoveIt의 충돌 검사는 궤적을 만들 때 한 번뿐이라, 실행 중 끼어든 손은 전류로 잡습니다.

${F}mermaid
sequenceDiagram
    autonumber
    participant M as move_group
    participant J as arm_controller (JTC)
    participant A as arm_safety_monitor
    participant C as coordinator
    participant V as vlm_task_planner
    M->>J: 🎬 follow_joint_trajectory (접근)
    J->>A: ✉️ /joint_states effort (100Hz)
    Note over A: 관절 전류가 기준 초과 상태로 0.1초 넘게 이어짐 → 접촉
    A->>J: 📞 cancel_goal
    Note over J: 현재 자세 유지
    J-->>M: 궤적 취소됨
    A->>C: ✉️ /arm_safety_event
    M-->>C: 🎬 /execute_task_solution 실패
    C->>V: ✉️ /task_status step 2 FAILED (arm_contact)
    V->>C: ✉️ /sub_goals (다시 시도)
${F}

- **충돌 처리는 세 겹이다.** 계획 검사(planning scene) → 실행 중 감시(JTC 허용오차, 전류) → 하드웨어 한계(속도 스케일·전류 한계). 이 경우는 두 번째 층이 잡습니다.
- **기준 전류는 컵을 든 상태까지 먼저 재 둔다.** 그래야 정상 동작을 접촉으로 오인하지 않습니다.
- 다시 시도해도 또 접촉이면 같은 단계 2회 실패로 알리고 정지합니다.

## 시나리오 6: 전원 켜자마자 명령

RTAB-Map 위치추정 모드는 처음 몇 초간 지도와 맞는 장면을 찾아야 map→odom을 냅니다.

${F}mermaid
sequenceDiagram
    autonumber
    participant U as 사람
    participant I as voice_ui
    participant V as vlm_task_planner
    participant C as coordinator
    participant T as rtabmap (위치추정)
    participant N as Nav2
    Note over T: 지도와 맞는 장면 찾는 중 · map→odom 아직 없음
    U->>I: 🗣️ “테이블 위 컵 가져다줘”
    I->>V: ✉️ /cmd/user_command
    V->>C: ✉️ /sub_goals
    C->>C: 검증 OK · map→odom TF 대기
    T-->>C: ✉️ /tf map→odom 발행 시작
    C->>N: 🎬 /navigate_to_pose
${F}

- **map→odom 전에는 목표를 보내지 않는다.** Nav2가 지도 기준 로봇 위치를 모르는 상태라 바로 실패합니다. coordinator가 TF를 기다립니다(Nav2·SLAM 섹션 3-1).
- 이 구조는 맵핑·위치추정 탭의 initial_pose와 같은 이야기입니다. AMCL은 /initialpose를 받아야, RTAB-Map은 지도와 맞는 장면을 찾아야 map→odom이 나옵니다.
- 조명이 매핑 때와 크게 다르면 오래 걸립니다. 낮·밤 두 조건에서 매핑해 둡니다.

## 시나리오 7: 학습 노드를 모두 끄고 같은 명령

| 노드 | 켜짐 | enabled:=false |
| --- | --- | --- |
| rl_nav_tuner | 상황 따라 프리셋 A/B/C | 프리셋 A 고정 |
| rl_nav_correction | 명령에 Δ를 더함 | Δ=0, 통과만 |
| rl_arm_correction | 팔 처짐 보상 Δ | Δ=0 |

- **노드를 내리지 않고 끈다.** \`enabled:=false\`면 원래 시스템과 같아야 합니다(개요의 규칙). 그래서 학습 노드를 넣기 전·후를 같은 조건에서 비교할 수 있습니다.
- **시나리오 1은 끝까지 동작합니다.** 차이는 카펫에서 경로를 조금 더 벗어나고, 팔이 처져 파지 성공률이 떨어지는 정도입니다. 그만큼 시나리오 2(재시도·재계획)가 더 자주 일어납니다.
`,
  },

  check: {
    label: '체크리스트·로드맵',
    md: `
## 안전·검증·sim-to-real 체크리스트

가장 흔한 실패는 **관측 벡터의 순서·단위가 학습 때와 달라지는 것**입니다.

### 배포 전

- [ ] 관측의 순서·단위·정규화가 Isaac Lab과 ROS 2 노드에서 완전히 같다 (단위 테스트로 같은 입력 → 같은 출력 확인)
- [ ] 정책 실행 주기가 학습 때와 같다 (학습 50Hz면 노드도 50Hz)
- [ ] Δ 클리핑(선 ±0.05, 각 ±0.10, 관절 ±0.05)과 **보정 후 상한 재클리핑**이 걸려 있다
- [ ] velocity_smoother·collision_monitor가 rl_nav_correction보다 뒤에 있고, behavior_server 출력도 같은 체인을 지난다
- [ ] 센서 값이 0.2초 넘게 끊기면 Δ=0
- [ ] TwistStamped로 체인 전체가 통일돼 있다
- [ ] odom TF 발행자가 하나다 (ekf만)

### 하드웨어 첫 구동

- [ ] 틱↔rad 변환과 중앙값 2048을 관절마다 확인
- [ ] 토크를 낮춘 상태에서 관절을 하나씩 움직여봄
- [ ] 버스가 100Hz를 맞춘다 (SyncRead/SyncWrite, baud rate)
- [ ] 비상 정지 방법이 정해져 있다 (하드웨어 스위치 + \`/cmd_vel\` 0 + 컨트롤러 deactivate)
- [ ] 팔이 테이블 높이에 닿는다 (MoveIt에서 목표 자세 IK 확인)
- [ ] RealSense 2대가 serial_no로 구분돼 동시에 30fps(또는 설정 fps)를 유지한다 (\`ros2 topic hz\`)
- [ ] rtabmap 위치추정 모드에서 시작 위치를 찾은 뒤에만 Nav2 목표를 보낸다

### 팔 안전

- [ ] planning scene에 octomap(pole_cam 포인트클라우드)이 들어오고, pick 전 clear가 된다
- [ ] /joint_states에 effort가 실린다
- [ ] 정상 동작 전류를 기록하고 접촉 기준값을 정했다
- [ ] 팔을 손으로 막았을 때 0.2초 안에 궤적이 멈춘다 (JTC 허용오차 또는 arm_safety_monitor)
- [ ] MoveIt 속도·가속도 스케일과 다이나믹셀 전류 한계가 설정돼 있다
- [ ] 베이스 이동 중 팔 동작이 coordinator에서 막힌다

### 효과 검증

- [ ] 같은 경로를 보정 끔/켬(EKF는 둘 다 켬)으로 각 10회 이상 주행해 경로 이탈·도착 시간 비교
- [ ] 같은 컵 배치에서 grasp_scorer vs 규칙 기반 성공률 기록
- [ ] coordinator가 VLM 출력의 형식, 허용 동작, 대상 존재를 검사
- [ ] 재시도 한도(2회)와 사람에게 알리는 동작이 있다

## 개발 로드맵

확정 노드만으로 끝까지 되게 만든 뒤, 효과가 크고 쉬운 학습 노드부터 하나씩 붙입니다. 각 단계는 앞 단계가 **실기에서 동작해야** 시작합니다.

${F}mermaid
flowchart LR
    A["1 기반<br/>URDF·SLAM·Nav2·MoveIt"] --> B["2 coordinator<br/>+ perception"]
    B --> C["3 vlm_task_planner"]
    C --> D["4 오차 측정"]
    D --> E["5 rl_nav_correction"]
    E --> F["6 grasp_scorer"]
    F --> G["7 rl_arm_correction"]
    G --> H["8 rl_nav_tuner (RL)"]
${CLS}
    class A,B,C,D std;
    class E,F,G,H rl;
${F}

1. **기반:** URDF에 RealSense 2대·ros2_control 태그, RTAB-Map 지도, Nav2(+behavior_server, ekf)·MoveIt(+MTC) 설정, 텔레옵으로 이동·집기, 팔을 막으면 멈추는지 확인
2. **coordinator + perception:** 규칙 기반 파지(옆에서)와 규칙 프리셋으로 컵 가져오기를 끝까지
3. **vlm_task_planner:** 자연어 명령과 재계획 연결
4. **오차 측정:** 학습 없이 반복해 오차가 어디서 나는지 rosbag으로 기록 (이게 Isaac 시스템 식별 데이터)
5. **rl_nav_correction:** RL 중 가장 쉽고 효과 확인이 빠름
6. **grasp_scorer:** 규칙 기반 대비 성공률이 오르는지
7. **rl_arm_correction:** chainable controller로 구현
8. **rl_nav_tuner RL화:** 규칙 프리셋으로 부족할 때만
`,
  },

  changes: {
    label: '검토 반영',
    md: `
## 초안 대비 바뀐 점 (검토 반영)

초안 설계서를 ROS 2 관례·실제 패키지 동작 기준으로 검토하고 고친 목록입니다.

| # | 초안 | 최종본 | 이유 |
| --- | --- | --- | --- |
| 1 | switch_controller로 rl_arm_correction만 끄기 | \`enabled\` 파라미터로 Δ=0 | JTC가 command_joints로 그 reference에 묶여 있어 뒤만 끌 수 없음 |
| 2 | 프리셋이 DWB critic 가중치 변경 | /speed_limit + kinematic 파라미터만 | critic scale은 초기화 때 읽혀 런타임 변경이 반영 안 될 수 있음 |
| 3 | "토픽으로는 controller_server를 바꿀 수 없다" | /speed_limit 토픽 사용 | controller_server가 nav2_msgs/SpeedLimit을 구독 |
| 4 | behavior_server 없음, lifecycle_manager 1개 | behavior_server 추가, 2개로 분리 | 기본 BT가 Spin·BackUp·Wait 호출 |
| 5 | pole_cam depth → depthimage_to_laserscan → /scan | /scan 없이 depth를 PointCloud2로 직접 사용 | 하향 카메라를 스캔으로 바꾸면 바닥을 장애물로 잡음 |
| 6 | camera_info, depth/points 누락 | 1장에 추가 | 3D 투영·포인트클라우드 생성에 필요 |
| 7 | MoveGroup 액션으로 pick | MTC (직선 접근·attach·후퇴) | 직선 이동과 attach는 MoveGroup 하나로 안 됨 |
| 8 | octomap 속 목표 컵 처리 없음 | /clear_octomap + ACM 허용 | 컵 voxel 때문에 접근 계획이 거부됨 |
| 9 | 4축 팔 한계 미반영 | IK 가능 후보만, pick_ik | OM-X는 6D 자세를 못 만듦 |
| 10 | 테이블 높이 0.72~0.75m | 낮은 테이블 0.45m | OM-X를 Waffle에 얹으면 그리퍼 최고 높이 약 0.6m |
| 11 | 바퀴 4.2 · 5.9rad/s | 2.72 · 5.76rad/s | 초안 값은 Burger(간격 0.16m) 기준, Waffle은 0.287m |
| 12 | 프리셋 B 상한 0.15인데 보정 후 0.16 | 보정 후 상한 재클리핑 | residual이 tuner 상한을 넘지 않게 |
| 13 | VLM이 2순위 파지점 선택 | coordinator가 재시도, VLM은 순서만 | 계층 원칙(판단 권한 한 층에 하나) |
| 14 | "폭 센서 값 0" | 그리퍼 관절 위치·GripperCommand 결과 | OM-X에 폭 센서 없음 |
| 15 | 팔 U2D2, controller_manager 2개 | OpenCR, controller_manager 1개 | turtlebot3_manipulation 공식 구성 |
| 16 | odom→base_link를 diff_drive_controller | robot_localization EKF | IMU 융합으로 미끄러짐 기본 보정, RL 비교 기준 |
| 17 | 추종 오차 감지를 직접 작성 | JTC constraints 내장 기능 | 직접 작성은 전류 감지만 |
| 18 | 이동·팔 조율 규칙 없음 | stow, footprint 확장, 정지 시에만 팔 | 모바일 매니퓰레이터 기본 규칙 |
| 19 | rl_nav_tuner를 Isaac Lab RL로 | 규칙으로 시작 | 병렬 환경에 DWB가 없어 프리셋 효과를 시뮬할 수 없음 |
| 20 | slam_toolbox + amcl (LaserScan 기반) | RTAB-Map 매핑·위치추정 | LiDAR가 없어 LaserScan 기반 SLAM·위치추정은 화각 87° 가짜 스캔에 의존하게 됨 |
| 21 | QoS 언급 없음 | QoS 표 추가 | best_effort ↔ reliable 불일치는 연결 자체가 안 됨 |
| 22 | gripper_cam RGB, LiDAR 탑재 가정 | 카메라 2대 모두 Intel RealSense, LiDAR 없음 | 실제 하드웨어 구성 반영 — 근접 점구름은 gripper_cam, 장애물·SLAM은 pole_cam 담당 |
| 23 | 후방 감지 가정 | BackUp 복구 제한, voxel layer 보수적 clearing | 전방 카메라 하나라 옆·뒤 사각지대 |
| 24 | rtabmap Grid/FromDepth | Grid/Sensor 0 + scan_cloud = points_filtered (처음엔 1 depth — 팔이 지도에 벽으로 남아 바꿈) | 현재 rtabmap에서 Grid/FromDepth는 Grid/Sensor(0 레이저, 1 depth, 2 둘 다)로 바뀜 — rtabmap Parameters.h 확인 |
| 25 | 공식 TurtleBot3 플러그인으로 전류(effort) 사용 | 플러그인 fork해서 effort state 추가 | 공식 jazzy 플러그인은 position·velocity만 내보냄 — OpenCR 제어 테이블의 present_current를 읽어 effort로 내보내야 arm_safety_monitor·rl_arm_correction이 동작 |
| 26 | /failure_report (실패할 때만, coordinator → VLM) | /task_status (RUNNING·SUCCEEDED·FAILED + reason) | 실패만이 아니라 진행·완료도 같은 토픽으로 — VLM은 FAILED에 재계획, voice_ui는 완료 안내·진행 표시에 사용 |
`,
  },
};

const ORDER = Object.keys(SECTIONS) as Section[];

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosDesign extends w.HTMLElement {
    // URL(?concept=design&sec=…&node=…&from=…)이 유일한 상태 원천.
    // 클릭은 @swcAppRouteGo로 히스토리에 push만 하고, 실제 렌더는 라우트 구독(onRoute)이 한다
    // → 브라우저 뒤로/앞으로 가기도 같은 경로로 처리된다.
    private section?: Section;
    private focusNode?: string;   // 노드 사전에서 스크롤할 카드 id
    private back?: Section;       // 노드 사전으로 오기 전 섹션 (?from=, 돌아가기 버튼)
    private scrollMemo = new Map<string, number>(); // 화면(sec|node)별 마지막 스크롤 위치 — 뒤로가기 때 복원

    private static key(sec?: Section, node?: string) {
      return `${sec ?? ''}|${node ?? ''}`;
    }

    @subscribeSwcAppRouteChange('/ros2', { trigger: 'connectedDone' })
    onRoute(
      @swcAppRouteQueryParam('concept') concept: string | null,
      @swcAppRouteQueryParam('sec') secParam: string | null,
      @swcAppRouteQueryParam('node') nodeParam: string | null,
      @swcAppRouteQueryParam('from') fromParam: string | null,
    ) {
      if (concept !== 'design') return;
      const sec: Section = secParam && secParam in SECTIONS ? (secParam as Section) : 'overview';
      const node = sec === 'catalog' && nodeParam && NODE_IDS.has(nodeParam) ? nodeParam : undefined;
      const from = sec === 'catalog' && fromParam && fromParam in SECTIONS && fromParam !== 'catalog' ? (fromParam as Section) : undefined;
      if (sec === this.section && node === this.focusNode && from === this.back) return;
      const first = this.section === undefined;
      const sameSection = sec === this.section && from === this.back;
      this.back = from;
      this.section = sec;
      this.focusNode = node;
      const saved = this.scrollMemo.get(RosDesign.key(sec, node));
      if (sameSection) {
        // 노드 사전 안에서 카드만 바뀜 — 다시 그리지 않고 스크롤만
        if (saved === undefined) this.scrollToNode();
        else {
          this.shadowRoot?.querySelectorAll('.rd-card.flash').forEach(c => c.classList.remove('flash'));
          w.scrollTo(0, saved);
        }
        return;
      }
      this.refresh().then(() => {
        if (saved !== undefined) w.scrollTo(0, saved);       // 뒤로가기: 보던 위치로
        else if (node) this.scrollToNode();
        else if (!first) (this.shadowRoot?.querySelector('.rd-secs') as HTMLElement)?.scrollIntoView({ block: 'start' });
      });
    }

    /** 히스토리에 새 화면을 push — 리턴한 경로로 @swcAppRouteGo가 이동하고, 렌더는 onRoute가 한다 */
    @swcAppRouteGo
    private navigate(sec: Section, node?: string) {
      if (sec === this.section && node === this.focusNode) return false;
      this.scrollMemo.set(RosDesign.key(this.section, this.focusNode), w.scrollY);
      const q = new URLSearchParams({ concept: 'design', sec });
      if (node) {
        q.set('node', node);
        // 어디서 왔는지 — 노드 사전 안에서 카드끼리 이동해도 처음 출발한 섹션을 유지
        const from = this.section === 'catalog' ? this.back : this.section;
        if (from) q.set('from', from);
      }
      return { path: `/ros2?${q.toString()}`, scrollToTop: false };
    }

    private async refresh() {
      const sec = this.section!;
      this.shadowRoot?.querySelectorAll('.rd-sec').forEach(el =>
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.sec === sec));
      this.updateNav();
      const el = this.shadowRoot?.querySelector('#rd-body') as HTMLElement;
      if (!el) return;
      if (sec === 'catalog') {
        markdownCancel(el); // 진행 중인 도식 렌더가 끝나며 사전을 덮어쓰지 않게
        el.innerHTML = renderCatalog(this.back ? SECTIONS[this.back].label : undefined);
        return;
      }
      await markdownParse(el, SECTIONS[sec].md);
      if (sec !== this.section) return;
      this.bindLinks(el, SECTIONS[sec].links, SECTIONS[sec].nodes);
      this.mountFlow(el, SECTIONS[sec].flows);
    }

    /* ---------- 흐름 따라가기: 도식 위 컨트롤 바 (재생 중엔 화면 위에 붙음) ---------- */
    private flows: Flow[] = [];
    private flowIdx = 0;
    private flowStep = -1; // -1 = 아직 시작 안 함

    private mountFlow(scope: HTMLElement, flows?: Flow[]) {
      this.flows = flows ?? [];
      this.flowIdx = 0;
      this.flowStep = -1;
      const diagram = scope.querySelector('pre.mermaid');
      if (!this.flows.length || !diagram) return;
      const bar = w.document.createElement('div');
      bar.className = 'rd-flow';
      bar.innerHTML = `
        <div class="rd-flow-row">
          <b class="rd-flow-h">▶ 흐름 따라가기</b>
          <select class="rd-flow-sel" aria-label="상황 선택">
            ${this.flows.map((f, i) => `<option value="${i}">${f.label} (${f.steps.length}단계)</option>`).join('')}
          </select>
          <span class="rd-flow-btns">
            <button type="button" class="rd-flow-prev">◀ 뒤</button>
            <span class="rd-flow-no"></span>
            <button type="button" class="rd-flow-next">앞 ▶</button>
            <button type="button" class="rd-flow-close">✕ 닫기</button>
          </span>
        </div>
        <div class="rd-flow-cap" aria-live="polite"></div>`;
      diagram.before(bar);
      this.renderFlow();
    }

    private flowBar() { return this.shadowRoot?.querySelector('.rd-flow') as HTMLElement | null; }

    private renderFlow(scroll = false) {
      const bar = this.flowBar();
      const flow = this.flows[this.flowIdx];
      const svgs = [...(this.shadowRoot?.querySelectorAll('#rd-body pre.mermaid svg') ?? [])] as SVGSVGElement[];
      const svg = svgs[flow?.diagram ?? 0];
      if (!bar || !svg) return;
      // 다른 도식에 남은 강조는 지운다 (상황마다 대상 도식이 다를 수 있음)
      svgs.filter(s => s !== svg).forEach(s => {
        selectEdges(s, []);
        s.querySelectorAll('g.node.rd-flow-node').forEach(g => RosDesign.markNode(g, false));
      });
      const i = this.flowStep, on = i >= 0;
      bar.classList.toggle('on', on);
      (bar.querySelector('.rd-flow-sel') as HTMLSelectElement).value = String(this.flowIdx);
      (bar.querySelector('.rd-flow-no') as HTMLElement).textContent = `${on ? i + 1 : 0} / ${flow.steps.length}`;
      (bar.querySelector('.rd-flow-prev') as HTMLButtonElement).disabled = i <= 0;
      const next = bar.querySelector('.rd-flow-next') as HTMLButtonElement;
      next.disabled = i >= flow.steps.length - 1;
      next.textContent = on ? '앞 ▶' : '▶ 시작';
      (bar.querySelector('.rd-flow-close') as HTMLElement).hidden = !on;
      const cap = bar.querySelector('.rd-flow-cap') as HTMLElement;

      svg.querySelectorAll('g.node.rd-flow-node').forEach(g => RosDesign.markNode(g, false));
      if (!on) {
        selectEdges(svg, []);
        cap.textContent = '상황을 고르고 "▶ 시작"을 누르면, 어디서 시작해서 어디로 흐르는지 화살표를 하나씩 강조하며 따라갑니다.';
        return;
      }
      const step = flow.steps[i];
      const edges = step.e.map(flowEdge);
      const lit = selectEdges(svg, edges.map(x => x.id));
      const ends = new Set(edges.flatMap(x => [x.from, x.to]));
      svg.querySelectorAll('g.node').forEach(g => { if (ends.has(RosDesign.nodeKey(svg, g))) RosDesign.markNode(g, true); });
      cap.innerHTML = `<b>${i + 1}. ${step.t}</b> ${step.d}`;
      if (scroll && lit.length) this.scrollToEdges(lit, bar);
    }

    /** 강조된 선·라벨이 붙어 있는 컨트롤 바 아래 영역 가운데에 오도록 스크롤 */
    private scrollToEdges(els: Element[], bar: HTMLElement) {
      const rs = els.map(e => e.getBoundingClientRect()).filter(r => r.width || r.height);
      if (!rs.length) return;
      const top = Math.min(...rs.map(r => r.top)), bottom = Math.max(...rs.map(r => r.bottom));
      const barH = bar.getBoundingClientRect().height;
      const room = w.innerHeight - barH;
      const y = w.scrollY + (top + bottom) / 2 - barH - room / 2;
      const reduce = !!w.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      w.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
    }

    @addEventListener('.rd-flow-sel', 'change', { delegate: true })
    onFlowSel(e: Event) {
      this.flowIdx = Number((e.target as HTMLSelectElement).value) || 0;
      this.flowStep = 0;
      this.renderFlow(true);
    }

    @addEventListener('.rd-flow-next', 'click', { delegate: true })
    onFlowNext() {
      if (this.flowStep < this.flows[this.flowIdx].steps.length - 1) { this.flowStep++; this.renderFlow(true); }
    }

    @addEventListener('.rd-flow-prev', 'click', { delegate: true })
    onFlowPrev() {
      if (this.flowStep > 0) { this.flowStep--; this.renderFlow(true); }
    }

    @addEventListener('.rd-flow-close', 'click', { delegate: true })
    onFlowClose() {
      this.flowStep = -1;
      this.renderFlow();
    }

    /**
     * 흐름의 출발·도착 노드 테두리를 파랗게. mermaid classDef 색은 SVG 안 #id 선택자 + !important라
     * 바깥 CSS로는 못 이긴다 → 도형에 인라인 !important로 칠하고, 끌 때 원래 인라인 값을 돌려놓는다.
     */
    private static markNode(g: Element, on: boolean) {
      g.classList.toggle('rd-flow-node', on);
      g.querySelectorAll<SVGElement>(':scope > rect, :scope > polygon, :scope > circle, :scope > path, :scope > g > circle').forEach(s => {
        if (on) {
          if (s.dataset.flowStroke === undefined) s.dataset.flowStroke = s.style.getPropertyValue('stroke');
          s.style.setProperty('stroke', '#2563eb', 'important');
        } else if (s.dataset.flowStroke !== undefined) {
          s.style.removeProperty('stroke');
          if (s.dataset.flowStroke) s.style.setProperty('stroke', s.dataset.flowStroke);
          delete s.dataset.flowStroke;
        }
      });
    }

    /** mermaid 노드 g의 id(<svgId>-flowchart-NAV-12) → 도식 소스의 노드 id(NAV) */
    private static nodeKey(svg: Element, g: Element) {
      const prefix = `${svg.id}-`;
      const raw = g.id.startsWith(prefix) ? g.id.slice(prefix.length) : g.id;
      return raw.replace(/^flowchart-/, '').replace(/-\d+$/, '');
    }

    /** 노드 사전에서 해당 카드로 스크롤하고 잠깐 강조 */
    private scrollToNode() {
      if (!this.focusNode) return;
      const card = this.shadowRoot?.querySelector(`#node-${this.focusNode}`) as HTMLElement | null;
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.shadowRoot?.querySelectorAll('.rd-card.flash').forEach(c => c.classList.remove('flash'));
      void card.offsetWidth;
      card.classList.add('flash');
    }

    /** mermaid SVG의 subgraph(<svgId>-S0)·노드(<svgId>-flowchart-NAV-12)에 클릭을 붙임 — 노드는 노드 사전 카드로, 섹터는 섹션으로 */
    private bindLinks(scope: HTMLElement, links?: Record<string, Section>, nodes?: Record<string, string>) {
      if (!links && !nodes) return;
      scope.querySelectorAll('pre.mermaid svg').forEach(svg => {
        const prefix = `${svg.id}-`;
        svg.querySelectorAll('g.cluster, g.node').forEach(g => {
          const key = g.classList.contains('node') ? RosDesign.nodeKey(svg, g) : (g.id.startsWith(prefix) ? g.id.slice(prefix.length) : g.id);
          const nodeId = g.classList.contains('node') ? nodes?.[key] : undefined;
          const target = nodeId ? undefined : links?.[key];
          if (!nodeId && !target) return;
          g.classList.add('rd-link');
          const tip = w.document.createElementNS('http://www.w3.org/2000/svg', 'title');
          tip.textContent = nodeId ? '→ 노드 사전에서 자세히 보기' : `→ ${SECTIONS[target!].label} 섹션으로 이동`;
          g.prepend(tip);
          g.addEventListener('click', e => { e.stopPropagation(); nodeId ? this.navigate('catalog', nodeId) : this.navigate(target!); });
        });
      });
    }

    private updateNav() {
      const idx = ORDER.indexOf(this.section!);
      const prev = this.shadowRoot?.querySelector('.rd-prev') as HTMLButtonElement;
      const next = this.shadowRoot?.querySelector('.rd-next') as HTMLButtonElement;
      if (prev) { prev.disabled = idx <= 0; prev.textContent = idx > 0 ? `◀ ${SECTIONS[ORDER[idx - 1]].label}` : '◀'; }
      if (next) { next.disabled = idx >= ORDER.length - 1; next.textContent = idx < ORDER.length - 1 ? `${SECTIONS[ORDER[idx + 1]].label} ▶` : '▶'; }
    }

    @addEventListener('.rd-sec', 'click', { delegate: true })
    onSec(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rd-sec') as HTMLElement;
      if (btn) this.navigate(btn.dataset.sec as Section);
    }

    @addEventListener('.rd-nref', 'click', { delegate: true })
    onNodeRef(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rd-nref') as HTMLElement;
      if (btn?.dataset.node) this.navigate('catalog', btn.dataset.node);
    }

    /** 다른 개념 탭(예: ros2_control)의 특정 섹션으로 — 노드 카드 가이드 버튼, 본문 버튼 */
    @addEventListener('.rd-tab, .rd-guide', 'click', { delegate: true })
    onTab(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rd-tab, .rd-guide') as HTMLElement;
      if (btn?.dataset.concept) this.goConcept(btn.dataset.concept, btn.dataset.cs);
    }

    @swcAppRouteGo
    private goConcept(concept: string, cs?: string) {
      this.scrollMemo.set(RosDesign.key(this.section, this.focusNode), w.scrollY);
      return { path: `/ros2?concept=${concept}${cs ? `&cs=${cs}` : ''}`, scrollToTop: false };
    }

    /** 노드 사전의 메시지 타입 → 메시지 타입 탭 해당 카드 (뒤로가기로 이 카드에 돌아옴) */
    @addEventListener('.rd-mref', 'click', { delegate: true })
    onMsgRef(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rd-mref') as HTMLElement;
      if (btn?.dataset.msg) this.goMsg(btn.dataset.msg);
    }

    /** 노드 사전의 주요 파라미터 → 파라미터 탭 사전의 해당 행 */
    @addEventListener('.rd-pref', 'click', { delegate: true })
    onParamRef(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rd-pref') as HTMLElement;
      if (btn?.dataset.pg) this.goParam(btn.dataset.pg, btn.dataset.p);
    }

    @swcAppRouteGo
    private goParam(pg: string, p?: string) {
      const q = new URLSearchParams({ concept: 'param', pg });
      if (p) q.set('p', p);
      return { path: `/ros2?${q.toString()}`, scrollToTop: false };
    }

    @swcAppRouteGo
    private goMsg(id: string) {
      return { path: `/ros2?concept=msgs&msg=${encodeURIComponent(id)}`, scrollToTop: false };
    }

    /** 돌아가기 — 출발한 섹션으로 (그 섹션에서 보던 스크롤 위치까지 복원) */
    @addEventListener('.rd-back', 'click', { delegate: true })
    onBack() {
      if (this.back) this.navigate(this.back);
    }

    @addEventListener('.rd-prev', 'click')
    onPrev() {
      const i = ORDER.indexOf(this.section!);
      if (i > 0) this.navigate(ORDER[i - 1]);
    }

    @addEventListener('.rd-next', 'click')
    onNext() {
      const i = ORDER.indexOf(this.section!);
      if (i < ORDER.length - 1) this.navigate(ORDER[i + 1]);
    }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .rd-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:12px; }
          .rd-intro b { color:#22314e; }
          .rd-legend { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
          .rd-legend { align-items:center; }
          .rd-legend span { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:700; padding:2px 8px; border-radius:10px; border:1px solid #cbd5e1; background:#fff; color:#334155; }
          .rd-legend span svg { flex-shrink:0; }
          .rd-legend code { background:#f1f5f9; border-radius:4px; padding:0 4px; font-size:10.5px; }
          .rd-lg-h { font-size:11px; color:#22314e; min-width:30px; }
          .rd-secs { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; scroll-margin-top:12px; }
          .rd-sec { padding:6px 12px; border-radius:16px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#22314e; font-size:12px; font-weight:700; cursor:pointer; }
          .rd-sec.active { background:linear-gradient(135deg,#22314e,#7dd3fc); color:#fff; border-color:transparent; }
          .rd-body { background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; margin-top:10px; font-size:13px; color:#334155; line-height:1.75; overflow-wrap:anywhere; }
          .rd-body h2 { font-size:16px; font-weight:800; color:#1e293b; margin:18px 0 8px; padding-bottom:4px; border-bottom:2px solid #e0f2fe; }
          .rd-body h2:first-child { margin-top:0; }
          .rd-body h3 { font-size:14px; font-weight:800; color:#22314e; margin:16px 0 6px; }
          .rd-body p { margin:6px 0; }
          .rd-body ul, .rd-body ol { padding-left:20px; margin:6px 0; }
          .rd-body li { margin:3px 0; }
          .rd-body code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .rd-body pre { background:#0f172a; color:#e2e8f0; border-radius:8px; padding:10px 12px; overflow-x:auto; font-size:12px; line-height:1.55; }
          .rd-body pre code { background:none; padding:0; color:inherit; }
          .rd-body pre.mermaid { background:#fff; color:#1e293b; border:1px solid #e2e8f0; text-align:center; }
          .rd-body pre.mermaid svg { max-width:100%; height:auto; }
          /* 본문 스타일(p 여백·overflow-wrap·pre 폰트)이 mermaid 라벨에 새면 측정값과 달라져 글자가 잘림 → 도식 안은 초기화 */
          .rd-body pre.mermaid { overflow-wrap:normal; white-space:normal; line-height:normal; font-size:16px; }
          .rd-body pre.mermaid p { margin:0; }
          .rd-body g.rd-link { cursor:pointer; }
          .rd-body g.node.rd-link:hover > rect, .rd-body g.node.rd-link:hover > polygon, .rd-body g.node.rd-link:hover > circle, .rd-body g.node.rd-link:hover > g > circle { stroke-width:3px !important; filter:drop-shadow(0 2px 4px rgba(34,49,78,0.35)); }
          .rd-body g.cluster.rd-link:hover > rect { stroke-width:3px !important; stroke:#3b82c4 !important; }
          .rd-flow { margin:10px 0; padding:8px 10px; border:1.5px solid #bae6fd; border-radius:10px; background:#f0f9ff; line-height:1.5; }
          .rd-flow.on { position:sticky; top:0; z-index:5; border-color:#3b82c4; background:#fff; box-shadow:0 4px 14px rgba(34,49,78,0.18); }
          .rd-flow-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px; }
          .rd-flow-h { font-size:12.5px; color:#22314e; }
          .rd-flow-sel { flex:1 1 220px; min-width:0; max-width:360px; padding:5px 8px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; color:#1e293b; font:inherit; font-size:12.5px; }
          .rd-flow-btns { display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap; }
          .rd-flow button { padding:5px 12px; border-radius:14px; border:1.5px solid #3b82c4; background:#eff6ff; color:#1e3a8a; font:inherit; font-size:12.5px; font-weight:800; cursor:pointer; }
          .rd-flow button:disabled { opacity:.35; cursor:default; }
          .rd-flow button[hidden] { display:none; }
          .rd-flow-close { border-color:#cbd5e1 !important; background:#fff !important; color:#475569 !important; }
          .rd-flow-no { font-size:12px; font-weight:800; color:#22314e; min-width:44px; text-align:center; font-variant-numeric:tabular-nums; }
          .rd-flow-cap { margin-top:6px; font-size:12.5px; color:#334155; }
          .rd-flow-cap b { color:#1d4ed8; margin-right:4px; }
          .rd-body g.node.rd-flow-node > rect, .rd-body g.node.rd-flow-node > polygon, .rd-body g.node.rd-flow-node > circle, .rd-body g.node.rd-flow-node > g > circle { stroke:#2563eb !important; stroke-width:3.5px !important; filter:drop-shadow(0 0 4px rgba(37,99,235,0.45)); }
          .rd-body blockquote { margin:10px 0; padding:8px 12px; background:#fff7ed; border-left:4px solid #f59e0b; border-radius:0 6px 6px 0; color:#7c2d12; }
          .rd-body blockquote p { margin:0; }
          .rd-body table { display:block; overflow-x:auto; border-collapse:collapse; margin:8px 0; font-size:12px; max-width:100%; }
          .rd-body th, .rd-body td { border:1px solid #e2e8f0; padding:5px 8px; text-align:left; vertical-align:top; }
          .rd-body th { background:#f0f9ff; color:#22314e; white-space:nowrap; }
          .rd-body tr:nth-child(even) td { background:#fafcff; }
          .rd-body input[type=checkbox] { margin-right:6px; }
          .rd-body ul:has(input[type=checkbox]) { list-style:none; padding-left:4px; }
          .rd-back { position:sticky; top:8px; z-index:2; margin-bottom:8px; padding:6px 14px; border-radius:16px; border:1.5px solid #3b82c4; background:#eff6ff; color:#1e3a8a; font-size:12px; font-weight:800; cursor:pointer; box-shadow:0 2px 6px rgba(34,49,78,0.15); }
          .rd-howlegend { font-size:12px; color:#475569; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px 10px; }
          .rd-cindex { display:flex; flex-direction:column; gap:6px; margin:10px 0 16px; }
          .rd-cidx { display:flex; flex-wrap:wrap; gap:5px; align-items:center; }
          .rd-cidx b { font-size:12px; color:#22314e; min-width:92px; }
          .rd-nref { padding:1px 8px; border-radius:10px; border:1px solid #bae6fd; background:#f0f9ff; color:#1e3a8a; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; }
          .rd-nref:hover { background:#dbeafe; }
          .rd-mref { padding:0; border:none; background:none; color:#1d4ed8; font:inherit; font-size:inherit; cursor:pointer; text-decoration:underline dotted; text-underline-offset:2px; }
          .rd-mref:hover { color:#1e3a8a; text-decoration-style:solid; }
          .rd-pref { padding:0 4px; border:1px solid #fde68a; border-radius:4px; background:#fffbeb; color:#92400e; font-family:ui-monospace,monospace; font-size:12px; cursor:pointer; }
          .rd-pref:hover { background:#fef3c7; }
          .rd-setup { margin:4px 0; padding-left:22px; }
          .rd-setup li { margin:4px 0; }
          .rd-guide { margin:8px 0 4px; padding:6px 14px; border-radius:16px; border:1.5px solid #3b82c4; background:#eff6ff; color:#1e3a8a; font:inherit; font-size:12.5px; font-weight:800; cursor:pointer; }
          .rd-guide:hover { background:#dbeafe; }
          .rd-tab { margin:2px 4px 2px 0; padding:6px 14px; border-radius:16px; border:1.5px solid #3b82c4; background:#eff6ff; color:#1e3a8a; font:inherit; font-size:12.5px; font-weight:800; cursor:pointer; }
          .rd-tab:hover { background:#dbeafe; }
          .rd-cgroup { margin-top:22px !important; padding:4px 10px; background:#f0f9ff; border-left:4px solid #3b82c4; border-radius:0 6px 6px 0; }
          .rd-card { border:1px solid #e2e8f0; border-left:5px solid #2e7d32; border-radius:10px; padding:10px 14px; margin:12px 0; scroll-margin-top:52px; background:#fff; }
          .rd-card.custom { border-left-color:#e65100; }
          .rd-card.flash { animation:rdflash 1.8s ease-out; }
          @keyframes rdflash { 0%,30% { box-shadow:0 0 0 4px rgba(59,130,196,0.55); background:#eff6ff; } 100% { box-shadow:none; background:#fff; } }
          .rd-card header { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
          .rd-card h4 { margin:0; font-size:15px; font-weight:800; color:#1e293b; }
          .rd-ctag { font-size:11px; font-weight:800; padding:2px 8px; border-radius:10px; background:#e8f5e9; color:#1b5e20; }
          .rd-card.custom .rd-ctag { background:#fff3e0; color:#bf360c; }
          .rd-cmeta { display:flex; flex-wrap:wrap; gap:4px 14px; font-size:12px; color:#64748b; margin-top:4px; }
          .rd-crole { margin:8px 0 !important; }
          .rd-card h5 { font-size:12.5px; font-weight:800; color:#22314e; margin:12px 0 4px; }
          .rd-io { display:block; overflow-x:auto; border-collapse:collapse; font-size:12px; max-width:100%; }
          .rd-io th, .rd-io td { border:1px solid #e2e8f0; padding:4px 7px; text-align:left; vertical-align:top; }
          .rd-io th { background:#f8fafc; white-space:nowrap; }
          .rd-io td.rd-how { white-space:nowrap; font-weight:700; }
          .rd-io code { font-size:11.5px; overflow-wrap:anywhere; }
          .rd-none { color:#94a3b8; font-size:12px; }
          .rd-params { columns:2; column-gap:16px; }
          @media(max-width:600px){
            .rd-params { columns:1; } .rd-cidx b { min-width:auto; width:100%; }
            /* 좁은 화면: 입출력 표를 행마다 세로 카드로 */
            .rd-io thead { display:none; }
            .rd-io, .rd-io tbody, .rd-io tr, .rd-io td { display:block; width:100%; }
            .rd-io tr { box-sizing:border-box; border:1px solid #e2e8f0; border-radius:8px; padding:6px 8px; margin-bottom:6px; }
            .rd-io td, .rd-io td code { box-sizing:border-box; overflow-wrap:anywhere; }
            .rd-io td { border:none; padding:1px 0; }
            .rd-io td.rd-empty { display:none; }
            .rd-io td[data-h]::before { content:attr(data-h); display:inline-block; min-width:52px; font-size:11px; font-weight:700; color:#64748b; }
          }
          .rd-msgs { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:8px; }
          .rd-msgf { font-size:12px; font-weight:800; color:#22314e; margin-bottom:2px; }
          .rd-msg pre { margin:0; }
          .rd-nav { display:flex; justify-content:space-between; gap:8px; margin-top:10px; }
          .rd-nav button { padding:7px 14px; border-radius:16px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#22314e; font-size:12px; font-weight:700; cursor:pointer; }
          .rd-nav button:disabled { opacity:0.35; cursor:default; }
          @media(max-width:600px){ .rd-body{padding:10px} .rd-body table{font-size:11px} }
        </style>

        <div class="rd-intro">
          <b>컵 가져오기 로봇</b>(TurtleBot3 Waffle Pi + OpenMANIPULATOR-X + pole_cam·gripper_cam)의 <b>실전 노드 설계 최종본</b>입니다.
          VLM이 계획하고, Nav2·MoveIt이 확정 실행하고, 학습 모델은 앞에서 자문·뒤에서 보정만 합니다. 섹션 버튼으로 이동하고, 도식의 노드를 누르면 <b>노드 사전</b>에서 입출력·메시지 타입을 볼 수 있습니다.
          <div class="rd-legend"><b class="rd-lg-h">색</b>
            <span style="background:#c8e6c9;border-color:#2e7d32">확정 실행 (📦·🛠️ 모두)</span>
            <span style="background:#ffe0b2;border-color:#e65100">학습 (RL·지도학습)</span>
            <span style="background:#d1c4e9;border-color:#4527a0">VLM</span>
            <span style="background:#ffcdd2;border-color:#c62828">안전</span>
            <span style="background:#fff9c4;border-color:#f9a825">하드웨어</span>
          </div>
          <div class="rd-legend"><b class="rd-lg-h">모양</b>
            <span><svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><rect x="3" y="2" width="24" height="12" fill="#c8e6c9" stroke="#2e7d32"/></svg>사각형 = ROS 노드·컨트롤러</span>
            <span><svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><polygon points="7,2 23,2 28,8 23,14 7,14 2,8" fill="#fff9c4" stroke="#f9a825"/></svg>육각형 = 하드웨어 (토픽 없음, 🔌로 드라이버에 연결)</span>
            <span><svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><circle cx="15" cy="8" r="6.5" fill="#fff" stroke="#475569"/><circle cx="15" cy="8" r="4" fill="none" stroke="#475569"/></svg>이중원 = 사람</span>
            <span><svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><rect x="2" y="2" width="26" height="12" rx="6" fill="#fff" stroke="#8A97A0" stroke-dasharray="3 2"/></svg>점선 알약 = 다른 섹션과 잇는 연결점 (← 들어옴 · → 나감, 숫자 = 섹션 번호)</span>
            <span><svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><path d="M6,4 v8 a9,2.5 0 0 0 18,0 v-8" fill="#fff" stroke="#475569"/><ellipse cx="15" cy="4" rx="9" ry="2.5" fill="#fff" stroke="#475569"/></svg>원통 = 파일·데이터셋</span>
            <span><svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><rect x="1.5" y="1.5" width="27" height="13" rx="2" fill="#f5f3ff" stroke="#c4b5fd"/></svg>큰 영역 = 계층·섹터·프로세스 경계</span>
            <span><svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><rect x="1.5" y="1.5" width="27" height="13" rx="2" fill="#fffde7" stroke="#f9a825" stroke-width="1.5"/></svg>노란 영역 = 물리 하드웨어 (전체 아키텍처)</span>
            <span>🛠️ 직접 작성 노드</span>
            <span>📦 제공 패키지 노드 (ROS 2·Nav2·MoveIt·ros2_control 등)</span>
          </div>
          <div class="rd-legend"><b class="rd-lg-h">선</b>
            <span><svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><line x1="2" y1="8" x2="24" y2="8" stroke="#334155" stroke-width="1.5"/><path d="M23,4 L29,8 L23,12z" fill="#334155"/></svg>실선 = 토픽·데이터 흐름</span>
            <span><svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><line x1="2" y1="8" x2="23" y2="8" stroke="#334155" stroke-width="3.5"/><path d="M22,3 L29,8 L22,13z" fill="#334155"/></svg>굵은 선 = 액션 (goal → feedback → result)</span>
            <span><svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><line x1="2" y1="8" x2="24" y2="8" stroke="#334155" stroke-width="1.5" stroke-dasharray="2 2"/><path d="M23,4 L29,8 L23,12z" fill="#334155"/></svg>점선 = 서비스·파라미터·피드백·매핑 단계 전용</span>
            <span><svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><line x1="2" y1="5" x2="23" y2="5" stroke="#334155" stroke-width="1.5"/><path d="M22,2 L28,5 L22,8z" fill="#334155"/><line x1="7" y1="12" x2="28" y2="12" stroke="#334155" stroke-width="1.5"/><path d="M8,9 L2,12 L8,15z" fill="#334155"/></svg>오가는 내용이 다르면 화살표 2개 (예: 버스 쓰기 SyncWrite ↓ · 읽기 SyncRead ↑)</span>
            <span><svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><line x1="2" y1="8" x2="28" y2="8" stroke="#334155" stroke-width="1.5"/></svg>화살촉 없음 = 체인 결합 (같은 프로세스)</span>
            <span>화살표 방향 = 데이터가 흐르는 방향</span>
            <span>👆 선·라벨에 마우스 = 강조 · 클릭 = 선택 고정 (여러 개, 다시 누르면 해제, 빈 곳 누르면 전체 해제)</span>
          </div>
          <div class="rd-legend"><b class="rd-lg-h">라벨</b>
            <span>✉️ 토픽</span>
            <span>🎬 액션</span>
            <span>📞 서비스</span>
            <span>🔌 시리얼·USB</span>
            <span>🧩 ros2_control 내부 인터페이스</span>
            <span>💾 파일</span>
            <span>🗣️ 사람 → 로봇 (말·텍스트) · ⌨️ 키보드</span>
            <span>🔊 로봇 → 사람 (음성 안내)</span>
            <span>형식: <b>이모지 이름 (메시지 타입)</b></span>
          </div>
        </div>

        <div class="rd-secs">
          ${ORDER.map(k => `<button class="rd-sec" data-sec="${k}">${SECTIONS[k].label}</button>`).join('')}
        </div>
        <div class="rd-body" id="rd-body"></div>
        <div class="rd-nav"><button class="rd-prev">◀</button><button class="rd-next">▶</button></div>
      `;
    }
  }

  return tagName;
};
