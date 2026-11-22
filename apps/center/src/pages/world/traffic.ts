// 지구본 위 교통 (배·항공모함·비행기). world.json 의 traffic 으로 정의.
//   path: 경위도 경유점 (대권 보간), dur: 한 번 가는 데 걸리는 초, pingpong: 갔다가 되돌아옴 (아니면 끝에서 처음으로 — 닫힌 경로면 순환)
//   kind: sea | air | space — 배 항로가 육지를 지나지 않는지는 tools/check-data.mjs 가 검사한다
//     space: 인공위성·우주정거장·UFO·혜성. 고도 z(km)만큼 지구 반지름 밖 구면에 투영해서, 지구본 가장자리 밖(우주)에도 보이고
//            지구 뒤로 돌아가면 가려진다. 구름은 air(z 몇 km) — 지표를 따라 흐르고 카메라가 내려오면 사라진다.
// 위치가 시간에 따라 계속 바뀌므로 매 프레임 투영한다 (대상 수십 개라 가볍다).
// z: 고도(km, base_link z). 카메라가 내려오면 원근으로 커지고, 카메라 높이가 z 의 3배 아래면 흐려져 1.5배에서 사라진다.
//    배(z=0)는 항상 보인다 (아이콘 크기는 화면 px 고정).
import { geoDistance, geoInterpolate, GeoProjection, geoRotation } from 'd3-geo';
import { EntityRegistry, SVGNS, useAt, Win } from './entity';

type LL = [number, number];
// upright: 진행 방향으로 돌리지 않고 늘 세워 둔다 (구름). opacity: 그림 자체 투명도
// period: 이 초마다 한 번만 지나간다 (유성처럼 가끔 스치는 것). 지나가는 데는 dur 초, 나머지 시간은 안 보임
export type Route = { use: string; kind: 'sea' | 'air' | 'space'; name?: string; upright?: boolean; opacity?: number; period?: number; path: LL[]; dur: number; count?: number; pingpong?: boolean; z?: number; size?: number; vars?: Record<string, string> };

// body: 진행 방향으로 돌고 크기가 붙는 그림 · shadow: 비행기처럼 낮게 나는 것의 땅 그림자 (몸체를 위로 띄워 고도가 느껴지게)
const flyer = (r: Route) => r.kind === 'air' && (r.z ?? 0) > 0 && (r.z ?? 0) <= 100;
// 보이는 고도: 구의 반지름 배수. 실제 비율이면 비행기(10 km)는 0.2 px 라 안 보여서 과장한다.
//   비행기: 최대 +4.5% (10 km ≈ +3.6%), 우주: +5% 위에서 시작해 멀수록 +32% 까지 (포보스·혜성도 화면 안)
const altScale = (r: Route) => {
  const z = r.z ?? 0;
  if (r.kind === 'space') return 1.05 + 0.27 * (1 - Math.exp(-z / RADIUS_REF));
  return 1 + 0.045 * (1 - Math.exp(-z / 6));
};
let RADIUS_REF = 6371;
type Vehicle = { el: SVGGElement; body: SVGGElement; shadow?: SVGGElement; route: Route; offset: number; at: (u: number) => LL; total: number };

export class Traffic {
  private vehicles: Vehicle[] = [];
  private sea: SVGGElement;
  private air: SVGGElement;
  private space: SVGGElement;
  private radiusKm = 6371;

  constructor(private w: Win, private reg: EntityRegistry, parent: SVGGElement) {
    this.sea = w.document.createElementNS(SVGNS, 'g');
    this.air = w.document.createElementNS(SVGNS, 'g');
    this.space = w.document.createElementNS(SVGNS, 'g');
    // 지표의 것(배·구름·태풍)은 지구 원판 밖으로 삐져나오지 않게 원으로 자른다
    // 그림자 색: 그림의 알파만 남겨 옅은 남색으로
    const shade = w.document.createElementNS(SVGNS, 'filter');
    shade.id = 'traffic-shadow';
    shade.innerHTML = '<feColorMatrix type="matrix" values="0 0 0 0 0.18  0 0 0 0 0.24  0 0 0 0 0.36  0 0 0 0.28 0"/>';
    const clip = w.document.createElementNS(SVGNS, 'clipPath');
    clip.id = 'traffic-globe-clip';
    this.disk = w.document.createElementNS(SVGNS, 'circle');
    clip.appendChild(this.disk);
    const surface = w.document.createElementNS(SVGNS, 'g');
    surface.setAttribute('clip-path', `url(#${clip.id})`);
    surface.append(this.sea, this.air);
    this.sky = w.document.createElementNS(SVGNS, 'g'); // 비행기 몸체: 지구 원판 밖으로도 나간다 (그림자는 air 에서 원판 안으로 잘림)
    parent.replaceChildren(shade, clip, surface, this.sky, this.space);
  }
  private disk: SVGCircleElement;
  private sky: SVGGElement;
  private setToken = 0;

