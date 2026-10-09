import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-pipeline';

const W = 100;
const H = 80;

const clampIdx = (v: number, max: number) => Math.max(0, Math.min(max - 1, v));
const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

type ColorGrid = { r: number[][]; g: number[][]; b: number[][] };

function generateScene(noiseProb: number): ColorGrid {
  const r: number[][] = [], g: number[][] = [], b: number[][] = [];
  const ballX = randInt(30, 70), ballY = randInt(25, 55), ballR = randInt(12, 18);
  for (let y = 0; y < H; y++) {
    const rowR: number[] = [], rowG: number[] = [], rowB: number[] = [];
    for (let x = 0; x < W; x++) {
      const inBall = (x - ballX) ** 2 + (y - ballY) ** 2 <= ballR * ballR;
      let rv: number, gv: number, bv: number;
      if (inBall) {
        const shade = 0.7 + 0.3 * Math.random();
        rv = Math.round(220 * shade); gv = Math.round(30 * shade); bv = Math.round(25 * shade);
      } else {
        rv = randInt(20, 90); gv = randInt(80, 160); bv = randInt(90, 170);
      }
      if (Math.random() < noiseProb) { rv = randInt(0, 255); gv = randInt(0, 255); bv = randInt(0, 255); }
      rowR.push(rv); rowG.push(gv); rowB.push(bv);
    }
    r.push(rowR); g.push(rowG); b.push(rowB);
  }
  return { r, g, b };
}

function gaussianKernel1D(k: number): number[] {
  const sigma = k / 6 || 1;
  const half = Math.floor(k / 2);
  const weights: number[] = [];
  let sum = 0;
  for (let i = -half; i <= half; i++) {
    const wgt = Math.exp(-(i * i) / (2 * sigma * sigma));
    weights.push(wgt);
    sum += wgt;
  }
  return weights.map(w => w / sum);
}

function gaussianBlurChannel(grid: number[][], k: number): number[][] {
  const weights = gaussianKernel1D(k);
  const half = Math.floor(k / 2);
  const temp: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let i = -half; i <= half; i++) sum += grid[y][clampIdx(x + i, W)] * weights[i + half];
      row.push(sum);
    }
    temp.push(row);
  }
  const out: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let i = -half; i <= half; i++) sum += temp[clampIdx(y + i, H)][x] * weights[i + half];
      row.push(sum);
    }
    out.push(row);
  }
  return out;
}

const gaussianBlurColor = (grid: ColorGrid, k: number): ColorGrid => ({
  r: gaussianBlurChannel(grid.r, k),
  g: gaussianBlurChannel(grid.g, k),
  b: gaussianBlurChannel(grid.b, k),
});

/** BGR2HSV과 동일한 변환 — H는 OpenCV 스케일(0~179)로 맞춘다. */
function rgbToHsvCv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  const hCv = Math.round(h / 2);
  const sCv = max === 0 ? 0 : Math.round((delta / max) * 255);
  const vCv = Math.round(max * 255);
  return [hCv, sCv, vCv];
}

/** 빨강은 H가 0 근처와 179 근처 두 조각으로 쪼개지므로 OR로 잡는다. */
function redInRange(grid: ColorGrid): boolean[][] {
  const mask: boolean[][] = [];
  for (let y = 0; y < H; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < W; x++) {
      const [h, s, v] = rgbToHsvCv(grid.r[y][x], grid.g[y][x], grid.b[y][x]);
      const hueMatch = (h >= 0 && h <= 10) || (h >= 170 && h <= 179);
      row.push(hueMatch && s >= 70 && v >= 50);
    }
    mask.push(row);
  }
  return mask;
}

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

