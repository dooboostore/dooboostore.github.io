#!/usr/bin/env python3
"""도시 sector 기본 틀 생성기 (1회성 빌드 도구)

실제 데이터로 만든다:
  - 경계: Nominatim(OpenStreetMap) 행정 경계 (여러 개면 합집합 — 예: 도쿄 23구)
  - 물:   OSM natural=water / waterway=riverbank 면(섬은 구멍) + 바다(영역 − Natural Earth 10m 육지)
  - 도로: OSM highway (도시마다 등급 지정), data-zone="road"
출력 (datas/world/worlds/earth/<id>/):
  - boundary.json  경계 GeoJSON
  - ground.svg     지면 기본 틀 (잔디 + 물 + 도로, 그림체 가이드 §8.6 스타일). 끝의 '도시 장식' 주석 아래에 손으로 그린다
  - sector.json    없을 때만 골격 생성 (local.size / ground / boundary, placements: [])
  - 표준출력       worlds.json 에 넣을 bounds 와 size

필요: shapely (예: python3 -m venv venv && venv/bin/pip install shapely)
      Natural Earth 10m land geojson 경로 (--land)
사용: venv/bin/python build-city.py --id japan/tokyo --land ne_10m_land.json
요청은 Nominatim 정책에 맞춰 1초 간격, 일반 User-Agent 로 보낸다.
"""
import argparse, json, math, os, ssl, sys, time, urllib.error, urllib.parse, urllib.request
from shapely.geometry import shape, box, mapping, Polygon, MultiPolygon, LineString
from shapely.ops import unary_union, polygonize, linemerge

UA = 'small-world-map-builder/1.0 (static site build tool)'
try:  # macOS python.org 빌드는 시스템 인증서를 못 찾는다 → certifi 가 있으면 사용
    import certifi
    SSL = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL = None

CITIES = {
    'japan/tokyo': {'name': '도쿄', 'queries': [f'{w}, Tokyo, Japan' for w in [
        'Chiyoda', 'Chuo', 'Minato', 'Shinjuku', 'Bunkyo', 'Taito', 'Sumida', 'Koto', 'Shinagawa', 'Meguro', 'Ota', 'Setagaya',
        'Shibuya', 'Nakano', 'Suginami', 'Toshima', 'Kita', 'Arakawa', 'Itabashi', 'Nerima', 'Adachi', 'Katsushika', 'Edogawa']],
        'roads': 'motorway|trunk', 'min_water_km2': 0.05},
    'france/paris': {'name': '파리', 'queries': ['Paris, Île-de-France, France'], 'roads': 'motorway|trunk|primary', 'min_water_km2': 0.01},
    'uk/london': {'name': '런던', 'queries': ['Greater London, England'], 'roads': 'motorway|trunk', 'min_water_km2': 0.08},
    'usa/washington': {'name': '워싱턴 D.C.', 'queries': ['District of Columbia, United States'], 'roads': 'motorway|trunk|primary', 'min_water_km2': 0.01},
}

def get(url, data=None, tries=5):
    for t in range(tries):  # Overpass 는 붐비면 429/502/504 — 기다렸다 다시
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=180, context=SSL) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code not in (429, 502, 503, 504) or t == tries - 1:
                raise
            time.sleep(15 * (t + 1))

def nominatim(q):
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': q, 'format': 'json', 'polygon_geojson': 1, 'limit': 1})
    res = get(url)
    time.sleep(1.1)
    if not res or res[0]['geojson']['type'] not in ('Polygon', 'MultiPolygon'):
        sys.exit(f'경계 없음: {q}')
    return shape(res[0]['geojson'])

def overpass(query):
    return get('https://overpass-api.de/api/interpreter', data=urllib.parse.urlencode({'data': query}).encode())

def ring(geom):
    return [(p['lon'], p['lat']) for p in geom]

