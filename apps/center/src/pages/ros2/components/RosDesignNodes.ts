import { toMsgId } from './RosMsgsData';
import { PARAM_GROUPS } from './RosParamsData';

// 실전노드설계 탭의 "노드 사전" 데이터와 렌더러.
// 도식의 노드를 누르면 이 카드로 스크롤된다 (RosDesign의 nodes 맵 → NODE_DOCS id).
// 정본: lv2_module6/ros2_ws/src (코드·config·launch) > documents/API.md — 카드가 다르면 코드가 맞다.

/** [방식, 이름, 메시지 타입, 상대 노드, 비고] */
type IO = [string, string, string, string, string?];

export type NodeDoc = {
  id: string;
  name: string;
  tag: 'custom' | 'provided';
  pkg: string;
  form: string;
  group: string;
  role: string;
  inputs: IO[];
  outputs: IO[];
  params?: string[];
  notes?: string[];
  setup?: string[];   // 🔧 직접 연결·설정할 것 (단계)
  guide?: string;     // 자세한 설명이 있는 실전노드설계 섹션 id
};

const TW = 'geometry_msgs/TwistStamped';
const PTS = '/pole_front_cam/depth/color/points';
const PTF = '/pole_front_cam/depth/color/points_filtered';
const LATCH = 'reliable + transient_local';

