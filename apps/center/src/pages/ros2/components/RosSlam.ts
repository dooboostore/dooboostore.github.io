import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow, onDisconnected } from '@dooboostore/simple-web-component';
import { markdownParse } from '@center-src/utils/markdown';

const tagName = 'center-ros2-slam';

type Pose = { x: number; y: number; t: number };
const zero = (): Pose => ({ x: 0, y: 0, t: 0 });
const compose = (a: Pose, b: Pose): Pose => ({
  x: a.x + Math.cos(a.t) * b.x - Math.sin(a.t) * b.y,
  y: a.y + Math.sin(a.t) * b.x + Math.cos(a.t) * b.y,
  t: a.t + b.t,
});
const inv = (p: Pose): Pose => ({
  x: -Math.cos(p.t) * p.x - Math.sin(p.t) * p.y,
  y: Math.sin(p.t) * p.x - Math.cos(p.t) * p.y,
  t: -p.t,
});
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (a: Pose, b: Pose) => Math.hypot(a.x - b.x, a.y - b.y);
const fmt = (p: Pose) => `x ${p.x.toFixed(2)} y ${p.y.toFixed(2)} θ ${((wrap(p.t) * 180) / Math.PI).toFixed(1)}°`;
const xy = (p: Pose) => `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`;

/* ---------- 가짜 세계: 벽 + 라이다 레이캐스팅 ---------- */
const CANVAS_W = 400, CANVAS_H = 280, SCALE_PX = 40, ORIGIN_X = 1.1, ORIGIN_Y = 0.8;
const toScreen = (p: Pose): [number, number] => [(p.x + ORIGIN_X) * SCALE_PX, CANVAS_H - (p.y + ORIGIN_Y) * SCALE_PX];

const RECTS: [number, number, number, number][] = [
  [-1.0, -0.7, 8.6, 6.0],
  [1.2, 1.0, 4.5, 2.8],
  [7.3, 4.5, 8.0, 5.2],
];
const WALL_SEGMENTS: [number, number, number, number][] = [];
RECTS.forEach(([a, b, c, d]) => {
  WALL_SEGMENTS.push([a, b, c, b], [c, b, c, d], [c, d, a, d], [a, d, a, b]);
});
WALL_SEGMENTS.push([4.8, 6.0, 4.8, 5.0]);

