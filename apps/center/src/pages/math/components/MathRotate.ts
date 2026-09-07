import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { MathUtil, Point2D } from '@dooboostore/core';
import { marked } from 'marked';

const tagName = 'center-math-rotate';

const MD = `
## 회전이란?
- 벡터를 원점 기준으로 각도 θ만큼 돌립니다.
- 회전 행렬: \`x' = x·cosθ - y·sinθ\`, \`y' = x·sinθ + y·cosθ\`
- 길이는 그대로 두고 방향만 바뀝니다.
- **어디에 쓰이나요?** — 게임 캐릭터·카메라 회전, 로봇 팔 관절 계산, 사진·지도 회전 변환.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathRotate extends w.HTMLElement {
    private px = 4;
    private py = 2;
    private deg = 60;

    private calc() {
      const rad = (this.deg * Math.PI) / 180;
      const p = MathUtil.rotatePoint(new Point2D(this.px, this.py), new Point2D(0, 0), rad);
      const base = Math.atan2(this.py, this.px);
      return { rad, rx: p.x, ry: p.y, arcS: base, arcE: base + rad };
    }

    private refresh() {
      const { rx, ry } = this.calc();
      const applied = this.shadowRoot?.querySelector('#math-rotate-applied') as HTMLElement;
      if (applied) {
        applied.textContent =
          `적용: (${this.px}, ${this.py}) ${this.deg}° 회전 = (${rx.toFixed(2)}, ${ry.toFixed(2)})`;
      }
      const xVal = this.shadowRoot?.querySelector('#rotate-x-val') as HTMLElement;
      if (xVal) xVal.textContent = String(this.px);
      const yVal = this.shadowRoot?.querySelector('#rotate-y-val') as HTMLElement;
      if (yVal) yVal.textContent = String(this.py);
      const dVal = this.shadowRoot?.querySelector('#rotate-deg-val') as HTMLElement;
      if (dVal) dVal.textContent = `${this.deg}°`;
      const vec = this.shadowRoot?.querySelector('#rotate-vec') as HTMLElement;
      if (vec) {
        vec.setAttribute('x2', String(this.px));
        vec.setAttribute('y2', String(this.py));
        vec.setAttribute('label', `v(${this.px}, ${this.py})`);
      }
      const rot = this.shadowRoot?.querySelector('#rotate-rot') as HTMLElement;
      if (rot) {
        rot.setAttribute('x2', String(parseFloat(rx.toFixed(2))));
        rot.setAttribute('y2', String(parseFloat(ry.toFixed(2))));
        rot.setAttribute('label', `v'(${rx.toFixed(2)}, ${ry.toFixed(2)})`);
      }
      const arc = this.shadowRoot?.querySelector('#rotate-arc') as HTMLElement;
      if (arc) {
        const { arcS, arcE } = this.calc();
        arc.setAttribute('start-angle', String(arcS));
        arc.setAttribute('end-angle', String(arcE));
      }
    }

    @addEventListener('#rotate-x', 'input')
    onXInput(e: Event) {
      this.px = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @addEventListener('#rotate-y', 'input')
    onYInput(e: Event) {
      this.py = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @addEventListener('#rotate-deg', 'input')
    onDegInput(e: Event) {
      this.deg = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @onConnectedBodyShadow
    render() {
      const { rx, ry, arcS, arcE } = this.calc();
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
          .ctl b { min-width:44px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">수식: x' = x·cosθ − y·sinθ, y' = x·sinθ + y·cosθ</div>
        <div class="math-applied" id="math-rotate-applied">적용: (${this.px}, ${this.py}) ${this.deg}° 회전 = (${rx.toFixed(2)}, ${ry.toFixed(2)})</div>
        <div class="math-desc">슬라이더로 벡터와 회전 각도를 바꾸면 초록 회전 벡터가 따라 돕니다.</div>
        <cartesian-chart x-min="-6" x-max="6" y-min="-6" y-max="6" center-x="0" center-y="0" x-label="X" y-label="Y">
          <vector id="rotate-vec" x1="0" y1="0" x2="${this.px}" y2="${this.py}" color="#6366f1" label="v(${this.px}, ${this.py})"></vector>
          <vector id="rotate-rot" x1="0" y1="0" x2="${rx.toFixed(2)}" y2="${ry.toFixed(2)}" color="#10b981" label="v'(${rx.toFixed(2)}, ${ry.toFixed(2)})"></vector>
          <arc id="rotate-arc" x="0" y="0" r="34" start-angle="${arcS}" end-angle="${arcE}" color="#f59e0b"></arc>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#6366f1">→ v(원본)</b></span><span><b style="color:#10b981">→ v'(회전)</b></span></div>
        <div class="ctl"><label>v.x <input id="rotate-x" type="range" min="-6" max="6" step="0.5" value="${this.px}"><b id="rotate-x-val">${this.px}</b></label></div>
        <div class="ctl"><label>v.y <input id="rotate-y" type="range" min="-6" max="6" step="0.5" value="${this.py}"><b id="rotate-y-val">${this.py}</b></label></div>
        <div class="ctl"><label>각도 <input id="rotate-deg" type="range" min="0" max="360" step="1" value="${this.deg}"><b id="rotate-deg-val">${this.deg}°</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
