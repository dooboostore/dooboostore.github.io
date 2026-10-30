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

type Sec = 'concept' | 'flow' | 'hw' | 'ctrl' | 'connect' | 'robot';

const F = '```';

const CLS = `    classDef std fill:#c8e6c9,stroke:#2e7d32,color:#1b1b1b;
    classDef rl fill:#ffe0b2,stroke:#e65100,color:#1b1b1b;
    classDef hw fill:#fff9c4,stroke:#f9a825,color:#1b1b1b;
    classDef mine fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e;
    classDef ext fill:#ffffff,stroke:#8A97A0,stroke-dasharray:4 3,color:#475569;`;

const SECTIONS: Record<Sec, { label: string; md?: string }> = {
  concept: {
    label: '① 개념 — 끼워 넣는 구조',
    md: `
## ros2_control은 "틀에 끼우는 플러그인" 구조다

대부분의 ROS 2 노드는 **각자 프로세스로 돌면서 토픽으로 대화**합니다. ros2_control은 다릅니다. **controller_manager라는 틀이 주기와 호출 순서를 쥐고 있고**, 우리는 정해진 기본 클래스를 상속해 \`read()\`·\`write()\`(하드웨어) 또는 \`update()\`(컨트롤러)만 채웁니다. 언제 부를지는 틀이 정합니다 — "인터페이스만 맞춰라, 내가 불러다 쓸게."

${F}mermaid
flowchart TB
    subgraph B["플러그인 방식 (ros2_control)"]
        direction TB
        CM["📦 controller_manager<br/>틀: 주기 · 호출 순서 · 소유권"]
        C["📦 컨트롤러 플러그인<br/>update()만 구현"]
        H["🛠️ 내 하드웨어 플러그인<br/>read() · write()만 구현"]
        CM -->|"🧩 1. read() 호출"| H
        CM -->|"🧩 2. update() 호출"| C
        CM -->|"🧩 3. write() 호출"| H
        C -.->|"🧩 같은 메모리의<br/>double 변수"| H
    end
    subgraph A["일반 노드 방식"]
        direction TB
        N1["📦 노드 A<br/>자기 프로세스 · 자기 주기"]
        N2["📦 노드 B<br/>자기 프로세스 · 자기 주기"]
        N1 -->|"✉️ 토픽<br/>(직렬화 · DDS)"| N2
    end
${CLS}
    class N1,N2,CM,C std;
    class H mine;
    style A fill:#f8fafc,stroke:#94a3b8
    style B fill:#f8fafc,stroke:#94a3b8
${F}

| | 일반 노드 | ros2_control 플러그인 |
| --- | --- | --- |
| 실행 단위 | 프로세스(또는 컴포넌트) 하나 | controller_manager 프로세스 안의 객체 |
| 누가 부르나 | 자기가 타이머·콜백으로 돈다 | **controller_manager가** 정해진 순서로 부른다 |
| 데이터 주고받기 | 토픽·서비스·액션 (직렬화) | 같은 메모리의 double 변수 (복사 없음) |
| 주기 | 노드마다 제각각 | 하나의 실시간 루프 (예: 100Hz) |
| 내가 구현하는 것 | 노드 전체 | 기본 클래스의 몇 개 함수 |
| 불러오는 방법 | launch에서 실행 | **pluginlib**가 클래스 이름 문자열로 \`.so\`를 불러옴 |

### 계약(인터페이스)은 세 가지

1. **상속할 기본 클래스** — 하드웨어는 \`hardware_interface::SystemInterface\`(또는 Actuator·Sensor), 컨트롤러는 \`controller_interface::ControllerInterface\`(체인이면 \`ChainableControllerInterface\`).
2. **변수 이름 규칙** — \`관절이름/인터페이스이름\` (예: \`joint2/position\`). 하드웨어는 이 이름으로 변수를 내놓고, 컨트롤러는 같은 이름을 달라고 요청한다.
3. **플러그인 등록** — pluginlib xml에 클래스 이름을 적고 CMake로 내보낸다. URDF·YAML에는 그 문자열만 쓴다 (예: \`turtlebot3_manipulation_hardware/TurtleBot3ManipulationSystemHardware\`).

### 같은 패턴을 쓰는 곳

| 틀 | 끼워 넣는 것 | 예 |
| --- | --- | --- |
| Nav2 planner_server · controller_server | 플래너·컨트롤러 플러그인 | NavFn, Smac, DWB, MPPI |
| Nav2 costmap_2d | 레이어 플러그인 | static, obstacle, voxel, inflation |
| Nav2 bt_navigator | BT 노드 플러그인 | FollowPath, Spin, 커스텀 조건 |
| MoveIt | 플래너·IK 솔버 | OMPL, pick_ik, KDL |
| RViz | Display·Tool 플러그인 | 커스텀 시각화 |

> 한 번 이해하면 Nav2·MoveIt 설정 파일의 \`plugin: ...\` 줄이 전부 같은 의미로 읽힌다: "이 이름의 클래스를 불러다 틀에 끼워라."
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

### 뼈대 (공식 TurtleBot3 플러그인과 같은 형태, Jazzy)

${F}cpp
class MyHardware : public hardware_interface::SystemInterface {
public:
  CallbackReturn on_init(const hardware_interface::HardwareInfo & info) override {
    if (SystemInterface::on_init(info) != CallbackReturn::SUCCESS) return CallbackReturn::ERROR;
    port_ = info_.hardware_parameters["opencr_usb_port"];     // URDF <param>
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
    // 버스에서 읽기 (SyncRead) → 틱을 rad · rad/s · A로 바꿔 positions_/velocities_/efforts_에
    return return_type::OK;
  }
  return_type write(const rclcpp::Time &, const rclcpp::Duration &) override {
    // commands_[i](rad) → 틱으로 바꿔 버스에 쓰기 (SyncWrite)
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
    JTC -->|"🧩 reference 쓰기<br/>rl_arm_correction/joint2/position"| RAC["🛠️ rl_arm_correction<br/>extends ChainableControllerInterface"]
    RAC -->|"🧩 command 쓰기<br/>joint2/position = 목표 + Δ"| HW["📦 하드웨어 플러그인"]
    HW -->|"🧩 state<br/>position·velocity·effort"| RAC
    HW -->|"🧩 state<br/>position·velocity"| JTC
${CLS}
    class MG,JTC,HW std;
    class RAC rl;
${F}

${F}cpp
// chainable 컨트롤러 (Jazzy ChainableControllerInterface)
std::vector<hardware_interface::CommandInterface> on_export_reference_interfaces() override;
  // → "rl_arm_correction/joint1~4/position" 입력 자리를 내놓음
return_type update_reference_from_subscribers(const rclcpp::Time &, const rclcpp::Duration &) override;
  // 체인이 아닐 때 토픽으로 받은 값을 reference에 (체인 모드에선 안 불림)
return_type update_and_write_commands(const rclcpp::Time &, const rclcpp::Duration &) override;
  // reference + Δ → command (±0.05rad 클리핑, enabled=false면 Δ=0)
${F}

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
    YAML["📄 controllers.yaml<br/>컨트롤러 이름 · 타입 · 파라미터"]
    SP["📦 spawner<br/>load · configure · activate"]
    subgraph CMG["📦 controller_manager (ros2_control_node)"]
        CTRL["컨트롤러 플러그인들"]
        RM["Resource Manager<br/>변수 목록 · 쓰기 소유권"]
        HWC["하드웨어 플러그인 (장치마다 하나)"]
        CTRL -->|"🧩 command"| RM
        RM -->|"🧩 state"| CTRL
        RM -->|"🧩 write()"| HWC
        HWC -->|"🧩 read()"| RM
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
| 루프 주기 경고 | read/write가 느림 — baud rate, SyncRead/SyncWrite 사용 확인 |
`,
  },

  robot: {
    label: '⑥ 이 로봇 적용',
    md: `
## 실전노드설계 로봇에 적용하면

TurtleBot3 Waffle + OpenMANIPULATOR-X는 **OpenCR 하나**에 바퀴·팔·그리퍼·IMU가 다 붙어 있어 하드웨어 플러그인(컴포넌트)이 하나, controller_manager도 하나다.

### 하드웨어 플러그인 — 공식 플러그인을 fork

| 항목 | 값 (공식 turtlebot3_manipulation, jazzy) |
| --- | --- |
| 플러그인 | \`turtlebot3_manipulation_hardware/TurtleBot3ManipulationSystemHardware\` (SystemInterface) |
| URDF param | opencr_id 200 · opencr_usb_port /dev/ttyACM0 · opencr_baud_rate 1000000 · dxl_joints_profile_acceleration·velocity |
| 바퀴 wheel_left/right_joint | command velocity · state position, velocity |
| 팔 joint1~4 | command position · state position, velocity, **effort ★** |
| 그리퍼 gripper_left_joint (right는 mimic) | command position · state position, velocity, **effort ★** |
| 센서 imu | orientation · angular_velocity · linear_acceleration |
| 센서 battery | voltage · percentage · design_capacity · present |

> ⚠️ **★ effort는 공식 플러그인에 없다.** 공식 플러그인은 팔·그리퍼의 position·velocity만 내보낸다. OpenCR 제어 테이블에는 전류(\`present_current_joint_1~4\` 주소 264~270, \`present_current_gripper\` 272, 각 2바이트)가 있으므로 fork해서 ① \`read()\`에서 읽고 ② \`export_state_interfaces()\`에 effort 추가 ③ URDF 관절에 \`<state_interface name="effort"/>\` 추가. arm_safety_monitor(접촉 감지)와 rl_arm_correction(파지 판단)이 이 값을 쓴다. 단위 변환은 OpenCR 펌웨어·모터 문서로 확인.

### 진짜 URDF 예시 (이 로봇 그대로)

\`<ros2_control>\` 블록 하나 = 하드웨어 플러그인 객체 하나. OpenCR 하나에 전부 붙어 있으니 블록도 하나다. 관절·센서 이름은 컨트롤러가 찾는 변수 이름(\`joint2/position\`, \`imu/orientation.x\`)이 된다.

${F}xml
<ros2_control name="TurtleBot3ManipulationSystem" type="system">
  <hardware>
    <plugin>turtlebot3_manipulation_hardware/TurtleBot3ManipulationSystemHardware</plugin>
    <param name="opencr_usb_port">/dev/ttyACM0</param>
    <param name="opencr_baud_rate">1000000</param>
    <param name="opencr_id">200</param>
    <param name="dxl_joints_profile_velocity">500</param>
    <param name="dxl_joints_profile_acceleration">100</param>
    <param name="dxl_gripper_profile_velocity">200</param>
    <param name="dxl_gripper_profile_acceleration">20</param>
  </hardware>
  <!-- 바퀴: 속도 명령 -->
  <joint name="wheel_left_joint">
    <command_interface name="velocity"/>
    <state_interface name="position"/>
    <state_interface name="velocity"/>
  </joint>
  <joint name="wheel_right_joint">
    <command_interface name="velocity"/>
    <state_interface name="position"/>
    <state_interface name="velocity"/>
  </joint>
  <!-- 팔: 위치 명령 + effort(★ fork) -->
  <joint name="joint1">
    <command_interface name="position"/>
    <state_interface name="position"/>
    <state_interface name="velocity"/>
    <state_interface name="effort"/>
  </joint>
  <joint name="joint2">
    <command_interface name="position"/>
    <state_interface name="position"/>
    <state_interface name="velocity"/>
    <state_interface name="effort"/>
  </joint>
  <joint name="joint3">
    <command_interface name="position"/>
    <state_interface name="position"/>
    <state_interface name="velocity"/>
    <state_interface name="effort"/>
  </joint>
  <joint name="joint4">
    <command_interface name="position"/>
    <state_interface name="position"/>
    <state_interface name="velocity"/>
    <state_interface name="effort"/>
  </joint>
  <!-- 그리퍼: 왼쪽만 명령, 오른쪽은 mimic이라 상태만 -->
  <joint name="gripper_left_joint">
    <command_interface name="position"/>
    <state_interface name="position"/>
    <state_interface name="velocity"/>
    <state_interface name="effort"/>
  </joint>
  <joint name="gripper_right_joint">
    <state_interface name="position"/>
    <state_interface name="velocity"/>
  </joint>
  <sensor name="imu">
    <state_interface name="orientation.x"/>
    <state_interface name="orientation.y"/>
    <state_interface name="orientation.z"/>
    <state_interface name="orientation.w"/>
    <state_interface name="angular_velocity.x"/>
    <state_interface name="angular_velocity.y"/>
    <state_interface name="angular_velocity.z"/>
    <state_interface name="linear_acceleration.x"/>
    <state_interface name="linear_acceleration.y"/>
    <state_interface name="linear_acceleration.z"/>
  </sensor>
  <sensor name="battery">
    <state_interface name="voltage"/>
    <state_interface name="percentage"/>
    <state_interface name="design_capacity"/>
    <state_interface name="present"/>
  </sensor>
</ros2_control>
${F}

- 장치를 바꾸거나 추가할 때는 controller_manager가 아니라 이 블록의 \`<plugin>\`·\`<param>\`을 바꾼다 (장치마다 블록 하나).
- \`gripper_right_joint\`에 명령이 없는 이유: URDF에서 mimic으로 왼쪽을 따라가게 해 두어 컨트롤러는 왼쪽만 잡는다.

### 진짜 controllers.yaml 예시 (6개, 체인 포함)

${F}yaml
controller_manager:
  ros__parameters:
    update_rate: 100
    joint_state_broadcaster:
      type: joint_state_broadcaster/JointStateBroadcaster
    imu_sensor_broadcaster:
      type: imu_sensor_broadcaster/IMUSensorBroadcaster
    diff_drive_controller:
      type: diff_drive_controller/DiffDriveController
    rl_arm_correction:
      type: cupbot_controllers/RlArmCorrection
    arm_controller:
      type: joint_trajectory_controller/JointTrajectoryController
    gripper_controller:
      type: position_controllers/GripperActionController

diff_drive_controller:
  ros__parameters:
    enable_odom_tf: false          # odom→base_link TF는 ekf가 발행
    joints: [wheel_left_joint, wheel_right_joint]

arm_controller:
  ros__parameters:
    joints: [joint1, joint2, joint3, joint4]
    command_joints: [rl_arm_correction/joint1, rl_arm_correction/joint2,
                     rl_arm_correction/joint3, rl_arm_correction/joint4]  # 체인: 하드웨어 대신 앞자리(reference)에 씀
    state_interfaces: [position, velocity]

gripper_controller:
  ros__parameters:
    joint: gripper_left_joint
${F}

### launch · 확인 (이 로봇 순서 그대로)

${F}python
Node(package='robot_state_publisher', executable='robot_state_publisher',
     parameters=[{'robot_description': urdf}]),
Node(package='controller_manager', executable='ros2_control_node',
     parameters=[controllers_yaml],
     remappings=[('~/cmd_vel', '/cmd_vel')]),
# 체인은 뒤(rl_arm_correction)를 먼저!
for c in ['joint_state_broadcaster', 'imu_sensor_broadcaster',
          'diff_drive_controller', 'rl_arm_correction',
          'arm_controller', 'gripper_controller']:
    Node(package='controller_manager', executable='spawner', arguments=[c]),
${F}

${F}bash
ros2 control list_hardware_interfaces   # joint2/effort 보이면 fork 성공
ros2 control list_controllers            # 6개 전부 active
ros2 control view_controller_chains      # arm_controller → rl_arm_correction 체인 확인
${F}

### 컨트롤러 6개

| 이름 | 타입 | 쓰기(command) | 읽기(state) |
| --- | --- | --- | --- |
| joint_state_broadcaster | joint_state_broadcaster/JointStateBroadcaster | — | 모든 관절 → /joint_states |
| imu_sensor_broadcaster | imu_sensor_broadcaster/IMUSensorBroadcaster | — | imu/* → /imu |
| diff_drive_controller | diff_drive_controller/DiffDriveController | wheel_*/velocity | wheel_*/position·velocity |
| rl_arm_correction 🛠️ | cupbot_controllers/RlArmCorrection (chainable) | joint1~4/position | joint1~4 position·velocity, gripper effort |
| arm_controller | joint_trajectory_controller/JointTrajectoryController | **rl_arm_correction/joint1~4/position** (체인) | joint1~4 position·velocity |
| gripper_controller | position_controllers/GripperActionController | gripper_left_joint/position | gripper_left_joint position |

- spawner 순서: joint_state_broadcaster → imu_sensor_broadcaster → diff_drive_controller → **rl_arm_correction → arm_controller** → gripper_controller.
- 공식 설정과 다른 점: diff_drive의 \`enable_odom_tf: false\`(odom TF는 ekf), 속도 명령은 TwistStamped, arm_controller의 \`command_joints\`를 체인으로.
- 전체 로봇 설계(노드·토픽·안전 체인)는 **실전노드설계** 탭, 각 컨트롤러 파라미터는 **파라미터** 탭 사전.
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
  { title: '1. read() — 하드웨어 플러그인', who: 'TurtleBot3ManipulationSystemHardware', text: 'controller_manager가 하드웨어 플러그인의 read()를 부른다. 플러그인이 OpenCR에서 SyncRead로 위치·속도·전류·IMU를 읽어 틱 → rad·A로 바꿔 state 변수에 넣는다.', vals: ['0.59', '0.31', '0.42', '2.70', '0.61', '0.64', '2.68'], hot: [0, 1, 2, 3], bus: '🔌 SyncRead ← OpenCR' },
  { title: '2-1. update() — arm_controller (JTC)', who: 'joint_trajectory_controller', text: 'JTC가 궤적을 보간해 이번 목표 0.62를 정한다. 체인이므로 하드웨어가 아니라 rl_arm_correction의 reference 변수에 쓴다.', vals: ['0.59', '0.31', '0.42', '2.70', '0.62', '0.64', '2.68'], hot: [4] },
  { title: '2-2. update() — rl_arm_correction', who: 'cupbot_controllers/RlArmCorrection', text: 'reference 0.62와 state(현재 0.59, 그리퍼 effort 0.42 → "컵 들고 있음")로 Δ +0.03을 계산해 command joint2/position = 0.65를 쓴다.', vals: ['0.59', '0.31', '0.42', '2.70', '0.62', '0.65', '2.68'], hot: [5] },
  { title: '2-3. update() — diff_drive_controller', who: 'diff_drive_controller', text: '최근 /cmd_vel (0.14 m/s, 0.35 rad/s)를 좌우 바퀴 속도로 바꿔 command에 쓴다. 왼쪽 = (0.14 − 0.35×0.1435)/0.033 ≈ 2.72 rad/s.', vals: ['0.59', '0.31', '0.42', '2.70', '0.62', '0.65', '2.72'], hot: [6] },
  { title: '2-4. update() — broadcaster들', who: 'joint_state_broadcaster · imu_sensor_broadcaster', text: 'state 변수를 읽어 /joint_states, /imu 토픽으로 발행한다 (변수는 바꾸지 않는다). arm_safety_monitor가 /joint_states의 effort를 본다.', vals: ['0.59', '0.31', '0.42', '2.70', '0.62', '0.65', '2.72'], hot: [0, 1, 2, 3] },
  { title: '3. write() — 하드웨어 플러그인', who: 'TurtleBot3ManipulationSystemHardware', text: 'controller_manager가 write()를 부른다. 플러그인이 command 변수(0.65 rad, 2.72 rad/s)를 틱으로 바꿔 SyncWrite로 OpenCR에 보낸다. 다음 주기까지 남은 시간은 쉰다.', vals: ['0.59', '0.31', '0.42', '2.70', '0.62', '0.65', '2.72'], hot: [5, 6], bus: '🔌 SyncWrite → OpenCR' },
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

    /** ?concept=ros2control&cs=섹션 — 클릭 push·뒤로가기·딥링크 */
    @subscribeSwcAppRouteChange('/ros2', { trigger: 'connectedDone' })
    onRoute(@swcAppRouteQueryParam('concept') concept: string | null, @swcAppRouteQueryParam('cs') cs: string | null) {
      if (concept !== 'ros2control') return;
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
      return { path: `/ros2?concept=ros2control&cs=${sec}`, scrollToTop: false };
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
        <div class="rc-secs">${ORDER.map(k => `<button class="rc-sec" data-sec="${k}">${SECTIONS[k].label}</button>`).join('')}</div>
        <div id="rc-body"></div>
      `;
    }
  }

  return tagName;
};
