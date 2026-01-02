/**
 * 차트 생성 로직
 */

import { createCanvas } from 'canvas';
import { join } from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import type { TimeSeries, Transaction, DataPlan } from './types';
import type { ChartQuote } from '../service/YahooFinanceBrowserService';

const OUTPUT_DIR = join(__dirname, '../../../../datas/finance/output');

// MA 색상 매핑
const MA_COLORS: Record<number, string> = {
  5: '#9C27B0',
  10: '#FF9800',
  20: '#4CAF50',
  50: '#F44336'
};

export type ChartContext = {
  maPeriods: number[];
  dataPlan: DataPlan;
  symbols: Map<string, { open: number; quotes: ChartQuote[] }>;
};

/**
 * 차트 생성
 */
export const createChart = (
  ctx: ChartContext,
  title: string,
  timeSeries: TimeSeries[],
  filename: string,
  symbolTransactions?: Transaction[]
): void => {
  if (!timeSeries || timeSeries.length === 0) return;

  const { maPeriods, dataPlan, symbols } = ctx;

  // 출력 디렉토리 생성
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 고해상도를 위해 2배 크기로 생성
  const scale = 2;
  const width = 1200 * scale;
  const height = 800 * scale;
  const canvas = createCanvas(width, height);
  const ctxCanvas = canvas.getContext('2d');

  // 스케일 적용
  ctxCanvas.scale(scale, scale);

  const displayWidth = 1200;
  const displayHeight = 800;

  ctxCanvas.fillStyle = '#ffffff';
  ctxCanvas.fillRect(0, 0, displayWidth, displayHeight);

  const padding = { top: 60, right: 60, bottom: 60, left: 80 };
  const gap = 40;
  const chartWidth = displayWidth - padding.left - padding.right;
  const chartHeight = (displayHeight - padding.top - padding.bottom - gap) / 2;

  const topChartY = padding.top;
  const bottomChartY = padding.top + chartHeight + gap;

  const changeRates = timeSeries.map(d => d.avgChangeRate);
  const volumeStrengths = timeSeries.map(d => d.avgVolumeStrength);

  // 이동평균선 데이터 추출
  const changeRateMAData = new Map<number, (number | null)[]>();
  maPeriods.forEach(period => {
    changeRateMAData.set(period, timeSeries.map(t => {
      const ma = t.ma.get(period);
      return ma ? ma.value : null;
    }));
  });

  // 거래량 강도용 이동평균선 계산
  const volumeMAData = new Map<number, (number | null)[]>();
  maPeriods.forEach(period => {
    const maValues: (number | null)[] = [];
    for (let i = 0; i < volumeStrengths.length; i++) {
      if (i < period - 1) {
        maValues.push(null);
      } else {
        const sum = volumeStrengths.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        maValues.push(sum / period);
      }
    }
    volumeMAData.set(period, maValues);
  });

  const minChangeRate = Math.min(...changeRates);
  const maxChangeRate = Math.max(...changeRates);
  const rangeChangeRate = maxChangeRate - minChangeRate;

  const minVolume = Math.min(...volumeStrengths);
  const maxVolume = Math.max(...volumeStrengths);
  const rangeVolume = maxVolume - minVolume;

  // 제목
  ctxCanvas.fillStyle = '#000000';
  ctxCanvas.font = 'bold 24px Arial';
  ctxCanvas.textAlign = 'center';
  ctxCanvas.fillText(title, displayWidth / 2, 35);

  // 보유 수량 및 수익률 표시
  if (symbolTransactions && symbolTransactions.length > 0) {
    let holdingQuantity = 0;
    let totalCost = 0;
    let totalQuantity = 0;
    let totalProfit = 0;
    let totalInvested = 0;

    symbolTransactions.forEach(tx => {
      if (tx.type === 'BUY') {
        holdingQuantity += tx.quantity;
        totalCost += tx.price * tx.quantity;
        totalQuantity += tx.quantity;
        totalInvested += tx.total;
      } else {
        holdingQuantity -= tx.quantity;
        if (tx.profit !== undefined) {
          totalProfit += tx.profit;
        }
        if (holdingQuantity > 0) {
          const avgPrice = totalCost / totalQuantity;
          totalCost = avgPrice * holdingQuantity;
          totalQuantity = holdingQuantity;
        } else {
          totalCost = 0;
          totalQuantity = 0;
        }
      }
    });

    if (holdingQuantity > 0 && totalQuantity > 0) {
      const avgPrice = totalCost / totalQuantity;
      const lastPrice = timeSeries[timeSeries.length - 1]?.avgChangeRate || 0;
      const symbolData = symbols.get(symbolTransactions[0].symbol);
      
      if (symbolData) {
        const startPrice = symbolData.open;
        const currentPrice = startPrice * (1 + lastPrice / 100);
        const profitRate = ((currentPrice - avgPrice) / avgPrice) * 100;

        ctxCanvas.font = '12px Arial';
        ctxCanvas.textAlign = 'left';
        ctxCanvas.fillStyle = '#000000';
        const profitSign = profitRate >= 0 ? '+' : '';
        const realizedProfitSign = totalProfit >= 0 ? '+' : '';
        ctxCanvas.fillText(`보유: ${holdingQuantity}주 | 수익률: ${profitSign}${profitRate.toFixed(2)}% | 실현손익: ${realizedProfitSign}${totalProfit.toLocaleString()}원`, 10, 15);
      }
    } else if (totalProfit !== 0 && totalInvested > 0) {
      const totalProfitRate = (totalProfit / totalInvested) * 100;
      ctxCanvas.font = '12px Arial';
      ctxCanvas.textAlign = 'left';
      ctxCanvas.fillStyle = '#000000';
      const profitSign = totalProfit >= 0 ? '+' : '';
      const rateSign = totalProfitRate >= 0 ? '+' : '';
      ctxCanvas.fillText(`보유: 0주 | 수익률: ${rateSign}${totalProfitRate.toFixed(2)}% | 실현손익: ${profitSign}${totalProfit.toLocaleString()}원`, 10, 15);
    }
  }

  // 범례 (상단 차트)
  ctxCanvas.font = '12px Arial';
  let legendX = displayWidth - 350;
  const legendY = topChartY + 10;

  ctxCanvas.fillStyle = '#2196F3';
  ctxCanvas.fillRect(legendX, legendY, 20, 2);
  ctxCanvas.fillStyle = '#000000';
  ctxCanvas.textAlign = 'left';
  ctxCanvas.fillText('등락률', legendX + 25, legendY + 4);
  legendX += 70;

  maPeriods.forEach(period => {
    ctxCanvas.fillStyle = MA_COLORS[period] || '#999999';
    ctxCanvas.fillRect(legendX, legendY, 15, 2);
    ctxCanvas.fillStyle = '#000000';
    ctxCanvas.fillText(`MA${period}`, legendX + 20, legendY + 4);
    legendX += 55;
  });

  // 범례 (하단 차트)
  legendX = displayWidth - 350;
  const legendY3 = bottomChartY + 10;

  ctxCanvas.fillStyle = '#FF5722';
  ctxCanvas.fillRect(legendX, legendY3, 20, 2);
  ctxCanvas.fillStyle = '#000000';
  ctxCanvas.fillText('거래량 강도', legendX + 25, legendY3 + 4);
  legendX += 90;

  maPeriods.forEach(period => {
    ctxCanvas.fillStyle = MA_COLORS[period] || '#999999';
    ctxCanvas.fillRect(legendX, legendY3, 15, 2);
    ctxCanvas.fillStyle = '#000000';
    ctxCanvas.fillText(`MA${period}`, legendX + 20, legendY3 + 4);
    legendX += 55;
  });

  // 라인 그리기 헬퍼 함수
  const drawLine = (
    data: (number | null)[],
    minVal: number,
    range: number,
    color: string,
    lineWidth: number,
    baseY: number,
    drawDots: boolean = false
  ) => {
    ctxCanvas.strokeStyle = color;
    ctxCanvas.lineWidth = lineWidth;
    ctxCanvas.beginPath();

    let started = false;
    data.forEach((value, index) => {
      if (value === null) return;

      const x = padding.left + (chartWidth * index / (data.length - 1));
      const y = baseY + chartHeight - ((value - minVal) / range * chartHeight);

      if (!started) {
        ctxCanvas.moveTo(x, y);
        started = true;
      } else {
        ctxCanvas.lineTo(x, y);
      }
    });

    ctxCanvas.stroke();

    if (drawDots) {
      ctxCanvas.fillStyle = color;
      data.forEach((value, index) => {
        if (value === null) return;
        const x = padding.left + (chartWidth * index / (data.length - 1));
        const y = baseY + chartHeight - ((value - minVal) / range * chartHeight);
        ctxCanvas.beginPath();
        ctxCanvas.arc(x, y, 2, 0, 2 * Math.PI);
        ctxCanvas.fill();
      });
    }
  };

  // ========== 상단 차트: 등락률 ==========
  ctxCanvas.strokeStyle = '#e0e0e0';
  ctxCanvas.fillStyle = '#2196F3';
  ctxCanvas.font = '12px Arial';
  ctxCanvas.textAlign = 'right';
  ctxCanvas.lineWidth = 1;

  for (let i = 0; i <= 10; i++) {
    const value = minChangeRate + (rangeChangeRate * i / 10);
    const y = topChartY + chartHeight - (chartHeight * i / 10);

    ctxCanvas.strokeStyle = '#e0e0e0';
    ctxCanvas.beginPath();
    ctxCanvas.moveTo(padding.left, y);
    ctxCanvas.lineTo(padding.left + chartWidth, y);
    ctxCanvas.stroke();

    ctxCanvas.fillStyle = '#2196F3';
    ctxCanvas.fillText(`${value.toFixed(2)}%`, padding.left - 10, y + 4);
  }

  // 0% 라인
  const zeroY = topChartY + chartHeight - ((0 - minChangeRate) / rangeChangeRate * chartHeight);
  ctxCanvas.strokeStyle = '#999999';
  ctxCanvas.lineWidth = 1;
  ctxCanvas.setLineDash([5, 5]);
  ctxCanvas.beginPath();
  ctxCanvas.moveTo(padding.left, zeroY);
  ctxCanvas.lineTo(padding.left + chartWidth, zeroY);
  ctxCanvas.stroke();
  ctxCanvas.setLineDash([]);

  // 등락률 이동평균선
  [...maPeriods].reverse().forEach(period => {
    const maValues = changeRateMAData.get(period);
    if (maValues) {
      drawLine(maValues, minChangeRate, rangeChangeRate, MA_COLORS[period] || '#999999', 1, topChartY, false);
    }
  });

  // 등락률 라인
  ctxCanvas.strokeStyle = '#2196F3';
  ctxCanvas.lineWidth = 2;
  ctxCanvas.beginPath();

  timeSeries.forEach((data, index) => {
    const x = padding.left + (chartWidth * index / (timeSeries.length - 1));
    const y = topChartY + chartHeight - ((data.avgChangeRate - minChangeRate) / rangeChangeRate * chartHeight);

    if (index === 0) {
      ctxCanvas.moveTo(x, y);
    } else {
      ctxCanvas.lineTo(x, y);
    }
  });

  ctxCanvas.stroke();

  // 등락률 점
  ctxCanvas.fillStyle = '#2196F3';
  timeSeries.forEach((data, index) => {
    const x = padding.left + (chartWidth * index / (timeSeries.length - 1));
    const y = topChartY + chartHeight - ((data.avgChangeRate - minChangeRate) / rangeChangeRate * chartHeight);
    ctxCanvas.beginPath();
    ctxCanvas.arc(x, y, 3, 0, 2 * Math.PI);
    ctxCanvas.fill();
  });

  // ========== 하단 차트: 거래량 강도 ==========
  ctxCanvas.strokeStyle = '#e0e0e0';
  ctxCanvas.fillStyle = '#FF5722';
  ctxCanvas.font = '12px Arial';
  ctxCanvas.textAlign = 'right';
  ctxCanvas.lineWidth = 1;

  for (let i = 0; i <= 10; i++) {
    const value = minVolume + (rangeVolume * i / 10);
    const y = bottomChartY + chartHeight - (chartHeight * i / 10);

    ctxCanvas.strokeStyle = '#e0e0e0';
    ctxCanvas.beginPath();
    ctxCanvas.moveTo(padding.left, y);
    ctxCanvas.lineTo(padding.left + chartWidth, y);
    ctxCanvas.stroke();

    ctxCanvas.fillStyle = '#FF5722';
    ctxCanvas.fillText(`${value.toFixed(1)}%`, padding.left - 10, y + 4);
  }

  // 거래량 강도 이동평균선
  [...maPeriods].reverse().forEach(period => {
    const maValues = volumeMAData.get(period);
    if (maValues) {
      drawLine(maValues, minVolume, rangeVolume, MA_COLORS[period] || '#999999', 1, bottomChartY, false);
    }
  });

  // 거래량 강도 라인
  ctxCanvas.strokeStyle = '#FF5722';
  ctxCanvas.lineWidth = 2;
  ctxCanvas.beginPath();

  timeSeries.forEach((data, index) => {
    const x = padding.left + (chartWidth * index / (timeSeries.length - 1));
    const y = bottomChartY + chartHeight - ((data.avgVolumeStrength - minVolume) / rangeVolume * chartHeight);

    if (index === 0) {
      ctxCanvas.moveTo(x, y);
    } else {
      ctxCanvas.lineTo(x, y);
    }
  });

  ctxCanvas.stroke();

  // 거래량 강도 점
  ctxCanvas.fillStyle = '#FF5722';
  timeSeries.forEach((data, index) => {
    const x = padding.left + (chartWidth * index / (timeSeries.length - 1));
    const y = bottomChartY + chartHeight - ((data.avgVolumeStrength - minVolume) / rangeVolume * chartHeight);
    ctxCanvas.beginPath();
    ctxCanvas.arc(x, y, 3, 0, 2 * Math.PI);
    ctxCanvas.fill();
  });

  // ========== X축 ==========
  ctxCanvas.fillStyle = '#666666';
  ctxCanvas.textAlign = 'center';
  const timeStep = Math.max(1, Math.floor(timeSeries.length / 10));
  for (let i = 0; i < timeSeries.length; i += timeStep) {
    const x = padding.left + (chartWidth * i / (timeSeries.length - 1));
    const time = timeSeries[i].time;

    let timeStr: string;
    if (dataPlan.interval === '1d') {
      timeStr = `${(time.getMonth() + 1).toString().padStart(2, '0')}/${time.getDate().toString().padStart(2, '0')}`;
    } else if (dataPlan.interval.includes('h')) {
      timeStr = `${(time.getMonth() + 1).toString().padStart(2, '0')}/${time.getDate().toString().padStart(2, '0')} ${time.getHours()}:00`;
    } else {
      timeStr = `${(time.getMonth() + 1).toString().padStart(2, '0')}/${time.getDate().toString().padStart(2, '0')} ${time.getHours()}:${time.getMinutes().toString().padStart(2, '0')}`;
    }

    ctxCanvas.fillText(timeStr, x, displayHeight - padding.bottom + 20);
  }

  // ========== 골든크로스/데드크로스 표시 ==========
  drawCrossMarkers(ctxCanvas, timeSeries, padding, chartWidth, chartHeight, topChartY, symbolTransactions);

  // ========== 매수/매도 표시 ==========
  if (symbolTransactions && symbolTransactions.length > 0) {
    drawTransactionMarkers(ctxCanvas, timeSeries, symbolTransactions, padding, chartWidth, chartHeight, topChartY);
  }

  // 저장
  const buffer = canvas.toBuffer('image/png');
  const outputPath = join(OUTPUT_DIR, filename);
  writeFileSync(outputPath, buffer);
  console.log(`  💾 Saved chart: ${outputPath}`);
};

