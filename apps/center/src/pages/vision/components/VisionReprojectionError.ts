import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-reprojection-error';

const CANVAS_W = 320;
const CANVAS_H = 240;
const fx = 300, fy = 300, cx = 160, cy = 120;
const THETA = (25 * Math.PI) / 180;
const Z = 2.0;
const HALF = 0.5;

/** 17강/18강에서 쓴 것과 동일한 Y축 회전+평행이동 투영. */
function project(lx: number, ly: number): { u: number; v: number } {
  const c = Math.cos(THETA), s = Math.sin(THETA);
  const Xc = lx * c;
  const Yc = ly;
  const Zc = -lx * s + Z;
  return { u: (fx * Xc) / Zc + cx, v: (fy * Yc) / Zc + cy };
}

const CORNERS: [number, number][] = [[-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF]];

const MD = `
## 믿어도 되는가 — 재투영 오차
- 포즈가 나왔으면 검증합니다: 구한 (R,t)로 3D 점들을 다시 투영(17강 정방향)해 **관측 픽셀과의 거리**를 잽니다.
- \`e_reproj = (1/n)·Σ‖π(K,R,t,Pᵢ) − pᵢ‖\`
- **1px 미만**이면 대응·포즈·K가 모두 일관된 상태, **수십 px**면 어딘가(보통 **대응 매칭이나 치수 입력**)가 틀렸다는 신호입니다.
- "풀었다"가 아니라 **"재투영 오차 몇 px"로 말하는 습관** — 20강 캘리브레이션, 22강 파이프라인, 모듈 ⑤ 프로젝트의 공통 합격 기준입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionReprojectionError extends w.HTMLElement {
    private noisePx = 0.3;
    private badMatch = false;

    private refresh() {
      // 재투영(빨간 ○): 참 포즈로 계산한 "모델이 예측하는" 픽셀 — 항상 정확.
      const predicted = CORNERS.map(([lx, ly]) => project(lx, ly));
      // 관측(초록 +): 실제 검출 결과 — 작은 노이즈가 항상 섞이고, "잘못된 대응"이면 코너 하나가 옆 코너 자리와 통째로 뒤바뀜.
      const seed = 12345;
      const rand = (i: number) => {
        const x = Math.sin(seed + i * 999) * 10000;
        return x - Math.floor(x) - 0.5;
      };
      let observed = predicted.map((p, i) => ({
        u: p.u + rand(i * 2) * this.noisePx * 2,
        v: p.v + rand(i * 2 + 1) * this.noisePx * 2,
      }));
      if (this.badMatch) {
        // 0번 코너가 2번 코너(대각선 반대편) 자리의 관측값으로 잘못 매칭됨
        observed = observed.map((o, i) => (i === 0 ? { u: predicted[2].u + rand(10), v: predicted[2].v + rand(11) } : o));
      }

      const errors = predicted.map((p, i) => Math.hypot(p.u - observed[i].u, p.v - observed[i].v));
      const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;

      const canvas = this.shadowRoot?.querySelector('#re-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        predicted.forEach((p, i) => {
          const o = observed[i];
          if (errors[i] > 3) {
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.u, p.v);
            ctx.lineTo(o.u, o.v);
            ctx.stroke();
          }
          // 관측 (초록 +)
          ctx.strokeStyle = '#16a34a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(o.u - 6, o.v); ctx.lineTo(o.u + 6, o.v);
          ctx.moveTo(o.u, o.v - 6); ctx.lineTo(o.u, o.v + 6);
          ctx.stroke();
          // 재투영 (빨간 ○)
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.u, p.v, 6, 0, Math.PI * 2);
          ctx.stroke();
        });
      }

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#re-noise-val', `${this.noisePx.toFixed(1)}px`);
      setText('#re-error', `e_reproj = ${avgError.toFixed(2)}px`);
      const errorEl = this.shadowRoot?.querySelector('#re-error') as HTMLElement;
      if (errorEl) errorEl.style.color = avgError < 1 ? '#16a34a' : avgError < 5 ? '#f59e0b' : '#ef4444';
      const verdictEl = this.shadowRoot?.querySelector('#re-verdict') as HTMLElement;
      if (verdictEl) {
        verdictEl.textContent =
          avgError < 1 ? '✅ 1px 미만 — 대응·포즈·K가 일관됨' :
          avgError < 5 ? '⚠ 수 px — 노이즈가 좀 있지만 대체로 신뢰 가능' :
          '❌ 수십 px — 대응 매칭이나 치수 입력이 틀렸을 가능성';
      }
    }

    @addEventListener('#re-noise', 'input')
    onNoise(e: Event) { this.noisePx = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#re-badmatch', 'change')
    onBadMatch(e: Event) { this.badMatch = (e.target as HTMLInputElement).checked; this.refresh(); }

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
          .re-checkbox { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:10px; }
          canvas { display:block; width:${CANVAS_W}px; height:${CANVAS_H}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .re-legend { display:flex; gap:16px; justify-content:center; font-size:11px; color:#64748b; margin-top:4px; }
          .re-error { text-align:center; font-size:18px; font-weight:800; margin-top:10px; font-family:monospace; }
          .re-verdict { text-align:center; font-size:12px; font-weight:700; color:#475569; margin-top:4px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .re-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .re-intro b { color:#0369a1; }
        </style>

        <div class="re-intro">
          <b>투영(projection)</b>이 뭐였죠? — 17강에서 배운 "3D 점을 K로 찍으면 픽셀이 나온다"는 그 계산(\`x=fX/Z\`, \`u=fx·x+cx\`)입니다. 3D 점과 카메라 포즈(R,t)를 알면 그 점이 사진 어디에 찍힐지 100% 계산할 수 있었죠.
          <b>재투영(reprojection)</b>은 그걸 "다시" 하는 겁니다 — PnP로 포즈(R,t)를 구했으면, 그 포즈가 맞는지 확인하려고 원래 썼던 3D 점들을 가지고 투영을 **한 번 더** 돌려봅니다. 그렇게 나온 픽셀(재투영 코너)이 실제로 카메라가 찍어서 검출했던 픽셀(관측 코너)과 거의 겹치면 "이 포즈, 맞다"는 뜻이고, 많이 어긋나면 "어딘가 틀렸다"는 신호입니다.
        </div>

        <div class="math-desc">초록 +는 관측된 코너, 빨간 ○는 (참) 포즈로 다시 투영한 코너입니다. 둘이 겹칠수록 좋은 포즈입니다.</div>

        <div class="ctl"><label>검출 노이즈 <input id="re-noise" type="range" min="0" max="2" step="0.1" value="${this.noisePx}"><b id="re-noise-val">${this.noisePx.toFixed(1)}px</b></label></div>
        <label class="re-checkbox"><input id="re-badmatch" type="checkbox" ${this.badMatch ? 'checked' : ''}> 대응점 하나를 일부러 잘못 매칭(대각선 코너와 뒤바꿈)</label>

        <canvas id="re-canvas" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
        <div class="re-legend"><span>✛ 초록 = 관측 코너</span><span>○ 빨강 = 재투영 코너</span></div>

        <div class="re-error" id="re-error"></div>
        <div class="re-verdict" id="re-verdict"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
