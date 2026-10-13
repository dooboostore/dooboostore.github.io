// ROS 2 파라미터 사전 데이터 — 생성 파일.
// 출처: Nav2 docs.nav2.org(jazzy), ros2_controllers·ros2_control(jazzy) 파라미터 정의 YAML, robot_localization 문서,
// realsense-ros README, rtabmap_ros 소스, rtabmap Parameters.h. 설명(ko)은 원문(en)을 바탕으로 한국어로 정리.

export type ParamDoc = {
  name: string; type: string; default: string; ko: string;
  en?: string; design?: string; key?: string | null; ro?: boolean;
};
export type ParamGroup = {
  id: string; cat: string; title: string; pkg: string; node: string; kind: string;
  desc: string; source: string; params: ParamDoc[];
};

export const PARAM_GROUPS: ParamGroup[] = [
 {
  "id": "common",
  "cat": "공통",
  "title": "모든 노드 공통",
  "pkg": "rclcpp / rclpy",
  "node": "/<노드>",
  "kind": "모든 노드",
  "desc": "ROS 2 노드라면 따로 선언하지 않아도 생기는 파라미터. YAML에서는 노드 이름 아래 ros__parameters에 둔다.",
  "source": "ROS 2 Jazzy rclcpp/rclpy",
  "params": [
   {
    "name": "use_sim_time",
    "type": "bool",
    "default": "false",
    "ko": "/clock 토픽(시뮬레이터 시각)을 시간으로 쓸지. Isaac Sim·Gazebo와 함께 쓸 땐 관련 노드 모두 true로 맞춘다 — 하나라도 다르면 TF 시간 오류가 난다.",
    "design": "실기: false / Isaac Sim 학습·검증: true",
    "key": "use_sim_time"
   },
   {
    "name": "qos_overrides.<토픽>.<publisher|subscription>.<정책>",
    "type": "string / int",
    "default": "—",
    "ko": "노드가 QoS 덮어쓰기를 허용한 토픽에 한해 launch·YAML에서 QoS(reliability, durability, history, depth, deadline ...)를 바꾼다. 허용하지 않은 토픽에는 효과가 없다.",
    "key": null
   },
   {
    "name": "start_type_description_service",
    "type": "bool",
    "default": "true",
    "ko": "Jazzy부터 노드가 ~/get_type_description 서비스로 자기가 쓰는 메시지 타입 정의를 알려 줄지.",
    "key": "start_type_description_service"
   }
  ]
 },
 {
  "id": "robot_state_publisher",
  "cat": "센서·TF",
  "title": "robot_state_publisher",
  "pkg": "robot_state_publisher",
  "node": "/robot_state_publisher",
  "kind": "노드",
  "desc": "URDF와 /joint_states로 로봇 링크 TF를 계산해 발행한다.",
  "source": "github.com/ros/robot_state_publisher (jazzy) README",
  "params": [
   {
    "name": "robot_description",
    "type": "string",
    "default": "(필수)",
    "ko": "URDF 문자열. 시작할 때 반드시 넣어야 하고, 바꾸면 /robot_description 토픽에도 반영된다.",
    "design": "xacro로 만든 URDF (TB3 + OM-X + RealSense 2대 + ros2_control 태그)",
    "key": "robot_description"
   },
   {
    "name": "publish_frequency",
    "type": "double",
    "default": "20.0",
    "ko": "움직이는 관절 TF(/tf)를 발행하는 최대 주기(Hz).",
    "key": "publish_frequency"
   },
   {
    "name": "ignore_timestamp",
    "type": "bool",
    "default": "false",
    "ko": "true면 시각과 상관없이 모든 joint_states를 반영, false면 publish_frequency보다 새로운 것만.",
    "key": "ignore_timestamp"
   },
   {
    "name": "frame_prefix",
    "type": "string",
    "default": "''",
    "ko": "발행하는 TF 프레임 이름 앞에 붙일 접두사 (로봇 여러 대일 때).",
    "key": "frame_prefix"
   }
  ]
 },
 {
  "id": "realsense2_camera",
  "cat": "센서·TF",
  "title": "realsense2_camera",
  "pkg": "realsense2_camera",
  "node": "/<camera_namespace>/<camera_name>",
  "kind": "노드",
  "desc": "Intel RealSense 드라이버. 카메라마다 하나씩 띄우고 serial_no·camera_name으로 구분한다. 이 설계는 /pole_cam, /gripper_cam.",
  "source": "github.com/IntelRealSense/realsense-ros (ros2-master) README",
  "params": [
   {
    "name": "camera_name",
    "type": "string",
    "default": "camera",
    "ko": "카메라 이름 — 노드 이름이자 프레임 접두사.",
    "design": "pole_cam / gripper_cam",
    "key": "camera_name"
   },
   {
    "name": "camera_namespace",
    "type": "string",
    "default": "camera",
    "ko": "토픽 네임스페이스. 빈 문자열이면 /<camera_name>/... 으로 짧아진다.",
    "design": "''",
    "key": "camera_namespace"
   },
   {
    "name": "serial_no",
    "type": "string",
    "default": "(첫 장치)",
    "ko": "연결할 장치 시리얼. 숫자만이면 앞에 _를 붙인다 (예: _831612073525).",
    "design": "카메라별 시리얼",
    "key": "serial_no"
   },
   {
    "name": "usb_port_id",
    "type": "string",
    "default": "(무시)",
    "ko": "연결할 USB 포트 (예: 4-1).",
    "key": "usb_port_id"
   },
   {
    "name": "device_type",
    "type": "string",
    "default": "(무시)",
    "ko": "이름이 이 정규식과 맞는 장치에 연결 (예: d435).",
    "key": "device_type"
   },
   {
    "name": "enable_<stream>",
    "type": "bool",
    "default": "true(영상) / false(gyro·accel)",
    "ko": "스트림 켜기: color, depth, infra1, infra2, gyro, accel.",
    "design": "color·depth: true",
    "key": "enable_color"
   },
   {
    "name": "rgb_camera.color_profile",
    "type": "string",
    "default": "(장치 기본)",
    "ko": "컬러 해상도·fps \"가로x세로x fps\". 실행 중 변경 가능 (스트림 재시작 필요).",
    "design": "640x480x30 (gripper_cam 15fps)",
    "key": "rgb_camera.color_profile"
   },
   {
    "name": "depth_module.depth_profile",
    "type": "string",
    "default": "(장치 기본)",
    "ko": "depth 해상도·fps.",
    "design": "640x480x30",
    "key": "depth_module.depth_profile"
   },
   {
    "name": "<stream>_format",
    "type": "string",
    "default": "(장치 기본)",
    "ko": "스트림 픽셀 형식 (예: depth_module.depth_format:=Z16, rgb_camera.color_format:=RGB8).",
    "key": "color_format"
   },
   {
    "name": "align_depth.enable",
    "type": "bool",
    "default": "false",
    "ko": "depth를 컬러 영상에 픽셀 정렬해 /aligned_depth_to_color/image_raw로 낸다.",
    "design": "true",
    "key": "align_depth.enable"
   },
   {
    "name": "pointcloud.enable",
    "type": "bool",
    "default": "false",
    "ko": "점구름 /depth/color/points를 낸다.",
    "design": "true",
    "key": "pointcloud.enable"
   },
   {
    "name": "decimation_filter.enable",
    "type": "bool",
    "default": "false",
    "ko": "depth 해상도를 줄이는 후처리 (점구름 부하 감소).",
    "design": "true (pole_cam)",
    "key": "decimation_filter.enable"
   },
   {
    "name": "spatial_filter.enable",
    "type": "bool",
    "default": "false",
    "ko": "공간 평활 필터.",
    "key": "spatial_filter.enable"
   },
   {
    "name": "temporal_filter.enable",
    "type": "bool",
    "default": "false",
    "ko": "시간 평활 필터 (깜빡이는 depth 감소).",
    "key": "temporal_filter.enable"
   },
   {
    "name": "hole_filling_filter.enable",
    "type": "bool",
    "default": "false",
    "ko": "depth 빈칸 채우기.",
    "key": "hole_filling_filter.enable"
   },
   {
    "name": "enable_sync",
    "type": "bool",
    "default": "false",
    "ko": "여러 스트림을 같은 시각 표시로 묶어 보낸다 (점구름을 켜면 자동).",
    "key": "enable_sync"
   },
   {
    "name": "<stream>_qos",
    "type": "string",
    "default": "—",
    "ko": "스트림 토픽 QoS: SENSOR_DATA, DEFAULT, SYSTEM_DEFAULT ...",
    "key": "color_qos"
   },
   {
    "name": "unite_imu_method",
    "type": "int",
    "default": "0",
    "ko": "gyro+accel을 /imu 하나로 합치는 방법: 0 없음, 1 복사, 2 선형 보간.",
    "key": "unite_imu_method"
   },
   {
    "name": "publish_tf",
    "type": "bool",
    "default": "true",
    "ko": "카메라 내부 프레임 TF를 발행할지. URDF에 이미 있으면 false.",
    "key": "publish_tf"
   },
   {
    "name": "tf_publish_rate",
    "type": "double",
    "default": "0.0",
    "ko": "동적 TF 발행 주기(Hz). 0이면 정적 TF만.",
    "key": "tf_publish_rate"
   },
   {
    "name": "base_frame_id",
    "type": "string",
    "default": "link",
    "ko": "카메라 루트 프레임 접미사 → <camera_name>_link.",
    "key": "base_frame_id"
   },
   {
    "name": "tf_prefix",
    "type": "string",
    "default": "''",
    "ko": "모든 프레임 이름 앞 접두사.",
    "key": "tf_prefix"
   },
   {
    "name": "clip_distance",
    "type": "double",
    "default": "음수(끔)",
    "ko": "이 거리(m)보다 먼 depth를 지운다.",
    "key": "clip_distance"
   },
   {
    "name": "initial_reset",
    "type": "bool",
    "default": "false",
    "ko": "시작 전에 장치를 리셋 (제대로 안 닫혔을 때).",
    "key": "initial_reset"
   },
   {
    "name": "reconnect_timeout",
    "type": "double",
    "default": "—",
    "ko": "연결 실패 시 다시 시도하는 간격(s).",
    "key": "reconnect_timeout"
   },
   {
    "name": "wait_for_device_timeout",
    "type": "double",
    "default": "음수(무한)",
    "ko": "장치를 찾을 때까지 기다리는 시간(s).",
    "key": "wait_for_device_timeout"
   },
   {
    "name": "diagnostics_period",
    "type": "double",
    "default": "0",
    "ko": "/diagnostics 발행 주기(s). 0 이하면 끔.",
    "key": "diagnostics_period"
   },
   {
    "name": "depth_module.emitter_enabled",
    "type": "int",
    "default": "(장치 기본)",
    "ko": "적외선 패턴 투사기 (0 끔, 1 켬, 2 자동). 실행 중 변경 가능.",
    "key": "depth_module.emitter_enabled"
   }
  ]
 },
 {
  "id": "ctl_controller_manager",
  "cat": "ros2_control",
  "title": "controller_manager",
  "pkg": "controller_manager",
  "node": "/controller_manager",
  "kind": "노드",
  "desc": "ros2_control 실시간 루프. 컨트롤러 이름과 타입(<이름>.type)도 여기에 적는다.",
  "source": "github.com/ros-controls/ros2_control (jazzy) controller_manager_parameters.yaml",
  "params": [
   {
    "name": "update_rate",
    "type": "int",
    "default": "100",
    "ko": "read → update → write 실시간 루프 주기(Hz). 모든 컨트롤러의 기본 주기.",
    "en": "The frequency of controller manager's real-time update loop. This loop reads states from hardware, updates controllers and writes commands to hardware.",
    "key": "update_rate",
    "design": "100",
    "ro": true
   },
   {
    "name": "enforce_command_limits",
    "type": "bool",
    "default": "false",
    "ko": "URDF에 적힌 한계로 명령을 잘라낼지.",
    "en": "If true, the controller manager will enforce command limits defined in the robot description. If false, no limits will be enforced. If true, when the command is outside the limits, the command is clamped to be within the limits depending on the type of configured joint limits defined in the robot description. If the command is within the limits, the command is passed through without any changes.",
    "key": "enforce_command_limits",
    "ro": true
   },
   {
    "name": "handle_exceptions",
    "type": "bool",
    "default": "true",
    "ko": "컨트롤러·하드웨어 예외를 잡아서 계속 돌지.",
    "en": "If true, the controller manager will catch exceptions thrown during the different operations of controllers and hardware components. If false, exceptions will propagate up and will cause the controller manager to crash.",
    "key": "handle_exceptions",
    "ro": true
   },
   {
    "name": "hardware_components_initial_state.unconfigured",
    "type": "string_array",
    "default": "[]",
    "ko": "시작 때 로드만 하고 둘 하드웨어 컴포넌트.",
    "en": "Defines which hardware components will be only loaded when controller manager is started. These hardware components will need to be configured and activated manually or via a hardware spawner.",
    "key": "hardware_components_initial_state.unconfigured"
   },
   {
    "name": "hardware_components_initial_state.inactive",
    "type": "string_array",
    "default": "[]",
    "ko": "시작 때 configure까지만 할 하드웨어 컴포넌트.",
    "en": "Defines which hardware components will be configured when controller manager is started. These hardware components will need to be activated manually or via a hardware spawner.",
    "key": "hardware_components_initial_state.inactive"
   },
   {
    "name": "hardware_components_initial_state.shutdown_on_initial_state_failure",
    "type": "bool",
    "default": "true",
    "ko": "초기 상태 설정에 실패하면 controller_manager를 끌지.",
    "en": "Specifies whether the controller manager should shut down if setting the desired initial state fails during startup.",
    "key": "hardware_components_initial_state.shutdown_on_initial_state_failure",
    "ro": true
   },
   {
    "name": "defaults.switch_controller.strictness",
    "type": "string",
    "default": "best_effort",
    "ko": "컨트롤러 전환 기본 방식: best_effort 또는 strict.",
    "en": "The default switch controller strategy. This strategy is used when no strategy is specified in the switch_controller service call.",
    "key": "defaults.switch_controller.strictness"
   },
   {
    "name": "defaults.allow_controller_activation_with_inactive_hardware",
    "type": "bool",
    "default": "false",
    "ko": "비활성 하드웨어의 인터페이스도 컨트롤러가 잡게 할지.",
    "en": "If true, controllers are allowed to claim resources from inactive hardware components. If false, controllers can only claim resources from active hardware components. However, it is not recommended to set this parameter to true for the safety reasons with the hardware and unexpected movement, this is purely added for backward compatibility.",
    "key": "defaults.allow_controller_activation_with_inactive_hardware",
    "ro": true
   },
   {
    "name": "defaults.deactivate_controllers_on_hardware_self_deactivate",
    "type": "bool",
    "default": "true",
    "ko": "하드웨어가 스스로 비활성화되면 그 인터페이스를 쓰는 컨트롤러도 끌지.",
    "en": "If set to true, when a hardware component returns DEACTIVATE on the write cycle, controllers using those interfaces will be deactivated. When set to false, controllers using those interfaces will continue to run. It is not recommended to set this parameter to false for safety reasons with hardware. This will be the default behaviour of the controller manager and this parameter will be removed in future releases. Please use with caution.",
    "key": "defaults.deactivate_controllers_on_hardware_self_deactivate",
    "ro": true
   },
   {
    "name": "diagnostics.threshold.controller_manager.periodicity.mean_error.warn",
    "type": "double",
    "default": "5.0",
    "ko": "주기(Hz) 평균 오차가 이 값을 넘으면 /diagnostics에 경고.",
    "en": "The warning threshold for the mean error of the controller manager's periodicity in Hz. If the mean error exceeds this threshold, a warning diagnostic will be published.",
    "key": "diagnostics.threshold.controller_manager.periodicity.mean_error.warn"
   },
   {
    "name": "diagnostics.threshold.controller_manager.periodicity.mean_error.error",
    "type": "double",
    "default": "10.0",
    "ko": "주기(Hz) 평균 오차가 이 값을 넘으면 /diagnostics에 오류.",
    "en": "The error threshold for the mean error of the controller manager's periodicity in Hz. If the mean error exceeds this threshold, an error diagnostic will be published.",
    "key": "diagnostics.threshold.controller_manager.periodicity.mean_error.error"
   },
   {
    "name": "diagnostics.threshold.controller_manager.periodicity.standard_deviation.warn",
    "type": "double",
    "default": "5.0",
    "ko": "주기(Hz) 표준편차가 이 값을 넘으면 경고.",
    "en": "The warning threshold for the standard deviation of the controller manager's periodicity in Hz. If the standard deviation exceeds this threshold, a warning diagnostic will be published.",
    "key": "diagnostics.threshold.controller_manager.periodicity.standard_deviation.warn"
   },
   {
    "name": "diagnostics.threshold.controller_manager.periodicity.standard_deviation.error",
    "type": "double",
    "default": "10.0",
    "ko": "주기(Hz) 표준편차가 이 값을 넘으면 오류.",
    "en": "The error threshold for the standard deviation of the controller manager's periodicity in Hz. If the standard deviation exceeds this threshold, an error diagnostic will be published.",
    "key": "diagnostics.threshold.controller_manager.periodicity.standard_deviation.error"
   },
   {
    "name": "diagnostics.threshold.controllers.periodicity.mean_error.warn",
    "type": "double",
    "default": "5.0",
    "ko": "주기(Hz) 평균 오차가 이 값을 넘으면 /diagnostics에 경고.",
    "en": "The warning threshold for the mean error of the controller update loop in Hz. If the mean error exceeds this threshold, a warning diagnostic will be published.",
    "key": "diagnostics.threshold.controllers.periodicity.mean_error.warn"
   },
   {
    "name": "diagnostics.threshold.controllers.periodicity.mean_error.error",
    "type": "double",
    "default": "10.0",
    "ko": "주기(Hz) 평균 오차가 이 값을 넘으면 /diagnostics에 오류.",
    "en": "The error threshold for the mean error of the controller update loop in Hz. If the mean error exceeds this threshold, an error diagnostic will be published.",
    "key": "diagnostics.threshold.controllers.periodicity.mean_error.error"
   },
   {
    "name": "diagnostics.threshold.controllers.periodicity.standard_deviation.warn",
    "type": "double",
    "default": "5.0",
    "ko": "주기(Hz) 표준편차가 이 값을 넘으면 경고.",
    "en": "The warning threshold for the standard deviation of the controller update loop in Hz. If the standard deviation exceeds this threshold, a warning diagnostic will be published.",
    "key": "diagnostics.threshold.controllers.periodicity.standard_deviation.warn"
   },
   {
    "name": "diagnostics.threshold.controllers.periodicity.standard_deviation.error",
    "type": "double",
    "default": "10.0",
    "ko": "주기(Hz) 표준편차가 이 값을 넘으면 오류.",
    "en": "The error threshold for the standard deviation of the controller update loop in Hz. If the standard deviation exceeds this threshold, an error diagnostic will be published.",
    "key": "diagnostics.threshold.controllers.periodicity.standard_deviation.error"
   },
   {
    "name": "diagnostics.threshold.controllers.execution_time.mean_error.warn",
    "type": "double",
    "default": "1000.0",
    "ko": "한 주기 실행 시간(µs) 평균이 이 값을 넘으면 경고.",
    "en": "The warning threshold for the mean error of the controller's update cycle execution time in microseconds. If the mean error exceeds this threshold, a warning diagnostic will be published.",
    "key": "diagnostics.threshold.controllers.execution_time.mean_error.warn"
   },
   {
    "name": "diagnostics.threshold.controllers.execution_time.mean_error.error",
    "type": "double",
    "default": "2000.0",
    "ko": "한 주기 실행 시간(µs) 평균이 이 값을 넘으면 오류.",
    "en": "The error threshold for the mean error of the controller's update cycle execution time in microseconds. If the mean error exceeds this threshold, an error diagnostic will be published.",
    "key": "diagnostics.threshold.controllers.execution_time.mean_error.error"
   },
   {
    "name": "diagnostics.threshold.controllers.execution_time.standard_deviation.warn",
    "type": "double",
    "default": "100.0",
    "ko": "실행 시간(µs) 표준편차가 이 값을 넘으면 경고.",
    "en": "The warning threshold for the standard deviation of the controller's update cycle execution time in microseconds. If the standard deviation exceeds this threshold, a warning diagnostic will be published.",
    "key": "diagnostics.threshold.controllers.execution_time.standard_deviation.warn"
   },
   {
    "name": "diagnostics.threshold.controllers.execution_time.standard_deviation.error",
    "type": "double",
    "default": "200.0",
    "ko": "실행 시간(µs) 표준편차가 이 값을 넘으면 오류.",
    "en": "The error threshold for the standard deviation of the controller's update cycle execution time in microseconds. If the standard deviation exceeds this threshold, an error diagnostic will be published.",
    "key": "diagnostics.threshold.controllers.execution_time.standard_deviation.error"
   },
   {
    "name": "diagnostics.threshold.hardware_components.periodicity.mean_error.warn",
    "type": "double",
    "default": "5.0",
    "ko": "주기(Hz) 평균 오차가 이 값을 넘으면 /diagnostics에 경고.",
    "en": "The warning threshold for the mean error of the hardware component's read/write loop in Hz. If the mean error exceeds this threshold, a warning diagnostic will be published.",
    "key": "diagnostics.threshold.hardware_components.periodicity.mean_error.warn"
   },
   {
    "name": "diagnostics.threshold.hardware_components.periodicity.mean_error.error",
    "type": "double",
    "default": "10.0",
    "ko": "주기(Hz) 평균 오차가 이 값을 넘으면 /diagnostics에 오류.",
    "en": "The error threshold for the mean error of the hardware component's read/write loop in Hz. If the mean error exceeds this threshold, an error diagnostic will be published.",
    "key": "diagnostics.threshold.hardware_components.periodicity.mean_error.error"
   },
   {
    "name": "diagnostics.threshold.hardware_components.periodicity.standard_deviation.warn",
    "type": "double",
    "default": "5.0",
    "ko": "주기(Hz) 표준편차가 이 값을 넘으면 경고.",
    "en": "The warning threshold for the standard deviation of the hardware component's read/write loop in Hz. If the standard deviation exceeds this threshold, a warning diagnostic will be published.",
    "key": "diagnostics.threshold.hardware_components.periodicity.standard_deviation.warn"
   },
   {
    "name": "diagnostics.threshold.hardware_components.periodicity.standard_deviation.error",
    "type": "double",
    "default": "10.0",
    "ko": "주기(Hz) 표준편차가 이 값을 넘으면 오류.",
    "en": "The error threshold for the standard deviation of the hardware component's read/write loop in Hz. If the standard deviation exceeds this threshold, an error diagnostic will be published.",
    "key": "diagnostics.threshold.hardware_components.periodicity.standard_deviation.error"
   },
   {
    "name": "diagnostics.threshold.hardware_components.execution_time.mean_error.warn",
    "type": "double",
    "default": "1000.0",
    "ko": "한 주기 실행 시간(µs) 평균이 이 값을 넘으면 경고.",
    "en": "The warning threshold for the mean error of the hardware component's read/write cycle execution time in microseconds. If the mean error exceeds this threshold, a warning diagnostic will be published.",
    "key": "diagnostics.threshold.hardware_components.execution_time.mean_error.warn"
   },
   {
    "name": "diagnostics.threshold.hardware_components.execution_time.mean_error.error",
    "type": "double",
    "default": "2000.0",
    "ko": "한 주기 실행 시간(µs) 평균이 이 값을 넘으면 오류.",
    "en": "The error threshold for the mean error of the hardware component's read/write cycle execution time in microseconds. If the mean error exceeds this threshold, a error diagnostic will be published.",
    "key": "diagnostics.threshold.hardware_components.execution_time.mean_error.error"
   },
   {
    "name": "diagnostics.threshold.hardware_components.execution_time.standard_deviation.warn",
    "type": "double",
    "default": "100.0",
    "ko": "실행 시간(µs) 표준편차가 이 값을 넘으면 경고.",
    "en": "The warning threshold for the standard deviation of the hardware component's read/write cycle execution time in microseconds. If the standard deviation exceeds this threshold, a warning diagnostic will be published.",
    "key": "diagnostics.threshold.hardware_components.execution_time.standard_deviation.warn"
   },
   {
    "name": "diagnostics.threshold.hardware_components.execution_time.standard_deviation.error",
    "type": "double",
    "default": "200.0",
    "ko": "실행 시간(µs) 표준편차가 이 값을 넘으면 오류.",
    "en": "The error threshold for the standard deviation of the hardware component's update cycle execution time in microseconds. If the standard deviation exceeds this threshold, an error diagnostic will be published.",
    "key": "diagnostics.threshold.hardware_components.execution_time.standard_deviation.error"
   },
   {
    "name": "overruns.print_warnings",
    "type": "bool",
    "default": "''",
    "ko": "실시간 루프가 주기를 넘기면 경고를 출력할지.",
    "en": "If true, the controller manager will print a warning message to the console if an overrun is detected in its real-time loop (``read``, ``update`` and ``write``). By default, it is set to true, except when used with ``use_sim_time`` parameter set to true.",
    "key": "overruns.print_warnings"
   }
  ]
 },
 {
  "id": "ctl_joint_trajectory_controller",
  "cat": "ros2_control",
  "title": "JointTrajectoryController",
  "pkg": "joint_trajectory_controller",
  "node": "/arm_controller",
  "kind": "컨트롤러",
  "desc": "팔 궤적 실행 컨트롤러. 이 설계에서는 arm_controller.",
  "source": "github.com/ros-controls/ros2_controllers (jazzy) — generate_parameter_library 정의",
  "params": [
   {
    "name": "joints",
    "type": "string_array",
    "default": "[]",
    "ko": "이 컨트롤러가 다루는 관절 이름.",
    "en": "Joint names of the system",
    "key": "joints",
    "design": "[joint1, joint2, joint3, joint4]",
    "ro": true
   },
   {
    "name": "command_joints",
    "type": "string_array",
    "default": "[]",
    "ko": "명령을 쓸 관절(인터페이스) 이름. 비우면 joints. 체인에서 다음 컨트롤러의 reference에 쓸 때 지정한다.",
    "en": "Joint names to control. If left empty, ``joints`` will be used. This parameters can be used if: * JTC is used in a controller chain where command and state interfaces don't have same names. * If the number of command joints is smaller than the degrees-of-freedom. For example to track the state and error of passive joints. ``command_joints`` must then be a subset of ``joints``.",
    "key": "command_joints",
    "design": "[rl_arm_correction/joint1 … joint4] (체인)",
    "ro": true
   },
   {
    "name": "command_interfaces",
    "type": "string_array",
    "default": "[]",
    "ko": "쓸 명령 인터페이스 (position, velocity, effort, acceleration 조합).",
    "en": "Command interfaces provided by the hardware interface for all joints",
    "key": "command_interfaces",
    "design": "[position]",
    "ro": true
   },
   {
    "name": "state_interfaces",
    "type": "string_array",
    "default": "[]",
    "ko": "읽을 상태 인터페이스 (position, velocity, acceleration).",
    "en": "State interfaces provided by the hardware for all joints.",
    "key": "state_interfaces",
    "design": "[position, velocity]",
    "ro": true
   },
   {
    "name": "speed_scaling.initial_scaling_factor",
    "type": "double",
    "default": "1.0",
    "ko": "하드웨어와 주고받기 전의 초기 속도 배율.",
    "en": "The initial value of the scaling factor if no exchange with hardware takes place.",
    "key": "speed_scaling.initial_scaling_factor",
    "ro": true
   },
   {
    "name": "speed_scaling.state_interface",
    "type": "string",
    "default": "''",
    "ko": "속도 배율을 읽어 올 상태 인터페이스 이름.",
    "en": "Fully qualified name of the speed scaling state interface name",
    "key": "speed_scaling.state_interface",
    "ro": true
   },
   {
    "name": "speed_scaling.command_interface",
    "type": "string",
    "default": "''",
    "ko": "속도 배율을 하드웨어에 쓸 명령 인터페이스 이름.",
    "en": "Command interface name used for setting the speed scaling factor on the hardware.",
    "key": "speed_scaling.command_interface",
    "ro": true
   },
   {
    "name": "allow_partial_joints_goal",
    "type": "bool",
    "default": "false",
    "ko": "일부 관절만 담은 궤적 goal을 허용할지.",
    "en": "Allow joint goals defining trajectory for only some joints.",
    "key": "allow_partial_joints_goal"
   },
   {
    "name": "open_loop_control",
    "type": "bool",
    "default": "false",
    "ko": "(지원 중단) interpolate_from_desired_state + 게인 0을 쓴다.",
    "en": "deprecated: use ``interpolate_from_desired_state`` and set feedback gains to zero instead",
    "key": "open_loop_control",
    "ro": true
   },
   {
    "name": "interpolate_from_desired_state",
    "type": "bool",
    "default": "false",
    "ko": "새 궤적을 받으면 실제 상태 대신 직전 목표 상태에서 이어 보간할지.",
    "en": "Interpolate from the current desired state when receiving a new trajectory. The controller ignores the states provided by hardware interface but using last commands as states for starting the trajectory interpolation. This is useful if hardware states are not following commands, i.e., an offset between those (typical for hydraulic manipulators). Furthermore, it is necessary if you have a reference trajectory that you send over multiple messages (e.g. for MPC-style trajectory planning). If this flag is set, the controller tries to read the values from the command interfaces on activation. If they have real numeric values, those will be used instead of state interfaces. Therefore it is important set command interfaces to NaN (i.e., ``std::numeric_limits<double>::quiet_NaN()``) or state values when the hardware is started. ",
    "key": "interpolate_from_desired_state",
    "ro": true
   },
   {
    "name": "allow_integration_in_goal_trajectories",
    "type": "bool",
    "default": "false",
    "ko": "위치·속도 없이 가속도만 있는 궤적도 적분해서 받을지.",
    "en": "Allow integration in goal trajectories to accept goals without position or velocity specified",
    "key": "allow_integration_in_goal_trajectories"
   },
   {
    "name": "set_last_command_interface_value_as_state_on_activation",
    "type": "bool",
    "default": "true",
    "ko": "활성화할 때 마지막 명령값을 현재 상태로 쓸지.",
    "en": "When set to true, the last command interface value is used as both the current state and the last commanded state upon activation. If an interface (e.g. velocity) is available only as state and not command, the state is used. Use this to prevent sagging/jumps on activation when using soft or compliant hardware. When set to false, the current state is used for both.",
    "key": "set_last_command_interface_value_as_state_on_activation"
   },
   {
    "name": "action_monitor_rate",
    "type": "double",
    "default": "20.0",
    "ko": "액션 실행 중 상태를 확인하는 주기(Hz).",
    "en": "Rate to monitor status changes when the controller is executing action (``control_msgs::action::FollowJointTrajectory``)",
    "key": "action_monitor_rate",
    "ro": true
   },
   {
    "name": "interpolation_method",
    "type": "string",
    "default": "splines",
    "ko": "점 사이 보간 방식: splines 또는 none.",
    "en": "The type of interpolation to use, if any",
    "key": "interpolation_method",
    "ro": true
   },
   {
    "name": "allow_nonzero_velocity_at_trajectory_end",
    "type": "bool",
    "default": "false",
    "ko": "false면 마지막 점 속도가 0이 아닌 궤적을 거부.",
    "en": "If false, the last velocity point has to be zero or the goal will be rejected",
    "key": "allow_nonzero_velocity_at_trajectory_end"
   },
   {
    "name": "cmd_timeout",
    "type": "double",
    "default": "0.0",
    "ko": "궤적 끝 이후 입력이 오래됐다고 보는 시간(s). 0이면 끔.",
    "en": "Timeout after which the input command is considered stale. Timeout is counted from the end of the trajectory (the last point). ``cmd_timeout`` must be greater than ``constraints.goal_time``, otherwise ignored. If zero, timeout is deactivated",
    "key": "cmd_timeout"
   },
   {
    "name": "action_execution_timeout",
    "type": "double",
    "default": "0.0",
    "ko": "궤적 시작부터의 절대 제한 시간(s). 넘으면 abort. 0이면 끔.",
    "en": "Absolute wall-clock timeout from trajectory start. When exceeded, the goal is aborted with GOAL_TOLERANCE_VIOLATED. If zero, timeout is disabled. This is a controller-level parameter (not per-goal). Distinct from ``constraints.goal_time``, a per-goal grace period after the last trajectory point.",
    "key": "action_execution_timeout"
   },
   {
    "name": "gains.__map_joints.p",
    "type": "double",
    "default": "0.0",
    "ko": "관절별 PID P 게인 (velocity/effort 명령일 때).",
    "en": "Proportional gain :math:`k_p` for PID",
    "key": "gains.joint2.p"
   },
   {
    "name": "gains.__map_joints.i",
    "type": "double",
    "default": "0.0",
    "ko": "관절별 PID I 게인.",
    "en": "Integral gain :math:`k_i` for PID",
    "key": "gains.joint2.i"
   },
   {
    "name": "gains.__map_joints.d",
    "type": "double",
    "default": "0.0",
    "ko": "관절별 PID D 게인.",
    "en": "Derivative gain :math:`k_d` for PID",
    "key": "gains.joint2.d"
   },
   {
    "name": "gains.__map_joints.i_clamp",
    "type": "double",
    "default": "Infinity",
    "ko": "(지원 중단) i_clamp_max/min을 쓴다.",
    "en": "[Deprecated, use i_clamp_max/i_clamp_min] Integral clamp. Symmetrical in both positive and negative direction.",
    "key": "gains.joint2.i_clamp"
   },
   {
    "name": "gains.__map_joints.i_clamp_max",
    "type": "double",
    "default": "Infinity",
    "ko": "적분항 상한.",
    "en": "Upper integral clamp.",
    "key": "gains.joint2.i_clamp_max"
   },
   {
    "name": "gains.__map_joints.i_clamp_min",
    "type": "double",
    "default": "-Infinity",
    "ko": "적분항 하한.",
    "en": "Lower integral clamp.",
    "key": "gains.joint2.i_clamp_min"
   },
   {
    "name": "gains.__map_joints.ff_velocity_scale",
    "type": "double",
    "default": "0.0",
    "ko": "속도 피드포워드 배율.",
    "en": "Feed-forward scaling :math:`k_{ff}` of velocity",
    "key": "gains.joint2.ff_velocity_scale"
   },
   {
    "name": "gains.__map_joints.u_clamp_max",
    "type": "double",
    "default": "Infinity",
    "ko": "PID 출력 상한.",
    "en": "Upper output clamp.",
    "key": "gains.joint2.u_clamp_max"
   },
   {
    "name": "gains.__map_joints.u_clamp_min",
    "type": "double",
    "default": "-Infinity",
    "ko": "PID 출력 하한.",
    "en": "Lower output clamp.",
    "key": "gains.joint2.u_clamp_min"
   },
   {
    "name": "gains.__map_joints.antiwindup_strategy",
    "type": "string",
    "default": "legacy",
    "ko": "적분 와인드업 방지 방식.",
    "en": "Specifies the anti-windup strategy. Options: 'back_calculation', 'conditional_integration', 'legacy' or 'none'. Note that the 'back_calculation' strategy use the tracking_time_constant parameter to tune the anti-windup behavior.",
    "key": "gains.joint2.antiwindup_strategy",
    "ro": true
   },
   {
    "name": "gains.__map_joints.tracking_time_constant",
    "type": "double",
    "default": "0.0",
    "ko": "back_calculation 방식의 추종 시간 상수.",
    "en": "Specifies the tracking time constant for the 'back_calculation' strategy. If set to 0.0 when this strategy is selected, a recommended default value will be applied.",
    "key": "gains.joint2.tracking_time_constant"
   },
   {
    "name": "gains.__map_joints.error_deadband",
    "type": "double",
    "default": "0.0",
    "ko": "오차가 이 범위 안이면 적분을 멈춘다.",
    "en": "Is used to stop integration when the error is within the given range.",
    "key": "gains.joint2.error_deadband"
   },
   {
    "name": "constraints.stopped_velocity_tolerance",
    "type": "double",
    "default": "0.01",
    "ko": "궤적 끝에서 이 속도 아래면 멈춘 것으로 본다.",
    "en": "Velocity tolerance for at the end of the trajectory that indicates that controlled system is stopped.",
    "key": "constraints.stopped_velocity_tolerance",
    "design": "0.02"
   },
   {
    "name": "constraints.goal_time",
    "type": "double",
    "default": "0.0",
    "ko": "목표 시각 전후로 도착을 기다려 주는 시간(s). 0이면 무한정 기다린다.",
    "en": "Time tolerance for achieving trajectory goal before or after commanded time. If set to zero, the controller will wait a potentially infinite amount of time.",
    "key": "constraints.goal_time",
    "design": "0.5"
   },
   {
    "name": "constraints.decelerate_on_cancel",
    "type": "bool",
    "default": "false",
    "ko": "취소·위반 시 바로 멈추지 않고 감속해서 멈출지.",
    "en": "If true and each joints max_deceleration_on_cancel is greater than 0, decelerate to a stop when the request is canceled or the goal constraints are violated. Requires velocity state interface from all joints in the controller.",
    "key": "constraints.decelerate_on_cancel",
    "ro": true
   },
   {
    "name": "constraints.__map_joints.trajectory",
    "type": "double",
    "default": "0.0",
    "ko": "관절별 경로 중 허용 오차(rad). 넘으면 abort (0이면 검사 안 함).",
    "en": "Per-joint trajectory offset tolerance during movement.",
    "key": "constraints.joint2.trajectory",
    "design": "0.10 (joint2 — 막히면 JTC가 스스로 abort)"
   },
   {
    "name": "constraints.__map_joints.goal",
    "type": "double",
    "default": "0.0",
    "ko": "관절별 도착 허용 오차(rad).",
    "en": "Per-joint trajectory offset tolerance at the goal position.",
    "key": "constraints.joint2.goal",
    "design": "0.03"
   },
   {
    "name": "constraints.__map_joints.max_deceleration_on_cancel",
    "type": "double",
    "default": "0.0",
    "ko": "취소 시 정지 위치 계산에 쓰는 관절별 최대 감속도.",
    "en": "Per-joint max acceleration used to calculate the stopping position when a request is canceled or preempted.",
    "key": "constraints.joint2.max_deceleration_on_cancel",
    "ro": true
   }
  ]
 },
 {
  "id": "ctl_diff_drive_controller",
  "cat": "ros2_control",
  "title": "DiffDriveController",
  "pkg": "diff_drive_controller",
  "node": "/diff_drive_controller",
  "kind": "컨트롤러",
  "desc": "차동 구동 베이스: cmd_vel → 바퀴 속도, 바퀴 → 오도메트리.",
  "source": "github.com/ros-controls/ros2_controllers (jazzy) — generate_parameter_library 정의",
  "params": [
   {
    "name": "left_wheel_names",
    "type": "string_array",
    "default": "[]",
    "ko": "왼쪽 바퀴 관절 이름.",
    "en": "Names of the left side wheels' joints",
    "key": "left_wheel_names"
   },
   {
    "name": "right_wheel_names",
    "type": "string_array",
    "default": "[]",
    "ko": "오른쪽 바퀴 관절 이름.",
    "en": "Names of the right side wheels' joints",
    "key": "right_wheel_names"
   },
   {
    "name": "wheel_separation",
    "type": "double",
    "default": "0.0",
    "ko": "좌우 바퀴 사이 거리(m). 틀리면 회전이 어긋난다.",
    "en": "Shortest distance between the left and right wheels. If this parameter is wrong, the robot will not behave correctly in curves.",
    "key": "wheel_separation",
    "design": "0.287"
   },
   {
    "name": "wheel_radius",
    "type": "double",
    "default": "0.0",
    "ko": "바퀴 반경(m). 틀리면 이동 거리가 어긋난다.",
    "en": "Radius of a wheel, i.e., wheels size, used for transformation of linear velocity into wheel rotations. If this parameter is wrong the robot will move faster or slower than expected.",
    "key": "wheel_radius",
    "design": "0.033"
   },
   {
    "name": "wheel_separation_multiplier",
    "type": "double",
    "default": "1.0",
    "ko": "실제 바퀴 간격 보정 배율.",
    "en": "Correction factor when the actual wheel separation differs from the nominal value in the ``wheel_separation`` parameter.",
    "key": "wheel_separation_multiplier"
   },
   {
    "name": "left_wheel_radius_multiplier",
    "type": "double",
    "default": "1.0",
    "ko": "왼쪽 바퀴 반경 보정 배율.",
    "en": "Correction factor when radius of left wheels differs from the nominal value in ``wheel_radius`` parameter.",
    "key": "left_wheel_radius_multiplier"
   },
   {
    "name": "right_wheel_radius_multiplier",
    "type": "double",
    "default": "1.0",
    "ko": "오른쪽 바퀴 반경 보정 배율.",
    "en": "Correction factor when radius of right wheels differs from the nominal value in ``wheel_radius`` parameter.",
    "key": "right_wheel_radius_multiplier"
   },
   {
    "name": "tf_frame_prefix_enable",
    "type": "bool",
    "default": "true",
    "ko": "TF 프레임 이름 앞에 접두사를 붙일지.",
    "en": "Enables or disables appending tf_prefix to tf frame id's.",
    "key": "tf_frame_prefix_enable"
   },
   {
    "name": "tf_frame_prefix",
    "type": "string",
    "default": "''",
    "ko": "TF 프레임 접두사 (비우면 노드 네임스페이스).",
    "en": "(optional) Prefix to be appended to the tf frames, will be added to odom_id and base_frame_id before publishing. If the parameter is empty, controller's namespace will be used.",
    "key": "tf_frame_prefix"
   },
   {
    "name": "odom_frame_id",
    "type": "string",
    "default": "odom",
    "ko": "오도메트리 좌표계 이름.",
    "en": "Name of the frame for odometry. This frame is parent of ``base_frame_id`` when controller publishes odometry.",
    "key": "odom_frame_id"
   },
   {
    "name": "base_frame_id",
    "type": "string",
    "default": "base_link",
    "ko": "로봇 몸 좌표계 이름.",
    "en": "Name of the robot's base frame that is child of the odometry frame.",
    "key": "base_frame_id",
    "design": "base_footprint"
   },
   {
    "name": "pose_covariance_diagonal",
    "type": "double_array",
    "default": "[0.0, 0.0, 0.0, 0.0, 0.0, 0.0]",
    "ko": "오도메트리 자세 공분산 대각 6개 (로봇에 맞춰 튜닝).",
    "en": "Odometry covariance for the encoder output of the robot for the pose. These values should be tuned to your robot's sample odometry data, but these values are a good place to start: ``[0.001, 0.001, 0.001, 0.001, 0.001, 0.01]``.",
    "key": "pose_covariance_diagonal"
   },
   {
    "name": "twist_covariance_diagonal",
    "type": "double_array",
    "default": "[0.0, 0.0, 0.0, 0.0, 0.0, 0.0]",
    "ko": "오도메트리 속도 공분산 대각 6개.",
    "en": "Odometry covariance for the encoder output of the robot for the speed. These values should be tuned to your robot's sample odometry data, but these values are a good place to start: ``[0.001, 0.001, 0.001, 0.001, 0.001, 0.01]``.",
    "key": "twist_covariance_diagonal"
   },
   {
    "name": "open_loop",
    "type": "bool",
    "default": "false",
    "ko": "true면 바퀴 피드백 대신 명령값으로 오도메트리를 계산.",
    "en": "If set to true the odometry of the robot will be calculated from the commanded values and not from feedback.",
    "key": "open_loop"
   },
   {
    "name": "position_feedback",
    "type": "bool",
    "default": "true",
    "ko": "하드웨어가 바퀴 위치 피드백을 주는지.",
    "en": "Is there position feedback from hardware.",
    "key": "position_feedback"
   },
   {
    "name": "enable_odom_tf",
    "type": "bool",
    "default": "true",
    "ko": "odom→base TF를 발행할지.",
    "en": "Publish transformation between ``odom_frame_id`` and ``base_frame_id``.",
    "key": "enable_odom_tf",
    "design": "false (odom TF는 ekf가 냄)"
   },
   {
    "name": "cmd_vel_timeout",
    "type": "double",
    "default": "0.5",
    "ko": "명령이 이 시간(s) 끊기면 멈춘다. 0이면 끔.",
    "en": "Timeout in seconds after which a command received on the ``cmd_vel`` topic is considered stale. A value of 0.0 disables the timeout.",
    "key": "cmd_vel_timeout",
    "design": "0.5"
   },
   {
    "name": "publish_limited_velocity",
    "type": "bool",
    "default": "false",
    "ko": "한계 적용 후 속도를 발행할지.",
    "en": "Publish limited velocity value.",
    "key": "publish_limited_velocity"
   },
   {
    "name": "velocity_rolling_window_size",
    "type": "int",
    "default": "10",
    "ko": "오도메트리 평균 속도 계산 창 크기.",
    "en": "Size of the rolling window for calculation of mean velocity use in odometry.",
    "key": "velocity_rolling_window_size"
   },
   {
    "name": "publish_rate",
    "type": "double",
    "default": "50.0",
    "ko": "오도메트리·TF 발행 주기(Hz).",
    "en": "Publishing rate (Hz) of the odometry and TF messages.",
    "key": "publish_rate",
    "design": "50.0"
   },
   {
    "name": "linear.x.has_velocity_limits",
    "type": "bool",
    "default": "true",
    "ko": "(지원 중단) 제한을 끄려면 해당 한계값을 NaN으로 둔다.",
    "en": "deprecated, set the respective limits to ``.NAN`` for deactivation",
    "key": "linear.x.has_velocity_limits"
   },
   {
    "name": "linear.x.has_acceleration_limits",
    "type": "bool",
    "default": "true",
    "ko": "(지원 중단) 제한을 끄려면 해당 한계값을 NaN으로 둔다.",
    "en": "deprecated, set the respective limits to ``.NAN`` for deactivation",
    "key": "linear.x.has_acceleration_limits"
   },
   {
    "name": "linear.x.has_jerk_limits",
    "type": "bool",
    "default": "true",
    "ko": "(지원 중단) 제한을 끄려면 해당 한계값을 NaN으로 둔다.",
    "en": "deprecated, set the respective limits to ``.NAN`` for deactivation",
    "key": "linear.x.has_jerk_limits"
   },
   {
    "name": "linear.x.max_velocity",
    "type": "double",
    "default": "NaN",
    "ko": "최대 선속도(m/s). NaN이면 제한 없음.",
    "en": "",
    "key": "linear.x.max_velocity"
   },
   {
    "name": "linear.x.min_velocity",
    "type": "double",
    "default": "NaN",
    "ko": "최소 선속도(m/s, 후진 음수). NaN이면 제한 없음.",
    "en": "",
    "key": "linear.x.min_velocity"
   },
   {
    "name": "linear.x.max_acceleration",
    "type": "double",
    "default": "NaN",
    "ko": "전진 최대 가속도(m/s²).",
    "en": "Maximum acceleration in forward direction.",
    "key": "linear.x.max_acceleration"
   },
   {
    "name": "linear.x.max_deceleration",
    "type": "double",
    "default": "NaN",
    "ko": "전진 최대 감속도(m/s²).",
    "en": "Maximum deceleration in forward direction.",
    "key": "linear.x.max_deceleration"
   },
   {
    "name": "linear.x.min_acceleration",
    "type": "double",
    "default": "NaN",
    "ko": "(지원 중단) max_deceleration을 쓴다.",
    "en": "deprecated, use max_deceleration",
    "key": "linear.x.min_acceleration"
   },
   {
    "name": "linear.x.max_acceleration_reverse",
    "type": "double",
    "default": "NaN",
    "ko": "후진 최대 가속도. 없으면 -max_acceleration.",
    "en": "Maximum acceleration in reverse direction. If not set, -max_acceleration will be used.",
    "key": "linear.x.max_acceleration_reverse"
   },
   {
    "name": "linear.x.max_deceleration_reverse",
    "type": "double",
    "default": "NaN",
    "ko": "후진 최대 감속도. 없으면 -max_deceleration.",
    "en": "Maximum deceleration in reverse direction. If not set, -max_deceleration will be used.",
    "key": "linear.x.max_deceleration_reverse"
   },
   {
    "name": "linear.x.max_jerk",
    "type": "double",
    "default": "NaN",
    "ko": "최대 저크(m/s³).",
    "en": "",
    "key": "linear.x.max_jerk"
   },
   {
    "name": "linear.x.min_jerk",
    "type": "double",
    "default": "NaN",
    "ko": "최소 저크(m/s³).",
    "en": "",
    "key": "linear.x.min_jerk"
   },
   {
    "name": "angular.z.has_velocity_limits",
    "type": "bool",
    "default": "true",
    "ko": "(지원 중단) 제한을 끄려면 해당 한계값을 NaN으로 둔다.",
    "en": "deprecated, set the respective limits to ``.NAN`` for deactivation",
    "key": "angular.z.has_velocity_limits"
   },
   {
    "name": "angular.z.has_acceleration_limits",
    "type": "bool",
    "default": "true",
    "ko": "(지원 중단) 제한을 끄려면 해당 한계값을 NaN으로 둔다.",
    "en": "deprecated, set the respective limits to ``.NAN`` for deactivation",
    "key": "angular.z.has_acceleration_limits"
   },
   {
    "name": "angular.z.has_jerk_limits",
    "type": "bool",
    "default": "true",
    "ko": "(지원 중단) 제한을 끄려면 해당 한계값을 NaN으로 둔다.",
    "en": "deprecated, set the respective limits to ``.NAN`` for deactivation",
    "key": "angular.z.has_jerk_limits"
   },
   {
    "name": "angular.z.max_velocity",
    "type": "double",
    "default": "NaN",
    "ko": "최대 각속도(rad/s).",
    "en": "",
    "key": "angular.z.max_velocity"
   },
   {
    "name": "angular.z.min_velocity",
    "type": "double",
    "default": "NaN",
    "ko": "최소 각속도(rad/s).",
    "en": "",
    "key": "angular.z.min_velocity"
   },
   {
    "name": "angular.z.max_acceleration",
    "type": "double",
    "default": "NaN",
    "ko": "양의 방향 최대 각가속도.",
    "en": "Maximum acceleration in positive direction.",
    "key": "angular.z.max_acceleration"
   },
   {
    "name": "angular.z.max_deceleration",
    "type": "double",
    "default": "NaN",
    "ko": "양의 방향 최대 각감속도.",
    "en": "Maximum deceleration in positive direction.",
    "key": "angular.z.max_deceleration"
   },
   {
    "name": "angular.z.min_acceleration",
    "type": "double",
    "default": "NaN",
    "ko": "(지원 중단) max_deceleration을 쓴다.",
    "en": "deprecated, use max_deceleration",
    "key": "angular.z.min_acceleration"
   },
   {
    "name": "angular.z.max_acceleration_reverse",
    "type": "double",
    "default": "NaN",
    "ko": "음의 방향 최대 각가속도.",
    "en": "Maximum acceleration in negative direction. If not set, -max_acceleration will be used.",
    "key": "angular.z.max_acceleration_reverse"
   },
   {
    "name": "angular.z.max_deceleration_reverse",
    "type": "double",
    "default": "NaN",
    "ko": "음의 방향 최대 각감속도.",
    "en": "Maximum deceleration in negative direction. If not set, -max_deceleration will be used.",
    "key": "angular.z.max_deceleration_reverse"
   },
   {
    "name": "angular.z.max_jerk",
    "type": "double",
    "default": "NaN",
    "ko": "최대 각저크.",
    "en": "",
    "key": "angular.z.max_jerk"
   },
   {
    "name": "angular.z.min_jerk",
    "type": "double",
    "default": "NaN",
    "ko": "최소 각저크.",
    "en": "",
    "key": "angular.z.min_jerk"
   }
  ]
 },
 {
  "id": "ctl_joint_state_broadcaster",
  "cat": "ros2_control",
  "title": "JointStateBroadcaster",
  "pkg": "joint_state_broadcaster",
  "node": "/joint_state_broadcaster",
  "kind": "컨트롤러",
  "desc": "모든 관절 상태를 /joint_states로 발행.",
  "source": "github.com/ros-controls/ros2_controllers (jazzy) — generate_parameter_library 정의",
  "params": [
   {
    "name": "use_local_topics",
    "type": "bool",
    "default": "false",
    "ko": "true면 /joint_states 대신 /<이름>/joint_states로 발행.",
    "en": "Defining if ``joint_states`` and ``dynamic_joint_states`` messages should be published into local namespace, e.g., ``/my_state_broadcaster/joint_states``.",
    "key": "use_local_topics",
    "ro": true
   },
   {
    "name": "joints",
    "type": "string_array",
    "default": "[]",
    "ko": "일부 관절만 내보낼 때 관절 목록 (interfaces와 함께).",
    "en": "Parameter to support broadcasting of only specific joints and interfaces. It has to be used in combination with the ``interfaces`` parameter. If either ``joints`` or ``interfaces`` is left empty, all available state interfaces will be published. Joint state broadcaster asks for access to all defined interfaces on all defined joints.",
    "key": "joints",
    "ro": true
   },
   {
    "name": "extra_joints",
    "type": "string_array",
    "default": "[]",
    "ko": "값 0으로 추가할 관절 이름 (하드웨어 없는 관절).",
    "en": "Names of extra joints to be added to ``joint_states`` and ``dynamic_joint_states`` with state set to 0.",
    "key": "extra_joints",
    "ro": true
   },
   {
    "name": "interfaces",
    "type": "string_array",
    "default": "[]",
    "ko": "일부만 내보낼 때 인터페이스 목록 (joints와 함께).",
    "en": "Parameter to support broadcasting of only specific joints and interfaces. It has to be used in combination with the ``joints`` parameter. If either ``joints`` or ``interfaces`` is left empty, all available state interfaces will be published. If this parameter contains ``position``, ``velocity``, or ``effort``, the corresponding ``map_interface_to_joint_state.<field>`` setting is ignored because the standard interface is already requested directly. A warning is printed only when such an ignored mapping is set to a different custom interface name.",
    "key": "interfaces",
    "ro": true
   },
   {
    "name": "map_interface_to_joint_state.position",
    "type": "string",
    "default": "position",
    "ko": "JointState.position에 넣을 인터페이스 이름.",
    "en": "",
    "key": "map_interface_to_joint_state.position",
    "ro": true
   },
   {
    "name": "map_interface_to_joint_state.velocity",
    "type": "string",
    "default": "velocity",
    "ko": "JointState.velocity에 넣을 인터페이스 이름.",
    "en": "",
    "key": "map_interface_to_joint_state.velocity",
    "ro": true
   },
   {
    "name": "map_interface_to_joint_state.effort",
    "type": "string",
    "default": "effort",
    "ko": "JointState.effort에 넣을 인터페이스 이름 (예: 전류 인터페이스를 effort로).",
    "en": "",
    "key": "map_interface_to_joint_state.effort",
    "design": "effort (다이나믹셀 전류 — arm_safety_monitor가 씀)",
    "ro": true
   },
   {
    "name": "use_urdf_to_filter",
    "type": "bool",
    "default": "true",
    "ko": "URDF에 있는 관절만 /joint_states에 낼지.",
    "en": "Uses the robot_description to filter the ``joint_states`` topic. If true, the broadcaster will publish the data of the joints present in the URDF alone. If false, the broadcaster will publish the data of any interface that has type ``position``, ``velocity``, or ``effort``.",
    "key": "use_urdf_to_filter",
    "ro": true
   },
   {
    "name": "frame_id",
    "type": "string",
    "default": "base_link",
    "ko": "JointState header.frame_id.",
    "en": "The frame_id to be used in the published joint states. This parameter allows rviz2 to visualize the effort of the joints.",
    "key": "frame_id",
    "ro": true
   },
   {
    "name": "publish_dynamic_joint_states",
    "type": "bool",
    "default": "true",
    "ko": "/dynamic_joint_states도 발행할지.",
    "en": "Whether to publish dynamic joint states.",
    "key": "publish_dynamic_joint_states",
    "ro": true
   }
  ]
 },
 {
  "id": "ctl_imu_sensor_broadcaster",
  "cat": "ros2_control",
  "title": "IMUSensorBroadcaster",
  "pkg": "imu_sensor_broadcaster",
  "node": "/imu_sensor_broadcaster",
  "kind": "컨트롤러",
  "desc": "IMU 인터페이스를 /imu로 발행.",
  "source": "github.com/ros-controls/ros2_controllers (jazzy) — generate_parameter_library 정의",
  "params": [
   {
    "name": "sensor_name",
    "type": "string",
    "default": "''",
    "ko": "센서 이름 = 인터페이스 접두사 (<이름>/orientation.x ...).",
    "en": "Defines sensor name used as prefix for its interfaces. Interface names are: ``<sensor_name>/orientation.x, ..., <sensor_name>/angular_velocity.x, ..., <sensor_name>/linear_acceleration.x.``",
    "key": "sensor_name",
    "design": "imu"
   },
   {
    "name": "frame_id",
    "type": "string",
    "default": "''",
    "ko": "Imu 메시지의 frame_id.",
    "en": "Sensor's frame_id in which values are published.",
    "key": "frame_id",
    "design": "imu_link"
   },
   {
    "name": "static_covariance_orientation",
    "type": "double_array",
    "default": "[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]",
    "ko": "자세 공분산 9개 (행 우선).",
    "en": "Static orientation covariance. Row major about x, y, z axes",
    "key": "static_covariance_orientation"
   },
   {
    "name": "static_covariance_angular_velocity",
    "type": "double_array",
    "default": "[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]",
    "ko": "각속도 공분산 9개.",
    "en": "Static angular velocity covariance. Row major about x, y, z axes",
    "key": "static_covariance_angular_velocity"
   },
   {
    "name": "static_covariance_linear_acceleration",
    "type": "double_array",
    "default": "[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]",
    "ko": "가속도 공분산 9개.",
    "en": "Static linear acceleration covariance. Row major about x, y, z axes",
    "key": "static_covariance_linear_acceleration"
   }
  ]
 },
 {
  "id": "ctl_gripper_action_controller",
  "cat": "ros2_control",
  "title": "GripperActionController",
  "pkg": "gripper_controllers",
  "node": "/gripper_controller",
  "kind": "컨트롤러",
  "desc": "GripperCommand 액션 서버 (이 설계의 gripper_controller).",
  "source": "github.com/ros-controls/ros2_controllers (jazzy) — generate_parameter_library 정의",
  "params": [
   {
    "name": "action_monitor_rate",
    "type": "double",
    "default": "20.0",
    "ko": "액션 상태 확인 주기(Hz).",
    "en": "Hz",
    "key": "action_monitor_rate"
   },
   {
    "name": "joint",
    "type": "string",
    "default": "''",
    "ko": "그리퍼 관절 이름.",
    "en": "",
    "key": "joint"
   },
   {
    "name": "goal_tolerance",
    "type": "double",
    "default": "0.01",
    "ko": "도착 허용 오차.",
    "en": "",
    "key": "goal_tolerance"
   },
   {
    "name": "max_effort",
    "type": "double",
    "default": "0.0",
    "ko": "최대 허용 힘.",
    "en": "Max allowable effort",
    "key": "max_effort"
   },
   {
    "name": "allow_stalling",
    "type": "bool",
    "default": "false",
    "ko": "true면 막혀서 멈춰도(물체를 잡아서) 성공으로 처리.",
    "en": "Allow stalling will make the action server return success if the gripper stalls when moving to the goal",
    "key": "allow_stalling"
   },
   {
    "name": "stall_velocity_threshold",
    "type": "double",
    "default": "0.001",
    "ko": "이 속도 아래면 멈춘(stall) 것으로 본다.",
    "en": "stall velocity threshold",
    "key": "stall_velocity_threshold"
   },
   {
    "name": "stall_timeout",
    "type": "double",
    "default": "1.0",
    "ko": "멈춘 상태가 이 시간(s) 이어지면 stall 판정.",
    "en": "stall timeout",
    "key": "stall_timeout"
   }
  ]
 },
 {
  "id": "ctl_parallel_gripper_action_controller",
  "cat": "ros2_control",
  "title": "ParallelGripperActionController",
  "pkg": "parallel_gripper_controller",
  "node": "/gripper_controller",
  "kind": "컨트롤러",
  "desc": "ParallelGripperCommand 액션 서버 — GripperActionController의 후속.",
  "source": "github.com/ros-controls/ros2_controllers (jazzy) — generate_parameter_library 정의",
  "params": [
   {
    "name": "action_monitor_rate",
    "type": "double",
    "default": "20.0",
    "ko": "액션 상태 확인 주기(Hz).",
    "en": "Hz",
    "key": "action_monitor_rate",
    "ro": true
   },
   {
    "name": "joint",
    "type": "string",
    "default": "''",
    "ko": "그리퍼 관절 이름.",
    "en": "",
    "key": "joint",
    "ro": true
   },
   {
    "name": "state_interfaces",
    "type": "string_array",
    "default": "[\"position\", \"velocity\"]",
    "ko": "읽을 상태 인터페이스.",
    "en": "",
    "key": "state_interfaces"
   },
   {
    "name": "goal_tolerance",
    "type": "double",
    "default": "0.01",
    "ko": "도착 허용 오차.",
    "en": "",
    "key": "goal_tolerance"
   },
   {
    "name": "allow_stalling",
    "type": "bool",
    "default": "false",
    "ko": "막혀서 멈춰도 성공으로 처리할지.",
    "en": "Allow stalling will make the action server return success if the gripper stalls when moving to the goal",
    "key": "allow_stalling"
   },
   {
    "name": "stall_velocity_threshold",
    "type": "double",
    "default": "0.001",
    "ko": "stall 판정 속도.",
    "en": "stall velocity threshold",
    "key": "stall_velocity_threshold"
   },
   {
    "name": "stall_timeout",
    "type": "double",
    "default": "1.0",
    "ko": "stall 판정 시간(s).",
    "en": "stall timeout",
    "key": "stall_timeout"
   },
   {
    "name": "max_effort_interface",
    "type": "string",
    "default": "''",
    "ko": "최대 힘을 설정할 인터페이스 이름.",
    "en": "Controller will claim the specified effort interface, e.g. robotiq_85_left_knuckle_joint/max_effort_interface.",
    "key": "max_effort_interface"
   },
   {
    "name": "max_effort",
    "type": "double",
    "default": "10.0",
    "ko": "잡을 때 기본 힘(N).",
    "en": "Default effort used for grasping (Newtons)",
    "key": "max_effort"
   },
   {
    "name": "max_velocity_interface",
    "type": "string",
    "default": "''",
    "ko": "최대 속도를 설정할 인터페이스 이름.",
    "en": "Controller will claim the speed specified interface, e.g. robotiq_85_left_knuckle_joint/max_velocity_interface.",
    "key": "max_velocity_interface"
   },
   {
    "name": "max_velocity",
    "type": "double",
    "default": "0.1",
    "ko": "잡을 때 기본 속도(m/s).",
    "en": "Default target velocity used for grasping (meters/second)",
    "key": "max_velocity"
   }
  ]
 },
 {
  "id": "nav2_bt_navigator",
  "cat": "Nav2",
  "title": "bt_navigator",
  "pkg": "nav2_bt_navigator",
  "node": "/bt_navigator",
  "kind": "노드",
  "desc": "행동 트리로 이동을 지휘.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "navigators",
    "type": "vector<string>",
    "default": "[\"navigate_to_pose\", \"navigate_through_poses\"]",
    "ko": "불러올 내비게이터 플러그인 (navigate_to_pose, navigate_through_poses ...). 각자 액션 서버를 연다.",
    "en": "New to Iron: Plugins for navigator types implementing the `nav2_core::BehaviorTreeNavigator` interface. They implement custom action servers with custom interface definitions and use that data to populate and process behavior tree navigation requests. Plugin classes are defined under the same namespace, see examples below. Defaults correspond to the `NavigateToPoseNavigator` and `NavigateThroughPosesNavigator` navigators.",
    "key": "navigators"
   },
   {
    "name": "default_nav_to_pose_bt_xml",
    "type": "string",
    "default": "N/A",
    "ko": "NavigateToPose에 쓸 기본 행동 트리 XML 경로.",
    "en": "Path to the default behavior tree XML description for `NavigateToPose`, see [Behavior Tree XML Nodes][behavior-tree-xml-nodes] for details on this file. This parameter used to be `default_bt_xml_filename` pre-Galactic. You can use substitution to specify file path like `$(find-pkg-share my_package)/behavior_tree/my_nav_to_pose_bt.xml`. However, if left empty, the default behavior tree XML will be loaded from the `nav2_bt_navigator` package.",
    "key": "default_nav_to_pose_bt_xml",
    "design": "BackUp을 빼거나 0.1m로 제한한 BT XML"
   },
   {
    "name": "default_nav_through_poses_bt_xml",
    "type": "string",
    "default": "N/A",
    "ko": "NavigateThroughPoses에 쓸 기본 행동 트리 XML 경로.",
    "en": "Path to the default behavior tree XML description for `NavigateThroughPoses`, see [Behavior Tree XML Nodes][behavior-tree-xml-nodes] for details on this file. New to Galactic after `NavigateThroughPoses` was added. You can use substitution to specify file path like `$(find-pkg-share my_package)/behavior_tree/my_nav_through_poses_bt.xml`. However, if left empty, the default behavior tree XML will be loaded from the `nav2_bt_navigator` package.",
    "key": "default_nav_through_poses_bt_xml"
   },
   {
    "name": "always_reload_bt_xml",
    "type": "bool",
    "default": "false",
    "ko": "true면 요청마다 BT XML을 다시 읽는다 (같은 이름이어도).",
    "en": "Always load the requested behavior tree XML description, regardless of the name of the currently active XML.",
    "key": "always_reload_bt_xml"
   },
   {
    "name": "plugin_lib_names",
    "type": "vector<string>",
    "default": "[\"\"]",
    "ko": "추가로 불러올 커스텀 BT 노드 라이브러리. Nav2 기본 BT 노드는 자동 포함.",
    "en": "List of behavior tree node shared libraries. All Nav2 BT libraries are automatically included for you, so this only needs to include your new custom plugins (new to Jazzy).",
    "key": "plugin_lib_names"
   },
   {
    "name": "bt_loop_duration",
    "type": "int",
    "default": "10",
    "ko": "BT 한 번 tick하는 주기(ms).",
    "en": "Duration (in milliseconds) for each iteration of BT execution.",
    "key": "bt_loop_duration"
   },
   {
    "name": "default_server_timeout",
    "type": "int",
    "default": "20",
    "ko": "BT 액션 노드가 서버 응답을 기다리는 기본 시간(ms).",
    "en": "Default timeout value (in milliseconds) for a BT action node to wait for acknowledgement from an action server. This value will be overwritten for a BT node if the input port `server_timeout` is provided.",
    "key": "default_server_timeout"
   },
   {
    "name": "default_cancel_timeout",
    "type": "int",
    "default": "20",
    "ko": "BT 노드 정지 시 취소 요청 응답을 기다리는 시간(ms).",
    "en": "Default timeout (in milliseconds) for BT action node cancellation requests during node halt. This value will be overwritten for a BT node if the input port `cancel_timeout` is provided.",
    "key": "default_cancel_timeout"
   },
   {
    "name": "wait_for_service_timeout",
    "type": "int",
    "default": "1000",
    "ko": "BT 초기화 때 액션·서비스 서버를 기다리는 시간(ms).",
    "en": "Default timeout value (in milliseconds) for an Action or Service BT nodes to wait for acknowledgement from an service or action server on BT initialization (e.g. `wait_for_action_server(timeout)`). This value will be overwritten for a BT node if the input port `wait_for_service_timeout` is provided.",
    "key": "wait_for_service_timeout"
   },
   {
    "name": "action_server_result_timeout",
    "type": "double",
    "default": "900.0",
    "ko": "결과를 못 낸 goal 핸들을 액션 서버가 버리기까지의 시간(s).",
    "en": "The timeout value (in seconds) for action servers to discard a goal handle if a result has not been produced. This used to default to 15 minutes in rcl but was changed to 10 seconds in this [PR #1012]( https://github.com/ros2/rcl/pull/1012), which may be less than some actions in Nav2 take to run. For most applications, this should not need to be adjusted as long as the actions within the server do not exceed this deadline. This issue has been raised with OSRF to find another solution to avoid active goal timeouts for bookkeeping, so this is a semi-temporary workaround.",
    "key": "action_server_result_timeout"
   },
   {
    "name": "transform_tolerance",
    "type": "double",
    "default": "0.1",
    "ko": "TF 변환 허용 시간 오차(s). 이보다 오래된 TF면 실패로 본다.",
    "en": "TF transform tolerance.",
    "key": "transform_tolerance"
   },
   {
    "name": "global_frame",
    "type": "string",
    "default": "\"map\"",
    "ko": "기준 좌표계.",
    "en": "Reference frame.",
    "key": "global_frame"
   },
   {
    "name": "robot_base_frame",
    "type": "string",
    "default": "\"base_link\"",
    "ko": "로봇 몸 좌표계.",
    "en": "Robot base frame.",
    "key": "robot_base_frame",
    "design": "base_footprint"
   },
   {
    "name": "odom_topic",
    "type": "string",
    "default": "\"odom\"",
    "ko": "오도메트리 토픽 (속도 피드백용).",
    "en": "Topic on which odometry is published",
    "key": "odom_topic",
    "design": "/odometry/filtered"
   },
   {
    "name": "goal_blackboard_id",
    "type": "string",
    "default": "\"goal\"",
    "ko": "NavigateToPose 목표를 BT에 넘기는 블랙보드 변수 이름 (XML 포트와 일치해야 함).",
    "en": "Blackboard variable to use to supply the goal to the behavior tree for `NavigateToPose`. Should match ports of BT XML file.",
    "key": "goal_blackboard_id"
   },
   {
    "name": "path_blackboard_id",
    "type": "string",
    "default": "\"path\"",
    "ko": "NavigateThroughPoses 피드백용 경로 블랙보드 변수 이름.",
    "en": "Blackboard variable to get the path from the behavior tree for `NavigateThroughPoses` feedback. Should match port names of BT XML file.",
    "key": "path_blackboard_id"
   },
   {
    "name": "goals_blackboard_id",
    "type": "string",
    "default": "\"goals\"",
    "ko": "NavigateThroughPoses 목표들을 넘기는 블랙보드 변수 이름.",
    "en": "Blackboard variable to use to supply the goals to the behavior tree for `NavigateThroughPoses`. Should match ports of BT XML file.",
    "key": "goals_blackboard_id"
   },
   {
    "name": "error_code_names",
    "type": "vector<string>",
    "default": "[\"compute_path_error_code\", \"follow_path_error_code\"]",
    "ko": "결과에 모을 오류 코드 블랙보드 이름 목록.",
    "en": "List of of error codes to compare.",
    "key": "error_code_names"
   },
   {
    "name": "bond_heartbeat_period",
    "type": "double",
    "default": "0.1",
    "ko": "lifecycle bond 하트비트 발행 주기(s, /bond 토픽). 0 이하면 끔 — lifecycle_manager가 이걸로 서버 생존을 확인한다.",
    "en": "The lifecycle node bond mechanism publishing period (on the `/bond` topic). Disabled if inferior or equal to `0.0`.",
    "key": "bond_heartbeat_period"
   },
   {
    "name": "<navigate_to_pose_name>.enable_groot_monitoring",
    "type": "bool",
    "default": "false",
    "ko": "Groot2로 이 내비게이터의 BT 실행을 실시간으로 볼지.",
    "en": "Whether to enable Groot2 monitoring for this navigator.",
    "key": "navigate_to_pose.enable_groot_monitoring"
   },
   {
    "name": "<navigate_to_pose_name>.groot_server_port",
    "type": "int",
    "default": "1667",
    "ko": "Groot2 서버 포트.",
    "en": "The port number for the Groot2 server. Note In Groot2, you only need to specify the server port value, not the publisher port, as it is always the server port +1. Therefore, in this case, to use another navigator, the next available port would be `1669`.",
    "key": "navigate_to_pose.groot_server_port"
   },
   {
    "name": "<navigate_through_poses>.enable_groot_monitoring",
    "type": "bool",
    "default": "false",
    "ko": "Groot2로 NavigateThroughPoses BT를 볼지.",
    "en": "Whether to enable Groot2 monitoring for this navigator.",
    "key": "navigate_through_poses.enable_groot_monitoring"
   },
   {
    "name": "<navigate_through_poses>.groot_server_port",
    "type": "int",
    "default": "1669",
    "ko": "Groot2 서버 포트.",
    "en": "The port number for the Groot2 server. Note In Groot2, you only need to specify the server port value, not the publisher port, as it is always the server port +1. Therefore, in this case, to use another navigator, the next available port would be `1671`.",
    "key": "navigate_through_poses.groot_server_port"
   }
  ]
 },
 {
  "id": "nav2_planner_server",
  "cat": "Nav2",
  "title": "planner_server",
  "pkg": "nav2_planner",
  "node": "/planner_server",
  "kind": "노드",
  "desc": "전역 경로 계산 서버 (+ global_costmap).",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "planner_plugins",
    "type": "vector<string>",
    "default": "[\"GridBased\"]",
    "ko": "플래너 플러그인 이름 목록 (GridBased 등). 각 이름 아래 plugin으로 타입 지정.",
    "en": "List of Mapped plugin names for parameters and processing requests. Note Each plugin namespace defined in this list needs to have a `plugin` parameter defining the type of plugin to be loaded in the namespace. Example: ```yaml planner_server: ros__parameters: planner_plugins: [\"GridBased\"] GridBased: plugin: \"nav2_navfn_planner::NavfnPlanner\" # In Iron and older versions, \"/\" was used instead of \"::\" ```",
    "key": "planner_plugins"
   },
   {
    "name": "expected_planner_frequency",
    "type": "double",
    "default": "1.0",
    "ko": "기대 플래너 주기(Hz). 이보다 느리면 경고.",
    "en": "Expected planner frequency. If the current frequency is less than the expected frequency, display the warning message.",
    "key": "expected_planner_frequency"
   },
   {
    "name": "action_server_result_timeout",
    "type": "double",
    "default": "10.0",
    "ko": "결과를 못 낸 goal 핸들을 액션 서버가 버리기까지의 시간(s).",
    "en": "The timeout value (in seconds) for action servers to discard a goal handle if a result has not been produced. This used to default to 15 minutes in rcl but was changed to 10 seconds in this [PR #1012](https://github.com/ros2/rcl/pull/1012), which may be less than some actions in Nav2 take to run. For most applications, this should not need to be adjusted as long as the actions within the server do not exceed this deadline. This issue has been raised with OSRF to find another solution to avoid active goal timeouts for bookkeeping, so this is a semi-temporary workaround.",
    "key": "action_server_result_timeout"
   },
   {
    "name": "bond_heartbeat_period",
    "type": "double",
    "default": "0.1",
    "ko": "lifecycle bond 하트비트 발행 주기(s, /bond 토픽). 0 이하면 끔 — lifecycle_manager가 이걸로 서버 생존을 확인한다.",
    "en": "The lifecycle node bond mechanism publishing period (on the `/bond` topic). Disabled if inferior or equal to `0.0`.",
    "key": "bond_heartbeat_period"
   },
   {
    "name": "costmap_update_timeout",
    "type": "double",
    "default": "1.0",
    "ko": "경로 계산 전에 costmap 갱신을 기다리는 최대 시간(s).",
    "en": "The timeout value (seconds) for the costmap to be fully updated before a planning request.",
    "key": "costmap_update_timeout"
   }
  ]
 },
 {
  "id": "nav2_navfn",
  "cat": "Nav2",
  "title": "NavFn 플래너",
  "pkg": "nav2_navfn_planner",
  "node": "/planner_server",
  "kind": "플러그인",
  "desc": "planner_server의 기본 플래너 (A*/Dijkstra). 키는 GridBased.<이름>.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<name>.tolerance",
    "type": "double",
    "default": "0.5",
    "ko": "목표에 정확히 못 가면 이 거리(m) 안의 가장 가까운 점까지 경로를 만든다.",
    "en": "Tolerance in meters between requested goal pose and end of path.",
    "key": "GridBased.tolerance"
   },
   {
    "name": "<name>.use_astar",
    "type": "bool",
    "default": "false",
    "ko": "true면 A*, false면 Dijkstra.",
    "en": "Whether to use A\\*. If `false`, uses Dijkstra's expansion.",
    "key": "GridBased.use_astar"
   },
   {
    "name": "<name>.allow_unknown",
    "type": "bool",
    "default": "true",
    "ko": "모르는 칸으로도 경로를 낼지.",
    "en": "Whether to allow planning in unknown space.",
    "key": "GridBased.allow_unknown"
   },
   {
    "name": "<name>.use_final_approach_orientation",
    "type": "bool",
    "default": "false",
    "ko": "마지막 자세 방향을 목표 방향 대신 접근 방향으로 둘지.",
    "en": "If `true`, the last pose of the path generated by the planner will have its orientation set to the approach orientation, i.e. the orientation of the vector connecting the last two points of the path",
    "key": "GridBased.use_final_approach_orientation"
   }
  ]
 },
 {
  "id": "nav2_controller_server",
  "cat": "Nav2",
  "title": "controller_server",
  "pkg": "nav2_controller",
  "node": "/controller_server",
  "kind": "노드",
  "desc": "경로 추종 서버 (+ local_costmap).",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "controller_frequency",
    "type": "double",
    "default": "20.0",
    "ko": "컨트롤러를 돌리는 주기(Hz) = cmd_vel 발행 주기.",
    "en": "Frequency to run controller (Hz).",
    "key": "controller_frequency",
    "design": "20.0"
   },
   {
    "name": "costmap_update_timeout",
    "type": "double",
    "default": "0.3",
    "ko": "제어 계산 전에 costmap 갱신을 기다리는 최대 시간(s).",
    "en": "The timeout value (seconds) for the costmap to be fully updated before a control effort can be computed.",
    "key": "costmap_update_timeout"
   },
   {
    "name": "use_realtime_priority",
    "type": "bool",
    "default": "false",
    "ko": "실행 스레드를 실시간 우선순위(90)로 올린다. /etc/security/limits.conf에 rtprio 권한이 있어야 한다.",
    "en": "Adds soft real-time prioritization to the controller server to better ensure resources to time sensitive portions of the codebase. This will set the controller's execution thread to a higher priority than the rest of the system (`90`) to meet scheduling deadlines to have less missed loop rates. To use this feature, you use set the following inside of `/etc/security/limits.conf` to give userspace access to elevated prioritization permissions: `<username> soft rtprio 99 <username> hard rtprio 99`",
    "key": "use_realtime_priority"
   },
   {
    "name": "publish_zero_velocity",
    "type": "bool",
    "default": "true",
    "ko": "목표가 끝나면 0 속도를 한 번 내서 멈추게 할지.",
    "en": "Whether to publish a zero velocity command on goal exit. This is useful for stopping the robot when a goal terminates.",
    "key": "publish_zero_velocity"
   },
   {
    "name": "action_server_result_timeout",
    "type": "double",
    "default": "10.0",
    "ko": "결과를 못 낸 goal 핸들을 액션 서버가 버리기까지의 시간(s).",
    "en": "The timeout value (in seconds) for action servers to discard a goal handle if a result has not been produced. This used to default to 15 minutes in rcl but was changed to 10 seconds in this [PR #1012](https://github.com/ros2/rcl/pull/1012), which may be less than some actions in Nav2 take to run. For most applications, this should not need to be adjusted as long as the actions within the server do not exceed this deadline. This issue has been raised with OSRF to find another solution to avoid active goal timeouts for bookkeeping, so this is a semi-temporary workaround.",
    "key": "action_server_result_timeout"
   },
   {
    "name": "controller_plugins",
    "type": "vector<string>",
    "default": "[\"FollowPath\"]",
    "ko": "컨트롤러 플러그인 이름 목록 (FollowPath 등). 각 이름 아래 plugin으로 타입 지정.",
    "en": "List of mapped names for controller plugins for processing requests and parameters. Note Each plugin namespace defined in this list needs to have a `plugin` parameter defining the type of plugin to be loaded in the namespace. Example: ```yaml controller_server: ros__parameters: controller_plugins: [\"FollowPath\"] FollowPath: plugin: \"dwb_core::DWBLocalPlanner\" ```",
    "key": "controller_plugins"
   },
   {
    "name": "progress_checker_plugins",
    "type": "vector<string>",
    "default": "[\"progress_checker\"]",
    "ko": "진행 감시 플러그인 이름 목록 (멈춰 있으면 실패 처리).",
    "en": "Mapped name for progress checker plugin for checking progress made by robot. Formerly `progress_checker_plugin` for Humble and older with a single string plugin. Note The plugin namespace defined needs to have a `plugin` parameter defining the type of plugin to be loaded in the namespace. Example: ```yaml controller_server: ros__parameters: progress_checker_plugins: [\"progress_checker\"] # progress_checker_plugin: \"progress_checker\" For Humble and older progress_checker: plugin: \"nav2_controller::SimpleProgressChecker\" ```",
    "key": "progress_checker_plugins"
   },
   {
    "name": "goal_checker_plugins",
    "type": "vector<string>",
    "default": "[\"goal_checker\"]",
    "ko": "도착 판정 플러그인 이름 목록.",
    "en": "Mapped name for goal checker plugin for checking goal is reached. When the number of the plugins is more than 2, each `FollowPath` action needs to specify the goal checker plugin name with its `goal_checker_id` field. Note The plugin namespace defined needs to have a `plugin` parameter defining the type of plugin to be loaded in the namespace. Example: ```yaml controller_server: ros__parameters: goal_checker_plugins: [\"goal_checker\"] goal_checker: plugin: \"nav2_controller::SimpleGoalChecker\" ```",
    "key": "goal_checker_plugins"
   },
   {
    "name": "min_x_velocity_threshold",
    "type": "double",
    "default": "0.0001",
    "ko": "이보다 작은 오도메트리 x 속도는 0으로 본다.",
    "en": "The controller server filters the velocity portion of the odometry messages received before sending them to the controller plugin. Odometry values below this threshold (in m/s) will be set to `0.0`.",
    "key": "min_x_velocity_threshold"
   },
   {
    "name": "min_y_velocity_threshold",
    "type": "double",
    "default": "0.0001",
    "ko": "이보다 작은 y 속도는 0으로 본다.",
    "en": "The controller server filters the velocity portion of the odometry messages received before sending them to the controller plugin. Odometry values below this threshold (in m/s) will be set to `0.0`. For non-holonomic robots",
    "key": "min_y_velocity_threshold"
   },
   {
    "name": "min_theta_velocity_threshold",
    "type": "double",
    "default": "0.0001",
    "ko": "이보다 작은 각속도는 0으로 본다.",
    "en": "The controller server filters the velocity portion of the odometry messages received before sending them to the controller plugin. Odometry values below this threshold (in rad/s) will be set to `0.0`.",
    "key": "min_theta_velocity_threshold"
   },
   {
    "name": "failure_tolerance",
    "type": "double",
    "default": "0.0",
    "ko": "컨트롤러가 연속으로 실패해도 버티는 시간(s). 0이면 바로 실패, -1이면 무한.",
    "en": "The maximum duration in seconds the called controller plugin can fail (i.e. the `computeVelocityCommands` function of the plugin throwing an exception) before the `nav2_msgs::action::FollowPath` action fails. Setting it to the special value of `-1.0` makes it infinite, `0` to disable, and any positive value for the appropriate timeout.",
    "key": "failure_tolerance"
   },
   {
    "name": "speed_limit_topic",
    "type": "string",
    "default": "\"speed_limit\"",
    "ko": "속도 상한(nav2_msgs/SpeedLimit)을 받을 토픽.",
    "en": "Speed limiting topic name to subscribe. This could be published by Speed Filter (please refer to [Speed Filter Parameters][speed-filter-parameters] configuration page). You can also use this without the Speed Filter as well if you provide an external server to publish [these messages](https://github.com/ros-navigation/navigation2/blob/jazzy/nav2_msgs/msg/SpeedLimit.msg).",
    "key": "speed_limit_topic"
   },
   {
    "name": "odom_topic",
    "type": "string",
    "default": "\"odom\"",
    "ko": "현재 속도를 얻을 오도메트리 토픽.",
    "en": "Topic to get instantaneous measurement of speed from.",
    "key": "odom_topic",
    "design": "/odometry/filtered (ekf 출력)"
   },
   {
    "name": "enable_stamped_cmd_vel",
    "type": "bool",
    "default": "false",
    "ko": "true면 속도 명령을 TwistStamped로, false면 Twist로 주고받는다. 체인 전체가 같은 값이어야 연결된다.",
    "en": "Whether to use `geometry_msgs::msg::Twist` or `geometry_msgs::msg::TwistStamped` velocity data. `true` uses `TwistStamped`, `false` uses `Twist`. Note This parameter is default `false` in Jazzy or older.",
    "key": "enable_stamped_cmd_vel",
    "design": "true (Jazzy, 체인 전체 TwistStamped)"
   },
   {
    "name": "bond_heartbeat_period",
    "type": "double",
    "default": "0.1",
    "ko": "lifecycle bond 하트비트 발행 주기(s, /bond 토픽). 0 이하면 끔 — lifecycle_manager가 이걸로 서버 생존을 확인한다.",
    "en": "The lifecycle node bond mechanism publishing period (on the `/bond` topic). Disabled if inferior or equal to `0.0`.",
    "key": "bond_heartbeat_period"
   }
  ]
 },
 {
  "id": "nav2_dwb_controller",
  "cat": "Nav2",
  "title": "DWB 컨트롤러",
  "pkg": "dwb_core",
  "node": "/controller_server",
  "kind": "플러그인",
  "desc": "controller_server의 FollowPath 플러그인. 속도 후보를 시뮬레이션해 critic 점수로 고른다.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<dwb plugin>.critics",
    "type": "vector<string>",
    "default": "N/A",
    "ko": "쓸 critic(궤적 평가 기준) 목록 — RotateToGoal, Oscillation, BaseObstacle, GoalAlign, PathAlign, PathDist, GoalDist 등.",
    "en": "List of critic plugins to use.",
    "key": "FollowPath.critics"
   },
   {
    "name": "<dwb plugin>.default_critic_namespaces",
    "type": "vector<string>",
    "default": "[\"dwb_critics\"]",
    "ko": "critic을 찾을 네임스페이스.",
    "en": "Namespaces to load critics in.",
    "key": "FollowPath.default_critic_namespaces"
   },
   {
    "name": "<dwb plugin>.prune_plan",
    "type": "bool",
    "default": "true",
    "ko": "지나간 경로 점을 잘라낼지.",
    "en": "Whether to prune the path of old, passed points.",
    "key": "FollowPath.prune_plan"
   },
   {
    "name": "<dwb plugin>.shorten_transformed_plan",
    "type": "bool",
    "default": "true",
    "ko": "critic에 경로 전체가 아니라 앞부분만 넘길지.",
    "en": "Determines whether we will pass the full plan on to the critics.",
    "key": "FollowPath.shorten_transformed_plan"
   },
   {
    "name": "<dwb plugin>.prune_distance",
    "type": "double",
    "default": "2.0",
    "ko": "뒤쪽으로 이 거리(m)까지 잘라낸다.",
    "en": "Distance (m) to prune backward until.",
    "key": "FollowPath.prune_distance"
   },
   {
    "name": "<dwb plugin>.forward_prune_distance",
    "type": "double",
    "default": "2.0",
    "ko": "앞쪽으로 이 거리(m)까지만 본다. -1이면 전체.",
    "en": "Distance (m) to prune forward until. If set to `-1`, it will search the full path for the closest point, in the case of no replanning.",
    "key": "FollowPath.forward_prune_distance"
   },
   {
    "name": "<dwb plugin>.debug_trajectory_details",
    "type": "bool",
    "default": "false",
    "ko": "궤적 평가 디버그 정보를 발행할지.",
    "en": "Publish debug information (on what topic???).",
    "key": "FollowPath.debug_trajectory_details"
   },
   {
    "name": "<dwb plugin>.trajectory_generator_name",
    "type": "string",
    "default": "\"dwb_plugins::StandardTrajectoryGenerator\"",
    "ko": "궤적 생성기 플러그인.",
    "en": "Trajectory generator plugin name.",
    "key": "FollowPath.trajectory_generator_name"
   },
   {
    "name": "<dwb plugin>.goal_checker_name",
    "type": "string",
    "default": "\"dwb_plugins::SimpleGoalChecker\"",
    "ko": "도착 판정 플러그인.",
    "en": "Goal checker plugin name.",
    "key": "FollowPath.goal_checker_name"
   },
   {
    "name": "<dwb plugin>.transform_tolerance",
    "type": "double",
    "default": "0.1",
    "ko": "TF 허용 오차(s).",
    "en": "TF transform tolerance (s).",
    "key": "FollowPath.transform_tolerance"
   },
   {
    "name": "<dwb plugin>.short_circuit_trajectory_evaluation",
    "type": "bool",
    "default": "true",
    "ko": "최고 점수가 정해지면 나머지 평가를 건너뛸지.",
    "en": "Stop evaluating scores after best score is found.",
    "key": "FollowPath.short_circuit_trajectory_evaluation"
   },
   {
    "name": "<dwb plugin>.path_distance_bias",
    "type": "double",
    "default": "N/A",
    "ko": "(구버전) PathAlign.scale을 쓴다.",
    "en": "Old version of `PathAlign.scale`, use that instead.",
    "key": "FollowPath.path_distance_bias"
   },
   {
    "name": "<dwb plugin>.goal_distance_bias",
    "type": "double",
    "default": "N/A",
    "ko": "(구버전) GoalAlign.scale을 쓴다.",
    "en": "Old version of `GoalAlign.scale`, use that instead.",
    "key": "FollowPath.goal_distance_bias"
   },
   {
    "name": "<dwb plugin>.occdist_scale",
    "type": "double",
    "default": "N/A",
    "ko": "(구버전) ObstacleFootprint.scale을 쓴다.",
    "en": "Old version of `ObstacleFootprint.scale`, use that instead.",
    "key": "FollowPath.occdist_scale"
   },
   {
    "name": "<dwb plugin>.max_scaling_factor",
    "type": "double",
    "default": "N/A",
    "ko": "(구버전) ObstacleFootprint.max_scaling_factor를 쓴다.",
    "en": "Old version of `ObstacleFootprint.max_scaling_factor`, use that instead.",
    "key": "FollowPath.max_scaling_factor"
   },
   {
    "name": "<dwb plugin>.scaling_speed",
    "type": "double",
    "default": "N/A",
    "ko": "(구버전) ObstacleFootprint.scaling_speed를 쓴다.",
    "en": "Old version of `ObstacleFootprint.scaling_speed`, use that instead.",
    "key": "FollowPath.scaling_speed"
   },
   {
    "name": "<dwb plugin>.PathAlign.scale",
    "type": "double",
    "default": "32.0",
    "ko": "경로 방향 정렬 critic 가중치.",
    "en": "Scale for path align critic, overriding local default.",
    "key": "FollowPath.PathAlign.scale"
   },
   {
    "name": "<dwb plugin>.GoalAlign.scale",
    "type": "double",
    "default": "24.0",
    "ko": "목표 방향 정렬 critic 가중치.",
    "en": "Scale for goal align critic, overriding local default.",
    "key": "FollowPath.GoalAlign.scale"
   },
   {
    "name": "<dwb plugin>.PathDist.scale",
    "type": "double",
    "default": "32.0",
    "ko": "경로에서 벗어난 거리 critic 가중치.",
    "en": "Scale for path distance critic, overriding local default.",
    "key": "FollowPath.PathDist.scale"
   },
   {
    "name": "<dwb plugin>.GoalDist.scale",
    "type": "double",
    "default": "24.0",
    "ko": "목표까지 거리 critic 가중치.",
    "en": "Scale for goal distance critic, overriding local default.",
    "key": "FollowPath.GoalDist.scale"
   }
  ]
 },
 {
  "id": "nav2_dwb_kinematic",
  "cat": "Nav2",
  "title": "DWB 운동 한계",
  "pkg": "dwb_core",
  "node": "/controller_server",
  "kind": "플러그인",
  "desc": "속도·가속 한계. 실행 중 바꾸면 반영된다 (KinematicsHandler).",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<dwb plugin>.max_vel_theta",
    "type": "double",
    "default": "0.0",
    "ko": "최대 각속도(rad/s).",
    "en": "Maximum angular velocity (rad/s).",
    "key": "FollowPath.max_vel_theta",
    "design": "1.82 / 1.0 / 0.8 (프리셋 A/B/C, set_parameters)"
   },
   {
    "name": "<dwb plugin>.min_speed_xy",
    "type": "double",
    "default": "0.0",
    "ko": "최소 병진 속력(m/s).",
    "en": "Minimum translational speed (m/s).",
    "key": "FollowPath.min_speed_xy"
   },
   {
    "name": "<dwb plugin>.max_speed_xy",
    "type": "double",
    "default": "0.0",
    "ko": "최대 병진 속력(m/s).",
    "en": "Maximum translational speed (m/s).",
    "key": "FollowPath.max_speed_xy"
   },
   {
    "name": "<dwb plugin>.min_speed_theta",
    "type": "double",
    "default": "0.0",
    "ko": "최소 회전 속력(rad/s).",
    "en": "Minimum angular speed (rad/s).",
    "key": "FollowPath.min_speed_theta"
   },
   {
    "name": "<dwb plugin>.min_vel_x",
    "type": "double",
    "default": "0.0",
    "ko": "최소 x 속도(m/s). 음수면 후진 허용.",
    "en": "Minimum velocity X (m/s).",
    "key": "FollowPath.min_vel_x"
   },
   {
    "name": "<dwb plugin>.min_vel_y",
    "type": "double",
    "default": "0.0",
    "ko": "최소 y 속도(m/s).",
    "en": "Minimum velocity Y (m/s).",
    "key": "FollowPath.min_vel_y"
   },
   {
    "name": "<dwb plugin>.max_vel_x",
    "type": "double",
    "default": "0.0",
    "ko": "최대 x 속도(m/s).",
    "en": "Maximum velocity X (m/s).",
    "key": "FollowPath.max_vel_x",
    "design": "0.26 (rl_nav_tuner가 /speed_limit으로 낮춤)"
   },
   {
    "name": "<dwb plugin>.max_vel_y",
    "type": "double",
    "default": "0.0",
    "ko": "최대 y 속도(m/s).",
    "en": "Maximum velocity Y (m/s).",
    "key": "FollowPath.max_vel_y"
   },
   {
    "name": "<dwb plugin>.acc_lim_x",
    "type": "double",
    "default": "0.0",
    "ko": "최대 x 가속도(m/s²).",
    "en": "Maximum acceleration X (m/s^2).",
    "key": "FollowPath.acc_lim_x",
    "design": "2.5 / 1.5 / 1.0 (프리셋 A/B/C)"
   },
   {
    "name": "<dwb plugin>.acc_lim_y",
    "type": "double",
    "default": "0.0",
    "ko": "최대 y 가속도(m/s²).",
    "en": "Maximum acceleration Y (m/s^2).",
    "key": "FollowPath.acc_lim_y"
   },
   {
    "name": "<dwb plugin>.acc_lim_theta",
    "type": "double",
    "default": "0.0",
    "ko": "최대 각가속도(rad/s²).",
    "en": "Maximum acceleration rotation (rad/s^2).",
    "key": "FollowPath.acc_lim_theta"
   },
   {
    "name": "<dwb plugin>.decel_lim_x",
    "type": "double",
    "default": "0.0",
    "ko": "최대 x 감속도(m/s², 음수).",
    "en": "Maximum deceleration X (m/s^2).",
    "key": "FollowPath.decel_lim_x",
    "design": "-2.5 / -1.5 / -1.0 (프리셋 A/B/C)"
   },
   {
    "name": "<dwb plugin>.decel_lim_y",
    "type": "double",
    "default": "0.0",
    "ko": "최대 y 감속도(m/s², 음수).",
    "en": "Maximum deceleration Y (m/s^2).",
    "key": "FollowPath.decel_lim_y"
   },
   {
    "name": "<dwb plugin>.decel_lim_theta",
    "type": "double",
    "default": "0.0",
    "ko": "최대 각감속도(rad/s², 음수).",
    "en": "Maximum deceleration rotation (rad/s^2).",
    "key": "FollowPath.decel_lim_theta"
   }
  ]
 },
 {
  "id": "nav2_dwb_iterator",
  "cat": "Nav2",
  "title": "DWB 속도 샘플",
  "pkg": "dwb_plugins",
  "node": "/controller_server",
  "kind": "플러그인",
  "desc": "속도 후보를 몇 개 뽑을지.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<dwb plugin>.vx_samples",
    "type": "int",
    "default": "20",
    "ko": "x 속도 후보 샘플 수.",
    "en": "Number of velocity samples in the X velocity direction.",
    "key": "FollowPath.vx_samples"
   },
   {
    "name": "<dwb plugin>.vy_samples",
    "type": "int",
    "default": "5",
    "ko": "y 속도 후보 샘플 수 (차동 구동은 1).",
    "en": "Number of velocity samples in the Y velocity direction.",
    "key": "FollowPath.vy_samples"
   },
   {
    "name": "<dwb plugin>.vtheta_samples",
    "type": "int",
    "default": "20",
    "ko": "각속도 후보 샘플 수.",
    "en": "Number of velocity samples in the angular directions.",
    "key": "FollowPath.vtheta_samples"
   }
  ]
 },
 {
  "id": "nav2_dwb_traj_gen",
  "cat": "Nav2",
  "title": "DWB 궤적 생성기",
  "pkg": "dwb_plugins",
  "node": "/controller_server",
  "kind": "플러그인",
  "desc": "StandardTrajectoryGenerator — 후보 궤적 시뮬레이션.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<dwb plugin>.sim_time",
    "type": "double",
    "default": "1.7",
    "ko": "후보 궤적을 앞으로 시뮬레이션하는 시간(s).",
    "en": "Time to simulate ahead by (s).",
    "key": "FollowPath.sim_time"
   },
   {
    "name": "<dwb plugin>.discretize_by_time",
    "type": "bool",
    "default": "false",
    "ko": "true면 시간 간격으로, false면 거리·각 간격으로 궤적을 나눈다.",
    "en": "If `true`, forward simulate by time. If `false`, forward simulate by linear and angular granularity.",
    "key": "FollowPath.discretize_by_time"
   },
   {
    "name": "<dwb plugin>.time_granularity",
    "type": "double",
    "default": "0.5",
    "ko": "시간 간격(s).",
    "en": "Time ahead to project.",
    "key": "FollowPath.time_granularity"
   },
   {
    "name": "<dwb plugin>.linear_granularity",
    "type": "double",
    "default": "0.5",
    "ko": "거리 간격(m).",
    "en": "Linear distance forward to project.",
    "key": "FollowPath.linear_granularity"
   },
   {
    "name": "<dwb plugin>.angular_granularity",
    "type": "double",
    "default": "0.025",
    "ko": "각 간격(rad).",
    "en": "Angular distance to project.",
    "key": "FollowPath.angular_granularity"
   },
   {
    "name": "<dwb plugin>.include_last_point",
    "type": "bool",
    "default": "true",
    "ko": "궤적에 마지막 자세를 넣을지.",
    "en": "Whether to include the last pose in the trajectory.",
    "key": "FollowPath.include_last_point"
   },
   {
    "name": "<dwb plugin>.limit_vel_cmd_in_traj",
    "type": "bool",
    "default": "false",
    "ko": "명령 속도 대신 샘플 속도로 궤적 속도를 제한할지.",
    "en": "Whether to limit velocity command in trajectory using sampled velocity instead of the commanded velocity.",
    "key": "FollowPath.limit_vel_cmd_in_traj"
   }
  ]
 },
 {
  "id": "nav2_critic_base_obstacle",
  "cat": "Nav2",
  "title": "critic: BaseObstacle",
  "pkg": "dwb_critics",
  "node": "/controller_server",
  "kind": "플러그인",
  "desc": "궤적이 지나는 칸의 costmap 비용으로 감점.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<dwb plugin>.<name>.sum_scores",
    "type": "bool",
    "default": "false",
    "ko": "점수를 합산할지 여부.",
    "en": "Whether to allow for scores to be summed up.",
    "key": "FollowPath.BaseObstacle.sum_scores"
   },
   {
    "name": "<dwb plugin>.<name>.scale",
    "type": "double",
    "default": "1.0",
    "ko": "이 critic 점수의 가중치. 클수록 이 기준을 더 중시한다.",
    "en": "Weighed scale for critic.",
    "key": "FollowPath.BaseObstacle.scale"
   }
  ]
 },
 {
  "id": "nav2_critic_goal_align",
  "cat": "Nav2",
  "title": "critic: GoalAlign",
  "pkg": "dwb_critics",
  "node": "/controller_server",
  "kind": "플러그인",
  "desc": "로봇 앞 점이 목표 쪽을 향하도록.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<dwb plugin>.<name>.forward_point_distance",
    "type": "double",
    "default": "0.325",
    "ko": "로봇 앞 이 거리(m)의 점으로 방향 차이를 계산.",
    "en": "Point in front of robot to look ahead to compute angular change from.",
    "key": "FollowPath.GoalAlign.forward_point_distance"
   },
   {
    "name": "<dwb plugin>.<name>.aggregation_type",
    "type": "string",
    "default": "\"last\"",
    "ko": "경로 점별 점수를 합치는 방식: last(마지막 점), sum(합), product(곱).",
    "en": "last, sum, or product combination methods.",
    "key": "FollowPath.GoalAlign.aggregation_type"
   },
   {
    "name": "<dwb plugin>.<name>.scale",
    "type": "double",
    "default": "1.0",
    "ko": "이 critic 점수의 가중치. 클수록 이 기준을 더 중시한다.",
    "en": "Weighed scale for critic.",
    "key": "FollowPath.GoalAlign.scale"
   }
  ]
 },
 {
  "id": "nav2_critic_goal_dist",
  "cat": "Nav2",
  "title": "critic: GoalDist",
  "pkg": "dwb_critics",
  "node": "/controller_server",
  "kind": "플러그인",
  "desc": "궤적 끝이 목표에 가깝도록.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<dwb plugin>.<name>.aggregation_type",
    "type": "string",
    "default": "\"last\"",
    "ko": "경로 점별 점수를 합치는 방식: last(마지막 점), sum(합), product(곱).",
    "en": "last, sum, or product combination methods.",
    "key": "FollowPath.GoalDist.aggregation_type"
   },
   {
    "name": "<dwb plugin>.<name>.scale",
    "type": "double",
    "default": "1.0",
    "ko": "이 critic 점수의 가중치. 클수록 이 기준을 더 중시한다.",
    "en": "Weighed scale for critic.",
    "key": "FollowPath.GoalDist.scale"
   }
  ]
 },
 {
  "id": "nav2_critic_path_align",
  "cat": "Nav2",
  "title": "critic: PathAlign",
  "pkg": "dwb_critics",
  "node": "/controller_server",
  "kind": "플러그인",
  "desc": "로봇 앞 점이 경로 위에 오도록.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<dwb plugin>.<name>.forward_point_distance",
    "type": "double",
    "default": "0.325",
    "ko": "로봇 앞 이 거리(m)의 점으로 경로 정렬을 계산.",
    "en": "Point in front of robot to look ahead to compute angular change from.",
    "key": "FollowPath.PathAlign.forward_point_distance"
   },
   {
    "name": "<dwb plugin>.<name>.aggregation_type",
    "type": "string",
    "default": "\"last\"",
    "ko": "경로 점별 점수를 합치는 방식: last(마지막 점), sum(합), product(곱).",
    "en": "last, sum, or product combination methods.",
    "key": "FollowPath.PathAlign.aggregation_type"
   },
   {
    "name": "<dwb plugin>.<name>.scale",
    "type": "double",
    "default": "1.0",
    "ko": "이 critic 점수의 가중치. 클수록 이 기준을 더 중시한다.",
    "en": "Weighed scale for critic.",
    "key": "FollowPath.PathAlign.scale"
   }
  ]
 },
 {
  "id": "nav2_critic_path_dist",
  "cat": "Nav2",
  "title": "critic: PathDist",
  "pkg": "dwb_critics",
  "node": "/controller_server",
  "kind": "플러그인",
  "desc": "궤적이 경로에서 벗어나지 않도록.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<dwb plugin>.<name>.aggregation_type",
    "type": "string",
    "default": "\"last\"",
    "ko": "경로 점별 점수를 합치는 방식: last(마지막 점), sum(합), product(곱).",
    "en": "last, sum, or product combination methods.",
    "key": "FollowPath.PathDist.aggregation_type"
   },
   {
    "name": "<dwb plugin>.<name>.scale",
    "type": "double",
    "default": "1.0",
    "ko": "이 critic 점수의 가중치. 클수록 이 기준을 더 중시한다.",
    "en": "Weighed scale for critic.",
    "key": "FollowPath.PathDist.scale"
   }
  ]
 },
 {
  "id": "nav2_critic_rotate_to_goal",
  "cat": "Nav2",
  "title": "critic: RotateToGoal",
  "pkg": "dwb_critics",
  "node": "/controller_server",
  "kind": "플러그인",
  "desc": "목표 근처에서 제자리 회전으로 방향 맞추기.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<dwb plugin>.xy_goal_tolerance",
    "type": "double",
    "default": "0.25",
    "ko": "이 거리(m) 안에 들면 제자리 회전 단계로 들어간다.",
    "en": "Tolerance to meet goal completion criteria (m).",
    "key": "FollowPath.xy_goal_tolerance"
   },
   {
    "name": "<dwb plugin>.trans_stopped_velocity",
    "type": "double",
    "default": "0.25",
    "ko": "이 속도 아래면 멈춘 것으로 본다.",
    "en": "Velocity below is considered to be stopped at tolerance met (rad/s).",
    "key": "FollowPath.trans_stopped_velocity"
   },
   {
    "name": "<dwb plugin>.<name>.slowing_factor",
    "type": "double",
    "default": "5.0",
    "ko": "목표 방향으로 돌 때 감속 배율.",
    "en": "Factor to slow robot motion by while rotating to goal.",
    "key": "FollowPath.RotateToGoal.slowing_factor"
   },
   {
    "name": "<dwb plugin>.<name>.lookahead_time",
    "type": "double",
    "default": "-1.0",
    "ko": ">0이면 이 시간(s) 앞까지 충돌을 본다.",
    "en": "If `> 0`, amount of time to look forward for a collision for.",
    "key": "FollowPath.RotateToGoal.lookahead_time"
   },
   {
    "name": "<dwb plugin>.<name>.scale",
    "type": "double",
    "default": "1.0",
    "ko": "이 critic 점수의 가중치. 클수록 이 기준을 더 중시한다.",
    "en": "Weighed scale for critic.",
    "key": "FollowPath.RotateToGoal.scale"
   }
  ]
 },
 {
  "id": "nav2_critic_oscillation",
  "cat": "Nav2",
  "title": "critic: Oscillation",
  "pkg": "dwb_critics",
  "node": "/controller_server",
  "kind": "플러그인",
  "desc": "앞뒤로 왔다 갔다 하는 궤적 감점.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<dwb plugin>.<name>.oscillation_reset_dist",
    "type": "double",
    "default": "0.05",
    "ko": "이만큼(m) 움직이면 진동 감시를 리셋.",
    "en": "Minimum distance to move to reset oscillation watchdog (m).",
    "key": "FollowPath.Oscillation.oscillation_reset_dist"
   },
   {
    "name": "<dwb plugin>.<name>.oscillation_reset_angle",
    "type": "double",
    "default": "0.2",
    "ko": "이만큼(rad) 돌면 진동 감시를 리셋.",
    "en": "Minimum angular distance to move to reset watchdog (rad).",
    "key": "FollowPath.Oscillation.oscillation_reset_angle"
   },
   {
    "name": "<dwb plugin>.<name>.oscillation_reset_time",
    "type": "double",
    "default": "-1.0",
    "ko": "리셋이 가능한 시간(s). -1이면 리셋 안 함.",
    "en": "Duration when a reset may be called. If `-1`, cannot be reset.",
    "key": "FollowPath.Oscillation.oscillation_reset_time"
   },
   {
    "name": "<dwb plugin>.<name>.x_only_threshold",
    "type": "double",
    "default": "0.05",
    "ko": "x 방향 속도로 진동을 판단하는 기준.",
    "en": "Threshold to check in the X velocity direction.",
    "key": "FollowPath.Oscillation.x_only_threshold"
   },
   {
    "name": "<dwb plugin>.<name>.scale",
    "type": "double",
    "default": "1.0",
    "ko": "이 critic 점수의 가중치. 클수록 이 기준을 더 중시한다.",
    "en": "Weighed scale for critic.",
    "key": "FollowPath.Oscillation.scale"
   }
  ]
 },
 {
  "id": "nav2_simple_goal_checker",
  "cat": "Nav2",
  "title": "SimpleGoalChecker",
  "pkg": "nav2_controller",
  "node": "/controller_server",
  "kind": "플러그인",
  "desc": "도착 판정. 키는 goal_checker.<이름>.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<nav2_controller plugin>.xy_goal_tolerance",
    "type": "double",
    "default": "0.25",
    "ko": "이 거리(m) 안이면 위치 도착.",
    "en": "Tolerance to meet goal completion criteria (m).",
    "key": "goal_checker.xy_goal_tolerance"
   },
   {
    "name": "<nav2_controller plugin>.yaw_goal_tolerance",
    "type": "double",
    "default": "0.25",
    "ko": "이 각도(rad) 안이면 방향 도착.",
    "en": "Tolerance to meet goal completion criteria (rad).",
    "key": "goal_checker.yaw_goal_tolerance"
   },
   {
    "name": "<nav2_controller plugin>.stateful",
    "type": "bool",
    "default": "true",
    "ko": "위치 도착을 한 번 판정하면 회전 중 위치가 조금 흔들려도 유지할지.",
    "en": "Whether to check for XY position tolerance after rotating to goal orientation in case of minor localization changes.",
    "key": "goal_checker.stateful"
   },
   {
    "name": "<nav2_controller plugin>.symmetric_yaw_tolerance",
    "type": "bool",
    "default": "false",
    "ko": "앞·뒤 어느 방향이든 도착으로 인정할지 (대칭 로봇).",
    "en": "Enable symmetric goal orientation acceptance. When enabled, the robot accepts the goal as reached when oriented at either the goal orientation or the goal orientation + 180°. This is useful for symmetric robots (e.g., differential drives with sensors on both ends) that can navigate equally well in forward and backward directions and does not care which direction it ends in (i.e. controller algorithm decides). See [Tuning Guide][tuning-guide] for detailed information.",
    "key": "goal_checker.symmetric_yaw_tolerance"
   }
  ]
 },
 {
  "id": "nav2_simple_progress_checker",
  "cat": "Nav2",
  "title": "SimpleProgressChecker",
  "pkg": "nav2_controller",
  "node": "/controller_server",
  "kind": "플러그인",
  "desc": "막힘 판정. 키는 progress_checker.<이름>.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<nav2_controller plugin>.required_movement_radius",
    "type": "double",
    "default": "0.5",
    "ko": "진행 중으로 볼 최소 이동 거리(m).",
    "en": "Minimum amount a robot must move to be progressing to goal (m).",
    "key": "progress_checker.required_movement_radius"
   },
   {
    "name": "<nav2_controller plugin>.movement_time_allowance",
    "type": "double",
    "default": "10.0",
    "ko": "그 거리를 움직여야 하는 시간(s). 넘으면 막힌 것으로 실패.",
    "en": "Maximum amount of time a robot has to move the minimum radius (s).",
    "key": "progress_checker.movement_time_allowance"
   }
  ]
 },
 {
  "id": "nav2_behavior_server",
  "cat": "Nav2",
  "title": "behavior_server",
  "pkg": "nav2_behaviors",
  "node": "/behavior_server",
  "kind": "노드",
  "desc": "복구 동작(Spin·BackUp·Wait·DriveOnHeading·AssistedTeleop) 서버.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "local_costmap_topic",
    "type": "string",
    "default": "\"local_costmap/costmap_raw\"",
    "ko": "충돌 검사에 쓸 로컬 costmap(raw) 토픽.",
    "en": "Raw costmap topic for collision checking on the local costmap.",
    "key": "local_costmap_topic"
   },
   {
    "name": "global_costmap_topic",
    "type": "string",
    "default": "\"global_costmap/costmap_raw\"",
    "ko": "충돌 검사에 쓸 글로벌 costmap(raw) 토픽.",
    "en": "Raw costmap topic for collision checking on the global costmap.",
    "key": "global_costmap_topic"
   },
   {
    "name": "local_footprint_topic",
    "type": "string",
    "default": "\"local_costmap/published_footprint\"",
    "ko": "로컬 costmap 좌표계의 로봇 footprint 토픽.",
    "en": "Topic for footprint in the local costmap frame.",
    "key": "local_footprint_topic"
   },
   {
    "name": "global_footprint_topic",
    "type": "string",
    "default": "\"global_costmap/published_footprint\"",
    "ko": "글로벌 costmap 좌표계의 로봇 footprint 토픽.",
    "en": "Topic for footprint in the global costmap frame.",
    "key": "global_footprint_topic"
   },
   {
    "name": "cycle_frequency",
    "type": "double",
    "default": "10.0",
    "ko": "복구 동작 플러그인을 돌리는 주기(Hz).",
    "en": "Frequency to run behavior plugins.",
    "key": "cycle_frequency"
   },
   {
    "name": "action_server_result_timeout",
    "type": "double",
    "default": "10.0",
    "ko": "결과를 못 낸 goal 핸들을 액션 서버가 버리기까지의 시간(s).",
    "en": "The timeout value (in seconds) for action servers to discard a goal handle if a result has not been produced. This used to default to 15 minutes in rcl but was changed to 10 seconds in this [PR #1012](https://github.com/ros2/rcl/pull/1012), which may be less than some actions in Nav2 take to run. For most applications, this should not need to be adjusted as long as the actions within the server do not exceed this deadline. This issue has been raised with OSRF to find another solution to avoid active goal timeouts for bookkeeping, so this is a semi-temporary workaround.",
    "key": "action_server_result_timeout"
   },
   {
    "name": "transform_tolerance",
    "type": "double",
    "default": "0.1",
    "ko": "TF 변환 허용 시간 오차(s). 이보다 오래된 TF면 실패로 본다.",
    "en": "TF transform tolerance.",
    "key": "transform_tolerance"
   },
   {
    "name": "local_frame",
    "type": "string",
    "default": "\"odom\"",
    "ko": "로컬 기준 좌표계.",
    "en": "Local reference frame.",
    "key": "local_frame"
   },
   {
    "name": "global_frame",
    "type": "string",
    "default": "\"map\"",
    "ko": "글로벌 기준 좌표계.",
    "en": "Global reference frame.",
    "key": "global_frame"
   },
   {
    "name": "robot_base_frame",
    "type": "string",
    "default": "\"base_link\"",
    "ko": "로봇 몸 좌표계.",
    "en": "Robot base frame.",
    "key": "robot_base_frame"
   },
   {
    "name": "behavior_plugins",
    "type": "vector<string>",
    "default": "[\"spin\", \"backup\", \"drive_on_heading\", \"wait\"]",
    "ko": "쓸 복구 플러그인 이름 목록 = 액션 서버 이름. 각 이름 아래 plugin 파라미터로 타입을 지정한다.",
    "en": "List of plugin names to use, also matches action server names. Note Each plugin namespace defined in this list needs to have a `plugin` parameter defining the type of plugin to be loaded in the namespace. Example: ```yaml behavior_server: ros__parameters: behavior_plugins: [\"spin\", \"backup\", \"drive_on_heading\", \"wait\"] spin: plugin: \"nav2_behaviors::Spin\" # In Iron and older versions, \"/\" was used instead of \"::\" backup: plugin: \"nav2_behaviors::BackUp\" # In Iron and older versions, \"/\" was used instead of \"::\" drive_on_heading: plugin: \"nav2_behaviors::DriveOnHeading\" # In Iron and older versions, \"/\" was used instead of \"::\" wait: plugin: \"nav2_behaviors::Wait\" # In Iron and older versions, \"/\" was used instead of \"::\" ```",
    "key": "behavior_plugins"
   },
   {
    "name": "simulate_ahead_time",
    "type": "double",
    "default": "2.0",
    "ko": "충돌을 미리 내다보는 시간(s). Spin·DriveOnHeading·BackUp이 쓴다.",
    "en": "Time to look ahead for collisions (s).",
    "key": "simulate_ahead_time"
   },
   {
    "name": "max_rotational_vel",
    "type": "double",
    "default": "1.0",
    "ko": "Spin 최대 회전 속도(rad/s).",
    "en": "Maximum rotational velocity (rad/s).",
    "key": "max_rotational_vel"
   },
   {
    "name": "min_rotational_vel",
    "type": "double",
    "default": "0.4",
    "ko": "Spin 최소 회전 속도(rad/s).",
    "en": "Minimum rotational velocity (rad/s).",
    "key": "min_rotational_vel"
   },
   {
    "name": "rotational_acc_lim",
    "type": "double",
    "default": "3.2",
    "ko": "Spin 최대 회전 가속도(rad/s²).",
    "en": "Maximum rotational acceleration (rad/s^2).",
    "key": "rotational_acc_lim"
   },
   {
    "name": "enable_stamped_cmd_vel",
    "type": "bool",
    "default": "false",
    "ko": "true면 속도 명령을 TwistStamped로, false면 Twist로 주고받는다. 체인 전체가 같은 값이어야 연결된다.",
    "en": "Whether to use `geometry_msgs::msg::Twist` or `geometry_msgs::msg::TwistStamped` velocity data. `true` uses `TwistStamped`, `false` uses `Twist`. Note This parameter is default `false` in Jazzy or older.",
    "key": "enable_stamped_cmd_vel",
    "design": "true"
   },
   {
    "name": "bond_heartbeat_period",
    "type": "double",
    "default": "0.1",
    "ko": "lifecycle bond 하트비트 발행 주기(s, /bond 토픽). 0 이하면 끔 — lifecycle_manager가 이걸로 서버 생존을 확인한다.",
    "en": "The lifecycle node bond mechanism publishing period (on the `/bond` topic). Disabled if inferior or equal to `0.0`.",
    "key": "bond_heartbeat_period"
   },
   {
    "name": "projection_time",
    "type": "double",
    "default": "1.0",
    "ko": "AssistedTeleop이 충돌을 내다보는 시간(s).",
    "en": "Time to look ahead for collisions (s).",
    "key": "projection_time"
   },
   {
    "name": "simulation_time_step",
    "type": "double",
    "default": "0.1",
    "ko": "AssistedTeleop 투영 시간 간격(s).",
    "en": "Time step for projections (s).",
    "key": "simulation_time_step"
   },
   {
    "name": "cmd_vel_teleop",
    "type": "string",
    "default": "\"cmd_vel_teleop\"",
    "ko": "AssistedTeleop이 사람 조종 명령을 받는 토픽.",
    "en": "Topic to listen for teleop messages.",
    "key": "cmd_vel_teleop"
   }
  ]
 },
 {
  "id": "nav2_costmap",
  "cat": "Nav2",
  "title": "costmap_2d (공통)",
  "pkg": "nav2_costmap_2d",
  "node": "/local_costmap/local_costmap",
  "kind": "노드",
  "desc": "costmap 공통 설정. local은 /local_costmap/local_costmap, global은 /global_costmap/global_costmap 노드.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "always_send_full_costmap",
    "type": "bool",
    "default": "false",
    "ko": "갱신 때마다 부분이 아니라 전체 costmap을 보낼지.",
    "en": "Whether to send the full costmap on every update instead of only incremental updates.",
    "key": "always_send_full_costmap"
   },
   {
    "name": "footprint_padding",
    "type": "double",
    "default": "0.01",
    "ko": "footprint를 사방으로 이만큼(m) 키운다.",
    "en": "Amount to pad footprint (m).",
    "key": "footprint_padding"
   },
   {
    "name": "footprint",
    "type": "vector<double>",
    "default": "[]",
    "ko": "로봇 외곽 다각형 \"[[x1,y1], ...]\"(m). 지정하면 robot_radius 대신 쓴다.",
    "en": "Ordered set of footprint points passed in as a string, must be closed set. For example, the following defines a square base with side lengths of 0.2 meters `footprint: \"[ [0.1, 0.1], [0.1, -0.1], [-0.1, -0.1], [-0.1, 0.1] ]\"`. Note that this can also be adjusted over time using the costmap's `~/footprint` topic, which will update the polygon over time as needed due to changes in the robot's state, such as movement of an attached manipulator, picking up a pallet, or other actions that adjust a robot's shape. If this parameter is set, `isPathValid` will do full collision checking.",
    "key": "footprint"
   },
   {
    "name": "global_frame",
    "type": "string",
    "default": "\"map\"",
    "ko": "costmap 기준 좌표계 (global은 map, local은 odom).",
    "en": "Reference frame.",
    "key": "global_frame"
   },
   {
    "name": "height",
    "type": "int",
    "default": "5",
    "ko": "costmap 높이(m) — rolling window일 때.",
    "en": "Height of costmap (m).",
    "key": "height"
   },
   {
    "name": "width",
    "type": "int",
    "default": "5",
    "ko": "costmap 너비(m) — rolling window일 때.",
    "en": "Width of costmap (m).",
    "key": "width"
   },
   {
    "name": "lethal_cost_threshold",
    "type": "int",
    "default": "100",
    "ko": "지도에서 이 값 이상이면 치명적 장애물로 본다.",
    "en": "Minimum cost of an occupancy grid map to be considered a lethal obstacle.",
    "key": "lethal_cost_threshold"
   },
   {
    "name": "map_topic",
    "type": "string",
    "default": "\"map\"",
    "ko": "정적 지도 토픽.",
    "en": "Topic of map from `map_server` or SLAM.",
    "key": "map_topic"
   },
   {
    "name": "map_vis_z",
    "type": "double",
    "default": "0.0",
    "ko": "RViz 표시 높이 (깜빡임 방지용).",
    "en": "The height of the map used for visualization, helping to avoid RViz flickering issues (e.g., at `-0.008`).",
    "key": "map_vis_z"
   },
   {
    "name": "origin_x",
    "type": "double",
    "default": "0.0",
    "ko": "costmap 원점 x(m).",
    "en": "X origin of the costmap relative to width (m).",
    "key": "origin_x"
   },
   {
    "name": "origin_y",
    "type": "double",
    "default": "0.0",
    "ko": "costmap 원점 y(m).",
    "en": "Y origin of the costmap relative to height (m).",
    "key": "origin_y"
   },
   {
    "name": "publish_frequency",
    "type": "double",
    "default": "1.0",
    "ko": "costmap을 토픽으로 발행하는 주기(Hz) — 시각화용.",
    "en": "Frequency (Hz) at which the costmap is published to a topic. Higher values provide more frequent updates for visualization and debugging but increase bandwidth usage.",
    "key": "publish_frequency"
   },
   {
    "name": "resolution",
    "type": "double",
    "default": "0.1",
    "ko": "셀 하나의 크기(m). 작을수록 정밀하지만 계산이 늘어난다.",
    "en": "Resolution of each cell (pixel) in the costmap, in meters. Smaller values increase map accuracy and obstacle detail but require more computation. Larger values reduce computational load but may miss fine obstacles.",
    "key": "resolution"
   },
   {
    "name": "robot_base_frame",
    "type": "string",
    "default": "\"base_link\"",
    "ko": "로봇 몸 좌표계.",
    "en": "Robot base frame.",
    "key": "robot_base_frame",
    "design": "base_footprint"
   },
   {
    "name": "robot_radius",
    "type": "double",
    "default": "0.1",
    "ko": "footprint가 없을 때 쓰는 원형 로봇 반경(m).",
    "en": "Robot radius to use, if footprint coordinates not provided. If this parameter is set, `isPathValid` will do circular collision checking.",
    "key": "robot_radius"
   },
   {
    "name": "rolling_window",
    "type": "bool",
    "default": "false",
    "ko": "true면 로봇을 따라 움직이는 창 (local costmap용).",
    "en": "If `true`, the costmap moves with the robot, maintaining a local view centered around it. This is typically used for local costmaps. If `false`, the costmap remains fixed in the global frame.",
    "key": "rolling_window"
   },
   {
    "name": "track_unknown_space",
    "type": "bool",
    "default": "false",
    "ko": "true면 모르는 칸을 \"모름\"으로, false면 \"비어 있음\"으로 본다.",
    "en": "If `false`, treats unknown space as free space, else as unknown space.",
    "key": "track_unknown_space"
   },
   {
    "name": "transform_tolerance",
    "type": "double",
    "default": "0.3",
    "ko": "TF 변환 허용 시간 오차(s). 이보다 오래된 TF면 실패로 본다.",
    "en": "TF transform tolerance.",
    "key": "transform_tolerance"
   },
   {
    "name": "initial_transform_timeout",
    "type": "double",
    "default": "60.0",
    "ko": "시작할 때 base→global TF를 기다리는 시간(s).",
    "en": "Time to wait for the transform from robot base frame to global frame to become available. If exceeded, the configuration stage is aborted.",
    "key": "initial_transform_timeout"
   },
   {
    "name": "trinary_costmap",
    "type": "bool",
    "default": "true",
    "ko": "지도를 빈칸/막힘/모름 세 값으로만 해석할지.",
    "en": "If occupancy grid map should be interpreted as only 3 values (free, occupied, unknown) or with its stored values.",
    "key": "trinary_costmap"
   },
   {
    "name": "unknown_cost_value",
    "type": "int",
    "default": "255",
    "ko": "모르는 칸의 비용 값.",
    "en": "Cost of unknown space if tracking it.",
    "key": "unknown_cost_value"
   },
   {
    "name": "update_frequency",
    "type": "double",
    "default": "5.0",
    "ko": "costmap 갱신 주기(Hz).",
    "en": "Costmap update frequency.",
    "key": "update_frequency"
   },
   {
    "name": "use_maximum",
    "type": "bool",
    "default": "false",
    "ko": "레이어를 합칠 때 큰 비용을 우선할지.",
    "en": "Whether to use the maximum cost when combining multiple costmap layers. If `true`, the highest cost is preserved, ensuring obstacles are not overwritten. If `false`, newer layers may override previous cost values.",
    "key": "use_maximum"
   },
   {
    "name": "plugins",
    "type": "vector<string>",
    "default": "[\"static_layer\", \"obstacle_layer\", \"inflation_layer\"]",
    "ko": "레이어 플러그인 이름 목록 (static_layer, obstacle_layer, voxel_layer, inflation_layer ...).",
    "en": "List of mapped plugin names for parameter namespaces and names. Note Each plugin namespace defined in this list needs to have a `plugin` parameter defining the type of plugin to be loaded in the namespace. Example: ```yaml local_costmap: ros__parameters: plugins: [\"obstacle_layer\", \"voxel_layer\", \"inflation_layer\"] obstacle_layer: plugin: \"nav2_costmap_2d::ObstacleLayer\" voxel_layer: plugin: \"nav2_costmap_2d::VoxelLayer\" inflation_layer: plugin: \"nav2_costmap_2d::InflationLayer\" ```",
    "key": "plugins",
    "design": "global: [static_layer, voxel_layer, inflation_layer] / local: [voxel_layer, inflation_layer]"
   },
   {
    "name": "filters",
    "type": "vector<string>",
    "default": "[\"\"]",
    "ko": "costmap 필터(속도 제한 구역·진입 금지 등) 이름 목록.",
    "en": "List of mapped costmap filter names for parameter namespaces and names. Note Costmap filters are also loadable plugins just as ordinary costmap layers. This separation is made to avoid plugin and filter interference and places these filters on top of the combined layered costmap. As with plugins, each costmap filter namespace defined in this list needs to have a `plugin` parameter defining the type of filter plugin to be loaded in the namespace. Example: ```yaml local_costmap: ros__parameters: filters: [\"keepout_filter\", \"speed_filter\"] keepout_filter: plugin: \"nav2_costmap_2d::KeepoutFilter\" speed_filter: plugin: \"nav2_costmap_2d::SpeedFilter\" ```",
    "key": "filters"
   }
  ]
 },
 {
  "id": "nav2_static_layer",
  "cat": "Nav2",
  "title": "StaticLayer",
  "pkg": "nav2_costmap_2d",
  "node": "/global_costmap/global_costmap",
  "kind": "플러그인",
  "desc": "지도(/map)를 costmap에 넣는 레이어.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<static layer>.enabled",
    "type": "bool",
    "default": "true",
    "ko": "이 레이어/영역/소스를 켤지 여부.",
    "en": "Whether it is enabled.",
    "key": "static_layer.enabled"
   },
   {
    "name": "<static layer>.footprint_clearing_enabled",
    "type": "bool",
    "default": "false",
    "ko": "로봇 footprint 아래를 비울지.",
    "en": "Clear any occupied cells under robot footprint.",
    "key": "static_layer.footprint_clearing_enabled"
   },
   {
    "name": "<static layer>.subscribe_to_updates",
    "type": "bool",
    "default": "false",
    "ko": "처음 지도 이후 갱신(map_updates)도 받을지.",
    "en": "Subscribe to static map updates after receiving first.",
    "key": "static_layer.subscribe_to_updates"
   },
   {
    "name": "<static layer>.map_subscribe_transient_local",
    "type": "bool",
    "default": "true",
    "ko": "지도 구독을 transient_local로 할지.",
    "en": "QoS settings for map topic.",
    "key": "static_layer.map_subscribe_transient_local"
   },
   {
    "name": "<static layer>.map_topic",
    "type": "string",
    "default": "\"\"",
    "ko": "지도 토픽 (비우면 costmap의 map_topic).",
    "en": "Map topic to subscribe to. If left empty the map topic will default to the global `map_topic` parameter in `costmap_2d_ros`.",
    "key": "static_layer.map_topic"
   }
  ]
 },
 {
  "id": "nav2_obstacle_layer",
  "cat": "Nav2",
  "title": "ObstacleLayer",
  "pkg": "nav2_costmap_2d",
  "node": "/local_costmap/local_costmap",
  "kind": "플러그인",
  "desc": "LaserScan·점구름으로 2D 장애물을 찍는 레이어.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<obstacle layer>.enabled",
    "type": "bool",
    "default": "true",
    "ko": "이 레이어/영역/소스를 켤지 여부.",
    "en": "Whether it is enabled.",
    "key": "obstacle_layer.enabled"
   },
   {
    "name": "<obstacle layer>.footprint_clearing_enabled",
    "type": "bool",
    "default": "true",
    "ko": "로봇 footprint 아래 칸을 비울지.",
    "en": "Clear any occupied cells under robot footprint.",
    "key": "obstacle_layer.footprint_clearing_enabled"
   },
   {
    "name": "<obstacle layer>.min_obstacle_height",
    "type": "double",
    "default": "0.0",
    "ko": "장애물로 넣을 최소 높이(m).",
    "en": "Minimum height to add return to occupancy grid.",
    "key": "obstacle_layer.min_obstacle_height"
   },
   {
    "name": "<obstacle layer>.max_obstacle_height",
    "type": "double",
    "default": "2.0",
    "ko": "장애물로 넣을 최대 높이(m).",
    "en": "Maximum height to add return to occupancy grid.",
    "key": "obstacle_layer.max_obstacle_height"
   },
   {
    "name": "<obstacle layer>.combination_method",
    "type": "int",
    "default": "1",
    "ko": "마스터 costmap과 합치는 방법: 0 덮어쓰기, 1 최댓값, 2 모름이 아닐 때만 최댓값.",
    "en": "Enum for method to add data to master costmap. Must be `0`, `1` or `2`, default to `1`(see below). - `0` - Overwrite: Overwrite master costmap with every valid observation. - `1` - Max: Sets the new value to the maximum of the `master_grid`'s value and this layer's value. This is the default. - `2` - MaxWithoutUnknownOverwrite: Sets the new value to the maximum of the `master_grid`'s value and this layer's value. If the master value is NO_INFORMATION, it is NOT overwritten. It can be used to make sure that the static map is the dominant source of information, and prevent the robot to go through places that are not present in the static map.",
    "key": "obstacle_layer.combination_method"
   },
   {
    "name": "<obstacle layer>.observation_sources",
    "type": "vector<string>",
    "default": "[\"\"]",
    "ko": "센서 소스 이름 목록.",
    "en": "Namespace of sources of data.",
    "key": "obstacle_layer.observation_sources"
   },
   {
    "name": "<obstacle layer>.<data source>.topic",
    "type": "string",
    "default": "\"\"",
    "ko": "소스 토픽.",
    "en": "Topic of data.",
    "key": "obstacle_layer.pointcloud.topic"
   },
   {
    "name": "<obstacle layer>.<data source>.sensor_frame",
    "type": "string",
    "default": "\"\"",
    "ko": "센서 좌표계 (비우면 메시지 frame_id).",
    "en": "Frame of sensor, to use if not provided by message. If empty, uses message `frame_id`.",
    "key": "obstacle_layer.pointcloud.sensor_frame"
   },
   {
    "name": "<obstacle layer>.<data source>.observation_persistence",
    "type": "double",
    "default": "0.0",
    "ko": "받은 데이터를 버퍼에 유지하는 시간(s). 0이면 최신 것만.",
    "en": "How long to store messages in a buffer to add to costmap before removing them (s).",
    "key": "obstacle_layer.pointcloud.observation_persistence"
   },
   {
    "name": "<obstacle layer>.<data source>.expected_update_rate",
    "type": "double",
    "default": "0.0",
    "ko": "기대 데이터 주기 (늦으면 경고).",
    "en": "Expected rate to get new data from sensor.",
    "key": "obstacle_layer.pointcloud.expected_update_rate"
   },
   {
    "name": "<obstacle layer>.<data source>.data_type",
    "type": "string",
    "default": "\"LaserScan\"",
    "ko": "입력 타입: LaserScan 또는 PointCloud2.",
    "en": "Data type of input, `\"LaserScan\"` or `\"PointCloud2\"`.",
    "key": "obstacle_layer.pointcloud.data_type"
   },
   {
    "name": "<obstacle layer>.<data source>.min_obstacle_height",
    "type": "double",
    "default": "0.0",
    "ko": "이 소스에서 장애물로 볼 최소 높이(m).",
    "en": "Minimum height to add return to occupancy grid.",
    "key": "obstacle_layer.pointcloud.min_obstacle_height"
   },
   {
    "name": "<obstacle layer>.<data source>.max_obstacle_height",
    "type": "double",
    "default": "0.0",
    "ko": "이 소스에서 장애물로 볼 최대 높이(m).",
    "en": "Maximum height to add return to occupancy grid.",
    "key": "obstacle_layer.pointcloud.max_obstacle_height"
   },
   {
    "name": "<obstacle layer>.<data source>.inf_is_valid",
    "type": "bool",
    "default": "false",
    "ko": "LiDAR의 inf 값을 \"멀리 비어 있음\"으로 쓸지.",
    "en": "Are infinite returns from laser scanners valid measurements to raycast.",
    "key": "obstacle_layer.pointcloud.inf_is_valid"
   },
   {
    "name": "<obstacle layer>.<data source>.marking",
    "type": "bool",
    "default": "true",
    "ko": "이 소스로 장애물을 찍을지.",
    "en": "Whether source should mark in costmap.",
    "key": "obstacle_layer.pointcloud.marking"
   },
   {
    "name": "<obstacle layer>.<data source>.clearing",
    "type": "bool",
    "default": "false",
    "ko": "이 소스로 레이를 쏴서 빈 곳을 지울지.",
    "en": "Whether source should raytrace clear in costmap.",
    "key": "obstacle_layer.pointcloud.clearing"
   },
   {
    "name": "<obstacle layer>.<data source>.obstacle_max_range",
    "type": "double",
    "default": "2.5",
    "ko": "장애물을 찍는 최대 거리(m).",
    "en": "Maximum range to mark obstacles in costmap.",
    "key": "obstacle_layer.pointcloud.obstacle_max_range"
   },
   {
    "name": "<obstacle layer>.<data source>.obstacle_min_range",
    "type": "double",
    "default": "0.0",
    "ko": "장애물을 찍는 최소 거리(m).",
    "en": "Minimum range to mark obstacles in costmap.",
    "key": "obstacle_layer.pointcloud.obstacle_min_range"
   },
   {
    "name": "<obstacle layer>.<data source>.raytrace_max_range",
    "type": "double",
    "default": "3.0",
    "ko": "빈 곳을 지우는 최대 거리(m).",
    "en": "Maximum range to raytrace clear obstacles from costmap.",
    "key": "obstacle_layer.pointcloud.raytrace_max_range"
   },
   {
    "name": "<obstacle layer>.<data source>.raytrace_min_range",
    "type": "double",
    "default": "0.0",
    "ko": "빈 곳을 지우는 최소 거리(m).",
    "en": "Minimum range to raytrace clear obstacles from costmap.",
    "key": "obstacle_layer.pointcloud.raytrace_min_range"
   }
  ]
 },
 {
  "id": "nav2_voxel_layer",
  "cat": "Nav2",
  "title": "VoxelLayer",
  "pkg": "nav2_costmap_2d",
  "node": "/local_costmap/local_costmap",
  "kind": "플러그인",
  "desc": "점구름을 3D voxel에 쌓아 2D로 내리는 레이어 — LiDAR 없는 이 설계의 장애물 층.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<voxel layer>.enabled",
    "type": "bool",
    "default": "true",
    "ko": "이 레이어/영역/소스를 켤지 여부.",
    "en": "Whether it is enabled.",
    "key": "voxel_layer.enabled"
   },
   {
    "name": "<voxel layer>.footprint_clearing_enabled",
    "type": "bool",
    "default": "true",
    "ko": "로봇 footprint 아래 칸을 비울지.",
    "en": "Clear any occupied cells under robot footprint.",
    "key": "voxel_layer.footprint_clearing_enabled"
   },
   {
    "name": "<voxel layer>.min_obstacle_height",
    "type": "double",
    "default": "0.0",
    "ko": "장애물로 넣을 최소 높이(m).",
    "en": "Minimum height to add return to occupancy grid.",
    "key": "voxel_layer.min_obstacle_height"
   },
   {
    "name": "<voxel layer>.max_obstacle_height",
    "type": "double",
    "default": "2.0",
    "ko": "장애물로 넣을 최대 높이(m).",
    "en": "Maximum height to add return to occupancy grid.",
    "key": "voxel_layer.max_obstacle_height"
   },
   {
    "name": "<voxel layer>.z_voxels",
    "type": "int",
    "default": "10",
    "ko": "세로 voxel 칸 수 (최대 16).",
    "en": "Number of voxels high to mark, maximum `16`.",
    "key": "voxel_layer.z_voxels"
   },
   {
    "name": "<voxel layer>.origin_z",
    "type": "double",
    "default": "0.0",
    "ko": "voxel을 쌓기 시작하는 높이(m).",
    "en": "Where to start marking voxels (m).",
    "key": "voxel_layer.origin_z"
   },
   {
    "name": "<voxel layer>.z_resolution",
    "type": "double",
    "default": "0.2",
    "ko": "voxel 한 칸 높이(m).",
    "en": "Resolution of voxels in height (m).",
    "key": "voxel_layer.z_resolution"
   },
   {
    "name": "<voxel layer>.unknown_threshold",
    "type": "int",
    "default": "15",
    "ko": "세로 칸 중 빈 칸이 이 수 이상이면 2D에서 \"모름\".",
    "en": "Minimum number of empty voxels in a column to mark as unknown in 2D occupancy grid.",
    "key": "voxel_layer.unknown_threshold"
   },
   {
    "name": "<voxel layer>.mark_threshold",
    "type": "int",
    "default": "0",
    "ko": "세로로 이 수보다 많이 찬 칸이 있으면 2D에서 막힘.",
    "en": "Minimum number of voxels in a column to mark as occupied in 2D occupancy grid.",
    "key": "voxel_layer.mark_threshold"
   },
   {
    "name": "<voxel layer>.combination_method",
    "type": "int",
    "default": "1",
    "ko": "마스터 costmap과 합치는 방법: 0 덮어쓰기, 1 최댓값, 2 모름이 아닐 때만 최댓값.",
    "en": "Enum for method to add data to master costmap. Must be `0`, `1` or `2`, default to `1` (see below). - `0` - Overwrite: Overwrite master costmap with every valid observation. - `1` - Max: Sets the new value to the maximum of the `master_grid`'s value and this layer's value. This is the default. - `2` - MaxWithoutUnknownOverwrite: Sets the new value to the maximum of the `master_grid`'s value and this layer's value. If the master value is NO_INFORMATION, it is NOT overwritten. It can be used to make sure that the static map is the dominant source of information, and prevent the robot to go through places that are not present in the static map.",
    "key": "voxel_layer.combination_method"
   },
   {
    "name": "<voxel layer>.publish_voxel_map",
    "type": "bool",
    "default": "false",
    "ko": "3D voxel 격자를 디버그용으로 발행할지 (무거움).",
    "en": "Whether to publish 3D voxel grid for debug, computationally expensive.",
    "key": "voxel_layer.publish_voxel_map"
   },
   {
    "name": "<voxel layer>.observation_sources",
    "type": "vector<string>",
    "default": "[\"\"]",
    "ko": "센서 소스 이름 목록.",
    "en": "Namespace of sources of data.",
    "key": "voxel_layer.observation_sources",
    "design": "[pointcloud]"
   },
   {
    "name": "<voxel layer>.<data source>.topic",
    "type": "string",
    "default": "\"\"",
    "ko": "소스 토픽.",
    "en": "Topic of data.",
    "key": "voxel_layer.pointcloud.topic",
    "design": "/pole_cam/depth/color/points"
   },
   {
    "name": "<voxel layer>.<data source>.sensor_frame",
    "type": "string",
    "default": "\"\"",
    "ko": "센서 좌표계 (비우면 메시지 frame_id).",
    "en": "Frame of sensor, to use if not provided by message. If empty, uses message `frame_id`.",
    "key": "voxel_layer.pointcloud.sensor_frame"
   },
   {
    "name": "<voxel layer>.<data source>.observation_persistence",
    "type": "double",
    "default": "0.0",
    "ko": "받은 데이터를 버퍼에 유지하는 시간(s). 0이면 최신 것만.",
    "en": "How long to store messages in a buffer to add to costmap before removing them (s).",
    "key": "voxel_layer.pointcloud.observation_persistence"
   },
   {
    "name": "<voxel layer>.<data source>.expected_update_rate",
    "type": "double",
    "default": "0.0",
    "ko": "기대 데이터 주기 (늦으면 경고).",
    "en": "Expected rate to get new data from sensor.",
    "key": "voxel_layer.pointcloud.expected_update_rate"
   },
   {
    "name": "<voxel layer>.<data source>.data_type",
    "type": "string",
    "default": "\"LaserScan\"",
    "ko": "입력 타입: LaserScan 또는 PointCloud2.",
    "en": "Data type of input, `\"LaserScan\"` or `\"PointCloud2\"`.",
    "key": "voxel_layer.pointcloud.data_type",
    "design": "PointCloud2"
   },
   {
    "name": "<voxel layer>.<data source>.min_obstacle_height",
    "type": "double",
    "default": "0.0",
    "ko": "이 소스에서 장애물로 볼 최소 높이(m).",
    "en": "Minimum height to add return to occupancy grid.",
    "key": "voxel_layer.pointcloud.min_obstacle_height",
    "design": "0.03 (바닥 제거)"
   },
   {
    "name": "<voxel layer>.<data source>.max_obstacle_height",
    "type": "double",
    "default": "0.0",
    "ko": "이 소스에서 장애물로 볼 최대 높이(m).",
    "en": "Maximum height to add return to occupancy grid.",
    "key": "voxel_layer.pointcloud.max_obstacle_height",
    "design": "0.40 (테이블 상판 위 제외)"
   },
   {
    "name": "<voxel layer>.<data source>.inf_is_valid",
    "type": "bool",
    "default": "false",
    "ko": "LiDAR의 inf 값을 \"멀리 비어 있음\"으로 쓸지.",
    "en": "Are infinite returns from laser scanners valid measurements to raycast.",
    "key": "voxel_layer.pointcloud.inf_is_valid"
   },
   {
    "name": "<voxel layer>.<data source>.marking",
    "type": "bool",
    "default": "true",
    "ko": "이 소스로 장애물을 찍을지.",
    "en": "Whether source should mark in costmap.",
    "key": "voxel_layer.pointcloud.marking"
   },
   {
    "name": "<voxel layer>.<data source>.clearing",
    "type": "bool",
    "default": "false",
    "ko": "이 소스로 레이를 쏴서 빈 곳을 지울지.",
    "en": "Whether source should raytrace clear in costmap.",
    "key": "voxel_layer.pointcloud.clearing"
   },
   {
    "name": "<voxel layer>.<data source>.obstacle_max_range",
    "type": "double",
    "default": "2.5",
    "ko": "장애물을 찍는 최대 거리(m).",
    "en": "Maximum range to mark obstacles in costmap.",
    "key": "voxel_layer.pointcloud.obstacle_max_range"
   },
   {
    "name": "<voxel layer>.<data source>.obstacle_min_range",
    "type": "double",
    "default": "0.0",
    "ko": "장애물을 찍는 최소 거리(m).",
    "en": "Minimum range to mark obstacles in costmap.",
    "key": "voxel_layer.pointcloud.obstacle_min_range"
   },
   {
    "name": "<voxel layer>.<data source>.raytrace_max_range",
    "type": "double",
    "default": "3.0",
    "ko": "빈 곳을 지우는 최대 거리(m).",
    "en": "Maximum range to raytrace clear obstacles from costmap.",
    "key": "voxel_layer.pointcloud.raytrace_max_range"
   },
   {
    "name": "<voxel layer>.<data source>.raytrace_min_range",
    "type": "double",
    "default": "0.0",
    "ko": "빈 곳을 지우는 최소 거리(m).",
    "en": "Minimum range to raytrace clear obstacles from costmap.",
    "key": "voxel_layer.pointcloud.raytrace_min_range"
   }
  ]
 },
 {
  "id": "nav2_inflation_layer",
  "cat": "Nav2",
  "title": "InflationLayer",
  "pkg": "nav2_costmap_2d",
  "node": "/local_costmap/local_costmap",
  "kind": "플러그인",
  "desc": "장애물 주변을 비용으로 부풀리는 레이어.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "<inflation layer>.enabled",
    "type": "bool",
    "default": "true",
    "ko": "이 레이어/영역/소스를 켤지 여부.",
    "en": "Whether it is enabled.",
    "key": "inflation_layer.enabled"
   },
   {
    "name": "<inflation layer>.inflation_radius",
    "type": "double",
    "default": "0.55",
    "ko": "장애물 주변을 이 반경(m)까지 비용으로 부풀린다. 로봇이 벽에 붙지 않게.",
    "en": "Radius to inflate costmap around lethal obstacles.",
    "key": "inflation_layer.inflation_radius",
    "design": "0.25"
   },
   {
    "name": "<inflation layer>.cost_scaling_factor",
    "type": "double",
    "default": "10.0",
    "ko": "거리에 따라 비용이 줄어드는 지수 감쇠 계수. 클수록 빨리 줄어든다.",
    "en": "Exponential decay factor across inflation radius.",
    "key": "inflation_layer.cost_scaling_factor"
   },
   {
    "name": "<inflation layer>.inflate_unknown",
    "type": "bool",
    "default": "false",
    "ko": "모르는 칸도 치명적 장애물처럼 부풀릴지.",
    "en": "Whether to inflate unknown cells as if lethal.",
    "key": "inflation_layer.inflate_unknown"
   },
   {
    "name": "<inflation layer>.inflate_around_unknown",
    "type": "bool",
    "default": "false",
    "ko": "모르는 칸 주변을 부풀릴지.",
    "en": "Whether to inflate unknown cells.",
    "key": "inflation_layer.inflate_around_unknown"
   }
  ]
 },
 {
  "id": "nav2_velocity_smoother",
  "cat": "Nav2",
  "title": "velocity_smoother",
  "pkg": "nav2_velocity_smoother",
  "node": "/velocity_smoother",
  "kind": "노드",
  "desc": "속도 명령의 가속·감속 제한.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "use_realtime_priority",
    "type": "bool",
    "default": "false",
    "ko": "실행 스레드를 실시간 우선순위(90)로 올린다. /etc/security/limits.conf에 rtprio 권한이 있어야 한다.",
    "en": "Adds soft real-time prioritization to the controller server to better ensure resources to time sensitive portions of the codebase. This will set the controller's execution thread to a higher priority than the rest of the system (`90`) to meet scheduling deadlines to have less missed loop rates. To use this feature, you use set the following inside of `/etc/security/limits.conf` to give userspace access to elevated prioritization permissions: `<username> soft rtprio 99 <username> hard rtprio 99`",
    "key": "use_realtime_priority"
   },
   {
    "name": "smoothing_frequency",
    "type": "double",
    "default": "20.0",
    "ko": "속도를 다듬어 내보내는 주기(Hz).",
    "en": "Frequency (Hz) to use the last received velocity command to smooth by velocity, acceleration, and deadband constraints. If set approximately to the rate of your local trajectory planner, it should smooth by acceleration constraints velocity commands. If set much higher, it will interpolate and provide a smooth set of commands to the hardware controller.",
    "key": "smoothing_frequency",
    "design": "20.0"
   },
   {
    "name": "scale_velocities",
    "type": "bool",
    "default": "false",
    "ko": "한 축이 가속 제한에 걸리면 다른 축도 비율대로 줄여 방향을 유지할지.",
    "en": "Whether or not to adjust other components of velocity proportionally to a component's required changes due to acceleration limits. This will try to adjust all components to follow the same direction, but still enforces acceleration limits to guarantee compliance, even if it means deviating off commanded trajectory slightly.",
    "key": "scale_velocities"
   },
   {
    "name": "feedback",
    "type": "string",
    "default": "\"OPEN_LOOP\"",
    "ko": "OPEN_LOOP: 마지막 명령을 현재 속도로 가정 / CLOSED_LOOP: 오도메트리로 현재 속도 추정.",
    "en": "Type of feedback to use for the current state of the robot's velocity. In `\"OPEN_LOOP\"`, it will use the last commanded velocity as the next iteration's current velocity. When acceleration limits are set appropriately, this is a good assumption. In `\"CLOSED_LOOP\"`, it will use the odometry from the `odom` topic to estimate the robot's current speed. In closed loop mode, it is important that the odometry is high rate and low latency, relative to the smoothing frequency.",
    "key": "feedback",
    "design": "OPEN_LOOP"
   },
   {
    "name": "max_velocity",
    "type": "vector<double>",
    "default": "[0.5, 0.0, 2.5]",
    "ko": "최대 속도 [x, y, θ] (m/s, rad/s).",
    "en": "Maximum velocities (m/s) in `[x, y, theta]` axes.",
    "key": "max_velocity",
    "design": "[0.26, 0.0, 1.82] (TurtleBot3 Waffle)"
   },
   {
    "name": "min_velocity",
    "type": "vector<double>",
    "default": "[-0.5, 0.0, -2.5]",
    "ko": "최소 속도 [x, y, θ] — 부호 있음, 후진하려면 음수.",
    "en": "Minimum velocities (m/s) in `[x, y, theta]` axes. This is **signed** and thus must be **negative** to reverse. Note Rotational velocities negative direction is a right-hand turn, so this should always be negative regardless of reversing preference.",
    "key": "min_velocity"
   },
   {
    "name": "deadband_velocity",
    "type": "vector<double>",
    "default": "[0.0, 0.0, 0.0]",
    "ko": "이보다 작은 속도는 0으로 보낸다 [x, y, θ].",
    "en": "Minimum velocities (m/s) in `[x, y, theta]` axes to send to the robot hardware controllers, to prevent small commands from damaging hardware controllers if that speed cannot be achieved due to stall torque.",
    "key": "deadband_velocity"
   },
   {
    "name": "velocity_timeout",
    "type": "double",
    "default": "1.0",
    "ko": "입력이 이 시간(s) 끊기면 0 명령을 내고 발행을 멈춘다.",
    "en": "Timeout (s) after which the velocity smoother will send a zero-ed out `Twist` command and stop publishing.",
    "key": "velocity_timeout"
   },
   {
    "name": "max_accel",
    "type": "vector<double>",
    "default": "[2.5, 0.0, 3.2]",
    "ko": "최대 가속도 [x, y, θ].",
    "en": "Maximum acceleration to apply to each axis `[x, y, theta]`.",
    "key": "max_accel",
    "design": "[2.5, 0.0, 3.2]"
   },
   {
    "name": "max_decel",
    "type": "vector<double>",
    "default": "[-2.5, 0.0, -3.2]",
    "ko": "최대 감속도 [x, y, θ] — 음수.",
    "en": "Minimum acceleration to apply to each axis `[x, y, theta]`. This is **signed** and thus these should generally all be **negative**.",
    "key": "max_decel"
   },
   {
    "name": "odom_topic",
    "type": "string",
    "default": "\"odom\"",
    "ko": "CLOSED_LOOP일 때 쓰는 오도메트리 토픽.",
    "en": "Topic to find robot odometry, if in `\"CLOSED_LOOP\"` operational mode.",
    "key": "odom_topic"
   },
   {
    "name": "odom_duration",
    "type": "double",
    "default": "0.1",
    "ko": "CLOSED_LOOP 속도 추정에 쓰는 오도메트리 버퍼 시간(s).",
    "en": "Time (s) to buffer odometry commands to estimate the robot speed, if in `\"CLOSED_LOOP\"` operational mode.",
    "key": "odom_duration"
   },
   {
    "name": "enable_stamped_cmd_vel",
    "type": "bool",
    "default": "false",
    "ko": "true면 속도 명령을 TwistStamped로, false면 Twist로 주고받는다. 체인 전체가 같은 값이어야 연결된다.",
    "en": "Whether to use `geometry_msgs::msg::Twist` or `geometry_msgs::msg::TwistStamped` velocity data. `true` uses `TwistStamped`, `false` uses `Twist`. Note This parameter is default `false` in Jazzy or older.",
    "key": "enable_stamped_cmd_vel",
    "design": "true"
   },
   {
    "name": "stamp_smoothed_velocity_with_smoothing_time",
    "type": "bool",
    "default": "false",
    "ko": "TwistStamped 출력의 stamp를 다듬은 시각으로 보간할지.",
    "en": "Whether to interpolate the timestamps of the smoothed `geometery_msgs:msg::TwistStamped` cmd_vel message after the last command velocity received. Only available in Jazzy as a backport of the now-default behavior in Lyrical and newer. Default is `false` for backwards compatibility.",
    "key": "stamp_smoothed_velocity_with_smoothing_time"
   },
   {
    "name": "bond_heartbeat_period",
    "type": "double",
    "default": "0.1",
    "ko": "lifecycle bond 하트비트 발행 주기(s, /bond 토픽). 0 이하면 끔 — lifecycle_manager가 이걸로 서버 생존을 확인한다.",
    "en": "The lifecycle node bond mechanism publishing period (on the `/bond` topic). Disabled if inferior or equal to `0.0`.",
    "key": "bond_heartbeat_period"
   }
  ]
 },
 {
  "id": "nav2_collision_monitor",
  "cat": "Nav2",
  "title": "collision_monitor",
  "pkg": "nav2_collision_monitor",
  "node": "/collision_monitor",
  "kind": "노드",
  "desc": "최종 속도 명령 안전 필터 (영역 기반 감속·정지).",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "base_frame_id",
    "type": "string",
    "default": "\"base_footprint\"",
    "ko": "로봇 몸 좌표계.",
    "en": "Robot base frame.",
    "key": "base_frame_id"
   },
   {
    "name": "odom_frame_id",
    "type": "string",
    "default": "\"odom\"",
    "ko": "오도메트리 좌표계.",
    "en": "Which frame to use for odometry.",
    "key": "odom_frame_id"
   },
   {
    "name": "cmd_vel_in_topic",
    "type": "string",
    "default": "\"cmd_vel_smoothed\"",
    "ko": "입력 속도 명령 토픽 (보통 velocity_smoother 출력).",
    "en": "Input `cmd_vel` topic with desired robot velocity. Please note, pre-Jazzy this was set to `cmd_vel_raw` by default.",
    "key": "cmd_vel_in_topic",
    "design": "cmd_vel_smoothed"
   },
   {
    "name": "cmd_vel_out_topic",
    "type": "string",
    "default": "\"cmd_vel\"",
    "ko": "걸러낸 최종 속도 명령 토픽.",
    "en": "Output `cmd_vel` topic with output produced by Collision Monitor velocities.",
    "key": "cmd_vel_out_topic"
   },
   {
    "name": "state_topic",
    "type": "string",
    "default": "\"\"",
    "ko": "현재 걸린 영역·동작을 알리는 토픽. 비우면 발행하지 않는다.",
    "en": "Output the currently activated polygon action type and name. Optional parameter. No publisher will be created if it is unspecified.",
    "key": "state_topic"
   },
   {
    "name": "transform_tolerance",
    "type": "double",
    "default": "0.1",
    "ko": "TF 변환 허용 시간 오차(s). 이보다 오래된 TF면 실패로 본다.",
    "en": "Time with which to post-date the transform that is published, to indicate that this transform is valid into the future.",
    "key": "transform_tolerance"
   },
   {
    "name": "source_timeout",
    "type": "double",
    "default": "2.0",
    "ko": "센서 데이터가 이 시간(s) 넘게 끊기면 로봇을 멈춘다. 0이면 검사 안 함.",
    "en": "Maximum time interval in which source data is considered as valid. If no new data is received within this interval, the robot will be stopped. Setting `source_timeout: 0.0` disables this blocking mechanism. This parameter can be overridden per observation source.",
    "key": "source_timeout"
   },
   {
    "name": "base_shift_correction",
    "type": "bool",
    "default": "true",
    "ko": "센서 시각과 현재 시각 사이 로봇 이동을 보정할지.",
    "en": "Whether to correct source data towards to base frame movement, considering the difference between current time and latest source time. If enabled, produces more accurate sources positioning in the robot base frame, at the cost of slower performance. This will cause average delays for `~1/(2*odom_rate)` per each `cmd_vel` calculation cycle. However, disabling this option for better performance is not recommended for the fast moving robots, where during the typical rate of data sources, robot could move unacceptably far. Thus reasonable odometry rates are recommended (~100 hz).",
    "key": "base_shift_correction"
   },
   {
    "name": "stop_pub_timeout",
    "type": "double",
    "default": "1.0",
    "ko": "정지(0 속도) 명령을 이 시간(s) 동안만 내고 멈춘다 — 다른 시스템이 로봇을 빼낼 수 있게.",
    "en": "Timeout, after which zero-velocity ceases to be published. It could be used for other overrode systems outside Nav2 are trying to bring the robot out of a state close to a collision, or to allow a standing robot to go into sleep mode.",
    "key": "stop_pub_timeout"
   },
   {
    "name": "polygons",
    "type": "vector<string>",
    "default": "N/A",
    "ko": "검사 영역 이름 목록 (stop/slowdown/limit/approach 영역).",
    "en": "List of zones (stop/slowdown/limit bounding boxes, footprint, approach circle, etc...). Causes an error, if not specialized.",
    "key": "polygons",
    "design": "[FootprintApproach, SlowDown, Stop]"
   },
   {
    "name": "observation_sources",
    "type": "vector<string>",
    "default": "N/A",
    "ko": "데이터 소스 이름 목록 (scan, pointcloud, range ...).",
    "en": "List of data sources (laser scanners, pointclouds, etc...). Causes an error, if not specialized.",
    "key": "observation_sources",
    "design": "[pointcloud] (pole_cam, LiDAR 없음)"
   },
   {
    "name": "use_realtime_priority",
    "type": "bool",
    "default": "false",
    "ko": "실행 스레드를 실시간 우선순위(90)로 올린다. /etc/security/limits.conf에 rtprio 권한이 있어야 한다.",
    "en": "Adds soft real-time prioritization to the controller server to better ensure resources to time sensitive portions of the codebase. This will set the controller's execution thread to a higher priority than the rest of the system (`90`) to meet scheduling deadlines to have less missed loop rates. To use this feature, you use set the following inside of `/etc/security/limits.conf` to give userspace access to elevated prioritization permissions: `<username> soft rtprio 99 <username> hard rtprio 99`",
    "key": "use_realtime_priority"
   },
   {
    "name": "enable_stamped_cmd_vel",
    "type": "bool",
    "default": "false",
    "ko": "true면 속도 명령을 TwistStamped로, false면 Twist로 주고받는다. 체인 전체가 같은 값이어야 연결된다.",
    "en": "Whether to use `geometry_msgs::msg::Twist` or `geometry_msgs::msg::TwistStamped` velocity data. `true` uses `TwistStamped`, `false` uses `Twist`. Note This parameter is default `false` in Jazzy or older.",
    "key": "enable_stamped_cmd_vel",
    "design": "true"
   },
   {
    "name": "<polygon_name>.type",
    "type": "string",
    "default": "N/A",
    "ko": "영역 모양: polygon 또는 circle.",
    "en": "Type of polygon shape. Available values are `\"polygon\"`, `\"circle\"`. Causes an error, if not specialized.",
    "key": "Stop.type"
   },
   {
    "name": "<polygon_name>.points",
    "type": "string",
    "default": "N/A",
    "ko": "다각형 꼭짓점 \"[[x1, y1], [x2, y2], ...]\" (base 좌표, m).",
    "en": "Polygon vertices, listed in `\"[[p1.x, p1.y], [p2.x, p2.y], [p3.x, p3.y], ...]\"` format (e.g. `\"[[0.5, 0.25], [0.5, -0.25], [0.0, -0.25], [0.0, 0.25]]\"` for the square in the front). Used for `\"polygon\"` type. Minimum 3 points for a triangle polygon. If not specified, the collision monitor will use dynamic polygon subscription to `polygon_sub_topic` for points in the `\"stop\"`/`\"slowdown\"`/`\"limit\"` action types, or footprint subscriber to `footprint_topic` for `\"approach\"` action type.",
    "key": "Stop.points"
   },
   {
    "name": "<polygon_name>.polygon_sub_topic",
    "type": "string",
    "default": "N/A",
    "ko": "영역을 실행 중에 받아올 토픽 (polygon이면 점, circle이면 반경).",
    "en": "For `\"polygon\"` type, topic to listen the polygon points from. For `\"circle\"` type, topic to listen the circle radius from. Applicable for `\"stop\"`/`\"slowdown\"`/`\"limit\"` action types. Causes an error if not specified **and** static polygon geometry (using parameter `points` for `\"polygon\"` type or `radius` for `\"circle\"` type) is also not specified. If both static polygon geometry and `polygon_sub_topic` are specified, the static parameter takes priority.",
    "key": "Stop.polygon_sub_topic"
   },
   {
    "name": "<polygon_name>.footprint_topic",
    "type": "string",
    "default": "\"local_costmap/published_footprint\"",
    "ko": "approach 동작에서 로봇 footprint를 받는 토픽.",
    "en": "Topic to listen the robot footprint from. Applicable only for `\"polygon\"` type and `\"approach\"` action type. If both `points` and `footprint_topic` are specified, the static `points` takes priority.",
    "key": "Stop.footprint_topic"
   },
   {
    "name": "<polygon_name>.polygon_subscribe_transient_local",
    "type": "bool",
    "default": "false",
    "ko": "영역/footprint 토픽 구독을 transient_local로 할지.",
    "en": "QoS durability setting for the incoming polygon or footprint topic subscription.",
    "key": "Stop.polygon_subscribe_transient_local"
   },
   {
    "name": "<polygon_name>.radius",
    "type": "double",
    "default": "N/A",
    "ko": "circle 영역 반경(m).",
    "en": "Circle radius. Used for `\"circle\"` type. If not specified, the collision monitor will use dynamic polygon subscription to `polygon_sub_topic` for circle radius in the `\"stop\"`/`\"slowdown\"`/`\"limit\"` action types.",
    "key": "Stop.radius"
   },
   {
    "name": "<polygon_name>.action_type",
    "type": "string",
    "default": "N/A",
    "ko": "영역 안에 장애물이 들면 할 일: stop(정지), slowdown(감속), limit(속도 상한), approach(충돌 예상 시간 기반 감속).",
    "en": "Zone behavior model. Available values are `\"stop\"`, `\"slowdown\"`, `\"limit\"`, `\"approach\"`. Causes an error, if not specialized.",
    "key": "Stop.action_type"
   },
   {
    "name": "<polygon_name>.min_points",
    "type": "int",
    "default": "4",
    "ko": "동작을 일으킬 최소 장애물 점 수 (잡음 무시용).",
    "en": "Minimum number of data readings within a zone to trigger the action. Former `max_points` parameter for Humble, that meant the maximum number of data readings within a zone to not trigger the action). `min_points` is equal to `max_points + 1` value.",
    "key": "Stop.min_points"
   },
   {
    "name": "<polygon_name>.slowdown_ratio",
    "type": "double",
    "default": "0.5",
    "ko": "slowdown 때 속도 배율 (0.5 = 절반).",
    "en": "Robot slowdown (share of its actual speed). Applicable for `\"slowdown\"` action type.",
    "key": "Stop.slowdown_ratio",
    "design": "0.4 (SlowDown 영역 0.3m)"
   },
   {
    "name": "<polygon_name>.linear_limit",
    "type": "double",
    "default": "0.5",
    "ko": "limit 동작의 선속도 상한(m/s).",
    "en": "Robot linear speed limit. Applicable for `\"limit\"` action type.",
    "key": "Stop.linear_limit"
   },
   {
    "name": "<polygon_name>.angular_limit",
    "type": "double",
    "default": "0.5",
    "ko": "limit 동작의 각속도 상한(rad/s).",
    "en": "Robot angular speed limit. Applicable for `\"limit\"` action type.",
    "key": "Stop.angular_limit"
   },
   {
    "name": "<polygon_name>.time_before_collision",
    "type": "double",
    "default": "2.0",
    "ko": "approach 동작: 이 시간(s) 안에 충돌할 것 같으면 감속.",
    "en": "Time before collision in seconds. Maximum simulation time used in collision prediction. Higher values mean lower performance. Applicable for `\"approach\"` action type.",
    "key": "Stop.time_before_collision"
   },
   {
    "name": "<polygon_name>.simulation_time_step",
    "type": "double",
    "default": "0.1",
    "ko": "approach 충돌 예측 시뮬레이션 간격(s).",
    "en": "Time iteration step for robot movement simulation during collision prediction. Higher values mean lower prediction accuracy but better performance. Applicable for `\"approach\"` action type.",
    "key": "Stop.simulation_time_step"
   },
   {
    "name": "<polygon_name>.visualize",
    "type": "bool",
    "default": "false",
    "ko": "영역을 토픽으로 발행해 RViz에서 보이게 할지.",
    "en": "Whether to publish the polygon in a separate topic.",
    "key": "Stop.visualize"
   },
   {
    "name": "<polygon_name>.polygon_pub_topic",
    "type": "string",
    "default": "<polygon_name>",
    "ko": "영역 시각화 토픽 이름.",
    "en": "Topic name to publish a polygon to. Used only if `visualize` is `true`.",
    "key": "Stop.polygon_pub_topic"
   },
   {
    "name": "<polygon_name name>.enabled",
    "type": "bool",
    "default": "true",
    "ko": "이 영역을 쓸지 (실행 중 변경 가능).",
    "en": "Whether to use this polygon for collision monitoring. (Can be dynamically set)",
    "key": "Stop.enabled"
   },
   {
    "name": "<vel_poly>.holonomic",
    "type": "bool",
    "default": "false",
    "ko": "전방향 이동 로봇 모델로 예측할지.",
    "en": "Whether to use holonomic or non-holonomic robot model for collision prediction. For holonomic robot model, the resultant velocity will be used to compare the linear velocity range. Additionally, there will be 2 more parameters, `direction_start_angle` and `direction_end_angle`, to specify the resultant velocity direction.",
    "key": "VelocityPolygon.holonomic"
   },
   {
    "name": "<vel_poly>.velocity_polygons",
    "type": "vector<string>",
    "default": "N/A",
    "ko": "속도에 따라 바꿔 쓸 하위 영역 목록.",
    "en": "List of sub polygons for switching based on the robot's current velocity. When velocity is covered by multiple sub polygons, the first sub polygon in the list will be used. Causes an error, if not specified.",
    "key": "VelocityPolygon.velocity_polygons"
   },
   {
    "name": "<vel_poly>.<subpoly>.points",
    "type": "vector<string>",
    "default": "N/A",
    "ko": "하위 영역 꼭짓점.",
    "en": "Polygon vertices, listed in `\"[[p1.x, p1.y], [p2.x, p2.y], [p3.x, p3.y], ...]\"` format (e.g. `\"[[0.5, 0.25], [0.5, -0.25], [0.0, -0.25], [0.0, 0.25]]\"` for the square in the front). Used for `\"polygon\"` type. Minimum 3 points for a triangle polygon. Causes an error, if not specified.",
    "key": "VelocityPolygon.slow.points"
   },
   {
    "name": "<vel_poly>.<subpoly>.linear_min",
    "type": "double",
    "default": "N/A",
    "ko": "이 하위 영역을 쓸 최소 선속도.",
    "en": "Minimum linear velocity for the sub-polygon. Causes an error, if not specified. - **Non-holonomic:** This is the minimum signed velocity along the x-axis (allows negative values for reverse motion). - **Holonomic:** This is the minimum magnitude of the resultant velocity, which must be `>= 0.0`.",
    "key": "VelocityPolygon.slow.linear_min"
   },
   {
    "name": "<vel_poly>.<subpoly>.linear_max",
    "type": "double",
    "default": "N/A",
    "ko": "이 하위 영역을 쓸 최대 선속도.",
    "en": "Maximum linear velocity for the sub polygon. Causes an error, if not specified. - **Non-holonomic:** This is the maximum signed velocity along the x-axis. (allows negative values for reverse motion). - **Holonomic:** This is the maximum magnitude of the resultant velocity, which must be `>= 0.0`.",
    "key": "VelocityPolygon.slow.linear_max"
   },
   {
    "name": "<vel_poly>.<subpoly>.theta_min",
    "type": "double",
    "default": "N/A",
    "ko": "이 하위 영역을 쓸 최소 각속도.",
    "en": "Minimum angular velocity for the sub polygon. Causes an error, if not specified.",
    "key": "VelocityPolygon.slow.theta_min"
   },
   {
    "name": "<vel_poly>.<subpoly>.theta_max",
    "type": "double",
    "default": "N/A",
    "ko": "이 하위 영역을 쓸 최대 각속도.",
    "en": "Maximum angular velocity for the sub polygon. Causes an error, if not specified.",
    "key": "VelocityPolygon.slow.theta_max"
   },
   {
    "name": "<vel_poly>.<subpoly>.direction_start_angle",
    "type": "double",
    "default": "-PI",
    "ko": "(전방향 로봇) 이동 방향 시작 각.",
    "en": "Start angle of the movement direction (for holonomic robot only). Refer to the [Example](#example) section for the common configurations. Applicable for *holonomic* mode only.",
    "key": "VelocityPolygon.slow.direction_start_angle"
   },
   {
    "name": "<vel_poly>.<subpoly>.direction_end_angle",
    "type": "double",
    "default": "PI",
    "ko": "(전방향 로봇) 이동 방향 끝 각.",
    "en": "End angle of the movement direction (for holonomic robot only). Refer to the [Example](#example) section for the common configurations. Applicable for *holonomic* mode only.",
    "key": "VelocityPolygon.slow.direction_end_angle"
   },
   {
    "name": "<source name>.type",
    "type": "string",
    "default": "\"scan\"",
    "ko": "소스 종류: scan, pointcloud, range, polygon.",
    "en": "Type of polygon shape. Could be `\"scan\"`, `\"pointcloud\"`, `\"range\"`, or `\"polygon\"`.",
    "key": "pointcloud.type",
    "design": "pointcloud"
   },
   {
    "name": "<source name>.topic",
    "type": "string",
    "default": "\"scan\"",
    "ko": "소스 데이터 토픽.",
    "en": "Topic to listen the source data from.",
    "key": "pointcloud.topic",
    "design": "/pole_cam/depth/color/points"
   },
   {
    "name": "<source name>.min_height",
    "type": "double",
    "default": "0.05",
    "ko": "점구름에서 장애물로 볼 최소 높이(m) — 바닥 제거.",
    "en": "Minimum height the PointCloud projection to 2D space started from. Applicable for `\"pointcloud\"` type.",
    "key": "pointcloud.min_height",
    "design": "0.03"
   },
   {
    "name": "<source name>.max_height",
    "type": "double",
    "default": "0.5",
    "ko": "점구름에서 장애물로 볼 최대 높이(m).",
    "en": "Maximum height the PointCloud projection to 2D space ended with. Applicable for `\"pointcloud\"` type.",
    "key": "pointcloud.max_height",
    "design": "0.40"
   },
   {
    "name": "<source name>.use_global_height",
    "type": "bool",
    "default": "false",
    "ko": "점구름의 height 필드(지면 기준 높이)를 쓸지.",
    "en": "Set `true` for pointcloud sources containing a \"height\" field relative to a real world ground contour. The \"height\" field will be used for the min and max height checks instead of the \"z\" field and will not be transformed as it is assumed that height is already global frame referenced. Applicable for `\"pointcloud\"` type.",
    "key": "pointcloud.use_global_height"
   },
   {
    "name": "<source name>.min_range",
    "type": "double",
    "default": "0.0",
    "ko": "센서에서 이 거리보다 가까운 점은 버린다(m).",
    "en": "Minimum range threshold for PointCloud points. Points closer than this distance (measured as Euclidean distance from sensor origin) will be filtered out before processing. Useful for eliminating noise and invalid readings very close to the sensor. Applicable for `\"pointcloud\"` type.",
    "key": "pointcloud.min_range"
   },
   {
    "name": "<source name>.obstacles_angle",
    "type": "double",
    "default": "PI / 180",
    "ko": "range 소스: 호 위에 장애물 점을 찍는 각 간격(rad).",
    "en": "Angle increment (in radians) between nearby obstacle points at the range arc. Two outermost points from the field of view are not taken into account (they will always exist regardless of this value). Applicable for `\"range\"` type.",
    "key": "pointcloud.obstacles_angle"
   },
   {
    "name": "<source name>.sampling_distance",
    "type": "double",
    "default": "0.1",
    "ko": "polygon 소스: 다각형을 점으로 샘플링하는 간격(m).",
    "en": "Internally the polygon is sampled for collision detection. sampling_distance is the distance between sampled points of the polygon. Applicable for `\"polygon\"` source type.",
    "key": "pointcloud.sampling_distance"
   },
   {
    "name": "<source name>.enabled",
    "type": "bool",
    "default": "true",
    "ko": "이 소스를 쓸지 (실행 중 변경 가능).",
    "en": "Whether to use this source for collision monitoring. (Can be dynamically set)",
    "key": "pointcloud.enabled"
   },
   {
    "name": "<source name>.source_timeout",
    "type": "double",
    "default": "(node parameter `source_timeout` value)",
    "ko": "이 소스만의 데이터 유효 시간(s). 기본은 노드 source_timeout.",
    "en": "Maximum time interval in which source data is considered as valid. If no new data is received within this interval, the robot will be stopped. Setting `source_timeout: 0.0` disables this blocking mechanism. Overrides node parameter for each source individually, if desired.",
    "key": "pointcloud.source_timeout"
   },
   {
    "name": "bond_heartbeat_period",
    "type": "double",
    "default": "0.1",
    "ko": "lifecycle bond 하트비트 발행 주기(s, /bond 토픽). 0 이하면 끔 — lifecycle_manager가 이걸로 서버 생존을 확인한다.",
    "en": "The lifecycle node bond mechanism publishing period (on the `/bond` topic). Disabled if inferior or equal to `0.0`.",
    "key": "bond_heartbeat_period"
   }
  ]
 },
 {
  "id": "nav2_lifecycle_manager",
  "cat": "Nav2",
  "title": "lifecycle_manager",
  "pkg": "nav2_lifecycle_manager",
  "node": "/lifecycle_manager_navigation",
  "kind": "노드",
  "desc": "Nav2 서버들의 lifecycle 전이 관리.",
  "source": "github.com/ros-navigation/docs.nav2.org (jazzy)",
  "params": [
   {
    "name": "node_names",
    "type": "vector<string>",
    "default": "N/A",
    "ko": "순서대로 configure→activate 할 노드 이름 목록.",
    "en": "Ordered list of node names to bringup through lifecycle transition.",
    "key": "node_names"
   },
   {
    "name": "autostart",
    "type": "bool",
    "default": "false",
    "ko": "시작하자마자 노드들을 active로 올릴지.",
    "en": "Whether to transition nodes to active state on startup.",
    "key": "autostart",
    "design": "true"
   },
   {
    "name": "bond_timeout",
    "type": "double",
    "default": "4.0",
    "ko": "서버가 이 시간(s) 응답 없으면 전체를 내린다. 0이면 끔.",
    "en": "Timeout to transition down all lifecycle nodes of this manager if a server is non-responsive, in seconds. Set to `0` to deactivate. Recommended to be always larger than 0.3s for all-local node discovery. Note If a server cleanly exits the manager will immediately be notified.",
    "key": "bond_timeout"
   },
   {
    "name": "attempt_respawn_reconnection",
    "type": "bool",
    "default": "true",
    "ko": "죽었다 다시 뜬(respawn) 서버에 다시 연결을 시도할지.",
    "en": "Whether to try to reconnect to servers that go down, presumably because respawn is set to `true` to re-create crashed nodes. While default to `true`, reconnections will not be made unless respawn is set to `true` in your launch files or your watchdog systems will bring up the server externally.",
    "key": "attempt_respawn_reconnection"
   },
   {
    "name": "bond_respawn_max_duration",
    "type": "double",
    "default": "10.0",
    "ko": "서버가 죽은 뒤 다시 연결을 기다리는 최대 시간(s).",
    "en": "When a server crashes or becomes non-responsive, the lifecycle manager will bring down all nodes for safety. This is the duration of which the lifecycle manager will attempt to reconnect with the failed server(s) during to recover and re-activate the system. If this passes, it will stop attempts and will require a manual re-activation once the problem is manually resolved. Units: seconds.",
    "key": "bond_respawn_max_duration"
   }
  ]
 },
 {
  "id": "robot_localization",
  "cat": "위치추정·SLAM",
  "title": "ekf_node (robot_localization)",
  "pkg": "robot_localization",
  "node": "/ekf_filter_node",
  "kind": "노드",
  "desc": "여러 센서(오도메트리·IMU·자세)를 칼만 필터로 융합한다. [sensor]는 odom0, imu0처럼 번호를 붙여 여러 개 둔다.",
  "source": "github.com/cra-ros-pkg/robot_localization (jazzy-devel) doc/state_estimation_nodes.rst",
  "params": [
   {
    "name": "frequency",
    "type": "double",
    "default": "—",
    "ko": "추정 결과를 내는 주기(Hz). 입력이 하나라도 들어와야 계산을 시작한다.",
    "design": "50.0",
    "key": "frequency"
   },
   {
    "name": "sensor_timeout",
    "type": "double",
    "default": "—",
    "ko": "센서가 이 시간(s) 동안 안 오면 보정 없이 예측만 한다.",
    "key": "sensor_timeout"
   },
   {
    "name": "two_d_mode",
    "type": "bool",
    "default": "—",
    "ko": "true면 z·roll·pitch를 0으로 고정한 평면 추정. 바닥을 달리는 로봇은 true.",
    "design": "true",
    "key": "two_d_mode"
   },
   {
    "name": "map_frame",
    "type": "string",
    "default": "map",
    "ko": "map 좌표계 이름.",
    "key": "map_frame"
   },
   {
    "name": "odom_frame",
    "type": "string",
    "default": "odom",
    "ko": "odom 좌표계 이름.",
    "key": "odom_frame"
   },
   {
    "name": "base_link_frame",
    "type": "string",
    "default": "base_link",
    "ko": "로봇 몸 좌표계 이름.",
    "design": "base_footprint",
    "key": "base_link_frame"
   },
   {
    "name": "base_link_output_frame",
    "type": "string",
    "default": "base_link_frame 값",
    "ko": "출력 메시지·TF의 자식 프레임을 바꾸고 싶을 때.",
    "key": "base_link_output_frame"
   },
   {
    "name": "world_frame",
    "type": "string",
    "default": "odom_frame 값",
    "ko": "추정 기준 좌표계. odom이면 odom→base TF를, map이면 map→odom TF를 낸다 (GPS 등 절대 위치 융합 시).",
    "design": "odom",
    "key": "world_frame"
   },
   {
    "name": "transform_time_offset",
    "type": "double",
    "default": "—",
    "ko": "발행하는 TF 시각에 더할 미래 오프셋(s).",
    "key": "transform_time_offset"
   },
   {
    "name": "transform_timeout",
    "type": "double",
    "default": "0",
    "ko": "측정값을 대상 좌표계로 바꿀 때 TF를 기다리는 시간(s).",
    "key": "transform_timeout"
   },
   {
    "name": "transform_timeout_odom_bl",
    "type": "double",
    "default": "0",
    "ko": "world_frame=map일 때 odom→base TF를 기다리는 시간(s).",
    "key": "transform_timeout_odom_bl"
   },
   {
    "name": "[sensor]",
    "type": "string",
    "default": "—",
    "ko": "센서 토픽. 예: odom0: /odom, imu0: /imu. 메시지 종류별로 번호를 붙인다 (odomN, twistN, imuN, poseN).",
    "design": "odom0: /odom, imu0: /imu",
    "key": "odom0"
   },
   {
    "name": "[sensor]_config",
    "type": "bool[15]",
    "default": "—",
    "ko": "이 센서에서 융합할 변수 15개: [x, y, z, roll, pitch, yaw, vx, vy, vz, vroll, vpitch, vyaw, ax, ay, az].",
    "design": "odom0: vx·vyaw만 true / imu0: vyaw만 true",
    "key": "odom0_config"
   },
   {
    "name": "[sensor]_queue_size",
    "type": "int",
    "default": "—",
    "ko": "센서별 콜백 큐 크기.",
    "key": "odom0_queue_size"
   },
   {
    "name": "[sensor]_differential",
    "type": "bool",
    "default": "—",
    "ko": "true면 자세를 연속 측정값의 차이(속도)로 바꿔서 융합.",
    "key": "odom0_differential"
   },
   {
    "name": "[sensor]_relative",
    "type": "bool",
    "default": "—",
    "ko": "true면 처음 받은 값을 기준으로 상대값으로 융합.",
    "key": "odom0_relative"
   },
   {
    "name": "imuN_remove_gravitational_acceleration",
    "type": "bool",
    "default": "—",
    "ko": "IMU 가속도에서 중력을 빼고 융합할지.",
    "key": "imuN_remove_gravitational_acceleration"
   },
   {
    "name": "gravitational_acceleration",
    "type": "double",
    "default": "9.80665",
    "ko": "뺄 중력 가속도(m/s²).",
    "key": "gravitational_acceleration"
   },
   {
    "name": "initial_state",
    "type": "double[15]",
    "default": "—",
    "ko": "필터 시작 상태 15개 값.",
    "key": "initial_state"
   },
   {
    "name": "permit_corrected_publication",
    "type": "bool",
    "default": "false",
    "ko": "늦게 온 측정으로 고친 상태를 같은 시각으로 다시 발행할지.",
    "key": "permit_corrected_publication"
   },
   {
    "name": "print_diagnostics",
    "type": "bool",
    "default": "—",
    "ko": "/diagnostics로 설정·센서 진단을 발행할지.",
    "key": "print_diagnostics"
   },
   {
    "name": "publish_tf",
    "type": "bool",
    "default": "true",
    "ko": "world_frame → base_link_frame TF를 발행할지.",
    "design": "true (odom TF 발행자는 ekf 하나)",
    "key": "publish_tf"
   },
   {
    "name": "publish_acceleration",
    "type": "bool",
    "default": "false",
    "ko": "추정 가속도를 /accel/filtered로 발행할지.",
    "key": "publish_acceleration"
   },
   {
    "name": "use_control",
    "type": "bool",
    "default": "false",
    "ko": "cmd_vel을 받아 예측에 가속도 항으로 쓸지.",
    "key": "use_control"
   },
   {
    "name": "stamped_control",
    "type": "bool",
    "default": "—",
    "ko": "use_control일 때 TwistStamped를 받을지.",
    "key": "stamped_control"
   },
   {
    "name": "control_timeout",
    "type": "double",
    "default": "—",
    "ko": "제어 입력이 이 시간(s) 끊기면 제어 항을 끈다.",
    "key": "control_timeout"
   },
   {
    "name": "control_config",
    "type": "bool[6]",
    "default": "—",
    "ko": "cmd_vel에서 쓸 변수 [vx, vy, vz, vroll, vpitch, vyaw].",
    "key": "control_config"
   },
   {
    "name": "acceleration_limits",
    "type": "double[6]",
    "default": "—",
    "ko": "축별 최대 가속도 (use_control일 때).",
    "key": "acceleration_limits"
   },
   {
    "name": "deceleration_limits",
    "type": "double[6]",
    "default": "—",
    "ko": "축별 최대 감속도.",
    "key": "deceleration_limits"
   },
   {
    "name": "acceleration_gains",
    "type": "double[6]",
    "default": "—",
    "ko": "가속 한계까지 가는 속도 게인.",
    "key": "acceleration_gains"
   },
   {
    "name": "deceleration_gains",
    "type": "double[6]",
    "default": "—",
    "ko": "감속 게인.",
    "key": "deceleration_gains"
   },
   {
    "name": "smooth_lagged_data",
    "type": "bool",
    "default": "—",
    "ko": "늦게 온 센서 데이터를 받으면 과거로 돌아가 다시 계산할지.",
    "key": "smooth_lagged_data"
   },
   {
    "name": "history_length",
    "type": "double",
    "default": "—",
    "ko": "smooth_lagged_data용 상태 기록 길이(s).",
    "key": "history_length"
   },
   {
    "name": "[sensor]_rejection_threshold",
    "type": "double",
    "default": "double 최댓값",
    "ko": "마할라노비스 거리가 이 값을 넘는 측정은 이상치로 버린다 (odomN_pose_rejection_threshold 등).",
    "key": "odom0_rejection_threshold"
   },
   {
    "name": "debug",
    "type": "bool",
    "default": "false",
    "ko": "디버그 데이터를 파일로 쓸지 (매우 큼).",
    "key": "debug"
   },
   {
    "name": "debug_out_file",
    "type": "string",
    "default": "—",
    "ko": "디버그 출력 파일 경로.",
    "key": "debug_out_file"
   },
   {
    "name": "process_noise_covariance",
    "type": "double[225]",
    "default": "—",
    "ko": "예측 단계 잡음 Q (15×15). 튜닝의 핵심.",
    "key": "process_noise_covariance"
   },
   {
    "name": "dynamic_process_noise_covariance",
    "type": "bool",
    "default": "false",
    "ko": "속도에 따라 Q를 키울지 (멈춰 있으면 오차가 안 커지게).",
    "key": "dynamic_process_noise_covariance"
   },
   {
    "name": "initial_estimate_covariance",
    "type": "double[225]",
    "default": "—",
    "ko": "초기 추정 오차 P (15×15).",
    "key": "initial_estimate_covariance"
   },
   {
    "name": "reset_on_time_jump",
    "type": "bool",
    "default": "—",
    "ko": "시뮬 시각이 뒤로 가면 필터를 리셋할지 (bag 반복 재생).",
    "key": "reset_on_time_jump"
   },
   {
    "name": "predict_to_current_time",
    "type": "bool",
    "default": "—",
    "ko": "마지막 측정 시각이 아니라 현재 시각까지 예측해서 낼지.",
    "key": "predict_to_current_time"
   },
   {
    "name": "disabled_at_startup",
    "type": "bool",
    "default": "—",
    "ko": "시작할 때 필터를 끈 채로 둘지.",
    "key": "disabled_at_startup"
   }
  ]
 },
 {
  "id": "rtabmap_node",
  "cat": "위치추정·SLAM",
  "title": "rtabmap (ROS 노드 파라미터)",
  "pkg": "rtabmap_slam (rtabmap_ros)",
  "node": "/rtabmap",
  "kind": "노드",
  "desc": "rtabmap ROS 래퍼의 입출력·TF 설정. 아래 \"rtabmap 코어\"와 달리 일반 ROS 파라미터 타입이다.",
  "source": "github.com/introlab/rtabmap_ros (jazzy-devel) CoreWrapper.cpp, CommonDataSubscriber.cpp",
  "params": [
   {
    "name": "frame_id",
    "type": "string",
    "default": "base_link",
    "ko": "로봇 몸 좌표계.",
    "design": "base_footprint",
    "key": "frame_id"
   },
   {
    "name": "odom_frame_id",
    "type": "string",
    "default": "''",
    "ko": "비우면 odom 토픽을 쓰고, 지정하면 TF에서 오도메트리를 읽는다.",
    "key": "odom_frame_id"
   },
   {
    "name": "map_frame_id",
    "type": "string",
    "default": "map",
    "ko": "map 좌표계 이름.",
    "key": "map_frame_id"
   },
   {
    "name": "publish_tf",
    "type": "bool",
    "default": "true",
    "ko": "map→odom TF를 발행할지.",
    "design": "true",
    "key": "publish_tf"
   },
   {
    "name": "tf_delay",
    "type": "double",
    "default": "0.05",
    "ko": "map→odom TF 발행 간격(s) (20Hz).",
    "key": "tf_delay"
   },
   {
    "name": "tf_tolerance",
    "type": "double",
    "default": "0.1",
    "ko": "TF 허용 시간 오차(s).",
    "key": "tf_tolerance"
   },
   {
    "name": "wait_for_transform",
    "type": "double",
    "default": "0.2",
    "ko": "TF를 기다리는 시간(s).",
    "key": "wait_for_transform"
   },
   {
    "name": "database_path",
    "type": "string",
    "default": "~/.ros/rtabmap.db",
    "ko": "지도 DB 파일 경로.",
    "key": "database_path"
   },
   {
    "name": "delete_db_on_start",
    "type": "bool",
    "default": "false",
    "ko": "시작할 때 DB를 지우고 새로 매핑 (launch 인자 -d와 같음).",
    "design": "매핑 첫 실행만 true",
    "key": "delete_db_on_start"
   },
   {
    "name": "subscribe_depth",
    "type": "bool",
    "default": "true",
    "ko": "RGB + depth 영상을 받을지.",
    "design": "true",
    "key": "subscribe_depth"
   },
   {
    "name": "subscribe_rgb",
    "type": "bool",
    "default": "true",
    "ko": "RGB 영상을 받을지.",
    "design": "true",
    "key": "subscribe_rgb"
   },
   {
    "name": "subscribe_rgbd",
    "type": "bool",
    "default": "false",
    "ko": "rgbd_sync로 묶은 RGBDImage 토픽을 받을지.",
    "key": "subscribe_rgbd"
   },
   {
    "name": "subscribe_scan",
    "type": "bool",
    "default": "false",
    "ko": "2D LaserScan을 받을지.",
    "design": "false (LiDAR 없음)",
    "key": "subscribe_scan"
   },
   {
    "name": "subscribe_scan_cloud",
    "type": "bool",
    "default": "false",
    "ko": "3D 점구름 스캔을 받을지.",
    "key": "subscribe_scan_cloud"
   },
   {
    "name": "subscribe_odom",
    "type": "bool",
    "default": "true",
    "ko": "오도메트리 토픽을 받을지.",
    "design": "true (/odometry/filtered)",
    "key": "subscribe_odom"
   },
   {
    "name": "approx_sync",
    "type": "bool",
    "default": "true",
    "ko": "입력 토픽들을 근사 시각으로 동기화할지 (false면 시각이 정확히 같아야 함).",
    "design": "true",
    "key": "approx_sync"
   },
   {
    "name": "topic_queue_size",
    "type": "int",
    "default": "10",
    "ko": "토픽 구독 큐 크기.",
    "key": "topic_queue_size"
   },
   {
    "name": "sync_queue_size",
    "type": "int",
    "default": "10",
    "ko": "동기화기 큐 크기.",
    "key": "sync_queue_size"
   },
   {
    "name": "odom_sensor_sync",
    "type": "bool",
    "default": "true",
    "ko": "센서 시각에 맞춰 오도메트리를 보정할지.",
    "key": "odom_sensor_sync"
   },
   {
    "name": "use_saved_map",
    "type": "bool",
    "default": "true",
    "ko": "위치추정 모드에서 저장된 지도를 쓸지.",
    "key": "use_saved_map"
   },
   {
    "name": "gen_scan",
    "type": "bool",
    "default": "false",
    "ko": "depth에서 가짜 스캔을 만들지.",
    "key": "gen_scan"
   },
   {
    "name": "gen_depth",
    "type": "bool",
    "default": "false",
    "ko": "점구름에서 depth 영상을 만들지.",
    "key": "gen_depth"
   },
   {
    "name": "loc_thr",
    "type": "double",
    "default": "0.0",
    "ko": "위치추정 결과를 받아들일 최소 점수.",
    "key": "loc_thr"
   },
   {
    "name": "qos",
    "type": "int",
    "default": "0 (system default)",
    "ko": "입력 구독 QoS (0 기본, 1 reliable, 2 best_effort). qos_image 등으로 개별 지정 가능.",
    "design": "RealSense가 best_effort면 2",
    "key": "qos"
   }
  ]
 },
 {
  "id": "rtabmap_core",
  "cat": "위치추정·SLAM",
  "title": "rtabmap 코어 (Group/Name 파라미터)",
  "pkg": "rtabmap (core library)",
  "node": "/rtabmap",
  "kind": "노드",
  "desc": "\"그룹/이름\" 형식의 코어 파라미터. ROS 2에서는 문자열로 넘긴다 (예: Reg/Force3DoF: \"true\"). 전체 목록은 rtabmap --params.",
  "source": "github.com/introlab/rtabmap (master) corelib/include/rtabmap/core/Parameters.h",
  "params": [
   {
    "name": "Mem/IncrementalMemory",
    "type": "bool",
    "default": "true",
    "ko": "true = SLAM(매핑) 모드, false = 위치추정 모드.",
    "design": "매핑 true / 운영 false",
    "key": "Mem/IncrementalMemory"
   },
   {
    "name": "Mem/InitWMWithAllNodes",
    "type": "bool",
    "default": "false",
    "ko": "시작할 때 DB의 모든 노드를 작업 메모리에 올릴지 (위치추정 모드에서 true 권장).",
    "design": "운영 true",
    "key": "Mem/InitWMWithAllNodes"
   },
   {
    "name": "Mem/STMSize",
    "type": "unsigned int",
    "default": "10",
    "ko": "단기 메모리 크기.",
    "key": "Mem/STMSize"
   },
   {
    "name": "Rtabmap/DetectionRate",
    "type": "float",
    "default": "1",
    "ko": "루프 클로저 검출 주기(Hz). 입력 영상을 이 속도로 걸러 처리한다.",
    "key": "Rtabmap/DetectionRate"
   },
   {
    "name": "Rtabmap/TimeThr",
    "type": "float",
    "default": "0",
    "ko": "지도 갱신 최대 시간(ms). 넘으면 오래된 노드를 장기 메모리로 옮긴다. 0이면 무한.",
    "key": "Rtabmap/TimeThr"
   },
   {
    "name": "RGBD/LinearUpdate",
    "type": "float",
    "default": "0.1",
    "ko": "이만큼(m) 움직여야 지도에 새 노드를 넣는다.",
    "key": "RGBD/LinearUpdate"
   },
   {
    "name": "RGBD/AngularUpdate",
    "type": "float",
    "default": "0.1",
    "ko": "이만큼(rad) 돌아야 새 노드를 넣는다.",
    "key": "RGBD/AngularUpdate"
   },
   {
    "name": "RGBD/OptimizeMaxError",
    "type": "float",
    "default": "3.0",
    "ko": "최적화 오차 비율이 이 값을 넘는 루프 클로저는 버린다 (0이면 끔).",
    "key": "RGBD/OptimizeMaxError"
   },
   {
    "name": "RGBD/ProximityBySpace",
    "type": "bool",
    "default": "true",
    "ko": "공간적으로 가까운 위치끼리도 연결을 찾을지.",
    "key": "RGBD/ProximityBySpace"
   },
   {
    "name": "Reg/Force3DoF",
    "type": "bool",
    "default": "false",
    "ko": "x·y·yaw만 추정 (z·roll·pitch = 0). 평면 로봇은 true.",
    "design": "true",
    "key": "Reg/Force3DoF"
   },
   {
    "name": "Kp/MaxFeatures",
    "type": "int",
    "default": "500",
    "ko": "영상에서 뽑을 최대 특징점 수 (루프 클로저용).",
    "key": "Kp/MaxFeatures"
   },
   {
    "name": "Kp/DetectorStrategy",
    "type": "int",
    "default": "8 (빌드에 따라 6)",
    "ko": "특징점 검출기: 0 SURF, 1 SIFT, 2 ORB, 6 GFTT/BRIEF, 8 GFTT/ORB ...",
    "key": "Kp/DetectorStrategy"
   },
   {
    "name": "Vis/MinInliers",
    "type": "int",
    "default": "20",
    "ko": "변환을 받아들일 최소 특징 대응 수.",
    "key": "Vis/MinInliers"
   },
   {
    "name": "Vis/FeatureType",
    "type": "int",
    "default": "8 (빌드에 따라 6)",
    "ko": "시각 정합용 특징 종류 (Kp/DetectorStrategy와 같은 번호).",
    "key": "Vis/FeatureType"
   },
   {
    "name": "Grid/Sensor",
    "type": "int",
    "default": "1",
    "ko": "점유 격자를 만들 센서: 0 레이저 스캔, 1 depth 영상, 2 둘 다. (예전 이름 Grid/FromDepth)",
    "design": "1 (depth)",
    "key": "Grid/Sensor"
   },
   {
    "name": "Grid/RangeMax",
    "type": "float",
    "default": "5.0",
    "ko": "격자에 넣을 최대 거리(m). 0이면 무한.",
    "key": "Grid/RangeMax"
   },
   {
    "name": "Grid/CellSize",
    "type": "float",
    "default": "0.05",
    "ko": "격자 해상도(m).",
    "key": "Grid/CellSize"
   },
   {
    "name": "Grid/NormalsSegmentation",
    "type": "bool",
    "default": "true",
    "ko": "법선으로 바닥과 장애물을 나눌지 (false면 높이로 자름).",
    "key": "Grid/NormalsSegmentation"
   },
   {
    "name": "Grid/MaxGroundHeight",
    "type": "float",
    "default": "0.0",
    "ko": "바닥으로 볼 최대 높이(m). NormalsSegmentation이 false일 때 지정.",
    "key": "Grid/MaxGroundHeight"
   },
   {
    "name": "Grid/MaxObstacleHeight",
    "type": "float",
    "default": "0.0",
    "ko": "장애물로 볼 최대 높이(m). 0이면 끔.",
    "key": "Grid/MaxObstacleHeight"
   },
   {
    "name": "Grid/3D",
    "type": "bool",
    "default": "true (OctoMap 빌드) / false",
    "ko": "3D 격자(OctoMap)를 만들지. false면 2D로 투영.",
    "key": "Grid/3D"
   }
  ]
 }
];
