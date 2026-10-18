import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-timeconstant';

const MD = `
## 시정수(time constant, τ)란?
- 1차 시스템(RC 회로, 센서 반응, 모터 속도 등)이 **"목표까지 변화량의 63.2%에 도달하는 데 걸리는 시간"**입니다.
- 수식: 목표를 향해 다가가는 응답 \`x(t) = x_final·(1 - e^(-t/τ))\`, 반대로 줄어드는 응답은 \`x(t) = x0·e^(-t/τ)\`
- τ가 지나면 **63.2%**, 2τ면 86.5%, 3τ면 95.0%, **5τ면 99.3%**에 도달합니다 — 실무에서는 "5τ 지나면 거의 다 끝났다"고 봅니다.
- **"라플라스 변환" 페이지와 연결**: 1차 시스템의 극점은 실수축 위 \`s = -1/τ\`에 있습니다. τ가 작을수록(빠른 시스템) 극점이 원점에서 멀리(왼쪽으로) 떨어지고, τ가 클수록(느린 시스템) 극점이 원점에 가까워집니다.
- **"미분" 페이지와도 연결**: 이 응답은 미분방정식 \`dx/dt = (x_final - x)/τ\`를 풀어서 나온 것입니다 — 지금 값과 목표의 차이에 비례해서 다가가는 가장 단순한 1차 반응입니다.
- **왜 하필 63.2%인가?** — τ 구간을 n개의 아주 작은 계단으로 쪼개서, 매 계단마다 "남은 양"의 1/n만큼씩 깎아나가면 n번 뒤에 남는 비율은 \`(1-1/n)ⁿ\`입니다. 계단을 무한히 잘게 쪼개면(n→∞) 이 값이 정확히 **e⁻¹ ≈ 0.3679**로 수렴합니다 — 그래서 τ 시점에 남는 양이 e⁻¹, 도달한 양이 1-e⁻¹=**63.2%**가 되는 겁니다. "**자연상수 e로 수렴하는 것들**" 페이지의 \`(1+1/n)ⁿ→e\`와 부호만 반대인 완전히 같은 원리입니다.
- **어디에 쓰이나요?** — 센서(온도·거리) 반응 속도, RC 저역통과 필터의 차단 특성, 모터·배터리 충방전 속도, 로봇 관절이 명령을 따라가는 반응 속도.
`;

function step(t: number, tau: number) { return 1 - Math.exp(-t / tau); }

function curveStr(tau: number, T: number, n = 200) {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (T * i) / n;
    pts.push(`${t.toFixed(4)},${step(t, tau).toFixed(5)}`);
  }
  return pts.join(' ');
}

const MILESTONES = [1, 2, 3, 5];

// ── 이산(discrete) 근사가 e⁻¹로 수렴하는 과정 ──────────────────────────
const E_INV = 1 / Math.E; // ≈ 0.367879441
const N_MAX = 60;

/** τ를 n계단으로 쪼갰을 때, n번 뒤에 남는 비율: (1-1/n)ⁿ */
function discreteRemain(n: number) { return Math.pow(1 - 1 / n, n); }

/** [0,T] 전체를 τ당 n계단으로 쪼갠 계단식(staircase) 근사 곡선 */
function discreteStaircase(tau: number, T: number, n: number) {
  const totalSteps = Math.max(1, Math.round((T / tau) * n));
  const dt = T / totalSteps;
  const r = 1 - 1 / n;
  const pts: string[] = [`0,0`];
  let v = 0;
  for (let i = 1; i <= totalSteps; i++) {
    const t1 = i * dt;
    pts.push(`${t1.toFixed(4)},${v.toFixed(5)}`); // 다음 계단 전까지 값 유지(수평)
    v = 1 - Math.pow(r, i);
    pts.push(`${t1.toFixed(4)},${v.toFixed(5)}`); // 계단 점프(수직)
  }
  return pts.join(' ');
}

