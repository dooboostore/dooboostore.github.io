// 실시간 지구 데이터 (키 없음 · CORS 허용 · 무료)
//   - 지금 날씨(한 지점): Open-Meteo (https://open-meteo.com) — 비상업 무료, 시간당 5,000 → localStorage 캐시·한도 초과 시 1시간 쉼
//   - 지구 구름: NASA GIBS 위성 영상 (https://gibs.earthdata.nasa.gov) — 이미지 한 장, 한도 없음
//   - 열대저기압(태풍·허리케인): GDACS (https://www.gdacs.org, EU 공동연구센터·UN) — 지금 활동 중인 것의 현재 위치
// 실패하면 undefined → 부르는 쪽이 world.json 의 기본(그림용) 구름·태풍을 그대로 쓴다.
import type { Route } from "./traffic";
import type { Win } from "./entity";

export type Weather = "clear" | "cloudy" | "rain" | "storm" | "snow" | "fog";

// WMO 날씨 코드 → 이 세계의 날씨
export const wmoWeather = (code: number): Weather =>
  code >= 95
    ? "storm"
    : (code >= 71 && code <= 77) || code === 85 || code === 86
      ? "snow"
      : (code >= 51 && code <= 67) || (code >= 80 && code <= 82)
        ? "rain"
        : code === 45 || code === 48
          ? "fog"
          : code >= 2
            ? "cloudy"
            : "clear";

