import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-morphology';

const W = 80;
const H = 60;

/** 물체는 밝게, 배경은 어둡게 — 각각에 노이즈를 섞어서 임계값(threshold)에 따라 결과가 달라지게 만든다. */
function generateGrayscaleScene(): number[][] {
  const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.32;
  const grid: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) {
      const inCircle = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      const base = inCircle ? 210 : 50;
      const noise = (Math.random() - 0.5) * 140; // ±70 노이즈
      row.push(Math.max(0, Math.min(255, Math.round(base + noise))));
    }
    grid.push(row);
  }
  return grid;
}

/** 이진화(binarization): threshold보다 밝으면 흰색(물체), 아니면 검은색(배경). */
function applyThreshold(grid: number[][], t: number): boolean[][] {
  return grid.map(row => row.map(v => v > t));
}

/** 침식(erode): 커널 범위가 전부 true일 때만 true — 흰 영역을 한 겹 깎는다. */
function erode(grid: boolean[][], k: number): boolean[][] {
  const half = Math.floor(k / 2);
  const out: boolean[][] = [];
  for (let y = 0; y < H; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < W; x++) {
      let all = true;
      for (let dy = -half; dy <= half && all; dy++) {
        for (let dx = -half; dx <= half && all; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= H || xx < 0 || xx >= W || !grid[yy][xx]) all = false;
        }
      }
      row.push(all);
    }
    out.push(row);
  }
  return out;
}

/** 팽창(dilate): 커널 범위에 하나라도 true가 있으면 true — 흰 영역을 한 겹 불린다. */
function dilate(grid: boolean[][], k: number): boolean[][] {
  const half = Math.floor(k / 2);
  const out: boolean[][] = [];
  for (let y = 0; y < H; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < W; x++) {
      let any = false;
      for (let dy = -half; dy <= half && !any; dy++) {
        for (let dx = -half; dx <= half && !any; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < H && xx >= 0 && xx < W && grid[yy][xx]) any = true;
        }
      }
      row.push(any);
    }
    out.push(row);
  }
  return out;
}

const open_ = (grid: boolean[][], k: number) => dilate(erode(grid, k), k);
const close_ = (grid: boolean[][], k: number) => erode(dilate(grid, k), k);

