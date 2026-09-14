import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-fourier';

const N = 128;
const T = 1;
const MAX_SHOW_HZ = 24;

const MD = `
## 푸리에 변환(Fourier Transform)이란?
- 어떤 신호든 **서로 다른 주파수의 사인파들을 더한 것**으로 분해할 수 있다는 게 핵심 아이디어입니다.
- 시간에 따른 신호(왼쪽, 시간 영역)를 주파수별 크기(오른쪽, 주파수 영역)로 바꿔주는 게 푸리에 변환입니다 — 신호 안에 "몇 Hz 성분이 얼마나 섞여 있는지"를 보여줍니다.
- 수식(이산 푸리에 변환, DFT): \`X[k] = Σ x[n]·e^(-2πi·kn/N)\`, 크기 \`|X[k]|\`가 그 주파수 성분의 세기입니다.
- 아래 사인파 3개(진폭·주파수)를 섞어서 신호를 만들면, 오른쪽 스펙트럼에 **정확히 그 주파수 위치에서** 뾰족한 봉우리가 생깁니다 — 진폭도 그대로 복원됩니다.
- **어디에 쓰이나요?** — 로봇·드론의 진동 분석(어디서 몇 Hz로 떨리는지 찾기), 센서 노이즈 제거(저역/고역 통과 필터), 음성 인식·오디오 처리, 이미지의 주파수 성분 분석(블러·노이즈 판별).
`;

type Comp = { amp: number; freq: number };

function signalAt(t: number, comps: Comp[]) {
  return comps.reduce((s, { amp, freq }) => s + amp * Math.sin(2 * Math.PI * freq * t), 0);
}

function samples(comps: Comp[]): number[] {
  return Array.from({ length: N }, (_, n) => signalAt((n * T) / N, comps));
}

/** DFT 손풀이: 각 주파수 k마다 신호를 그 주파수의 사인·코사인과 곱해 더한 뒤 크기를 구한다. */
function dft(xs: number[]): number[] {
  const n = xs.length;
  const mags: number[] = [];
  for (let k = 0; k <= MAX_SHOW_HZ; k++) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const ang = (-2 * Math.PI * k * i) / n;
      re += xs[i] * Math.cos(ang);
      im += xs[i] * Math.sin(ang);
    }
    mags.push((Math.sqrt(re * re + im * im) / n) * (k === 0 ? 1 : 2));
  }
  return mags;
}

function timeSeriesStr(comps: Comp[]) {
  return Array.from({ length: N + 1 }, (_, n) => n % N).map((n, i) => {
    const t = (i * T) / N;
    return `${t.toFixed(4)},${signalAt(t, comps).toFixed(3)}`;
  }).join(' ');
}

function spectrumStr(mags: number[]) {
  const pts: string[] = [];
  const hw = 0.12;
  mags.forEach((m, k) => {
    pts.push(`${(k - hw).toFixed(3)},0`);
    pts.push(`${k},${m.toFixed(3)}`);
    pts.push(`${(k + hw).toFixed(3)},0`);
  });
  return pts.join(' ');
}

