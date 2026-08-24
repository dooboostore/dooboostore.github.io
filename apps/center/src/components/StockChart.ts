import {
  changedAttribute,
  elementDefine,
  eventShadowDom,
  eventWindow,
  mutationObserverLight,
  onConnectedAfter,
  onConnectedBodyShadow,
  onDisconnected,
  queryShadow,
  resizeObserverLight
} from "@dooboostore/simple-web-component";

const tagName = "stock-chart";

/** 캔들 데이터 한 건 */
export interface StockChartPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockChart extends HTMLElement {
  /** 외부에서 데이터 주입 (tick 요소 대신 사용 가능) */
  setData(points: StockChartPoint[]): void;
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return existing;

  @elementDefine(tagName, { window: w })
  class StockChartImpl extends w.HTMLElement implements StockChart {
    // ---------- 상태 ----------
    private points: StockChartPoint[] = [];
    private viewStart: number = 0;
    private viewEnd: number = 0;
    private selectedIdx: number = -1;
    private viewInitDone: boolean = false;
    private showCloseLine: boolean = false;

    // show-close-line 속성 변경 시 호출 (기본값: 안 보임)
    @changedAttribute('show-close-line', { type: Boolean })
    onShowCloseLineChanged(value: boolean) {
      this.showCloseLine = !!value;
      if (this.chartCanvas) this.drawChart();
    }

    private dragLastX: number = 0;
    private dragging: boolean = false;
    private downX: number = 0;
    private downY: number = 0;
    private pinchDist0: number = 0;
    private pinchSpan0: number = 0;
    private pinchAnchorFrac: number = 0.5;
    private readonly padL: number = 6;
    private readonly padR: number = 58;

    // ---------- public ----------

    setData(points: StockChartPoint[]): void {
      this.points = points || [];
      this.viewInitDone = false;
      this.selectedIdx = -1;
      if (this.isConnected) {
        this.setupChart();
      }
    }

    // ---------- 렌더 ----------

    @onConnectedBodyShadow
    render(): string {
      return `
        <style>
          :host { display: block; position: relative; }
          #stock-chart-canvas {
            display: block; width: 100%; height: 100%;
            touch-action: none; cursor: crosshair;
          }
          .chart-readout {
            position: absolute; top: 8px; left: 10px;
            display: none; flex-wrap: wrap; gap: 8px;
            font-size: 11px; color: #555;
            background: rgba(255,255,255,0.92); border: 1px solid #eef0f4;
            border-radius: 6px; padding: 3px 9px;
            pointer-events: none; z-index: 2;
          }
        </style>
        <canvas id="stock-chart-canvas"></canvas>
        <div class="chart-readout" id="stock-chart-readout"></div>
      `;
    }

    // ---------- 라이프사이클 ----------

    @onConnectedAfter
    onConnected() {
      // tick 자식 요소들로 데이터 구성
      this.collectFromTicks();
      if (this.points.length === 0) {
        // 사용자가 setData를 부르길 기다림
        return;
      }
      this.setupChart();
    }

    @onDisconnected
    onDisconnected() {
      // observer 정리는 프레임워크가 자동 처리
    }

    // host(컴포넌트) 크기 변경 시 재그리기
    @resizeObserverLight()
    onHostResize(matchedEls: HTMLElement[], entries: ResizeObserverEntry[]): void {
      if (this.chartCanvas) this.drawChart();
    }

    // ---------- 데이터 수집 ----------

    private collectFromTicks(): void {
      const ticks = this.querySelectorAll(":scope > tick");
      const points: StockChartPoint[] = [];
      ticks.forEach((tick) => {
        const date = tick.getAttribute("date") || "";
        const open = Number(tick.getAttribute("open")) || 0;
        const high = Number(tick.getAttribute("high")) || 0;
        const low = Number(tick.getAttribute("low")) || 0;
        const close = Number(tick.getAttribute("close")) || 0;
        const volume = Number(tick.getAttribute("volume")) || 0;
        points.push({ date, open, high, low, close, volume });
      });
      this.points = points;
    }