/**
 * 골든크로스/데드크로스 마커 그리기
 */
const drawCrossMarkers = (
  ctx: any,
  timeSeries: TimeSeries[],
  padding: { left: number; right: number; top: number; bottom: number },
  chartWidth: number,
  chartHeight: number,
  topChartY: number,
  symbolTransactions?: Transaction[]
): void => {
  if (!symbolTransactions || symbolTransactions.length === 0) {
    // 그룹 차트
    timeSeries.forEach((data, index) => {
      const x = padding.left + (chartWidth * index / (timeSeries.length - 1));

      if (data.goldenCross) {
        drawGoldenCrossMarker(ctx, x, topChartY, chartHeight, 24, 7);
      }

      if (data.deadCross) {
        drawDeadCrossMarker(ctx, x, topChartY, chartHeight, 24, 7);
      }
    });
  } else {
    // 심볼 차트
    let goldenCount = 0;
    let deadCount = 0;

    timeSeries.forEach((data, index) => {
      if (data.goldenCross) goldenCount++;
      if (data.deadCross) deadCount++;
    });

    console.log(`  [CHART DEBUG] Found ${goldenCount} golden crosses, ${deadCount} dead crosses`);

    timeSeries.forEach((data, index) => {
      const x = padding.left + (chartWidth * index / (timeSeries.length - 1));

      if (data.goldenCross) {
        drawGoldenCrossMarker(ctx, x, topChartY, chartHeight, 20, 9);
      }

      if (data.deadCross) {
        console.log(`  [CHART DEBUG] Drawing dead cross arrow at index ${index}, time: ${data.time.toISOString()}, x: ${x}`);
        drawDeadCrossMarker(ctx, x, topChartY, chartHeight, 20, 9);
      }
    });
  }
};

