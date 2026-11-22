#!/usr/bin/env python3
"""ground.svg 의 지명 <text> 를 sector.json labels 로 옮긴다 (1회성 이전 도구, 표준 라이브러리만)

지명은 지도 요소가 아니라 라벨이다 → 다국어로 바꿔 그릴 수 있게 sector.json 에 둔다.
  labels: [{ "text": {"ko": ..}, "at": [x, y], "size": 12, "color"?: "#..", "info"?: {...} }]
  - 위치는 감싼 <g transform> 들을 모두 적용한 지면 로컬 좌표
  - sector.json 의 info[라벨] (도감) 은 같은 라벨 항목의 info 로 합치고 info 는 지운다
사용: python3 apps/center/src/pages/world/tools/move-labels.py   (datas/world/worlds/*/** 전부)
"""
import glob, json, re, xml.etree.ElementTree as ET

NS = '{http://www.w3.org/2000/svg}'
DEFAULT_COLOR = '#7a5a3f'

def mat(t):
    m = [1, 0, 0, 1, 0, 0]
    for fn, args in re.findall(r'(\w+)\(([^)]*)\)', t or ''):
        v = [float(x) for x in re.split(r'[\s,]+', args.strip()) if x]
        if fn == 'matrix': n = v
        elif fn == 'translate': n = [1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0]
        elif fn == 'scale': n = [v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0]
        else: continue
        a, b, c, d, e, f = m
        m = [a * n[0] + c * n[1], b * n[0] + d * n[1], a * n[2] + c * n[3], b * n[2] + d * n[3], a * n[4] + c * n[5] + e, b * n[4] + d * n[5] + f]
    return m

def walk(el, m, inh, out):
    m = mat_mul(m, mat(el.get('transform')))
    inh = {**inh, **{k: el.get(k) for k in ('fill', 'font-size') if el.get(k)}}
    if el.tag == NS + 'text':
        x, y = float(el.get('x', 0)), float(el.get('y', 0))
        out.append({'text': ''.join(el.itertext()).strip(), 'x': m[0] * x + m[2] * y + m[4], 'y': m[1] * x + m[3] * y + m[5],
                    'size': float(inh.get('font-size', 10)) * (abs(m[0]) + abs(m[3])) / 2, 'color': inh.get('fill', DEFAULT_COLOR)})
        return
    for ch in el: walk(ch, m, inh, out)

def mat_mul(a, n):
    return [a[0] * n[0] + a[2] * n[1], a[1] * n[0] + a[3] * n[1], a[0] * n[2] + a[2] * n[3], a[1] * n[2] + a[3] * n[3], a[0] * n[4] + a[2] * n[5] + a[4], a[1] * n[4] + a[3] * n[5] + a[5]]

def main():
    for g in sorted(glob.glob('datas/world/worlds/*/**/ground.svg', recursive=True)):
        src = open(g).read()
        if '<text' not in src: continue
        out = []
        walk(ET.fromstring(src), [1, 0, 0, 1, 0, 0], {}, out)
        sp = g.replace('ground.svg', 'sector.json')
        sj = json.load(open(sp))
        info = sj.pop('info', {})
        labels = []
        for t in out:
            lb = {'text': {'ko': t['text']}, 'at': [round(t['x'], 1), round(t['y'], 1)], 'size': round(t['size'], 1)}
            if t['color'] != DEFAULT_COLOR: lb['color'] = t['color']
            i = info.get(t['text'])
            if i:
                lb['info'] = {'emoji': i.get('emoji'), 'kind': i.get('kind', '지명'), 'title': {'ko': i.get('title', t['text'])}, 'desc': {'ko': i.get('desc', '')}}
            labels.append(lb)
        sj['labels'] = labels
        j = lambda o: json.dumps(o, ensure_ascii=False)
        open(sp, 'w').write('{\n  "local": ' + j(sj['local']) + ',\n  "placements": [\n    ' + ',\n    '.join(j(p) for p in sj['placements'])
                            + '\n  ],\n  "labels": [\n    ' + ',\n    '.join(j(l) for l in labels) + '\n  ]\n}\n')
        # svg 에서 지명 덩어리 제거: <text> 전부, 비게 된 라벨 그룹, '지명' 주석
        s = re.sub(r'[ \t]*<text\b[^>]*>.*?</text>\n?', '', src, flags=re.S)
        s = re.sub(r'[ \t]*<!--\s*지명[^>]*-->\n?', '', s)
        for _ in range(3):
            s = re.sub(r'[ \t]*<g\b[^>]*>\s*</g>\n?', '', s)
        open(g, 'w').write(s)
        print(g.split('worlds/')[1], len(labels), 'labels,', sum(1 for l in labels if 'info' in l), 'with info')

if __name__ == '__main__':
    main()
