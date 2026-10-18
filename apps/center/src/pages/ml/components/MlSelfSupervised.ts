import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-selfsupervised';

const QUIZ: { sent: string[]; answer: number; choices: string[]; why: string }[] = [
  {
    sent: ['로봇이', '[MASK]', '를 집었다'],
    answer: 1,
    choices: ['하늘', '사과', '달리기'],
    why: '앞뒤 문맥상 집을 수 있는 명사여야 합니다. 모델은 빈칸 맞히기를 수억 문장으로 연습하며 언어를 익힙니다 (BERT식).',
  },
  {
    sent: ['비가 와서 길이', '[MASK]'],
    answer: 0,
    choices: ['미끄럽다', '미끄럽고', '미끄러울'],
    why: '문장 흐름상 다음 토큰 예측이 Task입니다. 이렇게 다음 단어 맞히기만으로 언어를 배우는 게 GPT식입니다.',
  },
  {
    sent: ['이 식당 불고기', '[MASK]', '최고다'],
    answer: 2,
    choices: ['는', '를', '는 정말'],
    why: '조사 하나가 어색하면 문장 전체가 깨집니다. 라벨 없이 "원문 복원"이 정답지 역할을 합니다.',
  },
];

const EXAMPLES = [
  ['BERT (마스크 채우기)', '문장 구멍 뚫고 맞히기 → 문맥 이해'],
  ['GPT (다음 토큰)', '다음 단어 예측 반복 → 생성 능력'],
  ['MAE (이미지 복원)', '사진 75% 가리고 복원 → 시각 표현 학습'],
  ['SimCLR (대조)', '같은 사진 변형끼리는 가깝게, 남은 far → 표현 학습'],
  ['Word2Vec', '주변 단어로 중심 단어 예측 → 단어 벡터'],
  ['로봇 파운데이션', '대규모 로그+영상으로 사전학습 후 파인튜닝'],
];

