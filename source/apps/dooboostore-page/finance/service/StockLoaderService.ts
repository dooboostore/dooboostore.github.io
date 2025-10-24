import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { Parser } from 'json2csv';
import { parse } from 'csv-parse/sync';
import YahooFinance from 'yahoo-finance2';
// @ts-ignore
import { QuoteSummaryModules, QuoteSummaryOptions, QuoteSummaryResult } from 'yahoo-finance2/modules/quoteSummary';
// @ts-ignore
import { Quote, QuoteOptions } from 'yahoo-finance2/modules/quote';
// @ts-ignore
import { ChartOptions, ChartResultObject } from 'yahoo-finance2/modules/chart';
// type QuoteSummaryResult =  Parameters<typeof YahooFinance['quoteSummary']>[1]
// const t:QuoteSummaryResult = {modules: ['calendarEvents','earningsHistory','earningsTrend','secFilings','upgradeDowngradeHistory','insiderTransactions']};
// QuoteSummaryModules

// const yf = new YahooFinance({ suppressNotices: ['ripHistorical'] });
const yf = new YahooFinance({
  queue: {
    concurrency: 1
  }
});


export class StockLoader {

  async chart(symbol: string, options?: ChartOptions): Promise<ChartResultObject> {
    try {
      // Add random delay before request (2-5 seconds)
      const randomDelay = Math.floor(Math.random() * 3000) + 2000;
      console.log(`  ⏳ Waiting ${randomDelay}ms before request...`);
      await new Promise(resolve => setTimeout(resolve, randomDelay));
      
      const result = await yf.chart(symbol, options);
      return result;
    } catch (error) {
      console.error(`Failed to fetch chart for ${symbol}:`, (error as Error).message);
      throw error;
    }
  }

  async quoteSummary(symbol: string, modules?: Array<QuoteSummaryModules> | "all"): Promise< QuoteSummaryResult> {
    try {
      const result = await yf.quoteSummary(symbol,  { modules });
      return result;
    } catch (error) {
      console.error(`Failed to fetch quoteSummary for ${symbol}:`, (error as Error).message);
      return null;
    }
  }

  async quote(symbol: string | string[], option?: QuoteOptions ): Promise<Quote> {
    try {
      const result = await yf.quote(symbol, option);
      return result;
    } catch (error) {
      console.error(`Failed to fetch quote for ${symbol}:`, (error as Error).message);
      return null;
    }
  }
}
