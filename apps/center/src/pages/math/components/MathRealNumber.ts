import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-realnumber';

const X_MIN = -4, X_MAX = 4;

const MD = `
## 실수(real number)란?
- 우리가 일상적으로 쓰는 수 거의 전부입니다: 정수(...,-2,-1,0,1,2,...), 분수(1/2, 0.75), 무리수(π, √2)까지 전부 **실수**입니다. 그 출발점은 **"자연수"** 페이지의 1,2,3,...이고, 자연수가 뺄셈·나눗셈에 닫혀 있지 않아서 정수·유리수로, 그리고 결국 실수로 확장된 것입니다.
- 실수는 **하나의 직선(수직선)** 위에 순서대로 늘어놓을 수 있습니다 — 왼쪽일수록 작고, 오른쪽일수록 큽니다.
- 더하기·빼기·곱하기·나누기(0으로 나누기 제외)를 아무리 해도 결과가 항상 실수 범위 안에 남습니다.
- **하지만 결정적인 한계가 있습니다: 어떤 실수를 제곱해도 절대 음수가 되지 않습니다** (\`x² ≥ 0\`, 항상). 슬라이더로 x를 아무리 움직여 봐도 x²이 -1이 되는 지점은 없습니다 — 아래 파란 곡선이 점선(y=-1)에 닿지 않는 걸 확인하세요.
- 그래서 \`x² = -1\` 같은 방정식은 **실수 범위 안에서는 풀 수 없습니다.** 이 한계를 넘기 위해 다음 페이지에서 **"허수"**라는 새로운 수를 만듭니다.
- **어디에 쓰이나요?** — 위치·속도·온도·확률 같은 물리량 대부분이 실수로 표현됩니다. 여기서 못 푸는 문제(x²=-1)가 허수·복소수 개념의 출발점입니다.
`;

function curveStr(n = 100) {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const x = X_MIN + ((X_MAX - X_MIN) * i) / n;
    pts.push(`${x.toFixed(3)},${(x * x).toFixed(4)}`);
  }
  return pts.join(' ');
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathRealNumber extends w.HTMLElement {
    private x = 1.5;

    private refresh() {
      const { x } = this;
      const x2 = x * x;

      const applied = this.shadowRoot?.querySelector('#rn-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: x = ${x.toFixed(2)} → x² = ${x2.toFixed(2)} (항상 0 이상)`;

      const notes = this.shadowRoot?.querySelector('#rn-notes') as HTMLElement;
      if (notes) notes.innerHTML = `<div>x² = ${x.toFixed(2)} × ${x.toFixed(2)} = ${x2.toFixed(2)} ≥ 0</div>` +
        `<div>x가 양수든 음수든 x²은 절대 음수가 안 됨 — x²=-1을 만드는 실수 x는 존재하지 않음</div>`;

      const xVal = this.shadowRoot?.querySelector('#rn-x-val') as HTMLElement;
      if (xVal) xVal.textContent = x.toFixed(2);

      const lineMk = this.shadowRoot?.querySelector('#rn-line-mk') as HTMLElement;
      if (lineMk) { lineMk.setAttribute('x', x.toFixed(3)); lineMk.setAttribute('label', `x=${x.toFixed(2)}`); }
      const sqMk = this.shadowRoot?.querySelector('#rn-sq-mk') as HTMLElement;
      if (sqMk) { sqMk.setAttribute('x', x.toFixed(3)); sqMk.setAttribute('y', x2.toFixed(4)); sqMk.setAttribute('label', `x²=${x2.toFixed(2)}`); }
    }

    @addEventListener('#rn-x', 'input')
    onX(e: Event) { this.x = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { x } = this;
      const x2 = x * x;
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
        <div class="math-formula">실수는 수직선 위의 점 — 그런데 x²은 절대 음수가 안 됨</div>
        <div class="math-applied" id="rn-applied">적용: x = ${x.toFixed(2)} → x² = ${x2.toFixed(2)} (항상 0 이상)</div>
        <div class="math-desc">x를 아무리 움직여도 x²이 음수가 되는 지점은 없습니다. 아래 파란 곡선이 점선(y=-1)에 절대 닿지 않는 걸 확인하세요.</div>
        <div class="math-title">수직선 위의 x</div>
        <cartesian-chart x-min="${X_MIN}" x-max="${X_MAX}" y-min="-1" y-max="1" x-label="x" y-label="" hide-grid style="height:110px">
          <marker id="rn-line-mk" x="${x}" y="0" color="#6366f1" size="6" label="x=${x.toFixed(2)}"></marker>
        </cartesian-chart>
        <div class="math-title">y = x² (항상 0 이상, y=-1에는 절대 안 닿음)</div>
        <cartesian-chart x-min="${X_MIN}" x-max="${X_MAX}" y-min="-2" y-max="17" x-label="x" y-label="x²">
          <series points="${X_MIN},-1 ${X_MAX},-1" color="#ef4444" dash="4,4" label="y=-1 (닿을 수 없음)"></series>
          <series points="${curveStr()}" color="#3e63dd" width="2.2"></series>
          <marker id="rn-sq-mk" x="${x}" y="${x2.toFixed(4)}" color="#f59e0b" size="5" label="x²=${x2.toFixed(2)}"></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#3e63dd">— y=x²</b></span><span><b style="color:#ef4444">- - y=-1(도달 불가)</b></span><span><b style="color:#f59e0b">● 현재 x²</b></span></div>
        <div class="math-notes" id="rn-notes">
          <div>x² = ${x.toFixed(2)} × ${x.toFixed(2)} = ${x2.toFixed(2)} ≥ 0</div>
          <div>x가 양수든 음수든 x²은 절대 음수가 안 됨 — x²=-1을 만드는 실수 x는 존재하지 않음</div>
        </div>
        <div class="ctl"><label>x <input id="rn-x" type="range" min="${X_MIN}" max="${X_MAX}" step="0.1" value="${x}"><b id="rn-x-val">${x.toFixed(2)}</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
