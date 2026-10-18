import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-loop';

// PID/라플라스 페이지와 같은 물체: mass·x''+damping·x' = u - disturbance
const MASS = 1, DAMPING = 1.5, DISTURBANCE = 2, DT = 0.02, N = 600, SETPOINT = 5;
const T = (N - 1) * DT;

const MD = `
## 개루프(open-loop) vs 폐루프(closed-loop) 제어
- **개루프(open-loop)**: 출력을 전혀 측정하지 않고, 미리 정해둔 입력만 내보냅니다. 방해(외란)가 있어도 그걸 알아챌 방법이 없어서 절대 못 고칩니다.
- **폐루프(closed-loop, feedback)**: 출력을 측정해서 목표와 비교한 **오차**를 다시 입력으로 사용합니다. "PID 제어"의 Kp·Ki·Kd가 바로 이 오차(와 오차의 적분·미분)에 곱해지는 **"피드백 게인"**입니다 — 자세한 개념은 **"게인(이득)"** 페이지에서 다룹니다.
- 이 페이지가 쓰는 물체(mass·x''+damping·x' = u - disturbance, 로봇 팔 관절이나 드론 한 축이라고 생각하면 됩니다)로 극점 개수를 비교하면:
  - **개루프 극점(플랜트 자체, 컨트롤러 없음)**: \`mass·s² + damping·s = 0\` → 2개, \`s=0\`과 \`s=-damping/mass\`. 극점 하나가 원점(s=0)에 있다는 건 "속도가 정해지면 위치는 그냥 계속 흘러간다(적분기)"는 뜻이라, 방해가 있으면 위치가 영원히 밀려나가 버립니다(수렴하지 않고 계속 흘러감).
  - **폐루프 극점(PID 컨트롤러를 추가)**: \`mass·s³ + (damping+Kd)·s² + Kp·s + Ki = 0\` → 3개. PID의 적분항(Ki/s)이 컨트롤러 자체에 극점을 하나 더 갖고 있어서, 극점 개수가 늘어난 건 "루프를 닫아서"가 아니라 **컨트롤러가 극점을 하나 더 보태서**입니다. 대신 이 극점 3개를 전부 왼쪽(안정)으로 배치할 수 있어서, 방해가 있어도 정확히 목표로 수렴합니다.
- 아래에서 Kp·Ki·Kd를 움직여, 개루프(회색, 고정)와 폐루프(색깔, 움직임) 극점이 s평면에서 어떻게 다른지, 그리고 그게 실제로 만드는 시간 응답이 얼마나 다른지 비교해 보세요.
- **관련 페이지**: "PID 제어", "라플라스 변환", "게인(이득)", "감쇠비·고유진동수", "시정수(τ)" — 전부 이 같은 물체(mass=1, damping=1.5, disturbance=2)를 기준으로 이어집니다.
- **어디에 쓰이나요?** — 로봇 팔이 마찰·중력 때문에 원하는 각도에 못 미치는 문제, 드론이 바람에 밀리는 문제, 서보모터가 부하를 못 이기는 문제 — 전부 "개루프로는 못 고치고 폐루프(피드백)라야 고쳐진다"의 실제 예시입니다.
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

// 개루프 극점: 플랜트만 (mass·s²+damping·s=0) — 컨트롤러가 없어서 Kp/Ki/Kd에 영향받지 않고 고정.
const OPEN_POLES: Cx[] = [[0, 0], [-DAMPING / MASS, 0]];

// 폐루프 극점: PID를 붙인 특성방정식 mass·s³+(damping+Kd)s²+Kp·s+Ki=0
function closedPoles(Kp: number, Ki: number, Kd: number): Cx[] {
  return cubicRoots((DAMPING + Kd) / MASS, Kp / MASS, Ki / MASS);
}

const S_MIN = -9, S_MAX = 2, W_MAX = 5;

/** 개루프: 컨트롤러 없음(u=0) — 방해만 있는 채로 그냥 흘러간다. */
function openLoopSim(): number[] {
  let x = 0, v = 0;
  const xs = [x];
  for (let i = 1; i < N; i++) {
    const a = (0 - DAMPING * v - DISTURBANCE) / MASS;
    v += a * DT; x += v * DT;
    xs.push(x);
  }
  return xs;
}
const OPEN_XS = openLoopSim();

/** 폐루프: "PID 제어" 페이지와 똑같은 물체 시뮬레이션. */
function closedLoopSim(Kp: number, Ki: number, Kd: number): number[] {
  let x = 0, v = 0, integral = 0, prevError = SETPOINT - x;
  const xs = [x];
  for (let i = 1; i < N; i++) {
    const error = SETPOINT - x;
    integral += error * DT;
    const derivative = (error - prevError) / DT;
    const u = Kp * error + Ki * integral + Kd * derivative;
    const a = (u - DAMPING * v - DISTURBANCE) / MASS;
    v += a * DT; x += v * DT;
    prevError = error;
    xs.push(x);
  }
  return xs;
}
function ptsStr(xs: number[]) { return xs.map((x, i) => `${(i * DT).toFixed(3)},${x.toFixed(4)}`).join(' '); }
const OPEN_PTS = ptsStr(OPEN_XS);

function poleColor(sigma: number) {
  if (sigma < -0.02) return '#10b981';
  if (Math.abs(sigma) <= 0.02) return '#f59e0b';
  return '#ef4444';
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathLoop extends w.HTMLElement {
    private Kp = 6;
    private Ki = 2;
    private Kd = 2;

    private refresh() {
      const { Kp, Ki, Kd } = this;
      const poles = closedPoles(Kp, Ki, Kd);
      const maxRe = Math.max(...poles.map(p => p[0]));
      const color = poleColor(maxRe);

      const applied = this.shadowRoot?.querySelector('#lp-applied') as HTMLElement;
      if (applied) { applied.style.color = color; applied.textContent = `적용: Kp=${Kp.toFixed(1)}, Ki=${Ki.toFixed(1)}, Kd=${Kd.toFixed(1)} → 폐루프 극점 중 가장 오른쪽 Re(s)=${maxRe.toFixed(2)} (개루프는 항상 s=0, ${(-DAMPING / MASS).toFixed(2)} 고정)`; }

      (['Kp', 'Ki', 'Kd'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#lp-${k}-val`) as HTMLElement;
        if (el) el.textContent = this[k].toFixed(1);
      });

      poles.forEach((p, i) => {
        const el = this.shadowRoot?.querySelector(`#lp-cpole-${i}`) as HTMLElement;
        if (!el) return;
        el.setAttribute('x', p[0].toFixed(3)); el.setAttribute('y', p[1].toFixed(3)); el.setAttribute('color', color);
        el.setAttribute('label', `s${i + 1}=${p[0].toFixed(2)}${p[1] >= 0 ? '+' : ''}${p[1].toFixed(2)}j`);
      });

      const closedXs = closedLoopSim(Kp, Ki, Kd);
      const closedCurve = this.shadowRoot?.querySelector('#lp-closed-curve') as HTMLElement;
      if (closedCurve) { closedCurve.setAttribute('points', ptsStr(closedXs)); closedCurve.setAttribute('color', color); }

      const openFinal = OPEN_XS[OPEN_XS.length - 1];
      const closedFinal = closedXs[closedXs.length - 1];
      const notes = this.shadowRoot?.querySelector('#lp-notes') as HTMLElement;
      if (notes) notes.innerHTML = `<div>개루프(회색, u=0): 방해(외란=${DISTURBANCE})만 있어서 t=${T.toFixed(1)}s에 위치가 ${openFinal.toFixed(2)}까지 밀려남 — 목표(5)와 점점 더 멀어짐</div>` +
        `<div>폐루프(색깔, PID): 같은 방해가 있어도 t=${T.toFixed(1)}s에 위치가 ${closedFinal.toFixed(2)} — 목표(5)로 수렴${Math.abs(closedFinal - SETPOINT) < 0.3 ? ' 완료' : ' 중'}</div>`;
    }

    @addEventListener('#lp-kp', 'input')
    onKp(e: Event) { this.Kp = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#lp-ki', 'input')
    onKi(e: Event) { this.Ki = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#lp-kd', 'input')
    onKd(e: Event) { this.Kd = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { Kp, Ki, Kd } = this;
      const poles = closedPoles(Kp, Ki, Kd);
      const maxRe = Math.max(...poles.map(p => p[0]));
      const color = poleColor(maxRe);
      const closedXs = closedLoopSim(Kp, Ki, Kd);
      const openFinal = OPEN_XS[OPEN_XS.length - 1];
      const closedFinal = closedXs[closedXs.length - 1];

      const openPoleTags = OPEN_POLES.map((p, i) => `<marker id="lp-opole-${i}" x="${p[0]}" y="${p[1]}" color="#94a3b8" size="6" label="개루프 s${i + 1}=${p[0].toFixed(2)}"></marker>`).join('\n          ');
      const closedPoleTags = poles.map((p, i) => `<marker id="lp-cpole-${i}" x="${p[0].toFixed(3)}" y="${p[1].toFixed(3)}" color="${color}" size="6" label="s${i + 1}=${p[0].toFixed(2)}${p[1] >= 0 ? '+' : ''}${p[1].toFixed(2)}j"></marker>`).join('\n          ');

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
          .lp-flow { display:flex; align-items:stretch; gap:6px; flex-wrap:wrap; margin:10px 0; }
          .lp-box { flex:1; min-width:110px; background:#fff; border:1.5px solid #e2e8f0; border-radius:10px; padding:8px 10px; text-align:center; }
          .lp-box b { display:block; font-size:12px; color:#1e293b; margin-bottom:2px; }
          .lp-box span { font-size:10.5px; color:#64748b; }
          .lp-arrow { display:flex; align-items:center; font-size:16px; color:#94a3b8; }
          .lp-box.open { border-color:#94a3b8; background:#f8fafc; }
          .lp-box.disturb { border-color:#ef4444; background:#fef2f2; }
          .lp-box.plant { border-color:#334155; background:#f1f5f9; }
          .lp-box.pid { border-color:#6366f1; background:#eef2ff; }
          .lp-box.sensor { border-color:#10b981; background:#ecfdf5; }
        </style>
        <div class="math-formula">개루프(open-loop) vs 폐루프(closed-loop) — 오차를 되먹이는지 여부</div>

        <div class="math-title">구조 비교</div>
        <div class="math-desc">개루프는 출력을 안 보고 그냥 내보내고, 폐루프는 출력을 측정(센서)해서 목표와 비교한 오차를 다시 입력으로 씁니다.</div>
        <div class="lp-flow">
          <div class="lp-box open"><b>입력(고정)</b><span>u = 0 (측정 없음)</span></div>
          <div class="lp-arrow">→</div>
          <div class="lp-box plant"><b>물체(plant)</b><span>mass·x''+damping·x'=u-d</span></div>
          <div class="lp-arrow">→</div>
          <div class="lp-box disturb"><b>출력</b><span>목표로 못 돌아옴</span></div>
        </div>
        <div class="lp-flow" style="margin-top:-6px">
          <div class="lp-box pid"><b>PID 컨트롤러</b><span>u=Kp·e+Ki∫e+Kd·e'</span></div>
          <div class="lp-arrow">→</div>
          <div class="lp-box plant"><b>물체(plant)</b><span>mass·x''+damping·x'=u-d</span></div>
          <div class="lp-arrow">→</div>
          <div class="lp-box sensor"><b>출력(측정)</b><span>목표로 수렴</span></div>
        </div>
        <div class="lp-flow" style="margin-top:-6px">
          <div class="lp-box" style="visibility:hidden"><b>·</b></div>
          <div class="lp-arrow" style="visibility:hidden">→</div>
          <div class="lp-box" style="visibility:hidden"><b>·</b></div>
          <div class="lp-arrow">↖ 오차 e = 목표 - 출력, 되먹임(feedback)</div>
        </div>

        <div class="math-title">s평면 극점 비교 — 개루프(회색, 고정) vs 폐루프(색깔, Kp·Ki·Kd로 이동)</div>
        <div class="math-applied" id="lp-applied" style="color:${color}">적용: Kp=${Kp.toFixed(1)}, Ki=${Ki.toFixed(1)}, Kd=${Kd.toFixed(1)} → 폐루프 극점 중 가장 오른쪽 Re(s)=${maxRe.toFixed(2)} (개루프는 항상 s=0, ${(-DAMPING / MASS).toFixed(2)} 고정)</div>
        <div class="math-desc">개루프 극점은 컨트롤러가 없어서 절대 안 움직입니다(고정 2개). 폐루프 극점은 PID 게인에 따라 3개가 실시간으로 움직입니다.</div>
        <cartesian-chart x-min="${S_MIN}" x-max="${S_MAX}" y-min="${-W_MAX}" y-max="${W_MAX}" x-label="σ (실수부)" y-label="ω (허수부)" disabled-aspect style="height:220px">
          <polygon points="${S_MIN},${-W_MAX} 0,${-W_MAX} 0,${W_MAX} ${S_MIN},${W_MAX}" color="#d1fae5" fill="rgba(16,185,129,0.10)"></polygon>
          <polygon points="0,${-W_MAX} ${S_MAX},${-W_MAX} ${S_MAX},${W_MAX} 0,${W_MAX}" color="#fecaca" fill="rgba(239,68,68,0.10)"></polygon>
          <series points="0,${-W_MAX} 0,${W_MAX}" color="#94a3b8" dash="4,4"></series>
          ${openPoleTags}
          ${closedPoleTags}
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#94a3b8">● 개루프 극점(고정)</b></span><span><b style="color:${color}">● 폐루프 극점(움직임)</b></span></div>

        <div class="math-title">실제 위치 응답 비교 (같은 방해 disturbance=${DISTURBANCE})</div>
        <cartesian-chart x-min="0" x-max="${T}" y-min="-16" y-max="8" x-label="시간(s)" y-label="위치" style="height:220px">
          <series points="0,${SETPOINT} ${T},${SETPOINT}" color="#cbd5e1" dash="4,4" label="목표"></series>
          <series id="lp-open-curve" points="${OPEN_PTS}" color="#94a3b8" width="2" label="개루프(u=0)"></series>
          <series id="lp-closed-curve" points="${ptsStr(closedXs)}" color="${color}" width="2.2" label="폐루프(PID)"></series>
        </cartesian-chart>
        <div class="math-notes" id="lp-notes">
          <div>개루프(회색, u=0): 방해(외란=${DISTURBANCE})만 있어서 t=${T.toFixed(1)}s에 위치가 ${openFinal.toFixed(2)}까지 밀려남 — 목표(5)와 점점 더 멀어짐</div>
          <div>폐루프(색깔, PID): 같은 방해가 있어도 t=${T.toFixed(1)}s에 위치가 ${closedFinal.toFixed(2)} — 목표(5)로 수렴${Math.abs(closedFinal - SETPOINT) < 0.3 ? ' 완료' : ' 중'}</div>
        </div>
        <div class="ctl"><label>Kp (비례) <input id="lp-kp" type="range" min="0" max="15" step="0.5" value="${Kp}"><b id="lp-Kp-val">${Kp.toFixed(1)}</b></label></div>
        <div class="ctl"><label>Ki (적분) <input id="lp-ki" type="range" min="0" max="8" step="0.2" value="${Ki}"><b id="lp-Ki-val">${Ki.toFixed(1)}</b></label></div>
        <div class="ctl"><label>Kd (미분) <input id="lp-kd" type="range" min="0" max="8" step="0.2" value="${Kd}"><b id="lp-Kd-val">${Kd.toFixed(1)}</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
