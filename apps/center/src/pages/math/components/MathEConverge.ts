import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-econverge';

const E = Math.E;
const LOG_MIN = 0, LOG_MAX = 6; // n = 10^x, x in [0,6] → n: 1 ~ 1,000,000

const MD = `
## 자연상수 e로 수렴하는 것들
- 가장 유명한 정의: \`e = lim(n→∞) (1+1/n)ⁿ\` — "이자를 n번에 나눠서 복리로 계산하면 어떻게 될까"라는 질문(연속복리)에서 나온 상수입니다.
- n을 키워보면 값이 e = 2.718281828...에 다가가지만, **아주 느리게** 수렴합니다 — n=100만이어도 아직 소수점 6번째 자리가 안 맞습니다.
- **훨씬 빨리 수렴하는 정의**도 있습니다: \`e = Σ 1/k! = 1/0! + 1/1! + 1/2! + ...\` — 겨우 항 12개만 더해도 오차가 소수점 10자리 밑으로 사라집니다.
- 두 정의 다 **"오일러 공식(e^iθ)"** 페이지에서 쓴 e와 완전히 같은 상수입니다 — \`(1+iθ/n)ⁿ\`의 실수(θ=1) 버전이 바로 왼쪽 \`(1+1/n)ⁿ\`입니다.
- **어디에 쓰이나요?** — 연속 성장·감쇠 모델(방전, 냉각, 인구 증가), 신경망의 지수함수(softmax·시그모이드), 연속복리 금융 계산, 로그·지수 신호 처리.
`;

function binomVal(n: number) { return Math.pow(1 + 1 / n, n); }

const K_MAX = 14;

function factSeriesTerms(K: number) {
  const terms: number[] = [];
  let fact = 1, sum = 0;
  for (let k = 0; k <= K; k++) {
    if (k > 0) fact *= k;
    const term = 1 / fact;
    terms.push(term);
    sum += term;
  }
  return { terms, sum };
}

/** k=0..K_MAX 부분합을 전부 계산 — 몇 항만 더해도 e에 거의 닿는 걸 그래프로 보여주기 위함. */
function factPartialSums(): number[] {
  const sums: number[] = [];
  let fact = 1, sum = 0;
  for (let k = 0; k <= K_MAX; k++) {
    if (k > 0) fact *= k;
    sum += 1 / fact;
    sums.push(sum);
  }
  return sums;
}

function sumCurvePoints() {
  return factPartialSums().map((s, k) => `${k},${s.toFixed(10)}`).join(' ');
}