def osm_water(bb):
    s, w, n, e = bb
    q = f'''[out:json][timeout:180];
    (way["natural"="water"]({s},{w},{n},{e}); relation["natural"="water"]({s},{w},{n},{e});
     way["waterway"="riverbank"]({s},{w},{n},{e}); relation["waterway"="riverbank"]({s},{w},{n},{e}););
    out geom;'''
    polys = []
    for el in overpass(q)['elements']:
        if el['type'] == 'way' and 'geometry' in el and len(el['geometry']) >= 4 and el['geometry'][0] == el['geometry'][-1]:
            polys.append(Polygon(ring(el['geometry'])))
        elif el['type'] == 'relation':
            outer = [LineString(ring(m['geometry'])) for m in el.get('members', []) if m.get('role') == 'outer' and 'geometry' in m]
            inner = [LineString(ring(m['geometry'])) for m in el.get('members', []) if m.get('role') == 'inner' and 'geometry' in m]
            o = unary_union(list(polygonize(linemerge(outer)))) if outer else None
            if o is None or o.is_empty:
                continue
            i = unary_union(list(polygonize(linemerge(inner)))) if inner else None
            polys.append(o.difference(i) if i is not None and not i.is_empty else o)
    return [p.buffer(0) for p in polys if p.is_valid or p.buffer(0).is_valid]

def osm_roads(bb, levels):
    s, w, n, e = bb
    q = f'[out:json][timeout:180]; way["highway"~"^({levels})$"]({s},{w},{n},{e}); out geom;'
    lines = [LineString(ring(el['geometry'])) for el in overpass(q)['elements'] if 'geometry' in el and len(el['geometry']) >= 2]
    return linemerge(unary_union(lines)) if lines else None

