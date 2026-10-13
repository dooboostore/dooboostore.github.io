import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ros2-param';

const TRACK_W = 320;
const TRACK_H = 110;

const MD = `
## 파라미터 — 노드의 손잡이
- 파라미터는 노드가 **선언(declare)**한 설정값입니다. 이름·타입·기본값·범위(설명자)가 정해져 있어 오타·형식 오류를 실행 전에 걸러줍니다.
- 노드를 **재시작하지 않고** 바꿀 수 있습니다: \`ros2 param set /motor max_speed 3.0\` — 로봇이 서 있는 채로 게인·속도·임계값을 튜닝하는 맛이 이겁니다.
- 조회·저장: \`ros2 param list\` · \`ros2 param get /motor max_speed\` · \`ros2 param dump /motor\` (yaml 저장 → launch에서 로드).
- 위 시뮬레이션에서 파랑 게이트가 멈춤선입니다. max_speed를 올리면 빨리 닿고, stop_dist를 넓히면 일찍 섭니다 — 파라미터가 곧 동작입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosParam extends w.HTMLElement {
    private maxSpeed = 2.0; // m/s
    private stopDist = 1.0; // m (벽 앞 멈춤선)

    private refresh() {
      const dur = (8 / Math.max(this.maxSpeed, 0.1)).toFixed(1);
      const dot = this.shadowRoot?.querySelector('#rp-dot animateMotion') as SVGElement;
      if (dot) dot.setAttribute('dur', `${dur}s`);
      const gate = this.shadowRoot?.querySelector('#rp-gate') as SVGElement;
      if (gate) gate.setAttribute('x', String(TRACK_W - 14 - this.stopDist * 22));
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#rp-speed-val', `${this.maxSpeed.toFixed(1)} m/s`);
      setText('#rp-dist-val', `${this.stopDist.toFixed(1)} m`);
      const cmd1 = `$ ros2 param set /motor max_speed ${this.maxSpeed.toFixed(1)}`;
      const cmd2 = `$ ros2 param set /motor stop_dist ${this.stopDist.toFixed(1)}`;
      setText('#rp-cmd', cmd1);
      setText('#rp-cmd2', cmd2);
      this.shadowRoot?.querySelectorAll('.rp-copy').forEach((el, i) => {
        (el as HTMLElement).dataset.copy = i === 0 ? cmd1 : cmd2;
      });
    }

    @addEventListener('#rp-speed', 'input')
    onSpeed(e: Event) { this.maxSpeed = Number((e.target as HTMLInputElement).value) || 0.1; this.refresh(); }
    @addEventListener('#rp-dist', 'input')
    onDist(e: Event) { this.stopDist = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @addEventListener('.rp-copy', 'click', { delegate: true })
    async onCopy(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rp-copy') as HTMLElement;
      if (!btn) return;
      try {
        await navigator.clipboard?.writeText(btn.dataset.copy ?? '');
        const old = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = old; }, 1200);
      } catch {}
    }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const gateX = TRACK_W - 14 - this.stopDist * 22;
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .rp-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rp-intro b { color:#22314e; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:70px; text-align:right; color:#1e293b; }
          svg { display:block; width:100%; max-width:${TRACK_W}px; margin:12px auto; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
          .rp-cmd { display:flex; gap:6px; align-items:center; background:#0f172a; border-radius:6px; padding:6px 8px; margin-top:6px; }
          .rp-cmd code { flex:1; color:#7dd3fc; font-size:11.5px; font-family:monospace; }
          .rp-cmd button { background:#1e293b; color:#e2e8f0; border:1px solid #334155; border-radius:5px; font-size:10.5px; padding:3px 8px; cursor:pointer; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rp-intro">
          가상 모터 노드 <b>/motor</b>의 파라미터 두 개를 직접 돌려보세요. 재시작 없이, 재빌드 없이 — <b>슬라이더가 곧 ros2 param set</b>입니다.
        </div>

        <div class="ctl"><label>max_speed <input id="rp-speed" type="range" min="0.5" max="5" step="0.1" value="${this.maxSpeed}"><b id="rp-speed-val"></b></label></div>
        <div class="ctl"><label>stop_dist <input id="rp-dist" type="range" min="0.2" max="3" step="0.1" value="${this.stopDist}"><b id="rp-dist-val"></b></label></div>

        <svg viewBox="0 0 ${TRACK_W} ${TRACK_H}">
          <line x1="10" y1="70" x2="${TRACK_W - 10}" y2="70" stroke="#cbd5e1" stroke-width="2"/>
          <rect id="rp-gate" x="${gateX}" y="30" width="4" height="60" fill="#3b82c4"/>
          <text x="${TRACK_W - 12}" y="100" font-size="10" fill="#64748b" text-anchor="end">벽</text>
          <rect x="${TRACK_W - 14}" y="20" width="6" height="80" fill="#1e293b"/>
          <circle id="rp-dot" r="9" fill="#f59e0b">
            <animateMotion dur="4s" repeatCount="indefinite" path="M20,55 L${TRACK_W - 40},55 L20,55"/>
          </circle>
        </svg>
        <div class="math-desc">주황 공이 모터(파랑 게이트=멈춤선, 검정=벽). max_speed가 주기, stop_dist가 게이트 위치입니다.</div>

        <div class="rp-cmd"><code id="rp-cmd"></code><button class="rp-copy" data-copy="">복사</button></div>
        <div class="rp-cmd"><code id="rp-cmd2"></code><button class="rp-copy" data-copy="">복사</button></div>

        <div class="md">${marked.parse(MD) as string}</div>
        <center-ros2-param-dict></center-ros2-param-dict>
      `;
    }
  }

  return tagName;
};
