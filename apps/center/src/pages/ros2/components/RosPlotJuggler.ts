import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ros2-plotjuggler';

const MD = `
## PlotJuggler — 시계열 현미경
- 토픽·bag을 오실로스코프처럼 봅니다. 필터·변환까지 걸 수 있어 제어기 진동·스파이크 추적에 씁니다.
- 2D 이미지·3D(TF·포인트클라우드) 패널도 있어 slam 탭 코스트맵 검증 같은 것도 됩니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosPlotJuggler extends w.HTMLElement {
    private pjTimer: any = null;
    private pjData: number[] = [];

    private pjDraw() {
      const canvas = this.shadowRoot?.querySelector('#rt-pj-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
      ctx.stroke();
      if (this.pjData.length > 1) {
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        this.pjData.forEach((v, i) => {
          const X = (i / 119) * W;
          const Y = H / 2 - v * (H / 2 - 8);
          i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
        });
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }

    private pjStop() {
      if (this.pjTimer) { clearInterval(this.pjTimer); this.pjTimer = null; }
    }

    @addEventListener('#rt-pj-play', 'click')
    onPjPlay() {
      if (this.pjTimer) { this.pjStop(); }
      else {
        this.pjTimer = setInterval(() => {
          if (!this.shadowRoot?.isConnected) { this.pjStop(); return; }
          // /odom 속도 흉내: 0.55 + 노이즈 + 가끔 스파이크
          const spike = Math.random() < 0.03 ? (Math.random() < 0.5 ? 2 : -2) : 0;
          this.pjData.push(0.55 + (Math.random() - 0.5) * 0.2 + spike);
          if (this.pjData.length > 120) this.pjData.shift();
          this.pjDraw();
        }, 80);
      }
      const pb = this.shadowRoot?.querySelector('#rt-pj-play') as HTMLButtonElement;
      if (pb) pb.textContent = this.pjTimer ? '⏸ 정지' : '▶ 스트림 시작';
    }

    @addEventListener('.rt-copy', 'click', { delegate: true })
    async onCopy(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rt-copy') as HTMLElement;
      if (!btn) return;
      try {
        await navigator.clipboard?.writeText(btn.dataset.copy ?? '');
        const old = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = old; }, 1200);
      } catch {}
    }

    @onConnectedAfter
    onReady() { this.pjDraw(); }

    @onConnectedBodyShadow
    render() {
      const copyBtn = (cmd: string) => `<button class="rt-copy" data-copy="${cmd.replace(/"/g, '&quot;')}">복사</button>`;
      return `
        <style>
          :host { display:block; }
          .rt-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rt-intro b { color:#22314e; }
          .rt-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; padding:10px 14px; margin-top:10px; }
          .rt-def b { color:#0c4a6e; display:inline-block; min-width:36px; }
          .rt-cmd { display:flex; gap:6px; align-items:center; background:#0f172a; border-radius:6px; padding:6px 8px; margin-top:6px; }
          .rt-cmd code { flex:1; color:#7dd3fc; font-size:11.5px; font-family:monospace; overflow-x:auto; white-space:nowrap; }
          .rt-copy { flex-shrink:0; background:#1e293b; color:#e2e8f0; border:1px solid #334155; border-radius:5px; font-size:10.5px; padding:3px 8px; cursor:pointer; }
          .rt-link { font-size:11.5px; margin-top:6px; }
          .rt-link a { color:#0369a1; }
          .rt-set { margin-top:10px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
          .rt-set-title { font-size:12px; font-weight:800; color:#0c4a6e; background:#f0f9ff; padding:7px 12px; }
          .rt-row { display:flex; gap:8px; padding:7px 12px; border-top:1px solid #eef2f7; font-size:11.5px; line-height:1.6; }
          .rt-row code { flex-shrink:0; min-width:170px; color:#0c4a6e; font-family:monospace; font-weight:700; }
          .rt-row span { color:#475569; }
          canvas { display:block; width:100%; max-width:340px; margin:10px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .rt-play { display:block; margin:8px auto; padding:6px 16px; border-radius:16px; border:1.5px solid #22314e; background:#fff; color:#22314e; font-size:12px; font-weight:800; cursor:pointer; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rt-intro">
          아래가 바로 PlotJuggler 화면 맛보기입니다. 스트림을 켜고 스파이크를 잡아보십시오.
        </div>

        <div class="rt-def">
          <div><b>정의</b> 시계열 현미경. 토픽·bag을 오실로스코프처럼 보고 필터·변환까지 건다. ★6.2k.</div>
          <div><b>언제</b> /odom 속도 튐, 제어기 진동, 지연 분석할 때. 아래가 바로 그 화면 맛보기.</div>
          <div><b>예시</b> slam 탭의 −4.5 m/s 스파이크를 여기서 보면 한눈에 잡힘. 2D 이미지·3D(TF·포인트클라우드)도 됨.</div>
        </div>
        <canvas id="rt-pj-canvas" width="340" height="150"></canvas>
        <button class="rt-play" id="rt-pj-play">▶ 스트림 시작</button>
        <div class="rt-cmd"><code>sudo apt install ros-jazzy-plotjuggler-ros</code>${copyBtn('sudo apt install ros-jazzy-plotjuggler-ros')}</div>
        <div class="rt-set"><div class="rt-set-title">⚙️ 자주 쓰는 조작 (설정 파일이 아니라 손 조작)</div><div class="rt-row"><code>토픽 드래그</code><span>토픽을 차트에 끌어다 놓으면 구독 시작. /odom twist.linear.x 같은 필드 단위 선택</span></div><div class="rt-row"><code>일시정지 + 커서</code><span>멈추고 커서로 값 읽기. 스파이크 정점 찍기에 필수</span></div><div class="rt-row"><code>CSV 내보내기</code><span>본 구간을 CSV로 뽑아 파이썬·엑셀로 2차 분석</span></div><div class="rt-row"><code>bag 재생 + 구독</code><span>rosbag play 돌리고 PlotJuggler로 구독 — 같은 장면 반복 분석</span></div><div class="rt-row"><code>2D/3D 패널</code><span>이미지 오버레이·TF·포인트클라우드 확인 (slam 탭 코스트맵 검증용)</span></div></div>
        <div class="rt-link">공식: <a href="https://plotjuggler.io/" target="_blank" rel="noopener">plotjuggler.io</a> · <a href="https://github.com/Plotjuggler/PlotJuggler" target="_blank" rel="noopener">GitHub</a></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
