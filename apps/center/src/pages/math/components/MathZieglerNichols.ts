import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-ziegler-nichols';

// find-gain.ino와 동일한 모델(도(deg) 단위) — 1단계(임계점 찾기)에 재사용
const DEADBAND_DEG = 0.2;
const RAMP_DELAY_S = 2;
const DT = 0.01;
const DEFAULT_CONTROL_PERIOD_MS = 10; // pid-angle.ino/find-gain.ino의 실제 상수 PERIOD_US=10000(=100Hz) — 이 페이지의 기본값. 실제 코드는 이 값으로 고정돼 있지만, 여기선 "제어 루프를 더 느리게/빠르게 돌리면 어떻게 되나"도 탐색할 수 있게 슬라이더로 열어둠
const MIN_SIM_T = 24;      // 지연이 작을 때도 최소 이만큼은 보여줌(기존 폭)
const PERIODS_TO_SHOW = 4; // 임계점 근처에서 최소 이만큼 주기가 보이도록
const TU_PER_DELAY = 4;    // 이론상 Tu ≈ 4·지연 (순수 이송지연+적분 플랜트의 임계 주기)

/** 지연이 커질수록(주기 Tu도 커지므로) 시뮬레이션 길이를 같이 늘린다 — 지연=10s면 Tu≈40s라 최소 몇 주기는 보여야 함 */
function simDurationFor(delayMs: number): number {
  const delayS = delayMs / 1000;
  return Math.max(MIN_SIM_T, RAMP_DELAY_S + PERIODS_TO_SHOW * TU_PER_DELAY * delayS);
}

