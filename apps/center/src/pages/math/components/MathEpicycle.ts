import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow, onDisconnected } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-epicycle';

const MAX_N = 15;
const BASE_X = -3.2;

const MD = `
## 푸리에 급수와 원(에피사이클)으로 파형 그리기
- **사각파(구형파)**는 아주 많은 사인파의 합으로 정확히 만들 수 있습니다: \`f(t) = (4/π)·Σ sin(n·t)/n\` (n = 1, 3, 5, 7, ... 홀수만)
- 이 합을 **회전하는 원들의 사슬(에피사이클, epicycle)**로 나타낼 수 있습니다 — n번째 원은 반지름 \`4/(π·n)\`, 회전속도는 n배이며, 이전 원의 끝에 매달려서 함께 돕니다.
- **맨 마지막 원 끝의 높이(y)가 바로 그 순간의 파형 값**입니다. 시간이 지나며 그 높이를 오른쪽으로 이어 그리면(점선 안내선을 따라) 사각파 모양이 그대로 그려집니다.
- 원(고조파) 개수를 늘릴수록 사각파에 더 가까워지지만, **모서리 근처에서는 아무리 늘려도 살짝 넘치는 현상**이 남습니다 — **깁스 현상(Gibbs phenomenon)**이라 합니다.
- 이건 앞서 만든 **"푸리에 변환"** 페이지의 반대 방향입니다 — 거기서는 파형→주파수 성분을 구했다면, 여기서는 주파수 성분(원들)을 직접 조립해서 파형을 만듭니다.
- **어디에 쓰이나요?** — 오디오 신시사이저의 가산 합성(additive synthesis), 적은 개수의 주파수 성분으로 신호를 압축·근사, 진동 모드 합성.
`;

function harmonic(k: number, n: number) {
  const freq = 2 * k + 1;
  const r = k < n ? 4 / (Math.PI * freq) : 0;
  return { freq, r };
}

function computeChain(t: number, n: number) {
  let cx = BASE_X, cy = 0;
  const centers: [number, number][] = [];
  const tips: [number, number][] = [];
  for (let k = 0; k < MAX_N; k++) {
    const { freq, r } = harmonic(k, n);
    centers.push([cx, cy]);
    const tx = cx + r * Math.cos(freq * t);
    const ty = cy + r * Math.sin(freq * t);
    tips.push([tx, ty]);
    cx = tx; cy = ty;
  }
  return { centers, tips, endX: cx, endY: cy };
}

