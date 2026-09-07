import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { Vector } from '@dooboostore/core';
import { marked } from 'marked';

const tagName = 'center-math-normalize';

const MD = `
## 정규화란?
- 벡터를 **길이 1짜리 단위벡터**로 만드는 것입니다: \`v̂ = v / |v|\`
- 방향은 그대로 두고 크기만 1로 맞춥니다.
- 끝점은 항상 반지름 1짜리 원(단위원) 위에 있습니다.
- 길이·각도 슬라이더로 v를 움직이면 단위벡터가 단위원 위를 따라 돕니다.
- **어디에 쓰이나요?** — 게임 캐릭터 이동 방향(속도와 무관하게 방향만 필요할 때), 3D 조명 법선 벡터, 문장 유사도 비교 전 정규화.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathNormalize extends w.HTMLElement {
    private len = 10;
    private deg = 53;

    private calc() {
      const rad = (this.deg * Math.PI) / 180;
      const px = this.len * Math.cos(rad);
      const py = this.len * Math.sin(rad);
      const u = new Vector(px, py).get();
      u.normalize();
      return { rad, px, py, ux: u.x, uy: u.y };
    }

    private refresh() {
      const { px, py, ux, uy } = this.calc();
      const applied = this.shadowRoot?.querySelector('#math-norm-applied') as HTMLElement;
      if (applied) {
        applied.textContent =
          `적용: ${this.len}∠${this.deg}° = ` +
          `(${px.toFixed(2)}, ${py.toFixed(2)}) / ${this.len.toFixed(2)} = (${ux.toFixed(2)}, ${uy.toFixed(2)})`;
      }
      const lVal = this.shadowRoot?.querySelector('#normalize-len-val') as HTMLElement;
      if (lVal) lVal.textContent = String(this.len);
      const dVal = this.shadowRoot?.querySelector('#normalize-deg-val') as HTMLElement;
      if (dVal) dVal.textContent = `${this.deg}°`;
      const vec = this.shadowRoot?.querySelector('#normalize-vec') as HTMLElement;
      if (vec) {
        vec.setAttribute('x2', String(parseFloat(px.toFixed(2))));
        vec.setAttribute('y2', String(parseFloat(py.toFixed(2))));
        vec.setAttribute('label', `v(${px.toFixed(2)}, ${py.toFixed(2)})`);
      }
      const unit = this.shadowRoot?.querySelector('#normalize-unit') as HTMLElement;
      if (unit) {
        unit.setAttribute('x2', String(parseFloat(ux.toFixed(3))));
        unit.setAttribute('y2', String(parseFloat(uy.toFixed(3))));
        unit.setAttribute('label', `v̂(${ux.toFixed(2)}, ${uy.toFixed(2)})`);
      }
      const tip = this.shadowRoot?.querySelector('#normalize-tip') as HTMLElement;
      if (tip) {
        tip.setAttribute('x', String(parseFloat(ux.toFixed(3))));
        tip.setAttribute('y', String(parseFloat(uy.toFixed(3))));
      }
      const arc = this.shadowRoot?.querySelector('#normalize-arc') as HTMLElement;
      if (arc) {
        arc.setAttribute('start-angle', '0');
        arc.setAttribute('end-angle', String((this.deg * Math.PI) / 180));
      }
    }

    @addEventListener('#normalize-len', 'input')
    onLenInput(e: Event) {
      this.len = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @addEventListener('#normalize-deg', 'input')
    onDegInput(e: Event) {
      this.deg = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @onConnectedBodyShadow
    render() {
      const { px, py, ux, uy, rad } = this.calc();
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
        <div class="math-formula">수식: v̂ = v / |v|</div>
        <div class="math-applied" id="math-norm-applied">적용: ${this.len}∠${this.deg}° = (${px.toFixed(2)}, ${py.toFixed(2)}) / ${this.len.toFixed(2)} = (${ux.toFixed(2)}, ${uy.toFixed(2)})</div>
        <div class="math-desc">길이·각도 슬라이더로 v를 움직이면 단위벡터가 단위원 위를 따라 움직입니다.</div>
        <cartesian-chart x-min="-12" x-max="12" y-min="-12" y-max="12" x-label="X" y-label="Y" center-x="0" center-y="0">
          <circle x="0" y="0" r="1" color="#94a3b8" dash="6,4"></circle>
          <vector id="normalize-vec" x1="0" y1="0" x2="${px.toFixed(2)}" y2="${py.toFixed(2)}" color="#6366f1" label="v(${px.toFixed(2)}, ${py.toFixed(2)})"></vector>
          <vector id="normalize-unit" x1="0" y1="0" x2="${ux.toFixed(3)}" y2="${uy.toFixed(3)}" color="#10b981" label="v̂(${ux.toFixed(2)}, ${uy.toFixed(2)})"></vector>
          <marker id="normalize-tip" x="${ux.toFixed(3)}" y="${uy.toFixed(3)}" color="#10b981" size="4"></marker>
          <arc id="normalize-arc" x="0" y="0" r="30" start-angle="0" end-angle="${rad}" color="#f59e0b"></arc>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#6366f1">→ v(원본)</b></span><span><b style="color:#10b981">→ v̂(단위벡터)</b></span><span><b style="color:#94a3b8">┄ 단위원</b></span></div>
        <div class="ctl"><label>길이 <input id="normalize-len" type="range" min="0" max="12" step="0.5" value="${this.len}"><b id="normalize-len-val">${this.len}</b></label></div>
        <div class="ctl"><label>각도 <input id="normalize-deg" type="range" min="0" max="360" step="1" value="${this.deg}"><b id="normalize-deg-val">${this.deg}°</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
