import { Component } from '@dooboostore/simple-boot-front/decorators/Component';
import template from './chart.route.component.html';
import styles from './chart.route.component.css';
import { Lifecycle, Sim } from '@dooboostore/simple-boot/decorators/SimDecorator';
import { ApiService } from '@dooboostore/simple-boot/fetch/ApiService';
import { RawSet } from '@dooboostore/dom-render/rawsets/RawSet';
import { OnRawSetRenderedOtherData } from '@dooboostore/dom-render/lifecycle/OnRawSetRendered';
import { OnCreateRender } from '@dooboostore/dom-render/lifecycle/OnCreateRender';
import { RouterAction } from '@dooboostore/simple-boot/route/RouterAction';
import { RoutingDataSet } from '@dooboostore/simple-boot/route/RouterManager';
import { ValidUtils } from '@dooboostore/core-web/valid/ValidUtils';
import { ComponentBase, query } from '@dooboostore/dom-render/components/ComponentBase';
import { ChartData, EventData, FinanceItem, FinanceService } from '@src/service/english/FinanceService';
import { ChartKeyData, OverlayStockChart } from '@dooboostore/lib-web/canvas/chart/OverlayStockChart';
import { Router } from '@dooboostore/dom-render/routers/Router';

@Sim({
  scope: Lifecycle.Transient
})
@Component({
  template,
  styles
})
export class ChartRouteComponent extends ComponentBase implements RouterAction.OnRouting, OnCreateRender {
  private name?: string | undefined;
  currentItem?: FinanceItem;
  private chart?: OverlayStockChart;
  private chartDataMap?: Map<string, ChartData>;
  private eventDataMap?: Map<string, EventData[]>;
  private groupByDay: boolean = false;
  private listenersSetup: boolean = false;
  private chartWrapElement?: HTMLElement;

  constructor(
    private apiService: ApiService,
    private router: Router,
    private financeService: FinanceService
  ) {
    super();
    // console.log('------', router);
  }

  onCreateRender(param: any): void {
  }

  async onRawSetRendered(rawSet: RawSet, otherData: OnRawSetRenderedOtherData): Promise<void> {
    await super.onRawSetRendered(rawSet, otherData);
  }

  async onRouting(r: RoutingDataSet): Promise<void> {
    this.name = undefined;
    this.currentItem = undefined;
    this.chartDataMap = undefined;
    this.eventDataMap = undefined;
    
    this.name = decodeURIComponent(r.routerModule.pathData?.name??'');

    if (ValidUtils.isBrowser() && this.name) {
      // Load finance item
      this.currentItem = await this.financeService.item(this.name!);

      if (this.currentItem) {
        // Load chart data for all symbols
        this.chartDataMap = new Map<string, ChartData>();

        for (const symbol of this.currentItem.symbols) {
          try {
            const chartData = await this.financeService.chart(symbol, []);
            if (chartData) {
              this.chartDataMap.set(symbol, chartData);
            } else {
              console.warn(`⚠ No chart data found for ${symbol}`);
            }
          } catch (error) {
            console.error(`✗ Failed to load chart data for ${symbol}:`, error);
          }
        }
        
        // Load event data for all events
        if (this.currentItem.events && this.currentItem.events.length > 0) {
          this.eventDataMap = new Map<string, EventData[]>();
          
          for (const eventName of this.currentItem.events) {
            try {
              const eventData = await this.financeService.events(eventName);
              if (eventData && eventData.length > 0) {
                this.eventDataMap.set(eventName, eventData);
              } else {
                console.warn(`⚠ No event data found for ${eventName}`);
              }
            } catch (error) {
              console.error(`✗ Failed to load event data for ${eventName}:`, error);
            }
          }
        }

        setTimeout(() => {
          this.chartRender();
        }, 1);
      }
    }
  }

  async onInitRender(param: any, rawSet: RawSet): Promise<void> {
    await super.onInitRender(param, rawSet);
  }

