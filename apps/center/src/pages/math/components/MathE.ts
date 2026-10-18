import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-e';

const E = Math.E;

/** "1년에 100원 → 200원" 저금통을 몇 번에 나눠서 계산해줄지 — 초등학생도 감 잡을 수 있는 익숙한 단위들 */
const STEPS: { n: number; label: string }[] = [
  { n: 1, label: '1년에 딱 1번' },
  { n: 2, label: '6개월마다(2번)' },
  { n: 4, label: '3개월마다(4번)' },
  { n: 12, label: '매달(12번)' },
  { n: 52, label: '매주(52번)' },
  { n: 365, label: '매일(365번)' },
  { n: 8760, label: '매시간(8,760번)' },
  { n: 100000, label: '훨씬 더 잘게(10만 번)' },
];

function multiplier(n: number) { return Math.pow(1 + 1 / n, n); }

const MD = `
## 자연상수 e란 무엇일까요?
- e는 **2.718281828...** 처럼 끝없이 이어지는 하나의 숫자예요(원주율 π처럼요).
- 어디서 나오는 숫자냐면, **"이자를 자주 나눠서 계산해주는 마법 저금통"** 이야기로 알 수 있어요.
- 100원을 넣으면 1년 뒤 **딱 원래 돈만큼 이자를 더 주는(=100% 이자)** 신기한 저금통이 있다고 해봐요.
  - 1년에 딱 한 번만 계산하면: 100원 → **200원** (2배)
  - 반으로 나눠서 두 번 계산하면(6개월마다 50%씩): 100원 → **225원** (2.25배) — 어? 더 늘었어요!
  - 훨씬 더 잘게 나눠서(매달, 매일, 매시간...) 자꾸자꾸 계산해주면 점점 더 늘어나요.
  - 그런데 아무리 잘게 나눠도 **2.71828...배(= e배)** 보다 훨씬 커지지는 않아요 — 딱 여기서 멈춰요!
- 그래서 e는 **"쉬지 않고 끊임없이 조금씩 불어나는 것"** 을 계산할 때마다 자꾸자꾸 나타나는 아주 특별한 숫자예요.
- **어디서 또 만날 수 있나요?** — 세균이 계속 늘어날 때, 뜨거운 커피가 식을 때, 배터리가 계속 닳을 때처럼 "조금씩 계속 변하는" 거의 모든 곳에 이 e가 숨어있어요.
- 더 정확한 계산과 증명이 궁금하다면 **"자연상수 e로 수렴"** 페이지에서, e가 실제로 쓰이는 곳(감쇠·성장 곡선)이 궁금하다면 **"시정수(τ)"** 페이지에서 이어서 볼 수 있어요.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathE extends w.HTMLElement {
    private idx = 3; // 기본값: 매달(12번)

    private refresh() {
      const step = STEPS[this.idx];
      const m = multiplier(step.n);
      const money = 100 * m;
      const isLast = this.idx === STEPS.length - 1;

      const applied = this.shadowRoot?.querySelector('#me-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: ${step.label} 나눠 계산 → 100원이 ${money.toFixed(2)}원(${m.toFixed(4)}배)이 돼요`;

      const big = this.shadowRoot?.querySelector('#me-big') as HTMLElement;
      if (big) big.textContent = `100원 → ${money.toFixed(1)}원`;

      const idxVal = this.shadowRoot?.querySelector('#me-idx-val') as HTMLElement;
      if (idxVal) idxVal.textContent = step.label;

      const mk = this.shadowRoot?.querySelector('#me-mk') as HTMLElement;
      if (mk) { mk.setAttribute('x', String(this.idx)); mk.setAttribute('y', m.toFixed(6)); mk.setAttribute('label', `${step.label}: ${m.toFixed(4)}배`); }

      const notes = this.shadowRoot?.querySelector('#me-notes') as HTMLElement;
      if (notes) notes.innerHTML =
        `<div>${step.label} 나눠 계산 → ${m.toFixed(6)}배</div>` +
        `<div>e = ${E.toFixed(6)}... 와 차이 = ${Math.abs(m - E).toFixed(6)}</div>` +
        `<div style="margin-top:4px;font-weight:800">${isLast ? '거의 e에 다 왔어요! 아무리 더 잘게 나눠도 이보다 훨씬 커지진 않아요.' : '더 잘게 나눠보면 어떻게 될까요? 슬라이더를 오른쪽으로 옮겨보세요.'}</div>`;
    }

    @addEventListener('#me-n', 'input')
    onN(e: Event) {
      this.idx = Math.max(0, Math.min(STEPS.length - 1, Number((e.target as HTMLInputElement).value) || 0));
      this.refresh();
    }

    @onConnectedBodyShadow
    render() {
      const step = STEPS[this.idx];
      const m = multiplier(step.n);
      const money = 100 * m;
      const isLast = this.idx === STEPS.length - 1;
      const curvePts = STEPS.map((s, i) => `${i},${multiplier(s.n).toFixed(6)}`).join(' ');
      return `
        <style>
          :host { display:block; }
          .math-title { font-size:13px; font-weight:800; color:#475569; margin:14px 0 2px; }
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
          .ctl b { min-width:110px; text-align:right; color:#1e293b; }
          .me-big { font-size:26px; font-weight:900; color:#1e293b; text-align:center; margin:10px 0; }
          .me-cards { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
          .me-card { background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:12px; padding:10px 12px; font-size:13px; color:#334155; flex:1 1 130px; text-align:center; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">100원을 "1년에 100% 이자"를 주는 저금통에 넣고, 계산을 여러 번 나눠서 해주면?</div>
        <div class="math-applied" id="me-applied">적용: ${step.label} 나눠 계산 → 100원이 ${money.toFixed(2)}원(${m.toFixed(4)}배)이 돼요</div>
        <div class="math-desc">슬라이더를 오른쪽으로 옮겨서 이자 계산을 더 자주(더 잘게) 나눠보세요. 100원이 점점 더 불어나지만, 어느 순간부터는 거의 늘지 않아요!</div>

        <div class="me-big" id="me-big">100원 → ${money.toFixed(1)}원</div>

        <cartesian-chart x-min="0" x-max="${STEPS.length - 1}" y-min="1.8" y-max="2.9" x-label="얼마나 잘게 나눴나" y-label="몇 배가 됐나" disabled-aspect>
          <series points="0,${E.toFixed(6)} ${STEPS.length - 1},${E.toFixed(6)}" color="#94a3b8" dash="4,4" label="e=2.71828..."></series>
          <series points="${curvePts}" color="#f59e0b" width="2.4"></series>
          <marker id="me-mk" x="${this.idx}" y="${m.toFixed(6)}" color="#6366f1" size="7" label="${step.label}: ${m.toFixed(4)}배"></marker>
        </cartesian-chart>
        <div class="math-legend">
          <span><b style="color:#94a3b8">- - e = 2.71828...</b></span>
          <span><b style="color:#f59e0b">— 나눠 계산할수록 변하는 배수</b></span>
          <span><b style="color:#6366f1">● 지금 고른 값</b></span>
        </div>
        <div class="ctl"><label>얼마나 잘게 나눌까 <input id="me-n" type="range" min="0" max="${STEPS.length - 1}" step="1" value="${this.idx}"><b id="me-idx-val">${step.label}</b></label></div>
        <div class="math-notes" id="me-notes">
          <div>${step.label} 나눠 계산 → ${m.toFixed(6)}배</div>
          <div>e = ${E.toFixed(6)}... 와 차이 = ${Math.abs(m - E).toFixed(6)}</div>
          <div style="margin-top:4px;font-weight:800">${isLast ? '거의 e에 다 왔어요! 아무리 더 잘게 나눠도 이보다 훨씬 커지진 않아요.' : '더 잘게 나눠보면 어떻게 될까요? 슬라이더를 오른쪽으로 옮겨보세요.'}</div>
        </div>

        <div class="math-title">e는 어디에 또 숨어있을까요?</div>
        <div class="me-cards">
          <div class="me-card">🦠 세균이 계속 늘어날 때</div>
          <div class="me-card">☕ 뜨거운 커피가 식을 때</div>
          <div class="me-card">🔋 배터리가 계속 닳을 때</div>
          <div class="me-card">💰 은행 이자를 계산할 때</div>
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
