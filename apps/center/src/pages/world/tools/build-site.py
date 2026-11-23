#!/usr/bin/env python3
"""달·화성 착륙지 sector 지면 생성기 (1회성 빌드 도구, 표준 라이브러리만)

지구 도시는 OSM 이 있지만 달·화성은 없다 → 실제 지형지물(이름 있는 크레이터·삼각주 절벽)을
착륙선 기준 동·북 거리(m)로 적어 두고, 나머지 작은 크레이터는 시드 고정 난수로 흩뿌린다.

출력 (datas/world/worlds/<world>/<id>/):
  - boundary.json  둥근 경계 (중심에서 반지름 = 영역 절반의 92%, 살짝 물결)
  - ground.svg     지면 (표토 + 크레이터 + 지형) — 끝의 '장식' 주석 아래에 손으로 더 그린다
  - sector.json    없으면 골격, 있으면 local.size 만 맞춘다
  - 표준출력       worlds.json 에 넣을 bounds

사용: python3 build-site.py moon/apollo-11   |   python3 build-site.py mars/jezero
"""
import json, math, os, random, re, sys

SITES = {
    # 티코 (남위 43.37, 서경 11.36, 지름 85km): 젊고 밝은 크레이터, 달 전체로 뻗는 광선
    'moon/tycho': {
        'name': '티코 크레이터', 'radiusKm': 1737.4, 'center': (-11.36, -43.37), 'spanKm': 140, 'seed': 31,
        'palette': {'base': '#d3d1d9', 'spot': '#dedce3', 'dot': '#bebcc7', 'rim': '#e6e4ea', 'floor': '#b9b7c3', 'shade': '#a9a7b4', 'edge': '#8c8a98'},
        'craters': [('티코 크레이터', 0, 0, 85000), ('서베이어 7호', 28000, 12000, 300), ('', -35000, 25000, 9000), ('', 40000, -30000, 12000)],
        'small': 70, 'rays': 60,
    },
    # 코페르니쿠스 (북위 9.62, 서경 20.08, 지름 93km): 계단식 절벽과 중앙 봉우리
    'moon/copernicus': {
        'name': '코페르니쿠스 크레이터', 'radiusKm': 1737.4, 'center': (-20.08, 9.62), 'spanKm': 160, 'seed': 32,
        'palette': {'base': '#d3d1d9', 'spot': '#dedce3', 'dot': '#bebcc7', 'rim': '#e6e4ea', 'floor': '#b9b7c3', 'shade': '#a9a7b4', 'edge': '#8c8a98'},
        'craters': [('코페르니쿠스 크레이터', 0, 0, 93000), ('중앙 봉우리', 3000, -2000, 12000), ('', -45000, 30000, 8000), ('', 50000, -35000, 10000)],
        'small': 70, 'rays': 36,
    },
    # 아폴로 17호 챌린저 착륙 지점 20.19N 30.77E. 쇼티 크레이터(주황색 흙!)는 동쪽 약 300m,
    # LRV 로버로 사우스 매시프까지 다녀옴
    'moon/apollo-17': {
        'name': '타우루스-리트로', 'radiusKm': 1737.4, 'center': (30.77, 20.19), 'spanKm': 1.5, 'seed': 17,
        'palette': {'base': '#d3d1d9', 'spot': '#dedce3', 'dot': '#bebcc7', 'rim': '#e6e4ea', 'floor': '#b9b7c3', 'shade': '#a9a7b4', 'edge': '#8c8a98'},
        'craters': [('쇼티 크레이터', 300, -200, 110), ('스텐오 크레이터', -250, 150, 80), ('', 450, 250, 50)],
        'small': 90,
    },
    # 아폴로 11호 이글 착륙 지점 0.67416N 23.47314E. 웨스트 크레이터(지름 약 180m)는 서쪽 약 400m,
    # 리틀 웨스트(약 30m)는 동쪽 약 60m — 암스트롱이 걸어가 본 가장 먼 곳
    'moon/apollo-11': {        'name': '고요의 기지', 'radiusKm': 1737.4, 'center': (23.47314, 0.67416), 'spanKm': 1.2, 'seed': 11,
        'palette': {'base': '#d3d1d9', 'spot': '#dedce3', 'dot': '#bebcc7', 'rim': '#e6e4ea', 'floor': '#b9b7c3', 'shade': '#a9a7b4', 'edge': '#8c8a98'},
        'craters': [('웨스트 크레이터', -400, 10, 185), ('리틀 웨스트 크레이터', 60, -5, 30), ('', -150, 160, 40), ('', 230, 300, 70), ('', 330, -260, 90), ('', -320, -330, 60)],
        'small': 90,
    },
    # 올림푸스 산 (북위 18.65, 서경 133.8): 태양계 최고 화산, 칼데라 3개 포개짐
    'mars/olympus': {
        'name': '올림푸스 산', 'radiusKm': 3389.5, 'center': (-133.8, 18.65), 'spanKm': 300, 'seed': 41,
        'palette': {'base': '#e2ad86', 'spot': '#ebbd9a', 'dot': '#d39a72', 'rim': '#efc4a2', 'floor': '#cf9670', 'shade': '#bd825d', 'edge': '#9c6446'},
        'craters': [('올림푸스 칼데라', 0, 0, 80000), ('', 22000, 12000, 60000), ('', -18000, -6000, 55000), ('', 60000, -40000, 9000)],
        'small': 60,
    },
    # 게일 크레이터 (남위 4.59, 동경 137.44, 지름 154km): 한가운데 샤프산, 큐리오시티가 오르고 있음
    'mars/gale': {
        'name': '게일 크레이터', 'radiusKm': 3389.5, 'center': (137.44, -4.59), 'spanKm': 150, 'seed': 42,
        'palette': {'base': '#e2ad86', 'spot': '#ebbd9a', 'dot': '#d39a72', 'rim': '#efc4a2', 'floor': '#cf9670', 'shade': '#bd825d', 'edge': '#9c6446'},
        'craters': [('게일 크레이터', 0, 0, 150000), ('브래드버리 착륙지', -12000, 8000, 400), ('', 30000, -25000, 8000)],
        'small': 60,
    },
    # 밸리스 매리너리스 (멜라스 협곡 중심): 태양계 최대 협곡
    'mars/valles-marineris': {
        'name': '밸리스 매리너리스', 'radiusKm': 3389.5, 'center': (-68, -10.5), 'spanKm': 350, 'seed': 43,
        'palette': {'base': '#e2ad86', 'spot': '#ebbd9a', 'dot': '#d39a72', 'rim': '#efc4a2', 'floor': '#cf9670', 'shade': '#bd825d', 'edge': '#9c6446'},
        'craters': [('멜라스 협곡', 0, 0, 20000), ('', -90000, 60000, 15000), ('', 100000, -70000, 12000)],
        'small': 50, 'canyon': {'north': 10000, 'half': 65000},
    },
    # 퍼서비어런스 착륙 지점(옥타비아 E. 버틀러 착륙지) 18.4447N 77.4508E. 서쪽 약 2km 에 옛 강 삼각주 절벽,
    # 남서쪽에 모래 물결 지대(세이타)
    'mars/jezero': {
        'name': '예제로 크레이터', 'radiusKm': 3389.5, 'center': (77.4508, 18.4447), 'spanKm': 5.0, 'seed': 21,
        'palette': {'base': '#e2ad86', 'spot': '#ebbd9a', 'dot': '#d39a72', 'rim': '#efc4a2', 'floor': '#cf9670', 'shade': '#bd825d', 'edge': '#9c6446'},
        'craters': [('', 1100, 650, 400), ('', -600, 900, 120), ('', 700, -900, 160), ('', 300, 400, 60), ('', -200, -500, 80)],
        'small': 70,
        'view_east': -900,  # 장면 중심을 착륙지에서 서쪽 900m 로 (삼각주까지 들어오게)
        'delta': -2050,   # 삼각주 앞 절벽: 착륙지에서 서쪽 m
        'ripples': (-1100, -700, 900),  # 세이타 모래 물결: 중심 동·북 m, 반지름 m
    },
}

