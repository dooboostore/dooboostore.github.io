import { toMsgId } from './RosMsgsData';
import { PARAM_GROUPS } from './RosParamsData';

// 실전노드설계 탭의 "노드 사전" 데이터와 렌더러.
// 도식의 노드를 누르면 이 카드로 스크롤된다 (RosDesign의 nodes 맵 → NODE_DOCS id).

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
const PTS = '/pole_cam/depth/color/points';

export const NODE_DOCS: NodeDoc[] = [
  // ── 센서·인지
  {
    id: 'realsense_pole', name: 'realsense2_camera (pole_cam)', tag: 'provided', pkg: 'realsense2_camera', form: 'ROS 2 노드', group: '센서·인지',
    role: '폴대에 고정된 RealSense를 USB 3로 열어 컬러 영상, 컬러에 정렬된 depth, 점구름을 발행한다. 로봇의 "눈" 전체 — 인지·SLAM·장애물·octomap이 모두 여기서 나온다.',
    inputs: [
      ['🔌 장치', 'pole_cam RealSense', 'librealsense2 (USB 3)', '카메라 하드웨어', 'serial_no로 어느 카메라인지 지정'],
    ],
    outputs: [
      ['✉️ 발행', '/pole_cam/color/image_raw', 'sensor_msgs/Image (rgb8)', 'perception, rtabmap', '30Hz · best_effort'],
      ['✉️ 발행', '/pole_cam/color/camera_info', 'sensor_msgs/CameraInfo', 'perception, rtabmap', '내부 파라미터 (fx, fy, cx, cy)'],
      ['✉️ 발행', '/pole_cam/aligned_depth_to_color/image_raw', 'sensor_msgs/Image (16UC1, mm)', 'perception, rtabmap', '컬러 픽셀과 1:1 정렬된 depth'],
      ['✉️ 발행', PTS, 'sensor_msgs/PointCloud2', 'costmap_2d, collision_monitor, move_group', '10~15Hz로 다운샘플 권장'],
      ['✉️ 발행', '/tf_static', 'tf2_msgs/TFMessage', '전체', 'pole_cam_link → color/depth optical 프레임'],
    ],
    params: ['serial_no', "camera_namespace: ''", 'camera_name: pole_cam', 'rgb_camera.color_profile: 640x480x30', 'depth_module.depth_profile: 640x480x30', 'align_depth.enable: true', 'pointcloud.enable: true', 'decimation_filter.enable: true'],
    notes: ['URDF에 카메라 내부 프레임까지 넣었다면 드라이버의 publish_tf를 끄고 하나만 남긴다.', 'depth 단위는 16UC1 = 밀리미터. 32FC1(미터)로 바꾸는 노드와 섞지 않는다.'],
  },
  {
    id: 'realsense_gripper', name: 'realsense2_camera (gripper_cam)', tag: 'provided', pkg: 'realsense2_camera', form: 'ROS 2 노드', group: '센서·인지',
    role: '그리퍼에 달린 RealSense. 팔과 함께 움직이며 파지 직전의 근접 영상·점구름을 준다.',
    inputs: [
      ['🔌 장치', 'gripper_cam RealSense', 'librealsense2 (USB 3)', '카메라 하드웨어', 'pole_cam과 다른 serial_no'],
    ],
    outputs: [
      ['✉️ 발행', '/gripper_cam/color/image_raw', 'sensor_msgs/Image (rgb8)', 'perception', '15Hz · best_effort'],
      ['✉️ 발행', '/gripper_cam/color/camera_info', 'sensor_msgs/CameraInfo', 'perception', ''],
      ['✉️ 발행', '/gripper_cam/aligned_depth_to_color/image_raw', 'sensor_msgs/Image (16UC1, mm)', 'perception', ''],
      ['✉️ 발행', '/gripper_cam/depth/color/points', 'sensor_msgs/PointCloud2', 'grasp_scorer', '근접 파지 점구름'],
    ],
    params: ['serial_no', "camera_namespace: ''", 'camera_name: gripper_cam', 'rgb_camera.color_profile: 640x480x15', 'align_depth.enable: true', 'pointcloud.enable: true'],
    notes: ['D435 계열은 최소 측정 거리 약 0.2~0.3m — 그리퍼가 컵에 바짝 붙으면 depth가 빈다. 접근 시작점에서 미리 찍어 두거나 D405 같은 근거리 모델을 쓴다.', '움직이는 카메라라 점구름을 쓸 땐 영상 시각(header.stamp)의 TF로 변환해야 위치가 맞는다.'],
  },
  {
    id: 'perception', name: 'perception', tag: 'custom', pkg: 'cupbot_perception', form: 'ROS 2 노드 (Python 또는 C++)', group: '센서·인지',
    role: '두 카메라 영상에서 물체를 검출하고, depth로 3D 위치를 구해 map 좌표로 바꾼 뒤 id를 붙여 추적한다. VLM·coordinator·grasp_scorer가 같은 물체를 id로 가리킬 수 있게 하는 게 핵심.',
    inputs: [
      ['✉️ 구독', '/pole_cam/color/image_raw', 'sensor_msgs/Image', 'realsense2_camera (pole_cam)', 'message_filters로 depth와 시각 동기화'],
      ['✉️ 구독', '/pole_cam/aligned_depth_to_color/image_raw', 'sensor_msgs/Image', 'realsense2_camera (pole_cam)', ''],
      ['✉️ 구독', '/pole_cam/color/camera_info', 'sensor_msgs/CameraInfo', 'realsense2_camera (pole_cam)', '픽셀 → 3D 역투영'],
      ['✉️ 구독', '/gripper_cam/color/image_raw', 'sensor_msgs/Image', 'realsense2_camera (gripper_cam)', 'pick 단계에서만 켬'],
      ['✉️ 구독', '/gripper_cam/aligned_depth_to_color/image_raw', 'sensor_msgs/Image', 'realsense2_camera (gripper_cam)', ''],
      ['✉️ 구독', '/tf, /tf_static', 'tf2_msgs/TFMessage', 'robot_state_publisher, rtabmap, ekf', '카메라 → map 변환 (영상 시각 기준)'],
    ],
    outputs: [
      ['✉️ 발행', '/tracked_objects', 'cupbot_interfaces/TrackedObjectArray', 'vlm_task_planner, coordinator, grasp_scorer', '10Hz · reliable'],
    ],
    params: ['model_path (검출 모델 ONNX)', 'conf_threshold: 0.5', 'track_timeout_s: 3.0', 'target_frame: map'],
    notes: ['검출 모델은 Isaac Sim Replicator 합성 데이터 + 실사진으로 파인튜닝 (학습 설계 탭).', '같은 물체가 잠깐 가려져도 id가 유지되도록 track_timeout 동안 기억한다.'],
  },
  {
    id: 'robot_state_publisher', name: 'robot_state_publisher', tag: 'provided', pkg: 'robot_state_publisher', form: 'ROS 2 노드', group: '센서·인지',
    role: 'URDF와 관절 각도로 로봇 몸의 모든 링크 좌표(TF)를 계산해 낸다. 카메라·팔·그리퍼 위치가 전부 여기서 이어진다.',
    inputs: [
      ['✉️ 구독', '/joint_states', 'sensor_msgs/JointState', 'joint_state_broadcaster', '팔·바퀴·그리퍼 관절각'],
      ['⚙️ 파라미터', 'robot_description', 'URDF 문자열 (xacro 결과)', 'launch', '카메라 2대·ros2_control 태그 포함'],
    ],
    outputs: [
      ['✉️ 발행', '/tf', 'tf2_msgs/TFMessage', '전체', '움직이는 관절 (팔 링크)'],
      ['✉️ 발행', '/tf_static', 'tf2_msgs/TFMessage', '전체', '고정 링크 (카메라 마운트 등) · transient_local'],
      ['✉️ 발행', '/robot_description', 'std_msgs/String', 'controller_manager, move_group', 'transient_local — Jazzy의 controller_manager는 이 토픽에서 URDF를 받는다'],
    ],
  },

  // ── 계획·임무
  {
    id: 'voice_ui', name: 'voice_ui', tag: 'custom', pkg: 'cupbot_mission', form: 'ROS 2 노드 (Python)', group: '계획·임무',
    role: '사람과 로봇 사이의 입출력. 사람의 말(또는 화면 입력)을 텍스트 명령으로 바꿔 내보내고, 로봇이 할 말을 음성으로 읽어 준다. 사람은 토픽을 직접 내지 않으므로 이 노드가 그 경계를 맡는다.',
    inputs: [
      ['🗣️ 사람', '음성·텍스트 명령', '마이크 오디오 · 화면 입력', '사람', '예: "테이블 위 컵 가져다줘"'],
      ['🔌 장치', '마이크', 'USB 오디오', '마이크 하드웨어', 'wake word 후 녹음'],
      ['✉️ 구독', '/robot_say', 'std_msgs/String', 'coordinator', '읽어 줄 문장'],
      ['✉️ 구독', '/task_status', 'cupbot_interfaces/TaskStatus', 'coordinator', '진행 상황 화면 표시'],
    ],
    outputs: [
      ['✉️ 발행', '/user_command', 'std_msgs/String', 'vlm_task_planner', '인식한 문장'],
      ['🔊 사람', '음성 안내', 'TTS → 스피커', '사람', '예: "컵 가져왔어요", "컵을 잡을 수 없어요"'],
    ],
    params: ['stt_engine (예: whisper)', 'tts_engine', 'language: ko', 'wake_word'],
    notes: ['오인식한 명령이 그대로 실행되지 않도록 VLM 계획 전에 "테이블 위 컵을 가져올까요?"처럼 되묻는 확인 단계를 둘 수 있다.'],
  },
  {
    id: 'vlm_task_planner', name: 'vlm_task_planner', tag: 'custom', pkg: 'cupbot_mission', form: 'ROS 2 노드 (Python)', group: '계획·임무',
    role: '사람 명령과 인식 결과를 VLM에 보내 "무엇을 어떤 순서로" 할지만 정한다. 실행 세부(파지점, 속도)는 결정하지 않는다.',
    inputs: [
      ['✉️ 구독', '/user_command', 'std_msgs/String', 'voice_ui', '명령마다'],
      ['✉️ 구독', '/tracked_objects', 'cupbot_interfaces/TrackedObjectArray', 'perception', '최신 목록을 프롬프트에 넣음'],
      ['✉️ 구독', '/pole_cam/color/image_raw', 'sensor_msgs/Image', 'realsense2_camera (pole_cam)', '계획할 때 한 장만'],
      ['✉️ 구독', '/task_status', 'cupbot_interfaces/TaskStatus', 'coordinator', 'FAILED면 재계획'],
    ],
    outputs: [
      ['✉️ 발행', '/sub_goals', 'cupbot_interfaces/SubGoalArray', 'coordinator', 'reliable + transient_local'],
      ['🌐 외부', 'VLM API', 'HTTPS (JSON 응답 강제)', 'VLM 서비스', '수 초 걸림 — 제어 루프 밖'],
    ],
    params: ['model', 'allowed_skills: [navigate, pick, place, say]', 'max_replans: 2', 'timeout_s: 20'],
    notes: ['출력은 JSON 스키마로 강제하고, 파싱 실패하면 재요청 1회 후 사람에게 알린다.'],
  },
  {
    id: 'coordinator', name: 'coordinator', tag: 'custom', pkg: 'cupbot_mission', form: 'ROS 2 노드 (C++ + BehaviorTree.CPP)', group: '계획·임무',
    role: 'VLM 계획을 검증하고 Nav2·MoveIt에 액션으로 실행을 맡긴다. 이동 전 팔 접기, 정지 후에만 팔 동작, 파지 재시도, 실패 보고 같은 실행 규칙을 지키는 유일한 실행권자.',
    inputs: [
      ['✉️ 구독', '/sub_goals', 'cupbot_interfaces/SubGoalArray', 'vlm_task_planner', ''],
      ['✉️ 구독', '/tracked_objects', 'cupbot_interfaces/TrackedObjectArray', 'perception', '대상 id 존재 확인, 목표 좌표 계산'],
      ['✉️ 구독', '/arm_safety_event', 'cupbot_interfaces/ArmSafetyEvent', 'arm_safety_monitor', '접촉 → 단계 실패 처리'],
      ['✉️ 구독', '/tf', 'tf2_msgs/TFMessage', 'rtabmap, ekf', 'map→base_footprint가 나와야 이동 시작'],
    ],
    outputs: [
      ['🎬 요청', '/navigate_to_pose', 'nav2_msgs/action/NavigateToPose', 'bt_navigator', 'feedback: 남은 거리 · result: 성공/실패'],
      ['🎬 요청', '/execute_task_solution', 'moveit_task_constructor_msgs/action/ExecuteTaskSolution', 'move_group', 'MTC 태스크는 이 노드 안에서 계획'],
      ['📞 호출', '/score_grasps', 'cupbot_interfaces/srv/ScoreGrasps', 'grasp_scorer', 'pick 직전 1회'],
      ['📞 호출', '/apply_planning_scene', 'moveit_msgs/srv/ApplyPlanningScene', 'move_group', '테이블·컵 CollisionObject 등록'],
      ['📞 호출', '/clear_octomap', 'std_srvs/srv/Empty', 'move_group', 'pick 직전 octomap 초기화'],
      ['📞 호출', '/local_costmap/local_costmap/set_parameters', 'rcl_interfaces/srv/SetParameters', 'controller_server', '컵을 들면 footprint 확장'],
      ['✉️ 발행', '/task_status', 'cupbot_interfaces/TaskStatus', 'vlm_task_planner, voice_ui', '단계 시작·완료·실패'],
      ['✉️ 발행', '/robot_say', 'std_msgs/String', 'voice_ui', '사람에게 할 말 — "컵 가져왔어요", "컵을 잡을 수 없어요"'],
    ],
    params: ['max_retries_per_step: 2', 'settle_time_s: 0.5', 'stow_pose', 'carry_footprint'],
    notes: ['MTC(MoveIt Task Constructor)는 라이브러리라 태스크 계획은 coordinator 프로세스에서, 실행은 move_group의 ExecuteTaskSolution 기능으로 한다.', '파지 2순위 재시도는 여기서 처리하고, 모두 실패했을 때만 VLM에 재계획을 요청한다.'],
  },
  {
    id: 'grasp_scorer', name: 'grasp_scorer', tag: 'custom', pkg: 'cupbot_learning', form: 'ROS 2 서비스 노드 (Python + ONNX Runtime)', group: '계획·임무',
    role: '컵 주변에 파지 후보를 만들고, OM-X가 IK로 닿는 것만 남긴 뒤 학습 모델로 성공 확률을 매겨 높은 순으로 돌려준다.',
    inputs: [
      ['📞 서버', '/score_grasps', 'cupbot_interfaces/srv/ScoreGrasps', 'coordinator', '요청: object_id, max_candidates'],
      ['✉️ 구독', '/tracked_objects', 'cupbot_interfaces/TrackedObjectArray', 'perception', '대상 컵의 위치·크기'],
      ['✉️ 구독', '/gripper_cam/depth/color/points', 'sensor_msgs/PointCloud2', 'realsense2_camera (gripper_cam)', '최신 1장 캐시'],
    ],
    outputs: [
      ['📞 응답', '/score_grasps', 'grasps: PoseStamped[] · scores: float32[]', 'coordinator', '점수 높은 순'],
      ['📞 호출', '/compute_ik', 'moveit_msgs/srv/GetPositionIK', 'move_group', '후보마다 도달 가능 여부 확인'],
    ],
    params: ['model_path (ONNX)', 'num_samples: 48', 'min_score: 0.3', 'enabled (false면 규칙 기반: 옆에서 수평)'],
  },
  {
    id: 'rl_nav_tuner', name: 'rl_nav_tuner', tag: 'custom', pkg: 'cupbot_learning', form: 'ROS 2 노드 (규칙 → 필요 시 RL)', group: '계획·임무',
    role: '주변 상황(통로 폭, 장애물 거리, 목표 거리)을 보고 주행 프리셋 A/B/C 중 하나를 골라 속도 상한과 DWB 운동 파라미터를 바꾼다.',
    inputs: [
      ['✉️ 구독', '/local_costmap/costmap', 'nav_msgs/OccupancyGrid', 'controller_server', '통로 폭·최근접 장애물 계산'],
      ['✉️ 구독', '/odometry/filtered', 'nav_msgs/Odometry', 'ekf', '현재 속도'],
      ['✉️ 구독', '/plan', 'nav_msgs/Path', 'planner_server', '목표까지 남은 거리'],
    ],
    outputs: [
      ['✉️ 발행', '/speed_limit', 'nav2_msgs/SpeedLimit', 'controller_server, rl_nav_correction', 'percentage: true, speed_limit: 100/60/40'],
      ['📞 호출', '/controller_server/set_parameters', 'rcl_interfaces/srv/SetParameters', 'controller_server', 'FollowPath.max_vel_theta, acc_lim_x, decel_lim_x'],
    ],
    params: ['rate_hz: 1.0', 'hysteresis_s: 2.0 (프리셋이 출렁이지 않게)', 'enabled (false면 프리셋 A 고정)'],
    notes: ['DWB critic 가중치는 실행 중 바꿔도 반영되지 않을 수 있어 건드리지 않는다.'],
  },

  // ── Nav2·위치추정
  {
    id: 'rtabmap', name: 'rtabmap', tag: 'provided', pkg: 'rtabmap_slam (rtabmap_ros)', form: 'ROS 2 노드', group: 'Nav2·위치추정',
    role: 'RGB-D SLAM. 매핑 모드에서는 지도를 만들어 rtabmap.db에 저장하고, 위치추정 모드에서는 같은 DB로 로봇 위치를 찾아 map→odom을 낸다. Nav2용 2D 지도(/map)도 depth로 직접 만든다.',
    inputs: [
      ['✉️ 구독', '/pole_cam/color/image_raw', 'sensor_msgs/Image', 'realsense2_camera (pole_cam)', 'approx_sync'],
      ['✉️ 구독', '/pole_cam/aligned_depth_to_color/image_raw', 'sensor_msgs/Image', 'realsense2_camera (pole_cam)', ''],
      ['✉️ 구독', '/pole_cam/color/camera_info', 'sensor_msgs/CameraInfo', 'realsense2_camera (pole_cam)', ''],
      ['✉️ 구독', '/odometry/filtered', 'nav_msgs/Odometry', 'ekf', '시각 오도메트리 대신 휠+IMU'],
      ['💾 파일', '~/.ros/rtabmap.db', 'SQLite DB', '디스크', '위치추정 모드에서 읽음'],
    ],
    outputs: [
      ['✉️ 발행', '/map', 'nav_msgs/OccupancyGrid', 'planner_server (global_costmap static layer)', 'transient_local'],
      ['✉️ 발행', '/tf', 'tf2_msgs/TFMessage', '전체', 'map → odom'],
      ['💾 파일', '~/.ros/rtabmap.db', 'SQLite DB', '디스크', '매핑 모드에서 저장'],
      ['✉️ 발행', '/mapData', 'rtabmap_msgs/MapData', 'RViz (rtabmap_viz)', '그래프 시각화용'],
    ],
    params: ['frame_id: base_footprint', 'subscribe_depth: true', 'approx_sync: true', 'Reg/Force3DoF: true', 'Grid/Sensor: 1 (depth)', 'Mem/IncrementalMemory: true(매핑) / false(위치추정)', 'Mem/InitWMWithAllNodes: true (위치추정)'],
    notes: ['Nav2 lifecycle 관리 대상이 아니다. localization용 lifecycle_manager가 필요 없다.', '위치추정 모드는 시작 직후 장면을 맞출 때까지 map→odom이 없다 — coordinator가 TF를 기다린다.'],
  },
  {
    id: 'bt_navigator', name: 'bt_navigator', tag: 'provided', pkg: 'nav2_bt_navigator', form: 'ROS 2 lifecycle 노드', group: 'Nav2·위치추정',
    role: 'NavigateToPose 목표를 받아 행동 트리로 "경로 계산 → 따라가기 → 막히면 복구"를 지휘한다.',
    inputs: [
      ['🎬 서버', '/navigate_to_pose', 'nav2_msgs/action/NavigateToPose', 'coordinator', 'goal: PoseStamped (map)'],
      ['✉️ 구독', '/odometry/filtered', 'nav_msgs/Odometry', 'ekf', 'odom_topic 파라미터'],
      ['✉️ 구독', '/tf', 'tf2_msgs/TFMessage', 'rtabmap, ekf', 'map→base_footprint'],
    ],
    outputs: [
      ['🎬 요청', '/compute_path_to_pose', 'nav2_msgs/action/ComputePathToPose', 'planner_server', '약 1Hz 재계획'],
      ['🎬 요청', '/follow_path', 'nav2_msgs/action/FollowPath', 'controller_server', ''],
      ['🎬 요청', '/spin, /backup, /wait', 'nav2_msgs/action/Spin · BackUp · Wait', 'behavior_server', '복구'],
    ],
    params: ['robot_base_frame: base_footprint', 'default_nav_to_pose_bt_xml (BackUp 제한 버전)', 'odom_topic: /odometry/filtered'],
    notes: ['카메라가 앞만 보므로 BackUp 복구는 빼거나 0.1m 이하로 제한한 BT XML을 쓴다.'],
  },
  {
    id: 'planner_server', name: 'planner_server', tag: 'provided', pkg: 'nav2_planner', form: 'ROS 2 lifecycle 노드 (+ global_costmap)', group: 'Nav2·위치추정',
    role: '지도와 장애물을 반영한 전역 경로를 만든다. 안에 global_costmap이 들어 있다.',
    inputs: [
      ['🎬 서버', '/compute_path_to_pose', 'nav2_msgs/action/ComputePathToPose', 'bt_navigator', ''],
      ['✉️ 구독', '/map', 'nav_msgs/OccupancyGrid', 'rtabmap', 'static layer'],
      ['✉️ 구독', PTS, 'sensor_msgs/PointCloud2', 'realsense2_camera (pole_cam)', 'voxel layer'],
      ['✉️ 구독', '/tf', 'tf2_msgs/TFMessage', 'rtabmap, ekf', ''],
    ],
    outputs: [
      ['✉️ 발행', '/plan', 'nav_msgs/Path', 'rl_nav_correction, rl_nav_tuner, RViz', '계획마다'],
      ['✉️ 발행', '/global_costmap/costmap', 'nav_msgs/OccupancyGrid', 'RViz', ''],
    ],
    params: ['planner_plugins: [GridBased] (NavFn 또는 SmacPlanner2D)', 'global_costmap.plugins: [static_layer, voxel_layer, inflation_layer]', 'robot_base_frame: base_footprint'],
  },
  {
    id: 'controller_server', name: 'controller_server', tag: 'provided', pkg: 'nav2_controller', form: 'ROS 2 lifecycle 노드 (+ local_costmap · DWB)', group: 'Nav2·위치추정',
    role: '전역 경로를 따라가는 속도 명령을 20Hz로 계산한다. 안에 local_costmap과 DWB 컨트롤러가 들어 있다.',
    inputs: [
      ['🎬 서버', '/follow_path', 'nav2_msgs/action/FollowPath', 'bt_navigator', ''],
      ['✉️ 구독', '/odometry/filtered', 'nav_msgs/Odometry', 'ekf', ''],
      ['✉️ 구독', '/speed_limit', 'nav2_msgs/SpeedLimit', 'rl_nav_tuner', '속도 상한 (백분율)'],
      ['✉️ 구독', PTS, 'sensor_msgs/PointCloud2', 'realsense2_camera (pole_cam)', 'local voxel layer'],
      ['📞 서버', '/controller_server/set_parameters', 'rcl_interfaces/srv/SetParameters', 'rl_nav_tuner', 'kinematic 파라미터 런타임 변경'],
      ['📞 서버', '/local_costmap/local_costmap/set_parameters', 'rcl_interfaces/srv/SetParameters', 'coordinator', 'footprint 변경'],
    ],
    outputs: [
      ['✉️ 발행', '/cmd_vel_nav', TW, 'rl_nav_correction', '20Hz'],
      ['✉️ 발행', '/local_costmap/costmap', 'nav_msgs/OccupancyGrid', 'rl_nav_tuner, RViz', ''],
      ['✉️ 발행', '/local_costmap/costmap_raw', 'nav2_msgs/Costmap', 'behavior_server', ''],
    ],
    params: ['controller_frequency: 20.0', 'FollowPath.plugin: dwb_core::DWBLocalPlanner', 'FollowPath.max_vel_x: 0.26', 'enable_stamped_cmd_vel: true'],
  },
  {
    id: 'behavior_server', name: 'behavior_server', tag: 'provided', pkg: 'nav2_behaviors', form: 'ROS 2 lifecycle 노드', group: 'Nav2·위치추정',
    role: '막혔을 때의 복구 동작(제자리 회전, 후진, 대기)을 실행한다.',
    inputs: [
      ['🎬 서버', '/spin, /backup, /wait', 'nav2_msgs/action/Spin · BackUp · Wait', 'bt_navigator', ''],
      ['✉️ 구독', '/local_costmap/costmap_raw', 'nav2_msgs/Costmap', 'controller_server', '충돌 검사'],
    ],
    outputs: [
      ['✉️ 발행', '/cmd_vel_nav', TW, 'rl_nav_correction', '리매핑해서 안전 체인을 똑같이 지나게 함'],
    ],
    params: ['behavior_plugins: [spin, backup, wait]', 'backup 최대 거리 0.1m (BT에서 제한)'],
  },
  {
    id: 'costmap', name: 'costmap_2d (voxel layer)', tag: 'provided', pkg: 'nav2_costmap_2d', form: '플러그인 (planner_server·controller_server 안, 노드 아님)', group: 'Nav2·위치추정',
    role: '점구름을 3D 격자(voxel)에 쌓아 2D 비용 지도로 내린다. LiDAR가 없어서 장애물은 전부 이 층으로 들어온다.',
    inputs: [
      ['✉️ 구독', PTS, 'sensor_msgs/PointCloud2', 'realsense2_camera (pole_cam)', 'observation_sources: pointcloud'],
      ['✉️ 구독', '/map', 'nav_msgs/OccupancyGrid', 'rtabmap', 'global만 (static layer)'],
    ],
    outputs: [
      ['🧩 내부', '비용 격자', 'Costmap2D (메모리)', 'planner_server, controller_server', '같은 프로세스'],
      ['✉️ 발행', '/global_costmap/costmap, /local_costmap/costmap', 'nav_msgs/OccupancyGrid', 'RViz, rl_nav_tuner', ''],
    ],
    params: ['voxel_layer.pointcloud.data_type: PointCloud2', 'min_obstacle_height: 0.03', 'max_obstacle_height: 0.40', 'marking: true, clearing: true', 'inflation_layer.inflation_radius: 0.25'],
    notes: ['화각 밖 장애물이 바로 지워지지 않게 clearing을 보수적으로 둔다 (STVL로 바꾸면 시간 감쇠 가능).'],
  },
  {
    id: 'lifecycle_manager', name: 'lifecycle_manager_navigation', tag: 'provided', pkg: 'nav2_lifecycle_manager', form: 'ROS 2 노드', group: 'Nav2·위치추정',
    role: 'Nav2 서버들을 정해진 순서로 configure → activate 하고, 하나가 죽으면 전체를 내린다.',
    inputs: [
      ['📞 서버', '/lifecycle_manager_navigation/manage_nodes', 'nav2_msgs/srv/ManageLifecycleNodes', '운영자·launch', '시작·정지·리셋'],
    ],
    outputs: [
      ['📞 호출', '*/change_state', 'lifecycle_msgs/srv/ChangeState', 'bt_navigator, planner_server, controller_server, behavior_server, velocity_smoother, collision_monitor', ''],
    ],
    params: ['autostart: true', 'node_names: [...]', 'bond_timeout: 4.0'],
  },

  // ── 베이스 명령 체인
  {
    id: 'rl_nav_correction', name: 'rl_nav_correction', tag: 'custom', pkg: 'cupbot_learning', form: 'ROS 2 노드 (C++ + ONNX Runtime)', group: '베이스 명령 체인',
    role: 'Nav2 속도 명령에 작은 Δ를 더해 카펫 미끄러짐 같은 현실 오차를 보정한다. 결과는 다시 속도 상한으로 자른다.',
    inputs: [
      ['✉️ 구독', '/cmd_vel_nav', TW, 'controller_server, behavior_server', '이 메시지가 올 때마다 1회 추론'],
      ['✉️ 구독', '/plan', 'nav_msgs/Path', 'planner_server', '경로 대비 횡·방향 오차'],
      ['✉️ 구독', '/odom', 'nav_msgs/Odometry', 'diff_drive_controller', '바퀴 속도'],
      ['✉️ 구독', '/imu', 'sensor_msgs/Imu', 'imu_sensor_broadcaster', '실제 각속도'],
      ['✉️ 구독', '/speed_limit', 'nav2_msgs/SpeedLimit', 'rl_nav_tuner', '재클리핑 상한'],
    ],
    outputs: [
      ['✉️ 발행', '/cmd_vel_corrected', TW, 'velocity_smoother', '20Hz'],
    ],
    params: ['enabled (false면 Δ=0 통과)', 'model_path (ONNX)', 'delta_v_max: 0.05', 'delta_w_max: 0.10', 'input_timeout_s: 0.2'],
    notes: ['관측 벡터 순서·단위·정규화가 Isaac Lab 학습 환경과 완전히 같아야 한다.'],
  },
  {
    id: 'velocity_smoother', name: 'velocity_smoother', tag: 'provided', pkg: 'nav2_velocity_smoother', form: 'ROS 2 lifecycle 노드', group: '베이스 명령 체인',
    role: '속도 명령의 가속·감속을 제한해 덜컹임을 없앤다.',
    inputs: [
      ['✉️ 구독', '/cmd_vel_corrected', TW, 'rl_nav_correction', '기본 입력 cmd_vel을 리매핑'],
      ['✉️ 구독', '/odometry/filtered', 'nav_msgs/Odometry', 'ekf', 'feedback: CLOSED_LOOP일 때만'],
    ],
    outputs: [
      ['✉️ 발행', '/cmd_vel_smoothed', TW, 'collision_monitor', '20Hz'],
    ],
    params: ['smoothing_frequency: 20.0', 'feedback: OPEN_LOOP', 'max_velocity: [0.26, 0.0, 1.82]', 'max_accel: [2.5, 0.0, 3.2]', 'enable_stamped_cmd_vel: true'],
  },
  {
    id: 'collision_monitor', name: 'collision_monitor', tag: 'provided', pkg: 'nav2_collision_monitor', form: 'ROS 2 lifecycle 노드', group: '베이스 명령 체인',
    role: '바퀴로 가기 직전의 마지막 안전 필터. 점구름이 다각형 안에 들어오면 감속하거나 멈춘다. RL 출력까지 포함한 최종 명령을 거른다.',
    inputs: [
      ['✉️ 구독', '/cmd_vel_smoothed', TW, 'velocity_smoother', ''],
      ['✉️ 구독', PTS, 'sensor_msgs/PointCloud2', 'realsense2_camera (pole_cam)', 'min_height 0.03 · max_height 0.40'],
      ['✉️ 구독', '/tf', 'tf2_msgs/TFMessage', 'robot_state_publisher', '카메라 → base_footprint'],
    ],
    outputs: [
      ['✉️ 발행', '/cmd_vel', TW, 'diff_drive_controller', '20Hz'],
      ['✉️ 발행', '/collision_monitor_state', 'nav2_msgs/CollisionMonitorState', 'RViz, coordinator', '어떤 다각형이 걸렸는지'],
    ],
    params: ['polygons: [FootprintApproach, SlowDown, Stop]', 'SlowDown: 0.3m · 40%', 'Stop: 0.15m', 'observation_sources: [pointcloud]'],
    notes: ['카메라 화각(약 87°) 밖은 지켜 주지 못한다 — 후진·회전은 짧게.'],
  },
  {
    id: 'ekf', name: 'ekf_node (robot_localization)', tag: 'provided', pkg: 'robot_localization', form: 'ROS 2 노드', group: '베이스 명령 체인',
    role: '바퀴 오도메트리와 IMU를 융합해 매끄러운 odom→base_footprint를 낸다. 미끄러짐에 대한 확정적 1차 보정.',
    inputs: [
      ['✉️ 구독', '/odom', 'nav_msgs/Odometry', 'diff_drive_controller', 'odom0: vx, vyaw'],
      ['✉️ 구독', '/imu', 'sensor_msgs/Imu', 'imu_sensor_broadcaster', 'imu0: vyaw'],
    ],
    outputs: [
      ['✉️ 발행', '/odometry/filtered', 'nav_msgs/Odometry', 'rtabmap, bt_navigator, controller_server, rl_nav_tuner', '50Hz'],
      ['✉️ 발행', '/tf', 'tf2_msgs/TFMessage', '전체', 'odom → base_footprint'],
    ],
    params: ['two_d_mode: true', 'frequency: 50.0', 'world_frame: odom', 'base_link_frame: base_footprint', 'publish_tf: true'],
    notes: ['diff_drive_controller의 enable_odom_tf는 false — odom TF 발행자는 ekf 하나.'],
  },
  {
    id: 'teleop', name: 'teleop_twist_keyboard', tag: 'provided', pkg: 'teleop_twist_keyboard', form: 'ROS 2 노드 (터미널)', group: '베이스 명령 체인',
    role: '매핑 단계에서 키보드로 로봇을 몬다.',
    inputs: [['⌨️ 입력', '키보드', '터미널', '사람', '']],
    outputs: [['✉️ 발행', '/cmd_vel', TW, 'diff_drive_controller', 'stamped:=true 필수 (Jazzy)']],
    params: ['stamped: true', 'frame_id: base_footprint'],
    notes: ['안전을 위해 매핑 때도 collision_monitor 입력(/cmd_vel_smoothed)으로 리매핑해 쓰는 편이 낫다.'],
  },

  // ── 팔·MoveIt
  {
    id: 'move_group', name: 'move_group (+ MTC 실행)', tag: 'provided', pkg: 'moveit_ros_move_group', form: 'ROS 2 노드', group: '팔·MoveIt',
    role: '팔 궤적 계획·충돌 검사·IK를 맡고, MTC 태스크 결과를 실행해 컨트롤러에 넘긴다. pole_cam 점구름으로 octomap을 쌓는다.',
    inputs: [
      ['🎬 서버', '/execute_task_solution', 'moveit_task_constructor_msgs/action/ExecuteTaskSolution', 'coordinator', 'ExecuteTaskSolutionCapability 필요'],
      ['📞 서버', '/apply_planning_scene', 'moveit_msgs/srv/ApplyPlanningScene', 'coordinator', ''],
      ['📞 서버', '/clear_octomap', 'std_srvs/srv/Empty', 'coordinator', ''],
      ['📞 서버', '/compute_ik', 'moveit_msgs/srv/GetPositionIK', 'grasp_scorer', 'pick_ik'],
      ['✉️ 구독', '/joint_states', 'sensor_msgs/JointState', 'joint_state_broadcaster', '현재 자세'],
      ['✉️ 구독', PTS, 'sensor_msgs/PointCloud2', 'realsense2_camera (pole_cam)', 'octomap (자기 몸 필터링)'],
      ['✉️ 구독', '/robot_description', 'std_msgs/String', 'robot_state_publisher', ''],
    ],
    outputs: [
      ['🎬 요청', '/arm_controller/follow_joint_trajectory', 'control_msgs/action/FollowJointTrajectory', 'arm_controller', '궤적마다'],
      ['🎬 요청', '/gripper_controller/gripper_cmd', 'control_msgs/action/GripperCommand', 'gripper_controller', '열기·닫기'],
      ['✉️ 발행', '/monitored_planning_scene', 'moveit_msgs/PlanningScene', 'coordinator(MTC), RViz', ''],
    ],
    params: ['kinematics_solver: pick_ik (위치 위주)', 'octomap_resolution: 0.02', 'sensors: PointCloudOctomapUpdater', 'max_range: 1.5', 'default_velocity_scaling: 0.4'],
  },
  {
    id: 'arm_controller', name: 'arm_controller (JointTrajectoryController)', tag: 'provided', pkg: 'joint_trajectory_controller', form: 'ros2_control 컨트롤러 플러그인', group: '팔·MoveIt',
    role: '궤적을 시간에 맞춰 보간해 매 주기 관절 목표를 낸다. 하드웨어가 아니라 rl_arm_correction의 reference에 쓴다(체인). 경로 허용오차를 넘으면 스스로 abort.',
    inputs: [
      ['🎬 서버', '/arm_controller/follow_joint_trajectory', 'control_msgs/action/FollowJointTrajectory', 'move_group', ''],
      ['📞 서버', '/arm_controller/follow_joint_trajectory/_action/cancel_goal', 'action_msgs/srv/CancelGoal', 'arm_safety_monitor', '취소 → 현재 자세 유지'],
      ['🧩 읽기', 'joint1~4/position, velocity', 'state interface (double)', 'hardware interface', '100Hz'],
    ],
    outputs: [
      ['🧩 쓰기', 'rl_arm_correction/joint1~4/position', 'reference interface (double)', 'rl_arm_correction', 'command_joints로 체인'],
      ['✉️ 발행', '/arm_controller/controller_state', 'control_msgs/msg/JointTrajectoryControllerState', '모니터링·RViz', ''],
    ],
    params: ['joints: [joint1..joint4]', 'command_joints: [rl_arm_correction/joint1..4]', 'constraints.joint2.trajectory: 0.10', 'goal_time: 0.5'],
  },
  {
    id: 'rl_arm_correction', name: 'rl_arm_correction', tag: 'custom', pkg: 'cupbot_controllers', form: 'ros2_control chainable 컨트롤러 플러그인 (C++)', group: '팔·MoveIt',
    role: 'JTC가 낸 관절 목표에 작은 Δ를 더해 중력 처짐 같은 오차를 보정하고 하드웨어에 쓴다. ROS 노드가 아니라 controller_manager 안에서 같은 주기에 돈다.',
    inputs: [
      ['🧩 읽기', 'rl_arm_correction/joint1~4/position', 'reference interface (double)', 'arm_controller', '자기가 내놓은 입력 자리'],
      ['🧩 읽기', 'joint1~4/position, velocity', 'state interface (double)', 'hardware interface', '현재 관절각·속도 → 추종 오차'],
      ['🧩 읽기', 'gripper/position, gripper/effort', 'state interface (double)', 'hardware interface', '파지 여부: 덜 닫혔는데 힘이 걸려 있으면 "들고 있음" (state는 여러 컨트롤러가 함께 읽을 수 있음)'],
      ['⚙️ 파라미터', 'enabled', 'bool', 'ros2 param set', 'false면 Δ=0 (보정 끔)'],
    ],
    outputs: [
      ['🧩 쓰기', 'joint1~4/position', 'command interface (double)', 'hardware interface', 'reference + Δ, ±0.05rad 클리핑'],
      ['✉️ 발행', '~/delta', 'std_msgs/Float64MultiArray', '디버그', 'realtime_tools::RealtimePublisher'],
    ],
    setup: [
      'cupbot_controllers 패키지에 controller_interface::ChainableControllerInterface를 상속한 RlArmCorrection 클래스를 만든다.',
      'on_export_reference_interfaces()로 rl_arm_correction/joint1~4/position 입력 자리를 내놓고, command_interface_configuration()에 joint1~4/position, state_interface_configuration()에 joint1~4/position·velocity·gripper_left_joint/position·effort를 요청한다.',
      'update_and_write_commands()에서 reference + Δ(ONNX 추론, ±0.05rad 클리핑)를 command에 쓴다. enabled=false면 Δ=0.',
      'pluginlib 등록(플러그인 xml + CMake pluginlib_export_plugin_description_file) → controllers.yaml에 type: cupbot_controllers/RlArmCorrection.',
      'arm_controller의 command_joints를 rl_arm_correction/joint1~4로 바꾸고, spawner에서 rl_arm_correction을 arm_controller보다 먼저 켠다.',
    ],
    guide: 'ros2control:ctrl',
    params: ['enabled (false면 Δ=0)', 'model_path (ONNX)', 'delta_max: 0.05', 'joints: [joint1..joint4]', 'gripper_joint: gripper_left_joint', 'grasp_effort_threshold (이 힘 이상이면 들고 있음)', 'gripper_closed_position (이보다 더 닫혔으면 빈손)'],
    notes: ['관측값은 모두 controller_manager 안의 인터페이스에서 읽는다 — 토픽을 구독하지 않으므로 실시간 루프가 끊기지 않는다.', '파지 여부 판정 규칙(임계값)은 Isaac Lab 학습 환경의 관측 계산과 똑같이 맞춘다.', 'update() 안에서 메모리 할당 금지 — ONNX 세션·텐서는 on_configure에서 미리 만든다.', '체인 때문에 이것만 deactivate할 수 없다. 끌 땐 enabled 파라미터를 쓴다.'],
  },
  {
    id: 'gripper_controller', name: 'gripper_controller', tag: 'provided', pkg: 'gripper_controllers (GripperActionController)', form: 'ros2_control 컨트롤러 플러그인', group: '팔·MoveIt',
    role: '그리퍼를 열고 닫는다. 결과의 위치·멈춤 여부로 "빈손" 판단을 한다.',
    inputs: [
      ['🎬 서버', '/gripper_controller/gripper_cmd', 'control_msgs/action/GripperCommand', 'move_group (MTC)', 'goal: position, max_effort'],
      ['🧩 읽기', 'gripper/position, effort', 'state interface (double)', 'hardware interface', ''],
    ],
    outputs: [
      ['🧩 쓰기', 'gripper/position', 'command interface (double)', 'hardware interface', ''],
      ['🎬 결과', 'result', 'position · effort · stalled · reached_goal', 'move_group → coordinator', '완전히 닫힘에 가까우면 빈손'],
    ],
    notes: ['Jazzy 이후로는 parallel_gripper_action_controller로 옮겨 가는 추세.'],
  },
  {
    id: 'arm_safety_monitor', name: 'arm_safety_monitor', tag: 'custom', pkg: 'cupbot_learning', form: 'ROS 2 노드 (C++)', group: '팔·MoveIt',
    role: '모터 전류로 사람 손 같은 예상 못 한 접촉을 감지해 궤적을 취소하고 coordinator에 알린다. 추종 오차 감지는 JTC 내장 기능이 맡는다.',
    inputs: [
      ['✉️ 구독', '/joint_states', 'sensor_msgs/JointState', 'joint_state_broadcaster', 'effort 필드 = 전류'],
    ],
    outputs: [
      ['📞 호출', '/arm_controller/follow_joint_trajectory/_action/cancel_goal', 'action_msgs/srv/CancelGoal', 'arm_controller', '빈 goal_id = 전체 취소'],
      ['✉️ 발행', '/arm_safety_event', 'cupbot_interfaces/ArmSafetyEvent', 'coordinator', '접촉 시'],
    ],
    notes: ['effort(전류)는 공식 TurtleBot3 플러그인이 내보내지 않는다 — hardware interface를 fork해 effort를 추가해야 이 노드가 동작한다.'],
    params: ['current_threshold_a (관절별, 컵 든 상태 포함 정상값보다 충분히 높게)', 'hold_time_s: 0.1', 'enabled'],
  },

  // ── ros2_control
  {
    id: 'controller_manager', name: 'controller_manager', tag: 'provided', pkg: 'controller_manager (ros2_control_node)', form: 'ROS 2 노드 (실시간 루프)', group: 'ros2_control',
    role: '하드웨어 인터페이스와 모든 컨트롤러를 한 프로세스에 올려 100Hz로 read → update → write를 돈다. 팔·바퀴·그리퍼·IMU가 같은 OpenCR이라 하나만 둔다.',
    inputs: [
      ['✉️ 구독', '/robot_description', 'std_msgs/String', 'robot_state_publisher', 'URDF 속 <ros2_control> 태그 → 어떤 플러그인·관절·인터페이스를 쓸지'],
      ['⚙️ 파라미터', 'controllers.yaml', 'YAML 파일 (--params-file)', 'launch', 'update_rate, 컨트롤러 이름·타입, 컨트롤러별 파라미터'],
      ['📞 서버', '/controller_manager/load_controller', 'controller_manager_msgs/srv/LoadController', 'spawner', '컨트롤러 플러그인 로드'],
      ['📞 서버', '/controller_manager/configure_controller', 'controller_manager_msgs/srv/ConfigureController', 'spawner', 'on_configure (파라미터 읽기)'],
      ['📞 서버', '/controller_manager/switch_controller', 'controller_manager_msgs/srv/SwitchController', 'spawner·운영자', '활성화/비활성화 (체인은 뒤에서부터)'],
      ['📞 서버', '/controller_manager/list_controllers', 'controller_manager_msgs/srv/ListControllers', 'ros2 control CLI', '상태 확인'],
    ],
    outputs: [
      ['🧩 호출', 'read() / write()', 'hardware interface 플러그인', 'hardware interface', '100Hz — 장치 통신은 플러그인이 함'],
      ['🧩 호출', 'update()', '컨트롤러 플러그인', 'arm_controller, rl_arm_correction, gripper_controller, diff_drive_controller, imu_sensor_broadcaster, joint_state_broadcaster', '체인 순서대로'],
      ['✉️ 발행', '/diagnostics', 'diagnostic_msgs/DiagnosticArray', '모니터링 (rqt_robot_monitor)', '루프 주기·실행 시간 경고'],
    ],
    params: ['update_rate: 100', '<컨트롤러이름>.type (6개, 아래 단계 2)'],
    setup: [
      'URDF(xacro)에 <ros2_control name="TurtleBot3ManipulationSystem" type="system"> 블록 — <plugin>turtlebot3_manipulation_hardware/TurtleBot3ManipulationSystemHardware</plugin>, <param> opencr_usb_port=/dev/ttyACM0 · opencr_baud_rate=1000000 · opencr_id=200, 그리고 관절(wheel_left/right_joint, joint1~4, gripper_left/right_joint)·센서(imu, battery)별 command/state 인터페이스를 선언 (팔·그리퍼에 effort ★).',
      'controllers.yaml의 controller_manager.ros__parameters에 update_rate: 100과 컨트롤러 6개의 type: joint_state_broadcaster/JointStateBroadcaster · imu_sensor_broadcaster/IMUSensorBroadcaster · diff_drive_controller/DiffDriveController · cupbot_controllers/RlArmCorrection · joint_trajectory_controller/JointTrajectoryController · position_controllers/GripperActionController. 컨트롤러별 파라미터는 같은 파일의 <이름>.ros__parameters 아래에.',
      'launch: robot_state_publisher(URDF 발행) → ros2_control_node(parameters=[controllers.yaml], diff_drive 토픽 리매핑) → spawner로 joint_state_broadcaster, imu_sensor_broadcaster, diff_drive_controller, rl_arm_correction, arm_controller, gripper_controller 순서 (체인은 rl_arm_correction이 arm_controller보다 먼저).',
      '확인: ros2 control list_hardware_components → list_hardware_interfaces([claimed] 표시, joint2/effort가 보이는지) → list_controllers(전부 active) → view_controller_chains.',
      '장치를 바꾸거나 추가할 때는 controller_manager가 아니라 URDF의 <plugin>과 <param>을 바꾼다 (장치마다 <ros2_control> 블록 하나).',
    ],
    guide: 'ros2control:connect',
    notes: ['controller_manager는 장치를 모른다 — 장치별 연결·전송은 hardware interface 플러그인이 맡고, controller_manager는 read/update/write만 돌린다.', 'URDF는 /robot_description 토픽(robot_state_publisher)에서 받는다 (Jazzy).'],
  },
  {
    id: 'hw_interface', name: 'hardware interface (turtlebot3_manipulation)', tag: 'provided', pkg: 'turtlebot3_manipulation_hardware (fork해서 effort 추가)', form: 'ros2_control SystemInterface 플러그인', group: 'ros2_control',
    role: 'controller_manager의 변수(double)를 OpenCR 패킷으로 바꿔 모터에 쓰고, 모터·IMU·배터리 상태를 읽어 온다. rad ↔ 틱 변환과 장치별 통신이 전부 여기서 일어난다. 공식 플러그인은 effort(전류)를 내보내지 않으므로 fork해서 present_current를 effort state로 추가한다.',
    inputs: [
      ['🧩 읽기', 'wheel_left/right_joint/velocity', 'command interface (double, rad/s)', 'diff_drive_controller', ''],
      ['🧩 읽기', 'joint1~4/position', 'command interface (double, rad)', 'rl_arm_correction', '체인 끝 — JTC 목표 + Δ'],
      ['🧩 읽기', 'gripper_left_joint/position', 'command interface (double)', 'gripper_controller', 'gripper_right_joint는 mimic'],
      ['🔌 장치', 'OpenCR (ID 200)', 'USB → TTL, Dynamixel Protocol 2.0, 1Mbps', '다이나믹셀 모터·IMU·배터리', 'SyncRead: 위치·속도·전류(★추가)·IMU·배터리'],
    ],
    outputs: [
      ['🧩 쓰기', 'wheel_*_joint/position·velocity', 'state interface (double)', 'diff_drive_controller, joint_state_broadcaster', ''],
      ['🧩 쓰기', 'joint1~4/position·velocity·effort', 'state interface (double)', 'arm_controller, rl_arm_correction, joint_state_broadcaster', 'effort는 fork에서 추가 (present_current_joint_1~4)'],
      ['🧩 쓰기', 'gripper_left_joint/position·velocity·effort', 'state interface (double)', 'gripper_controller, rl_arm_correction, joint_state_broadcaster', 'effort는 fork에서 추가 (present_current_gripper)'],
      ['🧩 쓰기', 'imu/orientation·angular_velocity·linear_acceleration', 'state interface (double)', 'imu_sensor_broadcaster', ''],
      ['🧩 쓰기', 'battery/voltage·percentage·design_capacity·present', 'state interface (double)', '(필요 시 battery_state_broadcaster)', ''],
      ['🔌 장치', 'OpenCR', 'SyncWrite: Goal Position(팔·그리퍼) · Goal Velocity(바퀴)', '다이나믹셀 모터', ''],
    ],
    setup: [
      '공식 turtlebot3_manipulation(jazzy 브랜치)을 워크스페이스에 받아 turtlebot3_manipulation_hardware 패키지를 fork한다.',
      'read()에 OpenCR 제어 테이블의 present_current_joint_1~4(주소 264~270)·present_current_gripper(272)를 읽는 코드를 추가하고, 전류 단위를 A(또는 N·m 근사)로 바꿔 efforts_[i]에 넣는다.',
      'export_state_interfaces()에 팔·그리퍼 관절의 effort StateInterface를 추가한다 (&efforts_[i]).',
      'URDF의 joint1~4, gripper_left_joint에 <state_interface name="effort"/>를 추가한다.',
      'colcon build 후 ros2 control list_hardware_interfaces에 joint2/effort가 나오고, ros2 topic echo /joint_states에서 effort 값이 바뀌는지 확인한다.',
    ],
    guide: 'ros2control:hw',
    params: ['opencr_id: 200', 'opencr_usb_port: /dev/ttyACM0', 'opencr_baud_rate: 1000000', 'dxl_joints_profile_acceleration: 100', 'dxl_joints_profile_velocity: 500', 'dxl_gripper_profile_acceleration: 20', 'dxl_gripper_profile_velocity: 200'],
    notes: ['파라미터는 URDF의 <ros2_control><hardware><param>으로 넘긴다 (ros2 param이 아님).', 'fork 수정 범위: read()에서 present_current 읽기 + export_state_interfaces()에 effort 추가 + URDF 관절에 <state_interface name="effort"/> 추가. 전류 단위 변환은 OpenCR 펌웨어·모터 문서로 확인.', '연결 단계 전체는 ros2_control 탭.'],
  },
  {
    id: 'diff_drive_controller', name: 'diff_drive_controller', tag: 'provided', pkg: 'diff_drive_controller', form: 'ros2_control 컨트롤러 플러그인', group: 'ros2_control',
    role: '(선속도, 각속도)를 좌·우 바퀴 속도로 바꾸고, 바퀴 회전량으로 오도메트리를 계산한다.',
    inputs: [
      ['✉️ 구독', '/cmd_vel', TW, 'collision_monitor (매핑 땐 teleop)', '기본 ~/cmd_vel을 리매핑'],
      ['🧩 읽기', 'wheel_left/right position, velocity', 'state interface (double)', 'hardware interface', ''],
    ],
    outputs: [
      ['🧩 쓰기', 'wheel_left/right/velocity', 'command interface (double, rad/s)', 'hardware interface', ''],
      ['✉️ 발행', '/odom', 'nav_msgs/Odometry', 'ekf, rl_nav_correction', '50Hz · 기본 ~/odom을 리매핑'],
    ],
    params: ['wheel_separation: 0.287', 'wheel_radius: 0.033', 'base_frame_id: base_footprint', 'enable_odom_tf: false', 'cmd_vel_timeout: 0.5', 'publish_rate: 50.0'],
  },
  {
    id: 'imu_sensor_broadcaster', name: 'imu_sensor_broadcaster', tag: 'provided', pkg: 'imu_sensor_broadcaster', form: 'ros2_control 브로드캐스터 플러그인', group: 'ros2_control',
    role: 'OpenCR IMU의 state interface를 Imu 메시지로 발행한다.',
    inputs: [['🧩 읽기', 'imu/orientation·angular_velocity·linear_acceleration', 'state interface (double)', 'hardware interface', '']],
    outputs: [['✉️ 발행', '/imu', 'sensor_msgs/Imu', 'ekf, rl_nav_correction', '100Hz · best_effort · 기본 ~/imu를 리매핑']],
    params: ['sensor_name: imu', 'frame_id: imu_link'],
  },
  {
    id: 'joint_state_broadcaster', name: 'joint_state_broadcaster', tag: 'provided', pkg: 'joint_state_broadcaster', form: 'ros2_control 브로드캐스터 플러그인', group: 'ros2_control',
    role: '모든 관절의 state interface를 JointState로 발행한다. TF·MoveIt·안전 감시가 이걸 본다.',
    inputs: [['🧩 읽기', '모든 관절 position·velocity·effort', 'state interface (double)', 'hardware interface', '']],
    outputs: [
      ['✉️ 발행', '/joint_states', 'sensor_msgs/JointState', 'robot_state_publisher, move_group, arm_safety_monitor', '100Hz'],
      ['✉️ 발행', '/dynamic_joint_states', 'control_msgs/msg/DynamicJointState', '디버그', ''],
    ],
  },
];

