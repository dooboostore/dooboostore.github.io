// SMIL(<animate>/<animateTransform>/<animateMotion>) → CSS @keyframes 로 바꾸는 1회성 도구
// 왜: 우리 엔진(심볼·use·그림자 DOM) 안에서 Safari 가 일부 SMIL 을 돌리지 않았다 → 모든 브라우저에서 같게 도는 CSS animation 으로.
//   - 각 svg 안에 <style> 을 넣고, 애니메이션 대상 요소에 class 를 붙인다. 키프레임 이름은 파일 경로 해시로 겹치지 않게
//   - animateTransform translate/scale/rotate(중심 포함)/skewX/skewY → transform 키프레임 (transform-box: view-box · origin 0 0 = SVG transform 과 같은 좌표)
//   - animate opacity/fill/stroke-dashoffset/r/cx/cy/rx/ry → 같은 이름 CSS 속성
//   - animate d (모양 바꾸기) → CSS d 는 Safari 가 안 되므로 값마다 path 를 겹쳐 두고 opacity 로 번갈아 보이게 (계단식)
//   - animateMotion → 경로를 길이 기준 24 점으로 잘라 translate 키프레임 (rotate="auto" 면 방향도)
//   - calcMode=spline + keySplines → 구간별 cubic-bezier, discrete → steps(1, end), begin → animation-delay
// 경로 길이 계산(animateMotion)에 브라우저가 필요해서 WebKit(playwright) 안에서 돌린다.
// 사용: node apps/center/src/pages/world/tools/smil-to-css.mjs [파일...]   (인자 없으면 datas/world 아래 SMIL 쓰는 svg 전부)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(path.resolve('packages/@dooboostore/simple-web-component/package.json'));
const pw = require('playwright');

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = process.argv.slice(2).length ? process.argv.slice(2) : walk('datas/world').filter((f) => f.endsWith('.svg') && /<animate/.test(fs.readFileSync(f, 'utf8')));

const browser = await pw.webkit.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><body></body>');

