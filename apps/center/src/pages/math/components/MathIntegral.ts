import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-integral';

const MD = `
## 적분(integral)이란?
- 함수 f(x)와 x축 사이의 **넓이(부호 있음, signed area)**를 구하는 것입니다. f(x)<0인 구간은 음수로 셉니다.
- **가장 쉬운 경우 — x, y가 모두 양수일 때**: \`p(x)=x²\`(포물선)는 x=0부터 시작해서 **항상 양수이면서 계속 증가**하는 곡선입니다(아래 두 번째 예제의 \`f(x)=x³/3-x\`는 0 근처에서 음수라 여기엔 못 씁니다). x=0부터 보면 부호 걱정 없이 순수하게 "곡선 아래 넓이 구하기"입니다.
- **리만 합(Riemann sum, 직사각형)**: [a,b] 구간을 N개의 작은 직사각형으로 잘라, 각 직사각형의 넓이(높이×폭)를 모두 더해서 넓이를 근사합니다: \`Σ p(xᵢ)·Δx\` — 직사각형은 윗변이 평평(왼쪽 높이로 고정)해서, 곡선이 휘어 있으면 한쪽은 남고 한쪽은 모자랍니다.
- **사다리꼴 공식(trapezoidal rule)**: 직사각형 대신 **윗변을 p(x₀)에서 p(x₁)까지 직선으로 이어서** 자르면, \`Σ (p(xᵢ)+p(xᵢ₊₁))/2·Δx\`가 됩니다. p(x)가 곡선(직선이 아님)이라 사다리꼴도 완벽하진 않지만, 대체로 직사각형보다 오차가 작습니다 — 아래 ①에서 "직사각형/사다리꼴" 버튼으로 같은 N에서 어느 쪽 오차가 더 작은지 직접 비교해 보세요.
- N을 늘릴수록(직사각형이 얇아질수록) 근사값이 실제 넓이에 다가갑니다 — 그 극한이 **적분** \`∫[a,b] p(x)dx\` 입니다.
- **미적분의 기본정리(FTC)**: p(x)의 원함수 \`P(x)=x³/3\`을 알면, 직사각형을 일일이 더할 필요 없이 그냥 \`P(b)-P(0)\`로 한 번에 계산됩니다(\`P'(x)=p(x)\`, 미분의 반대 방향) — ①에서도 이 P로 "진짜 정답"을 구해서 두 근사법의 오차와 비교합니다.
- **"실제값"은 어떻게 정확히 아나요?**: P(x)=x³/3을 **미분**해보면 \`d/dx(x³/3)=x²=p(x)\`와 정확히 같습니다 — 이게 P가 p의 원함수라는 증명입니다. 게다가 p(x)=x²의 리만합은 \`Σi²=(N-1)N(2N-1)/6\`라는 잘 알려진 공식 덕분에 **닫힌 식으로 정확히 계산**됩니다: \`Σp(xᵢ)Δx = b³·(N-1)(2N-1)/(6N²)\`. N→∞로 보내면 이 계수가 정확히 **1/3**로 수렴하니(대수적으로 증명 가능), 리만합의 극한이 정확히 b³/3이라는 게 근사가 아니라 **식으로 증명**됩니다. 아래에서 직접 확인해 보세요.
- 아래 두 번째(일반) 예제의 \`f(x)=x³/3-x\`는 원함수가 \`F(x)=x⁴/12-x²/2\`입니다 — 이번엔 f(x)가 음수인 구간도 있어서, 넓이에도 **부호**가 생깁니다.
- 아래 그래프에서 F(x)가 a에서 b로 가는 동안 "얼마나 올라갔는지"(F(b)-F(a))가 바로 위 그래프의 넓이와 정확히 같습니다.
- **어디에 쓰이나요?** — 속도를 적분하면 이동거리, 가속도를 적분하면 속도(로봇 센서 데이터 적산), PID의 I항(오차를 적분), 확률분포의 넓이(확률 계산).
`;

function f(x: number) { return (x * x * x) / 3 - x; }
function F(x: number) { return Math.pow(x, 4) / 12 - (x * x) / 2; }

// x=0부터 항상 양수·항상 증가하는 곡선 (f(x)=x³/3-x는 0 근처에서 음수라 여기엔 못 씀)
function p(x: number) { return x * x; }
function P(x: number) { return (x * x * x) / 3; }

