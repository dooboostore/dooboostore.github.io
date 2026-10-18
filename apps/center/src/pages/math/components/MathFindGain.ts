import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-find-gain';

// find-gain.ino 상수 (도(deg) 단위로 환산)
const DEADBAND_DEG = 0.2;
const RAMP_DELAY_S = 2;
const DT = 0.01;   // PERIOD_US=10000 → 100Hz
const SIM_T = 10;
const N = Math.round(SIM_T / DT);

const MD = `
## find-gain.ino — "P만으로도 진동이 생길 수 있다"를 직접 확인하는 스케치
- \`pid-angle.ino\`보다 더 단순한 버전: **I, D 없이 P 하나만** 있습니다(\`speed = kp * error_rad\`, find-gain.ino:265).
- 헤더 주석에 있는 이 스케치의 핵심 이론:
  - 모터가 속도 명령을 **이상적으로 그대로** 따른다고 가정하면 \`dx/dt = -kp·x\`(x=오차)인 1차 미분방정식.
  - 라플라스로 보면 극점이 \`s = -kp\` **하나, 실수축 위에만** 있습니다 — 허수부가 없으니 **이론상 kp를 아무리 올려도 진동(오버슈트)은 절대 안 생깁니다.** kp가 클수록 그냥 더 빨리 수렴할 뿐입니다.
  - 그런데 **실제로 sweep 해보면 kp를 많이 올렸을 때 진동이 보일 수 있습니다.** 이 단순 1차 모델에 없는 지연 요소들 — 100Hz 제어주기(10ms), DXL 내부 속도루프 응답 지연, 통신 왕복시간 — 때문입니다. 지연이 있는 1차 시스템은 사실상 더 높은 차수 시스템처럼 행동해서, 극점이 복소평면으로 밀려나(허수부가 생겨) 진동이 나타날 수 있습니다.
- 그래서 이 스케치가 실제로 하는 일: 그 지연들을 전부 수식으로 모델링해서 극점을 계산하는 대신, **kp를 바꿔가며 실제 응답(오버슈트 있는지, 정착시간)을 눈으로 보고, 극점이 실수축 근처(진동 없음)에 머무는 가장 큰 kp를 찾는 것** — 경험적 튜닝으로 해석적 계산을 대신합니다.
- 이 페이지의 **"지연(ms)"** 슬라이더가 바로 그 "모르는 지연들"을 하나로 합친 값입니다. 지연=0으로 두면(이론과 똑같이) kp를 아무리 올려도 절대 진동하지 않는 걸 확인하고, 지연을 올린 채로 kp를 올려보면 실제 하드웨어에서 보이는 것과 같은 진동이 나타나는 걸 볼 수 있습니다.
- 파일 헤더의 예시 명령: \`s 5 50 30\`(kp=5, 속도한계 50°/s, 목표 30°), \`s 2 60 30\`.
- **"근궤적(Root Locus)"** 페이지와 같은 이야기입니다 — 거기선 게인 K를 올릴수록 극점이 이동하다 허수축을 넘는 걸 봤는데, 여기서는 "게인"이 아니라 "지연"이 그 역할을 합니다. **"PID 각도제어(실제 로봇코드)"** 페이지가 이 스케치의 다음 버전(I,D 추가)이고, **"시정수(τ)"** 페이지가 지연 없는 1차 응답(τ=1/kp)의 정확한 형태입니다.
`;

function feedbackVelocity(errorDeg: number, kp: number, limit: number): number {
  if (Math.abs(errorDeg) < DEADBAND_DEG) return 0;
  return Math.max(-limit, Math.min(limit, kp * errorDeg));
}

interface Row { t: number; target: number; position: number }

/**
 * loop()를 흉내낸 시뮬레이션 + 헤더 주석이 말하는 "모르는 지연들"을 순수 이송지연(pure delay) 하나로 모델링.
 * delayMs=0이면 명령이 계산된 그 스텝에 바로 반영 → 이론과 동일한 무진동 1차 응답.
 * ponytail: 지연원 3가지(제어주기·모터 내부루프·통신 RTT)를 하나의 이송지연으로 합쳐서 근사 — 소스별로 나누려면 델리게이트마다 별도 버퍼 필요.
 */