const COLORS = ['#e5484d', '#3e63dd', '#10b981'];

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathFourier extends w.HTMLElement {
    private comps: Comp[] = [{ amp: 2, freq: 3 }, { amp: 1, freq: 7 }, { amp: 0.5, freq: 12 }];

    private refresh() {
      const xs = samples(this.comps);
      const mags = dft(xs);
      const peakK = mags.reduce((best, m, k) => (k > 0 && m > mags[best] ? k : best), 1);

      const applied = this.shadowRoot?.querySelector('#fr-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: ${this.comps.map((c, i) => `${c.amp.toFixed(1)}·sin(2π·${c.freq.toFixed(0)}Hz·t)`).join(' + ')} → 가장 큰 봉우리 = ${peakK}Hz (크기 ${mags[peakK].toFixed(2)})`;

      const notes = this.shadowRoot?.querySelector('#fr-notes') as HTMLElement;
      if (notes) notes.innerHTML = this.comps.map((c, i) => `<div>성분${i + 1}: 입력 진폭 ${c.amp.toFixed(1)} → 스펙트럼 ${c.freq.toFixed(0)}Hz 자리 크기 = ${mags[Math.round(c.freq)].toFixed(2)}</div>`).join('');

      const sig = this.shadowRoot?.querySelector('#fr-signal') as HTMLElement;
      if (sig) sig.setAttribute('points', timeSeriesStr(this.comps));
      const spec = this.shadowRoot?.querySelector('#fr-spectrum') as HTMLElement;
      if (spec) spec.setAttribute('points', spectrumStr(mags));

      this.comps.forEach((c, i) => {
        const av = this.shadowRoot?.querySelector(`#fr-amp-${i}-val`) as HTMLElement;
        if (av) av.textContent = c.amp.toFixed(1);
        const fv = this.shadowRoot?.querySelector(`#fr-freq-${i}-val`) as HTMLElement;
        if (fv) fv.textContent = `${c.freq.toFixed(0)}Hz`;
      });
    }

    @addEventListener('#fr-amp-0', 'input')
    onAmp0(e: Event) { this.comps[0].amp = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#fr-freq-0', 'input')
    onFreq0(e: Event) { this.comps[0].freq = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#fr-amp-1', 'input')
    onAmp1(e: Event) { this.comps[1].amp = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#fr-freq-1', 'input')
    onFreq1(e: Event) { this.comps[1].freq = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#fr-amp-2', 'input')
    onAmp2(e: Event) { this.comps[2].amp = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#fr-freq-2', 'input')
    onFreq2(e: Event) { this.comps[2].freq = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const xs = samples(this.comps);
      const mags = dft(xs);
      const peakK = mags.reduce((best, m, k) => (k > 0 && m > mags[best] ? k : best), 1);
      const ctlRows = this.comps.map((c, i) => `
        <div class="ctl"><label><b style="color:${COLORS[i]}">■</b> 성분${i + 1} 진폭 <input id="fr-amp-${i}" type="range" min="0" max="3" step="0.1" value="${c.amp}"><b id="fr-amp-${i}-val">${c.amp.toFixed(1)}</b></label></div>
        <div class="ctl"><label><b style="color:${COLORS[i]}">■</b> 성분${i + 1} 주파수 <input id="fr-freq-${i}" type="range" min="0" max="20" step="1" value="${c.freq}"><b id="fr-freq-${i}-val">${c.freq.toFixed(0)}Hz</b></label></div>`).join('');
      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; color:#6366f1; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .math-notes { font-size:12px; font-weight:700; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin-top:8px; line-height:1.7; }
          .fr-title { font-size:12px; font-weight:800; color:#475569; margin:10px 0 2px; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:6px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:44px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">시간 영역 → (DFT) → 주파수 영역</div>
        <div class="math-applied" id="fr-applied">적용: ${this.comps.map(c => `${c.amp.toFixed(1)}·sin(2π·${c.freq.toFixed(0)}Hz·t)`).join(' + ')} → 가장 큰 봉우리 = ${peakK}Hz (크기 ${mags[peakK].toFixed(2)})</div>
        <div class="math-desc">사인파 3개(색으로 구분)를 섞어 만든 신호(왼쪽)를 DFT로 변환하면, 오른쪽 스펙트럼에 그 주파수 자리마다 봉우리가 생깁니다.</div>
        <div class="fr-title">시간 영역 (신호)</div>
        <cartesian-chart x-min="0" x-max="${T}" y-min="auto" y-max="auto" x-label="시간(s)" y-label="진폭" style="height:200px">
          <series id="fr-signal" points="${timeSeriesStr(this.comps)}" color="#6366f1" width="2"></series>
        </cartesian-chart>
        <div class="fr-title">주파수 영역 (스펙트럼)</div>
        <cartesian-chart x-min="0" x-max="${MAX_SHOW_HZ}" y-min="0" y-max="auto" x-label="주파수(Hz)" y-label="크기" style="height:200px">
          <series id="fr-spectrum" points="${spectrumStr(mags)}" color="#8b5cf6" width="2"></series>
        </cartesian-chart>
        <div class="math-notes" id="fr-notes">${this.comps.map((c, i) => `<div>성분${i + 1}: 입력 진폭 ${c.amp.toFixed(1)} → 스펙트럼 ${c.freq.toFixed(0)}Hz 자리 크기 = ${mags[Math.round(c.freq)].toFixed(2)}</div>`).join('')}</div>
        ${ctlRows}

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
