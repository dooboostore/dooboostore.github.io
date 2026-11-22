// 페이지 콘솔에서: await fixRoutes(['korea/seoul', ...]) → { sector: [{i, use, kind, path, dur} | {i, drop}] }
window.fixRoutes = async (only) => {
  const c = window.__c;
  const SEA = /dolphin|whale|fish(?!ing-boat)|seal|turtle|jelly|octopus|orca|shark|boat|ship|ferry|yacht|kayak|gondola|canoe|swan|duck|goose|bateau|water-bus|caique|felucca|haenyeo|buoy/;
  const CAR = /car\b|car\/|taxi|bus|truck|scooter|cab|tram|tuk|rickshaw|vespa|fiat|bonde|paykan|suv|tuk-tuk|auto-rickshaw|tram|trolleybus/;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const NS = 'http://www.w3.org/2000/svg';
  const r1 = (v) => Math.round(v * 10) / 10;
  const out = {};
  for (const id of only) {
    await c.goRegion('earth', id);
    let m;
    for (let i = 0; i < 240 && !(m = c.mounted.get(id)); i++) await sleep(250);
    if (!m) { out[id] = 'no-scene'; continue; }
    await sleep(600);
    const sc = m.scene;
    const sj = await (await fetch(`/datas/world/worlds/earth/${id}/sector.json?` + Date.now())).json();
    const [SW, SH] = sj.local.size;
    const wet = (x, y) => sc.inZone(x, y, 'water') && !sc.inZone(x, y, 'bridge');
    const onRoad = (x, y) => sc.inZone(x, y, 'road') || sc.inZone(x, y, 'bridge');
    const water = (x, y) => sc.inZone(x, y, 'water');
    const deepWet = (x, y, r) => water(x, y) && water(x + r, y) && water(x - r, y) && water(x, y + r) && water(x, y - r);
    // 도로 폴리라인: ground 의 data-zone=road 경로를 하위 경로(M)별로
    const roads = [];
    sc.el.querySelectorAll('[data-zone="road"]').forEach((el) => {
      const d = el.getAttribute('d') || '';
      d.split(/(?=M)/).forEach((sub) => {
        const nums = sub.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
        const pts = [];
        for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
        let run = [];
        const flush = () => {
          if (run.length >= 2) {
            let len = 0;
            for (let i = 1; i < run.length; i++) len += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]);
            roads.push({ pts: run, len });
          }
          run = [];
        };
        for (const q of pts) (q[0] >= 0 && q[1] >= 0 && q[0] <= SW && q[1] <= SH ? run.push(q) : flush());
        flush();
      });
    });
    const P = document.createElementNS(NS, 'path');
    const sample = (d, step) => {
      P.setAttribute('d', d);
      const L = P.getTotalLength();
      const n = Math.max(2, Math.ceil(L / step));
      return { L, pts: Array.from({ length: n + 1 }, (_, i) => { const q = P.getPointAtLength((L * i) / n); return [q.x, q.y]; }) };
    };
    const res = [];
    for (const [i, p] of sj.placements.entries()) {
      const b = p.behavior;
      if (b?.type !== 'route') continue;
      const sea = SEA.test(p.use) || p.layer === 'water';
      const car = !sea && CAR.test(p.use);
      if (!sea && !car) continue;
      const { L, pts } = sample(b.path, 1);
      const ok = sea ? pts.every(([x, y]) => water(x, y)) : pts.filter(([x, y]) => onRoad(x, y)).length / pts.length >= 0.97;
      if (ok) continue;
      if (car) {
        // 원래 경로와 가장 가까운(평균 거리) 도로 하위 경로 중 길이 120 이상
        const probe = sample(b.path, 20).pts;
        const dist = (r) => probe.reduce((a, [x, y]) => a + Math.min(...r.pts.map(([u, v]) => Math.hypot(u - x, v - y))), 0) / probe.length;
        const cand = roads.filter((r) => r.len >= Math.min(120, L * 0.6)).map((r) => ({ r, d: dist(r) })).sort((a, b) => a.d - b.d)[0];
        if (!cand) { res.push({ i, use: p.use, drop: true, why: 'no road' }); continue; }
        const path = 'M' + cand.r.pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' L');
        const chk = sample(path, 1).pts;
        const rate = chk.filter(([x, y]) => onRoad(x, y)).length / chk.length;
        res.push({ i, use: p.use, kind: 'car', path, dur: Math.round(b.dur * (cand.r.len / L)), rate: Math.round(rate * 100), moved: Math.round(cand.d) });
      } else {
        // 물 안으로 끌어당김: 3 단위마다 점, 마른 점은 가장 가까운 '물가에서 3 이상 떨어진' 물로
        const s3 = sample(b.path, 3).pts;
        const snap = (m) => ([x, y]) => {
          if (deepWet(x, y, m)) return [x, y];
          for (let r = 0.5; r <= 60; r += 0.5) for (let a = 0; a < 32; a++) {
            const u = x + r * Math.cos((a / 32) * 2 * Math.PI), v = y + r * Math.sin((a / 32) * 2 * Math.PI);
            if (deepWet(u, v, m)) return [u, v];
          }
          return null;
        };
        let fixed = s3.map(snap(2.5));
        if (fixed.some((q) => !q)) fixed = s3.map(snap(1));
        if (fixed.some((q) => !q)) { res.push({ i, use: p.use, drop: true, why: 'no water nearby' }); continue; }
        const segDry = (a, b) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])); for (let t = 0; t <= n; t++) { const x = a[0] + ((b[0] - a[0]) * t) / (n || 1), y = a[1] + ((b[1] - a[1]) * t) / (n || 1); if (!water(x, y)) return true; } return false; };
        const bfs = (a, b) => {
          const st = 1.5, pad = 60;
          const x0 = Math.min(a[0], b[0]) - pad, y0 = Math.min(a[1], b[1]) - pad;
          const nx = Math.ceil((Math.abs(b[0] - a[0]) + 2 * pad) / st), ny = Math.ceil((Math.abs(b[1] - a[1]) + 2 * pad) / st);
          const idx = (gx, gy) => gy * nx + gx, prev = new Int32Array(nx * ny).fill(-2);
          const g = (q) => [Math.round((q[0] - x0) / st), Math.round((q[1] - y0) / st)];
          const [sx, sy] = g(a), [tx, ty] = g(b);
          const qq = [idx(sx, sy)]; prev[qq[0]] = -1;
          for (let h = 0; h < qq.length; h++) {
            const c = qq[h], cx = c % nx, cy = (c / nx) | 0;
            if (cx === tx && cy === ty) break;
            for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
              const ux = cx + dx, uy = cy + dy;
              if (ux < 0 || uy < 0 || ux >= nx || uy >= ny) continue;
              const k = idx(ux, uy);
              if (prev[k] !== -2 || !deepWet(x0 + ux * st, y0 + uy * st, 1)) continue;
              prev[k] = c; qq.push(k);
            }
          }
          if (prev[idx(tx, ty)] === -2) return null;
          const out = [];
          for (let c = idx(tx, ty); c !== -1; c = prev[c]) out.push([x0 + (c % nx) * st, y0 + ((c / nx) | 0) * st]);
          return out.reverse();
        };
        let broken = false;
        const joined = [fixed[0]];
        for (let k = 1; k < fixed.length; k++) {
          if (segDry(joined[joined.length - 1], fixed[k])) {
            const w2 = bfs(joined[joined.length - 1], fixed[k]);
            if (!w2) { broken = true; break; }
            joined.push(...w2.slice(1, -1));
          }
          joined.push(fixed[k]);
        }
        if (broken) { res.push({ i, use: p.use, drop: true, why: 'water not connected' }); continue; }
        fixed = joined;
        const path = 'M' + fixed.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' L');
        const chk = sample(path, 1).pts;
        const bad = chk.filter(([x, y]) => !water(x, y)).length;
        res.push({ i, use: p.use, kind: 'sea', path, dur: b.dur, bad });
      }
    }
    out[id] = res;
  }
  return out;
};
