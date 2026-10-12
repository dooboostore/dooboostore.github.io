import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-pinhole';

// 수평 스케일은 물체·상면이 공통(S) — 그래야 그려진 삼각형이 진짜 닮은꼴이 됨
const S = 20;
const HX = 34;
const PINHOLE_X = 360;
const PINHOLE_Y = 160;
const SVG_W = 600;
const SVG_H = 300;
// 화살 대신 삼각형: ▲물체가 ▼상으로 뒤집혀 맺힘 (밑변 반폭)
const OBJ_HW = 14;

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
    private Y0 = 0;
    private Z = 5;
    private f = 1.0;

    private refresh() {
      const { X, Y0, Z, f } = this;
      // 물체는 핀홀 왼쪽, 상면(필름)은 핀홀 오른쪽 — 빛이 핀홀을 "지나" 뒤집혀 맺힘
      // Y0: 물체 밑면 높이 (0이면 밑면=광축, 양수면 공중에 뜸)
      const objX = PINHOLE_X - Z * S;
      const baseY = PINHOLE_Y - Y0 * HX;
      const objY = baseY - X * HX;
      const filmX = PINHOLE_X + f * S;
      const k = f / Z;
      const imgBaseY = PINHOLE_Y + k * Y0 * HX;
      const imgY = PINHOLE_Y + k * (Y0 + X) * HX;

      // 거리 2배 비교용 두 번째 물체·상 (같은 X, Z만 2배)
      const Z2 = Z * 2;
      const obj2X = PINHOLE_X - Z2 * S;
      const img2BaseY = PINHOLE_Y + (k / 2) * Y0 * HX;
      const img2Y = PINHOLE_Y + (k / 2) * (Y0 + X) * HX;

      const x = (f * X) / Z;
      const x2 = (f * X) / Z2;
      // 상 삼각형 밑변 반폭도 같은 비율로 축소 (원근!) 
      const imgHW = k * OBJ_HW;
      const img2HW = (k / 2) * OBJ_HW;

      const setAttr = (sel: string, attr: string, val: string) => {
        const el = this.shadowRoot?.querySelector(sel);
        el?.setAttribute(attr, val);
      };

      setAttr('#ph-film', 'x1', String(filmX));
      setAttr('#ph-film', 'x2', String(filmX));
      setAttr('#ph-ray', 'x1', String(objX));
      setAttr('#ph-ray', 'y1', String(objY));
      setAttr('#ph-ray', 'x2', String(filmX));
      setAttr('#ph-ray', 'y2', String(imgY));
      setAttr('#ph-ray-base', 'x1', String(objX));
      setAttr('#ph-ray-base', 'y1', String(baseY));
      setAttr('#ph-ray-base', 'x2', String(filmX));
      setAttr('#ph-ray-base', 'y2', String(imgBaseY));
      // 물체 삼각형 ▲ (꼭대기→밑변)
      setAttr('#ph-obj', 'points', `${objX},${objY} ${objX - OBJ_HW},${baseY} ${objX + OBJ_HW},${baseY}`);
      // 상 삼각형 ▼ (뒤집힘)
      setAttr('#ph-img', 'points', `${filmX},${imgY} ${filmX - imgHW},${imgBaseY} ${filmX + imgHW},${imgBaseY}`);

      setAttr('#ph-ray2', 'x1', String(obj2X));
      setAttr('#ph-ray2', 'y1', String(objY));
      setAttr('#ph-ray2', 'x2', String(filmX));
      setAttr('#ph-ray2', 'y2', String(img2Y));
      setAttr('#ph-ray2base', 'x1', String(obj2X));
      setAttr('#ph-ray2base', 'y1', String(baseY));
      setAttr('#ph-ray2base', 'x2', String(filmX));
      setAttr('#ph-ray2base', 'y2', String(img2BaseY));
      setAttr('#ph-obj2', 'points', `${obj2X},${objY} ${obj2X - OBJ_HW},${baseY} ${obj2X + OBJ_HW},${baseY}`);
      setAttr('#ph-img2', 'points', `${filmX},${img2Y} ${filmX - img2HW},${img2BaseY} ${filmX + img2HW},${img2BaseY}`);

      setAttr('#ph-lbl-obj', 'x', String(objX));
      setAttr('#ph-lbl-obj', 'y', String(objY - 8));
      setAttr('#ph-lbl-film', 'x', String(filmX));
      setAttr('#ph-lbl-img', 'x', String(filmX + 10));
      setAttr('#ph-lbl-img', 'y', String(imgY + 4));

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#ph-x-val', X.toFixed(2));
      setText('#ph-y0-val', Y0.toFixed(1));
      setText('#ph-z-val', Z.toFixed(1));
      setText('#ph-f-val', f.toFixed(2));
      setText('#ph-formula', `x = f·X/Z = ${f.toFixed(2)}×${X.toFixed(2)}/${Z.toFixed(1)} = ${x.toFixed(3)} (상하 반전, 크기로 표시)`);
      setText('#ph-formula2', `Z가 2배(${Z2.toFixed(1)})면: x = ${x2.toFixed(3)} (= 원래의 절반)`);
    }

    @addEventListener('#ph-X', 'input')
    onX(e: Event) { this.X = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#ph-Y0', 'input')
    onY0(e: Event) { this.Y0 = Number((e.target as HTMLInputElement).value); this.refresh(); }
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
          .ph-legend { display:flex; flex-wrap:wrap; gap:6px 14px; font-size:12px; color:#475569; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; margin-top:8px; }
          .ph-legend span { display:inline-flex; align-items:center; gap:6px; }
          .dot { width:10px; height:10px; border-radius:50%; display:inline-block; flex-shrink:0; }
          .swatch-line { width:18px; height:0; display:inline-block; flex-shrink:0; }
        </style>

        <div class="ph-intro">
          카메라는 빛이 작은 구멍(<b>핀홀</b>)을 지나 상면에 맺히는 아주 단순한 기하로 모델링됩니다. 물체까지의 거리 Z와 상면까지의 거리 f가 만드는 <b>닮은꼴 삼각형</b> 덕분에, 상의 크기는 "실제 크기 ÷ 거리"에 정확히 비례합니다 — 이 "Z로 나눈다"는 한 가지 연산이 바로 원근(perspective)의 정체이고, 사람이 멀어질수록 작게 보이는 이유입니다. 기차 철로가 멀리서 한 점으로 모이는 것도, 손바닥 하나로 해를 가릴 수 있는 것도 전부 이 나눗셈 때문입니다.
        </div>

        <div class="math-desc">물체 P=(X,Z)와 초점거리 f를 바꿔보세요. 물체는 <b>빨간 삼각형 ▲</b> — 꼭대기에서 나온 빛이 핀홀을 지나 상면에 <b>거꾸로 뒤집힌 초록 삼각형 ▼</b>으로 맺히며, 크기는 x=f·X/Z를 따릅니다. 밑변 너비까지 같은 비율로 줄어드는 것을 보세요. <b>Y0</b> 슬라이더로 물체를 공중에 띄워도(밑면 점선 광선) 온몸이 통째로 뒤집혀 맺힙니다. 연한 회색은 거리만 2배로 늘린 비교용입니다.</div>

        <div class="ctl"><label>X (물체 높이, m) <input id="ph-X" type="range" min="0.2" max="3" step="0.1" value="${this.X}"><b id="ph-x-val">${this.X.toFixed(2)}</b></label></div>
        <div class="ctl"><label>Y0 (물체 밑면 높이, m) <input id="ph-Y0" type="range" min="-1" max="1" step="0.1" value="${this.Y0}"><b id="ph-y0-val">${this.Y0.toFixed(1)}</b></label></div>
        <div class="ctl"><label>Z (물체 거리, m) <input id="ph-Z" type="range" min="2" max="8" step="0.1" value="${this.Z}"><b id="ph-z-val">${this.Z.toFixed(1)}</b></label></div>
        <div class="ctl"><label>f (초점거리) <input id="ph-f" type="range" min="0.3" max="2" step="0.05" value="${this.f}"><b id="ph-f-val">${this.f.toFixed(2)}</b></label></div>

        <svg viewBox="0 0 ${SVG_W} ${SVG_H}">
          <line x1="0" y1="${PINHOLE_Y}" x2="${SVG_W}" y2="${PINHOLE_Y}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3,3"/>
          <line id="ph-film" x1="0" y1="24" x2="0" y2="${SVG_H - 24}" stroke="#0369a1" stroke-width="2.5"/>

          <line id="ph-ray" x1="${PINHOLE_X}" y1="${PINHOLE_Y}" x2="0" y2="0" stroke="#f59e0b" stroke-width="2"/>
          <line id="ph-ray-base" x1="${PINHOLE_X}" y1="${PINHOLE_Y}" x2="0" y2="0" stroke="#f59e0b" stroke-width="1" stroke-dasharray="4,2" opacity="0.8"/>
          <polygon id="ph-obj" points="" fill="#ef4444"/>
          <polygon id="ph-img" points="" fill="#22c55e" fill-opacity="0.55" stroke="#15803d" stroke-width="1.5"/>

          <line id="ph-ray2" x1="${PINHOLE_X}" y1="${PINHOLE_Y}" x2="0" y2="0" stroke="#cbd5e1" stroke-width="1.5"/>
          <line id="ph-ray2base" x1="${PINHOLE_X}" y1="${PINHOLE_Y}" x2="0" y2="0" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3,2"/>
          <polygon id="ph-obj2" points="" fill="#cbd5e1"/>
          <polygon id="ph-img2" points="" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1"/>

          <circle cx="${PINHOLE_X}" cy="${PINHOLE_Y}" r="4.5" fill="#1e293b"/>
          <text x="${PINHOLE_X}" y="${PINHOLE_Y + 22}" font-size="10" fill="#1e293b" text-anchor="middle">핀홀</text>
          <text id="ph-lbl-obj" x="0" y="0" font-size="10" fill="#ef4444" text-anchor="middle">물체 P</text>
          <text id="ph-lbl-film" x="0" y="14" font-size="10" fill="#0369a1" text-anchor="middle">상면</text>
          <text id="ph-lbl-img" x="0" y="0" font-size="10" fill="#15803d">상 x</text>
        </svg>

        <div class="ph-formula" id="ph-formula"></div>
        <div class="ph-formula2" id="ph-formula2"></div>

        <div class="ph-legend">
          <span><b style="color:#ef4444">▲</b>물체 (빨강)</span>
          <span><i class="swatch-line" style="border-top:2px solid #f59e0b"></i>꼭대기 광선 (주황 실선)</span>
          <span><i class="swatch-line" style="border-top:1px dashed #f59e0b"></i>밑면 광선 (주황 점선)</span>
          <span><i class="dot" style="background:#1e293b"></i>핀홀</span>
          <span><i class="swatch-line" style="border-top:3px solid #0369a1"></i>상면·필름 (파랑)</span>
          <span><b style="color:#22c55e">▼</b>상 x (뒤집힌 초록)</span>
          <span><b style="color:#cbd5e1">▲▼</b>거리 2배 비교용 (회색: 절반 크기로 맺힘)</span>
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
