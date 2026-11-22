// entity 로더: entity.json / .svg 를 읽어 <defs> 에 <symbol> 로 한 번만 등록한다.
// 규칙(ANALYSIS.md §8):
//  - "use" 가 .svg 로 끝나면 그 svg 파일 자체가 entity, 아니면 폴더/entity.json
//  - entity.json 안의 "svg" 는 자기 폴더 기준 상대경로
//  - 크기 = svg viewBox, 기준점 foot = viewBox 비율 (svg-only 는 data-foot 속성, 기본 바닥 중앙)
export const SVGNS = 'http://www.w3.org/2000/svg';
export type Win = Window & typeof globalThis;

export type Box = { x: number; y: number; w: number; h: number };
export type Behavior =
  // avoid: 들어가면 안 되는 지면 구역(data-zone), allow: avoid 안이라도 허용되는 구역 (예: 물 위의 다리)
  | { type: 'wander'; speed: number; pause?: [number, number]; avoid?: string[]; allow?: string[] }
  | { type: 'route'; path: string; dur: number };
export type Part = { use: string; at: [number, number]; scale?: number; rotate?: number; anim?: string; under?: boolean };
type View = { svg?: string; mirror?: string; parts?: Part[] };
// z: 기본 높이(지면 위, 로컬 좌표 단위) — 나비처럼 원래 떠 있는 것. 배치(placement.z)가 덮어쓴다
type EntityJson = { svg?: string; foot?: [number, number]; z?: number; views?: Record<string, View>; parts?: Part[]; behavior?: Behavior };

export type Entity = {
  id: string;
  views: Record<string, string>; // view 이름 → symbol id
  box: Box;
  foot: [number, number];
  z?: number;
  behavior?: Behavior;
};

const symbolId = (id: string) => 'e-' + id.replace(/[^a-zA-Z0-9]/g, '-');

// svg 파일 안 id 충돌 방지: id / url(#..) / href="#.." 에 접두어
export const prefixIds = (text: string, prefix: string) =>
  text
    .replace(/\bid="([^"]+)"/g, `id="${prefix}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${prefix}$1"`);

export const parseSvg = (w: Win, text: string) => {
  const root = new w.DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  if (root.nodeName !== 'svg') throw new Error('svg 파싱 실패: ' + (root.textContent ?? '').slice(0, 120));
  const [x, y, bw, bh] = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  if (!(bw > 0 && bh > 0)) throw new Error('svg 에 viewBox 가 없음');
  const footAttr = root.getAttribute('data-foot')?.split(/\s+/).map(Number) as [number, number] | undefined;
  return { root, box: { x, y, w: bw, h: bh }, foot: footAttr };
};

// foot 이 (0,0) 에 오도록 배치된 <use>
export const useAt = (w: Win, e: Entity, view: string, scale = 1) => {
  const u = w.document.createElementNS(SVGNS, 'use');
  const width = e.box.w * scale;
  const height = e.box.h * scale;
  u.setAttribute('href', '#' + (e.views[view] ?? Object.values(e.views)[0]));
  u.setAttribute('x', String(-e.foot[0] * width));
  u.setAttribute('y', String(-e.foot[1] * height));
  u.setAttribute('width', String(width));
  u.setAttribute('height', String(height));
  return u;
};

export class EntityRegistry {
  private cache = new Map<string, Promise<Entity>>();

  constructor(private w: Win, private defs: SVGDefsElement, private base: string) {}

  load(id: string, stack: string[] = []): Promise<Entity> {
    // 순환 검사가 캐시보다 먼저 — 로딩 중인 자기 자신을 기다리면 영원히 안 끝난다
    if (stack.includes(id)) return Promise.reject(new Error('entity 순환 참조: ' + [...stack, id].join(' → ')));
    let p = this.cache.get(id);
    if (!p) {
      p = this.build(id, [...stack, id]);
      this.cache.set(id, p);
    }
    return p;
  }

  private async fetchText(url: string) {
    const res = await this.w.fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.text();
  }

