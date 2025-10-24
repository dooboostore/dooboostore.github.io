import { Sim } from "@dooboostore/simple-boot/decorators/SimDecorator";
import { ApiService } from "@dooboostore/simple-boot/fetch/ApiService";

export type PhoneticSign = {
  type: string;
  sign: string;
};

export type ExampleItem = {
  text: string;
  translatedText: string;
};

export type Meaning = {
  meaning: string;
  examples: ExampleItem[];
  originalMeaning: string;
};

export type Pos = {
  type: string;
  meanings: Meaning[];
};

export type ConjugationItem = {
  type: string;
  value: string;
};

export type Item = {
  entry: string;
  subEntry?: string;
  matchType: string;
  hanjaEntry?: string;
  phoneticSigns: PhoneticSign[];
  pos: Pos[];
  source: string;
  url: string;
  mUrl: string;
  expDicTypeForm: string;
  locale: string;
  conjugationList?: ConjugationItem[];
  aliasConjugation?: string;
  aliasConjugationPos?: string;
  gdid: string;
  expEntrySuperscript?: string;
};

export type Example = {
  source: string;
  matchType: string;
  translatedText: string;
  text: string;
};

export type Dictionary = {
  items: Item[];
  examples: Example[];
  isWordType: boolean;
  originalWord?: string;
};

@Sim
export class DictionaryService {
  private dictionaryCache = new Map<string, Dictionary>();

  constructor(private apiService: ApiService) {}

  async getWord(word: string): Promise<Dictionary> {
    // 캐시에서 먼저 확인
    if (this.dictionaryCache.has(word)) {
      return this.dictionaryCache.get(word)!;
    }

    try {
      const dictionary = await this.apiService.get<Dictionary>({
        target: `/datas/english/dictionary/${word}.json`
      });

      // 성공적으로 가져온 경우 캐시에 저장
      if (dictionary && dictionary.items && dictionary.items.length > 0) {
        const dictWithOriginal = { ...dictionary, originalWord: word };
        this.dictionaryCache.set(word, dictWithOriginal);
        return dictWithOriginal;
      } else {
        // 빈 결과인 경우 placeholder 생성
        const placeholder = this.createPlaceholder(word);
        this.dictionaryCache.set(word, placeholder);
        return placeholder;
      }
    } catch (error) {
      // 에러 발생 시 placeholder 생성
      const placeholder = this.createPlaceholder(word);
      this.dictionaryCache.set(word, placeholder);
      return placeholder;
    }
  }

  async getWords(words: string[]): Promise<Dictionary[]> {
    const results: Dictionary[] = [];
    const wordsToFetch: string[] = [];

    // 캐시된 단어와 가져와야 할 단어 분리
    for (const word of words) {
      if (this.dictionaryCache.has(word)) {
        results.push(this.dictionaryCache.get(word)!);
      } else {
        wordsToFetch.push(word);
        results.push(this.createPlaceholder(word)); // 임시 placeholder
      }
    }

    // 배치로 가져오기
    if (wordsToFetch.length > 0) {
      const batchSize = 10;
      const batches: string[][] = [];
      for (let i = 0; i < wordsToFetch.length; i += batchSize) {
        batches.push(wordsToFetch.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        const promises = batch.map(word => this.getWord(word));
        await Promise.allSettled(promises);
      }

      // 결과 업데이트
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (this.dictionaryCache.has(word)) {
          results[i] = this.dictionaryCache.get(word)!;
        }
      }
    }

    return results;
  }

  private createPlaceholder(word: string): Dictionary {
    return {
      items: [{
        entry: word,
        matchType: 'original',
        phoneticSigns: [],
        pos: [{
          type: 'word',
          meanings: [{
            meaning: `Original word: ${word}`,
            examples: [],
            originalMeaning: word
          }]
        }],
        source: 'original',
        url: '',
        mUrl: '',
        expDicTypeForm: '',
        locale: 'en',
        gdid: ''
      }],
      examples: [],
      isWordType: true,
      originalWord: word
    };
  }

  clearCache(): void {
    this.dictionaryCache.clear();
  }

  getCacheSize(): number {
    return this.dictionaryCache.size;
  }
}
