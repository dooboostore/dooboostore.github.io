import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-pid';

const MASS = 1, DAMPING = 1.5, DISTURBANCE = 2, DT = 0.02, N = 600, SETPOINT = 5;

const MD = `
## PID 제어란?
- 목표값(setpoint)과 현재값의 차이(오차, error)를 보고, **얼마나 힘을 줄지**를 세 부분으로 나눠 계산하는 제어 방법입니다.
- 수식: \`u(t) = Kp·e(t) + Ki·∫e(t)dt + Kd·de(t)/dt\`
  - **P(비례)**: 지금 오차에 비례해서 밀어냅니다. 크면 빨리 반응하지만 너무 크면 흔들립니다(진동).
  - **I(적분)**: 오차를 계속 누적합니다. 일정한 방해(부하·마찰·중력 등)가 있어도 **정상상태 오차(steady-state error)를 0으로** 만들어 줍니다. 너무 크면 과도하게 밀어서 크게 오버슈트합니다.
  - **D(미분)**: 오차가 변하는 속도를 봅니다. 너무 급하게 다가가면 미리 브레이크를 걸어 **진동·오버슈트를 줄여줍니다**.
- 이 페이지는 일정한 방해(부하 2)가 걸린 물체를 목표 위치 5로 옮기는 시뮬레이션입니다. **P만 쓰면 방해 때문에 목표에 못 미친 채 멈춥니다(정상상태 오차)** — I를 추가하면 결국 정확히 5에 도달합니다. I를 너무 세게 주면 심하게 출렁이는데, D를 더하면 진정됩니다.
- **이건 사실 "라플라스 변환" 페이지와 같은 이야기입니다** — 이 시스템의 특성방정식은 \`mass·s³ + (damping+Kd)·s² + Kp·s + Ki = 0\`이고, 이 3차방정식의 근(=극점) 3개가 아래 s평면에 찍힙니다. Kd를 늘리면 극점이 왼쪽(안정)으로 밀려서 오버슈트가 줄고, Ki를 P에 비해 너무 세게 주면 극점이 오른쪽(불안정)으로 넘어가 버립니다.
- **Kp·Ki·Kd는 "피드백 게인(feedback gain)"입니다** — 그냥 입력에 곱하는 게 아니라, **오차 e(t)·오차의 적분·오차의 미분**(전부 "측정해서 되먹인" 신호)에 곱해지는 배율이라서 이렇게 부릅니다. 방해(부하 2)가 있어도 결국 목표에 도달하는 이유가 바로 이 "측정→비교→되먹임" 구조 때문입니다. 오픈루프 게인과 피드백 게인의 차이는 **"게인(이득)"** 페이지에서 직접 비교해볼 수 있습니다.
- **어디에 쓰이나요?** — 로봇 팔·드론의 자세/위치 제어, 자율주행 속도·조향 제어, 온도조절기, 서보모터.
`;

