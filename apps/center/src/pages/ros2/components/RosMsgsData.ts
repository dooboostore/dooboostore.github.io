// ROS 2 표준 인터페이스(msg·srv·action) 사전 데이터. 정의는 Jazzy 기준.
// id는 'pkg/Name' — 정의 본문의 'pkg/Name'을 찾아 다른 카드로 링크한다.

export type MsgKind = 'msg' | 'srv' | 'action';

export type MsgDoc = {
  id: string;           // geometry_msgs/Twist
  kind: MsgKind;
  def: string;          // .msg / .srv / .action 본문 (주석 포함)
  desc: string;
  notes?: string[];
  usedIn?: string[];    // 실전노드설계에서 쓰는 곳
  cli?: string;
};

export const PKG_DESC: Record<string, string> = {
  std_msgs: '가장 기본적인 타입. Header가 핵심이고, String·Float64 같은 원시 래퍼는 실전에선 의미 있는 전용 타입으로 대체하는 게 권장된다.',
  builtin_interfaces: 'ROS 2가 내장한 시간 타입. 모든 Header의 stamp가 이것.',
  geometry_msgs: '위치·자세·속도·힘 같은 기하 타입. 로봇 SW에서 가장 많이 쓰인다. *Stamped는 Header(시각·좌표계)를 붙인 버전.',
  sensor_msgs: '센서 원본 데이터 — 카메라, 점구름, LiDAR, IMU, 관절 상태.',
  nav_msgs: '이동 로봇 내비게이션 — 오도메트리, 경로, 격자 지도.',
  tf2_msgs: '/tf, /tf_static 토픽의 타입.',
  trajectory_msgs: '시간에 따른 관절 궤적.',
  control_msgs: 'ros2_control 컨트롤러와 주고받는 액션·메시지.',
  nav2_msgs: 'Nav2 서버들의 액션·메시지.',
  action_msgs: '모든 액션이 내부적으로 쓰는 goal 상태·취소 인터페이스.',
  lifecycle_msgs: '관리형(lifecycle) 노드의 상태 전이.',
  rcl_interfaces: '파라미터 서비스 등 모든 노드에 자동으로 붙는 인터페이스.',
  std_srvs: '요청/응답이 단순한 범용 서비스.',
  visualization_msgs: 'RViz에 도형·글자를 그리는 마커.',
  moveit_msgs: 'MoveIt 2 서비스·액션 (이 설계에서 쓰는 것만).',
  shape_msgs: "기하 도형 (기본 도형·메시·평면). MoveIt 충돌 물체의 모양을 정의한다.",
  stereo_msgs: "스테레오 카메라 시차 영상.",
  diagnostic_msgs: "하드웨어·노드 상태 진단 (/diagnostics).",
  rosgraph_msgs: "/clock(시뮬레이션 시각)과 ROS 그래프 내성 정보.",
  statistics_msgs: "토픽 통계 (주기·지연).",
  unique_identifier_msgs: '범용 고유 식별자(UUID). 액션 goal id에 쓰인다.',
  composition_interfaces: "컴포넌트 컨테이너에 노드를 올리고 내리는 서비스.",
};

