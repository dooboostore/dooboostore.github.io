// sector 의 local 장면: 지면 svg + placements 배치 + 행동(wander / route)
//
// 레이어 (아래 → 위):
//   ground  지면 svg
//   water   물 위를 다니는 것 (placement.layer = "water", 예: 유람선)
//   over    지면 svg 중 data-layer="over" 인 것 (다리: 배는 다리 밑으로 지나간다)
//   world   건물·나무·사람·버스·새 — 땅 위치(발 y) 로 정렬, 움직이는 것은 주기적으로 다시 정렬 (아래쪽이 앞)
//
// 높이 z (base_link z 처럼, 지면 위 높이 · 로컬 좌표 단위): placement.z ?? entity.z
//   - 그만큼 떠서 그리고, 땅(발 위치)에는 그림자를 자동으로 둔다. 깊이 정렬은 땅 위치 기준.
//   - 카메라 높이(setCamera, 같은 단위)가 z 의 3배 아래로 내려오면 흐려지기 시작해 1.5배에서 사라진다 (카메라가 그 높이를 지나감).
//
// 지형 구역: 지면 svg 요소의 data-zone="water|road|bridge" 를 장면을 붙일 때 캔버스 비트맵으로 한 번 구워 픽셀로 판정한다.
//   - 무작위 배치(count+area)와 wander 는 avoid 구역(기본 water)에 들어가지 않는다. allow 구역(기본 bridge)은 예외.
//   - wander 는 목적지뿐 아니라 가는 길 전체를 검사한다 → 강 건너편으로는 다리로만 건넌다.
import { Text, tr } from './i18n';
import { Behavior, Entity, EntityRegistry, parseSvg, prefixIds, SVGNS, useAt, Win } from './entity';

type XY = [number, number];
type Vars = Record<string, string | string[]>;
type Wander = Extract<Behavior, { type: 'wander' }>;
export type Placement = {
  use: string;
  at?: XY | XY[];
  count?: number;
  area?: [number, number, number, number];
  scale?: number;
  vars?: Vars;
  flip?: boolean;
  layer?: 'water';
  z?: number;
  avoid?: string[]; // 무작위 배치 시 피할 구역 (기본 ["water"])
  spacing?: number; // 같은 배치의 인스턴스 사이 최소 거리 (로컬 좌표) — 빽빽한 군집 방지
  behavior?: Behavior;
};
export type SectorJson = {
  // 위치(bounds)는 색인(worlds.json)에 있고, 여기는 내용만: 로컬 좌표 크기 · 지면 · 행정 경계(경위도 GeoJSON)
  local: { size: XY; ground: string; boundary?: string };
  placements: Placement[];
  labels?: Label[]; // 지명: 지도(ground.svg) 가 아니라 여기 — 언어마다 다시 그린다
};
// 지명 라벨: 지면 로컬 좌표 at 에 글자 (글자 크기 size, 색 color). info 는 누르면 뜨는 도감
export type LabelInfo = { emoji?: string; kind?: string; title?: Text; desc?: Text };
export type Label = { text: Text; at: XY; size?: number; color?: string; info?: LabelInfo };
// pick: 화면에서 누른 요소 → 무엇인가 (도감 팝업·카메라 따라가기용). 개체면 use, 지면 지명 라벨이면 label. pos 는 로컬 좌표 (움직이면 계속 바뀜)
export type Picked = { use?: string; label?: Label; pos: () => XY; moving: boolean };
export type Scene = { relabel: () => void; pick: (target: Element) => Picked | undefined; el: SVGGElement; size: XY; boundary?: any; stop: () => void; issues: string[]; inZone: (x: number, y: number, z: string) => boolean; setCamera: (altitude: number) => void; setView: (view: [number, number, number, number], pxPerUnit: number) => void; walkable: (x: number, y: number, avoid?: string[], allow?: string[]) => boolean };

const DEFAULT_AVOID = ['water'];
const DEFAULT_ALLOW = ['bridge'];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(v: T | T[]) => (Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v);

