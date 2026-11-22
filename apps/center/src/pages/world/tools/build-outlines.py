#!/usr/bin/env python3
"""만들어진 지역(local sector)의 경계를 아주 가볍게 줄여 worlds.json 의 outline 으로 넣는다 (표준 라이브러리만)

장면(지면·개체)을 불러오기 전, 날아가는 순간부터 지역의 실루엣을 바로 그리려고 쓴다 (색인과 함께 이미 받아 둔 데이터라 기다림 0).
가장 큰 외곽 고리 하나를 Douglas–Peucker 로 영역 대각선의 1.2% 오차까지 줄인다 (지역당 수십 점).
경계를 바꾸면 다시 돌린다:  python3 apps/center/src/pages/world/tools/build-outlines.py
"""
import json, math

INDEX = 'datas/world/worlds.json'

def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    (ax, ay), (bx, by) = pts[0], pts[-1]
    dx, dy = bx - ax, by - ay
    n = math.hypot(dx, dy) or 1e-12
    i, dm = 0, -1.0
    for k in range(1, len(pts) - 1):
        x, y = pts[k]
        d = abs(dy * x - dx * y + bx * ay - by * ax) / n
        if d > dm:
            i, dm = k, d
    if dm <= eps:
        return [pts[0], pts[-1]]
    return rdp(pts[: i + 1], eps)[:-1] + rdp(pts[i:], eps)

def area(r):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(r, r[1:])) / 2)

def main():
    idx = json.load(open(INDEX))
    for world in idx['worlds']:
        for s in world['sectors']:
            if not s.get('local'):
                continue
            g = json.load(open(f"datas/world/worlds/{world['id']}/{s['id']}/boundary.json"))['geometry']
            rings = [p[0] for p in (g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']])]
            ring = max(rings, key=area)
            (w0, s0), (e0, n0) = s['bounds']
            eps = math.hypot(e0 - w0, n0 - s0) * 0.012
            # 닫힌 고리는 시작점=끝점이라 그대로 줄이면 한 점으로 무너진다 → 시작점에서 가장 먼 점에서 둘로 나눠 줄인다
            far = max(range(len(ring)), key=lambda k: math.hypot(ring[k][0] - ring[0][0], ring[k][1] - ring[0][1]))
            out = rdp(ring[: far + 1], eps)[:-1] + rdp(ring[far:], eps)
            s['outline'] = [[round(x, 4), round(y, 4)] for x, y in out]
            print(world['id'], s['id'], len(ring), '→', len(out))
    open(INDEX, 'w').write(json.dumps(idx, ensure_ascii=False, indent=2) + '\n')

if __name__ == '__main__':
    main()