  // 지금 시각의 위치 (경위도) · 진행 방향 부호
  private where(v: Vehicle, nowSec: number) {
    const r = v.route;
    if (r.period) {
      const u = (((nowSec + v.offset * r.period) % r.period) + r.period) % r.period;
      return { t: Math.min(1, u / r.dur), dir: 1, ll: v.at(Math.min(1, u / r.dur)), gone: u > r.dur };
    }
    let t = ((nowSec / r.dur + v.offset) % 1 + 1) % 1;
    let dir = 1;
    if (r.pingpong) {
      t *= 2;
      if (t > 1) {
        t = 2 - t;
        dir = -1;
      }
    }
    return { t, dir, ll: v.at(t), gone: false };
  }

  // 누른 요소 → 그 교통 (도감·따라가기용): 경로 정의와 현재 위치를 돌려준다
  locate(target: Element) {
    const v = this.vehicles.find((it) => it.el.contains(target));
    if (!v) return undefined;
    return { route: v.route, geo: (): LL => this.where(v, this.w.performance.now() / 1000).ll };
  }

  async set(routes: Route[], radiusKm = 6371) {
    // 여러 번 겹쳐 불려도(기본 → 구름 도착 → 태풍 도착) 마지막 것만 그린다. 그림 불러오기를 기다린 뒤에 비우고 채워야
    // 앞선 호출이 뒤늦게 덧붙여 같은 교통이 두세 겹 생기지 않는다
    const token = ++this.setToken;
    const entities = await Promise.all(routes.map((r) => this.reg.load(r.use)));
    if (token !== this.setToken) return;
    this.radiusKm = radiusKm;
    RADIUS_REF = radiusKm;
    this.sea.replaceChildren();
    this.air.replaceChildren();
    this.sky.replaceChildren();
    this.space.replaceChildren();
    this.vehicles = [];
    routes.forEach((route, ri) => {
      const pts = route.path;
      const segs = pts.slice(1).map((p, i) => ({ f: geoInterpolate(pts[i], p), d: geoDistance(pts[i], p) }));
      const total = segs.reduce((a, s) => a + s.d, 0);
      // u: 0~1 진행률 → 경위도
      const at = (u: number): LL => {
        let d = u * total;
        for (const s of segs) {
          if (d <= s.d) return s.f(s.d ? d / s.d : 0) as LL;
          d -= s.d;
        }
        return pts[pts.length - 1];
      };
      const n = route.count ?? 1;
      for (let i = 0; i < n; i++) {
        const el = this.w.document.createElementNS(SVGNS, 'g');
        Object.entries(route.vars ?? {}).forEach(([k, v]) => el.style.setProperty(k, v));
        const e = entities[ri];
        // 크기는 화면 px 기준 — entity viewBox 의 긴 변을 1 로 맞춘 뒤 transform scale 로 키운다
        const u = useAt(this.w, e, 'front', 1 / Math.max(e.box.w, e.box.h));
        const body = this.w.document.createElementNS(SVGNS, 'g');
        body.appendChild(u);
        // 비행기(air, z 1~100 km): 몸체는 고도만큼 큰 구 위(가장자리에선 지구 밖으로 떠 보임), 땅에는 그림자 — 둘은 따로 놓는다
        let shadow: SVGGElement | undefined;
        if (flyer(route)) {
          shadow = this.w.document.createElementNS(SVGNS, 'g');
          shadow.setAttribute('filter', 'url(#traffic-shadow)');
          Object.entries(route.vars ?? {}).forEach(([k, v]) => shadow!.style.setProperty(k, v));
          const sb = this.w.document.createElementNS(SVGNS, 'g');
          sb.appendChild(u.cloneNode(true));
          shadow.appendChild(sb);
          this.air.appendChild(shadow);
        }
        el.appendChild(body);
        (route.kind === 'space' ? this.space : flyer(route) ? this.sky : route.kind === 'air' ? this.air : this.sea).appendChild(el);
        this.vehicles.push({ el, body, shadow, route, offset: i / n + ri * 0.137, at, total });
      }
    });
  }

