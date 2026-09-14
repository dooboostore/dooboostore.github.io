import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-complex';

const MD = `
## 복소수(complex number)란?
- 실수만으로는 \`x² = -1\`을 풀 수 없어서 만든 수: **i(허수단위, i² = -1)**. 복소수는 \`z = a + bi\`(a: 실수부, b: 허수부)로 씁니다.
- **복소평면**: 가로축 = 실수부, 세로축 = 허수부. 복소수 하나가 평면 위의 화살표(벡터)로 보입니다.
- **덧셈은 진짜 벡터 덧셈과 똑같습니다**: \`(a+bi)+(c+di) = (a+c)+(b+d)i\`, 평행사변형으로 나타납니다.
- **곱셈은 벡터 덧셈과 다릅니다** — 크기는 곱하고 각도는 더합니다: \`|z1·z2| = |z1|·|z2|\`, \`arg(z1·z2) = arg(z1) + arg(z2)\`. 그래서 복소수를 곱하는 건 **"회전 + 확대/축소"**입니다 — "오일러 공식(e^iθ)" 페이지에서 e^(iθ)를 곱하면 회전이 되는 이유가 바로 이것입니다.
- **켤레복소수(conjugate)** \`z̄ = a - bi\` (허수부 부호만 반전, 실수축 기준 거울상). \`z·z̄ = a²+b² = |z|²\`는 항상 실수입니다 — 그래서 나눗셈(\`1/z = z̄/|z|²\`)에 씁니다.
- **어디에 쓰이나요?** — 푸리에 변환의 \`e^(-iωt)\`, 신호처리의 위상·진폭 표현, 교류 회로 해석(임피던스), 2D 회전·오일러 공식의 기반.
`;