const MD = `
## 자기지도 학습 — 문제도 정답도 스스로
- 라벨이 없습니다. 대신 **데이터 자체를 가려서 맞히기**를 시킵니다. 빈칸 채우기, 다음 단어 예측, 가린 패치 복원이 대표 문제입니다.
- 정답은 원본 데이터(가리기 전)라서 라벨 비용이 0원, 데이터는 인터넷用量으로 무한합니다. LLM·VLM 시대의 기본기입니다.
- 위 퀴즈가 바로 모델의 시험 문제입니다. 3개 다 맞히면 자기지도 학습의 원리를 이해한 겁니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlSelfSupervised extends w.HTMLElement {
    private idx = 0;
    private picked: number | null = null;
    private score = 0;
    private done = 0;

    private refresh() {
      const box = this.shadowRoot?.querySelector('#mq-box') as HTMLElement;
      if (box) {
        if (this.idx >= QUIZ.length) {
          box.innerHTML = `<div class="mq-final">🎉 ${QUIZ.length}문제 중 ${this.score}개 정답 — 자기지도 학습의 시험 문제를 다 풀었습니다</div>`;
        } else {
          const q = QUIZ[this.idx];
          box.innerHTML = `<div class="mq-sent">${q.sent.map(t =>
            t === '[MASK]' ? '<span class="mq-mask">?</span>' : t).join(' ')}</div>` +
            `<div class="mq-choices">${q.choices.map((c, i) =>
              `<button class="mq-choice${this.picked === i ? (i === q.answer ? ' ok' : ' no') : ''}" data-i="${i}" ${this.picked !== null ? 'disabled' : ''}>${c}</button>`).join('')}</div>` +
            (this.picked !== null
              ? `<div class="mq-why">${this.picked === q.answer ? '✅ 정답! ' : `❌ 정답은 "${q.choices[q.answer]}". `}${q.why}</div>
                 <button class="mq-next" id="mq-next">${this.idx + 1 < QUIZ.length ? '다음 문제 →' : '결과 보기'}</button>`
              : '');
        }
      }
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mq-score', `진행 ${Math.min(this.idx + 1, QUIZ.length)}/${QUIZ.length} · 정답 ${this.score}`);
    }

    @addEventListener('.mq-choice', 'click', { delegate: true })
    onChoice(e: Event) {
      const btn = (e.target as HTMLElement).closest('.mq-choice') as HTMLElement;
      if (!btn || this.picked !== null || this.idx >= QUIZ.length) return;
      this.picked = Number(btn.dataset.i);
      if (this.picked === QUIZ[this.idx].answer) this.score++;
      this.refresh();
    }

    @addEventListener('#mq-next', 'click')
    onNext() {
      if (this.picked === null) return;
      this.idx++;
      this.picked = null;
      this.done++;
      this.refresh();
    }

    @addEventListener('#mq-reset', 'click')
    onReset() { this.idx = 0; this.picked = null; this.score = 0; this.done = 0; this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const cards = EXAMPLES.map(e =>
        `<div class="ms-card"><b>${e[0]}</b><span>${e[1]}</span></div>`).join('');
      return `
        <style>
          :host { display:block; }
          .mq-score { text-align:center; font-size:12px; font-weight:800; color:#14532d; margin-top:8px; }
          .mq-sent { text-align:center; font-size:17px; font-weight:800; color:#1e293b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-top:8px; }
          .mq-mask { display:inline-block; min-width:34px; background:#14532d; color:#fff; border-radius:6px; padding:0 8px; }
          .mq-choices { display:flex; gap:6px; justify-content:center; margin-top:10px; flex-wrap:wrap; }
          .mq-choice { padding:7px 16px; border-radius:16px; border:1.5px solid #e2e8f0; background:#fff; color:#334155; font-size:13px; font-weight:700; cursor:pointer; }
          .mq-choice:not(:disabled):hover { border-color:#14532d; }
          .mq-choice.ok { background:#dcfce7; border-color:#16a34a; color:#166534; }
          .mq-choice.no { background:#fee2e2; border-color:#ef4444; color:#991b1b; }
          .mq-choice:disabled { cursor:default; opacity:0.9; }
          .mq-why { font-size:12.5px; color:#475569; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:10px; line-height:1.7; }
          .mq-next { display:block; margin:8px auto 0; padding:7px 18px; border-radius:16px; border:1.5px solid #14532d; background:#14532d; color:#fff; font-size:12px; font-weight:800; cursor:pointer; }
          .mq-final { text-align:center; font-size:14px; font-weight:800; color:#14532d; background:#dcfce7; border-radius:8px; padding:16px; margin-top:8px; }
          .ms-btn { display:block; margin:8px auto; padding:6px 16px; border-radius:16px; border:1.5px solid #e2e8f0; background:#fff; color:#64748b; font-size:11.5px; font-weight:700; cursor:pointer; }
          .ms-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:6px; margin-top:10px; }
          .ms-card { border:1.5px solid #e2e8f0; border-radius:8px; padding:8px 10px; background:#fff; }
          .ms-card b { display:block; font-size:12px; color:#14532d; }
          .ms-card span { font-size:11px; color:#64748b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
        </style>

        <div class="mm-def">
          <div><b>정의</b> 데이터 일부를 가리고 맞히게 해 문제도 정답도 스스로 만드는 학습입니다.</div>
          <div><b>언제</b> 라벨 없이 대규모로 학습할 때 씁니다.</div>
          <div><b>예시</b> BERT(빈칸 채우기), GPT(다음 토큰), MAE(이미지 복원)</div>
        </div>
        <div class="mm-intro">
          라벨은 없습니다. 대신 문장에 구멍을 뚫었습니다 — <b>당신이 모델</b>입니다. 빈칸을 맞혀보세요.
        </div>

        <div class="mq-score" id="mq-score"></div>
        <div id="mq-box"></div>
        <button class="ms-btn" id="mq-reset">↺ 처음부터</button>

        <div class="ms-grid">${cards}</div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
