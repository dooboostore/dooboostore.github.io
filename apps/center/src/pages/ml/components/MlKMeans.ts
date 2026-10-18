import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-kmeans';

const W = 340, H = 260;
const DOMAIN = 8;
const COLORS = ['#3b82c4', '#f59e0b', '#16a34a', '#a855f7', '#ef4444'];

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = { x: number; y: number };
function genData(): Pt[] {
  const r = mulberry(60);
  const g = () => (r() + r() + r() - 1.5) / 1.5;
  const centers: [number, number][] = [[2, 6], [6, 2], [6, 6]];
  const pts: Pt[] = [];
  centers.forEach(([cx, cy]) => {
    for (let i = 0; i < 15; i++) pts.push({ x: cx + g() * 1.1, y: cy + g() * 1.1 });
  });
  return pts;
}
const DATA = genData();

const MD = `
## k-평균 — 가까운 중심에 줄서기
- **할당**(각 점을 가장 가까운 중심에) → **업데이트**(무리 평균으로 중심 이동)를 중심이 안 움직일 때까지 반복합니다.
- k는 사람이 정합니다. 너무 작으면 다른 과일이 한 바구니에, 너무 크면 한 과일이 여러 바구니에. **엘보우 방법**(관성을 k별로 그려 꺾이는 지점 선택)으로 고릅니다.
- 한 스텝씩 눌러보세요. 중심(★)이 무리 한가운데로 걸어 들어갑니다.
- 책의 코드: \`KMeans(n_clusters=k)\` → \`fit()\` → \`labels_\`, \`cluster_centers_\`
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlKMeans extends w.HTMLElement {
    private k = 3;
    private centroids: Pt[] = [];
    private assign: number[] = [];
    private iter = 0;
    private converged = false;
    private timer: any = null;

    private init() {
      const r = mulberry(200 + this.k);
      const idx = DATA.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      this.centroids = idx.slice(0, this.k).map(i => ({ ...DATA[i] }));
      this.assign = DATA.map(() => 0);
      this.iter = 0;
      this.converged = false;
    }

    private stepOnce(): boolean {
      let moved = 0;
      DATA.forEach((p, i) => {
        let best = 0, bd = Infinity;
        this.centroids.forEach((c, j) => {
          const d = Math.hypot(p.x - c.x, p.y - c.y);
          if (d < bd) { bd = d; best = j; }
        });
        this.assign[i] = best;
      });
      this.centroids = this.centroids.map((c, j) => {
        const members = DATA.filter((_, i) => this.assign[i] === j);
        if (!members.length) return c;
        const nx = members.reduce((s, p) => s + p.x, 0) / members.length;
        const ny = members.reduce((s, p) => s + p.y, 0) / members.length;
        moved = Math.max(moved, Math.hypot(nx - c.x, ny - c.y));
        return { x: nx, y: ny };
      });
      this.iter++;
      if (moved < 1e-6) this.converged = true;
      return this.converged;
    }

    private inertia(): number {
      return DATA.reduce((s, p, i) => {
        const c = this.centroids[this.assign[i]];
        return s + (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
      }, 0);
    }

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#mk-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      const px = (x: number) => (x / DOMAIN) * W;
      const py = (y: number) => H - (y / DOMAIN) * H;
      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);
        DATA.forEach((p, i) => {
          ctx.fillStyle = COLORS[this.assign[i] % COLORS.length];
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y), 4.5, 0, Math.PI * 2);
          ctx.fill();
        });
        this.centroids.forEach((c, j) => {
          ctx.fillStyle = COLORS[j % COLORS.length];
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px(c.x), py(c.y), 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 9px sans-serif';
          ctx.fillText('★', px(c.x) - 4.5, py(c.y) + 3);
          ctx.lineWidth = 1;
        });
      }
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mk-k-val', String(this.k));
      setText('#mk-stat', this.converged
        ? `수렴! 반복 ${this.iter}회 · 관성 ${this.inertia().toFixed(1)} (중심 고정)`
        : `반복 ${this.iter}회 · 관성 ${this.inertia().toFixed(1)}`);
      const btn = this.shadowRoot?.querySelector('#mk-auto') as HTMLButtonElement;
      if (btn) btn.textContent = this.timer ? '⏸ 정지' : '▶ 자동 반복';
    }

    private stop() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    }

    @addEventListener('#mk-k', 'input')
    onK(e: Event) {
      this.k = Number((e.target as HTMLInputElement).value) || 1;
      this.stop();
      this.init();
      this.refresh();
    }
    @addEventListener('#mk-step', 'click')
    onStep() { if (!this.converged) { this.stepOnce(); this.refresh(); } }
    @addEventListener('#mk-auto', 'click')
    onAuto() {
      if (this.timer) { this.stop(); this.refresh(); return; }
      this.timer = setInterval(() => {
        if (!this.shadowRoot?.isConnected || this.converged) { this.stop(); this.refresh(); return; }
        this.stepOnce();
        this.refresh();
      }, 400);
      this.refresh();
    }
    @addEventListener('#mk-reset', 'click')
    onReset() { this.stop(); this.init(); this.refresh(); }

    @onConnectedAfter
    onReady() { this.init(); this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:40px; text-align:right; color:#1e293b; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .mk-btns { display:flex; gap:6px; justify-content:center; margin-top:8px; }
          .mk-btns button { padding:6px 14px; border-radius:16px; border:1.5px solid #14532d; background:#f0fdf4; color:#14532d; font-size:12px; font-weight:800; cursor:pointer; }
          .mk-stat { text-align:center; font-size:12.5px; font-weight:700; color:#1e293b; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:8px; font-family:monospace; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
        </style>

        <div class="mm-def">
  <div><b>정의</b> 각 점을 가장 가까운 중심에 줄 세우는 할당과 무리 평균으로 중심을 옮기는 업데이트를 반복하는 군집 방법입니다.</div>
  <div><b>언제</b> 라벨 없이 무리짓기를 할 때 씁니다.</div>
  <div><b>예시</b> 고객 군집 나누기, 이미지 색 양자화, 엘보우 방법으로 k 선택</div>
</div>
        <div class="mm-intro">
          과일 45개, 라벨 없음. <b>한 스텝</b>씩 누르면 할당→업데이트가 한 번씩 돕니다. k를 2·4·5로 바꿔 리셋 후 다시 돌려보세요.
        </div>

        <div class="ctl"><label>무리 수 k <input id="mk-k" type="range" min="1" max="5" step="1" value="${this.k}"><b id="mk-k-val">${this.k}</b></label></div>
        <div class="mk-btns">
          <button id="mk-step">한 스텝</button>
          <button id="mk-auto">▶ 자동 반복</button>
          <button id="mk-reset">↺ 리셋</button>
        </div>
        <canvas id="mk-canvas" width="${W}" height="${H}"></canvas>
        <div class="mk-stat" id="mk-stat"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
