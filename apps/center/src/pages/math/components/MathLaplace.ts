import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-laplace';

const SIGMA_MIN = -3.5, SIGMA_MAX = 1.5;
const OMEGA_MAX = 13;
const T = 4;

const MD = `
## 라플라스 변환(Laplace transform)이란?
- **"푸리에 변환"**이 "얼마나 빠르게 진동하는지"(ω, 허수축)만 봤다면, 라플라스 변환은 여기에 **"얼마나 빨리 커지거나 줄어드는지"(σ, 실수축)**까지 더해서 봅니다.
- 수식: \`L{f(t)}(s) = ∫₀^∞ f(t)·e^(-st) dt\`, 여기서 \`s = σ + jω\` (복소수 "주파수")
- 시험 신호 \`e^(st) = e^(σt)·(cos ωt + i·sin ωt)\` — **"오일러 공식(e^iθ)"** 페이지의 \`e^(iθ)\`에 **크기가 변하는 부분(e^(σt))**이 추가된 것입니다. σ>0이면 점점 커지고, σ<0이면 점점 줄어들고, σ=0이면 크기 그대로(순수 진동, 푸리에의 세계)입니다.
- 제어 시스템(로봇·드론을 PID로 제어하는 것 등)의 반응은 전달함수의 **극점(pole)** 위치 s=σ+jω로 결정됩니다:
  - **σ<0 (왼쪽 절반, 초록)**: 안정 — 진동이 시간이 지나며 죽어듭니다.
  - **σ>0 (오른쪽 절반, 빨강)**: 불안정 — 진동이 점점 커져서 발산합니다.
  - **σ=0 (경계선)**: 감쇠 없이 계속 진동 — 순수 주파수.
- 극점을 슬라이더로 옮겨가며, 오른쪽 시간응답 \`e^(σt)cos(ωt)\`이 어떻게 죽어들거나 커지는지 확인해 보세요.
- 맨 아래에서는 **"PID 제어" 페이지의 Kp·Ki·Kd 게인을 직접 움직여서, 그 게인이 실제로 만드는 극점 3개가 s평면 위를 실시간으로 움직이는 걸** 볼 수 있습니다.
- 여기서 움직이는 Kp·Ki·Kd는 그냥 곱하는 값이 아니라 **"피드백 게인(feedback gain)"**입니다 — 오차(목표-현재값)를 측정해서 되먹인 신호에 곱해지기 때문에, 극점이 왼쪽(안정)으로 이동해서 방해가 있어도 결국 목표에 수렴합니다. 오픈루프 게인과의 차이는 **"게인(이득)"** 페이지에서 비교해볼 수 있습니다.
- **어디에 쓰이나요?** — "PID 제어" 페이지에서 게인을 세게 주면 진동이 심해지던 것도 극점이 오른쪽(불안정)으로 밀렸기 때문입니다. 회로 해석, 로봇 팔·드론의 안정성 판정, 신호 감쇠·필터 설계.
`;

// ── 복소수 손풀이 + 3차방정식 근 (a+bi를 [a,b]로) ──
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

// PID 페이지와 같은 물체(mass·x''+damping·x'=u-disturbance) 기준 닫힌루프 극점
const PID_MASS = 1, PID_DAMPING = 1.5, PID_DISTURBANCE = 2, PID_DT = 0.02, PID_N = 600, PID_SETPOINT = 5;
function pidPoles(Kp: number, Ki: number, Kd: number): Cx[] {
  return cubicRoots((PID_DAMPING + Kd) / PID_MASS, Kp / PID_MASS, Ki / PID_MASS);
}
const PID_SIGMA_MIN = -9, PID_SIGMA_MAX = 2, PID_OMEGA_MAX = 5;

