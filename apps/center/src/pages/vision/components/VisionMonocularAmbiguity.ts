import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-monocular-ambiguity';

const SVG_W = 420;
const SVG_H = 260;
const PINHOLE_X = 55;
const PINHOLE_Y = 130;
const SCALE_Z = 40;
const SCALE_X = 55;

const MD = `
## 단안 거리 모호성 — 한 눈의 근본 한계
- 핀홀 투영식 \`x = f·X/Z\`에서 **X와 Z를 같은 비율로 키우면 x(상의 크기)가 불변**입니다 — 작은 물체가 가까이 있는 경우와 큰 물체가 멀리 있는 경우가 **정확히 같은 픽셀**을 만듭니다.
- 한 장의 이미지에서 **스케일은 원리적으로 복원 불가능**합니다 — 달이 손톱만해 보이는 것, 영화 세트의 미니어처 촬영이 이 모호성의 활용입니다.
- 이미지는 3D→2D로 **한 차원을 잃은 기록**이고, 잃은 것이 바로 **깊이**입니다. 픽셀 하나는 점이 아니라 **광선**을 지정할 뿐입니다.
- PnP가 거리를 알 수 있었던 건 "실제 크기를 안다"는 전제 덕분이었습니다 — 그 전제가 없으면 이 모호성이 그대로 드러납니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionMonocularAmbiguity extends w.HTMLElement {
    private radiusA = 0.5; // 기준 공(가까이) 반지름
    private Za = 2.5; // 기준 공 거리
    private Zb = 6; // 비교 공(멀리) 거리 - 반지름은 자동 계산

    private refresh() {
      const { radiusA, Za, Zb } = this;
      const radiusB = radiusA * (Zb / Za);

      const screenZa = PINHOLE_X + Za * SCALE_Z;
      const screenZb = PINHOLE_X + Zb * SCALE_Z;
      const rA = radiusA * SCALE_X;
      const rB = radiusB * SCALE_X;

      const setAttr = (sel: string, attr: string, val: string) => this.shadowRoot?.querySelector(sel)?.setAttribute(attr, val);
      setAttr('#ma-circleA', 'cx', String(screenZa));
      setAttr('#ma-circleA', 'cy', String(PINHOLE_Y));
      setAttr('#ma-circleA', 'r', String(rA));
      setAttr('#ma-circleB', 'cx', String(screenZb));
      setAttr('#ma-circleB', 'cy', String(PINHOLE_Y));
      setAttr('#ma-circleB', 'r', String(rB));
      // 핀홀에서 두 공 모두에 접하는(= 같은 각) 위아래 레이 — 기준 공 A의 비율로 각도 고정.
      // 실제 비율(radiusA/Za)을 그대로 화면 기울기로 쓰면 안 됨 - Z축과 반지름축의 스케일(SCALE_Z, SCALE_X)이
      // 서로 달라서, 그 비율만큼 보정해야 원과 광선이 정확히 맞닿는다(안 그러면 원이 광선 밖으로 삐져나옴).
      const slope = (radiusA / Za) * (SCALE_X / SCALE_Z);
      const farX = SVG_W - 10;
      const farY = slope * (farX - PINHOLE_X);
      setAttr('#ma-ray-top', 'x2', String(farX));
      setAttr('#ma-ray-top', 'y2', String(PINHOLE_Y - farY));
      setAttr('#ma-ray-bottom', 'x2', String(farX));
      setAttr('#ma-ray-bottom', 'y2', String(PINHOLE_Y + farY));

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#ma-radiusA-val', radiusA.toFixed(2));
      setText('#ma-za-val', Za.toFixed(1));
      setText('#ma-zb-val', Zb.toFixed(1));
      setText('#ma-radiusB-val', radiusB.toFixed(2));
      setText('#ma-ratio', `X/Z 비율: A = ${radiusA.toFixed(2)}/${Za.toFixed(1)} = ${(radiusA / Za).toFixed(3)}  ·  B = ${radiusB.toFixed(2)}/${Zb.toFixed(1)} = ${(radiusB / Zb).toFixed(3)} (동일!)`);
    }

    @addEventListener('#ma-radiusA', 'input')
    onRadiusA(e: Event) { this.radiusA = Number((e.target as HTMLInputElement).value) || 0.1; this.refresh(); }
    @addEventListener('#ma-za', 'input')
    onZa(e: Event) { this.Za = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('#ma-zb', 'input')
    onZb(e: Event) { this.Zb = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }

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
          .ma-ratio { font-size:12px; font-weight:700; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 12px; margin-top:6px; text-align:center; }
          .ma-note { text-align:center; font-size:13px; font-weight:800; color:#0369a1; margin-top:8px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .ma-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .ma-intro b { color:#0369a1; }
        </style>

        <div class="ma-intro">
          <b>단안 거리 모호성</b>이란 — PnP는 "물체의 실제 크기를 미리 안다"는 전제 덕분에 거리를 구할 수 있었습니다. 그 전제가 없으면 어떻게 될까요?
          핀홀 투영식 \`x=f·X/Z\`을 보면, 물체 크기 X와 거리 Z를 **같은 비율로** 같이 키우거나 줄여도 x(찍히는 크기)는 똑같습니다. 즉 "작은 공이 가까이 있는 것"과 "큰 공이 멀리 있는 것"은 **사진 한 장으로는 절대 구별할 수 없습니다** — 크기를 모른다는 조건 하나만으로 거리 자체가 원리적으로 미지수가 됩니다.
        </div>

        <div class="math-desc">기준 공(파랑, 가까이)의 크기·거리를 정하면, 그와 "화면에서 똑같은 크기로 보이는" 먼 공(빨강)의 반지름이 자동으로 계산됩니다 — 두 공 다 같은 광선 쌍에 꼭 맞게 그려집니다.</div>

        <div class="ctl"><label>기준 공 반지름(A) <input id="ma-radiusA" type="range" min="0.1" max="1" step="0.05" value="${this.radiusA}"><b id="ma-radiusA-val">${this.radiusA.toFixed(2)}</b></label></div>
        <div class="ctl"><label>기준 공 거리(A) <input id="ma-za" type="range" min="1" max="4" step="0.1" value="${this.Za}"><b id="ma-za-val">${this.Za.toFixed(1)}</b></label></div>
        <div class="ctl"><label>비교 공 거리(B) <input id="ma-zb" type="range" min="2" max="8" step="0.1" value="${this.Zb}"><b id="ma-zb-val">${this.Zb.toFixed(1)}</b></label></div>

        <svg viewBox="0 0 ${SVG_W} ${SVG_H}">
          <circle cx="${PINHOLE_X}" cy="${PINHOLE_Y}" r="4" fill="#1e293b"/>
          <text x="${PINHOLE_X - 18}" y="${PINHOLE_Y + 20}" font-size="10" fill="#1e293b">카메라</text>
          <line id="ma-ray-top" x1="${PINHOLE_X}" y1="${PINHOLE_Y}" x2="0" y2="0" stroke="#cbd5e1" stroke-width="1.3"/>
          <line id="ma-ray-bottom" x1="${PINHOLE_X}" y1="${PINHOLE_Y}" x2="0" y2="0" stroke="#cbd5e1" stroke-width="1.3"/>
          <circle id="ma-circleB" cx="0" cy="0" r="0" fill="none" stroke="#ef4444" stroke-width="2.5"/>
          <circle id="ma-circleA" cx="0" cy="0" r="0" fill="none" stroke="#3b82f6" stroke-width="2.5"/>
        </svg>

        <div class="ma-note">둘 다 화면(이미지 평면)에서는 정확히 같은 크기로 보입니다!</div>
        <div class="ma-ratio" id="ma-ratio"></div>
        <div class="ma-ratio">반지름 B(자동 계산) = 반지름 A × (Zb/Za) = <b id="ma-radiusB-val"></b></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
