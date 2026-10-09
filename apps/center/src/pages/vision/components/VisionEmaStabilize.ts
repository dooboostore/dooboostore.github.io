import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-ema-stabilize';

const CHART_W = 320;
const CHART_H = 160;
const N = 60; // 샘플 수 (10초 가정)
const JUMP_AT = 36; // 6초 지점에서 공이 갑자기 이동
const BASE_VAL = 200;
const JUMP_VAL = 260;
const Y_MIN = 185;
const Y_MAX = 275;

function seededRand(seed: number): number {
  const x = Math.sin(seed * 999.7) * 10000;
  return x - Math.floor(x) - 0.5;
}

function genRawSeries(): number[] {
  return Array.from({ length: N }, (_, i) => {
    const base = i < JUMP_AT ? BASE_VAL : JUMP_VAL;
    return base + seededRand(i) * 6; // ±3px 지터
  });
}

function computeEma(raw: number[], alpha: number): number[] {
  const out: number[] = [];
  let prev = raw[0];
  raw.forEach(v => {
    prev = alpha * v + (1 - alpha) * prev;
    out.push(prev);
  });
  return out;
}

const toX = (i: number) => (i / (N - 1)) * CHART_W;
const toY = (v: number) => CHART_H - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * CHART_H;
const toPolyline = (series: number[]) => series.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

const DROPOUT_START = 14;
const DROPOUT_END = 22;

/** 미검출 구간(검출 실패 프레임)을 올바르게/잘못되게 처리했을 때의 EMA 차이를 재현 */
function computeEmaDropout(raw: number[], alpha: number, mode: 'carry' | 'resetZero'): number[] {
  const out: number[] = [];
  let prev = raw[0];
  raw.forEach((v, i) => {
    const dropped = i >= DROPOUT_START && i < DROPOUT_END;
    if (dropped && mode === 'carry') {
      // 올바른 방식: 검출 실패 프레임은 "None"으로 건너뛰고 마지막 EMA 값을 그대로 유지한다
    } else if (dropped && mode === 'resetZero') {
      // 잘못된 방식: 미검출을 0(또는 실패값)으로 간주해 EMA 업데이트에 그대로 흘려보낸다
      prev = alpha * 0 + (1 - alpha) * prev;
    } else {
      prev = alpha * v + (1 - alpha) * prev;
    }
    out.push(prev);
  });
  return out;
}

