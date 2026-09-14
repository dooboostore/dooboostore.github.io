import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-derivative';

const MD = `
## 미분(derivative)이란?
- 함수 f(x) 위의 한 점에서 **"순간적으로 얼마나 가파른지"(기울기)**를 구하는 것입니다.
- 두 점 (x, f(x))와 (x+h, f(x+h))를 잇는 직선(**할선, secant**)의 기울기는 \`[f(x+h)-f(x)] / h\` 입니다.
- h를 점점 0에 가깝게 줄이면, 이 할선이 그 점에서의 **접선(tangent)**에 다가갑니다 — 그 극한이 **미분(도함수) f'(x)**입니다: \`f'(x) = lim(h→0) [f(x+h)-f(x)]/h\`
- 이 페이지의 함수는 \`f(x) = x³/3 - x\`, 미분하면 \`f'(x) = x² - 1\` 입니다. h를 슬라이더로 줄여가며 주황 할선이 초록 접선에 다가붙는 걸 확인하세요.
- **f'(x)는 그 자체로 새로운 함수**입니다(아래 그래프). \`f'(x)=0\`인 곳(x=±1)이 위 그래프에서 f(x)의 극값(봉우리·골짜기)과 정확히 일치합니다.
- **어디에 쓰이나요?** — 로봇의 속도(위치의 미분)·가속도(속도의 미분), 경사하강법(신경망 학습), PID의 D항(오차의 순간 변화율), 제어 시스템의 안정성 분석.
`;

function f(x: number) { return (x * x * x) / 3 - x; }
function fPrime(x: number) { return x * x - 1; }

function curveStr(fn: (x: number) => number, xMin: number, xMax: number, n = 80) {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xMin + ((xMax - xMin) * i) / n;
    pts.push(`${x.toFixed(3)},${fn(x).toFixed(4)}`);
  }
  return pts.join(' ');
}

