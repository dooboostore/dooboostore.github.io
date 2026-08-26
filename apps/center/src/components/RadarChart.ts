import { elementDefine, mutationObserverLight, onConnectedAfter, onConnectedBodyShadow, queryShadow, resizeObserverLight } from "@dooboostore/simple-web-component";

const tagName = "stock-radar";

interface AxisDef {
  id: string;
  label: string;        // 축 이름 (아래 작은 글씨)
  labelValue: string;   // 주 라벨 텍스트 (예: "E 45%")
  color: string;        // 라벨 색
}
interface ScoreSet {
  fill?: string;
  stroke?: string;
  strokeWidth: number;
  scores: Record<string, number>;
}

export interface RadarChart extends HTMLElement {}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return existing;

  @elementDefine(tagName, { window: w })
  class RadarChartImpl extends w.HTMLElement implements RadarChart {
    private axes: AxisDef[] = [];
    private sets: ScoreSet[] = [];

    // 자식 <axis>로 축 정의, <score-set>/<score>로 오버레이 폴리곤 정의
    private collect(): void {
      const axes: AxisDef[] = [];
      this.querySelectorAll(':scope > axis').forEach((el) => {
        axes.push({
          id: el.getAttribute('id') || el.getAttribute('axis') || `ax${axes.length}`,
          label: el.getAttribute('label') || String(axes.length),
          labelValue: el.getAttribute('label-value') || '',
          color: el.getAttribute('color') || '#6366f1',
        });
      });
      this.axes = axes;

      const sets: ScoreSet[] = [];
      this.querySelectorAll(':scope > score-set').forEach((setEl) => {
        const scores: Record<string, number> = {};
        setEl.querySelectorAll(':scope > score').forEach((sc) => {
          const ax = sc.getAttribute('axis');
          const v = Number(sc.getAttribute('value'));
          if (ax && Number.isFinite(v)) scores[ax] = v;
        });
        sets.push({
          fill: setEl.getAttribute('fill-style') || undefined,
          stroke: setEl.getAttribute('stroke-style') || undefined,
          strokeWidth: Number(setEl.getAttribute('stroke-width')) || 1,
          scores,
        });
      });
      this.sets = sets;
    }

    @onConnectedAfter
    onConnected() {
      this.collect();
      if (this.canvas) this.drawRadar();
    }

    // 자식 변경 시 재수집 후 다시 그림
    @mutationObserverLight({ childList: true, attributes: true, subtree: true })
    onMutated() {
      this.collect();
      if (this.canvas) this.drawRadar();
    }

    @onConnectedBodyShadow
    render(): string {
      return `
        <style>
          :host { display: block; }
          #radar-canvas { display: block; width: 100%; height: 100%; }
        </style>
        <canvas id="radar-canvas"></canvas>
      `;
    }

    @resizeObserverLight()
    onHostResize(): void {
      if (this.isConnected) this.drawRadar();
    }

    @queryShadow('#radar-canvas')
    private canvas!: HTMLCanvasElement;

    private drawRadar(): void {
      const canvas = this.canvas;
      const axes = this.axes;
      if (!canvas || axes.length === 0) return;
      const n = axes.length;
      const dpr = w.devicePixelRatio || 1;
      const W = canvas.clientWidth || 360;
      const H = canvas.clientHeight || 360;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.36;
      const angle = (i: number) => -Math.PI / 2 + (Math.PI * 2 * i / n);
      const pt = (i: number, v: number) => [cx + Math.cos(angle(i)) * R * (v / 100), cy + Math.sin(angle(i)) * R * (v / 100)] as const;

      // 그리드 (4단계) + 축선
      ctx.strokeStyle = '#eef0f4';
      ctx.lineWidth = 1;
      for (let r = 1; r <= 4; r++) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const [x, y] = pt(i, (r / 4) * 100);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const [x, y] = pt(i, 100);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      // score-set 별 오버레이 폴리곤 (정의 순서대로)
      for (const set of this.sets) {
        ctx.beginPath();
        axes.forEach((a, i) => {
          const v = set.scores[a.id] ?? 50;
          const [x, y] = pt(i, v);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
        if (set.fill) { ctx.fillStyle = set.fill; ctx.fill(); }
        if (set.stroke) { ctx.strokeStyle = set.stroke; ctx.lineWidth = set.strokeWidth; ctx.stroke(); }
      }

      // 축 라벨 (label-value 주 라벨 + label 이름)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      axes.forEach((a, i) => {
        const [x, y] = pt(i, 112);
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = a.color;
        ctx.fillText(a.labelValue, x, y);
        const [x2, y2] = pt(i, 128);
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(a.label, x2, y2 + ((i === 2 || i === 6) ? 14 : 0)); // 좌우 축 이름만 아래로
      });
    }
  }

  return RadarChartImpl;
};