import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-physical-encoder';

const SAMPLE_DT = 0.01; // 10ms(100Hz) — pid-angle.ino의 PERIOD_US=10000과 동일한 제어주기
const MAX_TICKS_DRAWN = 48; // 화면엔 대표로 최대 48개 눈금만 그림 (CPR 4096개를 다 그리면 안 보임)
const WAVE_CYCLES = 6;      // 파형 차트에 항상 6주기만 보여줌

const CPR_PRESETS: { cpr: number; label: string }[] = [
  { cpr: 4, label: '4 (아주 저가형)' },
  { cpr: 20, label: '20' },
  { cpr: 100, label: '100' },
  { cpr: 360, label: '360 (1도=1펄스)' },
  { cpr: 600, label: '600' },
  { cpr: 1024, label: '1024' },
  { cpr: 2048, label: '2048' },
  { cpr: 4096, label: '4096 (Dynamixel XM430 실제값)' },
];

const MD = `
## 로터리 엔코더(Rotary Encoder) — 분해능과 신호주기
- 모터 축에 원판을 붙이고, 원판에 낸 슬릿(또는 자석 패턴)이 고정된 센서를 지나갈 때마다 **전기 신호(펄스)** 하나가 나옵니다. 이 펄스를 세면 "얼마나 돌았는지"를 알 수 있습니다.
- **분해능(CPR, Counts Per Revolution)**: 원판 한 바퀴(360°)에 슬릿이 몇 개 있는지. 슬릿이 많을수록(CPR↑) 한 펄스가 나타내는 각도(**각분해능 = 360°/CPR**)가 작아져서 더 정밀합니다.
- **왜 채널이 2개(A/B)일까요? — 쿼드러처(Quadrature)**: 채널 하나만 있으면 "얼마나 돌았는지"는 알아도 **어느 방향으로 도는지**는 모릅니다. A, B 두 채널을 슬릿 간격의 1/4만큼 어긋나게 배치하면, 어느 채널이 먼저 바뀌는지로 방향을 알 수 있고, 양쪽 채널의 상승·하강 에지를 전부 세면(x4 디코딩) **실질 분해능이 4배(4×CPR)** 로 좋아집니다.
- **신호주기(pulse period)**: 펄스 하나가 나오는 데 걸리는 시간. \`펄스 주파수 f = CPR × (RPM/60)\`, \`주기 T = 1/f\`. **속도(RPM)가 올라갈수록, 또는 분해능(CPR)이 높을수록 주기는 짧아지고(신호가 빨라지고) 주파수는 올라갑니다.**
- **듀티비(Duty Cycle)**: 한 주기(T) 중에서 신호가 **HIGH로 켜져 있는 시간의 비율** — \`듀티(%) = (HIGH 시간 ÷ 전체 주기) × 100\`. 이상적인 엔코더는 슬릿과 틈이 정확히 반반이라 **50%**가 나옵니다. 실제로는 원판 슬릿 폭 오차나 센서 정렬 때문에 50%에서 살짝 벗어나는데(스펙시트에 흔히 "50%±10%"로 표기), 너무 많이 벗어나면 아주 좁은 쪽 신호를 놓쳐서(빨리 돌 때 특히) 카운트를 놓칠 수 있습니다. 아래 슬라이더로 듀티를 바꿔서 파형이 비대칭이 되는 걸 확인해 보세요.
- **너무 느리거나 분해능이 낮으면?** — 제어기가 매 샘플 주기(예: 이 로봇의 100Hz=10ms)마다 한 번씩 카운트를 읽는다고 하면, 한 샘플 동안 펄스가 1개도 안 들어올 수 있습니다(느린 회전 + 낮은 CPR). 이러면 실제로는 움직이고 있어도 속도가 "0" 또는 계단식으로 뚝뚝 끊겨 읽힙니다 — 이 페이지 슬라이더를 낮은 RPM·낮은 CPR로 내려서 "샘플당 펄스" 경고가 뜨는 걸 확인해 보세요.
- **실제 로봇에 적용해보면**: **"PID 각도제어"**·**"P게인 찾기"** 페이지의 로봇(Dynamixel XM430)은 CPR=4096(12비트) 엔코더를 쓰고, 100Hz(10ms)로 제어합니다 — 이 페이지의 기본값과 같은 조합입니다. 그 로봇의 속도값도 내부적으로 이렇게 "펄스 개수 ÷ 시간"으로 양자화되어 나옵니다(실제 속도 1LSB ≈ 0.229RPM).
- **어디에 쓰이나요?** — 로봇 관절 위치·속도 측정, 컨베이어 벨트 속도계, 마우스 휠, 프린터 롤러 위치 제어.
`;

