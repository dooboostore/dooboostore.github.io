import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-graph';

const W = 10, H = 10;
const START = { x: 0, y: 0 };
const GOAL = { x: W - 1, y: H - 1 };

const MD = `
## 그래프와 최단경로(다익스트라)란?
- 격자의 각 칸을 **노드**, 상하좌우로 이웃한 칸 사이를 **간선(비용 1)**으로 보면, 이 지도 전체가 하나의 **그래프**입니다.
- **다익스트라(Dijkstra) 알고리즘**: 출발점에서 아직 확정 안 된 칸 중 가장 가까운 칸을 매번 골라 확정하고, 그 이웃까지의 거리를 갱신하는 걸 반복합니다. 결과로 **모든 칸까지의 최단거리**(파란 그라데이션)와 **목표까지의 경로**(주황)가 한 번에 나옵니다.
- 장애물(검은 칸)은 그래프에서 그 노드로 가는 간선이 아예 없는 것과 같습니다 — 통과 불가능.
- seed나 밀도를 바꾸면 미로가 다시 생성됩니다. 장애물이 너무 많으면 경로가 아예 없을 수도 있습니다("경로 없음") — 그래프가 두 조각으로 끊어졌다는 뜻입니다.
- **어디에 쓰이나요?** — 로봇·자율주행의 점유격자지도(occupancy grid) 위 경로계획, 창고 로봇 동선, 게임 캐릭터 길찾기(A*는 다익스트라에 "목표 쪽" 힌트를 더한 개선판입니다).
`;

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function idx(x: number, y: number) { return y * W + x; }

function buildGrid(seed: number, density: number) {
  const rng = mulberry32(Math.round(seed));
  const blocked = new Array(W * H).fill(false);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if ((x === START.x && y === START.y) || (x === GOAL.x && y === GOAL.y)) continue;
      if (rng() < density) blocked[idx(x, y)] = true;
    }
  }
  return blocked;
}

