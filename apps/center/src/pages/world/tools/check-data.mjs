// datas/world 정합성 검사: 색인 ↔ 파일, 참조, 순환, viewBox
// 사용: node apps/center/src/pages/world/tools/check-data.mjs  (레포 루트에서)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { geoContains, geoDistance, geoInterpolate } from 'd3-geo'; // apps/center/node_modules

const ROOT = process.argv[2] ?? 'datas/world';
const errors = [];
const err = (m) => errors.push(m);
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const viewBoxOk = (p) => {
  if (!existsSync(p)) return err(`파일 없음: ${p}`);
  if (!/<svg[^>]*\bviewBox="[^"]+"/.test(readFileSync(p, 'utf8'))) err(`viewBox 없음: ${p}`);
  // XML 주석 안에 '--' 가 있으면 브라우저 DOMParser 가 파싱 실패한다 (CSS 변수 이름을 주석에 쓰다 걸리기 쉬움)
  for (const m of readFileSync(p, 'utf8').matchAll(/<!--([\s\S]*?)-->/g)) if (m[1].includes('--')) err(`주석 안에 '--' 금지: ${p}`);
};

const E = join(ROOT, 'entities');
const indexed = new Set(json(join(ROOT, 'entities.json')).entities.map((e) => e.id));
const deps = new Map(); // entity id → parts 의 use 들

for (const id of indexed) {
  if (id.endsWith('.svg')) {
    viewBoxOk(join(E, id));
    deps.set(id, []);
    continue;
  }
  const f = join(E, id, 'entity.json');
  if (!existsSync(f)) {
    err(`entity.json 없음: ${f}`);
    continue;
  }
  const e = json(f);
  const views = e.views ?? { front: { svg: e.svg } };
  const uses = (e.parts ?? []).map((p) => p.use);
  for (const [name, v] of Object.entries(views)) {
    if (v.mirror) {
      if (!views[v.mirror] || views[v.mirror].mirror) err(`${id}: view ${name} 의 mirror 대상 "${v.mirror}" 가 없거나 또 mirror`);
    } else if (!v.svg) err(`${id}: view ${name} 에 svg 없음`);
    else viewBoxOk(join(E, id, v.svg));
    uses.push(...(v.parts ?? []).map((p) => p.use));
  }
  deps.set(id, uses);
}

const used = new Set();
const ref = (from, id) => {
  used.add(id);
  if (!indexed.has(id)) err(`${from}: entities.json 에 없는 entity "${id}"`);
};
deps.forEach((uses, id) => uses.forEach((u) => ref(id, u)));

// 순환 검사
const state = new Map();
const visit = (id, path) => {
  if (state.get(id) === 'done') return;
  if (state.get(id) === 'doing') return err(`순환 참조: ${[...path, id].join(' → ')}`);
  state.set(id, 'doing');
  (deps.get(id) ?? []).forEach((d) => visit(d, [...path, id]));
  state.set(id, 'done');
};
deps.forEach((_, id) => visit(id, []));

for (const world of json(join(ROOT, 'worlds.json')).worlds) {
  const W = join(ROOT, 'worlds', world.id);
  if (!existsSync(join(W, 'world.json'))) {
    err(`world.json 없음: ${W}`);
    continue;
  }
  const wj = json(join(W, 'world.json'));
  for (const f of [wj.countries, wj.features].filter(Boolean)) if (!existsSync(join(W, f))) err(`${world.id}: 파일 없음 ${f}`);
  if (wj.features) for (const f of json(join(W, wj.features)).features) if (!wj.styles?.[f.kind]) err(`${world.id}: styles 에 kind "${f.kind}" 없음`);
  // 교통: entity 색인 + 배 항로는 육지를 지나면 안 된다 (25km 간격 샘플)
  const land = wj.countries ? json(join(W, wj.countries)).features : [];
  for (const r of wj.traffic ?? []) {
    ref(`${world.id} traffic "${r.name}"`, r.use);
    if (r.z == null || !(r.z >= 0)) err(`${world.id} traffic "${r.name}": z(고도 km) 필요 — 배 0, 비행기 ~10`);
    if (r.kind !== 'sea') continue;
    if (r.path.length === 1) {
      const hit = land.find((c) => geoContains(c, r.path[0]));
      if (hit) err(`${world.id} 바다 시설 "${r.name}" 이 육지(${hit.properties.name}) 위에 있음`);
      continue;
    }
    for (let i = 0; i < r.path.length - 1; i++) {
      const [a, b] = [r.path[i], r.path[i + 1]];
      const steps = Math.max(1, Math.ceil((geoDistance(a, b) * wj.radiusKm) / 25));
      const f = geoInterpolate(a, b);
      for (let t = 0; t <= steps; t++) {
        const p = f(t / steps);
        const hit = land.find((c) => geoContains(c, p));
        if (hit) {
          err(`${world.id} 배 항로 "${r.name}" 구간 ${i}→${i + 1} 이 육지(${hit.properties.name})를 지남: [${p.map((v) => v.toFixed(2))}]`);
          break;
        }
      }
    }
  }
  for (const s of world.sectors) {
    if (!(s.geo && Math.abs(s.geo.lat) <= 90 && Math.abs(s.geo.lon) <= 180)) err(`${world.id}/${s.id}: geo 범위 이상`);
    if (!s.local) continue;
    const b = s.bounds;
    if (!(b && b[0][0] < b[1][0] && b[0][1] < b[1][1])) err(`${world.id}/${s.id}: local sector 는 bounds [[서경,남위],[동경,북위]] 필요`);
    const f = join(W, s.id, 'sector.json');
    if (!existsSync(f)) {
      err(`local 인데 sector.json 없음: ${f}`);
      continue;
    }
    const sec = json(f);
    viewBoxOk(join(W, s.id, sec.local.ground));
    if (sec.local.boundary && !existsSync(join(W, s.id, sec.local.boundary))) err(`boundary 없음: ${join(W, s.id, sec.local.boundary)}`);
    sec.placements.forEach((p) => ref(`${world.id}/${s.id}`, p.use));
    sec.placements.forEach((p) => {
      if (p.z != null && !(typeof p.z === 'number' && p.z >= 0)) err(`${world.id}/${s.id}: ${p.use} 의 z 는 0 이상 숫자`);
      if (p.layer != null && p.layer !== 'water') err(`${world.id}/${s.id}: ${p.use} 의 layer 는 "water" 만 (하늘은 z 로)`);
    });
  }
}

indexed.forEach((id) => used.has(id) || console.warn(`(경고) 아무 데서도 안 쓰는 entity: ${id}`));
if (errors.length) {
  errors.forEach((e) => console.error('✗ ' + e));
  process.exit(1);
}
console.log(`✓ entity ${indexed.size}개, 참조·순환·viewBox 이상 없음`);
