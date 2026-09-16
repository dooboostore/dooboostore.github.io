import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-pid-angle';

// pid-angle.ino의 feedbackPid()/loop()를 그대로 옮긴 상수들 (도(deg) 단위로 환산)
const DEADBAND_DEG = 0.2;      // DEADBAND_RAD = 0.2° — 이보다 작은 오차는 0으로 취급
const RAMP_DELAY_S = 2;        // elapsed_ms < 2000 → target 0 (첫 2초는 0도에서 대기)
const DT = 0.01;               // PERIOD_US=10000 → 100Hz 제어 주기
const SIM_T = 14;              // 시뮬레이션 길이(초) — 2s 대기 + 12s 응답 관찰
const N = Math.round(SIM_T / DT);

const MD = `
## 이 로봇이 하는 일 (쉽게)
1. 사람이 "몇 도까지 가!"(목표각도)라고 명령합니다.
2. 로봇은 "지금 각도"와 "목표 각도"의 차이(오차)를 계속 잽니다.
3. 그 오차를 보고 **"얼마나 빨리 돌아야 할지"(속도)** 를 계산해서 모터에 명령합니다 — 이게 PID입니다.
4. 오차가 0에 가까워질수록 속도도 점점 줄어들어서, 목표에 살살 도착합니다.

## P·I·D 각각 뭘 하나요?
- **P(비례)** = "많이 벗어났으면 빨리 가, 조금 벗어났으면 천천히 가." 오차에 비례해서 속도를 냅니다.
- **I(적분)** = "그런데 아무리 가도 미세하게 계속 덜 도착하면?" — 그 작은 차이를 계속 더해가면서 조금씩 더 밀어줘서 결국 정확히 도착하게 만듭니다.
- **D(미분)** = "너무 빨리 다가가고 있으면 미리 브레이크." 지금 모터 속도를 보고 급하게 움직이는 걸 미리 눌러서 덜 흔들리게 합니다.
- 실제 코드는 D를 계산할 때 "오차가 변하는 속도"가 아니라 **모터가 실제로 재는 속도**를 씁니다 — 목표가 갑자기 바뀌는 순간에 속도 계산이 확 튀는 걸("미분 킥") 피하기 위해서입니다.

## 로봇 코드에만 있는 안전장치 2가지
- **데드밴드**: 오차가 0.2°보다 작으면 그냥 "다 왔다"고 보고 멈춥니다 — 센서가 미세하게 떠는 걸 진짜 오차로 착각해서 계속 미세하게 흔들리는 걸 막아줍니다.
- **적분 브레이크(anti-windup)**: 이미 최고 속도로 가고 있는데 I가 "더! 더!"하고 계속 쌓이면, 나중에 속도 제한이 풀렸을 때 너무 세게 튀어나갑니다. 그래서 이미 최고 속도인데 I가 그걸 더 키우려고 하면, 그 순간만 I를 잠깐 멈춰서(=쌓지 않고) 나중에 크게 오버슈트하는 걸 막습니다.

## 기타
- 처음 2초는 일부러 목표를 0°로 유지합니다 — 갑자기 급발진하지 않고, 관찰이 안정된 뒤에 "계단식으로" 목표를 주기 위해서입니다.
- **"PID 제어"** 페이지의 기본 공식(\`u=Kp·e+Ki∫e+Kd·de/dt\`)과 비교하면, 이 실제 로봇 코드는 위 안전장치 2가지가 추가된 실전형 버전입니다.
- **⚠ 가정 한 가지**: 이 시뮬레이터는 "PID가 명령한 속도 = 모터가 바로 그대로 내는 속도"라고 가정합니다(모터 내부 속도 제어가 아주 빠르다고 단순화). 실제로는 모터 자체가 그 속도를 내기까지 약간의 시간차가 더 있습니다.
- **어디에 쓰이나요?** — 로봇 팔·드론 자세 제어, 서보모터 위치 제어 전반. 게인을 직접 튜닝하는 감각은 **"게인(이득)"** 페이지와도 이어집니다.
`;

interface PidState { i: number }

/** pid-angle.ino의 feedbackPid()를 그대로 옮김 (rad → deg 단위만 바꿈) */
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
  const output = Math.max(outMin, Math.min(outMax, p + state.i + d));
  return { output, p, i: state.i, d };
}

