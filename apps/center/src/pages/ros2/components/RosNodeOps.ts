import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow, subscribeSwcAppRouteChange, swcAppRouteGo, swcAppRouteQueryParam } from '@dooboostore/simple-web-component';
import { markdownParse } from '@center-src/utils/markdown';

const tagName = 'center-ros2-nodeops';

// 노드동작 — "맵핑 → 위치추정 → 네비게이션" 이 노드들 사이에서 실제로 어떻게 흘러가는가.
// cuVSLAM+nvblox 는 beebot 실기 확인 내용. 나머지는 이 로봇에서 돌리지 않은 일반 설명(라벨로 구분).
type Tab = 'overview' | 'cunv' | 'rtabmap' | 'carto' | 'slamtb' | 'ros2control';

const F = '```';

// 맨 위 메뉴: 서브메뉴 묶음. 'slam' 은 가운데 메뉴(스택)와 아래 메뉴(단계)를 가진다
const TOPS: { id: 'slam' | 'ros2control'; label: string }[] = [
  { id: 'slam', label: '맵핑 → 위치추정 → 네비게이션' },
  { id: 'ros2control', label: 'ros2_control(controller_manager)' },
];
const SLAM_TABS = (Object.keys({ overview: 0, cunv: 0, rtabmap: 0, carto: 0, slamtb: 0 })) as Tab[];

