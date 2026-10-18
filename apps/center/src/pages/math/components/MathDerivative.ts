import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-derivative';

// 등가속도(a=1m/s²)로 출발하는 자동차 — 숫자가 깔끔해서 손으로도 검산하기 쉬움
function s(t: number) { return (t * t) / 2; }  // 위치(m)
function v(t: number) { return t; }            // 순간속도(m/s) = s'(t)
const ACCEL = 1;                                // 가속도(m/s²) = v'(t), 상수

const T_DOMAIN = 8;      // 그래프에 보여줄 시간 범위(t+Δt까지 여유있게)
const S_MAX = s(T_DOMAIN); // 32

const MD = `
## 미분(derivative)이 뭐예요? — 자동차 속도로 알아보기
- 자동차가 도로를 달립니다. **위치(s)**가 시간(t)에 따라 조금씩 변하죠. "지금 이 순간 얼마나 빨리 달리고 있어요?"에 대한 답이 바로 **미분**입니다.
- **평균속도**: 두 시점 사이 "이동한 거리 ÷ 걸린 시간". 예를 들어 3초에서 5초 사이 20m를 갔다면 평균속도 = 20÷2 = 10m/s예요.
- **순간속도**: "지금 이 순간"만의 속도. 평균속도를 구할 때 쓰는 시간 간격(Δt)을 3초, 1초, 0.1초, 0.01초... 로 점점 더 짧게 줄이면, 평균속도가 어떤 값에 딱 다가가서 멈춥니다 — 그 값이 **순간속도**이고, 수학에서는 이걸 **미분** \`s'(t)\`라고 부릅니다: \`s'(t) = lim(Δt→0) [s(t+Δt)-s(t)] / Δt\`
- 이 페이지의 자동차는 \`s(t) = t²/2\`(m)만큼 갑니다(등가속도로 출발). 미분하면 \`s'(t) = t\` — 그러니까 3초 시점에서는 정확히 초속 3m/s로 달리고 있는 겁니다.
- **Δt(시간 간격)를 슬라이더로 확 줄여보세요** — 평균속도가 실제 순간속도(빨간 값)에 점점 더 가까워지는 걸 숫자와 그래프로 동시에 확인할 수 있습니다.
- **속도를 한 번 더 미분하면?** — "속도가 지금 얼마나 빨리 변하고 있나"가 바로 **가속도**입니다. 이 자동차는 속도가 매초 똑같이 1m/s씩 늘어나서, 가속도가 언제나 **1m/s²로 일정**합니다.
- **다른 데서도 다 미분이에요**: 온도계가 기온이 오르는 빠르기, 스마트폰 배터리가 줄어드는 빠르기, 주가가 오르내리는 빠르기 — 전부 "지금 이 순간 얼마나 빨리 변하나"를 구하는 거라서 다 미분입니다.
- **어디에 쓰이나요?** — 로봇 속도 제어, PID의 D항(오차가 변하는 빠르기), 자율주행 속도 계산, 일기예보의 기온 변화율.
`;