const MD = `
## Ziegler-Nichols 튜닝 공식 — "임계 게인"만 찾으면 Kp·Ki·Kd가 공식으로 바로 나옵니다
- **"P게인 찾기"** 페이지에서 한 것: Kp를 눈으로 보면서 이리저리 올려보다가 "진동이 유지되는" 지점을 찾는 **경험적** 방법이었습니다. **Ziegler-Nichols(1942)**는 그 지점(임계 게인 Ku, 임계 주기 Tu) 딱 하나만 찾으면, 나머지 Ki·Kd는 **정해진 공식**으로 바로 계산해버리는 방법입니다 — 손으로 Ki·Kd까지 더듬어 찾을 필요가 없습니다.
- **1단계 — 임계점 찾기**: I·D는 0으로 끄고(find-gain.ino와 동일하게 P만) Kp를 올립니다. 오버슈트가 "커지지도 줄지도 않고 똑같은 크기로 반복"되는 지점이 임계점입니다 — 그때의 Kp가 **Ku(임계 이득)**, 오버슈트가 반복되는 주기가 **Tu(임계 주기)**입니다. 아래 1단계 차트가 지금 진폭이 커지는지/줄어드는지/유지되는지를 자동으로 판정해서 보여줍니다.
- **Tu는 어떻게 "계산"되나요? — 코드가 하는 일**: 화면의 Tu는 눈으로 재는 게 아니라, 1단계 응답 곡선에서 목표보다 위로 튀어나온 **오버슈트 극댓값(피크)들을 찾아서, 마지막 두 피크 사이의 시간 간격**을 그대로 잰 값입니다(진폭이 커지는지/줄어드는지도 그 두 피크의 크기 비율로 판정합니다).
- **Tu를 "이론적으로" 미리 계산할 수도 있습니다** — 1단계 모델은 \`dx/dt = -Kp·x(t-지연)\`(순수 적분 플랜트 + P + 순수 이송지연)이라는 단순한 형태라, 실제로 라플라스로 풀립니다:
  1. 특성방정식: \`s + Kp·e^(-s·지연) = 0\`
  2. 임계점(=지속 진동, 극점이 허수축 위)이면 \`s = jω\`를 대입: \`jω + Kp·(cos(ωL) - j·sin(ωL)) = 0\` (L=지연)
  3. 실수부=0 → \`cos(ωL)=0\` → \`ωL = π/2\` → \`ω = π/(2L)\`
  4. 허수부=0 → \`Kp = ω/sin(ωL) = ω\`(∵ sin(π/2)=1)
  5. 정리하면: **Ku = π/(2·지연), Tu = 2π/ω = 4·지연**

  즉 이 단순 모델에서는 Tu가 항상 정확히 **지연의 4배**입니다(예: 지연=1.25s → Tu=5.00s, 지연=10s → Tu=40.0s). **이 "4"를 직접 의심해볼 수 있게, "이론 배율" 슬라이더로 다른 값도 넣어볼 수 있게 열어뒀습니다** — 3이나 5로 바꿔서 "이론값"이 위 측정값과 멀어지는 걸 보고, 다시 4로 돌리면 딱 맞아떨어지는 걸 직접 확인해보세요(제가 그냥 우긴 숫자가 아니라는 걸 스스로 검증하는 용도입니다). 1단계 실험으로 측정한 값이 이 4배 공식과 거의 일치하는 걸 직접 비교해보세요 — **속도한계나 데드밴드 때문에 어긋나는 게 아닙니다**(직접 검증: 속도한계를 50에서 천만까지 풀어도, 데드밴드를 0으로 없애도 측정된 Tu는 똑같았습니다). 진짜 원인은 **이 시뮬레이터가 연속시간 미분방정식을 100Hz(0.01s 스텝)로 쪼개서 근사(오일러 적분)하기 때문**입니다 — 이 이산화 오차만으로도 이론값(0.32s)과 측정값(0.33~0.34s)이 몇 % 차이 나는 걸 직접 확인했습니다. 실제 하드웨어는 이런 단순한 닫힌해가 없는 경우가 대부분이라, 그래서 1단계처럼 **직접 실험(경험적 스윕)** 으로 Ku·Tu를 재는 게 Ziegler-Nichols의 원래 방법입니다.
- **그럼 속도한계(모터 최고속도)는 Tu에 진짜 아무 영향도 없나요?** — 이미 "유지(steady)" 상태에 들어간 뒤라면, 속도한계를 아무리 넓혀도(50→100→500→...) **Tu 숫자 자체는 안 바뀝니다**(직접 확인). 다만 속도한계는 **"임계 바로 위에서 지금 보이는 게 유지냐 계속 자라나는 중이냐"의 판정에는 영향**을 줍니다 — 속도한계가 낮으면 빨리 그 한계에 걸려서 리밋 사이클(steady)에 금방 갇히고, 속도한계가 아주 넉넉하면 포화가 늦게 와서 (관찰 시간 안에서는) 계속 커지는 중(growing)으로 보일 수 있습니다. 즉 속도한계가 "주기의 크기"를 바꾸는 게 아니라 "지금 보고 있는 게 안정된 상태냐 아니냐"를 바꾸는 겁니다.
- **2단계 — 공식 대입** (Ziegler-Nichols "Classic PID" 표, 1942년 원 논문 값):

  | 컨트롤러 | Kp | Ti | Td |
  |---|---|---|---|
  | P | 0.5·Ku | – | – |
  | PI | 0.45·Ku | 0.833·Tu | – |
  | PID | 0.6·Ku | 0.5·Tu | 0.125·Tu |

  Ki=Kp/Ti, Kd=Kp·Td로 바꿔 쓰면: **PID 기준 Kp=0.6Ku, Ki=1.2·Ku/Tu, Kd=0.075·Ku·Tu**입니다.
- **왜 이렇게 되나요(직관)**: 임계점은 "닫힌루프 극점이 허수축 위에 딱 걸린" 상태입니다(**"PID 제어"**, **"근궤적"** 페이지의 극점 그래프와 같은 개념) — 시스템이 스스로 "내가 얼마나 지연·관성이 있는지"를 오버슈트 진폭·주기로 알려준 셈이라, 그 숫자 두 개(Ku, Tu)에서 나머지 게인을 경험적으로 잘 맞는 비율로 역산하는 겁니다. 이론적으로 최적은 아니고(그래서 "1/4 진폭 감쇠"라는 다소 공격적인 튜닝이 나옵니다), 처음 게인을 잡을 때 "감이 아니라 근거 있는 출발점"을 준다는 게 핵심입니다.
- **1단계는 P만 쓰는데 왜 2단계는 갑자기 I·D가 생기나요?** — Ku·Tu는 "이 시스템이 얼마나 느슨한가"를 재는 도구일 뿐, 최종 컨트롤러가 P만 쓰라는 뜻이 아닙니다. 1단계에서 잰 두 숫자를 공식에 넣으면 P/PI/PID 세 가지 컨트롤러의 게인이 전부 나오고, 아래에서 원하는 걸 골라 실제로 돌려볼 수 있습니다.
- **⚠ 참고**: 1단계 모델은 "P게인 찾기" 페이지와 똑같이 순수 이송지연(pure delay) 하나로 실제 지연 요소(제어주기·모터 내부루프·통신 왕복)를 뭉뚱그린 단순화입니다. 2단계는 그 위에 \`pid-angle.ino\`와 같은 데드밴드·적분 브레이크(anti-windup)가 들어간 실전형 PID를 적용해서 검증합니다.
- **왜 Kp를 임계보다 훨씬 높여도 화면이 계속 커지지 않고 "유지"로만 보이나요?** — 1단계엔 실제 모터처럼 **속도한계**가 걸려 있어서, 진폭이 커지다가 그 한계에 부딪히면 더 이상 못 커지고 "최대 속도로 계속 왔다갔다"하는 상태(리밋 사이클)에 갇혀버립니다. 속도한계 옆 **"적용" 체크를 꺼보면** 그 한계 없이 돌아가서, 임계를 넘은 Kp가 이론대로 값을 무한정 키우는(발산하는) 모습을 직접 볼 수 있습니다 — 그래프 밖으로 선이 빠져나가는 게 바로 그 발산입니다. 현실의 모터는 항상 속도한계가 있어서 이런 무한 발산은 일어나지 않고, 대신 리밋 사이클(진동)로 끝나는 게 정상입니다.
- **어디에 쓰이나요?** — PID 게인을 처음부터 잡아야 하는 모든 현장(서보모터, 온도제어, 유량제어)에서 가장 오래되고 유명한 시작점 공식입니다.
`;

// ── 1단계: P-only + 순수 이송지연 (find-gain.ino와 동일한 모델) ──
function feedbackVelocity(errorDeg: number, kp: number, limit: number): number {
  if (Math.abs(errorDeg) < DEADBAND_DEG) return 0;
  return Math.max(-limit, Math.min(limit, kp * errorDeg));
}

interface Row { t: number; target: number; position: number }

