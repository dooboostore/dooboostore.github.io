import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-color-space';

const WHEEL_SIZE = 160;
const WHEEL_R = 72;
const WHEEL_C = WHEEL_SIZE / 2;

/** OpenCV 스케일의 HSV(H:0~179, S/V:0~255) → RGB(0~255). H를 2배(0~359°)로 펴서 표준 HSV 공식 적용. */
function hsvCvToRgb(hCv: number, sCv: number, vCv: number): [number, number, number] {
  const h = (hCv * 2) % 360;
  const s = sCv / 255;
  const v = vCv / 255;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

const rgbCss = (r: number, g: number, b: number) => `rgb(${r},${g},${b})`;

/** 원판 — 각도=Hue, 중심에서의 거리=Saturation (V는 항상 255 고정, 그래서 "평면"이 아니라 HSV 원뿔의 맨 윗면). */
function drawWheel(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(WHEEL_SIZE, WHEEL_SIZE);
  for (let y = 0; y < WHEEL_SIZE; y++) {
    for (let x = 0; x < WHEEL_SIZE; x++) {
      const dx = x - WHEEL_C, dy = y - WHEEL_C;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * WHEEL_SIZE + x) * 4;
      if (dist > WHEEL_R) { img.data[i + 3] = 0; continue; }
      let angleDeg = (Math.atan2(-dy, dx) * 180) / Math.PI;
      if (angleDeg < 0) angleDeg += 360;
      const hCv = Math.round(angleDeg / 2) % 180;
      const sCv = Math.round(Math.min(1, dist / WHEEL_R) * 255);
      const [r, g, b] = hsvCvToRgb(hCv, sCv, 255);
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawWheelMarker(canvas: HTMLCanvasElement, hue: number, sat: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const angleRad = ((hue * 2) * Math.PI) / 180;
  const dist = (sat / 255) * WHEEL_R;
  const mx = WHEEL_C + dist * Math.cos(angleRad);
  const my = WHEEL_C - dist * Math.sin(angleRad);
  ctx.beginPath();
  ctx.arc(mx, my, 6, 0, Math.PI * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(mx, my, 6, 0, Math.PI * 2);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** 원판 위 클릭/드래그 좌표 → (hue, sat). 중심 밖을 누르면 반지름 끝(채도 255)으로 clamp. */
function wheelPointToHs(canvas: HTMLCanvasElement, clientX: number, clientY: number): { hue: number; sat: number } {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * WHEEL_SIZE;
  const y = ((clientY - rect.top) / rect.height) * WHEEL_SIZE;
  const dx = x - WHEEL_C, dy = y - WHEEL_C;
  const dist = Math.min(WHEEL_R, Math.sqrt(dx * dx + dy * dy));
  let angleDeg = (Math.atan2(-dy, dx) * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 360;
  return { hue: Math.round(angleDeg / 2) % 180, sat: Math.round((dist / WHEEL_R) * 255) };
}

/** 두 조건(A/B)의 같은 채널 값을 막대 두 개로 비교 — PDF의 그룹 막대그래프를 그대로 HTML/CSS로. */
function barGroup(label: string, valA: number, valB: number, max: number, colorA: string, colorB: string): string {
  const hA = Math.max(2, Math.round((valA / max) * 80));
  const hB = Math.max(2, Math.round((valB / max) * 80));
  return `
    <div class="bg-group">
      <div class="bg-bars">
        <div class="bg-bar" style="height:${hA}px;background:${colorA}" title="조건A: ${valA}"></div>
        <div class="bg-bar" style="height:${hB}px;background:${colorB}" title="조건B: ${valB}"></div>
      </div>
      <div class="bg-label">${label}</div>
    </div>`;
}

const MD = `
## 색공간 — 왜 HSV인가
- BGR(RGB)은 **밝기 정보가 세 채널에 골고루 섞여** 있어서, 조명이 바뀌면 세 숫자가 전부 같이 움직입니다.
- HSV는 "무슨 색인가(H)"와 "얼마나 밝은가(V)"를 **분리**해 놓은 좌표계라, 조명 변화는 주로 **V만** 흔들고 **H는 거의 그대로**입니다.
- 위 색상환은 HSV 원뿔의 맨 윗면(V=255)을 위에서 내려다본 모습입니다 — **각도=Hue**, **중심에서 거리=Saturation**. 원판을 클릭/드래그해서 H·S를 직접 골라보세요. 그 옆 막대는 **Value(원뿔의 높이)** 축이고, 아래로 갈수록 검정(V=0)에 가까워집니다.
- 수학적으로도 그렇습니다: H·S를 고정하고 V만 k배 하면, 변환된 R·G·B도 **똑같이 k배**가 됩니다 — 그래서 아래 "조명 세기"를 바꾸면 RGB 막대 3개가 비율 그대로 다 같이 줄어드는데, HSV 막대는 V만 줄고 H·S는 그대로인 걸 볼 수 있어요.
- **주의 — 빨강은 두 조각**: OpenCV의 H는 0~179로 감기는 원형 척도라, 빨강(0° 근처)은 \`H∈[0,10]\`과 \`H∈[170,179]\` **두 범위의 OR**로 잡아야 합니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionColorSpace extends w.HTMLElement {
    private hue = 2;   // OpenCV H: 0~179 (2 ≈ 빨강)
    private sat = 200; // 0~255
    private val = 220; // 0~255 (조건A = 밝은 조명)
    private lightingFactor = 0.4; // 조건B = 조건A의 V에 이 비율을 곱함 (어두운 조명)
    private wheelDragging = false;
    private vBarDragging = false;

    private refresh() {
      const { hue, sat, val, lightingFactor } = this;
      const valB = Math.round(val * lightingFactor);
      const [rA, gA, bA] = hsvCvToRgb(hue, sat, val);
      const [rB, gB, bB] = hsvCvToRgb(hue, sat, valB);

      const wheelCanvas = this.shadowRoot?.querySelector('#cs-wheel') as HTMLCanvasElement;
      if (wheelCanvas) { drawWheel(wheelCanvas); drawWheelMarker(wheelCanvas, hue, sat); }

      const [fullR, fullG, fullB] = hsvCvToRgb(hue, sat, 255);
      const vBar = this.shadowRoot?.querySelector('#cs-vbar') as HTMLElement;
      if (vBar) vBar.style.background = `linear-gradient(to top, #000, ${rgbCss(fullR, fullG, fullB)})`;
      const vBarMarker = this.shadowRoot?.querySelector('#cs-vbar-marker') as HTMLElement;
      if (vBarMarker) vBarMarker.style.bottom = `${(val / 255) * 100}%`;

      const swatchA = this.shadowRoot?.querySelector('#cs-swatch-a') as HTMLElement;
      const swatchB = this.shadowRoot?.querySelector('#cs-swatch-b') as HTMLElement;
      if (swatchA) swatchA.style.background = rgbCss(rA, gA, bA);
      if (swatchB) swatchB.style.background = rgbCss(rB, gB, bB);

      const readA = this.shadowRoot?.querySelector('#cs-read-a') as HTMLElement;
      const readB = this.shadowRoot?.querySelector('#cs-read-b') as HTMLElement;
      if (readA) readA.innerHTML = `RGB(${rA},${gA},${bA})<br>HSV(${hue},${sat},${val})`;
      if (readB) readB.innerHTML = `RGB(${rB},${gB},${bB})<br>HSV(${hue},${sat},${valB})`;

      const rgbChart = this.shadowRoot?.querySelector('#cs-rgb-chart') as HTMLElement;
      if (rgbChart) rgbChart.innerHTML =
        barGroup('R', rA, rB, 255, '#ef4444', '#fca5a5') +
        barGroup('G', gA, gB, 255, '#22c55e', '#86efac') +
        barGroup('B', bA, bB, 255, '#3b82f6', '#93c5fd');

      const hsvChart = this.shadowRoot?.querySelector('#cs-hsv-chart') as HTMLElement;
      if (hsvChart) hsvChart.innerHTML =
        barGroup('H', hue, hue, 179, '#f59e0b', '#fde68a') +
        barGroup('S', sat, sat, 255, '#f59e0b', '#fde68a') +
        barGroup('V', val, valB, 255, '#f59e0b', '#fde68a');

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#cs-hue-val', String(hue));
      setText('#cs-sat-val', String(sat));
      setText('#cs-val-val', String(val));
      setText('#cs-light-val', `×${lightingFactor.toFixed(2)}`);
    }

    private setFromWheel(e: MouseEvent) {
      const canvas = this.shadowRoot?.querySelector('#cs-wheel') as HTMLCanvasElement;
      if (!canvas) return;
      const { hue, sat } = wheelPointToHs(canvas, e.clientX, e.clientY);
      this.hue = hue;
      this.sat = sat;
      this.refresh();
    }

    private setFromVBar(e: MouseEvent) {
      const bar = this.shadowRoot?.querySelector('#cs-vbar') as HTMLElement;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const frac = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      this.val = Math.round(frac * 255);
      this.refresh();
    }

    @addEventListener('#cs-wheel', 'mousedown')
    onWheelDown(e: MouseEvent) { this.wheelDragging = true; this.setFromWheel(e); }
    @addEventListener('#cs-wheel', 'mousemove')
    onWheelMove(e: MouseEvent) { if (this.wheelDragging) this.setFromWheel(e); }
    @addEventListener('#cs-wheel', 'mouseup')
    onWheelUp() { this.wheelDragging = false; }
    @addEventListener('#cs-wheel', 'mouseleave')
    onWheelLeave() { this.wheelDragging = false; }

    @addEventListener('#cs-vbar', 'mousedown')
    onVBarDown(e: MouseEvent) { this.vBarDragging = true; this.setFromVBar(e); }
    @addEventListener('#cs-vbar', 'mousemove')
    onVBarMove(e: MouseEvent) { if (this.vBarDragging) this.setFromVBar(e); }
    @addEventListener('#cs-vbar', 'mouseup')
    onVBarUp() { this.vBarDragging = false; }
    @addEventListener('#cs-vbar', 'mouseleave')
    onVBarLeave() { this.vBarDragging = false; }

    @addEventListener('#cs-hue', 'input')
    onHue(e: Event) { this.hue = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#cs-sat', 'input')
    onSat(e: Event) { this.sat = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#cs-val', 'input')
    onVal(e: Event) { this.val = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#cs-light', 'input')
    onLight(e: Event) { this.lightingFactor = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

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
          .ctl b { min-width:60px; text-align:right; color:#1e293b; }
          .cs-wheel-row { display:flex; gap:20px; align-items:flex-start; margin:14px 0; justify-content:center; flex-wrap:wrap; }
          .cs-wheel-box { text-align:center; }
          .cs-wheel-label { font-size:11px; font-weight:700; color:#475569; margin-top:6px; }
          canvas#cs-wheel { width:${WHEEL_SIZE}px; height:${WHEEL_SIZE}px; cursor:crosshair; touch-action:none; }
          .cs-vbar-box { text-align:center; }
          .cs-vbar-track { position:relative; width:28px; height:${WHEEL_SIZE}px; border-radius:6px; border:1px solid #e2e8f0; cursor:ns-resize; }
          .cs-vbar-marker { position:absolute; left:-4px; right:-4px; height:4px; background:#fff; border:1.5px solid #1e293b; border-radius:2px; transform:translateY(50%); pointer-events:none; }
          .cs-vbar-label { font-size:11px; font-weight:700; color:#475569; margin-top:6px; }
          .cs-swatches { display:flex; gap:16px; margin:12px 0; }
          .cs-swatch-box { flex:1; text-align:center; }
          .cs-swatch { width:100%; height:80px; border-radius:10px; border:1px solid #e2e8f0; }
          .cs-swatch-label { font-size:12px; font-weight:700; color:#475569; margin-top:6px; }
          .cs-read { font-size:11px; color:#64748b; margin-top:4px; line-height:1.5; }
          .cs-charts { display:flex; gap:20px; margin-top:16px; flex-wrap:wrap; }
          .cs-chart-box { flex:1; min-width:160px; }
          .cs-chart-title { font-size:12px; font-weight:800; color:#475569; margin-bottom:6px; text-align:center; }
          .bg-wrap { display:flex; justify-content:space-around; align-items:flex-end; height:90px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:4px 8px 0; }
          .bg-group { display:flex; flex-direction:column; align-items:center; gap:4px; }
          .bg-bars { display:flex; align-items:flex-end; gap:3px; height:80px; }
          .bg-bar { width:14px; border-radius:3px 3px 0 0; transition:height .15s ease; }
          .bg-label { font-size:11px; font-weight:800; color:#64748b; }
          .cs-legend { display:flex; gap:12px; font-size:11px; color:#64748b; margin-top:6px; justify-content:center; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .cs-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .cs-intro b { color:#0369a1; }
        </style>

        <div class="cs-intro">
          색으로 물체를 찾을 때 왜 <b>RGB 대신 HSV</b>를 쓸까요? RGB는 "무슨 색인가"와 "얼마나 밝은가"가 세 채널에 뒤섞여 있어서, 조명이 바뀌면 R·G·B가 전부 같이 흔들립니다. HSV는 이 둘을 <b>색(H·S)</b>과 <b>밝기(V)</b>로 분리해 놓은 좌표계라, 조명이 바뀌어도 H는 거의 그대로입니다 — 그래서 "빨간 공 찾기" 같은 작업에 HSV를 씁니다.<br><br>
          스마트폰 카메라 앱의 색상·채도·밝기 슬라이더가 바로 이 HSV 축입니다. 이 탭에서 고른 H·S 범위는 이 페이지의 <b>필터링·파이프라인 조립</b> 탭에서 그대로 재사용되고, 19강의 HSV 마스킹·컨투어 검출기의 기반이 됩니다.
        </div>

        <div class="math-desc">같은 물체(H·S 고정)를 밝은/어두운 조명(V) 두 조건에서 봤을 때, RGB와 HSV가 각각 얼마나 흔들리는지 비교해보세요.</div>

        <div class="ctl"><label>H (색상, 0~179) <input id="cs-hue" type="range" min="0" max="179" step="1" value="${this.hue}"><b id="cs-hue-val">${this.hue}</b></label></div>
        <div class="ctl"><label>S (채도) <input id="cs-sat" type="range" min="0" max="255" step="1" value="${this.sat}"><b id="cs-sat-val">${this.sat}</b></label></div>
        <div class="ctl"><label>V (명도, 조건A=밝음) <input id="cs-val" type="range" min="0" max="255" step="1" value="${this.val}"><b id="cs-val-val">${this.val}</b></label></div>
        <div class="ctl"><label>조명 세기(조건B 배율) <input id="cs-light" type="range" min="0.1" max="1" step="0.05" value="${this.lightingFactor}"><b id="cs-light-val">×${this.lightingFactor.toFixed(2)}</b></label></div>

        <div class="cs-wheel-row">
          <div class="cs-wheel-box">
            <canvas id="cs-wheel" width="${WHEEL_SIZE}" height="${WHEEL_SIZE}"></canvas>
            <div class="cs-wheel-label">Hue(각도)·Saturation(반지름) — 클릭/드래그</div>
          </div>
          <div class="cs-vbar-box">
            <div class="cs-vbar-track" id="cs-vbar">
              <div class="cs-vbar-marker" id="cs-vbar-marker"></div>
            </div>
            <div class="cs-vbar-label">Value(명도)</div>
          </div>
        </div>

        <div class="cs-swatches">
          <div class="cs-swatch-box">
            <div class="cs-swatch" id="cs-swatch-a"></div>
            <div class="cs-swatch-label">조건A — 밝은 조명</div>
            <div class="cs-read" id="cs-read-a"></div>
          </div>
          <div class="cs-swatch-box">
            <div class="cs-swatch" id="cs-swatch-b"></div>
            <div class="cs-swatch-label">조건B — 어두운 조명</div>
            <div class="cs-read" id="cs-read-b"></div>
          </div>
        </div>

        <div class="cs-charts">
          <div class="cs-chart-box">
            <div class="cs-chart-title">RGB: 세 채널이 함께 흔들린다</div>
            <div class="bg-wrap" id="cs-rgb-chart"></div>
          </div>
          <div class="cs-chart-box">
            <div class="cs-chart-title">HSV: 색(H)과 밝기(V)의 분리</div>
            <div class="bg-wrap" id="cs-hsv-chart"></div>
          </div>
        </div>
        <div class="cs-legend"><span>■ 조건A(밝음, 진한색)</span><span>■ 조건B(어두움, 연한색)</span></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
