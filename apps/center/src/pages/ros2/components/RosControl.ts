import {
  addEventListener,
  elementDefine,
  onConnectedBodyShadow,
  subscribeSwcAppRouteChange,
  swcAppRouteGo,
  swcAppRouteQueryParam,
} from '@dooboostore/simple-web-component';
import { markdownCancel, markdownParse } from '@center-src/utils/markdown';

const tagName = 'center-ros2-control';

type Sec = 'concept' | 'flow' | 'hw' | 'ctrl' | 'connect' | 'robot' | 'big' | 'ex' | 'cm' | 'cmboot';

const F = '```';

const CLS = `    classDef std fill:#c8e6c9,stroke:#2e7d32,color:#1b1b1b;
    classDef rl fill:#ffe0b2,stroke:#e65100,color:#1b1b1b;
    classDef hw fill:#fff9c4,stroke:#f9a825,color:#1b1b1b;
    classDef mine fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e;
    classDef ext fill:#ffffff,stroke:#8A97A0,stroke-dasharray:4 3,color:#475569;`;

const SECTIONS: Record<Sec, { label: string; md?: string }> = {
  concept: {
    label: '① 한눈에 — 개념',
    md: `
## 한 줄 요약

> **ros2_control = 모터·센서를 컨트롤러에 꽂는 "표준 콘센트".** 반장(\`controller_manager\`)이 **10ms마다 호루라기**를 불어 **읽기 → 계산 → 쓰기**를 시킨다. 장치가 바뀌면 *하드웨어 플러그인*만 갈아 끼우고, 계산하는 쪽은 그대로다.

${F}mermaid
flowchart TB
    UP["📦 위쪽 노드<br/>moveit_ros_move_group::move_group · nav2_* · 사람<br/>(토픽 · 액션으로 대화)"]
    subgraph CM["📦 controller_manager::ros2_control_node — 하나의 프로세스, 100Hz 루프"]
        direction TB
        CT["📦 컨트롤러 플러그인 (대부분 제공)<br/>계산: 목표 → 명령<br/>update()"]
        SL["🔗 칸(변수) 목록<br/>state · command · reference<br/>같은 메모리의 double"]
        HW["🛠️ 하드웨어 플러그인<br/>control::BeebotSystemHardware<br/>장치 통신<br/>read() · write()"]
        CT <-->|"읽기 · 쓰기"| SL
        SL <-->|"채우기 · 가져가기"| HW
    end
    DEV{{"🔌 장치<br/>모터 · 센서 (USB · CAN · EtherCAT)"}}
    UP ==>|"✉️ 목표 (궤적 · cmd_vel)"| CT
    CT -.->|"✉️ 결과 (/joint_states · /odom)"| UP
    HW <==>|"🔌 장치마다 다른 통신"| DEV
${CLS}
    class UP,CT std;
    class HW mine;
    class SL rl;
    class DEV hw;
    style CM fill:#f8fafc,stroke:#94a3b8
${F}

위쪽만 **토픽**이고, 안쪽은 전부 **같은 메모리의 변수**라서 복사도 직렬화도 없고 시간도 정확하다. 그래서 모터 제어를 여기에 올린다.

## 이것만 기억하면 된다 — 3가지

| | 무엇 | 한마디 |
| --- | --- | --- |
| **① 칸** | \`관절이름/인터페이스\` 이름이 붙은 double 변수 (예: \`joint2/position\`) | 하드웨어와 컨트롤러가 **같은 칸**을 보고 있을 뿐, 중간 전달이 없다 |
| **② 플러그인 두 종류** | **하드웨어**(칸을 채우고 장치로 보냄) · **컨트롤러**(칸을 읽고 계산해 칸에 씀) | 둘 다 기본 클래스를 상속해 함수 몇 개만 채운다. 부르는 건 반장 |
| **③ 박자** | 매 주기 **read() → update() → write()** | 읽기(장치→칸) → 계산(칸→칸) → 쓰기(칸→장치). 순서는 틀이 정함 |

### 칸은 세 종류 — 누가 쓰고 누가 읽나

| 칸 | 내놓는 쪽 | 쓰기 | 읽기 | 예 |
| --- | --- | --- | --- | --- |
| **state** | 하드웨어 | 하드웨어만 | **여럿** | \`joint2/position\` = 지금 각도 |
| **command** | 하드웨어 | **컨트롤러 하나만** (둘이 잡으면 활성화 실패) | 하드웨어 | \`joint2/position\` = 보낼 목표 각도 |
| **reference** | 체인 컨트롤러 | **앞 컨트롤러** | 주인 컨트롤러 | \`rl_arm_correction/joint2/position\` (④) |

## 일반 노드와 뭐가 다른가

| | 일반 노드 | ros2_control 플러그인 |
| --- | --- | --- |
| 실행 단위 | 프로세스 하나 | controller_manager 안의 **객체** |
| 누가 부르나 | 자기 타이머·콜백 | **controller_manager가** 정해진 순서로 |
| 데이터 | 토픽·서비스 (직렬화·DDS) | 같은 메모리 변수 |
| 주기 | 노드마다 제각각 | 하나의 실시간 루프 (100Hz) |
| 내가 쓰는 것 | 노드 전체 | 기본 클래스의 몇 개 함수 |
| 불러오는 법 | launch 실행 | **pluginlib**가 클래스 이름 문자열로 \`.so\` 로드 |

## 내가 손대는 곳은 4군데

| 어디 | 무엇 | 자세히 |
| --- | --- | --- |
| **플러그인 코드** (C++) | 하드웨어 read/write · 필요하면 컨트롤러 update | ③ · ④ |
| **URDF \`<ros2_control>\`** | 어느 플러그인을 쓰고, 관절마다 어떤 칸을 내놓나 | ⑤ |
| **controllers.yaml** | 어떤 컨트롤러를 띄우고 파라미터는 무엇 | ⑤ |
| **launch** | \`ros2_control_node\` · spawner 실행 | ⑤ |

## 이 로봇은 이렇게 생겼다 (한 장)

| 층 | 이 로봇 | 비고 |
| --- | --- | --- |
| 장치 | OpenCR 1개 → 다이나믹셀(바퀴 2 · 팔 5 · 그리퍼 1) + IMU | 전부 한 보드라 controller_manager도 하나 |
| 하드웨어 플러그인 | \`BeebotSystemHardware\` (직접 작성) | USB 시리얼로 **C 줄(명령) · S 줄(상태)** |
| 컨트롤러 6개 | joint_state_broadcaster · imu_sensor_broadcaster · diff_drive_controller · gripper_controller · **rl_arm_correction**(직접 작성) · arm_controller(JTC) | 팔은 \`arm_controller → rl_arm_correction → 하드웨어\` 체인 |
| 위쪽 | move_group · Nav2 | 궤적·\`cmd_vel\`로 컨트롤러에 목표를 줌 |

→ 시작부터 데이터까지 **전부 한 장**은 **⑦**, 관절·그리퍼·바퀴 **예시로 따라가기**는 **⑧**, 단계별 동작은 **② 한 주기 흐름**, 연결 방법은 **⑤**, 이 로봇의 실제 설정은 **⑥**.

## 같은 "플러그인 끼우기" 패턴이 다른 곳에도 있다

| 틀 | 끼워 넣는 것 | 예 |
| --- | --- | --- |
| Nav2 planner · controller server | 플래너·컨트롤러 | NavFn, Smac, DWB, MPPI |
| Nav2 costmap_2d | 레이어 | static, obstacle, voxel, inflation |
| Nav2 bt_navigator | BT 노드 | FollowPath, Spin |
| MoveIt | 플래너·IK | OMPL, pick_ik, KDL |
| RViz | Display·Tool | 커스텀 시각화 |

> 설정 파일의 \`plugin: ...\`·\`type: ...\` 줄은 전부 같은 뜻이다: "이 이름의 클래스를 불러다 틀에 끼워라."
`,
  },

  flow: { label: '② 한 주기 흐름' },

  hw: {
    label: '③ 하드웨어 플러그인',
    md: `
## 하드웨어 플러그인 — 장치마다 다른 통신은 여기서

controller_manager는 장치를 모릅니다. 시리얼·CAN·EtherCAT·패킷 형식·단위 변환은 **전부 하드웨어 플러그인 안**에 있습니다. 플러그인이 내놓은 변수만 맞으면 컨트롤러·MoveIt·Nav2는 장치가 바뀌어도 그대로입니다.

### 어떤 클래스를 상속하나

| 종류 | 쓰는 곳 | 예 |
| --- | --- | --- |
| \`SystemInterface\` | 한 버스에 관절 여러 개 | OpenCR(팔·바퀴), 산업용 팔 컨트롤러 |
| \`ActuatorInterface\` | 관절 하나 = 장치 하나 | 독립 모터 드라이버 |
| \`SensorInterface\` | 읽기만 하는 장치 | 힘/토크 센서, 단독 IMU |
| \`mock_components/GenericSystem\` (제공) | 하드웨어 없이 시험 | 명령을 그대로 상태로 돌려줌 |

### 생명주기 — 누가 언제 부르나

${F}mermaid
stateDiagram-v2
    [*] --> unconfigured: on_init() — URDF param 읽기
    unconfigured --> inactive: on_configure() — 포트 열기
    inactive --> active: on_activate() — 토크 켜기
    active --> active: 매 주기 read() / write()
    active --> inactive: on_deactivate() — 토크 끄기
    inactive --> unconfigured: on_cleanup() — 포트 닫기
${F}

### 뼈대 (일반적인 SystemInterface 형태, Jazzy)

${F}cpp
class MyHardware : public hardware_interface::SystemInterface {
public:
  CallbackReturn on_init(const hardware_interface::HardwareInfo & info) override {
    if (SystemInterface::on_init(info) != CallbackReturn::SUCCESS) return CallbackReturn::ERROR;
    port_ = info_.hardware_parameters["port"];     // URDF <param>
    positions_.resize(info_.joints.size(), 0.0);             // 관절 수만큼 변수 준비
    return CallbackReturn::SUCCESS;
  }
  CallbackReturn on_configure(const rclcpp_lifecycle::State &) override { /* 포트 열기 */ }
  CallbackReturn on_activate(const rclcpp_lifecycle::State &) override  { /* 토크 켜기 */ }
  CallbackReturn on_deactivate(const rclcpp_lifecycle::State &) override { /* 토크 끄기 */ }

  // "이 이름의 변수는 여기(주소)에 있다"고 틀에 알려 준다
  std::vector<hardware_interface::StateInterface> export_state_interfaces() override {
    std::vector<hardware_interface::StateInterface> out;
    for (size_t i = 0; i < info_.joints.size(); ++i) {
      out.emplace_back(info_.joints[i].name, hardware_interface::HW_IF_POSITION, &positions_[i]);
      out.emplace_back(info_.joints[i].name, hardware_interface::HW_IF_VELOCITY, &velocities_[i]);
      out.emplace_back(info_.joints[i].name, hardware_interface::HW_IF_EFFORT,   &efforts_[i]);
    }
    return out;
  }
  std::vector<hardware_interface::CommandInterface> export_command_interfaces() override;

  return_type read(const rclcpp::Time &, const rclcpp::Duration &) override {
    // 장치에서 읽기 (예: S 줄 수신) → rad · rad/s · A로 바꿔 positions_/velocities_/efforts_에
    return return_type::OK;
  }
  return_type write(const rclcpp::Time &, const rclcpp::Duration &) override {
    // commands_[i](rad) → 장치로 보내기 (예: C 줄 송신)
    return return_type::OK;
  }
};
${F}

${F}xml
<!-- pluginlib 등록: my_hardware.xml (CMake: pluginlib_export_plugin_description_file(hardware_interface my_hardware.xml)) -->
<library path="my_hardware">
  <class name="my_hardware/MyHardware" type="my_hardware::MyHardware"
         base_class_type="hardware_interface::SystemInterface"/>
</library>
${F}

- \`read()\`/\`write()\`는 실시간 루프에서 불린다 → 메모리 할당·긴 대기 금지. 통신 실패는 \`return_type::ERROR\`로 알리면 틀이 컨트롤러를 멈춘다.
- 최신 Jazzy 패치 버전에는 \`on_init(const HardwareComponentInterfaceParams &)\` 형태와 인터페이스 자동 등록도 있다. 설치한 버전의 ros2_control_demos 예제를 따른다.

### 장치 여러 개

URDF에 \`<ros2_control>\` 블록을 장치마다 하나씩 쓴다. 블록마다 하드웨어 플러그인 객체가 하나 생기고, 같은 controller_manager가 한 주기에 전부 read/write 한다. 컨트롤러는 관절 이름만 보므로 어느 장치에 붙은 관절인지 모른다.

${F}xml
<ros2_control name="Arm" type="system">      <!-- 팔: 다이나믹셀 -->
  <hardware><plugin>vendor_a/ArmHardware</plugin> ... </hardware>
  <joint name="joint1"> ... </joint>
</ros2_control>
<ros2_control name="Base" type="system">     <!-- 베이스: 다른 모터 드라이버 -->
  <hardware><plugin>vendor_b/BaseHardware</plugin> ... </hardware>
  <joint name="wheel_left_joint"> ... </joint>
</ros2_control>
${F}

### 무엇을 ros2_control로, 무엇을 일반 노드로?

| ros2_control (실시간 루프) | 일반 드라이버 노드 |
| --- | --- |
| 모터·서보·그리퍼, 바퀴, 저대역 센서(IMU·배터리·힘센서), GPIO | 카메라·RealSense·LiDAR·점구름 같은 대용량 센서, 느린 처리 |
| 정해진 주기로 읽고 쓰며 컨트롤러가 같은 메모리에서 바로 쓴다 | 데이터가 크고 주기가 불규칙해 실시간 루프를 막는다 → 자체 드라이버가 토픽으로 |
`,
  },

  ctrl: {
    label: '④ 컨트롤러·체인',
    md: `
## 컨트롤러 플러그인 — 변수를 읽고 계산해서 변수에 쓴다

컨트롤러도 같은 틀에 끼우는 플러그인입니다. \`update()\` 안에서 **state 변수를 읽고, 계산해서, command 변수에 씁니다.** 대부분은 제공 패키지(ros2_controllers)를 YAML로 설정만 해서 쓰고, 필요할 때만 직접 만듭니다.

### 변수 세 종류

| 종류 | 누가 내놓나 | 누가 쓰나 | 규칙 |
| --- | --- | --- | --- |
| **state interface** | 하드웨어 | 여러 컨트롤러가 함께 **읽기** | 예) joint2/position = 0.59 |
| **command interface** | 하드웨어 | **한 컨트롤러만** 쓰기 (소유권) | 예) joint2/position = 0.65 — 둘이 잡으려 하면 활성화 실패 |
| **reference interface** | chainable 컨트롤러 | 앞 컨트롤러가 쓰기 | 예) rl_arm_correction/joint2/position |

### 컨트롤러가 틀에 알려 주는 것

${F}cpp
// "나는 이 변수들을 쓰겠다 / 읽겠다" — 틀이 이걸 보고 변수를 연결(소유권 확인)
InterfaceConfiguration command_interface_configuration() const override {
  return {INDIVIDUAL, {"joint1/position", "joint2/position", "joint3/position", "joint4/position"}};
}
InterfaceConfiguration state_interface_configuration() const override {
  return {INDIVIDUAL, {"joint1/position", "joint1/velocity", /* ... */ "gripper_left_joint/effort"}};
}
return_type update(const rclcpp::Time & t, const rclcpp::Duration & dt) override {
  // state_interfaces_[i].get_value() 읽기 → 계산 → command_interfaces_[i].set_value(...)
}
${F}

### 체인 — 컨트롤러 뒤에 컨트롤러를 끼우기

chainable 컨트롤러는 **입력 자리(reference interface)**를 내놓습니다. 앞 컨트롤러(JTC)는 하드웨어 대신 그 자리에 쓰고, chainable 컨트롤러가 보정해서 하드웨어에 씁니다. 같은 주기 안에서 순서대로 돌아 지연이 없습니다.

${F}mermaid
flowchart LR
    MG["📦 move_group"] ==>|"🎬 FollowJointTrajectory"| JTC["📦 arm_controller<br/>(JTC)"]
    JTC -->|"🔗 reference 쓰기<br/>rl_arm_correction/joint2/position"| RAC["🛠️ rl_arm_correction<br/>extends ChainableControllerInterface"]
    RAC -->|"🔗 command 쓰기<br/>joint2/position = 목표 + Δ"| HW["📦 하드웨어 플러그인"]
    HW -->|"🔗 state<br/>position·velocity·effort"| RAC
    HW -->|"🔗 state<br/>position·velocity"| JTC
${CLS}
    class MG,JTC,HW std;
    class RAC rl;
${F}

${F}cpp
// chainable 컨트롤러 (Jazzy ChainableControllerInterface)
std::vector<hardware_interface::CommandInterface::SharedPtr> on_export_reference_interfaces_list() override;
  // → "rl_arm_correction/joint1~5/position" 입력 자리를 내놓음 (이 로봇은 팔 5축 + 그리퍼)
return_type update_reference_from_subscribers(const rclcpp::Time &, const rclcpp::Duration &) override;
  // 체인이 아닐 때 토픽으로 받은 값을 reference에 (체인 모드에선 안 불림)
return_type update_and_write_commands(const rclcpp::Time &, const rclcpp::Duration &) override;
  // reference + Δ → command (±0.05rad 클리핑, enabled=false면 Δ=0)
${F}

### controller_manager는 체인에서 데이터를 어떻게 옮겨 주나

먼저 오해 하나. **\`controller_manager\`는 값을 복사해서 한 컨트롤러에서 다음 컨트롤러로 옮겨 주지 않습니다.** 하는 일은 세 가지입니다.

1. 모든 **칸**(변수)의 이름과 주인을 목록으로 관리한다 (Resource Manager)
2. 컨트롤러가 "이 칸 주세요" 하면 그 칸을 **빌려준다** (소유권 확인 후 loan)
3. 매 주기 **어떤 순서로 \`update()\`를 부를지** 정한다

값이 넘어가는 것은 앞 컨트롤러가 칸에 **쓰고**, 뒤 컨트롤러가 같은 칸에서 **읽을** 때입니다. 같은 변수를 둘이 보고 있을 뿐, 중간에 복사나 전송이 없습니다.

#### 칸 목록 — Resource Manager가 들고 있는 것 (이 로봇 팔 기준)

${F}mermaid
flowchart LR
    subgraph RM["📦 Resource Manager — 칸 이름 · 주인 · 누가 빌려 갔나"]
        direction TB
        subgraph HWI["하드웨어가 내놓은 칸 (BeebotSystemHardware)"]
            S1["state<br/>joint1~5/position · velocity<br/>gripper_left_joint/effort"]
            C1["command<br/>joint1~5/position"]
        end
        subgraph REFI["체인 컨트롤러가 내놓은 칸 (rl_arm_correction)"]
            R1["reference<br/>rl_arm_correction/joint1~5/position"]
        end
    end
    JTC["arm_controller (JTC)"]
    RLA["🛠 rl_arm_correction"]
    JTC ==>|"🔑 빌림(쓰기 소유권)<br/>command_joints 이름으로 요청"| R1
    RLA ==>|"🔑 빌림(쓰기 소유권)<br/>command_interface_configuration()"| C1
    S1 -.->|"👀 읽기만 (여럿 가능)"| JTC
    S1 -.->|"👀 읽기만 (여럿 가능)"| RLA
    R1 -.->|"자기 reference 라 직접 읽음"| RLA
${CLS}
    class JTC,S1,C1 std;
    class RLA,R1 rl;
${F}

| 칸 종류 | 소유권 | 이 로봇 예 |
| --- | --- | --- |
| state | 여러 컨트롤러가 **읽기** | \`joint2/position\` = 현재 각도 |
| command | **한 컨트롤러만** 쓰기. 두 번째가 잡으려 하면 활성화 실패 | \`joint2/position\` → 지금은 \`rl_arm_correction\`이 소유 |
| reference | 체인의 **앞 컨트롤러가** 쓰기, 주인(뒤 컨트롤러)이 읽기 | \`rl_arm_correction/joint2/position\` → \`arm_controller\`가 쓰는 칸 |

#### 연결되는 순간 — arm_controller를 켤 때

${F}mermaid
sequenceDiagram
    autonumber
    participant SP as 📦 controller_manager::<br/>spawner
    participant CM as 📦 controller_manager::<br/>ControllerManager
    participant RM as 📦 hardware_interface::<br/>ResourceManager
    participant JTC as 📦 arm_controller<br/>joint_trajectory_controller::<br/>JointTrajectoryController
    participant RLA as 🛠️ rl_arm_correction<br/>ml::RlArmCorrection
    Note over RLA,RM: 이미 켜져 있다 — reference 칸이 목록에 올라 있음
    SP->>CM: arm_controller 를 켜라
    CM->>JTC: 어떤 칸이 필요해? (command_interface_configuration)
    JTC-->>CM: rl_arm_correction/joint1~5/position
    CM->>RM: 이 이름들 있어? 다른 컨트롤러가 이미 잡았어?
    RM-->>CM: 있음 — 체인 컨트롤러의 reference 칸이고 아직 주인 없음
    CM->>RLA: 너를 체인 모드로 바꾼다 (이제 토픽 대신 앞 컨트롤러 값을 받는다)
    CM->>RM: 소유권 JTC 로 기록
    CM-->>JTC: 칸을 빌려줌 (이후 JTC 가 set_value 로 직접 씀)
    Note over CM,RLA: 이름이 틀리거나 이미 잡혀 있으면 여기서 활성화 실패
${F}

- **이름 찾기는 글자 일치**다. \`command_joints\`에 적은 \`rl_arm_correction/joint1\` + \`position\`이 reference 칸 전체 이름과 같아서 찾아진다.
- reference 칸이 목록에 있으려면 \`rl_arm_correction\`이 **먼저** 켜져 있어야 한다. 그래서 켜는 순서가 \`rl_arm_correction → arm_controller\`다.
- 체인 모드가 되면 \`rl_arm_correction\`의 \`update_reference_from_subscribers()\`는 호출되지 않는다 (이 로봇 구현은 원래 \`return_type::OK\`만 돌려줘서 영향도 없다).

#### 매 주기 — 칸을 사이에 두고 만나는 모습

${F}mermaid
flowchart TB
    subgraph CYC["controller_manager 한 주기 (100Hz) — 호출 순서"]
        direction TB
        A["① 하드웨어 read()<br/>S 줄 → state 칸 갱신"]
        B["② arm_controller update()<br/>받아 둔 경로 보간 → reference 칸에 쓰기"]
        C["③ rl_arm_correction update_and_write_commands()<br/>reference · state 읽기 → 보정 → command 칸에 쓰기"]
        D["④ 하드웨어 write()<br/>command 칸 읽기 → C 줄 전송"]
        A --> B --> C --> D
    end
    B -. "reference 칸 (같은 메모리)" .-> C
    A -. "state 칸" .-> B
    A -. "state 칸" .-> C
    C -. "command 칸" .-> D
${CLS}
    class A,B,D std;
    class C rl;
${F}

- 점선이 **칸**, 실선이 **\`controller_manager\`가 부르는 순서**다. \`controller_manager\`가 하는 일은 실선(순서)뿐이고 점선(값)은 컨트롤러와 하드웨어가 직접 읽고 쓴다.
- **②가 ③보다 먼저**여야 같은 주기 안에서 값이 전달된다 (한 주기 지연 없음). 체인에서는 \`controller_manager\`가 값을 쓰는 쪽을 먼저 돌리도록 순서를 정한다.
- 체인이 아니라 JTC가 하드웨어 command 칸에 바로 쓰면 ③이 없는 구조가 된다.

#### 이 로봇의 코드에서 보면

| 단계 | 코드 (\`ml/src/rl_arm_correction.cpp\`) |
| --- | --- |
| reference 칸을 만들어 내놓음 | \`on_export_reference_interfaces_list()\` — \`info.name = joint + "/position"\`, \`InterfaceDescription(get_node()->get_name(), info)\`. 컨트롤러 이름이 앞에 붙어 \`rl_arm_correction/joint1/position\`이 된다 |
| 빌릴 command · state 칸 선언 | \`command_interface_configuration()\` · \`state_interface_configuration()\` |
| 읽기 | \`refs_[i]->get_optional<double>()\` · \`state_interfaces_[2*i].get_optional<double>()\` |
| 쓰기 | \`command_interfaces_[i].set_value(ref[i] + corr_[i] + total)\` |
| JTC 쪽 설정 | \`controllers.yaml\` — \`arm_controller.command_joints: [rl_arm_correction/joint1, …]\` |

> 💡 **직접 확인하려면:** \`ros2 control list_hardware_interfaces\`로 칸 목록과 사용 중 여부를, \`ros2 control list_controllers\`로 켜진 컨트롤러를 본다. 이 로봇에서 체인이 정상이면 \`rl_arm_correction/joint*/position\` 칸이 목록에 나타나야 한다.
>
> ⚠️ 이 절의 소유권 확인·체인 모드 전환·호출 순서는 ros2_control의 일반 설계를 설명한 것이다. 이 로봇 코드로 직접 확인한 부분은 위 표의 코드 항목이고, 버전(Lyrical)에 따라 세부 동작이 다를 수 있다.

- **켜는 순서:** 뒤(rl_arm_correction)를 먼저 activate해야 앞(JTC)이 그 reference를 잡을 수 있다.
- **끄는 법:** 체인에 묶인 뒤쪽만 deactivate할 수 없다 → 파라미터 \`enabled: false\`로 Δ=0 통과.
- **토픽으로 끼우지 않는 이유:** 별도 노드로 끼우면 JTC 보간·피드백을 다시 짜야 하고, 토픽 지연 때문에 100Hz가 흔들린다.
- **실시간 추론:** \`update()\` 안에서 메모리 할당·블로킹 금지 — ONNX 세션·텐서는 \`on_configure\`에서 미리 만들고, 추론이 1ms를 넘으면 별도 스레드 + \`realtime_tools::RealtimeBuffer\`로 Δ만 넘긴다.
`,
  },

  connect: {
    label: '⑤ 연결 5단계',
    md: `
## 연결 5단계 — 내가 직접 해야 하는 것

| 단계 | 무엇을 | 어디에 |
| --- | --- | --- |
| 1 | 장치용 하드웨어 플러그인 고르기 (없으면 작성) | 패키지 설치 또는 C++ (③) |
| 2 | 플러그인·포트·관절 인터페이스 선언 | URDF(xacro)의 \`<ros2_control>\` 태그 |
| 3 | 띄울 컨트롤러와 파라미터 | \`controllers.yaml\` |
| 4 | 노드 띄우기 | launch |
| 5 | 연결 확인 | \`ros2 control\` CLI |

${F}mermaid
flowchart TB
    URDF["📄 URDF 속 ros2_control 태그<br/>플러그인 · 포트 · 관절별 인터페이스"]
    YAML["📄 내가 씀 — controllers.yaml<br/>컨트롤러 이름 · 타입 · 파라미터"]
    SP["📦 spawner<br/>load · configure · activate"]
    subgraph CMG["📦 controller_manager (ros2_control_node)"]
        CTRL["컨트롤러 플러그인들"]
        RM["Resource Manager<br/>변수 목록 · 쓰기 소유권"]
        HWC["하드웨어 플러그인 (장치마다 하나)"]
        CTRL -->|"🔗 command"| RM
        RM -->|"🔗 state"| CTRL
        RM -->|"🔗 write()"| HWC
        HWC -->|"🔗 read()"| RM
    end
    DEV{{"장치 (모터 · 센서)"}}
    URDF -->|"✉️ /robot_description<br/>(std_msgs/String)"| RM
    YAML -->|"⚙️ --params-file"| CTRL
    SP -->|"📞 load · configure ·<br/>switch_controller"| CTRL
    HWC -->|"🔌 쓰기"| DEV
    DEV -->|"🔌 읽기"| HWC
${CLS}
    class CTRL,RM,SP std;
    class HWC mine;
    class DEV hw;
    class URDF,YAML ext;
    style CMG fill:#f8fafc,stroke:#94a3b8
${F}

### 1 → 2. URDF의 ros2_control 태그

${F}xml
<ros2_control name="MySystem" type="system">
  <hardware>
    <plugin>패키지/플러그인클래스</plugin>       <!-- pluginlib에 등록한 이름 -->
    <param name="usb_port">/dev/ttyACM0</param>   <!-- on_init()에서 읽는 값 -->
    <param name="baud_rate">1000000</param>
  </hardware>
  <joint name="joint2">
    <command_interface name="position">
      <param name="min">-1.57</param>
      <param name="max">1.57</param>
    </command_interface>
    <state_interface name="position"/>
    <state_interface name="velocity"/>
    <state_interface name="effort"/>
  </joint>
  <sensor name="imu">
    <state_interface name="orientation.x"/>   <!-- … -->
  </sensor>
</ros2_control>
${F}

- \`joint name\`·\`sensor name\` + 인터페이스 이름 = 컨트롤러가 찾는 변수 이름 (\`joint2/position\`, \`imu/orientation.x\`).
- 플러그인은 여기 선언된 인터페이스를 내놓아야 한다 (선언했는데 플러그인이 안 내놓으면 로드 실패).

### 3. controllers.yaml

${F}yaml
controller_manager:
  ros__parameters:
    update_rate: 100                       # 루프 주기 (Hz)
    joint_state_broadcaster:
      type: joint_state_broadcaster/JointStateBroadcaster
    arm_controller:
      type: joint_trajectory_controller/JointTrajectoryController

arm_controller:                            # 컨트롤러별 파라미터
  ros__parameters:
    joints: [joint1, joint2, joint3, joint4]
    command_interfaces: [position]
    state_interfaces: [position, velocity]
${F}

- 컨트롤러 파라미터 전체는 **파라미터 탭의 사전**(ros2_control 그룹)에 있다.

### 4. launch

${F}python
Node(package='robot_state_publisher', executable='robot_state_publisher',
     parameters=[{'robot_description': urdf}]),        # /robot_description 발행
Node(package='controller_manager', executable='ros2_control_node',
     parameters=[controllers_yaml]),                   # URDF는 /robot_description 토픽으로 받음 (Jazzy)
Node(package='controller_manager', executable='spawner',
     arguments=['joint_state_broadcaster', 'arm_controller']),
${F}

### 5. 확인

${F}bash
ros2 control list_hardware_components      # 하드웨어 플러그인이 로드·active인가
ros2 control list_hardware_interfaces      # 변수 목록, [claimed] = 컨트롤러가 잡음
ros2 control list_controllers              # 컨트롤러 상태
ros2 control view_controller_chains        # 체인 그림
ros2 control switch_controllers --deactivate arm_controller   # 끄기
${F}

### 자주 나는 오류

| 증상 | 원인 |
| --- | --- |
| 컨트롤러 activate 실패 "interface not available" | URDF에 그 인터페이스를 안 적었거나, 다른 컨트롤러가 이미 command를 잡음 |
| 하드웨어 로드 실패 | \`<plugin>\` 이름 오타, pluginlib xml 미등록, 패키지 미빌드 |
| 체인 컨트롤러 activate 실패 | 뒤쪽(chainable)을 먼저 켜지 않음 |
| 루프 주기 경고 | read/write가 느림 — baud rate, 한 줄(일괄)로 읽고 쓰는지 확인 |
`,
  },

  robot: {
    label: '⑥ 이 로봇 적용',
    md: `
## 이 로봇(beebot)의 ros2_control

OpenCR **하나**에 바퀴 2 · 팔 5축 · 그리퍼 · IMU가 다 붙어 있어 **하드웨어 플러그인도, controller_manager도 하나**다.

### 하드웨어 플러그인 — \`control/BeebotSystemHardware\` (직접 작성)

| 항목 | 값 |
| --- | --- |
| 클래스 | \`hardware_interface::SystemInterface\` 상속 (\`control/src/beebot_system_hardware.cpp\`) |
| URDF param | port \`/dev/opencr\`(udev 고정 이름) · baud_rate 1000000 · mock · mock_effort · 관절별 offset |
| 바퀴 wheel_left/right_joint | command **velocity** · state position, velocity |
| 팔 joint1~5 | command **position** · state position, velocity, **effort** |
| 그리퍼 gripper_left_joint (right는 mimic) | command position · state position, velocity, effort |
| 센서 imu | orientation · angular_velocity · linear_acceleration |
| 통신 | USB 시리얼 ASCII 줄 — **C 줄**(명령) · **S 줄**(상태, 10ms) · E 줄(Hardware Error) · R 줄(모터 재부팅) |
| 덤으로 여는 것 | ✉️ \`/motor_status\` · 📞 \`/beebotsystem/reboot_motors\` · 진단 "OpenCR 연결" |

- \`mock:=true\`면 OpenCR 없이 명령을 그대로 상태로 돌려준다 (시뮬레이션·개발용).
- **effort**는 S 줄의 관절 전류[A]를 그대로 넣은 값이다. arm_safety_monitor(접촉 감지)와 rl_arm_correction(파지 판단)이 쓴다.

### 맨 끝에서 OpenCR로 가는 모양 — C 줄

${F}text
C, 바퀴L(rad/s), 바퀴R(rad/s), joint1, joint2, joint3, joint4, joint5, 그리퍼(m) [, 그리퍼 쥐는 힘 A]
     ▲ velocity 칸                ▲ position 칸 (관절 offset을 더해 서보 값으로)   ▲ 9번째는 생략 가능
${F}

\`write()\`가 command 칸 전부를 **한 줄**로 합쳐 보내고, \`read()\`가 S 줄을 받아 state 칸을 채운다.

### 컨트롤러 6개

| 이름 | 종류 | 쓰기(command) | 읽기(state) |
| --- | --- | --- | --- |
| joint_state_broadcaster | ROS 기본 | — | 모든 관절 → /joint_states |
| imu_sensor_broadcaster | ROS 기본 | — | imu/* → /imu |
| diff_drive_controller | ROS 기본 | wheel_*/velocity | wheel_*/position·velocity |
| gripper_controller | ROS 기본 (parallel_gripper_action_controller) | gripper_left_joint/position | gripper_left_joint position |
| **rl_arm_correction** 🛠️ | **직접 작성** (\`ml/RlArmCorrection\`, chainable) | joint1~5/position | joint1~5 position·velocity, gripper effort |
| arm_controller | ROS 기본 (JTC) | **rl_arm_correction/joint1~5/position** (체인) | joint1~5 position·velocity |

### 켜는 순서 (spawner)

${F}python
CONTROLLERS = ['joint_state_broadcaster', 'imu_sensor_broadcaster', 'diff_drive_controller',
               'gripper_controller',
               'rl_arm_correction', 'arm_controller']      # ros_system/launch/ros_system.launch.py
${F}

- **목록에 없으면 안 켜진다.** controllers.yaml에 적기만 해서는 올라오지 않는다.
- 하나가 실패하면 거기서 멈춘다 → 실패하기 쉬운 **팔 체인을 맨 뒤**에 둔다. 팔이 안 떠도 바퀴·그리퍼는 이미 떠 있다.
- 체인은 **뒤(rl_arm_correction)를 먼저** — 그래야 앞(arm_controller)이 그 reference 칸을 잡을 수 있다.
- 하드웨어 플러그인은 spawner 목록이 아니라 **URDF \`<ros2_control>\` 태그**를 보고 시작할 때 같이 올라온다.

### controllers.yaml — 이 로봇만의 부분

${F}yaml
diff_drive_controller:
  ros__parameters:
    enable_odom_tf: false          # odom→base_footprint TF는 EKF가 발행
    joints: ... (wheel_left_joint, wheel_right_joint)

arm_controller:
  ros__parameters:
    joints: [joint1, joint2, joint3, joint4, joint5]
    command_joints: [rl_arm_correction/joint1, ... , rl_arm_correction/joint5]   # 체인: 하드웨어 대신 앞자리(reference)에 씀

rl_arm_correction:
  ros__parameters:
    enabled: true                   # false면 Δ=0으로 그냥 통과
${F}

### 확인

${F}bash
ros2 control list_hardware_interfaces   # joint2/effort 가 보이면 effort 가 나오는 것
ros2 control list_controllers            # 6개 전부 active
ros2 control view_controller_chains      # arm_controller → rl_arm_correction 체인 확인
${F}

> 이 탭은 ros2_control **개념** 설명이다. 이 로봇 전체 배선·시퀀스·직접 작성/기본 구분은 **실전노드설계** 탭의 ros2_control 절에 더 자세히 있다.
`,
  },
  big: {
    label: '⑦ 전체 한 장 (로딩→데이터)',
    md: `
## 전체 그림 — 시작부터 한 주기 돌기까지

> 이 절은 ros2_control의 **일반 설계(Jazzy 기준)** 를 한 장에 그린 것이다. 이름은 이 로봇(beebot) 것을 예로 썼다. 버전·세부 API는 설치한 버전 문서로 확인한다.

**표시 규칙 (프로젝트 공통)** — 📦 **제공**(그대로 가져다 씀) · 🛠️ **직접 작성**(우리 코드) · ✉️ 토픽 · 🎬 액션 · 📞 서비스 · 🔌 시리얼·USB · 🔗 같은 프로세스 안(칸) · 📄 내가 쓰는 설정 파일

**이름 표기:** 도식의 노드·플러그인은 **\`패키지명::클래스(노드)명\`** 순서다 (예: \`ml::RlArmCorrection\`). 괄호 안은 yaml에 적는 인스턴스 이름. yaml·URDF 문자열은 슬래시 \`ml/RlArmCorrection\`.

| 구분 | 무엇 |
| --- | --- |
| 📦 제공 | ros2_control_node · controller_manager · Resource Manager · pluginlib · spawner · robot_state_publisher · joint_state_broadcaster · imu_sensor_broadcaster · diff_drive_controller · gripper_controller · arm_controller(JTC) · move_group · Nav2 |
| 🛠️ 직접 작성 (2개) | **BeebotSystemHardware** (하드웨어 플러그인, \`control\` 패키지) · **rl_arm_correction** (체인 컨트롤러, \`ml\` 패키지) |
| 📄 내가 쓰는 설정 | URDF \`<ros2_control>\` 태그 · controllers.yaml · launch의 \`CONTROLLERS\` 목록 |

컨트롤러 6개 중 **직접 만든 것은 \`rl_arm_correction\` 하나**이고, 나머지 5개와 틀 전체는 제공된다. 하드웨어 플러그인은 장치(OpenCR)를 아는 유일한 우리 코드다.

### ⓪ 먼저 — 누가 어디에 있나 (구성도)

${F}mermaid
flowchart TB
    URDF["📄 내가 씀 — URDF (xacro)<br/>ros2_control 태그<br/>플러그인 이름 · param · 관절별 인터페이스"]
    YAML["📄 controllers.yaml<br/>update_rate · 컨트롤러 이름 : type · 파라미터"]
    RSP["📦 robot_state_publisher::robot_state_publisher"]
    SP["📦 controller_manager::spawner<br/>(컨트롤러마다 1회 실행)"]
    PL["📦 pluginlib::ClassLoader<br/>등록된 xml 이름표 → .so 로드"]
    subgraph PROC["📦 controller_manager::ros2_control_node — 프로세스 하나"]
        direction TB
        subgraph CMG["📦 controller_manager::ControllerManager — 노드 + 제어 루프"]
            direction TB
            SRV["📞 서비스<br/>load · configure · switch · list ..."]
            subgraph RM["📦 hardware_interface::ResourceManager — 칸 보관소"]
                direction TB
                HW["🛠️ control::BeebotSystemHardware<br/>(하드웨어 플러그인)<br/>on_init · read() · write()"]
                ST[("state 칸<br/>joint1~5/position · velocity · effort<br/>wheel_*/position · velocity<br/>imu/*")]
                CMD[("command 칸<br/>wheel_*/velocity<br/>joint1~5/position<br/>gripper_left_joint/position")]
                REF[("reference 칸<br/>rl_arm_correction/joint1~5/position<br/>(체인 컨트롤러가 내놓음)")]
            end
            subgraph CTRLS["컨트롤러 플러그인 — 📦 제공 3종 + 🛠️ 직접 1종 (활성화 순서 = 호출 순서)"]
                direction TB
                JTC["📦 arm_controller<br/>joint_trajectory_controller::<br/>JointTrajectoryController"]
                RLA["🛠️ rl_arm_correction<br/>ml::RlArmCorrection (chainable)"]
                DD["📦 diff_drive_controller<br/>diff_drive_controller::<br/>DiffDriveController"]
                BC["📦 joint_state_broadcaster::<br/>JointStateBroadcaster<br/>📦 imu_sensor_broadcaster::<br/>IMUSensorBroadcaster"]
            end
            LOOP["⏱ 제어 루프 스레드 (update_rate 100Hz)<br/>read → update → write"]
        end
    end
    DEV{{"🔌 OpenCR → 다이나믹셀 · IMU<br/>USB 시리얼 (C 줄 · S 줄)"}}
    UP["📦 위쪽 노드<br/>moveit_ros_move_group::move_group<br/>nav2_*"]
    URDF -->|"① xacro → 문자열"| RSP
    RSP -->|"② ✉️ /robot_description<br/>(transient_local)"| RM
    YAML -->|"③ --params-file"| CMG
    RM -->|"④ 이름으로 찾기"| PL
    PL -->|"⑤ .so 로드 · 객체 생성"| HW
    SP -->|"⑥ 📞 load → configure → switch"| SRV
    SRV -->|"⑦ type 문자열로 로드"| PL
    PL -.->|"객체 생성"| CTRLS
    CTRLS -->|"⑧ 칸 요청 · 소유권 확인"| RM
    LOOP ==>|"⑨ read()"| HW
    HW ==>|"⑩ 채움"| ST
    ST -.->|"⑪ 읽기"| CTRLS
    CTRLS -.->|"⑫ 쓰기"| CMD
    CMD -.->|"⑬ 가져감"| HW
    LOOP ==>|"⑭ write()"| HW
    HW <==>|"🔌"| DEV
    UP ==>|"✉️ 🎬 궤적 · cmd_vel"| CTRLS
    BC -.->|"✉️ /joint_states · /imu"| UP
${CLS}
    class URDF,YAML ext;
    class RSP,SP,UP,PL std;
    class HW,RLA mine;
    class ST,CMD,REF rl;
    class DEV hw;
    class JTC,DD,BC,SRV,LOOP std;
    style PROC fill:#f8fafc,stroke:#94a3b8
    style CMG fill:#ffffff,stroke:#94a3b8
    style RM fill:#fffbeb,stroke:#f59e0b
    style CTRLS fill:#f0fdf4,stroke:#16a34a
${F}

번호는 아래 세 단계의 순서와 같다: **로딩(①~⑤) → 컨트롤러 켜기(⑥~⑧) → 매 주기 데이터(⑨~⑭)**.

### 1단계 — 로딩: ros2_control_node가 뜨고 하드웨어가 붙기까지

${F}mermaid
sequenceDiagram
    autonumber
    participant L as launch
    participant RSP as 📦 robot_state_publisher::<br/>robot_state_publisher
    participant N as 📦 controller_manager::<br/>ros2_control_node
    participant CM as 📦 controller_manager::<br/>ControllerManager
    participant RM as 📦 hardware_interface::<br/>ResourceManager
    participant PL as 📦 pluginlib::ClassLoader
    participant HW as 🛠️ control::BeebotSystemHardware
    L->>RSP: robot_description 파라미터 (URDF 문자열)
    L->>N: 실행 (--params-file controllers.yaml)
    N->>CM: 노드 생성 · update_rate 등 파라미터 읽기
    RSP-->>CM: ✉️ /robot_description 토픽 (Jazzy: 토픽으로 받음)
    CM->>RM: URDF 넘김 → ros2_control 태그를 HardwareInfo 로 파싱
    loop 태그(장치) 하나마다
        RM->>PL: plugin 문자열로 클래스 찾기 (이름표 xml)
        PL-->>RM: .so 열어 객체 생성
        RM->>HW: on_init(HardwareInfo) — URDF param · 관절 목록 전달
        HW-->>RM: SUCCESS (실패면 로드 중단)
        RM->>HW: export_state_interfaces() · export_command_interfaces()
        HW-->>RM: 칸 이름 + 변수 주소 목록
        RM->>HW: on_configure() → on_activate() (포트 열기 · 토크 켜기)
    end
    Note over RM: 이제 state · command 칸이 목록에 올라 있다<br/>(ros2 control list_hardware_interfaces 로 보임)
    CM->>CM: 제어 루프 스레드 시작 (update_rate)
${F}

- **하드웨어는 컨트롤러보다 먼저** 올라온다. 컨트롤러가 요청할 칸이 있어야 하기 때문이다.
- \`mock:=true\`면 이 단계에서 실제 장치 대신 명령을 상태로 돌려주는 구현이 붙는다.
- 이름표(xml)가 등록되지 않았거나 \`<plugin>\` 글자가 다르면 여기서 로드 실패다.

### 2단계 — 컨트롤러 켜기: spawner 한 번 = 세 번의 서비스 호출

${F}mermaid
sequenceDiagram
    autonumber
    participant SP as 📦 controller_manager::<br/>spawner
    participant CM as 📦 controller_manager::<br/>ControllerManager
    participant PL as 📦 pluginlib::ClassLoader
    participant C as 컨트롤러 객체 (📦 또는 🛠️)
    participant RM as 📦 hardware_interface::<br/>ResourceManager
    SP->>CM: 📞 load_controller("arm_controller")
    CM->>CM: yaml 에서 arm_controller.type 찾기
    CM->>PL: type 문자열로 클래스 찾기
    PL-->>CM: .so 열어 객체 생성
    CM->>C: init() — 파라미터 선언
    SP->>CM: 📞 configure_controller
    CM->>C: on_configure() — 파라미터 읽기 · 버퍼·구독 준비
    SP->>CM: 📞 switch_controller(activate)
    CM->>C: command_interface_configuration() · state_interface_configuration()
    C-->>CM: 필요한 칸 이름 목록
    CM->>RM: 있나? 다른 컨트롤러가 이미 쓰기 잡았나?
    RM-->>CM: 확인 (없거나 중복이면 활성화 실패)
    CM->>RM: 소유권 기록 → 칸을 컨트롤러에 빌려줌
    CM->>C: on_activate() → 이후 매 주기 update() 호출 대상
${F}

- spawner는 이 세 호출을 대신 해 주는 **작은 프로그램**이다. 켜져 있는 동안 계속 도는 노드가 아니다.
- 체인(\`arm_controller → rl_arm_correction\`)이면 **뒤(chainable)를 먼저** 켜야 앞이 그 reference 칸을 빌릴 수 있다. 이름은 **글자 일치**로 찾는다.
- 활성화되면 controller_manager가 **호출 순서**를 정한다 (체인은 쓰는 쪽이 먼저).

### 3단계 — 매 주기: 칸으로 데이터가 흐르는 모양

${F}mermaid
sequenceDiagram
    autonumber
    participant LP as 제어 루프 (100Hz)
    participant HW as 🛠️ control::BeebotSystemHardware
    participant DEV as OpenCR · 모터
    participant ST as state 칸
    participant JTC as arm_controller
    participant REF as reference 칸
    participant RLA as 🛠️ rl_arm_correction<br/>ml::RlArmCorrection
    participant CMD as command 칸
    participant TP as 위쪽 노드 (토픽)
    Note over LP: 주기 시작 (10ms)
    LP->>HW: read(time, period)
    DEV-->>HW: S 줄 (위치 · 속도 · 전류 · IMU)
    HW->>ST: 단위 변환(틱→rad · A) 후 변수에 저장
    LP->>JTC: update()
    ST-->>JTC: position · velocity 읽기
    JTC->>REF: 이번 목표 쓰기 (궤적 보간 결과)
    LP->>RLA: update_and_write_commands()
    REF-->>RLA: 목표 읽기
    ST-->>RLA: 현재 상태 · effort 읽기
    RLA->>CMD: 목표 + Δ 쓰기
    LP->>HW: write(time, period)
    CMD-->>HW: 명령 변수 읽기
    HW->>DEV: C 줄 한 줄로 합쳐 전송
    Note over LP: 남은 시간은 쉰다 → 다음 주기
    TP-->>JTC: 🎬 궤적 (다른 스레드 → RealtimeBuffer 로 넘김)
    ST-->>TP: broadcaster 가 /joint_states 발행 (실시간 스레드 밖)
${F}

### 스레드와 데이터 경로 — 어디가 "실시간"인가

| 구분 | 스레드 | 하는 일 | 데이터 방식 |
| --- | --- | --- | --- |
| **제어 루프** | 실시간 스레드 | read → update → write | **칸(같은 메모리 double)** — 복사·할당·잠금 없음 |
| **노드 기능** | 일반 executor | 서비스(load/configure/switch) · 파라미터 · 토픽 구독/발행 | 일반 ROS 통신 |
| 경계: 토픽 → 컨트롤러 | executor → 루프 | JTC 궤적, \`cmd_vel\`, \`/cmd/...\` | 받은 값을 **\`RealtimeBuffer\`** 에 넣고 \`update()\`가 꺼내 씀 |
| 경계: 컨트롤러 → 토픽 | 루프 → executor | \`/joint_states\`, \`/imu\`, odom | **realtime publisher**가 값을 넘기면 다른 스레드가 발행 |

그래서 \`read()\` · \`write()\` · \`update()\` 안에서는 **메모리 할당·긴 대기·로그 출력을 피한다.**

### 한 줄로 외우기

| 단계 | 한 줄 |
| --- | --- |
| 로딩 | URDF가 **어떤 플러그인·어떤 칸**을 정하고, pluginlib가 **이름 글자**로 \`.so\`를 찾아 붙인다 |
| 켜기 | spawner가 **load → configure → switch**로 컨트롤러를 올리고, 칸의 **소유권**을 확인해 빌려준다 |
| 주기 | **read**(장치→state 칸) → **update**(state·reference 읽고 command·reference 쓰기) → **write**(command 칸→장치) |

> 틀리기 쉬운 곳: 칸 이름 오타(활성화 실패) · \`<plugin>\` 오타·미등록(하드웨어 로드 실패) · 체인 순서(뒤를 먼저) · spawner 목록에 이름 누락(안 켜짐) · \`update_rate\`보다 \`read/write\`가 느림(주기 경고).
`,
  },

  ex: {
    label: '⑧ 예시로 따라가기',
    md: `
## 같은 구조를 3가지 동작으로 따라가 보자

세 동작 모두 **똑같은 길**을 간다: *위쪽 토픽 → 컨트롤러 → command 칸 → write() → C 줄 → 모터*, 돌아올 때는 *S 줄 → read() → state 칸 → broadcaster → 토픽*. 달라지는 것은 **어느 컨트롤러가 받고, 어느 칸을 쓰느냐**뿐이다.

**표시:** 📦 제공 · 🛠️ 직접 작성 (\`BeebotSystemHardware\` · \`rl_arm_correction\` 두 개뿐). 예시 ①은 두 가지가 모두 나오고, ②·③은 제공 컨트롤러 + 직접 작성 하드웨어 플러그인이다.

> 숫자는 모두 **예시 값**이다 (rad, m, rad/s). 칸 이름·컨트롤러 구성은 이 로봇 기준.

${F}mermaid
flowchart LR
    subgraph IN["위쪽 (토픽 · 액션)"]
        A1["🎬 팔 궤적<br/>📦 moveit_ros_move_group::move_group"]
        A2["🎬 그리퍼 열기·닫기"]
        A3["✉️ /cmd_vel<br/>📦 nav2_* · 사람"]
    end
    subgraph CC["컨트롤러 (update)"]
        B1["📦 joint_trajectory_controller::<br/>JointTrajectoryController (arm_controller)<br/>→ 🛠️ ml::RlArmCorrection"]
        B2["📦 parallel_gripper_controller::<br/>GripperActionController<br/>(gripper_controller)"]
        B3["📦 diff_drive_controller::<br/>DiffDriveController"]
    end
    subgraph CM2["command 칸"]
        C1["joint1~5/position"]
        C2["gripper_left_joint/position"]
        C3["wheel_left_joint/velocity<br/>wheel_right_joint/velocity"]
    end
    H["🛠️ control::BeebotSystemHardware<br/>write() → C 줄 한 줄"]
    D{{"🔌 OpenCR"}}
    A1 ==> B1 ==> C1 --> H
    A2 ==> B2 ==> C2 --> H
    A3 ==> B3 ==> C3 --> H
    H ==> D
${CLS}
    class A1,A2,A3,B2,B3 std;
    class B1,H mine;
    class C1,C2,C3 rl;
    class D hw;
${F}

---

### 예시 ① 관절 이동 — "joint2 를 0.59 → 0.65 rad 로"

${F}mermaid
sequenceDiagram
    autonumber
    participant MG as 📦 moveit_ros_move_group::<br/>move_group
    participant JTC as 📦 arm_controller<br/>joint_trajectory_controller::<br/>JointTrajectoryController
    participant REF as reference 칸
    participant RLA as 🛠️ rl_arm_correction<br/>ml::RlArmCorrection
    participant CMD as command 칸
    participant ST as state 칸
    participant HW as 🛠️ control::BeebotSystemHardware
    participant DEV as OpenCR · 다이나믹셀
    MG->>JTC: 🎬 FollowJointTrajectory — 점 여러 개 (시간 + 관절각)
    Note over JTC: 받은 궤적은 버퍼에 저장 (다른 스레드 → 루프)
    loop 10ms 마다
        DEV-->>HW: S 줄 (joint2 현재각 0.59 · 전류)
        HW->>ST: read() → joint2/position = 0.59, effort = 0.31
        JTC->>ST: 현재 위치 읽기
        JTC->>REF: update() — 지금 시각의 보간값 0.62 를 쓴다
        RLA->>REF: 0.62 읽기
        RLA->>ST: 현재각 · effort 읽기
        RLA->>CMD: 0.62 + Δ(+0.03) = 0.65 를 command 에 쓴다
        CMD-->>HW: write() — joint2/position = 0.65 읽기
        HW->>DEV: C 줄의 joint2 자리에 0.65 (+ offset → 서보 값)
    end
    HW-->>MG: (broadcaster 가 /joint_states 로 현재각 발행 → 도착 판단)
${F}

| 단계 | 값이 있는 곳 | 이 예시의 값 |
| --- | --- | --- |
| 위에서 받는 것 | 궤적 점들 | t=0.0s 0.59 → t=0.5s 0.65 |
| JTC가 쓰는 칸 (reference) | \`rl_arm_correction/joint2/position\` | 0.62 (지금 시각 보간) |
| 보정 후 command 칸 | \`joint2/position\` | 0.65 (= 0.62 + Δ 0.03) |
| 장치로 | C 줄 4번째 자리 (joint2) | \`…, 0.65, …\` |
| 돌아오는 값 | state \`joint2/position\` · \`joint2/effort\` | 0.59 → 점점 0.65 로 · 전류 |

- **JTC가 command 칸이 아니라 reference 칸에 쓰는 이유:** \`command_joints\`를 \`rl_arm_correction/jointN\`으로 설정했기 때문이다 (체인). 체인이 없는 로봇이면 JTC가 \`joint2/position\` command 칸에 바로 쓴다.
- 각도가 안 맞고 천천히 따라가는 것은 **다이나믹셀이 목표를 받아 스스로 움직이기** 때문이다. 우리 쪽은 10ms마다 "다음 목표" 값만 계속 갱신한다.

---

### 예시 ② 그리퍼 열고 닫기 — "gripper_left_joint 를 닫아라"

${F}mermaid
sequenceDiagram
    autonumber
    participant U as 📦 위쪽 노드 (액션 클라이언트)
    participant GC as 📦 gripper_controller<br/>parallel_gripper_controller::<br/>GripperActionController
    participant CMD as command 칸
    participant ST as state 칸
    participant HW as 🛠️ control::BeebotSystemHardware
    participant DEV as OpenCR · 그리퍼 모터
    U->>GC: 🎬 그리퍼 액션 goal — 목표 위치 (예: 닫힘 0.00 m)
    loop 10ms 마다 (도착하거나 막힐 때까지)
        DEV-->>HW: S 줄 (그리퍼 위치 · 전류)
        HW->>ST: gripper_left_joint/position = 0.018 m · effort = 0.42 A
        GC->>ST: 현재 위치 읽기 → 아직 목표 아님
        GC->>CMD: gripper_left_joint/position = 0.00 (목표)
        CMD-->>HW: write() 에서 읽음
        HW->>DEV: C 줄 그리퍼 자리에 0.00 (m)
    end
    GC-->>U: 결과 — 도착 · 또는 물체에 막혀 정지(effort ↑)
${F}

| 항목 | 내용 |
| --- | --- |
| 쓰는 칸 | \`gripper_left_joint/position\` **하나** — 오른쪽은 URDF **mimic**이라 따라간다. 오른쪽 칸은 state만 있다 |
| 단위 | **m** (관절 각도 rad 가 아님). C 줄 맨 끝(8번째) 자리 |
| 물체를 쥐면 | 위치가 목표(0.00)에 못 가고 멈추고 **effort(전류)가 올라간다** → 이 값으로 "쥐었나?" 를 판단 (rl_arm_correction · arm_safety_monitor 가 읽음) |
| 쥐는 힘 | C 줄 **9번째(생략 가능)** 자리 — 있으면 그리퍼 전류 한계를 같이 보냄 |

---

### 예시 ③ 바퀴 속도 — "앞으로 0.14 m/s, 왼쪽으로 돌며 0.35 rad/s"

${F}mermaid
sequenceDiagram
    autonumber
    participant NAV as 📦 nav2_* · 사람
    participant DD as 📦 diff_drive_controller<br/>diff_drive_controller::<br/>DiffDriveController
    participant CMD as command 칸
    participant ST as state 칸
    participant HW as 🛠️ control::BeebotSystemHardware
    participant DEV as OpenCR · 바퀴 모터
    NAV->>DD: ✉️ /cmd_vel (선속도 v=0.14, 각속도 w=0.35)
    Note over DD: 토픽은 버퍼에 저장 → update() 에서 꺼냄
    loop 10ms 마다
        DEV-->>HW: S 줄 (바퀴 각도 · 속도)
        HW->>ST: wheel_left/right position · velocity
        DD->>ST: 바퀴 현재 상태 읽기
        DD->>CMD: 좌 = (v − w·L/2) / r · 우 = (v + w·L/2) / r 계산해서 쓰기
        CMD-->>HW: write() 에서 읽음
        HW->>DEV: C 줄 맨 앞 두 자리 (좌 rad/s, 우 rad/s)
        DD->>DD: 바퀴 상태로 odom 적분 → /odom 발행 (odom TF 는 끔 — EKF 몫)
    end
${F}

| 항목 | 값 (controllers.yaml: wheel_radius 0.033 m · wheel_separation 0.287 m) |
| --- | --- |
| 입력 | v = 0.14 m/s · w = 0.35 rad/s |
| 왼쪽 바퀴 | (0.14 − 0.35 × 0.1435) / 0.033 ≈ **2.72 rad/s** |
| 오른쪽 바퀴 | (0.14 + 0.35 × 0.1435) / 0.033 ≈ **5.76 rad/s** (왼쪽으로 돌려면 오른쪽이 더 빠르다) |
| 쓰는 칸 | \`wheel_left_joint/velocity\` · \`wheel_right_joint/velocity\` (**velocity** command) |
| 돌아오는 값 | state \`wheel_*/position\` · \`velocity\` → \`/odom\` · \`/joint_states\` |
| 안전 | \`/cmd_vel\`이 한동안 안 오면 diff_drive가 멈추는 타임아웃이 있다 (파라미터 확인) |

> r · L 은 \`controllers.yaml\`의 diff_drive_controller 값이다. 입력 v · w 와 결과는 예시.

---

### 세 동작을 C 줄 한 줄에 겹쳐 보면

세 컨트롤러가 **같은 주기에 각자 칸에 쓰고**, \`write()\`는 그 칸들을 **한 줄로 합쳐서 한 번에** 보낸다.

${F}text
C,  바퀴L,  바퀴R,  joint1, joint2, joint3, joint4, joint5,  그리퍼
C,  2.72,   5.76,   0.00,   0.65,   -0.31,  1.10,   0.00,    0.00
    ▲ ③ diff_drive      ▲ ① arm_controller → rl_arm_correction   ▲ ② gripper_controller
${F}

| 컨트롤러 | 쓰는 칸 | C 줄 자리 |
| --- | --- | --- |
| diff_drive_controller | wheel_left/right_joint/velocity | 1~2번째 |
| rl_arm_correction (← arm_controller) | joint1~5/position | 3~7번째 |
| gripper_controller | gripper_left_joint/position | 8번째 |

돌아오는 S 줄도 같은 모양이다: \`read()\`가 한 줄을 받아 **바퀴 · 관절 · 그리퍼 · IMU state 칸을 한꺼번에** 채우고, broadcaster 가 이를 \`/joint_states\` · \`/imu\` 로 내보낸다.

> 위 시퀀스 그림은 일반 구조를 이 로봇 이름으로 그린 예시다. 액션 이름·메시지 종류·타임아웃 같은 세부는 설치한 버전과 이 로봇의 yaml로 확인한다.
`,
  },

  cm: {
    label: '⑨ controller_manager 집중',
    md: `
## controller_manager 안을 열어 본다

> 일반 설계(Jazzy 기준)다. 이 로봇 이름(🛠️ \`BeebotSystemHardware\` · \`rl_arm_correction\`)을 예로 썼고, **도식의 노드·선을 누르면 위에 설명 카드가 뜬다.**

\`controller_manager\`는 **세 가지 일**을 한다: ① **무엇이 있는지 관리** (하드웨어·컨트롤러·칸) ② **켜고 끄는 서비스** 제공 ③ **100Hz 루프**를 돌려 read → update → write를 부름. 장치도 계산도 모른다 — **틀**이다.

### ⓪ 안쪽 구성도

${F}mermaid
flowchart TB
    EXT["📦 spawner · ros2 control CLI<br/>(서비스를 부르는 쪽)"]
    subgraph PROC["📦 controller_manager::ros2_control_node (프로세스 하나)"]
        direction TB
        subgraph CMG["📦 controller_manager::ControllerManager"]
            direction TB
            SRV["📞 서비스 · 파라미터<br/>load · configure · switch · unload · list_*"]
            LDR["컨트롤러 로더<br/>pluginlib ClassLoader"]
            CL["컨트롤러 목록<br/>unconfigured · inactive · active"]
            ORD["호출 순서표<br/>(체인 의존으로 정렬)"]
            subgraph RM["📦 hardware_interface::ResourceManager"]
                direction TB
                HWC["하드웨어 컴포넌트<br/>🛠️ control::BeebotSystemHardware"]
                STG[("칸 저장소<br/>state · command · reference<br/>+ 누가 빌렸나(claim)")]
            end
        end
        LOOP["⏱ 제어 루프 스레드<br/>update_rate 100Hz"]
    end
    CTRL["📦 컨트롤러 객체들<br/>🛠️ ml::RlArmCorrection · JTC · diff_drive ..."]
    DEV{{"🔌 장치"}}
    EXT -->|"📞"| SRV
    SRV -->|"type 문자열"| LDR
    LDR -->|"객체 생성"| CL
    CL -->|"활성화 때 정렬"| ORD
    SRV -->|"칸 요청 확인"| STG
    LOOP ==>|"read()"| HWC
    LOOP ==>|"update()"| ORD
    LOOP ==>|"write()"| HWC
    ORD -->|"순서대로 update"| CTRL
    CTRL <-->|"칸 읽기·쓰기"| STG
    HWC <-->|"채움 · 가져감"| STG
    HWC <==>|"🔌"| DEV
    %% tip EXT: 서비스를 부르는 쪽 | spawner가 load → configure → switch 를 차례로 부르고, ros2 control CLI(list_controllers · switch_controllers …)도 같은 서비스를 쓴다. controller_manager는 이들이 일을 시킬 때만 컨트롤러 상태를 바꾼다.
    %% tip SRV: 서비스·파라미터 | ~/load_controller · ~/configure_controller · ~/switch_controller · ~/unload_controller · ~/list_controllers · ~/list_hardware_interfaces · ~/list_hardware_components · ~/set_hardware_component_state 등. 파라미터는 update_rate와 컨트롤러별 "이름.type".
    %% tip LDR: 컨트롤러 로더 | controllers.yaml의 "이름.type: 패키지/클래스" 글자를 pluginlib ClassLoader에 넘겨 .so를 열고 객체를 만든다. 이름표 xml이 등록돼 있지 않으면 여기서 실패한다.
    %% tip CL: 컨트롤러 목록 | 컨트롤러마다 상태가 있다: unconfigured → inactive → active. 로드만 하면 unconfigured. configure → inactive(파라미터 읽고 준비 끝), switch(activate) → active(매 주기 update 대상).
    %% tip ORD: 호출 순서표 | 활성화할 때 만든다. 체인이면 값을 쓰는 앞 컨트롤러가 먼저, 그 reference를 읽는 뒤 컨트롤러가 나중에 돌도록 정렬한다. 이 로봇: arm_controller(JTC) → rl_arm_correction.
    %% tip HWC: 하드웨어 컴포넌트 | URDF의 ros2_control 블록 하나 = 컴포넌트 객체 하나. on_init → on_configure → on_activate 순으로 올라오고, 매 주기 read()/write()가 불린다. 이 로봇은 control::BeebotSystemHardware 하나.
    %% tip STG: 칸 저장소 | "관절/인터페이스" 이름이 붙은 double 변수들. state(하드웨어가 채움, 여럿이 읽음) · command(컨트롤러 하나만 씀) · reference(체인의 앞 컨트롤러가 씀). 누가 빌렸는지(claim)를 기록해 둘이 같은 command를 잡지 못하게 한다.
    %% tip LOOP: 제어 루프 | 별도 스레드가 update_rate(예: 100Hz)마다 read → update → write를 부른다. 실시간 우선순위를 시도하고, 이 안에서는 메모리 할당·긴 대기를 피해야 한다.
    %% tip CTRL: 컨트롤러 객체 | ControllerInterface를 상속한 플러그인. update() 안에서 state를 읽고 command(또는 reference)에 쓴다. 장치를 모른다.
    %% tip DEV: 장치 | 하드웨어 컴포넌트만 안다. 이 로봇은 USB 시리얼로 OpenCR에 C/T/R/B 줄을 보내고 S/E 줄을 받는다.
    %% tip LOOP>HWC: read() | 주기 시작. 하드웨어가 장치에서 읽어 state 칸을 채운다.
    %% tip LOOP>ORD: update() | 중간. 순서표대로 활성 컨트롤러의 update를 부른다.
    %% tip SRV>STG: 칸 요청 확인 | 컨트롤러를 activate할 때 command/state_interface_configuration()이 요구한 이름이 있는지, 다른 컨트롤러가 이미 command를 잡았는지 확인한다. 없거나 중복이면 활성화 실패.
${CLS}
    class EXT,PROC,CMG,SRV,LDR,CL,ORD,LOOP,CTRL std;
    class HWC mine;
    class STG rl;
    class DEV hw;
    style PROC fill:#f8fafc,stroke:#94a3b8
    style CMG fill:#ffffff,stroke:#94a3b8
    style RM fill:#fffbeb,stroke:#f59e0b
${F}

### ① 컨트롤러 한 개의 상태 — 서비스 하나가 상태 하나를 바꾼다

${F}mermaid
stateDiagram-v2
    [*] --> unconfigured: load_controller — 클래스 찾아 객체 생성 · 파라미터 선언
    unconfigured --> inactive: configure_controller — on_configure(): 파라미터 읽기 · 버퍼·구독 준비
    inactive --> active: switch_controller(activate) — 칸 소유권 확인 후 빌려줌 · on_activate()
    active --> inactive: switch_controller(deactivate) — 칸 반납
    inactive --> unconfigured: cleanup_controller — on_cleanup()
    unconfigured --> [*]: unload_controller — 객체 삭제
${F}

| 서비스 | 하는 일 | 실패하는 흔한 이유 |
| --- | --- | --- |
| \`load_controller\` | \`type\`으로 클래스 찾아 만들기 | type 글자 오타 · 이름표 xml 미등록 · 패키지 미빌드 |
| \`configure_controller\` | \`on_configure()\` 호출 | 파라미터 누락 · 관절이 URDF 한계 밖(\`rl_arm_correction\`의 예외) |
| \`switch_controller\` | activate/deactivate 한 번에 (strictness 옵션) | 칸 이름 없음 · 다른 컨트롤러가 command 소유 · 체인 순서(뒤를 먼저) |
| \`unload_controller\` | 객체 삭제 | 아직 active |
| \`list_controllers\` · \`list_hardware_interfaces\` · \`list_hardware_components\` | 상태 조회 | — |

> **spawner**는 이 세 서비스(\`load\` → \`configure\` → \`switch\`)를 **대신 불러 주는 짧은 프로그램**이다.

### ② 한 주기 안에서 controller_manager가 하는 일

${F}mermaid
flowchart LR
    T0["주기 시작<br/>시계가 period 만큼 지남"]
    R["read(time, period)<br/>하드웨어 → state 칸"]
    U1["update — 순서표 1번<br/>(체인의 앞)"]
    U2["update — 순서표 2번<br/>(체인의 뒤)"]
    U3["update — 나머지 컨트롤러<br/>(diff_drive · gripper · broadcaster)"]
    W["write(time, period)<br/>command 칸 → 하드웨어"]
    SLP["남은 시간 대기"]
    T0 --> R --> U1 --> U2 --> U3 --> W --> SLP --> T0
    %% tip R: read() | 모든 활성 하드웨어 컴포넌트의 read()를 부른다. 한 컴포넌트가 ERROR를 돌려주면 그 컴포넌트에 연결된 컨트롤러를 멈춘다(일반 설계).
    %% tip U1: 체인의 앞 | 값을 쓰는 쪽(arm_controller JTC)이 먼저 돌아 reference 칸에 목표를 쓴다.
    %% tip U2: 체인의 뒤 | 같은 주기 안에서 reference를 읽는다 → 한 주기 지연이 없다. (이 로봇: ml::RlArmCorrection이 보정해 command에 씀)
    %% tip U3: 체인과 무관한 컨트롤러 | diff_drive(/cmd_vel→바퀴 속도), gripper, joint_state_broadcaster(/joint_states 발행), imu_sensor_broadcaster. 서로 독립이라 순서가 결과에 영향을 주지 않는다.
    %% tip W: write() | 활성 하드웨어 컴포넌트의 write()를 부른다. 이 로봇은 모든 command 칸을 C 줄 한 줄로 합쳐 보낸다.
    %% tip SLP: 대기 | 다음 주기까지 쉰다. read/write가 period보다 오래 걸리면 주기 경고가 난다.
${CLS}
    class T0,SLP ext;
    class R,U1,U2,U3,W std;
${F}

${F}text
// ros2_control_node 의 제어 스레드 (개념)
while (running) {
  cm->read(time, period);     // 모든 하드웨어 → state
  cm->update(time, period);   // 순서표대로 컨트롤러.update()
  cm->write(time, period);    // command → 모든 하드웨어
  sleep_until(next_period);   // update_rate 로 정한 주기
}
${F}

### ③ 파라미터 — controllers.yaml에서 controller_manager가 읽는 것

| 키 | 뜻 |
| --- | --- |
| \`controller_manager.ros__parameters.update_rate\` | 루프 주기 [Hz] (이 로봇 100) |
| \`<컨트롤러이름>.type\` | 그 이름에 붙일 클래스 (\`패키지/클래스\`) |
| \`<컨트롤러이름>\` 블록 | 컨트롤러 **자기** 파라미터 — spawner가 \`--param-file\`로 컨트롤러에 넘김 (controller_manager 자신에게는 안 감) |

- ros2_control_node에 준 파일·리매핑은 **controller_manager 자신에게만** 적용된다. 컨트롤러 파라미터·리매핑은 **spawner가** 컨트롤러 노드에 넘긴다 (이 로봇의 \`ros_system.launch.py\`가 그렇게 한다).

### ④ 칸(claim)을 둘러싼 규칙 — 활성화 때 확인하는 것

| 규칙 | 결과 |
| --- | --- |
| command 칸은 **한 컨트롤러만** 빌린다 | 두 번째가 요청하면 activate 실패 |
| state 칸은 **여럿이 읽는다** | 제한 없음 |
| reference 칸은 chainable 컨트롤러가 **내놓고**, 앞 컨트롤러가 쓴다 | chainable이 **먼저** 켜져 있어야 앞이 빌릴 수 있음 |
| 이름은 **글자 일치** | URDF의 \`관절/인터페이스\` = 컨트롤러가 요청한 이름 |
| 체인 모드 전환 | 앞 컨트롤러가 reference를 잡으면 뒤 컨트롤러는 자기 구독 대신 reference를 쓴다 |

### ⑤ 확인 명령

${F}bash
ros2 control list_controllers                  # 이름 · 타입 · 상태(unconfigured/inactive/active)
ros2 control list_hardware_components          # 하드웨어 컴포넌트 상태
ros2 control list_hardware_interfaces          # 칸 목록, [claimed] = 누가 빌림
ros2 control view_controller_chains            # 체인 그림 (버전에 따라 없을 수 있음)
ros2 control switch_controllers --deactivate arm_controller
ros2 service list | grep controller_manager    # 서비스 목록
${F}

> 이 탭은 일반 설계 설명이다. 이 로봇에서 **실제 순서·타임아웃(spawner 120초 · 서비스 30초)**은 **실전 부팅·동작** 탭의 ② 로딩에 있다.
`,
  },

  cmboot: {
    label: '⑩ 부팅→체이닝→데이터 (이 로봇)',
    md: `
## 이 로봇에서 controller_manager가 **켜지고, 플러그인을 붙이고, 체인을 엮고, 데이터를 나르는** 과정

> **이 탭은 실제 \`controllers.yaml\` · \`ml/src/rl_arm_correction.cpp\` · \`BeebotSystemHardware\`를 읽고 쓴 것**이다 (일반 설명은 ⑨). 도식의 노드·선을 누르면 설명이 뜬다.
> 표시: 📦 제공 · 🛠️ 직접 작성 · ✉️ 토픽 · 🎬 액션 · 📞 서비스 · 🔗 칸

### ① 부팅 — 6단계

${F}mermaid
flowchart TB
    P1["① 파라미터 읽기<br/>controllers.yaml → controller_manager<br/>update_rate 100 · enforce_command_limits false · 컨트롤러 6개 type"]
    P2["② /robot_description 수신<br/>URDF ros2_control 블록 → HardwareInfo"]
    P3["③ 하드웨어 로드 + 칸 생성<br/>🛠️ control::BeebotSystemHardware<br/>on_init → on_configure(포트 열기) → on_activate"]
    P4["④ 제어 루프 스레드 시작<br/>100Hz · read → update → write"]
    P5["⑤ spawner 가 컨트롤러 6개를 순서대로<br/>load → configure → activate"]
    P6["⑥ 체인 완성<br/>arm_controller → rl_arm_correction → 하드웨어"]
    P1 --> P2 --> P3 --> P4 --> P5 --> P6
    %% tip P1: 파라미터 | controller_manager 블록에서 update_rate(100)와 각 컨트롤러 type을 읽는다. enforce_command_limits:false — 켜 두면 관절이 이미 한계 밖에 있을 때(손으로 옮김·처짐) 예외로 rl_arm_correction·arm_controller가 못 켜져 되돌리는 명령조차 못 보냈다(실기 joint2 −120°). 그래서 끔: 자동은 MoveIt이 URDF 한계 안에서만 계획한다.
    %% tip P2: URDF 수신 | ros2_control_node는 파일이 아니라 robot_state_publisher가 발행한 /robot_description 토픽을 받는다. 거기서 ros2_control 블록만 뽑아 플러그인 이름·param·관절별 인터페이스를 만든다.
    %% tip P3: 하드웨어 + 칸 | state 칸: 바퀴 pos·vel·effort, joint1~5 pos·vel·effort, gripper_left pos·vel·effort, imu 10개. command 칸: 바퀴 velocity 2, joint1~5 position, gripper position·effort. 컨트롤러는 아직 없다 — 칸만 먼저 만들어진다.
    %% tip P4: 루프 시작 | 이 시점부터 100Hz로 read()/write()가 돈다. 컨트롤러가 없으니 update는 빈 채로 — state 칸은 이미 채워지고 있다.
    %% tip P5: spawner | joint_state_broadcaster → imu_sensor_broadcaster → diff_drive_controller → gripper_controller → rl_arm_correction → arm_controller. 하나가 실패하면 거기서 멈춘다 — 팔 체인이 맨 뒤라 실패해도 바퀴·그리퍼는 이미 떠 있다. controller_manager 대기 120초 · 서비스 응답 30초.
    %% tip P6: 체인 | rl_arm_correction이 먼저 reference 칸을 내놓고, 그 뒤 arm_controller가 그 칸을 빌려 체인 모드로 들어간다. 이후 한 주기 안에서 JTC → rl → write 순서로 돈다.
${CLS}
    class P1,P2,P4,P5,P6 std;
    class P3 mine;
${F}

### ② 컨트롤러 6개가 켜질 때 — 무엇을 하고 어떤 칸을 빌리나

| # | 컨트롤러 (패키지::클래스) | configure에서 | activate에서 빌리는 칸 |
| --- | --- | --- | --- |
| 1 | 📦 \`joint_state_broadcaster::JointStateBroadcaster\` | \`/joint_states\` 발행 준비 | **state 전부 읽기** (모든 관절 pos·vel·effort) |
| 2 | 📦 \`imu_sensor_broadcaster::IMUSensorBroadcaster\` | \`sensor_name: imu\` · \`frame_id: imu_link\` · 공분산 | state \`imu/*\` 읽기 → \`/imu\` |
| 3 | 📦 \`diff_drive_controller::DiffDriveController\` | wheel_radius **0.033** · wheel_separation **0.287** · \`enable_odom_tf: false\` · publish_rate 50 | **command** \`wheel_left/right_joint/velocity\` · state 바퀴 position·velocity |
| 4 | 📦 \`parallel_gripper_action_controller::GripperActionController\` | 액션 \`/gripper_controller/gripper_cmd\` 서버 · \`max_effort\` 0.6 A · \`allow_stalling: true\` | **command** \`gripper_left_joint/position\` + \`gripper_left_joint/effort\`(쥐는 힘) · state position |
| 5 | 🛠️ \`ml::RlArmCorrection\` (chainable) | \`~/reset_sag\` 서비스 · \`/skill_context\` · \`/hand_relative\` 구독 · 정책 준비 | **command** \`joint1~5/position\` · **state** joint pos·vel(10) + effort(5) + gripper pos·effort · **자기 reference 5개를 내놓음** |
| 6 | 📦 \`joint_trajectory_controller::JointTrajectoryController\` | \`command_joints\`에 \`rl_arm_correction/jointN\` · constraints | **command = rl_arm_correction의 reference 5개** · state joint pos·vel |

- **gripper_controller**의 쥐는 힘은 \`max_effort_interface: gripper_left_joint/effort\` → 하드웨어 → 펌웨어 C 줄 **9번째(Goal Current)** 로 간다.
- **rl_arm_correction**이 내놓는 reference는 코드의 \`on_export_reference_interfaces_list()\`에서 \`컨트롤러이름/joint1/position\` 형태로 만들어진다 (이름 = \`get_node()->get_name()\` + \`/\` + 관절).
- 5번이 **6번보다 먼저**여야 한다: 6번이 빌릴 reference 칸이 5번이 켜질 때 비로소 목록에 올라온다.

### ③ 체인이 엮이는 순간 — 5번이 6번을 받아들이기까지

${F}mermaid
sequenceDiagram
    autonumber
    participant SP as 📦 spawner
    participant CM as 📦 ControllerManager
    participant RM as 📦 ResourceManager
    participant RLA as 🛠️ ml::RlArmCorrection
    participant JTC as 📦 JointTrajectoryController
    participant HW as 🛠️ BeebotSystemHardware
    SP->>CM: 📞 load_controller("rl_arm_correction") → type ml/RlArmCorrection 로 객체 생성
    SP->>CM: 📞 configure_controller
    CM->>RLA: on_configure() — reset_sag 서비스 · 구독 만들기
    CM->>RLA: on_export_reference_interfaces_list()
    RLA-->>RM: reference 칸 5개 등록 (rl_arm_correction/joint1~5/position)
    SP->>CM: 📞 switch_controller(activate rl_arm_correction)
    CM->>RLA: command/state_interface_configuration()
    RLA-->>CM: command joint1~5/position · state 10+5+2
    CM->>RM: 있나? 누가 빌렸나?
    RM-->>CM: 확인 → HW 의 command 칸 5개를 RLA 에 빌려줌 (소유권 기록)
    CM->>RLA: on_activate() — reference 를 현재 엔코더 자세로 채움 (첫 주기에 0 rad 로 튀지 않게)
    SP->>CM: 📞 load → configure → switch(activate arm_controller)
    CM->>JTC: command_interface_configuration() — rl_arm_correction/joint1~5/position
    JTC-->>CM: 요청
    CM->>RM: 이 이름은 RLA 의 reference 칸 — 아직 주인(앞 컨트롤러) 없음
    RM-->>CM: OK
    CM->>RLA: 체인 모드로 전환 — 이제 앞 컨트롤러 값을 reference 로 받는다
    CM->>RM: reference 칸 소유권 JTC 로 기록
    CM-->>JTC: 칸 빌려줌 → JTC 가 set_value 로 직접 씀
    Note over CM: 호출 순서표: JTC(쓰는 쪽) → RLA(읽는 쪽)
${F}

- JTC는 \`command_interfaces: [position]\`이지만 **하드웨어 command가 아니라 reference 칸**에 쓴다. 이유는 \`command_joints\`를 \`rl_arm_correction/jointN\`으로 설정했기 때문이다 (글자 일치).
- 체인 모드가 되면 RlArmCorrection의 \`update_reference_from_subscribers()\`는 호출되지 않는다 (이 구현은 원래 \`OK\`만 돌려준다).
- **켜는 순서가 거꾸로면** JTC가 \`rl_arm_correction/joint1/position\`을 찾지 못해 activate 실패.

### ④ 완성된 칸 소유 지도

${F}mermaid
flowchart LR
    subgraph STATE["state 칸 — 하드웨어가 채우고 여럿이 읽음"]
        S1["wheel_left/right_joint<br/>position · velocity · effort"]
        S2["joint1~5<br/>position · velocity · effort"]
        S3["gripper_left_joint<br/>position · velocity · effort"]
        S4["imu/*"]
    end
    subgraph REF["reference 칸 — RlArmCorrection 이 내놓음"]
        R1["rl_arm_correction/joint1~5/position"]
    end
    subgraph CMD["command 칸 — 한 컨트롤러만 씀"]
        C1["wheel_*_joint/velocity"]
        C2["joint1~5/position"]
        C3["gripper_left_joint/position<br/>gripper_left_joint/effort"]
    end
    HW["🛠️ BeebotSystemHardware"]
    JSB["📦 joint_state_broadcaster"]
    IMB["📦 imu_sensor_broadcaster"]
    DD["📦 diff_drive_controller"]
    GC["📦 gripper_controller"]
    RLA["🛠️ ml::RlArmCorrection"]
    JTC["📦 arm_controller (JTC)"]
    HW -->|"read() 채움"| S1
    HW -->|"read() 채움"| S2
    HW -->|"read() 채움"| S3
    HW -->|"read() 채움"| S4
    S1 -.->|"읽기"| JSB
    S2 -.->|"읽기"| JSB
    S3 -.->|"읽기"| JSB
    S4 -.->|"읽기"| IMB
    S1 -.->|"읽기"| DD
    S2 -.->|"읽기"| JTC
    S2 -.->|"읽기"| RLA
    S3 -.->|"읽기"| RLA
    S3 -.->|"읽기"| GC
    JTC ==>|"쓰기"| R1
    R1 -.->|"읽기"| RLA
    RLA ==>|"쓰기"| C2
    DD ==>|"쓰기"| C1
    GC ==>|"쓰기"| C3
    C1 -->|"write() 가져감"| HW
    C2 -->|"write() 가져감"| HW
    C3 -->|"write() 가져감"| HW
    %% tip R1: reference 칸 | RlArmCorrection이 on_export_reference_interfaces_list()로 내놓은 5개. 쓰는 쪽은 앞 컨트롤러(arm_controller JTC), 읽는 쪽은 주인(RlArmCorrection). 하드웨어는 이 칸을 모른다.
    %% tip C2: 팔 command 칸 | joint1~5/position. 소유자는 RlArmCorrection 하나뿐 — JTC가 직접 쓰지 못한다. write()가 C 줄 3~7번째 자리로 보낸다(관절 offset을 더해 서보 값으로).
    %% tip C3: 그리퍼 command 칸 | position(m)이 C 줄 8번째, effort(쥐는 힘 A)가 9번째. gripper_controller가 소유한다.
    %% tip C1: 바퀴 command 칸 | wheel_left/right_joint/velocity [rad/s] — diff_drive_controller 소유. C 줄 맨 앞 두 자리.
    %% tip HW: 하드웨어 | read()에서 S 줄을 받아 state 칸을 채우고 write()에서 command 칸을 모아 C 줄로 보낸다. reference 칸은 모른다.
    %% tip RLA: ml::RlArmCorrection | reference(목표)와 state(현재각 · effort · 그리퍼)를 읽어 command를 쓴다. 정책 Δ는 max_delta 0.05 rad로 제한.
${CLS}
    class S1,S2,S3,S4 hw;
    class R1 rl;
    class C1,C2,C3 rl;
    class HW,RLA mine;
    class JSB,IMB,DD,GC,JTC std;
    style STATE fill:#fffde7,stroke:#f9a825
    style REF fill:#fff3e0,stroke:#e65100
    style CMD fill:#fff3e0,stroke:#e65100
${F}

### ⑤ 데이터 주고받기 — 한 주기에 joint2 값이 지나가는 길

${F}mermaid
sequenceDiagram
    autonumber
    participant OC as 🔌 OpenCR
    participant HW as 🛠️ BeebotSystemHardware
    participant ST as state 칸
    participant JTC as 📦 arm_controller
    participant RF as reference 칸
    participant RLA as 🛠️ ml::RlArmCorrection
    participant CM as command 칸
    Note over JTC,RLA: 비실시간 쪽에서 미리 들어온 것 — 궤적(액션 goal → RealtimeBuffer) · /skill_context · /hand_relative(RealtimeBox) · reset_sag(atomic)
    OC-->>HW: S 줄
    HW->>ST: read() — joint2/position(서보값−offset, 비틀림 보정) · velocity · effort
    JTC->>ST: update() — 현재각 읽기
    JTC->>RF: 보간한 목표를 rl_arm_correction/joint2/position 에
    RLA->>RF: update_and_write_commands() — 목표 읽기
    RLA->>ST: 현재각 · 속도 · effort · 그리퍼 읽기
    RLA->>CM: joint2/position = 목표 + 보정 (정책 Δ ±0.05 rad 외)
    HW->>CM: write() — command 칸 읽기
    HW->>OC: C 줄 4번째 자리에 (+offset)
${F}

| 데이터 | 어디서 어디로 | 방식 |
| --- | --- | --- |
| **S 줄 → state 칸** | OpenCR → \`read()\` | 시리얼 한 줄 → 단위 변환 → 변수. 팔 위치는 **비틀림 보정**(joint2·3, \`twist_state\`)과 **한계 클램프**를 거쳐 칸에 들어감 |
| **궤적 → JTC** | 🎬 \`FollowJointTrajectory\` / ✉️ \`joint_trajectory\` | 실시간 밖에서 받아 **RealtimeBuffer**에 두고 \`update()\`가 꺼냄 |
| **JTC → RlArmCorrection** | reference 칸 5개 | **같은 메모리 변수** — 복사·토픽 없음 |
| **스킬 정보 → RlArmCorrection** | ✉️ \`/skill_context\` (ml/SkillContext) · \`/hand_relative\` | 콜백이 값을 **버퍼**에 넣고, \`update\`가 \`try_get()\`으로 꺼냄 (못 잡으면 지난 값) |
| **처짐 초기화 → RlArmCorrection** | 📞 \`~/reset_sag\` | 콜백은 **atomic 플래그**만 세우고 \`update\`가 \`exchange(false)\`로 소비 |
| **RlArmCorrection → 하드웨어** | command 칸 5개 | 같은 메모리 변수 |
| **command 칸 → OpenCR** | \`write()\` → C 줄 | 바퀴 2 + 팔 5 + 그리퍼 1(+ 9번째 전류)을 **한 줄**로 |
| **state 칸 → 위쪽** | \`joint_state_broadcaster\` → ✉️ \`/joint_states\` | realtime publisher가 실시간 밖에서 발행 |

> **패턴:** 실시간 루프 **안**은 칸(변수)만 쓰고, 토픽·서비스·액션이 **들어오는 경계**에는 **버퍼·atomic**을 둔다. 그래야 \`update()\`가 잠기거나 할당하지 않는다.

### ⑥ 이 로봇에서 이름이 이어지는 곳 (한 글자만 틀려도 끊김)

| 연결 | 쪽 A | 쪽 B |
| --- | --- | --- |
| 컨트롤러 클래스 | yaml \`rl_arm_correction.type: ml/RlArmCorrection\` | pluginlib 이름표 \`ml/RlArmCorrection\` · C++ \`ml::RlArmCorrection\` |
| 체인 | JTC \`command_joints: rl_arm_correction/joint1~5\` | \`on_export_reference_interfaces_list()\`가 만든 \`컨트롤러이름/관절/position\` |
| 하드웨어 칸 | URDF \`joint2\` + \`position\` | RlArmCorrection이 요청한 \`joint2/position\` |
| 쥐는 힘 | yaml \`max_effort_interface: gripper_left_joint/effort\` | URDF 그리퍼 \`<command_interface name="effort"/>\` |
| IMU | yaml \`sensor_name: imu\` | URDF \`<sensor name="imu">\` |
`,
  },

};

