import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-quadratic-form';

const MD = `
## 이차형식(Quadratic Form)과 양의정부호(Positive Definite)란?
- 대칭행렬 A와 벡터 x=(x,y)로 만드는 스칼라 \`Q(x) = xᵗAx = a·x² + 2b·xy + d·y²\`가 **이차형식**입니다.
- **"고유값·고유벡터"** 페이지에서 본 것처럼, 대칭행렬은 항상 서로 직각인 고유벡터를 가집니다. 그 고유벡터 방향으로 좌표축을 새로 잡으면(u,v), 이차형식이 \`Q = λ1·u² + λ2·v²\`로 아주 단순해집니다 — **교차항(xy)이 사라지는 좌표계**를 고유벡터가 알려주는 셈입니다.
- 등고선 \`Q(x)=1\`(또는 -1)의 모양이 **고유값의 부호**에 따라 완전히 달라집니다:
  - λ1>0, λ2>0 → **양의정부호(Positive Definite)** → 등고선이 **타원**(어느 방향으로 가도 Q가 커짐)
  - λ1<0, λ2<0 → **음의정부호(Negative Definite)** → 등고선이 타원(단, Q=-1 기준)
  - 부호가 다름 → **부정(Indefinite)** → 등고선이 **쌍곡선**(어떤 방향은 커지고 어떤 방향은 작아지는 "안장점")
  - 고유값 중 하나가 0 → **반정부호(semi-definite)** → 등고선이 **평행한 두 직선**(그 방향으로는 Q가 안 변함)
- **어디에 쓰이나요?** — 제어이론의 **리아프노프 안정성**(V(x)=xᵗPx가 양의정부호여야 "에너지가 항상 줄어든다"는 안정성 증명이 성립), 최적화의 극소점 판정(헤시안이 양의정부호면 진짜 최솟값), PCA·공분산 행렬(항상 양의반정부호).
`;

interface Vec2 { x: number; y: number }
type Cls = 'PD' | 'ND' | 'INDEF' | 'PSD' | 'NSD' | 'ZERO';

function eigenSym2(a: number, b: number, d: number) {
  const avg = (a + d) / 2, diff = (a - d) / 2, r = Math.hypot(diff, b);
  const l1 = avg + r, l2 = avg - r;
  const norm = (v: [number, number]): [number, number] => { const n = Math.hypot(v[0], v[1]) || 1; return [v[0] / n, v[1] / n]; };
  let v1: [number, number], v2: [number, number];
  if (Math.abs(b) > 1e-9) { v1 = [b, l1 - a]; v2 = [b, l2 - a]; }
  else { v1 = a >= d ? [1, 0] : [0, 1]; v2 = a >= d ? [0, 1] : [1, 0]; }
  return { l1, l2, v1: norm(v1), v2: norm(v2) };
}

function classify(l1: number, l2: number): Cls {
  const z1 = Math.abs(l1) < 0.05, z2 = Math.abs(l2) < 0.05;
  if (z1 && z2) return 'ZERO';
  if (z1) return l2 > 0 ? 'PSD' : 'NSD';
  if (z2) return l1 > 0 ? 'PSD' : 'NSD';
  if (l1 > 0 && l2 > 0) return 'PD';
  if (l1 < 0 && l2 < 0) return 'ND';
  return 'INDEF';
}

const CLS_LABEL: Record<Cls, { label: string; color: string; shape: string }> = {
  PD: { label: '양의정부호(Positive Definite)', color: '#10b981', shape: '타원' },
  ND: { label: '음의정부호(Negative Definite)', color: '#3e63dd', shape: '타원(Q=-1 기준)' },
  INDEF: { label: '부정(Indefinite, 안장점)', color: '#ef4444', shape: '쌍곡선' },
  PSD: { label: '양의반정부호(Positive Semi-Definite)', color: '#f59e0b', shape: '평행한 두 직선' },
  NSD: { label: '음의반정부호(Negative Semi-Definite)', color: '#f59e0b', shape: '평행한 두 직선' },
  ZERO: { label: '영행렬(모든 방향에서 Q=0)', color: '#94a3b8', shape: '없음(전체 평면)' },
};

