import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-pseudoinverse';

const L1 = 2, L2 = 1.5;

const MD = `
## 의사역행렬(pseudo-inverse)과 감쇠최소제곱(DLS)이란?
- **"자코비안·특이점"** 페이지에서 본 것: \`v = J·θ̇\`인데, 특이점 근처(det(J)≈0)에서는 진짜 역행렬 \`θ̇ = J⁻¹v\`를 쓰면 값이 **폭발**합니다(0으로 나누는 것과 비슷한 상황이라서요).
- 실제 로봇은 관절 속도에 물리적 한계가 있어서 "무한히 빠르게 움직여라"는 명령을 낼 수 없습니다. 그래서 나온 실전 해법이 **감쇠최소제곱(Damped Least Squares, DLS)** 의사역행렬입니다:

  \`J⁺ = Jᵗ(JJᵗ + λ²I)⁻¹\`, \`θ̇ = J⁺v\`

- λ(댐핑)가 0이면 진짜 역행렬과 똑같아지고, λ가 커질수록 "특이점 근처에서 폭주하지 않도록 일부러 덜 정확하게" 풉니다 — **정확도(원하는 속도 v를 정확히 내는 것)와 안전(관절이 폭주하지 않는 것)을 맞바꾸는 트레이드오프**입니다.
- 이건 사실 **"최소제곱법"** 페이지와 같은 수학입니다 — \`min ||Jθ̇-v||² + λ²||θ̇||²\`를 풀면 정확히 위 공식이 나옵니다(잔차 제곱 + 크기에 대한 벌점을 같이 최소화).
- **어디에 쓰이나요?** — 산업용/협동로봇의 특이점 회피, 여분자유도(redundant) 로봇의 역기구학, 카메라 자세추정(SLAM)의 최적화.
`;

interface Mat2 { a: number; b: number; c: number; d: number }
type Vec2 = [number, number];

function endEffector(t1: number, t2: number) {
  const a = (t1 * Math.PI) / 180, b = ((t1 + t2) * Math.PI) / 180;
  return { x: L1 * Math.cos(a) + L2 * Math.cos(b), y: L1 * Math.sin(a) + L2 * Math.sin(b), a, b };
}

function jacobian(t1: number, t2: number): Mat2 {
  const { a, b } = endEffector(t1, t2);
  return {
    a: -L1 * Math.sin(a) - L2 * Math.sin(b), b: -L2 * Math.sin(b),
    c: L1 * Math.cos(a) + L2 * Math.cos(b), d: L2 * Math.cos(b),
  };
}

function det2(m: Mat2) { return m.a * m.d - m.b * m.c; }
function transpose2(m: Mat2): Mat2 { return { a: m.a, b: m.c, c: m.b, d: m.d }; }
function matMul2(x: Mat2, y: Mat2): Mat2 {
  return { a: x.a * y.a + x.b * y.c, b: x.a * y.b + x.b * y.d, c: x.c * y.a + x.d * y.c, d: x.c * y.b + x.d * y.d };
}
function inv2(m: Mat2): Mat2 | null {
  const dt = det2(m);
  if (Math.abs(dt) < 1e-9) return null;
  return { a: m.d / dt, b: -m.b / dt, c: -m.c / dt, d: m.a / dt };
}
function matVec2(m: Mat2, v: Vec2): Vec2 { return [m.a * v[0] + m.b * v[1], m.c * v[0] + m.d * v[1]]; }
function len2(v: Vec2) { return Math.hypot(v[0], v[1]); }

