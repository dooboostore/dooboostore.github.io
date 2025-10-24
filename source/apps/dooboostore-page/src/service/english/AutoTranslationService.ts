import { Sim } from '@dooboostore/simple-boot/decorators/SimDecorator';
import { ApiService } from '@dooboostore/simple-boot/fetch/ApiService';

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
  startMs: number; // in seconds
  endMs: number; // in seconds
}
export type TranslationData = {
  text: string;
} & TimeScope;

export type TranslationItemSet = {
  type: 'en' | 'ko';
  text: string;
} & TimeScope;

@Sim
export class AutoTranslationService {
  constructor(private apiService: ApiService) {
  }

  async getEnglishTranslation(name: string): Promise<AutoTranslation> {
    return await this.apiService.get<AutoTranslation>({
      target: `/datas/english/auto-translation/${name}.en.json`
    });
  }

  async getKoreanTranslation(name: string): Promise<AutoTranslation> {
    return await this.apiService.get<AutoTranslation>({
      target: `/datas/english/auto-translation/${name}.ko.json`
    });
  }

  // 이벤트의 세그먼트들을 절대 시간으로 변환하여 반환
  private extractSegmentsWithTime(event: AutoTranslationEvent): Array<{ startMs: number; endMs: number; text: string }> {
    if (!event.segs || event.segs.length === 0) return [];

    const eventStartMs = event.tStartMs;
    const eventDurationMs = event.dDurationMs || 1000; // 기본값 1초
    const segments: Array<{ startMs: number; endMs: number; text: string }> = [];

    for (const seg of event.segs) {
      if (!seg.utf8) continue;

      const segStartMs = eventStartMs + (seg.tOffsetMs || 0);
      // acAsrConf가 없으면 dDurationMs 사용
      const duration = seg.acAsrConf === undefined ? eventDurationMs : (seg.acAsrConf || 500);
      const segEndMs = segStartMs + duration;

      segments.push({
        startMs: segStartMs,
        endMs: segEndMs,
        text: seg.utf8
      });
    }

    return segments;
  }

  private calculateEventTiming(event: AutoTranslationEvent): { startMs: number; endMs: number } {
    const segments = this.extractSegmentsWithTime(event);
    
    if (segments.length === 0) {
      const eventStartMs = event.tStartMs;
      return { startMs: eventStartMs, endMs: eventStartMs + 1000 };
    }

    // 첫 번째 세그먼트의 시작 시간
    const startMs = segments[0].startMs;
    
    // 마지막 세그먼트의 종료 시간
    const endMs = segments[segments.length - 1].endMs;

    return { startMs, endMs };
  }

  private extractTextFromEvent(event: AutoTranslationEvent): string {
    const segments = this.extractSegmentsWithTime(event);
    return segments.map(seg => seg.text).join('').trim();
  }

  private extractTextsFromEvents(
    data: AutoTranslation,
    startMs: number,
    endMs: number
  ): string {
    const matchingTexts: string[] = [];

    for (const event of data.events) {
      const segments = this.extractSegmentsWithTime(event);

      for (const seg of segments) {
        // 영어 자막 시간 범위와 겹치는지 확인 (경계 포함)
        if (seg.startMs <= endMs && seg.endMs >= startMs) {
          matchingTexts.push(seg.text);
        }
      }
    }

    return matchingTexts.join('').trim();
  }

  async getEnglishTranslationScript(name: string): Promise<TranslationData[]> {
    const enData = await this.getEnglishTranslation(name);
    const items: TranslationData[] = [];

    for (const enEvent of enData.events) {
      if (!enEvent.segs || enEvent.segs.length === 0) continue;

      const { startMs, endMs } = this.calculateEventTiming(enEvent);
      const enText = this.extractTextFromEvent(enEvent);

      if (!enText) continue;

      items.push({
        startMs,
        endMs,
        text: enText,
      });
    }

    return items;
  }

  async getKoreanTranslationScript(name: string): Promise<TranslationData[]> {
    const koData = await this.getKoreanTranslation(name);
    const items: TranslationData[] = [];

    for (const koEvent of koData.events) {
      if (!koEvent.segs || koEvent.segs.length === 0) continue;

      const { startMs, endMs } = this.calculateEventTiming(koEvent);
      const koText = this.extractTextFromEvent(koEvent);

      if (!koText) continue;

      items.push({
        startMs,
        endMs,
        text: koText,
      });
    }

    return items;
  }

  async getTranslationScript(name: string): Promise<TranslationItemSet[]> {
    try {
      // 영어와 한글 스크립트를 병렬로 가져옴
      const [enItems, koItems] = await Promise.all([
        this.getEnglishTranslationScript(name),
        this.getKoreanTranslationScript(name).catch(() => [])
      ]);

      const items: TranslationItemSet[] = [];

      // 영어 아이템 추가
      for (const enItem of enItems) {
        // endMs가 startMs보다 작은 비정상적인 경우 수정
        const startMs = enItem.startMs;
        const endMs = enItem.endMs < enItem.startMs ? enItem.startMs + 1000 : enItem.endMs;
        
        items.push({
          type: 'en',
          text: enItem.text,
          startMs,
          endMs
        });
      }

      // 한글 아이템 추가
      for (const koItem of koItems) {
        // endMs가 startMs보다 작은 비정상적인 경우 수정
        const startMs = koItem.startMs;
        const endMs = koItem.endMs < koItem.startMs ? koItem.startMs + 1000 : koItem.endMs;
        
        items.push({
          type: 'ko',
          text: koItem.text,
          startMs,
          endMs
        });
      }

      // 정렬 우선순위:
      // 1. startMs 기준 오름차순
      // 2. startMs가 같으면 type 기준 (영어 'en' 우선)
      // 3. type도 같으면 endMs 기준 오름차순
      items.sort((a, b) => {
        // 1차: startMs 비교
        if (a.startMs !== b.startMs) {
          return a.startMs - b.startMs;
        }
        
        // 2차: type 비교 (영어 우선)
        if (a.type !== b.type) {
          return a.type === 'en' ? -1 : 1;
        }
        
        // 3차: endMs 비교
        return a.endMs - b.endMs;
      });

      return items;
    } catch (error) {
      console.error('Failed to load translation script:', error);
      // 에러 발생 시 영어만 반환
      const enItems = await this.getEnglishTranslationScript(name);
      return enItems.map(item => {
        const startMs = item.startMs;
        const endMs = item.endMs < item.startMs ? item.startMs + 1000 : item.endMs;
        
        return {
          type: 'en' as const,
          text: item.text,
          startMs,
          endMs
        };
      });
    }
  }
}
