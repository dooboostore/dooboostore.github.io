import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-detection-rate';

const DEFAULT_MIN_AREA = 300;
const DISTANCES = ['근거리', '중거리', '원거리'];
const ROWS: { label: string; base: number[] }[] = [
  { label: '중앙', base: [99, 97, 96] },
  { label: '좌상', base: [98, 95, 88] },
  { label: '우상', base: [97, 96, 90] },
  { label: '좌하', base: [96, 92, 71] },
  { label: '우하', base: [98, 94, 86] },
];

const CAUSES_BASE = [
  { label: '면적 필터(원거리 작음)', pct: 52, color: '#d97706' },
  { label: '조명(H 이탈)', pct: 26, color: '#3b82f6' },
  { label: '원형도', pct: 14, color: '#7c3aed' },
  { label: '배경 혼동', pct: 8, color: '#ef4444' },
];

function rateColor(rate: number): string {
  const t = Math.max(0, Math.min(1, (rate - 60) / 40));
  const hue = t * 120; // 0=red, 120=green
  return `hsl(${hue.toFixed(0)}, 70%, 42%)`;
}

const MD = `
## 평가 프로토콜 — 검출률 재기
- 물체를 화면 **5영역(중앙+네 구석) × 3거리**에 두고 각각 녹화해, (검출 성공 프레임 수 / 전체 프레임 수)를 기록합니다 — 총 15장면의 **검출률 표**.
- 구석·원거리처럼 "까다로운 조건"을 일부러 섞는 이유는, 중앙·근거리만 테스트하면 **실제 운용 환경의 사각지대를 놓치기 때문**입니다.
- 실패한 장면은 원인을 분류합니다: **조명(H 이탈) / 크기(면적 필터) / 모양(원형도) / 배경 혼동**. "안 되는 것 같다"가 아니라 **원인별 비율**로 말해야 무엇을 고칠지 알 수 있습니다.
- 아래 예시처럼 "구석+원거리에서 면적 필터에 걸림"이라는 진단이 나오면, \`min_area\`를 **거리 적응형**(멀수록 작은 값 허용)으로 바꾸는 게 다음 개선 방향입니다 — [[vision-contourfilter]]에서 고정값으로 다뤘던 \`min_area\`가 여기서는 거리별로 다른 값을 쓰는 "거리 적응형" 파라미터로 다시 등장합니다. min_area를 낮춰보며 원거리 열의 검출률이 어떻게 회복되는지 확인해보세요.

## 심화 — 배경이 물체와 같은 색이라면: 색의 한계
- 지금까지의 검출기는 전부 **색(HSV)** 하나에 의존합니다. 만약 배경에 물체와 똑같은 색 영역이 있다면(빨간 벽 앞의 빨간 공), \`inRange\`는 둘을 **원천적으로 구분하지 못합니다** — 원형도·면적 필터로 어느 정도 걸러내지만, 배경 자체가 공 모양·크기와 비슷하면 그마저도 무력해집니다.
- 이것이 색 기반 검출의 **구조적 한계**입니다 — 이후 모듈에서 색이 아니라 **형태·질감·학습된 특징(딥러닝 기반 검출)**으로 넘어가는 이유가 바로 여기 있습니다.
`;

// 영역 5곳을 실제 카메라 뷰파인더 위 위치(정규화 좌표 0~1)로 배치 — ROWS와 같은 순서.
const ZONE_POS: { x: number; y: number }[] = [
  { x: 0.5, y: 0.5 }, // 중앙
  { x: 0.16, y: 0.18 }, // 좌상
  { x: 0.84, y: 0.18 }, // 우상
  { x: 0.16, y: 0.82 }, // 좌하
  { x: 0.84, y: 0.82 }, // 우하
];

