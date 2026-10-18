import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { Vector } from '@dooboostore/core';
import { marked } from 'marked';

const tagName = 'center-math-translate';

// 고정 삼각뿔(사면체, 원본). 바닥 3점 + 위로 솟은 꼭짓점 1개. t=(tx,ty,tz) 슬라이더로 통째로 밀어본다.
const TET: Vector[] = [
  new Vector(0, 0, 0),
  new Vector(3, 0, 0),
  new Vector(1.5, 3, 0),
  new Vector(1.5, 1, 3), // z축으로 솟은 꼭짓점
];

// 삼각뿔의 4개 면(각 3점)
const FACES: [number, number, number][] = [
  [0, 1, 2], // 바닥
  [0, 1, 3],
  [1, 2, 3],
  [2, 0, 3],
];

const MD = `
## 병진(translation, 평행이동)이란?
- 도형(또는 점)을 **회전·크기 변화 없이, 같은 방향·같은 거리만큼 통째로 밀어서** 움직이는 것입니다.
- 수식: \`p' = p + t\` (t: 이동 벡터, 모든 점에 똑같이 더해짐)
- 네 꼭짓점이 각각 원본→이동본으로 움직인 화살표를 보면, **모두 평행하고 길이가 같습니다** — 이게 병진의 핵심입니다.
- **회전(rotate)과 짝을 이루는 개념**: 로봇 팔·드론·게임 캐릭터의 위치는 보통 회전(orientation) + 병진(position)으로 표현됩니다 (강체 변환, rigid transform).
- **어디에 쓰이나요?** — 드론이 자세는 그대로 두고 위/아래(z축)로 이동할 때, 3D 게임 캐릭터 점프·이동, 카메라 워크(dolly), 좌표계 원점을 옮길 때.
`;

function moved(t: Vector): Vector[] {
  return TET.map(p => {
    const m = p.get();
    m.add(t);
    return m;
  });
}

function facePoints(verts: Vector[], face: [number, number, number]): Vector[] {
  return [verts[face[0]], verts[face[1]], verts[face[2]]];
}

function pts(list: Vector[]) {
  return list.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`).join(' ');
}

function fmt(v: Vector) {
  return `${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}`;
}

function notesHtml(t: Vector) {
  const m = moved(t);
  return TET.map((p, i) =>
    `<div>P${i + 1}(${fmt(p)}) → P${i + 1}'(${fmt(m[i])})</div>`
  ).join('') + `<div style="margin-top:6px">검증: P1'-P1 = ... = P4'-P4 = t(${fmt(t)}) — 모두 같은 벡터</div>`;
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathTranslate extends w.HTMLElement {
    private tx = 0;
    private ty = 0;
    private tz = 3;

    private refresh() {
      const t = new Vector(this.tx, this.ty, this.tz);
      const m = moved(t);

      const applied = this.shadowRoot?.querySelector('#math-translate-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: t = (${fmt(t)}) → 삼각뿔 전체가 그만큼 평행이동`;

      const notes = this.shadowRoot?.querySelector('#math-translate-notes') as HTMLElement;
      if (notes) notes.innerHTML = notesHtml(t);

      (['tx', 'ty', 'tz'] as const).forEach(k => {
        const val = this.shadowRoot?.querySelector(`#translate-${k}-val`) as HTMLElement;
        if (val) val.textContent = this[k].toFixed(1);
      });

      FACES.forEach((face, i) => {
        const el = this.shadowRoot?.querySelector(`#translate-moved-f${i}`) as HTMLElement;
        if (el) el.setAttribute('points', pts(facePoints(m, face)));
      });

      TET.forEach((p, i) => {
        const arrow = this.shadowRoot?.querySelector(`#translate-arrow-${i}`) as HTMLElement;
        if (!arrow) return;
        arrow.setAttribute('x1', p.x.toFixed(2));
        arrow.setAttribute('y1', p.y.toFixed(2));
        arrow.setAttribute('z1', p.z.toFixed(2));
        arrow.setAttribute('x2', m[i].x.toFixed(2));
        arrow.setAttribute('y2', m[i].y.toFixed(2));
        arrow.setAttribute('z2', m[i].z.toFixed(2));
        if (i === 0) arrow.setAttribute('label', `t(${fmt(t)})`);
      });
    }

    @addEventListener('#translate-tx', 'input')
    onTxInput(e: Event) { this.tx = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @addEventListener('#translate-ty', 'input')
    onTyInput(e: Event) { this.ty = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @addEventListener('#translate-tz', 'input')
    onTzInput(e: Event) { this.tz = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const t = new Vector(this.tx, this.ty, this.tz);
      const m = moved(t);
      const origFaceTags = FACES
        .map(face => `<polygon3d points="${pts(facePoints(TET, face))}" color="#6366f1" fill="rgba(99,102,241,0.18)"></polygon3d>`)
        .join('\n          ');
      const movedFaceTags = FACES
        .map((face, i) => `<polygon3d id="translate-moved-f${i}" points="${pts(facePoints(m, face))}" color="#10b981" fill="rgba(16,185,129,0.18)"></polygon3d>`)
        .join('\n          ');
      const arrowTags = TET.map((p, i) => {
        const label = i === 0 ? ` label="t(${fmt(t)})"` : '';
        return `<vector3d id="translate-arrow-${i}" x1="${p.x.toFixed(2)}" y1="${p.y.toFixed(2)}" z1="${p.z.toFixed(2)}" x2="${m[i].x.toFixed(2)}" y2="${m[i].y.toFixed(2)}" z2="${m[i].z.toFixed(2)}" color="#f59e0b"${label}></vector3d>`;
      }).join('\n          ');
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
        <div class="math-formula">수식: p' = p + t (모든 점에 같은 이동 벡터 t를 더함)</div>
        <div class="math-applied" id="math-translate-applied">적용: t = (${fmt(t)}) → 삼각뿔 전체가 그만큼 평행이동</div>
        <div class="math-desc">바닥은 z=0에 깔려 있고 꼭짓점 하나가 z축으로 솟아 있는 삼각뿔(사면체)입니다. t.z를 올리면 통째로 공중으로 떠오릅니다. 드래그로 돌려서 확인해 보세요.</div>
        <cartesian-chart-3d range="7" style="height:340px">
          ${origFaceTags}
          ${movedFaceTags}
          ${arrowTags}
        </cartesian-chart-3d>
        <div class="math-legend"><span><b style="color:#6366f1">■ 원본</b></span><span><b style="color:#10b981">■ 이동본</b></span><span><b style="color:#f59e0b">→ t(이동 벡터)</b></span></div>
        <div class="math-notes" id="math-translate-notes">${notesHtml(t)}</div>
        <div class="ctl"><label>t.x <input id="translate-tx" type="range" min="-4" max="4" step="0.5" value="${this.tx}"><b id="translate-tx-val">${this.tx.toFixed(1)}</b></label></div>
        <div class="ctl"><label>t.y <input id="translate-ty" type="range" min="-4" max="4" step="0.5" value="${this.ty}"><b id="translate-ty-val">${this.ty.toFixed(1)}</b></label></div>
        <div class="ctl"><label>t.z <input id="translate-tz" type="range" min="-4" max="4" step="0.5" value="${this.tz}"><b id="translate-tz-val">${this.tz.toFixed(1)}</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