const MD = `
## 시간 축 안정화 — 검출값 떨림 잡기
- 프레임마다 검출 중심이 몇 픽셀씩 떨립니다. **EMA(지수이동평균)**로 다듬습니다: \`cx = α·새값 + (1−α)·이전값\`
- **α가 크면**(민감) 새 값을 빨리 반영해 반응은 빠르지만 떨림도 덜 눌립니다. **α가 작으면**(둔감) 떨림은 잘 눌리지만, 물체가 실제로 움직였을 때 **새 위치를 늦게 따라가는 지연(lag)**이 생깁니다.
- 이건 **부드러움 ↔ 지연의 트레이드오프**입니다 — 정답은 없고, 이 신호를 받는 **추적 제어가 견딜 수 있는 지연 만큼만** 필터를 걸어야 합니다.
- 아래 그래프에서 공이 6초 지점에서 갑자기 옮겨진 뒤, α가 작을수록 새 위치에 늦게 도달하는 걸 확인해보세요.
- **미검출(측점 실패) 프레임을 어떻게 다루느냐도 중요합니다**: 올바른 구현은 그 프레임을 \`None\`으로 건너뛰고 마지막 EMA 값을 그대로 유지하지만, 잘못된 구현은 실패를 0이나 노이즈로 취급해 EMA 업데이트에 그대로 흘려보내 값이 크게 흔들립니다 — 게임 컨트롤러 입력 스무딩이나 마우스 커서 평활화도 같은 함정을 가집니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  const raw = genRawSeries();

  @elementDefine(tagName, { window: w })
  class VisionEmaStabilize extends w.HTMLElement {
    private alpha = 0.3;
    private refAlpha = 0.1;
    private dropoutSim = false;

    private refresh() {
      const emaA = computeEma(raw, this.alpha);
      const emaB = computeEma(raw, this.refAlpha);

      const setAttr = (sel: string, attr: string, val: string) => this.shadowRoot?.querySelector(sel)?.setAttribute(attr, val);
      setAttr('#es-jumpline', 'x1', String(toX(JUMP_AT)));
      setAttr('#es-jumpline', 'x2', String(toX(JUMP_AT)));

      if (this.dropoutSim) {
        const correct = computeEmaDropout(raw, this.alpha, 'carry');
        const wrong = computeEmaDropout(raw, this.alpha, 'resetZero');
        setAttr('#es-raw', 'points', toPolyline(raw));
        setAttr('#es-emaA', 'points', '');
        setAttr('#es-emaB', 'points', '');
        setAttr('#es-correct', 'points', toPolyline(correct));
        setAttr('#es-wrong', 'points', toPolyline(wrong));
        setAttr('#es-dropout-rect', 'x', String(toX(DROPOUT_START)));
        setAttr('#es-dropout-rect', 'width', String(toX(DROPOUT_END) - toX(DROPOUT_START)));
        setAttr('#es-dropout-rect', 'height', String(CHART_H));
        const maxDiff = Math.max(...correct.map((v, i) => Math.abs(v - wrong[i])));
        const el = this.shadowRoot?.querySelector('#es-dropout-verdict') as HTMLElement;
        if (el) el.textContent = `미검출 구간(회색 띠) 동안: 올바른 방식(초록, 마지막 값 유지)은 안정적, 잘못된 방식(빨강, 0으로 리셋)은 최대 ${maxDiff.toFixed(1)}px까지 요동침`;
        const setText2 = (sel: string, text: string) => { const e2 = this.shadowRoot?.querySelector(sel) as HTMLElement; if (e2) e2.textContent = text; };
        setText2('#es-lag-a', '');
        setText2('#es-lag-b', '');
        return;
      }

      setAttr('#es-correct', 'points', '');
      setAttr('#es-wrong', 'points', '');
      setAttr('#es-dropout-rect', 'width', '0');
      const verdictEl = this.shadowRoot?.querySelector('#es-dropout-verdict') as HTMLElement;
      if (verdictEl) verdictEl.textContent = '';
      setAttr('#es-raw', 'points', toPolyline(raw));
      setAttr('#es-emaA', 'points', toPolyline(emaA));
      setAttr('#es-emaB', 'points', toPolyline(emaB));

      // 지연 측정: 점프 이후 목표값의 95%에 도달하는 데 걸리는 샘플 수
      const settleTime = (ema: number[]) => {
        const target = JUMP_VAL;
        const threshold = BASE_VAL + (target - BASE_VAL) * 0.95;
        for (let i = JUMP_AT; i < ema.length; i++) {
          if (ema[i] >= threshold) return i - JUMP_AT;
        }
        return ema.length - JUMP_AT;
      };

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#es-alpha-val', this.alpha.toFixed(2));
      setText('#es-lag-a', `α=${this.alpha.toFixed(2)}: 새 위치 95% 도달까지 ${settleTime(emaA)}프레임`);
      setText('#es-lag-b', `α=${this.refAlpha.toFixed(2)}(비교): ${settleTime(emaB)}프레임`);
    }

    @addEventListener('#es-alpha', 'input')
    onAlpha(e: Event) { this.alpha = Number((e.target as HTMLInputElement).value) || 0.01; this.refresh(); }

    @addEventListener('#es-dropout', 'change')
    onDropoutToggle(e: Event) { this.dropoutSim = (e.target as HTMLInputElement).checked; this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:45px; text-align:right; color:#1e293b; }
          svg { display:block; width:100%; max-width:${CHART_W}px; margin:12px auto; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
          .es-legend { display:flex; gap:14px; justify-content:center; font-size:11px; color:#64748b; margin-top:4px; flex-wrap:wrap; }
          .es-lag { font-size:12px; font-weight:700; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:6px 12px; margin-top:6px; text-align:center; }
          .es-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .es-intro b { color:#0369a1; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="es-intro">
          컨투어로 구한 중심 좌표는 프레임마다 몇 픽셀씩 떨립니다(마스크 경계가 살짝씩 흔들리기 때문). <b>EMA(지수이동평균)</b>로 과거 값과 섞어서 부드럽게 만드는데, 너무 많이 섞으면(α 작음) 떨림은 잘 지워지지만 물체가 진짜로 움직였을 때 따라가는 게 느려집니다 — 이 트레이드오프를 직접 조절해보세요.
        </div>

        <div class="math-desc">공이 6초 지점에서 갑자기 옮겨진 상황입니다. α를 바꿔가며 떨림 제거와 반응 속도의 균형을 확인해보세요.</div>

        <div class="ctl"><label>α (민감도) <input id="es-alpha" type="range" min="0.05" max="0.9" step="0.05" value="${this.alpha}"><b id="es-alpha-val">${this.alpha.toFixed(2)}</b></label></div>
        <div class="ctl"><label><input id="es-dropout" type="checkbox"> 미검출 구간 시뮬레이션(올바른 처리 vs 잘못된 처리)</label></div>

        <svg viewBox="0 0 ${CHART_W} ${CHART_H}">
          <rect id="es-dropout-rect" x="0" y="0" width="0" height="${CHART_H}" fill="#e2e8f0"/>
          <line id="es-jumpline" x1="0" y1="0" x2="0" y2="${CHART_H}" stroke="#fca5a5" stroke-width="1.5" stroke-dasharray="4,3"/>
          <polyline id="es-raw" points="" fill="none" stroke="#cbd5e1" stroke-width="1.3"/>
          <polyline id="es-emaB" points="" fill="none" stroke="#f59e0b" stroke-width="2"/>
          <polyline id="es-emaA" points="" fill="none" stroke="#16a34a" stroke-width="2.2"/>
          <polyline id="es-correct" points="" fill="none" stroke="#16a34a" stroke-width="2.2"/>
          <polyline id="es-wrong" points="" fill="none" stroke="#dc2626" stroke-width="2.2"/>
        </svg>
        <div class="es-legend">
          <span><span style="color:#cbd5e1">—</span> 원시값(떨림)</span>
          <span><span style="color:#16a34a">—</span> EMA(α, 슬라이더) / 올바른 처리(carry)</span>
          <span><span style="color:#f59e0b">—</span> EMA(α=0.1, 비교)</span>
          <span><span style="color:#dc2626">—</span> 잘못된 처리(0 리셋)</span>
        </div>

        <div class="es-lag" id="es-lag-a"></div>
        <div class="es-lag" id="es-lag-b"></div>
        <div class="es-lag" id="es-dropout-verdict"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