/** n=1..N_MAX 에 대한 (1-1/n)ⁿ 값 — e⁻¹로 수렴하는 걸 보여주는 그래프용 */
function convergeCurve() {
  const pts: string[] = [];
  for (let n = 1; n <= N_MAX; n++) pts.push(`${n},${discreteRemain(n).toFixed(6)}`);
  return pts.join(' ');
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathTimeConstant extends w.HTMLElement {
    private tau = 1.0;
    private n = 8;

    private refresh() {
      const { tau, n } = this;
      const T = tau * 6;
      const pole = -1 / tau;

      const applied = this.shadowRoot?.querySelector('#tc-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: τ=${tau.toFixed(2)}s → 1τ 지점(${tau.toFixed(2)}s)에서 63.2% 도달, 극점 s=${pole.toFixed(2)}`;

      const notes = this.shadowRoot?.querySelector('#tc-notes') as HTMLElement;
      if (notes) notes.innerHTML = MILESTONES.map(m => `<div>${m}τ = ${(m * tau).toFixed(2)}s → ${(step(m * tau, tau) * 100).toFixed(1)}%</div>`).join('');

      const tauVal = this.shadowRoot?.querySelector('#tc-tau-val') as HTMLElement;
      if (tauVal) tauVal.textContent = `${tau.toFixed(2)}s`;

      const chart = this.shadowRoot?.querySelector('#tc-chart') as HTMLElement;
      if (chart) chart.setAttribute('x-max', String(T));
      const curve = this.shadowRoot?.querySelector('#tc-curve') as HTMLElement;
      if (curve) curve.setAttribute('points', curveStr(tau, T));

      MILESTONES.forEach((m, i) => {
        const t = m * tau, v = step(t, tau);
        const line = this.shadowRoot?.querySelector(`#tc-line-${i}`) as HTMLElement;
        if (line) line.setAttribute('points', `${t.toFixed(3)},0 ${t.toFixed(3)},${v.toFixed(4)} 0,${v.toFixed(4)}`);
        const mk = this.shadowRoot?.querySelector(`#tc-mk-${i}`) as HTMLElement;
        if (mk) { mk.setAttribute('x', t.toFixed(3)); mk.setAttribute('y', v.toFixed(4)); mk.setAttribute('label', `${m}τ: ${(v * 100).toFixed(0)}%`); }
      });

      const poleMk = this.shadowRoot?.querySelector('#tc-pole') as HTMLElement;
      if (poleMk) { poleMk.setAttribute('x', pole.toFixed(3)); poleMk.setAttribute('label', `s=-1/τ=${pole.toFixed(2)}`); }

      // ── 이산 근사(계단) 섹션 ──
      const remain = discreteRemain(n);
      const reached = 1 - remain;
      const applied2 = this.shadowRoot?.querySelector('#tc-applied2') as HTMLElement;
      if (applied2) applied2.textContent = `적용: n=${n} → (1-1/n)ⁿ = ${remain.toFixed(5)}(오차 ${(remain - E_INV).toExponential(2)}) → τ에서 ${(reached * 100).toFixed(2)}% 도달`;

      const nVal = this.shadowRoot?.querySelector('#tc-n-val') as HTMLElement;
      if (nVal) nVal.textContent = String(n);

      const chart2 = this.shadowRoot?.querySelector('#tc-chart2') as HTMLElement;
      if (chart2) chart2.setAttribute('x-max', String(T));
      const curve2 = this.shadowRoot?.querySelector('#tc-curve2') as HTMLElement;
      if (curve2) curve2.setAttribute('points', curveStr(tau, T));
      const stair = this.shadowRoot?.querySelector('#tc-stair') as HTMLElement;
      if (stair) stair.setAttribute('points', discreteStaircase(tau, T, n));
      const tauMk2 = this.shadowRoot?.querySelector('#tc-tau-mk2') as HTMLElement;
      if (tauMk2) { tauMk2.setAttribute('x', tau.toFixed(3)); tauMk2.setAttribute('y', reached.toFixed(4)); tauMk2.setAttribute('label', `τ: ${(reached * 100).toFixed(1)}%`); }

      const nMk = this.shadowRoot?.querySelector('#tc-n-mk') as HTMLElement;
      if (nMk) { nMk.setAttribute('x', String(n)); nMk.setAttribute('y', remain.toFixed(6)); nMk.setAttribute('label', `n=${n}: ${remain.toFixed(4)}`); }

      const notes2 = this.shadowRoot?.querySelector('#tc-notes2') as HTMLElement;
      if (notes2) notes2.innerHTML =
        `<div>(1-1/n)ⁿ = ${remain.toFixed(6)}, 오차 = ${(remain - E_INV).toExponential(2)}</div>` +
        `<div>1-(1-1/n)ⁿ = ${reached.toFixed(4)} (${(reached * 100).toFixed(2)}%) — n→∞이면 63.2%(=1-e⁻¹)에 정확히 수렴</div>`;
    }

    @addEventListener('#tc-tau', 'input')
    onTau(e: Event) { this.tau = Number((e.target as HTMLInputElement).value) || 0.1; this.refresh(); }
    @addEventListener('#tc-n', 'input')
    onN(e: Event) { this.n = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { tau, n } = this;
      const T = tau * 6;
      const pole = -1 / tau;
      const remain = discreteRemain(n);
      const reached = 1 - remain;
      const lineTags = MILESTONES.map((m, i) => {
        const t = m * tau, v = step(t, tau);
        return `<series id="tc-line-${i}" points="${t.toFixed(3)},0 ${t.toFixed(3)},${v.toFixed(4)} 0,${v.toFixed(4)}" color="#94a3b8" dash="3,3"></series>`;
      }).join('\n          ');
      const markTags = MILESTONES.map((m, i) => {
        const t = m * tau, v = step(t, tau);
        return `<marker id="tc-mk-${i}" x="${t.toFixed(3)}" y="${v.toFixed(4)}" color="#f59e0b" size="4" label="${m}τ: ${(v * 100).toFixed(0)}%"></marker>`;
      }).join('\n          ');
      return `
        <style>
          :host { display:block; }
          .math-title { font-size:13px; font-weight:800; color:#475569; margin:12px 0 2px; }
          .math-title:first-child { margin-top:0; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; color:#6366f1; margin-bottom:8px; }
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
        <div class="math-formula">x(t) = 1 - e^(-t/τ) — τ, 2τ, 3τ, 5τ 지점에서 몇 % 도달하는지</div>
        <div class="math-applied" id="tc-applied">적용: τ=${tau.toFixed(2)}s → 1τ 지점(${tau.toFixed(2)}s)에서 63.2% 도달, 극점 s=${pole.toFixed(2)}</div>
        <div class="math-desc">τ를 바꾸면 곡선이 빨라지거나 느려집니다. 1τ에서 항상 63.2%(주황 점)에 도달하는 걸 확인하세요.</div>
        <cartesian-chart id="tc-chart" x-min="0" x-max="${T}" y-min="0" y-max="1.05" x-label="시간(s)" y-label="목표 대비 비율">
          <series points="0,1 ${T},1" color="#e2e8f0" dash="4,4"></series>
          ${lineTags}
          <series id="tc-curve" points="${curveStr(tau, T)}" color="#3e63dd" width="2.2"></series>
          ${markTags}
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#3e63dd">— x(t)=1-e^(-t/τ)</b></span><span><b style="color:#f59e0b">● 1τ,2τ,3τ,5τ 지점</b></span></div>
        <div class="math-notes" id="tc-notes">${MILESTONES.map(m => `<div>${m}τ = ${(m * tau).toFixed(2)}s → ${(step(m * tau, tau) * 100).toFixed(1)}%</div>`).join('')}</div>
        <div class="ctl"><label>τ (시정수) <input id="tc-tau" type="range" min="0.1" max="5" step="0.1" value="${tau}"><b id="tc-tau-val">${tau.toFixed(2)}s</b></label></div>

        <div class="math-title">왜 항상 63.2%인가 — 이산(discrete) 근사가 e⁻¹로 수렴</div>
        <div class="math-formula">τ를 n계단으로 쪼개 매번 (1-1/n)씩 깎으면: 남는 비율 = (1-1/n)ⁿ → e⁻¹ (n→∞)</div>
        <div class="math-applied" id="tc-applied2">적용: n=${n} → (1-1/n)ⁿ = ${remain.toFixed(5)}(오차 ${(remain - E_INV).toExponential(2)}) → τ에서 ${(reached * 100).toFixed(2)}% 도달</div>
        <div class="math-desc">n(계단 개수)을 늘려보세요. 계단식 근사(주황)가 점점 매끄러운 곡선(파랑)에 달라붙습니다 — τ 지점의 값이 정확히 (1-1/n)ⁿ이고, n→∞이면 63.2%(=1-e⁻¹)에 수렴합니다.</div>
        <cartesian-chart id="tc-chart2" x-min="0" x-max="${T}" y-min="0" y-max="1.05" x-label="시간(s)" y-label="목표 대비 비율" style="height:180px">
          <series points="0,1 ${T},1" color="#e2e8f0" dash="4,4"></series>
          <series id="tc-curve2" points="${curveStr(tau, T)}" color="#3e63dd" width="1.6"></series>
          <series id="tc-stair" points="${discreteStaircase(tau, T, n)}" color="#f59e0b" width="1.8"></series>
          <marker id="tc-tau-mk2" x="${tau.toFixed(3)}" y="${reached.toFixed(4)}" color="#8b5cf6" size="5" label="τ: ${(reached * 100).toFixed(1)}%"></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#3e63dd">— 연속 x(t)=1-e^(-t/τ)</b></span><span><b style="color:#f59e0b">— 이산 n계단 근사</b></span></div>
        <div class="ctl"><label>n (τ당 계단 수) <input id="tc-n" type="range" min="1" max="${N_MAX}" step="1" value="${n}"><b id="tc-n-val">${n}</b></label></div>

        <div class="math-title">(1-1/n)ⁿ → e⁻¹ 수렴 그래프</div>
        <cartesian-chart x-min="1" x-max="${N_MAX}" y-min="0.2" y-max="1" x-label="n" y-label="(1-1/n)ⁿ" disabled-aspect style="height:160px">
          <series points="1,${E_INV.toFixed(6)} ${N_MAX},${E_INV.toFixed(6)}" color="#94a3b8" dash="4,4" label="1/e"></series>
          <series points="${convergeCurve()}" color="#8b5cf6" width="2"></series>
          <marker id="tc-n-mk" x="${n}" y="${remain.toFixed(6)}" color="#f59e0b" size="5" label="n=${n}: ${remain.toFixed(4)}"></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#94a3b8">- - 1/e = 0.36788...</b></span><span><b style="color:#8b5cf6">— (1-1/n)ⁿ</b></span><span><b style="color:#f59e0b">● 현재 n</b></span></div>
        <div class="math-notes" id="tc-notes2">
          <div>(1-1/n)ⁿ = ${remain.toFixed(6)}, 오차 = ${(remain - E_INV).toExponential(2)}</div>
          <div>1-(1-1/n)ⁿ = ${reached.toFixed(4)} (${(reached * 100).toFixed(2)}%) — n→∞이면 63.2%(=1-e⁻¹)에 정확히 수렴</div>
        </div>

        <div class="math-title">라플라스 극점 s = -1/τ (실수축 위, 1차 시스템)</div>
        <cartesian-chart x-min="-11" x-max="2" y-min="-2" y-max="2" x-label="σ (실수부)" y-label="ω (허수부)" disabled-aspect style="height:150px">
          <polygon points="-11,-2 0,-2 0,2 -11,2" color="#d1fae5" fill="rgba(16,185,129,0.10)"></polygon>
          <polygon points="0,-2 2,-2 2,2 0,2" color="#fecaca" fill="rgba(239,68,68,0.10)"></polygon>
          <series points="0,-2 0,2" color="#94a3b8" dash="4,4"></series>
          <marker id="tc-pole" x="${pole.toFixed(3)}" y="0" color="#10b981" size="6" label="s=-1/τ=${pole.toFixed(2)}"></marker>
        </cartesian-chart>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
