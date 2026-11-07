import {
  addEventListener,
  elementDefine,
  onConnectedAfter,
  onConnectedBodyShadow,
  swcAppRouteGo,
} from '@dooboostore/simple-web-component';
import { markdownParse } from '@center-src/utils/markdown';

const tagName = 'center-ros2-localization';

// 위치추정 — 오도메트리(상대) + 지도 대조(절대) 두 층, 방법 비교, AMCL, 처음 위치. 원리(map→odom·TF)는 맵핑·위치추정 탭.
const MD = `
## 위치추정은 두 층 — "얼마나 움직였나" + "지도 어디인가"

로봇 위치는 한 가지 방법으로 찾지 않습니다. **짧게 정확하지만 계속 틀어지는 층**과 **가끔 띄엄띄엄이지만 틀어지지 않는 층**을 겹칩니다.

\`\`\`mermaid
flowchart LR
    subgraph ABS["② 절대 위치 — 지도 대조 (가끔, 툭 튀지만 드리프트 없음)"]
        MAP[("지도")] -->|"저장 지도"| LOC["AMCL · RTAB-Map ·<br/>Cartographer · cuVSLAM"]
        SEN["/scan · 영상"] -->|"지금 보이는 것"| LOC
    end
    subgraph REL["① 상대 위치 — 오도메트리 (매 순간, 매끄럽지만 드리프트)"]
        W["바퀴 엔코더"] -->|"✉️ /odom 앞 속도 vx"| EKF["EKF<br/>robot_localization"]
        I["IMU"] -->|"✉️ /imu 회전 속도 vyaw"| EKF
        VO["시각·LiDAR 오도메트리"] -->|"✉️ odometry 속도"| EKF
    end
    EKF -->|"odom → base_footprint"| TF(("TF"))
    LOC -->|"map → odom (보정값)"| TF
    TF -->|"map→base_footprint 조회"| NAV["Nav2"]
\`\`\`

| | ① 오도메트리 층 | ② 지도 대조 층 |
| --- | --- | --- |
| 답 | 직전보다 얼마나 움직였나 | 지도 위 어디인가 |
| TF | \`odom → base_footprint\` | \`map → odom\` |
| 주기 | 50~100 Hz, 끊김 없음 | 1~10 Hz, 맞출 때마다 |
| 오차 | **쌓인다** (미끄러짐·적분) | 안 쌓이지만 **틀리면 크게 틀림** |
| 쓰는 곳 | 속도 제어, 짧은 이동 | 목적지까지 경로, 지도 좌표 |

> 왜 위치를 직접 고치지 않고 map→odom으로 보정하는지, TF 두 칸이 어떻게 이어지는지는 **맵핑·위치추정 탭**에 있습니다.

## ① 오도메트리 — 상대 위치 센서

| 종류 | 무엇으로 | 강점 | 약점 | ROS 2 |
| --- | --- | --- | --- | --- |
| 바퀴 오도메트리 | 엔코더 회전수 × 바퀴 반지름 | 항상 있음, 직진 정확 | **미끄러짐·카펫·회전**에 약함 | diff_drive_controller \`/odom\` |
| IMU | 각속도·가속도 적분 | 회전이 정확, 빠름 | 위치는 이중 적분이라 금방 틀어짐 → **각속도만** 씀 | imu_sensor_broadcaster \`/imu\` |
| 시각 오도메트리 (VO/VIO) | 연속 영상의 특징점 이동 | 미끄러짐과 무관 | 특징 없는 벽·어둠·빠른 회전 | cuVSLAM \`tracking/odometry\`, rtabmap rgbd_odometry |
| LiDAR 오도메트리 | 연속 스캔 맞추기 | 미끄러짐과 무관, 빛 무관 | 긴 복도처럼 모양이 같은 곳 | rf2o_laser_odometry, KISS-ICP |
| **EKF 융합** | 위 것들을 공분산으로 가중 평균 | 각 센서 약점을 서로 메움 | 설정(어느 축을 믿나)이 틀리면 더 나빠짐 | robot_localization \`ekf_node\` |

EKF 설정의 요령: **바퀴는 앞 속도(vx), IMU는 회전 속도(vyaw)** 를 믿게 하고, 위치(x, y)는 넣지 않습니다. 적분값을 여러 센서가 동시에 주면 서로 싸웁니다. 최종 \`odom → base_footprint\`는 EKF 하나만 내고, diff_drive_controller는 \`enable_odom_tf: false\`.

## ② 지도 위에서 위치 찾기 — 방법 비교

| 방법 | 센서 | 지도 | 원리 | 처음 위치 | 지도 고침 |
| --- | --- | --- | --- | --- | --- |
| **AMCL** (nav2_amcl) | 2D LiDAR \`/scan\` | 2D 격자 (map_server) | 파티클 필터 — 위치 후보 수천 개를 스캔이 잘 맞는 것만 남김 | 필요 (2D Pose Estimate) | 안 함 |
| slam_toolbox 위치추정 모드 | 2D LiDAR | 저장한 포즈 그래프 (\`.posegraph\`) | 스캔 매칭 + 그래프 (오래된 노드는 버림) | 필요 (또는 시작점 고정) | 최근 구간만 |
| Cartographer pure localization | LiDAR (+IMU) | \`.pbstream\` (frozen) | 서브맵 스캔 매칭 + 루프 클로저로 지도에 붙음 | 대략이면 스스로 찾음 | 안 함 (새 서브맵은 몇 개만 유지) |
| RTAB-Map 위치추정 모드 | RGB-D·스테레오 (+LiDAR) | \`rtabmap.db\` | **장소 인식** — 지금 장면과 비슷한 과거 장면을 찾아 붙음 | 장면만 맞으면 스스로 찾음 | 안 함 (\`Mem/IncrementalMemory: false\`) |
| cuVSLAM \`load_map_and_localize\` | 스테레오 IR + IMU | cuVSLAM 지도 | 특징점 지도에서 지금 보이는 특징 찾기 | 근처 힌트를 주면 빠름 | 안 함 |
| GPS (navsat_transform) | GNSS + IMU | 위도·경도 | 위성 좌표를 map 좌표로 변환 | 필요 없음 | — (실외 전용) |

크게 둘로 나뉩니다. **AMCL·slam_toolbox**는 "대략 여기쯤"을 알려 줘야 시작하는 **추적형**, **RTAB-Map·cuVSLAM·Cartographer**는 장면을 보고 스스로 찾을 수 있는 **재인식형**입니다.

## AMCL은 어떻게 위치를 찾나 — 파티클 필터

\`\`\`mermaid
flowchart LR
    A["① 뿌리기<br/>처음 위치 주변에<br/>파티클 500~2000개"] -->|"/initialpose 받으면"| B["② 예측<br/>오도메트리만큼<br/>모두 이동 (+잡음)"]
    B -->|"이동한 파티클"| C["③ 채점<br/>각 파티클 자리에서<br/>/scan이 지도와 맞나"]
    C -->|"파티클별 점수"| D["④ 재추출<br/>점수 높은 것은 복제,<br/>낮은 것은 버림"]
    D -->|"로봇이 움직일 때마다"| B
    D -->|"남은 파티클"| E["평균 = 추정 위치<br/>퍼진 정도 = 공분산"]
\`\`\`

- **움직여야 좁혀진다.** 제자리에선 채점할 새 정보가 없어서 \`update_min_d\`(0.25 m)·\`update_min_a\`(0.2 rad) 이상 움직일 때만 갱신합니다. 처음 위치를 준 뒤 조금 돌려 주면 빨리 수렴합니다.
- **채점은 likelihood field.** 지도의 벽에서 거리가 가까운 스캔 점일수록 점수가 높습니다 (\`laser_model_type: likelihood_field\`).
- **파티클 수는 자동 조절(KLD).** 퍼져 있을 땐 많이, 모이면 \`min_particles\`까지 줄여 가볍게 돕니다.
- 출력: \`map → odom\` TF, \`/amcl_pose\`(공분산 포함), \`/particle_cloud\`(RViz에서 화살표 구름).

## 처음 위치 · 납치된 로봇

| 상황 | 뜻 | 대처 |
| --- | --- | --- |
| **지역 위치추정** | 대략 어디인지 앎 → 정밀하게 맞추기 | AMCL에 \`/initialpose\` (RViz 2D Pose Estimate), 시작점이 늘 같으면 \`set_initial_pose: true\` |
| **전역 위치추정** | 어디인지 전혀 모름 | AMCL \`/reinitialize_global_localization\`(지도 전체에 파티클) 후 조금 움직이기 · RTAB-Map·cuVSLAM은 장면 인식으로 스스로 |
| **납치된 로봇** | 맞게 추적하다가 누가 들어 옮김 | 파티클이 엉뚱한 곳에 모여 있음 → 다시 \`/initialpose\`, 또는 \`recovery_alpha_slow/fast\`로 무작위 파티클 주입 |

> 처음 위치를 **누가, 어떻게 보내고, 받는 쪽이 무엇을 계산하는지**는 맵핑·위치추정 탭의 initial_pose 절에 있습니다.

## 잘 되고 있나 — 확인 방법

| 볼 것 | 정상 | 이상하면 |
| --- | --- | --- |
| RViz 파티클 구름 | 로봇 주변에 작게 모여 있음 | 넓게 퍼짐 → 아직 못 찾음, 여러 덩어리 → 비슷한 장소 헷갈림 |
| \`/amcl_pose\` 공분산 | x·y 분산 0.05 m² 이하 | 계속 큼 → 지도와 실제가 다름(가구 이동), 스캔 품질 |
| 스캔과 지도 겹침 | RViz에서 /scan 점이 벽 위에 | 일정하게 어긋남 → 처음 위치 틀림, 회전 어긋남 → 오도메트리 회전 오차 |
| map→odom 변화 | 천천히 조금씩 | 자주 크게 튐 → 오도메트리 나쁨(EKF 설정), 지도 대조 오탐 |
| odom→base 매끄러움 | 끊김·튐 없음 | 튀면 EKF 입력 문제 (같은 값을 두 센서가 넣음 등) |

\`\`\`bash
ros2 topic echo /amcl_pose --field pose.covariance     # 0, 7번째 값 = x, y 분산
ros2 run tf2_ros tf2_echo map odom                       # 보정값이 얼마나 자주·크게 바뀌나
ros2 run tf2_ros tf2_echo odom base_footprint            # 오도메트리 매끄러운가
ros2 service call /reinitialize_global_localization std_srvs/srv/Empty   # 전역 재탐색 (AMCL)
\`\`\`

## 이 로봇의 세 구성에서는

| 구성 | 오도메트리 층 | 지도 대조 층 | 처음 위치 |
| --- | --- | --- | --- |
| 🟩 RTAB-Map (현재) | EKF (바퀴 + IMU) | rtabmap 위치추정 모드 (장소 인식) | 장면이 맞으면 스스로 · \`/initialpose\`도 받음 |
| 🟦 2D LiDAR + Cartographer | EKF (바퀴 + IMU) | **AMCL** (운행) | **필요** — 2D Pose Estimate 또는 고정 시작점 |
| 🟪 cuVSLAM + nvblox | EKF (바퀴 + IMU + **시각 오도메트리**) | cuVSLAM \`load_map_and_localize\` — 장애물 지도는 nvblox \`~/load_map\`으로 따로 올림 (nvblox는 위치를 안 찾음) | 근처 힌트를 주면 빠름 |
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosLocalization extends w.HTMLElement {
    /** 관련 개념 탭으로 (뒤로가기로 돌아옴) */
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
          <b>위치추정(Localization)</b> — 로봇이 지금 <b>어디에 있는지</b> 찾는 일입니다. 지도 만들기(SLAM)와 달리 지도는 이미 있고, 그 위에서 내 자리를 찾습니다.
          오도메트리(상대)와 지도 대조(절대) 두 층, AMCL 원리, 처음 위치·납치 문제, 잘 되는지 확인하는 법을 다룹니다.
          <div class="ss-links">
            ${btn('/ros2?concept=slam', '📘 맵핑·위치추정 (map→odom 원리 · initial_pose)')}
            ${btn('/ros2?concept=slamstack', '🧭 SLAM 구성 비교')}
            ${btn('/ros2?concept=tf', '🌐 TF2')}
          </div>
        </div>
        <div class="md" id="ss-md"></div>
      `;
    }
  }

  return tagName;
};
