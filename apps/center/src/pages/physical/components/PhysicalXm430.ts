import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow, onDisconnected } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-physical-xm430';

const DXL_ID = 1; // pid-angle.ino/find-gain.ino의 실제 상수(`const uint8_t DXL_ID = 1;`)와 동일 — 버스에 물린 여러 모터 중 이 모터를 가리키는 실제 주소값
const DT = 0.01;             // 100Hz — 실제 컨트롤 루프 주기
const LOG_PERIOD_S = 0.1;    // 10Hz 텔레메트리 기록
const BUFFER_S = 12;         // 구동 중 "실시간으로 따라가는" 창 너비(초) — 과거 데이터를 지우는 게 아니라 기본 보기 폭일 뿐
const MAX_HISTORY_S = 600;   // 데이터 자체는 이만큼(10분) 보관 — 안전장치용 상한일 뿐, 그 안에서는 전부 유지
const MAX_HISTORY_LEN = Math.round(MAX_HISTORY_S / LOG_PERIOD_S);
const MAX_FRAME_DT = 0.05;   // 탭 전환 등으로 프레임이 밀렸을 때 한 번에 너무 많이 점프하지 않도록 클램프
const CHART_IDS = ['#xm-chart-pos', '#xm-chart-vel', '#xm-chart-cur', '#xm-chart-temp', '#xm-chart-volt', '#xm-chart-moving', '#xm-chart-quant'];
const MOVING_THRESHOLD_DEG = 0.5; // 이 이상 오차/속도가 남아있으면 실제 Present Moving 비트처럼 "구동중"으로 봄

// 엔코더 분해능("엔코더" 페이지와 동일한 4096CPR) — 실제 장비는 이만큼 잘게 쪼갠 값만 보고할 수 있음
const ENCODER_CPR = 4096;
const ENCODER_RES_DEG = 360 / ENCODER_CPR;              // ≈0.088° — Present Position 최소 단위
const VELOCITY_RAW_RES_DEG_S = (0.229 * 360) / 60;      // ≈1.374°/s — Present Velocity 최소 단위(실제 XM430 raw 1당 0.229RPM)
function quantize(value: number, res: number): number { return Math.round(value / res) * res; }

// 전류/온도/전압 — ponytail: 실측이 아니라 그럴듯한 단순 모델(선형 근사 + 1차 지연). 실제 로그값이 아님을 UI에도 명시.
const AMBIENT_C = 25;
const OVERHEAT_C = 70;       // ⚠ 임의로 정한 예시값 — 실제 XM430 e-매뉴얼의 Temperature Limit 기본값을 확인해서 넣은 게 아님(과열 보호라는 개념 자체는 실제 기능이지만 이 숫자는 그냥 예시)
const THERMAL_TAU_S = 8;     // "시정수(τ)" 페이지와 같은 1차 지연 모델
const V_NOMINAL = 12.0;

