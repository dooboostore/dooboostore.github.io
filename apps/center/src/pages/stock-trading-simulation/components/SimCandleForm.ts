import { elementDefine, changedAttribute, onConnectedBodyShadow, setPropertyShadow, eventShadow } from '@dooboostore/simple-web-component';

const tagName = 'sim-candle-form';

export interface SimCandleValues {
  count: number;
  timeframe: string;
  endDate: string;
  endTime: string;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  rsiPeriod: number;
  rsiOb: number;
  rsiOs: number;
}

const TF_RE = /^(min:\d+|day:1|week:1|month:1)$/;

/** 캔들 조회 + 보조지표 설정 폼 (자율 엘리먼트 + shadow DOM, 안쪽 네이티브 form).
 *  페이지에서는 <sim-candle-form id="sim-candle-form"> 으로 사용.
 *  입력은 name 식별 + FormData 수집. 종료일/일시 표시 전환은 내부에서 처리. */
export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class SimCandleForm extends w.HTMLElement {
    private _timeframe = '';

    private innerForm(): HTMLFormElement | null {
      return this.shadowRoot?.querySelector('form') as HTMLFormElement | null;
    }

    @changedAttribute('count', { type: Number })
    @setPropertyShadow('[name="count"]', 'value')
    onCountChanged(v: number) {
      return Number.isFinite(v) ? String(Math.max(30, Math.min(1000, Math.floor(v)))) : '360';
    }

    @changedAttribute('timeframe')
    @setPropertyShadow('[name="timeframe"]', 'value')
    onTimeframeChanged(v: string) {
      const t = TF_RE.test(v ?? '') ? v : 'day:1';
      this._timeframe = t;
      this.paintEndFields();
      return t;
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

    @eventShadow('form', 'submit')
    onInnerSubmit(e: Event) {
      // 안쪽 form submit은 막고 host에서 composed로 다시 쏨 (페이지 submit 핸들러용)
      e.preventDefault();
      e.stopPropagation();
      this.dispatchEvent(new w.CustomEvent('submit', { bubbles: true, composed: true, cancelable: true }));
    }

    /** 분봉이면 종료일시, 아니면 종료일 표시 */
    private paintEndFields(): void {
      const tf = this._timeframe || this.getAttribute('timeframe') || 'day:1';
      const isMin = tf.startsWith('min:');
      const dateField = this.shadowRoot?.querySelector('#sim-end-date-field') as HTMLElement | null;
      const dtField = this.shadowRoot?.querySelector('#sim-end-datetime-field') as HTMLElement | null;
      if (dateField) dateField.style.display = isMin ? 'none' : '';
      if (dtField) dtField.style.display = isMin ? '' : 'none';
    }

    private numAttr(name: string, fb: number): number {
      const v = Number(this.getAttribute(name));
      return Number.isFinite(v) ? v : fb;
    }

    @onConnectedBodyShadow
    render(): string {
      const tf = this._timeframe || this.getAttribute('timeframe') || 'day:1';
      const isMin = tf.startsWith('min:');
      const tfs: [string, string][] = [['min:1', '1분'], ['min:3', '3분'], ['min:5', '5분'], ['min:15', '15분'], ['min:30', '30분'], ['min:60', '60분'], ['day:1', '일봉'], ['week:1', '주봉'], ['month:1', '월봉']];
      return `
        <form>
        <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;padding:8px 14px;background:#fffbeb;border-top:1px solid #fef3c7">
          <div class="config-field" style="flex:1;min-width:90px"><label style="font-size:11px;font-weight:700;color:#64748b">캔들 수</label><input name="count" type="number" min="30" max="1000" value="${this.numAttr('count', 360)}" style="width:100%;height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff;box-sizing:border-box;font-size:16px;"/></div>
          <div class="config-field" style="flex:1;min-width:120px"><label style="font-size:11px;font-weight:700;color:#64748b">타임프레임</label><select name="timeframe" style="width:100%;height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff;box-sizing:border-box">${tfs.map(([v, l]) => `<option value="${v}"${v === tf ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="config-field" id="sim-end-date-field" style="flex:1;min-width:110px${isMin ? ';display:none' : ''}"><label style="font-size:11px;font-weight:700;color:#64748b">종료일 (비우면 최신)</label><input name="endDate" type="date" style="width:100%;height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff;box-sizing:border-box;"/></div>
          <div class="config-field" id="sim-end-datetime-field" style="flex:1;min-width:150px${isMin ? '' : ';display:none'}"><label style="font-size:11px;font-weight:700;color:#64748b">종료일시 (비우면 최신)</label><input name="endDatetime" type="datetime-local" step="60" style="width:100%;height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff;box-sizing:border-box;"/></div>
          <button type="submit" id="sim-reload-btn" style="height:32px;padding:0 14px;border-radius:999px;border:1px solid #f59e0b;background:#fff;color:#d97706;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;align-self:end">다시불러오기</button>
        </div>
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
    read(): SimCandleValues {
      const d = this.formData();
      const tf = TF_RE.test(d.timeframe ?? '') ? d.timeframe : 'day:1';
      const isMin = tf.startsWith('min:');
      const rawEnd = (isMin ? (d.endDatetime || '') : (d.endDate || '')).slice(0, isMin ? 16 : 10);
      return {
        count: this.num(d, 'count', 360),
        timeframe: tf,
        endDate: rawEnd.slice(0, 10),
        endTime: rawEnd.length > 10 ? rawEnd.slice(11, 16) : '',
        macdFast: this.num(d, 'macdFast', 12),
        macdSlow: this.num(d, 'macdSlow', 26),
        macdSignal: this.num(d, 'macdSignal', 9),
        rsiPeriod: this.num(d, 'rsiPeriod', 14),
        rsiOb: this.num(d, 'rsiOb', 70),
        rsiOs: this.num(d, 'rsiOs', 30),
      };
    }

    /** 값 쓰기 (부분 갱신, timeframe 변경 시 종료일시 표시도 갱신) — 렌더 전이면 어트리뷰트로 보관 */
    write(patch: Partial<SimCandleValues>): void {
      const mirror: [keyof SimCandleValues, string][] = [['count', 'count'], ['timeframe', 'timeframe'], ['macdFast', 'macd-fast'], ['macdSlow', 'macd-slow'], ['macdSignal', 'macd-signal'], ['rsiPeriod', 'rsi-period'], ['rsiOb', 'rsi-ob'], ['rsiOs', 'rsi-os']];
      for (const [key, attr] of mirror) {
        const v = patch[key];
        if (v != null && v !== '' && Number.isFinite(Number(v))) this.setAttribute(attr, String(v));
      }
      const form = this.innerForm();
      const set = (name: string, v: string | number | undefined, allowEmpty = false) => {
        if (!form) return;
        if (v == null || (!allowEmpty && v === '')) return;
        const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
        if (el && el.value !== String(v)) el.value = String(v);
      };
      if (patch.count != null && Number.isFinite(patch.count)) set('count', Math.floor(patch.count));
      if (patch.timeframe != null) {
        set('timeframe', patch.timeframe);
        this._timeframe = patch.timeframe;
        this.paintEndFields();
      }
      if (patch.endDate != null) set('endDate', patch.endDate, true);
      if (patch.endTime != null && patch.endDate) set('endDatetime', `${patch.endDate}T${patch.endTime}`, true);
      else if (patch.endTime != null) set('endDatetime', '', true);
      if (patch.macdFast != null) set('macdFast', patch.macdFast);
      if (patch.macdSlow != null) set('macdSlow', patch.macdSlow);
      if (patch.macdSignal != null) set('macdSignal', patch.macdSignal);
      if (patch.rsiPeriod != null) set('rsiPeriod', patch.rsiPeriod);
      if (patch.rsiOb != null) set('rsiOb', patch.rsiOb);
      if (patch.rsiOs != null) set('rsiOs', patch.rsiOs);
    }
    /** 폼 전체 값 (페이지 @property 바인딩용) — 개별 프로퍼티 대입 시 해당 항목만 적용 */
    get value(): SimCandleValues {
      const self = this;
      const def = (key: keyof SimCandleValues) => ({
        enumerable: true,
        get: () => self.read()[key],
        set: (v: number | string) => self.write({ [key]: v } as any),
      });
      return Object.defineProperties({}, {
        count: def('count'),
        timeframe: def('timeframe'),
        endDate: def('endDate'),
        endTime: def('endTime'),
        macdFast: def('macdFast'),
        macdSlow: def('macdSlow'),
        macdSignal: def('macdSignal'),
        rsiPeriod: def('rsiPeriod'),
        rsiOb: def('rsiOb'),
        rsiOs: def('rsiOs'),
      }) as SimCandleValues;
    }
    set value(v: Partial<SimCandleValues>) {
      this.write(v ?? {});
    }
  }

  return tagName;
};
