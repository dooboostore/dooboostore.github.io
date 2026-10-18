import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-physical-imu';

const DT = 0.02, DUR = 20, N = Math.round(DUR / DT);
const AMP = 0.5, FREQ = 0.15; // 실제 기울기: 진폭(rad), 주파수(Hz)

const MD = `
## IMU: 가속도계(accelerometer) vs 자이로(gyroscope)
- **가속도계**는 중력 방향을 재서 "지금 얼마나 기울어져 있는지"(절대각)를 직접 알 수 있습니다. 하지만 매 순간 **노이즈**가 섞이고, 로봇이 움직이며 생기는 진짜 가속도까지 같이 재버려서 순간순간은 흔들립니다.
- **자이로**는 "지금 얼마나 빨리 회전하는지"(각속도)만 잽니다. 각도를 얻으려면 **시간에 대해 적분**(누적)해야 하는데, 자이로에는 작은 **바이어스(bias, 고정 오차)**가 항상 섞여 있어서 적분할수록 오차가 **계속 쌓여(drift) 벗어납니다.**
- 즉 **가속도계 = 단기 노이즈, 장기 정확 / 자이로 = 단기 부드러움, 장기 표류(drift)** — 서로 정반대 약점을 갖고 있습니다.
- 아래 그래프에서 노이즈와 바이어스를 슬라이더로 올려보면, 가속도계 추정치는 흔들리기만 하고(평균은 참값 주변), 자이로 적분치는 시간이 지날수록 참값에서 점점 멀어지는 걸 확인하세요.
- **이 두 단점을 서로 보완하는 것이 "칼만 필터"입니다** — 짧은 시간은 자이로(부드러움)를, 긴 시간은 가속도계(드리프트 없음)를 신뢰하도록 확률적으로 섞습니다. 자세한 수식과 시뮬레이션은 **"칼만 필터"** 페이지에서 이어집니다.
- **어디에 쓰이나요?** — 드론·2족 로봇의 자세(기울기) 추정, 스마트폰 화면 회전, VR 헤드셋 트래킹.
`;

function trueTheta(t: number) { return AMP * Math.sin(2 * Math.PI * FREQ * t); }
function trueOmega(t: number) { return AMP * 2 * Math.PI * FREQ * Math.cos(2 * Math.PI * FREQ * t); }

