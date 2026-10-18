import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { Vector } from '@dooboostore/core';
import { marked } from 'marked';

const tagName = 'center-math-cross';

// 길이 고정, a·b 방위각/앙각 슬라이더로 조작
const LEN = 6;

const MD = `
## 외적이란?
- 두 벡터에 **수직인 벡터**입니다: \`a×b = (ay·bz − az·by, az·bx − ax·bz, ax·by − ay·bx)\`
- 크기는 두 벡터가 만드는 **평행사변형의 넓이**와 같습니다: \`|a×b| = |a||b|sinθ\`
- 방향은 오른손 법칙을 따릅니다. a·b가 xy평면에 있으면 z 성분만 남습니다.
- **법선으로 보기**를 체크하면 길이를 1로 맞춘 단위법선 n이 보라 화살표로 표시됩니다.
- **어디에 쓰이나요?** — 3D 게임에서 뒤집힌 면 그리지 않기(뒷면 제거), 자전거 페달·문 손잡이 토크(회전력), 선풍기 날개 양력 방향.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathCross extends w.HTMLElement {
    private aTheta = 130;
    private aPhi = 0;
    private bTheta = 0;
    private bPhi = 0;
    private showUnit = false;

    private avec() {
      const th = (this.aTheta * Math.PI) / 180;
      const ph = (this.aPhi * Math.PI) / 180;
      return new Vector(
        LEN * Math.cos(ph) * Math.cos(th),
        LEN * Math.cos(ph) * Math.sin(th),
        LEN * Math.sin(ph),
      );
    }

    private bvec() {
      const th = (this.bTheta * Math.PI) / 180;
      const ph = (this.bPhi * Math.PI) / 180;
      return new Vector(
        LEN * Math.cos(ph) * Math.cos(th),
        LEN * Math.cos(ph) * Math.sin(th),
        LEN * Math.sin(ph),
      );
    }

    private calc() {
      const a = this.avec();
      const b = this.bvec();
      const cross = a.cross(b);
      const cn = cross.norm();
      const n = cn > 0 ? cross.toDiv(cn) : new Vector(0, 0, 0);
      const sx = a.x + b.x, sy = a.y + b.y, sz = a.z + b.z;
      return { a, b, cross, n, sx, sy, sz };
    }

    private refresh() {
      const { a, b, cross, n, sx, sy, sz } = this.calc();
      const applied = this.shadowRoot?.querySelector('#math-cross-applied') as HTMLElement;
      if (applied) {
        applied.textContent =
          `적용: a×b = (${cross.x.toFixed(1)}, ${cross.y.toFixed(1)}, ${cross.z.toFixed(1)}) → ` +
          `n = (${n.x.toFixed(2)}, ${n.y.toFixed(2)}, ${n.z.toFixed(2)})`;
      }
      const notes = this.shadowRoot?.querySelector('#math-cross-notes') as HTMLElement;
      if (notes) {
        notes.innerHTML =
          `<div>x = ay·bz − az·by = ${a.y.toFixed(1)}×${b.z.toFixed(1)} − ${a.z.toFixed(1)}×${b.y.toFixed(1)} = ${cross.x.toFixed(1)}</div>` +
          `<div>y = az·bx − ax·bz = ${a.z.toFixed(1)}×${b.x.toFixed(1)} − ${a.x.toFixed(1)}×${b.z.toFixed(1)} = ${cross.y.toFixed(1)}</div>` +
          `<div>z = ax·by − ay·bx = ${a.x.toFixed(1)}×${b.y.toFixed(1)} − ${a.y.toFixed(1)}×${b.x.toFixed(1)} = ${cross.z.toFixed(1)}</div>` +
          `<div style="margin-top:6px">|a×b| = ${cross.norm().toFixed(1)}<br>(직각일 때 최대, 나란하면 0)</div>`;
      }
      const pairs: [string, string][] = [
        ['#cross-a-theta-val', `${this.aTheta}°`],
        ['#cross-a-phi-val', `${this.aPhi}°`],
        ['#cross-b-theta-val', `${this.bTheta}°`],
        ['#cross-b-phi-val', `${this.bPhi}°`],
      ];
      pairs.forEach(([sel, v]) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = v;
      });
      const setVec = (id: string, x: number, y: number, z: number, label: string) => {
        const el = this.shadowRoot?.querySelector(id) as HTMLElement;
        if (!el) return;
        el.setAttribute('x2', String(parseFloat(x.toFixed(1))));
        el.setAttribute('y2', String(parseFloat(y.toFixed(1))));
        el.setAttribute('z2', String(parseFloat(z.toFixed(1))));
        el.setAttribute('label', label);
      };
      setVec('#cross3d-a', a.x, a.y, a.z, `a(${a.x.toFixed(1)}, ${a.y.toFixed(1)}, ${a.z.toFixed(1)})`);
      setVec('#cross3d-b', b.x, b.y, b.z, `b(${b.x.toFixed(1)}, ${b.y.toFixed(1)}, ${b.z.toFixed(1)})`);
      const disp = this.showUnit ? n : cross;
      const dTag = this.showUnit ? 'n' : 'a×b';
      const dFix = this.showUnit ? 2 : 1;
      setVec('#cross3d-n', disp.x, disp.y, disp.z,
        `${dTag}(${disp.x.toFixed(dFix)}, ${disp.y.toFixed(dFix)}, ${disp.z.toFixed(dFix)})`);
      const plane = this.shadowRoot?.querySelector('#cross3d-plane') as HTMLElement;
      if (plane) {
        plane.setAttribute('points',
          `0,0,0 ${a.x.toFixed(1)},${a.y.toFixed(1)},${a.z.toFixed(1)} ` +
          `${sx.toFixed(1)},${sy.toFixed(1)},${sz.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)}`);
      }
    }

    @addEventListener('#cross-a-theta', 'input')
    onAThetaInput(e: Event) {
      this.aTheta = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @addEventListener('#cross-a-phi', 'input')
    onAPhiInput(e: Event) {
      this.aPhi = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @addEventListener('#cross-b-theta', 'input')
    onBThetaInput(e: Event) {
      this.bTheta = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @addEventListener('#cross-b-phi', 'input')
    onBPhiInput(e: Event) {
      this.bPhi = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @addEventListener('#cross-unit', 'change')
    onUnitChange(e: Event) {
      this.showUnit = (e.target as HTMLInputElement).checked;
      this.refresh();
    }

    @onConnectedBodyShadow
    render() {
      const { a, b, cross, n, sx, sy, sz } = this.calc();
      return `
        <style>
          :host { display:block; }
          .math-title { font-size:15px; font-weight:800; color:#1e293b; text-align:center; margin-bottom:8px; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; color:#6366f1; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
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
        <div class="math-title">외적: 둘 다에 직각인 화살표</div>
        <div class="math-formula">수식: ① a×b = |a||b|sinθ (외적) → ② n = (a×b)/|a×b| (정규화)</div>
        <div class="math-applied" id="math-cross-applied">적용: a×b = (${cross.x.toFixed(1)}, ${cross.y.toFixed(1)}, ${cross.z.toFixed(1)}) → n = (${n.x.toFixed(2)}, ${n.y.toFixed(2)}, ${n.z.toFixed(2)})</div>
        <div class="math-desc">a·b 방위각·앙각을 바꾸면 보라 외적 화살표가 따라 움직입니다. 드래그로 회전해 보세요.</div>
        <cartesian-chart-3d range="40" style="height:340px">
          <polygon3d id="cross3d-plane" points="0,0,0 ${a.x.toFixed(1)},${a.y.toFixed(1)},${a.z.toFixed(1)} ${sx.toFixed(1)},${sy.toFixed(1)},${sz.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)}" color="#8b5cf6" fill="rgba(139,92,246,0.12)"></polygon3d>
          <vector3d id="cross3d-a" x1="0" y1="0" z1="0" x2="${a.x.toFixed(1)}" y2="${a.y.toFixed(1)}" z2="${a.z.toFixed(1)}" color="#e5484d" label="a"></vector3d>
          <vector3d id="cross3d-b" x1="0" y1="0" z1="0" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" z2="${b.z.toFixed(1)}" color="#3e63dd" label="b"></vector3d>
          <vector3d id="cross3d-n" x1="0" y1="0" z1="0" x2="${cross.x.toFixed(1)}" y2="${cross.y.toFixed(1)}" z2="${cross.z.toFixed(1)}" color="#8b5cf6" label="a×b"></vector3d>
        </cartesian-chart-3d>
        <div class="math-notes" id="math-cross-notes">
          <div>x = ay·bz − az·by = ${a.y.toFixed(1)}×${b.z.toFixed(1)} − ${a.z.toFixed(1)}×${b.y.toFixed(1)} = ${cross.x.toFixed(1)}</div>
          <div>y = az·bx − ax·bz = ${a.z.toFixed(1)}×${b.x.toFixed(1)} − ${a.x.toFixed(1)}×${b.z.toFixed(1)} = ${cross.y.toFixed(1)}</div>
          <div>z = ax·by − ay·bx = ${a.x.toFixed(1)}×${b.y.toFixed(1)} − ${a.y.toFixed(1)}×${b.x.toFixed(1)} = ${cross.z.toFixed(1)}</div>
          <div style="margin-top:6px">|a×b| = ${cross.norm().toFixed(1)}<br>(직각일 때 최대, 나란하면 0)</div>
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#475569;margin-top:8px;cursor:pointer"><input id="cross-unit" type="checkbox"> 법선으로 보기 (길이 1로 정규화)</label>
        <div class="ctl"><label>a 방위각 <input id="cross-a-theta" type="range" min="0" max="360" step="1" value="${this.aTheta}"><b id="cross-a-theta-val">${this.aTheta}°</b></label></div>
        <div class="ctl"><label>a 앙각 <input id="cross-a-phi" type="range" min="-90" max="90" step="1" value="${this.aPhi}"><b id="cross-a-phi-val">${this.aPhi}°</b></label></div>
        <div class="ctl"><label>b 방위각 <input id="cross-b-theta" type="range" min="0" max="360" step="1" value="${this.bTheta}"><b id="cross-b-theta-val">${this.bTheta}°</b></label></div>
        <div class="ctl"><label>b 앙각 <input id="cross-b-phi" type="range" min="-90" max="90" step="1" value="${this.bPhi}"><b id="cross-b-phi-val">${this.bPhi}°</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
