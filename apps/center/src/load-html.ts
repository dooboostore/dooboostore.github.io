import "reflect-metadata";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
if (!(globalThis as any).require) (globalThis as any).require = createRequire(import.meta.url);
import { defineSwcAppBody, SwcAppInterface } from "@dooboostore/simple-web-component";
import { defineServices } from "@center-src/services";
import { componentFactories } from "@center-src/components";
import { pageFactories } from "@center-src/pages";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function renderPage(initialPath: string, templateHtml: string): Promise<string> {
  const { DomParser } = await import('@dooboostore/dom-parser');
  const parser = new DomParser(templateHtml, { href: `http://localhost${initialPath}` });
  const w = parser.window as unknown as Window & typeof globalThis;

  // SSR globals (DomParserInitializer 참고)
  (global as any).window = w;
  (global as any).document = w.document;
  (globalThis as any).window = w;
  (globalThis as any).document = w.document;
  try { (0, eval)('window = globalThis.window'); } catch {}
  try { (0, eval)('document = globalThis.document'); } catch {}
  (global as any).Event = (w as any).Event;
  (global as any).PopStateEvent = (w as any).Event;
  (global as any).IntersectionObserver = (w as any).IntersectionObserver;
  (global as any).NodeFilter = (w as any).NodeFilter;
  (global as any).Node = (w as any).Node;
  (global as any).DocumentFragment = (w as any).DocumentFragment;
  (global as any).HTMLElement = (w as any).HTMLElement;
  (global as any).HTMLMetaElement = (w as any).HTMLMetaElement;
  (global as any).Element = (w as any).Element;
  (global as any).Document = (w as any).Document;
  (global as any).HTMLCanvasElement = (w as any).HTMLCanvasElement;
  if ((global as any).HTMLCanvasElement) {
    (global as any).HTMLCanvasElement.prototype.getContext = () => null;
  }
  (global as any).CanvasRenderingContext2D = (w as any).CanvasRenderingContext2D;
  (global as any).CanvasPattern = (w as any).CanvasPattern;
  (global as any).CanvasGradient = (w as any).CanvasGradient;
  (global as any).Path2D = (w as any).Path2D;
  (global as any).ImageData = (w as any).ImageData;
  // ResizeObserver / MutationObserver polyfill for SSR
  const ssrRO = class ResizeObserver {
    constructor(_cb?: any) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
  const mutationRO = class MutationObserver {
    constructor(_cb?: any) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any
  const interSectionRO = class IntersectionObserver {
    constructor(_cb?: any) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
  // (w as any).ResizeObserver = ssrRO;
  // (w as any).MutationObserver = mutationRO;
  // (w as any).IntersectionObserver = interSectionRO;
  // (global as any).ResizeObserver = ssrRO;
  // (globalThis as any).ResizeObserver = ssrRO;
  // if (typeof (global as any).MutationObserver === 'undefined') {
  //   const ssrMO = class MutationObserver {
  //     constructor(_cb?: any) {}
  //     observe() {}
  //     disconnect() {}
  //     takeRecords() { return []; }
  //   } as any;
  //   (w as any).MutationObserver = mutationRO;
  //   (global as any).MutationObserver = mutationRO;
  //   (globalThis as any).MutationObserver = mutationRO;
  // }
  // // requestAnimationFrame polyfill for SSR (dom-parser WindowBase throws — unconditional override)
  // (w as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number;
  // (w as any).cancelAnimationFrame = (id: number) => clearTimeout(id as any);
  // (global as any).requestAnimationFrame = (w as any).requestAnimationFrame.bind(w);
  // (global as any).cancelAnimationFrame = (w as any).cancelAnimationFrame.bind(w);
  // (globalThis as any).requestAnimationFrame = (w as any).requestAnimationFrame.bind(w);
  // (globalThis as any).cancelAnimationFrame = (w as any).cancelAnimationFrame.bind(w);
  // fetch polyfill for relative URLs (SSR)
  const origFetch = global.fetch;
  const fetchWrapper = (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (typeof url === 'string' && url.startsWith('/')) {
      url = new URL(url, (w as any).location.href).href;
      input = url as any;
    }
    // For local datas, return empty mock to avoid Invalid URL/network errors
    if (typeof url === 'string' && url.includes('/datas/')) {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return origFetch(input as any, init);
  };
  (global as any).fetch = fetchWrapper as any;
  (w as any).fetch = fetchWrapper as any;

  const container = Symbol('container');
  await defineServices(container);
  await defineSwcAppBody(w as any);

  const appElement = w.document.querySelector('#app') as SwcAppInterface | null;
  if (!appElement || typeof (appElement as any).connect !== 'function') {
    throw new Error('[load-html] #app not found or connect is not a function');
  }

  await new Promise<{ app: SwcAppInterface }>((resolve, reject) => {
    let onChildrenConnectedDoneInvoked = false;
    let onChildrenRouteChangedInvoked = false;
    const checkAndResolve = () => {
      if (onChildrenConnectedDoneInvoked && onChildrenRouteChangedInvoked) resolve({ app: appElement });
    };
    const timeout = setTimeout(() => {
        console.warn(`[load-html] SSR Timeout for ${initialPath}`);
        resolve({ app: appElement });
      }, 1000);
    try {
      (appElement as any).connect({
        path: initialPath,
        routeType: 'path',
        // ssr: true,
        container,
        window: w as any,
        onStartedLazyDefineComponent: [...componentFactories, ...pageFactories],
        onChildrenConnectedDone: () => {
          onChildrenConnectedDoneInvoked = true;
          checkAndResolve();
        },
        onChildrenRouteChanged: (route: any) => {
          onChildrenRouteChangedInvoked = true;
          checkAndResolve();
        },
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });

  await new Promise((r) => setTimeout(r, 1000));
  const docHtml = '<!DOCTYPE html>\n' + w.document.documentElement.outerHTML;
  parser.destroy();
  return docHtml;
}

async function main() {
  // dist/index.html을 템플릿으로 사용 — 이미 <script defer src="/bundle.js"> 포함됨
  // (body 맨끝 script는 dist에 있으므로 별도 주입 불필요)
  let templatePath = path.resolve(__dirname, '../dist/index.html');
  if (!fs.existsSync(templatePath)) {
    templatePath = path.resolve(__dirname, 'index.html');
    console.warn('[load-html] dist/index.html not found, fallback to', templatePath);
  }
  const html = fs.readFileSync(templatePath, 'utf-8');
  console.log('[load-html] template loaded:', templatePath, `${html.length} bytes`);

  const pages = ["/english", "/stock-flight", "/lotto", "/coordinate-simulation", "/buyback", "/stock-brain-checker", "/stock-npti"];
  const outDir = path.resolve(__dirname, '../dist');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const p of pages) {
    console.log(`\n[load-html] rendering ${p} ...`);
    const out = await renderPage(p, html);
    const fileName = p.slice(1).replace(/\//g, '-') + '.html'; // /english -> english.html
    const outPath = path.join(outDir, fileName);
    fs.writeFileSync(outPath, out, 'utf-8');
    console.log(`[load-html] saved ${outPath} (${out.length} bytes)`);
  }

  console.log('\n[load-html] all done');
  process.exit(0);
}

main().catch((e) => {
  console.error('[load-html] error:', e);
  process.exit(1);
});
