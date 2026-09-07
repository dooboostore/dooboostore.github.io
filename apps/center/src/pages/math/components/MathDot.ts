import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { Vector } from '@dooboostore/core';
import { marked } from 'marked';

const tagName = 'center-math-dot';

const MD = `
## 내적이란?
- 두 벡터가 **같은 방향을 향하는 정도**를 숫자로 나타냅니다.
- \`a·b = |a||b|cosθ\` — 사이각이 90°면 0(직각), 0°면 최대입니다.
- 아래 곡선은 b 각도에 따른 내적 값입니다. 빨간 점이 현재 b 위치입니다.
- **어디에 쓰이나요?** — 게임 적 탐지(시야각 안에 있는지 판정), 3D 조명 밝기(빛 방향과 면 방향의 일치도), 유튜브·쇼핑 추천의 코사인 유사도.
`;

// a 고정, b는 각도/길이 슬라이더로 조작
const AX = 5, AY = 12;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathDot extends w.HTMLElement {
    private bAngle = 113;
    private bLen = 13;

    private bv() {
      const rad = (this.bAngle * Math.PI) / 180;
      return { bx: this.bLen * Math.cos(rad), by: this.bLen * Math.sin(rad) };
    }

    private dot() {
      const { bx, by } = this.bv();
      return new Vector(AX, AY).dot(new Vector(bx, by));
    }

    private curvePoints(): string {
      const pts: string[] = [];
      for (let d = 0; d <= 360; d += 5) {
        const rad = (d * Math.PI) / 180;
        const v = this.bLen * (AX * Math.cos(rad) + AY * Math.sin(rad));
        pts.push(`${d},${v.toFixed(2)}`);
      }
      return pts.join(' ');
    }

    private refresh() {
      const { bx, by } = this.bv();
      const dot = this.dot();
      const title = this.shadowRoot?.querySelector('#math-dot-title') as HTMLElement;
      if (title) {
        title.textContent =
          `b 각도 ${this.bAngle}도·길이 ${this.bLen.toFixed(1)}: ` +
          `${AX}x${bx.toFixed(1)} + ${AY}x${by.toFixed(1)} = dot ${dot.toFixed(1)}`;
      }
      const angleVal = this.shadowRoot?.querySelector('#dot-angle-val') as HTMLElement;
      if (angleVal) angleVal.textContent = String(this.bAngle);
      const lenVal = this.shadowRoot?.querySelector('#dot-len-val') as HTMLElement;
      if (lenVal) lenVal.textContent = this.bLen.toFixed(1);

      const vecB = this.shadowRoot?.querySelector('#dot-vec-b') as HTMLElement;
      if (vecB) {
        vecB.setAttribute('x2', String(parseFloat(bx.toFixed(2))));
        vecB.setAttribute('y2', String(parseFloat(by.toFixed(2))));
        vecB.setAttribute('label', `b(${bx.toFixed(1)}, ${by.toFixed(1)})`);
      }
      const curve = this.shadowRoot?.querySelector('#dot-curve') as HTMLElement;
      if (curve) curve.setAttribute('points', this.curvePoints());
      const cur = this.shadowRoot?.querySelector('#dot-cur') as HTMLElement;
      if (cur) {
        cur.setAttribute('x', String(this.bAngle));
        cur.setAttribute('y', String(parseFloat(dot.toFixed(2))));
      }
    }

    @addEventListener('#dot-angle', 'input')
    onAngleInput(e: Event) {
      this.bAngle = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @addEventListener('#dot-len', 'input')
    onLenInput(e: Event) {
      this.bLen = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @onConnectedBodyShadow
    render() {
      const { bx, by } = this.bv();
      const dot = this.dot();
      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          #math-dot-title { font-size:13px; font-weight:800; color:#1e293b; text-align:center; margin-bottom:4px; }
          .math-sub-title { font-size:12px; font-weight:800; color:#475569; text-align:center; margin:10px 0 4px; }
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
        <div class="math-formula">수식: a·b = ax·bx + ay·by</div>
        <div class="math-desc">내적은 두 벡터가 같은 방향을 향하는 정도를 나타냅니다. b의 각도·길이를 바꿔보세요.</div>
        <div id="math-dot-title">b 각도 ${this.bAngle}도·길이 ${this.bLen.toFixed(1)}: ${AX}x${bx.toFixed(1)} + ${AY}x${by.toFixed(1)} = dot ${dot.toFixed(1)}</div>
        <cartesian-chart x-min="-20" x-max="20" y-min="-20" y-max="20" center-x="0" center-y="0" x-label="X" y-label="Y">
          <vector x1="0" y1="0" x2="${AX}" y2="${AY}" color="#e5484d" label="a(${AX}.0, ${AY}.0)"></vector>
          <vector id="dot-vec-b" x1="0" y1="0" x2="${bx.toFixed(2)}" y2="${by.toFixed(2)}" color="#3e63dd" label="b(${bx.toFixed(1)}, ${by.toFixed(1)})"></vector>
        </cartesian-chart>
        <div class="math-sub-title">각도별 dot 크기 (0 = 직각)</div>
        <cartesian-chart x-min="0" x-max="360" y-min="-180" y-max="180" x-label="b 각도 (도)" y-label="dot" disabled-aspect style="--cc-canvas-height:180px">
          <series id="dot-curve" points="${this.curvePoints()}" color="#8b5cf6" label="dot(각도)"></series>
          <marker id="dot-cur" x="${this.bAngle}" y="${dot.toFixed(2)}" color="#e5484d" size="5"></marker>
        </cartesian-chart>
        <div class="ctl"><label>b 각도 <input id="dot-angle" type="range" min="0" max="360" step="1" value="${this.bAngle}"><b id="dot-angle-val">${this.bAngle}</b></label></div>
        <div class="ctl"><label>b 길이 <input id="dot-len" type="range" min="0" max="15" step="0.5" value="${this.bLen}"><b id="dot-len-val">${this.bLen.toFixed(1)}</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
