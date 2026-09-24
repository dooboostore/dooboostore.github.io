import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-lens-distortion';

const CANVAS_SIZE = 240;
const SCALE = 95; // 정규화 좌표(-1~1) -> 픽셀
const EX_SIZE = 130; // 아래 유형별 예시 패널용 작은 캔버스
const EX_SCALE = 50;
const LINES = [-0.8, -0.4, 0, 0.4, 0.8];
const SAMPLES = 24; // 곡선을 부드럽게 그리기 위한 선분당 샘플 수

type DistortParams = { k1: number; k2: number; k3: number; p1: number; p2: number };

const EXAMPLES: { id: string; label: string; params: DistortParams | null }[] = [
  { id: 'ld-ex-none', label: '원본(왜곡 없음)', params: null },
  { id: 'ld-ex-barrel', label: '배럴(barrel)\nk1=-0.35', params: { k1: -0.35, k2: 0, k3: 0, p1: 0, p2: 0 } },
  { id: 'ld-ex-pincushion', label: '핀쿠션(pincushion)\nk1=+0.35', params: { k1: 0.35, k2: 0, k3: 0, p1: 0, p2: 0 } },
  { id: 'ld-ex-tangential', label: '접선(tangential)\np1=0.05, p2=0.04', params: { k1: 0, k2: 0, k3: 0, p1: 0.05, p2: 0.04 } },
];

/** OpenCV 표준 방사+접선 왜곡 모델. */
function distort(x: number, y: number, p: DistortParams): [number, number] {
  const r2 = x * x + y * y;
  const radial = 1 + p.k1 * r2 + p.k2 * r2 * r2 + p.k3 * r2 * r2 * r2;
  const xTan = 2 * p.p1 * x * y + p.p2 * (r2 + 2 * x * x);
  const yTan = p.p1 * (r2 + 2 * y * y) + 2 * p.p2 * x * y;
  return [x * radial + xTan, y * radial + yTan];
}

function drawGrid(canvas: HTMLCanvasElement, p: DistortParams | null, size = CANVAS_SIZE, scale = SCALE) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const center = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = p ? '#0369a1' : '#94a3b8';
  ctx.lineWidth = 1.3;

  const toScreen = (x: number, y: number): [number, number] => {
    const [dx, dy] = p ? distort(x, y, p) : [x, y];
    return [center + dx * scale, center + dy * scale];
  };

  // 세로선들 (x 고정, y가 -1~1로 변화)
  LINES.forEach(x => {
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
      const y = -1 + (2 * i) / SAMPLES;
      const [sx, sy] = toScreen(x, y);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  });
  // 가로선들 (y 고정, x가 -1~1로 변화)
  LINES.forEach(y => {
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
      const x = -1 + (2 * i) / SAMPLES;
      const [sx, sy] = toScreen(x, y);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  });
}

