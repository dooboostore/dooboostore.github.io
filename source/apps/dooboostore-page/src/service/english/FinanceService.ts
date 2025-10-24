import { Sim } from '@dooboostore/simple-boot/decorators/SimDecorator';
import { ApiService } from '@dooboostore/simple-boot/fetch/ApiService';
import { environment } from '@back-end/environments/environment';
import { VideoItem } from '@src/service/english/VideoItemService';

export type FinanceItem = {
  symbol: string;
  label: string;
  symbols: string[];
  events: string[];
  normalize: boolean;
}
export type IndicatorType = 'obv' | 'atr' | 'adx' | 'rsi' | 'vo' | 'mfi';

export type ChartData = {
  quotes: Array<{
    date: string;
    high: number;
    volume: number;
    open: number;
    low: number;
    close: number;
    adjclose: number;
    obv?: number;
    atr?: number;
    adx?: number;
    rsi?: number;
    vo?: number;
    mfi?: number;
  }>;
}
export type EventData = {
  x: string; // date
  label: string;
}
@Sim
export class FinanceService {
  constructor(private apiService: ApiService) {
  }

  async items(): Promise<FinanceItem[]> {
    return await this.apiService.get<FinanceItem[]>({
      target: new URL(`${environment.host}/datas/finance/items.json`)
    }).then(it => it.reverse());
  }
  async item(symbol: string): Promise<FinanceItem | undefined>{
    const items = await this.items();
    return items.find(item => item.symbol === symbol);
  }
  async chart(symbol: string, indicators: IndicatorType[] = ['obv', 'atr', 'rsi', 'adx', 'vo', 'mfi']): Promise<ChartData | undefined> {
    const chartData = await this.apiService.get<ChartData>({
      target: new URL(`${environment.host}/datas/finance/chart/${symbol}.json`)
    });
    
    if (!chartData || !chartData.quotes || chartData.quotes.length === 0) {
      return chartData;
    }
    
    const indicatorCounts: Record<string, number> = {};
    
    // OBV (On-Balance Volume) 계산
    if (indicators.includes('obv')) {
      let obvValue = 0;
      chartData.quotes.forEach((quote, index) => {
        if (index === 0) {
          obvValue = quote.volume;
        } else {
          const prevClose = chartData.quotes[index - 1].close;
          if (quote.close > prevClose) {
            obvValue += quote.volume;
          } else if (quote.close < prevClose) {
            obvValue -= quote.volume;
          }
        }
        quote.obv = obvValue;
      });
      indicatorCounts['OBV'] = chartData.quotes.filter(q => q.obv !== undefined).length;
    }
    
    // ATR (Average True Range) 계산 - 14일 기준
    if (indicators.includes('atr')) {
      const atrPeriod = 14;
      const trValues: number[] = [];
      
      for (let i = 0; i < chartData.quotes.length; i++) {
        if (i === 0) {
          const tr = chartData.quotes[i].high - chartData.quotes[i].low;
          trValues.push(tr);
        } else {
          const high = chartData.quotes[i].high;
          const low = chartData.quotes[i].low;
          const prevClose = chartData.quotes[i - 1].close;
          
          const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
          );
          trValues.push(tr);
          
          if (i >= atrPeriod) {
            if (i === atrPeriod) {
              const sum = trValues.slice(0, atrPeriod).reduce((acc, val) => acc + val, 0);
              chartData.quotes[i].atr = sum / atrPeriod;
            } else {
              const prevATR = chartData.quotes[i - 1].atr!;
              chartData.quotes[i].atr = ((prevATR * (atrPeriod - 1)) + tr) / atrPeriod;
            }
          }
        }
      }
      indicatorCounts['ATR'] = chartData.quotes.filter(q => q.atr !== undefined).length;
    }
    
    // RSI (Relative Strength Index) 계산 - 14일 기준
    if (indicators.includes('rsi')) {
      const rsiPeriod = 14;
      
      for (let i = rsiPeriod; i < chartData.quotes.length; i++) {
        let gains = 0;
        let losses = 0;
        
        for (let j = i - rsiPeriod + 1; j <= i; j++) {
          const change = chartData.quotes[j].close - chartData.quotes[j - 1].close;
          if (change > 0) gains += change;
          else losses += Math.abs(change);
        }
        
        const avgGain = gains / rsiPeriod;
        const avgLoss = losses / rsiPeriod;
        
        if (avgLoss === 0) {
          chartData.quotes[i].rsi = 100;
        } else {
          const rs = avgGain / avgLoss;
          chartData.quotes[i].rsi = 100 - (100 / (1 + rs));
        }
      }
      indicatorCounts['RSI'] = chartData.quotes.filter(q => q.rsi !== undefined).length;
    }
    
