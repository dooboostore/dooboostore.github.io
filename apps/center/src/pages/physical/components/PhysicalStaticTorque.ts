import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-physical-statictorque';

const G = 9.8; // m/s^2
const L_MAX = 0.5;   // 링크 길이 최대(m)
const M_MAX = 2.0;   // 짐 무게 최대(kg)
const RATED_MAX = 5; // 비교할 정격 토크 최대(N·m)
const CHART_T_MAX = M_MAX * G * L_MAX; // 차트 y축 고정 스케일

const MD = `
## 정하중 토크(static holding torque)와 서보/모터 선정
- 로봇 팔(링크) 하나가 **모터(관절) 축에서 길이 L만큼** 뻗어나가 끝에 무게 m을 들고 있다고 합시다. 이 무게를 **버티기 위해 모터가 내야 하는 토크**는 \`τ = m·g·L·cos(θ)\`입니다 — θ는 팔이 수평(가로)에서 얼마나 기울었는지 나타내는 각도입니다.
- **θ=0°(수평으로 뻗음)**일 때 모멘트 팔(moment arm)이 가장 길어서 토크가 **최대**입니다. **θ=90°(수직으로 위/아래를 향함)**이면 무게가 축과 일직선이 되어 모멘트 팔이 0 → **토크가 0**이 됩니다.
- 이게 바로 로봇 팔이 "쭉 뻗을 때 가장 힘들고, 접었을 때(또는 세웠을 때) 가장 편한" 이유입니다 — 같은 무게라도 **자세(각도)에 따라 필요한 토크가 달라집니다.**
- 아래 슬라이더로 링크 길이·무게·각도를 바꿔가며 필요 토크가 어떻게 변하는지, 그리고 내가 고른 모터/서보의 **정격 토크**로 이 자세를 버틸 수 있는지(여유율)를 확인해 보세요.
- **어디에 쓰이나요?** — 실제로 로봇 팔·집게(gripper)에 서보/모터를 고를 때 가장 먼저 하는 계산입니다. **"기어비"** 페이지에서 배운 것처럼, 정하중 토크가 모자라면 기어비를 올려서(속도를 희생하고) 토크를 확보할 수 있습니다. **"자유도(DOF)"** 페이지의 팔도 자세가 바뀔 때마다 각 관절이 버텨야 하는 토크가 이런 식으로 계속 달라집니다.
`;

function requiredTorqueSigned(L: number, m: number, thetaDeg: number): number {
  return m * G * L * Math.cos((thetaDeg * Math.PI) / 180);
}

