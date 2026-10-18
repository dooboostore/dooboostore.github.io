import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-trainnn';

const W = 340, H = 200;

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
function gen(n: number, seed: number): Pt[] {
  const r = mulberry(seed);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const x = -3 + 6 * r();
    pts.push({ x, y: Math.sin(x) * 1.5 + (r() - 0.5) * 1.6 });
  }
  return pts;
}
const TRAIN = gen(15, 61);
const VAL = gen(15, 62);

const WIDTH = 16;
type Net = { w1: number[][]; b1: number[]; w2: number[]; b2: number };

function initNet(): Net {
  const r = mulberry(777);
  return {
    w1: Array.from({ length: WIDTH }, () => [randn(r) * 0.7, randn(r) * 0.7]),
    b1: Array.from({ length: WIDTH }, () => 0),
    w2: Array.from({ length: WIDTH }, () => randn(r) * 0.7),
    b2: 0,
  };
}
function forward(net: Net, x: number, train: boolean, r: () => number, drop: number): number {
  let z = net.b2;
  for (let i = 0; i < WIDTH; i++) {
    const h = Math.tanh(net.w1[i][0] * x + net.b1[i]);
    const m = train && drop > 0 ? (r() < drop ? 0 : 1 / (1 - drop)) : 1;
    z += net.w2[i] * h * m;
  }
  return z;
}
/** 드롭아웃 포함 한 에포크 (full-batch) */
function trainEpoch(net: Net, drop: number, r: () => number) {
  const gw1 = net.w1.map(() => [0, 0]);
  const gb1 = new Array(WIDTH).fill(0);
  const gw2 = new Array(WIDTH).fill(0);
  let gb2 = 0;
  TRAIN.forEach(pt => {
    const masks: number[] = [];
    for (let i = 0; i < WIDTH; i++) {
      masks.push(drop > 0 ? (r() < drop ? 0 : 1 / (1 - drop)) : 1);
    }
    const hs = net.w1.map((w, i) => Math.tanh(w[0] * pt.x + net.b1[i]));
    let out = net.b2;
    hs.forEach((h, i) => { out += net.w2[i] * h * masks[i]; });
    const err = ((out - pt.y) * 2) / TRAIN.length;
    gb2 += err;
    hs.forEach((h, i) => {
      gw2[i] += err * h * masks[i];
      const d = err * net.w2[i] * masks[i] * (1 - h * h);
      gw1[i][0] += d * pt.x;
      gb1[i] += d;
    });
  });
  net.w1.forEach((w, i) => { w[0] -= 0.05 * gw1[i][0]; w[1] -= 0.05 * gw1[i][1]; });
  net.b1.forEach((_, i) => { net.b1[i] -= 0.05 * gb1[i]; });
  net.w2.forEach((_, i) => { net.w2[i] -= 0.05 * gw2[i]; });
  net.b2 -= 0.05 * gb2;
}

