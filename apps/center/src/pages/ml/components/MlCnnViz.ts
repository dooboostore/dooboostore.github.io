import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-cnnviz';

const N = 12;

function makeImg(): number[][] {
  const g: number[][] = [];
  for (let y = 0; y < N; y++) {
    const row: number[] = [];
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - 5.5, y - 5.5);
      row.push(d < 2 ? 220 : d < 4 ? 150 : 40);
    }
    g.push(row);
  }
  return g;
}
const IMG = makeImg();

type Filter = { name: string; desc: string; m: number[][] };
const FILTERS: Filter[] = [
  { name: '모서리', desc: '학습된 1층 필터 느낌 — 경계에 반응', m: [[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]] },
  { name: '질감', desc: '격자 무늬에 반응하는 필터 느낌', m: [[1, -1, 1], [-1, 1, -1], [1, -1, 1]] },
  { name: '점', desc: '밝은 점에 반응하는 필터 느낌', m: [[0, 0, 0], [0, 2, 0], [0, 0, 0]] },
];

function conv(img: number[][], k: number[][]): number[][] {
  const out: number[][] = [];
  for (let y = 0; y <= N - 3; y++) {
    const row: number[] = [];
    for (let x = 0; x <= N - 3; x++) {
      let s = 0;
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) s += img[y + dy][x + dx] * k[dy][dx];
      row.push(Math.max(0, s));
    }
    out.push(row);
  }
  return out;
}

const MD = `
## 합성곱 시각화 — 무엇을 보는가
- 학습된 필터 가중치를 꺼내 그리면 **어떤 모양에 반응하는지**가 보입니다. 1층은 모서리·질감·점 같은 단순 패턴입니다.
- 필터를 이미지에 통과시킨 결과가 **특성 맵**입니다. 버튼을 바꿔 같은 그림이 필터마다 어떻게 다르게 보이는지 확인해보세요.
- 층이 깊어질수록 눈·바퀴·얼굴 같은 복잡한 패턴을 봅니다. 층을 함수처럼 조립하는 게 **함수형 API**입니다.
- 책의 코드: \`model.layers\` 가중치 꺼내기 → \`keras.Model(inputs, outputs)\`로 중간층 출력 보기
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlCnnViz extends w.HTMLElement {
    private fi = 0;

    private drawGrid(canvas: HTMLCanvasElement, grid: number[][], max: number) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const n = grid.length;
      const cw = canvas.width / n;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const v = grid[y][x];
          const g = Math.round(255 - (Math.min(v, max) / max) * 255);
          ctx.fillStyle = `rgb(${g},${g},${g})`;
          ctx.fillRect(x * cw, y * cw, cw + 1, cw + 1);
        }
      }
    }

    private refresh() {
      const f = FILTERS[this.fi];
      const feat = conv(IMG, f.m);
      const maxF = Math.max(1, ...feat.flat());
      this.drawGrid(this.shadowRoot?.querySelector('#mv-img') as HTMLCanvasElement, IMG, 255);
      this.drawGrid(this.shadowRoot?.querySelector('#mv-map') as HTMLCanvasElement, feat, maxF);
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mv-desc', `${f.name} — ${f.desc}`);
      this.shadowRoot?.querySelectorAll('.mv-fbtn').forEach(el =>
        (el as HTMLElement).classList.toggle('active', Number((el as HTMLElement).dataset.i) === this.fi));
    }

    @addEventListener('.mv-fbtn', 'click', { delegate: true })
    onF(e: Event) {
      const btn = (e.target as HTMLElement).closest('.mv-fbtn') as HTMLElement;
      if (!btn) return;
      this.fi = Number(btn.dataset.i);
      this.refresh();
    }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .mv-row { display:flex; gap:14px; justify-content:center; align-items:flex-start; margin-top:10px; flex-wrap:wrap; }
          .mv-box { text-align:center; }
          .mv-box canvas { display:block; border-radius:6px; border:1px solid #e2e8f0; }
          .mv-cap { font-size:11px; font-weight:800; color:#475569; margin-top:4px; }
          .mv-fbtns { display:flex; gap:6px; justify-content:center; margin-top:8px; }
          .mv-fbtn { padding:6px 14px; border-radius:16px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:12px; font-weight:700; cursor:pointer; }
          .mv-fbtn.active { background:#14532d; color:#fff; border-color:#14532d; }
          .mv-desc { text-align:center; font-size:12px; color:#64748b; margin-top:6px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
        </style>

        <div class="mm-def">
          <div><b>정의</b> 필터를 이미지에 통과시킨 결과인 특성 맵을 그려서 모델 내부를 들여다보는 방법이다.</div>
          <div><b>언제</b> 모델이 무엇을 보고 판단하는지 확인할 때 쓴다.</div>
          <div><b>예시</b> 필터 해석, 오분류 원인 찾기, 층별 패턴 비교</div>
        </div>
        <div class="mm-intro">
          동그라미 그림에 필터를 바꿔 얹어보세요. <b>같은 그림 다른 해석</b> — 신경망 안에서는 이런 특성 맵 수십 장이 다음 층으로 넘어갑니다.
        </div>

        <div class="mv-fbtns">
          ${FILTERS.map((f, i) => `<button class="mv-fbtn" data-i="${i}">${f.name}</button>`).join('')}
        </div>
        <div class="mv-desc" id="mv-desc"></div>
        <div class="mv-row">
          <div class="mv-box"><canvas id="mv-img" width="150" height="150"></canvas><div class="mv-cap">입력 그림</div></div>
          <div class="mv-box"><canvas id="mv-map" width="150" height="150"></canvas><div class="mv-cap">특성 맵</div></div>
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
