import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-euler';

const MD = `
## 오일러 공식(Euler's formula)이란?
- 자연상수 e를 **허수 지수**로 올리면 회전이 됩니다: \`e^(iθ) = cos θ + i·sin θ\`
- 복소평면에서 e^(iθ)는 항상 **반지름 1인 단위원 위의 점**입니다 — 실수부가 cos θ(가로), 허수부가 sin θ(세로)입니다.
- θ=180°(π)를 넣으면 그 유명한 **오일러 항등식**이 나옵니다: \`e^(iπ) + 1 = 0\` — 수학에서 가장 중요한 다섯 상수(e, i, π, 1, 0)가 한 줄에 다 모입니다.
- **왜 지수가 회전이 될까?** e^x의 정의 \`(1 + x/n)^n\` (n→∞)를 x=iθ에 그대로 적용하면, "아주 조금 커지고 아주 조금 회전하기"를 n번 반복하는 셈이 됩니다. 아래 보라색 사슬(각 단계 점들)이 바로 그 반복 과정이고, n을 키우면 정확히 단위원 호에 달라붙습니다.
- 2×2 회전행렬 \`[[cosθ,-sinθ],[sinθ,cosθ]]\`은 사실 **"복소수 e^(iθ)를 곱하는 것"**과 완전히 같은 연산입니다 — "회전행렬"·"회전" 페이지에서 본 것과 동일한 정체입니다.
- **어디에 쓰이나요?** — "푸리에 변환"의 \`e^(-iωt)\`가 바로 이것, 신호처리·제어이론의 복소 지수, 회전 표현, 교류 회로 해석.
`;

type C = [number, number];
function cmul(a: C, b: C): C { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }

function spiralPath(thetaRad: number, n: number): C[] {
  const base: C = [1, thetaRad / n];
  let z: C = [1, 0];
  const path: C[] = [z];
  for (let k = 0; k < n; k++) { z = cmul(z, base); path.push(z); }
  return path;
}