/** 다익스트라 손풀이: 확정 안 된 칸 중 가장 가까운 칸을 매번 골라 이웃 거리를 갱신한다. */
function dijkstra(blocked: boolean[]) {
  const dist = new Array(W * H).fill(Infinity);
  const prev = new Array(W * H).fill(-1);
  const visited = new Array(W * H).fill(false);
  dist[idx(START.x, START.y)] = 0;
  for (let iter = 0; iter < W * H; iter++) {
    let u = -1, best = Infinity;
    for (let i = 0; i < W * H; i++) if (!visited[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u === -1) break;
    visited[u] = true;
    const ux = u % W, uy = Math.floor(u / W);
    const neighbors = [[ux + 1, uy], [ux - 1, uy], [ux, uy + 1], [ux, uy - 1]]
      .filter(([nx, ny]) => nx >= 0 && nx < W && ny >= 0 && ny < H && !blocked[idx(nx, ny)]);
    for (const [nx, ny] of neighbors) {
      const v = idx(nx, ny);
      if (dist[u] + 1 < dist[v]) { dist[v] = dist[u] + 1; prev[v] = u; }
    }
  }
  const gi = idx(GOAL.x, GOAL.y);
  const path: number[] = [];
  if (Number.isFinite(dist[gi])) {
    let cur = gi;
    while (cur !== -1) { path.push(cur); cur = prev[cur]; }
    path.reverse();
  }
  const visitedCount = visited.filter(Boolean).length;
  return { dist, path, pathLen: dist[gi], visitedCount };
}

function distColor(d: number, maxD: number): string {
  if (!Number.isFinite(d)) return '#f8fafc';
  const t = maxD > 0 ? Math.min(1, d / maxD) : 0;
  const r = Math.round(219 - t * 170);
  const g = Math.round(234 - t * 120);
  return `rgb(${r},${g},254)`;
}

function cellPoints(x: number, y: number, pad = 0.06) {
  return `${x + pad},${y + pad} ${x + 1 - pad},${y + pad} ${x + 1 - pad},${y + 1 - pad} ${x + pad},${y + 1 - pad}`;
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathGraph extends w.HTMLElement {
    private seed = 7;
    private density = 0.22;

    private compute() {
      const blocked = buildGrid(this.seed, this.density);
      const { dist, path, pathLen, visitedCount } = dijkstra(blocked);
      const maxD = dist.filter(Number.isFinite).reduce((m, v) => Math.max(m, v), 0);
      return { blocked, dist, path, pathLen, visitedCount, maxD };
    }

    private cellFill(i: number, blocked: boolean[], dist: number[], path: number[], maxD: number): string {
      if (blocked[i]) return '#1e293b';
      if (path.includes(i)) return '#f59e0b';
      return distColor(dist[i], maxD);
    }

    private refresh() {
      const { blocked, dist, path, pathLen, visitedCount, maxD } = this.compute();
      const found = Number.isFinite(pathLen);

      const applied = this.shadowRoot?.querySelector('#graph-applied') as HTMLElement;
      if (applied) {
        applied.style.color = found ? '#10b981' : '#ef4444';
        applied.textContent = found
          ? `적용: seed=${this.seed}, 밀도=${this.density.toFixed(2)} → 최단거리 ${pathLen}칸, 확인한 칸 ${visitedCount}개`
          : `적용: seed=${this.seed}, 밀도=${this.density.toFixed(2)} → 경로 없음 (장애물에 막힘)`;
      }
      (['seed', 'density'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#graph-${k}-val`) as HTMLElement;
        if (el) el.textContent = k === 'density' ? this.density.toFixed(2) : String(this.seed);
      });

      for (let i = 0; i < W * H; i++) {
        const el = this.shadowRoot?.querySelector(`#graph-c-${i}`) as HTMLElement;
        if (el) el.setAttribute('fill', this.cellFill(i, blocked, dist, path, maxD));
      }
    }

    @addEventListener('#graph-seed', 'input')
    onSeed(e: Event) { this.seed = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#graph-density', 'input')
    onDensity(e: Event) { this.density = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { blocked, dist, path, pathLen, visitedCount, maxD } = this.compute();
      const found = Number.isFinite(pathLen);
      const cells: string[] = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = idx(x, y);
          cells.push(`<polygon id="graph-c-${i}" points="${cellPoints(x, y)}" color="#cbd5e1" width="1" fill="${this.cellFill(i, blocked, dist, path, maxD)}"></polygon>`);
        }
      }
      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .math-legend { display:flex; gap:12px; font-size:11px; color:#64748b; margin-top:8px; flex-wrap:wrap; }
          .math-legend b { font-weight:800; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:44px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">그리드 = 그래프, 다익스트라로 출발점→모든 칸 최단거리 계산</div>
        <div class="math-applied" id="graph-applied" style="color:${found ? '#10b981' : '#ef4444'}">${found
          ? `적용: seed=${this.seed}, 밀도=${this.density.toFixed(2)} → 최단거리 ${pathLen}칸, 확인한 칸 ${visitedCount}개`
          : `적용: seed=${this.seed}, 밀도=${this.density.toFixed(2)} → 경로 없음 (장애물에 막힘)`}</div>
        <div class="math-desc">seed·밀도를 바꾸면 미로가 다시 생기고 경로가 다시 계산됩니다. 파란 그라데이션 = 출발점에서 그 칸까지의 최단거리, 주황 = 실제 최단경로.</div>
        <cartesian-chart x-min="-0.5" x-max="${W - 0.5}" y-min="-0.5" y-max="${H - 0.5}" center-x="${(W - 1) / 2}" center-y="${(H - 1) / 2}" hide-grid disabled-zoom>
          ${cells.join('\n          ')}
          <marker x="${START.x + 0.5}" y="${START.y + 0.5}" color="#10b981" size="6" label="출발"></marker>
          <marker x="${GOAL.x + 0.5}" y="${GOAL.y + 0.5}" color="#e5484d" size="6" label="목표"></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#1e293b">■ 장애물</b></span><span><b style="color:#f59e0b">■ 최단경로</b></span><span><b style="color:#93c5fd">■ 방문한 칸(거리)</b></span><span><b style="color:#10b981">● 출발</b></span><span><b style="color:#e5484d">● 목표</b></span></div>
        <div class="ctl"><label>seed <input id="graph-seed" type="range" min="1" max="50" step="1" value="${this.seed}"><b id="graph-seed-val">${this.seed}</b></label></div>
        <div class="ctl"><label>장애물 밀도 <input id="graph-density" type="range" min="0" max="0.4" step="0.02" value="${this.density}"><b id="graph-density-val">${this.density.toFixed(2)}</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
