import { elementDefine, onConnectedBodyShadow, eventShadow } from '@dooboostore/simple-web-component';

const tagName = 'trade-history-popup';

export interface HistoryRow {
  idx: number;
  date: string;
  action: 'buy' | 'sell';
  price: number;
  shares: number;
  amount: number;
  reason: string;
}

/** 거래내역 팝업 (자율 엘리먼트 + shadow DOM).
 *  페이지에서는 <trade-history-popup> 배치 후 show(trades)로 표시. */
export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class TradeHistoryPopup extends w.HTMLElement {
    private rows: HistoryRow[] = [];
    private shown = false;
    private onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.hide();
    };

    @onConnectedBodyShadow
    render(): string {
      return `
        <style>
          .hist-open{height:28px;padding:0 12px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;color:#334155;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap}
          .hist-modal{position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:950;display:none;align-items:center;justify-content:center;padding:16px}
          .hist-modal.show{display:flex}
          .hist-box{background:#fff;border-radius:12px;max-width:860px;width:100%;max-height:82vh;display:flex;flex-direction:column;overflow:hidden}
          .hist-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:800;color:#1e293b}
          .hist-close{margin-left:auto;height:28px;padding:0 12px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#64748b;font-size:11px;font-weight:800;cursor:pointer}
          .hist-body{overflow-y:auto;padding:0 0 12px}
          .hist-table{width:100%;border-collapse:collapse;font-size:11px;color:#334155}
          .hist-table th{position:sticky;top:0;background:#f8fafc;color:#64748b;font-size:10px;padding:8px 6px;border-bottom:1px solid #e2e8f0;white-space:nowrap;z-index:1}
          .hist-table td{padding:7px 6px;border-bottom:1px solid #f1f5f9;white-space:nowrap;vertical-align:top}
          .hist-table td.num{text-align:right;font-variant-numeric:tabular-nums}
          .hist-table td.reason{white-space:normal;min-width:200px;color:#64748b}
          .hist-badge{display:inline-block;min-width:34px;text-align:center;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:800;color:#fff}
        </style>
        <button type="button" id="hist-open" class="hist-open">거래내역보기</button>
        <div class="hist-modal" id="hist-modal">
          <div class="hist-box">
            <div class="hist-head"><span>📒 거래내역</span><span id="hist-count" style="font-size:11px;color:#94a3b8;font-weight:700"></span><button type="button" class="hist-close" id="hist-close">닫기 ✕</button></div>
            <div class="hist-body" id="hist-body"></div>
          </div>
        </div>
      `;
    }

    @eventShadow('#hist-close', 'click')
    onCloseClick() {
      this.hide();
    }

    @eventShadow('#hist-modal', 'click')
    onBackdrop(e: Event) {
      const modal = e.currentTarget as HTMLElement;
      if (e.target === modal) this.hide();
    }

    @eventShadow('#hist-open', 'click')
    onOpenClick() {
      // 페이지를 향해 열기 요청 (내역 데이터는 페이지가 show()로 전달)
      this.dispatchEvent(new w.CustomEvent('history-open', { bubbles: true, composed: true }));
    }

    private paint(): void {
      const modal = this.shadowRoot?.querySelector('#hist-modal') as HTMLElement | null;
      const body = this.shadowRoot?.querySelector('#hist-body') as HTMLElement | null;
      const count = this.shadowRoot?.querySelector('#hist-count') as HTMLElement | null;
      if (!modal || !body) return;
      modal.classList.toggle('show', this.shown);
      if (count) count.textContent = this.rows.length ? `총 ${this.rows.length}건` : '';
      if (!this.rows.length) {
        body.innerHTML = `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:12px">거래내역이 없습니다.</div>`;
        return;
      }
      const fmt = (n: number) => Math.round(n).toLocaleString();
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      body.innerHTML = `<table class="hist-table">
        <thead><tr><th>#</th><th>날짜</th><th>구분</th><th>시세</th><th>수량</th><th>금액</th><th>사유</th></tr></thead>
        <tbody>${this.rows.map((t, i) => {
          const bt = t.action === 'buy' ? '매수' : '매도';
          const bc = t.action === 'buy' ? '#3b82f6' : '#ef4444';
          return `<tr><td class="num">${i + 1}</td><td>${esc(t.date)}</td><td><span class="hist-badge" style="background:${bc}">${bt}</span></td><td class="num">${fmt(t.price)}원</td><td class="num">${Math.floor(t.shares).toLocaleString()}주</td><td class="num">${fmt(t.amount)}원</td><td class="reason">${esc(t.reason)}</td></tr>`;
        }).join('')}</tbody></table>`;
    }

    /** 거래내역 값 바인딩 (페이지 @property 또는 직접 대입용) */
    get trades(): HistoryRow[] {
      return [...this.rows];
    }
    set trades(rows: HistoryRow[]) {
      this.rows = [...(rows ?? [])];
      if (this.shown) this.paint();
    }

    show(rows: HistoryRow[]): void {
      this.trades = rows;
      this.open();
    }

    open(): void {
      this.shown = true;
      this.paint();
      w.document.addEventListener('keydown', this.onKey);
    }

    hide(): void {
      this.shown = false;
      this.paint();
      w.document.removeEventListener('keydown', this.onKey);
    }
  }

  return tagName;
};