// ── 복소수 손풀이 (a+bi를 [a,b]로) ──
type Cx = [number, number];
function cadd(a: Cx, b: Cx): Cx { return [a[0] + b[0], a[1] + b[1]]; }
function csub(a: Cx, b: Cx): Cx { return [a[0] - b[0], a[1] - b[1]]; }
function cmul(a: Cx, b: Cx): Cx { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
function cdiv(a: Cx, b: Cx): Cx { const d = b[0] * b[0] + b[1] * b[1] || 1e-12; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; }

/** 듀랑-커너(Durand-Kerner) 손풀이: 모닉 3차방정식 s³+B s²+C s+D=0의 근 3개를 한꺼번에 반복해서 찾는다. */
function cubicRoots(B: number, C: number, D: number, iters = 200): Cx[] {
  const base: Cx = [0.4, 0.9];
  let roots: Cx[] = [base, cmul(base, base), cmul(cmul(base, base), base)];
  const evalP = (s: Cx): Cx => {
    const s2 = cmul(s, s), s3 = cmul(s2, s);
    return cadd(cadd(s3, cmul([B, 0], s2)), cadd(cmul([C, 0], s), [D, 0]));
  };
  for (let it = 0; it < iters; it++) {
    roots = roots.map((ri, i) => {
      let denom: Cx = [1, 0];
      roots.forEach((rj, j) => { if (i !== j) denom = cmul(denom, csub(ri, rj)); });
      return csub(ri, cdiv(evalP(ri), denom));
    });
  }
  return roots;
}

/** 닫힌루프 특성방정식 mass·s³+(damping+Kd)s²+Kp·s+Ki=0 의 극점(pole) 3개. */
function closedLoopPoles(Kp: number, Ki: number, Kd: number): Cx[] {
  return cubicRoots((DAMPING + Kd) / MASS, Kp / MASS, Ki / MASS);
}

const POLE_SIGMA_MIN = -9, POLE_SIGMA_MAX = 2, POLE_OMEGA_MAX = 5;

function simulate(Kp: number, Ki: number, Kd: number) {
  let x = 0, v = 0, integral = 0, prevError = SETPOINT - x;
  const xs: number[] = [x];
  for (let i = 1; i < N; i++) {
    const error = SETPOINT - x;
    integral += error * DT;
    const derivative = (error - prevError) / DT;
    const u = Kp * error + Ki * integral + Kd * derivative;
    const a = (u - DAMPING * v - DISTURBANCE) / MASS;
    v += a * DT;
    x += v * DT;
    prevError = error;
    xs.push(x);
  }
  return xs;
}

function stats(xs: number[]) {
  const final = xs[xs.length - 1];
  const max = Math.max(...xs);
  const overshoot = Math.max(0, ((max - SETPOINT) / SETPOINT) * 100);
  let settleIdx = 0;
  for (let i = xs.length - 1; i >= 0; i--) { if (Math.abs(xs[i] - SETPOINT) > 0.02 * SETPOINT) { settleIdx = i; break; } }
  return { final, overshoot, steadyErr: SETPOINT - final, settleTime: settleIdx * DT };
}

function ptsStr(xs: number[]) { return xs.map((x, i) => `${(i * DT).toFixed(3)},${x.toFixed(4)}`).join(' '); }

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathPID extends w.HTMLElement {
    private Kp = 6;
    private Ki = 2;
    private Kd = 2;

    private refresh() {
      const { Kp, Ki, Kd } = this;
      const xs = simulate(Kp, Ki, Kd);
      const { overshoot, steadyErr, settleTime } = stats(xs);
      const good = overshoot < 20 && Math.abs(steadyErr) < 0.1;
      const color = good ? '#10b981' : Math.abs(steadyErr) > 0.3 ? '#ef4444' : '#f59e0b';

      const applied = this.shadowRoot?.querySelector('#pid-applied') as HTMLElement;
      if (applied) { applied.style.color = color; applied.textContent = `적용: Kp=${Kp.toFixed(1)}, Ki=${Ki.toFixed(1)}, Kd=${Kd.toFixed(1)} → 오버슈트 ${overshoot.toFixed(1)}%, 정상상태 오차 ${steadyErr.toFixed(3)}, 정착시간 ${settleTime.toFixed(2)}s`; }

      const notes = this.shadowRoot?.querySelector('#pid-notes') as HTMLElement;
      if (notes) {
        notes.innerHTML = `<div>오버슈트(목표를 얼마나 넘었는지) = ${overshoot.toFixed(1)}%</div>` +
          `<div>정상상태 오차(끝까지 남은 오차) = ${steadyErr.toFixed(3)} ${Math.abs(steadyErr) < 0.05 ? '(거의 0, I가 방해를 이겨냄)' : Ki === 0 ? '(I=0이라 방해를 못 이김)' : ''}</div>` +
          `<div>정착시간(오차 2% 이내로 들어온 시각) = ${settleTime.toFixed(2)}s</div>`;
      }

      (['Kp', 'Ki', 'Kd'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#pid-${k}-val`) as HTMLElement;
        if (el) el.textContent = this[k].toFixed(1);
      });

      const curve = this.shadowRoot?.querySelector('#pid-curve') as HTMLElement;
      if (curve) { curve.setAttribute('points', ptsStr(xs)); curve.setAttribute('color', color); }

      const poles = closedLoopPoles(Kp, Ki, Kd);
      const maxRe = Math.max(...poles.map(p => p[0]));
      const poleColor = maxRe < -0.02 ? '#10b981' : maxRe <= 0.02 ? '#f59e0b' : '#ef4444';
      poles.forEach((p, i) => {
        const el = this.shadowRoot?.querySelector(`#pid-pole-${i}`) as HTMLElement;
        if (!el) return;
        el.setAttribute('x', p[0].toFixed(3)); el.setAttribute('y', p[1].toFixed(3)); el.setAttribute('color', poleColor);
        el.setAttribute('label', `s${i + 1}=${p[0].toFixed(2)}${p[1] >= 0 ? '+' : ''}${p[1].toFixed(2)}j`);
      });
      const poleNote = this.shadowRoot?.querySelector('#pid-pole-note') as HTMLElement;
      if (poleNote) {
        poleNote.style.color = poleColor;
        poleNote.textContent = maxRe < -0.02
          ? `모든 극점이 왼쪽(안정) — 가장 오른쪽 극점 Re(s)=${maxRe.toFixed(2)}`
          : maxRe <= 0.02
            ? `극점이 허수축 경계에 있음 — 감쇠가 거의 없음`
            : `⚠ 극점이 오른쪽(불안정)으로 넘어감 — Re(s)=${maxRe.toFixed(2)}, 실제로 발산합니다`;
      }
    }

    @addEventListener('#pid-kp', 'input')
    onKp(e: Event) { this.Kp = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#pid-ki', 'input')
    onKi(e: Event) { this.Ki = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#pid-kd', 'input')
    onKd(e: Event) { this.Kd = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { Kp, Ki, Kd } = this;
      const xs = simulate(Kp, Ki, Kd);
      const { overshoot, steadyErr, settleTime } = stats(xs);
      const good = overshoot < 20 && Math.abs(steadyErr) < 0.1;
      const color = good ? '#10b981' : Math.abs(steadyErr) > 0.3 ? '#ef4444' : '#f59e0b';
      const T = (N - 1) * DT;
      const poles = closedLoopPoles(Kp, Ki, Kd);
      const maxRe = Math.max(...poles.map(p => p[0]));
      const poleColor = maxRe < -0.02 ? '#10b981' : maxRe <= 0.02 ? '#f59e0b' : '#ef4444';
      const poleTags = poles.map((p, i) => `<marker id="pid-pole-${i}" x="${p[0].toFixed(3)}" y="${p[1].toFixed(3)}" color="${poleColor}" size="6" label="s${i + 1}=${p[0].toFixed(2)}${p[1] >= 0 ? '+' : ''}${p[1].toFixed(2)}j"></marker>`).join('\n          ');
      const poleNoteText = maxRe < -0.02
        ? `모든 극점이 왼쪽(안정) — 가장 오른쪽 극점 Re(s)=${maxRe.toFixed(2)}`
        : maxRe <= 0.02
          ? `극점이 허수축 경계에 있음 — 감쇠가 거의 없음`
          : `⚠ 극점이 오른쪽(불안정)으로 넘어감 — Re(s)=${maxRe.toFixed(2)}, 실제로 발산합니다`;
      return `
        <style>
          :host { display:block; }
          .math-title { font-size:13px; font-weight:800; color:#475569; margin:12px 0 2px; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .math-legend { display:flex; gap:12px; font-size:11px; color:#64748b; margin-top:8px; flex-wrap:wrap; }
          .math-legend b { font-weight:800; }
          .math-notes { font-size:12px; font-weight:700; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin-top:8px; line-height:1.7; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:44px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">u(t) = Kp·e + Ki·∫e·dt + Kd·de/dt — 방해(부하) ${DISTURBANCE}가 걸린 물체를 목표 ${SETPOINT}로</div>
        <div class="math-applied" id="pid-applied" style="color:${color}">적용: Kp=${Kp.toFixed(1)}, Ki=${Ki.toFixed(1)}, Kd=${Kd.toFixed(1)} → 오버슈트 ${overshoot.toFixed(1)}%, 정상상태 오차 ${steadyErr.toFixed(3)}, 정착시간 ${settleTime.toFixed(2)}s</div>
        <div class="math-desc">Ki=0으로 내려서 P만 남겨보면 목표에 못 미친 채 멈추는 걸(정상상태 오차) 확인하고, Ki를 올려서 결국 5에 도달하는지, Kd로 흔들림이 줄어드는지 확인해 보세요.</div>
        <cartesian-chart x-min="0" x-max="${T}" y-min="0" y-max="8" x-label="시간(s)" y-label="위치">
          <series points="0,${SETPOINT} ${T},${SETPOINT}" color="#94a3b8" dash="4,4" label="목표(setpoint)"></series>
          <series id="pid-curve" points="${ptsStr(xs)}" color="${color}" width="2.2" label="실제 위치"></series>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#94a3b8">- - 목표(setpoint)</b></span><span><b style="color:${color}">— 실제 위치</b></span></div>
        <div class="math-notes" id="pid-notes">
          <div>오버슈트(목표를 얼마나 넘었는지) = ${overshoot.toFixed(1)}%</div>
          <div>정상상태 오차(끝까지 남은 오차) = ${steadyErr.toFixed(3)} ${Math.abs(steadyErr) < 0.05 ? '(거의 0, I가 방해를 이겨냄)' : Ki === 0 ? '(I=0이라 방해를 못 이김)' : ''}</div>
          <div>정착시간(오차 2% 이내로 들어온 시각) = ${settleTime.toFixed(2)}s</div>
        </div>
        <div class="ctl"><label>Kp (비례) <input id="pid-kp" type="range" min="0" max="15" step="0.5" value="${Kp}"><b id="pid-Kp-val">${Kp.toFixed(1)}</b></label></div>
        <div class="ctl"><label>Ki (적분) <input id="pid-ki" type="range" min="0" max="8" step="0.2" value="${Ki}"><b id="pid-Ki-val">${Ki.toFixed(1)}</b></label></div>
        <div class="ctl"><label>Kd (미분) <input id="pid-kd" type="range" min="0" max="8" step="0.2" value="${Kd}"><b id="pid-Kd-val">${Kd.toFixed(1)}</b></label></div>

        <div class="math-title">닫힌루프 극점(s평면) — 이 Kp·Ki·Kd가 만든 극점 위치</div>
        <div class="math-desc">특성방정식 mass·s³+(damping+Kd)s²+Kp·s+Ki=0 의 근 3개입니다. "라플라스 변환" 페이지와 같은 지도(왼쪽=안정, 오른쪽=불안정)입니다.</div>
        <cartesian-chart x-min="${POLE_SIGMA_MIN}" x-max="${POLE_SIGMA_MAX}" y-min="${-POLE_OMEGA_MAX}" y-max="${POLE_OMEGA_MAX}" x-label="σ (실수부)" y-label="ω (허수부)" disabled-aspect style="height:200px">
          <polygon points="${POLE_SIGMA_MIN},${-POLE_OMEGA_MAX} 0,${-POLE_OMEGA_MAX} 0,${POLE_OMEGA_MAX} ${POLE_SIGMA_MIN},${POLE_OMEGA_MAX}" color="#d1fae5" fill="rgba(16,185,129,0.10)"></polygon>
          <polygon points="0,${-POLE_OMEGA_MAX} ${POLE_SIGMA_MAX},${-POLE_OMEGA_MAX} ${POLE_SIGMA_MAX},${POLE_OMEGA_MAX} 0,${POLE_OMEGA_MAX}" color="#fecaca" fill="rgba(239,68,68,0.10)"></polygon>
          <series points="0,${-POLE_OMEGA_MAX} 0,${POLE_OMEGA_MAX}" color="#94a3b8" dash="4,4"></series>
          ${poleTags}
        </cartesian-chart>
        <div class="math-notes" id="pid-pole-note" style="color:${poleColor}">${poleNoteText}</div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
