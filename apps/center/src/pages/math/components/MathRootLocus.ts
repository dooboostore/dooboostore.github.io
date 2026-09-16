import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-root-locus';

// ── 열린루프 전달함수 G(s)H(s) = K / [s(s+P2)(s+P3)] — 근궤적 교과서 단골 예제 ──
const P2 = 2, P3 = 4;
const B = P2 + P3; // 6  (특성방정식 s³+Bs²+Cs+K=0 의 계수)
const C = P2 * P3; // 8

type Complex = { re: number; im: number };
const cx = (re: number, im = 0): Complex => ({ re, im });
const cAdd = (a: Complex, b: Complex): Complex => cx(a.re + b.re, a.im + b.im);
const cSub = (a: Complex, b: Complex): Complex => cx(a.re - b.re, a.im - b.im);
const cMul = (a: Complex, b: Complex): Complex => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cDiv = (a: Complex, b: Complex): Complex => {
  let d = b.re * b.re + b.im * b.im;
  if (d < 1e-8) d = 1e-8; // 특이점(중근) 근처 0나눗셈 방지
  return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const cNeg = (a: Complex): Complex => cx(-a.re, -a.im);
const cExpT = (s: Complex, t: number): Complex => {
  const m = Math.exp(s.re * t);
  return cx(m * Math.cos(s.im * t), m * Math.sin(s.im * t));
};
const cbrt = (x: number) => Math.sign(x) * Math.abs(x) ** (1 / 3);

/** 실계수 depressed 3차식 t³+pt+q=0 의 세 근 (Cardano / 삼각함수법) */
function solveDepressedCubic(p: number, q: number): Complex[] {
  const disc = (q * q) / 4 + (p * p * p) / 27;
  if (disc > 1e-9) {
    const sq = Math.sqrt(disc);
    const u = cbrt(-q / 2 + sq), v = cbrt(-q / 2 - sq);
    const reC = -(u + v) / 2, imC = (Math.abs(u - v) * Math.sqrt(3)) / 2;
    return [cx(u + v), cx(reC, imC), cx(reC, -imC)];
  }
  if (disc < -1e-9) {
    const r = Math.sqrt(-p / 3);
    const phi = Math.acos(Math.max(-1, Math.min(1, (3 * q) / (2 * p * r))));
    const roots: Complex[] = [];
    for (let k = 0; k < 3; k++) roots.push(cx(2 * r * Math.cos(phi / 3 - (2 * Math.PI * k) / 3)));
    return roots;
  }
  const u = cbrt(-q / 2);
  return [cx(2 * u), cx(-u), cx(-u)];
}

/** s³ + Bs² + Cs + K = 0 의 세 닫힌루프 극점 */
function closedLoopPoles(K: number): Complex[] {
  const p = C - (B * B) / 3;
  const q = (2 * B * B * B) / 27 - (B * C) / 3 + K;
  return solveDepressedCubic(p, q).map(r => cAdd(r, cx(-B / 3)));
}

/** 3근을 branch3(항상 실근, 가장 왼쪽) / lower / upper(허수부 오름차순) 로 분류 — K를 늘려도 각 branch가 연속적으로 이어지도록 */
function classify(K: number): { branch3: Complex; lower: Complex; upper: Complex } {
  const roots = closedLoopPoles(K);
  const idx = roots.reduce((mi, r, i) => (r.re < roots[mi].re ? i : mi), 0);
  const branch3 = roots[idx];
  const rest = roots.filter((_, i) => i !== idx).sort((a, b) => a.re - b.re || a.im - b.im);
  return { branch3, lower: rest[0], upper: rest[1] };
}

const fmtPole = (p: Complex) => Math.abs(p.im) < 1e-3 ? p.re.toFixed(3) : `${p.re.toFixed(3)}${p.im >= 0 ? '+' : ''}${p.im.toFixed(3)}j`;

// ── 이탈점(breakaway) / 허수축 교차(한계이득) — 이 예제는 닫힌형으로 정확히 구해진다 ──
const S_BK = -2 + (2 * Math.sqrt(3)) / 3; // dK/ds=0 의 근 (0~-2 구간)
const K_BK = -(S_BK ** 3 + B * S_BK ** 2 + C * S_BK);
const K_CR = B * C;      // Routh 배열의 s¹행이 0이 되는 게인 (48)
const W_CR = Math.sqrt(C); // 그 순간 허수축 교차 각주파수 (√8 ≈ 2.83)

// ── s평면 차트 범위 & 정적 근궤적(3 branch) — K와 무관하게 한 번만 계산 ──
const RE_MIN = -8, RE_MAX = 3, IM_MAX = 8;
function buildLocus() {
  const b1: string[] = [], b2: string[] = [], b3: string[] = [];
  let b1Done = false, b2Done = false, b3Done = false;
  const STEPS = 900, K_MAX = 220;
  for (let i = 0; i <= STEPS; i++) {
    const K = (K_MAX * i) / STEPS;
    const { branch3, lower, upper } = classify(K);
    if (!b3Done) { if (branch3.re < RE_MIN) b3Done = true; else b3.push(`${branch3.re.toFixed(3)},0`); }
    if (!b2Done) { if (lower.re < RE_MIN || lower.re > RE_MAX || Math.abs(lower.im) > IM_MAX) b2Done = true; else b2.push(`${lower.re.toFixed(3)},${lower.im.toFixed(3)}`); }
    if (!b1Done) { if (upper.re < RE_MIN || upper.re > RE_MAX || Math.abs(upper.im) > IM_MAX) b1Done = true; else b1.push(`${upper.re.toFixed(3)},${upper.im.toFixed(3)}`); }
  }
  return { b1: b1.join(' '), b2: b2.join(' '), b3: b3.join(' ') };
}
const LOCUS = buildLocus();

// ── 점근선 2개 (각도 ±60°, 중심 -2) ──
const ASYM_LEN = IM_MAX / Math.sin(Math.PI / 3);
const ASYM_RE = -2 + ASYM_LEN * Math.cos(Math.PI / 3);
const ASYM_UP = `-2,0 ${ASYM_RE.toFixed(3)},${IM_MAX}`;
const ASYM_DN = `-2,0 ${ASYM_RE.toFixed(3)},${-IM_MAX}`;

/** 스텝응답 y(t) = 1 - Σ(잔류값·e^(극점·t)) — 3극점 부분분수 전개, 단위피드백 T(s)=K/(s³+Bs²+Cs+K) */
function stepSamples(K: number, poles: Complex[], n = 240): { t: number; y: number }[] {
  const minAbsRe = Math.max(0.08, Math.min(...poles.map(p => Math.abs(p.re))));
  const Tmax = Math.min(15, Math.max(2, 6 / minAbsRe));
  const negProd = poles.reduce((acc, p) => cMul(acc, cNeg(p)), cx(1));
  const A = cDiv(cx(K), negProd);
  const R = poles.map((pi, i) => {
    let denom = cx(pi.re, pi.im);
    for (let j = 0; j < poles.length; j++) if (j !== i) denom = cMul(denom, cSub(pi, poles[j]));
    return cDiv(cx(K), denom);
  });
  const out: { t: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (Tmax * i) / n;
    let y = A.re;
    for (let k = 0; k < poles.length; k++) y += cMul(R[k], cExpT(poles[k], t)).re;
    out.push({ t, y });
  }
  return out;
}

function analyzeStep(samples: { t: number; y: number }[]) {
  let peak = -Infinity, peakT = 0;
  for (const s of samples) if (s.y > peak) { peak = s.y; peakT = s.t; }
  const overshoot = Math.max(0, (peak - 1) * 100);
  let lastBad = -1;
  samples.forEach((s, i) => { if (Math.abs(s.y - 1) > 0.02) lastBad = i; });
  const settleT = lastBad === -1 ? 0 : samples[Math.min(lastBad + 1, samples.length - 1)].t;
  return { peak, peakT, overshoot, settleT };
}

const MD = `
## 근궤적(Root Locus)이란?
- 피드백 게인 **K**를 0부터 ∞까지 바꿀 때, 닫힌루프 시스템의 **극점이 s평면에서 그리는 궤적**입니다.
- 이 페이지 예제(가장 유명한 교과서 예제): 열린루프 전달함수 \`G(s)H(s) = K / [s(s+2)(s+4)]\` — 극점 3개(0, -2, -4), 영점 없음.
- 특성방정식 \`1+G(s)H(s)=0\` → \`s³+6s²+8s+K=0\`. **K=0**이면 근궤적은 정확히 열린루프 극점(0, -2, -4)에서 출발합니다.
- **이탈점(breakaway)**: K≈${K_BK.toFixed(2)}에서 두 실근이 s≈${S_BK.toFixed(3)}에서 만나 복소켤레쌍으로 갈라집니다 — 여기부터 진동이 시작됩니다("**감쇠비·고유진동수(ζ,ωn)**" 페이지의 부족감쇠 영역과 같은 순간).
- **점근선**: branch 개수(극점수-영점수=3)만큼 무한대로 뻗어나가는 방향. 각도=(2k+1)·180°/3=±60°,180°, 중심(centroid)=(Σ극점)/3=-2.
- **허수축 교차 = 안정성 한계**: K=${K_CR}에서 두 극점이 정확히 허수축(±j${W_CR.toFixed(2)})을 지납니다 — 이 지점을 넘으면 극점이 오른쪽 반평면(RHP)으로 넘어가 **시스템이 발산(불안정)** 합니다. "**라플라스 변환**" 페이지의 "σ>0이면 발산" 규칙과 정확히 같은 이야기입니다.
- **왜 중요한가?** — "**PID 제어**"·"**게인(이득)**" 페이지에서 게인을 올리면 반응이 빨라진다고 배웠는데, 근궤적은 "얼마나 올려도 되는지" 그 한계를 정확히 보여줍니다. 이 슬라이더로 K를 계속 올려 보면, 진동이 점점 커지다가 K=${K_CR}을 넘는 순간 응답이 실제로 발산하는 걸 아래 스텝응답 차트에서 확인할 수 있습니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathRootLocus extends w.HTMLElement {
    private K = 20;

    private refresh() {
      const { K } = this;
      const { branch3, lower, upper } = classify(K);
      const maxRe = Math.max(branch3.re, lower.re, upper.re);
      const verdict = maxRe < -0.05 ? 'stable' : maxRe > 0.05 ? 'unstable' : 'marginal';
      const color = verdict === 'stable' ? '#10b981' : verdict === 'unstable' ? '#ef4444' : '#f59e0b';
      const verdictLabel = verdict === 'stable' ? '안정(Stable)' : verdict === 'unstable' ? '불안정(Unstable)' : '한계안정(Marginal)';

      const applied = this.shadowRoot?.querySelector('#rl-applied') as HTMLElement;
      if (applied) { applied.style.color = color; applied.textContent = `적용: K=${K.toFixed(1)} → 극점 s=${fmtPole(branch3)}, ${fmtPole(lower)}, ${fmtPole(upper)} → ${verdictLabel}`; }

      const kVal = this.shadowRoot?.querySelector('#rl-K-val') as HTMLElement;
      if (kVal) kVal.textContent = K.toFixed(1);

      const m3 = this.shadowRoot?.querySelector('#rl-pole-3') as HTMLElement;
      if (m3) { m3.setAttribute('x', branch3.re.toFixed(3)); m3.setAttribute('y', branch3.im.toFixed(3)); m3.setAttribute('label', `s=${fmtPole(branch3)}`); }
      const mL = this.shadowRoot?.querySelector('#rl-pole-l') as HTMLElement;
      if (mL) { mL.setAttribute('x', lower.re.toFixed(3)); mL.setAttribute('y', lower.im.toFixed(3)); mL.setAttribute('color', color); mL.setAttribute('label', `s=${fmtPole(lower)}`); }
      const mU = this.shadowRoot?.querySelector('#rl-pole-u') as HTMLElement;
      if (mU) { mU.setAttribute('x', upper.re.toFixed(3)); mU.setAttribute('y', upper.im.toFixed(3)); mU.setAttribute('color', color); mU.setAttribute('label', `s=${fmtPole(upper)}`); }

      const notes = this.shadowRoot?.querySelector('#rl-notes') as HTMLElement;
      if (notes) notes.innerHTML = `<div>극점: s = ${fmtPole(branch3)}, ${fmtPole(lower)}, ${fmtPole(upper)} (최대 실수부 ${maxRe.toFixed(3)})</div>` +
        `<div>이탈점 K≈${K_BK.toFixed(2)} (s≈${S_BK.toFixed(2)}) · 한계이득 K=${K_CR} (허수축 교차 ±j${W_CR.toFixed(2)})</div>` +
        `<div style="font-weight:800;color:${color}">${verdictLabel}${verdict === 'unstable' ? ' — 응답이 발산합니다' : ''}</div>`;

      let stepNote = '';
      if (K < 0.05) {
        const flat = this.shadowRoot?.querySelector('#rl-step') as HTMLElement;
        if (flat) flat.setAttribute('points', '0,0 15,0');
        stepNote = 'K≈0 — 피드백 게인이 없어 출력이 목표에 반응하지 않습니다.';
      } else {
        const samples = stepSamples(K, [branch3, lower, upper]);
        const clamped = samples.map(s => `${s.t.toFixed(3)},${Math.max(-1, Math.min(3.5, s.y)).toFixed(4)}`).join(' ');
        const step = this.shadowRoot?.querySelector('#rl-step') as HTMLElement;
        if (step) step.setAttribute('points', clamped);
        const chart = this.shadowRoot?.querySelector('#rl-step-chart') as HTMLElement;
        if (chart) chart.setAttribute('x-max', String(samples[samples.length - 1].t.toFixed(2)));
        if (verdict === 'unstable') {
          stepNote = `불안정 — 진동 폭이 계속 커지며 발산합니다(정착시간 없음). 그래프 위쪽은 잘려 보입니다.`;
        } else {
          const { overshoot, settleT } = analyzeStep(samples);
          stepNote = `오버슈트 ${overshoot.toFixed(1)}% · 정착시간(2% 기준) ≈ ${settleT.toFixed(2)}s`;
        }
      }
      const stepNoteEl = this.shadowRoot?.querySelector('#rl-step-note') as HTMLElement;
      if (stepNoteEl) { stepNoteEl.style.color = color; stepNoteEl.textContent = stepNote; }
    }

    @addEventListener('#rl-k', 'input')
    onK(e: Event) { this.K = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { K } = this;
      const { branch3, lower, upper } = classify(K);
      const maxRe = Math.max(branch3.re, lower.re, upper.re);
      const verdict = maxRe < -0.05 ? 'stable' : maxRe > 0.05 ? 'unstable' : 'marginal';
      const color = verdict === 'stable' ? '#10b981' : verdict === 'unstable' ? '#ef4444' : '#f59e0b';
      const verdictLabel = verdict === 'stable' ? '안정(Stable)' : verdict === 'unstable' ? '불안정(Unstable)' : '한계안정(Marginal)';
      const samples = K >= 0.05 ? stepSamples(K, [branch3, lower, upper]) : [{ t: 0, y: 0 }, { t: 15, y: 0 }];
      const stepPts = K >= 0.05
        ? samples.map(s => `${s.t.toFixed(3)},${Math.max(-1, Math.min(3.5, s.y)).toFixed(4)}`).join(' ')
        : '0,0 15,0';
      const stepTmax = samples[samples.length - 1].t;
      const { overshoot, settleT } = K >= 0.05 ? analyzeStep(samples) : { overshoot: 0, settleT: 0 };
      const stepNote = K < 0.05
        ? 'K≈0 — 피드백 게인이 없어 출력이 목표에 반응하지 않습니다.'
        : verdict === 'unstable'
          ? '불안정 — 진동 폭이 계속 커지며 발산합니다(정착시간 없음). 그래프 위쪽은 잘려 보입니다.'
          : `오버슈트 ${overshoot.toFixed(1)}% · 정착시간(2% 기준) ≈ ${settleT.toFixed(2)}s`;

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
          .ctl b { min-width:70px; text-align:right; color:#1e293b; }
          .step-note { font-size:12px; font-weight:800; margin-top:6px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">G(s)H(s) = K / [s(s+2)(s+4)] · 특성방정식: s³+6s²+8s+K=0</div>
        <div class="math-applied" id="rl-applied" style="color:${color}">적용: K=${K.toFixed(1)} → 극점 s=${fmtPole(branch3)}, ${fmtPole(lower)}, ${fmtPole(upper)} → ${verdictLabel}</div>
        <div class="math-desc">K를 0→70으로 올려보세요. 이탈점(K≈${K_BK.toFixed(2)})에서 진동이 시작되고, 한계이득(K=${K_CR})을 넘으면 극점이 오른쪽 반평면으로 넘어가 시스템이 발산합니다.</div>

        <cartesian-chart x-min="${RE_MIN}" x-max="${RE_MAX}" y-min="${-IM_MAX}" y-max="${IM_MAX}" x-label="σ (실수부)" y-label="jω (허수부)" disabled-aspect style="height:340px">
          <polygon points="${RE_MIN},${-IM_MAX} 0,${-IM_MAX} 0,${IM_MAX} ${RE_MIN},${IM_MAX}" color="#d1fae5" fill="rgba(16,185,129,0.10)"></polygon>
          <polygon points="0,${-IM_MAX} ${RE_MAX},${-IM_MAX} ${RE_MAX},${IM_MAX} 0,${IM_MAX}" color="#fecaca" fill="rgba(239,68,68,0.10)"></polygon>
          <series points="0,${-IM_MAX} 0,${IM_MAX}" color="#94a3b8" dash="4,4"></series>
          <series points="${ASYM_UP}" color="#c4b5fd" dash="5,4"></series>
          <series points="${ASYM_DN}" color="#c4b5fd" dash="5,4"></series>
          <series points="${LOCUS.b3}" color="#94a3b8" width="1.6"></series>
          <series points="${LOCUS.b2}" color="#94a3b8" width="1.6"></series>
          <series points="${LOCUS.b1}" color="#94a3b8" width="1.6"></series>
          <marker x="0" y="0" color="#64748b" size="5" label="열린루프극점(K=0)"></marker>
          <marker x="${-P2}" y="0" color="#64748b" size="5"></marker>
          <marker x="${-P3}" y="0" color="#64748b" size="5"></marker>
          <marker x="${S_BK.toFixed(3)}" y="0" color="#8b5cf6" size="5" label="이탈점 K≈${K_BK.toFixed(2)}"></marker>
          <marker x="0" y="${W_CR.toFixed(3)}" color="#ef4444" size="5" label="K=${K_CR} 한계"></marker>
          <marker x="0" y="${-W_CR.toFixed(3)}" color="#ef4444" size="5"></marker>
          <marker id="rl-pole-3" x="${branch3.re.toFixed(3)}" y="${branch3.im.toFixed(3)}" color="#334155" size="7" label="s=${fmtPole(branch3)}"></marker>
          <marker id="rl-pole-l" x="${lower.re.toFixed(3)}" y="${lower.im.toFixed(3)}" color="${color}" size="7" label="s=${fmtPole(lower)}"></marker>
          <marker id="rl-pole-u" x="${upper.re.toFixed(3)}" y="${upper.im.toFixed(3)}" color="${color}" size="7" label="s=${fmtPole(upper)}"></marker>
        </cartesian-chart>
        <div class="math-legend">
          <span><b style="color:#94a3b8">— 근궤적(K:0→∞)</b></span>
          <span><b style="color:#c4b5fd">- - 점근선(±60°)</b></span>
          <span><b style="color:#64748b">● 열린루프극점(K=0)</b></span>
          <span><b style="color:#8b5cf6">● 이탈점</b></span>
          <span><b style="color:#ef4444">● 한계이득(K=${K_CR})</b></span>
          <span><b style="color:${color}">● 현재 극점(K=${K.toFixed(1)})</b></span>
        </div>
        <div class="ctl"><label>K (게인) <input id="rl-k" type="range" min="0" max="70" step="0.5" value="${K}"><b id="rl-K-val">${K.toFixed(1)}</b></label></div>
        <div class="math-notes" id="rl-notes">
          <div>극점: s = ${fmtPole(branch3)}, ${fmtPole(lower)}, ${fmtPole(upper)} (최대 실수부 ${maxRe.toFixed(3)})</div>
          <div>이탈점 K≈${K_BK.toFixed(2)} (s≈${S_BK.toFixed(2)}) · 한계이득 K=${K_CR} (허수축 교차 ±j${W_CR.toFixed(2)})</div>
          <div style="font-weight:800;color:${color}">${verdictLabel}${verdict === 'unstable' ? ' — 응답이 발산합니다' : ''}</div>
        </div>

        <div class="math-title">이 게인일 때 실제 스텝응답</div>
        <cartesian-chart id="rl-step-chart" x-min="0" x-max="${stepTmax.toFixed(2)}" y-min="-1" y-max="3.5" x-label="시간(s)" y-label="목표 대비 비율" disabled-aspect style="height:180px">
          <series points="0,1 ${stepTmax.toFixed(2)},1" color="#e2e8f0" dash="4,4" label="목표"></series>
          <series id="rl-step" points="${stepPts}" color="${color}" width="2.2"></series>
        </cartesian-chart>
        <div class="step-note" id="rl-step-note" style="color:${color}">${stepNote}</div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
