import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-rnn';

const WORDS = ['로봇', '이', '사과', '를', '집었다'];
const EMB: [number, number][] = [[0.9, 0.2], [0.1, 0.9], [0.8, 0.7], [0.2, 0.3], [0.7, 0.1]];
const HDIM = 3;
// 고정 가중치 (시연용 상수)
const WXH = [[0.8, -0.4, 0.5], [0.3, 0.9, -0.6]];
const WHH = [[0.5, 0.1, -0.2], [0.1, 0.6, 0.2], [-0.1, 0.2, 0.5]];
const BH = [0.1, -0.1, 0.05];
const WHO = [[0.9, 0.2, -0.5, 0.4, 0.7], [-0.3, 0.8, 0.6, 0.1, -0.2], [0.4, -0.4, 0.7, 0.5, 0.3]];

function step(h: number[], wi: number): number[] {
  return h.map((_, i) =>
    Math.tanh(WXH[0][i] * EMB[wi][0] + WXH[1][i] * EMB[wi][1] + h[0] * WHH[0][i] + h[1] * WHH[1][i] + h[2] * WHH[2][i] + BH[i]));
}
function predict(h: number[]): { word: string; p: number }[] {
  const z = WORDS.map((_, k) => h[0] * WHO[0][k] + h[1] * WHO[1][k] + h[2] * WHO[2][k]);
  const m = Math.max(...z);
  const e = z.map(v => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return WORDS.map((word, k) => ({ word, p: e[k] / s })).sort((a, b) => b.p - a.p);
}

const MD = `
## 순환 신경망 — 펼쳐 놓은 셀
- **같은 셀**을 단어마다 되돌려 씁니다(가중치 공유). 은닉 상태(h)가 앞말 기억을 들고 다음 셀로 넘어갑니다.
- 위에서 스텝을 밟으면 은닉 막대 3개가 단어마다 바뀌고, 다음 단어 예측이 따라 바뀝니다. 펼치면(unfold) 층이 깊은 신경망과 같은 모양입니다.
- 약점: 앞말 기억이 멀리 못 갑니다. 그래서 **LSTM·GRU**(다음 탭)가 문을 달아 기억을 지키게 했습니다.
- 책의 코드: \`SimpleRNN\` → 셀 가중치·입출력 차원 확인이 09-1절 실습입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlRnn extends w.HTMLElement {
    private t = 0;
    private h: number[] = [0, 0, 0];

    private refresh() {
      const box = this.shadowRoot?.querySelector('#mr-cells') as HTMLElement;
      if (box) {
        box.innerHTML = WORDS.map((wd, i) => {
          const done = i < this.t;
          const cur = i === this.t - 1;
          return `<div class="mr-cell${done ? ' done' : ''}${cur ? ' cur' : ''}">${wd}<small>${i < this.t ? '✓' : `t=${i}`}</small></div>`;
        }).join('');
      }
      const bars = this.shadowRoot?.querySelector('#mr-hid') as HTMLElement;
      if (bars) {
        bars.innerHTML = this.h.map((v, i) => {
          const pct = Math.round(((v + 1) / 2) * 100);
          return `<div class="mr-barrow"><span>h${i}</span><div class="mr-track"><span class="mr-fill" style="width:${pct}%"></span></div><b>${v.toFixed(2)}</b></div>`;
        }).join('');
      }
      const preds = this.t > 0 ? predict(this.h).slice(0, 2) : [];
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mr-next', this.t === 0
        ? '스텝을 밟아 단어를 먹여보세요'
        : `다음 단어 예측: ${preds.map(p => `${p.word}(${(p.p * 100).toFixed(0)}%)`).join(' · ')}`);
      setText('#mr-step-val', `${Math.min(this.t, WORDS.length)}/${WORDS.length} 단어`);
      const btn = this.shadowRoot?.querySelector('#mr-next-btn') as HTMLButtonElement;
      if (btn) btn.disabled = this.t >= WORDS.length;
    }

    @addEventListener('#mr-next-btn', 'click')
    onNext() {
      if (this.t >= WORDS.length) return;
      this.h = step(this.h, this.t);
      this.t++;
      this.refresh();
    }
    @addEventListener('#mr-reset', 'click')
    onReset() { this.t = 0; this.h = [0, 0, 0]; this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .mr-cells { display:flex; gap:6px; margin-top:10px; }
          .mr-cell { flex:1; text-align:center; font-size:13px; font-weight:800; color:#94a3b8; background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:8px; padding:8px 2px; }
          .mr-cell small { display:block; font-size:10px; font-weight:600; }
          .mr-cell.done { color:#14532d; border-color:#86efac; background:#f0fdf4; }
          .mr-cell.cur { box-shadow:0 0 0 2px #4ade80; }
          .mr-barrow { display:flex; align-items:center; gap:6px; margin-top:6px; font-size:11.5px; font-weight:700; color:#475569; }
          .mr-barrow span:first-child { width:22px; }
          .mr-barrow b { width:48px; text-align:right; color:#1e293b; }
          .mr-track { flex:1; background:#f1f5f9; border-radius:4px; height:12px; }
          .mr-fill { display:block; height:100%; background:linear-gradient(90deg,#14532d,#4ade80); border-radius:4px; }
          .mr-next { text-align:center; font-size:12.5px; font-weight:700; color:#1e293b; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:10px; }
          .mr-btns { display:flex; gap:6px; justify-content:center; margin-top:8px; }
          .mr-btns button { padding:6px 14px; border-radius:16px; border:1.5px solid #14532d; background:#f0fdf4; color:#14532d; font-size:12px; font-weight:800; cursor:pointer; }
          .mr-btns button:disabled { opacity:0.35; cursor:default; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
        </style>

        <div class="mm-def">
          <div><b>정의</b> 같은 셀을 되돌려 쓰며 은닉 상태로 앞말 기억을 넘기는 순서용 신경망이다.</div>
          <div><b>언제</b> 순서가 있는 데이터를 다룰 때 쓴다.</div>
          <div><b>예시</b> 문장 처리, 시계열 주가, 센서 스트림</div>
        </div>
        <div class="mm-intro">
          문장 "로봇이 사과를 집었다"를 한 단어씩 먹입니다. <b>같은 셀</b>이 돌면서 은닉 상태 막대가 바뀌는 걸 보세요.
        </div>

        <div class="mr-cells" id="mr-cells"></div>
        <div id="mr-hid"></div>
        <div class="mr-next" id="mr-next"></div>
        <div style="text-align:center;font-size:11px;color:#64748b;margin-top:4px" id="mr-step-val"></div>
        <div class="mr-btns">
          <button id="mr-next-btn">다음 단어 →</button>
          <button id="mr-reset">↺ 리셋</button>
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
