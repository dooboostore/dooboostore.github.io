import {
  addEventListener,
  elementDefine,
  onConnectedBodyShadow,
  subscribeSwcAppRouteChange,
  swcAppRouteGo,
  swcAppRouteQueryParam,
} from '@dooboostore/simple-web-component';
import { markdownCancel, markdownParse } from '@center-src/utils/markdown';
import { SCRIPTS, SCRIPT_ORDER, Script } from './RosLabSlamScripts';

const tagName = 'center-ros2-labslam';

type Sec = 'mission' | 'run' | 'incident' | 'resume' | 'nav' | 'cheat';

const F = '```';

const CLS = `    classDef std fill:#c8e6c9,stroke:#2e7d32,color:#1b1b1b;
    classDef hw fill:#fff9c4,stroke:#f9a825,color:#1b1b1b;
    classDef mine fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e;
    classDef file fill:#f3e8ff,stroke:#7e22ce,color:#3b0764;
    classDef ext fill:#ffffff,stroke:#8A97A0,stroke-dasharray:4 3,color:#475569;`;

const SECTIONS: Record<Sec, { label: string; md?: string }> = {
  mission: {
    label: '① 미션·구성',
    md: `
## 미션: 새 현장에 로봇을 투입한다

현업에서 SLAM은 "알고리즘 공부"가 아니라 **현장 투입 절차**입니다. 이 실습은 TurtleBot3 Waffle을 처음 보는 미로(창고라고 생각)에 넣고, 아래 순서를 실제로 돌립니다.

| 일정 | 할 일 | 결과물 |
| --- | --- | --- |
| 1일차 | 시뮬레이터 띄우고 → Cartographer로 지도 만들기 → 저장 | \`.pgm\` + \`.yaml\` (Nav2용), \`.pbstream\` (작업 파일) |
| 2일차 | 어제 작업 파일을 불러와 **구역을 넓혀** 이어서 매핑 → 다시 저장 | 넓어진 지도 |
| 운영 | SLAM은 끄고, 저장한 지도로 Nav2 자율주행 | 목표점 주행 |
| 상시 | 장애가 나면 로그로 원인 찾기 | ③ 장애 대응 훈련 |

### 전체 구성 — 누가 무엇을 주고받나

${F}mermaid
flowchart TB
    TEL["⌨️ run_keyboard_controller.sh<br/>teleop_twist_keyboard"]
    subgraph SIM["run_gazebo.sh — 시뮬레이터"]
        GZ{{"Gazebo (gz sim)<br/>Waffle · LiDAR · 바퀴"}}
        BR["📦 ros_gz_bridge"]
    end
    subgraph MAP["매핑할 때"]
        CA["📦 cartographer_node<br/>run_slam.sh / run_slam_resume.sh"]
        OG["📦 occupancy_grid_node"]
    end
    subgraph NAV["운행할 때 (매핑과 동시에 켜지 않음)"]
        N2["📦 Nav2<br/>map_server · AMCL · planner · controller"]
    end
    RV["👀 run_rviz.sh — RViz"]
    PB[("~/slam_maps/*.pbstream")]
    PG[("~/slam_maps/*.pgm · *.yaml")]
    GZ --- BR
    BR -->|"✉️ /scan /odom /clock<br/>/tf odom→base_footprint"| CA
    TEL -->|"✉️ /cmd_vel"| BR
    CA -->|"🧩 서브맵 (같은 데이터)"| OG
    OG -->|"✉️ /map"| RV
    CA -->|"✉️ /tf map→odom"| RV
    CA -->|"📞 /write_state<br/>save_pbstream.sh"| PB
    OG -->|"✉️ /map → map_saver<br/>save_map.sh"| PG
    PB -.->|"💾 불러오기<br/>run_slam_resume.sh"| CA
    PG -.->|"💾 지도 파일<br/>using_slam.sh"| N2
    N2 -->|"✉️ /cmd_vel"| BR
${CLS}
    class BR,CA,OG,N2,RV,TEL std;
    class GZ hw;
    class PB,PG file;
    style SIM fill:#f8fafc,stroke:#94a3b8
    style MAP fill:#f8fafc,stroke:#94a3b8
    style NAV fill:#f8fafc,stroke:#94a3b8
${F}

### 스크립트 역할

| 단계 | 스크립트 | 하는 일 |
| --- | --- | --- |
| 설치 1회 | \`build_lyrical.sh\` | 워크스페이스 받기, apt 설치, Cartographer·Waffle·Gazebo 빌드 |
| 설치 1회 | \`setting-waffle.sh\` | Nav2 설치, Waffle 크기·속도에 맞춘 Nav2 파라미터 생성 |
| 공통 | \`run_gazebo.sh\` | Gazebo + 브리지. **이미 떠 있으면 실행 거부** |
| 매핑 | \`run_slam.sh\` | Cartographer 새로 시작 |
| 매핑 | \`run_slam_resume.sh\` | 저장한 \`.pbstream\`에서 이어서 시작 |
| 공통 | \`run_rviz.sh\` | 보기 · 2D Pose Estimate · Nav2 Goal |
| 공통 | \`run_keyboard_controller.sh\` | 키보드 조종 (0.1 m/s) |
| 저장 | \`save_map.sh\` | Nav2용 지도 이미지 |
| 저장 | \`save_pbstream.sh\` | Cartographer 작업 상태 전체 |
| 운행 | \`using_slam.sh\` · \`run_status.sh\` | Nav2 실행 · 상태 점검 |
| 정리 | \`run_kill.sh\` | 실습 프로세스 전부 종료 |

### 현장 규칙 다섯 가지

- **도메인은 하나로.** 모든 스크립트가 \`ROS_DOMAIN_ID=25\`. 하나라도 빠지면 그 노드만 다른 세상에 있다 (③-5).
- **Gazebo도 격리.** Gazebo 통신은 ROS와 별개라 \`GZ_PARTITION\`으로 따로 막는다. 같은 LAN의 다른 PC와 섞이면 로봇이 혼자 움직인다 (③-6).
- **Gazebo는 한 벌만.** 두 벌이면 시계(/clock)가 둘이 되어 시간이 앞뒤로 튄다 (③-2).
- **매핑과 운행은 동시에 켜지 않는다.** Cartographer와 AMCL이 둘 다 \`map→odom\`을 낸다.
- **sudo 없이.** sudo를 붙이면 \`$HOME\`이 \`/root\`가 되어 경로가 전부 틀어진다 (③-4).

<p><button class="lb-tab" data-concept="slam">📘 SLAM 개념 시뮬레이터 →</button> <button class="lb-tab" data-concept="cartographer">🗺️ Cartographer 소개 →</button> <button class="lb-tab" data-concept="tf">🧭 TF2 →</button> <button class="lb-tab" data-concept="gazebo">🌍 Gazebo →</button></p>
`,
  },

  run: { label: '② 실행 흐름' },

  incident: { label: '③ 장애 대응 훈련' },

  resume: {
    label: '④ 저장·이어서 매핑',
    md: `
## 저장 두 종류 — 결과 사진과 작업 파일

| | \`save_map.sh\` → \`.pgm\` + \`.yaml\` | \`save_pbstream.sh\` → \`.pbstream\` |
| --- | --- | --- |
| 내용 | 완성된 2D 격자 (빈칸·벽·모름) + 해상도·원점 | 서브맵, 지나간 경로, 포즈 그래프, loop closure 결과 전체 |
| 저장 방식 | map_saver가 \`/map\` 토픽을 받아 파일로 | Cartographer에 \`/write_state\` 서비스로 "저장해라" |
| 쓰는 곳 | **Nav2** (map_server) | **Cartographer** (이어서 매핑 · 위치추정 전용) |
| 비유 | PNG | PSD |

> 둘 다 **SLAM이 켜져 있을 때** 저장한다. SLAM을 먼저 끄면 메모리에 있던 지도가 사라진다.

${F}bash
bash save_map.sh        # ~/slam_maps/maze_날짜_시각.pgm / .yaml
bash save_pbstream.sh   # ~/slam_maps/maze_날짜_시각.pbstream
${F}

\`.pbstream\` 경로는 **절대 경로**로 넘깁니다. 파일을 쓰는 쪽은 내 터미널이 아니라 cartographer_node 프로세스라서, 상대 경로면 그 프로세스의 작업 폴더에 떨어집니다.

## 이어서 매핑 — trajectory 0 위에 trajectory 1

Cartographer는 매핑 한 번을 **trajectory(경로)** 하나로 쌓습니다. 저장 파일을 불러오면 지난 경로가 0번, 새로 도는 경로가 1번이 됩니다.

${F}mermaid
flowchart LR
    PB[("어제의 .pbstream")]
    subgraph CN["cartographer_node"]
        T0["trajectory 0<br/>어제 지도 (불러옴)"]
        T1["trajectory 1<br/>오늘 새로 도는 경로"]
        PG["포즈 그래프 최적화<br/>loop closure"]
        T0 --> PG
        T1 --> PG
    end
    PB -->|"💾 -load_state_filename"| T0
    ST["📞 /start_trajectory<br/>0번 기준 (x, y, yaw)에서 시작"] --> T1
    PG -->|"✉️ /map · map→odom"| OUT["한 장으로 합쳐진 지도"]
${CLS}
    class T0,T1,PG std;
    class PB file;
    class ST mine;
    class OUT ext;
    style CN fill:#f8fafc,stroke:#94a3b8
${F}

핵심은 **1번이 0번 지도의 어디서 시작하는지 알려 주는 것**입니다. 안 알려 주면 1번은 아무 데나 떠 있다가 같은 장소를 알아볼 때까지 지도 두 장이 따로 놉니다. Gazebo를 새로 켜면 로봇은 늘 같은 출발점에 놓이므로 기본값 (0, 0, 0)이면 됩니다.

${F}bash
# run_slam.sh 대신
bash run_slam_resume.sh                                   # 가장 최근 .pbstream, 출발점 (0,0,0)
bash run_slam_resume.sh ~/slam_maps/maze_xxx.pbstream     # 파일 지정
bash run_slam_resume.sh '' 1.5 -0.5 1.57                  # 로봇이 지난 지도 기준 (1.5, -0.5), 90° 에 있을 때
${F}

스크립트가 하는 일:

${F}bash
# -load_frozen_state=false : 불러온 지도도 계속 고친다
# -start_trajectory_with_default_topics=false : 새 경로는 아래 서비스로 위치를 정해서 시작
ros2 run cartographer_ros cartographer_node \\
  -configuration_directory <config> -configuration_basename waffle_2d.lua \\
  -load_state_filename ~/slam_maps/maze_xxx.pbstream \\
  -load_frozen_state=false \\
  -start_trajectory_with_default_topics=false
ros2 service call /start_trajectory cartographer_ros_msgs/srv/StartTrajectory \\
  "{configuration_directory: '<config>', configuration_basename: 'waffle_2d.lua',
    use_initial_pose: true, relative_to_trajectory_id: 0,
    initial_pose: {position: {x: 0.0, y: 0.0}, orientation: {w: 1.0}}}"
${F}

| \`-load_frozen_state\` | 의미 | 언제 |
| --- | --- | --- |
| \`false\` | 불러온 지도도 최적화 대상 → 이어서 매핑 | 구역 확장, 지도 다듬기 |
| \`true\` | 불러온 지도는 고정, 새 경로는 위치만 맞춤 | Cartographer로 위치추정만 할 때 |

확인: \`ros2 service call /get_trajectory_states cartographer_ros_msgs/srv/GetTrajectoryStates\` → \`trajectory_id=[0, 1]\`이면 두 경로가 같이 올라와 있다.
`,
  },

  nav: {
    label: '⑤ Nav2 운행',
    md: `
## 저장한 지도로 운행하기

운행 때는 Cartographer를 끄고, **Nav2가 지도 파일을 읽어** 위치를 추정(AMCL)하고 경로를 계획합니다. \`map→odom\`을 내는 주체가 Cartographer에서 AMCL로 바뀝니다.

${F}mermaid
flowchart TB
    Y[("~/slam_maps/maze_xxx.yaml · .pgm")]
    P[("~/slam_maps/nav2_waffle.yaml<br/>setting-waffle.sh가 생성")]
    subgraph N2["using_slam.sh — nav2_bringup"]
        MS["📦 map_server"]
        AM["📦 AMCL"]
        PL["📦 planner_server"]
        CT["📦 controller_server (MPPI)"]
        BT["📦 bt_navigator"]
    end
    RV["👀 run_rviz.sh"]
    GZ{{"Gazebo"}}
    Y -->|"💾"| MS
    P -->|"⚙️ params_file"| N2
    MS -->|"✉️ /map"| AM
    MS -->|"✉️ /map"| PL
    RV -->|"❶ ✉️ /initialpose<br/>2D Pose Estimate"| AM
    AM -->|"❷ ✉️ /tf map→odom"| PL
    RV ==>|"❸ 🎬 /navigate_to_pose<br/>Nav2 Goal"| BT
    BT ==>|"❹ 🎬 경로 계산 · 따라가기"| PL
    BT ==> CT
    CT -->|"❺ ✉️ /cmd_vel (TwistStamped)"| GZ
    GZ -->|"✉️ /scan /odom /tf"| AM
${CLS}
    class MS,AM,PL,CT,BT,RV std;
    class GZ hw;
    class Y,P file;
    style N2 fill:#f8fafc,stroke:#94a3b8
${F}

### 순서

1. **(1회)** \`bash setting-waffle.sh\` — Nav2 기본 파라미터를 Waffle에 맞춰 \`~/slam_maps/nav2_waffle.yaml\`로 저장 (아래 표).
2. \`using_slam.sh\`의 \`MAP_YAML\`을 실제 저장 파일 이름으로 바꾼다.
3. \`run_kill.sh\` → \`run_gazebo.sh\` → \`using_slam.sh\` → \`run_rviz.sh\` (SLAM은 켜지 않는다).
4. RViz **2D Pose Estimate**로 로봇의 현재 위치·방향을 지도 위에 찍는다 → AMCL이 \`map→odom\`을 내기 시작.
5. **Nav2 Goal**로 목표를 찍는다.

### setting-waffle.sh가 바꾸는 값

| 항목 | 값 | 이유 |
| --- | --- | --- |
| \`enable_stamped_cmd_vel\` | true (controller · behavior · velocity_smoother · collision_monitor) | Lyrical Gazebo 브리지가 TwistStamped를 받는다 |
| \`robot_base_frame\` / AMCL \`base_frame_id\` | base_footprint | TurtleBot3 관례, Cartographer 설정과 같게 |
| costmap \`robot_radius\` · \`inflation_radius\` | 0.22 m · 0.30 m | Waffle 크기 |
| MPPI \`vx_max\` · \`wz_max\` | 0.1 m/s · 0.2 rad/s | 실습 안전 속도 (teleop과 같게) |

### 안 움직일 때 — run_status.sh

| 확인 | 정상 | 아니면 |
| --- | --- | --- |
| \`ros2 lifecycle get /amcl\`, \`/controller_server\` | \`active [3]\` | Nav2가 덜 떴거나 params 파일 오류 → using_slam.sh 터미널 로그 |
| \`tf2_echo map base_footprint\` | 값이 나옴 | 2D Pose Estimate를 아직 안 찍음 |
| \`ros2 topic info /cmd_vel --verbose\` | 발행자 Nav2, 구독자 Gazebo 브리지 | Twist/TwistStamped 불일치, 도메인 불일치 |
| \`ros2 action list -t\` | \`/navigate_to_pose\` 있음 | bt_navigator 미기동 |

> RViz는 **run_rviz.sh**로 띄운다. nav2_bringup의 rviz_launch.py는 namespace 기본값이 \`navigation\`이라 2D Pose Estimate가 \`/navigation/initialpose\`로 나가 AMCL에 안 닿는다 (③-7).
`,
  },

  cheat: {
    label: '⑥ 명령 모음',
    md: `
## 명령 모음

### 처음 지도 만들기

${F}bash
bash run_kill.sh                   # "없음. 다 죽음." 확인
bash run_gazebo.sh                 # 터미널 1
bash run_slam.sh                   # 터미널 2 — 저장 전까지 끄지 않는다
bash run_rviz.sh                   # 터미널 3 — Fixed Frame: map
bash run_keyboard_controller.sh    # 터미널 4 — i 전진 · j/l 회전 · k 정지
bash save_map.sh && bash save_pbstream.sh
${F}

### 이어서 매핑

${F}bash
bash run_kill.sh && bash run_gazebo.sh
bash run_slam_resume.sh            # run_slam.sh 대신
bash run_rviz.sh; bash run_keyboard_controller.sh
bash save_pbstream.sh && bash save_map.sh
${F}

### 운행

${F}bash
bash run_kill.sh && bash run_gazebo.sh
bash using_slam.sh                 # MAP_YAML 먼저 수정
bash run_rviz.sh                   # 2D Pose Estimate → Nav2 Goal
bash run_status.sh                 # 안 움직이면
${F}

### 상태 확인 (어느 단계든)

${F}bash
source /opt/ros/lyrical/setup.bash && export ROS_DOMAIN_ID=25
ros2 topic info /clock                       # Publisher count: 1 (2면 Gazebo 중복)
ros2 topic info /map                         # 매핑·운행 중이면 1
ros2 run tf2_ros tf2_echo map odom           # SLAM·AMCL 보정값
ros2 run tf2_ros tf2_echo odom base_footprint   # 바퀴 오도메트리
ros2 service list | grep write_state         # Cartographer 떠 있나
pgrep -af 'gz-sim-main|cartographer_node'
${F}

### Cartographer 설정 핵심 (waffle_2d.lua)

| 키 | 값 | 의미 |
| --- | --- | --- |
| \`tracking_frame\` | base_footprint | 로봇 기준 프레임 |
| \`published_frame\` | odom | Cartographer는 \`map→odom\`만 낸다 |
| \`provide_odom_frame\` | false | odom 프레임은 Gazebo(바퀴 오도메트리) 것을 쓴다 |
| \`use_odometry\` | true | /odom을 scan 매칭 예측에 쓴다 |
| \`TRAJECTORY_BUILDER_2D.use_imu_data\` | false | IMU 미사용 |
`,
  },
};

