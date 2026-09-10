import { elementDefine, changedAttribute, onConnectedBodyShadow, setPropertyShadow, eventShadow } from '@dooboostore/simple-web-component';

const tagName = 'sim-indicator-form';

export interface SimIndicatorValues {
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  rsiPeriod: number;
  rsiOb: number;
  rsiOs: number;
  maShort: number;
  maMid: number;
  maLong: number;
  maExponential: boolean;
}

/** 보조지표 설정 폼 (자율 엘리먼트 + shadow DOM, 안쪽 네이티브 form).
 *  페이지에서는 <sim-indicator-form id="sim-indicators"> 으로 사용.
 *  입력은 name 식별 + FormData 수집. */
export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class SimIndicatorForm extends w.HTMLElement {
    private innerForm(): HTMLFormElement | null {
      return this.shadowRoot?.querySelector('form') as HTMLFormElement | null;
    }

    @changedAttribute('macd-fast', { type: Number })
    @setPropertyShadow('[name="macdFast"]', 'value')
    onMacdFastChanged(v: number) {
      return Number.isFinite(v) ? String(Math.max(2, Math.min(100, Math.floor(v)))) : '12';
    }

    @changedAttribute('macd-slow', { type: Number })
    @setPropertyShadow('[name="macdSlow"]', 'value')
    onMacdSlowChanged(v: number) {
      return Number.isFinite(v) ? String(Math.max(2, Math.min(200, Math.floor(v)))) : '26';
    }

    @changedAttribute('macd-signal', { type: Number })
    @setPropertyShadow('[name="macdSignal"]', 'value')
    onMacdSignalChanged(v: number) {
      return Number.isFinite(v) ? String(Math.max(2, Math.min(50, Math.floor(v)))) : '9';
    }

    @changedAttribute('rsi-period', { type: Number })
    @setPropertyShadow('[name="rsiPeriod"]', 'value')
    onRsiPeriodChanged(v: number) {
      return Number.isFinite(v) ? String(Math.max(2, Math.min(100, Math.floor(v)))) : '14';
    }

    @changedAttribute('rsi-ob', { type: Number })
    @setPropertyShadow('[name="rsiOb"]', 'value')
    onRsiObChanged(v: number) {
      return Number.isFinite(v) ? String(Math.max(50, Math.min(100, Math.floor(v)))) : '70';
    }

    @changedAttribute('rsi-os', { type: Number })
    @setPropertyShadow('[name="rsiOs"]', 'value')
    onRsiOsChanged(v: number) {
      return Number.isFinite(v) ? String(Math.max(0, Math.min(50, Math.floor(v)))) : '30';
    }

    @changedAttribute('ma-short', { type: Number })
    @setPropertyShadow('[name="maShort"]', 'value')
    onMaShortChanged(v: number) {
      return Number.isFinite(v) ? String(Math.max(2, Math.min(500, Math.floor(v)))) : '5';
    }

    @changedAttribute('ma-mid', { type: Number })
    @setPropertyShadow('[name="maMid"]', 'value')
    onMaMidChanged(v: number) {
      return Number.isFinite(v) ? String(Math.max(2, Math.min(500, Math.floor(v)))) : '10';
    }

    @changedAttribute('ma-long', { type: Number })
    @setPropertyShadow('[name="maLong"]', 'value')
    onMaLongChanged(v: number) {
      return Number.isFinite(v) ? String(Math.max(2, Math.min(500, Math.floor(v)))) : '40';
    }

    @changedAttribute('ma-exponential', { type: Boolean })
    @setPropertyShadow('[name="maExponential"]', 'checked')
    onMaExponentialChanged(v: boolean) {
      return !!v;
    }

    @eventShadow('form', 'submit')
    onInnerSubmit(e: Event) {
      // 안쪽 form submit은 막고 host에서 composed로 다시 쏨
      e.preventDefault();
      e.stopPropagation();
      this.dispatchEvent(new w.CustomEvent('submit', { bubbles: true, composed: true, cancelable: true }));
    }

    private numAttr(name: string, fb: number): number {
      const v = Number(this.getAttribute(name));
      return Number.isFinite(v) ? v : fb;
    }

    @onConnectedBodyShadow
    render(): string {
      return `
        <form>
        <div id="sim-indicators" style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 14px 10px;background:#fff;border-top:1px solid #f1f5f9">
          <div style="flex:1;min-width:200px;border:1px solid #fde68a;background:#fffdf5;border-radius:10px;padding:8px 10px">
            <div style="font-size:10px;font-weight:800;color:#92400e;margin-bottom:6px">MACD</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#64748b">단기<input name="macdFast" type="number" min="2" max="100" step="1" value="${this.numAttr('macd-fast', 12)}" style="width:52px;height:28px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;padding:0 6px" /></label>
              <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#64748b">장기<input name="macdSlow" type="number" min="2" max="200" step="1" value="${this.numAttr('macd-slow', 26)}" style="width:52px;height:28px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;padding:0 6px" /></label>
              <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#64748b">시그널<input name="macdSignal" type="number" min="2" max="50" step="1" value="${this.numAttr('macd-signal', 9)}" style="width:52px;height:28px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;padding:0 6px" /></label>
            </div>
          </div>
          <div style="flex:1;min-width:200px;border:1px solid #c4b5fd;background:#faf9ff;border-radius:10px;padding:8px 10px">
            <div style="font-size:10px;font-weight:800;color:#5b21b6;margin-bottom:6px">RSI</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#64748b">기간<input name="rsiPeriod" type="number" min="2" max="100" step="1" value="${this.numAttr('rsi-period', 14)}" style="width:52px;height:28px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;padding:0 6px" /></label>
              <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#64748b">과매수<input name="rsiOb" type="number" min="50" max="100" step="1" value="${this.numAttr('rsi-ob', 70)}" style="width:52px;height:28px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;padding:0 6px" /></label>
              <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#64748b">과매도<input name="rsiOs" type="number" min="0" max="50" step="1" value="${this.numAttr('rsi-os', 30)}" style="width:52px;height:28px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;padding:0 6px" /></label>
            </div>
          </div>
          <div style="flex:1;min-width:200px;border:1px solid #fbcfe8;background:#fff7fb;border-radius:10px;padding:8px 10px">
            <div style="font-size:10px;font-weight:800;color:#9d174d;margin-bottom:6px">이동평균</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#64748b">단기<input name="maShort" type="number" min="2" max="500" step="1" value="${this.numAttr('ma-short', 5)}" style="width:52px;height:28px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;padding:0 6px" /></label>
              <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#64748b">중기<input name="maMid" type="number" min="2" max="500" step="1" value="${this.numAttr('ma-mid', 10)}" style="width:52px;height:28px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;padding:0 6px" /></label>
              <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#64748b">장기<input name="maLong" type="number" min="2" max="500" step="1" value="${this.numAttr('ma-long', 40)}" style="width:52px;height:28px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;padding:0 6px" /></label>
              <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#64748b"><input name="maExponential" type="checkbox" ${this.getAttribute('ma-exponential') != null && this.getAttribute('ma-exponential') !== 'false' && this.getAttribute('ma-exponential') !== '0' ? 'checked' : ''} style="width:15px;height:15px;accent-color:#9d174d" />지수</label>
            </div>
          </div>
        </div>
        </form>
      `;
    }

    private formData(): Record<string, string> {
      const form = this.innerForm();
      const out: Record<string, string> = {};
      if (!form) return out;
      for (const [k, v] of new FormData(form).entries()) out[k] = String(v);
      return out;
    }

    private num(d: Record<string, string>, key: string, fb: number): number {
      const v = Number(d[key] ?? '');
      return Number.isFinite(v) ? v : fb;
    }

    /** 폼 값 읽기 (정규화 전 원시값) */
    read(): SimIndicatorValues {
      const d = this.formData();
      const form = this.innerForm();
      const expEl = form?.elements.namedItem('maExponential') as HTMLInputElement | null;
      return {
        macdFast: this.num(d, 'macdFast', 12),
        macdSlow: this.num(d, 'macdSlow', 26),
        macdSignal: this.num(d, 'macdSignal', 9),
        rsiPeriod: this.num(d, 'rsiPeriod', 14),
        rsiOb: this.num(d, 'rsiOb', 70),
        rsiOs: this.num(d, 'rsiOs', 30),
        maShort: this.num(d, 'maShort', 5),
        maMid: this.num(d, 'maMid', 10),
        maLong: this.num(d, 'maLong', 60),
        maExponential: expEl ? expEl.checked : d['maExponential'] === 'on',
      };
    }

    /** 값 쓰기 (부분 갱신) — 렌더 전이면 어트리뷰트로 보관 */
    write(patch: Partial<SimIndicatorValues>): void {
      const mirror: [keyof SimIndicatorValues, string][] = [['macdFast', 'macd-fast'], ['macdSlow', 'macd-slow'], ['macdSignal', 'macd-signal'], ['rsiPeriod', 'rsi-period'], ['rsiOb', 'rsi-ob'], ['rsiOs', 'rsi-os'], ['maShort', 'ma-short'], ['maMid', 'ma-mid'], ['maLong', 'ma-long']];
      for (const [key, attr] of mirror) {
        const v = patch[key];
        if (v != null && Number.isFinite(Number(v))) this.setAttribute(attr, String(v));
      }
      if (patch.maExponential != null) {
        if (patch.maExponential) this.setAttribute('ma-exponential', '');
        else this.removeAttribute('ma-exponential');
      }
      const form = this.innerForm();
      const set = (name: string, v: number | undefined) => {
        if (!form) return;
        if (v == null || !Number.isFinite(v)) return;
        const el = form.elements.namedItem(name) as HTMLInputElement | null;
        if (el && el.value !== String(v)) el.value = String(v);
      };
      if (patch.macdFast != null) set('macdFast', patch.macdFast);
      if (patch.macdSlow != null) set('macdSlow', patch.macdSlow);
      if (patch.macdSignal != null) set('macdSignal', patch.macdSignal);
      if (patch.rsiPeriod != null) set('rsiPeriod', patch.rsiPeriod);
      if (patch.rsiOb != null) set('rsiOb', patch.rsiOb);
      if (patch.rsiOs != null) set('rsiOs', patch.rsiOs);
      if (patch.maShort != null) set('maShort', patch.maShort);
      if (patch.maMid != null) set('maMid', patch.maMid);
      if (patch.maLong != null) set('maLong', patch.maLong);
      if (patch.maExponential != null && form) {
        const el = form.elements.namedItem('maExponential') as HTMLInputElement | null;
        if (el) el.checked = !!patch.maExponential;
      }
    }
    /** 폼 전체 값 (페이지 @property 바인딩용) — 개별 프로퍼티 대입 시 해당 항목만 적용 */
    get value(): SimIndicatorValues {
      const self = this;
      const def = (key: keyof SimIndicatorValues) => ({
        enumerable: true,
        get: () => self.read()[key],
        set: (v: number | string | boolean) => self.write({ [key]: v } as any),
      });
      return Object.defineProperties({}, {
        macdFast: def('macdFast'),
        macdSlow: def('macdSlow'),
        macdSignal: def('macdSignal'),
        rsiPeriod: def('rsiPeriod'),
        rsiOb: def('rsiOb'),
        rsiOs: def('rsiOs'),
        maShort: def('maShort'),
        maMid: def('maMid'),
        maLong: def('maLong'),
        maExponential: def('maExponential'),
      }) as SimIndicatorValues;
    }
    set value(v: Partial<SimIndicatorValues>) {
      this.write(v ?? {});
    }
  }

  return tagName;
};
