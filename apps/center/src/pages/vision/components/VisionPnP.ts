import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-pnp';

const CANVAS_W = 320;
const CANVAS_H = 240;
const fx = 300, fy = 300, cx = 160, cy = 120;

const MD = `
## PnP 문제의 정의
- **주어진 것**: ① 물체 좌표계의 3D 점 n개 Pᵢ(마커 모서리 — 설계도에서 앎) ② 그 점들의 픽셀 좌표 pᵢ(검출로 얻음) ③ 카메라 K·왜곡 계수
- **구하는 것**: 물체→카메라 좌표계의 회전 R과 이동 t — 즉 물체의 **6DOF 포즈**. 수식: \`s·pᵢ = K(R·Pᵢ + t)\`
- 사각형이 어떻게 일그러졌는지가 곧 **자세의 흔적**입니다 — 카메라에서 각 모서리로 나가는 광선 4개 위에 "실제 크기를 아는 사각형"을 놓는 방법은 사실상 하나뿐입니다.
- 미지수는 회전 3 + 이동 3 = **6개**. 대응점 하나가 구속 2개(u,v)를 주므로 최소 3점 — 다만 P3P는 해가 최대 4개라 **4번째 점으로 골라냅니다**. 그래서 마커가 사각형(4점)인 것입니다.
- **rvec**: 회전을 축-각(axis-angle)으로 압축한 3벡터 — \`cv2.Rodrigues(rvec)\`로 회전행렬 R로 펼칩니다. **tvec**: 물체 원점의 카메라 좌표계 위치 — Z 성분이 "카메라에서의 거리"입니다.
- **ArUco 마커**는 PnP의 실전 패키지입니다 — 검은/흰 패턴으로 4개 모서리를 안정적으로 검출해주고, 22강의 \`aruco_pose_node\`가 바로 이 PnP 계산을 ROS2 노드로 감싼 것입니다.
- 실무 팁: 마커의 실측 변 길이(\`OBJ\`에 들어가는 값)를 잘못 재면, 구해지는 거리·위치 전체가 **같은 비율로** 틀어집니다 — 방향(rvec)은 맞는데 크기(tvec)만 전부 어긋나는 특징적인 증상으로 알아챌 수 있습니다.
- 다음 탭([[vision-reprojection-error]])에서는 "이 포즈가 맞다고 어떻게 확신하는가"를 다룹니다 — 구해진 R,t로 3D 점을 다시 화면에 투영해 원래 검출 위치와 비교하는 **재투영 오차**입니다.
`;

/** Y축 회전(yaw) R(θ) 적용 후 평행이동 t=(0,0,Z) — 간단한 1축 회전만으로 "일그러짐"을 보여준다. */
function projectCorner(lx: number, ly: number, theta: number, Z: number): { u: number; v: number } {
  const c = Math.cos(theta), s = Math.sin(theta);
  const Xc = lx * c; // + 0*0 (z_local=0이라 s항 없음)
  const Yc = ly;
  const Zc = -lx * s + Z;
  return { u: (fx * Xc) / Zc + cx, v: (fy * Yc) / Zc + cy };
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionPnP extends w.HTMLElement {
    private thetaDeg = 25;
    private Z = 2.0;
    private halfSize = 0.5; // 마커 반변 길이(임의 단위)

    private refresh() {
      const theta = (this.thetaDeg * Math.PI) / 180;
      const s = this.halfSize;
      const localCorners: [number, number][] = [[-s, -s], [s, -s], [s, s], [-s, s]];
      const pts = localCorners.map(([lx, ly]) => projectCorner(lx, ly, theta, this.Z));

      const canvas = this.shadowRoot?.querySelector('#pnp-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.strokeStyle = '#334155';
        ctx.beginPath();
        ctx.moveTo(cx, 0); ctx.lineTo(cx, CANVAS_H);
        ctx.moveTo(0, cy); ctx.lineTo(CANVAS_W, cy);
        ctx.stroke();

        ctx.strokeStyle = '#f59e0b';
        ctx.fillStyle = 'rgba(245,158,11,0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.u, p.v) : ctx.lineTo(p.u, p.v)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        pts.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.u, p.v, 4, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#pnp-theta-val', `${this.thetaDeg}°`);
      setText('#pnp-z-val', this.Z.toFixed(2));
      setText('#pnp-rvec', `rvec ≈ (0, ${theta.toFixed(3)}, 0)  — Y축 기준 ${this.thetaDeg}° 회전`);
      setText('#pnp-tvec', `tvec ≈ (0, 0, ${this.Z.toFixed(2)})  — 카메라에서 거리 ${this.Z.toFixed(2)}`);
    }

    @addEventListener('#pnp-theta', 'input')
    onTheta(e: Event) { this.thetaDeg = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#pnp-z', 'input')
    onZ(e: Event) { this.Z = Number((e.target as HTMLInputElement).value) || 0.5; this.refresh(); }

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
          .ctl b { min-width:50px; text-align:right; color:#1e293b; }
          canvas { display:block; width:${CANVAS_W}px; height:${CANVAS_H}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .pnp-out { font-size:12px; font-weight:700; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:6px 12px; margin-top:4px; font-family:monospace; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .pnp-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .pnp-intro b { color:#0369a1; }
        </style>

        <div class="pnp-intro">
          <b>PnP(Perspective-n-Point)란?</b> 사진 한 장을 보고 "이 물체가 카메라 기준으로 어디에, 어떤 방향으로 놓여있는지"(6DOF 포즈)를 역산하는 문제입니다.
          필요한 재료 3가지 — ① 물체의 실제 3D 모양(치수를 이미 앎, 예: 마커 한 변 5cm) ② 그 모서리들이 사진 속 어느 픽셀에 찍혔는지(검출로 얻음) ③ 카메라의 내부파라미터 K(17강에서 배움).
          이 셋을 알면 "이런 모양으로 찍히려면 물체가 이렇게 놓여 있어야 한다"를 거꾸로 계산할 수 있습니다 — 그게 PnP이고, 결과로 회전 R·이동 t(아래의 rvec·tvec)가 나옵니다.
          <b>AR 가구배치 앱</b>이 카메라 화면 속 바닥에 소파를 딱 맞춰 세우는 것도, <b>로봇 팔</b>이 팔레트에 놓인 부품의 포즈를 잡아 집는 것도 전부 이 PnP 계산입니다.
        </div>

        <div class="math-desc">아래 슬라이더로 실제 그 반대 방향(포즈를 정하면 사진이 어떻게 나오는지)을 먼저 체험해보세요 — 정사각형 마커가 회전(θ)·거리(Z)에 따라 화면에서 어떤 사각형(사다리꼴)으로 찍히는지. 이 "일그러진 모양"이 곧 자세의 흔적이고, PnP는 이 모양만 보고 θ·Z를 역으로 찾아내는 겁니다.</div>

        <div class="ctl"><label>θ (마커 회전, Y축) <input id="pnp-theta" type="range" min="0" max="70" step="1" value="${this.thetaDeg}"><b id="pnp-theta-val">${this.thetaDeg}°</b></label></div>
        <div class="ctl"><label>Z (거리) <input id="pnp-z" type="range" min="1" max="5" step="0.1" value="${this.Z}"><b id="pnp-z-val">${this.Z.toFixed(2)}</b></label></div>

        <canvas id="pnp-canvas" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
        <div class="pnp-out" id="pnp-rvec"></div>
        <div class="pnp-out" id="pnp-tvec"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
