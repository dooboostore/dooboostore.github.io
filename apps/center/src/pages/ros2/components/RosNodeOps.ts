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
    md: `> **자율주행 = 세 가지 질문에 차례로 답하는 일이다.**
> ① **여긴 어떻게 생겼지?** (맵핑) → ② **나는 지금 거기 어디지?** (위치추정) → ③ **목표까지 어떻게 가지?** (네비게이션)
> 비유: ① 낯선 건물에서 **약도를 그리고**, ② 그 약도에서 **"현재 위치" 별표**를 찍고, ③ 별표에서 목적지까지 **길을 찾아 걷는다.**

${F}mermaid
flowchart LR
    S["📷 센서<br/>RealSense 컬러+깊이<br/>(LiDAR 있으면 /scan)"]
    subgraph Q1["① 맵핑 — 약도 그리기"]
        M["위치 계산 + 지도 그리기<br/>동시에"]
    end
    FILE[("💾 지도 파일<br/>(스택마다 형식 다름)")]
    subgraph Q2["② 위치추정 — 별표 찍기"]
        L["저장된 지도 위에서<br/>내 자리를 계속 갱신"]
    end
    subgraph Q3["③ 네비게이션 — 길 찾아 걷기"]
        P["전역 경로 계획<br/>(Nav2 플래너)"]
        C["지금 장애물 피하며 주행<br/>(컨트롤러)"]
        P --> C
    end
    W["🛞 바퀴<br/>(ros2_control)"]
    S --> M
    M -->|"끝날 때 저장"| FILE
    FILE -->|"불러오기"| L
    S --> L
    L -->|"TF map→odom<br/>(내 자리)"| P
    FILE -.->|"/map 2D 격자"| P
    C -->|"cmd_vel"| W
    classDef std fill:#c8e6c9,stroke:#2e7d32,color:#1b1b1b;
    classDef hw fill:#fff9c4,stroke:#f9a825,color:#1b1b1b;
    classDef mine fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e;
    class S,M,L,P,C std;
    class FILE hw;
    class W mine;
    style Q1 fill:#f8fafc,stroke:#94a3b8
    style Q2 fill:#f8fafc,stroke:#94a3b8
    style Q3 fill:#f8fafc,stroke:#94a3b8
${F}

## 한눈에 — 단계마다 무엇이 켜지고 무엇이 나오나 (이 로봇)

| | ① 맵핑 | ② 위치추정 | ③ 네비게이션 |
| --- | --- | --- | --- |
| **답하는 질문** | 여긴 어떻게 생겼지? | 지도 안에서 나는 어디지? | 목표까지 어떻게 가지? |
| **누가 하나** | cuVSLAM(위치) + nvblox(지도) | cuVSLAM(위치) + nvblox(저장 지도 불러와 계속 갱신) | Nav2 (NavfnPlanner + 컨트롤러) |
| **사람이 하는 일** | TUI에서 MAPPING → 로봇을 **직접 몰아** 방을 돈다 | TUI에서 저장된 지도 선택 → **저장 때와 같은 자리에 놓는다** | 목표 지정 (AUTO) |
| **조작 모드** | MANUAL (충돌감시 꺼짐) | AUTO | AUTO |
| **결과물** | \`<map_dir>/<날짜_시각>/\` 폴더 (\`nvblox.nvblx\` · \`map.pgm\`) | \`map→odom\` TF가 계속 나옴 | \`/plan\` → \`cmd_vel\` |
| **모드 바꾸는 법** | \`state_manager\`가 **스택 전체를 껐다 다시 띄움** (수십 초, TUI 잠깐 끊김) | 같음 (\`map:=saved map_name:=이름 operation:=AUTO\`) | — |

## 이 로봇 노드 지도 — 누가 누구에게 무엇을 주나

${F}mermaid
flowchart LR
    CAM["📷 realsense2_camera"] -->|"✉️ 컬러 · 깊이"| CV["📦 cuvslam_slam<br/><b>위치</b>"]
    CAM -->|"✉️ 깊이"| PG["🛠️ pole_depth_gate<br/>자기 몸 0.5m 지우기"]
    PG -->|"✉️ 깊이"| NV["📦 nvblox_node<br/><b>3D 지도 → 2D 격자</b>"]
    CV ==>|"🔗 TF map→odom"| NV
    NV -->|"✉️ 격자"| NM["🛠️ nvblox_map"]
    NM -->|"✉️ /map"| GC["📦 Nav2 global_costmap<br/>static_layer + inflation"]
    GC --> PL["📦 NavfnPlanner<br/>전역 경로 /plan"]
    NV -.->|"✉️ ESDF 점구름"| RL["🛠️ rl_nav_controller<br/>지역 주행"]
    PL --> RL
    CV ==>|"🔗 TF"| GC
    EKF["🛠️ EKF<br/>바퀴 + IMU"] ==>|"🔗 TF odom→base_footprint"| PL
    RL -->|"✉️ cmd_vel"| W["🛞 diff_drive_controller"]
    classDef std fill:#c8e6c9,stroke:#2e7d32,color:#1b1b1b;
    classDef hw fill:#fff9c4,stroke:#f9a825,color:#1b1b1b;
    classDef mine fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e;
    class CAM,CV,NV,GC,PL std;
    class PG,NM,RL,EKF mine;
    class W hw;
${F}
**범례:** ✉️ 토픽 · 🔗 TF · 굵은 선 = TF(좌표) · 점선 = 보조 경로. 상세(주기·QoS·정적/동적)는 **cuVSLAM + nvblox** 탭.

## 꼭 알아 둘 4가지

### ① TF 곱셈 — "지도 안 내 자리"는 두 값의 곱이다
${F}mermaid
flowchart LR
    MAP(["🗺️ map<br/>지도 원점"]) -->|"<b>map→odom</b><br/>위치추정(cuVSLAM)이 발행<br/>천천히 · 드리프트 보정"| ODOM(["🧭 odom<br/>출발점 기준 누적"])
    ODOM -->|"<b>odom→base_footprint</b><br/>EKF(바퀴+IMU)가 발행<br/>빠르고 부드러움"| BASE(["🤖 로봇 몸체"])
${F}
- **odom→base_footprint** 는 빠르고 부드럽지만 시간이 지나면 어긋난다. **map→odom** 은 그 어긋남을 지도에 맞춰 **고쳐 주는 값**이다. 둘을 곱하면 **지도 안 로봇 자리**.
- 그래서 \`diff_drive_controller\`는 \`enable_odom_tf: false\` — odom TF는 EKF 몫이다.

### ② "지도"는 두 종류다
| | 누가 쓰나 | 이 로봇에서 |
| --- | --- | --- |
| **2D 점유 격자** (\`/map\`) — 자유 0 · 벽 100 · 모름 -1 | **플래너**(경로 계획) | nvblox가 3D 복셀(0.05 m)을 높이 0.08–0.3 m로 잘라 만듦 |
| **위치추정용 지도** (특징점·3D) | **위치추정** | cuVSLAM은 지도를 저장·로드하지 **않는다**, 매번 새로 시작 |

스택에 따라 한 노드가 둘 다 만들기도(RTAB-Map · Cartographer · slam_toolbox), **따로 만들기도**(cuVSLAM+nvblox) 한다. 이 로봇은 따로다 — 그래서 **"위치 = cuVSLAM, 지도 = nvblox"** 둘이 TF로만 만난다.

### ③ 이 구성의 약점 — 알고 쓰자
- **시작 자리가 중요하다.** cuVSLAM이 지도를 못 불러오므로, 위치추정은 **저장 때와 같은 자리에 놓고 시작**해야 지도와 맞는다 (RTAB-Map은 스스로 찾을 수 있음).
- **위치가 틀리면 지도도 틀어진다** — nvblox는 cuVSLAM이 준 위치를 믿고 그 자리에 깊이를 쌓는다.
- **한참 안 본 곳은 다시 "모름"으로 돌아갈 수 있다** (nvblox 잊기). 자세한 실측은 **cuVSLAM + nvblox** 탭의 ⚠ 실측.

### ④ 모드 전환은 "재시작"이다
cuVSLAM·nvblox는 실행 중 모드를 바꾸는 기능이 없다. 그래서 \`/cmd/map_mode\` 를 받은 \`state_manager\` 가 **launch를 전부 껐다가 인자만 바꿔 다시 띄운다.** 수십 초 걸리고 TUI 연결이 잠깐 끊겼다 돌아오는 것은 정상이다.

## 어느 탭을 볼까

| 하고 싶은 것 | 탭 | 근거 |
| --- | --- | --- |
| 이 로봇 맵핑·위치추정·네비 동작을 **끝까지** 보기 | **cuVSLAM + nvblox ✅** | 코드 · 실측으로 확인 |
| 예전 구성(RTAB-Map)이 어땠는지 | RTAB-Map 🟡 | 일반 설명 (지금은 안 돎) |
| LiDAR 로봇이면 | Cartographer ⚪ · slam_toolbox ⚪ | 일반 설명 — **이 로봇에서 시험 안 함** (2D LiDAR 필요) |
| 바퀴·팔을 어떻게 움직이나 | 위쪽 **ros2_control** 메뉴 | 지도와 별개인 제어 층 |
| 스택 간 장단점 비교 | **SLAM 구성 비교** 탭 · **위치추정** 탭 | |
`,
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
| \`nvblox_node\` | 깊이 영상 + TF를 받아 3D 복셀(0.05 m) 지도를 쌓고, 높이 0.08–0.3 m로 잘라 2D 격자를 만듦 |
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
    IL -->|"✉️ /global_costmap/costmap<br/>1 Hz(실측 0.6–0.65) · 🔄 동적"| VIEW
    IL -.->|"같은 프로세스 안에서 직접 읽음"| PL["📦 NavfnPlanner<br/>전역 경로 ✉️ /plan"]
    NV -->|"✉️ /nvblox_node/combined_esdf_pointcloud<br/>🔄 동적"| CT["🛠️ rl_nav_controller"]
    PL --> CT
${F}
**범례:** ✉️ 토픽 · 🔗 TF · 🔄 동적(계속 바뀜) · 점선 = 토픽이 아니거나 보조 경로. **지도 경로(카메라 → /map → 코스트맵)의 모든 구간이 동적**이다.
- 위치가 틀리면 지도도 틀어진다 — nvblox는 cuVSLAM이 알려 준 위치를 믿고 그 자리에 깊이를 쌓기 때문이다.
- 처음엔 전부 **모름(-1)** 이고, 돌아다니면 **지금 시야에 들어온 칸**이 **자유(0)** 나 **벽(100)** 으로 채워진다. ⚠ 그런데 **한참 안 본 곳은 다시 모름으로 돌아간다** (nvblox 잊기 — 아래 "⚠ 실측" 절).

**지도 데이터가 지나가는 길 — 어떤 토픽을 · 어떤 노드가 보내고 · 어떤 노드가 받나 · 정적인가 동적인가**

| # | 토픽 / TF | 보내는 노드 | 받는 노드 | 방식 · 주기 | 정적/동적 |
|---|---|---|---|---|---|
| 1 | \`/pole_front_cam/color/image_raw\` · \`/pole_front_cam/aligned_depth_to_color/image_raw\` · \`camera_info\` | realsense2_camera (pole_front_cam) | \`cuvslam_slam\` (깊이는 \`pole_depth_gate\` 도) | 컬러·깊이 약 15프레임/초 | **동적** — 매 프레임 |
| 2 | \`/pole_front_cam/aligned_depth_to_color/image_nvblox\` (그립퍼는 \`/gripper_cam/…/image_nvblox\`) | \`pole_depth_gate\` (\`gripper_depth_gate\`) | \`nvblox_node\` (\`camera_0/depth/image\` 로 리맵) | SENSOR_DATA QoS · 쌓는 속도 15 Hz(\`integrate_depth_rate_hz\`) | **동적** |
| 3 | **TF \`map→odom\`** | \`cuvslam_slam\` | \`nvblox_node\` · Nav2 노드들(코스트맵·플래너·컨트롤러가 TF 조회) | 약 10 Hz, 0.5 s 미래 시각 | **동적** — 로봇이 움직이면 계속 바뀜 |
| 4 | \`/nvblox_node/static_occupancy_grid\` | \`nvblox_node\` | \`nvblox_map\` | best effort(SENSOR_DATA) · 실측 초당 약 4.8번 | **동적** — 깊이가 쌓일수록 내용이 바뀜 |
| 5 | **\`/map\`** | \`nvblox_map\` | \`global_costmap\`(static_layer) · \`map_saver\`(저장 요청 때) · RViz · TUI | **latched**(reliable + transient_local, 깊이 1) · 1 Hz · **새 격자가 왔을 때만** | **동적** — 맵핑 중엔 자라남 |
| 6 | \`/global_costmap/costmap\` | \`global_costmap\` 노드 (planner_server 안) | RViz · TUI. **플래너는 같은 프로세스 안에서 직접** 읽음 (토픽 아님 — Nav2 표준 구조) | 설정 1 Hz · 실측 초당 0.6–0.65 | **동적** — \`/map\` 이 바뀌면 따라 바뀜 |

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
- 불러온 지도는 nvblox 메모리에 **초기값**으로 들어간다. 그 뒤 길은 맵핑 때와 똑같다 — **\`nvblox_node\` → 토픽 \`/nvblox_node/static_occupancy_grid\` → \`nvblox_map\` → 토픽 \`/map\`(latched, 1 Hz) → Nav2 \`global_costmap\` 의 \`static_layer\`** (①의 표 4–6행). 다른 건 *새로 그린 지도냐, 불러온 지도냐* 뿐이다.
- **정적일까 동적일까?** 불러온 순간의 \`/map\` 은 저장된 모습이지만, **그 뒤로 고정되지 않는다** — 새 깊이가 쌓이면 \`/map\` 이 다시 나간다 (6단계, ③ 참고).

**5단계 — 위치 맞추기 (이 로봇의 핵심 약속)**
- cuVSLAM은 **지도를 불러오지 않는다.** 켜질 때의 자리를 (0,0)으로 잡고, 영상으로 계산한 이동량을 **더해 갈 뿐**이다. 지도의 (0,0)은 *저장할 때 출발한 자리*다.
- 그래서 **같은 자리·같은 방향에 놓고 시작**해야 한다. 어긋나면 RViz **2D Pose Estimate**(\`/initialpose\`) 나 TUI(4→8 위치 지정)로 사람이 맞춘다. 이 보정은 **메모리에만** 있어서 스택을 다시 띄우면 사라진다.
- 오차는 시간이 갈수록 쌓인다 (루프 클로저는 한 번 실행 안에서만).

**6단계 — 위치추정 중에 계속 일어나는 일**
- ⚠ **저장 지도는 "고정된 정답"이 아니다.** nvblox는 위치추정 중에도 새 깊이를 계속 쌓고, 동시에 **카메라가 안 보는 곳은 잊는다** (실측 — "⚠ 실측" 절). 그래서 불러온 지도가 **수십 초 안에 지금 시야 근처만 남을 수 있다.** 위치추정 40초 실측: \`/map\` 41개 중 17–21개가 달랐다.
- 끌 때 저장은 하지 않는다 (3단계 — 저장 경로 없음). 그래서 디스크의 지도는 그대로이고 **메모리의 지도만** 바뀐다.

**확인하는 법**
${F}bash
ros2 topic echo /state/map_mode --once       # LOCALIZATION 인지
ros2 topic echo /state/map_name --once       # 불러온 지도 이름
sed 's/\\x1b\\[[0-9;]*m//g' /tmp/bringup.log | grep -a '지도 불러오기'   # 성공 / 실패
ros2 run tf2_ros tf2_echo map odom           # cuVSLAM 위치가 나오나
${F}
- 이 흐름은 코드(\`state_manager.cpp\` · \`bringup.launch.py\` · \`nvblox_map.py\`)를 읽어 정리했다. 불러오기 시간·성공 로그를 실기에서 재 본 것은 아니다.

### 🧭 한 장 요약 — 위치추정을 켜고 첫 목표까지 (노드 · 토픽 순서)
**헷갈리면 이것만 보면 된다.** 시간 순서대로 ① 지도 고르기 → ② 지도 불러오기 → ③ 위치 시작 → ④ (계속 돌아감) 지도 갱신 → ⑤ 목표 → 주행. **저장 파일은 ②에서 한 번 읽고 끝**이고, 그 뒤 플래너가 보는 건 ④가 계속 갱신하는 **메모리 속 지도**다.

${F}mermaid
flowchart TD
    subgraph S1["① 지도 고르기"]
        U["🧑 사람 · TUI(run-cli)"] -->|"✉️ /cmd/map_name = 이름"| SM["🛠️ state_manager"]
        SM -->|"launch 전체 껐다가<br/>map:=saved map_name:=이름 으로 재실행"| LN["bringup.launch"]
    end
    subgraph S2["② 지도 불러오기 — 파일은 여기서 한 번만 읽음 (정적)"]
        LN -->|"파라미터 load_path"| NM["🛠️ nvblox_map"]
        NM -->|"🔧 서비스 /nvblox_node/load_map"| NV["📦 nvblox_node<br/>저장 지도를 메모리에 올림 = 초기값"]
    end
    subgraph S3["③ 위치 시작 — 지도를 모름"]
        CV["📦 cuvslam_slam<br/>출발 자리를 (0,0)으로 시작"] -->|"🔗 TF map→odom · 🔄 동적"| NV
    end
    subgraph S4["④ 계속 돌아감 — 메모리 지도가 바뀜 (동적)"]
        CAM["📷 realsense2_camera"] -->|"✉️ /pole_front_cam/aligned_depth_to_color/image_raw"| PG["🛠️ pole_depth_gate"]
        PG -->|"✉️ …/image_nvblox"| NV
        NV -->|"✉️ /nvblox_node/static_occupancy_grid"| NM2["🛠️ nvblox_map"]
        NM2 -->|"✉️ /map · latched · 1 Hz · 🔄"| SL["📦 global_costmap<br/>static_layer → inflation_layer"]
        SL -->|"✉️ /global_costmap/costmap · 1 Hz · 🔄"| PL["📦 planner_server"]
    end
    subgraph S5["⑤ 목표 → 주행"]
        G["🧑 목표 찍기 (TUI) · 🛠️ coordinator"] -->|"🎬 /navigate_to_pose"| BT["📦 bt_navigator"]
        BT -->|"🎬 compute_path_to_pose"| PL
        PL -->|"✉️ /plan"| BT
        BT -->|"🎬 follow_path"| CS["📦 controller_server<br/>RlNavController"]
        NV -->|"✉️ /nvblox_node/combined_esdf_pointcloud · 🔄"| CS
        CS -->|"✉️ /cmd_vel_nav"| MX["twist_mux → velocity_smoother<br/>→ collision_monitor"]
        MX -->|"✉️ /cmd_vel"| WH["diff_drive_controller → 🛞 바퀴"]
    end
${F}

| 순서 | 누가 | 무엇으로 (토픽 · 서비스 · 액션) | 받는 노드 | 지도 상태 |
|---|---|---|---|---|
| ① | TUI(CLI) | ✉️ \`/cmd/map_name\` = 지도 이름 | \`state_manager\` | 저장 파일 (**정적**) |
| ① | \`state_manager\` | launch 전체 재시작 \`map:=saved map_name:=…\` | \`bringup.launch\` | |
| ② | \`nvblox_map\` | 🔧 서비스 \`/nvblox_node/load_map\` (\`load_path\`) | \`nvblox_node\` | 파일 → **메모리** (초기값) |
| ③ | \`cuvslam_slam\` | 🔗 TF \`map→odom\` (출발 자리 = 0,0) | \`nvblox_node\` · Nav2 노드들 | 지도와 위치는 **서로 모름** — 같은 자리라고 가정 |
| ④ | \`realsense2_camera\` → \`pole_depth_gate\` | ✉️ \`/pole_front_cam/aligned_depth_to_color/image_raw\` → ✉️ \`…/image_nvblox\` | \`nvblox_node\` | 깊이가 위치에 맞춰 **덧쌓임** (🔄) |
| ④ | \`nvblox_node\` | ✉️ \`/nvblox_node/static_occupancy_grid\` (best effort, 약 4.8번/초) | \`nvblox_map\` | 🔄 동적 |
| ④ | \`nvblox_map\` | ✉️ \`/map\` (latched, 1 Hz, 새 격자일 때만) | \`global_costmap\` \`static_layer\` | 🔄 동적 |
| ④ | \`global_costmap\` | ✉️ \`/global_costmap/costmap\` (1 Hz) | \`planner_server\`(같은 프로세스) · RViz · TUI | 🔄 동적 — **플래너가 실제로 보는 지도** |
| ⑤ | TUI · \`coordinator\` | 🎬 액션 \`/navigate_to_pose\` (map 프레임 x·y·yaw) | \`bt_navigator\` | |
| ⑤ | \`bt_navigator\` ↔ \`planner_server\` | 🎬 \`compute_path_to_pose\` → ✉️ \`/plan\` | \`bt_navigator\` | **목표를 받은 순간의** 전역 코스트맵으로 계획 |
| ⑤ | \`bt_navigator\` → \`controller_server\` | 🎬 \`follow_path\` | \`ml::RlNavController\` | 장애물은 ✉️ \`/nvblox_node/combined_esdf_pointcloud\`(🔄)로 봄 |
| ⑤ | \`controller_server\` → … → 바퀴 | ✉️ \`/cmd_vel_nav\` → \`/cmd_vel_mux\` → \`/cmd_vel_smoothed\` → \`/cmd_vel\` | \`diff_drive_controller\` | |

- **④는 ⑤가 진행되는 동안에도 멈추지 않는다.** 그래서 주행 중에 지도가 바뀌고, \`bt_navigator\` 가 1초마다 "지금 경로가 아직 유효한가"를 검사해 아니면 다시 계획한다.
- **정적인 건 ①~②의 저장 파일뿐이다.** ②에서 읽은 뒤 플래너가 보는 건 ④가 만든 **동적인** 지도다 — Nav2 일반 구성(\`map_server\` 가 파일을 한 번 읽어 끝까지 고정)과 다른 점.
- **위치(③)와 지도(②)는 서로 연결돼 있지 않다.** 둘을 이어 주는 건 "저장할 때와 같은 자리에서 시작한다"는 **사람의 약속**뿐이다 — 어긋나면 RViz **2D Pose Estimate**(\`/initialpose\`)로 맞춘다.
- ⚠ **실측:** ④에서 nvblox가 **시야 밖 지도를 잊는다** (아래 "⚠ 실측" 절). ②에서 불러온 지도가 시간이 지나며 **지금 시야 근처만** 남을 수 있다 — 그러면 ⑤의 플래너는 안 보이는 곳을 **모름 칸**으로 계획한다.

### ⚠ 실측 — \`/map\` 은 "지금 시야" 근처만 남는다 (nvblox가 안 보는 곳을 잊는다)
**질문: "\`/map\` 이 지금 보이는 것만 담는다면, 안 보이는 곳을 목표로 찍어도 어떻게 알지?"** → **그 걱정이 맞다.** 앞에서 "지도는 쌓이고 안 지운다"고 한 설명은 **틀렸다.** 맵핑 녹화(\`bee_diag/1110_110542_slam_mapping_manual\`, 2026-11-10 11:05, 109초, 수동 주행) 안의 \`/map\` 120개를 칸 단위로 분석했다.

| 시각 | 로봇 | \`/map\` 크기 | 아는 칸 (자유 + 벽) | 모름 칸 | 해석 |
|---|---|---|---|---|---|
| 0 s | 정지 | 128×136 | **5349** | 12059 | 녹화 시작 (이미 돌던 중) |
| 7 s | 정지 | 120×128 | 5246 | 10114 | 줄기 시작 |
| 23 s | 정지 | 113×128 | **4448** | 10016 | **23초 만에 약 900칸 잊음** |
| 31 – 63 s | 정지 | 113×128 | 4440 – 4451 | 약 10020 | **더 안 줄고 일정** = 지금 시야 안의 칸 |
| 71 s | 주행 | 105×144 | 4974 | 10146 | 움직이자 늘기 시작 |
| 87 s | 정지(86 s부터) | 120×144 | **6938** | 10342 | 가장 많이 알던 때 |
| 111 s | 정지 | 128×120 | 6049 | 9311 | 다시 줄어듦 |
| 118 s | 정지 | 121×112 | **5367** | 8185 | **정지 후 32초 만에 약 1570칸 감소, 계속 줄던 중** |

**읽는 법**
- 로봇이 **정지**한 0–62 s에 아는 칸이 5349 → 약 4445로 줄다가 **일정**해진다. 일정해진 값은 **카메라가 지금 보는 영역의 크기**로 해석된다 (시야각과 직접 대조해 확인한 건 아님).
- 62–86 s에 **움직이자** 6938까지 늘고, **다시 서자** 줄기 시작한다 — **"본 곳은 쌓이고, 안 본 곳은 사라진다."**
- \`/map\` 크기도 계속 바뀐다 (113×128 → 105×144 → 128×120 …). 완전히 잊은 블록을 메모리에서 **해제**하기(\`deallocate_decayed_blocks true\`) 때문으로 보인다.
- 앞의 위치추정 실측(아는 칸 약 4200)도 이 **일정해진 값(약 4445)** 과 비슷하다 — **저장 지도를 불러와도 이미 시야 크기로 줄어 있었다**는 뜻일 수 있다 (같은 방법으로 재 본 것은 아님).

**그래서 "안 보이는 곳에 goal"은 이렇게 된다 (현재 설정)**
1. 목표 칸이 격자 **안**이면 거부는 안 된다. 그런데 안 보이는 곳은 대부분 **모름(-1)** 이다.
2. 플래너는 모름 칸을 **자유 칸의 약 5배 비용**으로 **지날 수 있는 칸**으로 본다 (\`allow_unknown\`). 그래서 **벽을 잊은 구간은 벽을 무시한 거의 직선 경로**가 나올 수 있다 — **복도형 미로(미션 경기장)에서 특히 위험**하다.
3. 가까워져서 벽이 다시 보이면 nvblox가 쌓고 → \`/map\` 이 바뀌고 → BT가 1초마다 경로를 검사해 **그때서야 우회 경로**로 다시 계획한다. 즉 **한 번에 맞는 길이 아니라 부딪혀 보며 고치는 길**이다.
4. ⚠ **맵핑 중에도 같은 일이 일어난다.** 지나온 복도가 수십 초 뒤 잊히면, **지도 저장 시점의 메모리 지도에는 일부만 남아 있을 수 있다** (저장된 \`map.pgm\` 의 아는 칸 수를 재 보지 않았다 — **확인이 필요하다**).

**한계 · 원인 확인**
- 이 녹화는 **맵핑 모드(수동 주행)** 이고, 위치추정에서 같은 방법으로 재지는 않았다 (같은 nvblox 설정이라 같을 것으로 추정).
- 원인이 TSDF decay라는 것은 **소스(기본값) + 이 곡선의 모양**으로 추정한 것이다. **decay를 끄고 같은 녹화를 다시 해서** 줄지 않는지 봐야 확정된다 (\`decay_tsdf_rate_hz: 0\` 은 \`nvblox.yaml\` 에 **설정했고, bee에 반영해 다시 재 보기 전**이다).
- 조치: \`nvblox.yaml\` 에 \`decay_tsdf_rate_hz: 0.0\` 을 **설정했다** (소스 \`shouldProcess\`: 주기가 \`≤ 0\` 이면 잊기를 안 부름 — 확인). 단점: 한 번 지도에 들어간 **가짜 장애물·사람 자국도 안 지워진다** (움직이는 물체는 \`decay_dynamic_occupancy_rate_hz\` 10 Hz가 따로 맡는다). **bee에 반영해 같은 방법으로 다시 재기 전까지는 효과가 확인된 것이 아니다.**

### ③ 네비게이션 — 목표를 주면 길을 계획하고(플랜), 그 길을 따라 바퀴를 굴린다
**한 줄 요약:** 목표 → **bt_navigator**(지휘) → **planner_server**(길 계획) → **controller_server**(길 따라가기, 이 로봇은 RL 정책) → 속도 명령 체인 → 바퀴. 전체 그림:

${F}mermaid
flowchart TD
    G1["🧑 TUI 지도 화면에서 목표 찍기<br/>(CLI send_nav_goal)"] -->|"🎬 액션 /navigate_to_pose<br/>goal.pose = map 프레임 x · y · yaw"| BT
    G2["🛠️ coordinator → navigate_skill<br/>(✉️ /skills/navigate)"] -->|"🎬 액션 /navigate_to_pose"| BT
    subgraph BTN["📦 bt_navigator — 행동 트리를 100 Hz로 한 칸씩 실행"]
        BT["계획(1 Hz) → 따라가기 → 막히면 복구<br/>(navigate_to_pose.xml)"]
    end
    BT -->|"🎬 compute_path_to_pose<br/>(목표 · planner_id = GridBased)"| PS["📦 planner_server<br/>NavfnPlanner A-star<br/>전역 코스트맵으로 계획"]
    PS -->|"경로 반환 + ✉️ /plan"| BT
    BT -->|"🎬 follow_path (경로)"| CS["📦 controller_server — 20 Hz<br/>FollowPath = ml::RlNavController"]
    BT -->|"복구일 때 🎬 spin · backup · wait"| BH["📦 behavior_server"]
    CS -->|"✉️ /cmd_vel_nav (TwistStamped)"| MUX["📦 twist_mux<br/>자동 우선순위 10"]
    BH -->|"✉️ /cmd_vel_nav"| MUX
    MAN["🛠️ manual_control"] -->|"✉️ /cmd_vel_manual · 우선순위 100"| MUX
    MUX -->|"✉️ /cmd_vel_mux"| VS["📦 velocity_smoother<br/>20 Hz · 가속 제한"]
    VS -->|"✉️ /cmd_vel_smoothed"| CM["📦 collision_monitor<br/>부딪힐 방향만 멈춤·감속"]
    CM -->|"✉️ /cmd_vel"| DD["📦 diff_drive_controller<br/>(ros2_control)"]
    DD --> W["🛞 바퀴"]
${F}

**1단계 — 목표가 들어온다**
- 보내는 쪽은 두 곳이다: ① 사람이 **TUI 지도 화면에서 목표를 찍으면** CLI(\`send_nav_goal\`)가, ② 미션 중에는 **\`coordinator\` → \`navigate_skill\`**(\`/skills/navigate\`)이 같은 액션 **\`/navigate_to_pose\`** 에 목표를 보낸다. 목표는 **\`map\` 프레임의 x · y · yaw** 다.
- 받는 쪽은 **\`bt_navigator\`** 하나다. 액션 서버가 없으면(\`지도/로컬라이제이션/Nav2 확인\`) CLI가 "서버 없음"으로 거절한다 — 맵핑 때는 Nav2가 떠 있지만 지도 모드 NONE이면 Nav2가 안 뜬다.

**2단계 — bt_navigator가 행동 트리로 지휘한다** (\`config/navigate_to_pose.xml\`, Nav2 기본 트리 복사본)
- **계획(1 Hz):** 1초마다 "지금 길을 그대로 써도 되나?"를 검사한다 — 새 목표가 아니고 남은 경로가 아직 유효하면 재사용, 아니면 \`ComputePathToPose\` 로 **새 경로 계산**.
- **따라가기:** 경로를 \`FollowPath\` 에 넘긴다. 실패하면 **로컬 코스트맵을 지우고** 한 번 더 시도한다.
- **복구 (최대 6번 재시도):** 그래도 막히면 순서대로 **코스트맵 지우기 → 제자리 회전(1.57 rad) → 5초 기다리기 → 후진(0.10 m, 0.05 m/s)** 을 돌려 가며 시도한다. 후진을 0.30 → 0.10 m로 줄인 것은 카메라가 뒤를 못 봐서 벽에 박혔기 때문이다.
- 트리는 100 Hz(\`bt_loop_duration 10 ms\`)로 한 칸씩 돈다. 서버 응답 대기는 100 ms(\`default_server_timeout\`) — 20 ms일 때 부하가 몰리면 목표가 통째로 실패했다 (예전 실측).

**3단계 — 플랜 세우기 (planner_server)** — 어떤 지도를 어떻게 보나

${F}mermaid
flowchart TD
    M["🛠️ nvblox_map"] -->|"✉️ /map · latched(reliable + transient_local)<br/>1 Hz · 새 격자일 때만 · 🔄 동적<br/>(구독: map_topic 기본값 /map)"| SL
    subgraph GC["📦 global_costmap 노드 — planner_server 안 (update 1 Hz)"]
        SL["static_layer<br/>새 /map마다 칸 복사"] --> IL["inflation_layer<br/>벽 주변 0.18 m 팽창"]
    end
    IL -->|"✉️ /global_costmap/costmap<br/>1 Hz(실측 0.6–0.65) · 🔄 동적"| VIEW["RViz · TUI"]
    IL -.->|"같은 프로세스 안에서 직접 읽음"| PL["📦 NavfnPlanner (A-star)<br/>tolerance 0.20 m · allow_unknown"]
    PL -->|"✉️ /plan"| OUT["bt_navigator → controller_server"]
${F}
1. **\`global_costmap\` 노드의 \`static_layer\`** 가 토픽 \`/map\` 을 구독한다 (토픽 이름은 설정에 안 적은 **기본값 \`/map\`**, \`map_subscribe_transient_local: true\` 라서 늦게 켜져도 마지막 지도를 받음).
2. **새 \`/map\` 이 올 때마다** 그 칸 값을 자기 층에 복사한다 (Nav2 표준 동작: 지도 크기가 바뀌면 코스트맵 크기도 다시 맞춘다 — 이 로봇에서 따로 확인하진 않음). 값: 모름 \`-1\` · 자유 \`0\` · 벽 \`100\`.
3. **\`inflation_layer\`** 가 벽 주변을 0.18 m(로봇 반경 0.16 m + 2 cm) 부풀려 "로봇 중심이 지나가면 안 되는 구역"을 만든다.
4. 두 층을 합쳐 **1 Hz로 \`/global_costmap/costmap\`** 을 낸다. (\`obstacle_layer\` 설정은 파일에 있지만 plugins 목록(\`["static_layer","inflation_layer"]\`)에 없어서 **꺼져 있다**.)
5. **NavfnPlanner(\`A*\`)** 가 이 코스트맵으로 시작점→목표 경로를 찾는다. \`allow_unknown: true\` 라서 **모름 칸도 지날 수 있고**, 목표가 벽·팽창 안이면 **0.20 m까지 가까운 빈 곳**으로 대신 간다. 결과는 토픽 \`/plan\` 이고 \`bt_navigator\` 가 컨트롤러에 넘긴다.

**플래너가 지도에서 실제로 쓰는 정보** — 플래너가 아는 세상은 **\`/map\` 2D 격자 한 장**뿐이다 (nvblox의 3D 지도·메시는 안 쓴다).

${F}mermaid
flowchart LR
    G["✉️ /map 칸 하나<br/>-1 · 0 · 100"] -->|"static_layer<br/>값 바꾸기"| C1["코스트 0 · 254 · 255"]
    C1 -->|"inflation_layer<br/>벽 주변 부풀리기"| C2["코스트 0 ~ 253"]
    C2 --> N["NavfnPlanner A-star<br/>칸마다 비용을 더해 가며 최단·최저비용 길 탐색"]
    S["🔗 시작 = TF map→base_footprint<br/>(= map→odom × odom→base_footprint)"] --> N
    T["🎯 목표 = goal.pose (map)"] --> N
    N --> R["✉️ /plan = 칸 좌표들의 경로"]
${F}

**① \`/map\` 이 담고 있는 것** (\`nav_msgs/OccupancyGrid\`)

| 필드 | 값 | 플래너에게 뜻 |
|---|---|---|
| \`header.frame_id\` | \`map\` | 좌표 기준 — cuVSLAM의 \`map\` 과 같아야 한다 (\`nvblox_map\` 이 \`map\` 으로 맞춰 내고, 다르면 격자를 버리고 오류 로그) |
| \`info.resolution\` | **0.05 m/칸** | 지도 한 칸 = 5 cm (복셀 크기와 코스트맵 해상도를 같게 맞춤) |
| \`info.width · height\` | 칸 수 (실측 예: 105×113 · 105×104) | 지도 크기. **지도가 자라면 바뀐다** |
| \`info.origin\` | 칸 (0,0)의 \`map\` 좌표 | 칸 번호 ↔ 미터 좌표 변환 기준 |
| \`data\` | 칸마다 **-1 모름 · 0 자유 · 100 벽** | 이게 전부다 |

- 이 격자는 nvblox가 3D 복셀 지도를 **높이 0.08–0.30 m 단면**으로 잘라 만든 것이다. 그래서 **플래너는 이 단면에 잡힌 장애물만 안다** — 8 cm보다 낮은 물건이나 30 cm보다 높은 물건은 플랜에 없다.

**② 칸 값이 코스트맵 값으로 바뀌는 길** (\`static_layer\` → \`inflation_layer\`) — 숫자는 Nav2 표준 동작이고 이 로봇 설정은 바꾸지 않았다.

| \`/map\` 값 | 코스트맵 값 | 플래너가 보는 뜻 |
|---|---|---|
| \`100\` 벽 | **254** 치명 | 절대 못 지나감 |
| \`0\` 자유 | **0** | 마음껏 지나감 |
| \`-1\` 모름 | **255** 정보 없음 | \`allow_unknown: true\` 라서 **지날 수 있다** (\`track_unknown_space: true\`) |

벽에서 떨어진 거리 \`d\` 에 따라 \`inflation_layer\` 가 이렇게 칠한다 (\`robot_radius 0.16\`, \`inflation_radius 0.18\`, \`cost_scaling_factor 3.0\`):

| 벽까지 거리 d | 코스트 | 뜻 |
|---|---|---|
| d ≤ 0.16 m | **253** 내접 | **로봇 중심이 오면 몸이 벽에 닿는 곳** — 못 지나감 |
| 0.16 < d ≤ 0.18 m | 252 × e^(−3(d−0.16)) → 약 237까지 내려감 | 아주 좁은 경고 띠 (2 cm) |
| d > 0.18 m | **0** | 벽이 없는 것과 같음 |

이 표로 계산하면 (**표준 공식에 설정값을 넣은 계산, 실측 아님**):
- **통로 폭이 약 0.32 m(= 0.16 × 2)보다 좁으면 플래너는 길이 없다고 본다.**
- 팽창이 0.18 m에서 끝나서 **벽에서 0.2 m 떨어진 길과 1 m 떨어진 길의 코스트가 같다** — "벽에서 멀찍이 가는" 선호가 거의 없고, 경로가 벽 쪽에 붙을 수 있다 (NavFn 소스로 확인: 자유 칸은 어디든 칸당 비용 50으로 같다 — 아래 "안 보이는 곳이 목적지면?"). 그래서 장애물 회피는 컨트롤러와 \`collision_monitor\` 가 맡는다.

**③ 시작 · 목표 · 허용 오차**
- **시작점**은 지도 정보가 아니라 **TF** 에서 온다: 로봇 위치 = \`map→odom\`(cuVSLAM) × \`odom→base_footprint\`(EKF). **cuVSLAM 위치가 어긋나 있으면 플래너는 어긋난 자리에서 출발하는 길을 만든다** — 벽 안이면 출발부터 실패한다 (과거 실측: 막힌 채 바퀴가 돌아 odom이 밀리면 위치가 벽 안으로 가서 계획이 실패).
- **목표점**은 액션의 \`goal.pose\`(\`map\` 프레임). 목표가 벽·팽창 안이면 **0.20 m(\`tolerance\`)까지** 가까운 빈 곳으로 대신 간다.
- **지도가 계속 바뀌므로**(동적) 같은 시작·목표라도 **계산 시점마다 경로가 달라질 수 있다.** BT가 1초마다 길이 아직 유효한지 검사하고 필요하면 다시 계산한다.

**④ 지금 안 보이는 곳이 목적지면? — 플래너에는 "보인다/안 보인다"가 없다**
- 전역 코스트맵은 **\`/map\` 격자 한 장(+ 팽창)** 이 전부다 — 맞다. 플래너는 카메라를 모른다. **격자 위에서 시작 칸 → 목표 칸 길을 찾을 뿐**이다. 목표가 카메라에 보이는지는 상관없고, **격자 안에 있느냐**만 본다.
- 아래는 NavFn 소스(\`navfn.cpp\` · \`navfn_planner.cpp\`, **Nav2 GitHub main 기준 — 로봇에 설치된 버전과 같은지는 안 확인**)를 읽은 것이다.

| 목표 칸의 상태 | 플래너가 하는 일 |
|---|---|
| **격자 밖** (\`/map\` 크기 밖) | **바로 실패** — \`GoalOutsideMapBounds\` ("Goal Coordinates … was outside bounds"). 전역 코스트맵 크기는 \`/map\` 크기를 따라가므로, **한 번도 지도에 안 들어온 먼 곳은 목표로 줄 수 없다** (시작점이 밖이어도 \`StartOutsideMapBounds\`) |
| **자유(0)** — 이미 본 빈 곳 | 정상 계획. **지금 카메라에 안 보여도** 지도에 있으면 된다 (그래서 맵핑으로 미리 만들어 둔 것) |
| **모름(-1 → 255)** — 격자 안인데 본 적 없음(또는 잊음) | \`allow_unknown: true\` 라서 **계획한다.** 모름 칸은 **칸당 비용 253**, 자유 칸은 **50** — 즉 모름 칸은 자유 칸의 **약 5배 비싸다.** 그래서 A*는 아는 길을 선호하고, **필요할 때만** 모름 칸을 가로지른다 |
| **벽 / 팽창 안** (254 · 253) | 못 지나는 칸. \`tolerance 0.20\` 이라 목표 주변 **0.20 m 안**의 갈 수 있는 칸을 찾아 대신 간다 (없으면 실패) |

**NavFn이 칸마다 매기는 비용** (소스: \`COST_NEUTRAL 50\` · \`COST_FACTOR 0.8\`)
- 코스트맵 값 0–252 → **50 + 0.8 × 값** (최대 253). 자유(0)는 **50**, 팽창 띠(약 237)는 **약 240**.
- 치명(254) · 내접(253) → **통과 불가.** 모름(255) + \`allow_unknown\` → **253(= 통과 불가 바로 아래)**.
- 그래서 자유 칸끼리는 어디를 지나도 칸당 같은 비용이라 **벽에서 0.2 m든 1 m든 비용이 같다** (경로는 최단 거리에 가깝게 나온다).

**웨이포인트는 어떻게 만들어지나**
1. **A\*가 격자 위에서** 시작 칸부터 목표 칸까지 **비용이 가장 작은 칸들의 이음**을 찾는다. 그 칸 좌표들을 **\`map\` 좌표 경로 \`/plan\`** 으로 바꿔 낸다 — 칸 크기(5 cm) 안팎으로 **촘촘한 점들**이다.
2. 컨트롤러는 **전체 경로를 쓰지 않는다.** \`RlNavController\` 는 **로봇 앞쪽 부분만 0.30 m 간격 5점(= 약 1.5 m)** 으로 뽑아 쓴다. 그러니 **먼 목적지가 안 보이는 곳이어도 컨트롤러가 걱정할 건 눈앞 1.5 m뿐**이다 — 그 구간은 가까워서 카메라·ESDF로 보인다.
3. **한 번에 완벽한 길이 아니라 "아는 만큼으로 계획 + 가면서 다시 계획"이다.** 가다가 카메라가 모름 칸을 보면 nvblox가 \`/map\` 에 쌓고(④ 동적), 전역 코스트맵이 바뀌고, \`bt_navigator\` 가 **1초마다 남은 경로가 아직 유효한지**(\`ValidatePath\`) 보고 **막혔으면 새로 계획**한다. 모름 칸이 실제로는 벽이었다면 그때서야 길이 바뀐다.
- ⚠ 그래서 **모름 칸으로 이어진 목적지**는 "가 보니 막혀 있는" 일이 생긴다. 그리고 **실측으로 nvblox는 시야 밖을 잊는다** (아래 "⚠ 실측" 절) — 이미 맵핑해 둔 곳도 **수십 초 안 보면 모름 칸**이 되어 **5배 비싼 모름 칸**으로 계획된다. 벽을 잊은 구간은 **벽을 무시한 거의 직선 경로**가 나올 수 있다 (가까워져 다시 보이면 그때 길이 바뀜).

**4단계 — 컨트롤러가 길을 따라간다 (controller_server, 20 Hz)**
- **\`controller_server\`** 가 20 Hz로 플러그인 \`FollowPath\` 를 부른다. 이 로봇의 \`FollowPath\` 는 **\`ml::RlNavController\`** — **RL 정책(ONNX, CUDA)** 이 속도를 정하고, 못 쓸 때는 안에 든 **DWB** 가 대신한다.
- **진행 감시:** 10초 안에 0.3 m도 못 움직이면 "막힘" → 실패 → 2단계의 복구. **도착 판단:** 위치 0.10 m · 방향 0.15 rad(≈8.6°) 안이면 성공 (\`stateful: false\` — 매 순간 둘 다 만족해야 함). 유효한 명령을 못 만들어도 0.3초까지는 재시도한다.

${F}mermaid
flowchart LR
    P["✉️ /plan 중 앞쪽 부분<br/>0.30 m 간격 5점 → 로봇 기준 좌표 (÷2.0)"] --> OBS
    E["✉️ /nvblox_node/combined_esdf_pointcloud<br/>nvblox 2D 거리장 점구름 · 🔄 동적"] --> SC["가상 스캔 360방향<br/>방향마다 가장 가까운 장애물 거리 (÷3.5 m)"]
    SC --> OBS
    S["속도 v · ω (EKF /odometry/filtered)<br/>자이로 · 직전 행동 2개"] --> OBS
    OBS["관측 벡터 375개<br/>10 + 360 + 3 + 2"] --> NN["🧠 ONNX 정책 (CUDA)"]
    NN -->|"행동 a0 · a1 (−1 ~ 1)"| CMD["v = a0 × 0.26 m/s (후진은 −0.052까지)<br/>ω = a1 × 1.82 rad/s"]
    CMD --> OUT["✉️ /cmd_vel_nav"]
    OBS -.->|"점구름 없음·0.5초 넘게 묵음 · 모델 없음 · enable false · 추론 실패"| DWB["DWB 대체 (속도 후보 20×20 궤적 점수)<br/>→ 전역 · 로컬 코스트맵 사용"]
    DWB -.-> OUT
${F}
- **관측 벡터 375개 = 웨이포인트 5×2 + 가상 스캔 360 + 속도·ω·자이로 3 + 직전 행동 2.** 학습 때(\`isaac\` 시뮬레이터)와 **같은 순서**여야 한다.
- **가상 스캔:** LiDAR가 없어서 nvblox ESDF 점구름(높이 0.03–0.30 m)을 로봇 기준으로 바꾼 뒤, **ESDF 값(장애물까지 거리)이 0.20 m 이하인 점만** 골라 방향마다(1° 간격) "로봇~장애물 표면 거리 − 2 cm"의 **최솟값**을 쓴다. 점구름이 **0.5초 넘게 안 오면 정책을 안 쓰고 DWB로 바꾼다.**
- **정책 출력:** 행동 \`a0, a1\` 을 \`[-1, 1]\` 로 자르고 속도로 바꾼다 — 전진 최대 0.26 m/s, 회전 최대 1.82 rad/s, 후진은 최대 0.052 m/s.
- **RL 정책은 로컬 코스트맵을 읽지 않는다** (읽은 코드 범위에서는 프레임 이름만 조회). 로컬 코스트맵(\`/local_costmap/costmap\`, 3×3 m, \`odom\` 프레임)은 **DWB 대체 때와 복구 동작**이 쓴다. 즉 **장애물 회피의 눈은 정책에게는 nvblox ESDF**다.
- **상태 확인:** \`/FollowPath/status\`, 1 Hz \`/diagnostics\` 로 지금 RL인지 DWB인지와 이유(1 모델 없음 · 2 enable=false · 3 센서 없음/묵음 · 4 추론 실패)를 낸다 — TUI 노드 상태가 읽는다.

**5단계 — 속도 명령이 바퀴까지 가는 길 (Nav2 쪽 연결)**

| 순서 | 노드 | 받는 토픽 → 내는 토픽 | 하는 일 |
|---|---|---|---|
| 1 | \`controller_server\` · \`behavior_server\` | → ✉️ \`/cmd_vel_nav\` (TwistStamped) | 자동 주행 명령 (launch 리매핑으로 이름이 정해짐) |
| 2 | \`twist_mux\` | \`/cmd_vel_nav\`(자동, 우선순위 10) · \`/cmd_vel_manual\`(수동, 100) → ✉️ \`/cmd_vel_mux\` | **수동이 이긴다.** 입력이 0.5초 안 오면 그 입력은 버림. \`/state/emergency\`(비상정지, 우선순위 255)가 true면 **전부 막음** |
| 3 | \`velocity_smoother\` | \`/cmd_vel_mux\` → ✉️ \`/cmd_vel_smoothed\` | 20 Hz로 가속을 다듬음 (최대 0.26 m/s · 1.82 rad/s, 가속 2.5 · 3.2) |
| 4 | \`collision_monitor\` | \`/cmd_vel_smoothed\` → ✉️ \`/cmd_vel\` | **맨 마지막 안전장치.** \`/pole_front_cam/depth/color/points_filtered\` 점구름으로 **1초 안에 반경 0.20 m 원에 닿을 방향만** 멈춤, 0.30 m 안은 **절반 속도**. 점구름이 1초 안 오면 **정지**. **수동·맵핑 중엔 꺼짐** |
| 5 | \`diff_drive_controller\` (ros2_control) | \`/cmd_vel\` → 바퀴 속도 | 바퀴 두 개의 속도로 바꿔 모터에 보냄 |

- 정책보다 **뒤에** 안전장치가 있다: 정책이 이상한 값을 내도 \`collision_monitor\` 가 마지막에 거른다.
- 체인 전체가 \`TwistStamped\` 로 통일돼 있다 (\`enable_stamped_cmd_vel\`, \`use_stamped\`).

**정적일까, 동적일까?** — Nav2 일반 구성과 이 로봇은 다르다.

| | Nav2 일반 구성 | 이 로봇 (cuVSLAM+nvblox) |
|---|---|---|
| \`/map\` 을 내는 노드 | \`map_server\` — 파일을 **한 번** 읽어 한 번 낸다 | \`nvblox_map\` — **새 격자가 올 때마다** 1 Hz로 계속 다시 낸다 |
| 지도 | **정적** (고정) | **동적 + 잊음** — 위치추정 중에도 nvblox가 새 깊이를 쌓고, **안 보는 곳은 잊는다** |
| 실측 (위치추정, 40초) | — | \`/map\` 41개 중 **17–21개** 내용이 달랐고, \`/global_costmap/costmap\` 은 **13번** 바뀌었고, 지도 크기도 바뀐 적이 있다 |

- **전역 구간 전체가 동적이다**: nvblox → \`/map\` → \`static_layer\` → \`/global_costmap/costmap\` → 플래너. 컨트롤러가 보는 ESDF 점구름도 같은 nvblox에서 나오므로 동적이다.
- 일어날 수 있는 일 (**구조상 추정, 재현은 미확인**): 바닥 잡음 같은 **가짜 장애물이 \`/map\` 에 굳음** · 같은 목표인데 지도가 달라져 **경로가 달라짐** · 출발 자리가 저장 때와 다르면 어긋난 위치에 새 벽이 덧그려짐.
- 전역 \`obstacle_layer\` 가 꺼져 있어서, 전역 계획에 **새 장애물이 들어오는 길은 \`/map\` 갱신(= nvblox가 지도에 쌓는 것) 하나뿐**이다. 가까운 장애물은 컨트롤러가 ESDF로 피한다. 이 설계가 의도인지는 미확인.
- 사람이 지나간 자국이 \`/map\` 에 **남는지**는 아직 측정하지 않았다.
- ⚠ **"플래너가 지금 보이는 곳만 아는 것 아닌가?" — 맞다. 실측으로 확인했다** (바로 아래 "⚠ 실측" 절). nvblox가 **안 보는 곳을 잊기** 때문이다 (소스 기본: \`decay_tsdf_rate_hz\` 5 Hz · \`tsdf_decay_factor\` 0.95 — 이 값으로 측정함. 지금 \`nvblox.yaml\` 은 \`decay_tsdf_rate_hz: 0\` 으로 **꺼 둠**, 반영 전).
- 이 흐름은 설정·BT 파일·코드(\`nav2_params.yaml\` · \`navigate_to_pose.xml\` · \`rl_nav_controller.cpp\` · \`twist_mux.yaml\` · \`ros_system.launch.py\`)를 읽어 정리했다. 목표 하나를 처음부터 끝까지 실기에서 따라가며 확인한 것은 아니다.

### 🎯 미션 때는? — 목표가 "상자·퍽 위치"일 때 (mission_manager → coordinator → Nav2)
**네비게이션 엔진은 위에서 설명한 것과 똑같다.** 달라지는 건 ① **누가 목표를 주는가**, ② **마지막 몇 cm를 누가 움직이는가**다. 이 절은 \`mission_manager.cpp\` · \`coordinator.cpp\` · \`approach_skill.cpp\` 를 읽어 정리했다 (미션 한 판을 실기에서 돌려 확인한 것은 아님).

${F}mermaid
flowchart TD
    MM["🛠️ mission_manager<br/>주사위 기억 미션의 순서 (관측 → 조사 → 쌓기 → 확인 → 복귀)"] -->|"✉️ /task/sub_goals<br/>navigate x,y,yaw · approach · inspect · pick · place …"| CO["🛠️ coordinator<br/>단계를 하나씩 skill에 맡김"]
    PE["📦 perception"] -->|"✉️ /tracked_objects<br/>퍽 tag·색·모양 · 상자 · map 좌표"| MM
    PE -->|"✉️ /tracked_objects"| CO
    CO -->|"🎬 /skills/navigate"| NS["🛠️ navigate_skill"]
    NS -->|"🎬 /navigate_to_pose (map x·y·yaw)"| NAV["📦 Nav2<br/>(앞에서 설명한 그대로)"]
    CO -->|"🎬 /skills/approach"| AP["🛠️ skill_approach<br/>저속 정밀 도킹 (RL 정책)"]
    AP -->|"✉️ /cmd_vel_nav"| CH["twist_mux → velocity_smoother<br/>→ collision_monitor → /cmd_vel"]
    NAV -->|"✉️ /cmd_vel_nav"| CH
    CV["📦 cuvslam_slam<br/>🔗 TF map→odom"] -.->|"로봇 위치 (TF map→base_footprint)"| CO
    CV -.-> NAV
    NV["📦 nvblox<br/>✉️ /map · ESDF 점구름"] -.-> NAV
${F}

**1. 목표 좌표는 어디서 오나**
- **상자(시작 박스 6곳 · 장소)** 는 설정에 **경기장 좌표(arena, m)** 로 있다. \`mission_manager\` 가 \`start_pose_arena\` **하나**로 \`map\` 좌표로 바꾼다 (\`mission_solver arena_to_map\`) — **map 원점 = cuVSLAM이 켜질 때의 출발 자리**라서, 이 변환이 맞으려면 **로봇을 \`start_pose_arena\` 와 같은 자리·방향에 놓고 켜야** 한다. 어긋나면 **모든 목표가 통째로 밀리거나 돈다.**
- **퍽** 위치는 설정이 아니라 **실행 중 \`perception\` 이 \`/tracked_objects\` 로** 알려 준다 (tag · 색 · 모양 + \`map\` 좌표). 인지는 안 보이는 물체를 **2초 뒤 지우므로** 퍽은 **tag로 기억**하고 집기 직전에 다시 찾는다.
- 이 로봇에는 "지도를 파일로 받아 쓰는" 길이 없다 (읽은 코드 범위). 지도는 **먼저 맵핑해 저장한 nvblox 지도**를 위치추정으로 불러오는 구조이고, 미션 좌표는 그 \`map\` 좌표계와 같은 **출발 자리 기준**이다.

**2. 퍽·상자를 차례로 들를 때 한 번의 이동**
1. \`mission_manager\` 가 단계를 \`/task/sub_goals\` 로 낸다 → \`coordinator\` 가 **한 단계씩** skill에 맡긴다 (실패하면 \`max_step_failures\` 번 연속 실패 시 정지).
2. **멀리 가기 = Nav2.** \`navigate\` 가 🎬 \`/skills/navigate\` → \`navigate_skill\` → 🎬 \`/navigate_to_pose\` 로 **상자 변 앞(\`standoff\`)** 까지 간다. 이 구간이 앞 절의 **플래너 + RL 컨트롤러** 그대로다.
3. **마지막 몇 cm = \`approach\`.** Nav2는 로봇을 반경 0.18 m 원으로 보고 도착 허용 오차도 0.10 m라서 **상자에 못 붙는다.** 그래서 \`skill_approach\` 가 **자체 RL 정책으로 저속(≤ 0.12 m/s) 직진**해 \`approach_gap\`(0.085 m)까지 붙는다. **Nav2의 플래너·코스트맵은 안 쓰고** 곧바로 ✉️ \`/cmd_vel_nav\` 로 낸다 — 같은 \`twist_mux → … → collision_monitor\` 를 거치므로 **비상정지·충돌감시는 그대로** 먹는다.
4. 팔 작업(\`inspect\` → \`pick\` → \`load\`)이 이어진다. 퍽이 팔이 닿는 거리(\`reach_m\`) 밖이면 \`coordinator\` 가 먼저 **퍽을 바라보며 \`approach_m\` 앞 자리로 \`navigate\`** 한다 (계획에 navigate가 없어도).
5. 복귀(\`RETURN\`)는 처음엔 Nav2로, 구역 가운데 **보정은 \`approach\` 의 \`park_home\` 정책**(5 cm · 10° 안, 3초 정지)으로 한다.

**3. nvblox · cuVSLAM은 미션에서 무슨 일을 하나**
| | 하는 일 | 미션에서 생각할 점 |
|---|---|---|
| \`cuvslam_slam\` | TF \`map→odom\` → 로봇이 \`map\` 어디인지. \`coordinator\` 가 **TF \`map→base_footprint\`** 로 퍽까지 거리(\`reach_m\` 판단)와 다가갈 자리를 계산, Nav2·\`approach\` 도 이 위치로 움직임 | **위치 오차가 쌓이면 목표가 어긋난다.** 상자 앞에서는 **장소 태그로 칸 위치를 보정**하고, 퍽은 **손 카메라 상대값**으로 맞춰 집는다 — map 오차를 그 단계에서 다시 잡는 장치 |
| \`nvblox\` \`/map\` | 전역 플래너가 **벽을 피해 상자까지 가는 길**을 만든다 | 동적 지도 + **시야 밖을 잊음(실측)** — 안 보이는 복도는 모름 칸이라 경로가 벽을 무시할 수 있다 |
| \`nvblox\` ESDF | RL 컨트롤러가 **눈앞 벽·상자를 피한다** | **퍽(높이 약 6 cm)은 \`esdf_slice_min_height 0.08\` 밑이라 \`/map\`·ESDF에 안 남는다** (설정 주석: "퍽은 지도 대상 아님 — 인지가 따로"). 퍽은 \`/tracked_objects\` 로만 안다 — 로컬 코스트맵의 \`voxel_layer\`(높이 0.03 m부터)는 점구름으로 볼 수 있다 |

- 그래서 **"전체 지도가 주어진다"** 는 이 로봇에서 **"맵핑으로 만들어 저장한 지도 + 같은 출발 자리"** 와 같은 말이다. 출발 자리가 틀리면 지도도 목표도 같이 틀어진다.
- ⚠ 실측: 맵핑 녹화에서 **시야 밖 지도가 잊힌다** ("⚠ 실측" 절). 미션 경로가 복도를 길게 우회하므로, **이미 맵핑한 복도도 수십 초 안 보면 모름 칸**이 되어 플래너가 **벽을 무시한 경로**를 낼 수 있다 — 미션 한 판에서 실제로 그렇게 되는지는 **돌려 확인하지 않았다.**

### ⚙ 설정값 모음 — 어떤 config가 동작을 어떻게 바꾸나
지금까지 설명한 동작은 전부 **설정 파일의 값**이 정한다. 파일마다 **"우리가 직접 적은 값"** 과 **"안 적어서 기본값으로 도는 값"** 이 있고, 뒤쪽이 더 위험하다 (눈에 안 보이니까). 표의 **기본값은 bee에 설치된 nvblox 소스에서 읽은 것**(\`node_params.hpp\` · \`mapper_params.h\` 등)이고, 실행 중인 노드에서 읽은 값은 아니다.

**① nvblox — 우리가 직접 적은 값** (\`ros_system/config/nvblox.yaml\`, 적힌 것만 덮어쓰고 나머지는 기본값)

| 파라미터 | 우리 값 | nvblox 기본 | 하는 일 · 바꾸면 |
|---|---|---|---|
| \`global_frame\` | \`map\` | — | 지도 좌표 기준. cuVSLAM의 \`map\` 과 같아야 함 |
| \`num_cameras\` | 2 | 1 | 깊이 구독 카메라 수 (pole_front_cam + gripper_cam) |
| \`voxel_size\` | 0.05 m | 0.05 m | 복셀 한 칸 크기 = 지도 해상도. 줄이면 정밀하지만 GPU 메모리·시간이 급증 |
| \`mapping_type\` | \`dynamic\` | — | 움직이는 물체를 따로 구분해 쌓음 (static 층 + dynamic 층) |
| \`esdf_mode\` | \`2d\` | — | 장애물 거리장(ESDF)을 높이 단면 한 장으로만 계산 (3d보다 가벼움) |
| \`use_color\` | \`false\` | true | 색 통합 끔 — GPU·메모리 절약, 대신 RViz 메시가 회색 |
| \`use_lidar\` | \`false\` | **true** | LiDAR 안 씀 (이 로봇엔 없음) |
| \`input_qos\` | \`SENSOR_DATA\` | — | RealSense 드라이버 QoS와 맞춤 |
| \`integrate_depth_rate_hz\` | 15 | 40 | 깊이를 지도에 쌓는 속도. 카메라가 15 fps라 그 이상은 의미 없음 |
| \`integrate_color_rate_hz\` | 0 | 5 | 색 통합 속도 (꺼짐) |
| \`update_mesh_rate_hz\` | 2 | 5 | 3D 메시 갱신 (보기용) |
| \`update_esdf_rate_hz\` | 5 | 5 | ESDF·점유 격자 갱신 → \`static_occupancy_grid\` 가 초당 약 4.8번 나오는 이유 |
| \`publish_layer_rate_hz\` | 2 | 10 | 시각화 레이어 발행 |
| \`map_clearing_radius_m\` | **-1** | **5.0** | 로봇에서 이 반경 밖 블록을 **지우는** 기능. 기본은 5 m 밖을 지움 → 우리는 \`-1\` 로 **꺼서** 경기장 전체를 유지하려 함 |
| \`decay_tsdf_rate_hz\` | **0** | **5** | 안 보는 곳을 **잊는** 속도. **0 = 잊기 끔.** 기본이면 정지한 로봇의 \`/map\` 아는 칸이 시야 크기로 줄었다 ("⚠ 실측" 절). 단점: 한 번 들어간 가짜 장애물·사람 자국이 안 지워짐 |
| \`static_mapper.esdf_slice_min_height\` | 0.08 m | 0 | 2D 격자로 자르는 **최저 높이**. 0.03일 때 바닥 잡음이 가짜 장애물이 돼서 올림 |
| \`static_mapper.esdf_slice_max_height\` | 0.3 m | 1.0 | **최고 높이**. 이 위(탁자 위·어깨높이)는 플랜에 없음 |
| \`static_mapper.esdf_slice_height\` | 0.1 m | 1.0 | ESDF 거리 슬라이스·점구름을 내는 높이 |
| \`static_mapper.projective_integrator_max_integration_distance_m\` | 4.5 m | 7.0 | 이 거리보다 먼 깊이는 안 쌓음. 멀수록 잡음이 큼 (바닥 잡음이 보이면 4.0 → 3.0으로) |
| \`static_mapper.workspace_bounds_type\` | \`height_bounds\` | \`unbounded\` | 쌓을 높이 범위를 제한 |
| \`static_mapper.workspace_bounds_min/max_height_m\` | -0.1 / 0.8 | 0 / 1.0 | 바닥 아래·0.8 m 위는 안 쌓음 |

**② nvblox — 안 적어서 기본값으로 도는 값 (눈여겨볼 것)**

| 파라미터 | 기본값 | 하는 일 | 이 로봇에서 생각할 점 |
|---|---|---|---|
| **\`decay_tsdf_rate_hz\`** | **5** Hz → **우리가 0으로 설정함** (\`nvblox.yaml\`) | TSDF **잊기**를 부르는 속도. \`≤ 0\` 이면 소스(\`shouldProcess\`)가 잊기를 **아예 안 부른다** | **끔 — bee 반영·재측정 전.** 기본(5 Hz)이면 아래 계산대로 잊힘 |
| **\`tsdf_decay_factor\`** | **0.95** | 한 번 잊을 때 가중치에 곱하는 값 | 5 Hz × 0.95 → 초당 약 0.77배 |
| \`tsdf_decayed_weight_threshold\` | 1e-3 | 이 아래면 "완전히 잊음" | |
| \`decay_integrator_deallocate_decayed_blocks\` | **true** | 완전히 잊은 블록을 메모리에서 **해제** | 지도 크기가 줄어드는 한 가지 이유일 수 있음 |
| \`tsdf_set_free_distance_on_decayed\` | false | 잊은 복셀을 "빈 공간"으로 칠할지 | false = 그냥 정보 없음 |
| \`projective_integrator_max_weight\` | 5 | 복셀 가중치 상한 | 한 곳을 오래 봐도 5 이상은 안 쌓임 |
| \`projective_integrator_weighting_mode\` | 역제곱 | 먼 깊이일수록 가중치를 작게 | |
| \`decay_dynamic_occupancy_rate_hz\` | 10 Hz | **동적 점유 층**을 잊는 속도 (\`mapping_type: dynamic\` 일 때만) | 움직이는 물체 자국이 빨리 사라지게 하는 장치 |
| \`free_region_decay_probability\` · \`occupied_region_decay_probability\` | 0.55 · 0.4 | 잊을 때 빈 칸·벽 칸 확률이 0.5(모름) 쪽으로 가는 정도 | |
| \`occupancy_decay_to_free\` | false | 다 잊은 칸을 빈 칸이 아니라 **모름**으로 | 모름 → \`allow_unknown\` 때문에 플래너가 지날 수 있음 |
| \`max_tsdf_distance_for_occupancy_m\` | 0.15 m | 표면에서 이 거리 안이면 "점유"로 봄 | 얇은 벽도 15 cm 두께로 보일 수 있음 |
| \`unobserved_esdf_policy\` | \`kIgnore\` | 본 적 없는 복셀을 ESDF 계산에서 **건너뜀** | 못 본 곳은 장애물도 빈 곳도 아닌 "모름" |
| \`clear_map_outside_radius_rate_hz\` | 1 Hz | 반경 밖 지우기를 부르는 속도 | \`map_clearing_radius_m=-1\` 이라 효과 없음 |
| \`tick_period_ms\` · \`maximum_input_queue_length\` | 10 ms · 10 | 메인 루프 주기 · 입력 대기열 길이(넘치면 오래된 것부터 버림) | 부하가 몰리면 깊이 프레임이 조용히 버려질 수 있음 |

**③ 위 값들이 합쳐서 만드는 일 — 계산해 보면** (소스의 기본값 + 우리 설정, **실측 아님**)
- **잊기 속도:** 카메라가 **방금 본 곳을 뺀** 복셀의 가중치가 0.2초마다 0.95배가 된다. 가중치가 최대(5)였다면 1e-3 아래까지 \`ln(2e-4)/ln(0.95)\` ≈ **166번 ≈ 33초**, 가중치 1이었다면 약 27초. **반감기는 약 2.7초.**
- 그래서 **저장 지도를 불러와도 카메라가 안 보는 곳은 이 속도로 잊힌다 (실측 — "⚠ 실측" 절).** 잊은 블록은 해제되고(\`deallocate true\`), ESDF는 못 본 칸을 건너뛰니(\`kIgnore\`) \`/map\` 에서는 **-1(모름)** 이 될 것으로 예상된다 — **끝까지 실기에서 확인하지 않았다.**
- **높이:** 단면이 **0.08–0.30 m** 라서 그 밖의 물체는 플랜에 없다. 바닥 잡음을 줄이려 올린 0.08이 낮은 물체를 지도에서 뺀다.
- **거리:** 4.5 m보다 먼 깊이는 안 쌓는다 → 방이 크면 멀리 있는 벽은 가까이 가야 지도에 생긴다.
- **복셀:** 0.05 m = 5 cm. Nav2 코스트맵 해상도(0.05)와 같게 맞춘 값이라 **둘 중 하나만 바꾸면 안 된다.**

**④ cuVSLAM 설정** (\`cuvslam_slam.py\` 파라미터, 위치추정에서 중요한 것)

| 파라미터 | 값 | 영향 |
|---|---|---|
| \`map_tf_tolerance\` | 0.5 s | \`map→odom\` 을 미래 시각으로 내는 여유. 0.2 s일 때 목표 이동이 \`Failed to transform end pose\` 로 실패 |
| \`min_depth\` | 0.5 m | 카메라 앞 0.5 m 안(자기 팔)은 추적에서 뺌 |
| \`publish_map_tf\` | true | false면 \`map→odom\` 안 냄 |
| \`linear_variance\` · \`angular_variance\` | 0.0025 | EKF가 cuVSLAM 속도를 얼마나 믿는지 (작을수록 많이 믿음) |
| 모드 | RGBD + 루프 클로저 + 평면 제약 | IMU 없는 D435라 VIO 불가, 바닥이 평평하다고 가정해 x·y·yaw만 사용 |

**⑤ Nav2 설정** (\`ros_system/config/nav2_params.yaml\`) — 계획·주행 동작을 정하는 값

| 노드 | 값 | 영향 |
|---|---|---|
| \`global_costmap\` | 갱신·발행 1 Hz · 해상도 0.05 · \`track_unknown_space\` true · plugins \`static_layer\`·\`inflation_layer\` | 플래너가 보는 지도. **\`obstacle_layer\` 는 plugins에 없어 꺼짐** |
| \`global_costmap\` \`static_layer\` | \`map_subscribe_transient_local\` true | 늦게 켜져도 마지막 \`/map\` 을 받음 |
| 두 코스트맵 \`inflation_layer\` | 반경 0.18 m · \`cost_scaling_factor\` 3.0 · \`robot_radius\` 0.16 | 벽에서 0.16 m 안은 못 지남, 0.18 m 밖은 비용 0 |
| \`local_costmap\` | 3×3 m rolling · 5 Hz 갱신 · 2 Hz 발행 · \`voxel_layer\` (점구름 높이 0.03–0.6 m, 거리 0.2–2.5 m, 지우기 3.0 m) | DWB 대체와 복구가 쓰는 지도 |
| \`planner_server\` | NavFn \`use_astar\` true · \`allow_unknown\` true · \`tolerance\` 0.20 m · \`expected_planner_frequency\` 5 Hz | 모름 칸을 지날 수 있음, 목표가 벽 안이면 0.2 m 이내로 대신 감 |
| \`bt_navigator\` | \`bt_loop_duration\` 10 ms · \`default_server_timeout\` 100 ms · \`wait_for_service_timeout\` 10 s · BT 복구 후진 0.10 m | 서버 응답 대기. 20 ms일 때 부하가 몰리면 목표가 통째로 실패 |
| \`controller_server\` | 20 Hz · \`failure_tolerance\` 0.3 s · \`progress_checker\` (0.3 m / 10 s) · \`goal_checker\` 위치 0.10 m · 방향 0.15 rad · \`stateful\` false | 막힘·도착 판단 |
| \`FollowPath\` (RL) | \`points_topic\` ESDF 점구름 · \`esdf_max_distance\` 0.20 m · 높이 0.03–0.30 m · \`cloud_timeout\` 0.5 s · \`lookahead\` 5점 · \`wp_step\` 0.30 m · \`lidar_rays\` 360 · \`lidar_max\` 3.5 m · \`lidar_inflation\` 0.02 m · \`max_lin\` 0.26 · \`max_ang\` 1.82 · \`v_min_ratio\` -0.2 | 정책 입력·출력 스케일. **학습 때와 같아야** 한다 |
| DWB (대체용) | \`sim_time\` 1.5 s · 속도 후보 20×20 · critics: \`PathAlign\` 32 · \`GoalAlign\` 24 · \`PathDist\` 32 · \`GoalDist\` 24 · \`RotateToGoal\` 32 · \`BaseObstacle\` 0.02 | 정책을 못 쓸 때 경로 추종 |
| \`velocity_smoother\` | 20 Hz · 최대 0.26 m/s · 1.82 rad/s · 가속 2.5 · 3.2 | 급가속 방지 |
| \`collision_monitor\` | \`Approach\` 반경 0.20 m · 충돌 예상 1.0 s · \`SlowZone\` 0.30 m → 50% · 점구름 높이 0.05–0.6 m · \`source_timeout\` 1.0 s | 마지막 안전장치 |
| \`twist_mux\` | 자동 10 · 수동 100 · 비상정지 255 · 입력 0.5 s 안 오면 버림 | 명령 우선순위 |

- 한 가지 짚으면 **지도 쪽과 주행 쪽 값은 서로 묶여 있다**: 복셀 0.05 ↔ 코스트맵 해상도 0.05는 같게 맞춘 값이다. 높이도 마찬가지다 — RL의 \`z_min: 0.03\`(0.03–0.30 m)은 **nvblox가 이미 \`esdf_slice\` 0.08–0.30 m로 자른 점구름에 거는 필터**라서, 0.08로 올린 뒤에는 **컨트롤러도 실제로는 0.08 m 위만 본다** (RL 쪽 0.03은 옛 값이 남은 것). 학습 때(0.03–0.30)와 입력 범위가 달라졌을 수 있다 — 영향은 미확인.
- 값을 바꾼 뒤엔 **nvblox를 다시 띄워야** 반영된다 (맵핑·위치추정 모드 전환 때 launch째 다시 뜸).
- 실행 중 값 확인: \`ros2 param get /nvblox_node <이름>\` (이름 오타는 오류 없이 무시되고 기본값으로 돈다).

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
- 행 3–4(Cartographer · slam_toolbox)는 LiDAR가 있는 로봇 기준이다.
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
