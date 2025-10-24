import { StockLoader } from '../service/StockLoaderService';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createCanvas } from 'canvas';
import { ChartKeyData } from '../../../../packages/@dooboostore/lib-web/src/canvas/chart/OverlayStockChart';
interface FinanceItem {
  symbol: string;
  parameter: Record<string, any>;
}

interface FinanceItem {
  symbol: string;
  label: string;
  symbols: string[];
  events: string[];
  normalize: boolean;
}
interface ChartData {
  quotes: Array<{
    date: string;
    high: number;
    volume: number;
    open: number;
    low: number;
    close: number;
    adjclose: number;
  }>;
}
const QUOTE_DIR = join(__dirname, '../../../../datas/finance/quote');
const CHART_DIR = join(__dirname, '../../../../datas/finance/chart');
const EVENT_DIR = join(__dirname, '../../../../datas/finance/event');
const ITEM_DIR = join(__dirname, '../../../../datas/finance/item');
const TICKERS_PATH = join(__dirname, '../../../../datas/finance/tickers.json');
const GROUPS_PATH = join(__dirname, '../../../../datas/finance/groups.json');
const ITEMS_PATH = join(__dirname, '../../../../datas/finance/items.json');

// Yahoo Finance chart 데이터를 OverlayStockChart 형식으로 변환
function convertChartData(chartData: ChartData): {price: ChartKeyData, volume: ChartKeyData} {
  const quotes = chartData.quotes || [];

  const price = quotes.map((quote) => ({
    x: new Date(quote.date).getTime(),
    yOpen: quote.open,
    yHigh: quote.high,
    yLow: quote.low,
    y: quote.close
  }));
  const volume = quotes.map((quote) => ({
    x: new Date(quote.date).getTime(),
    y: quote.volume
  }));
  return {
    price: {datas: price},
    volume: {datas: volume},
  };
}

// Event 데이터를 OverlayStockChart 형식으로 변환
function convertEventData(eventData: any[]): any[] {
  return eventData.map((event: any) => ({
    x: new Date(event.x).getTime(),
    label: event.label,
    color: event.color || '#FF0000'
  }));
}

async function generateChartImages() {
  // Dynamically load OverlayStockChart
  const { OverlayStockChart } = require('../../../../packages/@dooboostore/lib-web/src/canvas/chart/OverlayStockChart');

  // Ensure item directory exists
  if (!existsSync(ITEM_DIR)) {
    mkdirSync(ITEM_DIR, { recursive: true });
  }

  // Load chart items
  const chartItems: FinanceItem[] = JSON.parse(readFileSync(ITEMS_PATH, 'utf-8'));

  console.log(`Generating ${chartItems.length} chart images...`);

  for (const item of chartItems) {
    const { symbol, label, symbols, events, normalize } = item;

    console.log(`\nProcessing chart: ${symbol} (${label})`);

    // Load chart data for each symbol
    const dataMap = new Map<string, any>();

    for (const tickerSymbol of symbols) {
      const chartPath = join(CHART_DIR, `${tickerSymbol}.json`);

      if (!existsSync(chartPath)) {
        console.warn(`  ⚠ Chart data not found for ${tickerSymbol}, skipping...`);
        continue;
      }

      try {
        const chartData = JSON.parse(readFileSync(chartPath, 'utf-8')) as  ChartData;
        const convertedData = convertChartData(chartData);

        dataMap.set(tickerSymbol, {
          data: convertedData
        });

        console.log(`  ✓ Loaded chart data for ${tickerSymbol}`);
      } catch (error) {
        console.error(`  ✗ Failed to load chart data for ${tickerSymbol}:`, error);
      }
    }

    if (dataMap.size === 0) {
      console.warn(`  ⚠ No chart data available for ${symbol}, skipping...`);
      continue;
    }

    // Load event data
    const commonEvents: any = { x: [] };
    let eventMinTime = Infinity;
    let eventMaxTime = -Infinity;

    for (const eventName of events) {
      const eventPath = join(EVENT_DIR, `${eventName}.json`);

      if (!existsSync(eventPath)) {
        console.warn(`  ⚠ Event data not found for ${eventName}, skipping...`);
        continue;
      }

      try {
        const eventData = JSON.parse(readFileSync(eventPath, 'utf-8'));
        const convertedEvents = convertEventData(eventData);
        commonEvents.x.push(...convertedEvents);

        // 이벤트 시간 범위 계산
        convertedEvents.forEach((event: any) => {
          if (event.x < eventMinTime) eventMinTime = event.x;
          if (event.x > eventMaxTime) eventMaxTime = event.x;
        });

        console.log(`  ✓ Loaded event data for ${eventName}`);
      } catch (error) {
        console.error(`  ✗ Failed to load event data for ${eventName}:`, error);
      }
    }

    // 이벤트 범위에 앞뒤로 2일 여백 추가
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
    const xMin = eventMinTime !== Infinity ? eventMinTime - twoDaysInMs : new Date('2023-01-01').getTime();
    const xMax = eventMaxTime !== -Infinity ? eventMaxTime + twoDaysInMs : new Date('2026-01-01').getTime();

    // Create canvas
    const width = 1024;
    const height = 800;
    const canvas = createCanvas(width, height) as any;

    try {
      // Create chart
      const chart = new OverlayStockChart(canvas, dataMap, {
        commonEvents,
        initialState: {
          normalize,
          lineMode: 'line-smooth',
          showEvents: commonEvents.x.length > 0,
          visibleTickers: new Set(symbols),
          enabledTickers: new Set(symbols),
          visibleChartKeys: ['price', 'volume']  // price와 volume 모두 표시
        },
        config: {
          xMin,
          xMax,
          xFormat: (xValue: number, index, total) => {
            if (index !==0 && index !== total-1 && index % Math.ceil(total / 2) !== 0) {
              return '';
            }
            const date = new Date(xValue);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          }

        }
      });

      // Render chart
      chart.render();

      // Save as PNG
      const imagePath = join(ITEM_DIR, `${symbol}.png`);
      const buffer = canvas.toBuffer('image/png');
      writeFileSync(imagePath, buffer);

      console.log(`  ✓ Saved chart image: ${imagePath}`);

      // Cleanup
      chart.destroy();
    } catch (error) {
      console.error(`  ✗ Failed to generate chart for ${symbol}:`, error);
      console.error(error);
    }
  }

  console.log('\nChart image generation completed!');
}

