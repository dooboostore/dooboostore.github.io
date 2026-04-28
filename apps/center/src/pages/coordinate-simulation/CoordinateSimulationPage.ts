import {
  elementDefine,
  onConnectedShadow,
  addEventListener,
  onInitialize,
} from "@dooboostore/simple-web-component";
import { Router } from '@dooboostore/core-web';
import { AnimationFrameUtils  } from '@dooboostore/core-web';
import { MathUtil } from "@dooboostore/core";

const tagName = 'center-coordinate-2d-simulation-page';

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class Coordinate2DSimulationPage extends w.HTMLElement {
    private router!: Router;
     private canvas: HTMLCanvasElement | null = null;
     private ctx: CanvasRenderingContext2D | null = null;
     
     // 2D 좌표계 설정
     private readonly RESOLUTION = 100; // 내부 해상도: 0~100
     private currentX: number = 50;
     private currentY: number = 50;
     private targetFps: number = 60;
     private fpsSubscription: any = null;
     private zoom: number = 1; // 줌 레벨 (1 = 정상)
     
     // 베지에 곡선 애니메이션 - 세그먼트 기반
     private transactionDuration: number = 1; // 초 단위 (기본 1초)
     private allTrajectoryPoints: Array<{x: number, y: number}> = []; // 모든 궤적점 누적
     
     // 베지에 포인트 선택 상태
     private bezierPointSelectionMode: 'start' | 'control' | 'end' | 'none' = 'none';

     // 사용자가 클릭한 제어점 큐 (클릭한 점 자체가 베지에 제어점)
     // targetPoints[0] = 첫 번째 제어점, 마지막 = 최종 도착지
     private targetPoints: Array<{x: number, y: number}> = [];
     // 애니메이션 시작 기준점 (첫 세그먼트의 start)
     private animationStartPoint: {x: number, y: number} | null = null;
     
     // 애니메이션 세그먼트 큐
     private animationSegments: Array<{
       startX: number;
       startY: number;
       endX: number;
       endY: number;
       controlX: number; // 제어점 X
       controlY: number; // 제어점 Y
       startTime: number;
       trajectoryPoints: Array<{x: number, y: number}>;
     }> = [];
     
     private currentSegmentIndex: number = -1;
     
     // 터치 줌 관련
     private touchDistance: number = 0;
     private initialZoom: number = 1;

    // 줌 시 드래그 패닝 관련
    private panOffsetX: number = 0;
    private panOffsetY: number = 0;
    private isDragging: boolean = false;
    private dragMoved: boolean = false;
    private suppressNextClick: boolean = false;
    private dragStartX: number = 0;
    private dragStartY: number = 0;
    private dragStartPanX: number = 0;
    private dragStartPanY: number = 0;

    @onInitialize
    onInitialized(router: Router): void {
      this.router = router;
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
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px 24px;
            background: linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%);
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

          .header-title {
            font-size: 24px;
            font-weight: 700;
            flex: 1;
          }

          .header-subtitle {
            font-size: 12px;
            opacity: 0.8;
          }

          .content {
            display: flex;
            flex: 1;
            overflow: hidden;
            gap: 16px;
            padding: 16px;
          }

          .canvas-container {
            flex: 1;
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 8px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          #coordinateCanvas {
            width: 100%;
            height: 100%;
            display: block;
            cursor: grab;
            touch-action: none;
          }

          .controls {
            width: 240px;
            background: #242424;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            overflow-y: auto;
          }

          .control-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .control-label {
            font-size: 12px;
            font-weight: 600;
            color: #9c27b0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .control-value {
            font-size: 14px;
            color: #fff;
            font-family: 'Courier New', monospace;
          }

          input[type="range"] {
            width: 100%;
            height: 6px;
            border-radius: 3px;
            background: #1a1a1a;
            outline: none;
            -webkit-appearance: none;
            appearance: none;
          }

          input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #9c27b0;
            cursor: pointer;
            transition: all 0.2s ease;
          }

          input[type="range"]::-webkit-slider-thumb:hover {
            background: #7b1fa2;
            transform: scale(1.2);
          }

          input[type="range"]::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #9c27b0;
            cursor: pointer;
            border: none;
            transition: all 0.2s ease;
          }

          input[type="range"]::-moz-range-thumb:hover {
            background: #7b1fa2;
            transform: scale(1.2);
          }

          .button-group {
            display: flex;
            gap: 8px;
            flex-direction: column;
          }

          button {
            padding: 10px 16px;
            background: #9c27b0;
            border: none;
            border-radius: 6px;
            color: white;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            outline: none;
          }

          button:hover {
            background: #7b1fa2;
            transform: translateY(-1px);
          }

          button:focus-visible {
            box-shadow: 0 0 0 3px rgba(156, 39, 176, 0.3);
          }

          button:active {
            transform: translateY(0);
          }

          .reset-btn {
            background: #424242;
          }

          .reset-btn:hover {
            background: #555;
          }

          .info-box {
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid #555;
            border-radius: 4px;
            padding: 8px;
            font-size: 12px;
            line-height: 1.6;
            font-family: 'Courier New', monospace;
          }

          @media (max-width: 900px) {
            .content {
              flex-direction: column-reverse;
            }

            .controls {
              width: 100%;
              max-height: 200px;
            }
          }

          @media (max-width: 600px) {
            .header-title {
              font-size: 18px;
            }

            .header-subtitle {
              font-size: 11px;
            }

            .content {
              padding: 8px;
              gap: 8px;
            }

            .controls {
              padding: 12px;
            }
          }
        </style>

        <div class="container">
          <div class="header">
            <button class="header-back" aria-label="Go back">
              ← Back
            </button>
            <div>
              <div class="header-title">📐 2D Coordinate Simulation</div>
              <div class="header-subtitle">2D 좌표계 시뮬레이션 (0~100)</div>
            </div>
          </div>

          <div class="content">
            <div class="canvas-container">
              <canvas id="coordinateCanvas"></canvas>
            </div>

            <div class="controls">
              <div class="control-group">
                <label class="control-label">FPS 설정</label>
                <input type="range" id="fpsSetting" min="10" max="120" value="60" step="10">
                <div class="control-value" id="fpsValue">60 FPS</div>
              </div>

              <div class="control-group">
                <label class="control-label">트랜젝션 시간 (초)</label>
                <input type="range" id="transactionTime" min="0.5" max="5" value="1" step="0.1">
                <div class="control-value" id="transactionTimeValue">1.0s</div>
              </div>

              <div class="info-box">
                <div>Resolution: 0~100</div>
                <div id="currentFpsInfo">Current FPS: 0</div>
              </div>

              <div class="button-group">
                <button id="resetBtn">초기화</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    connectedCallback() {
      // Canvas 초기화
      this.canvas = this.shadowRoot?.querySelector(
        "#coordinateCanvas"
      ) as HTMLCanvasElement;
      if (this.canvas) {
        this.ctx = this.canvas.getContext("2d", { alpha: false });
        this.resizeCanvas();
        w.addEventListener("resize", () => this.resizeCanvas());
        
        // 캔버스 클릭 이벤트
        this.canvas.addEventListener("click", (e) => this.onCanvasClick(e));

        // 드래그 패닝 이벤트
        this.canvas.addEventListener("pointerdown", (e) => this.onCanvasPointerDown(e));
        this.canvas.addEventListener("pointermove", (e) => this.onCanvasPointerMove(e));
        this.canvas.addEventListener("pointerup", (e) => this.onCanvasPointerUp(e));
        this.canvas.addEventListener("pointercancel", (e) => this.onCanvasPointerUp(e));
        
        // 휠 줌 이벤트
        this.canvas.addEventListener("wheel", (e) => this.onCanvasWheel(e), { passive: false });
        
        // 모바일 pinch 줌 이벤트
        this.canvas.addEventListener("touchstart", (e) => this.onTouchStart(e), { passive: false });
        this.canvas.addEventListener("touchmove", (e) => this.onTouchMove(e), { passive: false });
        this.canvas.addEventListener("touchend", (e) => this.onTouchEnd(e), { passive: false });
      }

      // targetPoints 초기화
      this.targetPoints = [];
      this.animationStartPoint = null;
      this.bezierPointSelectionMode = 'control';  // 첫 클릭은 control step부터 시작

      // FPS 콜백 시작
      this.startFpsAnimation();
    }

    disconnectedCallback() {
      if (this.fpsSubscription) {
        this.fpsSubscription.unsubscribe?.();
      }
    }

    private resizeCanvas(): void {
      if (!this.canvas || !this.canvas.parentElement) return;

      const container = this.canvas.parentElement;
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight;
    }

    private startFpsAnimation(): void {
      if (this.fpsSubscription) {
        this.fpsSubscription.unsubscribe?.();
      }

      this.fpsSubscription = AnimationFrameUtils.dividePerFpsObservable({
        fpsConfig: { window: w },
        divideSize: this.targetFps
      }).subscribe((data: any) => {
        this.updateAnimation();
        this.draw(data.fps);
      });
    }

    private updateAnimation(): void {
      if (this.animationSegments.length === 0) return;

      const now = Date.now();

      // 현재 진행 중인 세그먼트 찾기
      // 각 세그먼트는 이전 세그먼트가 끝난 뒤 시작하므로 순서대로 탐색
      let activeSegmentIndex = -1;
      for (let i = 0; i < this.animationSegments.length; i++) {
        const segment = this.animationSegments[i];
        const elapsedTime = (now - segment.startTime) / 1000;

        if (elapsedTime < this.transactionDuration) {
          activeSegmentIndex = i;
          break;
        } else {
          // 이 세그먼트가 완료됐으면 다음 세그먼트의 startTime을 보정
          const nextSegment = this.animationSegments[i + 1];
          if (nextSegment) {
            const expectedNextStart = segment.startTime + this.transactionDuration * 1000;
            if (nextSegment.startTime < expectedNextStart) {
              // 다음 세그먼트가 이전 세그먼트 완료 전에 추가된 경우 → startTime 보정
              nextSegment.startTime = expectedNextStart;
            }
          }
        }
      }

      if (activeSegmentIndex === -1) {
        // 모든 세그먼트 완료 - 마지막 포인트 위치 확정
        if (this.animationSegments.length > 0) {
          const lastSegment = this.animationSegments[this.animationSegments.length - 1];
          this.currentX = lastSegment.endX;
          this.currentY = lastSegment.endY;
        }
        
        // 트랜젝션 완료 - targetPoints 리셋
        this.targetPoints = [];
        this.animationStartPoint = null;
        this.bezierPointSelectionMode = 'control';  // 다음 클릭은 control step부터 시작
        
        return;
      }

      // 현재 세그먼트 처리
      const segment = this.animationSegments[activeSegmentIndex];
      const elapsedTime = (now - segment.startTime) / 1000;
       const progress = Math.min(1, elapsedTime / this.transactionDuration);

       // 2차 베지에 곡선으로 현재 위치 계산
       this.currentX = MathUtil.quadraticBezier(segment.startX, segment.controlX, segment.endX, progress);
       this.currentY = MathUtil.quadraticBezier(segment.startY, segment.controlY, segment.endY, progress);

       // 궤적 포인트 생성
       const targetTrajectoryCount = Math.ceil(progress * 60);
       while (segment.trajectoryPoints.length < targetTrajectoryCount) {
         const i = segment.trajectoryPoints.length;
         const p = i / 60;
         const x = MathUtil.quadraticBezier(segment.startX, segment.controlX, segment.endX, p);
         const y = MathUtil.quadraticBezier(segment.startY, segment.controlY, segment.endY, p);
         segment.trajectoryPoints.push({x, y});
         this.allTrajectoryPoints.push({x, y}); // 누적 저장
       }

       this.currentSegmentIndex = activeSegmentIndex;
     }

    private linearBezier(start: number, end: number, t: number): number {
      return start + (end - start) * t;
    }

    private calculateControlPoint(startX: number, startY: number, endX: number, endY: number): {x: number, y: number} {
      // 시작점과 끝점의 중점을 기반으로 제어점 계산
      // 수직/수평으로 약간 오프셋된 곡선을 만들기 위해
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      
      // 방향 벡터
      const dx = endX - startX;
      const dy = endY - startY;
      
      // 수직 벡터 (90도 회전)
      const perpX = -dy;
      const perpY = dx;
      
      // 거리에 따라 제어점을 오프셋 (거리가 멀수록 곡선이 큼)
      const distance = Math.sqrt(dx * dx + dy * dy);
      const offset = Math.min(distance * 0.3, 15); // 최대 오프셋 제한
      
      const length = Math.sqrt(perpX * perpX + perpY * perpY);
      const normalX = perpX / length;
      const normalY = perpY / length;
      
      return {
        x: midX + normalX * offset,
        y: midY + normalY * offset
      };
    }

    private onCanvasClick(event: MouseEvent): void {
      if (!this.canvas) return;

      const rect = this.canvas.getBoundingClientRect();
      const canvasX = event.clientX - rect.left;
      const canvasY = event.clientY - rect.top;

      if (this.suppressNextClick) {
        this.suppressNextClick = false;
        return;
      }

      // Shift+클릭: 큐 초기화 후 현재 위치 → 마지막 접선 제어점 → 클릭 위치로 즉각 이동
      if (event.shiftKey) {
        this.onShiftClick(event.clientX, event.clientY, canvasX, canvasY);
        return;
      }

      // Canvas 좌표를 좌표계 좌표로 변환
      const scale = Math.min(this.canvas.width, this.canvas.height);
      const pixelPerUnit = (scale / this.RESOLUTION) * this.zoom;
      const offsetX = (this.canvas.width - this.RESOLUTION * pixelPerUnit) / 2 + this.panOffsetX;
      const offsetY = (this.canvas.height - this.RESOLUTION * pixelPerUnit) / 2 + this.panOffsetY;

      // 클릭 위치를 좌표계 범위 내에서 계산
      let clickX = (canvasX - offsetX) / pixelPerUnit;
      let clickY = this.RESOLUTION - (canvasY - offsetY) / pixelPerUnit;

      // 좌표계 범위 내로 제한
      clickX = Math.max(0, Math.min(this.RESOLUTION, clickX));
      clickY = Math.max(0, Math.min(this.RESOLUTION, clickY));

      const clickPoint = { x: clickX, y: clickY };

      // 상태 기반 목표 포인트 설정
      switch (this.bezierPointSelectionMode) {
        case 'control': {
          // 첫 번째 클릭: 애니메이션 시작, 클릭점이 첫 번째 제어점
          this.animationStartPoint = { x: this.currentX, y: this.currentY };
          this.targetPoints = [clickPoint];
          this.bezierPointSelectionMode = 'end';

          // 세그먼트 재구성
          this.rebuildSegments();

          console.log(`[Click 1] 제어점 추가 → (${clickPoint.x.toFixed(1)}, ${clickPoint.y.toFixed(1)})`);
          break;
        }

        case 'end': {
          // 이후 클릭: 제어점 추가 → 세그먼트 재구성
          this.targetPoints.push(clickPoint);
          this.rebuildSegments();

          console.log(`[Click ${this.targetPoints.length}] 제어점 추가 → (${clickPoint.x.toFixed(1)}, ${clickPoint.y.toFixed(1)}), 세그먼트: ${this.animationSegments.length}`);
          break;
        }
      }
     }

     private onShiftClick(clientX: number, clientY: number, canvasX: number, canvasY: number): void {
      if (!this.canvas) return;

      const scale = Math.min(this.canvas.width, this.canvas.height);
      const pixelPerUnit = (scale / this.RESOLUTION) * this.zoom;
      const offsetX = (this.canvas.width - this.RESOLUTION * pixelPerUnit) / 2 + this.panOffsetX;
      const offsetY = (this.canvas.height - this.RESOLUTION * pixelPerUnit) / 2 + this.panOffsetY;

      let clickX = (canvasX - offsetX) / pixelPerUnit;
      let clickY = this.RESOLUTION - (canvasY - offsetY) / pixelPerUnit;
      clickX = Math.max(0, Math.min(this.RESOLUTION, clickX));
      clickY = Math.max(0, Math.min(this.RESOLUTION, clickY));

      const clickPoint = { x: clickX, y: clickY };

      // 큐 전체 초기화
      this.animationSegments = [];
      this.currentSegmentIndex = -1;

      // animationStartPoint = 현재 위치
      this.animationStartPoint = { x: this.currentX, y: this.currentY };

      // targetPoints = [마지막 제어점(있으면), 클릭한 점]
      const lastControl = this.targetPoints.length > 0
        ? this.targetPoints[this.targetPoints.length - 1]
        : null;

      this.targetPoints = lastControl
        ? [lastControl, clickPoint]
        : [clickPoint];

      this.bezierPointSelectionMode = 'end';

      this.rebuildSegments();

      console.log(`[Shift+Click] 즉각 이동 → (${clickPoint.x.toFixed(1)}, ${clickPoint.y.toFixed(1)}), 제어점: ${this.targetPoints.length}개`);
    }

     /**
      * targetPoints(제어점 배열)로부터 세그먼트를 재구성한다.
      *
      * 알고리즘 (de Casteljau 분할):
      *   P0 = animationStartPoint (현재 위치)
      *   P1, P2, ... Pn = targetPoints (사용자가 클릭한 제어점들)
      *
      *   세그먼트 i (0 <= i < n):
      *     start   = i==0 ? P0 : mid(Pi, Pi+1) ... 단 i==n-1이면 Pn 자체
      *     control = Pi+1
      *     end     = i==n-1 ? Pn : mid(Pi+1, Pi+2)
      *
      *   즉 클릭한 점들이 제어점이 되고, 인접 제어점의 중점이 세그먼트 경계가 된다.
      *   마지막 제어점은 곡선의 최종 도착지가 된다.
      *
      * 이미 완료된 세그먼트는 건드리지 않고, 현재 진행 중인 세그먼트부터 재구성한다.
      */
     private rebuildSegments(): void {
       if (!this.animationStartPoint || this.targetPoints.length === 0) return;

       const P0 = this.animationStartPoint;
       const pts = this.targetPoints; // P1..Pn
       const n = pts.length;

       // 이미 완료된 세그먼트 수 파악 (startTime 기준)
       const now = Date.now();
       let completedCount = 0;
       for (let i = 0; i < this.animationSegments.length; i++) {
         const seg = this.animationSegments[i];
         const elapsed = (now - seg.startTime) / 1000;
         if (elapsed >= this.transactionDuration) {
           completedCount = i + 1;
         } else {
           break;
         }
       }

       // 완료된 세그먼트는 유지, 나머지는 재구성
       const kept = this.animationSegments.slice(0, completedCount);

       // 새 세그먼트 배열 구성
       const newSegments: typeof this.animationSegments = [];

       for (let i = 0; i < n; i++) {
         const control = pts[i]; // 클릭한 점 = 제어점

         // start: i==0이면 P0, 아니면 mid(pts[i-1], pts[i])
         const start = i === 0
           ? P0
           : { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 };

         // end: 마지막이면 pts[i] 자체(도착지), 아니면 mid(pts[i], pts[i+1])
         const end = i === n - 1
           ? pts[i]
           : { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };

         newSegments.push({
           startX: start.x,
           startY: start.y,
           controlX: control.x,
           controlY: control.y,
           endX: end.x,
           endY: end.y,
           startTime: 0, // 아래에서 타이밍 설정
           trajectoryPoints: []
         });
       }

       // 완료된 세그먼트는 그대로 유지하고, 나머지는 새로 구성한 것으로 교체
       // 완료된 세그먼트 수만큼은 kept에서 가져오고, 나머지는 newSegments에서 가져옴
       // 단, 완료된 세그먼트가 newSegments보다 많으면 그냥 kept만 사용
       const result: typeof this.animationSegments = [...kept];

       for (let i = completedCount; i < newSegments.length; i++) {
         const seg = newSegments[i];
         if (i === completedCount) {
           // 현재 진행 중인 세그먼트: 기존 startTime 유지 (진행 중이면 이어서)
           const existing = this.animationSegments[i];
           seg.startTime = existing ? existing.startTime : now;
           seg.trajectoryPoints = existing ? existing.trajectoryPoints : [];
         } else {
           // 미래 세그먼트: 이전 세그먼트 완료 후 시작
           const prevSeg = result[i - 1];
           seg.startTime = prevSeg
             ? prevSeg.startTime + this.transactionDuration * 1000
             : now;
         }
         result.push(seg);
       }

       this.animationSegments = result;
       this.currentSegmentIndex = completedCount;

       console.log(`[rebuildSegments] 제어점 ${n}개 → 세그먼트 ${result.length}개 (완료: ${completedCount}개)`);
     }

     private addBezierSegment(
       start: {x: number, y: number},
       center: {x: number, y: number},
       end: {x: number, y: number}
     ): void {
      const segment = {
        startX: start.x,
        startY: start.y,
        endX: end.x,
        endY: end.y,
        controlX: center.x,
        controlY: center.y,
        startTime: Date.now(),
        trajectoryPoints: [] as Array<{x: number, y: number}>
      };

      console.log(`[Segment] 추가: (${segment.startX.toFixed(1)},${segment.startY.toFixed(1)}) → ctrl(${segment.controlX.toFixed(1)},${segment.controlY.toFixed(1)}) → (${segment.endX.toFixed(1)},${segment.endY.toFixed(1)})`);

      this.animationSegments.push(segment);
    }

    private draw(currentFps: number): void {
      if (!this.ctx || !this.canvas) return;

      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const ctx = this.ctx;

      // 배경
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, cw, ch);

      // 디스플레이 해상도에 맞춰 계산
      const scale = Math.min(cw, ch);
      const pixelPerUnit = (scale / this.RESOLUTION) * this.zoom;
      const offsetX = (cw - this.RESOLUTION * pixelPerUnit) / 2 + this.panOffsetX;
      const offsetY = (ch - this.RESOLUTION * pixelPerUnit) / 2 + this.panOffsetY;

      // 좌표계 그리기
      this.drawCoordinateSystem(ctx, offsetX, offsetY, pixelPerUnit);

      // 현재 위치 표시
      this.drawCurrentPoint(ctx, offsetX, offsetY, pixelPerUnit, currentFps);
    }

    private drawCoordinateSystem(
      ctx: CanvasRenderingContext2D,
      offsetX: number,
      offsetY: number,
      pixelPerUnit: number
    ): void {
      const gridStep = 10; // 10 단위마다 그리드
      
      // 그리드 그리기
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 0.5;
      
      for (let i = 0; i <= this.RESOLUTION; i += gridStep) {
        const px = offsetX + i * pixelPerUnit;
        const py = offsetY + i * pixelPerUnit;
        
        // 수직선
        ctx.beginPath();
        ctx.moveTo(px, offsetY);
        ctx.lineTo(px, offsetY + this.RESOLUTION * pixelPerUnit);
        ctx.stroke();
        
        // 수평선
        ctx.beginPath();
        ctx.moveTo(offsetX, py);
        ctx.lineTo(offsetX + this.RESOLUTION * pixelPerUnit, py);
        ctx.stroke();
      }

      // 중앙선 강조 (0~100 중심)
      ctx.strokeStyle = "#666";
      ctx.lineWidth = 1;
      const centerPx = offsetX + 50 * pixelPerUnit;
      const centerPy = offsetY + 50 * pixelPerUnit;
      
      // 수직 중앙선
      ctx.beginPath();
      ctx.moveTo(centerPx, offsetY);
      ctx.lineTo(centerPx, offsetY + this.RESOLUTION * pixelPerUnit);
      ctx.stroke();
      
      // 수평 중앙선
      ctx.beginPath();
      ctx.moveTo(offsetX, centerPy);
      ctx.lineTo(offsetX + this.RESOLUTION * pixelPerUnit, centerPy);
      ctx.stroke();

      // 테두리
      ctx.strokeStyle = "#888";
      ctx.lineWidth = 2;
      ctx.strokeRect(offsetX, offsetY, this.RESOLUTION * pixelPerUnit, this.RESOLUTION * pixelPerUnit);

      // 축 라벨
      ctx.fillStyle = "#9c27b0";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("100", offsetX + this.RESOLUTION * pixelPerUnit - 4, offsetY + 4);
      
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("100", offsetX + 4, offsetY + this.RESOLUTION * pixelPerUnit - 4);
    }

    private drawCurrentPoint(
      ctx: CanvasRenderingContext2D,
      offsetX: number,
      offsetY: number,
      pixelPerUnit: number,
      currentFps: number
    ): void {
      // 모든 누적 궤적 그리기
      if (this.allTrajectoryPoints.length > 0) {
        ctx.strokeStyle = "rgba(156, 39, 176, 0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();

        const firstPoint = this.allTrajectoryPoints[0];
        ctx.moveTo(
          offsetX + firstPoint.x * pixelPerUnit,
          offsetY + (this.RESOLUTION - firstPoint.y) * pixelPerUnit
        );

        for (let i = 1; i < this.allTrajectoryPoints.length; i++) {
          const point = this.allTrajectoryPoints[i];
          ctx.lineTo(
            offsetX + point.x * pixelPerUnit,
            offsetY + (this.RESOLUTION - point.y) * pixelPerUnit
          );
        }
        ctx.stroke();

        // 누적 궤적 포인트 표시 (작은 원)
        ctx.fillStyle = "rgba(156, 39, 176, 0.3)";
        for (let i = 0; i < this.allTrajectoryPoints.length; i += 10) {
          const point = this.allTrajectoryPoints[i];
          const px = offsetX + point.x * pixelPerUnit;
          const py = offsetY + (this.RESOLUTION - point.y) * pixelPerUnit;
          ctx.beginPath();
          ctx.arc(px, py, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 현재 진행 중인 세그먼트의 궤적만 강조 표시
      if (this.currentSegmentIndex >= 0 && this.currentSegmentIndex < this.animationSegments.length) {
        const currentSegment = this.animationSegments[this.currentSegmentIndex];
        if (currentSegment.trajectoryPoints.length > 0) {
          ctx.strokeStyle = "rgba(255, 152, 0, 0.6)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();

          const firstPoint = currentSegment.trajectoryPoints[0];
          ctx.moveTo(
            offsetX + firstPoint.x * pixelPerUnit,
            offsetY + (this.RESOLUTION - firstPoint.y) * pixelPerUnit
          );

          for (let i = 1; i < currentSegment.trajectoryPoints.length; i++) {
            const point = currentSegment.trajectoryPoints[i];
            ctx.lineTo(
              offsetX + point.x * pixelPerUnit,
              offsetY + (this.RESOLUTION - point.y) * pixelPerUnit
            );
          }
          ctx.stroke();

          // 현재 세그먼트 궤적 포인트 강조
          ctx.fillStyle = "rgba(255, 152, 0, 0.8)";
          for (let i = 0; i < currentSegment.trajectoryPoints.length; i += 5) {
            const point = currentSegment.trajectoryPoints[i];
            const px = offsetX + point.x * pixelPerUnit;
            const py = offsetY + (this.RESOLUTION - point.y) * pixelPerUnit;
            ctx.beginPath();
            ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 베지에 포인터 및 제어선 표시
      this.drawBezierControlPoints(ctx, offsetX, offsetY, pixelPerUnit);

      // Pending 포인트 표시 (선택 진행 중)
      this.drawPendingPoints(ctx, offsetX, offsetY, pixelPerUnit);

      const px = offsetX + this.currentX * pixelPerUnit;
      const py = offsetY + (this.RESOLUTION - this.currentY) * pixelPerUnit;

      // 포인트 그리기
      ctx.fillStyle = "#ff9800";
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fill();

      // 포인트 외곽선
      ctx.strokeStyle = "#ffb74d";
      ctx.lineWidth = 2;
      ctx.stroke();

      // 좌표 정보 표시
      ctx.fillStyle = "#00B050";
      ctx.font = "bold 16px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`(${this.currentX.toFixed(1)}, ${this.currentY.toFixed(1)})`, px, py - 20);

      // FPS 정보 표시
      const padding = 16;
      ctx.fillStyle = "#9c27b0";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`FPS: ${currentFps.toFixed(1)}`, padding, padding);

      // 상태 표시
      if (this.targetPoints.length > 0) {
        let stateText = '';
        if (this.bezierPointSelectionMode === 'control') {
          stateText = '📍 Step 1: 제어점 설정 대기중';
        } else if (this.bezierPointSelectionMode === 'end') {
          stateText = `✅ 애니메이션 진행 중 (큐: ${this.targetPoints.length}개 / 세그먼트: ${this.animationSegments.length}개)`;
        }
        ctx.fillStyle = "#ffeb3b";
        ctx.fillText(`상태: ${stateText}`, padding, padding + 24);
      } else if (this.animationSegments.length > 0) {
        const now = Date.now();
        let progress = 0;
        
        if (this.currentSegmentIndex >= 0 && this.currentSegmentIndex < this.animationSegments.length) {
          const segment = this.animationSegments[this.currentSegmentIndex];
          const elapsedTime = (now - segment.startTime) / 1000;
          progress = (Math.min(this.transactionDuration, elapsedTime) / this.transactionDuration) * 100;
        }
        
        ctx.fillStyle = "#9c27b0";
        ctx.fillText(`Segments: ${this.animationSegments.length} | Progress: ${progress.toFixed(1)}%`, padding, padding + 24);
      }

      // 업데이트 FPS 인포
      const fpsInfo = this.shadowRoot?.querySelector('#currentFpsInfo') as HTMLElement;
      if (fpsInfo) {
        fpsInfo.textContent = `Current FPS: ${currentFps.toFixed(1)}`;
      }
    }

     private drawPendingPoints(
       ctx: CanvasRenderingContext2D,
       offsetX: number,
       offsetY: number,
       pixelPerUnit: number
     ): void {
       // 현재 진행 중인 세그먼트의 제어점/끝점 표시
       const lastSegment = this.animationSegments[this.animationSegments.length - 1];
       if (!lastSegment) return;

       const padding = 16;

       // 끝점 (파랑)
       const endPx = offsetX + lastSegment.endX * pixelPerUnit;
       const endPy = offsetY + (this.RESOLUTION - lastSegment.endY) * pixelPerUnit;
       ctx.fillStyle = "rgba(33, 150, 243, 0.9)";
       ctx.beginPath();
       ctx.arc(endPx, endPy, 5, 0, Math.PI * 2);
       ctx.fill();
       ctx.strokeStyle = "#2196f3";
       ctx.lineWidth = 2;
       ctx.stroke();

       // 안내 텍스트
       ctx.fillStyle = "#ffeb3b";
       ctx.font = "bold 13px Arial";
       ctx.textAlign = "left";
       ctx.textBaseline = "top";

       if (this.bezierPointSelectionMode === 'control') {
         ctx.fillText("📍 클릭하여 이동 시작", padding, this.allTrajectoryPoints.length > 100 ? padding + 410 : padding + 80);
       } else if (this.bezierPointSelectionMode === 'end') {
         ctx.fillText(`📍 클릭: 큐 추가 | Shift+클릭: 즉각 이동 (큐: ${this.targetPoints.length}개)`, padding, this.allTrajectoryPoints.length > 100 ? padding + 410 : padding + 80);
       }
     }

     private drawBezierControlPoints(
       ctx: CanvasRenderingContext2D,
       offsetX: number,
       offsetY: number,
       pixelPerUnit: number
     ): void {
       if (this.animationSegments.length === 0 || this.targetPoints.length === 0) return;

       // 베지에 곡선 시각화 (세그먼트별 파란 곡선)
       for (let i = Math.max(0, this.currentSegmentIndex); i < this.animationSegments.length; i++) {
         const segment = this.animationSegments[i];
         ctx.strokeStyle = "rgba(33, 150, 243, 0.3)";
         ctx.lineWidth = 2;
         ctx.beginPath();
         let firstPoint = true;
         for (let t = 0; t <= 1; t += 0.05) {
           const x = MathUtil.quadraticBezier(segment.startX, segment.controlX, segment.endX, t);
           const y = MathUtil.quadraticBezier(segment.startY, segment.controlY, segment.endY, t);
           const px = offsetX + x * pixelPerUnit;
           const py = offsetY + (this.RESOLUTION - y) * pixelPerUnit;
           if (firstPoint) { ctx.moveTo(px, py); firstPoint = false; }
           else { ctx.lineTo(px, py); }
         }
         ctx.stroke();
       }

       // 사용자가 클릭한 제어점들만 표시
       // 마지막 점 = 최종 도착지 (노랑 강조), 나머지 = 제어점 (노랑 작게)
       for (let i = 0; i < this.targetPoints.length; i++) {
         const pt = this.targetPoints[i];
         const px = offsetX + pt.x * pixelPerUnit;
         const py = offsetY + (this.RESOLUTION - pt.y) * pixelPerUnit;
         const isLast = i === this.targetPoints.length - 1;

         // 제어점 → 이전 제어점과 연결선 (점선)
         if (i > 0) {
           const prev = this.targetPoints[i - 1];
           const prevPx = offsetX + prev.x * pixelPerUnit;
           const prevPy = offsetY + (this.RESOLUTION - prev.y) * pixelPerUnit;
           ctx.strokeStyle = "rgba(255, 235, 59, 0.3)";
           ctx.lineWidth = 1;
           ctx.setLineDash([3, 4]);
           ctx.beginPath();
           ctx.moveTo(prevPx, prevPy);
           ctx.lineTo(px, py);
           ctx.stroke();
           ctx.setLineDash([]);
         } else if (this.animationStartPoint) {
           // 첫 제어점 → 시작점 연결선
           const sp = this.animationStartPoint;
           const spx = offsetX + sp.x * pixelPerUnit;
           const spy = offsetY + (this.RESOLUTION - sp.y) * pixelPerUnit;
           ctx.strokeStyle = "rgba(255, 235, 59, 0.3)";
           ctx.lineWidth = 1;
           ctx.setLineDash([3, 4]);
           ctx.beginPath();
           ctx.moveTo(spx, spy);
           ctx.lineTo(px, py);
           ctx.stroke();
           ctx.setLineDash([]);
         }

         // 제어점 원
         ctx.fillStyle = isLast ? "#ffeb3b" : "rgba(255, 235, 59, 0.7)";
         ctx.beginPath();
         ctx.arc(px, py, isLast ? 5 : 3, 0, Math.PI * 2);
         ctx.fill();
         ctx.strokeStyle = "#ffeb3b";
         ctx.lineWidth = isLast ? 2 : 1;
         ctx.stroke();

         // 마지막 점에 좌표 라벨
         if (isLast) {
           ctx.fillStyle = "#ffeb3b";
           ctx.font = "bold 11px Arial";
           ctx.textAlign = "center";
           ctx.textBaseline = "bottom";
           ctx.fillText(`(${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`, px, py - 8);
         }
       }

       // 범례
       const padding = 16;
       ctx.font = "bold 11px Arial";
       ctx.textAlign = "left";
       ctx.textBaseline = "top";
       ctx.fillStyle = "#ffeb3b";
       ctx.fillText("● 제어점 (클릭)", padding, this.allTrajectoryPoints.length > 100 ? padding + 380 : padding + 48);
     }

    @addEventListener('.header-back', 'click')
    onBackClick() {
      this.router?.go('/');
    }

    @addEventListener('#fpsSetting', 'input', { delegate: true })
    onFpsChange(e: Event) {
      const input = e.target as HTMLInputElement;
      this.targetFps = parseInt(input.value);
      const display = this.shadowRoot?.querySelector('#fpsValue') as HTMLElement;
      if (display) display.textContent = `${this.targetFps} FPS`;
      this.startFpsAnimation();
    }

    @addEventListener('#transactionTime', 'input', { delegate: true })
    onTransactionTimeChange(e: Event) {
      const input = e.target as HTMLInputElement;
      this.transactionDuration = parseFloat(input.value);
      const display = this.shadowRoot?.querySelector('#transactionTimeValue') as HTMLElement;
      if (display) display.textContent = this.transactionDuration.toFixed(1) + 's';
    }

    @addEventListener('#coordX', 'input', { delegate: true })
    onCoordXChange(e: Event) {
      const input = e.target as HTMLInputElement;
      this.currentX = parseFloat(input.value);
      const display = this.shadowRoot?.querySelector('#coordXValue') as HTMLElement;
      if (display) display.textContent = this.currentX.toFixed(1);
    }

    @addEventListener('#coordY', 'input', { delegate: true })
    onCoordYChange(e: Event) {
      const input = e.target as HTMLInputElement;
      this.currentY = parseFloat(input.value);
      const display = this.shadowRoot?.querySelector('#coordYValue') as HTMLElement;
      if (display) display.textContent = this.currentY.toFixed(1);
    }

    @addEventListener('#zoomLevel', 'input', { delegate: true })
    onZoomChange(e: Event) {
      const input = e.target as HTMLInputElement;
      this.zoom = parseFloat(input.value);
      const display = this.shadowRoot?.querySelector('#zoomValue') as HTMLElement;
      if (display) display.textContent = this.zoom.toFixed(1) + 'x';
    }

    @addEventListener('#resetBtn', 'click', { delegate: true })
    onReset() {
      this.currentX = 50;
      this.currentY = 50;
      this.targetFps = 60;
      this.zoom = 1;
      this.transactionDuration = 1;
      this.animationSegments = [];
      this.allTrajectoryPoints = [];
      this.currentSegmentIndex = -1;
      this.targetPoints = [];
      this.animationStartPoint = null;
      this.bezierPointSelectionMode = 'control';

      const inputX = this.shadowRoot?.querySelector('#coordX') as HTMLInputElement;
      const inputY = this.shadowRoot?.querySelector('#coordY') as HTMLInputElement;
      const inputFps = this.shadowRoot?.querySelector('#fpsSetting') as HTMLInputElement;
      const inputZoom = this.shadowRoot?.querySelector('#zoomLevel') as HTMLInputElement;
      const inputTransaction = this.shadowRoot?.querySelector('#transactionTime') as HTMLInputElement;
      const displayX = this.shadowRoot?.querySelector('#coordXValue') as HTMLElement;
      const displayY = this.shadowRoot?.querySelector('#coordYValue') as HTMLElement;
      const displayFps = this.shadowRoot?.querySelector('#fpsValue') as HTMLElement;
      const displayZoom = this.shadowRoot?.querySelector('#zoomValue') as HTMLElement;
      const displayTransaction = this.shadowRoot?.querySelector('#transactionTimeValue') as HTMLElement;

      if (inputX) inputX.value = '50';
      if (inputY) inputY.value = '50';
      if (inputFps) inputFps.value = '60';
      if (inputZoom) inputZoom.value = '1';
      if (inputTransaction) inputTransaction.value = '1';
      if (displayX) displayX.textContent = '50';
      if (displayY) displayY.textContent = '50';
      if (displayFps) displayFps.textContent = '60 FPS';
      if (displayZoom) displayZoom.textContent = '1.0x';
      if (displayTransaction) displayTransaction.textContent = '1.0s';

      this.startFpsAnimation();
    }

    private onCanvasWheel(event: WheelEvent): void {
      event.preventDefault();
      
      // 스크롤 방향: deltaY < 0이면 위로 (확대), deltaY > 0이면 아래로 (축소)
      const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = this.zoom * zoomFactor;
      
      // 줌 레벨 제한 (0.5x ~ 3x)
      this.zoom = Math.max(0.5, Math.min(3, newZoom));

      if (this.zoom <= 1.001) {
        this.panOffsetX = 0;
        this.panOffsetY = 0;
      }

      this.draw(0);
    }

    private onCanvasPointerDown(event: PointerEvent): void {
      if (!this.canvas) return;
      if (this.zoom <= 1.001) return;

      this.isDragging = true;
      this.dragMoved = false;
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.dragStartPanX = this.panOffsetX;
      this.dragStartPanY = this.panOffsetY;

      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.style.cursor = "grabbing";
    }

    private onCanvasPointerMove(event: PointerEvent): void {
      if (!this.canvas || !this.isDragging) return;

      const dx = event.clientX - this.dragStartX;
      const dy = event.clientY - this.dragStartY;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;

      this.dragMoved = true;
      this.panOffsetX = this.dragStartPanX + dx;
      this.panOffsetY = this.dragStartPanY + dy;
      this.draw(0);
    }

    private onCanvasPointerUp(event: PointerEvent): void {
      if (!this.canvas) return;

      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      if (this.dragMoved) {
        this.suppressNextClick = true;
      }

      this.isDragging = false;
      this.canvas.style.cursor = "grab";
    }

    private onTouchStart(event: TouchEvent): void {
      if (event.touches.length === 2) {
        // 두 손가락 거리 계산
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        this.touchDistance = Math.sqrt(dx * dx + dy * dy);
        this.initialZoom = this.zoom;
      }
    }

    private onTouchMove(event: TouchEvent): void {
      if (event.touches.length === 2) {
        event.preventDefault();
        
        // 현재 두 손가락 거리 계산
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);
        
        // 거리 비율로 줌 계산
        const ratio = currentDistance / this.touchDistance;
        const newZoom = this.initialZoom * ratio;
        
        // 줌 레벨 제한 (0.5x ~ 3x)
        this.zoom = Math.max(0.5, Math.min(3, newZoom));
      }
    }

    private onTouchEnd(event: TouchEvent): void {
      if (event.touches.length < 2) {
        this.touchDistance = 0;
      }
    }
  }

  return tagName;
};