function castRay(px: number, py: number, dx: number, dy: number, max: number): number | null {
  let best = max;
  for (const [x1, y1, x2, y2] of WALL_SEGMENTS) {
    const ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((x1 - px) * ey - (y1 - py) * ex) / den;
    const u = ((x1 - px) * dy - (y1 - py) * dx) / den;
    if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best < max ? best : null;
}

const SCAN_RAYS = 90, SCAN_MAX = 7;
function scan(pose: Pose): Pose[] {
  const out: Pose[] = [];
  for (let i = 0; i < SCAN_RAYS; i++) {
    const a = (i * 2 * Math.PI) / SCAN_RAYS, worldAngle = pose.t + a;
    const r = castRay(pose.x, pose.y, Math.cos(worldAngle), Math.sin(worldAngle), SCAN_MAX);
    if (r !== null) out.push({ x: r * Math.cos(a) + (Math.random() - 0.5) * 0.02, y: r * Math.sin(a) + (Math.random() - 0.5) * 0.02, t: 0 });
  }
  return out;
}

/* ---------- 로봇은 고정된 사각 루프를 돈다 ---------- */
type TruthState = { pt: Pose; seg: number; prog: number };
const SEGMENTS: { len?: number; turn?: number }[] = [{ len: 6 }, { turn: 1 }, { len: 3.4 }, { turn: 1 }];
function moveTruth(m: TruthState, dt: number): { v: number; w: number } {
  const sg = SEGMENTS[m.seg];
  let v: number, w: number;
  if (sg.len) {
    v = 0.9; w = 0;
    m.prog += v * dt;
    if (m.prog >= sg.len) { m.seg = (m.seg + 1) % 4; m.prog = 0; }
  } else {
    v = 0.35; w = 0.9;
    m.prog += w * dt;
    if (m.prog >= Math.PI / 2) { m.seg = (m.seg + 1) % 4; m.prog = 0; }
  }
  m.pt.x += v * Math.cos(m.pt.t) * dt;
  m.pt.y += v * Math.sin(m.pt.t) * dt;
  m.pt.t += w * dt;
  return { v, w };
}
// 위치추정 패널이 "다른 자리에서 켜기"를 누를 때 쓸, 루프 위 네 지점을 미리 계산해둠
const BOOT_POSES: TruthState[] = (() => {
  const m: TruthState = { pt: zero(), seg: 0, prog: 0 };
  const out: TruthState[] = [{ pt: zero(), seg: 0, prog: 0 }];
  let last = 0;
  for (let i = 0; i < 20000 && out.length < 4; i++) {
    moveTruth(m, 0.002);
    if (m.seg !== last) { last = m.seg; if (SEGMENTS[m.seg].len) out.push({ pt: { ...m.pt }, seg: m.seg, prog: 0 }); }
  }
  return out;
})();

/* ---------- map 프레임 기준 occupancy grid ---------- */
const GRID_RES = 0.08, GRID_ORIGIN = -12, GRID_N = 300;
const cellOf = (x: number, y: number) => {
  const i = Math.floor((x - GRID_ORIGIN) / GRID_RES), j = Math.floor((y - GRID_ORIGIN) / GRID_RES);
  return i < 0 || j < 0 || i >= GRID_N || j >= GRID_N ? -1 : j * GRID_N + i;
};
const cellXY = (k: number) => ({ x: GRID_ORIGIN + ((k % GRID_N) + 0.5) * GRID_RES, y: GRID_ORIGIN + (Math.floor(k / GRID_N) + 0.5) * GRID_RES });

type SavedMap = { origin: Pose; occ: Set<number>; example: boolean };
function buildExampleMap(): SavedMap {
  const counts = new Uint16Array(GRID_N * GRID_N), occ = new Set<number>(), m: TruthState = { pt: zero(), seg: 0, prog: 0 };
  for (let i = 0; i < 1500; i++) {
    moveTruth(m, 0.02);
    if (i % 5 === 0) for (const h of scan(m.pt)) { const q = compose(m.pt, h), k = cellOf(q.x, q.y); if (k >= 0 && ++counts[k] >= 2) occ.add(k); }
  }
  return { origin: zero(), occ, example: true };
}

const COLOR = {
  grid: '#e2e8f0', wall: '#94a3b8', ink: '#1e293b', muted: '#64748b',
  map: '#22314e', odom: '#f59e0b', base: '#3b82c4', bad: '#ef4444', flash: '#16a34a',
};

/* ---------- 6단계 투어: 회전 없이 숫자만 보는 가장 단순한 버전 ---------- */
type XY = { x: number; y: number };
type TourStep = { title: string; map: boolean; C: XY; po: XY; real: XY; hot: 'm' | 'o'; cap: string };
const TOUR_STEPS: TourStep[] = [
  { title: '전원 켬', map: false, C: { x: 4, y: 2 }, po: { x: 0, y: 0 }, real: { x: 4, y: 2 }, hot: 'o',
    cap: '로봇이 서 있는 자리가 odom (0,0)이 됩니다. 아직 안 움직였으니 odom→base_link = (0,0). 지도에서 어디인지는 아직 아무도 모릅니다.' },
  { title: '지도 로드 (AMCL은 아직 모름)', map: true, C: { x: 0, y: 0 }, po: { x: 0, y: 0 }, real: { x: 4, y: 2 }, hot: 'm',
    cap: 'map (0,0)은 지도에 박혀 있는 자리라 안 움직입니다. AMCL은 로봇 위치를 몰라서 initial_pose를 기다립니다. 실제 Nav2 AMCL은 이때 map→odom을 아예 발행하지 않고 "Please set the initial pose..." 경고만 냅니다. 그림에선 (0,0)에 둔 것처럼 그렸고, 실제 로봇(점선)은 (4,2)에 있어요.' },
  { title: 'initial_pose (4,2) 찍기', map: true, C: { x: 4, y: 2 }, po: { x: 0, y: 0 }, real: { x: 4, y: 2 }, hot: 'm',
    cap: 'RViz의 2D Pose Estimate가 /initialpose 토픽으로 "로봇은 지도 (4,2)에 있다"를 보냅니다. AMCL이 받아서 계산: map→odom = initial_pose − odom→base_link = (4,2) − (0,0) = (4,2). 이제 odom 원점이 지도 (4,2)에 놓였어요.' },
  { title: '로봇이 2m 전진', map: true, C: { x: 4, y: 2 }, po: { x: 2, y: 0 }, real: { x: 6, y: 2 }, hot: 'o',
    cap: '바퀴가 재서 odom→base_link = (2,0). map→odom은 그대로 (4,2). 지도 위치 = (4,2) + (2,0) = (6,2).' },
  { title: '바퀴가 미끄러짐', map: true, C: { x: 4, y: 2 }, po: { x: 2.3, y: 0 }, real: { x: 6, y: 2 }, hot: 'o',
    cap: '실제로는 2m 갔는데 바퀴는 2.3m라고 믿습니다. odom→base_link = (2.3,0). 추정은 (6.3,2), 실제는 (6,2). 0.3m 틀렸어요.' },
  { title: 'AMCL 보정', map: true, C: { x: 3.7, y: 2 }, po: { x: 2.3, y: 0 }, real: { x: 6, y: 2 }, hot: 'm',
    cap: 'AMCL이 라이다로 "실제는 (6,2)"라고 알아냅니다. 바퀴 값(2.3,0)은 못 건드리니까 map→odom을 고칩니다: (6,2) − (2.3,0) = (3.7,2). odom 원점이 0.3m 뒤로 밀리고, 결과는 (3.7,2) + (2.3,0) = (6,2). 정답.' },
  { title: '계속 주행 (오차는 odom에 남음)', map: true, C: { x: 3.7, y: 2 }, po: { x: 2.8, y: 0 }, real: { x: 6.5, y: 2 }, hot: 'o',
    cap: '0.5m 더 갔습니다. odom→base_link = (2.8,0). 방금 0.5m 간 건 바퀴가 정확히 압니다. 예전 오차 0.3m는 odom 안에 그대로 남아 있지만, map→odom (3.7,2)이 계속 빼주니까 지도 위치는 (6.5,2)로 맞습니다.' },
];
const TOUR_W = 360, TOUR_H = 220, TOUR_SCALE = 36, TOUR_OX = 0.6, TOUR_OY = 0.6;
const tourP = (p: XY): [number, number] => [(p.x + TOUR_OX) * TOUR_SCALE, TOUR_H - (p.y + TOUR_OY) * TOUR_SCALE];
const tourNum = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const tourPt = (p: XY) => `(${tourNum(p.x)}, ${tourNum(p.y)})`;
function tourAxes(p: XY, col: string, label: string, below: boolean) {
  const [x, y] = tourP(p);
  return `<line x1="${x}" y1="${y}" x2="${x + 26}" y2="${y}" stroke="${col}" stroke-width="3"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y - 26}" stroke="${col}" stroke-width="3" opacity=".55"/><circle cx="${x}" cy="${y}" r="5" fill="${col}"/><text x="${x + 4}" y="${below ? y + 17 : y - 32}" font-size="12" font-weight="700" fill="${col}" font-family="ui-monospace, Menlo, monospace">${label}</text>`;
}
function tourArrow(a: XY, b: XY, col: string, label: string, dy: number) {
  const [x1, y1] = tourP(a), [x2, y2] = tourP(b);
  if (Math.hypot(x2 - x1, y2 - y1) < 6) return '';
  const an = Math.atan2(y2 - y1, x2 - x1);
  return `<line x1="${x1}" y1="${y1}" x2="${x2 - 6 * Math.cos(an)}" y2="${y2 - 6 * Math.sin(an)}" stroke="${col}" stroke-width="2.5" stroke-dasharray="6 4"/><path d="M${x2},${y2} L${x2 - 10 * Math.cos(an - 0.45)},${y2 - 10 * Math.sin(an - 0.45)} L${x2 - 10 * Math.cos(an + 0.45)},${y2 - 10 * Math.sin(an + 0.45)}z" fill="${col}"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + dy}" text-anchor="middle" font-size="11.5" font-weight="600" fill="${col}" stroke="#f8fafc" stroke-width="3" paint-order="stroke" font-family="ui-monospace, Menlo, monospace">${label}</text>`;
}
function tourRobot(p: XY, fill: string, stroke: string, dash: boolean) {
  const [x, y] = tourP(p);
  return `<polygon points="${x + 12},${y} ${x - 9},${y - 8} ${x - 9},${y + 8}" fill="${fill}" stroke="${stroke}" stroke-width="2" ${dash ? 'stroke-dasharray="3 2"' : ''}/>`;
}

/* ---------- A안(odom 직접 수정) vs B안(map→odom만 수정) 1차원 비교 ---------- */
/** 보정이 일어난 그 한 주기에 제어기가 받은 숫자 */
type CmpSnap = { t: number; prevO: number; beforeO: number; afterO: number; beforeC: number; afterC: number; dt: number; vel: number };
type CmpState = { odom: number; C: number; prev: number; vel: number; hist: { t: number; odom: number; map: number; vel: number }[]; spike: number; nextFix: number; snap: CmpSnap | null };
const CMP_V = 0.5, CMP_K = 1.1, CMP_PERIOD = 2, CMP_WIN = 10, CMP_W = 340, CMP_H = 190;
const CMP_KP = 0.8; // 스냅샷 설명용 속도 P제어 이득 (오차 1 m/s → 0.8 m/s² 가속 명령)
const cmpZero = (): CmpState => ({ odom: 0, C: 0, prev: 0, vel: CMP_K * CMP_V, hist: [], spike: 0, nextFix: CMP_PERIOD, snap: null });

function cmpStep(t: number, dt: number, A: CmpState, B: CmpState) {
  const real = CMP_V * t;
  for (const s of [A, B]) { s.prev = s.odom; s.odom += CMP_K * CMP_V * dt; }
  if (t >= A.nextFix) {
    // A: 보정 때마다 바퀴 값 자체를 실제 위치로 덮어씀
    const aBefore = A.odom;
    A.odom = real; A.nextFix += CMP_PERIOD; A.spike = 1.2;
    A.snap = { t, prevO: A.prev, beforeO: aBefore, afterO: A.odom, beforeC: A.C, afterC: A.C, dt, vel: (A.odom - A.prev) / dt };
    // B: 바퀴 값은 그대로, map→odom만 옮김
    const bBeforeC = B.C;
    B.C = real - B.odom; B.nextFix += CMP_PERIOD; B.spike = 1.2;
    B.snap = { t, prevO: B.prev, beforeO: B.odom, afterO: B.odom, beforeC: bBeforeC, afterC: B.C, dt, vel: (B.odom - B.prev) / dt };
  }
  for (const s of [A, B]) {
    s.vel = dt > 0 ? (s.odom - s.prev) / dt : s.vel;
    s.hist.push({ t, odom: s.odom, map: s.C + s.odom, vel: s.vel });
    while (s.hist.length && s.hist[0].t < t - CMP_WIN) s.hist.shift();
    if (s.spike > 0) s.spike -= dt;
  }
}

function cmpSnapHtml(s: CmpSnap | null): string {
  if (!s) return '<div class="snap-empty">첫 보정(2초)을 기다리는 중…</div>';
  const f = (v: number, d = 2) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
  const jumpO = s.afterO - s.beforeO, jumpC = s.afterC - s.beforeC;
  const err = CMP_V - s.vel, acc = CMP_KP * err;
  const big = Math.abs(err) > 1;
  const row = (k: string, v: string, cls = '') => `<div class="snap-row ${cls}"><span>${k}</span><b>${v}</b></div>`;
  return `<div class="snap-title">마지막 보정 순간 (t = ${s.t.toFixed(2)} s, 제어 주기 Δt = ${(s.dt * 1000).toFixed(0)} ms)</div>` +
    row('① odom→base_link', `${s.beforeO.toFixed(3)} → ${s.afterO.toFixed(3)} m ${Math.abs(jumpO) > 1e-6 ? `(${f(jumpO, 3)} m 점프)` : '(그대로)'}`, Math.abs(jumpO) > 1e-6 ? 'bad' : '') +
    row('② map→odom', `${s.beforeC.toFixed(3)} → ${s.afterC.toFixed(3)} m ${Math.abs(jumpC) > 1e-6 ? `(${f(jumpC, 3)} m)` : '(그대로)'}`) +
    row('③ 제어기의 속도 추정', `(odom 지금 − odom 직전) ÷ Δt = (${s.afterO.toFixed(3)} − ${s.prevO.toFixed(3)}) ÷ ${s.dt.toFixed(3)} = ${f(s.vel)} m/s`, big ? 'bad' : '') +
    row('④ 속도 오차', `목표 ${CMP_V.toFixed(2)} − 추정 ${f(s.vel)} = ${f(err)} m/s`, big ? 'bad' : '') +
    row('⑤ 제어기 출력 (P제어, Kp = ' + CMP_KP + ')', `${f(acc)} m/s² ${big ? '→ 모터 한계까지 급가속, 다음 주기엔 급감속' : '→ 거의 0, 평소와 같음'}`, big ? 'bad' : 'ok');
}

function cmpChart(s: CmpState, t: number, velColor: string): string {
  const x0 = Math.max(0, t - CMP_WIN);
  const X = (tt: number) => 8 + ((tt - x0) / CMP_WIN) * (CMP_W - 16);
  const top0 = 44, top1 = 96, vals = s.hist.flatMap(h => [h.odom, h.map]);
  const lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(lo + 1, ...vals) : 1;
  const Yp = (v: number) => top1 - ((v - lo) / (hi - lo)) * (top1 - top0);
  const b0 = 132, b1 = 184, vlo = -3, vhi = 1.5;
  const Yv = (v: number) => b1 - ((Math.max(vlo, Math.min(vhi, v)) - vlo) / (vhi - vlo)) * (b1 - b0);
  const pl = (f: (h: CmpState['hist'][number]) => number, col: string, w: number, dash: boolean) =>
    `<polyline fill="none" stroke="${col}" stroke-width="${w}" ${dash ? 'stroke-dasharray="4 3"' : ''} stroke-linejoin="round" points="${s.hist.map(h => `${X(h.t).toFixed(1)},${f(h).toFixed(1)}`).join(' ')}"/>`;
  const txt = (x: number, y: number, str: string, col: string, anchor?: string) =>
    `<text x="${x}" y="${y}" font-size="10" fill="${col}" text-anchor="${anchor || 'start'}">${str}</text>`;
  let g = `<line x1="8" y1="${Yv(0)}" x2="${CMP_W - 8}" y2="${Yv(0)}" stroke="${COLOR.grid}"/>`;
  g += `<line x1="8" y1="108" x2="${CMP_W - 8}" y2="108" stroke="${COLOR.grid}" stroke-dasharray="2 3"/>`;
  g += pl(h => Yp(h.map), COLOR.base, 1.6, true);
  g += pl(h => Yp(h.odom), COLOR.odom, 2.4, false);
  g += pl(h => Yv(h.vel), velColor, 2.2, false);
  g += txt(10, 16, 'odom→base_link (주황)', COLOR.odom) + txt(10, 30, '지도에서 로봇 (파랑 점선)', COLOR.base);
  g += txt(10, 124, '제어기가 본 속도', COLOR.muted) + txt(CMP_W - 10, Yv(0) - 4, '0 m/s', COLOR.muted, 'end');
  const minV = s.hist.length ? Math.min(...s.hist.map(h => h.vel)) : 0;
  if (minV < vlo) g += txt(CMP_W - 10, 124, `최저 ${minV.toFixed(1)} m/s (그래프 밖)`, COLOR.bad, 'end');
  return g;
}

/** 맵핑(SLAM) 패널 하나, 위치추정(AMCL) 패널 하나 — 같은 엔진을 kind만 다르게 돌린다 */
class SlamSim {
  kind: 'map' | 'loc';
  root: HTMLElement;
  running = true;
  slamOn = true;
  visible = true;
  bootIdx = 1;
  loadedMap?: SavedMap;
  onSaveMap?: (saved: SavedMap) => void;

  m!: TruthState; // 실제(정답) 위치 — 전원 재시작을 흉내내도 계속 이어짐
  po!: Pose; // odom→base_link (바퀴가 믿는 값)
  C!: Pose; // map→odom (보정값)
  M!: Pose; // 이번 맵의 원점 오프셋 — 맵핑 중 전원을 다시 켜면 새 원점으로 옮겨감
  occ!: Set<number>;
  counts?: Uint16Array;
  trueTrail: [number, number][] = [];
  odomTrail: Pose[] = [];
  tFix = 0;
  tScan = 0;
  flash = 0;
  lastFix: { before: number; after: number } | null = null;
  lastFailErr: number | null = null; // 위치추정: 마지막 보정 시도가 거부됐을 때의 추정 오차
  posed = false; // 위치추정: 전원 켠 뒤 initial_pose를 받았는지 (Nav2 AMCL은 받기 전엔 map→odom을 안 냄)
  nfix = 0;
  lastScan: Pose[] = [];
  failLogged = false;
  boots = 1;

  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  logEl: HTMLElement;
  statusEl: HTMLElement;
  R: Record<string, HTMLElement> = {};

  constructor(root: HTMLElement, kind: 'map' | 'loc', startPaused = false) {
    this.kind = kind;
    this.root = root;
    this.running = !startPaused;
    const isMap = kind === 'map';
    root.innerHTML = `
      <div class="slam-split">
      <canvas class="slam-canvas" width="800" height="560" role="img" aria-label="${isMap ? '맵핑' : '위치추정'} 시뮬레이션"></canvas>
      <div>
      <div class="slam-controls">
        <button data-a="play">${startPaused ? '계속' : '일시정지'}</button>
        <button data-a="slam" aria-pressed="true">${isMap ? 'SLAM' : 'AMCL'} 보정: 켜짐</button>
        ${isMap ? '' : '<button data-a="init">initial_pose 보내기 (/initialpose)</button>'}
        <button data-a="power">전원 껐다 켜기</button>
        ${isMap ? '<button data-a="save">지도 저장</button>' : '<button data-a="boot">다른 자리에서 켜기</button>'}
        <button data-a="slip">바퀴 헛돌기</button>
        <button data-a="reset">처음부터</button>
      </div>
      <div class="slam-status"></div>
      <div class="slam-readout">
        <div>odom→base_link (바퀴가 믿는 값)<br><b data-r="o"></b></div>
        <div>map→odom (보정값)<br><b data-r="c"></b></div>
        <div>map 원점에서 odom 원점까지<br><b data-r="d"></b></div>
        <div>map→base_link 추정<br><b data-r="e"></b></div>
        <div>실제 위치 (map 기준 정답)<br><b data-r="t"></b></div>
        <div>현재 추정 오차<br><b data-r="err"></b></div>
        <div>마지막 보정<br><b data-r="fix"></b></div>
      </div>
      <div class="slam-legend">
        <span><i style="background:${COLOR.ink}"></i>${isMap ? '지금까지 그린 지도' : '불러온 지도'}</span>
        <span><i style="background:${COLOR.base}"></i>라이다 스캔 · 추정 위치</span>
        <span><i style="background:${COLOR.odom}"></i>odom이 믿는 경로</span>
        <span><i style="background:${COLOR.muted}"></i>실제 경로 · 실제 벽(점선)</span>
      </div>
      <h4 class="slam-log-title">이벤트 기록 (최신이 위)</h4>
      <ol class="slam-log"></ol>
      </div>
      </div>
    `;
    this.cv = root.querySelector('.slam-canvas') as HTMLCanvasElement;
    this.ctx = this.cv.getContext('2d')!;
    this.logEl = root.querySelector('.slam-log') as HTMLElement;
    this.statusEl = root.querySelector('.slam-status') as HTMLElement;
    root.querySelectorAll('[data-r]').forEach(el => { this.R[(el as HTMLElement).dataset.r!] = el as HTMLElement; });
    root.querySelectorAll('[data-a]').forEach(el => {
      const btn = el as HTMLButtonElement;
      btn.addEventListener('click', () => this.act(btn.dataset.a!, btn));
    });
    if (isMap) this.resetMap(); else this.loadMap(buildExampleMap());
  }

  private log(msg: string) {
    Array.from(this.logEl.children).forEach(li => (li as HTMLElement).classList.add('old'));
    const li = this.root.ownerDocument.createElement('li');
    li.textContent = msg;
    this.logEl.prepend(li);
    while (this.logEl.children.length > 10) this.logEl.lastChild?.remove();
  }

  private base(m: TruthState) {
    this.m = { pt: { ...m.pt }, seg: m.seg, prog: m.prog };
    this.po = zero(); this.C = zero();
    this.trueTrail = []; this.odomTrail = []; this.tFix = 0; this.tScan = 0; this.flash = 0;
    this.lastFix = null; this.lastFailErr = null; this.posed = false; this.nfix = 0; this.lastScan = []; this.failLogged = false; this.boots = 1;
  }

  private resetMap() {
    this.base(BOOT_POSES[0]);
    this.M = zero(); this.counts = new Uint16Array(GRID_N * GRID_N); this.occ = new Set();
    this.logEl.innerHTML = '';
    this.log('전원 켬: 지금 자리가 odom (0, 0)');
    this.log('맵핑 시작: slam_toolbox도 지금 자리를 map (0, 0)으로 잡음 → map→odom = (0, 0)');
  }

  loadMap(map: SavedMap) {
    this.loadedMap = map; this.M = { ...map.origin }; this.base(BOOT_POSES[this.bootIdx]);
    this.logEl.innerHTML = '';
    this.log(map.example ? '지도 로드: 예시 지도 사용 중 (1번에서 저장하면 그 지도로 바뀜)' : '지도 로드: 1번에서 저장한 지도');
    this.log('map (0, 0) = 맵핑을 시작했던 자리. 지도와 함께 고정');
    this.log('전원 켬: 지금 자리가 odom (0, 0). odom은 지도를 모름');
    this.log('AMCL은 위치를 모름 → /initialpose 대기 중 (실제 Nav2 AMCL은 이때 map→odom을 발행하지 않음). 화면엔 (0, 0)에 그려둠 → 파란 스캔이 벽과 안 맞는 걸 보세요');
  }

  private truthMap(): Pose { return compose(inv(this.M), this.m.pt); }
  private est(): Pose { return compose(this.C, this.po); }

  private correct() {
    const tm = this.truthMap(), e = this.est(), eb = dist(e, tm), ab = Math.abs(wrap(e.t - tm.t));
    if (this.kind === 'loc' && (eb > 1.0 || ab > 0.6)) {
      this.lastFailErr = eb; this.lastFix = null;
      if (!this.failLogged) {
        this.log(this.posed
          ? `보정 실패: 추정이 ${eb.toFixed(2)} m 틀려서 스캔이 지도와 안 맞음 → initial_pose를 다시 보내야 함 (1초마다 재시도 중)`
          : 'AMCL: "Please set the initial pose..." — initial_pose를 받기 전이라 보정도, map→odom 발행도 안 함');
        this.failLogged = true;
      }
      return;
    }
    this.failLogged = false; this.lastFailErr = null;
    const meas: Pose = { x: tm.x + (Math.random() - 0.5) * 0.05, y: tm.y + (Math.random() - 0.5) * 0.05, t: tm.t + (Math.random() - 0.5) * 0.01 };
    this.C = compose(meas, inv(this.po)); // map→odom = map→base × (odom→base)⁻¹
    const ea = dist(this.est(), tm);
    this.lastFix = { before: eb, after: ea }; this.nfix++; this.flash = 0.5;
    if (this.nfix <= 2 || eb > 0.25) this.log(`보정 #${this.nfix}: map→odom ${xy(this.C)}로 갱신, 오차 ${eb.toFixed(2)} → ${ea.toFixed(2)} m`);
  }

  step(dt: number) {
    // 바퀴는 실제보다 4% 더 간 것처럼, 회전은 7%+약간의 편향으로 믿는다(=드리프트)
    const { v, w } = moveTruth(this.m, dt);
    const vo = v * 1.04, wo = w * 1.07 + 0.018;
    this.po.x += vo * Math.cos(this.po.t) * dt;
    this.po.y += vo * Math.sin(this.po.t) * dt;
    this.po.t += wo * dt;
    this.trueTrail.push([this.m.pt.x, this.m.pt.y]); if (this.trueTrail.length > 700) this.trueTrail.shift();
    this.odomTrail.push({ x: this.po.x, y: this.po.y, t: 0 }); if (this.odomTrail.length > 700) this.odomTrail.shift();
    this.tScan += dt;
    if (this.tScan > 0.1) {
      this.tScan = 0; this.lastScan = scan(this.m.pt);
      if (this.kind === 'map') {
        const e = this.est();
        for (const h of this.lastScan) { const q = compose(e, h), k = cellOf(q.x, q.y); if (k >= 0 && ++this.counts![k] >= 2) this.occ.add(k); }
      }
    }
    if (this.slamOn) { this.tFix += dt; if (this.tFix > 1.0) { this.tFix = 0; this.correct(); } }
    if (this.flash > 0) this.flash -= dt;
  }

  act(a: string, btn: HTMLButtonElement) {
    if (a === 'play') { this.running = !this.running; btn.textContent = this.running ? '일시정지' : '계속'; }
    if (a === 'slam') {
      this.slamOn = !this.slamOn;
      btn.setAttribute('aria-pressed', String(this.slamOn));
      btn.textContent = `${this.kind === 'map' ? 'SLAM' : 'AMCL'} 보정: ${this.slamOn ? '켜짐' : '꺼짐'}`;
      this.tFix = 1.0;
    }
    if (a === 'slip') {
      this.po.x += 0.8 * Math.cos(this.po.t); this.po.y += 0.8 * Math.sin(this.po.t);
      this.log('바퀴 헛돔: odom은 0.8 m 갔다고 믿지만 실제론 제자리');
    }
    if (a === 'reset') { if (this.kind === 'map') this.resetMap(); else this.loadMap(this.loadedMap!); }
    if (a === 'boot') { this.bootIdx = (this.bootIdx + 1) % BOOT_POSES.length; this.loadMap(this.loadedMap!); }
    if (a === 'init') {
      const tm = this.truthMap(), guess: Pose = { x: tm.x + 0.35, y: tm.y - 0.25, t: tm.t + 0.12 };
      this.C = compose(guess, inv(this.po)); this.flash = 0.5; this.lastFix = null; this.lastFailErr = null; this.failLogged = false;
      this.posed = true;
      this.tFix = 0.5; // 찍고 0.5초 뒤 첫 보정 — 결과가 바로 보이게
      const yaw = ((wrap(guess.t) * 180) / Math.PI).toFixed(0);
      this.log(`① RViz "2D Pose Estimate" → /initialpose 발행 (geometry_msgs/msg/PoseWithCovarianceStamped, frame_id: map) x ${guess.x.toFixed(2)}, y ${guess.y.toFixed(2)}, yaw ${yaw}°, 공분산 σ 0.5 m · 15°`);
      this.log('② AMCL이 /initialpose 수신 → 그 위치 주변(σ 0.5 m, 15°)에 파티클을 다시 뿌림');
      this.log(`③ AMCL 계산: map→odom = initial_pose × (odom→base_link)⁻¹ = ${xy(this.C)} → TF로 발행 시작. 로봇이 켜진 자리(odom 원점)는 map 원점에서 ${Math.hypot(this.C.x, this.C.y).toFixed(2)} m`);
      this.log('④ 찍은 값이 실제와 약간 다름 → 다음 스캔부터 AMCL이 지도에 맞춰 map→odom을 다듬음');
    }
    if (a === 'power') {
      this.boots++;
      this.po = zero(); this.C = zero(); this.odomTrail = []; this.lastFix = null; this.lastFailErr = null; this.flash = 0.5; this.failLogged = false;
      this.posed = false;
      if (this.kind === 'map') {
        this.M = { ...this.m.pt }; this.counts = new Uint16Array(GRID_N * GRID_N); this.occ = new Set(); this.trueTrail = [];
        this.log(`전원 재시작 #${this.boots}: 지금 자리가 새 odom (0, 0)이자 새 map (0, 0). 이전 지도는 저장 안 했으면 사라지고 처음부터 다시 그림`);
      } else {
        this.log(`전원 재시작 #${this.boots}: odom이 지금 자리에서 (0, 0)으로 새로 시작`);
        this.log('AMCL도 다시 시작 → 위치를 잊고 /initialpose 대기 (set_initial_pose: true면 설정값으로 자동 시작). 화면엔 (0, 0)에 그려둠 → initial_pose를 다시 보내주세요');
      }
    }
    if (a === 'save') {
      if (this.occ.size < 50) { this.log('저장 실패: 아직 그린 게 거의 없음. 조금 더 돌려주세요'); }
      else {
        const saved: SavedMap = { origin: { ...this.M }, occ: new Set(this.occ), example: false };
        this.log(`지도 저장: 벽 ${this.occ.size}칸. map (0, 0) = 이번 맵핑을 시작한 자리. 2번 섹션에 로드함`);
        this.onSaveMap?.(saved);
      }
    }
    if (!this.running) this.draw();
  }

  private status() {
    const el = this.statusEl;
    const set = (cls: 'ok' | 'warn', text: string) => { el.className = `slam-status ${cls}`; el.textContent = text; };
    const lost = this.kind === 'loc' && dist(this.est(), this.truthMap()) > 1.0;
    this.root.querySelector('[data-a="init"]')?.classList.toggle('attn', lost);
    if (!this.running) return set('warn', '일시정지 중: "계속"을 눌러야 로봇이 움직이고 보정도 돌아갑니다');
    if (this.kind === 'map') {
      return this.slamOn
        ? set('ok', '맵핑 중: 스캔을 지도에 맞춰 map→odom을 고치는 중 → 벽이 선명하게 그려짐')
        : set('warn', '보정 꺼짐: odom 오차가 그대로 지도에 찍혀서 벽이 번짐');
    }
    const err = dist(this.est(), this.truthMap());
    if (!this.slamOn) return set('warn', `AMCL 보정 꺼짐: 바퀴 값만 믿는 중 → 오차가 계속 커짐 (지금 ${err.toFixed(2)} m)`);
    if (lost && !this.posed) return set('warn', 'AMCL이 /initialpose를 기다리는 중 (실제 Nav2라면 map→odom 미발행) → "initial_pose 보내기"를 누르세요');
    if (lost) return set('warn', `AMCL 보정 실패: 추정이 ${err.toFixed(2)} m 틀려서 스캔이 지도와 안 맞음 → initial_pose를 다시 보내주세요`);
    if (err > 0.15) return set('ok', 'AMCL 보정 중: 대략 맞음, 스캔을 지도에 맞추며 다듬는 중');
    return set('ok', 'AMCL 보정 중: 스캔이 지도와 맞음 (1초마다 map→odom 갱신)');
  }

  draw() {
    const dpr = Math.min(this.root.ownerDocument.defaultView?.devicePixelRatio || 1, 2);
    if (this.cv.width !== CANVAS_W * dpr) { this.cv.width = CANVAS_W * dpr; this.cv.height = CANVAS_H * dpr; }
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#f8fafc'; g.fillRect(0, 0, CANVAS_W, CANVAS_H);
    g.strokeStyle = COLOR.grid; g.lineWidth = 1;
    for (let i = 0; i <= CANVAS_W; i += SCALE_PX) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, CANVAS_H); g.stroke(); }
    for (let j = 0; j <= CANVAS_H; j += SCALE_PX) { g.beginPath(); g.moveTo(0, j); g.lineTo(CANVAS_W, j); g.stroke(); }

    g.setLineDash([3, 4]); g.strokeStyle = COLOR.wall; g.globalAlpha = 0.45;
    for (const [a, b, c, d] of WALL_SEGMENTS) { const p = toScreen({ x: a, y: b, t: 0 }), q = toScreen({ x: c, y: d, t: 0 }); g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); }
    g.globalAlpha = 1; g.setLineDash([]);

    const occ = this.kind === 'map' ? this.occ : this.loadedMap!.occ;
    g.fillStyle = COLOR.ink;
    for (const k of occ) { const w = compose(this.M, { ...cellXY(k), t: 0 }); const [x, y] = toScreen(w); g.fillRect(x - 1.7, y - 1.7, 3.4, 3.4); }

    const MC = compose(this.M, this.C), estW = compose(MC, this.po);
    const line = (pts: Pose[], col: string, dash: number[] | null, width: number) => {
      if (pts.length < 2) return;
      g.strokeStyle = col; g.lineWidth = width; g.setLineDash(dash || []);
      g.beginPath();
      pts.forEach((p, i) => { const [x, y] = toScreen(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke(); g.setLineDash([]);
    };
    line(this.trueTrail.map(([x, y]) => ({ x, y, t: 0 })), COLOR.muted, [5, 4], 1.5);
    line(this.odomTrail.map(p => compose(MC, p)), COLOR.odom, null, 2.2);

    g.fillStyle = COLOR.base;
    for (const h of this.lastScan) { const [x, y] = toScreen(compose(estW, h)); g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }

    const text = (s: string, x: number, y: number, col: string, center = false) => {
      g.font = "600 10.5px ui-monospace, Menlo, monospace";
      const w = g.measureText(s).width;
      const lx = Math.max(3, Math.min(CANVAS_W - 3 - w, center ? x - w / 2 : x));
      const ly = Math.max(12, Math.min(CANVAS_H - 4, y));
      g.lineWidth = 3; g.strokeStyle = '#f8fafc'; g.strokeText(s, lx, ly);
      g.fillStyle = col; g.fillText(s, lx, ly);
    };
    const axes = (p: Pose, col: string, label: string, bold: boolean, above: boolean) => {
      const [x, y] = toScreen(p), L = 24, c = Math.cos(p.t), s = Math.sin(p.t);
      g.strokeStyle = col; g.lineWidth = bold ? 3.5 : 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + L * c, y - L * s); g.stroke();
      g.globalAlpha = 0.55; g.beginPath(); g.moveTo(x, y); g.lineTo(x - L * s, y - L * c); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = col; g.beginPath(); g.arc(x, y, bold ? 5 : 3.5, 0, 7); g.fill();
      text(label, x + 6, above ? y - 8 : y + 15, col);
    };
    const arrow = (a: Pose, b: Pose, col: string, label: string, below: boolean) => {
      const [x1, y1] = toScreen(a), [x2, y2] = toScreen(b), L = Math.hypot(x2 - x1, y2 - y1);
      if (L < 10) return;
      g.strokeStyle = col; g.lineWidth = 1.7; g.setLineDash([4, 4]);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]);
      const an = Math.atan2(y2 - y1, x2 - x1);
      g.fillStyle = col; g.beginPath(); g.moveTo(x2, y2);
      g.lineTo(x2 - 8 * Math.cos(an - 0.4), y2 - 8 * Math.sin(an - 0.4));
      g.lineTo(x2 - 8 * Math.cos(an + 0.4), y2 - 8 * Math.sin(an + 0.4)); g.fill();
      if (L >= 60) text(label, (x1 + x2) / 2, (y1 + y2) / 2 + (below ? 16 : -6), col, true);
    };
    axes(this.M, COLOR.map, 'map (0,0)', true, false);
    arrow(this.M, MC, COLOR.map, 'map→odom', false);
    axes(MC, COLOR.odom, `odom ${xy(this.C)}`, this.flash > 0, true);
    arrow(MC, estW, COLOR.odom, `odom→base ${xy(this.po)}`, true);

    const robot = (p: Pose, fill: string | null, stroke: string, dash: boolean) => {
      const [x, y] = toScreen(p), r = 10, c = Math.cos(p.t), s = Math.sin(p.t);
      const pts = [[r, 0], [-r * 0.75, r * 0.65], [-r * 0.75, -r * 0.65]].map(([a, b]) => [x + a * c - b * s, y - (a * s + b * c)]);
      g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      g.strokeStyle = stroke; g.lineWidth = 2; g.setLineDash(dash ? [3, 2] : []); g.stroke(); g.setLineDash([]);
    };
    robot(this.m.pt, null, COLOR.muted, true);
    robot(estW, COLOR.base, COLOR.base, false);

    const tm = this.truthMap(), e = this.est();
    this.R.o.textContent = fmt(this.po);
    this.R.c.textContent = fmt(this.C); this.R.c.style.color = this.flash > 0 ? COLOR.flash : '';
    this.R.d.textContent = `${Math.hypot(this.C.x, this.C.y).toFixed(2)} m`;
    this.R.e.textContent = fmt(e); this.R.t.textContent = fmt(tm);
    this.R.err.textContent = `${dist(e, tm).toFixed(2)} m`;
    this.R.fix.textContent = this.lastFix
      ? `오차 ${this.lastFix.before.toFixed(2)} → ${this.lastFix.after.toFixed(2)} m`
      : this.lastFailErr !== null ? (this.posed ? `실패 · 추정이 ${this.lastFailErr.toFixed(2)} m 틀림` : 'initial_pose 대기 중') : '아직 없음';
    this.R.fix.style.color = this.lastFailErr !== null ? COLOR.bad : '';
    this.status();
  }
}

