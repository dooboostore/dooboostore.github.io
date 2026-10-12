import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-reinforcement';

const W = 340, H = 200;
const COLS = 8, ROWS = 5;
const CELL = Math.min(W / COLS, (H - 40) / ROWS);
const WALLS = new Set(['2,1', '2,2', '2,3', '5,2', '5,3', '4,3']);
const GOAL = '7,4';
const TRAP = '3,1';

const EXAMPLES = [
  ['게임 (Atari·바둑)', '점수=보상. 알파고·DQN의 출발점'],
  ['로봇 보행', '넘어지면 -1, 전진하면 +1로 네 발 걸음 학습'],
  ['자율주행', '차선 유지 +1, 충돌 -100 (시뮬에서만!)'],
  ['추천·광고', '클릭=보상으로 노출 정책 최적화'],
  ['LLM 정렬 (RLHF)', '사람 선호=보상으로 말투·안전 튜닝'],
  ['공장 스케줄링', '납기 준수=보상으로 작업 순서 학습'],
];

const MD = `
## 강화 학습 — 상벌로 길들이기
- 정답이 아니라 **보상**이 선생님입니다. 잘하면 +1, 못하면 -1을 주며 시행착오로 정책을 깎습니다.
- 위 작은 세상에서 에이전트는 학습된 가치(Q)를 따라 움직입니다. 엡실론(ε)을 올리면 가끔 엉뚱한 길로 새는데, 그 모험이 있어야 함정에 갇히지 않습니다(**탐험 vs 활용**).
- Sim2Real 탭의 RL 기초가 같은 루프(상태→행동→보상)입니다. 여기는 "학습 종류로서의 강화"에 초점을 맞췄습니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  const key = (x: number, y: number) => `${x},${y}`;
  // 목표까지 맨해튼 거리 = 학습된 가치라고 가정
  const dist = (x: number, y: number) => Math.abs(7 - x) + Math.abs(4 - y);

  @elementDefine(tagName, { window: w })
  class MlReinforcement extends w.HTMLElement {
    private ax = 0;
    private ay = 0;
    private eps = 0.2;
    private total = 0;
    private steps = 0;
    private hist: number[] = [];
    private timer: any = null;

    private reset() {
      this.ax = 0; this.ay = 0; this.total = 0; this.steps = 0; this.hist = [];
    }

    private stepOnce() {
      const r = Math.random();
      let nx = this.ax, ny = this.ay;
      if (r < this.eps) {
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) =>
          this.ax + dx >= 0 && this.ax + dx < COLS && this.ay + dy >= 0 && this.ay + dy < ROWS &&
          !WALLS.has(key(this.ax + dx, this.ay + dy)));
        const d = dirs[Math.floor(Math.random() * dirs.length)];
        nx += d[0]; ny += d[1];
      } else {
        let best = Infinity;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
          const X = this.ax + dx, Y = this.ay + dy;
          if (X < 0 || X >= COLS || Y < 0 || Y >= ROWS || WALLS.has(key(X, Y))) return;
          const d = dist(X, Y) + Math.random() * 0.01;
          if (d < best) { best = d; nx = X; ny = Y; }
        });
      }
      this.ax = nx; this.ay = ny;
      this.steps++;
      let rw = -0.1;
      if (key(nx, ny) === GOAL) { rw = 10; this.hist.push(this.total + rw); this.ax = 0; this.ay = 0; this.steps = 0; }
      else if (key(nx, ny) === TRAP) { rw = -5; }
      this.total += rw;
      if (this.hist.length > 40) this.hist.shift();
    }

    private draw() {
      const canvas = this.shadowRoot?.querySelector('#mr-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const X = x * CELL, Y = y * CELL;
          if (WALLS.has(key(x, y))) {
            ctx.fillStyle = '#475569';
            ctx.fillRect(X, Y, CELL, CELL);
          } else {
            ctx.strokeStyle = '#e2e8f0';
            ctx.strokeRect(X + 0.5, Y + 0.5, CELL - 1, CELL - 1);
          }
          if (key(x, y) === GOAL) {
            ctx.fillStyle = '#dcfce7';
            ctx.fillRect(X, Y, CELL, CELL);
            ctx.fillStyle = '#166534';
            ctx.font = `bold ${Math.floor(CELL / 2.4)}px sans-serif`;
            ctx.fillText('★', X + CELL / 4, Y + CELL / 1.5);
          }
          if (key(x, y) === TRAP) {
            ctx.fillStyle = '#fee2e2';
            ctx.fillRect(X, Y, CELL, CELL);
            ctx.fillStyle = '#991b1b';
            ctx.font = `bold ${Math.floor(CELL / 2.4)}px sans-serif`;
            ctx.fillText('▼', X + CELL / 4, Y + CELL / 1.5);
          }
        }
      }
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(this.ax * CELL + CELL / 2, this.ay * CELL + CELL / 2, CELL / 3, 0, Math.PI * 2);
      ctx.fill();
      // 누적 보상 그래프
      const gx = 0, gw = W, gy = H - 34, gh = 30;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(gx, gy, gw, gh);
      if (this.hist.length > 1) {
        const mn = Math.min(...this.hist), mx = Math.max(...this.hist, mn + 1);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        this.hist.forEach((v, i) => {
          const X = gx + 4 + ((gw - 8) * i) / 39;
          const Y = gy + gh - 3 - ((v - mn) / (mx - mn)) * (gh - 6);
          i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
        });
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }

    private refresh() {
      this.draw();
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mr-eps-val', this.eps.toFixed(2));
      setText('#mr-score', `누적 보상 ${this.total.toFixed(1)} · 이번 에피소드 ${this.steps}스텝 · ★도착 ${this.hist.length}회`);
      const btn = this.shadowRoot?.querySelector('#mr-auto') as HTMLButtonElement;
      if (btn) btn.textContent = this.timer ? '⏸ 정지' : '▶ 자동 주행';
    }

    private stop() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    }

    @addEventListener('#mr-step', 'click')
    onStep() { this.stepOnce(); this.refresh(); }
    @addEventListener('#mr-auto', 'click')
    onAuto() {
      if (this.timer) { this.stop(); this.refresh(); return; }
      this.timer = setInterval(() => {
        if (!this.shadowRoot?.isConnected) { this.stop(); return; }
        for (let i = 0; i < 3; i++) this.stepOnce();
        this.refresh();
      }, 120);
      this.refresh();
    }
    @addEventListener('#mr-reset', 'click')
    onReset() { this.stop(); this.reset(); this.refresh(); }
    @addEventListener('#mr-eps', 'input')
    onEps(e: Event) { this.eps = Number((e.target as HTMLInputElement).value); this.refresh(); }

    @onConnectedAfter
    onReady() { this.reset(); this.refresh(); }

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
          .ctl b { min-width:44px; text-align:right; color:#1e293b; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .mr-btns { display:flex; gap:6px; justify-content:center; margin-top:8px; }
          .mr-btns button { padding:6px 14px; border-radius:16px; border:1.5px solid #14532d; background:#f0fdf4; color:#14532d; font-size:12px; font-weight:800; cursor:pointer; }
          .mr-score { text-align:center; font-size:12px; font-weight:700; color:#1e293b; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:8px; font-family:monospace; }
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
          <div><b>정의</b> 정답 대신 보상(+1/-1)으로 시행착오하며 정책을 길들이는 학습입니다.</div>
          <div><b>언제</b> 정답이 없고 시행착오가 가능할 때 씁니다.</div>
          <div><b>예시</b> 게임(Atari·바둑), 로봇 보행, RLHF</div>
        </div>
        <div class="mm-intro">
          주황 공이 에이전트입니다. <b>★에 닿으면 +10</b>, ▼함정은 -5, 한 칸마다 -0.1. ε(모험 확률)을 올리면 가끔 엉뚱한 길로 샙니다.
        </div>

        <div class="ctl"><label>모험 확률 ε <input id="mr-eps" type="range" min="0" max="0.8" step="0.05" value="${this.eps}"><b id="mr-eps-val"></b></label></div>
        <div class="mr-btns">
          <button id="mr-step">한 걸음</button>
          <button id="mr-auto">▶ 자동 주행</button>
          <button id="mr-reset">↺ 리셋</button>
        </div>
        <canvas id="mr-canvas" width="${W}" height="${H}"></canvas>
        <div class="mm-legend"><span>★ 목표 +10</span><span>▼ 함정 -5</span><span>■ 벽</span><span>하단 검은 띠 = 에피소드 보상 추이</span></div>
        <div class="mr-score" id="mr-score"></div>

        <div class="ms-grid">${cards}</div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
