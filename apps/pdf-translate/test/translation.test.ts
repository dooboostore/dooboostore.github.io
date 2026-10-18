import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveTranslationEntries, translateSentences, upsertTextItem } from '../src/index';

const withTempDir = (fn: (dir: string) => void): void => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-translate-test-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe('translateSentences', () => {
  it('주입된 번역 함수로 en/ko 쌍을 만든다', async () => {
    const entries = await translateSentences(
      ['Hello.', 'Bye.'],
      async (en) => `[ko]${en}`,
      0
    );
    assert.deepEqual(entries, [
      { en: 'Hello.', ko: '[ko]Hello.' },
      { en: 'Bye.', ko: '[ko]Bye.' }
    ]);
  });

  it('progress 콜백에 순서대로 알린다', async () => {
    const seen: Array<[number, number, string]> = [];
    await translateSentences(['a.', 'b.'], async (en) => en, 0, (i, total, en) => {
      seen.push([i, total, en]);
    });
    assert.deepEqual(seen, [[0, 2, 'a.'], [1, 2, 'b.']]);
  });
});

describe('saveTranslationEntries', () => {
  it('[{en, ko}] 리스트를 파일로 저장한다', () => {
    withTempDir(dir => {
      const filePath = saveTranslationEntries(dir, 'doc.json', [{ en: 'Hi.', ko: '안녕.' }]);
      assert.equal(filePath, path.join(dir, 'doc.json'));
      assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf-8')), [{ en: 'Hi.', ko: '안녕.' }]);
    });
  });
});

describe('upsertTextItem', () => {
  it('없으면 추가, 있으면(name+type) 교체한다', () => {
    withTempDir(dir => {
      const itemsPath = path.join(dir, 'items.json');
      upsertTextItem(itemsPath, { name: 'doc', type: 'text', img: '', link: 'datas/english/text-translation/doc.json' });
      upsertTextItem(itemsPath, { name: 'vid', type: 'youtube', img: 'i', link: 'l' });
      upsertTextItem(itemsPath, { name: 'doc', type: 'text', img: '', link: 'datas/english/text-translation/doc2.json' });
      const items = JSON.parse(fs.readFileSync(itemsPath, 'utf-8'));
      assert.equal(items.length, 2);
      assert.equal(items.find((it: any) => it.name === 'doc').link, 'datas/english/text-translation/doc2.json');
    });
  });
});
