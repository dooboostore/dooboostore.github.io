import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-least-squares';

const POINTS = [
  { x: 0, y: 1.2 }, { x: 1, y: 2.3 }, { x: 2, y: 2.8 }, { x: 3, y: 4.6 },
  { x: 4, y: 5.1 }, { x: 5, y: 6.8 }, { x: 6, y: 6.5 }, { x: 7, y: 8.4 },
];

const MD = `
## 최소제곱법(Least Squares)이란?
- 점들이 정확히 한 직선 위에 있지 않을 때(현실의 측정 데이터는 항상 그렇습니다), "가장 잘 맞는" 직선 \`y=mx+k\`를 찾는 방법입니다.
- **잔차(residual)** = 각 점에서 그 직선까지의 **수직(y방향) 거리**입니다. 이 잔차들을 그냥 더하면 양수·음수가 서로 상쇄돼버리니, **제곱해서 더한 값(SSE, 오차 제곱합)**을 최소화합니다.
- **정규방정식(normal equations)**: SSE를 m·k로 각각 미분해서 0으로 놓고 풀면 아래처럼 공식이 바로 나옵니다(미지수 2개짜리 연립방정식 — "역행렬" 페이지에서 본 Ax=b와 똑같은 구조입니다):

  \`m* = (nΣxy - ΣxΣy) / (nΣx² - (Σx)²)\`, \`k* = (Σy - m*Σx) / n\`

- 아래에서 m·k를 손으로 이리저리 맞춰봐도, 정규방정식이 계산한 값(점선)의 SSE보다 낮게는 절대 못 만듭니다 — 그게 "최소"제곱법이라는 이름의 의미입니다.
- **"Kabsch(점군 정렬)"** 페이지도 사실 이것과 똑같은 문제입니다 — 다만 직선 하나(m,k) 대신 회전+이동(R,t)을 구하고, 잔차도 2D/3D 거리라는 점만 다릅니다. **"PCA"** 페이지의 주성분도 "점들까지의 제곱거리 합을 최소화하는 방향"이라는 점에서 뿌리가 같습니다.
- **어디에 쓰이나요?** — 센서 캘리브레이션(눈금 맞추기), 데이터 트렌드 추정, 칼만 필터의 관측 업데이트, 딥러닝의 MSE 손실함수.
`;

interface Line { m: number; k: number }

function sse(line: Line): number {
  return POINTS.reduce((s, p) => s + (p.y - (line.m * p.x + line.k)) ** 2, 0);
}

function optimalFit(): Line {
  const n = POINTS.length;
  const sx = POINTS.reduce((s, p) => s + p.x, 0);
  const sy = POINTS.reduce((s, p) => s + p.y, 0);
  const sxx = POINTS.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = POINTS.reduce((s, p) => s + p.x * p.y, 0);
  const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const k = (sy - m * sx) / n;
  return { m, k };
}

const OPT = optimalFit();
const X_MIN = -0.5, X_MAX = 7.5;

function lineSeg(line: Line): string {
  return `${X_MIN},${(line.m * X_MIN + line.k).toFixed(3)} ${X_MAX},${(line.m * X_MAX + line.k).toFixed(3)}`;
}

