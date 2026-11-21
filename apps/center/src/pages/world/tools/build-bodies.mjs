// 달·화성 지형(features.json) 생성 (1회성). 실제 위치·크기(공식 경위도, 동경+)를 원으로 근사하고, 작은 크레이터는 시드 고정 난수로 채운다.
// 사용(레포 루트): node apps/center/src/pages/world/tools/build-bodies.mjs
// features: { name, kind, circle: [lon, lat, 반지름°] } | { name, kind, line: [[lon,lat]...], width: ° }
import { writeFileSync } from 'node:fs';

const R = { moon: 1737.4, mars: 3389.5 };
const deg = (body, diameterKm) => +((diameterKm / 2 / R[body]) * (180 / Math.PI)).toFixed(2);
const c = (body, name, kind, lon, lat, dKm) => ({ name, kind, circle: [lon, lat, Math.max(0.5, deg(body, dKm))] });

// 시드 고정 난수 (mulberry32) — 다시 돌려도 같은 크레이터
const rng = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const smallCraters = (body, n, seed, maxKm) => {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const lon = r() * 360 - 180;
    const lat = (Math.asin(r() * 2 - 1) * 180) / Math.PI; // 구면 균등
    return c(body, '', 'crater-s', +lon.toFixed(1), +lat.toFixed(1), 40 + r() * maxKm);
  });
};

const moon = [
  c('moon', '남극-에이트켄 분지', 'basin', -169, -53, 2500),
  c('moon', '폭풍의 대양', 'mare', -57.4, 18.4, 1900),
  c('moon', '비의 바다', 'mare', -15.6, 32.8, 1146),
  c('moon', '맑음의 바다', 'mare', 17.5, 28.0, 674),
  c('moon', '고요의 바다', 'mare', 31.4, 8.5, 873),
  c('moon', '위기의 바다', 'mare', 59.1, 17.0, 556),
  c('moon', '풍요의 바다', 'mare', 51.3, -7.8, 909),
  c('moon', '감로주의 바다', 'mare', 35.5, -15.2, 333),
  c('moon', '구름의 바다', 'mare', -16.6, -21.3, 715),
  c('moon', '습기의 바다', 'mare', -38.6, -24.4, 389),
  c('moon', '증기의 바다', 'mare', 3.6, 13.3, 245),
  c('moon', '알려진 바다', 'mare', -23.1, -10.0, 376),
  c('moon', '모스크바의 바다', 'mare', 147.9, 27.3, 277),
  { name: '추위의 바다', kind: 'mare-line', line: [[-40, 57], [-15, 57.5], [10, 56.5], [35, 57]], width: 7 },
  ...smallCraters('moon', 70, 7, 110),
  c('moon', '클라비우스', 'crater', -14.1, -58.4, 225),
  c('moon', '프톨레마이오스', 'crater', -1.8, -9.2, 153),
  c('moon', '그리말디', 'crater-dark', -68.3, -5.2, 172),
  c('moon', '플라톤', 'crater-dark', -9.3, 51.6, 101),
  c('moon', '코페르니쿠스', 'crater', -20.1, 9.6, 93),
  c('moon', '케플러', 'crater', -38.0, 8.1, 31),
  c('moon', '아리스타르코스', 'crater-bright', -47.4, 23.7, 40),
  // 티코: 밝은 광조(빛줄기)가 사방으로
  ...[0, 50, 110, 160, 215, 270, 320].map((a) => ({
    name: '',
    kind: 'ray',
    line: [[-11.4, -43.3], [-11.4 + Math.sin((a * Math.PI) / 180) * 28, -43.3 + Math.cos((a * Math.PI) / 180) * 22]],
    width: 1.1,
  })),
  c('moon', '티코', 'crater-bright', -11.4, -43.3, 85),
];

const mars = [
  c('mars', '타르시스 고원', 'highland', -110, 2, 4000),
  c('mars', '유토피아 평원', 'plain-dark', 118, 49.7, 3300),
  c('mars', '아키달리아 평원', 'plain-dark', -21, 46.7, 2800),
  c('mars', '시르티스 메이저', 'plain-dark', 69.5, 8.4, 1500),
  c('mars', '헬라스 평원', 'basin', 70.5, -42.4, 2300),
  c('mars', '아르기레 평원', 'basin', -43, -49.7, 1800),
  ...smallCraters('mars', 45, 11, 140),
  { name: '마리너 계곡', kind: 'canyon', line: [[-96, -6], [-86, -8.5], [-76, -10], [-66, -12], [-56, -13], [-46, -11], [-38, -8]], width: 2.4 },
  c('mars', '올림푸스 산', 'volcano', -133.8, 18.65, 600),
  c('mars', '아르시아 산', 'volcano', -120.1, -8.3, 435),
  c('mars', '파보니스 산', 'volcano', -113, 1.5, 375),
  c('mars', '아스크라이우스 산', 'volcano', -104.1, 11.9, 460),
  c('mars', '엘리시움 산', 'volcano', 146.9, 25, 240),
  c('mars', '게일 크레이터', 'crater', 137.8, -5.4, 154),
  c('mars', '예제로 크레이터', 'crater', 77.5, 18.4, 49),
  c('mars', '북극관', 'ice', 0, 90, 950),
  c('mars', '남극관', 'ice', 0, -90, 420),
];

for (const [body, features] of [['moon', moon], ['mars', mars]]) {
  const out = `datas/world/worlds/${body}/features.json`;
  writeFileSync(out, JSON.stringify({ features }));
  console.log(`${body}: ${features.length} features → ${out}`);
}
