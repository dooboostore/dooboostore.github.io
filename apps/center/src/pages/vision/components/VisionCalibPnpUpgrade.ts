import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-calib-pnp-upgrade';

const DISTANCES = ['30cm', '50cm', '80cm'];
const APPROX_ERR = [7.2, 8.5, 9.8]; // 근사 K(18강)
const CALIB_ERR = [1.1, 1.4, 1.9]; // 측정 K + 왜곡 보정(20강)

const CHART_W = 300, CHART_H = 160;

const MD = `
## 캘리브레이션이 PnP 정확도를 바꾼다
- 18강에서는 "대략 이 정도겠지" 하는 **근사 K**로 solvePnP를 돌렸습니다. 오늘 체커보드로 구한 **진짜 K·왜곡 계수**로 같은 계산을 다시 돌리면, 거리 오차가 **5~10% → 1~2%**로 줄어듭니다.
- 로봇이 물체를 집으려면 이 차이(수 cm)가 **성패를 가릅니다** — "K는 카메라의 지문"이라는 17강의 말이 숫자로 증명되는 순간입니다.
- 슬라이더로 "보정 적용 정도"를 0→100%로 옮기며, 근사 K의 오차가 측정 K의 오차로 수렴하는 과정을 확인해보세요.
- **즉시 활용①(왜곡 실측 재확인)**: [[vision-lens-distortion]](17강)에서 쟀던 "직선의 굽음(px)"을 오늘 구한 왜곡 계수로 보정한 뒤 재측정하면 — 예를 들어 **보정 전 가장자리 굽음 평균 4.2px → 보정 후 0.3px**처럼 — 왜곡이 거의 사라진 걸 수치로 확인할 수 있습니다.
- 이 캘리브레이션 결과(K·dist)는 그대로 끝나지 않습니다 — [[vision-pipeline-integration]](22강)의 통합 파이프라인에서 "왜곡 보정" 단계로 매 프레임 재사용됩니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionCalibPnpUpgrade extends w.HTMLElement {
    private blend = 0; // 0=근사K, 100=측정K+보정

    private refresh() {
      const t = this.blend / 100;
      const values = DISTANCES.map((_, i) => APPROX_ERR[i] + (CALIB_ERR[i] - APPROX_ERR[i]) * t);

      const barsEl = this.shadowRoot?.querySelector('#pu-bars') as HTMLElement;
      if (barsEl) {
        const groupW = CHART_W / DISTANCES.length;
        const maxV = 10;
        barsEl.innerHTML = DISTANCES.map((d, i) => {
          const h = (values[i] / maxV) * CHART_H;
          const x = i * groupW + groupW * 0.25;
          const w2 = groupW * 0.5;
          const color = `rgb(${Math.round(107 + (22 - 107) * t)}, ${Math.round(114 + (163 - 114) * t)}, ${Math.round(128 + (74 - 128) * t)})`;
          return `<rect x="${x.toFixed(1)}" y="${(CHART_H - h).toFixed(1)}" width="${w2.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}"/>` +
            `<text x="${(x + w2 / 2).toFixed(1)}" y="${(CHART_H - h - 4).toFixed(1)}" font-size="9" fill="#334155" text-anchor="middle">${values[i].toFixed(1)}%</text>` +
            `<text x="${(x + w2 / 2).toFixed(1)}" y="${CHART_H + 14}" font-size="9" fill="#64748b" text-anchor="middle">${d}</text>`;
        }).join('');
      }

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#pu-blend-val', `${this.blend}%`);
      setText('#pu-mode', this.blend === 0 ? '근사 K (18강)' : this.blend === 100 ? '측정 K + 왜곡 보정 (오늘)' : '중간 보정 적용');
    }

    @addEventListener('#pu-blend', 'input')
    onBlend(e: Event) { this.blend = Number((e.target as HTMLInputElement).value); this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .pu-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .pu-intro b { color:#0369a1; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:50px; text-align:right; color:#1e293b; }
          svg { display:block; width:100%; max-width:${CHART_W}px; margin:14px auto 4px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; overflow:visible; }
          .pu-mode { text-align:center; font-size:12.5px; font-weight:700; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:6px 12px; margin-top:16px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="pu-intro">
          같은 solvePnP 코드라도 <b>K가 정확할수록 거리 추정이 정확</b>해집니다. 아래 슬라이더를 0(근사 K)에서 100(오늘 캘리브레이션한 진짜 K)으로 움직이며, 30/50/80cm 거리의 오차 막대가 어떻게 줄어드는지 확인해보세요.
        </div>

        <div class="math-desc">막대 위 숫자 = 실측 거리 대비 오차(%)</div>

        <div class="ctl"><label>보정 적용 <input id="pu-blend" type="range" min="0" max="100" step="5" value="${this.blend}"><b id="pu-blend-val">${this.blend}%</b></label></div>

        <svg viewBox="0 0 ${CHART_W} ${CHART_H + 18}"><g id="pu-bars"></g></svg>
        <div class="pu-mode" id="pu-mode"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
