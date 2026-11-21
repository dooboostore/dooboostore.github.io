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
export type Route = { use: string; kind: 'sea' | 'air' | 'space'; name?: string; path: LL[]; dur: number; count?: number; pingpong?: boolean; z?: number; size?: number; vars?: Record<string, string> };

type Vehicle = { el: SVGGElement; route: Route; offset: number; at: (u: number) => LL; total: number };

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
    const clip = w.document.createElementNS(SVGNS, 'clipPath');
    clip.id = 'traffic-globe-clip';
    this.disk = w.document.createElementNS(SVGNS, 'circle');
    clip.appendChild(this.disk);
    const surface = w.document.createElementNS(SVGNS, 'g');
    surface.setAttribute('clip-path', `url(#${clip.id})`);
    surface.append(this.sea, this.air);
    parent.replaceChildren(clip, surface, this.space);
  }
  private disk: SVGCircleElement;

  // 지금 시각의 위치 (경위도) · 진행 방향 부호
  private where(v: Vehicle, nowSec: number) {
    const r = v.route;
    let t = ((nowSec / r.dur + v.offset) % 1 + 1) % 1;
    let dir = 1;
    if (r.pingpong) {
      t *= 2;
      if (t > 1) {
        t = 2 - t;
        dir = -1;
      }
    }
    return { t, dir, ll: v.at(t) };
  }

  // 누른 요소 → 그 교통 (도감·따라가기용): 경로 정의와 현재 위치를 돌려준다
  locate(target: Element) {
    const v = this.vehicles.find((it) => it.el.contains(target));
    if (!v) return undefined;
    return { route: v.route, geo: (): LL => this.where(v, this.w.performance.now() / 1000).ll };
  }

  async set(routes: Route[], radiusKm = 6371) {
    this.radiusKm = radiusKm;
    this.sea.replaceChildren();
    this.air.replaceChildren();
    this.space.replaceChildren();
    this.vehicles = [];
    const entities = await Promise.all(routes.map((r) => this.reg.load(r.use)));
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
        el.appendChild(u);
        (route.kind === 'space' ? this.space : route.kind === 'air' ? this.air : this.sea).appendChild(el);
        this.vehicles.push({ el, route, offset: i / n + ri * 0.137, at, total });
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
    const orbit = (ll: LL, z: number): [number, number] | undefined => {
      const [l, f] = rot(ll).map((d) => (d * Math.PI) / 180);
      const x = Math.cos(f) * Math.sin(l), y = Math.sin(f), depth = Math.cos(f) * Math.cos(l), s = 1 + z / this.radiusKm;
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
      const { t, dir, ll } = this.where(v, nowSec);
      const space = r.kind === 'space';
      if ((!space && geoDistance(ll, center) > 1.5) || (z === 0 && covered?.(ll))) {
        if (v.el.style.display !== 'none') v.el.style.display = 'none';
        continue;
      }
      const ahead = v.at(Math.min(1, Math.max(0, t + dir * 0.0015)));
      const p = space ? orbit(ll, z) : proj(ll);
      const q = space ? orbit(ahead, z) : proj(ahead);
      // 화면 밖이면 숨기고 아무것도 쓰지 않는다 (쓸 때마다 다시 그리기 비용)
      if (!p || !q || p[0] < -60 || p[1] < -60 || p[0] > W + 60 || p[1] > H + 60) {
        if (v.el.style.display !== 'none') v.el.style.display = 'none';
        continue;
      }
      const ang = (Math.atan2(q[0] - p[0], -(q[1] - p[1])) * 180) / Math.PI; // 기수(위쪽) 기준 진행 방향
      v.el.style.display = '';
      v.el.style.opacity = String(fade);
      // 지표의 것은 구면에 붙어 있으므로 가장자리로 갈수록 반지름 방향으로 납작해진다 (정사영 단축). 태풍이 우주로 삐져나와 보이던 문제
      let squash = '';
      if (!space) {
        const c = Math.max(0.06, Math.cos(geoDistance(ll, center)));
        if (c < 0.995) {
          const phi = ((Math.atan2(p[1] - cy, p[0] - cx) * 180) / Math.PI).toFixed(1);
          squash = ` rotate(${phi}) scale(${c.toFixed(3)} 1) rotate(${-phi})`;
        }
      }
      v.el.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})${squash} rotate(${ang.toFixed(1)}) scale(${((r.size ?? 26) * scale).toFixed(2)})`);
    }
  }
}
