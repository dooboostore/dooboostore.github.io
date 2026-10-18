import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-jacobian';

const L1 = 2, L2 = 1.5;

const MD = `
## 자코비안(Jacobian)과 로봇팔 특이점이란?
- 자코비안 J는 **관절 속도(θ̇1, θ̇2)를 손끝 속도(vx, vy)로 바꿔주는 행렬**입니다: \`v = J·θ̇\`
- 이 행렬의 **열(column)이 각 관절만 움직였을 때 손끝이 가는 방향**입니다 — 1열=어깨(θ1)만, 2열=팔꿈치(θ2)만 움직일 때 방향(아래 화살표).
- **det(J) = L1·L2·sin(θ2)** — 팔이 완전히 펴지거나(θ2=0°) 완전히 접히면(θ2=180°) det(J)=0이 되어 **특이점(singularity)**이 됩니다.
- 특이점에서는 두 관절이 만드는 손끝 방향이 **같은 직선 위**로 겹칩니다 — 그 방향에 수직인 쪽으로는 관절을 아무리 움직여도 손끝을 못 보냅니다(자유도 손실). 이건 "고유값·고유벡터"·"행렬식(det)" 페이지에서 본 "타원이 선분으로 찌그러지는" 것과 똑같은 현상입니다 — 단위원(가능한 관절속도 방향 전체)이 J를 통과하면 타원(가능한 손끝속도 방향, 조작성 타원)이 되는데, 특이점에서 이 타원이 선분으로 눌립니다.
- **어디에 쓰이나요?** — 로봇 팔 제어에서 특이점 근처를 피하는 경로 계획, 힘 제어·정밀 작업 시 조작성(manipulability) 평가.
`;

function endEffector(t1: number, t2: number) {
  const a = (t1 * Math.PI) / 180, b = ((t1 + t2) * Math.PI) / 180;
  return { x: L1 * Math.cos(a) + L2 * Math.cos(b), y: L1 * Math.sin(a) + L2 * Math.sin(b), a, b };
}

function jacobian(t1: number, t2: number) {
  const { a, b } = endEffector(t1, t2);
  return [
    [-L1 * Math.sin(a) - L2 * Math.sin(b), -L2 * Math.sin(b)],
    [L1 * Math.cos(a) + L2 * Math.cos(b), L2 * Math.cos(b)],
  ];
}

function det2(J: number[][]) { return J[0][0] * J[1][1] - J[0][1] * J[1][0]; }