const ORDER = Object.keys(SECTIONS) as Sec[];

// ② 한 주기 흐름 스텝퍼 — 단계마다 바뀌는 변수 칸을 강조
type Row = { name: string; kind: 'state' | 'command' | 'reference'; owner: string };
const ROWS: Row[] = [
  { name: 'joint2/position', kind: 'state', owner: '하드웨어' },
  { name: 'joint2/effort', kind: 'state', owner: '하드웨어 (fork)' },
  { name: 'gripper_left_joint/effort', kind: 'state', owner: '하드웨어 (fork)' },
  { name: 'wheel_left_joint/velocity', kind: 'state', owner: '하드웨어' },
  { name: 'rl_arm_correction/joint2/position', kind: 'reference', owner: 'rl_arm_correction' },
  { name: 'joint2/position', kind: 'command', owner: 'rl_arm_correction이 소유' },
  { name: 'wheel_left_joint/velocity', kind: 'command', owner: 'diff_drive_controller가 소유' },
];
type Step = { title: string; who: string; text: string; vals: (string | null)[]; hot: number[]; bus?: string };
const STEPS: Step[] = [
  { title: '주기 시작 (t = 0ms)', who: 'controller_manager', text: '100Hz 루프의 한 주기(10ms)가 시작된다. 지금 변수에는 지난 주기 값이 들어 있다.', vals: ['0.58', '0.28', '0.00', '2.60', '0.61', '0.64', '2.68'], hot: [] },
  { title: '1. read() — 하드웨어 플러그인', who: 'BeebotSystemHardware', text: 'controller_manager가 하드웨어 플러그인의 read()를 부른다. 플러그인이 OpenCR가 보낸 S 줄(USB 시리얼)에서 위치·속도·전류·IMU를 읽어 rad·A로 바꿔 state 변수에 넣는다.', vals: ['0.59', '0.31', '0.42', '2.70', '0.61', '0.64', '2.68'], hot: [0, 1, 2, 3], bus: '🔌 S 줄 ← OpenCR' },
  { title: '2-1. update() — arm_controller (JTC)', who: 'joint_trajectory_controller', text: 'JTC가 궤적을 보간해 이번 목표 0.62를 정한다. 체인이므로 하드웨어가 아니라 rl_arm_correction의 reference 변수에 쓴다.', vals: ['0.59', '0.31', '0.42', '2.70', '0.62', '0.64', '2.68'], hot: [4] },
  { title: '2-2. update() — rl_arm_correction', who: 'cupbot_controllers/RlArmCorrection', text: 'reference 0.62와 state(현재 0.59, 그리퍼 effort 0.42 → "컵 들고 있음")로 Δ +0.03을 계산해 command joint2/position = 0.65를 쓴다.', vals: ['0.59', '0.31', '0.42', '2.70', '0.62', '0.65', '2.68'], hot: [5] },
  { title: '2-3. update() — diff_drive_controller', who: 'diff_drive_controller', text: '최근 /cmd_vel (0.14 m/s, 0.35 rad/s)를 좌우 바퀴 속도로 바꿔 command에 쓴다. 왼쪽 바퀴 ≈ 2.72 rad/s (예시 값).', vals: ['0.59', '0.31', '0.42', '2.70', '0.62', '0.65', '2.72'], hot: [6] },
  { title: '2-4. update() — broadcaster들', who: 'joint_state_broadcaster · imu_sensor_broadcaster', text: 'state 변수를 읽어 /joint_states, /imu 토픽으로 발행한다 (변수는 바꾸지 않는다). arm_safety_monitor가 /joint_states의 effort를 본다.', vals: ['0.59', '0.31', '0.42', '2.70', '0.62', '0.65', '2.72'], hot: [0, 1, 2, 3] },
  { title: '3. write() — 하드웨어 플러그인', who: 'BeebotSystemHardware', text: 'controller_manager가 write()를 부른다. 플러그인이 command 변수(0.65 rad, 2.72 rad/s)를 C 줄 한 줄로 합쳐 OpenCR에 보낸다. 다음 주기까지 남은 시간은 쉰다.', vals: ['0.59', '0.31', '0.42', '2.70', '0.62', '0.65', '2.72'], hot: [5, 6], bus: '🔌 C 줄 → OpenCR' },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosControl extends w.HTMLElement {
    private sec?: Sec;
    private step = 0;
    private timer?: number;

    /** ?concept=nodeops&tab=ros2control&cs=섹션 — 클릭 push·뒤로가기·딥링크 */
    @subscribeSwcAppRouteChange('/ros2', { trigger: 'connectedDone' })
    onRoute(@swcAppRouteQueryParam('concept') concept: string | null, @swcAppRouteQueryParam('tab') tab: string | null, @swcAppRouteQueryParam('cs') cs: string | null) {
      if (concept !== 'nodeops' || tab !== 'ros2control') return;
      const sec: Sec = cs && cs in SECTIONS ? (cs as Sec) : 'concept';
      if (sec === this.sec) return;
      const first = this.sec === undefined;
      this.sec = sec;
      this.render2();
      if (!first) (this.shadowRoot?.querySelector('.rc-secs') as HTMLElement)?.scrollIntoView({ block: 'start' });
    }

    @swcAppRouteGo
    private goSec(sec: Sec) {
      if (sec === this.sec) return false;
      return { path: `/ros2?concept=nodeops&tab=ros2control&cs=${sec}`, scrollToTop: false };
    }

    private async render2() {
      const sec = this.sec!;
      this.shadowRoot?.querySelectorAll('.rc-sec').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.sec === sec));
      const body = this.shadowRoot?.querySelector('#rc-body') as HTMLElement;
      if (!body) return;
      this.stopPlay();
      if (sec === 'flow') {
        markdownCancel(body);
        body.innerHTML = this.flowHtml();
        this.paintStep();
        return;
      }
      await markdownParse(body, SECTIONS[sec].md!);
    }

    private flowHtml() {
      return `
        <h2>한 주기(10ms) 흐름 — read → update → write</h2>
        <p>controller_manager가 매 주기 같은 순서로 플러그인을 부릅니다. 단계를 넘기며 어떤 변수가 바뀌는지 보세요. 모든 변수는 같은 프로세스의 double이라 복사·직렬화가 없습니다.</p>
        <div class="rc-steps">${STEPS.map((s, i) => `<button class="rc-step" data-i="${i}">${esc(s.title.split(' — ')[0])}</button>`).join('')}</div>
        <div class="rc-ctl"><button class="rc-prev">◀ 이전</button><button class="rc-play">▶ 자동 재생</button><button class="rc-next">다음 ▶</button></div>
        <div class="rc-now"><div class="rc-title"></div><div class="rc-who"></div><p class="rc-text"></p><div class="rc-bus"></div></div>
        <table class="rc-vars"><thead><tr><th>변수</th><th>종류</th><th>소유·출처</th><th>값</th></tr></thead>
          <tbody>${ROWS.map((r, i) => `<tr data-r="${i}"><td><code>${esc(r.name)}</code></td><td><span class="rc-k ${r.kind}">${r.kind}</span></td><td>${esc(r.owner)}</td><td class="rc-v"></td></tr>`).join('')}</tbody></table>
        <p class="rc-note">값은 예시입니다 (rad, A, rad/s). state = 하드웨어가 채우고 누구나 읽음 · command = 한 컨트롤러만 씀 · reference = 체인에서 앞 컨트롤러가 씀.</p>`;
    }

    private paintStep() {
      const root = this.shadowRoot!;
      const s = STEPS[this.step];
      root.querySelectorAll('.rc-step').forEach(b => b.classList.toggle('active', Number((b as HTMLElement).dataset.i) === this.step));
      (root.querySelector('.rc-title') as HTMLElement).textContent = s.title;
      (root.querySelector('.rc-who') as HTMLElement).textContent = `호출되는 쪽: ${s.who}`;
      (root.querySelector('.rc-text') as HTMLElement).textContent = s.text;
      const bus = root.querySelector('.rc-bus') as HTMLElement;
      bus.textContent = s.bus ?? '';
      bus.hidden = !s.bus;
      root.querySelectorAll<HTMLElement>('.rc-vars tbody tr').forEach(tr => {
        const i = Number(tr.dataset.r);
        (tr.querySelector('.rc-v') as HTMLElement).textContent = s.vals[i] ?? '—';
        tr.classList.toggle('hot', s.hot.includes(i));
      });
    }

    private stopPlay() {
      if (this.timer) { w.clearInterval(this.timer); this.timer = undefined; }
      const b = this.shadowRoot?.querySelector('.rc-play');
      if (b) b.textContent = '▶ 자동 재생';
    }

    @addEventListener('.rc-sec', 'click', { delegate: true })
    onSec(e: Event) {
      const b = (e.target as HTMLElement).closest('.rc-sec') as HTMLElement;
      if (b?.dataset.sec) this.goSec(b.dataset.sec as Sec);
    }

    @addEventListener('.rc-step', 'click', { delegate: true })
    onStep(e: Event) {
      const b = (e.target as HTMLElement).closest('.rc-step') as HTMLElement;
      if (!b) return;
      this.stopPlay();
      this.step = Number(b.dataset.i);
      this.paintStep();
    }

    @addEventListener('.rc-prev', 'click', { delegate: true })
    onPrev() { this.stopPlay(); this.step = (this.step + STEPS.length - 1) % STEPS.length; this.paintStep(); }

    @addEventListener('.rc-next', 'click', { delegate: true })
    onNext() { this.stopPlay(); this.step = (this.step + 1) % STEPS.length; this.paintStep(); }

    @addEventListener('.rc-play', 'click', { delegate: true })
    onPlay() {
      if (this.timer) { this.stopPlay(); return; }
      const b = this.shadowRoot?.querySelector('.rc-play');
      if (b) b.textContent = '⏸ 멈춤';
      this.timer = w.setInterval(() => { this.step = (this.step + 1) % STEPS.length; this.paintStep(); }, 2200);
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
          .rc-steps { display:flex; flex-wrap:wrap; gap:5px; margin:10px 0 6px; }
          .rc-step { padding:4px 10px; border-radius:14px; border:1.5px solid #cbd5e1; background:#fff; color:#334155; font:inherit; font-size:12px; font-weight:700; cursor:pointer; }
          .rc-step.active { background:#22314e; color:#fff; border-color:#22314e; }
          .rc-ctl { display:flex; gap:6px; margin:4px 0 10px; }
          .rc-ctl button { padding:5px 12px; border-radius:14px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#1e3a8a; font:inherit; font-size:12px; font-weight:800; cursor:pointer; }
          .rc-now { background:#f8fafc; border:1px solid #e2e8f0; border-left:5px solid #3b82c4; border-radius:8px; padding:10px 14px; }
          .rc-title { font-size:15px; font-weight:800; color:#1e293b; }
          .rc-who { font-size:12px; color:#0369a1; font-weight:700; }
          .rc-bus { display:inline-block; margin-top:2px; padding:2px 10px; border-radius:10px; background:#fff9c4; border:1px solid #f9a825; font-size:12px; font-weight:700; }
          .rc-vars { margin-top:10px !important; display:table !important; width:100%; }
          .rc-vars tr.hot td { background:#dbeafe; transition:background .3s; }
          .rc-vars tr.hot .rc-v { font-weight:800; color:#1e3a8a; }
          .rc-v { font-family:ui-monospace,monospace; text-align:right !important; width:70px; }
          .rc-k { font-size:11px; font-weight:800; padding:0 7px; border-radius:8px; }
          .rc-k.state { background:#dcfce7; color:#166534; }
          .rc-k.command { background:#fee2e2; color:#991b1b; }
          .rc-k.reference { background:#ffedd5; color:#9a3412; }
          .rc-note { font-size:12px; color:#64748b; }
          [hidden] { display:none !important; }
          @media(max-width:600px){ #rc-body { padding:10px; } .rc-vars td:nth-child(3), .rc-vars th:nth-child(3) { display:none; } }
        </style>

        <div class="rc-intro">
          <b>ros2_control</b>은 다른 ROS 2 노드와 개념이 다릅니다. <b>controller_manager라는 틀</b>이 주기와 호출 순서를 쥐고,
          우리는 정해진 인터페이스(기본 클래스·변수 이름)만 맞춘 <b>플러그인</b>을 끼웁니다 — "인터페이스만 맞춰라, 내가 불러다 쓸게."
          모터·센서 연결이 장치마다 달라도 플러그인 안에서 끝나므로, 컨트롤러·MoveIt·Nav2는 그대로 둘 수 있습니다.
        </div>
        <div class="rc-intro" style="padding:6px 12px;font-size:12px"><b>도식 표시</b> &nbsp; 📦 제공 · 🛠️ 직접 작성 &nbsp;|&nbsp; ✉️ 토픽 · 🎬 액션 · 📞 서비스 · 🔌 시리얼·USB · 🔗 같은 프로세스 안(칸·인터페이스) &nbsp;|&nbsp; 📄 내가 쓰는 설정 &nbsp;|&nbsp; 초록=제공 · 파랑=직접 · 주황=칸 · 노랑=장치</div>
        <div class="rc-secs">${ORDER.map(k => `<button class="rc-sec" data-sec="${k}">${SECTIONS[k].label}</button>`).join('')}</div>
        <div id="rc-body"></div>
      `;
    }
  }

  return tagName;
};