async function fetchFinanceData() {
  const stockLoader = new StockLoader();

  // Ensure directories exist
  if (!existsSync(QUOTE_DIR)) {
    mkdirSync(QUOTE_DIR, { recursive: true });
  }
  if (!existsSync(CHART_DIR)) {
    mkdirSync(CHART_DIR, { recursive: true });
  }

  // Load items
  const tickers: FinanceItem[] = JSON.parse(readFileSync(TICKERS_PATH, 'utf-8'));

  console.log(`Processing ${tickers.length} symbols...`);

  for (const ticker of tickers) {
    const { symbol, parameter: {period1, period2, interval} } = ticker;

    // 0. Fetch quoteSummary
    const quotePath = join(QUOTE_DIR, `${symbol}.json`);
    if (!existsSync(quotePath)) {
      console.log(`Fetching quoteSummary for ${symbol}...`);
      try {
        const quoteData = await stockLoader.quoteSummary(symbol, 'all');
        if (quoteData) {
          writeFileSync(quotePath, JSON.stringify(quoteData, null, 2));
          console.log(`✓ Saved quoteSummary for ${symbol}`);
        }
      } catch (error) {
        console.error(`✗ Failed to fetch quoteSummary for ${symbol}:`, error);
      }
    } else {
      console.log(`⊘ Skipping quoteSummary for ${symbol} (already exists)`);
    }

    // 1. Fetch chart data
    const chartPath = join(CHART_DIR, `${symbol}.json`);
    if (!existsSync(chartPath)) {
      console.log(`Fetching chart for ${symbol}...`);
      try {
        const chartData = await stockLoader.chart(symbol, {
          period1,
          period2,
          interval
        });
        if (chartData) {
          writeFileSync(chartPath, JSON.stringify(chartData, null, 2));
          console.log(`✓ Saved chart for ${symbol}`);
        }
      } catch (error) {
        console.error(`✗ Failed to fetch chart for ${symbol}:`, error);
      }
    } else {
      console.log(`⊘ Skipping chart for ${symbol} (already exists)`);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('Finance data fetch completed!');
}


export default {
  fetchFinanceData,
  generateChartImages,
  run: async () =>{
    await fetchFinanceData();
    await generateChartImages();
  }
}