import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-inverse';

const MD = `
## 역행렬과 연립방정식(Ax=b)이란?
- \`Ax=b\`는 미지수 x=(x,y)에 대한 **연립방정식** 두 개를 행렬로 쓴 것뿐입니다: \`a·x+b·y=bx\`, \`c·x+d·y=by\` — 각 방정식은 평면 위의 **직선** 하나이고, 해 (x,y)는 그 **두 직선의 교점**입니다.
- **역행렬** A⁻¹이 있으면 \`x = A⁻¹b\`로 바로 풀립니다. 2×2일 때 \`A⁻¹ = 1/det(A) · [[d,-b],[-c,a]]\` — "행렬식(det)" 페이지에서 본 그 det가 분모로 들어갑니다.
- **det(A)=0이면 역행렬이 없습니다** — 기하적으로는 두 직선이 **평행**해진다는 뜻입니다. 평행한 두 직선은 겹치면(같은 직선) 교점이 무수히 많고, 안 겹치면 교점이 하나도 없습니다 — 그래서 해가 "무수히 많음" 또는 "없음"이 되고, 둘 다 "유일한 해 하나"가 아닙니다.
- **어디에 쓰이나요?** — 로봇 팔의 목표 관절각 계산(순기구학의 역), 회로의 미지 전류·전압 계산, 최소제곱법·칼만 필터 등 훨씬 큰 시스템을 푸는 모든 알고리즘의 가장 작은 단위 연산.
`;

interface Mat2 { a: number; b: number; c: number; d: number }

function det2(m: Mat2): number { return m.a * m.d - m.b * m.c; }

function inv2(m: Mat2): Mat2 | null {
  const dt = det2(m);
  if (Math.abs(dt) < 1e-9) return null;
  return { a: m.d / dt, b: -m.b / dt, c: -m.c / dt, d: m.a / dt };
}

function solve(m: Mat2, bx: number, by: number): { x: number; y: number } | null {
  const inv = inv2(m);
  if (!inv) return null;
  return { x: inv.a * bx + inv.b * by, y: inv.c * bx + inv.d * by };
}

/** p*x+q*y=r 직선을 화면을 충분히 덮는 긴 선분(두 끝점)으로 변환 — 캔버스 clip이 보이는 구간만 잘라서 그려줌. */
function lineEndpoints(p: number, q: number, r: number, half = 20): [number, number, number, number] {
  const len = Math.hypot(p, q) || 1e-9;
  const ux = -q / len, uy = p / len;
  const px0 = Math.abs(q) > 1e-9 ? 0 : r / (Math.abs(p) > 1e-9 ? p : 1e-9);
  const py0 = Math.abs(q) > 1e-9 ? r / q : 0;
  return [px0 - ux * half, py0 - uy * half, px0 + ux * half, py0 + uy * half];
}

