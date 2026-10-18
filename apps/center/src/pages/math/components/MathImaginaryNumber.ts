import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-imaginarynumber';

const N_MAX = 8;

const MD = `
## 허수(imaginary number)란?
- **"실수" 페이지**에서 봤듯, 어떤 실수를 제곱해도 절대 음수가 안 됩니다 — 그래서 \`x² = -1\`을 실수 범위에서는 풀 수 없습니다.
- 이 방정식을 풀기 위해 **완전히 새로운 수 i(허수단위)를 정의**합니다: \`i² = -1\`.
- i는 실수직선 위에 있지 않습니다 — 그 직선에 **수직인 새로운 축(허수축)** 위에 있다고 생각합니다. 실수축과 허수축을 합친 평면이 **복소평면**입니다 (**"복소수"** 페이지에서 이어집니다).
- **i의 거듭제곱은 4개마다 반복됩니다**: \`i⁰=1, i¹=i, i²=-1, i³=-i, i⁴=1, ...\` — 이건 매번 원점 기준으로 **90°씩 회전**하는 것과 정확히 같습니다.
- 이게 바로 **"오일러 공식(e^iθ)"** 페이지의 \`e^(iθ)\`가 회전이 되는 이유의 가장 단순한 버전입니다 — i를 곱하는 건 "90도 회전시키기"입니다.
- 슬라이더로 n을 늘려가며, 점이 단위원 위를 90°씩 돌아 4번마다 제자리로 돌아오는 걸 확인하세요.
- **어디에 쓰이나요?** — "복소수"·"오일러 공식"·"라플라스 변환"·"푸리에 변환" 전부 이 i 하나에서 시작합니다. 신호처리·회로 해석·양자역학의 기본 언어입니다.
`;

function iPower(n: number): [number, number] {
  const rad = (n * Math.PI) / 2;
  return [Math.cos(rad), Math.sin(rad)];
}

function labelFor(n: number): string {
  const m = ((n % 4) + 4) % 4;
  return ['1', 'i', '-1', '-i'][m];
}

const AXIS_POINTS = [
  { x: 1, y: 0, label: '1' },
  { x: 0, y: 1, label: 'i' },
  { x: -1, y: 0, label: '-1' },
  { x: 0, y: -1, label: '-i' },
];

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathImaginaryNumber extends w.HTMLElement {
    private n = 0;

    private refresh() {
      const { n } = this;
      const [x, y] = iPower(n);
      const label = labelFor(n);

      const applied = this.shadowRoot?.querySelector('#im-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: i^${n} = ${label} (위치: ${x.toFixed(2)}, ${y.toFixed(2)})`;

      const notes = this.shadowRoot?.querySelector('#im-notes') as HTMLElement;
      if (notes) notes.innerHTML = `<div>i^${n} = i^(${n} mod 4) = i^${((n % 4) + 4) % 4} = ${label}</div>` +
        `<div>i를 한 번 곱할 때마다 원점 기준 90°씩 돌아갑니다 (4번이면 한 바퀴, 제자리로 복귀)</div>`;

      const nVal = this.shadowRoot?.querySelector('#im-n-val') as HTMLElement;
      if (nVal) nVal.textContent = String(n);

      const vec = this.shadowRoot?.querySelector('#im-vec') as HTMLElement;
      if (vec) { vec.setAttribute('x2', x.toFixed(4)); vec.setAttribute('y2', y.toFixed(4)); vec.setAttribute('label', `i^${n}=${label}`); }
    }

    @addEventListener('#im-n', 'input')
    onN(e: Event) { this.n = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { n } = this;
      const [x, y] = iPower(n);
      const label = labelFor(n);
      const axisTags = AXIS_POINTS.map(p => `<marker x="${p.x}" y="${p.y}" color="#94a3b8" size="4" label="${p.label}"></marker>`).join('\n          ');
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
        <div class="math-formula">i² = -1, i를 곱할 때마다 90°씩 회전 (4번이면 한 바퀴)</div>
        <div class="math-applied" id="im-applied">적용: i^${n} = ${label} (위치: ${x.toFixed(2)}, ${y.toFixed(2)})</div>
        <div class="math-desc">n을 늘려가며 화살표가 1 → i → -1 → -i → 1 순서로 90°씩 돌아가는 걸 확인하세요.</div>
        <cartesian-chart x-min="-1.6" x-max="1.6" y-min="-1.6" y-max="1.6" x-label="실수축" y-label="허수축">
          <circle x="0" y="0" r="1" color="#cbd5e1" dash="4,4"></circle>
          ${axisTags}
          <vector id="im-vec" x1="0" y1="0" x2="${x.toFixed(4)}" y2="${y.toFixed(4)}" color="#8b5cf6" label="i^${n}=${label}"></vector>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#cbd5e1">- - 단위원</b></span><span><b style="color:#8b5cf6">→ i^n</b></span><span><b style="color:#94a3b8">● 1, i, -1, -i</b></span></div>
        <div class="math-notes" id="im-notes">
          <div>i^${n} = i^(${n} mod 4) = i^${((n % 4) + 4) % 4} = ${label}</div>
          <div>i를 한 번 곱할 때마다 원점 기준 90°씩 돌아갑니다 (4번이면 한 바퀴, 제자리로 복귀)</div>
        </div>
        <div class="ctl"><label>n (i의 거듭제곱) <input id="im-n" type="range" min="0" max="${N_MAX}" step="1" value="${n}"><b id="im-n-val">${n}</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