export const NODE_DOCS: NodeDoc[] = [
  // ── 센서·인지
  {
    id: 'realsense_pole', name: 'realsense2_camera (pole_front_cam)', tag: 'provided', pkg: 'realsense2_camera', form: 'ROS 2 노드', group: '센서·인지',
    role: '차체 뒤 폴 위에서 앞을 18° 내려다보는 RealSense. 컬러 영상, 컬러에 정렬된 depth, 점구름을 발행한다. 인지·SLAM·장애물(costmap·collision_monitor)이 모두 여기서 나온다.',
    inputs: [
      ['🔌 장치', 'pole_front_cam RealSense', 'librealsense2 (USB 3)', '카메라 하드웨어', 'serial_no로 지정 (빈 값 = 첫 장치, 2대면 반드시 지정)'],
    ],
    outputs: [
      ['✉️ 발행', '/pole_front_cam/color/image_raw', 'sensor_msgs/Image (rgb8)', 'perception, rgbd_sync, vlm_task_planner', '15Hz · best_effort (SENSOR_DATA)'],
      ['✉️ 발행', '/pole_front_cam/color/camera_info', 'sensor_msgs/CameraInfo', 'perception, rgbd_sync, state_manager', '내부 파라미터 · state_manager는 연결 확인용'],
      ['✉️ 발행', '/pole_front_cam/aligned_depth_to_color/image_raw', 'sensor_msgs/Image (16UC1, mm)', 'perception, rgbd_sync', '컬러 픽셀과 1:1 정렬된 depth'],
      ['✉️ 발행', PTS, 'sensor_msgs/PointCloud2', 'body_filter', 'decimation 2 (점 1/4) · 자기 몸을 뺀 뒤 Nav2로'],
    ],
    params: ['serial_no (launch 인자 pole_front_cam_serial)', 'camera_name: pole_front_cam', 'rgb_camera.color_profile: 640x360x15', 'depth_module.depth_profile: 640x360x15', 'color_qos · depth_qos: SENSOR_DATA', 'align_depth.enable: true', 'pointcloud.enable: true (Jetson은 pointcloud__neon_.enable)', 'decimation_filter.enable: true · filter_magnitude: 2', 'enable_infra1/2: false', 'publish_tf: false'],
    notes: ['카메라 프레임 TF는 URDF(robot_state_publisher)가 낸다 — 드라이버 publish_tf는 끔.', 'IR 스트림을 켜 두면 두 카메라가 USB 대역을 나눠 써 depth가 overflow로 막힌다 → 끔.', 'respawn: true — 카메라를 나중에 꽂아도 다시 잡는다.', 'depth 단위는 16UC1 = 밀리미터. 32FC1(미터)로 바꾸는 노드와 섞지 않는다.'],
  },
  {
    id: 'realsense_gripper', name: 'realsense2_camera (gripper_cam)', tag: 'provided', pkg: 'realsense2_camera', form: 'ROS 2 노드', group: '센서·인지',
    role: '그리퍼에 달린 RealSense. 파지 직전 근접 영상, 퍽 윗면 AprilTag 읽기(inspect)를 맡고, 지도 만들 땐 팔을 스캔 자세에 고정해 두 번째 SLAM 카메라로 쓴다.',
    inputs: [
      ['🔌 장치', 'gripper_cam RealSense', 'librealsense2 (USB 3)', '카메라 하드웨어', 'pole_front_cam과 다른 serial_no'],
    ],
    outputs: [
      ['✉️ 발행', '/gripper_cam/color/image_raw', 'sensor_msgs/Image (rgb8)', 'perception, rgbd_sync, vlm_task_planner', '15Hz · best_effort'],
      ['✉️ 발행', '/gripper_cam/color/camera_info', 'sensor_msgs/CameraInfo', 'perception, rgbd_sync, state_manager', ''],
      ['✉️ 발행', '/gripper_cam/aligned_depth_to_color/image_raw', 'sensor_msgs/Image (16UC1, mm)', 'perception, scan_cam_gate', 'RTAB-Map에는 scan_cam_gate를 거쳐서만'],
      ['✉️ 발행', '/gripper_cam/depth/color/points', 'sensor_msgs/PointCloud2', 'grasp_scorer, scan_cam_gate', '기본 꺼짐 (gripper_cam_pointcloud:=true일 때만)'],
    ],
    params: ['serial_no (launch 인자 gripper_cam_serial)', 'camera_name: gripper_cam', 'rgb_camera.color_profile: 640x360x15', 'align_depth.enable: true', 'pointcloud.enable: false (기본)', 'publish_tf: false'],
    notes: ['D435 계열은 최소 측정 거리 약 0.2~0.3m — 그리퍼가 퍽에 바짝 붙으면 depth가 빈다.', '움직이는 카메라라 영상 시각(header.stamp)의 TF로 변환해야 위치가 맞는다.'],
  },
  {
    id: 'perception', name: 'perception', tag: 'custom', pkg: 'perception', form: 'ROS 2 노드 (Python · YOLO)', group: '센서·인지',
    role: '두 카메라 영상에서 YOLO로 물체를 검출하고, 박스 중심 + 정렬 depth로 3D 점을 구해 칼만 필터로 두 카메라를 융합 추적한다(odom 기준 추적, 발행만 map). 퍽 색·자세·윗면 AprilTag, 장소 태그, 바코드·QR, 신호등 상태까지 읽어 id로 내보낸다.',
    inputs: [
      ['✉️ 구독', '/pole_front_cam/color/image_raw', 'sensor_msgs/Image', 'realsense2_camera (pole_front_cam)', 'depth와 ApproximateTime 동기화 (sync_slop)'],
      ['✉️ 구독', '/pole_front_cam/aligned_depth_to_color/image_raw', 'sensor_msgs/Image', 'realsense2_camera (pole_front_cam)', ''],
      ['✉️ 구독', '/pole_front_cam/color/camera_info', 'sensor_msgs/CameraInfo', 'realsense2_camera (pole_front_cam)', '픽셀 → 3D 역투영'],
      ['✉️ 구독', '/gripper_cam/color/image_raw', 'sensor_msgs/Image', 'realsense2_camera (gripper_cam)', '같은 방식 — 가까이서 본 관측이 더 무거움'],
      ['✉️ 구독', '/gripper_cam/aligned_depth_to_color/image_raw', 'sensor_msgs/Image', 'realsense2_camera (gripper_cam)', ''],
      ['✉️ 구독', '/gripper_cam/color/camera_info', 'sensor_msgs/CameraInfo', 'realsense2_camera (gripper_cam)', ''],
      ['✉️ 구독', '/tf, /tf_static', 'tf2_msgs/TFMessage', 'robot_state_publisher, rtabmap, ekf', '영상 시각의 카메라 → odom, 발행 순간 map ← odom · 자기 팔 거르기'],
    ],
    outputs: [
      ['✉️ 발행', '/tracked_objects', 'perception/TrackedObjectArray', 'vlm_task_planner, coordinator, grasp_scorer, signal_decoder', '10Hz · reliable · frame map'],
      ['✉️ 발행', '/perception/<cam>/detections', 'perception/TrackedObjectArray', '시뮬레이터·디버그', '융합 전 카메라별 검출 (카메라당 ≤4Hz)'],
      ['✉️ 발행', '/mission/qr', 'std_msgs/String', 'vlm_task_planner', '바코드·QR 작업 지시 — 바뀔 때만 · ' + LATCH],
      ['✉️ 발행', '/diagnostics', 'diagnostic_msgs/DiagnosticArray', 'diagnostic_aggregator', ''],
    ],
    params: ['rate_hz: 10.0', 'model_path (비면 share/perception/model/model.pt)', 'confidence: 0.4', 'imgsz: 416', 'device: cpu · cpu_threads: 2', 'track_frame: odom', 'match_dist: 0.4', 'self_filter: true · self_radius: 0.06 · body_radius: 0.2', 'miss_count: 3 · remember_min_hits: 3', 'puck_colors: [red, yellow, green, blue]'],
    notes: ['기억하는 물체(퍽·목표 구역·QR 판·location·barcode)는 안 보여도 남기고, 잘 보이는 자리에서 miss_count번 연속 못 찾을 때만 지운다. 사람·장애물·신호등은 2초 안 보이면 삭제.', '퍽 윗면 16mm 태그는 gripper_cam이 위에서 봐야 읽힌다 (coordinator inspect).', '포인트 클라우드는 쓰지 않는다 — 객체 단위 융합. 필드 뜻은 documents/API.md.', '모델 파일이 없으면 빈 목록 + 진단 WARN.'],
  },
  {
    id: 'body_filter', name: 'body_filter', tag: 'custom', pkg: 'perception', form: 'ROS 2 노드 (C++)', group: '센서·인지',
    role: 'pole_front_cam 점구름에서 로봇 자기 몸(팔·차체·적재함)에 찍힌 점을 뺀다. 빼지 않으면 Nav2 costmap·collision_monitor가 자기 팔을 장애물로 보고 멈춘다. URDF collision 모양을 링크마다 TF로 옮겨 그 상자(+ padding) 안 점을 버린다.',
    inputs: [
      ['✉️ 구독', PTS, 'sensor_msgs/PointCloud2', 'realsense2_camera (pole_front_cam)', 'input_topic · SensorData QoS'],
      ['✉️ 구독', '/robot_description', 'std_msgs/String', 'robot_state_publisher', 'URDF <collision> (box · cylinder · sphere · mesh 경계 상자) · transient_local'],
      ['✉️ 구독', '/tf', 'tf2_msgs/TFMessage', 'robot_state_publisher', '점구름 시각의 링크 위치'],
    ],
    outputs: [
      ['✉️ 발행', PTF, 'sensor_msgs/PointCloud2', 'costmap, collision_monitor, point_cloud_aggregator', 'output_topic · 자기 몸 뺀 점구름'],
      ['✉️ 발행', '/diagnostics', 'diagnostic_msgs/DiagnosticArray', 'diagnostic_aggregator', ''],
    ],
    params: ['input_topic: ' + PTS, 'output_topic: ' + PTF, 'padding: 0.03 (m)', 'stride: 4 (4점당 1점)'],
    notes: ['Lyrical엔 robot_body_filter가 없고 pcl_ros CropBox는 고정 상자 하나뿐이라 직접 작성.'],
  },
  {
    id: 'robot_state_publisher', name: 'robot_state_publisher', tag: 'provided', pkg: 'robot_state_publisher', form: 'ROS 2 노드', group: '센서·인지',
    role: 'URDF와 관절 각도로 로봇 몸의 모든 링크 좌표(TF)를 계산해 낸다. 카메라·팔·그리퍼 위치가 전부 여기서 이어진다.',
    inputs: [
      ['✉️ 구독', '/joint_states', 'sensor_msgs/JointState', 'joint_state_broadcaster', '바퀴·joint1~5·gripper_left_joint (오른쪽 손가락은 mimic)'],
      ['⚙️ 파라미터', 'robot_description', 'URDF 문자열 (xacro 결과)', 'launch (ros_system)', 'lv2_module6/urdf/<urdf>/urdf.xacro · mock_hardware·mock_effort·port 인자'],
    ],
    outputs: [
      ['✉️ 발행', '/tf', 'tf2_msgs/TFMessage', '전체', '움직이는 관절 (팔·바퀴)'],
      ['✉️ 발행', '/tf_static', 'tf2_msgs/TFMessage', '전체', '고정 링크 (카메라·optical 프레임·imu_link) · transient_local'],
      ['✉️ 발행', '/robot_description', 'std_msgs/String', 'controller_manager, body_filter', 'transient_local — controller_manager는 이 토픽에서 URDF를 받는다'],
    ],
    notes: ['urdf:=<폴더> 인자로 모델을 고른다 (기본 default). move_group은 같은 xacro를 파라미터로 따로 받는다.'],
  },

  // ── 계획·임무
  {
    id: 'voice_ui', name: 'voice_ui (미구현 — user_input이 대신)', tag: 'custom', pkg: '없음 (설계만)', form: '설계 자리 — 실제 노드 없음', group: '계획·임무',
    role: '초기 설계의 음성 입출력 노드. 구현에서는 만들지 않았고, 텍스트 입력 노드 user_input(plan)이 이 자리를 맡는다. 음성(STT·TTS)은 실제 입력 UI가 정해지면 user_input에 붙일 예정.',
    inputs: [
      ['🗣️ 사람', '음성 명령', '마이크 오디오', '사람', '미구현'],
      ['✉️ 구독', '/robot/say', 'std_msgs/String', 'coordinator', '지금은 user_input이 받음'],
      ['✉️ 구독', '/task/status', 'plan/TaskStatus', 'coordinator', '지금은 user_input이 받음'],
    ],
    outputs: [
      ['✉️ 발행', '/cmd/user_command', 'std_msgs/String', 'vlm_task_planner', '지금은 user_input이 냄'],
      ['🔊 사람', '음성 안내', 'TTS → 스피커', '사람', '미구현'],
    ],
    notes: ['도식에서 voice_ui를 눌러도 실제로 도는 노드는 user_input이다.'],
  },
  {
    id: 'user_input', name: 'user_input', tag: 'custom', pkg: 'plan', form: 'ROS 2 노드 (C++)', group: '계획·임무',
    role: '외부 텍스트 명령 입력 (설계의 voice_ui 자리). command 파라미터(시작 후 한 번) 또는 터미널 표준입력(한 줄 = 명령 하나)을 /cmd/user_command로 보내고, /robot/say·/task/status를 로그로 보여 준다.',
    inputs: [
      ['⌨️ 사람', '텍스트 명령', 'command 파라미터 · 표준입력', '사람', '예: "빨간 퍽을 목표 구역으로 옮겨"'],
      ['✉️ 구독', '/robot/say', 'std_msgs/String', 'coordinator', '보여 줄 문장'],
      ['✉️ 구독', '/task/status', 'plan/TaskStatus', 'coordinator', '진행 표시 · ' + LATCH],
    ],
    outputs: [
      ['✉️ 발행', '/cmd/user_command', 'std_msgs/String', 'vlm_task_planner', '명령마다 · reliable'],
    ],
    params: ['command: "" (bringup 인자 command:=)'],
    notes: ['테스트베드 통제실은 faker input_manager로 /cmd/user_command를 직접 넣을 수도 있다.'],
  },
  {
    id: 'vlm_task_planner', name: 'vlm_task_planner', tag: 'custom', pkg: 'plan', form: 'ROS 2 노드 (C++)', group: '계획·임무',
    role: '사람 명령·바코드 지시와 인식 결과를 VLM(호스트 ai-service)에 보내 "무엇을 어떤 순서로" 할지만 정한다. 신호등 암호 미션은 VLM 없이 규칙으로 계획한다. 실행 세부(파지점, 속도)는 정하지 않는다.',
    inputs: [
      ['✉️ 구독', '/cmd/user_command', 'std_msgs/String', 'user_input', '명령마다'],
      ['✉️ 구독', '/mission/qr', 'std_msgs/String', 'perception', '장소 바코드 작업 지시 — VLM이 해석 · ' + LATCH],
      ['✉️ 구독', '/mission/signal', 'plan/MissionSignal', 'signal_decoder', '신호등 암호 미션 — 규칙으로 (inspect → 번호 합 조합 → 적재함 → 목적지 장소 → 수납 확인)'],
      ['✉️ 구독', '/tracked_objects', 'perception/TrackedObjectArray', 'perception', '최신 목록을 프롬프트에 넣음'],
      ['✉️ 구독', '/pole_front_cam/color/image_raw', 'sensor_msgs/Image', 'realsense2_camera (pole_front_cam)', '최신 1장만 보관 → VLM 호출 때'],
      ['✉️ 구독', '/gripper_cam/color/image_raw', 'sensor_msgs/Image', 'realsense2_camera (gripper_cam)', '최신 1장만 보관'],
      ['✉️ 구독', '/task/status', 'plan/TaskStatus', 'coordinator', 'FAILED면 재계획 (manual·explore·estop·cancelled 이유는 제외)'],
      ['✉️ 구독', '/state/operation_mode', 'std_msgs/String', 'state_manager', '주기 수납 확인은 AUTO일 때만'],
      ['✉️ 구독', '/tf', 'tf2_msgs/TFMessage', 'rtabmap, ekf', 'map→base_footprint (가까운 퍽 우선)'],
    ],
    outputs: [
      ['✉️ 발행', '/task/sub_goals', 'plan/SubGoalArray', 'coordinator', LATCH],
      ['🌐 외부', 'POST /plan', 'HTTP (JSON)', 'ai-service (호스트)', 'vlm_endpoint가 비면 템플릿 고정 · 실패·타임아웃·검증 실패도 템플릿 폴백'],
    ],
    params: ['vlm_endpoint: "" (예: http://127.0.0.1:8000)', 'vlm_timeout_s: 120.0', 'max_replans: 1', 'tray_capacity: 4', 'verify_period_s: 60 (0 = 주기 확인 끔)', 'verify_radius_m: 0.20'],
    notes: ['허용 skill: navigate · pick · place · inspect · say. target = 물체 id · "x,y" · "tray"(적재함) · 말할 내용.',
      '수납 확인 — 신호등 미션 옮기기가 끝나면 바로, 그 뒤 verify_period_s마다 (AUTO · 하던 계획 없을 때) 목적지로 가서 옮긴 번호가 verify_radius_m 안에 다 있는지 본다. 다른 곳에 보이면 다시 옮기고, 안 보이면 say. 확인 계획이 실패하면 재계획 없이 다음 주기에.'],
  },
  {
    id: 'signal_decoder', name: 'signal_decoder', tag: 'custom', pkg: 'plan', form: 'ROS 2 노드 (C++)', group: '계획·임무',
    role: '신호등 암호 미션 — 신호등 깜빡임(색·횟수·순서)을 시간축으로 쌓아 1단계(색·개수) · 2단계(점수 합 = 번호 합) · 3단계(노랑 횟수 → 목적지 태그)를 읽는다.',
    inputs: [
      ['✉️ 구독', '/tracked_objects', 'perception/TrackedObjectArray', 'perception', 'traffic_light의 color (red·yellow·green·off·all)'],
    ],
    outputs: [
      ['✉️ 발행', '/mission/signal', 'plan/MissionSignal', 'vlm_task_planner', '확정될 때마다 · ' + LATCH],
      ['✉️ 발행', '/diagnostics', 'diagnostic_msgs/DiagnosticArray', 'diagnostic_aggregator', ''],
    ],
    params: ['separator_s: 2.0 (세 색 동시 = 단계 구분)', 'gap_s: 3.0', 'min_on_s: 0.15', 'score_red/yellow/green: 1', 'dest_tags: [12, 13, 14]', 'confirm: 1'],
    notes: ['단계 구분·점수·반복은 MISSION §6 미정 — 제안값이 기본, plan.yaml에서 바꾼다.', '끝난 단계 셋이 [한 색만 · 아무거나 · 노랑만 1~3번] 모양일 때만 답 — 반복 신호의 중간부터 봐도 1단계를 찾는다.'],
  },
  {
    id: 'coordinator', name: 'coordinator', tag: 'custom', pkg: 'plan', form: 'ROS 2 노드 (C++)', group: '계획·임무',
    role: 'VLM 계획을 검증하고 Nav2·MoveIt·그리퍼에 실행을 맡기는 유일한 실행권자. 대상 id 확인, 멀면 먼저 다가가기, 파지 후보 재시도, 적재함(tray) 싣기·꺼내기, inspect, 연속 실패 시 알리고 정지 같은 실행 규칙을 지킨다.',
    inputs: [
      ['✉️ 구독', '/task/sub_goals', 'plan/SubGoalArray', 'vlm_task_planner', LATCH],
      ['✉️ 구독', '/tracked_objects', 'perception/TrackedObjectArray', 'perception', '대상 id 존재 확인, 목표 좌표 계산'],
      ['✉️ 구독', '/arm_safety_event', 'control/ArmSafetyEvent', 'arm_safety_monitor', '접촉 → 단계 실패 (arm_contact)'],
      ['✉️ 구독', '/state/operation_mode', 'std_msgs/String', 'state_manager', 'AUTO가 아니면 진행 중 취소 + 새 계획 거부'],
      ['✉️ 구독', '/state/emergency', 'std_msgs/Bool', 'state_manager', '비상정지면 취소 (estop)'],
      ['✉️ 구독', '/state/map_mode', 'std_msgs/String', 'state_manager', 'MAPPING이면 작업 없을 때 팔을 스캔 자세로'],
      ['✉️ 구독', '/joint_states', 'sensor_msgs/JointState', 'joint_state_broadcaster', '시작 자세·스캔 자세 도달 확인'],
      ['✉️ 구독', '/tf', 'tf2_msgs/TFMessage', 'rtabmap, ekf', 'map→base_footprint (접근 거리·자세)'],
    ],
    outputs: [
      ['🎬 요청', '/navigate_to_pose', 'nav2_msgs/action/NavigateToPose', 'bt_navigator', '이동·접근'],
      ['📞 호출', '/plan_kinematic_path', 'moveit_msgs/srv/GetMotionPlan', 'move_group', '그룹 arm · 실패 시 arm_plan_tries번 다시'],
      ['🎬 요청', '/execute_trajectory', 'moveit_msgs/action/ExecuteTrajectory', 'move_group', '계획 실행 → arm_controller'],
      ['🎬 요청', '/gripper_controller/gripper_cmd', 'control_msgs/action/ParallelGripperCommand', 'gripper_controller', '벌리기·닫기 (MoveIt을 거치지 않고 직접)'],
      ['✉️ 발행', '/arm_controller/joint_trajectory', 'trajectory_msgs/JointTrajectory', 'arm_controller', '기동 직후 시작 자세 1회 (MoveIt 없이)'],
      ['📞 호출', '/score_grasps', 'ml/srv/ScoreGrasps', 'grasp_scorer', 'pick 직전 1회'],
      ['📞 호출', '/clear_octomap', 'std_srvs/srv/Empty', 'move_group', 'pick 직전'],
      ['📞 호출', '/apply_planning_scene', 'moveit_msgs/srv/ApplyPlanningScene', 'move_group', 'pick 전 장면 등록'],
      ['✉️ 발행', '/task/status', 'plan/TaskStatus', 'vlm_task_planner, user_input', '단계 시작·완료·실패 · ' + LATCH],
      ['✉️ 발행', '/robot/say', 'std_msgs/String', 'user_input', '사람에게 할 말'],
      ['✉️ 발행', '/diagnostics', 'diagnostic_msgs/DiagnosticArray', 'diagnostic_aggregator', '모드 · 계획 · 단계 · 실패 횟수'],
    ],
    params: ['max_grasp_tries: 2', 'max_step_failures: 2', 'arm_plan_tries: 3', 'server_wait_s: 30.0', 'reach_m: 0.30 · approach_m: 0.24', 'tray_slots (4칸) · tray_release_z: 0.22 · tray_grasp_z: 0.17', 'place_spacing: 0.08', 'inspect_height_m: 0.15 · inspect_wait_s: 1.0', 'initial_pose (plan.yaml) · scan_pose (ros_system/config/scan_pose.yaml)'],
    notes: ['MTC 없이 move_group 직접 호출 (/plan_kinematic_path + /execute_trajectory). 그리퍼는 MoveIt 컨트롤러가 아니라 액션 직접.', 'reason: nav_failed · approach_failed · no_grasp · grasp_failed_all · arm_contact · place_failed · tray_full · tray_empty · inspect_failed · manual_override · explore_override · estop · cancelled 등 (plan/msg/TaskStatus).', 'TODO(권형중): 이동 전 팔 stow, 퍽 든 채 footprint 확장(/local_costmap set_parameters), 정지 후 대기 — 아직 없음.'],
  },
  {
    id: 'explorer', name: 'explorer', tag: 'custom', pkg: 'plan', form: 'ROS 2 노드 (C++)', group: '계획·임무',
    role: '자동 탐사 — 조작 모드가 EXPLORE일 때 매핑 중인 지도의 프론티어(빈 곳과 모르는 곳의 경계)를 골라 Nav2에 차례로 보낸다. 바퀴는 직접 움직이지 않는다.',
    inputs: [
      ['✉️ 구독', '/state/operation_mode', 'std_msgs/String', 'state_manager', 'EXPLORE일 때만 일함 (MAPPING일 때만 허락됨)'],
      ['✉️ 구독', '/map', 'nav_msgs/OccupancyGrid', 'rtabmap', '프론티어 찾기 · transient_local'],
      ['✉️ 구독', '/global_costmap/costmap', 'nav_msgs/OccupancyGrid', 'planner_server', '로봇에서 실제로 갈 수 있는 칸'],
      ['✉️ 구독', '/tf', 'tf2_msgs/TFMessage', 'rtabmap, ekf', 'map→base_footprint'],
    ],
    outputs: [
      ['🎬 요청', '/navigate_to_pose', 'nav2_msgs/action/NavigateToPose', 'bt_navigator', '프론티어 목표 (다른 모드가 되면 취소)'],
      ['✉️ 발행', '/explore/result', 'std_msgs/String', 'state_manager', '"DONE …" · "FAILED …" → AUTO로 되돌림'],
      ['✉️ 발행', '/diagnostics', 'diagnostic_msgs/DiagnosticArray', 'diagnostic_aggregator', ''],
    ],
    params: ['min_frontier_cells: 8', 'blacklist_radius: 0.4', 'goal_timeout_s: 60.0', 'empty_checks: 3', 'min_goal_dist: 0.4', 'goal_search_radius: 0.3'],
    notes: ['벽 너머(코스트맵에서 이어진 길 없음) 프론티어는 고르지 않는다. 도착·실패한 프론티어 근처는 다시 안 간다.'],
  },
  {
    id: 'state_manager', name: 'state_manager', tag: 'custom', pkg: 'manager', form: 'ROS 2 노드 (C++)', group: '계획·임무',
    role: '로봇 상태의 주인. 상태 토픽 /state/* 는 이 노드만 발행하고 나머지는 구독만 한다. 외부 명령은 전부 /cmd/... (보내고 끝 — cmd_vel 관례), 상태 명령 /cmd/<이름> 의 결과는 /state/<이름>. 조작 모드·지도 모드·비상정지·연결 장치·재시작을 맡는다.',
    inputs: [
      ['✉️ 구독', '/cmd/operation_mode', 'std_msgs/String', '시뮬레이터 · 운영자', 'MANUAL | AUTO | EXPLORE(MAPPING·비상정지 아님일 때만)'],
      ['✉️ 구독', '/explore/result', 'std_msgs/String', 'explorer', '탐사 끝 → AUTO'],
      ['✉️ 구독', '/cmd/e_stop', 'std_msgs/Bool', '시뮬레이터 · 운영자', '비상정지 원본 (다른 노드는 직접 구독 금지)'],
      ['✉️ 구독', '/cmd/map_mode', 'std_msgs/String', '시뮬레이터 · 운영자', 'MAPPING | LOCALIZATION'],
      ['✉️ 구독', '/cmd/map_name', 'std_msgs/String', '시뮬레이터 지도 목록', '<map_dir>/<이름>/rtabmap.db → load_database + 위치추정'],
      ['✉️ 구독', '/cmd/restart', 'std_msgs/String', '시뮬레이터 · 운영자', '"all [인자]" 전체 재시작 · "node <이름>" 단일 노드'],
      ['✉️ 구독', '/joint_states', 'sensor_msgs/JointState', 'joint_state_broadcaster', 'opencr·wheels·arm·gripper 연결 확인 (1초)'],
      ['✉️ 구독', '/pole_front_cam/color/camera_info, /gripper_cam/color/camera_info', 'sensor_msgs/CameraInfo', 'realsense2_camera', '카메라 연결 확인'],
      ['✉️ 구독', '/imu', 'sensor_msgs/Imu', 'imu_sensor_broadcaster', 'IMU 연결 확인'],
      ['✉️ 구독', '/motor_status', 'control/MotorStatus', 'BeebotSystemHardware', '모터 Hardware Error → /state/devices/<wheels|arm|gripper> error'],
    ],
    outputs: [
      ['✉️ 발행', '/state/operation_mode', 'std_msgs/String', 'manual_control, coordinator, explorer, vlm_task_planner', 'AUTO | MANUAL | EXPLORE · ' + LATCH],
      ['✉️ 발행', '/state/emergency', 'std_msgs/Bool', 'twist_mux, coordinator', '/cmd/e_stop 그대로 (twist_mux 잠금)'],
      ['✉️ 발행', '/state/map_mode', 'std_msgs/String', 'coordinator, manual_control, 시뮬레이터', 'MAPPING | LOCALIZATION | COURSE'],
      ['✉️ 발행', '/state/map_name · /state/map_list', 'std_msgs/String', '시뮬레이터', '지금 지도 폴더 · 가진 지도 목록'],
      ['✉️ 발행', '/state/devices · /state/devices/<이름>', 'std_msgs/String', '시뮬레이터 · 누구나', '장치 이름 목록 · "종류|active·disconnected·error|세부"'],
      ['✉️ 발행', '/state/topics', 'std_msgs/String', '시뮬레이터 · 누구나', '"토픽|타입|publisher 수" 전체 그래프'],
      ['✉️ 발행', '/state/restart · /state/restartable', 'std_msgs/String', '시뮬레이터', '재시작 결과 · node로 재시작 가능한 "이름 pid"'],
      ['📞 호출', '/rtabmap/rtabmap/set_mode_mapping · set_mode_localization', 'std_srvs/srv/Empty', 'rtabmap', '재시작 없이 모드 전환'],
      ['📞 호출', '/rtabmap/rtabmap/load_database', 'rtabmap_msgs/srv/LoadDatabase', 'rtabmap', '고른 지도 DB로 갈아끼움'],
    ],
    params: ['map_mode (시작값 = launch가 띄운 RTAB-Map 모드)', 'map_dir · map_name (launch가 정한 지도 폴더)', 'restart_prepare · restart_log · restart_wait_s: 25.0'],
    notes: ['발행 값 = 진짜 상태 (RTAB-Map 응답 온 뒤에만 바꿈). COURSE는 바꿀 수 없음.', '/state/* 에는 이 노드 말고 아무도 쓰지 않는다 — 테스트베드 input_manager도 /state/* 는 거부.', '건강·오류는 상태가 아니라 /diagnostics 몫.'],
  },
  {
    id: 'grasp_scorer', name: 'grasp_scorer', tag: 'custom', pkg: 'ml', form: 'ROS 2 서비스 노드 (C++)', group: '계획·임무',
    role: '대상 퍽 주변 파지 후보에 점수를 매겨 높은 순으로 돌려준다. 지금은 골격 — 대상 위치 기준 고정 후보 3개(0.87 · 0.62 · 0.41). IK 필터·학습 모델은 TODO.',
    inputs: [
      ['📞 서버', '/score_grasps', 'ml/srv/ScoreGrasps', 'coordinator', '요청: object_id, max_candidates'],
      ['✉️ 구독', '/tracked_objects', 'perception/TrackedObjectArray', 'perception', '대상 퍽 위치·크기'],
      ['✉️ 구독', '/gripper_cam/depth/color/points', 'sensor_msgs/PointCloud2', 'realsense2_camera (gripper_cam)', '최신 1장 (gripper_cam_pointcloud:=true일 때만 들어옴)'],
    ],
    outputs: [
      ['📞 응답', '/score_grasps', 'grasps: PoseStamped[] · scores: float32[]', 'coordinator', '점수 높은 순'],
      ['✉️ 발행', '/diagnostics', 'diagnostic_msgs/DiagnosticArray', 'diagnostic_aggregator', ''],
    ],
    params: ['enabled (false면 규칙 기반 점수 — bringup learning_enabled:=false)'],
    notes: ['TODO(송정혁): 후보 생성 → /compute_ik(move_group)로 닿는 것만 → ONNX 분류 모델. 아직 /compute_ik는 부르지 않는다.', '테스트베드는 faker fake_grasp_scorer가 대신할 수 있다 (use_grasp_scorer:=false).'],
  },
  {
    id: 'rl_nav_tuner', name: 'rl_nav_tuner', tag: 'custom', pkg: 'ml', form: 'ROS 2 노드 (C++ · 규칙 → 필요 시 RL)', group: '계획·임무',
    role: '주변 상황(통로 폭, 장애물 거리, 목표 거리)을 보고 1초마다 주행 프리셋 A(넓은 공간)/B(좁은 통로)/C(목표 직전) 중 하나를 골라, 바뀔 때만 속도 상한과 DWB 운동 파라미터를 바꾼다.',
    inputs: [
      ['✉️ 구독', '/local_costmap/costmap', 'nav_msgs/OccupancyGrid', 'controller_server', '통로 폭·최근접 장애물'],
      ['✉️ 구독', '/odometry/filtered', 'nav_msgs/Odometry', 'ekf', '현재 속도'],
      ['✉️ 구독', '/plan', 'nav_msgs/Path', 'planner_server', '목표까지 남은 거리'],
    ],
    outputs: [
      ['✉️ 발행', '/speed_limit', 'nav2_msgs/SpeedLimit', 'controller_server, rl_nav_correction', 'percentage: true · 프리셋별 %'],
      ['📞 호출', '/controller_server/set_parameters', 'rcl_interfaces/srv/SetParameters', 'controller_server', 'FollowPath.max_vel_theta · acc_lim_x · decel_lim_x'],
      ['✉️ 발행', '/diagnostics', 'diagnostic_msgs/DiagnosticArray', 'diagnostic_aggregator', ''],
    ],
    params: ['enabled (false면 프리셋 A 고정)'],
    notes: ['DWB critic 가중치는 실행 중 바꿔도 반영되지 않을 수 있어 건드리지 않는다.', 'TODO(송정혁): choose()를 규칙으로 → 필요하면 RL 정책으로.'],
  },
  {
    id: 'diagnostic_aggregator', name: 'diagnostic_aggregator', tag: 'provided', pkg: 'diagnostic_aggregator', form: 'ROS 2 노드 (aggregator_node)', group: '계획·임무',
    role: '모든 노드의 /diagnostics를 패키지별 계층(인지 · 계획·임무 · 학습 · 상태 · 제어 · Nav2 관리자 · 제공 패키지)으로 묶어 사람이 보는 건강 상태로 낸다. 노드는 진단 문자열에 기대지 않는다.',
    inputs: [
      ['✉️ 구독', '/diagnostics', 'diagnostic_msgs/DiagnosticArray', '🛠 노드 전부, BeebotSystemHardware, controller_manager, Nav2·EKF 등', '"<노드 이름>: <항목>"'],
      ['⚙️ 파라미터', 'diagnostics.yaml', 'YAML (bringup/config)', 'launch (bringup)', 'GenericAnalyzer startswith 그룹'],
    ],
    outputs: [
      ['✉️ 발행', '/diagnostics_agg', 'diagnostic_msgs/DiagnosticArray', '시뮬레이터 · run-cli status --diagnostics', '계층별 묶음'],
      ['✉️ 발행', '/diagnostics_toplevel_state', 'diagnostic_msgs/DiagnosticStatus', '표시', '가장 나쁜 수준 한 줄'],
    ],
    params: ['path: Beebot', 'analyzers: perception · plan · ml · manager · control · nav2 · system'],
    notes: ['도커에서는 controller_manager가 주기 불규칙 ERROR를 낸다 (실시간 스케줄링 안 됨) — 실기에선 사라져야 정상.'],
  },

  // ── Nav2·위치추정
  {
    id: 'rgbd_sync', name: 'rgbd_sync (+ rgbdx_sync)', tag: 'provided', pkg: 'rtabmap_sync', form: 'ROS 2 노드 3개 (이름공간 rtabmap)', group: 'Nav2·위치추정',
    role: '카메라마다 컬러·depth·camera_info를 시각 맞춰 RGBDImage 하나로 묶고(pole_rgbd_sync · gripper_rgbd_sync), rgbdx_sync가 두 카메라를 RGBDImages로 다시 묶어 RTAB-Map에 넘긴다.',
    inputs: [
      ['✉️ 구독', '/pole_front_cam/color/image_raw · aligned_depth_to_color/image_raw · color/camera_info', 'sensor_msgs/Image · CameraInfo', 'realsense2_camera (pole_front_cam)', 'pole_rgbd_sync · approx_sync'],
      ['✉️ 구독', '/gripper_cam/color/image_raw · color/camera_info', 'sensor_msgs/Image · CameraInfo', 'realsense2_camera (gripper_cam)', 'gripper_rgbd_sync'],
      ['✉️ 구독', '/gripper_cam/aligned_depth_to_color/image_scan', 'sensor_msgs/Image (16UC1)', 'scan_cam_gate', '스캔 자세가 아니면 depth 0'],
    ],
    outputs: [
      ['✉️ 발행', '/rtabmap/rgbd_image0 · /rtabmap/rgbd_image1', 'rtabmap_msgs/RGBDImage', 'rgbdx_sync', '카메라별 묶음'],
      ['✉️ 발행', '/rtabmap/rgbd_images', 'rtabmap_msgs/RGBDImages', 'rtabmap', '두 카메라 묶음 (rgbd_cameras: 2)'],
    ],
    params: ['approx_sync: true', 'topic_queue_size: 10 · sync_queue_size: 10', 'qos: 2 (best effort)'],
    notes: ['queue를 1로 줄이면 한쪽 프레임이 먼저 올 때 짝을 못 찾아 RTAB-Map이 "Did not receive data"로 멈출 수 있다.', 'use_rtabmap일 때만 뜬다 (map:=course면 없음).'],
  },
  {
    id: 'scan_cam_gate', name: 'scan_cam_gate', tag: 'custom', pkg: 'ros_system', form: 'ROS 2 노드 (Python)', group: 'Nav2·위치추정',
    role: 'gripper_cam depth·점구름을 팔이 스캔 자세(scan_pose.yaml)에 멈춰 있을 때만 그대로 RTAB-Map에 넘기고, 그 밖에는 depth 0·빈 점구름으로 채워 넘긴다. 움직이는 팔 카메라가 지도를 망치지 않게 하면서 두 카메라 동기화는 끊지 않는다.',
    inputs: [
      ['✉️ 구독', '/gripper_cam/aligned_depth_to_color/image_raw', 'sensor_msgs/Image', 'realsense2_camera (gripper_cam)', 'depth_in'],
      ['✉️ 구독', '/gripper_cam/depth/color/points', 'sensor_msgs/PointCloud2', 'realsense2_camera (gripper_cam)', 'cloud_in'],
      ['✉️ 구독', '/joint_states', 'sensor_msgs/JointState', 'joint_state_broadcaster', 'joint1~5가 scan_pose ± 0.05rad · 거의 정지인지'],
    ],
    outputs: [
      ['✉️ 발행', '/gripper_cam/aligned_depth_to_color/image_scan', 'sensor_msgs/Image (16UC1)', 'rgbd_sync', 'depth_out — 스캔 자세 아니면 0'],
      ['✉️ 발행', '/gripper_cam/depth/color/points_scan', 'sensor_msgs/PointCloud2', 'point_cloud_aggregator', 'cloud_out — 카메라 0.5m 안(자기 몸) 뺌, 아니면 빈 점구름'],
    ],
    params: ['scan_pose: [2.618, 0.681, -1.414, 1.082, 0.0] (scan_pose.yaml, coordinator와 공유)', 'scan_pose_tolerance: 0.05', 'max_joint_velocity: 0.02', 'min_range: 0.5'],
  },
  {
    id: 'point_cloud_aggregator', name: 'point_cloud_aggregator (scan_cloud_merge)', tag: 'provided', pkg: 'rtabmap_util', form: 'ROS 2 노드 (이름공간 rtabmap)', group: 'Nav2·위치추정',
    role: '몸 뺀 pole_front_cam 점구름과 스캔 자세일 때의 gripper_cam 점구름을 base_footprint 하나로 합쳐 RTAB-Map scan_cloud(격자 /map · ICP)로 넘긴다.',
    inputs: [
      ['✉️ 구독', PTF, 'sensor_msgs/PointCloud2', 'body_filter', 'cloud1'],
      ['✉️ 구독', '/gripper_cam/depth/color/points_scan', 'sensor_msgs/PointCloud2', 'scan_cam_gate', 'cloud2'],
      ['✉️ 구독', '/tf', 'tf2_msgs/TFMessage', 'robot_state_publisher', '카메라 → base_footprint'],
    ],
    outputs: [
      ['✉️ 발행', '/rtabmap/scan_cloud', 'sensor_msgs/PointCloud2 (base_footprint)', 'rtabmap', 'combined_cloud'],
    ],
    params: ['count: 2', 'frame_id: base_footprint', 'approx_sync: true', 'qos: 2'],
  },
  {
    id: 'rtabmap', name: 'rtabmap', tag: 'provided', pkg: 'rtabmap_slam (rtabmap_ros)', form: 'ROS 2 노드 (이름공간 rtabmap)', group: 'Nav2·위치추정',
    role: 'RGB-D SLAM. 매핑 모드에서는 지도를 만들어 rtabmap.db에 저장하고, 위치추정 모드에서는 같은 DB로 로봇 위치를 찾아 map→odom을 낸다. 두 카메라 RGBDImages + 합친 점구름(scan_cloud)으로 Nav2용 2D 지도(/map)를 만든다.',
    inputs: [
      ['✉️ 구독', '/rtabmap/rgbd_images', 'rtabmap_msgs/RGBDImages', 'rgbd_sync', 'subscribe_rgbd · rgbd_cameras: 0 (묶음 메시지)'],
      ['✉️ 구독', '/rtabmap/scan_cloud', 'sensor_msgs/PointCloud2', 'point_cloud_aggregator', '격자(Grid/Sensor 0) · ICP(Reg/Strategy 2)'],
      ['✉️ 구독', '/tf', 'tf2_msgs/TFMessage', 'ekf', 'odom→base_footprint를 영상 시각으로 (odom_frame_id: odom — 토픽 대신 TF)'],
      ['✉️ 구독', '/initialpose', 'geometry_msgs/PoseWithCovarianceStamped', 'RViz · 시뮬레이터', '위치를 잃었을 때 "여기쯤"'],
      ['📞 서버', '/rtabmap/rtabmap/set_mode_mapping · set_mode_localization · load_database', 'std_srvs/srv/Empty · rtabmap_msgs/srv/LoadDatabase', 'state_manager', '재시작 없이 모드·지도 전환'],
      ['💾 파일', '<map_dir>/<map_name>/rtabmap.db', 'SQLite DB', '디스크', '위치추정 모드에서 읽음 (기본 map_dir ~/.ros/beebot_maps)'],
    ],
    outputs: [
      ['✉️ 발행', '/map', 'nav_msgs/OccupancyGrid', 'planner_server, explorer, map_saver', 'transient_local · 이름공간 밖으로 리매핑'],
      ['✉️ 발행', '/tf', 'tf2_msgs/TFMessage', '전체', 'map → odom'],
      ['💾 파일', '<map_dir>/<map_name>/rtabmap.db', 'SQLite DB', '디스크', '매핑 모드에서 저장 (--delete_db_on_start)'],
    ],
    params: ['frame_id: base_footprint', 'subscribe_rgbd: true · subscribe_scan_cloud: true', 'Reg/Force3DoF: true', 'Grid/Sensor: 0 (scan_cloud)', 'Reg/Strategy: 2 (시각 + ICP)', 'Vis/MinInliers: 35 · RGBD/OptimizeMaxError: 1.5', 'Rtabmap/LoopThr: 0.15', 'Vis/MinDepth · Kp/MinDepth: 0.5 (화면 속 자기 팔 특징점 버림)', 'Grid/MaxGroundHeight: 0.03 · Grid/MaxObstacleHeight: 0.6', 'odom_tf_angular_variance: 0.0001', 'Mem/IncrementalMemory: true(매핑) / false(위치추정)', 'Mem/InitWMWithAllNodes: true (위치추정)'],
    notes: ['Nav2 lifecycle 관리 대상이 아니다.', '위치추정 모드는 시작 직후 장면을 맞출 때까지 map→odom이 없다 — lifecycle_manager_navigation 쪽만 늦게 뜬다.', 'bringup map:=slam(새 폴더 매핑) · saved(저장 지도 위치추정, 기본) · course(테스트베드 — RTAB-Map 없음).'],
  },
  {
    id: 'map_saver', name: 'map_saver (map_saver_server)', tag: 'provided', pkg: 'nav2_map_server', form: 'ROS 2 lifecycle 노드', group: 'Nav2·위치추정',
    role: '요청이 오면 지금 /map을 map.pgm·map.yaml로 저장한다 (시뮬레이터 [지도 저장] → <map_dir>/<map_name>/). lifecycle_manager_map_saver가 켠다.',
    inputs: [
      ['📞 서버', '/map_saver/save_map', 'nav2_msgs/srv/SaveMap', '시뮬레이터 · 운영자', '저장 경로·형식'],
      ['✉️ 구독', '/map', 'nav_msgs/OccupancyGrid', 'rtabmap', '요청 때 한 장'],
    ],
    outputs: [
      ['💾 파일', '<map_dir>/<map_name>/map.pgm · map.yaml', 'PGM + YAML', '디스크', ''],
    ],
    notes: ['RTAB-Map을 쓸 때(map:=slam · saved)만 뜬다.'],
  },
  {
    id: 'bt_navigator', name: 'bt_navigator', tag: 'provided', pkg: 'nav2_bt_navigator', form: 'ROS 2 lifecycle 노드', group: 'Nav2·위치추정',
    role: 'NavigateToPose 목표를 받아 행동 트리로 "경로 계산 → 따라가기 → 막히면 복구"를 지휘한다.',
    inputs: [
      ['🎬 서버', '/navigate_to_pose', 'nav2_msgs/action/NavigateToPose', 'coordinator, explorer', 'goal: PoseStamped (map)'],
      ['✉️ 구독', '/odometry/filtered', 'nav_msgs/Odometry', 'ekf', 'odom_topic 파라미터'],
      ['✉️ 구독', '/tf', 'tf2_msgs/TFMessage', 'rtabmap, ekf', 'map→base_footprint'],
    ],
    outputs: [
      ['🎬 요청', '/compute_path_to_pose', 'nav2_msgs/action/ComputePathToPose', 'planner_server', '재계획'],
      ['🎬 요청', '/follow_path', 'nav2_msgs/action/FollowPath', 'controller_server', ''],
      ['🎬 요청', '/spin, /backup, /wait', 'nav2_msgs/action/Spin · BackUp · Wait', 'behavior_server', '복구'],
    ],
    params: ['robot_base_frame: base_footprint', 'default_nav_to_pose_bt_xml: ros_system/config/navigate_to_pose.xml (기본 BT에서 후진만 0.10m로)', 'odom_topic: /odometry/filtered'],
    notes: ['카메라가 앞만 보므로 BackUp 복구는 0.1m 이하로 제한한 BT XML을 쓴다.'],
  },
  {
    id: 'planner_server', name: 'planner_server', tag: 'provided', pkg: 'nav2_planner', form: 'ROS 2 lifecycle 노드 (+ global_costmap)', group: 'Nav2·위치추정',
    role: '지도와 장애물을 반영한 전역 경로를 만든다. 안에 global_costmap이 들어 있다.',
    inputs: [
      ['🎬 서버', '/compute_path_to_pose', 'nav2_msgs/action/ComputePathToPose', 'bt_navigator', ''],
      ['✉️ 구독', '/map', 'nav_msgs/OccupancyGrid', 'rtabmap', 'static layer'],
      ['✉️ 구독', PTF, 'sensor_msgs/PointCloud2', 'body_filter', 'obstacle layer (자기 몸 뺀 점구름)'],
      ['✉️ 구독', '/tf', 'tf2_msgs/TFMessage', 'rtabmap, ekf', ''],
    ],
    outputs: [
      ['✉️ 발행', '/plan', 'nav_msgs/Path', 'rl_nav_correction, rl_nav_tuner, RViz', '계획마다'],
      ['✉️ 발행', '/global_costmap/costmap', 'nav_msgs/OccupancyGrid', 'explorer, RViz', ''],
    ],
    params: ['planner_plugins: [GridBased] (nav2_navfn_planner::NavfnPlanner)', 'GridBased.tolerance: 0.20 · allow_unknown: true', 'expected_planner_frequency: 5.0', 'global_costmap.plugins: [static_layer, obstacle_layer, inflation_layer]', 'robot_base_frame: base_footprint'],
  },
  {
    id: 'controller_server', name: 'controller_server', tag: 'provided', pkg: 'nav2_controller', form: 'ROS 2 lifecycle 노드 (+ local_costmap · DWB)', group: 'Nav2·위치추정',
    role: '전역 경로를 따라가는 속도 명령을 20Hz로 계산한다. 안에 local_costmap과 DWB 컨트롤러가 들어 있다. 출력 cmd_vel은 launch 리매핑으로 /cmd_vel_nav.',
    inputs: [
      ['🎬 서버', '/follow_path', 'nav2_msgs/action/FollowPath', 'bt_navigator', ''],
      ['✉️ 구독', '/odometry/filtered', 'nav_msgs/Odometry', 'ekf', ''],
      ['✉️ 구독', '/speed_limit', 'nav2_msgs/SpeedLimit', 'rl_nav_tuner', '속도 상한 (백분율, 100% = max_vel_x 0.26)'],
      ['✉️ 구독', PTF, 'sensor_msgs/PointCloud2', 'body_filter', 'local voxel layer'],
      ['📞 서버', '/controller_server/set_parameters', 'rcl_interfaces/srv/SetParameters', 'rl_nav_tuner', 'FollowPath 운동 파라미터 런타임 변경'],
    ],
    outputs: [
      ['✉️ 발행', '/cmd_vel_nav', TW, 'rl_nav_correction', '20Hz'],
      ['✉️ 발행', '/local_costmap/costmap', 'nav_msgs/OccupancyGrid', 'rl_nav_tuner, RViz', ''],
      ['✉️ 발행', '/local_costmap/costmap_raw', 'nav2_msgs/Costmap', 'behavior_server', ''],
    ],
    params: ['controller_frequency: 20.0', 'FollowPath.plugin: dwb_core::DWBLocalPlanner', 'FollowPath.max_vel_x: 0.26', 'speed_limit_topic: /speed_limit', 'enable_stamped_cmd_vel: true'],
    notes: ['퍽을 들면 footprint를 키우는 /local_costmap/local_costmap/set_parameters 호출은 설계만 — coordinator TODO.'],
  },
  {
    id: 'behavior_server', name: 'behavior_server', tag: 'provided', pkg: 'nav2_behaviors', form: 'ROS 2 lifecycle 노드', group: 'Nav2·위치추정',
    role: '막혔을 때의 복구 동작(제자리 회전, 후진, 대기)을 실행한다.',
    inputs: [
      ['🎬 서버', '/spin, /backup, /wait', 'nav2_msgs/action/Spin · BackUp · Wait', 'bt_navigator', ''],
      ['✉️ 구독', '/local_costmap/costmap_raw', 'nav2_msgs/Costmap', 'controller_server', '충돌 검사'],
    ],
    outputs: [
      ['✉️ 발행', '/cmd_vel_nav', TW, 'rl_nav_correction', 'launch 리매핑 — 안전 체인을 똑같이 지나게 함'],
    ],
    params: ['behavior_plugins: [spin, backup, wait]', 'robot_base_frame: base_footprint', 'enable_stamped_cmd_vel: true'],
  },
  {
    id: 'costmap', name: 'costmap_2d (voxel · obstacle layer)', tag: 'provided', pkg: 'nav2_costmap_2d', form: '플러그인 (planner_server·controller_server 안, 노드 아님)', group: 'Nav2·위치추정',
    role: '점구름을 격자에 쌓아 2D 비용 지도로 내린다. LiDAR가 없어서 장애물은 전부 pole_front_cam 점구름(자기 몸 뺀 것)으로 들어온다. local = voxel_layer, global = static + obstacle_layer.',
    inputs: [
      ['✉️ 구독', PTF, 'sensor_msgs/PointCloud2', 'body_filter', 'observation_sources: pole_front_cam'],
      ['✉️ 구독', '/map', 'nav_msgs/OccupancyGrid', 'rtabmap', 'global만 (static layer)'],
    ],
    outputs: [
      ['🧩 내부', '비용 격자', 'Costmap2D (메모리)', 'planner_server, controller_server', '같은 프로세스'],
      ['✉️ 발행', '/global_costmap/costmap, /local_costmap/costmap', 'nav_msgs/OccupancyGrid', 'explorer, rl_nav_tuner, RViz', ''],
    ],
    params: ['local: plugins [voxel_layer, inflation_layer]', 'global: plugins [static_layer, obstacle_layer, inflation_layer] · resolution 0.05', 'min_obstacle_height: 0.03', 'max_obstacle_height: 0.6', 'inflation_layer.inflation_radius: 0.25'],
    notes: ['화각 밖 장애물이 바로 지워지지 않게 clearing을 보수적으로 둔다.'],
  },
  {
    id: 'lifecycle_manager', name: 'lifecycle_manager (navigation · base)', tag: 'provided', pkg: 'nav2_lifecycle_manager', form: 'ROS 2 노드 ×2', group: 'Nav2·위치추정',
    role: 'Nav2 서버를 둘로 나눠 configure → activate 한다. lifecycle_manager_base = 바퀴 명령 체인(velocity_smoother · collision_monitor, odom만 있으면 뜸 — 수동 조작은 지도 없이도), lifecycle_manager_navigation = 주행 계획(planner · controller · behavior · bt_navigator, map 필요).',
    inputs: [
      ['📞 서버', '/lifecycle_manager_base/manage_nodes', 'nav2_msgs/srv/ManageLifecycleNodes', '운영자·launch', '시작·정지·리셋'],
      ['📞 서버', '/lifecycle_manager_navigation/manage_nodes', 'nav2_msgs/srv/ManageLifecycleNodes', '운영자·launch', '시작·정지·리셋'],
    ],
    outputs: [
      ['📞 호출', '*/change_state', 'lifecycle_msgs/srv/ChangeState', 'velocity_smoother, collision_monitor (base)', ''],
      ['📞 호출', '*/change_state', 'lifecycle_msgs/srv/ChangeState', 'planner_server, controller_server, behavior_server, bt_navigator (navigation)', ''],
      ['✉️ 발행', '/diagnostics', 'diagnostic_msgs/DiagnosticArray', 'diagnostic_aggregator', '"Nav2 Health"'],
    ],
    params: ['autostart: true', 'bond_timeout: 60.0', 'node_names (base): [velocity_smoother, collision_monitor]', 'node_names (navigation): [planner_server, controller_server, behavior_server, bt_navigator]'],
    notes: ['하나로 묶으면 RTAB-Map이 map→odom을 못 낼 때 global_costmap 실패로 수동 조작까지 막혔다 (실측) → 둘로 나눔.', 'map_saver는 별도 lifecycle_manager_map_saver.'],
  },

  // ── 베이스 명령 체인
  {
    id: 'rl_nav_correction', name: 'rl_nav_correction', tag: 'custom', pkg: 'ml', form: 'ROS 2 노드 (C++)', group: '베이스 명령 체인',
    role: 'Nav2 속도 명령에 작은 Δ를 더해 미끄러짐 같은 현실 오차를 보정한다. 결과는 다시 min(프리셋 상한, /speed_limit)으로 자른다. 지금은 골격 — Δ=0 통과, 정책(ONNX)은 TODO.',
    inputs: [
      ['✉️ 구독', '/cmd_vel_nav', TW, 'controller_server, behavior_server', '이 메시지가 올 때마다 1회'],
      ['✉️ 구독', '/plan', 'nav_msgs/Path', 'planner_server', '경로 대비 횡·방향 오차'],
      ['✉️ 구독', '/odom', 'nav_msgs/Odometry', 'diff_drive_controller', '바퀴 속도 (끊기면 Δ=0)'],
      ['✉️ 구독', '/imu', 'sensor_msgs/Imu', 'imu_sensor_broadcaster', '실제 각속도'],
      ['✉️ 구독', '/speed_limit', 'nav2_msgs/SpeedLimit', 'rl_nav_tuner', '재클리핑 상한'],
    ],
    outputs: [
      ['✉️ 발행', '/cmd_vel_corrected', TW, 'twist_mux', '20Hz · 자동 입력 (priority 10)'],
      ['✉️ 발행', '/diagnostics', 'diagnostic_msgs/DiagnosticArray', 'diagnostic_aggregator', ''],
    ],
    params: ['enabled (false면 Δ=0 통과)', 'max_vel_x: 0.26', 'max_vel_theta: 1.82', 'timeout_s: 0.2', 'Δ 한계: 선속도 ±0.05 · 각속도 ±0.10 (코드 고정)'],
    notes: ['관측 벡터 순서·단위·정규화가 Isaac Lab 학습 환경과 완전히 같아야 한다.', '테스트베드는 faker fake_rl_nav_correction이 대신할 수 있다.'],
  },
  {
    id: 'twist_mux', name: 'twist_mux', tag: 'provided', pkg: 'twist_mux', form: 'ROS 2 노드', group: '베이스 명령 체인',
    role: '속도 명령 교환기 — 자동·수동 중 priority 높은 쪽 하나만 통과, /state/emergency(← /cmd/e_stop, state_manager)가 true면 전부 차단.',
    inputs: [
      ['✉️ 구독', '/cmd_vel_corrected', TW, 'rl_nav_correction', 'auto · priority 10 · timeout 0.5'],
      ['✉️ 구독', '/cmd_vel_manual', TW, 'manual_control', 'manual · priority 100 · timeout 0.5'],
      ['✉️ 구독', '/state/emergency', 'std_msgs/Bool', 'state_manager', '잠금 e_stop · priority 255'],
    ],
    outputs: [
      ['✉️ 발행', '/cmd_vel_mux', TW, 'velocity_smoother', 'cmd_vel_out 리매핑 · 선택된 하나만'],
    ],
    params: ['use_stamped: true', 'topics: auto · manual', 'locks: e_stop (/state/emergency)'],
  },
  {
    id: 'velocity_smoother', name: 'velocity_smoother', tag: 'provided', pkg: 'nav2_velocity_smoother', form: 'ROS 2 lifecycle 노드', group: '베이스 명령 체인',
    role: '속도 명령의 가속·감속을 제한해 덜컹임을 없앤다. lifecycle_manager_base가 켠다 (지도 없이도).',
    inputs: [
      ['✉️ 구독', '/cmd_vel_mux', TW, 'twist_mux', 'cmd_vel 리매핑'],
      ['✉️ 구독', '/odometry/filtered', 'nav_msgs/Odometry', 'ekf', 'feedback: CLOSED_LOOP일 때만 (지금 OPEN_LOOP)'],
    ],
    outputs: [
      ['✉️ 발행', '/cmd_vel_smoothed', TW, 'collision_monitor', '20Hz'],
    ],
    params: ['smoothing_frequency: 20.0', 'feedback: OPEN_LOOP', 'max_velocity: [0.26, 0.0, 1.82]', 'max_accel: [2.5, 0.0, 3.2]', 'enable_stamped_cmd_vel: true'],
  },
  {
    id: 'collision_monitor', name: 'collision_monitor', tag: 'provided', pkg: 'nav2_collision_monitor', form: 'ROS 2 lifecycle 노드', group: '베이스 명령 체인',
    role: '바퀴로 가기 직전의 마지막 안전 필터. 지금 속도로 가면 1초 안에 몸이 점에 닿는 방향만 멈추고(approach), 0.30m 안이면 절반 속도. 자동 명령을 거른다 — MANUAL 동안은 manual_control이 ~/toggle로 꺼 두어 명령을 그대로 통과시킨다.',
    inputs: [
      ['✉️ 구독', '/cmd_vel_smoothed', TW, 'velocity_smoother', 'cmd_vel_in_topic'],
      ['✉️ 구독', PTF, 'sensor_msgs/PointCloud2', 'body_filter', 'min_height 0.05 · max_height 0.6 · source_timeout 1.0(끊기면 정지)'],
      ['✉️ 구독', '/tf', 'tf2_msgs/TFMessage', 'robot_state_publisher, ekf', '카메라 → base_footprint'],
      ['📞 서버', '/collision_monitor/toggle', 'nav2_msgs/srv/Toggle', 'manual_control', 'false = 감시 끔(명령 그대로 통과) — MANUAL 동안'],
    ],
    outputs: [
      ['✉️ 발행', '/cmd_vel', TW, 'diff_drive_controller', 'cmd_vel_out_topic · 20Hz'],
      ['✉️ 발행', '/collision_monitor_state', 'nav2_msgs/CollisionMonitorState', 'RViz', '어떤 다각형이 걸렸는지'],
    ],
    params: ['polygons: [Approach, SlowZone]', 'Approach: circle 0.20 · approach · time_before_collision 1.0', 'SlowZone: circle 0.30 · slowdown 0.5', 'observation_sources: [pole_front_cam]', 'enable_stamped_cmd_vel: true'],
    notes: ['멀어지는 방향(후진·회전)은 통과 — 벽에 붙어도 빠져나온다 (예전 stop 원은 갇혔음).', '카메라 화각 밖은 지켜 주지 못한다 — 후진·회전은 짧게.'],
  },
  {
    id: 'ekf', name: 'ekf_node (robot_localization)', tag: 'provided', pkg: 'robot_localization', form: 'ROS 2 노드 (ekf_filter_node)', group: '베이스 명령 체인',
    role: '바퀴 오도메트리(vx·vy)와 IMU(yaw 각속도)를 융합해 매끄러운 odom→base_footprint를 낸다. 회전은 자이로를 믿는다 (바퀴 회전속도는 늦고 미끄러짐에 틀어짐 — 실측).',
    inputs: [
      ['✉️ 구독', '/odom', 'nav_msgs/Odometry', 'diff_drive_controller', 'odom0: vx, vy'],
      ['✉️ 구독', '/imu', 'sensor_msgs/Imu', 'imu_sensor_broadcaster', 'imu0: vyaw'],
    ],
    outputs: [
      ['✉️ 발행', '/odometry/filtered', 'nav_msgs/Odometry', 'bt_navigator, controller_server, rl_nav_tuner, velocity_smoother', '50Hz'],
      ['✉️ 발행', '/tf', 'tf2_msgs/TFMessage', '전체 (rtabmap은 이 TF로 odom을 읽음)', 'odom → base_footprint'],
    ],
    params: ['two_d_mode: true', 'frequency: 50.0', 'world_frame: odom', 'base_link_frame: base_footprint', 'publish_tf: true'],
    notes: ['diff_drive_controller의 enable_odom_tf는 false — odom TF 발행자는 ekf 하나.', 'TODO(권형중): 실기 공분산 튜닝.'],
  },
  {
    id: 'manual_control', name: 'manual_control', tag: 'custom', pkg: 'control', form: 'ROS 2 노드 (C++)', group: '베이스 명령 체인',
    role: '수동 조작 — MANUAL일 때만 바퀴·팔·그리퍼 수동 명령을 통과시키고, 아니면 버린다. 운영 모드에 따라 안전 장치를 바꾼다: MANUAL이면 collision_monitor를 끄고(수동 바퀴는 velocity_smoother·비상정지 잠금만), TEACH면 팔·그리퍼 토크를 끈다(손으로 자세). 모터 재부팅 요청도 여기서.',
    inputs: [
      ['✉️ 구독', '/state/operation_mode', 'std_msgs/String', 'state_manager', 'MANUAL일 때만 통과 · MANUAL이면 collision_monitor 끔 · TEACH면 팔·그리퍼 토크 끔'],
      ['✉️ 구독', '/state/map_mode', 'std_msgs/String', 'state_manager', 'MAPPING 동안 팔 수동 조작 거절 (스캔 자세 유지)'],
      ['✉️ 구독', '/cmd/manual/cmd_vel', TW, 'teleop_twist_keyboard · 시뮬레이터', '바퀴 — cmd_timeout_s 끊기면 0 한 번'],
      ['✉️ 구독', '/cmd/manual/arm', 'sensor_msgs/JointState', '시뮬레이터 · 운영자', 'joint1~5 rad · gripper_left_joint m (이름 있는 것만)'],
      ['✉️ 구독', '/cmd/manual/reboot_motors', 'std_msgs/Empty', '시뮬레이터 · 운영자', 'Hardware Error 난 모터 재부팅'],
      ['✉️ 구독', '/joint_states', 'sensor_msgs/JointState', 'joint_state_broadcaster', '목표 없는 관절은 지금 각으로 채움 (5축 전체 궤적)'],
    ],
    outputs: [
      ['✉️ 발행', '/cmd_vel_manual', TW, 'twist_mux', 'manual · priority 100 (자동보다 우선)'],
      ['✉️ 발행', '/arm_controller/joint_trajectory', 'trajectory_msgs/JointTrajectory', 'arm_controller', '한 점 궤적 (arm_move_s)'],
      ['🎬 요청', '/gripper_controller/gripper_cmd', 'control_msgs/action/ParallelGripperCommand', 'gripper_controller', ''],
      ['📞 호출', '/beebotsystem/reboot_motors', 'std_srvs/srv/Trigger', 'BeebotSystemHardware', '에러 난 모터만 펌웨어 R'],
      ['📞 호출', '/collision_monitor/toggle', 'nav2_msgs/srv/Toggle', 'collision_monitor', 'MANUAL이면 false(명령 그대로 통과) · 나가면 true. collision_monitor가 다시 뜨면 또 보냄 · 응답 없으면 3초 뒤 재시도'],
      ['📞 호출', '/beebotsystem/set_arm_torque', 'std_srvs/srv/SetBool', 'BeebotSystemHardware', 'TEACH 들어가면 false · 나가면 JTC·그리퍼 목표를 지금 값으로 맞춘 뒤 true (torque_on_delay_s)'],
      ['✉️ 발행', '/diagnostics', 'diagnostic_msgs/DiagnosticArray', 'diagnostic_aggregator', '재부팅 결과 포함'],
    ],
    params: ['arm_joints: [joint1..joint5]', 'gripper_joint: gripper_left_joint', 'arm_move_s: 1.0', 'cmd_timeout_s: 0.5', 'reboot_service: /beebotsystem/reboot_motors', 'collision_monitor_toggle: /collision_monitor/toggle', 'torque_service: /beebotsystem/set_arm_torque', 'torque_on_delay_s: 0.5'],
  },
  {
    id: 'teleop', name: 'teleop_twist_keyboard', tag: 'provided', pkg: 'teleop_twist_keyboard', form: 'ROS 2 노드 (터미널, 직접 실행)', group: '베이스 명령 체인',
    role: '키보드로 로봇을 몬다 (매핑 등). bringup이 띄우지 않고 운영자가 터미널에서 실행한다. MANUAL 모드에서 manual_control을 거쳐 twist_mux → 안전 체인으로 간다.',
    inputs: [['⌨️ 입력', '키보드', '터미널', '사람', '']],
    outputs: [['✉️ 발행', '/cmd/manual/cmd_vel', TW, 'manual_control', 'cmd_vel 리매핑 · stamped:=true 필수 (Jazzy 이후)']],
    params: ['stamped: true', 'frame_id: base_footprint'],
    notes: ['/cmd_vel로 바로 보내면 twist_mux·collision_monitor를 건너뛴다 — 반드시 /cmd/manual/cmd_vel로 리매핑하고 /cmd/operation_mode MANUAL.'],
  },

  // ── 팔·MoveIt
  {
    id: 'move_group', name: 'move_group', tag: 'provided', pkg: 'moveit_ros_move_group', form: 'ROS 2 노드', group: '팔·MoveIt',
    role: '팔(그룹 arm, joint1~5) 궤적 계획(OMPL)·충돌 검사·IK(pick_ik)를 맡고, 계획한 궤적을 arm_controller에 넘긴다. 그리퍼는 MoveIt이 아니라 coordinator가 직접. spawner가 끝난 뒤 뜬다 (use_moveit).',
    inputs: [
      ['📞 서버', '/plan_kinematic_path', 'moveit_msgs/srv/GetMotionPlan', 'coordinator', 'pick·place·스캔 자세 계획'],
      ['🎬 서버', '/execute_trajectory', 'moveit_msgs/action/ExecuteTrajectory', 'coordinator', '계획 실행'],
      ['📞 서버', '/apply_planning_scene', 'moveit_msgs/srv/ApplyPlanningScene', 'coordinator', ''],
      ['📞 서버', '/clear_octomap', 'std_srvs/srv/Empty', 'coordinator', ''],
      ['📞 서버', '/compute_ik', 'moveit_msgs/srv/GetPositionIK', 'grasp_scorer (TODO)', 'pick_ik'],
      ['✉️ 구독', '/joint_states', 'sensor_msgs/JointState', 'joint_state_broadcaster', '현재 자세'],
      ['⚙️ 파라미터', 'robot_description · robot_description_semantic', 'URDF (xacro) · beebot.srdf', 'launch (ros_system)', 'config/moveit/*.yaml'],
    ],
    outputs: [
      ['🎬 요청', '/arm_controller/follow_joint_trajectory', 'control_msgs/action/FollowJointTrajectory', 'arm_controller', '궤적마다'],
      ['✉️ 발행', '/monitored_planning_scene', 'moveit_msgs/PlanningScene', 'RViz', ''],
    ],
    params: ['kinematics_solver: pick_ik/PickIkPlugin (mode global · rotation_scale 0.0 = 위치만)', 'planning_pipelines: [ompl]', 'moveit_controller_manager: MoveItSimpleControllerManager', 'controller_names: [arm_controller] (그리퍼 없음)'],
    notes: ['5축 팔이라 KDL은 위치+방향 목표를 못 풀었다 → pick_ik 위치 우선.', 'MTC(/execute_task_solution)·octomap 센서(pole_front_cam 점구름)는 아직 설정 없음.'],
  },
  {
    id: 'arm_controller', name: 'arm_controller (JointTrajectoryController)', tag: 'provided', pkg: 'joint_trajectory_controller', form: 'ros2_control 컨트롤러 플러그인', group: '팔·MoveIt',
    role: '궤적을 시간에 맞춰 보간해 매 주기 관절 목표를 낸다. 하드웨어가 아니라 rl_arm_correction의 reference에 쓴다(체인). 액션(MoveIt)과 토픽(coordinator 시작 자세 · manual_control) 둘 다 받는다.',
    inputs: [
      ['🎬 서버', '/arm_controller/follow_joint_trajectory', 'control_msgs/action/FollowJointTrajectory', 'move_group', ''],
      ['✉️ 구독', '/arm_controller/joint_trajectory', 'trajectory_msgs/JointTrajectory', 'coordinator, manual_control', 'JTC 표준 토픽 입력 — 5축 전체여야 함'],
      ['📞 서버', '/arm_controller/follow_joint_trajectory/_action/cancel_goal', 'action_msgs/srv/CancelGoal', 'arm_safety_monitor', '취소 → 현재 자세 유지'],
      ['🧩 읽기', 'joint1~5/position, velocity', 'state interface (double)', 'BeebotSystemHardware', '100Hz'],
    ],
    outputs: [
      ['🧩 쓰기', 'rl_arm_correction/joint1~5/position', 'reference interface (double)', 'rl_arm_correction', 'command_joints로 체인'],
      ['✉️ 발행', '/arm_controller/controller_state', 'control_msgs/msg/JointTrajectoryControllerState', '모니터링·RViz', ''],
    ],
    params: ['joints: [joint1..joint5]', 'command_joints: [rl_arm_correction/joint1..5]', 'command_interfaces: [position]', 'state_interfaces: [position, velocity]', 'constraints.stopped_velocity_tolerance: 0.02', 'constraints.goal_time: 0.5'],
  },
  {
    id: 'rl_arm_correction', name: 'rl_arm_correction', tag: 'custom', pkg: 'ml', form: 'ros2_control chainable 컨트롤러 플러그인 (C++)', group: '팔·MoveIt',
    role: 'JTC가 낸 관절 목표에 작은 Δ(±max_delta)를 더해 중력 처짐 같은 오차를 보정하고 하드웨어에 쓴다. ROS 노드가 아니라 controller_manager 안에서 같은 주기에 돈다. 지금은 골격 — Δ 정책(ONNX)은 TODO.',
    inputs: [
      ['🧩 읽기', 'rl_arm_correction/joint1~5/position', 'reference interface (double)', 'arm_controller', '자기가 내놓은 입력 자리'],
      ['🧩 읽기', 'joint1~5/position, velocity', 'state interface (double)', 'BeebotSystemHardware', '현재 관절각·속도 → 추종 오차'],
      ['⚙️ 파라미터', 'enabled', 'bool', 'controllers.yaml · ros2 param set', 'false면 Δ=0 (보정 끔)'],
    ],
    outputs: [
      ['🧩 쓰기', 'joint1~5/position', 'command interface (double)', 'BeebotSystemHardware', 'reference + Δ, ±0.05rad 클리핑'],
    ],
    setup: [
      'ml 패키지에 controller_interface::ChainableControllerInterface를 상속한 ml::RlArmCorrection 클래스를 만든다.',
      'on_export_reference_interfaces_list()로 rl_arm_correction/joint1~5/position 입력 자리를 내놓고, command_interface_configuration()에 joint1~5/position, state_interface_configuration()에 joint1~5/position·velocity를 요청한다.',
      'update_and_write_commands()에서 reference + Δ(±max_delta 클리핑)를 command에 쓴다. enabled=false면 Δ=0.',
      'pluginlib 등록(PLUGINLIB_EXPORT_CLASS + 플러그인 xml, class ml/RlArmCorrection) → controllers.yaml에 type: ml/RlArmCorrection (launch 인자 arm_correction_type — 테스트베드는 faker/FakeRlArmCorrection).',
      'arm_controller의 command_joints를 rl_arm_correction/joint1~5로 바꾸고, spawner에서 rl_arm_correction을 arm_controller보다 먼저 켠다.',
    ],
    guide: 'ros2control:ctrl',
    params: ['joints: [joint1..joint5]', 'enabled: true (bringup learning_enabled와 별개 — controllers.yaml)', 'max_delta: 0.05'],
    notes: ['관측값은 모두 controller_manager 안의 인터페이스에서 읽는다 — 토픽을 구독하지 않으므로 실시간 루프가 끊기지 않는다.', 'update() 안에서 메모리 할당 금지 — ONNX 세션·텐서는 on_configure에서 미리 만든다.', '체인 때문에 이것만 deactivate할 수 없다. 끌 땐 enabled 파라미터를 쓴다.', 'TODO(송정혁): 관측(목표·현재 관절각·속도·추종 오차·파지 여부·직전 Δ) → ONNX 정책 → Δ.'],
  },
  {
    id: 'gripper_controller', name: 'gripper_controller', tag: 'provided', pkg: 'parallel_gripper_controller (parallel_gripper_action_controller/GripperActionController)', form: 'ros2_control 컨트롤러 플러그인', group: '팔·MoveIt',
    role: '평행 그리퍼(gripper_left_joint, 오른쪽은 mimic)를 열고 닫는다. 퍽을 쥐어 손가락이 멈추면(stalled) 실패가 아니라 파지로 본다. MoveIt을 거치지 않고 coordinator·manual_control이 액션을 직접 부른다.',
    inputs: [
      ['🎬 서버', '/gripper_controller/gripper_cmd', 'control_msgs/action/ParallelGripperCommand', 'coordinator, manual_control', 'goal: command (JointState — gripper_left_joint m)'],
      ['🧩 읽기', 'gripper_left_joint/position, velocity', 'state interface (double)', 'BeebotSystemHardware', ''],
    ],
    outputs: [
      ['🧩 쓰기', 'gripper_left_joint/position', 'command interface (double, m)', 'BeebotSystemHardware', '0 = 닫힘 · 0.0265 = 열림'],
      ['🎬 결과', 'result', 'state · stalled · reached_goal', 'coordinator', '완전히 닫힘에 가까우면 빈손'],
    ],
    params: ['joint: gripper_left_joint', 'max_effort: 1.0', 'allow_stalling: true'],
    notes: ['Lyrical엔 gripper_controllers(GripperCommand)가 없어 parallel_gripper_controller를 쓴다 — MoveIt simple controller manager의 GripperCommand 타입과 안 맞아 MoveIt에는 arm_controller만 등록.', '펌웨어는 전류 기반 위치 모드 — 퍽을 쥐면 600mA에서 멈춘다.'],
  },
  {
    id: 'arm_safety_monitor', name: 'arm_safety_monitor', tag: 'custom', pkg: 'control', form: 'ROS 2 노드 (C++)', group: '팔·MoveIt',
    role: '모터 전류로 사람 손 같은 예상 못 한 접촉을 감지해 궤적을 취소하고 coordinator에 알린다. 관절 전류가 기준을 넘고 거의 멈춘 상태가 hold_s 넘게 이어지면 접촉 (움직이는 중의 전류는 중력·가속 부하라 정상).',
    inputs: [
      ['✉️ 구독', '/joint_states', 'sensor_msgs/JointState', 'joint_state_broadcaster', 'effort = DYNAMIXEL Present Current [A] · velocity'],
    ],
    outputs: [
      ['📞 호출', '/arm_controller/follow_joint_trajectory/_action/cancel_goal', 'action_msgs/srv/CancelGoal', 'arm_controller', '빈 goal_id = 전체 취소'],
      ['✉️ 발행', '/arm_safety_event', 'control/ArmSafetyEvent', 'coordinator', '접촉 시 · reason overcurrent'],
      ['✉️ 발행', '/diagnostics', 'diagnostic_msgs/DiagnosticArray', 'diagnostic_aggregator', ''],
    ],
    params: ['effort_threshold: 3.0 (A)', 'hold_s: 0.3', 'stall_velocity: 0.10 (rad/s)'],
    notes: ['effort(전류)는 BeebotSystemHardware가 펌웨어 S 줄의 관절 전류[A]를 그대로 낸다.', 'TODO(김현하): 퍽 든 정상 전류 실측 후 관절별 기준값. (실측: 초기 자세 이동 중 joint2 2.12A — 1.0A로는 팔을 못 움직임)'],
  },

  // ── ros2_control
  {
    id: 'controller_manager', name: 'controller_manager', tag: 'provided', pkg: 'controller_manager (ros2_control_node)', form: 'ROS 2 노드 (실시간 루프)', group: 'ros2_control',
    role: '하드웨어 컴포넌트(BeebotSystemHardware)와 모든 컨트롤러를 한 프로세스에 올려 100Hz로 read → update → write를 돈다. 바퀴·팔·그리퍼·IMU가 같은 OpenCR이라 하나만 둔다.',
    inputs: [
      ['✉️ 구독', '/robot_description', 'std_msgs/String', 'robot_state_publisher', 'URDF 속 <ros2_control> 태그 → 어떤 플러그인·관절·인터페이스를 쓸지'],
      ['⚙️ 파라미터', 'controllers.yaml', 'YAML 파일 (ros_system/config)', 'launch', 'update_rate, 컨트롤러 이름·타입 (+ rl_arm_correction.type은 launch 인자)'],
      ['📞 서버', '/controller_manager/load_controller', 'controller_manager_msgs/srv/LoadController', 'spawner', '컨트롤러 플러그인 로드'],
      ['📞 서버', '/controller_manager/configure_controller', 'controller_manager_msgs/srv/ConfigureController', 'spawner', 'on_configure (파라미터 읽기)'],
      ['📞 서버', '/controller_manager/switch_controller', 'controller_manager_msgs/srv/SwitchController', 'spawner·운영자', '활성화/비활성화 (체인은 뒤에서부터)'],
      ['📞 서버', '/controller_manager/list_controllers', 'controller_manager_msgs/srv/ListControllers', 'ros2 control CLI', '상태 확인'],
    ],
    outputs: [
      ['🧩 호출', 'read() / write()', 'hardware component 플러그인', 'BeebotSystemHardware', '100Hz — 장치 통신은 플러그인이 함'],
      ['🧩 호출', 'update()', '컨트롤러 플러그인', 'arm_controller, rl_arm_correction, gripper_controller, diff_drive_controller, imu_sensor_broadcaster, joint_state_broadcaster', '체인 순서대로'],
      ['✉️ 발행', '/diagnostics', 'diagnostic_msgs/DiagnosticArray', 'diagnostic_aggregator', '루프 주기·실행 시간 경고'],
    ],
    params: ['update_rate: 100', '<컨트롤러이름>.type (6개, 아래 단계 2)'],
    setup: [
      'URDF(lv2_module6/urdf/<모델>/urdf.xacro)에 <ros2_control name="BeebotSystem" type="system"> 블록 — <plugin>control/BeebotSystemHardware</plugin>, <param> mock · mock_effort · port(/dev/opencr) · baud_rate(1000000), 그리고 wheel_left/right_joint(command velocity · state position·velocity), joint1~5·gripper_left_joint(command position · state position·velocity·effort, 관절별 <param name="offset">), sensor imu(orientation·angular_velocity·linear_acceleration)를 선언.',
      'controllers.yaml의 controller_manager.ros__parameters에 update_rate: 100과 컨트롤러 6개의 type: joint_state_broadcaster/JointStateBroadcaster · imu_sensor_broadcaster/IMUSensorBroadcaster · diff_drive_controller/DiffDriveController · ml/RlArmCorrection · joint_trajectory_controller/JointTrajectoryController · parallel_gripper_action_controller/GripperActionController. 컨트롤러별 파라미터는 같은 파일의 <이름>.ros__parameters 아래에.',
      'launch(ros_system): robot_state_publisher(xacro → URDF) → ros2_control_node(parameters=[controllers.yaml, {rl_arm_correction.type}]) → spawner 하나로 joint_state_broadcaster, imu_sensor_broadcaster, diff_drive_controller, rl_arm_correction, arm_controller, gripper_controller 순서 (--param-file controllers.yaml, --controller-ros-args로 ~/cmd_vel·~/odom·~/imu 리매핑) → spawner가 끝나면 move_group.',
      '확인: ros2 control list_hardware_components → list_hardware_interfaces([claimed] 표시, joint2/effort가 보이는지) → list_controllers(전부 active) → view_controller_chains.',
      '장치를 바꾸거나 추가할 때는 controller_manager가 아니라 URDF의 <plugin>과 <param>을 바꾼다. 실기 없이: mock_hardware:=true.',
    ],
    guide: 'ros2control:connect',
    notes: ['controller_manager는 장치를 모른다 — OpenCR 연결·전송은 BeebotSystemHardware가 맡고, controller_manager는 read/update/write만 돌린다.', 'URDF는 /robot_description 토픽(robot_state_publisher)에서 받는다.', '/motor_status · /beebotsystem/reboot_motors는 이 프로세스 안의 BeebotSystemHardware가 낸다.'],
  },
  {
    id: 'hw_interface', name: 'BeebotSystemHardware (hardware interface)', tag: 'custom', pkg: 'control', form: 'ros2_control SystemInterface 플러그인 (C++)', group: 'ros2_control',
    role: 'controller_manager의 변수(double)를 OpenCR ASCII 줄로 바꿔 보내고, OpenCR 상태 줄을 state interface로 되돌린다. OpenCR 펌웨어가 DYNAMIXEL 8개(바퀴 2 · joint1~5 · 그리퍼)를 BulkWrite/SyncRead로, 내장 IMU를 맡고 단위 변환(rad ↔ 서보 값)도 펌웨어가 한다. 영점 오프셋만 여기서.',
    inputs: [
      ['🧩 읽기', 'wheel_left/right_joint/velocity', 'command interface (double, rad/s)', 'diff_drive_controller', ''],
      ['🧩 읽기', 'joint1~5/position', 'command interface (double, rad)', 'rl_arm_correction', '체인 끝 — JTC 목표 + Δ'],
      ['🧩 읽기', 'gripper_left_joint/position', 'command interface (double, m)', 'gripper_controller', 'gripper_right_joint는 mimic'],
      ['🔌 장치', 'OpenCR → SBC', 'USB 시리얼 /dev/opencr (ASCII 줄)', 'OpenCR 펌웨어 (beebot_opencr)', 'S,<40값> 10ms마다 (바퀴 pos·vel · joint1~5·그리퍼 pos·vel·전류A · IMU 10 · 모터 온도 8) · E,<8정수> 0.5s마다 (Hardware Error)'],
      ['📞 서버', '/beebotsystem/reboot_motors', 'std_srvs/srv/Trigger', 'manual_control', '에러 난 모터만 재부팅'],
      ['📞 서버', '/beebotsystem/set_arm_torque', 'std_srvs/srv/SetBool', 'manual_control (TEACH)', '팔 joint1~5·그리퍼 토크 — 펌웨어 T 줄 (바퀴는 그대로)'],
    ],
    outputs: [
      ['🔌 장치', 'SBC → OpenCR', 'USB 시리얼 ASCII 줄', 'OpenCR 펌웨어', 'C,<바퀴L·R rad/s>,<j1~j5 rad>,<그리퍼 m> 매 주기 (빈칸 = 유지) · R,<8필드> 재부팅 요청 때'],
      ['🧩 쓰기', 'wheel_*_joint/position·velocity', 'state interface (double)', 'diff_drive_controller, joint_state_broadcaster', ''],
      ['🧩 쓰기', 'joint1~5/position·velocity·effort', 'state interface (double)', 'arm_controller, rl_arm_correction, joint_state_broadcaster', 'effort = Present Current [A]'],
      ['🧩 쓰기', 'gripper_left_joint/position·velocity·effort', 'state interface (double)', 'gripper_controller, joint_state_broadcaster', ''],
      ['🧩 쓰기', 'imu/orientation·angular_velocity·linear_acceleration', 'state interface (double)', 'imu_sensor_broadcaster', ''],
      ['✉️ 발행', '/motor_status', 'control/MotorStatus', 'state_manager', '모터별 error·text·temperature — 0.5초마다 보고 바뀔 때만 · ' + LATCH],
      ['✉️ 발행', '/diagnostics', 'diagnostic_msgs/DiagnosticArray', 'diagnostic_aggregator', '"BeebotSystem: OpenCR 연결" — 마지막 S 수신 · 해석 실패 · 70°C 이상 WARN'],
    ],
    setup: [
      'control 패키지에 hardware_interface::SystemInterface를 상속한 BeebotSystemHardware를 만들고 pluginlib으로 control/BeebotSystemHardware 등록.',
      'on_init()에서 URDF <hardware><param> mock · mock_effort · port를 읽고, 실기면 관절 순서(바퀴 2 · joint1~5 · 그리퍼)가 URDF에 다 있는지 확인. 관절 <param name="offset">은 보낼 때 +, 받을 때 −.',
      'on_activate()에서 포트를 열고 첫 S를 3초 안에 받아 실제 각도로 팔 명령을 맞춘다 (못 받으면 활성화 실패 — 0rad로 튀지 않게).',
      'write(): C 줄 한 줄 — 팔 명령이 NaN이면 빈칸(유지). 재부팅 요청이 있으면 R 줄 먼저. read(): 가장 최근의 완전한 S 줄 → state (예전 펌웨어 32값이면 온도만 −1), E 줄 → 모터 에러.',
      'mock_hardware:=true(테스트베드): 명령을 그대로 상태로 되돌림 — 바퀴는 속도 적분, effort는 mock_effort[A] 고정.',
      '확인: test-hardware · test-firmware, ros2 topic echo /motor_status, ros2 control list_hardware_interfaces에 joint2/effort.',
    ],
    guide: 'ros2control:hw',
    params: ['mock: false (URDF xacro 인자 mock_hardware)', 'mock_effort: 0.0', 'port: /dev/opencr (udev 고정 이름)', 'baud_rate: 1000000', '관절별 offset (rad · m)'],
    notes: ['파라미터는 URDF의 <ros2_control><hardware><param>으로 넘긴다 (ros2 param이 아님).', 'T(토크 온/오프) 줄은 이 플러그인이 보내지 않는다 — test-firmware --torque로 사람이 쓴다.', '펌웨어 watchdog: 유효한 C가 500ms 없으면 바퀴 0 · 팔 현재 자세 유지. 프로토콜 정본은 lv2_module6/firmware/README.md.', '/motor_status는 노드가 읽는 사실(state_manager → /state/devices/<arm…> error), /diagnostics는 사람이 보는 것.'],
  },
  {
    id: 'diff_drive_controller', name: 'diff_drive_controller', tag: 'provided', pkg: 'diff_drive_controller', form: 'ros2_control 컨트롤러 플러그인', group: 'ros2_control',
    role: '(선속도, 각속도)를 좌·우 바퀴 속도로 바꾸고, 바퀴 회전량으로 오도메트리를 계산한다.',
    inputs: [
      ['✉️ 구독', '/cmd_vel', TW, 'collision_monitor', '기본 ~/cmd_vel을 spawner --controller-ros-args로 리매핑'],
      ['🧩 읽기', 'wheel_left/right position, velocity', 'state interface (double)', 'BeebotSystemHardware', ''],
    ],
    outputs: [
      ['🧩 쓰기', 'wheel_left/right/velocity', 'command interface (double, rad/s)', 'BeebotSystemHardware', ''],
      ['✉️ 발행', '/odom', 'nav_msgs/Odometry', 'ekf, rl_nav_correction', '50Hz · 기본 ~/odom을 리매핑'],
    ],
    params: ['wheel_separation: 0.287', 'wheel_radius: 0.033', 'base_frame_id: base_footprint', 'odom_frame_id: odom', 'enable_odom_tf: false', 'publish_rate: 50.0', 'twist_covariance_diagonal: vx·vy 0.001 · vyaw 0.01'],
  },
  {
    id: 'imu_sensor_broadcaster', name: 'imu_sensor_broadcaster', tag: 'provided', pkg: 'imu_sensor_broadcaster', form: 'ros2_control 브로드캐스터 플러그인', group: 'ros2_control',
    role: 'OpenCR 내장 IMU(S 줄 IMU 10값)의 state interface를 Imu 메시지로 발행한다.',
    inputs: [['🧩 읽기', 'imu/orientation·angular_velocity·linear_acceleration', 'state interface (double)', 'BeebotSystemHardware', '']],
    outputs: [['✉️ 발행', '/imu', 'sensor_msgs/Imu', 'ekf, rl_nav_correction, state_manager', '100Hz · 기본 ~/imu를 리매핑']],
    params: ['sensor_name: imu', 'frame_id: imu_link', 'static_covariance_angular_velocity: 1e-4 대각'],
    notes: ['공분산이 0이면 EKF가 IMU를 완벽으로 받아 섞는 비율이 의미 없어진다 (실측 yaw 4.5° 틀어짐).'],
  },
  {
    id: 'joint_state_broadcaster', name: 'joint_state_broadcaster', tag: 'provided', pkg: 'joint_state_broadcaster', form: 'ros2_control 브로드캐스터 플러그인', group: 'ros2_control',
    role: '모든 관절의 state interface를 JointState로 발행한다. TF·MoveIt·안전 감시·수동 조작·장치 상태가 이걸 본다.',
    inputs: [['🧩 읽기', '모든 관절 position·velocity·effort', 'state interface (double)', 'BeebotSystemHardware', '']],
    outputs: [
      ['✉️ 발행', '/joint_states', 'sensor_msgs/JointState', 'robot_state_publisher, move_group, arm_safety_monitor, manual_control, coordinator, scan_cam_gate, state_manager', '100Hz'],
      ['✉️ 발행', '/dynamic_joint_states', 'control_msgs/msg/DynamicJointState', '디버그', ''],
    ],
  },
];

