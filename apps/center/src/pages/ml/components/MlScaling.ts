import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-scaling';

const W = 340, H = 260;

// 길이(cm) vs 무게(g) — 스케일이 100배 다름
type Pt = { x: number; y: number; label: 0 | 1 };
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function genData(): Pt[] {
  const r = mulberry(21);
  const g = () => (r() + r() + r() - 1.5) / 1.5;
  const pts: Pt[] = [];
  for (let i = 0; i < 18; i++) pts.push({ x: 25 + g() * 6, y: 480 + g() * 150, label: 0 });
  for (let i = 0; i < 18; i++) pts.push({ x: 14 + g() * 3, y: 140 + g() * 60, label: 1 });
  return pts;
}
const TRAIN = genData();
const COLORS = ['#3b82c4', '#f59e0b'];

const MD = `
## 스케일링 — 기준을 맞춰라
- 길이(수십)와 무게(수백)는 **단위가 달라** 거리 계산에서 무게가 길이의 목소리를 묻어버립니다. k-NN처럼 거리 쓰는 알고리즘은 스케일에 민감합니다.
- 그래서 **표준화**(평균을 빼고 표준편차로 나눔)로 두 특성을 같은 링 위에 올립니다. 위 토글로 이웃이 바뀌는 걸 확인해보세요.
- 철칙: **훈련 세트 기준**으로 평균·표준편차를 구해 테스트 세트에 적용합니다. 테스트 기준으로 구하면 시험 문제 유출(데이터 리키지)입니다.
- 책의 코드: \`StandardScaler()\` → \`fit(train)\` → \`transform(train)\` / \`transform(test)\`
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlScaling extends w.HTMLElement {
    private scaled = false;
    private qx = 22;
    private qy = 260;

    private stats() {
      const mx = TRAIN.reduce((s, p) => s + p.x, 0) / TRAIN.length;
      const my = TRAIN.reduce((s, p) => s + p.y, 0) / TRAIN.length;
      const sx = Math.sqrt(TRAIN.reduce((s, p) => s + (p.x - mx) ** 2, 0) / TRAIN.length);
      const sy = Math.sqrt(TRAIN.reduce((s, p) => s + (p.y - my) ** 2, 0) / TRAIN.length);
      return { mx, my, sx, sy };
    }

    private refresh() {
      const { mx, my, sx, sy } = this.stats();
      const norm = (x: number, y: number) => this.scaled
        ? { x: (x - mx) / sx, y: (y - my) / sy }
        : { x, y };
      const q = norm(this.qx, this.qy);
      const ds = TRAIN.map(p => {
        const n = norm(p.x, p.y);
        return { p, d: Math.hypot(n.x - q.x, n.y - q.y) };
      });
      ds.sort((a, b) => a.d - b.d);
      const neigh = ds.slice(0, 5).map(v => v.p);
      const votes = [0, 0];
      neigh.forEach(p => votes[p.label]++);

      const canvas = this.shadowRoot?.querySelector('#mg-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        const allX = TRAIN.map(p => norm(p.x, p.y).x).concat([q.x]);
        const allY = TRAIN.map(p => norm(p.x, p.y).y).concat([q.y]);
        const XMIN = Math.min(...allX), XMAX = Math.max(...allX);
        const YMIN = Math.min(...allY), YMAX = Math.max(...allY);
        const px = (x: number) => 14 + ((x - XMIN) / (XMAX - XMIN || 1)) * (W - 28);
        const py = (y: number) => H - 14 - ((y - YMIN) / (YMAX - YMIN || 1)) * (H - 28);
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);
        TRAIN.forEach(p => {
          const n = norm(p.x, p.y);
          const isN = neigh.includes(p);
          ctx.fillStyle = COLORS[p.label];
          ctx.beginPath();
          ctx.arc(px(n.x), py(n.y), isN ? 6 : 4, 0, Math.PI * 2);
          ctx.fill();
          if (isN) { ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; }
        });
        const qxx = px(q.x), qyy = py(q.y);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(qxx - 7, qyy - 7); ctx.lineTo(qxx + 7, qyy + 7);
        ctx.moveTo(qxx + 7, qyy - 7); ctx.lineTo(qxx - 7, qyy + 7);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = '#64748b';
        ctx.font = '10px sans-serif';
        ctx.fillText(this.scaled ? '표준화됨 (단위 없음)' : '원본 (cm vs g)', 10, 14);
      }
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      const win = votes[0] === votes[1] ? -1 : votes[0] > votes[1] ? 0 : 1;
      setText('#mg-verdict', win === -1
        ? `동점 — 이웃 5마리 중 도미 ${votes[0]}, 빙어 ${votes[1]}`
        : `${win === 0 ? '도미' : '빙어'} (5마리 중 ${Math.max(...votes)}표)`);
      const t = this.shadowRoot?.querySelector('#mg-toggle') as HTMLButtonElement;
      if (t) t.textContent = this.scaled ? '표준화 ON — 끄기' : '표준화 OFF — 켜기';
      setText('#mg-qx-val', this.qx.toFixed(0));
      setText('#mg-qy-val', this.qy.toFixed(0));
    }

    @addEventListener('#mg-toggle', 'click')
    onToggle() { this.scaled = !this.scaled; this.refresh(); }
    @addEventListener('#mg-qx', 'input')
    onQx(e: Event) { this.qx = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#mg-qy', 'input')
    onQy(e: Event) { this.qy = Number((e.target as HTMLInputElement).value); this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:44px; text-align:right; color:#1e293b; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .mg-btn { display:block; margin:8px auto; padding:7px 18px; border-radius:16px; border:1.5px solid #14532d; background:#f0fdf4; color:#14532d; font-size:12px; font-weight:800; cursor:pointer; }
          .mg-verdict { text-align:center; font-size:13px; font-weight:800; color:#14532d; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:8px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
        </style>

        <div class="mm-def">
  <div><b>정의</b> 표준화는 평균을 빼고 표준편차로 나누어 특성들의 기준을 맞추는 전처리입니다.</div>
  <div><b>언제</b> 단위가 다른 특성을 거리 기반 모델에 넣을 때 씁니다.</div>
  <div><b>예시</b> 키·몸무게, k-NN/SVM 전처리</div>
</div>
<div class="mm-intro">
          수상한 도미 한 마리(02-2) 상황입니다. 길이와 무게의 <b>단위가 달라</b> 무게가 표를 독식합니다. 버튼으로 표준화를 켜면 이웃 5마리가 바뀌는 게 보입니다.
        </div>

        <div class="ctl"><label>새 생선 길이 <input id="mg-qx" type="range" min="8" max="38" step="1" value="${this.qx}"><b id="mg-qx-val">${this.qx}</b></label></div>
        <div class="ctl"><label>새 생선 무게 <input id="mg-qy" type="range" min="50" max="700" step="10" value="${this.qy}"><b id="mg-qy-val">${this.qy}</b></label></div>
        <button class="mg-btn" id="mg-toggle"></button>
        <canvas id="mg-canvas" width="${W}" height="${H}"></canvas>
        <div class="mg-verdict" id="mg-verdict"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