function curvePoints() {
  const pts: string[] = [];
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const x = LOG_MIN + ((LOG_MAX - LOG_MIN) * i) / steps;
    const n = Math.max(1, Math.round(Math.pow(10, x)));
    pts.push(`${x.toFixed(3)},${binomVal(n).toFixed(6)}`);
  }
  return pts.join(' ');
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathEConverge extends w.HTMLElement {
    private logN = 3;
    private K = 5;

    private refresh() {
      const n = Math.max(1, Math.round(Math.pow(10, this.logN)));
      const val = binomVal(n);
      const errBinom = val - E;

      const { terms, sum } = factSeriesTerms(this.K);
      const errFact = sum - E;

      const applied1 = this.shadowRoot?.querySelector('#ec-applied1') as HTMLElement;
      if (applied1) applied1.textContent = `적용: n=${n.toLocaleString()} → (1+1/n)ⁿ = ${val.toFixed(8)}, 오차 = ${errBinom.toExponential(3)}`;
      const applied2 = this.shadowRoot?.querySelector('#ec-applied2') as HTMLElement;
      if (applied2) applied2.textContent = `적용: 항 ${this.K + 1}개 → Σ1/k! = ${sum.toFixed(10)}, 오차 = ${errFact.toExponential(3)}`;

      const nVal = this.shadowRoot?.querySelector('#ec-n-val') as HTMLElement;
      if (nVal) nVal.textContent = n.toLocaleString();
      const kVal = this.shadowRoot?.querySelector('#ec-k-val') as HTMLElement;
      if (kVal) kVal.textContent = String(this.K);

      const marker = this.shadowRoot?.querySelector('#ec-marker') as HTMLElement;
      if (marker) { marker.setAttribute('x', this.logN.toFixed(3)); marker.setAttribute('y', val.toFixed(6)); marker.setAttribute('label', `n=${n.toLocaleString()}: ${val.toFixed(5)}`); }

      const notes2 = this.shadowRoot?.querySelector('#ec-notes2') as HTMLElement;
      if (notes2) {
        notes2.innerHTML = terms.map((t, k) => `<div>1/${k}! = ${t.toExponential(3)}</div>`).slice(-4).join('') +
          `<div style="margin-top:4px;font-weight:800">부분합(${this.K + 1}개 항) = ${sum.toFixed(10)} (오차 ${errFact.toExponential(2)})</div>`;
      }

      const marker2 = this.shadowRoot?.querySelector('#ec-marker2') as HTMLElement;
      if (marker2) { marker2.setAttribute('x', String(this.K)); marker2.setAttribute('y', sum.toFixed(10)); marker2.setAttribute('label', `K=${this.K}: ${sum.toFixed(6)}`); }
    }

    @addEventListener('#ec-n', 'input')
    onN(e: Event) { this.logN = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#ec-k', 'input')
    onK(e: Event) { this.K = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const n = Math.max(1, Math.round(Math.pow(10, this.logN)));
      const val = binomVal(n);
      const errBinom = val - E;
      const { terms, sum } = factSeriesTerms(this.K);
      const errFact = sum - E;
      return `
        <style>
          :host { display:block; }
          .math-title { font-size:14px; font-weight:800; color:#1e293b; margin:14px 0 4px; }
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
          .ctl b { min-width:70px; text-align:right; color:#1e293b; }
          hr.ec-sep { border:none; border-top:1px solid #f1f5f9; margin:16px 0; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-title">① (1+1/n)ⁿ → e (느린 수렴)</div>
        <div class="math-formula">e = lim(n→∞) (1+1/n)ⁿ = 2.718281828459045...</div>
        <div class="math-applied" id="ec-applied1">적용: n=${n.toLocaleString()} → (1+1/n)ⁿ = ${val.toFixed(8)}, 오차 = ${errBinom.toExponential(3)}</div>
        <div class="math-desc">n을 로그 스케일로 늘려보세요(가로축=log₁₀ n). 보라 곡선이 점점 회색 점선(e)에 다가가지만 아주 천천히 다가갑니다.</div>
        <cartesian-chart x-min="${LOG_MIN}" x-max="${LOG_MAX}" y-min="1.8" y-max="2.85" x-label="log₁₀(n)" y-label="(1+1/n)ⁿ">
          <series points="${LOG_MIN},${E.toFixed(6)} ${LOG_MAX},${E.toFixed(6)}" color="#94a3b8" dash="4,4" label="e"></series>
          <series points="${curvePoints()}" color="#8b5cf6" width="2.2"></series>
          <marker id="ec-marker" x="${this.logN.toFixed(3)}" y="${val.toFixed(6)}" color="#f59e0b" size="5" label="n=${n.toLocaleString()}: ${val.toFixed(5)}"></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#94a3b8">- - e = 2.71828...</b></span><span><b style="color:#8b5cf6">— (1+1/n)ⁿ</b></span><span><b style="color:#f59e0b">● 현재 n</b></span></div>
        <div class="ctl"><label>n (log₁₀ 스케일) <input id="ec-n" type="range" min="${LOG_MIN}" max="${LOG_MAX}" step="0.05" value="${this.logN}"><b id="ec-n-val">${n.toLocaleString()}</b></label></div>

        <hr class="ec-sep">
        <div class="math-title">② Σ 1/k! → e (빠른 수렴)</div>
        <div class="math-formula">e = Σ(k=0→∞) 1/k! = 1/0! + 1/1! + 1/2! + ...</div>
        <div class="math-applied" id="ec-applied2">적용: 항 ${this.K + 1}개 → Σ1/k! = ${sum.toFixed(10)}, 오차 = ${errFact.toExponential(3)}</div>
        <div class="math-desc">항을 몇 개만 더해도 ①보다 훨씬 빨리 e에 도달합니다. 곡선이 가로축(k) 3~4 근처에서 벌써 회색 점선(e)에 딱 붙는 걸 확인하세요.</div>
        <cartesian-chart x-min="0" x-max="${K_MAX}" y-min="1.9" y-max="2.85" x-label="k (더한 항 개수-1)" y-label="Σ 1/k!">
          <series points="0,${E.toFixed(6)} ${K_MAX},${E.toFixed(6)}" color="#94a3b8" dash="4,4" label="e"></series>
          <series points="${sumCurvePoints()}" color="#10b981" width="2.2"></series>
          <marker id="ec-marker2" x="${this.K}" y="${sum.toFixed(10)}" color="#f59e0b" size="5" label="K=${this.K}: ${sum.toFixed(6)}"></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#94a3b8">- - e = 2.71828...</b></span><span><b style="color:#10b981">— Σ1/k!</b></span><span><b style="color:#f59e0b">● 현재 K</b></span></div>
        <div class="math-notes" id="ec-notes2">${terms.map((t, k) => `<div>1/${k}! = ${t.toExponential(3)}</div>`).slice(-4).join('')}<div style="margin-top:4px;font-weight:800">부분합(${this.K + 1}개 항) = ${sum.toFixed(10)} (오차 ${errFact.toExponential(2)})</div></div>
        <div class="ctl"><label>항 개수 K <input id="ec-k" type="range" min="0" max="${K_MAX}" step="1" value="${this.K}"><b id="ec-k-val">${this.K}</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
