import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-sgd';

const W = 340, H = 300;
const TOP_H = 190;

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = { x: number; y: 0 | 1 };
function genData(): Pt[] {
  const r = mulberry(4);
  const pts: Pt[] = [];
  for (let i = 0; i < 40; i++) {
    const x = 10 * r();
    pts.push({ x, y: r() < 1 / (1 + Math.exp(-(1.5 * (x - 5)))) ? 1 : 0 });
  }
  return pts.sort((a, b) => a.x - b.x);
}
const DATA = genData();
const sig = (z: number) => 1 / (1 + Math.exp(-z));
const lossOf = (w: number, b: number) =>
  -DATA.reduce((s, p) => {
    const q = Math.min(1 - 1e-9, Math.max(1e-9, sig(w * p.x + b)));
    return s + (p.y * Math.log(q) + (1 - p.y) * Math.log(1 - q));
  }, 0) / DATA.length;

const MD = `
## 확률적 경사 하강법 — 조금씩 고치기
- 손실(loss)이 줄도록 w, b를 **기울기 반대 방향으로 조금씩** 옮깁니다. 전체가 아니라 **한 무더기(미니배치)씩** 보면 확률적(SGD)입니다.
- **학습률**이 크면 성큼성큼(발산 위험), 작으면 기어가듯(느림). 위에서 0.01과 1.0을 비교해보세요.
- **에포크** = 전체 데이터 한 바퀴. 에포크가 늘면 훈련 손실은 줄지만, 어느 순간 테스트가 나빠집니다(과대적합 — 다음 탭들의 주제).
- 책의 코드: \`SGDClassifier(loss='log_loss')\` → \`partial_fit()\` 반복 호출이 바로 이 버튼과 같습니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlSgd extends w.HTMLElement {
    private wv = 0;
    private bv = 0;
    private lr = 0.3;
    private epoch = 0;
    private losses: number[] = [];
    private timer: any = null;

    private grad(): [number, number] {
      let dw = 0, db = 0;
      DATA.forEach(p => {
        const err = sig(this.wv * p.x + this.bv) - p.y;
        dw += err * p.x; db += err;
      });
      return [dw / DATA.length, db / DATA.length];
    }

    private runEpochs(n: number) {
      for (let i = 0; i < n && this.epoch < 2000; i++) {
        const [dw, db] = this.grad();
        this.wv -= this.lr * dw;
        this.bv -= this.lr * db;
        this.epoch++;
        if (this.epoch % 5 === 0 || this.epoch <= 5) {
          this.losses.push(lossOf(this.wv, this.bv));
          if (this.losses.length > 120) this.losses.shift();
        }
      }
    }

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#mg-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      const XMIN = -0.5, XMAX = 10.5;
      const px = (x: number) => ((x - XMIN) / (XMAX - XMIN)) * W;
      const py = (p: number) => 10 + (1 - p) * (TOP_H - 20);
      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const x = XMIN + ((XMAX - XMIN) * i) / 120;
          const X = px(x), Y = py(sig(this.wv * x + this.bv));
          i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        DATA.forEach(p => {
          ctx.fillStyle = p.y === 1 ? '#3b82c4' : '#f59e0b';
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y === 1 ? 0.93 : 0.07), 3.5, 0, Math.PI * 2);
          ctx.fill();
        });
        const LH = H - TOP_H - 8, LY = TOP_H + 4;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, LY, W, LH);
        if (this.losses.length > 1) {
          const mx = Math.max(...this.losses);
          const mn = Math.min(...this.losses);
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          this.losses.forEach((v, i) => {
            const X = 6 + ((W - 12) * i) / 119;
            const Y = LY + LH - 4 - ((v - mn) / (mx - mn || 1)) * (LH - 8);
            i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
          });
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        ctx.fillStyle = '#94a3b8';
        ctx.font = '9px sans-serif';
        ctx.fillText('손실 곡선', 6, LY + 10);
      }
      let correct = 0;
      DATA.forEach(p => {
        if ((sig(this.wv * p.x + this.bv) >= 0.5 ? 1 : 0) === p.y) correct++;
      });
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mg-lr-val', this.lr.toFixed(2));
      setText('#mg-stat', `에포크 ${this.epoch} · 손실 ${this.losses.length ? this.losses[this.losses.length - 1].toFixed(3) : '-'} · 정확도 ${(correct / DATA.length).toFixed(3)}`);
      const btn = this.shadowRoot?.querySelector('#mg-auto') as HTMLButtonElement;
      if (btn) btn.textContent = this.timer ? '⏸ 정지' : '▶ 자동 학습';
    }

    private stop() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    }

    @addEventListener('#mg-lr', 'input')
    onLr(e: Event) { this.lr = Number((e.target as HTMLInputElement).value) / 100; this.refresh(); }
    @addEventListener('#mg-step', 'click')
    onStep() { this.runEpochs(50); this.refresh(); }
    @addEventListener('#mg-auto', 'click')
    onAuto() {
      if (this.timer) { this.stop(); this.refresh(); return; }
      this.timer = setInterval(() => {
        if (!this.shadowRoot?.isConnected || this.epoch >= 2000) { this.stop(); this.refresh(); return; }
        this.runEpochs(10);
        this.refresh();
      }, 100);
      this.refresh();
    }
    @addEventListener('#mg-reset', 'click')
    onReset() { this.stop(); this.wv = 0; this.bv = 0; this.epoch = 0; this.losses = []; this.refresh(); }

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
          .ctl b { min-width:48px; text-align:right; color:#1e293b; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .mg-btns { display:flex; gap:6px; justify-content:center; margin-top:8px; }
          .mg-btns button { padding:6px 14px; border-radius:16px; border:1.5px solid #14532d; background:#f0fdf4; color:#14532d; font-size:12px; font-weight:800; cursor:pointer; }
          .mg-stat { text-align:center; font-size:12px; font-weight:700; color:#1e293b; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:8px; font-family:monospace; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
        </style>

        <div class="mm-def">
  <div><b>정의</b> 손실이 줄도록 기울기 반대 방향으로 조금씩 가중치를 옮기는 최적화 방법으로, 전체가 아닌 한 무더기씩 보고 고칩니다.</div>
  <div><b>언제</b> 데이터가 커서 한 번에 다 볼 수 없을 때 씁니다.</div>
  <div><b>예시</b> 로지스틱 회귀 학습, 딥러닝 옵티마이저, partial_fit 반복 학습</div>
</div>
        <div class="mm-intro">
          w=0, b=0 납작한 곡선에서 시작합니다. <b>자동 학습</b>을 누르면 곡선이 일어나고 아래 손실 곡선이 떨어집니다. 학습률을 바꿔서 다시 해보세요.
        </div>

        <div class="ctl"><label>학습률 <input id="mg-lr" type="range" min="1" max="100" step="1" value="30"><b id="mg-lr-val"></b></label></div>
        <div class="mg-btns">
          <button id="mg-step">+50 에포크</button>
          <button id="mg-auto">▶ 자동 학습</button>
          <button id="mg-reset">↺ 리셋</button>
        </div>
        <canvas id="mg-canvas" width="${W}" height="${H}"></canvas>
        <div class="mg-stat" id="mg-stat"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
