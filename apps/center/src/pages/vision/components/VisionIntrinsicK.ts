import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-intrinsic-k';

const CANVAS_W = 320;
const CANVAS_H = 240;
// 정규화 평면(미터) 미니 캔버스
const NORM_W = 280;
const NORM_H = 170;
const NORM_S = 200; // px per meter
// 가로로 긴 격자: fx는 좌우로, fy는 상하로 벌어져 둘이 확실히 다르게 보임
const GRID_X = [-1, -0.5, 0, 0.5, 1];
const GRID_Y = [-0.5, 0, 0.5];
// 하이라이트 점 (격자 모서리 — 왼/오른 패널에 동시 표시)
const HL = { X: 1, Y: 0.5 };

const BALL_CANVAS_W = 200;
const BALL_CANVAS_H = 150;
const BALL_S = BALL_CANVAS_W / CANVAS_W; // 픽셀→미니 캔버스 축소율

const MD = `
## 내부파라미터 K — 상을 픽셀로
- \`(x,y)\`(미터 단위 정규화 좌표)를 픽셀로 바꾸려면 **센서 픽셀 크기로 나누고, 원점을 왼쪽 위로 옮겨야** 합니다. 이를 한 행렬에 담은 것이 **내부파라미터(intrinsic) 행렬 K**입니다.
- \`u = fx·X/Z + cx\`, \`v = fy·Y/Z + cy\`
- **fx, fy**: 초점거리를 픽셀 단위로 표현한 값 — 크면 "확대해서 보는" 효과(같은 물체가 더 크게 찍힘). 격자가 가로로 긴 이유: fx를 움직이면 좌우로, fy를 움직이면 상하로 벌어져 둘이 구분됩니다.
- **cx, cy**: 주점(principal point) — 광축이 뚫는 픽셀 좌표, 보통 이미지 중앙 근처. 왼쪽(미터) 패널은 그대로인데 오른쪽(픽셀) 격자만 통째로 밀리는 것을 보세요.
- 주황 점 P가 바로 "같은 점의 번역 전/후"입니다. 왼=미터, 오=픽셀 — K가 하는 일이 이 화살표 하나입니다.

## K는 언제 쓰나 — 실전은 대부분 "역방향"
K는 손잡이가 아니라 **카메라 하나당 한 번 측정해서 고정해두는 값**(20강 캘리브레이션)입니다. 실전에서는 3D→픽셀(정방향)보다, **픽셀→3D 정보(역방향)** 로 훨씬 많이 씁니다 — 아래 공 실험이 22강 거리 추정식 \`Z = fx·실제지름 / (2·r_px)\` 그대로입니다. 공의 실제 크기를 알고 화면에서의 픽셀 반지름을 재면, fx로 거꾸로 "로봇 앞 몇 미터에 있는지"를 구합니다. 측정 반지름은 **정수 픽셀로 반올림**되기 때문에(진짜 검출기처럼) 추정값에 작은 오차가 생기는 것도 확인해보세요. 18강 PnP(포즈 추정), 스테레오 비전도 전부 이 "픽셀에서 거꾸로 3D를 복원"하는 역방향 활용입니다.
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
    private ballZ = 5; // 공의 실제 거리 (m) — r_px는 여기서 물리적으로 계산됨

    private refresh() {
      const { fx, fy, cx, cy, Z } = this;

      // ---- 왼쪽: 정규화 평면 (미터, 원점=중앙, y 아래쪽 = 카메라 좌표계) ----
      const normCanvas = this.shadowRoot?.querySelector('#ik-norm-canvas') as HTMLCanvasElement;
      const nctx = normCanvas?.getContext('2d');
      const ox = NORM_W / 2, oy = NORM_H / 2;
      const nx = (X: number) => ox + (X / Z) * NORM_S;
      const ny = (Y: number) => oy + (Y / Z) * NORM_S;
      if (nctx) {
        nctx.clearRect(0, 0, NORM_W, NORM_H);
        nctx.fillStyle = '#0f172a';
        nctx.fillRect(0, 0, NORM_W, NORM_H);
        // 축
        nctx.strokeStyle = '#475569';
        nctx.lineWidth = 1;
        nctx.beginPath();
        nctx.moveTo(8, oy); nctx.lineTo(NORM_W - 8, oy);
        nctx.moveTo(ox, NORM_H - 8); nctx.lineTo(ox, 8);
        nctx.stroke();
        nctx.fillStyle = '#94a3b8';
        nctx.font = '10px sans-serif';
        nctx.fillText('x(m)', NORM_W - 34, oy - 6);
        nctx.fillText('y(m)↓', ox + 6, NORM_H - 8);
        nctx.fillText('0', ox + 5, oy + 12);
        // 격자
        nctx.strokeStyle = '#38bdf8';
        nctx.lineWidth = 1;
        GRID_Y.forEach(Y => {
          nctx.beginPath();
          GRID_X.forEach((X, i) => (i === 0 ? nctx.moveTo(nx(X), ny(Y)) : nctx.lineTo(nx(X), ny(Y))));
          nctx.stroke();
        });
        GRID_X.forEach(X => {
          nctx.beginPath();
          GRID_Y.forEach((Y, i) => (i === 0 ? nctx.moveTo(nx(X), ny(Y)) : nctx.lineTo(nx(X), ny(Y))));
          nctx.stroke();
        });
        nctx.fillStyle = '#7dd3fc';
        GRID_Y.forEach(Y => GRID_X.forEach(X => {
          nctx.beginPath();
          nctx.arc(nx(X), ny(Y), 2.5, 0, Math.PI * 2);
          nctx.fill();
        }));
        // 하이라이트 P
        nctx.fillStyle = '#f59e0b';
        nctx.beginPath();
        nctx.arc(nx(HL.X), ny(HL.Y), 4.5, 0, Math.PI * 2);
        nctx.fill();
        nctx.fillText('P', nx(HL.X) + 7, ny(HL.Y) + 4);
      }

      // ---- 오른쪽: 픽셀 이미지 (원점=왼쪽 위, y 아래쪽) ----
      const canvas = this.shadowRoot?.querySelector('#ik-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      const pu = (X: number) => (fx * X) / Z + cx;
      const pv = (Y: number) => (fy * Y) / Z + cy;
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
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.fillText('주점(cx,cy)', Math.min(cx + 7, CANVAS_W - 62), Math.min(cy + 14, CANVAS_H - 6));

        // 격자 투영 (연결선 + 점)
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.2;
        GRID_Y.forEach(Y => {
          ctx.beginPath();
          GRID_X.forEach((X, i) => (i === 0 ? ctx.moveTo(pu(X), pv(Y)) : ctx.lineTo(pu(X), pv(Y))));
          ctx.stroke();
        });
        GRID_X.forEach(X => {
          ctx.beginPath();
          GRID_Y.forEach((Y, i) => (i === 0 ? ctx.moveTo(pu(X), pv(Y)) : ctx.lineTo(pu(X), pv(Y))));
          ctx.stroke();
        });
        ctx.fillStyle = '#7dd3fc';
        GRID_Y.forEach(Y => GRID_X.forEach(X => {
          ctx.beginPath();
          ctx.arc(pu(X), pv(Y), 2.5, 0, Math.PI * 2);
          ctx.fill();
        }));
        // 같은 점 P (주황)
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(pu(HL.X), pv(HL.Y), 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText('P', pu(HL.X) + 8, pv(HL.Y) + 4);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('원점(0,0)', 6, 12);
      }

      const hx = HL.X / Z, hy = HL.Y / Z;
      const hu = pu(HL.X), hv = pv(HL.Y);
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#ik-fx-val', String(fx));
      setText('#ik-fy-val', String(fy));
      setText('#ik-cx-val', String(cx));
      setText('#ik-cy-val', String(cy));
      setText('#ik-z-val', `${Z.toFixed(1)}m`);
      setText('#ik-formula', `P: X=${HL.X}, Y=${HL.Y}, Z=${Z.toFixed(1)} → x=${hx.toFixed(3)}m, y=${hy.toFixed(3)}m → u=${hu.toFixed(1)}px, v=${hv.toFixed(1)}px`);

      // ---- 실전 활용: 공의 픽셀 크기는 물리에서, 거리는 식으로 역산 ----
      const rTrue = (fx * this.ballDiameter) / (2 * this.ballZ);
      const rMeas = Math.max(1, Math.round(rTrue)); // 진짜 검출기처럼 정수 픽셀
      const estimatedZ = (fx * this.ballDiameter) / (2 * rMeas);
      const err = estimatedZ - this.ballZ;
      setText('#ik-diam-val', `${(this.ballDiameter * 100).toFixed(0)}cm`);
      setText('#ik-zball-val', `${this.ballZ.toFixed(1)}m`);
      setText('#ik-dist-formula', `r_px = fx·D/(2·Z) = ${fx}×${this.ballDiameter.toFixed(2)}/(2×${this.ballZ.toFixed(1)}) = ${rTrue.toFixed(1)}px → 측정 ${rMeas}px → Z_est = ${estimatedZ.toFixed(2)}m (실제 ${this.ballZ.toFixed(1)}m, 오차 ${err >= 0 ? '+' : ''}${err.toFixed(2)}m)`);

      const ballCanvas = this.shadowRoot?.querySelector('#ik-ball-canvas') as HTMLCanvasElement;
      const bctx = ballCanvas?.getContext('2d');
      if (bctx) {
        bctx.clearRect(0, 0, BALL_CANVAS_W, BALL_CANVAS_H);
        bctx.fillStyle = '#0f172a';
        bctx.fillRect(0, 0, BALL_CANVAS_W, BALL_CANVAS_H);
        // 공은 광축 위 → 주점(cx,cy)에 맺힘. cx·cy를 움직이면 공도 같이 이동!
        const rDraw = Math.min(rMeas * BALL_S, BALL_CANVAS_H / 2 - 2);
        const bx = Math.min(Math.max(cx * BALL_S, rDraw), BALL_CANVAS_W - rDraw);
        const by = Math.min(Math.max(cy * BALL_S, rDraw), BALL_CANVAS_H - rDraw);
        bctx.strokeStyle = '#334155';
        bctx.lineWidth = 1;
        bctx.beginPath();
        bctx.moveTo(bx, 0); bctx.lineTo(bx, BALL_CANVAS_H);
        bctx.moveTo(0, by); bctx.lineTo(BALL_CANVAS_W, by);
        bctx.stroke();
        bctx.fillStyle = '#ef4444';
        bctx.beginPath();
        bctx.arc(bx, by, rDraw, 0, Math.PI * 2);
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
    @addEventListener('#ik-zball', 'input')
    onZball(e: Event) { this.ballZ = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }

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
          .ik-canvas-row { display:flex; gap:12px; flex-wrap:wrap; justify-content:center; align-items:flex-start; margin-top:12px; }
          .ik-canvas-box { display:flex; flex-direction:column; align-items:center; gap:4px; }
          .ik-canvas-cap { font-size:12px; font-weight:800; color:#0369a1; }
          .ik-canvas-cap small { font-weight:600; color:#64748b; }
          canvas.ik-main { display:block; width:${CANVAS_W}px; max-width:100%; height:auto; border-radius:8px; border:1px solid #e2e8f0; }
          canvas.ik-norm { display:block; width:${NORM_W}px; max-width:100%; height:auto; border-radius:8px; border:1px solid #e2e8f0; }
          .ik-formula { font-size:12px; font-weight:700; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 12px; margin-top:6px; text-align:center; }
          .ik-legend { display:flex; flex-wrap:wrap; gap:6px 14px; font-size:12px; color:#475569; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; margin-top:8px; }
          .ik-legend span { display:inline-flex; align-items:center; gap:6px; }
          .dot { width:10px; height:10px; border-radius:50%; display:inline-block; flex-shrink:0; }
          .ik-section-title { font-size:12px; font-weight:800; color:#0369a1; margin-top:20px; padding-top:14px; border-top:1px dashed #cbd5e1; }
          .ik-ball-row { display:flex; gap:20px; align-items:center; margin-top:10px; flex-wrap:wrap; justify-content:center; }
          canvas#ik-ball-canvas { width:${BALL_CANVAS_W}px; max-width:100%; height:auto; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .ik-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .ik-intro b { color:#0369a1; }
        </style>

        <div class="ik-intro">
          핀홀 모델의 \`x=f·X/Z\`는 <b>미터 단위</b> 상 좌표입니다. 이걸 실제 이미지의 <b>픽셀 번호</b>로 바꾸려면 센서 픽셀 크기로 나누고 원점을 왼쪽 위로 옮겨야 하는데, 이 변환을 한 행렬에 담은 게 <b>내부파라미터 K</b>(fx,fy,cx,cy)입니다. 아래 왼쪽이 "번역 전(미터)", 오른쪽이 "번역 후(픽셀)" — K가 하는 일은 이 화살표 하나입니다. 카메라 모델마다, 심지어 같은 모델이라도 조립 공차 때문에 K 값이 조금씩 다릅니다.
        </div>

        <div class="math-desc">Z=5m 평면의 격자가 K에 따라 픽셀로 어떻게 번역되는지 보세요. <b>fx</b>는 좌우로, <b>fy</b>는 상하로 벌립니다. <b>cx·cy</b>는 오른쪽 격자만 통째로 밀고, 주황 십자선=주점입니다. 왼쪽 y축도 아래가 +인 카메라 좌표계라(17강 핀홀의 뒤집힌 상과 같은 방향), 주황 P가 양쪽에서 같은 쪽에 찍힙니다.</div>

        <div class="ctl"><label>fx <input id="ik-fx" type="range" min="100" max="600" step="10" value="${this.fx}"><b id="ik-fx-val">${this.fx}</b></label></div>
        <div class="ctl"><label>fy <input id="ik-fy" type="range" min="100" max="600" step="10" value="${this.fy}"><b id="ik-fy-val">${this.fy}</b></label></div>
        <div class="ctl"><label>cx (주점 x) <input id="ik-cx" type="range" min="0" max="320" step="5" value="${this.cx}"><b id="ik-cx-val">${this.cx}</b></label></div>
        <div class="ctl"><label>cy (주점 y) <input id="ik-cy" type="range" min="0" max="240" step="5" value="${this.cy}"><b id="ik-cy-val">${this.cy}</b></label></div>
        <div class="ctl"><label>Z (격자 거리) <input id="ik-z" type="range" min="2" max="10" step="0.5" value="${this.Z}"><b id="ik-z-val">${this.Z.toFixed(1)}m</b></label></div>

        <div class="ik-canvas-row">
          <div class="ik-canvas-box">
            <div class="ik-canvas-cap">번역 전 <small>정규화 평면 (m, 원점=중앙, y↓)</small></div>
            <canvas id="ik-norm-canvas" class="ik-norm" width="${NORM_W}" height="${NORM_H}"></canvas>
          </div>
          <div class="ik-canvas-box">
            <div class="ik-canvas-cap">번역 후 <small>픽셀 이미지 (px, 원점=왼쪽 위)</small></div>
            <canvas id="ik-canvas" class="ik-main" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
          </div>
        </div>
        <div class="ik-formula" id="ik-formula"></div>
        <div class="ik-legend">
          <span><i class="dot" style="background:#7dd3fc"></i>격자점 (양쪽 같은 점)</span>
          <span><i class="dot" style="background:#f59e0b"></i>P: 번역 전/후 추적점</span>
          <span><i class="dot" style="background:#f59e0b"></i>주점(cx,cy) 십자선</span>
        </div>

        <div class="ik-section-title">🎯 실전 활용 — 공 크기로 거리 역산 (22강)</div>
        <div class="math-desc">공의 <b>실제 거리</b>를 정하면 픽셀 반지름은 물리식으로 자동 계산됩니다. 검출기는 소수점이 아닌 <b>정수 픽셀</b>로만 재니, 그걸로 거꾸로 거리를 구하면 작은 오차가 생깁니다. 위에서 바꾼 <b>fx가 여기 공 크기에도 그대로 반영</b>됩니다 — K는 카메라 고유값이라 한 번 정하면 전체가 따라갑니다. cx·cy를 움직이면 공이 주점을 따라 이동하는 것도 보세요.</div>
        <div class="ctl"><label>공의 실제 지름 <input id="ik-diam" type="range" min="0.02" max="0.5" step="0.01" value="${this.ballDiameter}"><b id="ik-diam-val">${(this.ballDiameter * 100).toFixed(0)}cm</b></label></div>
        <div class="ctl"><label>공의 실제 거리 <input id="ik-zball" type="range" min="1" max="12" step="0.5" value="${this.ballZ}"><b id="ik-zball-val">${this.ballZ.toFixed(1)}m</b></label></div>
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
