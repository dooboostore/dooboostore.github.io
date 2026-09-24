import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translateGoogle } from 'dooboostore-english-dictionary';

describe('translateGoogle (mock fetch)', () => {
  it('gtx 응답에서 번역문만 이어붙인다', async () => {
    const fetchFn = (async () => ({
      ok: true,
      json: async () => [[['안녕.', 'Hello.', null, null]], null, 'en']
    })) as unknown as typeof fetch;
    assert.equal(await translateGoogle('Hello.', 'en', 'ko', fetchFn), '안녕.');
  });

  it('실패 시 빈 문자열', async () => {
    const fetchFn = (async () => ({ ok: false })) as unknown as typeof fetch;
    assert.equal(await translateGoogle('Hello.', 'en', 'ko', fetchFn), '');
    const throwing = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    assert.equal(await translateGoogle('Hello.', 'en', 'ko', throwing), '');
  });
});
