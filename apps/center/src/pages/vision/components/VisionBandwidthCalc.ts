import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-bandwidth-calc';

const WIFI_BUDGET_MBPS = 5; // 실효 WiFi 대역폭 가정치 [MB/s]

const MD = `
## 영상 대역폭 — B = W × H × C × fps
- \`640 × 480 × 3B × 30Hz ≈ 26.4 MB/s\` — 네 값이 **곱셈**으로 얽혀 있다는 게 핵심입니다: 해상도를 절반(가로·세로 각각)으로 줄이면 대역폭은 **1/4**, fps를 절반으로 줄이면 **1/2**이 됩니다.
- 대역폭이 부족할 때 가장 효과적인 손잡이는 **해상도**, 그다음이 **압축**(JPEG로 1/10~1/30), 마지막이 **fps**입니다.
- 같은 PC 안에서는 괜찮지만, WiFi(실효 수 MB/s)로 원격 모니터링하면 raw는 즉시 파탄 납니다 — \`image_transport\`가 \`/image_raw/compressed\`를 자동 제공하는 이유입니다. 처리 노드는 raw, 원격 뷰어는 compressed가 정석입니다.
- 가정용 WiFi 업로드 속도는 보통 수십 Mbps(= 수 MB/s) 수준입니다 — raw 26.4MB/s(≈211Mbps)는 그 몇 배라 압축 없이는 전송 자체가 불가능합니다.
- 이 숫자들은 혼자 있지 않습니다: 19강에서 잰 처리율(FPS)이 실제 발행 fps의 상한이 되고, 22강의 rosbag 재생 시 \`ros2 topic hz\`로 측정하는 처리율도 결국 이 대역폭·fps 계산과 같은 저울 위에 있습니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionBandwidthCalc extends w.HTMLElement {
    private width = 640;
    private height = 480;
    private fps = 30;
    private compressRatio = 20; // raw / compressed

    private refresh() {
      const rawMBps = (this.width * this.height * 3 * this.fps) / (1024 * 1024);
      const compMBps = rawMBps / this.compressRatio;

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#bw-w-val', String(this.width));
      setText('#bw-h-val', String(this.height));
      setText('#bw-fps-val', String(this.fps));
      setText('#bw-ratio-val', `1/${this.compressRatio}`);
      setText('#bw-formula', `${this.width} × ${this.height} × 3B × ${this.fps}Hz = ${rawMBps.toFixed(1)} MB/s`);
      setText('#bw-raw-val', `${rawMBps.toFixed(1)} MB/s`);
      setText('#bw-comp-val', `${compMBps.toFixed(2)} MB/s`);

      const maxV = Math.max(rawMBps, WIFI_BUDGET_MBPS * 1.2, 1);
      const barsEl = this.shadowRoot?.querySelector('#bw-bars') as HTMLElement;
      const CHART_W = 260, CHART_H = 130;
      if (barsEl) {
        const rawH = (rawMBps / maxV) * CHART_H;
        const compH = (compMBps / maxV) * CHART_H;
        const wifiY = CHART_H - (WIFI_BUDGET_MBPS / maxV) * CHART_H;
        barsEl.innerHTML =
          `<rect x="20" y="${(CHART_H - rawH).toFixed(1)}" width="60" height="${rawH.toFixed(1)}" fill="#ef4444"/>` +
          `<text x="50" y="${CHART_H + 14}" font-size="10" fill="#334155" text-anchor="middle">raw</text>` +
          `<rect x="150" y="${(CHART_H - compH).toFixed(1)}" width="60" height="${Math.max(compH, 1.5).toFixed(1)}" fill="#16a34a"/>` +
          `<text x="180" y="${CHART_H + 14}" font-size="10" fill="#334155" text-anchor="middle">compressed</text>` +
          `<line x1="0" y1="${wifiY.toFixed(1)}" x2="${CHART_W}" y2="${wifiY.toFixed(1)}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,3"/>` +
          `<text x="${CHART_W - 4}" y="${(wifiY - 4).toFixed(1)}" font-size="9" fill="#92400e" text-anchor="end">WiFi 실효 ~${WIFI_BUDGET_MBPS}MB/s</text>`;
      }

      const verdict = this.shadowRoot?.querySelector('#bw-verdict') as HTMLElement;
      if (verdict) {
        const rawOk = rawMBps <= WIFI_BUDGET_MBPS;
        verdict.textContent = rawOk
          ? '✅ raw 그대로도 WiFi로 넘길 수 있습니다.'
          : `❌ raw(${rawMBps.toFixed(1)}MB/s)는 WiFi 예산을 초과 — compressed(${compMBps.toFixed(2)}MB/s)를 써야 합니다.`;
        verdict.style.background = rawOk ? '#dcfce7' : '#fee2e2';
        verdict.style.color = rawOk ? '#166534' : '#991b1b';
        verdict.style.borderColor = rawOk ? '#bbf7d0' : '#fecaca';
      }
    }

    @addEventListener('#bw-w', 'input') onW(e: Event) { this.width = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#bw-h', 'input') onH(e: Event) { this.height = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#bw-fps', 'input') onFps(e: Event) { this.fps = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#bw-ratio', 'input') onRatio(e: Event) { this.compressRatio = Number((e.target as HTMLInputElement).value); this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .bw-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .bw-intro b { color:#0369a1; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:55px; text-align:right; color:#1e293b; }
          .bw-formula { text-align:center; font-size:12.5px; font-weight:700; color:#0369a1; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 12px; margin-top:12px; }
          svg { display:block; width:100%; max-width:280px; margin:12px auto; }
          .bw-vals { display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px; text-align:center; }
          .bw-vals b { display:block; font-size:14px; }
          .bw-verdict { text-align:center; font-size:12px; font-weight:700; border-radius:8px; padding:8px 12px; margin-top:10px; border:1px solid; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="bw-intro">
          이미지는 지금까지 다룬 어떤 메시지보다 <b>천 배쯤 무겁습니다</b>. 해상도·fps·압축률을 슬라이더로 바꿔보며 대역폭이 얼마나 곱셈적으로 변하는지, WiFi로 넘기려면 무엇부터 줄여야 하는지 확인해보세요.
        </div>

        <div class="ctl"><label>너비(W) <input id="bw-w" type="range" min="160" max="1280" step="80" value="${this.width}"><b id="bw-w-val">${this.width}</b></label></div>
        <div class="ctl"><label>높이(H) <input id="bw-h" type="range" min="120" max="960" step="60" value="${this.height}"><b id="bw-h-val">${this.height}</b></label></div>
        <div class="ctl"><label>fps <input id="bw-fps" type="range" min="5" max="60" step="5" value="${this.fps}"><b id="bw-fps-val">${this.fps}</b></label></div>
        <div class="ctl"><label>압축률(1/N) <input id="bw-ratio" type="range" min="5" max="30" step="1" value="${this.compressRatio}"><b id="bw-ratio-val">1/${this.compressRatio}</b></label></div>

        <div class="bw-formula" id="bw-formula"></div>

        <svg viewBox="0 0 260 150"><g id="bw-bars"></g></svg>

        <div class="bw-vals">
          <div>raw <b id="bw-raw-val"></b></div>
          <div>compressed <b id="bw-comp-val"></b></div>
        </div>

        <div class="bw-verdict" id="bw-verdict"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
