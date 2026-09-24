import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-calib-sanity';

const IMG_W = 640, IMG_H = 480;
const UND_SIZE = 140;

const MD = `
## 값의 상식 검사 + undistort 눈 검사
- **관문②**: \`cx,cy\`가 이미지 중앙 근처(640×480이면 320±30, 240±30)인지, \`fx≈fy\`(5% 이상 다르면 의심)인지, fx로 계산한 FOV가 실측 FOV와 맞는지(교차 검증).
- **관문③**: \`cv2.undistort(img, K, dist)\`로 보정한 뒤, 가장자리의 굽은 직선이 펴졌는지 눈으로 확인합니다.
- 세 관문(RMS·상식·눈 검사)을 **모두 통과해야** \`camera_params.npz\`를 배포합니다.
`;

function fov(fPx: number, sizePx: number): number {
  return (2 * Math.atan(sizePx / (2 * fPx)) * 180) / Math.PI;
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionCalibSanity extends w.HTMLElement {
    private fx = 612;
    private fy = 611;
    private cx = 324;
    private cy = 235;
    private measuredFov = 54;
    private k1 = -0.28;
    private undistorted = false;

    private refresh() {
      const q = (sel: string) => this.shadowRoot?.querySelector(sel) as HTMLElement;
      const setText = (sel: string, text: string) => { const el = q(sel); if (el) el.textContent = text; };
      setText('#sn-fx-val', String(this.fx));
      setText('#sn-fy-val', String(this.fy));
      setText('#sn-cx-val', String(this.cx));
      setText('#sn-cy-val', String(this.cy));
      setText('#sn-fov-val', String(this.measuredFov));

      const checks: { label: string; ok: boolean; detail: string }[] = [];
      const cxOk = Math.abs(this.cx - IMG_W / 2) <= 30;
      const cyOk = Math.abs(this.cy - IMG_H / 2) <= 30;
      checks.push({ label: 'cx 중앙 근처', ok: cxOk, detail: `${this.cx} vs ${IMG_W / 2}±30` });
      checks.push({ label: 'cy 중앙 근처', ok: cyOk, detail: `${this.cy} vs ${IMG_H / 2}±30` });
      const fRatio = Math.abs(this.fx - this.fy) / Math.max(this.fx, this.fy);
      checks.push({ label: 'fx ≈ fy (5% 이내)', ok: fRatio <= 0.05, detail: `차이 ${(fRatio * 100).toFixed(1)}%` });
      const calcFov = fov(this.fx, IMG_W);
      const fovDiff = Math.abs(calcFov - this.measuredFov) / this.measuredFov;
      checks.push({ label: 'FOV 교차검증(5% 이내)', ok: fovDiff <= 0.05, detail: `계산 ${calcFov.toFixed(1)}° vs 실측 ${this.measuredFov}°` });

      const listEl = q('#sn-checklist');
      if (listEl) {
        listEl.innerHTML = checks.map(c =>
          `<div class="sn-row ${c.ok ? 'ok' : 'bad'}"><span>${c.ok ? '✅' : '❌'} ${c.label}</span><span class="sn-detail">${c.detail}</span></div>`
        ).join('');
      }

      const allOk = checks.every(c => c.ok);
      const verdict = q('#sn-verdict');
      if (verdict) {
        verdict.textContent = allOk ? '✅ 관문② 통과 — 상식적인 값입니다' : '⚠ 관문② 중 일부 불합격 — K를 의심해보세요';
        verdict.style.background = allOk ? '#dcfce7' : '#fee2e2';
        verdict.style.color = allOk ? '#166534' : '#991b1b';
        verdict.style.borderColor = allOk ? '#bbf7d0' : '#fecaca';
      }

      const curveEl = q('#sn-curve');
      if (curveEl) {
        const bow = this.undistorted ? 0 : 18;
        const lines = [20, 45, 70, 95, 120].map(y =>
          `<path d="M5,${y} Q${UND_SIZE / 2},${y + (y < UND_SIZE / 2 ? bow : -bow)} ${UND_SIZE - 5},${y}" stroke="${this.undistorted ? '#16a34a' : '#ef4444'}" stroke-width="2" fill="none"/>`
        ).join('');
        curveEl.innerHTML = lines;
      }
      setText('#sn-und-label', this.undistorted ? '보정 후 — 직선이 폄' : '보정 전 — 가장자리가 굽음');
    }

    @addEventListener('#sn-fx', 'input') onFx(e: Event) { this.fx = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#sn-fy', 'input') onFy(e: Event) { this.fy = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#sn-cx', 'input') onCx(e: Event) { this.cx = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#sn-cy', 'input') onCy(e: Event) { this.cy = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#sn-fov', 'input') onFov(e: Event) { this.measuredFov = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#sn-toggle', 'click') onToggle() { this.undistorted = !this.undistorted; this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .sn-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .sn-intro b { color:#0369a1; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:6px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:40px; text-align:right; color:#1e293b; }
          .sn-checklist { margin-top:12px; display:flex; flex-direction:column; gap:4px; }
          .sn-row { display:flex; justify-content:space-between; font-size:12px; padding:5px 10px; border-radius:6px; background:#f8fafc; }
          .sn-row.bad { background:#fef2f2; }
          .sn-detail { color:#94a3b8; }
          .sn-verdict { text-align:center; font-size:12.5px; font-weight:700; border-radius:8px; padding:8px 12px; margin-top:10px; border:1px solid; }
          .sn-und-box { text-align:center; margin-top:16px; }
          svg.sn-svg { width:${UND_SIZE}px; height:${UND_SIZE}px; background:#0f172a; border-radius:6px; }
          .sn-und-btn { margin-top:8px; padding:6px 14px; border-radius:16px; border:1.5px solid #0369a1; background:#fff; color:#0369a1; font-size:12px; font-weight:700; cursor:pointer; }
          .sn-und-btn:hover { background:#f0f9ff; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="sn-intro">
          RMS가 낮아도 K 값 자체가 상식과 어긋나면 의심해야 합니다. <b>cx,cy</b>는 이미지 중앙 근처여야 하고, <b>fx와 fy</b>는 거의 같아야 하며, fx로 계산한 <b>FOV</b>가 줄자로 잰 실측 FOV와 맞아야 합니다. 슬라이더를 움직여 "이상한 K"를 만들어보고 체크리스트가 어떻게 반응하는지 확인해보세요.
        </div>

        <div class="math-desc">이미지 크기 640×480 기준 · FOV = 2·atan(W / (2·fx))</div>

        <div class="ctl"><label>fx <input id="sn-fx" type="range" min="300" max="900" step="1" value="${this.fx}"><b id="sn-fx-val">${this.fx}</b></label></div>
        <div class="ctl"><label>fy <input id="sn-fy" type="range" min="300" max="900" step="1" value="${this.fy}"><b id="sn-fy-val">${this.fy}</b></label></div>
        <div class="ctl"><label>cx <input id="sn-cx" type="range" min="200" max="440" step="1" value="${this.cx}"><b id="sn-cx-val">${this.cx}</b></label></div>
        <div class="ctl"><label>cy <input id="sn-cy" type="range" min="120" max="360" step="1" value="${this.cy}"><b id="sn-cy-val">${this.cy}</b></label></div>
        <div class="ctl"><label>실측 FOV(°) <input id="sn-fov" type="range" min="40" max="70" step="1" value="${this.measuredFov}"><b id="sn-fov-val">${this.measuredFov}</b></label></div>

        <div class="sn-checklist" id="sn-checklist"></div>
        <div class="sn-verdict" id="sn-verdict"></div>

        <div class="sn-und-box">
          <svg class="sn-svg"><g id="sn-curve"></g></svg>
          <div class="math-desc" id="sn-und-label"></div>
          <button class="sn-und-btn" id="sn-toggle">보정 전/후 전환</button>
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
