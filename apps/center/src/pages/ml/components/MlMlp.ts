import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-mlp';

const W = 340, H = 260;
const DOMAIN = 3;

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

type Pt = { x: number; y: number; label: 0 | 1 };
function gen(n: number, seed: number): Pt[] {
  const r = mulberry(seed);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const x = (r() * 2 - 1) * DOMAIN;
    const y = (r() * 2 - 1) * DOMAIN;
    pts.push({ x, y, label: Math.hypot(x, y) < 1.4 ? 1 : 0 });
  }
  return pts;
}
const TRAIN = gen(80, 21);
const TEST = gen(40, 77);
const sig = (z: number) => 1 / (1 + Math.exp(-z));
const tanh = (z: number) => Math.tanh(z);

type Net = { h: number; w1: number[][]; b1: number[]; w2: number[]; b2: number };
function initNet(h: number): Net {
  const r = mulberry(500 + h);
  const w1: number[][] = [];
  for (let i = 0; i < h; i++) w1.push([randn(r) * 0.8, randn(r) * 0.8]);
  const b1 = Array.from({ length: h }, () => randn(r) * 0.2);
  const w2 = Array.from({ length: h }, () => randn(r) * 0.8);
  return { h, w1, b1, w2, b2: 0 };
}
function forward(net: Net, x: number, y: number): { hs: number[]; p: number } {
  const hs = net.w1.map((w, i) => tanh(w[0] * x + w[1] * y + net.b1[i]));
  let z = net.b2;
  hs.forEach((hh, i) => { z += net.w2[i] * hh; });
  return { hs, p: sig(z) };
}
function trainEpoch(net: Net, lr: number) {
  const gw1 = net.w1.map(() => [0, 0]);
  const gb1 = new Array(net.h).fill(0);
  const gw2 = new Array(net.h).fill(0);
  let gb2 = 0;
  TRAIN.forEach(pt => {
    const { hs, p } = forward(net, pt.x, pt.y);
    const err = p - pt.label;
    gb2 += err;
    hs.forEach((hh, i) => {
      gw2[i] += err * hh;
      const d = err * net.w2[i] * (1 - hh * hh);
      gw1[i][0] += d * pt.x;
      gw1[i][1] += d * pt.y;
      gb1[i] += d;
    });
  });
  const n = TRAIN.length;
  net.w1.forEach((w, i) => { w[0] -= (lr * gw1[i][0]) / n; w[1] -= (lr * gw1[i][1]) / n; });
  net.b1.forEach((_, i) => { net.b1[i] -= (lr * gb1[i]) / n; });
  net.w2.forEach((_, i) => { net.w2[i] -= (lr * gw2[i]) / n; });
  net.b2 -= (lr * gb2) / n;
}