// ros2control 은 md 가 없다 — 기존 center-ros2-control 컴포넌트를 그대로 꽂는다
const TABS: Record<Tab, { label: string; md: string }> = {
  overview: {
    label: '개요',
    md: `**지도 기반 자율주행은 3단계다: ① 맵핑(지도 만들기) → ② 위치추정(지도 안에서 내 자리) → ③ 네비게이션(목표까지 경로·주행).** 스택마다 *누가 지도를 만들고, 누가 위치를 알려 주고, 플래너가 어떤 지도를 보는지*가 다르다.
${F}mermaid
flowchart LR
    S[센서<br/>카메라 · LiDAR] --> M[① 맵핑<br/>지도 + 위치를 동시에]
    M -->|저장| MAP[(지도 파일)]
    MAP --> L[② 위치추정<br/>지도 안 내 자리 = map→odom]
    S --> L
    L --> N[③ 네비게이션<br/>Nav2 플래너·컨트롤러]
    MAP --> N
    N -->|cmd_vel| R[바퀴]
${F}
**탭 읽는 법 — 이 로봇에서의 상태**

| 스택 | 이 로봇(beebot)에서 | 이 탭의 근거 |
|---|---|---|
| cuVSLAM + nvblox | ✅ **현재 사용 중** | 코드 · 실측으로 확인 |
| RTAB-Map | 🟡 예전에 사용, 교체됨 | 일반 설명 (이 스택으로는 지금 안 돎) |
| Cartographer | ⚪ 사용 안 함 (2D LiDAR 필요, 이 로봇엔 없음) | 일반 설명 — **이 로봇에서 시험 안 함** |
| slam_toolbox | ⚪ 사용 안 함 (2D LiDAR 필요) | 일반 설명 — **이 로봇에서 시험 안 함** |

**공통으로 알아 둘 점**
- **TF 약속:** \`map→odom\` 은 위치추정(SLAM)이, \`odom→base_footprint\` 는 EKF(바퀴·IMU)가 낸다. 둘을 곱하면 지도 안 로봇 자리.
- **"지도"는 두 종류다.** 플래너가 보는 2D 점유 격자(\`/map\`)와, 위치추정이 쓰는 특징점·3D 지도. 스택에 따라 한 노드가 둘 다 만들기도(RTAB-Map · Cartographer · slam_toolbox), 따로 만들기도(cuVSLAM+nvblox) 한다.
- **ros2_control(controller_manager)** 서브메뉴는 바퀴·팔 제어 층 설명 — 지도와 별개 (예전 ros2_control 탭을 옮김).
- 비교·장단점은 **SLAM 구성 비교** 탭, 방법별 표는 **위치추정** 탭, slam_toolbox 실습은 **맵핑·위치추정** 탭.`,
  },

  cunv: {
    label: 'cuVSLAM + nvblox ✅',
    md: `**✅ 이 로봇이 지금 쓰는 구성 (실기 확인).** 일이 **둘로 쪼개져 있다** — *cuVSLAM = 위치*, *nvblox = 지도*. 서로 직접 지도를 주고받지 않고 **TF(\`map→카메라\`)** 로만 만난다.
${F}mermaid
flowchart TD
    CAM[RealSense<br/>컬러 + 깊이] --> CV[📦 cuVSLAM<br/>위치]
    CAM --> NV[📦 nvblox<br/>3D 복셀 → 2D 격자]
    CV -->|"TF map→odom"| NV
    CV -->|"TF"| NAV[📦 Nav2]
    NV -->|"/map"| NAV
    NV -.->|"ESDF"| CTRL[🛠️ rl_nav_controller]
    NAV --> CTRL
${F}

### ① 맵핑 — 처음 온 방을 돌아다니며 지도를 그리는 일
**먼저 용어 세 개**
- **노드** = 일 하나를 맡은 프로그램 · **토픽** = 노드끼리 메시지를 주고받는 게시판 · **TF** = "A 좌표계 기준으로 B가 어디 있나"를 알리는 값 (\`map→odom\` = 지도 기준으로 로봇이 어디쯤인가)
- **맵핑** = 사람이 로봇을 직접 몰아 방을 돌면서, 로봇이 ① **내 위치를 계산**하고 ② **그 위치에서 본 벽·물건을 지도에 그려 넣는** 것. 위치 계산은 **cuVSLAM**, 그림 그리기는 **nvblox**가 맡는다.

${F}mermaid
flowchart TD
    H[🧑 사람<br/>TUI 지도 모드 → MAPPING] -->|"토픽 /cmd/map_mode = MAPPING"| SM[🛠️ state_manager]
    SM -->|"1. 스택 전체 종료<br/>2. 같은 launch를 map:=slam 으로 다시 실행"| L[bringup.launch]
    L -->|"새 폴더 이름 · 모드 인자 정함"| N[노드들이 새로 뜸]
    subgraph N[맵핑 중 도는 노드]
        CV[📦 cuVSLAM<br/>내 위치]
        NV[📦 nvblox<br/>지도 그리기]
        NM[🛠️ nvblox_map<br/>/map 으로 내보내기]
    end
${F}

**1단계 — 사람이 "맵핑 시작"을 누른다**
- TUI에서 지도 모드를 MAPPING으로 고르면 (명령으로는 \`run-cli map mode mapping\`) CLI가 토픽 **\`/cmd/map_mode\`** 에 문자열 \`MAPPING\` 을 보낸다.
- 받는 노드는 **\`state_manager\`** (manager 패키지) 하나다. CLI가 cuVSLAM이나 nvblox에게 직접 켜라고 하지 않는다.

**2단계 — state_manager가 스택 전체를 다시 띄운다**
- cuVSLAM·nvblox는 **실행 중에 모드를 바꾸는 기능이 없다.** 그래서 노드 하나만 바꾸지 않고, state_manager가 자기를 띄운 \`ros2 launch\` 를 \`/proc\` 에서 찾아 **전부 껐다가** 같은 명령줄에 **\`map:=slam operation:=MANUAL\`** 만 바꿔서 **다시 실행**한다.
- 순서: ① 전체 종료(SIGINT, 최대 25초 기다리고 남으면 강제 종료) → ② Fast DDS 공유메모리 찌꺼기 삭제 → ③ 인자를 바꿔 다시 실행.
- 그래서 **수십 초가 걸리고, 그동안 TUI 연결이 끊겼다 돌아온다.** state_manager 자신도 같이 꺼졌다 다시 뜬다.

**3단계 — launch가 \`map:=slam\` 을 풀어서 각 노드에 나눠 준다** (\`bringup.launch.py setup_map\`)

| 정해지는 것 | 맵핑(\`slam\`)일 때 값 |
|---|---|
| 지도 폴더 | **새 폴더 \`<map_dir>/<날짜_시각>/\`** (\`map_name:=\` 로 이름 지정 가능). **이미 있는 이름이면 거부** — 덮어쓰지 않는다 |
| SLAM 켜기 / 위치추정 여부 | \`use_slam=true\` · \`localization=false\` |
| nvblox에게 | \`after_shutdown_map_save_path\` = \`<폴더>/nvblox.nvblx\` (**끌 때 여기에 저장**) |
| nvblox_map에게 | \`load_path\` = 비어 있음 (**불러올 지도 없음**) |
| 조작 방식 | \`MANUAL\` — 사람이 몬다. 충돌감시(collision_monitor)도 꺼진다 |
| 인지(perception) | \`auto\` → 매핑이면 **끔** (부하 줄이려고) |

**4단계 — 새로 뜨는 SLAM 노드와 맡은 일**

| 노드 | 하는 일 |
|---|---|
| \`cuvslam_slam\` | pole_front_cam 컬러+깊이로 내 위치 계산 → TF \`map→odom\` 발행. **출발한 자리가 지도의 원점(0,0)** |
| \`pole_depth_gate\` (+ \`gripper_depth_gate\`) | nvblox에 줄 깊이 영상에서 카메라 0.5 m 안(자기 팔·폴대)을 지움 |
| \`nvblox_node\` | 깊이 영상 + TF를 받아 3D 복셀(0.05 m) 지도를 쌓고, 높이 0.08~0.3 m로 잘라 2D 격자를 만듦 |
| \`nvblox_map\` | 그 2D 격자를 **\`/map\`** 으로 다시 내보냄 (1 Hz, 새 격자가 올 때만) |
| \`map_saver\` | 나중에 \`/map\` 을 그림 파일(\`map.pgm\`)로 저장하는 서버 |

**5단계 — 사람이 몰고 다니는 동안 (매 순간 반복)**
${F}mermaid
flowchart TD
    CAM["📷 realsense2_camera<br/>(pole_front_cam)"] -->|"✉️ /pole_front_cam/color/image_raw<br/>✉️ /pole_front_cam/aligned_depth_to_color/image_raw<br/>약 15프레임/초 · 🔄 동적"| CV["📦 cuvslam_slam<br/>내 위치 계산"]
    CAM -->|"✉️ …/aligned_depth_to_color/image_raw<br/>🔄 동적"| PG["🛠️ pole_depth_gate<br/>0.5 m 안(자기 몸) 지움"]
    PG -->|"✉️ …/aligned_depth_to_color/image_nvblox<br/>SENSOR_DATA QoS · 쌓는 속도 15 Hz · 🔄 동적"| NV["📦 nvblox_node<br/>3D 복셀 → 2D 격자"]
    CV -->|"🔗 TF map→odom<br/>약 10 Hz · 0.5 s 미래 시각 · 🔄 동적<br/>(nvblox · Nav2 노드들이 조회)"| NV
    NV -->|"✉️ /nvblox_node/static_occupancy_grid<br/>best effort · 실측 약 4.8번/초 · 🔄 동적"| NM["🛠️ nvblox_map<br/>QoS 맞춰 다시 내기"]
    NM -->|"✉️ /map<br/>latched = reliable + transient_local<br/>1 Hz · 새 격자일 때만 · 🔄 동적"| SL
    NM -.->|"✉️ /map"| VIEW["RViz · TUI · map_saver"]
    subgraph GC["📦 global_costmap 노드 (planner_server 안)"]
        SL["static_layer<br/>/map을 칸마다 복사"] --> IL["inflation_layer<br/>벽 주변 0.18 m 팽창"]
    end
    IL -->|"✉️ /global_costmap/costmap<br/>1 Hz(실측 0.6~0.65) · 🔄 동적"| VIEW
    IL -.->|"같은 프로세스 안에서 직접 읽음"| PL["📦 NavfnPlanner<br/>전역 경로 ✉️ /plan"]
    NV -->|"✉️ /nvblox_node/combined_esdf_pointcloud<br/>🔄 동적"| CT["🛠️ rl_nav_controller"]
    PL --> CT
${F}
**범례:** ✉️ 토픽 · 🔗 TF · 🔄 동적(계속 바뀜) · 점선 = 토픽이 아니거나 보조 경로. **지도 경로(카메라 → /map → 코스트맵)의 모든 구간이 동적**이다.
- 위치가 틀리면 지도도 틀어진다 — nvblox는 cuVSLAM이 알려 준 위치를 믿고 그 자리에 깊이를 쌓기 때문이다.
- 처음엔 전부 **모름(-1)** 이고, 돌아다닐수록 모름 칸이 **자유(0)** 나 **벽(100)** 으로 채워진다.

**지도 데이터가 지나가는 길 — 어떤 토픽을 · 어떤 노드가 보내고 · 어떤 노드가 받나 · 정적인가 동적인가**

| # | 토픽 / TF | 보내는 노드 | 받는 노드 | 방식 · 주기 | 정적/동적 |
|---|---|---|---|---|---|
| 1 | \`/pole_front_cam/color/image_raw\` · \`/pole_front_cam/aligned_depth_to_color/image_raw\` · \`camera_info\` | realsense2_camera (pole_front_cam) | \`cuvslam_slam\` (깊이는 \`pole_depth_gate\` 도) | 컬러·깊이 약 15프레임/초 | **동적** — 매 프레임 |
| 2 | \`/pole_front_cam/aligned_depth_to_color/image_nvblox\` (그립퍼는 \`/gripper_cam/…/image_nvblox\`) | \`pole_depth_gate\` (\`gripper_depth_gate\`) | \`nvblox_node\` (\`camera_0/depth/image\` 로 리맵) | SENSOR_DATA QoS · 쌓는 속도 15 Hz(\`integrate_depth_rate_hz\`) | **동적** |
| 3 | **TF \`map→odom\`** | \`cuvslam_slam\` | \`nvblox_node\` · Nav2 노드들(코스트맵·플래너·컨트롤러가 TF 조회) | 약 10 Hz, 0.5 s 미래 시각 | **동적** — 로봇이 움직이면 계속 바뀜 |
| 4 | \`/nvblox_node/static_occupancy_grid\` | \`nvblox_node\` | \`nvblox_map\` | best effort(SENSOR_DATA) · 실측 초당 약 4.8번 | **동적** — 깊이가 쌓일수록 내용이 바뀜 |
| 5 | **\`/map\`** | \`nvblox_map\` | \`global_costmap\`(static_layer) · \`map_saver\`(저장 요청 때) · RViz · TUI | **latched**(reliable + transient_local, 깊이 1) · 1 Hz · **새 격자가 왔을 때만** | **동적** — 맵핑 중엔 자라남 |
| 6 | \`/global_costmap/costmap\` | \`global_costmap\` 노드 (planner_server 안) | RViz · TUI. **플래너는 같은 프로세스 안에서 직접** 읽음 (토픽 아님 — Nav2 표준 구조) | 설정 1 Hz · 실측 초당 0.6~0.65 | **동적** — \`/map\` 이 바뀌면 따라 바뀜 |

- 4→5 단계: \`nvblox_map\` 이 마지막 격자를 들고 있다가 **1초마다, 새 격자가 왔을 때만** \`/map\` 으로 다시 낸다. **latched(transient_local)** 로 내는 이유는 Nav2 \`static_layer\` 가 나중에 켜져도 마지막 지도를 바로 받게 하려는 것이다.
- \`nvblox_node\` 의 출력은 보통 토픽(best effort)이라 \`/map\` 으로 직접 못 쓴다 — 그래서 중간에 \`nvblox_map\` 이 QoS를 맞춰 다시 낸다.

**6단계 — 끝내고 저장**
- **TUI 지도 저장(4→6):** \`map_saver\`(그림 \`map.pgm/yaml\`) → \`nvblox/save_map\`(3D 정본 \`nvblox.nvblx\`) 순서로 **둘 다** 저장 → 폴더 하나가 지도 한 벌.
- **스택을 끄거나 모드를 바꿀 때:** nvblox가 3단계에서 받은 경로로 \`nvblox.nvblx\` 를 자동 저장한다.
- ⚠ **cuVSLAM은 자기 지도를 저장하지 않는다.** 저장되는 건 nvblox 쪽뿐이다.
- 이 흐름은 코드(\`state_manager.cpp\` · \`bringup.launch.py\` · \`ros_system.launch.py\`)를 읽어 정리한 것이다. 시작부터 저장까지를 실기에서 시간 재며 확인한 것은 아니다.

### ② 지도 불러오기 → 위치추정 — 그려 둔 지도를 펴 놓고 "나 지금 어디?"를 계속 알아내는 일
- **위치추정(localization)** = 이미 있는 지도 위에서 로봇이 자기 자리를 계속 알아내는 것. 맵핑이 "그리면서 위치 계산"이라면, 위치추정은 "**그려 둔 지도를 불러오고 위치만** 계산"이다.
- ⚠ **이 로봇은 지도를 보고 자기 자리를 스스로 찾지 못한다.** 지도는 nvblox가 불러오지만, 위치를 계산하는 cuVSLAM은 그 지도를 모르고 **출발한 자리를 (0,0)으로 새로 시작**한다. 그래서 **저장할 때와 같은 자리·같은 방향에 로봇을 놓고 시작**해야 지도와 맞는다 (아래 5단계).

${F}mermaid
flowchart TD
    H["🧑 사람<br/>TUI에서 저장된 지도 고르기"] -->|"✉️ /cmd/map_name = 이름<br/>(CLI가 한 번 보냄)"| SM["🛠️ state_manager"]
    SM -->|"nvblox.nvblx 있나 확인 → 스택 전체 종료<br/>→ map:=saved map_name:=이름 operation:=AUTO 로 다시 실행"| L["bringup.launch"]
    L -->|"파라미터 load_path = 폴더/nvblox.nvblx<br/>(nvblox_node에는 저장 경로 없음)"| NM["🛠️ nvblox_map"]
    NM -->|"🔧 서비스 /nvblox_node/load_map<br/>(없으면 최대 60초 기다림)"| NV["📦 nvblox_node<br/>저장된 3D 지도를 초기값으로 가짐"]
    CV["📦 cuvslam_slam<br/>지도 안 불러옴 · 출발 자리 = (0,0)"] -.->|"🔗 TF map→odom · 약 10 Hz · 🔄 동적"| NV
    NV -->|"✉️ /nvblox_node/static_occupancy_grid<br/>best effort · 약 4.8번/초 · 🔄 동적"| NM2["🛠️ nvblox_map"]
    NM2 -->|"✉️ /map · latched · 1 Hz · 새 격자일 때만 · 🔄 동적"| SL["📦 global_costmap<br/>static_layer"]
${F}

**1단계 — 사람이 불러올 지도를 고른다**
- TUI 지도 목록에서 고르면 (명령으로는 \`run-cli map switch <이름>\`) CLI가 토픽 **\`/cmd/map_name\`** 에 지도 이름을 보낸다. 받는 노드는 맵핑 때와 같은 **\`state_manager\`** 다.
- 저장 직후 "LOCALIZATION으로 전환할까요?"에 예 하면 같은 길로 간다 (방금 저장한 이름으로). 이름 없이 모드만 바꾸면(\`/cmd/map_mode = LOCALIZATION\`) *지금 작업 폴더*를 쓴다.
- 지도 목록에 뜨는 건 **\`nvblox.nvblx\` 파일이 있는 폴더**뿐이다.

**2단계 — state_manager가 확인하고 스택 전체를 다시 띄운다**
- 거절하는 경우: 지도 폴더 설정을 모름 · 이름이 비었거나 \`/\` 가 들어 있음 · **\`<map_dir>/<이름>/nvblox.nvblx\` 가 없음**. 이미 그 지도로 위치추정 중이면 아무것도 안 한다.
- 통과하면 맵핑 때처럼 launch를 전부 껐다가 **\`map:=saved map_name:=<이름> operation:=AUTO\`** 로 다시 실행한다 (수십 초, TUI 연결이 잠깐 끊김). 이번엔 **AUTO** — 바로 자율주행이 가능한 상태다.

**3단계 — launch가 \`map:=saved\` 를 풀어서 나눠 준다**

| 정해지는 것 | 위치추정(\`saved\`)일 때 값 |
|---|---|
| 불러올 지도 | \`<map_dir>/<이름>/nvblox.nvblx\`. 이름을 안 주면 \`default\` 폴더, 그것도 없으면 **가장 최근 폴더** |
| 지도가 없을 때 | 경고만 내고 **NONE(지도 없음)** 으로 시작 — 나머지 노드는 뜬다 |
| nvblox에게 | **저장 경로 없음** (불러온 지도를 덮어쓰지 않으려고) |
| nvblox_map에게 | \`load_path\` = 불러올 파일 경로 |
| 조작 방식 | \`AUTO\` · Nav2 켜짐 · 충돌감시 켜짐 · 인지(perception) 켜짐 |

**4단계 — 노드들이 뜨면서 지도를 불러온다**
- 뜨는 노드는 맵핑 때와 같다 (cuVSLAM · depth gate · nvblox_node · nvblox_map · map_saver). **다른 점은 위 표의 두 줄뿐**이다.
- \`nvblox_map\` 이 시작하자마자 서비스 **\`/nvblox_node/load_map\`** 을 불러 \`nvblox.nvblx\` 를 읽게 한다. 서비스가 아직 안 떠 있으면 **최대 60초** 기다리고, 끝내 못 만나면 "**빈 지도로 시작**"이라는 오류 로그를 남긴다. 결과 로그: \`지도 불러오기 …: 성공\` 또는 \`실패 — 빈 지도로 시작\`.
- 불러온 지도는 nvblox 메모리에 **초기값**으로 들어간다. 그 뒤 길은 맵핑 때와 똑같다 — **\`nvblox_node\` → 토픽 \`/nvblox_node/static_occupancy_grid\` → \`nvblox_map\` → 토픽 \`/map\`(latched, 1 Hz) → Nav2 \`global_costmap\` 의 \`static_layer\`** (①의 표 4~6행). 다른 건 *새로 그린 지도냐, 불러온 지도냐* 뿐이다.
- **정적일까 동적일까?** 불러온 순간의 \`/map\` 은 저장된 모습이지만, **그 뒤로 고정되지 않는다** — 새 깊이가 쌓이면 \`/map\` 이 다시 나간다 (6단계, ③ 참고).

**5단계 — 위치 맞추기 (이 로봇의 핵심 약속)**
- cuVSLAM은 **지도를 불러오지 않는다.** 켜질 때의 자리를 (0,0)으로 잡고, 영상으로 계산한 이동량을 **더해 갈 뿐**이다. 지도의 (0,0)은 *저장할 때 출발한 자리*다.
- 그래서 **같은 자리·같은 방향에 놓고 시작**해야 한다. 어긋나면 RViz **2D Pose Estimate**(\`/initialpose\`) 나 TUI(4→8 위치 지정)로 사람이 맞춘다. 이 보정은 **메모리에만** 있어서 스택을 다시 띄우면 사라진다.
- 오차는 시간이 갈수록 쌓인다 (루프 클로저는 한 번 실행 안에서만).

**6단계 — 위치추정 중에 계속 일어나는 일**
- ⚠ nvblox는 위치추정 중에도 새 깊이를 **계속 지도에 쌓는다** (멈추는 설정이 없음). 저장 지도는 "고정된 정답"이 아니라 **시작할 때 한 번 불러오는 초기값**이다. 실측: 40초 동안 \`/map\` 41개 중 17~21개가 달랐다.
- 끌 때 저장은 하지 않는다 (3단계 — 저장 경로 없음). 그래서 디스크의 지도는 그대로이고 **메모리의 지도만** 바뀐다.

**확인하는 법**
${F}bash
ros2 topic echo /state/map_mode --once       # LOCALIZATION 인지
ros2 topic echo /state/map_name --once       # 불러온 지도 이름
sed 's/\\x1b\\[[0-9;]*m//g' /tmp/bringup.log | grep -a '지도 불러오기'   # 성공 / 실패
ros2 run tf2_ros tf2_echo map odom           # cuVSLAM 위치가 나오나
${F}
- 이 흐름은 코드(\`state_manager.cpp\` · \`bringup.launch.py\` · \`nvblox_map.py\`)를 읽어 정리했다. 불러오기 시간·성공 로그를 실기에서 재 본 것은 아니다.

### ③ 네비게이션 — 목표를 주면 지도를 보고 길을 찾아 간다
**플래너가 보는 지도는 \`/map\` 이 아니라 "전역 코스트맵"이다.** \`/map\` 이 코스트맵이 되는 길:

${F}mermaid
flowchart TD
    M["🛠️ nvblox_map"] -->|"✉️ /map · latched(reliable + transient_local)<br/>1 Hz · 새 격자일 때만 · 🔄 동적<br/>(구독: map_topic 기본값 /map, transient_local)"| SL
    subgraph GC["📦 global_costmap 노드 — planner_server 안 (update 1 Hz)"]
        SL["static_layer<br/>새 /map마다 칸 복사"] --> IL["inflation_layer<br/>벽 주변 0.18 m 팽창"]
    end
    IL -->|"✉️ /global_costmap/costmap<br/>1 Hz(실측 0.6~0.65) · 🔄 동적"| VIEW["RViz · TUI"]
    IL -.->|"같은 프로세스 안에서 직접 읽음"| PL["📦 NavfnPlanner<br/>전역 경로 ✉️ /plan"]
    PL --> CT["🛠️ rl_nav_controller<br/>(ONNX · CUDA)"]
    BF["🛠️ body_filter"] -->|"✉️ /pole_front_cam/depth/color/points_filtered<br/>자기 몸 뺀 점구름 · 🔄 동적"| LC["📦 local_costmap<br/>voxel_layer + inflation<br/>3×3 m · odom 프레임 · 5 Hz"]
    LC -->|"✉️ /local_costmap/costmap<br/>publish 2 Hz · 🔄 동적"| CT
    NV["📦 nvblox_node"] -->|"✉️ /nvblox_node/combined_esdf_pointcloud<br/>🔄 동적"| CT
    CT -->|"✉️ /cmd_vel_nav → twist_mux → velocity_smoother → collision_monitor"| W["바퀴 ✉️ /cmd_vel"]
${F}

**단계별로 — 누가, 어떤 토픽을, 어떻게**
1. **\`global_costmap\` 노드의 \`static_layer\`** 가 토픽 \`/map\` 을 구독한다 (토픽 이름은 설정에 안 적은 **기본값 \`/map\`**, \`map_subscribe_transient_local: true\` 라서 늦게 켜져도 마지막 지도를 받음).
2. **새 \`/map\` 이 올 때마다** 그 칸 값을 자기 층에 복사한다 (Nav2 표준 동작: 지도 크기가 바뀌면 코스트맵 크기도 다시 맞춘다 — 이 로봇에서 따로 확인하진 않음). 값: 모름 \`-1\` · 자유 \`0\` · 벽 \`100\`.
3. **\`inflation_layer\`** 가 벽 주변을 0.18 m(로봇 반경 0.16 m + 2 cm) 부풀려 "로봇 중심이 지나가면 안 되는 구역"을 만든다.
4. 두 층을 합쳐 **1 Hz로 \`/global_costmap/costmap\`** 을 낸다. (\`obstacle_layer\` 설정은 파일에 있지만 plugins 목록(\`["static_layer","inflation_layer"]\`)에 없어서 **꺼져 있다**.)
5. **플래너 NavfnPlanner**(\`A*\`) 가 이 코스트맵으로 시작점→목표 경로를 찾는다 (\`allow_unknown: true\` 라서 모름 칸도 지날 수 있음). 결과는 토픽 \`/plan\`.
6. **컨트롤러 \`rl_nav_controller\`** (ONNX, CUDA)가 그 경로를 따라가며 **다른 지도**를 본다: \`/local_costmap/costmap\`(로봇을 따라다니는 3×3 m, \`odom\` 프레임, 5 Hz — \`/pole_front_cam/depth/color/points_filtered\` 점구름의 \`voxel_layer\` + 팽창) 와 nvblox의 \`/nvblox_node/combined_esdf_pointcloud\`. **로컬 코스트맵은 \`/map\` 을 쓰지 않는다.**
7. 속도 명령은 \`/cmd_vel_nav\` → \`twist_mux\` → \`velocity_smoother\` → \`collision_monitor\` → \`/cmd_vel\` 로 나간다. 수동(MANUAL)·맵핑 중엔 collision_monitor를 끈다.

**정적일까, 동적일까?** — Nav2 일반 구성과 이 로봇은 다르다.

| | Nav2 일반 구성 | 이 로봇 (cuVSLAM+nvblox) |
|---|---|---|
| \`/map\` 을 내는 노드 | \`map_server\` — 파일을 **한 번** 읽어 한 번 낸다 | \`nvblox_map\` — **새 격자가 올 때마다** 1 Hz로 계속 다시 낸다 |
| 지도 | **정적** (고정) | **동적** — 위치추정 중에도 nvblox가 새 깊이를 계속 쌓는다 |
| 실측 (위치추정, 40초) | — | \`/map\` 41개 중 **17~21개** 내용이 달랐고, \`/global_costmap/costmap\` 은 **13번** 바뀌었고, 지도 크기도 바뀐 적이 있다 |

- **전역 구간 전체가 동적이다**: nvblox → \`/map\` → \`static_layer\` → \`/global_costmap/costmap\` → 플래너. 로컬도 동적이지만 원인이 다르다 (로봇이 움직일 때마다 새 점구름).
- 일어날 수 있는 일 (**구조상 추정, 재현은 미확인**): 바닥 잡음 같은 **가짜 장애물이 \`/map\` 에 굳음** · 같은 목표인데 지도가 달라져 **경로가 달라짐** · 출발 자리가 저장 때와 다르면 어긋난 위치에 새 벽이 덧그려짐.
- 전역 \`obstacle_layer\` 가 꺼져 있어서, 전역 계획에 **새 장애물이 들어오는 길은 \`/map\` 갱신(= nvblox가 지도에 쌓는 것) 하나뿐**이다. 가까운 장애물은 로컬 코스트맵·ESDF가 피한다. 이 설계가 의도인지는 미확인.
- 사람이 지나간 자국이 \`/map\` 에 **남는지**는 아직 측정하지 않았다.

**직접 해보기**
${F}bash
ros2 run tf2_ros tf2_echo map odom        # cuVSLAM 위치
ros2 topic hz /map                        # nvblox 지도 (1 Hz)
ros2 topic echo /global_costmap/costmap --once --field info
${F}
세부 설정·겪은 문제는 **제공노드 → cuVSLAM / nvblox** 탭.`,
  },

  rtabmap: {
    label: 'RTAB-Map 🟡',
    md: `**🟡 이 로봇이 예전에 쓰던 구성 — 지금은 cuVSLAM+nvblox로 교체.** 아래는 RTAB-Map **일반 동작**이다 (이 스택으로 돌린 실측 아님).
${F}mermaid
flowchart LR
    CAM[RGB-D 카메라] --> RT[📦 rtabmap<br/>그래프 SLAM + 루프클로저]
    ODOM[odom TF] --> RT
    RT -->|"TF map→odom"| NAV[Nav2]
    RT -->|"/map 2D 격자"| NAV
    RT --> DB[(rtabmap.db)]
${F}
- **한 노드가 위치 + 지도를 같이 만든다** (cuVSLAM+nvblox처럼 쪼개지지 않음).
### ① 맵핑
이미지 특징점을 노드로 저장하고, 같은 장소를 다시 보면 **루프 클로저**로 그래프를 보정. 결과는 **하나의 DB 파일**(특징점 + 점유 격자).
### ② 위치추정
같은 DB를 열고 **localization 모드**(새 노드를 안 쌓음). 특징점 매칭으로 **시작 자리를 스스로 찾을 수 있다**(재위치추정) — cuVSLAM 구성과 가장 큰 차이.
### ③ 네비게이션
\`/map\` 을 Nav2 static_layer가 받음. 다만 이 사이트의 *전체 지도 · RTAB-Map · nav2_map_server* 항목은 **이 스택 기준**이라 현재 로봇과 다르다.
- 자세한 비교: **SLAM 구성 비교** 탭.`,
  },

  carto: {
    label: 'Cartographer ⚪',
    md: `**⚪ 이 로봇은 안 씀 — 2D LiDAR 구성이 필요하다(이 로봇엔 LiDAR 없음). 일반 설명이며 시험하지 않았다.**
${F}mermaid
flowchart LR
    L[2D LiDAR + IMU + odom] --> C[📦 cartographer_node<br/>submap 기반 SLAM]
    C -->|"TF map→odom"| NAV[Nav2]
    C --> OG[📦 occupancy_grid_node]
    OG -->|"/map"| NAV
    C --> PB[(.pbstream)]
${F}
### ① 맵핑
LiDAR 스캔을 작은 지도 조각(**submap**)으로 쌓고, 백그라운드 최적화가 조각들을 맞춘다(루프 클로저). 저장 형식은 **\`.pbstream\`**(\`write_state\`)이며, 2D 격자는 pbstream/\`/map\` 에서 변환한다.
### ② 위치추정
**pure localization** — \`.pbstream\` 을 불러오고 새 submap을 한정된 수만 유지하면서 자리만 추정.
### ③ 네비게이션
\`occupancy_grid_node\` 가 낸 \`/map\` 을 Nav2가 사용.
- 유의: 업스트림은 사실상 유지보수가 거의 없다고 알려져 있어 새 프로젝트는 **slam_toolbox** 를 많이 쓴다 (확인 시점에 따라 다를 수 있음).`,
  },

  slamtb: {
    label: 'slam_toolbox ⚪',
    md: `**⚪ 이 로봇은 안 씀 — 2D LiDAR(\`/scan\`) 필요. 일반 설명이며 이 로봇에서 시험하지 않았다.** (실습은 **맵핑·위치추정** 탭)
${F}mermaid
flowchart LR
    L[/scan 2D LiDAR/] --> S[📦 slam_toolbox]
    O[odom TF] --> S
    S -->|"TF map→odom"| NAV[Nav2]
    S -->|"/map"| NAV
    S --> SER[(포즈그래프 .posegraph/.data)]
${F}
### ① 맵핑
*online async* 모드가 일반적. 스캔을 포즈그래프로 쌓고 루프 클로저로 보정. 저장은 **두 가지**: 격자 \`map_saver\`(pgm/yaml) + **직렬화**(\`serialize_map\` → \`.posegraph\`·\`.data\`).
### ② 위치추정
\`mode: localization\` + \`map_file_name\`(직렬화 파일) + 초기 자세(\`map_start_pose\` 또는 RViz 2D Pose Estimate). **저장 지도를 실제로 불러와** 그 위에서 추정한다 — cuVSLAM 구성과 다른 점.
### ③ 네비게이션
\`/map\` 을 Nav2 static_layer에 공급. localization 중엔 지도가 **고정**이라 플래너가 보는 지도가 안정적이다.
- AMCL(고정 지도 + 파티클 필터)과 비교: **위치추정** 탭.`,
  },
  ros2control: { label: 'ros2_control(controller_manager)', md: '' },
};

