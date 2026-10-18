import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-naturalnumber';

const A_MIN = 1, A_MAX = 12;
const B_MIN = 1, B_MAX = 12;

const MD = `
## 자연수(natural number)란?
- 물건을 셀 때 쓰는 가장 기본적인 수입니다: 1, 2, 3, 4, ... (로봇공학·프로그래밍에서는 배열 인덱스가 0부터 시작하는 경우가 많아 **0을 포함**해서 쓰기도 합니다).
- **덧셈과 곱셈에는 "닫혀 있습니다"(closed)** — 자연수끼리 더하거나 곱하면 결과가 항상 다시 자연수입니다. 아래 첫 번째 구역에서 a+b, a×b가 항상 자연수 눈금(초록 점) 위에 정확히 떨어지는 걸 확인하세요.
- **하지만 뺄셈과 나눗셈에는 "닫혀 있지 않습니다"** — a가 b보다 작으면 a-b는 음수가 되어 자연수를 벗어나고, a가 b로 나누어떨어지지 않으면 a÷b는 자연수가 아닌 값(분수)이 됩니다. 아래 두 번째 구역에서 슬라이더를 움직여 결과가 자연수 눈금을 벗어나 빨간 영역에 찍히는 걸 확인하세요.
- 이 두 가지 "안 닫힘"이 바로 수 체계를 확장하는 이유입니다: **뺄셈의 한계 → 음수를 포함한 정수**, **나눗셈의 한계 → 분수를 포함한 유리수**로 이어지고, 그 다음이 **"실수"** 페이지, 그리고 실수의 한계(x²≥0)를 넘기 위한 **"허수"·"복소수"** 페이지로 이어집니다.
- **어디에 쓰이나요?** — 로봇 관절 개수, 센서 개수, 반복(loop) 횟수, 배열 인덱스처럼 "몇 개인지 세는 값"은 전부 자연수입니다. **"자유도(DOF)"** 페이지의 관절 개수 N, **"게인(이득)"** 페이지의 반복 스텝 수 같은 것들이 그 예입니다.
`;