const MD = `
## 인공 신경망 — 직선으로 안 되면 곡선으로
- 로지스틱 회귀(직선 경계)로는 가운데 동그라미를 절대 못 가릅니다. **은닉층**을 끼우면 곡선 경계가 됩니다. 이게 07-1절의 패션 아이템 실험입니다.
- 은닉 유닛 수를 0으로 두면 로지스틱 회귀로 퇴화합니다. 2→4→8로 늘리며 경계가 동그라미를 감싸는 걸 보세요.
- 책의 코드: \`MLPClassifier(hidden_layer_sizes=(...))\` → 케라스에서는 \`Dense\` 층을 쌓습니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlMlp extends w.HTMLElement {
    private h = 4;
    private net: Net = initNet(4);
    private epoch = 0;

    private acc(data: Pt[]): number {
      let ok = 0;
      data.forEach(p => {
        if ((forward(this.net, p.x, p.y).p >= 0.5 ? 1 : 0) === p.label) ok++;
      });
      return ok / data.length;
    }

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#mm-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      const px = (x: number) => ((x + DOMAIN) / (2 * DOMAIN)) * W;
      const py = (y: number) => H - ((y + DOMAIN) / (2 * DOMAIN)) * H;
      if (ctx) {
        if (this.h === 0) {
          ctx.clearRect(0, 0, W, H);
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = '#64748b';
          ctx.font = '12px sans-serif';
          ctx.fillText('은닉 유닛 0 = 직선만 그을 수 있음', 60, H / 2 - 10);
          ctx.fillText('(동그라미는 절대 못 가름)', 70, H / 2 + 10);
        } else {
          const G = 52;
          for (let i = 0; i < G; i++) {
            for (let j = 0; j < G; j++) {
              const x = ((i + 0.5) / G) * 2 * DOMAIN - DOMAIN;
              const y = ((j + 0.5) / G) * 2 * DOMAIN - DOMAIN;
              ctx.fillStyle = forward(this.net, x, y).p >= 0.5 ? '#dbeafe' : '#fef3c7';
              ctx.fillRect((i / G) * W, H - ((j + 1) / G) * H, W / G, H / G);
            }
          }
        }
        const drawPts = (pts: Pt[], r: number, alpha: number) => {
          pts.forEach(p => {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.label === 1 ? '#3b82c4' : '#f59e0b';
            ctx.beginPath();
            ctx.arc(px(p.x), py(p.y), r, 0, Math.PI * 2);
            ctx.fill();
          });
          ctx.globalAlpha = 1;
        };
        drawPts(TEST, 2.5, 0.45);
        drawPts(TRAIN, 3.5, 1);
      }
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mm-h-val', String(this.h));
      setText('#mm-stat', this.h === 0
        ? '유닛 0개: 직선 경계로는 동그라미를 못 가름'
        : `에포크 ${this.epoch} · 훈련 ${(this.acc(TRAIN)).toFixed(3)} · 테스트 ${(this.acc(TEST)).toFixed(3)}`);
    }

    @addEventListener('#mm-h', 'input')
    onH(e: Event) {
      this.h = Number((e.target as HTMLInputElement).value);
      this.net = initNet(this.h);
      this.epoch = 0;
      this.refresh();
    }
    @addEventListener('#mm-train', 'click')
    onTrain() {
      if (this.h === 0) { this.refresh(); return; }
      for (let i = 0; i < 200; i++) trainEpoch(this.net, 0.5);
      this.epoch += 200;
      this.refresh();
    }
    @addEventListener('#mm-reset', 'click')
    onReset() { this.net = initNet(this.h); this.epoch = 0; this.refresh(); }

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
          .ctl b { min-width:40px; text-align:right; color:#1e293b; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .mm-btns { display:flex; gap:6px; justify-content:center; margin-top:8px; }
          .mm-btns button { padding:6px 14px; border-radius:16px; border:1.5px solid #14532d; background:#f0fdf4; color:#14532d; font-size:12px; font-weight:800; cursor:pointer; }
          .mm-stat { text-align:center; font-size:12px; font-weight:700; color:#1e293b; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:8px; font-family:monospace; }
          .mm-legend { display:flex; gap:12px; justify-content:center; font-size:11px; color:#64748b; margin-top:6px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
        </style>

        <div class="mm-def">
          <div><b>정의</b> 입력과 출력 사이에 은닉층을 끼워 곡선 경계를 만드는 신경망이다.</div>
          <div><b>언제</b> 직선 하나로 갈라지지 않는 데이터일 때 쓴다.</div>
          <div><b>예시</b> 패션 아이템 분류, 동그라미 경계, 곡선 분리 문제</div>
        </div>
        <div class="mm-intro">
          파랑 동그라미를 주황 바깥과 가르는 문제입니다. 유닛 0개로 훈련을 눌러보세요 — <b>직선으로는 절대 안 됩니다</b>. 유닛을 늘리고 훈련하면 동그라미가 잡힙니다.
        </div>

        <div class="ctl"><label>은닉 유닛 <input id="mm-h" type="range" min="0" max="8" step="2" value="${this.h}"><b id="mm-h-val">${this.h}</b></label></div>
        <div class="mm-btns">
          <button id="mm-train">+200 에포크 훈련</button>
          <button id="mm-reset">↺ 리셋</button>
        </div>
        <canvas id="mm-canvas" width="${W}" height="${H}"></canvas>
        <div class="mm-legend"><span><span style="color:#3b82c4">●</span> 안쪽</span><span><span style="color:#f59e0b">●</span> 바깥</span><span>연한 점 = 테스트</span></div>
        <div class="mm-stat" id="mm-stat"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
