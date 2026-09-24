import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findMissingWords } from '../src/index';

const withTempDir = (fn: (dir: string) => void): void => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-translate-test-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe('findMissingWords', () => {
  it('이미 있는 단어는 제외한다', () => {
    withTempDir(dir => {
      fs.writeFileSync(path.join(dir, 'hello.json'), '{}');
      assert.deepEqual(findMissingWords(['hello', 'world'], dir), ['world']);
    });
  });

  it('디렉토리가 없어도 전량 미싱으로 반환한다', () => {
    withTempDir(dir => {
      assert.deepEqual(
        findMissingWords(['a', 'b'], path.join(dir, 'no-such-dir')),
        ['a', 'b']
      );
    });
  });

  it('순서를 유지한다', () => {
    withTempDir(dir => {
      assert.deepEqual(findMissingWords(['c', 'a', 'b'], dir), ['c', 'a', 'b']);
    });
  });
});