interface Row { t: number; target: number; position: number; error: number; p: number; i: number; d: number; output: number }

/** loop()를 흉내낸 시뮬레이션. ponytail: 모터 속도응답을 이상적(즉시 추종)으로 가정 — 실측 지연 반영은 필요해지면 1차 지연 추가. */
function simulate(kp: number, ki: number, kd: number, goalDeg: number, speedLimitDegS: number): Row[] {
  const state: PidState = { i: 0 };
  let position = 0, prevPosition = 0;
  const rows: Row[] = [];
  for (let idx = 0; idx <= N; idx++) {
    const t = idx * DT;
    const target = t < RAMP_DELAY_S ? 0 : goalDeg;
    const error = target - position;
    const measuredSpeed = idx === 0 ? 0 : (position - prevPosition) / DT;
    const { output, p, i, d } = feedbackPid(state, error, measuredSpeed, DT, -speedLimitDegS, speedLimitDegS, kp, ki, kd);
    rows.push({ t, target, position, error, p, i, d, output });
    prevPosition = position;
    position += output * DT;
  }
  return rows;
}

function statusOf(overshoot: number, steadyErr: number, goalDeg: number) {
  const good = overshoot < Math.abs(goalDeg) * 0.1 + 1 && Math.abs(steadyErr) < 1;
  const bad = Math.abs(steadyErr) > 5;
  const color = good ? '#10b981' : bad ? '#ef4444' : '#f59e0b';
  const label = good ? '👍 좋음 — 목표에 잘 도착했어요' : bad ? '🔴 많이 벗어남 — Kp를 낮추거나 Ki를 올려보세요' : '🟡 흔들림 있음 — 조금 더 다듬어보세요';
  return { color, label };
}

function stats(rows: Row[], goalDeg: number) {
  const last = rows[rows.length - 1];
  const dir = Math.sign(goalDeg) || 1;
  let overshoot = 0;
  for (const r of rows) { if (r.t >= RAMP_DELAY_S) overshoot = Math.max(overshoot, dir * (r.position - goalDeg)); }
  const band = Math.max(1, Math.abs(goalDeg) * 0.02);
  let settleIdx = rows.length - 1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].t < RAMP_DELAY_S) { settleIdx = i; break; }
    if (Math.abs(rows[i].position - rows[i].target) > band) { settleIdx = i; break; }
  }
  return { steadyErr: last.target - last.position, overshoot, settleTime: Math.max(0, rows[settleIdx].t - RAMP_DELAY_S) };
}