const MD_INTRO = `
## 핵심 규칙 한 줄
**map→odom + odom→base_link = 지도에서 로봇 위치.** 바퀴(odometry)는 \`odom→base_link\`만, SLAM/AMCL은 \`map→odom\`만 고칩니다. 서로의 자리를 침범하지 않습니다.

### 왜 "로봇 위치"를 직접 고치지 않고 map→odom을 옮기나
\`odom→base_link\` 값을 보정 때마다 실제 위치로 덮어쓰면, 그 값을 보는 **속도 제어기**가 "순간 후진했다"고 착각해 급가속하고, odom 기준으로 쌓아온 **로컬 코스트맵**(장애물 지도)도 통째로 어긋납니다. 그래서 바퀴 값은 절대 건드리지 않고, 오차만큼 **map→odom**을 옮겨서 상쇄합니다 — 지역 제어기는 여전히 부드러운 값을 받고, 점프는 map 쪽에서만 일어납니다.

| 변환 | 누가 발행 | 성격 | 누가 씀 |
|---|---|---|---|
| map→odom | SLAM, AMCL, 글로벌 EKF | 장기적으로 정확, 대신 튐 | 글로벌 경로계획 |
| odom→base_link | 바퀴 odometry, 로컬 EKF | 부드럽고 연속, 대신 드리프트 | 로컬 제어, 장애물 회피 |

TF는 트리라서 프레임마다 부모가 하나뿐입니다. \`base_link\`의 부모 자리는 이미 \`odom\`이 차지했기 때문에, SLAM은 \`map→base_link\`를 직접 못 넣고 한 단계 위인 \`map→odom\`을 역산해서 넣습니다.

### 숫자로 한 번 (회전 0 가정 → 그냥 뺄셈)
| 항목 | 값 |
|---|---|
| SLAM이 라이다로 본 실제 위치 (map→base_link) | (5.00, 2.00) |
| 바퀴가 믿는 위치 (odom→base_link) | (5.30, 1.80) |
| 그래서 발행할 map→odom | **(−0.30, +0.20)** |

검산: map→odom ⊕ odom→base_link = (−0.30+5.30, 0.20+1.80) = (5.00, 2.00) — SLAM 결과와 일치합니다. 회전이 있으면 \`T_map_odom = T_map_base × (T_odom_base)⁻¹\`로 계산합니다.

\`\`\`mermaid
flowchart LR
    map -- "SLAM/AMCL 보정 (튐)" --> odom -- "바퀴 odometry (매끄러움)" --> base_link
\`\`\`
`;

