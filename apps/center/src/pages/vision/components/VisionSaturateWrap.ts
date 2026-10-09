import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-saturate-wrap';

const STRIP_W = 256;
const STRIP_H = 48;

/** 8비트 정수 연산 두 가지 방식 — wrap(감김)은 256으로 나눈 나머지, saturate(포화)는 0~255로 clamp. */
const wrap8 = (v: number): number => ((v % 256) + 256) % 256;
const saturate8 = (v: number): number => Math.max(0, Math.min(255, v));

const MD = `
## uint8 오버플로 — 감김(wrap) vs 포화(saturate)
- 디지털 이미지의 픽셀값은 보통 **8비트(0~255)**로 저장됩니다. 밝기를 더하는 연산을 하면 이 범위를 넘어가는 경우가 생기는데, 처리 방식이 두 가지입니다.
- **감김(wrap)**: \`(값) % 256\` — 256을 넘으면 다시 0부터 순환합니다. 예: \`250 + 10 = 4\`. 밝았던 픽셀이 갑자기 어두워지는 **검은 반점(artifact)** 이 생깁니다.
- **포화(saturate)**: 0~255 범위로 **clamp** — 넘치면 그냥 255(또는 0)에서 멈춥니다. 밝기 연산은 보통 이 방식(OpenCV의 \`cv2.add\`)을 씁니다.
- 아래 그래디언트(0→255)에 밝기를 더해보면, wrap은 중간에 검은 띠가 생기고 saturate는 끝부분이 하얗게 뭉개지는(clipping) 차이가 보입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionSaturateWrap extends w.HTMLElement {
    private delta = 30;

    private drawStrip(canvas: HTMLCanvasElement, transform: (v: number) => number) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const img = ctx.createImageData(STRIP_W, STRIP_H);
      for (let x = 0; x < STRIP_W; x++) {
        const gray = transform(x);
        for (let y = 0; y < STRIP_H; y++) {
          const i = (y * STRIP_W + x) * 4;
          img.data[i] = gray;
          img.data[i + 1] = gray;
          img.data[i + 2] = gray;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    private refresh() {
      const d = this.delta;
      const origCanvas = this.shadowRoot?.querySelector('#sw-orig') as HTMLCanvasElement;
      const wrapCanvas = this.shadowRoot?.querySelector('#sw-wrap') as HTMLCanvasElement;
      const satCanvas = this.shadowRoot?.querySelector('#sw-sat') as HTMLCanvasElement;
      if (origCanvas) this.drawStrip(origCanvas, x => x);
      if (wrapCanvas) this.drawStrip(wrapCanvas, x => wrap8(x + d));
      if (satCanvas) this.drawStrip(satCanvas, x => saturate8(x + d));

      const deltaVal = this.shadowRoot?.querySelector('#sw-delta-val') as HTMLElement;
      if (deltaVal) deltaVal.textContent = `${d >= 0 ? '+' : ''}${d}`;

      const desc = this.shadowRoot?.querySelector('#sw-desc') as HTMLElement;
      if (desc) desc.textContent = `그래디언트(0→255)에 밝기 ${d >= 0 ? '+' : ''}${d}를 더했을 때 wrap과 saturate의 결과 차이를 비교해보세요.`;

      const example = this.shadowRoot?.querySelector('#sw-example') as HTMLElement;
      if (example) {
        const base = 250;
        example.innerHTML =
          `<div>${base} ${d >= 0 ? '+' : '-'} ${Math.abs(d)} = <b>${base + d}</b> → wrap: <b style="color:#0369a1">${wrap8(base + d)}</b> / saturate: <b style="color:#dc2626">${saturate8(base + d)}</b></div>`;
      }
    }

    @addEventListener('#sw-delta', 'input')
    onDelta(e: Event) {
      this.delta = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @onConnectedAfter
    onReady() {
      this.refresh();
    }

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
          .sw-row { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
          .sw-label { font-size:12px; font-weight:700; color:#475569; }
          canvas { display:block; width:100%; max-width:${STRIP_W}px; height:${STRIP_H}px; border-radius:6px; border:1px solid #e2e8f0; image-rendering:pixelated; }
          .sw-example { font-size:13px; font-weight:700; color:#1e293b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin-top:10px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .sw-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .sw-intro b { color:#0369a1; }
        </style>

        <div class="sw-intro">
          이미지 픽셀은 보통 <b>8비트(0~255)</b>로 저장됩니다. 밝기를 "더하는" 연산을 하면 이 범위를 쉽게 넘어가는데, 그걸 처리하는 방식이 두 가지입니다 — 범위를 넘으면 다시 0부터 도는 <b>감김(wrap)</b>, 끝에서 멈추는 <b>포화(saturate)</b>. 같은 "밝기 +30" 연산인데도 어떤 방식을 쓰느냐에 따라 결과 그림이 완전히 달라집니다 — 아래에서 직접 비교해보세요.<br><br>
          현실에서는 사진이 하얗게 날아가는 노출 과다(overexposure)가 바로 saturate, 옛날 아날로그 계기판 바늘이 끝까지 돌았다가 다시 0으로 튀는 게 wrap입니다. 이 뒤로 나올 필터링·모폴로지·Pipeline 탭의 모든 픽셀 연산은 결과를 항상 0~255로 <b>clamp(saturate)</b>하는 이 방식을 기본으로 깔고 갑니다.
        </div>

        <div class="math-desc" id="sw-desc"></div>

        <div class="ctl"><label>더할 밝기(Δ) <input id="sw-delta" type="range" min="-200" max="200" step="1" value="${this.delta}"><b id="sw-delta-val">${this.delta}</b></label></div>

        <div class="sw-row">
          <span class="sw-label">원본 그래디언트 (0 → 255)</span>
          <canvas width="${STRIP_W}" height="${STRIP_H}" id="sw-orig"></canvas>
        </div>
        <div class="sw-row">
          <span class="sw-label">wrap(감김): (x+Δ) % 256</span>
          <canvas width="${STRIP_W}" height="${STRIP_H}" id="sw-wrap"></canvas>
        </div>
        <div class="sw-row">
          <span class="sw-label">saturate(포화): clamp(x+Δ, 0, 255)</span>
          <canvas width="${STRIP_W}" height="${STRIP_H}" id="sw-sat"></canvas>
        </div>

        <div class="sw-example" id="sw-example"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
