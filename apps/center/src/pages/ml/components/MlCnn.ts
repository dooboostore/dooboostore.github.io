import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-cnn';

const N = 10;
const K = 3;

function makeInput(): number[][] {
  const g: number[][] = [];
  for (let y = 0; y < N; y++) {
    const row: number[] = [];
    for (let x = 0; x < N; x++) {
      row.push(x === 4 || x === 5 ? 200 : 30);
    }
    g.push(row);
  }
  return g;
}
const INPUT = makeInput();

type Kernel = { name: string; desc: string; m: number[][] };
const KERNELS: Kernel[] = [
  { name: '수직선 검출', desc: '세로 경계만 살림', m: [[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]] },
  { name: '수평선 검출', desc: '가로 경계만 살림', m: [[-1, -1, -1], [0, 0, 0], [1, 1, 1]] },
  { name: '블러', desc: '평균이라 뭉갬', m: [[1 / 9, 1 / 9, 1 / 9], [1 / 9, 1 / 9, 1 / 9], [1 / 9, 1 / 9, 1 / 9]] },
  { name: '샤픈', desc: '중앙 강조로 선명', m: [[0, -1, 0], [-1, 5, -1], [0, -1, 0]] },
];

function conv(img: number[][], k: number[][]): number[][] {
  const out: number[][] = [];
  for (let y = 0; y <= N - K; y++) {
    const row: number[] = [];
    for (let x = 0; x <= N - K; x++) {
      let s = 0;
      for (let dy = 0; dy < K; dy++) for (let dx = 0; dx < K; dx++) s += img[y + dy][x + dx] * k[dy][dx];
      row.push(Math.max(0, s));
    }
    out.push(row);
  }
  return out;
}
function maxpool(m: number[][]): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < m.length; y += 2) {
    const row: number[] = [];
    for (let x = 0; x < m[0].length; x += 2) {
      row.push(Math.max(m[y][x], m[y][x + 1], m[y + 1][x], m[y + 1][x + 1]));
    }
    out.push(row);
  }
  return out;
}

