import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-transfer';

const LAYERS = [
  { name: '입력층 (특징 추출)', params: 2 },
  { name: '중간층 1', params: 8 },
  { name: '중간층 2', params: 8 },
  { name: '중간층 3', params: 8 },
  { name: '출력층 (내 Task)', params: 1 },
];

const EXAMPLES = [
  ['ImageNet → 불량 검출', '백만 장 학습 모델에 내 공장 사진 소량만 추가 학습'],
  ['BERT → 감성 분석', '언어 전체 학습 모델에 리뷰 데이터로 출력층 교체'],
  ['Sim → Real', '시뮬 정책에 실기 데이터 소량으로 적응 (Sim2Real 탭)'],
  ['음성 → 방언', '표준어 모델에 방언 데이터로 미세조정'],
  ['대형 LLM 파인튜닝', '기반 모델 고정 + 어댑터(LoRA)만 학습'],
  ['로봇 파운데이션', '대규모 로그 사전학습 → 내 로봇에 파인튜닝'],
];

const MD = `
## 전이 학습 — 남의 공부 빌려쓰기
- 큰 데이터로 배운 **사전학습 모델**을 가져와 내 Task에 맞게 조금만 더 가르칩니다. 밑바닥부터 배우는 것보다 빠르고 데이터도 적게 듭니다.
- 관례: 앞단(일반 특징)은 **얼리고**, 뒷단(Task 특화)만 학습합니다. 아예 출력층만 갈아끼우는 걸 **선형 탐색**, 조금씩 다 푸는 걸 **미세조정**이라 부릅니다.
- 위 막대를 눌러 층을 얼려보세요. 학습 파라미터가 줄수록 필요한 데이터·시간이 함께 줄어듭니다(수치는 개념용 예시).
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlTransfer extends w.HTMLElement {
    private frozen: boolean[] = [true, true, true, false, false];

    private refresh() {
      const box = this.shadowRoot?.querySelector('#mt-bars') as HTMLElement;
      if (box) {
        const maxP = Math.max(...LAYERS.map(l => l.params));
        box.innerHTML = LAYERS.map((l, i) => {
          const f = this.frozen[i];
          const wpx = Math.max(8, (l.params / maxP) * 100);
          return `<div class="mt-row"><span class="mt-name">${l.name}</span>` +
            `<span class="mt-barwrap"><span class="mt-bar${f ? ' frozen' : ''}" style="width:${wpx}%"></span></span>` +
            `<span class="mt-p">${l.params}M</span>` +
            `<button class="mt-tgl" data-i="${i}">${f ? '🧊얼림' : '🔥학습'}</button></div>`;
        }).join('');
      }
      const total = LAYERS.reduce((s, l) => s + l.params, 0);
      const train = LAYERS.reduce((s, l, i) => s + (this.frozen[i] ? 0 : l.params), 0);
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mt-sum', `전체 ${total}M 중 학습 ${train}M (${Math.round((train / total) * 100)}%)`);
      setText('#mt-data', train <= 2
        ? '필요 데이터: 소량(수백~수천 장) · 시간: 짧음 — 출력층만 갈아끼우기'
        : train <= 10
          ? '필요 데이터: 중간(수천~수만 장) · 시간: 보통 — 뒷단 미세조정'
          : '필요 데이터: 대규모 · 시간: 김 — 처음부터 배우는 것과 비슷');
    }

    @addEventListener('.mt-tgl', 'click', { delegate: true })
    onTgl(e: Event) {
      const btn = (e.target as HTMLElement).closest('.mt-tgl') as HTMLElement;
      if (!btn) return;
      const i = Number(btn.dataset.i);
      this.frozen[i] = !this.frozen[i];
      this.refresh();
    }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const cards = EXAMPLES.map(e =>
        `<div class="ms-card"><b>${e[0]}</b><span>${e[1]}</span></div>`).join('');
      return `
        <style>
          :host { display:block; }
          .mt-row { display:flex; align-items:center; gap:6px; margin-top:6px; font-size:11.5px; }
          .mt-name { width:110px; flex-shrink:0; font-weight:700; color:#475569; }
          .mt-barwrap { flex:1; background:#f1f5f9; border-radius:4px; height:14px; }
          .mt-bar { display:block; height:100%; background:#f59e0b; border-radius:4px; }
          .mt-bar.frozen { background:#94a3b8; }
          .mt-p { width:36px; text-align:right; color:#1e293b; font-weight:700; flex-shrink:0; }
          .mt-tgl { flex-shrink:0; border:1.5px solid #e2e8f0; background:#fff; border-radius:12px; font-size:10.5px; font-weight:700; padding:2px 8px; cursor:pointer; }
          .mt-sum { text-align:center; font-size:12.5px; font-weight:800; color:#1e293b; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:10px; font-family:monospace; }
          .mt-data { text-align:center; font-size:12px; font-weight:700; color:#14532d; margin-top:6px; }
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
          <div><b>정의</b> 큰 데이터로 배운 남의 모델(사전학습)을 가져와 내 Task에 맞게 조금 더 가르치는 학습입니다.</div>
          <div><b>언제</b> 내 데이터가 적을 때 씁니다.</div>
          <div><b>예시</b> ImageNet 파인튜닝, BERT 감성 분석, LoRA 어댑터</div>
        </div>
        <div class="mm-intro">
          27M짜리 사전학습 모델을 가져왔다고 칩시다. 층 버튼을 눌러 <b>얼리기/학습</b>을 바꿔보세요.
        </div>

        <div id="mt-bars"></div>
        <div class="mt-sum" id="mt-sum"></div>
        <div class="mt-data" id="mt-data"></div>

        <div class="ms-grid">${cards}</div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