const MD = `
## Dynamixel XM430 그 자체를 시뮬레이션합니다
- 이전 버전은 "OpenCR(호스트)이 계산한 PID + XM430"을 합쳐서 보여줬는데, 정확히 말하면 **그 PID는 XM430에 넣는 값이 아니라 호스트 코드**였습니다. 이번엔 **모터 하나(Operating Mode = Position Control Mode, DXL_ID=${DXL_ID})만** 봅니다 — 실제로 XM430에 쓰고 읽는 컨트롤 테이블 항목만 사용합니다. \`DXL_ID=${DXL_ID}\`는 실제 소스(\`pid-angle.ino\`)의 \`const uint8_t DXL_ID = 1;\`과 동일한 값이고, 명령 로그의 모든 줄에 \`[ID=${DXL_ID}]\`로 표시됩니다(실제 다이나믹셀 버스에서 여러 모터 중 이 모터를 지목하는 주소값).
- **내가 써넣는 값(입력, 실제 레지스터)**:
  - **Goal Position**(목표 각도) — 언제든 값을 바꾸면 그 즉시 새 목표로 다시 움직입니다(실제 기기도 동작 중 목표를 바꿀 수 있습니다).
  - **Profile Velocity / Profile Acceleration** — 목표까지 얼마나 빨리·얼마나 급하게 가속할지. 이 둘이 **사다리꼴 속도 프로파일(trapezoidal profile)**을 만듭니다: 가속 → 최고속도 유지(cruise) → 감속해서 정확히 목표에서 정지.
  - **Position P Gain / Position D Gain** — 모터 **내부**가 "지금 위치"를 이 프로파일이 만든 "지금 있어야 할 위치"에 맞추기 위해 스스로 도는 실제 내부 제어 게인입니다(Position I Gain은 보통 0으로 두는 게 기본값이라 이 페이지도 0으로 고정).
  - **Torque Enable** — 꺼져 있으면 모터는 힘을 전혀 안 씁니다(팔이 그냥 축 늘어짐).
- **슬라이더를 놓는 순간(release)이 실제 WRITE 시점입니다** — 드래그하는 동안은 화면 라벨만 따라 움직이는 미리보기이고, 손을 뗀 순간 그 값이 실제로 장비에 WRITE됩니다. **Goal Position은 토크 ON/OFF와 무관하게 바뀔 때마다 그때그때 다시 써넣는 값**이라(실제 레지스터도 그렇게 동작합니다 — 토크가 꺼져 있어도 값 자체는 써집니다, 다만 안 움직일 뿐), 슬라이더를 움직일 때마다 즉시 로그에 찍힙니다. 그래서 **토크 ON 버튼은 이제 \`dxl.torqueOn(id)\` 하나만 호출**합니다 — Goal Position/Profile Velocity·Acceleration/Position P·D Gain은 이미 각자 바뀌는 순간 개별적으로 WRITE되어 있으니 토크 버튼이 그걸 다시 보낼 필요가 없습니다. 그 순간 **어떤 함수를 어떤 파라미터로 호출했는지**가 아래 **쓰기(WRITE) 로그**에 그대로 찍힙니다 — \`dxl.setGoalPosition(id, value, unit)\`, \`dxl.writeControlTableItem(item, id, data)\`, \`dxl.torqueOn(id)\`/\`torqueOff(id)\`, \`dxl.setGoalVelocity(id, value, unit)\`처럼 실제 Dynamixel2Arduino 라이브러리 함수 시그니처 그대로 표기합니다(실제 시리얼 모니터를 흉내낸 것).
- **쓰기 로그와 별도로 읽기(READ) 로그도 있습니다** — 토크 ON 상태에서는 샘플링 주기(10Hz)마다 \`dxl.getPresentPosition()\`/\`getPresentVelocity()\`/\`getPresentCurrent()\`/\`readControlTableItem(PRESENT_TEMPERATURE/...)\`/\`readControlTableItem(MOVING, ...)\` 여섯 번을 실제로 읽어오는 것처럼 로그를 찍습니다. 쓰기는 사람이 슬라이더를 놓을 때만 드문드문 나가지만, 읽기는 훨씬 더 빈번해서(1초에 6개 항목 × 10번 = 60줄) 로그가 훨씬 빠르게 스크롤됩니다 — 실제로도 상태를 계속 폴링하는 쪽이 명령을 보내는 쪽보다 훨씬 잦다는 걸 그대로 보여줍니다.
- **입력 세 가지 성격이 서로 다릅니다**:
  1. **매번 새로 보내는 값**: Goal Position — "몇 도로 가!"는 움직일 때마다 계속 다시 써넣는 값이라 **항상 바로 수정** 가능합니다.
  2. **한 번만 세팅하는 값(공장값)**: Profile Velocity/Acceleration, Position P/D Gain — 이건 보통 처음 튜닝할 때 한 번 정해두고 운전 중엔 잘 안 건드리는 값이라, **기본적으로 잠겨 있고** "⚙ 설정값 수정 허용" 체크박스를 눌러야 바꿀 수 있습니다(실수로 건드리는 걸 막기 위한 안전장치입니다 — 실제 현장에서도 이런 값은 함부로 안 바꿉니다).
  3. **모터 입력이 아닌 환경 변수**: 부하/스톨 — 이건 XM430에 써넣는 레지스터가 **아닙니다**. "팔이 뭔가에 걸렸다"는 외부 물리 상황을 시뮬레이션하려고 넣은 것이라, 별도 구역에 "환경 변수(실제 모터 입력 아님)"라고 표시해뒀습니다.
- **이 페이지의 모든 값은 네 종류로 나뉘고, 카드·그래프에 전부 이 이름표를 붙여뒀습니다**:
  1. **입력값**: Goal Position, Profile Velocity/Acceleration, Position P/D Gain, Torque Enable — 위에서 말한 "매번 보내는 값 / 한 번만 세팅하는 값" 두 그룹이 여기 속합니다. 내가 써넣는 값입니다.
- **Goal Position은 계속 다시 보내야 하는 게 아닙니다** — 한 번 써넣으면 그 값이 레지스터에 그대로 저장되고, 모터는 그 목표를 향해 알아서 계속 움직입니다. "목표를 바꾸고 싶을 때"만 새로 써넣으면 됩니다.
- **중간에 멈추고 싶으면?** — **공식 문서(Robotis e-매뉴얼)에 나온 정지 방법은 Torque Enable을 0으로 끄는 것, 딱 하나뿐입니다.** 실제 소스 \`pid-angle.ino\`의 \`stopRun()\`도 정확히 이 원칙을 따라서, 사용자가 멈추라고 했을 때든(\`x\` 입력) 타임아웃이든 컨트롤 루프 지연으로 인한 오류든 **모든 정지 경로에서 항상** \`dxl.setGoalVelocity(DXL_ID, 0, UNIT_RPM)\` → \`dxl.torqueOff(DXL_ID)\` 순서로 호출합니다 — "위치를 유지한 채 토크만 유지"하는 정지는 실제 코드 어디에도 없습니다. 그래서 이 페이지의 "토크 OFF" 버튼도 같은 순서(Goal Velocity=0 → Torque Enable=0)로 로그를 남깁니다. "지금 위치에서 정지" 버튼(지금 위치를 새 Goal Position으로 다시 써넣어서 그 자리서 멈추게 하는 것)은 **공식 스펙에도, 실제 \`stopRun()\`에도 없는 비공식적인 활용법**입니다 — Goal Position이 그냥 목표값 레지스터라는 원리를 이용한 것뿐이고, 토크는 계속 유지된다는 점에서 진짜 "정지"(토크 OFF)와는 성격이 다릅니다.
  2. **리얼월드값**: 이 시뮬레이터가 물리 방정식으로 직접 계산한, 팔의 **연속적인 실제 각도·속도**입니다(파란 테두리 카드). 진짜 로봇이라면 눈에 보이는 팔의 실제 각도가 이거고, 소수점 단위까지 끊김 없이 연속적으로 변합니다 — 센서·레지스터를 거치기 전의 "있는 그대로의 물리 값"입니다.
  3. **계측값**: Present Position, Present Velocity, Present Current, Present Temperature, Present Input Voltage, Moving — 장비가 출력으로 주는(=우리가 읽어오는) 값입니다. 그런데 **위치/속도의 계측값은 리얼월드값 그대로가 아니라, 엔코더·레지스터의 분해능만큼 "계단식으로 잘려서(양자화)" 보고**됩니다(4096CPR → 최소 단위 ${ENCODER_RES_DEG.toFixed(3)}°, 속도는 raw 1당 ${VELOCITY_RAW_RES_DEG_S.toFixed(3)}°/s — "엔코더" 페이지에서 다룬 그 분해능입니다). 그래서 리얼월드값 카드와 계측값 카드가 **미세하게 다른 숫자**로 보이고, 그 차이를 "위치 양자화 오차" 그래프에서 직접 볼 수 있습니다. 전류/온도/전압은 애초에 리얼월드값(실측 물리모델)이 없어서 계측값(모델값)만 있습니다.
  4. **계산값**: **내부 프로파일**(모터가 지금 이 순간 목표로 삼는 위치 — Profile Velocity/Acceleration으로 계산되는 사다리꼴 궤적), **내부 제어 출력**(Position P/D Gain이 계산한 결과) — 실제 장비에는 아예 없는, 설명을 위한 내부 계산값입니다. 컨트롤 테이블에 없는 항목이라 실제 XM430에서는 절대 읽을 수 없습니다. "왜 위치가 부드럽게 움직이고 살짝 뒤처지는지" 설명하려고 시뮬레이터 내부를 일부러 꺼내 보여주는 것뿐입니다.
- **왜 목표선(점선)이 계단식이 아니라 완만한 사다리꼴인가요?** — 실제 위치 제어 모드는 목표를 받자마자 급발진하지 않고, Profile Velocity/Acceleration으로 만든 **부드러운 속도 프로파일**을 따라갑니다. 실제 위치(초록)는 이 프로파일(보라 점선)을 Position P/D Gain으로 뒤쫓아가는데, 게인이 낮으면 뒤처짐(tracking lag)이 커지고, 게인을 올리면 더 바짝 따라붙습니다.
- **⚠ 전류·온도·전압은 실측이 아닙니다** — "출력이 클수록 전류↑ → 전류가 크면 온도↑"라는 그럴듯한 물리 모델로 만든 값입니다. 온도는 "시정수(τ)" 페이지와 똑같은 1차 지연식(\`온도 += (평형온도-온도)×dt/τ\`)을 그대로 재사용합니다.
- **과열(FAULT)**: 목표까지 한 번 움직이는 정도로는 거의 과열되지 않습니다(실제로도 그렇습니다). **"부하(스톨)"** 슬라이더를 Profile Velocity 근처까지 올려서 팔이 못 움직이게 막아보세요 — 그러면 내부 제어기가 계속 최대로 밀어붙이려 해서 전류가 계속 높게 유지되고, 결국 임계온도(${OVERHEAT_C}°C, **제가 임의로 정한 예시값이지 실제 데이터시트 수치가 아닙니다**)를 넘겨 과열됩니다(과열 보호라는 기능 자체는 실제 서보에도 있습니다 — 잼(jam)됐을 때 타는 것과 같은 원리). 리셋 버튼으로 해제합니다.
- **과거 데이터도 안 지웁니다** — 최근 ${BUFFER_S}초 창은 구동 중에 실시간으로 따라가는 "기본 화면"일 뿐, 지금까지 기록한 데이터(최대 ${MAX_HISTORY_S / 60}분)는 전부 그대로 갖고 있습니다. **토크를 끄면(정지)** 그 순간까지의 전체 구간을 한 번에 보여주고, 그 뒤부터는 그래프를 **마우스로 드래그(팬)하거나 휠로 확대/축소(줌)** 해서 옛날 데이터를 자유롭게 들여다볼 수 있습니다(차트 자체에 내장된 기능입니다). 다시 전체보기로 돌아오고 싶으면 차트에 있는 리셋 버튼을 누르면 됩니다.
- **어디에 쓰이나요?** — "엔코더", "PID 각도제어", "P게인 찾기" 페이지가 이 모터가 자기 내부에서 하는 일(엔코더로 위치 재기, PID로 목표 따라가기)의 부품 설명이고, 이 페이지는 그걸 실제 제품 스펙(Goal Position/Profile Velocity/Profile Acceleration/Position P·D Gain)으로 다시 조립한 것입니다.
`;

