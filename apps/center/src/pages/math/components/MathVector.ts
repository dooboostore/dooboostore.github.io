import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { Vector } from '@dooboostore/core';
import { marked } from 'marked';

const tagName = 'center-math-vector';

const MD = `
## 벡터 덧셈이란?
- 벡터는 **크기**와 **방향**을 가진 양입니다.
- 덧셈은 성분별로 계산합니다: \`a + b = (a₁+b₁, a₂+b₂)\`
- a·b·a+b는 각각 독립인 벡터로, 모두 원점에서 시작합니다.
- 슬라이더로 a·b 끝점을 움직이면 합벡터(초록 점선)가 바로 바뀝니다.
- **어디에 쓰이나요?** — 게임 캐릭터 이동(방향키 입력 합성), 비행기 속도 + 바람의 합성 속도, 물리에서 힘의 합성.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathVector extends w.HTMLElement {
    private ax = 4; private ay = 2;
    private bx = -2; private by = 3;

    private avec() { return new Vector(this.ax, this.ay); }
    private bvec() { return new Vector(this.bx, this.by); }
    private sum() { const s = this.avec(); s.add(this.bvec()); return s; }

    private refresh() {
      const { x: sx, y: sy } = this.sum();
      const setVec = (id: string, x2: number, y2: number, label: string) => {
        const el = this.shadowRoot?.querySelector(id) as HTMLElement;
        if (!el) return;
        el.setAttribute('x2', String(x2));
        el.setAttribute('y2', String(y2));
        el.setAttribute('label', label);
      };
      setVec('#vec-a', this.ax, this.ay, `a(${this.ax}, ${this.ay})`);
      setVec('#vec-b', this.bx, this.by, `b(${this.bx}, ${this.by})`);
      setVec('#vec-sum', sx, sy, `a+b(${sx}, ${sy})`);
      const guide1 = this.shadowRoot?.querySelector('#vec-g1') as HTMLElement;
      if (guide1) guide1.setAttribute('points', `${this.ax},${this.ay} ${sx},${sy}`);
      const guide2 = this.shadowRoot?.querySelector('#vec-g2') as HTMLElement;
      if (guide2) guide2.setAttribute('points', `${this.bx},${this.by} ${sx},${sy}`);
      const applied = this.shadowRoot?.querySelector('#vec-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: (${this.ax}, ${this.ay}) + (${this.bx}, ${this.by}) = (${sx}, ${sy})`;
      const legend = this.shadowRoot?.querySelector('#vec-legend') as HTMLElement;
      if (legend) {
        legend.innerHTML =
          `<span><b style="color:#6366f1">→ a(${this.ax}, ${this.ay})</b></span>` +
          `<span><b style="color:#f59e0b">→ b(${this.bx}, ${this.by})</b></span>` +
          `<span><b style="color:#10b981">→ a+b(${sx}, ${sy})</b></span>`;
      }
      const pairs: [string, number][] = [
        ['#vec-ax-val', this.ax], ['#vec-ay-val', this.ay],
        ['#vec-bx-val', this.bx], ['#vec-by-val', this.by],
      ];
      pairs.forEach(([sel, v]) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = String(v);
      });
    }

    @addEventListener('#vec-ax', 'input')
    onAx(e: Event) { this.ax = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#vec-ay', 'input')
    onAy(e: Event) { this.ay = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#vec-bx', 'input')
    onBx(e: Event) { this.bx = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#vec-by', 'input')
    onBy(e: Event) { this.by = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { x: sx, y: sy } = this.sum();
      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; color:#6366f1; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
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
        <div class="math-formula">수식: a + b = (a₁+b₁, a₂+b₂)</div>
        <div class="math-applied" id="vec-applied">적용: (${this.ax}, ${this.ay}) + (${this.bx}, ${this.by}) = (${sx}, ${sy})</div>
        <cartesian-chart x-min="-6" x-max="6" y-min="-8" y-max="8" center-x="0" center-y="0" x-label="X" y-label="Y">
          <vector id="vec-a" x1="0" y1="0" x2="${this.ax}" y2="${this.ay}" color="#6366f1" label="a(${this.ax}, ${this.ay})"></vector>
          <vector id="vec-b" x1="0" y1="0" x2="${this.bx}" y2="${this.by}" color="#f59e0b" label="b(${this.bx}, ${this.by})"></vector>
          <vector id="vec-sum" x1="0" y1="0" x2="${sx}" y2="${sy}" color="#10b981" dash="6,4" label="a+b(${sx}, ${sy})"></vector>
          <series id="vec-g1" points="${this.ax},${this.ay} ${sx},${sy}" color="#cbd5e1" dash="4,4"></series>
          <series id="vec-g2" points="${this.bx},${this.by} ${sx},${sy}" color="#cbd5e1" dash="4,4"></series>
        </cartesian-chart>
        <div class="math-legend" id="vec-legend"><span><b style="color:#6366f1">→ a(${this.ax}, ${this.ay})</b></span><span><b style="color:#f59e0b">→ b(${this.bx}, ${this.by})</b></span><span><b style="color:#10b981">→ a+b(${sx}, ${sy})</b></span></div>
        <div class="ctl"><label>a.x <input id="vec-ax" type="range" min="-6" max="6" step="0.5" value="${this.ax}"><b id="vec-ax-val">${this.ax}</b></label></div>
        <div class="ctl"><label>a.y <input id="vec-ay" type="range" min="-4" max="4" step="0.5" value="${this.ay}"><b id="vec-ay-val">${this.ay}</b></label></div>
        <div class="ctl"><label>b.x <input id="vec-bx" type="range" min="-6" max="6" step="0.5" value="${this.bx}"><b id="vec-bx-val">${this.bx}</b></label></div>
        <div class="ctl"><label>b.y <input id="vec-by" type="range" min="-4" max="4" step="0.5" value="${this.by}"><b id="vec-by-val">${this.by}</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
