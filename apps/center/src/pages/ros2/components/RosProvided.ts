import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { markdownParse } from '@center-src/utils/markdown';

const tagName = 'center-ros2-provided';

// 제공 노드(📦) — 직접 만들지 않고 가져다 쓰는 ROS 2 패키지. 실전노드설계(beebot)에서 실제로 띄우는 설정 기준.
type Pkg = 'map' | 'moveit' | 'nav2' | 'rtabmap' | 'cuvslam' | 'nvblox' | 'control' | 'ekf' | 'rsp' | 'mux' | 'realsense' | 'diag' | 'mapsaver';

const F = '```';

const PKGS: Record<Pkg, { label: string; md: string }> = {
  map: {
    label: '전체 지도',
    md: `**📦 제공 노드 = 가져다 쓰는 것, 🛠️ 직접 작성 = 우리가 만든 것.** 바퀴(이동)·팔·지도·카메라처럼 어느 로봇이나 필요한 건 검증된 패키지를 쓰고, 임무 판단(무엇을 집을지·어디로 갈지)만 직접 만든다. 아래는 beebot이 띄우는 제공 노드와 그 사이를 흐르는 것.
${F}mermaid
flowchart TD
    subgraph SENSE[센서]
        RS[📦 realsense2_camera<br/>pole_cam · gripper_cam]
    end
    subgraph WHERE[어디 있나]
        RT[📦 RTAB-Map<br/>지도 · map→odom]
        EKF[📦 robot_localization EKF<br/>odom→base_footprint]
    end
    subgraph MOVE[움직이기]
        NAV[📦 Nav2<br/>경로 · 회피 · 복구]
        MUX[📦 twist_mux<br/>자동/수동 고르기]
        MG[📦 MoveIt move_group<br/>팔 경로 계획]
        CM[📦 ros2_control<br/>controller_manager]
    end
    RSP[📦 robot_state_publisher<br/>URDF → TF]
    DIAG[📦 diagnostic_aggregator]
    RS -->|"✉️ 영상 · 점구름"| RT
    RS -->|"✉️ 점구름 (body_filter 거쳐)"| NAV
    CM -->|"✉️ /odom · /imu"| EKF
    EKF -->|"TF odom→base_footprint"| NAV
    RT -->|"✉️ /map · TF map→odom"| NAV
    NAV -->|"✉️ /cmd_vel_nav → twist_mux"| MUX
    MUX -->|"✉️ /cmd_vel_mux → velocity_smoother → collision_monitor → /cmd_vel"| CM
    MG -->|"🎬 /arm_controller/follow_joint_trajectory"| CM
    RSP -->|"TF 고정 프레임"| NAV
${F}
- 바퀴 명령은 **Nav2 → twist_mux → Nav2 안전 체인(velocity_smoother·collision_monitor) → ros2_control** 순서로 간다. 수동 조작도 같은 안전 체인을 지난다.
- 팔은 **MoveIt이 경로를 계획 → ros2_control의 arm_controller가 실행**.
- 위치는 두 단계: **EKF**가 바퀴+IMU로 부드러운 odom을, **RTAB-Map**이 지도와 맞춰 map→odom 보정을 낸다.
- 버튼을 눌러 패키지마다 안쪽 구조 · 입출력 · 우리 설정 · 직접 해보기 · 겪은 문제를 보세요.`,
  },

  moveit: {
    label: 'MoveIt (팔)',
    md: `**📦 MoveIt 2 — move_group 노드 하나.** "손끝(end_effector_link)을 이 위치·방향으로" 라고 주면 ① 관절값을 구하고(역기구학) ② 몸·바구니에 안 부딪히는 경로를 찾고(OMPL) ③ 속도·가속 한계 안의 궤적으로 만들어 ④ arm_controller에 실행시킨다. **화면을 모른다** — 목표는 늘 3D 좌표(로봇 기준 TF 프레임)로 줘야 한다.
${F}mermaid
flowchart LR
    C[🛠️ coordinator<br/>pick · place] -->|"📞 /plan_kinematic_path<br/>(moveit_msgs/srv/GetMotionPlan)"| MG
    C -->|"🎬 /execute_trajectory<br/>(moveit_msgs/action/ExecuteTrajectory)"| MG
    subgraph MG[📦 move_group]
        IK[pick_ik 역기구학] -->|"목표 관절값"| OMPL[OMPL 경로 계획] -->|"충돌 없는 경로점"| TP[시간 매개변수화<br/>TOTG]
        PS[planning scene<br/>URDF+SRDF 충돌 모델]
    end
    MG -->|"🎬 /arm_controller/follow_joint_trajectory"| JTC[📦 arm_controller<br/>JointTrajectoryController]
    JS[✉️ /joint_states] -->|"✉️ 현재 관절각<br/>(sensor_msgs/JointState)"| MG
${F}
**입력이 되는 파일 (ros_system/config/moveit)**
- \`beebot.srdf\` — 그룹 \`arm\` = joint1–5, 이름 자세 \`home\`(전부 0), 늘 붙어 있는 링크쌍 충돌 검사 제외(disable_collisions)
- \`kinematics.yaml\` — \`pick_ik/PickIkPlugin\` (mode global · 회전 가중 0.5). Lyrical apt에 없어 소스 빌드 (Dockerfile)
- \`ompl_planning.yaml\` — OMPL + 요청/응답 어댑터(시작 자세 범위·충돌 검사, 시간 최적화, 결과 검증)
- \`joint_limits.yaml\` — 계획에 쓰는 속도·가속 한계
- \`moveit_controllers.yaml\` — 실행 대상 = \`arm_controller\` (FollowJointTrajectory, joint1–5). 그리퍼는 MoveIt이 아니라 \`/gripper_controller/gripper_cmd\` 액션으로 따로

**우리가 부르는 방식 (coordinator.cpp)**
- 그룹 \`arm\`, 목표 = \`end_effector_link\`(손가락 끝)를 퍽 위치 2cm 상자 안에 · 방향은 위에서 아래(손끝이 바닥을 봄, 수직축 회전은 자유)
- 시도 3번 · 계획 5초 · 속도·가속 30%
- 계획(📞)과 실행(🎬)을 나눠 부른다 — 계획만 보고 실행 안 할 수도 있게

**직접 해보기 — 관절값 목표 (계획+실행 한 번에, /move_action)**
${F}bash
ros2 action send_goal /move_action moveit_msgs/action/MoveGroup "{
  request: {group_name: arm, num_planning_attempts: 3, allowed_planning_time: 5.0,
            max_velocity_scaling_factor: 0.3, max_acceleration_scaling_factor: 0.3,
            goal_constraints: [{joint_constraints: [
              {joint_name: joint1, position: 0.5, tolerance_above: 0.01, tolerance_below: 0.01, weight: 1.0},
              {joint_name: joint2, position: -0.5, tolerance_above: 0.01, tolerance_below: 0.01, weight: 1.0},
              {joint_name: joint3, position: 0.3, tolerance_above: 0.01, tolerance_below: 0.01, weight: 1.0},
              {joint_name: joint4, position: 0.8, tolerance_above: 0.01, tolerance_below: 0.01, weight: 1.0},
              {joint_name: joint5, position: 0.0, tolerance_above: 0.01, tolerance_below: 0.01, weight: 1.0}]}]},
  planning_options: {plan_only: false}}"
${F}
- 결과 \`error_code.val: 1\` = 성공. 실패 코드는 \`moveit_msgs/msg/MoveItErrorCodes\` (−1 계획 실패 · −31 IK 없음 등)
- 손끝 위치 목표는 \`position_constraints\`(+\`orientation_constraints\`)로 — 팔이 닿는 범위(팔 받침에서 대략 0.3–0.4m)를 넘으면 계획 실패

**겪은 문제**
- **5축 팔 + KDL = 계획 실패:** '위치 + 위→아래 방향' 목표에 'Unable to sample any valid states for goal tree'. MoveIt은 방향 허용 범위(±0.15rad) 안에서 목표 자세를 뽑아 IK로 정확히 맞추는데, 5축은 팔 평면 밖으로 기울 수 없어 뽑힌 자세 대부분이 불가능 → KDL 실패. **pick_ik**(오차 비용을 줄이는 방식)로 바꾸니 성공 — 손끝 오차 5.5mm · 기울기 5.5°
- move_group을 컨트롤러와 동시에 띄우면 spawner가 FATAL → **spawner가 끝난 뒤** 띄운다 (OnProcessExit)
- 목표를 손목(gripper_link)에 주면 손가락이 바닥을 뚫음 → 손가락 끝 \`end_effector_link\`로
- 방향을 인지 결과(항등)로 주면 손끝이 하늘을 봄 → 늘 위에서 아래로 고정
- 수동 조작 슬라이더는 MoveIt을 안 거친다 (\`/cmd/manual/arm\` → manual_control → JTC 직접) — 충돌 검사 없음`,
  },

  nav2: {
    label: 'Nav2 (주행)',
    md: `**📦 Nav2 — 서버 6개 + 관리자 2개.** "map의 (x, y, 방향)으로 가" 액션 하나를 받아 **경로 계산 → 따라가기 → 막히면 복구**를 행동 트리(BT)로 돌린다. LiDAR가 없어 **장애물 = pole_cam 점구름**, **위치 = RTAB-Map(map→odom) + EKF(odom→base_footprint)**.
${F}mermaid
flowchart TD
    X[🛠️ coordinator · explorer · 시뮬레이터 '여기로 이동'] -->|"🎬 /navigate_to_pose"| BT
    subgraph NAV[📦 Nav2]
        BT[bt_navigator<br/>행동 트리] -->|"🎬 /compute_path_to_pose"| PL[planner_server<br/>NavFn + global_costmap]
        BT -->|"🎬 /follow_path"| CT[controller_server<br/>+ local_costmap<br/>FollowPath = 🧩 rl_nav_controller]
        BT -->|"🎬 /spin · /backup · /wait"| BH[behavior_server]
        VS[velocity_smoother]
        CMN[collision_monitor]
    end
    CT -->|"🔗 FollowPath 호출"| RLN[🧩 rl_nav_controller<br/>FollowPath 플러그인] -->|"✉️ /cmd_vel_nav"| MUX[📦 twist_mux]
    BH -->|"✉️ /cmd_vel_nav"| MUX
    MUX -->|"✉️ /cmd_vel_mux"| VS -->|"✉️ /cmd_vel_smoothed"| CMN -->|"✉️ /cmd_vel"| DD[📦 diff_drive_controller]
    PC[✉️ pole_cam 점구름<br/>points_filtered] -->|"local voxel 층"| CT
    PC -->|"global obstacle 층"| PL
    PC -->|"충돌 감시"| CMN
    MAP[✉️ /map RTAB-Map] -->|"global static 층<br/>(transient_local)"| PL
${F}
**관리자 둘로 나눔 (lifecycle_manager)**
- \`lifecycle_manager_base\` — velocity_smoother · collision_monitor (바퀴 명령 체인 — 지도 없이도 떠서 수동 조작 가능)
- \`lifecycle_manager_navigation\` — planner · controller · behavior · bt_navigator (map 필요)
- 하나로 묶었더니 global_costmap이 지도를 못 받으면 수동 조작까지 막혔다

**우리 설정 핵심 (nav2_params.yaml)**
- 행동 트리 = \`config/navigate_to_pose.xml\` — 기본 BT 복사본에서 **후진 복구만 0.30m → 0.10m** (뒤를 보는 센서가 없음)
- planner: NavFn, \`allow_unknown: true\`(모르는 곳도 지나감), tolerance 0.2m
- controller: FollowPath = ml::RlNavController(ONNX 정책, 없으면 inner DWB), 20Hz, 최대 0.26m/s, 후진 안 함(\`min_vel_x: 0\`), 회전 1.82rad/s — 파라미터는 yaml 고정 (프리셋 노드 제거)
- costmap: 로봇 반경 0.18m · 팽창 0.25m. local = VoxelLayer(점구름 3cm~0.6m), global = 정적 지도 + 장애물 + 팽창
- collision_monitor: \`approach\` 다각형 — 지금 속도로 1초 안에 몸이 점에 닿을 때만 멈춤 · 가까우면 감속. 점구름이 1초 넘게 끊기면 정지(invalid source)
- 정책 토글 \`~/FollowPath/toggle\` · 상태 \`~/FollowPath/status\` · 디버그 \`~/FollowPath/debug\` — \`/speed_limit\` 발행자는 없다

**직접 해보기**
${F}bash
ros2 action send_goal /navigate_to_pose nav2_msgs/action/NavigateToPose \\
  "{pose: {header: {frame_id: map}, pose: {position: {x: 1.0, y: 0.0}, orientation: {w: 1.0}}}}"
ros2 topic echo /lifecycle_manager_navigation/managed_nodes_activated   # true = 주행 계획 켜짐
ros2 lifecycle get /velocity_smoother                                    # active [3] 이어야 바퀴가 돎
ros2 param set /controller_server FollowPath.max_lin 0.10               # 정책 최대 속도 (inner DWB는 inner.max_vel_x)
${F}

**겪은 문제**
- **관리자 멈춤 (기동 4번에 1번꼴):** 관리자가 노드 응답을 못 받고 멈춤 → 바퀴 체인 inactive, 속도 명령이 /cmd_vel_mux에서 끊김. Nav2 Health 진단은 이때도 수준 OK라 시뮬레이터가 빨갛게 칠하고 [ROS 재시작]으로. 급하면 \`ros2 lifecycle set\`으로 직접 configure·activate
- **후진 0.30m로 벽에 박힘** → odom이 밀려 위치추정이 벽 안으로 → 출발점부터 경로 실패 → 또 후진 반복 → BT 수정
- **점구름이 늦게 옴(시뮬레이터 렌더 ~2Hz)** → collision_monitor가 invalid source로 계속 정지
- **"failed to plan from (출발점)"** = 출발점이 costmap에서 장애물 안 (위치추정 오차 · 지도에 자기 몸이 찍힘)`,
  },

  rtabmap: {
    label: 'RTAB-Map (지도)',
    md: `**📦 RTAB-Map — 카메라로 지도 만들기 + 그 지도에서 위치 찾기.** 매핑 모드는 들어오는 영상을 노드로 쌓으며 2D 격자 지도(\`/map\`)를 키우고, 위치추정 모드는 저장한 DB의 노드와 지금 영상을 맞춰 **map→odom** 보정만 낸다. 지도 한 벌 = 폴더 하나 \`<map_dir>/<날짜_시각>/rtabmap.db\` (+ 미리보기 map.pgm·yaml).
${F}mermaid
flowchart LR
    RGB[✉️ /pole_cam/color/image_raw] -->|"특징점 (rgbd_sync로 묶음)"| R
    D[✉️ aligned_depth_to_color] -->|"특징점 깊이 (rgbd_sync로 묶음)"| R
    PC[✉️ points_filtered<br/>자기 몸 뺀 점구름] -->|"격자 재료 (Grid/Sensor 0)"| R
    TF[TF odom→base_footprint<br/>EKF] -->|"✉️ /tf 오도메트리"| R
    subgraph R[📦 rtabmap]
        MEM[노드·특징점 DB] -->|"과거 장면과 비교"| LC[루프 클로저]
        GRID[2D 격자 생성]
    end
    R -->|"✉️ /map (OccupancyGrid)"| NAV[📦 Nav2 global_costmap]
    R -->|"TF map→odom"| NAV
    SM[🛠️ state_manager] -->|"📞 /rtabmap/rtabmap/set_mode_mapping · set_mode_localization · load_database"| R
${F}
**우리 설정 (ros_system.launch.py → rtabmap_launch)**
- \`frame_id: base_footprint\`, \`visual_odometry: false\` — 하향 카메라라 시각 오도메트리 대신 EKF odom
- \`odom_frame_id: odom\` — odom을 토픽 대신 **TF에서 영상 시각으로** 읽음 (토픽 동기화는 영상이 늦게 오면 묶음이 안 맞아 'Did not receive data')
- \`qos: 2\`(best effort 구독), \`approx_sync: true\`, \`map_topic: /map\`
- \`--Reg/Force3DoF true\` — x·y·yaw만 (평지)
- \`--Grid/Sensor 0\` + \`subscribe_scan_cloud\` = \`points_filtered\` — 격자를 자기 몸 뺀 점구름으로
- 매핑 시작 = \`--delete_db_on_start\` (새 폴더라 덮어쓰기 없음)

**모드 바꾸기 — state_manager가 서비스로**
- \`/cmd/map_mode\` MAPPING|LOCALIZATION → \`set_mode_*\` · \`/cmd/map_name\` → \`load_database\` + 위치추정
- 서비스 이름이 \`/rtabmap/rtabmap/...\` (이름공간 rtabmap + 노드 전용 ~) — \`/rtabmap/set_mode_*\` 에는 서버가 없다

**직접 해보기**
${F}bash
ros2 service call /rtabmap/rtabmap/set_mode_mapping std_srvs/srv/Empty
ros2 service call /rtabmap/rtabmap/set_mode_localization std_srvs/srv/Empty
ros2 topic echo /map --field info                 # 지도 크기·해상도
rtabmap-databaseViewer ~/.ros/beebot_maps/<폴더>/rtabmap.db   # 쌓인 노드·루프 보기
${F}

**격자 파라미터 — 바꿔 보며 배운 것 (지금은 기본값)**
- 기본: 법선(normals)으로 바닥/장애물 가름 → depth 잡음에 빈 바닥이 장애물 줄무늬로 박히기도 함
- \`Grid/RayTracing true\` → **켜지 말 것**: 카메라가 벽보다 높아 벽 너머 바닥까지 보여서, 그 광선이 2D에서 벽을 지움
- 높이 기준(\`Grid/NormalsSegmentation false\` + \`MaxGroundHeight\`) + 거리 제한(\`RangeMax\`) → 잡음은 줄지만 지도가 성겨짐
- \`Rtabmap/DetectionRate\` 기본 1Hz(초당 한 장) · \`RGBD/LinearUpdate·AngularUpdate\` 0.1 (덜 움직이면 노드 안 만듦)

**겪은 문제**
- depth 영상으로 격자(Grid/Sensor 1)를 만들면 pole_cam에 찍힌 **팔이 로봇 둘레 벽**으로 남아 출발점이 늘 장애물 → 자동 탐사가 한 곳도 못 감 → points_filtered로
- 팔이 pole_cam 앞을 가리면 그 뒤가 영영 '모름' → 매핑할 땐 팔을 접어 둔다`,
  },

  cuvslam: {
    label: 'cuVSLAM (위치)',
    md: `**📦 cuVSLAM — 카메라 영상으로 "내가 지금 어디 있나"를 계산해 \`map→odom\` 을 낸다.** NVIDIA의 GPU 시각 SLAM(PyCuVSLAM)을 우리 파이썬 노드 \`cuvslam_slam\` 이 감싸서 쓴다. **지도는 만들지 않는다 — 지도는 nvblox 담당.** 앞 카메라의 컬러+depth(RGBD)로 로봇의 이동량을 구하고, 출발 자리를 원점 \`(0,0)\` 으로 삼은 \`map\` 좌표에서의 위치를 낸다.
${F}mermaid
flowchart LR
    RGB[✉️ /pole_front_cam/color/image_raw] -->|"컬러"| C
    D[✉️ aligned_depth_to_color] -->|"깊이 (0.5 m 안 = 자기 팔은 마스크로 뺌)"| C
    subgraph C[📦 cuvslam_slam — cuVSLAM RGBD + 루프 클로저]
        TRK[영상 추적] --> POSE[map 좌표의 로봇 자세]
    end
    EKFIN[📦 EKF<br/>TF odom→base_footprint] -->|"그 영상 시각의 odom 자세를 읽음"| C
    C -->|"TF map→odom<br/>영상 시각 + 0.5 s 미래로 발행"| NAV[📦 Nav2 · nvblox]
    C -->|"✉️ /cuvslam/odom<br/>속도만 (vx·vy·ωz)"| EKFOUT[📦 EKF 입력 odom1<br/>바퀴·IMU와 합침]
    C -->|"✉️ /cuvslam/path<br/>최근 3000개"| VIEW[RViz]
    INIT[✉️ /initialpose] -->|"map 프레임 보정"| C
${F}
- 위치는 두 단계다: **EKF**(바퀴+IMU+시각)가 부드러운 \`odom→base_footprint\`, **cuVSLAM**이 \`map→odom\` 보정을 낸다. 둘을 곱하면 지도 안의 로봇 위치.
- \`/cuvslam/odom\` 은 **속도만** 낸다. 추적을 잃으면 cuVSLAM 좌표가 새로 시작해서 자세를 EKF에 넣으면 튀기 때문이다.
- **저장 지도를 불러오지 않는다.** 위치추정 모드에서도 cuVSLAM은 출발 자리를 \`(0,0)\` 으로 *새로 시작*한다 (자체 지도 저장·재위치추정 없음). 그래서 **출발 자리·방향이 저장할 때와 같아야** 지도와 맞는다. 어긋나면 \`/initialpose\` 로 사람이 보정.

**우리 설정 (cuvslam_slam.py 파라미터)**
- 모드 **RGBD** (D435는 IMU가 없어 VIO 불가) · 루프 클로저 + 평면 제약(x·y·yaw만 — 경기장 바닥은 평평)
- \`min_depth: 0.5\` m — 화면 가운데 찍히는 자기 팔은 로봇과 같이 움직여 회전을 덜 잡게 하므로 추적에서 뺌
- \`map_tf_tolerance: 0.5\` s — \`map→odom\` 을 영상 시각보다 **미래**로 발행. Nav2가 경로 끝점을 변환할 때 요청 시각이 최신 TF보다 미래면 실패하기 때문 (0.2 s일 때 목표 이동이 \`Failed to transform end pose\` 로 중단됐다)
- \`linear_variance · angular_variance: 0.0025\` — EKF에 주는 속도 분산 (실측으로 맞출 값)
- 입력은 \`ApproximateTimeSynchronizer\` 로 컬러·depth를 묶음 (허용 차이 0.02 s)

**직접 해보기**
${F}bash
ros2 run tf2_ros tf2_echo map odom                       # map→odom 이 나오나
ros2 topic echo /cuvslam/path --once --field poses       # 경로
# bringup 로그에서 10초마다: "추적 N · 잃음 M · 경로 K" — 정상은 N이 초당 약 15씩 늘고 M은 0
grep -a 'cuvslam_slam\]' /tmp/bringup.log | tail -3
${F}

**겪은 문제 (2026-11-09–10 실기)**
- **\`initialpose\` 를 보내면 TF가 사라졌다** — 적용 로그의 \`get_logger().warn(...)\` 이 없는 함수라 \`AttributeError\` 가 콜백 밖으로 나가 노드가 죽음 (프로세스는 남고 \`map→odom\` 만 0개). \`warning\` 으로 고침
- **추적이 4프레임에서 멈춤** — 카메라 serial을 안 줘서 두 RealSense 노드가 같은 장치를 잡음 (\`Device or resource busy\`). serial을 주고 재시작
- **목표 이동이 \`Failed to transform end pose\` (error 102)** — 최신 \`map→odom\` 이 요청 시각보다 과거. 미래 여유를 0.2 → 0.5 s로 늘림. 단 목표 시작 순간 \`map→odom\` 이 1 s 넘게 비는 현상은 **원인 미확정**
- **EKF odom이 시작 후 약 500–600 m로 발산** — \`map\` 기준 위치는 정상(map→odom이 상쇄). **원인 모름**
- 알아 둘 점: \`map→odom\` 을 만들 때 그 영상 시각의 EKF 자세를 못 찾으면 **로그 없이 그 프레임을 건너뛴다**. EKF가 늦으면 TF 간격이 벌어진다 (평균 0.07–0.10 s, 최대 0.33–0.47 s)

**\`map→odom\` 을 만드는 순서 (그래서 약한 고리)**
1. 영상이 오면 cuVSLAM이 추적 → 카메라 자세
2. \`publish_map\` 이 **그 영상 시각의 \`odom→base_footprint\`(EKF)** 를 TF 버퍼에서 찾는다
3. 못 찾으면 **예외를 삼키고 이 프레임을 건너뛴다** (코드 \`except: return\`, 로그 없음 — 코드만 읽음)
4. 찾으면 \`map→odom\` 을 계산해 **0.5 s 미래 스탬프**로 낸다
- EKF가 늦거나(CPU 포화) 영상이 밀리면 간격이 벌어진다. 관찰: 평균 0.07–0.10 s, 최대 0.33–0.47 s, **목표 이동을 시작하는 순간 1.1–1.6 s까지** 비었다 (그때 Nav2 \`Failed to transform end pose\`, error 102)

**왜 0.5 s 미래로 내나 (\`map_tf_tolerance\`)** — Nav2가 경로 끝점을 \`map→odom\` 으로 바꿀 때 요청 시각이 최신 TF보다 미래면 실패한다. 영상 지연 때문에 최신 \`map→odom\` 이 늘 약간 과거라서 미래 시각으로 내 여유를 둔다 (map→odom은 천천히 바뀌어 안전).

| 값 | 결과 |
|---|---|
| 0.2 s (예전) | 실제 여유는 평균 +0.07 s뿐 → 목표 이동이 error 102로 중단 |
| **0.5 s (현재, 2026-11-10)** | 평균 +0.38 s, 최소 +0.18 s. 단 목표 시작 순간의 1 s 넘는 빈틈은 이것만으로는 못 막음 |

**EKF 연결 (ekf.yaml)** — \`odom1: /cuvslam/odom\` 에서 **vx·vy만** 사용, yaw는 IMU만. 바퀴 \`/odom\`(vx·vy)·IMU(ωz)와 합쳐 \`odom→base_footprint\` TF와 \`/odometry/filtered\` 를 **EKF 하나만** 낸다.

**그 밖의 파라미터 · 입력**
- \`publish_map_tf\` (true) — false면 시각 오도메트리만 (map→odom을 다른 곳이 낼 때) · \`depth_scale_factor\` 1000 (16UC1 mm→m)
- \`base_frame · odom_frame · map_frame\` = base_footprint · odom · map · \`initialpose_topic · odom_topic\` = /initialpose · /cuvslam/odom
- 입력: \`/pole_front_cam/color/image_raw\` · \`aligned_depth_to_color/image_raw\` · \`camera_info\` · 띄우는 곳 \`ros_system.launch.py slam_nodes()\` (\`use_slam\` 일 때만, 지도 모드 NONE이면 안 뜸)
- 자원: CPU 코어 약 60–65% (파이썬 노드 하나는 코어 1개를 못 넘음) · GPU 메모리 약 211 MB · RSS 약 640 MB (PSS 331 MB). 노드별 정밀 측정은 미완

**initialpose (위치 보정)**
- RViz **2D Pose Estimate** 나 TUI(4→8 위치 지정)가 \`/initialpose\`(프레임 \`map\`)를 보내면 \`map\` 프레임을 **보정**한다. cuVSLAM은 리셋하지 않고 추적은 계속된다
- 첫 추적 프레임 전에 받으면 **대기**했다가 첫 프레임 뒤에 적용 (로그 \`initialpose 대기 — 첫 추적 프레임 뒤 적용\`)
- **메모리에만 저장** — 파일에 안 남는다. 재시작하면 사라지고 저장 지도로 위치추정을 올릴 때마다 원점부터 새로 시작하므로 출발 자리·방향이 다르면 **매번 다시 찍어야** 한다. (자동 적용·저장은 아직 없음 — TODO)
- 안 찍어도 \`map→odom\` 은 나온다. 필요한 건 "지도와 실제 위치 맞추기"지 TF 발행 조건이 아니다

**운영 규칙 · 주의**
- 카메라 serial을 항상 지정한다 (\`start.sh\` 는 환경변수 \`POLE_FRONT_CAM_SERIAL · GRIPPER_CAM_SERIAL\` 또는 launch 인자). state_manager의 launch 재시작은 \`start.sh\` 를 거치지 않고 **기록된 인자 그대로** 다시 띄운다
- 그립퍼 캠은 \`use_gripper_cam:=auto\` 라서 안 꽂혀 있으면 관련 노드가 안 뜬다. cuVSLAM은 pole_front_cam만 쓰므로 영향 없음
- 추적을 잃으면(\`잃음 N\` 증가) cuVSLAM 좌표가 새로 시작해 \`map→odom\` 이 튈 수 있다
- 새 프로세스가 스택을 못 보는 현상 때문에 **스택 시작 후 1분 안에** 재야 안정적이다. 같은 이유로 \`run-cli restart cuvslam_slam\` 은 \`/cmd/restart 구독자 없음\` → 스택 전체 재시작으로 우회

**cuvslam.rviz** (TUI 4 지도/위치 → \`e\`, 또는 \`RVIZ_CONFIG=cuvslam ./run-rviz\`) — 위에서 내려다보는 시점에 \`cuVSLAM Path\` · **odom 3종 비교**: EKF 융합 \`/odometry/filtered\`(초록, Nav2가 쓰는 것, 켜짐) · 바퀴 \`/odom\`(주황, 꺼짐) · \`/cuvslam/odom\`(보라, 꺼짐; 속도만이라 자세 화살표는 의미 없음) · \`/map\` 배경. 실기에서 열어 본 적은 없다. \`/odometry/filtered\` 가 \`map\` 에서 500 m 떨어져 보이면 EKF 발산이다.

**열린 질문 · TODO**
- [ ] 목표 시작 순간 \`map→odom\` 이 1 s 넘게 비는 **근본 원인** (CPU 포화 추정, 확정 못 함)
- [ ] EKF odom 500–600 m 발산 원인 (cuVSLAM 속도 스파이크? 바퀴 odom? 초기 전이?)
- [ ] initialpose 저장·자동 적용 (지도 폴더에 저장하고 위치추정 시작 때 적용)
- [ ] cuVSLAM 노드별 정밀 CPU·GPU·메모리 (측정기를 돌리다 bee가 멈춰 못 얻음)
- [ ] \`publish_map\` 이 TF를 못 찾아 건너뛰는 횟수를 로그·진단으로 노출
- [ ] 추적 잃음 복구 동작 정리

**관련 코드** — 노드 \`ros_system/scripts/cuvslam_slam.py\` · EKF \`ros_system/config/ekf.yaml\` · Nav2 TF 허용 \`nav2_params.yaml\`(\`transform_tolerance\`) · 위치 지정 UI \`tools/cli/op/pages/ab/core.py _publish_initialpose\``,
  },

  nvblox: {
    label: 'nvblox (지도)',
    md: `**📦 nvblox — 깊이 영상을 3D 복셀 지도로 쌓고, 그걸 2D 점유 격자 \`/map\` 으로 만든다.** NVIDIA Isaac ROS nvblox(GPU). **위치는 cuVSLAM이 알려 주고, nvblox는 그 위치에서 본 depth를 \`map\` 좌표에 쌓을 뿐이다.** 그래서 위치가 틀리면 지도도 틀어진다.
${F}mermaid
flowchart LR
    PD[✉️ pole_front_cam 정렬 depth] -->|"카메라 0.5 m 안 = 자기 몸 → 0"| PG[🛠️ pole_depth_gate]
    GD[✉️ gripper_cam 정렬 depth] -->|"스캔 자세일 때만 통과"| GG[🛠️ gripper_depth_gate]
    PG --> N
    GG --> N
    TF[TF map→카메라<br/>cuVSLAM + URDF] --> N
    subgraph N[📦 nvblox_node]
        VOX[3D 복셀 지도 0.05 m<br/>mapping_type dynamic] --> SL[높이 0.08–0.3 m로 자름]
    end
    N -->|"✉️ ~/static_occupancy_grid"| NM[🛠️ nvblox_map]
    NM -->|"✉️ /map (latched, 1 Hz)"| NAV[📦 Nav2 global_costmap]
    N -->|"✉️ ~/combined_esdf_pointcloud"| RL[🛠️ rl_nav_controller]
    N -->|"✉️ ~/mesh 3D 메시 (회색)"| VIEW[RViz nvblox 플러그인]
    SM[🛠️ state_manager] -.->|"launch째 다시 띄움 (map:=slam / saved)"| N
${F}
**지도 한 벌 = 폴더 하나 \`<map_dir>/<이름>/\`**
- \`nvblox.nvblx\` — **위치추정의 정본** (3D, 예: 12.5 MB). 지도 목록은 이 파일이 있는 폴더만 인식
- \`map.pgm\` + \`map.yaml\` — 사람이 보는 미리보기 (map_saver가 \`/map\` 을 저장)
- \`nvblox.nvblx.png\` · \`.yaml\` — nvblox가 저장할 때 같이 쓰는 같은 2D 격자 (사실상 중복)
- 저장은 TUI 지도 저장(4→6): \`map_saver\` 다음 \`/nvblox_node/save_map\`. 불러오기는 \`nvblox_map\` 이 시작할 때 \`/nvblox_node/load_map\`

**⚠ 위치추정 모드에서도 지도는 계속 바뀐다 (실측)**
- **그리고 안 보는 곳은 잊는다 (맵핑 녹화 실측):** 정지한 로봇의 \`/map\` 아는 칸이 5349 → 약 4445로 줄고 시야 크기에서 멈췄고, 움직이면 6938까지 늘었다가 다시 서자 32초 만에 약 1570칸 줄었다. 자세한 표와 "안 보이는 곳에 goal을 찍으면?"은 **노드동작 탭 → "⚠ 실측" 절**.
- nvblox에는 매핑을 멈추는 설정이 없다. \`load_map\` 은 저장 지도를 **초기값으로** 불러올 뿐, 그 뒤 새 depth가 계속 쌓인다. 우리 launch는 위치추정에서 **저장만 안 한다** (디스크의 지도는 안 덮어씀)
- 위치추정 중 40초 동안 \`/map\` 41개 중 **17–21개**에서 내용이 달랐고, 전역 코스트맵(\`/global_costmap/costmap\`) 도 13번 바뀌었다. 크기도 바뀐 적이 있다 (105×113 → 105×104)
- Nav2의 일반 구성(map_server가 파일을 한 번 읽어 **고정**)과 다르다. 플래너가 보는 "정적 지도"가 사실은 정적이 아니다 — 가짜 장애물이 지도에 굳거나, 출발 자리가 어긋나면 어긋난 위치에 새 벽이 덧그려질 수 있다 (추정 · 실제 오염은 미확인)

**플래너가 보는 지도는 \`/map\` 이 아니다**
- 전역 플래너(NavfnPlanner, A*) = \`/global_costmap/costmap\` : \`static_layer\`(= /map) + \`inflation_layer\`(0.18 m). **\`obstacle_layer\` 설정은 있지만 plugins 목록에 없어 꺼져 있다** — 새 장애물은 전역 계획에 안 들어가고 로컬 코스트맵만 피한다
- 컨트롤러 = \`/local_costmap/costmap\` (3×3 m가 로봇을 따라감) + ESDF 점구름 \`/nvblox_node/combined_esdf_pointcloud\`

**우리 설정 (nvblox.yaml)**
- \`voxel_size: 0.05\` · \`mapping_type: dynamic\` · \`esdf_mode: 2d\` · \`use_color: false\` (GPU·메모리 절약 — 그래서 RViz 메시가 **회색**)
- \`esdf_slice_min/max_height: 0.08 / 0.3\` — 2D로 자르는 높이. 0.03이던 것을 올렸다: depth 오차로 바닥이 3 cm 위로 찍혀 앞이 트여도 **검은 부채꼴(가짜 장애물)** 이 생겼다 (효과는 미검증)
- \`max_integration_distance_m: 4.5\` — 3.0에서 올림. 멀리 볼수록 depth 잡음이 커진다 (미검증)
- 카메라 2대(\`num_cameras: 2\`): camera_0 = pole_front_cam(늘), camera_1 = gripper_cam(스캔 자세일 때만, 안 꽂혀 있으면 노드째 안 뜸)
- 자원: GPU 메모리 약 808 MB · CPU 코어 약 33–45% · 시스템 GPU 순간 최대 94% — Jetson 메모리가 빠듯해 가장 큰 부담 중 하나

**직접 해보기**
${F}bash
ros2 topic hz /nvblox_node/static_occupancy_grid         # nvblox 원본 격자 (초당 약 5)
ros2 topic hz /map                                       # nvblox_map이 다시 낸 것 (초당 1, 새 격자일 때만)
ros2 topic echo /map --once --field info                 # 지도 크기·해상도·원점
ros2 service call /nvblox_node/save_map nvblox_msgs/srv/FilePath "{file_path: /tmp/test.nvblx}"
rviz2 -d lv2_module6/tools/rviz/nvblox.rviz              # 3D 메시 · ESDF · 코스트맵 (TUI 4 → d)
${F}

**겪은 문제**
- 지도 저장이 \`tools/\` 에 떨어지고 위치추정이 NONE으로 시작 — 이름이 경로로 처리됨 / 저장 뒤 전환이 nvblx 없는 폴더로 감. 고침
- 이름 저장 시 \`map_saver가 저장하지 못했습니다\` — 새 이름 폴더가 없었음. 폴더를 만들게 고침
- nvblox 3D 메시·ESDF 표시 설정(\`nvblox.rviz\`)은 만들었지만 **실기에서 열어 본 적은 없다**

**토픽 (nvblox_node가 내는 것)** — 출처: \`nvblox_node.cpp\` 의 \`"~/…"\` 정의 + 우리 코드 사용처 (코드만 읽음, 실행 중인 노드에서 직접 확인 안 함 — 새 프로세스가 스택을 못 보는 현상 때문에 \`ros2 topic list\` 가 비었음)

| 토픽 | 타입 | 누가 쓰나 |
|---|---|---|
| \`/nvblox_node/static_occupancy_grid\` | OccupancyGrid | **\`nvblox_map\`** → \`/map\` 으로 다시 냄 |
| \`…/combined_occupancy_grid\` · \`dynamic_occupancy_grid\` | OccupancyGrid | (안 씀) |
| \`…/mesh\` | nvblox_msgs/Mesh (3D 메시 전체, 색 없으면 회색) | RViz nvblox 플러그인만 |
| \`…/static_esdf_pointcloud\` | PointCloud2 | 보기용 (지도 전체) |
| \`…/combined_esdf_pointcloud\` | PointCloud2 | **\`rl_nav_controller\`** (\`nav2_params.yaml points_topic\`) — 정적+동적, 높이 0.03–0.30 m 슬라이스 |
| \`…/{static,dynamic,combined,pessimistic_static}_map_slice\` | DistanceMapSlice | (안 씀) |

- 진단·디버그: \`~/esdf_slice_bounds · workspace_bounds · dynamic_points · groundplane_estimator_* · save_rates · save_timings · *_frame_overlay\`
- 서비스: \`/nvblox_node/save_map\` (CLI/TUI 지도 저장) · \`/nvblox_node/load_map\` (\`nvblox_map\` 이 \`map:=saved\` 로 시작할 때) — 둘 다 nvblox_msgs/FilePath, 실기 확인. \`~/save_ply · get_esdf_and_gradient\` 는 안 씀
- 입력: \`camera_0/depth/image · camera_info · color/…\`, \`camera_1/…\` — 모두 **게이트를 거친 depth**(\`/…/aligned_depth_to_color/image_nvblox\`)로 리맵 (\`ros_system.launch.py camera_remaps\`), QoS \`SENSOR_DATA\`

**지도 파일 (저장·불러오기)** — 지도 한 벌 = 폴더 하나 \`<map_dir>/<이름>/\` (실기 \`map_dir\` = \`lv2_module6/ros2_ws/map\`)

| 파일 | 만든 쪽 | 용도 | 크기 (예: m100) |
|---|---|---|---|
| \`nvblox.nvblx\` | nvblox \`~/save_map\` | 위치추정 정본 (3D). 목록은 이 파일이 있는 폴더만 인식 | 12.5 MB |
| \`map.pgm\` + \`map.yaml\` | \`map_saver\` | 사람이 보는 미리보기 · TUI 지도 화면 | 28 KB |
| \`nvblox.nvblx.png\` + \`.yaml\` | nvblox가 같이 씀 | \`map.pgm\` 과 같은 2D 격자 — 사실상 중복, 지워도 다시 생김 | 작음 |

- **매핑(\`map:=slam\`)**: 새 폴더를 만든다 (이미 있으면 덮어쓰지 않고 중단). TUI 저장은 \`map_saver\` → \`nvblox save_map\` 순서로 둘 다
- **위치추정(\`map:=saved map_name:=…\`)**: 시작할 때 \`load_map\`. 폴더에 \`nvblox.nvblx\` 가 없으면 NONE(지도 없음)으로 시작
- 지도 이름을 입력하면 \`<map_dir>/<이름>/\`, 경로 문자를 넣으면 그 경로. 이름만 넣고 폴더가 없으면 만든다 (예전엔 \`Unable to open file\` 로 실패)

**설정 (nvblox.yaml) — 위에 없는 값**

| 파라미터 | 값 | 뜻 |
|---|---|---|
| \`global_frame\` | map | cuVSLAM이 map→odom을 냄 |
| \`integrate_depth_rate_hz\` | 15 | 카메라 15 fps에 맞춤 |
| \`update_mesh_rate_hz / update_esdf_rate_hz / publish_layer_rate_hz\` | 2 / 5 / 2 | |
| \`map_clearing_radius_m\` | -1 | 로봇에서 멀리 떨어진 블록을 지우는 **반경** 기능을 끔 (경기장 약 4.4×6.3 m 통째 기억하려는 의도). ⚠ **TSDF decay는 별개** — \`decay_tsdf_rate_hz\`(기본 5 Hz, **우리는 0으로 설정 — 반영 전**) · \`tsdf_decay_factor\` 0.95 때문에 기본값에선 **안 보이는 곳이 실제로 잊힘 (맵핑 녹화로 실측 — 노드동작 탭 "⚠ 실측" 절)** |
| \`workspace_bounds_*_height_m\` | -0.1 / 0.8 | |

- 값을 바꾸면 nvblox를 다시 띄워야 반영된다 (지도 모드 전환·재시작). 시야 4.5 m · 슬라이스 0.08은 **아직 실기 효과 미확인** — 바닥 잡음이 늘면 4.0 → 3.0으로 되돌릴 것. 8 cm 미만 낮은 물체는 안 남는다

**입력 depth를 거르는 곳 (\`scan_cam_gate\`)** — nvblox는 점구름이 아니라 depth **영상**을 받으므로 자기 몸을 영상에서 뺀다
- \`pole_depth_gate\`: 카메라 0.5 m 안 픽셀 → 0 (자기 팔·폴대). 늘 켜짐
- \`gripper_depth_gate\`: 팔이 **스캔 자세일 때만** 통과, 아니면 전부 0. 그립퍼 캠이 안 꽂혀 있으면 이 노드도 안 뜸 (\`use_gripper_cam:=auto\`)
- \`skill_pose\` 의 자동 스캔 자세는 **기본 꺼짐** (\`scan_pose_enabled=false\`) — 팔을 돌리면 무게중심이 쏠려 매핑 중엔 stow 유지
- 0.5 m 안의 실제 장애물은 nvblox에 안 들어간다. 대신 Nav2 local costmap(몸 뺀 점구름 \`body_filter\`)이 피한다

**자원 (Jetson Orin Nano, 6코어 · RAM 7.4 GiB · GPU 공유 메모리)**

| 항목 | 값 |
|---|---|
| GPU 메모리 | 약 808 MB (cuVSLAM 211 · rl_nav_controller 83 · 데스크톱 약 120 — 합계 약 1.2 GB) |
| CPU | 약 33–45% (코어 1개 = 100%) |
| RAM(PSS) | 약 218 MB (프로세스 RSS 약 1 GB, 가상 12 GB) |
| GPU 사용률 | 시스템 전체 평균 25%, **순간 최대 94%** (nvblox + cuVSLAM 합) |

- **메모리가 가장 큰 제약.** SLAM 매핑 중 free 메모리가 약 100 MB(최소 70 MB), 스왑 사용, 연속 빈 메모리 4 MB까지 줄었다. 시야 4.5 m로 키우면 nvblox 메모리가 늘 수 있다 (미확인)

**실측 — 위치추정 중에도 지도가 계속 바뀐다 (2026-11-10 11:43–44, LOCALIZATION m100, 40초씩 2회, 2회째는 사람이 카메라 앞에서 움직임)**

| 토픽 | 1회 | 2회 (사람 움직임) |
|---|---|---|
| nvblox 원본 \`static_occupancy_grid\` | 초당 4.8 · 73번 바뀜 | 초당 4.8 · 32번 바뀜 |
| **\`/map\`** | 초당 1.0 · **21/40** | 초당 1.0 · **17/40** |
| **\`/global_costmap/costmap\`** | 초당 0.65 · **13/25** | 초당 0.6 · **13/23** |
| \`/map\` 점유 칸 | 1130–1199 | 1003–1144 (변동폭 2배) |
| \`/map\` 모름 칸 | 7682 → 6868 (줄어듦) | 6872 → **8252 (늘어남)** |
| \`/map\` 크기 | 105×113 | 105×**104** |

- \`/global_costmap/static_layer\` 라는 **토픽은 없다.** static_layer는 코스트맵 안의 플러그인 이름이고 실제 토픽은 \`/global_costmap/costmap\`
- 미확인(가장 중요): 사람이 지나간 자리가 \`/map\` 에 **남는지** — 칸 단위 비교를 못 얻었다. 조용한 40초 → 움직이는 40초로 나눠 다시 재야 인과가 분리된다. 2회째 크기가 줄고 모름 칸이 늘어난 이유도 모른다
- 코스트맵 값: 0–100, 99 = 내접, 100 = 치명, -1 = 모름

**보는 법**

| 보고 싶은 것 | 방법 |
|---|---|
| 2D 점유 지도 | TUI 4) 지도/위치 → 7) 지도 보기, 또는 RViz \`/map\` (\`nav.rviz\` · \`mapping.rviz\`) |
| **3D 메시 전체** | RViz nvblox 플러그인(\`nvblox_rviz_plugin\`, bee에 설치됨)으로 \`/nvblox_node/mesh\` — 색이 꺼져 있어 회색 |
| ESDF 점구름 | RViz PointCloud2 → \`static_esdf_pointcloud\`(전체) / \`combined_esdf_pointcloud\`(로컬) |
| 코스트맵 겹침 | TUI 4) → 7) 지도 보기 → **\`c\`**: GLOBAL → LOCAL → OFF (주황 = 팽창, 빨강 = 내접·치명) — 코드만 확인 |
| 목표 이동 전용 | TUI 4) → \`c\` (\`nav.rviz\`): \`/map\` + Global/Local Costmap + \`/plan\` + footprint — 설정 문법까지만 확인 |

- **nvblox.rviz** (TUI 4 → \`d\`, 또는 \`RVIZ_CONFIG=nvblox ./run-rviz\`): \`/map\` 원본 · 3D 메시(\`nvblox_rviz_plugin/NvbloxMesh\`) · ESDF 점구름 2개(static 꺼짐 / combined 켜짐) · Global·Local 코스트맵(꺼짐) · 시점 Orbit · 메시 QoS Reliable. 실기에서 열어 본 적 없음 (\`NvbloxMesh\`·\`Odometry\` 표시는 비교할 기존 파일이 없어 로드 여부 미확인)
- 기존 \`nav.rviz\` · \`mapping.rviz\` 는 메시를 안 그린다. RViz는 Jetson CPU를 쓰고(코어 약 20%) 메모리 여유가 없어서 이미 떠 있는 RViz에 표시만 더하는 게 좋다

**알려진 문제 · 이력 (추가분)**
- 11-10 앞이 트인 곳이 검은 부채꼴 — depth 바닥 잡음이 슬라이스 3 cm를 넘음(추정). 슬라이스 0.08로 대응, **효과 미검증**
- 11-10 그립퍼 캠 CPU·USB 부담 — 미연결 시 respawn 루프 / 연결 시 depth·게이트·인지. \`use_gripper_cam:=auto\` 로 고침
- 11-10 매핑 중 SLAM 부하로 주행 끊김 — CPU·메모리 포화 (nvblox 자체는 약 40% 코어, GPU 808 MB). 부분 대응

**열린 질문 · TODO**
- [ ] nvblox.rviz를 실기에서 열어 메시가 실제로 나오는지 확인
- [ ] **전역 코스트맵 \`obstacle_layer\` 가 꺼져 있는 게 의도인지** (새 장애물이 전역 계획에 안 들어감)
- [ ] **(결정 필요) 위치추정에서 \`/map\` 고정**: \`nvblox_map\` 이 처음 불러온 격자만 한 번 \`/map\` 에 내고 이후 새 격자는 무시 (Nav2 표준과 같음). 새 장애물은 로컬 코스트맵 담당. 대안인 nvblox depth 입력 차단은 RL 컨트롤러 입력(\`combined_esdf_pointcloud\`)도 멈춰 비추천
- [ ] 실행 중 노드에서 토픽 목록·Hz를 직접 확인해 위 토픽 표를 실측으로
- [ ] 시야 4.5 m · 슬라이스 0.08 효과 확인 (검은 부채꼴이 사라지는지, GPU·메모리 증가폭)
- [ ] \`use_color: false\` 인 채 메시를 보기 좋게 할 방법 (색 켜면 GPU·메모리 증가)
- [ ] 지도 크기·복셀 수와 메모리의 관계 · 실행 중 지도 전환 시 nvblox가 launch째 다시 뜨는 시간·비용

**관련 코드** — 설정 \`ros_system/config/nvblox.yaml\` · 구성 \`ros_system.launch.py slam_nodes()\` · \`nvblox_map.py\`(격자 → /map, 저장 지도 불러오기) · \`scan_cam_gate.py\` · 저장 흐름 \`tools/cli/op/bus.py _map_save · _save_nvblox_map · localize_saved\` · 테스트베드 대역 \`faker/src/fake_nvblox.cpp\``,
  },

  control: {
    label: 'ros2_control (모터)',
    md: `**📦 ros2_control — 컨트롤러와 하드웨어 사이 표준 층.** controller_manager가 100Hz로 **read(하드웨어 상태) → update(컨트롤러들) → write(명령)** 를 돈다. 하드웨어 쪽은 플러그인(우리는 🛠️ \`control/BeebotSystemHardware\` — OpenCR와 시리얼)이라, 그 플러그인만 바꾸면 실기·mock·가상 시리얼(fake_opencr)을 오간다.
${F}mermaid
flowchart TD
    subgraph CM[📦 controller_manager 100Hz]
        JSB[joint_state_broadcaster]
        IMU[imu_sensor_broadcaster]
        DD[diff_drive_controller]
        ARM[arm_controller<br/>JointTrajectoryController]
        RLA[🛠️ rl_arm_correction<br/>체인 컨트롤러]
        GR[gripper_controller<br/>ParallelGripperAction]
        HW[🛠️ BeebotSystemHardware<br/>URDF ros2_control 태그]
    end
    CMD[✉️ /cmd_vel] -->|"✉️ geometry_msgs/TwistStamped"| DD
    MG[📦 move_group] -->|"🎬 /arm_controller/follow_joint_trajectory"| ARM
    ARM -->|"reference"| RLA
    GRC[🛠️ coordinator · manual_control] -->|"🎬 /gripper_controller/gripper_cmd"| GR
    DD -->|"🔗 command wheel_*/velocity"| HW
    RLA -->|"🔗 command joint1–5/position"| HW
    GR -->|"🔗 command gripper/position"| HW
    HW <-->|"시리얼 /dev/opencr 1Mbps"| OCR[OpenCR 펌웨어]
    JSB -->|"✉️ /joint_states"| OUT1[robot_state_publisher · MoveIt]
    DD -->|"✉️ /odom"| OUT2[EKF]
    IMU -->|"✉️ /imu"| OUT2
${F}
**구성 (controllers.yaml · URDF)**
- 하드웨어 = URDF \`<ros2_control>\` 블록: 바퀴 2개(velocity 명령) · 팔 5축+그리퍼(position 명령, 상태 position·velocity·effort) · IMU 센서
- 실기 모드에선 펌웨어 프로토콜 관절 순서가 고정이라 **URDF에 팔 관절이 없으면 시작 거부** (팔 없는 모델 주의)
- arm_controller의 명령은 하드웨어로 바로 안 가고 **rl_arm_correction(체인)** 의 reference로 → 보정 더해 하드웨어로
- spawner가 6개를 한 번에 올림 (\`--param-file controllers.yaml\`, 실패 시 테스트베드가 재시도)

**직접 해보기**
${F}bash
ros2 control list_controllers              # active 6개
ros2 control list_hardware_interfaces      # 관절별 command/state 인터페이스
ros2 topic echo /joint_states --once
ros2 topic pub --once /arm_controller/joint_trajectory trajectory_msgs/msg/JointTrajectory \\
  "{joint_names: [joint1,joint2,joint3,joint4,joint5], points: [{positions: [0,0,0,0,0], time_from_start: {sec: 2}}]}"
${F}

**겪은 문제**
- 도커에선 실시간 스케줄링이 안 돼 controller_manager 진단이 '주기 불규칙(jitter)' ERROR — 실기에선 사라져야 정상
- 관절 한계를 아주 조금 넘는 명령(−3.1416 vs 한계 ±3.14159)은 잘라서 실행하고 'out of limits' 로그만 남김
- **시리얼 반올림이 한계를 넘김:** 시리얼은 소수 넷째 자리라 한계값 π(3.14159)가 3.1416으로 오감 → joint_states가 한계 밖 → MoveIt이 '출발 자세가 한계 밖'(START_STATE_INVALID)이라며 **이후 모든 계획을 거부**. BeebotSystemHardware가 읽을 때 반올림만큼(0.001 이내) 넘은 값은 한계로 자름
- Fast DDS 타입 조회(TypeLookup) 폭주로 controller_manager 서비스가 안 떠 컨트롤러가 못 뜸 → \`fastdds.type_propagation=disabled\``,
  },

  ekf: {
    label: 'robot_localization (EKF)',
    md: `**📦 robot_localization ekf_node — 바퀴 odom + IMU를 합쳐 부드러운 odom.** 바퀴는 직진 속도를, IMU는 회전 속도를 더 정확히 안다 → 둘을 칼만 필터로 섞어 \`/odometry/filtered\` 와 **TF odom→base_footprint** 를 낸다. 미끄러지면 바퀴 odom은 틀리지만 IMU 회전은 맞아서 방향 오차가 줄어든다.
${F}mermaid
flowchart LR
    DD[📦 diff_drive_controller] -->|"✉️ /odom<br/>vx · vy · vyaw"| E[📦 ekf_filter_node<br/>50Hz · 2D]
    IMU[📦 imu_sensor_broadcaster] -->|"✉️ /imu<br/>vyaw"| E
    E -->|"✉️ /odometry/filtered"| NAV[📦 Nav2 · velocity_smoother]
    E -->|"TF odom→base_footprint"| ALL[RTAB-Map · Nav2 · MoveIt]
${F}
**우리 설정 (ekf.yaml)**
- \`two_d_mode: true\`, 50Hz, \`world_frame: odom\`, \`base_link_frame: base_footprint\`
- \`odom0: /odom\` — **속도만** (vx, vy, vyaw). 위치는 안 씀 (적분 오차를 두 번 세지 않게)
- \`imu0: /imu\` — **회전 속도(vyaw)만**
- map→odom은 EKF가 아니라 RTAB-Map이 냄 (\`map_frame\`은 이름만)

**직접 해보기**
${F}bash
ros2 topic hz /odometry/filtered              # ~50Hz
ros2 run tf2_ros tf2_echo odom base_footprint
${F}

**겪은 문제**
- 진단 'odometry filtered topic status: No events recorded' — 진단 설정과 토픽 이름이 안 맞는 거짓 경보 (주행엔 영향 없음, 보류)
- 벽에 막혀 바퀴만 돌면 바퀴 odom이 실제로 안 간 거리를 셈 → IMU로도 직진 오차는 못 막음 → RTAB-Map 보정이 필요한 이유`,
  },

  rsp: {
    label: 'robot_state_publisher',
    md: `**📦 robot_state_publisher — URDF + 관절값 → TF.** URDF의 링크 트리를 읽어 고정 관절은 \`/tf_static\`으로 한 번, 움직이는 관절은 \`/joint_states\`를 받을 때마다 \`/tf\`로 낸다. 또 URDF 문자열을 \`/robot_description\`(transient_local)으로 내서 controller_manager · MoveIt · 시뮬레이터가 같은 모델을 쓴다.
${F}mermaid
flowchart LR
    X[urdf/&lt;모델&gt;/urdf.xacro<br/>launch urdf:=] -->|"xacro 펼침"| R[📦 robot_state_publisher]
    JS[✉️ /joint_states] -->|"관절각"| R
    R -->|"✉️ /tf · /tf_static"| ALL[Nav2 · RTAB-Map · MoveIt · body_filter]
    R -->|"✉️ /robot_description"| CM[📦 controller_manager · 시뮬레이터]
${F}
**우리 설정**
- 모델 하나 = 폴더 하나 \`urdf/<이름>/urdf.xacro\` — launch \`urdf:=beebot_mesh\`(기본) · \`beebot_normal\` · \`beebot_slam\`
- xacro 인자: \`mock_hardware\` · \`mock_effort\` · \`port\` · \`mesh_uri\`(launch가 \`package://ros_system/urdf/<이름>/meshes\`로)
- 팔·그리퍼 영점 오프셋: \`<ros2_control>\` 관절별 \`<param name="offset">\` (서보 값 = 관절값 + offset, 펌웨어 재업로드 없이 URDF만)
- 카메라 프레임도 URDF가 낸다 → RealSense 드라이버 \`publish_tf: false\` (프레임 주인은 하나만)
- 링크·관절 이름은 세 모델 모두 같게 (바꿔 끼워도 노드·설정 그대로)

**직접 해보기**
${F}bash
xacro /ws/urdf/beebot_mesh/urdf.xacro mock_hardware:=true > /tmp/b.urdf && check_urdf /tmp/b.urdf
ros2 run tf2_tools view_frames                       # TF 트리 PDF
ros2 run tf2_ros tf2_echo base_footprint end_effector_link
${F}

**겪은 문제**
- URDF는 **기동 때만** 읽힌다 → 모델을 바꾸면 ROS 재시작 (시뮬레이터 [로봇 모델]이 확인 후 재시작)
- 카메라 TF를 드라이버와 URDF가 둘 다 내면 프레임이 튐 → 드라이버 쪽 끔`,
  },

  mux: {
    label: 'twist_mux',
    md: `**📦 twist_mux — 여러 속도 명령 중 하나 고르기.** 입력마다 우선순위와 timeout을 두고, 살아 있는(최근에 온) 것 중 우선순위가 높은 걸 내보낸다. lock 토픽이 true면 전부 막는다.
${F}mermaid
flowchart LR
    A[✉️ /cmd_vel_nav<br/>자동 · 우선순위 10] -->|"timeout 0.5 s"| M[📦 twist_mux]
    B[✉️ /cmd_vel_manual<br/>수동 · 우선순위 100] -->|"살아 있으면 이김"| M
    L[✉️ /state/emergency<br/>lock · 255] -.->|"true면 0"| M
    M -->|"✉️ /cmd_vel_mux"| VS[📦 velocity_smoother]
${F}
**우리 설정 (twist_mux.yaml)**
- \`use_stamped: true\` — 체인 전체 TwistStamped
- 자동 \`/cmd_vel_nav\`(Nav2 FollowPath 플러그인·behavior_server) 10 · 수동 \`/cmd_vel_manual\`(manual_control) 100 — **수동이 이긴다**, 둘 다 timeout 0.5s
- lock \`/state/emergency\` (state_manager가 \`/cmd/e_stop\`을 받아 냄)
- 수동 명령도 이 뒤의 안전 체인(velocity_smoother · collision_monitor)을 지난다 — 장애물 앞에선 수동이어도 멈춤

**직접 해보기**
${F}bash
ros2 topic echo /cmd_vel_mux
ros2 topic pub --once /cmd/e_stop std_msgs/msg/Bool "{data: true}"   # 바퀴 잠금 (state_manager 경유)
${F}

**겪은 문제**
- 수동 명령이 계속 나오면 자동(Nav2)이 영영 못 이김 → '여기로 이동'은 먼저 AUTO 모드로 바꾸고(manual_control이 수동 명령을 버림) 목표를 보낸다`,
  },

  realsense: {
    label: 'realsense2_camera',
    md: `**📦 realsense2_camera — RealSense 드라이버.** 컬러 · 깊이 · 깊이를 컬러에 맞춘 영상(aligned) · 점구름을 낸다. beebot은 2대: **pole_cam**(뒤 폴 위, 앞 아래 34°) · **gripper_cam**(그리퍼 위).
${F}mermaid
flowchart LR
    P[📦 pole_cam 30fps] -->|"✉️ color/image_raw · aligned_depth_to_color/image_raw · depth/color/points"| U1[RTAB-Map · 인지 · body_filter]
    G[📦 gripper_cam 15fps] -->|"✉️ color · depth"| U2[인지 · 파지 점수]
    U1 -->|"body_filter: 자기 몸 점 빼기"| PF[✉️ points_filtered → Nav2 · RTAB-Map 격자]
${F}
**우리 설정 (ros_system.launch.py camera())**
- \`camera_name\` = pole_cam / gripper_cam → 토픽 \`/pole_cam/color/image_raw\` 처럼
- 640×480, pole 30fps · gripper 15fps, \`align_depth.enable\` · \`pointcloud.enable\`
- \`publish_tf: false\` — 프레임은 URDF가
- \`serial_no\`로 어느 장치가 어느 카메라인지 고정 (\`pole_cam_serial\` · \`gripper_cam_serial\` 인자)
- 테스트베드는 카메라 대신 🛠️ fake_camera (시뮬레이터 렌더 → 같은 토픽)

**직접 해보기**
${F}bash
rs-enumerate-devices | grep Serial
ros2 topic hz /pole_cam/depth/color/points
${F}

**겪은 문제**
- 깊이 잡음은 거리 제곱으로 커짐 (σ ≈ 0.005·z² m — 2.5m면 3cm) → 3cm 높이로 장애물을 가르면 먼 바닥이 장애물로 찍힘
- pole_cam이 팔과 차체를 봄 → body_filter로 빼야 함 (안 빼면 지도·costmap에 자기 몸이 장애물로)
- 영상을 오래 붙잡는 구독자가 있으면(Lyrical 버퍼) 발행이 막힘 → 깊은 복사로 저장`,
  },

  diag: {
    label: 'diagnostic_aggregator',
    md: `**📦 diagnostic_aggregator — 노드별 /diagnostics를 묶어 한눈에.** 각 노드가 diagnostic_updater로 낸 상태(OK·WARN·ERROR·STALE)를 이름 규칙으로 묶어 \`/diagnostics_agg\`(트리)와 \`/diagnostics_toplevel_state\`(전체 한 줄)로 낸다. 시뮬레이터 진단 칸이 이것을 보여 준다.
${F}mermaid
flowchart LR
    N1[🛠️ 직접 작성 노드들<br/>diagnostic_updater] -->|"✉️ /diagnostics"| A[📦 aggregator_node]
    N2[📦 Nav2 · RTAB-Map · EKF · controller_manager] -->|"✉️ /diagnostics"| A
    A -->|"✉️ /diagnostics_agg"| S[시뮬레이터 진단 칸]
    A -->|"✉️ /diagnostics_toplevel_state"| S
${F}
**우리 묶음 (bringup/config/diagnostics.yaml)**
- 인지 · 계획·임무 · 학습 · 상태 · 제어 · **Nav2 관리자** · 제공 패키지 — 상태 이름 "<노드>: <항목>"의 노드 이름(startswith)으로
- Nav2 관리자: \`expected\`에 base·navigation 관리자 → 아예 안 오면 STALE

**직접 해보기**
${F}bash
ros2 topic echo /diagnostics_toplevel_state
ros2 run rqt_robot_monitor rqt_robot_monitor
${F}

**겪은 문제**
- Nav2 관리자는 노드가 안 켜져도(멈춤) Nav2 Health 수준을 **OK**로 냄 → 시뮬레이터가 메시지(active 아님)로 판단해 ERROR + 재시작 링크
- 묶음 규칙에 안 걸린 항목은 'Other'로 빠져 안 보임 → 새 노드는 diagnostics.yaml에 추가`,
  },

  mapsaver: {
    label: 'nav2_map_server',
    md: `**📦 nav2_map_server — 지도 파일 ↔ /map.** \`map_server\`는 map.yaml·pgm을 읽어 \`/map\`을 내고, \`map_saver_server\`는 지금 \`/map\`을 파일로 저장한다. 둘 다 lifecycle 노드라 관리자가 올린다.
${F}mermaid
flowchart LR
    SIM[시뮬레이터 지도 저장] -->|"📞 /map_saver/save_map"| MS[📦 map_saver]
    MAP[✉️ /map RTAB-Map] -->|"요청 때 한 장"| MS
    MS -->|"map.pgm · map.yaml"| DIR[&lt;map_dir&gt;/&lt;map_name&gt;/]
    YAML[코스 지도 yaml] -->|"읽기"| SRV[📦 map_server<br/>테스트베드 course 모드만] -->|"✉️ /map"| NAV[📦 Nav2]
${F}
**우리 구성**
- RTAB-Map(slam · saved)일 때 bringup이 \`map_saver\` + \`lifecycle_manager_map_saver\`를 띄움 → 저장 위치 = 지금 지도 폴더
- pgm은 사람이 보는 미리보기 — 위치추정의 정본은 같은 폴더의 \`rtabmap.db\`
- 테스트베드 \`map:=course\`는 RTAB-Map 없이 코스 지도를 \`map_server\`로 + 정적 map→odom

**직접 해보기**
${F}bash
ros2 service call /map_saver/save_map nav2_msgs/srv/SaveMap "{map_topic: /map, map_url: /tmp/test, image_format: pgm, map_mode: trinary, free_thresh: 0.25, occupied_thresh: 0.65}"
${F}`,
  },
};

