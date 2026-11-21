// radio-browser.info: CORS 허용이라 서버 없이 브라우저에서 바로 조회 (2026-11-21 확인)
// GitHub Pages 는 https → http 스트림은 mixed content 로 막히므로 https 만 사용
const HOSTS = ['de1', 'de2'];

export type Station = { name: string; url: string; lat?: number; lon?: number; km?: number };

type Raw = { name: string; url_resolved: string; geo_lat: number | null; geo_long: number | null; hls: number };

const toRad = (d: number) => (d * Math.PI) / 180;
export const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
};

// 그 나라의 https 방송국을, 위치 정보가 있는 것은 가까운 순 → 없는 것은 인기순으로
// HLS(.m3u8) 는 Safari 만 <audio> 로 재생 가능 → canHls 가 아니면 제외
// ponytail: Chrome 에서 HLS 가 필요하면 hls.js (단, 스트림 서버 CORS 필요)
export async function stationsNear(w: Window, iso: string, lat: number, lon: number, canHls: boolean): Promise<Station[]> {
  const q = `countrycode=${encodeURIComponent(iso)}&hidebroken=true&order=clickcount&reverse=true&limit=300`;
  let raws: Raw[] | undefined;
  for (const h of HOSTS) {
    try {
      const res = await w.fetch(`https://${h}.api.radio-browser.info/json/stations/search?${q}`);
      if (res.ok) {
        raws = await res.json();
        break;
      }
    } catch {
      /* 다음 미러 */
    }
  }
  if (!raws) throw new Error('radio-browser 서버에 연결할 수 없음');
  const seen = new Set<string>();
  const list = raws
    .filter((r) => r.url_resolved?.startsWith('https://') && (canHls || !r.hls) && !seen.has(r.url_resolved) && seen.add(r.url_resolved))
    .map<Station>((r) => {
      const has = r.geo_lat != null && r.geo_long != null;
      return { name: r.name.trim(), url: r.url_resolved, lat: has ? r.geo_lat! : undefined, lon: has ? r.geo_long! : undefined, km: has ? distanceKm(lat, lon, r.geo_lat!, r.geo_long!) : undefined };
    });
  const geo = list.filter((s) => s.km != null).sort((a, b) => a.km! - b.km!);
  return [...geo, ...list.filter((s) => s.km == null)];
}