function tauCurve(L: number, m: number, n = 60): string {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const theta = (180 * i) / n;
    pts.push(`${theta.toFixed(2)},${requiredTorqueSigned(L, m, theta).toFixed(4)}`);
  }
  return pts.join(' ');
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class PhysicalStaticTorque extends w.HTMLElement {
    private linkLength = 0.15; // m
    private mass = 0.3;        // kg
    private theta = 0;         // deg, 0=수평
    private rated = 0.4;       // N·m, 비교할 모터/서보 정격 토크

    private refresh() {
      const { linkLength: L, mass: m, theta, rated } = this;
      const tauSigned = requiredTorqueSigned(L, m, theta);
      const tau = Math.abs(tauSigned);
      const marginPct = rated > 0 ? ((rated - tau) / rated) * 100 : 0;
      const ok = tau <= rated;

      const applied = this.shadowRoot?.querySelector('#st-applied') as HTMLElement;
      if (applied) {
        applied.textContent = `적용: L=${L.toFixed(2)}m, m=${m.toFixed(2)}kg, θ=${theta.toFixed(0)}° → 필요 토크=${tau.toFixed(2)} N·m (정격 ${rated.toFixed(2)}N·m 대비 ${ok ? `여유율 ${marginPct.toFixed(0)}% 안전` : `${Math.abs(marginPct).toFixed(0)}% 부족 ⚠`})`;
        applied.style.color = ok ? '#0f766e' : '#dc2626';
      }

      const lVal = this.shadowRoot?.querySelector('#st-l-val') as HTMLElement;
      if (lVal) lVal.textContent = `${L.toFixed(2)}m`;
      const mVal = this.shadowRoot?.querySelector('#st-m-val') as HTMLElement;
      if (mVal) mVal.textContent = `${m.toFixed(2)}kg`;
      const thVal = this.shadowRoot?.querySelector('#st-theta-val') as HTMLElement;
      if (thVal) thVal.textContent = `${theta.toFixed(0)}°`;
      const rVal = this.shadowRoot?.querySelector('#st-rated-val') as HTMLElement;
      if (rVal) rVal.textContent = `${rated.toFixed(2)}N·m`;

      const barReq = this.shadowRoot?.querySelector('#st-bar-req') as HTMLElement;
      if (barReq) { barReq.style.width = `${Math.min(100, (tau / RATED_MAX) * 100)}%`; barReq.classList.toggle('bad', !ok); }
      const barReqVal = this.shadowRoot?.querySelector('#st-bar-req-val') as HTMLElement;
      if (barReqVal) barReqVal.textContent = `${tau.toFixed(2)} N·m`;
      const barRated = this.shadowRoot?.querySelector('#st-bar-rated') as HTMLElement;
      if (barRated) barRated.style.width = `${Math.min(100, (rated / RATED_MAX) * 100)}%`;
      const barRatedVal = this.shadowRoot?.querySelector('#st-bar-rated-val') as HTMLElement;
      if (barRatedVal) barRatedVal.textContent = `${rated.toFixed(2)} N·m`;

      // 팔 다이어그램
      const thetaRad = (theta * Math.PI) / 180;
      const tipX = L * Math.cos(thetaRad);
      const tipY = L * Math.sin(thetaRad);
      const arm = this.shadowRoot?.querySelector('#st-arm') as HTMLElement;
      if (arm) { arm.setAttribute('x1', '0'); arm.setAttribute('y1', '0'); arm.setAttribute('x2', tipX.toFixed(4)); arm.setAttribute('y2', tipY.toFixed(4)); }
      const gravity = this.shadowRoot?.querySelector('#st-gravity') as HTMLElement;
      if (gravity) { gravity.setAttribute('x1', tipX.toFixed(4)); gravity.setAttribute('y1', tipY.toFixed(4)); gravity.setAttribute('x2', tipX.toFixed(4)); gravity.setAttribute('y2', (tipY - 0.08).toFixed(4)); }
      const tipMarker = this.shadowRoot?.querySelector('#st-tip') as HTMLElement;
      if (tipMarker) { tipMarker.setAttribute('x', tipX.toFixed(4)); tipMarker.setAttribute('y', tipY.toFixed(4)); tipMarker.setAttribute('label', `무게 ${m.toFixed(2)}kg`); }

      // 토크-각도 곡선
      const curve = this.shadowRoot?.querySelector('#st-curve') as HTMLElement;
      if (curve) curve.setAttribute('points', tauCurve(L, m));
      const dot = this.shadowRoot?.querySelector('#st-dot') as HTMLElement;
      if (dot) { dot.setAttribute('x', theta.toFixed(2)); dot.setAttribute('y', tauSigned.toFixed(4)); }
      const ratedLineTop = this.shadowRoot?.querySelector('#st-rated-line-top') as HTMLElement;
      if (ratedLineTop) { ratedLineTop.setAttribute('y1', rated.toFixed(4)); ratedLineTop.setAttribute('y2', rated.toFixed(4)); }
      const ratedLineBottom = this.shadowRoot?.querySelector('#st-rated-line-bottom') as HTMLElement;
      if (ratedLineBottom) { ratedLineBottom.setAttribute('y1', (-rated).toFixed(4)); ratedLineBottom.setAttribute('y2', (-rated).toFixed(4)); }

      const notes = this.shadowRoot?.querySelector('#st-notes') as HTMLElement;
      if (notes) notes.innerHTML =
        `<div>τ = m·g·L·cos(θ) = ${m.toFixed(2)} × 9.8 × ${L.toFixed(2)} × cos(${theta.toFixed(0)}°) = ${tauSigned.toFixed(3)} N·m (필요 토크 |τ|=${tau.toFixed(2)} N·m)</div>` +
        (ok
          ? `<div>정격 토크(${rated.toFixed(2)}N·m)가 필요 토크보다 커서 이 자세를 버틸 수 있습니다 — 여유율 ${marginPct.toFixed(0)}%.</div>`
          : `<div style="color:#dc2626">⚠ 정격 토크(${rated.toFixed(2)}N·m)가 필요 토크(${tau.toFixed(2)}N·m)보다 작습니다 — 이 모터로는 이 자세에서 무게를 버티지 못하고 팔이 떨어질 수 있습니다. 기어비를 올리거나 더 큰 토크의 모터를 선택하세요.</div>`);
    }

    @addEventListener('#st-l', 'input')
    onL(e: Event) { this.linkLength = Number((e.target as HTMLInputElement).value) || 0.01; this.refresh(); }

    @addEventListener('#st-m', 'input')
    onM(e: Event) { this.mass = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @addEventListener('#st-theta', 'input')
    onTheta(e: Event) { this.theta = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @addEventListener('#st-rated', 'input')
    onRated(e: Event) { this.rated = Number((e.target as HTMLInputElement).value) || 0.01; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { linkLength: L, mass: m, theta, rated } = this;
      const tauSigned = requiredTorqueSigned(L, m, theta);
      const tau = Math.abs(tauSigned);
      const ok = tau <= rated;
      const marginPct = rated > 0 ? ((rated - tau) / rated) * 100 : 0;
      const thetaRad = (theta * Math.PI) / 180;
      const tipX = L * Math.cos(thetaRad);
      const tipY = L * Math.sin(thetaRad);
      const diagMax = L_MAX + 0.1;
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
          .st-bars { display:flex; flex-direction:column; gap:8px; margin:10px 0; }
          .st-bar-row { display:flex; align-items:center; gap:8px; }
          .st-bar-label { font-size:11px; font-weight:800; color:#475569; width:64px; flex-shrink:0; }
          .st-bar-track { flex:1; height:14px; background:#f1f5f9; border-radius:7px; overflow:hidden; }
          .st-bar-fill { height:100%; border-radius:7px; transition:width .1s ease; background:linear-gradient(90deg,#0f766e,#14b8a6); }
          .st-bar-fill.bad { background:linear-gradient(90deg,#dc2626,#f87171); }
          .st-bar-fill.rated { background:linear-gradient(90deg,#f59e0b,#fbbf24); }
          .st-bar-val { font-size:11px; font-weight:700; color:#1e293b; width:70px; text-align:right; flex-shrink:0; }
        </style>
        <div class="math-formula">τ = m·g·L·cos(θ) — 팔 각도(θ)에 따라 버텨야 하는 토크가 달라짐</div>
        <div class="math-applied" id="st-applied" style="color:${ok ? '#0f766e' : '#dc2626'}">적용: L=${L.toFixed(2)}m, m=${m.toFixed(2)}kg, θ=${theta.toFixed(0)}° → 필요 토크=${tau.toFixed(2)} N·m (정격 ${rated.toFixed(2)}N·m 대비 ${ok ? `여유율 ${marginPct.toFixed(0)}% 안전` : `${Math.abs(marginPct).toFixed(0)}% 부족 ⚠`})</div>
        <div class="math-desc">모터(정격 토크)와 팔의 길이·짐 무게·현재 각도를 넣어서, 이 모터가 지금 자세를 버틸 수 있는지 확인하세요.</div>

        <div class="st-bars">
          <div class="st-bar-row"><span class="st-bar-label">필요 토크</span><div class="st-bar-track"><div id="st-bar-req" class="st-bar-fill${ok ? '' : ' bad'}" style="width:${Math.min(100, (tau / RATED_MAX) * 100)}%"></div></div><span class="st-bar-val" id="st-bar-req-val">${tau.toFixed(2)} N·m</span></div>
          <div class="st-bar-row"><span class="st-bar-label">정격 토크</span><div class="st-bar-track"><div id="st-bar-rated" class="st-bar-fill rated" style="width:${Math.min(100, (rated / RATED_MAX) * 100)}%"></div></div><span class="st-bar-val" id="st-bar-rated-val">${rated.toFixed(2)} N·m</span></div>
        </div>

        <cartesian-chart x-min="${-diagMax}" x-max="${diagMax}" y-min="${-diagMax}" y-max="${diagMax}" x-label="x(m)" y-label="y(m)" style="height:240px">
          <vector id="st-arm" x1="0" y1="0" x2="${tipX.toFixed(4)}" y2="${tipY.toFixed(4)}" color="#0f766e" width="5"></vector>
          <vector id="st-gravity" x1="${tipX.toFixed(4)}" y1="${tipY.toFixed(4)}" x2="${tipX.toFixed(4)}" y2="${(tipY - 0.08).toFixed(4)}" color="#94a3b8" width="2"></vector>
          <marker x="0" y="0" color="#1e293b" size="7" label="베이스(모터)"></marker>
          <marker id="st-tip" x="${tipX.toFixed(4)}" y="${tipY.toFixed(4)}" color="#ef4444" size="8" label="무게 ${m.toFixed(2)}kg"></marker>
        </cartesian-chart>
        <div class="math-desc">회색 화살표는 중력 방향입니다. 팔이 수평(θ=0°)에 가까울수록 모멘트 팔이 길어져 토크가 커지고, 수직(θ=90°)에 가까워지면 토크가 0에 가까워집니다.</div>

        <cartesian-chart x-min="0" x-max="180" y-min="${-CHART_T_MAX}" y-max="${CHART_T_MAX}" x-label="팔 각도 θ(°)" y-label="필요 토크 τ(N·m)" style="height:220px">
          <series id="st-curve" points="${tauCurve(L, m)}" color="#0f766e" width="2"></series>
          <vector id="st-rated-line-top" x1="0" y1="${rated.toFixed(4)}" x2="180" y2="${rated.toFixed(4)}" color="#f59e0b" width="1"></vector>
          <vector id="st-rated-line-bottom" x1="0" y1="${(-rated).toFixed(4)}" x2="180" y2="${(-rated).toFixed(4)}" color="#f59e0b" width="1"></vector>
          <marker id="st-dot" x="${theta.toFixed(2)}" y="${tauSigned.toFixed(4)}" color="#ef4444" size="6" label="현재"></marker>
        </cartesian-chart>
        <div class="math-desc">노란 점선은 정격 토크 한계선입니다 — 곡선이 이 선을 넘어가는 각도 구간에서는 이 모터로 버틸 수 없습니다.</div>

        <div class="math-notes" id="st-notes">
          <div>τ = m·g·L·cos(θ) = ${m.toFixed(2)} × 9.8 × ${L.toFixed(2)} × cos(${theta.toFixed(0)}°) = ${tauSigned.toFixed(3)} N·m (필요 토크 |τ|=${tau.toFixed(2)} N·m)</div>
          <div${ok ? '' : ' style="color:#dc2626"'}>${ok
            ? `정격 토크(${rated.toFixed(2)}N·m)가 필요 토크보다 커서 이 자세를 버틸 수 있습니다 — 여유율 ${marginPct.toFixed(0)}%.`
            : `⚠ 정격 토크(${rated.toFixed(2)}N·m)가 필요 토크(${tau.toFixed(2)}N·m)보다 작습니다 — 이 모터로는 이 자세에서 무게를 버티지 못하고 팔이 떨어질 수 있습니다. 기어비를 올리거나 더 큰 토크의 모터를 선택하세요.`}</div>
        </div>

        <div class="ctl"><label>링크 길이 L <input id="st-l" type="range" min="0.05" max="${L_MAX}" step="0.01" value="${L}"><b id="st-l-val">${L.toFixed(2)}m</b></label></div>
        <div class="ctl"><label>짐 무게 m <input id="st-m" type="range" min="0.02" max="${M_MAX}" step="0.01" value="${m}"><b id="st-m-val">${m.toFixed(2)}kg</b></label></div>
        <div class="ctl"><label>팔 각도 θ <input id="st-theta" type="range" min="0" max="180" step="1" value="${theta}"><b id="st-theta-val">${theta.toFixed(0)}°</b></label></div>
        <div class="ctl"><label>모터 정격 토크 <input id="st-rated" type="range" min="0.05" max="${RATED_MAX}" step="0.01" value="${rated}"><b id="st-rated-val">${rated.toFixed(2)}N·m</b></label></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
