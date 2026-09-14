import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-gain';

const MD = `
## 게인(gain, 이득)이란?
- 가장 단순하게는 **입력을 몇 배로 키우거나 줄이는지**입니다: \`output = K × input\`. K>1이면 증폭, 0<K<1이면 감쇠, K<0이면 뒤집힘(반전).
- 그런데 실제 시스템(필터·센서·제어기)의 게인은 **주파수에 따라 달라집니다** — 낮은 주파수는 그대로 통과시키고 높은 주파수는 깎아내는 식입니다(저역통과 필터).
- 이런 "주파수별 게인"을 그린 게 **보드 선도(Bode plot)**입니다. 세로축은 흔히 **데시벨(dB) = 20·log₁₀(게인)**로 나타냅니다.
- 1차 저역통과 필터의 게인: \`|H(jf)| = 1/√(1+(f/fc)²)\` — **차단주파수(fc)에서 게인이 정확히 -3dB**(원래 크기의 약 70.7%)로 떨어지고, 그 뒤로는 주파수가 10배씩 늘 때마다 게인이 **-20dB씩** 더 떨어집니다.
- **fc = 1/τ 관계**입니다 — **"시정수(τ)"** 페이지에서 본 그 τ가 클수록(느린 시스템일수록) 차단주파수가 낮아져서 더 낮은 주파수부터 깎기 시작합니다.
- **오픈루프 게인 vs 피드백 게인**: ①의 \`output=K×input\`처럼 **결과를 보지 않고 그냥 곱하기만 하면 오픈루프(open-loop) 게인**입니다 — 방해(외란)가 있으면 그 오차를 영원히 못 고칩니다. 반대로 **출력을 측정해서 목표와 비교한 오차에 곱하면 피드백(feedback) 게인**입니다 — 방해가 있어도 결국 목표에 도달합니다.
- **"PID 제어"** 페이지의 Kp·Ki·Kd가 바로 이 **피드백 게인**입니다 — 오차·적분값·미분값(전부 "측정해서 되먹인" 신호)에 곱해지는 배율이라서 그냥 "게인"이 아니라 "피드백 게인"이라 부릅니다.
- **어디에 쓰이나요?** — 센서 노이즈 필터링(저역통과), 오디오 이퀄라이저, 통신 채널의 신호 감쇠, 제어기 게인 튜닝.
`;

const LOG_MIN = -1, LOG_MAX = 2; // f = 10^x, 0.1Hz ~ 100Hz

function gainLinear(f: number, fc: number) { return 1 / Math.sqrt(1 + (f / fc) ** 2); }
function gainDb(f: number, fc: number) { return 20 * Math.log10(gainLinear(f, fc)); }

function bodeCurve(fc: number, n = 100) {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const x = LOG_MIN + ((LOG_MAX - LOG_MIN) * i) / n;
    const f = Math.pow(10, x);
    pts.push(`${x.toFixed(3)},${gainDb(f, fc).toFixed(3)}`);
  }
  return pts.join(' ');
}

function waveCurve(amp: number, freq: number, T: number, n = 200) {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (T * i) / n;
    pts.push(`${t.toFixed(4)},${(amp * Math.sin(2 * Math.PI * freq * t)).toFixed(4)}`);
  }
  return pts.join(' ');
}

// ── 오픈루프 vs 피드백 게인: 방해(D)가 있을 때, 되먹임이 있고 없고의 차이 ──
const FB_TARGET = 5, FB_STEPS = 25;

/** 피드백 손풀이: 매 스텝 오차(target-output)를 측정해서 Kf만큼 되먹인다. 방해 D는 매 스텝 output에 그대로 더해진다고 가정. */
function feedbackSeries(D: number, Kf: number): number[] {
  let output = 0;
  const outs = [output];
  for (let i = 0; i < FB_STEPS; i++) {
    const error = FB_TARGET - output;
    output = output + Kf * error; // 측정→오차→게인 곱해서 되먹임
    outs.push(output);
  }
  return outs;
}

