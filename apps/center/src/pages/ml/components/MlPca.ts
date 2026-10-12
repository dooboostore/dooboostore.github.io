import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-pca';

const W = 340, H = 260;

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = { x: number; y: number };
function genData(): Pt[] {
  const r = mulberry(70);
  const pts: Pt[] = [];
  for (let i = 0; i < 60; i++) {
    const t = 7 * r();
    pts.push({ x: t + (r() - 0.5) * 1.2, y: 6 - 0.7 * t + (r() - 0.5) * 1.2 });
  }
  return pts;
}
const DATA = genData();

function pca() {
  const n = DATA.length;
  const mx = DATA.reduce((s, p) => s + p.x, 0) / n;
  const my = DATA.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  DATA.forEach(p => {
    sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; sxy += (p.x - mx) * (p.y - my);
  });
  sxx /= n; syy /= n; sxy /= n;
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, tr * tr - 4 * det));
  const l1 = (tr + disc) / 2, l2 = (tr - disc) / 2;
  const v1 = { x: sxy, y: l1 - sxx };
  const n1 = Math.hypot(v1.x, v1.y) || 1;
  const v2 = { x: sxy, y: l2 - sxx };
  const n2 = Math.hypot(v2.x, v2.y) || 1;
  return { mx, my, l1, l2, v1: { x: v1.x / n1, y: v1.y / n1 }, v2: { x: v2.x / n2, y: v2.y / n2 } };
}
const PC = pca();

const MD = `
## 주성분 분석 — 그림자 방향 찾기
- 분산이 가장 큰 방향(주성분)을 새 축으로 삼고, 그 위에 점을 떨어뜨리면(**투영**) 차원이 줄어듭니다. 2D → 1D로 nerd-down되는 걸 위에서 보세요.
- **설명된 분산**이 얼마나 정보를 살렸는지 알려줍니다. 첫 주성분이 90%를 설명하면 1개로도 충분합니다.
- 차원을 줄이면 노이즈가 걷히고 다음 알고리즘(k-NN·로지스틱)이 빨라지고 잘 맞습니다. 책의 코드: \`PCA(n_components=1)\` → \`fit_transform()\`, \`explained_variance_ratio_\`
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlPca extends w.HTMLElement {
    private ncomp: 1 | 2 = 1;

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#mp-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      const XMIN = -1, XMAX = 8, YMIN = -1, YMAX = 8;
      const px = (x: number) => ((x - XMIN) / (XMAX - XMIN)) * W;
      const py = (y: number) => H - ((y - YMIN) / (YMAX - YMIN)) * H;
      const L = 3.2;
      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);
        const ax = (v: { x: number; y: number }, color: string) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px(PC.mx - v.x * L), py(PC.my - v.y * L));
          ctx.lineTo(px(PC.mx + v.x * L), py(PC.my + v.y * L));
          ctx.stroke();
          ctx.lineWidth = 1;
        };
        ax(PC.v1, '#16a34a');
        if (this.ncomp === 2) ax(PC.v2, '#94a3b8');
        DATA.forEach(p => {
          const dx = p.x - PC.mx, dy = p.y - PC.my;
          const t = dx * PC.v1.x + dy * PC.v1.y;
          const qx = PC.mx + t * PC.v1.x, qy = PC.my + t * PC.v1.y;
          if (this.ncomp === 1) {
            ctx.strokeStyle = '#cbd5e1';
            ctx.beginPath();
            ctx.moveTo(px(p.x), py(p.y));
            ctx.lineTo(px(qx), py(qy));
            ctx.stroke();
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(px(qx), py(qy), 3.5, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = '#3b82c4';
            ctx.beginPath();
            ctx.arc(px(p.x), py(p.y), 4, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        ctx.fillStyle = '#64748b';
        ctx.font = '10px sans-serif';
        ctx.fillText('주성분 1 (초록)', 8, 14);
        if (this.ncomp === 2) ctx.fillText('주성분 2 (회색)', 8, 28);
      }
      const ratio = PC.l1 / (PC.l1 + PC.l2);
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      const t = this.shadowRoot?.querySelector('#mp-toggle') as HTMLButtonElement;
      if (t) t.textContent = this.ncomp === 1 ? '2개 성분으로 보기' : '1개 성분으로 줄이기';
      setText('#mp-var', this.ncomp === 1
        ? `설명된 분산: ${(ratio * 100).toFixed(1)}% — 2D 정보의 대부분을 1개 숫자로 살림`
        : '성분 2개 = 원본 그대로 (100%)');
      const bar = this.shadowRoot?.querySelector('#mp-bar') as HTMLElement;
      if (bar) bar.style.width = `${Math.round((this.ncomp === 1 ? ratio : 1) * 100)}%`;
    }

    @addEventListener('#mp-toggle', 'click')
    onToggle() { this.ncomp = this.ncomp === 1 ? 2 : 1; this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .mp-btn { display:block; margin:8px auto; padding:7px 18px; border-radius:16px; border:1.5px solid #14532d; background:#f0fdf4; color:#14532d; font-size:12px; font-weight:800; cursor:pointer; }
          .mp-track { background:#f1f5f9; border-radius:4px; height:14px; margin-top:8px; }
          .mp-fill { display:block; height:100%; background:linear-gradient(90deg,#14532d,#4ade80); border-radius:4px; transition:width .2s; }
          .mp-var { text-align:center; font-size:12px; font-weight:700; color:#1e293b; margin-top:6px; }
          .mm-legend { display:flex; gap:12px; justify-content:center; font-size:11px; color:#64748b; margin-top:6px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
        </style>

        <div class="mm-def">
  <div><b>정의</b> 분산이 가장 큰 방향을 새 축으로 삼아 점을 투영해 차원을 줄이는 방법으로, 설명된 분산이 살린 정보량을 알려줍니다.</div>
  <div><b>언제</b> 차원 축소·시각화·노이즈 제거가 필요할 때 씁니다.</div>
  <div><b>예시</b> 얼굴 특징 압축, 분류 전처리, 2D→1D 투영 시각화</div>
</div>
        <div class="mm-intro">
          파란 점 60개가 비스듬히 누워 있습니다. 버튼을 누르면 <b>주성분 1개</b>로 눌러 담습니다 — 주황 점이 2D→1D로 줄어든 모습입니다.
        </div>

        <button class="mp-btn" id="mp-toggle"></button>
        <canvas id="mp-canvas" width="${W}" height="${H}"></canvas>
        <div class="mm-legend"><span><span style="color:#16a34a">━</span> 주성분 방향</span><span><span style="color:#f59e0b">●</span> 1D로 투영된 점</span></div>
        <div class="mp-track"><span class="mp-fill" id="mp-bar"></span></div>
        <div class="mp-var" id="mp-var"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
