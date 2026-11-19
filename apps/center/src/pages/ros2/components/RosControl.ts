import {
  addEventListener,
  elementDefine,
  onConnectedBodyShadow,
  subscribeSwcAppRouteChange,
  swcAppRouteGo,
  swcAppRouteQueryParam,
} from '@dooboostore/simple-web-component';
import { markdownParse } from '@center-src/utils/markdown';

const tagName = 'center-ros2-control';

type Sec = 'boot' | 'hw' | 'cycle' | 'fail';

const F = '```';

const CLS = `    classDef std fill:#c8e6c9,stroke:#2e7d32,color:#1b1b1b;
    classDef rl fill:#ffe0b2,stroke:#e65100,color:#1b1b1b;
    classDef hw fill:#fff9c4,stroke:#f9a825,color:#1b1b1b;
    classDef mine fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e;
    classDef ext fill:#ffffff,stroke:#8A97A0,stroke-dasharray:4 3,color:#475569;`;

// lv2_module6 소스 기준으로 다시 쓰는 중 (이전 10개 섹션은 git 4dbcadef 에 있음)
// 경로는 모두 lv2_module6/ 아래 · 기준 bee_bot_v2 develop bcac613f. ✅ 이 저장소 · ✅ upstream 공식 소스 · ⚪ 미확인
const SECTIONS: Record<Sec, { label: string; md: string }> = {
  boot: {
    label: '① 부팅 순서',
    md: `
## 부팅 순서 — URDF에서 하드웨어까지

> \`ros2 launch bringup bringup.launch.py\`를 켰을 때 **어떤 노드가 뜨고, 무엇을 읽고, 무엇을 올리는지**를 순서대로 따라간다.
> ✅ = 이 저장소 소스에서 확인한 것 · ✅ upstream = 공식 소스(ros2_control master · robot_state_publisher rolling)에서 확인한 것 · ⚪ = 일반 동작이라 아직 소스로 확인하지 못한 것.
> 기준 소스: \`bee_bot_v2\` develop (\`bcac613f\`, 2026-11-19). 줄 번호는 이 버전 기준이고, upstream 줄 번호는 설치된 Lyrical 버전과 조금 다를 수 있다.

> **도식 표시** &nbsp; 📦 제공 · 🛠️ 직접 작성 &nbsp;|&nbsp; 박스 이름 — **프로세스(노드) 박스**: 첫 줄 \`패키지::실행 파일\`(= launch의 \`package=\` · \`executable=\`), 둘째 줄 \`노드 /이름\` · **플러그인·객체 박스**(하드웨어 · 컨트롤러 · ResourceManager): \`C++ 네임스페이스::클래스\`라고 "클래스"를 붙여 씀 &nbsp;|&nbsp; ✉️ 토픽 · 📞 서비스 · 🔌 시리얼 · 🔗 같은 프로세스 메모리(칸) — 토픽도 파일도 아님 · 🔗 원통 모양 = 메모리 속 칸 · 📄 원통 = 진짜 파일 · 📄 파일 &nbsp;|&nbsp; 초록=제공 · 파랑=직접 · 주황=칸 · 노랑=장치 &nbsp;|&nbsp; 화살표 숫자 = 아래 단계 번호 · 노드에 마우스를 올리면 설명

${F}mermaid
flowchart TB
    BU["🛠️ bringup<br/>bringup.launch.py"]
    UF[("📄 urdf/default/urdf.xacro<br/>ros2_control 블록 포함")]
    YF[("📄 ros_system/config<br/>controllers.yaml")]
    subgraph RS["🛠️ launch 파일 ros_system.launch.py — 띄우는 노드 중 ros2_control 관련만"]
        direction TB
        XA["⚙️ xacro<br/>urdf.xacro → URDF 문자열"]
        subgraph P1["📦 robot_state_publisher::robot_state_publisher<br/>노드 /robot_state_publisher · 조건 use_ros2_control"]
            RSP["URDF 읽기<br/>관절값 → TF 계산"]
        end
        subgraph P2["📦 controller_manager::ros2_control_node<br/>노드 /controller_manager · 조건 use_ros2_control"]
            direction TB
            CM["⏱ 제어 루프 스레드 cm_thread<br/>ros2_control_node.cpp main() 안<br/>100Hz: cm->read → update → write"]
            subgraph RM["📦 클래스 hardware_interface::ResourceManager<br/>노드 아님 · ControllerManager가 가진 객체"]
                direction TB
                HW["🛠️ 클래스 control::BeebotSystemHardware<br/>하드웨어 플러그인<br/>on_init → on_configure → on_activate<br/>set_state(키) · get_command(키)"]
                SST[("🔗 state 칸 34개 — 키 → 칸 · 공유<br/>wheel_left · right_joint/position · velocity · effort<br/>joint1~5/position · velocity · effort<br/>gripper_left_joint/position · velocity · effort<br/>imu/orientation.xyzw · angular_velocity.xyz · linear_acceleration.xyz")]
                SCM[("🔗 command 칸 9개 — 키 → 칸 · 독점<br/>wheel_left_joint/velocity · wheel_right_joint/velocity<br/>joint1~5/position<br/>gripper_left_joint/position · gripper_left_joint/effort")]
                SREF[("🔗 reference 칸 5개 — rl_arm_correction이 내놓음<br/>rl_arm_correction/joint1~5/position")]
            end
            subgraph CTRL["컨트롤러 6개 — ①~⑥ = spawner가 올리는 순서 · 각자 요청한 키로 칸을 빌림"]
                direction TB
                JSB["📦 ① joint_state_broadcaster<br/>읽는 키: 관절 state 키<br/>→ ✉️ /joint_states"]
                IMU["📦 ② imu_sensor_broadcaster<br/>읽는 키: imu/*<br/>→ ✉️ /imu"]
                DD["📦 ③ diff_drive_controller<br/>쓰는 키: wheel_left · right_joint/velocity<br/>✉️ /cmd_vel → · → ✉️ /odom"]
                GR["📦 ④ gripper_controller<br/>쓰는 키: gripper_left_joint/position · /effort<br/>🎬 gripper_cmd"]
                RLA["🛠️ ⑤ rl_arm_correction<br/>클래스 ml::RlArmCorrection (컨트롤러 플러그인)<br/>쓰는 키: joint1~5/position<br/>읽는 키: joint1~5 position · velocity · effort + gripper<br/>내놓는 키: rl_arm_correction/joint1~5/position"]
                ARM["📦 ⑥ joint_trajectory_controller<br/>arm_controller<br/>쓰는 키: rl_arm_correction/joint1~5/position<br/>읽는 키: joint1~5 position · velocity<br/>🎬 follow_joint_trajectory"]
            end
        end
        SP["📦 controller_manager::spawner<br/>노드 /spawner_joint_state_broadcaster<br/>arguments = CONTROLLERS 6개<br/>조건 use_ros2_control · 일을 마치면 종료"]
        MG["📦 moveit_ros_move_group::move_group<br/>노드 /move_group · 조건 use_moveit"]
    end
    DEV{{"🔌 OpenCR<br/>USB 시리얼 · S 줄 · C 줄"}}
    BU -->|"0 include"| XA
    UF -->|"1 📄 읽음"| XA
    XA -->|"2 URDF 문자열"| RSP
    RSP ==>|"2 ✉️ /robot_description"| CM
    YF -->|"3 📄 update_rate · 컨트롤러 type"| CM
    CM -->|"3 plugin 이름으로 로드"| HW
    CM -.->|"⏱ 10ms마다 read() · write() 호출"| HW
    HW ==>|"🔗 set_state(키) — S 줄 값으로 채움"| SST
    SCM ==>|"🔗 get_command(키) → C 줄"| HW
    HW <==>|"3 🔌 read S줄 · write C줄"| DEV
    YF -->|"4 📄 컨트롤러별 파라미터"| SP
    SP ==>|"4 📞 load · configure · switch"| CM
    CM -->|"4 객체 생성 · 활성화 · 요청 키로 claim"| CTRL
    SST -.->|"관절 state 키"| JSB
    SST -.->|"imu/* 키"| IMU
    DD ==>|"wheel_*_joint/velocity"| SCM
    GR ==>|"gripper_left_joint/position · effort"| SCM
    SST -.->|"joint1~5 · gripper 키"| RLA
    RLA ==>|"joint1~5/position = ref + Δ"| SCM
    RLA -->|"5 내놓음 rl_arm_correction/joint*/position"| SREF
    ARM ==>|"5 체인: rl_arm_correction/joint*/position 에 씀"| SREF
    SREF ==>|"reference 읽음"| RLA
    SST -.->|"joint1~5 position · velocity"| ARM
    JSB -.->|"✉️ /joint_states"| RSP
    SP -.->|"6 끝나면 기동"| MG
    %% tip BU: bringup | use_ros_system:=true(기본)이면 ros_system.launch.py를 포함한다. 직접 짠 launch다. (bringup.launch.py:316)
    %% tip UF: URDF xacro | 로봇 모양(링크·관절)과 함께 ros2_control name=BeebotSystem 블록이 들어 있다. 하드웨어 플러그인 이름 · 관절별 칸 목록 · 파라미터(mock · port …)가 여기 적힌다. (urdf.xacro:1039)
    %% tip YF: controllers.yaml | controller_manager 항목에 update_rate 100 · 컨트롤러별 type, 그 아래에 컨트롤러별 파라미터가 있다. ros2_control_node와 spawner가 둘 다 읽는다.
    %% tip XA: xacro | launch가 xacro 명령을 실행해 URDF 문자열(robot_description)을 만든다. mock_hardware:=true면 가짜 하드웨어로 돈다. (ros_system.launch.py:64,167)
    %% tip RSP: 노드 /robot_state_publisher (클래스 robot_state_publisher::RobotStatePublisher, robot_state_publisher.cpp:100) | URDF를 파라미터로 받아 /robot_description 토픽으로 발행하고, /joint_states로 TF를 계산한다. controller_manager는 URDF를 이 토픽에서 받는다. (ros_system.launch.py:227)
    %% tip CM: 제어 루프 스레드 (ros2_control 공식 controller_manager/src/ros2_control_node.cpp:98~176) | main()이 std::thread cm_thread를 따로 만들어 while 루프에서 cm->read · cm->update · cm->write를 부르고 1/update_rate만큼 쉰다(:156~158). 그동안 main 스레드는 executor->spin()으로 서비스 · 토픽을 처리한다(:180~181). 우리 저장소가 정하는 것은 주기 update_rate: 100(controllers.yaml)뿐이다. 노드 /controller_manager는 클래스 controller_manager::ControllerManager 객체다. 이 클래스가 rclcpp::Node를 상속하므로 객체가 곧 노드다(controller_manager.hpp:71). 프로세스는 이 객체 하나를 만들고(ros2_control_node.cpp:61) update_rate(100Hz)마다 read → 컨트롤러 update → write를 부른다(:156~158). 하드웨어 칸은 안에 가진 ResourceManager가 관리한다(controller_manager.hpp:351). (ros2_control 공식 소스)
    %% tip RM: hardware_interface::ResourceManager | 패키지 hardware_interface의 C++ 클래스. 노드가 아니다. ControllerManager가 멤버로 가지고 있고, URDF의 ros2_control 블록대로 하드웨어 플러그인을 올리고 칸(state · command)을 관리한다. (ros2_control 공식 resource_manager.hpp:58)
    %% tip HW: BeebotSystemHardware | URDF의 ros2_control 블록 하나 = 이 컴포넌트 하나. on_init(파라미터·관절 검사) → on_configure(포트 열기 · 서비스) → on_activate(첫 S 줄을 기다려 명령을 현재값으로). (beebot_system_hardware.cpp:46,81,132)
    %% tip SST: state 칸 | 키 = 관절/종류. 하드웨어가 read()에서 set_state(키, 값)로 채우고, 컨트롤러는 요청한 키로 빌려 읽는다. 여럿이 동시에 빌릴 수 있다(공유). 전부 /controller_manager 프로세스 메모리다. (urdf.xacro:1039~1119)
    %% tip SCM: command 칸 | 키 하나를 한 컨트롤러만 빌릴 수 있다(독점, resource_manager.cpp:1871~1886). 바퀴는 diff_drive_controller, joint1~5는 rl_arm_correction, 그리퍼는 gripper_controller가 빌린다. 하드웨어가 write()에서 get_command(키)로 꺼내 C 줄로 보낸다.
    %% tip SREF: reference 칸 | 하드웨어 칸이 아니라 체인 컨트롤러 rl_arm_correction이 내놓은 칸. configure 때 ResourceManager 장부에 등록되고(controller_manager.cpp:1741) 활성화되면 빌릴 수 있게 열린다(:2677). arm_controller가 이 키로 빌려 쓴다. (ros2_control 공식 소스 · rl_arm_correction.cpp:185)
    %% tip JSB: joint_state_broadcaster | 칸의 state를 읽어 /joint_states 토픽으로 낸다. 가장 먼저 올라간다. robot_state_publisher는 이 값으로 움직이는 관절(바퀴·팔·그리퍼)의 TF를 계산한다.
    %% tip IMU: imu_sensor_broadcaster | URDF의 imu 센서 칸을 읽어 /imu로 낸다. 공분산은 controllers.yaml에 적는다.
    %% tip DD: diff_drive_controller | /cmd_vel을 받아 바퀴 두 개의 velocity command로 바꾸고, 바퀴 state로 /odom을 만든다. odom→base_footprint TF는 EKF가 내므로 끈다.
    %% tip GR: gripper_controller | 액션 /gripper_controller/gripper_cmd. 손가락 position과 쥐는 힘(effort) 칸을 쓴다.
    %% tip RLA: rl_arm_correction | 노드가 아니라 컨트롤러 플러그인. arm_controller가 쓴 reference에 학습 정책의 보정을 더해 하드웨어 command로 쓴다. ChainableController. (ml/rl_arm_correction.xml)
    %% tip ARM: arm_controller | joint_trajectory_controller. command_joints가 하드웨어가 아니라 rl_arm_correction/joint1~5여서 하드웨어에 직접 쓰지 않는다.
    %% tip SP: 노드 /spawner_joint_state_broadcaster (파이썬 스크립트 · 클래스 없이 rclpy Node 하나, spawner.py:443) | CONTROLLERS 목록을 순서대로 load → configure → activate. 하나가 실패하면 거기서 멈추므로 실패하기 쉬운 팔 체인을 맨 뒤에 둔다. (ros_system.launch.py:45)
    %% tip MG: 노드 /move_group (클래스 move_group::MoveGroupExe, move_group.cpp:328) | spawner가 끝난 뒤에 띄운다. 동시에 띄우면 컨트롤러 로드와 경쟁이 나서 spawner가 FATAL이었다. (ros_system.launch.py:235)
    %% tip DEV: OpenCR | 하드웨어 플러그인만 안다. read()는 시리얼에서 S 줄을 읽어 state를 채우고, write()는 command를 C 줄로 보낸다.
    %% tip CM>HW: 플러그인 로드 | URDF의 plugin 이름(control/BeebotSystemHardware)을 control_plugins.xml에서 찾아 .so를 연다. pluginlib가 실제로 여는 동작은 이 저장소 코드로는 확인하지 못했다.
    %% tip SP>CM: 서비스 | 컨트롤러 하나당 load_controller → configure_controller → switch_controllers 서비스를 부른다. (ros2_control 공식 spawner.py:504,541,558)
    %% tip ARM>RLA: 체인 | arm_controller가 하드웨어 대신 rl_arm_correction의 reference 칸에 쓴다. 그래서 spawn은 뒤에서부터(rl_arm_correction이 먼저)다.
${CLS}
    class BU,HW,RLA mine;
    class XA,RSP,CM,JSB,IMU,DD,GR,ARM,SP,MG std;
    class SST,SCM,SREF rl;
    class DEV hw;
    class UF,YF ext;
    style RS fill:#f8fafc,stroke:#94a3b8
    style P1 fill:#ffffff,stroke:#94a3b8
    style P2 fill:#ffffff,stroke:#94a3b8
    style RM fill:#fffbeb,stroke:#f59e0b
    style CTRL fill:#f0fdf4,stroke:#86efac
${F}

### 0. 시작 — launch가 ros_system을 포함한다

- \`use_ros_system:=true\`(기본)이면 \`ros_system.launch.py\`가 실행된다. ✅ \`ros2_ws/src/bringup/launch/bringup.launch.py:316\`
- \`ros_system\`은 📦 제공 패키지를 묶은 launch이고, 컨트롤러·카메라·Nav2 같은 것들이 여기서 뜬다.

### 1. URDF 문자열을 만든다 — xacro

- launch가 \`xacro urdf/default/urdf.xacro mesh_uri:=... mock_hardware:=...\`를 실행하고 그 결과를 \`robot_description\`으로 쓴다. ✅ \`ros_system/launch/ros_system.launch.py:64,167\`
- 이 URDF 안에는 로봇 모양(링크·관절)뿐 아니라 **\`<ros2_control name="BeebotSystem" type="system">\` 블록**이 들어 있다. ✅ \`urdf/default/urdf.xacro:1039\`
- \`mock_hardware:=true\`면 실기 없이 명령을 상태로 되돌리는 가짜 하드웨어로 돈다.

### 2-0. launch 파일은 노드가 아니다 — \`Node(...)\`는 "이 프로그램을 띄워라"는 지시

\`ros_system.launch.py\`는 ROS 노드가 아니라 **띄우는 지시서**(파이썬 스크립트)다. 안에 \`Node(...)\`를 여러 개 적어 두면 launch 시스템이 하나씩 **프로세스로 실행**하고, 그 프로세스가 ROS 노드가 된다. 같은 파일에 인자 선언 · 조건 · 이벤트 처리기도 들어 있다.

\`spawner\`를 띄우는 부분을 그대로 옮기면 이렇다. ✅ \`ros_system.launch.py:116~126\`

${F}python
return Node(
    package='controller_manager', executable='spawner', output='screen',
    condition=IfCondition(LaunchConfiguration('use_ros2_control')),
    arguments=CONTROLLERS + [ '--controller-manager', '/controller_manager', ... ])
${F}

| 적힌 것 | 무엇인가 | 뜻 |
|---|---|---|
| \`Node(...)\` | launch **액션** (노드가 아님) | 프로그램 하나를 프로세스로 실행하라는 지시 |
| \`package='controller_manager'\` | 패키지 | 어느 패키지에 설치된 프로그램인가 |
| \`executable='spawner'\` | 실행 파일 | 그 패키지 안의 어떤 프로그램인가. \`ros2 run controller_manager spawner\`와 같은 대상 |
| \`arguments=CONTROLLERS + [...]\` | 명령줄 인자 | 실행 파일에 넘기는 값. 컨트롤러 이름 6개와 \`--controller-manager /controller_manager\` 등 |
| \`output='screen'\` | 옵션 | 로그를 터미널에 출력 |
| \`condition=IfCondition(...)\` | launch **조건** (노드가 아님) | launch 시스템이 띄우기 **전에** 평가한다. 참일 때만 이 \`Node\`를 실행하고, 거짓이면 이 프로세스는 아예 뜨지 않는다 |
| \`LaunchConfiguration('use_ros2_control')\` | launch **인자** 값 | \`ros2 launch … use_ros2_control:=false\`처럼 밖에서 주는 값. 선언은 \`flag('use_ros2_control', 'true', …)\`라 **기본 true** ✅ \`:177\` |
| \`name=\` | (없음) | 안 주면 그 프로그램 코드에 정해진 기본 노드 이름을 쓴다 (예: \`ros2_control_node\` → \`controller_manager\`) |

${F}mermaid
flowchart TB
    ARG[("📄 launch 인자 use_ros2_control<br/>기본 true")]
    subgraph LF["🛠️ 패키지 ros_system · launch 파일 ros_system.launch.py — 노드가 아니라 '띄우는 지시서'"]
        direction TB
        C{{"조건 IfCondition<br/>use_ros2_control 이 true ?"}}
        N1["Node<br/>package=robot_state_publisher<br/>executable=robot_state_publisher"]
        N2["Node<br/>package=controller_manager<br/>executable=ros2_control_node<br/>parameters=controllers.yaml"]
        N3["Node<br/>package=controller_manager<br/>executable=spawner<br/>arguments=컨트롤러 6개 + 옵션"]
        EV["RegisterEventHandler<br/>OnProcessExit(spawner)"]
        N4["Node + 조건 use_moveit<br/>package=moveit_ros_move_group<br/>executable=move_group"]
    end
    P1["⚙️ 프로세스 → 📦 노드<br/>/robot_state_publisher"]
    P2["⚙️ 프로세스 → 📦 노드<br/>/controller_manager"]
    P3["⚙️ 프로세스 → 📦 노드<br/>/spawner_joint_state_broadcaster<br/>일을 마치면 종료"]
    P4["⚙️ 프로세스 → 📦 노드<br/>/move_group"]
    ARG -->|"값을 읽음"| C
    C ==>|"true 일 때만"| N1
    C ==>|"true 일 때만"| N2
    C ==>|"true 일 때만"| N3
    N1 -->|"실행"| P1
    N2 -->|"실행"| P2
    N3 -->|"실행"| P3
    P3 -.->|"종료되면"| EV
    EV -->|"그 다음에 실행"| N4
    N4 -->|"실행"| P4
    %% tip ARG: use_ros2_control | DeclareLaunchArgument로 선언된 launch 인자. 기본 true. mapping/replay.launch.py는 bag 재생이라 false로 넘긴다. (ros_system.launch.py:177, mapping/replay.launch.py:47)
    %% tip C: 조건 | 변수 ros2_control = IfCondition(LaunchConfiguration use_ros2_control)로 한 번 만들어 robot_state_publisher와 ros2_control_node에 condition으로 붙이고, spawner에는 같은 식을 직접 적는다. false면 셋 다 안 뜬다. (:172, :118, :226, :230)
    %% tip N3: spawner Node | arguments의 CONTROLLERS가 컨트롤러 이름 6개다. (:45, :116)
    %% tip EV: 이벤트 처리기 | spawner 프로세스가 끝나는 것을 감지해 그 다음에 move_group을 띄운다. 동시에 띄우면 컨트롤러 로드와 경쟁이 나서 spawner가 FATAL이었다. (:235)
    %% tip N4: move_group | 자기 조건이 따로 있다: IfCondition(use_moveit). ros_system 기본은 false지만 bringup이 true로 넘긴다. (:150, :220, bringup.launch.py:134)
    %% tip P3: spawner 프로세스 | 안에서 rclpy 노드 spawner_첫컨트롤러이름을 만들고, load_controller → configure_controller → switch_controllers 서비스를 부른 뒤 종료한다. --unload-on-kill이 없으면 상주하지 않는다. (ros2_control 공식 spawner.py:403,443,504,541,558,605)
${CLS}
    class N1,N2,N3,N4,EV,C,P1,P2,P3,P4 std;
    class ARG ext;
    style LF fill:#f8fafc,stroke:#94a3b8
${F}

- **조건이 노드는 아니다.** \`IfCondition\`은 "이 \`Node\`를 띄울까 말까"를 정하는 launch 시스템의 기능이다. 로봇이 돌 때 \`ros2 node list\`에는 나오지 않는다.
- 같은 조건이 \`robot_state_publisher\`(\`:226\`) · \`ros2_control_node\`(\`:230\`) · \`spawner\`(\`:118\`) **셋 모두**에 걸려 있다. \`use_ros2_control:=false\`면 URDF 발행 · 하드웨어 · 컨트롤러가 통째로 빠진다. 예: bag을 재생하는 \`mapping/replay.launch.py\`가 이렇게 쓴다. ✅ \`:47\`
- \`spawner\`는 **상주 노드가 아니라 일을 하고 끝나는 프로세스**다. 그래서 "끝났을 때"를 신호로 다음(\`move_group\`)을 띄울 수 있다(\`OnProcessExit\`).

### 2. ros2_control 관련 노드 3개가 거의 동시에 뜬다

> \`ros_system.launch.py\`는 이 셋 말고도 \`twist_mux\` · 카메라 · EKF · SLAM · Nav2 등을 함께 띄운다. 여기서는 ros2_control에 관계된 셋만 본다.

| 패키지::실행 파일 | 노드 이름 | 무엇을 읽나 | 하는 일 |
|---|---|---|---|
| 📦 \`robot_state_publisher::robot_state_publisher\` | \`/robot_state_publisher\` ✅ upstream \`robot_state_publisher.cpp:101\` | URDF 문자열 (파라미터) | \`/robot_description\` 토픽 발행 · 관절값으로 TF 계산 |
| 📦 \`controller_manager::ros2_control_node\` | \`/controller_manager\` ✅ upstream \`ros2_control_node.cpp:46\` | \`controllers.yaml\` 파일 · URDF (토픽) | 하드웨어 플러그인을 올리고 100Hz 루프를 돈다 |
| 📦 \`controller_manager::spawner\` | \`/spawner_joint_state_broadcaster\` — 첫 컨트롤러 이름이 붙는다 ✅ upstream \`spawner.py:403,443\` | \`controllers.yaml\` · 컨트롤러 목록 | 컨트롤러 6개를 순서대로 올린다 |

- ✅ \`ros_system.launch.py:225~233\`. 셋 다 launch에서 \`Node(package=…, executable=…)\`로 띄운다. 노드 이름(\`name=\`)을 따로 주지 않으므로, 각 프로그램 코드에 정해진 기본 이름이 노드 이름이 된다.
- \`ros2_control_node\`의 노드 이름이 \`/controller_manager\`인 근거: spawner에 \`--controller-manager /controller_manager\`를 넘긴다. ✅ \`:120\`
- launch 주석에 "controller_manager는 \`/robot_description\` 토픽(robot_state_publisher)에서 URDF를 받는다"고 적혀 있다. ✅ \`:227\` · controller_manager가 이 토픽을 구독하는 코드 ✅ upstream \`controller_manager.cpp:781\`
- \`ros2_control_node\`에는 URDF 파라미터를 주지 않는다(\`controllers.yaml\`과 \`rl_arm_correction.type\`만). ✅ \`:231~232\`
- 세 노드 모두 제공 패키지라 직접 짠 코드가 아니다. 직접 짠 것은 \`controller_manager\`가 로드하는 플러그인(\`control::BeebotSystemHardware\`, \`ml::RlArmCorrection\`)이다.
- 4번째 노드 \`moveit_ros_move_group\` 패키지의 \`move_group\`은 6단계에서 spawner 뒤에 뜬다.

### 3. controller_manager가 하드웨어를 올린다 — URDF → 플러그인

1. \`controllers.yaml\`의 \`controller_manager\` 항목에서 \`update_rate: 100\`, \`enforce_command_limits: false\`, 컨트롤러별 \`type\`을 읽는다. ✅ \`ros_system/config/controllers.yaml\`
2. URDF의 \`<ros2_control>\` 블록을 파싱한다. \`<hardware><plugin>control/BeebotSystemHardware</plugin>\`이 **로드할 클래스 이름**이다. ✅ \`urdf.xacro:1041\`
3. 그 이름을 \`control_plugins.xml\`에서 찾아 \`libbeebot_system_hardware.so\`를 로드한다.
   - 이름 ↔ 라이브러리 매핑은 CMake의 \`pluginlib_export_plugin_description_file(hardware_interface control_plugins.xml)\`로 등록된다. ✅ \`control/CMakeLists.txt:63\`, \`control/control_plugins.xml\`
   - pluginlib이 이 xml을 어떻게 찾는지는 5단계 "xml 파일 위치는 어떻게 아나"에 정리 (같은 방식, 카테고리만 \`hardware_interface\`). ✅ upstream
4. 칸(인터페이스) 목록은 \`<joint>\` · \`<sensor>\` 안의 \`<command_interface>\` · \`<state_interface>\`에서 만들어진다. \`BeebotSystemHardware\`는 \`export_state_interfaces\` 같은 함수를 재정의하지 않으므로 URDF 목록이 그대로 칸이 된다. ✅ \`control/include/control/beebot_system_hardware.hpp\` · 이 로봇은 관절 8개 + 센서(imu) 1개다. ✅ \`urdf.xacro:1039~1119\`
5. 하드웨어 플러그인의 생명주기가 차례로 불린다.

| 단계 | 하는 일 (BeebotSystemHardware) | 위치 |
|---|---|---|
| \`on_init\` | \`<hardware><param>\`(mock · port · twist_state …)을 읽는다 · URDF에 바퀴·팔 관절이 프로토콜 순서대로 있는지 검사(없으면 시작 안 함) · 관절별 \`offset\` 읽기 | \`beebot_system_hardware.cpp:46\` |
| \`on_configure\` | 상태를 0으로 채움 · 진단 · \`/motor_status\` 발행 · 서비스 \`~/reboot_motors\`, \`~/set_arm_torque\` · \`/cmd/beep\` 구독 · **시리얼 포트 열기** | \`:81\` |
| \`on_activate\` | OpenCR의 첫 \`S\` 줄을 최대 10초 기다림 → 받으면 명령값을 현재 상태로 맞춤(팔이 0rad로 튀는 것 방지) | \`:132\` |
| \`read()\` | 시리얼에서 \`S\` 줄을 읽어 상태 칸을 채움 | \`:173\` → \`read_serial\` |
| \`write()\` | 명령 칸을 \`C\` 줄로 만들어 시리얼로 보냄 | \`:177\` → \`write_serial\` |

6. 활성화되면 **100Hz로 \`read()\` → 컨트롤러 \`update()\` → \`write()\`** 를 반복한다. 이 루프는 우리 코드가 아니라 제공 패키지 \`controller_manager\`의 \`src/ros2_control_node.cpp\` \`main()\` 안에 있다. 우리가 정하는 것은 주기 \`update_rate: 100\`(\`controllers.yaml\`)뿐이다. ✅ upstream \`ros2_control_node.cpp:98~181\`

${F}cpp
// controller_manager/src/ros2_control_node.cpp — main() (발췌)
std::thread cm_thread([cm, ...]() {                       // ① 제어 루프 전용 스레드
  state.period = std::chrono::nanoseconds(1'000'000'000 / cm->get_update_rate());   // 100Hz → 10ms
  while (rclcpp::ok()) {
    cm->read  (now, measured_period);   // 하드웨어 read()   → BeebotSystemHardware::read  → S 줄
    cm->update(now, measured_period);   // 활성 컨트롤러 update() (체인 순서)
    cm->write (now, measured_period);   // 하드웨어 write()  → BeebotSystemHardware::write → C 줄
    // 다음 주기까지 대기
  }
});
executor->add_node(cm);   // ② main 스레드: 노드 /controller_manager의 서비스 · 토픽 처리
executor->spin();         //    (spawner의 load · configure · switch, /robot_description 구독 등)
${F}

| 스레드 | 하는 일 | 위치 |
|---|---|---|
| \`cm_thread\` (제어 루프) | 10ms마다 \`read → update → write\` — 하드웨어 플러그인과 컨트롤러를 부른다 | \`:98~176\` |
| main (\`executor->spin()\`) | 노드 \`/controller_manager\`의 서비스 · 토픽 처리 — spawner 요청 · URDF 수신 | \`:180~181\` |

> 코드 주석에 따르면 controller_manager는 configure → activate를 \`read()\` 없이 바로 한다. 그래서 \`on_activate\`가 직접 \`S\` 줄을 먼저 받아 와야 상태가 0이 아니다. ✅ \`:134\`

### 4. \`controller_manager\` 패키지의 \`spawner\`가 컨트롤러 6개를 순서대로 올린다

컨트롤러는 노드가 아니라 **플러그인**이다. 이름 = 인스턴스 이름, 오른쪽 = \`controllers.yaml\`의 \`type\`(패키지/클래스). ✅ \`controllers.yaml\`

${F}text
① joint_state_broadcaster   joint_state_broadcaster/JointStateBroadcaster
② imu_sensor_broadcaster    imu_sensor_broadcaster/IMUSensorBroadcaster
③ diff_drive_controller     diff_drive_controller/DiffDriveController
④ gripper_controller        parallel_gripper_action_controller/GripperActionController
⑤ rl_arm_correction  🛠️     ml/RlArmCorrection
⑥ arm_controller            joint_trajectory_controller/JointTrajectoryController
${F}

**왜 이 순서인가** — 순서는 launch 파일의 \`CONTROLLERS\` 목록 그대로이고, 이유가 주석에 적혀 있다. ✅ \`ros_system.launch.py:43~47\`

${F}python
# spawner 하나가 순서대로 켜고, 하나가 실패하면 거기서 멈춘다 → 실패하기 쉬운 팔 체인(관절이 URDF 한계 밖이면
# rl_arm_correction 예외)을 맨 뒤에 — 그래야 팔이 안 떠도 바퀴·그리퍼는 뜬다 (2026-11-02 실기: 그리퍼가 안 열림)
CONTROLLERS = ['joint_state_broadcaster', 'imu_sensor_broadcaster', 'diff_drive_controller',
               'gripper_controller',
               'rl_arm_correction', 'arm_controller']  # 체인은 뒤에서부터 (rl_arm_correction → arm_controller)
${F}

이 순서에는 이유가 두 가지 들어 있다.

1. **실패를 뒤로 몰기** — spawner는 컨트롤러를 **하나씩** load → configure → activate 하다가, 어느 단계든 실패하면 그 자리에서 \`return 1\`로 **종료**한다. 그 뒤의 컨트롤러는 아예 안 켜진다. ✅ upstream \`spawner.py:519,552,572\`
   - 팔 체인(⑤⑥)은 관절이 URDF 한계 밖에 있으면(손으로 옮김 · 처짐) 켜질 때 실패하기 쉽다. 그래서 **맨 뒤**에 두어, 팔이 실패해도 앞의 바퀴(③) · 그리퍼(④)는 이미 켜져 있게 한다. ✅ 주석 \`:43~44\`
   - 기록: "2026-11-02 실기: 그리퍼가 안 열림" — 팔 체인이 그리퍼보다 앞에 있을 때 팔이 실패해 그리퍼가 안 켜졌던 것으로 보인다 (추정 · 주석에는 결과만 적혀 있음).
2. **체인은 뒤에서부터** — ⑥ arm_controller(앞)는 ⑤ rl_arm_correction(뒤)이 내놓은 reference 칸에 쓴다. 앞 컨트롤러를 켤 때 뒤 컨트롤러가 이미 켜져 있어야 하므로 ⑤ → ⑥ 순서다. ✅ 주석 \`:47\` · ✅ upstream \`controller_manager.cpp:3938\`

${F}mermaid
flowchart LR
    S(["📦 controller_manager::spawner 시작<br/>노드 /spawner_joint_state_broadcaster"])
    C1["① joint_state_broadcaster"]
    C2["② imu_sensor_broadcaster"]
    C3["③ diff_drive_controller<br/>바퀴"]
    C4["④ gripper_controller<br/>그리퍼"]
    C5["🛠️ ⑤ rl_arm_correction<br/>팔 체인 · 뒤(following)"]
    C6["⑥ arm_controller<br/>팔 체인 · 앞(preceding)"]
    OK(["종료 0<br/>6개 모두 켜짐"])
    X(["return 1 → 종료<br/>⑤ ⑥ 안 켜짐<br/>①~④는 이미 켜져 있음"])
    S --> C1 --> C2 --> C3 --> C4 --> C5 --> C6 --> OK
    C5 -.->|"실패: 관절이 URDF 한계 밖 등"| X
    C6 -.->|"실패"| X
    %% tip S: spawner | 컨트롤러마다 load_controller → configure_controller → switch_controllers(activate)를 차례로 부른다. 하나라도 실패하면 return 1로 끝나고 나머지는 시도하지 않는다. (ros2_control 공식 spawner.py:519,552,572)
    %% tip C4: gripper_controller | 팔 체인보다 앞에 있으므로, 팔이 실패해도 이미 켜져 있다. 2026-11-02 실기에서 그리퍼가 안 열렸던 일이 이 순서의 계기다. (ros_system.launch.py:44)
    %% tip C5: rl_arm_correction | 체인의 뒤 컨트롤러. reference 칸을 내놓으므로 ⑥보다 먼저 켜져 있어야 한다. 관절이 한계 밖이면 예외가 나기 쉬워 맨 뒤 묶음에 있다.
    %% tip C6: arm_controller | 체인의 앞 컨트롤러. ⑤의 reference 칸에 쓰므로 ⑤ 다음에 켠다.
    %% tip X: 실패 시 | spawner 프로세스가 끝나므로 OnProcessExit가 불려 move_group은 그래도 뜬다(launch는 종료 코드와 상관없이 프로세스 종료를 이벤트로 받는다 — 일반 동작 ⚪).
${CLS}
    class C1,C2,C3,C4,C6 std;
    class C5 mine;
    class S,OK std;
    class X rl;
${F}

- 관련 설정: \`controllers.yaml\`의 \`enforce_command_limits: false\`도 같은 사고(2026-11-02, joint2 −120°)에서 나왔다. 켜 두면 관절이 이미 한계 밖일 때 예외로 팔 체인이 안 켜져, 되돌리는 명령조차 못 보냈다. ✅ \`controllers.yaml\` 주석
- spawner는 컨트롤러별 파라미터(\`--param-file controllers.yaml\`)와 리매핑(\`~/cmd_vel→/cmd_vel\`, \`~/odom→/odom\`, \`~/imu→/imu\`)을 각 컨트롤러에 넘긴다. ✅ \`:112~126\`
  - \`controller_manager\` 패키지의 \`ros2_control_node\`에 준 파일·리매핑은 그 노드(\`/controller_manager\`) **자신**에게만 적용되기 때문이다. ✅ 주석 \`:114\`
- 컨트롤러 하나당 \`load_controller\` → \`configure_controller\` → \`switch_controllers\`(activate) 서비스를 부르고, \`--unload-on-kill\`이 없으면 끝나고 종료한다. ✅ upstream \`spawner.py:504,541,558,605\`

### 5. 체인으로 엮인다 — arm_controller → rl_arm_correction → 하드웨어

- \`arm_controller\`(JTC)의 \`command_joints\`는 하드웨어 관절이 아니라 \`rl_arm_correction/joint1~5\`다. 그래서 JTC는 하드웨어에 직접 쓰지 않고 \`rl_arm_correction\`의 reference 칸에 쓴다. ✅ \`controllers.yaml\`
- \`rl_arm_correction\`은 \`ml/RlArmCorrection\`이라는 **컨트롤러 플러그인**이고 \`ChainableControllerInterface\`를 구현한다. 노드가 아니다. ✅ \`ml/rl_arm_correction.xml\`
- \`controllers.yaml\`에 \`rl_arm_correction.type\`이 있고, launch가 \`arm_correction_type\` 값을 덮어쓴다. ✅ \`ros_system.launch.py:232\`

**rl_arm_correction은 누가 띄우나** — 프로세스로 뜨지 않는다. 이미 떠 있는 노드 \`/controller_manager\`가 spawner의 요청을 받아 **플러그인으로 로드**한다. 컨트롤러 6개 모두 같은 방식이다. (하드웨어 플러그인 \`BeebotSystemHardware\`는 spawner가 아니라 URDF로 로드된다 — 3단계)

${F}mermaid
flowchart LR
    LA["🛠️ ros_system.launch.py<br/>파라미터 rl_arm_correction.type<br/>= arm_correction_type<br/>기본 ml/RlArmCorrection"]
    SPW["📦 controller_manager::spawner<br/>노드 /spawner_joint_state_broadcaster"]
    subgraph CMP["📦 controller_manager::ros2_control_node — 노드 /controller_manager"]
        direction LR
        LD["load_controller<br/>rl_arm_correction"]
        TY["파라미터 읽기<br/>rl_arm_correction.type"]
        PL["pluginlib<br/>chainable_loader"]
        OBJ["🛠️ 클래스 ml::RlArmCorrection 객체<br/>+ 자기 노드 /rl_arm_correction<br/>(같은 프로세스 안 LifecycleNode)"]
    end
    XML[("📄 ml/rl_arm_correction.xml<br/>ml/RlArmCorrection → librl_arm_correction.so")]
    LA -->|"ros2_control_node에 파라미터로"| TY
    SPW ==>|"📞 load_controller"| LD
    LD --> TY
    TY -->|"ml/RlArmCorrection"| PL
    XML -.->|"이름 → .so 찾기"| PL
    PL -->|"객체 생성"| OBJ
    SPW ==>|"📞 configure → on_configure<br/>📞 switch(activate) → on_activate"| OBJ
    %% tip LA: 타입 지정 | controllers.yaml에도 rl_arm_correction.type: ml/RlArmCorrection이 있고, launch가 ros2_control_node에 rl_arm_correction.type = arm_correction_type 인자로 덮어쓴다. 테스트베드는 이 인자로 대역 faker/FakeRlArmCorrection을 넣는다. (ros_system.launch.py:182, :232)
    %% tip LD: load_controller | spawner가 CONTROLLERS 목록 순서대로 이 서비스를 부른다. (ros2_control 공식 spawner.py:504)
    %% tip TY: 타입 읽기 | controller_manager는 이름 뒤에 .type을 붙인 파라미터에서 클래스 이름을 읽는다. (ros2_control 공식 controller_manager.cpp:1418)
    %% tip PL: pluginlib | 체인 컨트롤러용 로더에서 ml/RlArmCorrection을 찾아 객체를 만든다. (ros2_control 공식 controller_manager.cpp:1306)
    %% tip XML: 플러그인 등록 | ml/CMakeLists.txt가 pluginlib_export_plugin_description_file(controller_interface rl_arm_correction.xml)로 등록하고(:149), 라이브러리는 add_library(rl_arm_correction)(:142), 코드 끝의 PLUGINLIB_EXPORT_CLASS(ml::RlArmCorrection, ChainableControllerInterface)가 이 클래스를 내보낸다(rl_arm_correction.cpp:399).
    %% tip OBJ: 컨트롤러 객체와 노드 | 객체가 만들어질 때 컨트롤러 이름으로 LifecycleNode를 하나 만든다(ros2_control 공식 controller_interface_base.cpp:90). 그래서 ros2 node list에 /rl_arm_correction이 보이지만 별도 프로세스가 아니라 /controller_manager 프로세스 안에 있다. /skill_context · /hand_relative 구독도 이 노드에 만든다(rl_arm_correction.cpp:128~131).
${CLS}
    class SPW,LD,TY,PL std;
    class LA,OBJ mine;
    class XML ext;
    style CMP fill:#ffffff,stroke:#94a3b8
${F}

1. launch가 \`ros2_control_node\`에 파라미터 \`rl_arm_correction.type\`을 준다 (기본 \`ml/RlArmCorrection\`, 테스트베드는 대역 \`faker/FakeRlArmCorrection\`). ✅ \`ros_system.launch.py:182,232\`
2. spawner가 \`/controller_manager\`에 \`load_controller("rl_arm_correction")\`을 요청한다. ✅ upstream \`spawner.py:504\`
3. controller_manager가 \`rl_arm_correction.type\` 파라미터를 읽고, pluginlib로 \`ml/RlArmCorrection\` → \`librl_arm_correction.so\` → 클래스 \`ml::RlArmCorrection\` 객체를 만든다. ✅ upstream \`controller_manager.cpp:1418,1306\` · ✅ \`ml/rl_arm_correction.xml\` · \`ml/CMakeLists.txt:142,149\` · \`rl_arm_correction.cpp:399\`
4. 객체는 자기 이름으로 **노드 \`/rl_arm_correction\`** (LifecycleNode)을 만든다. \`ros2 node list\`에 보이지만 **별도 프로세스가 아니라 \`/controller_manager\` 프로세스 안**이다. ✅ upstream \`controller_interface_base.cpp:90\`
5. spawner의 configure → \`on_configure\`(구독 \`/skill_context\` · \`/hand_relative\` 생성), switch(activate) → \`on_activate\`(reference를 현재 자세로). ✅ \`rl_arm_correction.cpp:56,128~131,154\`

**xml 파일 위치는 어떻게 아나** — 경로를 코드에 적지 않는다. **빌드 때 ament 인덱스(등록부)에 적고, 실행 때 그 등록부를 뒤진다.** \`BeebotSystemHardware\`(카테고리 \`hardware_interface\`)도 같은 방식이다.

${F}mermaid
flowchart TB
    subgraph BUILD["빌드 · 설치 (colcon build)"]
        direction TB
        CM["📄 ml/CMakeLists.txt<br/>pluginlib_export_plugin_description_file(<br/>controller_interface rl_arm_correction.xml)"]
        XI[("📄 install/ml/share/ml/<br/>rl_arm_correction.xml")]
        IDX[("📄 install/ml/share/ament_index/resource_index/<br/>controller_interface__pluginlib__plugin/ml<br/>내용: share/ml/rl_arm_correction.xml")]
        SO[("📄 install/ml/lib/<br/>librl_arm_correction.so")]
        CM -->|"xml 복사"| XI
        CM -->|"등록부에 상대 경로 기록"| IDX
        CM -->|"install TARGETS · LIBRARY DESTINATION lib"| SO
    end
    subgraph RUN["실행 — 노드 /controller_manager 안"]
        direction TB
        ENV["source install/setup.bash<br/>→ AMENT_PREFIX_PATH 에 install/ml 등"]
        CL["pluginlib ClassLoader<br/>패키지 controller_interface · 속성 plugin<br/>→ 등록부 이름 controller_interface__pluginlib__plugin"]
        FIND["그 이름으로 등록한 패키지 목록 → ml 등<br/>각 패키지 등록 파일 내용 = xml 상대 경로"]
        XML["xml 읽기: ml/RlArmCorrection<br/>library path = rl_arm_correction"]
        LIB["prefix/lib 에서 librl_arm_correction.so 열기<br/>→ 클래스 ml::RlArmCorrection 생성"]
        ENV --> CL --> FIND --> XML --> LIB
    end
    IDX -.->|"찾음"| FIND
    XI -.->|"읽음"| XML
    SO -.->|"엶"| LIB
    %% tip CM: 등록 매크로 | ml/CMakeLists.txt:149. xml을 share/ml/로 설치하고(pluginlib_export_plugin_description_file.cmake:89), 상대 경로 share/ml/rl_arm_correction.xml을 모아 두었다가(:94) ament_package() 때 등록부 파일로 쓴다(pluginlib_package_hook.cmake:22). (pluginlib 공식 소스)
    %% tip CL: ClassLoader | controller_manager가 ClassLoader(controller_interface, controller_interface::ChainableControllerInterface)를 만든다(controller_manager.cpp:574~576). 속성 기본값은 plugin(class_loader.hpp:68)이라 등록부 이름은 패키지 + __pluginlib__ + plugin = controller_interface__pluginlib__plugin(class_loader_imp.hpp:198).
    %% tip FIND: 등록부 검색 | ament_index_cpp::get_resources_by_name으로 그 이름을 등록한 모든 패키지를 찾고(:201), 각 등록 파일의 내용(xml 상대 경로)을 읽는다(:205). 검색 범위는 AMENT_PREFIX_PATH(설치 폴더들)다.
    %% tip LIB: .so 열기 | xml의 library path 이름으로 prefix/lib, prefix/lib/패키지 아래에서 lib 접두사를 붙이거나 떼어 가며 찾는다(class_loader_imp.hpp:296~349).
${CLS}
    class CL,FIND,XML,LIB,ENV std;
    class CM mine;
    class XI,IDX,SO ext;
    style BUILD fill:#f8fafc,stroke:#94a3b8
    style RUN fill:#ffffff,stroke:#94a3b8
${F}

| 단계 | 무엇이 일어나나 | 근거 |
|---|---|---|
| 빌드 | \`pluginlib_export_plugin_description_file(controller_interface rl_arm_correction.xml)\` → xml을 \`install/ml/share/ml/\`에 설치 | ✅ \`ml/CMakeLists.txt:149\` · upstream \`pluginlib_export_plugin_description_file.cmake:89\` |
| 빌드 | 등록부 파일 \`share/ament_index/resource_index/controller_interface__pluginlib__plugin/ml\` 생성, 내용 = \`share/ml/rl_arm_correction.xml\` | ✅ upstream \`:94\` · \`pluginlib_package_hook.cmake:22\` |
| 실행 | \`source install/setup.bash\` → \`AMENT_PREFIX_PATH\`에 설치 폴더들이 들어감 (검색 범위) | ⚪ |
| 실행 | controller_manager의 ClassLoader가 \`controller_interface__pluginlib__plugin\`으로 등록한 패키지를 모두 찾고, 각 파일에 적힌 xml 경로를 읽음 | ✅ upstream \`controller_manager.cpp:574~576\` · \`class_loader_imp.hpp:198~205\` |
| 실행 | xml의 \`<library path="rl_arm_correction">\` → \`install/ml/lib/librl_arm_correction.so\`를 열어 \`ml::RlArmCorrection\` 생성 | ✅ upstream \`class_loader_imp.hpp:296~349\` · \`ml/CMakeLists.txt:150\` |

- 그래서 xml 위치를 바꾸려면 코드가 아니라 CMake의 등록 줄을 바꾼다. 등록을 빠뜨리면 \`load_controller\`가 "클래스를 찾을 수 없음"으로 실패한다(\`controller_manager.cpp:1277~1278\`의 \`isClassAvailable\` 검사).

**체인 = 값이 흐르는 길.** 팔 명령이 하드웨어까지 어떻게 가는지, 누가 어떤 칸을 읽고 쓰는지 그린 것이다.

${F}mermaid
flowchart LR
    MV["📦 moveit_ros_move_group::move_group<br/>노드 /move_group · 궤적 실행"]
    PL["📦 rclcpp_components::component_container 2개<br/>노드 /arm_skills · /base_skills<br/>🛠️ 그 안의 컴포넌트 — 클래스 skills::*Skill = 노드 skill_* 10개<br/>🛠️ control::manual_control — 노드 /manual_control<br/>그리퍼는 직접 호출"]
    HR["🛠️ perception::hand_relative<br/>노드 /hand_relative<br/>✉️ /hand_relative 발행"]
    subgraph PROC["📦 controller_manager::ros2_control_node — 노드 /controller_manager"]
        direction LR
        ARM["📦 ⑥ arm_controller<br/>joint_trajectory_controller<br/>앞 컨트롤러 (preceding)"]
        subgraph REF["🔗 reference 칸 — rl_arm_correction이 내놓음"]
            R1[("rl_arm_correction/<br/>joint1~5/position")]
        end
        RLA["🛠️ ⑤ rl_arm_correction<br/>클래스 ml::RlArmCorrection (컨트롤러 플러그인)<br/>뒤 컨트롤러 (following) · chained 모드<br/>command = reference + 보정 Δ"]
        GRP["📦 ④ gripper_controller<br/>ParallelGripperActionController"]
        DDC["📦 ③ diff_drive_controller"]
        subgraph RM["📦 클래스 hardware_interface::ResourceManager — 하드웨어 칸"]
            direction TB
            ST[("🔗 state<br/>joint1~5 position · velocity · effort<br/>gripper position · effort<br/>wheel position · velocity")]
            CM5[("🔗 command — joint1~5/position")]
            CMG[("🔗 command<br/>gripper_left_joint/position · effort")]
            CMW[("🔗 command<br/>wheel_left · right /velocity")]
        end
        HW["🛠️ 클래스 control::BeebotSystemHardware<br/>하드웨어 플러그인"]
    end
    DEV{{"🔌 OpenCR<br/>S 줄 · C 줄"}}
    MV ==>|"🎬 follow_joint_trajectory"| ARM
    PL ==>|"🎬 gripper_cmd"| GRP
    ARM ==>|"⑤ 쓴다 (command_joints)"| R1
    R1 ==>|"읽는다 reference"| RLA
    PL -.->|"✉️ /skill_context"| RLA
    HR -.->|"✉️ /hand_relative"| RLA
    ST -->|"읽는다 state"| RLA
    ST -->|"읽는다 state"| ARM
    RLA ==>|"빌린다(claim) · 쓴다"| CM5
    GRP ==>|"빌린다 · 쓴다"| CMG
    DDC ==>|"빌린다 · 쓴다"| CMW
    CM5 --> HW
    CMG --> HW
    CMW --> HW
    HW ==>|"write() → C 줄"| DEV
    DEV ==>|"S 줄 → read()"| HW
    HW -->|"채운다"| ST
    %% tip MV: 노드 /move_group (클래스 move_group::MoveGroupExe) | 팔 궤적을 /arm_controller/follow_joint_trajectory(FollowJointTrajectory) 액션으로 보낸다. moveit_controllers.yaml에 arm_controller 하나만 등록돼 있다.
    %% tip PL: skills 노드들 · manual_control | 그리퍼는 moveit_simple_controller_manager의 GripperCommand 타입과 안 맞아서 MoveIt을 거치지 않고 /gripper_controller/gripper_cmd(ParallelGripperCommand) 액션을 직접 부른다. 부르는 쪽: skills 노드 10개(skill_approach · inspect · load · navigate · pick_far · pick · place · pose · stand · unload — 클래스 skills::ApproachSkill … skills::UnloadSkill, 모두 SkillNode 상속)가 쓰는 ArmIo(arm_io.cpp:70). skill들은 실행 파일이 따로 없고, launch가 rclcpp_components::component_container 2개(/arm_skills에 pose · inspect · pick · pick_far · place · load · unload · stand, /base_skills에 navigate · approach)를 띄워 그 안에 ComposableNode(package=skills, plugin=skills::XxxSkill)로 올린다(skills.launch.py:44~67)와 노드 manual_control(control::ManualControl, manual_control.cpp:14). ArmIo는 /skill_context도 발행한다(arm_io.cpp:73).
    %% tip HR: perception::hand_relative — 노드 /hand_relative (클래스 perception::HandRelativeNode · hand_relative_py:=true면 파이썬판 perception::hand_relative_py, perception.launch.py:38) | 손과 물체의 상대 위치를 /hand_relative(perception/HandRelative)로 발행한다. rl_arm_correction이 정책 입력으로 구독한다. (hand_relative.cpp:72, rl_arm_correction.cpp:131)
    %% tip ARM: arm_controller | 하드웨어 대신 rl_arm_correction의 reference에 쓰도록 command_joints가 rl_arm_correction/joint1~5다. command_interfaces는 position, state는 position과 velocity를 읽는다. (controllers.yaml)
    %% tip R1: reference 칸 | rl_arm_correction이 on_export_reference_interfaces_list에서 만든다. 이름은 노드 이름/관절/position. 이 칸은 하드웨어 칸이 아니라 컨트롤러가 내놓은 칸이다. (rl_arm_correction.cpp:185)
    %% tip RLA: rl_arm_correction | 체인 컨트롤러. reference(JTC가 쓴 값)에 학습 정책의 보정 Δ와 처짐 보정을 더해 하드웨어 command에 쓴다. 활성화될 때 reference를 현재 자세로 맞춰 첫 주기에 튀지 않게 한다. (update_and_write_commands, :370)
    %% tip GRP: gripper_controller | joint gripper_left_joint의 위치와 쥐는 힘(max_effort_interface = gripper_left_joint/effort)을 쓴다. 쥐는 힘은 하드웨어가 C 줄 9번째 칸(Goal Current)으로 보낸다. (controllers.yaml)
    %% tip DDC: diff_drive_controller | /cmd_vel을 받아 wheel_left_joint, wheel_right_joint의 velocity command를 쓴다. (controllers.yaml)
    %% tip ST: state 칸 | 하드웨어가 read()에서 채운다. rl_arm_correction은 팔 5관절의 position·velocity·effort와 그리퍼 position·effort를 읽는다. (state_interface_configuration, :141)
    %% tip CM5: 팔 command 칸 | rl_arm_correction이 joint1~5/position을 빌려서 쓴다(command_interface_configuration). 하나의 command는 한 컨트롤러만 쓸 수 있다.
    %% tip ARM>R1: 체인 | arm_controller(앞)가 하드웨어 대신 rl_arm_correction(뒤)의 reference 칸에 쓴다. controller_manager는 reference 칸을 내놓은 뒤 컨트롤러를 chained 모드로 바꾸고(controller_manager.cpp:3887), 앞 컨트롤러를 켤 때 뒤 컨트롤러가 이미 켜져 있거나 함께 켜지는지 검사한다(:3938). 그래서 spawn이 뒤에서부터(⑤ 다음 ⑥)다. (ros2_control 공식 소스)
${CLS}
    class MV,ARM,GRP,DDC std;
    class PL,HR,RLA,HW mine;
    class R1,ST,CM5,CMG,CMW rl;
    class DEV hw;
    style PROC fill:#ffffff,stroke:#94a3b8
    style REF fill:#fff7ed,stroke:#f59e0b
    style RM fill:#fffbeb,stroke:#f59e0b
${F}

**누가 어떤 칸을 빌리나** (command는 한 컨트롤러만 쓸 수 있다)

| 컨트롤러 | 쓰는 칸 (command / reference) | 읽는 칸 (state) |
|---|---|---|
| ① joint_state_broadcaster | 없음 | 모든 관절 state → \`/joint_states\` ⚪ |
| ② imu_sensor_broadcaster | 없음 | \`imu/*\` state → \`/imu\` ⚪ |
| ③ diff_drive_controller | \`wheel_left_joint/velocity\` · \`wheel_right_joint/velocity\` ✅ | 바퀴 position·velocity ⚪ |
| ④ gripper_controller | \`gripper_left_joint/effort\` ✅ · position ⚪ | 그리퍼 state ⚪ |
| ⑤ rl_arm_correction | **하드웨어** \`joint1~5/position\` ✅ + 자기 reference \`rl_arm_correction/joint1~5/position\`을 내놓음 ✅ | 팔 5관절 position·velocity·effort + 그리퍼 position·effort ✅ \`rl_arm_correction.cpp:141\` |
| ⑥ arm_controller | **\`rl_arm_correction/joint1~5/position\`** (하드웨어 칸이 아님) ✅ | joint1~5 position·velocity ✅ |

- 하드웨어의 \`joint1~5/position\` command는 **⑤ rl_arm_correction만** 쓴다. ⑥은 그 앞단의 reference에 쓰므로 둘이 같은 칸을 두고 다투지 않는다.
- 용어: 값을 써 주는 ⑥ arm_controller가 **앞(preceding)** 컨트롤러, reference 칸을 내놓는 ⑤ rl_arm_correction이 **뒤(following)** 컨트롤러다. **chained 모드가 되는 쪽은 뒤(⑤)** 다. ✅ upstream \`controller_manager.cpp:3887\`
- 그래서 spawn 순서가 "뒤에서부터"다: 앞 컨트롤러를 켤 때 controller_manager가 뒤 컨트롤러가 이미 켜져 있거나 함께 켜지는지 검사한다. ✅ upstream \`controller_manager.cpp:3938\` · ✅ \`controllers.yaml\` 주석
- 값의 흐름: **MoveIt 궤적 → ⑥ JTC(보간) → reference → ⑤ (+ 정책 Δ) → 하드웨어 command → \`C\` 줄 → OpenCR**. 마지막 합산은 \`command = ref + corr + total\`이다. ✅ \`rl_arm_correction.cpp:370\`

### 6. \`spawner\`가 끝나면 \`moveit_ros_move_group\` 패키지의 \`move_group\`이 뜬다

- \`OnProcessExit(target_action=spawner_action)\` 뒤에 \`Node(package='moveit_ros_move_group', executable='move_group', name='move_group')\`을 띄운다. ✅ \`:149\` 동시에 띄우면 컨트롤러 로드와 경쟁이 나서 spawner가 FATAL이 났다. ✅ \`:235\`
- 이 \`Node\`에도 조건이 따로 있다: \`IfCondition(LaunchConfiguration('use_moveit'))\`. \`ros_system\` 기본은 false지만 \`bringup\`이 true로 넘긴다. ✅ \`:150\` · \`:220\` · \`bringup.launch.py:134\`
- **누가 띄우나**: MoveIt이 스스로 뜨는 게 아니다. launch 시스템이 \`RegisterEventHandler(OnProcessExit(target_action=spawner_action, on_exit=[move_group_node()]))\`에 따라 띄운다. 즉 "spawner 프로세스가 끝나면 → 그때 \`move_group\` Node 실행". ✅ \`ros_system.launch.py:235~237\`
- **맨 마지막인가?** 순서가 정해진 것은 **spawner 뒤**라는 것 하나뿐이다. 같은 launch의 다른 노드(카메라 · EKF · twist_mux · Nav2 등)는 처음에 바로 뜨므로, 전체에서 꼭 마지막은 아니다.
- **spawner가 실패해도 뜬다**: \`OnProcessExit\`는 종료 코드를 보지 않고 프로세스가 끝나기만 하면 불린다. 팔 체인이 실패해 spawner가 \`return 1\`로 끝나도 \`move_group\`은 뜬다(다만 팔 컨트롤러가 없어 궤적 실행은 실패). ✅ upstream \`launch/event_handlers/on_process_exit.py:66\`
- **안 뜨는 경우**: \`use_moveit:=false\`이거나, \`use_ros2_control:=false\`라서 spawner가 아예 실행되지 않으면 "spawner 종료" 이벤트도 없으므로 \`move_group\`도 뜨지 않는다. (launch 코드에서 따라 나오는 결과)
- **MoveIt과 move_group**: MoveIt은 팔 계획 프레임워크(패키지 여러 개)의 이름이고, \`move_group\`은 그 중심 노드다(패키지 \`moveit_ros_move_group\`). 우리 skill 노드들이 쓰는 \`ArmIO\`가 \`move_group\`의 서비스 \`/plan_kinematic_path\`(계획)와 액션 \`/execute_trajectory\`(실행)를 부르고, \`move_group\`은 궤적을 \`/arm_controller/follow_joint_trajectory\`로 보낸다. ✅ \`skills/src/arm_io.cpp:68~69\` · \`moveit_controllers.yaml\`

### 한 줄로 외우기

${F}text
xacro → URDF 문자열 → 노드 /robot_state_publisher → 토픽 /robot_description
                                                   ↓
controllers.yaml ─→ 노드 /controller_manager (controller_manager::ControllerManager)
                      ├ URDF의 <ros2_control> → 하드웨어 플러그인 로드 (BeebotSystemHardware)
                      └ 100Hz: read → update → write
노드 /spawner_joint_state_broadcaster ─→ 컨트롤러 6개 load/configure/activate (체인은 뒤에서부터)
${F}

### 읽다가 발견한 것

- \`on_activate\`는 S를 **10초** 기다리는데(\`:144\`) 실패 로그는 "상태(S) **3초** 동안 없음"이라고 말한다(\`:152\`). 코드는 10초로 늘렸는데 메시지는 안 고친 것으로 보인다.

### 다음

- 하드웨어 플러그인이 칸을 만들고 · 빌려주고 · 채우는 과정 → **② 하드웨어 플러그인** 탭
- 한 주기 안에서 컨트롤러 6개가 어떤 순서로 \`update()\` 되는지
`,
  },
  hw: {
    label: '② 하드웨어 플러그인 — 칸 만들기·빌려주기·채우기',
    md: `
## 하드웨어 플러그인 — 칸을 만들고 · 빌려주고 · 채운다

> 주인공: 🛠️ 클래스 \`control::BeebotSystemHardware\` (\`ros2_ws/src/control/src/beebot_system_hardware.cpp\`). 별도 노드가 아니라 노드 \`/controller_manager\` 프로세스 안에서 돈다.
>
> **칸(인터페이스)** = 이름 붙은 double 변수 하나. 이름은 \`관절/종류\` (예: \`joint2/position\`). 같은 프로세스 메모리라 복사·직렬화가 없다.
>
> 역할 셋: **하드웨어 플러그인 = 칸을 내놓고 채우는 쪽** · **ResourceManager = 칸 장부(누가 빌렸나)** · **컨트롤러 = 빌려 쓰는 쪽**
>
> 칸도 장부도 전부 **\`/controller_manager\` 프로세스 메모리**다 — 파일에 쓰지 않는다. 장부는 \`std::unordered_map<std::string, bool> claimed_command_interface_map_\`, 칸은 \`state_interface_map_\` 같은 맵이다. ✅ upstream \`resource_manager.cpp:1400, 1631\` · 🔗 표시 = 이 메모리를 같은 프로세스 안에서 바로 읽고 쓴다는 뜻
>
> 기준 소스: \`bee_bot_v2\` develop (\`bcac613f\`) · ✅ 이 저장소 · ✅ upstream = ros2_control 공식 소스(master) · ⚪ 미확인

${F}mermaid
flowchart LR
    subgraph HWP["🛠️ 클래스 control::BeebotSystemHardware — 칸을 내놓고 채우는 쪽"]
        direction TB
        URDF[("📄 URDF ros2_control 블록<br/>관절 8 · 센서 1")]
        EXP["① 올라올 때 칸 만들기<br/>프레임워크 기본 구현이<br/>URDF 목록 → state 34 · command 9<br/>칸마다 키 = 관절/종류<br/>예 joint2/position"]
        RD["④ read() = read_serial → apply_state<br/>S 줄 → set_state(키, 값)<br/>예 set_state(joint2/position, …)<br/>← 제어 루프가 10ms마다 호출"]
        WR["⑤ write() = write_serial<br/>get_command(키) → C 줄<br/>예 get_command(joint2/position)<br/>← 제어 루프가 10ms마다 호출"]
    end
    subgraph RMG["📦 클래스 hardware_interface::ResourceManager — 칸 장부"]
        direction TB
        SST[("🔗 state 칸 34개 — 키 → 칸<br/>joint2/position · imu/orientation.w …<br/>누구나 빌림 (공유)")]
        CMD[("🔗 command 칸 9개 — 키 → 칸<br/>joint2/position · wheel_left_joint/velocity …<br/>한 컨트롤러만 (독점)<br/>장부: 키마다 빌려 갔나 true / false")]
    end
    subgraph CTL["컨트롤러 — 원하는 키 목록을 내고, 활성화될 때 그 키로 빌린다"]
        direction TB
        C1["📦 diff_drive_controller<br/>요청 키: wheel_left_joint/velocity<br/>wheel_right_joint/velocity"]
        C2["📦 gripper_controller<br/>요청 키: gripper_left_joint/position · /effort"]
        C3["🛠️ rl_arm_correction<br/>요청 키 command: joint1~5/position<br/>state: joint1~5 position · velocity · effort …"]
        C4["📦 joint_state_broadcaster · imu_sensor_broadcaster<br/>arm_controller<br/>하드웨어 command 키는 요청 안 함 (state 키만)"]
    end
    DEV{{"🔌 OpenCR<br/>S 줄 · E 줄 → / ← C 줄"}}
    CLK["⏱ 노드 /controller_manager 제어 루프<br/>스레드 cm_thread — 10ms마다<br/>read → 컨트롤러 update → write"]
    CLK -.->|"① 호출 read()"| RD
    CLK -.->|"③ 호출 write()"| WR
    URDF --> EXP
    EXP -->|"② 장부에 등록"| SST
    EXP -->|"② 장부에 등록"| CMD
    DEV ==>|"S 줄"| RD
    RD ==>|"채움 set_state"| SST
    SST -.->|"③ 요청한 state 키로 빌림 (공유)"| CTL
    C1 ==>|"③ 요청한 command 키로 빌림 (독점) · update에서 씀"| CMD
    C2 ==>|"③ 요청한 command 키로 빌림 (독점)"| CMD
    C3 ==>|"③ 요청한 command 키로 빌림 (독점)"| CMD
    CMD ==>|"get_command"| WR
    WR ==>|"C 줄"| DEV
    %% tip EXP: 칸 만들기 | 우리 코드가 아니라 프레임워크 HardwareComponentInterface의 기본 on_export_state_interfaces · on_export_command_interfaces가 URDF 목록(info_)대로 칸 핸들을 만든다(hardware_component_interface.cpp:263~276, 299, 353). BeebotSystemHardware는 이 함수를 재정의하지 않는다.
    %% tip SST: state 칸 | 컨트롤러가 claim_state_interface로 빌린다. 존재만 확인하고 독점 표시가 없어 여럿이 동시에 읽는다. (resource_manager.cpp:1622)
    %% tip CTL: 키로 빌리기 | 컨트롤러가 command_interface_configuration() · state_interface_configuration()으로 키 목록을 내면, 활성화 때 controller_manager가 그 키로 하나씩 claim해 요청 순서대로 넘겨 준다(controller_manager.cpp:201~, 2718, 2747). 자세한 것은 아래 3장 "키(이름)로 골라 가져간다".
    %% tip CMD: command 칸 | claim_command_interface는 이미 빌려 갔으면 "already claimed" 예외, 아니면 장부에 true. 반납하면 false. (resource_manager.cpp:1871~1897)
    %% tip CLK: 누가 부르나 | 플러그인은 스스로 반복하지 않는다. ros2_control_node의 스레드 cm_thread가 10ms마다 ControllerManager::read → ResourceManager::read → BeebotSystemHardware::read 순으로 부르고, 컨트롤러 update 뒤에 같은 길로 write를 부른다. 아래 0장. (ros2_control 공식 ros2_control_node.cpp:148~158)
    %% tip RD: read | 100Hz 루프의 맨 앞. 시리얼에서 마지막 S 줄 하나를 숫자 43개로 풀어 state 칸에 넣는다. 아래 4장.
    %% tip WR: write | 100Hz 루프의 맨 끝. 컨트롤러가 command 칸에 쓴 값을 C 줄로 보낸다. 아래 5장.
${CLS}
    class URDF ext;
    class CLK std;
    class EXP,RD,WR,C3 mine;
    class SST,CMD rl;
    class C1,C2,C4 std;
    class DEV hw;
    style HWP fill:#f0f9ff,stroke:#7dd3fc
    style RMG fill:#fffbeb,stroke:#f59e0b
    style CTL fill:#f0fdf4,stroke:#86efac
${F}

### 0. 누가 read · write를 부르나 — 자동 (플러그인은 반복하지 않는다)

\`BeebotSystemHardware\` 안에는 **반복문도 스레드도 없다.** \`read()\` · \`write()\`는 controller_manager의 제어 루프가 **10ms마다(100Hz) 불러 준다.** 플러그인은 불릴 때 한 번 읽고, 한 번 쓰고 바로 돌아간다.

${F}mermaid
flowchart TB
    subgraph PROC["📦 controller_manager::ros2_control_node — 노드 /controller_manager"]
        direction TB
        LOOP["⏱ cm_thread 루프 — 10ms마다<br/>ros2_control_node.cpp:148~158"]
        CR["📦 ControllerManager::read<br/>controller_manager.cpp:3295"]
        CU["📦 ControllerManager::update<br/>활성 컨트롤러 update · :3391"]
        CW["📦 ControllerManager::write<br/>:3619"]
        RR["📦 ResourceManager::read<br/>하드웨어 하나씩 component.read · resource_manager.cpp:2388~2422"]
        RW["📦 ResourceManager::write<br/>component.write · :2489~2523"]
        HR["🛠️ BeebotSystemHardware::read<br/>→ read_serial · :173"]
        HW["🛠️ BeebotSystemHardware::write<br/>→ write_serial · :177"]
    end
    DEV{{"🔌 OpenCR 펌웨어<br/>자기 루프로 S 줄을 10ms마다 보냄<br/>받은 C 중 마지막 하나만 적용"}}
    LOOP ==>|"① 읽기"| CR --> RR --> HR
    LOOP ==>|"② 계산"| CU
    LOOP ==>|"③ 쓰기"| CW --> RW --> HW
    DEV -.->|"S 줄이 버퍼에 쌓임"| HR
    HW -.->|"C 줄"| DEV
    %% tip LOOP: 제어 루프 | ros2_control_node main()이 만든 스레드 cm_thread가 while 루프에서 cm->read → cm->update → cm->write를 부르고 1/update_rate만큼 쉰다. update_rate 100(controllers.yaml)이라 10ms. (ros2_control 공식 ros2_control_node.cpp:98~176)
    %% tip RR: ResourceManager::read | 등록된 하드웨어 컴포넌트를 for 문으로 돌며 component.read(time, period)를 부른다. 이 로봇은 컴포넌트가 BeebotSystem 하나다. (resource_manager.cpp:2388, 2402, 2422)
    %% tip HR: read | read_serial은 시리얼을 non-blocking으로 연 상태라(open_port의 O_NONBLOCK, :251) 기다리지 않는다. 그 사이 쌓인 바이트를 다 가져와 마지막 완전한 S 줄 하나만 쓰고 돌아간다. 아무것도 안 왔으면 state 칸은 이전 값 그대로.
    %% tip DEV: OpenCR | 펌웨어는 SBC와 따로 자기 루프로 돈다. STATE_PERIOD_MS 10ms(100Hz)마다 S 줄을 보내고, loop 한 번에 들어온 C 중 마지막 하나만 적용한다. (firmware/README.md)
${CLS}
    class LOOP,CR,CU,CW,RR,RW std;
    class HR,HW mine;
    class DEV hw;
    style PROC fill:#ffffff,stroke:#94a3b8
${F}

| 누가 | 무엇을 부르나 | 근거 |
|---|---|---|
| \`ros2_control_node\`의 스레드 \`cm_thread\` | 10ms마다 \`cm->read\` → \`cm->update\` → \`cm->write\` | ✅ upstream \`ros2_control_node.cpp:148~158\` |
| \`ControllerManager::read\` · \`write\` | \`resource_manager_->read\` · \`write\` | ✅ upstream \`controller_manager.cpp:3295~3299, 3619~3622\` |
| \`ResourceManager::read\` · \`write\` | 하드웨어 컴포넌트마다 \`component.read\` · \`write\` | ✅ upstream \`resource_manager.cpp:2388~2422, 2489~2523\` |
| (우리) \`BeebotSystemHardware::read\` · \`write\` | \`read_serial\` · \`write_serial\` (mock이면 \`read_mock\`) | ✅ \`beebot_system_hardware.cpp:173, 177\` |

- **두 루프가 따로 돈다.** SBC 쪽 제어 루프(100Hz)와 OpenCR 펌웨어 루프(S 줄 10ms마다, \`STATE_PERIOD_MS\`)는 서로 맞춰져 있지 않다. 그래서 \`read_serial\`은 "그 사이 쌓인 것 중 **마지막 완전한 S 줄 하나**"만 쓰고, 펌웨어도 "받은 C 중 **마지막 하나**"만 적용한다. ✅ \`:277\` · \`firmware/README.md\`
- **기다리지 않는다.** 시리얼을 \`O_NONBLOCK\`으로 열었기 때문에(\`:251\`) 이번 주기에 새 S 줄이 없으면 바로 돌아가고 state 칸은 이전 값 그대로다. 0.5 s 넘게 없으면 경고만 한다(\`:295\`). 제어 루프를 멈추게 하지 않으려는 것이다.
- **플러그인이 스스로 반복하는 곳은 두 군데뿐이다.**
  - \`on_activate\` — 활성화 순간 한 번, 첫 S 줄을 받을 때까지 20ms 간격으로 최대 10 s 기다린다(\`:144\`).
  - \`/motor_status\` 0.5 s 타이머 — 제어 루프가 아니라 main 스레드(executor)에서 돈다(\`:98\`). 실시간 루프에서 발행하지 않으려는 것이다.

### 1. 칸이 만들어진다 — URDF가 목록, 프레임워크가 생성

| URDF 이름 | state 칸 (하드웨어가 채움) | command 칸 (컨트롤러가 씀) |
|---|---|---|
| \`wheel_left_joint\` · \`wheel_right_joint\` | position · velocity · effort(전류 A) | velocity |
| \`joint1\` ~ \`joint5\` | position · velocity · effort | position |
| \`gripper_left_joint\` | position · velocity · effort | position · effort(쥐는 힘 A) |
| \`imu\` (센서) | orientation.x · y · z · w · angular_velocity.x · y · z · linear_acceleration.x · y · z | — |
| **합계** | **34** | **9** |

- 목록은 URDF의 \`<ros2_control>\` 블록 그대로다. ✅ \`urdf/default/urdf.xacro:1039~1119\`
- **칸을 만드는 것은 우리 코드가 아니다.** 프레임워크 기본 구현 \`HardwareComponentInterface::on_export_state_interfaces\` · \`on_export_command_interfaces\`가 URDF 목록(\`info_\`)대로 핸들을 만든다. \`BeebotSystemHardware\`는 이 함수를 재정의하지 않는다. ✅ upstream \`hardware_component_interface.cpp:263~276, 299, 353\` · ✅ \`beebot_system_hardware.hpp\`
- 플러그인은 칸을 **이름으로** 다룬다: \`set_state("joint2/position", 값)\` · \`get_command("joint2/position")\`. ✅ upstream \`hardware_component_interface.hpp:346, 503\`
- 만든 칸이 ResourceManager 장부에 들어가는 함수 위치는 ⚪

### 2. 올라올 때 — 생명주기 세 단계

| 단계 | 하는 일 | 위치 |
|---|---|---|
| \`on_init\` | URDF \`<hardware><param>\` 읽기: \`mock\` · \`mock_effort\` · \`port\`(기본 \`/dev/opencr\`) · \`twist_state\` · \`twist_compliance_j2/j3\` · 실기면 바퀴·팔 이름(\`WHEELS\` · \`ARM\`)이 URDF에 다 있는지 검사(없으면 ERROR) · URDF에 바퀴 effort state가 있는지, 그리퍼 effort command가 있는지 기억 · 관절별 \`offset\` 읽기 | ✅ \`:46\` |
| \`on_configure\` | **state 칸을 모두 0으로**(\`:83\`), IMU는 \`orientation.w = 1\` · \`linear_acceleration.z = 9.81\`(\`:87~88\`) · 진단 · \`/motor_status\` 발행자와 0.5 s 타이머(\`:98\`) · 서비스 \`~/reboot_motors\` · \`~/set_arm_torque\` · \`/cmd/beep\` 구독 · 실기면 **시리얼 열기** \`open_port\`(\`:250\`, non-blocking raw) | ✅ \`:81\` |
| \`on_activate\` | 실기면 **첫 완전한 S 줄을 최대 10 s 기다림**(\`:144\`) — 없으면 ERROR · 팔 값이 NaN이면 "팔 없음"으로 팔 명령을 계속 막음 · **모든 command 칸 = 지금 state**(position은 비틀림 d를 뺀 엔코더 각) — 첫 주기에 0rad로 튀지 않게 | ✅ \`:132\` |

- 코드 주석: controller_manager는 configure → activate를 \`read()\` 없이 바로 하므로, \`on_activate\`가 직접 S 줄을 먼저 받아야 state가 0이 아니다. ✅ \`:134\`

### 3. 빌려주기 — 소유권

| 칸 | 빌리는 함수 | 규칙 | 근거 |
|---|---|---|---|
| state | \`claim_state_interface\` | 있는지만 확인 — **여럿이 동시에** 빌림 (공유) | ✅ upstream \`resource_manager.cpp:1622\` |
| command | \`claim_command_interface\` | 이미 빌려 갔으면 예외 "already claimed" — **한 컨트롤러만** (독점). 빌리면 장부 true, 반납하면 false | ✅ upstream \`resource_manager.cpp:1871~1897\` |

- **언제 빌리나**: 컨트롤러를 **활성화할 때** controller_manager가 그 컨트롤러가 요구한 command · state 칸을 빌려 넘겨준다. ✅ upstream \`controller_manager.cpp:2718, 2747\`
- **하드웨어 플러그인은 빌리지 않는다.** 칸의 주인이라 \`set_state\` · \`get_command\`로 직접 쓴다.
- 이 로봇의 command 칸 9개는 누가 빌리나:

| command 칸 | 빌린 컨트롤러 | 근거 |
|---|---|---|
| \`wheel_left_joint/velocity\` · \`wheel_right_joint/velocity\` | ③ diff_drive_controller | ✅ \`controllers.yaml\` |
| \`joint1~5/position\` | ⑤ rl_arm_correction | ✅ \`ml/src/rl_arm_correction.cpp:135\` |
| \`gripper_left_joint/effort\` · \`gripper_left_joint/position\` | ④ gripper_controller | effort ✅ \`controllers.yaml\` · position ⚪ |
| (없음) | ⑥ arm_controller — 하드웨어 칸 대신 rl_arm_correction의 reference 칸에 씀 | ✅ \`controllers.yaml\` |

**키(이름)로 골라 가져간다** — 칸마다 문자열 키가 붙어 있다: \`관절/종류\` (예: \`joint2/position\`). 하드웨어도 컨트롤러도 **같은 키**로 같은 칸을 가리킨다.

${F}mermaid
flowchart LR
    subgraph REQ["① 컨트롤러가 원하는 키 목록을 낸다"]
        direction TB
        K1["🛠️ rl_arm_correction<br/>command: joint1/position … joint5/position<br/>state: joint1/position · joint1/velocity … gripper_left_joint/effort"]
        K2["📦 diff_drive_controller<br/>command: wheel_left_joint/velocity · wheel_right_joint/velocity"]
        K3["📦 arm_controller<br/>command: rl_arm_correction/joint1/position …"]
    end
    CMX["📦 ControllerManager<br/>② 활성화 때 키를 하나씩<br/>claim_command_interface(키)<br/>claim_state_interface(키)"]
    subgraph MAP["📦 ResourceManager — 키 → 칸 (메모리 맵)"]
        direction TB
        M1[("🔗 joint2/position → command 칸")]
        M2[("🔗 joint2/position → state 칸")]
        M3[("🔗 rl_arm_correction/joint2/position<br/>→ reference 칸")]
    end
    OUT["③ 빌린 칸을 요청한 순서 그대로<br/>컨트롤러의 command_interfaces_ · state_interfaces_ 에<br/>→ 컨트롤러는 번호로 꺼내 씀<br/>예: state_interfaces_[2*i] = position"]
    HWK["🛠️ BeebotSystemHardware<br/>같은 키로 set_state · get_command"]
    K1 -->|"키 목록"| CMX
    K2 -->|"키 목록"| CMX
    K3 -->|"키 목록"| CMX
    CMX -->|"키로 찾기"| MAP
    MAP -->|"빌린 칸"| OUT
    HWK <-->|"같은 키"| MAP
    %% tip K1: rl_arm_correction의 키 목록 | command_interface_configuration()이 INDIVIDUAL 타입으로 joint1~5/position을 낸다(:135). state_interface_configuration()은 joint1~5의 position · velocity 쌍, 이어서 effort 5개, 그리퍼 position · effort 순서다(:141). 자기가 내놓는 reference 칸의 키는 노드 이름이 앞에 붙은 rl_arm_correction/joint1/position …이다(:185).
    %% tip K2: diff_drive_controller | controllers.yaml의 left_wheel_names · right_wheel_names에 /velocity를 붙인 키를 빌린다고 보는 것이 일반 동작이다. 컨트롤러 내부 코드는 확인하지 않았다.
    %% tip K3: arm_controller | controllers.yaml의 command_joints(rl_arm_correction/joint1~5)와 command_interfaces(position)로 키를 만든다 — 그래서 하드웨어 칸이 아니라 reference 칸을 빌린다. JTC 내부 코드는 확인하지 않았다.
    %% tip CMX: 키로 빌리기 | 컨트롤러의 설정이 INDIVIDUAL이면 그 이름 목록을, ALL이면 있는 칸 전부를 키 목록으로 쓴다(controller_manager.cpp:201~). 목록 순서대로 claim해 vector에 쌓는다(:2718, :2747). (ros2_control 공식 소스)
    %% tip MAP: 키 → 칸 | 없는 키를 빌리려 하면 "does not exist" 예외로 활성화가 실패한다(resource_manager.cpp:1625~1627). 한 글자만 틀려도 이어지지 않는다.
    %% tip OUT: 번호로 꺼내 쓰기 | controller_manager가 빌린 칸 vector를 assign_interfaces로 넘긴다(controller_interface_base.cpp:292). 순서가 요청 순서와 같으므로 rl_arm_correction은 state_interfaces_[2*i]를 position, [2*i+1]을 velocity로 읽고(:266~267), command_interfaces_[i]에 쓴다(:370).
${CLS}
    class K2,K3,CMX std;
    class K1,HWK,OUT mine;
    class M1,M2,M3 rl;
    style REQ fill:#f0fdf4,stroke:#86efac
    style MAP fill:#fffbeb,stroke:#f59e0b
${F}

| 단계 | 무엇이 일어나나 | 근거 |
|---|---|---|
| ① 키 목록 | 컨트롤러가 \`command_interface_configuration()\` · \`state_interface_configuration()\`으로 원하는 키를 낸다. \`INDIVIDUAL\` = 이 이름들 · \`ALL\` = 있는 칸 전부 | ✅ upstream \`controller_manager.cpp:201~\` · ✅ \`rl_arm_correction.cpp:135, 141\` |
| ② 키로 빌리기 | 활성화 때 controller_manager가 목록 순서대로 키 하나씩 claim — 없는 키면 "does not exist", command가 이미 빌려졌으면 "already claimed"로 실패 | ✅ upstream \`controller_manager.cpp:2718, 2747\` · \`resource_manager.cpp:1625~1627, 1880~1883\` |
| ③ 번호로 쓰기 | 빌린 칸을 요청 순서 그대로 \`command_interfaces_\` · \`state_interfaces_\`에 넣어 준다 → 컨트롤러는 키가 아니라 **번호**로 꺼낸다 | ✅ upstream \`controller_interface_base.cpp:292\` · ✅ \`rl_arm_correction.cpp:266~267, 370\` |
| 하드웨어 쪽 | 같은 키 문자열로 \`set_state("joint2/position", …)\` · \`get_command(…)\` | ✅ \`beebot_system_hardware.cpp:332, 473\` |

- 그래서 **키 이름이 이어 주는 끈**이다: URDF의 관절 이름(\`joint2\`) + 종류(\`position\`) = 하드웨어 칸의 키 = 컨트롤러가 요청하는 키. 한 글자만 달라도 활성화가 실패한다.
- 체인의 reference 칸도 같은 방식이다. \`rl_arm_correction\`이 노드 이름을 앞에 붙여 \`rl_arm_correction/joint2/position\` 키로 내놓고, \`arm_controller\`가 \`controllers.yaml\`의 \`command_joints\`로 그 키를 요청한다.

### 4. 채우기 — \`read()\` → \`read_serial\` → \`apply_state\`

\`read()\`는 실기면 \`read_serial()\`, mock이면 \`read_mock()\`을 부른다. ✅ \`:173\`

**S 줄 한 줄 = 숫자 43개** (\`S,\` 뒤 쉼표 구분). ✅ \`:18\` (\`STATE_VALUES = 8×3 + 10 + 8 + 1\`)

| 위치 | 값 | 어디로 |
|---|---|---|
| 0 ~ 2 | 바퀴 L: 누적 각 · 속도 · 전류 A | \`wheel_left_joint/position\`(− 첫 S 값) · \`velocity\` · \`effort\` |
| 3 ~ 5 | 바퀴 R | \`wheel_right_joint/…\` |
| 6 ~ 23 | joint1 ~ 5 · 그리퍼 각각 서보 각 · 속도 · 전류 A | \`<관절>/position\`(− offset · 한계 보정 · + 비틀림) · \`velocity\` · \`effort\` |
| 24 ~ 33 | IMU 10개 | \`imu/orientation.*\` · \`angular_velocity.*\` · \`linear_acceleration.*\` |
| 34 ~ 41 | 모터 온도 °C 8개 | **칸 아님** → 멤버 변수 → \`/motor_status\` |
| 42 | 배터리 V | **칸 아님** → 멤버 변수 → \`/motor_status\` |

${F}mermaid
flowchart LR
    S{{"🔌 S 줄<br/>숫자 43개"}}
    E{{"🔌 E 줄<br/>모터 에러 8개"}}
    subgraph AS["🛠️ apply_state — 숫자를 칸으로"]
        direction TB
        W["바퀴 0~5<br/>위치 − 첫 S 값"]
        A["팔·그리퍼 6~23<br/>− offset → 한계 보정 → + 비틀림 d"]
        I["IMU 24~33"]
        T["온도 34~41 · 배터리 42"]
    end
    ST[("🔗 state 칸<br/>wheel_* · joint* · gripper · imu")]
    MV["멤버 변수<br/>hw_temp_ · battery_v_ · hw_error_"]
    MS["✉️ /motor_status<br/>0.5 s 타이머가 발행"]
    S --> W & A & I & T
    W -->|"set_state"| ST
    A -->|"set_state"| ST
    I -->|"set_state"| ST
    T --> MV
    E -->|"apply_errors"| MV
    MV --> MS
    %% tip W: 바퀴 영점 | 펌웨어 바퀴 위치는 서보 전원 켠 뒤 누적이라, 그대로 주면 diff_drive_controller가 첫 주기에 누적 전체를 달린 거리로 적분해 odom이 튄다(실기 11-14: 0.75 m · 2.89 m). 첫 S 값을 0으로 삼는다. (:326, :332)
    %% tip A: 팔 값 보정 | 서보 값 − offset = 관절값(:343). 소수 넷째 자리 반올림으로 한계를 0.001 미만 넘은 것은 한계로(:349 — MoveIt START_STATE_INVALID 방지). twist_state면 joint2·3에 중력 비틀림 d = c·τ를 더하고(:358) 다시 한계로 자른다(:366).
    %% tip T: 칸이 아닌 값 | 온도 · 배터리 · 모터 에러는 칸이 아니라 멤버 변수(atomic)에 둔다. 발행은 read()(실시간 루프)가 아니라 따로 도는 0.5 s 타이머가 한다(:98, 헤더 motor_timer_ 주석).
${CLS}
    class W,A,I,T mine;
    class ST rl;
    class S,E hw;
    class MV,MS std;
    style AS fill:#f0f9ff,stroke:#7dd3fc
${F}

**\`read_serial\`** ✅ \`:273\`

1. 시리얼에 쌓인 바이트를 다 읽어 버퍼(\`rx_\`)에 붙인다 — non-blocking이라 기다리지 않는다. \`:276\`
2. 줄 단위로 자르며 **S 줄은 마지막 것만** 남기고(밀린 S 줄은 버림), E 줄은 \`apply_errors\`로 모터 에러를 갱신한다. \`:277~281\`
3. 줄바꿈 없는 쓰레기가 4096바이트를 넘으면 버린다. \`:283\`
4. 마지막 S 줄을 \`apply_state\`에 넘긴다 — 성공이면 받은 수 +1, 실패면 해석 실패 수 +1. \`:285\`
5. S 줄이 0.5 s 넘게 없으면 경고 로그. \`:295\`

**\`apply_state\`** ✅ \`:300\`

1. 쉼표로 숫자를 풀고, **43개가 아니면 줄을 버린다**(예전 펌웨어). \`:309\`
2. NaN 처리 — 바퀴 값이 NaN이면 줄을 버림(\`:317\`), 팔·그리퍼만 NaN이면 "팔 없음"으로 표시하고 **팔 칸은 이전 값 그대로**(\`:320\`).
3. **바퀴 영점** — 첫 S의 누적 각을 0으로(\`:326\`), 바퀴 칸 채움(\`:332\`).
4. **팔·그리퍼** — 서보 값 − \`offset\`(\`:343\`) → 반올림으로 한계를 살짝 넘은 값은 한계로(\`:349\`) → velocity · effort 칸 → 비틀림 d(joint2·3, \`:358\`) → position = 엔코더 각 + d, 한계로 자름(\`:366\`).
5. IMU 칸 10개(\`:370\`).
6. 온도 · 배터리는 칸이 아니라 멤버 변수로(\`:371~372\`).

### 5. 내보내기 — \`write()\` → \`write_serial\`

✅ \`:445\`

- **언제 보내나** — \`write()\`는 "command 칸이 채워지면" 불리는 이벤트가 아니라 **10ms마다 무조건** 불린다. 같은 주기 안에서 순서가 \`read()\` → 컨트롤러 \`update()\`(command 칸 9개에 씀) → \`write()\`라서, 방금 컨트롤러가 쓴 값을 보낸다. 이번 주기에 아무도 안 썼으면 칸에 남은 지난 값을 그대로 다시 보낸다. ✅ upstream \`ros2_control_node.cpp:156~158\`
- **보낸 뒤 지우지 않는다** — \`write_serial\`은 \`get_command(키)\`로 읽기만 하고, 하드웨어가 command 칸에 값을 넣는 곳은 \`on_activate\`의 \`set_command\` 한 곳뿐이다(\`:167\`). 프레임워크의 \`ResourceManager::write\` · \`ControllerManager::write\`에도 칸 값을 비우는 코드가 없다. 그래서 command 칸에는 **마지막으로 쓴 값이 계속 남고**, 새 값이 오면 덮어쓴다. ✅ \`beebot_system_hardware.cpp:167\` · ✅ upstream \`resource_manager.cpp:2489~\` · \`controller_manager.cpp:3619~\`
  - 바퀴라면 마지막 속도가 계속 나가는 셈이라, 멈추려면 누군가 0을 써야 한다(diff_drive_controller의 명령 timeout 동작은 ⚪).
- **처음 값** — 컨트롤러가 쓰기 전에도 \`on_activate\`가 command 칸을 현재 state로 채워 두어(\`:132\`) "지금 자세 그대로"를 보낸다. 튀지 않는다.
- 서비스 · 토픽으로 들어온 요청을 먼저 보낸다: **B 줄**(부저, \`/cmd/beep\`) · **T 줄**(팔 토크, \`~/set_arm_torque\`) · **R 줄**(모터 재부팅, \`~/reboot_motors\`).
- **C 줄**: \`get_command\`로 command 칸을 읽어 만든다.
  - 바퀴 velocity 2개 — NaN이면 0. \`:473\`
  - 팔·그리퍼 position 6개 — \`+ offset\`으로 서보 값(\`:484\`). 명령이 NaN이거나 "팔 없음"이면 **빈칸** → 펌웨어가 지금 자세 유지.
  - 9번째: 그리퍼 쥐는 힘 A(\`gripper_left_joint/effort\`, \`:489\`) — URDF에 그 command 칸이 있을 때만.

### 6. mock — 하드웨어 없이 돌 때

✅ \`:227\` · \`mock_hardware:=true\`면 \`read()\`가 \`read_mock()\`, \`write()\`는 아무것도 안 한다(\`:177\`).

- command 칸을 그대로 state 칸에 되돌린다: velocity 명령 → 속도 칸 + 위치는 적분, position 명령 → 바로 그 각도.
- effort 칸은 \`mock_effort\` 값 고정.

### 7. 하드웨어가 하나인 이유 · 여러 개라면

**이 로봇: OpenCR 1개 = \`<ros2_control>\` 블록 1개 = 하드웨어 플러그인 객체 1개.** ✅ \`urdf.xacro:1039\`(블록은 이것 하나) · \`:1041\`

- OpenCR 보드 하나가 USB 시리얼 한 줄로 바퀴 2 · 팔 5축 · 그리퍼 · IMU를 전부 맡는다. 시리얼 포트는 한 곳만 열 수 있으니 여는 쪽도 하나 — S 줄 하나로 다 받고 C 줄 하나로 다 보낸다.
- \`type="system"\` — 하드웨어 종류는 셋이다: \`actuator\`(관절 하나짜리 장치) · \`sensor\`(읽기만) · \`system\`(여러 관절·센서를 한 장치가 같이). OpenCR은 관절 8 + IMU라 \`system\`이고, 클래스도 \`hardware_interface::SystemInterface\`를 상속한다. ✅ \`beebot_system_hardware.hpp\`
- RealSense 카메라 3대는 ros2_control 하드웨어가 **아니다** — 각자 \`realsense2_camera\` 노드로 떠서 토픽으로 낸다. ros2_control에 넣는 것은 **제어 루프(10ms)로 읽고 쓰는 장치**뿐이다.

**보드가 둘이라면 — \`<ros2_control>\` 블록이 둘이 된다** (블록 안에 \`<hardware>\`를 여럿 넣는 게 아니다)

${F}xml
<ros2_control name="WheelBoard" type="system">
  <hardware><plugin>control/WheelHardware</plugin><param name="port">/dev/ttyACM0</param></hardware>
  <joint name="wheel_left_joint">  … </joint>
  <joint name="wheel_right_joint"> … </joint>
</ros2_control>

<ros2_control name="ArmBoard" type="system">
  <hardware><plugin>control/ArmHardware</plugin><param name="port">/dev/ttyACM1</param></hardware>
  <joint name="joint1"> … </joint>
  …
</ros2_control>
${F}

- 공식 파서는 URDF의 \`<ros2_control>\` 태그를 형제 순서대로 하나씩 돌며 **블록 하나당 \`HardwareInfo\` 하나**를 만든다. ✅ upstream \`component_parser.cpp:1027~1031\`
- 블록 안의 \`<hardware><plugin>\`은 문자열 칸 **하나**(\`hardware_plugin_name\`)에 담긴다 → 블록 하나 = 플러그인 하나. ✅ upstream \`component_parser.cpp:717~732\`

${F}mermaid
flowchart LR
    subgraph URDFX["📄 URDF — ros2_control 블록 2개 (예시)"]
        direction TB
        B1["ros2_control WheelBoard<br/>plugin control/WheelHardware<br/>wheel_left · right_joint"]
        B2["ros2_control ArmBoard<br/>plugin control/ArmHardware<br/>joint1~5 · gripper"]
    end
    subgraph CMN["📦 노드 /controller_manager — 하나"]
        direction TB
        H1["🛠️ WheelHardware 객체<br/>/dev/ttyACM0 · 자기 생명주기"]
        H2["🛠️ ArmHardware 객체<br/>/dev/ttyACM1 · 자기 생명주기"]
        subgraph RMX["📦 ResourceManager — 장부 하나"]
            K[("🔗 모든 칸이 한 장부에<br/>wheel_left_joint/velocity · joint2/position …")]
        end
        LP["⏱ 제어 루프 하나<br/>read: 하드웨어마다 for 문으로 read()<br/>write: 하드웨어마다 write()"]
        CT["컨트롤러들<br/>키로만 빌림 — 어느 보드 칸인지 모름"]
    end
    B1 -->|"블록 하나 = 객체 하나"| H1
    B2 -->|"블록 하나 = 객체 하나"| H2
    H1 -->|"칸 등록"| K
    H2 -->|"칸 등록"| K
    LP -.->|"read() · write()"| H1
    LP -.->|"read() · write()"| H2
    CT <-->|"키로 빌림"| K
    %% tip LP: 제어 루프 | ResourceManager::read가 등록된 하드웨어를 for 문으로 하나씩 돌며 read()를 부른다(resource_manager.cpp:2402~2422). 하드웨어가 둘이면 한 주기에 read()가 두 번, write()가 두 번 불린다.
    %% tip CT: 컨트롤러 | 컨트롤러는 키(관절/종류)로만 칸을 빌리므로, 하드웨어를 둘로 나눠도 controllers.yaml은 그대로다.
${CLS}
    class B1,B2 ext;
    class H1,H2 mine;
    class K rl;
    class LP,CT std;
    style CMN fill:#ffffff,stroke:#94a3b8
    style RMX fill:#fffbeb,stroke:#f59e0b
${F}

| 늘어나는 것 | 하나로 남는 것 |
|---|---|
| \`<ros2_control>\` 블록 · 하드웨어 플러그인 객체 · 각자의 생명주기(on_init ~ on_activate) · 각자의 시리얼 포트 | 노드 \`/controller_manager\` · \`ResourceManager\` · 칸 장부(모든 칸이 한 곳) · 제어 루프 · 컨트롤러 설정 |

- 컨트롤러는 키(\`wheel_left_joint/velocity\`, \`joint2/position\`)로만 빌리므로, 하드웨어를 나눠도 \`controllers.yaml\`은 바뀌지 않는다.
- 블록마다 \`rw_rate\`(읽기·쓰기 주기) · \`is_async\`(자기 스레드에서 따로 돌기) 속성을 줄 수 있다 — 느린 보드와 빠른 보드를 나눌 때 쓴다. ✅ upstream \`component_parser.cpp:709~712\`

**ResourceManager는 하나 · 키 앞에는 관절 이름만 붙는다 · 겹치면 실패**

- **ResourceManager는 controller_manager마다 딱 하나**다 — 멤버 \`std::unique_ptr<hardware_interface::ResourceManager> resource_manager_\` 하나를 시작할 때 만든다. 하드웨어가 몇 개든 칸은 이 장부 하나에 모인다. ✅ upstream \`controller_manager.hpp:351\` · \`controller_manager.cpp:852\`
- **키 = 앞 이름 + \`/\` + 종류.** 앞 이름(\`prefix_name\`)은 **관절 · 센서 이름**(\`joint2\`, \`imu\`)이다. 플러그인 이름(\`control/BeebotSystemHardware\`)이나 블록 이름(\`BeebotSystem\`)은 **자동으로 붙지 않는다.** ✅ upstream \`hardware_info.hpp:328~331\` · \`component_parser.cpp:1134~1147\`
  - 예외: 체인 컨트롤러가 내놓는 reference 칸은 앞 이름이 **컨트롤러 이름**이다 → \`rl_arm_correction/joint2/position\`. ✅ \`rl_arm_correction.cpp:185\`
- **키가 겹치면 등록이 실패한다.** 장부에 같은 키가 이미 있으면 "Tried to insert StateInterface(CommandInterface) with already existing key" 예외를 던진다 — 알아서 이름을 바꿔 주지 않는다. ✅ upstream \`resource_manager.cpp:939~946\`(state) · \`:706~717\`(command)
  - 그래서 하드웨어를 나눌 때는 **관절 이름이 겹치지 않게** URDF를 짠다 (관절 이름은 URDF 전체에서 원래 하나뿐이다).
- **블록 이름이 겹쳐도 실패**한다 — "Hardware name … is duplicated. Please provide a unique 'name'". ✅ upstream \`resource_manager.cpp:1543~1550\`

**주기 — 하드웨어가 달라도 기본은 같은 루프 · 같은 주기다. 다르게 줄 수도 있다**

- **왜 한 루프로 묶나**: 칸이 한 장부에 모여 있고, 컨트롤러는 여러 하드웨어의 칸을 같이 읽고 쓸 수 있다. 한 주기 안에서 **모두 read → 모두 update → 모두 write** 순서를 지켜야 컨트롤러가 "같은 순간의 값"을 보고, 실시간 루프 안에서 잠금(lock) 없이 칸을 주고받을 수 있다. 그래서 기본은 controller_manager의 루프 하나가 모든 하드웨어를 같은 주기로 부른다.
- **기본값**: URDF에 \`rw_rate\`가 없으면(0) controller_manager의 \`update_rate\`로 맞춘다. \`update_rate\`보다 크게 줘도 \`update_rate\`로 잘린다. ✅ upstream \`resource_manager.cpp:1529~1530\`

| 방법 | 어디에 | 동작 | 근거 |
|---|---|---|---|
| \`rw_rate\` | URDF \`<ros2_control rw_rate="20">\` | 루프는 그대로 100Hz로 돌고, ResourceManager가 **이번 주기에 이 하드웨어를 부를지 건너뛸지**를 고른다 → 이 하드웨어만 약 20Hz로 read · write | ✅ upstream \`resource_manager.cpp:2419~2440\`(read) · \`:2520~2527\`(write) |
| \`is_async\` | URDF \`<ros2_control is_async="true">\` | 이 하드웨어는 **자기 스레드**에서 read · write를 돈다 — 느린 통신이 제어 루프를 붙잡지 않게 | ✅ upstream \`hardware_component_interface.cpp:82~129\` |
| 컨트롤러 \`update_rate\` | \`controllers.yaml\`의 컨트롤러 파라미터 | 컨트롤러마다 더 느리게 — controller_manager 주기보다 크면 경고, 나누어떨어지지 않아도 경고 | ✅ upstream \`controller_manager.cpp:1685~1704\` |

- **이 로봇**: URDF에 \`rw_rate\` · \`is_async\`가 없고(✅ \`urdf.xacro\`에 0건), \`controllers.yaml\`에는 \`controller_manager\`의 \`update_rate: 100\` 하나뿐이다(✅ \`controllers.yaml:9\`). → **하드웨어 · 컨트롤러 모두 100Hz.**
`,
  },
  cycle: {
    label: '③ 한 주기 — 컨트롤러 update 순서',
    md: `
## 한 주기(10ms) — 컨트롤러 update 순서 · 체인의 두 단계

> 한 주기 = **read → 활성 컨트롤러들 update → write**. 여기서는 가운데 "update"를 연다: **어떤 순서로** 부르고, 체인 컨트롤러는 **안에서 어떻게 두 단계로** 나뉘는지.
>
> 기준 소스: \`bee_bot_v2\` develop (\`bcac613f\`) · ✅ 이 저장소 · ✅ upstream = ros2_control 공식 소스(master) · ⚪ 미확인

${F}mermaid
flowchart TB
    subgraph EXT_IN["바깥 노드 → 컨트롤러로 들어오는 것"]
        direction LR
        MV["📦 moveit_ros_move_group::move_group<br/>노드 /move_group<br/>클래스 move_group::MoveGroupExe"]
        COL["📦 nav2_collision_monitor::collision_monitor<br/>노드 /collision_monitor<br/>기본은 /nav2_container 안 컴포넌트<br/>속도 체인의 마지막"]
        SK["📦 rclcpp_components::component_container<br/>노드 /arm_skills · /base_skills<br/>🛠️ 컴포넌트 skills::*Skill (ArmIO 사용)"]
        MC["🛠️ control::manual_control<br/>노드 /manual_control<br/>클래스 control::ManualControl"]
        HRN["🛠️ perception::hand_relative<br/>노드 /hand_relative<br/>클래스 perception::HandRelativeNode"]
    end
    subgraph PROC["📦 controller_manager::ros2_control_node — 노드 /controller_manager · 클래스 controller_manager::ControllerManager"]
        direction TB
        LOOP["⏱ 스레드 cm_thread — 10ms마다<br/>① read → ② update → ③ write<br/>ros2_control_node.cpp:148~158"]
        subgraph ORD["② update — 정렬된 순서 (위에서 아래로) · 컨트롤러마다 자기 노드"]
            direction TB
            U1["📦 ① joint_state_broadcaster · update 1번째<br/>클래스 joint_state_broadcaster/JointStateBroadcaster<br/>노드 /joint_state_broadcaster<br/>읽는 키: 관절 state"]
            U2["📦 ② imu_sensor_broadcaster · update 2번째<br/>클래스 imu_sensor_broadcaster/IMUSensorBroadcaster<br/>노드 /imu_sensor_broadcaster<br/>읽는 키: imu/*"]
            U3["📦 ③ diff_drive_controller · update 3번째<br/>클래스 diff_drive_controller/DiffDriveController<br/>노드 /diff_drive_controller<br/>쓰는 키: wheel_left · right_joint/velocity"]
            U4["📦 ④ gripper_controller · update 4번째<br/>클래스 parallel_gripper_action_controller/GripperActionController<br/>노드 /gripper_controller<br/>쓰는 키: gripper_left_joint/position · effort"]
            U6["📦 ⑥ arm_controller · update 5번째 — 앞 (preceding)<br/>클래스 joint_trajectory_controller/JointTrajectoryController<br/>노드 /arm_controller<br/>궤적 보간 → 쓰는 키: rl_arm_correction/joint1~5/position"]
            U5["🛠️ ⑤ rl_arm_correction · update 6번째 — 뒤 (following) · chained<br/>클래스 ml/RlArmCorrection<br/>노드 /rl_arm_correction<br/>update_and_write_commands<br/>쓰는 키: joint1~5/position = ref + 보정 Δ"]
            U1 --> U2 --> U3 --> U4 --> U6 ==>|"같은 주기 안에서 바로 넘김"| U5
        end
        subgraph RMG["📦 클래스 hardware_interface::ResourceManager — 칸 (메모리)"]
            direction LR
            SST[("🔗 state 칸 34<br/>wheel_* · joint1~5 · gripper · imu<br/>① read 가 채움")]
            SREF[("🔗 reference 칸 5<br/>rl_arm_correction/joint1~5/position<br/>⑥ 이 쓰고 ⑤ 가 읽음")]
            SCM[("🔗 command 칸 9<br/>wheel_*/velocity · joint1~5/position · gripper<br/>③ write 가 꺼냄")]
        end
        HW["🛠️ 클래스 control::BeebotSystemHardware<br/>① read() = read_serial → apply_state<br/>③ write() = write_serial"]
    end
    DEV{{"🔌 OpenCR<br/>S 줄 → · ← C 줄"}}
    subgraph EXT_OUT["컨트롤러 → 바깥 노드로 나가는 것"]
        direction LR
        RSPN["📦 robot_state_publisher::robot_state_publisher<br/>노드 /robot_state_publisher<br/>→ 관절 TF"]
        EKF["📦 robot_localization::ekf_node<br/>노드 /ekf_filter_node<br/>/odom · /imu · /cuvslam/odom 을 받기만 함<br/>→ ✉️ /odometry/filtered (다른 이름으로 냄)<br/>→ TF odom → base_footprint"]
        NAV["📦 Nav2 bt_navigator · controller_server · velocity_smoother<br/>🛠️ ros_system rewind<br/>odom_topic = /odometry/filtered"]
    end
    LOOP -.->|"① read() · ③ write()"| HW
    LOOP -.->|"② update() — 정렬된 순서로"| ORD
    DEV ==>|"S 줄"| HW
    HW ==>|"① set_state(키)"| SST
    SCM ==>|"③ get_command(키)"| HW
    HW ==>|"C 줄"| DEV
    SST -.->|"관절 state"| U1
    SST -.->|"imu/*"| U2
    SST -.->|"joint1~5 position · velocity"| U6
    SST -.->|"joint1~5 · gripper state"| U5
    U3 ==>|"wheel_*_joint/velocity"| SCM
    U4 ==>|"gripper_left_joint/position · effort"| SCM
    U6 ==>|"update 5번째: 먼저 씀"| SREF
    SREF ==>|"update 6번째: 같은 주기에 읽음"| U5
    U5 ==>|"joint1~5/position"| SCM
    MV ==>|"🎬 /arm_controller/follow_joint_trajectory"| U6
    COL ==>|"✉️ /cmd_vel"| U3
    SK ==>|"🎬 /gripper_controller/gripper_cmd"| U4
    MC ==>|"🎬 /gripper_controller/gripper_cmd"| U4
    SK -.->|"✉️ /skill_context"| U5
    HRN -.->|"✉️ /hand_relative"| U5
    U1 ==>|"✉️ /joint_states"| RSPN
    U2 ==>|"✉️ /imu"| EKF
    U3 ==>|"✉️ /odom — 바퀴 엔코더로 계산 · 내는 곳은 여기 하나"| EKF
    EKF ==>|"✉️ /odometry/filtered (융합 결과)"| NAV
    %% tip LOOP: 제어 루프 | ros2_control_node main()이 만든 스레드 cm_thread가 10ms마다 cm->read → cm->update → cm->write를 부른다(ros2_control 공식 ros2_control_node.cpp:148~158). update_rate 100은 controllers.yaml.
    %% tip ORD: update 순서 | ControllerManager::update는 정렬된 목록을 for 문으로 돌며 활성 컨트롤러만 부른다(controller_manager.cpp:3433, 3444). 체인이 없는 컨트롤러는 로드(spawn) 순서, 체인은 앞 컨트롤러가 뒤 컨트롤러보다 먼저 오게 끼워 넣는다(:1800~1813, :4814~). 그래서 spawn은 ⑤ → ⑥인데 update는 ⑥ → ⑤. 이 순서는 정렬 규칙으로 따져 본 것이고 실행 로그로는 확인하지 않았다.
    %% tip U6: arm_controller | 체인의 앞 컨트롤러. move_group 궤적을 이번 시각으로 보간해 하드웨어가 아니라 reference 칸 rl_arm_correction/joint1~5/position에 쓴다(controllers.yaml command_joints). 컨트롤러도 자기 이름의 노드를 같은 프로세스 안에 가진다(controller_interface_base.cpp:90).
    %% tip U5: rl_arm_correction | 체인 컨트롤러의 update()는 ① update_reference_from_subscribers(chained 모드가 아닐 때만) → ② update_and_write_commands(chainable_controller_interface.cpp:33~47). 지금은 chained 모드라 ①을 건너뛴다(우리 코드에서도 아무것도 안 함, rl_arm_correction.cpp:197~199). ②에서 /skill_context · /hand_relative를 try_get으로 받고(:239, :252) reference + 보정을 command 칸에 쓴다(:370).
    %% tip COL: collision_monitor | 바퀴 속도 체인 twist_mux → velocity_smoother → collision_monitor의 마지막이 /cmd_vel을 낸다(ros_system.launch.py 머리 주석 · :311). nav2_composition이 기본이면 /nav2_container 안 컴포넌트, 아니면 따로 뜬 노드다.
    %% tip EKF: ekf_node | /odom을 고쳐서 다시 내는 게 아니다. 토픽 이름이 둘로 다르다 — /odom을 내는 곳은 diff_drive_controller 하나(spawner의 -r ~/odom:=/odom, ros_system.launch.py:127), EKF는 받기만 한다. 같은 이름으로 두 노드가 내면 덮어쓰는 게 아니라 메시지가 섞여 번갈아 도착하므로 이름을 나눈다. /odom(바퀴) · /imu · /cuvslam/odom을 입력으로 받아(ekf.yaml:30, 35, 39) 융합 결과를 새 토픽 /odometry/filtered로 내고(ekf.yaml:1 주석 · launch에 리매핑 없음), publish_tf: true라 TF odom→base_footprint도 낸다(ekf.yaml:8, 13~15). diff_drive_controller는 enable_odom_tf: false라 TF를 안 낸다 — TF를 내는 쪽은 EKF 하나(controllers.yaml:62).
    %% tip NAV: /odometry/filtered 받는 쪽 | nav2_params.yaml의 odom_topic: /odometry/filtered — bt_navigator(:21) · controller_server(:40) · velocity_smoother(:292). ros_system rewind 노드도 이 토픽으로 주행 궤적을 기록한다(src/rewind.cpp:40).
    %% tip SREF: reference 칸 | 하드웨어 칸이 아니라 rl_arm_correction이 내놓은 칸. update 순서상 arm_controller가 먼저 쓰고 rl_arm_correction이 같은 주기에 읽으므로 지연이 없다.
${CLS}
    class MV,COL,SK,RSPN,EKF,NAV std;
    class MC,HRN,U5,HW mine;
    class LOOP,U1,U2,U3,U4,U6 std;
    class SST,SREF,SCM rl;
    class DEV hw;
    style PROC fill:#ffffff,stroke:#94a3b8
    style ORD fill:#f0fdf4,stroke:#86efac
    style RMG fill:#fffbeb,stroke:#f59e0b
    style EXT_IN fill:#f8fafc,stroke:#cbd5e1
    style EXT_OUT fill:#f8fafc,stroke:#cbd5e1
${F}

### 1. update를 부르는 쪽 — \`ControllerManager::update\`

✅ upstream \`controller_manager.cpp:3391~\`

1. 정렬된 컨트롤러 목록(\`rt_controller_list\`)을 **for 문으로 앞에서부터** 돈다. \`:3433\`
2. **활성(active) 컨트롤러만** 부른다 — 로드만 됐거나 비활성이면 건너뛴다. \`:3444\`
3. 컨트롤러마다 \`update_rate\`가 있으면 그 주기에 맞을 때만 부른다. 컨트롤러 주기 ≥ controller_manager 주기면 매번 부른다. \`:3457~3458\`
   - 이 로봇은 컨트롤러별 \`update_rate\`를 주지 않아 **6개 모두 매 주기(100Hz)**. ✅ \`controllers.yaml\`(controller_manager의 \`update_rate: 100\`만)

### 2. 순서를 정하는 규칙 — 로드 순서 + 체인은 앞이 먼저

✅ upstream \`controller_manager.cpp:1800~1813\` · \`:4814~\` (\`update_list_with_controller_chain\`)

- 체인이 없는 컨트롤러는 **로드 순서 그대로**(코드 주석: "deterministic update order matching their load order").
- 체인이 있으면 각 컨트롤러를 **자기 앞(preceding) 컨트롤러들보다 뒤, 뒤(following) 컨트롤러들보다 앞**에 끼워 넣는다. → 값을 써 주는 쪽이 먼저, 그 값을 읽는 쪽이 나중.
- 이 로봇에 적용하면 (로드 순서 = spawner 순서):

| | 순서 |
|---|---|
| spawn · 활성화 순서 (\`CONTROLLERS\`) | ① jsb → ② imu → ③ diff_drive → ④ gripper → **⑤ rl_arm_correction → ⑥ arm_controller** |
| **update 순서** (매 주기) | ① jsb → ② imu → ③ diff_drive → ④ gripper → **⑥ arm_controller → ⑤ rl_arm_correction** |

- **켜는 순서와 도는 순서가 반대다.** 켤 때는 뒤(⑤)가 먼저 켜져 있어야 하고(앞을 켤 때 뒤가 켜져 있는지 검사, \`:3938\`), 돌 때는 앞(⑥)이 먼저 값을 써야 뒤(⑤)가 같은 주기에 읽는다.
- 위 update 순서는 소스의 정렬 규칙으로 따져 본 결과다. 실행 로그로 직접 본 것은 아니다 ⚪ (\`controller_manager\` DEBUG 로그 "Adding controller chain"으로 확인할 수 있다).

### 3. 체인 컨트롤러의 update — 두 단계

✅ upstream \`chainable_controller_interface.cpp:33~47\`

${F}cpp
// ChainableControllerInterface::update (발췌)
if (!is_in_chained_mode()) {                     // 앞 컨트롤러가 없을 때만
  ret = update_reference_from_subscribers(...);  // ① 토픽 등에서 reference를 직접 받아 채움
}
ret = update_and_write_commands(...);            // ② reference를 읽어 계산 → command 칸에 씀
${F}

| 단계 | 언제 | 우리 rl_arm_correction | 근거 |
|---|---|---|---|
| ① \`update_reference_from_subscribers\` | **chained 모드가 아닐 때만** (앞 컨트롤러가 reference를 안 써 줄 때) | 아무것도 안 함 — \`return OK\` | ✅ \`rl_arm_correction.cpp:197~199\` |
| ② \`update_and_write_commands\` | 매 주기 | 아래 순서로 계산 | ✅ \`rl_arm_correction.cpp:231~\` |

**② 안에서 하는 일** (\`rl_arm_correction.cpp:231~370\`)

1. 토픽에서 온 값 받기 — \`/skill_context\`는 \`ctx_box_.try_get()\`, \`/hand_relative\`는 \`hand_box_.try_get()\`. 콜백이 쓰는 중이라 못 잡으면 **기다리지 않고** 지난 값을 쓴다(실시간 루프라서). \`:239\` · \`:252\`
2. reference(이번 주기에 arm_controller가 쓴 값) · state(이번 주기 read 값)를 읽는다 — \`refs_[i]\` · \`state_interfaces_[2*i]\`. \`:264~267\`
3. 정책 보정 Δ · 중력 앞먹임 · 처짐 적분으로 보정량을 만든다.
4. **command 칸에 씀**: \`command_interfaces_[i].set_value(ref[i] + corr_[i] + total)\`. reference가 아직 없으면 아무것도 안 쓴다. \`:362~370\`

### 4. 순서가 왜 중요한가

- ⑥ arm_controller가 **먼저** reference를 쓰고 ⑤ rl_arm_correction이 **같은 주기에** 그 값을 읽는다 → 보간된 목표가 **지연 없이** 하드웨어 command로 간다.
- 순서가 반대라면 ⑤는 **지난 주기(10ms 전)** reference를 읽게 되어 한 주기씩 늦는다. 그래서 controller_manager가 체인 순서로 정렬한다.
- 읽기만 하는 broadcaster(①②)는 순서와 상관없이 "이번 주기 read 값"을 내보낸다 — read가 update보다 먼저이므로.
- command 칸은 \`write()\`가 마지막에 한 번에 내보낸다 — 컨트롤러가 쓰는 즉시 장치로 가는 게 아니다.

### 5. 토픽 \`/odom\` ≠ TF 프레임 \`odom\` — diff_drive가 낸 값은 어디로 가나

이름이 같아서 헷갈린다. **토픽 \`/odom\`(메시지)** 과 **TF 프레임 \`odom\`(좌표계)** 은 다른 것이다. RViz의 Fixed Frame · TF에서 보는 \`odom\`은 프레임이고, 그 프레임의 위치는 EKF가 융합한 값이다.

${F}mermaid
flowchart TB
    subgraph TFT["TF 트리 (좌표계 관계)"]
        direction TB
        FM(["프레임 map"])
        FO(["프레임 odom"])
        FB(["프레임 base_footprint"])
        FM -->|"map→odom = 위치 보정"| FO
        FO -->|"odom→base_footprint = 연속 움직임"| FB
    end
    DD["📦 ③ diff_drive_controller<br/>클래스 diff_drive_controller/DiffDriveController<br/>노드 /diff_drive_controller — /controller_manager 프로세스 안<br/>enable_odom_tf: false — TF 안 냄"]
    CV["🛠️ ros_system::cuvslam_slam (C++판 · cuvslam_impl로 py판)<br/>노드 /cuvslam_slam<br/>시각 오도메트리 · 루프 클로저"]
    RL["🛠️ ros_system::map_tf_relay<br/>노드 /map_tf_relay<br/>30Hz로 TF 발행"]
    EKF["📦 robot_localization::ekf_node<br/>노드 /ekf_filter_node<br/>world_frame: odom · publish_tf: true"]
    NAV["📦 Nav2 bt_navigator · controller_server · velocity_smoother"]
    DD ==>|"✉️ /odom — 바퀴 엔코더만 · 원본"| EKF
    CV ==>|"✉️ /cuvslam/odom"| EKF
    EKF ==>|"✉️ /odometry/filtered — 융합 결과"| NAV
    EKF ==>|"TF odom→base_footprint"| FB
    CV ==>|"✉️ /cuvslam/map_to_odom (latched)"| RL
    RL ==>|"TF map→odom"| FM
    %% tip CV: cuvslam_slam | map→odom 보정을 계산한다. TF로 직접 내지 않고 /cuvslam/map_to_odom으로 내면 map_tf_relay가 30Hz TF로 낸다(cuvslam_slam.cpp:589~598, cuvslam_slam.py:6). cuVSLAM 위치가 크게 튀면 보정을 잠그고 바퀴+IMU로만 이어 간다(:584~585).
    %% tip EKF: ekf_node | world_frame: odom이라 odom 프레임 안에서만 융합한다(ekf.yaml:15) — 지도 기준 보정(map→odom)은 하지 않는다. 결과를 TF odom→base_footprint와 토픽 /odometry/filtered로 낸다.
    %% tip DD: diff_drive_controller | /odom 토픽만 낸다. enable_odom_tf: false라 TF는 EKF 하나만 낸다(controllers.yaml:62) — 둘 다 내면 TF가 싸운다.
${CLS}
    class DD,EKF,NAV std;
    class CV,RL mine;
    class FM,FO,FB rl;
    style TFT fill:#fffbeb,stroke:#f59e0b
${F}

| 이름 | 종류 | 누가 내나 | 값 | 근거 |
|---|---|---|---|---|
| \`/odom\` | 토픽 | diff_drive_controller (유일) | 바퀴 엔코더로만 계산한 원본 — EKF 입력 | ✅ \`ros_system.launch.py:127\` · \`ekf.yaml:30\` |
| \`/odometry/filtered\` | 토픽 | EKF | \`/odom\` + \`/imu\` + \`/cuvslam/odom\` 융합 — Nav2가 구독 | ✅ \`ekf.yaml:1\` · \`nav2_params.yaml:21,40,292\` |
| \`odom → base_footprint\` | TF | EKF | 융합된 연속 움직임 (부드럽지만 오차가 쌓임) | ✅ \`ekf.yaml:8,13~15\` |
| \`map → odom\` | TF | cuvslam_slam → map_tf_relay | 지도 기준 위치 보정 (쌓인 오차를 바로잡음) | ✅ \`cuvslam_slam.cpp:589~598\` · \`ros_system.launch.py:394,466\` |

- RViz Fixed Frame \`odom\` → 로봇 = EKF의 \`odom→base_footprint\` (융합값, 바퀴만이 아니다).
- RViz Fixed Frame \`map\` → 로봇 = cuVSLAM 보정 \`map→odom\` + EKF \`odom→base_footprint\`.
- 토픽 \`/odom\`(바퀴만)은 Odometry 디스플레이를 따로 넣어야 보인다.
- 같은 토픽 이름으로 두 노드가 내면 덮어쓰지 않고 메시지가 **섞여 번갈아** 도착한다 — 그래서 이름을 나누고 TF도 한 곳에서만 낸다.

**TF는 어떤 토픽으로 오가나 — \`/tf\` · \`/tf_static\` 두 개뿐**

TF 프레임 이름(\`map\`, \`odom\`, \`base_footprint\`)은 토픽 이름이 아니다. 좌표 관계는 전부 이 두 토픽으로 오간다.

| 토픽 | 메시지 타입 | 무엇 | 근거 |
|---|---|---|---|
| \`/tf\` | \`tf2_msgs/msg/TFMessage\` | 계속 바뀌는 관계 — \`map→odom\` · \`odom→base_footprint\` · 움직이는 관절 | ✅ upstream \`tf2_ros/transform_broadcaster.hpp:89~90\` |
| \`/tf_static\` | 같음 | 안 바뀌는 관계 — 고정 관절 · 센서 장착 위치 | ✅ upstream \`tf2_ros/static_transform_broadcaster.hpp:87~88\` |

- 메시지 하나에 \`header.frame_id\`(부모, 예 \`odom\`) · \`child_frame_id\`(자식, 예 \`base_footprint\`) · 위치 · 회전이 들어 있다. RViz · Nav2는 \`/tf\` · \`/tf_static\`을 구독해 이 쌍들을 이어 **TF 트리**를 조립한다.
- 이 로봇에서 \`/tf\`에 내는 쪽: \`map→odom\` = 노드 \`/map_tf_relay\`(✅ \`map_tf_relay.cpp:27,37\` \`TransformBroadcaster\`) · \`odom→base_footprint\` = 노드 \`/ekf_filter_node\`(✅ \`ekf.yaml:8\` \`publish_tf: true\`) · 관절 = \`robot_state_publisher\`(\`/joint_states\`로 계산, 고정 관절은 \`/tf_static\` ⚪).
- \`/tf\`는 **원래 여러 노드가 같이 내는 토픽**이다 — 메시지마다 프레임 쌍이 적혀 있어 섞여도 된다. 다만 **같은 프레임 쌍**을 두 노드가 내면 싸운다 → diff_drive_controller \`enable_odom_tf: false\`. 반면 \`/odom\` 같은 일반 토픽은 "누구 값인지" 구분이 없어서 섞이면 안 된다.
`,
  },
  fail: {
    label: '④ 실패했을 때',
    md: `
## 실패했을 때 — ros2_control의 정지 경로 · 이 로봇이 실제로 하는 일

> 결론부터: **ros2_control에는 "read · write가 ERROR면 하드웨어와 그 컨트롤러를 끄는" 경로가 있다. 그런데 우리 \`BeebotSystemHardware\`는 read · write에서 ERROR를 돌려주지 않는다.** 그래서 OpenCR이 끊겨도 그 경로는 안 타고, 대신 **state 칸이 마지막 값으로 얼어붙고 · 경고 · 진단 · 펌웨어 watchdog**으로 처리된다.
>
> 기준 소스: \`bee_bot_v2\` develop (\`bcac613f\`) · ✅ 이 저장소 · ✅ upstream = 공식 소스(ros2_control master · ros2_controllers master) · ⚪ 미확인

### 1. ros2_control의 정지 경로 — read · write가 ERROR를 돌려주면

${F}mermaid
flowchart TB
    subgraph PROC["📦 controller_manager::ros2_control_node — 노드 /controller_manager · 클래스 controller_manager::ControllerManager"]
        direction TB
        LOOP["⏱ 스레드 cm_thread — 10ms 루프<br/>cm->read → cm->update → cm->write"]
        subgraph RMX["📦 클래스 hardware_interface::ResourceManager"]
            direction TB
            HWX["🛠️ 클래스 control::BeebotSystemHardware<br/>하드웨어 이름 BeebotSystem · 컴포넌트 노드 /beebotsystem<br/>만약 read() · write() 가 return_type::ERROR 를 돌려주면"]
            ERR["① component.error()<br/>→ on_error() — 재정의 안 함 → 기본 SUCCESS<br/>→ 생명주기 active → UNCONFIGURED"]
            AV[("🔗 ② 사용 가능 목록에서 빠지는 칸<br/>state 34: joint2/position · wheel_left_joint/velocity · imu/orientation.w …<br/>command 9: joint1~5/position · wheel_*_joint/velocity · gripper_left_joint/*")]
        end
        CMX["③ ControllerManager::read · write<br/>BeebotSystem 칸을 쓰는 컨트롤러 목록을 구해 비활성화<br/>controller_manager.cpp:3301~3322 · 3622~3646"]
        subgraph OFF["④ 꺼지는 컨트롤러 (이 로봇이라면) — 모두 /controller_manager 프로세스 안"]
            direction TB
            O1["📦 ① joint_state_broadcaster · 노드 /joint_state_broadcaster<br/>클래스 joint_state_broadcaster/JointStateBroadcaster<br/>→ ✉️ /joint_states 멈춤 → robot_state_publisher TF 멈춤"]
            O2["📦 ② imu_sensor_broadcaster · 노드 /imu_sensor_broadcaster<br/>클래스 imu_sensor_broadcaster/IMUSensorBroadcaster<br/>→ ✉️ /imu 멈춤 → EKF 입력 끊김"]
            O3["📦 ③ diff_drive_controller · 노드 /diff_drive_controller<br/>클래스 diff_drive_controller/DiffDriveController<br/>→ ✉️ /odom 멈춤 · ✉️ /cmd_vel 무시"]
            O4["📦 ④ gripper_controller · 노드 /gripper_controller<br/>클래스 parallel_gripper_action_controller/GripperActionController<br/>→ 🎬 /gripper_controller/gripper_cmd 받을 곳 없음"]
            O5["🛠️ ⑤ rl_arm_correction · 노드 /rl_arm_correction<br/>클래스 ml::RlArmCorrection → joint1~5/position 명령 멈춤"]
            O6["📦 ⑥ arm_controller · 노드 /arm_controller<br/>클래스 joint_trajectory_controller/JointTrajectoryController<br/>하드웨어 칸이 아니라 ⑤의 reference 칸을 씀 — 같이 꺼지는지 ⚪"]
        end
    end
    LOG["✉️ /rosout — 노드 /controller_manager 로그<br/>Deactivating following hardware components as their read cycle resulted in an error: [ BeebotSystem ]<br/>Deactivating following controllers ..."]
    REC["🛠️ 복구 — 자동 아님 ⚪<br/>ros2 control set_hardware_component_state BeebotSystem active<br/>ros2 control switch_controllers --activate …"]
    LOOP -->|"① read() 호출"| HWX
    HWX ==>|"ERROR"| ERR
    ERR ==>|"칸 빼기"| AV
    AV ==>|"실패한 하드웨어 이름 BeebotSystem"| CMX
    CMX ==>|"deactivate"| OFF
    CMX -.->|"에러 로그"| LOG
    OFF -.->|"사람이 다시 켜야"| REC
    %% tip HWX: 가정 | 이 로봇의 BeebotSystemHardware는 실제로는 read · write에서 ERROR를 돌려주지 않는다(아래 2장). 이 도식은 ERROR를 돌려준다면 ros2_control이 무엇을 하는지 보여 준다. 하드웨어 이름 BeebotSystem은 URDF ros2_control name(urdf.xacro:1039), 컴포넌트 노드 /beebotsystem은 manual_control의 재부팅 서비스 기본값 /beebotsystem/reboot_motors로 확인(manual_control.cpp:23).
    %% tip ERR: component.error() | ResourceManager가 컴포넌트 read가 OK가 아니면 component.error()를 부르고(resource_manager.cpp:2473), 실패 이름을 모으고 그 하드웨어의 칸을 사용 가능 목록에서 뺀다. DEACTIVATE도 read에서는 ERROR와 같게 다룬다(:2470). error()는 on_error()가 SUCCESS면 UNCONFIGURED, FAILURE · ERROR면 FINALIZED로 보낸다(hardware_component.cpp:222~). on_error 기본값은 SUCCESS(rclcpp_lifecycle).
    %% tip CMX: 컨트롤러 끄기 | 실패한 하드웨어 이름마다 get_cached_controllers_to_hardware로 그 하드웨어 칸을 쓰는 컨트롤러를 모아 deactivate한다(controller_manager.cpp:3301~3322 read, :3622~3646 write). write가 DEACTIVATE면 command 칸을 쓰던 컨트롤러만 골라 끈다(:3651~).
    %% tip O6: arm_controller | 하드웨어 칸은 state(joint1~5 position · velocity)만 읽고 command는 rl_arm_correction의 reference 칸에 쓴다. state 칸을 쓰므로 목록에 들어갈 가능성이 크지만 확인하지 않았다.
${CLS}
    class LOOP,CMX,O1,O2,O3,O4,O6 std;
    class HWX,ERR,O5,REC mine;
    class AV rl;
    class LOG ext;
    style PROC fill:#ffffff,stroke:#94a3b8
    style RMX fill:#fffbeb,stroke:#f59e0b
    style OFF fill:#fef2f2,stroke:#fca5a5
${F}

| 단계 | 무엇이 일어나나 | 근거 |
|---|---|---|
| ① | 하드웨어 \`read()\`/\`write()\`가 \`ERROR\`(read는 \`DEACTIVATE\`도 같게) → \`component.error()\` | ✅ upstream \`resource_manager.cpp:2470~2477\` |
| ② | \`on_error()\` → 기본 SUCCESS면 하드웨어 **UNCONFIGURED**, 그 칸은 사용 가능 목록에서 빠짐 | ✅ upstream \`hardware_component.cpp:222~\` · \`rclcpp_lifecycle\` 기본 \`on_error\` = SUCCESS |
| ③ | 그 하드웨어 칸을 쓰던 **컨트롤러를 비활성화** + 에러 로그 | ✅ upstream \`controller_manager.cpp:3301~3322\`(read) · \`:3622~3646\`(write) |
| ④ | 저절로 돌아오지 않는다 — 하드웨어 다시 configure · activate, 컨트롤러 다시 activate | ⚪ (CLI \`set_hardware_component_state\` · \`switch_controllers\`로 한다고 알려져 있음) |

### 2. 이 로봇은 그 경로를 안 탄다 — ERROR를 안 돌려주므로

- \`read_serial()\` · \`read_mock()\` · \`write_serial()\` 모두 **항상 \`return_type::OK\`**. ✅ \`beebot_system_hardware.cpp:247, 297, 500\`
- \`on_error\` · \`on_deactivate\`를 재정의하지 않는다. ✅ \`beebot_system_hardware.hpp\`
- ERROR를 돌려주는 곳은 **시작할 때뿐**: \`on_init\`(URDF에 관절이 없으면, \`:47 · :224\`) · \`on_configure\`(포트 못 열면) · \`on_activate\`(첫 S 줄이 10 s 안에 없으면, \`:153\`).

${F}mermaid
flowchart TB
    subgraph CMP["📦 controller_manager::ros2_control_node — 노드 /controller_manager"]
        direction TB
        RD["🛠️ 클래스 control::BeebotSystemHardware · 컴포넌트 노드 /beebotsystem<br/>read() = read_serial — 새 S 줄 없음<br/>→ 그래도 return OK (:297)"]
        SST[("🔗 state 칸 — 마지막 값으로 얼어붙음<br/>joint2/position · wheel_left_joint/position · imu/* …")]
        CTL["컨트롤러 6개 — 계속 active<br/>얼어붙은 값으로 update"]
        JSB["📦 ① joint_state_broadcaster · 노드 /joint_state_broadcaster<br/>클래스 joint_state_broadcaster/JointStateBroadcaster<br/>update마다 무조건 발행"]
        WR["🛠️ write() = write_serial — ::write 실패<br/>→ 'OpenCR 쓰기 실패' 로그 (5 s마다) · return OK (:498, :500)<br/>R 줄(재부팅) · T · B 요청도 여기서 보냄"]
        DG["🛠️ 진단 'BeebotSystem: OpenCR 연결'<br/>컴포넌트 노드 /beebotsystem 이 발행<br/>S가 0.5 s 넘게 없으면 ERROR (:186)"]
        MT["🛠️ 0.5 s 타이머 → ✉️ /motor_status<br/>모터 에러 · 온도 · 배터리"]
    end
    FW{{"🔌 OpenCR 펌웨어 (살아 있다면)<br/>C가 500 ms 안 오면 watchdog<br/>바퀴 0 · 팔 지금 자세 유지"}}
    SM["🛠️ manager::state_manager<br/>노드 /state_manager<br/>opencr = /joint_states 1초 안에 흐르나 ⚠<br/>모터 에러 → 장치 상태 error"]
    RSP["📦 robot_state_publisher::robot_state_publisher<br/>노드 /robot_state_publisher<br/>얼어붙은 관절로 TF 계속"]
    DAG["📦 diagnostic_aggregator::aggregator_node<br/>✉️ /diagnostics → ✉️ /diagnostics_agg"]
    MC["🛠️ control::manual_control<br/>노드 /manual_control<br/>✉️ /cmd/manual/reboot_motors 받으면"]
    RD -->|"set_state 안 함"| SST
    SST --> CTL
    CTL --> JSB
    CTL --> WR
    WR -.->|"C 줄이 못 감"| FW
    JSB ==>|"✉️ /joint_states — 값만 얼어 있음"| SM
    JSB ==>|"✉️ /joint_states"| RSP
    DG ==>|"✉️ /diagnostics"| DAG
    MT ==>|"✉️ /motor_status"| SM
    MC ==>|"📞 /beebotsystem/reboot_motors → 다음 write()에서 R 줄"| WR
    %% tip RD: read_serial | non-blocking으로 읽어 새 S 줄이 없으면 그냥 돌아간다. state 칸은 이전 값 그대로. 0.5 s 넘으면 경고 로그(:295). 반환은 항상 OK(:297).
    %% tip WR: write_serial | ::write가 실패하면 RCLCPP_ERROR_THROTTLE(5 s)로 'OpenCR 쓰기 실패'만 남기고 OK를 돌려준다(:498, :500).
    %% tip DG: 진단 | report()가 포트가 닫혔으면 ERROR '포트 닫힘', S가 0.5 s 넘게 없으면 ERROR 'OpenCR 상태(S) 수신 없음'(:181~186). diagnostic_aggregator가 '제어' 묶음으로 모은다(bringup/config/diagnostics.yaml — beebotsystem).
    %% tip JSB: joint_state_broadcaster | update()마다 값이 바뀌었는지 보지 않고 try_publish한다(ros2_controllers 공식 joint_state_broadcaster.cpp:419~451). 그래서 OpenCR이 끊겨도 /joint_states는 같은 값으로 계속 나온다.
    %% tip SM: state_manager의 opencr 검사 | 주석상 'opencr = /joint_states가 최근 1초 안에 실제로 흐르는지'(state_manager.hpp:44~45). 위 이유로 OpenCR이 끊겨도 정상으로 보일 수 있다 — 소스로 따져 본 것이고 실기로 확인하지 않았다. 모터 에러는 /motor_status로 받아 장치 상태 error로 낸다(state_manager.cpp:95~101).
    %% tip MC: 재부팅 | manual_control이 /cmd/manual/reboot_motors를 받으면 서비스 /beebotsystem/reboot_motors를 부른다(manual_control.cpp:23~24). 하드웨어는 에러 난 모터만 골라 write()에서 R 줄로 보낸다.
    %% tip FW: 펌웨어 watchdog | 마지막 유효 C 뒤 COMMAND_TIMEOUT_MS(500 ms)가 지나면 바퀴 속도 0, 팔·그리퍼는 지금 자세 유지(config.h:44, beebot_opencr.ino:24, 518~).
${CLS}
    class RD,WR,DG,MT,SM,MC mine;
    class SST rl;
    class CTL,JSB,RSP,DAG std;
    class FW hw;
    style CMP fill:#ffffff,stroke:#94a3b8
${F}

> ⚠ **소스로 따져 본 주의점** — \`joint_state_broadcaster\`는 update마다 무조건 발행하므로(✅ upstream \`joint_state_broadcaster.cpp:419~451\`) OpenCR이 끊겨도 \`/joint_states\`는 **얼어붙은 값으로 계속 흐른다.** \`state_manager\`의 "opencr = \`/joint_states\`가 1초 안에 흐르나" 검사(✅ \`manager/include/manager/state_manager.hpp:44~45\`)는 그때도 정상으로 보일 수 있다. 끊김을 확실히 보는 곳은 진단 "OpenCR 연결"(S 0.5 s 없음 → ERROR)이다. 실기로 확인하지 않았다 ⚪.

### 3. 상황별로 정리

| 상황 | 하드웨어 플러그인 (\`BeebotSystemHardware\`) | ros2_control | 펌웨어 (OpenCR) | 알림 |
|---|---|---|---|---|
| **시작 때 S가 안 옴** (USB · 펌웨어 · 12V) | \`on_activate\`가 첫 S를 10 s 기다리다 ERROR (\`:144, :153\`) | 하드웨어 활성화 실패 → 컨트롤러 활성화도 실패할 수 있음 ⚪ | — | 로그 "OpenCR 상태(S) 3초 동안 없음" (실제 대기는 10 s) |
| **시작 때 팔 응답 없음** (팔 NaN) | "팔 없음"으로 활성화 — 팔 명령은 계속 빈칸, 바퀴만 (\`:156~158\`) | 정상 활성화 | 빈칸 = 지금 자세 유지 | 진단 WARN "팔·그리퍼 응답 없음" · 팔을 꽂아도 **스택 재시작**해야 팔 사용 |
| **달리는 중 USB/S 끊김** | read OK 계속 — **state 칸 얼어붙음** · 0.5 s 경고(\`:295\`) · write 실패 로그(\`:498\`) | 컨트롤러 계속 active (얼어붙은 값으로 계산) | C가 500 ms 안 오면 **바퀴 0 · 팔 유지** (\`config.h:44\`) | 진단 ERROR "OpenCR 상태(S) 수신 없음" (\`:186\`) · \`/joint_states\`는 계속 흐름 ⚠ |
| **달리는 중 팔만 응답 없음** | 팔 칸은 이전 값 그대로(NaN을 안 넣음), 바퀴 · IMU는 정상 (\`:320\`) | 정상 | — | 진단 모터 에러 "응답 없음" |
| **바퀴 값 NaN** | 그 S 줄을 통째로 버림 → state 칸 얼어붙음 (\`:317\`) | 정상 | — | 해석 실패 수 증가 |
| **S 값 개수가 43이 아님** (예전 펌웨어) | 줄을 버림, 개수를 기억 (\`:309\`) | 시작 때면 활성화 실패 | — | 로그 "이 SBC는 43개 형식만 받음 — firmware/upload.sh" |
| **모터 Hardware Error** (과부하 · 과열 · 전압) | E 줄 → 모터별 에러 → \`/motor_status\` (0.5 s 타이머) | 정상 (칸과 무관) | 에러 난 모터는 토크 꺼짐 · **자동 재부팅 안 함** | \`state_manager\` 장치 상태 error("joint2:과부하") · 진단 ERROR "→ ~/reboot_motors" · 재부팅은 \`~/reboot_motors\`(R 줄) |
| **12V 껐다 켬** | 배터리 < 5 V면 진단 "12V 꺼짐" | 정상 | 0.5 s마다 토크 확인 → 풀린 모터를 다시 켜고 **느린 속도로 복귀** | 진단 WARN |

- 근거: 하드웨어 ✅ \`ros2_ws/src/control/src/beebot_system_hardware.cpp\` 줄 번호는 표 안 · 펌웨어 ✅ \`firmware/beebot_opencr/config.h:44~46\` · \`firmware/README.md\` · \`state_manager\` ✅ \`manager/src/state_manager.cpp:95~101\`.
- 정리하면 이 로봇은 **"끊기면 컨트롤러를 끈다"가 아니라 "끊겨도 루프는 돌고, 펌웨어가 바퀴를 세우고, 진단으로 알린다"** 쪽이다. ros2_control의 자동 정지 경로를 쓰려면 \`read()\`가 S 끊김을 ERROR로 돌려줘야 한다 — 소스는 고치지 않았다.

### 4. 모터 에러 — OpenCR에서 E 줄을 받을 때

DYNAMIXEL 모터가 과부하 · 과열 · 전압 이상으로 멈추면 **Hardware Error**가 걸리고 **토크가 꺼진다. 재부팅(R)으로만 풀린다.** 그 상태를 펌웨어가 0.5 s마다 E 줄로 알리고, SBC는 칸이 아니라 **별도 토픽 · 진단**으로 흘린다. ✅ \`firmware/README.md:20,22\`

${F}mermaid
flowchart TB
    subgraph FW["🔌 OpenCR 펌웨어 — firmware/beebot_opencr/beebot_opencr.ino"]
        direction LR
        CHK["⏱ MOTOR_CHECK_MS (0.5 s)마다 모터 8개 검사<br/>read_error: Hardware Error Status 읽기 (응답 없으면 −1)<br/>read_temperature · 토크 풀린 모터 다시 켜기"]
        SKIP["에러 난 모터는 토크를 다시 켜지 않음<br/>— R로 재부팅해야 풀림"]
        SE["send_errors()<br/>E 줄 = E, 바퀴L, 바퀴R, joint1 … joint5, 그리퍼<br/>(정수 8개)"]
        RB["apply_reboot_line (R 줄)<br/>dxl.reboot → ping 대기 최대 1 s<br/>→ setup_motor(복귀) → 바로 send_errors"]
        REC["느린 복귀<br/>RECOVER_PROFILE_VELOCITY ≈ 0.48 rad/s<br/>명령 자세 0.05 rad 안 · 10 s면 해제"]
        CHK --> SKIP
        CHK --> SE
        RB --> REC
        RB --> SE
    end
    subgraph CMP["📦 controller_manager::ros2_control_node — 노드 /controller_manager"]
        direction LR
        RS["🛠️ 클래스 control::BeebotSystemHardware · 컴포넌트 노드 /beebotsystem<br/>read_serial: E, 줄 → apply_errors"]
        HE[("hw_error_[8] — 칸 아님 · 멤버 변수 (atomic)<br/>0 정상 · −1 응답 없음 · 비트 1 입력전압 · 4 과열 · 8 엔코더 · 16 전기충격 · 32 과부하")]
        MT["🛠️ 0.5 s 타이머 publish_motor_status<br/>바뀔 때만 발행 (transient_local)"]
        DG["🛠️ 진단 'BeebotSystem: OpenCR 연결'<br/>모터 에러 있으면 ERROR<br/>'… → ~/reboot_motors 서비스로 재부팅'"]
        SRV["🛠️ 서비스 ~/reboot_motors (= /beebotsystem/reboot_motors)<br/>에러 > 0 인 모터만 고름 — 멀쩡한 모터는 재부팅 안 함<br/>응답 없음(−1)은 재부팅 불가"]
        WR["🛠️ write() = write_serial<br/>reboot_mask_ 가 있으면 R 줄(8칸 · 고른 모터만 1) 먼저"]
        RS --> HE
        HE --> MT
        HE --> DG
        HE --> SRV
        SRV -->|"reboot_mask_"| WR
    end
    SM["🛠️ manager::state_manager<br/>노드 /state_manager<br/>motor_error_ → 장치 상태 error<br/>예 'joint2:과부하'"]
    DAG["📦 diagnostic_aggregator::aggregator_node<br/>✉️ /diagnostics_agg · '제어' 묶음"]
    OP["🛠️ 운영 도구 — tools/cli (bus.py) · 시뮬레이터 수동 창<br/>'모터 재부팅' 버튼"]
    MC["🛠️ control::manual_control<br/>노드 /manual_control<br/>(MANUAL 모드에서 받음)"]
    SE ==>|"🔌 E 줄 0.5 s마다"| RS
    MT ==>|"✉️ /motor_status (control/MotorStatus)"| SM
    SM ==>|"✉️ /state/devices"| OP
    DG ==>|"✉️ /diagnostics"| DAG
    OP ==>|"✉️ /cmd/manual/reboot_motors (std_msgs/Empty)"| MC
    MC ==>|"📞 /beebotsystem/reboot_motors (std_srvs/Trigger)"| SRV
    WR ==>|"🔌 R 줄"| RB
    %% tip CHK: 모터 검사 | 0.5 s마다 모터마다 Hardware Error Status를 읽고(응답 없으면 −1, beebot_opencr.ino:478), 온도를 읽고, 토크가 풀린 모터를 다시 켠다. 에러 난 모터는 건너뛴다(:584~585). 끝에 send_errors(:590). MOTOR_CHECK_MS = 500(config.h:46).
    %% tip SE: E 줄 | 'E,' 뒤에 모터 8개(바퀴L · 바퀴R · joint1~5 · 그리퍼)의 Hardware Error Status 정수(beebot_opencr.ino:464~473). 뜻: 0 정상 · −1 응답 없음 · 비트 1 입력전압 · 4 과열 · 8 엔코더 · 16 전기충격 · 32 과부하(firmware/README.md:22).
    %% tip RS: E 줄 받기 | read_serial이 줄을 자르다 'E,'로 시작하면 apply_errors로 넘긴다(beebot_system_hardware.cpp:281). 정수 8개를 hw_error_에 넣고, 개수가 다르면 해석 실패로 센다(:398~408). S 줄과 달리 칸(state)에 넣지 않는다.
    %% tip MT: /motor_status | 제어 루프(read)에서 발행하지 않으려고 따로 도는 0.5 s 타이머가, 에러 · 온도 · 배터리가 바뀔 때만 발행한다. transient_local이라 늦게 붙은 노드도 마지막 값을 받는다(:98, :376~396).
    %% tip SRV: 재부팅 서비스 | 멀쩡한 모터까지 재부팅하면 그 관절 토크가 빠져 팔이 떨어지므로 에러 > 0 인 모터만 고른다. 고른 게 없으면 실패로 답한다('응답 없는 모터는 재부팅 불가 — 12V·배선 확인'). 시리얼 쓰기는 제어 주기 한 곳에서만 하도록 reboot_mask_만 두고 write()가 R 줄로 보낸다(:410~431, :463~469).
    %% tip RB: R 줄 처리 | 고른 모터를 dxl.reboot → ping이 될 때까지 최대 REBOOT_WAIT_MS(1 s) 기다림 → setup_motor(recover)로 모드 · 토크를 다시 켜고 팔은 느린 복귀 → 에러를 다시 읽어 바로 E 줄을 보낸다(beebot_opencr.ino:489~516, config.h:55).
    %% tip SM: state_manager | /motor_status를 받아 에러 난 관절을 motor_error_에 모으고 바로 /state/devices를 낸다(state_manager.cpp:95~101, :66). 진단 문구가 아니라 이 전용 토픽을 읽는다(state_manager.hpp:47~48).
    %% tip MC: manual_control | /cmd/manual/reboot_motors를 받으면 /beebotsystem/reboot_motors 서비스를 부른다(manual_control.cpp:23~24). 운영 도구 주석상 수동(MANUAL) 모드에서만 받는다(tools/cli/op/bus.py:539).
${CLS}
    class CHK,SKIP,SE,RB,REC hw;
    class RS,MT,DG,SRV,WR,SM,OP,MC mine;
    class HE rl;
    class DAG std;
    style FW fill:#fffde7,stroke:#f9a825
    style CMP fill:#ffffff,stroke:#94a3b8
${F}

| 단계 | 어디서 | 무엇을 | 근거 |
|---|---|---|---|
| ① 검사 | 펌웨어 | 0.5 s마다 모터 8개의 Hardware Error Status · 온도 읽기. 에러 난 모터는 토크를 다시 켜지 않음 | ✅ \`beebot_opencr.ino:556~590\` · \`config.h:46\` |
| ② E 줄 | 펌웨어 → SBC | \`E,<8 정수>\` — 0 정상 · −1 응답 없음 · 비트 1 입력전압 · 4 과열 · 8 엔코더 · 16 전기충격 · 32 과부하 | ✅ \`beebot_opencr.ino:464~473\` · \`firmware/README.md:22\` |
| ③ 받기 | \`BeebotSystemHardware::read_serial\` | \`E,\` 줄 → \`apply_errors\` → \`hw_error_\`(**칸이 아니라 멤버 변수**) | ✅ \`beebot_system_hardware.cpp:281, 398~408\` |
| ④ 알리기 | 0.5 s 타이머 · 진단 | \`/motor_status\`(바뀔 때만, transient_local) → \`state_manager\` → \`/state/devices\` · 진단 ERROR "→ ~/reboot_motors" | ✅ \`:98, :376~396, :181~\` · \`state_manager.cpp:95~101\` |
| ⑤ 재부팅 요청 | 운영 도구 → \`manual_control\` → 서비스 | \`/cmd/manual/reboot_motors\` → 📞 \`/beebotsystem/reboot_motors\` → 에러 > 0 인 모터만 \`reboot_mask_\` | ✅ \`manual_control.cpp:23~24\` · \`beebot_system_hardware.cpp:410~431\` |
| ⑥ R 줄 | \`write_serial\` → 펌웨어 | \`R,<8필드>\` → \`dxl.reboot\` → 응답 대기(최대 1 s) → 설정 · 토크 다시 켜기 → **팔은 느린 복귀** → 바로 E 줄 | ✅ \`:463~469\` · \`beebot_opencr.ino:489~516\` |

- **E 줄은 칸으로 가지 않는다.** S 줄 값은 state 칸(\`joint2/position\` …)에 들어가 컨트롤러가 읽지만, 모터 에러는 컨트롤러 일이 아니라서 멤버 변수 → \`/motor_status\` · 진단으로만 나간다. 그래서 모터에 에러가 나도 **컨트롤러는 계속 active**다 — 그 관절은 토크가 꺼져 명령을 따르지 못할 뿐이다.
- **자동 재부팅은 없다** — 펌웨어도(\`beebot_opencr.ino:585\` 주석), SBC도 사람이 요청해야 한다. 걸린 채 다시 힘을 주지 않으려는 것이다(\`firmware/README.md\` 모터 에러 항목).
- **응답 없음(−1)은 재부팅 대상이 아니다** — 모터가 대답을 안 하면 재부팅 명령도 못 받는다. 12V · 배선을 먼저 본다(서비스 응답 문구).
`,
  },
};
const ORDER = Object.keys(SECTIONS) as Sec[];

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosControl extends w.HTMLElement {
    private sec?: Sec;

    /** ?concept=nodeops&tab=ros2control&cs=섹션 — 클릭 push·뒤로가기·딥링크 */
    @subscribeSwcAppRouteChange('/ros2', { trigger: 'connectedDone' })
    onRoute(@swcAppRouteQueryParam('concept') concept: string | null, @swcAppRouteQueryParam('tab') tab: string | null, @swcAppRouteQueryParam('cs') cs: string | null) {
      if (concept !== 'nodeops' || tab !== 'ros2control') return;
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
      return { path: `/ros2?concept=nodeops&tab=ros2control&cs=${sec}`, scrollToTop: false };
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
