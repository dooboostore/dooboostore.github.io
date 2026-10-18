import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-physical-gearratio';

const MOTOR_T = 0.5;   // 모터(감속 전) 토크 N·m
const MOTOR_W_MAX = 300; // 모터(감속 전) 최대 각속도 rad/s

const MD = `
## 기어비(gear ratio)와 토크-속도 트레이드오프
- 모터 혼자서는 **힘(토크)은 약하지만 빠르게** 돕니다. 로봇 관절은 반대로 **느려도 되니 힘은 세야** 해서, 그 사이에 **기어(감속기)**를 끼웁니다.
- (이상적으로, 손실 없이 가정하면) 기어비 \`N\`을 지나면: \`출력 토크 = 입력 토크 × N\`, \`출력 속도 = 입력 속도 ÷ N\`.
- **핵심은 이게 공짜가 아니라는 것**입니다 — 기계적 일률(power = 토크×속도)은 그대로 보존됩니다: \`τ_out·ω_out = (τ_in·N)·(ω_in/N) = τ_in·ω_in\`. 힘을 N배로 늘리면 속도는 반드시 N배로 줄어듭니다.
- 슬라이더로 기어비 N을 올려보면, 토크(막대)는 커지고 속도(막대)는 정확히 같은 비율로 작아지는 걸 확인하세요. 동시에 토크-속도 곡선 위의 점(●)이 왼쪽 위(저속·고토크)로 이동합니다.
- **실제로는** 기어 마찰 때문에 효율(η<1)만큼 일부 에너지가 열로 손실됩니다 — 실제 출력 토크는 \`τ_in·N·η\`로 이상값보다 조금 작습니다.
- **어디에 쓰이나요?** — 로봇 팔 관절 감속기(하모닉 드라이브 등), 드론 프로펠러 직결 모터(기어비 1, 대신 저토크·고속 그대로 사용), 자동차 변속기. **"자유도(DOF)"** 페이지의 관절 하나하나가 보통 이런 모터+기어 조합으로 구동됩니다.
`;

const N_MAX = 40;

