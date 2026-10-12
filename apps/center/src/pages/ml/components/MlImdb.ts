import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-imdb';

const W = 340, H = 190;

type Word = { t: string; x: number; y: number; s: number };
const VOCAB: Word[] = [
  { t: '재밌다', x: 7.5, y: 7, s: 1.4 },
  { t: '최고', x: 8, y: 5.5, s: 1.6 },
  { t: '감동', x: 7, y: 8, s: 1.2 },
  { t: '훌륭', x: 8.2, y: 7.5, s: 1.3 },
  { t: '별로', x: 2, y: 3, s: -1.3 },
  { t: '지루함', x: 1.5, y: 4, s: -1.5 },
  { t: '실망', x: 2.5, y: 2, s: -1.2 },
  { t: '노잼', x: 1.2, y: 5, s: -1.4 },
  { t: '배우', x: 5, y: 5, s: 0.2 },
  { t: '이야기', x: 4.5, y: 6, s: 0.1 },
  { t: '장면', x: 5.5, y: 4, s: -0.1 },
  { t: '음악', x: 4, y: 4.5, s: 0.3 },
];

const REVIEWS: { label: string; words: string[] }[] = [
  { label: '리뷰 1: "배우 최고 감동"', words: ['배우', '최고', '감동'] },
  { label: '리뷰 2: "별로 지루함 실망"', words: ['별로', '지루함', '실망'] },
  { label: '리뷰 3: "이야기 별로 배우 최고"', words: ['이야기', '별로', '배우', '최고'] },
];

const MD = `
## IMDB 리뷰 분류 — 단어 임베딩
- 단어를 숫자로 바꾸는 게 **토큰화**, 자주 쓰는 N개만 남기고 길이를 맞추는 게 **패딩**입니다(\`num_words\`, \`pad_sequences\`).
- **임베딩**은 단어를 의미 벡터로 바꾸는 층입니다. 위 그림처럼 긍정은 오른쪽 위, 부정은 왼쪽 아래에 모입니다.
- 리뷰 점수는 단어 점수 평균을 시그모이드에 넣은 것(실제는 LSTM이 순서까지 봅니다). 리뷰 3처럼 긍·부정이 섞이면 확률이 0.5 근처로 흔들립니다.
- 책의 코드: \`Tokenizer(num_words=...)\` → \`pad_sequences\` → \`Embedding\` → \`LSTM\` → \`Dense(sigmoid)\`
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlImdb extends w.HTMLElement {
    private ri = 0;

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#mi-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      const px = (x: number) => (x / 10) * W;
      const py = (y: number) => H - (y / 10) * H;
      const rev = REVIEWS[this.ri];
      const used = new Set(rev.words);
      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);
        VOCAB.forEach(wd => {
          const on = used.has(wd.t);
          ctx.fillStyle = wd.s > 0.5 ? '#3b82c4' : wd.s < -0.5 ? '#f59e0b' : '#94a3b8';
          ctx.globalAlpha = on ? 1 : 0.35;
          ctx.font = `${on ? 'bold' : ''} ${on ? 13 : 11}px sans-serif`;
          ctx.fillText(wd.t, px(wd.x) - 14, py(wd.y));
          if (on) {
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px(wd.x) + 8, py(wd.y) - 4, 16, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = 1;
          }
          ctx.globalAlpha = 1;
        });
      }
      let sum = 0;
      rev.words.forEach(t => {
        sum += VOCAB.find(v => v.t === t)?.s ?? 0;
      });
      const avg = sum / rev.words.length;
      const prob = 1 / (1 + Math.exp(-avg * 1.5));
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      const bars = this.shadowRoot?.querySelector('#mi-bars') as HTMLElement;
      if (bars) {
        bars.innerHTML = rev.words.map(t => {
          const s = VOCAB.find(v => v.t === t)?.s ?? 0;
          const pct = Math.min(100, Math.abs(s) * 55);
          return `<div class="mi-barrow"><span>${t}</span><div class="mi-track"><span class="mi-fill${s < 0 ? ' neg' : ''}" style="width:${pct}%"></span></div><b>${s > 0 ? '+' : ''}${s.toFixed(1)}</b></div>`;
        }).join('');
      }
      setText('#mi-prob', `긍정 확률 ${(prob * 100).toFixed(0)}% → ${prob >= 0.5 ? '긍정 리뷰' : '부정 리뷰'} (평균 ${avg >= 0 ? '+' : ''}${avg.toFixed(2)} → 시그모이드)`);
      this.shadowRoot?.querySelectorAll('.mi-rbtn').forEach(el =>
        (el as HTMLElement).classList.toggle('active', Number((el as HTMLElement).dataset.i) === this.ri));
    }

    @addEventListener('.mi-rbtn', 'click', { delegate: true })
    onR(e: Event) {
      const btn = (e.target as HTMLElement).closest('.mi-rbtn') as HTMLElement;
      if (!btn) return;
      this.ri = Number(btn.dataset.i);
      this.refresh();
    }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .mi-rbtns { display:flex; gap:6px; justify-content:center; margin-top:8px; flex-wrap:wrap; }
          .mi-rbtn { padding:6px 12px; border-radius:16px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:12px; font-weight:700; cursor:pointer; }
          .mi-rbtn.active { background:#14532d; color:#fff; border-color:#14532d; }
          .mi-barrow { display:flex; align-items:center; gap:6px; margin-top:6px; font-size:11.5px; font-weight:700; color:#475569; }
          .mi-barrow span:first-child { width:52px; }
          .mi-barrow b { width:44px; text-align:right; color:#1e293b; }
          .mi-track { flex:1; background:#f1f5f9; border-radius:4px; height:12px; }
          .mi-fill { display:block; height:100%; background:#3b82c4; border-radius:4px; }
          .mi-fill.neg { background:#f59e0b; }
          .mi-prob { text-align:center; font-size:12.5px; font-weight:800; color:#14532d; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:10px; }
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
          <div><b>정의</b> 단어를 의미 벡터(임베딩)로 바꿔서 리뷰 전체의 긍·부정을 가리는 감성 분류이다.</div>
          <div><b>언제</b> 텍스트가 긍정인지 부정인지 가릴 때 쓴다.</div>
          <div><b>예시</b> 리뷰 분석, 댓글 필터, 별점 예측</div>
        </div>
        <div class="mm-intro">
          12개 단어의 의미 지도입니다. 리뷰를 고르면 <b>쓰인 단어가 동그라미</b>로 표시되고, 점수 막대 합으로 긍·부정을 판정합니다.
        </div>

        <div class="mi-rbtns">
          ${REVIEWS.map((r, i) => `<button class="mi-rbtn" data-i="${i}">${r.label.split(':')[0]}</button>`).join('')}
        </div>
        <canvas id="mi-canvas" width="${W}" height="${H}"></canvas>
        <div class="mm-legend"><span><span style="color:#3b82c4">●</span> 긍정 단어</span><span><span style="color:#f59e0b">●</span> 부정 단어</span><span>○ 사용된 단어</span></div>
        <div id="mi-bars"></div>
        <div class="mi-prob" id="mi-prob"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