/** 커스텀 인터페이스 정의 — 별도 interfaces 패키지 없이 그 메시지를 내보내는 패키지가 가진다 (.msg·.srv 파일이 정본) */
export const MSG_DEFS: [string, string][] = [
  ['perception/msg/TrackedObject.msg', `uint32 id
string class_name
float32 confidence
geometry_msgs/PoseWithCovariance pose   # map 기준 — 두 카메라 융합 위치 + 위치 공분산
geometry_msgs/Vector3 size              # m — x·y = 영상 박스 폭·높이 환산, z = 클래스 기본값
builtin_interfaces/Time last_seen       # 마지막 관측 영상 시각
string[] cameras                        # 본 카메라 (pole_front_cam | gripper_cam), 끝 = 가장 최근 · [] = 기억만
int32[2] px                             # 마지막 카메라 영상 속 박스 중심 [u, v]
string color                            # 퍽 색 · 신호등 상태 (red | yellow | green | off | all)
diagnostic_msgs/KeyValue[] details      # puck: posture·tag / location: tag / barcode: content`],
  ['perception/msg/TrackedObjectArray.msg', `std_msgs/Header header                   # frame_id: map
TrackedObject[] objects`],
  ['plan/msg/SubGoal.msg', `uint32 step
string skill        # navigate | pick | place | inspect | say
string target       # 물체 id · "x,y"(navigate) · "tray"(pick·place) · 말할 내용(say)
string relation     # front | on | ...
float32 offset_m`],
  ['plan/msg/SubGoalArray.msg', `std_msgs/Header header
uint32 plan_id
SubGoal[] goals`],
  ['plan/msg/TaskStatus.msg', `uint8 RUNNING=0
uint8 SUCCEEDED=1
uint8 FAILED=2
uint32 plan_id
uint32 step
uint8 state
string reason       # grasp_failed_all | nav_failed | arm_contact ...`],
  ['plan/msg/MissionSignal.msg', `string color      # 1단계: 옮길 퍽 색
int32 count       # 1단계: 그 색 퍽 개수
int32 sum         # 2단계: 고를 퍽들의 태그 번호 합
int32 dest_tag    # 3단계: 목적지 장소 태그 (12 · 13 · 14)
string raw        # 읽은 깜빡임 그대로 — 확인용`],
  ['control/msg/ArmSafetyEvent.msg', `std_msgs/Header header
string joint_name
float32 current_a
float32 threshold_a
string reason       # overcurrent`],
  ['control/msg/MotorStatus.msg', `std_msgs/Header header
string[] joints      # wheel_left_joint, wheel_right_joint, joint1~5, gripper_left_joint
int32[] error        # 0 정상 · -1 응답 없음 · 비트 1 입력전압 · 4 과열 · 8 엔코더 · 16 전기충격 · 32 과부하
string[] text        # "정상" · "과부하" · "응답 없음" ...
int32[] temperature  # °C · -1 모름`],
  ['ml/srv/ScoreGrasps.srv', `uint32 object_id
uint8 max_candidates
---
geometry_msgs/PoseStamped[] grasps   # IK 통과한 것만, 점수 높은 순
float32[] scores                     # 0~1, grasps와 같은 순서
bool success
string message`],
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 카드 안의 노드 이름을 다른 카드로 가는 버튼으로 (긴 이름부터 치환해 부분 일치 방지)
const NAME_INDEX: [string, string][] = (() => {
  const pairs: [string, string][] = [];
  for (const d of NODE_DOCS) {
    pairs.push([d.name, d.id]);
    const base = d.name.split(' (')[0];
    if (base !== d.name) pairs.push([base, d.id]);
  }
  pairs.push(['realsense2_camera (pole_front_cam)', 'realsense_pole'], ['realsense2_camera (gripper_cam)', 'realsense_gripper'], ['ekf', 'ekf'], ['ekf_filter_node', 'ekf'], ['teleop', 'teleop'], ['global_costmap', 'planner_server'], ['local_costmap', 'controller_server'],
    ['rgbdx_sync', 'rgbd_sync'], ['lifecycle_manager_base', 'lifecycle_manager'], ['lifecycle_manager_navigation', 'lifecycle_manager'], ['spawner', 'controller_manager']);
  return pairs.sort((a, b) => b[0].length - a[0].length);
})();

const linkify = (text: string, self: string) => {
  const parts = text.split(/(,\s*)/);
  return parts.map(p => {
    const t = p.trim();
    for (const [name, id] of NAME_INDEX) {
      if (id === self) continue;
      const i = t.indexOf(name);
      if (i < 0) continue;
      const before = t[i - 1], after = t[i + name.length];
      if ((before && /[\w/]/.test(before)) || (after && /[\w/]/.test(after))) continue;
      return esc(p.slice(0, p.indexOf(name))) + `<button class="rd-nref" data-node="${id}">${esc(name)}</button>` + esc(p.slice(p.indexOf(name) + name.length));
    }
    return esc(p);
  }).join('');
};

// 타입 칸의 'pkg/Name' 또는 'pkg/msg/Name'을 메시지 타입 탭 링크로
const linkType = (type: string) =>
  esc(type).replace(/\b[a-z0-9_]+\/(?:(?:msg|srv|action)\/)?[A-Z]\w*/g, m => {
    const id = toMsgId(m);
    return id ? `<button class="rd-mref" data-msg="${id}" title="메시지 타입 탭에서 보기">${m}</button>` : m;
  });

// 노드 카드 → 파라미터 사전 그룹 (주요 파라미터를 사전 행으로 링크)
const NODE_PARAM_GROUPS: Record<string, string[]> = {
  realsense_pole: ['realsense2_camera'], realsense_gripper: ['realsense2_camera'],
  robot_state_publisher: ['robot_state_publisher'], rtabmap: ['rtabmap_node', 'rtabmap_core'],
  bt_navigator: ['nav2_bt_navigator'], planner_server: ['nav2_planner_server', 'nav2_navfn', 'nav2_costmap', 'nav2_static_layer', 'nav2_obstacle_layer', 'nav2_inflation_layer'],
  controller_server: ['nav2_controller_server', 'nav2_dwb_kinematic', 'nav2_dwb_controller', 'nav2_dwb_traj_gen', 'nav2_costmap'],
  behavior_server: ['nav2_behavior_server'], costmap: ['nav2_costmap', 'nav2_voxel_layer', 'nav2_obstacle_layer', 'nav2_inflation_layer', 'nav2_static_layer'],
  lifecycle_manager: ['nav2_lifecycle_manager'], velocity_smoother: ['nav2_velocity_smoother'], collision_monitor: ['nav2_collision_monitor'],
  ekf: ['robot_localization'], diff_drive_controller: ['ctl_diff_drive_controller'], imu_sensor_broadcaster: ['ctl_imu_sensor_broadcaster'],
  joint_state_broadcaster: ['ctl_joint_state_broadcaster'], arm_controller: ['ctl_joint_trajectory_controller'],
  gripper_controller: ['ctl_parallel_gripper_action_controller'], controller_manager: ['ctl_controller_manager'], teleop: [], voice_ui: [],
};

/** "이름: 값" 형태의 주요 파라미터에서 이름을 찾아 사전 행 링크로 */
const linkParam = (text: string, node: string) => {
  const name = text.split(/[:(]/)[0].trim();
  for (const gid of NODE_PARAM_GROUPS[node] ?? []) {
    const g = PARAM_GROUPS.find(x => x.id === gid);
    // 정확히 같거나, 사전 키의 끝이 같으면 (min_obstacle_height → voxel_layer.pointcloud.min_obstacle_height). 여럿이면 설계값 있는 행 우선
    const hits = g?.params.filter(x => x.key === name || x.name === name || (x.key && (name.endsWith('.' + x.key) || x.key.endsWith('.' + name)))) ?? [];
    const p = hits.find(x => x.design) ?? hits[0];
    if (p) return `<button class="rd-pref" data-pg="${gid}" data-p="${esc(p.name)}" title="파라미터 사전에서 보기">${esc(text)}</button>`;
  }
  return `<code>${esc(text)}</code>`;
};

const ioTable = (rows: IO[], self: string, peerHead: string) => rows.length ? `
  <table class="rd-io"><thead><tr><th>방식</th><th>이름</th><th>메시지 타입 / 형식</th><th>${peerHead}</th><th>비고</th></tr></thead><tbody>
  ${rows.map(([how, name, type, peer, note]) => `<tr><td class="rd-how">${esc(how)}</td><td data-h="이름"><code>${esc(name)}</code></td><td data-h="타입"><code>${linkType(type)}</code></td><td data-h="${peerHead}">${linkify(peer, self)}</td><td data-h="비고"${note ? '' : ' class="rd-empty"'}>${esc(note ?? '')}</td></tr>`).join('')}
  </tbody></table>` : '<p class="rd-none">없음</p>';

export const renderCatalog = (backLabel?: string) => {
  const groups = [...new Set(NODE_DOCS.map(d => d.group))];
  const index = groups.map(g => `<div class="rd-cidx"><b>${esc(g)}</b>${NODE_DOCS.filter(d => d.group === g)
    .map(d => `<button class="rd-nref" data-node="${d.id}">${d.tag === 'custom' ? '🛠️' : '📦'} ${esc(d.name.split(' (')[0])}</button>`).join('')}</div>`).join('');
  const cards = groups.map(g => `<h3 class="rd-cgroup">${esc(g)}</h3>` + NODE_DOCS.filter(d => d.group === g).map(d => `
    <section class="rd-card ${d.tag}" id="node-${d.id}">
      <header>
        <span class="rd-ctag">${d.tag === 'custom' ? '🛠️ 직접 작성' : '📦 제공'}</span>
        <h4>${esc(d.name)}</h4>
      </header>
      <div class="rd-cmeta"><span>패키지 <code>${esc(d.pkg)}</code></span><span>형태 ${esc(d.form)}</span></div>
      <p class="rd-crole">${esc(d.role)}</p>
      <h5>⬅ 받는 것 (입력)</h5>
      ${ioTable(d.inputs, d.id, '보내는 쪽')}
      <h5>➡ 내보내는 것 (출력)</h5>
      ${ioTable(d.outputs, d.id, '받는 쪽')}
      ${d.params?.length ? `<h5>⚙️ 주요 파라미터</h5><ul class="rd-params">${d.params.map(p => `<li>${linkParam(p, d.id)}</li>`).join('')}</ul>` : ''}
      ${d.setup?.length ? `<h5>🔧 직접 연결·설정할 것</h5><ol class="rd-setup">${d.setup.map(n => `<li>${esc(n)}</li>`).join('')}</ol>` : ''}
      ${d.guide ? `<button class="rd-guide" data-concept="${d.guide.split(':')[0]}" data-cs="${d.guide.split(':')[1] ?? ''}">📘 ros2_control 탭에서 자세히 →</button>` : ''}
      ${d.notes?.length ? `<h5>📝 주의</h5><ul>${d.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    </section>`).join('')).join('');
  const msgs = MSG_DEFS.map(([f, body]) => `<div class="rd-msg"><div class="rd-msgf">${esc(f)}</div><pre><code>${esc(body)}</code></pre></div>`).join('');
  return `
    ${backLabel ? `<button class="rd-back">↩ ${esc(backLabel)}(으)로 돌아가기</button>` : ''}
    <h2>노드 사전</h2>
    <p>도식의 노드를 누르면 여기로 옵니다. 카드마다 <b>제공/직접 작성</b>, 패키지, 형태, <b>받는 것</b>(구독·서비스 서버·액션 서버·인터페이스)과 <b>내보내는 것</b>(발행·호출·요청)을 메시지 타입과 함께 적었습니다. 표 안의 노드 이름을 누르면 그 카드로 이동합니다.</p>
    <p class="rd-howlegend">메시지 타입을 누르면 <b>메시지 타입</b> 탭에서 필드 정의를 볼 수 있습니다 (뒤로가기로 돌아옴).<br/>방식: ✉️ 구독/발행 = 토픽 · 📞 서버/호출/응답 = 서비스 · 🎬 서버/요청/결과 = 액션 · 🧩 읽기/쓰기 = ros2_control 인터페이스 · 🔌 장치 = USB·시리얼 · 🗣️ 사람 → 로봇 · 🔊 로봇 → 사람 · 💾 파일 · ⚙️ 파라미터 · 🌐 외부 API</p>
    <div class="rd-cindex">${index}</div>
    ${cards}
    <h3 class="rd-cgroup" id="node-msgs">커스텀 인터페이스 정의 (패키지별 — perception · plan · control · ml)</h3>
    <div class="rd-msgs">${msgs}</div>
  `;
};

export const NODE_IDS = new Set(NODE_DOCS.map(d => d.id));
