import { ValidUtils } from '@dooboostore/core-web';

// mermaid 원문은 `>`를 살려야 함 (-->, --- 등). & 와 < 만 이스케이프.
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// 공용 marked 팩토리 — ```mermaid 블록만 <pre class="mermaid">로 가로채고, 나머지는 highlight로.
// hljs는 무거워서 첫 사용 때 동적 로딩 (번들 비대화 방지).
export const createMarked = async () => {
  const [{ Marked }, { markedHighlight }, { default: hljs }] = await Promise.all([
    import('marked'),
    import('marked-highlight'),
    import('highlight.js'),
  ]);
  const marked = new Marked(
    markedHighlight({
      langPrefix: 'hljs language-',
      highlight(code, lang, langString) {
        // mermaid는 하이라이트 금지: 원문을 그대로 둬야 뒤의 renderer가 받음
        if (((langString || lang) ?? '').trim() === 'mermaid') return code;
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
    }),
  );
  marked.use({
    renderer: {
      code(code: string, lang: string) {
        if ((lang ?? '').trim() === 'mermaid') {
          return `<pre class="mermaid">${escapeHtml(code)}</pre>`;
        }
        return false;
      },
    },
  });
  return marked;
};

// highlight.js는 코드에 hljs-*= 색상 span을 넣지만, 전역 테마 CSS(index.html의
// github-dark 링크)는 Shadow DOM 안으로 스며들지 않는다. 그래서 마크다운 렌더
// 결과와 함께 테마를 넣어준다 (EnglishPlayerPage의 @import와 같은 CDN).
const HLJS_THEME_CSS = `@import url('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css');`;

// scope별 호출 순번 — 늦게 끝난 이전 호출이 새 내용을 덮어쓰지 않게
const renderSeq = new WeakMap<Element, number>();

/** 진행 중인 markdownParse 결과를 버리게 함 (scope를 다른 방식으로 채울 때) */
export const markdownCancel = (scope: Element) => {
  if (scope) renderSeq.set(scope, (renderSeq.get(scope) ?? 0) + 1);
};

// 한 방 렌더: 파싱 → mermaid 후처리 → 스코프에 삽입.
// 화면 밖(문서에 붙지 않은) 컨테이너에서 mermaid를 SVG로 바꾼 뒤 한 번에 교체한다.
// 먼저 꽂고 나중에 그리면 mermaid 원문 텍스트가 잠깐 보였다가 SVG로 바뀌며 깜빡인다.
// 기다리는 동안엔 이전 내용이 그대로 남아 빈 화면도 없다.
export const markdownParse = async (scope: Element, src: string): Promise<void> => {
  if (!scope) return;
  markdownCancel(scope);
  const seq = renderSeq.get(scope);
  const html = ((await createMarked()).parse(src) ?? '') as string;
  if (!ValidUtils.isBrowser()) {
    scope.innerHTML = html;
    return;
  }
  const staging = scope.ownerDocument.createElement('div');
  staging.innerHTML = html;
  await runMermaid(staging);
  if (renderSeq.get(scope) !== seq) return;
  // Shadow DOM 안이면 전역 하이라이트 테마가 안 보이므로 결과와 함께 넣어준다
  if (scope.getRootNode() instanceof ShadowRoot && !staging.querySelector('style[data-hljs-theme]')) {
    const theme = scope.ownerDocument.createElement('style');
    theme.setAttribute('data-hljs-theme', 'github-dark');
    theme.textContent = HLJS_THEME_CSS;
    staging.prepend(theme);
  }
  scope.replaceChildren(...Array.from(staging.childNodes));
};

let mermaidSeq = 0;

// 선(엣지) 강조 — 마우스를 올리면 두껍게, 클릭하면 선택 고정(여러 개 가능)하고 나머지는 흐리게.
// 스타일을 SVG 안에 넣어서 어느 shadow DOM 안에 그려져도 똑같이 동작한다.
const EDGE_STYLE = `
  .eh-hit { fill:none; stroke:transparent; stroke-width:14px; cursor:pointer; pointer-events:stroke; }
  .flowchart-link { transition:opacity .15s, stroke-width .1s; }
  .flowchart-link.eh-on { stroke:#2563eb !important; stroke-width:4px !important; }
  .flowchart-link.edge-thickness-thick.eh-on { stroke-width:6px !important; }
  g.edgeLabel { cursor:pointer; transition:opacity .15s; }
  g.edgeLabel.eh-on foreignObject div, g.edgeLabel.eh-on span, g.edgeLabel.eh-on p { background-color:#dbeafe !important; color:#1e3a8a !important; }
  g.edgeLabel.eh-on foreignObject div { box-shadow:0 0 0 2px #2563eb; border-radius:3px; }
  svg.eh-has-sel .flowchart-link:not(.eh-sel) { opacity:.18; }
  svg.eh-has-sel g.edgeLabel:not(.eh-sel) { opacity:.3; }  /* 안쪽 span도 class가 edgeLabel이라 g로 한정 */
`;

// 선(path)에도 같은 data-id가 있으므로 라벨 영역 안에서만 찾는다
const edgeLabelOf = (svg: SVGSVGElement, id: string) =>
  svg.querySelector(`.edgeLabels [data-id="${id}"]`)?.closest('.edgeLabel') as SVGGElement | null;

// 화살촉(marker)은 모든 선이 공유하므로 CSS로는 한 선만 칠할 수 없다 →
// 파랗고 조금 큰 복제 마커를 만들어 강조된 선만 그 마커로 바꿔 끼운다
const blueMarker = (svg: SVGSVGElement, url: string) => {
  const id = url.match(/#([^)"']+)/)?.[1];
  if (!id) return url;
  const blueId = `${id}-eh`;
  if (!svg.querySelector(`marker[id="${blueId}"]`)) {
    const orig = svg.querySelector(`marker[id="${id}"]`);
    if (!orig) return url;
    const m = orig.cloneNode(true) as SVGMarkerElement;
    m.id = blueId;
    for (const k of ['markerWidth', 'markerHeight']) {
      const v = parseFloat(m.getAttribute(k) ?? '');
      if (v) m.setAttribute(k, String(v * 1.4));
    }
    m.querySelectorAll<SVGElement>('path, circle, polygon').forEach(el => {
      el.style.setProperty('fill', '#2563eb', 'important');
      el.style.setProperty('stroke', '#2563eb', 'important');
    });
    orig.after(m);
  }
  return `url(#${blueId})`;
};

const setEdgeMarkers = (svg: SVGSVGElement, path: SVGPathElement, on: boolean) => {
  for (const attr of ['marker-end', 'marker-start']) {
    const key = attr === 'marker-end' ? 'ehMarkerEnd' : 'ehMarkerStart'; // dataset 키는 하이픈 불가
    const orig = path.dataset[key] ?? path.getAttribute(attr);
    if (!orig) continue;
    path.dataset[key] = orig;
    path.setAttribute(attr, on ? blueMarker(svg, orig) : orig);
  }
};

/**
 * 도식에서 ids(mermaid 선 id, 예: "L_U_UI_0")만 선택 상태로 강조하고 나머지는 흐리게 — 클릭 선택과 같은 모양.
 * 빈 배열이면 전체 해제. 강조된 선·라벨 요소들을 돌려준다 (스크롤 위치 계산용).
 */
export const selectEdges = (svg: SVGSVGElement, ids: string[]): Element[] => {
  const want = new Set(ids);
  const lit: Element[] = [];
  svg.querySelectorAll<SVGPathElement>('path.flowchart-link[data-id]').forEach(path => {
    const id = path.getAttribute('data-id')!;
    const on = want.has(id);
    const label = edgeLabelOf(svg, id);
    for (const el of [path, label]) {
      if (!el) continue;
      el.classList.toggle('eh-sel', on);
      el.classList.toggle('eh-on', on);
      if (on) lit.push(el);
    }
    setEdgeMarkers(svg, path, on);
  });
  svg.classList.toggle('eh-has-sel', want.size > 0);
  return lit;
};

const enableEdgeHighlight = (svg: SVGSVGElement) => {
  const doc = svg.ownerDocument;
  const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = EDGE_STYLE;
  svg.prepend(style);
  const labelOf = (id: string) => edgeLabelOf(svg, id);
  const refresh = () => svg.classList.toggle('eh-has-sel', !!svg.querySelector('.flowchart-link.eh-sel'));
  const setMarkers = (path: SVGPathElement, on: boolean) => setEdgeMarkers(svg, path, on);
  svg.querySelectorAll<SVGPathElement>('path.flowchart-link[data-id]').forEach(path => {
    const id = path.getAttribute('data-id')!;
    const label = labelOf(id);
    // 가는 선을 잡기 쉽게 투명한 두꺼운 선을 위에 겹친다
    const hit = path.cloneNode(false) as SVGPathElement;
    hit.removeAttribute('id');
    hit.removeAttribute('style');
    hit.removeAttribute('marker-end');
    hit.removeAttribute('marker-start');
    hit.setAttribute('class', 'eh-hit');
    path.after(hit);
    const parts = [path, label].filter(Boolean) as Element[];
    const hover = (on: boolean) => {
      const lit = on || path.classList.contains('eh-sel');
      parts.forEach(el => el.classList.toggle('eh-on', lit));
      setMarkers(path, lit);
    };
    const click = (e: Event) => {
      e.stopPropagation();
      const sel = !path.classList.contains('eh-sel');
      parts.forEach(el => { el.classList.toggle('eh-sel', sel); el.classList.toggle('eh-on', sel); });
      setMarkers(path, sel);
      refresh();
    };
    for (const el of [hit, label].filter(Boolean) as Element[]) {
      el.addEventListener('mouseenter', () => hover(true));
      el.addEventListener('mouseleave', () => hover(false));
      el.addEventListener('click', click);
    }
  });
  // 빈 곳(노드·영역·선이 아닌 곳)을 누르면 선택 해제
  svg.addEventListener('click', e => {
    const t = e.target as Element;
    if (t.closest('.node, .cluster, .edgeLabel, .eh-hit')) return;
    svg.querySelectorAll('.eh-sel').forEach(el => el.classList.remove('eh-sel', 'eh-on'));
    svg.querySelectorAll<SVGPathElement>('path.flowchart-link').forEach(path => setMarkers(path, false));
    refresh();
  });
};

// scope 안 pre.mermaid를 SVG로 렌더. 브라우저에서만 동작(SSR no-op),
// dynamic import라 mermaid 없을 땐 번들에 안 탐.
export const runMermaid = async (scope: ParentNode): Promise<void> => {
  if (!ValidUtils.isBrowser()) return;
  const targets = [...scope.querySelectorAll('pre.mermaid')].filter(
    el => !el.querySelector('svg') && (el.textContent ?? '').trim(),
  );
  if (!targets.length) return;
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false });
  // mermaid.run()은 document에서 id로 노드를 다시 찾아서 shadow DOM 안의 pre를 못 찾는다.
  // render()로 SVG 문자열만 받아 직접 넣으면 light/shadow 둘 다 된다.
  // 문서에 붙지 않은 staging 컨테이너도 그려야 하므로 isConnected로 거르지 않는다.
  for (const el of targets) {
    try {
      const { svg, bindFunctions } = await mermaid.render(`mermaid-${++mermaidSeq}`, el.textContent ?? '');
      el.innerHTML = svg;
      bindFunctions?.(el);
      const svgEl = el.querySelector('svg');
      if (svgEl && svgEl.querySelector('path.flowchart-link')) enableEdgeHighlight(svgEl);
      el.setAttribute('data-processed', 'true');
    } catch (e) {
      console.warn('[mermaid] render failed — leaving the source text', e);
    }
  }
};