function notesHtml(m: Mat2, bx: number, by: number): string {
  const dt = det2(m);
  const singular = Math.abs(dt) < 0.05;
  if (!singular) {
    const s = solve(m, bx, by)!;
    const inv = inv2(m)!;
    return `<div>det(A) = ${m.a.toFixed(1)}×${m.d.toFixed(1)} - ${m.b.toFixed(1)}×${m.c.toFixed(1)} = ${dt.toFixed(2)}</div>` +
      `<div>A⁻¹ = 1/${dt.toFixed(2)} · [[${m.d.toFixed(1)}, ${(-m.b).toFixed(1)}], [${(-m.c).toFixed(1)}, ${m.a.toFixed(1)}]] = [[${inv.a.toFixed(2)}, ${inv.b.toFixed(2)}], [${inv.c.toFixed(2)}, ${inv.d.toFixed(2)}]]</div>` +
      `<div style="margin-top:4px;font-weight:900">x = A⁻¹b = (${s.x.toFixed(2)}, ${s.y.toFixed(2)}) — 유일한 해</div>`;
  }
  // 특이(det≈0) — 평행 여부 + 같은 직선 여부(교점 없음 vs 무수히 많음) 확인
  const p0x = Math.abs(m.b) > 1e-9 ? 0 : (Math.abs(m.a) > 1e-9 ? bx / m.a : 0);
  const p0y = Math.abs(m.b) > 1e-9 ? bx / m.b : 0;
  const coincident = Math.abs(m.c * p0x + m.d * p0y - by) < 0.05;
  return `<div>det(A) = ${dt.toFixed(3)} ≈ 0 → <b style="color:#ef4444">역행렬 없음(특이행렬)</b></div>` +
    `<div style="margin-top:4px">두 직선이 평행해졌습니다 → ${coincident ? '<b style="color:#f59e0b">완전히 겹침 — 해가 무수히 많음</b>' : '<b style="color:#ef4444">겹치지 않음 — 해가 없음(교점 없음)</b>'}</div>`;
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathInverse extends w.HTMLElement {
    private a = 2;
    private b = 1;
    private c = -1;
    private d = 1;
    private bx = 3;
    private by = 1;

    private refresh() {
      const { a, b, c, d, bx, by } = this;
      const m: Mat2 = { a, b, c, d };
      const dt = det2(m);
      const singular = Math.abs(dt) < 0.05;
      const s = solve(m, bx, by);
      const color = singular ? '#ef4444' : '#10b981';

      const applied = this.shadowRoot?.querySelector('#inv-applied') as HTMLElement;
      if (applied) {
        applied.style.color = color;
        applied.textContent = s
          ? `적용: A=[[${a.toFixed(1)},${b.toFixed(1)}],[${c.toFixed(1)},${d.toFixed(1)}]], b=(${bx.toFixed(1)},${by.toFixed(1)}) → x=(${s.x.toFixed(2)}, ${s.y.toFixed(2)})`
          : `적용: A=[[${a.toFixed(1)},${b.toFixed(1)}],[${c.toFixed(1)},${d.toFixed(1)}]], b=(${bx.toFixed(1)},${by.toFixed(1)}) → det≈0, 특이행렬`;
      }

      const notes = this.shadowRoot?.querySelector('#inv-notes') as HTMLElement;
      if (notes) notes.innerHTML = notesHtml(m, bx, by);

      (['a', 'b', 'c', 'd', 'bx', 'by'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#inv-${k}-val`) as HTMLElement;
        if (el) el.textContent = this[k].toFixed(1);
      });

      const [x1a, y1a, x2a, y2a] = lineEndpoints(a, b, bx);
      const [x1b, y1b, x2b, y2b] = lineEndpoints(c, d, by);
      const l1 = this.shadowRoot?.querySelector('#inv-line1') as HTMLElement;
      if (l1) { l1.setAttribute('x1', x1a.toFixed(2)); l1.setAttribute('y1', y1a.toFixed(2)); l1.setAttribute('x2', x2a.toFixed(2)); l1.setAttribute('y2', y2a.toFixed(2)); }
      const l2 = this.shadowRoot?.querySelector('#inv-line2') as HTMLElement;
      if (l2) { l2.setAttribute('x1', x1b.toFixed(2)); l2.setAttribute('y1', y1b.toFixed(2)); l2.setAttribute('x2', x2b.toFixed(2)); l2.setAttribute('y2', y2b.toFixed(2)); }
      const pt = this.shadowRoot?.querySelector('#inv-solution') as HTMLElement;
      if (pt) {
        // 해가 없으면(det≈0) 차트 밖(9999,9999)으로 치워서 안 보이게 함 — 캔버스 clip이 화면 밖은 그리지 않음
        if (s) { pt.setAttribute('x', s.x.toFixed(3)); pt.setAttribute('y', s.y.toFixed(3)); pt.setAttribute('label', `x=(${s.x.toFixed(2)}, ${s.y.toFixed(2)})`); }
        else { pt.setAttribute('x', '9999'); pt.setAttribute('y', '9999'); pt.setAttribute('label', ''); }
      }
    }

    @addEventListener('#inv-a', 'input')
    onA(e: Event) { this.a = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#inv-b', 'input')
    onB(e: Event) { this.b = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#inv-c', 'input')
    onC(e: Event) { this.c = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#inv-d', 'input')
    onD(e: Event) { this.d = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#inv-bx', 'input')
    onBx(e: Event) { this.bx = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#inv-by', 'input')
    onBy(e: Event) { this.by = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { a, b, c, d, bx, by } = this;
      const m: Mat2 = { a, b, c, d };
      const dt = det2(m);
      const singular = Math.abs(dt) < 0.05;
      const s = solve(m, bx, by);
      const color = singular ? '#ef4444' : '#10b981';
      const [x1a, y1a, x2a, y2a] = lineEndpoints(a, b, bx);
      const [x1b, y1b, x2b, y2b] = lineEndpoints(c, d, by);
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
        <div class="math-formula">Ax=b → 두 직선(각 방정식)의 교점이 해 x. x = A⁻¹b</div>
        <div class="math-applied" id="inv-applied" style="color:${color}">${s
          ? `적용: A=[[${a.toFixed(1)},${b.toFixed(1)}],[${c.toFixed(1)},${d.toFixed(1)}]], b=(${bx.toFixed(1)},${by.toFixed(1)}) → x=(${s.x.toFixed(2)}, ${s.y.toFixed(2)})`
          : `적용: A=[[${a.toFixed(1)},${b.toFixed(1)}],[${c.toFixed(1)},${d.toFixed(1)}]], b=(${bx.toFixed(1)},${by.toFixed(1)}) → det≈0, 특이행렬`}</div>
        <div class="math-desc">a·b·c·d를 움직여 두 직선을 돌려보세요. 평행해지는(det→0) 순간 교점이 사라지거나(해 없음) 겹쳐버립니다(해 무수히 많음).</div>
        <cartesian-chart x-min="-6" x-max="6" y-min="-6" y-max="6" center-x="0" center-y="0" x-label="X" y-label="Y">
          <vector id="inv-line1" x1="${x1a.toFixed(2)}" y1="${y1a.toFixed(2)}" x2="${x2a.toFixed(2)}" y2="${y2a.toFixed(2)}" color="#e5484d" label="a·x+b·y=bx"></vector>
          <vector id="inv-line2" x1="${x1b.toFixed(2)}" y1="${y1b.toFixed(2)}" x2="${x2b.toFixed(2)}" y2="${y2b.toFixed(2)}" color="#3e63dd" label="c·x+d·y=by"></vector>
          <marker id="inv-solution" x="${s ? s.x.toFixed(3) : 0}" y="${s ? s.y.toFixed(3) : 0}" color="${color}" size="8" label="${s ? `x=(${s.x.toFixed(2)}, ${s.y.toFixed(2)})` : ''}" ${s ? '' : 'hidden'}></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#e5484d">— 1번 방정식(직선)</b></span><span><b style="color:#3e63dd">— 2번 방정식(직선)</b></span><span><b style="color:${color}">● 해 x(교점)</b></span></div>
        <div class="math-notes" id="inv-notes">${notesHtml(m, bx, by)}</div>
        <div class="ctl"><label>a <input id="inv-a" type="range" min="-3" max="3" step="0.5" value="${a}"><b id="inv-a-val">${a.toFixed(1)}</b></label></div>
        <div class="ctl"><label>b <input id="inv-b" type="range" min="-3" max="3" step="0.5" value="${b}"><b id="inv-b-val">${b.toFixed(1)}</b></label></div>
        <div class="ctl"><label>c <input id="inv-c" type="range" min="-3" max="3" step="0.5" value="${c}"><b id="inv-c-val">${c.toFixed(1)}</b></label></div>
        <div class="ctl"><label>d <input id="inv-d" type="range" min="-3" max="3" step="0.5" value="${d}"><b id="inv-d-val">${d.toFixed(1)}</b></label></div>
        <div class="ctl"><label>bx <input id="inv-bx" type="range" min="-5" max="5" step="0.5" value="${bx}"><b id="inv-bx-val">${bx.toFixed(1)}</b></label></div>
        <div class="ctl"><label>by <input id="inv-by" type="range" min="-5" max="5" step="0.5" value="${by}"><b id="inv-by-val">${by.toFixed(1)}</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
