import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-kalman';

const N = 60;
const DT = 1;
const TRUE_V = 1.0;

const MD = `
## 칼만 필터(Kalman filter)란?
- 노이즈 낀 센서 측정값과, "이렇게 움직일 것"이라는 예측(모델)을 **통계적으로 가장 그럴듯하게 섞어서** 실제 상태(위치·속도)를 추정하는 방법입니다.
- 상태 \`x=[위치, 속도]\`, 매 스텝마다 두 단계를 반복합니다:
  1. **예측(predict)**: 이전 상태로 다음 위치를 미리 계산 (\`x' = F·x\`), 불확실성 P도 커짐 (\`P' = F·P·Fᵀ + Q\`)
  2. **갱신(update)**: 실제 측정값 z가 들어오면, 예측과 측정의 차이(y = z - x')를 **칼만 이득 K**만큼만 반영해서 보정 (\`x = x' + K·y\`)
- **Q(프로세스 노이즈)**: 모델을 얼마나 못 믿는지. Q가 크면 측정값을 더 많이 신뢰(더 흔들림). **R(측정 노이즈)**: 센서를 얼마나 못 믿는지. R이 크면 모델(예측)을 더 신뢰(더 부드러움, 느리게 반응).
- 아래 그래프에서 점선(진짜 위치)·주황 점(노이즈 낀 측정값)·초록 선(칼만 추정)을 비교해 보세요. R·Q 슬라이더를 바꾸면 같은 측정 데이터에서도 추정 품질이 달라집니다.
- **어디에 쓰이나요?** — 로봇·드론의 위치/속도 추정(GPS+IMU 센서 융합), 자율주행 물체 추적, 주가·신호 노이즈 제거.
`;

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeGaussian(rng: () => number) {
  let spare: number | null = null;
  return (): number => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
}

/** 고정된(시드) 진짜 경로 + 노이즈 낀 측정값을 한 번 만든다. R·Q 슬라이더는 이 데이터를 "어떻게 해석할지"만 바꾼다. */
function simulate() {
  const gaussProcess = makeGaussian(mulberry32(101));
  const gaussMeas = makeGaussian(mulberry32(202));
  let truePos = 0, trueVel = TRUE_V;
  const truePath: number[] = [];
  const measurements: number[] = [];
  for (let t = 0; t < N; t++) {
    trueVel += gaussProcess() * 0.03;
    truePos += trueVel * DT;
    truePath.push(truePos);
    measurements.push(truePos + gaussMeas() * 1.6);
  }
  return { truePath, measurements };
}

/** 칼만 필터 손풀이: 상태 [위치,속도], 예측 후 측정으로 보정을 N번 반복한다. */
function kalmanFilter(measurements: number[], R: number, Q: number): number[] {
  let x = [measurements[0], 0];
  let P = [[10, 0], [0, 10]];
  const F = [[1, DT], [0, 1]];
  const Qm = [[(Q * DT ** 3) / 3, (Q * DT * DT) / 2], [(Q * DT * DT) / 2, Q * DT]];
  const est: number[] = [];
  for (const z of measurements) {
    const xp = [F[0][0] * x[0] + F[0][1] * x[1], F[1][0] * x[0] + F[1][1] * x[1]];
    const FP = [
      [F[0][0] * P[0][0] + F[0][1] * P[1][0], F[0][0] * P[0][1] + F[0][1] * P[1][1]],
      [F[1][0] * P[0][0] + F[1][1] * P[1][0], F[1][0] * P[0][1] + F[1][1] * P[1][1]],
    ];
    const FPFt = [
      [FP[0][0] * F[0][0] + FP[0][1] * F[0][1], FP[0][0] * F[1][0] + FP[0][1] * F[1][1]],
      [FP[1][0] * F[0][0] + FP[1][1] * F[0][1], FP[1][0] * F[1][0] + FP[1][1] * F[1][1]],
    ];
    const Pp = [[FPFt[0][0] + Qm[0][0], FPFt[0][1] + Qm[0][1]], [FPFt[1][0] + Qm[1][0], FPFt[1][1] + Qm[1][1]]];
    const y = z - xp[0];
    const S = Pp[0][0] + R;
    const K = [Pp[0][0] / S, Pp[1][0] / S];
    x = [xp[0] + K[0] * y, xp[1] + K[1] * y];
    P = [[Pp[0][0] - K[0] * Pp[0][0], Pp[0][1] - K[0] * Pp[0][1]], [Pp[1][0] - K[1] * Pp[0][0], Pp[1][1] - K[1] * Pp[0][1]]];
    est.push(x[0]);
  }
  return est;
}

function rmse(a: number[], b: number[]) { return Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length); }
function ptsStr(list: number[]) { return list.map((v, i) => `${i},${v.toFixed(3)}`).join(' '); }