let total = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const hash = [...f].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
  const res = await page.evaluate(({ src, hash }) => {
    const NS = 'http://www.w3.org/2000/svg';
    const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
    const svg = doc.documentElement;
    // getPointAtLength 를 쓰려면 문서에 붙어 있어야 한다
    const host = document.createElementNS(NS, 'svg');
    document.body.appendChild(host);
    const num = (s) => s.trim().split(/[\s,]+/).map(Number);
    const secs = (v) => (v == null ? 0 : v.endsWith('ms') ? parseFloat(v) / 1000 : parseFloat(v));
    const rules = [];
    const keyframes = [];
    const perEl = new Map(); // 대상 요소 → [{ prop: 'transform'|..., anim: 'name dur ...' }]
    let n = 0;
    const timing = (a, count) => {
      const mode = a.getAttribute('calcMode');
      if (mode === 'discrete') return Array(count).fill('steps(1, end)');
      if (mode === 'spline' && a.getAttribute('keySplines')) return a.getAttribute('keySplines').split(';').map((s) => `cubic-bezier(${num(s).join(', ')})`);
      return Array(count).fill('linear');
    };
    const animProps = (a) => {
      const dur = secs(a.getAttribute('dur') ?? '1s');
      const rc = a.getAttribute('repeatCount');
      const iter = rc === 'indefinite' || a.getAttribute('repeatDur') === 'indefinite' ? 'infinite' : rc ?? '1';
      const begin = secs((a.getAttribute('begin') ?? '0s').split(';')[0]);
      return `${dur}s linear ${begin}s ${iter}${a.getAttribute('fill') === 'freeze' ? ' both' : ''}`;
    };
    const valuesOf = (a) => {
      if (a.getAttribute('values')) return a.getAttribute('values').split(';').map((s) => s.trim()).filter((s) => s !== '');
      const from = a.getAttribute('from'), to = a.getAttribute('to');
      if (from != null && to != null) return [from, to];
      if (to != null) return [null, to];
      return [];
    };
    const times = (a, len) => {
      const kt = a.getAttribute('keyTimes');
      if (kt) return kt.split(';').map(Number);
      return Array.from({ length: len }, (_, i) => (len === 1 ? 0 : i / (len - 1)));
    };
    const pct = (t) => `${+(t * 100).toFixed(3)}%`;
    const tf = (type, v) => {
      const a = num(v);
      if (type === 'translate') return `translate(${a[0] || 0}px, ${a[1] || 0}px)`;
      if (type === 'scale') return `scale(${a[0]}, ${a.length > 1 ? a[1] : a[0]})`;
      if (type === 'rotate') return a.length >= 3 ? `translate(${a[1]}px, ${a[2]}px) rotate(${a[0]}deg) translate(${-a[1]}px, ${-a[2]}px)` : `translate(0px, 0px) rotate(${a[0]}deg) translate(0px, 0px)`;
      if (type === 'skewX') return `skewX(${a[0]}deg)`;
      if (type === 'skewY') return `skewY(${a[0]}deg)`;
      return 'none';
    };
    const kfs = (name, frames, tim) => keyframes.push(`@keyframes ${name}{${frames.map(([t, body], i) => `${pct(t)}{${body}${i < frames.length - 1 && tim[i] !== 'linear' ? `;animation-timing-function:${tim[i]}` : ''}}`).join('')}}`);
    const addTo = (el, prop, anim) => {
      if (!perEl.has(el)) perEl.set(el, []);
      perEl.get(el).push({ prop, anim });
    };
    // 요소 하나에 transform 애니메이션이 둘 이상이면(덧붙이기) 안쪽에 g 를 하나씩 더 만들어 나눠 건다
    const wrapIfBusy = (el) => {
      const list = perEl.get(el) ?? [];
      if (!list.some((x) => x.prop === 'transform')) return el;
      const g = doc.createElementNS(NS, 'g');
      while (el.firstChild) g.appendChild(el.firstChild);
      el.appendChild(g);
      return g;
    };
    const anims = [...svg.querySelectorAll('animate, animateTransform, animateMotion, set')];
    for (const a of anims) {
      const target = a.getAttribute('href') || a.getAttribute('xlink:href') ? svg.querySelector(a.getAttribute('href') || a.getAttribute('xlink:href')) : a.parentElement;
      a.remove();
      if (!target) continue;
      const name = `s${hash}_${n++}`;
      const tag = a.localName;
      if (tag === 'animateTransform') {
        const type = a.getAttribute('type') ?? 'translate';
        const vals = valuesOf(a);
        if (!vals.length) continue;
        if (vals[0] == null) vals[0] = type === 'scale' ? '1' : '0';
        const ts = times(a, vals.length);
        kfs(name, vals.map((v, i) => [ts[i], `transform:${tf(type, v)}`]), timing(a, vals.length - 1));
        const el = a.getAttribute('additive') === 'sum' ? wrapIfBusy(target) : target;
        addTo(el, 'transform', `${name} ${animProps(a)}`);
      } else if (tag === 'animateMotion') {
        const mp = a.querySelector('mpath');
        const d = a.getAttribute('path') ?? (mp ? svg.querySelector(mp.getAttribute('href'))?.getAttribute('d') : null);
        if (!d) continue;
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', d);
        host.appendChild(p);
        const L = p.getTotalLength();
        const N = 24;
        const auto = /auto/.test(a.getAttribute('rotate') ?? '');
        const frames = Array.from({ length: N + 1 }, (_, i) => {
          const q = p.getPointAtLength((L * i) / N);
          const q2 = p.getPointAtLength(Math.min(L, (L * i) / N + 0.5));
          const ang = auto ? (Math.atan2(q2.y - q.y, q2.x - q.x) * 180) / Math.PI : 0;
          return [i / N, `transform:translate(${+q.x.toFixed(2)}px, ${+q.y.toFixed(2)}px)${auto ? ` rotate(${+ang.toFixed(1)}deg)` : ''}`];
        });
        kfs(name, frames, Array(N).fill('linear'));
        addTo(wrapIfBusy(target), 'transform', `${name} ${animProps(a)}`);
      } else if (tag === 'animate' && a.getAttribute('attributeName') === 'd') {
        // 모양 바꾸기: 값마다 path 를 겹쳐 두고 차례로 보이게 (CSS d 는 Safari 가 지원하지 않는다)
        const vals = valuesOf(a).filter((v) => v != null);
        const ts = times(a, vals.length);
        const dur = secs(a.getAttribute('dur') ?? '1s');
        const begin = secs((a.getAttribute('begin') ?? '0s').split(';')[0]);
        const uniq = [...new Set(vals)];
        uniq.forEach((v, k) => {
          const copy = target.cloneNode(true);
          copy.querySelectorAll('animate, animateTransform').forEach((x) => x.remove());
          copy.setAttribute('d', v);
          copy.removeAttribute('id');
          const nm = `${name}_${k}`;
          // 이 모양이 보이는 구간: 같은 값을 가진 keyTime 들 근처
          const frames = [];
          vals.forEach((vv, i) => frames.push([ts[i], `opacity:${vv === v ? 1 : 0}`]));
          kfs(nm, frames, Array(frames.length - 1).fill('linear'));
          copy.setAttribute('class', `${copy.getAttribute('class') ?? ''} ${nm}`.trim());
          rules.push(`.${nm}{animation:${nm} ${dur}s linear ${begin}s infinite}`);
          target.parentNode.insertBefore(copy, target);
        });
        target.remove();
      } else if (tag === 'animate') {
        const attr = a.getAttribute('attributeName');
        const vals = valuesOf(a);
        if (!vals.length || !attr) continue;
        if (vals[0] == null) vals[0] = target.getAttribute(attr) ?? '0';
        const ts = times(a, vals.length);
        const unit = /^(r|cx|cy|rx|ry|x|y|width|height)$/.test(attr) ? 'px' : '';
        const prop = attr === 'stroke-dashoffset' ? 'stroke-dashoffset' : attr;
        kfs(name, vals.map((v, i) => [ts[i], `${prop}:${unit && /^-?[\d.]+$/.test(v) ? v + unit : v}`]), timing(a, vals.length - 1));
        addTo(target, prop, `${name} ${animProps(a)}`);
      } else if (tag === 'set') {
        // 쓰는 곳이 없으면 무시
      }
    }
    perEl.forEach((list, el) => {
      const cls = `s${hash}e${n++}`;
      el.setAttribute('class', `${el.getAttribute('class') ?? ''} ${cls}`.trim());
      const hasT = list.some((x) => x.prop === 'transform');
      rules.push(`.${cls}{${hasT ? 'transform-box:view-box;transform-origin:0 0;' : ''}animation:${list.map((x) => x.anim).join(',')}}`);
    });
    host.remove();
    if (!keyframes.length) return null;
    const style = doc.createElementNS(NS, 'style');
    style.textContent = `\n    ${keyframes.join('\n    ')}\n    ${rules.join('\n    ')}\n  `;
    svg.insertBefore(style, svg.firstChild);
    return { out: new XMLSerializer().serializeToString(doc), count: keyframes.length };
  }, { src, hash });
  if (!res) continue;
  // 직렬화 결과의 기본 네임스페이스 정리 + 스타일 앞 줄바꿈
  fs.writeFileSync(f, res.out.replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"(?=[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg")/, '') + (res.out.endsWith('\n') ? '' : '\n'));
  total += res.count;
  console.log(f, res.count);
}
await browser.close();
console.log('files', files.length, 'animations', total);