  private async build(id: string, stack: string[]): Promise<Entity> {
    const sid = symbolId(id);
    if (id.endsWith('.svg')) {
      const svg = parseSvg(this.w, prefixIds(await this.fetchText(this.base + id), sid + '_'));
      this.addSymbol(sid, svg.box, [], svg.root, []);
      return { id, views: { front: sid }, box: svg.box, foot: svg.foot ?? [0.5, 1] };
    }

    const dir = this.base + id + '/';
    const json: EntityJson = JSON.parse(await this.fetchText(dir + 'entity.json'));
    const views: Record<string, View> = json.views ?? { front: { svg: json.svg } };
    const result: Entity = { id, views: {}, box: { x: 0, y: 0, w: 1, h: 1 }, foot: json.foot ?? [0.5, 1], z: json.z, behavior: json.behavior };

    for (const [name, view] of Object.entries(views)) {
      if (view.mirror) continue;
      if (!view.svg) throw new Error(`${id}: view "${name}" 에 svg 가 없음`);
      const vid = `${sid}--${name}`;
      const svg = parseSvg(this.w, prefixIds(await this.fetchText(dir + view.svg), vid + '_'));
      const parts = [...(json.parts ?? []), ...(view.parts ?? [])];
      const loaded = await Promise.all(parts.map((p) => this.load(p.use, stack)));
      const under = parts.map((p, i) => [p, loaded[i]] as const).filter(([p]) => p.under);
      const over = parts.map((p, i) => [p, loaded[i]] as const).filter(([p]) => !p.under);
      this.addSymbol(vid, svg.box, under, svg.root, over);
      result.views[name] = vid;
      result.box = svg.box; // ponytail: view 들은 같은 viewBox 라고 가정
    }

    for (const [name, view] of Object.entries(views)) {
      if (!view.mirror) continue;
      const src = result.views[view.mirror];
      if (!src) throw new Error(`${id}: mirror 대상 view "${view.mirror}" 없음`);
      const vid = `${sid}--${name}`;
      const { x, y, w, h } = result.box;
      const sym = this.symbol(vid, result.box);
      const u = this.w.document.createElementNS(SVGNS, 'use');
      u.setAttribute('href', '#' + src);
      Object.entries({ x, y, width: w, height: h }).forEach(([k, v]) => u.setAttribute(k, String(v)));
      u.setAttribute('transform', `translate(${2 * x + w} 0) scale(-1 1)`);
      sym.appendChild(u);
      result.views[name] = vid;
    }
    return result;
  }

  private symbol(id: string, box: Box) {
    const sym = this.w.document.createElementNS(SVGNS, 'symbol');
    sym.setAttribute('id', id);
    sym.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
    sym.setAttribute('overflow', 'visible');
    this.defs.appendChild(sym);
    return sym;
  }

  private addSymbol(id: string, box: Box, under: (readonly [Part, Entity])[], body: Element, over: (readonly [Part, Entity])[]) {
    const sym = this.symbol(id, box);
    const partEl = ([p, e]: readonly [Part, Entity]) => {
      const g = this.w.document.createElementNS(SVGNS, 'g');
      g.setAttribute('transform', `translate(${p.at[0]} ${p.at[1]}) rotate(${p.rotate ?? 0})`);
      const u = useAt(this.w, e, 'front', p.scale ?? 1);
      // 회전은 CSS 로 (Safari 가 우리 심볼 안 SMIL 을 돌리지 않을 때가 있다). transform-box: view-box + origin 0 0 = 이 g 의 좌표 원점(foot) 을 축으로.
      // fill-box 로 하면 <use> 인스턴스 안에서 중심이 어긋난다. 키프레임 part-spin 은 페이지 스타일에 있다
      if (p.anim === 'spin') {
        const spin = this.w.document.createElementNS(SVGNS, 'g');
        spin.setAttribute('class', 'part-spin');
        spin.appendChild(u);
        g.appendChild(spin);
      } else g.appendChild(u);
      return g;
    };
    under.forEach((it) => sym.appendChild(partEl(it)));
    Array.from(body.childNodes).forEach((n) => sym.appendChild(this.w.document.importNode(n, true)));
    over.forEach((it) => sym.appendChild(partEl(it)));
  }
}