  // covered(ll): 그 자리에 지역 장면이 보이는가 → 지구본 축척의 배·고래는 숨긴다 (장면에는 자기 배가 있고, 해안선 정밀도가 달라 땅 위로 보인다)
  update(proj: GeoProjection, center: LL, k: number, nowSec: number, camAltKm: number, W: number, H: number, covered?: (ll: LL) => boolean) {
    const base = Math.min(2.2, Math.pow(k, 0.3));
    // 우주: 회전된 구면 좌표 → 반지름 (1 + z/R) 배의 구에 정사영. 뒤쪽이면서 지구 원판 안이면 가려짐
    const rot = geoRotation(proj.rotate() as [number, number, number]);
    const R = proj.scale(), [cx, cy] = proj.translate();
    this.disk.setAttribute('cx', String(cx));
    this.disk.setAttribute('cy', String(cy));
    this.disk.setAttribute('r', String(R));
    const orbit = (ll: LL, s: number): [number, number] | undefined => {
      const [l, f] = rot(ll).map((d) => (d * Math.PI) / 180);
      const x = Math.cos(f) * Math.sin(l), y = Math.sin(f), depth = Math.cos(f) * Math.cos(l);
      if (depth < 0 && Math.hypot(x, y) * s < 1) return undefined;
      return [cx + R * s * x, cy - R * s * y];
    };
    for (const v of this.vehicles) {
      const r = v.route;
      const z = r.z ?? 0;
      // 우주 것은 지구본을 멀리서 볼 때만 (k 3→4 에서 사라짐), 하늘 것은 카메라가 그 고도 가까이 내려오면 사라짐
      const fade = r.kind === 'space' ? Math.max(0, Math.min(1, 4 - k)) : z > 0 ? Math.max(0, Math.min(1, (camAltKm / z - 1.5) / 1.5)) : 1;
      if (fade <= 0) {
        if (v.el.style.display !== 'none') v.el.style.display = 'none';
        continue;
      }
      const scale = r.kind === 'space' ? 1 : base * (z > 0 ? Math.min(3, camAltKm / Math.max(0.1, camAltKm - z)) : 1); // 원근: 높이 있는 건 카메라에 가까워 보인다
      const { t, dir, ll, gone } = this.where(v, nowSec);
      const space = r.kind === 'space';
      const lifted = space || flyer(r); // 구보다 높이 떠서 가장자리 너머로도 보이는 것
      const hide = () => {
        if (v.el.style.display !== 'none') v.el.style.display = 'none';
        if (v.shadow && v.shadow.style.display !== 'none') v.shadow.style.display = 'none';
      };
      if (gone || (!lifted && geoDistance(ll, center) > 1.5) || (z === 0 && covered?.(ll))) {
        hide();
        continue;
      }
      const ahead = v.at(Math.min(1, Math.max(0, t + dir * 0.0015)));
      const sAlt = altScale(r);
      const p = lifted ? orbit(ll, sAlt) : proj(ll);
      const q = lifted ? orbit(ahead, sAlt) : proj(ahead);
      // 화면 밖이면 숨기고 아무것도 쓰지 않는다 (쓸 때마다 다시 그리기 비용)
      if (!p || !q || p[0] < -60 || p[1] < -60 || p[0] > W + 60 || p[1] > H + 60) {
        hide();
        continue;
      }
      const ang = r.upright ? 0 : (Math.atan2(q[0] - p[0], -(q[1] - p[1])) * 180) / Math.PI; // 기수(위쪽) 기준 진행 방향
      v.el.style.display = '';
      v.el.style.opacity = String(fade * (r.opacity ?? 1));
      // 지표의 것은 구면에 붙어 있으므로 가장자리로 갈수록 반지름 방향으로 납작해진다 (정사영 단축). 태풍이 우주로 삐져나와 보이던 문제
      let squash = '';
      if (!space) {
        const c = Math.max(0.06, Math.cos(geoDistance(ll, center)));
        if (c < 0.995) {
          const phi = ((Math.atan2(p[1] - cy, p[0] - cx) * 180) / Math.PI).toFixed(1);
          squash = ` rotate(${phi}) scale(${c.toFixed(3)} 1) rotate(${-phi})`;
        }
      }
      const sz = (r.size ?? 26) * scale;
      const turn = `rotate(${ang.toFixed(1)}) scale(${sz.toFixed(2)})`;
      v.el.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})${squash}`);
      if (v.shadow) {
        // 그림자: 땅 위 진짜 위치 (지구 원판으로 잘림). 몸체: 고도 구 위 + 지구본 가운데에서도 떠 보이게 고도만큼 왼쪽 위로 (빛은 왼쪽 위)
        const g = proj(ll);
        if (g && geoDistance(ll, center) < 1.5) {
          v.shadow.style.display = '';
          v.shadow.style.opacity = String(fade);
          v.shadow.setAttribute('transform', `translate(${g[0].toFixed(1)} ${g[1].toFixed(1)})${squash}`);
          (v.shadow.firstElementChild as SVGGElement).setAttribute('transform', turn);
        } else v.shadow.style.display = 'none';
        const lift = sz * Math.min(0.6, z / 25);
        v.body.setAttribute('transform', `translate(${(-lift * 0.55).toFixed(1)} ${(-lift).toFixed(1)}) ${turn}`);
      } else v.body.setAttribute('transform', turn);
    }
  }
}