function computeStats(cpr: number, rpm: number) {
  const resDeg = 360 / cpr;
  const freqHz = cpr * (rpm / 60);
  const periodMs = freqHz > 0 ? 1000 / freqHz : Infinity;
  const pulsesPerSample = freqHz * SAMPLE_DT;
  return { resDeg, resDegX4: resDeg / 4, freqHz, periodMs, freqHzX4: freqHz * 4, pulsesPerSample };
}

function fmtPeriod(periodMs: number): string {
  if (!Number.isFinite(periodMs)) return '∞(정지)';
  return periodMs >= 1 ? `${periodMs.toFixed(3)}ms` : `${(periodMs * 1000).toFixed(1)}µs`;
}

/** 한 채널의 구형파(square wave) 좌표 — periodMs 주기, phaseFrac만큼 위상 지연, dutyFrac(HIGH 비율)만큼 비대칭, cycles주기만큼. */
function squareWavePoints(periodMs: number, phaseFrac: number, dutyFrac: number, cycles: number, yLow: number, yHigh: number): string {
  if (!Number.isFinite(periodMs) || periodMs <= 0) return `0,${yLow} 1,${yLow}`;
  const totalMs = periodMs * cycles;
  const highMs = periodMs * dutyFrac;
  const phaseOffset = phaseFrac * periodMs;
  const localT0 = (((0 - phaseOffset) % periodMs) + periodMs) % periodMs;
  let level = localT0 < highMs ? yHigh : yLow;
  const pts: string[] = [`0,${level}`];
  // 한 주기 안에서 HIGH 시작(phaseOffset+k·T), LOW 시작(그 +highMs) 두 경계를 전부 모아서 시간순 정렬
  const boundaries: [number, number][] = [];
  const kStart = Math.floor((0 - phaseOffset) / periodMs) - 1;
  const kEnd = Math.ceil((totalMs - phaseOffset) / periodMs) + 1;
  for (let k = kStart; k <= kEnd; k++) {
    const highStart = phaseOffset + k * periodMs;
    const lowStart = highStart + highMs;
    if (highStart > 0 && highStart <= totalMs) boundaries.push([highStart, yHigh]);
    if (lowStart > 0 && lowStart <= totalMs) boundaries.push([lowStart, yLow]);
  }
  boundaries.sort((a, b) => a[0] - b[0]);
  for (const [t, newLevel] of boundaries) {
    pts.push(`${t.toFixed(5)},${level}`);
    level = newLevel;
    pts.push(`${t.toFixed(5)},${level}`);
  }
  pts.push(`${totalMs.toFixed(5)},${level}`);
  return pts.join(' ');
}

