import { createCanvas, Canvas, CanvasRenderingContext2D } from 'canvas';
import type { Transaction } from './types';

// 데이터 포인트 타입 (캔들용 OHLC + 거래량)
export type ChartDataPoint = {
  time: Date;
  open: number;   // 시가 등락률
  high: number;   // 고가 등락률
  low: number;    // 저가 등락률
  close: number;  // 종가 등락률
  volume: number; // 거래량 등락률
  ma: Map<number, number>;  // 이평선 (기간 -> 값)
  actualClose?: number;  // 실제 종가
  actualVolume?: number; // 실제 거래량
  obv?: number;          // OBV
  crossStatus?: 'GOLDEN' | 'DEAD';  // 크로스 상태
};

// 차트 표시 옵션
export type ChartShowType = 'VOLUME' | 'OBV' | 'VOLUME_RATE';

export type ChartConfig = {
  shows: ChartShowType[];
};

// MA 색상 매핑
const MA_COLORS: Record<number, string> = {
  5: '#9C27B0',   // 보라
  10: '#FF9800',  // 주황
  20: '#4CAF50',  // 초록
  50: '#F44336'   // 빨강
};

export class TradeChart {
  private canvas: Canvas;
  private ctx: CanvasRenderingContext2D;
  private scale = 2;
  
  // 차트 설정
  private width = 1200;
  private height = 950;  // 4단 차트용 높이 증가
  private padding = { top: 60, right: 80, bottom: 60, left: 80 };
  private gap = 12;  // 차트 간격
  
  private title: string = '';
  private data: ChartDataPoint[] = [];
  private maPeriods: number[] = [];
  private isGroup: boolean = false;
  private transactions: Transaction[] = [];
  private summary: { totalHolding: number; totalProfitRate: number; totalProfit: number } | null = null;
  private config: ChartConfig = { shows: ['VOLUME', 'OBV'] };

  constructor() {
    this.canvas = createCanvas(this.width * this.scale, this.height * this.scale);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(this.scale, this.scale);
  }

  setTitle(title: string): this {
    this.title = title;
    return this;
  }

  setData(data: ChartDataPoint[]): this {
    this.data = data;
    return this;
  }

  setMAPeriods(periods: number[]): this {
    this.maPeriods = periods;
    return this;
  }

  setIsGroup(isGroup: boolean): this {
    this.isGroup = isGroup;
    return this;
  }

  setTransactions(transactions: Transaction[]): this {
    this.transactions = transactions;
    return this;
  }

  setSummary(totalHolding: number, totalProfitRate: number, totalProfit: number): this {
    this.summary = { totalHolding, totalProfitRate, totalProfit };
    return this;
  }

  setConfig(config: ChartConfig): this {
    this.config = config;
    // 표시할 차트 수에 따라 높이 조정
    const chartCount = 1 + config.shows.length; // 가격 차트 + 추가 차트들
    this.height = 500 + chartCount * 120;
    // 캔버스 재생성
    this.canvas = createCanvas(this.width * this.scale, this.height * this.scale);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(this.scale, this.scale);
    return this;
  }

  draw(): this {
    if (this.data.length === 0 || this.data.length === 1) return this;

    const { ctx, width, height, padding, gap, config } = this;
    const chartWidth = width - padding.left - padding.right;
    
    // 표시할 차트 수에 따라 높이 비율 계산
    const showVolume = config.shows.includes('VOLUME');
    const showOBV = config.shows.includes('OBV');
    const subChartCount = config.shows.length;
    
    const totalChartHeight = height - padding.top - padding.bottom - gap * subChartCount;
    const priceChartHeight = totalChartHeight * (subChartCount === 0 ? 1 : (subChartCount === 1 ? 0.7 : 0.55));
    const subChartHeight = subChartCount > 0 ? (totalChartHeight - priceChartHeight) / subChartCount : 0;
    
    const priceChartTop = padding.top;
    
    // 서브 차트 위치 계산
    let currentTop = priceChartTop + priceChartHeight + gap;
    const chartPositions: { type: ChartShowType; top: number; height: number }[] = [];
    config.shows.forEach(type => {
      chartPositions.push({ type, top: currentTop, height: subChartHeight });
      currentTop += subChartHeight + gap;
    });
    
    // 마지막 차트 bottom 위치
    const lastChartBottom = chartPositions.length > 0 
      ? chartPositions[chartPositions.length - 1].top + subChartHeight 
      : priceChartTop + priceChartHeight;

    // 배경
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // 가격 데이터 범위
    let priceMin = Infinity, priceMax = -Infinity;
    this.data.forEach(d => {
      priceMin = Math.min(priceMin, d.low);
      priceMax = Math.max(priceMax, d.high);
      d.ma.forEach(v => {
        if (isFinite(v)) {
          priceMin = Math.min(priceMin, v);
          priceMax = Math.max(priceMax, v);
        }
      });
    });
    if (priceMax === priceMin) { priceMin -= 1; priceMax += 1; }
    const priceRange = priceMax - priceMin;
    priceMin -= priceRange * 0.1;
    priceMax += priceRange * 0.1;

    // 실제 거래량 데이터 범위 (최대값 기준 0~100%)
    let actualVolMax = 0;
    this.data.forEach(d => {
      if (d.actualVolume !== undefined && d.actualVolume > actualVolMax) {
        actualVolMax = d.actualVolume;
      }
    });
    if (actualVolMax === 0) actualVolMax = 1; // 0 방지

    // OBV 데이터 범위
    let obvMin = Infinity, obvMax = -Infinity;
    this.data.forEach(d => {
      if (d.obv !== undefined) {
        obvMin = Math.min(obvMin, d.obv);
        obvMax = Math.max(obvMax, d.obv);
      }
    });
    if (!isFinite(obvMin) || !isFinite(obvMax)) { obvMin = 0; obvMax = 1; }
    if (obvMax === obvMin) { obvMin -= 1; obvMax += 1; }
    const obvRange = obvMax - obvMin;
    obvMin -= obvRange * 0.1;
    obvMax += obvRange * 0.1;

    // 좌표 변환
    const candleWidth = Math.max(1, (chartWidth / this.data.length) * 0.7);
    const xScale = (i: number) => padding.left + ((i + 0.5) / this.data.length) * chartWidth;
    const priceYScale = (v: number) => priceChartTop + priceChartHeight - ((v - priceMin) / (priceMax - priceMin)) * priceChartHeight;

    // 가격 차트 그리드
    this.drawGrid(priceMin, priceMax, priceYScale, priceChartTop, priceChartHeight, '%', true);

    // 0% 기준선 (가격)
    if (priceMin < 0 && priceMax > 0) {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(padding.left, priceYScale(0));
      ctx.lineTo(width - padding.right, priceYScale(0));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 캔들 차트 그리기
    this.data.forEach((d, i) => {
      const x = xScale(i);
      const isUp = d.close >= d.open;
      const color = isUp ? '#D32F2F' : '#1976D2';
      
      // 꼬리
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, priceYScale(d.high));
      ctx.lineTo(x, priceYScale(d.low));
      ctx.stroke();
      
      // 몸통
      const bodyTop = priceYScale(Math.max(d.open, d.close));
      const bodyBottom = priceYScale(Math.min(d.open, d.close));
      ctx.fillStyle = color;
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, Math.max(1, bodyBottom - bodyTop));
    });