const MD = `
## 신경망 모델 훈련 — 모범 사례 4종
- **손실 곡선**을 봅니다. 훈련 손실은 떨어지는데 검증 손실이 올라가면 과대적합 신호입니다.
- **검증 손실**이 최소일 때 멈추는 게 **조기 종료**입니다. 위에서 드롭아웃 0으로 끝까지 돌리면 벌어지는 걸 보세요.
- **드롭아웃**은 훈련 때 뉴런을 랜덤으로 끄는 것(여기서는 은닉 유닛). 매번 다른 부분망이 학습돼서 외우기가 어려워집니다.
- **콜백**이 이 과정을 자동화합니다. \`ModelCheckpoint\`는 최상의 검증 점수 모델을 저장하고, \`EarlyStopping\`은 n번 안 좋아지면 멈춥니다.
- 책의 코드: \`Dropout(0.3)\` 층 추가 → \`callbacks=[ModelCheckpoint(...), EarlyStopping(...)]\` → \`fit()\`
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlTrainNN extends w.HTMLElement {
    private net: Net = initNet();
    private drop = 0.3;
    private epoch = 0;
    private trHist: number[] = [];
    private vaHist: number[] = [];
    private timer: any = null;

    private losses(): [number, number] {
      const r = mulberry(1);
      const t = TRAIN.reduce((s, p) => s + (forward(this.net, p.x, false, r, 0) - p.y) ** 2, 0) / TRAIN.length;
      const v = VAL.reduce((s, p) => s + (forward(this.net, p.x, false, r, 0) - p.y) ** 2, 0) / VAL.length;
      return [t, v];
    }

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#mt-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, W, H);
        const all = this.trHist.concat(this.vaHist);
        if (all.length > 1) {
          const mx = Math.max(...all), mn = Math.min(...all);
          const draw = (hist: number[], color: string) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            hist.forEach((v, i) => {
              const X = 8 + ((W - 16) * i) / 119;
              const Y = H - 8 - ((v - mn) / (mx - mn || 1)) * (H - 16);
              i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
            });
            ctx.stroke();
            ctx.lineWidth = 1;
          };
          draw(this.trHist, '#4ade80');
          draw(this.vaHist, '#f59e0b');
        } else {
          ctx.fillStyle = '#64748b';
          ctx.font = '11px sans-serif';
          ctx.fillText('훈련 버튼을 눌러보세요', 100, H / 2);
        }
        ctx.fillStyle = '#4ade80';
        ctx.fillText('— 훈련', 8, 12);
        ctx.fillStyle = '#f59e0b';
        ctx.fillText('— 검증', 60, 12);
      }
      const [t, v] = this.losses();
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mt-drop-val', this.drop.toFixed(1));
      setText('#mt-stat', `에포크 ${this.epoch} · 훈련 ${t.toFixed(3)} · 검증 ${v.toFixed(3)}${v > t * 1.8 && this.epoch > 60 ? ' ⚠ 과대적합!' : ''}`);
      const btn = this.shadowRoot?.querySelector('#mt-auto') as HTMLButtonElement;
      if (btn) btn.textContent = this.timer ? '⏸ 정지' : '▶ 자동 훈련';
    }

    private stop() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    }

    @addEventListener('#mt-drop', 'input')
    onDrop(e: Event) {
      this.drop = Number((e.target as HTMLInputElement).value);
      this.stop();
      this.net = initNet();
      this.epoch = 0;
      this.trHist = [];
      this.vaHist = [];
      this.refresh();
    }
    @addEventListener('#mt-auto', 'click')
    onAuto() {
      if (this.timer) { this.stop(); this.refresh(); return; }
      const r = mulberry(999);
      this.timer = setInterval(() => {
        if (!this.shadowRoot?.isConnected || this.epoch >= 600) { this.stop(); this.refresh(); return; }
        for (let i = 0; i < 3; i++) {
          trainEpoch(this.net, this.drop, r);
          this.epoch++;
          if (this.epoch % 5 === 0) {
            const [t, v] = this.losses();
            this.trHist.push(t);
            this.vaHist.push(v);
            if (this.trHist.length > 120) { this.trHist.shift(); this.vaHist.shift(); }
          }
        }
        this.refresh();
      }, 80);
      this.refresh();
    }
    @addEventListener('#mt-reset', 'click')
    onReset() {
      this.stop();
      this.net = initNet();
      this.epoch = 0;
      this.trHist = [];
      this.vaHist = [];
      this.refresh();
    }

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
          .mt-btns { display:flex; gap:6px; justify-content:center; margin-top:8px; }
          .mt-btns button { padding:6px 14px; border-radius:16px; border:1.5px solid #14532d; background:#f0fdf4; color:#14532d; font-size:12px; font-weight:800; cursor:pointer; }
          .mt-stat { text-align:center; font-size:12px; font-weight:700; color:#1e293b; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:8px; font-family:monospace; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
        </style>

        <div class="mm-def">
          <div><b>정의</b> 손실 곡선으로 과대적합을 살피고 드롭아웃·콜백으로 훈련을 관리하는 방법이다.</div>
          <div><b>언제</b> 신경망 훈련이 외우기만 하지 않게 관리할 때 쓴다.</div>
          <div><b>예시</b> 조기 종료, 체크포인트 저장, 드롭아웃 정규화</div>
        </div>
        <div class="mm-intro">
          초록=훈련, 주황=검증 손실입니다. 드롭아웃 0으로 끝까지 돌리면 <b>주황이 다시 올라가는</b> 게 보입니다. 0.3~0.5로 바꿔보세요.
        </div>

        <div class="ctl"><label>드롭아웃 <input id="mt-drop" type="range" min="0" max="0.7" step="0.1" value="${this.drop}"><b id="mt-drop-val"></b></label></div>
        <div class="mt-btns">
          <button id="mt-auto">▶ 자동 훈련</button>
          <button id="mt-reset">↺ 리셋</button>
        </div>
        <canvas id="mt-canvas" width="${W}" height="${H}"></canvas>
        <div class="mt-stat" id="mt-stat"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