/**
 * 골든크로스 마커 그리기
 */
const drawGoldenCrossMarker = (
  ctx: any,
  x: number,
  topChartY: number,
  chartHeight: number,
  fontSize: number,
  labelFontSize: number
): void => {
  // 수직 점선
  ctx.strokeStyle = '#4CAF50';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(x, topChartY);
  ctx.lineTo(x, topChartY + chartHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // 화살표
  ctx.fillStyle = '#4CAF50';
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('▲', x, topChartY + chartHeight - 5);

  // 'G' 레이블
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${labelFontSize}px Arial`;
  ctx.fillText('G', x, topChartY + chartHeight - (fontSize === 24 ? 10 : 9));
};

/**
 * 데드크로스 마커 그리기
 */
const drawDeadCrossMarker = (
  ctx: any,
  x: number,
  topChartY: number,
  chartHeight: number,
  fontSize: number,
  labelFontSize: number
): void => {
  // 수직 점선
  ctx.strokeStyle = '#F44336';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(x, topChartY);
  ctx.lineTo(x, topChartY + chartHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // 화살표
  ctx.fillStyle = '#F44336';
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('▼', x, topChartY + chartHeight - 5);

  // 'D' 레이블
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${labelFontSize}px Arial`;
  ctx.fillText('D', x, topChartY + chartHeight - (fontSize === 24 ? 10 : 9));
};

/**
 * 매수/매도 마커 그리기
 */
const drawTransactionMarkers = (
  ctx: any,
  timeSeries: TimeSeries[],
  symbolTransactions: Transaction[],
  padding: { left: number; right: number; top: number; bottom: number },
  chartWidth: number,
  chartHeight: number,
  topChartY: number
): void => {
  const startTime = timeSeries[0].time.getTime();
  const endTime = timeSeries[timeSeries.length - 1].time.getTime();
  const timeRange = endTime - startTime;

  // 거래별 보유 수량 계산
  let holdingQuantity = 0;
  const txWithHolding = symbolTransactions.map(tx => {
    if (tx.type === 'BUY') {
      holdingQuantity += tx.quantity;
    } else {
      holdingQuantity -= tx.quantity;
    }
    return { ...tx, holdingAfter: holdingQuantity };
  });

  txWithHolding.forEach(tx => {
    const txTime = tx.time.getTime();
    if (txTime < startTime || txTime > endTime) return;

    const timeOffset = txTime - startTime;
    const xRatio = timeOffset / timeRange;
    const x = padding.left + (chartWidth * xRatio);

    if (tx.type === 'BUY') {
      drawBuyMarker(ctx, x, topChartY, chartHeight, tx);
    } else {
      drawSellMarker(ctx, x, topChartY, chartHeight, tx);
    }
  });
};

/**
 * 매수 마커 그리기
 */
const drawBuyMarker = (
  ctx: any,
  x: number,
  topChartY: number,
  chartHeight: number,
  tx: Transaction & { holdingAfter: number }
): void => {
  // 수직 점선
  ctx.strokeStyle = '#2196F3';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(x, topChartY);
  ctx.lineTo(x, topChartY + chartHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // 화살표
  ctx.fillStyle = '#2196F3';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('▲', x, topChartY + 20);

  // 레이블 결정
  let buyLabel = 'b';
  if (tx.isGoldenCrossEntry) {
    buyLabel = 'b';
  } else if (tx.isPyramiding) {
    buyLabel = '+b';
  } else if (tx.isReBuy) {
    buyLabel = '!b';
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 7px Arial';
  ctx.fillText(buyLabel, x, topChartY + 16);

  // 보유 수량 표시
  ctx.save();
  ctx.translate(x, topChartY - 5);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#2196F3';
  ctx.font = 'bold 8px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`${tx.holdingAfter}(${tx.quantity})`, 0, 0);
  ctx.restore();
};

/**
 * 매도 마커 그리기
 */
const drawSellMarker = (
  ctx: any,
  x: number,
  topChartY: number,
  chartHeight: number,
  tx: Transaction & { holdingAfter: number }
): void => {
  // 수직 점선
  ctx.strokeStyle = '#FF9800';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(x, topChartY);
  ctx.lineTo(x, topChartY + chartHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // 화살표
  ctx.fillStyle = '#FF9800';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('▼', x, topChartY + 20);

  // 레이블 결정
  let label = 'S';
  if (tx.profit && tx.profit > 0) {
    label = '+S';
  } else if (tx.reason === 'DEAD_CROSS') {
    label = 's';
  } else if (tx.reason === 'DEAD_CROSS_ADDITIONAL') {
    label = '-s';
  } else if (tx.reason === 'DEAD_CROSS_BELOW') {
    label = '-S';
  } else if (tx.reason === 'STOP_LOSS' || tx.reason === 'TRAILING_STOP') {
    label = '!S';
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 7px Arial';
  ctx.fillText(label, x, topChartY + 10);

  // 보유 수량 표시
  ctx.save();
  ctx.translate(x, topChartY - 5);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#FF9800';
  ctx.font = 'bold 8px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`${tx.holdingAfter}(${tx.quantity})`, 0, 0);
  ctx.restore();
};
