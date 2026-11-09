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
  | 'overview' | 'arch' | 'sense' | 'plan' | 'nav' | 'map' | 'arm' | 'base' | 'tf'
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
      { e: ['PCH>PC', 'PC>PER'], t: '카메라는 늘 보고 있다', d: 'pole_front_cam(·gripper_cam) 영상·depth가 USB로 드라이버 → perception으로 계속 흐릅니다. 명령과 상관없이 상시 입력입니다.' },
      { e: ['PER>VLM', 'PER>CO'], t: '무엇이 어디 있나', d: '✉️ /tracked_objects — 컵 id 3, 테이블 id 5, 의자 id 7. VLM은 계획에, coordinator는 id 검증에 씁니다.' },
      { e: ['VLM>CO'], t: 'VLM이 순서만 정한다', d: '✉️ /task/sub_goals [navigate(테이블 앞) → pick(컵) → navigate(사람) → place]. 어떻게 움직일지는 정하지 않습니다.' },
      { e: ['VLM>SIM'], t: '계획 응답이 조작 창에', d: '📁 /task/sub_goals 파일 → 시뮬레이터 조작 창 응답줄. VLM 거절(보류)도 say 계획으로 보여준다.' },
      { e: ['CO>BT'], t: '이동 시작', d: 'coordinator가 검증 후 테이블 앞 (3.45, 0.9)을 계산해 🎬 /navigate_to_pose 액션을 보냅니다 (이동 전 팔 stow는 아직 TODO).' },
      { e: ['PC>PRS', 'PRS>RXS', 'RXS>RTAB', 'BF>PCA', 'PCA>RTAB', 'DDC>EKF', 'IMB>EKF', 'EKF>RTAB', 'RTAB>PS', 'EKF>CS'], t: '내가 지도 어디에 있나', d: 'rtabmap이 map→odom, EKF가 odom→base_footprint를 냅니다. 둘을 이으면 Nav2가 지도 기준 로봇 위치를 압니다.' },
      { e: ['PC>BF', 'BF>COST', 'COST>PS'], t: '장애물 지도', d: 'body_filter가 pole_front_cam 점구름에서 팔·차체 점을 뺀 /points_filtered가 costmap(local voxel · global obstacle)에 쌓여 의자를 피하는 경로를 만듭니다.' },
      { e: ['BF>RLN', 'IMB>RLN', 'EKF>CS'], t: '주행 정책 — 무엇을 보고 판단하나', d: 'controller_server의 FollowPath 플러그인(ml::RlNavController)은 경로 웨이포인트·local costmap·현재 속도(/odometry/filtered)·IMU gyro·몸 뺀 점구름으로 만든 360방향 가상 스캔을 관측으로 씁니다.' },
      { e: ['BT>CS', 'CS>RLN'], t: '주행 정책 — 결정', d: 'ONNX 정책이 v·ω를 직접 냅니다. enable=false이거나 모델·점구름이 없으면 inner DWB가 그대로 주행합니다 (Δ 보정 없음).' },
      { e: ['RLN>TM', 'TM>VS'], t: 'Nav2 속도 명령 → 안전 체인', d: '✉️ /cmd_vel_nav = (0.12 m/s, 0.30 rad/s), 20Hz. twist_mux(자동·수동 선택) → velocity_smoother(가속 제한)로 갑니다.' },
      { e: ['VS>CMN', 'BF>CMN'], t: '안전 — 가속 제한 → 충돌 감시', d: 'velocity_smoother가 가속을 자르고, collision_monitor가 몸 뺀 점구름으로 의자까지 거리를 봅니다(0.5m — SlowZone 0.3m 밖이라 통과).' },
      { e: ['CMN>DDC', 'DDC>HWI'], t: '최종 /cmd_vel', d: 'controller_manager 안의 diff_drive_controller가 받아 바퀴 각속도 command로 바꿉니다 (좌 2.72, 우 5.76 rad/s).' },
      { e: ['HWI>HW', 'HW>HWI'], t: '모터로', d: 'BeebotSystemHardware가 100Hz로 C 줄(목표)을 쓰고 S 줄(상태)을 읽습니다. 다이나믹셀 BulkWrite·SyncRead는 OpenCR 펌웨어가 합니다. 테이블 앞에 도착하면 Nav2 액션 결과가 "성공".' },
      { e: ['GCH>GC', 'GC>GS', 'PER>GS', 'CO>GS'], t: '어떻게 잡을까', d: '/tracked_objects로 대상 컵을 찾고 gripper_cam 근접 점구름으로 후보를 매김. 📞 /score_grasps → [B 0.87, C 0.62, A 0.41].' },
      { e: ['CO>MG', 'CO>MG#2'], t: '집기 실행', d: '📞 /clear_octomap·/apply_planning_scene → 📞 /plan_kinematic_path 후보 B → 🎬 /execute_trajectory — 접근·들어올리기 궤적을 move_group이 계획·실행 (MTC는 아직 TODO).' },
      { e: ['MG>JTC'], t: '팔 궤적', d: '🎬 /arm_controller/follow_joint_trajectory — 액션 서버는 controller_manager가 아니라 그 안에 올라간 arm_controller(JTC)입니다.' },
      { e: ['JTC>RLA', 'RLA>HWI'], t: '팔 처짐 보정', d: 'JTC 목표(joint1~5)를 rl_arm_correction reference로 → + Δ(±0.05rad) → joint1~5/position command. joint2 중력 처짐 보상이 목표 (ONNX 잔차 정책은 TODO — 중력 처짐 앞먹임은 구현).' },
      { e: ['CO>GRC', 'GRC>HWI'], t: '그리퍼', d: '🎬 /gripper_controller/gripper_cmd (ParallelGripperCommand)는 coordinator가 직접 보냅니다 (MoveIt 경유 아님). gripper_controller가 gripper_left_joint command를 씁니다.' },
      { e: ['HWI>HW', 'HW>HWI'], t: '팔 모터로', d: '같은 OpenCR 시리얼로 팔 관절 목표를 쓰고 현재값(위치·속도·전류·온도)을 읽습니다.' },
      { e: ['HWI>JSB', 'JSB>ASM', 'ASM>CO'], t: '안전 감시는 항상', d: 'joint_state_broadcaster가 낸 /joint_states를 arm_safety_monitor가 계속 봅니다. 이상이 없으면 조용합니다.' },
      { e: ['CO>BT', 'CO>MG#2', 'CO>GRC'], t: '사람에게 가서 내려놓기', d: '컵을 든 채 이동 → place(위로 이동 후 그리퍼 벌리기). 경로는 위 이동 단계와 같습니다 (든 채 footprint 확장은 TODO).' },
      { e: ['CO>VLM'], t: '완료 보고', d: '✉️ /task/status 완료 — VLM은 다음 명령을 기다립니다.' },
      { e: ['CO>UI', 'UI>U'], t: '사람에게 알림', d: '✉️ /robot/say → user_input이 터미널에 "컵 가져왔어요" (음성 voice_ui 자리). 끝.' },
    ],
  },
  {
    label: '베이스 속도 명령 한 주기 (20Hz)',
    steps: [
      { e: ['BT>CS', 'CS>RLN'], t: 'Nav2 controller — FollowPath 플러그인', d: 'controller_server가 /plan을 따라갈 속도를 계산합니다. FollowPath 자리의 ml::RlNavController가 ONNX 정책으로 v·ω를 직접 냅니다.' },
      { e: ['BF>RLN', 'IMB>RLN', 'EKF>CS', 'RLN>TM', 'TM>VS'], t: '정책 관측 → 속도 → 안전', d: '가상 스캔·/imu gyro·현재 속도로 정책을 돌립니다. 모델이 없거나 enable=false면 inner DWB가 그대로 냅니다. /cmd_vel_nav는 Δ 보정 없이 twist_mux → velocity_smoother로 갑니다.' },
      { e: ['VS>CMN', 'BF>CMN'], t: '가속 제한 → 충돌 감시', d: '갑작스러운 가속을 막고, 몸 뺀 점구름이 다각형(Approach·SlowZone)에 걸리면 감속·정지.' },
      { e: ['CMN>DDC', 'DDC>HWI'], t: 'diff_drive_controller', d: '/cmd_vel을 바퀴 각속도 command로 바꿉니다.' },
      { e: ['HWI>HW', 'HW>HWI'], t: '쓰고 읽기', d: 'BeebotSystemHardware가 바퀴 목표 속도를 쓰고, 실제 바퀴 회전과 IMU를 읽습니다.' },
      { e: ['DDC>EKF', 'IMB>EKF', 'EKF>CS'], t: '피드백', d: '/odom(diff_drive)·/imu(imu broadcaster) → EKF → /odometry/filtered. Nav2가 다음 명령을 계산할 때 현재 속도로 씁니다.' },
    ],
  },
  {
    label: '팔 한 주기 — controller_manager read → update → write',
    steps: [
      { e: ['MG>JTC'], t: '입력', d: 'move_group이 arm_controller(JTC)에 팔 궤적을 보냅니다 (동작 시작 때 1회). 다음 update에서 쓰입니다.' },
      { e: ['HW>HWI'], t: 'read', d: 'BeebotSystemHardware가 OpenCR S 줄에서 관절 위치·속도·전류(effort)·IMU를 읽어 state interface에 넣습니다.' },
      { e: ['HWI>JSB', 'JSB>ASM', 'JSB>CO', 'JSB>MC', 'JSB>SM', 'HWI>IMB', 'DDC>EKF', 'IMB>EKF', 'IMB>RLN'], t: 'update — 상태 발행', d: 'joint_state_broadcaster → /joint_states(→ arm_safety_monitor 전류 · coordinator 현재 각도 · manual_control 수동 기준 · state_manager 연결 확인), diff_drive → /odom, imu_sensor_broadcaster → /imu(→ EKF, FollowPath의 gyro 관측).' },
      { e: ['JTC>RLA'], t: 'update — JTC 목표', d: 'JTC가 이번 주기 목표 관절각을 rl_arm_correction의 reference interface에 씁니다 (체인).' },
      { e: ['RLA>HWI'], t: 'update — 보정', d: 'Δ(±0.05rad)를 더해 joint1~5/position command로 씁니다.' },
      { e: ['HWI>HW'], t: 'write', d: '최종 명령을 OpenCR C 줄로. 다음 주기 read로 돌아갑니다 (100Hz).' },
      { e: ['ASM>JTC'], t: '이상 시에만', d: 'arm_safety_monitor가 문제를 찾으면 arm_controller의 follow_joint_trajectory goal을 취소합니다 (주기와 무관한 비동기 호출).' },
    ],
  },
  {
    label: '위치 추정 — map·odom은 어디서 오나',
    steps: [
      { e: ['HW>HWI', 'HWI>IMB'], t: '바퀴·IMU 원자료', d: 'BeebotSystemHardware가 OpenCR에서 바퀴 회전과 IMU를 읽습니다.' },
      { e: ['DDC>EKF', 'IMB>EKF'], t: '/odom · /imu', d: 'diff_drive가 바퀴만으로 계산한 /odom, imu broadcaster의 /imu가 EKF로.' },
      { e: ['EKF>CS'], t: 'odom→base_footprint', d: 'EKF가 둘을 융합해 연속적인(대신 드리프트 있는) odom→base_footprint TF를 냅니다.' },
      { e: ['PCH>PC', 'PC>PRS', 'PRS>RXS', 'RXS>RTAB', 'GC>SCG', 'SCG>GRS', 'GRS>RXS', 'BF>PCA', 'PCA>RTAB', 'EKF>RTAB'], t: 'RTAB-Map 입력', d: 'pole_front_cam 컬러·depth(+ 스캔 자세일 때 gripper_cam) · 몸 뺀 점구름(scan_cloud) + 오도메트리(EKF의 odom TF)로 지도와 맞춰봅니다.' },
      { e: ['RTAB>PS'], t: 'map→odom', d: 'rtabmap이 드리프트를 상쇄하는 map→odom을 냅니다. 가끔 점프하지만 odom 쪽은 끊기지 않습니다 (맵핑·위치추정 탭 참고).' },
    ],
  },
  {
    label: '파지 실패 → 재시도 → 재계획 → 다시 집기',
    steps: [
      { e: ['CO>GS'], t: '후보 점수', d: '📞 /score_grasps → [B 0.87, C 0.62, A 0.41].' },
      { e: ['CO>MG#2', 'CO>GRC'], t: '1순위 B 시도 → 실패', d: '그리퍼가 완전히 닫힘(빈손) → coordinator가 놓친 것으로 판단.' },
      { e: ['CO>MG#2', 'CO>GRC'], t: '2순위 C 재시도 → 또 실패', d: 'VLM을 부르지 않고 coordinator가 직접 다음 후보로. 실행 세부는 coordinator의 권한입니다.' },
      { e: ['CO>VLM'], t: '재계획 요청', d: '✉️ /task/status (step 2, FAILED, reason: grasp_failed_all). 후보를 다 써서 이제 VLM 차례입니다.' },
      { e: ['PER>VLM', 'VLM>CO'], t: 'VLM이 새 계획', d: '지금 보이는 물체(/tracked_objects)를 다시 보고 ✉️ /task/sub_goals — 예) [navigate(테이블 옆, 컵 방향으로 정렬), pick(컵 3), navigate(사람), place].' },
      { e: ['CO>BT'], t: '새 계획 실행 — 다른 방향으로 이동', d: '검증 후 🎬 /navigate_to_pose 새 접근 위치. 팔이 5축(OM-X 4축 + 손목 roll)이라 컵이 팔 평면 안에 있어야 옆 파지가 되므로 방향이 중요합니다.' },
      { e: ['GC>GS', 'CO>GS'], t: '새 위치에서 후보 다시', d: '장면을 갱신하고 gripper_cam 새 점구름으로 📞 /score_grasps를 다시 — 예) [D 0.81, B 0.70].' },
      { e: ['CO>MG', 'CO>MG#2', 'CO>GRC'], t: '다시 집기 → 성공', d: '📞 plan + 🎬 execute 후보 D → 그리퍼 닫기 → 파지 성공. 성공하면 원래 계획대로 사람에게 전달하러 이어갑니다.' },
      { e: ['CO>UI', 'UI>U'], t: '재계획도 실패하면 — 알리고 정지', d: 'pick 단계가 두 번째로 실패(같은 단계 2회 연속)하면 ✉️ /robot/say → "컵을 잡을 수 없어요" 표시 후 정지. 이건 재계획을 해 보고도 안 될 때만입니다.' },
    ],
  },
  {
    label: '이동 실패 → 복구 → 재계획',
    steps: [
      { e: ['CO>BT'], t: '이동 중 막힘', d: '🎬 /navigate_to_pose 진행 중, 의자가 통로를 막아 경로가 안 나오거나 로봇이 제자리에 갇힙니다.' },
      { e: ['BT>BS', 'BS>TM', 'TM>VS', 'VS>CMN', 'CMN>DDC'], t: 'Nav2가 먼저 스스로 복구', d: 'bt_navigator가 Spin·BackUp·Wait 복구를 시도합니다. behavior_server가 /cmd_vel_nav를 내고 복구 중 속도 명령도 같은 안전 체인을 거칩니다 (BackUp은 0.1m 이하).' },
      { e: ['CO>BT'], t: '복구도 실패 → ABORTED', d: '정해진 재시도 횟수를 넘기면 NavigateToPose가 ABORTED로 끝나고, 결과가 coordinator에 돌아옵니다.' },
      { e: ['CO>VLM'], t: '실패 보고', d: '✉️ /task/status (step 1, FAILED, reason: nav_failed). VLM은 FAILED를 받으면 재계획합니다.' },
      { e: ['VLM>CO'], t: '재계획', d: '✉️ /task/sub_goals 다시 — 예) "테이블 반대편으로 접근", "의자를 피해 다른 방향". coordinator가 다시 검증합니다.' },
      { e: ['CO>BT'], t: '새 목표로 재시도', d: '🎬 /navigate_to_pose (새 접근 위치).' },
      { e: ['CO>UI', 'UI>U'], t: '또 실패하면 알리고 정지', d: '같은 단계가 2회 연속 실패하면 ✉️ /robot/say → "테이블까지 갈 수 없어요" 표시.' },
    ],
  },
  {
    label: '운영 ① SLAM 시작 — 새 지도 만들기 (자동 탐사)',
    steps: [
      { e: ['CLI>SM'], t: '지도 모드 MAPPING', d: '운영자가 ✉️ /cmd/map_mode "MAPPING" (또는 bringup map:=slam — 새 DB). 시뮬레이터 SLAM 패널도 같은 토픽입니다.' },
      { e: ['SM>RTAB'], t: 'rtabmap을 매핑 모드로', d: 'state_manager가 📞 /rtabmap/rtabmap/set_mode_mapping. 응답이 와야 /state/map_mode를 바꿉니다 (발행 값 = 진짜 상태).' },
      { e: ['SM>CO#3', 'CO>JTC'], t: '팔을 스캔 자세로', d: '✉️ /state/map_mode "MAPPING"을 받은 coordinator가 작업이 없으면 팔을 scan_pose로 세웁니다 (/arm_controller/joint_trajectory). gripper_cam도 지도에 쓰기 위해서입니다.' },
      { e: ['JSB>SCG', 'SCG>GRS', 'SCG>PCA'], t: '스캔 자세면 gripper_cam 통과', d: 'scan_cam_gate가 /joint_states로 스캔 자세를 확인한 뒤에만 gripper_cam depth·점구름을 SLAM 쪽으로 넘깁니다.' },
      { e: ['CLI>SM', 'SM>EXP'], t: '자동 탐사 시작', d: '✉️ /cmd/operation_mode "EXPLORE" → state_manager → ✉️ /state/operation_mode "EXPLORE" → explorer가 일을 시작합니다 (MAPPING일 때만 허락).' },
      { e: ['RTAB>EXP', 'EXP>BT'], t: '프론티어로 이동', d: 'explorer가 /map에서 아는 곳과 모르는 곳의 경계(프론티어)를 골라 🎬 /navigate_to_pose. 도착하거나 실패하면 다음 프론티어로.' },
      { e: ['RXS>RTAB', 'PCA>RTAB', 'EKF>RTAB', 'RTAB>PS'], t: '지도가 커진다', d: '두 카메라 RGB-D + 몸 뺀 점구름 + EKF 오도메트리로 rtabmap이 지도를 키우고 /map·map→odom을 냅니다. 출발점에 돌아오면 루프 클로저로 붙습니다.' },
      { e: ['EXP>SM'], t: '탐사 끝 → AUTO', d: '프론티어가 다 떨어지면 ✉️ /explore/result "DONE" → state_manager가 AUTO로 되돌립니다. 못 가는 프론티어만 남아도 끝나므로, 일찍 끝나면 Nav2 실패 이유를 봅니다.' },
    ],
  },
  {
    label: '운영 ② 지도 저장',
    steps: [
      { e: ['CLI>MS', 'SIM>MS'], t: '저장 요청', d: '운영자 CLI나 시뮬레이터 [지도 저장]이 📞 /map_saver/save_map (nav2_msgs/srv/SaveMap).' },
      { e: ['RTAB>MS', 'LMS>MS', 'MS>MAPDIR'], t: '/map 한 장 → 파일', d: 'map_saver가 rtabmap의 /map을 한 장 받아 <map_dir>/<이름>/map.pgm · map.yaml(2D 미리보기)로 씁니다. SLAM이 켜져 있어야 /map이 있습니다.' },
      { e: ['RTAB>MAPDIR'], t: '지도 원본은 rtabmap.db', d: '운행에 쓰는 원본은 rtabmap.db 하나(특징점·그래프·지도)로, 매핑 내내 기록되고 종료 때 확정됩니다. map.pgm은 사람이 보는 그림입니다.' },
    ],
  },
  {
    label: '운영 ③ 저장 지도로 위치추정 시작',
    steps: [
      { e: ['CLI>SM'], t: '지도 고르기', d: '✉️ /cmd/map_name "거실" (또는 bringup map:=saved map_name:=거실).' },
      { e: ['SM>RTAB', 'MAPDIR>RTAB'], t: 'DB 불러오기 + 위치추정 모드', d: '📞 /rtabmap/rtabmap/load_database(거실/rtabmap.db) → 📞 set_mode_localization. 지도는 고정되고 위치만 찾습니다.' },
      { e: ['RXS>RTAB', 'EKF>RTAB'], t: '장면 찾기', d: '지금 카메라 장면과 맞는 과거 장면을 찾는 중 — 이때는 map→odom이 없습니다. 매핑했던 곳을 천천히 비추면 빨리 찾고, 틀리면 /initialpose로 대략 위치를 알려 줍니다.' },
      { e: ['RTAB>PS'], t: 'map→odom 시작', d: '장면이 맞으면 ✉️ /map(transient_local)과 /tf (map→odom 변환)이 나옵니다. 이제 지도 기준 로봇 위치를 압니다.' },
      { e: ['LMN>BT', 'LMN>PS', 'LMN>CS', 'LMN>BS'], t: 'Nav2 활성', d: 'lifecycle_manager_navigation이 서버들을 configure → activate. 이제 목표를 받을 수 있습니다 (map→odom 전에 목표를 보내면 실패 — 시나리오 6).' },
    ],
  },
  {
    label: '운영 ④ 목표 지정 → Nav2 주행',
    steps: [
      { e: ['CO>BT'], t: '목표 보내기', d: '🎬 /navigate_to_pose — coordinator가 작업 중에, 또는 사람이 RViz Nav2 Goal(✉️ /goal_pose)로. 조작 모드는 AUTO여야 합니다.' },
      { e: ['BT>PS', 'COST>PS'], t: '경로 계산', d: 'bt_navigator가 🎬 /compute_path_to_pose → planner_server가 global costmap 위에서 경로(/plan)를 냅니다.' },
      { e: ['BT>CS', 'COST>CS', 'EKF>CS'], t: '경로 따라가기', d: '🎬 /follow_path → controller_server의 FollowPath(ml::RlNavController)가 local costmap과 현재 속도를 보며 20Hz로 속도를 계산합니다.' },
      { e: ['CS>RLN', 'BF>RLN', 'IMB>RLN'], t: '주행 정책 — FollowPath 플러그인', d: 'FollowPath 플러그인이 가상 스캔·IMU gyro·현재 속도로 정책을 돌려 v·ω를 냅니다. 정책이 없으면 inner DWB가 대신합니다.' },
      { e: ['RLN>TM', 'TM>VS', 'VS>CMN', 'CMN>DDC'], t: '안전 단계 → 바퀴', d: 'twist_mux(자동·수동 선택) → velocity_smoother(가속 제한) → collision_monitor(감속·정지) → ✉️ /cmd_vel → diff_drive_controller.' },
      { e: ['DDC>EKF', 'IMB>EKF', 'EKF>CS'], t: '실제 움직임이 돌아온다', d: '/odom·/imu → EKF → /odometry/filtered가 controller_server로 — 다음 주기 계산에 씁니다. 도착하면 follow_path 성공 → NavigateToPose SUCCEEDED.' },
    ],
  },
];

const SENSE_FLOWS: Flow[] = [
  {
    label: 'pole_front_cam 영상 → 물체 추적 → 다른 노드로',
    steps: [
      { e: ['PCH>PC'], t: '카메라 → 드라이버', d: '카메라는 🔌 USB 3로 realsense2_camera 드라이버에 붙습니다. 카메라 자체는 토픽을 내지 않고, 토픽은 드라이버 노드가 발행합니다.' },
      { e: ['PC>PER', 'PC>PER#2'], t: '영상 + depth → perception', d: '컬러 영상·camera_info와 컬러에 정렬된 depth가 30Hz(best_effort)로 들어갑니다. 정렬(align_depth)이 돼 있어야 픽셀마다 거리를 바로 읽습니다.' },
      { e: ['JS>RSP', 'RSP>PER'], t: '카메라가 어디 있나 (TF)', d: '/joint_states → robot_state_publisher → /tf. perception이 카메라 좌표의 물체를 map 기준으로 바꿀 때 이 TF를 씁니다.' },
      { e: ['PER>O2'], t: '추적 결과 발행', d: '✉️ /tracked_objects 10Hz(reliable) — 두 카메라를 융합한 id·class_name·map 기준 위치·크기·색·태그. VLM·coordinator·grasp_scorer가 같은 물체를 id로 가리키고, signal_decoder는 신호등 색을 읽습니다. 바코드·QR은 /mission/qr로.' },
    ],
  },
  {
    label: '신호등 → 미션 답 (인지가 해석까지)',
    steps: [
      { e: ['PER>SD'], t: '신호등 색', d: 'perception이 /tracked_objects의 traffic_light에 color(red·yellow·green·off · 두 색 이상 동시 = all)를 프레임마다 싣습니다.' },
      { e: ['SD>O2'], t: '깜빡임 해석 → 미션 토픽', d: '같은 perception 패키지의 signal_decoder가 깜빡임을 시간축으로 쌓아 1·2·3단계를 읽고 ✉️ /mission/signal {color, count, sum, dest_tag, raw}로 냅니다. 바코드 → /mission/qr와 같은 자리 — plan은 받아서 계획만.' },
    ],
  },
  {
    label: 'pole_front_cam 하나가 어디까지 쓰이나',
    steps: [
      { e: ['PCH>PC'], t: '한 대의 카메라', d: 'LiDAR가 없어서 거리 정보는 전부 이 RealSense에서 나옵니다.' },
      { e: ['PC>PER', 'PC>PER#2'], t: '① 인지', d: '영상·depth → perception → 물체 추적.' },
      { e: ['PC>O3'], t: '② 위치추정', d: '컬러 + 정렬 depth → rtabmap (SLAM·위치추정, map→odom).' },
      { e: ['PC>BF', 'BF>O4'], t: '③ 장애물', d: '점구름 → body_filter(자기 몸 제거) → Nav2 costmap(local voxel · global obstacle), collision_monitor. MoveIt octomap 센서는 아직 설정 전.' },
    ],
  },
  {
    label: 'gripper_cam — 집기 직전 근접 보기',
    steps: [
      { e: ['GCH>GC'], t: '그리퍼에 붙은 카메라', d: '팔과 함께 움직입니다. pole_front_cam과 다른 USB 3 컨트롤러에 꽂고 serial_no로 구분합니다.' },
      { e: ['GC>PER', 'GC>PER#2'], t: '영상 + depth → perception', d: '근접에서 컵을 다시 확인합니다.' },
      { e: ['JS>RSP', 'RSP>PER'], t: '움직이는 카메라의 위치', d: '팔이 움직이는 중이라 영상 시각(header.stamp)의 TF로 변환해야 위치가 어긋나지 않습니다.' },
      { e: ['GC>O5'], t: '근접 점구름 → grasp_scorer', d: 'gripper_cam_pointcloud:=true일 때만 (기본 꺼짐). D435 계열은 0.2~0.3m보다 가까우면 depth가 비므로 접근 시작점(약 0.3m)에서 미리 찍어 둡니다.' },
    ],
  },
  {
    label: '지도용 점구름 — 몸 빼고 두 카메라 합치기',
    steps: [
      { e: ['PC>BF', 'RSP>BF'], t: '몸 빼기', d: 'body_filter가 /robot_description(URDF collision)과 TF로 팔·차체 모양을 알고, pole_front_cam 점구름에서 그 안(+ padding)의 점을 지웁니다.' },
      { e: ['BF>O4'], t: 'Nav2로', d: '✉️ /pole_front_cam/depth/color/points_filtered → costmap(local·global)·collision_monitor.' },
      { e: ['JS>SCG', 'GC>SCG'], t: 'gripper_cam 게이트', d: '지도 만들 때 coordinator가 팔을 scan_pose로 세웁니다. scan_cam_gate는 /joint_states가 그 자세일 때만 gripper_cam depth·점구름을 통과시키고, 아니면 0·빈 점구름을 냅니다.' },
      { e: ['BF>PCA', 'SCG>PCA', 'PCA>O3'], t: '둘을 합쳐 RTAB-Map에', d: 'point_cloud_aggregator가 두 점구름을 base_footprint 하나로 묶어 ✉️ /rtabmap/scan_cloud → 격자 /map · ICP.' },
      { e: ['PC>O3', 'SCG>O3'], t: '영상도 두 대', d: 'pole_front_cam 컬러·depth와 게이트 거친 gripper_cam depth가 rgbd_sync ×2 → rgbdx_sync로 묶여 rtabmap에 들어갑니다.' },
    ],
  },
];

const PLAN_FLOWS: Flow[] = [
  {
    label: '명령 하나 처리',
    steps: [
      { e: ['USER>UI'], t: '사람이 입력한다', d: '"테이블 위 컵 가져다줘" — user_input 터미널(또는 command 파라미터·테스트베드 input_manager).' },
      { e: ['UI>VLM', 'TO>VLM'], t: 'VLM에 명령', d: '/cmd/user_command 문자열 + 지금 보이는 물체 목록(/tracked_objects)을 함께 보고 계획합니다.' },
      { e: ['VLM>AIS'], t: 'VLM 호출', d: '호스트 ai-service에 HTTP로 명령·물체·카메라 영상(px 표시)을 보내 계획을 받습니다. vlm_endpoint가 비면 템플릿 고정.' },
      { e: ['VLM>CO', 'TO>CO'], t: '계획 → coordinator 검증', d: '/task/sub_goals [navigate, pick, navigate, place]. coordinator가 형식·허용 동작·대상 id가 /tracked_objects에 실제 있는지 확인합니다.' },
      { e: ['CO>O3a'], t: '이동', d: '🎬 NavigateToPose (3.45, 0.9). (이동 전 팔 stow는 TODO)' },
      { e: ['CO>O4a#2'], t: '장면 갱신', d: '도착 후 /clear_octomap → 테이블·컵을 /apply_planning_scene으로 등록 (0.5초 안정 대기는 TODO).' },
      { e: ['CO>GS'], t: '파지 후보 점수', d: '📞 /score_grasps → [B 0.87, C 0.62, A 0.41]. pick 직전 한 번이라 서비스.' },
      { e: ['CO>O4a#2', 'CO>O4a', 'CO>O4b'], t: '집기 실행', d: '📞 /plan_kinematic_path 후보 B → 🎬 /execute_trajectory → 🎬 gripper_cmd 닫기 (MoveIt 안 거치고 직접). 실패하면 다음 후보로 다시 집기.' },
      { e: ['CO>VLM'], t: '단계 결과 보고', d: '/task/status. place까지 이동·집기를 반복한 뒤 마지막에 완료 보고.' },
      { e: ['CO>UI'], t: '말할 내용', d: '/robot/say "컵 가져왔어요" (+ /task/status 진행 표시).' },
      { e: ['UI>USER'], t: '알림 표시', d: 'user_input이 터미널에 찍습니다 (음성 voice_ui 자리 — TTS는 아직 없음). 끝.' },
    ],
  },
  {
    label: '파지 실패 → 재시도 → 재계획 → 다시 집기',
    steps: [
      { e: ['CO>O4a', 'CO>O4b'], t: '후보 B 실패', d: '그리퍼가 완전히 닫힘(빈손) → 놓친 것으로 판단.' },
      { e: ['CO>O4a', 'CO>O4b'], t: '후보 C 재시도 → 또 실패', d: 'VLM을 부르지 않고 coordinator가 직접 2순위로 (규칙 4). 실행 세부는 coordinator의 권한입니다.' },
      { e: ['CO>VLM'], t: '재계획 요청', d: '/task/status (step 2, FAILED, reason: grasp_failed_all).' },
      { e: ['TO>VLM', 'VLM>CO'], t: '새 계획', d: 'VLM이 /tracked_objects를 다시 보고 /task/sub_goals — 예) [navigate(테이블 옆, 컵 방향 정렬), pick(컵 3), navigate(사람), place]. coordinator가 다시 검증.' },
      { e: ['CO>O3a'], t: '새 접근 위치로 이동', d: 'NavigateToPose (다른 방향).' },
      { e: ['CO>O4a#2', 'CO>GS'], t: '장면 갱신 · 후보 다시', d: '멈춘 뒤 octomap 지우기·컵 등록 → 새 위치에서 /score_grasps 다시.' },
      { e: ['CO>O4a', 'CO>O4b'], t: '다시 집기 → 성공', d: '그리퍼가 컵에서 멈춤(allow_stalling) = 파지. 성공하면 원래 계획대로 사람에게 전달(이동 → place)로 이어갑니다 (attach는 TODO).' },
      { e: ['CO>UI', 'UI>USER'], t: '재계획도 실패하면 — 알리고 정지', d: 'pick이 두 번째로 실패(같은 단계 2회 연속, 규칙 5)할 때만 "컵을 잡을 수 없어요".' },
    ],
  },
  {
    label: '신호등 암호 미션 — 읽기 → 계획',
    steps: [
      { e: ['SD>VLM'], t: '미션 답 받기', d: '✉️ /mission/signal {color, count, sum, dest_tag, raw} — 신호 해석은 인지(perception signal_decoder, 1 센서·인지 탭) 몫이고, planner는 확정된 답만 받습니다 (transient_local).' },
      { e: ['VLM>CO'], t: '규칙으로 계획', d: '번호를 모르면 inspect(퍽 윗면 태그) → 합이 맞는 조합 → pick·place tray → navigate 목적지 장소 → pick tray·place. VLM 없이 planner 규칙.' },
      { e: ['CO>O4a', 'CO>O4b', 'CO>O3a'], t: '실행', d: 'inspect는 손끝을 퍽 위 inspect_height_m로, tray는 로봇 뒤 적재함 칸(tray_slots)에 싣고 꺼냅니다.' },
      { e: ['CO>VLM'], t: '수납 확인', d: '/task/status SUCCEEDED마다 다음 판단 — 옮긴 뒤와 verify_period_s마다 목적지에 퍽이 있는지 보고 다시 옮깁니다.' },
    ],
  },
  {
    label: '팔 안전 이벤트로 멈출 때',
    steps: [
      { e: ['SE>CO'], t: '접촉 감지 보고', d: 'arm_safety_monitor가 궤적을 취소하고 /arm_safety_event를 보냅니다 (4장).' },
      { e: ['CO>VLM'], t: '단계 실패 보고', d: 'coordinator가 pick 단계를 실패로 기록하고 /task/status (FAILED, reason: arm_contact)로 VLM에 알립니다.' },
      { e: ['VLM>CO'], t: '재계획', d: '✉️ /task/sub_goals 다시 — 예) 다른 방향에서 접근. coordinator가 검증합니다.' },
      { e: ['CO>O3a', 'CO>O4a#2', 'CO>GS', 'CO>O4a'], t: '새 계획 실행', d: '이동 → 장면 갱신 → 후보 점수 → 집기를 다시. 성공하면 원래 계획대로 이어갑니다.' },
      { e: ['CO>UI', 'UI>USER'], t: '또 실패하면 알리고 정지', d: '같은 단계가 2회 연속 실패할 때만 /robot/say로 알리고 정지.' },
    ],
  },
  {
    label: '이동 실패 → 재계획',
    steps: [
      { e: ['CO>O3a'], t: '이동 요청', d: '🎬 NavigateToPose (3.45, 0.9).' },
      { e: ['CO>O3a'], t: '결과 ABORTED', d: 'Nav2가 복구(Spin·BackUp·Wait)까지 해보고도 못 가면 액션이 ABORTED로 끝나 coordinator에 돌아옵니다 (3장).' },
      { e: ['CO>VLM'], t: '실패 보고', d: '/task/status (step 1, FAILED, reason: nav_failed).' },
      { e: ['VLM>CO', 'TO>VLM'], t: '재계획', d: 'VLM이 지금 보이는 물체(/tracked_objects)를 다시 보고 새 /task/sub_goals — 예) 테이블 반대편 접근.' },
      { e: ['CO>O3a'], t: '새 목표로 재시도', d: '검증 후 다시 NavigateToPose.' },
      { e: ['CO>UI', 'UI>USER'], t: '또 실패하면 알리고 정지', d: '같은 단계 2회 연속 실패 → /robot/say "테이블까지 갈 수 없어요".' },
    ],
  },
];

