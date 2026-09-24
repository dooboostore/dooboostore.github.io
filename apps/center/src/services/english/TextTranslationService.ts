import { Sim } from '@dooboostore/simple-boot';
import { ConstructorType } from '@dooboostore/core';

export type TextTranslationEntry = { en: string; ko: string };

export namespace TextTranslationService {
  export const SYMBOL = Symbol.for('TextTranslationService');
}

export interface TextTranslationServiceType {
  entries(name: string): Promise<TextTranslationEntry[]>;
  clearCache(): void;
}

export default (container: symbol): ConstructorType<TextTranslationServiceType> => {
  @Sim({ symbol: TextTranslationService.SYMBOL, container: container })
  class TextTranslationServiceImpl implements TextTranslationServiceType {
    private cache = new Map<string, TextTranslationEntry[]>();
    public async entries(name: string): Promise<TextTranslationEntry[]> {
      if (this.cache.has(name)) return this.cache.get(name)!;
      const res = await fetch(`/datas/english/text-translation/${encodeURIComponent(name)}.json`);
      if (!res.ok) throw new Error(`text-translation not found: ${name}`);
      const data: TextTranslationEntry[] = await res.json();
      this.cache.set(name, data);
      return data;
    }
    public clearCache() { this.cache.clear(); }
  }
  return TextTranslationServiceImpl;
};