function tickMarks(cpr: number): string {
  const n = Math.min(cpr, MAX_TICKS_DRAWN);
  const tags: string[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (360 * i) / n;
    tags.push(`<line x1="50" y1="6" x2="50" y2="14" stroke="#0f766e" stroke-width="2" transform="rotate(${angle} 50 50)"/>`);
  }
  return tags.join('');
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class PhysicalEncoder extends w.HTMLElement {
    private cprIdx = 2;  // 기본값: CPR=100
    private rpm = 30;
    private dutyPct = 50; // 듀티비(%) — 이상적으로는 50

    private refresh() {
      const cpr = CPR_PRESETS[this.cprIdx].cpr;
      const rpm = this.rpm;
      const s = computeStats(cpr, rpm);
      const lowWarn = rpm > 0 && s.pulsesPerSample < 1;

      const dutyFrac = this.dutyPct / 100;

      const applied = this.shadowRoot?.querySelector('#enc-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: CPR=${cpr}, ${rpm}RPM, 듀티=${this.dutyPct}% → 각분해능=${s.resDeg.toFixed(3)}°(x4시 ${s.resDegX4.toFixed(3)}°), 펄스주파수=${s.freqHz.toFixed(1)}Hz, 신호주기=${fmtPeriod(s.periodMs)}`;

      const cprVal = this.shadowRoot?.querySelector('#enc-cpr-val') as HTMLElement;
      if (cprVal) cprVal.textContent = CPR_PRESETS[this.cprIdx].label;
      const rpmVal = this.shadowRoot?.querySelector('#enc-rpm-val') as HTMLElement;
      if (rpmVal) rpmVal.textContent = `${rpm} RPM`;
      const dutyVal = this.shadowRoot?.querySelector('#enc-duty-val') as HTMLElement;
      if (dutyVal) dutyVal.textContent = `${this.dutyPct}%`;

      // 회전 원판 애니메이션 — 60/RPM초에 한 바퀴
      const disc = this.shadowRoot?.querySelector('#enc-disc') as HTMLElement;
      if (disc) {
        if (rpm > 0) { disc.style.animationDuration = `${(60 / rpm).toFixed(4)}s`; disc.style.animationPlayState = 'running'; }
        else disc.style.animationPlayState = 'paused';
      }
      const ticks = this.shadowRoot?.querySelector('#enc-ticks') as HTMLElement;
      if (ticks) ticks.innerHTML = tickMarks(cpr);
      const ticksNote = this.shadowRoot?.querySelector('#enc-ticks-note') as HTMLElement;
      if (ticksNote) ticksNote.textContent = cpr > MAX_TICKS_DRAWN ? `(실제 ${cpr}개 중 대표로 ${MAX_TICKS_DRAWN}개만 표시)` : `(${cpr}개 전부 표시)`;

      // A/B LED 깜빡임 — 신호주기(periodMs)마다 한 번, B는 1/4주기 지연
      const ledA = this.shadowRoot?.querySelector('#enc-led-a') as HTMLElement;
      const ledB = this.shadowRoot?.querySelector('#enc-led-b') as HTMLElement;
      const periodS = s.periodMs / 1000;
      [ledA, ledB].forEach((led, i) => {
        if (!led) return;
        if (rpm > 0 && Number.isFinite(periodS) && periodS > 0) {
          led.style.animationDuration = `${periodS.toFixed(6)}s`;
          led.style.animationDelay = i === 0 ? '0s' : `${(-periodS / 4).toFixed(6)}s`;
          led.style.animationPlayState = 'running';
          led.style.opacity = '';
        } else {
          led.style.animationPlayState = 'paused';
          led.style.opacity = '0.15';
        }
      });

      const chart = this.shadowRoot?.querySelector('#enc-wave-chart') as HTMLElement;
      const totalMs = Number.isFinite(s.periodMs) ? s.periodMs * WAVE_CYCLES : 100;
      if (chart) chart.setAttribute('x-max', String(totalMs));
      const waveA = this.shadowRoot?.querySelector('#enc-wave-a') as HTMLElement;
      if (waveA) waveA.setAttribute('points', squareWavePoints(s.periodMs, 0, dutyFrac, WAVE_CYCLES, 0, 1));
      const waveB = this.shadowRoot?.querySelector('#enc-wave-b') as HTMLElement;
      if (waveB) waveB.setAttribute('points', squareWavePoints(s.periodMs, 0.25, dutyFrac, WAVE_CYCLES, 1.6, 2.6));

      const notes = this.shadowRoot?.querySelector('#enc-notes') as HTMLElement;
      if (notes) notes.innerHTML =
        `<div>각분해능 = 360°/CPR = 360/${cpr} = ${s.resDeg.toFixed(3)}° (쿼드러처 x4 디코딩 시 ${s.resDegX4.toFixed(3)}°)</div>` +
        `<div>펄스주파수 f = CPR×(RPM/60) = ${cpr}×(${rpm}/60) = ${s.freqHz.toFixed(2)}Hz → 신호주기 T=1/f = ${fmtPeriod(s.periodMs)}</div>` +
        `<div>듀티비 = HIGH시간÷전체주기 = ${this.dutyPct}% ${Math.abs(this.dutyPct - 50) < 1 ? '(이상적인 50%)' : Math.abs(this.dutyPct - 50) > 20 ? '<b style="color:#ef4444">— 50%에서 많이 벗어남, 고속에서 좁은 쪽 펄스를 놓칠 위험</b>' : '(50%에서 조금 벗어남)'}</div>` +
        `<div>제어주기(${(SAMPLE_DT * 1000).toFixed(0)}ms=${(1 / SAMPLE_DT).toFixed(0)}Hz) 동안 들어오는 펄스 수 ≈ ${s.pulsesPerSample.toFixed(2)}개 ${lowWarn ? '<b style="color:#ef4444">— 1개 미만! 속도가 0/계단식으로 끊겨 읽힐 수 있음</b>' : '(충분함)'}</div>`;
    }

    @addEventListener('#enc-cpr', 'input')
    onCpr(e: Event) { this.cprIdx = Math.max(0, Math.min(CPR_PRESETS.length - 1, Number((e.target as HTMLInputElement).value) || 0)); this.refresh(); }
    @addEventListener('#enc-rpm', 'input')
    onRpm(e: Event) { this.rpm = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#enc-duty', 'input')
    onDuty(e: Event) { this.dutyPct = Number((e.target as HTMLInputElement).value) || 50; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const cpr = CPR_PRESETS[this.cprIdx].cpr;
      const rpm = this.rpm;
      const s = computeStats(cpr, rpm);
      const lowWarn = rpm > 0 && s.pulsesPerSample < 1;
      const totalMs = Number.isFinite(s.periodMs) ? s.periodMs * WAVE_CYCLES : 100;
      const discDurS = rpm > 0 ? 60 / rpm : 1;
      const periodS = Number.isFinite(s.periodMs) && s.periodMs > 0 ? s.periodMs / 1000 : 1;
      const playState = rpm > 0 ? 'running' : 'paused';
      const dutyFrac = this.dutyPct / 100;
      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-title { font-size:13px; font-weight:800; color:#475569; margin:14px 0 4px; }
          .math-title:first-child { margin-top:0; }
          .math-applied { font-size:13px; font-weight:800; color:#0f766e; margin-bottom:8px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .math-legend { display:flex; gap:12px; font-size:11px; color:#64748b; margin-top:8px; flex-wrap:wrap; }
          .math-legend b { font-weight:800; }
          .math-notes { font-size:12px; font-weight:700; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin-top:8px; line-height:1.7; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:150px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }

          .enc-wrap { display:flex; align-items:center; gap:24px; flex-wrap:wrap; margin:10px 0; }
          .enc-disc-box { position:relative; width:120px; height:120px; flex-shrink:0; }
          .enc-disc-box svg { width:100%; height:100%; }
          #enc-disc { transform-origin:50px 50px; animation-name:enc-spin; animation-timing-function:linear; animation-iteration-count:infinite; }
          @keyframes enc-spin { to { transform: rotate(360deg); } }
          .enc-pointer { position:absolute; top:-2px; left:50%; transform:translateX(-50%); font-size:14px; }
          .enc-leds { display:flex; flex-direction:column; gap:10px; }
          .enc-led-row { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:800; color:#475569; }
          .enc-led { width:20px; height:20px; border-radius:50%; background:#14b8a6; box-shadow:0 0 10px #14b8a6; animation-name:enc-blink; animation-timing-function:steps(1,end); animation-iteration-count:infinite; }
          @keyframes enc-blink { 0%,49.9% { opacity:1; } 50%,100% { opacity:0.12; } }
        </style>
        <div class="math-formula">각분해능=360°/CPR, 펄스주파수 f=CPR×(RPM/60), 신호주기 T=1/f</div>
        <div class="math-applied" id="enc-applied">적용: CPR=${cpr}, ${rpm}RPM, 듀티=${this.dutyPct}% → 각분해능=${s.resDeg.toFixed(3)}°(x4시 ${s.resDegX4.toFixed(3)}°), 펄스주파수=${s.freqHz.toFixed(1)}Hz, 신호주기=${fmtPeriod(s.periodMs)}</div>
        <div class="math-desc">분해능(CPR)·속도(RPM)·듀티비를 슬라이더로 바꿔보세요 — 원판이 실제로 도는 빠르기, LED가 깜빡이는 빠르기(=신호주기), 아래 파형의 HIGH/LOW 비율이 그대로 바뀝니다.</div>

        <div class="enc-wrap">
          <div class="enc-disc-box">
            <svg viewBox="0 0 100 100">
              <g id="enc-disc" style="animation-duration:${discDurS.toFixed(4)}s;animation-play-state:${playState}">
                <circle cx="50" cy="50" r="46" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
                <g id="enc-ticks">${tickMarks(cpr)}</g>
                <circle cx="50" cy="50" r="4" fill="#0f766e"/>
              </g>
            </svg>
            <div class="enc-pointer">🔻</div>
          </div>
          <div class="enc-leds">
            <div class="enc-led-row"><span id="enc-led-a" class="enc-led" style="animation-duration:${periodS.toFixed(6)}s;animation-play-state:${playState};opacity:${rpm > 0 ? '' : '0.15'}"></span> A채널</div>
            <div class="enc-led-row"><span id="enc-led-b" class="enc-led" style="animation-duration:${periodS.toFixed(6)}s;animation-delay:${(-periodS / 4).toFixed(6)}s;animation-play-state:${playState};opacity:${rpm > 0 ? '' : '0.15'}"></span> B채널(A보다 1/4주기 지연 — 방향 판별용)</div>
          </div>
        </div>
        <div class="math-legend"><span>🔻 고정된 센서(읽음head)</span><span id="enc-ticks-note">${cpr > MAX_TICKS_DRAWN ? `(실제 ${cpr}개 중 대표로 ${MAX_TICKS_DRAWN}개만 표시)` : `(${cpr}개 전부 표시)`}</span></div>

        <div class="ctl"><label>분해능(CPR) <input id="enc-cpr" type="range" min="0" max="${CPR_PRESETS.length - 1}" step="1" value="${this.cprIdx}"><b id="enc-cpr-val">${CPR_PRESETS[this.cprIdx].label}</b></label></div>
        <div class="ctl"><label>속도(RPM) <input id="enc-rpm" type="range" min="0" max="300" step="1" value="${rpm}"><b id="enc-rpm-val">${rpm} RPM</b></label></div>
        <div class="ctl"><label>듀티비(%) <input id="enc-duty" type="range" min="10" max="90" step="1" value="${this.dutyPct}"><b id="enc-duty-val">${this.dutyPct}%</b></label></div>

        <div class="math-title">A/B 쿼드러처 신호 파형 (항상 ${WAVE_CYCLES}주기만 표시)</div>
        <cartesian-chart id="enc-wave-chart" x-min="0" x-max="${totalMs}" y-min="-0.3" y-max="2.9" x-label="시간(ms)" y-label="" disabled-aspect style="height:180px;max-width:640px;margin:0 auto">
          <series id="enc-wave-a" points="${squareWavePoints(s.periodMs, 0, dutyFrac, WAVE_CYCLES, 0, 1)}" color="#0f766e" width="2" label="A채널"></series>
          <series id="enc-wave-b" points="${squareWavePoints(s.periodMs, 0.25, dutyFrac, WAVE_CYCLES, 1.6, 2.6)}" color="#f59e0b" width="2" label="B채널"></series>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#0f766e">— A채널</b></span><span><b style="color:#f59e0b">— B채널(1/4주기 지연)</b></span></div>
        <div class="math-desc">LED는 신호주기에 맞춰 단순 on/off로만 깜빡입니다 — 듀티비에 따른 HIGH/LOW 비율은 이 파형 차트에서 정확하게 보세요.</div>

        <div class="math-notes" id="enc-notes">
          <div>각분해능 = 360°/CPR = 360/${cpr} = ${s.resDeg.toFixed(3)}° (쿼드러처 x4 디코딩 시 ${s.resDegX4.toFixed(3)}°)</div>
          <div>펄스주파수 f = CPR×(RPM/60) = ${cpr}×(${rpm}/60) = ${s.freqHz.toFixed(2)}Hz → 신호주기 T=1/f = ${fmtPeriod(s.periodMs)}</div>
          <div>듀티비 = HIGH시간÷전체주기 = ${this.dutyPct}% ${Math.abs(this.dutyPct - 50) < 1 ? '(이상적인 50%)' : Math.abs(this.dutyPct - 50) > 20 ? '<b style="color:#ef4444">— 50%에서 많이 벗어남, 고속에서 좁은 쪽 펄스를 놓칠 위험</b>' : '(50%에서 조금 벗어남)'}</div>
          <div>제어주기(${(SAMPLE_DT * 1000).toFixed(0)}ms=${(1 / SAMPLE_DT).toFixed(0)}Hz) 동안 들어오는 펄스 수 ≈ ${s.pulsesPerSample.toFixed(2)}개 ${lowWarn ? '<b style="color:#ef4444">— 1개 미만! 속도가 0/계단식으로 끊겨 읽힐 수 있음</b>' : '(충분함)'}</div>
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