function curveStr(fn: (x: number) => number, xMin: number, xMax: number, n = 80) {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xMin + ((xMax - xMin) * i) / n;
    pts.push(`${x.toFixed(3)},${fn(x).toFixed(4)}`);
  }
  return pts.join(' ');
}

const X_MIN = -2.6, X_MAX = 2.6;
const MAX_RECTS = 60;
const MAX_RECTS2 = 40;

function riemannRects(fn: (x: number) => number, a: number, b: number, N: number) {
  const dx = (b - a) / N;
  const rects: { pts: string; sign: 1 | -1 }[] = [];
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const x0 = a + i * dx, x1 = x0 + dx;
    const h = fn(x0);
    sum += h * dx;
    rects.push({ pts: `${x0.toFixed(3)},0 ${x1.toFixed(3)},0 ${x1.toFixed(3)},${h.toFixed(4)} ${x0.toFixed(3)},${h.toFixed(4)}`, sign: h >= 0 ? 1 : -1 });
  }
  return { rects, sum };
}

/** 사다리꼴 공식 — 윗변을 f(x0)→f(x1)로 선형(직선)으로 이어서 자름 */
function trapezoidRects(fn: (x: number) => number, a: number, b: number, N: number) {
  const dx = (b - a) / N;
  const rects: { pts: string; sign: 1 | -1 }[] = [];
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const x0 = a + i * dx, x1 = x0 + dx;
    const h0 = fn(x0), h1 = fn(x1);
    sum += ((h0 + h1) / 2) * dx;
    rects.push({ pts: `${x0.toFixed(3)},0 ${x1.toFixed(3)},0 ${x1.toFixed(3)},${h1.toFixed(4)} ${x0.toFixed(3)},${h0.toFixed(4)}`, sign: h0 + h1 >= 0 ? 1 : -1 });
  }
  return { rects, sum };
}

function rectColor(sign: 1 | -1) {
  return sign > 0
    ? { color: '#f59e0b', fill: 'rgba(245,158,11,0.28)' }
    : { color: '#3e63dd', fill: 'rgba(62,99,221,0.28)' };
}

/** 오차 영역(직사각형) — 평평한 윗변(h)과 곡선 사이의 틈. 곡선이 h와 만나는 x0에서 폭 0으로 시작해 x1에서 벌어짐. */
function errorLensRect(fn: (x: number) => number, x0: number, x1: number, h: number, sub = 6): string {
  const pts: string[] = [`${x0.toFixed(4)},${h.toFixed(4)}`, `${x1.toFixed(4)},${h.toFixed(4)}`];
  for (let i = 0; i <= sub; i++) {
    const x = x1 - (x1 - x0) * (i / sub);
    pts.push(`${x.toFixed(4)},${fn(x).toFixed(4)}`);
  }
  return pts.join(' ');
}

/** 오차 영역(사다리꼴) — 곡선과 직선 윗변(현) 사이의 틈. 양끝(x0,x1)에서 곡선과 현이 만나 폭 0. */
function errorLensTrap(fn: (x: number) => number, x0: number, x1: number, sub = 6): string {
  const pts: string[] = [];
  for (let i = 0; i <= sub; i++) {
    const x = x0 + (x1 - x0) * (i / sub);
    pts.push(`${x.toFixed(4)},${fn(x).toFixed(4)}`);
  }
  return pts.join(' ');
}

/** 근사 넓이만 필요할 때(오차-N 수렴 그래프용) — 조각 도형을 만들지 않는 가벼운 버전 */
function riemannSum(fn: (x: number) => number, a: number, b: number, N: number): number {
  const dx = (b - a) / N;
  let sum = 0;
  for (let i = 0; i < N; i++) sum += fn(a + i * dx) * dx;
  return sum;
}
function trapSum(fn: (x: number) => number, a: number, b: number, N: number): number {
  const dx = (b - a) / N;
  let sum = 0;
  for (let i = 0; i < N; i++) { const x0 = a + i * dx, x1 = x0 + dx; sum += ((fn(x0) + fn(x1)) / 2) * dx; }
  return sum;
}

/** N=1..nMax 각각에 대한 |근사값-실제값| 오차 목록 (직사각형/사다리꼴 수렴 비교 차트용) */
function errorByN(fn: (x: number) => number, trueVal: number, a: number, b: number, nMax: number, isTrap: boolean): number[] {
  const out: number[] = [];
  for (let N = 1; N <= nMax; N++) out.push(Math.abs((isTrap ? trapSum(fn, a, b, N) : riemannSum(fn, a, b, N)) - trueVal));
  return out;
}

