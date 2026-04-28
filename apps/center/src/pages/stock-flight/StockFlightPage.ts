import {
  elementDefine,
  onConnectedShadow,
  addEventListener,
  onInitialize,
} from "@dooboostore/simple-web-component";
import { Router } from '@dooboostore/core-web';
import { inject, Sim } from "@dooboostore/simple-boot";
import { StockService } from '@center-src/services/stock/StockService';

const tagName = 'center-stock-flight-page';

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class StockFlightPage extends w.HTMLElement {
    private router!: Router;
    private stockService!: StockService;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private chartCanvas: HTMLCanvasElement | null = null;
    private chartCtx: CanvasRenderingContext2D | null = null;
    private selectedCode: string = "A000660";
    private currentPrice: number = 0;
    private strength: number = 50;
    private pitch: number = 0;
    private bank: number = 0;
    private updateInterval: number | null = null;
    private animationFrameId: number | null = null;
    private lastUpdateTime: number = 0;
    private targetPrice: number = 0;
    private targetStrength: number = 50;
    private targetPitch: number = 0;
    private targetBank: number = 0;
    private changePercent: number = 0; // 변동률 저장 (보간값)
    private targetChangePercent: number = 0; // 변동률 목표값 (candle 기준)
    private realCurrentPrice: number = 0; // 실제 현재 price 저장
    private lastCandleClose: number = 0;         // 마지막 candle close 보간값
    private targetLastCandleClose: number = 0;   // 마지막 candle close 목표값
    private previousPrice: number = 0; // 이전 가격 (PITCH 계산용)
    private handleCanvasResize: () => void = () => this.resizeCanvas();
    private handleChartCanvasResize: () => void = () => this.resizeChartCanvas();

    // Chart 애니메이션용 변수 (현재값 보간)
    private animatedCurrentPrice: number = 0;
    private targetCurrentPrice: number = 0;
    private animatedCurrentChange: number = 0;
    private targetCurrentChange: number = 0;
    private animatedCurrentVolume: number = 0;
    private targetCurrentVolume: number = 0;
    private animatedCurrentVolumeChange: number = 0;
    private targetCurrentVolumeChange: number = 0;

    // VCHG 기준값 (새 캔들 시작 시 리셋)
    private _baselineVolumeForChange: number = 0;
    private _lastCandleTime: string = "";

    // history buffers for traces (newest at index 0)
    private priceHistory: number[] = [];
    private pchgHistory: number[] = [];
    private vchgHistory: number[] = [];
    private strHistory: number[] = [];
    private volHistory: number[] = [];
    private _sampleInterval: number | null = null;
    // configurable sampling parameters (defaults)
    private sampleIntervalMs: number = 500; // 0.5s
    private sampleMaxCount: number = 50; // keep latest N samples

     // 차트 가격 범위 보간 (눈금 부드럽게)
     private animatedChartMaxP: number = 0;
     private animatedChartMinP: number = 0;
     private animatedChartMaxVol: number = 0;
     private _targetChartMaxP: number = 0;
     private _targetChartMinP: number = 0;
     private _targetChartMaxVol: number = 0;

     // VCHG 눈금 보간 (scale smooth)
     private animatedChangeRateForScale: number = 0;
     private targetChangeRateForScale: number = 0;

     // VCHG 계산용: 이전 초 volume
     private _prevTickVolume: number = 0;
    private _lastTickVolume: number = 0;
    // timestamp for throttling VOL debug logs
    private _lastVolDbgLogTs: number = 0;

    private strengthToBank(strength: number): number {
      return Math.max(-30, Math.min(30, (strength - 100) * 0.3));
    }

    @onInitialize
    onInitialized(
      router: Router,
      @inject(StockService.SYMBOL) stockService: StockService,
    ): void {
      this.router = router;
      this.stockService = stockService;
    }

    @onConnectedShadow
    render() {
      return `
        <style>
          *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

           :host {
             display: block;
             width: 100%;
             height: 100%;
             background: #1a1a1a;
             font-family: var(--font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
             color: #fff;
           }

           .container {
             display: flex;
             flex-direction: column;
             width: 100%;
             height: 100%;
             overflow: hidden;
           }

           .header {
             position: relative;
             display: flex;
             align-items: center;
             gap: 12px;
             padding: 0 120px 0 8px; /* top right bottom left - use vertical centering via absolute children */
             background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
             color: white;
             border-bottom: 1px solid rgba(0, 0, 0, 0.1);
             flex-shrink: 0;
             height: 72px;
           }

           .header-back {
             background: rgba(255, 255, 255, 0.2);
             border: none;
             color: white;
             width: 40px;
             height: 40px;
             border-radius: 8px;
             cursor: pointer;
             display: flex;
             align-items: center;
             justify-content: center;
             font-size: 20px;
             transition: all 0.2s ease;
             outline: none;
           }

           .header-back:hover {
             background: rgba(255, 255, 255, 0.3);
           }

           .header-back:focus-visible {
             box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.3);
           }

            .header-left {
              position: absolute;
              left: 8px;
              top: 50%;
              transform: translateY(-50%);
              display: flex;
              align-items: center;
              gap: 8px;
            }

            .live-badge {
              display: flex;
              flex-direction: column;
              gap: 4px;
              padding: 6px 8px;
              background: rgba(0,0,0,0.22); /* 약간 반투명하여 검정 밴드 침범 최소화 */
              border-radius: 8px;
              min-width: 90px;
              color: #fff;
              font-size: 12px;
              line-height: 1;
            }

            .live-row {
              display: flex;
              align-items: center;
              gap: 6px;
            }

            .live-label {
              color: #00B050;
              font-weight: 700;
              min-width: 18px;
              text-align: left;
            }

           .header-title {
             position: absolute;
             left: 50%;
             transform: translateX(-50%);
             font-size: 24px;
             font-weight: 700;
             white-space: nowrap;
           }

           /* 숨기면 우측은 비어있음(여백 유지) */
           .header .stock-select,
           .header > img {
             display: none;
           }

           .header-subtitle {
             font-size: 12px;
             opacity: 0.8;
           }

            .content {
              height: calc(100vh - 72px);
              display: flex;
              flex-direction: column;
              width: 100%;
              overflow: hidden;
              padding: 0;
            }

            .content > .gauge-container {
              height: 50%;
              width: 100%;
              min-height: 0;
            }

            .content > .chart-container {
              height: 50%;
              width: 100%;
              min-height: 0;
            }

            .gauge-container {
              display: flex;
              align-items: stretch;
              justify-content: stretch;
              width: 100%;
              height: 100%;
              margin: 0;
              position: relative; /* for overlay badge positioning */
            }

            .chart-container {
              width: 100%;
              height: 100%;
              margin-top: 0;
              background: #0a0a0a;
              border-top: 1px solid #333;
              overflow: hidden;
            }

            #attitudeCanvas {
              width: 100%;
              height: 100%;
              display: block;
              flex: 1;
            }

            .gauge-overlay-badge {
              position: absolute;
              top: 8px;
              left: 8px;
              z-index: 15;
              pointer-events: none;
              display: flex;
              flex-direction: column;
              gap: 4px;
              padding: 6px 10px;
              background: rgba(0,0,0,0.28);
              border-radius: 8px;
              color: #fff;
              font-size: 13px;
            }

            #chartCanvas {
              width: 100%;
              height: 100%;
              display: block;
            }

          @media (max-width: 600px) {
            .header-title {
              font-size: 18px;
            }

            .header-subtitle {
              font-size: 11px;
            }

            .stock-select {
              padding: 6px 8px;
              font-size: 12px;
            }
          }
        </style>

        <div class="container">
          <div class="header">
            <div class="header-left">
              <button class="header-back" aria-label="Go back">
                ←
              </button>

              
            </div>
            <div>
              <div class="header-title">Stock Flight</div>
            </div>
            <select class="stock-select" id="stockSelect" style="margin-left: auto;">
              <option value="A000660">삼성전자 (A000660)</option>
              <option value="A000831">SK하이닉스 (A000831)</option>
            </select>
            <img src="https://hits.sh/dooboostore.github.io/stock-flight.svg?style=plastic" alt="Hits" style="height: 20px; align-self: center;" />
          </div>

          <div class="content">
            <div class="gauge-container">
              <canvas id="attitudeCanvas" width="400" height="400"></canvas>
              
            </div>

            <div class="chart-container">
              <canvas id="chartCanvas"></canvas>
            </div>
          </div>
        </div>
      `;
    }

    connectedCallback() {
      // Canvas 초기화
      this.canvas = this.shadowRoot?.querySelector(
        "#attitudeCanvas",
      ) as HTMLCanvasElement;
      if (this.canvas) {
        this.ctx = this.canvas.getContext("2d");
        this.resizeCanvas();
        w.addEventListener("resize", this.handleCanvasResize);
      }

      // Chart Canvas 초기화
      this.chartCanvas = this.shadowRoot?.querySelector(
        "#chartCanvas",
      ) as HTMLCanvasElement;
      if (this.chartCanvas) {
        this.chartCtx = this.chartCanvas.getContext("2d");
        this.resizeChartCanvas();
        w.addEventListener("resize", this.handleChartCanvasResize);
      }

      // 0.5초마다 데이터 업데이트
      this.updateInterval = w.setInterval(() => {
        this.updateData();
      }, 500) as any;

      // start sampler (separate interval)
      this.startSampler();

      // 보간 변수들을 실제 데이터로 즉시 초기화 (0에서 튀는 현상 방지)
      this.initializeFromService();

      // requestAnimationFrame으로 부드러운 애니메이션
      this.startAnimation();

      // 초기 데이터 로드
      this.updateData();
    }

    disconnectedCallback() {
      if (this.updateInterval) {
        w.clearInterval(this.updateInterval);
      }
      if (this._sampleInterval) {
        w.clearInterval(this._sampleInterval);
      }
      if (this.animationFrameId) {
        w.cancelAnimationFrame(this.animationFrameId);
      }
      w.removeEventListener("resize", this.handleCanvasResize);
      w.removeEventListener("resize", this.handleChartCanvasResize);
    }

    private startSampler(): void {
      // 0.5초마다 샘플 저장 (히스토리), 별도 interval로 분리
      this._sampleInterval = w.setInterval(() => {
        // newest at index 0
        this.priceHistory.unshift(
          this.targetCurrentPrice || this.targetPrice || 0,
        );
        this.pchgHistory.unshift(this.targetChangePercent || 0);
        this.vchgHistory.unshift(this.targetCurrentChange || 0);
        this.volHistory.unshift(this.targetCurrentVolume || 0);
        this.strHistory.unshift(
          this.targetStrength || this.targetStrength || 0,
        );
        if (this.priceHistory.length > this.sampleMaxCount)
          this.priceHistory.length = this.sampleMaxCount;
        if (this.pchgHistory.length > this.sampleMaxCount)
          this.pchgHistory.length = this.sampleMaxCount;
        if (this.vchgHistory.length > this.sampleMaxCount)
          this.vchgHistory.length = this.sampleMaxCount;
        if (this.volHistory.length > this.sampleMaxCount)
          this.volHistory.length = this.sampleMaxCount;
        if (this.strHistory.length > this.sampleMaxCount)
          this.strHistory.length = this.sampleMaxCount;
      }, this.sampleIntervalMs) as any;
    }
    /**
     * 보간 변수 전체를 StockService의 현재 데이터로 즉시 초기화.
     * 0에서 실제값으로 튀는 현상을 방지한다.
     */
    private initializeFromService(): void {
      if (!this.stockService) return;

      const code = this.selectedCode;
      const current      = this.stockService.getCurrent(code);
      const currentCandle = this.stockService.getCurrentCandle(code);
      const lastCandle   = this.stockService.getMinLastCompleteCandle(code);

      const price    = current.price    || lastCandle.close || 0;
      const strength = current.strength || 50;
      const volume   = currentCandle.volume || 0;

      // target 값 세팅
      this.targetPrice              = price;
      this.targetStrength           = strength;
      this.targetCurrentPrice       = price;
      this.targetCurrentVolume      = volume;
      this.targetCurrentChange      = 0;
      this.targetCurrentVolumeChange = 0;
      this.targetChangePercent      = 0;
      this.targetPitch              = 0;
      this.targetBank               = this.strengthToBank(strength);
      this.targetLastCandleClose    = lastCandle.close || price;
      this.targetChangeRateForScale = 0;

      // 보간 현재값도 동일하게 즉시 세팅 (lerp 시작점 = 실제값)
      this.currentPrice              = price;
      this.strength                  = strength;
      this.pitch                     = 0;
      this.bank                      = this.targetBank;
      this.changePercent             = 0;
      this.lastCandleClose           = lastCandle.close || price;
      this.animatedCurrentPrice      = price;
      this.animatedCurrentChange     = 0;
      this.animatedCurrentVolume     = volume;
      this.animatedCurrentVolumeChange = 0;
      this.animatedChangeRateForScale = 0;
      this.previousPrice             = price;
      this.realCurrentPrice          = price;
      this._prevTickVolume           = volume;

      // 차트 범위도 candles 기반으로 즉시 초기화
      const candles = this.stockService.getMinCandles(code, 80).candles;
      if (candles.length > 0) {
        const highs  = candles.map(c => c.high);
        const lows   = candles.map(c => c.low);
        const vols   = candles.map(c => c.volume);
        this.animatedChartMaxP   = this._targetChartMaxP   = Math.max(...highs);
        this.animatedChartMinP   = this._targetChartMinP   = Math.min(...lows);
        this.animatedChartMaxVol = this._targetChartMaxVol = Math.max(...vols) || 1;
      }

      // debug log removed to reduce console noise
    }

     private startAnimation(): void {
      const LERP = 1 / 30; // 보간을 조금 더 빠르게 해서 밴드 지연을 줄임

       const animate = (timestamp: number) => {
         const lerp = (cur: number, target: number): number => {
           const diff = target - cur;
           if (Math.abs(diff) < 0.001) return target;
           return cur + diff * LERP;
         };

         this.currentPrice  = lerp(this.currentPrice,  this.targetPrice);
         this.strength      = lerp(this.strength,      this.targetStrength);
         this.pitch         = lerp(this.pitch,         this.targetPitch);
         this.bank          = lerp(this.bank,          this.targetBank);
         this.changePercent = lerp(this.changePercent, this.targetChangePercent);
         this.lastCandleClose = lerp(this.lastCandleClose, this.targetLastCandleClose);

          this.animatedCurrentPrice        = lerp(this.animatedCurrentPrice,        this.targetCurrentPrice);
          this.animatedCurrentChange       = lerp(this.animatedCurrentChange,        this.targetCurrentChange);
          this.animatedCurrentVolume       = lerp(this.animatedCurrentVolume,        this.targetCurrentVolume);
          this.animatedCurrentVolumeChange = lerp(this.animatedCurrentVolumeChange,  this.targetCurrentVolumeChange);

          // VCHG 눈금도 smooth하게
          this.animatedChangeRateForScale = lerp(this.animatedChangeRateForScale, this.targetChangeRateForScale);

          if (this.animatedChartMaxP > 0) {
            this.animatedChartMaxP   = lerp(this.animatedChartMaxP,   this._targetChartMaxP);
            this.animatedChartMinP   = lerp(this.animatedChartMinP,   this._targetChartMinP);
            this.animatedChartMaxVol = lerp(this.animatedChartMaxVol, this._targetChartMaxVol);
          }

         this.updateUI();
         this.drawAttitudeIndicator();
         this.drawChart();
         this.animationFrameId = w.requestAnimationFrame(animate);
       };

       this.animationFrameId = w.requestAnimationFrame(animate);
     }

    private resizeCanvas(): void {
      if (!this.canvas || !this.canvas.parentElement) return;

      const container = this.canvas.parentElement;
      const width = container.clientWidth;
      const height = container.clientHeight;
      
      // Canvas의 논리적 크기를 CSS 크기와 일치시킴
      this.canvas.width = width;
      this.canvas.height = height;
      
      // Resize 후 다시 그리기
      this.drawAttitudeIndicator();
    }

    private updateData(): void {
      if (!this.stockService) return;

      try {
        // 현재 가격과 체결강도 조회
        const current = this.stockService.getCurrent(this.selectedCode);
        
        // Real Price/Strength are rendered on canvas; header badges removed.
        
        // 목표 값 설정 (애니메이션이 이 값으로 부드럽게 변경)
        this.targetPrice = current.price;
        this.targetStrength = current.strength;
        this.realCurrentPrice = this.stockService.getCurrentPrice(this.selectedCode);

        // 마지막 candle의 close값과 현재 price로 pitch 계산
        const lastCandle = this.stockService.getMinLastCompleteCandle(this.selectedCode);
        if (lastCandle) {
          // 직접 대입 대신 target에 저장 → startAnimation에서 보간
          if (this.targetLastCandleClose === 0) {
            this.targetLastCandleClose = lastCandle.close;
            this.lastCandleClose = lastCandle.close;
          } else {
            this.targetLastCandleClose = lastCandle.close;
          }
          
          // ★ PITCH: 이전 가격 대비 현재 가격의 실시간 변화율
          // 초기값이면 이전가격 = 현재가격으로 설정
          if (this.previousPrice === 0) {
            this.previousPrice = current.price;
          }
          
          this.targetChangePercent = ((current.price - this.previousPrice) / this.previousPrice) * 100;
          this.targetPitch = Math.max(-30, Math.min(30, this.targetChangePercent * 30)); // -30 ~ 30도
          
          // 다음 계산을 위해 이전 가격 업데이트
          this.previousPrice = current.price;
          
          // 변동률 표시
          // change percent shown on canvas tapes; header badges removed.

          // 마지막 candle 데이터 표시
          const lastCandleCloseDisplay = this.shadowRoot?.querySelector(
            "#lastCandleCloseDisplay",
          ) as HTMLElement;
          const lastCandleTimeDisplay = this.shadowRoot?.querySelector(
            "#lastCandleTimeDisplay",
          ) as HTMLElement;

          if (lastCandleCloseDisplay) {
            lastCandleCloseDisplay.textContent = lastCandle.close.toLocaleString();
          }

          if (lastCandleTimeDisplay) {
            lastCandleTimeDisplay.textContent = lastCandle.dt;
          }
        }

        // Bank는 STR 기준으로 계산한다. 100이면 0도, 100 초과면 양수, 100 미만이면 음수.
        this.targetBank = this.strengthToBank(current.strength);

        // Chart 애니메이션 목표값 설정
        const currentCandle = this.stockService.getCurrentCandle(this.selectedCode);
        this.targetCurrentPrice = current.price;

        // VCHG: 바로 이전 tick vol 대비 현재 tick vol 변화율
        this.targetCurrentVolume = currentCandle.volume;

        // 새 캔들 감지: 롤오버 순간에는 이전 tick 기준을 끊어서 VCHG가 튀지 않게 한다.
        const currentCandleTime = currentCandle.dt || "";
        const isNewCandle = currentCandleTime !== this._lastCandleTime;
        const currentVol = currentCandle.volume;

        // preserve previous tick volume for rendering decisions
        this._lastTickVolume = this._prevTickVolume;

        if (isNewCandle) {
          this._baselineVolumeForChange = currentVol;
          this._prevTickVolume = currentVol;
          this._lastCandleTime = currentCandleTime;
          this.targetCurrentChange = 0;
        } else if (this._prevTickVolume > 0 && currentVol > this._prevTickVolume) {
          // VCHG: 바로 이전 tick vol 대비 현재 tick vol 변화율
          this.targetCurrentChange = Math.min(100, ((currentVol - this._prevTickVolume) / this._prevTickVolume) * 100);
          this._prevTickVolume = currentVol;
        } else {
          // 이전 volume보다 작거나 같으면 0으로 유지
          this.targetCurrentChange = 0;
          this._prevTickVolume = currentVol;
        }

        this.targetChangeRateForScale = this.targetCurrentChange;
         
         // 초기값 설정 (첫 로드 시)
         if (this._baselineVolumeForChange === 0) {
           this._baselineVolumeForChange = currentCandle.volume;
         }
         
         // 현재 volume과 기준값의 변화율 (0~100% 범위)
         let volumeChangePercent = 0;
         if (this._baselineVolumeForChange > 0) {
           volumeChangePercent = ((currentCandle.volume - this._baselineVolumeForChange) / this._baselineVolumeForChange) * 100;
         }
         // 0~100% 범위로 정규화 (음수는 0으로, 100% 초과는 100%로)
         this.targetCurrentVolumeChange = Math.max(0, Math.min(100, volumeChangePercent));

        // 애니메이션 시작 시간 업데이트
        this.lastUpdateTime = Date.now();

        this.resizeChartCanvas();
      } catch (e) {
        console.error("[StockFlightPage] Error updating data:", e);
      }
    }

    private updateUI(): void {
      const priceDisplay = this.shadowRoot?.querySelector(
        "#priceDisplay",
      ) as HTMLElement;
      const strengthDisplay = this.shadowRoot?.querySelector(
        "#strengthDisplay",
      ) as HTMLElement;
      const pitchDisplay = this.shadowRoot?.querySelector(
        "#pitchDisplay",
      ) as HTMLElement;
      const bankDisplay = this.shadowRoot?.querySelector(
        "#bankDisplay",
      ) as HTMLElement;

      if (priceDisplay) {
        priceDisplay.textContent = this.currentPrice.toLocaleString();
      }

      if (strengthDisplay) {
        strengthDisplay.textContent = this.strength.toString();
        strengthDisplay.className =
          "info-value " +
          (this.strength >= 50 ? "strength-buy" : "strength-sell");
      }

      if (pitchDisplay) {
        pitchDisplay.textContent = this.pitch.toFixed(1) + "°";
      }

      if (bankDisplay) {
        bankDisplay.textContent = this.bank.toFixed(1) + "°";
      }
    }

    private drawAttitudeIndicator(): void {
      if (!this.ctx || !this.canvas) return;

      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const ctx = this.ctx;

      // 전체 배경
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cw, ch);

      // ── 레이아웃 계산 ──────────────────────────────────────────
      // [VOL tape] [AI center] [PRICE tape]
      // [VCHG tape] [STR tape row under AI] [PRICE tape]
      const mainH = ch;
      // AI(자세)와 STR 영역을 위:아래 = 8:2 비율로 설정
      const topH = Math.floor(mainH * 0.8);
      const bottomH = mainH - topH;

      const gaugeW = Math.min(cw * 0.18, mainH * 0.52);
      const altW   = cw * 0.15;
      const gap    = 6;
      const aiX    = gaugeW + gap;
      const aiW    = cw - gaugeW - altW - gap * 3;
      const rightX = aiX + aiW + gap;

      // 우측 컬럼에서 PRICE와 PCHG가 각각 절반씩 공간을 차지하도록 계산
      // 상하 그래프 사이에 검정색 간격을 두기 위해 gap을 삽입
      const rightGap = Math.max(4, Math.round(mainH * 0.02)); // 최소 4px 또는 전체 높이의 2%
      const rightTopH = Math.floor(mainH / 2) - Math.floor(rightGap / 2);
      const rightBottomH = mainH - (rightTopH + rightGap);

      // left column split (VOL / VCHG) — add a small black gap similar to the right column
      const leftGap = Math.max(4, Math.round(mainH * 0.02)); // 최소 4px 또는 전체 높이의 2%
      const leftTopH = Math.floor(mainH / 2) - Math.floor(leftGap / 2);
      const leftBottomH = mainH - (leftTopH + leftGap);

      // ── 0. 왼쪽 테이프 (VOL 위, VCHG 아래) ──────────────────
      // VOL/VCHG 테이프들도 포인터 박스를 왼쪽에 정렬
      this.drawSpeedTape(ctx,  0, 0,        gaugeW, leftTopH, 'left');
      // 상하 그래프 사이에 검정색 간격을 둠 (좌측 컬럼)
      ctx.fillStyle = "#000";
      ctx.fillRect(0, leftTopH, gaugeW, leftGap);
      this.drawChangeTape(ctx, 0, leftTopH + leftGap, gaugeW, leftBottomH);

      // ── 1. Attitude Indicator (중앙, 상단) ───────────────────
      this.drawAI(ctx, aiX, 0, aiW, topH);

      // ── 2. PRICE tape (오른쪽 상단) + PCHG (오른쪽 하단, VCHG처럼) ─────────
      // PRICE를 상단에 그리고 하단에는 PCHG 원형 계기판을 배치
      this.drawAltTape(ctx, rightX, 0, altW, rightTopH, 'left');
      // 상하 그래프 사이에 검정색 간격 그리기
      ctx.fillStyle = "#000";
      ctx.fillRect(rightX, rightTopH, altW, rightGap);
      // PCHG를 VCHG와 동일한 PRICE 스타일 테이프 형태로 표시
      this.drawPriceStyleTape(ctx, rightX, rightTopH + rightGap, altW, rightBottomH, {
        label: "PCHG",
        inlineValue: false,
        value: this.changePercent,
        step: 1,
        subStep: 0.5,
        valueColor: this.changePercent >= 0 ? "#ffffff" : "#ffffff",
        headerStrokeColor: this.changePercent >= 0 ? "#4caf50" : "#f44336",
        pointerFillColor: this.changePercent >= 0 ? "#4caf50" : "#f44336",
        currentValueFormatter: (val: number) => `${val.toFixed(2)}%`,
        tickFormatter: (val: number) => `${val.toFixed(1)}%`,
        visibleSteps: 5,
        history: this.pchgHistory,
        headerPosition: 'top',
        pointerAlign: 'left',
      });

      // ── 3. STR Tape row (AI width below) — use same gap as left column (VOL/VCHG)
      // ensure the black band matches the VOL/VCHG separation
      const strGap = leftGap;
      ctx.fillStyle = "#000";
      ctx.fillRect(aiX, topH, aiW, strGap);
      // STR gauge 먼저 그리고, 라벨은 나중에 오버레이하여 뒤에 가려지지 않게 함
      this.drawRoundGaugeSTR(ctx, aiX, topH + strGap, aiW, bottomH - strGap);
    }

    /** VOL 원형 계기판 (ALT 스타일 - 위쪽) */
    private drawRoundGaugeVOL(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
      const volume = this.animatedCurrentVolume;
      const displayVol = volume / 1000; // K 단위

      // 이전 캔들 volume (비교 기준)
      const lastCandle = this.stockService?.getMinLastCompleteCandle(this.selectedCode);
      const prevVolK = (lastCandle?.volume || 0) / 1000;

      // 계기판 중심 및 반지름 (헤더 공간 고려해 중심을 약간 아래로 이동)
      const cx = x + w / 2;
      const cy = y + h / 2 + 8;
      const r = Math.min(w, h) * 0.42;

      // 배경
      ctx.fillStyle = "#111";
      ctx.fillRect(x, y, w, h);

      // 외곽 베젤 (금속 느낌)
      const grad = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 1.05);
      grad.addColorStop(0, "#555");
      grad.addColorStop(0.5, "#888");
      grad.addColorStop(1, "#333");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2);
      ctx.fill();

      // 계기판 검정 배경
      ctx.fillStyle = "#0a0a0a";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // 스케일 범위: 0 ~ maxVol (동적)
      const maxVol = Math.max(200, Math.ceil(displayVol / 50) * 50 + 50);

      // 눈금 각도: 7시(225°) → 5시(135°) 시계방향 (270° 범위)
      const startAngle = (225 * Math.PI) / 180;
      const totalAngle = (270 * Math.PI) / 180;

      const valToAngle = (val: number) => startAngle + (val / maxVol) * totalAngle;

      // 채움 호 (0 → 현재값, 초록)
      ctx.strokeStyle = "rgba(0,176,80,0.35)";
      ctx.lineWidth = r * 0.12;
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.78, startAngle, valToAngle(displayVol));
      ctx.stroke();

      // 눈금 그리기
      const mainStep = maxVol <= 200 ? 50 : 100;
      const subStep  = mainStep / 5;
      ctx.save();
      for (let val = 0; val <= maxVol; val += subStep) {
        const angle = valToAngle(val);
        const isMain = val % mainStep === 0;
        const tickOuter = r * 0.97;
        const tickInner = isMain ? r * 0.80 : r * 0.88;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = isMain ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * tickInner, cy + Math.sin(angle) * tickInner);
        ctx.lineTo(cx + Math.cos(angle) * tickOuter, cy + Math.sin(angle) * tickOuter);
        ctx.stroke();

        if (isMain) {
          const labelR = r * 0.68;
          ctx.fillStyle = "#ddd";
          ctx.font = `bold ${Math.max(8, r * 0.16)}px Arial`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const label = val >= 1000 ? (val / 1000).toFixed(0) + "K" : val.toString();
          ctx.fillText(label, cx + Math.cos(angle) * labelR, cy + Math.sin(angle) * labelR);
        }
      }
      ctx.restore();

      // 이전 캔들 volume 마커 (마젠타 삼각형)
      if (prevVolK > 0 && prevVolK <= maxVol) {
        const angle = valToAngle(prevVolK);
        ctx.fillStyle = "#ff00ff";
        ctx.save();
        ctx.translate(cx + Math.cos(angle) * r * 0.90, cy + Math.sin(angle) * r * 0.90);
        ctx.rotate(angle + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -5); ctx.lineTo(-3, 3); ctx.lineTo(3, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 바늘 (rotate 기준: 3시=0°이므로 바늘을 오른쪽으로 그림)
      const needleAngle = valToAngle(Math.min(displayVol, maxVol));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(needleAngle);
      // 바늘은 오른쪽(+X) 방향 기준으로 그림
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-r * 0.12, 0);
      ctx.lineTo(r * 0.82, 0);
      ctx.stroke();
      // 바늘 꼬리
      ctx.strokeStyle = "#aaa";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.12, 0);
      ctx.lineTo(-r * 0.22, 0);
      ctx.stroke();
      ctx.restore();

      // 중심 캡
      ctx.fillStyle = "#555";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#999";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.04, 0, Math.PI * 2);
      ctx.fill();

      // header: label only to match PRICE/PCHG layout
      const volHeaderY = y + 8;
      ctx.fillStyle = "#00B050";
      ctx.font = `bold ${Math.max(8, r * 0.14)}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("VOL", x + w / 2, volHeaderY);
    }

    /** PCHG 원형 계기판 (VSI 스타일 - 양수/음수, 오른쪽 위) */
    private drawRoundGaugePCHG(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
      const pchg = this.changePercent; // 보간된 변동률 (양수/음수)

      const cx = x + w / 2;
      const cy = y + h / 2;
      const r  = Math.min(w, h) * 0.42;

      // 배경
      ctx.fillStyle = "#111";
      ctx.fillRect(x, y, w, h);

      // 베젤
      const grad = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 1.05);
      grad.addColorStop(0, "#555");
      grad.addColorStop(0.5, "#888");
      grad.addColorStop(1, "#333");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2);
      ctx.fill();

      // 계기판 배경
      ctx.fillStyle = "#0a0a0a";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // 스케일: 9시(180°)가 0, 왼쪽 절반이 음수, 오른쪽 절반이 양수
      // 7시(225°) → 5시(135°) 270° 범위, 중앙(12시=270°)이 0
      const maxAbs  = Math.max(1, Math.ceil(Math.abs(pchg) / 0.5) * 0.5 + 0.5);
      const midAngle   = (270 * Math.PI) / 180; // 12시 = 0 기준
      const totalAngle = (135 * Math.PI) / 180; // 양쪽 각각 135°

      // val → angle: 음수는 왼쪽(반시계), 양수는 오른쪽(시계)
      const valToAngle = (val: number) => midAngle + (val / maxAbs) * totalAngle;

      // 채움 호 (0 → 현재값)
      const fillColor = pchg >= 0 ? "rgba(0,176,80,0.4)" : "rgba(255,50,50,0.4)";
      ctx.strokeStyle = fillColor;
      ctx.lineWidth   = r * 0.12;
      ctx.lineCap     = "butt";
      if (Math.abs(pchg) > 0.001) {
        const startA = pchg >= 0 ? midAngle : valToAngle(pchg);
        const endA   = pchg >= 0 ? valToAngle(pchg) : midAngle;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.78, startA, endA);
        ctx.stroke();
      }

      // 눈금
      const mainStep = maxAbs <= 1 ? 0.5 : maxAbs <= 3 ? 1 : 2;
      const subStep  = mainStep / 5;
      ctx.save();
      for (let val = -maxAbs; val <= maxAbs + subStep * 0.5; val += subStep) {
        // 부동소수점 오차 제거: 가장 가까운 subStep 배수로 반올림
        const roundedVal = Math.round(val / subStep) * subStep;
        const angle   = valToAngle(roundedVal);
        const isMain  = Math.round(roundedVal / mainStep * 10) % 10 === 0;
        const isZero  = Math.abs(roundedVal) < subStep * 0.1;
        const tickOuter = r * 0.97;
        const tickInner = isMain ? r * 0.80 : r * 0.88;

        ctx.strokeStyle = isZero ? "#fff" : "#ccc";
        ctx.lineWidth   = isMain ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * tickInner, cy + Math.sin(angle) * tickInner);
        ctx.lineTo(cx + Math.cos(angle) * tickOuter, cy + Math.sin(angle) * tickOuter);
        ctx.stroke();

        if (isMain) {
          const labelR = r * 0.66;
          ctx.fillStyle = isZero ? "#fff" : (roundedVal > 0 ? "#4caf50" : "#f44336");
          ctx.font = `bold ${Math.max(7, r * 0.15)}px Arial`;
          ctx.textAlign    = "center";
          ctx.textBaseline = "middle";
          const label = isZero ? "0" : (roundedVal > 0 ? "+" : "") + roundedVal.toFixed(1);
          ctx.fillText(label, cx + Math.cos(angle) * labelR, cy + Math.sin(angle) * labelR);
        }
      }
      ctx.restore();

      // 0 기준선 강조
      ctx.strokeStyle = "#fff";
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(midAngle) * r * 0.80, cy + Math.sin(midAngle) * r * 0.80);
      ctx.lineTo(cx + Math.cos(midAngle) * r * 0.97, cy + Math.sin(midAngle) * r * 0.97);
      ctx.stroke();

      // 바늘
      const needleAngle = valToAngle(Math.max(-maxAbs, Math.min(maxAbs, pchg)));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(needleAngle);
      ctx.strokeStyle = pchg >= 0 ? "#4caf50" : "#f44336";
      ctx.lineWidth   = 2.5;
      ctx.lineCap     = "round";
      ctx.beginPath();
      ctx.moveTo(-r * 0.12, 0);
      ctx.lineTo(r * 0.82, 0);
      ctx.stroke();
      ctx.strokeStyle = "#aaa";
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.12, 0);
      ctx.lineTo(-r * 0.22, 0);
      ctx.stroke();
      ctx.restore();

      // 중심 캡
      ctx.fillStyle = "#555";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#999";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.04, 0, Math.PI * 2);
      ctx.fill();

      // 라벨 & 수치
      ctx.fillStyle = "#00B050";
      ctx.font = `bold ${Math.max(9, r * 0.18)}px Arial`;
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PCHG", cx, cy - r * 0.28);

      const sign = pchg >= 0 ? "+" : "";
      ctx.fillStyle = pchg >= 0 ? "#4caf50" : "#f44336";
      ctx.font = `bold ${Math.max(10, r * 0.22)}px Arial`;
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${sign}${pchg.toFixed(2)}%`, cx, cy + r * 0.28);
    }

    /** STR Tape (체결강도, 오른쪽 아래) */
    private drawRoundGaugeSTR(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
      const strength = this.strength;

      const tapeX = x + 8;
      const tapeW = w - 16;
      const tapeTop = y + Math.max(14, h * 0.2);
      const tapeBot = y + h - 3;
      const tapeH = tapeBot - tapeTop;
      const ptrY = tapeTop + tapeH / 2;

      ctx.fillStyle = "#1e1e1e";
      ctx.fillRect(x, y, w, h);

      // tape background
      ctx.fillStyle = "#111";
      ctx.fillRect(tapeX, tapeTop, tapeW, tapeH);

      // horizontal tape centered on 100
      const step = 50;
      const visibleSteps = 8;
      const pxPerStep = tapeW / visibleSteps;
      const fracOffset = (strength % step) / step;
      const baseVal = Math.floor(strength / step) * step;
      const subStep = step / 2;

      ctx.save();
      ctx.beginPath();
      ctx.rect(tapeX, tapeTop, tapeW, tapeH);
      ctx.clip();

      // tick font sized relative to tape height and clamped to reasonable range
      const tickFontSize = Math.max(8, Math.min(14, Math.round(tapeH * 0.16)));
      ctx.font = `${tickFontSize}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const mainTickLabels: Array<{ x: number; text: string; color: string }> = [];

      // draw right-to-left style tape with 100 center reference
      for (let i = -visibleSteps * 2; i <= visibleSteps * 2; i++) {
        const val = baseVal + (i * step) / 2;
        const xPos = tapeX + tapeW / 2 + ((i / 2) - fracOffset) * pxPerStep;
        if (xPos < tapeX - 20 || xPos > tapeX + tapeW + 20) continue;

        const isMain = val % step === 0;
        const isSub = !isMain && Math.abs((val - baseVal) % subStep) < 1e-6;

        const tickH = isMain ? tapeH : tapeH * 0.45;
        ctx.strokeStyle = val === 100 ? "#fff" : "#666";
        ctx.lineWidth = val === 100 ? 2 : isMain ? 1 : 0.6;
        ctx.beginPath();
        ctx.moveTo(xPos, tapeTop + tapeH - tickH);
        ctx.lineTo(xPos, tapeTop + tapeH);
        ctx.stroke();

        if (isMain) {
          mainTickLabels.push({
            x: xPos,
            text: val.toString(),
            color: "#ddd",
          });
        }

        // one small tick between main ticks
        if (isSub && Math.abs(val - 100) > 0.001) {
          ctx.strokeStyle = "#555";
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(xPos, tapeTop + tapeH - tapeH * 0.3);
          ctx.lineTo(xPos, tapeTop + tapeH);
          ctx.stroke();
        }
      }

      // 100 center marker line
      const hundredX = tapeX + tapeW / 2;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(hundredX, tapeTop + 4);
      ctx.lineTo(hundredX, tapeBot - 4);
      ctx.stroke();

      // ctx.strokeStyle = strength >= 100 ? "#4caf50" : "#f44336";
      // ctx.lineWidth = 2;
      // ctx.beginPath();
      // ctx.moveTo(hundredX, tapeTop + 4);
      // ctx.lineTo(hundredX, tapeBot - 4);
      // ctx.stroke();

      ctx.restore();

      // main tick labels above the tape band, like other tape graphs
      // main tick labels above the tape: use tapeH-based sizing and clamp
      const labelFontSize = Math.max(8, Math.min(16, Math.round(tapeH * 0.18)));
      ctx.font = `${labelFontSize}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      // place tick labels just above the tape band (touching its top), and crop to tape width
      const labelY = tapeTop - Math.max(2, h * 0.02) + 2; // nudge 2px down
      const cropLeft = tapeX + 2;
      const cropRight = tapeX + tapeW - 2;
      const labelAreaH = Math.max(14, w * 0.05);
      // clip to the tape area including the small label area above it
      ctx.save();
      ctx.beginPath();
      ctx.rect(cropLeft, tapeTop - labelAreaH, cropRight - cropLeft, tapeH + labelAreaH + 2);
      ctx.clip();
      for (const label of mainTickLabels) {
        if (label.x < cropLeft || label.x > cropRight) continue;
        ctx.fillStyle = label.color;
        ctx.fillText(label.text, label.x, labelY);
      }
      ctx.restore();

      // pointer band centered at 100 (center marker hidden to reduce clutter)
      const pointerColor = strength >= 100 ? "#4caf50" : "#f44336";
      const centerTickColor = pointerColor;
      // intentionally not drawing the small center dot (was visually noisy)

      // STR value capsule: smaller capsule placed below the tape
      const valueText = `${strength.toFixed(2)}%`;
      // smaller capsule font and padding
      const headerTextFont = Math.max(10, Math.min(14, Math.round(tapeH * 0.20)));
      ctx.font = `bold ${headerTextFont}px Arial`;
      const headerMetrics = ctx.measureText(valueText);
      const headerPaddingH = Math.max(4, Math.round(tapeH * 0.12));
      const headerBoxW = Math.max(40, Math.ceil(headerMetrics.width + headerPaddingH * 2));
      // reduce vertical padding: box height proportional to font but clamped
      const headerBoxH = Math.max(Math.round(headerTextFont * 1.1), Math.round(tapeH * 0.28));
      const headerBoxX = tapeX + Math.round((tapeW - headerBoxW) / 2);
      // place capsule overlapping tape bottom (inside visible area) with smaller vertical gap
      const headerBoxY = tapeBot - headerBoxH - Math.max(1, Math.round(tapeH * 0.03));
      const headerTipH = Math.max(4, Math.round(headerBoxH * 0.12));
      const headerTipInset = Math.max(5, Math.round(headerBoxW * 0.14));
      const headerTipColor = strength >= 100 ? "#4caf50" : "#f44336";

      // draw STR history points slightly above tape center (so connector is above them)
      const strDotY = tapeTop + Math.round(tapeH * 0.18);

      ctx.save();
      ctx.beginPath();
      ctx.rect(tapeX, tapeTop, tapeW, tapeH);
      ctx.clip();
      const sh = this.strHistory;
      if (sh && sh.length) {
        const max = sh.length;
        for (let hi = 0; hi < max; hi++) {
          const entry = sh[hi];
          const rel = (entry - strength) / step;
          const xPos = tapeX + tapeW / 2 + rel * pxPerStep;
          if (xPos < tapeX || xPos > tapeX + tapeW) continue;
          const ageFactor = 1 - hi / max;
          const alpha = Math.max(0.18, ageFactor * 0.98);
          const radius = Math.max(2, 4.8 - hi * (2.9 / max));
          this.drawHistoryPoint(ctx, xPos, strDotY, radius, alpha, 'horizontal');
        }
      }
      ctx.restore();

      // draw short connector from tape up toward where the tip will be
      ctx.save();
      ctx.strokeStyle = headerTipColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      // draw dashed connector from tape's top area up to capsule tip (visible to top)
      ctx.moveTo(headerBoxX + headerBoxW / 2, tapeTop + 4);
      ctx.lineTo(headerBoxX + headerBoxW / 2, headerBoxY - headerTipH - 1);
      ctx.stroke();
      ctx.restore();

      // triangular tip (points up toward tape) drawn above connector
      ctx.fillStyle = headerTipColor;
      ctx.beginPath();
      ctx.moveTo(headerBoxX + headerBoxW / 2, headerBoxY - headerTipH);
      ctx.lineTo(headerBoxX + headerBoxW / 2 + headerTipInset, headerBoxY + 1);
      ctx.lineTo(headerBoxX + headerBoxW / 2 - headerTipInset, headerBoxY + 1);
      ctx.closePath();
      ctx.fill();

      // capsule body
      ctx.fillStyle = "#101010";
      ctx.strokeStyle = headerTipColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === "function") {
        (ctx as any).rect(headerBoxX, headerBoxY, headerBoxW, headerBoxH);
      } else {
        ctx.rect(headerBoxX, headerBoxY, headerBoxW, headerBoxH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = `bold ${headerTextFont}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(valueText, headerBoxX + headerBoxW / 2, headerBoxY + headerBoxH / 2 + 0.5);

      // STR label drawn last so it stays above the tape marks
      ctx.fillStyle = "#00B050";
      ctx.font = `bold ${Math.max(8, Math.round(tapeH * 0.32))}px Arial`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("STR", tapeX + 5, tapeBot - 4);

      

      // (header removed here; value is drawn in the black band overlay)
    }

    private drawHistoryPoint(
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      radius: number,
      alpha: number,
      orientation: 'vertical' | 'horizontal' = 'vertical',
    ): void {
      const coreAlpha = Math.max(0.08, Math.min(1, alpha));
      const pointRadius = Math.max(1, radius * (0.4 + coreAlpha * 0.9));

      ctx.fillStyle = `rgba(255,255,255,${Math.max(0.35, coreAlpha).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    /** Speed Tape: 거래량 기반 세로 테이프 (PRICE 스타일) */
    private drawSpeedTape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pointerAlign: 'right' | 'left' = 'right'): void {
      const volume = this.animatedCurrentVolume;
      const displayVol = volume / 1000; // K
      const prevCandle = this.stockService?.getMinLastCompleteCandle(this.selectedCode);
      const prevVolK = (prevCandle?.volume || 0) / 1000;

      // layout
      const labelW = w * 0.55;
      const tapeX = x + labelW;
      const tapeW = w - labelW;
      const tapeTop = y + 30;
      const tapeBot = y + h;
      const tapeH = tapeBot - tapeTop;

      // background and labels
      ctx.fillStyle = "#2a2a2a";
      ctx.fillRect(x, y, w, h);

      ctx.fillStyle = "#00B050";
      ctx.font = `bold ${Math.max(7, w * 0.12)}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("VOL", x + w / 2, y + 10);

      // tape background (align with price tape: label width then tape)
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(tapeX, tapeTop, tapeW, tapeH);

      // ticks: make ticks scroll relative to current value (pointer fixed at bottom)
      const step = 50; // K 단위
      const visibleSteps = 5; // 보여줄 눈금 개수
      const pxPerK = tapeH / (visibleSteps * step); // 1K -> px
      const pointerLineY = tapeBot - 9; // cap tip 기준선 (boxH/2)

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, tapeTop, w, tapeH);
      ctx.clip();

      ctx.font = `${Math.max(8, w * 0.12)}px Arial`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";

      // ticks with a single intermediate tick between main steps
      const baseVal = Math.floor(displayVol / step) * step;
      const subStep = step / 2; // only one sub-tick between main ticks (e.g., 50K -> 25K)
      const minVal = Math.max(0, baseVal - step);
      const maxVal = baseVal + (visibleSteps + 2) * step;
      for (let val = minVal; val <= maxVal + 0.0001; val += subStep) {
        if (val < 0) continue;
        const py = tapeBot - (val - displayVol) * pxPerK;
        if (py < tapeTop - 20 || py > tapeBot + 20) continue;

        const isMain = Math.abs((val - baseVal) % step) < 1e-6;
        const isSub = !isMain && Math.abs((val - baseVal) % subStep) < 1e-6;

        const tickW = isMain ? tapeW : tapeW * 0.6; // sub tick shorter
        ctx.strokeStyle = isMain ? "#888" : "#555";
        ctx.lineWidth = isMain ? 1 : 0.7;
        ctx.beginPath();
        // right-aligned ticks (match price tape): draw from tapeX + tapeW - tickW to tapeX + tapeW
        ctx.moveTo(tapeX + tapeW - tickW, py);
        ctx.lineTo(tapeX + tapeW, py);
        ctx.stroke();

        if (isMain) {
          ctx.fillStyle = "#ccc";
          ctx.fillText(`${Math.round(val)}K`, tapeX - 8, py);
        }
      }

      // previous candle volume: draw as a vertical bar from 0 up (price-tape style)
      if (prevVolK > 0) {
        const clampedPrevK = Math.max(0, Math.min(prevVolK, visibleSteps * step));
        const prevBarH = clampedPrevK * pxPerK;
        if (prevBarH > 0) {
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = "#ff00ff";
          // left padding and slightly thinner previous-volume bar
          const prevBarPadding = Math.max(4, Math.round(tapeW * 0.04));
          const prevBarW = Math.max(4, Math.round(tapeW * 0.22));
          const prevBarX = tapeX + prevBarPadding; // inset from left edge
          // draw previous bar (left-aligned with padding)
          ctx.fillRect(prevBarX, tapeBot - prevBarH, prevBarW, prevBarH);
          ctx.restore();
        }
      }

      // 히트맵 점: 최근 캔들들의 거래량 위치에 작은 점을 찍어 히트맵처럼 표시
      const recentCount = 40;
      try {
        const currentCandle = this.stockService?.getCurrentCandle(this.selectedCode);
        // volHistory stores newest at index 0 (see startSampler unshift)
        const hist = [ (currentCandle?.volume || 0), ...(this.volHistory || []) ];
        const sh = hist.slice(0, recentCount);
        const maxH = sh.length;
        for (let hi = 0; hi < maxH; hi++) {
            const entry = (sh[hi] || 0) / 1000; // K 단위
            // 캡슐 팁(현재값 기준선)을 영점으로 맞춰 점이 선을 걸치도록 배치
            const yPos = pointerLineY - (entry - displayVol) * pxPerK;
          if (yPos < tapeTop || yPos > tapeBot) continue;
          const ageFactor = 1 - hi / maxH; // hi=0 is newest -> ageFactor=1
          const alpha = Math.max(0.06, ageFactor * 0.9);
            const radius = Math.max(2.1, 5.1 - hi * (3.2 / maxH));
            this.drawHistoryPoint(ctx, tapeX + tapeW / 2, yPos, radius, alpha, 'vertical');
        }
      } catch (e) {
        // ignore if stockService not available
      }

      ctx.restore();

      // pointer box fixed at bottom (badge shows current value)
      const boxH = 18; // slightly smaller to reduce overlap with tape
      // pointerAlign에 따라 박스 위치와 폭 결정
      let boxW: number;
      let boxX: number;
      if (pointerAlign === 'left') {
        // 왼쪽 정렬 시: 박스의 오른쪽 끝이 테이프 시작(tapeX)에 닿도록 labelW를 기준으로 설정
        const totalInnerW = w - 12; // 좌우 마진 고려
        boxX = x; // 완전 왼쪽에 붙여서 rect가 캔버스 왼쪽부터 시작하도록 함
        const valText = displayVol.toFixed(1) + "K";
        ctx.font = `bold ${Math.max(9, w * 0.09)}px Arial`;
        const metrics = ctx.measureText(valText);
        const paddingH = 8;
        const minW = Math.max(48, Math.ceil(metrics.width + paddingH * 2));
        const labelW = w * 0.55;
        // boxW는 최소 minW, 목표는 labelW(테이프 시작점), 최대는 totalInnerW
        boxW = Math.max(minW, Math.min(labelW, totalInnerW));
      } else {
        boxW = w - 6;
        boxX = x + 3;
      }
      const tipW = Math.max(8, Math.min(12, boxW * 0.06));
      const ptrY = pointerLineY;

      // decide tip color based on previous COMPLETE candle volume (compare current tick vs last complete candle)
      const prevTickVol = this._lastTickVolume || 0;
      const currentCandle = this.stockService?.getCurrentCandle(this.selectedCode);
      const currentTickVol = (currentCandle && typeof currentCandle.volume === 'number') ? currentCandle.volume : (typeof this.targetCurrentVolume === 'number' ? this.targetCurrentVolume : this.animatedCurrentVolume);
      const prevCandleVol = (prevCandle && typeof prevCandle.volume === 'number') ? prevCandle.volume : 0;
      const volTipColor = currentTickVol > prevCandleVol ? "#4caf50" : (currentTickVol < prevCandleVol ? "#f44336" : "#888");

      // VOL 디버그: console.clear 제거 — 대신 500ms 간격으로만 로그 출력
      try {
        const nowTs = Date.now();
        if (nowTs - (this._lastVolDbgLogTs || 0) >= 500) {
          console.log(`[VOL-DBG] time=${nowTs} currentTickVol=${currentTickVol} prevCandleVol=${prevCandleVol} _lastTickVolume=${this._lastTickVolume} targetCurrentVolume=${this.targetCurrentVolume} animatedCurrentVolume=${this.animatedCurrentVolume} prevTickVol=${prevTickVol} prevVolK=${prevVolK} displayVol=${displayVol}`);
          this._lastVolDbgLogTs = nowTs;
        }
      } catch (e) {
        // 안전하게 실패 무시
      }

      // (overlay removed)

      // baseline line
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(boxX, ptrY);
      ctx.lineTo(boxX + boxW, ptrY);
      ctx.stroke();

      // pointer tag (same capsule & pointed ends)
      ctx.fillStyle = "#101010";
      ctx.strokeStyle = volTipColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (pointerAlign === 'left') {
        // 왼쪽 정렬 시 박스가 캔버스 왼쪽에 딱 붙도록 시작점을 boxX로 설정
        ctx.moveTo(boxX, ptrY - boxH / 2);
        ctx.lineTo(boxX + boxW - 10, ptrY - boxH / 2);
        ctx.lineTo(boxX + boxW, ptrY);
        ctx.lineTo(boxX + boxW - 10, ptrY + boxH / 2);
        ctx.lineTo(boxX, ptrY + boxH / 2);
        ctx.closePath();
      } else {
        ctx.moveTo(boxX + 10, ptrY - boxH / 2);
        ctx.lineTo(boxX + boxW - 10, ptrY - boxH / 2);
        ctx.lineTo(boxX + boxW, ptrY);
        ctx.lineTo(boxX + boxW - 10, ptrY + boxH / 2);
        ctx.lineTo(boxX + 10, ptrY + boxH / 2);
        ctx.lineTo(boxX, ptrY);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = volTipColor;
      ctx.beginPath();
      if (pointerAlign === 'left') {
        ctx.moveTo(boxX + boxW, ptrY);
        ctx.lineTo(boxX + boxW - tipW, ptrY - boxH / 2 + 1);
        ctx.lineTo(boxX + boxW - tipW, ptrY + boxH / 2 - 1);
      } else {
        ctx.moveTo(boxX, ptrY);
        ctx.lineTo(boxX + tipW, ptrY - boxH / 2 + 1);
        ctx.lineTo(boxX + tipW, ptrY + boxH / 2 - 1);
      }
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.strokeStyle = volTipColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      if (pointerAlign === 'left') {
        ctx.moveTo(boxX + boxW - tipW, ptrY);
        ctx.lineTo(tapeX + tapeW, ptrY);
      } else {
        ctx.moveTo(boxX + tipW, ptrY);
        ctx.lineTo(tapeX, ptrY);
      }
      ctx.stroke();
      ctx.restore();

      // value text inside pointer — match VCHG size (same as drawPriceStyleTape)
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.max(9, w * 0.09)}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(displayVol.toFixed(1) + "K", boxX + boxW / 2, ptrY);
    }

    /** Attitude Indicator (중앙 큰 사각형) */
    private drawAI(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
      const cx = x + w / 2;

      // ── AI 영역: 전체 높이 사용 (헤더 제거) ─────────────────
      const aiX = x;
      const aiY = y;
      const aiW = w;
      const aiH = h;
      const cy  = aiY + aiH / 2;

      // AI 클립
      ctx.save();
      ctx.beginPath();
      ctx.rect(aiX, aiY, aiW, aiH);
      ctx.clip();

      const pitchPx = this.pitch * (aiH / 100);

      ctx.save();
      ctx.translate(cx, cy);
      // rotate background opposite to aircraft bank so the fixed airplane
      // (pilot's viewpoint) shows correct horizon movement
      ctx.rotate(-this.bank * Math.PI / 180);
      ctx.translate(0, pitchPx);

      // 하늘
      ctx.fillStyle = "#1565c0";
      ctx.fillRect(-aiW, -aiH * 2, aiW * 2, aiH * 2);
      // 지면
      ctx.fillStyle = "#6d4c1a";
      ctx.fillRect(-aiW, 0, aiW * 2, aiH * 2);
      // 수평선
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-aiW, 0);
      ctx.lineTo(aiW, 0);
      ctx.stroke();

      // Pitch 눈금
      const pitchSteps = [2.5, 5, 7.5, 10, 15, 20, 25, 30];
      for (const deg of pitchSteps) {
        for (const sign of [-1, 1]) {
          const py = sign * deg * (aiH / 25);
          const isMain = deg % 10 === 0;
          const isMid  = deg % 5 === 0 && !isMain;
          const lineLen = isMain ? aiW * 0.35 : isMid ? aiW * 0.22 : aiW * 0.12;

          ctx.strokeStyle = "#fff";
          ctx.lineWidth = isMain ? 2 : 1;
          ctx.beginPath();
          ctx.moveTo(-lineLen / 2, py);
          ctx.lineTo(lineLen / 2, py);
          ctx.stroke();

          if (isMain) {
            ctx.fillStyle = "#fff";
            ctx.font = `bold ${Math.max(10, aiH * 0.055)}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(deg.toString(), -lineLen / 2 - aiW * 0.05, py);
            ctx.fillText(deg.toString(), lineLen / 2 + aiW * 0.05, py);
          }
        }
      }

      ctx.restore();

      // Bank 눈금 (상단 호 - 너비 기준 반지름)
      const bankArcR = Math.min(aiW, aiH) * 0.46;
      const bankAngles = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];
      ctx.strokeStyle = "#fff";
      ctx.fillStyle = "#fff";
      ctx.lineWidth = 1;
      for (const deg of bankAngles) {
        const rad = (deg - 90) * Math.PI / 180;
        const isMain = Math.abs(deg) % 30 === 0 || deg === 0;
        const tickLen = isMain ? Math.min(aiW, aiH) * 0.05 : Math.min(aiW, aiH) * 0.03;
        const x1 = cx + Math.cos(rad) * bankArcR;
        const y1 = cy + Math.sin(rad) * bankArcR;
        const x2 = cx + Math.cos(rad) * (bankArcR - tickLen);
        const y2 = cy + Math.sin(rad) * (bankArcR - tickLen);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Bank 삼각형 인덱스 (상단 고정)
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(cx, cy - bankArcR + 2);
      ctx.lineTo(cx - 7, cy - bankArcR + 14);
      ctx.lineTo(cx + 7, cy - bankArcR + 14);
      ctx.closePath();
      ctx.fill();

      // Bank 포인터 (TBD - 0도 고정)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = "#888";
      ctx.fillStyle = "#888";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -bankArcR + 2);
      ctx.lineTo(-7, -bankArcR + 16);
      ctx.lineTo(7, -bankArcR + 16);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      ctx.restore(); // clip 해제

      // 비행기 심볼 (고정)
      const planeY = cy;
      ctx.strokeStyle = "#ffeb3b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - aiW * 0.35, planeY);
      ctx.lineTo(cx - aiW * 0.12, planeY);
      ctx.lineTo(cx - aiW * 0.12, planeY + aiH * 0.04);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + aiW * 0.35, planeY);
      ctx.lineTo(cx + aiW * 0.12, planeY);
      ctx.lineTo(cx + aiW * 0.12, planeY + aiH * 0.04);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, planeY, 5, 0, Math.PI * 2);
      ctx.stroke();

      // ── 내부 오버레이: PITCH (좌상단), BANK (우상단) ──────────
      const overlaySize = Math.max(9, aiW * 0.025);
      const overlayPad  = 6;

      // PITCH (좌상단)
      const pitchSign = this.pitch >= 0 ? "+" : "";
      ctx.font = `bold ${overlaySize}px Arial`;
      ctx.textBaseline = "top";

      ctx.textAlign = "left";
      // ctx.fillStyle = "rgba(0,0,0,0.45)";
      // ctx.fillRect(aiX + overlayPad - 2, aiY + overlayPad - 1, aiW * 0.22, overlaySize * 2 + 4);

      ctx.fillStyle = "#00B050";
      ctx.fillText("PITCH", aiX + overlayPad, aiY + overlayPad);
      ctx.fillStyle = this.pitch >= 0 ? "#4caf50" : "#f44336";
      ctx.fillText(`${pitchSign}${this.pitch.toFixed(1)}°`, aiX + overlayPad, aiY + overlayPad + overlaySize + 2);

      // BANK (우상단)
      const bankSign = this.bank >= 0 ? "+" : "";
      const bankLabelW = aiW * 0.22;
      // ctx.fillStyle = "rgba(0,0,0,0.45)";
      // ctx.fillRect(aiX + aiW - overlayPad - bankLabelW - 2, aiY + overlayPad - 1, bankLabelW, overlaySize * 2 + 4);

      ctx.textAlign = "right";
      ctx.fillStyle = "#00B050";
      ctx.fillText("BANK", aiX + aiW - overlayPad, aiY + overlayPad);
      ctx.fillStyle = this.bank >= 0 ? "#4caf50" : "#f44336";
      ctx.fillText(`${bankSign}${this.bank.toFixed(1)}°`, aiX + aiW - overlayPad, aiY + overlayPad + overlaySize + 2);
    }

    /** Altimeter Tape (오른쪽): price 기반 - 포인터 고정, 눈금 스크롤 */
    private drawAltTape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pointerAlign: 'center' | 'left' = 'center'): void {
      const price = this.animatedCurrentPrice; // 보간된 price
      const priceBandLastCandle = this.stockService?.getMinLastCompleteCandle(this.selectedCode);
      const priceBandPrevClose = priceBandLastCandle?.close || price;
      const priceDiff = price - priceBandPrevClose;
      const priceDiffPercent = priceBandPrevClose > 0 ? (priceDiff / priceBandPrevClose) * 100 : 0;
      const priceDiffSign = priceDiff >= 0 ? "+" : "";
      const priceDiffPercentSign = priceDiffPercent >= 0 ? "+" : "";
      const priceDiffColor = priceDiff >= 0 ? "#4caf50" : "#f44336";
      const labelW = w * 0.55;
      const tapeX = x + labelW;
      const tapeW = w - labelW;
      const tapeTop = y + 30; // reduced top gap to tighten label spacing
      const tapeBot = y + h - 1;
      const tapeH = tapeBot - tapeTop;

       // 배경
       ctx.fillStyle = "#2a2a2a";
       ctx.fillRect(x, y, w, h);

      // header: label only (no values under PRICE to keep consistent with other tapes)
      const headerTopY = y + 8;
      ctx.fillStyle = "#00B050";
      ctx.font = `bold ${Math.max(7, w * 0.1)}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("PRICE", x + w / 2, headerTopY);

      // 테이프 배경
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(tapeX, tapeTop, tapeW, tapeH);

       // 눈금: 포인터 고정(중앙), 눈금이 price에 따라 연속 스크롤
       const step = 1000; // 1000원 단위 (천단위)
       const subStep = 500; // 500원 중간 눈금
      const visibleSteps = 5;
       const pxPerStep = tapeH / visibleSteps;

       // 소수 오프셋으로 눈금 부드럽게 스크롤
       const fracOffset = (price % step) / step;
       const baseVal = Math.floor(price / step) * step;

       ctx.save();
       ctx.beginPath();
       ctx.rect(x, tapeTop, w, tapeH);
       ctx.clip();

       ctx.strokeStyle = "#888";
       ctx.fillStyle = "#ccc";
       ctx.font = `${Math.max(7, w * 0.1)}px Arial`;
       ctx.textAlign = "right";
       ctx.textBaseline = "middle";
       ctx.lineWidth = 1;

       for (let i = -visibleSteps * 2 - 1; i <= visibleSteps * 2 + 1; i++) {
         const val = baseVal + (i * step) / 2;
         if (val < 0) continue;
         const py = tapeTop + tapeH / 2 - ((i / 2) - fracOffset) * pxPerStep;

         const isMain = val % 1000 === 0; // 1000원 단위가 큰 눈금
         const isSub = val % 500 === 0 && val % 1000 !== 0; // 500원 중간 눈금
         const tickW = isMain ? tapeW : (isSub ? tapeW * 0.7 : tapeW * 0.5);

         ctx.strokeStyle = isMain ? "#888" : "#555";
         ctx.lineWidth = isMain ? 1 : 0.5;
         ctx.beginPath();
         ctx.moveTo(tapeX + tapeW - tickW, py);
         ctx.lineTo(tapeX + tapeW, py);
         ctx.stroke();

         if (isMain) {
           ctx.fillText(val.toLocaleString(), tapeX - 3, py);
         }
       }

      // draw price history points (inside clipped area)
      const ph = this.priceHistory;
      if (ph && ph.length) {
        const max = ph.length;

        for (let hi = 0; hi < max; hi++) {
          const entry = ph[hi];
          const py = tapeTop + tapeH / 2 - ((entry - price) / step) * pxPerStep;
          if (py < tapeTop || py > tapeBot) continue;
          const ageFactor = 1 - hi / max;
          const alpha = Math.max(0.06, ageFactor * 0.9);
          const radius = Math.max(2, 4.8 - hi * (2.9 / max));
          this.drawHistoryPoint(ctx, tapeX + tapeW * 0.5, py, radius, alpha, 'vertical');

        }
      }

      ctx.restore();

       // ── 마지막 완성 캔들 high/low/close 캔들 overlay 표시 ──────────────
       const bandCandle = this.stockService?.getMinLastCompleteCandle(this.selectedCode);
       if (bandCandle && bandCandle.high > 0) {
         const valToPy = (val: number) =>
           tapeTop + tapeH / 2 - ((val - price) / step) * pxPerStep;

         const highPy = valToPy(bandCandle.high);
         const lowPy  = valToPy(bandCandle.low);
         const closePy = valToPy(bandCandle.close);
         const openPy  = valToPy(bandCandle.open);

         // overlay 캔들을 테이프 내부에 그림
         ctx.save();
         ctx.beginPath();
         ctx.rect(tapeX, tapeTop, tapeW, tapeH);
         ctx.clip();

        // pointerAlign이 'left'이면 오버레이 캔들을 왼쪽 내부에 강제로 배치하여 우측 밴드를 가리지 않음
        const forcedLeftOffset = Math.max(6, Math.round(tapeW * 0.04));
        const candleX = pointerAlign === 'left'
          ? tapeX + forcedLeftOffset
          : tapeX + tapeW - Math.max(8, w * 0.15); // 오른쪽 끝 근처
         const candleBodyW = Math.max(6, w * 0.1);
         const isUp        = bandCandle.close >= bandCandle.open;
         const candleColor = isUp ? "#00B050" : "#FF0000"; // 미국 기준: 상승=초록, 하강=빨강

         // 심지 (wick)
         ctx.strokeStyle = candleColor;
         ctx.lineWidth = 1.5;
         ctx.beginPath();
         ctx.moveTo(candleX + candleBodyW / 2, highPy);
         ctx.lineTo(candleX + candleBodyW / 2, lowPy);
         ctx.stroke();

         // 몸통
         const bodyTop = Math.min(openPy, closePy);
         const bodyH   = Math.max(2, Math.abs(closePy - openPy));
         ctx.fillStyle = candleColor;
         ctx.fillRect(candleX, bodyTop, candleBodyW, bodyH);
         
         // 몸통 테두리
         ctx.strokeStyle = candleColor;
         ctx.lineWidth = 0.5;
         ctx.strokeRect(candleX, bodyTop, candleBodyW, bodyH);

         ctx.restore();

         // ── close 수평선 (현재가와 비교) ──────────────
         ctx.save();
         ctx.beginPath();
         ctx.rect(tapeX, tapeTop, tapeW, tapeH);
         ctx.clip();

         ctx.strokeStyle = "#ffeb3b";
         ctx.lineWidth = 1;
         ctx.setLineDash([4, 4]);
         ctx.beginPath();
         ctx.moveTo(tapeX, closePy);
         ctx.lineTo(tapeX + tapeW, closePy);
         ctx.stroke();
         ctx.setLineDash([]);

         ctx.restore();

         // ── H/L/O 레이블 (테이프 안쪽에) ──────────────
         ctx.save();
         ctx.beginPath();
         ctx.rect(tapeX, tapeTop, tapeW, tapeH);
         ctx.clip();

         const labelX = pointerAlign === 'left'
           ? candleX + Math.max(10, w * 0.02)
           : candleX - Math.max(10, w * 0.08);
         ctx.fillStyle = "#aaa";
         ctx.font = `${Math.max(7, w * 0.08)}px Arial`;
         ctx.textAlign = "right";
         ctx.textBaseline = "middle";
         
         // High, Low, Open, Close 라벨
         ctx.fillText("H", labelX, highPy);
         ctx.fillText("L", labelX, lowPy);
         ctx.fillText("O", labelX, openPy);
         
         ctx.fillStyle = "#ffeb3b";
         ctx.fillText("C", labelX, closePy);

         ctx.restore();
       }

      // 현재값 포인터 박스 (한 줄 전체 + 날카로운 양끝)
      const ptrY = tapeTop + tapeH / 2;
      const boxH = 18;
      const priceText = Math.floor(price).toLocaleString();
      // 이전 캔들 close 대비 색상: 높으면 초록, 낮으면 빨강 (미국 기준)
      const priceBandLastCandleForPrc = this.stockService?.getMinLastCompleteCandle(this.selectedCode);
      const priceBandPrevCloseForPrc = priceBandLastCandleForPrc?.close || price;
      const prcIsUp = price >= priceBandPrevCloseForPrc;
      const boxY = ptrY - boxH / 2;

      ctx.save();
      ctx.font = `bold ${Math.max(9, w * 0.09)}px Arial`;
      const textWidth = ctx.measureText(priceText).width;
      // pointerAlign: 'center' (default) makes the tag span full width; 'left' anchors it to the tape's left side
      let boxW: number;
      let boxX: number;
      if (pointerAlign === 'left') {
        // 왼쪽 정렬 시: 박스의 오른쪽 끝이 테이프 시작(labelW)에 닿도록 설정
        const totalInnerW = w - 12;
        boxX = x; // 완전 왼쪽에 붙임
        const paddingH = 10;
        const minWFromText = Math.ceil(textWidth + paddingH * 2);
        const labelW = w * 0.55;
        boxW = Math.max(60, Math.max(minWFromText, Math.min(labelW, totalInnerW)));
      } else {
        boxW = w - 4;
        boxX = x + 2;
      }
      const tipW = Math.max(8, Math.min(12, boxW * 0.06));
      const textX = boxX + boxW / 2;

      // 기준선은 약하게만 표시
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(boxX, ptrY);
      ctx.lineTo(boxX + boxW, ptrY);
      ctx.stroke();

      // 가격 태그 본체
      ctx.fillStyle = "#101010";
      ctx.strokeStyle = prcIsUp ? "#66ff99" : "#ff7777";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (pointerAlign === 'left') {
        // 왼쪽 붙임에서는 왼쪽 모서리를 박스 시작으로 하여 정확히 붙게 그린다
        ctx.moveTo(boxX, boxY);
        ctx.lineTo(boxX + boxW - tipW, boxY);
        ctx.lineTo(boxX + boxW, ptrY);
        ctx.lineTo(boxX + boxW - tipW, boxY + boxH);
        ctx.lineTo(boxX, boxY + boxH);
        ctx.closePath();
      } else {
        ctx.moveTo(boxX + tipW, boxY);
        ctx.lineTo(boxX + boxW - tipW, boxY);
        ctx.lineTo(boxX + boxW, ptrY);
        ctx.lineTo(boxX + boxW - tipW, boxY + boxH);
        ctx.lineTo(boxX + tipW, boxY + boxH);
        ctx.lineTo(boxX, ptrY);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = prcIsUp ? "#66ff99" : "#ff7777";
      ctx.beginPath();
      if (pointerAlign === 'left') {
        ctx.moveTo(boxX + boxW, ptrY);
        ctx.lineTo(boxX + boxW - tipW, boxY + 1);
        ctx.lineTo(boxX + boxW - tipW, boxY + boxH - 1);
      } else {
        ctx.moveTo(boxX, ptrY);
        ctx.lineTo(boxX + tipW, boxY + 1);
        ctx.lineTo(boxX + tipW, boxY + boxH - 1);
      }
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.strokeStyle = prcIsUp ? "#66ff99" : "#ff7777";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      if (pointerAlign === 'left') {
        ctx.moveTo(boxX + boxW - tipW, ptrY);
        ctx.lineTo(tapeX + tapeW, ptrY);
      } else {
        ctx.moveTo(boxX + tipW, ptrY);
        ctx.lineTo(tapeX, ptrY);
      }
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(priceText, textX, ptrY);

      ctx.restore();

      // BARO, STD 라벨 제거
    }

    /** Change Tape (VCHG): PRICE 스타일 */
    private drawChangeTape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
      const changeRate = this.animatedCurrentChange;

      // compute previous candle-based change percent for subtitle
      const lastCandle = this.stockService?.getMinLastCompleteCandle(this.selectedCode);
      const prevVol = lastCandle?.volume || 0;
      const baseline = this._baselineVolumeForChange || prevVol || 1;
      const prevChangePercent = baseline > 0 ? ((prevVol - baseline) / baseline) * 100 : 0;
      const diff = changeRate - prevChangePercent;
      const diffSign = diff >= 0 ? '+' : '';
      const subText = `${prevChangePercent.toFixed(2)}% (${diffSign}${diff.toFixed(2)}%)`;

      this.drawPriceStyleTape(ctx, x, y, w, h, {
        label: "VCHG",
        // show value in boxed pointer (like PRICE) instead of inline text
        inlineValue: false,
        value: changeRate,
        step: 10,
        subStep: 5,
        valueColor: changeRate > 0 ? "#ffffff" : "#aaaaaa",
        pointerStroke: changeRate > 0 ? "#66ff99" : "#888888",
        currentValueFormatter: (val) => `${val.toFixed(2)}%`,
        tickFormatter: (val) => `${val.toFixed(0)}%`,
        visibleSteps: 5,
        history: this.vchgHistory,
        headerPosition: 'top',
        pointerAlign: 'left',
      });
    }

    private drawPriceStyleTape(
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      options: {
        label: string;
        value: number;
        valueText?: string;
        step: number;
        subStep: number;
        valueColor?: string;
        pointerStroke?: string;
        currentValueFormatter?: (value: number) => string;
        tickFormatter?: (value: number) => string;
        history?: number[];
        overlayValue?: number;
        overlayColor?: string;
        visibleSteps?: number;
        headerPosition?: 'top' | 'bottom';
        inlineValue?: boolean;
        pointerAlign?: 'center' | 'left';
        inlineValueColor?: string;
        subValueText?: string;
        subValueColor?: string;
        headerColor?: string;
        headerStrokeColor?: string;
        pointerFillColor?: string;
        connectorLine?: boolean;
        connectorLineColor?: string;
      },
    ): void {
      const labelW = w * 0.55;
      const tapeX = x + labelW;
      const tapeW = w - labelW;
      const tapeTop = y + 30;
      const tapeBot = y + h + 2;
      const tapeH = tapeBot - tapeTop;
      const value = options.value;
      const step = options.step;
      const subStep = options.subStep;
      const visibleSteps = options.visibleSteps ?? 10;
      const pxPerStep = tapeH / visibleSteps;
      const fracOffset = (value % step) / step;
      const baseVal = Math.floor(value / step) * step;
      const currentValueFormatter = options.currentValueFormatter ?? ((v: number) => v.toString());
      const tickFormatter = options.tickFormatter ?? ((v: number) => v.toString());
      const pointerStroke = options.pointerStroke ?? "#66ff99";
      const valueColor = options.valueColor ?? "#fff";

      ctx.fillStyle = "#2a2a2a";
      ctx.fillRect(x, y, w, h);

      ctx.fillStyle = options.headerColor ?? "#00B050";
      ctx.font = `bold ${Math.max(7, w * 0.1)}px Arial`;
      ctx.textAlign = "center";
      // headerPosition: 'top' | 'bottom'
      const headerPosition = (options as any).headerPosition ?? 'top';
      if (headerPosition === 'top') {
        ctx.textBaseline = "top";
        ctx.fillText(options.label, x + w / 2, y + 10);
      } else {
        // bottom
        ctx.textBaseline = "bottom";
        ctx.fillText(options.label, x + w / 2, y + h - 18);
      }

      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(tapeX, tapeTop, tapeW, tapeH);

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, tapeTop, w, tapeH);
      ctx.clip();

      ctx.strokeStyle = "#888";
      ctx.fillStyle = "#ccc";
      ctx.font = `${Math.max(7, w * 0.1)}px Arial`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 1;

      for (let i = -visibleSteps * 2 - 1; i <= visibleSteps * 2 + 1; i++) {
        const val = baseVal + (i * step) / 2;
        if (options.overlayValue !== undefined && val < 0) {
          continue;
        }

        const py = tapeTop + tapeH / 2 - ((i / 2) - fracOffset) * pxPerStep;
        const isMain = val % step === 0;
        const isSub = val % subStep === 0 && !isMain;
        const tickW = isMain ? tapeW : isSub ? tapeW * 0.7 : tapeW * 0.5;

        ctx.strokeStyle = isMain ? "#888" : "#555";
        ctx.lineWidth = isMain ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(tapeX + tapeW - tickW, py);
        ctx.lineTo(tapeX + tapeW, py);
        ctx.stroke();

        if (isMain) {
          ctx.fillText(tickFormatter(val), tapeX - 3, py);
        }
      }

      // draw history points if provided (history[0] newest)
      const history = (options as any).history as number[] | undefined;
      if (history && history.length) {
        const max = history.length;
        for (let hi = 0; hi < max; hi++) {
          const entry = history[hi];
          const py = tapeTop + tapeH / 2 - ((entry - value) / step) * pxPerStep;
          if (py < tapeTop || py > tapeBot) continue;
          const ageFactor = 1 - hi / max; // 1 newest -> 0 oldest
          const alpha = Math.max(0.08, ageFactor * 0.9);
          const radius = Math.max(2, 4.8 - hi * (3 / max));
          this.drawHistoryPoint(ctx, tapeX + tapeW * 0.5, py, radius, alpha, 'vertical');
        }
      }

      if (options.overlayValue !== undefined) {
        const overlayY = tapeTop + tapeH / 2 - ((options.overlayValue - value) / step) * pxPerStep;
        if (overlayY >= tapeTop && overlayY <= tapeBot) {
          ctx.strokeStyle = options.overlayColor ?? "#ff00ff";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(tapeX, overlayY);
          ctx.lineTo(tapeX + tapeW, overlayY);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      ctx.restore();

      const ptrY = tapeTop + tapeH / 2;
      const boxH = 18;
      // pointerAlign을 옵션에서 읽어 왼쪽 정렬이 필요하면 테이프 내부 왼쪽에 배치
      const pointerAlign = (options as any).pointerAlign ?? 'center';
      let boxW: number;
      let boxX: number;
      if (pointerAlign === 'left') {
        // 왼쪽 정렬 시: 박스의 오른쪽 끝이 테이프 시작(labelW)에 닿도록 설정
        const labelW = w * 0.55;
        const tapeX = x + labelW;
        const totalInnerW = w - 12; // 좌우 마진을 고려한 내부 전체 너비
        boxX = x; // 완전 왼쪽에 붙여서 rect 시작
        // 현재값 텍스트 너비를 측정해 최소 너비 보장
        const displayText = currentValueFormatter(value);
        ctx.font = `bold ${Math.max(9, w * 0.08)}px Arial`;
        const metrics = ctx.measureText(displayText);
        const paddingH = 8;
        const minW = Math.max(48, Math.ceil(metrics.width + paddingH * 2));
        boxW = Math.max(minW, Math.min(labelW, totalInnerW));
      } else {
        boxW = w - 4;
        boxX = x + 2;
      }
      const tipW = Math.max(8, Math.min(12, boxW * 0.06));

      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(boxX, ptrY);
      ctx.lineTo(boxX + boxW, ptrY);
      ctx.stroke();

      ctx.fillStyle = "#101010";
      ctx.strokeStyle = options.headerStrokeColor ?? pointerStroke;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (pointerAlign === 'left') {
        // 왼쪽 붙임에서는 박스 시작을 boxX로 하여 좌측에 딱 붙도록 그린다
        ctx.moveTo(boxX, ptrY - boxH / 2);
        ctx.lineTo(boxX + boxW - tipW, ptrY - boxH / 2);
        ctx.lineTo(boxX + boxW, ptrY);
        ctx.lineTo(boxX + boxW - tipW, ptrY + boxH / 2);
        ctx.lineTo(boxX, ptrY + boxH / 2);
        ctx.closePath();
      } else {
        ctx.moveTo(boxX + tipW, ptrY - boxH / 2);
        ctx.lineTo(boxX + boxW - tipW, ptrY - boxH / 2);
        ctx.lineTo(boxX + boxW, ptrY);
        ctx.lineTo(boxX + boxW - tipW, ptrY + boxH / 2);
        ctx.lineTo(boxX + tipW, ptrY + boxH / 2);
        ctx.lineTo(boxX, ptrY);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = options.pointerFillColor ?? pointerStroke;
      ctx.beginPath();
      if (pointerAlign === 'left') {
        ctx.moveTo(boxX + boxW, ptrY);
        ctx.lineTo(boxX + boxW - tipW, ptrY - boxH / 2 + 1);
        ctx.lineTo(boxX + boxW - tipW, ptrY + boxH / 2 - 1);
      } else {
        ctx.moveTo(boxX, ptrY);
        ctx.lineTo(boxX + tipW, ptrY - boxH / 2 + 1);
        ctx.lineTo(boxX + tipW, ptrY + boxH / 2 - 1);
      }
      ctx.closePath();
      ctx.fill();

      if (options.connectorLine !== false) {
        const connectorStartX = pointerAlign === 'left' ? boxX + boxW : tapeX;
        const connectorEndX = pointerAlign === 'left' ? tapeX + tapeW : boxX;
        ctx.save();
        ctx.strokeStyle = options.connectorLineColor ?? options.headerStrokeColor ?? pointerStroke;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(connectorStartX, ptrY);
        ctx.lineTo(connectorEndX, ptrY);
        ctx.stroke();
        ctx.restore();
      }

      // inlineValue: draw text on tape badge at ptrY instead of header (no filled background)
      if (options.inlineValue) {
        const inlineText = currentValueFormatter(value);
        ctx.font = `bold ${Math.max(9, w * 0.08)}px Arial`;
        const metrics = ctx.measureText(inlineText);
        const paddingH = 6;
        const badgeW = Math.max(32, metrics.width + paddingH * 2);
        const badgeX = tapeX + 6; // inside tape, left padding
        // draw only text (no background) so pointer border remains visible
        ctx.fillStyle = options.inlineValueColor ? "#000" : "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(inlineText, badgeX, ptrY);
      } else {
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.max(9, w * 0.09)}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(currentValueFormatter(value), boxX + boxW / 2, ptrY);
      }
    }

    /** STR Tape (맨 오른쪽): 체결강도 기반 - 포인터 고정, 눈금 스크롤 */
    private drawVSITape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
      // 체결강도 보간값 사용 (소수점 유지로 부드럽게)
      const strength = this.strength;

      // 배경
      ctx.fillStyle = "#1e1e1e";
      ctx.fillRect(x, y, w, h);

       const tapeTop = y + 38;
       const tapeBot = y + h - 10;
       const tapeH = tapeBot - tapeTop;
       const ptrY = tapeTop + tapeH / 2;
       const tapeX = x + w * 0.5;
       const tapeW = w * 0.25;

       // 레이블
       ctx.fillStyle = "#00B050";
       ctx.font = `bold ${Math.max(7, w * 0.12)}px Arial`;
       ctx.textAlign = "center";
       ctx.textBaseline = "top";
       ctx.fillText("STR", x + w / 2, y + 4);

       // 상단 현재값 표시 (100 기준: 이상=매수우세, 미만=매도우세)
       ctx.fillStyle = strength >= 100 ? "#4caf50" : "#f44336";
       ctx.font = `bold ${Math.max(9, w * 0.16)}px Arial`;
       ctx.textAlign = "center";
       ctx.textBaseline = "top";
       ctx.fillText(strength.toFixed(1) + "%", x + w / 2, y + 16);

      // 테이프 배경
      ctx.fillStyle = "#111";
      ctx.fillRect(tapeX, tapeTop, tapeW, tapeH);

      // 눈금: 포인터 고정(중앙), 눈금이 체결강도에 따라 연속 스크롤
      const step = 25; // 25 단위 (주 눈금)
      const subStep = 12.5; // 12.5 중간 눈금
      const visibleSteps = 10;
      const pxPerStep = tapeH / visibleSteps;

      // 보간값의 소수 오프셋으로 눈금이 부드럽게 스크롤
      const fracOffset = (strength % step) / step;
      const baseVal = Math.floor(strength / step) * step;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, tapeTop, w, tapeH);
      ctx.clip();

      ctx.lineWidth = 1;
      ctx.font = `${Math.max(8, w * 0.16)}px Arial`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      for (let i = -visibleSteps - 1; i <= visibleSteps + 1; i++) {
        const val = baseVal + i * step;
        if (val < 0) continue;
        // fracOffset으로 눈금이 연속 스크롤 (부드럽게)
        const py = ptrY - (i - fracOffset) * pxPerStep;
        const isMain = val % 50 === 0 || val === 100; // 50 단위 또는 100 기준선
        const isSub = val % 25 === 0 && val % 50 !== 0; // 25 중간 눈금 (50의 배수 아닌)
        const tickW = isMain ? tapeW : (isSub ? tapeW * 0.7 : tapeW * 0.6);

        // 100 기준선 강조
        ctx.strokeStyle = val === 100 ? "#fff" : "#666";
        ctx.lineWidth = val === 100 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(tapeX + tapeW - tickW, py);
        ctx.lineTo(tapeX + tapeW, py);
        ctx.stroke();

        if (isMain) {
          ctx.fillStyle = val === 100 ? "#fff" : "#aaa";
          ctx.textAlign = "right";
          ctx.fillText(val.toString() + "%", tapeX - 3, py);
        }
      }

      ctx.restore();

       // 포인터 박스 (중앙 고정, 왼쪽 화살표 ◀ - 맨 오른쪽 테이프)
       const boxH = 20;
       const boxW = w - 6;
       const boxX = x + 3;
       const strColor = strength >= 100 ? "#00B050" : "#FF0000"; // 미국 기준: 상승=초록, 하강=빨강
       ctx.fillStyle = strColor;
       ctx.fillRect(boxX, ptrY - boxH / 2, boxW, boxH);
       // 왼쪽 화살표 삼각형
       ctx.beginPath();
       ctx.moveTo(boxX, ptrY - boxH / 2);
       ctx.lineTo(x - 5, ptrY);
       ctx.lineTo(boxX, ptrY + boxH / 2);
       ctx.closePath();
       ctx.fill();

       ctx.fillStyle = "#fff";
       ctx.font = `bold ${Math.max(9, w * 0.18)}px Arial`;
       ctx.textAlign = "center";
       ctx.textBaseline = "middle";
       ctx.fillText(strength.toFixed(1), boxX + boxW / 2, ptrY);
    }

    /** Compass Strip (하단) */
    private drawCompassStrip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
      ctx.fillStyle = "#111";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);

      const cx = x + w / 2;
      const cy = y + h / 2;
      const stripY = y + h * 0.55;

      // 현재 헤딩 (고정 23 = TBD)
      const heading = 230;
      const degPerPx = 0.5; // 1px = 0.5도

      // 눈금 그리기
      ctx.strokeStyle = "#aaa";
      ctx.fillStyle = "#aaa";
      ctx.font = `${Math.max(9, h * 0.2)}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineWidth = 1;

      for (let d = heading - 30; d <= heading + 30; d += 1) {
        const px = cx + (d - heading) / degPerPx;
        if (px < x || px > x + w) continue;

        const isMajor = d % 10 === 0;
        const isMid = d % 5 === 0;
        const tickH = isMajor ? h * 0.35 : isMid ? h * 0.22 : h * 0.12;

        ctx.beginPath();
        ctx.moveTo(px, stripY - tickH / 2);
        ctx.lineTo(px, stripY + tickH / 2);
        ctx.stroke();

        if (isMajor) {
          const label = ((d % 360) + 360) % 360;
          ctx.fillText(Math.floor(label / 10).toString(), px, stripY + tickH / 2 + 2);
        }
      }

      // 상단 삼각형 인덱스 (고정)
      ctx.fillStyle = "#ff00ff";
      ctx.beginPath();
      ctx.moveTo(cx, y + 4);
      ctx.lineTo(cx - 7, y + 16);
      ctx.lineTo(cx + 7, y + 16);
      ctx.closePath();
      ctx.fill();

      // 현재 헤딩 박스
      ctx.fillStyle = "#ff00ff";
      ctx.font = `bold ${Math.max(11, h * 0.28)}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${heading}H`, cx, y + h - 2);

      // MAG 레이블
      ctx.fillStyle = "#00B050";
      ctx.font = `${Math.max(9, h * 0.18)}px Arial`;
      ctx.textAlign = "right";
      ctx.fillText("MAG", x + w - 8, y + h - 4);

      // TBD 표시
      ctx.fillStyle = "#555";
      ctx.font = `${Math.max(9, h * 0.18)}px Arial`;
      ctx.textAlign = "left";
      ctx.fillText("TBD", x + 8, y + h - 4);
    }

    // ── 더 이상 사용하지 않는 구 메서드들 (삭제) ──────────────────
    private _unused_drawSpeedGauge(..._: any[]): void {}
    private _unused_drawPitchIndicator(..._: any[]): void {}
    private _unused_drawAltimeter(..._: any[]): void {}
    private _unused_drawVSI(..._: any[]): void {}
    private _unused_drawCompass(..._: any[]): void {}

    private resizeChartCanvas(): void {
      if (!this.chartCanvas) return;
      const container = this.chartCanvas.parentElement;
      if (container) {
        this.chartCanvas.width = container.clientWidth;
        this.chartCanvas.height = container.clientHeight;
      }
      
      // Resize 후 다시 그리기
      this.drawChart();
    }

    private drawChart(): void {
      if (!this.chartCtx || !this.chartCanvas || !this.stockService) return;

      const cw = this.chartCanvas.width;
      const ch = this.chartCanvas.height;
      const ctx = this.chartCtx;

      // 배경
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, cw, ch);

      // 데이터: 완성 캔들 + 현재 진행 중 캔들
      const candles = this.stockService.getMinCandles(this.selectedCode, 80).candles;
      const currentCandle = this.stockService.getCurrentCandle(this.selectedCode);
      // 현재 캔들의 close를 보간값으로 교체 (부드럽게)
      const liveCandle = { ...currentCandle, close: this.animatedCurrentPrice };
      const allCandles = [...candles, liveCandle];

      if (allCandles.length === 0) return;

      // 레이아웃
      const labelW = 60;   // 오른쪽 가격 눈금
      const volH = Math.floor(ch * 0.22); // 하단 거래량 영역
      const padT = 8;
      const padB = 4;
      const dividerH = 16; // 캔들/볼륨 사이 여백
      const plotX = 0;
      const plotW = cw - labelW;
      const priceH = ch - volH - padT - padB - dividerH;
      const priceTop = padT;
      const priceBot = padT + priceH;
      const volTop = priceBot + dividerH;
      const volBot = ch;

      // 가격 범위 계산 → target에 저장, 보간값으로 렌더링
      const highs = allCandles.map(c => c.high);
      const lows  = allCandles.map(c => c.low);
      const rawMaxP  = Math.max(...highs);
      const rawMinP  = Math.min(...lows);
      const rawMaxVol = Math.max(...allCandles.map(c => c.volume)) || 1;

      // 첫 프레임이면 즉시 세팅, 이후엔 보간
      if (this.animatedChartMaxP === 0) {
        this.animatedChartMaxP = rawMaxP;
        this.animatedChartMinP = rawMinP;
        this.animatedChartMaxVol = rawMaxVol;
      }
      this._targetChartMaxP   = rawMaxP;
      this._targetChartMinP   = rawMinP;
      this._targetChartMaxVol = rawMaxVol;

      const maxP   = this.animatedChartMaxP;
      const minP   = this.animatedChartMinP;
      const rangeP = maxP - minP || 1;
      const maxVol = this.animatedChartMaxVol;

      // 좌표 변환 함수
      const toY  = (price: number) => priceTop + priceH * (1 - (price - minP) / rangeP);
      const toVY = (vol: number)   => volBot - (volBot - volTop) * (vol / maxVol);

      // 캔들 너비 계산
      const count = allCandles.length;
      const candleW = Math.max(2, Math.floor(plotW / count) - 1);
      const spacing = plotW / count;

      // ── 가격 눈금 (오른쪽) ──────────────────────────────────
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(plotW, 0, labelW, ch);
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotW, 0);
      ctx.lineTo(plotW, ch);
      ctx.stroke();

      const priceSteps = 5;
      ctx.font = "10px Arial";
      ctx.textAlign = "left";
      ctx.fillStyle = "#666";
      for (let i = 0; i <= priceSteps; i++) {
        const val = maxP - (rangeP / priceSteps) * i;
        const py  = toY(val);
        // 점선
        ctx.strokeStyle = "#1e1e1e";
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(plotW, py);
        ctx.stroke();
        ctx.setLineDash([]);
        // 수치
        ctx.fillStyle = "#555";
        ctx.textBaseline = "middle";
        ctx.fillText(Math.floor(val).toLocaleString(), plotW + 4, py);
      }

      // ── 캔들 그리기 ──────────────────────────────────────────
      for (let i = 0; i < count; i++) {
        const c   = allCandles[i];
        const cx  = plotX + spacing * i + spacing / 2;
        const isUp = c.close >= c.open;
        const isLive = i === count - 1;
        const color = isLive ? "#ffeb3b" : isUp ? "#26a69a" : "#ef5350";

        const openY  = toY(c.open);
        const closeY = toY(c.close);
        const highY  = toY(c.high);
        const lowY   = toY(c.low);

        // 심지
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, highY);
        ctx.lineTo(cx, lowY);
        ctx.stroke();

        // 몸통
        const bodyTop = Math.min(openY, closeY);
        const bodyH   = Math.max(1, Math.abs(closeY - openY));
        ctx.fillStyle = color;
        ctx.fillRect(cx - candleW / 2, bodyTop, candleW, bodyH);

        // 거래량 바
        const vY = toVY(c.volume);
        ctx.fillStyle = isLive ? "rgba(255,235,59,0.5)" : isUp ? "rgba(38,166,154,0.4)" : "rgba(239,83,80,0.4)";
        ctx.fillRect(cx - candleW / 2, vY, candleW, volBot - vY);
      }

      // ── 현재가 수평선 ─────────────────────────────────────────
      const currentPriceY = toY(this.animatedCurrentPrice);
      ctx.strokeStyle = "#ffeb3b";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, currentPriceY);
      ctx.lineTo(plotW, currentPriceY);
      ctx.stroke();
      ctx.setLineDash([]);

      // 현재가 레이블
      ctx.fillStyle = "#ffeb3b";
      ctx.fillRect(plotW, currentPriceY - 9, labelW, 18);
      ctx.fillStyle = "#000";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(Math.floor(this.animatedCurrentPrice).toLocaleString(), plotW + 4, currentPriceY);

      // ── 거래량 구분선 ─────────────────────────────────────────
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, volTop);
      ctx.lineTo(cw, volTop);
      ctx.stroke();

      // ── 거래량 눈금 (오른쪽) ──────────────────────────────────
      const volSteps = 3;
      ctx.font = "9px Arial";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (let i = 0; i <= volSteps; i++) {
        const val = maxVol * (1 - i / volSteps);
        const vy  = volTop + (volBot - volTop) * (i / volSteps);
        if (vy >= volBot) continue;

        // 점선
        ctx.strokeStyle = "#1a1a1a";
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(0, vy);
        ctx.lineTo(plotW, vy);
        ctx.stroke();
        ctx.setLineDash([]);

        // 수치 (K 단위)
        ctx.fillStyle = "#555";
        const label = val >= 1000 ? (val / 1000).toFixed(0) + "K" : val.toFixed(0);
        ctx.fillText(label, plotW + 4, vy);
      }

      // VOL 레이블
      ctx.fillStyle = "#444";
      ctx.font = "9px Arial";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("VOL", 4, volTop + 2);
    }

    @addEventListener(".header-back", "click")
    onBackClick(): void {
      this.router?.go("/");
    }

    @addEventListener("#stockSelect", "change")
    onStockChange(e: Event): void {
      const select = e.target as HTMLSelectElement;
      this.selectedCode = select.value;
      // 종목 변경 시 보간값 즉시 리셋 (이전 종목 값에서 튀는 현상 방지)
      this.initializeFromService();
      this.updateData();
    }
  }

  return tagName;
};
