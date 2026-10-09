import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-filtering';

const W = 100;
const H = 80;

type FilterType = 'none' | 'box' | 'gaussian' | 'median' | 'bilateral';

const FILTERS: { id: FilterType; label: string; principle: string; feature: string }[] = [
  { id: 'none', label: '원본(필터 없음)', principle: '-', feature: '노이즈 그대로' },
  { id: 'box', label: '평균 블러(blur)', principle: '주변 픽셀 평균', feature: '빠르지만 경계도 뭉갬' },
  { id: 'gaussian', label: '가우시안(GaussianBlur)', principle: '거리 가중 평균', feature: '자연스러운 표준 선택' },
  { id: 'median', label: '미디언(medianBlur)', principle: '주변의 중앙값', feature: '소금·후추 노이즈에 특효' },
  { id: 'bilateral', label: '양방향(bilateralFilter)', principle: '색이 비슷한 이웃만 평균', feature: '경계 보존, 느림' },
];

const clampIdx = (v: number, max: number) => Math.max(0, Math.min(max - 1, v));

function generateNoisyCircle(noiseProb: number): number[][] {
  const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.3;
  const grid: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) {
      const inCircle = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      let v = inCircle ? 60 : 210;
      if (Math.random() < noiseProb) v = Math.random() < 0.5 ? 0 : 255; // 소금·후추 노이즈
      row.push(v);
    }
    grid.push(row);
  }
  return grid;
}

function boxBlur(grid: number[][], k: number): number[][] {
  const half = Math.floor(k / 2);
  const out: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) {
      let sum = 0, count = 0;
      for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) {
        sum += grid[clampIdx(y + dy, H)][clampIdx(x + dx, W)];
        count++;
      }
      row.push(sum / count);
    }
    out.push(row);
  }
  return out;
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

/** 분리 가능(separable) 가우시안 — 가로 1D 컨볼루션 후 세로 1D 컨볼루션 (2D와 결과 동일, 연산량만 줄임). */
function gaussianBlur(grid: number[][], k: number): number[][] {
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

function medianBlur(grid: number[][], k: number): number[][] {
  const half = Math.floor(k / 2);
  const out: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) {
      const vals: number[] = [];
      for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) {
        vals.push(grid[clampIdx(y + dy, H)][clampIdx(x + dx, W)]);
      }
      vals.sort((a, b) => a - b);
      row.push(vals[Math.floor(vals.length / 2)]);
    }
    out.push(row);
  }
  return out;
}

/** 공간 거리 가중 × 색(밝기) 유사도 가중 — 경계(밝기 차 큰 곳)는 평균에서 빠져서 안 뭉개진다. */
function bilateralFilter(grid: number[][], k: number): number[][] {
  const half = Math.floor(k / 2);
  const sigmaSpace = half || 1;
  const sigmaColor = 30;
  const out: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) {
      const center = grid[y][x];
      let sum = 0, wsum = 0;
      for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) {
        const val = grid[clampIdx(y + dy, H)][clampIdx(x + dx, W)];
        const spaceW = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaSpace * sigmaSpace));
        const colorW = Math.exp(-((val - center) ** 2) / (2 * sigmaColor * sigmaColor));
        const wgt = spaceW * colorW;
        sum += val * wgt;
        wsum += wgt;
      }
      row.push(sum / wsum);
    }
    out.push(row);
  }
  return out;
}

/** Sobel X 커널 — 블러와 똑같은 "3×3 커널을 이미지 위로 밀며 내적"하는 컨볼루션이지만, 가중치가 달라 흐리는 대신 가로 방향 밝기 변화(수직 경계)를 뽑아낸다. */
function sobelEdge(grid: number[][]): number[][] {
  const kernel = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
  const out: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        sum += grid[clampIdx(y + dy, H)][clampIdx(x + dx, W)] * kernel[dy + 1][dx + 1];
      }
      row.push(Math.abs(sum));
    }
    out.push(row);
  }
  return out;
}

function applyFilter(grid: number[][], type: FilterType, k: number): number[][] {
  if (type === 'box') return boxBlur(grid, k);
  if (type === 'gaussian') return gaussianBlur(grid, k);
  if (type === 'median') return medianBlur(grid, k);
  if (type === 'bilateral') return bilateralFilter(grid, k);
  return grid;
}