function ellipsePoints(J: number[][], scale: number, n = 48) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const cx = Math.cos(t), cy = Math.sin(t);
    pts.push({ x: (J[0][0] * cx + J[0][1] * cy) * scale, y: (J[1][0] * cx + J[1][1] * cy) * scale });
  }
  return pts;
}
function ptsStr(list: { x: number; y: number }[]) { return list.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' '); }

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathJacobian extends w.HTMLElement {
    private t1 = 20;
    private t2 = 60;

    private refresh() {
      const { t1, t2 } = this;
      const e = endEffector(t1, t2);
      const J = jacobian(t1, t2);
      const dt = det2(J);
      const singular = Math.abs(dt) < 0.3;
      const color = singular ? '#ef4444' : '#10b981';

      const elbow = { x: L1 * Math.cos((t1 * Math.PI) / 180), y: L1 * Math.sin((t1 * Math.PI) / 180) };

      const applied = this.shadowRoot?.querySelector('#jac-applied') as HTMLElement;
      if (applied) { applied.style.color = color; applied.textContent = `적용: θ1=${t1.toFixed(0)}°, θ2=${t2.toFixed(0)}° → det(J)=${dt.toFixed(2)} ${singular ? '(특이점!)' : ''}`; }

      const notes = this.shadowRoot?.querySelector('#jac-notes') as HTMLElement;
      if (notes) {
        notes.innerHTML = `<div>J = [[${J[0][0].toFixed(2)}, ${J[0][1].toFixed(2)}], [${J[1][0].toFixed(2)}, ${J[1][1].toFixed(2)}]]</div>` +
          `<div>det(J) = L1·L2·sin(θ2) = ${(L1 * L2).toFixed(1)}×sin(${t2.toFixed(0)}°) = ${dt.toFixed(2)}</div>` +
          (singular ? `<div style="color:#ef4444;font-weight:800;margin-top:4px">⚠ 특이점 근처! 조작성 타원이 선분으로 눌려서, 한쪽 방향으로는 손끝을 못 움직입니다.</div>` : '');
      }

      (['t1', 't2'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#jac-${k}-val`) as HTMLElement;
        if (el) el.textContent = `${this[k].toFixed(0)}°`;
      });

      const l1 = this.shadowRoot?.querySelector('#jac-link1') as HTMLElement;
      if (l1) { l1.setAttribute('x2', elbow.x.toFixed(3)); l1.setAttribute('y2', elbow.y.toFixed(3)); }
      const l2 = this.shadowRoot?.querySelector('#jac-link2') as HTMLElement;
      if (l2) {
        l2.setAttribute('x1', elbow.x.toFixed(3)); l2.setAttribute('y1', elbow.y.toFixed(3));
        l2.setAttribute('x2', e.x.toFixed(3)); l2.setAttribute('y2', e.y.toFixed(3));
      }
      const c1 = this.shadowRoot?.querySelector('#jac-col1') as HTMLElement;
      if (c1) { c1.setAttribute('x1', e.x.toFixed(3)); c1.setAttribute('y1', e.y.toFixed(3)); c1.setAttribute('x2', (e.x + J[0][0]).toFixed(3)); c1.setAttribute('y2', (e.y + J[1][0]).toFixed(3)); }
      const c2 = this.shadowRoot?.querySelector('#jac-col2') as HTMLElement;
      if (c2) { c2.setAttribute('x1', e.x.toFixed(3)); c2.setAttribute('y1', e.y.toFixed(3)); c2.setAttribute('x2', (e.x + J[0][1]).toFixed(3)); c2.setAttribute('y2', (e.y + J[1][1]).toFixed(3)); }
      const ell = this.shadowRoot?.querySelector('#jac-ellipse') as HTMLElement;
      if (ell) {
        const pts = ellipsePoints(J, 1, 48).map(p => ({ x: p.x + e.x, y: p.y + e.y }));
        ell.setAttribute('points', ptsStr(pts));
        ell.setAttribute('color', color);
        ell.setAttribute('fill', singular ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)');
      }
    }

    @addEventListener('#jac-t1', 'input')
    onT1(e: Event) { this.t1 = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#jac-t2', 'input')
    onT2(e: Event) { this.t2 = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { t1, t2 } = this;
      const e = endEffector(t1, t2);
      const J = jacobian(t1, t2);
      const dt = det2(J);
      const singular = Math.abs(dt) < 0.3;
      const color = singular ? '#ef4444' : '#10b981';
      const elbow = { x: L1 * Math.cos((t1 * Math.PI) / 180), y: L1 * Math.sin((t1 * Math.PI) / 180) };
      const ellPts = ptsStr(ellipsePoints(J, 1, 48).map(p => ({ x: p.x + e.x, y: p.y + e.y })));
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
        <div class="math-formula">v = J·θ̇ (관절속도 → 손끝속도), det(J) = L1·L2·sin(θ2)</div>
        <div class="math-applied" id="jac-applied" style="color:${color}">적용: θ1=${t1.toFixed(0)}°, θ2=${t2.toFixed(0)}° → det(J)=${dt.toFixed(2)} ${singular ? '(특이점!)' : ''}</div>
        <div class="math-desc">θ2를 0°나 180° 근처로 보내면(팔이 펴지거나 접히면) 보라 타원이 선분으로 눌립니다 — 그게 특이점입니다.</div>
        <cartesian-chart x-min="-4" x-max="4" y-min="-4" y-max="4" center-x="0" center-y="0" x-label="X" y-label="Y">
          <vector id="jac-link1" x1="0" y1="0" x2="${elbow.x.toFixed(3)}" y2="${elbow.y.toFixed(3)}" color="#94a3b8" label="link1"></vector>
          <vector id="jac-link2" x1="${elbow.x.toFixed(3)}" y1="${elbow.y.toFixed(3)}" x2="${e.x.toFixed(3)}" y2="${e.y.toFixed(3)}" color="#f59e0b" label="link2"></vector>
          <polygon id="jac-ellipse" points="${ellPts}" color="${color}" fill="${singular ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'}" label="조작성 타원"></polygon>
          <vector id="jac-col1" x1="${e.x.toFixed(3)}" y1="${e.y.toFixed(3)}" x2="${(e.x + J[0][0]).toFixed(3)}" y2="${(e.y + J[1][0]).toFixed(3)}" color="#e5484d" label="θ1만 (1열)"></vector>
          <vector id="jac-col2" x1="${e.x.toFixed(3)}" y1="${e.y.toFixed(3)}" x2="${(e.x + J[0][1]).toFixed(3)}" y2="${(e.y + J[1][1]).toFixed(3)}" color="#3e63dd" label="θ2만 (2열)"></vector>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#94a3b8">→ link1</b></span><span><b style="color:#f59e0b">→ link2</b></span><span><b style="color:#e5484d">→ θ1만 움직일 때</b></span><span><b style="color:#3e63dd">→ θ2만 움직일 때</b></span><span><b style="color:${color}">■ 조작성 타원</b></span></div>
        <div class="math-notes" id="jac-notes">
          <div>J = [[${J[0][0].toFixed(2)}, ${J[0][1].toFixed(2)}], [${J[1][0].toFixed(2)}, ${J[1][1].toFixed(2)}]]</div>
          <div>det(J) = L1·L2·sin(θ2) = ${(L1 * L2).toFixed(1)}×sin(${t2.toFixed(0)}°) = ${dt.toFixed(2)}</div>
          ${singular ? `<div style="color:#ef4444;font-weight:800;margin-top:4px">⚠ 특이점 근처! 조작성 타원이 선분으로 눌려서, 한쪽 방향으로는 손끝을 못 움직입니다.</div>` : ''}
        </div>
        <div class="ctl"><label>θ1 (어깨) <input id="jac-t1" type="range" min="0" max="360" step="1" value="${t1}"><b id="jac-t1-val">${t1.toFixed(0)}°</b></label></div>
        <div class="ctl"><label>θ2 (팔꿈치) <input id="jac-t2" type="range" min="0" max="360" step="1" value="${t2}"><b id="jac-t2-val">${t2.toFixed(0)}°</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