function curveStr(fn: (t: number) => number, tMin: number, tMax: number, n = 80) {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = tMin + ((tMax - tMin) * i) / n;
    pts.push(`${t.toFixed(3)},${fn(t).toFixed(4)}`);
  }
  return pts.join(' ');
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathDerivative extends w.HTMLElement {
    private t = 2;
    private dt = 2;

    private refresh() {
      const { t, dt } = this;
      const s0 = s(t), s1 = s(t + dt);
      const avgSpeed = (s1 - s0) / dt;
      const trueSpeed = v(t);
      const err = Math.abs(avgSpeed - trueSpeed);

      const applied = this.shadowRoot?.querySelector('#drv-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: t=${t.toFixed(2)}s, Δt=${dt.toFixed(2)}s → 평균속도 = ${avgSpeed.toFixed(3)}m/s, 순간속도(진짜) = ${trueSpeed.toFixed(3)}m/s, 오차 = ${err.toFixed(4)}`;

      const notes = this.shadowRoot?.querySelector('#drv-notes') as HTMLElement;
      if (notes) notes.innerHTML =
        `<div>평균속도 = [s(t+Δt)-s(t)]/Δt = [${s1.toFixed(3)} - ${s0.toFixed(3)}] / ${dt.toFixed(2)} = ${avgSpeed.toFixed(3)}m/s</div>` +
        `<div>순간속도 s'(t) = t = ${trueSpeed.toFixed(3)}m/s</div>` +
        `<div>${err < 0.05 ? 'Δt가 충분히 작아서 평균속도가 순간속도와 거의 같습니다' : 'Δt를 더 줄이면 평균속도가 순간속도에 더 가까워집니다'}</div>`;

      (['t', 'dt'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#drv-${k}-val`) as HTMLElement;
        if (el) el.textContent = `${this[k].toFixed(2)}${k === 't' ? 's' : 's'}`;
      });

      const carNow = this.shadowRoot?.querySelector('#drv-car-now') as HTMLElement;
      if (carNow) carNow.style.left = `${(s0 / S_MAX * 100).toFixed(2)}%`;
      const carLater = this.shadowRoot?.querySelector('#drv-car-later') as HTMLElement;
      if (carLater) carLater.style.left = `${(Math.min(s1, S_MAX) / S_MAX * 100).toFixed(2)}%`;
      const roadNow = this.shadowRoot?.querySelector('#drv-road-now-val') as HTMLElement;
      if (roadNow) roadNow.textContent = `${s0.toFixed(1)}m (t=${t.toFixed(2)}s)`;
      const roadLater = this.shadowRoot?.querySelector('#drv-road-later-val') as HTMLElement;
      if (roadLater) roadLater.textContent = `${s1.toFixed(1)}m (t+Δt=${(t + dt).toFixed(2)}s)`;

      const pt = this.shadowRoot?.querySelector('#drv-pt') as HTMLElement;
      if (pt) { pt.setAttribute('x', t.toFixed(3)); pt.setAttribute('y', s0.toFixed(4)); }
      const pt2 = this.shadowRoot?.querySelector('#drv-pt2') as HTMLElement;
      if (pt2) { pt2.setAttribute('x', (t + dt).toFixed(3)); pt2.setAttribute('y', s1.toFixed(4)); }
      const secant = this.shadowRoot?.querySelector('#drv-secant') as HTMLElement;
      if (secant) secant.setAttribute('points', `0,${(s0 + avgSpeed * (0 - t)).toFixed(4)} ${T_DOMAIN},${(s0 + avgSpeed * (T_DOMAIN - t)).toFixed(4)}`);
      const tangent = this.shadowRoot?.querySelector('#drv-tangent') as HTMLElement;
      if (tangent) tangent.setAttribute('points', `0,${(s0 + trueSpeed * (0 - t)).toFixed(4)} ${T_DOMAIN},${(s0 + trueSpeed * (T_DOMAIN - t)).toFixed(4)}`);

      const speedMark = this.shadowRoot?.querySelector('#drv-speed-mark') as HTMLElement;
      if (speedMark) { speedMark.setAttribute('x', t.toFixed(3)); speedMark.setAttribute('y', trueSpeed.toFixed(4)); speedMark.setAttribute('label', `${trueSpeed.toFixed(2)}m/s`); }
      const accelMark = this.shadowRoot?.querySelector('#drv-accel-mark') as HTMLElement;
      if (accelMark) accelMark.setAttribute('x', t.toFixed(3));
    }

    @addEventListener('#drv-t', 'input')
    onT(e: Event) { this.t = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#drv-dt', 'input')
    onDt(e: Event) { this.dt = Number((e.target as HTMLInputElement).value) || 0.05; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { t, dt } = this;
      const s0 = s(t), s1 = s(t + dt);
      const avgSpeed = (s1 - s0) / dt;
      const trueSpeed = v(t);
      const err = Math.abs(avgSpeed - trueSpeed);
      return `
        <style>
          :host { display:block; }
          .math-title { font-size:13px; font-weight:800; color:#475569; margin:14px 0 4px; }
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
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }

          .road { position:relative; height:40px; background:#334155; border-radius:8px; margin:10px 0 4px; overflow:visible; }
          .road::before { content:''; position:absolute; left:0; right:0; top:50%; height:2px; background:repeating-linear-gradient(90deg,#fbbf24 0 10px,transparent 10px 20px); transform:translateY(-50%); }
          .road .car { position:absolute; top:50%; transform:translate(-50%,-50%); font-size:22px; transition:left .1s ease; }
          .road .car.ghost { font-size:14px; opacity:0.7; }
          .road-labels { display:flex; justify-content:space-between; font-size:11px; color:#475569; font-weight:700; margin-bottom:6px; }
        </style>
        <div class="math-formula">위치 s(t) = t²/2 (m) — 자동차가 시간에 따라 이동한 거리(등가속도 출발)</div>
        <div class="math-applied" id="drv-applied">적용: t=${t.toFixed(2)}s, Δt=${dt.toFixed(2)}s → 평균속도 = ${avgSpeed.toFixed(3)}m/s, 순간속도(진짜) = ${trueSpeed.toFixed(3)}m/s, 오차 = ${err.toFixed(4)}</div>
        <div class="math-desc">지금(빨강 자동차)과 조금 뒤(주황 표시) 사이의 평균속도를 구합니다. Δt를 줄여서 두 위치가 거의 붙게 만들면, 평균속도가 "지금 이 순간의 속도"(순간속도)에 다가갑니다.</div>

        <div class="road">
          <div id="drv-car-now" class="car" style="left:${(s0 / S_MAX * 100).toFixed(2)}%">🚗</div>
          <div id="drv-car-later" class="car ghost" style="left:${(Math.min(s1, S_MAX) / S_MAX * 100).toFixed(2)}%">📍</div>
        </div>
        <div class="road-labels"><span id="drv-road-now-val">${s0.toFixed(1)}m (t=${t.toFixed(2)}s)</span><span id="drv-road-later-val">${s1.toFixed(1)}m (t+Δt=${(t + dt).toFixed(2)}s)</span></div>

        <cartesian-chart x-min="0" x-max="${T_DOMAIN}" y-min="0" y-max="${S_MAX}" x-label="시간 t(s)" y-label="위치 s(m)">
          <series points="${curveStr(s, 0, T_DOMAIN)}" color="#3e63dd" width="2.2" label="s(t)"></series>
          <series id="drv-tangent" points="0,${(s0 + trueSpeed * (0 - t)).toFixed(4)} ${T_DOMAIN},${(s0 + trueSpeed * (T_DOMAIN - t)).toFixed(4)}" color="#10b981" width="1.6" label="순간속도 선"></series>
          <series id="drv-secant" points="0,${(s0 + avgSpeed * (0 - t)).toFixed(4)} ${T_DOMAIN},${(s0 + avgSpeed * (T_DOMAIN - t)).toFixed(4)}" color="#f59e0b" dash="5,4" width="1.6" label="평균속도 선"></series>
          <marker id="drv-pt" x="${t}" y="${s0.toFixed(4)}" color="#e5484d" size="5" label="지금(t, s(t))"></marker>
          <marker id="drv-pt2" x="${(t + dt).toFixed(3)}" y="${s1.toFixed(4)}" color="#f59e0b" size="4" label="나중(t+Δt)"></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#3e63dd">— 위치 s(t)</b></span><span><b style="color:#10b981">— 순간속도 선(진짜 s'(t))</b></span><span><b style="color:#f59e0b">- - 평균속도 선</b></span><span><b style="color:#e5484d">● 지금</b></span><span><b style="color:#f59e0b">● 나중</b></span></div>
        <div class="math-notes" id="drv-notes">
          <div>평균속도 = [s(t+Δt)-s(t)]/Δt = [${s1.toFixed(3)} - ${s0.toFixed(3)}] / ${dt.toFixed(2)} = ${avgSpeed.toFixed(3)}m/s</div>
          <div>순간속도 s'(t) = t = ${trueSpeed.toFixed(3)}m/s</div>
          <div>${err < 0.05 ? 'Δt가 충분히 작아서 평균속도가 순간속도와 거의 같습니다' : 'Δt를 더 줄이면 평균속도가 순간속도에 더 가까워집니다'}</div>
        </div>
        <div class="ctl"><label>t (지금 몇 초?) <input id="drv-t" type="range" min="0" max="5" step="0.05" value="${t}"><b id="drv-t-val">${t.toFixed(2)}s</b></label></div>
        <div class="ctl"><label>Δt (시간 간격) <input id="drv-dt" type="range" min="0.05" max="3" step="0.05" value="${dt}"><b id="drv-dt-val">${dt.toFixed(2)}s</b></label></div>

        <div class="math-title">이 자동차의 속도계 — s'(t) = t (m/s)</div>
        <div class="math-desc">위 위치 그래프의 기울기를 시간에 따라 쭉 그리면 이 속도 그래프가 됩니다. 시간이 지날수록 속도가 계속 빨라지는 게(등가속도) 보이시나요?</div>
        <cartesian-chart x-min="0" x-max="${T_DOMAIN}" y-min="0" y-max="${T_DOMAIN}" x-label="시간 t(s)" y-label="속도 s'(t) (m/s)" style="height:180px">
          <series points="${curveStr(v, 0, T_DOMAIN)}" color="#8b5cf6" width="2"></series>
          <marker id="drv-speed-mark" x="${t}" y="${trueSpeed.toFixed(4)}" color="#e5484d" size="5" label="${trueSpeed.toFixed(2)}m/s"></marker>
        </cartesian-chart>

        <div class="math-title">속도를 한 번 더 미분 = 가속도 — v'(t) = 1 (m/s², 항상 일정)</div>
        <div class="math-desc">이 자동차는 속도가 매초 똑같이 1m/s씩 늘어나서(등가속도), 가속도가 시간과 상관없이 항상 1로 일정합니다.</div>
        <cartesian-chart x-min="0" x-max="${T_DOMAIN}" y-min="0" y-max="2" x-label="시간 t(s)" y-label="가속도 v'(t) (m/s²)" style="height:140px">
          <series points="${curveStr(() => ACCEL, 0, T_DOMAIN)}" color="#ef4444" width="2"></series>
          <marker id="drv-accel-mark" x="${t}" y="${ACCEL}" color="#e5484d" size="5" label="${ACCEL}m/s²"></marker>
        </cartesian-chart>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
