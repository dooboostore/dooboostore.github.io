import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-perf-profile';

const BUDGET_30FPS = 1000 / 30; // 33.3ms
const STAGES_BASE = [
  { label: '블러', ms: 2.1, color: '#0ea5e9' },
  { label: 'HSV 변환', ms: 1.4, color: '#8b5cf6' },
  { label: 'inRange', ms: 1.8, color: '#f59e0b' },
  { label: '모폴로지', ms: 2.3, color: '#10b981' },
  { label: '컨투어', ms: 1.8, color: '#ef4444' },
];

const MD = `
## 통합 루프와 성능 측정 — "되는 것"과 "제때 되는 것"은 다르다
- 16강 필터링·모폴로지 + 19강 HSV 마스킹·컨투어를 한 루프로 합치면, 각 단계마다 시간이 걸립니다: 블러 2.1ms + HSV변환 1.4ms + inRange 1.8ms + 모폴로지 2.3ms + 컨투어 1.8ms = **합 9.4ms**.
- 로봇 비전이 **30FPS**를 맞추려면 한 프레임에 \`1000/30 ≈ 33.3ms\` 안에 모든 처리가 끝나야 합니다 — 9.4ms는 그 예산의 일부만 쓰므로 **여유(23.9ms)**가 있습니다.
- 해상도가 커지면 각 단계의 연산량은 대체로 픽셀 수(가로×세로)에 비례해 늘어납니다 — 해상도를 2배로 키우면 단계별 시간이 약 4배로 늘어 예산을 넘길 수 있습니다.
- 이 FPS·지연 측정은 21강의 \`ros2 topic hz/delay\`, 22강의 rosbag 회귀 시험에서 **그대로 다시 쓰입니다** — "빨라 보인다"가 아니라 숫자로 증명하는 습관이 여기서 시작됩니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionPerfProfile extends w.HTMLElement {
    private resScale = 1; // 해상도 배율(가로·세로 동시 배율) — 처리시간은 대략 scale^2에 비례

    private refresh() {
      const factor = this.resScale * this.resScale;
      const stages = STAGES_BASE.map(s => ({ ...s, ms: s.ms * factor }));
      const sum = stages.reduce((a, s) => a + s.ms, 0);
      const fps = Math.min(30, 1000 / sum);

      const barsEl = this.shadowRoot?.querySelector('#pf-bars') as HTMLElement;
      if (barsEl) {
        const CW = 260, CH = 120;
        const maxV = Math.max(BUDGET_30FPS * 1.3, sum);
        let x = 10;
        const barW = (CW - 20) / stages.length;
        barsEl.innerHTML = stages.map(s => {
          const h = (s.ms / maxV) * CH;
          const bar = `<rect x="${x.toFixed(1)}" y="${(CH - h).toFixed(1)}" width="${(barW - 6).toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}"/>` +
            `<text x="${(x + (barW - 6) / 2).toFixed(1)}" y="${(CH - h - 4).toFixed(1)}" font-size="8" fill="#334155" text-anchor="middle">${s.ms.toFixed(1)}</text>` +
            `<text x="${(x + (barW - 6) / 2).toFixed(1)}" y="${CH + 12}" font-size="7.5" fill="#64748b" text-anchor="middle">${s.label}</text>`;
          x += barW;
          return bar;
        }).join('') +
          `<line x1="0" y1="${(CH - (BUDGET_30FPS / maxV) * CH).toFixed(1)}" x2="${CW}" y2="${(CH - (BUDGET_30FPS / maxV) * CH).toFixed(1)}" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4,3"/>` +
          `<text x="${CW - 2}" y="${(CH - (BUDGET_30FPS / maxV) * CH - 4).toFixed(1)}" font-size="8" fill="#991b1b" text-anchor="end">30FPS 예산 ${BUDGET_30FPS.toFixed(1)}ms</text>`;
      }

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#pf-scale-val', `${this.resScale.toFixed(1)}×`);
      setText('#pf-sum', `합계: ${sum.toFixed(1)}ms`);
      setText('#pf-fps', `달성 가능 FPS: ${fps.toFixed(1)}`);
      const headroom = BUDGET_30FPS - sum;
      const verdict = this.shadowRoot?.querySelector('#pf-verdict') as HTMLElement;
      if (verdict) {
        if (headroom >= 0) {
          verdict.textContent = `✅ 30FPS 예산 대비 여유 ${headroom.toFixed(1)}ms`;
          verdict.style.background = '#dcfce7'; verdict.style.color = '#166534'; verdict.style.borderColor = '#bbf7d0';
        } else {
          verdict.textContent = `🔴 30FPS 예산 초과(${Math.abs(headroom).toFixed(1)}ms 부족) — 해상도를 낮추거나 단계를 줄여야 합니다`;
          verdict.style.background = '#fee2e2'; verdict.style.color = '#991b1b'; verdict.style.borderColor = '#fecaca';
        }
      }
    }

    @addEventListener('#pf-scale', 'input')
    onScale(e: Event) { this.resScale = Number((e.target as HTMLInputElement).value); this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .pf-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .pf-intro b { color:#0369a1; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:40px; text-align:right; color:#1e293b; }
          svg { display:block; width:100%; max-width:280px; margin:14px auto; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; overflow:visible; }
          .pf-stats { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; font-size:12px; text-align:center; margin-top:8px; }
          .pf-stat { background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 10px; font-weight:700; color:#1e293b; }
          .pf-verdict { text-align:center; font-size:12.5px; font-weight:700; border-radius:8px; padding:8px 12px; margin-top:10px; border:1px solid; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="pf-intro">
          검출기가 "되는 것"과 "제때 되는 것"은 다릅니다. 16·19강에서 만든 블러→HSV→inRange→모폴로지→컨투어 다섯 단계를 한 루프로 합치면 합계 시간이 생기고, 그 시간이 로봇의 프레임 주기(30FPS면 33.3ms) 안에 들어와야 실시간으로 쓸 수 있습니다. 해상도를 키워보면서 "예산"을 넘기는 순간을 확인해보세요.
        </div>

        <div class="math-desc">처리 시간은 대략 픽셀 수(해상도²)에 비례 — 해상도 배율을 올리면 각 막대가 배율²만큼 커집니다</div>

        <div class="ctl"><label>해상도 배율 <input id="pf-scale" type="range" min="0.5" max="3" step="0.1" value="${this.resScale}"><b id="pf-scale-val">${this.resScale.toFixed(1)}×</b></label></div>

        <svg viewBox="0 0 260 136"><g id="pf-bars"></g></svg>

        <div class="pf-stats">
          <div class="pf-stat" id="pf-sum"></div>
          <div class="pf-stat" id="pf-fps"></div>
        </div>
        <div class="pf-verdict" id="pf-verdict"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
