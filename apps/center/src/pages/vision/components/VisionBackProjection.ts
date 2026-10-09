import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-back-projection';

const FX = 600; // [px] 가정 초점거리
const CU = 320, CV = 240; // 주점 가정

const MD = `
## 색 경로의 역투영 — 투영 사슬을 거꾸로
- ① 크기 비에서 깊이: \`Z = fx·W / (2·r_px)\` — 17강 투영식 \`w_px = fx·W/Z\`를 Z에 대해 뒤집은 것. "아는 크기"가 자 역할을 해 잃어버린 깊이를 되찾습니다(18강 해결책 ①).
- ② 광선 위의 점으로 확정: \`x = (cu−cx)·Z/fx\`, \`y = (cv−cy)·Z/fy\` — 중심 픽셀에서 주점을 빼는 이유는 각도의 기준이 광축이기 때문입니다.
- \`r_px\`가 분모에 있으므로 **멀어질수록(픽셀이 작아질수록) 오차가 급격히 커집니다** — 1px 오차가 근거리에선 mm, 원거리에선 cm가 됩니다. 반드시 \`undistortPoints\`로 왜곡을 먼저 제거해야 합니다.
- 바닥 위에 있는 물체라면 이 "아는 크기" 대신 **해결책③(광선-평면 교점, 18강 실습 4)**으로 교체할 수 있습니다 — 파이프라인 구조는 동일합니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionBackProjection extends w.HTMLElement {
    private diameter = 0.067; // [m] 테니스공 지름
    private rPx = 40; // [px] 검출 반지름
    private cu = 400; // [px] 검출 중심

    private refresh() {
      const Z = (FX * this.diameter) / (2 * this.rPx);
      const x = ((this.cu - CU) * Z) / FX;
      // 1px 오차 전파: dZ/dr_px = -fx*W / (2*r_px^2)
      const dZ = Math.abs((FX * this.diameter) / (2 * this.rPx * this.rPx)) * 1; // 1px 오차

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#bp-diam-val', `${(this.diameter * 100).toFixed(1)}cm`);
      setText('#bp-rpx-val', `${this.rPx}px`);
      setText('#bp-cu-val', `${this.cu}px`);
      setText('#bp-z', `Z = ${FX} × ${this.diameter.toFixed(3)} / (2×${this.rPx}) = ${Z.toFixed(3)}m`);
      setText('#bp-x', `x = (${this.cu}−${CU}) × ${Z.toFixed(2)} / ${FX} = ${x.toFixed(3)}m`);
      setText('#bp-err', `1px 검출 오차 → 거리 오차 ≈ ${(dZ * 1000).toFixed(1)}mm`);

      // SVG: 카메라 원점 → 공 위치
      const SVG_W = 280, SVG_H = 140;
      const originX = 20, originY = SVG_H / 2;
      const scale = 90; // px per meter
      const ballX = Math.min(originX + Z * scale, SVG_W - 15);
      const ballY = originY - (x * scale) / 2;
      const ballR = Math.max(4, Math.min(22, (this.diameter * scale) / 2));

      const scene = this.shadowRoot?.querySelector('#bp-scene') as HTMLElement;
      if (scene) {
        scene.innerHTML =
          `<circle cx="${originX}" cy="${originY}" r="3" fill="#0f172a"/>` +
          `<line x1="${originX}" y1="${originY}" x2="${ballX.toFixed(1)}" y2="${ballY.toFixed(1)}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3,2"/>` +
          `<circle cx="${ballX.toFixed(1)}" cy="${ballY.toFixed(1)}" r="${ballR.toFixed(1)}" fill="none" stroke="#dc2626" stroke-width="2"/>` +
          `<text x="${originX}" y="${originY + 16}" font-size="9" fill="#64748b">카메라</text>` +
          `<text x="${ballX.toFixed(1)}" y="${(ballY - ballR - 6).toFixed(1)}" font-size="9" fill="#dc2626" text-anchor="middle">Z=${Z.toFixed(2)}m</text>`;
      }

      // 거리별 오차 증폭 막대 (가까이/중간/멀리의 동일 1px 오차)
      const samples = [80, 40, 15]; // r_px 큼(가까움)→작음(멀리)
      const errs = samples.map(r => Math.abs((FX * this.diameter) / (2 * r * r)) * 1000);
      const maxErr = Math.max(...errs, 1);
      const barsEl = this.shadowRoot?.querySelector('#bp-err-bars') as HTMLElement;
      if (barsEl) {
        const BW = 70, BH = 70, GAP = 10;
        barsEl.innerHTML = samples.map((r, i) => {
          const h = (errs[i] / maxErr) * BH;
          const x0 = i * (BW + GAP) + 10;
          const highlight = r === this.rPx || Math.abs(r - this.rPx) < 5;
          return `<rect x="${x0}" y="${(BH - h + 10).toFixed(1)}" width="${BW}" height="${h.toFixed(1)}" fill="${highlight ? '#0369a1' : '#cbd5e1'}"/>` +
            `<text x="${x0 + BW / 2}" y="${(BH + 24).toFixed(1)}" font-size="9" fill="#334155" text-anchor="middle">r=${r}px</text>` +
            `<text x="${x0 + BW / 2}" y="${(BH - h + 4).toFixed(1)}" font-size="9" fill="#1e293b" text-anchor="middle">${errs[i].toFixed(1)}mm</text>`;
        }).join('');
      }
    }

    @addEventListener('#bp-diam', 'input') onDiam(e: Event) { this.diameter = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#bp-rpx', 'input') onRpx(e: Event) { this.rPx = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#bp-cu', 'input') onCu(e: Event) { this.cu = Number((e.target as HTMLInputElement).value); this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .bp-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .bp-intro b { color:#0369a1; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:48px; text-align:right; color:#1e293b; }
          svg { display:block; width:100%; margin:10px auto; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
          .bp-formulas { font-size:12px; font-weight:700; color:#0369a1; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 10px; margin-top:10px; display:flex; flex-direction:column; gap:3px; }
          .bp-err { text-align:center; font-size:12.5px; font-weight:800; color:#991b1b; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:8px; margin-top:10px; }
          .bp-sub { text-align:center; font-size:11px; color:#64748b; margin-top:14px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="bp-intro">
          19강 검출기는 "중심 픽셀 + 픽셀 반지름"만 줍니다. 실제 지름을 아는 물체라면, 17강 투영식을 거꾸로 풀어 <b>깊이 Z</b>와 <b>3D 좌표</b>를 되찾을 수 있습니다. 반지름(r_px)을 작게(= 멀리 있는 상황) 만들어보면서 같은 1px 오차가 거리 오차로 얼마나 증폭되는지 확인해보세요.
        </div>

        <div class="ctl"><label>실제 지름 W <input id="bp-diam" type="range" min="0.02" max="0.15" step="0.001" value="${this.diameter}"><b id="bp-diam-val">${(this.diameter * 100).toFixed(1)}cm</b></label></div>
        <div class="ctl"><label>검출 반지름 r_px <input id="bp-rpx" type="range" min="8" max="90" step="1" value="${this.rPx}"><b id="bp-rpx-val">${this.rPx}px</b></label></div>
        <div class="ctl"><label>중심 픽셀 cu <input id="bp-cu" type="range" min="0" max="640" step="5" value="${this.cu}"><b id="bp-cu-val">${this.cu}px</b></label></div>

        <svg viewBox="0 0 280 140"><g id="bp-scene"></g></svg>

        <div class="bp-formulas">
          <span id="bp-z"></span>
          <span id="bp-x"></span>
        </div>

        <div class="bp-err" id="bp-err"></div>
        <div class="math-desc">오차가 커지는 이유: dZ/dr_px ∝ 1/r_px² — 반지름이 분모의 제곱이라 멀어질수록(r_px가 작아질수록) 오차가 급격히 불어납니다.</div>

        <div class="bp-sub">같은 1px 오차, 거리에 따른 증폭 (r_px가 작을수록=멀수록 오차 급증)</div>
        <svg viewBox="0 0 250 100"><g id="bp-err-bars"></g></svg>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
