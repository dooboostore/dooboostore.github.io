import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-det';

const MD = `
## 행렬식(determinant, det)이란?
- 행렬 A의 두 열벡터(c1, c2)가 만드는 평행사변형의 **부호 있는 넓이**입니다.
- 수식: \`A = [[a,b],[c,d]]\`, \`det(A) = ad - bc\`
- \`|det(A)|\` = 넓이(단위정사각형이 몇 배로 늘어났는가). **det=0이면 넓이가 0**이 되어 평행사변형이 찌그러져 선(또는 점)이 됩니다 — 이런 행렬을 **특이행렬(singular)**이라 하고, 역행렬이 존재하지 않습니다.
- **det<0이면 방향이 뒤집힙니다** (거울에 비친 모양, 왼손↔오른손). det>0이면 방향이 유지됩니다.
- rank(상자) 페이지의 "상자 부피"가 바로 3×3 행렬식입니다 — 2D의 넓이가 3D에서는 부피가 됩니다.
- **어디에 쓰이나요?** — 역행렬 존재 여부 판정, 좌표변환의 넓이/부피 배율 계산, 3D 그래픽의 앞면·뒷면(winding order) 판정, 연립방정식의 해가 유일한지 확인(크래머 공식).
`;

function det(a: number, b: number, c: number, d: number) {
  return a * d - b * c;
}

