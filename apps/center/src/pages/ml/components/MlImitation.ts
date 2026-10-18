import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-imitation';

const W = 340, H = 200;

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXAMPLES = [
  ['로봇 팔 데모', '사람이 직접 움직인 궤적 수백 개 → 파지 정책 복제'],
  ['자율주행', '인간 운전 로그 → 조향·가속 복제'],
  ['게임', '고수 플레이 리플레이 → 행동 복제'],
  ['말투 복제 (SFT)', '사람 작성 답 → LLM 지도 미세조정'],
  ['수술 로봇', '전문의 조작 기록 → 보조 동작 복제'],
  ['스포츠 분석', '선수 궤적 → 전술 패턴 복제'],
];

const MD = `
## 모방 학습 — 잘하는 사람 어깨너머로
- 전문가의 **시연(demonstration)** 을 정답처럼 보고 그대로 따라합니다. 보상 설계가 필요 없어 시작이 빠릅니다(행동 복제).
- 약점이 있습니다. 시연에 없던 상황에서는 작은 오차가 쌓여 길을 잃습니다(**공분산 이동**). 위에서 노이즈를 키우면 복제 주행이 흔들리는 게 보입니다.
- 처방은 **DAgger**: 헤맬 때마다 전문가에게 다시 물어 데이터를 보충합니다. SFT(지도 미세조정)도 넓게 보면 모방 학습입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  type Pt = { x: number; y: number };

  @elementDefine(tagName, { window: w })
  class MlImitation extends w.HTMLElement {
    private drawing = false;
    private demo: Pt[] = [];
    private prog: number | null = null;
    private noise = 3;
    private timer: any = null;

    private drawAll() {
      const canvas = this.shadowRoot?.querySelector('#mi-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(24, H - 24, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('출', 20, H - 21);
      ctx.fillStyle = '#3b82c4';
      ctx.beginPath();
      ctx.arc(W - 24, 24, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('도', W - 28, 27);
      if (this.demo.length > 1) {
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        this.demo.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
      }
      if (this.prog !== null && this.demo.length > 1) {
        const r = mulberry(99);
        const trail: Pt[] = [];
        let ox = 0, oy = 0;
        const n = Math.floor(this.prog * (this.demo.length - 1)) + 1;
        for (let i = 0; i < n; i++) {
          const g = () => (r() + r() - 1) * this.noise;
          ox += g(); oy += g();
          trail.push({ x: this.demo[i].x + ox, y: this.demo[i].y + oy });
        }
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        trail.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        ctx.lineWidth = 1;
        const last = trail[trail.length - 1];
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    private refresh() {
      this.drawAll();
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mi-noise-val', String(this.noise));
      setText('#mi-msg', this.demo.length < 2
        ? '마우스로 출발(초록)에서 도착(파랑)까지 시범을 그려보세요'
        : this.prog === null
          ? `시범 ${this.demo.length}개 점 기록됨 — 복제 주행 버튼을 눌러보세요`
          : this.prog >= 1 ? '복제 완료 — 주황선이 시범(점선)을 얼마나 따라왔나요?' : '복제 주행 중… (주황)');
      const btn = this.shadowRoot?.querySelector('#mi-play') as HTMLButtonElement;
      if (btn) btn.textContent = this.timer ? '⏸ 정지' : '▶ 복제 주행';
    }

    private stop() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    }

    private pos(e: PointerEvent): Pt | null {
      const canvas = this.shadowRoot?.querySelector('#mi-canvas') as HTMLCanvasElement;
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(W, (e.clientX - r.left) * (W / r.width))),
        y: Math.max(0, Math.min(H, (e.clientY - r.top) * (H / r.height))),
      };
    }

    @addEventListener('#mi-canvas', 'pointerdown')
    onDown(e: PointerEvent) {
      this.stop();
      this.drawing = true;
      this.demo = [];
      this.prog = null;
      const p = this.pos(e);
      if (p) this.demo.push(p);
      try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {}
      this.refresh();
    }
    @addEventListener('#mi-canvas', 'pointermove')
    onMove(e: PointerEvent) {
      if (!this.drawing) return;
      const p = this.pos(e);
      if (!p) return;
      const last = this.demo[this.demo.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 4) this.demo.push(p);
      this.drawAll();
    }
    @addEventListener('#mi-canvas', 'pointerup')
    onUp() { this.drawing = false; this.refresh(); }

    @addEventListener('#mi-play', 'click')
    onPlay() {
      if (this.demo.length < 2) return;
      if (this.timer) { this.stop(); this.refresh(); return; }
      this.prog = 0;
      this.timer = setInterval(() => {
        if (!this.shadowRoot?.isConnected) { this.stop(); return; }
        this.prog = Math.min(1, (this.prog ?? 0) + 0.04);
        if (this.prog >= 1) this.stop();
        this.refresh();
      }, 60);
      this.refresh();
    }
    @addEventListener('#mi-noise', 'input')
    onNoise(e: Event) {
      this.noise = Number((e.target as HTMLInputElement).value);
      this.refresh();
    }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const cards = EXAMPLES.map(e =>
        `<div class="ms-card"><b>${e[0]}</b><span>${e[1]}</span></div>`).join('');
      return `
        <style>
          :host { display:block; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:40px; text-align:right; color:#1e293b; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; cursor:crosshair; touch-action:none; }
          .mi-btn { display:block; margin:8px auto; padding:7px 18px; border-radius:16px; border:1.5px solid #14532d; background:#f0fdf4; color:#14532d; font-size:12px; font-weight:800; cursor:pointer; }
          .mi-msg { text-align:center; font-size:12.5px; font-weight:700; color:#1e293b; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:8px; }
          .ms-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:6px; margin-top:10px; }
          .ms-card { border:1.5px solid #e2e8f0; border-radius:8px; padding:8px 10px; background:#fff; }
          .ms-card b { display:block; font-size:12px; color:#14532d; }
          .ms-card span { font-size:11px; color:#64748b; }
          .mm-legend { display:flex; gap:12px; justify-content:center; font-size:11px; color:#64748b; margin-top:6px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
        </style>

        <div class="mm-def">
          <div><b>정의</b> 전문가의 시연을 정답처럼 보고 그대로 따라하는(복제하는) 학습입니다.</div>
          <div><b>언제</b> 전문가 데모(궤적·로그·작성 답)가 있을 때 씁니다.</div>
          <div><b>예시</b> 로봇 팔 데모, 인간 운전 로그, SFT(사람 답 복제)</div>
        </div>
        <div class="mm-intro">
          <b>당신이 전문가</b>입니다. 시범을 그리면 에이전트가 그대로 복제합니다. 복제 오차(노이즈)를 키우면 작은 어긋남이 쌓여 길을 잃습니다.
        </div>

        <div class="ctl"><label>복제 오차 <input id="mi-noise" type="range" min="0" max="8" step="1" value="${this.noise}"><b id="mi-noise-val"></b></label></div>
        <button class="mi-btn" id="mi-play">▶ 복제 주행</button>
        <canvas id="mi-canvas" width="${W}" height="${H}"></canvas>
        <div class="mm-legend"><span>점선 = 시범</span><span><span style="color:#f59e0b">━</span> 복제</span></div>
        <div class="mi-msg" id="mi-msg"></div>

        <div class="ms-grid">${cards}</div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