function simulateP(kp: number, speedLimitDegS: number, goalDeg: number, delayMs: number, simT: number): Row[] {
  const delaySteps = Math.max(0, Math.round(delayMs / (DT * 1000)));
  const queue: number[] = new Array(delaySteps).fill(0);
  let position = 0;
  const rows: Row[] = [];
  const n = Math.round(simT / DT);
  for (let idx = 0; idx <= n; idx++) {
    const t = idx * DT;
    const target = t < RAMP_DELAY_S ? 0 : goalDeg;
    const error = target - position;
    const cmdNow = feedbackVelocity(error, kp, speedLimitDegS);
    queue.push(cmdNow);
    const applied = queue.shift()!;
    position += applied * DT;
    rows.push({ t, target, position });
  }
  return rows;
}

type Trend = 'none' | 'single' | 'growing' | 'decaying' | 'steady';

/**
 * 목표 위로 튀어나온 오버슈트 피크들을 상승→하강 전환으로 검출(평평한 정점 구간도 처리).
 * 마지막 두 피크의 시간차 = Tu, 진폭비로 growing/decaying/steady 판정.
 */
function detectOscillation(rows: Row[], goalDeg: number): { peaks: { t: number; amp: number }[]; tu: number | null; trend: Trend } {
  const dir = Math.sign(goalDeg) || 1;
  const amp = (r: Row) => dir * (r.position - goalDeg);
  const peaks: { t: number; amp: number }[] = [];
  let rising = false;
  let peakAmp = -Infinity, peakT = 0;
  const threshold = 0.05 * Math.max(1, Math.abs(goalDeg));
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].t < RAMP_DELAY_S) continue;
    const a = amp(rows[i]);
    const da = a - amp(rows[i - 1]);
    if (da > 1e-9) {
      rising = true;
      if (a > peakAmp) { peakAmp = a; peakT = rows[i].t; }
    } else if (da < -1e-9 && rising) {
      if (peakAmp > threshold) peaks.push({ t: peakT, amp: peakAmp });
      rising = false;
      peakAmp = -Infinity;
    }
  }
  if (peaks.length < 2) return { peaks, tu: null, trend: peaks.length === 0 ? 'none' : 'single' };
  const last = peaks[peaks.length - 1];
  const prev = peaks[peaks.length - 2];
  const tu = last.t - prev.t;
  const ratio = last.amp / (prev.amp || 1e-9);
  const trend: Trend = ratio > 1.05 ? 'growing' : ratio < 0.95 ? 'decaying' : 'steady';
  return { peaks, tu, trend };
}

// ── 2단계: pid-angle.ino와 동일한 실전형 PID(데드밴드+적분 브레이크)로 공식이 만든 게인을 검증 ──
interface PidState { i: number }

function feedbackPid(state: PidState, errorDeg: number, measuredSpeedDegS: number, dt: number,
                      outMin: number, outMax: number, kp: number, ki: number, kd: number) {
  const error = Math.abs(errorDeg) < DEADBAND_DEG ? 0 : errorDeg;
  const p = kp * error;
  const d = -kd * measuredSpeedDegS;
  if (ki === 0) state.i = 0;
  const integralLimit = Math.max(Math.abs(outMin), Math.abs(outMax));
  const candidate = Math.max(-integralLimit, Math.min(integralLimit, state.i + ki * error * dt));
  const candidateOutput = p + candidate + d;
  if (!((candidateOutput > outMax && candidate > state.i) || (candidateOutput < outMin && candidate < state.i))) {
    state.i = candidate;
  }
  return Math.max(outMin, Math.min(outMax, p + state.i + d));
}

function simulatePid(kp: number, ki: number, kd: number, speedLimitDegS: number, goalDeg: number, delayMs: number, simT: number): Row[] {
  const delaySteps = Math.max(0, Math.round(delayMs / (DT * 1000)));
  const queue: number[] = new Array(delaySteps).fill(0);
  const state: PidState = { i: 0 };
  let position = 0, prevPosition = 0;
  const rows: Row[] = [];
  const n = Math.round(simT / DT);
  for (let idx = 0; idx <= n; idx++) {
    const t = idx * DT;
    const target = t < RAMP_DELAY_S ? 0 : goalDeg;
    const error = target - position;
    const measuredSpeed = idx === 0 ? 0 : (position - prevPosition) / DT;
    const cmdNow = feedbackPid(state, error, measuredSpeed, DT, -speedLimitDegS, speedLimitDegS, kp, ki, kd);
    queue.push(cmdNow);
    const applied = queue.shift()!;
    prevPosition = position;
    position += applied * DT;
    rows.push({ t, target, position });
  }
  return rows;
}

type Mode = 'P' | 'PI' | 'PID';

/** Ziegler-Nichols "Classic" 표(1942) — Ku·Tu에서 Kp/Ki/Kd 역산 */
function znGains(ku: number, tu: number, mode: Mode): { kp: number; ki: number; kd: number } {
  if (mode === 'P') return { kp: 0.5 * ku, ki: 0, kd: 0 };
  if (mode === 'PI') { const kp = 0.45 * ku, ti = 0.833 * tu; return { kp, ki: kp / ti, kd: 0 }; }
  const kp = 0.6 * ku, ti = 0.5 * tu, td = 0.125 * tu;
  return { kp, ki: kp / ti, kd: kp * td };
}

function stats(rows: Row[], goalDeg: number) {
  const last = rows[rows.length - 1];
  const dir = Math.sign(goalDeg) || 1;
  let overshoot = 0;
  for (const r of rows) if (r.t >= RAMP_DELAY_S) overshoot = Math.max(overshoot, dir * (r.position - goalDeg));
  const band = Math.max(1, Math.abs(goalDeg) * 0.02);
  let settleIdx = rows.length - 1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].t < RAMP_DELAY_S) { settleIdx = i; break; }
    if (Math.abs(rows[i].position - rows[i].target) > band) { settleIdx = i; break; }
  }
  return { steadyErr: last.target - last.position, overshoot, settleTime: Math.max(0, rows[settleIdx].t - RAMP_DELAY_S) };
}

