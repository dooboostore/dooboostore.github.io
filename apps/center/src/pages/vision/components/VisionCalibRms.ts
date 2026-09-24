import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-calib-rms';

const CHART_W = 320;
const CHART_H = 150;
const BAD_IDX = 7; // "8번" 사진(1-indexed)이 모션 블러로 유난히 큼
const BASE_ERRORS = [0.38, 0.41, 0.33, 0.68, 0.36, 0.44, 0.30, 1.60, 0.21, 0.39, 0.42, 0.37, 0.45, 0.48, 0.40, 0.52, 0.29, 0.53];

function rms(values: number[]): number {
  return Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
}

const MD = `
## RMS 재투영 오차 — 오늘의 성적표
- \`cv2.calibrateCamera\`의 첫 반환값이 RMS입니다: 모든 장·모든 코너의 "예측 자리 vs 실제 자리" 거리를 **제곱평균제곱근**한 값.
- 판정: **< 0.5px 우수**, **0.5~1.0px 양호**, **> 1.0px 재촬영**.
- 제곱을 쓰기 때문에 **한 장의 크게 틀린 사진이 전체 값을 끌어올립니다** — 장별 오차 막대를 보고 흔들린 사진을 골라내는 게 정석입니다.
- 값이 작다고 무조건 좋은 것도 아닙니다: 사진이 전부 정면·중앙이면 오차는 작지만 왜곡 계수는 제대로 추정되지 않습니다([[vision-calib-setup]]).
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionCalibRms extends w.HTMLElement {
    private excludeBad = false;

    private refresh() {
      const values = this.excludeBad ? BASE_ERRORS.filter((_, i) => i !== BAD_IDX) : BASE_ERRORS;
      const overall = rms(values);

      const barsEl = this.shadowRoot?.querySelector('#rms-bars') as HTMLElement;
      if (barsEl) {
        const barW = CHART_W / BASE_ERRORS.length;
        const maxV = 1.8;
        const toY = (v: number) => CHART_H - (v / maxV) * CHART_H;
        barsEl.innerHTML = BASE_ERRORS.map((v, i) => {
          const excluded = this.excludeBad && i === BAD_IDX;
          const h = CHART_H - toY(v);
          const color = excluded ? '#cbd5e1' : (v > 1.0 ? '#ef4444' : v > 0.5 ? '#f59e0b' : '#16a34a');
          return `<rect x="${(i * barW + 1).toFixed(1)}" y="${toY(v).toFixed(1)}" width="${(barW - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" opacity="${excluded ? 0.35 : 1}"/>`;
        }).join('') +
          `<line x1="0" y1="${(CHART_H - (1.0 / maxV) * CHART_H).toFixed(1)}" x2="${CHART_W}" y2="${(CHART_H - (1.0 / maxV) * CHART_H).toFixed(1)}" stroke="#ef4444" stroke-width="1" stroke-dasharray="4,3"/>` +
          `<line x1="0" y1="${(CHART_H - (0.5 / maxV) * CHART_H).toFixed(1)}" x2="${CHART_W}" y2="${(CHART_H - (0.5 / maxV) * CHART_H).toFixed(1)}" stroke="#f59e0b" stroke-width="1" stroke-dasharray="4,3"/>`;
      }

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#rms-overall', `전체 RMS: ${overall.toFixed(3)} px`);
      const verdict = this.shadowRoot?.querySelector('#rms-verdict') as HTMLElement;
      if (verdict) {
        if (overall < 0.5) { verdict.textContent = '✅ 우수 — 바로 사용'; verdict.style.background = '#dcfce7'; verdict.style.color = '#166534'; verdict.style.borderColor = '#bbf7d0'; }
        else if (overall <= 1.0) { verdict.textContent = '🟡 양호'; verdict.style.background = '#fef9c3'; verdict.style.color = '#854d0e'; verdict.style.borderColor = '#fde68a'; }
        else { verdict.textContent = '🔴 재촬영 — 진단표로 원인 탐색'; verdict.style.background = '#fee2e2'; verdict.style.color = '#991b1b'; verdict.style.borderColor = '#fecaca'; }
      }
    }

    @addEventListener('#rms-exclude', 'change')
    onToggle(e: Event) { this.excludeBad = (e.target as HTMLInputElement).checked; this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .rms-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rms-intro b { color:#0369a1; }
          svg { display:block; width:100%; max-width:${CHART_W}px; margin:12px auto; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
          .rms-legend { display:flex; gap:12px; justify-content:center; font-size:11px; color:#64748b; flex-wrap:wrap; }
          .rms-ctl { display:flex; align-items:center; justify-content:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:10px; }
          .rms-overall { text-align:center; font-size:14px; font-weight:800; color:#1e293b; margin-top:10px; }
          .rms-verdict { text-align:center; font-size:12.5px; font-weight:700; border-radius:8px; padding:8px 12px; margin-top:8px; border:1px solid; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rms-intro">
          체커보드 18장을 캘리브레이션했더니 8번 사진 하나가 모션 블러로 재투영 오차 1.6px가 나왔습니다. 제곱평균을 쓰는 RMS는 이런 <b>이상치 하나에도 민감</b>합니다 — 아래 체크박스로 그 사진을 빼보면서 전체 RMS가 어떻게 바뀌는지 확인해보세요.
        </div>

        <div class="math-desc">빨간 점선=1.0px(재촬영), 주황 점선=0.5px(우수) 기준선</div>

        <svg viewBox="0 0 ${CHART_W} ${CHART_H}"><g id="rms-bars"></g></svg>
        <div class="rms-legend">
          <span><span style="color:#16a34a">■</span> &lt;0.5px</span>
          <span><span style="color:#f59e0b">■</span> 0.5~1.0px</span>
          <span><span style="color:#ef4444">■</span> &gt;1.0px</span>
        </div>

        <div class="rms-ctl"><label><input id="rms-exclude" type="checkbox"> 8번(흔들린 사진) 제외하고 재계산</label></div>

        <div class="rms-overall" id="rms-overall"></div>
        <div class="rms-verdict" id="rms-verdict"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