const NAV_FLOWS: Flow[] = [
  {
    label: 'Nav2 이동 명령 하나',
    steps: [
      { e: ['LMN>BT', 'LMN>PS', 'LMN>CS', 'LMN>BS'], t: '시작할 때 1회', d: 'lifecycle_manager가 Nav2 서버들을 configure → activate. rtabmap은 관리 대상이 아닙니다.' },
      { e: ['RGBD>RTAB', 'ODOM>RTAB', 'RTAB>PS', 'RTAB>CS'], t: '위치는 늘 들어온다', d: 'rtabmap(위치추정 모드)이 /map(transient_local)과 map→odom을 냅니다. map→odom이 나오기 전엔 목표를 보내지 않아야 합니다 (coordinator TF 대기는 TODO).' },
      { e: ['IN>BT'], t: '목표 도착', d: 'coordinator(또는 EXPLORE 때 explorer)의 NavigateToPose가 bt_navigator로.' },
      { e: ['BT>PS', 'PTS>PS'], t: '경로 계산', d: '🎬 compute_path_to_pose. global_costmap은 /map(static) + body_filter가 몸을 뺀 점구름(obstacle layer)으로 장애물을 채웁니다.' },
      { e: ['BT>CS', 'PTS>RLN', 'ODOM>CS'], t: '경로 따라가기 — FollowPath 플러그인', d: '🎬 follow_path. controller_server의 FollowPath(ml::RlNavController)가 경로·local_costmap·현재 속도·가상 스캔·IMU gyro로 v·ω를 계산합니다. 정책이 꺼져 있으면 inner DWB가 대신합니다.' },
      { e: ['RLN>O5a'], t: '/cmd_vel_nav 20Hz', d: '베이스 체인(5장)으로. 주행 중 경로 계산~따라가기가 약 1Hz로 반복(재계획)됩니다.' },
      { e: ['BT>BS'], t: '막혔을 때만 복구', d: 'Spin·BackUp·Wait. pole_front_cam이 뒤를 못 보므로 BackUp은 빼거나 0.1m 이하로.' },
      { e: ['BS>O5a'], t: '복구 중 속도 명령', d: '같은 /cmd_vel_nav로 내서 안전 필터를 거치게 합니다. 끝나면 경로 계산부터 다시.' },
    ],
  },
  {
    label: '막힘 → 복구 → 그래도 안 되면 coordinator에 실패',
    steps: [
      { e: ['BT>CS', 'RLN>O5a'], t: '따라가다 막힘', d: '의자가 통로를 막아 controller_server가 진행하지 못합니다 (progress checker가 멈춤 감지).' },
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
      { e: ['OP>TEL'], t: '① 매핑: 사람이 몬다', d: 'map:=slam으로 띄우고 teleop_twist_keyboard(/cmd/manual/cmd_vel)로 0.1~0.15m/s 천천히 (EXPLORE면 explorer가 대신). 같은 곳을 여러 방향에서 보고 출발점으로 돌아와 루프 클로저.' },
      { e: ['TEL>DD1'], t: '/cmd_vel', d: 'manual_control → twist_mux → velocity_smoother → collision_monitor → /cmd_vel. diff_drive_controller가 바퀴를 굴립니다.' },
      { e: ['DD1>EKF1', 'EKF1>RT1'], t: '휠+IMU 오도메트리', d: '/odom → ekf → odom TF(/odometry/filtered) → rtabmap. 하향 카메라라 시각 오도메트리는 쓰지 않습니다.' },
      { e: ['CH1>RS1', 'RS1>RT1'], t: '카메라 영상', d: 'pole_front_cam 컬러 + 정렬 depth(+ 스캔 자세 gripper_cam, 몸 뺀 점구름)로 장면을 기억합니다.' },
      { e: ['RT1>DB'], t: 'DB 저장', d: 'map_dir/이름/rtabmap.db에 노드·그래프·특징점. 지도는 이 파일 하나입니다.' },
      { e: ['DB>RT2'], t: '② 운영: 같은 DB를 불러옴', d: 'map:=saved (localization:=true) 또는 /cmd/map_mode LOCALIZATION. 지도는 더 키우지 않고 위치만 찾습니다.' },
      { e: ['CH2>RS2', 'RS2>RT2'], t: '지금 보이는 장면', d: '처음 몇 초간 지도와 맞는 장면을 찾아야 위치가 잡힙니다.' },
      { e: ['RT2>NAV2', 'RT2>NAV2#2'], t: '/map · map→odom → Nav2', d: '위치를 찾으면 map→odom을 내기 시작합니다. 이때부터 Nav2 목표를 보낼 수 있습니다.' },
    ],
  },
];

const ARM_FLOWS: Flow[] = [
  {
    label: '집기 한 번',
    steps: [
      { e: ['SC>MG'], t: '준비 — 장면', d: '2장 pick 단계에서 octomap을 지우고 대상을 등록해 둡니다 (octomap 센서·pole_front_cam 점구름 연결은 아직 설정 전).' },
      { e: ['IN>MG'], t: '계획 → 실행 요청', d: 'coordinator가 📞 /plan_kinematic_path로 후보 자세까지 궤적을 받고 🎬 /execute_trajectory로 실행합니다 (접근 → 들어올리기를 단계별로. MTC 태스크는 TODO).' },
      { e: ['MG>JTC'], t: '팔 궤적', d: '🎬 /arm_controller/follow_joint_trajectory. MoveIt에 등록된 컨트롤러는 arm_controller 하나뿐입니다.' },
      { e: ['MOT>HWI'], t: 'read', d: 'BeebotSystemHardware가 OpenCR S 줄에서 위치·속도·전류(→ effort)를 읽습니다. 여기서부터 controller_manager 100Hz 한 주기.' },
      { e: ['HWI>JTC', 'HWI>RAC', 'HWI>RAC#2', 'HWI>JSB'], t: 'state interface', d: '읽은 값이 같은 메모리로 각 컨트롤러에 보입니다. 토픽이 아닙니다.' },
      { e: ['JSB>O1', 'JSB>ASM'], t: '/joint_states', d: 'robot_state_publisher(TF)·move_group·coordinator·manual_control·state_manager·scan_cam_gate, 그리고 arm_safety_monitor(전류 감시)로.' },
      { e: ['JTC>RAC'], t: 'JTC 목표 → reference', d: '이번 주기 목표 관절각 [0.00, 0.62, −0.31, 1.10, 0.00](joint1~5)을 rl_arm_correction에 넘깁니다.' },
      { e: ['RAC>HWI'], t: '보정 → command', d: '중력 처짐 보상 Δ를 더해 씁니다 (±0.05rad 클리핑). ONNX 잔차 정책은 TODO — 중력 처짐(sag/gravity) 앞먹임은 구현.' },
      { e: ['HWI>MOT'], t: 'write', d: 'C 줄(바퀴 2 · 관절 5 · 그리퍼 m)로 OpenCR에 보내고 다음 주기 read로. DYNAMIXEL BulkWrite는 펌웨어가 합니다.' },
      { e: ['GIN>GRC', 'GRC>HWI'], t: '그리퍼 단계', d: 'coordinator(또는 manual_control)가 MoveIt을 거치지 않고 🎬 ParallelGripperCommand를 직접 보냄 → gripper_controller가 gripper_left_joint/position(m) command를 씁니다. 퍽을 쥐어 멈추면 allow_stalling으로 성공(= 파지).' },
    ],
  },
  {
    label: '접촉 감지로 멈출 때',
    steps: [
      { e: ['JSB>ASM'], t: '전류 감시', d: '/joint_states의 effort가 effort_threshold(3.0A)를 넘고 관절이 거의 멈춘(<0.10rad/s) 상태가 hold_s(0.3초) 이어지면 접촉으로 판단. 움직이는 중 전류(중력·가속)는 정상이라 무시.' },
      { e: ['ASM>JTC'], t: '궤적 취소', d: '📞 follow_joint_trajectory/_action/cancel_goal → JTC가 현재 자세를 유지합니다.' },
      { e: ['ASM>O2'], t: 'coordinator에 보고', d: '/arm_safety_event (control/ArmSafetyEvent) → 단계 실패(arm_contact)로 처리 (2장 재시도 규칙).' },
    ],
  },
];

