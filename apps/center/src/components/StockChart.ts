import {
  changedAttribute,
  elementDefine,
  eventShadow,
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

/** 자식 <rect>/<arc> 로 그려지는 오버레이 도형 (캔버스 픽셀 좌표) */
export interface ChartShapeBase {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  target?: 'candle' | 'volume' | 'all';
}
export type ChartShape =
  | (ChartShapeBase & { type: 'rect'; x: number; y: number; width: number; height: number })
  | (ChartShapeBase & { type: 'arc'; x: number; y: number; r: number; start: number; end: number })
  // 날짜 기반 rect — x는 date-start/date-end 캔들 위치, y는 전체 가격 범위 자동 계산
  | (ChartShapeBase & { type: 'rect-date'; dateStart: string; dateEnd: string });

function num(v: string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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
    private shapes: ChartShape[] = [];
    private viewStart: number = 0;
    private viewEnd: number = 0;
    private selectedIdx: number = -1;
    private viewInitDone: boolean = false;
    private showCloseLine: boolean = false;
    private hiddenVolume: boolean = false;
    private showMinMax: boolean = false;
    private showLastLine: boolean = false;
    private controlsEnabled: boolean = false;
    private readoutEnabled: boolean = false;
    private hiddenXLabel: boolean = false;
    private hiddenYLabel: boolean = false;

    // show-close-line 속성 변경 시 호출 (기본값: 안 보임)
    @changedAttribute('show-close-line', { type: Boolean })
    onShowCloseLineChanged(value: boolean) {
      this.showCloseLine = !!value;
      if (this.chartCanvas) this.drawChart();
    }

    // hidden-volume 속성 — true면 거래량 영역 숨김 (기본값: 보임)
    @changedAttribute('hidden-volume', { type: Boolean })
    onHiddenVolumeChanged(value: boolean) {
      this.hiddenVolume = !!value;
      if (this.chartCanvas) this.drawChart();
    }

    // show-min-max 속성 — true면 최고/최저 툴팁 표시 (기본값: 안 보임)
    @changedAttribute('show-min-max', { type: Boolean })
    onShowMinMaxChanged(value: boolean) {
      this.showMinMax = !!value;
      if (this.chartCanvas) this.drawChart();
    }

    // show-last-line 속성 — true면 마지막 종가 가로점선 + 태그 표시 (기본값: 안 보임)
    @changedAttribute('show-last-line', { type: Boolean })
    onShowLastLineChanged(value: boolean) {
      this.showLastLine = !!value;
      if (this.chartCanvas) this.drawChart();
    }

    // enabled-control 속성 — true면 드래그 이동/휠 줌/핀치 등 제어 활성화 (기본값: 비활성)
    @changedAttribute('enabled-control', { type: Boolean })
    onEnabledControlChanged(value: boolean) {
      this.controlsEnabled = !!value;
    }

    // enabled-readout 속성 — true면 클릭/탭 시 캔들 정보(리드아웃) 표시 (기본값: 비활성)
    @changedAttribute('enabled-readout', { type: Boolean })
    onEnabledReadoutChanged(value: boolean) {
      this.readoutEnabled = !!value;
    }

    // hidden-x-label — true면 x축(날짜) 라벨 숨김 (기본값: 보임)
    @changedAttribute('hidden-x-label', { type: Boolean })
    onHiddenXLabelChanged(value: boolean) {
      this.hiddenXLabel = !!value;
      if (this.chartCanvas) this.drawChart();
    }

    // hidden-y-label — true면 y축(가격/거래량 수치) 라벨 숨김 (기본값: 보임)
    @changedAttribute('hidden-y-label', { type: Boolean })
    onHiddenYLabelChanged(value: boolean) {
      this.hiddenYLabel = !!value;
      if (this.chartCanvas) this.drawChart();
    }

    private disabledEvent: boolean = false;

    // disabled-event 속성 — true면 모든 포인터/터치/휠 이벤트 리스너를 무시 (기본값: 활성)
    @changedAttribute('disabled-event', { type: Boolean })
    onDisabledEventChanged(value: boolean) {
      this.disabledEvent = !!value;
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
    /** 모바일 touchend 후 합성 mouseup 이벤트로 팝업이 닫히는 것을 방지하는 타임스탬프 */
    private lastTouchEndTime: number = 0;

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
            touch-action: pan-y; cursor: crosshair;
          }
          :host([enabled-control]) #stock-chart-canvas {
            touch-action: none;
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
      this.collectFromShapes();
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

    // 자식 <rect>/<arc> 요소를 도형으로 수집 (캔버스 픽셀 좌표 오버레이)
    private collectFromShapes(): void {
      const shapes: ChartShape[] = [];
      this.querySelectorAll(":scope > rect").forEach((el) => {
        const attr = (n: string) => el.getAttribute(n);
        const base = { fill: attr("fill") || attr("fill-style") || undefined, stroke: attr("stroke") || attr("stroke-style") || undefined, strokeWidth: num(attr("stroke-width")), target: (attr("target") === 'volume' ? 'volume' : 'candle') as 'candle' | 'volume' };
        const ds = attr("date-start"), de = attr("date-end");
        if (ds && de) {
          shapes.push({ type: 'rect-date', dateStart: ds, dateEnd: de, ...base });
          return;
        }
        // start-x/start-y/end-x/end-y 또는 x/y/width/height
        const sx = num(attr("start-x")), sy = num(attr("start-y"));
        const ex = num(attr("end-x")), ey = num(attr("end-y"));
        const x = sx || num(attr("x"));
        const y = sy || num(attr("y"));
        const width = (ex && sx) ? ex - sx : num(attr("width"));
        const height = (ey && sy) ? ey - sy : num(attr("height"));
        shapes.push({ type: "rect", x, y, width, height, ...base });
      });
      this.querySelectorAll(":scope > arc").forEach((el) => {
        const attr = (n: string) => el.getAttribute(n);
        shapes.push({
          type: "arc",
          x: num(attr("x")), y: num(attr("y")), r: num(attr("r") || attr("radius")),
          start: num(attr("start") || attr("start-angle")), end: num(attr("end") || attr("end-angle")),
          fill: attr("fill") || attr("fill-style") || undefined,
          stroke: attr("stroke") || attr("stroke-style") || undefined,
          strokeWidth: num(attr("stroke-width")),
        });
      });
      this.shapes = shapes;
    }

    // tick 자식 요소 변경(추가/삭제/속성) 시 재수집 후 다시 그림
    // 셀렉터 생략 → $this(host, light DOM) observe
    @mutationObserverLight({ childList: true, attributes: true, subtree: true })
    private onTicksMutated(matchedEls: HTMLElement[]): void {
      this.collectFromTicks();
      this.collectFromShapes();
      if (this.chartCanvas && this.points.length > 0) {
        if (!this.viewInitDone) {
          const n = this.points.length;
          this.viewStart = 0;
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
        this.viewStart = 0;
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

    @eventShadow('#stock-chart-canvas', 'wheel', { passive: false })
    private onWheel(e: WheelEvent): void {
      if (this.disabledEvent) return;
      if (!this.controlsEnabled) return;
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

    @eventShadow('#stock-chart-canvas', 'mousedown')
    private onMouseDown(e: MouseEvent): void {
      if (this.disabledEvent) return;
      if (!this.controlsEnabled && !this.readoutEnabled) return;
      this.dragging = true;
      this.dragLastX = e.clientX;
      this.downX = e.clientX;
      this.downY = e.clientY;
    }

    @eventWindow('mouseup')
    private onMouseUp(e: MouseEvent): void {
      if (this.disabledEvent) return;
      if (!this.dragging) return;
      // touchend 후 300ms 이내에 발생하는 합성 mouseup은 무시
      // (모바일에서 팝업이 열리자마자 닫히는 현상 방지)
      if (Date.now() - this.lastTouchEndTime < 350) return;
      this.dragging = false;
      const moved =
        Math.abs(e.clientX - this.downX) + Math.abs(e.clientY - this.downY);
      if (this.readoutEnabled && moved < 5) {
        const idx = this.indexAtX(e.clientX);
        this.selectedIdx = idx === this.selectedIdx ? -1 : idx;
        this.drawChart();
      }
    }

    @eventShadow('#stock-chart-canvas', 'mousemove')
    private onMouseMove(e: MouseEvent): void {
      if (this.disabledEvent) return;
      if (this.controlsEnabled && this.dragging) {
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

    @eventShadow('#stock-chart-canvas', 'touchstart', { passive: false })
    private onTouchStart(e: TouchEvent): void {
      if (this.disabledEvent) return;
      if (!this.controlsEnabled && !this.readoutEnabled) return;
      const touches = e.touches;
      if (touches.length === 2) {
        // 핀치 줌: 스크롤 막고 핀치 처리
        e.preventDefault();
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
        // 1터치: 드래그 여부는 touchmove에서 판단하므로 여기선 preventDefault 안 함
        this.dragging = true;
        this.dragLastX = touches[0].clientX;
        this.downX = touches[0].clientX;
        this.downY = touches[0].clientY;
      }
    }

    @eventShadow('#stock-chart-canvas', 'touchmove', { passive: false })
    private onTouchMove(e: TouchEvent): void {
      if (this.disabledEvent) return;
      if (!this.controlsEnabled) return;
      const touches = e.touches;
      if (touches.length === 2 && this.pinchDist0 > 0) {
        // 핀치 줌: 항상 스크롤 막음
        e.preventDefault();
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
        const dy = touches[0].clientY - this.downY;
        // 수평 이동이 수직보다 클 때만 차트 드래그로 처리 (스크롤 방해 안 함)
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) >= 1) {
          e.preventDefault();
          this.viewStart += -dx / candleW;
          this.viewEnd += -dx / candleW;
          this.clampView();
          this.dragLastX = touches[0].clientX;
          this.drawChart();
        }
      }
    }

    @eventShadow('#stock-chart-canvas', 'touchend')
    private onTouchEnd(e: TouchEvent): void {
      if (this.disabledEvent) return;
      const moved =
        Math.abs(e.changedTouches[0].clientX - this.downX) +
        Math.abs(e.changedTouches[0].clientY - this.downY);
      const wasPinch = this.pinchDist0 > 0;
      this.pinchDist0 = 0;
      // 모바일은 손가락 접촉면이 넓어 자연스럽게 수 px 이동이 발생하므로 임계값을 10으로 설정
      if (this.readoutEnabled && this.dragging && !wasPinch && moved < 10) {
        const idx = this.indexAtX(e.changedTouches[0].clientX);
        this.selectedIdx = idx === this.selectedIdx ? -1 : idx;
        this.drawChart();
      }
      this.dragging = false;
      // touchend 후 합성 mouseup/mousedown 이벤트가 약 300ms 뒤에 발생함
      // → 그 사이에 mouseup 핸들러가 팝업을 닫지 못하도록 타임스탬프 기록
      this.lastTouchEndTime = Date.now();
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
        padT = 26;
      // 라벨 숨김 시 해당 여백을 그래프로 확장
      const padR = this.hiddenYLabel ? 8 : this.padR;
      const axisH = this.hiddenXLabel ? 6 : 18;
      const gap = this.hiddenVolume ? 0 : 4;
      // 캔들:볼륨 = 7:3
      const plotH = H - padT - axisH - gap;
      const volH = this.hiddenVolume ? 0 : Math.max(8, plotH * 0.3);
      const priceH = plotH - volH;
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
        if (!this.hiddenYLabel) {
          ctx.fillStyle = "#98a2b3";
          ctx.textAlign = "left";
          ctx.fillText(p.toLocaleString(), W - padR + 6, y);
        }
      }

      // 거래량 영역 라인 + y축 수치 라벨
      const volTop = padT + priceH + gap;
      const volPlotH = Math.max(0, volH - 6);
      if (!this.hiddenVolume) {
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
          if (!this.hiddenYLabel) {
            ctx.fillStyle = "#98a2b3";
            ctx.textAlign = "left";
            ctx.fillText(fmtVol(vv), W - padR + 6, vy);
          }
        }
        ctx.strokeStyle = "#f0f2f5";
        ctx.beginPath();
        ctx.moveTo(padL, volTop);
        ctx.lineTo(W - padR, volTop);
        ctx.stroke();
      }

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
        if (!this.hiddenVolume) {
          const vh = maxV > 0 ? (d.volume / maxV) * (volH - 6) : 0;
          ctx.globalAlpha = 0.55;
          ctx.fillRect(x - bodyW / 2, H - axisH - vh, bodyW, vh);
          ctx.globalAlpha = 1;
        }
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
      if (this.showMinMax) {
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
      }

      // 날짜 축
      if (!this.hiddenXLabel) {
        ctx.fillStyle = "#98a2b3";
        ctx.textAlign = "center";
        for (let i = 0; i < data.length; i += step) {
          const label = data[i].date.slice(5);
          ctx.fillText(label, xCandle(i), H - axisH / 2);
        }
      }

      // 마지막 종가 라인 (show-last-line 속성 있을 때만)
      if (this.showLastLine) {
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
      }

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
        if (!this.hiddenVolume && d.volume > 0) {
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
        // 초기 위치를 먼저 설정하고 표시 (깜빡임 방지)
        readout.style.left = `${Math.max(4, hx - 60)}px`;
        readout.style.top = `${Math.max(4, yPrice(d.high) - 48)}px`;
        readout.style.display = "flex";
        // 실제 크기가 렌더링된 이후 정확한 위치로 보정
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

      // 자식 <rect>/<arc> 도형 오버레이
      this.drawShapes(ctx, { data, xCandle, bodyW, yPrice, minP, maxP, volTop, H, axisH, padT });
    }

    private drawShapes(ctx: CanvasRenderingContext2D, c: { data: StockChartPoint[]; xCandle: (i: number) => number; bodyW: number; yPrice: (p: number) => number; minP: number; maxP: number; volTop: number; H: number; axisH: number; padT: number }): void {
      for (const s of this.shapes) {
        ctx.save();
        if (s.fill) ctx.fillStyle = s.fill;
        if (s.stroke) {
          ctx.strokeStyle = s.stroke;
          ctx.lineWidth = s.strokeWidth || 1;
        }
        if (s.type === 'rect-date') {
          const i0 = c.data.findIndex(d => d.date === s.dateStart);
          const i1 = c.data.findIndex(d => d.date === s.dateEnd);
          if (i0 < 0 || i1 < 0 || i1 < i0) continue;
          const x = c.xCandle(i0) - c.bodyW / 2;
          const w = c.xCandle(i1) + c.bodyW / 2 - x;
          let y: number, h: number;
          if (s.target === 'all') {
            // 가격 범위 최고점 ~ x축 (캔들+볼륨을 하나로)
            y = c.yPrice(c.maxP);
            h = (c.H - c.axisH) - y;
          } else if (s.target === 'volume') {
            // 거래량 영역 상단 ~ x축
            y = c.volTop;
            h = (c.H - c.axisH) - c.volTop;
          } else {
            // 캔들 가격 범위 (전체 max~min)
            y = c.yPrice(c.maxP);
            h = c.yPrice(c.minP) - y;
          }
          if (s.fill) ctx.fillRect(x, y, w, h);
          if (s.stroke) ctx.strokeRect(x, y, w, h);
        } else if (s.type === 'rect') {
          if (s.fill) ctx.fillRect(s.x, s.y, s.width, s.height);
          if (s.stroke) ctx.strokeRect(s.x, s.y, s.width, s.height);
        } else if (s.type === 'arc') {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, s.start, s.end);
          if (s.fill) ctx.fill();
          if (s.stroke) ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  return StockChartImpl;
};