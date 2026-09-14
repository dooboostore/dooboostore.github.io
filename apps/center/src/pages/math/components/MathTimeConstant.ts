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

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathTimeConstant extends w.HTMLElement {
    private tau = 1.0;

    private refresh() {
      const { tau } = this;
      const T = tau * 6;
      const pole = -1 / tau;

      const applied = this.shadowRoot?.querySelector('#tc-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: τ=${tau.toFixed(2)}s → 1τ 지점(${tau.toFixed(2)}s)에서 63.2% 도달, 극점 s=${pole.toFixed(2)}`;

      const notes = this.shadowRoot?.querySelector('#tc-notes') as HTMLElement;
      if (notes) notes.innerHTML = MILESTONES.map(m => `<div>${m}τ = ${(m * tau).toFixed(2)}s → ${(step(m * tau, tau) * 100).toFixed(1)}%</div>`).join('');

      const tauVal = this.shadowRoot?.querySelector('#tc-tau-val') as HTMLElement;
      if (tauVal) tauVal.textContent = `${tau.toFixed(2)}s`;

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
    }

    @addEventListener('#tc-tau', 'input')
    onTau(e: Event) { this.tau = Number((e.target as HTMLInputElement).value) || 0.1; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { tau } = this;
      const T = tau * 6;
      const pole = -1 / tau;
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
        <cartesian-chart x-min="0" x-max="${T}" y-min="0" y-max="1.05" x-label="시간(s)" y-label="목표 대비 비율">
          <series points="0,1 ${T},1" color="#e2e8f0" dash="4,4"></series>
          ${lineTags}
          <series id="tc-curve" points="${curveStr(tau, T)}" color="#3e63dd" width="2.2"></series>
          ${markTags}
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#3e63dd">— x(t)=1-e^(-t/τ)</b></span><span><b style="color:#f59e0b">● 1τ,2τ,3τ,5τ 지점</b></span></div>
        <div class="math-notes" id="tc-notes">${MILESTONES.map(m => `<div>${m}τ = ${(m * tau).toFixed(2)}s → ${(step(m * tau, tau) * 100).toFixed(1)}%</div>`).join('')}</div>
        <div class="ctl"><label>τ (시정수) <input id="tc-tau" type="range" min="0.1" max="5" step="0.1" value="${tau}"><b id="tc-tau-val">${tau.toFixed(2)}s</b></label></div>

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
