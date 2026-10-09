import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-contour-filter';

const PANEL_W = 160;
const PANEL_H = 120;

type Shape = { kind: 'circle' | 'rect'; x: number; y: number; w: number; h: number; label: string };

/** 원: area=πr², perimeter=2πr. 사각형: area=wh, perimeter=2(w+h). circularity=4πA/P². */
function metrics(s: Shape): { area: number; circularity: number } {
  if (s.kind === 'circle') {
    const r = s.w / 2;
    const area = Math.PI * r * r;
    const peri = 2 * Math.PI * r;
    return { area, circularity: (4 * Math.PI * area) / (peri * peri + 1e-9) };
  }
  const area = s.w * s.h;
  const peri = 2 * (s.w + s.h);
  return { area, circularity: (4 * Math.PI * area) / (peri * peri + 1e-9) };
}

const SHAPES: Shape[] = [
  { kind: 'circle', x: 95, y: 40, w: 58, h: 58, label: '목표(공)' }, // 진짜 공 - 크고 원형
  { kind: 'rect', x: 20, y: 85, w: 42, h: 14, label: '책 모서리' }, // 길쭉한 사각형 - 크지만 안 둥긂
  { kind: 'circle', x: 15, y: 20, w: 5, h: 5, label: '노이즈' },
  { kind: 'circle', x: 35, y: 15, w: 4, h: 4, label: '노이즈' },
  { kind: 'circle', x: 60, y: 95, w: 6, h: 6, label: '노이즈' },
  { kind: 'circle', x: 130, y: 90, w: 5, h: 5, label: '노이즈' },
];