/** 실제 Position Control Mode의 사다리꼴 속도 프로파일 1스텝 — Profile Velocity/Acceleration으로 가속→순항→감속해서 goal에 정지 */
function stepProfile(pos: number, vel: number, goal: number, accel: number, vMax: number, dt: number) {
  const remaining = goal - pos;
  const dir = Math.sign(remaining) || 0;
  const brakingDist = (vel * vel) / (2 * Math.max(accel, 1e-6));
  const targetVel = Math.abs(remaining) <= brakingDist ? 0 : dir * vMax;
  const dv = targetVel - vel;
  const maxDv = accel * dt;
  const nextVel = vel + Math.max(-maxDv, Math.min(maxDv, dv));
  const nextPos = pos + nextVel * dt;
  return { pos: nextPos, vel: nextVel };
}

interface Sample {
  t: number; goal: number; profilePos: number; output: number;
  truePosition: number; reportedPosition: number;   // 실제 피지컬(연속) vs 장비 출력(엔코더 양자화)
  trueSpeed: number; reportedSpeed: number;          // 실제 피지컬(연속) vs 장비 출력(레지스터 양자화)
  current: number; temperature: number; voltage: number; moving: number;
}

type SampleKey = 'goal' | 'profilePos' | 'output' | 'truePosition' | 'reportedPosition' | 'trueSpeed' | 'reportedSpeed' | 'current' | 'temperature' | 'voltage' | 'moving';

function ptsOf(buf: Sample[], key: SampleKey): string {
  if (!buf.length) return '0,0';
  return buf.map(s => `${s.t.toFixed(3)},${s[key].toFixed(4)}`).join(' ');
}

