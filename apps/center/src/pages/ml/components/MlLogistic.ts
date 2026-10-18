import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-logistic';

const W = 340, H = 230;

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
    const p = 1 / (1 + Math.exp(-(1.5 * (x - 5))));
    pts.push({ x, y: r() < p ? 1 : 0 });
  }
  return pts.sort((a, b) => a.x - b.x);
}
const DATA = genData();
const sig = (z: number) => 1 / (1 + Math.exp(-z));

const MD = `
## 로지스틱 회귀 — 이름과 달리 분류
- 직선이 아니라 **시그모이드 곡선**으로 "1일 확률"을 예측합니다. 0.5를 넘으면 양성, 못 넘으면 음성.
- 출력이 확률이라 **럭키백 당첨 확률** 같은 문제에 쓰고, \`predict_proba()\`로 확률 자체를 꺼낼 수 있습니다.
- w(기울기)가 크면 가파른 경계, 임계값(threshold)을 올리면 양성을 깐깐하게 봅니다. "최적핏"은 경사 하강법으로 w, b를 맞춘 것(다음 탭 SGD).
- 책의 코드: \`LogisticRegression()\` → \`fit()\` → \`predict()\` / \`predict_proba()\`
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlLogistic extends w.HTMLElement {
    private wv = 0.5;
    private bv = -2;
    private thr = 0.5;

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#mg-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      const XMIN = -0.5, XMAX = 10.5;
      const px = (x: number) => ((x - XMIN) / (XMAX - XMIN)) * W;
      const py = (p: number) => 12 + (1 - p) * (H - 24);
      let correct = 0;
      const cm = [0, 0, 0, 0]; // TN, FP, FN, TP
      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#cbd5e1';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(0, py(this.thr)); ctx.lineTo(W, py(this.thr));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#64748b';
        ctx.font = '10px sans-serif';
        ctx.fillText(`임계값 ${this.thr.toFixed(2)}`, 8, py(this.thr) - 4);
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
          const prob = sig(this.wv * p.x + this.bv);
          const pred = prob >= this.thr ? 1 : 0;
          const ok = pred === p.y;
          if (ok) correct++;
          cm[p.y * 2 + pred]++;
          ctx.fillStyle = ok ? (p.y === 1 ? '#3b82c4' : '#f59e0b') : '#ef4444';
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y === 1 ? 0.93 : 0.07), ok ? 4 : 5, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mg-w-val', this.wv.toFixed(2));
      setText('#mg-b-val', this.bv.toFixed(2));
      setText('#mg-thr-val', this.thr.toFixed(2));
      setText('#mg-acc', `정확도 ${(correct / DATA.length).toFixed(3)} · 빨간 점=${DATA.length - correct}개 틀림 (TN ${cm[0]} FP ${cm[1]} FN ${cm[2]} TP ${cm[3]})`);
    }

    @addEventListener('#mg-w', 'input')
    onW(e: Event) { this.wv = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#mg-b', 'input')
    onB(e: Event) { this.bv = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#mg-thr', 'input')
    onThr(e: Event) { this.thr = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#mg-opt', 'click')
    onOpt() {
      let w = 0, b = 0;
      for (let it = 0; it < 600; it++) {
        let dw = 0, db = 0;
        DATA.forEach(p => {
          const err = sig(w * p.x + b) - p.y;
          dw += err * p.x; db += err;
        });
        w -= 0.3 * dw / DATA.length;
        b -= 0.3 * db / DATA.length;
      }
      this.wv = Math.round(w * 100) / 100;
      this.bv = Math.round(b * 100) / 100;
      const set = (sel: string, v: number) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLInputElement;
        if (el) el.value = String(v);
      };
      set('#mg-w', this.wv);
      set('#mg-b', this.bv);
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
          .ctl b { min-width:48px; text-align:right; color:#1e293b; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .mg-btn { display:block; margin:8px auto; padding:7px 18px; border-radius:16px; border:1.5px solid #14532d; background:#f0fdf4; color:#14532d; font-size:12px; font-weight:800; cursor:pointer; }
          .mg-acc { text-align:center; font-size:12px; font-weight:700; color:#1e293b; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 10px; margin-top:8px; font-family:monospace; }
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
  <div><b>정의</b> 로지스틱 회귀는 시그모이드 곡선으로 1일 확률을 내어 예/아니오를 가르는 분류 방법입니다.</div>
  <div><b>언제</b> 예/아니오 판단과 확률 값이 함께 필요할 때 씁니다.</div>
  <div><b>예시</b> 스팸, 럭키백, 이탈 예측</div>
</div>
<div class="mm-intro">
          럭키백 문제(04-1) 축소판입니다. 초록 곡선이 <b>당첨 확률</b>, 점선이 당첨/꽝을 가르는 임계값입니다. 틀린 점은 빨갛게 표시됩니다.
        </div>

        <div class="ctl"><label>기울기 w <input id="mg-w" type="range" min="-1" max="4" step="0.1" value="${this.wv}"><b id="mg-w-val"></b></label></div>
        <div class="ctl"><label>절편 b <input id="mg-b" type="range" min="-12" max="6" step="0.5" value="${this.bv}"><b id="mg-b-val"></b></label></div>
        <div class="ctl"><label>임계값 <input id="mg-thr" type="range" min="0.1" max="0.9" step="0.05" value="${this.thr}"><b id="mg-thr-val"></b></label></div>
        <button class="mg-btn" id="mg-opt">최적핏 (경사 하강법 600회)</button>
        <canvas id="mg-canvas" width="${W}" height="${H}"></canvas>
        <div class="mm-legend"><span><span style="color:#3b82c4">●</span> 당첨</span><span><span style="color:#f59e0b">●</span> 꽝</span><span><span style="color:#ef4444">●</span> 오분류</span></div>
        <div class="mg-acc" id="mg-acc"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
