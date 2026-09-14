import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-integral';

const MD = `
## 적분(integral)이란?
- 함수 f(x)와 x축 사이의 **넓이(부호 있음, signed area)**를 구하는 것입니다. f(x)<0인 구간은 음수로 셉니다.
- **리만 합(Riemann sum)**: [a,b] 구간을 N개의 작은 직사각형으로 잘라, 각 직사각형의 넓이(높이×폭)를 모두 더해서 넓이를 근사합니다: \`Σ f(xᵢ)·Δx\`
- N을 늘릴수록(직사각형이 얇아질수록) 근사값이 실제 넓이에 다가갑니다 — 그 극한이 **적분** \`∫[a,b] f(x)dx\` 입니다.
- **미적분의 기본정리(FTC)**: f(x)의 원함수(미분하면 f(x)가 되는 함수) F(x)를 알면, 직사각형을 일일이 더할 필요 없이 그냥 \`F(b)-F(a)\`로 한 번에 계산됩니다. 이 페이지의 \`f(x)=x³/3-x\`는 **"미분" 페이지에서 쓴 바로 그 함수**이고, 원함수는 \`F(x)=x⁴/12-x²/2\`입니다 (\`F'(x)=f(x)\`, 미분의 반대 방향).
- 아래 그래프에서 F(x)가 a에서 b로 가는 동안 "얼마나 올라갔는지"(F(b)-F(a))가 바로 위 그래프의 넓이와 정확히 같습니다.
- **어디에 쓰이나요?** — 속도를 적분하면 이동거리, 가속도를 적분하면 속도(로봇 센서 데이터 적산), PID의 I항(오차를 적분), 확률분포의 넓이(확률 계산).
`;

function f(x: number) { return (x * x * x) / 3 - x; }
function F(x: number) { return Math.pow(x, 4) / 12 - (x * x) / 2; }

function curveStr(fn: (x: number) => number, xMin: number, xMax: number, n = 80) {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xMin + ((xMax - xMin) * i) / n;
    pts.push(`${x.toFixed(3)},${fn(x).toFixed(4)}`);
  }
  return pts.join(' ');
}

const X_MIN = -2.6, X_MAX = 2.6;
const MAX_RECTS = 60;

function riemannRects(a: number, b: number, N: number) {
  const dx = (b - a) / N;
  const rects: { pts: string; sign: 1 | -1 }[] = [];
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const x0 = a + i * dx, x1 = x0 + dx;
    const h = f(x0);
    sum += h * dx;
    rects.push({ pts: `${x0.toFixed(3)},0 ${x1.toFixed(3)},0 ${x1.toFixed(3)},${h.toFixed(4)} ${x0.toFixed(3)},${h.toFixed(4)}`, sign: h >= 0 ? 1 : -1 });
  }
  return { rects, sum };
}