const ORDER = Object.keys(SECTIONS) as Sec[];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 스크립트 원문(주석 줄은 흐리게) + 덩어리별 설명 + launch 파일 안쪽
const codeHtml = (code: string) =>
  code.split('\n').map(l => (/^\s*#/.test(l) ? `<span class="lb-c">${esc(l)}</span>` : esc(l))).join('\n');
const scriptHtml = (sc: Script, open: boolean, tag = '') => `
  <details class="lb-sc"${open ? ' open' : ''}${tag ? ' data-step="1"' : ''}>
    <summary>${tag ? `<span class="lb-sc-tag">${esc(tag)}</span>` : ''}📜 <code>${esc(sc.file)}</code> <span class="lb-sc-sum">${esc(sc.summary)}</span></summary>
    <div class="lb-sc-rows">${sc.blocks.map(b => `
      <div class="lb-sc-row"><pre class="lb-sc-code">${codeHtml(b.code)}</pre><div class="lb-sc-note">${b.note}</div></div>`).join('')}
    </div>
    ${sc.launch ? `
    <div class="lb-sc-launch">
      <div class="lb-sc-lh">🚀 ${esc(sc.launch.title)} <span class="lb-sc-file">${esc(sc.launch.file)}</span></div>
      <ul>${sc.launch.parts.map(p => `<li><b>${esc(p.what)}</b> — ${p.detail}</li>`).join('')}</ul>
      ${sc.launch.table ? `<table class="lb-sc-t"><thead><tr>${sc.launch.table.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${sc.launch.table.rows.map(r => `<tr>${r.map((c, i) => `<td>${i === 0 ? `<code>${c}</code>` : c}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}
    </div>` : ''}
  </details>`;

// ② 실행 흐름 스텝퍼 — 스크립트 하나 실행할 때마다 시스템 상태 표가 어떻게 바뀌는지
type Row = { name: string; how: string };
const ROWS: Row[] = [
  { name: 'Gazebo 서버 (gz-sim-main)', how: "pgrep -af gz-sim-main" },
  { name: '/clock 발행자', how: 'ros2 topic info /clock' },
  { name: '/scan · /odom 발행자', how: 'ros2 topic info /scan' },
  { name: 'TF odom→base_footprint', how: 'tf2_echo odom base_footprint' },
  { name: '/map 발행자', how: 'ros2 topic info /map' },
  { name: 'TF map→odom', how: 'tf2_echo map odom' },
  { name: '/cmd_vel 발행자', how: 'ros2 topic info /cmd_vel' },
  { name: '~/slam_maps 파일', how: 'ls ~/slam_maps' },
];
type Step = { title: string; cmd: string; script?: string; term: string; text: string; check: string; expect: string; vals: string[]; hot: number[]; warn?: string };
const STEPS: Step[] = [
  {
    title: '0. 정리', cmd: 'bash run_kill.sh', script: 'run_kill.sh', term: '아무 터미널',
    text: '시작 전에 지난 실행을 전부 끈다. Gazebo는 창을 닫아도 화면 없는 서버(gz-sim-main -s)가 남을 수 있어서, 이름으로 찾아 강제 종료한다.',
    check: 'bash run_kill.sh', expect: '--- 잔여 ROS 프로세스 ---\n없음. 다 죽음.',
    vals: ['0', '0', '0', '없음', '0', '없음', '0', '(지난 파일만)'], hot: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    title: '1. 시뮬레이터', cmd: 'bash run_gazebo.sh', script: 'run_gazebo.sh', term: '터미널 1',
    text: 'Gazebo가 미로와 Waffle을 띄우고, ros_gz_bridge가 Gazebo 토픽을 ROS로 넘긴다. 이때부터 시뮬레이션 시계(/clock)가 흐르고, 바퀴 오도메트리가 odom→base_footprint를 낸다. 아직 지도(map)는 없다.',
    check: 'ros2 topic info /clock', expect: 'Type: rosgraph_msgs/msg/Clock\nPublisher count: 1',
    vals: ['1', '1', '1 · 1', '있음 (연속)', '0', '없음', '0', '(지난 파일만)'], hot: [0, 1, 2, 3],
    warn: '창이 검으면 ③-1, Publisher count가 2면 ③-2',
  },
  {
    title: '2. SLAM', cmd: 'bash run_slam.sh', script: 'run_slam.sh', term: '터미널 2 (저장 전까지 켜 둠)',
    text: 'cartographer_node가 /scan·/odom을 받아 서브맵을 쌓고 map→odom 보정값을 낸다. occupancy_grid_node가 서브맵을 격자 지도 /map으로 1초마다 발행한다. 출발 직후라 map→odom은 거의 0이다.',
    check: 'ros2 run tf2_ros tf2_echo map odom', expect: '- Translation: [-0.004, 0.009, 0.000]\n- Rotation: in Quaternion (xyzw) [0.000, 0.000, -0.001, 1.000]',
    vals: ['1', '1', '1 · 1', '있음 (연속)', '1', '있음 ≈ 0', '0', '(지난 파일만)'], hot: [4, 5],
    warn: "바로 끝나고 'cartographer_node not found'면 ③-3",
  },
  {
    title: '3. 보기', cmd: 'bash run_rviz.sh', script: 'run_rviz.sh', term: '터미널 3',
    text: 'RViz는 구독만 한다. 표의 발행자 수는 그대로다. Fixed Frame을 map으로 두고 /map, LaserScan(/scan), TF를 켜면 벽과 스캔 점이 겹쳐 보여야 한다.',
    check: 'ros2 node list | grep rviz', expect: '/rviz',
    vals: ['1', '1', '1 · 1', '있음 (연속)', '1', '있음 ≈ 0', '0', '(지난 파일만)'], hot: [],
    warn: 'LaserScan을 켜자마자 RViz가 꺼지면 ③-2',
  },
  {
    title: '4. 몰고 다니기', cmd: 'bash run_keyboard_controller.sh', script: 'run_keyboard_controller.sh', term: '터미널 4 (포커스 두기)',
    text: 'teleop이 /cmd_vel을 내고 브리지가 Gazebo로 넘긴다. 로봇이 움직이면서 새 벽을 보고 지도가 넓어진다. 바퀴 미끄러짐만큼 오차가 쌓이고, Cartographer가 map→odom을 조금씩 바꿔 상쇄한다.',
    check: 'ros2 topic info /cmd_vel', expect: 'Type: geometry_msgs/msg/TwistStamped\nPublisher count: 1',
    vals: ['1', '1', '1 · 1', '있음 (연속)', '1 (넓어짐)', '조금씩 변함', '1', '(지난 파일만)'], hot: [4, 5, 6],
  },
  {
    title: '5. 루프 클로저', cmd: '(출발점으로 다시 돌아오기)', term: '터미널 4',
    text: '한 바퀴 돌아 처음 본 곳을 다시 보면 Cartographer가 같은 장소임을 알아채고 포즈 그래프 전체를 다시 맞춘다. 이때 map→odom이 툭 튄다. 바퀴 오도메트리(odom→base_footprint)는 건드리지 않는다.',
    check: 'ros2 run tf2_ros tf2_echo map odom', expect: '- Translation: [0.031, -0.024, 0.000]   ← 한 번에 바뀜 (예시 값)',
    vals: ['1', '1', '1 · 1', '있음 (연속, 그대로)', '1 (휘었던 벽이 펴짐)', '툭 바뀜', '1', '(지난 파일만)'], hot: [4, 5],
  },
  {
    title: '6. 지도 저장', cmd: 'bash save_map.sh', script: 'save_map.sh', term: '터미널 5 (sudo 없이)',
    text: 'map_saver가 /map 한 장을 받아 .pgm(격자 이미지)과 .yaml(해상도·원점)로 저장한다. Nav2가 이 파일을 쓴다. 스크립트는 /map 발행자가 없거나 sudo로 실행하면 멈춘다.',
    check: 'bash save_map.sh', expect: '[map_saver]: Map saved successfully\nmaze_20261014_151537.pgm  maze_20261014_151537.yaml',
    vals: ['1', '1', '1 · 1', '있음 (연속)', '1', '있음', '1', '.pgm + .yaml'], hot: [7],
    warn: 'Failed to spin map subscription이면 ③-4',
  },
  {
    title: '7. 작업 상태 저장', cmd: 'bash save_pbstream.sh', script: 'save_pbstream.sh', term: '터미널 5',
    text: 'Cartographer에 /write_state 서비스를 불러 서브맵·경로·포즈 그래프 전체를 .pbstream으로 쓰게 한다. 다음에 run_slam_resume.sh로 불러와 이어서 매핑할 수 있다.',
    check: 'bash save_pbstream.sh', expect: "message=\"State written to '~/slam_maps/maze_20261014_151712.pbstream'.\"\n3.4M maze_20261014_151712.pbstream",
    vals: ['1', '1', '1 · 1', '있음 (연속)', '1', '있음', '1', '+ .pbstream'], hot: [7],
    warn: "'waiting for service to become available...'에서 멈추면 ③-5",
  },
  {
    title: '8. 종료', cmd: 'bash run_kill.sh', script: 'run_kill.sh', term: '아무 터미널',
    text: '전부 끈다. 지도는 메모리에서 사라지지만 파일로 남았다. 다음에는 ④ 이어서 매핑 또는 ⑤ Nav2 운행으로 시작한다.',
    check: 'ls ~/slam_maps', expect: 'maze_20261014_151537.pgm  maze_20261014_151537.yaml\nmaze_20261014_151712.pbstream',
    vals: ['0', '0', '0', '없음', '0', '없음', '0', '.pgm .yaml .pbstream'], hot: [0, 1, 2, 3, 4, 5, 6],
  },
];

// ③ 장애 대응 훈련 — 실제로 겪은 장애. 증상·로그를 보고 원인을 고른다
type Opt = { t: string; ok?: boolean; why: string };
type Incident = { title: string; symptom: string; log: string; opts: Opt[]; fix: string; lesson: string };
const INCIDENTS: Incident[] = [
  {
    title: 'Gazebo 창 안이 새까맣다',
    symptom: 'run_gazebo.sh를 실행하면 창은 뜨는데 안이 검고, 잠시 뒤 "Gazebo GUI 앱이 응답하지 않습니다"가 뜬다. 노트북은 내장 GPU + NVIDIA.',
    log: `$ prime-select query
on-demand
$ xrandr --listproviders
Provider 0: ... name:modesetting      ← 화면은 내장 GPU가 출력
Provider 1: ... name:NVIDIA-G0        ← NVIDIA는 오프로드용
$ grep GLX run_gazebo.sh
export __GLX_VENDOR_LIBRARY_NAME=nvidia`,
    opts: [
      { t: '월드 파일(.sdf)이 깨져서 장면을 못 그린다', why: '월드가 깨졌으면 서버 로그에 SDF 오류가 나고, GUI는 빈 장면이라도 회색 바닥은 그린다. 서버는 정상 동작 중이었다.' },
      { t: '하이브리드 GPU인데 PRIME 오프로드 변수가 빠졌다', ok: true, why: '화면은 내장 GPU가 출력하고 NVIDIA는 그리기만 대신 한다. __GLX_VENDOR_LIBRARY_NAME=nvidia만 주면 NVIDIA로 그리긴 해도 그 결과가 화면으로 넘어가지 않는다.' },
      { t: 'GZ_PARTITION 때문에 GUI가 서버를 못 찾는다', why: '서버를 못 찾으면 GUI는 "서버 기다리는 중" 화면을 그린다. 실제로 GUI의 /gui/* 서비스가 서버와 연결돼 있었다.' },
      { t: 'GPU 메모리가 부족하다', why: 'nvidia-smi로 보면 여유가 충분했다 (수백 MB 사용).' },
    ],
    fix: `export __NV_PRIME_RENDER_OFFLOAD=1          # ← 이 줄 추가
export __GLX_VENDOR_LIBRARY_NAME=nvidia
# 그래도 검으면 (느리지만 확실)
# export LIBGL_ALWAYS_SOFTWARE=1`,
    lesson: 'GPU 관련 화면 문제는 먼저 "누가 화면을 출력하나"(xrandr --listproviders)부터 본다. on-demand 노트북은 두 변수를 함께 준다.',
  },
  {
    title: 'LaserScan을 켜면 RViz가 꺼진다',
    symptom: 'run_rviz.sh로 RViz를 띄우고 /scan LaserScan을 추가, Fixed Frame을 base_link로 바꾸는 순간 RViz가 종료된다.',
    log: `[WARN] [tf2_buffer]: Detected jump back in time. Clearing TF buffer.
[WARN] [rviz2]: Detected jump back in time. Resetting RViz.
... (0.03초마다 반복)
$ ros2 topic info /clock
Publisher count: 2
$ pgrep -af gz-sim-main
6990 gz-sim-main -r -s ... (5분 전)
8604 gz-sim-main -r -s ... (1분 전)`,
    opts: [
      { t: 'RViz의 LaserScan 플러그인 버그', why: '같은 RViz를 Gazebo 한 벌에 붙이면 25초 넘게 멀쩡했다. 플러그인은 원인이 아니다.' },
      { t: 'LaserScan QoS가 맞지 않는다', why: 'QoS가 안 맞으면 스캔이 안 보일 뿐 RViz가 꺼지지는 않는다. 로그에 QoS 경고도 없다.' },
      { t: 'Gazebo가 두 벌 떠서 시계(/clock)가 두 개다', ok: true, why: '이전에 띄운 Gazebo를 안 끄고 다시 실행했다. 두 시계가 번갈아 들어와 시간이 계속 거꾸로 가고, RViz가 1초에 수십 번 스스로 초기화하다 버티지 못했다.' },
      { t: 'base_link TF가 없다', why: 'TF가 없으면 "No transform" 경고와 함께 화면이 비지, 종료되지는 않는다.' },
    ],
    fix: `bash run_kill.sh          # 전부 끄고
bash run_gazebo.sh        # 한 벌만. 이제 이미 떠 있으면 실행을 거부한다
ros2 topic info /clock    # Publisher count: 1 확인`,
    lesson: '"jump back in time"은 시계가 둘 이상이라는 신호다. 발행자 수(Publisher count)를 먼저 본다.',
  },
  {
    title: "run_slam.sh가 바로 끝난다",
    symptom: 'run_slam.sh를 실행하면 아무 노드도 안 뜨고 즉시 종료된다.',
    log: `[ERROR] [launch]: executable 'cartographer_node' not found on the libexec
  directory '~/waffle-lyrical-slam/install/cartographer_ros/lib/cartographer_ros'
$ ls ~/waffle-lyrical-slam/install/cartographer_ros/lib/cartographer_ros/
(비어 있음)
$ cat log/latest_build/cartographer_ros/stderr.log
node_main.cpp: undefined reference to 'fLS::FLAGS_configuration_directory'
collect2: error: ld returned 1 exit status`,
    opts: [
      { t: '워크스페이스 setup.bash를 source 안 했다', why: '그랬다면 패키지 자체를 못 찾는다. 로그는 패키지 폴더까지 찾아 들어갔는데 실행 파일만 없다고 한다.' },
      { t: 'cartographer_ros 빌드가 링크 단계에서 실패해 실행 파일이 안 생겼다', ok: true, why: '명령줄 옵션 변수(gflags)가 두 파일에 중복 정의되는 문제를 고치려고 두 가지 수정이 동시에 들어갔다. 공식 패치는 offline_node.cpp를 라이브러리에서 빼고, 손으로 한 수정은 node_main.cpp의 정의를 지웠다. 결과적으로 변수가 어디에도 정의되지 않았다.' },
      { t: 'launch 파일의 executable 이름 오타', why: '이름은 cartographer_node로 맞다. 다른 PC의 정상 빌드본에는 같은 이름의 실행 파일이 있다.' },
      { t: 'apt로 cartographer를 안 깔았다', why: 'Lyrical에는 cartographer_ros 바이너리가 없어 소스로 빌드한다. 빌드 결과물 문제다.' },
    ],
    fix: `cd ~/waffle-lyrical-slam/src/cartographer_ros
git status                                         # 패치 외 수정 파일 확인
git checkout -- cartographer_ros/src/node_main.cpp  # 손으로 고친 것 되돌림 (공식 패치는 유지)
cd ~/waffle-lyrical-slam && colcon build --symlink-install --packages-select cartographer_ros
ls install/cartographer_ros/lib/cartographer_ros/   # cartographer_node 확인`,
    lesson: "'not found'는 설치 결과를 보고, 설치가 비었으면 빌드 로그(stderr.log)를 본다. 같은 문제에 수정을 두 번 넣지 않는다.",
  },
  {
    title: '지도 저장이 실패한다',
    symptom: '지도를 저장하려고 sudo bash ./save_map.sh를 실행했다.',
    log: `./save_map.sh: 줄 3: /root/waffle-lyrical-slam/install/setup.bash: 그런 파일이나 디렉터리가 없습니다
Type: nav_msgs/msg/OccupancyGrid
Publisher count: 0
[map_saver]: Saving map from 'map' topic to '/root/slam_maps/maze_..._' file
[ERROR] [map_saver]: Failed to spin map subscription`,
    opts: [
      { t: '저장 폴더에 쓰기 권한이 없어서 sudo가 필요하다', why: '자기 홈 폴더(~/slam_maps)는 sudo 없이 쓸 수 있다. 오히려 sudo 때문에 경로가 /root로 바뀌었다.' },
      { t: 'sudo로 $HOME이 /root가 됐고, SLAM도 꺼져 있었다', ok: true, why: '로그에 원인이 둘 다 있다. /root/... 경로가 sudo의 흔적이고, Publisher count: 0은 /map을 내는 Cartographer가 없다는 뜻이다. 저장할 지도가 없으니 2초 기다리다 실패했다.' },
      { t: 'map_saver와 /map의 QoS가 다르다', why: 'QoS가 다르면 발행자는 1로 보이고 메시지만 안 온다. 여기는 발행자 자체가 0이다.' },
      { t: '지도가 너무 작아서 저장할 게 없다', why: '아무리 작아도 /map이 있으면 저장된다.' },
    ],
    fix: `bash run_slam.sh        # SLAM 켠 상태에서 (다른 터미널)
bash save_map.sh        # sudo 없이
# 스크립트가 이제 sudo 실행과 /map 발행자 0을 미리 막는다`,
    lesson: 'ROS 스크립트에 sudo를 붙이지 않는다. "저장"은 데이터를 내는 노드가 살아 있을 때만 된다.',
  },
  {
    title: 'pbstream 저장이 끝나지 않는다',
    symptom: 'save_pbstream.sh를 실행했더니 한 줄 찍고 계속 멈춰 있다. SLAM은 다른 터미널에서 잘 돌고 있다.',
    log: `$ bash save_pbstream.sh
waiting for service to become available...
(몇 분째 그대로)
$ head -3 save_pbstream.sh
ros2 service call /write_state cartographer_ros_msgs/srv/WriteState \\
  "{filename: '\${MAP_PREFIX}.pbstream', include_unfinished_submaps: true}"`,
    opts: [
      { t: 'Cartographer가 지도를 정리하느라 바쁘다', why: '서비스 호출은 응답이 늦을 수는 있어도 "서비스가 나타나기를 기다린다"고 하지 않는다. 서비스 자체를 못 찾는 상태다.' },
      { t: '스크립트에 ROS_DOMAIN_ID=25가 없어 0번 도메인에서 찾고 있다', ok: true, why: 'ros2 service call은 서비스를 찾을 때까지 시간 제한 없이 기다린다. Cartographer는 25번 도메인에 있으니 영원히 안 나타난다. MAP_PREFIX도 정의돼 있지 않았다.' },
      { t: '저장 경로에 쓰기 권한이 없다', why: '권한 문제면 서비스 응답에 실패 메시지가 온다. 아직 서비스까지 가지도 못했다.' },
      { t: 'Lyrical에서 /write_state 서비스 이름이 바뀌었다', why: '같은 도메인에서 ros2 service list를 보면 /write_state가 있다.' },
    ],
    fix: `source /opt/ros/lyrical/setup.bash
source ~/waffle-lyrical-slam/install/setup.bash   # WriteState 타입
export ROS_DOMAIN_ID=25
MAP_PREFIX="$HOME/slam_maps/maze_$(date +%Y%m%d_%H%M%S)"   # 절대 경로
timeout 30 ros2 service call /write_state ...`,
    lesson: '"waiting for service"는 거의 항상 도메인·이름 불일치다. 스크립트마다 source와 ROS_DOMAIN_ID를 넣고, 무한 대기에는 timeout을 건다.',
  },
  {
    title: '로봇이 혼자 움직이고 스폰이 실패한다',
    symptom: '아무것도 안 눌렀는데 /odom 값이 바뀌고, 가끔 로봇 스폰(create)이 실패한다. 같은 강의실에서 여러 명이 실습 중이다.',
    log: `# (증상 설명용 예시 출력)
$ ros2 topic echo /odom --field pose.pose.position
x: 0.0 ... x: 1.42 ... x: 0.0 ...   ← 값이 두 로봇 사이를 오감
[create]: 스폰 실패
$ echo $GZ_PARTITION
(비어 있음)`,
    opts: [
      { t: 'Gazebo 물리 엔진 버그', why: '혼자 실습할 때는 재현되지 않는다. 주변 PC와 관련 있다.' },
      { t: '같은 LAN의 다른 PC가 같은 Gazebo 파티션을 쓰고 있다', ok: true, why: 'Gazebo 통신(gz-transport)은 ROS와 별개로 LAN에 퍼진다. 파티션이 같으면 남의 시뮬레이터 메시지가 섞이고, 같은 이름의 로봇을 만들려다 충돌한다.' },
      { t: 'teleop 창이 뒤에 켜져 있다', why: 'teleop은 키를 눌러야 명령을 낸다. 값이 두 위치 사이를 오가는 현상과 맞지 않는다.' },
      { t: 'ROS_DOMAIN_ID가 다른 사람과 같다', why: 'ROS 쪽 격리라 이것도 필요하지만, 스폰(create)은 Gazebo 쪽 통신이라 ROS_DOMAIN_ID로 안 막힌다.' },
    ],
    fix: `export GZ_PARTITION=<내_고유_이름>   # run_gazebo.sh — Gazebo 격리
export ROS_DOMAIN_ID=<내_번호>       # 모든 스크립트 — ROS 격리`,
    lesson: '격리는 두 겹이다: ROS는 ROS_DOMAIN_ID, Gazebo는 GZ_PARTITION.',
  },
  {
    title: '2D Pose Estimate를 찍어도 반응이 없다',
    symptom: 'Nav2 운행 중 rviz_init_pose.sh로 RViz를 띄웠다. 화면이 비어 있고, 2D Pose Estimate를 찍어도 로봇 위치가 안 잡힌다.',
    log: `$ cat rviz_init_pose.sh
ros2 launch nav2_bringup rviz_launch.py use_sim_time:=true
$ grep -A1 "'namespace'" .../nav2_bringup/launch/rviz_launch.py
    default_value='navigation',          ← 이 RViz는 /navigation/... 토픽을 쓴다
$ grep -A1 "'namespace'" .../nav2_bringup/launch/bringup_launch.py
    'namespace', default_value='', ...   ← Nav2는 빈 namespace`,
    opts: [
      { t: 'AMCL이 아직 안 켜졌다', why: 'AMCL이 꺼져 있어도 RViz 화면(지도·TF)은 보여야 한다. 화면부터 비어 있다.' },
      { t: 'RViz가 navigation namespace로 떠서 /navigation/tf, /navigation/initialpose를 쓴다', ok: true, why: 'rviz_launch.py의 namespace 기본값이 navigation이다. using_slam.sh의 Nav2는 빈 namespace라 토픽 이름이 서로 다르다. 빈 namespace는 CLI 인자로 못 넘긴다.' },
      { t: '지도 파일 경로가 틀렸다', why: '그러면 map_server가 실패해서 지도만 안 보인다. TF·로봇 모델까지 비지는 않는다.' },
      { t: 'use_sim_time이 꺼져 있다', why: 'use_sim_time:=true를 넘기고 있다.' },
    ],
    fix: `bash run_rviz.sh
# = ros2 run rviz2 rviz2 -d .../nav2_bringup/rviz/nav2_default_view.rviz \\
#     --ros-args -p use_sim_time:=true          (같은 화면, 빈 namespace)`,
    lesson: '토픽이 "있는데 안 받는다"면 ros2 topic list로 앞에 namespace가 붙었는지 본다.',
  },
];

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosLabSlam extends w.HTMLElement {
    private sec?: Sec;
    private step = 0;
    private scriptOpen = true;
    private timer?: number;
    private inc = 0;
    private solved = new Set<number>();
    private picked = new Map<number, number>();

    /** ?concept=labslam&ls=섹션 — 클릭 push·뒤로가기·딥링크 */
    @subscribeSwcAppRouteChange('/ros2', { trigger: 'connectedDone' })
    onRoute(@swcAppRouteQueryParam('concept') concept: string | null, @swcAppRouteQueryParam('ls') ls: string | null) {
      if (concept !== 'labslam') return;
      const sec: Sec = ls && ls in SECTIONS ? (ls as Sec) : 'mission';
      if (sec === this.sec) return;
      const first = this.sec === undefined;
      this.sec = sec;
      this.render2();
      if (!first) (this.shadowRoot?.querySelector('.lb-secs') as HTMLElement)?.scrollIntoView({ block: 'start' });
    }

    @swcAppRouteGo
    private goSec(sec: Sec) {
      if (sec === this.sec) return false;
      return { path: `/ros2?concept=labslam&ls=${sec}`, scrollToTop: false };
    }

    @swcAppRouteGo
    private goConcept(concept: string) {
      return { path: `/ros2?concept=${concept}`, scrollToTop: false };
    }

    private async render2() {
      const sec = this.sec!;
      this.shadowRoot?.querySelectorAll('.lb-sec').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.sec === sec));
      const body = this.shadowRoot?.querySelector('#lb-body') as HTMLElement;
      if (!body) return;
      this.stopPlay();
      if (sec === 'run') {
        markdownCancel(body);
        body.innerHTML = this.runHtml();
        this.paintStep();
        return;
      }
      if (sec === 'incident') {
        markdownCancel(body);
        body.innerHTML = this.incidentHtml();
        this.paintIncident();
        return;
      }
      await markdownParse(body, SECTIONS[sec].md!);
    }

    /* ---------- ② 실행 흐름 ---------- */
    private runHtml() {
      return `
        <h2>실행 흐름 — 스크립트 하나마다 시스템이 어떻게 바뀌나</h2>
        <p>현장에서는 "실행했다"가 아니라 <b>"확인했다"</b>로 다음 단계로 넘어갑니다. 단계를 넘기며 아래 상태표에서 무엇이 새로 생기는지, 그리고 그때 칠 확인 명령과 정상 출력을 보세요.</p>
        <div class="lb-steps">${STEPS.map((s, i) => `<button class="lb-step" data-i="${i}">${esc(s.title)}</button>`).join('')}</div>
        <div class="lb-ctl"><button class="lb-prev">◀ 이전</button><button class="lb-play">▶ 자동 재생</button><button class="lb-next">다음 ▶</button></div>
        <div class="lb-now">
          <div class="lb-title"></div>
          <div class="lb-cmdline"><code class="lb-cmd"></code><span class="lb-term"></span></div>
          <p class="lb-text"></p>
          <div class="lb-check"><div class="lb-check-h">✅ 확인 <code class="lb-check-cmd"></code></div><pre class="lb-expect"></pre></div>
          <div class="lb-warn"></div>
        </div>
        <table class="lb-vars"><thead><tr><th>시스템 상태</th><th>값</th><th>보는 법</th></tr></thead>
          <tbody>${ROWS.map((r, i) => `<tr data-r="${i}"><td>${esc(r.name)}</td><td class="lb-v"></td><td><code>${esc(r.how)}</code></td></tr>`).join('')}</tbody></table>
        <p class="lb-note">파란 칸 = 이 단계에서 바뀐 것. 출력은 실습 PC에서 찍힌 값이고(파일 이름은 그날 시각), ‘예시 값’ 표시만 설명용입니다.</p>
        <div class="lb-script"></div>
        <h3 class="lb-dict-h">📚 스크립트 사전 — 실습 폴더의 .sh 전부</h3>
        <p class="lb-note"><code>bash 파일.sh</code>만 보고는 무슨 일을 하는지 알 수 없어서, 원문을 그대로 싣고 덩어리마다 설명을 붙였습니다. <code>ros2 launch</code> 한 줄 뒤에 숨은 노드와 설정도 펼쳐 두었습니다.</p>
        ${SCRIPT_ORDER.map(g => `<div class="lb-dict-g">${esc(g.group)}</div>${g.files.map(f => scriptHtml(SCRIPTS[f], false)).join('')}`).join('')}`;
    }

    private paintStep() {
      const root = this.shadowRoot!;
      const s = STEPS[this.step];
      root.querySelectorAll('.lb-step').forEach(b => b.classList.toggle('active', Number((b as HTMLElement).dataset.i) === this.step));
      (root.querySelector('.lb-title') as HTMLElement).textContent = s.title;
      (root.querySelector('.lb-cmd') as HTMLElement).textContent = s.cmd;
      (root.querySelector('.lb-term') as HTMLElement).textContent = s.term;
      (root.querySelector('.lb-text') as HTMLElement).textContent = s.text;
      (root.querySelector('.lb-check-cmd') as HTMLElement).textContent = s.check;
      (root.querySelector('.lb-expect') as HTMLElement).textContent = s.expect;
      const warn = root.querySelector('.lb-warn') as HTMLElement;
      warn.textContent = s.warn ? `⚠️ ${s.warn} (장애 대응 훈련)` : '';
      warn.hidden = !s.warn;
      const sc = s.script ? SCRIPTS[s.script] : undefined;
      (root.querySelector('.lb-script') as HTMLElement).innerHTML = sc
        ? scriptHtml(sc, this.scriptOpen, '이 단계 스크립트')
        : '<p class="lb-note">이 단계는 스크립트 없이 로봇을 몰기만 합니다.</p>';
      root.querySelectorAll<HTMLElement>('.lb-vars tbody tr').forEach(tr => {
        const i = Number(tr.dataset.r);
        (tr.querySelector('.lb-v') as HTMLElement).textContent = s.vals[i] ?? '—';
        tr.classList.toggle('hot', s.hot.includes(i));
      });
    }

    private stopPlay() {
      if (this.timer) { w.clearInterval(this.timer); this.timer = undefined; }
      const b = this.shadowRoot?.querySelector('.lb-play');
      if (b) b.textContent = '▶ 자동 재생';
    }

    /* ---------- ③ 장애 대응 훈련 ---------- */
    private incidentHtml() {
      return `
        <h2>장애 대응 훈련 — 로그를 보고 원인 고르기</h2>
        <p>실습하면서 실제로 겪은 장애 ${INCIDENTS.length}건입니다. 증상과 로그를 읽고 원인을 고르세요. 맞히면 해결 명령과 교훈이 열립니다. 틀린 보기도 왜 아닌지 설명이 나옵니다.</p>
        <div class="lb-score"></div>
        <div class="lb-incs">${INCIDENTS.map((c, i) => `<button class="lb-inc" data-i="${i}">③-${i + 1} ${esc(c.title)}</button>`).join('')}</div>
        <div class="lb-case"></div>`;
    }

    private paintIncident() {
      const root = this.shadowRoot!;
      const c = INCIDENTS[this.inc];
      root.querySelectorAll('.lb-inc').forEach(b => {
        const i = Number((b as HTMLElement).dataset.i);
        b.classList.toggle('active', i === this.inc);
        b.classList.toggle('done', this.solved.has(i));
      });
      (root.querySelector('.lb-score') as HTMLElement).textContent = `해결 ${this.solved.size} / ${INCIDENTS.length}`;
      const pick = this.picked.get(this.inc);
      const solved = this.solved.has(this.inc);
      const opts = c.opts.map((o, j) => {
        const state = pick === undefined && !solved ? '' : o.ok && solved ? ' ok' : j === pick ? ' bad' : '';
        // 고른 보기는 바로, 해결 뒤에는 모든 보기의 "왜 아닌지"까지 보여 준다
        const why = (j === pick || solved) ? `<div class="lb-why">${esc(o.why)}</div>` : '';
        return `<button class="lb-opt${state}" data-j="${j}">${String.fromCharCode(65 + j)}. ${esc(o.t)}</button>${why}`;
      }).join('');
      (root.querySelector('.lb-case') as HTMLElement).innerHTML = `
        <div class="lb-case-title">③-${this.inc + 1} ${esc(c.title)}</div>
        <p class="lb-symptom"><b>증상</b> ${esc(c.symptom)}</p>
        <pre class="lb-log">${esc(c.log)}</pre>
        <div class="lb-q">원인은?</div>
        <div class="lb-opts">${opts}</div>
        <div class="lb-fix"${solved ? '' : ' hidden'}>
          <div class="lb-fix-h">🔧 해결</div><pre>${esc(c.fix)}</pre>
          <div class="lb-lesson">💡 ${esc(c.lesson)}</div>
          ${this.inc < INCIDENTS.length - 1 ? '<button class="lb-inc-next">다음 장애 ▶</button>' : ''}
        </div>`;
    }

    @addEventListener('.lb-sec', 'click', { delegate: true })
    onSec(e: Event) {
      const b = (e.target as HTMLElement).closest('.lb-sec') as HTMLElement;
      if (b?.dataset.sec) this.goSec(b.dataset.sec as Sec);
    }

    /** 다른 개념 탭으로 (SLAM 개념 · Cartographer · TF2 · Gazebo) */
    @addEventListener('.lb-tab', 'click', { delegate: true })
    onTab(e: Event) {
      const b = (e.target as HTMLElement).closest('.lb-tab') as HTMLElement;
      if (b?.dataset.concept) this.goConcept(b.dataset.concept);
    }

    @addEventListener('.lb-step', 'click', { delegate: true })
    onStep(e: Event) {
      const b = (e.target as HTMLElement).closest('.lb-step') as HTMLElement;
      if (!b) return;
      this.stopPlay();
      this.step = Number(b.dataset.i);
      this.paintStep();
    }

    /** 단계 스크립트를 접으면 다음 단계에서도 접힌 채로 */
    @addEventListener('.lb-sc[data-step] > summary', 'click', { delegate: true })
    onScriptToggle(e: Event) {
      const d = (e.target as HTMLElement).closest('.lb-sc') as HTMLDetailsElement;
      if (d) this.scriptOpen = !d.open;
    }

    @addEventListener('.lb-prev', 'click', { delegate: true })
    onPrev() { this.stopPlay(); this.step = (this.step + STEPS.length - 1) % STEPS.length; this.paintStep(); }

    @addEventListener('.lb-next', 'click', { delegate: true })
    onNext() { this.stopPlay(); this.step = (this.step + 1) % STEPS.length; this.paintStep(); }

    @addEventListener('.lb-play', 'click', { delegate: true })
    onPlay() {
      if (this.timer) { this.stopPlay(); return; }
      const b = this.shadowRoot?.querySelector('.lb-play');
      if (b) b.textContent = '⏸ 멈춤';
      this.timer = w.setInterval(() => { this.step = (this.step + 1) % STEPS.length; this.paintStep(); }, 3500);
    }

    @addEventListener('.lb-inc', 'click', { delegate: true })
    onInc(e: Event) {
      const b = (e.target as HTMLElement).closest('.lb-inc') as HTMLElement;
      if (!b) return;
      this.inc = Number(b.dataset.i);
      this.paintIncident();
    }

    @addEventListener('.lb-inc-next', 'click', { delegate: true })
    onIncNext() {
      this.inc = Math.min(this.inc + 1, INCIDENTS.length - 1);
      this.paintIncident();
      (this.shadowRoot?.querySelector('.lb-case') as HTMLElement)?.scrollIntoView({ block: 'nearest' });
    }

    @addEventListener('.lb-opt', 'click', { delegate: true })
    onOpt(e: Event) {
      const b = (e.target as HTMLElement).closest('.lb-opt') as HTMLElement;
      if (!b || this.solved.has(this.inc)) return;
      const j = Number(b.dataset.j);
      this.picked.set(this.inc, j);
      if (INCIDENTS[this.inc].opts[j].ok) this.solved.add(this.inc);
      this.paintIncident();
    }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; font-size:13px; color:#334155; line-height:1.75; }
          * { box-sizing:border-box; }
          .lb-intro { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:12px; }
          .lb-intro b { color:#22314e; }
          .lb-secs { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; scroll-margin-top:12px; }
          .lb-sec { padding:6px 12px; border-radius:16px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#22314e; font-size:12px; font-weight:700; cursor:pointer; }
          .lb-sec.active { background:linear-gradient(135deg,#22314e,#7dd3fc); color:#fff; border-color:transparent; }
          #lb-body { background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; margin-top:10px; overflow-wrap:anywhere; }
          #lb-body h2 { font-size:16px; font-weight:800; color:#1e293b; margin:4px 0 8px; padding-bottom:4px; border-bottom:2px solid #e0f2fe; }
          #lb-body h3 { font-size:14px; font-weight:800; color:#22314e; margin:18px 0 6px; }
          #lb-body p { margin:6px 0; }
          #lb-body ul, #lb-body ol { padding-left:20px; margin:6px 0; }
          #lb-body code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          #lb-body pre { background:#0f172a; color:#e2e8f0; border-radius:8px; padding:10px 12px; overflow-x:auto; font-size:12px; line-height:1.55; white-space:pre; }
          #lb-body pre code { background:none; padding:0; color:inherit; }
          #lb-body pre.mermaid { background:#fff; color:#1e293b; border:1px solid #e2e8f0; text-align:center; overflow-wrap:normal; white-space:normal; line-height:normal; font-size:16px; }
          #lb-body pre.mermaid p { margin:0; }
          #lb-body pre.mermaid svg { max-width:100%; height:auto; }
          #lb-body blockquote { margin:10px 0; padding:8px 12px; background:#fff7ed; border-left:4px solid #f59e0b; border-radius:0 6px 6px 0; color:#7c2d12; }
          #lb-body blockquote p { margin:0; }
          #lb-body table { display:block; overflow-x:auto; border-collapse:collapse; margin:8px 0; font-size:12px; max-width:100%; }
          #lb-body th, #lb-body td { border:1px solid #e2e8f0; padding:5px 8px; text-align:left; vertical-align:top; }
          #lb-body th { background:#f0f9ff; color:#22314e; white-space:nowrap; }
          .lb-tab { margin:2px 4px 2px 0; padding:6px 14px; border-radius:16px; border:1.5px solid #3b82c4; background:#eff6ff; color:#1e3a8a; font:inherit; font-size:12.5px; font-weight:800; cursor:pointer; }
          .lb-tab:hover { background:#dbeafe; }
          /* ② 실행 흐름 */
          .lb-steps { display:flex; flex-wrap:wrap; gap:5px; margin:10px 0 6px; }
          .lb-step { padding:4px 10px; border-radius:14px; border:1.5px solid #cbd5e1; background:#fff; color:#334155; font:inherit; font-size:12px; font-weight:700; cursor:pointer; }
          .lb-step.active { background:#22314e; color:#fff; border-color:#22314e; }
          .lb-ctl { display:flex; gap:6px; margin:4px 0 10px; }
          .lb-ctl button { padding:5px 12px; border-radius:14px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#1e3a8a; font:inherit; font-size:12px; font-weight:800; cursor:pointer; }
          .lb-now { background:#f8fafc; border:1px solid #e2e8f0; border-left:5px solid #3b82c4; border-radius:8px; padding:10px 14px; }
          .lb-title { font-size:15px; font-weight:800; color:#1e293b; }
          .lb-cmdline { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-top:4px; }
          .lb-cmd { background:#0f172a !important; color:#a7f3d0; padding:3px 10px !important; border-radius:6px; font-size:12.5px !important; }
          .lb-term { font-size:12px; color:#0369a1; font-weight:700; }
          .lb-check { margin-top:6px; }
          .lb-check-h { font-size:12px; font-weight:800; color:#166534; }
          .lb-check pre { margin:4px 0 0; }
          .lb-warn { margin-top:8px; padding:4px 10px; border-radius:8px; background:#fff7ed; border:1px solid #fdba74; color:#9a3412; font-size:12px; font-weight:700; }
          .lb-vars { margin-top:10px !important; display:table !important; width:100%; }
          .lb-vars tr.hot td { background:#dbeafe; transition:background .3s; }
          .lb-vars tr.hot .lb-v { font-weight:800; color:#1e3a8a; }
          .lb-v { font-family:ui-monospace,monospace; white-space:nowrap; }
          .lb-note { font-size:12px; color:#64748b; }
          .lb-sc { margin:10px 0; border:1px solid #e2e8f0; border-left:5px solid #7e22ce; border-radius:8px; background:#fff; }
          .lb-sc > summary { cursor:pointer; padding:7px 12px; font-weight:800; color:#3b0764; background:#faf5ff; border-radius:0 8px 8px 0; list-style-position:inside; }
          .lb-sc[open] > summary { border-bottom:1px solid #e9d5ff; border-radius:0 8px 0 0; }
          .lb-sc > summary code { background:#f3e8ff !important; color:#3b0764; font-size:12.5px !important; }
          .lb-sc-sum { font-weight:600; color:#475569; font-size:12px; }
          .lb-sc-tag { display:inline-block; margin-right:6px; padding:0 8px; border-radius:10px; background:#7e22ce; color:#fff; font-size:11px; }
          .lb-sc-rows { padding:8px 10px; display:flex; flex-direction:column; gap:8px; }
          .lb-sc-row { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(0,1fr); gap:10px; align-items:start; }
          #lb-body pre.lb-sc-code { margin:0; font-size:11.5px; }
          .lb-c { color:#94a3b8; }
          .lb-sc-note { font-size:12.5px; color:#334155; padding:4px 0 4px 10px; border-left:3px solid #e9d5ff; }
          .lb-sc-launch { margin:0 10px 10px; padding:8px 12px; border:1px dashed #a78bfa; border-radius:8px; background:#fcfaff; }
          .lb-sc-lh { font-weight:800; color:#3b0764; }
          .lb-sc-file { font-weight:600; font-size:11.5px; color:#64748b; font-family:ui-monospace,monospace; }
          .lb-sc-launch ul { margin:6px 0; }
          .lb-sc-launch li { margin:3px 0; }
          #lb-body .lb-sc-t th { background:#f3e8ff; color:#3b0764; }
          #lb-body .lb-sc-t td:nth-child(2) { white-space:nowrap; overflow-wrap:normal; }
          .lb-dict-h { margin-top:24px !important; padding-top:12px; border-top:2px solid #e0f2fe; }
          .lb-dict-g { margin:14px 0 4px; font-size:12px; font-weight:800; color:#0369a1; }
          /* ③ 장애 대응 훈련 */
          .lb-score { display:inline-block; margin:4px 0; padding:2px 12px; border-radius:12px; background:#dcfce7; color:#166534; font-weight:800; font-size:12px; }
          .lb-incs { display:flex; flex-wrap:wrap; gap:5px; margin:6px 0 10px; }
          .lb-inc { padding:4px 10px; border-radius:14px; border:1.5px solid #cbd5e1; background:#fff; color:#334155; font:inherit; font-size:12px; font-weight:700; cursor:pointer; text-align:left; }
          .lb-inc.done { border-color:#22c55e; background:#f0fdf4; }
          .lb-inc.done::after { content:' ✓'; color:#16a34a; }
          .lb-inc.active { background:#22314e; color:#fff; border-color:#22314e; }
          .lb-case { background:#f8fafc; border:1px solid #e2e8f0; border-left:5px solid #ef4444; border-radius:8px; padding:10px 14px; }
          .lb-case-title { font-size:15px; font-weight:800; color:#1e293b; }
          .lb-symptom { margin:4px 0 6px !important; }
          .lb-log { margin:6px 0; }
          .lb-q { font-weight:800; color:#22314e; margin-top:8px; }
          .lb-opts { display:flex; flex-direction:column; gap:5px; margin-top:4px; }
          .lb-opt { text-align:left; padding:7px 12px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; color:#1e293b; font:inherit; font-size:12.5px; font-weight:600; cursor:pointer; }
          .lb-opt:hover { border-color:#3b82c4; }
          .lb-opt.ok { border-color:#22c55e; background:#f0fdf4; color:#14532d; font-weight:800; }
          .lb-opt.bad { border-color:#f87171; background:#fef2f2; color:#7f1d1d; }
          .lb-why { font-size:12px; color:#475569; padding:2px 12px 6px; border-left:3px solid #cbd5e1; margin-left:8px; }
          .lb-fix { margin-top:10px; padding-top:8px; border-top:1px dashed #cbd5e1; }
          .lb-fix-h { font-weight:800; color:#166534; }
          .lb-lesson { margin-top:6px; padding:6px 10px; background:#fefce8; border:1px solid #fde047; border-radius:8px; color:#713f12; font-weight:600; }
          .lb-inc-next { margin-top:8px; padding:5px 12px; border-radius:14px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#1e3a8a; font:inherit; font-size:12px; font-weight:800; cursor:pointer; }
          [hidden] { display:none !important; }
          @media(max-width:600px){ #lb-body { padding:10px; } .lb-sc-row { grid-template-columns:minmax(0,1fr); } .lb-vars td:nth-child(3), .lb-vars th:nth-child(3) { display:none; } }
        </style>

        <div class="lb-intro">
          <b>현업 실습 — SLAM</b>: TurtleBot3 Waffle을 처음 보는 미로에 넣고 <b>지도 만들기(Cartographer) → 저장 → 이어서 매핑 → Nav2 운행</b>까지 실제 스크립트로 돌린 기록입니다.
          ROS 2 Lyrical · Gazebo(gz sim 10) · 워크스페이스 <code>waffle-lyrical-slam</code> 기준. 개념은 <b>맵핑·위치추정</b> 탭, 여기서는 <b>절차와 확인, 장애 대응</b>을 다룹니다.
        </div>
        <div class="lb-secs">${ORDER.map(k => `<button class="lb-sec" data-sec="${k}">${SECTIONS[k].label}</button>`).join('')}</div>
        <div id="lb-body"></div>
      `;
    }
  }

  return tagName;
};
