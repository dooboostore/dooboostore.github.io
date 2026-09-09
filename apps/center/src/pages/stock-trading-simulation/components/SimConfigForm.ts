import { elementDefine, changedAttribute, onConnectedBodyShadow, setPropertyShadow, eventShadow, property } from '@dooboostore/simple-web-component';

const tagName = 'sim-config-form';

export interface SimConfigValues {
  capital: number;
  fee: number;
  shares: number;
}

/** 투자 설정 폼 (자율 엘리먼트 + shadow DOM, 안쪽 네이티브 form).
 *  페이지에서는 <sim-config-form id="sim-config"> 으로 사용.
 *  입력은 name 식별 + FormData 수집. 입력 change/input은 composed 버블링.
 *  값 읽기/쓰기는 read()/write() API로 (shadow 경계 직접 조회 불가). */
export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class SimConfigForm extends w.HTMLElement {
    private defCapital = 0;
    private defFee = 0;
    private defShares = 0;

    @property('[name="capital"]', 'value', { root: 'shadow' })
    capital!: string;

    @property('[name="fee"]', 'value', { root: 'shadow' })
    fee!: string;

    @property('[name="shares"]', 'value', { root: 'shadow' })
    shares!: string;

    @property('[name="avg"]', 'value', { root: 'shadow' })
    avg!: string;

    private innerForm(): HTMLFormElement | null {
      return this.shadowRoot?.querySelector('form') as HTMLFormElement | null;
    }

    @changedAttribute('capital', { type: Number })
    @setPropertyShadow('[name="capital"]', 'value')
    onCapitalChanged(v: number) {
      if (Number.isFinite(v)) this.defCapital = v;
      return String(this.defCapital);
    }

    @changedAttribute('fee', { type: Number })
    @setPropertyShadow('[name="fee"]', 'value')
    onFeeChanged(v: number) {
      if (Number.isFinite(v)) this.defFee = v;
      return String(this.defFee);
    }

    @changedAttribute('shares', { type: Number })
    @setPropertyShadow('[name="shares"]', 'value')
    onSharesChanged(v: number) {
      if (Number.isFinite(v)) this.defShares = v;
      return String(this.defShares);
    }

    @changedAttribute('avg', { type: Number })
    @setPropertyShadow('[name="avg"]', 'value')
    onAvgChanged(v: number) {
      return Number.isFinite(v) ? String(v) : '0';
    }

    @eventShadow('form', 'submit')
    onInnerSubmit(e: Event) {
      // 안쪽 form submit은 막고 host에서 composed로 다시 쏨 (페이지 submit 핸들러용)
      e.preventDefault();
      e.stopPropagation();
      this.dispatchEvent(new w.CustomEvent('submit', { bubbles: true, composed: true, cancelable: true }));
    }

    @onConnectedBodyShadow
    render(): string {
      return `
        <style>
          .config-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
          @media(max-width:900px){ .config-grid{grid-template-columns:1fr 1fr} }
          @media(max-width:600px){ .config-grid{grid-template-columns:1fr} }
          .config-field{display:flex;flex-direction:column;gap:4px}
          .config-field label{font-size:11px;font-weight:700;color:#64748b}
          .config-field input{height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff}
          .config-field input:focus{border-color:#f59e0b}
        </style>
        <form>
        <div style="padding:12px 14px;display:flex;flex-direction:column;gap:12px">
          <div class="config-grid">
            <div class="config-field"><label>투자원금 (원)</label><input name="capital" type="number" min="100000" step="100000" value="${this.defCapital}" style="font-size: 16px;" /></div>
            <div class="config-field"><label>수수료 (%)</label><input name="fee" type="number" min="0" max="1" step="0.001" value="${this.defFee}" style="font-size: 16px;" /></div>
            <div class="config-field"><label>시작 보유 (주)</label><input name="shares" type="number" min="0" step="1" value="${this.defShares}" style="font-size: 16px;" /></div>
            <div class="config-field"><label>시작 평단 (원, 자동)</label><input name="avg" type="number" value="0" readonly tabindex="-1" style="font-size: 16px;background:#f1f5f9;color:#64748b;cursor:default;" /></div>
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

    private num(v: string, fb: number): number {
      const n = Number((v ?? '').replace(/,/g, ''));
      return Number.isFinite(n) ? n : fb;
    }

    /** 폼 값 읽기 (정규화 전 원시값) */
    read(): SimConfigValues & { avg: number } {
      return {
        capital: this.num(this.capital, this.defCapital),
        fee: this.num(this.fee, this.defFee),
        shares: this.num(this.shares, this.defShares),
        avg: this.num(this.avg, 0),
      };
    }

    /** 값 쓰기 (부분 갱신) — 렌더 전이면 어트리뷰트로 보관해 렌더 시 반영 */
    write(patch: Partial<SimConfigValues & { avg: number }>): void {
      const set = (attr: string, v: number | undefined) => {
        if (v == null || !Number.isFinite(v)) return;
        this.setAttribute(attr, String(v));
      };
      set('capital', patch.capital);
      set('fee', patch.fee);
      set('shares', patch.shares);
      set('avg', patch.avg);
    }

    /** 시작 평단 표시 갱신 (자동 계산값) */
    writeAvg(v: number): void {
      this.write({ avg: v });
    }

    /** 폼 전체 값 (페이지 @property 바인딩용) — 개별 프로퍼티 대입 시 해당 항목만 적용 */
    get value(): SimConfigValues & { avg: number } {
      const self = this;
      const def = (key: 'capital' | 'fee' | 'shares' | 'avg') => ({
        enumerable: true,
        get: () => self.read()[key],
        set: (v: number) => self.write({ [key]: v } as any),
      });
      return Object.defineProperties({}, {
        capital: def('capital'),
        fee: def('fee'),
        shares: def('shares'),
        avg: def('avg'),
      }) as SimConfigValues & { avg: number };
    }
    set value(v: Partial<SimConfigValues & { avg: number }>) {
      this.write(v ?? {});
    }
  }

  return tagName;
};
