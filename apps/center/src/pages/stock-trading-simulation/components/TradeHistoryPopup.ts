import { elementDefine, onConnectedBodyShadow, eventShadow } from '@dooboostore/simple-web-component';

const tagName = 'trade-history-popup';

export interface ConditionDetail {
  source: string;
  left: string;
  right: string;
  operator: string;
  action: string;
  percent: number;
  /** 집행 방식 — 체결 조건에만 기록 (min/max/combined) */
  applyMode?: string;
  description?: string;
  cooldownBars?: number;
  noTradeBars?: number;
}

export interface HistoryRow {
  idx: number;
  date: string;
  action: 'buy' | 'sell';
  price: number;
  shares: number;
  amount: number;
  reason: string;
  /** 매매 후 보유주식수 */
  sharesAfter?: number;
  /** 매매 후 보유주식 평가금액 */
  holdingEval?: number;
  /** 매매 후 총평가금액 (현금+보유평가) */
  totalEval?: number;
  /** 매매 후 총평가금액 증감률 % (시작자기자본 대비) */
  totalRate?: number;
  /** 체결 근거 조건 */
  condition?: ConditionDetail;
  /** 체결 시점에 걸려 있던 전체 조건 */
  candidates?: ConditionDetail[];
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
    private detailIdx: number | null = null;
    private onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (this.detailIdx != null) this.closeDetail();
      else this.hide();
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
          .hist-badge.has-detail{cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px}
          .hist-detail{position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:960;display:none;align-items:center;justify-content:center;padding:16px}
          .hist-detail.show{display:flex}
          .hist-detail-box{background:#fff;border-radius:12px;max-width:560px;width:100%;max-height:80vh;display:flex;flex-direction:column;overflow:hidden}
          .hist-detail-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:800;color:#1e293b}
          .hist-detail-body{overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px}
          .hist-cond{border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;font-size:11px;color:#334155}
          .hist-cond.fired{border-color:#7c3aed;background:#f5f3ff}
          .hist-cond-title{display:flex;align-items:center;gap:6px;font-weight:800;margin-bottom:4px}
          .hist-src{display:inline-block;border-radius:6px;padding:1px 6px;font-size:10px;font-weight:800;color:#fff;background:#64748b}
          .hist-fired-tag{margin-left:auto;font-size:10px;font-weight:800;color:#7c3aed}
          .hist-cond-line{color:#64748b;line-height:1.7}
        </style>
        <button type="button" id="hist-open" class="hist-open">거래내역보기</button>
        <div class="hist-modal" id="hist-modal">
          <div class="hist-box">
            <div class="hist-head"><span>📒 거래내역</span><span id="hist-count" style="font-size:11px;color:#94a3b8;font-weight:700"></span><button type="button" class="hist-close" id="hist-close">닫기 ✕</button></div>
            <div class="hist-body" id="hist-body"></div>
          </div>
        </div>
        <div class="hist-detail" id="hist-detail">
          <div class="hist-detail-box">
            <div class="hist-detail-head"><span id="hist-detail-title">🔍 조건 상세</span><button type="button" class="hist-close" id="hist-detail-close">닫기 ✕</button></div>
            <div class="hist-detail-body" id="hist-detail-body"></div>
          </div>
        </div>
      `;
    }

    @eventShadow('#hist-close', 'click')
    onCloseClick() {
      this.hide();
    }

    @eventShadow('#hist-detail-close', 'click')
    onDetailCloseClick() {
      this.closeDetail();
    }

    @eventShadow('#hist-detail', 'click')
    onDetailBackdrop(e: Event) {
      const modal = e.currentTarget as HTMLElement;
      if (e.target === modal) this.closeDetail();
    }

    @eventShadow('#hist-body', 'click')
    onBodyClick(e: Event) {
      // 구분 배지 클릭 → 조건 디테일 레이어
      const badge = (e.target as HTMLElement)?.closest?.('.hist-badge') as HTMLElement | null;
      if (!badge) return;
      const idx = Number(badge.getAttribute('data-idx'));
      if (!Number.isFinite(idx)) return;
      this.openDetail(idx);
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
      const fmtRate = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
      const hi = (n: number) => n > 0 ? '#dc2626' : n < 0 ? '#2563eb' : '#64748b';
      const hasHold = this.rows.some(t => t.sharesAfter != null);
      body.innerHTML = `<table class="hist-table">
        <thead>
          <tr><th colspan="7" style="background:#eff6ff;color:#1d4ed8;border-bottom:1px solid #bfdbfe">매매</th>${hasHold ? '<th colspan="4" style="background:#fef3c7;color:#b45309;border-bottom:1px solid #fde68a">매매 후 보유</th>' : ''}</tr>
          <tr><th>#</th><th>날짜</th><th>구분</th><th>시세</th><th>수량</th><th>금액</th><th>사유</th>${hasHold ? '<th>보유주식</th><th>보유평가</th><th>총평가</th><th>증감률</th>' : ''}</tr>
        </thead>
        <tbody>${this.rows.map((t, i) => {
          const bt = t.action === 'buy' ? '매수' : '매도';
          const bc = t.action === 'buy' ? '#3b82f6' : '#ef4444';
          const hasDetail = t.condition != null || (t.candidates?.length ?? 0) > 0;
          const hold = hasHold ? `<td class="num">${t.sharesAfter != null ? Math.floor(t.sharesAfter).toLocaleString() + '주' : '-'}</td><td class="num">${t.holdingEval != null ? fmt(t.holdingEval) + '원' : '-'}</td><td class="num">${t.totalEval != null ? fmt(t.totalEval) + '원' : '-'}</td><td class="num" style="color:${t.totalRate != null ? hi(t.totalRate) : '#64748b'};font-weight:800">${t.totalRate != null ? fmtRate(t.totalRate) : '-'}</td>` : '';
          return `<tr><td class="num">${i + 1}</td><td>${esc(t.date)}</td><td><span class="hist-badge${hasDetail ? ' has-detail' : ''}" style="background:${bc}"${hasDetail ? ` data-idx="${i}" title="조건 상세 보기"` : ''}>${bt}</span></td><td class="num">${fmt(t.price)}원</td><td class="num">${Math.floor(t.shares).toLocaleString()}주</td><td class="num">${fmt(t.amount)}원</td><td class="reason">${esc(t.reason)}</td>${hold}</tr>`;
        }).join('')}</tbody></table>`;
    }

    /** 조건 디테일 레이어 열기 — 걸려 있던 전체 조건 + 처리된 조건 하이라이트 */
    openDetail(idx: number): void {
      const t = this.rows[idx];
      if (!t) return;
      this.detailIdx = idx;
      const title = this.shadowRoot?.querySelector('#hist-detail-title') as HTMLElement | null;
      const body = this.shadowRoot?.querySelector('#hist-detail-body') as HTMLElement | null;
      const modal = this.shadowRoot?.querySelector('#hist-detail') as HTMLElement | null;
      if (!body || !modal) return;
      const bt = t.action === 'buy' ? '매수' : '매도';
      if (title) title.textContent = `🔍 조건 상세 · #${idx + 1} ${t.date} ${bt} ${Math.floor(t.shares).toLocaleString()}주`;
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const isFired = (c: ConditionDetail) => {
        const f = t.condition;
        return !!f && f.source === c.source && f.left === c.left && f.right === c.right
          && f.operator === c.operator && f.action === c.action && f.percent === c.percent;
      };
      const modeLabel = (m?: string) => m === 'min' ? '최소' : m === 'max' ? '최대' : m === 'combined' ? '컴바인' : '';
      const condHtml = (c: ConditionDetail, fired: boolean) => {
        const extra: string[] = [];
        if (c.cooldownBars != null) extra.push(`발동 후 ${c.cooldownBars}봉 스킵`);
        if (c.noTradeBars != null) extra.push(`최근 ${c.noTradeBars}봉 무거래 시만`);
        const mode = modeLabel(c.applyMode);
        return `<div class="hist-cond${fired ? ' fired' : ''}">
          <div class="hist-cond-title"><span class="hist-src">${esc(c.source)}</span><span>${esc(c.left)} ${esc(c.operator)} ${esc(c.right)}</span><span style="color:${c.action === 'buy' ? '#3b82f6' : '#ef4444'}">${c.action === 'buy' ? '매수' : '매도'} ${c.percent}%</span>${fired ? `<span class="hist-fired-tag">✓ 처리됨${mode ? ` · ${mode}` : ''}</span>` : ''}</div>
          <div class="hist-cond-line">${c.description ? `${esc(c.description)}<br/>` : ''}${extra.length ? esc(extra.join(' · ')) : '추가 제약 없음'}</div>
        </div>`;
      };
      const cands = t.candidates ?? [];
      body.innerHTML = `
        ${t.condition ? `<div style="font-size:11px;font-weight:800;color:#7c3aed;margin-bottom:2px">처리된 조건</div>${condHtml(t.condition, true)}` : `<div style="font-size:11px;color:#94a3b8">처리된 조건 정보 없음 (초기보유 등)</div>`}
        <div style="font-size:11px;font-weight:800;color:#334155;margin-top:4px">걸려 있던 전체 조건 ${cands.length}건</div>
        ${cands.length ? cands.map(c => condHtml(c, isFired(c))).join('') : `<div style="font-size:11px;color:#94a3b8">없음</div>`}
      `;
      modal.classList.add('show');
    }

    closeDetail(): void {
      this.detailIdx = null;
      this.shadowRoot?.querySelector('#hist-detail')?.classList.remove('show');
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
      this.closeDetail();
      this.paint();
      w.document.removeEventListener('keydown', this.onKey);
    }
  }

  return tagName;
};
