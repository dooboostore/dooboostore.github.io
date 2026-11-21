// 경위도 → sector 로컬 좌표 변환 도구 (도시 하나 만들 때 씀)
// 로컬 좌표: bounds [[서경, 남위], [동경, 북위]] 를 size [W, H] 사각형에 등장방형으로 펼침 (북쪽이 위)
// 엔진(WorldPage)도 같은 bounds 로 장면을 지구본 위에 올리므로 여기서 계산한 좌표가 실제 위치와 맞는다.
//
// 사용:
//   node geo-local.mjs size  <서경> <남위> <동경> <북위> [W]        → 비율 맞춘 size 출력
//   node geo-local.mjs point <bounds.json> lon,lat lon,lat ...       → 로컬 좌표
//   node geo-local.mjs line  <bounds.json> <geojson> [name]          → 부드러운 SVG path (LineString)
//   첫 인자: sector id (레포 루트에서, 예: earth/france/paris) 또는 { "bounds": [[w,s],[e,n]], "size": [W,H] } json 파일
import { readFileSync } from 'node:fs';

const [cmd, ...a] = process.argv.slice(2);
const r2 = (v) => Math.round(v * 10) / 10;

export const sizeFor = (w, s, e, n, W = 960) => {
  const lat0 = ((s + n) / 2) * (Math.PI / 180);
  return [W, Math.round((W * (n - s)) / ((e - w) * Math.cos(lat0)))];
};
export const toLocal = ({ bounds: [[w, s], [e, n]], size: [W, H] }) => ([lon, lat]) => [r2(((lon - w) / (e - w)) * W), r2(((n - lat) / (n - s)) * H)];

// Catmull-Rom → 3차 베지어: 거친 실측 점을 부드러운 곡선으로
export const smoothPath = (pts) => {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [r2(p1[0] + (p2[0] - p0[0]) / 6), r2(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [r2(p2[0] - (p3[0] - p1[0]) / 6), r2(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1} ${c2} ${p2}`;
  }
  return d.replace(/,/g, ' ');
};

// 인자: {bounds,size} json 파일 경로, 또는 sector id (예: earth/france/paris) — worlds.json 의 bounds + sector.json 의 size
const loadLocal = (f) => {
  if (!f.endsWith('.json')) {
    const [world, ...rest] = f.split('/');
    const id = rest.join('/');
    const meta = JSON.parse(readFileSync('datas/world/worlds.json', 'utf8')).worlds.find((x) => x.id === world).sectors.find((x) => x.id === id);
    const size = JSON.parse(readFileSync(`datas/world/worlds/${world}/${id}/sector.json`, 'utf8')).local.size;
    return { bounds: meta.bounds, size };
  }
  const j = JSON.parse(readFileSync(f, 'utf8'));
  return j.local ?? j;
};

if (cmd === 'size') console.log(JSON.stringify(sizeFor(...a.map(Number))));
if (cmd === 'point') {
  const f = toLocal(loadLocal(a[0]));
  a.slice(1).forEach((p) => console.log(p, '→', JSON.stringify(f(p.split(',').map(Number)))));
}
if (cmd === 'line') {
  const f = toLocal(loadLocal(a[0]));
  const gj = JSON.parse(readFileSync(a[1], 'utf8'));
  const feats = gj.features ?? [gj];
  const feat = a[2] ? feats.find((x) => Object.values(x.properties ?? {}).includes(a[2])) : feats[0];
  const lines = feat.geometry.type === 'LineString' ? [feat.geometry.coordinates] : feat.geometry.coordinates;
  lines.forEach((l) => console.log(smoothPath(l.map(f))));
}
