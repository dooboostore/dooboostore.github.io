import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { Vector } from '@dooboostore/core';
import { marked } from 'marked';

const tagName = 'center-math-project';

// a 고정, b는 각도/길이 슬라이더로 조작
const AX = 4, AY = 2;

const MD = `
## 정사영이란?
- 벡터 b를 벡터 a 위로 **수직으로 내린 그림자**입니다.
- 수식: \`projₐb = ((a·b)/|a|²)·a\`
- 빨간 점선은 b 끝점에서 a까지의 수직선입니다. 직각 표시가 수직을 나타냅니다.
- 리젝션(rej)은 a에 수직인 나머지 성분입니다: \`rejₐb = b − projₐb\` (빨간 점선)
- b가 a와 직각이면 정사영은 영벡터(점)가 되고, b 전체가 리젝션이 됩니다.
- **어디에 쓰이나요?** — 햇빛에 비친 물체 그림자 길이, 빗면 미끄럼틀의 미끄러지는 힘 분해, 선형회귀의 예측값(근사) 계산.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathProject extends w.HTMLElement {
    private bAngle = 110;
    private bLen = 5;

    private calc() {
      const rad = (this.bAngle * Math.PI) / 180;
      const a = new Vector(AX, AY);
      const b = new Vector(this.bLen * Math.cos(rad), this.bLen * Math.sin(rad));
      const t = a.dot(a) > 0 ? a.dot(b) / a.dot(a) : 0;
      const foot = new Vector(a.x * t, a.y * t);
      const rej = b.toSub(foot);
      const mid = new Vector((foot.x + b.x) / 2, (foot.y + b.y) / 2);
      // 직각 표시용 작은 정사각형 (한 변 0.35)
      const alen = a.norm() || 1;
      const ux = a.x / alen, uy = a.y / alen;
      const nx = -uy, ny = ux;
      const k = 0.35;
      const sq = [
        `${foot.x.toFixed(3)},${foot.y.toFixed(3)}`,
        `${(foot.x + ux * k).toFixed(3)},${(foot.y + uy * k).toFixed(3)}`,
        `${(foot.x + ux * k + nx * k).toFixed(3)},${(foot.y + uy * k + ny * k).toFixed(3)}`,
        `${(foot.x + nx * k).toFixed(3)},${(foot.y + ny * k).toFixed(3)}`,
        `${foot.x.toFixed(3)},${foot.y.toFixed(3)}`,
      ].join(' ');
      return { a, b, t, foot, rej, mid, sq };
    }

    private refresh() {
      const { b, t, foot, rej, mid, sq } = this.calc();
      const applied = this.shadowRoot?.querySelector('#math-project-applied') as HTMLElement;
      if (applied) {
        applied.textContent =
          `적용: t = (a·b)/|a|² = ${t.toFixed(3)}, ` +
          `proj = (${foot.x.toFixed(2)}, ${foot.y.toFixed(2)}), ` +
          `rej = (${rej.x.toFixed(2)}, ${rej.y.toFixed(2)})`;
      }
      const aVal = this.shadowRoot?.querySelector('#project-angle-val') as HTMLElement;
      if (aVal) aVal.textContent = `${this.bAngle}°`;
      const lVal = this.shadowRoot?.querySelector('#project-len-val') as HTMLElement;
      if (lVal) lVal.textContent = this.bLen.toFixed(1);
      const setVec = (id: string, x2: number, y2: number, label: string) => {
        const el = this.shadowRoot?.querySelector(id) as HTMLElement;
        if (!el) return;
        el.setAttribute('x2', String(parseFloat(x2.toFixed(2))));
        el.setAttribute('y2', String(parseFloat(y2.toFixed(2))));
        el.setAttribute('label', label);
      };
      setVec('#project-b', b.x, b.y, `b(${b.x.toFixed(2)}, ${b.y.toFixed(2)})`);
      setVec('#project-proj', foot.x, foot.y, `proj(${foot.x.toFixed(2)}, ${foot.y.toFixed(2)})`);
      const rejTip = this.shadowRoot?.querySelector('#project-rej-tip') as HTMLElement;
      if (rejTip) {
        rejTip.setAttribute('x', String(parseFloat(mid.x.toFixed(2))));
        rejTip.setAttribute('y', String(parseFloat(mid.y.toFixed(2))));
        rejTip.setAttribute('label', `rej(${rej.x.toFixed(2)}, ${rej.y.toFixed(2)})`);
      }
      const drop = this.shadowRoot?.querySelector('#project-drop') as HTMLElement;
      if (drop) drop.setAttribute('points', `${b.x.toFixed(2)},${b.y.toFixed(2)} ${foot.x.toFixed(2)},${foot.y.toFixed(2)}`);
      const corner = this.shadowRoot?.querySelector('#project-corner') as HTMLElement;
      if (corner) corner.setAttribute('points', sq);
      const tip = this.shadowRoot?.querySelector('#project-tip') as HTMLElement;
      if (tip) {
        tip.setAttribute('x', String(parseFloat(foot.x.toFixed(2))));
        tip.setAttribute('y', String(parseFloat(foot.y.toFixed(2))));
      }
    }

    @addEventListener('#project-angle', 'input')
    onAngleInput(e: Event) {
      this.bAngle = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @addEventListener('#project-len', 'input')
    onLenInput(e: Event) {
      this.bLen = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @onConnectedBodyShadow
    render() {
      const { b, t, foot, rej, mid, sq } = this.calc();
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
          .ctl b { min-width:52px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">수식: projₐb = ((a·b)/|a|²)·a, rejₐb = b − projₐb</div>
        <div class="math-applied" id="math-project-applied">적용: t = (a·b)/|a|² = ${t.toFixed(3)}, proj = (${foot.x.toFixed(2)}, ${foot.y.toFixed(2)}), rej = (${rej.x.toFixed(2)}, ${rej.y.toFixed(2)})</div>
        <div class="math-desc">b의 각도·길이를 바꾸면 a 위 그림자(초록)가 따라 움직입니다. a = (${AX}, ${AY}) 고정.</div>
        <cartesian-chart x-min="-10" x-max="10" y-min="-10" y-max="10" center-x="0" center-y="0" x-label="X" y-label="Y">
          <vector x1="0" y1="0" x2="${AX}" y2="${AY}" color="#6366f1" label="a(${AX}, ${AY})"></vector>
          <vector id="project-b" x1="0" y1="0" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" color="#f59e0b" label="b(${b.x.toFixed(2)}, ${b.y.toFixed(2)})"></vector>
          <vector id="project-proj" x1="0" y1="0" x2="${foot.x.toFixed(2)}" y2="${foot.y.toFixed(2)}" color="#10b981" dash="6,4" label="proj(${foot.x.toFixed(2)}, ${foot.y.toFixed(2)})"></vector>
          <marker id="project-rej-tip" x="${mid.x.toFixed(2)}" y="${mid.y.toFixed(2)}" color="#e5484d" size="3" label="rej(${rej.x.toFixed(2)}, ${rej.y.toFixed(2)})"></marker>
          <series id="project-drop" points="${b.x.toFixed(2)},${b.y.toFixed(2)} ${foot.x.toFixed(2)},${foot.y.toFixed(2)}" color="#e5484d" dash="4,4"></series>
          <series id="project-corner" points="${sq}" color="#e5484d" width="1.5"></series>
          <marker id="project-tip" x="${foot.x.toFixed(2)}" y="${foot.y.toFixed(2)}" color="#10b981" size="4"></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#6366f1">→ a(고정)</b></span><span><b style="color:#f59e0b">→ b</b></span><span><b style="color:#10b981">→ proj</b></span><span><b style="color:#e5484d">→ rej</b></span></div>
        <div class="ctl"><label>b 각도 <input id="project-angle" type="range" min="0" max="360" step="1" value="${this.bAngle}"><b id="project-angle-val">${this.bAngle}°</b></label></div>
        <div class="ctl"><label>b 길이 <input id="project-len" type="range" min="0" max="8" step="0.5" value="${this.bLen}"><b id="project-len-val">${this.bLen.toFixed(1)}</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