def km2(geom, lat0):
    return geom.area * (111.32 * math.cos(math.radians(lat0))) * 110.57

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--id', required=True)
    ap.add_argument('--land', required=True)
    ap.add_argument('--out', default='datas/world/worlds/earth')
    a = ap.parse_args()
    cfg = CITIES[a.id]

    boundary = unary_union([nominatim(q) for q in cfg['queries']]).buffer(0.0004).buffer(-0.0004).simplify(0.0006)
    w0, s0, e0, n0 = boundary.bounds
    pw, ph = (e0 - w0) * 0.03, (n0 - s0) * 0.03
    w0, s0, e0, n0 = round(w0 - pw, 3), round(s0 - ph, 3), round(e0 + pw, 3), round(n0 + ph, 3)
    lat0 = (s0 + n0) / 2
    W = 960
    H = round(W * (n0 - s0) / ((e0 - w0) * math.cos(math.radians(lat0))))
    area = box(w0, s0, e0, n0)

    land = unary_union([shape(f['geometry']).intersection(area.buffer(0.2)) for f in json.load(open(a.land))['features'] if shape(f['geometry']).intersects(area)])
    sea = area.buffer(0.05).difference(land)
    water = [p for p in osm_water((s0, w0, n0, e0)) if km2(p, lat0) >= cfg['min_water_km2']]
    allwater = unary_union([sea] + water).intersection(area.buffer(0.02)).simplify(0.00035)
    roads = osm_roads((s0, w0, n0, e0), cfg['roads'])

    def xy(lon, lat):
        return f'{(lon - w0) / (e0 - w0) * W:.1f} {(n0 - lat) / (n0 - s0) * H:.1f}'

    def poly_d(g):
        d = ''
        for p in (g.geoms if hasattr(g, 'geoms') else [g]):
            if not isinstance(p, Polygon) or p.is_empty:
                continue
            for r in [p.exterior, *p.interiors]:
                cs = list(r.coords)
                d += 'M' + 'L'.join(xy(*c) for c in cs) + 'Z'
        return d

    def line_d(g):
        if g is None:
            return ''
        d = ''
        for l in (g.geoms if hasattr(g, 'geoms') else [g]):
            l = l.intersection(area.buffer(0.01)).simplify(0.0004)
            for seg in (l.geoms if hasattr(l, 'geoms') else [l]):
                if isinstance(seg, LineString) and seg.length * 111 > 0.6:
                    d += 'M' + 'L'.join(xy(*c) for c in seg.coords)
        return d

    wd, rd = poly_d(allwater), line_d(roads)
    out_dir = os.path.join(a.out, a.id)
    os.makedirs(out_dir, exist_ok=True)
    gb = mapping(boundary)
    json.dump({'type': 'Feature', 'properties': {'name': cfg['name'], 'source': 'OpenStreetMap (Nominatim), simplified'}, 'geometry': {
        'type': gb['type'], 'coordinates': json.loads(json.dumps(gb['coordinates']), parse_float=lambda v: round(float(v), 4))}},
        open(os.path.join(out_dir, 'boundary.json'), 'w'), ensure_ascii=False)

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">
  <!-- {cfg['name']} 지면 — tools/build-city.py 로 생성한 기본 틀 + 아래 '도시 장식' 손그림.
       로컬 좌표 = bounds [[{w0},{s0}],[{e0},{n0}]] 등장방형. 물: OSM 수면 + Natural Earth 10m 바다. 도로: OSM ({cfg['roads']}) -->
  <defs>
    <pattern id="grass" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="16" cy="16" r="6" fill="#c3e8a2" opacity="0.45"/>
      <path d="M3 8 l1.2 -2.4 l1.2 2.4 M11 17 l1 -2 l1 2 M17 5 l0.9 -1.8 l0.9 1.8" stroke="#86c069" stroke-width="0.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="8" cy="13" r="0.7" fill="#fff8d6"/>
      <circle cx="19.5" cy="11" r="0.6" fill="#ffc4d6"/>
    </pattern>
    <pattern id="ripple" width="30" height="22" patternUnits="userSpaceOnUse">
      <path d="M4 8 q3 -2.4 6 0 q3 2.4 6 0 M17 18 q2.4 -2 4.8 0 q2.4 2 4.8 0" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1" fill="none" stroke-linecap="round"/>
    </pattern>
  </defs>
  <rect x="-20" y="-20" width="{W + 40}" height="{H + 40}" fill="#b3de92"/>
  <rect x="-20" y="-20" width="{W + 40}" height="{H + 40}" fill="url(#grass)"/>

  <!-- 물 (강·호수·바다): 공원 녹지 → 외곽선 → 모래 → 물(+물거품 테두리) → 잔물결 -->
  <g stroke-linejoin="round" stroke-linecap="round">
    <path d="{wd}" fill="#cdeead" stroke="#cdeead" stroke-width="14" fill-rule="evenodd"/>
    <path d="{wd}" fill="#f3e4bf" stroke="#5b4636" stroke-width="7.2" fill-rule="evenodd"/>
    <path d="{wd}" fill="#f3e4bf" stroke="#f3e4bf" stroke-width="5.6" fill-rule="evenodd"/>
    <path d="{wd}" fill="#7cc6ea" stroke="#ffffff" stroke-width="1.6" fill-rule="evenodd" data-zone="water"/>
    <path d="{wd}" fill="url(#ripple)" fill-rule="evenodd"/>
  </g>

  <!-- 큰 도로 -->
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="{rd}" stroke="#5b4636" stroke-width="5.6"/>
    <path d="{rd}" stroke="#ece6da" stroke-width="4.2" data-zone="road"/>
    <path d="{rd}" stroke="#ffffff" stroke-width="0.6" stroke-dasharray="4 4"/>
  </g>

  <!-- ==== 도시 장식 (손으로: 산·공원·광장·지명 라벨 등, 그림체 가이드 §8.6) ==== -->
</svg>
'''
    open(os.path.join(out_dir, 'ground.svg'), 'w').write(svg)
    sp = os.path.join(out_dir, 'sector.json')
    if not os.path.exists(sp):
        open(sp, 'w').write('{\n  "local": ' + json.dumps({'size': [W, H], 'ground': 'ground.svg', 'boundary': 'boundary.json'}) + ',\n  "placements": [\n  ]\n}\n')
    print(json.dumps({'id': a.id, 'name': cfg['name'], 'bounds': [[w0, s0], [e0, n0]], 'size': [W, H],
                      'center': [round((w0 + e0) / 2, 4), round((s0 + n0) / 2, 4)], 'water_polys': len(water), 'svg_kb': round(len(svg) / 1024)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