const MD = `
## 컨투어 — 덩어리를 찾고 재기
- 마스크에서 흰 덩어리들의 윤곽(contour)을 뽑아, **면적 필터**와 **형상(원형도) 필터**로 2단 방어를 합니다.
- **면적 필터** (\`area < min_area → 제외\`): 점 노이즈처럼 작은 덩어리를 걸러냅니다.
- **원형도(circularity) 필터**: \`circularity = 4πA/P²\` — 완전한 원이면 정확히 1.0, 길쭉하거나 울퉁불퉁할수록 0에 가까워집니다. 같은 면적이면 **원이 둘레가 가장 짧다**는 성질을 이용한 지표입니다. 공이면 보통 0.7 이상이 나옵니다.
- 필터를 통과한 후보 중 **가장 넓은 것**을 최종 선택하고, **모멘트(m10/m00, m01/m00)**로 중심을 구합니다 — 픽셀 평균이라 바운딩 박스 중심보다 노이즈에 강합니다.
- 필터는 결국 "**무엇이 아닌가**"를 코드로 적는 일입니다 — 검출기의 성능은 대부분 여기서 갈립니다.
- 이 덩어리를 만드는 건 [[vision-morphology]](16강)의 열림·닫힘 결과입니다 — **마스크가 조명 탓에 너덜너덜하면 진짜 공도 원형도가 떨어져 탈락할 수 있습니다.** 문턱값만 만지지 말고 마스크 품질(모폴로지 커널 크기)도 함께 조정해야 하는 이유입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionContourFilter extends w.HTMLElement {
    private minArea = 300;
    private minCircularity = 0.6;

    private refresh() {
      const { minArea, minCircularity } = this;
      const evaluated = SHAPES.map(s => ({ ...s, ...metrics(s) }));
      const passed = evaluated.filter(s => s.area >= minArea && s.circularity >= minCircularity);
      const best = passed.reduce<typeof evaluated[number] | null>((acc, s) => (!acc || s.area > acc.area ? s : acc), null);

      const q = (sel: string) => this.shadowRoot?.querySelector(sel);

      // 패널 ①: 모든 후보 (흰색)
      q('#cf-all')!.innerHTML = evaluated.map(s => drawShape(s, '#e2e8f0')).join('');

      // 패널 ②: 필터 결과 (통과=초록, 탈락=빨강)
      q('#cf-filtered')!.innerHTML = evaluated
        .map(s => drawShape(s, s.area >= minArea && s.circularity >= minCircularity ? '#22c55e' : '#ef4444'))
        .join('');

      // 패널 ③: 최종 선택
      if (best) {
        const cx = best.x + best.w / 2, cy = best.y + best.h / 2;
        q('#cf-final')!.innerHTML =
          drawShape(best, '#22c55e') +
          `<rect x="${best.x}" y="${best.y}" width="${best.w}" height="${best.h}" fill="none" stroke="#facc15" stroke-width="1.5"/>` +
          `<line x1="${cx - 6}" y1="${cy}" x2="${cx + 6}" y2="${cy}" stroke="#ef4444" stroke-width="2"/>` +
          `<line x1="${cx}" y1="${cy - 6}" x2="${cx}" y2="${cy + 6}" stroke="#ef4444" stroke-width="2"/>`;
      } else {
        q('#cf-final')!.innerHTML = `<text x="${PANEL_W / 2}" y="${PANEL_H / 2}" font-size="11" fill="#ef4444" text-anchor="middle">검출 실패</text>`;
      }

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#cf-area-val', String(minArea));
      setText('#cf-circ-val', minCircularity.toFixed(2));
      setText('#cf-result', best
        ? `✅ 선택됨: area=${best.area.toFixed(0)}px², circularity=${best.circularity.toFixed(2)} → 중심(${(best.x + best.w / 2).toFixed(0)}, ${(best.y + best.h / 2).toFixed(0)})`
        : '❌ 통과한 후보 없음 — 문턱값이 너무 빡빡합니다');
    }

    @addEventListener('#cf-area', 'input')
    onArea(e: Event) { this.minArea = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#cf-circ', 'input')
    onCirc(e: Event) { this.minCircularity = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

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
          .cf-strip { display:flex; gap:10px; margin-top:14px; flex-wrap:wrap; justify-content:center; }
          .cf-panel { text-align:center; }
          .cf-panel-label { font-size:10.5px; font-weight:700; color:#475569; margin-top:4px; max-width:${PANEL_W}px; }
          svg.cf-svg { display:block; width:${PANEL_W}px; height:${PANEL_H}px; background:#0f172a; border-radius:6px; border:1px solid #e2e8f0; }
          .cf-result { text-align:center; font-size:12px; font-weight:700; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 12px; margin-top:10px; }
          .cf-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .cf-intro b { color:#0369a1; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="cf-intro">
          마스크에는 보통 진짜 물체 말고도 점 노이즈나 모양이 다른 비슷한 색 물체가 같이 흰색으로 찍힙니다. <b>면적 필터</b>로 작은 점들을 치우고, <b>원형도 필터</b>로 둥글지 않은 모양을 치운 다음, 남은 것 중 가장 큰 걸 "진짜 물체"로 고릅니다.
        </div>

        <div class="math-desc">면적·원형도 문턱값을 바꿔가며 후보 6개(공 1 + 책 모서리 1 + 노이즈 점 4개) 중 뭐가 걸러지는지 확인해보세요.</div>

        <div class="ctl"><label>min_area <input id="cf-area" type="range" min="0" max="3500" step="10" value="${this.minArea}"><b id="cf-area-val">${this.minArea}</b></label></div>
        <div class="ctl"><label>min circularity <input id="cf-circ" type="range" min="0" max="1" step="0.05" value="${this.minCircularity}"><b id="cf-circ-val">${this.minCircularity.toFixed(2)}</b></label></div>

        <div class="cf-strip">
          <div class="cf-panel">
            <svg class="cf-svg" id="cf-all" viewBox="0 0 ${PANEL_W} ${PANEL_H}"></svg>
            <div class="cf-panel-label">① 모든 후보(물체+노이즈+배경)</div>
          </div>
          <div class="cf-panel">
            <svg class="cf-svg" id="cf-filtered" viewBox="0 0 ${PANEL_W} ${PANEL_H}"></svg>
            <div class="cf-panel-label">② 면적·원형도 필터(빨강=탈락)</div>
          </div>
          <div class="cf-panel">
            <svg class="cf-svg" id="cf-final" viewBox="0 0 ${PANEL_W} ${PANEL_H}"></svg>
            <div class="cf-panel-label">③ 최종 중심(+)과 바운딩 박스</div>
          </div>
        </div>

        <div class="cf-result" id="cf-result"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};

function drawShape(s: Shape, color: string): string {
  if (s.kind === 'circle') {
    return `<circle cx="${s.x + s.w / 2}" cy="${s.y + s.h / 2}" r="${s.w / 2}" fill="${color}"/>`;
  }
  return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${color}"/>`;
}
