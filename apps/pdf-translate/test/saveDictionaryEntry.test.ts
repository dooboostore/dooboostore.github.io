import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveDictionaryEntry } from '../src/index';

const withTempDir = (fn: (dir: string) => void): void => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-translate-test-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe('saveDictionaryEntry', () => {
  it('pretty JSON으로 저장하고 경로를 반환한다', () => {
    withTempDir(dir => {
      const filePath = saveDictionaryEntry(dir, 'hello', { items: [], isWordType: false });
      assert.equal(filePath, path.join(dir, 'hello.json'));
      const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      assert.deepEqual(saved, { items: [], isWordType: false });
    });
  });

  it('없는 디렉토리는 자동 생성한다', () => {
    withTempDir(dir => {
      const nested = path.join(dir, 'a', 'b');
      saveDictionaryEntry(nested, 'w', { k: 1 });
      assert.ok(fs.existsSync(path.join(nested, 'w.json')));
    });
  });
});