function drawColor(canvas: HTMLCanvasElement, grid: ColorGrid) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, Math.round(grid.r[y][x])));
      img.data[i + 1] = Math.max(0, Math.min(255, Math.round(grid.g[y][x])));
      img.data[i + 2] = Math.max(0, Math.min(255, Math.round(grid.b[y][x])));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawMask(canvas: HTMLCanvasElement, mask: boolean[][]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = mask[y][x] ? 255 : 0;
      const i = (y * W + x) * 4;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawOverlay(canvas: HTMLCanvasElement, grid: ColorGrid, mask: boolean[][]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let minX = W, maxX = -1, minY = H, maxY = -1;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (mask[y][x]) {
        img.data[i] = Math.round(grid.r[y][x] * 0.4 + 60);
        img.data[i + 1] = Math.round(grid.g[y][x] * 0.4 + 180);
        img.data[i + 2] = Math.round(grid.b[y][x] * 0.4 + 40);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      } else {
        img.data[i] = Math.round(grid.r[y][x]);
        img.data[i + 1] = Math.round(grid.g[y][x]);
        img.data[i + 2] = Math.round(grid.b[y][x]);
      }
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (maxX >= minX) {
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(minX - 1, minY - 1, maxX - minX + 2, maxY - minY + 2);
  }
}

const MD = `
## 오늘의 파이프라인 조립
\`BGR 프레임 → GaussianBlur → BGR2HSV → inRange(H 두 조각 OR) → open → close → 깨끗한 마스크\`

이 여섯 단계가 바로 "색상 객체 검출기"의 전부입니다. 노이즈 낀 장면에서 빨간 공 하나를 찾는 과정을 단계별로 직접 비교해보세요 — 블러가 노이즈를 죽이고, HSV의 H로 색을 골라내고, 열림·닫힘이 마스크를 다듬고, 마지막으로 그 마스크의 테두리(bounding box)가 곧 "물체를 찾았다"는 결과입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionPipeline extends w.HTMLElement {
    private noiseProb = 0.05;
    private blurKernel = 5;
    private morphKernel = 3;
    private scene: ColorGrid = generateScene(this.noiseProb);

    private refresh() {
      const scene = this.scene;
      const blurred = gaussianBlurColor(scene, this.blurKernel);
      const mask = redInRange(blurred);
      const opened = open_(mask, this.morphKernel);
      const closed = close_(opened, this.morphKernel);

      const q = (id: string) => this.shadowRoot?.querySelector(`#${id}`) as HTMLCanvasElement;
      drawColor(q('pl-orig'), scene);
      drawColor(q('pl-blur'), blurred);
      drawMask(q('pl-mask'), mask);
      drawMask(q('pl-open'), opened);
      drawMask(q('pl-close'), closed);
      drawOverlay(q('pl-result'), scene, closed);

      const blurVal = this.shadowRoot?.querySelector('#pl-blur-val') as HTMLElement;
      if (blurVal) blurVal.textContent = `${this.blurKernel}×${this.blurKernel}`;
      const morphVal = this.shadowRoot?.querySelector('#pl-morph-val') as HTMLElement;
      if (morphVal) morphVal.textContent = `${this.morphKernel}×${this.morphKernel}`;
      const noiseVal = this.shadowRoot?.querySelector('#pl-noise-val') as HTMLElement;
      if (noiseVal) noiseVal.textContent = `${Math.round(this.noiseProb * 100)}%`;
    }

    @addEventListener('#pl-blur-kernel', 'input')
    onBlurKernel(e: Event) {
      const v = Number((e.target as HTMLInputElement).value) || 1;
      this.blurKernel = v % 2 === 0 ? v + 1 : v;
      this.refresh();
    }

    @addEventListener('#pl-morph-kernel', 'input')
    onMorphKernel(e: Event) {
      const v = Number((e.target as HTMLInputElement).value) || 1;
      this.morphKernel = v % 2 === 0 ? v + 1 : v;
      this.refresh();
    }

    @addEventListener('#pl-noise', 'input')
    onNoise(e: Event) {
      this.noiseProb = (Number((e.target as HTMLInputElement).value) || 0) / 100;
      this.scene = generateScene(this.noiseProb);
      this.refresh();
    }

    @addEventListener('#pl-regen', 'click')
    onRegen() {
      this.scene = generateScene(this.noiseProb);
      this.refresh();
    }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const panel = (id: string, label: string) => `
        <div class="pl-panel">
          <canvas width="${W}" height="${H}" id="${id}"></canvas>
          <div class="pl-panel-label">${label}</div>
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
          .pl-strip { display:flex; gap:10px; margin-top:14px; flex-wrap:wrap; justify-content:center; }
          .pl-panel { text-align:center; }
          .pl-panel-label { font-size:10.5px; font-weight:700; color:#475569; margin-top:4px; max-width:${W}px; }
          canvas { display:block; width:${W}px; height:${H}px; border-radius:6px; border:1px solid #e2e8f0; image-rendering:pixelated; background:#000; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .pl-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .pl-intro b { color:#0369a1; }
        </style>

        <div class="pl-intro">
          지금까지 본 블러·HSV·이진화·모폴로지를 전부 이어 붙이면 "색상 객체 검출기"가 됩니다: <b>BGR → 블러 → HSV 변환 → inRange(색 범위) → 열림 → 닫힘 → 깨끗한 마스크</b>. 노이즈 낀 장면에서 빨간 공 하나를 찾는 전체 과정을 단계별로 직접 비교해보세요.<br><br>
          이 일곱 단계가 19강에서는 코드 15줄이 되고, 컨투어(윤곽선) 추출만 더하면 완성된 검출기가 됩니다. 로봇 팔이 빨간 블록을 집기 전 "어디 있는지"를 찾는 첫 단계가 바로 이것이고, 그 중심 좌표는 18강 PnP·22강 통합 파이프라인에서 3D 포즈로 승격됩니다.
        </div>

        <div class="math-desc">빨간 공을 찾는 전체 파이프라인 — 각 단계를 거칠 때마다 마스크가 어떻게 깨끗해지는지 비교해보세요.</div>

        <div class="ctl"><label>블러 커널 <input id="pl-blur-kernel" type="range" min="1" max="9" step="2" value="${this.blurKernel}"><b id="pl-blur-val">${this.blurKernel}×${this.blurKernel}</b></label></div>
        <div class="ctl"><label>모폴로지 커널 <input id="pl-morph-kernel" type="range" min="1" max="9" step="2" value="${this.morphKernel}"><b id="pl-morph-val">${this.morphKernel}×${this.morphKernel}</b></label></div>
        <div class="ctl"><label>노이즈 비율 <input id="pl-noise" type="range" min="0" max="20" step="1" value="${Math.round(this.noiseProb * 100)}"><b id="pl-noise-val">${Math.round(this.noiseProb * 100)}%</b></label> <button id="pl-regen">장면 재생성</button></div>

        <div class="pl-strip">
          ${panel('pl-orig', '① 원본(BGR)')}
          ${panel('pl-blur', '② GaussianBlur')}
          ${panel('pl-mask', '③ inRange(HSV)')}
          ${panel('pl-open', '④ 열림')}
          ${panel('pl-close', '⑤ 닫힘(최종 마스크)')}
          ${panel('pl-result', '⑥ 검출 결과')}
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
