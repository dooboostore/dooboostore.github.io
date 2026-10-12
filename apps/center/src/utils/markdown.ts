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

// 한 방 렌더: 파싱 → 스코프에 삽입 → mermaid 후처리.
// marked.parse만으론 텍스트 HTML이라, 삽입 후 살아있는 DOM에서 run까지 해야 그림이 됨.
export const markdownParse = async (scope: Element, src: string): Promise<void> => {
  if (!scope) return;
  scope.innerHTML = ((await createMarked()).parse(src) ?? '') as string;
  await runMermaid(scope);
};

let mermaidSeq = 0;

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
  for (const el of targets) {
    if (!el.isConnected) continue; // import를 기다리는 사이 페이지를 떠났으면 건너뜀
    try {
      const { svg, bindFunctions } = await mermaid.render(`mermaid-${++mermaidSeq}`, el.textContent ?? '');
      el.innerHTML = svg;
      bindFunctions?.(el);
      el.setAttribute('data-processed', 'true');
    } catch (e) {
      console.warn('[mermaid] render failed — leaving the source text', e);
    }
  }
};
