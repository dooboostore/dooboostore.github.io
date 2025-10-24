export type ChartQuote = {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  adjclose?: number | null;
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
  chartPreviousClose?: number;
  priceHint?: number;
  currentTradingPeriod?: any;
  dataGranularity?: string;
  range?: string;
  validRanges?: string[];
};

export type ChartResult = {
  quotes: ChartQuote[];
  meta: ChartMeta;
};

export type ChartOptions = {
  period1?: string | Date;
  period2?: string | Date;
  interval?: string;
  proxy?: string; // 프록시 URL (예: 'http://proxy.example.com:8080')
};

export class YahooFinanceDirect {
  private userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
  ];

  private getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  async chart(symbol: string, options: ChartOptions = {}): Promise<ChartResult> {
    const period1 = options.period1 
      ? (typeof options.period1 === 'string' ? new Date(options.period1).getTime() / 1000 : options.period1.getTime() / 1000)
      : Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    
    const period2 = options.period2
      ? (typeof options.period2 === 'string' ? new Date(options.period2).getTime() / 1000 : options.period2.getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    
    const interval = options.interval || '1d';
    
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${Math.floor(period1)}&period2=${Math.floor(period2)}&interval=${interval}&includePrePost=false`;
    
    console.log(`  🌐 Direct HTTP request to: ${url}`);
    
    // Add random delay before request (3-7 seconds)
    const randomDelay = Math.floor(Math.random() * 4000) + 3000;
    console.log(`  ⏳ Waiting ${randomDelay}ms before request...`);
    await new Promise(resolve => setTimeout(resolve, randomDelay));
    
    try {
      const fetchOptions: RequestInit = {
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Referer': 'https://finance.yahoo.com/',
          'Origin': 'https://finance.yahoo.com',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      };

      const response = await fetch(url, fetchOptions);

      if (response.status === 429) {
        throw new Error('Too Many Requests');
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      
      if (json.chart?.error) {
        throw new Error(json.chart.error.description);
      }

      const result = json.chart?.result?.[0];
      if (!result) {
        throw new Error('No data in response');
      }

      // Convert to format similar to yahoo-finance2
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
    }
  }
}
