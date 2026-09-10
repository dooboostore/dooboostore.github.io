import { elementDefine, changedAttribute, onConnectedBodyShadow, setPropertyShadow, eventShadow } from '@dooboostore/simple-web-component';

const tagName = 'sim-candle-form';

export interface SimCandleValues {
  count: number;
  timeframe: string;
  endDate: string;
  endTime: string;
}

const TF_RE = /^(min:\d+|day:1|week:1|month:1)$/;

/** 캔들 조회 폼 (자율 엘리먼트 + shadow DOM, 안쪽 네이티브 form).
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

    @eventShadow('form', 'submit')
    onInnerSubmit(e: Event) {
      // 안쪽 form submit은 막고 host에서 composed로 다시 쏨 (페이지 submit 핸들러용)
      e.preventDefault();
      e.stopPropagation();
      this.dispatchEvent(new w.CustomEvent('submit', { bubbles: true, composed: true, cancelable: true }));
    }

    @eventShadow('form', 'change')
    onInnerChange(e: Event) {
      // 안쪽 change도 host에서 composed로 다시 쏨 (페이지 change 핸들러용)
      e.stopPropagation();
      this.dispatchEvent(new w.CustomEvent('change', { bubbles: true, composed: true, cancelable: true }));
    }

    @eventShadow('form', 'input')
    onInnerInput(e: Event) {
      // 안쪽 input도 host에서 composed로 다시 쏨 (페이지 input 핸들러용)
      e.stopPropagation();
      this.dispatchEvent(new w.CustomEvent('input', { bubbles: true, composed: true, cancelable: true }));
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
      const curCount = String(this.numAttr('count', 300));
      const tfs: [string, string][] = [['min:1', '1분'], ['min:3', '3분'], ['min:5', '5분'], ['min:15', '15분'], ['min:30', '30분'], ['min:60', '60분'], ['day:1', '일봉'], ['week:1', '주봉'], ['month:1', '월봉']];
      return `
        <form onsubmit="return false">
        <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;padding:8px 14px;background:#fffbeb;border-top:1px solid #fef3c7">
          <div class="config-field" style="flex:1;min-width:90px"><label style="font-size:11px;font-weight:700;color:#64748b">캔들 수</label><select name="count" style="width:100%;height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff;box-sizing:border-box">${['300', '200', '100'].map(v => `<option value="${v}"${v === curCount ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="config-field" style="flex:1;min-width:120px"><label style="font-size:11px;font-weight:700;color:#64748b">타임프레임</label><select name="timeframe" style="width:100%;height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff;box-sizing:border-box">${tfs.map(([v, l]) => `<option value="${v}"${v === tf ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="config-field" id="sim-end-date-field" style="flex:1;min-width:110px${isMin ? ';display:none' : ''}"><label style="font-size:11px;font-weight:700;color:#64748b">종료일 (비우면 최신)</label><input name="endDate" type="date" style="width:100%;height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff;box-sizing:border-box;"/></div>
          <div class="config-field" id="sim-end-datetime-field" style="flex:1;min-width:150px${isMin ? '' : ';display:none'}"><label style="font-size:11px;font-weight:700;color:#64748b">종료일시 (비우면 최신)</label><input name="endDatetime" type="datetime-local" step="60" style="width:100%;height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff;box-sizing:border-box;"/></div>
          <button type="submit" id="sim-reload-btn" style="height:32px;padding:0 14px;border-radius:999px;border:1px solid #f59e0b;background:#fff;color:#d97706;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;align-self:end">다시불러오기</button>
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
      };
    }

    /** 값 쓰기 (부분 갱신, timeframe 변경 시 종료일시 표시도 갱신) — 렌더 전이면 어트리뷰트로 보관 */
    write(patch: Partial<SimCandleValues>): void {
      if (patch.count != null && Number.isFinite(Number(patch.count))) this.setAttribute('count', String(Math.floor(Number(patch.count))));
      if (patch.timeframe != null) this.setAttribute('timeframe', patch.timeframe);
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
      if (patch.endDate != null || patch.endTime != null) {
        // 날짜·시간은 합성해서 기록 (片方만 와도 기존값과 합성, 빈값 허용)
        const curDate = patch.endDate != null ? patch.endDate : (form.elements.namedItem('endDate') as HTMLInputElement | null)?.value ?? '';
        const curTime = patch.endTime != null ? patch.endTime : (form.elements.namedItem('endDatetime') as HTMLInputElement | null)?.value.slice(11, 16) ?? '';
        set('endDate', curDate, true);
        set('endDatetime', curDate ? `${curDate}T${curTime || '00:00'}` : '', true);
      }
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
      }) as SimCandleValues;
    }
    set value(v: Partial<SimCandleValues>) {
      this.write(v ?? {});
    }
  }

  return tagName;
};
