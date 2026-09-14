import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-controlmap';

const MD = `
## PID·라플라스·감쇠비·시정수 — 다 같은 이야기
- **PID(Kp,Ki,Kd)**는 반응의 "모양"이 아니라, s평면 위의 **극점(pole) 위치를 옮기는 조종간**입니다.
- 그 극점 s=σ+jω 하나하나가 바로 **"라플라스 변환"** 페이지의 그 좌표입니다.
- 극점이 **실수축 위(ω=0)**에 있으면 → 흔들리지 않고 그냥 죽는 모드 → **시정수 τ = -1/σ** (τ 페이지의 그 τ)
- 극점이 **켤레쌍(ω≠0)**으로 있으면 → 흔들리면서 죽는 모드 → **감쇠비 ζ = -σ/ωn, 고유진동수 ωn = √(σ²+ω²)** (ζ·ωn 페이지의 그것)
- 아래에서 Kp·Ki·Kd를 움직이면, 이 시스템이 실제로는 **몇 개의 "1차 모드(τ)"와 몇 개의 "2차 모드(ζ,ωn)"로 쪼개지는지**, 그리고 그게 모여서 만드는 진짜 응답 곡선을 동시에 볼 수 있습니다.
- **주의할 점**: ζ,ωn의 오버슈트 공식은 순수 2차 시스템(극점 1쌍)에만 정확합니다. 이 페이지는 실제로 3차(극점 3개)라서, 아래 "근사 오버슈트"는 지배적인 켤레쌍만 가지고 어림한 값이고 실제 시뮬레이션 값과는 조금 다를 수 있습니다 — 그 차이 자체가 "3차 시스템은 2차 근사만으로는 완벽히 설명 안 된다"는 좋은 교훈입니다.
- **정리**: PID는 손잡이, 라플라스 극점은 지도, 시정수·감쇠비/고유진동수는 그 지도 위 점을 실수축 위냐 켤레쌍이냐에 따라 다르게 부르는 이름입니다.
`;

type Cx = [number, number];
function cadd(a: Cx, b: Cx): Cx { return [a[0] + b[0], a[1] + b[1]]; }
function csub(a: Cx, b: Cx): Cx { return [a[0] - b[0], a[1] - b[1]]; }
function cmul(a: Cx, b: Cx): Cx { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
function cdiv(a: Cx, b: Cx): Cx { const d = b[0] * b[0] + b[1] * b[1] || 1e-12; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; }

/** 듀랑-커너 손풀이: 모닉 3차방정식 s³+B s²+C s+D=0 의 근 3개. */
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

const MASS = 1, DAMPING = 1.5, DISTURBANCE = 2, DT = 0.02, N = 600, SETPOINT = 5;
function closedLoopPoles(Kp: number, Ki: number, Kd: number): Cx[] {
  return cubicRoots((DAMPING + Kd) / MASS, Kp / MASS, Ki / MASS);
}
function pidSimulate(Kp: number, Ki: number, Kd: number): number[] {
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
function ptsStr(xs: number[]) { return xs.map((x, i) => `${(i * DT).toFixed(3)},${x.toFixed(4)}`).join(' '); }
const T = (N - 1) * DT;

type Mode =
  | { type: 'real'; sigma: number; tau: number | null }
  | { type: 'complex'; sigma: number; omega: number; zeta: number; wn: number };

/** 극점들을 "실수축(τ) 모드"와 "켤레쌍(ζ,ωn) 모드"로 분류한다. */
function classify(poles: Cx[]): Mode[] {
  const modes: Mode[] = [];
  const used = new Array(poles.length).fill(false);
  poles.forEach((p, i) => {
    if (used[i]) return;
    if (Math.abs(p[1]) < 0.05) {
      const tau = p[0] < -0.001 ? -1 / p[0] : null;
      modes.push({ type: 'real', sigma: p[0], tau });
      used[i] = true;
    } else if (p[1] > 0) {
      const wn = Math.hypot(p[0], p[1]);
      const zeta = -p[0] / wn;
      modes.push({ type: 'complex', sigma: p[0], omega: p[1], zeta, wn });
      used[i] = true;
      const j = poles.findIndex((q, k) => k !== i && !used[k] && Math.abs(q[0] - p[0]) < 1e-3 && Math.abs(q[1] + p[1]) < 1e-3);
      if (j >= 0) used[j] = true;
    }
  });
  return modes;
}

function overshootPct(zeta: number) { return zeta >= 1 ? 0 : 100 * Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta)); }