/** 커스텀 인터페이스 정의 (cupbot_interfaces) */
export const MSG_DEFS: [string, string][] = [
  ['msg/TrackedObject.msg', `uint32 id
string class_name
float32 confidence
geometry_msgs/PoseWithCovariance pose   # map 기준
geometry_msgs/Vector3 size              # m
builtin_interfaces/Time last_seen`],
  ['msg/TrackedObjectArray.msg', `std_msgs/Header header                   # frame_id: map
TrackedObject[] objects`],
  ['msg/SubGoal.msg', `uint32 step
string skill        # navigate | pick | place | say
string target       # 물체 id 또는 "person"
string relation     # front | on | ...
float32 offset_m`],
  ['msg/SubGoalArray.msg', `std_msgs/Header header
uint32 plan_id
SubGoal[] goals`],
  ['msg/TaskStatus.msg', `uint8 RUNNING=0
uint8 SUCCEEDED=1
uint8 FAILED=2
uint32 plan_id
uint32 step
uint8 state
string reason       # grasp_failed_all | nav_blocked | arm_contact ...`],
  ['msg/ArmSafetyEvent.msg', `std_msgs/Header header
string joint_name
float32 current_a
float32 threshold_a
string reason       # overcurrent`],
  ['srv/ScoreGrasps.srv', `uint32 object_id
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
  pairs.push(['realsense2_camera (pole_cam)', 'realsense_pole'], ['realsense2_camera (gripper_cam)', 'realsense_gripper'], ['ekf', 'ekf'], ['teleop', 'teleop'], ['global_costmap', 'planner_server'], ['local_costmap', 'controller_server']);
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
  bt_navigator: ['nav2_bt_navigator'], planner_server: ['nav2_planner_server', 'nav2_navfn', 'nav2_costmap', 'nav2_static_layer', 'nav2_voxel_layer', 'nav2_inflation_layer'],
  controller_server: ['nav2_controller_server', 'nav2_dwb_kinematic', 'nav2_dwb_controller', 'nav2_dwb_traj_gen', 'nav2_costmap'],
  behavior_server: ['nav2_behavior_server'], costmap: ['nav2_costmap', 'nav2_voxel_layer', 'nav2_inflation_layer', 'nav2_static_layer'],
  lifecycle_manager: ['nav2_lifecycle_manager'], velocity_smoother: ['nav2_velocity_smoother'], collision_monitor: ['nav2_collision_monitor'],
  ekf: ['robot_localization'], diff_drive_controller: ['ctl_diff_drive_controller'], imu_sensor_broadcaster: ['ctl_imu_sensor_broadcaster'],
  joint_state_broadcaster: ['ctl_joint_state_broadcaster'], arm_controller: ['ctl_joint_trajectory_controller'],
  gripper_controller: ['ctl_gripper_action_controller'], controller_manager: ['ctl_controller_manager'], teleop: [], voice_ui: [],
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
  const msgs = MSG_DEFS.map(([f, body]) => `<div class="rd-msg"><div class="rd-msgf">cupbot_interfaces/${esc(f)}</div><pre><code>${esc(body)}</code></pre></div>`).join('');
  return `
    ${backLabel ? `<button class="rd-back">↩ ${esc(backLabel)}(으)로 돌아가기</button>` : ''}
    <h2>노드 사전</h2>
    <p>도식의 노드를 누르면 여기로 옵니다. 카드마다 <b>제공/직접 작성</b>, 패키지, 형태, <b>받는 것</b>(구독·서비스 서버·액션 서버·인터페이스)과 <b>내보내는 것</b>(발행·호출·요청)을 메시지 타입과 함께 적었습니다. 표 안의 노드 이름을 누르면 그 카드로 이동합니다.</p>
    <p class="rd-howlegend">메시지 타입을 누르면 <b>메시지 타입</b> 탭에서 필드 정의를 볼 수 있습니다 (뒤로가기로 돌아옴).<br/>방식: ✉️ 구독/발행 = 토픽 · 📞 서버/호출/응답 = 서비스 · 🎬 서버/요청/결과 = 액션 · 🧩 읽기/쓰기 = ros2_control 인터페이스 · 🔌 장치 = USB·시리얼 · 🗣️ 사람 → 로봇 · 🔊 로봇 → 사람 · 💾 파일 · ⚙️ 파라미터 · 🌐 외부 API</p>
    <div class="rd-cindex">${index}</div>
    ${cards}
    <h3 class="rd-cgroup" id="node-msgs">커스텀 인터페이스 정의 (cupbot_interfaces)</h3>
    <div class="rd-msgs">${msgs}</div>
  `;
};

export const NODE_IDS = new Set(NODE_DOCS.map(d => d.id));
