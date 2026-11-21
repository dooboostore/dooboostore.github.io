import { attribute, elementDefine, event, eventDelegate, innerHtml, onConnectedAfter, onConnectedBefore, onConnectedBodyShadow, onDisconnected, query, requestAnimationFrame, resizeObserver, setInterval } from '@dooboostore/simple-web-component';
import { Router } from '@dooboostore/core-web';
import { geoArea, geoCentroid, geoCircle, geoContains, geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { EntityRegistry, SVGNS, Win } from './entity';
import { mountScene, Picked, Scene } from './scene';
import { distanceKm, Station, stationsNear } from './radio';
import { Route, Traffic } from './traffic';

const tagName = 'center-world-page';
const DATA = '/datas/world/';

type LL = [number, number];
type LonLat = { lon: number; lat: number };
type View = LonLat & { k: number };
type Bounds = [[number, number], [number, number]]; // [[서경, 남위], [동경, 북위]]
type Sector = { id: string; name: string; geo: LonLat; zoom: [number, number]; local?: boolean; bounds?: Bounds; focus?: Bounds; country?: string };
type WorldMeta = { id: string; name: string; icon: string; sectors: Sector[] };
type Style = { fill?: string; stroke?: string; opacity?: number };
type WorldJson = {
  radiusKm: number;
  surface: [string, string];
  glow: string;
  countries?: string;
  land?: string[];
  border?: string;
  features?: string;
  styles?: Record<string, Style>;
  spin: number;
  radio?: boolean;
  atmosphere?: boolean;
  traffic?: Route[];
};
type Country = { type: 'Feature'; properties: { iso: string; name: string }; geometry: any };
type FeatureJson = { name: string; kind: string; circle?: [number, number, number]; line?: LL[]; width?: number };
type Feat = { f: FeatureJson; geo: any; el: SVGPathElement };
// 도감 항목: entities.json 의 개체 항목, sector.json 의 info[지명]
type DexEntry = { name?: string; title?: string; emoji?: string; kind?: string; desc?: string };
// 누른 것: 장면 개체(use)·지명(label) 또는 지구본 교통(use + place = 항로 이름). geo = 지금 위치
type Dex = { use?: string; label?: string; sectorId?: string; place?: string; moving: boolean; geo?: () => LL | undefined };
type Mounted = { scene: Scene; wrap: SVGGElement; clip: SVGClipPathElement; line: SVGPathElement; at: number };

const K_MIN = 0.7;
const K_MAX = 30000; // 독도처럼 아주 작은 섬도 화면에 채울 수 있게
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const flagOf = (iso?: string) => (iso && /^[A-Z]{2}$/.test(iso) ? String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '');
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// 낮밤: 화면 중심의 현지 태양시(UTC + 경도/15) → 색조와 --night(창문·가로등 불빛)
type Phase = 'dawn' | 'morning' | 'day' | 'sunset' | 'dusk' | 'night';
type TimeMode = 'auto' | 'random' | Phase; // random: 일정 간격으로 시간대가 저절로 바뀜
type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';
const WEATHERS: Record<Weather, { icon: string; label: string }> = {
  clear: { icon: '☀️', label: '맑음' },
  cloudy: { icon: '☁️', label: '흐림' },
  rain: { icon: '🌧️', label: '비' },
  storm: { icon: '⛈️', label: '뇌우' },
  snow: { icon: '❄️', label: '눈' },
  fog: { icon: '🌫️', label: '안개' },
};
const PHASES: Record<Phase, { tint: string; op: number; night: number; icon: string; label: string }> = {
  dawn: { tint: '#ffb38a', op: 0.2, night: 0.4, icon: '🌅', label: '새벽' },
  morning: { tint: '#ffe6b0', op: 0.1, night: 0, icon: '🌤️', label: '아침' },
  day: { tint: '#ffffff', op: 0, night: 0, icon: '☀️', label: '낮' },
  sunset: { tint: '#ff9257', op: 0.24, night: 0.25, icon: '🌇', label: '노을' },
  dusk: { tint: '#5d4fb0', op: 0.4, night: 0.85, icon: '🌆', label: '저녁' },
  night: { tint: '#1c2a78', op: 0.55, night: 1, icon: '🌙', label: '밤' },
};
type WeatherMode = Weather | 'random';
const ENV_KEY = 'world.env';
const ENV_SHUFFLE_MS = 30000; // 랜덤 시간·날씨가 바뀌는 간격
const TOUR_STAY_MS = 25000; // 자동 여행: 한 지역에 머무는 시간
const isTime = (t: unknown): t is TimeMode => t === 'auto' || t === 'random' || (typeof t === 'string' && t in PHASES);
const isWeather = (x: unknown): x is WeatherMode => x === 'random' || (typeof x === 'string' && x in WEATHERS);
const pickOther = <T>(a: T[], cur: T) => pick(a.filter((x) => x !== cur)) ?? cur;
const solarHour = (lon: number, now = new Date()) => (((now.getUTCHours() + now.getUTCMinutes() / 60 + lon / 15) % 24) + 24) % 24;
const phaseOf = (h: number): Phase => (h < 5 ? 'night' : h < 6.5 ? 'dawn' : h < 9 ? 'morning' : h < 17 ? 'day' : h < 18.5 ? 'sunset' : h < 20 ? 'dusk' : 'night');

export default (win: Window) => {
  const w = win as Win;
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class WorldPage extends w.HTMLElement {
    @onConnectedBefore
    @innerHtml((c, helper) => helper.$w.document.querySelector('title'), { valueKey: 'titleBody' })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[property="og:title"]'), 'content', { valueKey: 'ogTitle' })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[name="description"]'), 'content', { valueKey: 'desc' })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[property="og:description"]'), 'content', { valueKey: 'ogDesc' })
    setPageMeta() {
      return {
        titleBody: '작은 지구 | @dooboostore',
        ogTitle: '작은 지구 | @dooboostore',
        desc: '지구·달·화성을 천천히 돌리며 각 나라의 일상을 구경하고, 그곳의 라디오를 들어보세요.',
        ogDesc: '지구·달·화성을 천천히 돌리며 각 나라의 일상을 구경하고, 그곳의 라디오를 들어보세요.',
      };
    }

    private router?: Router;
    // 카메라: 화면 중심의 경위도 + 줌(k=1 이면 천체 전체가 화면에)
    private lon = 127.5;
    private lat = 28;
    private k = 1;
    private target: View | null = null;
    private W = 800;
    private H = 600;
    private R0 = 300;
    private last = 0;
    private lastInteract = 0;
    private dirty = true;
    private pointers = new Map<number, { x: number; y: number; moved: number; t: number }>();
    private lastTap?: { x: number; y: number; t: number };
    private lastPointerType = 'mouse';

    private worlds: WorldMeta[] = [];
    private worldId = 'earth';
    private world?: WorldJson;
    private loadToken = 0;
    private sectors: Sector[] = [];
    private countries: Country[] = [];
    private countryEls: SVGPathElement[] = [];
    private feats: Feat[] = [];
    private markerEls = new Map<string, SVGGElement>();
    private registry?: EntityRegistry;
    private traffic?: Traffic;
    private scenes = new Map<string, Promise<Scene>>();
    private mounted = new Map<string, Mounted>();
    // 불러오는 중인 장면: 경계선을 먼저 그려 두고(boundary.json 은 작다) 장면이 붙으면 그 선을 넘겨준다
    private pending = new Map<string, { line: SVGPathElement; boundary?: any }>();
    // 날아가는 목적지 장면: 아직 작게 보여도 비행 시작부터 미리 불러온다 (손으로 움직이면 해제)
    private wantId?: string;
    private me?: LonLat;
    private toastTimer = 0;
    private timeMode: TimeMode = 'auto';
    private weather: WeatherMode = 'clear';
    private rndPhase: Phase = 'day'; // random 일 때 지금 고른 값
    private rndWeather: Weather = 'clear';
    private proj = geoOrthographic().clipAngle(90).precision(0.6);
    private path = geoPath(this.proj);
    private lastUrl = '';

    private here?: Country;
    private hereFeat?: FeatureJson;
    private placeTimer = 0;

    // 라디오
    // 라디오: "재생 중인 방송"(playing)과 "보고 있는 나라의 목록"(stations)은 따로 — 섞이면 목록에 없는 방송이 나오는 버그가 생긴다
    private radioOn = false;
    private pinned = false; // 📌 고정: 나라를 옮겨도 자동으로 바꾸지 않는다
    private playing?: { s: Station; iso: string; country: string; list: Station[] };
    private stations: Station[] = [];
    private listIso = '';
    private listCountry = '';
    private listToken = 0; // 늦게 도착한 이전 요청 결과는 버린다
    private radioTimer = 0;
    private failCount = 0;

    // 요소는 SWC @query 로 (shadow root 에서 찾는 getter)
    @query('#audio') private audioEl!: HTMLAudioElement;
    @query('#boundaries') private boundariesEl!: SVGGElement;
    @query('#btn-env') private btnEnvEl!: HTMLElement;
    @query('#btn-tour') private btnTourEl!: HTMLElement;
    @query('#btn-fab') private btnFabEl!: HTMLElement;
    @query('#btn-pin') private btnPinEl!: HTMLElement;
    @query('#btn-radio') private btnRadioEl!: HTMLElement;
    @query('#btn-world') private btnWorldEl!: HTMLElement;
    @query('#countries') private countriesEl!: SVGGElement;
    @query('#entity-defs') private entityDefsEl!: SVGDefsElement;
    @query('#env') private envEl!: HTMLElement;
    @query('#env-time') private envTimeEl!: HTMLElement;
    @query('#env-weather') private envWeatherEl!: HTMLElement;
    @query('#features') private featuresEl!: SVGGElement;
    @query('#glow') private glowEl!: SVGCircleElement;
    @query('#glow-a') private glowAEl!: SVGStopElement;
    @query('#glow-b') private glowBEl!: SVGStopElement;
    @query('#graticule') private graticuleEl!: SVGPathElement;
    @query('#markers') private markersEl!: SVGGElement;
    @query('#me') private meEl!: SVGGElement;
    @query('#place') private placeEl!: HTMLElement;
    @query('#radio-name') private radioNameEl!: HTMLElement;
    @query('#scene-defs') private sceneDefsEl!: SVGDefsElement;
    @query('#scenes') private scenesEl!: SVGGElement;
    @query('#soon') private soonEl!: HTMLElement;
    @query('#loading') private loadingEl!: HTMLElement;
    @query('#info') private infoEl!: HTMLElement;
    @query('#info-title') private infoTitleEl!: HTMLElement;
    @query('#info-kind') private infoKindEl!: HTMLElement;
    @query('#info-desc') private infoDescEl!: HTMLElement;
    @query('#btn-follow') private btnFollowEl!: HTMLElement;
    @query('#soon-text') private soonTextEl!: HTMLElement;
    @query('#stage') private stageEl!: SVGSVGElement;
    @query('#stars') private starsEl!: SVGGElement;
    @query('#stations') private stationsEl!: HTMLElement;
    @query('#stations-list') private stationsListEl!: HTMLElement;
    @query('#stations-title') private stationsTitleEl!: HTMLElement;
    @query('#surface') private surfaceEl!: SVGCircleElement;
    @query('#surface-a') private surfaceAEl!: SVGStopElement;
    @query('#surface-b') private surfaceBEl!: SVGStopElement;
    @query('#tint') private tintEl!: SVGRectElement;
    @query('#toast') private toastEl!: HTMLElement;
    @query('#traffic') private trafficEl!: SVGGElement;
    @query('#weather') private weatherEl!: HTMLElement;
    @query('#world-list') private worldListEl!: HTMLElement;
    @query('#worlds') private worldsEl!: HTMLElement;
    @query('#search') private searchEl!: HTMLElement;
    @query('#search-input') private searchInputEl!: HTMLInputElement;
    @query('#search-list') private searchListEl!: HTMLElement;
    @query('.title') private titleEl!: HTMLElement;
    @query('.wrap') private wrapEl!: HTMLElement;
    @query('.sheet', { pick: 'all' }) private sheetEls!: HTMLElement[];

    @onConnectedAfter
    async onInit(router: Router) {
      this.router = router;
      if (typeof w.requestAnimationFrame !== 'function' || typeof w.DOMParser !== 'function') return; // SSR
      this.registry = new EntityRegistry(w, this.entityDefsEl, DATA + 'entities/');
      this.traffic = new Traffic(w, this.registry, this.trafficEl);
      this.resize();

      // 저장된 시간·날씨 → URL 파라미터가 있으면 그게 우선 (공유 링크로 들어온 경우)
      try {
        const saved = JSON.parse(w.localStorage.getItem(ENV_KEY) ?? 'null');
        if (isTime(saved?.time)) this.timeMode = saved.time;
        if (isWeather(saved?.weather)) this.weather = saved.weather;
      } catch {
        /* 기본값 */
      }
      try {
        const r = JSON.parse(w.localStorage.getItem('world.radio') ?? 'null');
        if (r?.pinned && r.s?.url) {
          this.pinned = true;
          this.playing = { s: r.s, iso: r.iso, country: r.country, list: [r.s] }; // 재생은 사용자가 ▶ 를 눌러야 (자동재생 정책)
        }
      } catch {
        /* 기억 없음 */
      }
      const q = new URLSearchParams(w.location.search);
      const num = (k: string) => (q.get(k) != null && q.get(k) !== '' && isFinite(Number(q.get(k))) ? Number(q.get(k)) : undefined);
      const t = q.get('t');
      if (isTime(t)) this.timeMode = t;
      const wx = q.get('wx');
      if (isWeather(wx)) this.weather = wx;
      this.onEnvShuffle();
      const lat = num('lat'), lon = num('lon'), z = num('z');
      const view = lat != null && lon != null ? { lat: clamp(lat, -85, 85), lon: wrap(lon), k: clamp(z ?? 1, K_MIN, K_MAX) } : undefined;

      try {
        const index: { worlds: WorldMeta[] } = await (await w.fetch(DATA + 'worlds.json')).json();
        this.worlds = index.worlds;
        this.renderWorldMenu();
        const id = this.worlds.some((it) => it.id === q.get('w')) ? q.get('w')! : 'earth';
        await this.loadWorld(id, view);
        if (view) this.lastInteract = w.performance.now() + 25000; // 공유 링크로 들어왔으면 한동안 자전하지 않고 그 자리를 보여준다
      } catch (e) {
        console.error('[world] 데이터 로드 실패', e);
        this.setPlace('데이터를 불러오지 못했어요');
      }
    }

    @onDisconnected
    onGone() {
      w.clearTimeout(this.placeTimer);
      w.clearTimeout(this.radioTimer);
      w.clearTimeout(this.toastTimer);
      [...this.mounted.keys()].forEach((id) => this.unmount(id));
      this.audioEl?.pause();
    }

    // 화면 크기 — SWC @resizeObserver
    @resizeObserver('#stage')
    onStageResize() {
      this.resize();
    }

    private resize() {
      const r = this.stageEl.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.W = r.width;
      this.H = r.height;
      this.R0 = Math.min(this.W, this.H) * 0.42;
      let html = '';
      for (let i = 0; i < 160; i++) {
        const tw = Math.random() < 0.3 ? ` class="tw" style="animation-delay:${(-Math.random() * 6).toFixed(2)}s"` : '';
        html += `<circle cx="${(Math.random() * this.W).toFixed(1)}" cy="${(Math.random() * this.H).toFixed(1)}" r="${(Math.random() * 1.1 + 0.3).toFixed(2)}" opacity="${(Math.random() * 0.6 + 0.3).toFixed(2)}"${tw}/>`;
      }
      this.starsEl.innerHTML = html;
      this.dirty = true;
    }

    // ---------------- 세계 (지구 · 달 · 화성) ----------------
    private get meta() {
      return this.worlds.find((it) => it.id === this.worldId)!;
    }

    private async loadWorld(id: string, view?: View) {
      const token = ++this.loadToken;
      const meta = this.worlds.find((it) => it.id === id)!;
      const world: WorldJson = await (await w.fetch(`${DATA}worlds/${id}/world.json`)).json();
      const countries: Country[] = world.countries ? (await (await w.fetch(`${DATA}worlds/${id}/${world.countries}`)).json()).features : [];
      const features: FeatureJson[] = world.features ? (await (await w.fetch(`${DATA}worlds/${id}/${world.features}`)).json()).features : [];
      if (token !== this.loadToken) return; // 그 사이 다른 세계를 골랐다

      [...this.mounted.keys()].forEach((it) => this.unmount(it));
      this.scenes.clear();
      this.worldId = id;
      this.world = world;
      this.sectors = meta.sectors;
      this.countries = countries;
      this.here = undefined;
      this.hereFeat = undefined;

      this.surfaceAEl.setAttribute('stop-color', world.surface[0]);
      this.surfaceBEl.setAttribute('stop-color', world.surface[1]);
      this.glowAEl.setAttribute('stop-color', world.glow);
      this.glowBEl.setAttribute('stop-color', world.glow);
      this.wrapEl.dataset.world = id;
      this.btnWorldEl.textContent = meta.icon;
      this.titleEl.textContent = `작은 ${meta.name}`;

      const ns = (tag: string) => w.document.createElementNS(SVGNS, tag);
      const cg = this.countriesEl;
      cg.replaceChildren();
      this.countryEls = countries.map((c) => {
        const p = ns('path') as SVGPathElement;
        p.setAttribute('class', 'country');
        p.setAttribute('fill', world.land![Math.abs(hash(c.properties.iso + c.properties.name)) % world.land!.length]);
        p.setAttribute('stroke', world.border!);
        cg.appendChild(p);
        return p;
      });

      const fg = this.featuresEl;
      fg.replaceChildren();
      this.feats = features.map((f) => {
        const st = world.styles?.[f.kind] ?? {};
        const el = ns('path') as SVGPathElement;
        el.setAttribute('class', 'feat' + (f.line ? ' line' : ''));
        if (f.line) {
          el.setAttribute('fill', 'none');
          el.setAttribute('stroke', st.stroke ?? '#000');
        } else {
          el.setAttribute('fill', st.fill ?? 'none');
          if (st.stroke) el.setAttribute('stroke', st.stroke);
        }
        if (st.opacity != null) el.setAttribute('opacity', String(st.opacity));
        fg.appendChild(el);
        const geo = f.circle ? geoCircle().center([f.circle[0], f.circle[1]]).radius(f.circle[2]).precision(3)() : { type: 'LineString', coordinates: f.line };
        return { f, geo, el };
      });

      const mg = this.markersEl;
      mg.replaceChildren();
      this.markerEls.clear();
      for (const s of this.sectors) {
        const top = id === 'earth' && !s.id.includes('/');
        // 국가 코드는 sector 의 country (섬·해안 도시는 110m 국가 폴리곤 밖이라 위치로는 못 찾는다)
        const ciso = id === 'earth' ? (s.country ?? countries.find((c) => geoContains(c, [s.geo.lon, s.geo.lat]))?.properties.iso) : undefined;
        if (ciso) this.isoOf.set(s.id, ciso);
        const iso = top ? ciso : undefined;
        const m = ns('g') as SVGGElement;
        m.setAttribute('class', 'marker' + (top ? ' top' : ''));
        m.setAttribute('data-id', s.id);
        const soon = !top && !s.local ? '<tspan class="soon-tag" dx="5">준비 중</tspan>' : '';
        m.innerHTML = `<circle r="${top ? 3.5 : 3}"/><text y="-9">${flagOf(iso)} ${esc(s.name)}${soon}</text>`;
        mg.appendChild(m);
        this.markerEls.set(s.id, m);
      }

      this.traffic?.set(world.traffic ?? [], world.radiusKm);
      const v = view ?? { lon: id === 'earth' ? 127.5 : this.lon, lat: id === 'earth' ? 28 : 15, k: 1 };
      Object.assign(this, { lon: v.lon, lat: v.lat, k: v.k, target: null });
      this.renderWorldMenu();
      // 세계를 바꾼 직후에는 자전 중이어도 HUD 가 이전 세계 이름을 들고 있지 않게 즉시 갱신한다
      this.updatePlace();
      this.dirty = true;
    }

    private renderWorldMenu() {
      this.worldListEl.innerHTML =
        this.worlds.map((it) => `<button class="chip${it.id === this.worldId ? ' on' : ''}" data-world="${it.id}">${it.icon} ${esc(it.name)}</button>`).join('') +
        `<button class="chip" data-world="__overview">🔭 전체 보기</button>`;
    }

    // ---------------- 프레임 ----------------
    // 매 프레임 — SWC @requestAnimationFrame (connect 시 시작, disconnect 시 정리, 값을 반환해야 다음 프레임이 이어진다)
    @requestAnimationFrame
    frame(t: number) {
      const dt = Math.min(0.05, (t - (this.last || t)) / 1000);
      this.last = t;
      if (this.follow) this.followStep(dt);
      if (this.target) {
        const f = 1 - Math.exp(-dt * 3.2);
        this.lon += wrap(this.target.lon - this.lon) * f;
        this.lat += (this.target.lat - this.lat) * f;
        this.k = Math.exp(Math.log(this.k) + (Math.log(this.target.k) - Math.log(this.k)) * f);
        if (Math.abs(wrap(this.target.lon - this.lon)) < 0.01 / this.k && Math.abs(this.target.lat - this.lat) < 0.01 / this.k && Math.abs(this.target.k / this.k - 1) < 0.003) {
          Object.assign(this, { lon: this.target.lon, lat: this.target.lat, k: this.target.k });
          this.target = null;
        }
        this.dirty = true;
      } else if (this.world && !this.pointers.size && this.k < 2.2 && t - this.lastInteract > 5000) {
        this.lon = wrap(this.lon + this.world.spin * dt); // 아무것도 안 하면 천천히 자전
        this.dirty = true;
      }
      if (this.dirty) {
        this.dirty = false;
        this.render();
        w.clearTimeout(this.placeTimer);
        this.placeTimer = w.setTimeout(() => this.updatePlace(), 250);
      } else if (this.world?.traffic) {
        this.syncProj(); // 교통은 카메라가 멈춰 있어도 움직인다
      }
      if (this.world?.traffic) this.traffic?.update(this.proj, [this.lon, this.lat], this.k, t / 1000, this.camAltKm, this.W, this.H, this.covered);
      return true;
    }

    // 카메라 높이(km): 화면 짧은 변에 보이는 지표 거리의 절반 (시야각 90°) = 반지름 / (0.84 k)
    private get camAltKm() {
      return (this.world?.radiusKm ?? 6371) / (0.84 * this.k);
    }

    private syncProj() {
      const { W, H, R0, k } = this;
      this.proj.rotate([-this.lon, -this.lat]).scale(R0 * k).translate([W / 2, H / 2]);
      this.proj.clipExtent(k > 2 ? [[-20, -20], [W + 20, H + 20]] : null);
    }

    private render() {
      const { W, H, R0, k } = this;
      const R = R0 * k;
      this.syncProj();
      const bg = k > 3 && this.world ? ([...this.mounted.keys()].some((id) => this.sceneOpacity(id) > 0.3) ? '#cfe8b8' : this.world.surface[1]) : '';
      if (this.stageEl.style.backgroundColor !== bg) this.stageEl.style.backgroundColor = bg;
      const surface = this.surfaceEl;
      const r = String(Math.min(R, 4 * Math.hypot(W, H)));
      surface.setAttribute('cx', String(W / 2));
      surface.setAttribute('cy', String(H / 2));
      surface.setAttribute('r', r);
      const glow = this.glowEl;
      glow.setAttribute('cx', String(W / 2));
      glow.setAttribute('cy', String(H / 2));
      glow.setAttribute('r', String(R * 1.12));
      glow.style.display = k > 3 ? 'none' : '';
      this.graticuleEl.setAttribute('d', k < 12 ? this.path(geoGraticule10()) ?? '' : '');
      this.countryEls.forEach((el, i) => el.setAttribute('d', this.path(this.countries[i]) ?? ''));
      this.countriesEl.style.strokeWidth = String(clamp(0.6 + Math.log(k) * 0.25, 0.6, 1.6));
      const pxPerDeg = (R * Math.PI) / 180;
      for (const { f, geo, el } of this.feats) {
        el.setAttribute('d', this.path(geo) ?? '');
        if (f.line) el.style.strokeWidth = String(Math.max(1, (f.width ?? 1) * pxPerDeg));
      }

      const loading = this.loadingShown;
      if (this.loadingEl.classList.contains('show') !== loading) {
        if (loading) this.loadingEl.querySelector('span')!.textContent = `${this.sectors.find((x) => x.id === this.wantId)?.name ?? ''} 불러오는 중…`;
        this.loadingEl.classList.toggle('show', loading);
      }
      const center: LL = [this.lon, this.lat];
      for (const s of this.sectors) {
        const m = this.markerEls.get(s.id)!;
        const ll: LL = [s.geo.lon, s.geo.lat];
        const front = geoDistance(ll, center) < 1.45;
        const show = front && k >= s.zoom[0] && k <= s.zoom[1] && this.sceneOpacity(s.id) <= 0.5;
        m.style.display = show ? '' : 'none';
        if (show) {
          const [x, y] = this.proj(ll)!;
          m.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        }
        if (s.local && s.bounds) this.placeScene(s, s.bounds, front);
      }

      const me = this.meEl;
      const meFront = this.worldId === 'earth' && this.me && geoDistance([this.me.lon, this.me.lat], center) < 1.5;
      me.style.display = meFront ? '' : 'none';
      if (meFront) {
        const [x, y] = this.proj([this.me!.lon, this.me!.lat])!;
        me.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      }
    }

    // 목적지 장면을 아직 불러오는 중이고 거의 다 왔으면 "불러오는 중" 표시
    private get loadingShown() {
      const id = this.wantId;
      return !!id && !this.mounted.has(id) && (!this.target || this.k > this.target.k * 0.1);
    }

    // 지역 장면이 보이는 곳인가 (bounds 안 + 장면이 반 이상 나타남)
    private covered = ([lon, lat]: LL) => {
      for (const id of this.mounted.keys()) {
        const b = this.sectors.find((x) => x.id === id)?.bounds;
        if (b && lon >= b[0][0] && lon <= b[1][0] && lat >= b[0][1] && lat <= b[1][1] && this.sceneOpacity(id) > 0.3) return true;
      }
      return false;
    };

    private sceneOpacity(id: string) {
      return parseFloat(this.mounted.get(id)?.wrap.style.opacity || '0');
    }

    // LOD: 장면(bounds) 폭이 화면에서 80px 를 넘으면 붙이고, 40px 아래로 작아지거나 뒤로 넘어가면 뗀다
    // 장면은 bounds 의 북서·남동 모서리를 투영한 사각형에 맞추고, 실제 행정 경계(boundary)로 잘라낸다
    private placeScene(s: Sector, [[w0, s0], [e0, n0]]: Bounds, front: boolean) {
      const nw = this.proj([w0, n0])!;
      const se = this.proj([e0, s0])!;
      const px = se[0] - nw[0];
      // 화면 밖으로 반 화면 이상 벗어난 장면도 뗀다 (붙어 있으면 안 보여도 애니메이션·경로 계산이 계속 돈다)
      const off = se[0] < -this.W * 0.5 || nw[0] > this.W * 1.5 || se[1] < -this.H * 0.5 || nw[1] > this.H * 1.5;
      const want = s.id === this.wantId;
      if ((!front || px < 40 || off) && !want) return this.unmount(s.id);
      const m = this.mounted.get(s.id);
      if (!m) {
        if (px > 80 || want) this.ensureScene(s);
        const pend = this.pending.get(s.id);
        if (pend?.boundary) {
          pend.line.setAttribute('d', front ? this.path(pend.boundary) ?? '' : '');
          pend.line.style.opacity = String(clamp((px - 30) / 100, 0, 1));
        }
        return;
      }
      const [sw, sh] = m.scene.size;
      const sx = px / sw, sy = (se[1] - nw[1]) / sh;
      m.scene.el.setAttribute('transform', `translate(${nw[0].toFixed(2)} ${nw[1].toFixed(2)}) scale(${sx.toFixed(5)} ${sy.toFixed(5)})`);
      // 지금 화면이 장면 로컬 좌표로 어디인지 → 화면 밖·너무 작은 개체는 장면이 숨긴다
      m.scene.setView([-nw[0] / sx, -nw[1] / sy, (this.W - nw[0]) / sx, (this.H - nw[1]) / sy], sx);
      const d = m.scene.boundary ? this.path(m.scene.boundary) ?? '' : '';
      m.clip.firstElementChild!.setAttribute('d', d);
      m.line.setAttribute('d', d);
      // 붙은 직후에는 0.6초 동안 서서히 나타난다 (뚝 하고 생기지 않게)
      const age = clamp((w.performance.now() - m.at) / 600, 0, 1);
      if (age < 1) this.dirty = true;
      const op = String(Math.min(clamp((px - 80) / 220, 0, 1), age));
      // 카메라 높이를 장면 로컬 단위로: bounds 실제 폭(km) / 로컬 폭
      const kmPerUnit = ((e0 - w0) * Math.PI * this.world!.radiusKm * Math.cos((((s0 + n0) / 2) * Math.PI) / 180)) / 180 / sw;
      m.scene.setCamera(this.camAltKm / kmPerUnit);
      m.wrap.style.opacity = op;
      m.line.style.opacity = String(Math.max(+op, clamp((px - 30) / 100, 0, 1)));
    }

    private ensureScene(s: Sector) {
      let p = this.scenes.get(s.id);
      if (!p) {
        const slug = 's-' + s.id.replace(/[^a-z0-9]/gi, '-');
        const ns = (tag: string) => w.document.createElementNS(SVGNS, tag);
        // wrap 을 먼저 문서에 붙인다 (장면의 지형 구역 판정 isPointInFill 은 붙어 있는 요소에서만 동작)
        const wrapEl = ns('g') as SVGGElement;
        wrapEl.style.opacity = '0';
        this.scenesEl.appendChild(wrapEl);
        const dir = `${DATA}worlds/${this.worldId}/${s.id}/`;
        const line = ns('path') as SVGPathElement;
        line.setAttribute('class', 'boundary');
        this.boundariesEl.appendChild(line);
        const pend: { line: SVGPathElement; boundary?: any } = { line };
        this.pending.set(s.id, pend);
        w.fetch(dir + 'boundary.json').then((r) => (r.ok ? r.json() : undefined)).then((b) => {
          pend.boundary = b;
          this.dirty = true;
        }).catch(() => undefined);
        p = mountScene(w, this.registry!, dir, slug, wrapEl).then((scene) => {
          if (this.scenes.get(s.id) !== p) {
            scene.stop(); // 로딩 중에 멀어짐
            wrapEl.remove();
            line.remove();
            return scene;
          }
          const clip = ns('clipPath') as SVGClipPathElement;
          clip.id = slug + '-clip';
          clip.appendChild(ns('path'));
          this.sceneDefsEl.appendChild(clip);
          if (scene.boundary) wrapEl.setAttribute('clip-path', `url(#${clip.id})`);
          this.pending.delete(s.id);
          this.mounted.set(s.id, { scene, wrap: wrapEl, clip, line, at: w.performance.now() });
          this.dirty = true;
          return scene;
        });
        p.catch((e) => {
          console.error('[world] 장면 로드 실패', s.id, e); // 실패한 promise 는 남겨 둬서 매 프레임 재시도하지 않는다 (멀어졌다 다시 오면 재시도)
          wrapEl.remove();
          line.remove();
          this.pending.delete(s.id);
        });
        this.scenes.set(s.id, p);
      }
      return p;
    }

    private unmount(id: string) {
      const m = this.mounted.get(id);
      this.scenes.delete(id);
      this.pending.get(id)?.line.remove();
      this.pending.delete(id);
      if (!m) return;
      m.scene.stop();
      m.wrap.remove();
      m.clip.remove();
      m.line.remove();
      this.mounted.delete(id);
    }

    // bounds 전체가 화면에 들어오는 줌
    private fitK([[w0, s0], [e0, n0]]: Bounds) {
      const rad = Math.PI / 180;
      const wpx = (e0 - w0) * rad * this.R0 * Math.cos(((s0 + n0) / 2) * rad);
      const hpx = (n0 - s0) * rad * this.R0;
      return Math.min(this.W / wpx, this.H / hpx) * 0.92;
    }

    private flyTo(s: Sector) {
      this.wantId = s.local ? s.id : undefined;
      const b = s.focus ?? s.bounds;
      if (b) {
        const [[w0, s0], [e0, n0]] = b;
        this.target = { lon: (w0 + e0) / 2, lat: (s0 + n0) / 2, k: clamp(this.fitK(b), K_MIN, K_MAX) };
      } else {
        this.target = { lon: s.geo.lon, lat: s.geo.lat, k: clamp(s.zoom[0] * 3, K_MIN, K_MAX) };
      }
      this.touch();
    }

    // ---------------- 현재 위치 · URL ----------------
    private updatePlace() {
      this.applyTime();
      const center: LL = [this.lon, this.lat];
      const sceneShown = [...this.mounted.keys()].some((id) => this.sceneOpacity(id) > 0.3);
      const sub = this.sectors.find((s) => this.sceneOpacity(s.id) > 0.5);
      let place: string;
      let soon: boolean;
      if (this.worldId === 'earth') {
        // 장면 안이면 sector 의 국가 코드가 우선 (섬·해안 도시는 110m 국가 폴리곤 밖으로 판정된다)
        const iso = sub && this.isoOf.get(sub.id);
        const here = (iso && this.countries.find((c) => c.properties.iso === iso)) || this.countries.find((c) => geoContains(c, center));
        if (here !== this.here) {
          this.countryEls.forEach((el, i) => el.classList.toggle('here', this.countries[i] === here));
          this.here = here;
        }
        place = here ? `${flagOf(here.properties.iso)} ${here.properties.name}${sub ? ' · ' + sub.name : ''}` : '🌊 바다 위';
        soon = !!here && this.k >= 6 && !sceneShown;
        w.clearTimeout(this.radioTimer);
        if (this.radioOn && !this.pinned && here && here.properties.iso !== this.playing?.iso && /^[A-Z]{2}$/.test(here.properties.iso))
          this.radioTimer = w.setTimeout(() => this.autoTune(here.properties.iso, here.properties.name), 1200);
      } else {
        // 이름 있는 지형 중 화면 중심을 품은 가장 작은 것
        const hit = this.feats
          .filter(({ f, geo }) => f.name && f.circle && geoContains(geo, center))
          .sort((a, b) => a.f.circle![2] - b.f.circle![2])[0];
        this.hereFeat = hit?.f;
        place = `${this.meta.icon} ${this.meta.name}${hit ? ' · ' + hit.f.name : ''}`;
        soon = this.k >= 4 && !sceneShown;
      }
      this.soonTextEl.textContent = this.worldId === 'earth' ? '🚧 아직 준비 중인 곳이에요' : '🚧 아직 아무도 살지 않는 곳이에요';
      this.soonEl.classList.toggle('show', soon && !this.loadingShown);
      this.setPlace(place);
      this.writeUrl();
    }

    private writeUrl() {
      const q = new URLSearchParams(w.location.search);
      q.set('w', this.worldId);
      q.set('lat', this.lat.toFixed(4));
      q.set('lon', this.lon.toFixed(4));
      q.set('z', this.k < 10 ? this.k.toFixed(2) : this.k.toFixed(0));
      if (this.timeMode !== 'auto') q.set('t', this.timeMode);
      else q.delete('t');
      if (this.weather !== 'clear') q.set('wx', this.weather);
      else q.delete('wx');
      const url = `${w.location.pathname}?${q.toString()}`;
      if (url === this.lastUrl) return;
      this.lastUrl = url;
      w.history.replaceState(w.history.state, '', url);
    }

    private setPlace(text: string) {
      const el = this.placeEl;
      if (el) el.textContent = text;
    }

    // ---------------- 라디오 ----------------
    // 보고 있는 나라의 방송국 목록을 불러온다 (재생과 무관). 더 늦게 시작한 요청이 있으면 결과를 버린다
    private async loadList(iso: string, country: string): Promise<Station[] | undefined> {
      const token = ++this.listToken;
      this.listIso = iso;
      this.listCountry = country;
      this.stations = [];
      this.renderStations('📡 주파수를 찾는 중…');
      try {
        const canHls = this.audioEl.canPlayType('application/vnd.apple.mpegurl') !== '';
        const list = await stationsNear(w, iso, this.lat, this.lon, canHls);
        if (token !== this.listToken) return undefined;
        this.stations = list;
        this.renderStations();
        return list;
      } catch {
        if (token === this.listToken) this.renderStations('라디오 서버에 연결할 수 없어요');
        return undefined;
      }
    }

    // 고정하지 않았으면 나라가 바뀔 때 그 나라 가장 가까운 방송으로. 방송이 없으면 지금 방송을 계속 튼다
    private async autoTune(iso: string, country: string) {
      const list = await this.loadList(iso, country);
      if (!list || this.pinned || !this.radioOn) return;
      if (list.length) this.playFrom(list, 0, iso, country);
      else if (this.playing) this.toast(`📻 ${country}엔 들을 수 있는 방송이 없어 ${this.playing.s.name} 을(를) 계속 들려드려요`, 5000);
    }

    private playFrom(list: Station[], i: number, iso: string, country: string) {
      const s = list[i];
      if (!s) return;
      this.playing = { s, iso, country, list };
      this.failCount = 0;
      this.setRadioOn(true);
      const audio = this.audioEl;
      audio.src = s.url;
      audio.play().catch(() => {});
      this.saveRadio();
      this.renderStations();
    }

    private setRadioOn(on: boolean) {
      this.radioOn = on;
      this.btnFabEl.classList.toggle('on', on);
      this.btnRadioEl.textContent = on ? '⏸' : '▶';
    }

    private saveRadio() {
      try {
        w.localStorage.setItem('world.radio', JSON.stringify(this.pinned && this.playing ? { pinned: true, s: this.playing.s, iso: this.playing.iso, country: this.playing.country } : { pinned: false }));
      } catch {
        /* 기억 못 해도 재생은 된다 */
      }
    }

    // 같은 나라 안에서 화면을 옮겼으면 지금 화면 중심 기준으로 다시 가까운 순
    private resortStations() {
      this.stations.forEach((s) => {
        if (s.lat != null && s.lon != null) s.km = distanceKm(this.lat, this.lon, s.lat, s.lon);
      });
      this.stations.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
    }

    private renderStations(status?: string) {
      const p = this.playing;
      const km = p?.s.lat != null ? ` · ${Math.round(distanceKm(this.lat, this.lon, p.s.lat, p.s.lon!))}km` : '';
      this.radioNameEl.textContent = p ? `${flagOf(p.iso)} ${p.s.name}${km}${this.radioOn ? '' : ' (멈춤)'}` : '아래에서 방송을 골라 보세요';
      this.btnPinEl.classList.toggle('on', this.pinned);
      this.btnPinEl.title = this.pinned ? '고정 풀기 (나라를 옮기면 그 나라 방송으로)' : '이 방송 고정 (나라를 옮겨도 계속)';
      this.stationsTitleEl.textContent = this.listIso ? `📻 ${flagOf(this.listIso)} ${this.listCountry} 방송 ${this.stations.length}곳 · 가까운 순` : '📻 방송국';
      const empty = status ?? (this.worldId !== 'earth' ? '🌌 우주에서는 방송이 잡히지 않아요' : this.listIso ? '이 나라는 들을 수 있는 방송이 없어요' : '땅 위로 가면 그 나라 방송국이 잡혀요');
      this.stationsListEl.innerHTML =
        !status && this.stations.length
          ? this.stations
              .map((s, i) => {
                const on = s.url === p?.s.url;
                return `<button class="st${on ? ' on' : ''}" data-i="${i}"><span class="st-name">${on ? '🔊 ' : ''}${esc(s.name)}</span><span class="st-km">${s.km != null ? Math.round(s.km) + 'km' : ''}</span></button>`;
              })
              .join('')
          : `<div class="st-empty">${esc(empty)}</div>`;
    }

    @event('#audio', 'error')
    onAudioError() {
      const p = this.playing;
      if (!this.radioOn || !p) return;
      if (++this.failCount >= Math.min(8, p.list.length)) {
        this.setRadioOn(false);
        return this.renderStations();
      }
      this.toast(`📻 ${p.s.name} 이(가) 응답이 없어 다음 방송으로`);
      const fails = this.failCount;
      this.playFrom(p.list, (p.list.indexOf(p.s) + 1) % p.list.length, p.iso, p.country);
      this.failCount = fails; // playFrom 이 0 으로 되돌리므로 연속 실패 횟수 유지
    }

    @event('#audio', 'playing')
    onAudioPlaying() {
      this.failCount = 0;
    }

    @event('#btn-radio', 'click')
    onRadio() {
      const audio = this.audioEl;
      if (this.radioOn) {
        audio.pause();
        this.setRadioOn(false);
        return this.renderStations();
      }
      if (this.playing) {
        if (!audio.src) audio.src = this.playing.s.url;
        audio.play().catch(() => {});
        this.setRadioOn(true);
        return this.renderStations();
      }
      if (this.stations.length) this.playFrom(this.stations, 0, this.listIso, this.listCountry);
    }

    @event('#btn-next', 'click')
    onNext() {
      const p = this.playing;
      if (p) this.playFrom(p.list, (p.list.indexOf(p.s) + 1) % p.list.length, p.iso, p.country);
    }

    @event('#btn-pin', 'click')
    onPin() {
      if (!this.playing) return this.toast('📌 먼저 방송을 하나 골라 주세요');
      this.pinned = !this.pinned;
      this.saveRadio();
      this.renderStations();
      this.toast(this.pinned ? `📌 ${this.playing.s.name} 고정 — 어디로 가든 계속 들려드려요` : '📌 고정을 풀었어요 — 나라를 옮기면 그 나라 방송으로 바뀌어요');
    }

    @event('#btn-fab', 'click')
    onList() {
      const here = this.here;
      const iso = here?.properties.iso;
      if (this.worldId === 'earth' && iso && /^[A-Z]{2}$/.test(iso) && iso !== this.listIso) this.loadList(iso, here!.properties.name);
      else {
        this.resortStations();
        this.renderStations();
      }
      this.openSheet(this.stationsEl);
    }

    @eventDelegate('#stations-list .st', 'click')
    onPickStation(e: MouseEvent) {
      const b = (e.target as Element).closest<HTMLElement>('.st');
      if (b) this.playFrom(this.stations, Number(b.dataset.i), this.listIso, this.listCountry);
    }

    // ---------------- 시트 (시간·날씨 / 방송국 / 세계) — 한 번에 하나만 ----------------
    private openSheet(el: HTMLElement) {
      const willOpen = !el.classList.contains('show');
      this.onSheetClose();
      if (willOpen) el.classList.add('show');
    }

    private onSheetClose() {
      this.sheetEls.forEach((it) => it.classList.remove('show'));
    }

    // 닫기 버튼이 시트마다 있다
    @eventDelegate('.sheet-close', 'click')
    onSheetCloseClick() {
      this.onSheetClose();
    }

    @event('#btn-world', 'click')
    onWorldMenu() {
      this.openSheet(this.worldsEl);
    }

    @eventDelegate('#world-list [data-world]', 'click')
    async onPickWorld(e: MouseEvent) {
      const id = (e.target as Element).closest<HTMLElement>('[data-world]')?.dataset.world;
      if (!id) return;
      this.onSheetClose();
      if (id === '__overview' || id === this.worldId) {
        this.target = { lon: this.lon, lat: clamp(this.lat, -30, 30), k: 1 };
        this.touch();
        return;
      }
      await this.loadWorld(id);
      this.toast(`${this.meta.icon} ${this.meta.name}에 왔어요`);
    }

    // ---------------- 입력 ----------------
    private touch() {
      this.lastInteract = w.performance.now();
    }

    // 화면 점 (px, py) 아래의 땅이 그대로 그 자리에 있도록 줌 (핀치·휠)
    private zoomAround(px: number, py: number, factor: number) {
      const r = this.stageEl.getBoundingClientRect();
      const pt: LL = [px - r.left, py - r.top];
      this.syncProj();
      const ll = this.proj.invert?.(pt);
      this.k = clamp(this.k * factor, K_MIN, K_MAX);
      this.syncProj();
      const p2 = ll && !isNaN(ll[0]) ? this.proj(ll as LL) : null;
      if (p2 && geoDistance(ll as LL, [this.lon, this.lat]) < 1.4) {
        const deg = 180 / Math.PI / (this.R0 * this.k);
        this.lon = wrap(this.lon + (p2[0] - pt[0]) * deg);
        this.lat = clamp(this.lat - (p2[1] - pt[1]) * deg, -85, 85);
      }
      this.target = null;
      this.dirty = true;
    }

    private zoomInAt(px: number, py: number) {
      const r = this.stageEl.getBoundingClientRect();
      const ll = this.proj.invert?.([px - r.left, py - r.top]);
      if (!ll || isNaN(ll[0])) return;
      this.target = { lon: ll[0], lat: ll[1], k: clamp(this.k * 2.5, K_MIN, K_MAX) };
      this.touch();
    }

    @event('#stage', 'pointerdown')
    onDown(e: PointerEvent) {
      this.lastPointerType = e.pointerType;
      if ((e.target as Element).closest('.marker')) return; // 캡처하면 마커 click 이 svg 로 빠진다
      this.onSheetClose();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0, t: w.performance.now() });
      this.target = null;
      this.wantId = undefined;
      this.stopFollow();
      this.touch();
    }

    @event('#stage', 'pointermove')
    onMove(e: PointerEvent) {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const moved = prev.moved + Math.hypot(e.clientX - prev.x, e.clientY - prev.y);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        this.pointers.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY, moved });
        const [c, d] = [...this.pointers.values()];
        const after = Math.hypot(c.x - d.x, c.y - d.y);
        if (before > 0) this.zoomAround((c.x + d.x) / 2, (c.y + d.y) / 2, after / before);
      } else {
        const deg = 180 / Math.PI / (this.R0 * this.k);
        this.lon = wrap(this.lon - (e.clientX - prev.x) * deg);
        this.lat = clamp(this.lat + (e.clientY - prev.y) * deg, -85, 85);
        this.pointers.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY, moved });
      }
      this.dirty = true;
      this.touch();
    }

    @event('#stage', ['pointerup', 'pointercancel'])
    onUp(e: PointerEvent) {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      this.touch();
      if (p && e.type === 'pointerup' && p.moved < 8 && w.performance.now() - p.t < 450 && !this.pointers.size) this.tapPick(e.clientX, e.clientY);
      // 터치 더블탭 → 그 자리로 확대 (모바일은 dblclick 이 안정적으로 오지 않는다)
      if (!p || e.type !== 'pointerup' || e.pointerType !== 'touch' || p.moved > 10 || w.performance.now() - p.t > 300) return;
      const now = w.performance.now();
      if (this.lastTap && now - this.lastTap.t < 330 && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 30) {
        this.lastTap = undefined;
        this.zoomInAt(e.clientX, e.clientY);
      } else this.lastTap = { x: e.clientX, y: e.clientY, t: now };
    }

    @event('#stage', 'wheel', { passive: false })
    onWheel(e: WheelEvent) {
      e.preventDefault();
      this.wantId = undefined;
      this.stopFollow();
      this.zoomAround(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0018));
      this.touch();
    }

    @event('#stage', 'dblclick')
    onDbl(e: MouseEvent) {
      if (this.lastPointerType === 'touch') return; // 터치는 onUp 의 더블탭이 처리
      this.zoomInAt(e.clientX, e.clientY);
    }

    // ---------------- 📖 도감: 개체·지명·지구본 교통을 누르면 정보 팝업, 🎥 따라가기 ----------------
    // Dex: 누른 것 하나. geo = 지금 위치(경위도) — 따라가기는 이것만 본다 (장면 개체든 지구본 교통이든 같다)
    private follow?: { dex: Dex; k: number };
    private dex?: Promise<Map<string, DexEntry>>;
    private sectorInfo = new Map<string, Promise<Record<string, DexEntry>>>();
    private infoPick?: Dex;

    // 손가락 끝은 크다: 누른 점과 주변 몇 점을 훑어 처음 걸리는 것 (장면 개체·지명, 지구본 교통)
    private tapPick(x: number, y: number) {
      const root = this.shadowRoot ?? w.document;
      for (const [dx, dy] of [[0, 0], [7, 0], [-7, 0], [0, 7], [0, -7], [10, 10], [-10, 10], [10, -10], [-10, -10]]) {
        for (const el of root.elementsFromPoint(x + dx, y + dy)) {
          for (const [id, m] of this.mounted) {
            if (!m.wrap.contains(el) || this.sceneOpacity(id) < 0.5) continue;
            const picked = m.scene.pick(el);
            if (picked) return void this.showInfo(this.sceneDex(id, picked));
          }
          const tr = this.trafficEl.contains(el) ? this.traffic?.locate(el) : undefined;
          if (tr) return void this.showInfo({ use: tr.route.use, place: tr.route.name, moving: true, geo: tr.geo });
        }
      }
    }

    // 장면 개체·지명 → Dex (로컬 좌표 → 경위도)
    private sceneDex(id: string, picked: Picked): Dex {
      const sector = this.sectors.find((s) => s.id === id);
      const geo = (): LL | undefined => {
        const m = this.mounted.get(id);
        const b = sector?.bounds;
        if (!m || !b) return undefined;
        const [x, y] = picked.pos();
        const [sw, sh] = m.scene.size;
        return [b[0][0] + (x / sw) * (b[1][0] - b[0][0]), b[1][1] - (y / sh) * (b[1][1] - b[0][1])];
      };
      return { use: picked.use, label: picked.label, sectorId: id, place: sector?.name, moving: picked.moving, geo };
    }

    private async showInfo(d: Dex) {
      this.infoPick = d;
      let e: DexEntry | undefined;
      if (d.use) {
        this.dex ??= w.fetch(DATA + 'entities.json').then((r) => r.json()).then((j: { entities: ({ id: string } & DexEntry)[] }) => new Map(j.entities.map((it) => [it.id, it] as const)));
        e = (await this.dex).get(d.use);
      } else if (d.label && d.sectorId) {
        let p = this.sectorInfo.get(d.sectorId);
        if (!p) this.sectorInfo.set(d.sectorId, (p = w.fetch(`${DATA}worlds/${this.worldId}/${d.sectorId}/sector.json`).then((r) => r.json()).then((j) => j.info ?? {})));
        e = (await p)[d.label];
      }
      if (this.infoPick !== d) return; // 그 사이 다른 걸 눌렀다
      const title = e?.title ?? e?.name ?? d.label ?? d.use ?? '';
      this.infoTitleEl.textContent = `${e?.emoji ?? (d.label ? '📍' : '🔎')} ${title}`;
      this.infoKindEl.textContent = [e?.kind ?? (d.label ? '지명' : ''), d.place].filter(Boolean).join(' · ');
      this.infoDescEl.textContent = e?.desc ?? '아직 도감에 적힌 이야기가 없어요.';
      this.btnFollowEl.style.display = d.moving ? '' : 'none';
      this.btnFollowEl.textContent = this.follow?.dex === d ? '⏹ 그만 따라가기' : '🎥 따라가기';
      this.onSheetClose();
      this.infoEl.classList.add('show');
    }

    @event('#btn-follow', 'click')
    onFollow() {
      const d = this.infoPick;
      if (!d) return;
      if (this.follow?.dex === d) return this.stopFollow();
      // 장면 개체는 지역 전체 화면의 4배까지 다가간다. 지구본 교통은 지금 줌 그대로 (이미 더 가까우면 그대로)
      const b = d.sectorId ? this.sectors.find((s) => s.id === d.sectorId)?.bounds : undefined;
      this.follow = { dex: d, k: clamp(Math.max(this.k, b ? this.fitK(b) * 4 : this.k), K_MIN, K_MAX) };
      this.target = null;
      this.wantId = d.sectorId; // 따라가는 동안 장면이 떨어지지 않게
      this.btnFollowEl.textContent = '⏹ 그만 따라가기';
      this.onSheetClose();
      this.toast('🎥 따라가는 중이에요 · 화면을 움직이면 멈춰요');
    }

    private stopFollow() {
      if (!this.follow) return;
      this.follow = undefined;
      if (this.btnFollowEl) this.btnFollowEl.textContent = '🎥 따라가기';
    }

    // 따라가는 것의 지금 경위도로 카메라 중심을 부드럽게 옮긴다
    private followStep(dt: number) {
      const f = this.follow!;
      const ll = f.dex.geo?.();
      if (!ll) return this.stopFollow();
      const a = 1 - Math.exp(-dt * 4);
      this.lon += wrap(ll[0] - this.lon) * a;
      this.lat += (clamp(ll[1], -85, 85) - this.lat) * a;
      this.k = Math.exp(Math.log(this.k) + (Math.log(f.k) - Math.log(this.k)) * a);
      this.dirty = true;
    }

    @eventDelegate('.marker', 'click')
    onMarker(e: MouseEvent) {
      const id = (e.target as Element).closest('.marker')?.getAttribute('data-id');
      const s = this.sectors.find((it) => it.id === id);
      if (s) this.flyTo(s);
    }

    // ---------------- 🔍 지역 검색 · 목록 (만들어진 지역만, 모든 세계) ----------------
    private isoOf = new Map<string, string>(); // 지구 sector → 국가 코드 (국기 표시용, 지구를 불러올 때 채움)

    private regions(filter = '') {
      const q = filter.trim().toLowerCase();
      return this.worlds.flatMap((wm) =>
        wm.sectors
          .filter((s) => s.local)
          .map((s) => ({ wm, s, label: `${wm.name} ${s.name} ${s.id}`.toLowerCase() }))
          .filter((r) => !q || r.label.includes(q)),
      );
    }

    private renderSearch() {
      const list = this.regions(this.searchInputEl.value);
      this.searchListEl.innerHTML = list.length
        ? list
            .map(({ wm, s }) => {
              const flag = flagOf(this.isoOf.get(s.id));
              const here = wm.id === this.worldId && this.sceneOpacity(s.id) > 0.5;
              return `<button class="st region${here ? ' on' : ''}" data-world="${wm.id}" data-sector="${esc(s.id)}"><span class="st-name">${flag || wm.icon} ${esc(s.name)}</span><span class="st-km">${wm.icon} ${esc(wm.name)}</span></button>`;
            })
            .join('')
        : `<div class="st-empty">'${esc(this.searchInputEl.value)}' 에 맞는 지역이 아직 없어요</div>`;
    }

    private async goRegion(worldId: string, sectorId: string) {
      if (worldId !== this.worldId) await this.loadWorld(worldId);
      const s = this.sectors.find((it) => it.id === sectorId);
      if (s) this.flyTo(s);
    }

    @event('#btn-search', 'click')
    onSearchOpen() {
      this.renderSearch();
      this.openSheet(this.searchEl);
      if (this.searchEl.classList.contains('show') && w.matchMedia('(pointer: fine)').matches) this.searchInputEl.focus(); // 모바일은 키보드가 바로 올라오지 않게
    }

    @event('#search-input', 'input')
    onSearchInput() {
      this.renderSearch();
    }

    @eventDelegate('.region', 'click')
    onRegionPick(e: MouseEvent) {
      const b = (e.target as Element).closest<HTMLElement>('.region');
      if (!b) return;
      this.onSheetClose();
      this.goRegion(b.dataset.world!, b.dataset.sector!);
    }

    // 검색 결과 안에서 랜덤 (검색어가 없으면 만들어진 지역 전체에서)
    @event('#btn-search-random', 'click')
    onSearchRandom() {
      const list = this.regions(this.searchInputEl.value);
      const r = pick(list);
      if (!r) return this.toast('🎲 고를 지역이 없어요');
      this.onSheetClose();
      this.toast(`🎲 ${r.wm.icon} ${r.s.name}(으)로 떠나요`);
      this.goRegion(r.wm.id, r.s.id);
    }

    @event('#btn-random', 'click')
    onRandom() {
      // 현재 세계 안에서: 만들어진 마을(가중치 높게) · 준비 중 마커 · 나라(지구) / 이름 있는 지형(달·화성)
      type Dest = { name: string; go: () => void };
      const dests: Dest[] = [];
      for (const s of this.sectors) {
        const d = { name: s.name, go: () => this.flyTo(s) };
        dests.push(d);
        if (s.local) dests.push(d, d, d);
      }
      this.countries
        .filter((c) => geoArea(c) > 0.002)
        .forEach((c) => {
          const [lon, lat] = geoCentroid(c);
          dests.push({ name: `${flagOf(c.properties.iso)} ${c.properties.name}`, go: () => (this.target = { lon, lat, k: clamp(1.4 / Math.sqrt(geoArea(c)), 3, 14) }) });
        });
      this.feats
        .filter(({ f }) => f.name && f.circle)
        .forEach(({ f }) => dests.push({ name: f.name, go: () => (this.target = { lon: f.circle![0], lat: f.circle![1], k: clamp(40 / f.circle![2], 2, 20) }) }));
      const d = pick(dests);
      if (!d) return;
      d.go();
      this.touch();
      this.toast(`🎲 ${d.name}(으)로 떠나요`);
    }

    // ▶️ 자동 여행: 켜 두면 만들어진 지역(모든 세계)을 무작위로 돌아다닌다. 손으로 움직이면 그만큼 더 머문다
    private touring = false;

    @event('#btn-tour', 'click')
    onTourToggle() {
      this.touring = !this.touring;
      const b = this.btnTourEl;
      b.textContent = this.touring ? '⏸️' : '▶️';
      b.title = this.touring ? '자동 여행 끄기' : '만들어진 지역 자동 여행 켜기';
      b.classList.toggle('on', this.touring);
      if (!this.touring) return this.toast('⏸️ 자동 여행을 멈췄어요');
      this.lastInteract = -Infinity;
      this.onTourTick();
    }

    @setInterval(1000)
    onTourTick() {
      if (!this.touring || w.performance.now() - this.lastInteract < TOUR_STAY_MS) return;
      const r = pick(this.regions().filter((it) => !(it.wm.id === this.worldId && this.sceneOpacity(it.s.id) > 0.5)));
      if (!r) return;
      this.touch();
      this.toast(`▶️ ${r.wm.icon} ${r.s.name}(으)로 가요`);
      this.goRegion(r.wm.id, r.s.id);
    }

    @event('#btn-share', 'click')
    async onShare() {
      this.writeUrl();
      const url = w.location.href;
      const text = `${this.placeEl.textContent} — 작은 지구`;
      try {
        if (w.navigator.share) return await w.navigator.share({ title: '작은 지구', text, url });
        await w.navigator.clipboard.writeText(url);
        this.toast('🔗 지금 보는 곳 링크를 복사했어요');
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return; // 공유 시트를 닫음
        this.toast(`🔗 ${url}`, 8000);
      }
    }

    @event('#btn-me', 'click')
    onMe() {
      // geolocation 은 https 또는 localhost 에서만 동작 (http://192.168.. 로 접속하면 브라우저가 막는다)
      if (!w.isSecureContext || !w.navigator.geolocation) return this.toast('📍 내 위치는 https(또는 localhost) 주소에서만 쓸 수 있어요', 6000);
      this.toast('📍 위치를 찾는 중…', 15000);
      w.navigator.geolocation.getCurrentPosition(
        async (pos) => {
          this.me = { lon: pos.coords.longitude, lat: pos.coords.latitude };
          if (this.worldId !== 'earth') await this.loadWorld('earth');
          const s = this.sectors.find(({ bounds: b }) => b && this.me!.lon >= b[0][0] && this.me!.lon <= b[1][0] && this.me!.lat >= b[0][1] && this.me!.lat <= b[1][1]);
          this.target = { ...this.me, k: clamp(s?.bounds ? this.fitK(s.bounds) * 2.5 : 40, K_MIN, K_MAX) };
          this.touch();
          this.toast(s ? `📍 지금 ${s.name}에 계시네요` : '📍 여기가 지금 계신 곳이에요');
        },
        (err) => {
          const msg: Record<number, string> = {
            1: '📍 위치 권한이 막혀 있어요. 주소창 왼쪽 자물쇠 → 위치 허용 (macOS 는 시스템 설정 › 개인정보 보호 › 위치 서비스도 확인)',
            2: '📍 지금 위치를 알 수 없어요. Wi‑Fi 를 켜면 잡힐 수 있어요',
            3: '📍 위치를 찾는 데 너무 오래 걸렸어요. 다시 눌러 주세요',
          };
          this.toast(msg[err.code] ?? '📍 위치를 찾지 못했어요', 7000);
        },
        { enableHighAccuracy: false, maximumAge: 600000, timeout: 15000 },
      );
    }

    private toast(text: string, ms = 3500) {
      const el = this.toastEl;
      el.textContent = text;
      el.classList.add('show');
      w.clearTimeout(this.toastTimer);
      this.toastTimer = w.setTimeout(() => el.classList.remove('show'), ms);
    }

    // ---------------- 시간 · 날씨 ----------------
    // 1분마다 현지 시각 반영 — SWC @setInterval
    @setInterval(60000)
    onClock() {
      this.applyTime();
    }

    // 랜덤 시간·날씨: 고른 쪽만 일정 간격으로 다른 값으로 바뀐다
    @setInterval(ENV_SHUFFLE_MS)
    onEnvShuffle() {
      if (this.timeMode !== 'random' && this.weather !== 'random') return;
      if (this.timeMode === 'random') this.rndPhase = pickOther(Object.keys(PHASES) as Phase[], this.rndPhase);
      if (this.weather === 'random') this.rndWeather = pickOther(Object.keys(WEATHERS) as Weather[], this.rndWeather);
      if (this.weatherEl) this.applyTime();
    }

    // 화면 중심 경도의 현지 시각으로 화면 전체에 색조, 장면에는 --night (불빛). 멀리 볼 때·대기 없는 세계는 색조·날씨 없음
    private applyTime() {
      const h = solarHour(this.lon);
      const key = this.timeMode === 'auto' ? phaseOf(h) : this.timeMode === 'random' ? this.rndPhase : this.timeMode;
      const weather = this.weather === 'random' ? this.rndWeather : this.weather;
      const ph = PHASES[key];
      const air = this.world?.atmosphere !== false;
      const near = air ? clamp((this.k - 4) / 6, 0, 1) : 0;
      const tint = this.tintEl;
      tint.setAttribute('fill', ph.tint);
      tint.style.opacity = String(ph.op * near);
      this.scenesEl.style.setProperty('--night', String(ph.night));
      const wx = this.weatherEl;
      wx.setAttribute('data-w', weather);
      wx.style.opacity = String(near);
      // 위쪽 버튼 = 지금 고른 시간대 아이콘 (+ 맑음이 아니면 날씨 배지)
      this.btnEnvEl.innerHTML = air ? `${ph.icon}${weather !== 'clear' ? `<span class="badge">${WEATHERS[weather].icon}</span>` : ''}` : '🌌';
      this.renderEnv(key, weather, h, air);
      return { h, ph };
    }

    private renderEnv(current: Phase, weather: Weather, h: number, air: boolean) {
      if (!air) {
        this.envTimeEl.innerHTML = `<div class="st-empty">🌌 ${esc(this.meta?.name ?? '')}에는 대기가 없어 하늘빛·날씨가 없어요</div>`;
        this.envWeatherEl.innerHTML = '';
        return;
      }
      const t = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
      const label = (m: TimeMode) => (m === 'auto' ? `🕐 현지 ${t} (${PHASES[current].icon})` : m === 'random' ? `🔀 랜덤${this.timeMode === 'random' ? ` (${PHASES[current].icon})` : ''}` : `${PHASES[m].icon} ${PHASES[m].label}`);
      this.envTimeEl.innerHTML = (['auto', 'random', 'dawn', 'morning', 'day', 'sunset', 'dusk', 'night'] as TimeMode[])
        .map((m) => `<button class="chip${this.timeMode === m ? ' on' : ''}" data-time="${m}">${label(m)}</button>`)
        .join('');
      this.envWeatherEl.innerHTML = (['random', ...Object.keys(WEATHERS)] as WeatherMode[])
        .map((k) => `<button class="chip${this.weather === k ? ' on' : ''}" data-weather="${k}">${k === 'random' ? `🔀 랜덤${this.weather === 'random' ? ` (${WEATHERS[weather].icon})` : ''}` : `${WEATHERS[k].icon} ${WEATHERS[k].label}`}</button>`)
        .join('');
    }

    @event('#btn-env', 'click')
    onEnvToggle() {
      this.applyTime();
      this.openSheet(this.envEl);
    }

    @eventDelegate('#env button', 'click')
    onEnvPick(e: MouseEvent) {
      const b = (e.target as Element).closest<HTMLElement>('button');
      if (!b?.dataset.time && !b?.dataset.weather) return;
      const changed = (b.dataset.time && b.dataset.time !== this.timeMode) || (b.dataset.weather && b.dataset.weather !== this.weather);
      if (isTime(b.dataset.time)) this.timeMode = b.dataset.time;
      if (isWeather(b.dataset.weather)) this.weather = b.dataset.weather;
      if (changed) this.onEnvShuffle(); // 랜덤을 고르면 바로 한 번 바뀐다
      try {
        w.localStorage.setItem(ENV_KEY, JSON.stringify({ time: this.timeMode, weather: this.weather }));
      } catch {
        /* 저장 못 해도 이번 화면에는 적용 */
      }
      this.applyTime();
      this.writeUrl();
    }

    @event('#btn-soon', 'click')
    async onSoon() {
      if (this.worldId !== 'earth') await this.loadWorld('earth');
      const s = this.sectors.find((it) => it.local);
      if (s) this.flyTo(s);
    }

    @event('#btn-back', 'click')
    onBack() {
      this.router?.go('/');
    }

    @onConnectedBodyShadow
    template() {
      return `
        <style>
          :host { display: block; position: fixed; inset: 0; font-family: var(--font-family, -apple-system, 'Apple SD Gothic Neo', sans-serif); color: #3b4a5a;
            -webkit-tap-highlight-color: transparent; }
          .wrap { position: absolute; inset: 0; overflow: hidden; background: radial-gradient(ellipse at 50% 40%, #33406b 0%, #1d2444 55%, #12162b 100%); }
          #stage { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: grab; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
          #stage:active { cursor: grabbing; }
          #stars circle { fill: #fff; }
          #stars .tw { animation: tw 6s ease-in-out infinite; }
          @keyframes tw { 50% { opacity: 0.1; } }
          #graticule { fill: none; stroke: #fff; stroke-opacity: 0.18; stroke-width: 0.5; }
          .country { stroke-linejoin: round; transition: fill 1.2s ease; vector-effect: non-scaling-stroke; }
          .country.here { fill: #e9f5d9; }
          .feat { vector-effect: non-scaling-stroke; stroke-width: 1; }
          .feat.line { stroke-linecap: round; stroke-linejoin: round; vector-effect: none; }
          .marker { cursor: pointer; }
          .marker circle { fill: #ff8f70; stroke: #fff; stroke-width: 1.5; }
          .marker text { font-size: 13px; font-weight: 700; text-anchor: middle; fill: #34465a; paint-order: stroke; stroke: rgba(255,255,255,0.92); stroke-width: 3.5px; stroke-linejoin: round; }
          .marker.top text { font-size: 15px; }
          .marker .soon-tag { font-size: 10px; font-weight: 700; fill: #9a7b3c; }
          /* 경계: 칼선 대신 동글동글한 크림색 점선 (힐링 그림체) */
          .boundary { fill: none; stroke: #fff6df; stroke-opacity: 0.95; stroke-width: 4.2; stroke-linejoin: round; stroke-linecap: round; stroke-dasharray: 0.1 9; }
          /* ---- 날씨 (HTML 레이어, 합성 스레드 애니메이션) ---- */
          #weather { position: absolute; inset: 0; overflow: hidden; pointer-events: none; transition: opacity .6s; opacity: 0; }
          #weather .wx { position: absolute; display: none; pointer-events: none; }
          #weather[data-w="cloudy"] :is(.wx-dim, .wx-shade), #weather[data-w="rain"] :is(.wx-dim, .wx-shade, .wx-rain-a, .wx-rain-b),
          #weather[data-w="storm"] :is(.wx-dim, .wx-shade, .wx-rain-a, .wx-rain-b, .wx-rain-c, .wx-flash),
          #weather[data-w="snow"] :is(.wx-snow-a, .wx-snow-b, .wx-dim), #weather[data-w="fog"] :is(.wx-fog, .wx-shade) { display: block; }
          .wx-dim { inset: 0; background: #6f7d99; mix-blend-mode: multiply; opacity: 0.2; }
          #weather[data-w="rain"] .wx-dim { opacity: 0.3; }
          #weather[data-w="storm"] .wx-dim { opacity: 0.45; }
          #weather[data-w="snow"] .wx-dim { background: #e6eef8; mix-blend-mode: normal; opacity: 0.18; }
          /* 타일보다 넓게 깔고(-240px) 타일 크기만큼 옮겨서 끝없이 내리는 것처럼 */
          .wx-rain-a, .wx-rain-b, .wx-rain-c, .wx-snow-a, .wx-snow-b { inset: -240px; will-change: transform; animation: var(--fall) linear infinite; }
          .wx-rain-a { background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='80'%3E%3Cg stroke='%23e3efff' stroke-opacity='0.75' stroke-width='1.3' stroke-linecap='round'%3E%3Cline x1='12' y1='2' x2='8' y2='18'/%3E%3Cline x1='32' y1='44' x2='28' y2='60'/%3E%3C/g%3E%3C/svg%3E"); --fall: rainA 0.8s; }
          .wx-rain-c { background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='80'%3E%3Cg stroke='%23e3efff' stroke-opacity='0.75' stroke-width='1.3' stroke-linecap='round'%3E%3Cline x1='12' y1='2' x2='8' y2='18'/%3E%3Cline x1='32' y1='44' x2='28' y2='60'/%3E%3C/g%3E%3C/svg%3E"); background-position: 13px 29px; --fall: rainA 0.8s -0.37s; }
          .wx-rain-b { background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='120'%3E%3Cg stroke='%23cfe0f7' stroke-opacity='0.45' stroke-width='1' stroke-linecap='round'%3E%3Cline x1='20' y1='10' x2='17' y2='22'/%3E%3Cline x1='48' y1='70' x2='45' y2='82'/%3E%3C/g%3E%3C/svg%3E"); --fall: rainB 1.6s; }
          .wx-snow-a { background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cg fill='%23ffffff' stroke='%23c9d8ea' stroke-width='0.6'%3E%3Ccircle cx='20' cy='18' r='2.6'/%3E%3Ccircle cx='78' cy='52' r='2.2'/%3E%3Ccircle cx='46' cy='96' r='2.8'/%3E%3Ccircle cx='104' cy='104' r='2'/%3E%3C/g%3E%3C/svg%3E"); --fall: snowA 9s; }
          .wx-snow-b { background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cg fill='%23ffffff' opacity='0.8'%3E%3Ccircle cx='14' cy='30' r='1.4'/%3E%3Ccircle cx='58' cy='10' r='1.2'/%3E%3Ccircle cx='40' cy='64' r='1.5'/%3E%3C/g%3E%3C/svg%3E"); --fall: snowB 5s; }
          @keyframes rainA { to { transform: translate3d(-40px, 160px, 0); } }
          @keyframes rainB { to { transform: translate3d(-60px, 240px, 0); } }
          @keyframes snowA { 50% { transform: translate3d(14px, 60px, 0); } to { transform: translate3d(0, 120px, 0); } }
          @keyframes snowB { 50% { transform: translate3d(-8px, 40px, 0); } to { transform: translate3d(0, 80px, 0); } }
          /* 구름 그림자·안개: 큰 부드러운 덩어리가 천천히 흘러간다 */
          .wx-shade { inset: -20% -60%; will-change: transform; animation: wxDrift 90s linear infinite;
            background: radial-gradient(closest-side, rgba(44,54,80,0.22), transparent) 10% 20% / 45% 40% no-repeat,
                        radial-gradient(closest-side, rgba(44,54,80,0.2), transparent) 70% 70% / 55% 45% no-repeat; }
          .wx-fog { inset: -20% -60%; will-change: transform; animation: wxDrift 70s linear infinite;
            background: radial-gradient(closest-side, rgba(255,255,255,0.7), transparent) 20% 40% / 60% 45% no-repeat,
                        radial-gradient(closest-side, rgba(255,255,255,0.7), transparent) 75% 75% / 70% 50% no-repeat, rgba(243,245,247,0.42); }
          @keyframes wxDrift { from { transform: translate3d(-25%, 0, 0); } to { transform: translate3d(25%, 0, 0); } }
          .wx-flash { inset: 0; background: #fff; opacity: 0; will-change: opacity; animation: wxFlash 9s linear infinite; }
          @keyframes wxFlash { 0%, 80% { opacity: 0; } 81.5% { opacity: 0.55; } 84% { opacity: 0; } 86% { opacity: 0.32; } 100% { opacity: 0; } }
          .tint { mix-blend-mode: multiply; transition: opacity 2s ease, fill 2s ease; pointer-events: none; }
          #me .dot { fill: #3b82f6; stroke: #fff; stroke-width: 2.5; }
          #me .pulse { fill: #3b82f6; opacity: 0.35; transform-box: fill-box; transform-origin: center; animation: pulse 2s ease-out infinite; }
          @keyframes pulse { from { transform: scale(0.6); opacity: 0.5; } to { transform: scale(2.4); opacity: 0; } }
          .walking .body { animation: bob 0.44s ease-in-out infinite alternate; }
          @keyframes bob { to { transform: translateY(-0.7px); } }

          /* ---- UI: 크림색 게임 패널 ---- */
          button { border: 2px solid #ead7b8; border-radius: 14px; background: #fff8ec; color: #6b4f3a; font-size: 17px; width: 42px; height: 42px; cursor: pointer;
            box-shadow: 0 3px 0 #dcc29b; transition: transform .1s, box-shadow .1s; position: relative; padding: 0; font-family: inherit; }
          button:hover { background: #fffdf6; }
          button:active { transform: translateY(2px); box-shadow: 0 1px 0 #dcc29b; }
          .badge { position: absolute; right: -6px; bottom: -6px; font-size: 13px; line-height: 1; background: #fff8ec; border: 1.5px solid #ead7b8; border-radius: 10px; padding: 2px; }
          .panel { background: #fff8ec; border: 2px solid #ead7b8; box-shadow: 0 3px 0 #dcc29b; color: #6b4f3a; border-radius: 16px; }
          .bar { position: absolute; top: calc(14px + env(safe-area-inset-top, 0px)); left: 16px; right: 16px; display: flex; justify-content: space-between; align-items: center; pointer-events: none; gap: 8px; }
          .bar > * { pointer-events: auto; }
          .btns { display: flex; gap: 8px; align-items: center; }
          .title { font-weight: 800; font-size: 15px; padding: 8px 14px; white-space: nowrap; }
          .hud { position: absolute; left: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 6px; pointer-events: none; max-width: calc(100vw - 32px); }
          #place { align-self: flex-start; font-size: 17px; font-weight: 800; padding: 7px 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
          .hint { align-self: flex-start; font-size: 12px; font-weight: 600; color: #8a6d52; padding: 4px 10px; border-radius: 10px; background: rgba(255,248,236,0.85); }
          .fab { position: absolute; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); width: 46px; height: 46px; border-radius: 50%; font-size: 20px; }
          .fab .eq { position: absolute; right: -3px; top: -4px; display: none; gap: 1.5px; align-items: flex-end; height: 12px; padding: 2px 3px; border-radius: 8px; background: #ffe7a8; border: 1.5px solid #f0c96a; }
          .fab.on .eq { display: flex; }
          .fab .eq i { width: 2.5px; background: #c2523f; border-radius: 2px; animation: eq 0.9s ease-in-out infinite alternate; }
          .fab .eq i:nth-child(2) { animation-delay: -0.3s; } .fab .eq i:nth-child(3) { animation-delay: -0.6s; }
          @keyframes eq { from { height: 3px; } to { height: 10px; } }
          .now { display: flex; align-items: center; gap: 6px; padding: 6px 6px 6px 12px; border-radius: 14px; background: #fff1d6; }
          #radio-name { flex: 1; min-width: 0; font-size: 13px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .now button { width: 36px; height: 36px; font-size: 15px; border-radius: 12px; }
          #btn-pin { filter: grayscale(1); opacity: 0.55; }
          #btn-pin.on { filter: none; opacity: 1; background: #ffe7a8; border-color: #f0c96a; box-shadow: 0 2px 0 #e0b04f; }
          #toast, #soon, #loading { position: absolute; left: 50%; transform: translate(-50%, -8px); opacity: 0; pointer-events: none; transition: opacity .35s, transform .35s;
            padding: 10px 16px; font-weight: 700; font-size: 14px; max-width: calc(100vw - 32px); text-align: center; }
          #toast { top: calc(70px + env(safe-area-inset-top, 0px)); z-index: 20; }
          #soon { bottom: calc(76px + env(safe-area-inset-bottom, 0px)); display: flex; align-items: center; gap: 10px; white-space: nowrap; }
          #loading { bottom: calc(76px + env(safe-area-inset-bottom, 0px)); display: flex; align-items: center; gap: 8px; white-space: nowrap; }
          #loading i { width: 14px; height: 14px; border-radius: 50%; border: 2.5px solid #ead7b8; border-top-color: #e0a84f; animation: spin .8s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
          #toast.show, #soon.show, #loading.show { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
          #btn-soon, .chip, .st { width: auto; height: 34px; padding: 0 12px; font-size: 13px; font-weight: 800; border-radius: 12px; box-shadow: 0 2px 0 #dcc29b; }
          #btn-soon { background: #ffe7a8; border-color: #f0c96a; box-shadow: 0 2px 0 #e0b04f; white-space: nowrap; }
          #btn-tour.on, .chip.on, .st.on { background: #ffe7a8; border-color: #f0c96a; box-shadow: 0 2px 0 #e0b04f; }
          /* 시트: 데스크톱은 오른쪽 위 패널, 모바일은 아래에서 올라오는 시트 */
          .sheet { position: absolute; top: calc(70px + env(safe-area-inset-top, 0px)); right: 16px; width: min(400px, calc(100vw - 32px)); max-height: min(70vh, 560px); overflow: hidden;
            padding: 12px 14px 14px; display: none; flex-direction: column; gap: 10px; z-index: 10; }
          .sheet.show { display: flex; }
          .sheet > * { flex: none; }
          .sheet > .sheet-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; margin: 0 -4px; padding: 2px 4px 4px; }
          .info-kind { font-size: 12px; font-weight: 800; color: #9a7b5c; margin: 2px 0 6px; }
          .info-desc { margin: 0 0 12px; font-size: 14px; line-height: 1.65; color: #5b4636; word-break: keep-all; }
          .sheet-head { display: flex; align-items: center; justify-content: space-between; font-weight: 800; font-size: 14px; gap: 8px; }
          .sheet-close { width: 32px; height: 32px; font-size: 14px; border-radius: 10px; box-shadow: 0 2px 0 #dcc29b; flex: none; }
          .env-row { display: flex; gap: 10px; align-items: flex-start; }
          .env-label { font-size: 13px; font-weight: 800; padding-top: 8px; min-width: 28px; }
          .chips { display: flex; flex-wrap: wrap; gap: 6px; }
          #stations-list { display: flex; flex-direction: column; gap: 6px; }
          .st { display: flex; justify-content: space-between; align-items: center; gap: 10px; width: 100%; height: auto; min-height: 44px; padding: 9px 12px; text-align: left; flex: none; }
          .st-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .st-km { font-size: 12px; color: #9a7b5c; flex: none; }
          .st-empty { font-size: 13px; font-weight: 700; color: #8a6d52; padding: 8px 2px; }
          .search-row { display: flex; gap: 8px; }
          #search-input { flex: 1; min-width: 0; height: 40px; padding: 0 12px; border-radius: 12px; border: 2px solid #ead7b8; background: #fffdf6; color: #6b4f3a;
            font: inherit; font-size: 15px; font-weight: 700; outline: none; }
          #search-input:focus { border-color: #f0c96a; }
          #search-list { display: flex; flex-direction: column; gap: 6px; }

          @media (max-width: 640px) {
            .bar { left: 10px; right: 10px; top: calc(10px + env(safe-area-inset-top, 0px)); }
            .title, .hint { display: none; }
            .btns { gap: 6px; }
            button { width: 40px; height: 40px; border-radius: 12px; font-size: 17px; }
            .hud { left: 10px; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); max-width: calc(100vw - 80px); }
            #place { font-size: 15px; padding: 6px 12px; }
            .fab { right: 10px; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); width: 42px; height: 42px; font-size: 19px; }
            #soon { bottom: calc(60px + env(safe-area-inset-bottom, 0px)); font-size: 13px; padding: 8px 10px; gap: 8px; }
            #toast { top: calc(60px + env(safe-area-inset-top, 0px)); font-size: 13px; }
            .sheet { top: auto; bottom: 0; left: 0; right: 0; width: auto; max-height: 62vh; border-radius: 20px 20px 0 0; border-bottom: 0;
              padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); box-shadow: 0 -6px 24px rgba(20,26,48,0.25); }
            .st { min-height: 48px; font-size: 14px; }
            .chip { height: 38px; font-size: 14px; }
          }
        </style>
        <div class="wrap" data-world="earth">
          <svg id="stage" xmlns="${SVGNS}">
            <defs>
              <radialGradient id="surface-grad" cx="0.42" cy="0.38" r="0.7">
                <stop id="surface-a" offset="0" stop-color="#9fdcf5"/>
                <stop id="surface-b" offset="1" stop-color="#5fb0e0"/>
              </radialGradient>
              <radialGradient id="glow-grad">
                <stop id="glow-a" offset="0.82" stop-color="#9fd3ff" stop-opacity="0.35"/>
                <stop id="glow-b" offset="1" stop-color="#9fd3ff" stop-opacity="0"/>
              </radialGradient>
            </defs>
            <defs id="entity-defs"></defs>
            <defs id="scene-defs"></defs>
            <g id="stars"></g>
            <circle id="glow" fill="url(#glow-grad)"/>
            <circle id="surface" fill="url(#surface-grad)"/>
            <g id="features"></g>
            <path id="graticule"/>
            <g id="countries"></g>
            <g id="scenes"></g>
            <g id="boundaries"></g>
            <g id="traffic"></g>
            <rect id="tint" class="tint" x="0" y="0" width="100%" height="100%" style="opacity:0"/>
            <g id="markers"></g>
            <g id="me" style="display:none"><circle class="pulse" r="9"/><circle class="dot" r="6"/></g>
          </svg>
          <!-- 날씨: SVG 밖 HTML 레이어. transform 애니메이션은 GPU 합성 스레드에서 돌아서 폰의 메인 스레드가 바빠도 멈추지 않는다 -->
          <div id="weather" data-w="clear">
            <div class="wx wx-dim"></div>
            <div class="wx wx-shade"></div>
            <div class="wx wx-rain-b"></div><div class="wx wx-rain-a"></div><div class="wx wx-rain-c"></div>
            <div class="wx wx-snow-b"></div><div class="wx wx-snow-a"></div>
            <div class="wx wx-fog"></div>
            <div class="wx wx-flash"></div>
          </div>
          <div class="bar">
            <div class="btns"><button id="btn-back" title="홈으로">⌂</button><span class="title panel">작은 지구</span></div>
            <div class="btns">
              <button id="btn-env" title="시간·날씨">⛅</button>
              <button id="btn-random" title="랜덤 여행">🎲</button>
              <button id="btn-tour" title="만들어진 지역 자동 여행 켜기">▶️</button>
              <button id="btn-me" title="내 위치로">📍</button>
              <button id="btn-share" title="지금 보는 곳 공유">🔗</button>
              <button id="btn-search" title="지역 찾기">🔍</button>
              <button id="btn-world" title="세계 고르기">🌏</button>
            </div>
          </div>
          <div id="info" class="sheet panel">
            <div class="sheet-head"><span id="info-title"></span><button class="sheet-close" title="닫기">✕</button></div>
            <div class="sheet-body">
              <div id="info-kind" class="info-kind"></div>
              <p id="info-desc" class="info-desc"></p>
              <div class="chips"><button id="btn-follow" class="chip">🎥 따라가기</button></div>
            </div>
          </div>
          <div id="env" class="sheet panel">
            <div class="sheet-head"><span>하늘과 날씨</span><button class="sheet-close" title="닫기">✕</button></div>
            <div class="sheet-body">
              <div class="env-row"><span class="env-label">시간</span><div id="env-time" class="chips"></div></div>
              <div class="env-row" style="margin-top:10px"><span class="env-label">날씨</span><div id="env-weather" class="chips"></div></div>
            </div>
          </div>
          <div id="search" class="sheet panel">
            <div class="sheet-head"><span>🔍 만들어진 지역</span><button class="sheet-close" title="닫기">✕</button></div>
            <div class="search-row"><input id="search-input" type="search" placeholder="도시·나라·세계 이름" autocomplete="off" enterkeyhint="search"><button id="btn-search-random" title="이 목록에서 랜덤">🎲</button></div>
            <div id="search-list" class="sheet-body"></div>
          </div>
          <div id="worlds" class="sheet panel">
            <div class="sheet-head"><span>어디로 갈까요?</span><button class="sheet-close" title="닫기">✕</button></div>
            <div class="sheet-body"><div id="world-list" class="chips"></div></div>
          </div>
          <div id="stations" class="sheet panel">
            <div class="sheet-head"><span id="stations-title">📻 방송국</span><button class="sheet-close" title="닫기">✕</button></div>
            <div class="now"><span id="radio-name">아래에서 방송을 골라 보세요</span><button id="btn-pin" title="이 방송 고정 (나라를 옮겨도 계속)">📌</button><button id="btn-next" title="다음 방송">⏭</button><button id="btn-radio" title="켜기/끄기">▶</button></div>
            <div id="stations-list" class="sheet-body"></div>
          </div>
          <div id="toast" class="panel"></div>
          <div id="loading" class="panel"><i></i><span>불러오는 중…</span></div>
          <div id="soon" class="panel"><span id="soon-text">🚧 아직 준비 중인 곳이에요</span><button id="btn-soon">서울 가기 →</button></div>
          <div class="hud">
            <div id="place" class="panel">지구</div>
            <div class="hint">드래그로 돌리고 · 스크롤/핀치로 다가가고 · 이름을 누르면 날아가요</div>
          </div>
          <button id="btn-fab" class="fab" title="라디오">📻<span class="eq"><i></i><i></i><i></i></span></button>
          <audio id="audio" preload="none"></audio>
        </div>
      `;
    }
  }
  return tagName;
};
