// 현업 실습(SLAM) 스크립트 원문 + 줄별 설명.
// 원본: kant/daily/20261014-practice-cartographer/*.sh, ~/waffle-lyrical-slam/src/waffle_slam_course (launch · lua)
// note는 신뢰된 HTML(<code>·<b>만 사용), code는 화면에서 이스케이프한다.

export type ScriptBlock = { code: string; note: string };
/** ros2 launch가 실제로 띄우는 것 — 스크립트만 보면 안 보이는 부분 */
export type LaunchPart = { what: string; detail: string };
export type Script = {
  file: string;
  summary: string;
  blocks: ScriptBlock[];
  launch?: { title: string; file: string; parts: LaunchPart[]; table?: { head: string[]; rows: string[][] } };
};

const SRC_ROS = `source /opt/ros/lyrical/setup.bash`;
const N_DOMAIN = `ROS 노드끼리 서로 보이는 "방 번호". 실습 스크립트는 <b>전부 25</b>. 하나라도 빠지면 그 터미널만 0번 방에 있어서 토픽·서비스가 안 보인다 (③-5).`;

export const SCRIPTS: Record<string, Script> = {
  'run_kill.sh': {
    file: 'run_kill.sh',
    summary: '실습 프로세스를 이름으로 찾아 전부 끄고, 남은 게 있는지 확인한다.',
    blocks: [
      {
        code: `#!/bin/bash
# 전부 종료: gazebo/gz, ros2 launch, cartographer, slam_toolbox, rviz2, teleop, bridges
pkill -9 -f "gz-sim" 2>/dev/null
pkill -f "gz_sim" 2>/dev/null
pkill -f "gz sim" 2>/dev/null
pkill -f "ruby /opt/ros" 2>/dev/null
pkill -f "nvidia-sim" 2>/dev/null`,
        note: `<b>Gazebo부터 끈다.</b> <code>pkill -f</code>는 실행 명령줄 전체에서 글자를 찾아 그 프로세스에 종료 신호를 보낸다. Gazebo 서버(<code>gz-sim-main -s</code>)는 창이 없어서 GUI를 닫아도 남기 때문에 <code>-9</code>(강제 종료)를 쓴다. <code>gz</code> 명령은 ruby 래퍼라 <code>ruby /opt/ros</code>도 같이 찾는다. <code>2&gt;/dev/null</code>은 "그런 프로세스 없음" 메시지를 숨긴다.`,
      },
      {
        code: `pkill -f "ros2 launch" 2>/dev/null
pkill -f "cartographer_node" 2>/dev/null
pkill -f "cartographer_occupancy_grid_node" 2>/dev/null
pkill -f "slam_toolbox" 2>/dev/null
pkill -f "rviz2" 2>/dev/null
pkill -f "teleop_twist_keyboard" 2>/dev/null
pkill -f "parameter_bridge" 2>/dev/null
pkill -f "image_bridge" 2>/dev/null
pkill -f "robot_state_publisher" 2>/dev/null`,
        note: `<b>ROS 노드를 끈다.</b> <code>ros2 launch</code>를 먼저 끄면 그 launch가 띄운 노드도 대부분 같이 내려가고, 고아로 남은 것(브리지·robot_state_publisher 등)은 이름으로 하나씩 잡는다. 여기는 <code>-9</code> 없이 보통 종료(SIGTERM)라 노드가 정리할 시간을 갖는다.`,
      },
      {
        code: `sleep 2
echo "--- 잔여 ROS 프로세스 ---"
ps aux | grep -E "gz-sim|gz sim|nvidia-sim|ros2 launch|cartographer|slam_toolbox|rviz2|teleop_twist|parameter_bridge|image_bridge|robot_state_publisher" | grep -v grep || echo "없음. 다 죽음."`,
        note: `2초 기다린 뒤 같은 이름들로 남은 프로세스를 찾는다. <code>grep -v grep</code>은 검색 명령 자기 자신을 뺀다. 아무것도 안 걸리면 <code>||</code> 뒤가 실행되어 <b>"없음. 다 죽음."</b>이 찍힌다. 이 줄이 안 나오면 다음 단계로 가지 않는다.`,
      },
    ],
  },

  'run_gazebo.sh': {
    file: 'run_gazebo.sh',
    summary: '환경을 맞추고(ROS·Gazebo 격리, GPU), 중복 실행을 막은 뒤 미로 + Waffle + 브리지를 한 번에 띄운다.',
    blocks: [
      {
        code: `${SRC_ROS}
source ~/waffle-lyrical-slam/install/setup.bash
source ~/waffle-lyrical-slam/gazebo_install/setup.bash`,
        note: `<b>환경 세 겹.</b> ① ROS 2 Lyrical 기본 → ② 직접 빌드한 워크스페이스(<code>waffle_slam_course</code>, Cartographer) → ③ 따로 빌드한 Gazebo 쪽(<code>turtlebot3_gazebo</code> 등). 나중에 source한 것이 앞에 붙어서 우선한다. 하나라도 빠지면 <code>package not found</code>.`,
      },
      { code: `export ROS_DOMAIN_ID=25`, note: N_DOMAIN },
      {
        code: `# 같은 LAN의 다른 PC(10.2.12.116)가 같은 파티션으로 gazebo를 돌려서
# /odom 오염 + create 스폰 실패가 발생. 고유 파티션으로 격리.
export GZ_PARTITION=waffle_pank`,
        note: `<b>Gazebo 쪽 격리.</b> Gazebo끼리의 통신(gz-transport)은 ROS와 별개라 <code>ROS_DOMAIN_ID</code>로 안 막힌다. 파티션 이름이 같으면 옆 PC 시뮬레이터 메시지가 섞인다 (③-6).`,
      },
      {
        code: `export __NV_PRIME_RENDER_OFFLOAD=1
export __GLX_VENDOR_LIBRARY_NAME=nvidia
export __EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/10_nvidia.json
export QT_QPA_PLATFORM=xcb
# export LIBGL_ALWAYS_SOFTWARE=1`,
        note: `<b>GPU 설정 (이 노트북 전용).</b> 화면은 내장 GPU가 출력하고 NVIDIA는 그리기만 대신 하는 하이브리드(on-demand)라서 오프로드 변수 두 개를 같이 준다. 빠지면 Gazebo 창이 검다 (③-1). <code>xcb</code>는 Qt 창을 X11로 띄우게 한다. 마지막 줄은 최후 수단(CPU 렌더링, 느림). 데스크톱 단일 GPU면 이 블록은 없어도 된다.`,
      },
      {
        code: `if pgrep -f gz-sim-main > /dev/null; then
  echo "[중단] Gazebo가 이미 실행 중입니다. 먼저 끄세요: bash run_kill.sh"
  pgrep -af gz-sim-main
  exit 1
fi`,
        note: `<b>중복 실행 방지.</b> Gazebo가 두 벌이면 <code>/clock</code> 발행자가 둘이 되어 시간이 앞뒤로 튀고 RViz가 꺼진다 (③-2). 이미 떠 있으면 무엇이 떠 있는지 보여 주고 멈춘다.`,
      },
      {
        code: `ros2 launch waffle_slam_course gazebo.launch.py gui:=true`,
        note: `실제로 노드를 띄우는 줄은 이 한 줄이다. <code>gui:=true</code>면 창도 띄운다(false면 서버만). <b>무엇이 뜨는지는 아래 launch 파일 안에 있다.</b>`,
      },
    ],
    launch: {
      title: 'gazebo.launch.py가 띄우는 것',
      file: 'waffle_slam_course/launch/gazebo.launch.py',
      parts: [
        { what: '환경 변수', detail: '<code>TURTLEBOT3_MODEL=waffle</code>, <code>GZ_SIM_RESOURCE_PATH</code>에 turtlebot3 모델 폴더와 코스 모델 폴더를 추가 (월드 안 모델을 찾는 경로)' },
        { what: 'Gazebo 서버', detail: '<code>gz sim -r -s --headless-rendering twin_closed_maze.sdf</code> — 미로 월드를 바로 재생(<code>-r</code>), 창 없이(<code>-s</code>) 물리·센서만 계산. 서버가 죽으면 launch 전체 종료(<code>on_exit_shutdown</code>)' },
        { what: 'Gazebo GUI', detail: '<code>gz sim -g</code> — <code>gui:=true</code>일 때만. 서버와 따로 뜨는 화면 프로세스라 창을 닫아도 서버는 남는다 (그래서 run_kill.sh가 <code>-9</code>)' },
        { what: 'robot_state_publisher', detail: '<code>turtlebot3_waffle.urdf</code>를 읽어 <code>/robot_description</code>과 고정 TF(<code>base_footprint→base_link→base_scan</code>·바퀴·카메라)를 낸다. <code>use_sim_time: true</code>' },
        { what: 'spawn_turtlebot3.launch.py (x=-1.835, y=2.757)', detail: '① <code>ros_gz_sim create</code> — <code>model.sdf</code>로 로봇을 월드에 생성(z=0.01) ② <code>parameter_bridge</code> — 아래 표대로 Gazebo↔ROS 토픽 변환 ③ <code>image_bridge /camera/image_raw</code> — 카메라 영상' },
      ],
      table: {
        head: ['ROS 토픽', '방향', 'ROS 타입', '누가 내나 (Gazebo 쪽)'],
        rows: [
          ['/clock', 'GZ → ROS', 'rosgraph_msgs/Clock', '시뮬레이터 시계 — 모든 노드의 use_sim_time 기준'],
          ['/joint_states', 'GZ → ROS', 'sensor_msgs/JointState', 'JointState 플러그인 (바퀴 각도)'],
          ['/odom', 'GZ → ROS', 'nav_msgs/Odometry', 'DiffDrive 플러그인 (바퀴 오도메트리)'],
          ['/tf', 'GZ → ROS', 'tf2_msgs/TFMessage', 'DiffDrive 플러그인 — <b>odom→base_footprint</b>'],
          ['/cmd_vel', '<b>ROS → GZ</b>', 'geometry_msgs/<b>TwistStamped</b>', 'DiffDrive 플러그인이 받음 (그래서 teleop도 stamped)'],
          ['/imu', 'GZ → ROS', 'sensor_msgs/Imu', 'IMU 플러그인'],
          ['/scan', 'GZ → ROS', 'sensor_msgs/LaserScan', '라이다 센서 (360°, 0.12–3.5 m)'],
          ['/camera/camera_info', 'GZ → ROS', 'sensor_msgs/CameraInfo', '카메라 센서'],
        ],
      },
    },
  },

  'run_slam.sh': {
    file: 'run_slam.sh',
    summary: 'Cartographer(지도 만들기) 노드 두 개를 새 지도로 시작한다.',
    blocks: [
      {
        code: `${SRC_ROS}
source ~/waffle-lyrical-slam/install/setup.bash`,
        note: `Lyrical은 apt에 Cartographer가 없어서 워크스페이스에서 소스 빌드한 것을 쓴다. 이 source가 빠지면 <code>package 'waffle_slam_course' not found</code>.`,
      },
      { code: `export ROS_DOMAIN_ID=25`, note: N_DOMAIN },
      {
        code: `ros2 launch waffle_slam_course cartographer.launch.py`,
        note: `노드 두 개를 띄운다. <b>저장(⑥·⑦단계)할 때까지 끄지 않는다</b> — 지도는 이 프로세스 메모리에만 있다.`,
      },
    ],
    launch: {
      title: 'cartographer.launch.py가 띄우는 것 + waffle_2d.lua 핵심',
      file: 'waffle_slam_course/launch/cartographer.launch.py · config/waffle_2d.lua',
      parts: [
        { what: 'cartographer_node', detail: '<code>-configuration_directory …/config -configuration_basename waffle_2d.lua</code>, <code>use_sim_time: true</code>, <code>scan→/scan</code>·<code>odom→/odom</code> 리매핑. /scan·/odom을 받아 서브맵·포즈 그래프를 만들고 <b>TF map→odom</b>, <code>/submap_list</code>를 낸다. <code>/write_state</code> 등 서비스도 이 노드에 있다' },
        { what: 'cartographer_occupancy_grid_node', detail: '<code>-resolution 0.05 -publish_period_sec 1.0</code> — 서브맵을 합쳐 5 cm 격자 <code>/map</code>(OccupancyGrid)으로 <b>1초마다</b> 발행. RViz와 map_saver는 이걸 본다' },
      ],
      table: {
        head: ['waffle_2d.lua 키', '값', '뜻'],
        rows: [
          ['map_frame', 'map', '지도 좌표계 이름'],
          ['tracking_frame', 'base_footprint', '로봇 위치를 추적할 기준 프레임'],
          ['published_frame / odom_frame', 'odom / odom', 'Cartographer는 <b>map→odom</b>만 낸다'],
          ['provide_odom_frame', 'false', 'odom→base_footprint는 Gazebo DiffDrive가 이미 내므로 만들지 않는다 (둘이 내면 TF 충돌)'],
          ['use_odometry', 'true', '/odom을 다음 위치 예측에 쓴다'],
          ['num_laser_scans', '1', '/scan 하나 사용 (포인트클라우드·IMU·GPS 없음)'],
          ['min_range / max_range', '0.12 / 3.5 m', '라이다 스펙 밖의 점은 버린다'],
          ['missing_data_ray_length', '3.0', '반사가 없는 빔은 3 m까지 "빈 공간"으로 칠한다'],
          ['use_imu_data', 'false', 'IMU 미사용 (2D)'],
          ['use_online_correlative_scan_matching', 'true', '스캔 매칭 전에 주변을 넓게 훑는다 — 느리지만 오도메트리가 틀려도 잘 맞춘다'],
          ['motion_filter.max_angle_radians', '0.1°', '아주 조금만 돌아도 새 스캔을 넣는다'],
          ['constraint_builder.min_score', '0.65', '루프 클로저 인정 점수 (높을수록 깐깐)'],
          ['global_localization_min_score', '0.7', '다른 trajectory(이어서 매핑)와 연결할 때 점수'],
        ],
      },
    },
  },

  'run_rviz.sh': {
    file: 'run_rviz.sh',
    summary: 'Nav2 기본 화면 설정으로 RViz를 빈 namespace로 띄운다.',
    blocks: [
      { code: `${SRC_ROS}
export ROS_DOMAIN_ID=25`, note: `RViz는 apt 기본 패키지라 워크스페이스 source가 필요 없다. 도메인만 맞춘다.` },
      {
        code: `ros2 run rviz2 rviz2 -d /opt/ros/lyrical/share/nav2_bringup/rviz/nav2_default_view.rviz --ros-args -p use_sim_time:=true`,
        note: `<code>-d</code>: 화면 구성 파일. Nav2 기본 화면이라 Map·LaserScan·TF·로봇 모델과 <b>2D Pose Estimate·Nav2 Goal</b> 버튼이 이미 들어 있다. <code>use_sim_time</code>: Gazebo 시계로 TF 시간을 맞춘다(안 주면 "extrapolation into the future"). <code>nav2_bringup rviz_launch.py</code>를 쓰지 않는 이유는 namespace 기본값이 <code>navigation</code>이라서다 (③-7).`,
      },
    ],
  },

  'run_keyboard_controller.sh': {
    file: 'run_keyboard_controller.sh',
    summary: '키보드로 /cmd_vel(TwistStamped)을 내서 로봇을 천천히 몬다.',
    blocks: [
      { code: `${SRC_ROS}
export ROS_DOMAIN_ID=25`, note: `teleop_twist_keyboard도 apt 패키지. 도메인만 맞춘다.` },
      {
        code: `ros2 run teleop_twist_keyboard teleop_twist_keyboard --ros-args \\
  -p stamped:=true -p frame_id:=base_footprint -p use_sim_time:=true \\
  -p speed:=0.1 -p turn:=0.2`,
        note: `<code>stamped:=true</code>: Twist 대신 <b>TwistStamped</b>로 낸다 — 브리지가 /cmd_vel을 TwistStamped로 받으므로 타입이 다르면 로봇이 안 움직인다. <code>frame_id</code>: 헤더에 넣을 프레임. <code>speed 0.1 m/s · turn 0.2 rad/s</code>: 매핑은 느릴수록 지도가 깨끗하다. 이 터미널에 <b>포커스</b>가 있어야 키가 먹는다 (i 전진 · j/l 회전 · k 정지).`,
      },
    ],
  },

  'save_map.sh': {
    file: 'save_map.sh',
    summary: '/map 한 장을 받아 .pgm(격자 이미지) + .yaml(해상도·원점)로 저장한다. Nav2용.',
    blocks: [
      {
        code: `${SRC_ROS}
if [ "$(id -u)" -eq 0 ]; then
  echo "[중단] sudo 없이 실행하세요: bash save_map.sh"
  exit 1
fi`,
        note: `<b>sudo 차단.</b> <code>id -u</code>가 0이면 root다. sudo로 실행하면 <code>$HOME</code>이 <code>/root</code>가 되어 워크스페이스·저장 경로가 전부 틀어진다 (③-4).`,
      },
      {
        code: `WORKSPACE="$HOME/waffle-lyrical-slam"
source "$WORKSPACE/install/setup.bash"
export ROS_DOMAIN_ID=25`,
        note: `워크스페이스 환경과 도메인.`,
      },
      {
        code: `ros2 topic info /map
if ! ros2 topic info /map 2>/dev/null | grep -qE 'Publisher count: [1-9]'; then
  echo "[중단] /map 발행자가 없습니다. 먼저 SLAM을 켜세요: bash run_slam.sh"
  exit 1
fi`,
        note: `<b>저장할 지도가 있나 먼저 확인.</b> /map을 내는 노드(occupancy_grid_node)가 없으면 map_saver는 몇 초 기다리다 <code>Failed to spin map subscription</code>으로 실패한다. 미리 막고 이유를 알려 준다.`,
      },
      {
        code: `mkdir -p "$HOME/slam_maps"
MAP_PREFIX="$HOME/slam_maps/maze_$(date +%Y%m%d_%H%M%S)"
ros2 run nav2_map_server map_saver_cli \\
  -f "$MAP_PREFIX" --ros-args -p use_sim_time:=true
ls -lh "\${MAP_PREFIX}.pgm" "\${MAP_PREFIX}.yaml"`,
        note: `파일 이름에 날짜·시각을 붙여 덮어쓰지 않는다. <code>map_saver_cli -f 접두어</code>가 /map을 한 번 받아 <code>접두어.pgm</code>(흰 빈칸·검은 벽·회색 모름)과 <code>접두어.yaml</code>(resolution 0.05, origin, 임계값)을 쓴다. 마지막 <code>ls</code>로 실제 생겼는지 확인.`,
      },
    ],
  },

  'save_pbstream.sh': {
    file: 'save_pbstream.sh',
    summary: 'Cartographer에 /write_state 서비스를 불러 작업 상태 전체를 .pbstream으로 쓰게 한다.',
    blocks: [
      {
        code: `${SRC_ROS}
if [ "$(id -u)" -eq 0 ]; then
  echo "[중단] sudo 없이 실행하세요: bash save_pbstream.sh"
  exit 1
fi`,
        note: `save_map.sh와 같은 sudo 차단.`,
      },
      {
        code: `WORKSPACE="$HOME/waffle-lyrical-slam"
# cartographer_ros_msgs/srv/WriteState 타입이 워크스페이스에 있다
source "$WORKSPACE/install/setup.bash"
export ROS_DOMAIN_ID=25`,
        note: `서비스 타입 <code>WriteState</code>가 워크스페이스(소스 빌드)에만 있어서 source가 필수다. 도메인이 빠지면 0번 방에서 서비스를 찾느라 <b>끝없이 기다린다</b> (③-5).`,
      },
      {
        code: `if ! ros2 service list 2>/dev/null | grep -qx '/write_state'; then
  echo "[중단] /write_state 서비스가 없습니다. 먼저 SLAM을 켜세요: bash run_slam.sh"
  exit 1
fi`,
        note: `<code>/write_state</code>는 cartographer_node가 떠 있을 때만 있다. <code>grep -qx</code>: 줄 전체가 정확히 같을 때만.`,
      },
      {
        code: `mkdir -p "$HOME/slam_maps"
# 절대 경로 필수: 파일은 이 터미널이 아니라 cartographer_node 프로세스가 쓴다
MAP_PREFIX="$HOME/slam_maps/maze_$(date +%Y%m%d_%H%M%S)"
timeout 30 ros2 service call /write_state cartographer_ros_msgs/srv/WriteState \\
  "{filename: '\${MAP_PREFIX}.pbstream', include_unfinished_submaps: true}"
ls -lh "\${MAP_PREFIX}.pbstream"`,
        note: `<b>서비스 요청만 보내고 파일은 Cartographer가 쓴다.</b> 그래서 경로는 절대 경로여야 한다(상대 경로면 cartographer_node의 작업 폴더에 떨어짐). <code>include_unfinished_submaps: true</code>: 아직 완성 안 된 마지막 서브맵도 포함. <code>timeout 30</code>: 서비스가 응답 없을 때 무한 대기 방지.`,
      },
    ],
  },

  'run_slam_resume.sh': {
    file: 'run_slam_resume.sh',
    summary: '저장한 .pbstream을 불러와, 새 trajectory를 지정한 위치에서 시작해 이어서 매핑한다 (run_slam.sh 대신).',
    blocks: [
      {
        code: `# 실행: bash run_slam_resume.sh [pbstream 경로] [x y yaw]
${SRC_ROS}
WORKSPACE="$HOME/waffle-lyrical-slam"
source "$WORKSPACE/install/setup.bash"
export ROS_DOMAIN_ID=25`,
        note: `인자는 모두 생략 가능. 환경은 run_slam.sh와 같다.`,
      },
      {
        code: `PBSTREAM="\${1:-$(ls -t "$HOME"/slam_maps/*.pbstream 2>/dev/null | head -1)}"
X="\${2:-0}"; Y="\${3:-0}"; YAW="\${4:-0}"`,
        note: `<code>\${1:-기본값}</code>: 첫 인자가 없으면 기본값. <code>ls -t … | head -1</code> = 가장 최근 .pbstream. x y yaw 기본 0 0 0 = <b>지난번 매핑을 시작한 자리</b> (Gazebo를 새로 켜면 로봇이 거기서 다시 시작하므로).`,
      },
      {
        code: `if [ ! -f "$PBSTREAM" ]; then
  echo "[중단] .pbstream 파일이 없습니다: '$PBSTREAM'  (먼저 save_pbstream.sh로 저장)"
  exit 1
fi
if pgrep -f 'lib/cartographer_ros/cartographer_node' > /dev/null; then
  echo "[중단] Cartographer가 이미 실행 중입니다. run_slam.sh를 먼저 끄세요 (Ctrl+C)"
  exit 1
fi`,
        note: `파일이 없거나, Cartographer가 이미 떠 있으면 멈춘다. 두 개가 동시에 map→odom을 내면 TF가 싸운다.`,
      },
      {
        code: `CONFIG="$(ros2 pkg prefix waffle_slam_course)/share/waffle_slam_course/config"
ros2 run cartographer_ros cartographer_node \\
  -configuration_directory "$CONFIG" -configuration_basename waffle_2d.lua \\
  -load_state_filename "$PBSTREAM" -load_frozen_state=false \\
  -start_trajectory_with_default_topics=false \\
  --ros-args -p use_sim_time:=true -r scan:=/scan -r odom:=/odom &
CARTO=$!`,
        note: `launch 대신 <code>ros2 run</code>으로 직접 띄운다(옵션을 더 줘야 해서). <code>-load_state_filename</code>: 지난 지도 불러오기 → trajectory 0. <code>-load_frozen_state=false</code>: 불러온 지도도 계속 고친다(true면 고정·위치추정만). <code>-start_trajectory_with_default_topics=false</code>: 새 경로를 바로 시작하지 않고 아래에서 위치를 정해 시작. 끝의 <code>&amp;</code>는 백그라운드 실행, <code>$!</code>는 그 PID.`,
      },
      {
        code: `ros2 run cartographer_ros cartographer_occupancy_grid_node \\
  -resolution 0.05 -publish_period_sec 1.0 --ros-args -p use_sim_time:=true &
GRID=$!
trap 'kill -INT $CARTO $GRID 2>/dev/null; wait' INT TERM`,
        note: `/map 격자 노드(run_slam.sh와 같은 설정). <code>trap</code>: 이 터미널에서 Ctrl+C를 누르면 백그라운드 두 노드에도 Ctrl+C를 전달해 같이 끈다.`,
      },
      {
        code: `for i in $(seq 1 30); do
  ros2 service list 2>/dev/null | grep -qx '/start_trajectory' && break
  sleep 1
done`,
        note: `지도 불러오기가 끝나면 <code>/start_trajectory</code> 서비스가 생긴다. 최대 30초 기다린다.`,
      },
      {
        code: `QZ=$(python3 -c "import math; print(math.sin($YAW/2))")
QW=$(python3 -c "import math; print(math.cos($YAW/2))")
ros2 service call /start_trajectory cartographer_ros_msgs/srv/StartTrajectory \\
  "{configuration_directory: '$CONFIG', configuration_basename: 'waffle_2d.lua',
    use_initial_pose: true, relative_to_trajectory_id: 0,
    initial_pose: {position: {x: $X, y: $Y, z: 0.0}, orientation: {x: 0.0, y: 0.0, z: $QZ, w: $QW}}}"`,
        note: `yaw(라디안)를 쿼터니언으로 바꿔(z축 회전이면 z=sin(yaw/2), w=cos(yaw/2)) <b>trajectory 1</b>을 시작한다. <code>relative_to_trajectory_id: 0</code>: 위치는 불러온 지도(trajectory 0) 기준. 위치가 대충 맞으면 Cartographer가 스캔 매칭으로 두 경로를 이어 붙인다.`,
      },
      {
        code: `echo "이어서 매핑 중. 끝나면 save_pbstream.sh / save_map.sh 로 저장한 뒤 Ctrl+C"
wait`,
        note: `<code>wait</code>: 백그라운드 노드가 끝날 때까지 스크립트가 붙어 있는다(그래서 Ctrl+C로 끌 수 있다).`,
      },
    ],
  },

  'setting-waffle.sh': {
    file: 'setting-waffle.sh',
    summary: 'Nav2를 설치하고, 기본 파라미터를 Waffle·시뮬레이터에 맞게 고친 nav2_waffle.yaml을 만든다 (한 번만).',
    blocks: [
      {
        code: `${SRC_ROS}
sudo apt-get update
sudo apt-get install -y ros-lyrical-navigation2 ros-lyrical-nav2-bringup python3-yaml
mkdir -p "$HOME/slam_maps"`,
        note: `Nav2 설치(여기만 sudo — 설치니까). 파라미터는 손으로 고치지 않고 아래 파이썬으로 기본 파일을 복사해 바꾼다.`,
      },
      {
        code: `source = Path(get_package_share_directory('nav2_bringup')) / 'params/nav2_params.yaml'
params = yaml.safe_load(source.read_text())
for name in ['controller_server', 'behavior_server', 'velocity_smoother', 'collision_monitor']:
    params[name]['ros__parameters']['enable_stamped_cmd_vel'] = True`,
        note: `Nav2 기본 파라미터를 읽어 수정한다. <code>enable_stamped_cmd_vel</code>: 속도 명령을 TwistStamped로 — 브리지와 타입을 맞춘다.`,
      },
      {
        code: `params['amcl']['ros__parameters']['base_frame_id'] = 'base_footprint'
params['amcl']['ros__parameters']['scan_topic'] = '/scan'
params['bt_navigator']['ros__parameters']['robot_base_frame'] = 'base_footprint'
params['behavior_server']['ros__parameters']['robot_base_frame'] = 'base_footprint'
for name in ['local_costmap', 'global_costmap']:
    costmap = params[name][name]['ros__parameters']
    costmap['robot_base_frame'] = 'base_footprint'
    costmap['robot_radius'] = 0.22
    costmap['inflation_layer']['inflation_radius'] = 0.30`,
        note: `기준 프레임을 <code>base_link</code>(기본) → <code>base_footprint</code>로 통일. <code>robot_radius 0.22</code>: Waffle 반경. <code>inflation_radius 0.30</code>: 벽에서 이만큼 비용을 올려 붙어 다니지 않게.`,
      },
      {
        code: `follow = params['controller_server']['ros__parameters']['FollowPath']
assert follow['plugin'] == 'nav2_mppi_controller::MPPIController', ...
follow.update(vx_max=0.1, vx_min=-0.1, vy_max=0.0, wz_max=0.2)
smoother['max_velocity'] = [0.1, 0.0, 0.2]
smoother['min_velocity'] = [-0.1, 0.0, -0.2]
params['behavior_server']['ros__parameters']['max_rotational_vel'] = 0.2
params['behavior_server']['ros__parameters']['min_rotational_vel'] = 0.1`,
        note: `<b>속도 제한을 키보드 조종과 같게</b>(0.1 m/s, 0.2 rad/s). 경로 추종기(MPPI), 속도 평활기, 회복 동작 모두. <code>vy_max 0</code>: 옆으로 못 가는 차동구동. assert는 설치된 Nav2의 컨트롤러가 예상과 다르면 멈춘다.`,
      },
      {
        code: `target = Path.home() / 'slam_maps/nav2_waffle.yaml'
target.write_text(yaml.safe_dump(params, sort_keys=False))`,
        note: `결과를 <code>~/slam_maps/nav2_waffle.yaml</code>로 저장. using_slam.sh가 이 파일을 쓴다.`,
      },
    ],
  },

  'using_slam.sh': {
    file: 'using_slam.sh',
    summary: 'SLAM 없이, 저장한 지도 + AMCL 위치추정으로 Nav2 전체를 띄운다.',
    blocks: [
      { code: `${SRC_ROS}
export ROS_DOMAIN_ID=25`, note: `Nav2는 apt 패키지. 도메인만.` },
      {
        code: `MAP_YAML="$HOME/slam_maps/maze_YYYYMMDD_HHMMSS.yaml"
test -f "$MAP_YAML" || { echo "MAP_YAML을 실제 저장 파일로 변경하세요"; exit 1; }`,
        note: `<b>실행 전에 직접 고친다</b> — save_map.sh가 만든 파일 이름으로. 그대로 두면 멈춘다.`,
      },
      {
        code: `ros2 launch nav2_bringup bringup_launch.py \\
  map:="$MAP_YAML" params_file:="$HOME/slam_maps/nav2_waffle.yaml" \\
  use_sim_time:=true autostart:=true slam:=false \\
  use_localization:=true use_composition:=false \\
  use_keepout_zones:=false use_speed_zones:=false`,
        note: `<code>map</code>: map_server가 올릴 지도. <code>params_file</code>: setting-waffle.sh가 만든 파라미터. <code>slam:=false</code> + <code>use_localization:=true</code>: SLAM 대신 <b>AMCL</b>이 map→odom을 낸다(그래서 Cartographer와 동시에 켜면 안 됨). <code>autostart</code>: 생명주기 노드를 자동으로 active까지. <code>use_composition:=false</code>: 노드를 프로세스 하나에 합치지 않고 따로 띄워 로그·문제 추적이 쉽다. keepout·speed zone(구역 필터)은 끈다.`,
      },
    ],
  },

  'run_status.sh': {
    file: 'run_status.sh',
    summary: 'Nav2 운행 중 로봇이 안 움직일 때 다섯 가지를 한 번에 본다.',
    blocks: [
      { code: `${SRC_ROS}
export ROS_DOMAIN_ID=25`, note: `도메인을 맞춰야 운행 중인 노드가 보인다.` },
      {
        code: `ros2 lifecycle get /amcl
ros2 lifecycle get /controller_server`,
        note: `생명주기 상태. 둘 다 <b>active [3]</b>여야 한다. inactive면 autostart가 실패한 것 — 지도·파라미터 경로를 확인.`,
      },
      {
        code: `ros2 run tf2_ros tf2_echo map base_footprint`,
        note: `지도 위 로봇 위치가 나오나. 안 나오면 AMCL이 아직 위치를 모름 → RViz에서 <b>2D Pose Estimate</b>. (Ctrl+C로 끝내야 다음 줄로 간다)`,
      },
      {
        code: `ros2 topic info /cmd_vel --verbose`,
        note: `발행자(Nav2)와 구독자(브리지)가 둘 다 있고, <b>타입이 TwistStamped로 같은지</b>.`,
      },
      {
        code: `ros2 action list -t`,
        note: `<code>/navigate_to_pose</code> 등 Nav2 액션 서버가 떠 있나. RViz의 Nav2 Goal은 이 액션을 부른다.`,
      },
    ],
  },

  'rviz_init_pose.sh': {
    file: 'rviz_init_pose.sh',
    summary: '(쓰지 않음) nav2_bringup의 rviz_launch.py — namespace 문제로 run_rviz.sh로 대체.',
    blocks: [
      { code: `${SRC_ROS}
export ROS_DOMAIN_ID=25
ros2 launch nav2_bringup rviz_launch.py use_sim_time:=true`, note: `rviz_launch.py는 namespace 기본값이 <code>navigation</code>이라 <code>/navigation/tf</code>, <code>/navigation/initialpose</code>를 쓴다. Nav2는 빈 namespace라 화면이 비고 2D Pose Estimate도 안 닿는다 (③-7). 빈 namespace는 CLI로 못 넘겨서 run_rviz.sh(rviz2 직접 실행)로 바꿨다.` },
    ],
  },

  'build_lyrical.sh': {
    file: 'build_lyrical.sh',
    summary: '(처음 한 번) 워크스페이스를 받고 의존성을 설치한 뒤, 저장소 안의 빌드 스크립트로 Cartographer·Gazebo 쪽을 빌드한다.',
    blocks: [
      {
        code: `git clone https://github.com/SeongminJaden/waffle-lyrical-slam.git "$HOME/waffle-lyrical-slam"
cd "$HOME/waffle-lyrical-slam"
${SRC_ROS}`,
        note: `실습 워크스페이스를 홈 폴더에 받는다. 모든 run_*.sh가 이 경로(<code>~/waffle-lyrical-slam</code>)를 가정한다.`,
      },
      {
        code: `sudo apt-get update
sudo apt-get install -y git build-essential cmake python3-numpy python3-vcstool \\
  python3-colcon-common-extensions python3-rosdep \\
  ros-lyrical-robot-state-publisher ros-lyrical-xacro ros-lyrical-tf2-ros \\
  ros-lyrical-rviz2 ros-lyrical-nav2-map-server ros-lyrical-nav2-bringup \\
  ros-lyrical-teleop-twist-keyboard \\
  ros-lyrical-ros-gz-sim ros-lyrical-ros-gz-bridge ros-lyrical-ros-gz-image`,
        note: `빌드 도구(colcon·vcstool·rosdep)와 apt로 받을 수 있는 ROS 패키지: TF·URDF, RViz, map_server, teleop, Gazebo 브리지. <b>Cartographer는 apt에 없어서</b> 아래에서 소스 빌드한다.`,
      },
      {
        code: `if [ ! -f /etc/ros/rosdep/sources.list.d/20-default.list ]; then sudo rosdep init; fi
rosdep update`,
        note: `rosdep(패키지 의존성 자동 설치기) 초기화는 PC당 한 번. 이미 했으면 건너뛴다.`,
      },
      {
        code: `bash build_lyrical.sh
bash build_gazebo.sh`,
        note: `저장소 안의 빌드 스크립트 두 개. <code>build_lyrical.sh</code>: <code>vcs import src &lt; sources.repos</code>로 cartographer·cartographer_ros 소스를 받고 → rosdep으로 의존성 → <code>colcon build --packages-up-to waffle_slam_course</code> → <code>install/</code>. <code>build_gazebo.sh</code>: turtlebot3_simulations(jazzy 브랜치)를 받아 <code>gazebo_install/</code>에 따로 빌드. run_gazebo.sh가 이 두 폴더를 source하는 이유다. (cartographer_ros 링크 오류는 ③-3)`,
      },
    ],
  },
};

/** 실습 폴더 스크립트 순서 (사전 목록용) */
export const SCRIPT_ORDER: { group: string; files: string[] }[] = [
  { group: '처음 한 번', files: ['build_lyrical.sh', 'setting-waffle.sh'] },
  { group: '매핑', files: ['run_kill.sh', 'run_gazebo.sh', 'run_slam.sh', 'run_rviz.sh', 'run_keyboard_controller.sh', 'save_map.sh', 'save_pbstream.sh', 'run_slam_resume.sh'] },
  { group: '운행', files: ['using_slam.sh', 'run_status.sh', 'rviz_init_pose.sh'] },
];