function modeCardHtml(m: Mode, i: number): string {
  if (m.type === 'real') {
    return `<div class="cm-card"><div class="cm-card-title">모드 ${i + 1}: 실수 극점 (1차, 안 흔들림)</div>` +
      `<div class="cm-card-body">σ = ${m.sigma.toFixed(2)}${m.tau != null ? ` → <b>시정수 τ = ${m.tau.toFixed(2)}s</b> (5τ=${(m.tau * 5).toFixed(2)}s면 이 모드는 거의 다 죽음)` : ' → <b style="color:#ef4444">σ≥0, 이 모드는 발산</b>'}</div></div>`;
  }
  const os = overshootPct(m.zeta);
  return `<div class="cm-card"><div class="cm-card-title">모드 ${i + 1}: 켤레쌍 극점 (2차, 흔들림)</div>` +
    `<div class="cm-card-body">σ=${m.sigma.toFixed(2)}, ω=${m.omega.toFixed(2)} → <b>ζ=${m.zeta.toFixed(2)}, ωn=${m.wn.toFixed(2)}rad/s</b><br>근사 오버슈트(2차 공식) ≈ ${os.toFixed(1)}%</div></div>`;
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathControlMap extends w.HTMLElement {
    private Kp = 6;
    private Ki = 2;
    private Kd = 2;

    private refresh() {
      const { Kp, Ki, Kd } = this;
      const poles = closedLoopPoles(Kp, Ki, Kd);
      const maxRe = Math.max(...poles.map(p => p[0]));
      const color = maxRe < -0.02 ? '#10b981' : maxRe <= 0.02 ? '#f59e0b' : '#ef4444';
      const modes = classify(poles);
      const xs = pidSimulate(Kp, Ki, Kd);

      const applied = this.shadowRoot?.querySelector('#cm-applied') as HTMLElement;
      if (applied) { applied.style.color = color; applied.textContent = `적용: Kp=${Kp.toFixed(1)}, Ki=${Ki.toFixed(1)}, Kd=${Kd.toFixed(1)} → 극점 ${poles.length}개 = 1차 모드 ${modes.filter(m => m.type === 'real').length}개 + 2차 모드 ${modes.filter(m => m.type === 'complex').length}개`; }

      (['Kp', 'Ki', 'Kd'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#cm-${k}-val`) as HTMLElement;
        if (el) el.textContent = this[k].toFixed(1);
      });

      poles.forEach((p, i) => {
        const el = this.shadowRoot?.querySelector(`#cm-pole-${i}`) as HTMLElement;
        if (!el) return;
        el.setAttribute('x', p[0].toFixed(3)); el.setAttribute('y', p[1].toFixed(3)); el.setAttribute('color', color);
        el.setAttribute('label', `s${i + 1}=${p[0].toFixed(2)}${p[1] >= 0 ? '+' : ''}${p[1].toFixed(2)}j`);
      });

      const curve = this.shadowRoot?.querySelector('#cm-curve') as HTMLElement;
      if (curve) { curve.setAttribute('points', ptsStr(xs)); curve.setAttribute('color', color); }

      const cards = this.shadowRoot?.querySelector('#cm-cards') as HTMLElement;
      if (cards) cards.innerHTML = modes.map((m, i) => modeCardHtml(m, i)).join('');
    }

    @addEventListener('#cm-kp', 'input')
    onKp(e: Event) { this.Kp = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#cm-ki', 'input')
    onKi(e: Event) { this.Ki = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#cm-kd', 'input')
    onKd(e: Event) { this.Kd = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { Kp, Ki, Kd } = this;
      const poles = closedLoopPoles(Kp, Ki, Kd);
      const maxRe = Math.max(...poles.map(p => p[0]));
      const color = maxRe < -0.02 ? '#10b981' : maxRe <= 0.02 ? '#f59e0b' : '#ef4444';
      const modes = classify(poles);
      const xs = pidSimulate(Kp, Ki, Kd);
      const SIGMA_MIN = -9, SIGMA_MAX = 2, OMEGA_MAX = 5;
      const poleTags = poles.map((p, i) => `<marker id="cm-pole-${i}" x="${p[0].toFixed(3)}" y="${p[1].toFixed(3)}" color="${color}" size="6" label="s${i + 1}=${p[0].toFixed(2)}${p[1] >= 0 ? '+' : ''}${p[1].toFixed(2)}j"></marker>`).join('\n          ');
      const cardsHtml = modes.map((m, i) => modeCardHtml(m, i)).join('');
      return `
        <style>
          :host { display:block; }
          .math-title { font-size:13px; font-weight:800; color:#475569; margin:12px 0 2px; }
          .math-title:first-child { margin-top:0; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:44px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md table { border-collapse:collapse; font-size:12px; margin:6px 0; }
          .md th, .md td { border:1px solid #e2e8f0; padding:4px 8px; text-align:center; }
          .md th { background:#f8fafc; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .cm-flow { display:flex; align-items:stretch; gap:6px; flex-wrap:wrap; margin:10px 0; }
          .cm-box { flex:1; min-width:120px; background:#fff; border:1.5px solid #e2e8f0; border-radius:10px; padding:10px; text-align:center; }
          .cm-box b { display:block; font-size:12px; color:#1e293b; margin-bottom:2px; }
          .cm-box span { font-size:10.5px; color:#64748b; }
          .cm-arrow { display:flex; align-items:center; justify-content:center; font-size:18px; color:#94a3b8; padding:0 2px; }
          .cm-box.pid { border-color:#6366f1; background:#eef2ff; }
          .cm-box.pole { border-color:#8b5cf6; background:#f5f3ff; }
          .cm-box.tau { border-color:#10b981; background:#ecfdf5; }
          .cm-box.zeta { border-color:#f59e0b; background:#fffbeb; }
          .cm-cards { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:8px; }
          @media (max-width:760px) { .cm-cards { grid-template-columns:1fr; } }
          .cm-card { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:8px 10px; }
          .cm-card-title { font-size:11.5px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .cm-card-body { font-size:11.5px; color:#334155; line-height:1.6; }
        </style>
        <div class="math-formula">PID 게인 하나로 극점을 옮기면, 그 극점이 τ 또는 ζ·ωn으로 번역됩니다</div>
        <div class="cm-flow">
          <div class="cm-box pid"><b>PID</b><span>Kp, Ki, Kd</span></div>
          <div class="cm-arrow">→</div>
          <div class="cm-box pole"><b>라플라스 극점</b><span>s = σ + jω</span></div>
          <div class="cm-arrow">→</div>
          <div class="cm-box tau"><b>실수축(ω=0)</b><span>시정수 τ = -1/σ</span></div>
        </div>
        <div class="cm-flow" style="margin-top:-6px">
          <div class="cm-box" style="visibility:hidden"><b>·</b></div>
          <div class="cm-arrow" style="visibility:hidden">→</div>
          <div class="cm-box" style="visibility:hidden"><b>·</b></div>
          <div class="cm-arrow">↘</div>
          <div class="cm-box zeta"><b>켤레쌍(ω≠0)</b><span>ζ = -σ/ωn, ωn = √(σ²+ω²)</span></div>
        </div>
        <div class="math-applied" id="cm-applied" style="color:${color}">적용: Kp=${Kp.toFixed(1)}, Ki=${Ki.toFixed(1)}, Kd=${Kd.toFixed(1)} → 극점 ${poles.length}개 = 1차 모드 ${modes.filter(m => m.type === 'real').length}개 + 2차 모드 ${modes.filter(m => m.type === 'complex').length}개</div>
        <div class="math-desc">슬라이더를 움직이면 s평면의 극점, 그 아래 실제 응답 곡선, 그리고 각 극점의 "번역"(τ 또는 ζ·ωn)이 함께 바뀝니다.</div>
        <cartesian-chart x-min="${SIGMA_MIN}" x-max="${SIGMA_MAX}" y-min="${-OMEGA_MAX}" y-max="${OMEGA_MAX}" x-label="σ (실수부)" y-label="ω (허수부)" disabled-aspect style="height:200px">
          <polygon points="${SIGMA_MIN},${-OMEGA_MAX} 0,${-OMEGA_MAX} 0,${OMEGA_MAX} ${SIGMA_MIN},${OMEGA_MAX}" color="#d1fae5" fill="rgba(16,185,129,0.10)"></polygon>
          <polygon points="0,${-OMEGA_MAX} ${SIGMA_MAX},${-OMEGA_MAX} ${SIGMA_MAX},${OMEGA_MAX} 0,${OMEGA_MAX}" color="#fecaca" fill="rgba(239,68,68,0.10)"></polygon>
          <series points="0,${-OMEGA_MAX} 0,${OMEGA_MAX}" color="#94a3b8" dash="4,4"></series>
          ${poleTags}
        </cartesian-chart>
        <div class="math-title">이 극점들이 실제로 만드는 응답</div>
        <cartesian-chart x-min="0" x-max="${T}" y-min="0" y-max="8" x-label="시간(s)" y-label="위치" style="height:200px">
          <series points="0,${SETPOINT} ${T},${SETPOINT}" color="#94a3b8" dash="4,4" label="목표"></series>
          <series id="cm-curve" points="${ptsStr(xs)}" color="${color}" width="2.2"></series>
        </cartesian-chart>
        <div class="math-title">극점 번역표 (τ 또는 ζ·ωn)</div>
        <div class="cm-cards" id="cm-cards">${cardsHtml}</div>
        <div class="ctl"><label>Kp (비례) <input id="cm-kp" type="range" min="0" max="15" step="0.5" value="${Kp}"><b id="cm-Kp-val">${Kp.toFixed(1)}</b></label></div>
        <div class="ctl"><label>Ki (적분) <input id="cm-ki" type="range" min="0" max="8" step="0.2" value="${Ki}"><b id="cm-Ki-val">${Ki.toFixed(1)}</b></label></div>
        <div class="ctl"><label>Kd (미분) <input id="cm-kd" type="range" min="0" max="8" step="0.2" value="${Kd}"><b id="cm-Kd-val">${Kd.toFixed(1)}</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