function notesHtml(line: Line): string {
  const cur = sse(line);
  const opt = sse(OPT);
  const gap = cur - opt;
  return `<div>내 직선: y = ${line.m.toFixed(2)}x + ${line.k.toFixed(2)} → SSE = ${cur.toFixed(2)}</div>` +
    `<div>정규방정식 최적해: y = ${OPT.m.toFixed(2)}x + ${OPT.k.toFixed(2)} → SSE = ${opt.toFixed(2)} (항상 이보다 작을 수 없음)</div>` +
    (gap < 0.01
      ? `<div style="margin-top:4px;color:#10b981;font-weight:900">✓ 최적해에 도달했습니다!</div>`
      : `<div style="margin-top:4px;color:#f59e0b">지금보다 SSE를 ${gap.toFixed(2)}만큼 더 줄일 수 있습니다 — "최적값으로 맞추기"를 눌러보세요.</div>`);
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathLeastSquares extends w.HTMLElement {
    private m = 0.4;
    private k = 0.5;

    private refresh() {
      const line: Line = { m: this.m, k: this.k };
      const cur = sse(line);
      const opt = sse(OPT);
      const good = cur - opt < 0.05;
      const color = good ? '#10b981' : cur - opt < 3 ? '#f59e0b' : '#ef4444';

      const applied = this.shadowRoot?.querySelector('#ls-applied') as HTMLElement;
      if (applied) { applied.style.color = color; applied.textContent = `적용: y=${this.m.toFixed(2)}x+${this.k.toFixed(2)} → SSE=${cur.toFixed(2)} (최적 SSE=${opt.toFixed(2)})`; }

      const notes = this.shadowRoot?.querySelector('#ls-notes') as HTMLElement;
      if (notes) notes.innerHTML = notesHtml(line);

      (['m', 'k'] as const).forEach(key => {
        const el = this.shadowRoot?.querySelector(`#ls-${key}-val`) as HTMLElement;
        if (el) el.textContent = this[key].toFixed(2);
      });

      const fitLine = this.shadowRoot?.querySelector('#ls-fit') as HTMLElement;
      if (fitLine) { fitLine.setAttribute('points', lineSeg(line)); fitLine.setAttribute('color', color); }

      POINTS.forEach((p, i) => {
        const resid = this.shadowRoot?.querySelector(`#ls-resid-${i}`) as HTMLElement;
        if (resid) { resid.setAttribute('y2', (line.m * p.x + line.k).toFixed(3)); resid.setAttribute('color', color); }
      });
    }

    @addEventListener('#ls-m', 'input')
    onM(e: Event) { this.m = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#ls-k', 'input')
    onK(e: Event) { this.k = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @addEventListener('#ls-optimal', 'click')
    onOptimal() {
      this.m = OPT.m; this.k = OPT.k;
      const mInput = this.shadowRoot?.querySelector('#ls-m') as HTMLInputElement;
      if (mInput) mInput.value = String(this.m);
      const kInput = this.shadowRoot?.querySelector('#ls-k') as HTMLInputElement;
      if (kInput) kInput.value = String(this.k);
      this.refresh();
    }

    @onConnectedBodyShadow
    render() {
      const line: Line = { m: this.m, k: this.k };
      const cur = sse(line);
      const opt = sse(OPT);
      const good = cur - opt < 0.05;
      const color = good ? '#10b981' : cur - opt < 3 ? '#f59e0b' : '#ef4444';
      const pointTags = POINTS.map((p) => `<circle x="${p.x}" y="${p.y}" r="0.12" color="#3e63dd" fill="#3e63dd"></circle>`).join('\n          ');
      const residTags = POINTS.map((p, i) =>
        `<vector id="ls-resid-${i}" x1="${p.x}" y1="${p.y}" x2="${p.x}" y2="${(line.m * p.x + line.k).toFixed(3)}" color="${color}" width="1"></vector>`
      ).join('\n          ');
      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .math-legend { display:flex; gap:12px; font-size:11px; color:#64748b; margin-top:8px; flex-wrap:wrap; }
          .math-legend b { font-weight:800; }
          .math-notes { font-size:12px; font-weight:700; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin-top:8px; line-height:1.7; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:44px; text-align:right; color:#1e293b; }
          .ls-btn { padding:7px 16px; border-radius:10px; border:1.5px solid #0f766e; background:#fff; color:#0f766e; font-size:12px; font-weight:800; cursor:pointer; margin-top:8px; }
          .ls-btn:hover { background:#f0fdfa; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">y = mx + k, SSE = Σ(y_i - (mx_i+k))² → 최소화</div>
        <div class="math-applied" id="ls-applied" style="color:${color}">적용: y=${this.m.toFixed(2)}x+${this.k.toFixed(2)} → SSE=${cur.toFixed(2)} (최적 SSE=${opt.toFixed(2)})</div>
        <div class="math-desc">m·k를 움직여 직선을 맞춰보세요. 빨간 선(잔차)들의 제곱합이 SSE입니다 — 이 합을 최소로 만드는 게 목표입니다.</div>
        <cartesian-chart x-min="${X_MIN}" x-max="${X_MAX}" y-min="-1" y-max="10" x-label="x" y-label="y" disabled-aspect>
          <series id="ls-fit" points="${lineSeg(line)}" color="${color}" width="2.2" label="내 직선"></series>
          <series points="${lineSeg(OPT)}" color="#94a3b8" dash="4,4" width="1.6" label="최적해(정규방정식)"></series>
          ${residTags}
          ${pointTags}
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#3e63dd">● 데이터 점</b></span><span><b style="color:${color}">— 내 직선 / 잔차</b></span><span><b style="color:#94a3b8">- - 최적해</b></span></div>
        <div class="math-notes" id="ls-notes">${notesHtml(line)}</div>
        <div class="ctl"><label>m (기울기) <input id="ls-m" type="range" min="-2" max="3" step="0.02" value="${this.m}"><b id="ls-m-val">${this.m.toFixed(2)}</b></label></div>
        <div class="ctl"><label>k (절편) <input id="ls-k" type="range" min="-3" max="5" step="0.02" value="${this.k}"><b id="ls-k-val">${this.k.toFixed(2)}</b></label></div>
        <button id="ls-optimal" class="ls-btn" type="button">🎯 최적값으로 맞추기(정규방정식)</button>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