const MD_CMP_SIGNAL = `
### 제어기에는 어떤 신호가 가나
\`\`\`mermaid
flowchart LR
    ENC["바퀴 엔코더"] --> ODOM["odom→base_link<br/>(TF · /odom)"]
    ODOM --> VEL["속도 추정<br/>v = Δx ÷ Δt"]
    CMD["목표 속도<br/>(cmd_vel)"] --> CTRL["속도 제어기<br/>오차 = 목표 − 추정"]
    VEL --> CTRL --> MOTOR["모터 명령"]
    ODOM --> CM["로컬 코스트맵<br/>(odom 좌표로 장애물 저장)"]
\`\`\`
제어기는 정해진 주기마다(예: 50 Hz → Δt = 0.02 s) **odom 위치가 직전 주기보다 얼마나 바뀌었는지**를 Δt로 나눠 속도를 봅니다. 평소엔 한 주기에 1 cm 남짓 바뀌니 약 0.55 m/s로 보입니다.

**A에서 보정 순간 벌어지는 일** (위 그래프와 같은 숫자)
1. 2초 동안 바퀴는 1.1 m 갔다고 믿었지만 실제로는 1.0 m. 보정이 odom을 실제 위치로 **0.1 m 뒤로 덮어씁니다.**
2. 그 한 주기 동안 odom 변화량 = 앞으로 간 0.011 m − 덮어쓴 0.1 m ≈ **−0.089 m**.
3. 제어기의 속도 추정 = −0.089 ÷ 0.02 ≈ **−4.5 m/s**. 실제론 앞으로 가고 있는데 "초속 4.5 m로 후진 중"이라고 읽습니다.
4. 오차 = 목표 0.5 − (−4.5) = **+5.0 m/s**. 평소 오차(±0.05)의 100배라서 제어기가 모터 한계까지 가속 명령을 냅니다.
5. 다음 주기엔 추정이 다시 0.55로 돌아오니 이번엔 급감속 → 로봇이 **덜컥** 합니다.

- **Δt가 작을수록 더 크게 튑니다.** 같은 0.1 m 점프도 100 Hz면 약 −9.5 m/s로 읽힙니다. 점프 크기 ÷ 제어 주기라서, 빠른 제어기일수록 피해가 큽니다.
- **I항(적분)이 있으면** 이 큰 오차가 누적돼 한동안 과속이 이어지고, **D항(미분)은** 오차가 한 주기에 5 m/s 바뀌니 출력이 폭발합니다.
- **로컬 코스트맵**: 라이다로 본 장애물은 odom 좌표로 저장됩니다. A에선 로봇의 odom 위치만 0.1 m 뒤로 점프하고 저장된 장애물은 그대로라서, 벽이 갑자기 0.1 m 가까워지거나 멀어진 것처럼 보입니다. 좁은 통로에선 충돌 판정이 흔들립니다.

**B에선** odom→base_link가 한 번도 끊기지 않으니 ③ 속도 추정이 늘 0.55 m/s, 오차도 늘 −0.05 m/s로 평평합니다. 보정은 map→odom에만 반영되고, 이 값은 전역 경로계획처럼 "지도 기준"이 필요한 쪽만 씁니다. 그래서 REP-105가 **odom은 연속이어야 하고 점프는 map→odom에만 허용**한다고 정해둔 겁니다.

> 실제 로봇과의 차이: 많은 로봇은 속도를 위치 미분이 아니라 엔코더 회전 속도로 직접 재서 \`/odom\`의 twist에 넣습니다. 그 경우 위치를 덮어써도 twist 자체는 안 튈 수 있습니다. 하지만 위치를 미분하거나 비교하는 쪽(위치 기반 PID, 진행 감시 progress checker, robot_localization의 differential 모드 등)과 odom 기준 코스트맵은 그대로 영향을 받습니다. 이 그래프의 "제어기가 본 속도"는 위치 미분 방식을 가정한 값입니다.
>
> 반대로, 보정으로 **경로와 로봇의 상대 위치가 바뀌는 것**은 A든 B든 똑같이 일어납니다. 로봇의 지도상 추정 위치가 바뀌었으니 당연한 일이고, 그건 보정이 제대로 된 것입니다.
`;