// 결정론적(시드 고정) 유사난수 — 슬라이더를 움직여도 같은 패턴으로 비교 가능하게
function seededNoise(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function simulate(accNoise: number, bias: number) {
  const trueXs: number[] = [];
  const accXs: number[] = [];
  const gyroXs: number[] = [];
  let gyroAngle = 0;
  for (let i = 0; i < N; i++) {
    const t = i * DT;
    const th = trueTheta(t);
    trueXs.push(th);
    accXs.push(th + seededNoise(i) * accNoise);
    const omegaMeasured = trueOmega(t) + bias;
    gyroAngle += omegaMeasured * DT;
    gyroXs.push(gyroAngle);
  }
  return { trueXs, accXs, gyroXs };
}
function ptsStr(xs: number[]) { return xs.map((x, i) => `${(i * DT).toFixed(3)},${x.toFixed(4)}`).join(' '); }

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class PhysicalImu extends w.HTMLElement {
    private accNoise = 0.05;
    private bias = 0.02;

    private refresh() {
      const { accNoise, bias } = this;
      const { trueXs, accXs, gyroXs } = simulate(accNoise, bias);

      const applied = this.shadowRoot?.querySelector('#imu-applied') as HTMLElement;
      const finalDrift = gyroXs[gyroXs.length - 1] - trueXs[trueXs.length - 1];
      if (applied) applied.textContent = `적용: 가속도계 노이즈=±${accNoise.toFixed(2)}rad, 자이로 바이어스=${bias.toFixed(3)}rad/s → t=${DUR}s에 자이로 드리프트 오차=${finalDrift.toFixed(2)}rad(${(finalDrift * 180 / Math.PI).toFixed(1)}°)`;

      (['accNoise', 'bias'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#imu-${k}-val`) as HTMLElement;
        if (el) el.textContent = this[k].toFixed(3);
      });

      const trueCurve = this.shadowRoot?.querySelector('#imu-true') as HTMLElement;
      if (trueCurve) trueCurve.setAttribute('points', ptsStr(trueXs));
      const accCurve = this.shadowRoot?.querySelector('#imu-acc') as HTMLElement;
      if (accCurve) accCurve.setAttribute('points', ptsStr(accXs));
      const gyroCurve = this.shadowRoot?.querySelector('#imu-gyro') as HTMLElement;
      if (gyroCurve) gyroCurve.setAttribute('points', ptsStr(gyroXs));

      const accRmse = Math.sqrt(accXs.reduce((s, x, i) => s + (x - trueXs[i]) ** 2, 0) / N);
      const gyroRmse = Math.sqrt(gyroXs.reduce((s, x, i) => s + (x - trueXs[i]) ** 2, 0) / N);
      const notes = this.shadowRoot?.querySelector('#imu-notes') as HTMLElement;
      if (notes) notes.innerHTML = `<div>가속도계 추정 RMSE = ${accRmse.toFixed(3)}rad — 노이즈 때문에 흔들리지만 평균적으로 참값 근처</div>` +
        `<div>자이로 적분 RMSE = ${gyroRmse.toFixed(3)}rad — 부드럽지만 바이어스가 계속 쌓여 끝으로 갈수록 참값에서 멀어짐</div>`;
    }

    @addEventListener('#imu-accnoise', 'input')
    onAccNoise(e: Event) { this.accNoise = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#imu-bias', 'input')
    onBias(e: Event) { this.bias = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { accNoise, bias } = this;
      const { trueXs, accXs, gyroXs } = simulate(accNoise, bias);
      const finalDrift = gyroXs[gyroXs.length - 1] - trueXs[trueXs.length - 1];
      const accRmse = Math.sqrt(accXs.reduce((s, x, i) => s + (x - trueXs[i]) ** 2, 0) / N);
      const gyroRmse = Math.sqrt(gyroXs.reduce((s, x, i) => s + (x - trueXs[i]) ** 2, 0) / N);
      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; color:#0f766e; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .math-legend { display:flex; gap:12px; font-size:11px; color:#64748b; margin-top:8px; flex-wrap:wrap; }
          .math-legend b { font-weight:800; }
          .math-notes { font-size:12px; font-weight:700; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin-top:8px; line-height:1.7; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:52px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">기울기 각도 θ(t) — 참값 vs 가속도계 추정 vs 자이로 적분</div>
        <div class="math-applied" id="imu-applied">적용: 가속도계 노이즈=±${accNoise.toFixed(2)}rad, 자이로 바이어스=${bias.toFixed(3)}rad/s → t=${DUR}s에 자이로 드리프트 오차=${finalDrift.toFixed(2)}rad(${(finalDrift * 180 / Math.PI).toFixed(1)}°)</div>
        <div class="math-desc">${DUR}초 동안 천천히 기울었다 되돌아오는 물체(드론·2족 로봇 몸통)를 가정합니다. 노이즈·바이어스 슬라이더를 올려 가속도계와 자이로의 서로 다른 실패 방식을 비교하세요.</div>
        <cartesian-chart x-min="0" x-max="${DUR}" y-min="-1.2" y-max="1.2" x-label="시간(s)" y-label="기울기(rad)" style="height:240px">
          <series points="0,0 ${DUR},0" color="#e2e8f0" dash="4,4"></series>
          <series id="imu-acc" points="${ptsStr(accXs)}" color="#f59e0b" width="1.5"></series>
          <series id="imu-gyro" points="${ptsStr(gyroXs)}" color="#ef4444" width="2"></series>
          <series id="imu-true" points="${ptsStr(trueXs)}" color="#0f766e" width="2.2"></series>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#0f766e">— 참값</b></span><span><b style="color:#f59e0b">— 가속도계(노이즈)</b></span><span><b style="color:#ef4444">— 자이로 적분(드리프트)</b></span></div>
        <div class="math-notes" id="imu-notes">
          <div>가속도계 추정 RMSE = ${accRmse.toFixed(3)}rad — 노이즈 때문에 흔들리지만 평균적으로 참값 근처</div>
          <div>자이로 적분 RMSE = ${gyroRmse.toFixed(3)}rad — 부드럽지만 바이어스가 계속 쌓여 끝으로 갈수록 참값에서 멀어짐</div>
        </div>
        <div class="ctl"><label>가속도계 노이즈 <input id="imu-accnoise" type="range" min="0" max="0.2" step="0.01" value="${accNoise}"><b id="imu-accNoise-val">${accNoise.toFixed(3)}</b></label></div>
        <div class="ctl"><label>자이로 바이어스(rad/s) <input id="imu-bias" type="range" min="0" max="0.06" step="0.002" value="${bias}"><b id="imu-bias-val">${bias.toFixed(3)}</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
