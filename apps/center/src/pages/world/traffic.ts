// 지구본 위 교통 (배·항공모함·비행기). world.json 의 traffic 으로 정의.
//   path: 경위도 경유점 (대권 보간), dur: 한 번 가는 데 걸리는 초, pingpong: 갔다가 되돌아옴 (아니면 끝에서 처음으로 — 닫힌 경로면 순환)
//   kind: sea | air — 배 항로가 육지를 지나지 않는지는 tools/check-data.mjs 가 검사한다
// 위치가 시간에 따라 계속 바뀌므로 매 프레임 투영한다 (대상 수십 개라 가볍다).
// z: 고도(km, base_link z). 카메라가 내려오면 원근으로 커지고, 카메라 높이가 z 의 3배 아래면 흐려져 1.5배에서 사라진다.
//    배(z=0)는 항상 보인다 (아이콘 크기는 화면 px 고정).
import { geoDistance, geoInterpolate, GeoProjection } from 'd3-geo';
import { EntityRegistry, SVGNS, useAt, Win } from './entity';

type LL = [number, number];
export type Route = { use: string; kind: 'sea' | 'air'; name?: string; path: LL[]; dur: number; count?: number; pingpong?: boolean; z?: number; size?: number; vars?: Record<string, string> };

type Vehicle = { el: SVGGElement; route: Route; offset: number; at: (u: number) => LL; total: number };

export class Traffic {
  private vehicles: Vehicle[] = [];
  private sea: SVGGElement;
  private air: SVGGElement;

  constructor(private w: Win, private reg: EntityRegistry, parent: SVGGElement) {
    this.sea = w.document.createElementNS(SVGNS, 'g');
    this.air = w.document.createElementNS(SVGNS, 'g');
    parent.replaceChildren(this.sea, this.air);
  }

  async set(routes: Route[]) {
    this.sea.replaceChildren();
    this.air.replaceChildren();
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
        (route.kind === 'air' ? this.air : this.sea).appendChild(el);
        this.vehicles.push({ el, route, offset: i / n + ri * 0.137, at, total });
      }
    });
  }

  update(proj: GeoProjection, center: LL, k: number, nowSec: number, camAltKm: number, W: number, H: number) {
    const base = Math.min(2.2, Math.pow(k, 0.3));
    for (const v of this.vehicles) {
      const r = v.route;
      const z = r.z ?? 0;
      const fade = z > 0 ? Math.max(0, Math.min(1, (camAltKm / z - 1.5) / 1.5)) : 1;
      if (fade <= 0) {
        if (v.el.style.display !== 'none') v.el.style.display = 'none';
        continue;
      }
      const scale = base * (z > 0 ? Math.min(3, camAltKm / Math.max(0.1, camAltKm - z)) : 1); // 원근: 높이 있는 건 카메라에 가까워 보인다
      let t = ((nowSec / r.dur + v.offset) % 1 + 1) % 1;
      let dir = 1;
      if (r.pingpong) {
        t *= 2;
        if (t > 1) {
          t = 2 - t;
          dir = -1;
        }
      }
      const ll = v.at(t);
      if (geoDistance(ll, center) > 1.5) {
        if (v.el.style.display !== 'none') v.el.style.display = 'none';
        continue;
      }
      const ahead = v.at(Math.min(1, Math.max(0, t + dir * 0.0015)));
      const p = proj(ll);
      const q = proj(ahead);
      // 화면 밖이면 숨기고 아무것도 쓰지 않는다 (쓸 때마다 다시 그리기 비용)
      if (!p || !q || p[0] < -60 || p[1] < -60 || p[0] > W + 60 || p[1] > H + 60) {
        if (v.el.style.display !== 'none') v.el.style.display = 'none';
        continue;
      }
      const ang = (Math.atan2(q[0] - p[0], -(q[1] - p[1])) * 180) / Math.PI; // 기수(위쪽) 기준 진행 방향
      v.el.style.display = '';
      v.el.style.opacity = String(fade);
      v.el.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${((r.size ?? 26) * scale).toFixed(2)})`);
    }
  }
}