const MD_MAPPING_FLOW = `
### 맵핑 때 일어나는 일
1. 전원을 켜면 odom 노드가 지금 자리를 odom (0, 0)으로 잡습니다.
2. slam_toolbox도 지금 자리를 map (0, 0)으로 잡습니다. 그래서 처음엔 map→odom = (0, 0)이고 두 원점이 겹쳐 있습니다.
3. 돌아다니면 odom은 틀어지고, slam_toolbox가 새 스캔을 지금까지 그린 지도와 맞춰서 map→odom을 고칩니다. 두 원점이 조금씩 벌어지는 게 정상입니다.
4. 스캔은 보정된 위치(map→base_link) 기준으로 지도에 찍힙니다. 보정이 없으면 틀린 위치에 찍혀서 지도가 번집니다.
5. 다 그렸으면 저장합니다. 저장 안 하고 끄면 지도는 사라집니다.

\`\`\`bash
ros2 launch slam_toolbox online_async_launch.py    # mapping 모드
ros2 run nav2_map_server map_saver_cli -f ~/maps/my_map
#  → my_map.pgm (그림) + my_map.yaml (해상도, origin)
# slam_toolbox로 이어서 쓰려면 RViz SlamToolboxPlugin에서 Serialize Map
\`\`\`
> 맵핑 중에 껐다 켜면 꺼진 그 자리가 새 map 원점이 되고 지도를 처음부터 다시 그립니다. 위 시뮬레이션의 "전원 껐다 켜기"로 확인해보세요 — map 축이 로봇 자리로 옮겨갑니다.
`;

const MD_LOC_FLOW = `
### 위치추정 때 일어나는 일
1. 지도를 로드합니다. map (0, 0)은 맵핑을 시작했던 자리로 고정되어 있습니다.
2. 전원을 켜면 odom은 지금 자리를 (0, 0)으로 잡습니다. odom은 지도를 전혀 모릅니다.
3. AMCL도 위치를 모릅니다. ROS 2 Nav2 AMCL은 initial_pose를 받기 전엔 map→odom을 **아예 발행하지 않고** "Please set the initial pose..." 경고만 냅니다. 그래서 RViz(고정 프레임 map)에 로봇이 안 나옵니다. (ROS 1 amcl은 초기값 기본이 (0, 0)이라 지도 원점에서 시작했고, 위 시뮬레이션도 보여주려고 (0, 0)에 그려둡니다.)
4. initial_pose를 보내면 AMCL이 map→odom = initial_pose × (odom→base_link)⁻¹ 로 계산해서 발행을 시작합니다. 이때 "map 원점에서 odom 원점까지"가 곧 로봇이 켜진 자리입니다. 보내는 방법과 받는 쪽은 아래에 따로 정리했습니다.
5. 그 뒤로는 스캔이 지도와 맞도록 map→odom을 계속 다듬습니다.

\`\`\`bash
ros2 launch nav2_bringup localization_launch.py map:=$HOME/maps/my_map.yaml
\`\`\`
> 이 시뮬레이션의 보정은 실제 스캔 매칭이 아니라 흉내입니다. 정답 위치에 작은 잡음을 섞어서 넣고, 추정이 1 m(또는 각도 약 34°) 넘게 틀어지면 실패하도록 만들었습니다.
`;

const MD_INITIAL_POSE = `
## initial_pose — 누가 보내고, 누가 받아서, 뭘 계산하나
\`\`\`mermaid
sequenceDiagram
    participant R as RViz2 / 스크립트
    participant A as AMCL (nav2_amcl)
    participant T as TF
    participant N as Nav2 (경로계획)
    R->>A: /initialpose (PoseWithCovarianceStamped, frame_id: map)
    A->>A: 그 위치 주변(공분산 크기만큼)에 파티클 다시 뿌림
    T-->>A: odom→base_link 조회 (바퀴가 믿는 값)
    A->>T: map→odom = initial_pose × (odom→base_link)⁻¹ 발행
    N->>T: map→base_link 조회 → 이제 지도 기준 경로계획 가능
    loop 스캔이 들어올 때마다
        A->>T: 스캔을 지도에 맞춰 map→odom 갱신
    end
\`\`\`

### 1. 메시지 — 무엇을 보내나
토픽 \`/initialpose\`, 타입 \`geometry_msgs/msg/PoseWithCovarianceStamped\` 하나입니다.
\`\`\`text
header.frame_id        "map"          ← 반드시 map. 다른 프레임이면 AMCL이 무시함
pose.pose.position     x, y           ← 지도 좌표 (m)
pose.pose.orientation  쿼터니언       ← yaw만 쓰면 z = sin(yaw/2), w = cos(yaw/2)
pose.covariance[36]    6×6 행렬       ← "이 위치를 얼마나 확신하나"
  [0]  x 분산   0.25   (σ 0.5 m)
  [7]  y 분산   0.25   (σ 0.5 m)
  [35] yaw 분산 0.0685 (σ 15°)        ← RViz 2D Pose Estimate 기본값
\`\`\`
공분산이 너무 작으면 찍은 값이 틀렸을 때 AMCL이 못 빠져나오고, 너무 크면 수렴이 느리거나 엉뚱한 곳에 수렴할 수 있습니다.

### 2. 보내는 방법 — 셋 다 결국 같은 /initialpose
**① RViz2**: 툴바의 "2D Pose Estimate" → 지도에서 로봇 자리를 클릭하고, 누른 채로 끌어서 방향을 정합니다. 위 시뮬레이션의 "initial_pose 보내기" 버튼이 이 동작입니다.

**② 터미널**
\`\`\`bash
ros2 topic pub --once /initialpose geometry_msgs/msg/PoseWithCovarianceStamped "{
  header: {frame_id: map},
  pose: {pose: {position: {x: 6.4, y: 0.4, z: 0.0}, orientation: {z: 0.7071, w: 0.7071}},
         covariance: [0.25,0,0,0,0,0, 0,0.25,0,0,0,0, 0,0,0,0,0,0,
                      0,0,0,0,0,0, 0,0,0,0,0,0, 0,0,0,0,0,0.0685]}}"   # yaw 90°
\`\`\`

**③ 파이썬 (nav2_simple_commander)** — 자동화할 때
\`\`\`python
from geometry_msgs.msg import PoseStamped
from nav2_simple_commander.robot_navigator import BasicNavigator

nav = BasicNavigator()
p = PoseStamped()
p.header.frame_id = 'map'
p.header.stamp = nav.get_clock().now().to_msg()
p.pose.position.x, p.pose.position.y = 6.4, 0.4
p.pose.orientation.z, p.pose.orientation.w = 0.7071, 0.7071   # yaw 90°
nav.setInitialPose(p)        # 내부에서 /initialpose로 발행
nav.waitUntilNav2Active()
\`\`\`

### 3. 받는 쪽 — 누가 처리하나
| 받는 노드 | 하는 일 |
|---|---|
| nav2_amcl | 파티클 필터를 그 위치 주변으로 리셋 → 레이저 스캔이 들어올 때마다 위치를 다듬고 map→odom을 계산·발행 |
| slam_toolbox (localization 모드) | 그 위치에서 스캔 매칭을 다시 시작 → map→odom 발행 |

AMCL과 slam_toolbox localization을 **동시에** 띄우면 둘 다 /initialpose를 받고 둘 다 map→odom을 발행합니다. 아래 "문제 1"(같은 TF를 두 노드가 발행)이 됩니다. 하나만 띄우세요.

**받았는지 확인**
\`\`\`bash
ros2 topic echo /amcl_pose            # AMCL이 지금 추정한 위치 (공분산이 줄어들면 수렴 중)
ros2 run tf2_ros tf2_echo map odom    # map→odom이 나오기 시작하면 성공
\`\`\`

### "전원 껐다 켜기"를 누르면 — 왜 또 보내야 하나
odom은 켜진 자리를 (0, 0)으로 새로 잡고, AMCL도 다시 시작하면서 이전 위치를 잊습니다. initial_pose를 다시 받기 전까지 map→odom이 없으니, 전원을 켤 때마다 다시 보내줘야 합니다.

### 항상 같은 자리에서 켜진다면 — initial_pose를 고정
충전독처럼 매번 같은 자리에서 켜지는 로봇이라면, 설정 파일에 초기 위치를 박아두면 /initialpose를 따로 보낼 필요가 없습니다. 노드가 켜질 때 이 값으로 스스로 시작합니다.

\`\`\`yaml
# AMCL (Nav2)
amcl:
  ros__parameters:
    set_initial_pose: true
    initial_pose: {x: 6.4, y: 0.4, z: 0.0, yaw: 1.57}
\`\`\`

\`\`\`yaml
# slam_toolbox를 위치추정 모드로 쓸 때
slam_toolbox:
  ros__parameters:
    mode: localization
    map_file_name: /home/me/maps/my_map    # serialize한 파일, 확장자 없이
    map_start_pose: [6.4, 0.4, 1.57]
\`\`\`

> 켜지는 자리가 매번 다르면 이 방법은 못 씁니다 — 그럴 땐 위 세 가지 방법 중 하나로 /initialpose를 보내거나, AMCL의 전역 재위치추정 서비스(\`/reinitialize_global_localization\`, 파티클을 지도 전체에 뿌림)를 호출한 뒤 로봇을 조금 움직여 수렴시킵니다.
`;