const MD = `
## 렌즈 왜곡 — 이상적 핀홀과 현실의 차이
- 렌즈가 광축에서 멀수록 빛을 더(또는 덜) 꺾어서 직선이 굽어 보입니다 — **방사 왜곡(radial)**: \`x_dist = x(1+k1·r²+k2·r⁴+k3·r⁶)\`, \`r²=x²+y²\`
- **배럴(barrel)**: \`k1<0\` — 바깥이 부풀어 보임(술통), 광각·웹캠의 전형
- **핀쿠션(pincushion)**: \`k1>0\` — 바깥이 오므라듦(바늘꽂이), 망원의 전형
- **접선 왜곡(tangential)**: \`p1, p2\` — 렌즈와 센서가 완벽히 평행하지 않을 때 생기는 비대칭 왜곡. 방사보다 훨씬 작지만 정밀 작업에선 무시할 수 없습니다.
- 중심(r=0)에서는 왜곡이 없고, **가장자리로 갈수록 휘는 정도가 커집니다** — 화면 구석에서 기하를 잴 때 오차가 큰 이유입니다.
- OpenCV의 왜곡 계수 묶음: \`(k1, k2, p1, p2, k3)\` — 20강 캘리브레이션의 출력물입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionLensDistortion extends w.HTMLElement {
    private k1 = -0.2;
    private k2 = 0;
    private k3 = 0;
    private p1 = 0;
    private p2 = 0;

    private refresh() {
      EXAMPLES.forEach(ex => {
        const canvas = this.shadowRoot?.querySelector(`#${ex.id}`) as HTMLCanvasElement;
        if (canvas) drawGrid(canvas, ex.params, EX_SIZE, EX_SCALE);
      });

      const origCanvas = this.shadowRoot?.querySelector('#ld-orig') as HTMLCanvasElement;
      const distCanvas = this.shadowRoot?.querySelector('#ld-dist') as HTMLCanvasElement;
      if (origCanvas) drawGrid(origCanvas, null);
      if (distCanvas) drawGrid(distCanvas, { k1: this.k1, k2: this.k2, k3: this.k3, p1: this.p1, p2: this.p2 });

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#ld-k1-val', this.k1.toFixed(2));
      setText('#ld-k2-val', this.k2.toFixed(2));
      setText('#ld-k3-val', this.k3.toFixed(2));
      setText('#ld-p1-val', this.p1.toFixed(3));
      setText('#ld-p2-val', this.p2.toFixed(3));

      const kindEl = this.shadowRoot?.querySelector('#ld-kind') as HTMLElement;
      if (kindEl) {
        kindEl.textContent =
          this.k1 < -0.02 ? `배럴(barrel) — k1=${this.k1.toFixed(2)} < 0` :
          this.k1 > 0.02 ? `핀쿠션(pincushion) — k1=${this.k1.toFixed(2)} > 0` :
          '왜곡 거의 없음 (k1 ≈ 0)';
      }
    }

    @addEventListener('#ld-k1', 'input')
    onK1(e: Event) { this.k1 = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#ld-k2', 'input')
    onK2(e: Event) { this.k2 = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#ld-k3', 'input')
    onK3(e: Event) { this.k3 = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#ld-p1', 'input')
    onP1(e: Event) { this.p1 = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#ld-p2', 'input')
    onP2(e: Event) { this.p2 = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:55px; text-align:right; color:#1e293b; }
          .ld-canvases { display:flex; gap:16px; margin-top:14px; flex-wrap:wrap; justify-content:center; }
          .ld-canvas-box { text-align:center; }
          .ld-canvas-label { font-size:12px; font-weight:700; color:#475569; margin-bottom:6px; }
          canvas { display:block; width:${CANVAS_SIZE}px; height:${CANVAS_SIZE}px; border-radius:8px; border:1px solid #e2e8f0; }
          .ld-ex-strip { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; justify-content:center; }
          .ld-ex-panel { text-align:center; }
          .ld-ex-panel canvas { width:${EX_SIZE}px; height:${EX_SIZE}px; }
          .ld-ex-label { font-size:10.5px; font-weight:700; color:#475569; margin-top:4px; max-width:${EX_SIZE}px; white-space:pre-line; line-height:1.4; }
          .ld-kind { text-align:center; font-size:13px; font-weight:800; color:#0369a1; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 12px; margin-top:12px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .ld-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .ld-intro b { color:#0369a1; }
        </style>

        <div class="ld-intro">
          진짜 핀홀 카메라는 빛이 너무 적어서 못 씁니다 — 렌즈로 빛을 모으는 대가로 <b>렌즈 왜곡(distortion)</b>이 생깁니다. 렌즈가 광축에서 멀수록 빛을 더(또는 덜) 꺾어서 직선이 굽어 보이는 게 <b>방사 왜곡</b>이고, 렌즈·센서가 완벽히 평행하지 않아 생기는 비대칭 왜곡이 <b>접선 왜곡</b>입니다. 중심에서는 왜곡이 없고 가장자리로 갈수록 커집니다.
        </div>

        <div class="math-desc">왜곡 유형별 전형적인 모습부터 한눈에 보세요 — 배럴·핀쿠션은 방사 왜곡, 접선은 비대칭으로 비뚤어지는 게 특징입니다.</div>
        <div class="ld-ex-strip">
          ${EXAMPLES.map(ex => `
            <div class="ld-ex-panel">
              <canvas width="${EX_SIZE}" height="${EX_SIZE}" id="${ex.id}"></canvas>
              <div class="ld-ex-label">${ex.label}</div>
            </div>`).join('')}
        </div>

        <div class="math-desc">아래 슬라이더로 직접 조합해보세요 — 왼쪽은 왜곡 없는 원본 격자, 오른쪽은 적용 결과입니다.</div>

        <div class="ctl"><label>k1 (방사, 1차) <input id="ld-k1" type="range" min="-0.4" max="0.4" step="0.01" value="${this.k1}"><b id="ld-k1-val">${this.k1.toFixed(2)}</b></label></div>
        <div class="ctl"><label>k2 (방사, 2차) <input id="ld-k2" type="range" min="-0.3" max="0.3" step="0.01" value="${this.k2}"><b id="ld-k2-val">${this.k2.toFixed(2)}</b></label></div>
        <div class="ctl"><label>k3 (방사, 3차) <input id="ld-k3" type="range" min="-0.2" max="0.2" step="0.01" value="${this.k3}"><b id="ld-k3-val">${this.k3.toFixed(2)}</b></label></div>
        <div class="ctl"><label>p1 (접선) <input id="ld-p1" type="range" min="-0.05" max="0.05" step="0.002" value="${this.p1}"><b id="ld-p1-val">${this.p1.toFixed(3)}</b></label></div>
        <div class="ctl"><label>p2 (접선) <input id="ld-p2" type="range" min="-0.05" max="0.05" step="0.002" value="${this.p2}"><b id="ld-p2-val">${this.p2.toFixed(3)}</b></label></div>

        <div class="ld-canvases">
          <div class="ld-canvas-box">
            <div class="ld-canvas-label">원본(왜곡 없음)</div>
            <canvas width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" id="ld-orig"></canvas>
          </div>
          <div class="ld-canvas-box">
            <div class="ld-canvas-label">왜곡 적용</div>
            <canvas width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" id="ld-dist"></canvas>
          </div>
        </div>
        <div class="ld-kind" id="ld-kind"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