function drawGrid(canvas: HTMLCanvasElement, grid: number[][]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = Math.max(0, Math.min(255, Math.round(grid[y][x])));
      const i = (y * W + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

const MD = `
## 필터링 — 노이즈를 눌러야 마스크가 깨끗하다
- 카메라 픽셀에는 센서 노이즈가 섞여 있고, 그대로 \`inRange\`를 하면 마스크에 소금 뿌린 듯한 점이 남습니다. 이미지도 **블러(저역통과)** 로 다듬고 시작합니다.
- 연산의 정체는 **컨볼루션** — 작은 커널 행렬을 이미지 위로 밀며 내적하는 것입니다. 커널을 바꾸면 블러가 아니라 **에지 검출(Sobel)** 도 됩니다 — 연산은 하나(컨볼루션), 커널이 역할을 정합니다. 맨 오른쪽 Sobel 패널이 그 증거입니다: 블러와 똑같은 3×3 컨볼루션인데 가중치만 달라서 경계만 하얗게 뜹니다.
- 네 필터를 동시에 비교해보세요: **평균**은 빠르지만 경계가 뭉개지고, **가우시안**은 그보다 자연스럽고, **미디언**은 소금·후추 노이즈(0/255로 튀는 값)를 거의 완벽히 지우고, **양방향**은 경계(밝기 차가 큰 곳)를 보존하면서 평평한 영역만 부드럽게 만듭니다.
- 커널 크기를 키우면 노이즈는 더 잘 지워지지만 경계도 더 많이 뭉개집니다.
- 이 중 **가우시안 블러 단계는 이 페이지의 파이프라인 조립 탭, 19강 HSV 마스킹**에서 색 검출 전 전처리로 그대로 재사용됩니다. 현실에서는 인스타그램 같은 보정 필터, 사진 노이즈 제거 앱이 전부 이 블러 연산을 쓰고 있습니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionFiltering extends w.HTMLElement {
    private noiseProb = 0.08;
    private kernelSize = 5;
    private grid: number[][] = generateNoisyCircle(this.noiseProb);

    private refresh() {
      const q = (id: string) => this.shadowRoot?.querySelector(`#${id}`) as HTMLCanvasElement;
      FILTERS.forEach(f => {
        const canvas = q(`vf-${f.id}`);
        if (canvas) drawGrid(canvas, applyFilter(this.grid, f.id, this.kernelSize));
      });
      const sobelCanvas = q('vf-sobel');
      if (sobelCanvas) drawGrid(sobelCanvas, sobelEdge(this.grid));

      const kernelVal = this.shadowRoot?.querySelector('#vf-kernel-val') as HTMLElement;
      if (kernelVal) kernelVal.textContent = `${this.kernelSize}×${this.kernelSize}`;
      const noiseVal = this.shadowRoot?.querySelector('#vf-noise-val') as HTMLElement;
      if (noiseVal) noiseVal.textContent = `${Math.round(this.noiseProb * 100)}%`;
    }

    @addEventListener('#vf-kernel', 'input')
    onKernel(e: Event) {
      const v = Number((e.target as HTMLInputElement).value) || 3;
      this.kernelSize = v % 2 === 0 ? v + 1 : v; // 커널은 항상 홀수
      this.refresh();
    }

    @addEventListener('#vf-noise', 'input')
    onNoise(e: Event) {
      this.noiseProb = (Number((e.target as HTMLInputElement).value) || 0) / 100;
      this.grid = generateNoisyCircle(this.noiseProb);
      this.refresh();
    }

    @addEventListener('#vf-regen', 'click')
    onRegen() {
      this.grid = generateNoisyCircle(this.noiseProb);
      this.refresh();
    }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const rows = FILTERS.map(f => `<tr><td>${f.label}</td><td>${f.principle}</td><td>${f.feature}</td></tr>`).join('');
      const panel = (f: (typeof FILTERS)[number]) => `
        <div class="vf-panel">
          <canvas width="${W}" height="${H}" id="vf-${f.id}"></canvas>
          <div class="vf-panel-label">${f.label}</div>
        </div>`;
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .vf-table { width:100%; border-collapse:collapse; font-size:12px; margin-bottom:12px; }
          .vf-table th, .vf-table td { border:1px solid #e2e8f0; padding:6px 10px; text-align:left; }
          .vf-table th { background:#f0f9ff; color:#0369a1; font-weight:800; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:60px; text-align:right; color:#1e293b; }
          .ctl button { padding:4px 10px; border-radius:6px; border:1px solid #e2e8f0; background:#fff; cursor:pointer; font-size:12px; }
          .vf-strip { display:flex; gap:10px; margin-top:14px; flex-wrap:wrap; justify-content:center; }
          .vf-panel { text-align:center; }
          .vf-panel-label { font-size:10.5px; font-weight:700; color:#475569; margin-top:4px; max-width:${W}px; }
          canvas { display:block; width:${W}px; height:${H}px; border-radius:6px; border:1px solid #e2e8f0; image-rendering:pixelated; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .vf-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .vf-intro b { color:#0369a1; }
        </style>

        <div class="vf-intro">
          카메라 픽셀에는 항상 센서 노이즈가 섞입니다. 그대로 색 검출(inRange)을 하면 마스크에 소금 뿌린 듯한 잡점이 남으니, 먼저 <b>블러(흐리기)</b>로 노이즈를 눌러야 합니다. 그런데 블러에도 여러 종류가 있고, 노이즈를 지우는 능력과 경계(edge)를 보존하는 능력이 서로 트레이드오프입니다 — 아래 표와 그림으로 비교해보세요.
        </div>

        <table class="vf-table">
          <tr><th>필터</th><th>원리</th><th>특징</th></tr>
          ${rows}
        </table>

        <div class="math-desc">같은 노이즈 낀 원본에 필터 4종을 동시에 적용해 비교해보세요 — 노이즈 제거력과 경계 보존력의 차이가 한눈에 보입니다.</div>

        <div class="ctl"><label>커널 크기(홀수) <input id="vf-kernel" type="range" min="1" max="9" step="2" value="${this.kernelSize}"><b id="vf-kernel-val">${this.kernelSize}×${this.kernelSize}</b></label></div>
        <div class="ctl"><label>노이즈 비율 <input id="vf-noise" type="range" min="0" max="25" step="1" value="${Math.round(this.noiseProb * 100)}"><b id="vf-noise-val">${Math.round(this.noiseProb * 100)}%</b></label> <button id="vf-regen">노이즈 재생성</button></div>

        <div class="vf-strip">
          ${FILTERS.map(panel).join('')}
          <div class="vf-panel">
            <canvas width="${W}" height="${H}" id="vf-sobel"></canvas>
            <div class="vf-panel-label">Sobel 엣지(같은 컨볼루션, 다른 커널)</div>
          </div>
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