/** 등고선 |Q(x,y)|=1의 두 브랜치를 원래 x,y 좌표로 만든다(고유벡터 좌표 u,v → x,y 변환). */
function levelCurve(l1: number, l2: number, v1: [number, number], v2: [number, number], cls: Cls) {
  const n = 96;
  const cap = (l: number) => Math.max(Math.abs(l), 0.05); // 시각화용 — 고유값 0 근처 발산 방지(실제 판정에는 안 씀)
  const toXY = (u: number, v: number): Vec2 => ({ x: u * v1[0] + v * v2[0], y: u * v1[1] + v * v2[1] });
  const fmt = (pts: Vec2[]) => pts.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');

  if (cls === 'PD' || cls === 'ND') {
    const su = 1 / Math.sqrt(cap(l1)), sv = 1 / Math.sqrt(cap(l2));
    const pts: Vec2[] = [];
    for (let i = 0; i <= n; i++) { const t = (i / n) * 2 * Math.PI; pts.push(toXY(su * Math.cos(t), sv * Math.sin(t))); }
    return { a: fmt(pts), b: '' };
  }
  if (cls === 'INDEF') {
    // 관례상 l1이 항상 더 큰 고유값이라, 부정이면 항상 l1>0>l2 — 쌍곡선이 v1축 방향으로 열림
    const su = 1 / Math.sqrt(cap(l1)), sv = 1 / Math.sqrt(cap(l2));
    const T = 2.0;
    const posBranch: Vec2[] = [], negBranch: Vec2[] = [];
    for (let i = 0; i <= n; i++) {
      const t = -T + (2 * T) * (i / n);
      posBranch.push(toXY(su * Math.cosh(t), sv * Math.sinh(t)));
      negBranch.push(toXY(-su * Math.cosh(t), sv * Math.sinh(t)));
    }
    return { a: fmt(posBranch), b: fmt(negBranch) };
  }
  if (cls === 'PSD' || cls === 'NSD') {
    const BIG = 8;
    if (Math.abs(l1) < 0.05) {
      const sv = 1 / Math.sqrt(cap(l2));
      return { a: fmt([toXY(-BIG, sv), toXY(BIG, sv)]), b: fmt([toXY(-BIG, -sv), toXY(BIG, -sv)]) };
    }
    const su = 1 / Math.sqrt(cap(l1));
    return { a: fmt([toXY(su, -BIG), toXY(su, BIG)]), b: fmt([toXY(-su, -BIG), toXY(-su, BIG)]) };
  }
  return { a: '', b: '' };
}

