import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-distance-solutions';

const BALL_CANVAS_W = 180;
const BALL_CANVAS_H = 130;
const FLOOR_SVG_W = 260;
const FLOOR_SVG_H = 160;

const MD = `
## 해결책 세 가지 — 각각 "무엇을 아는가"가 다르다
| 방법 | 추가로 아는 것 | 원리 | 한계 |
|---|---|---|---|
| ① 실제 크기 | 물체 치수(마커·규격품) | PnP 그 자체 — 크기가 자(스케일 기준)가 됨 | 아는 물체에만 적용 |
| ② 깊이 카메라 | 픽셀별 거리(하드웨어 측정) | 스테레오·ToF·구조광이 Z를 직접 잼 | 센서 비용, 반사·투명 표면 취약 |
| ③ 바닥 평면 | 물체가 바닥 위 + 카메라 높이·기울기 | 픽셀 광선과 바닥 평면의 교점이 유일하게 결정 | 바닥 가정이 깨지면(들려 있으면) 오차 |

셋 다 본질은 같습니다 — **잃어버린 한 차원(깊이)을 다른 지식으로 채운다.** 사람도 한 눈을 감으면 거리감이 흐려지지만 완전히 잃지는 않는 이유가 바로 ①(아는 크기)과 ③(바닥 접점)을 뇌가 무의식으로 쓰기 때문입니다.
- 22강의 **경로 B**(색 검출 → 거리 추정)는 ①의 공식(\`Z = fx·W/w\`)을 ROS2 \`color_point_node\`에 그대로 옮긴 것입니다 — "아는 크기"가 테니스공 지름(6.7cm) 같은 실측값으로 바뀔 뿐, 수식은 완전히 동일합니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionDistanceSolutions extends w.HTMLElement {
    private fx = 600;
    private knownWidth = 0.06; // m
    private pixelWidth = 90;
    private camHeight = 1.2; // m
    private tiltDeg = 35; // 수평 아래로 기울인 각도

    private refresh() {
      const estZ1 = (this.fx * this.knownWidth) / this.pixelWidth;
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#ds-fx-val', String(this.fx));
      setText('#ds-w-val', `${(this.knownWidth * 100).toFixed(0)}cm`);
      setText('#ds-wpx-val', `${this.pixelWidth}px`);
      setText('#ds-formula1', `Z = fx·W/w = ${this.fx}×${this.knownWidth.toFixed(2)}/${this.pixelWidth} = ${estZ1.toFixed(2)}m`);

      const ballCanvas = this.shadowRoot?.querySelector('#ds-ball') as HTMLCanvasElement;
      const bctx = ballCanvas?.getContext('2d');
      if (bctx) {
        bctx.clearRect(0, 0, BALL_CANVAS_W, BALL_CANVAS_H);
        bctx.fillStyle = '#0f172a';
        bctx.fillRect(0, 0, BALL_CANVAS_W, BALL_CANVAS_H);
        bctx.strokeStyle = '#ef4444';
        bctx.lineWidth = 2;
        const w = Math.min(this.pixelWidth, BALL_CANVAS_W - 10);
        bctx.strokeRect((BALL_CANVAS_W - w) / 2, (BALL_CANVAS_H - w / 2) / 2, w, w / 2);
      }

      // 바닥 평면 해결책: 카메라 높이 h, 기울기 θ(수평 아래) -> 바닥까지 수평거리 d = h/tan(θ)
      const tiltRad = (this.tiltDeg * Math.PI) / 180;
      const dFloor = this.camHeight / Math.tan(tiltRad);
      setText('#ds-h-val', `${this.camHeight.toFixed(1)}m`);
      setText('#ds-tilt-val', `${this.tiltDeg}°`);
      setText('#ds-formula3', `d = h/tan(θ) = ${this.camHeight.toFixed(1)}/tan(${this.tiltDeg}°) = ${dFloor.toFixed(2)}m`);

      const svg = this.shadowRoot?.querySelector('#ds-floor-svg');
      const camX = 30, camY = 20, floorY = FLOOR_SVG_H - 20;
      const camHeightPx = floorY - camY;
      const scale = camHeightPx / Math.max(this.camHeight, 0.1);
      const actualCamY = floorY - this.camHeight * scale;
      const rayLen = Math.min(FLOOR_SVG_W - camX - 10, dFloor * (scale * 0.5) + 1);
      const hitX = camX + rayLen;
      const hitY = floorY;
      const setAttr = (sel: string, attr: string, val: string) => this.shadowRoot?.querySelector(sel)?.setAttribute(attr, val);
      setAttr('#ds-cam-dot', 'cy', String(actualCamY));
      setAttr('#ds-cam-dot', 'cx', String(camX));
      setAttr('#ds-floor-ray', 'x1', String(camX));
      setAttr('#ds-floor-ray', 'y1', String(actualCamY));
      setAttr('#ds-floor-ray', 'x2', String(hitX));
      setAttr('#ds-floor-ray', 'y2', String(hitY));
      setAttr('#ds-floor-line', 'y1', String(floorY));
      setAttr('#ds-floor-line', 'y2', String(floorY));
      setAttr('#ds-floor-hit', 'cx', String(hitX));
      setAttr('#ds-floor-hit', 'cy', String(hitY));
    }

    @addEventListener('#ds-fx', 'input')
    onFx(e: Event) { this.fx = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('#ds-w', 'input')
    onW(e: Event) { this.knownWidth = Number((e.target as HTMLInputElement).value) || 0.01; this.refresh(); }
    @addEventListener('#ds-wpx', 'input')
    onWpx(e: Event) { this.pixelWidth = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('#ds-h', 'input')
    onH(e: Event) { this.camHeight = Number((e.target as HTMLInputElement).value) || 0.1; this.refresh(); }
    @addEventListener('#ds-tilt', 'input')
    onTilt(e: Event) { this.tiltDeg = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .ds-method { margin-top:16px; padding-top:14px; border-top:1px dashed #cbd5e1; }
          .ds-method:first-child { margin-top:0; padding-top:0; border-top:none; }
          .ds-method-title { font-size:13px; font-weight:800; color:#0369a1; margin-bottom:6px; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:55px; text-align:right; color:#1e293b; }
          canvas, svg { display:block; margin:10px auto 0; border-radius:8px; border:1px solid #e2e8f0; }
          canvas#ds-ball { width:${BALL_CANVAS_W}px; height:${BALL_CANVAS_H}px; }
          svg#ds-floor-svg { width:100%; max-width:${FLOOR_SVG_W}px; background:#f8fafc; }
          .ds-formula { font-size:12px; font-weight:700; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:6px 12px; margin-top:8px; text-align:center; font-family:monospace; }
          .ds-depth-note { text-align:center; font-size:12px; color:#64748b; padding:12px; background:#f8fafc; border-radius:8px; border:1px dashed #cbd5e1; margin-top:6px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md table { border-collapse:collapse; width:100%; font-size:12px; margin:8px 0; }
          .md th, .md td { border:1px solid #e2e8f0; padding:5px 8px; text-align:left; }
          .md th { background:#f0f9ff; color:#0369a1; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .ds-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .ds-intro b { color:#0369a1; }
        </style>

        <div class="ds-intro">
          앞 탭에서 본 것처럼, 사진 한 장만으로는 거리(깊이)를 원리적으로 알 수 없습니다 — 잃어버린 정보는 다른 지식으로 "채워 넣는" 수밖에 없습니다. 아래 세 방법은 전부 같은 문제를 풀지만, **각자 무엇을 추가로 아는지**가 다릅니다.
        </div>

        <div class="math-desc">단안 거리 모호성을 푸는 세 가지 방법 — 각자 다른 "추가 지식"으로 잃어버린 깊이를 채웁니다.</div>

        <div class="ds-method">
          <div class="ds-method-title">① 실제 크기를 안다 (PnP와 동일 원리)</div>
          <div class="ctl"><label>fx <input id="ds-fx" type="range" min="200" max="1000" step="10" value="${this.fx}"><b id="ds-fx-val">${this.fx}</b></label></div>
          <div class="ctl"><label>실제 폭 W <input id="ds-w" type="range" min="0.02" max="0.3" step="0.01" value="${this.knownWidth}"><b id="ds-w-val">${(this.knownWidth * 100).toFixed(0)}cm</b></label></div>
          <div class="ctl"><label>픽셀 폭 w <input id="ds-wpx" type="range" min="10" max="200" step="1" value="${this.pixelWidth}"><b id="ds-wpx-val">${this.pixelWidth}px</b></label></div>
          <canvas id="ds-ball" width="${BALL_CANVAS_W}" height="${BALL_CANVAS_H}"></canvas>
          <div class="ds-formula" id="ds-formula1"></div>
        </div>

        <div class="ds-method">
          <div class="ds-method-title">② 깊이 카메라</div>
          <div class="ds-depth-note">스테레오·ToF·구조광 센서가 각 픽셀의 Z를 <b>하드웨어로 직접 측정</b>합니다 — 계산이 아니라 측정이라 모호성 자체가 없습니다. 대신 센서 비용과 반사·투명 표면에서는 측정이 깨질 수 있습니다.</div>
        </div>

        <div class="ds-method">
          <div class="ds-method-title">③ 바닥 평면 가정</div>
          <div class="ctl"><label>카메라 높이 h <input id="ds-h" type="range" min="0.3" max="2.5" step="0.1" value="${this.camHeight}"><b id="ds-h-val">${this.camHeight.toFixed(1)}m</b></label></div>
          <div class="ctl"><label>기울기 θ (수평 아래) <input id="ds-tilt" type="range" min="5" max="80" step="1" value="${this.tiltDeg}"><b id="ds-tilt-val">${this.tiltDeg}°</b></label></div>
          <svg id="ds-floor-svg" viewBox="0 0 ${FLOOR_SVG_W} ${FLOOR_SVG_H}">
            <line id="ds-floor-line" x1="0" x2="${FLOOR_SVG_W}" y1="0" y2="0" stroke="#92400e" stroke-width="2"/>
            <circle id="ds-cam-dot" cx="0" cy="0" r="5" fill="#1e293b"/>
            <line id="ds-floor-ray" x1="0" y1="0" x2="0" y2="0" stroke="#0369a1" stroke-width="2"/>
            <circle id="ds-floor-hit" cx="0" cy="0" r="5" fill="#22c55e"/>
          </svg>
          <div class="ds-formula" id="ds-formula3"></div>
          <div class="ds-depth-note"><b>자율주행차가 "차선 위 흰 물체"까지의 거리를 재는 방식</b>이 바로 이것입니다 — 차는 바닥(도로)이 평평하다고 가정하고, 카메라 높이·기울기만 알면 화면 속 아무 점이든 바닥과 만나는 지점의 실제 거리를 계산합니다. 도로에 턱이나 과속방지턱이 있으면(바닥 가정이 깨지면) 이 거리가 틀어집니다.</div>
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