// parent 에 먼저 붙인다: 지형 비트맵을 구울 때 getCTM·계산된 스타일(fill/stroke-width)은 문서에 붙은 요소에서만 정확하다
export async function mountScene(w: Win, reg: EntityRegistry, dir: string, idPrefix: string, parent: SVGGElement): Promise<Scene> {
  const doc = w.document;
  const g = (cls?: string) => {
    const el = doc.createElementNS(SVGNS, 'g');
    if (cls) el.setAttribute('class', cls);
    return el;
  };
  const sector: SectorJson = await (await w.fetch(dir + 'sector.json')).json();
  const [sw, sh] = sector.local.size;
  const [groundText, boundary] = await Promise.all([
    w.fetch(dir + sector.local.ground).then((r) => r.text()),
    sector.local.boundary ? w.fetch(dir + sector.local.boundary).then((r) => r.json()) : undefined,
  ]);
  const ground = parseSvg(w, prefixIds(groundText, idPrefix + '_g_'));

  const root = g('scene');
  const [groundL, waterL, overL, worldL] = [g(), g(), g(), g()];
  const routeDefs = doc.createElementNS(SVGNS, 'defs'); // 경로 위치 계산용 (그리지 않음)
  root.append(routeDefs, groundL, waterL, overL, worldL);
  parent.appendChild(root);
  Array.from(ground.root.childNodes).forEach((n) => {
    const node = doc.importNode(n, true);
    ((node as Element).getAttribute?.('data-layer') === 'over' ? overL : groundL).appendChild(node);
  });

  // 지명 라벨: 지면 위·개체 아래 (예전 ground.svg 안 글자와 같은 자리·모양)
  const labelL = g('labels');
  Object.entries({ 'font-family': "'Apple SD Gothic Neo', 'Noto Sans KR', 'PingFang SC', 'Microsoft YaHei', sans-serif", 'font-weight': '800', fill: '#7a5a3f', 'text-anchor': 'middle', stroke: '#fffaf0', 'stroke-width': '3', 'paint-order': 'stroke', 'stroke-linejoin': 'round' }).forEach(([k, v]) => labelL.setAttribute(k, v));
  groundL.appendChild(labelL);
  const labelEls = (sector.labels ?? []).map((lb) => {
    const t = doc.createElementNS(SVGNS, 'text');
    t.setAttribute('class', 'label');
    t.setAttribute('x', String(lb.at[0]));
    t.setAttribute('y', String(lb.at[1]));
    t.setAttribute('font-size', String(lb.size ?? 10));
    if (lb.color) t.setAttribute('fill', lb.color);
    labelL.appendChild(t);
    return { t, lb };
  });
  const relabel = () => labelEls.forEach(({ t, lb }) => (t.textContent = tr(lb.text)));
  relabel();

  // ---- 지형 구역 → 비트맵으로 한 번 굽는다 (R=물, G=도로, B=다리)
  // isPointInFill/Stroke 를 큰 OSM path 에 매번 부르면 한 번에 수 ms — 사람들이 경로를 고를 때 수천 번 불러서 프레임이 수백 ms 로 늘었다.
  // SVG path 문자열은 Path2D 가 그대로 받으므로 모양은 같고, 판정은 픽셀 하나 읽기(O(1))가 된다.
  const ZONE_CH: Record<string, number> = { water: 0, road: 1, bridge: 2 };
  const zs = Math.min(2, 3000 / Math.max(sw, sh)); // 로컬 1단위당 픽셀 (좁은 개울도 잡히게 최대 2)
  const zw = Math.ceil(sw * zs), zh = Math.ceil(sh * zs);
  const zoneData = (() => {
    const cv = doc.createElement('canvas');
    cv.width = zw;
    cv.height = zh;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.globalCompositeOperation = 'lighter';
    const base = groundL.getCTM();
    root.querySelectorAll<SVGGraphicsElement>('[data-zone]').forEach((el) => {
      const ch = ZONE_CH[el.getAttribute('data-zone')!];
      if (ch == null) return;
      const tag = el.tagName.toLowerCase();
      const n = (a: string) => Number(el.getAttribute(a) ?? 0);
      const path =
        tag === 'path' ? new w.Path2D(el.getAttribute('d') ?? '')
        : tag === 'line' ? new w.Path2D(`M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`)
        : tag === 'rect' ? new w.Path2D(`M${n('x')} ${n('y')}h${n('width')}v${n('height')}h${-n('width')}Z`)
        : tag === 'circle' || tag === 'ellipse'
          ? (() => { const p2 = new w.Path2D(); const rx = n(tag === 'circle' ? 'r' : 'rx'), ry = n(tag === 'circle' ? 'r' : 'ry'); p2.ellipse(n('cx'), n('cy'), rx, ry, 0, 0, Math.PI * 2); return p2; })()
          : undefined;
      if (!path) return;
      const m = base && el.getCTM() ? base.inverse().multiply(el.getCTM()!) : new w.DOMMatrix();
      ctx.setTransform(zs * m.a, zs * m.b, zs * m.c, zs * m.d, zs * m.e, zs * m.f);
      const color = ['rgb(255,0,0)', 'rgb(0,255,0)', 'rgb(0,0,255)'][ch];
      const cs = w.getComputedStyle(el);
      if (cs.fill === 'none') {
        ctx.strokeStyle = color;
        ctx.lineWidth = parseFloat(cs.strokeWidth) || 1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(path);
      } else {
        ctx.fillStyle = color;
        ctx.fill(path, (el.getAttribute('fill-rule') ?? cs.fillRule) === 'evenodd' ? 'evenodd' : 'nonzero');
      }
    });
    return ctx.getImageData(0, 0, zw, zh).data;
  })();
  const inZone = (x: number, y: number, z: string) => {
    const ch = ZONE_CH[z];
    if (ch == null || !zoneData) return false;
    const px = Math.floor(x * zs), py = Math.floor(y * zs);
    if (px < 0 || py < 0 || px >= zw || py >= zh) return false;
    return zoneData[(py * zw + px) * 4 + ch] > 127;
  };
  const walkable = (x: number, y: number, avoid = DEFAULT_AVOID, allow = DEFAULT_ALLOW) =>
    x >= 0 && y >= 0 && x <= sw && y <= sh && (!avoid.some((z) => inZone(x, y, z)) || allow.some((z) => inZone(x, y, z)));
  const pathOk = (a: XY, b: XY, avoid?: string[], allow?: string[]) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1)); // 1단위 간격 — 3단위면 좁은 개울을 건너뛰어 버린다
    for (let i = 1; i <= n; i++) if (!walkable(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, avoid, allow)) return false;
    return true;
  };
  const randomIn = ([x, y, ww, hh]: number[], avoid?: string[], allow?: string[], ok?: (p: XY) => boolean): XY | undefined => {
    for (let t = 0; t < 40; t++) {
      const p: XY = [rand(x, x + ww), rand(y, y + hh)];
      if (walkable(p[0], p[1], avoid, allow) && (!ok || ok(p))) return p;
    }
    return undefined; // ponytail: 영역 대부분이 막혀 있으면 그 개체는 생략 — 데이터에서 area 를 고칠 것
  };

  // 바닥면(발 줄과 그 조금 위) 9곳이 모두 물 밖인지 — 건물·꽃밭이 물에 걸치지 않게
  const footprintDry = (e: Entity, scale: number, [x, y]: XY) => {
    const [bw, bh] = [e.box.w * scale, e.box.h * scale];
    const left = x - e.foot[0] * bw;
    for (let k = 0; k <= 8; k++) for (const dy of [0, -0.12 * bh]) if (inZone(left + (bw * k) / 8, y + dy, 'water')) return false;
    return true;
  };

  // ---- 다리 = 강 건너편으로 가는 출입구. 양 끝점이 물에 걸치면 바깥쪽으로 조금씩 밀어 땅 위에 둔다
  const bridges: [XY, XY][] = [];
  root.querySelectorAll<SVGLineElement>('line[data-zone="bridge"]').forEach((l) => {
    const a: XY = [+l.getAttribute('x1')!, +l.getAttribute('y1')!];
    const b: XY = [+l.getAttribute('x2')!, +l.getAttribute('y2')!];
    if (bridges.some(([p, q]) => p[0] === a[0] && p[1] === a[1] && q[0] === b[0] && q[1] === b[1])) return; // 외곽선·상판 중복
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    const out = (p: XY, dir: number): XY => {
      for (let d = 0; d <= 12; d += 2) {
        const q: XY = [p[0] + ux * d * dir, p[1] + uy * d * dir];
        if (walkable(q[0], q[1], ['water'], [])) return q;
      }
      console.warn('[world] 다리 끝이 땅에 닿지 않음', p);
      return p;
    };
    bridges.push([out(a, -1), out(b, 1)]);
  });
  // 목적지까지 경유점 목록: 바로 갈 수 있으면 [to], 아니면 다리 하나를 거쳐 [다리끝, 반대끝, to]
  const planPath = (from: XY, to: XY, avoid?: string[], allow?: string[]): XY[] | undefined => {
    if (pathOk(from, to, avoid, allow)) return [to];
    let best: XY[] | undefined;
    let bestLen = Infinity;
    for (const [a, b] of bridges) {
      for (const [p, q] of [[a, b], [b, a]] as [XY, XY][]) {
        if (!pathOk(from, p, avoid, allow) || !pathOk(p, q, avoid, allow) || !pathOk(q, to, avoid, allow)) continue;
        const len = Math.hypot(p[0] - from[0], p[1] - from[1]) + Math.hypot(q[0] - p[0], q[1] - p[1]) + Math.hypot(to[0] - q[0], to[1] - q[1]);
        if (len < bestLen) [best, bestLen] = [[p, q, to], len];
      }
    }
    return best;
  };

  let alive = true;
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const t = w.setTimeout(() => {
      timers.delete(t);
      if (alive) fn();
    }, ms);
    timers.add(t);
  };

  const entities = await Promise.all(sector.placements.map((p) => reg.load(p.use)));
  // 모든 배치 개체: 현재 발 위치(pos)와 크기 — 화면 밖·너무 작게 보이는 것은 숨기고(컬링·LOD), 보이는 것만 깊이 정렬한다
  type Item = { el: SVGGElement; use: string; moving: boolean; pos: () => XY; w: number; h: number; foot: XY; z: number; minPx: number; inWorld: boolean; shown: boolean };
  const items: Item[] = [];
  const issues: string[] = [];
  const flying: { el: SVGGElement; z: number }[] = [];

  sector.placements.forEach((p, pi) => {
    const e = entities[pi];
    const behavior = p.behavior ?? e.behavior;
    const wanderB = behavior?.type === 'wander' ? (behavior as Wander) : undefined;
    const avoid = wanderB?.avoid ?? p.avoid ?? DEFAULT_AVOID;
    const allow = wanderB?.allow ?? DEFAULT_ALLOW;
    let pts: XY[];
    if (p.at) {
      pts = typeof p.at[0] === 'number' ? [p.at as XY] : (p.at as XY[]);
      if (!p.layer) pts.filter(([x, y]) => !walkable(x, y, avoid, allow)).forEach((pt) => console.warn(`[world] ${p.use} 가 막힌 구역에 놓임`, pt));
    } else {
      const area = p.area ?? [0, 0, sw, sh];
      const dry = behavior ? undefined : (pt: XY) => footprintDry(e, p.scale ?? 1, pt); // 정적 무작위 배치는 바닥 전체가 물 밖이어야
      const spacing = p.spacing ?? 0;
      const taken: XY[] = [];
      const pickSpaced = (): XY | undefined => {
        for (let t = 0; t < 50; t++) {
          const pt = randomIn(area, avoid, allow, dry);
          if (!pt) return undefined;
          if (spacing && taken.some(([x, y]) => Math.hypot(x - pt[0], y - pt[1]) < spacing)) continue;
          taken.push(pt);
          return pt;
        }
        return undefined;
      };
      pts = Array.from({ length: p.count ?? 1 }, () => (behavior?.type === 'route' ? ([0, 0] as XY) : pickSpaced())).filter((it): it is XY => !!it);
    }

    pts.forEach(([x, y], i) => {
      const inst = g('inst');
      Object.entries(p.vars ?? {}).forEach(([k, v]) => inst.style.setProperty(k, pick(v)));
      const flip = g();
      if (p.flip) flip.setAttribute('transform', 'scale(-1 1)');
      // 움직이는 것은 가는 쪽을 보게: 옆모습 그림은 오른쪽을 보고 그린다(전조등·물살이 오른쪽 앞). left/right view 가 없으면 좌우 반전으로
      let mirrored = !!p.flip;
      const face = (dx: number) => {
        if (Math.abs(dx) < 0.01 || (e.views.left && e.views.right) || mirrored === dx < 0) return;
        mirrored = dx < 0;
        flip.setAttribute('transform', mirrored ? 'scale(-1 1)' : '');
      };
      const body = g('body');
      body.style.animationDelay = `${-Math.random()}s`;
      const u = useAt(w, e, 'front', p.scale ?? 1);
      body.appendChild(u);
      flip.appendChild(body);
      const z = p.z ?? e.z ?? 0;
      if (z > 0) {
        // 떠 있는 것: 땅에 그림자, 몸은 z 만큼 위로. 카메라 높이 페이드는 lift 에 (route 의 SMIL opacity 와 겹치지 않게)
        const sw = e.box.w * (p.scale ?? 1) * 0.32;
        const shadow = doc.createElementNS(SVGNS, 'ellipse');
        Object.entries({ rx: sw, ry: sw * 0.32, fill: '#3b5a2e', opacity: Math.max(0.06, 0.2 - z * 0.004) }).forEach(([k, v]) => shadow.setAttribute(k, String(v)));
        const lift = g('lift');
        lift.setAttribute('transform', `translate(0 ${-z})`);
        lift.appendChild(flip);
        inst.append(shadow, lift);
        flying.push({ el: lift, z });
      } else inst.appendChild(flip);
      const layerEl = p.layer === 'water' ? waterL : undefined;
      const sc = p.scale ?? 1;
      const add = (pos: () => XY) => {
        items.push({ el: inst, use: p.use, moving: !!behavior, pos, w: e.box.w * sc, h: e.box.h * sc, foot: e.foot, z, minPx: behavior ? 8 : 3, inWorld: !layerEl, shown: true });
        (layerEl ?? worldL).appendChild(inst);
      };

      if (behavior?.type === 'route') {
        // 경로 따라가기: Web Animations (SMIL animateMotion 은 Safari 에서 우리 장면 안에서 멈출 때가 있었다).
        // 경로를 길이 기준으로 잘게 잘라 translate 키프레임으로 — 길이에 비례해 움직이므로 animateMotion 의 paced 와 같다.
        // 양 끝 4% 에서는 서서히 나타나고 사라진다
        const begin = -(behavior.dur * i) / pts.length - rand(0, 3);
        const geo = doc.createElementNS(SVGNS, 'path');
        geo.setAttribute('d', behavior.path);
        routeDefs.appendChild(geo);
        const len = geo.getTotalLength();
        // 물 위 교통은 경로 전체가 실제 물인지 확인한다. 육지를 지나면 배가 땅으로 올라가므로 건너뛴다.
        if (p.layer === 'water') {
          let wet = true;
          for (let t = 0; t <= 30; t++) {
            const pt = geo.getPointAtLength((len * t) / 30);
            if (!inZone(pt.x, pt.y, 'water')) { wet = false; break; }
          }
          if (!wet) {
            geo.remove();
            issues.push(`${p.use} 의 물길이 육지를 지남 — 배치 건너뜀`);
            return;
          }
        }
        const N = Math.max(24, Math.min(400, Math.ceil(len / 3)));
        const offs = [...new Set([...Array.from({ length: N + 1 }, (_, k) => k / N), 0.04, 0.96])].sort((a, b) => a - b);
        const frames = offs.map((o) => {
          const q = geo.getPointAtLength(o * len);
          return { offset: o, transform: `translate(${q.x.toFixed(2)}px, ${q.y.toFixed(2)}px)`, opacity: o < 0.04 ? o / 0.04 : o > 0.96 ? (1 - o) / 0.04 : 1 };
        });
        const durMs = behavior.dur * 1000;
        const anim = inst.animate(frames, { duration: durMs, delay: begin * 1000, iterations: Infinity, easing: 'linear' });
        // 지금 위치: 애니메이션 시계로 직접 계산 (깊이 정렬·화면 컬링·진행 방향에 쓴다)
        add(() => {
          const ct = Number(anim.currentTime ?? 0) - begin * 1000;
          const s = ((((ct / durMs) % 1) + 1) % 1) * len;
          const pt = geo.getPointAtLength(s);
          face(geo.getPointAtLength(Math.min(len, s + 2)).x - pt.x);
          return [pt.x, pt.y];
        });
      } else if (wanderB) {
        add(wander(inst, u, e, wanderB, p.area ?? [0, 0, sw, sh], [x, y], avoid, allow, face));
      } else {
        // 명시 좌표(at)로 놓은 건물·언덕이 강을 덮으면 경고 (무작위 배치는 애초에 걸러진다)
        if (!p.layer && !footprintDry(e, p.scale ?? 1, [x, y])) issues.push(`${p.use} @${Math.round(x)},${Math.round(y)} 바닥이 물에 걸침`);
        inst.setAttribute('transform', `translate(${x} ${y})`);
        const at: XY = [x, y];
        add(() => at);
      }
    });
  });

  // 200ms 마다: ① 화면 밖이거나 너무 작게 보이는 것은 숨김 (컬링·LOD) ② 보이는 것만 깊이 정렬 (발 y 가 큰 = 화면 아래가 앞)
  // ponytail: 개체 수백 개 선형 검사 — 수천 개가 되면 격자 인덱스로
  let view: [number, number, number, number] | undefined;
  let px = 1;
  const update = () => {
    for (const it of items) {
      let show = true;
      if (view) {
        const [x, y] = it.pos();
        const x0 = x - it.foot[0] * it.w, x1 = x0 + it.w;
        const y1 = y + (1 - it.foot[1]) * it.h, y0 = y1 - it.h - it.z;
        const mx = (view[2] - view[0]) * 0.15, my = (view[3] - view[1]) * 0.15;
        show = x1 > view[0] - mx && x0 < view[2] + mx && y1 > view[1] - my && y0 < view[3] + my && it.h * px >= it.minPx;
      }
      if (show !== it.shown) {
        it.shown = show;
        it.el.style.display = show ? '' : 'none';
      }
    }
    const vis = items.filter((it) => it.inWorld && it.shown).map((it) => ({ el: it.el, y: it.pos()[1] }));
    vis.sort((a, b) => a.y - b.y);
    let prev: Element | null = null;
    for (const { el } of vis) {
      if (prev && !(prev.compareDocumentPosition(el) & w.Node.DOCUMENT_POSITION_FOLLOWING)) worldL.insertBefore(el, prev.nextSibling);
      prev = el;
    }
  };
  update();
  issues.forEach((m) => console.warn('[world]', m));
  const sortTimer = w.setInterval(update, 200);

  // 이동은 Web Animations API: DOM 순서를 바꿔도(깊이 정렬) 끊기지 않는다 (CSS transition 은 재삽입 시 취소됨)
  function wander(inst: SVGGElement, u: SVGUseElement, e: Entity, b: Wander, area: number[], start: XY, avoid: string[], allow: string[], face: (dx: number) => void) {
    let [cx, cy] = start;
    let from: XY = start;
    let t0 = 0;
    let dur = 0;
    let anim: Animation | undefined;
    const [p0, p1] = b.pause ?? [1, 5];
    inst.style.transform = `translate(${cx}px, ${cy}px)`;
    const setView = (dx: number, dy: number) => {
      const v = e.views;
      const name = Math.abs(dy) > Math.abs(dx) && v.front && v.back ? (dy > 0 ? 'front' : 'back') : v.left && v.right ? (dx < 0 ? 'left' : 'right') : 'front';
      u.setAttribute('href', '#' + (v[name] ?? Object.values(v)[0]));
      face(dx);
    };
    const go = () => {
      let plan: XY[] | undefined;
      for (let t = 0; t < 12 && !plan; t++) {
        const c = randomIn(area, avoid, allow);
        if (c) plan = planPath([cx, cy], c, avoid, allow);
      }
      if (!plan) return later(go, rand(p0, p1) * 1000); // 갈 곳이 없으면 쉬었다가 다시
      inst.classList.add('walking');
      step(plan, 0);
    };
    const step = (plan: XY[], i: number) => {
      if (i >= plan.length) return rest();
      const [tx, ty] = plan[i];
      dur = Math.max(1, (Math.hypot(tx - cx, ty - cy) / b.speed) * 1000);
      setView(tx - cx, ty - cy);
      const prev = anim;
      anim = inst.animate([{ transform: `translate(${cx}px, ${cy}px)` }, { transform: `translate(${tx}px, ${ty}px)` }], { duration: dur, easing: 'linear', fill: 'forwards' });
      prev?.cancel();
      from = [cx, cy];
      t0 = w.performance.now();
      cx = tx;
      cy = ty;
      later(() => step(plan, i + 1), dur);
    };
    const rest = () => {
      inst.classList.remove('walking');
      if (Math.random() < 0.4) u.setAttribute('href', '#' + (e.views.front ?? Object.values(e.views)[0])); // 쉬면서 가끔 정면을 본다
      later(go, rand(p0, p1) * 1000);
    };
    later(go, rand(0, p1) * 1000);
    return (): XY => {
      const k = dur ? Math.min(1, (w.performance.now() - t0) / dur) : 1;
      return [from[0] + (cx - from[0]) * k, from[1] + (cy - from[1]) * k];
    };
  }

  const pickAt = (target: Element): Picked | undefined => {
    const inst = target.closest('.inst');
    const it = inst && items.find((x) => x.el === inst);
    if (it) return { use: it.use, pos: it.pos, moving: it.moving };
    const text = target.closest('text.label');
    const hit = text && labelEls.find((it) => it.t === text);
    if (hit) return { label: hit.lb, pos: () => hit.lb.at, moving: false };
    return undefined;
  };

  return {
    relabel,
    pick: pickAt,
    el: root,
    size: sector.local.size,
    boundary,
    walkable,
    inZone,
    issues,
    // 카메라가 움직일 때마다(매 프레임) 불린다 — 값만 저장하고 실제 갱신은 200ms 주기에 (가장자리 15% 여유가 있어 늦게 나타나는 게 안 보인다)
    setView: (v, pxPerUnit) => {
      view = v;
      px = pxPerUnit;
    },
    setCamera: (alt: number) => {
      for (const f of flying) f.el.style.opacity = String(Math.max(0, Math.min(1, (alt / f.z - 1.5) / 1.5)));
    },
    stop: () => {
      alive = false;
      timers.forEach((t) => w.clearTimeout(t));
      w.clearInterval(sortTimer);
      root.remove();
    },
  };
}
