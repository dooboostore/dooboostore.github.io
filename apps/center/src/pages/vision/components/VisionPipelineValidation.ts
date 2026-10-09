import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-pipeline-validation';

const DISTANCES = ['30cm', '50cm', '80cm'];
const A_ERR_BASE = [1.1, 1.3, 1.8]; // 마커 PnP 오차%
const B_ERR_BASE = [3.2, 4.1, 6.3]; // 색+크기 오차%
const N_SCATTER = 40;
const N_HIST = 30;

function seededRand(seed: number): number {
  const x = Math.sin(seed * 999.7) * 10000;
  return x - Math.floor(x) - 0.5;
}

const MD = `
## 검증 — rosbag과 줄자
- **5-1 정적 정확도**: 물체를 실측 30/50/80cm에 두고 두 경로의 추정 거리를 비교 — 판정 기준은 **오차 < 5%, A가 B보다 정밀한지**. **마커(A)가 색+크기(B)보다 일관되게 정밀**합니다.
- **5-2 교차 검증**: 공에 마커를 붙여 두 경로가 같은 물체를 추정하게 하면, A(정밀)를 기준으로 B의 오차 분포를 얻습니다 — **14강 Jacobian 교차 검증과 같은 논리**(정밀한 기준으로 덜 정밀한 쪽의 오차를 역산)입니다.
- **5-3 rosbag 회귀 시험**: 21강의 bag을 재생하며 \`ros2 topic hz/delay\`로 처리율·지연을 측정 — **같은 bag으로 코드 수정 전후를 비교하면 회귀 시험**이 됩니다. 수치가 나빠지면 커밋을 되돌릴 근거가 생깁니다.
- **심화 — 시간 동기화**: \`/camera_info\`와 \`/image_raw\`의 타임스탬프가 어긋나면, 그 순간의 K·왜곡 계수가 실제로는 다른 프레임에 쓰인 것이라 계산된 포즈가 미묘하게(하지만 체계적으로) 틀어집니다 — 두 토픽을 같은 헤더 스탬프로 묶는 동기화가 중요한 이유입니다.
- 이 세 가지 검증은 결국 19강(색검출)·20강(캘리브레이션)·21강(ROS2 배관)에서 만든 모든 조각이 **한꺼번에 시험대에 오르는 자리**입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionPipelineValidation extends w.HTMLElement {
    private noise = 1; // 1.0 = 기준, 커질수록 품질 저하

    private refresh() {
      const n = this.noise;

      // ① 거리별 오차 막대
      const aErr = A_ERR_BASE.map(v => v * n);
      const bErr = B_ERR_BASE.map(v => v * n);
      const barsEl = this.shadowRoot?.querySelector('#pv-bars') as HTMLElement;
      if (barsEl) {
        const CW = 180, CH = 100;
        const maxV = 12;
        const groupW = CW / DISTANCES.length;
        barsEl.innerHTML = DISTANCES.map((d, i) => {
          const ha = (aErr[i] / maxV) * CH, hb = (bErr[i] / maxV) * CH;
          const x0 = i * groupW + 6;
          return `<rect x="${x0}" y="${(CH - ha).toFixed(1)}" width="12" height="${ha.toFixed(1)}" fill="#16a34a"/>` +
            `<rect x="${x0 + 14}" y="${(CH - hb).toFixed(1)}" width="12" height="${hb.toFixed(1)}" fill="#ea580c"/>` +
            `<text x="${x0 + 13}" y="${CH + 12}" font-size="8" fill="#334155" text-anchor="middle">${d}</text>`;
        }).join('');
      }

      // ② 교차 검증 산점도 (A 거리 vs B 거리, y=x 근처에 노이즈)
      const scatterEl = this.shadowRoot?.querySelector('#pv-scatter') as HTMLElement;
      if (scatterEl) {
        const SW = 110, SH = 110;
        const toPx = (v: number) => (v / 0.9) * SW; // 0~0.9m 범위
        let dots = `<line x1="0" y1="${SH}" x2="${SW}" y2="0" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3,2"/>`;
        for (let i = 0; i < N_SCATTER; i++) {
          const trueDist = 0.2 + (i / N_SCATTER) * 0.6;
          const bDist = trueDist + seededRand(i) * 0.04 * n;
          const x = toPx(trueDist);
          const y = SH - toPx(bDist);
          dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="#2563eb" opacity="0.7"/>`;
        }
        scatterEl.innerHTML = dots;
      }

      // ③ bag 재생 지연 히스토그램
      const histEl = this.shadowRoot?.querySelector('#pv-hist') as HTMLElement;
      let meanDelay = 44;
      if (histEl) {
        const HW = 180, HH = 90;
        const bins = new Array(N_HIST).fill(0);
        const samples = 300;
        for (let i = 0; i < samples; i++) {
          const v = meanDelay + seededRand(i) * 25 * n;
          const binIdx = Math.max(0, Math.min(N_HIST - 1, Math.round((v / 100) * N_HIST)));
          bins[binIdx]++;
        }
        const maxBin = Math.max(...bins, 1);
        const bw = HW / N_HIST;
        histEl.innerHTML = bins.map((c, i) => {
          const h = (c / maxBin) * HH;
          return `<rect x="${(i * bw).toFixed(1)}" y="${(HH - h).toFixed(1)}" width="${(bw - 0.5).toFixed(1)}" height="${h.toFixed(1)}" fill="#7c3aed"/>`;
        }).join('');
      }

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#pv-noise-val', `${n.toFixed(1)}×`);
      setText('#pv-delay-mean', `촬영→발행 평균 지연 ≈ ${meanDelay}ms`);
    }

    @addEventListener('#pv-noise', 'input')
    onNoise(e: Event) { this.noise = Number((e.target as HTMLInputElement).value); this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .pv-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .pv-intro b { color:#0369a1; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:40px; text-align:right; color:#1e293b; }
          .pv-strip { display:flex; gap:10px; margin-top:14px; flex-wrap:wrap; justify-content:center; }
          .pv-panel { text-align:center; }
          .pv-panel svg { display:block; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; }
          .pv-panel-label { font-size:10px; font-weight:700; color:#475569; margin-top:4px; max-width:160px; }
          .pv-legend { display:flex; gap:10px; justify-content:center; font-size:10.5px; color:#64748b; margin-top:8px; flex-wrap:wrap; }
          .pv-delay-mean { text-align:center; font-size:12px; font-weight:700; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:6px 12px; margin-top:10px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="pv-intro">
          파이프라인을 다 이었으면 "되는 것 같다"가 아니라 <b>줄자와 rosbag으로 검증</b>해야 합니다. 거리별 오차 비교, 같은 물체에 대한 두 경로 교차 검증, bag 재생 지연까지 — 세 가지 검증을 한 화면에서 봅니다. 노이즈 배율을 올려 품질이 나빠지면 세 그래프가 동시에 어떻게 흔들리는지 확인해보세요.
        </div>

        <div class="ctl"><label>노이즈 배율 <input id="pv-noise" type="range" min="0.5" max="3" step="0.1" value="${this.noise}"><b id="pv-noise-val">${this.noise.toFixed(1)}×</b></label></div>
        <div class="math-desc">노이즈 배율 = 조명 변화·진동·흔들림이 심한 환경일수록 커진다고 생각하면 됩니다(1.0=기준 환경).</div>

        <div class="pv-strip">
          <div class="pv-panel">
            <svg viewBox="0 0 180 112" width="180" height="112"><g id="pv-bars"></g></svg>
            <div class="pv-panel-label">① 거리별 오차(A=초록 마커, B=주황 색+크기) · 판정: 오차&lt;5%, A가 B보다 정밀해야 함</div>
          </div>
          <div class="pv-panel">
            <svg viewBox="0 0 110 110" width="110" height="110"><g id="pv-scatter"></g></svg>
            <div class="pv-panel-label">② 교차 검증(A 기준 B의 분산)</div>
          </div>
          <div class="pv-panel">
            <svg viewBox="0 0 180 90" width="180" height="90"><g id="pv-hist"></g></svg>
            <div class="pv-panel-label">③ bag 재생 지연 히스토그램</div>
          </div>
        </div>

        <div class="pv-delay-mean" id="pv-delay-mean"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