type C = { re: number; im: number };
function add(a: C, b: C): C { return { re: a.re + b.re, im: a.im + b.im }; }
function mul(a: C, b: C): C { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function conj(a: C): C { return { re: a.re, im: -a.im }; }
function mag(a: C) { return Math.hypot(a.re, a.im); }
function argDeg(a: C) { return (Math.atan2(a.im, a.re) * 180) / Math.PI; }
function fmt(a: C) { return `${a.re.toFixed(2)} ${a.im >= 0 ? '+' : '-'} ${Math.abs(a.im).toFixed(2)}i`; }

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathComplex extends w.HTMLElement {
    private a = 3;
    private b = 2;
    private c = 1;
    private d = 2;

    private refresh() {
      const z1: C = { re: this.a, im: this.b };
      const z2: C = { re: this.c, im: this.d };
      const sum = add(z1, z2);
      const prod = mul(z1, z2);
      const cj = conj(z1);
      const magProd = mag(z1) * mag(z2);
      let argSum = argDeg(z1) + argDeg(z2);
      if (argSum > 180) argSum -= 360; else if (argSum < -180) argSum += 360;

      const applied = this.shadowRoot?.querySelector('#cx-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: z1=${fmt(z1)}, z2=${fmt(z2)} → z1+z2=${fmt(sum)}, z1·z2=${fmt(prod)}`;

      const notes = this.shadowRoot?.querySelector('#cx-notes') as HTMLElement;
      if (notes) {
        notes.innerHTML = `<div>|z1|=${mag(z1).toFixed(2)}, arg(z1)=${argDeg(z1).toFixed(1)}° · |z2|=${mag(z2).toFixed(2)}, arg(z2)=${argDeg(z2).toFixed(1)}°</div>` +
          `<div>|z1·z2| = |z1|·|z2| = ${magProd.toFixed(2)} (실제 ${mag(prod).toFixed(2)}) — 크기는 곱함</div>` +
          `<div>arg(z1·z2) = arg(z1)+arg(z2) = ${argSum.toFixed(1)}° (실제 ${argDeg(prod).toFixed(1)}°) — 각도는 더함</div>` +
          `<div>z1·z̄1 = ${(z1.re * z1.re + z1.im * z1.im).toFixed(2)} = |z1|² (항상 실수)</div>`;
      }
      (['a', 'b', 'c', 'd'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#cx-${k}-val`) as HTMLElement;
        if (el) el.textContent = this[k].toFixed(1);
      });

      const setVec = (id: string, z: C, label: string) => {
        const el = this.shadowRoot?.querySelector(id) as HTMLElement;
        if (!el) return;
        el.setAttribute('x2', z.re.toFixed(3)); el.setAttribute('y2', z.im.toFixed(3)); el.setAttribute('label', label);
      };
      setVec('#cx-z1', z1, `z1=${fmt(z1)}`);
      setVec('#cx-z2', z2, `z2=${fmt(z2)}`);
      setVec('#cx-sum', sum, `z1+z2=${fmt(sum)}`);
      setVec('#cx-prod', prod, `z1·z2=${fmt(prod)}`);
      setVec('#cx-conj', cj, `z̄1=${fmt(cj)}`);
      const para1 = this.shadowRoot?.querySelector('#cx-para1') as HTMLElement;
      if (para1) para1.setAttribute('points', `${z1.re.toFixed(3)},${z1.im.toFixed(3)} ${sum.re.toFixed(3)},${sum.im.toFixed(3)}`);
      const para2 = this.shadowRoot?.querySelector('#cx-para2') as HTMLElement;
      if (para2) para2.setAttribute('points', `${z2.re.toFixed(3)},${z2.im.toFixed(3)} ${sum.re.toFixed(3)},${sum.im.toFixed(3)}`);
    }

    @addEventListener('#cx-a', 'input')
    onA(e: Event) { this.a = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#cx-b', 'input')
    onB(e: Event) { this.b = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#cx-c', 'input')
    onC(e: Event) { this.c = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#cx-d', 'input')
    onD(e: Event) { this.d = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { a, b, c, d } = this;
      const z1: C = { re: a, im: b };
      const z2: C = { re: c, im: d };
      const sum = add(z1, z2);
      const prod = mul(z1, z2);
      const cj = conj(z1);
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
        <div class="math-formula">z1=a+bi, z2=c+di → z1+z2(벡터 합), z1·z2(회전+확대)</div>
        <div class="math-applied" id="cx-applied">적용: z1=${fmt(z1)}, z2=${fmt(z2)} → z1+z2=${fmt(sum)}, z1·z2=${fmt(prod)}</div>
        <div class="math-desc">a·b·c·d를 바꿔가며 z1(빨강)·z2(파랑)을 조절하세요. 초록=덧셈(평행사변형), 보라=곱셈(각도가 더해짐), 연분홍 점선=z1의 켤레(거울상).</div>
        <cartesian-chart x-min="auto" x-max="auto" y-min="auto" y-max="auto" x-label="실수부(Re)" y-label="허수부(Im)">
          <vector id="cx-z1" x1="0" y1="0" x2="${z1.re}" y2="${z1.im}" color="#e5484d" label="z1=${fmt(z1)}"></vector>
          <vector id="cx-z2" x1="0" y1="0" x2="${z2.re}" y2="${z2.im}" color="#3e63dd" label="z2=${fmt(z2)}"></vector>
          <vector id="cx-sum" x1="0" y1="0" x2="${sum.re.toFixed(3)}" y2="${sum.im.toFixed(3)}" color="#10b981" label="z1+z2=${fmt(sum)}"></vector>
          <vector id="cx-prod" x1="0" y1="0" x2="${prod.re.toFixed(3)}" y2="${prod.im.toFixed(3)}" color="#8b5cf6" label="z1·z2=${fmt(prod)}"></vector>
          <vector id="cx-conj" x1="0" y1="0" x2="${cj.re}" y2="${cj.im}" color="#f9a8d4" dash="4,3" label="z̄1=${fmt(cj)}"></vector>
          <series id="cx-para1" points="${z1.re},${z1.im} ${sum.re.toFixed(3)},${sum.im.toFixed(3)}" color="#a7f3d0" dash="3,3"></series>
          <series id="cx-para2" points="${z2.re},${z2.im} ${sum.re.toFixed(3)},${sum.im.toFixed(3)}" color="#a7f3d0" dash="3,3"></series>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#e5484d">→ z1</b></span><span><b style="color:#3e63dd">→ z2</b></span><span><b style="color:#10b981">→ z1+z2</b></span><span><b style="color:#8b5cf6">→ z1·z2</b></span><span><b style="color:#f9a8d4">- - z̄1(켤레)</b></span></div>
        <div class="math-notes" id="cx-notes">
          <div>|z1|=${mag(z1).toFixed(2)}, arg(z1)=${argDeg(z1).toFixed(1)}° · |z2|=${mag(z2).toFixed(2)}, arg(z2)=${argDeg(z2).toFixed(1)}°</div>
          <div>|z1·z2| = |z1|·|z2| = ${(mag(z1) * mag(z2)).toFixed(2)} (실제 ${mag(prod).toFixed(2)}) — 크기는 곱함</div>
          <div>arg(z1·z2) = arg(z1)+arg(z2) (실제 ${argDeg(prod).toFixed(1)}°) — 각도는 더함</div>
          <div>z1·z̄1 = ${(z1.re * z1.re + z1.im * z1.im).toFixed(2)} = |z1|² (항상 실수)</div>
        </div>
        <div class="ctl"><label>z1 실수부 a <input id="cx-a" type="range" min="-5" max="5" step="0.5" value="${a}"><b id="cx-a-val">${a.toFixed(1)}</b></label></div>
        <div class="ctl"><label>z1 허수부 b <input id="cx-b" type="range" min="-5" max="5" step="0.5" value="${b}"><b id="cx-b-val">${b.toFixed(1)}</b></label></div>
        <div class="ctl"><label>z2 실수부 c <input id="cx-c" type="range" min="-5" max="5" step="0.5" value="${c}"><b id="cx-c-val">${c.toFixed(1)}</b></label></div>
        <div class="ctl"><label>z2 허수부 d <input id="cx-d" type="range" min="-5" max="5" step="0.5" value="${d}"><b id="cx-d-val">${d.toFixed(1)}</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
