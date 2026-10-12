import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-deep';

const W = 340, H = 220;

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randn(r: () => number) {
  const u = Math.max(r(), 1e-9), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

type Pt = { x: number; y: number };
function genData(): Pt[] {
  const r = mulberry(91);
  const pts: Pt[] = [];
  for (let i = 0; i < 30; i++) {
    const x = -3 + 6 * r();
    pts.push({ x, y: (x * x * x) / 10 - x + (r() - 0.5) * 1.2 });
  }
  return pts.sort((a, b) => a.x - b.x);
}
const DATA = genData();

type Act = 'tanh' | 'relu';
type Net = { layers: number[][][]; biases: number[][]; act: Act };

function initNet(depth: number, width: number, act: Act): Net {
  const r = mulberry(700 + depth * 10 + (act === 'relu' ? 1 : 0));
  const layers: number[][][] = [];
  const biases: number[][] = [];
  let fanIn = 1;
  for (let l = 0; l < depth; l++) {
    const scale = act === 'relu' ? Math.sqrt(2 / fanIn) : Math.sqrt(1 / fanIn);
    const wl: number[][] = [];
    for (let i = 0; i < width; i++) {
      const row: number[] = [];
      for (let j = 0; j < fanIn; j++) row.push(randn(r) * scale);
      wl.push(row);
    }
    layers.push(wl);
    biases.push(Array.from({ length: width }, () => 0));
    fanIn = width;
  }
  const outScale = Math.sqrt(1 / fanIn);
  layers.push([Array.from({ length: width }, () => randn(r) * outScale)]);
  biases.push([0]);
  return { layers, biases, act };
}

function forward(net: Net, x: number): { acts: number[][]; out: number } {
  let a = [x];
  const acts: number[][] = [a];
  for (let l = 0; l < net.layers.length; l++) {
    const last = l === net.layers.length - 1;
    const z = net.layers[l].map((row, i) => row.reduce((s, w, j) => s + w * a[j], 0) + net.biases[l][i]);
    a = last ? z : z.map(v => (net.act === 'relu' ? Math.max(0, v) : Math.tanh(v)));
    acts.push(a);
  }
  return { acts, out: a[0] };
}

function trainEpoch(net: Net, lr: number) {
  const L = net.layers.length;
  const gw: number[][][] = net.layers.map(m => m.map(row => row.map(() => 0)));
  const gb: number[][] = net.biases.map(b => b.map(() => 0));
  DATA.forEach(pt => {
    const { acts, out } = forward(net, pt.x);
    let delta = [(out - pt.y) * 2 / DATA.length];
    for (let l = L - 1; l >= 0; l--) {
      const aPrev = acts[l];
      net.layers[l].forEach((row, i) => {
        row.forEach((_, j) => { gw[l][i][j] += delta[i] * aPrev[j]; });
        gb[l][i] += delta[i];
      });
      if (l > 0) {
        const prev = acts[l];
        const nd: number[] = new Array(aPrev.length).fill(0);
        net.layers[l].forEach((row, i) => {
          row.forEach((w, j) => { nd[j] += delta[i] * w; });
        });
        delta = nd.map((v, j) => {
          const aval = prev[j];
          const d = net.act === 'relu' ? (aval > 0 ? 1 : 0) : 1 - aval * aval;
          return v * d;
        });
      }
    }
  });
  net.layers.forEach((m, l) => m.forEach((row, i) => row.forEach((_, j) => {
    net.layers[l][i][j] -= lr * gw[l][i][j];
  })));
  net.biases.forEach((b, l) => b.forEach((_, i) => {
    net.biases[l][i] -= lr * gb[l][i];
  }));
}

const mseOf = (net: Net) => DATA.reduce((s, p) => s + (forward(net, p.x).out - p.y) ** 2, 0) / DATA.length;

const MD = `
## 심층 신경망 — 층을 쌓고 렐루를 켜라
- 층을 깊게 쌓을수록 복잡한 곡선을 그립니다. 깊이 1로는 S자 곡선을 못 그리고, 3~4층이면 잡힙니다.
- **렐루**(음수는 0, 양수는 그대로)는 계산이 싸고 기울기가 안 죽어 깊은 층의 표준이 됐습니다. 시그모이드는 양쪽 끝에서 기울기가 0이 돼 층이 깊어지면 학습이 멈춥니다(**기울기 소실**).
- **옵티마이저**(Adam 등)는 학습률 자동 조절판입니다. 여기서는 SGD 고정으로, 층·활성함수 효과만 보세요.
- 책의 코드: \`Sequential()\` → \`Dense(..., activation='relu')\` 쌓기 → \`compile(optimizer='adam')\`
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlDeep extends w.HTMLElement {
    private depth = 2;
    private act: Act = 'tanh';
    private net: Net = initNet(2, 6, 'tanh');
    private epoch = 0;

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#md-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      const XMIN = -3.2, XMAX = 3.2, YMIN = -4, YMAX = 4;
      const px = (x: number) => ((x - XMIN) / (XMAX - XMIN)) * W;
      const py = (y: number) => H - ((y - YMIN) / (YMAX - YMIN)) * H;
      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const x = XMIN + ((XMAX - XMIN) * i) / 120;
          const X = px(x), Y = py(forward(this.net, x).out);
          i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = '#3b82c4';
        DATA.forEach(p => {
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y), 3.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#md-depth-val', `${this.depth}층`);
      setText('#md-stat', `에포크 ${this.epoch} · ${this.act} · MSE ${mseOf(this.net).toFixed(3)}`);
      this.shadowRoot?.querySelectorAll('.md-act').forEach(el =>
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.act === this.act));
    }

    private rebuild() {
      this.net = initNet(this.depth, 6, this.act);
      this.epoch = 0;
    }

    @addEventListener('#md-depth', 'input')
    onDepth(e: Event) {
      this.depth = Number((e.target as HTMLInputElement).value);
      this.rebuild();
      this.refresh();
    }
    @addEventListener('.md-act', 'click', { delegate: true })
    onAct(e: Event) {
      const btn = (e.target as HTMLElement).closest('.md-act') as HTMLElement;
      if (!btn) return;
      this.act = btn.dataset.act as Act;
      this.rebuild();
      this.refresh();
    }
    @addEventListener('#md-train', 'click')
    onTrain() {
      for (let i = 0; i < 150; i++) trainEpoch(this.net, 0.05);
      this.epoch += 150;
      this.refresh();
    }
    @addEventListener('#md-reset', 'click')
    onReset() { this.rebuild(); this.refresh(); }

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
          .ctl b { min-width:52px; text-align:right; color:#1e293b; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .md-row { display:flex; gap:6px; justify-content:center; margin-top:8px; }
          .md-act { padding:6px 16px; border-radius:16px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:12px; font-weight:700; cursor:pointer; }
          .md-act.active { background:#14532d; color:#fff; border-color:#14532d; }
          .mm-btns { display:flex; gap:6px; justify-content:center; margin-top:8px; }
          .mm-btns button { padding:6px 14px; border-radius:16px; border:1.5px solid #14532d; background:#f0fdf4; color:#14532d; font-size:12px; font-weight:800; cursor:pointer; }
          .md-stat { text-align:center; font-size:12px; font-weight:700; color:#1e293b; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:8px; font-family:monospace; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
        </style>

        <div class="mm-def">
          <div><b>정의</b> 은닉층을 여러 겹 쌓은 심층 신경망으로, 렐루(음수는 0, 양수는 그대로)를 써서 깊은 층도 학습된다.</div>
          <div><b>언제</b> 얕은 층으로 못 그리는 복잡한 곡선·패턴을 배울 때 쓴다.</div>
          <div><b>예시</b> 이미지 특징 학습, 음성 특징 학습, S자 곡선 맞히기</div>
        </div>
        <div class="mm-intro">
          S자 곡선 맞히기입니다. 깊이 1·tanh로 훈련을 눌러보세요 — 덜덜 떨립니다. <b>층을 늘리거나 렐루로</b> 바꾸고 다시 해보세요.
        </div>

        <div class="ctl"><label>은닉층 수 <input id="md-depth" type="range" min="1" max="4" step="1" value="${this.depth}"><b id="md-depth-val"></b></label></div>
        <div class="md-row">
          <button class="md-act" data-act="tanh">tanh</button>
          <button class="md-act" data-act="relu">ReLU</button>
        </div>
        <div class="mm-btns">
          <button id="md-train">+150 에포크 훈련</button>
          <button id="md-reset">↺ 리셋</button>
        </div>
        <canvas id="md-canvas" width="${W}" height="${H}"></canvas>
        <div class="md-stat" id="md-stat"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