    // tick 자식 요소 변경(추가/삭제/속성) 시 재수집 후 다시 그림
    // 셀렉터 생략 → $this(host, light DOM) observe
    @mutationObserverLight({ childList: true, attributes: true, subtree: true })
    private onTicksMutated(matchedEls: HTMLElement[]): void {
      this.collectFromTicks();
      if (this.chartCanvas && this.points.length > 0) {
        if (!this.viewInitDone) {
          const n = this.points.length;
          const span = Math.min(60, n);
          this.viewStart = Math.max(0, n - span);
          this.viewEnd = n - 1;
          this.viewInitDone = true;
        }
        this.drawChart();
      }
    }

    // ---------- 캔들 차트 (canvas) ----------

    @queryShadow('#stock-chart-canvas')
    private chartCanvas!: HTMLCanvasElement;

    @queryShadow('#stock-chart-readout')
    private readoutEl!: HTMLElement;

    private setupChart(): void {
      const canvas = this.chartCanvas;
      if (!canvas || this.points.length === 0) return;
      if (!this.viewInitDone) {
        const n = this.points.length;
        const span = Math.min(60, n);
        this.viewStart = Math.max(0, n - span);
        this.viewEnd = n - 1;
        this.viewInitDone = true;
      }

      this.drawChart();
    }

    private clampView(): void {
      const n = this.points.length;
      if (n === 0) return;
      let span = this.viewEnd - this.viewStart + 1;
      span = Math.max(8, Math.min(n, Math.round(span)));
      this.viewStart = Math.max(0, Math.min(this.viewStart, n - span));
      this.viewEnd = this.viewStart + span - 1;
    }