function notesHtml(a: number, b: number, d: number) {
  const { l1, l2, v1, v2 } = eigenSym2(a, b, d);
  const cls = classify(l1, l2);
  const info = CLS_LABEL[cls];
  return `<div>A = [[${a.toFixed(2)}, ${b.toFixed(2)}], [${b.toFixed(2)}, ${d.toFixed(2)}]] (대칭)</div>` +
    `<div>고유값: λ1=${l1.toFixed(2)}, λ2=${l2.toFixed(2)} (고유벡터 v1≈(${v1[0].toFixed(2)},${v1[1].toFixed(2)}), v2≈(${v2[0].toFixed(2)},${v2[1].toFixed(2)}))</div>` +
    `<div style="margin-top:4px;font-weight:900;color:${info.color}">${info.label} → 등고선: ${info.shape}</div>`;
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathQuadraticForm extends w.HTMLElement {
    private a = 2;
    private b = 0.8;
    private d = 1.2;

    private refresh() {
      const { a, b, d } = this;
      const { l1, l2, v1, v2 } = eigenSym2(a, b, d);
      const cls = classify(l1, l2);
      const info = CLS_LABEL[cls];
      const curve = levelCurve(l1, l2, v1, v2, cls);

      const applied = this.shadowRoot?.querySelector('#qf-applied') as HTMLElement;
      if (applied) { applied.style.color = info.color; applied.textContent = `적용: A=[[${a.toFixed(2)},${b.toFixed(2)}],[${b.toFixed(2)},${d.toFixed(2)}]] → λ1=${l1.toFixed(2)}, λ2=${l2.toFixed(2)} → ${info.label}`; }

      const notes = this.shadowRoot?.querySelector('#qf-notes') as HTMLElement;
      if (notes) notes.innerHTML = notesHtml(a, b, d);

      (['a', 'b', 'd'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#qf-${k}-val`) as HTMLElement;
        if (el) el.textContent = this[k].toFixed(2);
      });

      const curveA = this.shadowRoot?.querySelector('#qf-curve-a') as HTMLElement;
      if (curveA) { curveA.setAttribute('points', curve.a); curveA.setAttribute('color', info.color); }
      const curveB = this.shadowRoot?.querySelector('#qf-curve-b') as HTMLElement;
      if (curveB) { curveB.setAttribute('points', curve.b); curveB.setAttribute('color', info.color); }
      const ax1 = this.shadowRoot?.querySelector('#qf-v1') as HTMLElement;
      if (ax1) { ax1.setAttribute('x2', (v1[0] * 2.5).toFixed(3)); ax1.setAttribute('y2', (v1[1] * 2.5).toFixed(3)); ax1.setAttribute('label', `v1(λ1=${l1.toFixed(2)})`); }
      const ax2 = this.shadowRoot?.querySelector('#qf-v2') as HTMLElement;
      if (ax2) { ax2.setAttribute('x2', (v2[0] * 2.5).toFixed(3)); ax2.setAttribute('y2', (v2[1] * 2.5).toFixed(3)); ax2.setAttribute('label', `v2(λ2=${l2.toFixed(2)})`); }
    }

    @addEventListener('#qf-a', 'input')
    onA(e: Event) { this.a = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#qf-b', 'input')
    onB(e: Event) { this.b = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#qf-d', 'input')
    onD(e: Event) { this.d = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { a, b, d } = this;
      const { l1, l2, v1, v2 } = eigenSym2(a, b, d);
      const cls = classify(l1, l2);
      const info = CLS_LABEL[cls];
      const curve = levelCurve(l1, l2, v1, v2, cls);
      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; margin-bottom:8px; }
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
        <div class="math-formula">Q(x) = xᵗAx = a·x²+2b·xy+d·y², A=[[a,b],[b,d]] (대칭)</div>
        <div class="math-applied" id="qf-applied" style="color:${info.color}">적용: A=[[${a.toFixed(2)},${b.toFixed(2)}],[${b.toFixed(2)},${d.toFixed(2)}]] → λ1=${l1.toFixed(2)}, λ2=${l2.toFixed(2)} → ${info.label}</div>
        <div class="math-desc">a·b·d를 움직여 등고선 |Q(x)|=1의 모양이 타원↔쌍곡선↔직선으로 바뀌는 걸 보세요. 회색 화살표는 고유벡터 방향(교차항이 사라지는 축)입니다.</div>
        <cartesian-chart x-min="-6" x-max="6" y-min="-6" y-max="6" center-x="0" center-y="0" x-label="X" y-label="Y">
          <vector id="qf-v1" x1="0" y1="0" x2="${(v1[0] * 2.5).toFixed(3)}" y2="${(v1[1] * 2.5).toFixed(3)}" color="#94a3b8" dash="3,2" label="v1(λ1=${l1.toFixed(2)})"></vector>
          <vector id="qf-v2" x1="0" y1="0" x2="${(v2[0] * 2.5).toFixed(3)}" y2="${(v2[1] * 2.5).toFixed(3)}" color="#94a3b8" dash="3,2" label="v2(λ2=${l2.toFixed(2)})"></vector>
          <series id="qf-curve-a" points="${curve.a}" color="${info.color}" width="2.2" label="|Q(x)|=1"></series>
          <series id="qf-curve-b" points="${curve.b}" color="${info.color}" width="2.2"></series>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#94a3b8">- - 고유벡터(v1,v2)</b></span><span><b style="color:${info.color}">— |Q(x)|=1 등고선</b></span></div>
        <div class="math-notes" id="qf-notes">${notesHtml(a, b, d)}</div>
        <div class="ctl"><label>a (A11) <input id="qf-a" type="range" min="-3" max="3" step="0.1" value="${a}"><b id="qf-a-val">${a.toFixed(2)}</b></label></div>
        <div class="ctl"><label>b (A12=A21) <input id="qf-b" type="range" min="-3" max="3" step="0.1" value="${b}"><b id="qf-b-val">${b.toFixed(2)}</b></label></div>
        <div class="ctl"><label>d (A22) <input id="qf-d" type="range" min="-3" max="3" step="0.1" value="${d}"><b id="qf-d-val">${d.toFixed(2)}</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