function rectColor(sign: 1 | -1) {
  return sign > 0
    ? { color: '#f59e0b', fill: 'rgba(245,158,11,0.28)' }
    : { color: '#3e63dd', fill: 'rgba(62,99,221,0.28)' };
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathIntegral extends w.HTMLElement {
    private a = -1;
    private b = 2;
    private n = 12;

    private refresh() {
      const { a, b, n } = this;
      const { rects, sum } = riemannRects(a, b, n);
      const trueVal = F(b) - F(a);
      const err = Math.abs(sum - trueVal);

      const applied = this.shadowRoot?.querySelector('#int-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: [a,b]=[${a.toFixed(1)}, ${b.toFixed(1)}], N=${n} → 리만합 = ${sum.toFixed(4)}, 실제 적분 = ${trueVal.toFixed(4)}, 오차 = ${err.toExponential(2)}`;

      const notes = this.shadowRoot?.querySelector('#int-notes') as HTMLElement;
      if (notes) notes.innerHTML = `<div>리만합 Σf(xᵢ)·Δx = ${sum.toFixed(4)} (직사각형 ${n}개)</div>` +
        `<div>F(b)-F(a) = F(${b.toFixed(1)})-F(${a.toFixed(1)}) = ${F(b).toFixed(3)} - ${F(a).toFixed(3)} = ${trueVal.toFixed(4)}</div>` +
        `<div>${err < 0.01 ? 'N이 충분히 커서 리만합이 실제 적분과 거의 같습니다' : 'N을 늘리면 리만합이 실제 적분에 더 가까워집니다'}</div>`;

      (['a', 'b', 'n'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#int-${k}-val`) as HTMLElement;
        if (el) el.textContent = k === 'n' ? String(this.n) : this[k].toFixed(1);
      });

      for (let i = 0; i < MAX_RECTS; i++) {
        const el = this.shadowRoot?.querySelector(`#int-rect-${i}`) as HTMLElement;
        if (!el) continue;
        if (i < rects.length) {
          const { color, fill } = rectColor(rects[i].sign);
          el.setAttribute('points', rects[i].pts);
          el.setAttribute('color', color);
          el.setAttribute('fill', fill);
        } else {
          el.setAttribute('points', '0,0 0,0 0,0 0,0');
        }
      }

      const fMarkA = this.shadowRoot?.querySelector('#int-Fa') as HTMLElement;
      if (fMarkA) { fMarkA.setAttribute('x', a.toFixed(3)); fMarkA.setAttribute('y', F(a).toFixed(4)); }
      const fMarkB = this.shadowRoot?.querySelector('#int-Fb') as HTMLElement;
      if (fMarkB) { fMarkB.setAttribute('x', b.toFixed(3)); fMarkB.setAttribute('y', F(b).toFixed(4)); }
      const rise = this.shadowRoot?.querySelector('#int-rise') as HTMLElement;
      if (rise) rise.setAttribute('points', `${a.toFixed(3)},${F(a).toFixed(4)} ${a.toFixed(3)},${F(b).toFixed(4)} ${b.toFixed(3)},${F(b).toFixed(4)}`);
    }

    @addEventListener('#int-a', 'input')
    onA(e: Event) { this.a = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#int-b', 'input')
    onB(e: Event) { this.b = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#int-n', 'input')
    onN(e: Event) { this.n = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { a, b, n } = this;
      const { rects, sum } = riemannRects(a, b, n);
      const trueVal = F(b) - F(a);
      const err = Math.abs(sum - trueVal);
      const rectTags = Array.from({ length: MAX_RECTS }, (_, i) => {
        if (i < rects.length) {
          const { color, fill } = rectColor(rects[i].sign);
          return `<polygon id="int-rect-${i}" points="${rects[i].pts}" color="${color}" fill="${fill}" width="1"></polygon>`;
        }
        return `<polygon id="int-rect-${i}" points="0,0 0,0 0,0 0,0"></polygon>`;
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
        <div class="math-formula">∫[a,b] f(x)dx ≈ 리만합 Σf(xᵢ)Δx → N→∞이면 실제 넓이(F(b)-F(a))</div>
        <div class="math-applied" id="int-applied">적용: [a,b]=[${a.toFixed(1)}, ${b.toFixed(1)}], N=${n} → 리만합 = ${sum.toFixed(4)}, 실제 적분 = ${trueVal.toFixed(4)}, 오차 = ${err.toExponential(2)}</div>
        <div class="math-desc">직사각형 N개로 넓이를 근사합니다(주황=양수 넓이, 파랑=음수 넓이). N을 늘리면 리만합이 실제 적분에 다가갑니다.</div>
        <cartesian-chart x-min="${X_MIN}" x-max="${X_MAX}" y-min="-3" y-max="3" x-label="x" y-label="f(x)">
          <series points="${curveStr(f, X_MIN, X_MAX)}" color="#1e293b" width="2"></series>
          <series points="${X_MIN},0 ${X_MAX},0" color="#e2e8f0" dash="4,4"></series>
          ${rectTags}
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#1e293b">— f(x)</b></span><span><b style="color:#f59e0b">■ 양수 넓이</b></span><span><b style="color:#3e63dd">■ 음수 넓이</b></span></div>
        <div class="math-notes" id="int-notes">
          <div>리만합 Σf(xᵢ)·Δx = ${sum.toFixed(4)} (직사각형 ${n}개)</div>
          <div>F(b)-F(a) = F(${b.toFixed(1)})-F(${a.toFixed(1)}) = ${F(b).toFixed(3)} - ${F(a).toFixed(3)} = ${trueVal.toFixed(4)}</div>
          <div>${err < 0.01 ? 'N이 충분히 커서 리만합이 실제 적분과 거의 같습니다' : 'N을 늘리면 리만합이 실제 적분에 더 가까워집니다'}</div>
        </div>
        <div class="ctl"><label>a (하한) <input id="int-a" type="range" min="${X_MIN}" max="${X_MAX}" step="0.1" value="${a}"><b id="int-a-val">${a.toFixed(1)}</b></label></div>
        <div class="ctl"><label>b (상한) <input id="int-b" type="range" min="${X_MIN}" max="${X_MAX}" step="0.1" value="${b}"><b id="int-b-val">${b.toFixed(1)}</b></label></div>
        <div class="ctl"><label>N (직사각형 개수) <input id="int-n" type="range" min="1" max="60" step="1" value="${n}"><b id="int-n-val">${n}</b></label></div>

        <div class="math-title">원함수 F(x) = x⁴/12 - x²/2 (F(b)-F(a) = 위 그래프의 넓이)</div>
        <cartesian-chart x-min="${X_MIN}" x-max="${X_MAX}" y-min="-1" y-max="2.5" x-label="x" y-label="F(x)" style="height:200px">
          <series points="${curveStr(F, X_MIN, X_MAX)}" color="#8b5cf6" width="2"></series>
          <series id="int-rise" points="${a.toFixed(3)},${F(a).toFixed(4)} ${a.toFixed(3)},${F(b).toFixed(4)} ${b.toFixed(3)},${F(b).toFixed(4)}" color="#10b981" dash="4,3"></series>
          <marker id="int-Fa" x="${a}" y="${F(a).toFixed(4)}" color="#e5484d" size="5" label="F(a)"></marker>
          <marker id="int-Fb" x="${b}" y="${F(b).toFixed(4)}" color="#10b981" size="5" label="F(b)"></marker>
        </cartesian-chart>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
