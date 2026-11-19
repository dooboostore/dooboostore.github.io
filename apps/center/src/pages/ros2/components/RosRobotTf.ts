import {
  addEventListener,
  elementDefine,
  onConnectedBodyShadow,
  subscribeSwcAppRouteChange,
  swcAppRouteGo,
  swcAppRouteQueryParam,
} from '@dooboostore/simple-web-component';
import { markdownParse } from '@center-src/utils/markdown';

const tagName = 'center-ros2-robottf';

type Sec = 'tree' | 'rsp' | 'odom' | 'use';

const F = '```';

const CLS = `    classDef std fill:#c8e6c9,stroke:#2e7d32,color:#1b1b1b;
    classDef rl fill:#ffe0b2,stroke:#e65100,color:#1b1b1b;
    classDef hw fill:#fff9c4,stroke:#f9a825,color:#1b1b1b;
    classDef mine fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e;
    classDef ext fill:#ffffff,stroke:#8A97A0,stroke-dasharray:4 3,color:#475569;`;

// 노드동작 › 로봇 TF — lv2_module6 소스 기준 (bee_bot_v2 develop bcac613f)
const SECTIONS: Record<Sec, { label: string; md: string }> = {
  tree: {
    label: '① TF 트리 — 프레임 전체',
    md: `
## TF 트리 — 이 로봇의 프레임 전체와 누가 내나

> TF = **프레임(좌표계) 사이의 관계**. 프레임 이름(\`map\`, \`odom\`, \`base_footprint\` …)은 토픽이 아니다. 관계는 전부 **토픽 \`/tf\`(바뀌는 것) · \`/tf_static\`(안 바뀌는 것)** 두 개로 오가고, 메시지 하나에 \`frame_id\`(부모) · \`child_frame_id\`(자식) · 위치 · 회전이 들어 있다. ✅ upstream \`tf2_ros/transform_broadcaster.hpp:89~90\` · \`static_transform_broadcaster.hpp:87~88\`


### 그림 — 옆에서 본 로봇과 프레임

<figure class="tf-fig"><svg viewBox="0 0 660 440" style="width:100%;max-width:760px;height:auto;display:block;margin:0 auto" role="img" aria-label="옆에서 본 로봇과 프레임"><defs><marker id="f1r" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#dc2626"/></marker><marker id="f1b" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#2563eb"/></marker><marker id="f1g" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#16a34a"/></marker><marker id="f1k" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#475569"/></marker><marker id="f1y" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#ca8a04"/></marker><marker id="f1o" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#ea580c"/></marker></defs><rect x="0" y="0" width="660" height="440" fill="#ffffff"/><line x1="18.0" y1="390" x2="599.0" y2="390" stroke="#94a3b8" stroke-width="2"/><text x="22.0" y="406" font-size="11" fill="#64748b">바닥</text><rect x="98.5" y="313.0" width="219.8" height="63.0" rx="6" fill="#e2e8f0" stroke="#64748b"/><circle cx="270.0" cy="366.9" r="23.1" fill="#cbd5e1" stroke="#475569" stroke-width="2"/><circle cx="119.5" cy="381.6" r="7" fill="#cbd5e1" stroke="#475569"/><line x1="123.0" y1="313.0" x2="123.0" y2="75.0" stroke="#64748b" stroke-width="5"/><line x1="73.3" y1="77.4" x2="173.5" y2="77.4" stroke="#64748b" stroke-width="4"/><rect x="164.5" y="70.4" width="18" height="14" rx="3" fill="#0f172a" transform="rotate(19.0 173.5 77.4)"/><rect x="64.3" y="70.4" width="18" height="14" rx="3" fill="#0f172a" transform="rotate(-18.0 73.3 77.4)"/><line x1="303.6" y1="292.5" x2="303.6" y2="263.9" stroke="#f59e0b" stroke-width="7" stroke-linecap="round"/><line x1="303.6" y1="263.9" x2="303.6" y2="234.8" stroke="#f59e0b" stroke-width="7" stroke-linecap="round"/><line x1="303.6" y1="234.8" x2="320.4" y2="145.2" stroke="#f59e0b" stroke-width="7" stroke-linecap="round"/><line x1="320.4" y1="145.2" x2="407.2" y2="145.2" stroke="#f59e0b" stroke-width="7" stroke-linecap="round"/><line x1="407.2" y1="145.2" x2="451.2" y2="145.2" stroke="#f59e0b" stroke-width="7" stroke-linecap="round"/><line x1="451.2" y1="145.2" x2="527.6" y2="145.2" stroke="#f59e0b" stroke-width="7" stroke-linecap="round"/><circle cx="303.6" cy="292.5" r="5" fill="#fff" stroke="#b45309" stroke-width="2"/><circle cx="303.6" cy="263.9" r="5" fill="#fff" stroke="#b45309" stroke-width="2"/><circle cx="303.6" cy="234.8" r="5" fill="#fff" stroke="#b45309" stroke-width="2"/><circle cx="320.4" cy="145.2" r="5" fill="#fff" stroke="#b45309" stroke-width="2"/><circle cx="407.2" cy="145.2" r="5" fill="#fff" stroke="#b45309" stroke-width="2"/><circle cx="451.2" cy="145.2" r="5" fill="#fff" stroke="#b45309" stroke-width="2"/><rect x="500.4" y="110.9" width="16" height="12" rx="3" fill="#0f172a" transform="rotate(20.8 508.4 116.9)"/><line x1="270.0" y1="390.0" x2="296.0" y2="390.0" stroke="#dc2626" stroke-width="2.2" marker-end="url(#f1r)"/><line x1="270.0" y1="390.0" x2="270.0" y2="364.0" stroke="#2563eb" stroke-width="2.2" marker-end="url(#f1b)"/><circle cx="270.0" cy="390.0" r="3.2" fill="#0f172a"/><text x="278.0" y="406.0" font-size="12" fill="#0f172a" font-weight="700">base_footprint</text><line x1="270.0" y1="383.0" x2="290.0" y2="383.0" stroke="#dc2626" stroke-width="2.2" marker-end="url(#f1r)"/><line x1="270.0" y1="383.0" x2="270.0" y2="363.0" stroke="#2563eb" stroke-width="2.2" marker-end="url(#f1b)"/><circle cx="270.0" cy="383.0" r="3.2" fill="#0f172a"/><text x="308.0" y="355.0" font-size="11" fill="#0f172a" font-weight="700">base_link (+1 cm)</text><line x1="208.4" y1="390.0" x2="228.4" y2="390.0" stroke="#dc2626" stroke-width="2.2" marker-end="url(#f1r)"/><line x1="208.4" y1="390.0" x2="208.4" y2="370.0" stroke="#2563eb" stroke-width="2.2" marker-end="url(#f1b)"/><circle cx="208.4" cy="390.0" r="3.2" fill="#0f172a"/><text x="90.4" y="406.0" font-size="11" fill="#0f172a" font-weight="700">base_center (−8.8 cm)</text><line x1="282.5" y1="341.7" x2="298.5" y2="341.7" stroke="#dc2626" stroke-width="2.2" marker-end="url(#f1r)"/><line x1="282.5" y1="341.7" x2="282.5" y2="325.7" stroke="#2563eb" stroke-width="2.2" marker-end="url(#f1b)"/><circle cx="282.5" cy="341.7" r="3.2" fill="#0f172a"/><text x="288.5" y="337.7" font-size="11" fill="#0f172a" font-weight="700">imu_link</text><line x1="173.5" y1="77.4" x2="194.3" y2="84.5" stroke="#dc2626" stroke-width="2.2" marker-end="url(#f1r)"/><line x1="173.5" y1="77.4" x2="180.7" y2="56.6" stroke="#2563eb" stroke-width="2.2" marker-end="url(#f1b)"/><circle cx="173.5" cy="77.4" r="3.2" fill="#0f172a"/><text x="181.5" y="63.4" font-size="11" fill="#0f172a" font-weight="700">pole_front_cam_link (19° 아래)</text><line x1="73.3" y1="77.4" x2="52.4" y2="84.2" stroke="#dc2626" stroke-width="2.2" marker-end="url(#f1r)"/><line x1="73.3" y1="77.4" x2="80.1" y2="98.3" stroke="#2563eb" stroke-width="2.2" marker-end="url(#f1b)"/><circle cx="73.3" cy="77.4" r="3.2" fill="#0f172a"/><text x="23.3" y="113.4" font-size="11" fill="#0f172a" font-weight="700">pole_back_cam_link — URDF에만 · 카메라 기본 꺼짐</text><line x1="303.6" y1="292.5" x2="321.6" y2="292.5" stroke="#dc2626" stroke-width="2.2" marker-end="url(#f1r)"/><line x1="303.6" y1="292.5" x2="303.6" y2="274.5" stroke="#2563eb" stroke-width="2.2" marker-end="url(#f1b)"/><circle cx="303.6" cy="292.5" r="3.2" fill="#0f172a"/><text x="311.6" y="302.5" font-size="11" fill="#0f172a" font-weight="700">arm_base_link</text><line x1="451.2" y1="145.2" x2="469.2" y2="145.2" stroke="#dc2626" stroke-width="2.2" marker-end="url(#f1r)"/><line x1="451.2" y1="145.2" x2="451.2" y2="127.2" stroke="#2563eb" stroke-width="2.2" marker-end="url(#f1b)"/><circle cx="451.2" cy="145.2" r="3.2" fill="#0f172a"/><text x="421.2" y="119.2" font-size="11" fill="#0f172a" font-weight="700">gripper_link</text><line x1="527.6" y1="145.2" x2="545.6" y2="145.2" stroke="#dc2626" stroke-width="2.2" marker-end="url(#f1r)"/><line x1="527.6" y1="145.2" x2="527.6" y2="127.2" stroke="#2563eb" stroke-width="2.2" marker-end="url(#f1b)"/><circle cx="527.6" cy="145.2" r="3.2" fill="#0f172a"/><text x="487.6" y="169.2" font-size="11" fill="#0f172a" font-weight="700">end_effector_link</text><line x1="508.4" y1="116.9" x2="523.4" y2="122.6" stroke="#dc2626" stroke-width="2.2" marker-end="url(#f1r)"/><line x1="508.4" y1="116.9" x2="514.1" y2="102.0" stroke="#2563eb" stroke-width="2.2" marker-end="url(#f1b)"/><circle cx="508.4" cy="116.9" r="3.2" fill="#0f172a"/><text x="514.4" y="104.9" font-size="11" fill="#0f172a" font-weight="700">gripper_cam_link</text><text x="255.6" y="267.9" font-size="11" fill="#b45309" font-weight="700">joint1</text><text x="255.6" y="238.8" font-size="11" fill="#b45309" font-weight="700">joint2</text><text x="290.4" y="133.2" font-size="11" fill="#b45309" font-weight="700">joint3</text><text x="391.2" y="133.2" font-size="11" fill="#b45309" font-weight="700">joint4</text><text x="411.2" y="161.2" font-size="11" fill="#b45309" font-weight="700">joint5</text><text x="522.0" y="406.0" font-size="11" fill="#64748b">앞 →</text><text x="25.0" y="422.0" font-size="11" fill="#64748b">몸 뒤 끝 −24.5 cm</text><g transform="translate(470,26)"><rect x="-8" y="-16" width="186" height="70" rx="8" fill="#f8fafc" stroke="#cbd5e1"/><line x1="0" y1="0" x2="22" y2="0" stroke="#dc2626" stroke-width="2.2" marker-end="url(#f1r)"/><text x="30" y="4" font-size="11" fill="#334155">x축 (앞)</text><line x1="0" y1="20" x2="22" y2="20" stroke="#2563eb" stroke-width="2.2" marker-end="url(#f1b)"/><text x="30" y="24" font-size="11" fill="#334155">z축 (위)</text><line x1="0" y1="40" x2="22" y2="40" stroke="#f59e0b" stroke-width="6"/><text x="30" y="44" font-size="11" fill="#334155">팔 — 관절 0 자세</text></g></svg><figcaption>옆에서 본 로봇과 TF 프레임 — URDF 관절 위치 값으로 그림(1 cm ≈ 7 px). 팔은 모든 관절 0 자세. y축(왼쪽)은 종이 안쪽이라 생략. 몸통 · 기둥 모양은 설명용.</figcaption></figure>

> 기준 소스: \`bee_bot_v2\` develop (\`bcac613f\`) · ✅ 이 저장소 · ✅ upstream = 공식 소스(robot_state_publisher rolling · tf2_ros rolling · ros2_controllers master) · ⚪ 미확인
>
> **도식 표시** 📦 제공 · 🛠️ 직접 작성 | 프로세스 박스: 첫 줄 \`패키지::실행 파일\`, 둘째 줄 \`노드 /이름\` | ✉️ 토픽 · 🔌 시리얼 · 🔗 같은 프로세스 메모리 · 📄 파일 | 둥근 상자 = TF 프레임 · 주황 = 움직이는 TF(/tf) · 초록 = 고정 TF(/tf_static) · 노란 = 위치 TF | 노드에 마우스를 올리면 근거
${F}mermaid
flowchart TB
    MAP(["map"])
    ODOM(["odom"])
    BF(["base_footprint<br/>앞 바퀴축 바닥"])
    BC(["base_center<br/>몸 가운데 −0.088 m"])
    BL(["base_link"])
    WL(["wheel_left_link"])
    WR(["wheel_right_link"])
    PFC(["pole_front_cam_link"])
    PFO(["pole_front_cam_color · depth_optical_frame"])
    PBC(["pole_back_cam_link<br/>URDF에만 있음 · 카메라 노드 기본 꺼짐"])
    PBO(["pole_back_cam_color · depth_optical_frame"])
    IMU(["imu_link"])
    ETC(["battery_link · basket_slot_0 … 11 (13개)"])
    AB(["arm_base_link"])
    SH(["shoulder_link"])
    UA(["upper_arm_link"])
    FA(["forearm_link"])
    WRI(["wrist_link"])
    GL(["gripper_link"])
    FL(["finger_left_link"])
    FR(["finger_right_link"])
    GC(["gripper_cam_link"])
    GCO(["gripper_cam_color · depth_optical_frame"])
    EE(["end_effector_link"])
    RSPN["📦 robot_state_publisher::robot_state_publisher<br/>노드 /robot_state_publisher<br/>base_footprint 아래 전부 — 움직이는 9개 /tf · 고정 27개 /tf_static"]
    RSPN -.->|"노드 /robot_state_publisher 가 발행 — ✉️ /tf 관절 9개 · ✉️ /tf_static 관절 27개"| BF
    MAP ==>|"map→odom · ✉️ /tf · 발행 노드 /map_tf_relay"| ODOM
    ODOM ==>|"odom→base_footprint · ✉️ /tf · 발행 노드 /ekf_filter_node"| BF
    CVN["🛠️ ros_system::cuvslam_slam<br/>노드 /cuvslam_slam<br/>map→odom 보정 계산 (튀면 잠금)"]
    MTR["🛠️ ros_system::map_tf_relay<br/>노드 /map_tf_relay<br/>30Hz TransformBroadcaster"]
    EKFN["📦 robot_localization::ekf_node<br/>노드 /ekf_filter_node<br/>입력 ✉️ /odom · /imu · /cuvslam/odom"]
    JSBN["📦 joint_state_broadcaster (컨트롤러 플러그인)<br/>노드 /joint_state_broadcaster — /controller_manager 프로세스 안"]
    CVN ==>|"노드 /cuvslam_slam 이 발행 ✉️ /cuvslam/map_to_odom → 노드 /map_tf_relay 가 구독"| MTR
    MTR -.->|"노드 /map_tf_relay 가 ✉️ /tf 에 발행 — map→odom"| ODOM
    EKFN -.->|"노드 /ekf_filter_node 가 ✉️ /tf 에 발행 — odom→base_footprint"| BF
    JSBN ==>|"노드 /joint_state_broadcaster 가 발행 ✉️ /joint_states 100Hz → 노드 /robot_state_publisher 가 구독"| RSPN
    BF -->|"base_joint · fixed · ✉️ /tf_static · 발행 노드 /robot_state_publisher"| BL
    BF -->|"base_center_joint · fixed · ✉️ /tf_static · 발행 노드 /robot_state_publisher"| BC
    BL ==>|"wheel_left_joint · continuous · ✉️ /tf · 발행 노드 /robot_state_publisher"| WL
    BL ==>|"wheel_right_joint · continuous · ✉️ /tf · 발행 노드 /robot_state_publisher"| WR
    BL -->|"fixed · ✉️ /tf_static · 발행 노드 /robot_state_publisher"| PFC --> PFO
    BL -->|"fixed · ✉️ /tf_static · 발행 노드 /robot_state_publisher"| PBC --> PBO
    BL -->|"imu_joint · fixed · ✉️ /tf_static · 발행 노드 /robot_state_publisher"| IMU
    BL -->|"fixed · ✉️ /tf_static · 발행 노드 /robot_state_publisher"| ETC
    BL -->|"arm_mount_joint · fixed · ✉️ /tf_static · 발행 노드 /robot_state_publisher"| AB
    AB ==>|"joint1 · revolute · ✉️ /tf · 발행 노드 /robot_state_publisher"| SH
    SH ==>|"joint2 · revolute · ✉️ /tf · 발행 노드 /robot_state_publisher"| UA
    UA ==>|"joint3 · revolute · ✉️ /tf · 발행 노드 /robot_state_publisher"| FA
    FA ==>|"joint4 · revolute · ✉️ /tf · 발행 노드 /robot_state_publisher"| WRI
    WRI ==>|"joint5 · revolute · ✉️ /tf · 발행 노드 /robot_state_publisher"| GL
    GL ==>|"gripper_left_joint · prismatic · ✉️ /tf · 발행 노드 /robot_state_publisher"| FL
    GL ==>|"gripper_right_joint · prismatic · mimic · ✉️ /tf · 발행 노드 /robot_state_publisher"| FR
    GL -->|"fixed · ✉️ /tf_static · 발행 노드 /robot_state_publisher"| GC --> GCO
    GL -->|"end_effector_joint · fixed · ✉️ /tf_static · 발행 노드 /robot_state_publisher"| EE
    %% tip MAP: map | 지도 기준 프레임. map→odom은 cuVSLAM이 계산한 위치 보정이고, /cuvslam/map_to_odom을 받아 map_tf_relay가 30Hz로 /tf에 낸다(ros_system/src/cuvslam_slam.cpp:589~598, ros_system.launch.py:394, 466). ③ 탭.
    %% tip ODOM: odom | 끊김 없이 이어지는 주행 기준 프레임. odom→base_footprint는 EKF가 바퀴 /odom · /imu · /cuvslam/odom을 융합해 낸다(ekf.yaml:8, 13~15). diff_drive_controller는 enable_odom_tf: false라 TF를 안 낸다(controllers.yaml:62). ③ 탭.
    %% tip BF: base_footprint | 로봇 기준 프레임 — Nav2 · EKF · MoveIt이 같이 쓴다. 앞 바퀴축 바닥이고 몸은 뒤로 0.245 m 길다(nav2_params.yaml 머리 주석). 여기서부터 아래는 전부 URDF에서 나온 TF다.
    %% tip BC: base_center | 몸 가운데(URDF x −0.088). Nav2 global_costmap의 robot_base_frame이 이것이다(nav2_params.yaml:250) — 축 중심 원으로는 꼬리가 코너에 걸려서.
    %% tip WL: 바퀴 | continuous 관절 — /joint_states의 바퀴 회전각으로 robot_state_publisher가 /tf로 낸다(② 탭).
    %% tip SH: 팔 | joint1~5 revolute. /joint_states의 각도로 robot_state_publisher가 /tf로 낸다. 비틀림 상태(twist_state)면 joint2 · 3 각도에 중력 비틀림이 더해진 값이다(beebot_system_hardware.hpp 머리 주석).
    %% tip FR: mimic | URDF에서 gripper_right_joint는 gripper_left_joint를 따라가는 mimic이다. /joint_states에는 왼쪽만 오고, 오른쪽은 robot_state_publisher가 계산한다(robot_state_publisher.cpp:198~208, :364~369).
    %% tip PFO: optical frame | 카메라 영상 좌표계(z가 앞). realsense2_camera는 publish_tf: False라 TF를 안 내고, 카메라 프레임은 URDF(robot_state_publisher)가 /tf_static으로 낸다(ros_system.launch.py:104).
    %% tip MTR: map_tf_relay | cuvslam_slam이 낸 /cuvslam/map_to_odom을 받아 30Hz로 TransformBroadcaster(→ /tf)에 다시 낸다(map_tf_relay.cpp:27, 37). 노드 이름 map_tf_relay(ros_system.launch.py:466).
    %% tip EKFN: ekf_node | /odom · /imu · /cuvslam/odom을 융합해 TF odom→base_footprint를 낸다(ekf.yaml:8, 13~15, 30, 35, 39). 노드 이름 ekf_filter_node(ros_system.launch.py:254).
    %% tip JSBN: joint_state_broadcaster | 노드가 아니라 /controller_manager 안의 컨트롤러 플러그인이지만, 컨트롤러마다 자기 이름의 노드를 가진다(controller_interface_base.cpp:90). state 칸의 관절값을 update마다 /joint_states로 낸다.
    %% tip RSPN: robot_state_publisher | URDF(robot_description 파라미터)의 관절 36개로 base_footprint 아래 TF를 모두 낸다. 움직이는 9개는 /joint_states를 받을 때마다 /tf로, 고정 27개는 시작할 때 한 번 /tf_static으로(robot_state_publisher.cpp:268~292, 296~316). ② 탭.
    %% tip PBC: pole_back_cam | URDF에는 조건 없이 들어 있어(urdf.xacro:610~, 주석 11-15 장착) robot_state_publisher가 프레임을 항상 /tf_static으로 낸다. 카메라 노드는 기본으로 안 뜬다 — ros_system use_pole_back_cam 기본 false(ros_system.launch.py:187), 실기 start.sh도 false(start.sh:16), bringup은 auto(시리얼 장치가 감지될 때만, bringup.launch.py:111). 지금 로봇에 실제로 달려 있는지는 소스로 알 수 없다.
    %% tip ETC: 고정 프레임 | battery_link · basket_slot_0~11 — 적재함 칸 위치. 모두 fixed라 /tf_static.
${CLS}
    classDef tfm fill:#fff9c4,stroke:#f9a825,color:#1b1b1b;
    classDef tfmove fill:#ffe0b2,stroke:#e65100,color:#1b1b1b;
    classDef tfstatic fill:#c8e6c9,stroke:#2e7d32,color:#1b1b1b;
    class MAP,ODOM,BF tfm;
    class RSPN,EKFN,JSBN std;
    class CVN,MTR mine;
    class WL,WR,SH,UA,FA,WRI,GL,FL,FR tfmove;
    class BC,BL,PFC,PFO,PBC,PBO,IMU,ETC,AB,GC,GCO,EE tfstatic;
${F}

| 프레임 쌍 (부모 → 자식) | 누가 내나 | 토픽 | 근거 |
|---|---|---|---|
| \`map → odom\` | 🛠️ \`ros_system::map_tf_relay\` — 노드 \`/map_tf_relay\` (값은 \`/cuvslam_slam\`이 계산) | \`/tf\` | ✅ \`map_tf_relay.cpp:27,37\` · \`cuvslam_slam.cpp:589~598\` |
| \`odom → base_footprint\` | 📦 \`robot_localization::ekf_node\` — 노드 \`/ekf_filter_node\` | \`/tf\` | ✅ \`ekf.yaml:8,13~15\` |
| 움직이는 관절 **9개** (바퀴 2 · joint1~5 · 그리퍼 L/R) | 📦 \`robot_state_publisher::robot_state_publisher\` — 노드 \`/robot_state_publisher\` | \`/tf\` | ✅ upstream \`robot_state_publisher.cpp:268~292\` |
| 고정 관절 **27개** (카메라 · IMU · 적재함 칸 · base_center …) | 같은 노드 | \`/tf_static\` (시작할 때 한 번) | ✅ upstream \`robot_state_publisher.cpp:296~316\` |

- URDF 관절은 모두 36개 — 움직이는 것 9 · 고정 27. ✅ \`urdf/default/urdf.xacro\` (관절 목록에서 셈)
- **URDF 파일은 하나다** — \`lv2_module6/urdf/default/urdf.xacro\`. \`ros2_ws\`는 따로 사본이 없고 \`ros_system\`이 빌드할 때 이 폴더를 \`share/ros_system/urdf/\`로 설치해 launch가 \`urdf:=default\`로 읽는다(컨테이너는 \`/ws/urdf\` 마운트). ✅ \`ros_system/CMakeLists.txt:91~103\` · \`ros_system.launch.py:64~67\`
- **URDF에 있다 ≠ 지금 쓴다** — 예: \`pole_back_cam_*\` 프레임은 URDF에 있어 TF로 늘 나오지만, 카메라 노드는 기본으로 꺼져 있다(\`use_pole_back_cam\` 기본 false · 실기 \`start.sh\`도 false). ✅ \`ros_system.launch.py:187\` · \`ros2_ws/start.sh:16\`
- 한 프레임 쌍은 **한 노드만** 낸다. \`odom→base_footprint\`를 EKF 하나로 정한 이유다(diff_drive_controller \`enable_odom_tf: false\`).
`,
  },
  rsp: {
    label: '② robot_state_publisher — /joint_states → TF',
    md: `
## robot_state_publisher — /joint_states를 받아 TF를 계산한다


### 그림 — 관절 각도가 TF 조각이 되고, 조각이 이어 붙는다

<figure class="tf-fig"><svg viewBox="0 0 940 500" style="width:100%;max-width:960px;height:auto;display:block;margin:0 auto" role="img" aria-label="관절 각도가 TF 조각이 되는 과정"><defs><marker id="f4r" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#dc2626"/></marker><marker id="f4b" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#2563eb"/></marker><marker id="f4k" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#475569"/></marker><marker id="f4o" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#ea580c"/></marker><marker id="f4v" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#7c3aed"/></marker></defs><rect x="0" y="0" width="940" height="500" fill="#ffffff"/><line x1="10" y1="430" x2="520" y2="430" stroke="#94a3b8" stroke-width="2"/><rect x="16.7" y="361.8" width="176.1" height="55.8" rx="6" fill="#e2e8f0" stroke="#64748b"/><circle cx="150.0" cy="409.5" r="20.5" fill="#cbd5e1" stroke="#475569" stroke-width="2"/><line x1="179.8" y1="343.6" x2="179.8" y2="292.5" stroke="#94a3b8" stroke-width="6" stroke-linecap="round" opacity="0.55" stroke-dasharray="6 5"/><line x1="179.8" y1="292.5" x2="194.6" y2="213.1" stroke="#94a3b8" stroke-width="6" stroke-linecap="round" opacity="0.55" stroke-dasharray="6 5"/><line x1="194.6" y1="213.1" x2="271.5" y2="213.1" stroke="#94a3b8" stroke-width="6" stroke-linecap="round" opacity="0.55" stroke-dasharray="6 5"/><line x1="271.5" y1="213.1" x2="310.5" y2="213.1" stroke="#94a3b8" stroke-width="6" stroke-linecap="round" opacity="0.55" stroke-dasharray="6 5"/><line x1="310.5" y1="213.1" x2="378.1" y2="213.1" stroke="#94a3b8" stroke-width="6" stroke-linecap="round" opacity="0.55" stroke-dasharray="6 5"/><circle cx="179.8" cy="292.5" r="5" fill="#fff" stroke="#94a3b8" stroke-width="2" opacity="0.55"/><circle cx="194.6" cy="213.1" r="5" fill="#fff" stroke="#94a3b8" stroke-width="2" opacity="0.55"/><circle cx="271.5" cy="213.1" r="5" fill="#fff" stroke="#94a3b8" stroke-width="2" opacity="0.55"/><circle cx="310.5" cy="213.1" r="5" fill="#fff" stroke="#94a3b8" stroke-width="2" opacity="0.55"/><rect x="353.2" y="182.1" width="16" height="12" rx="3" fill="#0f172a" opacity="0.55" transform="rotate(20.8 361.2 188.1)"/><line x1="179.8" y1="343.6" x2="179.8" y2="292.5" stroke="#f59e0b" stroke-width="7" stroke-linecap="round" opacity="1" /><line x1="179.8" y1="292.5" x2="230.9" y2="230.0" stroke="#f59e0b" stroke-width="7" stroke-linecap="round" opacity="1" /><line x1="230.9" y1="230.0" x2="292.1" y2="276.5" stroke="#f59e0b" stroke-width="7" stroke-linecap="round" opacity="1" /><line x1="292.1" y1="276.5" x2="313.1" y2="309.3" stroke="#f59e0b" stroke-width="7" stroke-linecap="round" opacity="1" /><line x1="313.1" y1="309.3" x2="349.7" y2="366.2" stroke="#f59e0b" stroke-width="7" stroke-linecap="round" opacity="1" /><circle cx="179.8" cy="292.5" r="5" fill="#fff" stroke="#f59e0b" stroke-width="2" opacity="1"/><circle cx="230.9" cy="230.0" r="5" fill="#fff" stroke="#f59e0b" stroke-width="2" opacity="1"/><circle cx="292.1" cy="276.5" r="5" fill="#fff" stroke="#f59e0b" stroke-width="2" opacity="1"/><circle cx="313.1" cy="309.3" r="5" fill="#fff" stroke="#f59e0b" stroke-width="2" opacity="1"/><rect x="353.5" y="332.4" width="16" height="12" rx="3" fill="#0f172a" opacity="1" transform="rotate(78.1 361.5 338.4)"/><line x1="150.0" y1="430.0" x2="170.0" y2="430.0" stroke="#dc2626" stroke-width="2" marker-end="url(#f4r)"/><line x1="150.0" y1="430.0" x2="150.0" y2="410.0" stroke="#2563eb" stroke-width="2" marker-end="url(#f4b)"/><line x1="179.8" y1="292.5" x2="195.5" y2="301.1" stroke="#dc2626" stroke-width="2" marker-end="url(#f4r)"/><line x1="179.8" y1="292.5" x2="188.4" y2="276.7" stroke="#2563eb" stroke-width="2" marker-end="url(#f4b)"/><line x1="230.9" y1="230.0" x2="245.2" y2="240.9" stroke="#dc2626" stroke-width="2" marker-end="url(#f4r)"/><line x1="230.9" y1="230.0" x2="241.7" y2="215.7" stroke="#2563eb" stroke-width="2" marker-end="url(#f4b)"/><line x1="292.1" y1="276.5" x2="301.8" y2="291.7" stroke="#dc2626" stroke-width="2" marker-end="url(#f4r)"/><line x1="292.1" y1="276.5" x2="307.2" y2="266.8" stroke="#2563eb" stroke-width="2" marker-end="url(#f4b)"/><line x1="361.5" y1="338.4" x2="364.8" y2="354.1" stroke="#dc2626" stroke-width="2" marker-end="url(#f4r)"/><line x1="361.5" y1="338.4" x2="377.2" y2="335.1" stroke="#2563eb" stroke-width="2" marker-end="url(#f4b)"/><circle cx="163.8" cy="288.5" r="9" fill="#b45309"/><text x="163.8" y="292.5" font-size="11" font-weight="800" fill="#fff" text-anchor="middle">2</text><circle cx="226.9" cy="214.0" r="9" fill="#b45309"/><text x="226.9" y="218.0" font-size="11" font-weight="800" fill="#fff" text-anchor="middle">3</text><circle cx="304.1" cy="264.5" r="9" fill="#b45309"/><text x="304.1" y="268.5" font-size="11" font-weight="800" fill="#fff" text-anchor="middle">4</text><text x="373.5" y="334.4" font-size="11" font-weight="700" fill="#0f172a">gripper_cam_link</text><text x="373.5" y="348.4" font-size="11" font-weight="700" fill="#64748b">(다시 안 내도 따라옴)</text><text x="338.1" y="199.1" font-size="11" font-weight="700" fill="#64748b">관절 0 자세</text><g transform="translate(14,16)"><rect x="0" y="0" width="300" height="74" rx="8" fill="#fffbeb" stroke="#f59e0b"/><text x="10" y="18" font-size="11.5" font-weight="800" fill="#92400e">관절 각도 → 바뀌는 조각 하나씩</text><text x="10" y="36" font-size="10.5" fill="#334155">② joint2 +29° → shoulder_link→upper_arm_link</text><text x="10" y="51" font-size="10.5" fill="#334155">③ joint3 +9°  → upper_arm_link→forearm_link</text><text x="10" y="66" font-size="10.5" fill="#334155">④ joint4 +20° → forearm_link→wrist_link</text></g><text x="158.0" y="446.0" font-size="11" font-weight="700" fill="#0f172a">base_footprint</text><path d="M150.0,430.0 Q 400.0 390.0 355.5,346.4" fill="none" stroke="#7c3aed" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#f4v)"/><text x="20.0" y="310.0" font-size="11" font-weight="700" fill="#7c3aed">base_footprint → gripper_cam_link</text><text x="20.0" y="324.0" font-size="10.5" fill="#7c3aed">= 조각 7개를 이어 붙인 값 (쓰는 쪽 Buffer가 계산)</text><rect x="545" y="14" width="385" height="128" rx="8" fill="#f0fdf4" stroke="#86efac"/><text x="555" y="32" font-size="12" font-weight="800" fill="#166534">✉️ /joint_states — 노드 /joint_state_broadcaster 발행</text><text x="557" y="50" font-size="10.5" fill="#334155" font-family="ui-monospace,monospace">name:     wheel_left_joint  wheel_right_joint</text><text x="557" y="65" font-size="10.5" fill="#334155" font-family="ui-monospace,monospace">          joint1 joint2 joint3 joint4 joint5</text><text x="557" y="80" font-size="10.5" fill="#334155" font-family="ui-monospace,monospace">          gripper_left_joint      (8개 — 오른쪽 없음)</text><text x="557" y="95" font-size="10.5" fill="#334155" font-family="ui-monospace,monospace">position: 12.3  11.9  0.00 0.50 0.15 0.35 0.00 0.01</text><text x="557" y="110" font-size="10.5" fill="#334155" font-family="ui-monospace,monospace">header.stamp: 이 각도를 읽은 시각</text><line x1="735" y1="146" x2="735" y2="166" stroke="#475569" stroke-width="2" marker-end="url(#f4k)"/><rect x="545" y="170" width="385" height="92" rx="8" fill="#f8fafc" stroke="#94a3b8"/><text x="555" y="188" font-size="12" font-weight="800" fill="#0f172a">📦 노드 /robot_state_publisher</text><text x="557" y="206" font-size="10.5" fill="#334155" font-family="ui-monospace,monospace">① mimic: gripper_right = gripper_left × 배수 + offset</text><text x="557" y="221" font-size="10.5" fill="#334155" font-family="ui-monospace,monospace">② 관절마다 segment.pose(각도) → 부모→자식 조각</text><text x="557" y="236" font-size="10.5" fill="#334155" font-family="ui-monospace,monospace">③ 20Hz보다 자주 오면 건너뜀 · stamp는 그대로</text><line x1="735" y1="266" x2="735" y2="286" stroke="#475569" stroke-width="2" marker-end="url(#f4k)"/><rect x="545" y="290" width="385" height="150" rx="8" fill="#fff7ed" stroke="#fdba74"/><text x="555" y="308" font-size="12" font-weight="800" fill="#9a3412">✉️ /tf — 조각 9개 (TransformStamped 배열)</text><text x="557" y="326" font-size="10.5" fill="#334155" font-family="ui-monospace,monospace">base_link       → wheel_left_link    (12.3 rad)</text><text x="557" y="341" font-size="10.5" fill="#334155" font-family="ui-monospace,monospace">base_link       → wheel_right_link   (11.9 rad)</text><text x="557" y="356" font-size="10.5" fill="#334155" font-family="ui-monospace,monospace">arm_base_link   → shoulder_link      (joint1)</text><text x="557" y="371" font-size="10.5" fill="#334155" font-family="ui-monospace,monospace">shoulder_link   → upper_arm_link     (joint2 +29°)</text><text x="557" y="386" font-size="10.5" fill="#334155" font-family="ui-monospace,monospace">upper_arm_link  → forearm_link       (joint3 +9°)</text><text x="557" y="401" font-size="10.5" fill="#334155" font-family="ui-monospace,monospace">forearm_link    → wrist_link         (joint4 +20°)</text><text x="557" y="416" font-size="10.5" fill="#334155" font-family="ui-monospace,monospace">wrist_link      → gripper_link       (joint5)</text><text x="557" y="431" font-size="10.5" fill="#334155" font-family="ui-monospace,monospace">gripper_link    → finger_left/right  (mimic 포함)</text><text x="545" y="458" font-size="10.5" fill="#475569">고정 27개(카메라 · 끝점 · 적재함 칸 …)는</text><text x="545" y="472" font-size="10.5" fill="#475569">시작할 때 /tf_static 으로 한 번만 낸다.</text><text x="545" y="488" font-size="10.5" fill="#475569">긴 경로는 아무도 안 낸다 — Buffer가 조각을 이어 붙임.</text></svg><figcaption>왼쪽: 흐린 점선 = 관절 0 자세, 주황 = joint2 +29° · joint3 +9° · joint4 +20°를 준 자세(URDF 관절 위치로 계산). 관절 하나가 바뀌면 그 조각 하나만 바뀌고, 아래 프레임(카메라 · 끝점)은 이어 붙일 때 저절로 따라온다. 오른쪽: 메시지 한 번이 조각 9개가 되는 과정 — 값은 예시.</figcaption></figure>

> 기준 소스: \`bee_bot_v2\` develop (\`bcac613f\`) · ✅ 이 저장소 · ✅ upstream = 공식 소스(robot_state_publisher rolling · tf2_ros rolling · ros2_controllers master) · ⚪ 미확인
>
> **도식 표시** 📦 제공 · 🛠️ 직접 작성 | 프로세스 박스: 첫 줄 \`패키지::실행 파일\`, 둘째 줄 \`노드 /이름\` | ✉️ 토픽 · 🔌 시리얼 · 🔗 같은 프로세스 메모리 · 📄 파일 | 둥근 상자 = TF 프레임 · 주황 = 움직이는 TF(/tf) · 초록 = 고정 TF(/tf_static) · 노란 = 위치 TF | 노드에 마우스를 올리면 근거
${F}mermaid
flowchart TB
    DEV{{"🔌 OpenCR — S 줄<br/>바퀴 · joint1~5 · 그리퍼 각도"}}
    subgraph CMP["📦 controller_manager::ros2_control_node — 노드 /controller_manager"]
        direction TB
        HW["🛠️ 클래스 control::BeebotSystemHardware<br/>read() → set_state"]
        ST[("🔗 state 칸<br/>wheel_*_joint/position · joint1~5/position · gripper_left_joint/position …")]
        JSB["📦 ① joint_state_broadcaster · 노드 /joint_state_broadcaster<br/>클래스 joint_state_broadcaster/JointStateBroadcaster<br/>update마다 (100Hz) try_publish"]
        HW --> ST --> JSB
    end
    subgraph RSPP["📦 robot_state_publisher::robot_state_publisher — 노드 /robot_state_publisher · 클래스 robot_state_publisher::RobotStatePublisher"]
        direction TB
        URDFP[("📄 파라미터 robot_description<br/>xacro로 만든 URDF 문자열")]
        TREE["시작할 때: URDF → KDL 트리<br/>관절마다 움직이는 것 9 / 고정 27로 나눔<br/>mimic 표: gripper_right = gripper_left × 배수 + offset"]
        FIX["시작할 때 한 번: 고정 27개 → /tf_static"]
        CB["/joint_states 받을 때마다<br/>① 관절 이름 → 각도 표 · mimic 계산<br/>② publish_frequency(기본 20Hz)보다 자주면 건너뜀<br/>③ 관절마다 segment.pose(각도) = 부모→자식 변환<br/>④ stamp = /joint_states의 stamp"]
        URDFP --> TREE --> FIX
        TREE --> CB
    end
    TFT["✉️ /tf — 움직이는 9개<br/>base_link→wheel_left_link · arm_base_link→shoulder_link …"]
    TFS["✉️ /tf_static — 고정 27개 (latched)<br/>base_link→pole_front_cam_link · gripper_link→gripper_cam_link …"]
    RDT["✉️ /robot_description<br/>→ 노드 /controller_manager가 URDF 받음"]
    BUF["📦 tf2_ros::Buffer (각 노드 안)<br/>필요할 때 이 조각들을 이어 붙여 계산<br/>예 map → … → gripper_cam_color_optical_frame"]
    DEV ==>|"🔌 S 줄 10ms"| HW
    JSB ==>|"노드 /joint_state_broadcaster 가 발행 ✉️ /joint_states (sensor_msgs/JointState) → 노드 /robot_state_publisher 가 구독"| CB
    FIX ==>|"노드 /robot_state_publisher 가 시작할 때 한 번 발행"| TFS
    CB ==>|"노드 /robot_state_publisher 가 /joint_states 받을 때마다 발행"| TFT
    URDFP -.->|"노드 /robot_state_publisher 가 발행 → 노드 /controller_manager 가 구독"| RDT
    TFT ==>|"각 노드의 TransformListener 가 구독"| BUF
    TFS ==>|"각 노드의 TransformListener 가 구독"| BUF
    %% tip JSB: /joint_states | state 칸의 관절값을 update()마다 값이 바뀌었는지 보지 않고 발행한다(ros2_controllers joint_state_broadcaster.cpp:419~451). 컨트롤러 주기가 100Hz라 /joint_states도 그 주기로 나온다.
    %% tip TREE: URDF 해석 | URDF를 KDL 트리로 바꾸고 관절 종류가 None(fixed)이면 고정, 아니면 움직이는 조각으로 나눈다(robot_state_publisher.cpp:236~262). mimic 관절은 따로 표를 만든다(:198~208).
    %% tip CB: /joint_states 콜백 | 이름 · 각도 표를 만들고 mimic 관절을 계산한 뒤(:364~369), 관절마다 KDL segment.pose(각도)로 부모→자식 변환을 만들어 /tf로 낸다(:268~292). 관절마다 마지막 발행 시각을 기억해 publish_frequency(기본 20Hz, :147)보다 자주 오면 건너뛴다(:348~358). stamp는 /joint_states의 stamp다(:374). 우리 launch는 publish_frequency를 주지 않아 기본값이다(ros_system.launch.py:225~226).
    %% tip FIX: 고정 관절 | 시작할 때 한 번 StaticTransformBroadcaster로 /tf_static에 낸다(:296~316). /tf_static은 늦게 붙은 노드도 받는 latched 토픽이다.
    %% tip BUF: 조립은 받는 쪽이 | robot_state_publisher는 관절 하나씩 '부모→자식' 조각만 낸다. map에서 카메라까지 같은 긴 사슬은 각 노드의 tf2 Buffer가 lookupTransform할 때 이어 붙여 계산한다(④ 탭).
${CLS}
    class JSB,CB,TREE,FIX,BUF,TFT,TFS,RDT std;
    class HW mine;
    class ST rl;
    class URDFP ext;
    class DEV hw;
    style CMP fill:#ffffff,stroke:#94a3b8
    style RSPP fill:#f0fdf4,stroke:#86efac
${F}

### 차례대로

1. **OpenCR → 칸**: \`read()\`가 S 줄의 관절 각도를 state 칸에 넣는다. ✅ \`beebot_system_hardware.cpp:300~\`
2. **칸 → \`/joint_states\`**: \`joint_state_broadcaster\`가 update마다(100Hz) 무조건 발행한다. ✅ upstream \`joint_state_broadcaster.cpp:419~451\`
3. **시작할 때 (robot_state_publisher)**: URDF(\`robot_description\` 파라미터)를 KDL 트리로 바꾸고, 관절을 **움직이는 것 9 · 고정 27**로 나누고, **mimic 표**를 만든다. 고정 27개는 이때 한 번 \`/tf_static\`으로 낸다. ✅ upstream \`robot_state_publisher.cpp:198~208, 236~262, 296~316\`
4. **\`/joint_states\` 받을 때마다**:
   - 관절 이름 → 각도 표를 만들고 **mimic을 계산**한다 — \`gripper_right_joint = gripper_left_joint × 배수 + offset\`. ✅ \`:364~369\`
   - 관절마다 지난 발행에서 \`1 / publish_frequency\`(기본 **20Hz**)가 안 지났으면 건너뛴다 → \`/joint_states\`는 100Hz여도 관절 TF는 약 20Hz. ✅ \`:147, :348~358\` · 우리 launch는 이 값을 안 줌(\`ros_system.launch.py:225~226\`)
   - 관절마다 \`segment.pose(각도)\` = 그 관절의 **부모→자식 변환 하나**를 만들어 \`/tf\`로 낸다. stamp는 \`/joint_states\`의 stamp. ✅ \`:268~292, :374\`
5. **긴 사슬은 받는 쪽이 계산**: robot_state_publisher는 "조각"만 낸다. \`map → … → gripper_cam_color_optical_frame\` 같은 전체 경로는 각 노드의 \`tf2_ros::Buffer\`가 필요할 때 조각을 이어 붙여 계산한다(④ 탭).

- 팔을 움직이면: 서보 각도 변화 → S 줄 → state 칸 → \`/joint_states\` → \`joint1~5\` 조각이 새 값으로 \`/tf\` → 그 아래 프레임(\`gripper_link\`, \`gripper_cam_*\`, \`end_effector_link\`)은 **따로 다시 낼 필요 없이** 조립할 때 자동으로 따라 움직인다.
- 고정 관절(카메라 장착 위치 등)은 바뀌지 않으니 \`/tf_static\`에 한 번만.
`,
  },
  odom: {
    label: '③ odom · map — 위치 TF',
    md: `
## odom · map — 로봇 위치 TF

> 앞 두 탭은 "로봇 몸 안"의 TF였다. 여기는 **로봇이 세상 어디에 있나** — \`map → odom → base_footprint\` 두 조각이다. 둘을 **서로 다른 노드**가 낸다.


### 그림 1 — 위에서 본 map · odom · base_footprint

<figure class="tf-fig"><svg viewBox="0 0 680 420" style="width:100%;max-width:780px;height:auto;display:block;margin:0 auto" role="img" aria-label="위에서 본 map odom base_footprint"><defs><marker id="f2r" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#dc2626"/></marker><marker id="f2b" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#2563eb"/></marker><marker id="f2g" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#16a34a"/></marker><marker id="f2k" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#475569"/></marker><marker id="f2y" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#ca8a04"/></marker><marker id="f2o" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#ea580c"/></marker></defs><rect x="0" y="0" width="680" height="420" fill="#ffffff"/><line x1="60" y1="30" x2="60" y2="380" stroke="#eef2f7"/><line x1="130" y1="30" x2="130" y2="380" stroke="#eef2f7"/><line x1="200" y1="30" x2="200" y2="380" stroke="#eef2f7"/><line x1="270" y1="30" x2="270" y2="380" stroke="#eef2f7"/><line x1="340" y1="30" x2="340" y2="380" stroke="#eef2f7"/><line x1="410" y1="30" x2="410" y2="380" stroke="#eef2f7"/><line x1="480" y1="30" x2="480" y2="380" stroke="#eef2f7"/><line x1="550" y1="30" x2="550" y2="380" stroke="#eef2f7"/><line x1="620" y1="30" x2="620" y2="380" stroke="#eef2f7"/><line x1="60" y1="380" x2="620" y2="380" stroke="#eef2f7"/><line x1="60" y1="310" x2="620" y2="310" stroke="#eef2f7"/><line x1="60" y1="240" x2="620" y2="240" stroke="#eef2f7"/><line x1="60" y1="170" x2="620" y2="170" stroke="#eef2f7"/><line x1="60" y1="100" x2="620" y2="100" stroke="#eef2f7"/><line x1="60" y1="30" x2="620" y2="30" stroke="#eef2f7"/><rect x="60" y="30" width="560" height="350" fill="none" stroke="#94a3b8" stroke-dasharray="6 4"/><text x="66" y="46" font-size="11" fill="#64748b">경기장 지도 (map) — 벽 · 상자 위치가 고정된 좌표</text><line x1="60" y1="380" x2="106" y2="380" stroke="#dc2626" stroke-width="3" marker-end="url(#f2r)"/><line x1="60" y1="380" x2="60" y2="334" stroke="#16a34a" stroke-width="3" marker-end="url(#f2g)"/><circle cx="60" cy="380" r="5" fill="#ca8a04"/><text x="66" y="396" font-size="13" font-weight="800" fill="#a16207">map</text><line x1="200" y1="300" x2="245.7" y2="294.5" stroke="#dc2626" stroke-width="3" marker-end="url(#f2r)"/><line x1="200" y1="300" x2="194.5" y2="254.3" stroke="#16a34a" stroke-width="3" marker-end="url(#f2g)"/><circle cx="200" cy="300" r="5" fill="#ea580c"/><text x="170" y="320" font-size="13" font-weight="800" fill="#c2410c">odom</text><text x="170" y="334" font-size="10.5" fill="#64748b">= 출발 자리(켤 때 로봇 위치)</text><polyline points="200.0,300.0 259.6,292.8 318.2,277.7 365.2,249.9 406.0,212.7 436.2,170.8 456.3,128.1" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 4"/><polygon points="443.4,112.9 476.2,128.3 460.2,162.4 427.4,147.0" fill="#e0f2fe" stroke="#0369a1" stroke-width="2"/><line x1="437.3" y1="125.8" x2="442.4" y2="115.0" stroke="#0f172a" stroke-width="5"/><line x1="470.1" y1="141.2" x2="475.2" y2="130.3" stroke="#0f172a" stroke-width="5"/><line x1="456.3" y1="128.1" x2="473.2" y2="91.9" stroke="#dc2626" stroke-width="3" marker-end="url(#f2r)"/><line x1="456.3" y1="128.1" x2="420.0" y2="111.1" stroke="#16a34a" stroke-width="3" marker-end="url(#f2g)"/><circle cx="456.3" cy="128.1" r="5" fill="#0369a1"/><text x="470.3" y="132.1" font-size="13" font-weight="800" fill="#0369a1">base_footprint</text><text x="470.3" y="147.1" font-size="10.5" fill="#64748b">앞 바퀴축 · 몸은 뒤로 24.5 cm</text><path d="M66,374 Q 120 330 193,303" fill="none" stroke="#ca8a04" stroke-width="3" marker-end="url(#f2y)"/><text x="68" y="150" font-size="11.5" font-weight="700" fill="#a16207">map → odom</text><text x="68" y="165" font-size="10.5" fill="#a16207">노드 /map_tf_relay 가 ✉️ /tf 에 발행</text><text x="68" y="179" font-size="10.5" fill="#a16207">(보정 값은 /cuvslam_slam 이 계산)</text><line x1="110" y1="186" x2="120" y2="320" stroke="#ca8a04" stroke-width="1" stroke-dasharray="3 3"/><path d="M206,294 Q 330 170 448.3,134.1" fill="none" stroke="#ea580c" stroke-width="3" marker-end="url(#f2o)"/><text x="300" y="214" font-size="11.5" font-weight="700" fill="#c2410c">odom → base_footprint</text><text x="300" y="229" font-size="10.5" fill="#c2410c">노드 /ekf_filter_node 가 ✉️ /tf 에 발행</text><path d="M68,370 Q 300 120 446.3,124.1" fill="none" stroke="#475569" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#f2k)"/><text x="200" y="78" font-size="11" fill="#475569">map → base_footprint = 두 조각을 이어 붙인 값 — 아무 노드도 직접 안 냄, 쓰는 쪽 Buffer가 계산</text></svg><figcaption>위에서 본 세 좌표계. 빨강 = x(앞) · 초록 = y(왼쪽). 화살표 하나 = TF 하나 = 그것을 내는 노드 하나. 크기 · 각도는 설명용.</figcaption></figure>

### 그림 2 — 시간 순서: 왜 map → odom 과 odom → base_footprint 로 나누나

<figure class="tf-fig"><svg viewBox="0 0 890 300" style="width:100%;max-width:900px;height:auto;display:block;margin:0 auto" role="img" aria-label="시간 순서 map odom 보정"><defs><marker id="f3r" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#dc2626"/></marker><marker id="f3b" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#2563eb"/></marker><marker id="f3g" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#16a34a"/></marker><marker id="f3k" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#475569"/></marker><marker id="f3y" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#ca8a04"/></marker><marker id="f3o" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#ea580c"/></marker></defs><g transform="translate(0,0)"><rect x="4" y="4" width="282" height="292" rx="10" fill="#f8fafc" stroke="#cbd5e1"/><text x="16" y="26" font-size="13" font-weight="800" fill="#1e293b">① 켰을 때</text><text x="16" y="42" font-size="10.5" fill="#64748b">map · odom · 로봇이 같은 자리</text><rect x="20" y="56" width="250" height="180" fill="none" stroke="#94a3b8" stroke-width="2"/><rect x="200" y="70" width="40" height="40" fill="#e2e8f0" stroke="#64748b"/><text x="203" y="124" font-size="9" fill="#64748b">상자</text><line x1="30" y1="226" x2="58" y2="226" stroke="#dc2626" stroke-width="2.4" marker-end="url(#f3r)"/><line x1="30" y1="226" x2="30" y2="198" stroke="#16a34a" stroke-width="2.4" marker-end="url(#f3g)"/><circle cx="30" cy="226" r="4" fill="#ca8a04"/><text x="34" y="240" font-size="11" font-weight="800" fill="#a16207">map</text><line x1="30.0" y1="226.0" x2="58.0" y2="226.0" stroke="#dc2626" stroke-width="2.4" marker-end="url(#f3r)"/><line x1="30.0" y1="226.0" x2="30.0" y2="198.0" stroke="#16a34a" stroke-width="2.4" marker-end="url(#f3g)"/><circle cx="30.0" cy="226.0" r="4" fill="#ea580c"/><text x="34.0" y="220.0" font-size="11" font-weight="800" fill="#c2410c">odom</text><rect x="30" y="215" width="30" height="22" rx="4" fill="#0369a1" fill-opacity=".25" stroke="#0369a1" stroke-width="2"/><circle cx="52" cy="226" r="3.5" fill="#0369a1"/><text x="64" y="211" font-size="10" font-weight="700" fill="#0369a1">실제 로봇</text><text x="16" y="254" font-size="10.5" fill="#a16207">map→odom: 0 (지도의 출발 자리)</text><text x="16" y="269" font-size="10.5" fill="#c2410c">odom→base_footprint: 0</text><text x="16" y="286" font-size="10.5" font-weight="700" fill="#334155">세 프레임이 겹쳐 있다</text></g><g transform="translate(300,0)"><rect x="4" y="4" width="282" height="292" rx="10" fill="#f8fafc" stroke="#cbd5e1"/><text x="16" y="26" font-size="13" font-weight="800" fill="#1e293b">② 한참 달린 뒤</text><text x="16" y="42" font-size="10.5" fill="#64748b">바퀴가 미끄러져 오차가 쌓임</text><rect x="20" y="56" width="250" height="180" fill="none" stroke="#94a3b8" stroke-width="2"/><rect x="200" y="70" width="40" height="40" fill="#e2e8f0" stroke="#64748b"/><text x="203" y="124" font-size="9" fill="#64748b">상자</text><line x1="30" y1="226" x2="58" y2="226" stroke="#dc2626" stroke-width="2.4" marker-end="url(#f3r)"/><line x1="30" y1="226" x2="30" y2="198" stroke="#16a34a" stroke-width="2.4" marker-end="url(#f3g)"/><circle cx="30" cy="226" r="4" fill="#ca8a04"/><text x="34" y="240" font-size="11" font-weight="800" fill="#a16207">map</text><line x1="30.0" y1="226.0" x2="58.0" y2="226.0" stroke="#dc2626" stroke-width="2.4" marker-end="url(#f3r)"/><line x1="30.0" y1="226.0" x2="30.0" y2="198.0" stroke="#16a34a" stroke-width="2.4" marker-end="url(#f3g)"/><circle cx="30.0" cy="226.0" r="4" fill="#ea580c"/><text x="34.0" y="220.0" font-size="11" font-weight="800" fill="#c2410c">odom</text><rect x="154" y="139" width="30" height="22" rx="4" fill="#ea580c" fill-opacity=".25" stroke="#ea580c" stroke-width="2" stroke-dasharray="4 3"/><circle cx="176" cy="150" r="3.5" fill="#ea580c"/><text x="188" y="135" font-size="10" font-weight="700" fill="#ea580c">map에서 보이는 위치</text><rect x="138" y="159" width="30" height="22" rx="4" fill="#0369a1" fill-opacity=".25" stroke="#0369a1" stroke-width="2"/><circle cx="160" cy="170" r="3.5" fill="#0369a1"/><text x="124" y="198" font-size="10" font-weight="700" fill="#0369a1">실제 로봇</text><text x="16" y="254" font-size="10.5" fill="#a16207">map→odom: 아직 0</text><text x="16" y="269" font-size="10.5" fill="#c2410c">odom→base_footprint: EKF 적분 (오차 포함)</text><text x="16" y="286" font-size="10.5" font-weight="700" fill="#334155">map에서 보이는 위치가 실제와 어긋남</text></g><g transform="translate(600,0)"><rect x="4" y="4" width="282" height="292" rx="10" fill="#f8fafc" stroke="#cbd5e1"/><text x="16" y="26" font-size="13" font-weight="800" fill="#1e293b">③ cuVSLAM이 보정</text><text x="16" y="42" font-size="10.5" fill="#64748b">벽 · 상자를 보고 자리를 다시 맞춤</text><rect x="20" y="56" width="250" height="180" fill="none" stroke="#94a3b8" stroke-width="2"/><rect x="200" y="70" width="40" height="40" fill="#e2e8f0" stroke="#64748b"/><text x="203" y="124" font-size="9" fill="#64748b">상자</text><line x1="30" y1="226" x2="58" y2="226" stroke="#dc2626" stroke-width="2.4" marker-end="url(#f3r)"/><line x1="30" y1="226" x2="30" y2="198" stroke="#16a34a" stroke-width="2.4" marker-end="url(#f3g)"/><circle cx="30" cy="226" r="4" fill="#ca8a04"/><text x="34" y="240" font-size="11" font-weight="800" fill="#a16207">map</text><line x1="14.0" y1="206.0" x2="41.9" y2="203.2" stroke="#dc2626" stroke-width="2.4" marker-end="url(#f3r)"/><line x1="14.0" y1="206.0" x2="11.2" y2="178.1" stroke="#16a34a" stroke-width="2.4" marker-end="url(#f3g)"/><circle cx="14.0" cy="206.0" r="4" fill="#ea580c"/><text x="18.0" y="200.0" font-size="11" font-weight="800" fill="#c2410c">odom</text><rect x="138" y="159" width="30" height="22" rx="4" fill="#0369a1" fill-opacity=".25" stroke="#0369a1" stroke-width="2"/><circle cx="160" cy="170" r="3.5" fill="#0369a1"/><text x="124" y="198" font-size="10" font-weight="700" fill="#0369a1">실제 로봇</text><text x="16" y="254" font-size="10.5" fill="#a16207">map→odom: 바뀜 — /map_tf_relay</text><text x="16" y="269" font-size="10.5" fill="#c2410c">odom→base_footprint: 그대로 — 끊기지 않음</text><text x="16" y="286" font-size="10.5" font-weight="700" fill="#334155">map 위치는 맞아지고 odom 쪽은 안 튄다</text></g></svg><figcaption>왜 두 조각으로 나누나 — 보정(map→odom)은 튈 수 있지만, 주행 제어가 쓰는 odom→base_footprint는 끊기지 않게. 그래서 가까운 일(local costmap · 추적)은 odom, 지도 위 목적지는 map 기준.</figcaption></figure>

> 기준 소스: \`bee_bot_v2\` develop (\`bcac613f\`) · ✅ 이 저장소 · ✅ upstream = 공식 소스(robot_state_publisher rolling · tf2_ros rolling · ros2_controllers master) · ⚪ 미확인
>
> **도식 표시** 📦 제공 · 🛠️ 직접 작성 | 프로세스 박스: 첫 줄 \`패키지::실행 파일\`, 둘째 줄 \`노드 /이름\` | ✉️ 토픽 · 🔌 시리얼 · 🔗 같은 프로세스 메모리 · 📄 파일 | 둥근 상자 = TF 프레임 · 주황 = 움직이는 TF(/tf) · 초록 = 고정 TF(/tf_static) · 노란 = 위치 TF | 노드에 마우스를 올리면 근거
${F}mermaid
flowchart TB
    subgraph TFT["TF 사슬 (✉️ /tf)"]
        direction TB
        FM(["map"])
        FO(["odom"])
        FB(["base_footprint"])
        FM ==>|"위치 보정 — 쌓인 오차를 지도 기준으로 바로잡음"| FO
        FO ==>|"연속 움직임 — 부드럽지만 오차가 쌓임"| FB
    end
    subgraph CMP["📦 controller_manager::ros2_control_node — 노드 /controller_manager"]
        DD["📦 ③ diff_drive_controller · 노드 /diff_drive_controller<br/>클래스 diff_drive_controller/DiffDriveController<br/>enable_odom_tf: false — TF 안 냄"]
        IMB["📦 ② imu_sensor_broadcaster · 노드 /imu_sensor_broadcaster"]
    end
    CV["🛠️ ros_system::cuvslam_slam (C++판 · cuvslam_impl로 py판)<br/>노드 /cuvslam_slam<br/>시각 오도메트리 · 루프 클로저 · 튀면 보정 잠금"]
    RL["🛠️ ros_system::map_tf_relay<br/>노드 /map_tf_relay<br/>30Hz로 TF 발행"]
    EKF["📦 robot_localization::ekf_node<br/>노드 /ekf_filter_node<br/>world_frame: odom · publish_tf: true · two_d_mode"]
    NAV["📦 Nav2 — bt_navigator · controller_server · velocity_smoother<br/>odom_topic = /odometry/filtered"]
    DD ==>|"노드 /diff_drive_controller 가 발행 ✉️ /odom (바퀴 엔코더만) → 노드 /ekf_filter_node 가 구독"| EKF
    IMB ==>|"노드 /imu_sensor_broadcaster 가 발행 ✉️ /imu → 노드 /ekf_filter_node 가 구독"| EKF
    CV ==>|"노드 /cuvslam_slam 이 발행 ✉️ /cuvslam/odom (시각 오도메트리) → 노드 /ekf_filter_node 가 구독"| EKF
    EKF ==>|"노드 /ekf_filter_node 가 발행 ✉️ /odometry/filtered (융합 결과) → Nav2 노드들이 구독"| NAV
    EKF ==>|"노드 /ekf_filter_node 가 ✉️ /tf 에 발행 — odom→base_footprint"| FB
    CV ==>|"노드 /cuvslam_slam 이 발행 ✉️ /cuvslam/map_to_odom → 노드 /map_tf_relay 가 구독"| RL
    RL ==>|"노드 /map_tf_relay 가 ✉️ /tf 에 발행 — map→odom"| FO
    %% tip CV: cuvslam_slam | map→odom 보정을 계산한다. TF로 직접 내지 않고 /cuvslam/map_to_odom으로 내면 map_tf_relay가 30Hz TF로 낸다(cuvslam_slam.cpp:589~598). cuVSLAM 위치가 크게 튀면 보정을 잠그고 바퀴+IMU로만 이어 간다(:584~585). 노드 이름 cuvslam_slam(ros_system.launch.py:459).
    %% tip EKF: ekf_node | 입력 odom0 /odom · odom1 /cuvslam/odom · imu0 /imu(ekf.yaml:30, 35, 39). world_frame: odom이라 odom 프레임 안에서만 융합하고 지도 보정은 하지 않는다(:15). 결과는 TF odom→base_footprint와 토픽 /odometry/filtered.
    %% tip DD: diff_drive_controller | /odom 토픽만 낸다 — 같은 프레임 쌍을 두 노드가 내면 TF가 싸우므로 TF는 EKF 하나만(controllers.yaml:62).
${CLS}
    classDef tfm fill:#fff9c4,stroke:#f9a825,color:#1b1b1b;
    class FM,FO,FB tfm;
    class DD,IMB,EKF,NAV std;
    class CV,RL mine;
    style CMP fill:#ffffff,stroke:#94a3b8
${F}

| 이름 | 종류 | 누가 내나 | 값 | 근거 |
|---|---|---|---|---|
| \`/odom\` | 토픽 | diff_drive_controller (유일) | 바퀴 엔코더로만 계산한 원본 — EKF 입력 | ✅ \`ros_system.launch.py:127\` · \`ekf.yaml:30\` |
| \`/odometry/filtered\` | 토픽 | EKF | 바퀴 + IMU + 시각 오도메트리 융합 — Nav2가 구독 | ✅ \`ekf.yaml:1\` · \`nav2_params.yaml:21,40,292\` |
| \`odom → base_footprint\` | TF | EKF | 융합된 연속 움직임 | ✅ \`ekf.yaml:8,13~15\` |
| \`map → odom\` | TF | cuvslam_slam → map_tf_relay | 지도 기준 위치 보정 | ✅ \`cuvslam_slam.cpp:589~598\` · \`ros_system.launch.py:394,466\` |

**누가 어떤 프레임으로 일하나** (✅ \`nav2_params.yaml\` · \`perception\` 설정)

| 쓰는 곳 | 기준 프레임 | 로봇 프레임 | 근거 |
|---|---|---|---|
| Nav2 bt_navigator · controller_server | \`map\` | \`base_footprint\` | ✅ \`nav2_params.yaml:19~20, 177~178\` |
| Nav2 local_costmap | \`odom\` (끊김 없는 쪽) | \`base_footprint\` | ✅ \`:196~197\` |
| Nav2 global_costmap | \`map\` | \`base_center\` (몸 가운데) | ✅ \`:246, 250\` |
| perception 추적 | \`odom\` (\`track_frame\`) — 발행할 때 map으로 바꿈 | — | ✅ \`perception/config\` \`track_frame: "odom"\` |

- **RViz Fixed Frame \`odom\`** → 로봇 = EKF의 \`odom→base_footprint\`(융합값). **\`map\`** → cuVSLAM 보정 + EKF.
- 토픽 \`/odom\`(바퀴만)은 Odometry 디스플레이를 따로 넣어야 보인다. 같은 이름의 TF 프레임 \`odom\`과 다른 것이다.
- 가까운 일(장애물 회피 · 추적)은 **끊김 없는 \`odom\`**, 먼 목표(지도 위 목적지)는 **\`map\`** 기준 — map은 보정될 때 튈 수 있어서다.
`,
  },
  use: {
    label: '④ TF 가져다 쓰기',
    md: `
## TF 가져다 쓰기 — Buffer · TransformListener · lookupTransform


### 그림 1 — 좌표 바꾸기: 카메라 기준 → 지도 기준

<figure class="tf-fig"><svg viewBox="0 0 900 400" style="width:100%;max-width:960px;height:auto;display:block;margin:0 auto" role="img" aria-label="lookupTransform 좌표 바꾸기"><defs><marker id="f5r" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#dc2626"/></marker><marker id="f5g" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#16a34a"/></marker><marker id="f5b" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#2563eb"/></marker><marker id="f5k" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#475569"/></marker><marker id="f5v" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#7c3aed"/></marker><marker id="f5x" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#dc2626"/></marker></defs><rect x="0" y="0" width="900" height="400" fill="#ffffff"/><line x1="60" y1="20" x2="60" y2="350" stroke="#eef2f7"/><text x="57" y="366" font-size="10" fill="#94a3b8">0</text><line x1="170" y1="20" x2="170" y2="350" stroke="#eef2f7"/><text x="167" y="366" font-size="10" fill="#94a3b8">1</text><line x1="280" y1="20" x2="280" y2="350" stroke="#eef2f7"/><text x="277" y="366" font-size="10" fill="#94a3b8">2</text><line x1="390" y1="20" x2="390" y2="350" stroke="#eef2f7"/><text x="387" y="366" font-size="10" fill="#94a3b8">3</text><line x1="500" y1="20" x2="500" y2="350" stroke="#eef2f7"/><text x="497" y="366" font-size="10" fill="#94a3b8">4</text><line x1="610" y1="20" x2="610" y2="350" stroke="#eef2f7"/><text x="607" y="366" font-size="10" fill="#94a3b8">5</text><line x1="60" y1="350" x2="610" y2="350" stroke="#eef2f7"/><text x="46" y="354" font-size="10" fill="#94a3b8">0</text><line x1="60" y1="240" x2="610" y2="240" stroke="#eef2f7"/><text x="46" y="244" font-size="10" fill="#94a3b8">1</text><line x1="60" y1="130" x2="610" y2="130" stroke="#eef2f7"/><text x="46" y="134" font-size="10" fill="#94a3b8">2</text><line x1="60" y1="20" x2="610" y2="20" stroke="#eef2f7"/><text x="46" y="24" font-size="10" fill="#94a3b8">3</text><text x="570" y="380" font-size="10" fill="#94a3b8">map x [m]</text><line x1="60" y1="350" x2="104" y2="350" stroke="#dc2626" stroke-width="3" marker-end="url(#f5r)"/><line x1="60" y1="350" x2="60" y2="306" stroke="#16a34a" stroke-width="3" marker-end="url(#f5g)"/><circle cx="60" cy="350" r="5" fill="#ca8a04"/><text x="66" y="342" font-size="13" font-weight="800" fill="#a16207">map</text><polygon points="279.6,210.7 294.1,240.7 263.0,255.7 248.5,225.8" fill="#e0f2fe" stroke="#0369a1" stroke-width="2"/><line x1="280.0" y1="229.0" x2="311.7" y2="213.7" stroke="#dc2626" stroke-width="2.4" marker-end="url(#f5r)"/><line x1="280.0" y1="229.0" x2="264.7" y2="197.3" stroke="#16a34a" stroke-width="2.4" marker-end="url(#f5g)"/><circle cx="280.0" cy="229.0" r="4" fill="#0369a1"/><text x="290.0" y="271.0" font-size="11" font-weight="800" fill="#0369a1">로봇 base_footprint (2.00, 1.10)</text><rect x="259.3" y="228.6" width="14" height="14" rx="3" fill="#0f172a"/><line x1="266.3" y1="235.6" x2="296.1" y2="221.2" stroke="#2563eb" stroke-width="2.4" marker-end="url(#f5b)"/><line x1="266.3" y1="235.6" x2="278.3" y2="260.4" stroke="#dc2626" stroke-width="2.4" marker-end="url(#f5r)"/><line x1="262.3" y1="229.6" x2="206.3" y2="165.6" stroke="#0f172a" stroke-width="1" stroke-dasharray="3 2"/><text x="36.3" y="147.6" font-size="10.5" font-weight="700" fill="#0f172a">카메라 pole_front_cam_color_optical_frame</text><text x="36.3" y="161.6" font-size="10" fill="#64748b">z(파랑) = 카메라 앞 · x(빨강) = 오른쪽 · y = 아래</text><circle cx="390.0" cy="188.1" r="9" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/><text x="402.0" y="192.1" font-size="12" font-weight="800" fill="#7f1d1d">퍽</text><line x1="266.3" y1="235.6" x2="384.0" y2="192.1" stroke="#2563eb" stroke-width="2" stroke-dasharray="5 4"/><text x="340.2" y="239.8" font-size="11" font-weight="700" fill="#2563eb">카메라 기준: x 0.10 · z 1.20 m</text><text x="340.2" y="253.8" font-size="10" fill="#2563eb">(영상에서 바로 나온 값)</text><path d="M66,344 Q 180 128.1 380.0,182.1" fill="none" stroke="#7c3aed" stroke-width="2.4" marker-end="url(#f5v)"/><text x="130" y="98.1" font-size="11.5" font-weight="800" fill="#7c3aed">map 기준: (3.00, 1.47) m</text><text x="130" y="113.1" font-size="10.5" fill="#7c3aed">= lookupTransform("map", "pole_front_cam_color_optical_frame", 영상 stamp)로 바꾼 값</text><rect x="642" y="20" width="250" height="300" rx="10" fill="#f8fafc" stroke="#cbd5e1"/><text x="650" y="40" font-size="12" font-weight="800" fill="#0f172a">Buffer가 이어 붙이는 조각</text><rect x="650" y="54" width="232" height="18" rx="9" fill="#ffffff" stroke="#94a3b8"/><text x="660" y="67" font-size="10.5" font-weight="700" fill="#0f172a">map</text><line x1="660" y1="84" x2="660" y2="102" stroke="#ca8a04" stroke-width="1.6" marker-end="url(#f5k)"/><text x="672" y="97" font-size="9.5" fill="#ca8a04">/map_tf_relay</text><rect x="650" y="102" width="232" height="18" rx="9" fill="#ffffff" stroke="#94a3b8"/><text x="660" y="115" font-size="10.5" font-weight="700" fill="#0f172a">odom</text><line x1="660" y1="132" x2="660" y2="150" stroke="#ea580c" stroke-width="1.6" marker-end="url(#f5k)"/><text x="672" y="145" font-size="9.5" fill="#ea580c">/ekf_filter_node</text><rect x="650" y="150" width="232" height="18" rx="9" fill="#ffffff" stroke="#94a3b8"/><text x="660" y="163" font-size="10.5" font-weight="700" fill="#0f172a">base_footprint</text><line x1="660" y1="180" x2="660" y2="198" stroke="#16a34a" stroke-width="1.6" marker-end="url(#f5k)"/><text x="672" y="193" font-size="9.5" fill="#16a34a">/robot_state_publisher (static)</text><rect x="650" y="198" width="232" height="18" rx="9" fill="#ffffff" stroke="#94a3b8"/><text x="660" y="211" font-size="10.5" font-weight="700" fill="#0f172a">base_link</text><line x1="660" y1="228" x2="660" y2="246" stroke="#16a34a" stroke-width="1.6" marker-end="url(#f5k)"/><text x="672" y="241" font-size="9.5" fill="#16a34a">/robot_state_publisher (static)</text><rect x="650" y="246" width="232" height="18" rx="9" fill="#ffffff" stroke="#94a3b8"/><text x="660" y="259" font-size="10.5" font-weight="700" fill="#0f172a">pole_front_cam_link</text><line x1="660" y1="276" x2="660" y2="294" stroke="#16a34a" stroke-width="1.6" marker-end="url(#f5k)"/><text x="672" y="289" font-size="9.5" fill="#16a34a">/robot_state_publisher (static)</text><rect x="650" y="294" width="232" height="18" rx="9" fill="#ffffff" stroke="#94a3b8"/><text x="660" y="307" font-size="10.5" font-weight="700" fill="#0f172a">…color_optical_frame</text><text x="650" y="340" font-size="10" fill="#475569">요청은 프레임 이름 두 개뿐 — 중간 5조각은</text><text x="650" y="354" font-size="10" fill="#475569">Buffer가 찾아 곱한다 (영상 stamp 시각 값)</text></svg><figcaption>카메라가 본 점(카메라 기준)을 지도 기준으로 바꾸기. 로봇 자세 · 퍽 위치는 예시이고, 카메라 위치(base_footprint 뒤 13.8 cm)는 URDF 값. 위에서 본 그림이라 카메라의 아래 기울기(19°)는 생략. 실제 perception_node는 track_frame(odom) 기준으로 먼저 바꾼다.</figcaption></figure>

### 그림 2 — 시각: stamp로 물을 때 생기는 일

<figure class="tf-fig"><svg viewBox="0 0 900 290" style="width:100%;max-width:960px;height:auto;display:block;margin:0 auto" role="img" aria-label="lookupTransform 시각"><defs><marker id="f6r" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#dc2626"/></marker><marker id="f6g" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#16a34a"/></marker><marker id="f6b" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#2563eb"/></marker><marker id="f6k" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#475569"/></marker><marker id="f6v" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#7c3aed"/></marker><marker id="f6x" markerWidth="9" markerHeight="9" refX="7" refY="4.0" orient="auto"><path d="M0,0 L8,4.0 L0,8 z" fill="#dc2626"/></marker></defs><rect x="0" y="0" width="900" height="290" fill="#ffffff"/><line x1="60" y1="120" x2="840" y2="120" stroke="#475569" stroke-width="2" marker-end="url(#f6k)"/><text x="816" y="142" font-size="11" fill="#475569">시간 →</text><text x="60" y="34" font-size="12.5" font-weight="800" fill="#0f172a">노드 안 Buffer 에 쌓인 odom→base_footprint 기록 (EKF 30Hz — 점 하나 = /tf 메시지 하나)</text><circle cx="90" cy="120" r="5" fill="#ea580c"/><circle cx="126" cy="120" r="5" fill="#ea580c"/><circle cx="162" cy="120" r="5" fill="#ea580c"/><circle cx="198" cy="120" r="5" fill="#ea580c"/><circle cx="234" cy="120" r="5" fill="#ea580c"/><circle cx="270" cy="120" r="5" fill="#ea580c"/><circle cx="306" cy="120" r="5" fill="#ea580c"/><circle cx="342" cy="120" r="5" fill="#ea580c"/><circle cx="378" cy="120" r="5" fill="#ea580c"/><circle cx="414" cy="120" r="5" fill="#ea580c"/><circle cx="450" cy="120" r="5" fill="#ea580c"/><circle cx="486" cy="120" r="5" fill="#ea580c"/><circle cx="522" cy="120" r="5" fill="#ea580c"/><circle cx="558" cy="120" r="5" fill="#ea580c"/><circle cx="594" cy="120" r="5" fill="#ea580c"/><circle cx="630" cy="120" r="5" fill="#ea580c"/><circle cx="666" cy="120" r="5" fill="#ea580c"/><circle cx="702" cy="120" r="5" fill="#ea580c"/><circle cx="738" cy="120" r="5" fill="#ea580c"/><text x="698" y="106" font-size="10.5" font-weight="700" fill="#ea580c">가장 최근 TF</text><rect x="64" y="90" width="20" height="60" fill="#f1f5f9"/><text x="64" y="164" font-size="9.5" fill="#64748b">기록 밖 (오래돼 버림)</text><line x1="360" y1="128" x2="360" y2="166" stroke="#16a34a" stroke-width="2" stroke-dasharray="3 3"/><polygon points="354,122 366,122 360,132" fill="#16a34a"/><text x="300" y="180" font-size="11" font-weight="800" fill="#16a34a">✔ ① 영상 stamp (두 점 사이)</text><text x="300" y="195" font-size="10" fill="#475569">앞뒤 두 점을 보간해 그 순간 값</text><line x1="784" y1="128" x2="784" y2="216" stroke="#dc2626" stroke-width="2" stroke-dasharray="3 3"/><polygon points="778,122 790,122 784,132" fill="#dc2626"/><text x="724" y="230" font-size="11" font-weight="800" fill="#dc2626">✘ ② stamp가 최신보다 뒤</text><text x="724" y="245" font-size="10" fill="#475569">"extrapolation into the future" 실패</text><text x="588" y="262" font-size="10.5" font-weight="700" fill="#dc2626">→ 우리 코드: TimePointZero 로 다시 물어 최신 값 사용</text><text x="588" y="277" font-size="10" fill="#64748b">perception_node · body_filter · hand_relative · cuvslam_slam</text><path d="M784,112 Q 762 70 742,110" fill="none" stroke="#dc2626" stroke-width="2" marker-end="url(#f6x)"/><line x1="738" y1="112" x2="738" y2="94" stroke="#2563eb" stroke-width="2" stroke-dasharray="3 3"/><polygon points="732,122 744,122 738,132" fill="#2563eb"/><text x="678" y="74" font-size="11" font-weight="800" fill="#2563eb">✔ ③ TimePointZero</text><text x="678" y="89" font-size="10" fill="#475569">시각 안 따지고 가장 최근 점</text><line x1="80" y1="128" x2="80" y2="216" stroke="#7c3aed" stroke-width="2" stroke-dasharray="3 3"/><polygon points="74,122 86,122 80,132" fill="#7c3aed"/><text x="20" y="230" font-size="11" font-weight="800" fill="#7c3aed">✘ ④ stamp가 기록보다 앞</text><text x="20" y="245" font-size="10" fill="#475569">"extrapolation into the past" 실패 · 기록 길이는 ⚪</text></svg><figcaption>lookupTransform의 time 인자. 영상은 카메라 · 전송 지연으로 TF보다 늦게 도착하기도, TF가 영상보다 늦게 도착하기도 한다 — 그래서 이 로봇 코드는 ① 영상 stamp로 먼저 묻고, ② 처럼 실패하면 ③ 최신으로 다시 묻는다. 점 간격 · 개수는 설명용.</figcaption></figure>

> 기준 소스: \`bee_bot_v2\` develop (\`bcac613f\`) · ✅ 이 저장소 · ✅ upstream = 공식 소스(robot_state_publisher rolling · tf2_ros rolling · ros2_controllers master) · ⚪ 미확인
>
> **도식 표시** 📦 제공 · 🛠️ 직접 작성 | 프로세스 박스: 첫 줄 \`패키지::실행 파일\`, 둘째 줄 \`노드 /이름\` | ✉️ 토픽 · 🔌 시리얼 · 🔗 같은 프로세스 메모리 · 📄 파일 | 둥근 상자 = TF 프레임 · 주황 = 움직이는 TF(/tf) · 초록 = 고정 TF(/tf_static) · 노란 = 위치 TF | 노드에 마우스를 올리면 근거
${F}mermaid
flowchart TB
    subgraph PUBS["TF를 내는 쪽"]
        direction LR
        P1["🛠️ ros_system::map_tf_relay<br/>노드 /map_tf_relay<br/>map→odom"]
        P2["📦 robot_localization::ekf_node<br/>노드 /ekf_filter_node<br/>odom→base_footprint"]
        P3["📦 robot_state_publisher::robot_state_publisher<br/>노드 /robot_state_publisher<br/>관절 9개 /tf · 고정 27개 /tf_static"]
    end
    TF["✉️ /tf (바뀌는 것) · ✉️ /tf_static (안 바뀌는 것 · latched)<br/>메시지 = frame_id · child_frame_id · 위치 · 회전"]
    subgraph MECH["TF를 쓰는 노드 안 — 노드마다 하나씩 따로 가짐"]
        direction LR
        LIS["📦 tf2_ros::TransformListener<br/>/tf · /tf_static 구독"]
        BUF[("📦 tf2_ros::Buffer<br/>프레임 쌍마다 시간별 기록<br/>노드 메모리 안")]
        LK["lookupTransform(target, source, time)<br/>사슬을 이어 붙여 계산"]
        LIS ==> BUF ==> LK
    end
    subgraph USERS["이 로봇에서 TF를 쓰는 노드 — 무엇을 · 언제 기준으로"]
        direction TB
        U1["🛠️ plan::mission_manager · 노드 /mission_manager<br/>map ← base_footprint · 최신<br/>로봇이 지도 어디에 있나 (:1609)"]
        U2["🛠️ plan::coordinator · 노드 /coordinator<br/>map ← base_footprint · 최신 (:617)"]
        U3["🛠️ perception::perception_node · 노드 /perception<br/>odom(track_frame) ← 카메라 광학 프레임<br/>영상 stamp → 실패하면 최신 (:1326~1340)"]
        U4["🛠️ perception::body_filter · 노드 /body_filter<br/>점구름 프레임 ← 몸 링크<br/>stamp + 0.05 s 기다림 → 최신 (:172~175)"]
        U5["🛠️ perception::hand_relative · 노드 /hand_relative<br/>손 ↔ 물체 프레임 쌍<br/>영상 stamp → 최신 (:117~124)"]
        U6["🛠️ ros_system::cuvslam_slam · 노드 /cuvslam_slam<br/>odom ← base_footprint<br/>영상 stamp → 최신 (:549~554)"]
        U7["📦 Nav2 (nav2_container 안 컴포넌트)<br/>bt_navigator · controller_server · costmap<br/>global_frame map · odom / robot_base_frame base_footprint · base_center<br/>transform_tolerance 0.5 s · costmap 0.2 s"]
    end
    SKN["🛠️ rclcpp_components::component_container · 노드 /base_skills<br/>안의 컴포넌트 skills::NavigateSkill · 노드 /skill_navigate<br/>Nav2 목표 header.stamp = 0 (:97)"]
    P1 ==>|"노드 /map_tf_relay 발행"| TF
    P2 ==>|"노드 /ekf_filter_node 발행"| TF
    P3 ==>|"노드 /robot_state_publisher 발행"| TF
    TF ==>|"쓰는 노드마다 자기 TransformListener 가 구독"| LIS
    LK ==>|"lookupTransform"| USERS
    SKN -.->|"노드 /skill_navigate 가 🎬 /navigate_to_pose 요청 → 노드 /bt_navigator 가 받음 · stamp 0 = 최신 TF로"| U7
    %% tip LIS: 만드는 법 | tf_ = make_shared<tf2_ros::Buffer>(get_clock()); tf_listener_ = make_shared<tf2_ros::TransformListener>(*tf_); — perception_node.cpp:389~390. 노드마다 자기 Buffer를 가진다.
    %% tip LK: lookupTransform | 인자 순서가 (target, source)다. source 프레임의 좌표를 target 프레임으로 바꾸는 변환을 돌려준다. time = tf2::TimePointZero면 가장 최근 값, stamp를 주면 그 시각 값, timeout을 주면 그만큼 기다린다. 사슬 계산은 Buffer가 한다 — 예 map→odom→base_footprint→base_link→arm_base_link→…→gripper_cam_color_optical_frame.
    %% tip U3: perception_node | 영상이 찍힌 순간의 카메라 위치가 필요해서 영상 stamp로 먼저 묻는다. 그 시각 TF가 아직 없으면(영상이 TF보다 먼저 도착) 최신으로 다시 묻고, 시각 차가 상한을 넘으면 기록한다. 노드 이름 perception(perception_node.cpp:182).
    %% tip U7: Nav2 | 설정의 global_frame · robot_base_frame으로 매번 TF를 조회한다. TF가 transform_tolerance보다 늦으면 실패로 본다(nav2_params.yaml:19~20, 22, 38, 179, 196~197, 246, 250, 310).
    %% tip SKN: navigate_skill | 목표 자세의 stamp를 0으로 비워 보낸다 — 예전 실측: 보낸 시각의 TF가 Buffer에 없어 Nav2 error 102(navigate_skill.cpp:97). stamp 0은 '가장 최근 TF로 계산하라'는 뜻이다.
${CLS}
    class P2,P3,LIS,BUF,TF,U7 std;
    class P1,LK,U1,U2,U3,U4,U5,U6,SKN mine;
    style PUBS fill:#f8fafc,stroke:#cbd5e1
    style MECH fill:#ffffff,stroke:#94a3b8
    style USERS fill:#f0f9ff,stroke:#7dd3fc
${F}

### 기본 모양

${F}cpp
// 노드를 만들 때 한 번 (perception_node.cpp:389~390)
tf_ = std::make_shared<tf2_ros::Buffer>(get_clock());
tf_listener_ = std::make_shared<tf2_ros::TransformListener>(*tf_);   // /tf · /tf_static 구독 시작

// 필요할 때 — "base_footprint 좌표를 map 좌표로" = 로봇이 지도 어디에 있나 (mission_manager.cpp:1609)
const auto t = tf_buffer_->lookupTransform("map", "base_footprint", tf2::TimePointZero);  // 가장 최근 값
${F}

- 인자 순서는 **(target, source)** — "source 프레임의 점을 target 프레임으로 옮기는 변환"이다. \`("map", "base_footprint")\`의 이동량 = 지도 위 로봇 위치.
- **사슬은 Buffer가 계산한다.** 요청은 프레임 이름 둘이면 되고, 중간 조각(map→odom→base_footprint …)은 Buffer가 알아서 이어 붙인다.
- \`time\`: \`tf2::TimePointZero\` = **가장 최근 값** · 메시지의 \`stamp\` = **그 순간 값**(영상이 찍힌 순간의 카메라 위치처럼) · 네 번째 인자 timeout = 그만큼 기다림.

### 이 로봇에서 실제로 쓰는 모양 — 시각 맞추기와 대체

| 노드 (코드) | 요청 | 시각 | 실패하면 | 근거 |
|---|---|---|---|---|
| 🛠️ \`plan\` mission_manager · coordinator | \`map ← base_footprint\` (로봇 위치) | 가장 최근 | 위치 없음으로 처리 | ✅ \`mission_manager.cpp:1609\` · \`coordinator.cpp:617\` |
| 🛠️ \`perception\` perception_node | \`odom(track_frame) ← 카메라 프레임\` | **영상 stamp** | 가장 최근으로 다시 — 시각 차가 상한을 넘으면 기록 | ✅ \`perception_node.cpp:1326~1340\` |
| 🛠️ \`perception\` body_filter | \`점구름 프레임 ← 몸 링크\` | 점구름 stamp, **0.05 s 기다림** | 가장 최근으로 | ✅ \`body_filter.cpp:172~175\` |
| 🛠️ \`perception\` hand_relative | 손 · 물체 프레임 쌍 | 영상 stamp | 가장 최근으로 | ✅ \`hand_relative.cpp:117~124\` |
| 🛠️ \`ros_system\` cuvslam_slam | \`odom ← base_footprint\` | 영상 stamp | 가장 최근으로 (stamp가 TF보다 앞설 때) | ✅ \`cuvslam_slam.cpp:549~554\` |
| 🛠️ \`skills\` navigate_skill | Nav2 목표의 \`header.stamp = 0\` | 0 = 가장 최근 TF를 쓰라는 뜻 | — (예전 실측: 보낸 시각 TF가 없어 error 102) | ✅ \`navigate_skill.cpp:97\` |
| 📦 Nav2 | 설정의 \`global_frame\` · \`robot_base_frame\`으로 매번 조회 | — | \`transform_tolerance\`(0.5 s · costmap 0.2 s)까지 늦은 TF 허용 | ✅ \`nav2_params.yaml:22, 38, 179, 310\` |

- **자주 나는 오류**: "extrapolation into the future" — 요청한 stamp가 Buffer의 최신 TF보다 앞설 때(영상이 TF보다 먼저 도착). 그래서 위처럼 **stamp로 먼저 시도하고 실패하면 최신으로** 다시 묻는다.
- "frame does not exist" — 그 프레임을 내는 노드가 아직 안 떴거나(예: robot_state_publisher 전), 이름 오타.
- \`/tf_static\`은 latched라 늦게 뜬 노드도 고정 프레임을 바로 받는다. \`/tf\`는 지금부터 오는 것만 받으므로, 막 뜬 노드는 잠깐 "없음"이 날 수 있다.
- Buffer가 시간 기록을 얼마나 오래 들고 있는지(기본 길이)는 확인하지 않았다 ⚪.
`,
  },
};
const ORDER = Object.keys(SECTIONS) as Sec[];

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosRobotTf extends w.HTMLElement {
    private sec?: Sec;

    /** ?concept=nodeops&tab=robottf&cs=섹션 — 클릭 push·뒤로가기·딥링크 */
    @subscribeSwcAppRouteChange('/ros2', { trigger: 'connectedDone' })
    onRoute(@swcAppRouteQueryParam('concept') concept: string | null, @swcAppRouteQueryParam('tab') tab: string | null, @swcAppRouteQueryParam('cs') cs: string | null) {
      if (concept !== 'nodeops' || tab !== 'robottf') return;
      const sec: Sec = cs && cs in SECTIONS ? (cs as Sec) : ORDER[0];
      if (sec === this.sec) return;
      const first = this.sec === undefined;
      this.sec = sec;
      this.render2();
      if (!first) (this.shadowRoot?.querySelector('.rc-secs') as HTMLElement)?.scrollIntoView({ block: 'start' });
    }

    @swcAppRouteGo
    private goSec(sec: Sec) {
      if (sec === this.sec) return false;
      return { path: `/ros2?concept=nodeops&tab=robottf&cs=${sec}`, scrollToTop: false };
    }

    private async render2() {
      const sec = this.sec!;
      this.shadowRoot?.querySelectorAll('.rc-sec').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.sec === sec));
      const body = this.shadowRoot?.querySelector('#rc-body') as HTMLElement;
      if (!body) return;
      await markdownParse(body, SECTIONS[sec].md);
    }

    @addEventListener('.rc-sec', 'click', { delegate: true })
    onSec(e: Event) {
      const b = (e.target as HTMLElement).closest('.rc-sec') as HTMLElement;
      if (b?.dataset.sec) this.goSec(b.dataset.sec as Sec);
    }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; font-size:13px; color:#334155; line-height:1.75; }
          * { box-sizing:border-box; }
          .rc-intro { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:12px; }
          .rc-intro b { color:#22314e; }
          .rc-secs { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; scroll-margin-top:12px; }
          .rc-sec { padding:6px 12px; border-radius:16px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#22314e; font-size:12px; font-weight:700; cursor:pointer; }
          .rc-sec.active { background:linear-gradient(135deg,#22314e,#7dd3fc); color:#fff; border-color:transparent; }
          #rc-body { background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; margin-top:10px; overflow-wrap:anywhere; }
          #rc-body h2 { font-size:16px; font-weight:800; color:#1e293b; margin:4px 0 8px; padding-bottom:4px; border-bottom:2px solid #e0f2fe; }
          #rc-body h3 { font-size:14px; font-weight:800; color:#22314e; margin:18px 0 6px; }
          #rc-body p { margin:6px 0; }
          #rc-body ul, #rc-body ol { padding-left:20px; margin:6px 0; }
          #rc-body code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          #rc-body pre { background:#0f172a; color:#e2e8f0; border-radius:8px; padding:10px 12px; overflow-x:auto; font-size:12px; line-height:1.55; }
          #rc-body pre code { background:none; padding:0; color:inherit; }
          #rc-body pre.mermaid { background:#fff; color:#1e293b; border:1px solid #e2e8f0; text-align:center; overflow-wrap:normal; white-space:normal; line-height:normal; font-size:16px; }
          #rc-body pre.mermaid p { margin:0; }
          #rc-body pre.mermaid svg { max-width:100%; height:auto; }
          #rc-body blockquote { margin:10px 0; padding:8px 12px; background:#fff7ed; border-left:4px solid #f59e0b; border-radius:0 6px 6px 0; color:#7c2d12; }
          #rc-body blockquote p { margin:0; }
          #rc-body table { display:block; overflow-x:auto; border-collapse:collapse; margin:8px 0; font-size:12px; max-width:100%; }
          #rc-body th, #rc-body td { border:1px solid #e2e8f0; padding:5px 8px; text-align:left; vertical-align:top; }
          #rc-body th { background:#f0f9ff; color:#22314e; white-space:nowrap; }
          [hidden] { display:none !important; }
          @media(max-width:600px){ #rc-body { padding:10px; } }
        </style>

        <div class="rc-secs">${ORDER.map(k => `<button class="rc-sec" data-sec="${k}">${SECTIONS[k].label}</button>`).join('')}</div>
        <div id="rc-body"></div>
      `;
    }
  }

  return tagName;
};
