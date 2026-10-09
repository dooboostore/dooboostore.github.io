import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-camera-chain';

const CANVAS_W = 320;
const CANVAS_H = 240;

const MD = `
## 오늘의 체인 — 월드 점이 픽셀이 되기까지
\`[월드 좌표 Pw] —[R|t](강체 변환)→ [카메라 좌표 Pc] —Z 나눗셈→ [정규화 좌표] —왜곡 적용→ [왜곡 좌표] —K→ [픽셀 (u,v)]\`

**강체 변환(여기선 R=단위행렬로 단순화한 평행이동만) 한 번 + 나눗셈 한 번 + 왜곡 적용 한 번 + 어파인(K) 한 번 — 카메라의 전부입니다.** 아래 슬라이더로 각 단계의 중간값이 어떻게 바뀌는지 직접 따라가 보세요. (회전 R은 23강에서 더 정밀하게 다룹니다 — 오늘은 평행이동만으로 "사슬의 모양"에 집중합니다.)

22강의 "색 경로 역투영"은 이 체인을 **거꾸로** 걷습니다 — 픽셀(u,v)에서 출발해 K⁻¹ → 왜곡 제거 → (아는 크기로 구한) Z를 곱해 다시 3D 좌표를 복원합니다. 오늘 외운 순서를 뒤에서부터 읽으면 그게 바로 "거리 추정"입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionCameraChain extends w.HTMLElement {
    private Xw = 1.0;
    private Yw = 0.5;
    private Zw = 6;
    private tx = 0;
    private ty = 0;
    private tz = 0;
    private fx = 300;
    private fy = 300;
    private cx = 160;
    private cy = 120;
    private k1 = -0.15;

    private refresh() {
      const { Xw, Yw, Zw, tx, ty, tz, fx, fy, cx, cy, k1 } = this;

      // R=단위행렬인 강체 변환이라 Pc = Pw - t (카메라 원점의 월드좌표가 t)
      const Xc = Xw - tx, Yc = Yw - ty, Zc = Zw - tz;
      // Z 나눗셈 (정규화)
      const x = Xc / Zc, y = Yc / Zc;
      // 방사 왜곡 적용 (k1만 사용 — 단순화)
      const r2 = x * x + y * y;
      const radial = 1 + k1 * r2;
      const xd = x * radial, yd = y * radial;
      // K 적용 (픽셀)
      const u = fx * xd + cx, v = fy * yd + cy;

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#cc-pw', `(${Xw.toFixed(2)}, ${Yw.toFixed(2)}, ${Zw.toFixed(2)})`);
      setText('#cc-pc', `(${Xc.toFixed(2)}, ${Yc.toFixed(2)}, ${Zc.toFixed(2)})`);
      setText('#cc-norm', `(${x.toFixed(3)}, ${y.toFixed(3)})`);
      setText('#cc-dist', `(${xd.toFixed(3)}, ${yd.toFixed(3)})`);
      setText('#cc-pixel', `(${u.toFixed(1)}, ${v.toFixed(1)})`);

      const setVal = (sel: string, text: string) => setText(sel, text);
      setVal('#cc-xw-val', Xw.toFixed(2));
      setVal('#cc-yw-val', Yw.toFixed(2));
      setVal('#cc-zw-val', Zw.toFixed(2));
      setVal('#cc-tx-val', tx.toFixed(2));
      setVal('#cc-ty-val', ty.toFixed(2));
      setVal('#cc-tz-val', tz.toFixed(2));
      setVal('#cc-fx-val', String(fx));
      setVal('#cc-k1-val', k1.toFixed(2));

      const canvas = this.shadowRoot?.querySelector('#cc-canvas') as HTMLCanvasElement;
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
        // Zc<=0이면 카메라 뒤라 애초에 안 보여야 함 - u,v가 우연히 화면 범위 안에 떨어져도 무효로 친다.
        const behindCamera = Zc <= 0;
        const inBounds = !behindCamera && u >= 0 && u <= CANVAS_W && v >= 0 && v <= CANVAS_H;
        ctx.fillStyle = inBounds ? '#22c55e' : '#ef4444';
        ctx.beginPath();
        ctx.arc(Math.max(4, Math.min(CANVAS_W - 4, u)), Math.max(4, Math.min(CANVAS_H - 4, v)), 6, 0, Math.PI * 2);
        ctx.fill();
        const note = this.shadowRoot?.querySelector('#cc-note') as HTMLElement;
        if (note) note.textContent = behindCamera
          ? '⚠ 카메라 뒤(Zc ≤ 0) — 실제로는 보이지 않는 점입니다'
          : inBounds ? '' : '⚠ 화면 밖으로 나감 (좌표가 범위를 벗어남)';
      }
    }

    @addEventListener('#cc-xw', 'input')
    onXw(e: Event) { this.Xw = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#cc-yw', 'input')
    onYw(e: Event) { this.Yw = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#cc-zw', 'input')
    onZw(e: Event) { this.Zw = Number((e.target as HTMLInputElement).value) || 0.1; this.refresh(); }
    @addEventListener('#cc-tx', 'input')
    onTx(e: Event) { this.tx = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#cc-ty', 'input')
    onTy(e: Event) { this.ty = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#cc-tz', 'input')
    onTz(e: Event) { this.tz = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#cc-fx', 'input')
    onFx(e: Event) { this.fx = this.fy = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('#cc-k1', 'input')
    onK1(e: Event) { this.k1 = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

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
          .cc-section-title { font-size:11px; font-weight:800; color:#0369a1; margin-top:12px; text-transform:uppercase; letter-spacing:0.03em; }
          .cc-chain { display:flex; gap:6px; margin-top:14px; flex-wrap:wrap; align-items:stretch; }
          .cc-box { flex:1; min-width:110px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 10px; text-align:center; }
          .cc-box-label { font-size:10px; font-weight:800; color:#0369a1; margin-bottom:4px; }
          .cc-box-val { font-size:12px; font-weight:700; color:#1e293b; font-family:monospace; }
          .cc-arrow { display:flex; align-items:center; color:#94a3b8; font-size:16px; }
          canvas { display:block; width:${CANVAS_W}px; height:${CANVAS_H}px; margin:14px auto 4px; border-radius:8px; border:1px solid #e2e8f0; }
          .cc-note { text-align:center; font-size:12px; font-weight:700; color:#ef4444; min-height:18px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .cc-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .cc-intro b { color:#0369a1; }
        </style>

        <div class="cc-intro">
          지금까지 본 걸 다 이으면: 월드의 3D 점 → <b>[R|t]</b>(카메라 위치·방향만큼 좌표를 옮김) → <b>Z 나눗셈</b>(원근, 핀홀 모델) → <b>왜곡 적용</b>(렌즈 왜곡) → <b>K</b>(픽셀로 변환) → 최종 픽셀. 이 다섯 단계가 "카메라로 사진을 찍는다"는 과정의 수학적 전부입니다. 로봇이 카메라로 물체를 보고 팔을 뻗어 집을 때, 이 다섯 단계(또는 그 역방향)가 매 프레임 실행됩니다. 슬라이더로 각 단계의 중간값이 어떻게 바뀌는지 직접 따라가 보세요.
        </div>

        <div class="math-desc">월드 좌표의 3D 점 하나가 [R|t] → Z 나눗셈 → 왜곡 → K를 거쳐 픽셀이 되기까지, 각 단계의 값을 직접 확인해보세요.</div>

        <div class="cc-section-title">월드 점 Pw</div>
        <div class="ctl"><label>Xw <input id="cc-xw" type="range" min="-2" max="2" step="0.1" value="${this.Xw}"><b id="cc-xw-val">${this.Xw.toFixed(2)}</b></label></div>
        <div class="ctl"><label>Yw <input id="cc-yw" type="range" min="-2" max="2" step="0.1" value="${this.Yw}"><b id="cc-yw-val">${this.Yw.toFixed(2)}</b></label></div>
        <div class="ctl"><label>Zw <input id="cc-zw" type="range" min="1" max="10" step="0.2" value="${this.Zw}"><b id="cc-zw-val">${this.Zw.toFixed(2)}</b></label></div>

        <div class="cc-section-title">[R|t] — 카메라 위치(평행이동만, R=단위행렬)</div>
        <div class="ctl"><label>tx <input id="cc-tx" type="range" min="-2" max="2" step="0.1" value="${this.tx}"><b id="cc-tx-val">${this.tx.toFixed(2)}</b></label></div>
        <div class="ctl"><label>ty <input id="cc-ty" type="range" min="-2" max="2" step="0.1" value="${this.ty}"><b id="cc-ty-val">${this.ty.toFixed(2)}</b></label></div>
        <div class="ctl"><label>tz <input id="cc-tz" type="range" min="-3" max="3" step="0.1" value="${this.tz}"><b id="cc-tz-val">${this.tz.toFixed(2)}</b></label></div>

        <div class="cc-section-title">K · 왜곡</div>
        <div class="ctl"><label>fx=fy <input id="cc-fx" type="range" min="100" max="600" step="10" value="${this.fx}"><b id="cc-fx-val">${this.fx}</b></label></div>
        <div class="ctl"><label>k1 <input id="cc-k1" type="range" min="-0.4" max="0.4" step="0.01" value="${this.k1}"><b id="cc-k1-val">${this.k1.toFixed(2)}</b></label></div>

        <div class="cc-chain">
          <div class="cc-box"><div class="cc-box-label">월드 Pw</div><div class="cc-box-val" id="cc-pw"></div></div>
          <div class="cc-arrow">→</div>
          <div class="cc-box"><div class="cc-box-label">카메라 Pc</div><div class="cc-box-val" id="cc-pc"></div></div>
          <div class="cc-arrow">→</div>
          <div class="cc-box"><div class="cc-box-label">정규화(x,y)</div><div class="cc-box-val" id="cc-norm"></div></div>
          <div class="cc-arrow">→</div>
          <div class="cc-box"><div class="cc-box-label">왜곡 적용</div><div class="cc-box-val" id="cc-dist"></div></div>
          <div class="cc-arrow">→</div>
          <div class="cc-box"><div class="cc-box-label">픽셀(u,v)</div><div class="cc-box-val" id="cc-pixel"></div></div>
        </div>

        <canvas id="cc-canvas" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
        <div class="cc-note" id="cc-note"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
