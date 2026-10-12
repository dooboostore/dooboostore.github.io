import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-lstm';

const W = 340;
const CAND = [0.9, 0.2, 0.8, 0.4];
const WORDS = ['로봇', '이', '사과', '를'];

const MD = `
## LSTM과 GRU — 기억을 지키는 문
- RNN은 앞말 기억이 멀리 못 갑니다. LSTM은 **망각 게이트**(낡은 기억 지우기), **입력 게이트**(새 기억 쓰기), **출력 게이트**(내보내기)로 셀 상태를 지킵니다.
- 위에서 망각을 0으로 두면 옛 기억이 그대로 남고, 1로 두면 매 스텝 새 후보로 덮습니다. 입력 게이트를 닫으면(0) 새 단어가 안 들어갑니다.
- **GRU**는 문을 2개(리셋·업데이트)로 줄인 경량판입니다. 층 사이에 **드롭아웃**을 끼우고 층을 2개 쌓으면(7-3절처럼) 성능이 오릅니다.
- 책의 코드: \`LSTM(...)\` → \`GRU(...)\` → 층 연결 → \`Dropout\`
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlLstm extends w.HTMLElement {
    private fg = 0.5;
    private ig = 0.8;
    private og = 0.9;
    private t = 0;
    private c = 0;

    private refresh() {
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#ml-fg-val', this.fg.toFixed(1));
      setText('#ml-ig-val', this.ig.toFixed(1));
      setText('#ml-og-val', this.og.toFixed(1));
      setText('#ml-step-val', `${Math.min(this.t, WORDS.length)}/${WORDS.length} 단어`);
      const bar = (sel: string, v: number) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.style.width = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
      };
      const h = this.og * Math.tanh(this.c);
      bar('#ml-bar-c', this.c);
      bar('#ml-bar-h', (h + 1) / 2);
      setText('#ml-c-val', this.c.toFixed(2));
      setText('#ml-h-val', h.toFixed(2));
      const cells = this.shadowRoot?.querySelector('#ml-cells') as HTMLElement;
      if (cells) {
        cells.innerHTML = WORDS.map((wd, i) =>
          `<div class="ml-cell${i < this.t ? ' done' : ''}${i === this.t - 1 ? ' cur' : ''}">${wd}</div>`).join('');
      }
      const btn = this.shadowRoot?.querySelector('#ml-next') as HTMLButtonElement;
      if (btn) btn.disabled = this.t >= WORDS.length;
      const hint = this.shadowRoot?.querySelector('#ml-hint') as HTMLElement;
      if (hint) {
        hint.textContent = this.t === 0
          ? '다음 단어 버튼을 눌러보세요. 셀 상태 막대가 게이트대로 움직입니다'
          : this.fg < 0.2
            ? '망각 ≈ 0: 옛 기억을 꽉 쥐고 있어 셀이 잘 안 변합니다'
            : this.fg > 0.8 && this.ig > 0.8
              ? '망각·입력 모두 열림: 매번 새 후보로 덮어써 RNN처럼 됩니다'
              : this.ig < 0.2
                ? '입력 ≈ 0: 새 단어가 안 들어가 셀이 그대로입니다'
                : `셀 ${this.c.toFixed(2)} → 출력 ${h.toFixed(2)} (출력 게이트 ${this.og.toFixed(1)})`;
      }
    }

    private clamp(v: number) { return Math.max(0, Math.min(1, v)); }

    @addEventListener('#ml-fg', 'input')
    onFg(e: Event) { this.fg = this.clamp(Number((e.target as HTMLInputElement).value)); this.refresh(); }
    @addEventListener('#ml-ig', 'input')
    onIg(e: Event) { this.ig = this.clamp(Number((e.target as HTMLInputElement).value)); this.refresh(); }
    @addEventListener('#ml-og', 'input')
    onOg(e: Event) { this.og = this.clamp(Number((e.target as HTMLInputElement).value)); this.refresh(); }
    @addEventListener('#ml-next', 'click')
    onNext() {
      if (this.t >= WORDS.length) return;
      this.c = this.fg * this.c + this.ig * CAND[this.t];
      this.t++;
      this.refresh();
    }
    @addEventListener('#ml-reset', 'click')
    onReset() { this.t = 0; this.c = 0; this.refresh(); }

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
          .ml-cells { display:flex; gap:6px; margin-top:10px; }
          .ml-cell { flex:1; text-align:center; font-size:13px; font-weight:800; color:#94a3b8; background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:8px; padding:8px 2px; }
          .ml-cell.done { color:#14532d; border-color:#86efac; background:#f0fdf4; }
          .ml-cell.cur { box-shadow:0 0 0 2px #4ade80; }
          .ml-barwrap { margin-top:10px; }
          .ml-barrow { display:flex; align-items:center; gap:6px; margin-top:6px; font-size:11.5px; font-weight:700; color:#475569; }
          .ml-barrow span:first-child { width:86px; flex-shrink:0; }
          .ml-barrow b { width:48px; text-align:right; color:#1e293b; }
          .ml-track { flex:1; background:#f1f5f9; border-radius:4px; height:14px; }
          .ml-fill { display:block; height:100%; background:linear-gradient(90deg,#14532d,#4ade80); border-radius:4px; transition:width .15s; }
          .ml-hint { text-align:center; font-size:12px; font-weight:700; color:#14532d; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:10px; }
          .ml-btns { display:flex; gap:6px; justify-content:center; margin-top:8px; }
          .ml-btns button { padding:6px 14px; border-radius:16px; border:1.5px solid #14532d; background:#f0fdf4; color:#14532d; font-size:12px; font-weight:800; cursor:pointer; }
          .ml-btns button:disabled { opacity:0.35; cursor:default; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
        </style>

        <div class="mm-def">
          <div><b>정의</b> 망각·입력·출력 게이트로 셀 상태를 지켜 긴 기억을 잇는 순환 신경망이다.</div>
          <div><b>언제</b> 긴 문맥을 기억해야 할 때 쓴다.</div>
          <div><b>예시</b> 번역, 챗봇, GRU 경량판</div>
        </div>
        <div class="mm-intro">
          LSTM 셀 1개의 속을 들여다봅니다. <b>망각·입력·출력</b> 문 3개를 움직이며 셀 상태 막대가 어떻게 되는지 보세요.
        </div>

        <div class="ctl"><label>망각 게이트 <input id="ml-fg" type="range" min="0" max="1" step="0.1" value="${this.fg}"><b id="ml-fg-val"></b></label></div>
        <div class="ctl"><label>입력 게이트 <input id="ml-ig" type="range" min="0" max="1" step="0.1" value="${this.ig}"><b id="ml-ig-val"></b></label></div>
        <div class="ctl"><label>출력 게이트 <input id="ml-og" type="range" min="0" max="1" step="0.1" value="${this.og}"><b id="ml-og-val"></b></label></div>
        <div class="ml-cells" id="ml-cells"></div>
        <div class="ml-barwrap">
          <div class="ml-barrow"><span>셀 상태 c</span><div class="ml-track"><span class="ml-fill" id="ml-bar-c"></span></div><b id="ml-c-val"></b></div>
          <div class="ml-barrow"><span>출력 h</span><div class="ml-track"><span class="ml-fill" id="ml-bar-h"></span></div><b id="ml-h-val"></b></div>
        </div>
        <div style="text-align:center;font-size:11px;color:#64748b;margin-top:4px" id="ml-step-val"></div>
        <div class="ml-btns">
          <button id="ml-next">다음 단어 →</button>
          <button id="ml-reset">↺ 리셋</button>
        </div>
        <div class="ml-hint" id="ml-hint"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