function markersLine(lo: number, hi: number, color = '#cbd5e1', size = 3) {
  const tags: string[] = [];
  for (let i = lo; i <= hi; i++) tags.push(`<marker x="${i}" y="0" color="${color}" size="${size}"></marker>`);
  return tags.join('\n          ');
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathNaturalNumber extends w.HTMLElement {
    private a = 5;
    private b = 8;

    private refresh() {
      const { a, b } = this;
      const sum = a + b, prod = a * b, diff = a - b, quot = a / b;
      const quotIsNat = Number.isInteger(quot);

      const applied = this.shadowRoot?.querySelector('#nn-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: a=${a}, b=${b} → a+b=${sum}(자연수), a×b=${prod}(자연수), a-b=${diff}(${diff >= 0 ? '자연수' : '자연수 아님!'}), a÷b=${quot.toFixed(3)}(${quotIsNat ? '자연수' : '자연수 아님!'})`;

      (['a', 'b'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#nn-${k}-val`) as HTMLElement;
        if (el) el.textContent = String(this[k]);
      });

      const mkA1 = this.shadowRoot?.querySelector('#nn-a1') as HTMLElement;
      if (mkA1) mkA1.setAttribute('x', String(a));
      const mkB1 = this.shadowRoot?.querySelector('#nn-b1') as HTMLElement;
      if (mkB1) mkB1.setAttribute('x', String(b));
      const mkSum = this.shadowRoot?.querySelector('#nn-sum') as HTMLElement;
      if (mkSum) { mkSum.setAttribute('x', String(sum)); mkSum.setAttribute('label', `a+b=${sum}`); }

      const mkProd = this.shadowRoot?.querySelector('#nn-prod') as HTMLElement;
      if (mkProd) { mkProd.setAttribute('x', String(prod)); mkProd.setAttribute('label', `a×b=${prod}`); }

      const mkDiff = this.shadowRoot?.querySelector('#nn-diff') as HTMLElement;
      if (mkDiff) {
        mkDiff.setAttribute('x', String(diff));
        mkDiff.setAttribute('color', diff >= 0 ? '#10b981' : '#ef4444');
        mkDiff.setAttribute('label', `a-b=${diff}${diff >= 0 ? '' : ' (자연수 아님)'}`);
      }
      const mkQuot = this.shadowRoot?.querySelector('#nn-quot') as HTMLElement;
      if (mkQuot) {
        mkQuot.setAttribute('x', quot.toFixed(4));
        mkQuot.setAttribute('color', quotIsNat ? '#10b981' : '#ef4444');
        mkQuot.setAttribute('label', `a÷b=${quot.toFixed(3)}${quotIsNat ? '' : ' (자연수 아님)'}`);
      }

      const notes1 = this.shadowRoot?.querySelector('#nn-notes1') as HTMLElement;
      if (notes1) notes1.innerHTML = `<div>${a}+${b}=${sum} → 자연수 눈금 위에 정확히 있음</div><div>${a}×${b}=${prod} → 역시 자연수 눈금 위에 정확히 있음</div>`;

      const notes2 = this.shadowRoot?.querySelector('#nn-notes2') as HTMLElement;
      if (notes2) notes2.innerHTML = `<div>${a}-${b}=${diff} → ${diff >= 0 ? '자연수 범위 안(우연히 성립)' : '0보다 작아 자연수 범위를 벗어남 → 음수(정수)가 필요'}</div>` +
        `<div>${a}÷${b}=${quot.toFixed(3)} → ${quotIsNat ? '나누어떨어져서 자연수(우연히 성립)' : '나누어떨어지지 않아 자연수가 아님 → 분수(유리수)가 필요'}</div>`;
    }

    @addEventListener('#nn-a', 'input')
    onA(e: Event) { this.a = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('#nn-b', 'input')
    onB(e: Event) { this.b = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { a, b } = this;
      const sum = a + b, prod = a * b, diff = a - b, quot = a / b;
      const quotIsNat = Number.isInteger(quot);
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
          .ctl b { min-width:36px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">자연수: 1, 2, 3, ... — 덧셈·곱셈엔 닫혀 있지만 뺄셈·나눗셈엔 안 닫혀 있음</div>
        <div class="math-applied" id="nn-applied">적용: a=${a}, b=${b} → a+b=${sum}(자연수), a×b=${prod}(자연수), a-b=${diff}(${diff >= 0 ? '자연수' : '자연수 아님!'}), a÷b=${quot.toFixed(3)}(${quotIsNat ? '자연수' : '자연수 아님!'})</div>
        <div class="math-desc">a, b를 슬라이더로 바꿔가며 네 가지 연산 결과가 "자연수 눈금" 위에 있는지 확인하세요.</div>

        <div class="math-title">① 덧셈·곱셈 — 항상 자연수 (닫혀 있음)</div>
        <cartesian-chart x-min="0" x-max="24" y-min="-1" y-max="1" x-label="a+b" y-label="" hide-grid style="height:100px">
          ${markersLine(0, 24)}
          <marker id="nn-a1" x="${a}" y="0" color="#6366f1" size="5" label="a"></marker>
          <marker id="nn-b1" x="${b}" y="0" color="#a855f7" size="5" label="b"></marker>
          <marker id="nn-sum" x="${sum}" y="0" color="#10b981" size="7" label="a+b=${sum}"></marker>
        </cartesian-chart>
        <cartesian-chart x-min="0" x-max="150" y-min="-1" y-max="1" x-label="a×b" y-label="" hide-grid style="height:90px">
          <marker id="nn-prod" x="${prod}" y="0" color="#0ea5e9" size="7" label="a×b=${prod}"></marker>
        </cartesian-chart>
        <div class="math-notes" id="nn-notes1">
          <div>${a}+${b}=${sum} → 자연수 눈금 위에 정확히 있음</div>
          <div>${a}×${b}=${prod} → 역시 자연수 눈금 위에 정확히 있음</div>
        </div>

        <div class="math-title">② 뺄셈·나눗셈 — 자연수를 벗어날 수 있음 (안 닫혀 있음)</div>
        <cartesian-chart x-min="-11" x-max="11" y-min="-1" y-max="1" x-label="a-b" y-label="" hide-grid style="height:100px">
          <polygon points="-11,-1 0,-1 0,1 -11,1" color="#fecaca" fill="rgba(239,68,68,0.12)"></polygon>
          ${markersLine(0, 11)}
          <marker id="nn-diff" x="${diff}" y="0" color="${diff >= 0 ? '#10b981' : '#ef4444'}" size="7" label="a-b=${diff}${diff >= 0 ? '' : ' (자연수 아님)'}"></marker>
        </cartesian-chart>
        <cartesian-chart x-min="0" x-max="12" y-min="-1" y-max="1" x-label="a÷b" y-label="" hide-grid style="height:90px">
          ${markersLine(0, 12)}
          <marker id="nn-quot" x="${quot.toFixed(4)}" y="0" color="${quotIsNat ? '#10b981' : '#ef4444'}" size="7" label="a÷b=${quot.toFixed(3)}${quotIsNat ? '' : ' (자연수 아님)'}"></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#cbd5e1">● 자연수 눈금</b></span><span><b style="color:#10b981">● 결과가 자연수</b></span><span><b style="color:#ef4444">● 결과가 자연수 아님(빨간 영역/색)</b></span></div>
        <div class="math-notes" id="nn-notes2">
          <div>${a}-${b}=${diff} → ${diff >= 0 ? '자연수 범위 안(우연히 성립)' : '0보다 작아 자연수 범위를 벗어남 → 음수(정수)가 필요'}</div>
          <div>${a}÷${b}=${quot.toFixed(3)} → ${quotIsNat ? '나누어떨어져서 자연수(우연히 성립)' : '나누어떨어지지 않아 자연수가 아님 → 분수(유리수)가 필요'}</div>
        </div>

        <div class="ctl"><label>a <input id="nn-a" type="range" min="${A_MIN}" max="${A_MAX}" step="1" value="${a}"><b id="nn-a-val">${a}</b></label></div>
        <div class="ctl"><label>b <input id="nn-b" type="range" min="${B_MIN}" max="${B_MAX}" step="1" value="${b}"><b id="nn-b-val">${b}</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