function ptsStr(list: [number, number][]) { return list.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' '); }

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathEpicycle extends w.HTMLElement {
    private n = 6;
    private speed = 0.02;
    private playing = true;
    private t = 0;
    private rafId = 0;
    private trace: [number, number][] = [];

    private tick = () => {
      if (this.playing && this.isConnected) {
        this.t += this.speed;
        const phase = this.t % (2 * Math.PI);
        const { centers, tips, endX, endY } = computeChain(this.t, this.n);

        for (let k = 0; k < MAX_N; k++) {
          const { r } = harmonic(k, this.n);
          const c = this.shadowRoot?.querySelector(`#ep-circle-${k}`) as HTMLElement;
          if (c) { c.setAttribute('x', centers[k][0].toFixed(3)); c.setAttribute('y', centers[k][1].toFixed(3)); c.setAttribute('r', Math.max(r, 0.0001).toFixed(4)); }
          const v = this.shadowRoot?.querySelector(`#ep-vec-${k}`) as HTMLElement;
          if (v) { v.setAttribute('x1', centers[k][0].toFixed(3)); v.setAttribute('y1', centers[k][1].toFixed(3)); v.setAttribute('x2', tips[k][0].toFixed(3)); v.setAttribute('y2', tips[k][1].toFixed(3)); }
        }

        if (this.trace.length && phase < this.trace[this.trace.length - 1][0]) this.trace = [];
        this.trace.push([phase, endY]);
        if (this.trace.length > 3000) this.trace.shift();

        const tip = this.shadowRoot?.querySelector('#ep-tip') as HTMLElement;
        if (tip) { tip.setAttribute('x', endX.toFixed(3)); tip.setAttribute('y', endY.toFixed(3)); }
        const guide = this.shadowRoot?.querySelector('#ep-guide') as HTMLElement;
        if (guide) guide.setAttribute('points', `${endX.toFixed(3)},${endY.toFixed(3)} ${phase.toFixed(3)},${endY.toFixed(3)}`);
        const trace = this.shadowRoot?.querySelector('#ep-trace') as HTMLElement;
        if (trace) trace.setAttribute('points', ptsStr(this.trace));
        const marker = this.shadowRoot?.querySelector('#ep-tracept') as HTMLElement;
        if (marker) { marker.setAttribute('x', phase.toFixed(3)); marker.setAttribute('y', endY.toFixed(3)); }
      }
      this.rafId = w.requestAnimationFrame(this.tick);
    };

    @onConnectedAfter
    startLoop() { this.rafId = w.requestAnimationFrame(this.tick); }

    @onDisconnected
    stopLoop() { w.cancelAnimationFrame(this.rafId); }

    @addEventListener('#ep-n', 'input')
    onN(e: Event) {
      this.n = Number((e.target as HTMLInputElement).value) || 1;
      const val = this.shadowRoot?.querySelector('#ep-n-val') as HTMLElement;
      if (val) val.textContent = String(this.n);
    }

    @addEventListener('#ep-speed', 'input')
    onSpeed(e: Event) {
      this.speed = Number((e.target as HTMLInputElement).value) || 0.01;
      const val = this.shadowRoot?.querySelector('#ep-speed-val') as HTMLElement;
      if (val) val.textContent = this.speed.toFixed(3);
    }

    @addEventListener('#ep-toggle', 'click')
    onToggle() {
      this.playing = !this.playing;
      const btn = this.shadowRoot?.querySelector('#ep-toggle') as HTMLElement;
      if (btn) btn.textContent = this.playing ? '⏸ 일시정지' : '▶ 재생';
    }

    @onConnectedBodyShadow
    render() {
      const { n, speed } = this;
      const { centers, tips } = computeChain(0, n);
      const circleTags = Array.from({ length: MAX_N }, (_, k) => {
        const { r } = harmonic(k, n);
        return `<circle id="ep-circle-${k}" x="${centers[k][0].toFixed(3)}" y="${centers[k][1].toFixed(3)}" r="${Math.max(r, 0.0001).toFixed(4)}" color="#a5b4fc"></circle>`;
      }).join('\n          ');
      const vecTags = Array.from({ length: MAX_N }, (_, k) =>
        `<vector id="ep-vec-${k}" x1="${centers[k][0].toFixed(3)}" y1="${centers[k][1].toFixed(3)}" x2="${tips[k][0].toFixed(3)}" y2="${tips[k][1].toFixed(3)}" color="#6366f1" width="1.3"></vector>`
      ).join('\n          ');
      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:44px; text-align:right; color:#1e293b; }
          .ep-toggle { border:1px solid #e2e8f0; background:#f8fafc; border-radius:8px; padding:6px 14px; font-size:12px; font-weight:700; color:#475569; cursor:pointer; margin-top:8px; }
          .ep-toggle:hover { background:#eef2ff; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">회전하는 원(고조파) N개 → 사각파(square wave)를 그린다</div>
        <div class="math-desc">왼쪽 원들이 돌면서 만든 마지막 지점의 높이를, 오른쪽으로 시간에 따라 이어 그리면 사각파가 나옵니다. 원 개수(N)를 늘려보세요.</div>
        <cartesian-chart x-min="-6.2" x-max="7" y-min="-2" y-max="2" hide-grid>
          ${circleTags}
          ${vecTags}
          <marker id="ep-tip" x="${tips[MAX_N - 1][0].toFixed(3)}" y="${tips[MAX_N - 1][1].toFixed(3)}" color="#ec4899" size="4"></marker>
          <series id="ep-guide" points="${tips[MAX_N - 1][0].toFixed(3)},${tips[MAX_N - 1][1].toFixed(3)} 0,${tips[MAX_N - 1][1].toFixed(3)}" color="#94a3b8" dash="3,3"></series>
          <series points="0,1 6.28,1" color="#e2e8f0" dash="4,4"></series>
          <series points="0,-1 6.28,-1" color="#e2e8f0" dash="4,4"></series>
          <series id="ep-trace" points="" color="#10b981" width="2.5"></series>
          <marker id="ep-tracept" x="0" y="0" color="#ec4899" size="4"></marker>
        </cartesian-chart>
        <button id="ep-toggle" class="ep-toggle">⏸ 일시정지</button>
        <div class="ctl"><label>원(고조파) 개수 N <input id="ep-n" type="range" min="1" max="${MAX_N}" step="1" value="${n}"><b id="ep-n-val">${n}</b></label></div>
        <div class="ctl"><label>속도 <input id="ep-speed" type="range" min="0.005" max="0.06" step="0.005" value="${speed}"><b id="ep-speed-val">${speed.toFixed(3)}</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
