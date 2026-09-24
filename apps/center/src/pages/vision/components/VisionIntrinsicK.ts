import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-intrinsic-k';

const CANVAS_W = 320;
const CANVAS_H = 240;
const GRID = [-1, -0.5, 0, 0.5, 1];

const BALL_CANVAS_W = 200;
const BALL_CANVAS_H = 150;

const MD = `
## 내부파라미터 K — 상을 픽셀로
- \`(x,y)\`(미터 단위 정규화 좌표)를 픽셀로 바꾸려면 **센서 픽셀 크기로 나누고, 원점을 왼쪽 위로 옮겨야** 합니다. 이를 한 행렬에 담은 것이 **내부파라미터(intrinsic) 행렬 K**입니다.
- \`u = fx·X/Z + cx\`, \`v = fy·Y/Z + cy\`
- **fx, fy**: 초점거리를 픽셀 단위로 표현한 값 — 크면 "확대해서 보는" 효과(같은 물체가 더 크게 찍힘)
- **cx, cy**: 주점(principal point) — 광축이 뚫는 픽셀 좌표, 보통 이미지 중앙 근처
- 위 그래프는 Z=5m 평면 위의 5×5 격자점을 투영한 것입니다. **fx·fy를 키우면 격자 간격이 벌어지고(줌인), cx·cy를 바꾸면 격자 전체가 옆으로 밀립니다.**

## K는 언제 쓰나 — 실전은 대부분 "역방향"
K는 손잡이가 아니라 **카메라 하나당 한 번 측정해서 고정해두는 값**(20강 캘리브레이션)입니다. 실전에서는 3D→픽셀(정방향)보다, **픽셀→3D 정보(역방향)** 로 훨씬 많이 씁니다 — 아래는 22강에서 쓰는 거리 추정식 \`Z = fx·실제지름 / (2·r_px)\`: 공의 실제 크기를 알고 화면에서의 픽셀 반지름을 재면, fx로 거꾸로 "로봇 앞 몇 미터에 있는지"를 구합니다. 18강 PnP(포즈 추정), 스테레오 비전도 전부 이 "픽셀에서 거꾸로 3D를 복원"하는 역방향 활용입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionIntrinsicK extends w.HTMLElement {
    private fx = 300;
    private fy = 300;
    private cx = 160;
    private cy = 120;
    private Z = 5;
    private ballDiameter = 0.2; // 실제 지름 (m)
    private rPx = 40; // 화면에서 감지된 공의 픽셀 반지름

    private refresh() {
      const { fx, fy, cx, cy, Z } = this;
      const canvas = this.shadowRoot?.querySelector('#ik-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // 주점(principal point) 십자선
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, 0); ctx.lineTo(cx, CANVAS_H);
        ctx.moveTo(0, cy); ctx.lineTo(CANVAS_W, cy);
        ctx.stroke();
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();

        // 5x5 격자점 투영 (연결선 + 점)
        const pts: { u: number; v: number }[][] = GRID.map(Y =>
          GRID.map(X => ({ u: (fx * X) / Z + cx, v: (fy * Y) / Z + cy }))
        );
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.2;
        pts.forEach(row => {
          ctx.beginPath();
          row.forEach((p, i) => (i === 0 ? ctx.moveTo(p.u, p.v) : ctx.lineTo(p.u, p.v)));
          ctx.stroke();
        });
        for (let c = 0; c < GRID.length; c++) {
          ctx.beginPath();
          pts.forEach((row, i) => (i === 0 ? ctx.moveTo(row[c].u, row[c].v) : ctx.lineTo(row[c].u, row[c].v)));
          ctx.stroke();
        }
        ctx.fillStyle = '#7dd3fc';
        pts.flat().forEach(p => {
          ctx.beginPath();
          ctx.arc(p.u, p.v, 2.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      const u = (fx * 0.5) / Z + cx;
      const v = (fy * 0.5) / Z + cy;
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#ik-fx-val', String(fx));
      setText('#ik-fy-val', String(fy));
      setText('#ik-cx-val', String(cx));
      setText('#ik-cy-val', String(cy));
      setText('#ik-z-val', `${Z.toFixed(1)}m`);
      setText('#ik-formula', `예: X=Y=0.5, Z=${Z.toFixed(1)} → u=fx·X/Z+cx=${u.toFixed(1)}, v=fy·Y/Z+cy=${v.toFixed(1)}`);

      // 실전 활용: 픽셀 반지름 -> 거리 역산 (22강 Z = fx·실제지름 / (2·r_px))
      const estimatedZ = (fx * this.ballDiameter) / (2 * this.rPx);
      setText('#ik-diam-val', `${(this.ballDiameter * 100).toFixed(0)}cm`);
      setText('#ik-rpx-val', `${this.rPx}px`);
      setText('#ik-dist-formula', `Z = fx·실제지름/(2·r_px) = ${fx}×${this.ballDiameter.toFixed(2)}/(2×${this.rPx}) = ${estimatedZ.toFixed(2)}m`);

      const ballCanvas = this.shadowRoot?.querySelector('#ik-ball-canvas') as HTMLCanvasElement;
      const bctx = ballCanvas?.getContext('2d');
      if (bctx) {
        bctx.clearRect(0, 0, BALL_CANVAS_W, BALL_CANVAS_H);
        bctx.fillStyle = '#0f172a';
        bctx.fillRect(0, 0, BALL_CANVAS_W, BALL_CANVAS_H);
        bctx.fillStyle = '#ef4444';
        bctx.beginPath();
        bctx.arc(BALL_CANVAS_W / 2, BALL_CANVAS_H / 2, Math.min(this.rPx, BALL_CANVAS_H / 2 - 2), 0, Math.PI * 2);
        bctx.fill();
      }
    }

    @addEventListener('#ik-fx', 'input')
    onFx(e: Event) { this.fx = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('#ik-fy', 'input')
    onFy(e: Event) { this.fy = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('#ik-cx', 'input')
    onCx(e: Event) { this.cx = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#ik-cy', 'input')
    onCy(e: Event) { this.cy = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#ik-z', 'input')
    onZ(e: Event) { this.Z = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('#ik-diam', 'input')
    onDiam(e: Event) { this.ballDiameter = Number((e.target as HTMLInputElement).value) || 0.01; this.refresh(); }
    @addEventListener('#ik-rpx', 'input')
    onRpx(e: Event) { this.rPx = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }

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
          .ctl b { min-width:55px; text-align:right; color:#1e293b; }
          canvas { display:block; width:${CANVAS_W}px; height:${CANVAS_H}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .ik-formula { font-size:12px; font-weight:700; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 12px; margin-top:6px; text-align:center; }
          .ik-section-title { font-size:12px; font-weight:800; color:#0369a1; margin-top:20px; padding-top:14px; border-top:1px dashed #cbd5e1; }
          .ik-ball-row { display:flex; gap:20px; align-items:center; margin-top:10px; flex-wrap:wrap; justify-content:center; }
          canvas#ik-ball-canvas { width:${BALL_CANVAS_W}px; height:${BALL_CANVAS_H}px; margin:0; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .ik-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .ik-intro b { color:#0369a1; }
        </style>

        <div class="ik-intro">
          핀홀 모델의 \`x=f·X/Z\`는 <b>미터 단위</b> 상 좌표입니다. 이걸 실제 이미지의 <b>픽셀 번호</b>로 바꾸려면 센서 픽셀 크기로 나누고 원점을 왼쪽 위로 옮겨야 하는데, 이 변환을 한 행렬에 담은 게 <b>내부파라미터 K</b>(fx,fy,cx,cy)입니다. 카메라 모델마다, 심지어 같은 모델이라도 조립 공차 때문에 K 값이 조금씩 다릅니다.
        </div>

        <div class="math-desc">Z=5m 평면의 5×5 격자가 K(fx,fy,cx,cy)에 따라 화면(320×240) 어디에 찍히는지 확인해보세요. 주황 십자선=주점(cx,cy).</div>

        <div class="ctl"><label>fx <input id="ik-fx" type="range" min="100" max="600" step="10" value="${this.fx}"><b id="ik-fx-val">${this.fx}</b></label></div>
        <div class="ctl"><label>fy <input id="ik-fy" type="range" min="100" max="600" step="10" value="${this.fy}"><b id="ik-fy-val">${this.fy}</b></label></div>
        <div class="ctl"><label>cx (주점 x) <input id="ik-cx" type="range" min="0" max="320" step="5" value="${this.cx}"><b id="ik-cx-val">${this.cx}</b></label></div>
        <div class="ctl"><label>cy (주점 y) <input id="ik-cy" type="range" min="0" max="240" step="5" value="${this.cy}"><b id="ik-cy-val">${this.cy}</b></label></div>
        <div class="ctl"><label>Z (격자 거리) <input id="ik-z" type="range" min="2" max="10" step="0.5" value="${this.Z}"><b id="ik-z-val">${this.Z.toFixed(1)}m</b></label></div>

        <canvas id="ik-canvas" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
        <div class="ik-formula" id="ik-formula"></div>

        <div class="ik-section-title">🎯 실전 활용 — 픽셀 반지름으로 거리 역산 (22강)</div>
        <div class="ctl"><label>공의 실제 지름 <input id="ik-diam" type="range" min="0.02" max="0.5" step="0.01" value="${this.ballDiameter}"><b id="ik-diam-val">${(this.ballDiameter * 100).toFixed(0)}cm</b></label></div>
        <div class="ctl"><label>화면에 찍힌 반지름 <input id="ik-rpx" type="range" min="5" max="150" step="1" value="${this.rPx}"><b id="ik-rpx-val">${this.rPx}px</b></label></div>
        <div class="ik-ball-row">
          <canvas id="ik-ball-canvas" width="${BALL_CANVAS_W}" height="${BALL_CANVAS_H}"></canvas>
        </div>
        <div class="ik-formula" id="ik-dist-formula"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
