import { Sim } from '@dooboostore/simple-boot';
import { ConstructorType } from '@dooboostore/core';

export type ExampleItem = { text: string; translatedText: string };
export type Meaning = { meaning: string; examples: ExampleItem[]; originalMeaning: string };
export type Pos = { type: string; meanings: Meaning[] };
export type DictItem = {
  entry: string;
  matchType: string;
  phoneticSigns: any[];
  pos: Pos[];
  source: string;
  url: string;
  mUrl: string;
  expDicTypeForm: string;
  locale: string;
  gdid: string;
  [key: string]: any;
};
export type Example = { source: string; matchType: string; translatedText: string; text: string };
export type Dictionary = {
  items: DictItem[];
  examples: Example[];
  isWordType: boolean;
  originalWord?: string;
};

export namespace DictionaryService {
  export const SYMBOL = Symbol.for('DictionaryService');
}

export interface DictionaryServiceType {
  getWord(word: string): Promise<Dictionary>;
  clearCache(): void;
}

export default (container: symbol): ConstructorType<DictionaryServiceType> => {
  @Sim({ symbol: DictionaryService.SYMBOL, container: container })
  class DictionaryServiceImpl implements DictionaryServiceType {
    private cache = new Map<string, Dictionary>();
    private createPlaceholder(word: string): Dictionary {
      return {
        items: [{
          entry: word,
          matchType: 'original',
          phoneticSigns: [],
          pos: [{ type: 'word', meanings: [{ meaning: `Original word: ${word}`, examples: [], originalMeaning: word }] }],
          source: 'original', url: '', mUrl: '', expDicTypeForm: '', locale: 'en', gdid: ''
        }],
        examples: [],
        isWordType: true,
        originalWord: word
      };
    }
    public async getWord(word: string): Promise<Dictionary> {
      if (this.cache.has(word)) return this.cache.get(word)!;
      try {
        const res = await fetch(`/datas/english/dictionary/${word}.json`);
        if (!res.ok) throw new Error('not found');
        const dict: Dictionary = await res.json();
        if (dict?.items?.length > 0) {
          const result = { ...dict, originalWord: word };
          this.cache.set(word, result);
          return result;
        }
      } catch {}
      const placeholder = this.createPlaceholder(word);
      this.cache.set(word, placeholder);
      return placeholder;
    }
    public clearCache() { this.cache.clear(); }
  }
  return DictionaryServiceImpl;
};
