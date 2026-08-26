import { Sim } from '@dooboostore/simple-boot';
import { ConstructorType } from '@dooboostore/core';

export namespace TossService {
  export const SYMBOL = Symbol.for('TossService');
}

// ── Chart ──────────────────────────────────────────────────────────
export type TossChartSession = 'all' | 'regular';
export type TossInvestMode = 'integrated' | string;

// 분/일/주/월 타임프레임 — 분은 1,3,5,15,30,60만 허용
export type TossChartTimeframe =
  | 'min:1' | 'min:3' | 'min:5' | 'min:15' | 'min:30' | 'min:60'
  | 'day:1'
  | 'week:1'
  | 'month:1';

export interface TossChartOptions {
  readonly count?: number; // default 61 (week/month/min은 450 권장)
  readonly timeframe?: TossChartTimeframe; // default 'day:1'
  readonly session?: TossChartSession;
  readonly investMode?: TossInvestMode;
  readonly useAdjustedRate?: boolean;
}

export interface TossCandle {
  readonly dt: string; // ISO 2026-08-26T00:00:00+09:00
  readonly base: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly amount: number;
}

export interface TossChartResult {
  readonly code: string;
  readonly nextDateTime: string;
  readonly exchangeRate: number;
  readonly exchange: string;
  readonly candles: readonly TossCandle[];
}

interface TossChartApiResponse {
  readonly result: {
    readonly code: string;
    readonly nextDateTime: string;
    readonly exchangeRate: number;
    readonly exchange: string;
    readonly candles: readonly TossCandle[];
  };
}

// ── Search AutoComplete ────────────────────────────────────────────
export const TOSS_SEARCH_SECTION_TYPES = ['SCREENER', 'NEWS', 'PRODUCT', 'TICS', 'MARKET_INDEX', 'COMPANY_REPORT', 'ETF', 'RELATED_TOPIC', 'COMPANY_TICS', 'PRODUCT_DETAIL'] as const;
export type TossSearchSectionType = typeof TOSS_SEARCH_SECTION_TYPES[number];

export interface TossSearchSection {
  readonly type: TossSearchSectionType;
  readonly option?: Readonly<{ addIntegratedSearchResult?: boolean; companyCode?: string; productCode?: string }>;
}

export interface TossSearchRequest {
  readonly query: string;
  readonly sections: readonly TossSearchSection[];
}

// Discriminated section results
export interface TossProductItem {
  readonly keyword: string;
  readonly subKeyword: string;
  readonly keywordType: string | null;
  readonly productCode: string; // A005930 / US19990122001 / A483320
  readonly productName: string;
  readonly symbol: string; // 005930 / NVDA
  readonly companyCode: string; // 005930 / NAS00208X-E0
  readonly logoImageUrl: string;
  readonly market: string; // KSP, KSD, NSQ, NYS 등
  readonly base: Readonly<{ krw: number | null; usd: number | null }>;
  readonly close: Readonly<{ krw: number | null; usd: number | null }>;
  readonly stockStatus: string;
  readonly autoComplete: boolean;
  readonly code: string;
  readonly subSectionQuery: string;
  readonly notice?: Readonly<{ splitMerge: boolean; earningsAnnouncement: boolean }>;
}

export interface TossProductSearchData {
  readonly type: 'PRODUCT';
  readonly items: readonly TossProductItem[];
  readonly subSections: readonly string[];
}