/** J⁺ = Jᵗ(JJᵗ+λ²I)⁻¹ — λ=0이면 진짜 (의사)역행렬과 같아짐(정사각 비특이 J라면 진짜 역행렬과 동일). */
function dlsPseudoInverse(J: Mat2, lambda: number): Mat2 {
  const Jt = transpose2(J);
  const JJt = matMul2(J, Jt);
  const M: Mat2 = { a: JJt.a + lambda * lambda, b: JJt.b, c: JJt.c, d: JJt.d + lambda * lambda };
  const Minv = inv2(M)!; // λ>0이면 항상 비특이
  return matMul2(Jt, Minv);
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathPseudoinverse extends w.HTMLElement {
    private t1 = 20;
    private t2 = 15;
    private vx = 0.4;
    private vy = 0.5;
    private lambda = 0.15;

    private compute() {
      const { t1, t2, vx, vy, lambda } = this;
      const e = endEffector(t1, t2);
      const J = jacobian(t1, t2);
      const dt = det2(J);
      const v: Vec2 = [vx, vy];
      const Jinv = inv2(J);
      const thetaNaive = Jinv ? matVec2(Jinv, v) : null;
      const Jplus = dlsPseudoInverse(J, lambda);
      const thetaDls = matVec2(Jplus, v);
      const vActualDls = matVec2(J, thetaDls);
      const trackErr = len2([v[0] - vActualDls[0], v[1] - vActualDls[1]]);
      return { e, J, dt, v, thetaNaive, thetaDls, vActualDls, trackErr };
    }

    private refresh() {
      const { t1, t2 } = this;
      const { e, J, dt, v, thetaNaive, thetaDls, vActualDls, trackErr } = this.compute();
      const singular = Math.abs(dt) < 0.3;
      const color = singular ? '#ef4444' : '#10b981';
      const elbow = { x: L1 * Math.cos((t1 * Math.PI) / 180), y: L1 * Math.sin((t1 * Math.PI) / 180) };

      const applied = this.shadowRoot?.querySelector('#pinv-applied') as HTMLElement;
      if (applied) {
        applied.style.color = color;
        applied.textContent = `적용: θ1=${t1.toFixed(0)}°, θ2=${t2.toFixed(0)}° → det(J)=${dt.toFixed(2)}${singular ? ' (특이점 근처!)' : ''}, λ=${this.lambda.toFixed(2)}`;
      }

      const notes = this.shadowRoot?.querySelector('#pinv-notes') as HTMLElement;
      if (notes) notes.innerHTML = this.notesHtml(dt, thetaNaive, thetaDls, trackErr);

      (['t1', 't2', 'vx', 'vy', 'lambda'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#pinv-${k}-val`) as HTMLElement;
        if (!el) return;
        el.textContent = k === 't1' || k === 't2' ? `${this[k].toFixed(0)}°` : this[k].toFixed(2);
      });

      const l1 = this.shadowRoot?.querySelector('#pinv-link1') as HTMLElement;
      if (l1) { l1.setAttribute('x2', elbow.x.toFixed(3)); l1.setAttribute('y2', elbow.y.toFixed(3)); }
      const l2 = this.shadowRoot?.querySelector('#pinv-link2') as HTMLElement;
      if (l2) { l2.setAttribute('x1', elbow.x.toFixed(3)); l2.setAttribute('y1', elbow.y.toFixed(3)); l2.setAttribute('x2', e.x.toFixed(3)); l2.setAttribute('y2', e.y.toFixed(3)); }
      const vDesired = this.shadowRoot?.querySelector('#pinv-vdesired') as HTMLElement;
      if (vDesired) { vDesired.setAttribute('x1', e.x.toFixed(3)); vDesired.setAttribute('y1', e.y.toFixed(3)); vDesired.setAttribute('x2', (e.x + v[0]).toFixed(3)); vDesired.setAttribute('y2', (e.y + v[1]).toFixed(3)); }
      const vDls = this.shadowRoot?.querySelector('#pinv-vdls') as HTMLElement;
      if (vDls) { vDls.setAttribute('x1', e.x.toFixed(3)); vDls.setAttribute('y1', e.y.toFixed(3)); vDls.setAttribute('x2', (e.x + vActualDls[0]).toFixed(3)); vDls.setAttribute('y2', (e.y + vActualDls[1]).toFixed(3)); }
    }

    private notesHtml(dt: number, thetaNaive: Vec2 | null, thetaDls: Vec2, trackErr: number): string {
      const dlsMag = len2(thetaDls);
      const naiveHtml = thetaNaive
        ? `<div>진짜 역행렬 θ̇ = J⁻¹v = (${thetaNaive[0].toFixed(2)}, ${thetaNaive[1].toFixed(2)}) rad/s → 크기 ${len2(thetaNaive).toFixed(2)}${len2(thetaNaive) > 20 ? ' <b style="color:#ef4444">⚠ 폭주!</b>' : ''}</div>`
        : `<div><b style="color:#ef4444">진짜 역행렬 없음(det=0, 완전한 특이점)</b></div>`;
      return naiveHtml +
        `<div>DLS 의사역행렬 θ̇ = J⁺v = (${thetaDls[0].toFixed(2)}, ${thetaDls[1].toFixed(2)}) rad/s → 크기 ${dlsMag.toFixed(2)} (항상 유계)</div>` +
        `<div style="margin-top:4px">DLS로 실제 나오는 손끝속도와 원하는 속도의 차이(추적오차) = ${trackErr.toFixed(3)} — 관절 속도를 안전하게 억누른 대가로 생기는 오차입니다.</div>`;
    }

    @addEventListener('#pinv-t1', 'input')
    onT1(e: Event) { this.t1 = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#pinv-t2', 'input')
    onT2(e: Event) { this.t2 = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#pinv-vx', 'input')
    onVx(e: Event) { this.vx = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#pinv-vy', 'input')
    onVy(e: Event) { this.vy = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#pinv-lambda', 'input')
    onLambda(e: Event) { this.lambda = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { t1, t2 } = this;
      const { e, dt, v, thetaNaive, thetaDls, vActualDls, trackErr } = this.compute();
      const singular = Math.abs(dt) < 0.3;
      const color = singular ? '#ef4444' : '#10b981';
      const elbow = { x: L1 * Math.cos((t1 * Math.PI) / 180), y: L1 * Math.sin((t1 * Math.PI) / 180) };
      return `
        <style>
          :host { display:block; }
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
        <div class="math-formula">J⁺ = Jᵗ(JJᵗ+λ²I)⁻¹, θ̇ = J⁺v — λ=0이면 진짜 역행렬과 동일</div>
        <div class="math-applied" id="pinv-applied" style="color:${color}">적용: θ1=${t1.toFixed(0)}°, θ2=${t2.toFixed(0)}° → det(J)=${dt.toFixed(2)}${singular ? ' (특이점 근처!)' : ''}, λ=${this.lambda.toFixed(2)}</div>
        <div class="math-desc">θ2를 0° 근처로 보내 특이점에 가깝게 만들고, λ=0으로 내려서 진짜 역행렬 θ̇가 폭주하는 걸 보세요. λ를 올리면 DLS θ̇는 계속 안전한 크기로 유지됩니다(대신 회색 화살표(원하는 속도)와 초록 화살표(DLS로 실제 나오는 속도)가 벌어집니다).</div>
        <cartesian-chart x-min="-4" x-max="4" y-min="-4" y-max="4" center-x="0" center-y="0" x-label="X" y-label="Y">
          <vector id="pinv-link1" x1="0" y1="0" x2="${elbow.x.toFixed(3)}" y2="${elbow.y.toFixed(3)}" color="#94a3b8" label="link1"></vector>
          <vector id="pinv-link2" x1="${elbow.x.toFixed(3)}" y1="${elbow.y.toFixed(3)}" x2="${e.x.toFixed(3)}" y2="${e.y.toFixed(3)}" color="#f59e0b" label="link2"></vector>
          <vector id="pinv-vdesired" x1="${e.x.toFixed(3)}" y1="${e.y.toFixed(3)}" x2="${(e.x + v[0]).toFixed(3)}" y2="${(e.y + v[1]).toFixed(3)}" color="#64748b" dash="3,2" label="원하는 v"></vector>
          <vector id="pinv-vdls" x1="${e.x.toFixed(3)}" y1="${e.y.toFixed(3)}" x2="${(e.x + vActualDls[0]).toFixed(3)}" y2="${(e.y + vActualDls[1]).toFixed(3)}" color="#10b981" label="DLS 실제 v"></vector>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#94a3b8">→ link1</b></span><span><b style="color:#f59e0b">→ link2</b></span><span><b style="color:#64748b">- - 원하는 손끝속도 v</b></span><span><b style="color:#10b981">→ DLS로 실제 나오는 v</b></span></div>
        <div class="math-notes" id="pinv-notes">${this.notesHtml(dt, thetaNaive, thetaDls, trackErr)}</div>
        <div class="ctl"><label>θ1 (어깨) <input id="pinv-t1" type="range" min="0" max="360" step="1" value="${t1}"><b id="pinv-t1-val">${t1.toFixed(0)}°</b></label></div>
        <div class="ctl"><label>θ2 (팔꿈치) <input id="pinv-t2" type="range" min="0" max="360" step="1" value="${t2}"><b id="pinv-t2-val">${t2.toFixed(0)}°</b></label></div>
        <div class="ctl"><label>원하는 vx <input id="pinv-vx" type="range" min="-2" max="2" step="0.05" value="${this.vx}"><b id="pinv-vx-val">${this.vx.toFixed(2)}</b></label></div>
        <div class="ctl"><label>원하는 vy <input id="pinv-vy" type="range" min="-2" max="2" step="0.05" value="${this.vy}"><b id="pinv-vy-val">${this.vy.toFixed(2)}</b></label></div>
        <div class="ctl"><label>λ (댐핑, 0=진짜 역행렬) <input id="pinv-lambda" type="range" min="0" max="1" step="0.01" value="${this.lambda}"><b id="pinv-lambda-val">${this.lambda.toFixed(2)}</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