  async chartRender(): Promise<void> {
    if (!this.currentItem || !this.chartDataMap) {
      console.warn('No current item or chart data found');
      return;
    }

    if (this.chartDataMap.size === 0) {
      console.warn('No chart data loaded');
      return;
    }
    
    // chartWrap에서 canvas 찾기
    if (!this.chartWrapElement) {
      console.warn('Chart wrap element not ready');
      return;
    }
    
    const chartCanvas = this.chartWrapElement.querySelector('#chart-canvas') as HTMLCanvasElement;
    if (!chartCanvas) {
      console.warn('Canvas element not found');
      return;
    }

    try {
      // Destroy existing chart before creating new one
      if (this.chart) {
        this.chart.destroy();
        this.chart = undefined;
      }

      // Convert chart data to OverlayStockChart format
      const dataMap = new Map<string, any>();

      this.chartDataMap.forEach((chartData, symbol) => {
        const convertedData = this.convertChartData(chartData, this.groupByDay);
        dataMap.set(symbol, {
          data: convertedData
        });
      });

      // Convert event data to OverlayStockChart format
      const commonEvents: any = { x: [] };
      
      if (this.eventDataMap && this.eventDataMap.size > 0) {
        this.eventDataMap.forEach((events) => {
          events.forEach((event) => {
            commonEvents.x.push({
              x: new Date(event.x).getTime(),
              label: event.label,
              color: '#FF6600'
            });
          });
        });
      }

      // Calculate initial range based on event timestamps only
      let initialRangeMin: number | undefined = undefined;
      let initialRangeMax: number | undefined = undefined;
      
      // 이벤트 데이터에서만 시간 수집
      const eventTimestamps: number[] = [];
      
      if (commonEvents.x && commonEvents.x.length > 0) {
        commonEvents.x.forEach((event: any) => {
          if (event.x) {
            eventTimestamps.push(event.x);
          }
        });
      }
      
      // 이벤트 시간 범위 계산 (앞뒤로 10일 여유 추가)
      if (eventTimestamps.length > 0) {
        const minTime = Math.min(...eventTimestamps);
        const maxTime = Math.max(...eventTimestamps);
        const tenDays = 10 * 24 * 60 * 60 * 1000; // 10일 (밀리초)
        
        // 앞뒤로 10일씩 여유 추가
        initialRangeMin = minTime - tenDays;
        initialRangeMax = maxTime + tenDays;
      }
      
      // Get theme mode from radio buttons
      const themeModeRadio = document.querySelector('input[name="theme-mode"]:checked') as HTMLInputElement;
      const themeMode = (themeModeRadio?.value as 'light' | 'dark' | 'auto') ?? 'auto';
      
      // 사용 가능한 차트 키 결정 (데이터가 있는 것만)
      const availableChartKeys: string[] = ['price', 'volume'];
      
      // 첫 번째 심볼의 데이터를 확인하여 사용 가능한 지표 추가
      const firstSymbolData = dataMap.values().next().value;
      if (firstSymbolData && firstSymbolData.data) {
        if (firstSymbolData.data.obv && firstSymbolData.data.obv.datas.length > 0) {
          availableChartKeys.push('obv');
        }
        if (firstSymbolData.data.atr && firstSymbolData.data.atr.datas.length > 0) {
          availableChartKeys.push('atr');
        }
        if (firstSymbolData.data.rsi && firstSymbolData.data.rsi.datas.length > 0) {
          availableChartKeys.push('rsi');
        }
        if (firstSymbolData.data.adx && firstSymbolData.data.adx.datas.length > 0) {
          availableChartKeys.push('adx');
        }
        if (firstSymbolData.data.vo && firstSymbolData.data.vo.datas.length > 0) {
          availableChartKeys.push('vo');
        }
        if (firstSymbolData.data.mfi && firstSymbolData.data.mfi.datas.length > 0) {
          availableChartKeys.push('mfi');
        }
      }

      console.log('------', dataMap);
      // Create chart
      this.chart = new OverlayStockChart(chartCanvas, dataMap, {
        commonEvents,
        initialState: {
          normalize: 'normalize', // 기본값: 전체 데이터 정규화
          lineMode: 'line-smooth',
          showEvents: true, // 기본값 true
          visibleTickers: new Set(this.currentItem.symbols),
          enabledTickers: new Set(this.currentItem.symbols),
          visibleChartKeys: availableChartKeys
        },
        config: {
          theme: themeMode,
          // showZoomButtons: true,
          lineWidth: 1,
          paddingLeft: 50,
          paddingRight: 30,
          // 초기 X축 범위 설정 (이벤트 기준 ±10일, 이벤트 없으면 undefined로 전체 범위)
          xMin: initialRangeMin !== undefined ? initialRangeMin : undefined,
          xMax: initialRangeMax !== undefined ? initialRangeMax : undefined,
          // 차트 키별 Y축 범위 설정
          yMin: (chartKey: string) => {
            if (chartKey === 'rsi' || chartKey === 'mfi') return 0;
            return undefined;
          },
          yMax: (chartKey: string) => {
            if (chartKey === 'rsi' || chartKey === 'mfi') return 100;
            return undefined;
          },

          // hideLegend: true,
          // hideXAxisLabels: true,
          // hideYAxisLabels: true,
          xLabelCount:3,
          yLabelCount:3,
          xFormat: (xValue: number, index: number, total: number) => {
              const date = new Date(xValue);
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              return `${year}-${month}-${day}`;
          },
          // xFormat: (xValue: number, index: number, total: number) => {
          //   if (index !== 0 && index !== total - 1 && index % Math.ceil(total / 2) !== 0) {
          //     return '';
          //   }
          //   const date = new Date(xValue);
          //   const year = date.getFullYear();
          //   const month = String(date.getMonth() + 1).padStart(2, '0');
          //   const day = String(date.getDate()).padStart(2, '0');
          //   return `${year}-${month}-${day}`;
          // },
          // yFormat: (yValue: number, index: number, total: number) => {
          //   if (index !== 0 && index !== total - 1 && index % Math.ceil(total / 2) !== 0) {
          //     return '';
          //   }
          //   return yValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
          // }
        }
      });

      // Render chart
      this.chart.render();
    } catch (error) {
      console.error('Failed to render chart:', error);
    }
  }

