import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-qos-compare';

const CHART_W = 300, CHART_H = 150;
const N = 100;
const DT = 0.1; // [s] 틱 간격
const Y_MAX = 0.8; // [s]

function seededRand(seed: number): number {
  const x = Math.sin(seed * 999.7) * 10000;
  return x - Math.floor(x) - 0.5;
}

const STRATEGIES = [
  { title: '① 처리를 더 빠르게', detail: '다운샘플링(해상도↓), 알고리즘 최적화 — 애초에 9.4ms 같은 처리 시간 자체를 줄인다(19강 성능 측정 참고).' },
  { title: '② 처리를 분리', detail: '수신 콜백과 무거운 연산을 별도 스레드/프로세스로 분리 — 이미지 수신 자체가 막히지 않게 한다.' },
  { title: '③ 샘플링(throttle)', detail: '모든 프레임을 처리하지 않고 N프레임마다 1번만 처리 — 처리율을 의도적으로 낮춰 큐가 쌓이지 않게 한다.' },
];

const MD = `
## QoS — best-effort vs reliable
- 프레임은 **"늦으면 버리는" 데이터**입니다. reliable+깊은 큐로 밀린 프레임을 성실히 재전송하면 **점점 과거를 보는 로봇**이 됩니다.
- best-effort·depth=1로 "최신만" 유지하는 것이 \`qos_profile_sensor_data\`의 이유입니다 — **"프레임은 신선도가 생명"**이라, 밀리면 버려야 합니다.
- 구독자 처리 속도가 발행 속도보다 느릴 때(비율 &lt; 1), reliable은 지연이 **계속 누적**되지만 best-effort는 오래된 프레임을 버려 **최신 상태를 유지**합니다.
- 영상통화에서 네트워크가 느려질 때 오래된 프레임을 붙잡고 재생하지 않고 화면이 끊기며 곧장 최신 프레임으로 건너뛰는 것과 같은 원리입니다.
- 19강에서 잰 처리율(FPS), 22강의 \`ros2 topic hz/delay\` 측정이 바로 이 "처리 속도/발행 속도 비율"을 실제로 재는 도구입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionQosCompare extends w.HTMLElement {
    private rate = 0.7; // 구독자 처리 속도 / 발행 속도

    private refresh() {
      const slowdown = Math.max(0, 1 - this.rate);
      const reliable: number[] = [];
      const bestEffort: number[] = [];
      for (let i = 0; i < N; i++) {
        reliable.push(Math.min(Y_MAX, slowdown * i * DT));
        bestEffort.push(DT * (1 + 0.3 * Math.sin(i * 0.7) + 0.1 * seededRand(i)));
      }

      const toX = (i: number) => (i / (N - 1)) * CHART_W;
      const toY = (v: number) => CHART_H - (v / Y_MAX) * CHART_H;
      const toPolyline = (arr: number[]) => arr.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

      const setAttr = (sel: string, attr: string, val: string) => this.shadowRoot?.querySelector(sel)?.setAttribute(attr, val);
      setAttr('#qc-reliable', 'points', toPolyline(reliable));
      setAttr('#qc-besteffort', 'points', toPolyline(bestEffort));

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#qc-rate-val', this.rate.toFixed(2));
      setText('#qc-reliable-final', `reliable+depth10: ${reliable[N - 1].toFixed(2)}s 지연`);
      setText('#qc-besteffort-final', `best-effort+depth1: ~${bestEffort[N - 1].toFixed(2)}s (신선 유지)`);

      const verdict = this.shadowRoot?.querySelector('#qc-verdict') as HTMLElement;
      if (verdict) {
        if (this.rate >= 1) {
          verdict.textContent = '처리 속도가 충분해 두 QoS 모두 지연이 낮습니다.';
          verdict.style.background = '#dcfce7'; verdict.style.color = '#166534'; verdict.style.borderColor = '#bbf7d0';
        } else {
          verdict.textContent = `처리 속도가 발행보다 느립니다 — reliable은 10초 뒤 ${reliable[N - 1].toFixed(2)}s까지 지연 누적, best-effort는 항상 최신 프레임 유지.`;
          verdict.style.background = '#fee2e2'; verdict.style.color = '#991b1b'; verdict.style.borderColor = '#fecaca';
        }
      }
    }

    @addEventListener('#qc-rate', 'input')
    onRate(e: Event) { this.rate = Number((e.target as HTMLInputElement).value); this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .qc-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .qc-intro b { color:#0369a1; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:40px; text-align:right; color:#1e293b; }
          svg { display:block; width:100%; max-width:${CHART_W}px; margin:12px auto; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
          .qc-legend { display:flex; gap:14px; justify-content:center; font-size:11px; color:#64748b; flex-wrap:wrap; }
          .qc-finals { font-size:12px; font-weight:700; color:#1e293b; text-align:center; margin-top:8px; display:flex; flex-direction:column; gap:2px; }
          .qc-verdict { text-align:center; font-size:12px; font-weight:700; border-radius:8px; padding:8px 12px; margin-top:10px; border:1px solid; }
          .qc-strategies { margin-top:16px; display:flex; flex-direction:column; gap:6px; }
          .qc-strategies-title { font-size:12.5px; font-weight:800; color:#1e293b; margin-bottom:2px; }
          .qc-strategy { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; font-size:11.5px; }
          .qc-strategy b { color:#0369a1; display:block; margin-bottom:2px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="qc-intro">
          처리가 느린 구독자가 있을 때 <b>reliable+깊은 큐</b>는 밀린 프레임까지 순서대로 성실히 전달하려다 지연이 계속 쌓이고, <b>best-effort+depth1</b>은 오래된 프레임을 과감히 버려 항상 최신만 유지합니다. 구독자 처리 속도를 발행 속도보다 느리게 만들어보고 두 QoS의 지연 그래프가 어떻게 갈라지는지 확인해보세요.
        </div>

        <div class="ctl"><label>구독자/발행 속도 비율 <input id="qc-rate" type="range" min="0.3" max="1.3" step="0.05" value="${this.rate}"><b id="qc-rate-val">${this.rate.toFixed(2)}</b></label></div>

        <svg viewBox="0 0 ${CHART_W} ${CHART_H}">
          <polyline id="qc-reliable" points="" fill="none" stroke="#ef4444" stroke-width="2"/>
          <polyline id="qc-besteffort" points="" fill="none" stroke="#16a34a" stroke-width="2"/>
        </svg>
        <div class="qc-legend">
          <span><span style="color:#ef4444">—</span> reliable + depth10</span>
          <span><span style="color:#16a34a">—</span> best-effort + depth1</span>
        </div>

        <div class="qc-finals">
          <span id="qc-reliable-final"></span>
          <span id="qc-besteffort-final"></span>
        </div>
        <div class="qc-verdict" id="qc-verdict"></div>

        <div class="qc-strategies">
          <div class="qc-strategies-title">심화 — 처리 지연이 프레임 주기를 넘으면: 세 가지 전략</div>
          ${STRATEGIES.map(s => `<div class="qc-strategy"><b>${s.title}</b>${s.detail}</div>`).join('')}
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