const X_MIN = -2.6, X_MAX = 2.6;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathDerivative extends w.HTMLElement {
    private x = -1.5;
    private h = 1.2;

    private refresh() {
      const { x, h } = this;
      const y = f(x);
      const y2 = f(x + h);
      const secantSlope = (y2 - y) / h;
      const trueSlope = fPrime(x);
      const err = Math.abs(secantSlope - trueSlope);

      const applied = this.shadowRoot?.querySelector('#drv-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: x=${x.toFixed(2)}, h=${h.toFixed(3)} → 할선 기울기 = ${secantSlope.toFixed(3)}, 실제 f'(x) = ${trueSlope.toFixed(3)}, 오차 = ${err.toFixed(4)}`;

      const notes = this.shadowRoot?.querySelector('#drv-notes') as HTMLElement;
      if (notes) notes.innerHTML = `<div>[f(x+h)-f(x)]/h = [${y2.toFixed(3)} - ${y.toFixed(3)}] / ${h.toFixed(3)} = ${secantSlope.toFixed(3)}</div>` +
        `<div>f'(x) = x²-1 = ${trueSlope.toFixed(3)}</div>` +
        `<div>${err < 0.02 ? '오차가 거의 0 → 할선이 접선에 거의 포개짐' : 'h를 더 줄이면 할선이 접선에 더 가까워집니다'}</div>`;

      (['x', 'h'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#drv-${k}-val`) as HTMLElement;
        if (el) el.textContent = this[k].toFixed(2);
      });

      const pt = this.shadowRoot?.querySelector('#drv-pt') as HTMLElement;
      if (pt) { pt.setAttribute('x', x.toFixed(3)); pt.setAttribute('y', y.toFixed(4)); }
      const pt2 = this.shadowRoot?.querySelector('#drv-pt2') as HTMLElement;
      if (pt2) { pt2.setAttribute('x', (x + h).toFixed(3)); pt2.setAttribute('y', y2.toFixed(4)); }
      const secant = this.shadowRoot?.querySelector('#drv-secant') as HTMLElement;
      if (secant) {
        const x1 = X_MIN, x2v = X_MAX;
        secant.setAttribute('points', `${x1},${(y + secantSlope * (x1 - x)).toFixed(4)} ${x2v},${(y + secantSlope * (x2v - x)).toFixed(4)}`);
      }
      const tangent = this.shadowRoot?.querySelector('#drv-tangent') as HTMLElement;
      if (tangent) {
        const x1 = X_MIN, x2v = X_MAX;
        tangent.setAttribute('points', `${x1},${(y + trueSlope * (x1 - x)).toFixed(4)} ${x2v},${(y + trueSlope * (x2v - x)).toFixed(4)}`);
      }
      const dmark = this.shadowRoot?.querySelector('#drv-dmark') as HTMLElement;
      if (dmark) { dmark.setAttribute('x', x.toFixed(3)); dmark.setAttribute('y', trueSlope.toFixed(4)); }
    }

    @addEventListener('#drv-x', 'input')
    onX(e: Event) { this.x = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#drv-h', 'input')
    onH(e: Event) { this.h = Number((e.target as HTMLInputElement).value) || 0.02; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { x, h } = this;
      const y = f(x);
      const y2 = f(x + h);
      const secantSlope = (y2 - y) / h;
      const trueSlope = fPrime(x);
      const err = Math.abs(secantSlope - trueSlope);
      const x1 = X_MIN, x2v = X_MAX;
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
        <div class="math-formula">f(x) = x³/3 - x, 할선 기울기 [f(x+h)-f(x)]/h → f'(x) = x²-1</div>
        <div class="math-applied" id="drv-applied">적용: x=${x.toFixed(2)}, h=${h.toFixed(3)} → 할선 기울기 = ${secantSlope.toFixed(3)}, 실제 f'(x) = ${trueSlope.toFixed(3)}, 오차 = ${err.toFixed(4)}</div>
        <div class="math-desc">h를 줄여가며 주황 할선이 초록 접선에 다가붙는 걸 확인하세요. x를 옮기면 다른 지점의 기울기도 볼 수 있습니다.</div>
        <cartesian-chart x-min="${X_MIN}" x-max="${X_MAX}" y-min="-3" y-max="3" x-label="x" y-label="f(x)">
          <series points="${curveStr(f, X_MIN, X_MAX)}" color="#3e63dd" width="2.2" label="f(x)"></series>
          <series id="drv-tangent" points="${x1},${(y + trueSlope * (x1 - x)).toFixed(4)} ${x2v},${(y + trueSlope * (x2v - x)).toFixed(4)}" color="#10b981" width="1.6" label="접선(진짜 f'(x))"></series>
          <series id="drv-secant" points="${x1},${(y + secantSlope * (x1 - x)).toFixed(4)} ${x2v},${(y + secantSlope * (x2v - x)).toFixed(4)}" color="#f59e0b" dash="5,4" width="1.6" label="할선"></series>
          <marker id="drv-pt" x="${x}" y="${y.toFixed(4)}" color="#e5484d" size="5" label="P(x,f(x))"></marker>
          <marker id="drv-pt2" x="${(x + h).toFixed(3)}" y="${y2.toFixed(4)}" color="#f59e0b" size="4" label="Q(x+h,f(x+h))"></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#3e63dd">— f(x)</b></span><span><b style="color:#10b981">— 접선(f'(x))</b></span><span><b style="color:#f59e0b">- - 할선</b></span><span><b style="color:#e5484d">● P</b></span><span><b style="color:#f59e0b">● Q</b></span></div>
        <div class="math-notes" id="drv-notes">
          <div>[f(x+h)-f(x)]/h = [${y2.toFixed(3)} - ${y.toFixed(3)}] / ${h.toFixed(3)} = ${secantSlope.toFixed(3)}</div>
          <div>f'(x) = x²-1 = ${trueSlope.toFixed(3)}</div>
          <div>${err < 0.02 ? '오차가 거의 0 → 할선이 접선에 거의 포개짐' : 'h를 더 줄이면 할선이 접선에 더 가까워집니다'}</div>
        </div>
        <div class="ctl"><label>x <input id="drv-x" type="range" min="${X_MIN}" max="${X_MAX}" step="0.05" value="${x}"><b id="drv-x-val">${x.toFixed(2)}</b></label></div>
        <div class="ctl"><label>h (할선 간격) <input id="drv-h" type="range" min="0.02" max="2" step="0.02" value="${h}"><b id="drv-h-val">${h.toFixed(2)}</b></label></div>

        <div class="math-title">도함수 f'(x) = x² - 1 (그 자체로 새로운 함수)</div>
        <cartesian-chart x-min="${X_MIN}" x-max="${X_MAX}" y-min="-1.5" y-max="6" x-label="x" y-label="f'(x)" style="height:200px">
          <series points="${curveStr(fPrime, X_MIN, X_MAX)}" color="#8b5cf6" width="2"></series>
          <series points="${X_MIN},0 ${X_MAX},0" color="#e2e8f0" dash="4,4"></series>
          <marker id="drv-dmark" x="${x}" y="${trueSlope.toFixed(4)}" color="#e5484d" size="5"></marker>
        </cartesian-chart>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
