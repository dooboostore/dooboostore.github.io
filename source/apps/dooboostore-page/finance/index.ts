import { StockLoader } from './service/StockLoaderService';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createCanvas } from 'canvas';
import { ChartKeyData } from '@lib-web/canvas/chart/OverlayStockChart';
import pageData from './page/page-data'
import algorithms from './algorithms/algorithms'

(async () => {
  // Step 1: Fetch finance data (if needed)
  // Step 2: Generate chart images
  // await pageData.run()
  await algorithms.run();
})();

console.log('finance index');
