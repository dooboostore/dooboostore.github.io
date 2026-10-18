import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { Vector } from '@dooboostore/core';
import { marked } from 'marked';

const tagName = 'center-math-norm';

const MD = `
## 노름(빗변)이란?
- 벡터의 **길이**입니다: \`|v| = √(x²+y²)\`
- 직각삼각형의 **빗변**과 같습니다 (피타고라스 정리).
- 1단계~4단계로 제곱 → 합 → 제곱근 순서로 계산합니다.
- **어디에 쓰이나요?** — 지도 앱 최단 거리, 게임에서 적까지의 거리, AI 손실함수(예측과 정답의 차이 크기).
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathNorm extends w.HTMLElement {
    private px = 5.5;
    private py = 10;

    private calc() {
      const x2 = this.px * this.px;
      const y2 = this.py * this.py;
      const sum = x2 + y2;
      return { x2, y2, sum, len: new Vector(this.px, this.py).norm() };
    }

    private refresh() {
      const { x2, y2, sum, len } = this.calc();
      const steps = this.shadowRoot?.querySelector('#math-norm-steps') as HTMLElement;
      if (steps) {
        steps.innerHTML =
          `<div>1단계 x² = ${this.px.toFixed(1)}² = ${x2.toFixed(2)}</div>` +
          `<div>2단계 y² = ${this.py.toFixed(1)}² = ${y2.toFixed(2)}</div>` +
          `<div>3단계 합 = ${sum.toFixed(2)} (= |v|²)</div>` +
          `<div>4단계 √합 = √${sum.toFixed(2)} = ${len.toFixed(3)} (= |v|)</div>`;
      }
      const xVal = this.shadowRoot?.querySelector('#norm-x-val') as HTMLElement;
      if (xVal) xVal.textContent = this.px.toFixed(1);
      const yVal = this.shadowRoot?.querySelector('#norm-y-val') as HTMLElement;
      if (yVal) yVal.textContent = this.py.toFixed(1);

      const legX = this.shadowRoot?.querySelector('#norm-leg-x') as HTMLElement;
      if (legX) legX.setAttribute('points', `0,0 ${this.px},0`);
      const legY = this.shadowRoot?.querySelector('#norm-leg-y') as HTMLElement;
      if (legY) legY.setAttribute('points', `${this.px},0 ${this.px},${this.py}`);
      const hyp = this.shadowRoot?.querySelector('#norm-hyp') as HTMLElement;
      if (hyp) {
        hyp.setAttribute('x2', String(this.px));
        hyp.setAttribute('y2', String(this.py));
        hyp.setAttribute('label', `빗변=${len.toFixed(2)}`);
      }
    }

    @addEventListener('#norm-x', 'input')
    onXInput(e: Event) {
      this.px = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @addEventListener('#norm-y', 'input')
    onYInput(e: Event) {
      this.py = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @onConnectedBodyShadow
    render() {
      const { x2, y2, sum, len } = this.calc();
      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .math-steps { font-size:12px; font-weight:700; color:#334155; text-align:right; margin-bottom:8px; line-height:1.6; }
          .math-legend { display:flex; gap:12px; font-size:11px; color:#64748b; margin-top:8px; flex-wrap:wrap; }
          .math-legend b { font-weight:800; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:36px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">norm: 빗변의 길이, |v| = √(x²+y²)</div>
        <div class="math-desc">x·y 슬라이더를 움직이면 직각삼각형의 빗변이 노름이 됩니다.</div>
        <div class="math-steps" id="math-norm-steps">
          <div>1단계 x² = ${this.px.toFixed(1)}² = ${x2.toFixed(2)}</div>
          <div>2단계 y² = ${this.py.toFixed(1)}² = ${y2.toFixed(2)}</div>
          <div>3단계 합 = ${sum.toFixed(2)} (= |v|²)</div>
          <div>4단계 √합 = √${sum.toFixed(2)} = ${len.toFixed(3)} (= |v|)</div>
        </div>
        <cartesian-chart x-min="-11" x-max="11" y-min="-11" y-max="11" x-label="X" y-label="Y" center-x="0" center-y="0">
          <series id="norm-leg-x" points="0,0 ${this.px},0" color="#2563eb" width="3"></series>
          <series id="norm-leg-y" points="${this.px},0 ${this.px},${this.py}" color="#16a34a" width="3"></series>
          <vector id="norm-hyp" x1="0" y1="0" x2="${this.px}" y2="${this.py}" color="#e5484d" width="2" label="빗변=${len.toFixed(2)}"></vector>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#2563eb">— x다리 ${this.px.toFixed(1)}</b></span><span><b style="color:#16a34a">— y다리 ${this.py.toFixed(1)}</b></span></div>
        <div class="ctl"><label>x <input id="norm-x" type="range" min="0" max="10" step="0.5" value="${this.px}"><b id="norm-x-val">${this.px.toFixed(1)}</b></label></div>
        <div class="ctl"><label>y <input id="norm-y" type="range" min="0" max="10" step="0.5" value="${this.py}"><b id="norm-y-val">${this.py.toFixed(1)}</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
