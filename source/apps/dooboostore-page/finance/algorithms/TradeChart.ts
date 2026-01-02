import { createCanvas, Canvas, CanvasRenderingContext2D } from 'canvas';

// 데이터 포인트 타입 (캔들용 OHLC + 거래량)
export type ChartDataPoint = {
  time: Date;
  open: number;   // 시가 등락률
  high: number;   // 고가 등락률
  low: number;    // 저가 등락률
  close: number;  // 종가 등락률
  volume: number; // 거래량 등락률
  ma: Map<number, number>;  // 이평선 (기간 -> 값)
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
  private height = 700;  // 높이 증가
  private padding = { top: 60, right: 60, bottom: 60, left: 80 };
  private gap = 20;  // 상단/하단 차트 간격
  
  private title: string = '';
  private data: ChartDataPoint[] = [];
  private maPeriods: number[] = [];

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

  draw(): this {
    if (this.data.length === 0 || this.data.length === 1) return this;

    const { ctx, width, height, padding, gap } = this;
    const chartWidth = width - padding.left - padding.right;
    
    // 상단 70%, 하단 30%
    const priceChartHeight = (height - padding.top - padding.bottom - gap) * 0.7;
    const volumeChartHeight = (height - padding.top - padding.bottom - gap) * 0.3;
    
    const priceChartTop = padding.top;
    const volumeChartTop = padding.top + priceChartHeight + gap;

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

    // 거래량 데이터 범위
    let volMin = 0, volMax = -Infinity;
    this.data.forEach(d => {
      volMin = Math.min(volMin, d.volume);
      volMax = Math.max(volMax, d.volume);
    });
    if (volMax === volMin) { volMax += 100; }
    const volRange = volMax - volMin;
    volMax += volRange * 0.1;
    volMin -= volRange * 0.1;

    // 좌표 변환
    const candleWidth = Math.max(1, (chartWidth / this.data.length) * 0.7);
    const xScale = (i: number) => padding.left + ((i + 0.5) / this.data.length) * chartWidth;
    const priceYScale = (v: number) => priceChartTop + priceChartHeight - ((v - priceMin) / (priceMax - priceMin)) * priceChartHeight;
    const volYScale = (v: number) => volumeChartTop + volumeChartHeight - ((v - volMin) / (volMax - volMin)) * volumeChartHeight;

    // 가격 차트 그리드
    this.drawGrid(priceMin, priceMax, priceYScale, priceChartTop, priceChartHeight, '%');
    
    // 거래량 차트 그리드
    this.drawGrid(volMin, volMax, volYScale, volumeChartTop, volumeChartHeight, '%');

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

    // 0% 기준선 (거래량)
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padding.left, volYScale(0));
    ctx.lineTo(width - padding.right, volYScale(0));
    ctx.stroke();
    ctx.setLineDash([]);

    // 캔들 그리기
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

    // MA 라인 (1px)
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

    // 거래량 막대 그리기
    this.data.forEach((d, i) => {
      const x = xScale(i);
      const y0 = volYScale(0);
      const y = volYScale(d.volume);
      const barHeight = y0 - y;
      
      // 양수=초록, 음수=빨강
      ctx.fillStyle = d.volume >= 0 ? '#4CAF50' : '#F44336';
      
      if (barHeight >= 0) {
        ctx.fillRect(x - candleWidth / 2, y, candleWidth, barHeight);
      } else {
        ctx.fillRect(x - candleWidth / 2, y0, candleWidth, -barHeight);
      }
    });

    // 제목
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.title, width / 2, 30);

    // 범례
    this.drawLegend();

    // X축 라벨 및 세로 그리드선
    this.drawXAxisLabels(xScale, priceChartTop, priceChartHeight, volumeChartTop, volumeChartHeight);

    return this;
  }

  private drawGrid(minVal: number, maxVal: number, yScale: (v: number) => number, _chartTop: number, _chartHeight: number, suffix: string): void {
    const { ctx, width, padding } = this;
    const gridCount = 4;
    const step = (maxVal - minVal) / gridCount;

    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#666666';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';

    for (let i = 0; i <= gridCount; i++) {
      const value = minVal + step * i;
      const y = yScale(value);
      
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      
      ctx.fillText(`${value.toFixed(1)}${suffix}`, padding.left - 5, y + 3);
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

  private drawXAxisLabels(xScale: (i: number) => number, priceChartTop: number, priceChartHeight: number, volumeChartTop: number, volumeChartHeight: number): void {
    const { ctx, height, padding, data, gap } = this;

    const labelCount = Math.min(6, data.length);
    const step = Math.max(1, Math.floor(data.length / labelCount));
    
    for (let i = 0; i < data.length; i += step) {
      const d = data[i];
      const x = xScale(i);
      
      // 세로 그리드선 (가격 차트 영역)
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
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
      ctx.fillStyle = '#666666';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      const timeStr = `${d.time.getMonth() + 1}/${d.time.getDate()} ${d.time.getHours()}:${d.time.getMinutes().toString().padStart(2, '0')}`;
      ctx.fillText(timeStr, x, height - padding.bottom + 15);
    }
  }

  toBuffer(): Buffer {
    return this.canvas.toBuffer('image/png');
  }
}
