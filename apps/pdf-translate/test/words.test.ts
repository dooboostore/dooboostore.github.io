import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractUniqueEnglishWords } from 'dooboostore-english-dictionary';

describe('extractUniqueEnglishWords (공유 패키지 연동)', () => {
  it('PDF 본문 스타일 텍스트에서 단어를 뽑는다', () => {
    const words = extractUniqueEnglishWords(['Hello, hello! World... 123 testing.']);
    assert.deepEqual(words, ['hello', 'world', 'testing']);
  });
});