  private convertChartData(chartData: ChartData, groupByDay: boolean = false): { price: ChartKeyData; volume: ChartKeyData; obv?: ChartKeyData; atr?: ChartKeyData; rsi?: ChartKeyData; adx?: ChartKeyData; vo?: ChartKeyData; mfi?: ChartKeyData } {
    const quotes = chartData.quotes || [];

    if (groupByDay) {
      // Group quotes by date (YYYY-MM-DD)
      const groupedByDate = new Map<string, typeof quotes>();
      
      quotes.forEach((quote) => {
        const date = new Date(quote.date);
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        
        if (!groupedByDate.has(dateKey)) {
          groupedByDate.set(dateKey, []);
        }
        groupedByDate.get(dateKey)!.push(quote);
      });
      
      // Aggregate each day's data
      const aggregatedQuotes: typeof quotes = [];
      
      groupedByDate.forEach((dayQuotes) => {
        const firstQuote = dayQuotes[0];
        const lastQuote = dayQuotes[dayQuotes.length - 1];
        
        const open = firstQuote.open;
        const close = lastQuote.close;
        const high = Math.max(...dayQuotes.map(q => q.high));
        const low = Math.min(...dayQuotes.map(q => q.low));
        const volume = dayQuotes.reduce((sum, q) => sum + q.volume, 0);
        
        // 지표값은 마지막 값 사용 (일별로 집계할 때)
        const obv = lastQuote.obv;
        const atr = lastQuote.atr;
        const rsi = lastQuote.rsi;
        const adx = lastQuote.adx;
        const vo = lastQuote.vo;
        const mfi = lastQuote.mfi;

        aggregatedQuotes.push({ 
          date: firstQuote.date, 
          open, 
          high, 
          low, 
          close, 
          volume,
          adjclose: lastQuote.adjclose,
          obv,
          atr,
          rsi,
          adx,
          vo,
          mfi
        });
      });
      
      // Sort by date
      aggregatedQuotes.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      const price = aggregatedQuotes.map((quote) => ({
        x: new Date(quote.date).getTime(),
        yOpen: quote.open,
        yHigh: quote.high,
        yLow: quote.low,
        y: quote.close
      }));
      
      const volume = aggregatedQuotes.map((quote) => ({
        x: new Date(quote.date).getTime(),
        y: quote.volume
      }));
      
      const result: any = {
        price: { 
          datas: price
        },
        volume: { 
          datas: volume
        }
      };
      
      // OBV 데이터 추가 (값이 있는 것만)
      const obvData = aggregatedQuotes
        .filter(q => q.obv !== undefined)
        .map((quote) => ({
          x: new Date(quote.date).getTime(),
          y: quote.obv!
        }));
      if (obvData.length > 0) {
        result.obv = { 
          datas: obvData
        };
      }
      
      // ATR 데이터 추가 (값이 있는 것만)
      const atrData = aggregatedQuotes
        .filter(q => q.atr !== undefined)
        .map((quote) => ({
          x: new Date(quote.date).getTime(),
          y: quote.atr!
        }));
      if (atrData.length > 0) {
        result.atr = { 
          datas: atrData
        };
      }
      
      // RSI 데이터 추가 (값이 있는 것만)
      const rsiData = aggregatedQuotes
        .filter(q => q.rsi !== undefined)
        .map((quote) => ({
          x: new Date(quote.date).getTime(),
          y: quote.rsi!
        }));
      if (rsiData.length > 0) {
        result.rsi = { 
          datas: rsiData
        };
      }
      
      // ADX 데이터 추가 (값이 있는 것만)
      const adxData = aggregatedQuotes
        .filter(q => q.adx !== undefined)
        .map((quote) => ({
          x: new Date(quote.date).getTime(),
          y: quote.adx!
        }));
      if (adxData.length > 0) {
        result.adx = { 
          datas: adxData
        };
      }
      
      // VO 데이터 추가 (값이 있는 것만)
      const voData = aggregatedQuotes
        .filter(q => q.vo !== undefined)
        .map((quote) => ({
          x: new Date(quote.date).getTime(),
          y: quote.vo!
        }));
      if (voData.length > 0) {
        result.vo = { 
          datas: voData
        };
      }
      
      // MFI 데이터 추가 (값이 있는 것만)
      const mfiData = aggregatedQuotes
        .filter(q => q.mfi !== undefined)
        .map((quote) => ({
          x: new Date(quote.date).getTime(),
          y: quote.mfi!
        }));
      if (mfiData.length > 0) {
        result.mfi = { 
          datas: mfiData
        };
      }
      
      return result;
    } else {
      // Original conversion without grouping
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
      
      const result: any = {
        price: { 
          datas: price
        },
        volume: { 
          datas: volume
        }
      };
      
      // OBV 데이터 추가 (값이 있는 것만)
      const obvData = quotes
        .filter(q => q.obv !== undefined)
        .map((quote) => ({
          x: new Date(quote.date).getTime(),
          y: quote.obv!
        }));
      if (obvData.length > 0) {
        result.obv = { 
          datas: obvData
        };
      }
      
      // ATR 데이터 추가 (값이 있는 것만)
      const atrData = quotes
        .filter(q => q.atr !== undefined)
        .map((quote) => ({
          x: new Date(quote.date).getTime(),
          y: quote.atr!
        }));
      if (atrData.length > 0) {
        result.atr = { 
          datas: atrData
        };
      }
      
      // RSI 데이터 추가 (값이 있는 것만)
      const rsiData = quotes
        .filter(q => q.rsi !== undefined)
        .map((quote) => ({
          x: new Date(quote.date).getTime(),
          y: quote.rsi!
        }));
      if (rsiData.length > 0) {
        result.rsi = { 
          datas: rsiData
        };
      }
      
      // ADX 데이터 추가 (값이 있는 것만)
      const adxData = quotes
        .filter(q => q.adx !== undefined)
        .map((quote) => ({
          x: new Date(quote.date).getTime(),
          y: quote.adx!
        }));
      if (adxData.length > 0) {
        result.adx = { 
          datas: adxData
        };
      }
      
      // VO 데이터 추가 (값이 있는 것만)
      const voData = quotes
        .filter(q => q.vo !== undefined)
        .map((quote) => ({
          x: new Date(quote.date).getTime(),
          y: quote.vo!
        }));
      if (voData.length > 0) {
        result.vo = { 
          datas: voData
        };
      }
      
      // MFI 데이터 추가 (값이 있는 것만)
      const mfiData = quotes
        .filter(q => q.mfi !== undefined)
        .map((quote) => ({
          x: new Date(quote.date).getTime(),
          y: quote.mfi!
        }));
      if (mfiData.length > 0) {
        result.mfi = { 
          datas: mfiData
        };
      }
      
      return result;
    }
  }

