import {
  elementDefine,
  eventShadow,
  eventWindow,
  mutationObserverLight,
  onConnectedAfter,
  onConnectedBodyShadow,
  queryShadow,
  resizeObserverLight,
} from '@dooboostore/simple-web-component';

const tagName = 'bubble-chart';

/** child <bubble> 요소 한 건 */
export interface BubbleChartPoint {
  /** 라벨 (카테고리명 등) */
  label: string;
  /** X축 값 (회전율 = 거래대금/시가총액, 0~1) */
  x: number;
  /** Y축 값 (등락률) */
  y: number;
  /** 버블 크기 값 (시가총액) */
  r: number;
  /** 내부 원 크기 값 (거래대금 절대액) */
  amount: number;
}

export interface BubbleChart extends HTMLElement {
  setData(points: BubbleChartPoint[]): void;
}

// ── 포맷 유틸 ──────────────────────────────────────────────────────
function fmtAxis(v: number): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e12) return (v / 1e12).toFixed(1) + '조';
  if (abs >= 1e8)  return Math.round(v / 1e8).toLocaleString() + '억';
  if (abs >= 1e4)  return Math.round(v / 1e4).toLocaleString() + '만';
  // 소수 → % 표기로 간주 (-0.034 → -3.4%) — 시가총액 0 제외
  if (Math.abs(v) < 1) return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
  return v.toLocaleString();
}