const getJson = async (w: Win, url: string) => {
  const r = await w.fetch(url, { signal: AbortSignal.timeout(15000) }); // 응답 없는 서버에 붙잡히지 않게
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

// Open-Meteo 무료 한도는 시간당 5,000 (한 요청의 지점 수만큼 센다). 새로고침마다 다시 물으면 금방 넘는다 →
//   ① 응답을 localStorage 에 ttl 동안 두고 새로고침·다른 탭에서도 그대로 쓴다
//   ② 한도 초과(429 등)를 받으면 1시간 동안 아예 묻지 않는다 (그동안은 그림용 구름·맑음)
const BLOCK_KEY = "world.live.block";
// 날씨 캐시 Worker (Cloudflare, KV 저장). 허용 Origin: dooboostore.github.io, localhost:3002
//   /weather?lat&lon → 1° 칸 지금 날씨 (30분) · /clouds → 12° 격자(위도 ±60, 위도 바깥 → 경도 안쪽 순) 330 지점 구름양 (1시간)
const WEATHER_WORKER = "https://world-weather.visualkhh.workers.dev/";
const store = (w: Win) => {
  try {
    return w.localStorage;
  } catch {
    return undefined;
  }
};
async function meteo<T>(
  w: Win,
  key: string,
  ttlMs: number,
  url: string,
  block = BLOCK_KEY,
): Promise<T | undefined> {
  const ls = store(w);
  const now = Date.now();
  try {
    const hit = JSON.parse(ls?.getItem(key) ?? "null");
    if (hit && now - hit.at < ttlMs) return hit.v as T;
  } catch {
    /* 깨진 캐시 무시 */
  }
  if (Number(ls?.getItem(block) ?? 0) > now) return undefined;
  try {
    const r = await w.fetch(url);
    if (!r.ok) {
      if (r.status === 429) ls?.setItem(block, String(now + 60 * 60000)); // 한도 초과 → 한 시간 쉼
      return undefined;
    }
    const v = (await r.json()) as T;
    try {
      ls?.setItem(key, JSON.stringify({ at: now, v }));
    } catch {
      /* 저장 공간 부족 — 이번엔 캐시 없이 */
    }
    return v;
  } catch {
    return undefined;
  }
}

// 한 지점의 지금 날씨
export async function liveWeather(
  w: Win,
  lon: number,
  lat: number,
): Promise<Weather | undefined> {
  // 1° 칸 단위로 묻고 30분 둔다
  const la = Math.round(lat),
    lo = Math.round(lon);
  // 우리 날씨 캐시 Worker (Open-Meteo 를 Worker 가 칸마다 30분에 한 번만 부르고 모두 나눠 쓴다)
  const j = await meteo<{ current: { weather_code: number } }>(w, `world.live.wx.${la},${lo}`, 30 * 60000, `${WEATHER_WORKER}weather?lat=${la}&lon=${lo}`, 'world.live.block.worker');
  if (j) return wmoWeather(j.current.weather_code);
  // 예비: 노르웨이 기상청 MET Norway (키 없음 · CORS · 전 지구). symbol_code → 날씨
  const m = await meteo<{ properties: { timeseries: { data: { next_1_hours?: { summary: { symbol_code: string } } } }[] } }>(
    w,
    `world.live.met.${la},${lo}`,
    30 * 60000,
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${la}&lon=${lo}`,
    'world.live.block.met',
  );
  const code = m?.properties.timeseries[0]?.data.next_1_hours?.summary.symbol_code;
  if (!code) return undefined;
  return /thunder/.test(code) ? 'storm' : /snow|sleet/.test(code) ? 'snow' : /rain/.test(code) ? 'rain' : /fog/.test(code) ? 'fog' : /cloudy|partly/.test(code) ? 'cloudy' : 'clear';
}

// 지구 전체 구름: NASA GIBS 위성 영상 (MODIS Terra·Aqua 일일 구름양, 키 없음 · CORS · 호출 한도 없음)
//   전 지구 구름양 지도를 360×180 PNG 한 장으로 받아(위성 둘 = 두 장) 캔버스에서 픽셀을 읽는다 → 지점마다 묻던 Open-Meteo 호출 0
//   어제(UTC) 낮 영상이라 '어제 낮의 구름'이다. 궤도 사이 빈 줄은 두 위성을 겹쳐 메운다
// 색 → 구름양(%): GIBS 색표(MODIS_Cloud_Fraction.xml)는 띠(R,G)마다 B 가 1 씩 늘며 값이 1 씩 는다. 60% 이상 띠만 적어 둔다
const CLOUD_BANDS: [number, number, number][] = [
  [255, 255, 57], [240, 190, -1], [187, 136, 69], [122, 90, 73], [110, 0, 82], [170, 0, 88], [255, 0, 95],
];
const cloudPct = (r: number, g: number, b: number, a: number) => {
  if (a < 128) return -1; // 자료 없음
  const band = CLOUD_BANDS.find(([R, G]) => R === r && G === g);
  return band ? band[2] + b : 0; // 띠에 없는 색 = 60% 미만
};

const loadPixels = (w: Win, url: string) =>
  new Promise<ImageData | undefined>((resolve) => {
    const img = new w.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cv = w.document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (!ctx) return resolve(undefined);
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, cv.width, cv.height));
    };
    img.onerror = () => resolve(undefined);
    img.src = url;
  });

// 지구 구름: 우리 Worker 의 지금 구름양 (실패하면 NASA GIBS 어제 위성 영상)
export async function liveClouds(w: Win): Promise<Route[] | undefined> {
  return (await workerClouds(w)) ?? (await gibsClouds(w));
}

async function workerClouds(w: Win): Promise<Route[] | undefined> {
  const j = await meteo<{ current: { cloud_cover: number } }[]>(w, 'world.live.clouds2', 60 * 60000, `${WEATHER_WORKER}clouds`, 'world.live.block.worker');
  if (!Array.isArray(j)) return undefined;
  const jit = (i: number) => ((((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1) - 0.5;
  const out: Route[] = [];
  let i = 0;
  for (let lat = -60; lat <= 60; lat += 12)
    for (let lon = -180; lon < 180; lon += 12, i++) {
      const c = j[i]?.current?.cloud_cover ?? 0;
      if (c < 85) continue; // 짙게 낀 곳만
      // 격자 그대로면 줄 맞춰 선 것처럼 보여서 그리는 자리만 칸 안에서 고정 흔들림
      const lo = +(((lon + jit(i) * 9 + 540) % 360) - 180).toFixed(1),
        la = +(lat + jit(i + 999) * 9).toFixed(1);
      out.push({
        use: 'globe/cloud.svg',
        kind: 'air',
        z: 600,
        name: `실시간 구름 (구름양 ${Math.round(c)}%)`,
        dur: 900,
        pingpong: true,
        size: 24 + (c - 85) * 1.1,
        opacity: 0.42 + ((c - 85) / 15) * 0.28,
        upright: true,
        path: [
          [lo - 2, la],
          [lo + 2, la + 0.6],
        ],
      });
    }
  return out;
}

async function gibsClouds(w: Win): Promise<Route[] | undefined> {
  const day = new Date(Date.now() - 36 * 3600000).toISOString().slice(0, 10); // 처리가 끝난 어제 영상
  const wms = (layer: string) =>
    `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer}&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=360&HEIGHT=180&FORMAT=image/png&TIME=${day}`;
  const maps = (await Promise.all([loadPixels(w, wms('MODIS_Terra_Cloud_Fraction_Day')), loadPixels(w, wms('MODIS_Aqua_Cloud_Fraction_Day'))])).filter(
    (m): m is ImageData => !!m,
  );
  if (!maps.length) return undefined;
  // 경위도 → 픽셀 (1° = 1px), 둘레 3×3 평균, 두 위성 중 자료 있는 쪽의 큰 값
  const at = (lon: number, lat: number) => {
    let best = -1;
    for (const m of maps) {
      let sum = 0,
        n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = Math.min(359, Math.max(0, Math.floor(lon + 180) + dx)),
            y = Math.min(179, Math.max(0, Math.floor(90 - lat) + dy));
          const k = (y * m.width + x) * 4;
          const v = cloudPct(m.data[k], m.data[k + 1], m.data[k + 2], m.data[k + 3]);
          if (v >= 0) {
            sum += v;
            n++;
          }
        }
      if (n >= 5) best = Math.max(best, sum / n);
    }
    return best;
  };
  // 12° 격자 + 지점마다 고정 흔들림 (줄 맞춰 선 것처럼 보이지 않게)
  const jit = (i: number) => ((((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1) - 0.5;
  const out: Route[] = [];
  for (let lat = -60, i = 0; lat <= 60; lat += 12)
    for (let lon = -180; lon < 180; lon += 12, i++) {
      const lo = +(((lon + jit(i) * 9 + 540) % 360) - 180).toFixed(1),
        la = +(lat + jit(i + 999) * 9).toFixed(1);
      const c = at(lo, la);
      if (c < 95) continue; // 거의 다 덮인 곳만 (85% 부터 띄우니 400개 가까이로 지저분했다)
      out.push({
        use: 'globe/cloud.svg',
        kind: 'air',
        z: 600,
        name: `구름 (어제 위성 관측 구름양 ${Math.round(c)}% · NASA GIBS)`,
        dur: 900,
        pingpong: true,
        size: 24 + (c - 95) * 2.4,
        opacity: 0.42 + ((c - 95) / 5) * 0.25,
        upright: true,
        path: [
          [lo - 2, la],
          [lo + 2, la + 0.6],
        ],
      });
    }
  return out;
}

const STORM_KO: [RegExp, string][] = [
  [/Hurricane|Typhoon/i, "태풍"],
  [/Tropical Storm/i, "열대폭풍"],
  [/Tropical Depression/i, "열대저압부"],
  [/Low/i, "저기압"],
];

// 지금 활동 중인 열대저기압 (GDACS)
export async function liveStorms(w: Win): Promise<Route[] | undefined> {
  try {
    // 우리 Worker 가 1시간 받아 둔 것 먼저 (GDACS 는 자주 느리거나 멈춘다), 안 되면 GDACS 직접
    const j = await getJson(w, `${WEATHER_WORKER}storms`).catch(() =>
      getJson(w, "https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP?eventlist=TC"),
    );
    type F = {
      geometry: { coordinates: [number, number] };
      properties: {
        eventtype: string;
        iscurrent: string | boolean;
        eventname: string;
        severitydata?: { severity?: number; severitytext?: string };
      };
    };
    return (j.features as F[])
      .filter(
        (f) =>
          f.properties.eventtype === "TC" &&
          String(f.properties.iscurrent) === "true",
      ) // 이 목록에는 지진 등도 섞여 온다
      .map((f) => {
        const [lon, lat] = f.geometry.coordinates;
        const p = f.properties;
        const kmh = p.severitydata?.severity ?? 0;
        const kind =
          STORM_KO.find(([re]) =>
            re.test(p.severitydata?.severitytext ?? ""),
          )?.[1] ?? "열대저기압";
        return {
          use: "globe/typhoon",
          kind: "air" as const,
          z: 300,
          name: `실시간 ${kind} ${p.eventname.replace(/-\d+$/, "")}${kmh ? ` · 최대 ${Math.round(kmh)} km/h` : ""} (GDACS)`,
          dur: 240,
          pingpong: true,
          size: Math.max(36, Math.min(80, 30 + kmh / 4)),
          path: [
            [lon, lat],
            [lon + 0.4, lat + 0.3],
          ],
        };
      });
  } catch {
    return undefined;
  }
}
