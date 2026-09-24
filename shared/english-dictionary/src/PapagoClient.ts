import type { PapagoClientOptions, PapagoCredentials, PapagoDictionaryResponse } from './types';

const DEFAULT_DEVICE_ID = 'ffbaf550-ce4b-4478-ae20-ee54a0e3cd60';

/**
 * Naver Papago 비공식 API 클라이언트 (순수 — fs/경로 의존성 없음).
 * apps/youtube-translate/src/index.ts의 fetchDictionary/translateWithPapago를
 * credentials 주입식으로 옮긴 것. 요청 스펙(헤더/body)은 원본 그대로.
 */
export class PapagoClient {
  private readonly credentials: PapagoCredentials;
  private readonly fetchFn: typeof fetch;
  private readonly log: (message: string) => void;

  constructor(options: PapagoClientOptions) {
    this.credentials = options.credentials ?? {};
    this.fetchFn = options.fetchFn ?? fetch;
    this.log = options.logger ?? console.log;
  }

  /** live/env 쿠키가 있을 때만 Cookie 헤더를 붙인다 (없으면 익명 호출). */
  private cookieHeader(): Record<string, string> {
    return this.credentials.translateCookie ? { cookie: this.credentials.translateCookie } : {};
  }

  /** 단어 사전 조회 (papago.naver.com/api/dictionary/search). 실패 시 null. */
  async fetchWordDictionary(word: string): Promise<PapagoDictionaryResponse | null> {
    try {
      const response = await this.fetchFn('https://papago.naver.com/api/dictionary/search', {
        headers: {
          accept: 'application/json, text/plain, */*',
          'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          baggage:
            'sentry-environment=real,sentry-release=c9a455336cced29b211ff4aa2d7eab7c4d3151dc,sentry-public_key=dummy,sentry-trace_id=ef34d542e1e9468c8c0b628508b45feb,sentry-sampled=false,sentry-sample_rand=0.2868749920708059,sentry-sample_rate=0.01',
          'cache-control': 'no-cache',
          'content-type': 'application/json',
          pragma: 'no-cache',
          priority: 'u=1, i',
          'sec-ch-ua': '"Chromium";v="151", "Not=A?Brand";v="99"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          'sentry-trace': 'ef34d542e1e9468c8c0b628508b45feb-90834cbd7bc04b25-0',
          ...this.cookieHeader()
        },
        referrer: 'https://papago.naver.com/',
        body:
          '{"locale":"ko","source":"en","target":"ko","text":"' +
          encodeURIComponent(word) +
          '","clientType":"WEB"}',
        method: 'POST',
        mode: 'cors',
        credentials: 'include'
      });

      this.log(`📡 API Response for "${word}": Status ${response.status}`);

      if (!response.ok) {
        this.log(`⚠️ API returned status ${response.status} for word: ${word}`);
        return null;
      }

      const data = (await response.json()) as PapagoDictionaryResponse;
      this.log(`📦 Received data for "${word}": ` + JSON.stringify(data).substring(0, 200) + '...');
      return data;
    } catch (error: any) {
      this.log(`❌ Fetch error for word "${word}": ${error.message}`);
      return null;
    }
  }

  /** 문장 번역 (papago.naver.com/api/text/translation, en→ko 기본). 실패 시 ''.
   * 구 nsmt 엔드포인트는 폐기(404)되어 신 엔드포인트로 교체. 인증/쿠키 불필요. */
  async translate(text: string, source = 'en', target = 'ko'): Promise<string> {
    try {
      const response = await this.fetchFn('https://papago.naver.com/api/text/translation', {
        method: 'POST',
        headers: {
          accept: 'application/json, text/plain, */*',
          'accept-language': 'ko',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          origin: 'https://papago.naver.com',
          priority: 'u=1, i',
          referer: 'https://papago.naver.com/',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
          ...this.cookieHeader()
        },
        body: new URLSearchParams({
          source,
          target,
          text,
          dict: 'true',
          useGlossary: 'false',
          honorific: 'false',
          dictDisplay: '30',
          flag: 'true'
        })
      });

      if (!response.ok) {
        this.log(`⚠️ Translation API returned status ${response.status} for: ${text.substring(0, 50)}...`);
        return '';
      }

      const data = (await response.json()) as { translatedText: string };
      return data.translatedText || '';
    } catch (error) {
      this.log(`⚠️ Papago translation failed for: ${text.substring(0, 50)}...`);
      return '';
    }
  }
}