const MD = `
## 합성곱 — 필터로 훑기
- 3×3 **필터(커널)** 를 이미지 위로 밀며 겹치는 값을 곱해 더합니다. 필터마다 다른 특징(세로선·가로선·뭉갬·선명)이 뽑힙니다.
- 음수는 버리고(렐루) **풀링**(2×2에서 최대값 하나)으로 크기를 줄입니다. 위치가 조금 움직여도 같은 결과가 나와 **이동 불변성**이 생깁니다.
- 전체 구조는 **합성곱→풀링 반복 후 완전연결층**입니다. 책의 코드: \`Conv2D\` → \`MaxPooling2D\` → \`Flatten\` → \`Dense\`
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlCnn extends w.HTMLElement {
    private ki = 0;
    private pooled = false;

    private drawGrid(canvas: HTMLCanvasElement, grid: number[][], max: number, showNum: boolean) {
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
          ctx.strokeStyle = '#cbd5e1';
          ctx.strokeRect(x * cw + 0.5, y * cw + 0.5, cw, cw);
          if (showNum) {
            ctx.fillStyle = v > max / 2 ? '#fff' : '#334155';
            ctx.font = `${Math.max(8, cw / 3.4)}px monospace`;
            const t = Number.isInteger(v) ? String(v) : v.toFixed(1);
            ctx.fillText(t, x * cw + 2, y * cw + cw / 2);
          }
        }
      }
    }

    private refresh() {
      const k = KERNELS[this.ki];
      const feat = conv(INPUT, k.m);
      const shown = this.pooled ? maxpool(feat) : feat;
      const maxF = Math.max(1, ...feat.flat());
      this.drawGrid(this.shadowRoot?.querySelector('#mc-in') as HTMLCanvasElement, INPUT, 255, false);
      this.drawGrid(this.shadowRoot?.querySelector('#mc-k') as HTMLCanvasElement, k.m.map(r => r.map(v => v + 1.2)), 2.4, true);
      this.drawGrid(this.shadowRoot?.querySelector('#mc-out') as HTMLCanvasElement, shown, maxF, false);
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mc-kdesc', `${k.name} — ${k.desc}`);
      setText('#mc-size', `입력 10×10 → 합성곱 ${feat.length}×${feat.length}${this.pooled ? ` → 풀링 ${shown.length}×${shown.length}` : ''}`);
      this.shadowRoot?.querySelectorAll('.mc-kbtn').forEach(el =>
        (el as HTMLElement).classList.toggle('active', Number((el as HTMLElement).dataset.i) === this.ki));
      const pool = this.shadowRoot?.querySelector('#mc-pool') as HTMLButtonElement;
      if (pool) pool.textContent = this.pooled ? '풀링 ON — 끄기' : '풀링 OFF — 켜기 (2×2 최대값)';
    }

    @addEventListener('.mc-kbtn', 'click', { delegate: true })
    onK(e: Event) {
      const btn = (e.target as HTMLElement).closest('.mc-kbtn') as HTMLElement;
      if (!btn) return;
      this.ki = Number(btn.dataset.i);
      this.refresh();
    }
    @addEventListener('#mc-pool', 'click')
    onPool() { this.pooled = !this.pooled; this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .mc-row { display:flex; gap:10px; justify-content:center; align-items:flex-start; margin-top:10px; flex-wrap:wrap; }
          .mc-box { text-align:center; }
          .mc-box canvas { display:block; border-radius:6px; border:1px solid #e2e8f0; }
          .mc-cap { font-size:11px; font-weight:800; color:#475569; margin-top:4px; }
          .mc-kbtns { display:flex; gap:6px; justify-content:center; margin-top:8px; flex-wrap:wrap; }
          .mc-kbtn { padding:6px 12px; border-radius:16px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:11.5px; font-weight:700; cursor:pointer; }
          .mc-kbtn.active { background:#14532d; color:#fff; border-color:#14532d; }
          .mc-pool { display:block; margin:8px auto; padding:6px 16px; border-radius:16px; border:1.5px solid #14532d; background:#f0fdf4; color:#14532d; font-size:12px; font-weight:800; cursor:pointer; }
          .mc-info { text-align:center; font-size:12px; font-weight:700; color:#1e293b; margin-top:6px; }
          .mc-desc { text-align:center; font-size:12px; color:#64748b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
        </style>

        <div class="mm-def">
          <div><b>정의</b> 작은 필터(커널)로 이미지를 훑으며 겹치는 값을 곱해 더해 특징을 뽑는 신경망이다.</div>
          <div><b>언제</b> 이미지 같은 공간 패턴을 다룰 때 쓴다.</div>
          <div><b>예시</b> 얼굴 인식, 불량 검출, 세로선·가로선 검출</div>
        </div>
        <div class="mm-intro">
          세로 막대 그림에 필터를 얹어보세요. <b>수직선 필터</b>에서만 막대가 환하게 살아남습니다. 가운데 칸은 필터 숫자입니다.
        </div>

        <div class="mc-kbtns">
          ${KERNELS.map((k, i) => `<button class="mc-kbtn" data-i="${i}">${k.name}</button>`).join('')}
        </div>
        <div class="mc-desc" id="mc-kdesc"></div>
        <button class="mc-pool" id="mc-pool"></button>
        <div class="mc-row">
          <div class="mc-box"><canvas id="mc-in" width="130" height="130"></canvas><div class="mc-cap">입력</div></div>
          <div class="mc-box"><canvas id="mc-k" width="110" height="110"></canvas><div class="mc-cap">필터 3×3</div></div>
          <div class="mc-box"><canvas id="mc-out" width="130" height="130"></canvas><div class="mc-cap">특성 맵</div></div>
        </div>
        <div class="mc-info" id="mc-size"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
