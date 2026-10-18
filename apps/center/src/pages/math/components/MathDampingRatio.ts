import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-damping';

const MD = `
## 감쇠비(ζ)와 고유진동수(ωn)란?
- 2차 시스템(스프링-댐퍼, PID로 제어되는 로봇팔 등)을 **표준형**으로 쓰면: \`s² + 2ζωn·s + ωn² = 0\`
- **ωn(고유진동수, natural frequency)**: 감쇠(마찰)가 전혀 없다면 진동하는 빠르기
- **ζ(감쇠비, damping ratio)**: 진동을 얼마나 눌러주는지 결정합니다
  - **ζ=0**: 무감쇠 — 영원히 진동
  - **0<ζ<1**: 부족감쇠(underdamped) — 진동하며 줄어듦 (오버슈트 있음)
  - **ζ=1**: 임계감쇠(critically damped) — 진동 없이 가장 빠르게 도달
  - **ζ>1**: 과감쇠(overdamped) — 진동은 없지만 느림
- 극점(부족감쇠일 때): \`s = -ζωn ± jωn√(1-ζ²)\` — 실수부가 **"라플라스 변환"** 페이지의 σ, 허수부가 ω와 정확히 같습니다.
- **오버슈트 공식**: \`%OS = 100·e^(-ζπ/√(1-ζ²))\` — ζ=0.7을 넣으면 정확히 **4.6%**가 나옵니다(교과서에서 "적당히 좋은 감쇠"로 자주 인용되는 값).
- **정착시간 ≈ 4/(ζωn)** — **"시정수(τ)"** 페이지의 "5τ면 거의 다 됐다" 규칙과 같은 개념입니다(여기선 τ=1/(ζωn)).
- **어디에 쓰이나요?** — 로봇팔·드론 제어기를 설계할 때 "오버슈트 5% 이하, 0.5초 안에 정착" 같은 목표를 ζ·ωn으로 직접 계산해서 게인을 정합니다. **"PID 제어"** 페이지의 지배적인 극점쌍도 이 ζ·ωn으로 근사해 설명할 수 있습니다.
`;

function stepResponse(t: number, zeta: number, wn: number): number {
  if (zeta < 0.999) {
    const wd = wn * Math.sqrt(1 - zeta * zeta);
    const phi = Math.acos(zeta);
    return 1 - (Math.exp(-zeta * wn * t) / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t + phi);
  }
  if (zeta < 1.001) return 1 - Math.exp(-wn * t) * (1 + wn * t);
  const a = wn * Math.sqrt(zeta * zeta - 1);
  return 1 - Math.exp(-zeta * wn * t) * (Math.cosh(a * t) + (zeta / Math.sqrt(zeta * zeta - 1)) * Math.sinh(a * t));
}

function poles(zeta: number, wn: number): [number, number][] {
  if (zeta < 1) {
    const wd = wn * Math.sqrt(1 - zeta * zeta);
    return [[-zeta * wn, wd], [-zeta * wn, -wd]];
  }
  const a = wn * Math.sqrt(zeta * zeta - 1);
  return [[-zeta * wn + a, 0], [-zeta * wn - a, 0]];
}

function overshootPct(zeta: number) { return zeta >= 1 ? 0 : 100 * Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta)); }
function peakTime(zeta: number, wn: number) { return zeta >= 1 ? NaN : Math.PI / (wn * Math.sqrt(1 - zeta * zeta)); }
function settleTime(zeta: number, wn: number) { return 4 / Math.max(zeta * wn, 0.05); }

function regime(zeta: number) {
  if (zeta < 0.02) return '무감쇠 (undamped)';
  if (zeta < 0.98) return '부족감쇠 (underdamped)';
  if (zeta <= 1.02) return '임계감쇠 (critically damped)';
  return '과감쇠 (overdamped)';
}