    @eventShadowDom('#stock-chart-canvas', 'wheel', { passive: false })
    private onWheel(e: WheelEvent): void {
      e.preventDefault();
      const canvas = this.chartCanvas;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const plotW = Math.max(1, rect.width - this.padL - this.padR);
      const frac = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left - this.padL) / plotW),
      );
      const span = this.viewEnd - this.viewStart + 1;
      const anchorIdx = this.viewStart + frac * span;
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const newSpan = span * factor;
      this.viewStart = anchorIdx - frac * newSpan;
      this.viewEnd = this.viewStart + newSpan - 1;
      this.clampView();
      this.drawChart();
    }

    @eventShadowDom('#stock-chart-canvas', 'mousedown')
    private onMouseDown(e: MouseEvent): void {
      this.dragging = true;
      this.dragLastX = e.clientX;
      this.downX = e.clientX;
      this.downY = e.clientY;
    }

    @eventWindow('mouseup')
    private onMouseUp(e: MouseEvent): void {
      if (!this.dragging) return;
      this.dragging = false;
      const moved =
        Math.abs(e.clientX - this.downX) + Math.abs(e.clientY - this.downY);
      if (moved < 5) {
        const idx = this.indexAtX(e.clientX);
        this.selectedIdx = idx === this.selectedIdx ? -1 : idx;
        this.drawChart();
      }
    }

    @eventShadowDom('#stock-chart-canvas', 'mousemove')
    private onMouseMove(e: MouseEvent): void {
      if (this.dragging) {
        const canvas = this.chartCanvas;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const plotW = Math.max(1, rect.width - this.padL - this.padR);
        const dataLen =
          Math.ceil(this.viewEnd) - Math.floor(this.viewStart) + 1;
        const candleW = plotW / dataLen;
        const dx = e.clientX - this.dragLastX;
        if (Math.abs(dx) >= 1) {
          const shift = -dx / candleW;
          this.viewStart += shift;
          this.viewEnd += shift;
          this.clampView();
          this.dragLastX = e.clientX;
          this.drawChart();
        }
      }
    }

    private indexAtX(clientX: number): number {
      const canvas = this.chartCanvas;
      if (!canvas) return -1;
      const rect = canvas.getBoundingClientRect();
      const plotW = Math.max(1, rect.width - this.padL - this.padR);
      const dataLen = Math.ceil(this.viewEnd) - Math.floor(this.viewStart) + 1;
      const frac = (clientX - rect.left - this.padL) / plotW;
      const idx = Math.round(this.viewStart + frac * dataLen - 0.5);
      const s = Math.floor(this.viewStart),
        eI = Math.ceil(this.viewEnd);
      return idx >= s && idx <= eI ? idx : -1;
    }

    @eventShadowDom('#stock-chart-canvas', 'touchstart', { passive: false })
    private onTouchStart(e: TouchEvent): void {
      e.preventDefault();
      const touches = e.touches;
      if (touches.length === 2) {
        this.pinchDist0 = Math.abs(touches[0].clientX - touches[1].clientX);
        this.pinchSpan0 = this.viewEnd - this.viewStart + 1;
        const canvas = this.chartCanvas;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const midX = (touches[0].clientX + touches[1].clientX) / 2;
          this.pinchAnchorFrac = Math.max(
            0,
            Math.min(1, (midX - rect.left) / rect.width),
          );
        }
        this.dragging = false;
      } else if (touches.length === 1) {
        this.dragging = true;
        this.dragLastX = touches[0].clientX;
        this.downX = touches[0].clientX;
        this.downY = touches[0].clientY;
      }
    }

    @eventShadowDom('#stock-chart-canvas', 'touchmove', { passive: false })
    private onTouchMove(e: TouchEvent): void {
      e.preventDefault();
      const touches = e.touches;
      if (touches.length === 2 && this.pinchDist0 > 0) {
        const dist = Math.abs(touches[0].clientX - touches[1].clientX);
        if (dist === 0) return;
        const factor = this.pinchDist0 / dist;
        const newSpan = this.pinchSpan0 * factor;
        const anchorIdx =
          this.pinchSpan0 * this.pinchAnchorFrac + this.viewStart;
        this.viewStart = anchorIdx - this.pinchAnchorFrac * newSpan;
        this.viewEnd = this.viewStart + newSpan - 1;
        this.clampView();
        this.drawChart();
      } else if (touches.length === 1 && this.dragging) {
        const canvas = this.chartCanvas;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const plotW = Math.max(1, rect.width - this.padL - this.padR);
        const dataLen =
          Math.ceil(this.viewEnd) - Math.floor(this.viewStart) + 1;
        const candleW = plotW / dataLen;
        const dx = touches[0].clientX - this.dragLastX;
        if (Math.abs(dx) >= 1) {
          this.viewStart += -dx / candleW;
          this.viewEnd += -dx / candleW;
          this.clampView();
          this.dragLastX = touches[0].clientX;
          this.drawChart();
        }
      }
    }

    @eventShadowDom('#stock-chart-canvas', 'touchend')
    private onTouchEnd(e: TouchEvent): void {
      const moved =
        Math.abs(e.changedTouches[0].clientX - this.downX) +
        Math.abs(e.changedTouches[0].clientY - this.downY);
      const wasPinch = this.pinchDist0 > 0;
      this.pinchDist0 = 0;
      if (this.dragging && !wasPinch && moved < 5) {
        const idx = this.indexAtX(e.changedTouches[0].clientX);
        this.selectedIdx = idx === this.selectedIdx ? -1 : idx;
        this.drawChart();
      }
      this.dragging = false;
    }

    private drawChart(): void {
      const canvas = this.chartCanvas;
      if (!canvas || this.points.length === 0) return;
      const cssW = canvas.clientWidth || 320;
      const cssH = canvas.clientHeight || 300;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const startI = Math.floor(this.viewStart);
      const endI = Math.ceil(this.viewEnd);
      const data = this.points.slice(startI, endI + 1);
      if (data.length === 0) return;

      const W = cssW,
        H = cssH;
      const padL = this.padL,
        padR = this.padR,
        padT = 8;
      const axisH = 18,
        gap = 8;
      const volH = Math.max(36, H * 0.16);
      const priceH = H - padT - axisH - volH - gap;
      const plotW = W - padL - padR;

      const UP = "#e5484d",
        DOWN = "#3e63dd";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);

      let maxP = -Infinity,
        minP = Infinity;
      let maxV = 0;
      for (const d of data) {
        maxP = Math.max(maxP, d.high);
        minP = Math.min(minP, d.low);
        maxV = Math.max(maxV, d.volume);
      }
      const pPad = (maxP - minP) * 0.07 || maxP * 0.02 || 1;
      maxP += pPad;
      minP -= pPad;

      const yPrice = (p: number) =>
        padT + priceH - ((p - minP) / (maxP - minP)) * priceH;
      const xCandle = (i: number) => padL + ((i + 0.5) / data.length) * plotW;
      const candleW = plotW / data.length;
      const bodyW = Math.max(1, Math.min(18, candleW * 0.65));

      // 가격 그리드 + 라벨
      ctx.font = "10px -apple-system, sans-serif";
      ctx.textBaseline = "middle";
      const gridCount = 4;
      for (let g = 0; g <= gridCount; g++) {
        const p = minP + ((maxP - minP) * g) / gridCount;
        const y = yPrice(p);
        ctx.strokeStyle = "#f0f2f5";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(W - padR, y);
        ctx.stroke();
        ctx.fillStyle = "#98a2b3";
        ctx.textAlign = "left";
        ctx.fillText(p.toLocaleString(), W - padR + 6, y);
      }

      // 거래량 영역 라인 + y축 수치 라벨
      const volTop = padT + priceH + gap;
      const volPlotH = volH - 6;
      const fmtVol = (v: number): string => {
        if (v >= 100000000) return (v / 100000000).toFixed(1) + "억";
        if (v >= 10000) return Math.round(v / 10000).toLocaleString() + "만";
        return v.toLocaleString();
      };
      ctx.strokeStyle = "#f6f7f9";
      for (let g = 1; g <= 2; g++) {
        const vv = (maxV * g) / 2;
        const vy = H - axisH - (volPlotH * g) / 2;
        ctx.beginPath();
        ctx.moveTo(padL, vy);
        ctx.lineTo(W - padR, vy);
        ctx.stroke();
        ctx.fillStyle = "#98a2b3";
        ctx.textAlign = "left";
        ctx.fillText(fmtVol(vv), W - padR + 6, vy);
      }
      ctx.strokeStyle = "#f0f2f5";
      ctx.beginPath();
      ctx.moveTo(padL, volTop);
      ctx.lineTo(W - padR, volTop);
      ctx.stroke();

      // 세로 시간 그리드 (가격+거래량 영역 관통)
      const step = Math.max(1, Math.ceil(data.length / 6));
      ctx.strokeStyle = "#f6f7f9";
      ctx.lineWidth = 1;
      for (let i = 0; i < data.length; i += step) {
        const gx = Math.round(xCandle(i)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(gx, padT);
        ctx.lineTo(gx, H - axisH);
        ctx.stroke();
      }

      // 캔들 + 거래량
      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const up = d.close >= d.open;
        const color = up ? UP : DOWN;
        const x = Math.round(xCandle(i)) + 0.5;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, yPrice(d.high));
        ctx.lineTo(x, yPrice(d.low));
        ctx.stroke();
        const yO = yPrice(d.open),
          yC = yPrice(d.close);
        const top = Math.min(yO, yC);
        const hgt = Math.max(1, Math.abs(yC - yO));
        ctx.fillStyle = color;
        ctx.fillRect(x - bodyW / 2, top, bodyW, hgt);
        const vh = maxV > 0 ? (d.volume / maxV) * (volH - 6) : 0;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(x - bodyW / 2, H - axisH - vh, bodyW, vh);
        ctx.globalAlpha = 1;
      }

      // 종가 연결선 (캔들 위에 그려짐, show-close-line 속성 있을 때만)
      if (this.showCloseLine) {
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 1;
        ctx.lineJoin = "round";
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
          const px = xCandle(i);
          const py = yPrice(data[i].close);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // 보이는 구간 최고/최저 툴팁
      let hiIdx = 0,
        loIdx = 0;
      for (let i = 1; i < data.length; i++) {
        if (data[i].high > data[hiIdx].high) hiIdx = i;
        if (data[i].low < data[loIdx].low) loIdx = i;
      }
      const drawChartTip = (
        i: number,
        price: number,
        text: string,
        above: boolean,
      ) => {
        ctx.font = "bold 10px -apple-system, sans-serif";
        const tw = ctx.measureText(text).width + 14;
        const th = 16;
        const cx = Math.max(
          padL + tw / 2,
          Math.min(W - padR - tw / 2, xCandle(i)),
        );
        const py = yPrice(price);
        const ty = above ? py - 8 - th : py + 8;
        ctx.fillStyle = "#33475b";
        ctx.beginPath();
        ctx.roundRect(cx - tw / 2, ty, tw, th, 4);
        ctx.fill();
        const tipX = Math.max(
          cx - tw / 2 + 6,
          Math.min(cx + tw / 2 - 6, xCandle(i)),
        );
        ctx.beginPath();
        if (above) {
          ctx.moveTo(tipX - 4, ty + th);
          ctx.lineTo(tipX + 4, ty + th);
          ctx.lineTo(tipX, ty + th + 4);
        } else {
          ctx.moveTo(tipX - 4, ty);
          ctx.lineTo(tipX + 4, ty);
          ctx.lineTo(tipX, ty - 4);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, cx, ty + th / 2 + 0.5);
      };
      drawChartTip(
        hiIdx,
        data[hiIdx].high,
        `최고: ${data[hiIdx].high.toLocaleString()}원`,
        true,
      );
      drawChartTip(
        loIdx,
        data[loIdx].low,
        `최저: ${data[loIdx].low.toLocaleString()}원`,
        false,
      );

      // 날짜 축
      ctx.fillStyle = "#98a2b3";
      ctx.textAlign = "center";
      for (let i = 0; i < data.length; i += step) {
        const label = data[i].date.slice(5);
        ctx.fillText(label, xCandle(i), H - axisH / 2);
      }

      // 마지막 종가 라인
      const last = data[data.length - 1];
      const lastUp = last.close >= last.open;
      const ly = yPrice(last.close);
      ctx.strokeStyle = lastUp ? UP : DOWN;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, ly);
      ctx.lineTo(W - padR, ly);
      ctx.stroke();
      ctx.setLineDash([]);
      // 종가 태그
      const tagText = last.close.toLocaleString();
      ctx.fillStyle = lastUp ? UP : DOWN;
      const tagW = ctx.measureText(tagText).width + 10;
      ctx.beginPath();
      const tagY = Math.max(padT, Math.min(H - axisH - volH - gap - 8, ly));
      ctx.roundRect(W - padR + 2, tagY - 8, tagW, 16, 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.fillText(tagText, W - padR + 7, tagY);

      // 선택된 캔들: 크로스헤어 + 종가 가로선 + 리드아웃
      const readout = this.readoutEl;
      if (this.selectedIdx >= startI && this.selectedIdx <= endI && readout) {
        const hi = this.selectedIdx - startI;
        const d = this.points[this.selectedIdx];
        const up = d.close >= d.open;
        const hx = Math.round(xCandle(hi)) + 0.5;
        ctx.strokeStyle = "#94a3b8";
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx, padT);
        ctx.lineTo(hx, H - axisH);
        ctx.stroke();
        const cy = yPrice(d.close);
        ctx.strokeStyle = up ? UP : DOWN;
        ctx.beginPath();
        ctx.moveTo(padL, cy);
        ctx.lineTo(W - padR, cy);
        ctx.stroke();
        if (d.volume > 0) {
          const vy = H - axisH - (d.volume / maxV) * volPlotH;
          ctx.beginPath();
          ctx.moveTo(padL, vy);
          ctx.lineTo(W - padR, vy);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        // x축 날짜 필 하이라이트
        ctx.font = "bold 10px -apple-system, sans-serif";
        const selLabel = d.date.slice(5);
        const selTw = ctx.measureText(selLabel).width + 10;
        ctx.fillStyle = "#33475b";
        ctx.beginPath();
        ctx.roundRect(
          Math.min(W - padR - selTw / 2, Math.max(padL, hx - selTw / 2)),
          H - axisH + 2,
          selTw,
          axisH - 4,
          4,
        );
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.fillText(
          selLabel,
          Math.min(W - padR - selTw / 2, Math.max(padL, hx - selTw / 2)) +
            selTw / 2,
          H - axisH / 2,
        );
        const prev = this.points[this.selectedIdx - 1] || d;
        const diff = prev.close
          ? ((d.close - prev.close) / prev.close) * 100
          : 0;
        const sign = diff > 0 ? "+" : "";
        readout.innerHTML = `
          <span>${d.date}</span>
          <span>시 ${d.open.toLocaleString()}</span>
          <span>고 ${d.high.toLocaleString()}</span>
          <span>저 ${d.low.toLocaleString()}</span>
          <span style="color:${up ? UP : DOWN};font-weight:700">종 ${d.close.toLocaleString()} (${sign}${diff.toFixed(2)}%)</span>
          <span>거래량 ${d.volume.toLocaleString()}</span>
        `;
        readout.style.display = "flex";
        requestAnimationFrame(() => {
          const r = readout.getBoundingClientRect();
          let lx = hx - r.width / 2;
          lx = Math.max(4, Math.min(cssW - r.width - 4, lx));
          let ty = yPrice(d.high) - r.height - 10;
          if (ty < padT) ty = yPrice(d.low) + 12;
          readout.style.left = `${lx}px`;
          readout.style.top = `${Math.max(4, ty)}px`;
        });
      } else if (readout) {
        readout.style.display = "none";
      }
    }
  }

  return StockChartImpl;
};