def main():
    sid = sys.argv[1]
    cfg = SITES[sid]
    world, local = sid.split('/', 1)
    lonL, lat0 = cfg['center']  # 착륙 지점
    R = cfg['radiusKm']
    lon0 = lonL + math.degrees(cfg.get('view_east', 0) / 1000 / (R * math.cos(math.radians(lat0))))  # 장면 중심
    half = cfg['spanKm'] / 2
    dlat = math.degrees(half / R)
    dlon = math.degrees(half / (R * math.cos(math.radians(lat0))))
    w0, e0, s0, n0 = lon0 - dlon, lon0 + dlon, lat0 - dlat, lat0 + dlat
    W = 960
    H = round(W * (n0 - s0) / ((e0 - w0) * math.cos(math.radians(lat0))))
    upm = W / (cfg['spanKm'] * 1000)  # 로컬 단위 / m
    cx, cy = W / 2 - cfg.get('view_east', 0) * upm, H / 2  # 착륙 지점의 로컬 좌표
    xy = lambda east, north: (round(cx + east * upm, 1), round(cy - north * upm, 1))
    p = cfg['palette']
    rnd = random.Random(cfg['seed'])

    def crater(x, y, r):
        # 위에서 본 크레이터: 밝은 테두리 → 바닥 → 왼쪽 위에서 빛이 와서 오른쪽 아래 안쪽이 그늘
        return (f'    <g><circle cx="{x}" cy="{y}" r="{r * 1.12:.1f}" fill="{p["rim"]}" opacity="0.9"/>'
                f'<circle cx="{x}" cy="{y}" r="{r:.1f}" fill="{p["floor"]}" stroke="{p["edge"]}" stroke-width="{max(0.4, r * 0.03):.2f}" stroke-opacity="0.5"/>'
                f'<circle cx="{x + r * 0.12:.1f}" cy="{y + r * 0.12:.1f}" r="{r * 0.8:.1f}" fill="{p["shade"]}" opacity="0.35"/>'
                f'<circle cx="{x - r * 0.18:.1f}" cy="{y - r * 0.18:.1f}" r="{r * 0.55:.1f}" fill="{p["rim"]}" opacity="0.25"/></g>\n')

    parts, labels = [], []
    for name, e, n, d in cfg['craters']:
        x, y = xy(e, n)
        r = d / 2 * upm
        parts.append(crater(x, y, r))
        if name:
            labels.append((name, x, round(y - r - 8, 1)) if r > 40 else (name, x + 20, round(y + r + 16, 1)))  # 작은 크레이터는 착륙선에 가리지 않게 아래로
    for _ in range(cfg['small']):
        r = rnd.uniform(2, 9) * (1 if rnd.random() < 0.85 else 2)
        parts.append(crater(round(rnd.uniform(0, W), 1), round(rnd.uniform(0, H), 1), r))
    extra = ''
    if 'delta' in cfg:
        # 삼각주 앞 절벽: 서쪽 가장자리를 따라 층진 높은 땅 (부드러운 물결선)
        x0 = cx + cfg['delta'] * upm
        pts = ' '.join(f'L{x0 + 18 * math.sin(i / 3):.1f} {i * H / 20:.1f}' for i in range(21))
        extra += (f'  <!-- 옛 강 삼각주 (서쪽 높은 땅) -->\n  <path d="M-20 -20 L{x0:.1f} -20 {pts} L-20 {H + 20} Z" fill="#c98a62" stroke="{p["edge"]}" stroke-width="1.4"/>\n'
                  + ''.join(f'  <path d="M-20 {y} Q{x0 / 2:.1f} {y - 8} {x0 - 10:.1f} {y + 4}" stroke="#b97a54" stroke-width="2" fill="none" opacity="0.6"/>\n' for y in range(40, H, 70)))
        labels.append(('삼각주', round(x0 / 2, 1), round(cy, 1)))
    if 'ripples' in cfg:
        e, n, rad = cfg['ripples']
        x, y = xy(e, n)
        rr = rad * upm
        extra += f'  <!-- 세이타: 모래 물결 지대 -->\n  <g stroke="#f0caa8" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.8">\n'
        for i in range(-6, 7):
            yy = y + i * rr / 7
            wdt = rr * math.sqrt(max(0, 1 - (i / 7) ** 2))
            extra += f'    <path d="M{x - wdt:.1f} {yy:.1f} q{wdt / 4:.1f} -6 {wdt / 2:.1f} 0 t{wdt / 2:.1f} 0 t{wdt / 2:.1f} 0 t{wdt / 2:.1f} 0"/>\n'
        extra += '  </g>\n'
        labels.append(('세이타', x, round(y - rr * 0.2, 1)))
    if 'rays' in cfg:
        # 밝은 광선 (티코·코페르니쿠스): 중심에서 사방으로 뻗는 가는 줄
        n = cfg['rays']
        extra += '  <!-- 밝은 광선 -->\n  <g stroke="#ffffff" stroke-width="1.6" opacity="0.35" stroke-linecap="round">\n'
        for i in range(n):
            a = 2 * math.pi * (i + 0.5 * ((i * 37) % 3)) / n
            x1, y1 = cx + 40 * math.cos(a), cy + 40 * math.sin(a)
            x2, y2 = cx + 700 * math.cos(a), cy + 700 * math.sin(a)
            extra += f'    <path d="M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}"/>\n'
        extra += '  </g>\n'
    if 'canyon' in cfg:
        # 협곡 (밸리스 매리너리스): 가로로 긴 바닥 + 양쪽 층진 절벽
        yc = cy - cfg['canyon']['north'] * upm
        hw = cfg['canyon']['half'] * upm
        top = ' '.join(f'L{x:.1f} {yc - hw + 14 * math.sin(x / 60):.1f}' for x in range(-20, W + 40, 40))
        bot = ' '.join(f'L{x:.1f} {yc + hw + 14 * math.sin(x / 55 + 2):.1f}' for x in range(-20, W + 40, 40))
        extra += (f'  <!-- 협곡 바닥과 절벽 -->\n  <path d="M-20 {yc - hw:.1f} {top} L{W + 20} {yc - hw:.1f} L{W + 20} {yc + hw:.1f} {bot} L-20 {yc + hw:.1f} Z" fill="{p["floor"]}" opacity="0.85"/>\n'
                  + ''.join(f'  <path d="M-20 {yc - hw + o:.1f} Q{W / 4:.1f} {yc - hw + o - 8:.1f} {W / 2:.1f} {yc - hw + o:.1f} T{W + 20:.1f} {yc - hw + o:.1f}" stroke="{p["edge"]}" stroke-width="1.6" fill="none" opacity="0.45"/>\n' for o in (10, 26, 42))
                  + ''.join(f'  <path d="M-20 {yc + hw - o:.1f} Q{W / 4:.1f} {yc + hw - o + 8:.1f} {W / 2:.1f} {yc + hw - o:.1f} T{W + 20:.1f} {yc + hw - o:.1f}" stroke="{p["edge"]}" stroke-width="1.6" fill="none" opacity="0.45"/>\n' for o in (10, 26, 42)))

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">
  <!-- {cfg['name']} 지면 — tools/build-site.py 로 생성. 로컬 좌표 = bounds [[{w0:.5f},{s0:.5f}],[{e0:.5f},{n0:.5f}]] 등장방형,
       이름 있는 지형은 착륙 지점 기준 실제 거리(m). 1 단위 = {1 / upm:.2f} m -->
  <defs>
    <pattern id="regolith" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="17" cy="15" r="6" fill="{p['spot']}" opacity="0.5"/>
      <circle cx="5" cy="6" r="0.9" fill="{p['dot']}"/><circle cx="12" cy="20" r="0.7" fill="{p['dot']}"/><circle cx="21" cy="4" r="0.6" fill="{p['dot']}"/>
    </pattern>
  </defs>
  <rect x="-20" y="-20" width="{W + 40}" height="{H + 40}" fill="{p['base']}"/>
  <rect x="-20" y="-20" width="{W + 40}" height="{H + 40}" fill="url(#regolith)"/>
{extra}  <!-- 크레이터 -->
  <g>
{''.join(parts)}  </g>

  <!-- ==== 장식 (손으로) ==== -->
  <!-- 지명 (게임 지도 라벨) -->
  <g font-family="'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" font-weight="800" fill="#6f6a7a" text-anchor="middle"
     stroke="#fffaf0" stroke-width="3" paint-order="stroke" stroke-linejoin="round">
{''.join(f'    <text x="{x}" y="{y}" font-size="13">{t}</text>{chr(10)}' for t, x, y in labels)}  </g>
</svg>
'''
    out = os.path.join('datas/world/worlds', world, local)
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, 'ground.svg'), 'w').write(svg)
    # 둥근 경계: 반지름 92%, 각도마다 살짝 물결 (시계 방향 = d3 구면의 안쪽)
    ring = []
    for i in range(73):
        a = -2 * math.pi * i / 72
        k = 0.92 + 0.03 * math.sin(3 * a + 1) + 0.015 * math.sin(7 * a)
        ring.append([round(lon0 + dlon * k * math.cos(a), 6), round(lat0 + dlat * k * math.sin(a), 6)])  # 장면 중심 둘레
    json.dump({'type': 'Feature', 'properties': {'name': cfg['name']}, 'geometry': {'type': 'Polygon', 'coordinates': [ring]}},
              open(os.path.join(out, 'boundary.json'), 'w'), ensure_ascii=False)
    sp = os.path.join(out, 'sector.json')
    if os.path.exists(sp):
        t = open(sp).read()
        open(sp, 'w').write(re.sub(r'"size": \[[^\]]*\]', f'"size": [{W}, {H}]', t, count=1))
    else:
        open(sp, 'w').write('{\n  "local": ' + json.dumps({'size': [W, H], 'ground': 'ground.svg', 'boundary': 'boundary.json'}) + ',\n  "placements": [\n  ]\n}\n')
    print(json.dumps({'id': local, 'bounds': [[round(w0, 5), round(s0, 5)], [round(e0, 5), round(n0, 5)]], 'size': [W, H], 'unitsPerM': round(upm, 4), 'landing': [cx, cy]}, ensure_ascii=False))

if __name__ == '__main__':
    main()