/** 회전율 전용 포맷: 소수값을 항상 % 로 표시 (1.2803 → "+128.03%") */
function fmtTurnover(v: number): string {
  const pct = v * 100;
  const sign = pct >= 0 ? '+' : '';
  return sign + pct.toFixed(2) + '%';
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return existing;

  @elementDefine(tagName, { window: w })
  class BubbleChartImpl extends w.HTMLElement implements BubbleChart {
    // ── 상태 ──
    private points: BubbleChartPoint[] = [];
    private selectedIdx = -1;

    // 핀치/휠 줌 상태
    private scaleX = 1;   // x축 줌 배율 (1 = 자동 fit)
    private scaleY = 1;   // y축 줌 배율
    private offsetX = 0;  // x축 이동 (데이터 공간)
    private offsetY = 0;  // y축 이동
    private pinchDist0 = 0;
    private pinchScaleX0 = 1;
    private pinchScaleY0 = 1;
    private dragging = false;
    private dragLastX = 0;
    private dragLastY = 0;
    private downX = 0;
    private downY = 0;
    private lastTouchEndTime = 0;
    private swapAxes = false;

    // ── API ──
    setData(points: BubbleChartPoint[]): void {
      this.points = points || [];
      this.resetView();
      if (this.isConnected && this.canvas) this.draw();
    }

    private resetView() {
      this.scaleX = 1; this.scaleY = 1;
      this.offsetX = 0; this.offsetY = 0;
      this.selectedIdx = -1;
      if (this.tooltip) this.tooltip.style.display = 'none';
    }

    // ── 줌 공통 헬퍼 ──
    private getFitBounds() {
      const pts = this.points;
      if (pts.length === 0) return null;
      const xRaw = pts.map(p => this.swapAxes ? p.y : p.x);
      const yRaw = pts.map(p => this.swapAxes ? p.x : p.y);
      const xFitMin = Math.min(...xRaw);
      const xFitMax = Math.max(...xRaw);
      const xFitPad = (xFitMax - xFitMin) * 0.06 || xFitMax * 0.04 || 1;
      const xFitL = xFitMin - xFitPad;
      const xFitR = xFitMax + xFitPad;
      const yFitMin = Math.min(...yRaw);
      const yFitMax = Math.max(...yRaw);
      const yFitPad = (yFitMax - yFitMin) * 0.25 || 0.01;
      const yFitB = yFitMin - yFitPad;
      const yFitT = yFitMax + yFitPad;
      return {
        xFitL, xFitR, xFitRange: xFitR - xFitL,
        yFitB, yFitT, yFitRange: yFitT - yFitB,
      };
    }

    private clampView() {
      const b = this.getFitBounds();
      if (!b) return;
      // 확대 배율에 비례해 팬 가능 범위를 넓힘 (더 많이 확대할수록 더 멀리 이동 가능)
      const panMargin = Math.max(this.scaleX, this.scaleY);
      const maxOffsetX = b.xFitRange * panMargin * 0.9;
      const maxOffsetY = b.yFitRange * panMargin * 0.9;
      this.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, this.offsetX));
      this.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, this.offsetY));
    }

    /** draw()와 동일한 패딩 로직으로 plot(순수 버블 영역) rect 계산 */
    private getPlotRect() {
      const canvas = this.canvas;
      if (!canvas) return null;
      const cssW = canvas.clientWidth  || 400;
      const cssH = canvas.clientHeight || 340;
      const tmpPlot = Math.min(cssW - 80, cssH - 60);
      const maxR = Math.max(11, tmpPlot * 0.13);
      const basePad = Math.ceil(maxR) + 2;
      const padL  = Math.max(62, basePad + 14); // Y라벨 영역
      const padR  = 12; // 우측 라벨 없음 → 최소 여백
      const padT  = 12; // 상단 라벨 없음 → 최소 여백
      const padB2 = Math.max(44, basePad + 8); // X라벨 영역
      const plotW = Math.max(10, cssW - padL - padR);
      const plotH = Math.max(10, cssH - padT - padB2);
      if (plotW <= 0 || plotH <= 0) return null;
      return { padL, padR, padT, padB: padB2, plotW, plotH, cssW, cssH };
    }

    private isInPlot(clientX: number, clientY: number): boolean {
      const rect = this.canvas?.getBoundingClientRect();
      const pr = this.getPlotRect();
      if (!rect || !pr) return false;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      return x >= pr.padL && x <= pr.padL + pr.plotW && y >= pr.padT && y <= pr.padT + pr.plotH;
    }

    /** fracX/Y(0~1) 앵커를 기준으로 factor 배율만큼 줌. factor>1 확대, <1 축소 */
    private zoomAt(factor: number, fracX: number, fracY: number) {
      const b = this.getFitBounds();
      if (!b) return;
      // 감도: 0.65로 완화 (이전 0.45는 너무 느림)
      const dampFactor = 1 + (factor - 1) * 0.65;
      const newSX = Math.min(50, Math.max(1, this.scaleX * dampFactor));
      const newSY = Math.min(50, Math.max(1, this.scaleY * dampFactor));
      const realFactorX = newSX / this.scaleX;
      const realFactorY = newSY / this.scaleY;
      // 앵커가 화면상 고정되도록 offset 보정
      // xAnchor = xFitL + offsetX + (xFitRange/scaleX)*fracX
      // newOffsetX = xAnchor - (xFitRange/newSX)*fracX - xFitL
      //            = offsetX + xFitRange*fracX*(1/scaleX - 1/newSX)
      this.offsetX += b.xFitRange * fracX * (1 / this.scaleX - 1 / newSX);
      this.offsetY += b.yFitRange * fracY * (1 / this.scaleY - 1 / newSY);
      this.scaleX = newSX;
      this.scaleY = newSY;
      // 리미트 후 보정값이 잘렸을 때 미세 오차 방지용 클램프
      if (realFactorX === 1 && realFactorY === 1) return;
      this.clampView();
    }

    // ── 데이터 수집 (child <bubble> 요소) ──
    private collect(): void {
      const pts: BubbleChartPoint[] = [];
      this.querySelectorAll(':scope > bubble').forEach(el => {
        pts.push({
          label: el.getAttribute('label') || '',
          x:     Number(el.getAttribute('x'))     || 0,
          y:     Number(el.getAttribute('y'))      || 0,
          r:     Number(el.getAttribute('r'))      || 0,
          amount:Number(el.getAttribute('amount')) || 0,
        });
      });
      this.points = pts;
    }

    @onConnectedAfter
    onConnected() {
      this.collect();
      if (this.canvas && this.points.length > 0) this.draw();
    }

    @mutationObserverLight({ childList: true, attributes: true, subtree: true })
    onMutated() {
      this.collect();
      this.resetView();
      if (this.canvas && this.points.length > 0) this.draw();
    }

    @resizeObserverLight()
    onResize() {
      if (this.canvas && this.points.length > 0) this.draw();
    }

    // ── Shadow DOM ──
    @onConnectedBodyShadow
    render(): string {
      return `
        <style>
            :host { display:block; position:relative; }
          #bc-canvas {
            display:block; width:100%; height:320px;
            touch-action:pan-y; cursor:crosshair;
            background:#fff;
          }
          /* enabled-zoom이어도 라벨/축 영역 터치는 윈도우 스크롤이 되도록 pan-y 유지.
             plot 내부에서의 스크롤 차단은 JS에서 preventDefault로 처리 */
          :host([enabled-zoom]) #bc-canvas { touch-action:pan-y; }
          #bc-legend {
            display:flex; gap:12px; flex-wrap:wrap;
            padding:8px 14px 4px; align-items:center;
            font-family:-apple-system,sans-serif;
          }
          .bc-legend-item { font-size:11px; font-weight:700; }
          .bc-legend-item.up { color:#e5484d; }
          .bc-legend-item.down { color:#3e63dd; }
          #bc-tooltip {
            position:absolute; pointer-events:none; z-index:3;
            background:rgba(15,23,42,0.88); color:#fff;
            font-size:11px; line-height:1.5; border-radius:8px;
            padding:6px 10px; display:none; white-space:nowrap;
            box-shadow:0 4px 12px rgba(0,0,0,0.2);
          }
          #bc-reset {
            position:absolute; top:8px; right:68px; z-index:4;
            background:rgba(255,255,255,0.9); border:1px solid #e2e8f0;
            border-radius:6px; padding:3px 8px; font-size:10px;
            color:#64748b; cursor:pointer; display:none;
          }
          #bc-reset:hover { background:#f1f5f9; }
          #bc-swap {
            position:absolute; top:8px; right:8px; z-index:4;
            background:rgba(255,255,255,0.9); border:1px solid #e2e8f0;
            border-radius:6px; padding:3px 8px; font-size:10px;
            color:#334155; cursor:pointer;
          }
          #bc-swap:hover { background:#f1f5f9; }
          #bc-swap.active { background:#e0f2fe; border-color:#7dd3fc; color:#0c4a6e; }
        </style>
        <div id="bc-legend">
          <span class="bc-legend-item up">상승</span>
          <span class="bc-legend-item down">하락</span>
          <span class="bc-legend-item" style="display:flex;align-items:center;gap:4px;color:#64748b;font-weight:600"><span style="width:12px;height:12px;border-radius:50%;background:rgba(100,116,139,0.18);border:1.5px solid #64748b;display:inline-block;flex-shrink:0"></span>시총</span>
          <span class="bc-legend-item" style="display:flex;align-items:center;gap:4px;color:#64748b;font-weight:600"><span style="width:8px;height:8px;border-radius:50%;border:1.2px solid #64748b;display:inline-block;flex-shrink:0"></span>회전율</span>
        </div>
        <canvas id="bc-canvas"></canvas>
        <div id="bc-tooltip"></div>
        <button id="bc-swap" title="X/Y 축 바꾸기">⇄ 축교체</button>
        <button id="bc-reset">↺ 초기화</button>
      `;
    }

    @queryShadow('#bc-canvas')
    private canvas!: HTMLCanvasElement;

    @queryShadow('#bc-tooltip')
    private tooltip!: HTMLElement;

    @queryShadow('#bc-reset')
    private resetBtn!: HTMLElement;

    @queryShadow('#bc-swap')
    private swapBtn!: HTMLElement;

    // ── 드로잉 ──
    private draw(): void {
      const canvas = this.canvas;
      if (!canvas || this.points.length === 0) return;
      const dpr  = w.devicePixelRatio || 1;
      const cssW = canvas.clientWidth  || 400;
      const cssH = canvas.clientHeight || 340;
      canvas.width  = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const pts = this.points;
      const rRaw = pts.map(p => p.r);
      const rCapMax = Math.max(...rRaw, 1);

      const minR = 10;
      const tmpPlot = Math.min(cssW - 80, cssH - 60);
      const maxR = Math.max(minR + 1, tmpPlot * 0.13);
      const zoomScale = Math.min(6, Math.sqrt(this.scaleX * this.scaleY));

      // 패딩은 줌과 무관하게 zoom=1 기준 maxR로 고정 — 좌/하단만 라벨 영역 확보, 상/우는 최소 여백
      const basePad = Math.ceil(maxR) + 2;
      const padL  = Math.max(62, basePad + 14); // Y라벨
      const padR  = 12; // 우측 라벨 없음
      const padT  = 12; // 상단 라벨 없음
      const padB2 = Math.max(44, basePad + 8); // X라벨
      const plotW = Math.max(10, cssW - padL - padR);
      const plotH = Math.max(10, cssH - padT - padB2);

      // ── 데이터 범위 (기본 fit) — swap 시 X=등락률, Y=시가총액 ──
      const xRaw = pts.map(p => this.swapAxes ? p.y : p.x);
      const yRaw = pts.map(p => this.swapAxes ? p.x : p.y);

      const xFitMin = Math.min(...xRaw);
      const xFitMax = Math.max(...xRaw);
      const xFitPad = (xFitMax - xFitMin) * 0.06 || xFitMax * 0.04 || 1;
      // 시가총액은 0이 의미 없으므로 실제 최솟값 기준으로 여유 확보
      const xFitL = xFitMin - xFitPad;
      const xFitR = xFitMax + xFitPad;
      const xFitRange = xFitR - xFitL;

      const yFitMin = Math.min(...yRaw);  // 등락률은 음수 가능
      const yFitMax = Math.max(...yRaw);
      const yFitPad = (yFitMax - yFitMin) * 0.25 || 0.01;
      const yFitT   = yFitMax + yFitPad;
      const yFitB   = yFitMin - yFitPad;
      const yFitRange = yFitT - yFitB;

      // 줌/이동 적용
      const xRange = xFitRange / this.scaleX;
      const yRange = yFitRange / this.scaleY;
      const xl = xFitL + this.offsetX;
      const xr = xl + xRange;
      const yb = yFitB + this.offsetY;
      const yt = yb + yRange;

      // 버블 반지름: p.r(시가총액) 기준으로 정규화
      const toX = (v: number) => padL + ((v - xl) / (xr - xl)) * plotW;
      const toY = (v: number) => padT + plotH - ((v - yb) / (yt - yb)) * plotH;
      const toR = (v: number) => (minR + Math.sqrt(v / rCapMax) * (maxR - minR)) * zoomScale;

      // ── 배경 ──
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cssW, cssH);

      // ── Y 그리드 ──
      ctx.font = '9px -apple-system,sans-serif';
      for (let g = 0; g <= 4; g++) {
        const yv = yb + yRange * g / 4;
        const gy = toY(yv);
        if (gy < padT - 4 || gy > cssH - padB2 + 4) continue;
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(cssW - padR, gy); ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'right';
        // swap 후: Y = 회전율(소수→%), swap 전: Y = 등락률(fmtAxis)
        ctx.fillText(this.swapAxes ? fmtTurnover(yv) : fmtAxis(yv), padL - 4, gy + 3);
      }

      // ── 0% 기준선 — swap 전: Y=0 수평선, swap 후: X=0 수직선 (등락률 0%) ──
      if (this.swapAxes) {
        const zeroX = toX(0);
        if (zeroX >= padL && zeroX <= cssW - padR) {
          ctx.strokeStyle = '#cbd5e1'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(zeroX, padT); ctx.lineTo(zeroX, cssH - padB2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#94a3b8'; ctx.font = '9px -apple-system,sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('0%', zeroX, padT - 4);
        }
      } else {
        const zeroY = toY(0);
        if (zeroY >= padT && zeroY <= cssH - padB2) {
          ctx.strokeStyle = '#cbd5e1'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(cssW - padR, zeroY); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#94a3b8'; ctx.font = '9px -apple-system,sans-serif'; ctx.textAlign = 'right';
          ctx.fillText('0%', padL - 4, zeroY - 3);
        }
      }

      // ── X 축 라벨 ──
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      for (let g = 0; g <= 4; g++) {
        const xv = xl + xRange * g / 4;
        const gx = toX(xv);
        if (gx < padL || gx > cssW - padR) continue;
        // swap 전: X = 회전율(소수→%), swap 후: X = 등락률(fmtAxis)
        ctx.fillText(this.swapAxes ? fmtAxis(xv) : fmtTurnover(xv), gx, cssH - padB2 + 13);
      }

      // ── 축 제목 — swap 시 바꿔 표시 (기본 X=회전율, R=시가총액) ──
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 9px -apple-system,sans-serif';
      ctx.textAlign = 'center';
      const xTitle = this.swapAxes ? '등락률' : '회전율';
      const yTitle = this.swapAxes ? '회전율' : '등락률';
      const xTitleFull = this.swapAxes ? '등락률' : '← 낮음    회전율    높음 →';
      ctx.fillText(xTitleFull, padL + plotW / 2, cssH - 4);
      ctx.save();
      ctx.translate(10, padT + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(yTitle, 0, 0);
      ctx.restore();
      if (this.swapBtn) {
        this.swapBtn.classList.toggle('active', this.swapAxes);
        this.swapBtn.textContent = this.swapAxes ? '⇄ 원복' : '⇄ 축교체';
      }

      // ── 버블 — plot 내부로 클리핑하여 모든 축 라벨 뒤에서 가려짐 ──
      ctx.save();
      ctx.beginPath();
      ctx.rect(padL, padT, plotW, plotH);
      ctx.clip();
      for (let i = 0; i < pts.length; i++) {
        if (i === this.selectedIdx) continue;
        this.drawBubble(ctx, pts[i], toX, toY, toR, false);
      }
      // 선택된 버블 맨 위
      if (this.selectedIdx >= 0 && this.selectedIdx < pts.length) {
        this.drawBubble(ctx, pts[this.selectedIdx], toX, toY, toR, true);
      }
      // ── 카테고리명 라벨 — 버블과 함께 클리핑되어 축 넘어가면 같이 사라짐 ──
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const px = this.swapAxes ? p.y : p.x;
        const py = this.swapAxes ? p.x : p.y;
        const bx = toX(px), by = toY(py), br = toR(p.r);
        const selected = i === this.selectedIdx;
        if (!selected && br < maxR * 0.42) continue;
        const up = p.y >= 0;
        const c = selected ? (up ? '#e5484d' : '#3e63dd') : '#1e293b';
        ctx.fillStyle = c;
        ctx.font = selected ? 'bold 10px -apple-system,sans-serif' : '9px -apple-system,sans-serif';
        ctx.textAlign = 'center';
        const name  = p.label.length > 6 ? p.label.slice(0, 6) + '…' : p.label;
        const textY = br >= 14 ? by + 4 : by - br - 6;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
        ctx.strokeText(name, bx, textY);
        ctx.fillText(name, bx, textY);
      }
      ctx.restore();

      // 리셋 버튼 표시/숨김
      if (this.resetBtn) {
        this.resetBtn.style.display =
          (this.scaleX !== 1 || this.scaleY !== 1 || this.offsetX !== 0 || this.offsetY !== 0)
            ? 'block' : 'none';
      }

      // 툴팁이 떠 있으면 확대/이동 후에도 버블을 따라가도록 재배치
      if (this.tooltip && this.tooltip.style.display !== 'none' && this.selectedIdx >= 0) {
        const sel = this.points[this.selectedIdx];
        if (sel) {
          const sx = this.swapAxes ? sel.y : sel.x;
          const sy = this.swapAxes ? sel.x : sel.y;
          const bx = toX(sx), by = toY(sy), br = toR(sel.r);
          // 버블이 화면 밖이면 툴팁 숨김
          if (bx < padL - br || bx > cssW - padR + br || by < padT - br || by > cssH - padB2 + br) {
            this.tooltip.style.display = 'none';
          } else {
            const hostRect = this.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();
            const clientX = canvasRect.left + bx;
            const clientY = canvasRect.top + by;
            // showTooltip과 동일한 배치 로직 재사용
            const pUp = sel.y >= 0;
            const col = pUp ? '#f87171' : '#60a5fa';
            const sign = sel.y >= 0 ? '+' : '';
            // 위치만 갱신 (내용은 유지)
            const ttW = 160, ttH = 80;
            let lx = clientX - hostRect.left + 14;
            let ly = clientY - hostRect.top  - ttH - 10;
            if (lx + ttW > hostRect.width)  lx = clientX - hostRect.left - ttW - 14;
            if (ly < 4) ly = clientY - hostRect.top + 14;
            this.tooltip.style.left = `${Math.max(4, lx)}px`;
            this.tooltip.style.top  = `${Math.max(4, ly)}px`;
          }
        }
      }
    }

    private drawBubble(
      ctx: CanvasRenderingContext2D,
      p: BubbleChartPoint,
      toX: (v: number) => number,
      toY: (v: number) => number,
      toR: (v: number) => number,
      selected: boolean,
    ) {
      const px = this.swapAxes ? p.y : p.x;
      const py = this.swapAxes ? p.x : p.y;
      // 바깥원 크기 = 시가총액(p.r) 기반
      const br = toR(p.r);
      // 회오리 바퀴 수: p.x = 회전율 (소수, 0.01 = 1%, 1.0 = 100% = 1바퀴, 5.5 = 550% = 5.5바퀴)
      // p.x < 1 이면 1바퀴 미만, p.x >= 1 이면 여러 바퀴
      const turns = Math.max(0, p.x);
      const up = p.y >= 0;
      const c  = up ? '#e5484d' : '#3e63dd';
      const bx = toX(px), by = toY(py);

      ctx.save();

      // 선택 강조 후광
      if (selected) {
        ctx.beginPath();
        ctx.arc(bx, by, br + 5, 0, Math.PI * 2);
        ctx.fillStyle = c + '22'; ctx.fill();
      }

      // 시가총액 바깥 원
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle   = selected ? c + '22' : (up ? 'rgba(229,72,77,0.14)' : 'rgba(62,99,221,0.14)');
      ctx.fill();
      ctx.strokeStyle = selected ? c : (up ? 'rgba(229,72,77,0.9)' : 'rgba(62,99,221,0.9)');
      ctx.lineWidth   = selected ? 2.2 : 1.4;
      ctx.stroke();

      // ── 중심 십자 ──
      // 라벨 폰트(9~10px)보다 크게, 원 크기에 비례하되 너무 크지 않게
      const crossSize = Math.max(7, Math.min(br * 0.22, 18));
      const crossAlpha = selected ? 0.35 : 0.22;
      const crossColor = up ? `rgba(229,72,77,${crossAlpha})` : `rgba(62,99,221,${crossAlpha})`;
      ctx.save();
      ctx.strokeStyle = crossColor;
      ctx.lineWidth   = selected ? 1.4 : 1.0;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(bx - crossSize, by);
      ctx.lineTo(bx + crossSize, by);
      ctx.moveTo(bx, by - crossSize);
      ctx.lineTo(bx, by + crossSize);
      ctx.stroke();
      ctx.restore();

      // ── 안쪽 링 (회전율 시각화) ──
      // · br*0.5 부터 시작해서 바깥쪽으로 링을 쌓음
      // · 링 1개 = 100% (완전한 원)
      // · 220% → 링1(완전), 링2(완전), 링3(20% 호)
      // · 5.5% → 링1(5.5% 호만)
      if (turns >= 0.002) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(bx, by, br * 0.96, 0, Math.PI * 2);
        ctx.clip();

        const cappedTurns = Math.min(turns, 10);
        const fullRings  = Math.floor(cappedTurns);   // 완전한 링 수
        const remainder  = cappedTurns - fullRings;   // 마지막 링의 비율 (0~1)
        const totalRings = fullRings + (remainder > 0 ? 1 : 0);

        // 링 반지름 범위: br*0.5(첫 링) ~ br*0.88(마지막 링)
        const innerR = br * 0.5;
        const outerR2 = br * 0.88;
        // 링 간격
        const ringGap = totalRings > 1
          ? (outerR2 - innerR) / (totalRings - 1)
          : (outerR2 - innerR); // 링이 1개면 innerR 위치에만

        ctx.strokeStyle = up ? '#e5484d' : '#3e63dd';
        ctx.lineWidth   = selected ? 1.8 : 1.2;
        ctx.globalAlpha = selected ? 0.9 : 0.75;

        for (let i = 0; i < totalRings; i++) {
          const ringR = totalRings > 1 ? innerR + ringGap * i : innerR;
          const isLast = i === totalRings - 1;
          const arcFrac = isLast && remainder > 0 ? remainder : 1; // 마지막 링은 부분 호
          const startAngle = -Math.PI / 2;                         // 12시 방향에서 시작
          const endAngle   = startAngle + arcFrac * Math.PI * 2;

          ctx.beginPath();
          ctx.arc(bx, by, ringR, startAngle, endAngle);
          ctx.stroke();

          // 마지막(부분) 링 끝점 강조
          if (isLast && remainder > 0) {
            ctx.globalAlpha = 1;
            const ex = bx + Math.cos(endAngle) * ringR;
            const ey = by + Math.sin(endAngle) * ringR;
            ctx.beginPath(); ctx.arc(ex, ey, selected ? 2.2 : 1.6, 0, Math.PI * 2);
            ctx.fillStyle = up ? '#e5484d' : '#3e63dd'; ctx.fill();
            ctx.globalAlpha = selected ? 0.9 : 0.75;
          }
        }

        ctx.restore();

        // 1바퀴(100%) 초과 시 바깥 원 점선 강조
        if (turns > 1) {
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.strokeStyle = up ? 'rgba(229,72,77,0.35)' : 'rgba(62,99,221,0.35)';
          ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
        }
      } else if (!selected && br < 11) {
        // 거래 거의 없는 작은 버블 중심점
        ctx.beginPath(); ctx.arc(bx, by, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = up ? '#e5484d' : '#3e63dd'; ctx.fill();
      }

      ctx.restore();
    }

    // ── 좌표 → 가장 가까운 버블 인덱스 ──
    private hitTest(cx: number, cy: number): number {
      const canvas = this.canvas;
      if (!canvas || this.points.length === 0) return -1;
      const b = this.getFitBounds();
      if (!b) return -1;

      const cssW = canvas.clientWidth  || 400;
      const cssH = canvas.clientHeight || 340;
      const rRaw = this.points.map(p => p.r);
      const rCapMax = Math.max(...rRaw, 1);
      const tmpPlot = Math.min(cssW - 80, cssH - 60);
      const minR = 10;
      const maxR = Math.max(minR + 1, tmpPlot * 0.13);
      const zoomScale = Math.min(6, Math.sqrt(this.scaleX * this.scaleY));
      const basePad = Math.ceil(maxR) + 2;
      const padL  = Math.max(62, basePad + 14);
      const padR  = 12;
      const padT  = 12;
      const padB  = Math.max(44, basePad + 8);
      const plotW = Math.max(10, cssW - padL - padR);
      const plotH = Math.max(10, cssH - padT - padB);

      const pts  = this.points;

      const xRange = b.xFitRange / this.scaleX;
      const yRange = b.yFitRange / this.scaleY;
      const xl = b.xFitL + this.offsetX;
      const yb = b.yFitB + this.offsetY;
      const yt = yb + yRange;

      const toX = (v: number) => padL + ((v - xl) / xRange) * plotW;
      const toY = (v: number) => padT + plotH - ((v - yb) / (yt - yb)) * plotH;
      const toR = (v: number) => (minR + Math.sqrt(v / rCapMax) * (maxR - minR)) * zoomScale;

      let hit = -1, minDist = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const px = this.swapAxes ? pts[i].y : pts[i].x;
        const py = this.swapAxes ? pts[i].x : pts[i].y;
        const bx = toX(px), by = toY(py), br = toR(pts[i].r);
        const dist = Math.sqrt((cx - bx) ** 2 + (cy - by) ** 2);
        if (dist < br + 10 && dist < minDist) { minDist = dist; hit = i; }
      }
      return hit;
    }

    private showTooltip(idx: number, clientX: number, clientY: number) {
      if (!this.tooltip) return;
      if (idx < 0) { this.tooltip.style.display = 'none'; return; }
      const p   = this.points[idx];
      const up  = p.y >= 0;  // y=등락률
      const col = up ? '#f87171' : '#60a5fa';
      const sign = p.y >= 0 ? '+' : '';
      this.tooltip.innerHTML = `<strong>${p.label}</strong><br>
등락률 <span style="color:${col};font-weight:700">${sign}${(p.y * 100).toFixed(2)}%</span><br>
회전율 ${fmtTurnover(p.x)}<br>시가총액 ${fmtAxis(p.r)}<br>거래대금 ${fmtAxis(p.amount)}`;
      this.tooltip.style.display = 'block';
      const hostRect = this.getBoundingClientRect();
      const ttW = 160, ttH = 80;
      let lx = clientX - hostRect.left + 14;
      let ly = clientY - hostRect.top  - ttH - 10;
      if (lx + ttW > hostRect.width)  lx = clientX - hostRect.left - ttW - 14;
      if (ly < 4) ly = clientY - hostRect.top + 14;
      this.tooltip.style.left = `${Math.max(4, lx)}px`;
      this.tooltip.style.top  = `${Math.max(4, ly)}px`;
    }

    // ── 이벤트: 휠 줌 ──
    // 라벨/축 영역 제외, 순수 plot(버블 영역) 내부에서만 줌 처리
    @eventShadow('#bc-canvas', 'wheel', { passive: false })
    private onWheel(e: WheelEvent): void {
      if (!this.hasAttribute('enabled-zoom')) return;
      if (!this.isInPlot(e.clientX, e.clientY)) return;
      e.preventDefault();
      const canvas = this.canvas;
      if (!canvas || this.points.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      const pr = this.getPlotRect();
      if (!pr) return;
      const fracX = Math.max(0, Math.min(1, (e.clientX - rect.left - pr.padL) / pr.plotW));
      const fracY = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top - pr.padT) / pr.plotH));
      // deltaY 크기에 비례하되 한 틱당 최대 ±3% 로 제한 → 부드럽고 예측 가능
      const delta = Math.max(-120, Math.min(120, e.deltaY));
      const factor = Math.exp(-delta * 0.00055 * 8); // ≈ 1.05 at delta= -100
      const clampedFactor = Math.max(0.94, Math.min(1.06, factor));
      this.zoomAt(clampedFactor, fracX, fracY);
      this.draw();
    }

    // ── 이벤트: 마우스 ──
    // plot 내부에서만 드래그/팬 시작 (라벨/축 영역 제외) — 클릭 선택은 별도 처리
    @eventShadow('#bc-canvas', 'mousedown')
    private onMouseDown(e: MouseEvent): void {
      this.downX = e.clientX;
      this.downY = e.clientY;
      if (this.hasAttribute('enabled-zoom') && !this.isInPlot(e.clientX, e.clientY)) {
        this.dragging = false;
        return;
      }
      this.dragging  = true;
      this.dragLastX = e.clientX;
      this.dragLastY = e.clientY;
    }

    @eventWindow('mouseup')
    private onMouseUp(e: MouseEvent): void {
      if (!this.dragging) return;
      if (Date.now() - this.lastTouchEndTime < 350) return;
      this.dragging = false;
      const moved = Math.abs(e.clientX - this.downX) + Math.abs(e.clientY - this.downY);
      if (moved < 5) {
        const rect = this.canvas.getBoundingClientRect();
        const hit  = this.hitTest(e.clientX - rect.left, e.clientY - rect.top);
        this.selectedIdx = hit === this.selectedIdx ? -1 : hit;
        this.draw();
        this.showTooltip(this.selectedIdx, e.clientX, e.clientY);
        this.dispatchEvent(new CustomEvent('bubble-select', {
          detail: this.selectedIdx >= 0 ? this.points[this.selectedIdx] : null,
          bubbles: true,
        }));
      }
    }

    @eventShadow('#bc-canvas', 'mousemove')
    private onMouseMove(e: MouseEvent): void {
      if (this.dragging && this.hasAttribute('enabled-zoom')) {
        const canvas = this.canvas;
        if (!canvas) return;
        const b = this.getFitBounds();
        if (!b) return;
        const pr = this.getPlotRect();
        if (!pr) return;

        const dx = -(e.clientX - this.dragLastX) / pr.plotW  * (b.xFitRange / this.scaleX);
        const dy =  (e.clientY - this.dragLastY) / pr.plotH  * (b.yFitRange / this.scaleY);
        this.offsetX += dx;
        this.offsetY += dy;
        this.dragLastX = e.clientX;
        this.dragLastY = e.clientY;
        this.clampView();
        this.draw();
      }
    }

    // ── 이벤트: 터치 ──
    @eventShadow('#bc-canvas', 'touchstart', { passive: false })
    private onTouchStart(e: TouchEvent): void {
      const touches = e.touches;
      if (touches.length === 2 && this.hasAttribute('enabled-zoom')) {
        const cx = (touches[0].clientX + touches[1].clientX) / 2;
        const cy = (touches[0].clientY + touches[1].clientY) / 2;
        if (!this.isInPlot(cx, cy)) return;
        e.preventDefault();
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        this.pinchDist0   = Math.hypot(dx, dy);
        this.pinchScaleX0 = this.scaleX;
        this.pinchScaleY0 = this.scaleY;
        this.dragging = false;
      } else if (touches.length === 1) {
        this.downX = touches[0].clientX;
        this.downY = touches[0].clientY;
        if (this.hasAttribute('enabled-zoom') && !this.isInPlot(touches[0].clientX, touches[0].clientY)) {
          this.dragging = false;
          return;
        }
        this.dragging  = true;
        this.dragLastX = touches[0].clientX;
        this.dragLastY = touches[0].clientY;
      }
    }

    @eventShadow('#bc-canvas', 'touchmove', { passive: false })
    private onTouchMove(e: TouchEvent): void {
      const touches = e.touches;
      if (touches.length === 2 && this.pinchDist0 > 0 && this.hasAttribute('enabled-zoom')) {
        e.preventDefault();
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return;
        // 두 손가락 중심을 앵커로 줌 (이전처럼 좌상단 고정 아님)
        const cx = (touches[0].clientX + touches[1].clientX) / 2;
        const cy = (touches[0].clientY + touches[1].clientY) / 2;
        const canvas = this.canvas;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const pr = this.getPlotRect();
        if (!pr) return;
        if (!this.isInPlot(cx, cy)) return;
        const fracX = Math.max(0, Math.min(1, (cx - rect.left - pr.padL) / pr.plotW));
        const fracY = Math.max(0, Math.min(1, 1 - (cy - rect.top - pr.padT) / pr.plotH));
        // 현재 scale 대비 목표 scale 계산 후 zoomAt으로 위임 (앵커 보정 + 클램프 포함)
        const rawFactor = dist / this.pinchDist0;
        const targetSX = Math.min(50, Math.max(1, this.pinchScaleX0 * (1 + (rawFactor - 1) * 0.5)));
        const factor = targetSX / this.scaleX;
        this.zoomAt(factor, fracX, fracY);
        this.draw();
      } else if (touches.length === 1 && this.dragging && this.hasAttribute('enabled-zoom')) {
        // 순수 plot 내부 터치만 팬 처리 — 라벨/축 영역 터치는 페이지 스크롤 허용
        if (!this.isInPlot(touches[0].clientX, touches[0].clientY)) {
          this.dragLastX = touches[0].clientX;
          this.dragLastY = touches[0].clientY;
          return;
        }
        e.preventDefault();
        const b = this.getFitBounds();
        if (!b) return;
        const pr = this.getPlotRect();
        if (!pr) return;
        const dx = touches[0].clientX - this.dragLastX;
        const dy = touches[0].clientY - this.dragLastY;
        this.offsetX += (-dx / pr.plotW) * (b.xFitRange / this.scaleX);
        this.offsetY += ( dy / pr.plotH) * (b.yFitRange / this.scaleY);
        this.dragLastX = touches[0].clientX;
        this.dragLastY = touches[0].clientY;
        this.clampView();
        this.draw();
      }
    }

    @eventShadow('#bc-canvas', 'touchend')
    private onTouchEnd(e: TouchEvent): void {
      const moved = Math.abs(e.changedTouches[0].clientX - this.downX)
                  + Math.abs(e.changedTouches[0].clientY - this.downY);
      const wasPinch = this.pinchDist0 > 0;
      this.pinchDist0 = 0;
      if (this.dragging && !wasPinch && moved < 10) {
        // enabled-zoom 시 plot 밖 탭은 버블 선택으로 처리하지 않음 (라벨 영역 제외)
        if (this.hasAttribute('enabled-zoom') && !this.isInPlot(e.changedTouches[0].clientX, e.changedTouches[0].clientY)) {
          this.dragging = false;
          this.lastTouchEndTime = Date.now();
          return;
        }
        const rect = this.canvas.getBoundingClientRect();
        const hit  = this.hitTest(
          e.changedTouches[0].clientX - rect.left,
          e.changedTouches[0].clientY - rect.top,
        );
        this.selectedIdx = hit === this.selectedIdx ? -1 : hit;
        this.draw();
        this.showTooltip(this.selectedIdx, e.changedTouches[0].clientX, e.changedTouches[0].clientY);
        this.dispatchEvent(new CustomEvent('bubble-select', {
          detail: this.selectedIdx >= 0 ? this.points[this.selectedIdx] : null,
          bubbles: true,
        }));
      }
      this.dragging = false;
      this.lastTouchEndTime = Date.now();
    }

    // ── 리셋/축교체 버튼 ──
    @eventShadow('#bc-swap', 'click')
    private onSwap(): void {
      this.swapAxes = !this.swapAxes;
      this.scaleX = 1; this.scaleY = 1; this.offsetX = 0; this.offsetY = 0;
      this.draw();
    }

    @eventShadow('#bc-reset', 'click')
    private onReset(): void {
      this.resetView();
      this.draw();
    }
  }

  return BubbleChartImpl;
};
