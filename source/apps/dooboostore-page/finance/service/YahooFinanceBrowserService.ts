import { chromium, Browser, Page } from 'playwright';

export type ChartQuote = {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  adjclose?: number | null;
};

export type TradingPeriod = {
  timezone: string;
  start: number; // Unix timestamp
  end: number;   // Unix timestamp
  gmtoffset: number;
};

export type CurrentTradingPeriod = {
  pre?: TradingPeriod;
  regular?: TradingPeriod;
  post?: TradingPeriod;
};

export type ChartMeta = {
  currency?: string;
  symbol?: string;
  exchangeName?: string;
  instrumentType?: string;
  firstTradeDate?: number;
  regularMarketTime?: number;
  gmtoffset?: number;
  timezone?: string;
  exchangeTimezoneName?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number; // 차트 시작점 이전의 종가
  previousClose?: number; // 가장 최근 거래일의 종가
  priceHint?: number;
  currentTradingPeriod?: CurrentTradingPeriod; // 오늘(최근 거래일)의 장 시간
  dataGranularity?: string;
  range?: string;
  validRanges?: string[];
  tradingPeriods?: Array<Array<TradingPeriod>>; // 차트 기간 내 각 거래일의 장 시간
};

export type ChartResult = {
  quotes: ChartQuote[];
  meta: ChartMeta;
};

export type ChartOptions = {
  period1?: string | Date;
  period2?: string | Date;
  interval?: string;
};

export class YahooFinanceBrowser {
  private browser: Browser | null = null;

  async init() {
    if (!this.browser) {
      console.log('🚀 Launching browser...');
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage'
        ]
      });
      console.log('✅ Browser ready');
    }
  }

  async chart(symbol: string, options: ChartOptions = {}): Promise<ChartResult> {
    await this.init();

    // Interval-specific max periods
    const intervalLimits: Record<string, number> = {
      '1m': 7,    // 7 days
      '2m': 60,   // 60 days
      '5m': 60,   // 60 days
      '15m': 60,  // 60 days
      '30m': 60,  // 60 days
      '1h': 730,  // 2 years
      '1d': 3650  // 10 years (no real limit)
    };

    const interval = options.interval || '1d';
    const maxDays = intervalLimits[interval] || 60;

    const period1 = options.period1 
      ? (typeof options.period1 === 'string' ? new Date(options.period1).getTime() / 1000 : options.period1.getTime() / 1000)
      : Math.floor(Date.now() / 1000) - (maxDays * 24 * 60 * 60);
    
    const period2 = options.period2
      ? (typeof options.period2 === 'string' ? new Date(options.period2).getTime() / 1000 : options.period2.getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    
    // Validate period range
    const requestedDays = (period2 - period1) / (24 * 60 * 60);
    if (requestedDays > maxDays) {
      console.log(`  ⚠️ Requested ${requestedDays.toFixed(0)} days but ${interval} interval max is ${maxDays} days. Adjusting...`);
    }
    
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${Math.floor(period1)}&period2=${Math.floor(period2)}&interval=${interval}&includePrePost=false`;
    
    console.log(`  🌐 Browser request to: ${url}`);

    // Create a new context for each request (isolated)
    const context = await this.browser!.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    // Block unnecessary resources to speed up
    await context.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    const page = await context.newPage();

    try {
      // Navigate to the URL (faster with domcontentloaded)
      const response = await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });

      if (!response) {
        throw new Error('No response from server');
      }

      if (response.status() === 429) {
        throw new Error('Too Many Requests');
      }

      if (!response.ok()) {
        throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
      }

      // Get the page content (JSON)
      const content = await page.content();
      
      // Extract JSON from the page
      const jsonMatch = content.match(/<pre[^>]*>(.*?)<\/pre>/s);
      if (!jsonMatch) {
        throw new Error('Could not find JSON in response');
      }

      const json = JSON.parse(jsonMatch[1]);
      
      if (json.chart?.error) {
        throw new Error(json.chart.error.description);
      }

      const result = json.chart?.result?.[0];
      if (!result) {
        throw new Error('No data in response');
      }

      // Convert to format
      const quotes: ChartQuote[] = [];
      const timestamps = result.timestamp || [];
      const quote = result.indicators?.quote?.[0] || {};
      
      for (let i = 0; i < timestamps.length; i++) {
        quotes.push({
          date: new Date(timestamps[i] * 1000),
          open: quote.open?.[i] ?? null,
          high: quote.high?.[i] ?? null,
          low: quote.low?.[i] ?? null,
          close: quote.close?.[i] ?? null,
          volume: quote.volume?.[i] ?? null,
          adjclose: result.indicators?.adjclose?.[0]?.adjclose?.[i] ?? null
        });
      }

      return {
        quotes,
        meta: result.meta
      };
    } catch (error) {
      throw error;
    } finally {
      await page.close();
      await context.close();
    }
  }

  // Helper method to get trading hours
  getTradingHours(meta: ChartMeta): {
    preMarket?: { start: Date; end: Date };
    regular?: { start: Date; end: Date };
    postMarket?: { start: Date; end: Date };
  } | null {
    if (!meta.currentTradingPeriod) {
      return null;
    }

    const result: any = {};

    if (meta.currentTradingPeriod.pre) {
      result.preMarket = {
        start: new Date(meta.currentTradingPeriod.pre.start * 1000),
        end: new Date(meta.currentTradingPeriod.pre.end * 1000)
      };
    }

    if (meta.currentTradingPeriod.regular) {
      result.regular = {
        start: new Date(meta.currentTradingPeriod.regular.start * 1000),
        end: new Date(meta.currentTradingPeriod.regular.end * 1000)
      };
    }

    if (meta.currentTradingPeriod.post) {
      result.postMarket = {
        start: new Date(meta.currentTradingPeriod.post.start * 1000),
        end: new Date(meta.currentTradingPeriod.post.end * 1000)
      };
    }

    return result;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('🔒 Browser closed');
    }
  }
}