function ptsStr(list: C[]) { return list.map(p => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join(' '); }

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathEuler extends w.HTMLElement {
    private thetaDeg = 120;
    private n = 40;

    private refresh() {
      const rad = (this.thetaDeg * Math.PI) / 180;
      const cosT = Math.cos(rad), sinT = Math.sin(rad);
      const path = spiralPath(rad, this.n);
      const zApprox = path[path.length - 1];
      const magApprox = Math.hypot(zApprox[0], zApprox[1]);
      const angApproxDeg = (Math.atan2(zApprox[1], zApprox[0]) * 180) / Math.PI;
      const err = Math.hypot(zApprox[0] - cosT, zApprox[1] - sinT);
      const nearPi = Math.abs(((this.thetaDeg % 360) + 360) % 360 - 180) < 3;

      const applied = this.shadowRoot?.querySelector('#eu-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: θ=${this.thetaDeg.toFixed(0)}° → e^(iθ) = ${cosT.toFixed(3)} + ${sinT.toFixed(3)}i, (1+iθ/n)^n 근사 오차=${err.toExponential(2)}`;

      const notes = this.shadowRoot?.querySelector('#eu-notes') as HTMLElement;
      if (notes) {
        notes.innerHTML = `<div>cos θ = ${cosT.toFixed(3)}, sin θ = ${sinT.toFixed(3)}</div>` +
          `<div>(1+iθ/n)^n → 크기 ${magApprox.toFixed(3)}(→1), 각도 ${angApproxDeg.toFixed(1)}°(→${this.thetaDeg.toFixed(0)}°)</div>` +
          (nearPi ? `<div style="margin-top:4px;color:#8b5cf6;font-weight:800">θ≈180°! e^(iπ) + 1 = ${(cosT + 1).toFixed(4)} + ${sinT.toFixed(4)}i ≈ 0 (오일러 항등식)</div>` : '');
      }
      (['thetaDeg', 'n'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#eu-${k}-val`) as HTMLElement;
        if (el) el.textContent = k === 'thetaDeg' ? `${this.thetaDeg.toFixed(0)}°` : String(this.n);
      });

      const spiral = this.shadowRoot?.querySelector('#eu-spiral') as HTMLElement;
      if (spiral) spiral.setAttribute('points', ptsStr(path));
      const approx = this.shadowRoot?.querySelector('#eu-approx') as HTMLElement;
      if (approx) { approx.setAttribute('x', zApprox[0].toFixed(4)); approx.setAttribute('y', zApprox[1].toFixed(4)); }
      const truePt = this.shadowRoot?.querySelector('#eu-true') as HTMLElement;
      if (truePt) { truePt.setAttribute('x2', cosT.toFixed(4)); truePt.setAttribute('y2', sinT.toFixed(4)); truePt.setAttribute('label', `e^(i${this.thetaDeg.toFixed(0)}°)=(${cosT.toFixed(2)},${sinT.toFixed(2)})`); }
      const projX = this.shadowRoot?.querySelector('#eu-projx') as HTMLElement;
      if (projX) projX.setAttribute('points', `${cosT.toFixed(4)},${sinT.toFixed(4)} ${cosT.toFixed(4)},0`);
      const projY = this.shadowRoot?.querySelector('#eu-projy') as HTMLElement;
      if (projY) projY.setAttribute('points', `${cosT.toFixed(4)},${sinT.toFixed(4)} 0,${sinT.toFixed(4)}`);
    }

    @addEventListener('#eu-theta', 'input')
    onTheta(e: Event) { this.thetaDeg = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#eu-n', 'input')
    onN(e: Event) { this.n = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const rad = (this.thetaDeg * Math.PI) / 180;
      const cosT = Math.cos(rad), sinT = Math.sin(rad);
      const path = spiralPath(rad, this.n);
      const zApprox = path[path.length - 1];
      const magApprox = Math.hypot(zApprox[0], zApprox[1]);
      const angApproxDeg = (Math.atan2(zApprox[1], zApprox[0]) * 180) / Math.PI;
      const err = Math.hypot(zApprox[0] - cosT, zApprox[1] - sinT);
      const nearPi = Math.abs(((this.thetaDeg % 360) + 360) % 360 - 180) < 3;

      return `
        <style>
          :host { display:block; }
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
        <div class="math-formula">e^(iθ) = cos θ + i·sin θ, (1+iθ/n)^n → e^(iθ) (n→∞)</div>
        <div class="math-applied" id="eu-applied">적용: θ=${this.thetaDeg.toFixed(0)}° → e^(iθ) = ${cosT.toFixed(3)} + ${sinT.toFixed(3)}i, (1+iθ/n)^n 근사 오차=${err.toExponential(2)}</div>
        <div class="math-desc">보라 점선 사슬은 (1+iθ/n)을 n번 곱해나간 경로입니다. n을 키우면 이 사슬이 단위원 호에 딱 달라붙습니다. θ를 180° 근처로 두면 오일러 항등식을 볼 수 있어요.</div>
        <cartesian-chart x-min="auto" x-max="auto" y-min="auto" y-max="auto" x-label="실수부(Re)" y-label="허수부(Im)">
          <circle x="0" y="0" r="1" color="#cbd5e1" dash="4,4" label="단위원"></circle>
          <series id="eu-spiral" points="${ptsStr(path)}" color="#8b5cf6" width="1.6" label="(1+iθ/n)^k 경로"></series>
          <marker id="eu-approx" x="${zApprox[0].toFixed(4)}" y="${zApprox[1].toFixed(4)}" color="#f59e0b" size="5" label="근사값"></marker>
          <vector id="eu-true" x1="0" y1="0" x2="${cosT.toFixed(4)}" y2="${sinT.toFixed(4)}" color="#10b981" label="e^(i${this.thetaDeg.toFixed(0)}°)=(${cosT.toFixed(2)},${sinT.toFixed(2)})"></vector>
          <series id="eu-projx" points="${cosT.toFixed(4)},${sinT.toFixed(4)} ${cosT.toFixed(4)},0" color="#94a3b8" dash="3,3"></series>
          <series id="eu-projy" points="${cosT.toFixed(4)},${sinT.toFixed(4)} 0,${sinT.toFixed(4)}" color="#94a3b8" dash="3,3"></series>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#cbd5e1">- - 단위원</b></span><span><b style="color:#8b5cf6">— (1+iθ/n)^k 경로</b></span><span><b style="color:#f59e0b">● 근사값</b></span><span><b style="color:#10b981">→ 진짜 e^(iθ)</b></span></div>
        <div class="math-notes" id="eu-notes">
          <div>cos θ = ${cosT.toFixed(3)}, sin θ = ${sinT.toFixed(3)}</div>
          <div>(1+iθ/n)^n → 크기 ${magApprox.toFixed(3)}(→1), 각도 ${angApproxDeg.toFixed(1)}°(→${this.thetaDeg.toFixed(0)}°)</div>
          ${nearPi ? `<div style="margin-top:4px;color:#8b5cf6;font-weight:800">θ≈180°! e^(iπ) + 1 = ${(cosT + 1).toFixed(4)} + ${sinT.toFixed(4)}i ≈ 0 (오일러 항등식)</div>` : ''}
        </div>
        <div class="ctl"><label>θ (각도) <input id="eu-theta" type="range" min="0" max="360" step="1" value="${this.thetaDeg}"><b id="eu-thetaDeg-val">${this.thetaDeg.toFixed(0)}°</b></label></div>
        <div class="ctl"><label>n (근사 단계 수) <input id="eu-n" type="range" min="2" max="150" step="1" value="${this.n}"><b id="eu-n-val">${this.n}</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