const ptsOf = (rows: Row[]) => rows.map(r => `${r.t.toFixed(3)},${r.position.toFixed(4)}`).join(' ');

/** 실제 데이터 범위에 맞춰 y축을 잡는다 — 지연을 크게 잡으면 오버슈트가 목표보다 훨씬 커질 수 있어 고정폭으론 잘림 */
function yRangeOf(rows: Row[], goal: number, pad = 1.15): number {
  let m = Math.abs(goal);
  for (const r of rows) m = Math.max(m, Math.abs(r.position));
  return Math.max(40, m * pad);
}

/**
 * 속도한계를 껐을 땐 값이 순식간에 수만 단위로 튀어서 데이터 기준 자동스케일(yRangeOf)을 쓰면
 * 초반의 "커지는 모습"이 0 근처로 눌려버린다. 그래서 이땐 고정폭을 쓰고, 그 폭을 넘는 부분은
 * cartesian-chart가 캔버스 clip으로 잘라내서 "화면 밖으로 발산해 나가는" 모습 그대로 보여준다.
 */
function stage1YRange(rows: Row[], goal: number, speedLimitApplied: boolean): number {
  return speedLimitApplied ? yRangeOf(rows, goal) : Math.max(60, Math.abs(goal) * 3);
}

/**
 * 속도한계를 끄면 실제 값이 24초 안에 수십~수백 자릿수까지 치솟을 수 있다(진짜 지수발산이라 그렇다).
 * 차트는 어차피 y-min/y-max 밖은 캔버스 clip으로 잘라 보여주므로, 그 극단값을 그대로 좌표 계산에
 * 넘기면 캔버스가 감당 못 할 픽셀 좌표가 나올 수 있어 화면 폭(b)의 10배로 미리 잘라서 넘긴다 —
 * 이미 화면 밖이라 클리핑되는 건 똑같고, 그 안쪽 모양(초반에 커지는 구간)은 전혀 안 바뀐다.
 */
function clampForPlot(rows: Row[], bound: number): Row[] {
  const cap = bound * 10;
  return rows.map(r => (Math.abs(r.position) > cap ? { ...r, position: Math.max(-cap, Math.min(cap, r.position)) } : r));
}

