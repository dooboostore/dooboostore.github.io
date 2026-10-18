import fs from 'fs';
import path from 'path';
import process from 'process';
import pdf from 'pdf-parse';
import { PapagoClient, extractUniqueEnglishWords, extractEpubText, resolveCredentials } from 'dooboostore-english-dictionary';
import { fetchLivePapagoCookie } from './papagoSession';

// 사용법: node dist/index.cjs <pdf|epub-path> [--img <cover-url>] [--link <url>]
// 예: node dist/index.cjs ./sample.pdf
//     node dist/index.cjs ./book.epub --img https://.../cover.jpg --link https://.../ebooks/123
const INPUT_FILE = process.argv[2] ?? path.join(process.cwd(), 'sample.pdf');

function cliFlag(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : '';
}
const ITEM_IMG = cliFlag('img');
const ITEM_LINK = cliFlag('link');

// 저장 위치는 실행 cwd가 아니라 번들 위치 기준 repo root로 고정
// (repo root가 아닌 곳에서 실행해도 source/datas 같은 오기입이 생기지 않음).
// esbuild cjs 번들에서 __dirname = <repo>/apps/pdf-translate/dist
declare const __dirname: string;
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const DICTIONARY_DIR = path.join(REPO_ROOT, 'datas', 'english', 'dictionary');
const TEXT_TRANSLATION_DIR = path.join(REPO_ROOT, 'datas', 'english', 'text-translation');
const ITEMS_JSON_PATH = path.join(REPO_ROOT, 'datas', 'english', 'items.json');

// 공유 패키지 클라이언트 — credentials는 resolveCredentials()에서 결정
// (환경변수 → Playwright live 세션 → 익명). 하드코딩 금지.
let papago: PapagoClient;

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** dictDir에 이미 있는 단어를 제외하고 조회 대상만 남긴다 (테스트 가능하도록 분리). */
export function findMissingWords(words: string[], dictDir: string): string[] {
  return words.filter(word => !fs.existsSync(path.join(dictDir, `${word}.json`)));
}