function drawGray(canvas: HTMLCanvasElement, grid: number[][]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = grid[y][x];
      const i = (y * W + x) * 4;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawMask(canvas: HTMLCanvasElement, grid: boolean[][]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = grid[y][x] ? 255 : 0;
      const i = (y * W + x) * 4;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

const MD = `
## 이진화와 모폴로지 — 마스크 청소
- **이진화(threshold)**: 그레이스케일 값이 임계값보다 밝으면 흰색(물체), 아니면 검은색(배경)으로 나눕니다. 임계값을 너무 낮추면 배경 노이즈까지 흰색으로 잡히고(바깥 점), 너무 높이면 물체 안에서도 어두운 픽셀이 검은색으로 빠져버립니다(구멍) — 슬라이더로 직접 확인해보세요.
- \`inRange\`나 \`threshold\`가 만든 이진 마스크(0/255)는 보통 지저분합니다. **모폴로지(morphology)** 연산이 청소 도구입니다.
- **침식(erode)**: 흰 영역을 한 겹 깎음 → 점 노이즈 제거, 물체도 작아짐
- **팽창(dilate)**: 흰 영역을 한 겹 불림 → 구멍 메움, 물체도 커짐
- **열림(open) = 침식→팽창**: 바깥 점 노이즈 제거, 크기 보존
- **닫힘(close) = 팽창→침식**: 안쪽 구멍 메움, 크기 보존
- 실무 표준 순서는 **열림 → 닫힘** — 점 노이즈부터 지우고, 그다음 구멍을 메웁니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionMorphology extends w.HTMLElement {
    private threshold = 128;
    private kernelSize = 3;
    private scene: number[][] = generateGrayscaleScene();

    private refresh() {
      const { scene, threshold: t, kernelSize: k } = this;
      const mask = applyThreshold(scene, t);
      const q = (id: string) => this.shadowRoot?.querySelector(`#${id}`) as HTMLCanvasElement;

      const grayCanvas = q('mo-gray');
      if (grayCanvas) drawGray(grayCanvas, scene);

      const stages: { id: string; data: boolean[][] }[] = [
        { id: 'mo-mask', data: mask },
        { id: 'mo-erode', data: erode(mask, k) },
        { id: 'mo-dilate', data: dilate(mask, k) },
        { id: 'mo-open', data: open_(mask, k) },
        { id: 'mo-close', data: close_(mask, k) },
      ];
      stages.forEach(s => {
        const canvas = q(s.id);
        if (canvas) drawMask(canvas, s.data);
      });

      const kernelVal = this.shadowRoot?.querySelector('#mo-kernel-val') as HTMLElement;
      if (kernelVal) kernelVal.textContent = `${k}×${k}`;
      const threshVal = this.shadowRoot?.querySelector('#mo-thresh-val') as HTMLElement;
      if (threshVal) threshVal.textContent = String(t);
    }

    @addEventListener('#mo-kernel', 'input')
    onKernel(e: Event) {
      const v = Number((e.target as HTMLInputElement).value) || 1;
      this.kernelSize = v % 2 === 0 ? v + 1 : v;
      this.refresh();
    }

    @addEventListener('#mo-thresh', 'input')
    onThreshold(e: Event) {
      this.threshold = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @addEventListener('#mo-regen', 'click')
    onRegen() {
      this.scene = generateGrayscaleScene();
      this.refresh();
    }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const panel = (id: string, label: string) => `
        <div class="mo-panel">
          <canvas width="${W}" height="${H}" id="${id}"></canvas>
          <div class="mo-panel-label">${label}</div>
        </div>`;
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:50px; text-align:right; color:#1e293b; }
          .ctl button { padding:4px 10px; border-radius:6px; border:1px solid #e2e8f0; background:#fff; cursor:pointer; font-size:12px; }
          .mo-strip { display:flex; gap:10px; margin-top:14px; flex-wrap:wrap; justify-content:center; }
          .mo-panel { text-align:center; }
          .mo-panel-label { font-size:10.5px; font-weight:700; color:#475569; margin-top:4px; max-width:${W}px; }
          canvas { display:block; width:${W}px; height:${H}px; border-radius:6px; border:1px solid #e2e8f0; image-rendering:pixelated; background:#000; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mo-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mo-intro b { color:#0369a1; }
        </style>

        <div class="mo-intro">
          색으로 물체를 찾은 뒤(16강 색공간)엔 밝은 부분만 흰색(255), 나머지는 검은색(0)으로 나누는 <b>이진화(threshold)</b>를 합니다. 근데 이렇게 나온 마스크는 보통 지저분합니다 — 배경에 점 노이즈가 끼거나 물체 안에 구멍이 뚫립니다. <b>모폴로지(침식·팽창·열림·닫힘)</b> 연산이 이 마스크를 청소하는 도구입니다.
        </div>

        <div class="math-desc">그레이스케일 장면을 이진화(threshold)한 뒤, 침식·팽창·열림·닫힘을 거치며 마스크가 어떻게 깨끗해지는지 비교해보세요.</div>

        <div class="ctl"><label>임계값(threshold) <input id="mo-thresh" type="range" min="0" max="255" step="1" value="${this.threshold}"><b id="mo-thresh-val">${this.threshold}</b></label></div>
        <div class="ctl"><label>모폴로지 커널 크기(홀수) <input id="mo-kernel" type="range" min="1" max="9" step="2" value="${this.kernelSize}"><b id="mo-kernel-val">${this.kernelSize}×${this.kernelSize}</b></label> <button id="mo-regen">장면 재생성</button></div>

        <div class="mo-strip">
          ${panel('mo-gray', '그레이스케일 원본')}
          ${panel('mo-mask', '이진화(threshold)')}
          ${panel('mo-erode', '침식 — 점 제거, 물체 축소')}
          ${panel('mo-dilate', '팽창 — 구멍 메움, 물체 확대')}
          ${panel('mo-open', '열림(침식→팽창) — 점 제거')}
          ${panel('mo-close', '닫힘(팽창→침식) — 구멍 메움')}
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
