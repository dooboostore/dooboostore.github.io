#!/usr/bin/env python3
"""도시 sector 기본 틀 생성기 (1회성 빌드 도구)

실제 데이터로 만든다:
  - 경계: Nominatim(OpenStreetMap) 행정 경계 (여러 개면 합집합 — 예: 도쿄 23구)
  - 물:   OSM natural=water / waterway=riverbank 면(섬은 구멍) + 바다(OSM natural=coastline 으로 가른 면 중 바다 쪽)
          해안선이 없는 면만 Natural Earth 10m 육지로 판정 (10m 은 도시 규모에서 수백 m 씩 틀려 해안선이 우선)
  - 섬 (cfg 'island': 여백 km): 경계 = 해안선으로 만든 섬 + 여백 바다 (행정경계가 바다로 넓게 그어진 독도·울릉도 등)
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
import argparse, json, math, os, re, ssl, sys, time, urllib.error, urllib.parse, urllib.request
from shapely.geometry import shape, box, mapping, Polygon, MultiPolygon, LineString, Point
from shapely.geometry.polygon import orient
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
    'usa/new-york': {'name': '뉴욕', 'queries': ['New York City, New York, United States'], 'roads': 'motorway|trunk', 'min_water_km2': 0.01},
    'korea/busan': {'name': '부산', 'queries': ['Busan, South Korea'], 'roads': 'motorway|trunk', 'min_water_km2': 0.01},
    'korea/jeju': {'name': '제주', 'queries': ['Jeju Island, South Korea'], 'roads': 'motorway|trunk|primary|secondary', 'min_water_km2': 0.01, 'island': 3.5},
    'korea/ulleungdo': {'name': '울릉도', 'queries': ['Ulleungdo, South Korea'], 'roads': 'primary|secondary|tertiary', 'min_water_km2': 0.005, 'island': 0.8},
    'korea/dokdo': {'name': '독도', 'queries': ['Dokdo, South Korea'], 'roads': 'primary', 'min_water_km2': 0.0001, 'island': 0.25, 'simplify': 0.000015},
    'italy/rome': {'name': '로마', 'queries': ['Roma Municipio I, Italy'], 'roads': 'motorway|trunk|primary', 'min_water_km2': 0.005},
    # 카이로: OSM 에 구(qism) 경계가 없어 카이로시 ∪ 기자주 를 피라미드~시타델 사각형으로 자른다 (나일강이 두 행정구역 경계)
    'egypt/cairo': {'name': '카이로', 'queries': ['Cairo Governorate, Egypt', 'Giza Governorate, Egypt'], 'roads': 'motorway|trunk|primary', 'min_water_km2': 0.005,
                    'clip': (31.115, 29.965, 31.275, 30.075), 'palette': 'desert'},
    'australia/sydney': {'name': '시드니', 'queries': ['City of Sydney, Australia'], 'roads': 'motorway|trunk|primary|secondary', 'min_water_km2': 0.005, 'simplify': 0.0001, 'join_water': True},
    'china/beijing': {'name': '베이징', 'queries': ['Dongcheng District, Beijing, China', 'Xicheng District, Beijing, China'], 'roads': 'motorway|trunk|primary', 'min_water_km2': 0.005},
    'turkey/istanbul': {'name': '이스탄불', 'queries': ['Fatih, Istanbul, Turkey', 'Beyoğlu, Istanbul, Turkey', 'Üsküdar, Istanbul, Turkey'], 'roads': 'motorway|trunk|primary', 'min_water_km2': 0.005, 'simplify': 0.0001, 'join_water': True},
    'brazil/rio': {'name': '리우데자네이루', 'queries': ['Botafogo, Rio de Janeiro, Brazil', 'Copacabana, Rio de Janeiro, Brazil', 'Urca, Rio de Janeiro, Brazil', 'Laranjeiras, Rio de Janeiro, Brazil', 'Cosme Velho, Rio de Janeiro, Brazil'], 'roads': 'motorway|trunk', 'min_water_km2': 0.005},
    # 극지: 한국 연구기지 둘레. 행정경계(스발바르는 영해 포함)를 기지 둘레 사각형으로 자르고, 바다 쪽은 join_water 로 이어 붙인다
    'arctic/ny-alesund': {'name': '북극 다산과학기지', 'queries': ['Svalbard, Norway'], 'roads': 'unclassified|service|track', 'min_water_km2': 0.01,
                          'clip': (11.55, 78.86, 12.35, 79.0), 'palette': 'snow', 'simplify': 0.0002},
    'antarctica/king-george': {'name': '남극 세종과학기지', 'queries': ['King George Island'], 'roads': 'unclassified|service|track', 'min_water_km2': 0.01,
                               'clip': (-58.90, -62.27, -58.62, -62.17), 'palette': 'snow', 'coast_margin': 1.2, 'simplify': 0.0002},
    'spain/barcelona': {'name': '바르셀로나', 'queries': ['Barcelona, Spain'], 'roads': 'motorway|trunk', 'min_water_km2': 0.01},
    'germany/berlin': {'name': '베를린', 'queries': ['Berlin, Germany'], 'roads': 'motorway|trunk', 'min_water_km2': 0.01},
    'russia/moscow': {'name': '모스크바', 'queries': ['Moscow, Russia'], 'roads': 'motorway|trunk', 'min_water_km2': 0.01},
    'greece/athens': {'name': '아테네', 'queries': ['Athens, Greece'], 'roads': 'motorway|trunk', 'min_water_km2': 0.01},
    'netherlands/amsterdam': {'name': '암스테르담', 'queries': ['Amsterdam, Netherlands'], 'roads': 'motorway|trunk', 'min_water_km2': 0.005},
    'canada/toronto': {'name': '토론토', 'queries': ['Toronto, Canada'], 'roads': 'motorway|trunk', 'min_water_km2': 0.01},
    'uae/dubai': {'name': '두바이', 'queries': ['Dubai, United Arab Emirates'], 'roads': 'motorway|trunk', 'min_water_km2': 0.01},
    'thailand/bangkok': {'name': '방콕', 'queries': ['Bangkok, Thailand'], 'roads': 'motorway|trunk', 'min_water_km2': 0.005},
    'singapore/singapore': {'name': '싱가포르', 'queries': ['Singapore'], 'roads': 'motorway|trunk', 'min_water_km2': 0.005},
    'mexico/mexico-city': {'name': '멕시코시티', 'queries': ['Mexico City, Mexico'], 'roads': 'motorway|trunk', 'min_water_km2': 0.005},
    'south-africa/cape-town': {'name': '케이프타운', 'queries': ['Cape Town, South Africa'], 'roads': 'motorway|trunk', 'min_water_km2': 0.01},
    'india/agra': {'name': '아그라', 'queries': ['Agra, India'], 'roads': 'motorway|trunk', 'min_water_km2': 0.01},
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

OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
]

def overpass(query):
    data = urllib.parse.urlencode({'data': query}).encode()
    last = None
    for url in OVERPASS:  # 한 곳이 502/429면 다른 미러로
        try:
            res = get(url, data=data)
            if 'error' in (res.get('remark') or ''):  # 시간 초과 등은 200 + 빈 결과로 온다 → 다음 미러
                raise RuntimeError(res['remark'])
            return res
        except Exception as e:
            last = e
    raise last

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

def osm_coast(bb):
    s, w, n, e = bb
    q = f'[out:json][timeout:180]; way["natural"="coastline"]({s},{w},{n},{e}); out geom;'
    return [ring(el['geometry']) for el in overpass(q)['elements'] if 'geometry' in el and len(el['geometry']) >= 2]

def coast_land(area, coasts, ne_land):
    """OSM 해안선으로 area 를 면으로 가르고, 각 면이 육지인지 판정해 육지 합집합을 돌려준다.
    OSM 해안선은 진행 방향 왼쪽이 육지. 면을 반시계(내부가 왼쪽)로 돌렸을 때 그 변이 해안선과 같은 방향이면 육지, 반대면 바다.
    해안선이 닿지 않은 면(먼 내륙·먼 바다)은 Natural Earth 육지 안인지로 판정한다."""
    key = lambda c: (round(c[0], 7), round(c[1], 7))
    edges = set()
    for cs in coasts:
        for a, b in zip(cs, cs[1:]):
            edges.add((key(a), key(b)))
    lines = []
    for cs in coasts:
        g = LineString(cs).intersection(area)
        lines += [l for l in getattr(g, 'geoms', [g]) if isinstance(l, LineString) and not l.is_empty]
    faces = list(polygonize(unary_union(lines + [area.exterior])))
    land = []
    for f in faces:
        f = orient(f, 1)
        verdict = None
        for r in [f.exterior, *f.interiors]:
            cs = [key(c) for c in r.coords]
            for a, b in zip(cs, cs[1:]):
                if (a, b) in edges:
                    verdict = True
                    break
                if (b, a) in edges:
                    verdict = False
                    break
            if verdict is not None:
                break
        if verdict is None:
            verdict = ne_land.contains(f.representative_point())
        if verdict:
            land.append(f)
    return unary_union(land) if land else Polygon()

def osm_roads(bb, levels):
    s, w, n, e = bb
    q = f'[out:json][timeout:180]; way["highway"~"^({levels})$"]["tunnel"!~"yes|building_passage"]({s},{w},{n},{e}); out geom;'
    lines = [LineString(ring(el['geometry'])) for el in overpass(q)['elements'] if 'geometry' in el and len(el['geometry']) >= 2]
    return linemerge(unary_union(lines)) if lines else None

def soften(g):
    """경계를 둥글게: 칼로 자른 듯한 모서리·가시를 없앤다 (힐링 그림체). 반지름 = 영역 긴 변의 1.2%
    닫힘(+r → -r)으로 오목한 곳을, 열림(-r → +r)으로 볼록한 곳을 둥글린다."""
    w, s_, e, n = g.bounds
    r = max(e - w, n - s_) * 0.012
    g = g.buffer(r, quad_segs=8).buffer(-2 * r, quad_segs=8).buffer(r, quad_segs=8)
    return g.simplify(r / 12)

def km2(geom, lat0):
    return geom.area * (111.32 * math.cos(math.radians(lat0))) * 110.57

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--id', required=True)
    ap.add_argument('--land', required=True)
    ap.add_argument('--out', default='datas/world/worlds/earth')
    ap.add_argument('--bbox', help='w,s,e,n — 행정경계 대신 이 사각형으로 장면을 자른다')
    ap.add_argument('--rect', action='store_true', help='--bbox 영역을 그대로 행정경계(사각형)로 쓴다')
    ap.add_argument('--keep-bounds', action='store_true', help='worlds.json 의 bounds 를 그대로 쓰고 ground.svg 의 손 장식을 보존한다')
    a = ap.parse_args()
    cfg = CITIES[a.id]

    boundary = unary_union([nominatim(q) for q in cfg['queries']]).buffer(0.0004).buffer(-0.0004).simplify(0.0006)
    if boundary.geom_type == 'MultiPolygon':  # 행정구역 데이터에 섞인 먼 조각 (예: 시청구 관계에 딸린 톈진 쪽 면) 버림
        main_part = max(boundary.geoms, key=lambda q: q.area)
        boundary = unary_union([q for q in boundary.geoms if q.distance(main_part) < 0.1])
    if cfg.get('clip'):  # OSM 에 하위 행정구역이 없는 도시: 행정경계 ∩ 중심 사각형 (바깥 변 일부가 직선이 된다)
        boundary = boundary.intersection(box(*cfg['clip']))
        if cfg.get('coast_margin'):  # 사각형으로 자른 섬: 해안을 따라 여백 바다만 붙인다 (직선으로 바다를 가르지 않게)
            boundary = boundary.buffer(cfg['coast_margin'] / 111.0, quad_segs=12).intersection(box(*cfg['clip']))
            if boundary.geom_type == 'MultiPolygon':  # 사각형 모서리에 걸린 다른 반도 조각은 버린다
                boundary = max(boundary.geoms, key=lambda q: q.area)
    if a.keep_bounds:  # 이미 손으로 장식한 sector: worlds.json 의 bounds 그대로 (장식 좌표 유지)
        meta = next(x for x in json.load(open('datas/world/worlds.json'))['worlds'] if x['id'] == 'earth')
        (w0, s0), (e0, n0) = next(x for x in meta['sectors'] if x['id'] == a.id)['bounds']
    elif a.bbox:  # 도시 중심만 네모로 자를 때 (행정구역이 길쭉한 경우)
        w0, s0, e0, n0 = [float(v) for v in a.bbox.split(',')]
        if a.rect:
            boundary = Polygon(list(box(w0, s0, e0, n0).exterior.coords)[::-1])  # d3 구면 권선 방향
    else:
        w0, s0, e0, n0 = boundary.bounds
    if cfg.get('island') and not a.keep_bounds:  # 섬: 해안선 둘레로 다시 자른다 (여백 바다 포함)
        m = cfg['island'] / 111.0
        w0, s0, e0, n0 = w0 - m * 2, s0 - m * 2, e0 + m * 2, n0 + m * 2
    if not a.keep_bounds and not a.bbox:
        pw, ph = (e0 - w0) * 0.03, (n0 - s0) * 0.03
        w0, s0, e0, n0 = round(w0 - pw, 4), round(s0 - ph, 4), round(e0 + pw, 4), round(n0 + ph, 4)
    lat0 = (s0 + n0) / 2
    W = 960
    H = round(W * (n0 - s0) / ((e0 - w0) * math.cos(math.radians(lat0))))
    area = box(w0, s0, e0, n0)
    big = area.buffer(0.02, join_style=2)

    ne = unary_union([shape(f['geometry']).intersection(big.buffer(0.2)) for f in json.load(open(a.land))['features'] if shape(f['geometry']).intersects(big)])
    coasts = osm_coast((s0 - 0.02, w0 - 0.02, n0 + 0.02, e0 + 0.02))
    land = coast_land(big, coasts, ne) if coasts else ne
    if cfg.get('island'):  # 경계 = 섬(해안선) + 여백. 행정경계 쪽 섬만 (먼 섬 제외)
        m = cfg['island'] / 111.0
        isl = [p for p in getattr(land, 'geoms', [land]) if p.distance(boundary) < m]
        boundary = orient(unary_union(isl).buffer(m, quad_segs=12).simplify(m / 20), -1)
        boundary = boundary if boundary.geom_type == 'Polygon' else unary_union([orient(p, -1) for p in boundary.geoms])
    sea = big.difference(land)
    if cfg.get('join_water'):  # 바다로 떨어진 여러 구(이스탄불: 해협 양안)를 그 사이 바다까지 한 장면으로
        boundary = unary_union([boundary, boundary.convex_hull.intersection(sea)]).buffer(0.0005).buffer(-0.0005).simplify(0.0003)
        boundary = max(boundary.geoms, key=lambda q: q.area) if boundary.geom_type == 'MultiPolygon' else boundary
    water = [p for p in osm_water((s0, w0, n0, e0)) if km2(p, lat0) >= cfg['min_water_km2']]
    allwater = unary_union([sea] + water).intersection(big).simplify(cfg.get('simplify', 0.00035))
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
    # 땅 색: 기본 잔디, 'desert' 는 모래땅 (카이로) — 물가는 녹지 띠 (나일 강변 경작지)
    pal = {'grass': {'base': '#b3de92', 'spot': '#c3e8a2', 'blade': '#86c069', 'dot': '#ffc4d6', 'bank': '#cdeead'},
           'snow': {'base': '#eef5f8', 'spot': '#ffffff', 'blade': '#c6dbe6', 'dot': '#dcebf4', 'bank': '#e2eef4'},
           'desert': {'base': '#ecdcb4', 'spot': '#f4e8c8', 'blade': '#c9ad7a', 'dot': '#e8c99a', 'bank': '#b9de98'}}[cfg.get('palette', 'grass')]
    out_dir = os.path.join(a.out, a.id)
    # --keep-bounds: 기존 ground.svg 의 손 장식(마커 주석 다음 ~ </svg>)을 그대로 이어 붙인다
    deco = ''
    gp = os.path.join(out_dir, 'ground.svg')
    if a.keep_bounds and os.path.exists(gp):
        old = open(gp).read()
        mark = '<!-- ==== 도시 장식 (손으로: 산·공원·광장·지명 라벨 등, 그림체 가이드 §8.6) ==== -->'
        deco = old[old.index(mark) + len(mark):old.rindex('</svg>')].lstrip('\n')
    os.makedirs(out_dir, exist_ok=True)
    boundary = soften(boundary)
    boundary = orient(boundary, -1) if boundary.geom_type == 'Polygon' else MultiPolygon([orient(q, -1) for q in boundary.geoms])  # d3 구면: 시계 방향 = 안쪽
    gb = mapping(boundary)
    json.dump({'type': 'Feature', 'properties': {'name': cfg['name'], 'source': 'OpenStreetMap (Nominatim), simplified'}, 'geometry': {
        'type': gb['type'], 'coordinates': json.loads(json.dumps(gb['coordinates']), parse_float=lambda v: round(float(v), 4))}},
        open(os.path.join(out_dir, 'boundary.json'), 'w'), ensure_ascii=False)

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">
  <!-- {cfg['name']} 지면 — tools/build-city.py 로 생성한 기본 틀 + 아래 '도시 장식' 손그림.
       로컬 좌표 = bounds [[{w0},{s0}],[{e0},{n0}]] 등장방형. 물: OSM 수면 + Natural Earth 10m 바다. 도로: OSM ({cfg['roads']}) -->
  <defs>
    <pattern id="grass" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="16" cy="16" r="6" fill="{pal['spot']}" opacity="0.45"/>
      <path d="M3 8 l1.2 -2.4 l1.2 2.4 M11 17 l1 -2 l1 2 M17 5 l0.9 -1.8 l0.9 1.8" stroke="{pal['blade']}" stroke-width="0.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="8" cy="13" r="0.7" fill="#fff8d6"/>
      <circle cx="19.5" cy="11" r="0.6" fill="{pal['dot']}"/>
    </pattern>
    <pattern id="ripple" width="30" height="22" patternUnits="userSpaceOnUse">
      <path d="M4 8 q3 -2.4 6 0 q3 2.4 6 0 M17 18 q2.4 -2 4.8 0 q2.4 2 4.8 0" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1" fill="none" stroke-linecap="round"/>
    </pattern>
  </defs>
  <rect x="-20" y="-20" width="{W + 40}" height="{H + 40}" fill="{pal['base']}"/>
  <rect x="-20" y="-20" width="{W + 40}" height="{H + 40}" fill="url(#grass)"/>

  <!-- 물 (강·호수·바다): 공원 녹지 → 외곽선 → 모래 → 물(+물거품 테두리) → 잔물결 -->
  <g stroke-linejoin="round" stroke-linecap="round">
    <path d="{wd}" fill="{pal['bank']}" stroke="{pal['bank']}" stroke-width="14" fill-rule="evenodd"/>
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
{deco}</svg>
'''
    open(os.path.join(out_dir, 'ground.svg'), 'w').write(svg)
    sp = os.path.join(out_dir, 'sector.json')
    if os.path.exists(sp):  # 이미 있으면 size 만 새 지면에 맞춘다 (다르면 장면 좌표가 어긋난다)
        t = open(sp).read()
        t2 = re.sub(r'"size": \[[^\]]*\]', f'"size": [{W}, {H}]', t, count=1)
        if t2 != t:
            open(sp, 'w').write(t2)
            print('sector.json size 갱신 → 배치 좌표 확인 필요', file=sys.stderr)
    else:
        open(sp, 'w').write('{\n  "local": ' + json.dumps({'size': [W, H], 'ground': 'ground.svg', 'boundary': 'boundary.json'}) + ',\n  "placements": [\n  ]\n}\n')
    print(json.dumps({'id': a.id, 'name': cfg['name'], 'bounds': [[w0, s0], [e0, n0]], 'size': [W, H],
                      'center': [round((w0 + e0) / 2, 4), round((s0 + n0) / 2, 4)], 'water_polys': len(water), 'svg_kb': round(len(svg) / 1024)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
