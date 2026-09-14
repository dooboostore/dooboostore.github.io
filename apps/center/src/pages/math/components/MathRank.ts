import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { Vector } from '@dooboostore/core';
import { marked } from 'marked';

const tagName = 'center-math-rank';

// v1, v2는 고정. v3 = v1+v2+(0,0,h) — h 슬라이더로 "상자"가 부푸는지 본다.
const V1 = new Vector(2, 1, 0);
const V2 = new Vector(1, 3, 1);

const MD = `
## rank란?
- 화살표(벡터) 3개로 **상자(평행육면체)**를 만들 수 있는지 봅니다.
- 상자가 납작하게 찌그러지면 → **rank 2** (v3가 사실 v1·v2로 설명되는 "짬짜미", 진짜 정보는 2개뿐)
- 상자가 통통하게 부풀면 → **rank 3** (셋 다 자기 몫이 있는 진짜 3차원)
- 판정: 상자 부피 = v1·(v2×v3) (스칼라 삼중곱). **0이면 납작, 0이 아니면 부피 있음.**
- **어디에 쓰이나요?** — 로봇 팔이 실제로 몇 방향으로 움직일 수 있는지(자코비안 rank), 카메라가 3D 공간을 온전히 보는지, 데이터가 몇 개의 독립적인 특징으로 설명되는지 확인할 때.
`;

function fmt(v: Vector) {
  return `${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}`;
}

function pts(list: Vector[]) {
  return list.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`).join(' ');
}

function notesHtml(n: Vector, vol: number, flat: boolean) {
  return `<div>v2×v3 = (${n.x.toFixed(1)}, ${n.y.toFixed(1)}, ${n.z.toFixed(1)})</div>` +
    `<div>상자 부피 = v1·(v2×v3) = ${V1.x.toFixed(1)}×${n.x.toFixed(1)} + ${V1.y.toFixed(1)}×${n.y.toFixed(1)} + ${V1.z.toFixed(1)}×${n.z.toFixed(1)} = ${vol.toFixed(2)}</div>` +
    `<div style="margin-top:6px">rank = ${flat ? 2 : 3} — ${flat ? '0 이라 납작, 정보 2개' : '0이 아니라 부피, 정보 3개'}</div>`;
}

/** v1,v2,v3가 만드는 평행육면체의 6개 면(사각형 4점씩). */
function boxFaces(a: Vector, b: Vector, c: Vector): Vector[][] {
  const o = new Vector(0, 0, 0);
  const ab = a.get(); ab.add(b);
  const ac = a.get(); ac.add(c);
  const bc = b.get(); bc.add(c);
  const abc = a.get(); abc.add(b); abc.add(c);
  return [
    [o, a, ab, b],
    [c, ac, abc, bc],
    [o, a, ac, c],
    [b, ab, abc, bc],
    [o, b, bc, c],
    [a, ab, abc, ac],
  ];
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathRank extends w.HTMLElement {
    private h = 0;

    private calc() {
      const v3 = V1.get();
      v3.add(V2);
      v3.add(new Vector(0, 0, this.h));
      const n = V2.cross(v3);
      const vol = V1.dot(n);
      const flat = Math.abs(vol) < 1e-9;
      return { v3, n, vol, flat, faces: boxFaces(V1, V2, v3) };
    }

    private refresh() {
      const { v3, n, vol, flat, faces } = this.calc();
      const color = flat ? '#ef4444' : '#10b981';

      const title = this.shadowRoot?.querySelector('#rank-title') as HTMLElement;
      if (title) {
        title.textContent = flat ? '납작해요 (rank = 2)' : '상자가 생겼어요! (rank = 3)';
        title.style.color = color;
      }
      const applied = this.shadowRoot?.querySelector('#math-rank-applied') as HTMLElement;
      if (applied) {
        applied.style.color = color;
        applied.textContent = `적용: v3 = v1+v2+(0,0,${this.h.toFixed(1)}) = (${fmt(v3)}) → 상자 부피 = ${Math.abs(vol).toFixed(2)}`;
      }
      const notes = this.shadowRoot?.querySelector('#math-rank-notes') as HTMLElement;
      if (notes) notes.innerHTML = notesHtml(n, vol, flat);
      const hVal = this.shadowRoot?.querySelector('#rank-h-val') as HTMLElement;
      if (hVal) hVal.textContent = `${this.h.toFixed(1)}`;

      const setVec = (id: string, v: Vector, label: string) => {
        const el = this.shadowRoot?.querySelector(id) as HTMLElement;
        if (!el) return;
        el.setAttribute('x2', v.x.toFixed(2));
        el.setAttribute('y2', v.y.toFixed(2));
        el.setAttribute('z2', v.z.toFixed(2));
        el.setAttribute('label', label);
      };
      setVec('#rank3d-v1', V1, 'v1');
      setVec('#rank3d-v2', V2, 'v2');
      setVec('#rank3d-v3', v3, `v3(${fmt(v3)})`);

      faces.forEach((face, i) => {
        const el = this.shadowRoot?.querySelector(`#rank3d-f${i}`) as HTMLElement;
        if (!el) return;
        el.setAttribute('points', pts(face));
        el.setAttribute('color', color);
        el.setAttribute('fill', flat ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.18)');
      });
    }

    @addEventListener('#rank-h', 'input')
    onHInput(e: Event) {
      this.h = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @onConnectedBodyShadow
    render() {
      const { v3, n, vol, flat, faces } = this.calc();
      const color = flat ? '#ef4444' : '#10b981';
      const faceTags = faces
        .map((face, i) => `<polygon3d id="rank3d-f${i}" points="${pts(face)}" color="${color}" fill="${flat ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.18)'}"></polygon3d>`)
        .join('\n          ');
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
        <div class="math-title" id="rank-title" style="color:${color}">${flat ? '납작해요 (rank = 2)' : '상자가 생겼어요! (rank = 3)'}</div>
        <div class="math-formula">수식: 상자 부피 = v1·(v2×v3) (스칼라 삼중곱)</div>
        <div class="math-applied" id="math-rank-applied" style="color:${color}">적용: v3 = v1+v2+(0,0,${this.h.toFixed(1)}) = (${fmt(v3)}) → 상자 부피 = ${Math.abs(vol).toFixed(2)}</div>
        <div class="math-desc">h를 움직여 v3를 들어올리면, 납작했던 종이가 상자로 부풀어 오릅니다. 드래그로 회전해서 상자 모양을 확인해 보세요.</div>
        <cartesian-chart-3d range="8" style="height:340px">
          ${faceTags}
          <vector3d id="rank3d-v1" x1="0" y1="0" z1="0" x2="${V1.x}" y2="${V1.y}" z2="${V1.z}" color="#e5484d" label="v1"></vector3d>
          <vector3d id="rank3d-v2" x1="0" y1="0" z1="0" x2="${V2.x}" y2="${V2.y}" z2="${V2.z}" color="#3e63dd" label="v2"></vector3d>
          <vector3d id="rank3d-v3" x1="0" y1="0" z1="0" x2="${v3.x.toFixed(2)}" y2="${v3.y.toFixed(2)}" z2="${v3.z.toFixed(2)}" color="${color}" label="v3(${fmt(v3)})"></vector3d>
        </cartesian-chart-3d>
        <div class="math-notes" id="math-rank-notes">${notesHtml(n, vol, flat)}</div>
        <div class="ctl"><label>v3 높이 h <input id="rank-h" type="range" min="-2" max="2" step="0.1" value="${this.h}"><b id="rank-h-val">${this.h.toFixed(1)}</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