const BASE_FLOWS: Flow[] = [
  {
    label: '속도 명령 한 주기',
    steps: [
      { e: ['CIN>TM'], t: '자동 주행 명령', d: 'controller_server의 FollowPath 플러그인(rl_nav_controller)이 낸 /cmd_vel_nav가 twist_mux 자동 입력으로 갑니다. 정책이 꺼져 있으면 inner DWB가 같은 토픽을 냅니다.' },
      { e: ['MAN>TM', 'EST>TM', 'TM>VS'], t: '자동·수동 고르기', d: 'twist_mux가 자동(/cmd_vel_nav, priority 10)·수동(/cmd_vel_manual, 100) 중 높은 쪽을 고르고, /state/emergency(← /cmd/e_stop)면 전부 막습니다 → /cmd_vel_mux.' },
      { e: ['VS>CMN'], t: '가속 제한', d: 'velocity_smoother가 급가속·급감속을 자릅니다.' },
      { e: ['PTS>CMN', 'CMN>DD'], t: '충돌 감시 → /cmd_vel', d: '몸 뺀 점구름으로 Approach(반경 0.20m 몸이 1초 안에 닿을 방향만 멈춤)·SlowZone(0.30m 안 50%) 다각형 검사. 점구름이 1초 넘게 끊기면 정지.' },
      { e: ['WM>BHW'], t: 'read', d: 'BeebotSystemHardware가 OpenCR S 줄에서 바퀴 위치·속도와 IMU를 읽습니다 (controller_manager 한 주기 시작).' },
      { e: ['BHW>DD', 'BHW>IMUB'], t: 'state interface', d: '읽은 값이 diff_drive·imu broadcaster에 보입니다.' },
      { e: ['DD>EKF', 'IMUB>EKF'], t: '/odom · /imu → EKF', d: 'EKF가 둘을 융합해 /odometry/filtered와 odom TF를 냅니다. 주행 정책은 이 현재 속도를 controller_server 인자로 받습니다.' },
      { e: ['DD>BHW'], t: '바퀴 목표 속도', d: 'diff_drive가 collision_monitor의 /cmd_vel로 좌·우 바퀴 속도를 씁니다.' },
      { e: ['BHW>WM'], t: 'write', d: 'C 줄로 OpenCR에 보내고 다음 주기 read로.' },
      { e: ['EKF>O3'], t: 'EKF 출력', d: '/odometry/filtered와 odom→base_footprint TF → Nav2(controller_server 현재 속도)·rtabmap.' },
    ],
  },
  {
    label: 'odom은 어디서 오나 — 바퀴·IMU → EKF',
    steps: [
      { e: ['WM>BHW'], t: '원자료', d: '바퀴 회전량과 IMU 각속도·가속도.' },
      { e: ['BHW>DD', 'BHW>IMUB'], t: '컨트롤러가 읽음', d: 'diff_drive는 바퀴만으로 위치를 적분, imu broadcaster는 IMU 값을 그대로 (공분산은 controllers.yaml).' },
      { e: ['DD>EKF', 'IMUB>EKF'], t: 'EKF로 융합', d: '바퀴만 쓰면 회전이 특히 부정확합니다. 바퀴 vx·vy·vyaw + 자이로 yaw 각속도 위주로 넣고, 자이로(1e-4)를 바퀴 회전(0.01)보다 더 믿게 합니다.' },
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

"테이블 위 컵 가져다줘" 같은 자연어 명령을 받아 **이동 + 집기 + 전달**을 스스로 하는 모바일 매니퓰레이터입니다. 확정적 알고리즘(Nav2·MoveIt 2·ros2_control)이 실행을 책임지고, 학습 모델은 **앞에서 판단을 돕거나(grasp_scorer), 기본 제어기를 대체하거나(주행 정책 FollowPath 플러그인), 뒤에서 실행을 보정**합니다(팔 residual).

### 가정 (하드웨어가 다르면 이 값만 바꾼다)

| 항목 | 가정 |
| --- | --- |
| 배포판 | ROS 2 Lyrical (Ubuntu 26.04) — 속도 명령은 체인 전체 **TwistStamped** |
| 베이스 | TurtleBot3 Waffle Pi, 차동 구동, 바퀴 반경 0.033m · 간격 0.287m, 최대 0.26m/s, **LiDAR 미사용** (거리 센서는 RealSense 2대뿐) |
| 팔 | OpenMANIPULATOR-X 기반 **5축**(joint1~4 + 손목 roll joint5, XM430-W350) + 평행 그리퍼(gripper_left_joint, 오른쪽은 mimic), 도달 거리 약 0.38m, 가반하중 약 0.5kg |
| 제어보드 | OpenCR 1개가 바퀴 2·팔 5·그리퍼 1(DYNAMIXEL 8개)·IMU를 모두 연결 — 펌웨어(beebot_opencr)가 BulkWrite·SyncRead, PC의 BeebotSystemHardware와는 USB 시리얼 ASCII 줄(C 명령 · S 상태 · E 에러 · R 재부팅) |
| gripper_cam | 그리퍼에 붙은 **Intel RealSense 깊이 카메라**(RGB-D), 팔과 함께 움직임 — 근접 확인·퍽 윗면 태그 읽기, 지도 만들 때는 스캔 자세의 두 번째 SLAM 카메라 |
| pole_front_cam | 폴대 고정 **Intel RealSense 깊이 카메라**(RGB-D), 전방 하향 — **인지·SLAM·장애물 전부 담당** (점구름은 body_filter가 자기 몸을 뺀 뒤) |
| 연산 | 로봇 탑재 PC 1대 + 학습용 GPU PC 1대 (Isaac Sim / Isaac Lab) |
| 환경 | 현관–거실 실내, 마루·카펫 혼재, 의자 사이 통로 약 0.9m |
| 대표 작업 | 현관에서 4m 떨어진 **낮은 거실 테이블(높이 0.45m)** 위 컵을 집어 사람에게 전달 |

> **도달 범위 주의:** OM-X를 Waffle 상판에 얹으면 그리퍼 최고 높이가 약 0.6m 안팎입니다. 식탁(0.72~0.75m)은 닿지 않으므로, 대표 작업을 낮은 테이블로 잡거나 팔 거치대를 높여야 합니다. 높이를 바꾸면 MoveIt 도달성부터 다시 확인합니다.

### 계층과 원칙

| 계층 | 역할 | 대표 노드 | 결정 주기 | 학습 |
| --- | --- | --- | --- | --- |
| ① 작업 계획 | 무엇을, 어떤 순서로 | vlm_task_planner (+ user_input 입력 · 신호등 암호 답은 perception signal_decoder가 /mission/signal로) | 명령·최종 실패마다 (수 초) | 사전학습 VLM, 추가 학습 없음 |
| ② 임무 관리 | 검증·실행·재시도·안전 규칙 | coordinator (+ state_manager 모드·상태, explorer 자동 탐사) | 이벤트마다 | 없음 |
| ③ 앞단 판단 보조 | 어떤 방식으로 할지 고르기 | grasp_scorer | pick 직전 1회 | 지도학습 |
| ④ 확정 실행 | 궤적·속도 계산, 충돌 회피 | Nav2(FollowPath = 🧩 rl_nav_controller), MoveIt 2 (MTC는 TODO), RTAB-Map, EKF | 20~100Hz | 강화학습(주행 정책 — 플러그인) |
| ⑤ 뒷단 실행 보정 | 명령에 작은 Δ를 더해 현실 오차 보정 | rl_arm_correction | 100Hz | 강화학습 (residual) |
| ⑥ 안전 | 최종 명령 제한·감속·차단 | twist_mux(비상정지 잠금), velocity_smoother, collision_monitor, JTC 허용오차, arm_safety_monitor, 전류 한계 | 매 주기 | 없음 |
| ⑦ 하드웨어 | read → update → write | controller_manager + BeebotSystemHardware + OpenCR | 100Hz | 없음 |

**지켜야 할 다섯 규칙**

- **보정은 범위를 제한한다.** 관절 Δ ±0.05rad(팔 residual). 주행 정책은 \`max_lin\` 0.26m/s · \`max_ang\` 1.82rad/s와 \`extra_lin_vel\`·\`extra_ang_vel\` 상한 안에서만 내고, 최종 명령은 안전 체인(velocity_smoother·collision_monitor)이 다시 자른다.
- **안전장치는 학습 노드보다 뒤에 둔다.** RL 출력까지 포함한 최종 명령을 마지막에 거른다.
- **학습 요소는 끌 수 있어야 한다.** 노드를 내리지 않고 \`enable:=false\`(FollowPath → inner DWB) · \`enabled:=false\`(팔 Δ=0)로 바꾸면 원래 시스템과 같아야 한다.
- **위는 느리고 추상적, 아래는 빠르고 구체적.** VLM은 제어 루프에 넣지 않는다.
- **판단 권한은 한 층에 하나.** 파지점 2순위 선택 같은 실행 세부는 coordinator가 하고, VLM은 작업 순서만 다시 짠다.

**토픽 이름 규칙 — 명령은 /cmd, 상태는 /state**

- **외부에서 들어오는 명령은 전부 \`/cmd/...\`.** 보내고 끝 (cmd_vel 관례 — 응답 없음). \`/cmd/user_command\` · \`/cmd/manual/cmd_vel\` · \`/cmd/manual/arm\` · \`/cmd/manual/reboot_motors\` · \`/cmd/e_stop\` · \`/cmd/operation_mode\` · \`/cmd/map_mode\` · \`/cmd/map_name\` · \`/cmd/restart\`("all [인자]"·"node <이름>") · \`/cmd/fake_opencr/set_pose\`(테스트베드).
- **상태는 \`/state/<이름>\`, 발행은 state_manager 하나만.** 다른 노드는 구독만 한다. 상태를 바꾸고 싶으면 \`/cmd/<이름>\`을 보내고 결과는 \`/state/<이름>\`으로 본다 (\`/cmd/operation_mode\` → \`/state/operation_mode\`, \`/cmd/map_mode\` → \`/state/map_mode\`, \`/cmd/e_stop\` → \`/state/emergency\`, \`/cmd/restart\` → \`/state/restart\`). ROS에는 발행자 제한 기능이 없으므로 규칙으로 지키고, 테스트베드 input_manager(호스트 파일 → 토픽)는 \`/state/*\` 를 거부한다.
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

위에서 아래로 흐르고, 왼쪽이 팔, 오른쪽이 베이스입니다. 학습 요소(주황)는 ③ grasp_scorer · ④ controller_server의 FollowPath 플러그인 · ⑤ rl_arm_correction에 있고, 안전(빨강)은 항상 학습 요소 뒤에 있습니다. 실선=토픽, 굵은 선=액션, 점선=서비스·파라미터·피드백·매핑 단계 전용. 화살표 라벨은 **[종류 이모지] 이름 (메시지 타입)** 형식입니다. 어디서 시작해 어떤 순서로 흐르는지는 도식 바로 위 **▶ 흐름 따라가기**에서 상황을 골라 화살표 하나씩 따라가 보세요.

> 👆 **섹터 영역을 누르면 해당 상세 섹션으로, 노드를 누르면 노드 사전의 해당 카드로 이동합니다.**

<p class="rd-slam"><b>SLAM·인지 구성</b> <button class="rd-slam-btn active" data-slam="rtab">RTAB-Map + YOLO (현재)</button> <button class="rd-slam-btn" data-slam="isaac">🟪 cuVSLAM + nvblox + YOLO·CenterPose (Isaac ROS 전환안)</button> <button class="rd-slam-btn" data-slam="lidar">🟦 2D LiDAR + Cartographer (LiDAR 전환안)</button></p>

${F}mermaid
flowchart TB
    U(((사람)))
    CLI["🛠️ operator_tool<br/>운영자 CLI (tool/run-cli)"]
    subgraph EXT["외부 서비스 (ROS 바깥)"]
        SIM["🖥️ simulator (SIL)<br/>장면 렌더·플랜트"]
        AIS["🖥️ ai-service<br/>호스트 VLM 서버"]
        FC["🧪 fake_camera ×2<br/>테스트베드 전용"]
    end
    subgraph S0["센서·인지"]
        subgraph SHS["물리 하드웨어 (센서)"]
            PCH{{"pole_front_cam<br/>RealSense RGB-D"}}
            GCH{{"gripper_cam<br/>RealSense RGB-D"}}
        end
        PC["📦 realsense2_camera<br/>pole_front_cam 드라이버"]
        GC["📦 realsense2_camera<br/>gripper_cam 드라이버"]
        PER["🛠️ perception<br/>YOLO 검출 · 칼만 융합 추적"]
        BF["🛠️ body_filter<br/>자기 몸 점 제거"]
        SD["🛠️ signal_decoder<br/>신호등 암호 → 미션 답"]
    end
    subgraph S1["① 작업 계획"]
        UI["🛠️ user_input<br/>텍스트 명령 입력"]
        VLM["🛠️ vlm_task_planner"]
    end
    subgraph S2["② 임무 관리"]
        CO["🛠️ coordinator"]
        SM["🛠️ state_manager<br/>상태 주인"]
        EXP["🛠️ explorer<br/>자동 탐사 (프론티어)"]
        DA["📦 diagnostic_aggregator<br/>/diagnostics → 계층별 묶음 (bringup)"]
        ALL(["모든 🛠️ 노드 · 📦 Nav2·controller_manager<br/>/diagnostics"])
    end
    subgraph S3["③ 앞단 판단 보조"]
        GS["🛠️ grasp_scorer"]
    end
    subgraph S4["④ 확정 실행"]
        MG["📦 move_group<br/>plan + execute<br/>(use_moveit — bringup 기본 켬)"]
        subgraph N2["📦 Nav2 (ros_system nav2_nodes · 서버를 직접 띄움)"]
            BT["📦 bt_navigator<br/>NavigateToPose 행동 트리"]
            PS["📦 planner_server<br/>+ global_costmap"]
            CS["📦 controller_server<br/>+ local_costmap<br/>FollowPath = 🧩 RlNavController"]
            RLN["🧩 RlNavController (ml)<br/>FollowPath 플러그인 · ROS 노드 아님<br/>ONNX 정책 · inner DWB 바이패스"]
            BS["📦 behavior_server<br/>후진 · 회전 · 대기"]
            COST["📦 costmap_2d<br/>local: voxel · global: static + obstacle"]
            LMN["📦 lifecycle_manager_navigation<br/>planner·controller·behavior·bt (map 필요)"]
        end
        subgraph RT["📦 RTAB-Map (이름공간 /rtabmap)"]
            SCG["🛠️ scan_cam_gate<br/>스캔 자세일 때만 gripper_cam 통과"]
            PRS["📦 pole_rgbd_sync<br/>rgbd_sync"]
            GRS["📦 gripper_rgbd_sync<br/>rgbd_sync"]
            RXS["📦 rgbdx_sync<br/>카메라 둘 묶음"]
            PCA["📦 scan_cloud_merge<br/>point_cloud_aggregator"]
            RTAB["📦 rtabmap<br/>RGB-D SLAM<br/>매핑 · 위치추정 모드"]
            MS["📦 map_saver<br/>map_saver_server (bringup)"]
            LMS["📦 lifecycle_manager_map_saver"]
        end
        MAPDIR[("💾 지도 폴더<br/>map_dir/이름/")]
        EKF["📦 robot_localization<br/>ekf_filter_node<br/>휠 + IMU 융합"]
    end
    subgraph S5["⑤ 뒷단 보정 (팔)"]
    end
    subgraph S6["⑥ 안전"]
        ASM["🛠️ arm_safety_monitor"]
        TM["📦 twist_mux<br/>자동·수동 선택"]
        VS["📦 velocity_smoother"]
        CMN["📦 collision_monitor"]
        LMB["📦 lifecycle_manager_base<br/>velocity_smoother · collision_monitor<br/>(odom만 있으면 뜸)"]
        MC["🛠️ manual_control<br/>수동 패스스루 · 모드별 안전 전환"]

    end
    subgraph S7["⑦ 하드웨어"]
        RSP["📦 robot_state_publisher<br/>URDF → /robot_description · /tf"]
        SPW["📦 spawner<br/>컨트롤러 6개 올리고 끝남 (1회)"]
        subgraph CM["📦 controller_manager (ros2_control_node · 한 프로세스 100Hz)"]
            JTC["📦 arm_controller<br/>JointTrajectoryController"]
            RLA["🧩 rl_arm_correction (ml)<br/>extends controller_interface::<br/>ChainableControllerInterface<br/>플러그인 · ROS 노드 아님"]
            GRC["📦 gripper_controller<br/>parallel_gripper_action"]
            DDC["📦 diff_drive_controller"]
            JSB["📦 joint_state_broadcaster"]
            IMB["📦 imu_sensor_broadcaster"]
            HWI["🧩 BeebotSystemHardware (control)<br/>extends hardware_interface::<br/>SystemInterface<br/>플러그인 · ROS 노드 아님"]
        end
        subgraph SHA["물리 하드웨어 (구동)"]
            HW{{"OpenCR 펌웨어 → 다이나믹셀<br/>팔 5축·그리퍼·바퀴 2·IMU"}}
        end
    end
    U -->|"⌨️ 명령 입력"| UI
    U -->|"⌨️ 수동 조작"| CLI
    CLI -->|"✉️ /cmd/operation_mode · /cmd/e_stop<br/>/cmd/map_mode · /cmd/restart"| SM
    CLI -->|"✉️ /cmd/manual/cmd_vel · arm<br/>· reboot_motors"| MC
    ALL -->|"✉️ /diagnostics<br/>(diagnostic_msgs/<br/>DiagnosticArray)"| DA
    DA -->|"✉️ /diagnostics_agg<br/>(사람이 보는 것 — 노드는 의존 안 함)"| CLI
    DA -.->|"✉️ /diagnostics_agg<br/>→ 상태 패널"| SIM
    SIM -->|"✉️ /cmd/manual/cmd_vel<br/>(조작 창)"| MC
    SIM -->|"✉️ /cmd/operation_mode<br/>(조작 창)"| SM
    SIM -->|"✉️ /cmd/map_mode<br/>(SLAM 패널)"| SM
    UI -->|"✉️ /cmd/user_command<br/>(std_msgs/String)"| VLM
    VLM -->|"🌐 HTTP VLM 호출"| AIS
    AIS -->|"🌐 계획"| VLM
    UI -->|"🔊 안내 (터미널 텍스트)<br/>“컵 가져왔어요”"| U
    SM -->|"✉️ /state/operation_mode<br/>AUTO · MANUAL · EXPLORE · TEACH"| CO
    SM -->|"✉️ /state/operation_mode<br/>AUTO · MANUAL · TEACH"| MC
    MC -->|"✉️ /cmd_vel_manual<br/>(geometry_msgs/<br/>TwistStamped)"| TM
    SM -->|"✉️ /state/emergency"| TM

    SM -->|"✉️ /state/emergency"| CO
    PCH -->|"🔌 USB 3<br/>(RealSense SDK)"| PC
    GCH -->|"🔌 USB 3<br/>(RealSense SDK)"| GC
    PC -->|"✉️ /pole_front_cam/color ·<br/>aligned_depth_to_color<br/>(sensor_msgs/Image)"| PER
    U -->|"🖱️ 조작 창"| SIM
    SIM -->|"✉️ /cmd/e_stop<br/>(조작 창)"| SM
    SIM -->|"✉️ /cmd/restart<br/>(조작 창)"| SM
        SIM -.->|"📁 렌더 파일"| FC
    FC -->|"✉️ 같은 토픽명<br/>(PC·GC 자리 대체)"| PER
    SIM -.->|"📁 가상 시리얼 C/S<br/>(fake_opencr — faker 기본)"| HWI
    GC -->|"✉️ /gripper_cam/color ·<br/>aligned_depth_to_color<br/>(sensor_msgs/Image)"| PER
    GC -->|"✉️ /gripper_cam/depth<br/>/color/points<br/>(sensor_msgs/<br/>PointCloud2)<br/>gripper_cam_pointcloud:=true일 때"| GS
    PC -->|"✉️ /pole_front_cam/color ·<br/>aligned_depth_to_color · camera_info<br/>(sensor_msgs/Image)"| PRS
    GC -->|"✉️ /gripper_cam/color<br/>· camera_info"| GRS
    GC -.->|"✉️ /gripper_cam depth · points<br/>(지도 만들 때 스캔 자세만 의미)"| SCG
    JSB -->|"✉️ /joint_states<br/>스캔 자세인가"| SCG
    SCG -->|"✉️ …/image_scan<br/>(아니면 0 depth)"| GRS
    SCG -->|"✉️ …/points_scan<br/>(아니면 빈 점구름)"| PCA
    PRS -->|"✉️ /rtabmap/rgbd_image0<br/>(rtabmap_msgs/RGBDImage)"| RXS
    GRS -->|"✉️ /rtabmap/rgbd_image1"| RXS
    RXS -->|"✉️ /rtabmap/rgbd_images<br/>(rtabmap_msgs/RGBDImages)"| RTAB
    PCA -->|"✉️ /rtabmap/scan_cloud<br/>(base_footprint)"| RTAB
    RTAB -->|"✉️ /map"| MS
    RTAB -->|"💾 rtabmap.db 쓰기<br/>(매핑 중 기록 · 종료 때 확정)"| MAPDIR
    MAPDIR -->|"💾 rtabmap.db 읽기<br/>(load_database · 위치추정)"| RTAB
    MS -->|"💾 map.pgm · map.yaml<br/>(2D 미리보기)"| MAPDIR
    LMS -.->|"📞 lifecycle<br/>change_state"| MS
    CLI -.->|"📞 /map_saver/save_map<br/>(nav2_msgs/srv/SaveMap)"| MS
    SIM -.->|"📞 /map_saver/save_map<br/>(지도 저장 버튼)"| MS
    RTAB -->|"✉️ /map · /tf (map→odom 변환)<br/>(nav_msgs/<br/>OccupancyGrid ·<br/>tf2_msgs/TFMessage)"| PS
    DDC -->|"✉️ /odom<br/>(nav_msgs/Odometry)"| EKF
    IMB -->|"✉️ /imu<br/>(sensor_msgs/Imu)"| EKF
    EKF -->|"✉️ /odometry/filtered<br/>(nav_msgs/Odometry)"| RTAB
    EKF -->|"✉️ /odometry/filtered ·<br/>/tf (odom→base_footprint 변환)<br/>(nav_msgs/Odometry ·<br/>tf2_msgs/TFMessage)"| CS
    PC -->|"✉️ /pole_front_cam/depth<br/>/color/points<br/>(sensor_msgs/<br/>PointCloud2)"| BF
    BF -->|"✉️ /pole_front_cam/depth<br/>/color/points_filtered<br/>팔·차체 뺀 점구름<br/>(sensor_msgs/<br/>PointCloud2)"| COST
    BF -->|"✉️ …/points_filtered<br/>(sensor_msgs/<br/>PointCloud2)"| PCA
    COST -->|"🔗 global costmap 읽기<br/>(planner_server 안 · 같은 프로세스)"| PS
    COST -->|"🔗 local costmap 읽기<br/>(controller_server 안 · 같은 프로세스)"| CS
    BT ==>|"🎬 compute_path_to_pose"| PS
    BT ==>|"🎬 follow_path"| CS
    BT ==>|"🎬 backup · spin · wait"| BS
    LMN -.->|"📞 lifecycle<br/>change_state"| BT
    LMN -.->|"📞 lifecycle change_state<br/>(configure · activate)"| PS
    LMN -.->|"📞 lifecycle change_state"| CS
    LMN -.->|"📞 lifecycle change_state"| BS
    LMB -.->|"📞 lifecycle<br/>change_state"| VS
    LMB -.->|"📞 lifecycle change_state"| CMN
    PER -->|"✉️ /tracked_objects · /mission/qr<br/>(perception/<br/>TrackedObjectArray ·<br/>std_msgs/String)"| VLM
    PER -->|"✉️ /tracked_objects<br/>신호등 색<br/>(perception/<br/>TrackedObjectArray)"| SD
    SD -->|"✉️ /mission/signal<br/>(perception/MissionSignal)"| VLM
    PER -->|"✉️ /tracked_objects<br/>(perception/<br/>TrackedObjectArray)"| CO
    PER -->|"✉️ /tracked_objects<br/>대상 컵 위치·크기<br/>(perception/<br/>TrackedObjectArray)"| GS
    VLM -->|"✉️ /task/sub_goals<br/>(plan/<br/>SubGoalArray)"| CO
    VLM -.->|"📁 /task/sub_goals 파일<br/>→ 조작 창 응답줄<br/>(VLM 거절도 say로)"| SIM
    CO -->|"✉️ /task/status<br/>(plan/<br/>TaskStatus)"| VLM
    CO -.->|"📞 /score_grasps<br/>(ml/srv/<br/>ScoreGrasps)"| GS
    BF -->|"✉️ …/points_filtered<br/>360방향 가상 스캔<br/>(sensor_msgs/PointCloud2)"| RLN
    CO -.->|"📞 /plan_kinematic_path ·<br/>/clear_octomap · /apply_planning_scene<br/>(moveit_msgs/srv/<br/>GetMotionPlan 등)"| MG
    CO ==>|"🎬 /execute_trajectory<br/>(moveit_msgs/action/<br/>ExecuteTrajectory)"| MG
    CO ==>|"🎬 /navigate_to_pose<br/>(nav2_msgs/action/<br/>NavigateToPose)"| BT
    SM -->|"✉️ /state/operation_mode<br/>EXPLORE"| EXP
    EXP ==>|"🎬 /navigate_to_pose<br/>프론티어 목표"| BT
    EXP -->|"✉️ /explore/result<br/>DONE · FAILED → AUTO"| SM
    RTAB -->|"✉️ /map<br/>프론티어 찾기<br/>(nav_msgs/OccupancyGrid)"| EXP
    SM -->|"✉️ /state/map_mode<br/>MAPPING이면 팔 scan_pose<br/>(std_msgs/String)"| CO
    MG ==>|"🎬 /arm_controller<br/>/follow_joint_trajectory<br/>(control_msgs/action/<br/>FollowJointTrajectory)"| JTC
    CO -->|"✉️ /arm_controller/joint_trajectory<br/>시작 자세 (MoveIt 없이)<br/>(trajectory_msgs/<br/>JointTrajectory)"| JTC
    MC -->|"✉️ /arm_controller/joint_trajectory<br/>수동 팔<br/>(trajectory_msgs/<br/>JointTrajectory)"| JTC
    CO ==>|"🎬 /gripper_controller/gripper_cmd<br/>(control_msgs/action/<br/>ParallelGripperCommand)"| GRC
    MC ==>|"🎬 /gripper_controller/gripper_cmd<br/>수동 그리퍼"| GRC
    JTC -->|"🔗 reference<br/>rl_arm_correction/joint1~5<br/>(JTC 목표 관절각)"| RLA
    RLA -->|"🔗 command<br/>joint1~5/position<br/>목표각 + Δ (±0.05rad)"| HWI
    GRC -->|"🔗 command<br/>gripper_left_joint/position (m)"| HWI
    DDC -->|"🔗 command<br/>wheel_*_joint/velocity"| HWI
    HWI -->|"🔗 state<br/>모든 관절 pos·vel·effort"| JSB
    HWI -->|"🔗 state<br/>imu"| IMB
    CS -->|"🔗 FollowPath 호출<br/>computeVelocityCommands()<br/>(같은 프로세스)"| RLN
    BS -->|"✉️ /cmd_vel_nav<br/>후진·회전"| TM
    IMB -->|"✉️ /imu<br/>gyro_z<br/>(sensor_msgs/Imu)"| RLN
    RLN -->|"✉️ /cmd_vel_nav<br/>20Hz<br/>(geometry_msgs/<br/>TwistStamped)"| TM
    TM -->|"✉️ /cmd_vel_mux<br/>(geometry_msgs/<br/>TwistStamped)"| VS
    VS -->|"✉️ /cmd_vel_smoothed<br/>(geometry_msgs/<br/>TwistStamped)"| CMN
    CMN -->|"✉️ /cmd_vel<br/>(geometry_msgs/<br/>TwistStamped)"| DDC
    %% 보이지 않는 배치 힌트: /cmd_vel 라벨이 reference 라벨을 덮지 않게 한다
    RLA ~~~ CMN
    BF -->|"✉️ …/points_filtered<br/>(sensor_msgs/<br/>PointCloud2)"| CMN
    JSB -->|"✉️ /joint_states<br/>전류 감시<br/>(sensor_msgs/JointState)"| ASM
    JSB -->|"✉️ /joint_states<br/>현재 팔 각도 (스캔 자세 확인)"| CO
    JSB -->|"✉️ /joint_states<br/>수동 팔 기준값"| MC
    JSB -->|"✉️ /joint_states<br/>OpenCR 살아 있나"| SM
    JSB -->|"✉️ /joint_states"| RSP
    RSP -->|"✉️ /robot_description<br/>(URDF)"| CM
    RSP -->|"✉️ /robot_description · /tf<br/>몸 모양·관절 위치"| BF
    SPW -.->|"📞 load · configure · activate<br/>(controller_manager_msgs/srv)"| CM
    SPW -.->|"끝나면 기동<br/>(OnProcessExit)"| MG
    SM -.->|"📞 /rtabmap/rtabmap/set_mode_*<br/>· load_database<br/>(지도 모드·지도 바꾸기)"| RTAB
    ASM -.->|"📞 cancel_goal<br/>이상 시에만<br/>(action_msgs/srv/<br/>CancelGoal)"| JTC
    ASM -->|"✉️ /arm_safety_event<br/>(control/<br/>ArmSafetyEvent)"| CO
    CO -->|"✉️ /robot/say · /task/status<br/>(std_msgs/String ·<br/>plan/TaskStatus)"| UI
    HWI -->|"🔌 USB 시리얼 C 줄<br/>바퀴 속도·관절 목표<br/>(OpenCR가 BulkWrite)"| HW
    HW -->|"🔌 S 줄 10ms · E 줄 0.5초<br/>Pos·Vel·Current·IMU·온도 · 모터 에러<br/>(OpenCR가 SyncRead)"| HWI
    HWI -->|"✉️ /motor_status<br/>모터 에러·온도<br/>(control/MotorStatus)"| SM
    MC -.->|"📞 /beebotsystem/reboot_motors<br/>(std_srvs/srv/Trigger)"| HWI
    MC -.->|"📞 /beebotsystem/set_arm_torque<br/>TEACH면 팔·그리퍼 토크 끔<br/>(std_srvs/srv/SetBool)"| HWI
    MC -.->|"📞 /collision_monitor/toggle<br/>MANUAL이면 끔(통과) · 나가면 켬<br/>(nav2_msgs/srv/Toggle)"| CMN
${CLS}
    class PER,BF,CO,PC,GC,UI,SD,EXP,MG,TM,MC,SM,RSP,SPW,SCG,PRS,GRS,RXS,PCA,LMN,LMB,MS,LMS,DA,CLI std;
    class ALL ext;
    class AIS,SIM,FC ext;
    class VLM ai;
    class GS,RLA,RLN rl;
    class BT,PS,CS,BS,RTAB,EKF,COST,JTC,GRC,DDC,JSB,IMB,HWI std;
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
    style CM fill:#eef2ff,stroke:#6366f1,stroke-dasharray:4 3
    style N2 fill:#eef2ff,stroke:#6366f1,stroke-dasharray:4 3
    style RT fill:#eef2ff,stroke:#6366f1,stroke-dasharray:4 3
    style SHS fill:#fffde7,stroke:#f9a825,stroke-width:2px
    style SHA fill:#fffde7,stroke:#f9a825,stroke-width:2px
${F}

- **물리 하드웨어는 노란 영역, 토픽은 내지 않는다.** 장치(육각형)는 신호가 오가는 곳 가까이에 두고 같은 노란 "물리 하드웨어" 영역으로 표시했다 — 센서 쪽(카메라)과 구동 쪽(OpenCR·모터·IMU). RealSense 카메라 2대는 🔌 USB 3로 realsense2_camera 드라이버 노드에 붙고, 토픽은 드라이버 노드가 발행한다. 모터·IMU는 OpenCR → BeebotSystemHardware(hardware interface 플러그인, controller_manager 안) 경로로 같은 원칙을 따른다.
- **학습 요소는 셋.** grasp_scorer(파지 후보 점수, 지도학습), rl_nav_controller(Nav2 FollowPath, RL 정책), rl_arm_correction(팔 잔차 보정, RL). grasp_scorer는 \`/tracked_objects\`로 대상 컵을 찾고 gripper_cam 점구름으로 후보를 매긴다. rl_nav_controller는 controller_server 안에서 매 주기 경로 웨이포인트·가상 스캔·현재 속도·IMU gyro로 ONNX 정책을 돌려 v·ω를 직접 낸다. 모델이 없거나 \`enable=false\`·점구름 stale이면 inner DWB가 그대로 주행한다. 테스트베드에서도 이 플러그인은 실제로 돈다 (ML 대역은 grasp_scorer·rl_arm_correction뿐).
- **controller_manager는 그릇이다 — 받는 쪽은 각 컨트롤러.** 점선 상자(ros2_control_node 한 프로세스) 안의 컨트롤러가 저마다 자기 이름의 토픽·액션을 연다: \`/arm_controller/follow_joint_trajectory\`·\`/arm_controller/joint_trajectory\` → arm_controller, \`/gripper_controller/gripper_cmd\` → gripper_controller, \`/cmd_vel\` → diff_drive_controller(\`~/cmd_vel\` 리매핑), \`/joint_states\` ← joint_state_broadcaster, \`/odom\` ← diff_drive_controller, \`/imu\` ← imu_sensor_broadcaster. controller_manager 자신은 컨트롤러 load·switch 서비스와 주기 실행만 한다 (ros_system/config/controllers.yaml).
- **컨트롤러끼리·하드웨어와는 토픽이 아니라 🔗 인터페이스(같은 메모리의 double).** command는 컨트롤러 → BeebotSystemHardware, state는 그 반대. 도식엔 broadcaster로 가는 state만 그렸다 — JTC·gripper·diff_drive·rl_arm_correction도 같은 state를 읽는다.
- **rl_nav_controller는 ROS 노드가 아니다.** controller_server 안 FollowPath 자리에 pluginlib로 붙는 Nav2 controller 플러그인(ml/RlNavController)이다. 매 주기 경로·costmap·현재 속도·가상 스캔·IMU gyro로 ONNX 정책을 돌려 v·ω를 직접 내고, \`enable=false\`·모델 없음·점구름 stale이면 inner DWB가 대신 주행한다 (\`~/FollowPath/toggle\`).
- **rl_arm_correction은 ROS 노드가 아니다.** controller_manager 안에서 JTC 바로 뒤에 체인으로 붙는 컨트롤러 플러그인(ml/RlArmCorrection)이다 — arm_controller의 command_joints가 rl_arm_correction/joint1~5 (컨트롤러 탭 참고).
- **그리퍼는 MoveIt을 거치지 않는다.** moveit_controllers.yaml엔 arm_controller만 있고, ParallelGripperCommand 액션은 coordinator·manual_control이 직접 호출한다.
- **controller_manager 한 주기(100Hz)는 read → update → write.** move_group의 팔 궤적(→ arm_controller)과 collision_monitor의 \`/cmd_vel\`(→ diff_drive_controller)은 언제든 도착해 다음 update에서 쓰인다. update에서 broadcaster·diff_drive가 \`/joint_states\`(→ arm_safety_monitor 전류 감시 · coordinator 현재 각도 · manual_control 수동 기준 · state_manager 연결 확인 · scan_cam_gate · robot_state_publisher · move_group)와 \`/odom\`·\`/imu\`(→ EKF, FollowPath의 gyro 관측)를 발행하고, JTC 목표에 rl_arm_correction의 Δ를 더해 write로 BeebotSystemHardware가 OpenCR에 C 줄로 보낸다. arm_safety_monitor의 궤적 취소만 주기와 무관한 비동기 호출이다. 단계별로는 **흐름 따라가기 → "팔 한 주기"**에서 볼 수 있다.
- **bringup이 띄우는 노드도 전부 있다.** ros_system 묶음 외에 bringup이 직접 올리는 map_saver(+ lifecycle_manager_map_saver — RTAB-Map일 때 \`/map_saver/save_map\`)와 diagnostic_aggregator(모든 노드의 \`/diagnostics\` → \`/diagnostics_agg\`, 사람이 보는 것). 운영자 CLI(operator_tool)는 bringup 밖에서 따로 띄우는 노드다.
- **ros_system.launch.py가 띄우는 노드는 전부 이 도식에 있다.** robot_state_publisher · controller_manager(+ spawner 1회 · 컨트롤러 6) · move_group(spawner가 끝난 뒤) · twist_mux · RealSense ×2 · ekf_filter_node · RTAB-Map 묶음(scan_cam_gate · pole/gripper_rgbd_sync · rgbdx_sync · scan_cloud_merge · rtabmap) · Nav2 서버(planner · controller · behavior · bt_navigator · velocity_smoother · collision_monitor)와 lifecycle 관리자 둘. 관리자를 둘로 나눈 이유: 바퀴 명령 체인(base)은 odom만 있으면 뜨게 — 하나로 묶으면 지도가 없을 때 global_costmap 실패로 수동 조작까지 막혔음.
- **controller_manager는 하나.** 베이스·팔·그리퍼·IMU가 같은 OpenCR에 붙어 있으므로 hardware component 하나(BeebotSystemHardware)에 컨트롤러 6개를 함께 올린다.
- **LiDAR가 없으므로 /scan도 없다.** 장애물은 pole_front_cam PointCloud2에서 **body_filter**(perception 패키지)가 팔·차체 점(URDF collision + padding)을 뺀 \`/pole_front_cam/depth/color/points_filtered\`를 Nav2 costmap(local voxel · global obstacle layer)·collision_monitor에 넣는다. 원본을 그대로 넣으면 카메라에 찍힌 자기 팔이 로봇 둘레 벽으로 남는다. MoveIt octomap 센서는 아직 설정 전.
- **SLAM·위치추정은 RTAB-Map.** pole_front_cam RGB-D(+ 지도 만들 때 팔을 scan_pose에 세운 gripper_cam — scan_cam_gate가 그 자세일 때만 통과) + 몸 뺀 점구름(point_cloud_aggregator → \`/rtabmap/scan_cloud\`, 격자 /map·ICP) + EKF 오도메트리로 지도를 만들고(매핑 모드), 운영 중에는 같은 DB로 위치만 추정한다(위치추정 모드). slam_toolbox·amcl은 LaserScan이 필요해서 쓰지 않는다 (Nav2·SLAM 섹션의 3-1).
- **TF 발행자는 딱 둘로 나뉜다.** map→odom은 rtabmap, odom→base_footprint는 robot_localization EKF(바퀴 \`/odom\` + \`/imu\` 융합)만 낸다. EKF의 \`/odometry/filtered\`는 rtabmap의 오도메트리 입력이자 Nav2 controller의 현재 속도 입력이다. diff_drive_controller는 \`enable_odom_tf: false\`로 TF를 내지 않는다 (베이스·TF 섹션 참고).
- **gripper_cam도 RealSense.** perception의 두 번째 눈(퍽 윗면 AprilTag는 coordinator \`inspect\`로 위에서 봐야 읽힘), 파지 직전 근접 점구름(grasp_scorer, \`gripper_cam_pointcloud:=true\`일 때), 지도 만들 때는 두 번째 SLAM 카메라.
- **/state는 state_manager 하나만.** 조작 모드(AUTO·MANUAL·EXPLORE)·비상정지(\`/state/emergency\` → twist_mux 잠금)·지도 모드를 정하고, BeebotSystemHardware의 \`/motor_status\`로 \`/state/devices/<이름>\`을 낸다. EXPLORE면 explorer가 프론티어로 Nav2를 보내고 끝나면 \`/explore/result\`. 신호등 암호는 인지 쪽 signal_decoder(perception 패키지)가 \`/tracked_objects\`의 신호등 색을 시간축으로 읽어 \`/mission/signal\`로 planner에 준다.
`,
    links: { CUM: 'arm', NB: 'nav', IR: 'sense', S0: 'sense', S1: 'plan', S2: 'plan', S3: 'learn', S4: 'nav', N2: 'nav', RT: 'nav', S5: 'learn', S6: 'base', S7: 'ctrl', CM: 'ctrl', SHS: 'sense', SHA: 'ctrl', U: 'scenario' },
    nodes: {
      PCH: 'realsense_pole', PC: 'realsense_pole', GCH: 'realsense_gripper', GC: 'realsense_gripper', PER: 'perception', BF: 'body_filter',
      UI: 'user_input', VLM: 'vlm_task_planner', SD: 'signal_decoder', CO: 'coordinator', EXP: 'explorer', GS: 'grasp_scorer',
      MG: 'move_group', BT: 'bt_navigator', PS: 'planner_server', CS: 'controller_server', BS: 'behavior_server', LMN: 'lifecycle_manager', LMB: 'lifecycle_manager',
      RTAB: 'rtabmap', SCG: 'scan_cam_gate', PRS: 'rgbd_sync', GRS: 'rgbd_sync', RXS: 'rgbd_sync', PCA: 'point_cloud_aggregator', EKF: 'ekf', COST: 'costmap',
      RSP: 'robot_state_publisher', SPW: 'controller_manager', MS: 'map_saver', LMS: 'lifecycle_manager', DA: 'diagnostic_aggregator',
      RLA: 'rl_arm_correction', RLN: 'rl_nav_controller', ASM: 'arm_safety_monitor', TM: 'twist_mux', VS: 'velocity_smoother', CMN: 'collision_monitor',
      MC: 'manual_control', SM: 'state_manager',
      JTC: 'arm_controller', GRC: 'gripper_controller', DDC: 'diff_drive_controller', JSB: 'joint_state_broadcaster', IMB: 'imu_sensor_broadcaster',
      HWI: 'hw_interface', HW: 'hw_interface',
      CUMP: 'cumotion_planner', RSEG: 'robot_segmenter', LDH: 'lidar_driver', LDD: 'lidar_driver', CART: 'cartographer_node', OGN: 'cartographer_occupancy_grid_node', MSV: 'map_server', AMCL: 'amcl', VSLAM: 'cuvslam', NVB: 'nvblox', YOLO: 'isaac_yolo', CPOSE: 'centerpose', UNET: 'peoplesemsegnet',
    },
    flows: ARCH_FLOWS,
  },

  sense: {
    label: '1 센서·인지',
    md: `
## 1. 센서·인지

센서 장치(육각형)는 🔌 USB로 드라이버 노드에 연결되고, **토픽은 드라이버 노드가 발행**합니다. 카메라 드라이버가 영상·depth·camera_info를 내고, perception이 두 카메라의 검출을 map 기준 3D로 융합·추적합니다. 점구름은 body_filter가 자기 몸(팔·차체)을 뺀 뒤 Nav2·RTAB-Map으로 갑니다. 신호등 깜빡임은 signal_decoder가 해석해 미션 토픽(\`/mission/signal\`)으로 냅니다 — 바코드(\`/mission/qr\`)처럼 인지가 해석까지 하고 plan은 받아서 계획만. gripper_cam은 팔과 함께 움직이므로 **영상 시각의 TF**로 변환해야 위치가 어긋나지 않습니다(\`lookupTransform\`에 header.stamp 사용, 메시지 필터로 동기화).


${F}mermaid
flowchart TB
    GCH{{"gripper_cam<br/>RealSense RGB-D"}}
    PCH{{"pole_front_cam<br/>RealSense RGB-D"}}
    GC["📦 realsense2_camera<br/>gripper_cam 드라이버"]
    PC["📦 realsense2_camera<br/>pole_front_cam 드라이버"]
    RSP["📦 robot_state_publisher"]
    JS(["/joint_states ← 4"])
    PER["🛠️ perception<br/>YOLO detect · fusion · tracking"]
    BF["🛠️ body_filter<br/>자기 몸 점 제거"]
    SCG["🛠️ scan_cam_gate<br/>스캔 자세일 때만 통과"]
    PCA["📦 point_cloud_aggregator<br/>점구름 둘 → base_footprint"]
    SD["🛠️ signal_decoder<br/>신호등 깜빡임 → 미션 답"]
    O2(["→ 2 vlm · coordinator · grasp_scorer"])
    O3(["→ 3 rtabmap<br/>SLAM · 위치추정"])
    O4(["→ 3 costmap · 5 collision_monitor"])
    O5(["→ 2 grasp_scorer<br/>근접 파지 점구름"])
    JS -->|"✉️ /joint_states<br/>(sensor_msgs/JointState)<br/>관절각 → 링크 TF"| RSP
    GCH -->|"🔌 USB 3<br/>(RealSense SDK)"| GC
    PCH -->|"🔌 USB 3<br/>(RealSense SDK)"| PC
    GC -->|"✉️ /gripper_cam/color<br/>/image_raw · camera_info<br/>(sensor_msgs/Image ·<br/>CameraInfo)"| PER
    GC -->|"✉️ /gripper_cam<br/>/aligned_depth<br/>_to_color/image_raw<br/>(sensor_msgs/Image)"| PER
    GC -->|"✉️ /gripper_cam/depth<br/>/color/points<br/>(sensor_msgs/<br/>PointCloud2)"| O5
    PC -->|"✉️ /pole_front_cam/color<br/>/image_raw · camera_info<br/>(sensor_msgs/Image ·<br/>CameraInfo)"| PER
    PC -->|"✉️ /pole_front_cam/aligned_depth<br/>_to_color/image_raw<br/>(sensor_msgs/Image)"| PER
    PC -->|"✉️ /pole_front_cam/depth<br/>/color/points<br/>(sensor_msgs/<br/>PointCloud2)"| BF
    PC -->|"✉️ /pole_front_cam/color ·<br/>aligned_depth_to_color<br/>→ rgbd_sync<br/>(sensor_msgs/Image)"| O3
    RSP -->|"✉️ /tf · /tf_static<br/>(tf2_msgs/TFMessage)"| PER
    RSP -->|"✉️ /robot_description · /tf<br/>몸 모양 · 관절 위치<br/>(std_msgs/String ·<br/>tf2_msgs/TFMessage)"| BF
    BF -->|"✉️ /pole_front_cam/depth<br/>/color/points_filtered<br/>(sensor_msgs/<br/>PointCloud2)"| O4
    BF -->|"✉️ …/points_filtered<br/>(sensor_msgs/<br/>PointCloud2)"| PCA
    JS -->|"✉️ /joint_states<br/>스캔 자세인가<br/>(sensor_msgs/JointState)"| SCG
    GC -->|"✉️ /gripper_cam depth ·<br/>points<br/>(sensor_msgs/Image ·<br/>PointCloud2)"| SCG
    SCG -->|"✉️ /gripper_cam/aligned_depth<br/>_to_color/image_scan<br/>→ rgbd_sync<br/>(sensor_msgs/Image)"| O3
    SCG -->|"✉️ /gripper_cam/depth<br/>/color/points_scan<br/>(sensor_msgs/<br/>PointCloud2)"| PCA
    PCA -->|"✉️ /rtabmap/scan_cloud<br/>(sensor_msgs/<br/>PointCloud2)"| O3
    PER -->|"✉️ /tracked_objects · /mission/qr<br/>(perception/<br/>TrackedObjectArray ·<br/>std_msgs/String)"| O2
    PER -->|"✉️ /tracked_objects<br/>신호등 색"| SD
    SD -->|"✉️ /mission/signal<br/>(perception/<br/>MissionSignal)"| O2
${CLS}
    class PER,BF,SCG,PCA,SD,RSP,GC,PC std;
    class GCH,PCH hw;
    class JS,O2,O3,O4,O5 ext;
${F}

| 이름 | 종류 | 메시지 타입 | 보내는 쪽 → 받는 쪽 | 주기 · QoS |
| --- | --- | --- | --- | --- |
| /gripper_cam/color/image_raw | 토픽 | sensor_msgs/Image | realsense2_camera (gripper_cam) → perception, rtabmap(rgbd_sync), vlm_task_planner | 15Hz (기본 640×360×15) · best_effort |
| /gripper_cam/color/camera_info | 토픽 | sensor_msgs/CameraInfo | realsense2_camera (gripper_cam) → perception, rtabmap | 15Hz |
| /gripper_cam/aligned_depth_to_color/image_raw | 토픽 | sensor_msgs/Image | realsense2_camera (gripper_cam) → perception, scan_cam_gate | 15Hz · best_effort |
| /gripper_cam/depth/color/points | 토픽 | sensor_msgs/PointCloud2 | realsense2_camera (gripper_cam, \`gripper_cam_pointcloud:=true\`일 때) → grasp_scorer, scan_cam_gate | 기본 꺼짐 |
| /gripper_cam/aligned_depth_to_color/image_scan · /gripper_cam/depth/color/points_scan | 토픽 | sensor_msgs/Image · PointCloud2 | scan_cam_gate → rgbd_sync(gripper) · point_cloud_aggregator | 팔이 스캔 자세(\`scan_pose.yaml\`)에 멈춰 있을 때만 그대로, 아니면 0·빈 점구름 |
| /pole_front_cam/color/image_raw | 토픽 | sensor_msgs/Image | realsense2_camera (pole_front_cam 드라이버) → perception, rtabmap(rgbd_sync), vlm_task_planner | 15Hz · best_effort |
| /pole_front_cam/aligned_depth_to_color/image_raw | 토픽 | sensor_msgs/Image | realsense2_camera (pole_front_cam 드라이버) → perception, rtabmap(rgbd_sync) | 15Hz · best_effort |
| /pole_front_cam/depth/color/points | 토픽 | sensor_msgs/PointCloud2 | realsense2_camera (\`pointcloud.enable\`, decimation 2) → body_filter | 15Hz |
| /pole_front_cam/depth/color/points_filtered | 토픽 | sensor_msgs/PointCloud2 | body_filter → costmap(local·global), collision_monitor, point_cloud_aggregator | 자기 몸(URDF collision + padding) 점을 뺀 것, 4점당 1점 |
| /rtabmap/scan_cloud | 토픽 | sensor_msgs/PointCloud2 (base_footprint) | point_cloud_aggregator → rtabmap | 몸 뺀 pole_front_cam + 스캔 자세 gripper_cam — 격자 /map · ICP |
| /tf, /tf_static | 토픽 | tf2_msgs/TFMessage | robot_state_publisher, rtabmap, ekf → 전체 | 10~100Hz |
| /tracked_objects | 토픽 | perception/TrackedObjectArray | perception → vlm_task_planner, coordinator, grasp_scorer, signal_decoder | 10Hz · reliable |
| /mission/signal | 토픽 | perception/MissionSignal | signal_decoder → vlm_task_planner | 신호등 암호 답 {color, count, sum, dest_tag, raw} — 확정될 때마다 · reliable + transient_local |
| \`/perception/<cam>/detections\` | 토픽 | perception/TrackedObjectArray | perception → (시뮬레이터·디버그) | 추론마다(카메라당 ≤4Hz) — 융합 전 카메라별 검출 |
| /mission/qr | 토픽 | std_msgs/String | perception → vlm_task_planner | 읽은 바코드·QR 내용이 바뀔 때만 · reliable + transient_local |

- **TrackedObject 한 항목:** id, class_name, confidence, map 기준 pose(+공분산), size, last_seen, cameras(본 카메라 — 빈 배열이면 기억만), px(VLM 마킹용 픽셀), color, details(tag·content 등). VLM·coordinator·grasp_scorer가 같은 물체를 id로 가리킨다. 정의 원문은 \`perception/msg/TrackedObject.msg\`.
- **body_filter:** \`/robot_description\`(URDF collision)과 TF로 팔·차체 모양을 알고, 그 안(+ padding)의 점을 지운다. 원본 점구름을 costmap·RTAB-Map에 그대로 넣으면 카메라에 찍힌 자기 팔이 로봇 둘레 장애물로 남아 출발점부터 경로가 막혔다 (실측).
- **signal_decoder:** \`/tracked_objects\`의 신호등 색을 시간축으로 쌓아 1단계(색·개수) · 2단계(점수 합 = 번호 합) · 3단계(노랑 횟수 → 목적지 태그)를 읽는다. 단계 구분(두 색 이상 동시 \`all\` · 꺼짐)·점수·목적지 태그는 \`perception.yaml\` — 발제 미정이라 제안값.
- **scan_cam_gate:** 지도 만들 때 coordinator가 팔을 scan_pose로 세우면 gripper_cam이 왼쪽 뒤를 보는 두 번째 고정 카메라가 된다. 팔이 그 자세에 멈춰 있을 때만 depth·점구름을 통과시켜, 움직이는 카메라가 지도를 망치지 않게 한다.
- **/scan이 없다:** LiDAR를 쓰지 않으므로 LaserScan 기반 노드(slam_toolbox, amcl)는 빠진다. 거리 정보는 전부 RealSense depth에서 온다. 굳이 스캔이 필요하면 \`pointcloud_to_laserscan\`(target_frame=base_footprint, 높이 범위 지정)을 쓰고, \`depthimage_to_laserscan\`은 하향 카메라에선 바닥을 장애물로 잡으니 쓰지 않는다.
- **RealSense 2대 운용:** 드라이버를 카메라마다 하나씩 띄우고 \`serial_no\`로 구분, \`camera_namespace:=''\`·\`camera_name:=pole_front_cam / gripper_cam\`으로 토픽을 위 이름에 맞춘다. 가능하면 서로 다른 USB 3 컨트롤러에 꽂고, 대역폭·CPU를 아끼려 640×360 · 15fps(depth decimation 2)로 둔다. 둘 다 \`align_depth.enable:=true\`, IR 스트림 끔, \`publish_tf:=false\`(카메라 프레임은 URDF가 냄).
- **gripper_cam 근접 한계:** D435 계열은 최소 측정 거리가 대략 0.2~0.3m라 그리퍼가 컵에 바짝 붙으면 depth가 비어 버린다. 근접 점구름이 중요하면 D405 같은 근거리 모델을 고르거나, 점구름은 접근 시작점(약 0.3m)에서 미리 찍어 둔다.
- **gripper_cam은 움직인다:** 점구름을 쓸 때 영상 시각의 TF(gripper_cam_link)로 변환해야 팔이 움직이는 동안에도 위치가 맞는다.
`,
    nodes: {
      GCH: 'realsense_gripper', GC: 'realsense_gripper', PCH: 'realsense_pole', PC: 'realsense_pole',
      RSP: 'robot_state_publisher', JS: 'joint_state_broadcaster', PER: 'perception',
      BF: 'body_filter', SCG: 'scan_cam_gate', PCA: 'point_cloud_aggregator', SD: 'signal_decoder',
      O2: 'coordinator', O3: 'rtabmap', O4: 'costmap', O5: 'grasp_scorer',
    },
    flows: SENSE_FLOWS,
  },

  plan: {
    label: '2 계획·임무',
    md: `
## 2. 계획·임무

VLM이 작업 순서를 정하고, coordinator가 검증한 뒤 Nav2·MoveIt·그리퍼 컨트롤러에 **액션·서비스**로 실행을 맡깁니다. 앞단 학습 요소는 grasp_scorer 하나이고, 주행 정책은 3장 controller_server의 FollowPath 플러그인입니다. 신호등 암호 미션은 인지(1 — perception signal_decoder)가 읽은 답(\`/mission/signal\`)으로 planner가 규칙대로 계획합니다.

${F}mermaid
flowchart TB
    USER(((사람)))
    UI["🛠️ user_input<br/>텍스트 명령 입력 · 알림 표시<br/>(voice_ui 자리)"]
    TO(["/tracked_objects · /mission/qr ← 1"])
    ST(["/state/operation_mode · /state/emergency<br/>← state_manager"])
    SE(["/arm_safety_event ← 4"])
    AIS(["ai-service (호스트 VLM, HTTP)"])
    VLM["🛠️ vlm_task_planner"]
    SD(["/mission/signal ← 1 signal_decoder"])
    CO["🛠️ coordinator<br/>검증 · 실행 · 재시도 · 안전규칙"]
    GS["🛠️ grasp_scorer"]
    O3a(["→ 3 bt_navigator"])
    O4a(["→ 4 move_group"])
    O4b(["→ 4 gripper_controller"])
    O4c(["→ 4 arm_controller"])
    USER -->|"⌨️ 텍스트 명령<br/>“테이블 위 컵 가져다줘”"| UI
    UI -->|"✉️ /cmd/user_command<br/>(std_msgs/String)"| VLM
    CO -->|"✉️ /robot/say · /task/status<br/>(std_msgs/String ·<br/>plan/TaskStatus)"| UI
    UI -->|"🔊 안내 (터미널 텍스트)<br/>“컵 가져왔어요”<br/>“컵을 잡을 수 없어요”"| USER
    TO -->|"✉️ /tracked_objects · /mission/qr<br/>(perception/TrackedObjectArray ·<br/>std_msgs/String)"| VLM
    TO -->|"✉️ /tracked_objects<br/>id 검증 · 위치<br/>(perception/TrackedObjectArray)"| CO
    ST -->|"✉️ /state/operation_mode ·<br/>/state/emergency<br/>(std_msgs/String · Bool)"| CO
    ST -->|"✉️ /state/operation_mode<br/>(std_msgs/String)"| VLM
    SE -->|"✉️ /arm_safety_event<br/>(control/ArmSafetyEvent)"| CO
    VLM -->|"🌐 HTTP 계획 요청<br/>명령 · 물체 · 카메라 영상"| AIS
    SD -->|"✉️ /mission/signal<br/>(perception/MissionSignal)"| VLM
    VLM -->|"✉️ /task/sub_goals<br/>(plan/<br/>SubGoalArray)"| CO
    CO -->|"✉️ /task/status<br/>(plan/<br/>TaskStatus)"| VLM
    CO -.->|"📞 /score_grasps<br/>(ml/srv/<br/>ScoreGrasps)"| GS
    CO ==>|"🎬 /navigate_to_pose<br/>(nav2_msgs/action/<br/>NavigateToPose)"| O3a
    CO ==>|"🎬 /execute_trajectory<br/>(moveit_msgs/action/<br/>ExecuteTrajectory)"| O4a
    CO -.->|"📞 /plan_kinematic_path ·<br/>/apply_planning_scene ·<br/>/clear_octomap<br/>(moveit_msgs/srv/<br/>GetMotionPlan ·<br/>ApplyPlanningScene ·<br/>std_srvs/srv/Empty)"| O4a
    CO ==>|"🎬 /gripper_controller<br/>/gripper_cmd<br/>(control_msgs/action/<br/>ParallelGripperCommand)"| O4b
    CO -->|"✉️ /arm_controller<br/>/joint_trajectory<br/>시작 자세 (MoveIt 없이)<br/>(trajectory_msgs/<br/>JointTrajectory)"| O4c
${CLS}
    class VLM ai;
    class CO,UI std;
    class GS rl;
    class TO,SD,ST,SE,AIS,O3a,O4a,O4b,O4c ext;
${F}

| 이름 | 종류 | 메시지 타입 | 보내는 쪽 → 받는 쪽 | 주기 · QoS |
| --- | --- | --- | --- | --- |
| /cmd/user_command | 토픽 | std_msgs/String | user_input → vlm_task_planner | 명령마다 · reliable |
| /robot/say | 토픽 | std_msgs/String | coordinator → user_input | 알릴 때 · reliable |
| /task/sub_goals | 토픽 | plan/SubGoalArray | vlm_task_planner → coordinator | 계획마다 · reliable + transient_local |
| /task/status | 토픽 | plan/TaskStatus | coordinator → vlm_task_planner, user_input | 단계 완료·실패 시 · reliable + transient_local |
| /mission/qr | 토픽 | std_msgs/String | perception → vlm_task_planner | 내용이 바뀔 때만 · reliable + transient_local |
| /mission/signal | 토픽 | perception/MissionSignal | signal_decoder (perception) → vlm_task_planner | 확정될 때마다 · reliable + transient_local |
| /score_grasps | 서비스 | ml/srv/ScoreGrasps | coordinator → grasp_scorer | pick 직전 1회 |
| /navigate_to_pose | 액션 | nav2_msgs/action/NavigateToPose | coordinator → bt_navigator | 이동 단계마다 |
| /plan_kinematic_path | 서비스 | moveit_msgs/srv/GetMotionPlan | coordinator → move_group | pick·place 팔 동작마다 (계획) |
| /execute_trajectory | 액션 | moveit_msgs/action/ExecuteTrajectory | coordinator → move_group | 계획한 궤적 실행 |
| /gripper_controller/gripper_cmd | 액션 | control_msgs/action/ParallelGripperCommand | coordinator → gripper_controller (MoveIt 안 거침) | 열기·닫기 |
| /arm_controller/joint_trajectory | 토픽 | trajectory_msgs/JointTrajectory | coordinator → arm_controller | 기동 직후 시작 자세 1회 (MoveIt 없이) |
| /apply_planning_scene | 서비스 | moveit_msgs/srv/ApplyPlanningScene | coordinator → move_group | pick 전 (대상 등록) |
| /clear_octomap | 서비스 | std_srvs/srv/Empty | coordinator → move_group | pick 직전 |

**coordinator가 지키는 실행 규칙**

1. **VLM 출력 검증:** 형식(JSON 스키마), 허용 동작(navigate·pick·place·inspect·say), 대상 id가 /tracked_objects에 실제로 있는지.
   - inspect <퍽 id> = 퍽 위로 손끝(gripper_cam)을 가져가 윗면 16mm 태그를 읽게 함 (멀면 다가감, 집지 않음 — \`inspect_height_m\` 0.15 · \`inspect_wait_s\` 1.0).
   - pick·place의 대상 \`tray\` = 로봇 뒤 적재함 (여러 퍽을 실어 나름). 칸은 coordinator 파라미터 \`tray_slots\`(base_footprint, MoveIt 실측으로 닿는 곳 — 앞줄 x −0.095 · 뒷줄 x −0.135, y ±0.05), 실린 수는 coordinator가 센다 (꽉 차면 \`tray_full\`, 비면 \`tray_empty\`). 같은 구역에 여러 번 place하면 \`place_spacing\`(0.08m)씩 비켜 놓는다. 신호등 암호 미션(planner 규칙): 번호 합이 맞는 퍽 조합마다 navigate·pick·place tray → navigate 목적지 장소 → (pick tray · place 장소)×개수
2. **이동 전 팔 접기:** navigate 전에 팔을 stow 자세로. 컵을 든 채 이동하면 footprint를 키운 파라미터(\`/local_costmap/local_costmap/set_parameters\` footprint)로 바꾼다. *(아직 TODO — coordinator.hpp)*
3. **팔은 베이스가 멈췄을 때만:** NavigateToPose 성공 후 0.5초 안정 대기 → planning scene 갱신 → pick. *(0.5초 대기는 TODO)* 대상이 \`reach_m\`보다 멀면 pick·place 전에 먼저 그 물체를 바라보는 \`approach_m\` 자리로 navigate한다 (구현됨).
4. **파지 재시도는 coordinator 몫:** grasp_scorer 후보를 점수순으로 최대 \`max_grasp_tries\`(2)개 시도. 모두 실패하면 그때 /task/status로 VLM에 재계획을 요청한다.
5. **재시도 한도:** 같은 단계 2회 실패면 \`/robot/say\`로 user_input에 보내 사람에게 알리고 정지.
6. **AUTO일 때만:** \`/state/operation_mode\`가 MANUAL·EXPLORE면 진행 중 goal을 취소하고 FAILED(\`manual_override\`·\`explore_override\`), \`/state/emergency\`면 \`estop\`. planner는 이런 실패엔 재계획하지 않는다.

**명령 하나가 처리되는 순서** — 단계별로는 도식 위 **▶ 흐름 따라가기**에서 볼 수 있다.

- 명령 → VLM 계획 → coordinator가 /task/sub_goals를 받아 검증
- 이동 단계: NavigateToPose. controller_server의 FollowPath(정책 또는 inner DWB)가 20Hz로 /cmd_vel_nav를 낸다
- pick 단계: 장면 갱신(octomap 지우기·대상 등록) → 파지 후보 점수 → 📞 /plan_kinematic_path → 🎬 /execute_trajectory → 🎬 그리퍼 닫기. 실패하면 다음 후보로 재시도
- 단계가 끝날 때마다 /task/status (place까지 이동·pick을 반복한 뒤 마지막 완료 보고)
- 결과를 user_input에 알림
- 번호 없는 화살표(/tracked_objects, /state/..., /arm_safety_event, 내비 상태)는 늘 들어오는 입력이다.

- grasp_scorer는 pick 직전에 한 번만 물으면 되므로 토픽보다 서비스가 맞다.
- 주행 정책은 별도 노드가 아니라 controller_server의 FollowPath 플러그인이다 — \`~/FollowPath/toggle\`로 켜고 끄고, 상태는 \`~/FollowPath/status\`로 본다.
`,
    nodes: {
      UI: 'user_input', TO: 'perception', ST: 'state_manager', SE: 'arm_safety_monitor', VLM: 'vlm_task_planner', SD: 'signal_decoder',
      CO: 'coordinator', GS: 'grasp_scorer',
      O3a: 'bt_navigator', O4a: 'move_group', O4b: 'gripper_controller', O4c: 'arm_controller',
    },
    flows: PLAN_FLOWS,
  },

  nav: {
    label: '3 Nav2·SLAM',
    md: `
## 3. Nav2

bt_navigator가 행동 트리로 "경로 계산 → 따라가기 → 막히면 복구"를 지휘합니다. LiDAR가 없으므로 **장애물은 pole_front_cam 점구름**, **위치는 RTAB-Map**(위치추정 모드)이 공급합니다. planner_server 안에 global_costmap, controller_server 안에 local_costmap이 들어 있고, **FollowPath는 ml::RlNavController 플러그인**이 맡습니다 — ONNX 정책이 v·ω를 직접 내고, 꺼지면 inner DWB로 바이패스합니다. **behavior_server**가 Spin·BackUp·Wait 복구를 맡습니다(기본 BT가 호출하므로 반드시 띄운다).

${F}mermaid
flowchart TB
    IN(["NavigateToPose ← 2 coordinator · explorer"])
    PTS(["몸 뺀 점구름 ← 1 body_filter<br/>/pole_front_cam/depth/color/points_filtered"])
    RGBD(["/rtabmap/rgbd_images · scan_cloud ← 1<br/>pole_front_cam + 스캔 자세 gripper_cam"])
    ODOM(["/odometry/filtered ← 5 ekf"])
    IMU(["/imu ← 7 imu_sensor_broadcaster"])
    BT["📦 bt_navigator<br/>행동 트리"]
    PS["📦 planner_server<br/>+ global_costmap"]
    CS["📦 controller_server<br/>+ local_costmap<br/>FollowPath = 🧩 RlNavController"]
    RLN["🧩 RlNavController (ml)<br/>FollowPath 플러그인 · ROS 노드 아님<br/>ONNX 정책 · inner DWB 바이패스"]
    BS["📦 behavior_server<br/>Spin · BackUp · Wait"]
    RTAB["📦 rtabmap<br/>위치추정 모드"]
    LMN["📦 lifecycle_manager_navigation"]
    O5a(["→ 5 twist_mux (자동)"])
    IN ==>|"🎬 /navigate_to_pose<br/>(nav2_msgs/action/<br/>NavigateToPose)"| BT
    BT ==>|"🎬 /compute_path_to_pose<br/>(nav2_msgs/action/<br/>ComputePathToPose)"| PS
    BT ==>|"🎬 /follow_path<br/>(nav2_msgs/action/<br/>FollowPath)"| CS
    BT ==>|"🎬 /spin · /backup ·<br/>/wait<br/>(nav2_msgs/action/<br/>Spin · BackUp · Wait)"| BS
    RGBD -->|"✉️ /rtabmap/rgbd_images ·<br/>/rtabmap/scan_cloud<br/>(rtabmap_msgs/RGBDImages ·<br/>sensor_msgs/PointCloud2)"| RTAB
    ODOM -->|"✉️ /odometry/filtered<br/>(nav_msgs/Odometry)"| RTAB
    RTAB -->|"✉️ /map transient_local<br/>(nav_msgs/OccupancyGrid)"| PS
    RTAB -->|"✉️ /tf (map→odom 변환)<br/>(tf2_msgs/TFMessage)"| CS
    PTS -->|"✉️ …/points_filtered<br/>global obstacle 층<br/>(sensor_msgs/PointCloud2)"| PS
    PTS -->|"✉️ …/points_filtered<br/>local voxel 층<br/>(sensor_msgs/PointCloud2)"| CS
    ODOM -->|"✉️ /odometry/filtered<br/>현재 속도<br/>(nav_msgs/Odometry)"| CS
    CS -->|"🔗 FollowPath 호출<br/>(같은 프로세스)"| RLN
    PTS -->|"✉️ …/points_filtered<br/>360방향 가상 스캔"| RLN
    IMU -->|"✉️ /imu gyro_z"| RLN
    RLN -->|"✉️ /cmd_vel_nav<br/>(geometry_msgs/<br/>TwistStamped)"| O5a
    BS -->|"✉️ /cmd_vel_nav<br/>(geometry_msgs/<br/>TwistStamped)"| O5a
    LMN -.->|"📞 change_state<br/>(lifecycle_msgs/srv/<br/>ChangeState)"| BT
    LMN -.->|"📞 change_state<br/>(lifecycle_msgs/srv/<br/>ChangeState)"| PS
    LMN -.->|"📞 change_state<br/>(lifecycle_msgs/srv/<br/>ChangeState)"| CS
    LMN -.->|"📞 change_state<br/>(lifecycle_msgs/srv/<br/>ChangeState)"| BS
${CLS}
    class BT,PS,CS,BS,RTAB,LMN std;
    class RLN rl;
    class IN,PTS,RGBD,ODOM,IMU,O5a ext;
${F}

| 이름 | 종류 | 메시지 타입 | 보내는 쪽 → 받는 쪽 | 주기 · QoS |
| --- | --- | --- | --- | --- |
| /compute_path_to_pose | 액션 | nav2_msgs/action/ComputePathToPose | bt_navigator → planner_server | 약 1Hz 재계획 |
| /follow_path | 액션 | nav2_msgs/action/FollowPath | bt_navigator → controller_server | 경로 변경 시 |
| /spin, /backup, /wait | 액션 | nav2_msgs/action/Spin 등 | bt_navigator → behavior_server | 복구 시 |
| /map | 토픽 | nav_msgs/OccupancyGrid | rtabmap → global_costmap | 갱신 시 · **transient_local** |
| /plan | 토픽 | nav_msgs/Path | planner_server → controller_server(FollowPath 인자) · RViz | 계획마다 |
| /cmd_vel_nav | 토픽 | geometry_msgs/TwistStamped | controller_server(FollowPath 플러그인), behavior_server → twist_mux | 20Hz |
| */change_state | 서비스 | lifecycle_msgs/srv/ChangeState | lifecycle_manager → 관리 대상 노드 | 시작·종료 시 |

**순서** — 단계별로는 도식 위 **▶ 흐름 따라가기**에서 볼 수 있다.

- 시작할 때 1회: lifecycle_manager가 Nav2 서버들을 configure → activate 한다
- coordinator의 NavigateToPose 도착
- 경로 계산 → /plan 발행
- 경로 따라가기 → /cmd_vel_nav 20Hz. 주행 중 경로 계산~따라가기가 약 1Hz로 반복된다(재계획)
- 막혔을 때만: 복구 동작(Spin·BackUp·Wait) → 복구 중 속도 명령. 끝나면 경로 계산부터 다시
- 번호 없는 화살표(/map, map→odom, 점구름, /odometry/filtered, /imu)는 늘 들어오는 입력이다.

- **costmap 장애물 층:** LaserScan이 없으므로 PointCloud2를 \`observation_sources\`로 넣는다 — local_costmap은 \`voxel_layer\`, global_costmap은 \`static_layer\`(/map) + \`obstacle_layer\`. 소스는 둘 다 body_filter의 \`/pole_front_cam/depth/color/points_filtered\`(자기 팔·차체 점 제거). \`min_obstacle_height 0.03\` · \`max_obstacle_height 0.6\`으로 바닥만 거르고 퍽(3~5cm)도 장애물로 잡는다. robot_radius 0.18.
- **시야 사각지대:** pole_front_cam 수평 화각은 약 87°라 옆·뒤가 안 보인다. 한 번 본 장애물이 시야 밖에서도 남도록 voxel layer의 clearing을 보수적으로 두고, BT의 **BackUp 복구는 빼거나 거리를 0.1m 이하로** 제한한다(뒤를 못 보므로 collision_monitor도 막아 주지 못한다). Spin도 짧게. 구현: \`ros_system/config/navigate_to_pose.xml\`(Nav2 기본 BT 복사본에서 BackUp만 0.10m · 0.05m/s)을 \`ros_system.launch.py\`가 \`default_nav_to_pose_bt_xml\`로 넘긴다. 기본 0.30m로는 벽에 박혀 odom이 밀리고 → 위치추정이 벽 안으로 → 출발점부터 경로 실패 → 또 후진이 반복되는 것을 테스트베드에서 봤다.
- **lifecycle:** rtabmap은 Nav2 lifecycle 관리 대상이 아니다. 관리자는 둘로 나눈다 — \`lifecycle_manager_navigation\`(planner·controller·behavior·bt_navigator, map 필요)과 \`lifecycle_manager_base\`(velocity_smoother·collision_monitor, odom만 있으면 뜸). 하나로 묶으면 RTAB-Map이 아직 map→odom을 못 낼 때 global_costmap 실패로 수동 조작까지 막혔다 (실측). 지도 저장용 map_saver에도 관리자가 따로 붙는다.
- **나머지 Nav2 서버:** nav2_bringup을 쓰지 않고 \`ros_system.launch.py\`가 서버를 직접 띄운다 (bringup은 velocity_smoother 입력을 /cmd_vel_nav로 고정해 우리 체인을 건너뜀). smoother_server·waypoint_follower는 안 띄운다. velocity_smoother·collision_monitor는 5장에서 다룬다.
- **리매핑 둘:** Nav2 기본 bringup은 controller_server 출력을 /cmd_vel_nav, velocity_smoother 입력을 /cmd_vel_nav로 잇는다. 여기서는 (1) velocity_smoother 입력을 /cmd_vel_mux로 바꿔 twist_mux를 끼우고, (2) twist_mux 자동 입력을 /cmd_vel_nav로 맞춘다. behavior_server의 출력도 같은 /cmd_vel_nav로 맞춰 복구 동작도 안전 필터를 거치게 한다. 수동(/cmd_vel_manual)은 twist_mux가 자동보다 우선, /cmd/e_stop이면 전부 차단.
- **FollowPath 플러그인:** \`ml::RlNavController\` — 정책(ONNX)이 v·ω를 직접 내고, \`enable=false\`·모델 없음·점구름 stale이면 inner DWB가 그대로 주행한다. 토글 \`~/FollowPath/toggle\`, 상태 \`~/FollowPath/status\`, 디버그 \`~/FollowPath/debug\`. \`/speed_limit\` 발행자는 없다.
- **Twist vs TwistStamped:** Jazzy 이후(이 로봇은 Lyrical) Nav2 \`enable_stamped_cmd_vel: true\`, diff_drive_controller는 TwistStamped만 받는다. 체인 전체를 하나로 통일한다.

## 3-1. 지도 생성 (SLAM) — RTAB-Map

LiDAR가 없으므로 **RGB-D SLAM인 RTAB-Map**을 씁니다. pole_front_cam의 컬러 + 정렬된 depth(지도 만들 때는 스캔 자세 gripper_cam도)와 휠/IMU 오도메트리(EKF의 odom TF)로 지도를 만들고, 결과는 지도 폴더 \`<map_dir>/<이름>/rtabmap.db\` 하나에 저장됩니다. 운영 때는 같은 DB를 위치추정 모드로 열어 map→odom만 냅니다. Nav2가 쓰는 2D 지도(/map)는 RTAB-Map이 **몸 뺀 점구름**(\`/rtabmap/scan_cloud\`, \`Grid/Sensor 0\`)으로 만듭니다 — depth 영상으로 만들면 카메라에 찍힌 팔이 벽으로 남았습니다.

${F}mermaid
flowchart TB
    subgraph M["① 매핑 단계 (처음 한 번)"]
        direction LR
        OP(((사람)))
        TEL["📦 teleop_twist_keyboard"]
        DD1["📦 diff_drive_controller"]
        EKF1["📦 ekf"]
        CH1{{"pole_front_cam<br/>RealSense RGB-D"}}
        RS1["📦 realsense2_camera"]
        RT1["📦 rtabmap<br/>매핑 모드"]
        DB[("~/.ros/beebot_maps/이름/rtabmap.db")]
        OP -->|"⌨️ 키보드<br/>i 전진 · , 후진<br/>j / l 회전 · k 정지"| TEL
        TEL -->|"✉️ /cmd/manual/cmd_vel → manual_control<br/>→ twist_mux … → /cmd_vel<br/>(geometry_msgs/<br/>TwistStamped)"| DD1 -->|"✉️ /odom<br/>(nav_msgs/Odometry)"| EKF1 -->|"✉️ /odometry/filtered<br/>(nav_msgs/Odometry)"| RT1
        CH1 -->|"🔌 USB 3<br/>(RealSense SDK)"| RS1
        RS1 -->|"✉️ /pole_front_cam/color ·<br/>aligned_depth_to_color<br/>(sensor_msgs/Image)"| RT1
        RT1 -->|"💾 저장<br/>(노드 · 그래프 · 특징점)"| DB
    end
    subgraph O["② 운영 단계 (매번)"]
        direction LR
        CH2{{"pole_front_cam<br/>RealSense RGB-D"}}
        RS2["📦 realsense2_camera"]
        RT2["📦 rtabmap<br/>위치추정 모드"]
        NAV2["📦 Nav2"]
        CH2 -->|"🔌 USB 3<br/>(RealSense SDK)"| RS2
        RS2 -->|"✉️ /pole_front_cam/color ·<br/>aligned_depth_to_color<br/>(sensor_msgs/Image)"| RT2
        RT2 -->|"✉️ /map transient_local<br/>(nav_msgs/OccupancyGrid)"| NAV2
        RT2 -->|"✉️ /tf (map→odom 변환)<br/>(tf2_msgs/TFMessage)"| NAV2
    end
    DB -.->|"💾 같은 DB를 불러옴<br/>(rtabmap.db)"| RT2
${CLS}
    class TEL,DD1,EKF1,RS1,RT1,RS2,RT2,NAV2 std;
    class CH1,CH2 hw;
${F}

| 단계 | 실행 노드 | 하는 일 | 결과 |
| --- | --- | --- | --- |
| 1. 지도 생성 | rtabmap (매핑 모드, \`map:=slam\` → \`localization:=false\`) | 텔레옵(또는 EXPLORE 자동 탐사)으로 0.1~0.15m/s로 천천히 돌며 RGB-D + 오도메트리로 지도 작성. 같은 장소를 다른 방향에서도 보고, 출발점으로 돌아와 루프 클로저 | rtabmap.db, /map, map→odom TF |
| 2. 저장 | rtabmap (자동) + map_saver | 종료 시 DB가 자동 저장된다. 2D 미리보기는 \`/map_saver/save_map\` (시뮬레이터 [지도 저장]) | rtabmap.db (+ map.pgm · map.yaml) |
| 3. 운영 | rtabmap (위치추정 모드, \`map:=saved\` → \`localization:=true\`) | 저장된 DB로 현재 위치를 찾고 map→odom 발행. 지도는 더 키우지 않음 | /map, map→odom TF |

${F}bash
# 1) 매핑 — 새 지도 폴더 <map_dir>/<날짜_시각>/rtabmap.db (map_name:=으로 이름 지정)
ros2 launch bringup bringup.launch.py map:=slam
#    RTAB-Map은 ros_system.launch.py가 직접 띄운다 (카메라 두 대라 rtabmap_launch 대신):
#    rgbd_sync ×2 → rgbdx_sync → rtabmap (rgbd_cameras 0) + scan_cloud(/rtabmap/scan_cloud)
#    rtabmap_args: --Reg/Force3DoF true --Grid/Sensor 0 --Reg/Strategy 2 --Vis/MinInliers 35 ...

# 2) Nav2·시뮬레이터용 2D 지도 미리보기 (같은 폴더 map.pgm · map.yaml) — 시뮬레이터 [지도 저장]과 같은 서비스
ros2 service call /map_saver/save_map nav2_msgs/srv/SaveMap "{map_topic: /map, map_url: <map_dir>/<이름>/map}"

# 3) 운영 — 저장 지도로 위치추정만 (map_name을 비우면 default, 없으면 가장 최근 폴더)
ros2 launch bringup bringup.launch.py map:=saved map_name:=<이름>

# 실행 중 전환 (재시작 없이, state_manager): /cmd/map_mode MAPPING|LOCALIZATION · /cmd/map_name <이름>
${F}

- **오도메트리는 휠+IMU(ekf)로:** 시각 오도메트리 없이 EKF의 odom→base_footprint TF를 영상 시각으로 읽는다 (\`odom_sensor_sync\`, 회전 분산을 작게 — 클로저가 회전을 끌고 가지 않게). 카메라가 하향이라 시각 오도메트리는 바닥 질감에 약하다.
- **평면 로봇 고정:** \`Reg/Force3DoF true\`로 x·y·yaw만 추정하게 해서 기울어짐 오차를 막는다.
- **지도 품질 팁:** 화각이 좁으므로 천천히, 같은 공간을 여러 방향에서 본다. 흰 벽·유리처럼 특징이 없는 곳은 루프 클로저가 안 되니 근처 가구를 함께 비추며 지나간다. 조명이 크게 다르면(낮/밤) 위치 찾기가 약해지니 두 조건 모두에서 매핑해 둔다.
- **시작 위치:** 위치추정 모드는 처음 몇 초간 지도와 맞는 장면을 찾아야 map→odom이 나온다. 그 전에는 Nav2 목표를 보내지 않는다 (coordinator의 TF 대기는 아직 TODO — 지금은 Nav2가 실패로 돌려줌).
- **가구가 크게 바뀌면** 다시 매핑한다. 의자처럼 자주 움직이는 물체는 costmap이 실시간 점구름으로 잡는다.
- **대안:** \`pointcloud_to_laserscan\`으로 가짜 스캔을 만들어 slam_toolbox + amcl을 쓸 수도 있지만, 화각 87°의 짧은 스캔이라 매칭이 자주 실패한다. RGB-D만 있다면 RTAB-Map이 표준 선택이다.

<p><button class="rd-sec" data-sec="map">🗺️ 지도 맵핑 실습(따라하기)으로 →</button></p>
`,
    nodes: {
      IN: 'coordinator', PTS: 'body_filter', RGBD: 'rgbd_sync', ODOM: 'ekf', IMU: 'imu_sensor_broadcaster',
      BT: 'bt_navigator', PS: 'planner_server', CS: 'controller_server', BS: 'behavior_server', RTAB: 'rtabmap',
      LMN: 'lifecycle_manager', RLN: 'rl_nav_controller', O5a: 'twist_mux',
      TEL: 'teleop', DD1: 'diff_drive_controller', EKF1: 'ekf', CH1: 'realsense_pole', RS1: 'realsense_pole',
      CH2: 'realsense_pole', RS2: 'realsense_pole', RT1: 'rtabmap', RT2: 'rtabmap', NAV2: 'bt_navigator',
    },
    flows: NAV_FLOWS,
  },

  map: {
    label: '3-1 지도 맵핑',
    md: `
## 3-1. 지도 맵핑 — 직접 따라하기

개념·launch 명령 원문은 **3 Nav2·SLAM의 §3-1**에 있습니다. 여기는 손으로 직접 해보는 순서와 확인·문제 해결만 모았습니다.

<p><button class="rd-sec" data-sec="nav">◀ 개념·명령은 3 Nav2·SLAM에서 보기</button> <button class="rd-sec" data-sec="scenario">▶ 노드끼리 주고받는 순서는 시나리오 8~11</button></p>

${F}mermaid
flowchart LR
    A["준비<br/>DB 지우기 · 토픽 확인"] -->|"토픽 정상 확인 후<br/>map:=slam 기동"| B["매핑 주행<br/>teleop 저속"]
    B -->|"다 돌았으면<br/>출발점으로"| C["루프 클로저<br/>출발점 복귀"]
    C -->|"지도가 맞춰지면<br/>SLAM 켠 채로"| D["저장<br/>rtabmap.db"]
    D -->|"map:=saved로<br/>다시 기동"| E["위치추정 확인<br/>map to odom"]
${CLS}
    class A,B,C,D,E std;
${F}

### 따라하기

1. **매핑 모드로 띄우기** — \`ros2 launch bringup bringup.launch.py map:=slam\` (새 폴더에 새 DB). 실행 중이면 \`/cmd/map_mode MAPPING\`. 지도 모드가 MAPPING이면 coordinator가 팔을 scan_pose로 세운다.
2. **천천히 주행 (0.1~0.15m/s)** — teleop_twist_keyboard(\`/cmd/manual/cmd_vel\`, MANUAL 모드)로, 또는 \`/cmd/operation_mode EXPLORE\`로 explorer 자동 탐사. 같은 공간을 여러 방향에서 보고, 특징 없는 흰 벽·유리 앞에선 근처 가구를 함께 비추며 지나간다.
3. **출발점으로 돌아오기 (루프 클로저)** — 같은 장소를 다시 보면 누적 오차가 잡히고 지도가 하나로 붙는다. 안 붙으면 지도가 두 겹으로 어긋난다.
4. **저장 확인** — 종료 시 \`<map_dir>/<이름>/rtabmap.db\`에 자동 저장 (실기 \`ros2_ws/map\`, 기본 \`~/.ros/beebot_maps\`). 2D 지도 미리보기는 \`/map_saver/save_map\`(시뮬레이터 [지도 저장]).
5. **위치추정 모드로 전환** — \`map:=saved map_name:=<이름>\`으로 다시 띄우거나 \`/cmd/map_mode LOCALIZATION\`. 처음 몇 초는 지도와 맞는 장면을 찾는 중이라 map→odom이 없다 — Nav2 목표는 TF가 나온 뒤에 보낸다(coordinator가 대기).

### 확인 명령

${F}bash
ros2 run tf2_ros tf2_echo map odom     # 위치추정 중이면 변환이 찍힘
ros2 topic echo /map --once            # 2D 지도 1장 수신 확인
${F}

### 안 되면

| 증상 | 원인·대처 |
| --- | --- |
| map→odom이 안 나온다 | 아직 장면 탐색 중 — 매핑했던 장소를 천천히 비추며 기다린다. 그래도 안 되면 조명(낮/밤)이 달라진 것. 해당 조건에서 다시 매핑한다 |
| 지도가 두 겹·찌그러짐 | 루프 클로저 실패 — 속도를 낮추고 겹치게 주행한다. \`Reg/Force3DoF true\` 확인 |
| 위치가 튄다 | 오도메트리 입력 확인 — \`/odometry/filtered\`(ekf)가 들어오는지, \`visual_odometry:=false\`인지 |
| 가구를 옮겼더니 길을 못 찾음 | 정상 — 크게 바뀌면 다시 매핑한다. 의자 같은 이동 물체는 costmap 실시간 점구름이 처리한다 |

### 학습 포인트

- 왜 천천히 도나: 좁은 화각 + 빠른 회전 = 특징점 추적 실패 → 지도 어긋남.
- 왜 출발점으로 돌아오나: 루프 클로저가 쌓인 오차를 한 번에 잡아준다.
- 왜 DB 하나인가: 지도·그래프·특징점이 한 파일이라 운영 때는 읽기만 하면 된다.
`,
  },

  arm: {
    label: '4 팔·MoveIt',
    md: `
## 4. 팔: MoveIt 2 + ros2_control

pick·place는 coordinator가 move_group에 📞 \`/plan_kinematic_path\`(계획)·🎬 \`/execute_trajectory\`(실행)를 동작마다 부르고, move_group이 \`arm_controller\`(JointTrajectoryController)에 궤적을 넘깁니다. 그리퍼는 **MoveIt을 거치지 않고** 🎬 \`ParallelGripperCommand\`로 직접 열고 닫습니다. 접근(직선) → 열기 → 파지 → **attach** → 들어올리기 → 후퇴를 한 번에 짜는 MoveIt Task Constructor(MTC)는 설계 목표로 남아 있고 아직 TODO입니다. controller_manager 안쪽은 토픽이 아니라 같은 프로세스의 메모리로 연결됩니다.

${F}mermaid
flowchart TB
    IN(["/plan_kinematic_path · /execute_trajectory ← 2"])
    SC(["/apply_planning_scene · /clear_octomap ← 2"])
    GIN(["gripper_cmd ← 2 coordinator · manual_control"])
    TIN(["/arm_controller/joint_trajectory<br/>← 2 coordinator 시작 자세 · manual_control"])
    MG["📦 move_group<br/>계획 · 충돌검사 (OMPL · pick_ik)"]
    ASM["🛠️ arm_safety_monitor<br/>전류 기반 접촉 감지"]
    subgraph CM["controller_manager (프로세스 내부 100Hz)"]
        JTC["📦 arm_controller<br/>JTC + 경로 허용오차"]
        RAC["🧩 rl_arm_correction (ml)<br/>extends ChainableControllerInterface<br/>플러그인 · ROS 노드 아님"]
        GRC["📦 gripper_controller<br/>parallel_gripper_action"]
        JSB["📦 joint_state_broadcaster"]
        HWI["🧩 BeebotSystemHardware (control)<br/>extends hardware_interface::<br/>SystemInterface<br/>플러그인 · ROS 노드 아님"]
        JTC -->|"🔗 reference interface<br/>rl_arm_correction/joint1~5<br/>(double)"| RAC
        RAC -->|"🔗 command interface<br/>joint1~5/position<br/>(double)"| HWI
        GRC -->|"🔗 command interface<br/>gripper_left_joint/position (m)"| HWI
        HWI -->|"🔗 state interface<br/>(double)"| JTC
        HWI -->|"🔗 state interface<br/>joint1~5 position·velocity<br/>(double)"| RAC
        HWI -->|"🔗 state interface<br/>gripper position·effort<br/>(파지 여부 판단)"| RAC
        HWI -->|"🔗 state interface<br/>(double)"| JSB
    end
    MOT{{"OpenCR 펌웨어 → DYNAMIXEL<br/>팔 5축 · 그리퍼"}}
    O1(["→ 1 robot_state_publisher · move_group<br/>· 2 coordinator · manual_control · state_manager"])
    O2(["→ 2 coordinator"])
    IN ==>|"📞 /plan_kinematic_path<br/>🎬 /execute_trajectory<br/>(moveit_msgs)"| MG
    SC -.->|"📞 /apply_planning_scene ·<br/>/clear_octomap<br/>(moveit_msgs/srv · std_srvs/srv)"| MG
    MG ==>|"🎬 /arm_controller<br/>/follow_joint_trajectory<br/>(control_msgs/action/<br/>FollowJointTrajectory)"| JTC
    GIN ==>|"🎬 /gripper_controller<br/>/gripper_cmd<br/>(control_msgs/action/<br/>ParallelGripperCommand)"| GRC
    TIN -->|"✉️ (trajectory_msgs/<br/>JointTrajectory)"| JTC
    HWI -->|"🔌 USB 시리얼 C 줄<br/>관절 5 · 그리퍼 목표<br/>(OpenCR가 BulkWrite)"| MOT
    MOT -->|"🔌 S 줄 10ms<br/>Present Pos·Vel·Current<br/>(OpenCR가 SyncRead, Current → effort)"| HWI
    JSB -->|"✉️ /joint_states<br/>(sensor_msgs/JointState)"| O1
    JSB -->|"✉️ /joint_states effort<br/>(sensor_msgs/JointState)"| ASM
    ASM -.->|"📞 follow_joint_trajectory<br/>/_action/cancel_goal<br/>(action_msgs/srv/<br/>CancelGoal)"| JTC
    ASM -->|"✉️ /arm_safety_event<br/>(control/<br/>ArmSafetyEvent)"| O2
${CLS}
    class MG,JTC,GRC,JSB,HWI std;
    class RAC rl;
    class ASM safe;
    class MOT hw;
    class IN,SC,GIN,TIN,O1,O2 ext;
${F}

**순서** — 단계별로는 도식 위 **▶ 흐름 따라가기**에서 볼 수 있다.

- coordinator가 장면 갱신(2장 pick 단계) 뒤 📞 /plan_kinematic_path로 궤적을 받고 🎬 /execute_trajectory로 실행 요청
- 팔 궤적(→ JTC)과 그리퍼 명령(→ gripper_controller, coordinator가 직접)을 번갈아 보낸다. 접근 → 그리퍼 닫기 → 들어올리기 순서로
- controller_manager 100Hz 한 주기 (read → update → write)
  - read: BeebotSystemHardware가 OpenCR S 줄에서 위치·속도·전류를 읽는다
  - 읽은 값이 state interface로 각 컨트롤러에 보인다 (같은 메모리)
  - update: joint_state_broadcaster가 /joint_states 발행
  - update: JTC가 이번 주기 목표 관절각을 rl_arm_correction의 reference로 넘긴다
  - update: rl_arm_correction(목표각 + Δ)과 gripper_controller가 command를 쓴다
  - write: C 줄로 OpenCR에 보내고 다음 주기 read로
- 이상 시에만: arm_safety_monitor가 /joint_states의 전류를 보고 접촉을 찾으면 궤적 취소 → coordinator에 보고

| 이름 | 종류 | 메시지 타입 | 보내는 쪽 → 받는 쪽 | 주기 |
| --- | --- | --- | --- | --- |
| /plan_kinematic_path | 서비스 | moveit_msgs/srv/GetMotionPlan | coordinator → move_group | 팔 동작마다 |
| /execute_trajectory | 액션 | moveit_msgs/action/ExecuteTrajectory | coordinator → move_group | 팔 동작마다 |
| /arm_controller/follow_joint_trajectory | 액션 | control_msgs/action/FollowJointTrajectory | move_group → arm_controller | 궤적마다 |
| /arm_controller/joint_trajectory | 토픽 | trajectory_msgs/JointTrajectory | coordinator(시작 자세) · manual_control(수동 팔) → arm_controller | MoveIt 없이 한 점 |
| /gripper_controller/gripper_cmd | 액션 | control_msgs/action/ParallelGripperCommand | coordinator · manual_control → gripper_controller | 잡기·놓기 |
| rl_arm_correction/jointN/position | reference 인터페이스 | double | arm_controller → rl_arm_correction | 100Hz |
| jointN/position (command·state) | 하드웨어 인터페이스 | double | 컨트롤러 ↔ BeebotSystemHardware | 100Hz |
| /joint_states | 토픽 | sensor_msgs/JointState | joint_state_broadcaster → robot_state_publisher, move_group, arm_safety_monitor(전류), coordinator(현재 각도), manual_control(수동 기준), state_manager(OpenCR 연결 확인), scan_cam_gate(스캔 자세) | 100Hz |

### 4-1. 파지 계획에서 꼭 챙길 것

- **5축 팔의 한계:** OM-X 4축 + 손목 roll(joint5)이라도 임의의 6D 자세는 못 만든다. grasp 후보는 IK로 도달 가능한 것만 남기고, IK 솔버는 pick_ik(위치 우선, \`rotation_scale 0\`)를 쓴다 — KDL은 "위치 + 위→아래 방향" 목표를 못 풀었다. "옆에서 수평" 파지는 팔 평면 안에 컵이 있어야 가능하므로, coordinator가 베이스를 대상 방향으로 바라보게 세운다 (\`approach_m\`).
- **그리퍼는 MoveIt 밖:** moveit_controllers.yaml엔 arm_controller만 있다. Lyrical엔 GripperCommand 컨트롤러가 없어 parallel_gripper_action_controller(ParallelGripperCommand)를 쓰는데, MoveIt simple controller manager의 GripperCommand 타입과 안 맞기 때문이다.
- **octomap 속 목표 컵:** octomap 센서를 붙이면 pole_front_cam 점구름에 목표 컵도 voxel로 들어간다. 그대로면 그리퍼 접근이 충돌로 거부된다. pick 직전 /clear_octomap → 대상을 CollisionObject로 등록 → 그리퍼와 대상의 충돌을 허용(ACM)한다. (octomap 센서 설정은 아직 전)
- **잡은 뒤 attach:** 컵을 AttachedCollisionObject로 gripper_link에 붙여야 들고 움직이는 궤적에서 컵이 고려된다. place 후 detach. (TODO)
- **베이스가 움직였으면 장면 초기화:** octomap은 map 기준으로 쌓이므로 이동 뒤 낡은 voxel이 남는다. 매 pick 전에 지운다.

### 4-2. 팔 충돌 처리 — 세 겹

MoveIt은 궤적을 만들 때 한 번 검사합니다. 실행 중 끼어든 물체, 등록 안 된 물체, rl_arm_correction의 Δ는 계획 검사로 못 잡으므로 실행·하드웨어 층으로 보강합니다.

| 층 | 수단 | 검사 시점 | 잡는 것 | 구현 |
| --- | --- | --- | --- | --- |
| 1. 계획 | planning scene (+ octomap — 설정 전) | 궤적 생성 시 | 등록한 대상·자기 충돌 | move_group 설정 |
| 2a. 실행 (추종) | JTC \`constraints\` 경로·목표 허용오차 | 매 주기 | 추종 오차가 커진 상황 (막힘·끼임) | JTC YAML — 넘으면 JTC가 스스로 abort |
| 2b. 실행 (전류) | arm_safety_monitor | /joint_states마다 | 사람 손처럼 실행 중 생긴 접촉 | 직접 작성 (control 패키지) |
| 3. 하드웨어 | 속도·가속도 스케일, 다이나믹셀 전류 한계 | 항상 | 부딪혔을 때 충격 크기 | 설정 |

**arm_safety_monitor 동작**

1. **입력:** /joint_states의 effort(= 다이나믹셀 Present Current, BeebotSystemHardware가 effort state interface로 내보냄).
2. **판단:** 관절 effort가 \`effort_threshold\`(3.0A)를 넘고 그 관절이 거의 멈춘(\`stall_velocity\` 0.10rad/s 미만) 상태가 \`hold_s\`(0.3초) 이어지면 접촉. 움직이는 중 전류(중력·가속 — 실측 joint2 2.12A)는 정상이라 무시한다. 퍽을 든 정상 전류 실측 후 관절별로 나눌 것.
3. **정지:** \`/arm_controller/follow_joint_trajectory/_action/cancel_goal\`로 진행 중 goal 전체를 취소 → JTC가 현재 자세 유지.
4. **보고:** /arm_safety_event (control/ArmSafetyEvent) → coordinator가 단계 실패(\`arm_contact\`)로 처리.

\`\`\`yaml
# arm_controller (JTC) — ros_system/config/controllers.yaml
arm_controller:
  ros__parameters:
    joints: [joint1, joint2, joint3, joint4, joint5]
    command_joints:            # 체인: 하드웨어 대신 rl_arm_correction의 reference에 쓴다
      - rl_arm_correction/joint1
      - rl_arm_correction/joint2
      - rl_arm_correction/joint3
      - rl_arm_correction/joint4
      - rl_arm_correction/joint5
    command_interfaces: [position]
    state_interfaces: [position, velocity]
    constraints:
      stopped_velocity_tolerance: 0.02
      goal_time: 0.5
\`\`\`
`,
    links: { CM: 'ctrl' },
    nodes: {
      IN: 'coordinator', SC: 'coordinator', GIN: 'coordinator', TIN: 'manual_control', MG: 'move_group', ASM: 'arm_safety_monitor',
      JTC: 'arm_controller', RAC: 'rl_arm_correction', GRC: 'gripper_controller', JSB: 'joint_state_broadcaster',
      HWI: 'hw_interface', MOT: 'hw_interface', O1: 'robot_state_publisher', O2: 'coordinator',
    },
    flows: ARM_FLOWS,
  },

  base: {
    label: '5 베이스',
    md: `
## 5. 베이스: 안전 → 다듬기 → 구동

속도 명령은 controller_server의 FollowPath 플러그인(또는 behavior_server 복구)에서 나와 twist_mux(자동·수동·비상정지), velocity_smoother(가속 제한), collision_monitor(충돌 감속·정지) 순서로 지나간 뒤 diff_drive_controller로 들어갑니다. 바퀴 오도메트리와 IMU는 **robot_localization EKF**가 융합해 odom→base_footprint를 냅니다.

${F}mermaid
flowchart TB
    CIN(["/cmd_vel_nav ← 3"])
    MAN(["/cmd_vel_manual ← manual_control"])
    MCT(["manual_control<br/>/state/operation_mode 보고"])
    EST(["/state/emergency ← state_manager"])
    PTS(["몸 뺀 점구름 ← 1 body_filter<br/>/pole_front_cam/depth/color/points_filtered"])
    TM["📦 twist_mux<br/>자동 · 수동 · 비상정지 잠금"]
    VS["📦 velocity_smoother"]
    CMN["📦 collision_monitor"]
    EKF["📦 robot_localization ekf"]
    subgraph CM["controller_manager (프로세스 내부)"]
        DD["📦 diff_drive_controller"]
        IMUB["📦 imu_sensor_broadcaster"]
        BHW["🧩 BeebotSystemHardware<br/>extends SystemInterface (플러그인)"]
        DD -->|"🔗 command interface<br/>wheel_*_joint/velocity"| BHW
        BHW -->|"🔗 state interface<br/>(double)"| DD
        BHW -->|"🔗 state interface<br/>(double)"| IMUB
    end
    WM{{"OpenCR 펌웨어 → 바퀴 모터 ×2 · IMU"}}
    O3(["→ 3 Nav2 · rtabmap"])
    CIN -->|"✉️ /cmd_vel_nav<br/>(geometry_msgs/TwistStamped)"| TM
    MAN -->|"✉️ /cmd_vel_manual<br/>(geometry_msgs/<br/>TwistStamped)"| TM
    EST -->|"✉️ /state/emergency<br/>(std_msgs/Bool)"| TM
    TM -->|"✉️ /cmd_vel_mux<br/>(geometry_msgs/<br/>TwistStamped)"| VS
    VS -->|"✉️ /cmd_vel_smoothed<br/>(geometry_msgs/<br/>TwistStamped)"| CMN
    PTS -->|"✉️ …/points_filtered<br/>충돌 감시<br/>(sensor_msgs/PointCloud2)"| CMN
    MCT -.->|"📞 /collision_monitor/toggle<br/>MANUAL이면 끔 → 그대로 통과<br/>(nav2_msgs/srv/Toggle)"| CMN
    CMN -->|"✉️ /cmd_vel<br/>(geometry_msgs/<br/>TwistStamped)"| DD
    BHW -->|"🔌 USB 시리얼 C 줄<br/>바퀴 속도 rad/s<br/>(OpenCR가 BulkWrite)"| WM
    WM -->|"🔌 S 줄 10ms<br/>바퀴 Pos·Vel + IMU<br/>(OpenCR가 SyncRead)"| BHW
    DD -->|"✉️ /odom<br/>(nav_msgs/Odometry)"| EKF
    IMUB -->|"✉️ /imu<br/>(sensor_msgs/Imu)"| EKF
    EKF -->|"✉️ /odometry/filtered ·<br/>/tf (odom→base_footprint 변환)<br/>(nav_msgs/Odometry ·<br/>tf2_msgs/TFMessage)"| O3
${CLS}
    class TM,VS,EKF,DD,IMUB,BHW std;
    class CMN safe;
    class WM hw;
    class CIN,MAN,MCT,EST,PTS,O3 ext;
${F}

**순서** — 단계별로는 도식 위 **▶ 흐름 따라가기**에서 볼 수 있다.

- 속도 명령 체인 (20Hz): controller_server(FollowPath 플러그인) 또는 behavior_server → twist_mux(수동이 우선, 비상정지면 차단) → 가속 제한 → 충돌 감시 → diff_drive_controller
- **MANUAL이면 충돌 감시를 건너뛴다**: manual_control이 \`/state/operation_mode\`를 보고 \`/collision_monitor/toggle\`로 끄고(명령 그대로 통과), 나가면 켠다. 조작자가 보고 모니까 자기 몸 점·근접 정지에 막히지 않게 — 비상정지 잠금(twist_mux)·가속 제한(velocity_smoother)은 수동도 그대로. velocity_smoother에는 toggle이 없다 (급출발·급정지 방지로 남김)
- controller_manager 한 주기 (read → update → write)
  - read: 바퀴 위치·속도와 IMU를 읽는다
  - 읽은 값이 state interface로 diff_drive·imu broadcaster에 보인다
  - update: /odom, /imu 발행. FollowPath 플러그인은 /imu gyro와 controller_server가 넘긴 현재 속도를 **다음 추론**에 쓴다 (피드백)
  - update: diff_drive가 /cmd_vel로 바퀴 목표 속도를 쓴다
  - write: 모터로 보내고 다음 주기 read로
- EKF가 /odom·/imu를 융합해 /odometry/filtered와 odom→base_footprint TF를 낸다

| 이름 | 종류 | 메시지 타입 | 보내는 쪽 → 받는 쪽 | 주기 |
| --- | --- | --- | --- | --- |
| /cmd_vel_nav | 토픽 | geometry_msgs/TwistStamped | controller_server(FollowPath 플러그인) · behavior_server → twist_mux (자동 입력) | 20Hz |
| /cmd_vel_manual | 토픽 | geometry_msgs/TwistStamped | manual_control → twist_mux (자동보다 우선) | 수동 때만 |
| /cmd_vel_mux | 토픽 | geometry_msgs/TwistStamped | twist_mux → velocity_smoother (/state/emergency ← /cmd/e_stop 이면 차단) | 20Hz |
| /cmd_vel_smoothed | 토픽 | geometry_msgs/TwistStamped | velocity_smoother → collision_monitor | 20Hz |
| /cmd_vel | 토픽 | geometry_msgs/TwistStamped | collision_monitor → diff_drive_controller | 20Hz |
| /collision_monitor/toggle | 서비스 | nav2_msgs/srv/Toggle | manual_control → collision_monitor | 운영 모드가 바뀔 때 (MANUAL 끔 · 그 밖 켬) |
| /odom | 토픽 | nav_msgs/Odometry | diff_drive_controller → ekf | 50Hz |
| /imu | 토픽 | sensor_msgs/Imu | imu_sensor_broadcaster → ekf, controller_server(FollowPath gyro) | 100Hz · best_effort |
| /odometry/filtered | 토픽 | nav_msgs/Odometry | ekf → rtabmap, bt_navigator, controller_server, velocity_smoother | 50Hz |
| /state/emergency | 토픽 | std_msgs/Bool | state_manager(← /cmd/e_stop) → twist_mux 잠금, coordinator | 바뀔 때 · transient_local |

- **diff_drive_controller 토픽 이름:** 기본은 \`/diff_drive_controller/cmd_vel\`, \`/diff_drive_controller/odom\`. launch에서 /cmd_vel, /odom으로 리매핑한다.
- **odom TF는 EKF가:** diff_drive_controller의 \`enable_odom_tf: false\`, ekf의 \`publish_tf: true\`. 둘 다 내면 TF가 싸운다.
- **collision_monitor 설정 (nav2_params.yaml):** 다각형 2개 — Approach(반경 0.20m 원, 지금 속도로 1.0초 안에 닿을 방향만 멈춤 — 후진·회전으로는 빠져나올 수 있음), SlowZone(0.30m 안 50%). 예전 stop 원 0.22m는 벽에 붙으면 후진도 못 해 갇혀서 뺐다 (실측). 입력은 body_filter의 \`points_filtered\` 하나(높이 0.05~0.6m), \`source_timeout\` 1.0초 — 카메라가 끊기면 멈춤. **전방 화각 안만 지켜 주므로** 후진·제자리 회전은 behavior_server 설정에서 짧게 제한한다.
- **FollowPath 플러그인의 마지막 줄:** 정책 출력은 |v| ≤ max_lin 0.26, |ω| ≤ max_ang 1.82로 자르고 \`extra_lin_vel\`·\`extra_ang_vel\`을 더한 뒤 다시 상한을 지킨다. 점구름이 cloud_timeout(0.5초) 넘게 끊기면 정책을 건너뛰고 inner DWB로 주행한다. \`/speed_limit\` 발행자는 없고 \`setSpeedLimit()\`는 Nav2 표준 인터페이스로 남아 있다.
- **twist_mux:** \`ros_system/config/twist_mux.yaml\` — auto \`/cmd_vel_nav\`(10) · manual \`/cmd_vel_manual\`(100), timeout 0.5초, lock \`/state/emergency\`(255). 비상정지는 state_manager가 주인이라 \`/cmd/e_stop\`을 직접 구독하지 않는다.
`,
    links: { CM: 'ctrl' },
    nodes: {
      CIN: 'controller_server', PTS: 'body_filter',
      TM: 'twist_mux', MAN: 'manual_control', EST: 'state_manager',
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
    POLE["pole_front_cam_link → optical"]
    ARM["arm_base_link → shoulder … wrist_link<br/>(joint1~4)"]
    GRIP["gripper_link (joint5) →<br/>end_effector_link · finger_*"]
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
| /task/sub_goals, /task/status | reliable | transient_local | 10 | 재시작한 coordinator·UI도 마지막 계획을 받음 |
| /mission/signal, /mission/qr, /motor_status | reliable | transient_local | 1 | 바뀔 때만 냄 — 늦게 붙어도 마지막 값 |
| /state/... | reliable | transient_local | 1 | state_manager가 바뀔 때만 냄 |
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

### 한눈에 보기 — 누가 누구를 갖고 · 상속하고 · 부르는가

**① 구성과 소유 — 한 프로세스 안에 뭐가 들어 있나**

${F}mermaid
flowchart TB
    subgraph PROC["📦 ros2_control_node — 프로세스 1개"]
        CM["<b>controller_manager</b><br/>100Hz 루프 · 호출 순서를 쥠"]
        subgraph RMB["Resource Manager — controller_manager 가 소유 (칸 장부)"]
            HWL["하드웨어 컴포넌트 목록"]
            IFL["칸 장부<br/>state · command · reference<br/>이름 · 주인 · 빌려 간 곳"]
        end
        subgraph CTLS["컨트롤러들 — spawner 요청으로 로드 · controller_manager 가 소유"]
            direction LR
            JTC["arm_controller<br/>(JTC · ROS 기본)"]
            RLA["🛠 rl_arm_correction<br/>ChainableControllerInterface"]
            DD["diff_drive_controller"]
            GR["gripper_controller"]
            BC["broadcaster 2개"]
        end
        subgraph HWS["하드웨어 컴포넌트 — URDF ros2_control 태그로 로드"]
            BSH["🛠 BeebotSystemHardware<br/>SystemInterface"]
        end
    end
    OC{{"OpenCR → DYNAMIXEL 8개 + IMU"}}
    CM -->|"소유"| RMB
    CM -->|"매 주기 update() 호출<br/>+ 순서 결정"| CTLS
    RMB -->|"로드 · read() · write() 호출"| HWS
    HWS -->|"칸 등록<br/>state · command"| IFL
    RLA -->|"칸 등록<br/>reference"| IFL
    CTLS -.->|"칸 빌림 (소유권)"| IFL
    BSH -->|"🔌 USB 시리얼<br/>C 줄 ↔ S 줄"| OC
${CLS}
    class CM,RMB,HWL,IFL,JTC,DD,GR,BC std;
    class RLA rl;
    class BSH std;
    class OC hw;
${F}

**② 상속 — 우리가 만든 둘은 서로 다른 뿌리**

${F}mermaid
classDiagram
    direction LR
    class ControllerInterfaceBase
    class ControllerInterface
    class ChainableControllerInterface {
        +on_export_reference_interfaces_list()
        +update_reference_from_subscribers()
        +update_and_write_commands()
    }
    class RlArmCorrection
    class ActuatorInterface
    class SensorInterface
    class SystemInterface {
        +read()
        +write()
    }
    class BeebotSystemHardware
    ControllerInterfaceBase <|-- ControllerInterface
    ControllerInterfaceBase <|-- ChainableControllerInterface
    ChainableControllerInterface <|-- RlArmCorrection
    SystemInterface <|-- BeebotSystemHardware
${F}

위쪽 줄은 **컨트롤러 계열**(계산), 아래쪽은 **하드웨어 계열**(장치 입출력)입니다. \`ActuatorInterface\` · \`SensorInterface\` · \`SystemInterface\`는 하드웨어를 나누는 세 가지 형태이고, 이 로봇은 모터 8개와 IMU를 한 장치(OpenCR)로 묶어 \`SystemInterface\` 하나로 만들었습니다.

**③ 관계를 한 표로**

| 관계 | 누가 → 누구 | 이 로봇에서는 |
| --- | --- | --- |
| **소유** | \`controller_manager\` → Resource Manager · 컨트롤러 목록 | 컨트롤러 6개 + 하드웨어 1개를 한 프로세스에서 관리 |
| **상속** | 우리 클래스 → ros2_control 기반 클래스 | \`RlArmCorrection\` → \`ChainableControllerInterface\`, \`BeebotSystemHardware\` → \`SystemInterface\` |
| **로드** | spawner → 컨트롤러 / URDF → 하드웨어 | \`CONTROLLERS\` 목록 순서 / \`<ros2_control>\` 태그 |
| **호출** | \`controller_manager\` → 컨트롤러 \`update()\` · 하드웨어 \`read()\` \`write()\` | 100Hz, read → update(체인 순서) → write |
| **칸 등록** | 하드웨어 → state · command, 체인 컨트롤러 → reference | \`joint1/position\` 등 / \`rl_arm_correction/joint1/position\` 등 |
| **칸 빌림** | 컨트롤러 → 칸 (쓰기는 한 컨트롤러만) | \`command_joints\` 이름 일치 + \`command_interface_configuration()\` |
| **장치 통신** | 하드웨어 ↔ 장치 | \`BeebotSystemHardware\` ↔ OpenCR (USB 시리얼 C · S 줄) |

> 위 상속 그림은 ros2_control의 일반 클래스 구조입니다. 이 저장소 코드로 직접 확인한 것은 \`RlArmCorrection : ChainableControllerInterface\`(\`ml/src/rl_arm_correction.cpp\`)와 \`BeebotSystemHardware : SystemInterface\`(\`control/src/beebot_system_hardware.cpp\`) 두 가지입니다. 중간 기반 클래스 이름은 버전(Lyrical)에 따라 다를 수 있습니다.


${F}mermaid
flowchart TB
    URDF["📄 URDF 속 ros2_control 태그<br/>플러그인 · 포트 · 관절별 인터페이스"]
    YAML["📄 controllers.yaml<br/>컨트롤러 이름 · 타입 · 파라미터"]
    SP["📦 spawner<br/>컨트롤러 올리기 · 켜기"]
    subgraph CMG["📦 controller_manager (ros2_control_node · 100Hz)"]
        subgraph CTRL["컨트롤러 — 장치를 모름 · 전부 플러그인<br/>extends ControllerInterface (체인이면 ChainableControllerInterface)"]
            C1["arm_controller (JTC)"]
            C2["rl_arm_correction<br/>(Chainable)"]
            C3["diff_drive_controller"]
            C4["broadcaster들"]
            C5["gripper_controller<br/>(parallel_gripper)"]
        end
        RM["Resource Manager<br/>인터페이스 목록 · 쓰기 소유권"]
        subgraph HWC["hardware component — 장치마다 하나<br/>extends SystemInterface · ActuatorInterface · SensorInterface"]
            P1["🧩 BeebotSystemHardware<br/>extends SystemInterface<br/>(control 패키지 · 직접 작성)"]
            P2["예: 다른 모터용 플러그인<br/>(CAN · EtherCAT …)"]
        end
    end
    D1{{"OpenCR 펌웨어 → DYNAMIXEL 8개<br/>바퀴 2 · 팔 5 · 그리퍼 1 · IMU"}}
    D2{{"다른 장치"}}
    URDF -->|"✉️ ❶ /robot_description<br/>(std_msgs/String)"| RM
    YAML -->|"⚙️ ❷ 파라미터 파일"| CTRL
    SP -->|"📞 ❸ load · switch_controller<br/>(controller_manager_msgs)"| CTRL
    CTRL -->|"🔗 ❼ command 쓰기<br/>(double)"| RM
    RM -->|"🔗 ❻ state 읽기<br/>(double)"| CTRL
    RM -->|"🔗 ❽ write()"| HWC
    HWC -->|"🔗 ❺ read()"| RM
    P1 -->|"🔌 ❾ USB 시리얼 C 줄 (ASCII)<br/>→ 펌웨어가 BulkWrite"| D1
    D1 -->|"🔌 ❹ S 줄 10ms · E 줄<br/>← 펌웨어가 SyncRead"| P1
    P2 -.->|"🔌 장치 고유 프로토콜"| D2
${CLS}
    class C1,C3,C4,C5,RM,P1,P2,SP std;
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
| 하드웨어 플러그인 | \`control/BeebotSystemHardware\` — **직접 작성** (mock:=true면 OpenCR 없이 명령을 상태로 되돌림) |
| URDF param | port /dev/opencr (udev 고정 이름) · baud_rate 1000000 · mock · mock_effort · 관절별 offset |
| 관절·센서 | wheel_left/right_joint (velocity) · joint1~5 · gripper_left_joint (position, 오른쪽은 mimic) · imu |
| 컨트롤러 | joint_state_broadcaster · imu_sensor_broadcaster · diff_drive_controller · rl_arm_correction(ml/RlArmCorrection, chainable) · arm_controller(JTC, 체인) · gripper_controller(parallel_gripper_action_controller) |
| spawner 순서 | joint_state_broadcaster → imu_sensor_broadcaster → diff_drive_controller → gripper_controller → **rl_arm_correction → arm_controller** (체인은 뒤에서부터 · 실패하기 쉬운 팔 체인을 맨 뒤에 — 팔이 안 켜져도 바퀴·그리퍼는 이미 켜져 있다) |
| 그 밖에 여는 것 | ✉️ \`/motor_status\` (control/MotorStatus — E 줄 Hardware Error · S 줄 온도) · 📞 \`/beebotsystem/reboot_motors\` (펌웨어 R 줄) · 진단 "OpenCR 연결" |

### 헷갈리는 것 하나씩 — 이 로봇 코드로 따라가기

ros2_control은 "노드끼리 메시지를 주고받는" 일반 ROS와 달라서 처음엔 누가 누구를 어떻게 부르는지 안 보입니다. 아래는 **rl_arm_correction(팔 보정)** 하나를 예로 질문 순서대로 따라간 것입니다.

#### ❓ 1. 컨트롤러는 누가 켜나 — spawner

\`controllers.yaml\`에 컨트롤러를 **선언**만 해서는 안 켜집니다. launch가 띄우는 **spawner**가 이름 목록을 받아 순서대로 \`controller_manager\`에 "올려라 → 켜라"를 요청합니다 (\`ros_system/launch/ros_system.launch.py\`의 \`CONTROLLERS\`).

${F}python
CONTROLLERS = ['joint_state_broadcaster', 'imu_sensor_broadcaster', 'diff_drive_controller',
               'gripper_controller',
               'rl_arm_correction', 'arm_controller']
${F}

- **목록에 없으면 안 켜진다.** yaml에 \`rl_arm_correction:\`이 있어도 이 목록에 이름이 없으면 올라오지 않는다.
- **한 spawner가 순서대로 켜고, 하나가 실패하면 거기서 멈춘다.** 그래서 실패하기 쉬운 팔 체인(관절이 URDF 한계 밖이면 예외)을 맨 뒤에 둔다 — 팔이 안 떠도 바퀴·그리퍼는 이미 떠 있다.
- spawner가 \`--param-file controllers.yaml\`도 컨트롤러에 넘긴다. \`rl_arm_correction:\` 블록의 \`enabled\`·\`sag_gain\` 같은 값이 이렇게 들어간다.

#### ❓ 2. \`type: ml/RlArmCorrection\` 한 줄로 어떻게 우리 클래스를 찾나 — pluginlib

${F}yaml
controller_manager:
  ros__parameters:
    rl_arm_correction:                 # ← 이름은 우리가 정한 것 (아무거나)
      type: ml/RlArmCorrection         # ← 이 글자로 클래스를 찾는다
${F}

이 줄은 "이 이름으로 이 타입을 만들어라"일 뿐 **붙여 주는 설정이 아닙니다.** 글자가 클래스까지 이어지는 길은 세 군데로 이어져 있습니다 (pluginlib).

| 단계 | 파일 | 내용 |
| --- | --- | --- |
| ① 클래스에 도장 | \`ml/src/rl_arm_correction.cpp\` 맨 끝 | \`PLUGINLIB_EXPORT_CLASS(ml::RlArmCorrection, controller_interface::ChainableControllerInterface)\` |
| ② 이름표 파일 | \`ml/rl_arm_correction.xml\` | \`<class name="ml/RlArmCorrection" type="ml::RlArmCorrection" base_class_type="controller_interface::ChainableControllerInterface">\` |
| ③ 시스템에 등록 | \`ml/CMakeLists.txt\` | \`pluginlib_export_plugin_description_file(controller_interface rl_arm_correction.xml)\` |

yaml의 \`type\`이 ②의 \`name\`과 **글자가 같아서** 찾아집니다. \`controller_manager\`는 등록된 이름표에서 찾아 \`.so\`를 열고 클래스를 만듭니다. 같은 \`ml\` 패키지의 \`rl_nav_controller\`도 방식은 같고 등록 대상만 \`nav2_core\`입니다.

> 하드웨어 플러그인(\`BeebotSystemHardware\`)은 \`control/control_plugins.xml\` + \`pluginlib_export_plugin_description_file(hardware_interface …)\`로 같은 방식이지만, **spawner 목록이 아니라 URDF의 \`<ros2_control>\` 태그**를 보고 시작할 때 같이 올라옵니다.

#### ❓ 3. "JTC 뒤에 붙인다"는 설정은 어디 — 이름 일치

\`controller_manager\`가 "이건 앞, 이건 뒤"를 따로 알지 않습니다. **이름이 글자로 맞는 것**으로 이어집니다.

${F}text
① rl_arm_correction 이 켜질 때 on_export_reference_interfaces_list() 로 입구를 내놓는다
     info.name = "joint1/position"
     InterfaceDescription(get_node()->get_name(), info)   ← 컨트롤러 이름이 앞에 붙는다
     → 전체 이름:  rl_arm_correction/joint1/position   (이름을 abc로 바꾸면 abc/joint1/position)

② arm_controller(JTC)의 파라미터에 이 이름을 적어 둔다 (controllers.yaml)
     command_joints: [rl_arm_correction/joint1, … joint5]
     command_interfaces: [position]          → rl_arm_correction/joint1/position 을 달라고 요청

③ controller_manager 가 가진 입구 목록에서 그 이름을 찾아 연결한다
     하드웨어 입구      joint1/position
     컨트롤러가 내놓은 입구   rl_arm_correction/joint1/position   ← 일치 → JTC 가 여기에 쓴다
${F}

- **"붙이는" 설정 = \`arm_controller.command_joints\`** 한 항목. 하드웨어 이름(\`joint1\`) 대신 보정기의 입구 이름을 적었을 뿐이고, **JTC 코드는 한 줄도 고치지 않았다.**
- 이름이 틀리면(예: \`rl_arm_corection/joint1\`) 목록에 없어서 JTC가 켜지지 않는다.
- **순서가 필요한 이유:** 입구는 \`rl_arm_correction\`이 켜져야 목록에 나타난다. 그래서 \`rl_arm_correction → arm_controller\` 순서로 켠다.
- JTC를 갈아끼운 게 아니라 **JTC 출력 뒤에 한 단을 끼운** 것이다. 보정을 빼면 JTC가 하드웨어에 바로 쓰는 원래 구조다.

${F}text
원래:   JTC ────────────────────────────▶ 하드웨어
지금:   JTC ──▶ rl_arm_correction(보정) ──▶ 하드웨어
${F}

**시작할 때 일어나는 일 (1회)**

${F}mermaid
sequenceDiagram
    autonumber
    participant L as launch
    participant CM as controller_manager
    participant HW as BeebotSystemHardware
    participant SP as spawner
    participant RLA as rl_arm_correction
    participant JTC as arm_controller (JTC)
    L->>CM: ros2_control_node 시작 (URDF + controllers.yaml)
    CM->>HW: URDF ros2_control 태그를 보고 플러그인 로드
    HW-->>CM: state·command 칸 등록 (joint1/position 등)
    L->>SP: spawner 시작 (CONTROLLERS 목록을 인자로)
    SP->>CM: rl_arm_correction 올려라 (type: ml/RlArmCorrection)
    CM->>RLA: pluginlib 으로 클래스 생성 → on_configure (구독 열기)
    RLA-->>CM: reference 입구 내놓음 (rl_arm_correction/joint1~5/position)
    SP->>CM: arm_controller 올려라
    CM->>JTC: 생성 → command_joints 의 이름으로 입구 요청
    CM-->>JTC: 이름이 일치하는 reference 칸을 연결
    SP->>CM: 활성화 (switch_controller)
    Note over CM,JTC: 이 순서 때문에 rl_arm_correction 이 arm_controller 보다 먼저
${F}

#### ❓ 4. 컨트롤러와 하드웨어 플러그인은 뭐가 다른가

둘 다 \`controller_manager\` **한 프로세스 안**에 올라가는 플러그인이지만 구현하는 인터페이스와 하는 일이 다릅니다.

| | \`RlArmCorrection\` (컨트롤러) | \`BeebotSystemHardware\` (하드웨어) |
| --- | --- | --- |
| 상속 | \`controller_interface::ChainableControllerInterface\` | \`hardware_interface::SystemInterface\` |
| 하는 일 | **계산** — 칸을 읽어 고쳐서 다시 씀 | **입출력** — 실제 장치(OpenCR 시리얼)와 통신 |
| 주기 함수 | \`update_and_write_commands()\` | \`read()\` · \`write()\` |
| 칸(인터페이스) | **빌려 씀** (하드웨어가 만든 칸을 읽고 쓴다) | **내놓음** (state·command 칸을 만든다, URDF 정의) |
| 선언 | \`command_interface_configuration()\` · \`state_interface_configuration()\` | URDF \`<ros2_control>\`의 관절·센서 정의 (\`on_init\`) |
| 체인용 입구 | \`on_export_reference_interfaces_list()\` (이것만 있다) | 없음 |
| 올라오는 길 | spawner 목록 | URDF \`<ros2_control>\` 태그 |

컨트롤러에는 시리얼 코드가 없고, 하드웨어 플러그인은 값을 가공하지 않고 칸과 장치 사이에서 옮기기만 합니다.

#### ❓ 5. 컨트롤러끼리는 토픽으로 주고받나 — 아니오, 칸(메모리)을 공유한다

각 컨트롤러는 자기 입구(토픽·액션)를 **저마다 구독**하지만, 콜백은 받은 값을 **저장만** 합니다. 계산과 전달은 \`controller_manager\`가 100Hz로 부르는 \`update()\` 안에서 칸을 읽고 쓰며 일어납니다.

${F}text
[ 구독 콜백 ]    값을 박스에 저장만 (rl_arm_correction: /skill_context → ctx_box_ , /hand_relative → hand_box_)

[ 한 주기 · 100Hz ]
  ① 하드웨어 read()          OpenCR 상태(S 줄) → state 칸
  ② 컨트롤러 update()        읽기 → 계산 → 쓰기   (칸끼리 같은 프로세스 변수 — 토픽 아님)
  ③ 하드웨어 write()         command 칸 → C 줄로 OpenCR 에 전송
${F}

\`rl_arm_correction\`의 \`update_and_write_commands()\`가 하는 일:

${F}cpp
// 읽기 — JTC가 쓴 기준 각도(reference 칸) · 엔코더 각도·속도(state 칸)
const auto r = refs_[i]->get_optional<double>();                    // JTC 가 이 칸에 썼다
const auto p = state_interfaces_[2 * i].get_optional<double>();     // 현재 각도 (하드웨어가 채움)
const auto v = state_interfaces_[2 * i + 1].get_optional<double>(); // 현재 속도

// 쓰기 — 하드웨어의 command 칸
command_interfaces_[i].set_value(ref[i] + corr_[i] + total);
//   ref   = JTC 기준 각도    corr = 처짐 보정 적분    total = 학습 Δ + 중력 앞먹임
${F}

하드웨어는 \`write()\`에서 같은 command 칸을 직접 읽습니다 (\`get_command<double>(name + "/position")\`). 컨트롤러가 하드웨어를 부르지도, \`controller_manager\`가 값을 옮겨 적지도 않고, **둘이 같은 칸을 보고 있을 뿐**입니다.

**한 주기(100Hz)에서 일어나는 일**

${F}mermaid
sequenceDiagram
    autonumber
    participant HW as BeebotSystemHardware
    participant CM as controller_manager
    participant JTC as arm_controller (JTC)
    participant RLA as rl_arm_correction
    participant DD as diff_drive_controller
    loop 100Hz 반복
        CM->>HW: read()
        HW-->>CM: OpenCR 의 S 줄을 state 칸에 채움
        CM->>JTC: update()
        JTC-->>CM: reference 칸에 기준 각도 5개 쓰기
        CM->>RLA: update_and_write_commands()
        RLA-->>CM: reference·state 칸 읽고 → 보정 → command 칸에 쓰기
        CM->>DD: update()
        DD-->>CM: 바퀴 velocity command 칸에 쓰기
        CM->>HW: write()
        HW-->>CM: command 칸을 읽어 C 줄 하나로 OpenCR 에 전송
    end
    Note over JTC,RLA: 체인에서는 값을 쓰는 쪽이 읽는 쪽보다 먼저 돈다 (ros2_control 일반 설계)
${F}

#### ❓ 6. 맨 끝에서 OpenCR로 가는 모양 — C 줄 8칸

\`BeebotSystemHardware::write()\`가 바퀴 2 · 팔 5 · 그리퍼 1을 **한 줄**로 합쳐 보냅니다.

${F}text
C, 바퀴L(rad/s), 바퀴R(rad/s), joint1, joint2, joint3, joint4, joint5, 그리퍼(m) [, 그리퍼 쥐는 힘 A]
     ▲ velocity 칸                ▲ position 칸 (관절 offset 을 더해 서보 값으로)    ▲ 9번째는 생략 가능
${F}

- 바퀴는 \`wheel_left_joint/velocity\` · \`wheel_right_joint/velocity\`, 팔·그리퍼는 \`<joint>/position\` 칸을 읽는다.
- 9번째 칸 = 그리퍼 쥐는 힘 한계(전류 A). \`gripper_controller\`의 \`max_effort\` / 액션 goal의 effort → \`gripper_left_joint/effort\` 칸 → 이 칸.

#### ❓ 7. 바퀴만 / 팔만 명령하면 나머지는 — 안 튀게 처리돼 있다

C 줄에는 **항상 바퀴와 팔 칸이 모두** 들어갑니다. 명령을 안 쓴 쪽은 이렇게 보냅니다.

| 상황 | 바퀴 칸 | 팔 칸 |
| --- | --- | --- |
| 바퀴만 명령 (\`diff_drive_controller\`만 씀) | 속도 값 | 명령 없음(NaN) → **빈칸** → 펌웨어가 **현재 자세 유지** |
| 팔만 명령 (\`arm_controller\` 체인만 씀) | 명령 없음(NaN) → **0.0** → 정지 | 각도 값 |

팔 칸은 NaN이면 상태로 채우지 않고 빈칸으로 둡니다 — S를 받기 전에 0rad를 보내 팔이 튀는 것을 막기 위해서입니다.

#### ❓ 8. 명령은 누가 어디서 넣나 — 입구는 컨트롤러마다 따로

| 대상 | 입구 | 보내는 쪽 |
| --- | --- | --- |
| 바퀴 (diff_drive_controller) | 토픽 \`/cmd_vel\` | 자동: Nav2·\`approach_skill\` → \`/cmd_vel_nav\` → twist_mux → velocity_smoother → collision_monitor → \`/cmd_vel\`<br/>수동: \`manual_control\` → \`/cmd_vel_manual\` → (같은 안전 체인) |
| 팔 (arm_controller) | 액션 \`/arm_controller/follow_joint_trajectory\` | 자동: 스킬 노드 → MoveIt (\`/plan_kinematic_path\` · \`/execute_trajectory\`) → JTC |
| 팔 (arm_controller) | 토픽 \`/arm_controller/joint_trajectory\` | \`pose_skill\`(시작 자세) · \`manual_control\`(수동) — MoveIt 없이 JTC로 직접 |
| 그리퍼 | 액션 \`/gripper_controller/gripper_cmd\` | 스킬 노드 · \`manual_control\` — MoveIt을 거치지 않는다 |
| 보정기 힌트 | 토픽 \`/skill_context\` · \`/hand_relative\` | 스킬 노드 · perception |

수동 명령은 \`/state/operation_mode\`가 MANUAL일 때만 \`manual_control\`이 통과시키고, 아니면 버립니다.

#### ❓ 9. 그래서 어디까지가 우리가 만든 것인가

| 이름 | 누가 만들었나 | 올라오는 길 |
| --- | --- | --- |
| \`joint_state_broadcaster\` · \`imu_sensor_broadcaster\` | ROS 기본 | spawner |
| \`diff_drive_controller\` | ROS 기본 (설정만) | spawner |
| \`gripper_controller\` (parallel_gripper_action_controller) | ROS 기본 (설정만) | spawner |
| \`arm_controller\` (JointTrajectoryController) | ROS 기본 (설정만) | spawner |
| **\`rl_arm_correction\`** | **우리** — \`ml/src/rl_arm_correction.cpp\` | spawner |
| **\`BeebotSystemHardware\`** | **우리** — \`control/src/beebot_system_hardware.cpp\` | URDF \`<ros2_control>\` (컨트롤러가 아니라 spawner 목록에 없다) |

\`CONTROLLERS\` 목록 6개 중 직접 만든 컨트롤러는 \`rl_arm_correction\` 하나이고, 하드웨어 플러그인 \`BeebotSystemHardware\`는 목록 밖에서 따로 올라옵니다. (\`rl_nav_controller\`는 Nav2 \`controller_server\`의 플러그인이라 ros2_control과는 별개 계통, \`faker\`의 \`FakeRlArmCorrection\`은 시뮬용 대체품입니다.)

#### 전체 배선도 — 누가 어디로 무엇을 보내나

${F}mermaid
flowchart LR
    subgraph IN["📥 명령을 넣는 쪽 (다른 노드)"]
        SK["🛠 skills 노드<br/>pick · place · pose …"]
        MV["📦 MoveIt move_group<br/>계획 + 실행"]
        MC["🛠 manual_control<br/>MANUAL 모드일 때만 통과"]
        NAV["📦 Nav2 · 🛠 approach_skill<br/>/cmd_vel_nav"]
        SAFE["📦 twist_mux → velocity_smoother<br/>→ collision_monitor"]
        PE["🛠 perception<br/>/hand_relative"]
    end
    subgraph CMG["📦 controller_manager — ros2_control_node 한 프로세스 · 100Hz"]
        direction TB
        subgraph CTL["컨트롤러 — 각자 입구를 구독 (콜백은 저장만)"]
            JTC["arm_controller (JTC)<br/>입구: 액션 follow_joint_trajectory<br/>토픽 joint_trajectory"]
            RLA["🛠 rl_arm_correction<br/>입구: /skill_context · /hand_relative"]
            DD["diff_drive_controller<br/>입구: /cmd_vel"]
            GR["gripper_controller<br/>입구: 액션 gripper_cmd"]
        end
        subgraph CELL["칸 — 같은 프로세스 메모리 (double)"]
            REF["reference 칸<br/>rl_arm_correction/joint1~5/position"]
            CMD["command 칸<br/>wheel_left·right/velocity<br/>joint1~5/position<br/>gripper_left_joint/position · effort"]
            ST["state 칸<br/>position · velocity · effort"]
        end
        HW["🛠 BeebotSystemHardware<br/>read() · write()"]
    end
    OC{{"OpenCR 펌웨어<br/>DYNAMIXEL 8개 + IMU"}}
    SK -->|"📞 계획 · 🎬 실행"| MV
    MV -->|"🎬 follow_joint_trajectory"| JTC
    SK -->|"✉️ joint_trajectory<br/>(pose_skill 시작 자세)"| JTC
    MC -->|"✉️ joint_trajectory"| JTC
    SK -->|"🎬 gripper_cmd"| GR
    MC -->|"🎬 gripper_cmd"| GR
    SK -->|"✉️ /skill_context"| RLA
    PE -->|"✉️ /hand_relative"| RLA
    NAV -->|"/cmd_vel_nav"| SAFE
    MC -->|"/cmd_vel_manual"| SAFE
    SAFE -->|"✉️ /cmd_vel"| DD
    JTC -->|"🔗 쓰기<br/>command_joints 이름 일치"| REF
    REF -->|"🔗 읽기"| RLA
    ST -->|"🔗 읽기"| RLA
    ST -->|"🔗 읽기"| JTC
    ST -->|"🔗 읽기(odom)"| DD
    RLA -->|"🔗 쓰기<br/>ref + 처짐 + Δ − 중력"| CMD
    DD -->|"🔗 쓰기"| CMD
    GR -->|"🔗 쓰기"| CMD
    HW -->|"read: 채움"| ST
    CMD -->|"write: 읽음"| HW
    HW -->|"🔌 C 줄 (8칸 + 힘)"| OC
    OC -->|"🔌 S 줄 · E 줄"| HW
${CLS}
    class JTC,DD,GR,SAFE,MV,NAV,REF,CMD,ST std;
    class RLA rl;
    class SK,MC,PE,HW std;
    class OC hw;
${F}

- **실선 화살표 중 🔗는 토픽이 아니라 같은 프로세스 메모리의 칸 읽기·쓰기**다. 컨트롤러끼리도 컨트롤러와 하드웨어도 칸을 사이에 두고 만난다.
- **주황색 \`rl_arm_correction\`** 만 컨트롤러 중 직접 만든 것이고, \`BeebotSystemHardware\`는 하드웨어 플러그인으로 따로 올라온다.
- 팔만 움직이면 바퀴 command 칸은 NaN이라 C 줄에 0.0(정지)이, 바퀴만 움직이면 팔 칸은 빈칸(펌웨어가 현재 자세 유지)이 나간다.

> ⚠️ 공식 TurtleBot3 Manipulation 플러그인은 팔·그리퍼의 effort(전류)를 내보내지 않아 직접 만든 BeebotSystemHardware로 바꿨다 (검토 반영 25번). PC ↔ OpenCR는 USB 시리얼 ASCII 줄 — \`C\`(바퀴 rad/s · 관절 rad · 그리퍼 m) 쓰기, \`S\`(위치·속도·전류·IMU·온도, 10ms) · \`E\`(모터 에러, 0.5초) 읽기. DYNAMIXEL BulkWrite·SyncRead와 단위 변환은 펌웨어(\`lv2_module6/firmware/beebot_opencr\`)가 한다.

### 수치 변환 (다이나믹셀 XM430 — 펌웨어가 하는 계산)

| 변환 | 계산 | 결과 |
| --- | --- | --- |
| 관절 0.65rad → 틱 | 2048 + 0.65 × 4096 / 2π | 약 2472 |
| 틱 2468 → rad | (2468 − 2048) × 2π / 4096 | 약 0.644rad |
| 바퀴 2.72rad/s → 속도 단위 | 2.72 × 60 / 2π = 26.0rpm, ÷ 0.229 | 약 113 |

`,
    links: { CMG: 'ctrl', HWC: 'ctrl', CTRL: 'ctrl' },
    nodes: {
      C1: 'arm_controller', C2: 'rl_arm_correction', C3: 'diff_drive_controller', C4: 'joint_state_broadcaster', C5: 'gripper_controller',
      RM: 'controller_manager', P1: 'hw_interface', D1: 'hw_interface',
    },
  },

  nodes: {
    label: '직접작성·제공',
    md: `
## 직접 작성 노드와 제공 노드

직접 작성은 ROS 노드 14개 + 플러그인 3개(rl_nav_controller · rl_arm_correction · BeebotSystemHardware)입니다. 나머지는 생태계 패키지를 가져와 설정하고 연결하는 일입니다 (\`bringup/launch/bringup.launch.py\` + \`ros_system/launch/ros_system.launch.py\`).

| 노드 | 구분 | 형태 (패키지) | 핵심 작업 |
| --- | --- | --- | --- |
| perception | 직접 | ROS 2 노드 Python (perception) | YOLO 검출, 두 카메라 융합·칼만 추적, AprilTag·바코드·QR, /tracked_objects · /mission/qr |
| body_filter | 직접 | ROS 2 노드 C++ (perception) | URDF collision으로 자기 몸 점 제거 → /pole_front_cam/depth/color/points_filtered |
| signal_decoder | 직접 | ROS 2 노드 C++ (perception) | 신호등 색을 시간축으로 읽어 /mission/signal (인지가 해석해 미션 토픽으로) |
| user_input | 직접 | ROS 2 노드 (plan) | 텍스트 명령 → /cmd/user_command, /robot/say·/task/status 표시 (voice_ui 자리) |
| vlm_task_planner | 직접 | ROS 2 노드 (plan) | ai-service HTTP 호출, 신호등 미션 규칙 계획 → /task/sub_goals |
| coordinator | 직접 | ROS 2 노드 (plan) | 계획 검증, Nav2·MoveIt·그리퍼 호출, 재시도, 적재함(tray), 시작·스캔 자세 |
| explorer | 직접 | ROS 2 노드 (plan) | EXPLORE 모드에서 프론티어로 /navigate_to_pose, /explore/result |
| grasp_scorer | 직접 | ROS 2 서비스 노드 (ml) | /score_grasps 응답 — 모델·IK 확인은 TODO (지금 대상 위치 하나) |
| rl_nav_controller | 직접 | Nav2 controller 플러그인 (ml/RlNavController) | controller_server FollowPath — ONNX 정책이 v·ω 직접 출력, enable=false·모델 없음이면 inner DWB 바이패스 |
| rl_arm_correction | 직접 | ros2_control chainable controller (ml/RlArmCorrection) | reference에 Δ 더하기, enabled 파라미터 (정책 TODO) |
| arm_safety_monitor | 직접 | ROS 2 노드 (control) | 전류로 접촉 감지, 궤적 취소, /arm_safety_event |
| manual_control | 직접 | ROS 2 노드 (control) | MANUAL일 때 /cmd/manual/* → /cmd_vel_manual · 팔 궤적 · 그리퍼 · 모터 재부팅 |
| BeebotSystemHardware | 직접 | ros2_control hardware component (control) | OpenCR USB 시리얼 C/S/E/R 줄, effort state, /motor_status |
| state_manager | 직접 | ROS 2 노드 (manager) | /state/... 주인 — 조작 모드·비상정지·지도 모드·장치 상태·재시작 |
| scan_cam_gate | 직접 | ROS 2 노드 Python (ros_system) | 팔이 스캔 자세일 때만 gripper_cam depth·점구름 통과 |
| realsense2_camera ×2 (pole_front_cam, gripper_cam) | 제공 | Intel RealSense ROS 2 래퍼 | serial_no, camera_name, 640×360×15, align_depth, pointcloud, publish_tf false |
| robot_state_publisher | 제공 | ROS 2 기본 | URDF(\`lv2_module6/urdf/<이름>/urdf.xacro\`) |
| robot_localization (ekf) | 제공 | ROS 2 패키지 | /odom + /imu 융합, odom TF 발행 |
| bt_navigator, planner_server, controller_server, behavior_server, velocity_smoother, collision_monitor, lifecycle_manager ×2 | 제공 | Nav2 | nav2_params.yaml (points_filtered), 리매핑, BT의 BackUp 0.10m |
| twist_mux | 제공 | twist_mux | 자동·수동·비상정지 잠금 (twist_mux.yaml) |
| rtabmap + rgbd_sync ×2 + rgbdx_sync + point_cloud_aggregator | 제공 | rtabmap_ros | 카메라 두 대 매핑/위치추정, scan_cloud, Reg/Force3DoF |
| map_saver | 제공 | nav2_map_server | /map_saver/save_map → map.pgm·yaml |
| move_group | 제공 | MoveIt 2 | config/moveit (SRDF · pick_ik · OMPL · arm_controller만) — MTC·octomap 센서는 아직 |
| controller_manager, JTC, gripper_controller(parallel), diff_drive_controller, imu_sensor_broadcaster, joint_state_broadcaster | 제공 | ros2_control | controllers.yaml, URDF ros2_control 태그 |
| diagnostic_aggregator | 제공 | diagnostics | /diagnostics → /diagnostics_agg (bringup/config/diagnostics.yaml) |

### 노드 외에 직접 만드는 것

- **커스텀 인터페이스 — 별도 interfaces 패키지 없이 그 메시지를 내보내는 패키지가 가진다:** perception/TrackedObject(Array) · plan/SubGoal(Array)·TaskStatus·MissionSignal · control/ArmSafetyEvent·MotorStatus · ml/srv/ScoreGrasps
- **launch 파일:** bringup(전체 — 지도 map:=slam|saved, 학습 on/off), ros_system(📦 기동, 리매핑: velocity_smoother 입력 → /cmd_vel_mux, diff_drive_controller 토픽 → /cmd_vel·/odom), faker(테스트베드 대역)
- **설정 파일:** nav2_params.yaml, ekf.yaml, controllers.yaml, twist_mux.yaml, scan_pose.yaml, collision_monitor 다각형, MoveIt 설정(config/moveit)
- **OpenCR 펌웨어:** \`lv2_module6/firmware/beebot_opencr\` — DYNAMIXEL BulkWrite·SyncRead, ASCII 줄 프로토콜
- **Isaac Lab 환경 코드:** 관측·행동·보상·랜덤화 정의 (ROS 노드 아님)

### 패키지 구성

${F}text
lv2_module6/ros2_ws/src/
├── bringup/      # 전체 launch (ros_system + 🛠 노드) · diagnostics.yaml
├── ros_system/   # 📦 기동 launch · controllers/nav2/ekf/twist_mux yaml · config/moveit · scan_cam_gate
├── perception/   # perception_node · body_filter · signal_decoder · msg TrackedObject(Array)·MissionSignal
├── plan/         # user_input · vlm_task_planner · coordinator · explorer · msg SubGoal(Array)·TaskStatus
├── ml/           # grasp_scorer · rl_nav_controller(Nav2 플러그인) · rl_arm_correction(플러그인) · srv ScoreGrasps
├── control/      # BeebotSystemHardware(플러그인) · arm_safety_monitor · manual_control · msg ArmSafetyEvent·MotorStatus
├── manager/      # state_manager (/state/... 주인)
└── faker/        # 테스트베드 대역 (fake_camera · fake_opencr · ML 대역 · input/monitor_manager)
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
| 이 시스템 | perception, grasp_scorer | rl_nav_controller(주행 정책), rl_arm_correction |

**파지는 왜 지도학습인가** — 잡기 한 번에 성공·실패가 한 번 확정되고, 모델은 후보의 결과만 예측할 뿐 선택은 coordinator가 한다. 주행은 20Hz로 v·ω를 내고 경로 이탈·충돌의 결과가 여러 스텝 뒤에 나타나므로 강화학습이다.

## 노드별 학습 설계

학습 대상은 네 개, VLM은 프롬프트로만 씁니다. 학습 후 ONNX로 내보내 ROS 2 노드·컨트롤러 플러그인 안에서 추론합니다.

> **현재 구현 (ml 패키지):** rl_nav_controller는 ONNX 정책 + inner DWB 바이패스로 실제 동작하고 테스트베드에서도 진짜 플러그인을 쓴다. rl_arm_correction은 중력 처짐(sag/gravity) 앞먹임까지 구현했고 ONNX 잔차 정책은 TODO. grasp_scorer는 대상 위치 하나를 후보로 돌려줌(모델 TODO). perception은 YOLO 모델(\`model.pt\`)이 있으면 쓰고 없으면 빈 목록. grasp_scorer·rl_arm_correction 테스트베드 대역은 faker의 fake_*.

| 노드 | 방법 | 도구 | 입력 | 출력 | 정답 · 보상 |
| --- | --- | --- | --- | --- | --- |
| perception | 지도학습 | Isaac Sim Replicator → YOLO 등 파인튜닝 + 실사진 수백 장 | RGB | 클래스, 박스(·마스크) | 자동 라벨 |
| grasp_scorer | 지도학습 | Isaac Sim 파지 시도 → PyTorch 분류 | 컵 포인트클라우드, **IK 가능한** 파지 후보 | 성공 확률 0~1 | 들어 흔든 뒤 유지 1, 낙하 0 |
| rl_nav_controller | RL (정책 직접 출력) | Isaac Lab + PPO | 경로 웨이포인트 5×2, 가상 스캔 lidar_rays, 현재 v·ω, gyro_z, 직전 행동 2 | v, ω (max_lin·max_ang 비율) | 경로 추종 오차 −, 충돌·근접 큰 −, 명령 떨림 − |
| rl_arm_correction | RL (residual) | Isaac Lab + PPO | 목표·현재 관절각·속도, 추종 오차, 파지 여부(그리퍼 state interface로 판단), 직전 Δ | 관절별 Δ | 추종 오차 −, 보정량 −, 떨림 − |
| vlm_task_planner | 학습 없음 | 사전학습 VLM + 프롬프트 | 명령, /tracked_objects, 이미지 | /task/sub_goals (JSON) | — |

### 주행 정책이 배우는 것 (rl_nav_controller)

정책은 경로를 따라가기 위한 **v·ω를 직접** 냅니다. 정답 궤적을 주는 대신 경로 진행·횡오차·충돌·명령 부드러움을 보상으로 줍니다. 위치는 맵 좌표 대신 **경로 대비 상대 오차**로 넣어 특정 장소를 외우지 않게 합니다.

${F}python
obs = [waypoints(5×2), scan_rays(lidar_rays), v, w, gyro_z, prev_v, prev_w]
action = tanh(policy(obs))                   # [-1, 1]²
v_cmd = clip(action[0] * max_lin + extra_lin_vel, v_min, max_lin)
w_cmd = clip(action[1] * max_ang + extra_ang_vel, -max_ang, max_ang)
reward = (경로 진행 +, 횡·방향 오차 −, 충돌·근접 큰 −, |Δaction| −)
${F}

> **비교 기준을 정직하게:** 기준선은 같은 EKF·같은 Nav2에서 **inner DWB**(정책 OFF)다. 정책 ON/OFF를 같은 경로에서 비교해야 효과가 부풀지 않는다.

### 주행 파라미터 — 프리셋 대신 고정값

예전의 A/B/C 프리셋과 /speed_limit·set_parameters 런타임 변경은 제거됐다. 지금은 \`nav2_params.yaml\`의 FollowPath 파라미터가 고정값이고, 정책이 꺼지면 \`inner.*\`(DWB) 설정이 그대로 쓰인다.

| 값 | 위치 | 현재 값 |
| --- | --- | --- |
| 최대 선속도 | FollowPath.max_lin · inner.max_vel_x | 0.26 m/s |
| 최대 각속도 | FollowPath.max_ang · inner.max_vel_theta | 1.82 rad/s |
| 후진 허용 | FollowPath.v_min_ratio | −0.2 |
| 가상 스캔 | FollowPath.lidar_rays · lidar_max | 360 · 3.5m |
| 폴백 | FollowPath.fallback_controller · inner.* | dwb |

- 바꾸려면 yaml을 고치고 재시작한다. 런타임 튜닝은 \`~/FollowPath/toggle\`(정책 ON/OFF)만 남아 있다.

### 랜덤화 범위 예

| 대상 | 랜덤화 항목 | 범위 |
| --- | --- | --- |
| perception | 조명, 배경, 질감, 카메라 노이즈·노출 | 장면마다 |
| grasp_scorer | 컵 종류·크기·위치·회전, 마찰, 질량(물 양) | 머그·종이컵·유리컵, 마찰 0.3~1.0, 0.1~0.4kg |
| rl_nav_controller | 바닥 마찰, 바퀴 반경, 질량, 명령 지연, IMU 노이즈, 점구름 노이즈·가림 | 0.3~1.0, ±3%, ±20%, 0~60ms |
| rl_arm_correction | 관절 마찰, 물건 무게, 모터 게인, 지연, 백래시 | 무게 0~0.3kg 등 |
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
    URDF -->|"USD 로봇"| SYS -->|"맞춘 질량·마찰·게인"| ENV
    ENV -->|"장면"| GEN -->|"(점구름, 자세, 성공/실패)"| DS -->|"학습 데이터"| TR -->|"학습한 모델 내보내기"| ONNX
    ENV -->|"장면 + 랜덤화"| LAB -->|"정책 내보내기"| ONNX
    ONNX -->|"같은 관측·정규화로<br/>추론 (배포)"| ROS
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

### 강화학습 흐름 (rl_nav_controller)

1. **환경 정의:** 차동 구동 플랜트에 경로·가상 스캔·IMU 관측을 만들고, 행동은 v·ω, 보상은 경로 추종·충돌·부드러움으로 정의합니다.
2. **관측 일치:** ROS 플러그인과 **같은 순서·단위·정규화**(웨이포인트 5×2, 가상 스캔 \`lidar_rays\`, v·ω·gyro, 이전 행동 2)를 씁니다. \`lidar_rays\`를 바꾸면 모델 입력도 다시 맞춥니다.
3. **랜덤화:** 마찰·바퀴 반경·질량·지연·IMU/점구름 노이즈·장애물 배치.
4. **학습:** PPO. 보상 곡선이 평평해지면 수렴.
5. **확인:** 같은 경로에서 inner DWB 대비 경로 이탈·도착 시간·충돌을 비교합니다.
6. **배포:** ONNX → \`model/rl_nav_controller/policy.onnx\` → \`share/ml/model/rl_nav_controller/policy.onnx\`(CMake 복사) → \`FollowPath.model_path\`가 읽는다. \`enable=true\`면 정책, \`enable=false\`면 inner DWB.

${F}text
모델 경로: lv2_module6/ros2_ws/model/rl_nav_controller/policy.onnx
배포 경로: share/ml/model/rl_nav_controller/policy.onnx
${F}

### Isaac에서 쓸 수 있는 학습 종류

| 종류 | 도구 | 이 시스템의 용도 |
| --- | --- | --- |
| 강화학습 | Isaac Lab + PPO (rsl_rl, rl_games, skrl) | 주행 정책 1개(rl_nav_controller), 팔 잔차 1개(rl_arm_correction) |
| 합성 데이터 지도학습 | Replicator, 스크립트 데이터 수집 | perception, grasp_scorer |
| 모방학습 | Isaac Lab 원격조종, Isaac Lab Mimic, robomimic | 나중에 pick/place 동작 자체를 학습할 때 |

공통 기법: 도메인 랜덤화, 쉬운 환경부터 어려운 환경으로 가는 커리큘럼, 시뮬 정답으로 학습한 선생 정책을 실제 센서만 쓰는 학생 정책이 따라 하는 teacher–student.
`,
  },

  scenario: {
    label: '시나리오',
    md: `
## 시나리오

같은 설계가 상황마다 어떻게 움직이는지 봅니다. 1번이 정상 흐름, 2~7번은 일이 꼬였을 때, 8~11번은 지도 만들기부터 주행까지 **운영 절차**입니다.

| # | 시나리오 | 무엇을 보나 |
| --- | --- | --- |
| 1 | 테이블 위 컵 가져오기 | 정상 흐름 — 명령부터 전달까지 |
| 2 | 파지 실패 → 재계획 → 다시 집기 | 재시도는 coordinator, 재계획은 VLM |
| 3 | 가는 길이 막혔다 | Nav2 자체 복구 → 안 되면 재계획 |
| 4 | 이동 중 아이가 앞을 지나간다 | 재계획 없이 collision_monitor가 감속·정지 |
| 5 | 집는 중 사람이 팔을 잡았다 | 전류로 접촉 감지 → 궤적 취소 |
| 6 | 전원 켜자마자 명령 | 위치(map→odom)를 찾을 때까지 기다림 |
| 7 | 학습 노드를 모두 끄고 같은 명령 | 끄면 무엇이 달라지나 |
| 8 | SLAM 시작 — 새 지도 만들기 | MAPPING 모드 → EXPLORE 자동 탐사 → 끝나면 AUTO |
| 9 | 지도 저장 | rtabmap.db(원본) + map_saver 2D 미리보기 |
| 10 | 저장 지도로 위치추정 시작 | DB 불러오기 → 장면 찾기 → map→odom → Nav2 활성 |
| 11 | 목표 지정 → Nav2 주행 | Nav2 Goal → 경로 → 20 Hz 속도 명령 체인 → 도착 |

## 시나리오 1: 테이블 위 컵 가져오기 (정상 흐름)

로봇은 현관, 낮은 테이블(높이 0.45m)은 4m 떨어진 거실, 가는 길에 카펫과 의자. 아래 값은 각 노드가 실제로 주고받는 메시지 예시입니다.

${F}mermaid
sequenceDiagram
    autonumber
    participant U as 사람
    participant I as user_input
    participant V as vlm_task_planner
    participant C as coordinator
    participant N as Nav2
    participant G as grasp_scorer
    participant M as move_group
    participant R as gripper_controller
    U->>I: ⌨️ “테이블 위 컵 가져다줘”
    I->>V: ✉️ /cmd/user_command "테이블 위 컵 가져다줘" (std_msgs/String)
    V->>C: ✉️ /task/sub_goals [navigate, pick, navigate, place] (plan/SubGoalArray)
    C->>C: 검증 (허용 동작, id 존재)
    C->>N: 🎬 /navigate_to_pose x 3.45, y 0.9, yaw 0 (nav2_msgs/action/NavigateToPose)
    N-->>C: 🎬 result 성공
    C->>M: 📞 /clear_octomap · /apply_planning_scene (std_srvs/srv/Empty · moveit_msgs/srv/ApplyPlanningScene)
    C->>G: 📞 /score_grasps IK 가능 후보 3개 (ml/srv/ScoreGrasps)
    G-->>C: 📞 response [B 0.87, C 0.62, A 0.41]
    C->>M: 📞 /plan_kinematic_path · 🎬 /execute_trajectory 후보 B (moveit_msgs/srv/GetMotionPlan · moveit_msgs/action/ExecuteTrajectory)
    C->>R: 🎬 /gripper_controller/gripper_cmd 닫기 (control_msgs/action/ParallelGripperCommand)
    R-->>C: 🎬 result 끝까지 닫힘 — 빈손
    C->>M: 📞 plan · 🎬 execute 후보 C
    C->>R: 🎬 gripper_cmd 닫기
    R-->>C: 🎬 result stalled — 컵에서 멈춤 = 파지
    C->>N: 🎬 /navigate_to_pose 사람 앞 (nav2_msgs/action/NavigateToPose)
    C->>M: 📞 plan · 🎬 execute place 자세
    C->>R: 🎬 gripper_cmd 열기
    C->>V: ✉️ /task/status 완료 (plan/TaskStatus)
    C->>I: ✉️ /robot/say “컵 가져왔어요” (std_msgs/String)
    I->>U: 🔊 “컵 가져왔어요” (터미널 텍스트)
${F}

### 1단계: 인식과 계획

1. **사람:** "테이블 위 컵 가져다줘" → /cmd/user_command
2. **perception:** pole_front_cam 영상·depth로 물체 추적

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

1. **FollowPath 플러그인(정책):** controller_server 안에서 경로·local costmap·현재 속도·가상 스캔·IMU gyro를 관측으로 v·ω를 냅니다. 예) /cmd_vel_nav = (0.12, 0.30). 정책이 꺼져 있으면 inner DWB가 대신합니다.
2. **가상 스캔:** 몸 뺀 점구름을 360방향 최소거리로 — 의자까지 0.5m. costmap·collision_monitor도 같은 점구름을 씁니다.
4. **velocity_smoother → collision_monitor:** 의자까지 0.5m라 통과. SlowZone(0.3m) 안이면 50%, Approach(반경 0.20m 몸이 1초 안에 닿을 방향)면 그 방향 정지.
5. **diff_drive_controller:** 좌 2.72, 우 5.76rad/s. 도착하면 Nav2 성공 → coordinator가 pick으로.

### 3단계: 컵 집기

1. **coordinator:** 0.5초 안정 대기 → /clear_octomap → 테이블·컵 CollisionObject 등록 → /score_grasps.

${F}text
후보 (OM-X IK 가능한 것만)
  B: 옆에서 수평   → 0.87  ← 1순위
  C: 위에서 비스듬히 → 0.62  ← 2순위
  A: 위에서 수직   → 0.41  (가장자리가 얇아 미끄러짐)
${F}

2. **move_group:** coordinator가 📞 /plan_kinematic_path로 후보 B 접근 궤적을 받고 🎬 /execute_trajectory로 실행 (MTC로 접근·attach·들어올리기를 한 번에 짜는 건 TODO).
3. **arm_controller:** 매 주기 목표 관절각. 예) [0.00, 0.62, −0.31, 1.10, 0.00] (joint1~5)
4. **rl_arm_correction:** 팔을 뻗자 중력으로 joint2가 0.59에 머묾 → Δ = [0.00, +0.03, −0.01, 0.00, 0.00] → [0.00, 0.65, −0.32, 1.10, 0.00] (목표 동작 — ONNX 잔차 정책은 TODO, 중력 처짐 앞먹임은 구현)
5. **gripper_controller:** coordinator가 MoveIt을 거치지 않고 ParallelGripperCommand로 닫기. 컵을 든 뒤 처짐이 커지면 정책이 Δ를 키운다.

### 실패와 재시도

1. ParallelGripperCommand 결과 그리퍼 관절 위치가 완전히 닫힘(빈손)에 가깝다 → 놓친 것으로 판단.
2. **coordinator가 직접** 2순위 후보 C로 재시도 (VLM 호출 없음).
3. C도 실패하면 /task/status (step 2, reason: grasp_failed_all)로 VLM에 재계획 요청 — 예) "다른 방향에서 접근하도록 navigate 재지정".
4. 같은 단계가 두 번 연속 실패하면 coordinator가 \`/robot/say\`로 "컵을 잡을 수 없어요"를 보내고(user_input이 표시) 정지.

### 4단계: 전달

컵을 든 채 이동할 땐 footprint를 키우고 필요하면 \`extra_lin_vel\`을 낮춘다(액체 출렁임 방지 — footprint 확장은 TODO). 사람 앞에서 place(그리퍼 열기) → (detach·팔 stow는 TODO) → /task/status 완료.

> **학습 요소를 모두 꺼도**(FollowPath \`enable:=false\` → inner DWB, 팔 \`enabled:=false\` → Δ=0) 이 시나리오는 끝까지 동작한다. 차이는 카펫에서 경로를 조금 더 벗어나고, 팔이 처져 파지 성공률이 떨어지는 정도다.

## 시나리오 2: 파지 실패 → 재계획 → 다시 집기

컵 손잡이 쪽이 미끄러워 옆에서 잡는 후보가 연달아 실패한 경우입니다.

${F}mermaid
sequenceDiagram
    autonumber
    participant C as coordinator
    participant G as grasp_scorer
    participant M as move_group
    participant V as vlm_task_planner
    participant N as Nav2
    C->>G: 📞 /score_grasps
    G-->>C: [B 0.87, C 0.62, A 0.41]
    C->>M: 📞 plan · 🎬 /execute_trajectory 후보 B
    Note over C: 🎬 gripper_cmd 닫기 → 끝까지 닫힘 — 빈손
    C->>M: 📞 plan · 🎬 /execute_trajectory 후보 C
    Note over C: 또 빈손
    C->>V: ✉️ /task/status step 2 FAILED (grasp_failed_all)
    V->>C: ✉️ /task/sub_goals [navigate 테이블 옆(컵 방향 정렬), pick, navigate 사람, place]
    C->>N: 🎬 /navigate_to_pose 새 접근 위치
    N-->>C: 성공
    C->>M: 📞 /clear_octomap · /apply_planning_scene
    C->>G: 📞 /score_grasps
    G-->>C: [D 0.81, B 0.70]
    C->>M: 📞 plan · 🎬 /execute_trajectory 후보 D
    Note over C: 🎬 gripper_cmd 닫기 → stalled = 파지 성공
    Note over C: 원래 계획대로 사람에게 전달
${F}

- **재시도는 coordinator, 재계획은 VLM.** 후보를 바꿔 다시 잡는 건 실행 세부라 coordinator가 직접 합니다(계획·임무 규칙 4). 후보를 다 쓴 뒤에야 VLM이 "어디서 어떻게 접근할지"를 다시 정합니다.
- **5축(손목 roll) 팔도 접근 방향이 핵심이다.** 옆 파지는 컵이 팔 평면 안에 있어야 되므로, 새 계획은 베이스를 컵 방향으로 정렬해 세우는 것부터 바꿉니다.
- **재계획 뒤에도 또 실패하면** 같은 단계 2회 실패라 \`/robot/say\` "컵을 잡을 수 없어요" 후 정지합니다(규칙 5).
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
    C->>V: ✉️ /task/status step 1 FAILED (nav_failed)
    V->>C: ✉️ /task/sub_goals [navigate 테이블 반대편, pick, ...]
    C->>B: 🎬 /navigate_to_pose 테이블 반대편
    B-->>C: 성공
    Note over C: 이어서 pick
${F}

- **Nav2가 먼저 스스로 푼다.** 경로 재계산 → 복구(Spin·Wait) → 다시 계산을 행동 트리에 정해진 횟수만큼 반복합니다. pole_front_cam이 뒤를 못 보므로 BackUp은 빼거나 0.1m 이하입니다.
- **그래도 안 되면 그때 coordinator·VLM 차례.** 액션이 ABORTED로 끝나면 coordinator가 FAILED로 보고하고 VLM이 다른 접근 위치로 다시 계획합니다.
- 같은 단계가 2회 연속 실패하면 사람에게 알리고 정지합니다(규칙 5).

## 시나리오 4: 이동 중 아이가 앞을 지나간다

재계획이 필요 없는 경우입니다. 명령 체인의 마지막 관문이 속도만 줄였다가 풉니다.

${F}mermaid
sequenceDiagram
    participant N as controller_server
    participant R as FollowPath (rl_nav_controller)
    participant S as velocity_smoother
    participant X as collision_monitor
    participant D as diff_drive_controller
    N->>R: 🎬 follow_path (경로·costmap·현재 속도 인자)
    R->>S: ✉️ /cmd_vel_nav (정책 v·ω 0.14, 0.35)
    S->>X: ✉️ /cmd_vel_smoothed
    Note over X: 몸 뺀 점구름에서 0.3m 안에 물체 → SlowZone
    X->>D: ✉️ /cmd_vel 50%로 감속
    Note over X: 지금 속도로 1초 안에 닿음 → Approach
    X->>D: ✉️ /cmd_vel 0 (정지)
    Note over X: 아이가 비켜남
    X->>D: ✉️ /cmd_vel 원래 명령 그대로
${F}

- **안전장치는 학습 요소 뒤에 있다.** 주행 정책이 무엇을 내든 collision_monitor가 최종 명령을 거릅니다(개요의 규칙).
- **Nav2 액션은 계속 진행 중**이라 coordinator는 개입하지 않습니다. 다만 오래 막혀 있으면 controller_server가 멈춤으로 보고 시나리오 3처럼 복구로 넘어갑니다.
- **전방 화각 안만 지켜 준다.** pole_front_cam 화각(약 87°) 밖, 옆·뒤는 못 봅니다.

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
    Note over A: 관절이 거의 멈춘 채 전류가 3.0A 초과로 0.3초 넘게 이어짐 → 접촉
    A->>J: 📞 cancel_goal
    Note over J: 현재 자세 유지
    J-->>M: 궤적 취소됨
    A->>C: ✉️ /arm_safety_event
    M-->>C: 🎬 /execute_trajectory 실패
    C->>V: ✉️ /task/status step 2 FAILED (arm_contact)
    V->>C: ✉️ /task/sub_goals (다시 시도)
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
    participant I as user_input
    participant V as vlm_task_planner
    participant C as coordinator
    participant T as rtabmap (위치추정)
    participant N as Nav2
    Note over T: 지도와 맞는 장면 찾는 중 · map→odom 아직 없음
    U->>I: 🗣️ “테이블 위 컵 가져다줘”
    I->>V: ✉️ /cmd/user_command
    V->>C: ✉️ /task/sub_goals
    C->>C: 검증 OK · map→odom TF 대기 (TODO)
    T-->>C: ✉️ /tf (map→odom 변환) 발행 시작
    C->>N: 🎬 /navigate_to_pose
${F}

- **map→odom 전에는 목표를 보내지 않는다.** Nav2가 지도 기준 로봇 위치를 모르는 상태라 바로 실패합니다. coordinator가 TF를 기다리게 할 예정입니다 (아직 TODO — Nav2·SLAM 섹션 3-1).
- 이 구조는 맵핑·위치추정 탭의 initial_pose와 같은 이야기입니다. AMCL은 /initialpose를 받아야, RTAB-Map은 지도와 맞는 장면을 찾아야 map→odom이 나옵니다.
- 조명이 매핑 때와 크게 다르면 오래 걸립니다. 낮·밤 두 조건에서 매핑해 둡니다.

## 시나리오 7: 학습 노드를 모두 끄고 같은 명령

| 노드 | 켜짐 | enabled:=false |
| --- | --- | --- |
| rl_nav_controller | 정책이 v·ω를 직접 | enable=false → inner DWB (Δ 보정 없음) |
| rl_arm_correction | 팔 처짐 보상 Δ | Δ=0 |

- **노드를 내리지 않고 끈다.** \`enable:=false\`·\`enabled:=false\`면 원래 시스템과 같아야 합니다(개요의 규칙). 그래서 학습 요소를 넣기 전·후를 같은 조건에서 비교할 수 있습니다.
- **시나리오 1은 끝까지 동작합니다.** 차이는 카펫에서 경로를 조금 더 벗어나고, 팔이 처져 파지 성공률이 떨어지는 정도입니다. 그만큼 시나리오 2(재시도·재계획)가 더 자주 일어납니다.

## 시나리오 8: SLAM 시작 — 새 지도 만들기 (자동 탐사)

새 장소에 처음 왔을 때입니다. 지도 모드를 MAPPING으로 바꾸고, EXPLORE로 탐사를 맡깁니다 (손으로 몰려면 MANUAL + teleop).

${F}mermaid
sequenceDiagram
    autonumber
    participant O as 운영자 (operator_tool · 시뮬레이터)
    participant S as state_manager
    participant R as rtabmap
    participant C as coordinator
    participant E as explorer
    participant N as Nav2
    O->>S: ✉️ /cmd/map_mode "MAPPING" (또는 bringup map:=slam — 새 DB)
    S->>R: 📞 /rtabmap/rtabmap/set_mode_mapping
    R-->>S: 응답 OK
    S->>C: ✉️ /state/map_mode "MAPPING"
    C->>C: 작업 없음 → 팔을 scan_pose로 (gripper_cam도 지도에 씀)
    O->>S: ✉️ /cmd/operation_mode "EXPLORE"
    S->>E: ✉️ /state/operation_mode "EXPLORE"
    loop 프론티어가 남아 있는 동안
        R-->>E: ✉️ /map · /tf (map→odom 변환)
        E->>N: 🎬 /navigate_to_pose (가장 좋은 프론티어)
        N-->>E: 결과 (성공 · 실패 → 다음 프론티어)
    end
    E->>S: ✉️ /explore/result "DONE"
    S-->>O: ✉️ /state/operation_mode "AUTO"
${F}

- **MAPPING일 때만 EXPLORE가 허락됩니다.** 위치추정 모드에서 탐사하면 지도가 안 바뀌어 프론티어가 영원히 남습니다.
- 천천히(0.1~0.15 m/s) 돌고, 마지막엔 **출발점으로 돌아와** 루프 클로저로 지도를 붙입니다. 자세한 순서·문제 해결은 3-1 지도 맵핑.
- **탐사가 일찍 끝나면:** explorer가 못 가는 프론티어를 계속 실패(블랙리스트)해 "갈 곳 없음"으로 끝난 경우입니다. 실패 이유(경로 없음 · 진척 없음 타임아웃)를 Nav2 로그로 보고, 다시 EXPLORE로 이어 갑니다.
- 전환안: LiDAR는 \`map:=slam\`으로 Cartographer를 띄우고, Isaac은 cuVSLAM + nvblox가 같이 쌓습니다 (전체 아키텍처의 구성 버튼).

## 시나리오 9: 지도 저장

${F}mermaid
sequenceDiagram
    autonumber
    participant O as 운영자 (시뮬레이터 [지도 저장])
    participant MS as map_saver
    participant R as rtabmap
    participant D as 디스크 <map_dir>/<이름>/
    Note over R,D: rtabmap.db는 매핑 내내 기록 · 종료 시 확정 (지도 원본)
    O->>MS: 📞 /map_saver/save_map (nav2_msgs/srv/SaveMap)
    R-->>MS: ✉️ /map 한 장 (nav_msgs/OccupancyGrid)
    MS->>D: 💾 map.pgm · map.yaml (2D 미리보기)
    MS-->>O: 응답 result=true
${F}

- **지도 원본은 \`rtabmap.db\` 하나**입니다 (특징점·그래프·지도). \`map.pgm·yaml\`은 사람이 보는 2D 미리보기라 운행에 꼭 필요하지 않습니다.
- **SLAM이 켜져 있을 때** 저장합니다. 끄면 \`/map\`을 내는 노드가 없어 map_saver가 실패합니다.
- 전환안: LiDAR는 Cartographer \`/write_state\`(.pbstream) + map_saver(map.pgm·yaml) **둘 다**, Isaac은 cuVSLAM \`save_map\` + nvblox \`~/save_map\`(.nvblx) **둘 다** 짝 맞춰 저장합니다.

## 시나리오 10: 저장 지도로 위치추정 시작

${F}mermaid
sequenceDiagram
    autonumber
    participant O as 운영자
    participant S as state_manager
    participant R as rtabmap
    participant L as lifecycle_manager_navigation
    participant N as Nav2 서버들
    O->>S: ✉️ /cmd/map_name "거실" (또는 bringup map:=saved map_name:=거실)
    S->>R: 📞 /rtabmap/rtabmap/load_database (거실/rtabmap.db)
    S->>R: 📞 /rtabmap/rtabmap/set_mode_localization
    S-->>O: ✉️ /state/map_mode "LOCALIZATION" · /state/map_name
    R-->>N: ✉️ /map (transient_local)
    Note over R: 지금 장면과 맞는 과거 장면 찾는 중 — map→odom 아직 없음
    O-->>R: (선택) ✉️ /initialpose — 대략 위치 알려 주기
    R-->>N: ✉️ /tf (map→odom 변환) 발행 시작
    L->>N: 📞 lifecycle change_state (configure → activate)
    N-->>O: 목표 받을 준비 완료
${F}

- **map→odom이 나온 뒤에** 목표를 보냅니다 (시나리오 6). 매핑했던 장소를 천천히 비추면 빨리 찾습니다.
- 위치가 틀리게 잡히면 \`/initialpose\`(RViz 2D Pose Estimate)로 다시 알려 줍니다. 원리는 위치추정 탭.
- 전환안: LiDAR는 Cartographer를 끄고 **map_server + AMCL**(처음 위치가 꼭 필요), Isaac은 cuVSLAM \`load_map_and_localize\` + nvblox \`~/load_map\`.

## 시나리오 11: 목표 지정 → Nav2 주행

RViz의 **Nav2 Goal**로 찍거나, coordinator가 작업 중에 보냅니다. 둘 다 같은 NavigateToPose 액션입니다.

${F}mermaid
sequenceDiagram
    autonumber
    participant O as 운영자 (RViz Nav2 Goal) · coordinator
    participant BT as bt_navigator
    participant PS as planner_server
    participant CS as controller_server
    participant RL as rl_nav_controller (FollowPath)
    participant M as twist_mux → velocity_smoother → collision_monitor
    participant D as diff_drive_controller
    O->>BT: ✉️ /goal_pose (RViz) 또는 🎬 /navigate_to_pose (coordinator)
    BT->>PS: 🎬 /compute_path_to_pose
    PS-->>BT: 경로 (nav_msgs/Path) · ✉️ /plan
    BT->>CS: 🎬 /follow_path
    loop 20 Hz, 도착할 때까지
        CS->>RL: 🎬 computeVelocityCommands (경로·costmap·현재 속도 인자)
        RL->>M: ✉️ /cmd_vel_nav (정책 v·ω · 정책이 없으면 inner DWB)
        M->>D: ✉️ /cmd_vel (가속 제한 · 충돌 감속 뒤)
        D-->>CS: ✉️ /odom → EKF → /odometry/filtered (현재 속도)
    end
    CS-->>BT: follow_path 성공
    BT-->>O: 🎬 결과 SUCCEEDED
${F}

- **조작 모드는 AUTO.** MANUAL이면 twist_mux에서 수동 명령이 이기고 collision_monitor가 꺼져 있습니다.
- 경로가 막히면 BT가 재계획·후진·회전을 시도합니다 (시나리오 3). 장애물이 갑자기 나타나면 collision_monitor가 감속·정지합니다 (시나리오 4).
- 주행 정책은 현재 구성에서도 controller_server 안 **rl_nav_controller FollowPath 플러그인**이 직접 \`/cmd_vel_nav\`를 냅니다. Isaac 전환안도 같은 플러그인을 씁니다 (별도 보정 노드 없음).
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
- [ ] 팔 Δ 클리핑(관절 ±0.05)과 **정책 출력 상한**(max_lin·max_ang·extra_*)이 걸려 있다
- [ ] velocity_smoother·collision_monitor가 controller_server(FollowPath 플러그인)와 behavior_server 뒤에 있고, behavior_server 출력도 같은 체인을 지난다
- [ ] 점구름이 0.5초(cloud_timeout) 넘게 끊기면 정책을 건너뛰고 inner DWB로 주행한다
- [ ] TwistStamped로 체인 전체가 통일돼 있다
- [ ] odom TF 발행자가 하나다 (ekf만)

### 하드웨어 첫 구동

- [ ] 틱↔rad 변환과 중앙값 2048을 관절마다 확인
- [ ] 토크를 낮춘 상태에서 관절을 하나씩 움직여봄
- [ ] OpenCR S 줄이 10ms마다 온다 (BeebotSystemHardware 진단 "OpenCR 연결" · 펌웨어 SyncRead/BulkWrite, baud 1000000)
- [ ] 비상 정지 방법이 정해져 있다 (하드웨어 스위치 + \`/cmd_vel\` 0 + 컨트롤러 deactivate)
- [ ] 팔이 테이블 높이에 닿는다 (MoveIt에서 목표 자세 IK 확인)
- [ ] RealSense 2대가 serial_no로 구분돼 동시에 30fps(또는 설정 fps)를 유지한다 (\`ros2 topic hz\`)
- [ ] rtabmap 위치추정 모드에서 시작 위치를 찾은 뒤에만 Nav2 목표를 보낸다

### 팔 안전

- [ ] planning scene에 octomap(pole_front_cam 포인트클라우드)이 들어오고, pick 전 clear가 된다
- [ ] /joint_states에 effort가 실린다
- [ ] 정상 동작 전류를 기록하고 접촉 기준값을 정했다
- [ ] 팔을 손으로 막았을 때 0.2초 안에 궤적이 멈춘다 (JTC 허용오차 또는 arm_safety_monitor)
- [ ] MoveIt 속도·가속도 스케일과 다이나믹셀 전류 한계가 설정돼 있다
- [ ] 베이스 이동 중 팔 동작이 coordinator에서 막힌다

### 효과 검증

- [ ] 같은 경로를 정책 ON/OFF(toggle, EKF는 둘 다 켬)로 각 10회 이상 주행해 경로 이탈·도착 시간 비교
- [ ] 같은 컵 배치에서 grasp_scorer vs 규칙 기반 성공률 기록
- [ ] coordinator가 VLM 출력의 형식, 허용 동작, 대상 존재를 검사
- [ ] 재시도 한도(2회)와 사람에게 알리는 동작이 있다

## 개발 로드맵

확정 노드만으로 끝까지 되게 만든 뒤, 효과가 크고 쉬운 학습 노드부터 하나씩 붙입니다. 각 단계는 앞 단계가 **실기에서 동작해야** 시작합니다.

${F}mermaid
flowchart LR
    A["1 기반<br/>URDF·SLAM·Nav2·MoveIt"] -->|"이동·팔이 되면"| B["2 coordinator<br/>+ perception"]
    B -->|"규칙 실행이 되면"| C["3 vlm_task_planner"]
    C -->|"전 과정이 돌면"| D["4 오차 측정"]
    D -->|"주행 오차 큼"| E["5 rl_nav_controller<br/>FollowPath 플러그인"]
    E -->|"파지 실패 많음"| F["6 grasp_scorer"]
    F -->|"팔 처짐 남음"| G["7 rl_arm_correction"]
${CLS}
    class A,B,C,D std;
    class E,F,G rl;
${F}

1. **기반:** URDF에 RealSense 2대·ros2_control 태그, RTAB-Map 지도, Nav2(+behavior_server, ekf)·MoveIt(MTC는 TODO) 설정, 텔레옵으로 이동·집기, 팔을 막으면 멈추는지 확인
2. **coordinator + perception:** 규칙 기반 파지(옆에서)와 inner DWB로 컵 가져오기를 끝까지
3. **vlm_task_planner:** 자연어 명령과 재계획 연결
4. **오차 측정:** 학습 없이 반복해 오차가 어디서 나는지 rosbag으로 기록 (이게 Isaac 시스템 식별 데이터)
5. **rl_nav_controller:** FollowPath 플러그인(ONNX) + inner DWB, 정책 ON/OFF 비교
6. **grasp_scorer:** 규칙 기반 대비 성공률이 오르는지
7. **rl_arm_correction:** chainable controller로 구현
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
| 2 | 프리셋 노드가 DWB 파라미터 변경 | 프리셋 제거 — 주행 파라미터는 nav2_params.yaml 고정 | critic scale은 초기화 때 읽혀 런타임 변경이 반영 안 될 수 있고, 프리셋 노드가 사라져 고정값만 쓴다 |
| 3 | "토픽으로는 controller_server를 바꿀 수 없다" | FollowPath를 플러그인(ml::RlNavController)으로 교체 | 정책이 controller_server 안에서 직접 v·ω를 내고, 모델이 없으면 inner DWB로 바이패스 |
| 4 | behavior_server 없음, lifecycle_manager 1개 | behavior_server 추가, 2개로 분리 | 기본 BT가 Spin·BackUp·Wait 호출 |
| 5 | pole_front_cam depth → depthimage_to_laserscan → /scan | /scan 없이 depth를 PointCloud2로 직접 사용 | 하향 카메라를 스캔으로 바꾸면 바닥을 장애물로 잡음 |
| 6 | camera_info, depth/points 누락 | 1장에 추가 | 3D 투영·포인트클라우드 생성에 필요 |
| 7 | MoveGroup 액션으로 pick | MTC (직선 접근·attach·후퇴) | 직선 이동과 attach는 MoveGroup 하나로 안 됨 |
| 8 | octomap 속 목표 컵 처리 없음 | /clear_octomap + ACM 허용 | 컵 voxel 때문에 접근 계획이 거부됨 |
| 9 | 4축 팔 한계 미반영 | IK 가능 후보만, pick_ik | OM-X는 6D 자세를 못 만듦 |
| 10 | 테이블 높이 0.72~0.75m | 낮은 테이블 0.45m | OM-X를 Waffle에 얹으면 그리퍼 최고 높이 약 0.6m |
| 11 | 바퀴 4.2 · 5.9rad/s | 2.72 · 5.76rad/s | 초안 값은 Burger(간격 0.16m) 기준, Waffle은 0.287m |
| 12 | 프리셋 B 상한 0.15인데 보정 후 0.16 | (해당 없음 — 프리셋·보정 노드 제거) | 주행 정책은 max_lin/max_ang 상한 안에서 직접 출력하고 안전 체인이 다시 자름 |
| 13 | VLM이 2순위 파지점 선택 | coordinator가 재시도, VLM은 순서만 | 계층 원칙(판단 권한 한 층에 하나) |
| 14 | "폭 센서 값 0" | 그리퍼 관절 위치·GripperCommand 결과 | OM-X에 폭 센서 없음 |
| 15 | 팔 U2D2, controller_manager 2개 | OpenCR, controller_manager 1개 | turtlebot3_manipulation 공식 구성 |
| 16 | odom→base_link를 diff_drive_controller | robot_localization EKF | IMU 융합으로 미끄러짐 기본 보정, RL 비교 기준 |
| 17 | 추종 오차 감지를 직접 작성 | JTC constraints 내장 기능 | 직접 작성은 전류 감지만 |
| 18 | 이동·팔 조율 규칙 없음 | stow, footprint 확장, 정지 시에만 팔 | 모바일 매니퓰레이터 기본 규칙 |
| 19 | 프리셋을 Isaac Lab RL로 | 프리셋 제거 | 프리셋 노드 없이 Nav2 FollowPath 플러그인이 정책을 직접 실행 |
| 20 | slam_toolbox + amcl (LaserScan 기반) | RTAB-Map 매핑·위치추정 | LiDAR가 없어 LaserScan 기반 SLAM·위치추정은 화각 87° 가짜 스캔에 의존하게 됨 |
| 21 | QoS 언급 없음 | QoS 표 추가 | best_effort ↔ reliable 불일치는 연결 자체가 안 됨 |
| 22 | gripper_cam RGB, LiDAR 탑재 가정 | 카메라 2대 모두 Intel RealSense, LiDAR 없음 | 실제 하드웨어 구성 반영 — 근접 점구름은 gripper_cam, 장애물·SLAM은 pole_front_cam 담당 |
| 23 | 후방 감지 가정 | BackUp 복구 제한, voxel layer 보수적 clearing | 전방 카메라 하나라 옆·뒤 사각지대 |
| 24 | rtabmap Grid/FromDepth | Grid/Sensor 0 + scan_cloud = points_filtered (처음엔 1 depth — 팔이 지도에 벽으로 남아 바꿈) | 현재 rtabmap에서 Grid/FromDepth는 Grid/Sensor(0 레이저, 1 depth, 2 둘 다)로 바뀜 — rtabmap Parameters.h 확인 |
| 25 | 공식 TurtleBot3 플러그인으로 전류(effort) 사용 | 직접 작성한 control/BeebotSystemHardware (OpenCR 펌웨어와 ASCII 줄 C/S/E/R) | 공식 플러그인은 position·velocity만 내보냄 — effort를 내보내야 arm_safety_monitor·rl_arm_correction이 동작. 모터 에러·온도(/motor_status)·재부팅도 같이 |
| 26 | /failure_report (실패할 때만, coordinator → VLM) | /task/status (RUNNING·SUCCEEDED·FAILED + reason) | 실패만이 아니라 진행·완료도 같은 토픽으로 — VLM은 FAILED에 재계획, user_input은 완료 안내·진행 표시에 사용 |
| 27 | MTC(/execute_task_solution) + MoveIt 경유 GripperCommand | coordinator가 /plan_kinematic_path + /execute_trajectory, 그리퍼는 ParallelGripperCommand 직접 | Lyrical엔 GripperCommand 컨트롤러가 없고 MoveIt simple controller manager와 타입이 안 맞음 — MTC는 TODO |
| 28 | cupbot_interfaces 한 패키지, /sub_goals·/task_status·/robot_say | 메시지를 내보내는 패키지가 소유(perception·plan·control·ml), /task/sub_goals·/task/status·/robot/say | 이름공간으로 묶음 — API.md가 정본 |
| 29 | costmap·RTAB-Map에 원본 점구름 | body_filter의 points_filtered (+ scan_cam_gate·point_cloud_aggregator) | 카메라에 찍힌 자기 팔이 로봇 둘레 벽으로 남아 경로가 막힘 (실측) |
| 30 | voice_ui (음성) | user_input (텍스트) | 음성 UI 미정 — 같은 토픽(/cmd/user_command · /robot/say)이라 나중에 바꿔 끼움 |
| 31 | 주행 보정 별도 노드(Δ) | controller_server FollowPath 플러그인 rl_nav_controller | 노드·토픽 하나가 줄고, 정책이 v·ω를 직접 내며 꺼지면 inner DWB로 바이패스 |
`,
  },
};

const ORDER = Object.keys(SECTIONS) as Section[];

/*
 * 전체 아키텍처 "Isaac ROS 전환안" — 같은 도식에서 SLAM 묶음과 인지 검출만 바꿔 끼운다.
 * 원본 md를 고쳐 만들므로 나머지 노드·선은 원본과 항상 같다.
 */
// RLN: 주행 정책 플러그인 — Isaac 전환안에서도 같은 rl_nav_controller를 쓴다
const ISAAC_DROP = new Set(['SCG', 'PRS', 'GRS', 'RXS', 'PCA', 'RTAB', 'MS', 'LMS']);
const ISAAC_RT = `        subgraph RT["🟪 위치 — cuVSLAM (rtabmap의 위치 부분 자리 · GPU)"]
            VSLAM["📦 visual_slam_node<br/>cuVSLAM — 스테레오 VIO + 루프 클로저<br/>매핑 · 위치추정(load_map)"]
        end
        subgraph NB["🟪 3D 장애물 지도 — nvblox (costmap voxel 층 · 2D /map 자리 · Voxblox 후속)"]
            NVB["📦 nvblox_human_node<br/>human_with_static_tsdf<br/>고정 층 + 사람 층<br/>(사람 판단은 마스크가 함)"]
        end
`;
// UNET(사람 분할)은 nvblox 사람 모드용 — 마스크는 첫 카메라(camera_0 = pole_front_cam)만 지원
const ISAAC_EDGES = `    PC -->|"✉️ /pole_front_cam/infra1·infra2<br/>/image_rect_raw · camera_info<br/>(sensor_msgs/Image, emitter off)"| VSLAM
    IMB -.->|"✉️ /imu → visual_slam/imu<br/>(enable_imu_fusion)"| VSLAM
    VSLAM -->|"✉️ visual_slam/tracking/odometry<br/>(nav_msgs/Odometry)"| EKF
    VSLAM -->|"✉️ /tf (map→odom 변환)<br/>(odom→base TF는 끔)"| PS
    VSLAM -->|"✉️ /tf (tf2_msgs/TFMessage)<br/>map→odom 변환 → nvblox가 조회해<br/>카메라 자세 계산 (+ EKF odom→base · URDF)<br/>depth를 지도 제자리에 쌓기"| NVB
    PC -->|"✉️ color · camera_info<br/>(메시 색칠)"| NVB
    PC -->|"✉️ aligned_depth_to_color<br/>(sensor_msgs/Image)"| RSEG
    JSB -->|"✉️ /joint_states<br/>팔이 지금 어디 있나"| RSEG
    RSEG -->|"✉️ depth (로봇 몸 지움)<br/>(sensor_msgs/Image)"| NVB
    MG ==>|"🎬 /cumotion/move_group<br/>(moveit_msgs/action/MoveGroup)<br/>플러그인이 계획 요청 → 궤적 결과"| CUMP
    NVB -.->|"📞 /nvblox_node/get_esdf_and_gradient<br/>(read_esdf_world: true)<br/>충돌 세계 = nvblox ESDF"| CUMP
    PC -->|"✉️ /pole_front_cam/color<br/>· camera_info"| UNET
    UNET -->|"✉️ unet/raw_segmentation_mask<br/>→ mask/image · camera_info<br/>(sensor_msgs/Image, 사람=1)"| NVB
    NVB -->|"✉️ /nvblox_node/combined_esdf_pointcloud<br/>2D ESDF height slice → 360방향 가상 스캔<br/>(sensor_msgs/PointCloud2)"| RLN
    BS -->|"✉️ /cmd_vel_nav<br/>후진·회전"| TM
    NVB -->|"✉️ ~/combined_map_slice<br/>고정 + 사람(decay)<br/>(nvblox_msgs/DistanceMapSlice)<br/>→ 🔗 NvbloxCostmapLayer"| COST
    SM -.->|"🎬 visual_slam/save_map<br/>· load_map_and_localize<br/>(위치용 지도 저장·불러오기)"| VSLAM
    SM -.->|"📞 /nvblox_node/save_map · load_map<br/>(nvblox_msgs/srv/FilePath, .nvblx)<br/>장애물 지도 저장·불러오기"| NVB
    VSLAM -->|"💾 cuVSLAM 지도 폴더 쓰기<br/>랜드마크 + 포즈 그래프 (data.mbd 등)<br/>(save_map)"| MAPDIR
    MAPDIR -->|"💾 cuVSLAM 지도 폴더 읽기<br/>(load_map_and_localize · localize_in_map)"| VSLAM
    NVB -->|"💾 .nvblx 쓰기<br/>(~/save_map · TSDF·ESDF)"| MAPDIR
    MAPDIR -->|"💾 .nvblx 읽기<br/>(~/load_map)"| NVB
    COST -->|"✉️ /global_costmap/costmap<br/>프론티어 (/map 대신)"| EXP
    PC -->|"✉️ /pole_front_cam/color"| YOLO
    GC -->|"✉️ /gripper_cam/color"| YOLO
    YOLO -->|"✉️ detections_output<br/>(vision_msgs/<br/>Detection2DArray)"| PER
    GC -->|"✉️ /gripper_cam/color<br/>· camera_info"| CPOSE
    CPOSE -->|"✉️ centerpose/detections<br/>컵 6DoF 자세·크기<br/>(vision_msgs/<br/>Detection3DArray)"| PER
    CPOSE -->|"✉️ centerpose/detections"| GS
    classDef nv fill:#ede9fe,stroke:#7c3aed,color:#1b1b1b,stroke-width:2px;
    class VSLAM,NVB,YOLO,CPOSE,UNET,CUMP,RSEG nv;
    style CUM fill:#f5f3ff,stroke:#7c3aed,stroke-width:2px
    style RT fill:#f5f3ff,stroke:#7c3aed,stroke-width:2px
    style NB fill:#f5f3ff,stroke:#7c3aed,stroke-width:2px
    style IR fill:#f5f3ff,stroke:#7c3aed,stroke-width:2px
`;
// 전환안 전용 흐름 — nvblox 지도가 Nav2 컨트롤러를 거쳐 PPO 보정까지 가는 길
const ISAAC_FLOWS: Flow[] = [
  {
    label: '운영 ① SLAM 시작 — cuVSLAM + nvblox로 새 지도 (Isaac)',
    steps: [
      { e: ['CLI>SM'], t: '매핑 모드', d: '✉️ /cmd/map_mode "MAPPING" — cuVSLAM은 새 지도를 쌓기 시작하고, nvblox도 같이 쌓습니다.' },
      { e: ['PC>VSLAM', 'IMB>VSLAM'], t: '위치 추적', d: 'cuVSLAM이 스테레오 IR + IMU로 위치를 추적하며 특징점 지도를 쌓습니다.' },
      { e: ['VSLAM>PS', 'VSLAM>EKF'], t: 'map→odom · 시각 오도메트리', d: '/tf (map→odom 변환)은 Nav2로, 시각 오도메트리는 EKF 입력으로.' },
      { e: ['PC>RSEG', 'JSB>RSEG', 'RSEG>NVB', 'PC>UNET', 'UNET>NVB', 'VSLAM>NVB'], t: 'nvblox가 같이 쌓는다', d: 'robot_segmenter가 depth에서 자기 팔을 지운 뒤, nvblox가 cuVSLAM이 준 카메라 자세(TF)로 제자리에 쌓습니다. PeopleSemSegNet 마스크의 사람 픽셀은 사람 층으로 뺍니다.' },
      { e: ['NVB>COST'], t: '장애물 지도 → costmap', d: '~/combined_map_slice → NvbloxCostmapLayer. 2D /map은 없습니다.' },
      { e: ['CLI>SM', 'SM>EXP'], t: '자동 탐사 시작', d: '✉️ /cmd/operation_mode "EXPLORE" → explorer.' },
      { e: ['COST>EXP', 'EXP>BT'], t: '프론티어 — costmap에서', d: '/map이 없으므로 explorer는 global costmap(nvblox)에서 프론티어를 찾아 🎬 /navigate_to_pose (explorer 수정 필요).' },
      { e: ['EXP>SM'], t: '탐사 끝', d: '✉️ /explore/result "DONE" → state_manager.' },
    ],
  },
  {
    label: '팔 계획 — cuMotion (MoveIt 2 플러그인, Isaac)',
    steps: [
      { e: ['CO>MG'], t: '집기 계획 요청', d: 'coordinator가 지금처럼 move_group에 📞 /plan_kinematic_path. 바깥 인터페이스는 그대로라 coordinator는 바뀌는 게 없습니다.' },
      { e: ['MG>CUMP'], t: '플러그인 → GPU 서버', d: 'move_group의 계획기 플러그인(isaac_ros_cumotion_moveit)이 요청을 🎬 /cumotion/move_group으로 넘깁니다. OMPL 대신 cuRobo가 GPU에서 충돌 없는 매끄러운 궤적을 한 번에 최적화합니다.' },
      { e: ['NVB>CUMP', 'RSEG>NVB'], t: '충돌 세계 = nvblox', d: 'read_esdf_world: true면 cuMotion이 📞 /nvblox_node/get_esdf_and_gradient로 주변 장애물 거리장을 받습니다. 자기 팔은 robot_segmenter가 이미 지워서 장애물로 안 잡힙니다.' },
      { e: ['CO>MG#2', 'MG>JTC'], t: '실행은 그대로', d: '궤적 결과를 받은 move_group이 🎬 /execute_trajectory → /arm_controller/follow_joint_trajectory로 실행합니다. 이후는 지금과 같습니다 (rl_arm_correction · 안전 감시).' },
    ],
  },
  {
    label: '운영 ② 지도 저장 (Isaac — 둘 다, 짝 맞춰)',
    steps: [
      { e: ['SM>VSLAM', 'VSLAM>MAPDIR'], t: '위치용 지도 → 디스크', d: 'visual_slam/save_map — cuVSLAM이 지도 **폴더** 하나를 씁니다: 랜드마크(3D 특징점 + 기술자)와 키프레임 포즈 그래프. 안에 data.mbd 같은 NVIDIA 전용 바이너리가 생기고, 사람이 보는 그림·격자 지도는 아닙니다 (장애물 지도는 nvblox 몫).' },
      { e: ['SM>NVB', 'NVB>MAPDIR'], t: '장애물 지도 → 디스크', d: '📞 /nvblox_node/save_map → nvblox가 .nvblx(TSDF·ESDF)를 같은 지도 폴더에 씁니다. 같은 map 좌표계라 cuVSLAM 지도와 짝으로 보관합니다. 루프 클로저 이중 벽이 없는지 RViz 메시로 확인.' },
    ],
  },
  {
    label: '운영 ③ 저장 지도로 위치추정 시작 (Isaac)',
    steps: [
      { e: ['CLI>SM'], t: '지도 고르기', d: '✉️ /cmd/map_name "거실".' },
      { e: ['SM>VSLAM', 'MAPDIR>VSLAM'], t: '위치 다시 찾기', d: '🎬 visual_slam/load_map_and_localize — 근처 힌트를 주면 빨리 찾습니다.' },
      { e: ['SM>NVB', 'MAPDIR>NVB'], t: '장애물 지도 올리기', d: '📞 /nvblox_node/load_map — 안 본 곳까지 global planner가 압니다 (빈 상태로 시작하면 본 곳만).' },
      { e: ['PC>VSLAM', 'VSLAM>PS', 'VSLAM>NVB'], t: 'map→odom 시작', d: '지도에서 위치를 찾으면 /tf (map→odom 변환)이 나오고, nvblox도 같은 좌표로 이어서 쌓습니다.' },
      { e: ['LMN>BT', 'LMN>PS', 'LMN>CS', 'LMN>BS'], t: 'Nav2 활성', d: '서버들을 configure → activate. 이제 목표를 받습니다.' },
    ],
  },
  {
    label: '운영 ④ 목표 지정 → Nav2 주행 (Isaac — RL 플러그인)',
    steps: [
      { e: ['CO>BT'], t: '목표 보내기', d: '🎬 /navigate_to_pose — coordinator, 또는 RViz Nav2 Goal. 조작 모드 AUTO.' },
      { e: ['BT>PS', 'COST>PS'], t: '경로 계산', d: 'planner_server가 nvblox 층이 칠한 global costmap 위에서 /plan.' },
      { e: ['BT>CS', 'COST>CS', 'EKF>CS'], t: '경로 따라가기', d: '🎬 /follow_path → controller_server.' },
      { e: ['CS>RLN', 'NVB>RLN', 'IMB>RLN'], t: '정책 — nvblox 가상 스캔', d: 'FollowPath 플러그인(rl_nav_controller)이 nvblox 2D ESDF 점구름을 360방향 가상 스캔으로 바꾸고, IMU gyro·현재 속도와 함께 ONNX 정책에 넣어 v·ω를 직접 냅니다. 정책이 없으면 inner DWB가 대신합니다.' },
      { e: ['RLN>TM', 'TM>VS', 'VS>CMN', 'CMN>DDC'], t: '안전 단계 → 바퀴', d: 'controller_server의 FollowPath가 낸 /cmd_vel_nav → twist_mux → velocity_smoother → collision_monitor → diff_drive_controller.' },
      { e: ['DDC>EKF', 'IMB>EKF', 'VSLAM>EKF', 'EKF>CS'], t: '실제 움직임이 돌아온다', d: '/odom·/imu·시각 오도메트리 → EKF → controller_server. 도착하면 SUCCEEDED.' },
    ],
  },
  {
    label: '사람 피하기 — nvblox → Nav2 컨트롤러(RL 플러그인)',
    steps: [
      { e: ['PC>NVB', 'PC>UNET', 'UNET>NVB'], t: '보고, 사람 가르기', d: 'pole_front_cam depth가 nvblox_human_node로, 같은 카메라 컬러는 PeopleSemSegNet으로 갑니다. 사람 픽셀 마스크를 받은 nvblox가 사람 depth만 동적 층으로 뺍니다.' },
      { e: ['VSLAM>NVB', 'VSLAM>PS', 'VSLAM>EKF'], t: '어디서 봤나', d: 'cuVSLAM의 map→odom과 EKF의 odom→base_footprint로 영상 시각의 카메라 자세를 알아야 depth를 지도 위 제자리에 쌓습니다.' },
      { e: ['NVB>COST'], t: '3D 지도 → costmap', d: '고정 ESDF와 사람 occupancy(decay)를 합친 ✉️ ~/combined_map_slice를 NvbloxCostmapLayer가 받아 local·global costmap에 칠합니다. 사람은 지나가면 금방 지워집니다.' },
      { e: ['COST>PS', 'COST>CS', 'BT>CS'], t: 'Nav2가 경로·속도를 정한다', d: 'planner_server가 사람을 돌아가는 경로를, controller_server의 FollowPath(정책 또는 inner DWB)가 그 경로를 따르는 속도를 계산합니다.' },
      { e: ['COST>CS', 'CS>RLN'], t: 'controller_server 안의 RL 플러그인', d: 'FollowPath 자리에 끼운 rl_nav_controller(nav2_core::Controller 상속)가 매 주기 computeVelocityCommands()로 불립니다. costmap(nvblox 레이어 포함)·경로·현재 위치·속도를 토픽이 아니라 함수 인자로 받습니다.' },
      { e: ['NVB>RLN', 'IMB>RLN', 'EKF>CS'], t: 'nvblox 가상 스캔 + PPO 정책', d: '점구름은 nvblox의 2D ESDF height slice를 360방향 최소거리로 바꿔 씁니다 — 사람도 동적 점으로 들어와 장애물로 잡힙니다. 플러그인은 이 관측과 현재 속도·IMU gyro로 PPO 정책(ONNX)을 추론해 v·ω를 직접 냅니다. 주기(20Hz) 안에 추론이 끝나야 합니다.' },
      { e: ['RLN>TM', 'TM>VS', 'VS>CMN', 'CMN>DDC'], t: '정책 뒤에도 안전 단계', d: 'controller_server의 FollowPath가 ✉️ /cmd_vel_nav(정책 v·ω)를 냅니다 → twist_mux → velocity_smoother(가속 제한) → collision_monitor(멈춤 구역) → diff_drive_controller. 정책이 틀려도 뒤 단계가 막습니다.' },
    ],
  },
];

const ISAAC_NOTE = `
### 🟪 Isaac ROS 전환안에서 바뀐 것

| | 현재 (RTAB-Map + YOLO) | 전환안 (Isaac ROS) |
| --- | --- | --- |
| 무엇을 대체하나 | — | **cuVSLAM** = rtabmap의 **위치 부분** (시각 SLAM — ORB-SLAM·VINS 계열을 GPU로) · **nvblox** = costmap의 **3D 장애물 층(voxel)과 2D /map** (Voxblox·OctoMap 계열을 GPU로). rtabmap 한 노드가 하던 일을 위치·지도 두 노드로 나눈 것 |
| 위치추정 입력 | 컬러·depth 2대(rgbd_sync ×3) + 몸 뺀 점구름 + EKF | **pole_front_cam 스테레오 IR(infra1·2) + IMU** — 프로젝터(emitter)를 끄거나 번갈이 |
| map→odom | rtabmap | **visual_slam_node (cuVSLAM)** · 시각 오도메트리는 EKF 입력에 추가 |
| odom→base_footprint | EKF | EKF 그대로 — cuVSLAM의 \`publish_odom_to_base_tf: false\` |
| 장애물 지도 | 2D /map (rtabmap) + voxel·obstacle 레이어 | **nvblox_human_node** (\`human_with_static_tsdf\`) — 고정 ESDF + 사람 occupancy를 합친 \`combined_map_slice\` → Nav2 \`NvbloxCostmapLayer\` (정적 /map 없음) |
| 팔 계획 | move_group + OMPL·pick_ik (CPU) | **move_group 그대로** + 계획기 플러그인 **cuMotion**(isaac_ros_cumotion_moveit) → GPU 서버 \`cumotion/move_group\`(cuRobo). 충돌 세계는 nvblox ESDF(\`get_esdf_and_gradient\`). URDF 외에 **XRDF**(충돌 구 정의) 필요 |
| 자기 몸 지우기 | body_filter (점구름) | **cuMotion robot_segmenter** — depth 영상에서 로봇 몸을 지워 nvblox에 줌 (body_filter는 collision_monitor용으로 남음) |
| 주행 정책 | rl_nav_controller **FollowPath 플러그인** — controller_server 안, ONNX 정책이 v·ω 직접 출력, inner DWB 바이패스 | **같은 rl_nav_controller 플러그인** — Isaac에서도 동일. 입력 점구름만 nvblox \`combined_esdf_pointcloud\`로 바뀐다 |
| PPO가 사람을 아는 법 | 점구름 속 장애물 (body_filter) | nvblox **동적 ESDF 점구름**에 사람이 장애물 점으로 들어와 가상 스캔에 잡힌다 — 별도 사람 관측은 없다 |
| 사람 | 점구름에 섞여 장애물로 남음 (지나가도 costmap에 흔적) | **PeopleSemSegNet**(isaac_ros_unet) 마스크로 사람만 동적 층에 — 고정 지도엔 안 박히고, 지나가면 decay로 금방 사라짐 |
| 지도 저장·전환 | rtabmap.db 하나 · set_mode_* · map_saver | **두 개를 따로**: cuVSLAM \`save_map\`·\`load_map_and_localize\` 액션(위치용 특징점 지도) + nvblox \`~/save_map\`·\`~/load_map\` 서비스(장애물 지도 .nvblx) — 같은 map 좌표계로 짝 맞춰 저장 |
| 물체 검출 | perception 안 YOLO (CPU, model.pt) | **isaac_ros_yolov8** (TensorRT) → perception은 3D화·융합 추적만 |
| 컵 자세 | 없음 (박스 중심 + depth 점) | **CenterPose** — gripper_cam으로 컵 6DoF·크기 → perception · grasp_scorer |
| 사라지는 노드 | — | scan_cam_gate · rgbd_sync ×3 · point_cloud_aggregator · rtabmap · map_saver(+ 관리자) |
| 하드웨어 | CPU로 충분 | **NVIDIA GPU 필수** (Jetson Orin급) · Isaac ROS composable 컨테이너 |

> ⚠️ **확인할 것:** ① emitter를 끄면 같은 카메라의 depth(nvblox·perception)가 나빠진다 — on/off 번갈이 모드나 카메라 분리. ② odom→base를 EKF가 내면 cuVSLAM의 map→odom이 EKF odom과 맞는지 실기 검증. ③ nvblox는 depth 영상을 받으므로 자기 팔은 depth에서 지운다 → **cuMotion robot_segmenter**가 맡는다 (XRDF 충돌 구가 실제 팔과 맞아야 함). ④ 파라미터·토픽 이름은 Isaac ROS 버전마다 다르다. ⑤ **2D /map이 없다** — explorer(프론티어 탐사)는 /map 대신 global costmap(nvblox 레이어)에서 프론티어를 찾도록 고쳐야 하고, map_saver·map_server도 쓰지 않는다.

<p><button class="rd-tab" data-concept="slamstack">📘 cuVSLAM과 nvblox는 어떤 관계? — SLAM 구성 비교 탭</button></p>

아래 설명은 두 구성 공통이고, SLAM 관련 줄은 현재(RTAB-Map) 기준입니다. 흐름 따라가기의 SLAM 단계는 현재 구성 기준이라 전환안에선 일부 선이 강조되지 않습니다.
`;
/**
 * 전체 아키텍처 전환안 만들기 — 원본 md에 replaces를 적용하고, drop 노드가 끝점인 선·class 지정을 빼고,
 * edges를 style 줄 앞에 끼우고, note를 도식 바로 뒤에 붙인다. 원본을 고치면 전환안에도 그대로 반영된다.
 */
const variantMd = (slam: string, drop: Set<string>, replaces: [string | RegExp, string][], edges: string, note: string, dropStyles: string[]) => {
  let md = SECTIONS.arch.md
    .replace('rd-slam-btn active" data-slam="rtab"', 'rd-slam-btn" data-slam="rtab"')
    .replace(`rd-slam-btn" data-slam="${slam}"`, `rd-slam-btn active" data-slam="${slam}"`);
  for (const [from, to] of replaces) md = md.replace(from, to);
  const out: string[] = [];
  for (const l of md.split('\n')) {
    // 빠지는 노드가 끝점인 선은 버린다
    const m = l.match(/^\s*([A-Za-z]\w*)\s+(?:-->|-\.->|==>|---|~~~)/);
    const to = l.match(/(\w+)\s*$/)?.[1];
    if (m && (drop.has(m[1]) || (to && drop.has(to)))) continue;
    // class 지정에서도 빼야 mermaid가 빈 노드를 새로 만들지 않는다
    const c = l.match(/^(\s*class )([\w,]+)( \w+;)$/);
    if (c) {
      const ids = c[2].split(',').filter(id => !drop.has(id));
      if (ids.length) out.push(c[1] + ids.join(',') + c[3]);
      continue;
    }
    if (dropStyles.includes(l.trim())) continue; // 원본 style이 뒤에 오면 전환안 색을 덮는다
    if (l.trim() === 'style EXT fill:#ffffff,stroke:#8A97A0,stroke-dasharray:4 3') out.push(...edges.trimEnd().split('\n'));
    out.push(l);
  }
  return out.join('\n').replace(/(\n```\n)(?![\s\S]*\n```\n)/, `$1${note}`);
};
const RT_STYLE = 'style RT fill:#eef2ff,stroke:#6366f1,stroke-dasharray:4 3';

const ISAAC_ARCH_MD = variantMd('isaac', ISAAC_DROP, [
  [/        subgraph RT\[[\s\S]*?\n        end\n/, ISAAC_RT],
  ['        SD["🛠️ signal_decoder', `        subgraph IR["🟪 Isaac ROS 인지 (TensorRT)"]
            YOLO["📦 isaac_ros_yolov8 ×2<br/>encoder → TensorRT → decoder"]
            CPOSE["📦 CenterPose<br/>컵 6DoF 자세"]
            UNET["📦 isaac_ros_unet<br/>PeopleSemSegNet<br/>사람 픽셀 분할"]
        end
        SD["🛠️ signal_decoder`],
  ['PER["🛠️ perception<br/>YOLO 검출 · 칼만 융합 추적"]', 'PER["🛠️ perception<br/>검출 받아 3D화 · 칼만 융합 추적"]'],
  ['local: voxel · global: static + obstacle', 'local · global: nvblox 레이어'],
  // MoveIt 2는 그대로 — 계획기 플러그인만 OMPL → cuMotion, 계산은 GPU 서버가
  ['        MG["📦 move_group<br/>plan + execute<br/>(use_moveit — bringup 기본 켬)"]', `        MG["📦 move_group (MoveIt 2 그대로)<br/>plan + execute<br/>계획기 플러그인 = cuMotion (OMPL 대신)"]
        subgraph CUM["🟪 Isaac ROS cuMotion (GPU · cuRobo)"]
            CUMP["📦 cumotion_planner_node<br/>cumotion/move_group 액션 서버<br/>URDF + XRDF(충돌 구)"]
            RSEG["📦 cumotion robot_segmenter<br/>depth에서 로봇 몸 지우기"]
        end`],
  // costmap은 nvblox 레이어만 — body_filter 점구름은 collision_monitor로만 간다
  ['    BF -->|"✉️ /pole_front_cam/depth<br/>/color/points_filtered<br/>팔·차체 뺀 점구름<br/>(sensor_msgs/<br/>PointCloud2)"| COST\n', ''],
  ['    BF -->|"✉️ …/points_filtered<br/>360방향 가상 스캔<br/>(sensor_msgs/PointCloud2)"| RLN\n', ''],
  ['planner·controller·behavior·bt (map 필요)', 'planner·controller·behavior·bt (정적 /map 없이)'],
], ISAAC_EDGES, ISAAC_NOTE, [RT_STYLE, 'style S5 fill:#f8fafc,stroke:#94a3b8']);

/*
 * 전체 아키텍처 "2D LiDAR + Cartographer" 전환안 — SLAM만 LiDAR로. 카메라는 인지(YOLO·파지)·3D 장애물용으로 남는다.
 * 매핑은 Cartographer, 운행은 저장 지도 + AMCL (Nav2 표준 운용).
 */
const LIDAR_DROP = new Set(['SCG', 'PRS', 'GRS', 'RXS', 'PCA', 'RTAB']);
const LIDAR_RT = `        subgraph RT["🟦 2D LiDAR SLAM · 위치추정"]
            CART["📦 cartographer_node<br/>매핑 모드 — 스캔 매칭 + 서브맵<br/>+ 루프 클로저"]
            OGN["📦 cartographer_occupancy_grid_node<br/>서브맵 → /map (5cm, 1초)"]
            MSV["📦 map_server<br/>운행 모드 — map.yaml"]
            AMCL["📦 amcl<br/>운행 모드 — 파티클 필터"]
            MS["📦 map_saver<br/>map_saver_server (bringup)"]
            LMS["📦 lifecycle_manager_map_saver"]
        end
`;
const LIDAR_EDGES = `    LDH -->|"🔌 USB 시리얼<br/>(/dev/ttyUSB0)"| LDD
    LDD -->|"✉️ /scan<br/>(sensor_msgs/LaserScan)"| CART
    LDD -->|"✉️ /scan<br/>scan_source=scan 가상 스캔"| RLN
    EKF -->|"✉️ /odometry/filtered → odom<br/>(use_odometry: true)"| CART
    CART -->|"✉️ /submap_list<br/>(cartographer_ros_msgs/<br/>SubmapList)"| OGN
    OGN -->|"✉️ /map<br/>(nav_msgs/OccupancyGrid)"| MS
    OGN -->|"✉️ /map<br/>프론티어 찾기"| EXP
    CART -->|"💾 .pbstream 쓰기<br/>(/write_state · 이어서 매핑용)"| MAPDIR
    MAPDIR -->|"💾 map.yaml · map.pgm 읽기<br/>(운행 모드)"| MSV
    CART -->|"✉️ /tf (map→odom 변환)<br/>(매핑 모드)"| PS
    OGN -->|"✉️ /map<br/>(매핑 모드)"| PS
    MSV -->|"✉️ /map<br/>(transient_local, 운행 모드)"| PS
    MSV -->|"✉️ /map"| AMCL
    LDD -->|"✉️ /scan"| AMCL
    AMCL -->|"✉️ /tf (map→odom 변환) · /amcl_pose<br/>(운행 모드)"| PS
    LMN -.->|"📞 lifecycle<br/>(운행 모드)"| AMCL
    LMN -.->|"📞 lifecycle change_state<br/>(운행 모드)"| MSV
    LDD -->|"✉️ /scan<br/>(obstacle layer — 2D)"| COST
    LDD -->|"✉️ /scan<br/>(polygon 감시)"| CMN
    SM -.->|"📞 /write_state · /finish_trajectory<br/>(cartographer_ros_msgs/srv<br/>지도 작업 저장·끝내기)"| CART
    classDef ld fill:#e0f2fe,stroke:#0284c7,color:#1b1b1b,stroke-width:2px;
    class CART,OGN,MSV,AMCL,LDD ld;
    class LDH hw;
    style RT fill:#f0f9ff,stroke:#0284c7,stroke-width:2px
`;
const LIDAR_NOTE = `
### 🟦 2D LiDAR + Cartographer 전환안에서 바뀐 것

| | 현재 (RTAB-Map + RealSense) | 전환안 (2D LiDAR + Cartographer) |
| --- | --- | --- |
| SLAM 센서 | pole_front_cam·gripper_cam RGB-D (rgbd_sync ×3 · scan_cam_gate · point_cloud_aggregator) | **2D LiDAR 하나** (\\\`/scan\\\`, LaserScan) — 카메라는 SLAM에서 빠짐 |
| 매핑 | rtabmap (매핑 모드, rtabmap.db) | **cartographer_node + occupancy_grid_node** — 지도 작업 파일 \\\`.pbstream\\\` (\\\`/write_state\\\`) + map_saver의 \\\`map.pgm·yaml\\\` |
| 운행 중 위치 | rtabmap (위치추정 모드, 같은 DB) | **map_server + amcl** (저장 지도 위 파티클 필터, Nav2 표준) — Cartographer는 끈다 |
| map→odom | rtabmap | 매핑 땐 cartographer_node, 운행 땐 amcl — **동시에 켜지 않는다** (둘 다 map→odom) |
| odom→base_footprint | EKF | EKF 그대로 — Cartographer \\\`provide_odom_frame: false\\\`, \\\`published_frame: odom\\\` |
| 장애물 | 카메라 점구름(body_filter) → voxel·obstacle | **/scan → obstacle layer**(2D, 넓은 시야) + 카메라 점구름 → voxel(테이블 상판·낮은 물체) 그대로 |
| collision_monitor | 몸 뺀 점구름 | **/scan** 추가 (360° — 뒤·옆도 봄) |
| 인지 | perception (YOLO) | **그대로** — 카메라 2대는 인지·파지·3D 장애물용 |
| 지도 모드 전환 | state_manager → rtabmap set_mode_* (재시작 없이) | 매핑·운행이 다른 노드라 **launch를 다시 띄움** (\\\`map:=slam\\\` ↔ \\\`map:=saved\\\`) |
| 하드웨어 | RealSense 2대 | + **2D LiDAR** (TurtleBot3 LDS-02 · RPLIDAR 등) |

> ⚠️ **확인할 것:** ① 팔(OpenMANIPULATOR-X)이 LiDAR 시야를 가리는 각도는 \\\`laser_filters\\\`(angular bounds)로 지운다 — 안 지우면 자기 팔이 /scan 장애물로 남는다. ② 2D LiDAR는 한 높이만 본다 — 테이블 상판·의자 다리 사이는 못 보므로 카메라 voxel 층을 빼지 않는다. ③ Cartographer \\\`tracking_frame\\\`·\\\`published_frame\\\`이 EKF와 맞는지 (base_footprint · odom, provide_odom_frame: false). ④ AMCL은 시작 위치를 줘야 한다 (2D Pose Estimate 또는 \\\`/initialpose\\\`).

<p><button class="rd-tab" data-concept="slamstack">📘 SLAM 구성 비교 탭 — RTAB-Map · Cartographer · cuVSLAM+nvblox</button> <button class="rd-tab" data-concept="slam">📘 맵핑·위치추정 탭 — map→odom 원리</button></p>

아래 설명은 세 구성 공통이고, SLAM 관련 줄은 현재(RTAB-Map) 기준입니다.
`;
const LIDAR_ARCH_MD = variantMd('lidar', LIDAR_DROP, [
  [/        subgraph RT\[[\s\S]*?\n        end\n/, LIDAR_RT],
  ['            GCH{{"gripper_cam<br/>RealSense RGB-D"}}', '            GCH{{"gripper_cam<br/>RealSense RGB-D"}}\n            LDH{{"2D LiDAR<br/>LDS-02 · RPLIDAR 등"}}'],
  ['        PER["🛠️ perception', '        LDD["📦 LiDAR 드라이버<br/>ld08_driver · rplidar_ros<br/>(+ laser_filters 팔 각도 제거)"]\n        PER["🛠️ perception'],
  ['local: voxel · global: static + obstacle', 'local: voxel(카메라) + obstacle(/scan) · global: static + obstacle'],
  ['    BF -->|"✉️ …/points_filtered<br/>360방향 가상 스캔<br/>(sensor_msgs/PointCloud2)"| RLN\n', ''],
], LIDAR_EDGES, LIDAR_NOTE, [RT_STYLE]);

// 전환안 흐름 — 매핑과 운행
const LIDAR_FLOWS: Flow[] = [
  {
    label: '운영 ① SLAM 시작 — Cartographer로 새 지도 (LiDAR)',
    steps: [
      { e: ['LDH>LDD'], t: 'LiDAR가 돈다', d: '2D LiDAR가 🔌 USB 시리얼로 드라이버에 360° 거리를 보내고, 드라이버가 ✉️ /scan(LaserScan)을 냅니다. 팔에 가리는 각도는 laser_filters로 지웁니다.' },
      { e: ['CLI>SM'], t: '매핑 모드로 기동', d: 'Cartographer와 AMCL은 다른 노드라 실행 중 전환이 아니라 bringup map:=slam으로 다시 띄웁니다 (map_server·AMCL은 안 뜸).' },
      { e: ['LDD>CART', 'EKF>CART'], t: '스캔 매칭', d: 'cartographer_node가 /scan을 지금 서브맵에 맞추고 EKF 오도메트리로 다음 위치를 예측합니다.' },
      { e: ['CART>OGN', 'OGN>PS', 'CART>PS'], t: '지도와 map→odom', d: 'occupancy_grid_node가 서브맵을 /map 격자로 1초마다 그리고, cartographer_node가 /tf (map→odom 변환)을 냅니다. 출발점에 돌아오면 루프 클로저.' },
      { e: ['CLI>SM', 'SM>EXP'], t: '자동 탐사 시작', d: '✉️ /cmd/operation_mode "EXPLORE" → state_manager → explorer.' },
      { e: ['OGN>EXP', 'EXP>BT'], t: '프론티어로 이동', d: 'explorer가 /map에서 프론티어를 골라 🎬 /navigate_to_pose. 실패한 곳은 다시 안 가므로 못 가는 곳만 남으면 일찍 끝납니다.' },
      { e: ['EXP>SM'], t: '탐사 끝', d: '✉️ /explore/result "DONE" → state_manager가 조작 모드를 되돌립니다.' },
    ],
  },
  {
    label: '운영 ② 지도 저장 (LiDAR — 둘 다)',
    steps: [
      { e: ['SM>CART', 'CART>MAPDIR'], t: '작업 파일 .pbstream → 디스크', d: '📞 /write_state → Cartographer가 서브맵·경로·포즈 그래프 전체를 .pbstream으로 씁니다 (이어서 매핑용). 경로는 절대 경로.' },
      { e: ['CLI>MS', 'SIM>MS', 'OGN>MS', 'LMS>MS', 'MS>MAPDIR'], t: 'Nav2용 map.pgm·yaml → 디스크', d: '📞 /map_saver/save_map → map_saver가 /map 한 장을 map.pgm·map.yaml로. **운행(map_server)은 이 파일을 씁니다** — RTAB-Map과 달리 꼭 저장해야 합니다. SLAM이 켜져 있을 때 저장.' },
    ],
  },
  {
    label: '운영 ③ 저장 지도로 위치추정 시작 (LiDAR — AMCL)',
    steps: [
      { e: ['CLI>SM'], t: '운행 모드로 기동', d: 'Cartographer를 끄고 bringup map:=saved map_name:=거실로 다시 띄웁니다. 둘 다 map→odom을 내므로 동시에 켜지 않습니다.' },
      { e: ['LMN>MSV', 'LMN>AMCL'], t: 'map_server · AMCL 켜기', d: 'lifecycle_manager_navigation이 map_server와 amcl을 configure → activate.' },
      { e: ['MAPDIR>MSV', 'MSV>PS', 'MSV>AMCL'], t: '저장 지도 올리기', d: 'map_server가 map.yaml을 ✉️ /map(transient_local)으로 — planner의 static 층과 AMCL이 받습니다.' },
      { e: ['LDD>AMCL'], t: '처음 위치가 꼭 필요', d: 'RViz 2D Pose Estimate(✉️ /initialpose)로 대략 위치를 주면 AMCL이 /scan을 지도와 맞춰 파티클을 좁힙니다. 조금 움직여야 수렴합니다.' },
      { e: ['AMCL>PS'], t: 'map→odom 시작', d: 'amcl이 /tf (map→odom 변환)과 /amcl_pose를 냅니다. 매핑 때 Cartographer가 내던 바로 그 자리입니다.' },
      { e: ['LMN>BT', 'LMN>PS', 'LMN>CS', 'LMN>BS'], t: 'Nav2 활성', d: 'planner·controller·behavior·bt가 active — 이제 목표를 받습니다.' },
    ],
  },
  {
    label: '운영 ④ 목표 지정 → Nav2 주행 (LiDAR)',
    steps: [
      { e: ['CO>BT'], t: '목표 보내기', d: '🎬 /navigate_to_pose — coordinator, 또는 RViz Nav2 Goal(✉️ /goal_pose). 조작 모드 AUTO.' },
      { e: ['LDD>COST'], t: '장애물은 /scan + 카메라', d: '/scan은 obstacle 층(2D, 360°)으로, 카메라 점구름은 voxel 층(LiDAR 높이에 없는 테이블 상판 등)으로 costmap에 쌓입니다.' },
      { e: ['BT>PS', 'COST>PS'], t: '경로 계산', d: '🎬 /compute_path_to_pose → planner_server가 global costmap(static 지도 + 장애물) 위에서 /plan.' },
      { e: ['BT>CS', 'COST>CS', 'EKF>CS'], t: '경로 따라가기', d: '🎬 /follow_path → controller_server가 20Hz로 속도 계산.' },
      { e: ['CS>RLN', 'LDD>RLN'], t: '주행 정책 — /scan 입력', d: 'FollowPath 플러그인(rl_nav_controller)이 LiDAR /scan을 그대로 가상 스캔으로 쓰도록 scan_source:=scan으로 설정합니다 (기본은 점구름 points). 정책이 없으면 inner DWB가 대신합니다.' },
      { e: ['RLN>TM', 'TM>VS', 'VS>CMN', 'LDD>CMN', 'CMN>DDC'], t: '안전 단계 → 바퀴', d: 'twist_mux → velocity_smoother → collision_monitor(/scan으로 360° 감시) → /cmd_vel → diff_drive_controller.' },
      { e: ['DDC>EKF', 'IMB>EKF', 'EKF>CS'], t: '실제 움직임이 돌아온다', d: '/odom·/imu → EKF → /odometry/filtered → controller_server. 도착하면 SUCCEEDED.' },
    ],
  },
];

const VARIANTS = { isaac: { md: ISAAC_ARCH_MD, flows: ISAAC_FLOWS }, lidar: { md: LIDAR_ARCH_MD, flows: LIDAR_FLOWS } };
type Slam = 'rtab' | keyof typeof VARIANTS;

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
    private slam: Slam = 'rtab'; // 전체 아키텍처 SLAM·인지 구성 (?slam=isaac|lidar)
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
      @swcAppRouteQueryParam('slam') slamParam: string | null,
    ) {
      if (concept !== 'design') return;
      const sec: Section = secParam && secParam in SECTIONS ? (secParam as Section) : 'overview';
      const node = sec === 'catalog' && nodeParam && NODE_IDS.has(nodeParam) ? nodeParam : undefined;
      const from = sec === 'catalog' && fromParam && fromParam in SECTIONS && fromParam !== 'catalog' ? (fromParam as Section) : undefined;
      const slam: Slam = slamParam && slamParam in VARIANTS ? (slamParam as Slam) : 'rtab';
      const slamChanged = sec === 'arch' && slam !== this.slam;
      this.slam = slam;
      if (sec === this.section && node === this.focusNode && from === this.back && !slamChanged) return;
      const first = this.section === undefined;
      const sameSection = sec === this.section && from === this.back && !slamChanged;
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
      if (sec === 'arch' && this.slam !== 'rtab') q.set('slam', this.slam);
      return { path: `/ros2?${q.toString()}`, scrollToTop: false };
    }

    /** 전체 아키텍처 SLAM·인지 구성 전환 — 같은 자리에서 도식만 바뀌도록 스크롤 위치를 기억해 둔다 */
    @swcAppRouteGo
    private goSlam(slam: Slam) {
      if (slam === this.slam) return false;
      this.scrollMemo.set(RosDesign.key('arch'), w.scrollY);
      return { path: `/ros2?concept=design&sec=arch${slam === 'rtab' ? '' : `&slam=${slam}`}`, scrollToTop: false };
    }

    @addEventListener('.rd-slam-btn', 'click', { delegate: true })
    onSlam(e: Event) {
      const b = (e.target as HTMLElement).closest('.rd-slam-btn') as HTMLElement;
      if (b?.dataset.slam) this.goSlam(b.dataset.slam as Slam);
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
      const v = sec === 'arch' && this.slam !== 'rtab' ? VARIANTS[this.slam] : undefined;
      await markdownParse(el, v?.md ?? SECTIONS[sec].md);
      if (sec !== this.section) return;
      this.bindLinks(el, SECTIONS[sec].links, SECTIONS[sec].nodes);
      // 전환안: 운영 ①~④·위치 추정은 그 구성의 노드로 만든 것으로 바꿔 끼운다 (RTAB-Map 기준 것은 선이 없어 강조가 안 됨)
      this.mountFlow(el, v ? [...v.flows, ...ARCH_FLOWS.filter(f => !/^(운영|위치 추정)/.test(f.label))] : SECTIONS[sec].flows);
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
      // 확대 바(.mm-fig) 밖에 두어야 둘 다 top:0에 붙어도 겹치지 않는다
      ((diagram.closest('.mm-fig') as HTMLElement | null) ?? diagram).before(bar);
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
        RosDesign.syncZoomTop(bar, false);
        return;
      }
      const step = flow.steps[i];
      const edges = step.e.map(flowEdge);
      const lit = selectEdges(svg, edges.map(x => x.id));
      const ends = new Set(edges.flatMap(x => [x.from, x.to]));
      svg.querySelectorAll('g.node').forEach(g => { if (ends.has(RosDesign.nodeKey(svg, g))) RosDesign.markNode(g, true); });
      cap.innerHTML = `<b>${i + 1}. ${step.t}</b> ${step.d}`
        + (lit.length ? '' : ' <span class="rd-flow-miss">⚠️ 이 구성의 도식에는 이 단계의 선이 없습니다 (현재 구성 RTAB-Map 기준 흐름).</span>');
      RosDesign.syncZoomTop(bar, true);
      if (scroll && lit.length) this.scrollToEdges(lit, bar);
    }

    /** 흐름 바가 화면 위에 붙는 동안 확대 바가 그 아래에서 붙도록 top을 흐름 바 높이만큼 내린다 */
    private static syncZoomTop(flowBar: HTMLElement, on: boolean) {
      const fig = flowBar.nextElementSibling as HTMLElement | null;
      if (fig?.classList.contains('mm-fig'))
        fig.style.setProperty('--mm-zoom-top', on ? `${Math.ceil(flowBar.getBoundingClientRect().height) + 4}px` : '0px');
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
          .rd-flow-miss { color:#b45309; font-weight:700; }
          .rd-slam { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:10px 0 !important; }
          .rd-slam-btn { padding:6px 14px; border-radius:16px; border:1.5px solid #c4b5fd; background:#fff; color:#3b0764; font:inherit; font-size:12.5px; font-weight:800; cursor:pointer; }
          .rd-slam-btn.active { background:#7c3aed; border-color:#7c3aed; color:#fff; }
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
          <b>컵 가져오기 로봇</b>(TurtleBot3 Waffle Pi + OpenMANIPULATOR-X + pole_front_cam·gripper_cam)의 <b>실전 노드 설계 최종본</b>입니다.
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
            <span>🧩 플러그인 (ROS 노드 아님 — pluginlib로 부모 프로세스에 로드)</span>
            <span>📦 제공 패키지 노드 (ROS 2·Nav2·MoveIt·ros2_control 등)</span>
          </div>
          <div class="rd-legend"><b class="rd-lg-h">선</b>
            <span><svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><line x1="2" y1="8" x2="24" y2="8" stroke="#334155" stroke-width="1.5"/><path d="M23,4 L29,8 L23,12z" fill="#334155"/></svg>실선 = 토픽·데이터 흐름</span>
            <span><svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><line x1="2" y1="8" x2="23" y2="8" stroke="#334155" stroke-width="3.5"/><path d="M22,3 L29,8 L22,13z" fill="#334155"/></svg>굵은 선 = 액션 (goal → feedback → result)</span>
            <span><svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><line x1="2" y1="8" x2="24" y2="8" stroke="#334155" stroke-width="1.5" stroke-dasharray="2 2"/><path d="M23,4 L29,8 L23,12z" fill="#334155"/></svg>점선 = 서비스·파라미터·피드백·매핑 단계 전용</span>
            <span><svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><line x1="2" y1="5" x2="23" y2="5" stroke="#334155" stroke-width="1.5"/><path d="M22,2 L28,5 L22,8z" fill="#334155"/><line x1="7" y1="12" x2="28" y2="12" stroke="#334155" stroke-width="1.5"/><path d="M8,9 L2,12 L8,15z" fill="#334155"/></svg>오가는 내용이 다르면 화살표 2개 (예: 버스 쓰기 SyncWrite ↓ · 읽기 SyncRead ↑)</span>
            <span>화살표 방향 = 데이터가 흐르는 방향</span>
            <span>👆 선·라벨에 마우스 = 강조 · 클릭 = 선택 고정 (여러 개, 다시 누르면 해제, 빈 곳 누르면 전체 해제)</span>
          </div>
          <div class="rd-legend"><b class="rd-lg-h">라벨</b>
            <span>✉️ 토픽</span>
            <span>🎬 액션</span>
            <span>📞 서비스</span>
            <span>🔌 시리얼·USB</span>
            <span>🔗 같은 프로세스 안 — 토픽 아님 (ros2_control 인터페이스 · costmap · 플러그인 호출), 화살표 = 데이터 방향</span>
            <span>💾 파일</span>
            <span>🗣️ 사람 → 로봇 (말·텍스트) · ⌨️ 키보드</span>
            <span>🔊 로봇 → 사람 (안내 — 지금은 user_input 터미널 텍스트)</span>
            <span>형식: <b>이모지 이름 (메시지 타입)</b></span>
            <span>/tf (A→B 변환) = <b>/tf 토픽</b>에 실린 A→B 프레임 변환 (토픽 이름은 /tf 하나)</span>
            <span>extends X = <b>기본 클래스 X를 상속한 플러그인</b> — ROS 노드가 아니라 부모 노드(controller_manager · controller_server) 안에 pluginlib로 로드됨</span>
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