  @query('.chart-wrap')
  chartWrap(el: HTMLElement) {
    if(!ValidUtils.isBrowser()){
      return;
    }
    
    // 요소 저장
    this.chartWrapElement = el;
    
    // 이미 리스너가 설정되었으면 스킵
    if (this.listenersSetup) {
      return;
    }
    
    this.listenersSetup = true;
    
    // ResizeObserver로 캔버스 크기 자동 조절
    const resizeObserver = new ResizeObserver(() => {
      // 차트가 있으면 리렌더링
      if (this.chart) {
        this.chart.render();
      }
    });
    
    resizeObserver.observe(el);
    
    // Checkbox controls
    const toggleDailyGroup = el.querySelector('#toggle-daily-group') as HTMLInputElement;
    const toggleHideLines = el.querySelector('#toggle-hide-lines') as HTMLInputElement;
    const toggleShowGrid = el.querySelector('#toggle-show-grid') as HTMLInputElement;
    const toggleShowPoints = el.querySelector('#toggle-show-points') as HTMLInputElement;
    const toggleShowAverage = el.querySelector('#toggle-show-average') as HTMLInputElement;
    const toggleShowMA5 = el.querySelector('#toggle-show-ma5') as HTMLInputElement;
    const toggleShowMA10 = el.querySelector('#toggle-show-ma10') as HTMLInputElement;
    const toggleShowMA20 = el.querySelector('#toggle-show-ma20') as HTMLInputElement;
    const toggleShowMA50 = el.querySelector('#toggle-show-ma50') as HTMLInputElement;
    const toggleShowMA100 = el.querySelector('#toggle-show-ma100') as HTMLInputElement;
    const toggleEvents = el.querySelector('#toggle-events') as HTMLInputElement;
    const toggleCandles = el.querySelector('#toggle-candles') as HTMLInputElement;
    
    // Radio controls
    const lineModeRadios = el.querySelectorAll('input[name="line-mode"]');
    const normalizeModeRadios = el.querySelectorAll('input[name="normalize-mode"]');
    const themeModeRadios = el.querySelectorAll('input[name="theme-mode"]');

    if (toggleDailyGroup) {
      toggleDailyGroup.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        this.groupByDay = checked;
        setTimeout(() => {
          this.chartRender();
        }, 10);
      });
    }

    if (toggleHideLines) {
      toggleHideLines.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        this.chart?.updateState({ hideLines: checked });
      });
    }

    if (toggleShowGrid) {
      toggleShowGrid.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        this.chart?.updateState({ showGrid: checked });
      });
    }

    if (toggleShowPoints) {
      toggleShowPoints.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        this.chart?.updateState({ showPoints: checked });
      });
    }

    // 이동평균선 토글 헬퍼 함수 (먼저 선언)
    const updateMovingAverages = () => {
      if (!this.chart) return;
      
      console.log('[updateMovingAverages] called');
      console.log('평균선 checked:', toggleShowAverage?.checked);
      console.log('MA5 checked:', toggleShowMA5?.checked);
      console.log('MA10 checked:', toggleShowMA10?.checked);
      console.log('MA20 checked:', toggleShowMA20?.checked);
      console.log('MA50 checked:', toggleShowMA50?.checked);
      console.log('MA100 checked:', toggleShowMA100?.checked);
      
      const movingAverages: any[] = [];
      
      // 평균선 (전체 평균선)
      if (toggleShowAverage?.checked) {
        movingAverages.push({ type: 'average', label: '전체평균', visible: true });
      }
      
      // 이동평균선 추가 (1일 = 24시간 = 86400000 밀리초)
      const oneDayMs = 24 * 60 * 60 * 1000;
      
      // 티커별 이동평균선을 위한 xWidth 배열 생성
      const tickerMovingAverageWidths: number[] = [];
      
      // 전역 이동평균선 수집 (투명도 계산을 위해) - 평균선 체크박스가 ON일 때만
      const globalMovingAverages: { xWidth: number; label: string }[] = [];
      
      if (toggleShowMA5?.checked) {
        if (toggleShowAverage?.checked) {
          globalMovingAverages.push({ xWidth: 5 * oneDayMs, label: 'MA5' });
        }
        tickerMovingAverageWidths.push(5 * oneDayMs);
      }
      if (toggleShowMA10?.checked) {
        if (toggleShowAverage?.checked) {
          globalMovingAverages.push({ xWidth: 10 * oneDayMs, label: 'MA10' });
        }
        tickerMovingAverageWidths.push(10 * oneDayMs);
      }
      if (toggleShowMA20?.checked) {
        if (toggleShowAverage?.checked) {
          globalMovingAverages.push({ xWidth: 20 * oneDayMs, label: 'MA20' });
        }
        tickerMovingAverageWidths.push(20 * oneDayMs);
      }
      if (toggleShowMA50?.checked) {
        if (toggleShowAverage?.checked) {
          globalMovingAverages.push({ xWidth: 50 * oneDayMs, label: 'MA50' });
        }
        tickerMovingAverageWidths.push(50 * oneDayMs);
      }
      if (toggleShowMA100?.checked) {
        if (toggleShowAverage?.checked) {
          globalMovingAverages.push({ xWidth: 100 * oneDayMs, label: 'MA100' });
        }
        tickerMovingAverageWidths.push(100 * oneDayMs);
      }
      
      console.log('tickerMovingAverageWidths:', tickerMovingAverageWidths);
      console.log('globalMovingAverages:', globalMovingAverages);
      
      // 전역 이동평균선에 단계별 투명도 적용
      const totalLines = globalMovingAverages.length;
      globalMovingAverages.forEach((ma, index) => {
        // 첫 번째 선은 불투명(1.0), 마지막 선은 투명(0.3)
        const opacity = totalLines === 1 ? 1.0 : 1.0 - (index / (totalLines - 1)) * 0.7;
        
        movingAverages.push({ 
          type: 'moving', 
          xWidth: ma.xWidth, 
          label: ma.label,
          visible: true,
          opacity
        });
      });
      
      console.log('final movingAverages:', movingAverages);
      
      // 각 티커의 모든 chartKey에 movingAverageXwidth 업데이트
      this.chart.updateTickerMovingAverages(tickerMovingAverageWidths);
      
      this.chart.updateState({ showAverage: movingAverages });
    };

    if (toggleShowAverage) {
      toggleShowAverage.addEventListener('change', updateMovingAverages);
    }

    if (toggleShowMA5) {
      toggleShowMA5.addEventListener('change', updateMovingAverages);
    }
    if (toggleShowMA10) {
      toggleShowMA10.addEventListener('change', updateMovingAverages);
    }
    if (toggleShowMA20) {
      toggleShowMA20.addEventListener('change', updateMovingAverages);
    }
    if (toggleShowMA50) {
      toggleShowMA50.addEventListener('change', updateMovingAverages);
    }
    if (toggleShowMA100) {
      toggleShowMA100.addEventListener('change', updateMovingAverages);
    }

    if (toggleEvents) {
      toggleEvents.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        this.chart?.updateState({ showEvents: checked });
      });
    }

    if (toggleCandles) {
      toggleCandles.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        this.chart?.updateState({ showCandles: checked });
      });
    }

    lineModeRadios.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const value = (e.target as HTMLInputElement).value;
        this.chart?.updateState({ lineMode: value as any });
      });
    });
    
    normalizeModeRadios.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const value = (e.target as HTMLInputElement).value as 'none' | 'rangeNormalize' | 'normalize';
        this.chart?.updateState({ normalize: value });
      });
    });
    
    themeModeRadios.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const value = (e.target as HTMLInputElement).value as 'light' | 'dark' | 'auto';
        
        if (!this.chart) {
          console.warn('Chart not ready for theme change');
          return;
        }
        
        // 현재 상태 저장
        const currentState = this.chart.getState();
        this.chart.destroy();
        this.chart = undefined;
        
        // 즉시 재생성
        this.chartRender();
        
        // 상태 복원
        if (this.chart) {
          (this.chart as OverlayStockChart).updateState(currentState);
        }
      });
    });
  }

  onDrThisUnBind() {
    super.onDrThisUnBind();
    this.onDestroy();
  }

  onDestroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = undefined;
    }
  }
}