function curveStr(zeta: number, wn: number, T: number, n = 220) {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (T * i) / n;
    pts.push(`${t.toFixed(4)},${stepResponse(t, zeta, wn).toFixed(5)}`);
  }
  return pts.join(' ');
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathDampingRatio extends w.HTMLElement {
    private zeta = 0.7;
    private wn = 3;

    private refresh() {
      const { zeta, wn } = this;
      const T = 20 / wn;
      const os = overshootPct(zeta);
      const ts = settleTime(zeta, wn);
      const tp = peakTime(zeta, wn);
      const color = zeta < 0.98 ? (zeta < 0.02 ? '#ef4444' : '#f59e0b') : '#10b981';

      const applied = this.shadowRoot?.querySelector('#dmp-applied') as HTMLElement;
      if (applied) { applied.style.color = color; applied.textContent = `적용: ζ=${zeta.toFixed(2)}, ωn=${wn.toFixed(1)} → ${regime(zeta)}, 오버슈트 ${os.toFixed(1)}%, 정착시간 ${ts.toFixed(2)}s`; }

      const notes = this.shadowRoot?.querySelector('#dmp-notes') as HTMLElement;
      if (notes) notes.innerHTML = `<div>극점 s = -ζωn ± j·ωn√(1-ζ²) = ${(-zeta * wn).toFixed(2)} ${zeta < 1 ? `± ${(wn * Math.sqrt(1 - zeta * zeta)).toFixed(2)}j` : `, ${(-zeta * wn + wn * Math.sqrt(Math.max(zeta * zeta - 1, 0))).toFixed(2)}`}</div>` +
        `<div>오버슈트 %OS = 100·e^(-ζπ/√(1-ζ²)) = ${os.toFixed(2)}%</div>` +
        `<div>${!Number.isNaN(tp) ? `첨두시간(peak time) = π/ωd = ${tp.toFixed(2)}s<br>` : ''}정착시간(2% 기준) ≈ 4/(ζωn) = ${ts.toFixed(2)}s</div>`;

      (['zeta', 'wn'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#dmp-${k}-val`) as HTMLElement;
        if (el) el.textContent = k === 'zeta' ? this.zeta.toFixed(2) : `${this.wn.toFixed(1)} rad/s`;
      });

      const curve = this.shadowRoot?.querySelector('#dmp-curve') as HTMLElement;
      if (curve) { curve.setAttribute('points', curveStr(zeta, wn, T)); curve.setAttribute('color', color); }

      const ps = poles(zeta, wn);
      ps.forEach((p, i) => {
        const el = this.shadowRoot?.querySelector(`#dmp-pole-${i}`) as HTMLElement;
        if (!el) return;
        el.setAttribute('x', p[0].toFixed(3)); el.setAttribute('y', p[1].toFixed(3)); el.setAttribute('color', color);
        el.setAttribute('label', `s${i + 1}=${p[0].toFixed(2)}${p[1] >= 0 ? '+' : ''}${p[1].toFixed(2)}j`);
      });

      const peakMk = this.shadowRoot?.querySelector('#dmp-peak') as HTMLElement;
      if (peakMk) {
        if (!Number.isNaN(tp) && tp <= T) { peakMk.setAttribute('x', tp.toFixed(3)); peakMk.setAttribute('y', stepResponse(tp, zeta, wn).toFixed(4)); peakMk.setAttribute('label', `첨두 ${(1 + os / 100).toFixed(2)}`); }
        else { peakMk.setAttribute('x', '-999'); peakMk.setAttribute('y', '-999'); }
      }
    }

    @addEventListener('#dmp-zeta', 'input')
    onZeta(e: Event) { this.zeta = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#dmp-wn', 'input')
    onWn(e: Event) { this.wn = Number((e.target as HTMLInputElement).value) || 0.5; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { zeta, wn } = this;
      const T = 20 / wn;
      const os = overshootPct(zeta);
      const ts = settleTime(zeta, wn);
      const tp = peakTime(zeta, wn);
      const color = zeta < 0.98 ? (zeta < 0.02 ? '#ef4444' : '#f59e0b') : '#10b981';
      const ps = poles(zeta, wn);
      const poleTags = ps.map((p, i) => `<marker id="dmp-pole-${i}" x="${p[0].toFixed(3)}" y="${p[1].toFixed(3)}" color="${color}" size="6" label="s${i + 1}=${p[0].toFixed(2)}${p[1] >= 0 ? '+' : ''}${p[1].toFixed(2)}j"></marker>`).join('\n          ');
      const maxAbsPole = Math.max(1, ...ps.map(p => Math.abs(p[0])), ...ps.map(p => Math.abs(p[1])));
      const B = Math.ceil(maxAbsPole * 1.2);
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
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">s² + 2ζωn·s + ωn² = 0 — ζ가 감쇠 정도, ωn이 진동 빠르기</div>
        <div class="math-applied" id="dmp-applied" style="color:${color}">적용: ζ=${zeta.toFixed(2)}, ωn=${wn.toFixed(1)} → ${regime(zeta)}, 오버슈트 ${os.toFixed(1)}%, 정착시간 ${ts.toFixed(2)}s</div>
        <div class="math-desc">ζ를 0→2로 올려가며 무감쇠→부족감쇠→임계감쇠→과감쇠로 바뀌는 걸 확인하세요. ζ=0.7 근처가 흔히 "적당히 좋은" 값으로 꼽힙니다.</div>
        <cartesian-chart x-min="0" x-max="${T}" y-min="0" y-max="2" x-label="시간(s)" y-label="목표 대비 비율">
          <series points="0,1 ${T},1" color="#e2e8f0" dash="4,4" label="목표"></series>
          <series id="dmp-curve" points="${curveStr(zeta, wn, T)}" color="${color}" width="2.2"></series>
          <marker id="dmp-peak" x="${!Number.isNaN(tp) && tp <= T ? tp.toFixed(3) : '-999'}" y="${!Number.isNaN(tp) && tp <= T ? stepResponse(tp, zeta, wn).toFixed(4) : '-999'}" color="#8b5cf6" size="5" label="${!Number.isNaN(tp) ? `첨두 ${(1 + os / 100).toFixed(2)}` : ''}"></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#e2e8f0">- - 목표</b></span><span><b style="color:${color}">— 응답</b></span><span><b style="color:#8b5cf6">● 첨두(오버슈트 정점)</b></span></div>
        <div class="ctl"><label>ζ (감쇠비) <input id="dmp-zeta" type="range" min="0" max="2" step="0.02" value="${zeta}"><b id="dmp-zeta-val">${zeta.toFixed(2)}</b></label></div>
        <div class="ctl"><label>ωn (고유진동수) <input id="dmp-wn" type="range" min="0.5" max="10" step="0.5" value="${wn}"><b id="dmp-wn-val">${wn.toFixed(1)} rad/s</b></label></div>

        <div class="math-title">극점 s = -ζωn ± jωn√(1-ζ²)</div>
        <cartesian-chart x-min="${-B}" x-max="${Math.ceil(B * 0.3)}" y-min="${-B}" y-max="${B}" x-label="σ (실수부)" y-label="ω (허수부)" disabled-aspect style="height:200px">
          <polygon points="${-B},${-B} 0,${-B} 0,${B} ${-B},${B}" color="#d1fae5" fill="rgba(16,185,129,0.10)"></polygon>
          <polygon points="0,${-B} ${Math.ceil(B * 0.3)},${-B} ${Math.ceil(B * 0.3)},${B} 0,${B}" color="#fecaca" fill="rgba(239,68,68,0.10)"></polygon>
          <series points="0,${-B} 0,${B}" color="#94a3b8" dash="4,4"></series>
          ${poleTags}
        </cartesian-chart>
        <div class="math-notes" id="dmp-notes">
          <div>극점 s = -ζωn ± j·ωn√(1-ζ²) = ${(-zeta * wn).toFixed(2)} ${zeta < 1 ? `± ${(wn * Math.sqrt(1 - zeta * zeta)).toFixed(2)}j` : ''}</div>
          <div>오버슈트 %OS = 100·e^(-ζπ/√(1-ζ²)) = ${os.toFixed(2)}%</div>
          <div>${!Number.isNaN(tp) ? `첨두시간(peak time) = π/ωd = ${tp.toFixed(2)}s<br>` : ''}정착시간(2% 기준) ≈ 4/(ζωn) = ${ts.toFixed(2)}s</div>
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