function torqueSpeedCurve(ratio: number, n = 40) {
  // 모터 자체의 토크-속도는 대략 선형(τ = MOTOR_T·(1 - ω/MOTOR_W_MAX)) — DC모터 특성 근사.
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const wIn = (MOTOR_W_MAX * i) / n;
    const tIn = MOTOR_T * (1 - wIn / MOTOR_W_MAX);
    const tOut = tIn * ratio;
    const wOut = wIn / ratio;
    pts.push(`${wOut.toFixed(4)},${tOut.toFixed(4)}`);
  }
  return pts.join(' ');
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class PhysicalGearRatio extends w.HTMLElement {
    private ratio = 5;

    private refresh() {
      const { ratio } = this;
      const tIn = MOTOR_T * 0.6; // 대표 동작점(모터 최대토크의 60%)
      const wIn = MOTOR_W_MAX * 0.4;
      const tOut = tIn * ratio;
      const wOut = wIn / ratio;

      const applied = this.shadowRoot?.querySelector('#gr-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: N=${ratio} → 출력 토크=${tOut.toFixed(2)}N·m, 출력 속도=${wOut.toFixed(1)}rad/s (일률 ${(tIn * wIn).toFixed(1)}W → ${(tOut * wOut).toFixed(1)}W, 보존)`;

      const ratioVal = this.shadowRoot?.querySelector('#gr-ratio-val') as HTMLElement;
      if (ratioVal) ratioVal.textContent = String(ratio);

      const barT = this.shadowRoot?.querySelector('#gr-bar-t') as HTMLElement;
      if (barT) barT.style.width = `${Math.min(100, (tOut / (MOTOR_T * N_MAX)) * 100)}%`;
      const barW = this.shadowRoot?.querySelector('#gr-bar-w') as HTMLElement;
      if (barW) barW.style.width = `${Math.min(100, (wOut / MOTOR_W_MAX) * 100)}%`;
      const barTVal = this.shadowRoot?.querySelector('#gr-bar-t-val') as HTMLElement;
      if (barTVal) barTVal.textContent = `${tOut.toFixed(2)} N·m`;
      const barWVal = this.shadowRoot?.querySelector('#gr-bar-w-val') as HTMLElement;
      if (barWVal) barWVal.textContent = `${wOut.toFixed(1)} rad/s`;

      const curve = this.shadowRoot?.querySelector('#gr-curve') as HTMLElement;
      if (curve) curve.setAttribute('points', torqueSpeedCurve(ratio));
      const dot = this.shadowRoot?.querySelector('#gr-dot') as HTMLElement;
      if (dot) { dot.setAttribute('x', wOut.toFixed(3)); dot.setAttribute('y', tOut.toFixed(3)); }

      const notes = this.shadowRoot?.querySelector('#gr-notes') as HTMLElement;
      if (notes) notes.innerHTML = `<div>τ_out = τ_in × N = ${tIn.toFixed(2)} × ${ratio} = ${tOut.toFixed(2)} N·m</div>` +
        `<div>ω_out = ω_in ÷ N = ${wIn.toFixed(1)} ÷ ${ratio} = ${wOut.toFixed(1)} rad/s</div>`;
    }

    @addEventListener('#gr-ratio', 'input')
    onRatio(e: Event) { this.ratio = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { ratio } = this;
      const tIn = MOTOR_T * 0.6;
      const wIn = MOTOR_W_MAX * 0.4;
      const tOut = tIn * ratio;
      const wOut = wIn / ratio;
      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-applied { font-size:13px; font-weight:800; color:#0f766e; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .math-notes { font-size:12px; font-weight:700; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin-top:8px; line-height:1.7; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:60px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .gr-bars { display:flex; flex-direction:column; gap:8px; margin:10px 0; }
          .gr-bar-row { display:flex; align-items:center; gap:8px; }
          .gr-bar-label { font-size:11px; font-weight:800; color:#475569; width:64px; flex-shrink:0; }
          .gr-bar-track { flex:1; height:14px; background:#f1f5f9; border-radius:7px; overflow:hidden; }
          .gr-bar-fill { height:100%; border-radius:7px; transition:width .1s ease; }
          .gr-bar-fill.t { background:linear-gradient(90deg,#0f766e,#14b8a6); }
          .gr-bar-fill.w { background:linear-gradient(90deg,#f59e0b,#fbbf24); }
          .gr-bar-val { font-size:11px; font-weight:700; color:#1e293b; width:70px; text-align:right; flex-shrink:0; }
        </style>
        <div class="math-formula">τ_out = τ_in × N, ω_out = ω_in ÷ N (일률 τ·ω는 보존)</div>
        <div class="math-applied" id="gr-applied">적용: N=${ratio} → 출력 토크=${tOut.toFixed(2)}N·m, 출력 속도=${wOut.toFixed(1)}rad/s (일률 ${(tIn * wIn).toFixed(1)}W → ${(tOut * wOut).toFixed(1)}W, 보존)</div>
        <div class="math-desc">기어비를 올리면 토크는 세지고 속도는 그만큼 느려집니다. 힘과 속도 사이의 트레이드오프를 막대와 곡선으로 함께 확인하세요.</div>

        <div class="gr-bars">
          <div class="gr-bar-row"><span class="gr-bar-label">출력 토크</span><div class="gr-bar-track"><div id="gr-bar-t" class="gr-bar-fill t" style="width:${Math.min(100, (tOut / (MOTOR_T * N_MAX)) * 100)}%"></div></div><span class="gr-bar-val" id="gr-bar-t-val">${tOut.toFixed(2)} N·m</span></div>
          <div class="gr-bar-row"><span class="gr-bar-label">출력 속도</span><div class="gr-bar-track"><div id="gr-bar-w" class="gr-bar-fill w" style="width:${Math.min(100, (wOut / MOTOR_W_MAX) * 100)}%"></div></div><span class="gr-bar-val" id="gr-bar-w-val">${wOut.toFixed(1)} rad/s</span></div>
        </div>

        <cartesian-chart x-min="0" x-max="${MOTOR_W_MAX}" y-min="0" y-max="${MOTOR_T * N_MAX}" x-label="출력 속도 ω(rad/s)" y-label="출력 토크 τ(N·m)" style="height:220px">
          <series id="gr-curve" points="${torqueSpeedCurve(ratio)}" color="#0f766e" width="2"></series>
          <marker id="gr-dot" x="${wOut.toFixed(3)}" y="${tOut.toFixed(3)}" color="#ef4444" size="6" label="현재 동작점"></marker>
        </cartesian-chart>
        <div class="math-notes" id="gr-notes">
          <div>τ_out = τ_in × N = ${tIn.toFixed(2)} × ${ratio} = ${tOut.toFixed(2)} N·m</div>
          <div>ω_out = ω_in ÷ N = ${wIn.toFixed(1)} ÷ ${ratio} = ${wOut.toFixed(1)} rad/s</div>
        </div>
        <div class="ctl"><label>기어비 N <input id="gr-ratio" type="range" min="1" max="${N_MAX}" step="1" value="${ratio}"><b id="gr-ratio-val">${ratio}</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
