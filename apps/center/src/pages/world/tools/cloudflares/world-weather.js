// 작은 지구 날씨 캐시 Worker (Cloudflare) — https://world-weather.visualkhh.workers.dev/
// Open-Meteo 를 여기서만 부르고 결과를 KV(바인딩 이름 WX)에 저장해 모든 방문자가 나눠 쓴다.
// 방문자가 몇 명이든 Open-Meteo 호출은 칸마다 30분에 1번, 지구 구름은 1시간에 1번 (지점 330개) → 무료 한도(시간당 5,000) 안.
//   GET /weather?lat&lon → 1° 칸의 지금 날씨 (weather_code, cloud_cover, is_day)
//   GET /clouds          → 12° 격자(위도 ±60, 위도 바깥 → 경도 안쪽 순) 330 지점의 구름양
//   GET /storms          → GDACS 열대저기압 목록 (1시간). GDACS 가 자주 느리거나 멈춰서, 받아 둔 것을 대신 준다
// 대시보드: Workers → world-weather 에 이 파일을 그대로 붙여 Deploy. Settings → Bindings 에 KV namespace "WX" 필요.
const ALLOW = ['https://dooboostore.github.io', 'http://localhost:3002'];

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    const ok = ALLOW.includes(origin);
    const cors = { 'Access-Control-Allow-Origin': ok ? origin : ALLOW[0], Vary: 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    if (!ok) return new Response('forbidden', { status: 403 });
    try {
      const url = new URL(req.url);
      let key, upstream, ttl;
      if (url.pathname === '/weather') {
        const lat = Math.round(Number(url.searchParams.get('lat')));
        const lon = Math.round(Number(url.searchParams.get('lon')));
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
          return new Response('bad request', { status: 400, headers: cors });
        key = `w:${lat},${lon}`;
        ttl = 1800;
        upstream = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,cloud_cover,is_day`;
      } else if (url.pathname === '/clouds') {
        const lats = [], lons = [];
        for (let la = -60; la <= 60; la += 12) for (let lo = -180; lo < 180; lo += 12) { lats.push(la); lons.push(lo); }
        key = 'clouds';
        ttl = 3600;
        upstream = `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}&current=cloud_cover`;
      } else if (url.pathname === '/storms') {
        key = 'storms';
        ttl = 3600;
        upstream = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP?eventlist=TC';
      } else return new Response('not found', { status: 404, headers: cors });

      let body = env.WX ? await env.WX.get(key) : null;
      if (!body) {
        const r = await fetch(upstream, { headers: { 'User-Agent': 'small-world-weather-cache/1.0' } });
        if (!r.ok)
          return new Response(JSON.stringify({ error: 'upstream', status: r.status, body: (await r.text()).slice(0, 300) }), {
            status: 502,
            headers: { ...cors, 'Content-Type': 'application/json' },
          });
        body = await r.text();
        if (env.WX) ctx.waitUntil(env.WX.put(key, body, { expirationTtl: ttl }));
      }
      return new Response(body, { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'exception', message: String((e && e.stack) || e) }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  },
};
