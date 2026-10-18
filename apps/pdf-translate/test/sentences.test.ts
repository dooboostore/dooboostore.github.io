import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences } from '../src/index';

describe('splitSentences', () => {
  it('. ! ? 경계에서 분리한다', () => {
    assert.deepEqual(splitSentences('Hello world. How are you? Fine!'), [
      'Hello world.',
      'How are you?',
      'Fine!'
    ]);
  });

  it('줄바꿈을 공백으로 합친다', () => {
    assert.deepEqual(splitSentences('Hello\nworld. Next\nsentence here.'), [
      'Hello world.',
      'Next sentence here.'
    ]);
  });

  it('종결 없는 마지막 조각도 살린다', () => {
    assert.deepEqual(splitSentences('First. Second'), ['First.', 'Second']);
  });

  it('영문 없는 조각(페이지 번호 등)은 버린다', () => {
    assert.deepEqual(splitSentences('Hello. 1 2 3. World.'), ['Hello.', 'World.']);
  });

  it('빈 입력은 빈 배열', () => {
    assert.deepEqual(splitSentences('   '), []);
  });
});