export interface TossNewsItem {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly source: string;
  readonly imageUrls: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TossNewsSearchData {
  readonly type: 'NEWS';
  readonly items: readonly TossNewsItem[];
}

export interface TossMarketIndexItem {
  readonly code: string; // KGG01P
  readonly name: string; // 코스피
  readonly description: string; // 지수
  readonly logoImageUrl: string;
}

export interface TossMarketIndexData {
  readonly type: 'MARKET_INDEX';
  readonly items: readonly TossMarketIndexItem[];
  readonly subSections: readonly string[];
}

export interface TossETFItem {
  readonly productName: string;
  readonly productCode: string;
  readonly logoImageUrl: string;
  readonly holdingRatio: string;
  readonly base: Readonly<{ krw: number | null; usd: number | null }>;
  readonly close: Readonly<{ krw: number | null; usd: number | null }>;
  readonly code: string;
}

export interface TossETFData {
  readonly type: 'ETF';
  readonly items: readonly TossETFItem[];
  readonly subSections: readonly string[];
}

export interface TossProductDetailData {
  readonly type: 'PRODUCT_DETAIL';
  readonly title: string;
  readonly description: string;
  readonly subSections: readonly string[];
}

export type TossSearchResultItem =
  | { readonly type: 'PRODUCT'; readonly data: TossProductSearchData }
  | { readonly type: 'NEWS'; readonly data: TossNewsSearchData }
  | { readonly type: 'MARKET_INDEX'; readonly data: TossMarketIndexData }
  | { readonly type: 'ETF'; readonly data: TossETFData }
  | { readonly type: 'PRODUCT_DETAIL'; readonly data: TossProductDetailData }
  | { readonly type: TossSearchSectionType; readonly data: unknown };

interface TossSearchApiResponse {
  readonly result: readonly TossSearchResultItem[];
}

// ── Stock Finance (stability) ──────────────────────────────────────
export type TossStabilityPosition = 'LOW' | 'HIGH' | 'MEDIUM' | string;

export interface TossStability {
  readonly liabilityRatio: number; // 부채비율
  readonly currentRatio: number; // 유동비율
  readonly interestCoverageRatio: number; // 이자보상배율
  readonly median: number;
  readonly position: TossStabilityPosition;
}

interface TossStabilityApiResponse {
  readonly result: TossStability;
}

// ── Investment Indicators (가치평가/수익/배당) ─────────────────────
export interface TossValuation {
  readonly displayPer: string; // "11.7배"
  readonly displayPbr: string; // "3.0배"
  readonly displayPsr: string; // "3.6배"
}

export interface TossProfit {
  readonly eps: number;
  readonly epsKrw: number;
  readonly bps: number;
  readonly bpsKrw: number;
  readonly roe: string; // "31.4%"
}

export interface TossDividendInfo {
  readonly dividendCount: number;
  readonly dividendMonths: readonly number[];
  readonly dividendCash: number;
  readonly dividendCashKrw: number;
  readonly dividendCashJpy: number | null;
  readonly dividendYieldRatio: number;
  readonly ttmDividendYieldRatio: number;
  readonly ttmDividendMonths: readonly string[];
  readonly ttmDps: number;
  readonly ttmDpsKrw: number;
  readonly ttmDpsJpy: number | null;
  readonly ttmDividendTotalCount: number;
  readonly dividendGrowthRatio: number;
  readonly currency: string;
}

export interface TossDividend {
  readonly dividendFrequency: 'QUARTERLY' | 'ANNUAL' | 'MONTHLY' | string;
  readonly dividendYieldRatio: number;
  readonly currency: string;
  readonly annualCash: number;
  readonly annualCashKrw: number;
  readonly months: readonly number[];
  readonly exDate: string;
  readonly lastYear: number;
  readonly lastYearDividendInfo: TossDividendInfo;
}

export interface TossInvestmentIndicators {
  readonly valuation: TossValuation;
  readonly profit: TossProfit;
  readonly dividend: TossDividend;
}

interface TossInvestmentApiResponse {
  readonly result: {
    readonly indicatorSections: readonly {
      readonly sectionName: '가치평가' | '수익' | '배당' | string;
      readonly data: unknown;
    }[];
  };
}

// ── Overview (기본정보) GET /stock-infos/{code}/overview ───────────
export interface TossOverviewMarket {
  readonly code: string;
  readonly displayName: string;
}

export interface TossOverviewWics {
  readonly code: string;
  readonly displayName: string;
}

export interface TossOverviewTics {
  readonly id: number;
  readonly title: string;
  readonly imageUrl: string;
  readonly depth: number;
  readonly parentId: number | null;
  readonly companyCount: number;
}

export interface TossOverviewComment {
  readonly code: string;
  readonly comments: readonly string[];
  readonly forecasts: readonly string[];
}

export interface TossOverviewResult {
  readonly type: string;
  readonly market: TossOverviewMarket;
  readonly company: {
    readonly code: string;
    readonly name: string;
    readonly englishName: string;
    readonly fullName: string;
    readonly fullEnglishName: string;
    readonly wics: TossOverviewWics;
    readonly industry: TossOverviewWics;
    readonly tics: readonly TossOverviewTics[];
    readonly description: string;
    readonly establishDate: string;
    readonly listDate: string;
    readonly delistDate: string | null;
    readonly ceo: string;
    readonly homepageUrl: string;
    readonly logoImageUrl: string;
    readonly sharesOutstanding: number;
    readonly marketValue: number;
    readonly marketValueKrw: number;
    readonly currency: string;
    readonly comment: TossOverviewComment;
  };
  readonly enterpriseValue: number;
  readonly enterpriseValueKrw: number;
  readonly marketValue: number;
  readonly marketValueKrw: number;
  readonly dataSource: string;
  readonly listDate: string;
}

interface TossOverviewApiResponse {
  readonly result: TossOverviewResult;
}

// ── Trade Trends — 투자자별/프로그램/신용/대차/공매도/CFD ─────────
export interface TossTradingTrend {
  readonly baseDate: string;
  readonly individualsBuyVolume: number;
  readonly individualsSellVolume: number;
  readonly netIndividualsBuyVolume: number;
  readonly foreignerBuyVolume: number;
  readonly foreignerSellVolume: number;
  readonly netForeignerBuyVolume: number;
  readonly institutionBuyVolume: number;
  readonly institutionSellVolume: number;
  readonly netInstitutionBuyVolume: number;
  readonly foreignerHoldingVolume: number;
  readonly foreignerRatio: number;
  readonly base: number;
  readonly close: number;
  readonly [key: string]: number | string | boolean | null;
}

export interface TossProgramTrading {
  readonly baseDate: string;
  readonly arbitrageBuyQuantity: number;
  readonly arbitrageSellQuantity: number;
  readonly arbitrageNetBuyQuantity: number;
  readonly nonArbitrageBuyQuantity: number;
  readonly nonArbitrageSellQuantity: number;
  readonly nonArbitrageNetBuyQuantity: number;
  readonly totalBuyQuantity: number;
  readonly totalSellQuantity: number;
  readonly totalNetBuyQuantity: number;
  readonly [key: string]: number | string | boolean | null;
}

export interface TossMarginLoan {
  readonly baseDate: string;
  readonly newQuantity: number;
  readonly returnQuantity: number;
  readonly balanceQuantity: number;
  readonly lendingRate: number;
  readonly balanceRate: number;
  readonly close: number;
  readonly [key: string]: number | string | boolean | null;
}

export interface TossLendingTrading {
  readonly baseDate: string;
  readonly executionQuantity: number;
  readonly repaymentQuantity: number;
  readonly lendingTradingBalanceVolume: number;
  readonly lendingTradingBalanceAmount: number;
  readonly close: number;
  readonly [key: string]: number | string | boolean | null;
}

export interface TossShortSellingTrend {
  readonly baseDate: string;
  readonly shortTradingVolume: number;
  readonly shortTradingAmount: number;
  readonly shortSellingRatio: number;
  readonly close: number;
  readonly [key: string]: number | string | boolean | null;
}

export interface TossCFD {
  readonly baseDate: string;
  readonly buyBalanceQuantity: number;
  readonly sellBalanceQuantity: number;
  readonly buyBalanceRate: number;
  readonly [key: string]: number | string | boolean | null;
}

interface TossPaginatedBody<T> {
  readonly pagingParam: { readonly number: number; readonly size: number; readonly key: string };
  readonly body: readonly T[];
}

// ── Service Interface ──────────────────────────────────────────────
export type TossChartTarget = string | TossProductItem | TossOverviewResult;

export interface TossService {
  /** 차트 캔들 조회 — code/상품/개요 객체로 국내(KSP) 해외(NSQ) 자동 분기, timeframe으로 일/주/월/분봉 지정 */
  getChart(target: TossChartTarget, options?: TossChartOptions): Promise<TossChartResult>;
  /** 차트 캔들 조회 (상품 객체) — market으로 us-s/kr-s 자동 선택 */
  getChart(product: TossProductItem, options?: TossChartOptions): Promise<TossChartResult>;
  /** 차트 캔들 조회 (개요 객체) — market.code로 us-s/kr-s 자동 선택 */
  getChart(overview: TossOverviewResult, options?: TossChartOptions): Promise<TossChartResult>;
  /** 통합 검색 — PRODUCT/NEWS/MARKET_INDEX 등 섹션별 결과 반환 (discriminated union) */
  searchAutoComplete(query: string, sections?: readonly TossSearchSection[]): Promise<readonly TossSearchResultItem[]>;
  /** 상품 검색 편의 — PRODUCT 섹션만, TossProductItem[] 반환 */
  searchProduct(query: string): Promise<readonly TossProductItem[]>;
  /** 지수 검색 편의 — MARKET_INDEX 섹션만, TossMarketIndexItem[] 반환 */
  searchMarketIndex(query: string): Promise<readonly TossMarketIndexItem[]>;
  /** 재무 안정성 — POST /stock-infos/stability/{code}, TossStability 반환 */
  getStability(code: string): Promise<TossStability>;
  /** 투자지표 전체 — GET /stock-detail/ui/wts/{code}/investment-indicators, 3섹션 통합 */
  getInvestmentIndicators(code: string): Promise<TossInvestmentIndicators>;
  /** 가치평가 — investment-indicators 중 valuation 섹션만 */
  getValuation(code: string): Promise<TossValuation>;
  /** 수익 — investment-indicators 중 profit 섹션만 */
  getProfit(code: string): Promise<TossProfit>;
  /** 배당 — investment-indicators 중 dividend 섹션만 */
  getDividend(code: string): Promise<TossDividend>;
  /** 기본정보 — GET /stock-infos/{code}/overview, 회사/산업/시총 등 */
  getOverview(code: string): Promise<TossOverviewResult>;
  /** 상품 상세 — POST /search-all (PRODUCT_DETAIL), TossProductItem로 조회 */
  getProductDetail(product: TossProductItem): Promise<TossProductDetailData | null>;
  /** 상품 상세 — 코드 직접 지정 */
  getProductDetail(productCode: string, companyCode: string, query?: string): Promise<TossProductDetailData | null>;
  /** 투자자별 매매 동향 — GET /trade/trend/trading-trend?productCode=&size=60 */
  getTradingTrend(code: string, size?: number): Promise<readonly TossTradingTrend[]>;
  /** 프로그램매매 — GET /trade/trend/program-trading?productCode=&size=50 */
  getProgramTrading(code: string, size?: number): Promise<readonly TossProgramTrading[]>;
  /** 신용거래 — GET /mds/info/margin-loan?stockCode=&size=50 */
  getMarginLoan(code: string, size?: number): Promise<readonly TossMarginLoan[]>;
  /** 대차거래 — GET /mds/info/lending-trading?stockCode=&size=50 */
  getLendingTrading(code: string, size?: number): Promise<readonly TossLendingTrading[]>;
  /** 공매도 — GET /mds/info/short-selling-trend?stockCode=&size=50 */
  getShortSellingTrend(code: string, size?: number): Promise<readonly TossShortSellingTrend[]>;
  /** CFD — GET /mds/info/cfd?stockCode=&size=50 */
  getCFD(code: string, size?: number): Promise<readonly TossCFD[]>;
}

export default (container: symbol): ConstructorType<TossService> => {
  @Sim({ symbol: TossService.SYMBOL, container })
  class TossServiceImpl implements TossService {
    // allorigins는 서버/브라우저 모두 동작 (간헐적 522 타임아웃 발생)
    private readonly CORS_PROXY = 'https://api.allorigins.win/raw?url=';
    private readonly CHART_BASE = 'https://wts-info-api.tossinvest.com/api/v1/c-chart';
    private readonly SEARCH_BASE = 'https://wts-info-api.tossinvest.com/api/v3/search-all/wts-auto-complete';
    private readonly STOCK_INFO_BASE = 'https://wts-info-api.tossinvest.com/api/v2/stock-infos';
    private readonly STOCK_DETAIL_BASE = 'https://wts-info-api.tossinvest.com/api/v1/stock-detail/ui/wts';

    // Toss는 Access-Control-Allow-Origin이 www.tossinvest.com 고정이라 브라우저 직접 호출 불가
    // 무료 CORS 프록시는 불안정하므로 여러 개를 순차 시도 (522/403 등 실패 시 다음으로 폴백)
    private readonly CORS_PROXIES = [
      'https://api.allorigins.win/raw?url=',
      'https://corsproxy.io/?url=',
      'https://cors-anywhere.azm.workers.dev/',
      'https://api.codetabs.com/v1/proxy?quest=',
    ];

    private buildProxyUrl(url: string, proxy: string): string {
      return `${proxy}${encodeURIComponent(url)}`;
    }

    private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
      let lastError: unknown = null;
      for (const proxy of this.CORS_PROXIES) {
        try {
          const proxied = this.buildProxyUrl(url, proxy);
          const res = await fetch(proxied, init);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as T;
        } catch (e) {
          lastError = e;
        }
      }
      throw lastError instanceof Error ? lastError : new Error('All CORS proxies failed');
    }

    async getChart(target: TossChartTarget, options: TossChartOptions = {}): Promise<TossChartResult> {
      const {
        count = 61,
        timeframe = 'day:1',
        session = 'all',
        investMode = 'integrated',
        useAdjustedRate = true,
      } = options;

      // target 정규화: 문자열 코드 또는 회사 정보 객체
      let code: string;
      let marketHint: string | undefined;
      if (typeof target === 'string') {
        code = target;
      } else if ('productCode' in target) {
        code = (target as TossProductItem).productCode;
        marketHint = (target as TossProductItem).market;
      } else {
        code = (target as TossOverviewResult).company.code;
        marketHint = (target as TossOverviewResult).market.code;
      }

      // code 정규화: 영문 시작(A/US/KGG 등) 그대로, 숫자 6자리 → A prefix
      const normalizedCode = /^[A-Z]/.test(code) ? code : `A${code}`;
      // 회사 정보가 있으면 market으로 해외 여부 판단 (NSQ/NYS), 없으면 코드 prefix로 판단
      const isUS = normalizedCode.startsWith('US') || (marketHint ? /^(NSQ|NYS|NAS)/.test(marketHint) : false);
      const marketPath = isUS ? 'us-s' : 'kr-s';
      const params = new URLSearchParams({
        count: String(count),
        session,
        investMode,
        useAdjustedRate: String(useAdjustedRate),
      });
      // week/month/min은 session 파라미터 불필요 시 제외 (서버가 무시하지만 URL 정리)
      const isIntradayOrWeekly = timeframe.startsWith('min:') || timeframe.startsWith('week:') || timeframe.startsWith('month:');
      if (isIntradayOrWeekly && params.has('session')) {
        // 분/주/월은 session=all이 무의미할 수 있으나 기존 호출 호환을 위해 유지
      }
      const url = `${this.CHART_BASE}/${marketPath}/${normalizedCode}/${timeframe}?${params.toString()}`;

      const json = await this.fetchJson<TossChartApiResponse>(url, {
        headers: { accept: 'application/json' },
      });

      if (!json.result) throw new Error('Invalid chart response');
      return json.result;
    }

    async searchAutoComplete(
      query: string,
      sections: readonly TossSearchSection[] = [
        { type: 'SCREENER' },
        { type: 'NEWS' },
        { type: 'PRODUCT', option: { addIntegratedSearchResult: true } },
        { type: 'TICS' },
        { type: 'MARKET_INDEX' },
      ],
    ): Promise<readonly TossSearchResultItem[]> {
      const body: TossSearchRequest = { query, sections: [...sections] };

      const json = await this.fetchJson<TossSearchApiResponse>(this.SEARCH_BASE, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      return json.result ?? [];
    }

    async searchProduct(query: string): Promise<readonly TossProductItem[]> {
      const results = await this.searchAutoComplete(query, [
        { type: 'PRODUCT', option: { addIntegratedSearchResult: true } },
      ]);
      const productSection = results.find((r): r is { type: 'PRODUCT'; data: TossProductSearchData } => r.type === 'PRODUCT');
      return productSection?.data.items ?? [];
    }

    async searchMarketIndex(query: string): Promise<readonly TossMarketIndexItem[]> {
      const results = await this.searchAutoComplete(query, [{ type: 'MARKET_INDEX' }]);
      const section = results.find((r): r is { type: 'MARKET_INDEX'; data: TossMarketIndexData } => r.type === 'MARKET_INDEX');
      return section?.data.items ?? [];
    }

    async getStability(code: string): Promise<TossStability> {
      const normalizedCode = code.startsWith('A') ? code : `A${code}`;
      const url = `${this.STOCK_INFO_BASE}/stability/${normalizedCode}`;
      const json = await this.fetchJson<TossStabilityApiResponse>(url, {
        method: 'POST',
        headers: { accept: 'application/json' },
      });
      if (!json.result) throw new Error('Invalid stability response');
      return json.result;
    }

    async getInvestmentIndicators(code: string): Promise<TossInvestmentIndicators> {
      const normalizedCode = code.startsWith('A') ? code : `A${code}`;
      const url = `${this.STOCK_DETAIL_BASE}/${normalizedCode}/investment-indicators`;
      const json = await this.fetchJson<TossInvestmentApiResponse>(url, {
        headers: { accept: 'application/json' },
      });
      const sections = json.result?.indicatorSections ?? [];
      const find = <T>(name: string): T => {
        const sec = sections.find(s => s.sectionName === name);
        if (!sec) throw new Error(`Missing section: ${name}`);
        return sec.data as T;
      };
      return {
        valuation: find<TossValuation>('가치평가'),
        profit: find<TossProfit>('수익'),
        dividend: find<TossDividend>('배당'),
      };
    }

    async getValuation(code: string): Promise<TossValuation> {
      return (await this.getInvestmentIndicators(code)).valuation;
    }

    async getProfit(code: string): Promise<TossProfit> {
      return (await this.getInvestmentIndicators(code)).profit;
    }

    async getDividend(code: string): Promise<TossDividend> {
      return (await this.getInvestmentIndicators(code)).dividend;
    }

    async getOverview(code: string): Promise<TossOverviewResult> {
      const normalizedCode = code.startsWith('A') ? code : `A${code}`;
      const url = `https://wts-info-api.tossinvest.com/api/v2/stock-infos/${normalizedCode}/overview`;
      const json = await this.fetchJson<TossOverviewApiResponse>(url, {
        headers: { accept: 'application/json' },
      });
      if (!json.result) throw new Error('Invalid overview response');
      return json.result;
    }

    async getProductDetail(product: TossProductItem): Promise<TossProductDetailData | null>;
    async getProductDetail(productCode: string, companyCode: string, query?: string): Promise<TossProductDetailData | null>;
    async getProductDetail(
      productOrCode: TossProductItem | string,
      companyCode?: string,
      query?: string,
    ): Promise<TossProductDetailData | null> {
      let productCode: string;
      let cCode: string;
      let q: string;
      if (typeof productOrCode === 'string') {
        productCode = productOrCode;
        cCode = companyCode!;
        q = query ?? productCode;
      } else {
        productCode = productOrCode.productCode;
        cCode = productOrCode.companyCode;
        q = productOrCode.productName;
      }
      const results = await this.searchAutoComplete(q, [
        { type: 'COMPANY_REPORT', option: { companyCode: cCode } },
        { type: 'ETF' },
        { type: 'RELATED_TOPIC', option: { productCode } },
        { type: 'COMPANY_TICS', option: { companyCode: cCode } },
        { type: 'PRODUCT_DETAIL', option: { productCode } },
      ]);
      const sec = results.find((r): r is { type: 'PRODUCT_DETAIL'; data: TossProductDetailData } => r.type === 'PRODUCT_DETAIL');
      return sec?.data ?? null;
    }

    private normalizeTradeCode(code: string): string {
      return /^[A-Z]/.test(code) ? code : `A${code}`;
    }

    private async fetchTradeBody<T>(path: string, code: string, size: number, paramName: 'productCode' | 'stockCode'): Promise<readonly T[]> {
      const normalizedCode = this.normalizeTradeCode(code);
      const url = `https://wts-info-api.tossinvest.com/api/v1/${path}?${paramName}=${normalizedCode}&size=${size}`;
      const json = await this.fetchJson<{ result: TossPaginatedBody<T> }>(url, {
        headers: { accept: 'application/json' },
      });
      return json.result?.body ?? [];
    }

    async getTradingTrend(code: string, size = 60): Promise<readonly TossTradingTrend[]> {
      return this.fetchTradeBody<TossTradingTrend>('stock-infos/trade/trend/trading-trend', code, size, 'productCode');
    }

    async getProgramTrading(code: string, size = 50): Promise<readonly TossProgramTrading[]> {
      return this.fetchTradeBody<TossProgramTrading>('stock-infos/trade/trend/program-trading', code, size, 'productCode');
    }

    async getMarginLoan(code: string, size = 50): Promise<readonly TossMarginLoan[]> {
      return this.fetchTradeBody<TossMarginLoan>('mds/info/margin-loan', code, size, 'stockCode');
    }

    async getLendingTrading(code: string, size = 50): Promise<readonly TossLendingTrading[]> {
      return this.fetchTradeBody<TossLendingTrading>('mds/info/lending-trading', code, size, 'stockCode');
    }

    async getShortSellingTrend(code: string, size = 50): Promise<readonly TossShortSellingTrend[]> {
      return this.fetchTradeBody<TossShortSellingTrend>('mds/info/short-selling-trend', code, size, 'stockCode');
    }

    async getCFD(code: string, size = 50): Promise<readonly TossCFD[]> {
      return this.fetchTradeBody<TossCFD>('mds/info/cfd', code, size, 'stockCode');
    }
  }

  return TossServiceImpl;
};