    // ADX (Average Directional Index) 계산 - 14일 기준
    if (indicators.includes('adx')) {
      const adxPeriod = 14;
      const plusDM: number[] = [];
      const minusDM: number[] = [];
      
      for (let i = 1; i < chartData.quotes.length; i++) {
        const highDiff = chartData.quotes[i].high - chartData.quotes[i - 1].high;
        const lowDiff = chartData.quotes[i - 1].low - chartData.quotes[i].low;
        
        plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
        minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
      }
      
      const plusDI: number[] = [];
      const minusDI: number[] = [];
      
      for (let i = adxPeriod - 1; i < plusDM.length; i++) {
        const sumPlusDM = plusDM.slice(i - adxPeriod + 1, i + 1).reduce((a, b) => a + b, 0);
        const sumMinusDM = minusDM.slice(i - adxPeriod + 1, i + 1).reduce((a, b) => a + b, 0);
        
        const quoteIndex = i + 1;
        const atrValue = chartData.quotes[quoteIndex].atr;
        if (atrValue) {
          plusDI.push((sumPlusDM / atrValue) * 100);
          minusDI.push((sumMinusDM / atrValue) * 100);
        }
      }
      
      const dx: number[] = [];
      for (let i = 0; i < plusDI.length; i++) {
        const diSum = plusDI[i] + minusDI[i];
        const diDiff = Math.abs(plusDI[i] - minusDI[i]);
        dx.push(diSum > 0 ? (diDiff / diSum) * 100 : 0);
      }
      
      for (let i = adxPeriod - 1; i < dx.length; i++) {
        const adxValue = dx.slice(i - adxPeriod + 1, i + 1).reduce((a, b) => a + b, 0) / adxPeriod;
        const quoteIndex = adxPeriod + adxPeriod - 1 + (i - adxPeriod + 1);
        if (quoteIndex < chartData.quotes.length) {
          chartData.quotes[quoteIndex].adx = adxValue;
        }
      }
      indicatorCounts['ADX'] = chartData.quotes.filter(q => q.adx !== undefined).length;
    }
    
    // VO (Volume Oscillator) 계산 - 5일/10일 기준
    if (indicators.includes('vo')) {
      const shortPeriod = 5;
      const longPeriod = 10;
      
      for (let i = longPeriod - 1; i < chartData.quotes.length; i++) {
        const shortVolumes = chartData.quotes.slice(i - shortPeriod + 1, i + 1).map(q => q.volume);
        const longVolumes = chartData.quotes.slice(i - longPeriod + 1, i + 1).map(q => q.volume);
        
        const shortAvg = shortVolumes.reduce((a, b) => a + b, 0) / shortPeriod;
        const longAvg = longVolumes.reduce((a, b) => a + b, 0) / longPeriod;
        
        // VO = ((Short MA - Long MA) / Long MA) * 100
        chartData.quotes[i].vo = ((shortAvg - longAvg) / longAvg) * 100;
      }
      indicatorCounts['VO'] = chartData.quotes.filter(q => q.vo !== undefined).length;
    }
    
    // MFI (Money Flow Index) 계산 - 14일 기준
    if (indicators.includes('mfi')) {
      const mfiPeriod = 14;
      
      // Typical Price와 Money Flow 계산
      const typicalPrices: number[] = [];
      const moneyFlows: number[] = [];
      
      for (let i = 0; i < chartData.quotes.length; i++) {
        const tp = (chartData.quotes[i].high + chartData.quotes[i].low + chartData.quotes[i].close) / 3;
        typicalPrices.push(tp);
        moneyFlows.push(tp * chartData.quotes[i].volume);
      }
      
      for (let i = mfiPeriod; i < chartData.quotes.length; i++) {
        let positiveFlow = 0;
        let negativeFlow = 0;
        
        for (let j = i - mfiPeriod + 1; j <= i; j++) {
          if (typicalPrices[j] > typicalPrices[j - 1]) {
            positiveFlow += moneyFlows[j];
          } else if (typicalPrices[j] < typicalPrices[j - 1]) {
            negativeFlow += moneyFlows[j];
          }
        }
        
        if (negativeFlow === 0) {
          chartData.quotes[i].mfi = 100;
        } else {
          const moneyFlowRatio = positiveFlow / negativeFlow;
          chartData.quotes[i].mfi = 100 - (100 / (1 + moneyFlowRatio));
        }
      }
      indicatorCounts['MFI'] = chartData.quotes.filter(q => q.mfi !== undefined).length;
    }
    
    console.log(`📊 Indicators calculated for ${chartData.quotes.length} quotes`);
    Object.entries(indicatorCounts).forEach(([name, count]) => {
      console.log(`  - ${name}: ${count} values`);
    });
    
    return chartData;
  }
  async events(symbol: string): Promise<EventData[]> {
    return await this.apiService.get<EventData[]>({
      target: new URL(`${environment.host}/datas/finance/event/${symbol}.json`)
    });
  }

}