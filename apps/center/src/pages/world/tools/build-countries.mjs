// Natural Earth 110m 국가 GeoJSON → 가벼운 countries.json (1회성 빌드 도구)
// 사용: curl -sL -o /tmp/ne.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson
//       node apps/center/src/pages/world/tools/build-countries.mjs /tmp/ne.geojson datas/world/worlds/earth/countries.json
import { readFileSync, writeFileSync } from 'node:fs';

const [src, out] = process.argv.slice(2);
const ne = JSON.parse(readFileSync(src, 'utf8'));
const round = (c) => (typeof c[0] === 'number' ? [+c[0].toFixed(2), +c[1].toFixed(2)] : c.map(round));

const features = ne.features.map((f) => ({
  type: 'Feature',
  // ISO_A2 는 프랑스·노르웨이가 -99 라서 _EH 사용
  properties: { iso: f.properties.ISO_A2_EH, name: f.properties.NAME_KO || f.properties.NAME },
  geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
}));

writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`${features.length} countries → ${out}`);