function simulate(kp: number, speedLimitDegS: number, goalDeg: number, delayMs: number): Row[] {
  const delaySteps = Math.max(0, Math.round(delayMs / (DT * 1000)));
  const queue: number[] = new Array(delaySteps).fill(0);
  let position = 0;
  const rows: Row[] = [];
  for (let idx = 0; idx <= N; idx++) {
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

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathFindGain extends w.HTMLElement {
    private Kp = 5;          // 파일 헤더 예시 "s 5 50 30"
    private speedLimit = 50;
    private goal = 30;
    private delayMs = 20;    // 지연 모델링용 — 실제 명령 파라미터는 아님(교재용 슬라이더)

    private refresh() {
      const { Kp, speedLimit, goal, delayMs } = this;
      const rows = simulate(Kp, speedLimit, goal, delayMs);
      const ideal = simulate(Kp, speedLimit, goal, 0);
      const { overshoot, steadyErr, settleTime } = stats(rows, goal);
      const oscillating = overshoot > Math.max(1, Math.abs(goal) * 0.03);
      const color = oscillating ? '#ef4444' : '#10b981';

      const applied = this.shadowRoot?.querySelector('#fg-applied') as HTMLElement;
      if (applied) { applied.style.color = color; applied.textContent = `적용: Kp=${Kp.toFixed(1)}, 지연=${delayMs}ms, 속도한계=${speedLimit}°/s, 목표=${goal}° → 오버슈트 ${overshoot.toFixed(2)}°, 정착시간 ${settleTime.toFixed(2)}s`; }

      const notes = this.shadowRoot?.querySelector('#fg-notes') as HTMLElement;
      if (notes) notes.innerHTML =
        `<div>오버슈트 = ${overshoot.toFixed(2)}° ${oscillating ? '— 진동이 보입니다. Kp를 낮추거나 지연을 줄여보세요.' : '(거의 없음, 실수축 근처 극점)'}</div>` +
        `<div>정상상태 오차 = ${steadyErr.toFixed(2)}° · 정착시간 = ${settleTime.toFixed(2)}s</div>` +
        `<div style="margin-top:4px;font-weight:800">지연=0ms 기준선(회색 점선)과 비교해서, 지금 Kp·지연 조합이 얼마나 차이 나는지 보세요.</div>`;

      (['Kp'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#fg-${k}-val`) as HTMLElement;
        if (el) el.textContent = this[k].toFixed(1);
      });
      const spVal = this.shadowRoot?.querySelector('#fg-speed-val') as HTMLElement;
      if (spVal) spVal.textContent = `${speedLimit}°/s`;
      const goalVal = this.shadowRoot?.querySelector('#fg-goal-val') as HTMLElement;
      if (goalVal) goalVal.textContent = `${goal}°`;
      const delayVal = this.shadowRoot?.querySelector('#fg-delay-val') as HTMLElement;
      if (delayVal) delayVal.textContent = `${delayMs}ms`;

      const chart = this.shadowRoot?.querySelector('#fg-chart') as HTMLElement;
      if (chart) { const b = Math.max(40, Math.abs(goal) * 1.3); chart.setAttribute('y-min', String(-b)); chart.setAttribute('y-max', String(b)); }
      const targetLine = this.shadowRoot?.querySelector('#fg-target') as HTMLElement;
      if (targetLine) targetLine.setAttribute('points', ptsOf(rows.map(r => ({ t: r.t, target: r.target, position: r.target }))));
      const idealLine = this.shadowRoot?.querySelector('#fg-ideal') as HTMLElement;
      if (idealLine) idealLine.setAttribute('points', ptsOf(ideal));
      const posLine = this.shadowRoot?.querySelector('#fg-position') as HTMLElement;
      if (posLine) { posLine.setAttribute('points', ptsOf(rows)); posLine.setAttribute('color', color); }
    }

    @addEventListener('#fg-kp', 'input')
    onKp(e: Event) { this.Kp = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#fg-speed', 'input')
    onSpeed(e: Event) { this.speedLimit = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('#fg-goal', 'input')
    onGoal(e: Event) { this.goal = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#fg-delay', 'input')
    onDelay(e: Event) { this.delayMs = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { Kp, speedLimit, goal, delayMs } = this;
      const rows = simulate(Kp, speedLimit, goal, delayMs);
      const ideal = simulate(Kp, speedLimit, goal, 0);
      const { overshoot, steadyErr, settleTime } = stats(rows, goal);
      const oscillating = overshoot > Math.max(1, Math.abs(goal) * 0.03);
      const color = oscillating ? '#ef4444' : '#10b981';
      const yb = Math.max(40, Math.abs(goal) * 1.3);
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
        <div class="math-formula">find-gain.ino: speed = kp * error_rad (P만, I·D 없음) — 지연이 없으면 진동이 절대 없는 1차 시스템</div>
        <div class="math-applied" id="fg-applied" style="color:${color}">적용: Kp=${Kp.toFixed(1)}, 지연=${delayMs}ms, 속도한계=${speedLimit}°/s, 목표=${goal}° → 오버슈트 ${overshoot.toFixed(2)}°, 정착시간 ${settleTime.toFixed(2)}s</div>
        <div class="math-desc">지연을 0으로 내리면 Kp를 아무리 올려도 진동이 안 생기는 걸(이론과 일치) 확인하고, 지연을 올린 채 Kp를 올려보면 실제 하드웨어처럼 진동이 나타나는 지점을 찾아보세요.</div>
        <cartesian-chart id="fg-chart" x-min="0" x-max="${SIM_T}" y-min="${-yb}" y-max="${yb}" x-label="시간(s)" y-label="각도(°)" disabled-aspect style="height:220px;max-width:640px;margin:0 auto">
          <series id="fg-target" points="${ptsOf(rows.map(r => ({ t: r.t, target: r.target, position: r.target })))}" color="#94a3b8" dash="4,4" label="target_deg"></series>
          <series id="fg-ideal" points="${ptsOf(ideal)}" color="#cbd5e1" dash="2,3" width="1.4" label="지연=0(이론)"></series>
          <series id="fg-position" points="${ptsOf(rows)}" color="${color}" width="2.2" label="position_deg(지연 있음)"></series>
        </cartesian-chart>
        <div class="math-legend">
          <span><b style="color:#94a3b8">- - target_deg</b></span>
          <span><b style="color:#cbd5e1">·· 지연=0(이론, 무진동)</b></span>
          <span><b style="color:${color}">— position_deg(지금 지연 적용)</b></span>
        </div>
        <div class="ctl"><label>Kp <input id="fg-kp" type="range" min="0" max="40" step="0.5" value="${Kp}"><b id="fg-Kp-val">${Kp.toFixed(1)}</b></label></div>
        <div class="ctl"><label>지연(ms, 제어주기+모터루프+통신) <input id="fg-delay" type="range" min="0" max="80" step="2" value="${delayMs}"><b id="fg-delay-val">${delayMs}ms</b></label></div>
        <div class="ctl"><label>속도한계(°/s) <input id="fg-speed" type="range" min="1" max="100" step="1" value="${speedLimit}"><b id="fg-speed-val">${speedLimit}°/s</b></label></div>
        <div class="ctl"><label>목표각도(°) <input id="fg-goal" type="range" min="-90" max="90" step="1" value="${goal}"><b id="fg-goal-val">${goal}°</b></label></div>
        <div class="math-notes" id="fg-notes">
          <div>오버슈트 = ${overshoot.toFixed(2)}° ${oscillating ? '— 진동이 보입니다. Kp를 낮추거나 지연을 줄여보세요.' : '(거의 없음, 실수축 근처 극점)'}</div>
          <div>정상상태 오차 = ${steadyErr.toFixed(2)}° · 정착시간 = ${settleTime.toFixed(2)}s</div>
          <div style="margin-top:4px;font-weight:800">지연=0ms 기준선(회색 점선)과 비교해서, 지금 Kp·지연 조합이 얼마나 차이 나는지 보세요.</div>
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
