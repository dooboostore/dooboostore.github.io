import { Sim } from '@dooboostore/simple-boot';
import { ConstructorType } from '@dooboostore/core';

export namespace LottoService {
  export const SYMBOL = Symbol.for('LottoService');
}

export interface LottoItem {
  ltEpsd: number;      // 회차
  tm1WnNo: number;     // 번호 1
  tm2WnNo: number;     // 번호 2
  tm3WnNo: number;     // 번호 3
  tm4WnNo: number;     // 번호 4
  tm5WnNo: number;     // 번호 5
  tm6WnNo: number;     // 번호 6
  bnsWnNo: number;     // 보너스 번호
  ltRflYmd: string;    // 추첨일 (YYYYMMDD)
  rnk1WnNope: number;  // 1등 당첨인원
  rnk1WnAmt: number;   // 1등 당첨금액
  [key: string]: any;
}

export interface LottoService {
  getLottoRound(round: number): Promise<LottoItem | undefined>;
  getLottoList(startRound: number, count: number): Promise<LottoItem[]>;
  getLatestRoundNumber(): Promise<number>;
  clearCache(): void;
}

// 팩토리: Accommodation 패턴
export default (container: symbol): ConstructorType<LottoService> => {
  @Sim({ symbol: LottoService.SYMBOL, container: container })
  class LottoServiceImpl implements LottoService {
    private cache: Map<number, LottoItem> = new Map();
    private readonly CACHE_KEY = 'lotto_results_cache';
    private readonly API_URL = 'https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do';
    private readonly MAIN_INFO_URL = 'https://www.dhlottery.co.kr/selectMainInfo.do';

    constructor() {
      this.loadCache();
    }

    private loadCache(): void {
      try {
        const stored = localStorage.getItem(this.CACHE_KEY);
        if (stored) {
          const data = JSON.parse(stored);
          this.cache = new Map(Object.entries(data).map(([k, v]) => [Number(k), v as LottoItem]));
        }
      } catch (e) {
        // ignore
      }
    }

    private saveCache(): void {
      try {
        const obj = Object.fromEntries(this.cache);
        localStorage.setItem(this.CACHE_KEY, JSON.stringify(obj));
      } catch (e) {
        // ignore
      }
    }

    private async fetchRounds(cursor: number): Promise<LottoItem[]> {
      try {
        const url = `${this.API_URL}?srchDir=older&srchCursorLtEpsd=${cursor}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const json = await response.json();
        const list: LottoItem[] = json.data?.list || [];
        
        list.forEach(item => {
          this.cache.set(item.ltEpsd, item);
        });
        this.saveCache();
        
        return list;
      } catch (e) {
        console.error('[LottoService] Fetch failed:', e);
        return [];
      }
    }

    public async getLatestRoundNumber(): Promise<number> {
      try {
        const response = await fetch(this.MAIN_INFO_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const json = await response.json();
        const lt645List = json.data?.result?.pstLtEpstInfo?.lt645 || [];
        
        if (lt645List.length === 0) return 0;
        
        const maxRound = Math.max(...lt645List.map((item: any) => item.ltEpsd));
        
        // 메인 정보에서 가져온 데이터도 캐싱
        lt645List.forEach((item: LottoItem) => {
          this.cache.set(item.ltEpsd, item);
        });
        this.saveCache();
        
        return maxRound;
      } catch (e) {
        console.error('[LottoService] Failed to get latest round number:', e);
        return 0;
      }
    }

    public async getLottoRound(round: number): Promise<LottoItem | undefined> {
      if (this.cache.has(round)) {
        return this.cache.get(round);
      }

      const list = await this.fetchRounds(round + 1);
      return list.find(item => item.ltEpsd === round);
    }

    public async getLottoList(startRound: number, count: number): Promise<LottoItem[]> {
      const results: LottoItem[] = [];
      
      for (let i = 0; i < count; i++) {
        const round = startRound - i;
        if (round < 1) break;

        if (this.cache.has(round)) {
          results.push(this.cache.get(round)!);
        } else {
          // 캐시에 없는 구간이 나오면 fetchRounds 호출 (10개씩 가져옴)
          await this.fetchRounds(round + 1);
          if (this.cache.has(round)) {
            results.push(this.cache.get(round)!);
          } else {
            break;
          }
        }
      }
      
      return results;
    }

    public clearCache(): void {
      this.cache.clear();
      localStorage.removeItem(this.CACHE_KEY);
    }
  }
  return LottoServiceImpl;
};