const MD_SCENARIOS = `
## 상황별 구성

### 1. 바퀴 엔코더만 있을 때
diff_drive_controller가 odom→base_link만 발행합니다. map 프레임은 없음 — 텔레옵이나 짧은 테스트엔 충분하지만 오래 돌면 계속 틀어지고 고칠 방법이 없습니다.
\`\`\`mermaid
flowchart LR
    odom -- "diff_drive_controller" --> base_link
\`\`\`

### 2. slam_toolbox로 지도 만들기
바퀴 odom은 그대로 두고, slam_toolbox가 라이다 스캔을 지도와 맞춰 map→odom을 발행합니다.
\`\`\`mermaid
flowchart LR
    map -- "slam_toolbox" --> odom -- "diff_drive_controller" --> base_link
\`\`\`
\`\`\`yaml
slam_toolbox:
  ros__parameters:
    map_frame: map
    odom_frame: odom
    base_frame: base_link    # base_footprint 쓰면 그걸로
    scan_topic: /scan
    transform_publish_period: 0.02
\`\`\`

### 3. 바퀴 + IMU를 EKF로 합치기
바퀴만 쓰면 회전이 특히 부정확합니다. robot_localization의 ekf_node로 바퀴 속도 + IMU 각속도를 합치면 odom이 훨씬 덜 틀어집니다. 이때 odom→base_link는 EKF가 발행하므로, 컨트롤러 쪽 TF 발행은 반드시 꺼야 합니다.
\`\`\`mermaid
flowchart LR
    map -- "slam_toolbox / amcl" --> odom -- "ekf_node (바퀴+IMU)" --> base_link
\`\`\`
\`\`\`yaml
# 컨트롤러 쪽
diff_drive_controller:
  ros__parameters:
    enable_odom_tf: false      # 안 끄면 두 노드가 같은 TF를 발행하는 "문제 1"이 생김

# ekf.yaml
ekf_filter_node:
  ros__parameters:
    two_d_mode: true
    world_frame: odom
    odom_frame: odom
    base_link_frame: base_link
    odom0: /diff_drive_controller/odom
    odom0_config: [false,false,false, false,false,false,
                   true, false,false, false,false,true,
                   false,false,false]   # vx, vyaw
    imu0: /imu/data
    imu0_config:  [false,false,false, false,false,false,
                   false,false,false, false,false,true,
                   true, false,false]   # vyaw, ax
\`\`\`
> 위치(x, y)처럼 적분값을 여러 센서에서 동시에 넣으면 서로 싸웁니다. 연속 센서는 속도 위주로 넣는 게 안전합니다.

### 4. 실외에서 GPS까지 쓸 때
EKF를 두 개 띄웁니다. 로컬 EKF는 바퀴+IMU로 odom→base_link를, 글로벌 EKF는 거기에 GPS를 더해 map→odom을 발행합니다. navsat_transform_node가 위도·경도를 map 기준 좌표로 바꿔줍니다.
\`\`\`mermaid
flowchart LR
    map -- "ekf_global (+GPS)" --> odom -- "ekf_local" --> base_link
\`\`\`
\`\`\`yaml
ekf_global:
  ros__parameters:
    world_frame: map
    odom0: /diff_drive_controller/odom
    odom1: /odometry/gps       # navsat_transform 출력
    imu0: /imu/data
\`\`\`
> 글로벌 EKF와 SLAM(또는 AMCL)을 동시에 켜면 map→odom 발행자가 둘이 됩니다. 하나만 남기세요.

## 문제 상황

### 1. 로봇이 RViz에서 덜덜 떨리거나 순간이동
같은 변환을 두 노드가 발행하는 경우가 가장 흔합니다. TF는 마지막에 들어온 값을 쓰므로 두 값 사이를 계속 오갑니다.
\`\`\`mermaid
flowchart LR
    map -- "slam_toolbox" --> odom
    odom -. "diff_drive_controller (충돌!)" .-> base_link
    odom -. "ekf_node (충돌!)" .-> base_link
\`\`\`
\`\`\`bash
ros2 run tf2_tools view_frames      # frames_<날짜시각>.pdf 생성 → 화살표마다 Broadcaster 확인
ros2 run tf2_ros tf2_echo odom base_link
\`\`\`

### 2. 바퀴가 헛돌거나 로봇을 들어서 옮겼을 때
바퀴는 실제 움직임을 모르니 odom이 크게 틀어집니다. 위 시뮬레이션에서 SLAM 보정을 켜고 "바퀴 헛돌기"를 눌러보면, map→odom이 크게 바뀌면서 로봇이 제자리로 돌아옵니다 — **map→odom이 크게 점프하는 건 보정이 제대로 일하는 것입니다. 버그가 아닙니다.** 다만 AMCL은 너무 크게 어긋나면 못 따라오므로, 이럴 땐 RViz의 2D Pose Estimate로 \`/initialpose\`를 다시 찍어줍니다.

### 3. "extrapolation into the future" 에러
TF를 조회하려는 시각에 아직 변환이 도착하지 않았다는 뜻 — 대부분 시간 설정 문제입니다.
- 시뮬레이션이면 모든 노드에 \`use_sim_time: true\`가 들어갔는지 확인합니다. 하나만 빠져도 납니다.
- 실제 로봇이면 센서 PC와 메인 PC 시계가 맞는지(chrony 등) 확인합니다.
- 약간의 지연은 AMCL의 \`transform_tolerance\`나 slam_toolbox의 \`transform_timeout\`을 늘려서 흡수합니다.

## 막혔을 때 확인 순서
1. \`view_frames\`로 트리가 map → odom → base_link 한 줄로 이어지는지 봅니다. 끊겨 있으면 발행 노드가 안 떠 있는 겁니다.
2. 화살표마다 발행자가 하나인지 봅니다. 둘이면 '문제 1'입니다.
3. \`tf2_echo odom base_link\`로 로봇을 밀었을 때 값이 부드럽게 바뀌는지 봅니다. 여기가 튀면 odom 쪽 문제입니다.
4. \`tf2_echo map odom\`을 봅니다. 여기는 가끔 튀는 게 정상입니다. 계속 0이면 SLAM이 보정을 못 하고 있는 겁니다.
5. 센서 프레임(laser, imu_link)과 base_link 사이 static TF가 실제 장착 위치·방향과 맞는지 확인합니다. IMU 축이 뒤집혀 있으면 EKF가 엉뚱하게 돕니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosSlam extends w.HTMLElement {
    private mapSim?: SlamSim;
    private locSim?: SlamSim;
    private rafId = 0;
    private lastTs: number | null = null;
    private io?: IntersectionObserver;
    private tourIdx = 0;

    private cmpT = 0;
    private cmpA: CmpState = cmpZero();
    private cmpB: CmpState = cmpZero();
    private cmpRunning = true;
    private cmpVisible = true;

    private resetCmp() {
      this.cmpT = 0; this.cmpA = cmpZero(); this.cmpB = cmpZero();
      this.stepCmp(0.016);
      this.drawCmp();
    }

    private stepCmp(dt: number) {
      this.cmpT += dt;
      cmpStep(this.cmpT, dt, this.cmpA, this.cmpB);
    }

    private drawCmp() {
      const sr = this.shadowRoot;
      const svgA = sr?.querySelector('#slam-cmp-svg-a') as HTMLElement;
      const svgB = sr?.querySelector('#slam-cmp-svg-b') as HTMLElement;
      if (svgA) svgA.innerHTML = cmpChart(this.cmpA, this.cmpT, COLOR.bad);
      if (svgB) svgB.innerHTML = cmpChart(this.cmpB, this.cmpT, COLOR.flash);
      for (const [s, id] of [[this.cmpA, '#slam-cmp-a-snap'], [this.cmpB, '#slam-cmp-b-snap']] as const) {
        const el = sr?.querySelector(id) as HTMLElement & { __snap?: CmpSnap | null };
        if (el && el.__snap !== s.snap) { el.__snap = s.snap; el.innerHTML = cmpSnapHtml(s.snap); }
      }
      const fmtM = (v: number) => `${v.toFixed(2)} m`;
      const set = (id: string, text: string) => { const el = sr?.querySelector(id) as HTMLElement; if (el) el.textContent = text; };
      set('#slam-cmp-a-o', fmtM(this.cmpA.odom)); set('#slam-cmp-a-c', fmtM(this.cmpA.C));
      set('#slam-cmp-a-e', fmtM(this.cmpA.C + this.cmpA.odom)); set('#slam-cmp-a-v', `${this.cmpA.vel.toFixed(2)} m/s`);
      set('#slam-cmp-b-o', fmtM(this.cmpB.odom)); set('#slam-cmp-b-c', fmtM(this.cmpB.C));
      set('#slam-cmp-b-e', fmtM(this.cmpB.C + this.cmpB.odom)); set('#slam-cmp-b-v', `${this.cmpB.vel.toFixed(2)} m/s`);
      const aR = sr?.querySelector('#slam-cmp-a-react') as HTMLElement;
      if (aR) {
        aR.className = `slam-cmp-react ${this.cmpA.spike > 0 ? 'bad' : ''}`;
        aR.textContent = this.cmpA.spike > 0
          ? '보정 순간 로봇이 뒤로 순간이동 → 제어기: "후진 중?!" 급가속. 로컬 코스트맵 장애물도 통째로 어긋남'
          : '다음 보정까지는 조용함';
      }
      const bR = sr?.querySelector('#slam-cmp-b-react') as HTMLElement;
      if (bR) {
        bR.className = `slam-cmp-react ${this.cmpB.spike > 0 ? 'ok' : ''}`;
        bR.textContent = this.cmpB.spike > 0
          ? '보정 순간 map→odom만 바뀜 → 제어기는 아무것도 모름. 속도 그대로'
          : '오차는 odom에 쌓이고, map→odom이 상쇄 중';
      }
    }

    @addEventListener('#slam-cmp-play', 'click')
    onCmpPlay(e: Event) {
      this.cmpRunning = !this.cmpRunning;
      (e.target as HTMLElement).textContent = this.cmpRunning ? '일시정지' : '계속';
    }

    @addEventListener('#slam-cmp-reset', 'click')
    onCmpReset() { this.resetCmp(); }

    private renderTour() {
      const s = TOUR_STEPS[this.tourIdx];
      const est: XY = { x: s.C.x + s.po.x, y: s.C.y + s.po.y };
      let g = '';
      for (let x = 0; x <= 9; x++) { const [a] = tourP({ x, y: 0 }); g += `<line x1="${a}" y1="0" x2="${a}" y2="${TOUR_H}" stroke="${COLOR.grid}"/>`; }
      for (let y = 0; y <= 5; y++) { const [, b] = tourP({ x: 0, y }); g += `<line x1="0" y1="${b}" x2="${TOUR_W}" y2="${b}" stroke="${COLOR.grid}"/>`; }
      if (s.map) {
        g += tourAxes({ x: 0, y: 0 }, COLOR.map, 'map (0,0)', true);
        g += tourArrow({ x: 0, y: 0 }, s.C, COLOR.map, `map→odom ${tourPt(s.C)}`, -8);
      }
      g += tourAxes(s.C, COLOR.odom, 'odom (0,0)', false);
      g += tourArrow(s.C, est, COLOR.odom, `odom→base ${tourPt(s.po)}`, 18);
      if (Math.hypot(s.real.x - est.x, s.real.y - est.y) > 0.05) {
        g += tourRobot(s.real, 'none', COLOR.muted, true);
        const [rx, ry] = tourP(s.real);
        g += `<text x="${rx}" y="${ry + 26}" text-anchor="middle" font-size="11" fill="${COLOR.muted}">실제 로봇 ${tourPt(s.real)}</text>`;
      }
      g += tourRobot(est, COLOR.base, COLOR.base, false);

      const sr = this.shadowRoot;
      const svg = sr?.querySelector('#slam-tour-svg') as HTMLElement;
      if (svg) svg.innerHTML = g;
      const known = s.map;
      const eq = sr?.querySelector('#slam-tour-eq') as HTMLElement;
      if (eq) {
        eq.innerHTML =
          `<div class="chip m ${s.hot === 'm' ? 'hot' : ''}"><small>map→odom (AMCL)</small>${known ? tourPt(s.C) : '?'}</div><span class="op">+</span>` +
          `<div class="chip o ${s.hot === 'o' ? 'hot' : ''}"><small>odom→base (바퀴)</small>${tourPt(s.po)}</div><span class="op">=</span>` +
          `<div class="chip b"><small>지도에서 로봇</small>${known ? tourPt(est) : '?'}</div>`;
      }
      const no = sr?.querySelector('#slam-tour-no') as HTMLElement; if (no) no.textContent = `${this.tourIdx + 1} / ${TOUR_STEPS.length}  ${s.title}`;
      const cap = sr?.querySelector('#slam-tour-cap') as HTMLElement; if (cap) cap.textContent = s.cap;
      const prev = sr?.querySelector('#slam-tour-prev') as HTMLButtonElement; if (prev) prev.disabled = this.tourIdx === 0;
      const next = sr?.querySelector('#slam-tour-next') as HTMLButtonElement; if (next) next.disabled = this.tourIdx === TOUR_STEPS.length - 1;
      const dots = sr?.querySelector('#slam-tour-dots') as HTMLElement;
      if (dots) dots.innerHTML = TOUR_STEPS.map((_, k) => `<span class="${k === this.tourIdx ? 'on' : ''}"></span>`).join('');
    }

    @addEventListener('#slam-tour-prev', 'click')
    onTourPrev() { if (this.tourIdx > 0) { this.tourIdx--; this.renderTour(); } }

    @addEventListener('#slam-tour-next', 'click')
    onTourNext() { if (this.tourIdx < TOUR_STEPS.length - 1) { this.tourIdx++; this.renderTour(); } }

    private tick = (ts: number) => {
      if (this.lastTs === null) this.lastTs = ts;
      const dt = Math.min((ts - this.lastTs) / 1000, 0.05);
      this.lastTs = ts;
      for (const s of [this.mapSim, this.locSim]) {
        if (s && s.running && s.visible) { s.step(dt); s.draw(); }
      }
      if (this.cmpRunning && this.cmpVisible) { this.stepCmp(dt); this.drawCmp(); }
      this.rafId = w.requestAnimationFrame(this.tick);
    };

    @onConnectedAfter
    onReady() {
      const mapRoot = this.shadowRoot?.querySelector('#slam-panel-map') as HTMLElement;
      const locRoot = this.shadowRoot?.querySelector('#slam-panel-loc') as HTMLElement;
      const reduceMotion = !!w.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      this.mapSim = new SlamSim(mapRoot, 'map', reduceMotion);
      this.locSim = new SlamSim(locRoot, 'loc', reduceMotion);
      if (reduceMotion) {
        this.cmpRunning = false;
        const play = this.shadowRoot?.querySelector('#slam-cmp-play') as HTMLElement;
        if (play) play.textContent = '계속';
      }
      this.mapSim.onSaveMap = saved => this.locSim?.loadMap(saved);

      const cmpSection = this.shadowRoot?.querySelector('.slam-cmp') as HTMLElement;
      this.io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          const target = e.target as HTMLElement;
          if (this.mapSim && target === this.mapSim.cv) this.mapSim.visible = e.isIntersecting;
          if (this.locSim && target === this.locSim.cv) this.locSim.visible = e.isIntersecting;
          if (target === cmpSection) this.cmpVisible = e.isIntersecting;
        });
      });
      this.io.observe(this.mapSim.cv);
      this.io.observe(this.locSim.cv);
      if (cmpSection) this.io.observe(cmpSection);

      this.mapSim.draw(); this.locSim.draw();
      this.resetCmp();
      this.rafId = w.requestAnimationFrame(this.tick);

      this.renderTour();
      markdownParse(this.shadowRoot?.querySelector('#slam-md-cmp-signal') as HTMLElement, MD_CMP_SIGNAL);
      markdownParse(this.shadowRoot?.querySelector('#slam-md-intro') as HTMLElement, MD_INTRO);
      markdownParse(this.shadowRoot?.querySelector('#slam-md-mapping-flow') as HTMLElement, MD_MAPPING_FLOW);
      markdownParse(this.shadowRoot?.querySelector('#slam-md-loc-flow') as HTMLElement, MD_LOC_FLOW);
      markdownParse(this.shadowRoot?.querySelector('#slam-md-initial-pose') as HTMLElement, MD_INITIAL_POSE);
      markdownParse(this.shadowRoot?.querySelector('#slam-md-scenarios') as HTMLElement, MD_SCENARIOS);
    }

    @onDisconnected
    onGone() {
      w.cancelAnimationFrame(this.rafId);
      this.io?.disconnect();
    }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .slam-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:10px; }
          .slam-intro b { color:#22314e; }
          .slam-section-title { font-size:13.5px; font-weight:800; color:#1e293b; margin:18px 0 4px; }
          .slam-tip { font-size:12px; color:#64748b; margin:0 0 8px; }
          .slam-sim { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; margin-bottom:6px; }
          .slam-canvas { display:block; width:100%; max-width:${CANVAS_W}px; margin:0 auto; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; }
          .slam-controls { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
          .slam-controls button { padding:6px 13px; border-radius:16px; border:1.5px solid #cbd5e1; background:#fff; color:#334155; font-size:11.5px; font-weight:700; cursor:pointer; }
          .slam-controls button:hover { border-color:#94a3b8; }
          .slam-controls button[aria-pressed="true"] { background:#22314e; border-color:#22314e; color:#fff; }
          .slam-controls button.attn { border-color:#ef4444; color:#b91c1c; background:#fef2f2; animation:slam-attn 1.2s ease-in-out infinite; }
          @keyframes slam-attn { 50% { box-shadow:0 0 0 4px rgba(239,68,68,.25); } }
          @media (prefers-reduced-motion: reduce) { .slam-controls button.attn { animation:none; } }
          .slam-status { margin-top:10px; padding:7px 12px; border-radius:8px; font-size:12px; font-weight:700; border:1.5px solid #e2e8f0; }
          .slam-status.ok { border-color:#16a34a; color:#166534; background:#f0fdf4; }
          .slam-status.warn { border-color:#ef4444; color:#991b1b; background:#fef2f2; }
          .slam-readout { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:6px 14px; margin-top:10px; font-size:11.5px; color:#475569; }
          .slam-readout b { font-family:monospace; color:#1e293b; }
          .slam-legend { display:flex; flex-wrap:wrap; gap:6px 14px; font-size:11px; color:#64748b; margin-top:8px; }
          .slam-legend i { display:inline-block; width:16px; height:3px; vertical-align:middle; margin-right:5px; border-radius:2px; }
          .slam-log-title { font-size:11.5px; font-weight:800; color:#1e293b; margin:12px 0 2px; }
          .slam-log { margin:0; padding-left:18px; font-size:11.5px; color:#1e293b; max-height:160px; overflow-y:auto; }
          .slam-log li { margin-bottom:3px; }
          .slam-log li.old { color:#94a3b8; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:16px 0 6px; }
          .md h2:first-child { margin-top:0; }
          .md h3 { font-size:13px; font-weight:800; color:#1e293b; margin:14px 0 4px; }
          .md p, .md ul, .md ol { margin:0 0 8px; }
          .md ul, .md ol { padding-left:20px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .md pre { background:#f1f5f9; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; overflow-x:auto; }
          .md pre code { background:none; padding:0; }
          .md blockquote { border-left:3px solid #f59e0b; margin:8px 0; padding:2px 0 2px 12px; color:#475569; }
          .md table { width:100%; border-collapse:collapse; font-size:12px; margin:8px 0; }
          .md th, .md td { border:1px solid #e2e8f0; padding:6px 8px; text-align:left; vertical-align:top; }
          .md th { background:#f0f9ff; color:#0c4a6e; }
          .slam-title { font-size:17px; font-weight:800; color:#1e293b; line-height:1.4; margin:0 0 10px; }
          .slam-title small { display:block; font-size:12.5px; font-weight:700; color:#3b82c4; margin-top:2px; }
          .slam-tour { background:#fff; border:2px solid #3b82c4; border-radius:14px; padding:16px; margin:0 0 18px; }
          .slam-tour-rule { font-size:12.5px; margin:0 0 10px; color:#334155; font-weight:400; }
          .slam-tour-rule b { color:#22314e; }
          #slam-tour-svg { width:100%; max-width:${TOUR_W}px; height:auto; display:block; margin:0 auto; border-radius:8px; background:#f8fafc; }
          .slam-tour-eq { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:10px 0 8px; font-family:monospace; font-size:11.5px; }
          .slam-tour-eq .chip { border:2px solid #e2e8f0; border-radius:10px; padding:5px 9px; text-align:center; line-height:1.3; }
          .slam-tour-eq .chip small { display:block; font-family:var(--font-family,sans-serif); font-size:10px; color:#64748b; }
          .slam-tour-eq .chip.m { border-color:#22314e; }
          .slam-tour-eq .chip.o { border-color:#f59e0b; }
          .slam-tour-eq .chip.hot { box-shadow:0 0 0 3px #f59e0b inset; }
          .slam-tour-eq .op { font-size:16px; color:#94a3b8; }
          .slam-tour-no { font-weight:700; margin:8px 0 2px; font-size:12.5px; color:#1e293b; }
          .slam-tour-cap { font-size:12.5px; color:#334155; min-height:4.4em; margin:0 0 8px; }
          .slam-tour-nav { display:flex; gap:8px; justify-content:space-between; }
          .slam-tour-nav button { flex:1; padding:7px; border-radius:10px; border:1.5px solid #cbd5e1; background:#fff; color:#334155; font-size:12px; font-weight:700; cursor:pointer; }
          .slam-tour-nav button:disabled { opacity:.4; cursor:default; }
          .slam-tour-dots { display:flex; gap:6px; justify-content:center; margin:10px 0 0; }
          .slam-tour-dots span { width:8px; height:8px; border-radius:50%; background:#e2e8f0; display:inline-block; }
          .slam-tour-dots span.on { background:#3b82c4; }
          .slam-cmp { margin:0 0 18px; }
          .slam-cmp-pane { background:#fff; border:2px solid #e2e8f0; border-radius:14px; padding:14px; margin:10px 0; }
          .slam-cmp-pane.bad { border-color:#ef4444; }
          .slam-cmp-pane.ok { border-color:#16a34a; }
          .slam-cmp-pane h5 { margin:0 0 4px; font-size:12.5px; font-weight:800; color:#1e293b; }
          #slam-cmp-svg-a, #slam-cmp-svg-b { width:100%; max-width:${CMP_W}px; height:auto; display:block; margin:8px auto 0; border-radius:8px; background:#f8fafc; }
          .slam-cmp-live { display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; font-size:11.5px; margin-top:8px; color:#475569; }
          .slam-cmp-live b { font-family:monospace; color:#1e293b; }
          .slam-cmp-react { margin-top:8px; padding:6px 10px; border-radius:8px; font-size:11.5px; font-weight:700; border:1.5px solid #e2e8f0; color:#334155; min-height:2.6em; }
          .slam-cmp-react.bad { border-color:#ef4444; color:#991b1b; background:#fef2f2; }
          .slam-cmp-react.ok { border-color:#16a34a; color:#166534; background:#f0fdf4; }
          .slam-cmp-snap { margin-top:8px; border:1px dashed #cbd5e1; border-radius:8px; padding:8px 10px; font-size:11.5px; color:#334155; background:#f8fafc; }
          .slam-cmp-snap .snap-title { font-weight:800; color:#1e293b; margin-bottom:4px; }
          .slam-cmp-snap .snap-empty { color:#94a3b8; }
          .slam-cmp-snap .snap-row { display:flex; flex-wrap:wrap; justify-content:space-between; gap:2px 10px; padding:3px 0; border-top:1px solid #eef2f7; }
          .slam-cmp-snap .snap-row b { font-family:ui-monospace, Menlo, monospace; font-weight:600; color:#1e293b; text-align:right; }
          .slam-cmp-snap .snap-row.bad b { color:#b91c1c; }
          .slam-cmp-snap .snap-row.ok b { color:#15803d; }
          .slam-split { display:grid; grid-template-columns:1fr; gap:12px; align-items:start; }
          .slam-cmp-grid { display:grid; grid-template-columns:1fr; gap:0 12px; }
          @media (min-width:760px) {
            .slam-split { grid-template-columns:minmax(0,${CANVAS_W}px) minmax(0,1fr); gap:18px; }
            .slam-split > div > .slam-controls { margin-top:0; }
            .slam-cmp-grid { grid-template-columns:1fr 1fr; }
            .slam-tour-nav { max-width:320px; }
          }
        </style>

        <h3 class="slam-title">map, odom, base_link<small>보정은 결국 "odom을 옮기는 일"</small></h3>

        <section class="slam-tour">
          <p class="slam-tour-rule">먼저 이것만: 규칙은 하나예요. <b>map→odom + odom→base_link = 지도에서 로봇 위치</b>. 바퀴는 odom→base_link만, AMCL은 map→odom만 만집니다. 회전은 빼고 숫자만 봅니다.</p>
          <div class="slam-split">
            <svg id="slam-tour-svg" viewBox="0 0 ${TOUR_W} ${TOUR_H}" role="img" aria-label="단계별 좌표 그림"></svg>
            <div>
              <div class="slam-tour-eq" id="slam-tour-eq"></div>
              <p class="slam-tour-no" id="slam-tour-no"></p>
              <p class="slam-tour-cap" id="slam-tour-cap"></p>
              <div class="slam-tour-nav"><button id="slam-tour-prev">이전</button><button id="slam-tour-next">다음</button></div>
              <div class="slam-tour-dots" id="slam-tour-dots"></div>
            </div>
          </div>
        </section>

        <section class="slam-cmp">
          <h4 class="slam-section-title">왜 odom은 안 고치나: 두 방법 나란히 보기</h4>
          <p class="slam-tip">로봇이 0.5 m/s로 직진하고, 바퀴는 10% 더 갔다고 믿습니다. 2초마다 AMCL이 실제 위치를 알려줍니다. 위쪽 그래프는 odom→base_link 값, 아래쪽은 속도 제어기가 odom으로 계산한 속도예요.</p>
          <div class="slam-controls"><button id="slam-cmp-play">일시정지</button><button id="slam-cmp-reset">처음부터</button></div>

          <div class="slam-cmp-grid">
          <div class="slam-cmp-pane bad">
            <h5>A. odom→base_link를 직접 고침 (안 되는 방법)</h5>
            <p class="slam-tip">보정할 때마다 바퀴 값을 실제 위치로 덮어씁니다.</p>
            <svg id="slam-cmp-svg-a" viewBox="0 0 ${CMP_W} ${CMP_H}" role="img" aria-label="방법 A 그래프"></svg>
            <div class="slam-cmp-live">
              <div>odom→base_link<br><b id="slam-cmp-a-o"></b></div><div>map→odom<br><b id="slam-cmp-a-c"></b></div>
              <div>지도에서 로봇<br><b id="slam-cmp-a-e"></b></div><div>제어기가 본 속도<br><b id="slam-cmp-a-v"></b></div>
            </div>
            <div class="slam-cmp-react" id="slam-cmp-a-react"></div>
            <div class="slam-cmp-snap" id="slam-cmp-a-snap"></div>
          </div>

          <div class="slam-cmp-pane ok">
            <h5>B. map→odom을 고침 (ROS 방식)</h5>
            <p class="slam-tip">바퀴 값은 그대로 두고, 차이만큼 map→odom을 옮깁니다.</p>
            <svg id="slam-cmp-svg-b" viewBox="0 0 ${CMP_W} ${CMP_H}" role="img" aria-label="방법 B 그래프"></svg>
            <div class="slam-cmp-live">
              <div>odom→base_link<br><b id="slam-cmp-b-o"></b></div><div>map→odom<br><b id="slam-cmp-b-c"></b></div>
              <div>지도에서 로봇<br><b id="slam-cmp-b-e"></b></div><div>제어기가 본 속도<br><b id="slam-cmp-b-v"></b></div>
            </div>
            <div class="slam-cmp-react" id="slam-cmp-b-react"></div>
            <div class="slam-cmp-snap" id="slam-cmp-b-snap"></div>
          </div>
          </div>

          <p class="slam-tip">두 방법 모두 "지도에서 로봇" 값은 똑같이 맞습니다. 차이는 odom을 쓰는 쪽에서 납니다.</p>
          <div class="md" id="slam-md-cmp-signal"></div>
        </section>

        <div class="slam-intro">
          로봇을 직접 옮기는 게 아니라, 오차가 쌓인 odom 좌표계 전체를 지도 위에서 밀어서 맞춥니다. 1번에서 지도를 직접 만들고, 2번에서 그 지도를 불러와 위치를 맞춰보세요.
        </div>
        <div class="md" id="slam-md-intro"></div>

        <h4 class="slam-section-title">1. 지도 만들기 (맵핑)</h4>
        <p class="slam-tip">slam_toolbox를 mapping 모드로 켜고 로봇을 몰고 다니는 단계입니다. 로봇이 켜진 자리가 그대로 map (0, 0)이 됩니다. SLAM 보정을 끄고 한 바퀴 돌려보면 odom 오차가 그대로 지도에 그려져 벽이 두세 겹으로 번집니다. 지도가 마음에 들면 "지도 저장"을 누르세요 — 2번이 그 지도를 불러옵니다.</p>
        <div class="slam-sim" id="slam-panel-map"></div>
        <div class="md" id="slam-md-mapping-flow"></div>

        <h4 class="slam-section-title">2. 저장한 지도로 위치 보정 (위치추정)</h4>
        <p class="slam-tip">1번에서 저장한 지도를 불러오고, 로봇은 지도의 다른 자리에서 켜집니다. 처음엔 AMCL이 /initialpose를 기다리는 상태라 로봇이 지도 원점에 그려지고 스캔이 벽과 어긋나 있습니다 — "initial_pose 보내기"를 누르면 대충 맞고, 이어서 AMCL 보정이 들어가면 딱 맞습니다. 이벤트 기록에 ①보내기 → ②AMCL 수신 → ③map→odom 계산 순서가 찍힙니다. 추정이 1 m 넘게 틀어지면 AMCL은 혼자 못 찾아오니 initial_pose를 다시 보내야 합니다. "전원 껐다 켜기"로 AMCL이 위치를 잊는 상황도 확인해보세요.</p>
        <div class="slam-sim" id="slam-panel-loc"></div>
        <div class="md" id="slam-md-loc-flow"></div>

        <div class="md" id="slam-md-initial-pose"></div>
        <div class="md" id="slam-md-scenarios"></div>
      `;
    }
  }

  return tagName;
};