const ptsOf = (rows: Row[], key: 'target' | 'position' | 'p' | 'i' | 'd' | 'output') =>
  rows.map(r => `${r.t.toFixed(3)},${r[key].toFixed(4)}`).join(' ');

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathPidAngle extends w.HTMLElement {
    private Kp = 0.5;   // pid-angle.ino 기본값
    private Ki = 0;
    private Kd = 0;
    private speedLimit = 20; // deg/s, DEFAULT_SPEED_RAD_S=20°/s
    private goal = 90;       // deg, goal_rad 기본값

    private refresh() {
      const { Kp, Ki, Kd, speedLimit, goal } = this;
      const rows = simulate(Kp, Ki, Kd, goal, speedLimit);
      const { overshoot, steadyErr, settleTime } = stats(rows, goal);
      const { color, label } = statusOf(overshoot, steadyErr, goal);

      const applied = this.shadowRoot?.querySelector('#pa-applied') as HTMLElement;
      if (applied) { applied.style.color = color; applied.textContent = `지금 상태: ${label}`; }

      const notes = this.shadowRoot?.querySelector('#pa-notes') as HTMLElement;
      if (notes) notes.innerHTML =
        `<div>목표를 지나친 정도(오버슈트) = ${overshoot.toFixed(2)}°</div>` +
        `<div>끝까지 남은 오차(정상상태 오차) = ${steadyErr.toFixed(2)}° ${Math.abs(steadyErr) < 0.5 ? '(거의 0, 정확히 도착)' : Ki === 0 ? '(I가 0이라 아주 조금 못 미침 — Ki를 올려보세요)' : ''}</div>` +
        `<div>목표 근처(오차 2% 이내)에 자리잡기까지 걸린 시간 = ${settleTime.toFixed(2)}s</div>` +
        `<div>사용한 값: Kp=${Kp.toFixed(2)}, Ki=${Ki.toFixed(2)}, Kd=${Kd.toFixed(2)}, 속도한계=${speedLimit}°/s, 목표=${goal}°</div>`;

      (['Kp', 'Ki', 'Kd'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#pa-${k}-val`) as HTMLElement;
        if (el) el.textContent = this[k].toFixed(2);
      });
      const spVal = this.shadowRoot?.querySelector('#pa-speed-val') as HTMLElement;
      if (spVal) spVal.textContent = `${speedLimit}°/s`;
      const goalVal = this.shadowRoot?.querySelector('#pa-goal-val') as HTMLElement;
      if (goalVal) goalVal.textContent = `${goal}°`;

      const chart = this.shadowRoot?.querySelector('#pa-chart') as HTMLElement;
      if (chart) { const b = Math.max(100, Math.abs(goal) * 1.2); chart.setAttribute('y-min', String(-b)); chart.setAttribute('y-max', String(b)); }
      const targetLine = this.shadowRoot?.querySelector('#pa-target') as HTMLElement;
      if (targetLine) targetLine.setAttribute('points', ptsOf(rows, 'target'));
      const posLine = this.shadowRoot?.querySelector('#pa-position') as HTMLElement;
      if (posLine) { posLine.setAttribute('points', ptsOf(rows, 'position')); posLine.setAttribute('color', color); }

      const pidChart = this.shadowRoot?.querySelector('#pa-pid-chart') as HTMLElement;
      if (pidChart) { const b = speedLimit * 1.2; pidChart.setAttribute('y-min', String(-b)); pidChart.setAttribute('y-max', String(b)); }
      const pLine = this.shadowRoot?.querySelector('#pa-p') as HTMLElement;
      if (pLine) pLine.setAttribute('points', ptsOf(rows, 'p'));
      const iLine = this.shadowRoot?.querySelector('#pa-i') as HTMLElement;
      if (iLine) iLine.setAttribute('points', ptsOf(rows, 'i'));
      const dLine = this.shadowRoot?.querySelector('#pa-d') as HTMLElement;
      if (dLine) dLine.setAttribute('points', ptsOf(rows, 'd'));
      const outLine = this.shadowRoot?.querySelector('#pa-out') as HTMLElement;
      if (outLine) outLine.setAttribute('points', ptsOf(rows, 'output'));
    }

    @addEventListener('#pa-kp', 'input')
    onKp(e: Event) { this.Kp = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#pa-ki', 'input')
    onKi(e: Event) { this.Ki = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#pa-kd', 'input')
    onKd(e: Event) { this.Kd = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#pa-speed', 'input')
    onSpeed(e: Event) { this.speedLimit = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('#pa-goal', 'input')
    onGoal(e: Event) { this.goal = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { Kp, Ki, Kd, speedLimit, goal } = this;
      const rows = simulate(Kp, Ki, Kd, goal, speedLimit);
      const { overshoot, steadyErr, settleTime } = stats(rows, goal);
      const { color, label } = statusOf(overshoot, steadyErr, goal);
      const yb = Math.max(100, Math.abs(goal) * 1.2);
      const pyb = speedLimit * 1.2;
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
          .ctl b { min-width:60px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-desc">로봇 팔이 목표 각도까지 움직이는 걸 보여주는 시뮬레이터예요. Kp·Ki·Kd 슬라이더를 바꾸면, 로봇이 얼마나 빨리·얼마나 흔들리면서·얼마나 정확하게 목표에 도착하는지가 달라집니다. 실제 로봇 코드(pid-angle.ino)의 계산식을 그대로 옮겨왔습니다.</div>
        <div class="math-applied" id="pa-applied" style="color:${color}">지금 상태: ${label}</div>
        <div class="math-desc">기본값(Kp=0.5, Ki=Kd=0, 속도한계 20°/s, 목표 90°)은 실제 로봇 코드가 켜질 때 값과 같습니다. 처음 2초는 그냥 0°에서 기다리다가, 그 뒤에 목표 각도로 "가!" 신호가 갑니다.</div>
        <cartesian-chart id="pa-chart" x-min="0" x-max="${SIM_T}" y-min="${-yb}" y-max="${yb}" x-label="시간(s)" y-label="각도(°)" disabled-aspect style="height:200px;max-width:640px;margin:0 auto">
          <series id="pa-target" points="${ptsOf(rows, 'target')}" color="#94a3b8" dash="4,4" label="목표 각도"></series>
          <series id="pa-position" points="${ptsOf(rows, 'position')}" color="${color}" width="2.2" label="지금 각도"></series>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#94a3b8">- - 목표 각도</b></span><span><b style="color:${color}">— 지금(실제) 각도</b></span></div>
        <div class="ctl"><label>Kp (비례 — 빨리 반응) <input id="pa-kp" type="range" min="0" max="5" step="0.05" value="${Kp}"><b id="pa-Kp-val">${Kp.toFixed(2)}</b></label></div>
        <div class="ctl"><label>Ki (적분 — 끝까지 정확히) <input id="pa-ki" type="range" min="0" max="2" step="0.02" value="${Ki}"><b id="pa-Ki-val">${Ki.toFixed(2)}</b></label></div>
        <div class="ctl"><label>Kd (미분 — 흔들림 억제) <input id="pa-kd" type="range" min="0" max="1" step="0.01" value="${Kd}"><b id="pa-Kd-val">${Kd.toFixed(2)}</b></label></div>
        <div class="ctl"><label>속도한계(°/s) <input id="pa-speed" type="range" min="1" max="100" step="1" value="${speedLimit}"><b id="pa-speed-val">${speedLimit}°/s</b></label></div>
        <div class="ctl"><label>목표각도(°) <input id="pa-goal" type="range" min="-90" max="90" step="1" value="${goal}"><b id="pa-goal-val">${goal}°</b></label></div>
        <div class="math-notes" id="pa-notes">
          <div>목표를 지나친 정도(오버슈트) = ${overshoot.toFixed(2)}°</div>
          <div>끝까지 남은 오차(정상상태 오차) = ${steadyErr.toFixed(2)}° ${Math.abs(steadyErr) < 0.5 ? '(거의 0, 정확히 도착)' : Ki === 0 ? '(I가 0이라 아주 조금 못 미침 — Ki를 올려보세요)' : ''}</div>
          <div>목표 근처(오차 2% 이내)에 자리잡기까지 걸린 시간 = ${settleTime.toFixed(2)}s</div>
          <div>사용한 값: Kp=${Kp.toFixed(2)}, Ki=${Ki.toFixed(2)}, Kd=${Kd.toFixed(2)}, 속도한계=${speedLimit}°/s, 목표=${goal}°</div>
        </div>

        <div class="math-title">P·I·D가 각각 얼마나 기여했는지 (실제 로봇이 찍는 로그와 같은 값)</div>
        <div class="math-desc">셋을 더한 값(검정 점선)이 실제로 모터에 보내는 속도 명령이고, 속도한계를 넘으면 거기서 잘립니다.</div>
        <cartesian-chart id="pa-pid-chart" x-min="0" x-max="${SIM_T}" y-min="${-pyb}" y-max="${pyb}" x-label="시간(s)" y-label="속도 명령(°/s)" disabled-aspect style="height:160px;max-width:640px;margin:0 auto">
          <series id="pa-p" points="${ptsOf(rows, 'p')}" color="#6366f1" width="1.8" label="P 성분"></series>
          <series id="pa-i" points="${ptsOf(rows, 'i')}" color="#a855f7" width="1.8" label="I 성분"></series>
          <series id="pa-d" points="${ptsOf(rows, 'd')}" color="#f59e0b" width="1.8" label="D 성분"></series>
          <series id="pa-out" points="${ptsOf(rows, 'output')}" color="#0f172a" dash="3,2" width="1.4" label="최종 속도 명령(P+I+D, 한계로 클램프)"></series>
        </cartesian-chart>
        <div class="math-legend">
          <span><b style="color:#6366f1">— P</b></span><span><b style="color:#a855f7">— I</b></span><span><b style="color:#f59e0b">— D</b></span><span><b style="color:#0f172a">- - 최종 속도 명령</b></span>
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
