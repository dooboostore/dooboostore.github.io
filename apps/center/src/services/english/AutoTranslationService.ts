import { Sim } from '@dooboostore/simple-boot';
import { ConstructorType } from '@dooboostore/core';

export type AutoTranslationSeg = {
  utf8?: string;
  tOffsetMs?: number;
  acAsrConf?: number;
};

export type AutoTranslationEvent = {
  tStartMs: number;
  dDurationMs: number;
  segs?: AutoTranslationSeg[];
  [key: string]: any;
};

export type AutoTranslation = {
  events: AutoTranslationEvent[];
  [key: string]: any;
};

export type TimeScope = {
  startMs: number;
  endMs: number;
};

export type TranslationItemSet = {
  type: 'en' | 'ko';
  text: string;
} & TimeScope;

export namespace AutoTranslationService {
  export const SYMBOL = Symbol.for('AutoTranslationService');
}

export interface AutoTranslationServiceType {
  getTranslationScript(name: string): Promise<TranslationItemSet[]>;
}

export default (container: symbol): ConstructorType<AutoTranslationServiceType> => {
  @Sim({ symbol: AutoTranslationService.SYMBOL, container: container })
  class AutoTranslationServiceImpl implements AutoTranslationServiceType {
    private extractSegmentsWithTime(event: AutoTranslationEvent): Array<{ startMs: number; endMs: number; text: string }> {
      if (!event.segs || event.segs.length === 0) return [];
      const eventStartMs = event.tStartMs;
      const eventDurationMs = event.dDurationMs || 1000;
      const segments: Array<{ startMs: number; endMs: number; text: string }> = [];
      for (const seg of event.segs) {
        if (!seg.utf8) continue;
        const segStartMs = eventStartMs + (seg.tOffsetMs || 0);
        const duration = seg.acAsrConf === undefined ? eventDurationMs : (seg.acAsrConf || 500);
        const segEndMs = segStartMs + duration;
        segments.push({ startMs: segStartMs, endMs: segEndMs, text: seg.utf8 });
      }
      return segments;
    }
    private calculateEventTiming(event: AutoTranslationEvent): { startMs: number; endMs: number } {
      const segments = this.extractSegmentsWithTime(event);
      if (segments.length === 0) {
        return { startMs: event.tStartMs, endMs: event.tStartMs + 1000 };
      }
      return { startMs: segments[0].startMs, endMs: segments[segments.length - 1].endMs };
    }
    private extractTextFromEvent(event: AutoTranslationEvent): string {
      return this.extractSegmentsWithTime(event).map(s => s.text).join('').trim();
    }
    private async getTranslationData(name: string, lang: 'en' | 'ko'): Promise<TranslationItemSet[]> {
      try {
        const res = await fetch(`/datas/english/auto-translation/${name}.${lang}.json`);
        const data: AutoTranslation = await res.json();
        const items: TranslationItemSet[] = [];
        for (const event of data.events) {
          if (!event.segs || event.segs.length === 0) continue;
          const { startMs, endMs } = this.calculateEventTiming(event);
          const text = this.extractTextFromEvent(event);
          if (!text) continue;
          const fixedEndMs = endMs < startMs ? startMs + 1000 : endMs;
          items.push({ type: lang, text, startMs, endMs: fixedEndMs });
        }
        return items;
      } catch {
        return [];
      }
    }
    public async getTranslationScript(name: string): Promise<TranslationItemSet[]> {
      const [enItems, koItems] = await Promise.all([
        this.getTranslationData(name, 'en'),
        this.getTranslationData(name, 'ko'),
      ]);
      const items =  [...enItems, ...koItems];

      items.sort((a, b) => {
        if (a.startMs !== b.startMs) return a.startMs - b.startMs;
        if (a.type !== b.type) return a.type === "en" ? -1 : 1;
        return a.endMs - b.endMs;
      });
      return items;
    }
  }
  return AutoTranslationServiceImpl;
};