/** 사전 응답을 dictDir/<word>.json에 저장한다 (디렉토리 자동 생성). */
export function saveDictionaryEntry(dictDir: string, word: string, data: unknown): string {
  if (!fs.existsSync(dictDir)) {
    fs.mkdirSync(dictDir, { recursive: true });
  }
  const filePath = path.join(dictDir, `${word}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}

export interface TranslationEntry {
  en: string;
  ko: string;
}

export interface TextItem {
  name: string;
  type: string;
  img: string;
  link: string;
}

/**
 * PDF 추출 텍스트를 문장 리스트로 나눈다.
 * 줄바꿈을 공백으로 합친 뒤 . ! ? 경계에서 분리하고, 영문이 하나도 없는 조각(페이지 번호 등)은 버린다.
 */
export function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, ' ');
  const matches = flat.match(/[^.!?]+[.!?]+/g) ?? [];
  const consumed = matches.join('').length;
  const rest = flat.slice(consumed).trim();
  const sentences = matches.map(s => s.trim()).filter(s => s.length > 0);
  if (rest.length > 0) sentences.push(rest);
  return sentences.filter(s => /[a-zA-Z]/.test(s));
}

/** 문장들을 번역 함수로 ko와 묶어 TranslationEntry 리스트로 만든다 (테스트용 주입 가능). */
export async function translateSentences(
  sentences: string[],
  translate: (sentence: string) => Promise<string>,
  delayMs = 500,
  onProgress?: (index: number, total: number, en: string) => void
): Promise<TranslationEntry[]> {
  const entries: TranslationEntry[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const en = sentences[i];
    onProgress?.(i, sentences.length, en);
    const ko = await translate(en);
    entries.push({ en, ko });
    if (i < sentences.length - 1 && delayMs > 0) {
      await delay(delayMs);
    }
  }
  return entries;
}

/** 번역 엔트리 리스트를 dir/<filename>에 저장한다 (디렉토리 자동 생성). */
export function saveTranslationEntries(dir: string, filename: string, entries: TranslationEntry[]): string {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf-8');
  return filePath;
}

/** items.json에 type:'text' 색인을 upsert한다 (name 기준). 파일이 없으면 새로 만든다. */
export function upsertTextItem(itemsPath: string, item: TextItem): void {
  let items: TextItem[] = [];
  if (fs.existsSync(itemsPath)) {
    items = JSON.parse(fs.readFileSync(itemsPath, 'utf-8'));
  } else {
    const dir = path.dirname(itemsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  const existingIndex = items.findIndex(it => it.name === item.name && it.type === item.type);
  if (existingIndex >= 0) {
    items[existingIndex] = item;
  } else {
    items.push(item);
  }
  fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2), 'utf-8');
}

async function main(): Promise<void> {
  const skipLive = process.argv.includes('--no-live-session');
  papago = new PapagoClient({
    credentials: await resolveCredentials(() => (skipLive ? Promise.resolve(null) : fetchLivePapagoCookie()))
  });
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ File not found: ${INPUT_FILE}`);
    console.error(`   Usage: node dist/index.cjs <pdf|epub-path> [--img <cover-url>] [--link <url>]`);
    process.exit(1);
  }
  if (!fs.existsSync(DICTIONARY_DIR)) {
    fs.mkdirSync(DICTIONARY_DIR, { recursive: true });
  }

  console.log(`📄 Reading file: ${INPUT_FILE}`);
  const buffer = fs.readFileSync(INPUT_FILE);

  let rawText: string;
  let pageInfo: string;
  let defaultTitle = path.basename(INPUT_FILE, path.extname(INPUT_FILE));
  if (INPUT_FILE.toLowerCase().endsWith('.epub')) {
    const epub = await extractEpubText(buffer);
    rawText = epub.text;
    pageInfo = `${epub.chapterCount} chapter(s)`;
    defaultTitle = epub.title;
    console.log(`📕 EPUB title: ${epub.title}`);
  } else {
    const data = await pdf(buffer);
    rawText = data.text;
    pageInfo = `${data.numpages} page(s)`;
  }
  console.log(`📝 Extracted ${rawText.length} chars from ${pageInfo}`);

  const words = extractUniqueEnglishWords([rawText]);
  console.log(`📖 Found ${words.length} unique words`);

  const missing = findMissingWords(words, DICTIONARY_DIR);
  console.log(`📥 To fetch: ${missing.length} (skipped: ${words.length - missing.length})`);

  let skippedCount = words.length - missing.length;
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const dictionaryPath = path.join(DICTIONARY_DIR, `${word}.json`);

    if (fs.existsSync(dictionaryPath)) {
      if ((i + 1) % 50 === 0) {
        console.log(`[${i + 1}/${words.length}] Progress: ${skippedCount} skipped, ${successCount} fetched, ${failedCount} failed`);
      }
      continue;
    }

    console.log(`[${i + 1}/${words.length}] Fetching: ${word}`);
    const dictionaryData = await papago.fetchWordDictionary(word);

    if (dictionaryData) {
      try {
        saveDictionaryEntry(DICTIONARY_DIR, word, dictionaryData);
        successCount++;
        console.log(`✅ Saved: ${word}.json`);
      } catch (writeError: any) {
        console.log(`❌ Error writing file for "${word}": ${writeError.message}`);
        failedCount++;
      }
    } else {
      failedCount++;
      console.log(`❌ Failed to fetch: ${word}`);

      if (failedCount >= 3) {
        console.log(`⚠️ Multiple failures detected. Waiting 5 seconds...`);
        await delay(5000);
        failedCount = 0;
      }
    }

    await delay(1000);
  }

  console.log(`\n✅ Done!`);
  console.log(`   - Total words: ${words.length}`);
  console.log(`   - Already existed: ${skippedCount}`);
  console.log(`   - Newly fetched: ${successCount}`);
  console.log(`   - Failed: ${failedCount}`);

  // ── 문장 번역 → text-translation/<파일명>.json [{en, ko}] ──
  const cleanTitle = defaultTitle.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
  const translationFilename = `${cleanTitle}.json`;
  const translationPath = path.join(TEXT_TRANSLATION_DIR, translationFilename);
  const existingEntries: TranslationEntry[] = [];

  if (fs.existsSync(translationPath)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(translationPath, 'utf-8'));
      if (Array.isArray(loaded)) existingEntries.push(...loaded);
      console.log(`\n📂 Loaded ${existingEntries.length} existing entries: ${translationPath}`);
    } catch {
      console.log(`\n⚠️ Existing translation file is corrupt, starting over: ${translationPath}`);
    }
  }

  const sentences = splitSentences(rawText);
  // ko가 비어있는 엔트리도 미번역으로 취급 (구 nsmt API 폐기로 빈 ko가 쌓인 파일 복구용)
  const koByExisting = new Map(existingEntries.map(e => [e.en, e.ko] as [string, string]));
  const remaining = sentences.filter(s => !koByExisting.get(s));

  if (sentences.length > 0 && remaining.length === 0) {
    console.log(`⏭️ Translation already complete (${sentences.length} entries, skip)`);
  } else {
    console.log(`\n📖 Translating ${remaining.length}/${sentences.length} sentences`);

    const fresh = await translateSentences(
      remaining,
      (en) => papago.translate(en),
      500,
      (i, total, en) => console.log(`[${i + 1}/${total}] Translating: ${en.substring(0, 60)}...`)
    );

    // 문장 순서대로 머지 후 통째로 저장 (중단 후 재실행해도 이어서 진행됨)
    const koByEn = new Map([...existingEntries, ...fresh].map(e => [e.en, e.ko] as [string, string]));
    const merged: TranslationEntry[] = sentences.map(en => ({ en, ko: koByEn.get(en) ?? '' }));
    saveTranslationEntries(TEXT_TRANSLATION_DIR, translationFilename, merged);
    console.log(`✅ Saved translation: ${translationPath} (${merged.length} entries)`);
  }

  // ── items.json 색인 (type: 'text') ──
  upsertTextItem(ITEMS_JSON_PATH, {
    name: cleanTitle,
    type: 'text',
    img: ITEM_IMG,
    link: ITEM_LINK || `datas/english/text-translation/${translationFilename}`
  });
  console.log(`✅ Updated items.json: ${ITEMS_JSON_PATH}`);
}

export { main };

// 직접 실행 진입점은 src/cli.ts로 분리 — 테스트 번들에서 import해도 main()이 실행되지 않는다.
