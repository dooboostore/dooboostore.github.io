import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-pinhole';

const SCALE_Z = 40;
const SCALE_X = 55;
const PINHOLE_X = 55;
const PINHOLE_Y = 170;
const SVG_W = 420;
const SVG_H = 260;

const MD = `
## 핀홀 모델 — 닮은꼴 삼각형 하나
- 빛이 작은 구멍(핀홀)을 지나 상면에 맺힌다고 하면, 3D 점 \`P=(X,Y,Z)\`와 이미지 평면의 상 \`(x,y)\` 사이는 **닮은꼴 삼각형**입니다: \`x = f·X/Z\`, \`y = f·Y/Z\`.
- 핵심은 **Z로 나눈다**는 것 — 두 배 멀면 절반 크기로 찍힙니다. 이 나눗셈이 **원근(perspective)의 정체**입니다.
- \`X\`와 \`Z\`를 같은 비율로 키우면 결과(x)가 같습니다 — 그래서 한 장의 사진으로는 **크기와 거리를 분리할 수 없습니다**(18강의 "단안 거리 모호성"의 씨앗).
- \`f\`는 배율 손잡이입니다 — 크면 좁게 확대해서 보고, 작으면 넓게 봅니다.
- 20강에서는 이 \`f\`를 실제로 측정해 **픽셀 단위의 fx**로 만들고(캘리브레이션), 22강의 색 경로 역투영은 이 식을 Z에 대해 뒤집은 \`Z = fx·W/(2·r_px)\`를 그대로 씁니다 — 오늘의 삼각형이 나중에 "거꾸로" 거리 측정기가 됩니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionPinhole extends w.HTMLElement {
    private X = 1.2;
    private Z = 5;
    private f = 1.0;

    private refresh() {
      const { X, Z, f } = this;
      const objX = PINHOLE_X + Z * SCALE_Z;
      const objY = PINHOLE_Y - X * SCALE_X;
      const imagePlaneX = PINHOLE_X + f * SCALE_Z;
      const t = f / Z;
      const imgX = PINHOLE_X + t * (objX - PINHOLE_X);
      const imgY = PINHOLE_Y + t * (objY - PINHOLE_Y);

      // 거리 2배 비교용 두 번째 레이 (같은 X, Z만 2배)
      const Z2 = Z * 2;
      const obj2X = PINHOLE_X + Z2 * SCALE_Z;
      const obj2Y = PINHOLE_Y - X * SCALE_X;
      const t2 = f / Z2;
      const img2X = PINHOLE_X + t2 * (obj2X - PINHOLE_X);
      const img2Y = PINHOLE_Y + t2 * (obj2Y - PINHOLE_Y);

      const x = (f * X) / Z;
      const x2 = (f * X) / Z2;

      const setAttr = (sel: string, attr: string, val: string) => {
        const el = this.shadowRoot?.querySelector(sel);
        el?.setAttribute(attr, val);
      };

      setAttr('#ph-imgplane', 'x1', String(imagePlaneX));
      setAttr('#ph-imgplane', 'x2', String(imagePlaneX));
      setAttr('#ph-ray', 'x2', String(objX));
      setAttr('#ph-ray', 'y2', String(objY));
      setAttr('#ph-obj', 'cx', String(objX));
      setAttr('#ph-obj', 'cy', String(objY));
      setAttr('#ph-imgpt', 'cx', String(imgX));
      setAttr('#ph-imgpt', 'cy', String(imgY));

      setAttr('#ph-ray2', 'x2', String(obj2X));
      setAttr('#ph-ray2', 'y2', String(obj2Y));
      setAttr('#ph-obj2', 'cx', String(obj2X));
      setAttr('#ph-obj2', 'cy', String(obj2Y));
      setAttr('#ph-imgpt2', 'cx', String(img2X));
      setAttr('#ph-imgpt2', 'cy', String(img2Y));

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#ph-x-val', X.toFixed(2));
      setText('#ph-z-val', Z.toFixed(1));
      setText('#ph-f-val', f.toFixed(2));
      setText('#ph-formula', `x = f·X/Z = ${f.toFixed(2)}×${X.toFixed(2)}/${Z.toFixed(1)} = ${x.toFixed(3)}`);
      setText('#ph-formula2', `Z가 2배(${Z2.toFixed(1)})면: x = ${x2.toFixed(3)} (= 원래의 절반)`);
    }

    @addEventListener('#ph-X', 'input')
    onX(e: Event) { this.X = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#ph-Z', 'input')
    onZ(e: Event) { this.Z = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('#ph-f', 'input')
    onF(e: Event) { this.f = Number((e.target as HTMLInputElement).value) || 0.1; this.refresh(); }

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
          .ctl b { min-width:50px; text-align:right; color:#1e293b; }
          svg { display:block; width:100%; max-width:${SVG_W}px; margin:12px auto; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
          .ph-formula { font-size:13px; font-weight:700; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 12px; margin-top:6px; }
          .ph-formula2 { font-size:12px; color:#64748b; margin-top:4px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .ph-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .ph-intro b { color:#0369a1; }
        </style>

        <div class="ph-intro">
          카메라는 빛이 작은 구멍(<b>핀홀</b>)을 지나 상면에 맺히는 아주 단순한 기하로 모델링됩니다. 물체까지의 거리 Z와 상면까지의 거리 f가 만드는 <b>닮은꼴 삼각형</b> 덕분에, 상의 크기는 "실제 크기 ÷ 거리"에 정확히 비례합니다 — 이 "Z로 나눈다"는 한 가지 연산이 바로 원근(perspective)의 정체이고, 사람이 멀어질수록 작게 보이는 이유입니다. 기차 철로가 멀리서 한 점으로 모이는 것도, 손바닥 하나로 해를 가릴 수 있는 것도 전부 이 나눗셈 때문입니다.
        </div>

        <div class="math-desc">3D 점 P=(X,Z)와 초점거리 f를 바꾸며 닮은꼴 삼각형과 투영된 상의 위치(x=f·X/Z)를 확인해보세요. 연한 회색 선은 거리만 2배로 늘린 비교용입니다.</div>

        <div class="ctl"><label>X (물체 높이, m) <input id="ph-X" type="range" min="0.2" max="3" step="0.1" value="${this.X}"><b id="ph-x-val">${this.X.toFixed(2)}</b></label></div>
        <div class="ctl"><label>Z (물체 거리, m) <input id="ph-Z" type="range" min="2" max="8" step="0.1" value="${this.Z}"><b id="ph-z-val">${this.Z.toFixed(1)}</b></label></div>
        <div class="ctl"><label>f (초점거리) <input id="ph-f" type="range" min="0.3" max="1.8" step="0.05" value="${this.f}"><b id="ph-f-val">${this.f.toFixed(2)}</b></label></div>

        <svg viewBox="0 0 ${SVG_W} ${SVG_H}">
          <line x1="0" y1="${PINHOLE_Y}" x2="${SVG_W}" y2="${PINHOLE_Y}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3,3"/>
          <line id="ph-imgplane" x1="0" y1="20" x2="0" y2="${SVG_H - 20}" stroke="#0369a1" stroke-width="2"/>
          <circle cx="${PINHOLE_X}" cy="${PINHOLE_Y}" r="4" fill="#1e293b"/>
          <text x="${PINHOLE_X - 10}" y="${PINHOLE_Y + 20}" font-size="10" fill="#1e293b">핀홀</text>

          <line id="ph-ray2" x1="${PINHOLE_X}" y1="${PINHOLE_Y}" x2="0" y2="0" stroke="#cbd5e1" stroke-width="1.5"/>
          <circle id="ph-obj2" cx="0" cy="0" r="5" fill="#cbd5e1"/>
          <circle id="ph-imgpt2" cx="0" cy="0" r="4" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1"/>

          <line id="ph-ray" x1="${PINHOLE_X}" y1="${PINHOLE_Y}" x2="0" y2="0" stroke="#f59e0b" stroke-width="2"/>
          <circle id="ph-obj" cx="0" cy="0" r="6" fill="#ef4444"/>
          <circle id="ph-imgpt" cx="0" cy="0" r="5" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
        </svg>

        <div class="ph-formula" id="ph-formula"></div>
        <div class="ph-formula2" id="ph-formula2"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