/** "PID 제어" 페이지와 똑같은 물체 시뮬레이션 — 이 극점들이 실제로 어떤 응답을 만드는지 보여준다. */
function pidSimulate(Kp: number, Ki: number, Kd: number): number[] {
  let x = 0, v = 0, integral = 0, prevError = PID_SETPOINT - x;
  const xs: number[] = [x];
  for (let i = 1; i < PID_N; i++) {
    const error = PID_SETPOINT - x;
    integral += error * PID_DT;
    const derivative = (error - prevError) / PID_DT;
    const u = Kp * error + Ki * integral + Kd * derivative;
    const a = (u - PID_DAMPING * v - PID_DISTURBANCE) / PID_MASS;
    v += a * PID_DT;
    x += v * PID_DT;
    prevError = error;
    xs.push(x);
  }
  return xs;
}
function pidPtsStr(xs: number[]) { return xs.map((x, i) => `${(i * PID_DT).toFixed(3)},${x.toFixed(4)}`).join(' '); }
const PID_T = (PID_N - 1) * PID_DT;

function h(t: number, sigma: number, omega: number) { return Math.exp(sigma * t) * Math.cos(omega * t); }

function curveStr(sigma: number, omega: number, n = 200) {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (T * i) / n;
    pts.push(`${t.toFixed(4)},${h(t, sigma, omega).toFixed(5)}`);
  }
  return pts.join(' ');
}

function poleColor(sigma: number) {
  if (sigma < -0.02) return '#10b981';
  if (Math.abs(sigma) <= 0.02) return '#f59e0b';
  return '#ef4444';
}