const MD = `
## 한눈에: 누가 무엇을 맡나

| 스택 | 지도 만드는 노드 | 위치 내는 노드 | 지도 저장 | 위치추정 때 지도 | 시작 자리 |
|---|---|---|---|---|---|
| **cuVSLAM+nvblox** ✅ | nvblox | cuVSLAM | nvblox만 (cuVSLAM 없음) | nvblox가 불러옴 (+계속 갱신), **cuVSLAM은 안 불러옴** | 저장 때와 **같은 자리에 놓아야** |
| RTAB-Map 🟡 | rtabmap | rtabmap | DB 하나 | DB 열기 | 스스로 찾을 수 있음 |
| Cartographer ⚪ | cartographer | cartographer | .pbstream | pbstream 불러옴 | 초기 자세 필요 |
| slam_toolbox ⚪ | slam_toolbox | slam_toolbox | .posegraph + pgm | 직렬화 파일 불러옴 | 초기 자세 필요 |

- ✅ = 이 로봇 실기 확인, 🟡 = 예전 사용, ⚪ = 일반 설명(이 로봇에서 시험 안 함).
- 행 3~4(Cartographer · slam_toolbox)는 LiDAR가 있는 로봇 기준이다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosNodeOps extends w.HTMLElement {
    private tab: Tab = 'overview';

    private refresh() {
      const root = this.shadowRoot;
      root?.querySelectorAll('.rv-pkg').forEach(el =>
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.tab === this.tab));
      const ctl = this.tab === 'ros2control';
      root?.querySelectorAll('.rv-top').forEach(el =>
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.top === (ctl ? 'ros2control' : 'slam')));
      (root?.querySelector('#rv-pkgs') as HTMLElement).style.display = ctl ? 'none' : 'flex';
      (root?.querySelector('#rv-pkg') as HTMLElement).style.display = ctl ? 'none' : '';
      (root?.querySelector('#rv-md') as HTMLElement).style.display = ctl ? 'none' : '';
      const host = root?.querySelector('#rv-ctl') as HTMLElement;
      if (ctl) {
        if (!host.firstElementChild) host.innerHTML = '<center-ros2-control></center-ros2-control>';
        return;
      }
      host.innerHTML = '';
      const el = root?.querySelector('#rv-pkg') as HTMLElement;
      if (el) markdownParse(el, TABS[this.tab].md);
    }

    @addEventListener('.rv-pkg', 'click', { delegate: true })
    onTab(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rv-pkg') as HTMLElement;
      if (!btn) return;
      this.goTab(btn.dataset.tab as Tab);
    }

    /** ?concept=nodeops&tab= — 클릭 push·뒤로가기·딥링크 (ros2_control 안쪽 cs 링크도 이 주소를 쓴다) */
    @swcAppRouteGo
    private goTab(tab: Tab) {
      if (tab === this.tab) return false;
      return { path: `/ros2?concept=nodeops&tab=${tab}`, scrollToTop: false };
    }

    @subscribeSwcAppRouteChange('/ros2', { trigger: 'connectedDone' })
    onRoute(@swcAppRouteQueryParam('concept') concept: string | null, @swcAppRouteQueryParam('tab') tab: string | null) {
      if (concept !== 'nodeops') return;
      const t = (tab && tab in TABS ? tab : 'overview') as Tab;
      if (t === this.tab) return;
      this.tab = t;
      this.refresh();
    }

    @addEventListener('.rv-top', 'click', { delegate: true })
    onTop(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rv-top') as HTMLElement;
      if (!btn) return;
      if (btn.dataset.top === 'ros2control') this.goTab('ros2control');
      else if (this.tab === 'ros2control') this.goTab('overview');
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
          .rv-tops { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; padding-bottom:10px; margin-bottom:10px; border-bottom:1px solid #e2e8f0; }
          .rv-top, .rv-pkg { padding:6px 12px; border-radius:16px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#22314e; font-size:12px; font-weight:700; cursor:pointer; }
          .rv-top.active, .rv-pkg.active { background:linear-gradient(135deg,#22314e,#7dd3fc); color:#fff; border-color:transparent; }
          .rv-pkgs { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; }
          .rv-detail { background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; margin-top:8px; font-size:12.5px; color:#334155; line-height:1.7; overflow-x:auto; }
          .rv-detail pre { overflow-x:auto; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rv-tops">
          ${TOPS.map(t => `<button class="rv-top" data-top="${t.id}">${t.label}</button>`).join('')}
        </div>
        <div class="rv-pkgs" id="rv-pkgs">
          ${SLAM_TABS.map(k => `<button class="rv-pkg" data-tab="${k}">${TABS[k].label}</button>`).join('')}
        </div>
        <div class="rv-detail" id="rv-pkg"></div>
        <div id="rv-ctl"></div>

        <div class="md" id="rv-md"></div>
      `;
    }
  }

  return tagName;
};