/** Σi²=(N-1)N(2N-1)/6 공식으로 유도한, p(x)=x²의 [0,b] 리만합 계수 — N→∞이면 정확히 1/3로 수렴(증명 가능) */
function sumSquaresCoef(N: number): number { return ((N - 1) * (2 * N - 1)) / (6 * N * N); }

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathIntegral extends w.HTMLElement {
    private a = -1;
    private b = 2;
    private n = 12;
    private simpleB = 2;
    private simpleN = 8;
    private method: 'rect' | 'trap' = 'rect';

    private refresh() {
      const { a, b, n, simpleB, simpleN, method } = this;

      // ① 가장 쉬운 경우: x,y 모두 양수 — p(x)=x², x=0부터 시작
      const { rects: rectsS, sum: sumS } = method === 'trap' ? trapezoidRects(p, 0, simpleB, simpleN) : riemannRects(p, 0, simpleB, simpleN);
      const trueValS = P(simpleB) - P(0);
      const errS = Math.abs(sumS - trueValS);
      const methodLabel = method === 'trap' ? '사다리꼴' : '직사각형';
      const appliedS = this.shadowRoot?.querySelector('#int-simple-applied') as HTMLElement;
      if (appliedS) appliedS.textContent = `적용: [0, ${simpleB.toFixed(1)}], N=${simpleN}, ${methodLabel} → 근사 넓이 = ${sumS.toFixed(4)}, 실제 적분 = ${trueValS.toFixed(4)}, 오차 = ${errS.toExponential(2)}`;
      const notesS = this.shadowRoot?.querySelector('#int-simple-notes') as HTMLElement;
      if (notesS) notesS.innerHTML =
        `<div>${methodLabel} 근사 넓이 = ${sumS.toFixed(4)} (조각 ${simpleN}개)</div>` +
        `<div>P(b)-P(0) = ${simpleB.toFixed(1)}³/3 - 0 = ${trueValS.toFixed(4)} (실제 적분값)</div>` +
        `<div>오차 = ${errS.toExponential(2)} — ${method === 'trap' ? '사다리꼴은 곡선의 기울기를 따라가서 보통 직사각형보다 오차가 작습니다' : '직사각형은 윗변이 평평해서 곡선과의 틈이 남습니다 — 사다리꼴로 바꾸거나 N을 늘려보세요'}</div>`;
      const methodBtns = this.shadowRoot?.querySelectorAll('.int-method-btn');
      methodBtns?.forEach(btn => btn.classList.toggle('active', (btn as HTMLElement).dataset.method === method));
      const bValS = this.shadowRoot?.querySelector('#int-simple-b-val') as HTMLElement;
      if (bValS) bValS.textContent = simpleB.toFixed(1);
      const nValS = this.shadowRoot?.querySelector('#int-simple-n-val') as HTMLElement;
      if (nValS) nValS.textContent = String(simpleN);
      for (let i = 0; i < MAX_RECTS2; i++) {
        const el = this.shadowRoot?.querySelector(`#int-simple-rect-${i}`) as HTMLElement;
        if (!el) continue;
        if (i < rectsS.length) {
          const { color, fill } = rectColor(rectsS[i].sign);
          el.setAttribute('points', rectsS[i].pts);
          el.setAttribute('color', color);
          el.setAttribute('fill', fill);
        } else {
          el.setAttribute('points', '0,0 0,0 0,0 0,0');
        }
      }
      // 오차 영역(근사 조각과 곡선 사이의 틈) — 빨간 빗금으로 표시
      const dxS = simpleB / simpleN;
      for (let i = 0; i < MAX_RECTS2; i++) {
        const el = this.shadowRoot?.querySelector(`#int-simple-err-${i}`) as HTMLElement;
        if (!el) continue;
        if (i < simpleN) {
          const x0 = i * dxS, x1 = x0 + dxS;
          el.setAttribute('points', method === 'trap' ? errorLensTrap(p, x0, x1) : errorLensRect(p, x0, x1, p(x0)));
        } else {
          el.setAttribute('points', '0,0 0,0');
        }
      }
      // 오차-N 수렴 그래프 (같은 b, N=1..MAX_RECTS2)
      const errRectCurve = errorByN(p, trueValS, 0, simpleB, MAX_RECTS2, false);
      const errTrapCurve = errorByN(p, trueValS, 0, simpleB, MAX_RECTS2, true);
      const errChartEl = this.shadowRoot?.querySelector('#int-err-chart') as HTMLElement;
      if (errChartEl) errChartEl.setAttribute('y-max', String((Math.max(...errRectCurve, ...errTrapCurve) * 1.1) || 1));
      const errCurveRectEl = this.shadowRoot?.querySelector('#int-err-curve-rect') as HTMLElement;
      if (errCurveRectEl) errCurveRectEl.setAttribute('points', errRectCurve.map((e, i) => `${i + 1},${e.toFixed(5)}`).join(' '));
      const errCurveTrapEl = this.shadowRoot?.querySelector('#int-err-curve-trap') as HTMLElement;
      if (errCurveTrapEl) errCurveTrapEl.setAttribute('points', errTrapCurve.map((e, i) => `${i + 1},${e.toFixed(5)}`).join(' '));
      const errMarkerEl = this.shadowRoot?.querySelector('#int-err-marker') as HTMLElement;
      if (errMarkerEl) { errMarkerEl.setAttribute('x', String(simpleN)); errMarkerEl.setAttribute('y', errS.toFixed(5)); errMarkerEl.setAttribute('label', `N=${simpleN}: ${errS.toExponential(2)}`); }

      // Σi² 공식으로 "리만합의 극한 = b³/3"을 직접 증명
      const coef = sumSquaresCoef(simpleN);
      const closedFormSum = simpleB ** 3 * coef;
      const proofApplied = this.shadowRoot?.querySelector('#int-proof-applied') as HTMLElement;
      if (proofApplied) proofApplied.textContent = `적용: N=${simpleN} → 계수 (N-1)(2N-1)/(6N²) = ${coef.toFixed(6)}, 닫힌식 = b³×계수 = ${closedFormSum.toFixed(6)} (직접 합산한 리만합과 정확히 같음)`;
      const proofNotes = this.shadowRoot?.querySelector('#int-proof-notes') as HTMLElement;
      if (proofNotes) proofNotes.innerHTML =
        `<div>Σᵢ₌₀^(N-1) i² = (N-1)N(2N-1)/6 공식 그대로 대입 → 리만합 = b³(N-1)(2N-1)/(6N²)</div>` +
        `<div>계수 = ${coef.toFixed(6)} (N→∞이면 정확히 1/3=${(1 / 3).toFixed(6)}로 수렴)</div>` +
        `<div>${Math.abs(coef - 1 / 3) < 0.001 ? '거의 1/3에 도달 — b³/3과 사실상 같아졌습니다' : 'N을 늘려서 이 계수가 1/3에 가까워지는 걸 확인해 보세요'}</div>`;
      const proofCurveEl = this.shadowRoot?.querySelector('#int-proof-curve') as HTMLElement;
      if (proofCurveEl) proofCurveEl.setAttribute('points', Array.from({ length: MAX_RECTS2 }, (_, i) => `${i + 1},${sumSquaresCoef(i + 1).toFixed(6)}`).join(' '));
      const proofMarkerEl = this.shadowRoot?.querySelector('#int-proof-marker') as HTMLElement;
      if (proofMarkerEl) { proofMarkerEl.setAttribute('x', String(simpleN)); proofMarkerEl.setAttribute('y', coef.toFixed(6)); proofMarkerEl.setAttribute('label', `N=${simpleN}: ${coef.toFixed(4)}`); }

      // ② 일반적인 경우: 부호 있는 넓이
      const { rects, sum } = riemannRects(f, a, b, n);
      const trueVal = F(b) - F(a);
      const err = Math.abs(sum - trueVal);

      const applied = this.shadowRoot?.querySelector('#int-applied') as HTMLElement;
      if (applied) applied.textContent = `적용: [a,b]=[${a.toFixed(1)}, ${b.toFixed(1)}], N=${n} → 리만합 = ${sum.toFixed(4)}, 실제 적분 = ${trueVal.toFixed(4)}, 오차 = ${err.toExponential(2)}`;

      const notes = this.shadowRoot?.querySelector('#int-notes') as HTMLElement;
      if (notes) notes.innerHTML = `<div>리만합 Σf(xᵢ)·Δx = ${sum.toFixed(4)} (직사각형 ${n}개)</div>` +
        `<div>F(b)-F(a) = F(${b.toFixed(1)})-F(${a.toFixed(1)}) = ${F(b).toFixed(3)} - ${F(a).toFixed(3)} = ${trueVal.toFixed(4)}</div>` +
        `<div>${err < 0.01 ? 'N이 충분히 커서 리만합이 실제 적분과 거의 같습니다' : 'N을 늘리면 리만합이 실제 적분에 더 가까워집니다'}</div>`;

      (['a', 'b', 'n'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#int-${k}-val`) as HTMLElement;
        if (el) el.textContent = k === 'n' ? String(this.n) : this[k].toFixed(1);
      });

      for (let i = 0; i < MAX_RECTS; i++) {
        const el = this.shadowRoot?.querySelector(`#int-rect-${i}`) as HTMLElement;
        if (!el) continue;
        if (i < rects.length) {
          const { color, fill } = rectColor(rects[i].sign);
          el.setAttribute('points', rects[i].pts);
          el.setAttribute('color', color);
          el.setAttribute('fill', fill);
        } else {
          el.setAttribute('points', '0,0 0,0 0,0 0,0');
        }
      }

      const fMarkA = this.shadowRoot?.querySelector('#int-Fa') as HTMLElement;
      if (fMarkA) { fMarkA.setAttribute('x', a.toFixed(3)); fMarkA.setAttribute('y', F(a).toFixed(4)); }
      const fMarkB = this.shadowRoot?.querySelector('#int-Fb') as HTMLElement;
      if (fMarkB) { fMarkB.setAttribute('x', b.toFixed(3)); fMarkB.setAttribute('y', F(b).toFixed(4)); }
      const rise = this.shadowRoot?.querySelector('#int-rise') as HTMLElement;
      if (rise) rise.setAttribute('points', `${a.toFixed(3)},${F(a).toFixed(4)} ${a.toFixed(3)},${F(b).toFixed(4)} ${b.toFixed(3)},${F(b).toFixed(4)}`);
    }

    @addEventListener('#int-a', 'input')
    onA(e: Event) { this.a = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#int-b', 'input')
    onB(e: Event) { this.b = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#int-n', 'input')
    onN(e: Event) { this.n = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('#int-simple-b', 'input')
    onSimpleB(e: Event) { this.simpleB = Number((e.target as HTMLInputElement).value) || 0.1; this.refresh(); }
    @addEventListener('#int-simple-n', 'input')
    onSimpleN(e: Event) { this.simpleN = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('.int-method-btn', 'click', { delegate: true })
    onMethod(e: Event) {
      const btn = (e.target as HTMLElement).closest('.int-method-btn') as HTMLElement;
      const m = btn?.dataset.method as 'rect' | 'trap' | undefined;
      if (!m || m === this.method) return;
      this.method = m;
      this.refresh();
    }

    @onConnectedBodyShadow
    render() {
      const { a, b, n, simpleB, simpleN, method } = this;

      const { rects: rectsS, sum: sumS } = method === 'trap' ? trapezoidRects(p, 0, simpleB, simpleN) : riemannRects(p, 0, simpleB, simpleN);
      const trueValS = P(simpleB) - P(0);
      const errS = Math.abs(sumS - trueValS);
      const methodLabel = method === 'trap' ? '사다리꼴' : '직사각형';
      const rectTagsS = Array.from({ length: MAX_RECTS2 }, (_, i) => {
        if (i < rectsS.length) {
          const { color, fill } = rectColor(rectsS[i].sign);
          return `<polygon id="int-simple-rect-${i}" points="${rectsS[i].pts}" color="${color}" fill="${fill}" width="1"></polygon>`;
        }
        return `<polygon id="int-simple-rect-${i}" points="0,0 0,0 0,0 0,0"></polygon>`;
      }).join('\n          ');
      const dxS = simpleB / simpleN;
      const errTagsS = Array.from({ length: MAX_RECTS2 }, (_, i) => {
        if (i < simpleN) {
          const x0 = i * dxS, x1 = x0 + dxS;
          const pts = method === 'trap' ? errorLensTrap(p, x0, x1) : errorLensRect(p, x0, x1, p(x0));
          return `<polygon id="int-simple-err-${i}" points="${pts}" color="#ef4444" fill="rgba(239,68,68,0.35)" width="1"></polygon>`;
        }
        return `<polygon id="int-simple-err-${i}" points="0,0 0,0"></polygon>`;
      }).join('\n          ');
      const errRectCurve = errorByN(p, trueValS, 0, simpleB, MAX_RECTS2, false);
      const errTrapCurve = errorByN(p, trueValS, 0, simpleB, MAX_RECTS2, true);
      const errYMax = Math.max(...errRectCurve, ...errTrapCurve) * 1.1 || 1;
      const coef = sumSquaresCoef(simpleN);
      const closedFormSum = simpleB ** 3 * coef;
      const proofCurve = Array.from({ length: MAX_RECTS2 }, (_, i) => sumSquaresCoef(i + 1));

      const { rects, sum } = riemannRects(f, a, b, n);
      const trueVal = F(b) - F(a);
      const err = Math.abs(sum - trueVal);
      const rectTags = Array.from({ length: MAX_RECTS }, (_, i) => {
        if (i < rects.length) {
          const { color, fill } = rectColor(rects[i].sign);
          return `<polygon id="int-rect-${i}" points="${rects[i].pts}" color="${color}" fill="${fill}" width="1"></polygon>`;
        }
        return `<polygon id="int-rect-${i}" points="0,0 0,0 0,0 0,0"></polygon>`;
      }).join('\n          ');
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
          .ctl b { min-width:44px; text-align:right; color:#1e293b; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .int-method-btn { padding:5px 13px; border-radius:20px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:12px; font-weight:600; cursor:pointer; }
          .int-method-btn:hover { border-color:#94a3b8; color:#334155; }
          .int-method-btn.active { background:#6366f1; color:#fff; border-color:transparent; }
        </style>
        <div class="math-title">① 가장 쉬운 경우 — x, y 모두 양수 (p(x)=x², x=0부터)</div>
        <div class="math-formula">x=0부터 p(x)는 항상 양수이고 계속 증가함 — 곡선 아래 넓이를 직사각형/사다리꼴로 근사</div>
        <div class="math-applied" id="int-simple-applied">적용: [0, ${simpleB.toFixed(1)}], N=${simpleN}, ${methodLabel} → 근사 넓이 = ${sumS.toFixed(4)}, 실제 적분 = ${trueValS.toFixed(4)}, 오차 = ${errS.toExponential(2)}</div>
        <div class="math-desc">x=0부터 p(x)=x²는 항상 x축 위에서 계속 올라갑니다(x,y 둘 다 양수) — 부호 걱정 없는 순수한 넓이입니다. "직사각형(평평한 윗변)"과 "사다리꼴(p를 따라 선형으로 올라가는 윗변)"을 버튼으로 바꿔가며 같은 N에서 오차를 비교해 보세요.</div>
        <div class="ctl"><span>근사 방법</span>
          <button class="int-method-btn${method === 'rect' ? ' active' : ''}" data-method="rect" type="button">직사각형(평평)</button>
          <button class="int-method-btn${method === 'trap' ? ' active' : ''}" data-method="trap" type="button">사다리꼴(선형)</button>
        </div>
        <cartesian-chart x-min="0" x-max="${X_MAX}" y-min="0" y-max="${(X_MAX * X_MAX).toFixed(1)}" x-label="x" y-label="p(x)=x²" style="height:200px">
          <series points="${curveStr(p, 0, X_MAX)}" color="#1e293b" width="2"></series>
          ${rectTagsS}
          ${errTagsS}
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#1e293b">— p(x)=x²</b></span><span><b style="color:#f59e0b">■ ${methodLabel} 조각(근사)</b></span><span><b style="color:#ef4444">■ 오차(근사-실제 차이)</b></span></div>
        <div class="math-notes" id="int-simple-notes">
          <div>${methodLabel} 근사 넓이 = ${sumS.toFixed(4)} (조각 ${simpleN}개)</div>
          <div>P(b)-P(0) = ${simpleB.toFixed(1)}³/3 - 0 = ${trueValS.toFixed(4)} (실제 적분값)</div>
          <div>오차 = ${errS.toExponential(2)} — ${method === 'trap' ? '사다리꼴은 곡선의 기울기를 따라가서 보통 직사각형보다 오차가 작습니다' : '직사각형은 윗변이 평평해서 곡선과의 틈이 남습니다 — 사다리꼴로 바꾸거나 N을 늘려보세요'}</div>
        </div>
        <div class="ctl"><label>b (상한) <input id="int-simple-b" type="range" min="0.2" max="${X_MAX}" step="0.1" value="${simpleB}"><b id="int-simple-b-val">${simpleB.toFixed(1)}</b></label></div>
        <div class="ctl"><label>N (조각 개수) <input id="int-simple-n" type="range" min="1" max="${MAX_RECTS2}" step="1" value="${simpleN}"><b id="int-simple-n-val">${simpleN}</b></label></div>

        <div class="math-title">오차란? — 근사 넓이와 실제 넓이의 차이</div>
        <div class="math-desc">위 그래프의 빨간 영역이 바로 "오차"입니다 — 조각(주황)이 곡선을 못 따라가서 남거나 모자란 부분이에요. 그 넓이가 곧 |근사값-실제값|입니다. 아래는 N을 1~${MAX_RECTS2}까지 바꿔가며 이 오차가 어떻게 줄어드는지 미리 계산해 둔 그래프입니다 — 지금 N 위치가 점으로 표시됩니다.</div>
        <cartesian-chart id="int-err-chart" x-min="1" x-max="${MAX_RECTS2}" y-min="0" y-max="${errYMax.toFixed(4)}" x-label="N (조각 개수)" y-label="오차(|근사-실제|)" disabled-aspect style="height:180px;max-width:640px;margin:0 auto">
          <series id="int-err-curve-rect" points="${errRectCurve.map((e, i) => `${i + 1},${e.toFixed(5)}`).join(' ')}" color="#f59e0b" width="2"></series>
          <series id="int-err-curve-trap" points="${errTrapCurve.map((e, i) => `${i + 1},${e.toFixed(5)}`).join(' ')}" color="#10b981" width="2"></series>
          <marker id="int-err-marker" x="${simpleN}" y="${errS.toFixed(5)}" color="${method === 'trap' ? '#10b981' : '#f59e0b'}" size="6" label="N=${simpleN}: ${errS.toExponential(2)}"></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#f59e0b">— 직사각형 오차</b></span><span><b style="color:#10b981">— 사다리꼴 오차</b></span><span><b style="color:#334155">● 지금 N·방법</b></span></div>

        <div class="math-title">"실제값"이 진짜 맞다는 증명 — Σi² 공식으로 직접 확인</div>
        <div class="math-formula">Σᵢ₌₀^(N-1) i² = (N-1)N(2N-1)/6 → 리만합 = b³·(N-1)(2N-1)/(6N²)</div>
        <div class="math-applied" id="int-proof-applied">적용: N=${simpleN} → 계수 (N-1)(2N-1)/(6N²) = ${coef.toFixed(6)}, 닫힌식 = b³×계수 = ${closedFormSum.toFixed(6)} (직접 합산한 리만합과 정확히 같음)</div>
        <div class="math-desc">직사각형을 하나하나 실제로 더하지 않고도, 이 유명한 "제곱수의 합" 공식만으로 리만합을 정확한 식 하나로 계산할 수 있습니다. N을 늘리면 이 식의 계수가 정확히 1/3에 다가가는 걸 대수적으로 확인하세요 — 이게 P(b)-P(0)=b³/3이 근사가 아니라 증명된 사실인 이유입니다.</div>
        <cartesian-chart x-min="1" x-max="${MAX_RECTS2}" y-min="0" y-max="0.4" x-label="N" y-label="(N-1)(2N-1)/(6N²)" disabled-aspect style="height:160px;max-width:640px;margin:0 auto">
          <series points="1,${(1 / 3).toFixed(6)} ${MAX_RECTS2},${(1 / 3).toFixed(6)}" color="#94a3b8" dash="4,4" label="1/3"></series>
          <series id="int-proof-curve" points="${proofCurve.map((c, i) => `${i + 1},${c.toFixed(6)}`).join(' ')}" color="#8b5cf6" width="2"></series>
          <marker id="int-proof-marker" x="${simpleN}" y="${coef.toFixed(6)}" color="#f59e0b" size="6" label="N=${simpleN}: ${coef.toFixed(4)}"></marker>
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#94a3b8">- - 1/3 (극한)</b></span><span><b style="color:#8b5cf6">— (N-1)(2N-1)/(6N²)</b></span></div>
        <div class="math-notes" id="int-proof-notes">
          <div>Σᵢ₌₀^(N-1) i² = (N-1)N(2N-1)/6 공식 그대로 대입 → 리만합 = b³(N-1)(2N-1)/(6N²)</div>
          <div>계수 = ${coef.toFixed(6)} (N→∞이면 정확히 1/3=${(1 / 3).toFixed(6)}로 수렴)</div>
          <div>${Math.abs(coef - 1 / 3) < 0.001 ? '거의 1/3에 도달 — b³/3과 사실상 같아졌습니다' : 'N을 늘려서 이 계수가 1/3에 가까워지는 걸 확인해 보세요'}</div>
        </div>

        <div class="math-title">② 일반적인 경우 — 넓이에 부호가 있을 때(음수 구간 포함)</div>
        <div class="math-formula">∫[a,b] f(x)dx ≈ 리만합 Σf(xᵢ)Δx → N→∞이면 실제 넓이(F(b)-F(a))</div>
        <div class="math-applied" id="int-applied">적용: [a,b]=[${a.toFixed(1)}, ${b.toFixed(1)}], N=${n} → 리만합 = ${sum.toFixed(4)}, 실제 적분 = ${trueVal.toFixed(4)}, 오차 = ${err.toExponential(2)}</div>
        <div class="math-desc">이번엔 f(x)가 음수인 구간도 있어서 넓이에도 부호가 생깁니다(주황=양수 넓이, 파랑=음수 넓이). N을 늘리면 리만합이 실제 적분에 다가갑니다.</div>
        <cartesian-chart x-min="${X_MIN}" x-max="${X_MAX}" y-min="-3" y-max="3" x-label="x" y-label="f(x)">
          <series points="${curveStr(f, X_MIN, X_MAX)}" color="#1e293b" width="2"></series>
          <series points="${X_MIN},0 ${X_MAX},0" color="#e2e8f0" dash="4,4"></series>
          ${rectTags}
        </cartesian-chart>
        <div class="math-legend"><span><b style="color:#1e293b">— f(x)</b></span><span><b style="color:#f59e0b">■ 양수 넓이</b></span><span><b style="color:#3e63dd">■ 음수 넓이</b></span></div>
        <div class="math-notes" id="int-notes">
          <div>리만합 Σf(xᵢ)·Δx = ${sum.toFixed(4)} (직사각형 ${n}개)</div>
          <div>F(b)-F(a) = F(${b.toFixed(1)})-F(${a.toFixed(1)}) = ${F(b).toFixed(3)} - ${F(a).toFixed(3)} = ${trueVal.toFixed(4)}</div>
          <div>${err < 0.01 ? 'N이 충분히 커서 리만합이 실제 적분과 거의 같습니다' : 'N을 늘리면 리만합이 실제 적분에 더 가까워집니다'}</div>
        </div>
        <div class="ctl"><label>a (하한) <input id="int-a" type="range" min="${X_MIN}" max="${X_MAX}" step="0.1" value="${a}"><b id="int-a-val">${a.toFixed(1)}</b></label></div>
        <div class="ctl"><label>b (상한) <input id="int-b" type="range" min="${X_MIN}" max="${X_MAX}" step="0.1" value="${b}"><b id="int-b-val">${b.toFixed(1)}</b></label></div>
        <div class="ctl"><label>N (직사각형 개수) <input id="int-n" type="range" min="1" max="60" step="1" value="${n}"><b id="int-n-val">${n}</b></label></div>

        <div class="math-title">원함수 F(x) = x⁴/12 - x²/2 (F(b)-F(a) = 위 그래프의 넓이)</div>
        <cartesian-chart x-min="${X_MIN}" x-max="${X_MAX}" y-min="-1" y-max="2.5" x-label="x" y-label="F(x)" style="height:200px">
          <series points="${curveStr(F, X_MIN, X_MAX)}" color="#8b5cf6" width="2"></series>
          <series id="int-rise" points="${a.toFixed(3)},${F(a).toFixed(4)} ${a.toFixed(3)},${F(b).toFixed(4)} ${b.toFixed(3)},${F(b).toFixed(4)}" color="#10b981" dash="4,3"></series>
          <marker id="int-Fa" x="${a}" y="${F(a).toFixed(4)}" color="#e5484d" size="5" label="F(a)"></marker>
          <marker id="int-Fb" x="${b}" y="${F(b).toFixed(4)}" color="#10b981" size="5" label="F(b)"></marker>
        </cartesian-chart>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