function stepPtsStr(vals: number[]) { return vals.map((v, i) => `${i},${v.toFixed(4)}`).join(' '); }

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathGain extends w.HTMLElement {
    private K = 1.5;
    private fc = 2;
    private logF = 0.3;
    private D = 2;
    private Kf = 0.3;

    private refresh() {
      const { K, fc, logF } = this;
      const f = Math.pow(10, logF);
      const gLin = gainLinear(f, fc);
      const gDb = gainDb(f, fc);

      const applied1 = this.shadowRoot?.querySelector('#gn-applied1') as HTMLElement;
      if (applied1) applied1.textContent = `적용: K=${K.toFixed(2)} → output = ${K.toFixed(2)} × input`;
      const staticOut = this.shadowRoot?.querySelector('#gn-static-out') as HTMLElement;
      if (staticOut) staticOut.setAttribute('points', waveCurve(K, 1, 2));

      const applied2 = this.shadowRoot?.querySelector('#gn-applied2') as HTMLElement;
      if (applied2) applied2.textContent = `적용: fc=${fc.toFixed(1)}Hz, 테스트 f=${f.toFixed(2)}Hz → 게인 = ${gLin.toFixed(3)} (${gDb.toFixed(1)}dB)`;

      const notes = this.shadowRoot?.querySelector('#gn-notes') as HTMLElement;
      if (notes) notes.innerHTML = `<div>|H(jf)| = 1/√(1+(f/fc)²) = ${gLin.toFixed(3)}</div>` +
        `<div>dB = 20·log₁₀(${gLin.toFixed(3)}) = ${gDb.toFixed(2)}dB</div>` +
        `<div>${Math.abs(f - fc) / fc < 0.05 ? 'fc 지점 — 정확히 -3dB(약 70.7%)' : f < fc ? 'fc보다 낮은 주파수 — 거의 그대로 통과' : 'fc보다 높은 주파수 — 깎여서 통과'}</div>`;

      const kVal = this.shadowRoot?.querySelector('#gn-K-val') as HTMLElement;
      if (kVal) kVal.textContent = K.toFixed(2);
      const fcVal = this.shadowRoot?.querySelector('#gn-fc-val') as HTMLElement;
      if (fcVal) fcVal.textContent = `${fc.toFixed(1)}Hz`;
      const fVal = this.shadowRoot?.querySelector('#gn-f-val') as HTMLElement;
      if (fVal) fVal.textContent = `${f.toFixed(2)}Hz`;

      const bode = this.shadowRoot?.querySelector('#gn-bode') as HTMLElement;
      if (bode) bode.setAttribute('points', bodeCurve(fc));
      const fcMk = this.shadowRoot?.querySelector('#gn-fc-mk') as HTMLElement;
      if (fcMk) fcMk.setAttribute('x', Math.log10(fc).toFixed(3));
      const testMk = this.shadowRoot?.querySelector('#gn-test-mk') as HTMLElement;
      if (testMk) { testMk.setAttribute('x', logF.toFixed(3)); testMk.setAttribute('y', gDb.toFixed(3)); testMk.setAttribute('label', `f=${f.toFixed(2)}Hz: ${gDb.toFixed(1)}dB`); }

      const waveIn = this.shadowRoot?.querySelector('#gn-wave-in') as HTMLElement;
      if (waveIn) waveIn.setAttribute('points', waveCurve(1, f, 2 / Math.max(f, 0.3)));
      const waveOut = this.shadowRoot?.querySelector('#gn-wave-out') as HTMLElement;
      if (waveOut) waveOut.setAttribute('points', waveCurve(gLin, f, 2 / Math.max(f, 0.3)));

      const { D, Kf } = this;
      const fbOuts = feedbackSeries(D, Kf);
      const fbFinal = fbOuts[fbOuts.length - 1];
      const olOutput = FB_TARGET + D;

      const applied3 = this.shadowRoot?.querySelector('#gn-applied3') as HTMLElement;
      if (applied3) applied3.textContent = `적용: 목표=${FB_TARGET}, 방해 D=${D.toFixed(1)}, 피드백게인 Kf=${Kf.toFixed(2)} → 오픈루프=${olOutput.toFixed(2)}(영원히 틀림), 피드백=${fbFinal.toFixed(2)}(목표에 수렴)`;

      const notes3 = this.shadowRoot?.querySelector('#gn-notes3') as HTMLElement;
      if (notes3) notes3.innerHTML = `<div>오픈루프: output = target + D = ${FB_TARGET} + ${D.toFixed(1)} = ${olOutput.toFixed(2)} — 몇 번을 반복해도 안 바뀜(측정을 안 하니까)</div>` +
        `<div>피드백: output ← output + Kf×(target-output) — 매 스텝 오차를 다시 측정해서 줄여나감</div>` +
        `<div style="margin-top:4px;font-weight:800">${Math.abs(fbFinal - FB_TARGET) < 0.05 ? `${FB_STEPS}스텝 후 피드백은 목표(${FB_TARGET})에 거의 정확히 도달` : 'Kf가 너무 작아서(또는 커서) 아직 다 수렴 못함 — Kf를 조절해 보세요'}</div>`;

      const dVal = this.shadowRoot?.querySelector('#gn-D-val') as HTMLElement;
      if (dVal) dVal.textContent = D.toFixed(1);
      const kfVal = this.shadowRoot?.querySelector('#gn-Kf-val') as HTMLElement;
      if (kfVal) kfVal.textContent = Kf.toFixed(2);

      const olLine = this.shadowRoot?.querySelector('#gn-ol-line') as HTMLElement;
      if (olLine) olLine.setAttribute('points', `0,${olOutput.toFixed(3)} ${FB_STEPS},${olOutput.toFixed(3)}`);
      const fbLine = this.shadowRoot?.querySelector('#gn-fb-line') as HTMLElement;
      if (fbLine) fbLine.setAttribute('points', stepPtsStr(fbOuts));
    }

    @addEventListener('#gn-k', 'input')
    onK(e: Event) { this.K = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#gn-fc', 'input')
    onFc(e: Event) { this.fc = Number((e.target as HTMLInputElement).value) || 0.1; this.refresh(); }
    @addEventListener('#gn-f', 'input')
    onF(e: Event) { this.logF = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#gn-d', 'input')
    onD(e: Event) { this.D = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#gn-kf', 'input')
    onKf(e: Event) { this.Kf = Number((e.target as HTMLInputElement).value) || 0.01; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { K, fc, logF, D, Kf } = this;
      const f = Math.pow(10, logF);
      const gLin = gainLinear(f, fc);
      const gDb = gainDb(f, fc);
      const waveT = 2;
      const waveTestT = 2 / Math.max(f, 0.3);
      const fbOuts = feedbackSeries(D, Kf);
      const fbFinal = fbOuts[fbOuts.length - 1];
      const olOutput = FB_TARGET + D;
      return `
        <style>
          :host { display:block; }
          .math-title { font-size:13px; font-weight:800; color:#475569; margin:12px 0 2px; }
          .math-title:first-child { margin-top:0; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; color:#6366f1; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .math-legend { display:flex; gap:12px; font-size:11px; color:#64748b; margin-top:8px; flex-wrap:wrap; }
          .math-legend b { font-weight:800; }
          .math-notes { font-size:12px; font-weight:700; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin-top:8px; line-height:1.7; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:60px; text-align:right; color:#1e293b; }
          hr.gn-sep { border:none; border-top:1px solid #f1f5f9; margin:16px 0; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-title">① 정적 게인 — output = K × input</div>
        <div class="math-formula">output = K × input</div>
        <div class="math-applied" id="gn-applied1">적용: K=${K.toFixed(2)} → output = ${K.toFixed(2)} × input</div>
        <div class="math-desc">K를 바꾸면 주황 출력 파형이 파랑 입력 파형보다 커지거나(K&gt;1) 작아지거나(0&lt;K&lt;1) 뒤집힙니다(K&lt;0).</div>
        <cartesian-chart x-min="0" x-max="${waveT}" y-min="-3.2" y-max="3.2" x-label="시간(s)" y-label="크기" style="height:180px">
          <series points="${waveCurve(1, 1, waveT)}" color="#3e63dd" width="2" label="입력"></series>
          <series id="gn-static-out" points="${waveCurve(K, 1, waveT)}" color="#f59e0b" width="2" label="출력"></series>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#3e63dd">— 입력</b></span><span><b style="color:#f59e0b">— 출력(K×입력)</b></span></div>
        <div class="ctl"><label>K (게인) <input id="gn-k" type="range" min="-2" max="3" step="0.1" value="${K}"><b id="gn-K-val">${K.toFixed(2)}</b></label></div>

        <hr class="gn-sep">
        <div class="math-title">② 주파수별 게인 — 보드 선도(Bode plot)</div>
        <div class="math-formula">|H(jf)| = 1/√(1+(f/fc)²), dB = 20·log₁₀|H|</div>
        <div class="math-applied" id="gn-applied2">적용: fc=${fc.toFixed(1)}Hz, 테스트 f=${f.toFixed(2)}Hz → 게인 = ${gLin.toFixed(3)} (${gDb.toFixed(1)}dB)</div>
        <div class="math-desc">fc(차단주파수)를 지나면 게인이 떨어지기 시작합니다. fc 지점은 항상 정확히 -3dB입니다.</div>
        <cartesian-chart x-min="${LOG_MIN}" x-max="${LOG_MAX}" y-min="-45" y-max="5" x-label="log₁₀(f)" y-label="게인(dB)">
          <series points="${LOG_MIN},-3 ${LOG_MAX},-3" color="#e2e8f0" dash="3,3" label="-3dB"></series>
          <series id="gn-bode" points="${bodeCurve(fc)}" color="#8b5cf6" width="2.2"></series>
          <marker id="gn-fc-mk" x="${Math.log10(fc).toFixed(3)}" y="-3" color="#10b981" size="5" label="fc=${fc.toFixed(1)}Hz(-3dB)"></marker>
          <marker id="gn-test-mk" x="${logF.toFixed(3)}" y="${gDb.toFixed(3)}" color="#f59e0b" size="5" label="f=${f.toFixed(2)}Hz: ${gDb.toFixed(1)}dB"></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#8b5cf6">— 게인(dB)</b></span><span><b style="color:#10b981">● 차단주파수 fc</b></span><span><b style="color:#f59e0b">● 테스트 주파수</b></span></div>
        <div class="math-notes" id="gn-notes">
          <div>|H(jf)| = 1/√(1+(f/fc)²) = ${gLin.toFixed(3)}</div>
          <div>dB = 20·log₁₀(${gLin.toFixed(3)}) = ${gDb.toFixed(2)}dB</div>
          <div>${Math.abs(f - fc) / fc < 0.05 ? 'fc 지점 — 정확히 -3dB(약 70.7%)' : f < fc ? 'fc보다 낮은 주파수 — 거의 그대로 통과' : 'fc보다 높은 주파수 — 깎여서 통과'}</div>
        </div>
        <div class="ctl"><label>fc (차단주파수) <input id="gn-fc" type="range" min="0.5" max="15" step="0.1" value="${fc}"><b id="gn-fc-val">${fc.toFixed(1)}Hz</b></label></div>
        <div class="ctl"><label>f (테스트 주파수, log) <input id="gn-f" type="range" min="${LOG_MIN}" max="${LOG_MAX}" step="0.02" value="${logF}"><b id="gn-f-val">${f.toFixed(2)}Hz</b></label></div>

        <div class="math-title">이 주파수의 파형이 실제로 얼마나 작아지는지</div>
        <cartesian-chart x-min="0" x-max="${waveTestT}" y-min="-1.2" y-max="1.2" x-label="시간(s)" y-label="크기" style="height:160px">
          <series id="gn-wave-in" points="${waveCurve(1, f, waveTestT)}" color="#3e63dd" width="1.6" label="입력(진폭1)"></series>
          <series id="gn-wave-out" points="${waveCurve(gLin, f, waveTestT)}" color="#f59e0b" width="2" label="출력(진폭 감소)"></series>
        </cartesian-chart>

        <hr class="gn-sep">
        <div class="math-title">③ 오픈루프 게인 vs 피드백 게인 — 방해가 있을 때</div>
        <div class="math-formula">오픈루프: output=target+D (측정 안 함) · 피드백: output ← output+Kf×(target-output)</div>
        <div class="math-applied" id="gn-applied3">적용: 목표=${FB_TARGET}, 방해 D=${D.toFixed(1)}, 피드백게인 Kf=${Kf.toFixed(2)} → 오픈루프=${olOutput.toFixed(2)}(영원히 틀림), 피드백=${fbFinal.toFixed(2)}(목표에 수렴)</div>
        <div class="math-desc">D(방해)와 Kf(피드백 게인)를 바꿔보세요. 회색(오픈루프)은 D만큼 항상 틀리고, 초록(피드백)은 결국 목표(점선)에 도달합니다.</div>
        <cartesian-chart x-min="0" x-max="${FB_STEPS}" y-min="0" y-max="10" x-label="되먹임 스텝" y-label="출력" style="height:180px">
          <series points="0,${FB_TARGET} ${FB_STEPS},${FB_TARGET}" color="#94a3b8" dash="4,4" label="목표"></series>
          <series id="gn-ol-line" points="0,${olOutput.toFixed(3)} ${FB_STEPS},${olOutput.toFixed(3)}" color="#64748b" dash="6,3" width="2" label="오픈루프"></series>
          <series id="gn-fb-line" points="${stepPtsStr(fbOuts)}" color="#10b981" width="2.2" label="피드백"></series>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#94a3b8">- - 목표</b></span><span><b style="color:#64748b">- - 오픈루프(안 고쳐짐)</b></span><span><b style="color:#10b981">— 피드백(수렴)</b></span></div>
        <div class="math-notes" id="gn-notes3">
          <div>오픈루프: output = target + D = ${FB_TARGET} + ${D.toFixed(1)} = ${olOutput.toFixed(2)} — 몇 번을 반복해도 안 바뀜(측정을 안 하니까)</div>
          <div>피드백: output ← output + Kf×(target-output) — 매 스텝 오차를 다시 측정해서 줄여나감</div>
          <div style="margin-top:4px;font-weight:800">${Math.abs(fbFinal - FB_TARGET) < 0.05 ? `${FB_STEPS}스텝 후 피드백은 목표(${FB_TARGET})에 거의 정확히 도달` : 'Kf가 너무 작아서(또는 커서) 아직 다 수렴 못함 — Kf를 조절해 보세요'}</div>
        </div>
        <div class="ctl"><label>D (방해) <input id="gn-d" type="range" min="-4" max="4" step="0.2" value="${D}"><b id="gn-D-val">${D.toFixed(1)}</b></label></div>
        <div class="ctl"><label>Kf (피드백 게인) <input id="gn-kf" type="range" min="0.02" max="1.5" step="0.02" value="${Kf}"><b id="gn-Kf-val">${Kf.toFixed(2)}</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
