import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-hsv-tuning';

const PLOT_W = 300;
const PLOT_H = 220;
const H_MAX = 60; // 표시 범위 (빨강 공 예시라 0~60만 봐도 충분)
const S_MAX = 255;

type Point = { h: number; s: number; v: number };

function gaussianRand(mean: number, std: number): number {
  const u1 = Math.random(), u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

function genCluster(n: number, hMean: number, hStd: number, sMean: number, sStd: number, vMean: number, vStd: number): Point[] {
  return Array.from({ length: n }, () => ({
    h: Math.max(0, Math.min(H_MAX, gaussianRand(hMean, hStd))),
    s: Math.max(0, Math.min(S_MAX, gaussianRand(sMean, sStd))),
    v: Math.max(0, Math.min(255, gaussianRand(vMean, vStd))),
  }));
}

// 어두운 조명일수록 V(명도)도 함께 낮다 — 그림자/저조도 영역을 V 하한으로 걸러내는 실습용 분포
const LIGHTS = [
  { key: 'daylight', label: '주광', color: '#f59e0b', points: genCluster(60, 4, 3, 205, 25, 200, 25) },
  { key: 'fluorescent', label: '형광등', color: '#d97706', points: genCluster(60, 7, 3.5, 175, 25, 150, 25) },
  { key: 'dark', label: '어두움', color: '#92400e', points: genCluster(60, 9, 4, 140, 30, 60, 25) },
];
const BACKGROUND = genCluster(160, 28, 18, 70, 45, 110, 50);

const MD = `
## HSV 범위 튜닝 — 감이 아니라 도구로
- 트랙바로 H/S/V 상·하한을 조절하며 원본/마스크를 나란히 보는 게 실전 절차입니다: **H 상·하한을 조여 물체만 남기고, S 하한으로 배경의 물빠진 색을, V 하한으로 그림자·저조도 영역을 제거**합니다.
- **H는 0~179의 원형 척도**입니다(OpenCV 기준). 빨강은 그 원의 이음매(0과 179가 맞닿는 지점) 위에 있어서 실제로는 \`[0,10] ∪ [170,179]\`처럼 **두 조각으로 쪼개져 있습니다** — 한쪽 조각만 \`inRange\`에 넣으면 마스크 절반이 소리소문 없이 사라집니다.
- 오른쪽(여기서는 아래) 산점도는 세 조명(주광/형광등/어두움)에서 찍은 같은 공의 H-S 분포입니다 — **세 구름을 모두 덮되 배경(회색 점)을 피하는 상자가 좋은 범위**입니다.
- 범위는 **"물체의 분포"와 "배경의 분포" 사이의 협상**입니다 — 너무 좁히면 조명이 조금만 바뀌어도 놓치고, 너무 넓히면 배경이 섞여 들어옵니다.
- 확정한 범위는 코드에 하드코딩하지 말고 **설정(dict/JSON)으로 분리**합니다 — 조명이 바뀌면 숫자만 갈아 끼웁니다. [[vision-colorspace]]에서 다룬 HSV 색상환이 바로 이 H/S/V 세 축이고, 여기서 확정한 범위는 21강에서 ROS2 노드의 파라미터(launch 인자)가 되어 그대로 흘러갑니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionHsvTuning extends w.HTMLElement {
    private hMin = 0;
    private hMax = 12;
    private sMin = 130;
    private sMax = 255;
    private vMin = 50;

    private refresh() {
      const { hMin, hMax, sMin, sMax, vMin } = this;
      const toX = (h: number) => (h / H_MAX) * PLOT_W;
      const toY = (s: number) => PLOT_H - (s / S_MAX) * PLOT_H;

      const setAttr = (sel: string, attr: string, val: string) => this.shadowRoot?.querySelector(sel)?.setAttribute(attr, val);
      setAttr('#ht-box', 'x', String(toX(hMin)));
      setAttr('#ht-box', 'y', String(toY(sMax)));
      setAttr('#ht-box', 'width', String(toX(hMax) - toX(hMin)));
      setAttr('#ht-box', 'height', String(toY(sMin) - toY(sMax)));

      const inBox = (p: Point) => p.h >= hMin && p.h <= hMax && p.s >= sMin && p.s <= sMax && p.v >= vMin;

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#ht-hmin-val', String(hMin));
      setText('#ht-hmax-val', String(hMax));
      setText('#ht-smin-val', String(sMin));
      setText('#ht-smax-val', String(sMax));
      setText('#ht-vmin-val', String(vMin));

      let statsHtml = '';
      LIGHTS.forEach(light => {
        const included = light.points.filter(inBox).length;
        const pct = Math.round((included / light.points.length) * 100);
        statsHtml += `<div><span style="color:${light.color}">■</span> ${light.label}: <b>${pct}%</b> 포함</div>`;
      });
      const bgIncluded = BACKGROUND.filter(inBox).length;
      const bgPct = Math.round((bgIncluded / BACKGROUND.length) * 100);
      statsHtml += `<div><span style="color:#94a3b8">■</span> 배경(오검출 위험): <b style="color:${bgPct > 5 ? '#ef4444' : '#16a34a'}">${bgPct}%</b> 섞임</div>`;
      const statsEl = this.shadowRoot?.querySelector('#ht-stats') as HTMLElement;
      if (statsEl) statsEl.innerHTML = statsHtml;
    }

    @addEventListener('#ht-hmin', 'input')
    onHMin(e: Event) { this.hMin = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#ht-hmax', 'input')
    onHMax(e: Event) { this.hMax = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#ht-smin', 'input')
    onSMin(e: Event) { this.sMin = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#ht-smax', 'input')
    onSMax(e: Event) { this.sMax = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#ht-vmin', 'input')
    onVMin(e: Event) { this.vMin = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const toX = (h: number) => (h / H_MAX) * PLOT_W;
      const toY = (s: number) => PLOT_H - (s / S_MAX) * PLOT_H;
      const dots = (pts: Point[], color: string, r: number) =>
        pts.map(p => `<circle cx="${toX(p.h).toFixed(1)}" cy="${toY(p.s).toFixed(1)}" r="${r}" fill="${color}" fill-opacity="0.8"/>`).join('');

      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:40px; text-align:right; color:#1e293b; }
          svg { display:block; width:100%; max-width:${PLOT_W}px; margin:12px auto; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
          .ht-stats { font-size:12px; font-weight:700; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 12px; margin-top:8px; line-height:1.8; }
          .ht-legend { display:flex; gap:10px; justify-content:center; font-size:10.5px; color:#64748b; margin-top:4px; flex-wrap:wrap; }
          .ht-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .ht-intro b { color:#0369a1; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="ht-intro">
          HSV 범위에 "정답"은 없습니다 — 물체의 색 샘플이 조명마다 조금씩 다른 곳에 찍히고, 배경에도 비슷한 색이 섞여 있기 때문입니다. 좋은 범위란 <b>물체의 세 조명 구름을 전부 덮으면서 배경은 최대한 피하는</b> 상자를 찾는 것 — 감이 아니라 데이터를 보고 협상하는 작업입니다. 스마트폰 카메라 앱의 "그림자 보정" 슬라이더가 하는 일도 결국 이 <b>V(명도) 하한 조정</b>과 같습니다.
        </div>

        <div class="math-desc">H/S/V 슬라이더로 빨간 네모(선택 범위)를 움직여서, 세 조명의 물체 구름을 얼마나 덮고 배경을 얼마나 피하는지, V 하한을 올리면 어두운 조명(갈색 점)이 먼저 빠지는지 확인해보세요.</div>

        <div class="ctl"><label>H min <input id="ht-hmin" type="range" min="0" max="${H_MAX}" step="1" value="${this.hMin}"><b id="ht-hmin-val">${this.hMin}</b></label></div>
        <div class="ctl"><label>H max <input id="ht-hmax" type="range" min="0" max="${H_MAX}" step="1" value="${this.hMax}"><b id="ht-hmax-val">${this.hMax}</b></label></div>
        <div class="ctl"><label>S min <input id="ht-smin" type="range" min="0" max="255" step="5" value="${this.sMin}"><b id="ht-smin-val">${this.sMin}</b></label></div>
        <div class="ctl"><label>S max <input id="ht-smax" type="range" min="0" max="255" step="5" value="${this.sMax}"><b id="ht-smax-val">${this.sMax}</b></label></div>
        <div class="ctl"><label>V min(그림자 제거) <input id="ht-vmin" type="range" min="0" max="255" step="5" value="${this.vMin}"><b id="ht-vmin-val">${this.vMin}</b></label></div>

        <svg viewBox="0 0 ${PLOT_W} ${PLOT_H}">
          ${dots(BACKGROUND, '#94a3b8', 1.8)}
          ${LIGHTS.map(l => dots(l.points, l.color, 2.2)).join('')}
          <rect id="ht-box" x="0" y="0" width="0" height="0" fill="rgba(239,68,68,0.1)" stroke="#ef4444" stroke-width="1.5"/>
        </svg>
        <div class="ht-legend">
          ${LIGHTS.map(l => `<span><span style="color:${l.color}">■</span> ${l.label}</span>`).join('')}
          <span><span style="color:#94a3b8">■</span> 배경</span>
        </div>

        <div class="ht-stats" id="ht-stats"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
