import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-market';

const W = 340, H = 260;
const XMIN = 5, XMAX = 45, YMIN = 0, YMAX = 1000;

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = { x: number; y: number; label: 0 | 1 };
const CLASSES = [
  { name: '도미', color: '#3b82c4' },
  { name: '빙어', color: '#f59e0b' },
];

function genData(): Pt[] {
  const r = mulberry(7);
  const pts: Pt[] = [];
  const gauss = () => (r() + r() + r() - 1.5) / 1.5;
  for (let i = 0; i < 20; i++) pts.push({ x: 25 + gauss() * 7, y: 500 + gauss() * 170, label: 0 });
  for (let i = 0; i < 20; i++) pts.push({ x: 13 + gauss() * 3.5, y: 130 + gauss() * 70, label: 1 });
  return pts;
}

const MD = `
## k-최근접 이웃 분류 — 가까운 이웃에게 물어봐
- 새 생선이 들어오면 **가장 가까운 k마리**를 찾아 다수결로 이름을 붙입니다. 학습은 그냥 데이터를 저장하는 것뿐(fit=암기)이라 **게으른 학습**이라 부릅니다.
- **k가 작으면** 이웃 하나에 민감(들쭉날쭉), **k가 크면** 부드럽지만 소수 클래스가 묻힙니다. 슬라이더로 k=1과 k=11의 경계 변화를 보세요.
- 책의 코드: \`KNeighborsClassifier(n_neighbors=k)\` → \`fit()\` → \`predict()\` → \`score()\`
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  const train = genData();

  @elementDefine(tagName, { window: w })
  class MlMarket extends w.HTMLElement {
    private k = 5;
    private query: { x: number; y: number } | null = { x: 20, y: 300 };

    private px(x: number) { return ((x - XMIN) / (XMAX - XMIN)) * W; }
    private py(y: number) { return H - ((y - YMIN) / (YMAX - YMIN)) * H; }

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#mm-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      let votes = [0, 0];
      let neigh: Pt[] = [];
      if (ctx && this.query) {
        const ds = train.map(p => ({ p, d: Math.hypot(p.x - this.query!.x, p.y - this.query!.y) }));
        ds.sort((a, b) => a.d - b.d);
        neigh = ds.slice(0, this.k).map(v => v.p);
        votes = [0, 0];
        neigh.forEach(p => votes[p.label]++);
      }
      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#e2e8f0';
        ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
        if (this.query) {
          ctx.strokeStyle = '#cbd5e1';
          ctx.setLineDash([4, 3]);
          neigh.forEach(p => {
            ctx.beginPath();
            ctx.moveTo(this.px(this.query!.x), this.py(this.query!.y));
            ctx.lineTo(this.px(p.x), this.py(p.y));
            ctx.stroke();
          });
          ctx.setLineDash([]);
        }
        train.forEach(p => {
          const isN = neigh.includes(p);
          ctx.fillStyle = CLASSES[p.label].color;
          ctx.beginPath();
          ctx.arc(this.px(p.x), this.py(p.y), isN ? 6 : 4, 0, Math.PI * 2);
          ctx.fill();
          if (isN) {
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.lineWidth = 1;
          }
        });
        if (this.query) {
          const qx = this.px(this.query.x), qy = this.py(this.query.y);
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(qx - 7, qy - 7); ctx.lineTo(qx + 7, qy + 7);
          ctx.moveTo(qx + 7, qy - 7); ctx.lineTo(qx - 7, qy + 7);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        ctx.fillStyle = '#64748b';
        ctx.font = '10px sans-serif';
        ctx.fillText('길이(cm) →', W - 70, H - 6);
      }
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mm-k-val', String(this.k));
      if (this.query) {
        const win = votes[0] === votes[1] ? -1 : votes[0] > votes[1] ? 0 : 1;
        setText('#mm-verdict', win === -1
          ? `동점 (${votes[0]}:${votes[1]}) — k를 홀수로 바꿔보세요`
          : `${CLASSES[win].name} (표 ${Math.max(...votes)}/${this.k})`);
      }
    }

    @addEventListener('#mm-k', 'input')
    onK(e: Event) { this.k = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }

    @addEventListener('#mm-canvas', 'click')
    onCanvas(e: MouseEvent) {
      const canvas = this.shadowRoot?.querySelector('#mm-canvas') as HTMLCanvasElement;
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const cx = (e.clientX - r.left) * (W / r.width);
      const cy = (e.clientY - r.top) * (H / r.height);
      this.query = {
        x: XMIN + (cx / W) * (XMAX - XMIN),
        y: YMIN + ((H - cy) / H) * (YMAX - YMIN),
      };
      this.refresh();
    }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:40px; text-align:right; color:#1e293b; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; cursor:crosshair; }
          .mm-verdict { text-align:center; font-size:13px; font-weight:800; color:#14532d; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:8px; }
          .mm-legend { display:flex; gap:12px; justify-content:center; font-size:11px; color:#64748b; margin-top:6px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
        </style>

        <div class="mm-def">
  <div><b>정의</b> k-최근접 이웃(k-NN) 분류는 새 데이터와 가장 가까운 k개를 찾아 다수결로 이름을 붙이는 방법입니다.</div>
  <div><b>언제</b> 데이터가 적고 바로 써야 할 때, 베이스라인으로 씁니다.</div>
  <div><b>예시</b> 생선 분류, 추천 초기버전, 이상치 탐지</div>
</div>
<div class="mm-intro">
          책 1장의 생선 분류 문제 그대로입니다. 그래프를 <b>클릭</b>하면 새 생선이 놓이고, k마리 이웃의 다수결로 이름을 붙입니다.
        </div>

        <div class="ctl"><label>이웃 수 k <input id="mm-k" type="range" min="1" max="11" step="2" value="${this.k}"><b id="mm-k-val">${this.k}</b></label></div>
        <canvas id="mm-canvas" width="${W}" height="${H}"></canvas>
        <div class="mm-legend"><span><span style="color:#3b82c4">●</span> 도미</span><span><span style="color:#f59e0b">●</span> 빙어</span><span><span style="color:#ef4444">✕</span> 새 생선</span></div>
        <div class="mm-verdict" id="mm-verdict"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