export const MSG_DOCS: MsgDoc[] = [
  // ───────── std_msgs
  {
    id: 'std_msgs/Header', kind: 'msg',
    def: `builtin_interfaces/Time stamp   # 데이터가 측정된 시각 (발행 시각 아님)
string frame_id                  # 이 데이터가 표현된 좌표계 (예: base_link, map, pole_cam_color_optical_frame)`,
    desc: '"언제, 어느 좌표계 기준인가"를 담는다. 거의 모든 센서·Stamped 메시지의 첫 필드.',
    notes: ['stamp는 센서가 실제로 잰 시각으로 넣어야 TF 보간·메시지 동기화(message_filters)가 맞는다.', 'frame_id가 틀리면 RViz에서 엉뚱한 곳에 그려지고 TF 변환이 실패한다.', 'ROS 1과 달리 seq 필드가 없다.'],
    usedIn: ['/tracked_objects, /pole_cam/*, /odom, /cmd_vel 체인 등 거의 전부'],
  },
  {
    id: 'std_msgs/String', kind: 'msg',
    def: `string data`,
    desc: '문자열 하나. 디버그·간단한 명령 전달용.',
    notes: ['의미가 있는 데이터라면 전용 메시지를 만드는 게 좋다 (필드 이름이 곧 문서).'],
    usedIn: ['/user_command (사람 명령 → vlm_task_planner)', '/robot_description (URDF 문자열, transient_local)'],
    cli: `ros2 topic pub --once /user_command std_msgs/msg/String "{data: '테이블 위 컵 가져다줘'}"`,
  },
  {
    id: 'std_msgs/Bool', kind: 'msg', def: `bool data`,
    desc: '참/거짓 하나. on/off 신호.',
    cli: `ros2 topic pub --once /enable std_msgs/msg/Bool "{data: true}"`,
  },
  {
    id: 'std_msgs/Float64', kind: 'msg', def: `float64 data`,
    desc: '실수 하나. 단일 센서값·목표값. (Int32, Float32, UInt8 등 원시 래퍼가 같은 모양으로 있다)',
    notes: ['단위가 타입에 드러나지 않으므로 토픽 이름이나 문서로 단위를 꼭 명시한다.'],
  },
  {
    id: 'std_msgs/Empty', kind: 'msg', def: `# 필드 없음`,
    desc: '내용 없이 "일어났다"는 사실만 알리는 신호.',
  },
  {
    id: 'std_msgs/ColorRGBA', kind: 'msg',
    def: `float32 r   # 0.0 ~ 1.0
float32 g
float32 b
float32 a   # 불투명도, 0이면 안 보임`,
    desc: '색. 주로 RViz 마커에서 쓴다.',
    notes: ['a를 0으로 두면(기본값) 마커가 투명해서 안 보인다 — 가장 흔한 실수.'],
  },
  {
    id: 'std_msgs/Float64MultiArray', kind: 'msg',
    def: `std_msgs/MultiArrayLayout layout   # 다차원 배열의 모양 (1차원이면 비워도 됨)
float64[] data`,
    desc: '실수 배열. 컨트롤러 명령(forward_command_controller)이나 디버그 값 묶음에 쓴다.',
    usedIn: ['rl_arm_correction의 ~/delta (관절별 Δ 디버그 출력)'],
    cli: `ros2 topic pub --once /forward_position_controller/commands std_msgs/msg/Float64MultiArray "{data: [0.0, 0.6, -0.3, 1.1]}"`,
  },
  {
    id: 'std_msgs/MultiArrayLayout', kind: 'msg',
    def: `std_msgs/MultiArrayDimension[] dim   # 차원마다 하나
uint32 data_offset                    # data 배열에서 시작 위치`,
    desc: 'MultiArray의 차원 정보.',
  },
  {
    id: 'std_msgs/MultiArrayDimension', kind: 'msg',
    def: `string label    # 차원 이름 (예: "rows")
uint32 size     # 이 차원의 길이
uint32 stride   # 이 차원 이하의 원소 수`,
    desc: 'MultiArrayLayout의 한 차원.',
  },
  {
    id: 'std_msgs/Byte', kind: 'msg',
    def: `byte data`,
    desc: "바이트 하나.",
  },
  {
    id: 'std_msgs/ByteMultiArray', kind: 'msg',
    def: `std_msgs/MultiArrayLayout  layout
byte[]            data`,
    desc: "바이트 배열 + 레이아웃.",
  },
  {
    id: 'std_msgs/Char', kind: 'msg',
    def: `char data`,
    desc: "문자(uint8) 하나.",
  },
  {
    id: 'std_msgs/Float32', kind: 'msg',
    def: `float32 data`,
    desc: "32비트 실수 하나.",
  },
  {
    id: 'std_msgs/Float32MultiArray', kind: 'msg',
    def: `std_msgs/MultiArrayLayout  layout
float32[]         data`,
    desc: "32비트 실수 배열 + 레이아웃.",
  },
  {
    id: 'std_msgs/Int16', kind: 'msg',
    def: `int16 data`,
    desc: "16비트 정수 하나.",
  },
  {
    id: 'std_msgs/Int16MultiArray', kind: 'msg',
    def: `std_msgs/MultiArrayLayout  layout
int16[]           data`,
    desc: "16비트 정수 배열 + 레이아웃.",
  },
  {
    id: 'std_msgs/Int32', kind: 'msg',
    def: `int32 data`,
    desc: "32비트 정수 하나.",
  },
  {
    id: 'std_msgs/Int32MultiArray', kind: 'msg',
    def: `std_msgs/MultiArrayLayout  layout
int32[]           data`,
    desc: "32비트 정수 배열 + 레이아웃.",
  },
  {
    id: 'std_msgs/Int64', kind: 'msg',
    def: `int64 data`,
    desc: "64비트 정수 하나.",
  },
  {
    id: 'std_msgs/Int64MultiArray', kind: 'msg',
    def: `std_msgs/MultiArrayLayout  layout
int64[]           data`,
    desc: "64비트 정수 배열 + 레이아웃.",
  },
  {
    id: 'std_msgs/Int8', kind: 'msg',
    def: `int8 data`,
    desc: "8비트 정수 하나.",
  },
  {
    id: 'std_msgs/Int8MultiArray', kind: 'msg',
    def: `std_msgs/MultiArrayLayout  layout
int8[]            data`,
    desc: "8비트 정수 배열 + 레이아웃.",
  },
  {
    id: 'std_msgs/UInt16', kind: 'msg',
    def: `uint16 data`,
    desc: "부호 없는 16비트 정수 하나.",
  },
  {
    id: 'std_msgs/UInt16MultiArray', kind: 'msg',
    def: `std_msgs/MultiArrayLayout  layout
uint16[]            data`,
    desc: "부호 없는 16비트 정수 배열 + 레이아웃.",
  },
  {
    id: 'std_msgs/UInt32', kind: 'msg',
    def: `uint32 data`,
    desc: "부호 없는 32비트 정수 하나.",
  },
  {
    id: 'std_msgs/UInt32MultiArray', kind: 'msg',
    def: `std_msgs/MultiArrayLayout  layout
uint32[]          data`,
    desc: "부호 없는 32비트 정수 배열 + 레이아웃.",
  },
  {
    id: 'std_msgs/UInt64', kind: 'msg',
    def: `uint64 data`,
    desc: "부호 없는 64비트 정수 하나.",
  },
  {
    id: 'std_msgs/UInt64MultiArray', kind: 'msg',
    def: `std_msgs/MultiArrayLayout  layout
uint64[]          data`,
    desc: "부호 없는 64비트 정수 배열 + 레이아웃.",
  },
  {
    id: 'std_msgs/UInt8', kind: 'msg',
    def: `uint8 data`,
    desc: "부호 없는 8비트 정수 하나.",
  },
  {
    id: 'std_msgs/UInt8MultiArray', kind: 'msg',
    def: `std_msgs/MultiArrayLayout  layout
uint8[]           data`,
    desc: "부호 없는 8비트 정수 배열 + 레이아웃.",
  },

  // ───────── builtin_interfaces
  {
    id: 'builtin_interfaces/Time', kind: 'msg',
    def: `int32 sec        # 초 (epoch 또는 시뮬레이션 시각)
uint32 nanosec   # 0 ~ 999,999,999`,
    desc: '시각. use_sim_time이 true면 /clock(시뮬레이터 시각)을 따른다.',
    notes: ['rclcpp: node->now(), rclpy: node.get_clock().now().to_msg()로 채운다.', '실기·시뮬을 섞을 때 use_sim_time 불일치가 TF "extrapolation" 오류의 단골 원인.'],
  },
  {
    id: 'builtin_interfaces/Duration', kind: 'msg',
    def: `int32 sec
uint32 nanosec`,
    desc: '시간 길이. 궤적의 time_from_start, 마커 lifetime 등.',
  },

  // ───────── geometry_msgs
  {
    id: 'geometry_msgs/Vector3', kind: 'msg',
    def: `float64 x
float64 y
float64 z`,
    desc: '방향과 크기를 가진 3D 벡터 (속도, 가속도, 힘). 위치에는 Point를 쓴다.',
  },
  {
    id: 'geometry_msgs/Vector3Stamped', kind: 'msg',
    def: `std_msgs/Header header
geometry_msgs/Vector3 vector`,
    desc: '좌표계가 붙은 벡터 (방향·크기). TF로 변환하면 회전만 적용된다.',
  },
  {
    id: 'geometry_msgs/Point', kind: 'msg',
    def: `float64 x   # m
float64 y
float64 z`,
    desc: '3D 위치 (점). Vector3와 모양은 같지만 의미가 다르다 — TF 변환 시 점은 평행이동이 적용되고 벡터는 회전만 적용된다.',
  },
  {
    id: 'geometry_msgs/PointStamped', kind: 'msg',
    def: `std_msgs/Header header   # 이 점이 표현된 좌표계·시각
geometry_msgs/Point point`,
    desc: '좌표계가 붙은 점. "map 기준 (3.2, 0.8, 0.5)"처럼 어느 좌표계의 점인지가 중요할 때 쓴다.',
    notes: ['RViz의 "Publish Point" 도구가 /clicked_point로 이 타입을 보낸다 — 지도 위 좌표를 찍어 확인할 때 편하다.', 'tf2의 doTransform으로 다른 좌표계 점으로 바로 바꿀 수 있다 (tf2_geometry_msgs).'],
    usedIn: ['(권장) perception 디버그 — 검출한 컵 중심을 map 기준 PointStamped로 발행해 RViz에서 확인'],
    cli: `ros2 topic echo /clicked_point`,
  },
  {
    id: 'geometry_msgs/Point32', kind: 'msg',
    def: `float32 x
float32 y
float32 z`,
    desc: 'float32 점. Polygon(로봇 footprint 등)에서 쓴다.',
  },
  {
    id: 'geometry_msgs/Quaternion', kind: 'msg',
    def: `float64 x 0
float64 y 0
float64 z 0
float64 w 1   # 기본값이 (0,0,0,1) = 회전 없음`,
    desc: '3D 회전(자세). 오일러각 대신 쓰는 이유는 짐벌락이 없고 보간이 쉬워서.',
    notes: ['길이가 1(정규화)이어야 한다. 손으로 넣을 땐 tf2의 setRPY / tf_transformations.quaternion_from_euler를 쓴다.', '평면 로봇의 yaw θ → (0, 0, sin(θ/2), cos(θ/2)).'],
  },
  {
    id: 'geometry_msgs/QuaternionStamped', kind: 'msg',
    def: `std_msgs/Header header
geometry_msgs/Quaternion quaternion`,
    desc: '좌표계가 붙은 자세(회전)만.',
  },
  {
    id: 'geometry_msgs/Pose2D', kind: 'msg',
    def: `float64 x       # m
float64 y       # m
float64 theta   # rad (yaw)`,
    desc: '평면 위치 + 방향. 간단하지만 Header가 없고 3D 도구와 안 맞아서 새 코드에서는 Pose(+Quaternion)를 권장한다.',
  },
  {
    id: 'geometry_msgs/Pose', kind: 'msg',
    def: `geometry_msgs/Point position
geometry_msgs/Quaternion orientation`,
    desc: '위치 + 자세. "어디에 어느 방향으로" 있는가.',
  },
  {
    id: 'geometry_msgs/PoseStamped', kind: 'msg',
    def: `std_msgs/Header header        # frame_id 기준의 pose
geometry_msgs/Pose pose`,
    desc: '좌표계와 시각이 붙은 Pose. 목표 지점·파지 자세 등 "어느 좌표계 기준인지"가 중요한 곳에 쓴다.',
    usedIn: ['NavigateToPose goal (map 기준 목표)', 'ScoreGrasps 응답의 파지 후보', 'nav_msgs/Path의 각 점'],
    cli: `ros2 topic pub --once /goal_pose geometry_msgs/msg/PoseStamped "{header: {frame_id: map}, pose: {position: {x: 3.45, y: 0.9}, orientation: {w: 1.0}}}"`,
  },
  {
    id: 'geometry_msgs/PoseWithCovariance', kind: 'msg',
    def: `geometry_msgs/Pose pose
float64[36] covariance   # 6x6 행 우선 (x, y, z, rot_x, rot_y, rot_z) — 불확실성`,
    desc: '불확실성을 가진 자세. 위치 추정 결과에 쓴다.',
    notes: ['대각 성분이 분산. 모르면 큰 값, 쓰지 않는 축(평면 로봇의 z, roll, pitch)은 아주 큰 값을 넣는 관례.'],
    usedIn: ['nav_msgs/Odometry.pose', 'TrackedObject.pose (perception 출력)'],
  },
  {
    id: 'geometry_msgs/PoseWithCovarianceStamped', kind: 'msg',
    def: `std_msgs/Header header
geometry_msgs/PoseWithCovariance pose`,
    desc: '좌표계가 붙은 불확실 자세. RViz의 "2D Pose Estimate"(/initialpose)가 이 타입.',
  },
  {
    id: 'geometry_msgs/PoseArray', kind: 'msg',
    def: `std_msgs/Header header
geometry_msgs/Pose[] poses`,
    desc: '같은 좌표계의 자세 여러 개. 파티클·파지 후보 시각화.',
  },
  {
    id: 'geometry_msgs/Twist', kind: 'msg',
    def: `geometry_msgs/Vector3 linear    # m/s   — 차동 구동은 linear.x(전진)만 의미
geometry_msgs/Vector3 angular   # rad/s — 차동 구동은 angular.z(좌회전 +)만 의미`,
    desc: '속도 명령. 이동 로봇 제어의 기본. 기준 좌표계는 로봇 몸(base_link) — "앞으로 0.2m/s, 왼쪽으로 0.5rad/s 회전".',
    notes: ['좌표계가 메시지에 없다 → Jazzy부터 Nav2·diff_drive_controller는 TwistStamped를 기본으로 쓴다.', 'ROS 축 규칙: x 앞, y 왼쪽, z 위 / 양의 회전은 반시계(오른손 법칙).'],
    usedIn: ['(이 설계는 Jazzy라 TwistStamped를 씀)'],
    cli: `ros2 topic pub -r 10 /cmd_vel geometry_msgs/msg/Twist "{linear: {x: 0.1}, angular: {z: 0.3}}"`,
  },
  {
    id: 'geometry_msgs/TwistStamped', kind: 'msg',
    def: `std_msgs/Header header        # frame_id: base_footprint, stamp: 명령 생성 시각
geometry_msgs/Twist twist`,
    desc: '시각·좌표계가 붙은 속도 명령. 오래된 명령을 stamp로 걸러낼 수 있다.',
    notes: ['체인 중 한 노드라도 Twist를 쓰면 타입 불일치로 연결이 안 된다 — 전부 통일.', 'teleop_twist_keyboard는 stamped:=true 파라미터로 TwistStamped를 낸다.'],
    usedIn: ['/cmd_vel_nav → /cmd_vel_corrected → /cmd_vel_smoothed → /cmd_vel (베이스 명령 체인 전체)'],
    cli: `ros2 topic pub -r 10 /cmd_vel geometry_msgs/msg/TwistStamped "{header: {frame_id: base_footprint}, twist: {linear: {x: 0.1}, angular: {z: 0.3}}}"`,
  },
  {
    id: 'geometry_msgs/TwistWithCovariance', kind: 'msg',
    def: `geometry_msgs/Twist twist
float64[36] covariance   # 6x6 (vx, vy, vz, wx, wy, wz)`,
    desc: '불확실성을 가진 속도. Odometry.twist.',
  },
  {
    id: 'geometry_msgs/TwistWithCovarianceStamped', kind: 'msg',
    def: `std_msgs/Header header
geometry_msgs/TwistWithCovariance twist`,
    desc: '좌표계가 붙은 불확실 속도. 휠 속도계·시각 오도메트리 등을 robot_localization에 넣을 때 쓴다.',
  },
  {
    id: 'geometry_msgs/Accel', kind: 'msg',
    def: `geometry_msgs/Vector3 linear    # m/s²
geometry_msgs/Vector3 angular   # rad/s²`,
    desc: '가속도.',
  },
  {
    id: 'geometry_msgs/AccelStamped', kind: 'msg',
    def: `std_msgs/Header header
geometry_msgs/Accel accel`,
    desc: '좌표계가 붙은 가속도.',
  },
  {
    id: 'geometry_msgs/AccelWithCovariance', kind: 'msg',
    def: `geometry_msgs/Accel accel
float64[36] covariance   # 6x6`,
    desc: '불확실성을 가진 가속도.',
  },
  {
    id: 'geometry_msgs/AccelWithCovarianceStamped', kind: 'msg',
    def: `std_msgs/Header header
geometry_msgs/AccelWithCovariance accel`,
    desc: '좌표계가 붙은 불확실 가속도. robot_localization의 /accel/filtered 출력.',
  },
  {
    id: 'geometry_msgs/Wrench', kind: 'msg',
    def: `geometry_msgs/Vector3 force    # N
geometry_msgs/Vector3 torque   # N·m`,
    desc: '힘과 토크. 힘/토크 센서(F/T) 출력, 힘 제어 명령.',
  },
  {
    id: 'geometry_msgs/WrenchStamped', kind: 'msg',
    def: `std_msgs/Header header   # 센서 좌표계
geometry_msgs/Wrench wrench`,
    desc: '좌표계가 붙은 힘/토크.',
  },
  {
    id: 'geometry_msgs/Transform', kind: 'msg',
    def: `geometry_msgs/Vector3 translation   # m
geometry_msgs/Quaternion rotation`,
    desc: '두 좌표계 사이의 변환 (평행이동 + 회전).',
  },
  {
    id: 'geometry_msgs/TransformStamped', kind: 'msg',
    def: `std_msgs/Header header    # frame_id = 부모 좌표계
string child_frame_id     # 자식 좌표계
geometry_msgs/Transform transform   # 부모 기준 자식의 위치·자세`,
    desc: 'TF 트리의 간선 하나. "부모 → 자식" 변환.',
    notes: ['tf2_ros.TransformBroadcaster / StaticTransformBroadcaster로 보낸다.', '한 자식 프레임의 부모는 하나뿐 — 두 노드가 같은 자식을 발행하면 TF가 싸운다(odom→base_footprint를 ekf와 diff_drive가 동시에 내는 경우).'],
    usedIn: ['map→odom(rtabmap), odom→base_footprint(ekf), 로봇 링크(robot_state_publisher)'],
    cli: `ros2 run tf2_ros static_transform_publisher --x 0.1 --z 0.5 --frame-id base_link --child-frame-id pole_cam_link`,
  },
  {
    id: 'geometry_msgs/Polygon', kind: 'msg',
    def: `geometry_msgs/Point32[] points`,
    desc: '다각형. Nav2 footprint, collision_monitor 영역.',
  },
  {
    id: 'geometry_msgs/PolygonStamped', kind: 'msg',
    def: `std_msgs/Header header
geometry_msgs/Polygon polygon`,
    desc: '좌표계가 붙은 다각형. Nav2 footprint 발행(/local_costmap/published_footprint)과 collision_monitor 영역 시각화.',
    usedIn: ['/local_costmap/published_footprint — coordinator가 컵을 들 때 키운 footprint를 RViz에서 확인'],
  },
  {
    id: 'geometry_msgs/Inertia', kind: 'msg',
    def: `float64 m                  # 질량 kg
geometry_msgs/Vector3 com  # 질량 중심 m
float64 ixx                # 관성 텐서 kg·m²
float64 ixy
float64 ixz
float64 iyy
float64 iyz
float64 izz`,
    desc: '질량·질량중심·관성 텐서. 물체 동역학 정보.',
  },
  {
    id: 'geometry_msgs/InertiaStamped', kind: 'msg',
    def: `std_msgs/Header header
geometry_msgs/Inertia inertia`,
    desc: '좌표계가 붙은 관성 정보.',
  },
  {
    id: 'geometry_msgs/PolygonInstance', kind: 'msg',
    def: `geometry_msgs/Polygon polygon
int64 id`,
    desc: "식별자(id)를 가진 다각형 — 같은 토픽에서 여러 다각형을 구분할 때.",
  },
  {
    id: 'geometry_msgs/PolygonInstanceStamped', kind: 'msg',
    def: `std_msgs/Header header
geometry_msgs/PolygonInstance polygon`,
    desc: "PolygonInstance + Header.",
  },
  {
    id: 'geometry_msgs/VelocityStamped', kind: 'msg',
    def: `std_msgs/Header header
string body_frame_id
string reference_frame_id
geometry_msgs/Twist velocity`,
    desc: "기준 좌표계를 명시한 속도 — body_frame_id(무엇의 속도)와 reference_frame_id(어느 좌표계 기준)를 모두 담는다. Twist의 좌표계 모호함을 없애려는 신규 타입.",
  },
  {
    id: 'geometry_msgs/VelocityWithCovarianceStamped', kind: 'msg',
    def: `std_msgs/Header header
string body_frame_id
string reference_frame_id
geometry_msgs/TwistWithCovariance velocity`,
    desc: "VelocityStamped에 불확실성(공분산)을 더한 것.",
  },

  // ───────── sensor_msgs
  {
    id: 'sensor_msgs/Image', kind: 'msg',
    def: `std_msgs/Header header   # frame_id: 카메라 *_optical_frame (z 앞, x 오른쪽, y 아래)
uint32 height            # 행 수 (px)
uint32 width             # 열 수 (px)
string encoding          # rgb8, bgr8, mono8, 16UC1(depth mm), 32FC1(depth m) ...
uint8 is_bigendian
uint32 step              # 한 행의 바이트 수 = width × 픽셀당 바이트
uint8[] data             # height × step 바이트`,
    desc: '압축하지 않은 영상. 컬러·depth 모두 이 타입이고 encoding으로 구분한다.',
    notes: ['cv_bridge(C++/Python)로 OpenCV 행렬과 오간다.', 'RealSense depth는 16UC1 = 밀리미터 정수. 32FC1(미터 실수)와 섞이면 1000배 차이가 난다.', '640×480 rgb8 30fps ≈ 27MB/s — 네트워크 너머로는 compressed를 쓴다.'],
    usedIn: ['/pole_cam/color/image_raw, /pole_cam/aligned_depth_to_color/image_raw', '/gripper_cam/color/image_raw, /gripper_cam/aligned_depth_to_color/image_raw'],
    cli: `ros2 topic hz /pole_cam/color/image_raw
ros2 run rqt_image_view rqt_image_view`,
  },
  {
    id: 'sensor_msgs/CompressedImage', kind: 'msg',
    def: `std_msgs/Header header
string format    # "jpeg", "png", "16UC1; compressedDepth" ...
uint8[] data     # 압축된 바이트`,
    desc: '압축 영상. image_transport가 /…/compressed 토픽으로 자동 제공.',
    notes: ['원격 PC(학습·모니터링)로 보낼 때 대역폭을 크게 줄인다. 로봇 안의 노드끼리는 raw가 지연이 적다.'],
  },
  {
    id: 'sensor_msgs/CameraInfo', kind: 'msg',
    def: `std_msgs/Header header
uint32 height
uint32 width
string distortion_model   # "plumb_bob" 등
float64[] d               # 왜곡 계수
float64[9] k              # 내부 행렬 [fx 0 cx; 0 fy cy; 0 0 1]
float64[9] r              # 정렬 행렬 (단안은 단위행렬)
float64[12] p             # 투영 행렬
uint32 binning_x
uint32 binning_y
sensor_msgs/RegionOfInterest roi`,
    desc: '카메라 보정값. 픽셀(u,v)+깊이 d를 3D 점으로 바꿀 때 필요하다.',
    notes: ['3D 복원: X = (u − cx)·d / fx, Y = (v − cy)·d / fy, Z = d (optical 좌표계).', '영상과 같은 header.stamp로 짝지어 쓴다.'],
    usedIn: ['/pole_cam/color/camera_info → perception, rtabmap', '/gripper_cam/color/camera_info → perception'],
  },
  {
    id: 'sensor_msgs/RegionOfInterest', kind: 'msg',
    def: `uint32 x_offset   # 왼쪽 위 px
uint32 y_offset
uint32 height     # 0이면 전체 영상
uint32 width
bool do_rectify`,
    desc: '영상 안의 사각 영역. CameraInfo.roi, 검출 박스 표현에도 쓴다.',
  },
  {
    id: 'sensor_msgs/PointCloud2', kind: 'msg',
    def: `std_msgs/Header header
uint32 height              # 정렬된 점구름이면 영상 높이, 아니면 1
uint32 width               # 점 개수 (height=1일 때)
sensor_msgs/PointField[] fields   # 점 하나의 필드 구성 (x, y, z, rgb ...)
bool is_bigendian
uint32 point_step          # 점 하나의 바이트 수
uint32 row_step            # 한 행의 바이트 수
uint8[] data               # 모든 점의 바이트
bool is_dense              # NaN 점이 없으면 true`,
    desc: '3D 점구름. 바이트 배열 + 필드 설명 구조라 어떤 필드든 담을 수 있다.',
    notes: ['직접 파싱하지 말고 sensor_msgs_py.point_cloud2.read_points / PCL(pcl_conversions)을 쓴다.', '용량이 커서(640×480이면 수 MB) 다운샘플(decimation, voxel)이 필수.', 'costmap·collision_monitor·octomap이 바로 받을 수 있다.'],
    usedIn: ['/pole_cam/depth/color/points → costmap, collision_monitor, move_group(octomap)', '/gripper_cam/depth/color/points → grasp_scorer'],
  },
  {
    id: 'sensor_msgs/PointField', kind: 'msg',
    def: `uint8 INT8=1
uint8 UINT8=2
uint8 INT16=3
uint8 UINT16=4
uint8 INT32=5
uint8 UINT32=6
uint8 FLOAT32=7
uint8 FLOAT64=8
string name       # "x", "y", "z", "rgb", "intensity" ...
uint32 offset     # 점 안에서의 바이트 위치
uint8 datatype    # 위 상수 중 하나
uint32 count      # 원소 수 (보통 1)`,
    desc: 'PointCloud2 안 점 하나의 필드 설명.',
  },
  {
    id: 'sensor_msgs/LaserScan', kind: 'msg',
    def: `std_msgs/Header header   # frame_id: 스캐너 좌표계
float32 angle_min        # 첫 빔 각도 (rad)
float32 angle_max        # 마지막 빔 각도 (rad)
float32 angle_increment  # 빔 간격 (rad)
float32 time_increment   # 빔 사이 시간 (s)
float32 scan_time        # 한 바퀴 시간 (s)
float32 range_min        # 유효 최소 거리 (m)
float32 range_max        # 유효 최대 거리 (m)
float32[] ranges         # 빔별 거리 (m), 범위 밖은 inf/NaN
float32[] intensities    # 반사 강도 (없으면 빈 배열)`,
    desc: '2D 거리 스캔 (LiDAR). slam_toolbox·amcl·costmap의 기본 입력.',
    notes: ['이 설계는 LiDAR가 없어서 쓰지 않는다. 필요하면 pointcloud_to_laserscan으로 점구름에서 만든다.'],
  },
  {
    id: 'sensor_msgs/Imu', kind: 'msg',
    def: `std_msgs/Header header                        # frame_id: imu_link
geometry_msgs/Quaternion orientation          # 자세 (없으면 covariance[0] = -1)
float64[9] orientation_covariance
geometry_msgs/Vector3 angular_velocity        # rad/s
float64[9] angular_velocity_covariance
geometry_msgs/Vector3 linear_acceleration     # m/s² (중력 포함)
float64[9] linear_acceleration_covariance`,
    desc: '관성 센서. 회전 속도(자이로)와 가속도, 필요하면 자세.',
    notes: ['covariance[0] = -1은 "그 값이 없음"이라는 약속.', '가속도에는 중력(약 9.8)이 들어 있다.', 'ekf에는 보통 angular_velocity.z(yaw rate)만 넣는다.'],
    usedIn: ['/imu (imu_sensor_broadcaster → ekf, rl_nav_correction)'],
  },
  {
    id: 'sensor_msgs/MagneticField', kind: 'msg',
    def: `std_msgs/Header header
geometry_msgs/Vector3 magnetic_field   # 테슬라 (T)
float64[9] magnetic_field_covariance`,
    desc: '지자기 센서. 절대 방위(yaw) 보정에 쓰지만 실내에선 철골·모터 때문에 믿기 어렵다.',
  },
  {
    id: 'sensor_msgs/Temperature', kind: 'msg',
    def: `std_msgs/Header header
float64 temperature   # °C
float64 variance      # 0이면 모름`,
    desc: '온도 센서 (모터·배터리 과열 감시 등).',
  },
  {
    id: 'sensor_msgs/JointState', kind: 'msg',
    def: `std_msgs/Header header
string[] name        # 관절 이름 (URDF와 동일)
float64[] position   # rad (회전) 또는 m (직선)
float64[] velocity   # rad/s 또는 m/s
float64[] effort     # N·m 또는 N — 다이나믹셀은 전류를 넣기도 함`,
    desc: '관절 상태. 배열 인덱스가 name과 짝이다 (순서는 보장되지 않으니 이름으로 찾는다).',
    notes: ['velocity·effort는 비어 있을 수 있다.', 'robot_state_publisher가 이걸로 TF를 계산한다.'],
    usedIn: ['/joint_states (joint_state_broadcaster → robot_state_publisher, move_group, arm_safety_monitor)'],
    cli: `ros2 topic echo /joint_states --once`,
  },
  {
    id: 'sensor_msgs/BatteryState', kind: 'msg',
    def: `std_msgs/Header header
float32 voltage          # V
float32 temperature      # °C
float32 current          # A (방전은 음수)
float32 charge           # Ah
float32 capacity         # Ah
float32 design_capacity  # Ah
float32 percentage       # 0.0 ~ 1.0
uint8 power_supply_status
uint8 power_supply_health
uint8 power_supply_technology
bool present
float32[] cell_voltage
float32[] cell_temperature
string location
string serial_number
# (상수 정의 생략)`,
    desc: '배터리 상태. 충전 복귀 판단에 쓴다.',
  },
  {
    id: 'sensor_msgs/Range', kind: 'msg',
    def: `std_msgs/Header header
uint8 ULTRASOUND=0
uint8 INFRARED=1
uint8 radiation_type
float32 field_of_view   # rad
float32 min_range       # m
float32 max_range       # m
float32 range           # m
float32 variance        # 측정 분산 (Jazzy+, 0이면 모름)`,
    desc: '단일 거리 센서 (초음파·적외선).',
  },
  {
    id: 'sensor_msgs/NavSatFix', kind: 'msg',
    def: `std_msgs/Header header
sensor_msgs/NavSatStatus status   # 수신 상태·위성 시스템
float64 latitude                  # 도 (+ 북)
float64 longitude                 # 도 (+ 동)
float64 altitude                  # m (WGS84 타원체 기준)
float64[9] position_covariance    # m², ENU
uint8 COVARIANCE_TYPE_UNKNOWN=0
uint8 COVARIANCE_TYPE_APPROXIMATED=1
uint8 COVARIANCE_TYPE_DIAGONAL_KNOWN=2
uint8 COVARIANCE_TYPE_KNOWN=3
uint8 position_covariance_type`,
    desc: 'GPS 위치. 실외 로봇에서 robot_localization의 navsat_transform으로 map 좌표에 합친다.',
  },
  {
    id: 'sensor_msgs/Joy', kind: 'msg',
    def: `std_msgs/Header header
float32[] axes     # 스틱 -1.0 ~ 1.0
int32[] buttons    # 0/1`,
    desc: '조이스틱 입력. teleop_twist_joy가 이걸 Twist로 바꾼다.',
  },
  {
    id: 'sensor_msgs/ChannelFloat32', kind: 'msg',
    def: `string name
float32[] values`,
    desc: "구형 PointCloud의 채널 (점마다 실수 값 하나).",
  },
  {
    id: 'sensor_msgs/FluidPressure', kind: 'msg',
    def: `std_msgs/Header header
float64 fluid_pressure
float64 variance`,
    desc: "기압·수압 (Pa).",
  },
  {
    id: 'sensor_msgs/Illuminance', kind: 'msg',
    def: `std_msgs/Header header
float64 illuminance
float64 variance`,
    desc: "조도 (lux).",
  },
  {
    id: 'sensor_msgs/JoyFeedback', kind: 'msg',
    def: `uint8 TYPE_LED    = 0
uint8 TYPE_RUMBLE = 1
uint8 TYPE_BUZZER = 2
uint8 type
uint8 id
float32 intensity`,
    desc: "조이스틱 진동·LED 피드백 하나.",
  },
  {
    id: 'sensor_msgs/JoyFeedbackArray', kind: 'msg',
    def: `sensor_msgs/JoyFeedback[] array`,
    desc: "조이스틱 피드백 여러 개.",
  },
  {
    id: 'sensor_msgs/LaserEcho', kind: 'msg',
    def: `float32[] echoes`,
    desc: "레이저 빔 하나의 다중 반사 거리.",
  },
  {
    id: 'sensor_msgs/MultiDOFJointState', kind: 'msg',
    def: `std_msgs/Header header
string[] joint_names
geometry_msgs/Transform[] transforms
geometry_msgs/Twist[] twist
geometry_msgs/Wrench[] wrench`,
    desc: "다자유도 관절(예: 이동 베이스의 x·y·yaw)의 상태 — 변환·속도·힘.",
  },
  {
    id: 'sensor_msgs/MultiEchoLaserScan', kind: 'msg',
    def: `std_msgs/Header header
float32 angle_min
float32 angle_max
float32 angle_increment
float32 time_increment
float32 scan_time
float32 range_min
float32 range_max
sensor_msgs/LaserEcho[] ranges
sensor_msgs/LaserEcho[] intensities`,
    desc: "빔마다 여러 반사를 담는 LiDAR 스캔.",
  },
  {
    id: 'sensor_msgs/NavSatStatus', kind: 'msg',
    def: `int8 STATUS_UNKNOWN = -2
int8 STATUS_NO_FIX =  -1
int8 STATUS_FIX =      0
int8 STATUS_SBAS_FIX = 1
int8 STATUS_GBAS_FIX = 2
int8 status -2
uint16 SERVICE_UNKNOWN = 0
uint16 SERVICE_GPS =     1
uint16 SERVICE_GLONASS = 2
uint16 SERVICE_COMPASS = 4
uint16 SERVICE_GALILEO = 8
uint16 service`,
    desc: "GPS 수신 상태 (FIX 없음/FIX/SBAS/GBAS)와 위성 시스템(GPS·GLONASS·Galileo·BeiDou).",
  },
  {
    id: 'sensor_msgs/PointCloud', kind: 'msg',
    def: `std_msgs/Header header
geometry_msgs/Point32[] points
sensor_msgs/ChannelFloat32[] channels`,
    desc: "구형 점구름 (Point32 배열 + 채널). 새 코드는 PointCloud2를 쓴다.",
  },
  {
    id: 'sensor_msgs/RelativeHumidity', kind: 'msg',
    def: `std_msgs/Header header
float64 relative_humidity
float64 variance`,
    desc: "상대 습도 (0~1).",
  },
  {
    id: 'sensor_msgs/SetCameraInfo', kind: 'srv',
    def: `# Request
sensor_msgs/CameraInfo camera_info
---
# Response
bool success
string status_message`,
    desc: "카메라 드라이버에 보정값을 저장시키는 서비스. camera_calibration 도구가 보정 후 호출한다.",
  },
  {
    id: 'sensor_msgs/TimeReference', kind: 'msg',
    def: `std_msgs/Header header
builtin_interfaces/Time time_ref
string source`,
    desc: "외부 시각 기준(GPS 시각 등)과 로컬 시각의 대응.",
  },

  // ───────── nav_msgs
  {
    id: 'nav_msgs/Odometry', kind: 'msg',
    def: `std_msgs/Header header        # frame_id: odom (pose의 기준)
string child_frame_id         # base_footprint (twist의 기준)
geometry_msgs/PoseWithCovariance pose     # odom 기준 로봇 위치
geometry_msgs/TwistWithCovariance twist   # 로봇 몸 기준 속도`,
    desc: '오도메트리 — 시작점(odom) 기준으로 얼마나 움직였나 + 지금 속도. 연속적이지만 시간이 지나면 드리프트한다.',
    notes: ['pose와 twist의 좌표계가 다르다 (header.frame_id vs child_frame_id) — 가장 많이 헷갈리는 부분.', 'map 기준 위치는 rtabmap/amcl의 map→odom을 곱해서 얻는다.'],
    usedIn: ['/odom (diff_drive_controller → ekf, rl_nav_correction)', '/odometry/filtered (ekf → rtabmap, Nav2, rl_nav_tuner)'],
    cli: `ros2 topic echo /odometry/filtered --field pose.pose.position`,
  },
  {
    id: 'nav_msgs/Path', kind: 'msg',
    def: `std_msgs/Header header             # frame_id: map
geometry_msgs/PoseStamped[] poses  # 경로점 순서대로`,
    desc: '경로 — 자세의 나열.',
    usedIn: ['/plan (planner_server → rl_nav_correction, rl_nav_tuner, RViz)', 'FollowPath 액션의 goal'],
  },
  {
    id: 'nav_msgs/OccupancyGrid', kind: 'msg',
    def: `std_msgs/Header header       # frame_id: map
nav_msgs/MapMetaData info    # 해상도·크기·원점
int8[] data                  # 행 우선, -1 = 모름, 0 = 비어 있음, 100 = 막힘`,
    desc: '2D 격자 지도. 셀마다 점유 확률(0~100).',
    notes: ['셀 (i, j)의 월드 좌표 = origin + (j + 0.5, i + 0.5) × resolution.', 'costmap도 같은 타입으로 발행하지만 값 의미가 다르다 (비용 0~100, 99 = 내접 반경, 100 = 충돌).', '지도는 transient_local로 발행해 늦게 붙는 노드도 받게 한다.'],
    usedIn: ['/map (rtabmap → global_costmap static layer)', '/local_costmap/costmap (→ rl_nav_tuner)'],
  },
  {
    id: 'nav_msgs/MapMetaData', kind: 'msg',
    def: `builtin_interfaces/Time map_load_time
float32 resolution         # m/셀 (예: 0.05)
uint32 width               # 셀 수
uint32 height
geometry_msgs/Pose origin  # 셀 (0,0)의 월드 위치 (좌하단)`,
    desc: 'OccupancyGrid의 크기·해상도·원점.',
  },
  {
    id: 'nav_msgs/GetMap', kind: 'srv',
    def: `# Request
# (없음)
---
# Response
nav_msgs/OccupancyGrid map`,
    desc: "지도 서버에서 현재 지도를 받아오는 서비스.",
  },
  {
    id: 'nav_msgs/GetPlan', kind: 'srv',
    def: `# Request
geometry_msgs/PoseStamped start
geometry_msgs/PoseStamped goal
float32 tolerance
---
# Response
nav_msgs/Path plan`,
    desc: "시작·목표 자세로 경로를 요청하는 서비스 (ROS 1 move_base 시절 형태).",
  },
  {
    id: 'nav_msgs/Goals', kind: 'msg',
    def: `std_msgs/Header header
geometry_msgs/PoseStamped[] goals`,
    desc: "목표 자세 여러 개 + Header.",
  },
  {
    id: 'nav_msgs/GridCells', kind: 'msg',
    def: `std_msgs/Header header
float32 cell_width
float32 cell_height
geometry_msgs/Point[] cells`,
    desc: "격자 셀들의 중심점 목록 (셀 크기 포함). RViz에서 특정 셀을 강조할 때.",
  },
  {
    id: 'nav_msgs/LoadMap', kind: 'srv',
    def: `# Request
string map_url
---
# Response
uint8 RESULT_SUCCESS=0
uint8 RESULT_MAP_DOES_NOT_EXIST=1
uint8 RESULT_INVALID_MAP_DATA=2
uint8 RESULT_INVALID_MAP_METADATA=3
uint8 RESULT_UNDEFINED_FAILURE=255
nav_msgs/OccupancyGrid map
uint8 result`,
    desc: "지도 파일 URL을 받아 지도를 불러오는 서비스.",
  },
  {
    id: 'nav_msgs/SetMap', kind: 'srv',
    def: `# Request
nav_msgs/OccupancyGrid map
geometry_msgs/PoseWithCovarianceStamped initial_pose
---
# Response
bool success`,
    desc: "지도와 초기 자세를 함께 설정하는 서비스.",
  },
  {
    id: 'nav_msgs/Trajectory', kind: 'msg',
    def: `std_msgs/Header header
nav_msgs/TrajectoryPoint[] points`,
    desc: "시간 정보가 있는 이동 궤적 (자세·속도·가속도 시퀀스).",
  },
  {
    id: 'nav_msgs/TrajectoryPoint', kind: 'msg',
    def: `std_msgs/Header header
geometry_msgs/Pose pose
geometry_msgs/Twist velocity
geometry_msgs/Accel acceleration
geometry_msgs/Wrench effort`,
    desc: "궤적의 한 점 (시각, 자세, 속도, 가속도, 힘).",
  },

  // ───────── tf2_msgs
  {
    id: 'tf2_msgs/TFMessage', kind: 'msg',
    def: `geometry_msgs/TransformStamped[] transforms`,
    desc: '/tf(움직이는 변환)와 /tf_static(고정 변환) 토픽의 타입. 직접 구독하기보다 tf2_ros.Buffer + TransformListener로 조회한다.',
    notes: ['/tf_static은 transient_local — 한 번만 발행해도 늦게 붙은 노드가 받는다.', 'lookupTransform에 데이터의 stamp를 넣어야 움직이는 카메라(gripper_cam)도 정확하다.'],
    usedIn: ['/tf: rtabmap(map→odom), ekf(odom→base_footprint), robot_state_publisher(팔 링크)', '/tf_static: robot_state_publisher, realsense2_camera'],
    cli: `ros2 run tf2_ros tf2_echo map base_footprint
ros2 run tf2_tools view_frames`,
  },
  {
    id: 'tf2_msgs/FrameGraph', kind: 'srv',
    def: `# Request
# (없음)
---
# Response
string frame_yaml`,
    desc: "TF 프레임 트리 구조를 문자열로 받는 서비스 (view_frames가 쓴다).",
  },
  {
    id: 'tf2_msgs/LookupTransform', kind: 'action',
    def: `# Goal
string target_frame
string source_frame
builtin_interfaces/Time source_time
builtin_interfaces/Duration timeout
builtin_interfaces/Time target_time
string fixed_frame
bool advanced
---
# Result
geometry_msgs/TransformStamped transform
tf2_msgs/TF2Error error
---
# Feedback
# (없음)`,
    desc: "원격 노드에 TF 조회를 맡기는 액션 (tf2 buffer server).",
  },
  {
    id: 'tf2_msgs/TF2Error', kind: 'msg',
    def: `uint8 NO_ERROR = 0
uint8 LOOKUP_ERROR = 1
uint8 CONNECTIVITY_ERROR = 2
uint8 EXTRAPOLATION_ERROR = 3
uint8 INVALID_ARGUMENT_ERROR = 4
uint8 TIMEOUT_ERROR = 5
uint8 TRANSFORM_ERROR = 6
uint8 error
string error_string`,
    desc: "TF 조회 실패 종류 (LOOKUP_ERROR, CONNECTIVITY_ERROR, EXTRAPOLATION_ERROR ...).",
  },

  // ───────── trajectory_msgs
  {
    id: 'trajectory_msgs/JointTrajectory', kind: 'msg',
    def: `std_msgs/Header header        # stamp 0 = 받는 즉시 시작
string[] joint_names
trajectory_msgs/JointTrajectoryPoint[] points`,
    desc: '여러 관절의 시간별 목표 궤적.',
    usedIn: ['FollowJointTrajectory 액션 goal의 trajectory (move_group → arm_controller)'],
  },
  {
    id: 'trajectory_msgs/JointTrajectoryPoint', kind: 'msg',
    def: `float64[] positions        # joint_names 순서
float64[] velocities
float64[] accelerations
float64[] effort
builtin_interfaces/Duration time_from_start   # 궤적 시작부터 이 점까지 시간`,
    desc: '궤적의 한 점. JTC가 점 사이를 보간(스플라인)한다.',
  },
  {
    id: 'trajectory_msgs/MultiDOFJointTrajectory', kind: 'msg',
    def: `std_msgs/Header header
string[] joint_names
trajectory_msgs/MultiDOFJointTrajectoryPoint[] points`,
    desc: "다자유도 관절(이동 베이스·드론 등)의 궤적.",
  },
  {
    id: 'trajectory_msgs/MultiDOFJointTrajectoryPoint', kind: 'msg',
    def: `geometry_msgs/Transform[] transforms
geometry_msgs/Twist[] velocities
geometry_msgs/Twist[] accelerations
builtin_interfaces/Duration time_from_start`,
    desc: "다자유도 궤적의 한 점 (Transform·Twist·가속도 + 시각).",
  },

  // ───────── control_msgs
  {
    id: 'control_msgs/FollowJointTrajectory', kind: 'action',
    def: `# Goal
trajectory_msgs/JointTrajectory trajectory
trajectory_msgs/MultiDOFJointTrajectory multi_dof_trajectory
control_msgs/JointTolerance[] path_tolerance      # 경로 중 허용 오차 (넘으면 abort)
control_msgs/JointComponentTolerance[] component_path_tolerance
control_msgs/JointTolerance[] goal_tolerance      # 도착 판정 오차
control_msgs/JointComponentTolerance[] component_goal_tolerance
builtin_interfaces/Duration goal_time_tolerance
---
# Result
int32 SUCCESSFUL = 0
int32 INVALID_GOAL = -1
int32 INVALID_JOINTS = -2
int32 OLD_HEADER_TIMESTAMP = -3
int32 PATH_TOLERANCE_VIOLATED = -4
int32 GOAL_TOLERANCE_VIOLATED = -5
int32 error_code
string error_string
---
# Feedback
std_msgs/Header header
string[] joint_names
trajectory_msgs/JointTrajectoryPoint desired   # 지금 있어야 할 곳
trajectory_msgs/JointTrajectoryPoint actual    # 실제 위치
trajectory_msgs/JointTrajectoryPoint error     # desired − actual
string[] multi_dof_joint_names                 # 다자유도 관절 (팔만 쓰면 비어 있음)
trajectory_msgs/MultiDOFJointTrajectoryPoint multi_dof_desired
trajectory_msgs/MultiDOFJointTrajectoryPoint multi_dof_actual
trajectory_msgs/MultiDOFJointTrajectoryPoint multi_dof_error`,
    desc: '팔에 궤적을 실행시키는 표준 액션. JointTrajectoryController가 서버.',
    notes: ['tolerance를 goal에 안 넣으면 컨트롤러 YAML의 constraints가 쓰인다.', '취소(cancel)하면 JTC는 현재 자세를 유지한다.'],
    usedIn: ['/arm_controller/follow_joint_trajectory (move_group → arm_controller)'],
  },
  {
    id: 'control_msgs/GripperCommand', kind: 'action',
    def: `# Goal
control_msgs/GripperCommand command   # position(m 또는 rad), max_effort
---
# Result
float64 position      # 끝난 위치
float64 effort        # 끝났을 때 힘
bool stalled          # 막혀서 멈춤 (물체를 잡았을 가능성)
bool reached_goal     # 목표 위치 도달
---
# Feedback
float64 position
float64 effort
bool stalled
bool reached_goal`,
    desc: '그리퍼 열기·닫기 액션. GripperActionController가 서버.',
    notes: ['물체를 잡으면 보통 stalled=true, reached_goal=false. 완전히 닫혔는데 stalled가 아니면 빈손.', 'goal 안의 command는 같은 이름의 msg 타입(position, max_effort 두 필드)이다.'],
    usedIn: ['/gripper_controller/gripper_cmd (move_group(MTC) → gripper_controller)'],
  },
  {
    id: 'control_msgs/JointTrajectoryControllerState', kind: 'msg',
    def: `std_msgs/Header header
string[] joint_names
trajectory_msgs/JointTrajectoryPoint reference   # 목표
trajectory_msgs/JointTrajectoryPoint feedback    # 실제
trajectory_msgs/JointTrajectoryPoint error       # 오차
trajectory_msgs/JointTrajectoryPoint output      # 컨트롤러 출력
string[] multi_dof_joint_names
trajectory_msgs/MultiDOFJointTrajectoryPoint multi_dof_reference
trajectory_msgs/MultiDOFJointTrajectoryPoint multi_dof_feedback
trajectory_msgs/MultiDOFJointTrajectoryPoint multi_dof_error
trajectory_msgs/MultiDOFJointTrajectoryPoint multi_dof_output
float64 speed_scaling_factor                     # 현재 실행 속도 배율 (1.0 = 정상)`,
    desc: 'JTC의 내부 상태. 추종 오차 모니터링·튜닝용.',
    usedIn: ['/arm_controller/controller_state'],
  },
  {
    id: 'control_msgs/AdmittanceControllerState', kind: 'msg',
    def: `std_msgs/Float64MultiArray mass
std_msgs/Float64MultiArray damping
std_msgs/Float64MultiArray stiffness
geometry_msgs/Quaternion rot_base_control
geometry_msgs/TransformStamped ref_trans_base_ft
std_msgs/Int8MultiArray selected_axes
std_msgs/String ft_sensor_frame
geometry_msgs/TransformStamped admittance_position
geometry_msgs/TwistStamped admittance_acceleration
geometry_msgs/TwistStamped admittance_velocity
geometry_msgs/WrenchStamped wrench_base
sensor_msgs/JointState joint_state`,
    desc: "admittance_controller의 내부 상태 (힘 → 위치 보정 제어).",
  },
  {
    id: 'control_msgs/BatteryStateArray', kind: 'msg',
    def: `sensor_msgs/BatteryState[] battery_states`,
    desc: "배터리 여러 개의 상태 묶음.",
  },
  {
    id: 'control_msgs/DynamicInterfaceGroupValues', kind: 'msg',
    def: `std_msgs/Header header
string[] interface_groups
control_msgs/InterfaceValue[] interface_values`,
    desc: "인터페이스 그룹(예: 센서 묶음)별 값. GPIO·센서 브로드캐스터용.",
  },
  {
    id: 'control_msgs/DynamicInterfaceValues', kind: 'msg',
    def: `std_msgs/Header header
control_msgs/InterfaceValue states
control_msgs/InterfaceValue commands`,
    desc: "인터페이스 이름과 값 목록 (DynamicJointState의 한 관절 몫).",
  },
  {
    id: 'control_msgs/DynamicJointState', kind: 'msg',
    def: `std_msgs/Header header
string[] joint_names
control_msgs/InterfaceValue[] interface_values`,
    desc: "관절마다 position·velocity·effort 외의 임의 인터페이스까지 담는 상태. joint_state_broadcaster가 /dynamic_joint_states로 발행.",
    usedIn: ["/dynamic_joint_states (joint_state_broadcaster, 디버그)"],
  },
  {
    id: 'control_msgs/ExecuteMotionPrimitiveSequence', kind: 'action',
    def: `# Goal
control_msgs/MotionPrimitiveSequence trajectory
---
# Result
int32 SUCCESSFUL = 0
int32 INVALID_GOAL = -1
int32 MOTION_EXECUTION_FAILED = -2
int32 OLD_HEADER_TIMESTAMP = -3
int32 ABORTED_BY_DEACTIVATION = -4
int32 error_code
string error_string
---
# Feedback
uint8 current_primitive_index`,
    desc: "모션 프리미티브(직선·원호 이동 등) 시퀀스 실행 액션. 산업용 팔 컨트롤러용 신규 인터페이스.",
  },
  {
    id: 'control_msgs/Float64Values', kind: 'msg',
    def: `std_msgs/Header header
float64[] values`,
    desc: "실수 값 배열 (컨트롤러 상태 출력용).",
  },
  {
    id: 'control_msgs/InterfaceValue', kind: 'msg',
    def: `string[] interface_names
float64[] values`,
    desc: "인터페이스 이름과 값 하나씩.",
  },
  {
    id: 'control_msgs/JointCommand', kind: 'msg',
    def: `std_msgs/Header header
string[] joint_names
string interface_name
float64[] values`,
    desc: "관절 명령 (이름·위치·속도·힘).",
  },
  {
    id: 'control_msgs/JointComponentTolerance', kind: 'msg',
    def: `uint16 X_AXIS=1
uint16 Y_AXIS=2
uint16 Z_AXIS=3
uint16 TRANSLATION=4
uint16 ROTATION=5
string joint_name
uint16 component
float64 position
float64 velocity
float64 acceleration`,
    desc: "MultiDOF 관절의 성분별(위치·회전) 허용 오차.",
  },
  {
    id: 'control_msgs/JointControllerState', kind: 'msg',
    def: `std_msgs/Header header
float64 set_point
float64 process_value
float64 process_value_dot
float64 error
float64 time_step
float64 command
float64 p
float64 i
float64 d
float64 i_clamp
bool antiwindup`,
    desc: "단일 관절 PID 컨트롤러의 상태 (목표·실제·오차·출력·게인).",
  },
  {
    id: 'control_msgs/JointJog', kind: 'msg',
    def: `std_msgs/Header header
string[] joint_names
float64[] displacements
float64[] velocities
float64 duration`,
    desc: "관절을 조금씩 움직이는 조그 명령 (변위 또는 속도). MoveIt Servo가 받는다.",
    notes: ["텔레옵으로 팔을 관절 단위로 움직일 때 쓴다."],
  },
  {
    id: 'control_msgs/JointTolerance', kind: 'msg',
    def: `string name
float64 position
float64 velocity
float64 acceleration`,
    desc: "관절별 허용 오차 (위치·속도·가속도). FollowJointTrajectory의 path/goal_tolerance 요소.",
    notes: ["0이면 \"기본값 사용\", 음수면 \"검사 안 함\"."],
  },
  {
    id: 'control_msgs/JointTrajectory', kind: 'action',
    def: `# Goal
trajectory_msgs/JointTrajectory trajectory
---
# Result
# (없음)
---
# Feedback
# (없음)`,
    desc: "궤적 실행 액션 (구버전 형태, 허용 오차 없이 궤적만). 새 코드는 FollowJointTrajectory를 쓴다.",
  },
  {
    id: 'control_msgs/Keys', kind: 'msg',
    def: `std_msgs/Header header
string[] keys`,
    desc: "키 입력 목록 (텔레옵 입력 장치용).",
  },
  {
    id: 'control_msgs/MecanumDriveControllerState', kind: 'msg',
    def: `std_msgs/Header header
float64 front_left_wheel_velocity
float64 back_left_wheel_velocity
float64 back_right_wheel_velocity
float64 front_right_wheel_velocity
geometry_msgs/Twist reference_velocity`,
    desc: "메카넘 휠 컨트롤러의 바퀴별 속도 상태.",
  },
  {
    id: 'control_msgs/MotionArgument', kind: 'msg',
    def: `string name
float64 value`,
    desc: "모션 프리미티브의 인자 (이름·값).",
  },
  {
    id: 'control_msgs/MotionPrimitive', kind: 'msg',
    def: `int8 UNKNOWN=-1
int8 LINEAR_JOINT=0
int8 LINEAR_CARTESIAN=50
int8 CIRCULAR_CARTESIAN=51
int8 type -1
float64 blend_radius
control_msgs/MotionArgument[] additional_arguments
geometry_msgs/PoseStamped[] poses
float64[] joint_positions`,
    desc: "모션 프리미티브 하나 (직선 이동·관절 이동·원호 등과 그 인자).",
  },
  {
    id: 'control_msgs/MotionPrimitiveSequence', kind: 'msg',
    def: `control_msgs/MotionPrimitive[] motions`,
    desc: "모션 프리미티브 여러 개의 순서열.",
  },
  {
    id: 'control_msgs/MultiDOFCommand', kind: 'msg',
    def: `string[] dof_names
float64[] values
float64[] values_dot`,
    desc: "여러 자유도에 대한 명령 값 (PID 컨트롤러 입력).",
  },
  {
    id: 'control_msgs/MultiDOFStateStamped', kind: 'msg',
    def: `std_msgs/Header header
control_msgs/SingleDOFState[] dof_states`,
    desc: "여러 자유도 상태 + Header (PID 컨트롤러 출력).",
  },
  {
    id: 'control_msgs/ParallelGripperCommand', kind: 'action',
    def: `# Goal
sensor_msgs/JointState command
---
# Result
sensor_msgs/JointState state
bool stalled
bool reached_goal
---
# Feedback
sensor_msgs/JointState state`,
    desc: "평행 그리퍼 액션 (JointState로 목표 위치·속도·힘 지정). parallel_gripper_action_controller가 서버 — GripperCommand의 후속.",
    notes: ["Jazzy 이후 새 그리퍼 설정은 이쪽으로 옮겨 가는 추세."],
  },
  {
    id: 'control_msgs/PidState', kind: 'msg',
    def: `std_msgs/Header header
builtin_interfaces/Duration timestep
float64 error
float64 error_dot
float64 p_error
float64 i_error
float64 d_error
float64 p_term
float64 i_term
float64 d_term
float64 i_max
float64 i_min
float64 output`,
    desc: "PID 제어기 내부 값 (p/i/d 항, 오차, 출력). 게인 튜닝 때 rqt_plot으로 본다.",
  },
  {
    id: 'control_msgs/PointHead', kind: 'action',
    def: `# Goal
geometry_msgs/PointStamped target
geometry_msgs/Vector3 pointing_axis
string pointing_frame
builtin_interfaces/Duration min_duration
float64 max_velocity
---
# Result
# (없음)
---
# Feedback
float64 pointing_angle_error`,
    desc: "로봇 머리(카메라)가 특정 점을 바라보게 하는 액션.",
  },
  {
    id: 'control_msgs/QueryCalibrationState', kind: 'srv',
    def: `# Request
# (없음)
---
# Response
bool is_calibrated`,
    desc: "하드웨어 캘리브레이션이 끝났는지 묻는 서비스.",
  },
  {
    id: 'control_msgs/QueryTrajectoryState', kind: 'srv',
    def: `# Request
builtin_interfaces/Time time
---
# Response
bool success
string message
string[] name
float64[] position
float64[] velocity
float64[] acceleration`,
    desc: "특정 시각에 궤적상 관절이 어디 있어야 하는지 JTC에 묻는 서비스.",
  },
  {
    id: 'control_msgs/SetOdometry', kind: 'srv',
    def: `# Request
float64 x
float64 y
float64 z
float64 roll
float64 pitch
float64 yaw
---
# Response
bool success
string message`,
    desc: "오도메트리 값을 강제로 설정(리셋)하는 서비스.",
  },
  {
    id: 'control_msgs/SingleDOFState', kind: 'msg',
    def: `string name
float64 reference
float64 feedback
float64 feedback_dot
float64 error
float64 error_dot
float64 time_step
float64 output`,
    desc: "자유도 하나의 상태 (목표·실제·오차·출력).",
  },
  {
    id: 'control_msgs/SingleDOFStateStamped', kind: 'msg',
    def: `std_msgs/Header header
control_msgs/SingleDOFState dof_state`,
    desc: "SingleDOFState + Header.",
  },
  {
    id: 'control_msgs/SingleJointPosition', kind: 'action',
    def: `# Goal
float64 position
builtin_interfaces/Duration min_duration
float64 max_velocity
---
# Result
# (없음)
---
# Feedback
std_msgs/Header header
float64 position
float64 velocity
float64 error`,
    desc: "관절 하나를 목표 위치로 보내는 액션 (예: 리프트·토르소).",
  },
  {
    id: 'control_msgs/SpeedScalingFactor', kind: 'msg',
    def: `float64 factor`,
    desc: "궤적 실행 속도 배율 (0~1). JTC가 받아 실행 속도를 줄인다.",
    notes: ["사람이 가까울 때 팔 속도를 실시간으로 낮추는 데 쓸 수 있다."],
  },
  {
    id: 'control_msgs/SteeringControllerStatus', kind: 'msg',
    def: `std_msgs/Header header
float64[] traction_wheels_position
float64[] traction_wheels_velocity
float64[] steer_positions
float64[] linear_velocity_command
float64[] steering_angle_command`,
    desc: "조향 컨트롤러(Ackermann·자전거 모델 등)의 바퀴 속도·조향각 상태.",
  },
  {
    id: 'control_msgs/VDA5050SafetyState', kind: 'msg',
    def: `string e_stop
bool field_violation
string AUTO_ACK="autoAck"
string MANUAL="manual"
string REMOTE="remote"
string NONE="none"`,
    desc: "VDA 5050(AGV 통신 표준)의 안전 상태 (비상정지·필드 위반).",
  },

  // ───────── nav2_msgs
  {
    id: 'nav2_msgs/NavigateToPose', kind: 'action',
    def: `# Goal
geometry_msgs/PoseStamped pose   # 목표 (보통 map 기준)
string behavior_tree             # 비우면 기본 BT
---
# Result
uint16 error_code                # 0 = 성공 (Jazzy+)
string error_msg
---
# Feedback
geometry_msgs/PoseStamped current_pose
builtin_interfaces/Duration navigation_time
builtin_interfaces/Duration estimated_time_remaining
int16 number_of_recoveries
float32 distance_remaining`,
    desc: '"여기로 가라" — Nav2의 최상위 이동 액션. bt_navigator가 서버.',
    notes: ['Result 필드는 배포판마다 조금 다르다 (Humble은 비어 있음). 성공 여부는 액션 상태(SUCCEEDED/ABORTED)로 판단하는 게 안전.'],
    usedIn: ['/navigate_to_pose (coordinator → bt_navigator)'],
    cli: `ros2 action send_goal /navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: 3.45, y: 0.9}, orientation: {w: 1.0}}}}" --feedback`,
  },
  {
    id: 'nav2_msgs/ComputePathToPose', kind: 'action',
    def: `# Goal
geometry_msgs/PoseStamped goal
geometry_msgs/PoseStamped start   # use_start가 true일 때만
string planner_id
bool use_start                    # false면 현재 위치에서 시작
---
# Result
nav_msgs/Path path
builtin_interfaces/Duration planning_time
uint16 error_code
string error_msg
---
# Feedback
# (없음)`,
    desc: '전역 경로 계산. planner_server가 서버.',
    usedIn: ['/compute_path_to_pose (bt_navigator → planner_server)'],
  },
  {
    id: 'nav2_msgs/FollowPath', kind: 'action',
    def: `# Goal
nav_msgs/Path path
string controller_id        # 여러 컨트롤러 플러그인 중 선택 (FollowPath 등)
string goal_checker_id
string progress_checker_id
---
# Result
std_msgs/Empty result
uint16 error_code
string error_msg
---
# Feedback
float32 distance_to_goal
float32 speed`,
    desc: '경로 따라가기. controller_server가 서버이고 실행 중 cmd_vel을 낸다.',
    usedIn: ['/follow_path (bt_navigator → controller_server)'],
  },
  {
    id: 'nav2_msgs/SpeedLimit', kind: 'msg',
    def: `std_msgs/Header header
bool percentage       # true면 speed_limit이 백분율, false면 m/s
float64 speed_limit   # 0이면 제한 해제`,
    desc: 'controller_server의 속도 상한을 실행 중에 바꾼다. Nav2 speed filter도 이 토픽을 쓴다.',
    usedIn: ['/speed_limit (rl_nav_tuner → controller_server, rl_nav_correction)'],
    cli: `ros2 topic pub --once /speed_limit nav2_msgs/msg/SpeedLimit "{percentage: true, speed_limit: 60.0}"`,
  },
  {
    id: 'nav2_msgs/AssistedTeleop', kind: 'action',
    def: `# Goal
builtin_interfaces/Duration time_allowance
---
# Result
uint16 NONE=0
uint16 UNKNOWN=730
uint16 TIMEOUT=731
uint16 TF_ERROR=732
builtin_interfaces/Duration total_elapsed_time
uint16 error_code
string error_msg
---
# Feedback
builtin_interfaces/Duration current_teleop_duration`,
    desc: "사람 조종(teleop)을 받되 충돌 직전엔 막아 주는 보조 주행 액션 (behavior_server).",
  },
  {
    id: 'nav2_msgs/BackUp', kind: 'action',
    def: `# Goal
geometry_msgs/Point target
float32 speed
builtin_interfaces/Duration time_allowance
---
# Result
uint16 NONE=0
uint16 UNKNOWN=710
uint16 TIMEOUT=711
uint16 TF_ERROR=712
uint16 INVALID_INPUT=713
uint16 COLLISION_AHEAD=714
builtin_interfaces/Duration total_elapsed_time
uint16 error_code
string error_msg
---
# Feedback
float32 distance_traveled`,
    desc: "지정 거리만큼 후진하는 복구 액션 (behavior_server).",
    notes: ["이 설계는 후방 센서가 없어 거리를 0.1m 이하로 제한한다."],
    usedIn: ["/backup (bt_navigator → behavior_server)"],
  },
  {
    id: 'nav2_msgs/BehaviorTreeLog', kind: 'msg',
    def: `builtin_interfaces/Time timestamp
nav2_msgs/BehaviorTreeStatusChange[] event_log`,
    desc: "BT 노드 상태 변화 로그 묶음. Groot·RViz Nav2 패널이 /behavior_tree_log로 받는다.",
  },
  {
    id: 'nav2_msgs/BehaviorTreeStatusChange', kind: 'msg',
    def: `builtin_interfaces/Time timestamp
string node_name
uint16 uid
string previous_status
string current_status`,
    desc: "BT 노드 하나의 상태 변화 (IDLE → RUNNING → SUCCESS/FAILURE).",
  },
  {
    id: 'nav2_msgs/ClearCostmapAroundPose', kind: 'srv',
    def: `# Request
geometry_msgs/PoseStamped pose
float64 reset_distance
---
# Response
std_msgs/Empty response`,
    desc: "특정 위치 주변의 costmap 장애물을 지우는 서비스.",
  },
  {
    id: 'nav2_msgs/ClearCostmapAroundRobot', kind: 'srv',
    def: `# Request
float32 reset_distance
---
# Response
std_msgs/Empty response`,
    desc: "로봇 주변 일정 거리의 costmap 장애물을 지우는 서비스. 복구 BT에서 쓴다.",
  },
  {
    id: 'nav2_msgs/ClearCostmapExceptRegion', kind: 'srv',
    def: `# Request
float32 reset_distance
---
# Response
std_msgs/Empty response`,
    desc: "로봇 주변 영역을 빼고 나머지 costmap을 지우는 서비스.",
  },
  {
    id: 'nav2_msgs/ClearEntireCostmap', kind: 'srv',
    def: `# Request
std_msgs/Empty request
---
# Response
std_msgs/Empty response`,
    desc: "costmap 전체를 지우는 서비스. 유령 장애물이 남았을 때.",
    notes: ["점구름 기반 costmap(이 설계)은 시야 밖 장애물이 남기 쉬워 복구 BT에서 자주 쓴다."],
  },
  {
    id: 'nav2_msgs/CollisionDetectorState', kind: 'msg',
    def: `string[] polygons
bool[] detections`,
    desc: "collision_detector가 각 다각형에서 충돌을 감지했는지 알려 준다 (멈추지는 않고 감지만).",
  },
  {
    id: 'nav2_msgs/CollisionMonitorState', kind: 'msg',
    def: `uint8 DO_NOTHING=0
uint8 STOP=1
uint8 SLOWDOWN=2
uint8 APPROACH=3
uint8 LIMIT=4
uint8 action_type
string polygon_name`,
    desc: "collision_monitor의 현재 동작 (STOP/SLOWDOWN/APPROACH/LIMIT 등)과 걸린 다각형 이름.",
    usedIn: ["/collision_monitor_state (collision_monitor → coordinator, RViz)"],
  },
  {
    id: 'nav2_msgs/ComputeAndTrackRoute', kind: 'action',
    def: `# Goal
uint16 start_id
geometry_msgs/PoseStamped start
uint16 goal_id
geometry_msgs/PoseStamped goal
bool use_start
bool use_poses
---
# Result
uint16 NONE=0
uint16 UNKNOWN=400
uint16 TF_ERROR=401
uint16 NO_VALID_GRAPH=402
uint16 INDETERMINANT_NODES_ON_GRAPH=403
uint16 TIMEOUT=404
uint16 NO_VALID_ROUTE=405
uint16 OPERATION_FAILED=406
uint16 INVALID_EDGE_SCORER_USE=407
builtin_interfaces/Duration execution_duration
uint16 error_code 0
---
# Feedback
uint16 last_node_id
uint16 next_node_id
uint16 current_edge_id
nav2_msgs/Route route
nav_msgs/Path path
string[] operations_triggered
bool rerouted`,
    desc: "Route Server — 경로 그래프 위 경로를 계산하고 진행 상황을 추적하는 액션 (jazzy 브랜치 신규, 설치 버전에 따라 없을 수 있음).",
  },
  {
    id: 'nav2_msgs/ComputePathThroughPoses', kind: 'action',
    def: `# Goal
geometry_msgs/PoseStamped[] goals
geometry_msgs/PoseStamped start
string planner_id
bool use_start
---
# Result
uint16 NONE=0
uint16 UNKNOWN=300
uint16 INVALID_PLANNER=301
uint16 TF_ERROR=302
uint16 START_OUTSIDE_MAP=303
uint16 GOAL_OUTSIDE_MAP=304
uint16 START_OCCUPIED=305
uint16 GOAL_OCCUPIED=306
uint16 TIMEOUT=307
uint16 NO_VALID_PATH=308
uint16 NO_VIAPOINTS_GIVEN=309
nav_msgs/Path path
builtin_interfaces/Duration planning_time
uint16 error_code
string error_msg
---
# Feedback
# (없음)`,
    desc: "여러 경유 자세를 차례로 지나는 전역 경로 계산 액션 (planner_server).",
  },
  {
    id: 'nav2_msgs/ComputeRoute', kind: 'action',
    def: `# Goal
uint16 start_id
geometry_msgs/PoseStamped start
uint16 goal_id
geometry_msgs/PoseStamped goal
bool use_start
bool use_poses
---
# Result
uint16 NONE=0
uint16 UNKNOWN=400
uint16 TF_ERROR=401
uint16 NO_VALID_GRAPH=402
uint16 INDETERMINANT_NODES_ON_GRAPH=403
uint16 TIMEOUT=404
uint16 NO_VALID_ROUTE=405
uint16 INVALID_EDGE_SCORER_USE=407
builtin_interfaces/Duration planning_time
nav_msgs/Path path
nav2_msgs/Route route
uint16 error_code 0
---
# Feedback
# (없음)`,
    desc: "Route Server — 미리 정의한 경로 그래프(도로망) 위에서 경로를 계산하는 액션 (신규).",
  },
  {
    id: 'nav2_msgs/Costmap', kind: 'msg',
    def: `std_msgs/Header header
nav2_msgs/CostmapMetaData metadata
uint8[] data`,
    desc: "Nav2 costmap 원본 (uint8 비용 0~255). /…/costmap_raw 토픽.",
    notes: ["비용: 0 빈 곳, 253 내접 반경, 254 충돌, 255 모름. OccupancyGrid 버전(0~100)과 범위가 다르다."],
    usedIn: ["/local_costmap/costmap_raw (controller_server → behavior_server)"],
  },
  {
    id: 'nav2_msgs/CostmapFilterInfo', kind: 'msg',
    def: `std_msgs/Header header
uint8 type
string filter_mask_topic
float32 base
float32 multiplier`,
    desc: "costmap 필터(속도 제한 구역·진입 금지 구역 등)의 설정 정보 — 마스크 토픽과 변환 계수.",
  },
  {
    id: 'nav2_msgs/CostmapMetaData', kind: 'msg',
    def: `builtin_interfaces/Time map_load_time
builtin_interfaces/Time update_time
string layer
float32 resolution
uint32 size_x
uint32 size_y
geometry_msgs/Pose origin`,
    desc: "Costmap의 크기·해상도·원점·레이어 정보.",
  },
  {
    id: 'nav2_msgs/CostmapUpdate', kind: 'msg',
    def: `std_msgs/Header header
uint32 x
uint32 y
uint32 size_x
uint32 size_y
uint8[] data`,
    desc: "costmap 일부 영역만 갱신할 때의 부분 업데이트.",
  },
  {
    id: 'nav2_msgs/DockRobot', kind: 'action',
    def: `# Goal
bool use_dock_id True
string dock_id
geometry_msgs/PoseStamped dock_pose
string dock_type
float32 max_staging_time 1000.0
bool navigate_to_staging_pose True
---
# Result
uint16 NONE=0
uint16 DOCK_NOT_IN_DB=901
uint16 DOCK_NOT_VALID=902
uint16 FAILED_TO_STAGE=903
uint16 FAILED_TO_DETECT_DOCK=904
uint16 FAILED_TO_CONTROL=905
uint16 FAILED_TO_CHARGE=906
uint16 UNKNOWN=999
bool success True
uint16 error_code 0
uint16 num_retries 0
string error_msg
---
# Feedback
uint16 NONE=0
uint16 NAV_TO_STAGING_POSE=1
uint16 INITIAL_PERCEPTION=2
uint16 CONTROLLING=3
uint16 WAIT_FOR_CHARGE=4
uint16 RETRY=5
uint16 state
builtin_interfaces/Duration docking_time
uint16 num_retries 0`,
    desc: "충전 도크에 정확히 붙는 액션 (docking_server).",
  },
  {
    id: 'nav2_msgs/DriveOnHeading', kind: 'action',
    def: `# Goal
geometry_msgs/Point target
float32 speed
builtin_interfaces/Duration time_allowance
---
# Result
uint16 NONE=0
uint16 UNKNOWN=720
uint16 TIMEOUT=721
uint16 TF_ERROR=722
uint16 COLLISION_AHEAD=723
uint16 INVALID_INPUT=724
builtin_interfaces/Duration total_elapsed_time
uint16 error_code
string error_msg
---
# Feedback
float32 distance_traveled`,
    desc: "현재 방향으로 지정 거리만큼 직진하는 액션 (behavior_server).",
  },
  {
    id: 'nav2_msgs/DynamicEdges', kind: 'srv',
    def: `# Request
uint16[] closed_edges
uint16[] opened_edges
nav2_msgs/EdgeCost[] adjust_edges
---
# Response
bool success`,
    desc: "Route Server 그래프의 간선을 실행 중에 닫거나 비용을 바꾸는 서비스 (신규).",
  },
  {
    id: 'nav2_msgs/EdgeCost', kind: 'msg',
    def: `uint16 edgeid
float32 cost`,
    desc: "Route 그래프 간선 하나의 비용.",
  },
  {
    id: 'nav2_msgs/FollowGPSWaypoints', kind: 'action',
    def: `# Goal
uint32 number_of_loops
uint32 goal_index 0
geographic_msgs/GeoPose[] gps_poses
---
# Result
uint16 NONE=0
uint16 UNKNOWN=600
uint16 TASK_EXECUTOR_FAILED=601
nav2_msgs/MissedWaypoint[] missed_waypoints
int16 error_code
string error_msg
---
# Feedback
uint32 current_waypoint`,
    desc: "GPS 좌표 경유점을 차례로 방문하는 액션 (실외).",
  },
  {
    id: 'nav2_msgs/FollowObject', kind: 'action',
    def: `# Goal
string pose_topic
string tracked_frame
builtin_interfaces/Duration max_duration
---
# Result
uint16 NONE=0
uint16 TF_ERROR=901
uint16 FAILED_TO_DETECT_OBJECT=902
uint16 FAILED_TO_CONTROL=903
uint16 TIMEOUT=904
uint16 UNKNOWN=999
builtin_interfaces/Duration total_elapsed_time
uint16 error_code 0
uint16 num_retries 0
string error_msg
---
# Feedback
uint16 NONE=0
uint16 INITIAL_PERCEPTION=1
uint16 CONTROLLING=2
uint16 STOPPING=3
uint16 RETRY=4
uint16 state
builtin_interfaces/Duration following_time
uint16 num_retries 0`,
    desc: "움직이는 대상을 따라가는 액션 (신규, 설치 버전에 따라 없을 수 있음).",
  },
  {
    id: 'nav2_msgs/FollowWaypoints', kind: 'action',
    def: `# Goal
uint32 number_of_loops
uint32 goal_index 0
geometry_msgs/PoseStamped[] poses
---
# Result
uint16 NONE=0
uint16 UNKNOWN=600
uint16 TASK_EXECUTOR_FAILED=601
nav2_msgs/MissedWaypoint[] missed_waypoints
uint16 error_code
string error_msg
---
# Feedback
uint32 current_waypoint`,
    desc: "여러 경유점을 차례로 방문하는 액션 (waypoint_follower). 각 점에서 작업 플러그인 실행 가능.",
  },
  {
    id: 'nav2_msgs/GetCost', kind: 'srv',
    def: `# Request
bool use_footprint
float32 x
float32 y
float32 theta
---
# Response
float32 cost`,
    desc: "특정 위치의 costmap 비용을 묻는 서비스.",
  },
  {
    id: 'nav2_msgs/GetCostmap', kind: 'srv',
    def: `# Request
nav2_msgs/CostmapMetaData specs
---
# Response
nav2_msgs/Costmap map`,
    desc: "costmap 전체를 받아오는 서비스.",
  },
  {
    id: 'nav2_msgs/IsPathValid', kind: 'srv',
    def: `# Request
nav_msgs/Path path
---
# Response
bool is_valid
int32[] invalid_pose_indices`,
    desc: "주어진 경로가 지금 costmap 기준으로 여전히 막히지 않았는지 검사하는 서비스.",
  },
  {
    id: 'nav2_msgs/LoadMap', kind: 'srv',
    def: `# Request
string map_url
---
# Response
uint8 RESULT_SUCCESS=0
uint8 RESULT_MAP_DOES_NOT_EXIST=1
uint8 RESULT_INVALID_MAP_DATA=2
uint8 RESULT_INVALID_MAP_METADATA=3
uint8 RESULT_UNDEFINED_FAILURE=255
nav_msgs/OccupancyGrid map
uint8 result`,
    desc: "map_server에 다른 지도 파일을 불러오게 하는 서비스.",
  },
  {
    id: 'nav2_msgs/ManageLifecycleNodes', kind: 'srv',
    def: `# Request
uint8 STARTUP = 0
uint8 PAUSE = 1
uint8 RESUME = 2
uint8 RESET = 3
uint8 SHUTDOWN = 4
uint8 CONFIGURE = 5
uint8 CLEANUP = 6
uint8 command
---
# Response
bool success`,
    desc: "lifecycle_manager에 STARTUP/PAUSE/RESUME/RESET/SHUTDOWN을 요청하는 서비스.",
    usedIn: ["/lifecycle_manager_navigation/manage_nodes"],
  },
  {
    id: 'nav2_msgs/MissedWaypoint', kind: 'msg',
    def: `uint32 index
geometry_msgs/PoseStamped goal
uint16 error_code`,
    desc: "FollowWaypoints에서 도달하지 못한 경유점과 오류 코드.",
  },
  {
    id: 'nav2_msgs/NavigateThroughPoses', kind: 'action',
    def: `# Goal
geometry_msgs/PoseStamped[] poses
string behavior_tree
---
# Result
uint16 NONE=0
uint16 error_code
string error_msg
---
# Feedback
geometry_msgs/PoseStamped current_pose
builtin_interfaces/Duration navigation_time
builtin_interfaces/Duration estimated_time_remaining
int16 number_of_recoveries
float32 distance_remaining
int16 number_of_poses_remaining`,
    desc: "여러 자세를 차례로 지나 마지막 자세에 도착하는 상위 이동 액션 (bt_navigator).",
  },
  {
    id: 'nav2_msgs/Particle', kind: 'msg',
    def: `geometry_msgs/Pose pose
float64 weight`,
    desc: "AMCL 파티클 하나 (자세 + 가중치).",
  },
  {
    id: 'nav2_msgs/ParticleCloud', kind: 'msg',
    def: `std_msgs/Header header
nav2_msgs/Particle[] particles`,
    desc: "AMCL 파티클 전체. RViz로 위치 추정 수렴 정도를 본다 (이 설계는 rtabmap이라 쓰지 않음).",
  },
  {
    id: 'nav2_msgs/ReloadDockDatabase', kind: 'srv',
    def: `# Request
string filepath
---
# Response
bool success`,
    desc: "도크 위치 데이터베이스를 다시 읽는 서비스.",
  },
  {
    id: 'nav2_msgs/Route', kind: 'msg',
    def: `std_msgs/Header header
float32 route_cost
nav2_msgs/RouteNode[] nodes
nav2_msgs/RouteEdge[] edges`,
    desc: "Route Server가 계산한 경로 (노드·간선 열과 비용).",
  },
  {
    id: 'nav2_msgs/RouteEdge', kind: 'msg',
    def: `uint16 edgeid
geometry_msgs/Point start
geometry_msgs/Point end`,
    desc: "Route 그래프 간선 하나.",
  },
  {
    id: 'nav2_msgs/RouteNode', kind: 'msg',
    def: `uint16 nodeid
geometry_msgs/Point position`,
    desc: "Route 그래프 노드 하나.",
  },
  {
    id: 'nav2_msgs/SaveMap', kind: 'srv',
    def: `# Request
string map_topic
string map_url
string image_format
string map_mode
float32 free_thresh
float32 occupied_thresh
---
# Response
bool result`,
    desc: "map_saver에 현재 /map을 파일로 저장하게 하는 서비스. map_saver_cli가 쓴다.",
  },
  {
    id: 'nav2_msgs/SetInitialPose', kind: 'srv',
    def: `# Request
geometry_msgs/PoseWithCovarianceStamped pose
---
# Response
# (없음)`,
    desc: "AMCL 초기 위치를 서비스로 지정.",
  },
  {
    id: 'nav2_msgs/SetRouteGraph', kind: 'srv',
    def: `# Request
string graph_filepath
---
# Response
bool success`,
    desc: "Route Server의 경로 그래프 파일을 교체하는 서비스.",
  },
  {
    id: 'nav2_msgs/SmoothPath', kind: 'action',
    def: `# Goal
nav_msgs/Path path
string smoother_id
builtin_interfaces/Duration max_smoothing_duration
bool check_for_collisions
---
# Result
uint16 NONE=0
uint16 UNKNOWN=500
uint16 INVALID_SMOOTHER=501
uint16 TIMEOUT=502
uint16 SMOOTHED_PATH_IN_COLLISION=503
uint16 FAILED_TO_SMOOTH_PATH=504
uint16 INVALID_PATH=505
nav_msgs/Path path
builtin_interfaces/Duration smoothing_duration
bool was_completed
uint16 error_code
string error_msg
---
# Feedback
# (없음)`,
    desc: "전역 경로를 매끄럽게 다듬는 액션 (smoother_server).",
  },
  {
    id: 'nav2_msgs/Spin', kind: 'action',
    def: `# Goal
float32 target_yaw
builtin_interfaces/Duration time_allowance
---
# Result
uint16 NONE=0
uint16 UNKNOWN=700
uint16 TIMEOUT=701
uint16 TF_ERROR=702
uint16 COLLISION_AHEAD=703
builtin_interfaces/Duration total_elapsed_time
uint16 error_code
string error_msg
---
# Feedback
float32 angular_distance_traveled`,
    desc: "제자리에서 지정 각도만큼 도는 복구 액션 (behavior_server).",
    usedIn: ["/spin (bt_navigator → behavior_server)"],
  },
  {
    id: 'nav2_msgs/Toggle', kind: 'srv',
    def: `# Request
bool enable
---
# Response
bool success
string message`,
    desc: "기능을 켜고 끄는 범용 서비스 (예: collision_monitor 활성화).",
  },
  {
    id: 'nav2_msgs/UndockRobot', kind: 'action',
    def: `# Goal
string dock_type
float32 max_undocking_time 30.0
---
# Result
uint16 NONE=0
uint16 DOCK_NOT_VALID=902
uint16 FAILED_TO_CONTROL=905
uint16 UNKNOWN=999
bool success True
uint16 error_code 0
string error_msg
---
# Feedback
# (없음)`,
    desc: "충전 도크에서 빠져나오는 액션 (docking_server).",
  },
  {
    id: 'nav2_msgs/VoxelGrid', kind: 'msg',
    def: `std_msgs/Header header
uint32[] data
geometry_msgs/Point32 origin
geometry_msgs/Vector3 resolutions
uint32 size_x
uint32 size_y
uint32 size_z`,
    desc: "voxel layer의 3D 격자 상태. RViz에서 점구름 장애물이 어떻게 쌓였는지 확인할 때.",
  },
  {
    id: 'nav2_msgs/Wait', kind: 'action',
    def: `# Goal
builtin_interfaces/Duration time
---
# Result
builtin_interfaces/Duration total_elapsed_time
uint16 error_code
string error_msg
---
# Feedback
builtin_interfaces/Duration time_left`,
    desc: "지정 시간 동안 기다리는 복구 액션 (behavior_server).",
    usedIn: ["/wait (bt_navigator → behavior_server)"],
  },

  // ───────── action_msgs
  {
    id: 'action_msgs/GoalInfo', kind: 'msg',
    def: `unique_identifier_msgs/UUID goal_id   # 16바이트
builtin_interfaces/Time stamp          # goal 수락 시각`,
    desc: '액션 goal 하나의 식별자.',
  },
  {
    id: 'action_msgs/GoalStatus', kind: 'msg',
    def: `int8 STATUS_UNKNOWN = 0
int8 STATUS_ACCEPTED = 1
int8 STATUS_EXECUTING = 2
int8 STATUS_CANCELING = 3
int8 STATUS_SUCCEEDED = 4
int8 STATUS_CANCELED = 5
int8 STATUS_ABORTED = 6
action_msgs/GoalInfo goal_info
int8 status`,
    desc: '액션 goal의 상태. 모든 액션 서버가 <액션>/_action/status 토픽으로 발행한다.',
  },
  {
    id: 'action_msgs/CancelGoal', kind: 'srv',
    def: `# Request
action_msgs/GoalInfo goal_info   # goal_id 0 + stamp 0 = 모든 goal 취소
---
# Response
int8 ERROR_NONE = 0
int8 ERROR_REJECTED = 1
int8 ERROR_UNKNOWN_GOAL_ID = 2
int8 ERROR_GOAL_TERMINATED = 3
int8 return_code
action_msgs/GoalInfo[] goals_canceling`,
    desc: '액션 취소. 모든 액션 서버에 <액션>/_action/cancel_goal 서비스로 자동으로 붙는다.',
    notes: ['goal을 보낸 클라이언트가 아니어도 취소할 수 있다 — 안전 감시 노드가 이걸 쓴다.'],
    usedIn: ['/arm_controller/follow_joint_trajectory/_action/cancel_goal (arm_safety_monitor → arm_controller)'],
  },
  {
    id: 'action_msgs/GoalStatusArray', kind: 'msg',
    def: `action_msgs/GoalStatus[] status_list`,
    desc: "액션 서버가 가진 모든 goal의 상태 목록. 모든 액션에 <액션>/_action/status 토픽으로 자동 발행된다.",
    notes: ["ros2 action list -t, rqt의 액션 모니터링이 이걸 본다."],
  },

  // ───────── lifecycle_msgs
  {
    id: 'lifecycle_msgs/ChangeState', kind: 'srv',
    def: `# Request
lifecycle_msgs/Transition transition   # id 또는 label
---
# Response
bool success`,
    desc: 'lifecycle 노드의 상태 전이 요청 (configure, activate ...).',
    usedIn: ['*/change_state (lifecycle_manager_navigation → Nav2 서버들)'],
    cli: `ros2 lifecycle set /controller_server activate
ros2 lifecycle get /controller_server`,
  },
  {
    id: 'lifecycle_msgs/Transition', kind: 'msg',
    def: `uint8 TRANSITION_CREATE = 0
uint8 TRANSITION_CONFIGURE = 1
uint8 TRANSITION_CLEANUP = 2
uint8 TRANSITION_ACTIVATE = 3
uint8 TRANSITION_DEACTIVATE = 4
uint8 TRANSITION_UNCONFIGURED_SHUTDOWN = 5
uint8 TRANSITION_INACTIVE_SHUTDOWN = 6
uint8 TRANSITION_ACTIVE_SHUTDOWN = 7
uint8 TRANSITION_DESTROY = 8
# (내부 전이 상수 생략)
uint8 id
string label`,
    desc: '전이 종류.',
  },
  {
    id: 'lifecycle_msgs/State', kind: 'msg',
    def: `uint8 PRIMARY_STATE_UNKNOWN = 0
uint8 PRIMARY_STATE_UNCONFIGURED = 1
uint8 PRIMARY_STATE_INACTIVE = 2
uint8 PRIMARY_STATE_ACTIVE = 3
uint8 PRIMARY_STATE_FINALIZED = 4
# (전이 중 상태 상수 생략)
uint8 id
string label`,
    desc: 'lifecycle 노드의 현재 상태.',
  },
  {
    id: 'lifecycle_msgs/GetAvailableStates', kind: 'srv',
    def: `# Request
# (없음)
---
# Response
lifecycle_msgs/State[] available_states`,
    desc: "lifecycle 노드가 가질 수 있는 상태 목록 조회.",
  },
  {
    id: 'lifecycle_msgs/GetAvailableTransitions', kind: 'srv',
    def: `# Request
# (없음)
---
# Response
lifecycle_msgs/TransitionDescription[] available_transitions`,
    desc: "현재 상태에서 가능한 전이 목록 조회.",
  },
  {
    id: 'lifecycle_msgs/GetState', kind: 'srv',
    def: `# Request
# (없음)
---
# Response
lifecycle_msgs/State current_state`,
    desc: "lifecycle 노드의 현재 상태 조회. ros2 lifecycle get이 쓴다.",
    usedIn: ["Nav2 서버들이 active인지 확인할 때"],
  },
  {
    id: 'lifecycle_msgs/TransitionDescription', kind: 'msg',
    def: `lifecycle_msgs/Transition transition
lifecycle_msgs/State start_state
lifecycle_msgs/State goal_state`,
    desc: "전이 하나의 설명 (전이 + 출발·도착 상태).",
  },
  {
    id: 'lifecycle_msgs/TransitionEvent', kind: 'msg',
    def: `uint64 timestamp
lifecycle_msgs/Transition transition
lifecycle_msgs/State start_state
lifecycle_msgs/State goal_state`,
    desc: "상태 전이가 일어날 때마다 <노드>/transition_event 토픽으로 발행되는 이벤트.",
  },

  // ───────── rcl_interfaces
  {
    id: 'rcl_interfaces/SetParameters', kind: 'srv',
    def: `# Request
rcl_interfaces/Parameter[] parameters
---
# Response
rcl_interfaces/SetParametersResult[] results   # 파라미터마다 성공 여부`,
    desc: '실행 중인 노드의 파라미터 변경. 모든 노드에 <노드>/set_parameters로 자동으로 붙는다.',
    notes: ['노드가 파라미터 콜백에서 거절하면 successful=false와 이유가 온다.', '바뀐 값은 메모리에만 — yaml 파일은 그대로라 재시작하면 원래대로.'],
    usedIn: ['/controller_server/set_parameters (rl_nav_tuner)', '/local_costmap/local_costmap/set_parameters (coordinator: footprint)'],
    cli: `ros2 param set /controller_server FollowPath.max_vel_theta 1.0
ros2 param get /controller_server FollowPath.max_vel_x`,
  },
  {
    id: 'rcl_interfaces/Parameter', kind: 'msg',
    def: `string name
rcl_interfaces/ParameterValue value`,
    desc: '파라미터 하나.',
  },
  {
    id: 'rcl_interfaces/ParameterValue', kind: 'msg',
    def: `uint8 type               # ParameterType 상수 (BOOL=1, INTEGER=2, DOUBLE=3, STRING=4, ...)
bool bool_value
int64 integer_value
float64 double_value
string string_value
byte[] byte_array_value
bool[] bool_array_value
int64[] integer_array_value
float64[] double_array_value
string[] string_array_value`,
    desc: '파라미터 값. type에 맞는 필드 하나만 의미가 있다.',
  },
  {
    id: 'rcl_interfaces/SetParametersResult', kind: 'msg',
    def: `bool successful
string reason   # 실패 이유`,
    desc: '파라미터 설정 결과.',
  },
  {
    id: 'rcl_interfaces/DescribeParameters', kind: 'srv',
    def: `# Request
string[] names
---
# Response
rcl_interfaces/ParameterDescriptor[] descriptors`,
    desc: "파라미터의 설명·타입·범위·읽기전용 여부 조회.",
  },
  {
    id: 'rcl_interfaces/FloatingPointRange', kind: 'msg',
    def: `float64 from_value
float64 to_value
float64 step`,
    desc: "실수 파라미터의 허용 범위 (from, to, step).",
  },
  {
    id: 'rcl_interfaces/GetLoggerLevels', kind: 'srv',
    def: `# Request
string[] names
---
# Response
rcl_interfaces/LoggerLevel[] levels`,
    desc: "노드 로거의 현재 로그 레벨 조회.",
  },
  {
    id: 'rcl_interfaces/GetParameterTypes', kind: 'srv',
    def: `# Request
string[] names
---
# Response
uint8[] types`,
    desc: "파라미터들의 타입 조회.",
  },
  {
    id: 'rcl_interfaces/GetParameters', kind: 'srv',
    def: `# Request
string[] names
---
# Response
rcl_interfaces/ParameterValue[] values`,
    desc: "파라미터 값 조회. ros2 param get이 쓴다.",
  },
  {
    id: 'rcl_interfaces/IntegerRange', kind: 'msg',
    def: `int64 from_value
int64 to_value
uint64 step`,
    desc: "정수 파라미터의 허용 범위.",
  },
  {
    id: 'rcl_interfaces/ListParameters', kind: 'srv',
    def: `# Request
uint64 DEPTH_RECURSIVE=0
string[] prefixes
uint64 depth
---
# Response
rcl_interfaces/ListParametersResult result`,
    desc: "노드의 파라미터 이름 목록. ros2 param list가 쓴다.",
  },
  {
    id: 'rcl_interfaces/ListParametersResult', kind: 'msg',
    def: `string[] names
string[] prefixes`,
    desc: "ListParameters 결과 (이름·접두사 목록).",
  },
  {
    id: 'rcl_interfaces/Log', kind: 'msg',
    def: `uint8 DEBUG=10
uint8 INFO=20
uint8 WARN=30
uint8 ERROR=40
uint8 FATAL=50
builtin_interfaces/Time stamp
uint8 level
string name
string msg
string file
string function
uint32 line`,
    desc: "모든 노드의 로그가 /rosout 토픽으로 모이는 메시지 (레벨·노드 이름·내용·파일·줄).",
    notes: ["rqt_console로 전체 로그를 본다."],
  },
  {
    id: 'rcl_interfaces/LoggerLevel', kind: 'msg',
    def: `uint8 LOG_LEVEL_UNKNOWN = 0
uint8 LOG_LEVEL_DEBUG = 10
uint8 LOG_LEVEL_INFO = 20
uint8 LOG_LEVEL_WARN = 30
uint8 LOG_LEVEL_ERROR = 40
uint8 LOG_LEVEL_FATAL = 50
string name
uint32 level`,
    desc: "로거 이름과 레벨.",
  },
  {
    id: 'rcl_interfaces/ParameterDescriptor', kind: 'msg',
    def: `string name
uint8 type
string description
string additional_constraints
bool read_only false
bool dynamic_typing false
rcl_interfaces/FloatingPointRange[<=1] floating_point_range
rcl_interfaces/IntegerRange[<=1] integer_range`,
    desc: "파라미터 설명 — 타입, 설명, 범위, 읽기 전용 여부, 동적 타입 허용.",
  },
  {
    id: 'rcl_interfaces/ParameterEvent', kind: 'msg',
    def: `builtin_interfaces/Time stamp
string node
rcl_interfaces/Parameter[] new_parameters
rcl_interfaces/Parameter[] changed_parameters
rcl_interfaces/Parameter[] deleted_parameters`,
    desc: "파라미터가 추가·변경·삭제될 때 /parameter_events로 발행되는 이벤트.",
    notes: ["DWB KinematicsHandler처럼 다른 노드의 파라미터 변화를 감지하는 데 쓴다."],
  },
  {
    id: 'rcl_interfaces/ParameterEventDescriptors', kind: 'msg',
    def: `rcl_interfaces/ParameterDescriptor[] new_parameters
rcl_interfaces/ParameterDescriptor[] changed_parameters
rcl_interfaces/ParameterDescriptor[] deleted_parameters`,
    desc: "파라미터 이벤트의 설명자 묶음.",
  },
  {
    id: 'rcl_interfaces/ParameterType', kind: 'msg',
    def: `uint8 PARAMETER_NOT_SET=0
uint8 PARAMETER_BOOL=1
uint8 PARAMETER_INTEGER=2
uint8 PARAMETER_DOUBLE=3
uint8 PARAMETER_STRING=4
uint8 PARAMETER_BYTE_ARRAY=5
uint8 PARAMETER_BOOL_ARRAY=6
uint8 PARAMETER_INTEGER_ARRAY=7
uint8 PARAMETER_DOUBLE_ARRAY=8
uint8 PARAMETER_STRING_ARRAY=9`,
    desc: "ParameterValue.type에 쓰는 상수 (BOOL, INTEGER, DOUBLE, STRING ...).",
  },
  {
    id: 'rcl_interfaces/SetLoggerLevels', kind: 'srv',
    def: `# Request
rcl_interfaces/LoggerLevel[] levels
---
# Response
rcl_interfaces/SetLoggerLevelsResult[] results`,
    desc: "실행 중에 로그 레벨을 바꾸는 서비스 (Jazzy). 노드를 다시 띄우지 않고 DEBUG 로그를 켤 때.",
  },
  {
    id: 'rcl_interfaces/SetLoggerLevelsResult', kind: 'msg',
    def: `bool successful
string reason`,
    desc: "SetLoggerLevels 결과.",
  },
  {
    id: 'rcl_interfaces/SetParametersAtomically', kind: 'srv',
    def: `# Request
rcl_interfaces/Parameter[] parameters
---
# Response
rcl_interfaces/SetParametersResult result`,
    desc: "여러 파라미터를 한꺼번에(전부 성공 또는 전부 실패) 바꾸는 서비스.",
  },

  // ───────── std_srvs
  {
    id: 'std_srvs/Empty', kind: 'srv',
    def: `# Request (없음)
---
# Response (없음)`,
    desc: '인자·결과 없이 "해라"만 보내는 서비스.',
    usedIn: ['/clear_octomap (coordinator → move_group)'],
    cli: `ros2 service call /clear_octomap std_srvs/srv/Empty`,
  },
  {
    id: 'std_srvs/Trigger', kind: 'srv',
    def: `# Request (없음)
---
bool success
string message`,
    desc: '실행 + 성공 여부·메시지를 돌려받는 서비스.',
    cli: `ros2 service call /reset std_srvs/srv/Trigger`,
  },
  {
    id: 'std_srvs/SetBool', kind: 'srv',
    def: `bool data
---
bool success
string message`,
    desc: '켜기/끄기 요청.',
    cli: `ros2 service call /enable_motors std_srvs/srv/SetBool "{data: true}"`,
  },

  // ───────── visualization_msgs
  {
    id: 'visualization_msgs/Marker', kind: 'msg',
    def: `int32 ARROW=0
int32 CUBE=1
int32 SPHERE=2
int32 CYLINDER=3
int32 LINE_STRIP=4
int32 LINE_LIST=5
int32 CUBE_LIST=6
int32 SPHERE_LIST=7
int32 POINTS=8
int32 TEXT_VIEW_FACING=9
int32 MESH_RESOURCE=10
int32 TRIANGLE_LIST=11
int32 ARROW_STRIP=12
int32 ADD=0
int32 MODIFY=0
int32 DELETE=2
int32 DELETEALL=3
std_msgs/Header header
string ns                          # 묶음 이름 (ns + id가 마커 식별자)
int32 id
int32 type
int32 action
geometry_msgs/Pose pose
geometry_msgs/Vector3 scale        # m
std_msgs/ColorRGBA color           # a를 꼭 채울 것
builtin_interfaces/Duration lifetime   # 0 = 영원히
bool frame_locked
geometry_msgs/Point[] points       # LINE/POINTS류
std_msgs/ColorRGBA[] colors
string texture_resource            # 텍스처 이미지 위치
sensor_msgs/CompressedImage texture
visualization_msgs/UVCoordinate[] uv_coordinates
string text                        # TEXT_VIEW_FACING
string mesh_resource               # package://...
visualization_msgs/MeshFile mesh_file   # 파일 대신 메시 데이터를 직접 담을 때
bool mesh_use_embedded_materials`,
    desc: 'RViz에 도형·글자를 그린다. 인식 결과·파지 후보·디버그 시각화의 기본 도구.',
    notes: ['scale이 0이거나 color.a가 0이면 안 보인다.', '여러 개는 MarkerArray로 한 번에 보낸다.'],
    usedIn: ['(권장) perception의 /tracked_objects를 MarkerArray로 시각화'],
  },
  {
    id: 'visualization_msgs/MarkerArray', kind: 'msg',
    def: `visualization_msgs/Marker[] markers`,
    desc: '마커 여러 개.',
  },
  {
    id: 'visualization_msgs/GetInteractiveMarkers', kind: 'srv',
    def: `# Request
# (없음)
---
# Response
uint64 sequence_number
visualization_msgs/InteractiveMarker[] markers`,
    desc: "RViz가 interactive marker 서버에서 현재 마커들을 받아오는 서비스.",
  },
  {
    id: 'visualization_msgs/ImageMarker', kind: 'msg',
    def: `int32 CIRCLE=0
int32 LINE_STRIP=1
int32 LINE_LIST=2
int32 POLYGON=3
int32 POINTS=4
int32 ADD=0
int32 REMOVE=1
std_msgs/Header header
string ns
int32 id
int32 type
int32 action
geometry_msgs/Point position
float32 scale
std_msgs/ColorRGBA outline_color
uint8 filled
std_msgs/ColorRGBA fill_color
builtin_interfaces/Duration lifetime
geometry_msgs/Point[] points
std_msgs/ColorRGBA[] outline_colors`,
    desc: "영상 위에 그리는 2D 마커 (원·선·점).",
  },
  {
    id: 'visualization_msgs/InteractiveMarker', kind: 'msg',
    def: `std_msgs/Header header
geometry_msgs/Pose pose
string name
string description
float32 scale
visualization_msgs/MenuEntry[] menu_entries
visualization_msgs/InteractiveMarkerControl[] controls`,
    desc: "RViz에서 마우스로 끌어 움직일 수 있는 마커. MoveIt의 팔 목표 지정 핸들이 이것.",
  },
  {
    id: 'visualization_msgs/InteractiveMarkerControl', kind: 'msg',
    def: `string name
geometry_msgs/Quaternion orientation
uint8 INHERIT = 0
uint8 FIXED = 1
uint8 VIEW_FACING = 2
uint8 orientation_mode
uint8 NONE = 0
uint8 MENU = 1
uint8 BUTTON = 2
uint8 MOVE_AXIS = 3
uint8 MOVE_PLANE = 4
uint8 ROTATE_AXIS = 5
uint8 MOVE_ROTATE = 6
uint8 MOVE_3D = 7
uint8 ROTATE_3D = 8
uint8 MOVE_ROTATE_3D = 9
uint8 interaction_mode
bool always_visible
visualization_msgs/Marker[] markers
bool independent_marker_orientation
string description`,
    desc: "interactive marker의 조작 방식 (축 이동·회전·메뉴 등).",
  },
  {
    id: 'visualization_msgs/InteractiveMarkerFeedback', kind: 'msg',
    def: `std_msgs/Header header
string client_id
string marker_name
string control_name
uint8 KEEP_ALIVE = 0
uint8 POSE_UPDATE = 1
uint8 MENU_SELECT = 2
uint8 BUTTON_CLICK = 3
uint8 MOUSE_DOWN = 4
uint8 MOUSE_UP = 5
uint8 event_type
geometry_msgs/Pose pose
uint32 menu_entry_id
geometry_msgs/Point mouse_point
bool mouse_point_valid`,
    desc: "사용자가 interactive marker를 움직였을 때 서버로 돌아오는 피드백.",
  },
  {
    id: 'visualization_msgs/InteractiveMarkerInit', kind: 'msg',
    def: `string server_id
uint64 seq_num
visualization_msgs/InteractiveMarker[] markers`,
    desc: "interactive marker 서버의 초기 전체 상태.",
  },
  {
    id: 'visualization_msgs/InteractiveMarkerPose', kind: 'msg',
    def: `std_msgs/Header header
geometry_msgs/Pose pose
string name`,
    desc: "interactive marker 하나의 자세 갱신.",
  },
  {
    id: 'visualization_msgs/InteractiveMarkerUpdate', kind: 'msg',
    def: `string server_id
uint64 seq_num
uint8 KEEP_ALIVE = 0
uint8 UPDATE = 1
uint8 type
visualization_msgs/InteractiveMarker[] markers
visualization_msgs/InteractiveMarkerPose[] poses
string[] erases`,
    desc: "interactive marker 추가·자세 변경·삭제 묶음.",
  },
  {
    id: 'visualization_msgs/MenuEntry', kind: 'msg',
    def: `uint32 id
uint32 parent_id
string title
string command
uint8 FEEDBACK=0
uint8 ROSRUN=1
uint8 ROSLAUNCH=2
uint8 command_type`,
    desc: "interactive marker의 오른쪽 클릭 메뉴 항목.",
  },
  {
    id: 'visualization_msgs/MeshFile', kind: 'msg',
    def: `string filename
uint8[] data`,
    desc: "Marker에 직접 넣는 메시 파일 데이터 (파일 이름 + 바이트).",
  },
  {
    id: 'visualization_msgs/UVCoordinate', kind: 'msg',
    def: `float32 u
float32 v`,
    desc: "메시 텍스처 좌표 (u, v).",
  },

  // ───────── moveit_msgs
  {
    id: 'moveit_msgs/GetPositionIK', kind: 'srv',
    def: `# Request
moveit_msgs/PositionIKRequest ik_request   # group_name, pose_stamped, robot_state, timeout, avoid_collisions ...
---
# Response
moveit_msgs/RobotState solution            # 찾은 관절각
moveit_msgs/MoveItErrorCodes error_code    # val 1 = SUCCESS, -31 = NO_IK_SOLUTION ...`,
    desc: '이 자세에 손이 닿는 관절각이 있는가 (역기구학). move_group이 /compute_ik로 제공.',
    notes: ['4축 OM-X는 임의 6D 자세가 안 되므로 위치 위주 IK(pick_ik)와 함께 쓴다.'],
    usedIn: ['/compute_ik (grasp_scorer → move_group, 파지 후보 걸러내기)'],
  },
  {
    id: 'moveit_msgs/ApplyPlanningScene', kind: 'srv',
    def: `# Request
moveit_msgs/PlanningScene scene   # is_diff: true로 바뀐 부분만 (collision_objects 등)
---
# Response
bool success`,
    desc: 'MoveIt 충돌 장면에 물체를 넣고 빼기.',
    usedIn: ['/apply_planning_scene (coordinator → move_group: 테이블·컵 등록)'],
  },
  {
    id: 'composition_interfaces/ListNodes', kind: 'srv',
    def: `# Request
# (없음)
---
# Response
string[] full_node_names
uint64[] unique_ids`,
    desc: "컴포넌트 컨테이너에 올라간 노드 목록 조회. ros2 component list가 쓴다.",
  },
  {
    id: 'composition_interfaces/LoadNode', kind: 'srv',
    def: `# Request
string package_name
string plugin_name
string node_name
string node_namespace
uint8 log_level
string[] remap_rules
rcl_interfaces/Parameter[] parameters
rcl_interfaces/Parameter[] extra_arguments
---
# Response
bool success
string error_message
string full_node_name
uint64 unique_id`,
    desc: "실행 중인 컴포넌트 컨테이너에 노드(플러그인)를 올린다. ros2 component load가 쓴다.",
    notes: ["같은 프로세스에 올리면 intra-process 통신으로 이미지·점구름 복사를 줄일 수 있다."],
  },
  {
    id: 'composition_interfaces/UnloadNode', kind: 'srv',
    def: `# Request
uint64 unique_id
---
# Response
bool success
string error_message`,
    desc: "컴포넌트 컨테이너에서 노드를 내린다.",
  },
  {
    id: 'diagnostic_msgs/AddDiagnostics', kind: 'srv',
    def: `# Request
string load_namespace
---
# Response
bool success
string message`,
    desc: "diagnostic_aggregator에 분석기를 동적으로 추가하는 서비스.",
  },
  {
    id: 'diagnostic_msgs/DiagnosticArray', kind: 'msg',
    def: `std_msgs/Header header
diagnostic_msgs/DiagnosticStatus[] status`,
    desc: "여러 장치의 진단 상태 묶음. /diagnostics 토픽 타입 — 모터 온도·배터리·통신 상태를 한곳에서 본다.",
    notes: ["rqt_robot_monitor로 보기 좋다. 하드웨어 드라이버 대부분이 발행한다."],
  },
  {
    id: 'diagnostic_msgs/DiagnosticStatus', kind: 'msg',
    def: `byte OK=0
byte WARN=1
byte ERROR=2
byte STALE=3
byte level
string name
string message
string hardware_id
diagnostic_msgs/KeyValue[] values`,
    desc: "장치 하나의 진단 (OK/WARN/ERROR/STALE + 메시지 + key-value 값).",
  },
  {
    id: 'diagnostic_msgs/KeyValue', kind: 'msg',
    def: `string key
string value`,
    desc: "문자열 key-value 한 쌍.",
  },
  {
    id: 'diagnostic_msgs/SelfTest', kind: 'srv',
    def: `# Request
# (없음)
---
# Response
string id
byte passed
diagnostic_msgs/DiagnosticStatus[] status`,
    desc: "장치 자가 진단을 실행하고 결과를 받는 서비스.",
  },
  {
    id: 'rosgraph_msgs/Action', kind: 'msg',
    def: `string name
rosgraph_msgs/Service send_goal
rosgraph_msgs/Service get_result
rosgraph_msgs/Service cancel_goal
rosgraph_msgs/Topic feedback
rosgraph_msgs/Topic status`,
    desc: "ROS 그래프 정보: 액션 하나 (신규 그래프 내성 메시지).",
  },
  {
    id: 'rosgraph_msgs/Clock', kind: 'msg',
    def: `builtin_interfaces/Time clock`,
    desc: "시뮬레이터 시각. use_sim_time:=true인 노드는 /clock을 따라 시간을 쓴다.",
    notes: ["Isaac Sim·Gazebo가 /clock을 발행한다. 실기에서는 쓰지 않는다."],
  },
  {
    id: 'rosgraph_msgs/Graph', kind: 'msg',
    def: `rosgraph_msgs/Node[] nodes`,
    desc: "ROS 그래프 전체 (노드·토픽·서비스·액션) 스냅샷 (신규).",
  },
  {
    id: 'rosgraph_msgs/InterfaceType', kind: 'msg',
    def: `string name
rosgraph_msgs/TypeHash hash`,
    desc: "ROS 그래프 정보: 인터페이스 타입 이름과 해시.",
  },
  {
    id: 'rosgraph_msgs/Node', kind: 'msg',
    def: `string name
rcl_interfaces/ParameterDescriptor[] parameters
rcl_interfaces/ParameterValue[] parameter_values
rosgraph_msgs/Topic[] publishers
rosgraph_msgs/Topic[] subscriptions
rosgraph_msgs/Service[] service_clients
rosgraph_msgs/Service[] service_servers
rosgraph_msgs/Action[] action_clients
rosgraph_msgs/Action[] action_servers`,
    desc: "ROS 그래프 정보: 노드 하나와 그 발행·구독·서비스.",
  },
  {
    id: 'rosgraph_msgs/QoSProfile', kind: 'msg',
    def: `uint32 depth
builtin_interfaces/Duration deadline
builtin_interfaces/Duration lifespan
uint8 HISTORY_SYSTEM_DEFAULT=0
uint8 HISTORY_KEEP_LAST=1
uint8 HISTORY_KEEP_ALL=2
uint8 HISTORY_UNKNOWN=3
uint8 history
uint8 RELIABILITY_SYSTEM_DEFAULT=0
uint8 RELIABILITY_RELIABLE=1
uint8 RELIABILITY_BEST_EFFORT=2
uint8 RELIABILITY_UNKNOWN=3
uint8 RELIABILITY_BEST_AVAILABLE=4
uint8 reliability
uint8 DURABILITY_SYSTEM_DEFAULT=0
uint8 DURABILITY_TRANSIENT_LOCAL=1
uint8 DURABILITY_VOLATILE=2
uint8 DURABILITY_UNKNOWN=3
uint8 DURABILITY_BEST_AVAILABLE=4
uint8 durability
uint8 LIVELINESS_SYSTEM_DEFAULT=0
uint8 LIVELINESS_AUTOMATIC=1
uint8 LIVELINESS_MANUAL_BY_TOPIC=3
uint8 LIVELINESS_UNKNOWN=4
uint8 LIVELINESS_BEST_AVAILABLE=5
uint8 liveliness
builtin_interfaces/Duration liveliness_lease_duration`,
    desc: "ROS 그래프 정보: 엔드포인트의 QoS 설정.",
  },
  {
    id: 'rosgraph_msgs/Service', kind: 'msg',
    def: `string name
rosgraph_msgs/InterfaceType request_type
rosgraph_msgs/QoSProfile request_qos
rosgraph_msgs/InterfaceType response_type
rosgraph_msgs/QoSProfile response_qos`,
    desc: "ROS 그래프 정보: 서비스 하나.",
  },
  {
    id: 'rosgraph_msgs/Topic', kind: 'msg',
    def: `string name
rosgraph_msgs/InterfaceType type
rosgraph_msgs/QoSProfile qos`,
    desc: "ROS 그래프 정보: 토픽 하나.",
  },
  {
    id: 'rosgraph_msgs/TypeHash', kind: 'msg',
    def: `uint8 version 1
uint8[32] value`,
    desc: "인터페이스 타입 해시 (타입 정의가 같은지 비교용).",
  },
  {
    id: 'shape_msgs/Mesh', kind: 'msg',
    def: `shape_msgs/MeshTriangle[] triangles
geometry_msgs/Point[] vertices`,
    desc: "삼각형 메시 (꼭짓점 + 삼각형). MoveIt 충돌 물체로 컵 같은 복잡한 모양을 넣을 때.",
  },
  {
    id: 'shape_msgs/MeshTriangle', kind: 'msg',
    def: `uint32[3] vertex_indices`,
    desc: "메시 삼각형 하나 (꼭짓점 인덱스 3개).",
  },
  {
    id: 'shape_msgs/Plane', kind: 'msg',
    def: `float64[4] coef`,
    desc: "평면 ax + by + cz + d = 0.",
  },
  {
    id: 'shape_msgs/SolidPrimitive', kind: 'msg',
    def: `uint8 BOX=1
uint8 SPHERE=2
uint8 CYLINDER=3
uint8 CONE=4
uint8 PRISM=5
uint8 type
float64[<=3] dimensions
uint8 BOX_X=0
uint8 BOX_Y=1
uint8 BOX_Z=2
uint8 SPHERE_RADIUS=0
uint8 CYLINDER_HEIGHT=0
uint8 CYLINDER_RADIUS=1
uint8 CONE_HEIGHT=0
uint8 CONE_RADIUS=1
uint8 PRISM_HEIGHT=0
geometry_msgs/Polygon polygon`,
    desc: "기본 도형 (BOX, SPHERE, CYLINDER, CONE, PRISM)과 치수. MoveIt CollisionObject의 모양.",
    notes: ["이 설계에서 테이블은 BOX, 컵은 CYLINDER로 planning scene에 등록하면 된다."],
    usedIn: ["coordinator → /apply_planning_scene의 CollisionObject 모양"],
  },
  {
    id: 'statistics_msgs/MetricsMessage', kind: 'msg',
    def: `string measurement_source_name
string metrics_source
string unit
builtin_interfaces/Time window_start
builtin_interfaces/Time window_stop
statistics_msgs/StatisticDataPoint[] statistics`,
    desc: "토픽 통계 (메시지 주기·지연의 평균·최대·최소). 구독 옵션으로 토픽 통계를 켜면 발행된다.",
  },
  {
    id: 'statistics_msgs/StatisticDataPoint', kind: 'msg',
    def: `uint8 data_type
float64 data`,
    desc: "통계 값 하나 (종류 + 값).",
  },
  {
    id: 'statistics_msgs/StatisticDataType', kind: 'msg',
    def: `uint8 STATISTICS_DATA_TYPE_UNINITIALIZED = 0
uint8 STATISTICS_DATA_TYPE_AVERAGE = 1
uint8 STATISTICS_DATA_TYPE_MINIMUM = 2
uint8 STATISTICS_DATA_TYPE_MAXIMUM = 3
uint8 STATISTICS_DATA_TYPE_STDDEV = 4
uint8 STATISTICS_DATA_TYPE_SAMPLE_COUNT = 5`,
    desc: "통계 종류 상수 (AVERAGE, MINIMUM, MAXIMUM, STDDEV, SAMPLE_COUNT).",
  },
  {
    id: 'stereo_msgs/DisparityImage', kind: 'msg',
    def: `std_msgs/Header header
sensor_msgs/Image image
float32 f
float32 t
sensor_msgs/RegionOfInterest valid_window
float32 min_disparity
float32 max_disparity
float32 delta_d`,
    desc: "스테레오 카메라 시차(disparity) 영상 + 초점거리·기준선. 시차 → 깊이 = f·T / d.",
  },
  {
    id: 'unique_identifier_msgs/UUID', kind: 'msg',
    def: `uint8[16] uuid   # 128비트 UUID`,
    desc: '128비트 고유 식별자. 모든 액션 goal의 goal_id가 이 타입이라, 같은 액션 서버에 들어온 goal들을 구분한다.',
    usedIn: ['action_msgs/GoalInfo.goal_id — arm_safety_monitor의 CancelGoal에서 0으로 채우면 "전체 취소"'],
  },
];

export const MSG_IDS = new Set(MSG_DOCS.map(d => d.id));

/** 'geometry_msgs/msg/Twist', 'geometry_msgs/action/X', 'geometry_msgs/Twist' → 사전 id (없으면 undefined) */
export const toMsgId = (raw: string): string | undefined => {
  const m = raw.trim().match(/^([a-z0-9_]+)\/(?:(?:msg|srv|action)\/)?([A-Z]\w*)/);
  if (!m) return undefined;
  const id = `${m[1]}/${m[2]}`;
  return MSG_IDS.has(id) ? id : undefined;
};
