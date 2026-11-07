import {
  addEventListener,
  elementDefine,
  onConnectedAfter,
  onConnectedBodyShadow,
  swcAppRouteGo,
} from '@dooboostore/simple-web-component';
import { markdownParse } from '@center-src/utils/markdown';

const tagName = 'center-ros2-slamstack';

// SLAM 구성 — 위치 담당·지도 담당을 한 노드로 하나 둘로 나누나. 원리(map→odom·TF)는 맵핑·위치추정 탭.
const MD = `
## 위치 따로, 지도 따로 — 한 노드로 하나, 둘로 나누나

SLAM은 두 질문에 답합니다. **"나는 어디 있나"(위치추정)**와 **"주변에 뭐가 있나"(지도)**. 둘을 한 노드가 같이 하기도 하고, **단계로 나누기도(지도는 미리 만들고 운행 땐 위치만)**, **역할로 나누기도(위치 노드 + 지도 노드 동시에)** 합니다.

\`\`\`mermaid
flowchart LR
    subgraph TWO["③ 역할로 나눔 — cuVSLAM + nvblox"]
        S2["스테레오 IR + IMU"] -->|"영상 · 각속도"| L["cuVSLAM<br/>위치만"]
        D2["depth"] -->|"거리 영상"| M["nvblox<br/>지도만"]
        L -->|"카메라 위치 (TF)"| M
        L -->|"map→odom"| NAV2["Nav2"]
        M -->|"costmap 레이어"| NAV2
    end
    subgraph PH["② 단계로 나눔 — 2D LiDAR + Cartographer → AMCL"]
        LD["2D LiDAR /scan"] -->|"✉️ /scan"| CA["Cartographer<br/>매핑 때만"]
        CA -->|"저장"| MF[("map.pgm·yaml")]
        MF -->|"읽기"| MSV["map_server"] -->|"✉️ /map"| AM["AMCL<br/>운행 때 위치만"]
        LD -->|"✉️ /scan"| AM
        AM -->|"map→odom"| NAV3["Nav2"]
        MSV -->|"/map (고정)"| NAV3
    end
    subgraph ONE["① 한 노드가 둘 다 — RTAB-Map · slam_toolbox"]
        S1["센서"] -->|"스캔 · 영상"| N1["SLAM 노드"]
        N1 -->|"map→odom (위치)"| NAV1["Nav2"]
        N1 -->|"/map (지도)"| NAV1
    end
\`\`\`

**② 단계로 나눔**은 지도를 미리 한 번 만들어 파일로 저장하고, 운행 중엔 그 고정 지도 위에서 위치만 찾습니다. 운행 중엔 지도가 안 바뀌므로 가볍고 안정적이지만, 가구를 옮기면 다시 매핑해야 합니다.

**③ 역할로 나눔**에서 핵심은 화살표 하나입니다. **지도 노드는 스스로 위치를 모릅니다.** 위치 노드가 TF로 "이 depth를 찍은 순간 카메라가 어디 있었나"를 알려 줘야 depth를 제자리에 쌓습니다. 위치가 틀리면 지도도 같이 번집니다.

| | 위치 결과 | 지도 결과 | 지도 종류 | 센서 |
| --- | --- | --- | --- | --- |
| slam_toolbox | map→odom | \`/map\` 2D 격자 | 2D | 2D LiDAR |
| Cartographer | map→odom | \`/map\` 2D 격자 (occupancy_grid_node) | 2D (3D도 가능) | LiDAR (+ IMU) |
| RTAB-Map | map→odom | \`/map\` 2D 격자 + 3D 점구름 | 2D·3D | RGB-D · 스테레오 · LiDAR |
| **cuVSLAM** | map→odom · 시각 오도메트리 | 특징점 지도 — **위치를 다시 찾는 용도, 장애물 판단엔 못 씀** | 희소 | 스테레오 카메라 + IMU |
| **nvblox** | 없음 (TF를 받음) | ESDF 거리장 → Nav2 costmap 레이어 | 3D 촘촘 | depth (+ 사람 마스크) |
| AMCL (참고) | map→odom | 없음 (저장 지도를 받음) | — | 2D LiDAR |

### 무엇을 대체하나 — 기존 패키지와 짝지어 보기

| | 대응하는 기존 패키지 | 대체하는 범위 |
| --- | --- | --- |
| **cuVSLAM** | ORB-SLAM3 · VINS-Fusion · RTAB-Map의 **위치 부분** (시각 SLAM / VIO) | 위치 추적 + 루프 클로저. RTAB-Map처럼 2D \`/map\`까지 내지는 않음 |
| **nvblox** | **Voxblox**(같은 계열의 후속) · OctoMap · Nav2 costmap의 voxel 층 | 3D 장애물 지도 → costmap. 위치는 안 찾음 |
| (참고) Cartographer · slam_toolbox | LiDAR SLAM | cuVSLAM과 바로 짝은 아님 — 센서가 다름 (LiDAR ↔ 카메라) |

그래서 RTAB-Map 하나를 cuVSLAM + nvblox로 바꾸면 **위치는 cuVSLAM, 장애물 지도는 nvblox**로 일이 갈라지고, nvblox는 SLAM 자리가 아니라 **costmap 쪽 자리**에 들어갑니다.

### ③에서 매핑할 때도 nvblox가 돈다 — 지도가 두 개

역할로 나눈 구조는 매핑·운행을 가리지 않고 두 노드가 **항상 같이** 돕니다. 대신 지도가 두 개라 저장·불러오기도 두 번입니다.

| | cuVSLAM | nvblox |
| --- | --- | --- |
| 매핑 때 쌓는 것 | 특징점 지도 (위치를 다시 찾는 용도) | 3D 장애물 지도 (TSDF·ESDF, 사람은 빼고) |
| 매핑 중 쓰는 곳 | map→odom (위치) | costmap → 탐사(프론티어)·경로 |
| 저장 | 🎬 \`visual_slam/save_map\` | 📞 \`/nvblox_node/save_map\` → \`.nvblx\` |
| 운행 때 | \`load_map_and_localize\`로 위치 다시 찾기 | 📞 \`/nvblox_node/load_map\`으로 장애물 지도 올리기 |

- **둘 다, 같은 map 좌표계로 짝 맞춰** 저장합니다. cuVSLAM만 불러오면 위치는 찾지만 nvblox가 빈 상태라 안 본 곳은 global planner가 모르고, nvblox만 불러오면 위치를 못 찾아 지도를 제자리에 못 놓습니다.
- **사람은 nvblox가 알아보는 게 아닙니다.** PeopleSemSegNet(분할 DNN)이 "이 픽셀은 사람" 마스크를 주면, nvblox는 그 픽셀의 depth만 사람 층(금방 지움)에 담습니다. 그래서 저장 지도에 지나간 사람이 안 남습니다.
- 데이터 흐름: cuVSLAM → **TF**(map→odom) → nvblox. 토픽으로 직접 주고받지 않고, nvblox가 depth 시각으로 TF를 조회해 카메라 자세를 얻습니다.

### 나누면 좋은 점
- **각자 빠르다.** 위치는 가벼운 특징점으로 빠르게, 지도는 GPU로 촘촘하게 — Isaac ROS가 이 방식.
- **바꿔 끼우기 쉽다.** 위치 담당만 바꾸거나(cuVSLAM ↔ EKF+AMCL), 지도 담당만 바꿀 수 있다.

### 나누면 생기는 문제
- **루프 클로저가 지도에 반영되지 않는다.** 위치 노드가 루프 클로저로 위치를 고쳐도 지도 노드는 이미 쌓은 복셀을 옮기지 않는다 → 고친 순간 이중 벽. 그래서 nvblox 같은 지도는 주변 위주로 쓰고 오래된 부분은 지운다. 한 노드 구조(RTAB-Map·Cartographer)는 루프 클로저 때 지도도 같이 다시 그린다.
- **같은 센서를 다르게 원할 수 있다.** cuVSLAM은 RealSense IR 프로젝터를 끄길, nvblox는 켜길(depth 품질) 원한다 → 번갈이 모드나 카메라 분리.
- **저장이 따로다.** 위치 지도(cuVSLAM \`save_map\`)와 장애물 지도를 각각 관리.

## 실전 세 구성 한눈에 — 이 로봇(컵 가져오기)에 붙이면

| | 🟩 RTAB-Map (현재) | 🟦 2D LiDAR + Cartographer | 🟪 cuVSLAM + nvblox (Isaac ROS) |
| --- | --- | --- | --- |
| 나누는 방식 | ① 한 노드 | ② 단계로 (매핑 → 운행) | ③ 역할로 (위치 + 지도) |
| SLAM 센서 | RealSense RGB-D 2대 | 2D LiDAR 1대 | RealSense 스테레오 IR + IMU |
| 매핑 | rtabmap (매핑 모드) | cartographer_node + occupancy_grid_node | cuVSLAM (+ nvblox 3D 지도) |
| 운행 중 위치 | rtabmap (위치추정 모드, 같은 DB) | **map_server + AMCL** | cuVSLAM (load_map_and_localize) |
| Nav2가 보는 지도 | 2D \`/map\` | 2D \`/map\` (고정 파일) | nvblox costmap 레이어 (정적 /map 없음) |
| 자동 탐사(프론티어) | \`/map\`에서 | \`/map\`에서 | **global costmap(nvblox)에서** — /map이 없어서 explorer를 고쳐야 함 |
| 장애물 | 카메라 점구름 | **/scan (360°)** + 카메라 점구름 (높은 물체) | nvblox (사람 층 분리 — 사람 판단은 PeopleSemSegNet 마스크) |
| 저장 | rtabmap.db 하나 | .pbstream + map.pgm·yaml | **두 개, 짝 맞춰**: cuVSLAM 지도({B}save_map{B} 액션) + nvblox {B}.nvblx{B}({B}~/save_map{B} 서비스) |
| 모드 전환 | 실행 중에 (set_mode_*) | launch 다시 (map:=slam ↔ saved) | 실행 중에 (cuVSLAM {B}load_map_and_localize{B} + nvblox {B}~/load_map{B}) |
| 계산 | CPU | **CPU 가벼움** | **NVIDIA GPU 필수** |
| 강점 | 카메라만으로 지도+위치, 3D 정보 | 검증된 표준, 넓은 시야, 어두워도 됨, 튜닝 자료 많음 | 빠른 시각 추적, 3D 장애물·사람 구분 |
| 약점 | 특징 적은 벽·조명 변화에 약함, 무거움 | 한 높이만 봄(테이블 상판 못 봄), 팔이 시야를 가림, 센서 추가 | GPU·Jetson 필요, emitter 충돌, 루프 클로저가 지도에 반영 안 됨 |
| 언제 고르나 | 센서 추가 없이 카메라만 | 실내 평면, 안정성 우선, 처음 만드는 로봇 | 사람이 많은 공간, 3D 장애물이 많고 GPU가 있을 때 |

> Cartographer는 upstream 유지보수가 사실상 멈춰서, **새로 시작한다면 같은 자리에 slam_toolbox**를 많이 씁니다 (입력 /scan, 출력 /map·map→odom으로 바꿔 끼우기 쉬움). 구조(② 단계로 나눔)는 같습니다.

> 어느 구조든 **map→odom을 내는 노드는 하나**여야 합니다. 나눈 구조에선 위치 노드만 map→odom을 내고, 지도 노드(nvblox)는 TF를 받기만 합니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosSlamStack extends w.HTMLElement {
    /** 실전노드설계 전체 아키텍처의 구성 전환 (?slam=) · 맵핑·위치추정 탭 */
    @swcAppRouteGo
    private go(path: string) {
      return { path, scrollToTop: true };
    }

    @addEventListener('.ss-go', 'click', { delegate: true })
    onGo(e: Event) {
      const b = (e.target as HTMLElement).closest('.ss-go') as HTMLElement;
      if (b?.dataset.path) this.go(b.dataset.path);
    }

    @onConnectedAfter
    onReady() {
      markdownParse(this.shadowRoot?.querySelector('#ss-md') as HTMLElement, MD);
    }

    @onConnectedBodyShadow
    render() {
      const btn = (path: string, label: string) => `<button class="ss-go" data-path="${path}">${label}</button>`;
      return `
        <style>
          :host { display:block; }
          .ss-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:12px; }
          .ss-intro b { color:#22314e; }
          .ss-links { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
          .ss-go { padding:5px 12px; border-radius:14px; border:1.5px solid #3b82c4; background:#eff6ff; color:#1e3a8a; font:inherit; font-size:12px; font-weight:800; cursor:pointer; }
          .ss-go:hover { background:#dbeafe; }
          .md { font-size:13px; color:#334155; line-height:1.7; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:16px 0 6px; }
          .md h2:first-child { margin-top:0; }
          .md h3 { font-size:13px; font-weight:800; color:#1e293b; margin:14px 0 4px; }
          .md p, .md ul, .md ol { margin:0 0 8px; }
          .md ul, .md ol { padding-left:20px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .md pre { background:#f1f5f9; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; overflow-x:auto; }
          .md pre code { background:none; padding:0; }
          .md pre.mermaid { background:#fff; text-align:center; }
          .md pre.mermaid svg { max-width:100%; height:auto; }
          .md blockquote { border-left:3px solid #f59e0b; margin:8px 0; padding:2px 0 2px 12px; color:#475569; }
          .md table { display:block; overflow-x:auto; border-collapse:collapse; font-size:12px; margin:8px 0; }
          .md th, .md td { border:1px solid #e2e8f0; padding:6px 8px; text-align:left; vertical-align:top; }
          .md th { background:#f0f9ff; color:#0c4a6e; white-space:nowrap; }
        </style>
        <div class="ss-intro">
          SLAM은 <b>"나는 어디 있나"(위치)</b>와 <b>"주변에 뭐가 있나"(지도)</b> 두 질문에 답합니다. 이 탭은 둘을 <b>한 노드가 하느냐, 나누느냐</b>로 구성을 비교합니다.
          map→odom·TF가 왜 그렇게 생겼는지는 맵핑·위치추정 탭에 있습니다.
          <div class="ss-links">
            ${btn('/ros2?concept=slam', '📘 맵핑·위치추정 (원리)')}
            ${btn('/ros2?concept=localization', '📍 위치추정 (방법 비교·AMCL)')}
            ${btn('/ros2?concept=design&sec=arch', '🟩 실전 구성: RTAB-Map')}
            ${btn('/ros2?concept=design&sec=arch&slam=lidar', '🟦 실전 구성: 2D LiDAR + Cartographer')}
            ${btn('/ros2?concept=design&sec=arch&slam=isaac', '🟪 실전 구성: cuVSLAM + nvblox')}
          </div>
        </div>
        <div class="md" id="ss-md"></div>
      `;
    }
  }

  return tagName;
};