function farAvgAt(minArea: number): number {
  const boost = Math.max(0, (DEFAULT_MIN_AREA - minArea) * 0.12);
  return ROWS.reduce((s, r) => s + Math.min(100, r.base[2] + boost), 0) / ROWS.length;
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionDetectionRate extends w.HTMLElement {
    private minArea = DEFAULT_MIN_AREA;
    private selectedDist = 2; // 0=근거리,1=중거리,2=원거리 — 공간 다이어그램에 보여줄 거리

    private refresh() {
      // min_area를 낮출수록 원거리(index 2) 열의 검출률이 회복된다 (거리 적응형 개선 시뮬레이션).
      const boost = Math.max(0, (DEFAULT_MIN_AREA - this.minArea) * 0.12);

      const tableEl = this.shadowRoot?.querySelector('#dr-table') as HTMLElement;
      if (tableEl) {
        const header = `<tr><th></th>${DISTANCES.map(d => `<th>${d}</th>`).join('')}</tr>`;
        const rows = ROWS.map(row => {
          const cells = row.base.map((rate, ci) => {
            const adjusted = ci === 2 ? Math.min(100, rate + boost) : rate;
            return `<td style="background:${rateColor(adjusted)}">${adjusted.toFixed(0)}%</td>`;
          }).join('');
          return `<tr><th>${row.label}</th>${cells}</tr>`;
        }).join('');
        tableEl.innerHTML = header + rows;
      }

      // 원거리 열 평균 검출률 상승 → 면적 필터로 인한 실패 비율이 줄고, 나머지 원인이 상대적으로 늘어난다.
      const shrink = Math.min(30, boost * 0.8);
      const causes = CAUSES_BASE.map(c => ({ ...c }));
      causes[0].pct = Math.max(10, causes[0].pct - shrink);
      const redistribute = (CAUSES_BASE[0].pct - causes[0].pct) / 3;
      for (let i = 1; i < causes.length; i++) causes[i].pct += redistribute;

      const pieEl = this.shadowRoot?.querySelector('#dr-pie') as HTMLElement;
      if (pieEl) {
        let acc = 0;
        const slices = causes.map(c => {
          const start = (acc / 100) * 360;
          acc += c.pct;
          const end = (acc / 100) * 360;
          return describeArc(50, 50, 48, start, end, c.color);
        }).join('');
        pieEl.innerHTML = slices;
      }
      const legendEl = this.shadowRoot?.querySelector('#dr-legend') as HTMLElement;
      if (legendEl) {
        legendEl.innerHTML = causes.map(c => `<div><span style="color:${c.color}">■</span> ${c.label}: ${c.pct.toFixed(0)}%</div>`).join('');
      }

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#dr-minarea-val', String(this.minArea));
      const avgFar = farAvgAt(this.minArea);
      setText('#dr-avg', `원거리 열 평균 검출률: ${avgFar.toFixed(1)}%`);

      // 카메라 뷰파인더 공간 다이어그램 — 5영역을 실제 위치에 점으로 찍어 "사각지대"를 직관적으로 보여줌
      this.shadowRoot?.querySelectorAll('.dr-dist-btn').forEach(el => {
        (el as HTMLElement).classList.toggle('active', Number((el as HTMLElement).dataset.idx) === this.selectedDist);
      });
      const mapEl = this.shadowRoot?.querySelector('#dr-map') as HTMLElement;
      if (mapEl) {
        const MW = 220, MH = 150;
        mapEl.innerHTML = `<rect x="2" y="2" width="${MW - 4}" height="${MH - 4}" rx="8" fill="#0f172a"/>` +
          ROWS.map((row, i) => {
            const rate = this.selectedDist === 2 ? Math.min(100, row.base[2] + boost) : row.base[this.selectedDist];
            const pos = ZONE_POS[i];
            const cx = pos.x * MW, cy = pos.y * MH;
            const r = 11 + (rate / 100) * 8;
            return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${rateColor(rate)}"/>` +
              `<text x="${cx.toFixed(1)}" y="${(cy + 3).toFixed(1)}" font-size="9" fill="#fff" text-anchor="middle" font-weight="700">${rate.toFixed(0)}</text>` +
              `<text x="${cx.toFixed(1)}" y="${(cy + r + 11).toFixed(1)}" font-size="8" fill="#94a3b8" text-anchor="middle">${row.label}</text>`;
          }).join('');
      }

      // min_area 전체 구간에서 원거리 평균 검출률이 어떻게 변하는지 보여주는 추세 곡선
      const curveEl = this.shadowRoot?.querySelector('#dr-curve') as HTMLElement;
      if (curveEl) {
        const CW = 220, CH = 90;
        const MIN_A = 50, MAX_A = DEFAULT_MIN_AREA;
        const steps = 25;
        const pts: string[] = [];
        for (let i = 0; i <= steps; i++) {
          const a = MIN_A + ((MAX_A - MIN_A) * i) / steps;
          const v = farAvgAt(a);
          const x = ((a - MIN_A) / (MAX_A - MIN_A)) * CW;
          const y = CH - (v / 100) * CH;
          pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }
        const curX = ((this.minArea - MIN_A) / (MAX_A - MIN_A)) * CW;
        const curY = CH - (avgFar / 100) * CH;
        curveEl.innerHTML = `<polyline points="${pts.join(' ')}" fill="none" stroke="#0369a1" stroke-width="2"/>` +
          `<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="4" fill="#ef4444"/>`;
      }
    }

    @addEventListener('#dr-minarea', 'input')
    onMinArea(e: Event) { this.minArea = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @addEventListener('.dr-dist-btn', 'click', { delegate: true })
    onDistClick(e: Event) {
      const btn = (e.target as HTMLElement).closest('.dr-dist-btn') as HTMLElement;
      if (!btn) return;
      this.selectedDist = Number(btn.dataset.idx);
      this.refresh();
    }

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
          .ctl b { min-width:40px; text-align:right; color:#1e293b; }
          .dr-row { display:flex; gap:20px; margin-top:14px; flex-wrap:wrap; align-items:flex-start; justify-content:center; }
          table#dr-table { border-collapse:collapse; font-size:12px; }
          table#dr-table th, table#dr-table td { border:1px solid #e2e8f0; padding:6px 10px; text-align:center; }
          table#dr-table th { background:#f0f9ff; color:#0369a1; font-weight:800; }
          table#dr-table td { color:#fff; font-weight:700; }
          .dr-pie-box { text-align:center; }
          svg#dr-pie-svg { width:120px; height:120px; }
          .dr-legend { font-size:11px; color:#475569; margin-top:8px; line-height:1.6; text-align:left; }
          .dr-avg { text-align:center; font-size:12px; font-weight:700; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:6px 12px; margin-top:10px; }
          .dr-dist-row { display:flex; gap:6px; justify-content:center; margin:14px 0 6px; }
          .dr-dist-btn { padding:5px 13px; border-radius:16px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:12px; font-weight:700; cursor:pointer; }
          .dr-dist-btn:hover { border-color:#94a3b8; }
          .dr-dist-btn.active { background:linear-gradient(135deg,#0369a1,#7dd3fc); color:#fff; border-color:transparent; }
          .dr-map-box { text-align:center; }
          svg#dr-map-svg { width:220px; height:150px; border-radius:8px; }
          .dr-map-caption { font-size:11px; color:#64748b; margin-top:4px; }
          .dr-curve-box { text-align:center; margin-top:16px; }
          svg#dr-curve-svg { width:220px; height:90px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; }
          .dr-curve-caption { font-size:11px; color:#64748b; margin-top:4px; }
          .dr-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .dr-intro b { color:#0369a1; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="dr-intro">
          검출기를 다 만들었으면 "되는 것 같다"가 아니라 숫자로 평가해야 합니다. 화면의 <b>5영역 × 3거리</b>에 물체를 두고 검출률을 재면, 중앙·근거리만 봐서는 안 보이는 <b>사각지대</b>(구석·원거리)가 드러납니다.
        </div>

        <div class="math-desc">min_area를 낮춰보면서 원거리(작게 찍히는 조건) 검출률이 어떻게 회복되는지, 그만큼 실패 원인 중 "면적 필터" 비중이 줄어드는지 확인해보세요.</div>

        <div class="ctl"><label>min_area <input id="dr-minarea" type="range" min="50" max="${DEFAULT_MIN_AREA}" step="10" value="${this.minArea}"><b id="dr-minarea-val">${this.minArea}</b></label></div>

        <div class="dr-row">
          <table id="dr-table"></table>
          <div class="dr-pie-box">
            <svg id="dr-pie-svg" viewBox="0 0 100 100"><g id="dr-pie"></g></svg>
            <div class="dr-legend" id="dr-legend"></div>
          </div>
        </div>

        <div class="dr-avg" id="dr-avg"></div>

        <div class="dr-dist-row">
          ${DISTANCES.map((d, i) => `<button class="dr-dist-btn" data-idx="${i}">${d}</button>`).join('')}
        </div>
        <div class="dr-map-box">
          <svg id="dr-map-svg" viewBox="0 0 220 150"><g id="dr-map"></g></svg>
          <div class="dr-map-caption">선택한 거리에서 카메라 화면 속 실제 위치별 검출률 — 구석일수록 사각지대 위험</div>
        </div>

        <div class="dr-curve-box">
          <svg id="dr-curve-svg" viewBox="0 0 220 90"><g id="dr-curve"></g></svg>
          <div class="dr-curve-caption">min_area를 낮출수록(←) 원거리 평균 검출률이 어떻게 회복되는지의 전체 궤적 (빨간 점=현재 값)</div>
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number, color: string): string {
  const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${color}"/>`;
}