/** 두 값의 차이(예: 장비 출력 - 실제 피지컬값 = 양자화 오차)를 시간에 따라 그림 */
function diffPtsOf(buf: Sample[], keyA: SampleKey, keyB: SampleKey): string {
  if (!buf.length) return '0,0';
  return buf.map(s => `${s.t.toFixed(3)},${(s[keyA] - s[keyB]).toFixed(5)}`).join(' ');
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class PhysicalXm430 extends w.HTMLElement {
    // 실제 컨트롤 테이블 입력 레지스터
    private goalPosition = 90;
    private profileVelocity = 40;   // deg/s
    private profileAcceleration = 60; // deg/s²
    private posPGain = 4;
    private posDGain = 0.05;
    private loadDrag = 0;           // 부하/스톨 — Profile Velocity 근처까지 올리면 거의 못 움직임 (모터 입력 아님, 환경 변수)
    private torqueEnabled = false;
    private faulted = false;
    private settingsUnlocked = false; // 공장값(Profile Velocity/Accel, P/D Gain) 수정 허용 여부

    // 내부 상태
    private profilePos = 0;
    private profileVel = 0;
    private position = 0;
    private prevPosition = 0;
    private elapsedS = 0;
    private temperature = AMBIENT_C;
    private lastCurrent = 0;
    private lastVoltage = V_NOMINAL;
    private lastOutput = 0;
    private buffer: Sample[] = [];

    private rafId = 0;
    private lastFrameMs = 0;
    private controlAccum = 0;
    private logAccum = 0;
    private writeLog: string[] = [];
    private readLog: string[] = [];

    private tick = () => {
      const nowMs = w.performance.now();
      if (this.lastFrameMs === 0) this.lastFrameMs = nowMs;
      let frameDt = (nowMs - this.lastFrameMs) / 1000;
      this.lastFrameMs = nowMs;
      if (frameDt > MAX_FRAME_DT) frameDt = MAX_FRAME_DT;

      if (this.torqueEnabled && !this.faulted) {
        this.controlAccum += frameDt;
        this.logAccum += frameDt;
        while (this.controlAccum >= DT) {
          this.controlAccum -= DT;
          this.elapsedS += DT;

          const prof = stepProfile(this.profilePos, this.profileVel, this.goalPosition, this.profileAcceleration, this.profileVelocity, DT);
          this.profilePos = prof.pos; this.profileVel = prof.vel;

          const error = this.profilePos - this.position;
          const measuredSpeed = (this.position - this.prevPosition) / DT;
          let output = this.posPGain * error - this.posDGain * measuredSpeed;
          const outMax = this.profileVelocity * 1.5;
          output = Math.max(-outMax, Math.min(outMax, output));
          const drag = this.loadDrag;
          const netRate = output > drag ? output - drag : output < -drag ? output + drag : 0;
          this.prevPosition = this.position;
          this.position += netRate * DT;
          this.lastOutput = output;

          this.lastCurrent = 30 + 18 * Math.abs(output) + (Math.random() - 0.5) * 4;
          const equilibrium = AMBIENT_C + 0.04 * this.lastCurrent;
          this.temperature += (equilibrium - this.temperature) * (DT / THERMAL_TAU_S);
          this.lastVoltage = V_NOMINAL - 0.0006 * this.lastCurrent + (Math.random() - 0.5) * 0.03;

          if (this.temperature > OVERHEAT_C) { this.faulted = true; this.torqueEnabled = false; break; }
        }
        let logged = false;
        while (this.logAccum >= LOG_PERIOD_S) {
          this.logAccum -= LOG_PERIOD_S;
          const measuredSpeed = (this.position - this.prevPosition) / DT;
          const moving = (Math.abs(this.goalPosition - this.position) > MOVING_THRESHOLD_DEG || Math.abs(measuredSpeed) > MOVING_THRESHOLD_DEG) ? 1 : 0;
          const reportedPosition = quantize(this.position, ENCODER_RES_DEG);
          const reportedSpeed = quantize(measuredSpeed, VELOCITY_RAW_RES_DEG_S);
          this.buffer.push({
            t: this.elapsedS, goal: this.goalPosition, profilePos: this.profilePos, output: this.lastOutput,
            truePosition: this.position, reportedPosition,
            trueSpeed: measuredSpeed, reportedSpeed,
            current: this.lastCurrent, temperature: this.temperature, voltage: this.lastVoltage, moving,
          });
          if (this.buffer.length > MAX_HISTORY_LEN) this.buffer.shift();
          // 실제 장비라면 이 순간 상태 폴링(READ) 패킷이 오가는 시점 — 샘플링 주기(10Hz)와 동일하게 찍힌다.
          this.pushReadLog([
            `dxl.getPresentPosition(${DXL_ID}, UNIT_DEGREE) → ${reportedPosition.toFixed(3)}°`,
            `dxl.getPresentVelocity(${DXL_ID}, UNIT_DEGREE) → ${reportedSpeed.toFixed(3)}°/s`,
            `dxl.getPresentCurrent(${DXL_ID}, UNIT_MILLI_AMPERE) → ${this.lastCurrent.toFixed(0)}mA`,
            `dxl.readControlTableItem(PRESENT_TEMPERATURE, ${DXL_ID}) → ${this.temperature.toFixed(1)}°C`,
            `dxl.readControlTableItem(PRESENT_INPUT_VOLTAGE, ${DXL_ID}) → ${this.lastVoltage.toFixed(2)}V`,
            `dxl.readControlTableItem(MOVING, ${DXL_ID}) → ${moving}`,
          ]);
          logged = true;
        }
        if (logged) {
          this.updateChartPoints();
          const t1 = this.elapsedS;
          this.setChartRange(Math.max(0, t1 - BUFFER_S), Math.max(t1, BUFFER_S));
        }
      } else {
        this.temperature += (AMBIENT_C - this.temperature) * (frameDt / THERMAL_TAU_S);
        this.lastCurrent = 0;
      }

      this.refreshVisual();
      this.rafId = w.requestAnimationFrame(this.tick);
    };

    /** 차트 데이터(points)만 갱신 — 새 샘플이 실제로 쌓였을 때만 부른다(60fps 전부가 아니라 10Hz로) */
    private updateChartPoints() {
      const sh = this.shadowRoot;
      if (!sh) return;
      const setPts = (id: string, key: SampleKey) => {
        const el = sh.querySelector(id) as HTMLElement;
        if (el) el.setAttribute('points', ptsOf(this.buffer, key));
      };
      setPts('#xm-goal-chartline', 'goal');
      setPts('#xm-profile-line', 'profilePos');
      setPts('#xm-pos-line', 'reportedPosition');
      setPts('#xm-out-line', 'output');
      setPts('#xm-vel-line', 'reportedSpeed');
      setPts('#xm-cur-line', 'current');
      setPts('#xm-temp-line', 'temperature');
      setPts('#xm-volt-line', 'voltage');
      setPts('#xm-moving-line', 'moving');
      const quantEl = sh.querySelector('#xm-quant-line') as HTMLElement;
      if (quantEl) quantEl.setAttribute('points', diffPtsOf(this.buffer, 'reportedPosition', 'truePosition'));
    }

    /** 차트가 보여줄 x축 구간(x-min/x-max)만 지정 — 이걸 계속 바꾸면 사용자가 마우스로 드래그/휠로 과거를 살펴보는 걸 매 프레임 되돌려버리므로, 구동 중 자동 스크롤할 때와 정지 시점 스냅샷에서만 호출한다 */
    private setChartRange(x0: number, x1: number) {
      const sh = this.shadowRoot;
      if (!sh) return;
      CHART_IDS.forEach(id => {
        const chart = sh.querySelector(id) as HTMLElement;
        if (chart) { chart.setAttribute('x-min', String(x0)); chart.setAttribute('x-max', String(x1)); }
      });
    }

    private refreshVisual() {
      const sh = this.shadowRoot;
      if (!sh) return;
      const arm = sh.querySelector('#xm-arm') as SVGGElement;
      if (arm) arm.setAttribute('transform', `rotate(${this.position.toFixed(2)} 50 50)`);
      const goalLine = sh.querySelector('#xm-goal-line') as SVGLineElement;
      if (goalLine) goalLine.setAttribute('transform', `rotate(${this.goalPosition} 50 50)`);

      const status = `[ID=${DXL_ID}] ` + (this.faulted ? 'FAULT(과열)' : this.torqueEnabled ? '구동중' : '토크 OFF');
      const statusColor = this.faulted ? '#ef4444' : this.torqueEnabled ? '#10b981' : '#94a3b8';
      const statusEl = sh.querySelector('#xm-status') as HTMLElement;
      if (statusEl) { statusEl.textContent = status; statusEl.style.color = statusColor; }

      const setText = (id: string, v: string) => { const el = sh.querySelector(id) as HTMLElement; if (el) el.textContent = v; };
      const rawSpeed = (this.position - this.prevPosition) / DT || 0;
      setText('#xm-true-pos', `${this.position.toFixed(3)}°`);
      setText('#xm-pos', `${quantize(this.position, ENCODER_RES_DEG).toFixed(3)}°`);
      setText('#xm-profile', `${this.profilePos.toFixed(1)}°`);
      setText('#xm-true-speed', `${rawSpeed.toFixed(3)}°/s`);
      setText('#xm-speed', `${quantize(rawSpeed, VELOCITY_RAW_RES_DEG_S).toFixed(3)}°/s`);
      setText('#xm-current', `${this.lastCurrent.toFixed(0)}mA`);
      setText('#xm-temp', `${this.temperature.toFixed(1)}°C`);
      setText('#xm-volt', `${this.lastVoltage.toFixed(2)}V`);
      const tempEl = sh.querySelector('#xm-temp') as HTMLElement;
      if (tempEl) tempEl.style.color = this.temperature > OVERHEAT_C * 0.85 ? '#ef4444' : this.temperature > OVERHEAT_C * 0.6 ? '#f59e0b' : '#1e293b';

      const torqueBtn = sh.querySelector('#xm-torque') as HTMLButtonElement;
      const resetBtn = sh.querySelector('#xm-reset') as HTMLButtonElement;
      if (torqueBtn) {
        torqueBtn.textContent = this.torqueEnabled ? '⏻ 토크 OFF' : '⏻ 토크 ON';
        torqueBtn.classList.toggle('on', this.torqueEnabled);
        torqueBtn.disabled = this.faulted;
      }
      if (resetBtn) resetBtn.style.display = this.faulted ? '' : 'none';

      sh.querySelectorAll('.xm-factory').forEach(el => { (el as HTMLInputElement).disabled = !this.settingsUnlocked; });
    }

    @onConnectedAfter
    startLoop() {
      this.lastFrameMs = 0;
      this.rafId = w.requestAnimationFrame(this.tick);
      // 부팅 직후 이미 이 값들로 설정되어 있다고 가정 — 그래서 torqueOn() 한 번만 눌러도 90°로 움직인다.
      this.pushWriteLog([
        `(부팅 시 기존 설정값 읽음 — 이래서 첫 torqueOn()만으로도 목표까지 움직인다)`,
        `dxl.setGoalPosition(${DXL_ID}, ${this.goalPosition}, UNIT_DEGREE)`,
        `dxl.writeControlTableItem(PROFILE_VELOCITY, ${DXL_ID}, ${this.profileVelocity})`,
        `dxl.writeControlTableItem(PROFILE_ACCELERATION, ${DXL_ID}, ${this.profileAcceleration})`,
        `dxl.writeControlTableItem(POSITION_P_GAIN, ${DXL_ID}, ${this.posPGain.toFixed(2)})`,
        `dxl.writeControlTableItem(POSITION_D_GAIN, ${DXL_ID}, ${this.posDGain.toFixed(2)})`,
      ]);
    }

    @onDisconnected
    stopLoop() { w.cancelAnimationFrame(this.rafId); }

    private appendLog(arr: string[], elId: string, lines: string[], cap: number) {
      const ts = this.elapsedS.toFixed(2);
      for (const line of lines) arr.push(`[${ts}s] ${line}`);
      if (arr.length > cap) arr.splice(0, arr.length - cap);
      const el = this.shadowRoot?.querySelector(elId) as HTMLElement;
      if (el) { el.innerHTML = arr.map(l => `<div>${l}</div>`).join(''); el.scrollTop = el.scrollHeight; }
    }

    /** 실제 기기라면 WRITE 인스트럭션 패킷이 나가는 시점 — 그 순간 보내는 값들을 로그로 남긴다 */
    private pushWriteLog(lines: string[]) { this.appendLog(this.writeLog, '#xm-log-write', lines, 100); }

    /** 실제 기기라면 READ 인스트럭션(상태 폴링)이 오는 시점 — 샘플링 주기(10Hz)마다 찍힌다. 쓰기보다 훨씬 자주 찍히므로 캡을 더 크게 잡는다. */
    private pushReadLog(lines: string[]) { this.appendLog(this.readLog, '#xm-log-read', lines, 300); }

    @addEventListener('#xm-torque', 'click')
    onTorque() {
      if (this.faulted) return;
      this.torqueEnabled = !this.torqueEnabled;
      if (this.torqueEnabled) {
        // 내부 프로파일 재시작(시뮬레이터 내부 상태일 뿐 — dxl API 호출 아님). Goal Position 등 실제 레지스터 값은
        // 슬라이더를 놓는 순간(change) 이미 각각 실시간으로 WRITE되어 있으므로 여기서 다시 보낼 필요가 없다.
        this.profilePos = this.position; this.profileVel = 0;
        this.pushWriteLog([`dxl.torqueOn(${DXL_ID})`]);
      } else {
        // pid-angle.ino의 실제 stopRun()과 동일한 순서·동일한 함수 호출: setGoalVelocity(id,0,UNIT_RPM) → torqueOff(id)
        this.pushWriteLog([
          `dxl.setGoalVelocity(${DXL_ID}, 0, UNIT_RPM)  // stopRun()과 동일 호출`,
          `dxl.torqueOff(${DXL_ID})  // stopRun()과 동일 호출`,
        ]);
        // 정지 시점 스냅샷 — 지금까지 기록된 전체 구간을 한 번에 보여준다.
        // 그 뒤로는 차트 자체의 마우스 드래그(팬)·휠(줌)로 과거 구간을 자유롭게 살펴볼 수 있고,
        // 차트에 내장된 리셋 버튼으로 이 전체보기로 되돌아올 수 있다(재생 중이 아니라서 자동 스크롤이 방해하지 않음).
        this.updateChartPoints();
        this.setChartRange(0, Math.max(this.elapsedS, BUFFER_S));
      }
    }
    @addEventListener('#xm-reset', 'click')
    onReset() {
      this.faulted = false; this.torqueEnabled = false; this.temperature = AMBIENT_C;
      this.pushWriteLog([`(UI 리셋 — 실제 dxl API 호출 아님) FAULT 해제, ID=${DXL_ID}`]);
    }

    @addEventListener('#xm-stop-here', 'click')
    onStopHere() {
      // ⚠ 공식 스펙(Robotis e-매뉴얼)엔 없는 비공식 활용법 — Goal Position 레지스터에 지금 위치를 다시 써넣어서 그 자리서 멈추게 하는 것뿐(토크는 유지). 문서에 나온 공식 정지 방법(그리고 pid-angle.ino의 stopRun()이 실제로 하는 방법)은 Goal Velocity=0 + Torque Enable OFF뿐이다.
      this.goalPosition = Math.round(this.position);
      const sh = this.shadowRoot;
      const input = sh?.querySelector('#xm-goal') as HTMLInputElement;
      if (input) input.value = String(this.goalPosition);
      const valEl = sh?.querySelector('#xm-goal-val') as HTMLElement;
      if (valEl) valEl.textContent = `${this.goalPosition}°`;
      this.pushWriteLog([`dxl.setGoalPosition(${DXL_ID}, ${this.goalPosition}, UNIT_DEGREE)  // 비공식 정지 활용법 — stopRun()엔 없는 호출`]);
    }

    @addEventListener('#xm-log-write-clear', 'click')
    onClearWriteLog() {
      this.writeLog = [];
      const el = this.shadowRoot?.querySelector('#xm-log-write') as HTMLElement;
      if (el) el.innerHTML = '';
    }

    @addEventListener('#xm-log-read-clear', 'click')
    onClearReadLog() {
      this.readLog = [];
      const el = this.shadowRoot?.querySelector('#xm-log-read') as HTMLElement;
      if (el) el.innerHTML = '';
    }

    @addEventListener('#xm-unlock', 'change')
    onUnlock(e: Event) { this.settingsUnlocked = (e.target as HTMLInputElement).checked; this.refreshVisual(); }

    /** 드래그하는 동안 — 화면 라벨만 실시간으로 따라가는 UI 미리보기(아직 장비로 나가는 값 아님) */
    @addEventListener('.xm-setting', 'input')
    onSetting(e: Event) {
      const el = e.target as HTMLInputElement;
      const val = Number(el.value) || 0;
      if (el.id === 'xm-goal') this.goalPosition = val;
      else if (el.id === 'xm-profvel') this.profileVelocity = val || 1;
      else if (el.id === 'xm-profacc') this.profileAcceleration = val || 1;
      else if (el.id === 'xm-pgain') this.posPGain = val;
      else if (el.id === 'xm-dgain') this.posDGain = val;
      else if (el.id === 'xm-load') this.loadDrag = val;
      const valEl = this.shadowRoot?.querySelector(`#${el.id}-val`) as HTMLElement;
      if (valEl) valEl.textContent = (el.id === 'xm-goal') ? `${val}°` : (el.id === 'xm-profvel' || el.id === 'xm-profacc' || el.id === 'xm-load') ? `${val}°/s${el.id === 'xm-profacc' ? '²' : ''}` : val.toFixed(2);
    }

    /** 슬라이더를 놓는 순간(release) — 실제로 그 레지스터에 WRITE가 나가는 시점. Goal Position은 언제든(torque on/off 상관없이) 이렇게 즉시 다시 써넣는 값이라, 여기서 바로 로그로 남긴다. */
    @addEventListener('.xm-setting', 'change')
    onSettingCommit(e: Event) {
      const el = e.target as HTMLInputElement;
      const val = Number(el.value) || 0;
      const calls: Partial<Record<string, string>> = {
        'xm-goal': `dxl.setGoalPosition(${DXL_ID}, ${val}, UNIT_DEGREE)`,
        'xm-profvel': `dxl.writeControlTableItem(PROFILE_VELOCITY, ${DXL_ID}, ${val})`,
        'xm-profacc': `dxl.writeControlTableItem(PROFILE_ACCELERATION, ${DXL_ID}, ${val})`,
        'xm-pgain': `dxl.writeControlTableItem(POSITION_P_GAIN, ${DXL_ID}, ${val.toFixed(2)})`,
        'xm-dgain': `dxl.writeControlTableItem(POSITION_D_GAIN, ${DXL_ID}, ${val.toFixed(2)})`,
        // xm-load(부하/스톨)는 실제 컨트롤 테이블 항목이 아닌 환경 변수라 로그를 남기지 않는다.
      };
      const call = calls[el.id];
      if (call) this.pushWriteLog([call]);
    }

    @onConnectedBodyShadow
    render() {
      const { goalPosition, profileVelocity, profileAcceleration, posPGain, posDGain, loadDrag } = this;
      return `
        <style>
          :host { display:block; }
          .math-title { font-size:13px; font-weight:800; color:#475569; margin:14px 0 4px; }
          .math-title:first-child { margin-top:0; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .math-legend { display:flex; gap:12px; font-size:11px; color:#64748b; margin-top:8px; flex-wrap:wrap; }
          .math-legend b { font-weight:800; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:80px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }

          .xm-top { display:flex; gap:20px; flex-wrap:wrap; align-items:center; margin-bottom:10px; }
          .xm-arm-box { width:120px; height:120px; flex-shrink:0; }
          .xm-arm-box svg { width:100%; height:100%; }
          .xm-status-line { font-size:14px; font-weight:900; }
          .xm-btns { display:flex; gap:8px; margin-top:8px; }
          .xm-btn { padding:7px 16px; border-radius:10px; border:1.5px solid #e2e8f0; background:#fff; color:#334155; font-size:12px; font-weight:700; cursor:pointer; }
          .xm-btn:hover:not(:disabled) { background:#f1f5f9; }
          .xm-btn:disabled { opacity:0.4; cursor:not-allowed; }
          .xm-btn.on { background:#0f766e; color:#fff; border-color:#0f766e; }
          .xm-btn.reset { background:#f59e0b; color:#fff; border-color:#f59e0b; }

          .xm-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(100px,1fr)); gap:8px; margin:10px 0; }
          .xm-card { background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:12px; padding:8px 10px; text-align:center; }
          .xm-card-internal { background:rgba(139,92,246,0.08); border-color:#8b5cf6; }
          .xm-card-true { background:rgba(14,165,233,0.08); border-color:#0ea5e9; }
          .xm-card-label { font-size:10.5px; color:#64748b; font-weight:700; }
          .xm-card-val { font-size:16px; font-weight:900; color:#1e293b; margin-top:2px; }

          .xm-group { border:1.5px solid #e2e8f0; border-radius:12px; padding:10px 12px; margin-top:10px; }
          .xm-group-title { font-size:12px; font-weight:800; color:#334155; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:4px; }
          .xm-group-live { border-color:#0f766e; background:rgba(15,118,110,0.05); }
          .xm-group-factory { border-color:#f59e0b; background:rgba(245,158,11,0.05); }
          .xm-group-env { border-color:#94a3b8; background:rgba(148,163,184,0.08); }
          .xm-unlock-label { display:flex; align-items:center; gap:5px; font-size:11px; font-weight:700; color:#b45309; cursor:pointer; }
          .xm-unlock-label input { cursor:pointer; }
          .xm-log-cols { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin-top:14px; }
          .xm-log-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
          .xm-btn-sm { padding:4px 10px; font-size:11px; }
          .xm-log { background:#0f172a; color:#4ade80; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px; line-height:1.6; border-radius:10px; padding:8px 12px; height:150px; overflow-y:auto; }
          .xm-log-read { color:#7dd3fc; }
          .xm-log-write:empty::before { content:'(아직 전송된 쓰기 명령 없음 — 슬라이더를 움직여보거나 토크 ON을 눌러보세요)'; color:#64748b; }
          .xm-log-read:empty::before { content:'(아직 읽은 값 없음 — 토크 ON 해서 구동시켜보세요)'; color:#64748b; }
        </style>
        <div class="math-desc">Operating Mode = Position Control Mode 고정. 아래 값들은 전부 실제 XM430 컨트롤 테이블 항목(Goal Position / Profile Velocity·Acceleration / Position P·D Gain / Torque Enable)입니다.</div>

        <div class="xm-top">
          <div class="xm-arm-box">
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
              <line id="xm-goal-line" x1="50" y1="50" x2="50" y2="8" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="3,3" transform="rotate(${goalPosition} 50 50)"/>
              <g id="xm-arm" transform="rotate(0 50 50)">
                <line x1="50" y1="50" x2="50" y2="10" stroke="#0f766e" stroke-width="5" stroke-linecap="round"/>
                <circle cx="50" cy="50" r="6" fill="#0f766e"/>
              </g>
            </svg>
          </div>
          <div>
            <div class="xm-status-line">상태: <span id="xm-status" style="color:#94a3b8">토크 OFF</span></div>
            <div class="xm-btns">
              <button id="xm-torque" class="xm-btn" type="button">⏻ 토크 ON</button>
              <button id="xm-reset" class="xm-btn reset" type="button" style="display:none">↻ 리셋(과열 해제)</button>
            </div>
          </div>
        </div>

        <div class="xm-log-cols">
          <div class="xm-log-col">
            <div class="xm-log-head">
              <div class="math-title" style="margin:0">📤 쓰기(WRITE) 로그 — 슬라이더를 놓거나 버튼을 누른 시점</div>
              <button id="xm-log-write-clear" class="xm-btn xm-btn-sm" type="button">🗑 지우기</button>
            </div>
            <div class="math-desc">슬라이더를 놓는(release) 순간 그 값이 실제로 장비에 WRITE됩니다 — Goal Position은 토크 ON/OFF와 상관없이 바뀔 때마다 즉시 다시 써넣는 값이고, 토크 버튼은 그저 Torque Enable만 켜고 끕니다.</div>
            <div id="xm-log-write" class="xm-log xm-log-write"></div>
          </div>
          <div class="xm-log-col">
            <div class="xm-log-head">
              <div class="math-title" style="margin:0">📥 읽기(READ) 로그 — 상태 폴링(10Hz)</div>
              <button id="xm-log-read-clear" class="xm-btn xm-btn-sm" type="button">🗑 지우기</button>
            </div>
            <div class="math-desc">토크 ON 상태에서 샘플링 주기(10Hz)마다 Present 레지스터 6개를 읽어오는 걸 그대로 찍습니다 — 쓰기보다 훨씬 자주(1초에 60줄) 찍히니 스크롤이 빠르게 내려갑니다.</div>
            <div id="xm-log-read" class="xm-log xm-log-read"></div>
          </div>
        </div>

        <div class="xm-cards">
          <div class="xm-card xm-card-true"><div class="xm-card-label">위치 — 리얼월드값(연속)</div><div class="xm-card-val" id="xm-true-pos">0.000°</div></div>
          <div class="xm-card"><div class="xm-card-label">위치 — 계측값(Present Position, 양자화)</div><div class="xm-card-val" id="xm-pos">0.000°</div></div>
          <div class="xm-card xm-card-internal"><div class="xm-card-label">내부 프로파일 — 계산값(실제 장비엔 없음)</div><div class="xm-card-val" id="xm-profile">0.0°</div></div>
          <div class="xm-card xm-card-true"><div class="xm-card-label">속도 — 리얼월드값(연속)</div><div class="xm-card-val" id="xm-true-speed">0.000°/s</div></div>
          <div class="xm-card"><div class="xm-card-label">속도 — 계측값(Present Velocity, 양자화)</div><div class="xm-card-val" id="xm-speed">0.000°/s</div></div>
          <div class="xm-card"><div class="xm-card-label">전류 — 계측값(Present Current, 모델값)</div><div class="xm-card-val" id="xm-current">0mA</div></div>
          <div class="xm-card"><div class="xm-card-label">온도 — 계측값(Present Temperature, 모델값)</div><div class="xm-card-val" id="xm-temp">25.0°C</div></div>
          <div class="xm-card"><div class="xm-card-label">전압 — 계측값(Present Voltage, 모델값)</div><div class="xm-card-val" id="xm-volt">12.00V</div></div>
        </div>
        <div class="math-legend"><span><b style="color:#0ea5e9">■ 리얼월드값(연속, 시뮬레이션 물리 계산 결과)</b></span><span><b style="color:#334155">■ 계측값(장비가 출력으로 주는 값 — Present 레지스터, 엔코더/레지스터 분해능으로 양자화됨)</b></span><span><b style="color:#8b5cf6">■ 계산값(실제 장비엔 없는 내부 계산값)</b></span></div>

        <div class="xm-group xm-group-live">
          <div class="xm-group-title">① 목표를 바꾸고 싶을 때마다 새로 써넣는 값(항상 수정 가능, 안 바꾸면 계속 유지)</div>
          <div class="ctl"><label>Goal Position(°) <input class="xm-setting" id="xm-goal" type="range" min="-90" max="90" step="1" value="${goalPosition}"><b id="xm-goal-val">${goalPosition}°</b></label></div>
          <div class="ctl"><button id="xm-stop-here" class="xm-btn" type="button">■ 지금 위치에서 정지(비공식 — 스펙 문서화된 기능 아님)</button></div>
        </div>

        <div class="xm-group xm-group-factory">
          <div class="xm-group-title">② 한 번만 세팅하는 값(공장값 — 기본 잠금)
            <label class="xm-unlock-label"><input id="xm-unlock" type="checkbox"> ⚙ 설정값 수정 허용</label>
          </div>
          <div class="ctl"><label>Profile Velocity(°/s) <input class="xm-setting xm-factory" id="xm-profvel" type="range" min="5" max="120" step="1" value="${profileVelocity}" disabled><b id="xm-profvel-val">${profileVelocity}°/s</b></label></div>
          <div class="ctl"><label>Profile Acceleration(°/s²) <input class="xm-setting xm-factory" id="xm-profacc" type="range" min="10" max="200" step="5" value="${profileAcceleration}" disabled><b id="xm-profacc-val">${profileAcceleration}°/s²</b></label></div>
          <div class="ctl"><label>Position P Gain <input class="xm-setting xm-factory" id="xm-pgain" type="range" min="0" max="10" step="0.1" value="${posPGain}" disabled><b id="xm-pgain-val">${posPGain.toFixed(2)}</b></label></div>
          <div class="ctl"><label>Position D Gain <input class="xm-setting xm-factory" id="xm-dgain" type="range" min="0" max="1" step="0.01" value="${posDGain}" disabled><b id="xm-dgain-val">${posDGain.toFixed(2)}</b></label></div>
        </div>

        <div class="xm-group xm-group-env">
          <div class="xm-group-title">③ 환경 변수 — 실제 모터 입력 아님(시뮬레이션 전용)</div>
          <div class="ctl"><label>부하/스톨(°/s, 0=정상) <input class="xm-setting" id="xm-load" type="range" min="0" max="150" step="1" value="${loadDrag}"><b id="xm-load-val">${loadDrag}°/s</b></label></div>
        </div>

        <div class="math-title">위치(°) — Goal(입력값) vs 내부 프로파일(계산값) vs Present Position(계측값, 양자화됨) — 실시간</div>
        <cartesian-chart id="xm-chart-pos" x-min="0" x-max="${BUFFER_S}" y-min="-100" y-max="100" x-label="시간(s)" y-label="각도(°)" disabled-aspect style="height:170px;max-width:640px;margin:0 auto">
          <series id="xm-goal-chartline" points="0,0" color="#94a3b8" dash="4,4"></series>
          <series id="xm-profile-line" points="0,0" color="#8b5cf6" dash="3,2"></series>
          <series id="xm-pos-line" points="0,0" color="#0f766e" width="2"></series>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#94a3b8">- - Goal Position(입력값 — 안 바꾸면 그대로라 직선)</b></span><span><b style="color:#8b5cf6">·· 내부 프로파일(계산값, 실제 장비에선 못 읽음)</b></span><span><b style="color:#0f766e">— Present Position(계측값, 엔코더로 양자화된 값)</b></span></div>

        <div class="math-title">속도(°/s) — 내부 제어 출력(계산값) vs Present Velocity(계측값, 양자화됨)</div>
        <cartesian-chart id="xm-chart-vel" x-min="0" x-max="${BUFFER_S}" y-min="-${profileVelocity * 1.6}" y-max="${profileVelocity * 1.6}" x-label="시간(s)" y-label="°/s" disabled-aspect style="height:140px;max-width:640px;margin:0 auto">
          <series id="xm-out-line" points="0,0" color="#8b5cf6" dash="3,2"></series>
          <series id="xm-vel-line" points="0,0" color="#f59e0b" width="2"></series>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#8b5cf6">- - 내부 제어 출력(계산값, 실제 장비에선 못 읽음)</b></span><span><b style="color:#f59e0b">— Present Velocity(계측값, 양자화됨)</b></span></div>

        <div class="math-title">Present Current(mA) — 계측값(모델값)</div>
        <cartesian-chart id="xm-chart-cur" x-min="0" x-max="${BUFFER_S}" y-min="0" y-max="120" x-label="시간(s)" y-label="mA" disabled-aspect style="height:120px;max-width:640px;margin:0 auto">
          <series id="xm-cur-line" points="0,0" color="#e11d48" width="2"></series>
        </cartesian-chart>

        <div class="math-title">Present Temperature(°C) — 계측값(모델값, 1차 지연 — "시정수" 페이지와 같은 방식)</div>
        <div class="math-desc">점선(과열 임계 ${OVERHEAT_C}°C)은 실제 XM430 사양에서 가져온 값이 아니라, 제가 임의로 정한 예시 숫자입니다 — "과열 보호"라는 기능 자체는 실제 기기에도 있지만, 정확한 기준 온도는 이 시뮬레이터에서 검증한 게 아닙니다.</div>
        <cartesian-chart id="xm-chart-temp" x-min="0" x-max="${BUFFER_S}" y-min="20" y-max="${OVERHEAT_C + 10}" x-label="시간(s)" y-label="°C" disabled-aspect style="height:120px;max-width:640px;margin:0 auto">
          <series points="0,${OVERHEAT_C} ${BUFFER_S},${OVERHEAT_C}" color="#ef4444" dash="4,4"></series>
          <series id="xm-temp-line" points="0,0" color="#f97316" width="2"></series>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#ef4444">- - 과열 임계(임의 예시값, ${OVERHEAT_C}°C — 실제 데이터시트 수치 아님)</b></span><span><b style="color:#f97316">— 온도</b></span></div>

        <div class="math-title">Present Input Voltage(V) — 계측값(모델값)</div>
        <cartesian-chart id="xm-chart-volt" x-min="0" x-max="${BUFFER_S}" y-min="11" y-max="12.5" x-label="시간(s)" y-label="V" disabled-aspect style="height:110px;max-width:640px;margin:0 auto">
          <series id="xm-volt-line" points="0,0" color="#0ea5e9" width="2"></series>
        </cartesian-chart>

        <div class="math-title">Moving(구동중 여부, 계측값) — 1=아직 목표에 못 미침/움직이는 중, 0=정지·도착</div>
        <div class="math-desc">숫자 자체는 딱히 볼 게 없는 0/1 값이지만, 다른 그래프들과 나란히 놓고 보면 "언제부터 언제까지 실제로 움직이고 있었는지"가 한눈에 보입니다.</div>
        <cartesian-chart id="xm-chart-moving" x-min="0" x-max="${BUFFER_S}" y-min="-0.2" y-max="1.2" x-label="시간(s)" y-label="" disabled-aspect style="height:90px;max-width:640px;margin:0 auto">
          <series id="xm-moving-line" points="0,0" color="#6366f1" width="2"></series>
        </cartesian-chart>

        <div class="math-title">위치 양자화 오차 — 계측값(Present Position) - 리얼월드값(실제 피지컬 위치)</div>
        <div class="math-desc">엔코더가 4096CPR(360°/4096 ≈ ${ENCODER_RES_DEG.toFixed(3)}°가 최소 단위)라서, 계측값(장비가 보고하는 값)과 리얼월드값(실제 연속적인 물리 위치) 사이엔 항상 이만큼 이하의 작은 오차(톱니 모양)가 생깁니다 — "엔코더" 페이지에서 본 분해능 개념이 여기서 실제로 만드는 오차입니다.</div>
        <cartesian-chart id="xm-chart-quant" x-min="0" x-max="${BUFFER_S}" y-min="${-ENCODER_RES_DEG}" y-max="${ENCODER_RES_DEG}" x-label="시간(s)" y-label="°" disabled-aspect style="height:90px;max-width:640px;margin:0 auto">
          <series points="0,0 ${BUFFER_S},0" color="#e2e8f0" dash="4,4"></series>
          <series id="xm-quant-line" points="0,0" color="#0ea5e9" width="1.6"></series>
        </cartesian-chart>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
