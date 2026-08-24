import {
  addEventListener,
  elementDefine,
  innerHtmlLight,
  onConnectedBodyShadow,
  onInitialize,
} from "@dooboostore/simple-web-component";
import {Router} from '@dooboostore/core-web';
import {inject} from "@dooboostore/simple-boot";
import type {
  BuybackChartPoint,
  BuybackCompany,
  BuybackCompanyInfo,
  BuybackDeclaration,
  BuybackDisclosure,
  BuybackItem,
  BuybackService as BuybackServiceType,
  BuybackStockAcqDisp,
  BuybackTradedItem
} from "../../services/buyback/BuybackService";
import {BuybackService} from "../../services/buyback/BuybackService";

const tagName = 'center-buyback-page';

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class BuybackPage extends w.HTMLElement {
    private router!: Router;
    private buybackService!: BuybackServiceType;

    private companies: BuybackCompany[] = [];
    private itemsByCompany: Map<string, BuybackItem[]> = new Map();
    private tradedByCompany: Map<string, BuybackTradedItem[]> = new Map();
    private activeTabByCompany: Map<string, 'applied' | 'traded' | 'declared'> = new Map();
    private declarationsByCompany: Map<string, BuybackDeclaration[]> = new Map();
    private stockAcqDispByCompany: Map<string, BuybackStockAcqDisp[]> = new Map();
    private loadingCompany: Map<string, boolean> = new Map();
    private lastUpdatedByCompany: Map<string, string> = new Map();
    private disclosures: BuybackDisclosure[] = [];
    private loading: boolean = false;
    private error: string = '';
    private popupCompany: BuybackCompany | null = null;
    private popupInfo: BuybackCompanyInfo | null = null;
    private popupLoading: boolean = false;
    private popupError: string = '';
    private chartCompany: BuybackCompany | null = null;
    private chartData: BuybackChartPoint[] = [];
    private chartLoading: boolean = false;
    private chartError: string = '';

    // ---------- 초기화 ----------

    @onInitialize
    async onInitialized(
      @inject(BuybackService.SYMBOL) buybackService: BuybackServiceType,
      router: Router
    ): Promise<void> {
      this.buybackService = buybackService;
      this.router = router;
      this.companies = this.buybackService.getCompanies();
      await this.loadAll();
    }

    private async loadAll() {
      this.loading = true;
      this.error = '';
      this.rerenderKeepingChart();
      try {
        const [disclosures] = await Promise.all([
          this.buybackService.getDisclosureList(),
        ]);
        this.disclosures = disclosures;
        this.lastUpdatedByCompany.set('disclosure', this.nowTime());
        for (const company of this.companies) {
          await this.loadCompany(company);
          this.rerenderKeepingChart();
        }
      } catch (e: any) {
        this.error = e?.message || '데이터를 불러오지 못했습니다.';
      }
      this.loading = false;
      this.rerenderKeepingChart();
    }

    private nowTime(): string {
      return new Date().toLocaleTimeString('ko-KR', { hour12: false });
    }

    private async loadCompany(company: BuybackCompany) {
      this.loadingCompany.set(company.code, true);
      try {
        const [list, tradedList, declarations, stockStatus] = await Promise.all([
          this.buybackService.getAppliedList(company.code),
          this.buybackService.getTradedList(company.code),
          this.buybackService.getDeclaredList(company.code),
          this.buybackService.getStockStatus(company),
        ]);
        this.itemsByCompany.set(company.code, list);
        this.tradedByCompany.set(company.code, tradedList);
        this.declarationsByCompany.set(company.code, declarations);
        const acqDisp = stockStatus?.dataList?.[0]?.stockAcqDisp || [];
        console.log(`[BuybackPage] ${company.name} stockAcqDisp:`, acqDisp);
        this.stockAcqDispByCompany.set(company.code, acqDisp);

        this.lastUpdatedByCompany.set(company.code, this.nowTime());
      } finally {
        this.loadingCompany.set(company.code, false);
      }
    }

    // ---------- 렌더 ----------

    private formatDate(dateStr: string): string {
      if (!dateStr || dateStr.length !== 8) return '-';
      return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    }

    private isToday(dateStr: string): boolean {
      if (!dateStr) return false;
      // 날짜 부분만 추출 (예: "2026-08-21  18:08" -> "2026-08-21")
      const datePart = dateStr.trim().split(/\s+/)[0];
      const clean = datePart.replace(/[^0-9]/g, '');
      const now = new Date();
      // now.setDate(now.getDate() - 1); // 테스트용: 어제 날짜를 기준(오늘)으로 설정
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      return clean === `${y}${m}${d}`;
    }

    private renderDateCell(dateStr: string): string {
      const formatted = this.formatDate(dateStr);
      if (formatted === '-' || !this.isToday(dateStr)) return formatted;
      return `${formatted} <span class="today-sticker">TODAY</span>`;
    }

    private renderDisclosureDate(dateStr: string): string {
      if (!dateStr) return '-';
      if (!this.isToday(dateStr)) return dateStr;
      return `${dateStr} <span class="today-sticker">TODAY</span>`;
    }

    private typeLabel(code: string): string {
      if (code === '1') return '취득';
      if (code === '2') return '처분';
      if (code === '0') return '신탁';
      return '-';
    }

    private buildDisclosureCard(): string {
      const rows = this.disclosures.map((item, idx) => {
        return `
          <li class="disclosure-row" data-url="${item.viewerUrl}" role="link" tabindex="0" aria-label="${item.title}">
            <span class="disc-date">${this.renderDisclosureDate(item.date)}</span>
            <span class="disc-title">${item.title}</span>
            <span class="disc-open">↗</span>
          </li>
        `;
      }).join('') || '<li class="disclosure-empty">공시 내역이 없습니다.</li>';

      return `
        <div class="card disclosure-card">
          <div class="card-header" style="--accent: #37474f">
            <div>
              <div class="card-title">📋 자기주식매매 신청내역</div>
              <div class="card-code">유가증권시장 · 공시 목록(최근 15건)</div>
            </div>
            <div class="card-header-actions">
              <div class="card-actions">
                <div class="card-count">${this.disclosures.length}건</div>
                <button class="card-refresh" data-code="disclosure" title="새로고침">
                  <svg class="refresh-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
                </button>
              </div>
              <div class="card-header-updated">최근 업데이트 ${this.lastUpdatedByCompany.get("disclosure") || "-"}</div>
            </div>
          </div>
          <ul class="disclosure-list">
            ${rows}
          </ul>
        </div>
      `;
    }

    private buildCompanyCard(company: BuybackCompany): string {
      const appliedItems = this.itemsByCompany.get(company.code) || [];
      const tradedItems = this.tradedByCompany.get(company.code) || [];
      const declaredItems = this.declarationsByCompany.get(company.code) || [];
      const activeTab = this.activeTabByCompany.get(company.code) || 'applied';
      
      let count = appliedItems.length;
      if (activeTab === 'traded') count = tradedItems.length;
      if (activeTab === 'declared') count = declaredItems.length;

      const isLoading = this.loadingCompany.get(company.code) || false;
      const lastUpdated = this.lastUpdatedByCompany.get(company.code) || '';
      const acqDispList = this.stockAcqDispByCompany.get(company.code) || [];

      let thead = '';
      let tbody = '';

      if (activeTab === 'applied') {
        thead = `
          <tr>
            <th>신청일</th>
            <th>매입일</th>
            <th>취득/처분</th>
            <th>신청수량</th>
          </tr>
        `;
        tbody = appliedItems.map(item => `
          <tr>
            <td class="date-cell">${this.renderDateCell(item.applDate)}</td>
            <td class="date-cell">${this.renderDateCell(item.tradeDate)}</td>
            <td class="type-cell">${this.typeLabel(item.typeCode)}</td>
            <td class="qty-cell">${item.appliedQty.toLocaleString()}</td>
          </tr>
        `).join('') || `<tr><td colspan="4" class="empty-cell">표시할 데이터가 없습니다.</td></tr>`;
      } else if (activeTab === 'traded') {
        thead = `
          <tr>
            <th>체결일</th>
            <th>취득/처분</th>
            <th>신청수량</th>
            <th>체결수량</th>
          </tr>
        `;
        tbody = tradedItems.map(item => `
          <tr>
            <td class="date-cell">${this.renderDateCell(item.tradeDate)}</td>
            <td class="type-cell">${this.typeLabel(item.typeCode)}</td>
            <td class="qty-cell">${item.appliedQty.toLocaleString()}</td>
            <td class="qty-cell">${item.tradedQty.toLocaleString()}</td>
          </tr>
        `).join('') || `<tr><td colspan="4" class="empty-cell">표시할 데이터가 없습니다.</td></tr>`;
      } else {
        thead = `
          <tr>
            <th>신고일</th>
            <th>시작일</th>
            <th>종료일</th>
            <th>신고수량</th>
          </tr>
        `;
        tbody = declaredItems.map(item => `
          <tr>
            <td class="date-cell">${this.renderDateCell(item.declDate)}</td>
            <td class="date-cell">${this.renderDateCell(item.startDate)}</td>
            <td class="date-cell">${this.renderDateCell(item.endDate)}</td>
            <td class="qty-cell">${item.declQty.toLocaleString()}</td>
          </tr>
        `).join('') || `<tr><td colspan="4" class="empty-cell">표시할 데이터가 없습니다.</td></tr>`;
      }

      return `
        <div class="card">
          <div class="card-header" style="--accent: ${company.color}">
            <div>
              <div class="card-title">
                  <button class="company-name-btn" data-company="${company.code}" title="기업정보 보기">${company.name}</button>
                </div>
              <div class="card-code">${company.code} · KRX (최근 15건)</div>
            </div>
            <div class="card-header-actions">
              <div class="card-actions">
                <div class="card-count">${count}건</div>
                <button class="card-refresh card-chart-btn" data-chart="${company.code}" title="캔들 차트 보기">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 3v4M7 17v4M17 3v3M17 16v5"/><rect x="5" y="7" width="4" height="10" rx="1"/><rect x="15" y="6" width="4" height="10" rx="1"/></svg>
                </button>
                <button class="card-refresh" data-code="${company.code}" title="새로고침">
                  <svg class="refresh-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
                </button>
              </div>
              <div class="card-header-updated">최근 업데이트 ${lastUpdated || "-"}</div>
            </div>
          </div>
          <div class="card-tabs">
            <button class="card-tab-btn ${activeTab === "applied" ? "active" : ""}" data-code="${company.code}" data-tab="applied">신청내역 (${appliedItems.length})</button>
            <button class="card-tab-btn ${activeTab === "traded" ? "active" : ""}" data-code="${company.code}" data-tab="traded">체결내역 (${tradedItems.length})</button>
            <button class="card-tab-btn ${activeTab === "declared" ? "active" : ""}" data-code="${company.code}" data-tab="declared">신고내역 (${declaredItems.length})</button>
          </div>
          ${isLoading ? '<div class="progress-bar"><div class="progress-bar-fill"></div></div>' : ""}
          <div class="notice-table-wrap">
            <table class="notice-table">
              <thead>
                ${thead}
              </thead>
              <tbody>
                ${tbody}
              </tbody>
            </table>
          </div>
          <div class="acqdisp-section">
            <div class="acqdisp-header">
              <span class="acqdisp-title">자기주식 취득·처분 현황</span>
              <span class="acqdisp-count">${acqDispList.length}건</span>
            </div>
            <div class="acqdisp-wrap">
              <table class="acqdisp-table">
                <thead>
                  <tr>
                    <th>신고수량</th>
                    <th>체결수량</th>
                    <th>남은수량</th>
                    <th>진행률</th>
                    <th>체결금액(누계)</th>
                    <th>구분</th>
                    <th>기간</th>
                  </tr>
                </thead>
                <tbody>
                  ${acqDispList.length === 0
                    ? '<tr><td colspan="7" class="empty-cell">취득·처분 내역이 없습니다.</td></tr>'
                    : acqDispList.map((row, idx) => {
                        const qty = Number(row.trstk_decl_qty) || 0;
                        const traded = Number(row.trstk_acc_trd_qty) || 0;
                        const tradedVal = Number(row.trstk_acc_trdval) || 0;
                        const pct = qty > 0 ? ((traded / qty) * 100).toFixed(1) : '0';
                        const remaining = Math.max(0, qty - traded);
                        const type = row.trstk_acqstdisp_tp_cd === '1' ? '취득' : row.trstk_acqstdisp_tp_cd === '2' ? '처분' : '-';
                        const fmtDate = (d: string) => d && d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d || '-';
                        const fmtMoney = (n: number): string => {
                          if (!n) return '0';
                          const jo = Math.floor(n / 1e12);
                          const eok = Math.floor((n % 1e12) / 1e8);
                          const man = Math.floor((n % 1e8) / 1e4);
                          let s = '';
                          if (jo > 0) s += `${jo}조 `;
                          if (eok > 0) s += `${eok}억 `;
                          if (man > 0) s += `${man}만`;
                          return s.trim() || n.toLocaleString();
                        };
                        const now = new Date();
                        const todayStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
                        const isOngoing = !!row.trstk_decl_strt_dd && !!row.trstk_decl_end_dd
                          && row.trstk_decl_strt_dd <= todayStr && todayStr <= row.trstk_decl_end_dd;
                        const isUpcoming = !isOngoing && !!row.trstk_decl_strt_dd && row.trstk_decl_strt_dd > todayStr;
                        const badge = isOngoing
                          ? '<span class="ongoing-sticker">진행중</span>'
                          : isUpcoming
                            ? '<span class="upcoming-sticker">예정</span>'
                            : '';
                        return `
                        <tr class="${idx === 0 ? 'latest' : ''}">
                          <td class="qty-cell ${isOngoing || isUpcoming ? 'ongoing' : ''}">${badge}${qty.toLocaleString()}</td>
                          <td class="qty-cell">${traded.toLocaleString()}</td>
                          <td class="qty-cell">${remaining.toLocaleString()}</td>
                          <td class="qty-cell"><span class="progress-track"><span class="mini-progress-fill" style="width: ${Math.min(100, Number(pct))}%"></span><span class="pct-label">${pct}%</span></span></td>
                          <td class="qty-cell">${fmtMoney(tradedVal)}원</td>
                          <td class="type-cell">${type}</td>
                          <td class="date-cell">${fmtDate(row.trstk_decl_strt_dd)} ~ ${fmtDate(row.trstk_decl_end_dd)}</td>
                        </tr>`;
                      }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    private buildCompanyGrid(): string {
      return `${this.buildDisclosureCard()}<div class="company-sub-grid">${this.companies.map(company => this.buildCompanyCard(company)).join('')}</div>`;
    }

    private rerenderKeepingChart(): void {
      this.renderTabContent();
    }

    @innerHtmlLight
    private renderTabContent(): string {
      return `
        <style>
          ${this.contentStyles}
        </style>
        ${this.loading ? `
          <div class="loading">
            <div class="spinner"></div>
            <span>자사주 매입 현황 및 공시 데이터를 불러오는 중...</span>
          </div>
        ` : ''}
        ${this.error ? `<div class="error">${this.error}</div>` : ''}
        <div class="company-grid">
          ${this.buildCompanyGrid()}
        </div>
        <div class="notice-bar">
          <span class="notice-text">자사주 매입 신청은 매입일 전날 <strong>18:00</strong>까지 신고해야 합니다.</span>
          <span class="source-info"><span class="source-label">데이터 출처</span><span class="source-value">KRX KIND · ${new Date().getFullYear()}-01-01 ~ ${new Date().getFullYear()}-12-31</span></span>
        </div>
        ${this.buildPopup()}
        ${this.buildChartPopup()}
        <footer class="copyright">
          © ${new Date().getFullYear()} dooboostore
        </footer>
      `;
    }

    private buildChartPopup(): string {
      if (!this.chartCompany) return '';
      const ticks = this.chartData.map(d => `
        <tick date="${d.date}" open="${d.open}" high="${d.high}" low="${d.low}" close="${d.close}" volume="${d.volume}"></tick>
      `).join('');
      return `
        <div class="chart-overlay">
          <div class="chart-popup" role="dialog" aria-modal="true">
            <div class="popup-header" style="background: ${this.chartCompany.color}">
              <div class="popup-title">${this.chartCompany.name} 캔들 차트</div>
              <button class="chart-popup-close" title="닫기">×</button>
            </div>
            <div class="chart-body">
              ${this.chartLoading ? '<div class="chart-loading"><div class="spinner"></div><span>차트 데이터를 불러오는 중...</span></div>' : ''}
              ${this.chartError ? `<div class="chart-error">${this.chartError}</div>` : ''}
              ${!this.chartLoading && !this.chartError && this.chartData.length > 0 ? `
                <stock-chart>${ticks}</stock-chart>
              ` : ''}
              ${!this.chartLoading && !this.chartError && this.chartData.length === 0 ? '<div class="chart-error">차트 데이터가 없습니다.</div>' : ''}
            </div>
            <div class="chart-hint">탭·클릭으로 캔들 선택 (시고저종·거래량 확인) · 휠·핀치로 확대/축소 · 드래그로 이동 · <span class="legend-up">상승</span>/<span class="legend-down">하락</span></div>
          </div>
        </div>
      `;
    }

    private buildPopup(): string {
      if (!this.popupCompany) return '';
      const info = this.popupInfo;
      const items: [string, string][] = info ? [
        ['한글명', info.korName],
        ['영문명', info.engName],
        ['표준코드', info.stdCode],
        ['종목코드', info.stockCode],
        ['시장구분', info.market],
        ['설립일', info.founded],
        ['대표이사', info.ceo],
        ['상장일', info.listed],
        ['자본금', info.capital],
        ['종업원수', info.employees],
        ['결산월', info.closeMonth],
        ['전화번호', info.phone],
        ['업종', info.industry],
        ['주요제품', info.products],
        ['주소', info.address],
        ['홈페이지', info.homepage],
      ] : [];
      return `
        <div class="popup-overlay">
          <div class="popup" role="dialog" aria-modal="true">
            <div class="popup-header" style="background: ${this.popupCompany.color}">
              <div class="popup-title">${this.popupCompany.name} 기업정보</div>
              <button class="popup-close" title="닫기">×</button>
            </div>
            <div class="popup-body">
              ${this.popupLoading ? '<div class="popup-loading">불러오는 중...</div>' : ''}
              ${this.popupError ? `<div class="popup-error">${this.popupError}</div>` : ''}
              ${!this.popupLoading && !this.popupError && info ? this.buildPopupContent(info, items) : ''}
            </div>
            <div class="popup-footer">
              <span>출처: KRX KIND</span>
              <button class="popup-btn-close">닫기</button>
            </div>
          </div>
        </div>
      `;
    }

    private buildPopupContent(info: BuybackCompanyInfo, rows: [string, string][]): string {
      const p = info.price;
      const priceRow = (label: string, val: string) => `
        <div class="price-cell"><div class="price-label">${label}</div><div class="price-value">${val}</div></div>
      `;
      return `
        <div class="popup-section">
          <div class="popup-section-title">📊 주요시세 <span class="price-note">20분 지연 · 단위: 원</span></div>
          <div class="price-grid">
            ${priceRow('현재가', p.current)}
            ${priceRow('전일대비', `${p.change} (${p.changePct}%)`)}
            ${priceRow('전일가', p.prevClose)}
            ${priceRow('시가', p.open)}
            ${priceRow('고가', p.high)}
            ${priceRow('저가', p.low)}
            ${priceRow('거래량', p.volume)}
            ${priceRow('거래대금', p.amount)}
            ${priceRow('매수호가', p.bid)}
            ${priceRow('매도호가', p.ask)}
            ${priceRow('액면가', p.par)}
            ${priceRow('상한가', p.upper)}
          </div>
        </div>
        <div class="popup-section">
          <div class="popup-section-title">🏢 회사개요</div>
          <table class="popup-table">
            <tbody>${rows.map(item => `<tr><th>${item[0]}</th><td>${item[1]}</td></tr>`).join('')}</tbody>
          </table>
        </div>
        ${info.outlook !== '-' ? `
        <div class="popup-section">
          <div class="popup-section-title">🔍 현황 및 전망</div>
          <div class="popup-outlook">${info.outlook}</div>
        </div>
        ` : ''}
      `;
    }

    // ---------- 스타일 ----------

    private get contentStyles(): string {
      return `
        .notice-bar {
          background: #f0f6fc;
          border: 1px solid #d6e6f5;
          border-radius: 8px;
          padding: 7px 12px;
          margin-top: 14px;
          margin-bottom: 12px;
          font-size: 11px;
          color: #4a6b8a;
          display: flex;
          align-items: center;
          gap: 1px;
          flex-wrap: wrap;
        }
        .notice-text { color: #4a6b8a; flex: 1; min-width: 180px; line-height: 1.4; }
        .notice-text strong {
          color: #2f5b8f; font-weight: 700;
          padding: 0 4px; border-radius: 4px; background: #e4effa;
        }
        .source-info {
          font-size: 10px; color: #5a7ca0; white-space: nowrap;
          display: flex; align-items: center; gap: 5px;
        }
        .source-label {
          font-weight: 600; color: #2f5b8f;
          background: #e4effa; border-radius: 999px; padding: 2px 7px;
        }
        .source-value { color: #5a7ca0; }
        .updated { font-size: 11px; color: #78909c; }

        .loading, .error {
          padding: 16px;
          text-align: center;
          border-radius: 10px;
          margin-bottom: 16px;
          font-size: 14px;
        }
        .loading {
          background: #f0f6fc;
          border: 1px solid #d6e6f5;
          color: #1f6feb;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-weight: 600;
          padding: 20px;
        }
        .spinner {
          width: 20px;
          height: 20px;
          border: 3px solid rgba(31, 111, 235, 0.2);
          border-top-color: #1f6feb;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .error { background: #ffebee; color: #c62828; }

        .company-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; }
        .company-sub-grid { display: grid; grid-template-columns: 1fr; gap: 16px; grid-column: 1 / -1; }

        .disclosure-card { grid-column: 1 / -1; }
        .disclosure-list {
          list-style: none; margin: 0; padding: 0;
          max-height: 50px; overflow-y: auto;
        }
        .disclosure-row {
          display: flex; align-items: center; gap: 10px;
          padding: 0 12px; border-bottom: 1px solid #f2f2f2;
          cursor: pointer; transition: background 0.15s ease;
        }
        .disclosure-row:hover { background: #f5f8fc; }
        .disclosure-row:last-child { border-bottom: none; }
        .disc-date { 
          position: relative; color: #1976d2; font-weight: 600; font-size: 12px; 
          white-space: nowrap; font-variant-numeric: tabular-nums; 
          padding: 8px 6px; display: inline-block; 
        }
        .disc-date .today-sticker { top: 1px; left: 6px; }
        .disc-title { flex: 1; color: #333; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 8px 0; }
        .disc-open { color: #90a4ae; font-size: 12px; flex-shrink: 0; padding: 8px 4px; }
        .disclosure-empty { padding: 20px; text-align: center; color: #999; font-size: 13px; }

        .card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          overflow: hidden;
        }
        .card-header {
          background: var(--accent);
          color: white;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .card-header-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
        .card-title { font-size: 15px; font-weight: 700; }
        .card-code { font-size: 11px; opacity: 0.8; margin-top: 1px; }
        .company-name-btn {
          background: none; border: none; color: white; padding: 0;
          font-size: inherit; font-weight: inherit; cursor: pointer;
          text-decoration: underline; text-underline-offset: 2px;
        }
        .company-name-btn:hover { text-decoration: underline; opacity: 0.9; }
        .card-code { font-size: 11px; opacity: 0.8; margin-top: 1px; }
        .card-header-updated { font-size: 9px; opacity: 0.7; }
        .card-count { background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
        .card-actions { display: flex; align-items: center; gap: 6px; }
        .card-refresh {
          background: rgba(255,255,255,0.2); border: none; color: white;
          width: 26px; height: 26px; border-radius: 6px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; font-size: 12px;
          transition: background 0.2s ease;
        }
        .card-refresh:hover { background: rgba(255,255,255,0.35); }
        .card-tabs {
          display: flex; background: #f8f9fb; border-bottom: 1px solid #eee; gap: 4px;
        }
        .card-tab-btn {
          background: none; border: none; padding: 8px 12px; font-size: 12px; font-weight: 600; color: #777; cursor: pointer;
          border-bottom: 2px solid transparent; transition: all 0.2s ease;
        }
        .card-tab-btn:hover { color: #1976d2; }
        .card-tab-btn.active { color: #1976d2; border-bottom-color: #1976d2; background: white; }
        .card-refresh.spinning .refresh-icon { animation: spin 0.8s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .type-cell { white-space: nowrap; color: #555; font-weight: 600; }

        .notice-table-wrap {
          max-height: 220px;
          overflow-x: auto;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        .notice-table { width: 100%; min-width: 320px; border-collapse: separate; border-spacing: 0; font-size: 13px; }
        .notice-table th {
          position: sticky;
          top: 0;
          z-index: 10;
          text-align: left; padding: 7px 10px; background: #fafafa;
          color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
          border-bottom: 1px solid #eee;
        }
        .notice-table td { padding: 7px 10px; border-bottom: 1px solid #f2f2f2; }
        .notice-table tbody tr:last-child td { border-bottom: none; }
        .date-cell { position: relative; font-variant-numeric: tabular-nums; color: #333; white-space: nowrap; }
        .today-sticker {
          position: absolute;
          top: 2px;
          left: 4px;
          background: #ff3b30;
          color: white;
          font-size: 8px;
          font-weight: 800;
          padding: 1px 4px;
          border-radius: 4px;
          transform: rotate(-6deg);
          box-shadow: 0 1px 2px rgba(0,0,0,0.25);
          letter-spacing: 0.5px;
          line-height: 1;
          z-index: 2;
        }
        .qty-cell { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; color: #1976d2; white-space: nowrap; }
        .countdown-cell { text-align: right; white-space: nowrap; }
        .countdown { font-variant-numeric: tabular-nums; font-weight: 700; }
        .countdown.open { color: #2e7d32; }
        .countdown.closed { color: #bdbdbd; font-weight: 400; }
        .empty-cell { text-align: center; color: #999; padding: 20px; }
        .card-footer {
          padding: 6px 10px; border-top: 1px solid #f2f2f2;
          display: flex; flex-direction: column; gap: 4px;
        }
        .footer-available { font-size: 12px; color: #1976d2; font-weight: 600; }
        .foot-dim { font-size: 11px; color: #777; font-weight: 400; }
        .foot-main { font-size: 12px; color: #1976d2; font-weight: 700; }
        .acqdisp-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 7px 10px; background: #fafbfc;
        }
        .acqdisp-section {
          border-top: 1px solid #e5e7eb;
          display: flex; flex-direction: column;
        }
        .acqdisp-title {
          font-weight: 700; font-size: 11px; color: #444;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .acqdisp-title::before {
          content: ''; width: 3px; height: 11px;
          background: #1976d2; border-radius: 2px;
        }
        .acqdisp-count {
          color: #888; font-size: 10px; font-weight: 600;
          background: #eef1f5; border-radius: 999px; padding: 2px 8px;
        }
        .acqdisp-wrap {
          max-height: 70px; overflow-y: auto; overflow-x: auto;
          border-top: 1px solid #eef0f4; border-bottom: 1px solid #eef0f4;
          -webkit-overflow-scrolling: touch;
        }
        .acqdisp-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 11px; }
        .acqdisp-table th {
          position: sticky; top: 0; z-index: 3;
          text-align: left; padding: 5px 8px; color: #888; font-weight: 600;
          background: #fafafa; border-bottom: 1px solid #f0f0f0;
          white-space: nowrap; font-size: 10px; letter-spacing: 0.3px;
        }
        .acqdisp-table td {
          padding: 5px 8px; color: #444; border-bottom: 1px solid #f7f7f7;
          white-space: nowrap; font-variant-numeric: tabular-nums;
        }
        .acqdisp-table tr:last-child td { border-bottom: none; }
        .acqdisp-table tr.latest td {
          background: #f0f6ff; font-weight: 600;
        }
        .acqdisp-table td.qty-cell { position: relative; padding: 9px 8px; }
        .acqdisp-table td.qty-cell .ongoing-sticker,
        .acqdisp-table td.qty-cell .upcoming-sticker {
          position: absolute; top: 3px; left: 4px; z-index: 2;
          transform: rotate(-6deg);
        }
        .progress-track {
          position: relative;
          display: inline-block; vertical-align: middle;
          width: 64px; height: 14px;
          background: #eceff3; border-radius: 999px; overflow: hidden;
        }
        .pct-label {
          position: absolute; inset: 0; z-index: 1;
          display: flex; align-items: center; justify-content: center;
          font-size: 9px; font-weight: 800; color: #33475b;
        }
        .mini-progress-fill {
          display: block;
          height: 100%; background: #1976d2; border-radius: 999px;
        }
        .ongoing-sticker {
          display: inline-block;
          background: #2e7d32;
          color: white;
          font-size: 8px;
          font-weight: 800;
          padding: 1px 5px;
          border-radius: 4px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.25);
          letter-spacing: 0.5px;
          line-height: 1;
          vertical-align: middle;
        }
        .upcoming-sticker {
          display: inline-block;
          background: #ef6c00;
          color: white;
          font-size: 8px;
          font-weight: 800;
          padding: 1px 5px;
          border-radius: 4px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.25);
          letter-spacing: 0.5px;
          line-height: 1;
          vertical-align: middle;
        }
        .card.flash { animation: cardFlash 1.6s ease; }
        @keyframes cardFlash {
          0% { box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.5); }
          100% { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        }
        .progress-bar {
          height: 3px; background: rgba(0,0,0,0.08); overflow: hidden; position: relative;
        }
        .progress-bar-fill {
          position: absolute; top: 0; left: 0; height: 100%; width: 40%;
          background: linear-gradient(90deg, transparent, #42a5f5, transparent);
          animation: progressSlide 1s ease-in-out infinite;
        }
        @keyframes progressSlide {
          0% { left: -40%; }
          100% { left: 100%; }
        }
        .copyright {
          text-align: center; padding: 14px 16px; color: #aaa; font-size: 12px;
          margin-top: 8px;
        }

        .popup-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 16px;
        }
        .popup {
          background: white; border-radius: 12px; overflow: hidden;
          width: 100%; max-width: 480px; max-height: 85vh;
          display: flex; flex-direction: column;
          box-shadow: 0 8px 30px rgba(0,0,0,0.3);
        }
        .popup-header {
          color: white; padding: 14px 16px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .popup-title { font-size: 16px; font-weight: 700; }
        .popup-close {
          background: rgba(255,255,255,0.2); border: none; color: white;
          width: 28px; height: 28px; border-radius: 6px; cursor: pointer;
          font-size: 18px; line-height: 1;
        }
        .popup-close:hover { background: rgba(255,255,255,0.35); }
        .popup-body { padding: 14px 16px; overflow-y: auto; }
        .popup-loading, .popup-error { text-align: center; padding: 24px; color: #888; font-size: 14px; }
        .popup-error { color: #c62828; }
        .popup-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .popup-table th {
          text-align: left; padding: 7px 10px; color: #666; font-weight: 600;
          width: 100px; white-space: nowrap; vertical-align: top;
          background: #fafafa; border-bottom: 1px solid #f2f2f2;
        }
        .popup-table td {
          padding: 7px 10px; color: #333; border-bottom: 1px solid #f2f2f2;
          word-break: break-all;
        }
        .popup-section { margin-bottom: 18px; }
        .popup-section-title {
          font-size: 13px; font-weight: 700; color: #333;
          margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #eee;
        }
        .price-note { font-size: 10px; font-weight: 400; color: #999; margin-left: 6px; }
        .price-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
        }
        .price-cell {
          background: #f8f9fb; border-radius: 8px; padding: 8px 10px;
          border: 1px solid #eef0f4;
        }
        .price-label { font-size: 10px; color: #888; margin-bottom: 2px; }
        .price-value { font-size: 13px; font-weight: 700; color: #222; }
        .popup-outlook {
          font-size: 13px; line-height: 1.6; color: #444;
          background: #fafbfd; border: 1px solid #eef0f4;
          border-radius: 8px; padding: 12px 14px;
          white-space: pre-wrap; word-break: break-all;
        }
        .popup-footer {
          padding: 10px 16px; border-top: 1px solid #eee;
          display: flex; align-items: center; justify-content: space-between;
          font-size: 11px; color: #999;
        }
        .popup-btn-close {
          background: #1976d2; border: none; color: white;
          padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;
        }
        .popup-btn-close:hover { background: #1565c0; }

        .chart-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center;
          z-index: 1001; padding: 12px;
        }
        .chart-popup-close {
          background: rgba(255,255,255,0.2); border: none; color: white;
          width: 28px; height: 28px; border-radius: 6px; cursor: pointer;
          font-size: 18px; line-height: 1;
        }
        .chart-popup-close:hover { background: rgba(255,255,255,0.35); }
        .chart-popup {
          background: white; border-radius: 12px; overflow: hidden;
          width: 100%; max-width: 760px;
          display: flex; flex-direction: column;
          box-shadow: 0 8px 30px rgba(0,0,0,0.3);
        }
        .chart-body { position: relative; height: 340px; padding-top: 5px; padding-bottom: 5px; box-sizing: border-box; }
        .chart-body stock-chart { display: block; width: 100%; height: 100%; }
        @media (max-width: 600px) {
          .chart-body { height: 280px; }
        }
        .chart-readout {
          position: absolute; top: 8px; left: 10px;
          display: none; flex-wrap: wrap; gap: 8px;
          font-size: 11px; color: #555;
          background: rgba(255,255,255,0.92); border: 1px solid #eef0f4;
          border-radius: 6px; padding: 3px 9px;
          pointer-events: none;
        }
        .chart-hint {
          font-size: 10px; color: #98a2b3; text-align: center;
          padding: 7px 10px; background: #fafbfc; border-top: 1px solid #f0f2f5;
        }
        .legend-up { color: #e5484d; font-weight: 700; }
        .legend-down { color: #3e63dd; font-weight: 700; }
        .chart-loading {
          height: 100%; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 10px;
          color: #667085; font-size: 13px;
        }
        .chart-error {
          height: 100%; display: flex; align-items: center; justify-content: center;
          color: #c62828; font-size: 13px;
        }

        @media (max-width: 759px) {
          .notice-table th, .notice-table td { padding: 8px 10px; }
          .company-grid { grid-template-columns: 1fr; }
        }
        @media (min-width: 760px) {
          .company-sub-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .disclosure-list { max-height: 176px; }
          .card { display: flex; flex-direction: column; max-height: 420px; }
          .notice-table-wrap { flex: 1; overflow-x: auto; overflow-y: auto; min-height: 0; }
          .acqdisp-wrap { max-height: none; flex: 1; min-height: 0; }
        }
      `;
    }

    // ---------- 이벤트 ----------

    @addEventListener('.header-back', 'click')
    onBackClick() {
      this.router?.go('/');
    }

    @addEventListener('.card-tab-btn', 'click', { delegate: true, root: 'light' })
    onCardTabClick(e: Event) {
      const btn = (e.target as HTMLElement).closest('.card-tab-btn') as HTMLElement;
      if (!btn?.dataset.code || !btn?.dataset.tab) return;
      const code = btn.dataset.code;
      const tab = btn.dataset.tab as 'applied' | 'traded';
      this.activeTabByCompany.set(code, tab);
      this.renderTabContent();
    }

    @addEventListener('.card-refresh', 'click', { delegate: true, root: 'light' })
    async onCardRefreshClick(e: Event) {
      const btn = (e.target as HTMLElement).closest('.card-refresh') as HTMLElement;
      if (!btn?.dataset.code) return;
      btn.classList.add('spinning');
      const isDisclosure = btn.dataset.code === 'disclosure';
      try {
        if (isDisclosure) {
          this.disclosures = await this.buybackService.getDisclosureList();
          this.lastUpdatedByCompany.set('disclosure', this.nowTime());
        } else {
          const company = this.companies.find(c => c.code === btn.dataset.code);
          if (!company) return;
          await this.loadCompany(company);
        }
        this.rerenderKeepingChart();
        const sel = isDisclosure ? '.disclosure-card' : `.card-refresh[data-code="${btn.dataset.code}"]`;
        const newCard = isDisclosure
          ? this.querySelector(sel)
          : this.querySelector(`${sel}`)?.closest('.card');
        if (newCard) {
          newCard.classList.add('flash');
          setTimeout(() => newCard.classList.remove('flash'), 600);
        }
      } catch (err: any) {
        this.error = err?.message || '데이터를 불러오지 못했습니다.';
        this.renderTabContent();
      } finally {
        btn.classList.remove('spinning');
      }
    }

    @addEventListener('.disclosure-row', 'click', { delegate: true, root: 'light' })
    onDisclosureRowClick(e: Event) {
      const row = (e.target as HTMLElement).closest('.disclosure-row') as HTMLElement;
      const url = row?.dataset.url;
      if (url) window.open(url, '_blank', 'noopener');
    }

    @addEventListener('.company-name-btn', 'click', { delegate: true, root: 'light' })
    async onCompanyNameClick(e: Event) {
      const btn = (e.target as HTMLElement).closest('.company-name-btn') as HTMLElement;
      const code = btn?.dataset.company;
      const company = this.companies.find(c => c.code === code);
      if (!company) return;
      this.popupCompany = company;
      this.popupInfo = null;
      this.popupLoading = true;
      this.popupError = '';
      this.lockScroll();
      this.renderTabContent();
      try {
        const info = await this.buybackService.getCompanyInfo(company.code);
        this.popupInfo = info;
      } catch (err: any) {
        this.popupError = err?.message || '기업정보를 불러오지 못했습니다.';
      } finally {
        this.popupLoading = false;
        this.renderTabContent();
      }
    }

    @addEventListener('.popup-overlay', 'click', { delegate: true, root: 'light' })
    onPopupOverlayClick(e: Event) {
      if ((e.target as HTMLElement) !== e.currentTarget) return;
      this.closePopup();
    }

    @addEventListener('.popup-close, .popup-btn-close', 'click', { delegate: true, root: 'light' })
    onPopupBtnClose() {
      this.closePopup();
    }

    private closePopup() {
      this.unlockScroll();
      this.popupCompany = null;
      this.popupInfo = null;
      this.popupLoading = false;
      this.popupError = '';
      this.renderTabContent();
    }

    @addEventListener('.card-chart-btn', 'click', { delegate: true, root: 'light' })
    async onChartBtnClick(e: Event) {
      const btn = (e.target as HTMLElement).closest('.card-chart-btn') as HTMLElement;
      const code = btn?.dataset.chart;
      const company = this.companies.find(c => c.code === code);
      if (!company) return;
      this.chartCompany = company;
      this.chartData = [];
      this.chartLoading = true;
      this.chartError = '';
      this.lockScroll();
      this.renderTabContent();
      try {
        const data = await this.buybackService.getChart(company.code);
        this.chartData = data;
        if (data.length === 0) this.chartError = '차트 데이터가 없습니다.';
      } catch (err: any) {
        this.chartError = err?.message || '차트 데이터를 불러오지 못했습니다.';
      } finally {
        this.chartLoading = false;
        this.renderTabContent();
      }
    }

    @addEventListener('.chart-overlay', 'click', { delegate: true, root: 'light' })
    onChartOverlayClick(e: Event) {
      if ((e.target as HTMLElement) !== e.currentTarget) return;
      this.closeChartPopup();
    }

    @addEventListener('.chart-popup-close', 'click', { delegate: true, root: 'light' })
    onChartPopupClose() {
      this.closeChartPopup();
    }

    private closeChartPopup() {
      this.unlockScroll();
      this.chartCompany = null;
      this.chartData = [];
      this.chartLoading = false;
      this.chartError = '';
      this.renderTabContent();
    }

    private lockScroll() {
      const html = this.ownerDocument?.documentElement;
      const body = this.ownerDocument?.body;
      if (html) html.style.overflow = 'hidden';
      if (body) body.style.overflow = 'hidden';
    }

    private unlockScroll() {
      const html = this.ownerDocument?.documentElement;
      const body = this.ownerDocument?.body;
      if (html) html.style.overflow = '';
      if (body) body.style.overflow = '';
    }

    // ---------- 템플릿 ----------

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display: block; min-height: 100vh; background: #f0f2f5; font-family: var(--font-family, sans-serif); }
          .header {
            display: flex; align-items: center; gap: 12px;
            padding: 16px 24px;
            background: linear-gradient(135deg, #1565c0 0%, #1976d2 60%, #42a5f5 100%);
            color: white;
          }
          .header-back {
            background: rgba(255,255,255,0.2); border: none; color: white;
            width: 40px; height: 40px; border-radius: 8px; cursor: pointer;
            display: flex; align-items: center; justify-content: center; font-size: 20px;
          }
          .header-back:hover { background: rgba(255,255,255,0.3); }
          .header-title { font-size: 22px; font-weight: 700; flex: 1; }
          .header-subtitle { font-size: 12px; opacity: 0.85; }
          .header-hits { height: 20px; border-radius: 4px; opacity: 0.9; margin-left: auto; }
          .content { padding: 20px; }
          @media (max-width: 600px) {
            .header { padding: 14px 16px; }
            .header-title { font-size: 18px; }
            .content { padding: 12px; }
          }
        </style>

        <div class="header">
          <button class="header-back" aria-label="Go home" title="홈으로">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
            </button>
          <div>
            <div class="header-title">💼 자사주 매입 신청 현황</div>
          </div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-buyback.svg?style=plastic&amp;"/>
        </div>

        <main class="content">
          <slot></slot>
        </main>
      `;
    }
  }

  return tagName;
};