import JSZip from 'jszip';

export interface EpubText {
  title: string;
  text: string;
  chapterCount: number;
}

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => ENTITY_MAP[name] ?? m);
}

/** XHTML 한 챕터를 텍스트로 (script/style 제거 → 블록 태그 개행 → 태그 제거). */
export function xhtmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n');
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`));
  return m ? m[1] : null;
}

/**
 * EPUB 버퍼 → {title, text} (spine 순서대로 챕터 결합).
 * Gutenberg boilerplate(*** START/END OF ...) 바깥은 버린다.
 */
export async function extractEpubText(buffer: Uint8Array): Promise<EpubText> {
  const zip = await JSZip.loadAsync(buffer);

  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('EPUB container.xml not found');
  const rootfile = containerXml.match(/<rootfile[^>]*full-path\s*=\s*"([^"]+)"/)?.[1];
  if (!rootfile) throw new Error('EPUB rootfile not found');
  const base = rootfile.includes('/') ? rootfile.slice(0, rootfile.lastIndexOf('/') + 1) : '';

  const opf = await zip.file(rootfile)?.async('string');
  if (!opf) throw new Error(`EPUB OPF not found: ${rootfile}`);

  const title = opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/)?.[1]?.trim() ?? 'epub-book';

  const idToHref = new Map<string, string>();
  for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
    const id = attr(m[0], 'id');
    const href = attr(m[0], 'href');
    if (id && href) idToHref.set(id, decodeEntities(href));
  }
  const spineIds = [...opf.matchAll(/<itemref\b[^>]*>/g)]
    .map(m => attr(m[0], 'idref'))
    .filter((id): id is string => !!id);

  const chapters: string[] = [];
  for (const id of spineIds) {
    const href = idToHref.get(id);
    if (!href || !/\.(x?html?|xml)$/i.test(href.split('#')[0])) continue;
    const file = zip.file(base + decodeURIComponent(href.split('#')[0]));
    if (!file) continue;
    const text = xhtmlToText(await file.async('string'));
    if (text.trim().length > 0) chapters.push(text);
  }

  let full = chapters.join('\n\n');
  // Gutenberg 라이선스 boilerplate 제거
  const start = full.search(/\*\*\*\s*START OF/i);
  if (start >= 0) full = full.slice(start);
  const end = full.search(/\*\*\*\s*END OF/i);
  if (end >= 0) full = full.slice(0, end);
  full = full.replace(/^\*+\s*.*\*+\s*/gm, '').trim();

  return { title, text: full, chapterCount: chapters.length };
}