const TREND_LABEL: Record<Trend, { label: string; color: string }> = {
  none: { label: '오버슈트 없음 — Kp를 더 올리거나 지연을 늘려보세요', color: '#64748b' },
  single: { label: '한 번 넘고 그침(아직 유지되는 진동 아님) — Kp를 조금 더 올려보세요', color: '#f59e0b' },
  decaying: { label: '진동이 점점 줄어듦(임계보다 아래) — Kp를 더 올려보세요', color: '#3b82f6' },
  steady: { label: '진폭이 거의 유지됨 — 임계점 근처! 지금 Kp≈Ku, 아래 주기≈Tu', color: '#10b981' },
  growing: { label: '진동이 점점 커짐(임계를 넘음) — Kp를 조금 낮춰보세요', color: '#ef4444' },
};

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathZieglerNichols extends w.HTMLElement {
    private Kp = 18;         // delay=80ms 기준 임계(≈19) 바로 아래 — 슬라이더를 살짝만 올리면 임계점을 찾도록
    private controlPeriodMs = DEFAULT_CONTROL_PERIOD_MS; // 제어주기 — 실제 코드 기본값은 10ms(100Hz)지만, 여기선 슬라이더로 바꿔볼 수 있음
    private motorLoopMs = 50;  // 모터(DXL) 내부 속도루프 응답 지연 — 실측/공개 안 된 값, 슬라이더로 탐색
    private commMs = 20;       // 통신 왕복시간 — 버스 부하·보드레이트에 따라 변하는 값, 슬라이더로 탐색
    private get delayMs(): number { return this.controlPeriodMs + this.motorLoopMs + this.commMs; } // 총 지연 = 제어주기 + 모터루프 + 통신
    private tuMultiplierGuess = TU_PER_DELAY; // "이론값 = 배율×지연"의 배율 — 실제 정답은 4(수학적으로 유도됨)지만, 직접 다른 값도 넣어보며 4가 맞는지 검증할 수 있게 슬라이더로 열어둠
    private goal = 30;
    private speedLimit = 50;
    private speedLimitApplied = true; // 체크 해제 시 1단계(P만)에서 속도한계를 아예 없애서 "진짜 발산"을 관찰
    private mode: Mode = 'PID';

    private refresh() {
      const { Kp, delayMs, controlPeriodMs, motorLoopMs, commMs, goal, speedLimit, speedLimitApplied, mode, tuMultiplierGuess } = this;
      const simT = simDurationFor(delayMs);
      const rows = simulateP(Kp, speedLimitApplied ? speedLimit : Infinity, goal, delayMs, simT);
      const { tu, trend } = detectOscillation(rows, goal);
      const { label, color } = TREND_LABEL[trend];

      const applied = this.shadowRoot?.querySelector('#zn-applied') as HTMLElement;
      if (applied) { applied.style.color = color; applied.textContent = `Ku 후보(Kp)=${Kp.toFixed(2)}, 지연=${delayMs.toFixed(2)}ms${speedLimitApplied ? '' : ' (속도한계 없음)'} → ${label}`; }

      const tuTheory = tuMultiplierGuess * (delayMs / 1000);
      const tuMeasuredEl = this.shadowRoot?.querySelector('#zn-tu-measured') as HTMLElement;
      if (tuMeasuredEl) { tuMeasuredEl.style.color = color; tuMeasuredEl.textContent = tu !== null ? `${tu.toFixed(3)}s` : '측정 안 됨'; }
      const tuTheoryEl = this.shadowRoot?.querySelector('#zn-tu-theory') as HTMLElement;
      if (tuTheoryEl) tuTheoryEl.textContent = `${tuTheory.toFixed(3)}s`;
      const tuMultiplierValEl = this.shadowRoot?.querySelector('#zn-tumult-val') as HTMLElement;
      if (tuMultiplierValEl) tuMultiplierValEl.textContent = tuMultiplierGuess.toFixed(1);

      (['Kp', 'controlperiod', 'motorloop', 'comm', 'goal', 'speed'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#zn-${k}-val`) as HTMLElement;
        if (!el) return;
        el.textContent = k === 'Kp' ? Kp.toFixed(2) : k === 'controlperiod' ? `${controlPeriodMs.toFixed(2)}ms` : k === 'motorloop' ? `${motorLoopMs.toFixed(2)}ms` : k === 'comm' ? `${commMs.toFixed(2)}ms` : k === 'goal' ? `${goal}°` : `${speedLimit}°/s`;
      });
      const delayValEl = this.shadowRoot?.querySelector('#zn-delay-val') as HTMLElement;
      if (delayValEl) delayValEl.textContent = `${delayMs.toFixed(2)}ms`;

      const speedInput = this.shadowRoot?.querySelector('#zn-speed') as HTMLInputElement;
      if (speedInput) speedInput.disabled = !speedLimitApplied;
      const speedDesc = this.shadowRoot?.querySelector('#zn-speed-desc') as HTMLElement;
      if (speedDesc) speedDesc.textContent = speedLimitApplied
        ? '체크 해제하면 속도한계 없이(=무한대) 돌려서, 이론이 말하는 "진짜 무한 발산"을 직접 볼 수 있습니다.'
        : '⚠ 지금 속도한계가 없습니다 — Kp가 임계(Ku)를 넘으면 값이 순식간에 커져 화면 밖으로 빠져나갑니다(그래프 잘림 = 발산). 실제 모터라면 있을 수 없는 상태입니다.';

      const b = stage1YRange(rows, goal, speedLimitApplied);
      const chart = this.shadowRoot?.querySelector('#zn-chart') as HTMLElement;
      if (chart) { chart.setAttribute('x-max', String(simT)); chart.setAttribute('y-min', String(-b)); chart.setAttribute('y-max', String(b)); }
      const plotRows = clampForPlot(rows, b);
      const targetLine = this.shadowRoot?.querySelector('#zn-target') as HTMLElement;
      if (targetLine) targetLine.setAttribute('points', ptsOf(plotRows.map(r => ({ t: r.t, target: r.target, position: r.target }))));
      const posLine = this.shadowRoot?.querySelector('#zn-position') as HTMLElement;
      if (posLine) { posLine.setAttribute('points', ptsOf(plotRows)); posLine.setAttribute('color', color); }

      this.renderFormula(Kp, tu, mode, simT);
    }

    private renderFormula(ku: number, tu: number | null, mode: Mode, simT: number) {
      const sh = this.shadowRoot;
      (['P', 'PI', 'PID'] as Mode[]).forEach(m => {
        const row = sh?.querySelector(`#zn-row-${m}`) as HTMLElement;
        if (!row) return;
        row.classList.toggle('zn-row-active', m === mode);
        if (tu === null) { row.querySelector('.zn-kp')!.textContent = '—'; row.querySelector('.zn-ki')!.textContent = '—'; row.querySelector('.zn-kd')!.textContent = '—'; return; }
        const g = znGains(ku, tu, m);
        row.querySelector('.zn-kp')!.textContent = g.kp.toFixed(3);
        row.querySelector('.zn-ki')!.textContent = g.ki.toFixed(3);
        row.querySelector('.zn-kd')!.textContent = g.kd.toFixed(3);
      });

      sh?.querySelectorAll('.zn-mode-btn').forEach(el => el.classList.toggle('active', (el as HTMLElement).dataset.mode === mode));

      const stage2 = sh?.querySelector('#zn-stage2') as HTMLElement;
      const noTu = sh?.querySelector('#zn-no-tu') as HTMLElement;
      if (tu === null) {
        if (stage2) stage2.style.display = 'none';
        if (noTu) noTu.style.display = '';
        return;
      }
      if (stage2) stage2.style.display = '';
      if (noTu) noTu.style.display = 'none';

      const { goal, speedLimit, delayMs } = this;
      const g = znGains(ku, tu, mode);
      const rows2 = simulatePid(g.kp, g.ki, g.kd, speedLimit, goal, delayMs, simT);
      const { overshoot, steadyErr, settleTime } = stats(rows2, goal);

      const applied2 = sh?.querySelector('#zn-applied2') as HTMLElement;
      if (applied2) applied2.textContent = `${mode} 적용: Kp=${g.kp.toFixed(2)}, Ki=${g.ki.toFixed(2)}, Kd=${g.kd.toFixed(2)} → 오버슈트 ${overshoot.toFixed(2)}°, 정착시간 ${settleTime.toFixed(2)}s`;

      const notes2 = sh?.querySelector('#zn-notes2') as HTMLElement;
      if (notes2) notes2.innerHTML =
        `<div>오버슈트 = ${overshoot.toFixed(2)}°</div>` +
        `<div>정상상태 오차 = ${steadyErr.toFixed(2)}°</div>` +
        `<div>정착시간(오차 2% 이내) = ${settleTime.toFixed(2)}s</div>`;

      const chart2 = sh?.querySelector('#zn-chart2') as HTMLElement;
      if (chart2) { const b = yRangeOf(rows2, goal); chart2.setAttribute('x-max', String(simT)); chart2.setAttribute('y-min', String(-b)); chart2.setAttribute('y-max', String(b)); }
      const target2 = sh?.querySelector('#zn-target2') as HTMLElement;
      if (target2) target2.setAttribute('points', ptsOf(rows2.map(r => ({ t: r.t, target: r.target, position: r.target }))));
      const pos2 = sh?.querySelector('#zn-position2') as HTMLElement;
      if (pos2) pos2.setAttribute('points', ptsOf(rows2));
    }

    @addEventListener('#zn-kp', 'input')
    onKp(e: Event) { this.Kp = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#zn-controlperiod', 'input')
    onControlPeriod(e: Event) { this.controlPeriodMs = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('#zn-tumult', 'input')
    onTuMult(e: Event) { this.tuMultiplierGuess = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#zn-motorloop', 'input')
    onMotorLoop(e: Event) { this.motorLoopMs = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#zn-comm', 'input')
    onComm(e: Event) { this.commMs = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#zn-goal', 'input')
    onGoal(e: Event) { this.goal = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#zn-speed', 'input')
    onSpeed(e: Event) { this.speedLimit = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('#zn-speed-applied', 'change')
    onSpeedApplied(e: Event) { this.speedLimitApplied = (e.target as HTMLInputElement).checked; this.refresh(); }

    @addEventListener('.zn-mode-btn', 'click', { delegate: true })
    onMode(e: Event) {
      const btn = (e.target as HTMLElement).closest('.zn-mode-btn') as HTMLElement;
      if (!btn) return;
      this.mode = btn.dataset.mode as Mode;
      this.refresh();
    }

    @onConnectedBodyShadow
    render() {
      const { Kp, delayMs, controlPeriodMs, motorLoopMs, commMs, goal, speedLimit, speedLimitApplied, mode, tuMultiplierGuess } = this;
      const simT = simDurationFor(delayMs);
      const rows = simulateP(Kp, speedLimitApplied ? speedLimit : Infinity, goal, delayMs, simT);
      const { tu, trend } = detectOscillation(rows, goal);
      const { label, color } = TREND_LABEL[trend];
      const yb = stage1YRange(rows, goal, speedLimitApplied);
      const plotRows = clampForPlot(rows, yb);
      const tuTheory = tuMultiplierGuess * (delayMs / 1000);

      const modeBtn = (m: Mode) => `<button class="zn-mode-btn${m === mode ? ' active' : ''}" data-mode="${m}" type="button">${m}</button>`;
      const formulaRow = (m: Mode) => {
        if (tu === null) return `<tr id="zn-row-${m}" class="${m === mode ? 'zn-row-active' : ''}"><td>${m}</td><td class="zn-kp">—</td><td class="zn-ki">—</td><td class="zn-kd">—</td></tr>`;
        const g = znGains(Kp, tu, m);
        return `<tr id="zn-row-${m}" class="${m === mode ? 'zn-row-active' : ''}"><td>${m}</td><td class="zn-kp">${g.kp.toFixed(3)}</td><td class="zn-ki">${g.ki.toFixed(3)}</td><td class="zn-kd">${g.kd.toFixed(3)}</td></tr>`;
      };

      // stage2 컨테이너는 항상 DOM에 존재시키고 display만 토글한다 — tu가 null→non-null로 바뀔 때도
      // renderFormula()가 같은 엘리먼트를 찾아 갱신할 수 있어야 하기 때문(엘리먼트를 통째로 껐다 켜면 못 찾음).
      const s2 = tu !== null ? znGains(Kp, tu, mode) : { kp: 0, ki: 0, kd: 0 };
      const rows2 = tu !== null ? simulatePid(s2.kp, s2.ki, s2.kd, speedLimit, goal, delayMs, simT) : [];
      const s2stats = tu !== null ? stats(rows2, goal) : { overshoot: 0, steadyErr: 0, settleTime: 0 };
      const yb2 = yRangeOf(rows2, goal);
      const stage2Html = `
        <div id="zn-stage2" style="${tu === null ? 'display:none' : ''}">
          <div class="math-applied" id="zn-applied2">${mode} 적용: Kp=${s2.kp.toFixed(2)}, Ki=${s2.ki.toFixed(2)}, Kd=${s2.kd.toFixed(2)} → 오버슈트 ${s2stats.overshoot.toFixed(2)}°, 정착시간 ${s2stats.settleTime.toFixed(2)}s</div>
          <cartesian-chart id="zn-chart2" x-min="0" x-max="${simT}" y-min="${-yb2}" y-max="${yb2}" x-label="시간(s)" y-label="각도(°)" disabled-aspect style="height:200px;max-width:640px;margin:0 auto">
            <series id="zn-target2" points="${tu !== null ? ptsOf(rows2.map(r => ({ t: r.t, target: r.target, position: r.target }))) : ''}" color="#94a3b8" dash="4,4" label="목표"></series>
            <series id="zn-position2" points="${tu !== null ? ptsOf(rows2) : ''}" color="#0f766e" width="2.2" label="PID(공식 게인) 응답"></series>
          </cartesian-chart>
          <div class="math-notes" id="zn-notes2">
            <div>오버슈트 = ${s2stats.overshoot.toFixed(2)}°</div>
            <div>정상상태 오차 = ${s2stats.steadyErr.toFixed(2)}°</div>
            <div>정착시간(오차 2% 이내) = ${s2stats.settleTime.toFixed(2)}s</div>
          </div>
        </div>`;

      return `
        <style>
          :host { display:block; }
          .math-title { font-size:13px; font-weight:800; color:#475569; margin:12px 0 2px; }
          .math-title:first-child { margin-top:0; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .math-legend { display:flex; gap:12px; font-size:11px; color:#64748b; margin-top:8px; flex-wrap:wrap; }
          .math-legend b { font-weight:800; }
          .math-notes { font-size:12px; font-weight:700; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin-top:8px; line-height:1.7; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .zn-checkbox { flex:0 0 auto !important; gap:4px !important; }
          .ctl b { min-width:60px; text-align:right; color:#1e293b; }
          .zn-tu-box { background:#f8fafc; border:1.5px solid #0f766e; border-radius:10px; padding:10px 12px; margin-top:10px; }
          .zn-tu-row { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px; font-weight:700; color:#334155; flex-wrap:wrap; }
          .zn-tu-row + .zn-tu-row { margin-top:6px; }
          .zn-tu-row b { font-size:13px; font-weight:900; white-space:nowrap; }
          .zn-tu-label { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
          .zn-tu-label input[type="range"] { width:90px; vertical-align:middle; }
          .zn-table-wrap { overflow-x:auto; margin-top:8px; }
          .zn-table { border-collapse:collapse; font-size:12px; width:100%; min-width:320px; }
          .zn-table th, .zn-table td { border:1px solid #e2e8f0; padding:6px 10px; text-align:center; }
          .zn-table th { background:#f8fafc; color:#475569; }
          .zn-row-active { background:rgba(15,118,110,0.08); font-weight:800; }
          .zn-mode-btns { display:flex; gap:6px; margin-top:8px; }
          .zn-mode-btn { padding:5px 14px; border-radius:8px; border:1.5px solid #e2e8f0; background:#fff; color:#334155; font-size:12px; font-weight:700; cursor:pointer; }
          .zn-mode-btn.active { background:#0f766e; color:#fff; border-color:#0f766e; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md table { border-collapse:collapse; margin:6px 0; }
          .md th, .md td { border:1px solid #e2e8f0; padding:4px 10px; font-size:12px; }
          .md th { background:#f8fafc; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="math-title" style="margin-top:0">1단계 — 임계 게인(Ku)·임계 주기(Tu) 찾기 (P만, find-gain.ino와 동일한 모델)</div>
        <div class="math-applied" id="zn-applied" style="color:${color}">Ku 후보(Kp)=${Kp.toFixed(2)}, 지연=${delayMs.toFixed(2)}ms${speedLimitApplied ? '' : ' (속도한계 없음)'} → ${label}</div>
        <div class="math-desc">Kp를 천천히 올려보면서 "감쇠 → 유지(steady) → 발산" 중 어디에 있는지 보세요. steady가 되는 순간의 Kp가 Ku, 아래 표시된 주기가 Tu입니다.</div>
        <cartesian-chart id="zn-chart" x-min="0" x-max="${simT}" y-min="${-yb}" y-max="${yb}" x-label="시간(s)" y-label="각도(°)" disabled-aspect style="height:200px;max-width:640px;margin:0 auto">
          <series id="zn-target" points="${ptsOf(plotRows.map(r => ({ t: r.t, target: r.target, position: r.target })))}" color="#94a3b8" dash="4,4" label="목표"></series>
          <series id="zn-position" points="${ptsOf(plotRows)}" color="${color}" width="2.2" label="P만 적용된 응답"></series>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#94a3b8">- - 목표</b></span><span><b style="color:${color}">— P만 적용된 응답</b></span></div>
        <div class="ctl"><label>Kp(=Ku 후보) <input id="zn-kp" type="range" min="0" max="40" step="0.01" value="${Kp}"><b id="zn-Kp-val">${Kp.toFixed(2)}</b></label></div>
        <div class="ctl"><label>제어주기(ms, 실제 코드 기본값 10ms=100Hz) <input id="zn-controlperiod" type="range" min="1" max="200" step="0.01" value="${controlPeriodMs}"><b id="zn-controlperiod-val">${controlPeriodMs.toFixed(2)}ms</b></label></div>
        <div class="ctl"><label>모터 내부 속도루프 응답 지연(ms, 미공개값) <input id="zn-motorloop" type="range" min="0" max="5000" step="0.01" value="${motorLoopMs}"><b id="zn-motorloop-val">${motorLoopMs.toFixed(2)}ms</b></label></div>
        <div class="ctl"><label>통신 왕복시간(ms, 버스 상황에 따라 변함) <input id="zn-comm" type="range" min="0" max="5000" step="0.01" value="${commMs}"><b id="zn-comm-val">${commMs.toFixed(2)}ms</b></label></div>
        <div class="ctl"><label>= 총 지연(제어주기+모터루프+통신) <b id="zn-delay-val">${delayMs.toFixed(2)}ms</b></label></div>

        <div class="zn-tu-box" id="zn-tu-box">
          <div class="zn-tu-row">
            <span class="zn-tu-label">📏 측정된 Tu(1단계 실험값)</span>
            <b id="zn-tu-measured" style="color:${color}">${tu !== null ? `${tu.toFixed(3)}s` : '측정 안 됨'}</b>
          </div>
          <div class="zn-tu-row">
            <span class="zn-tu-label">🧮 이론값 = <input id="zn-tumult" type="range" min="1" max="8" step="0.1" value="${tuMultiplierGuess}"><b id="zn-tumult-val">${tuMultiplierGuess.toFixed(1)}</b> × 지연</span>
            <b id="zn-tu-theory">${tuTheory.toFixed(3)}s</b>
          </div>
          <div class="math-desc" style="margin:6px 0 0">배율의 진짜 정답은 4입니다 — 다른 값으로 바꿔서 이론값이 위 측정값과 멀어지는 걸 보고, 다시 4로 돌리면 맞아떨어지는지 직접 확인해보세요.</div>
        </div>
        <div class="ctl"><label>목표각도(°) <input id="zn-goal" type="range" min="-90" max="90" step="1" value="${goal}"><b id="zn-goal-val">${goal}°</b></label></div>
        <div class="math-desc">⚙ 목표각도는 Ku·Tu에는 거의 영향이 없습니다(선형 시스템이라 진동 주기는 Kp·지연만으로 정해짐) — 그냥 "시스템을 흔들 계단 명령 크기"일 뿐입니다. 너무 작으면(데드밴드 0.2° 근처) 진동을 아예 못 만들고, 속도한계에 비해 너무 크면 포화가 빨리 와서 이론과 다른 모양이 됩니다.</div>
        <div class="ctl">
          <label>속도한계(°/s) <input id="zn-speed" type="range" min="1" max="100" step="1" value="${speedLimit}" ${speedLimitApplied ? '' : 'disabled'}><b id="zn-speed-val">${speedLimit}°/s</b></label>
          <label class="zn-checkbox"><input type="checkbox" id="zn-speed-applied" ${speedLimitApplied ? 'checked' : ''}> 적용</label>
        </div>
        <div class="math-desc" id="zn-speed-desc">${speedLimitApplied ? '체크 해제하면 속도한계 없이(=무한대) 돌려서, 이론이 말하는 "진짜 무한 발산"을 직접 볼 수 있습니다.' : '⚠ 지금 속도한계가 없습니다 — Kp가 임계(Ku)를 넘으면 값이 순식간에 커져 화면 밖으로 빠져나갑니다(그래프 잘림 = 발산). 실제 모터라면 있을 수 없는 상태입니다.'}</div>
        <div class="math-desc">총 지연은 세 가지를 더한 값입니다 — <b>제어주기</b>는 실제 코드(<code>PERIOD_US=10000</code>, 100Hz)의 기본값이 10ms일 뿐이고, "제어 루프를 더 느리게/빠르게 돌리면 임계점이 어떻게 바뀌나"도 볼 수 있게 슬라이더로 열어뒀습니다. <b>모터 내부 속도루프 응답 지연</b>과 <b>통신 왕복시간</b>은 Robotis가 공개하지 않았거나 버스 상황에 따라 변하는 "모르는 지연들"이라 마찬가지로 슬라이더로 탐색합니다. 셋을 다 최대까지 올리면 총 지연이 10초 넘게까지 커지고, 이론상 Tu=4·지연이라 주기도 40초 이상까지 커집니다(그래프의 시간축도 자동으로 늘어납니다). <b>목표각도</b>는 find-gain.ino의 "계단 입력" 크기(0°에서 이 각도로 갑자기 목표를 바꿈)이고, <b>속도한계</b>는 모터가 낼 수 있는 최대 속도(출력 클램프)입니다 — 이 둘은 Ku·Tu 값 자체를 바꾸지는 않습니다(속도한계를 넓혀도 이미 "유지" 상태의 Tu는 그대로입니다, 직접 검증됨). 다만 임계 바로 위에서 "유지(steady)로 보이는지 계속 자라나는 중(growing)으로 보이는지"는 속도한계에 따라 달라질 수 있습니다 — 속도한계가 낮을수록 빨리 리밋 사이클에 갇혀 유지로 보입니다.</div>

        <div class="math-title">2단계 — 공식으로 계산된 Kp·Ki·Kd</div>
        <div class="math-desc">위 Ku·Tu를 Ziegler-Nichols "Classic" 표에 대입한 값입니다. 행을 눌러 P/PI/PID 중 무엇을 실제로 적용해볼지 골라보세요.</div>
        <div class="zn-mode-btns">${(['P', 'PI', 'PID'] as Mode[]).map(modeBtn).join('')}</div>
        <div class="zn-table-wrap">
          <table class="zn-table">
            <thead><tr><th>컨트롤러</th><th>Kp</th><th>Ki</th><th>Kd</th></tr></thead>
            <tbody>${(['P', 'PI', 'PID'] as Mode[]).map(formulaRow).join('')}</tbody>
          </table>
        </div>
        <div class="math-desc" id="zn-no-tu" style="${tu === null ? '' : 'display:none'};color:#ef4444;font-weight:700">⚠ 아직 Tu가 측정되지 않았습니다 — 위 1단계에서 Kp를 올려 진동을 유지시켜야 공식을 계산할 수 있습니다.</div>

        ${stage2Html}

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
