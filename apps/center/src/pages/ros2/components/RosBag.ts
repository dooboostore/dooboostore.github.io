import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { markdownParse } from '@center-src/utils/markdown';

const tagName = 'center-ros2-bag';

const TOPICS = [
  { name: '/image_raw', hz: 30, color: '#3b82c4' },
  { name: '/scan', hz: 10, color: '#f59e0b' },
  { name: '/cmd_vel', hz: 5, color: '#22c55e' },
];

const MD = `
## rosbag — 시간을 담는 그릇
- **record**는 토픽을 DB(SQLite .db3)에 그대로 저장. 코드 없이 데이터 수집.
- **play**는 저장된 타임스탬프대로 재생 — 같은 입력을 주며 코드 수정 전후를 비교하면 **회귀 시험**.
- \`ros2 bag info\`로 토픽·메시지 수·지속시간 확인. \`--topics /scan /image_raw\`로 골라 담기.
- 재생 속조절: \`ros2 bag play -r 0.5\` (절반 속도), 루프: \`-l\`
${'```'}mermaid
sequenceDiagram
    participant R as ros2 bag record
    participant F as 파일 run6s
    participant P as ros2 bag play
    R->>F: 토픽 저장
    P->>F: 타임스탬프대로 재생
${'```'}
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosBag extends w.HTMLElement {
    private playing = false;

    private refresh() {
      const play = this.shadowRoot?.querySelector('#rb-play') as HTMLButtonElement;
      if (play) play.textContent = this.playing ? '⏸ 일시정지' : '▶ 재생';
      const svg = this.shadowRoot?.querySelector('#rb-svg') as unknown as SVGSVGElement;
      if (svg) {
        if (this.playing) svg.unpauseAnimations();
        else svg.pauseAnimations();
      }
    }

    private beginAnims() {
      this.shadowRoot?.querySelectorAll('#rb-svg animate, #rb-svg animateMotion').forEach(el => {
        try { (el as any).beginElement(); } catch {}
      });
    }

    @addEventListener('#rb-play', 'click')
    onPlay() {
      if (!this.playing) this.beginAnims();
      this.playing = !this.playing;
      this.refresh();
    }

    @addEventListener('#rb-restart', 'click')
    onRestart() {
      this.beginAnims();
      this.playing = true;
      this.refresh();
    }

    @onConnectedAfter
    onReady() { this.refresh(); markdownParse(this.shadowRoot?.querySelector('#rb-md') as HTMLElement, MD); }

    @onConnectedBodyShadow
    render() {
      const W = 360, DUR = 6, X0 = 96, X1 = W - 8;
      const rows = TOPICS.map((t, i) => {
        const y = 26 + i * 44;
        const n = t.hz * DUR;
        let ticks = '';
        for (let k = 0; k <= n; k++) {
          const x = (X0 + ((X1 - X0) * k) / n).toFixed(1);
          ticks += `<line x1="${x}" y1="${y - 9}" x2="${x}" y2="${y + 9}" stroke="${t.color}" stroke-width="1.5"/>`;
        }
        return `<text x="4" y="${y + 4}" font-size="10" font-weight="700" fill="#334155">${t.name}</text>` + ticks +
          `<text x="${W - 30}" y="${y + 4}" font-size="9" fill="#94a3b8">${t.hz}Hz</text>`;
      }).join('');
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .rb-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rb-intro b { color:#22314e; }
          .rb-btns { display:flex; gap:6px; justify-content:center; margin:10px 0; }
          .rb-btns button { padding:6px 16px; border-radius:16px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#22314e; font-size:12px; font-weight:700; cursor:pointer; }
          svg { display:block; width:100%; max-width:${W}px; margin:12px auto; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
          .rb-cmd { display:flex; gap:6px; align-items:center; background:#0f172a; border-radius:6px; padding:6px 8px; margin-top:6px; }
          .rb-cmd code { flex:1; color:#7dd3fc; font-size:11.5px; font-family:monospace; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rb-intro">
          가상의 6초 녹화본입니다. <b>재생</b>을 누르면 플레이헤드가 타임스탬프대로 훑고, 토픽별 메시지 틱(30/10/5Hz)이 지나갑니다.
        </div>

        <div class="rb-btns">
          <button id="rb-play">▶ 재생</button>
          <button id="rb-restart">↺ 처음부터</button>
        </div>

        <svg id="rb-svg" viewBox="0 0 ${W} 150">
          ${rows}
          <line x1="96" y1="8" x2="96" y2="142" stroke="#e2e8f0" stroke-width="1"/>
          <line x1="${W - 8}" y1="8" x2="${W - 8}" y2="142" stroke="#e2e8f0" stroke-width="1"/>
          <line x1="96" y1="4" x2="96" y2="146" stroke="#ef4444" stroke-width="2.5">
            <animate attributeName="x1" from="96" to="${W - 8}" dur="${DUR}s" begin="indefinite" fill="freeze"/>
            <animate attributeName="x2" from="96" to="${W - 8}" dur="${DUR}s" begin="indefinite" fill="freeze"/>
          </line>
          <circle r="5" fill="#ef4444">
            <animateMotion dur="${DUR}s" begin="indefinite" fill="freeze" path="M96,146 L${W - 8},146"/>
          </circle>
        </svg>
        <div class="math-desc">빨간 플레이헤드 = 재생 시각. 틱 밀도가 곧 Hz입니다.</div>

        <div class="rb-cmd"><code>ros2 bag record -a -o run6s</code></div>
        <div class="rb-cmd"><code>ros2 bag play run6s --topics /scan /image_raw</code></div>
        <div class="rb-cmd"><code>ros2 bag info run6s</code></div>

        <div class="md" id="rb-md"></div>
      `;
    }
  }

  return tagName;
};