const MD = `
## 제공 노드를 다룰 때 공통 원칙
- **이름은 yaml 최상위 키 = 노드 이름.** 오타는 오류 없이 무시되고 기본값으로 돈다 → \`ros2 param get <노드> <이름>\` 으로 실제 값 확인
- **lifecycle 노드(Nav2 · map_server)는 '떠 있음' ≠ '켜짐'.** \`ros2 lifecycle get\` 이 active여야 일한다
- **TF 프레임 주인은 하나만.** 같은 프레임을 두 곳이 내면 튄다 (카메라: URDF가 냄, 드라이버는 끔)
- **설정은 기동 때 읽힌다.** URDF · launch 인자 · 대부분의 파라미터는 바꾸면 재시작
- 이 페이지의 이름·토픽·값은 **실전노드설계(beebot)** 설정 그대로다 — 노드별 입출력 표는 실전노드설계 탭
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosProvided extends w.HTMLElement {
    private pkg: Pkg = 'map';

    private refresh() {
      this.shadowRoot?.querySelectorAll('.rv-pkg').forEach(el =>
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.pkg === this.pkg));
      const el = this.shadowRoot?.querySelector('#rv-pkg') as HTMLElement;
      if (el) markdownParse(el, PKGS[this.pkg].md);
    }

    @addEventListener('.rv-pkg', 'click', { delegate: true })
    onPkg(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rv-pkg') as HTMLElement;
      if (!btn) return;
      this.pkg = btn.dataset.pkg as Pkg;
      this.refresh();
    }

    @onConnectedAfter
    onReady() {
      this.refresh();
      markdownParse(this.shadowRoot?.querySelector('#rv-md') as HTMLElement, MD);
    }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .rv-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rv-intro b { color:#22314e; }
          .rv-pkgs { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; margin-top:10px; }
          .rv-pkg { padding:6px 12px; border-radius:16px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#22314e; font-size:12px; font-weight:700; cursor:pointer; }
          .rv-pkg.active { background:linear-gradient(135deg,#22314e,#7dd3fc); color:#fff; border-color:transparent; }
          .rv-detail { background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; margin-top:8px; font-size:12.5px; color:#334155; line-height:1.7; overflow-x:auto; }
          .rv-detail pre { overflow-x:auto; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rv-intro">
          직접 만들지 않고 <b>가져다 쓰는 ROS 2 패키지(📦)</b> 모음입니다. 패키지마다 안쪽 구조 · 입출력 · 우리 설정 · 직접 해보기 · 겪은 문제를 실전봇(beebot) 기준으로 정리했습니다. 버튼을 눌러보세요.
        </div>

        <div class="rv-pkgs">
          ${(Object.keys(PKGS) as Pkg[]).map(k => `<button class="rv-pkg" data-pkg="${k}">${PKGS[k].label}</button>`).join('')}
        </div>
        <div class="rv-detail" id="rv-pkg"></div>

        <div class="md" id="rv-md"></div>
      `;
    }
  }

  return tagName;
};
