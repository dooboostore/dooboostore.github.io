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
  /** X축 값 (시가총액) */
  x: number;
  /** Y축 값 (등락률) */
  y: number;
  /** 버블 크기 값 (거래대금) */
  r: number;
  /** 추가 메타 (JSON 직렬화) */
  meta?: string;
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
      // 툴팁 숨김
      if (this.tooltip) this.tooltip.style.display = 'none';
      // info 패널 초기화
      if (this.infoEl) this.infoEl.innerHTML = `<span class="bc-info-hint">항목을 클릭하면 상세 정보를 볼 수 있어요</span>`;
    }

    // ── 줌 공통 헬퍼 ──
    private getFitBounds() {
      const pts = this.points;
      if (pts.length === 0) return null;
      const xRaw = pts.map(p => p.x);
      const yRaw = pts.map(p => p.y);
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
      // 뷰가 데이터 영역을 너무 벗어나지 않도록 제한 (여유 50% 허용)
      const maxOffsetX = b.xFitRange * 0.8;
      const maxOffsetY = b.yFitRange * 0.8;
      this.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, this.offsetX));
      this.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, this.offsetY));
    }

    /** fracX/Y(0~1) 앵커를 기준으로 factor 배율만큼 줌. factor>1 확대, <1 축소 */
    private zoomAt(factor: number, fracX: number, fracY: number) {
      const b = this.getFitBounds();
      if (!b) return;
      // 감도: 0.65로 완화 (이전 0.45는 너무 느림)
      const dampFactor = 1 + (factor - 1) * 0.65;
      const newSX = Math.min(8, Math.max(1, this.scaleX * dampFactor));
      const newSY = Math.min(8, Math.max(1, this.scaleY * dampFactor));
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
          meta:  el.getAttribute('meta')           || undefined,
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
          :host([enabled-zoom]) #bc-canvas { touch-action:none; }
          #bc-legend {
            display:flex; gap:12px; flex-wrap:wrap;
            padding:8px 14px 4px; align-items:center;
            font-family:-apple-system,sans-serif;
          }
          .bc-legend-item { display:flex; align-items:center; gap:5px; font-size:11px; color:#64748b; }
          .bc-legend-dot  { width:11px; height:11px; border-radius:50%; flex-shrink:0; opacity:0.8; }
          .bc-legend-hint { font-size:10px; color:#94a3b8; }
          #bc-tooltip {
            position:absolute; pointer-events:none; z-index:3;
            background:rgba(15,23,42,0.88); color:#fff;
            font-size:11px; line-height:1.5; border-radius:8px;
            padding:6px 10px; display:none; white-space:nowrap;
            box-shadow:0 4px 12px rgba(0,0,0,0.2);
          }
          #bc-reset {
            position:absolute; top:8px; right:8px; z-index:4;
            background:rgba(255,255,255,0.9); border:1px solid #e2e8f0;
            border-radius:6px; padding:3px 8px; font-size:10px;
            color:#64748b; cursor:pointer; display:none;
          }
          #bc-reset:hover { background:#f1f5f9; }

          /* ── 선택 정보 패널 ── */
          #bc-info {
            padding:10px 14px 14px;
            min-height:52px;
            font-family:-apple-system,sans-serif;
            border-top:1px solid #f1f5f9;
            flex-shrink:0;
          }
          .bc-info-hint { font-size:12px; color:#94a3b8; }
          .bc-info-card { display:flex; align-items:flex-start; gap:10px; }
          .bc-info-img  {
            width:36px; height:36px; border-radius:8px;
            object-fit:cover; background:#f1f5f9; flex-shrink:0;
          }
          .bc-info-body { display:flex; flex-direction:column; gap:4px; min-width:0; }
          .bc-info-name { font-size:14px; font-weight:700; color:#0f172a; }
          .bc-info-meta { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
          .bc-badge-rate { padding:2px 8px; border-radius:10px; font-size:11px; font-weight:700; }
          .bc-badge-rate.up   { background:#fef2f2; color:#e5484d; }
          .bc-badge-rate.down { background:#eff6ff; color:#3e63dd; }
          .bc-badge-num   { padding:2px 8px; border-radius:10px; font-size:11px; background:#f1f5f9; color:#475569; font-weight:600; }
          .bc-badge-count { padding:2px 8px; border-radius:10px; font-size:11px; background:#ede9fe; color:#6d28d9; font-weight:600; }
          .bc-info-leading { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:2px; }
          .bc-leading-logo   { width:18px; height:18px; border-radius:4px; background:#f1f5f9; }
          .bc-leading-name   { font-size:12px; font-weight:700; color:#334155; }
          .bc-leading-signal { font-size:11px; color:#94a3b8; }
        </style>
        <div id="bc-legend">
          <div class="bc-legend-item">
            <div class="bc-legend-dot" style="background:#e5484d"></div>상승
          </div>
          <div class="bc-legend-item">
            <div class="bc-legend-dot" style="background:#3e63dd"></div>하락
          </div>
          <span class="bc-legend-hint">원크기=거래대금 · X=시가총액 · Y=등락률</span>
        </div>
        <canvas id="bc-canvas"></canvas>
        <div id="bc-tooltip"></div>
        <button id="bc-reset">↺ 초기화</button>
        <div id="bc-info"><span class="bc-info-hint">항목을 클릭하면 상세 정보를 볼 수 있어요</span></div>
      `;
    }

    @queryShadow('#bc-canvas')
    private canvas!: HTMLCanvasElement;

    @queryShadow('#bc-tooltip')
    private tooltip!: HTMLElement;

    @queryShadow('#bc-reset')
    private resetBtn!: HTMLElement;

    @queryShadow('#bc-info')
    private infoEl!: HTMLElement;

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

      const padB = 44;
      const pts = this.points;
      // 버블 최대 반경을 먼저 계산해서 패딩에 반영 (잘림 방지)
      const rRaw = pts.map(p => p.r);
      const rMax0 = Math.max(...rRaw, 1);
      const MIN_R = 6;
      const MAX_R_APPROX = Math.min((cssW - 80), (cssH - padB - 20)) * 0.13;
      const bubblePad = Math.ceil(MAX_R_APPROX) + 4;

      const padL = Math.max(62, bubblePad + 14); // y라벨 + 버블 여유
      const padR = Math.max(20, bubblePad);
      const padT = Math.max(24, bubblePad + 8);  // 상단 버블 잘림 방지
      const padB2 = Math.max(44, bubblePad + 8); // 하단 버블 잘림 방지
      const plotW = cssW - padL - padR;
      const plotH = cssH - padT - padB2;

      // ── 데이터 범위 (기본 fit) ──
      const xRaw = pts.map(p => p.x);
      const yRaw = pts.map(p => p.y);

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

      const rMax = Math.max(...rRaw, 1);
      const minR = 10;
      const maxR = Math.min(plotW, plotH) * 0.13;

      // X축: 시총이 500조 이하 vs 2700조 이상으로 양극화되어 중간이 텅 비는 데이터 특성상
      // log 스케일이 오히려 오른쪽을 더 뭉치게 하므로, 초기 뷰는 선형으로 전체를 골고루 펼치고
      // 확대 시에만 log의 장점이 살아나도록 함. 초기엔 선형 고정
      const toX = (v: number) => padL + ((v - xl) / (xr - xl)) * plotW;
      const toY = (v: number) => padT + plotH - ((v - yb) / (yt - yb)) * plotH;
      // 면적 기반 크기 + 줌 배율 반영 (확대 시 원도 함께 커짐)
      const zoomScale = Math.min(2.8, Math.sqrt(this.scaleX * this.scaleY));
      const toR = (v: number) => (minR + Math.sqrt(v / rMax) * (maxR - minR)) * zoomScale;

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
        ctx.fillText(fmtAxis(yv), padL - 4, gy + 3);
      }

      // ── Y=0 기준선 (등락률 0%) ──
      const zeroY = toY(0);
      if (zeroY >= padT && zeroY <= cssH - padB2) {
        ctx.strokeStyle = '#cbd5e1';
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(cssW - padR, zeroY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '9px -apple-system,sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('0%', padL - 4, zeroY - 3);
      }

      // ── X 축 라벨 ──
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      for (let g = 0; g <= 4; g++) {
        const xv = xl + xRange * g / 4;
        const gx = toX(xv);
        if (gx < padL || gx > cssW - padR) continue;
        ctx.fillText(fmtAxis(xv), gx, cssH - padB2 + 13);
      }

      // ── 축 제목 ──
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 9px -apple-system,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('← 소형    시가총액    대형 →', padL + plotW / 2, cssH - 4);
      ctx.save();
      ctx.translate(10, padT + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('등락률', 0, 0);
      ctx.restore();

      // ── 버블 + 라벨 — plot 영역으로 클리핑하여 축 라벨 영역 침범 시 함께 가려짐 ──
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
        const bx = toX(p.x), by = toY(p.y), br = toR(p.r);
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
          const bx = toX(sel.x), by = toY(sel.y), br = toR(sel.r);
          // 버블이 화면 밖이면 툴팁 숨김
          if (bx < padL - br || bx > cssW - padR + br || by < padT - br || by > cssH - padB + br) {
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
      const bx = toX(p.x), by = toY(p.y), br = toR(p.r);
      const up = p.y >= 0;  // y축이 등락률
      const c  = up ? '#e5484d' : '#3e63dd';
      if (selected) {
        ctx.beginPath();
        ctx.arc(bx, by, br + 5, 0, Math.PI * 2);
        ctx.fillStyle = c + '22'; ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle   = selected ? c + '44' : (up ? 'rgba(229,72,77,0.32)' : 'rgba(62,99,221,0.32)');
      ctx.fill();
      ctx.strokeStyle = selected ? c : (up ? 'rgba(229,72,77,0.95)' : 'rgba(62,99,221,0.95)');
      ctx.lineWidth   = selected ? 2.5 : 1.6;
      ctx.stroke();
      // 작은 버블 중심점 강조
      if (!selected && br < 11) {
        ctx.beginPath(); ctx.arc(bx, by, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = up ? '#e5484d' : '#3e63dd'; ctx.fill();
      }
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
      const MAX_R_APPROX = Math.min(cssW - 80, cssH - 64) * 0.13;
      const bubblePad = Math.ceil(MAX_R_APPROX) + 4;
      const padL = Math.max(62, bubblePad + 14);
      const padR = Math.max(20, bubblePad);
      const padT = Math.max(20, bubblePad);
      const padB = 44;
      const plotW = cssW - padL - padR;
      const plotH = cssH - padT - padB;

      const pts  = this.points;
      const rMax = Math.max(...rRaw, 1);
      const minR = 10, maxR = Math.min(plotW, plotH) * 0.13;

      const xRange = b.xFitRange / this.scaleX;
      const yRange = b.yFitRange / this.scaleY;
      const xl = b.xFitL + this.offsetX;
      const yb = b.yFitB + this.offsetY;
      const yt = yb + yRange;

      const toX = (v: number) => padL + ((v - xl) / xRange) * plotW;
      const toY = (v: number) => padT + plotH - ((v - yb) / (yt - yb)) * plotH;
      const zoomScale = Math.min(2.8, Math.sqrt(this.scaleX * this.scaleY));
      const toR = (v: number) => (minR + Math.sqrt(v / rMax) * (maxR - minR)) * zoomScale;

      let hit = -1, minDist = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const bx = toX(pts[i].x), by = toY(pts[i].y), br = toR(pts[i].r);
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
시가총액 ${fmtAxis(p.x)}<br>거래대금 ${fmtAxis(p.r)}`;
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

    private updateInfo(idx: number) {
      if (!this.infoEl) return;
      if (idx < 0) {
        this.infoEl.innerHTML = `<span class="bc-info-hint">버블을 클릭하면 상세 정보를 볼 수 있어요</span>`;
        return;
      }
      const p  = this.points[idx];
      const up = p.y >= 0;  // y=등락률
      const sign = up ? '+' : '';

      let meta: Record<string, string> = {};
      try { if (p.meta) meta = JSON.parse(p.meta) as Record<string, string>; } catch { /* ignore */ }

      const stockCount  = meta.stockCount  ? Number(meta.stockCount)  : 0;
      const leadingName = meta.leadingName ?? '';
      const leadingLogo = meta.leadingLogoUrl ?? '';
      const leadingSignal = meta.leadingSignal ?? '';
      const imageUrl    = meta.imageUrl ?? '';
      const rank        = meta.rank ? `${meta.rank}위 · ` : '';

      const countBadge = stockCount > 1
        ? `<span class="bc-badge-count">${leadingName} 외 ${stockCount - 1}개 종목</span>`
        : stockCount === 1 ? `<span class="bc-badge-count">${leadingName}</span>` : '';

      const leadingHtml = leadingName ? `
        <div class="bc-info-leading">
          ${leadingLogo ? `<img class="bc-leading-logo" src="${leadingLogo}" onerror="this.style.display='none'">` : ''}
          <span class="bc-leading-name">${leadingName}</span>
          ${leadingSignal ? `<span class="bc-leading-signal">${leadingSignal}</span>` : ''}
        </div>` : '';

      this.infoEl.innerHTML = `
        <div class="bc-info-card">
          ${imageUrl ? `<img class="bc-info-img" src="${imageUrl}" alt="${p.label}" onerror="this.style.display='none'">` : ''}
          <div class="bc-info-body">
            <div class="bc-info-name">${rank}${p.label}</div>
            <div class="bc-info-meta">
              <span class="bc-badge-rate ${up ? 'up' : 'down'}">${sign}${(p.y * 100).toFixed(2)}%</span>
              <span class="bc-badge-num">거래대금 ${fmtAxis(p.r)}</span>
              <span class="bc-badge-num">시가총액 ${fmtAxis(p.x)}</span>
              ${countBadge}
            </div>
            ${leadingHtml}
          </div>
        </div>`;
    }

    // ── 이벤트: 휠 줌 ──
    @eventShadow('#bc-canvas', 'wheel', { passive: false })
    private onWheel(e: WheelEvent): void {
      if (!this.hasAttribute('enabled-zoom')) return;
      e.preventDefault();
      const canvas = this.canvas;
      if (!canvas || this.points.length === 0) return;
      const rect  = canvas.getBoundingClientRect();
      const plotW = rect.width  - 82; // padL+padR
      const plotH = rect.height - 64; // padT+padB
      if (plotW <= 0 || plotH <= 0) return;
      // 마우스 위치를 plot 내 0~1로 정규화 (plot 밖이면 클램프)
      const fracX = Math.max(0, Math.min(1, (e.clientX - rect.left - 62) / plotW));
      const fracY = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top - 20) / plotH));
      // deltaY 크기에 비례하되 한 틱당 최대 ±3% 로 제한 → 부드럽고 예측 가능
      const delta = Math.max(-120, Math.min(120, e.deltaY));
      const factor = Math.exp(-delta * 0.00055 * 8); // ≈ 1.05 at delta= -100
      const clampedFactor = Math.max(0.94, Math.min(1.06, factor));
      this.zoomAt(clampedFactor, fracX, fracY);
      this.draw();
    }

    // ── 이벤트: 마우스 ──
    @eventShadow('#bc-canvas', 'mousedown')
    private onMouseDown(e: MouseEvent): void {
      this.dragging  = true;
      this.dragLastX = e.clientX;
      this.dragLastY = e.clientY;
      this.downX = e.clientX;
      this.downY = e.clientY;
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
        this.updateInfo(this.selectedIdx);
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
        const rect   = canvas.getBoundingClientRect();
        const plotW  = rect.width  - 82;
        const plotH  = rect.height - 64;
        const xRaw   = this.points.map(p => p.x);
        const xFitMin = Math.min(...xRaw), xFitMax = Math.max(...xRaw);
        const xFitPad = (xFitMax - xFitMin) * 0.15 || 0.01;
        const xFitL   = Math.max(0, xFitMin - xFitPad);
        const xFitRange = (xFitMax + xFitPad) - xFitL;
        const yRaw    = this.points.map(p => p.y);
        const yFitMin = Math.min(...yRaw), yFitMax = Math.max(...yRaw);
        const yFitPad = (yFitMax - yFitMin) * 0.15 || 0.01;
        const yFitRange = (yFitMax + yFitPad) - (yFitMin - yFitPad);

        const dx = -(e.clientX - this.dragLastX) / plotW  * (xFitRange / this.scaleX);
        const dy =  (e.clientY - this.dragLastY) / plotH  * (yFitRange / this.scaleY);
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
        e.preventDefault();
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        this.pinchDist0   = Math.hypot(dx, dy);
        this.pinchScaleX0 = this.scaleX;
        this.pinchScaleY0 = this.scaleY;
        this.dragging = false;
      } else if (touches.length === 1) {
        this.dragging  = true;
        this.dragLastX = touches[0].clientX;
        this.dragLastY = touches[0].clientY;
        this.downX = touches[0].clientX;
        this.downY = touches[0].clientY;
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
        const fracX = Math.max(0, Math.min(1, (cx - rect.left - 62) / (rect.width - 82)));
        const fracY = Math.max(0, Math.min(1, 1 - (cy - rect.top - 20) / (rect.height - 64)));
        // 현재 scale 대비 목표 scale 계산 후 zoomAt으로 위임 (앵커 보정 + 클램프 포함)
        const rawFactor = dist / this.pinchDist0;
        const targetSX = Math.min(8, Math.max(1, this.pinchScaleX0 * (1 + (rawFactor - 1) * 0.5)));
        const factor = targetSX / this.scaleX;
        this.zoomAt(factor, fracX, fracY);
        this.draw();
      } else if (touches.length === 1 && this.dragging && this.hasAttribute('enabled-zoom')) {
        const dx = touches[0].clientX - this.dragLastX;
        const dy = touches[0].clientY - this.dragLastY;
        if (Math.abs(dx) > Math.abs(dy)) {
          e.preventDefault();
          const canvas = this.canvas;
          if (!canvas) return;
          const plotW = canvas.clientWidth - 82;
          const xRaw  = this.points.map(p => p.x);
          const xFitMin = Math.min(...xRaw), xFitMax = Math.max(...xRaw);
          const xFitPad = (xFitMax - xFitMin) * 0.15 || 0.01;
          const xFitRange = (xFitMax + xFitPad) - (xFitMin - xFitPad);
          this.offsetX += (-dx / plotW) * (xFitRange / this.scaleX);
          this.dragLastX = touches[0].clientX;
          this.dragLastY = touches[0].clientY;
          this.clampView();
          this.draw();
        }
      }
    }

    @eventShadow('#bc-canvas', 'touchend')
    private onTouchEnd(e: TouchEvent): void {
      const moved = Math.abs(e.changedTouches[0].clientX - this.downX)
                  + Math.abs(e.changedTouches[0].clientY - this.downY);
      const wasPinch = this.pinchDist0 > 0;
      this.pinchDist0 = 0;
      if (this.dragging && !wasPinch && moved < 10) {
        const rect = this.canvas.getBoundingClientRect();
        const hit  = this.hitTest(
          e.changedTouches[0].clientX - rect.left,
          e.changedTouches[0].clientY - rect.top,
        );
        this.selectedIdx = hit === this.selectedIdx ? -1 : hit;
        this.draw();
        this.showTooltip(this.selectedIdx, e.changedTouches[0].clientX, e.changedTouches[0].clientY);
        this.updateInfo(this.selectedIdx);
        this.dispatchEvent(new CustomEvent('bubble-select', {
          detail: this.selectedIdx >= 0 ? this.points[this.selectedIdx] : null,
          bubbles: true,
        }));
      }
      this.dragging = false;
      this.lastTouchEndTime = Date.now();
    }

    // ── 리셋 버튼 ──
    @eventShadow('#bc-reset', 'click')
    private onReset(): void {
      this.resetView();
      this.draw();
    }
  }

  return BubbleChartImpl;
};