const { truePath, measurements } = simulate();

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathKalman extends w.HTMLElement {
    private R = 3;
    private Q = 0.15;

    private refresh() {
      const { R, Q } = this;
      const est = kalmanFilter(measurements, R, Q);
      const rawErr = rmse(measurements, truePath);
      const kfErr = rmse(est, truePath);
      const better = kfErr < rawErr;

      const applied = this.shadowRoot?.querySelector('#kal-applied') as HTMLElement;
      if (applied) {
        applied.style.color = better ? '#10b981' : '#ef4444';
        applied.textContent = `적용: R=${R.toFixed(2)}, Q=${Q.toFixed(2)} → 원본 오차 ${rawErr.toFixed(2)} vs 칼만 오차 ${kfErr.toFixed(2)} ${better ? '(개선됨)' : ''}`;
      }
      (['R', 'Q'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#kal-${k}-val`) as HTMLElement;
        if (el) el.textContent = this[k].toFixed(2);
      });
      const line = this.shadowRoot?.querySelector('#kal-est') as HTMLElement;
      if (line) line.setAttribute('points', ptsStr(est));
      const notes = this.shadowRoot?.querySelector('#kal-notes') as HTMLElement;
      if (notes) notes.innerHTML = `<div>원본 측정 RMSE = ${rawErr.toFixed(3)}</div><div>칼만 필터 RMSE = ${kfErr.toFixed(3)}</div><div style="margin-top:4px">R을 키우면(센서 못 믿음) 더 부드럽지만 느리게 반응, Q를 키우면(모델 못 믿음) 측정값을 더 따라가서 흔들림이 커집니다.</div>`;
    }

    @addEventListener('#kal-r', 'input')
    onR(e: Event) { this.R = Number((e.target as HTMLInputElement).value) || 0.01; this.refresh(); }
    @addEventListener('#kal-q', 'input')
    onQ(e: Event) { this.Q = Number((e.target as HTMLInputElement).value) || 0.01; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { R, Q } = this;
      const est = kalmanFilter(measurements, R, Q);
      const rawErr = rmse(measurements, truePath);
      const kfErr = rmse(est, truePath);
      const better = kfErr < rawErr;
      const measMarkers = measurements.map((v, i) => `<marker x="${i}" y="${v.toFixed(3)}" color="#f59e0b" size="2.5"></marker>`).join('\n          ');
      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .math-legend { display:flex; gap:12px; font-size:11px; color:#64748b; margin-top:8px; flex-wrap:wrap; }
          .math-legend b { font-weight:800; }
          .math-notes { font-size:12px; font-weight:700; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin-top:8px; line-height:1.7; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:44px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">예측(x'=F·x) → 갱신(x=x'+K·(z-x')) 을 매 스텝 반복</div>
        <div class="math-applied" id="kal-applied" style="color:${better ? '#10b981' : '#ef4444'}">적용: R=${R.toFixed(2)}, Q=${Q.toFixed(2)} → 원본 오차 ${rawErr.toFixed(2)} vs 칼만 오차 ${kfErr.toFixed(2)} ${better ? '(개선됨)' : ''}</div>
        <div class="math-desc">회색 점선=진짜 위치, 주황 점=노이즈 낀 측정값, 초록 선=칼만 필터 추정값. R·Q를 바꿔가며 추정이 얼마나 부드러워지는지/따라가는지 보세요.</div>
        <cartesian-chart x-min="0" x-max="${N - 1}" y-min="auto" y-max="auto" x-label="시간(step)" y-label="위치">
          <series points="${ptsStr(truePath)}" color="#94a3b8" dash="5,4" label="진짜 위치"></series>
          ${measMarkers}
          <series id="kal-est" points="${ptsStr(est)}" color="#10b981" width="2.5" label="칼만 추정"></series>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#94a3b8">- - 진짜 위치</b></span><span><b style="color:#f59e0b">● 측정값(노이즈)</b></span><span><b style="color:#10b981">— 칼만 추정</b></span></div>
        <div class="math-notes" id="kal-notes">
          <div>원본 측정 RMSE = ${rawErr.toFixed(3)}</div>
          <div>칼만 필터 RMSE = ${kfErr.toFixed(3)}</div>
          <div style="margin-top:4px">R을 키우면(센서 못 믿음) 더 부드럽지만 느리게 반응, Q를 키우면(모델 못 믿음) 측정값을 더 따라가서 흔들림이 커집니다.</div>
        </div>
        <div class="ctl"><label>R (측정 노이즈) <input id="kal-r" type="range" min="0.2" max="8" step="0.1" value="${R}"><b id="kal-R-val">${R.toFixed(2)}</b></label></div>
        <div class="ctl"><label>Q (프로세스 노이즈) <input id="kal-q" type="range" min="0.01" max="1" step="0.01" value="${Q}"><b id="kal-Q-val">${Q.toFixed(2)}</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