function notesHtml(a: number, b: number, c: number, d: number) {
  const dt = det(a, b, c, d);
  const singular = Math.abs(dt) < 0.05;
  return `<div>det(A) = ad - bc = ${a.toFixed(1)}×${d.toFixed(1)} - ${b.toFixed(1)}×${c.toFixed(1)} = ${dt.toFixed(2)}</div>` +
    `<div>|det(A)| = 넓이 = ${Math.abs(dt).toFixed(2)}</div>` +
    `<div>${dt >= 0 ? 'det ≥ 0 → 방향 유지 (원래 손 그대로)' : 'det < 0 → 방향 뒤집힘 (거울상)'}</div>` +
    (singular ? `<div style="margin-top:6px;color:#ef4444">det ≈ 0 → 평행사변형이 선으로 찌그러짐 (특이행렬, 역행렬 없음)</div>` : '');
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathDet extends w.HTMLElement {
    private a = 2;
    private b = 1;
    private c = -1;
    private d = 2;

    private refresh() {
      const { a, b, c, d } = this;
      const dt = det(a, b, c, d);
      const color = dt >= 0 ? '#6366f1' : '#ef4444';

      const applied = this.shadowRoot?.querySelector('#math-det-applied') as HTMLElement;
      if (applied) {
        applied.style.color = color;
        applied.textContent = `적용: A = [[${a.toFixed(1)}, ${b.toFixed(1)}], [${c.toFixed(1)}, ${d.toFixed(1)}]] → det(A) = ${dt.toFixed(2)} (넓이 ${Math.abs(dt).toFixed(2)})`;
      }

      const notes = this.shadowRoot?.querySelector('#math-det-notes') as HTMLElement;
      if (notes) notes.innerHTML = notesHtml(a, b, c, d);

      (['a', 'b', 'c', 'd'] as const).forEach(k => {
        const val = this.shadowRoot?.querySelector(`#det-${k}-val`) as HTMLElement;
        if (val) val.textContent = this[k].toFixed(1);
      });

      const para = this.shadowRoot?.querySelector('#det-para') as HTMLElement;
      if (para) {
        para.setAttribute('points', `0,0 ${a.toFixed(2)},${c.toFixed(2)} ${(a + b).toFixed(2)},${(c + d).toFixed(2)} ${b.toFixed(2)},${d.toFixed(2)}`);
        para.setAttribute('color', color);
        para.setAttribute('fill', dt >= 0 ? 'rgba(99,102,241,0.15)' : 'rgba(239,68,68,0.15)');
      }
      const c1 = this.shadowRoot?.querySelector('#det-c1') as HTMLElement;
      if (c1) { c1.setAttribute('x2', a.toFixed(2)); c1.setAttribute('y2', c.toFixed(2)); c1.setAttribute('label', `c1=(${a.toFixed(1)}, ${c.toFixed(1)})`); }
      const c2 = this.shadowRoot?.querySelector('#det-c2') as HTMLElement;
      if (c2) { c2.setAttribute('x2', b.toFixed(2)); c2.setAttribute('y2', d.toFixed(2)); c2.setAttribute('label', `c2=(${b.toFixed(1)}, ${d.toFixed(1)})`); }
    }

    @addEventListener('#det-a', 'input')
    onAInput(e: Event) { this.a = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#det-b', 'input')
    onBInput(e: Event) { this.b = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#det-c', 'input')
    onCInput(e: Event) { this.c = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#det-d', 'input')
    onDInput(e: Event) { this.d = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { a, b, c, d } = this;
      const dt = det(a, b, c, d);
      const color = dt >= 0 ? '#6366f1' : '#ef4444';
      return `
        <style>
          :host { display:block; }
          .math-title { font-size:15px; font-weight:800; color:#1e293b; text-align:center; margin-bottom:8px; }
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
        <div class="math-title">단위정사각형(회색) → A를 곱하면 평행사변형으로</div>
        <div class="math-formula">수식: A = [[a,b],[c,d]], det(A) = ad - bc = 넓이(부호 있음)</div>
        <div class="math-applied" id="math-det-applied" style="color:${color}">적용: A = [[${a.toFixed(1)}, ${b.toFixed(1)}], [${c.toFixed(1)}, ${d.toFixed(1)}]] → det(A) = ${dt.toFixed(2)} (넓이 ${Math.abs(dt).toFixed(2)})</div>
        <div class="math-desc">a·b·c·d를 바꾸면 평행사변형 넓이와 방향이 바뀝니다. det이 음수가 되도록 만들어서 도형이 "뒤집히는" 것도 확인해 보세요.</div>
        <cartesian-chart x-min="-4" x-max="4" y-min="-4" y-max="4" center-x="0" center-y="0" x-label="X" y-label="Y">
          <polygon points="0,0 1,0 1,1 0,1" color="#94a3b8" dash="4,4" label="단위정사각형"></polygon>
          <polygon id="det-para" points="0,0 ${a.toFixed(2)},${c.toFixed(2)} ${(a + b).toFixed(2)},${(c + d).toFixed(2)} ${b.toFixed(2)},${d.toFixed(2)}" color="${color}" fill="${dt >= 0 ? 'rgba(99,102,241,0.15)' : 'rgba(239,68,68,0.15)'}" label="A·단위정사각형"></polygon>
          <vector id="det-c1" x1="0" y1="0" x2="${a.toFixed(2)}" y2="${c.toFixed(2)}" color="#e5484d" label="c1=(${a.toFixed(1)}, ${c.toFixed(1)})"></vector>
          <vector id="det-c2" x1="0" y1="0" x2="${b.toFixed(2)}" y2="${d.toFixed(2)}" color="#3e63dd" label="c2=(${b.toFixed(1)}, ${d.toFixed(1)})"></vector>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#94a3b8">- - 단위정사각형</b></span><span><b style="color:${color}">■ A·단위정사각형</b></span><span><b style="color:#e5484d">→ c1(1열)</b></span><span><b style="color:#3e63dd">→ c2(2열)</b></span></div>
        <div class="math-notes" id="math-det-notes">${notesHtml(a, b, c, d)}</div>
        <div class="ctl"><label>a <input id="det-a" type="range" min="-3" max="3" step="0.5" value="${a}"><b id="det-a-val">${a.toFixed(1)}</b></label></div>
        <div class="ctl"><label>b <input id="det-b" type="range" min="-3" max="3" step="0.5" value="${b}"><b id="det-b-val">${b.toFixed(1)}</b></label></div>
        <div class="ctl"><label>c <input id="det-c" type="range" min="-3" max="3" step="0.5" value="${c}"><b id="det-c-val">${c.toFixed(1)}</b></label></div>
        <div class="ctl"><label>d <input id="det-d" type="range" min="-3" max="3" step="0.5" value="${d}"><b id="det-d-val">${d.toFixed(1)}</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