    // MA 라인
    this.maPeriods.forEach(period => {
      ctx.strokeStyle = MA_COLORS[period] || '#888888';
      ctx.lineWidth = 1;
      ctx.beginPath();
      let started = false;
      this.data.forEach((d, i) => {
        const v = d.ma.get(period);
        if (v !== undefined) {
          const x = xScale(i);
          const y = priceYScale(v);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    });

    // 서브 차트 그리기
    chartPositions.forEach(({ type, top, height: chartHeight }) => {
      if (type === 'VOLUME') {
        const actualVolYScale = (percent: number) => top + chartHeight - (percent / 100) * chartHeight;
        this.drawActualVolumeGrid(actualVolMax, actualVolYScale, top, chartHeight);
        
        // 거래량 막대
        this.data.forEach((d, i) => {
          if (d.actualVolume === undefined) return;
          const x = xScale(i);
          const percent = (d.actualVolume / actualVolMax) * 100;
          const y = actualVolYScale(percent);
          const y0 = actualVolYScale(0);
          const barHeight = y0 - y;
          
          const isUp = d.close >= d.open;
          ctx.fillStyle = isUp ? 'rgba(211, 47, 47, 0.6)' : 'rgba(25, 118, 210, 0.6)';
          ctx.fillRect(x - candleWidth / 2, y, candleWidth, barHeight);
        });
      } else if (type === 'OBV') {
        const obvYScale = (v: number) => top + chartHeight - ((v - obvMin) / (obvMax - obvMin)) * chartHeight;
        this.drawOBVGrid(obvMin, obvMax, obvYScale, top, chartHeight);
        
        // OBV 라인
        ctx.strokeStyle = '#9C27B0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let obvStarted = false;
        this.data.forEach((d, i) => {
          if (d.obv === undefined) return;
          const x = xScale(i);
          const y = obvYScale(d.obv);
          if (!obvStarted) { ctx.moveTo(x, y); obvStarted = true; }
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    });

    // 제목
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.title, width / 2, 30);

    // 범례
    this.drawLegend();

    // 요약 정보
    this.drawSummary();

    // X축 라벨 및 세로 그리드선
    this.drawXAxisLabelsDynamic(xScale, priceChartTop, priceChartHeight, chartPositions, lastChartBottom);

    // 크로스 마커 그리기
    this.drawCrossMarkersDynamic(xScale, priceChartTop, lastChartBottom);

    // 거래 마커 그리기
    this.drawTradeMarkersDynamic(xScale, priceChartTop, priceChartHeight, lastChartBottom);

    return this;
  }

  private drawGrid(minVal: number, maxVal: number, yScale: (v: number) => number, _chartTop: number, _chartHeight: number, suffix: string, isPrice: boolean = false): void {
    const { ctx, width, padding, data, isGroup } = this;
    const gridCount = 4;
    const step = (maxVal - minVal) / gridCount;
    
    // 실제 가격 표시 여부: 가격 차트이고 그룹이 아니고 actualClose가 있는 경우
    const hasActualPrice = isPrice && !isGroup && data.length > 0 && data[0].actualClose !== undefined;

    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#666666';
    ctx.font = '10px Arial';

    for (let i = 0; i <= gridCount; i++) {
      const value = minVal + step * i;
      const y = yScale(value);
      
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      
      if (hasActualPrice) {
        // 심볼: 왼쪽 Y축 = 실제 가격, 오른쪽 Y축 = 등락률
        const firstData = data[0];
        const basePrice = firstData.actualClose! / (1 + firstData.close / 100);
        const actualPrice = basePrice * (1 + value / 100);
        ctx.textAlign = 'right';
        ctx.fillText(this.formatPrice(actualPrice), padding.left - 5, y + 3);
        ctx.textAlign = 'left';
        ctx.fillText(`${value >= 0 ? '+' : ''}${value.toFixed(1)}${suffix}`, width - padding.right + 5, y + 3);
      } else if (isGroup) {
        // 그룹: 왼쪽 Y축 = 평균 가격 (첫 close 기준), 오른쪽 Y축 = 등락률
        // 그룹은 actualClose가 없으므로 close(등락률)를 기준으로 가상 가격 계산
        const baseGroupPrice = 100; // 기준가 100으로 설정
        const groupPrice = baseGroupPrice * (1 + value / 100);
        ctx.textAlign = 'right';
        ctx.fillText(groupPrice.toFixed(1), padding.left - 5, y + 3);
        ctx.textAlign = 'left';
        ctx.fillText(`${value >= 0 ? '+' : ''}${value.toFixed(1)}${suffix}`, width - padding.right + 5, y + 3);
      } else {
        // 기타: 왼쪽 Y축 = 등락률만
        ctx.textAlign = 'right';
        ctx.fillText(`${value >= 0 ? '+' : ''}${value.toFixed(1)}${suffix}`, padding.left - 5, y + 3);
      }
    }
  }

  private formatPrice(price: number): string {
    if (price >= 1000000) {
      return (price / 1000000).toFixed(2) + 'M';
    } else if (price >= 1000) {
      return Math.round(price).toLocaleString();
    } else {
      return price.toFixed(2);
    }
  }

  private formatVolume(volume: number): string {
    if (volume >= 1000000000) {
      return (volume / 1000000000).toFixed(1) + 'B';
    } else if (volume >= 1000000) {
      return (volume / 1000000).toFixed(1) + 'M';
    } else if (volume >= 1000) {
      return (volume / 1000).toFixed(0) + 'K';
    } else {
      return volume.toFixed(0);
    }
  }

  private drawActualVolumeGrid(maxVolume: number, yScale: (percent: number) => number, chartTop: number, chartHeight: number): void {
    const { ctx, width, padding, data, isGroup } = this;
    const gridCount = 4;
    
    // 첫 번째 거래량 값 (기준값) - 그룹용 변화률 계산
    let baseVolume = 0;
    for (const d of data) {
      if (d.actualVolume !== undefined && d.actualVolume > 0) {
        baseVolume = d.actualVolume;
        break;
      }
    }
    
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#666666';
    ctx.font = '10px Arial';

    for (let i = 0; i <= gridCount; i++) {
      const percent = (i / gridCount) * 100;
      const y = yScale(percent);
      
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      
      // 왼쪽 Y축: 실제 거래량 값 (심볼/그룹 모두)
      const actualVolume = (percent / 100) * maxVolume;
      ctx.textAlign = 'right';
      ctx.fillText(this.formatVolume(actualVolume), padding.left - 5, y + 3);
      
      // 오른쪽 Y축
      ctx.textAlign = 'left';
      if (isGroup && baseVolume > 0) {
        // 그룹: 첫 번째 거래량 대비 변화률
        const changeRate = ((actualVolume - baseVolume) / baseVolume) * 100;
        ctx.fillText(`${changeRate >= 0 ? '+' : ''}${changeRate.toFixed(0)}%`, width - padding.right + 5, y + 3);
      } else {
        // 심볼: 0~100%
        ctx.fillText(`${percent.toFixed(0)}%`, width - padding.right + 5, y + 3);
      }
    }
  }

  private drawOBVGrid(minVal: number, maxVal: number, yScale: (v: number) => number, chartTop: number, chartHeight: number): void {
    const { ctx, width, padding, data } = this;
    const gridCount = 3;
    const step = (maxVal - minVal) / gridCount;
    
    // 첫 번째 OBV 값 (기준값)
    let baseOBV = 0;
    for (const d of data) {
      if (d.obv !== undefined) {
        baseOBV = d.obv;
        break;
      }
    }
    
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#666666';
    ctx.font = '9px Arial';

    for (let i = 0; i <= gridCount; i++) {
      const value = minVal + step * i;
      const y = yScale(value);
      
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      
      // 왼쪽 Y축: OBV 값
      ctx.textAlign = 'right';
      ctx.fillText(this.formatVolume(value), padding.left - 5, y + 3);
      
      // 오른쪽 Y축: OBV 변화률 %
      const changeRate = baseOBV !== 0 ? ((value - baseOBV) / Math.abs(baseOBV)) * 100 : 0;
      ctx.textAlign = 'left';
      ctx.fillText(`${changeRate >= 0 ? '+' : ''}${changeRate.toFixed(0)}%`, width - padding.right + 5, y + 3);
    }
  }

  private drawLegend(): void {
    const { ctx, padding } = this;
    let x = padding.left;
    const y = padding.top - 25;

    ctx.font = '11px Arial';
    ctx.textAlign = 'left';

    this.maPeriods.forEach(period => {
      ctx.strokeStyle = MA_COLORS[period] || '#888888';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x + 20, y - 4);
      ctx.stroke();
      ctx.fillStyle = '#000000';
      ctx.fillText(`MA${period}`, x + 24, y);
      x += 55;
    });
  }

  private drawSummary(): void {
    if (!this.summary) return;
    
    const { ctx, width, padding } = this;
    const { totalHolding, totalProfitRate, totalProfit } = this.summary;
    
    const x = width - padding.right;
    const y = padding.top - 25;
    
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    
    // 총 보유량
    ctx.fillStyle = '#000000';
    ctx.fillText(`보유: ${totalHolding.toLocaleString()}주`, x, y - 12);
    
    // 수익률 (양수=빨강, 음수=파랑)
    ctx.fillStyle = totalProfitRate >= 0 ? '#D32F2F' : '#1976D2';
    ctx.fillText(`수익률: ${totalProfitRate >= 0 ? '+' : ''}${totalProfitRate.toFixed(2)}%`, x, y);
    
    // 수익금
    ctx.fillText(`수익: ${totalProfit >= 0 ? '+' : ''}${totalProfit.toLocaleString()}원`, x, y + 12);
  }

  private drawXAxisLabels(xScale: (i: number) => number, priceChartTop: number, priceChartHeight: number, volumeChartTop: number, volumeChartHeight: number): void {
    const { ctx, height, padding, data } = this;

    // 날짜가 바뀌는 인덱스 찾기
    const dateChangeIndices = new Set<number>();
    let prevDate = '';
    data.forEach((d, i) => {
      const dateStr = `${d.time.getFullYear()}-${d.time.getMonth()}-${d.time.getDate()}`;
      if (dateStr !== prevDate) {
        dateChangeIndices.add(i);
        prevDate = dateStr;
      }
    });

    // 일반 라벨 간격 계산
    const labelCount = Math.min(6, data.length);
    const step = Math.max(1, Math.floor(data.length / labelCount));
    
    // 라벨 표시할 인덱스 (날짜 변경 + 일반 간격)
    const labelIndices = new Set<number>();
    dateChangeIndices.forEach(i => labelIndices.add(i));
    for (let i = 0; i < data.length; i += step) {
      labelIndices.add(i);
    }
    
    labelIndices.forEach(i => {
      const d = data[i];
      const x = xScale(i);
      const isDateChange = dateChangeIndices.has(i);
      
      // 세로 그리드선 (가격 차트 영역)
      ctx.strokeStyle = isDateChange ? '#999999' : '#e0e0e0';
      ctx.lineWidth = isDateChange ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, priceChartTop);
      ctx.lineTo(x, priceChartTop + priceChartHeight);
      ctx.stroke();
      
      // 세로 그리드선 (거래량 차트 영역)
      ctx.beginPath();
      ctx.moveTo(x, volumeChartTop);
      ctx.lineTo(x, volumeChartTop + volumeChartHeight);
      ctx.stroke();
      
      // X축 라벨
      ctx.fillStyle = isDateChange ? '#000000' : '#666666';
      ctx.font = isDateChange ? 'bold 10px Arial' : '10px Arial';
      ctx.textAlign = 'center';
      const timeStr = `${d.time.getMonth() + 1}/${d.time.getDate()} ${d.time.getHours()}:${d.time.getMinutes().toString().padStart(2, '0')}`;
      ctx.fillText(timeStr, x, height - padding.bottom + 15);
    });
  }

  private drawCrossMarkers(xScale: (i: number) => number, priceChartTop: number, priceChartHeight: number, volumeChartTop: number, volumeChartHeight: number): void {
    const { ctx, height, padding, data } = this;
    
    data.forEach((d, i) => {
      // 상태가 바뀌는 시점에만 마커 표시
      const prevStatus = i > 0 ? data[i - 1].crossStatus : undefined;
      if (d.crossStatus === prevStatus) return;
      
      const x = xScale(i);
      let color: string;
      let label: string;
      
      if (d.crossStatus === 'GOLDEN') {
        color = '#FFD700';  // 노랑
        label = 'G';
      } else if (d.crossStatus === 'DEAD') {
        color = '#F44336';  // 빨강
        label = 'D';
      } else {
        color = '#888888';  // 회색 (undefined)
        label = 'N';
      }
      
      // Y축 점선 (가격 차트 + 거래량 차트 전체)
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, priceChartTop);
      ctx.lineTo(x, volumeChartTop + volumeChartHeight);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // 위쪽 화살표 (X축 라벨 아래 여백)
      const arrowY = height - padding.bottom + 35;
      const arrowSize = 12;
      
      // 화살표 배경 (위쪽 방향 삼각형)
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, arrowY - arrowSize);  // 꼭지점 (위)
      ctx.lineTo(x - arrowSize / 2, arrowY);  // 왼쪽 아래
      ctx.lineTo(x + arrowSize / 2, arrowY);  // 오른쪽 아래
      ctx.closePath();
      ctx.fill();
      
      // 화살표 안쪽 글씨
      ctx.fillStyle = d.crossStatus === 'GOLDEN' ? '#000000' : '#FFFFFF';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, arrowY - arrowSize / 3);
      ctx.textBaseline = 'alphabetic';  // 원복
    });
  }

  private drawTradeMarkers(xScale: (i: number) => number, priceChartTop: number, priceChartHeight: number, volumeChartTop: number, volumeChartHeight: number): void {
    const { ctx, data, transactions } = this;
    
    if (transactions.length === 0) return;
    
    // 데이터 시간 -> 인덱스 맵
    const timeToIndex = new Map<number, number>();
    data.forEach((d, i) => {
      timeToIndex.set(d.time.getTime(), i);
    });
    
    transactions.forEach(tx => {
      const txTime = tx.time.getTime();
      const index = timeToIndex.get(txTime);
      if (index === undefined) return;
      
      const x = xScale(index);
      const arrowY = priceChartTop - 5;
      const arrowSize = 14;
      
      let color: string;
      let label: string;
      
      if (tx.type === 'BUY') {
        color = '#1976D2';  // 파랑
        if (tx.isGoldenCrossEntry) {
          label = 'B';  // 골든크로스 진입 매수
        } else {
          label = tx.isPyramiding ? '+' : 'B';
        }
      } else {
        color = '#D32F2F';  // 빨강
        if (tx.reason === 'STOP_LOSS') {
          label = '!';
        } else if (tx.reason?.startsWith('TAKE_PROFIT')) {
          label = '$';  // 익절$';  // 익절
        } else if (tx.reason === 'DEAD_CROSS_MORE') {
          label = '+';
        } else {
          label = 'S';
        }
      }
      
      // Y축 점선 (가격 차트 + 거래량 차트 전체)
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(x, priceChartTop);
      ctx.lineTo(x, volumeChartTop + volumeChartHeight);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // 아래쪽 화살표 (가격 차트 위)
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, arrowY + arrowSize);  // 꼭지점 (아래)
      ctx.lineTo(x - arrowSize / 2, arrowY);  // 왼쪽 위
      ctx.lineTo(x + arrowSize / 2, arrowY);  // 오른쪽 위
      ctx.closePath();
      ctx.fill();
      
      // 삼각형 안에 흰색 글씨
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, arrowY + arrowSize * 0.4);
      ctx.textBaseline = 'alphabetic';
      
      // 화살표 위에 세로 글씨: "전체보유수(매매수)"
      const infoText = `${tx.holdingAfter}(${tx.quantity})`;
      ctx.save();
      ctx.translate(x, arrowY - 2);
      ctx.rotate(-Math.PI / 2);  // 90도 회전
      ctx.fillStyle = color;
      ctx.font = '6px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(infoText, 0, 0);
      ctx.restore();
      
      // label이 있으면 점선 옆에 세로로 표시
      if (tx.label) {
        ctx.save();
        ctx.translate(x + 4, priceChartTop + 20);
        ctx.rotate(-Math.PI / 2);  // 90도 회전 (세로)
        ctx.fillStyle = color;
        ctx.font = '6px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(tx.label, 0, 0);
        ctx.restore();
      }
    });
  }

  // 3단 차트용 X축 라벨
  private drawXAxisLabels3(xScale: (i: number) => number, priceChartTop: number, priceChartHeight: number, actualVolumeChartTop: number, actualVolumeChartHeight: number, volumeRateChartTop: number, volumeRateChartHeight: number): void {
    const { ctx, height, padding, data } = this;

    // 날짜가 바뀌는 인덱스 찾기
    const dateChangeIndices = new Set<number>();
    let prevDate = '';
    data.forEach((d, i) => {
      const dateStr = `${d.time.getFullYear()}-${d.time.getMonth()}-${d.time.getDate()}`;
      if (dateStr !== prevDate) {
        dateChangeIndices.add(i);
        prevDate = dateStr;
      }
    });

    // 일반 라벨 간격 계산
    const labelCount = Math.min(6, data.length);
    const step = Math.max(1, Math.floor(data.length / labelCount));
    
    // 라벨 표시할 인덱스 (날짜 변경 + 일반 간격)
    const labelIndices = new Set<number>();
    dateChangeIndices.forEach(i => labelIndices.add(i));
    for (let i = 0; i < data.length; i += step) {
      labelIndices.add(i);
    }
    
    labelIndices.forEach(i => {
      const d = data[i];
      const x = xScale(i);
      const isDateChange = dateChangeIndices.has(i);
      
      // 세로 그리드선 (가격 차트 영역)
      ctx.strokeStyle = isDateChange ? '#999999' : '#e0e0e0';
      ctx.lineWidth = isDateChange ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, priceChartTop);
      ctx.lineTo(x, priceChartTop + priceChartHeight);
      ctx.stroke();
      
      // 세로 그리드선 (실제 거래량 차트 영역)
      ctx.beginPath();
      ctx.moveTo(x, actualVolumeChartTop);
      ctx.lineTo(x, actualVolumeChartTop + actualVolumeChartHeight);
      ctx.stroke();
      
      // 세로 그리드선 (거래량 등락률 차트 영역)
      ctx.beginPath();
      ctx.moveTo(x, volumeRateChartTop);
      ctx.lineTo(x, volumeRateChartTop + volumeRateChartHeight);
      ctx.stroke();
      
      // X축 라벨
      ctx.fillStyle = isDateChange ? '#000000' : '#666666';
      ctx.font = isDateChange ? 'bold 10px Arial' : '10px Arial';
      ctx.textAlign = 'center';
      const timeStr = `${d.time.getMonth() + 1}/${d.time.getDate()} ${d.time.getHours()}:${d.time.getMinutes().toString().padStart(2, '0')}`;
      ctx.fillText(timeStr, x, height - padding.bottom + 15);
    });
  }

  // 3단 차트용 크로스 마커
  private drawCrossMarkers3(xScale: (i: number) => number, priceChartTop: number, priceChartHeight: number, volumeRateChartTop: number, volumeRateChartHeight: number): void {
    const { ctx, height, padding, data } = this;
    
    data.forEach((d, i) => {
      // 상태가 바뀌는 시점에만 마커 표시
      const prevStatus = i > 0 ? data[i - 1].crossStatus : undefined;
      if (d.crossStatus === prevStatus) return;
      
      const x = xScale(i);
      let color: string;
      let label: string;
      
      if (d.crossStatus === 'GOLDEN') {
        color = '#FFD700';  // 노랑
        label = 'G';
      } else if (d.crossStatus === 'DEAD') {
        color = '#F44336';  // 빨강
        label = 'D';
      } else {
        color = '#888888';  // 회색 (undefined)
        label = 'N';
      }
      
      // Y축 점선 (3개 차트 전체)
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, priceChartTop);
      ctx.lineTo(x, volumeRateChartTop + volumeRateChartHeight);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // 위쪽 화살표 (X축 라벨 아래 여백)
      const arrowY = height - padding.bottom + 35;
      const arrowSize = 12;
      
      // 화살표 배경 (위쪽 방향 삼각형)
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, arrowY - arrowSize);  // 꼭지점 (위)
      ctx.lineTo(x - arrowSize / 2, arrowY);  // 왼쪽 아래
      ctx.lineTo(x + arrowSize / 2, arrowY);  // 오른쪽 아래
      ctx.closePath();
      ctx.fill();
      
      // 화살표 안쪽 글씨
      ctx.fillStyle = d.crossStatus === 'GOLDEN' ? '#000000' : '#FFFFFF';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, arrowY - arrowSize / 3);
      ctx.textBaseline = 'alphabetic';  // 원복
    });
  }

  // 3단 차트용 거래 마커
  private drawTradeMarkers3(xScale: (i: number) => number, priceChartTop: number, priceChartHeight: number, volumeRateChartTop: number, volumeRateChartHeight: number): void {
    const { ctx, data, transactions } = this;
    
    if (transactions.length === 0) return;
    
    // 데이터 시간 -> 인덱스 맵
    const timeToIndex = new Map<number, number>();
    data.forEach((d, i) => {
      timeToIndex.set(d.time.getTime(), i);
    });
    
    transactions.forEach(tx => {
      const txTime = tx.time.getTime();
      const index = timeToIndex.get(txTime);
      if (index === undefined) return;
      
      const x = xScale(index);
      const arrowY = priceChartTop - 5;
      const arrowSize = 14;
      
      let color: string;
      let label: string;
      
      if (tx.type === 'BUY') {
        color = '#1976D2';  // 파랑
        if (tx.isGoldenCrossEntry) {
          label = 'B';  // 골든크로스 진입 매수
        } else {
          label = tx.isPyramiding ? '+' : 'B';
        }
      } else {
        color = '#D32F2F';  // 빨강
        if (tx.reason === 'STOP_LOSS') {
          label = '!';
        } else if (tx.reason?.startsWith('TAKE_PROFIT')) {
          label = '$';  // 익절
        } else if (tx.reason === 'DEAD_CROSS_MORE') {
          label = '+';
        } else {
          label = 'S';
        }
      }
      
      // Y축 점선 (3개 차트 전체)
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(x, priceChartTop);
      ctx.lineTo(x, volumeRateChartTop + volumeRateChartHeight);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // 아래쪽 화살표 (가격 차트 위)
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, arrowY + arrowSize);  // 꼭지점 (아래)
      ctx.lineTo(x - arrowSize / 2, arrowY);  // 왼쪽 위
      ctx.lineTo(x + arrowSize / 2, arrowY);  // 오른쪽 위
      ctx.closePath();
      ctx.fill();
      
      // 삼각형 안에 흰색 글씨
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, arrowY + arrowSize * 0.4);
      ctx.textBaseline = 'alphabetic';
      
      // 화살표 위에 세로 글씨: "전체보유수(매매수)"
      const infoText = `${tx.holdingAfter}(${tx.quantity})`;
      ctx.save();
      ctx.translate(x, arrowY - 2);
      ctx.rotate(-Math.PI / 2);  // 90도 회전
      ctx.fillStyle = color;
      ctx.font = '6px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(infoText, 0, 0);
      ctx.restore();
      
      // label이 있으면 점선 옆에 세로로 표시
      if (tx.label) {
        ctx.save();
        ctx.translate(x + 4, priceChartTop + 20);
        ctx.rotate(-Math.PI / 2);  // 90도 회전 (세로)
        ctx.fillStyle = color;
        ctx.font = '6px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(tx.label, 0, 0);
        ctx.restore();
      }
    });
  }

  // 동적 X축 라벨 (config.shows 기반)
  private drawXAxisLabelsDynamic(xScale: (i: number) => number, priceChartTop: number, priceChartHeight: number, chartPositions: { type: ChartShowType; top: number; height: number }[], lastChartBottom: number): void {
    const { ctx, height, padding, data } = this;

    // 날짜가 바뀌는 인덱스 찾기
    const dateChangeIndices = new Set<number>();
    let prevDate = '';
    data.forEach((d, i) => {
      const dateStr = `${d.time.getFullYear()}-${d.time.getMonth()}-${d.time.getDate()}`;
      if (dateStr !== prevDate) {
        dateChangeIndices.add(i);
        prevDate = dateStr;
      }
    });

    // 일반 라벨 간격 계산
    const labelCount = Math.min(6, data.length);
    const step = Math.max(1, Math.floor(data.length / labelCount));
    
    // 라벨 표시할 인덱스 (날짜 변경 + 일반 간격)
    const labelIndices = new Set<number>();
    dateChangeIndices.forEach(i => labelIndices.add(i));
    for (let i = 0; i < data.length; i += step) {
      labelIndices.add(i);
    }
    
    labelIndices.forEach(i => {
      const d = data[i];
      const x = xScale(i);
      const isDateChange = dateChangeIndices.has(i);
      
      ctx.strokeStyle = isDateChange ? '#999999' : '#e0e0e0';
      ctx.lineWidth = isDateChange ? 1.5 : 1;
      
      // 가격 차트 세로 그리드선
      ctx.beginPath();
      ctx.moveTo(x, priceChartTop);
      ctx.lineTo(x, priceChartTop + priceChartHeight);
      ctx.stroke();
      
      // 서브 차트들 세로 그리드선
      chartPositions.forEach(({ top, height: chartHeight }) => {
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + chartHeight);
        ctx.stroke();
      });
      
      // X축 라벨
      ctx.fillStyle = isDateChange ? '#000000' : '#666666';
      ctx.font = isDateChange ? 'bold 10px Arial' : '10px Arial';
      ctx.textAlign = 'center';
      const timeStr = `${d.time.getMonth() + 1}/${d.time.getDate()} ${d.time.getHours()}:${d.time.getMinutes().toString().padStart(2, '0')}`;
      ctx.fillText(timeStr, x, height - padding.bottom + 15);
    });
  }

  // 동적 크로스 마커 (config.shows 기반)
  private drawCrossMarkersDynamic(xScale: (i: number) => number, priceChartTop: number, lastChartBottom: number): void {
    const { ctx, height, padding, data } = this;
    
    data.forEach((d, i) => {
      // 상태가 바뀌는 시점에만 마커 표시
      const prevStatus = i > 0 ? data[i - 1].crossStatus : undefined;
      if (d.crossStatus === prevStatus) return;
      
      const x = xScale(i);
      let color: string;
      let label: string;
      
      if (d.crossStatus === 'GOLDEN') {
        color = '#FFD700';
        label = 'G';
      } else if (d.crossStatus === 'DEAD') {
        color = '#F44336';
        label = 'D';
      } else {
        color = '#888888';
        label = 'N';
      }
      
      // Y축 점선 (전체 차트)
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, priceChartTop);
      ctx.lineTo(x, lastChartBottom);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // 위쪽 화살표
      const arrowY = height - padding.bottom + 35;
      const arrowSize = 12;
      
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, arrowY - arrowSize);
      ctx.lineTo(x - arrowSize / 2, arrowY);
      ctx.lineTo(x + arrowSize / 2, arrowY);
      ctx.closePath();
      ctx.fill();
      
      ctx.fillStyle = d.crossStatus === 'GOLDEN' ? '#000000' : '#FFFFFF';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, arrowY - arrowSize / 3);
      ctx.textBaseline = 'alphabetic';
    });
  }

  // 동적 거래 마커 (config.shows 기반)
  private drawTradeMarkersDynamic(xScale: (i: number) => number, priceChartTop: number, priceChartHeight: number, lastChartBottom: number): void {
    const { ctx, data, transactions } = this;
    
    if (transactions.length === 0) return;
    
    const timeToIndex = new Map<number, number>();
    data.forEach((d, i) => {
      timeToIndex.set(d.time.getTime(), i);
    });
    
    transactions.forEach(tx => {
      const txTime = tx.time.getTime();
      const index = timeToIndex.get(txTime);
      if (index === undefined) return;
      
      const x = xScale(index);
      const arrowY = priceChartTop - 5;
      const arrowSize = 14;
      
      let color: string;
      let label: string;
      
      if (tx.type === 'BUY') {
        color = '#1976D2';
        if (tx.isGoldenCrossEntry) {
          label = 'B';
        } else {
          label = tx.isPyramiding ? '+' : 'B';
        }
      } else {
        color = '#D32F2F';
        if (tx.reason === 'STOP_LOSS') {
          label = '!';
        } else if (tx.reason?.startsWith('TAKE_PROFIT')) {
          label = '$';
        } else if (tx.reason === 'DEAD_CROSS_MORE') {
          label = '+';
        } else {
          label = 'S';
        }
      }
      
      // Y축 점선 (전체 차트)
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(x, priceChartTop);
      ctx.lineTo(x, lastChartBottom);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // 아래쪽 화살표
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, arrowY + arrowSize);
      ctx.lineTo(x - arrowSize / 2, arrowY);
      ctx.lineTo(x + arrowSize / 2, arrowY);
      ctx.closePath();
      ctx.fill();
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, arrowY + arrowSize * 0.4);
      ctx.textBaseline = 'alphabetic';
      
      // 화살표 위에 세로 글씨
      const infoText = `${tx.holdingAfter}(${tx.quantity})`;
      ctx.save();
      ctx.translate(x, arrowY - 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = color;
      ctx.font = '6px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(infoText, 0, 0);
      ctx.restore();
      
      // label이 있으면 점선 옆에 세로로 표시
      if (tx.label) {
        ctx.save();
        ctx.translate(x + 4, priceChartTop + 20);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = color;
        ctx.font = '6px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(tx.label, 0, 0);
        ctx.restore();
      }
    });
  }

  // 4단 차트용 X축 라벨
  private drawXAxisLabels4(xScale: (i: number) => number, priceChartTop: number, priceChartHeight: number, actualVolumeChartTop: number, actualVolumeChartHeight: number, obvChartTop: number, obvChartHeight: number, volumeRateChartTop: number, volumeRateChartHeight: number): void {
    const { ctx, height, padding, data } = this;

    // 날짜가 바뀌는 인덱스 찾기
    const dateChangeIndices = new Set<number>();
    let prevDate = '';
    data.forEach((d, i) => {
      const dateStr = `${d.time.getFullYear()}-${d.time.getMonth()}-${d.time.getDate()}`;
      if (dateStr !== prevDate) {
        dateChangeIndices.add(i);
        prevDate = dateStr;
      }
    });

    // 일반 라벨 간격 계산
    const labelCount = Math.min(6, data.length);
    const step = Math.max(1, Math.floor(data.length / labelCount));
    
    // 라벨 표시할 인덱스 (날짜 변경 + 일반 간격)
    const labelIndices = new Set<number>();
    dateChangeIndices.forEach(i => labelIndices.add(i));
    for (let i = 0; i < data.length; i += step) {
      labelIndices.add(i);
    }
    
    labelIndices.forEach(i => {
      const d = data[i];
      const x = xScale(i);
      const isDateChange = dateChangeIndices.has(i);
      
      // 세로 그리드선 (4개 차트 영역)
      ctx.strokeStyle = isDateChange ? '#999999' : '#e0e0e0';
      ctx.lineWidth = isDateChange ? 1.5 : 1;
      
      ctx.beginPath();
      ctx.moveTo(x, priceChartTop);
      ctx.lineTo(x, priceChartTop + priceChartHeight);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(x, actualVolumeChartTop);
      ctx.lineTo(x, actualVolumeChartTop + actualVolumeChartHeight);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(x, obvChartTop);
      ctx.lineTo(x, obvChartTop + obvChartHeight);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(x, volumeRateChartTop);
      ctx.lineTo(x, volumeRateChartTop + volumeRateChartHeight);
      ctx.stroke();
      
      // X축 라벨
      ctx.fillStyle = isDateChange ? '#000000' : '#666666';
      ctx.font = isDateChange ? 'bold 10px Arial' : '10px Arial';
      ctx.textAlign = 'center';
      const timeStr = `${d.time.getMonth() + 1}/${d.time.getDate()} ${d.time.getHours()}:${d.time.getMinutes().toString().padStart(2, '0')}`;
      ctx.fillText(timeStr, x, height - padding.bottom + 15);
    });
  }

  // 4단 차트용 크로스 마커
  private drawCrossMarkers4(xScale: (i: number) => number, priceChartTop: number, volumeRateChartTop: number, volumeRateChartHeight: number): void {
    const { ctx, height, padding, data } = this;
    
    data.forEach((d, i) => {
      // 상태가 바뀌는 시점에만 마커 표시
      const prevStatus = i > 0 ? data[i - 1].crossStatus : undefined;
      if (d.crossStatus === prevStatus) return;
      
      const x = xScale(i);
      let color: string;
      let label: string;
      
      if (d.crossStatus === 'GOLDEN') {
        color = '#FFD700';  // 노랑
        label = 'G';
      } else if (d.crossStatus === 'DEAD') {
        color = '#F44336';  // 빨강
        label = 'D';
      } else {
        color = '#888888';  // 회색 (undefined)
        label = 'N';
      }
      
      // Y축 점선 (4개 차트 전체)
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, priceChartTop);
      ctx.lineTo(x, volumeRateChartTop + volumeRateChartHeight);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // 위쪽 화살표 (X축 라벨 아래 여백)
      const arrowY = height - padding.bottom + 35;
      const arrowSize = 12;
      
      // 화살표 배경 (위쪽 방향 삼각형)
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, arrowY - arrowSize);  // 꼭지점 (위)
      ctx.lineTo(x - arrowSize / 2, arrowY);  // 왼쪽 아래
      ctx.lineTo(x + arrowSize / 2, arrowY);  // 오른쪽 아래
      ctx.closePath();
      ctx.fill();
      
      // 화살표 안쪽 글씨
      ctx.fillStyle = d.crossStatus === 'GOLDEN' ? '#000000' : '#FFFFFF';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, arrowY - arrowSize / 3);
      ctx.textBaseline = 'alphabetic';  // 원복
    });
  }

  // 4단 차트용 거래 마커
  private drawTradeMarkers4(xScale: (i: number) => number, priceChartTop: number, priceChartHeight: number, volumeRateChartTop: number, volumeRateChartHeight: number): void {
    const { ctx, data, transactions } = this;
    
    if (transactions.length === 0) return;
    
    // 데이터 시간 -> 인덱스 맵
    const timeToIndex = new Map<number, number>();
    data.forEach((d, i) => {
      timeToIndex.set(d.time.getTime(), i);
    });
    
    transactions.forEach(tx => {
      const txTime = tx.time.getTime();
      const index = timeToIndex.get(txTime);
      if (index === undefined) return;
      
      const x = xScale(index);
      const arrowY = priceChartTop - 5;
      const arrowSize = 14;
      
      let color: string;
      let label: string;
      
      if (tx.type === 'BUY') {
        color = '#1976D2';  // 파랑
        if (tx.isGoldenCrossEntry) {
          label = 'B';  // 골든크로스 진입 매수
        } else {
          label = tx.isPyramiding ? '+' : 'B';
        }
      } else {
        color = '#D32F2F';  // 빨강
        if (tx.reason === 'STOP_LOSS') {
          label = '!';
        } else if (tx.reason?.startsWith('TAKE_PROFIT')) {
          label = '$';  // 익절
        } else if (tx.reason === 'DEAD_CROSS_MORE') {
          label = '+';
        } else {
          label = 'S';
        }
      }
      
      // Y축 점선 (4개 차트 전체)
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(x, priceChartTop);
      ctx.lineTo(x, volumeRateChartTop + volumeRateChartHeight);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // 아래쪽 화살표 (가격 차트 위)
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, arrowY + arrowSize);  // 꼭지점 (아래)
      ctx.lineTo(x - arrowSize / 2, arrowY);  // 왼쪽 위
      ctx.lineTo(x + arrowSize / 2, arrowY);  // 오른쪽 위
      ctx.closePath();
      ctx.fill();
      
      // 삼각형 안에 흰색 글씨
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, arrowY + arrowSize * 0.4);
      ctx.textBaseline = 'alphabetic';
      
      // 화살표 위에 세로 글씨: "전체보유수(매매수)"
      const infoText = `${tx.holdingAfter}(${tx.quantity})`;
      ctx.save();
      ctx.translate(x, arrowY - 2);
      ctx.rotate(-Math.PI / 2);  // 90도 회전
      ctx.fillStyle = color;
      ctx.font = '6px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(infoText, 0, 0);
      ctx.restore();
      
      // label이 있으면 점선 옆에 세로로 표시
      if (tx.label) {
        ctx.save();
        ctx.translate(x + 4, priceChartTop + 20);
        ctx.rotate(-Math.PI / 2);  // 90도 회전 (세로)
        ctx.fillStyle = color;
        ctx.font = '6px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(tx.label, 0, 0);
        ctx.restore();
      }
    });
  }

  toBuffer(): Buffer {
    return this.canvas.toBuffer('image/png');
  }
}
