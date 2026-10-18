import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { Vector } from '@dooboostore/core';
import { marked } from 'marked';

const tagName = 'center-math-trig';

const MD = `
## 삼각함수란?
- 단위원 위를 각도 θ만큼 돈 점의 좌표가 **(cosθ, sinθ)** 입니다.
- \`tanθ = sinθ / cosθ\` — 90°·270°에서는 분모가 0이라 발산합니다.
- 각도 슬라이더를 움직이면 단위원 위 점과 파형 위 점이 함께 움직입니다.
- **어디에 쓰이나요?** — 소리·전파 같은 파동(오디오 이퀄라이저 파형), 용수철·그네 진동, 게임 점프 곡선과 day-night 사이클.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathTrig extends w.HTMLElement {
    private deg = 60;

    private calc() {
      const rad = (this.deg * Math.PI) / 180;
      const p = new Vector().fromAngle(rad);
      const s = p.y, c = p.x;
      const t = Math.abs(c) < 1e-6 ? (s >= 0 ? Infinity : -Infinity) : s / c;
      return { rad, s, c, t };
    }

    private waves(): { sin: string; cos: string; tan: string[] } {
      const sin: string[] = [], cos: string[] = [];
      const tanSegs: string[][] = [[], [], []];
      for (let d = 0; d <= 360; d += 2) {
        const r = (d * Math.PI) / 180;
        sin.push(`${d},${Math.sin(r).toFixed(3)}`);
        cos.push(`${d},${Math.cos(r).toFixed(3)}`);
        // 점근선(90°·270°)에서 끊기: 구간별로 나눠 발산 연결선 방지, ±2 클립
        const t = Math.tan(r);
        const v = `${d},${Math.max(-2, Math.min(2, t)).toFixed(3)}`;
        if (d < 90) tanSegs[0].push(v);
        else if (d > 90 && d < 270) tanSegs[1].push(v);
        else if (d > 270) tanSegs[2].push(v);
      }
      return { sin: sin.join(' '), cos: cos.join(' '), tan: tanSegs.map(s => s.join(' ')) };
    }

    private fmtT(t: number): string {
      if (!Number.isFinite(t)) return '∞';
      return String(parseFloat(t.toFixed(2)));
    }

    private refresh() {
      const { s, c, t, rad } = this.calc();
      const applied = this.shadowRoot?.querySelector('#math-trig-applied') as HTMLElement;
      if (applied) {
        applied.textContent =
          `적용: θ=${this.deg}° (${rad.toFixed(3)}rad) → sin=${s.toFixed(2)}, cos=${c.toFixed(2)}, tan=${this.fmtT(t)}`;
      }
      const dVal = this.shadowRoot?.querySelector('#trig-deg-val') as HTMLElement;
      if (dVal) dVal.textContent = `${this.deg}° ${rad.toFixed(2)}rad`;
      const vec = this.shadowRoot?.querySelector('#trig-vec') as HTMLElement;
      if (vec) {
        vec.setAttribute('x2', String(parseFloat(c.toFixed(3))));
        vec.setAttribute('y2', String(parseFloat(s.toFixed(3))));
        vec.setAttribute('label', `P(${c.toFixed(2)}, ${s.toFixed(2)})`);
      }
      const tip = this.shadowRoot?.querySelector('#trig-tip') as HTMLElement;
      if (tip) {
        tip.setAttribute('x', String(parseFloat(c.toFixed(3))));
        tip.setAttribute('y', String(parseFloat(s.toFixed(3))));
      }
      const arc = this.shadowRoot?.querySelector('#trig-arc') as HTMLElement;
      if (arc) arc.setAttribute('end-angle', String((this.deg * Math.PI) / 180));
      const px = this.shadowRoot?.querySelector('#trig-proj-x') as HTMLElement;
      if (px) px.setAttribute('points', `0,0 ${c.toFixed(3)},0`);
      const py = this.shadowRoot?.querySelector('#trig-proj-y') as HTMLElement;
      if (py) py.setAttribute('points', `${c.toFixed(3)},0 ${c.toFixed(3)},${s.toFixed(3)}`);
      // |tan|이 차트를 벗어나면: 선분은 숨기고 화살표로 무한대 방향 표시
      const clipped = !Number.isFinite(t) || Math.abs(t) > 1.5;
      const edge = s >= 0 ? 1.5 : -1.5;
      const ts = this.shadowRoot?.querySelector('#trig-tan-seg') as HTMLElement;
      if (ts) ts.setAttribute('points', clipped ? '' : `1,0 1,${t.toFixed(3)}`);
      const ta = this.shadowRoot?.querySelector('#trig-tan-arrow') as HTMLElement;
      if (ta) ta.setAttribute('y2', clipped ? String(edge) : 'NaN');
      const ms = this.shadowRoot?.querySelector('#trig-m-sin') as HTMLElement;
      if (ms) { ms.setAttribute('x', String(this.deg)); ms.setAttribute('y', String(parseFloat(s.toFixed(3)))); }
      const mc = this.shadowRoot?.querySelector('#trig-m-cos') as HTMLElement;
      if (mc) { mc.setAttribute('x', String(this.deg)); mc.setAttribute('y', String(parseFloat(c.toFixed(3)))); }
      const mt = this.shadowRoot?.querySelector('#trig-m-tan') as HTMLElement;
      if (mt) {
        mt.setAttribute('x', String(this.deg));
        mt.setAttribute('y', String(Number.isFinite(t) ? parseFloat(Math.max(-2, Math.min(2, t)).toFixed(3)) : 0));
      }
    }

    @addEventListener('#trig-deg', 'input')
    onDegInput(e: Event) {
      this.deg = Number((e.target as HTMLInputElement).value) || 0;
      this.refresh();
    }

    @onConnectedBodyShadow
    render() {
      const { s, c, t, rad } = this.calc();
      const clipped0 = !Number.isFinite(t) || Math.abs(t) > 1.5;
      const edge0 = s >= 0 ? 1.5 : -1.5;
      const wv = this.waves();
      const tMark = Number.isFinite(t) ? parseFloat(Math.max(-2, Math.min(2, t)).toFixed(3)) : 0;
      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; color:#6366f1; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .math-sub-title { font-size:12px; font-weight:800; color:#475569; text-align:center; margin:10px 0 4px; }
          .math-legend { display:flex; gap:12px; font-size:11px; color:#64748b; margin-top:8px; flex-wrap:wrap; }
          .math-legend b { font-weight:800; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:88px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">수식: P = (cosθ, sinθ), tanθ = sinθ/cosθ</div>
        <div class="math-applied" id="math-trig-applied">적용: θ=${this.deg}° (${rad.toFixed(3)}rad) → sin=${s.toFixed(2)}, cos=${c.toFixed(2)}, tan=${this.fmtT(t)}</div>
        <div class="math-desc">각도를 움직이면 단위원 위 점 P와 파형 위 점이 함께 움직입니다.</div>
        <cartesian-chart x-min="-1.5" x-max="1.5" y-min="-1.5" y-max="1.5" center-x="0" center-y="0" x-label="X" y-label="Y">
          <circle x="0" y="0" r="1" color="#94a3b8" dash="6,4"></circle>
          <series id="trig-proj-x" points="0,0 ${c.toFixed(3)},0" color="#10b981" width="3" label="cos"></series>
          <series id="trig-proj-y" points="${c.toFixed(3)},0 ${c.toFixed(3)},${s.toFixed(3)}" color="#6366f1" width="3" label="sin"></series>
          <series id="trig-tan-seg" points="${clipped0 ? '' : `1,0 1,${t.toFixed(3)}`}" color="#f59e0b" width="3" label="tan"></series>
          <vector id="trig-tan-arrow" x1="1" y1="0" x2="1" y2="${clipped0 ? edge0 : 'NaN'}" color="#f59e0b" width="3" label="tan"></vector>
          <vector id="trig-vec" x1="0" y1="0" x2="${c.toFixed(3)}" y2="${s.toFixed(3)}" color="#6366f1" label="P(${c.toFixed(2)}, ${s.toFixed(2)})"></vector>
          <marker id="trig-tip" x="${c.toFixed(3)}" y="${s.toFixed(3)}" color="#6366f1" size="4"></marker>
          <arc id="trig-arc" x="0" y="0" r="30" start-angle="0" end-angle="${rad}" color="#f59e0b"></arc>
        </cartesian-chart>
        <div class="math-sub-title">사인파 · 코사인파 · 탄젠트파</div>
        <cartesian-chart x-min="0" x-max="360" y-min="-2" y-max="2" x-label="각도 (도)" disabled-aspect height="180">
          <series points="${wv.sin}" color="#6366f1" label="sin"></series>
          <series points="${wv.cos}" color="#10b981" label="cos"></series>
          ${wv.tan.map((p, i) => `<series points="${p}" color="#f59e0b"${i === 0 ? ' label="tan"' : ''}></series>`).join('')}
          <marker id="trig-m-sin" x="${this.deg}" y="${s.toFixed(3)}" color="#6366f1" size="5"></marker>
          <marker id="trig-m-cos" x="${this.deg}" y="${c.toFixed(3)}" color="#10b981" size="5"></marker>
          <marker id="trig-m-tan" x="${this.deg}" y="${tMark}" color="#f59e0b" size="5"></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#6366f1">— sin</b></span><span><b style="color:#10b981">— cos</b></span><span><b style="color:#f59e0b">— tan</b></span></div>
        <div class="ctl"><label>각도 <input id="trig-deg" type="range" min="0" max="360" step="1" value="${this.deg}"><b id="trig-deg-val">${this.deg}° ${rad.toFixed(2)}rad</b></label></div>
        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
