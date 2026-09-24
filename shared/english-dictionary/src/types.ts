export interface PapagoDictionaryResponse {
  items: Array<{
    entry: string;
    subEntry?: string;
    matchType: string;
    hanjaEntry?: string;
    phoneticSigns: Array<{
      type: string;
      sign: string;
    }>;
    pos: Array<{
      type: string;
      meanings: Array<{
        meaning: string;
        examples: Array<{
          text: string;
          translatedText: string;
        }>;
        originalMeaning: string;
      }>;
    }>;
    source: string;
    url: string;
    mUrl: string;
    expDicTypeForm: string;
    locale: string;
    conjugationList?: Array<{
      type: string;
      value: string;
    }>;
    aliasConjugation?: string;
    aliasConjugationPos?: string;
    gdid: string;
    expEntrySuperscript?: string;
  }>;
  examples: Array<{
    source: string;
    matchType: string;
    translatedText: string;
    text: string;
  }>;
  isWordType: boolean;
}

export interface PapagoCredentials {
  /** 구 nsmt/translate용 Authorization (현재 미사용, 하위호환용) */
  translateAuthorization?: string;
  /** 있으면 요청에 Cookie 헤더로 첨부 (없어도 익명 호출 동작 확인됨) */
  translateCookie?: string;
  /** 구 nsmt body deviceId (현재 미사용, 하위호환용) */
  deviceId?: string;
}

export interface PapagoClientOptions {
  /** 생략 가능 (신 엔드포인트는 인증 불필요) */
  credentials?: PapagoCredentials;
  /** 주입용 fetch (기본값: global fetch). 테스트/SSR 모킹용 */
  fetchFn?: typeof fetch;
  /** 로그 싱크 (기본값: console.log) */
  logger?: (message: string) => void;
}