/** 극점 위치를 지도에 찍는 법 — 대표 위치 5개(A~E)를 고정 예시로 보여준다. */
const EX_POINTS = [
  { id: 'A', sigma: -2.2, omega: 0, title: '지수 수렴', desc: '진동 없이 그냥 줄어듦' },
  { id: 'B', sigma: -1.4, omega: 2.6, title: '감쇠 진동', desc: '진동하며 서서히 줄어듦' },
  { id: 'C', sigma: -0.05, omega: 3.6, title: '지속 진동', desc: '거의 줄지도 늘지도 않음(경계)' },
  { id: 'D', sigma: 1.1, omega: 2.6, title: '발산 진동', desc: '진동하며 점점 커짐' },
  { id: 'E', sigma: -1.4, omega: 6.5, title: '빠른 감쇠 진동', desc: '빠르게 진동하며 줄어듦' },
];

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathLaplace extends w.HTMLElement {
    private sigma = -0.8;
    private omega = 6;
    private Kp = 6;
    private Ki = 2;
    private Kd = 2;

    private refresh() {
      const { sigma, omega } = this;
      const stable = sigma < -0.02;
      const marginal = Math.abs(sigma) <= 0.02;
      const color = poleColor(sigma);
      const verdict = stable ? '안정 (진동이 죽어듦)' : marginal ? '경계 (감쇠 없는 순수 진동)' : '불안정 (진동이 발산)';

      const applied = this.shadowRoot?.querySelector('#lap-applied') as HTMLElement;
      if (applied) { applied.style.color = color; applied.textContent = `적용: s = ${sigma.toFixed(2)} ${omega >= 0 ? '+' : '-'} ${Math.abs(omega).toFixed(2)}j → ${verdict}`; }

      const notes = this.shadowRoot?.querySelector('#lap-notes') as HTMLElement;
      if (notes) notes.innerHTML = `<div>h(t) = e^(σt)·cos(ωt), σ=${sigma.toFixed(2)}, ω=${omega.toFixed(2)}rad/s</div>` +
        `<div>${stable ? 'σ<0 → 시간이 지나며 진폭이 e^(σt)배로 줄어듦' : marginal ? 'σ≈0 → 진폭이 줄지도 늘지도 않음' : 'σ>0 → 시간이 지나며 진폭이 e^(σt)배로 커짐'}</div>`;

      (['sigma', 'omega'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#lap-${k}-val`) as HTMLElement;
        if (el) el.textContent = this[k].toFixed(2);
      });

      const curve = this.shadowRoot?.querySelector('#lap-curve') as HTMLElement;
      if (curve) { curve.setAttribute('points', curveStr(sigma, omega)); curve.setAttribute('color', color); }
      const poleTop = this.shadowRoot?.querySelector('#lap-pole1') as HTMLElement;
      if (poleTop) { poleTop.setAttribute('x', sigma.toFixed(3)); poleTop.setAttribute('y', omega.toFixed(3)); poleTop.setAttribute('color', color); }
      const poleBot = this.shadowRoot?.querySelector('#lap-pole2') as HTMLElement;
      if (poleBot) { poleBot.setAttribute('x', sigma.toFixed(3)); poleBot.setAttribute('y', (-omega).toFixed(3)); poleBot.setAttribute('color', color); }

      const { Kp, Ki, Kd } = this;
      const poles = pidPoles(Kp, Ki, Kd);
      const maxRe = Math.max(...poles.map(p => p[0]));
      const pidColor = poleColor(maxRe);
      const applied2 = this.shadowRoot?.querySelector('#lap-pid-applied') as HTMLElement;
      if (applied2) { applied2.style.color = pidColor; applied2.textContent = `적용: Kp=${Kp.toFixed(1)}, Ki=${Ki.toFixed(1)}, Kd=${Kd.toFixed(1)} → 가장 오른쪽 극점 Re(s)=${maxRe.toFixed(2)}`; }
      poles.forEach((p, i) => {
        const el = this.shadowRoot?.querySelector(`#lap-pidpole-${i}`) as HTMLElement;
        if (!el) return;
        el.setAttribute('x', p[0].toFixed(3)); el.setAttribute('y', p[1].toFixed(3)); el.setAttribute('color', pidColor);
        el.setAttribute('label', `s${i + 1}=${p[0].toFixed(2)}${p[1] >= 0 ? '+' : ''}${p[1].toFixed(2)}j`);
      });
      (['Kp', 'Ki', 'Kd'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#lap-${k}-val`) as HTMLElement;
        if (el) el.textContent = this[k].toFixed(1);
      });

      const pidXs = pidSimulate(Kp, Ki, Kd);
      const pidCurve = this.shadowRoot?.querySelector('#lap-pid-curve') as HTMLElement;
      if (pidCurve) { pidCurve.setAttribute('points', pidPtsStr(pidXs)); pidCurve.setAttribute('color', pidColor); }
    }

    @addEventListener('#lap-sigma', 'input')
    onSigma(e: Event) { this.sigma = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#lap-omega', 'input')
    onOmega(e: Event) { this.omega = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#lap-kp', 'input')
    onKp(e: Event) { this.Kp = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#lap-ki', 'input')
    onKi(e: Event) { this.Ki = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#lap-kd', 'input')
    onKd(e: Event) { this.Kd = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { sigma, omega, Kp, Ki, Kd } = this;
      const stable = sigma < -0.02;
      const marginal = Math.abs(sigma) <= 0.02;
      const color = poleColor(sigma);
      const verdict = stable ? '안정 (진동이 죽어듦)' : marginal ? '경계 (감쇠 없는 순수 진동)' : '불안정 (진동이 발산)';
      const exTags = EX_POINTS.map(p => `<marker x="${p.sigma}" y="${p.omega}" color="#334155" size="4" label="${p.id}"></marker>`).join('\n          ');
      const pidPolesNow = pidPoles(Kp, Ki, Kd);
      const pidMaxRe = Math.max(...pidPolesNow.map(p => p[0]));
      const pidColor = poleColor(pidMaxRe);
      const pidPoleTags = pidPolesNow.map((p, i) => `<marker id="lap-pidpole-${i}" x="${p[0].toFixed(3)}" y="${p[1].toFixed(3)}" color="${pidColor}" size="6" label="s${i + 1}=${p[0].toFixed(2)}${p[1] >= 0 ? '+' : ''}${p[1].toFixed(2)}j"></marker>`).join('\n          ');
      const pidXs = pidSimulate(Kp, Ki, Kd);
      const exCards = EX_POINTS.map(p => {
        const c = poleColor(p.sigma);
        return `
        <div class="lap-ex-card">
          <div class="lap-ex-title">${p.id} — ${p.title}</div>
          <cartesian-chart x-min="0" x-max="${T}" y-min="auto" y-max="auto" hide-grid disabled-zoom style="height:110px">
            <series points="0,0 ${T},0" color="#e2e8f0" dash="3,3"></series>
            <series points="${curveStr(p.sigma, p.omega)}" color="${c}" width="2"></series>
          </cartesian-chart>
          <div class="lap-ex-desc">σ=${p.sigma.toFixed(2)}, ω=${p.omega.toFixed(2)} — ${p.desc}</div>
        </div>`;
      }).join('');
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
          .ctl b { min-width:44px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .lap-ex-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-top:8px; }
          @media (max-width:760px) { .lap-ex-grid { grid-template-columns:repeat(2,1fr); } }
          .lap-ex-card { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:6px; }
          .lap-ex-title { font-size:11px; font-weight:800; color:#1e293b; margin-bottom:2px; text-align:center; }
          .lap-ex-desc { font-size:10px; color:#64748b; margin-top:2px; text-align:center; }
        </style>
        <div class="math-formula">s평면의 극점 위치 → 시간응답 e^(σt)cos(ωt)</div>
        <div class="math-applied" id="lap-applied" style="color:${color}">적용: s = ${sigma.toFixed(2)} ${omega >= 0 ? '+' : '-'} ${Math.abs(omega).toFixed(2)}j → ${verdict}</div>
        <div class="math-desc">σ(실수부)를 왼쪽(음수)으로 옮기면 안정, 오른쪽(양수)으로 옮기면 불안정합니다. ω(허수부)는 진동 빠르기를 정하는데, +ω와 -ω는 실제로 같은 반응을 냅니다(cos이 짝함수라서) — 그래서 두 극점이 항상 켤레쌍으로 같이 찍힙니다.</div>
        <div class="math-title">s평면 (극점 위치)</div>
        <cartesian-chart x-min="${SIGMA_MIN}" x-max="${SIGMA_MAX}" y-min="${-OMEGA_MAX}" y-max="${OMEGA_MAX}" x-label="σ (실수부, 감쇠/발산)" y-label="ω (허수부, 진동수)" disabled-aspect style="height:220px">
          <polygon points="${SIGMA_MIN},${-OMEGA_MAX} 0,${-OMEGA_MAX} 0,${OMEGA_MAX} ${SIGMA_MIN},${OMEGA_MAX}" color="#d1fae5" fill="rgba(16,185,129,0.12)" label="안정"></polygon>
          <polygon points="0,${-OMEGA_MAX} ${SIGMA_MAX},${-OMEGA_MAX} ${SIGMA_MAX},${OMEGA_MAX} 0,${OMEGA_MAX}" color="#fecaca" fill="rgba(239,68,68,0.10)" label="불안정"></polygon>
          <series points="0,${-OMEGA_MAX} 0,${OMEGA_MAX}" color="#94a3b8" dash="4,4"></series>
          <marker id="lap-pole1" x="${sigma}" y="${omega}" color="${color}" size="6" label="s=${sigma.toFixed(2)}+${omega.toFixed(2)}j"></marker>
          <marker id="lap-pole2" x="${sigma}" y="${-omega}" color="${color}" size="6" label="켤레극점"></marker>
          ${exTags}
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#10b981">■ σ&lt;0 안정</b></span><span><b style="color:#ef4444">■ σ&gt;0 불안정</b></span><span><b style="color:#94a3b8">| 허수축(경계)</b></span></div>
        <div class="ctl"><label>σ (실수부) <input id="lap-sigma" type="range" min="${SIGMA_MIN}" max="${SIGMA_MAX}" step="0.05" value="${sigma}"><b id="lap-sigma-val">${sigma.toFixed(2)}</b></label></div>
        <div class="ctl"><label>ω (허수부) <input id="lap-omega" type="range" min="${-OMEGA_MAX}" max="${OMEGA_MAX}" step="0.2" value="${omega}"><b id="lap-omega-val">${omega.toFixed(2)}</b></label></div>

        <div class="math-title">시간응답 h(t) = e^(σt)·cos(ωt)</div>
        <cartesian-chart x-min="0" x-max="${T}" y-min="auto" y-max="auto" x-label="시간(s)" y-label="h(t)" style="height:220px">
          <series points="0,0 ${T},0" color="#e2e8f0" dash="4,4"></series>
          <series id="lap-curve" points="${curveStr(sigma, omega)}" color="${color}" width="2"></series>
        </cartesian-chart>
        <div class="math-notes" id="lap-notes">
          <div>h(t) = e^(σt)·cos(ωt), σ=${sigma.toFixed(2)}, ω=${omega.toFixed(2)}rad/s</div>
          <div>${stable ? 'σ<0 → 시간이 지나며 진폭이 e^(σt)배로 줄어듦' : marginal ? 'σ≈0 → 진폭이 줄지도 늘지도 않음' : 'σ>0 → 시간이 지나며 진폭이 e^(σt)배로 커짐'}</div>
        </div>

        <div class="math-title">극점을 지도에 찍는 법 — 대표 위치 5개 (A~E)</div>
        <div class="math-desc">위 s평면 지도의 검정 A~E 점이 아래 5개와 같은 위치입니다. 왼쪽은 수렴, 오른쪽은 발산, 위아래 거리는 진동 속도입니다.</div>
        <div class="lap-ex-grid">${exCards}</div>

        <div class="math-title">PID 게인으로 극점 실시간으로 움직이기</div>
        <div class="math-applied" id="lap-pid-applied" style="color:${pidColor}">적용: Kp=${Kp.toFixed(1)}, Ki=${Ki.toFixed(1)}, Kd=${Kd.toFixed(1)} → 가장 오른쪽 극점 Re(s)=${pidMaxRe.toFixed(2)}</div>
        <div class="math-desc">"PID 제어" 페이지와 같은 물체(mass·x''+damping·x'=u-disturbance)의 특성방정식 mass·s³+(damping+Kd)s²+Kp·s+Ki=0 을 풀어 극점 3개를 실시간으로 찍습니다. Kd를 올리면 왼쪽으로, Ki를 P에 비해 세게 주면 오른쪽으로 이동합니다.</div>
        <cartesian-chart x-min="${PID_SIGMA_MIN}" x-max="${PID_SIGMA_MAX}" y-min="${-PID_OMEGA_MAX}" y-max="${PID_OMEGA_MAX}" x-label="σ (실수부)" y-label="ω (허수부)" disabled-aspect style="height:220px">
          <polygon points="${PID_SIGMA_MIN},${-PID_OMEGA_MAX} 0,${-PID_OMEGA_MAX} 0,${PID_OMEGA_MAX} ${PID_SIGMA_MIN},${PID_OMEGA_MAX}" color="#d1fae5" fill="rgba(16,185,129,0.10)"></polygon>
          <polygon points="0,${-PID_OMEGA_MAX} ${PID_SIGMA_MAX},${-PID_OMEGA_MAX} ${PID_SIGMA_MAX},${PID_OMEGA_MAX} 0,${PID_OMEGA_MAX}" color="#fecaca" fill="rgba(239,68,68,0.10)"></polygon>
          <series points="0,${-PID_OMEGA_MAX} 0,${PID_OMEGA_MAX}" color="#94a3b8" dash="4,4"></series>
          ${pidPoleTags}
        </cartesian-chart>
        <div class="math-title">이 극점이 실제로 만드는 응답 (물체 위치 vs 시간)</div>
        <cartesian-chart x-min="0" x-max="${PID_T}" y-min="0" y-max="8" x-label="시간(s)" y-label="위치" style="height:200px">
          <series points="0,${PID_SETPOINT} ${PID_T},${PID_SETPOINT}" color="#94a3b8" dash="4,4" label="목표"></series>
          <series id="lap-pid-curve" points="${pidPtsStr(pidXs)}" color="${pidColor}" width="2.2" label="실제 위치"></series>
        </cartesian-chart>
        <div class="ctl"><label>Kp (비례) <input id="lap-kp" type="range" min="0" max="15" step="0.5" value="${Kp}"><b id="lap-Kp-val">${Kp.toFixed(1)}</b></label></div>
        <div class="ctl"><label>Ki (적분) <input id="lap-ki" type="range" min="0" max="8" step="0.2" value="${Ki}"><b id="lap-Ki-val">${Ki.toFixed(1)}</b></label></div>
        <div class="ctl"><label>Kd (미분) <input id="lap-kd" type="range" min="0" max="8" step="0.2" value="${Kd}"><b id="lap-Kd-val">${Kd.toFixed(1)}</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
