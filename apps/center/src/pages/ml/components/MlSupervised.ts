import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-supervised';

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

type Pt = { x: number; y: number; label: 0 | 1 };
function gen(n: number, seed: number): Pt[] {
  const r = mulberry(seed);
  const g = () => (r() + r() + r() - 1.5) / 1.5;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) pts.push({ x: 25 + g() * 7, y: 480 + g() * 160, label: 0 });
  for (let i = 0; i < n; i++) pts.push({ x: 13 + g() * 3.5, y: 135 + g() * 65, label: 1 });
  return pts;
}
const TRAIN = gen(12, 41);
const TEST = gen(10, 87);

const EXAMPLES = [
  ['스팸 필터', '메일+스팸/정상 라벨 → 새 메일 분류'],
  ['집값 예측', '평수·위치+실거래가 → 가격 회귀'],
  ['와인 분류', '당도·알코올+품종 라벨 → 와인 판별 (책 5장)'],
  ['이미지 분류', '사진+사물 라벨 → Fashion MNIST (책 7~8장)'],
  ['감성 분석', '리뷰+긍정/부정 라벨 → IMDB 분류 (책 9장)'],
  ['음성 인식', '음성+자막 → 텍스트 변환'],
];

const MD = `
## 지도 학습 — 정답지를 주고 외우기
- 입력(x)과 **정답(y, 라벨)** 쌍으로 배웁니다. 분류(스팸/정상)든 회귀(집값)든 "정답 맞히기"가 목표입니다.
- 아래 버튼을 눌러보세요. 1-NN은 훈련 세트를 통째로 외우니 훈련 정확도가 100%가 나옵니다 — 외웠다고 잘하는 게 아니죠. 진짜 실력은 라벨 없는 **테스트 세트**에서 갈립니다(훈련/테스트 탭 복습).
- 책 1~5장·7~9장의 대부분이 지도 학습입니다. 정답 라벨 구하기가 제일 비싼 작업입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  function knn(qx: number, qy: number): 0 | 1 {
    const ds = TRAIN.map(p => ({ p, d: Math.hypot(p.x - qx, p.y - qy) }));
    ds.sort((a, b) => a.d - b.d);
    return ds[0].p.label;
  }

  @elementDefine(tagName, { window: w })
  class MlSupervised extends w.HTMLElement {
    private trained = false;

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#ms-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      const XMIN = 5, XMAX = 42, YMIN = 0, YMAX = 800;
      const px = (x: number) => ((x - XMIN) / (XMAX - XMIN)) * W;
      const py = (y: number) => H - (y / YMAX) * H;
      let trOk = 0, teOk = 0;
      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);
        TEST.forEach(p => {
          ctx.fillStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y), 4, 0, Math.PI * 2);
          ctx.fill();
        });
        TRAIN.forEach(p => {
          ctx.fillStyle = p.label === 0 ? '#3b82c4' : '#f59e0b';
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y), 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 7px sans-serif';
          ctx.fillText(p.label === 0 ? '도' : '빙', px(p.x) - 4, py(p.y) + 2.5);
        });
        if (this.trained) {
          TRAIN.forEach(p => { if (knn(p.x, p.y) === p.label) trOk++; });
          TEST.forEach(p => {
            const pred = knn(p.x, p.y);
            if (pred === p.label) teOk++;
            ctx.strokeStyle = pred === p.label ? '#16a34a' : '#ef4444';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px(p.x), py(p.y), 7, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = 1;
          });
        }
      }
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#ms-score', this.trained
        ? `훈련 정확도 ${(trOk / TRAIN.length).toFixed(2)} (외웠으니 당연) · 테스트 정확도 ${(teOk / TEST.length).toFixed(2)} (진짜 실력)`
        : '학습 버튼을 눌러 1-NN을 훈련시키세요');
      const btn = this.shadowRoot?.querySelector('#ms-train') as HTMLButtonElement;
      if (btn) btn.textContent = this.trained ? '↺ 리셋' : '▶ 학습 (1-NN 암기)';
    }

    @addEventListener('#ms-train', 'click')
    onTrain() { this.trained = !this.trained; this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const cards = EXAMPLES.map(e =>
        `<div class="ms-card"><b>${e[0]}</b><span>${e[1]}</span></div>`).join('');
      return `
        <style>
          :host { display:block; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .ms-btn { display:block; margin:8px auto; padding:7px 18px; border-radius:16px; border:1.5px solid #14532d; background:#f0fdf4; color:#14532d; font-size:12px; font-weight:800; cursor:pointer; }
          .ms-score { text-align:center; font-size:12.5px; font-weight:700; color:#1e293b; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:8px; font-family:monospace; }
          .ms-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:6px; margin-top:10px; }
          .ms-card { border:1.5px solid #e2e8f0; border-radius:8px; padding:8px 10px; background:#fff; }
          .ms-card b { display:block; font-size:12px; color:#14532d; }
          .ms-card span { font-size:11px; color:#64748b; }
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
          <div><b>정의</b> 입력(x)과 정답(y, 라벨) 쌍으로 배워 새 입력의 정답을 맞히는 학습입니다.</div>
          <div><b>언제</b> 정답 라벨이 있는 데이터가 있을 때 씁니다.</div>
          <div><b>예시</b> 스팸 분류, 집값 예측, 와인 분류</div>
        </div>
        <div class="mm-intro">
          색깔+이름표가 <b>정답 라벨</b>입니다. 회색 점(테스트)은 라벨을 가렸습니다. 학습 버튼을 눌러보세요.
        </div>

        <button class="ms-btn" id="ms-train"></button>
        <canvas id="ms-canvas" width="${W}" height="${H}"></canvas>
        <div class="mm-legend"><span>색+글자 = 라벨 있음(훈련)</span><span>회색 = 라벨 가림(테스트)</span><span>테두리 초록=정답 빨강=오답</span></div>
        <div class="ms-score" id="ms-score"></div>

        <div class="ms-grid">${cards}</div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
