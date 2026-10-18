import { Sim } from '@dooboostore/simple-boot';
import { ConstructorType } from '@dooboostore/core';

export namespace BuybackService {
  export const SYMBOL = Symbol.for('BuybackService');
}

export interface BuybackCompany {
  code: string;
  name: string;
  color: string;
}

export interface BuybackItem {
  companyName: string;
  companyCode: string;
  applDate: string;   // 신청일 (YYYYMMDD)
  tradeDate: string;  // 매입일 (YYYYMMDD)
  appliedQty: number; // 신청 수량
  typeCode: string;   // 취득/처분 구분 (1=취득, 2=처분, 0=신탁)
}

export interface BuybackTradedItem {
  companyName: string;
  companyCode: string;
  tradeDate: string;   // 체결일 (YYYYMMDD)
  appliedQty: number;  // 신청 수량
  tradedQty: number;   // 체결 수량
  typeCode: string;    // 취득/처분 구분
}

export interface BuybackDeclaration {
  companyName: string;
  companyCode: string;
  declDate: string;      // 신고일 (YYYYMMDD)
  startDate: string;     // 신고 시작일 (YYYYMMDD)
  endDate: string;       // 신고 종료일 (YYYYMMDD)
  declQty: number;       // 신고 수량
  typeCode: string;      // 신고 유형
}

export interface BuybackDisclosure {
  date: string;          // 신청일 (YYYY-MM-DD)
  title: string;         // 공시 제목
  acptNo: string;        // 접수번호
  docNo: string;         // 문서번호
  viewerUrl: string;     // 뷰어 링크
}

export interface BuybackCompanyInfo {
  korName: string;       // 한글명
  engName: string;       // 영문명
  stdCode: string;       // 표준코드
  stockCode: string;     // 종목코드
  founded: string;       // 설립일
  market: string;        // 시장구분
  ceo: string;           // 대표이사
  listed: string;        // 상장일
  capital: string;       // 자본금 (천원)
  employees: string;     // 종업원수
  closeMonth: string;    // 결산월
  phone: string;         // 전화번호
  industry: string;      // 업종
  products: string;      // 주요제품
  address: string;       // 주소
  homepage: string;      // 홈페이지
  price: {               // 주요시세
    current: string;     // 현재가
    ask: string;         // 매도호가
    bid: string;         // 매수호가
    change: string;      // 전일대비
    changePct: string;   // 등락율(%)
    prevClose: string;   // 전일가
    open: string;        // 시가
    high: string;        // 고가
    low: string;         // 저가
    volume: string;      // 거래량
    amount: string;      // 거래대금
    par: string;         // 액면가
    upper: string;       // 상한가
    lower: string;       // 하한가
    prevUpper: string;   // 전일상한
    prevLower: string;   // 전일하한
  };
  outlook: string;       // 현황 및 전망
}

export interface BuybackPriceInfo {
  isur_cd: string;
  rep_isu_srt_cd: string;
  rep_isu_cd: string;
  com_abbrv: string;
  halt_yn: string;
  gubun: string;
  trd_ddtm: string;
  uplmtprc: string;
  lwlmtprc: string;
  prevdd_clsprc: string;
  updown_prc: string;
  updown_per: string;
  prsnt_prc: string;
  acc_trdvol: string;
  acc_trdval: string;
  mktcap: string;
  tdd_opnprc: string;
  tdd_hgprc: string;
  tdd_lwprc: string;
  updown: string;
  spot_isu_trd_mkt_tp_cd: string;
  list_stat_cd: string;
  service_yn: string;
  etn_yn: string;
  isu_srt_cd: string | null;
  ind_nm: string | null;
}

export interface BuybackListStock {
  stkcert_kind_cd: string;
  typ: string;
  list_shrs: string;
}

export interface BuybackStockIssue {
  spot_isu_trd_mkt_tp_cd: string;
  isur_cd: string;
  list_dd: string;
  list_methd_tp_cd: string;
  stkcert_kind_cd: string;
  stkcert_kind_nm: string;
  isu_shrs: string;
  nparvalstk_yn: string;
  parval: string;
  isu_prc: string;
  stk_isu_rsn_cd: string;
  cd_val_nm: string;
  cntr_iso_cd: string;
  curr_iso_cd: string;
  cntr_iso_nm: string;
  curr_iso_nm: string;
}

export interface BuybackStockAcqDisp {
  spot_isu_trd_mkt_tp_cd: string;
  isu_cd: string;
  isu_kor_abbrv: string;
  trstk_decl_dd: string;
  trstk_acqstdisp_tp_cd: string;
  trstk_tp_cd: string;
  trstk_decl_strt_dd: string;
  trstk_decl_end_dd: string;
  trstk_decl_qty: string;
  trstk_acc_trd_qty: string;
  trstk_acc_trdval: string;
}

export interface BuybackStockStatusItem {
  priceInfo: BuybackPriceInfo;
  listStock: BuybackListStock[];
  stockIssue: BuybackStockIssue[];
  stockAcqDisp: BuybackStockAcqDisp[];
}

export interface BuybackStockStatusResponse {
  resultOk: boolean;
  resultCode: string;
  message: string;
  dataList: BuybackStockStatusItem[];
  dataListCount: number;
  processTimeMessage: string;
  processTimeMiliseconds: number;
}

export interface BuybackChartPoint {
  date: string;      // YYYY-MM-DD
  open: number;      // 시가
  high: number;      // 고가
  low: number;       // 저가
  close: number;     // 종가
  volume: number;    // 거래량
  gongsi: boolean;   // 공시 존재 여부
}

export interface BuybackService {
  getCompanies(): BuybackCompany[];
  getAppliedList(code: string): Promise<BuybackItem[]>;
  getTradedList(code: string): Promise<BuybackTradedItem[]>;
  getDeclaredList(code: string): Promise<BuybackDeclaration[]>;
  getDisclosureList(): Promise<BuybackDisclosure[]>;
  getCompanyInfo(code: string): Promise<BuybackCompanyInfo>;
  getStockStatus(company: BuybackCompany): Promise<BuybackStockStatusResponse | null>;
  getChart(code: string, months?: number): Promise<BuybackChartPoint[]>;
  searchCompany(keyword: string): Promise<{ code: string; name: string }[]>;
  getDeadline(item: BuybackItem): Date;
}

export default (container: symbol): ConstructorType<BuybackService> => {
  @Sim({ symbol: BuybackService.SYMBOL, container: container })
  class BuybackServiceImpl implements BuybackService {
    private readonly CORS_PROXY = 'https://sparkling-dew-b13c.visualkhh.workers.dev/?url=';
    private readonly API_BASE = 'https://mkind.krx.co.kr/api/trstk/applied';
    private readonly TRADED_API_BASE = 'https://mkind.krx.co.kr/api/trstk/traded';
    private readonly DECLARED_API_BASE = 'https://mkind.krx.co.kr/api/trstk/declared';
    private readonly SEARCH_BASE = 'https://kind.krx.co.kr/disclosure/searchtotalinfo.do';
    private readonly VIEWER_BASE = 'https://kind.krx.co.kr/common/disclsviewer.do';
    private readonly TOTALINFO_BASE = 'https://kind.krx.co.kr/corpdetail/totalinfo.do';
    private readonly CORP_LIST_BASE = 'https://kind.krx.co.kr/common/corpList.do';

    private readonly companies: BuybackCompany[] = [
      { code: '000660', name: 'SK하이닉스', color: '#ed1c24' },
      { code: '005930', name: '삼성전자', color: '#1428a0' },
    ];

    getCompanies(): BuybackCompany[] {
      return this.companies;
    }

    private buildUrl(base: string, code: string, fromDate?: string, toDate?: string, pageNo: number = 1): string {
      const now = new Date();
      fromDate ??= `${now.getFullYear()}-01-01`;
      toDate ??= `${now.getFullYear()}-12-31`;
      const tParam = pageNo === 1 ? `&_t=${Date.now()}` : '';
      const apiUrl = `${base}?marketType=&repIsuSrtCd=${code}&fromDate=${fromDate}&toDate=${toDate}&pageNo=${pageNo}${tParam}`;
      return `${this.CORS_PROXY}${encodeURIComponent(apiUrl)}${tParam}`;
    }

    async getAppliedList(code: string): Promise<BuybackItem[]> {
      try {
        const response = await fetch(this.buildUrl(this.API_BASE, code));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const json = await response.json();
        const allItems: any[] = json.dataList || [];
        return allItems
          .map((item: any) => ({
            companyName: item.com_abbrv,
            companyCode: item.rep_isu_srt_cd,
            applDate: item.trstk_appl_dd || '',
            tradeDate: item.trd_dd || '',
            appliedQty: Number(item.trstk_appl_qty) || 0,
            typeCode: item.trstk_acqstdisp_tp_cd || '',
          }))
          .sort((a: BuybackItem, b: BuybackItem) => b.applDate.localeCompare(a.applDate));
      } catch (e) {
        console.error('[BuybackService] Applied list fetch failed:', e);
        return [];
      }
    }

    async getTradedList(code: string): Promise<BuybackTradedItem[]> {
      try {
        const response = await fetch(this.buildUrl(this.TRADED_API_BASE, code));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const json = await response.json();

        const allItems: any[] = json.dataList || [];
        return allItems
          .map((item: any) => ({
            companyName: item.com_abbrv || '',
            companyCode: item.rep_isu_srt_cd || code,
            tradeDate: item.trd_dd || item.trstk_trd_dd || item.appl_dd || '',
            appliedQty: Number(
              item.trstk_appl_qty ??
              item.appl_qty ??
              0
            ) || 0,
            tradedQty: Number(
              item.trstk_trd_qty ??
              item.trd_qty ??
              item.acqst_qty ??
              item.trstk_acqst_qty ??
              item.qty ??
              0
            ) || 0,
            typeCode: item.trstk_acqstdisp_tp_cd || item.trstk_tp_cd || '',
          }))
          .sort((a: BuybackTradedItem, b: BuybackTradedItem) => b.tradeDate.localeCompare(a.tradeDate));
      } catch (e) {
        console.error('[BuybackService] Traded fetch failed:', e);
        return [];
      }
    }

    async getDeclaredList(code: string): Promise<BuybackDeclaration[]> {
      try {
        const response = await fetch(this.buildUrl(this.DECLARED_API_BASE, code));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const json = await response.json();

        const allItems: any[] = json.dataList || [];
        return allItems.map((item: any) => ({
          companyName: item.com_abbrv,
          companyCode: item.rep_isu_srt_cd,
          declDate: item.trstk_decl_dd || '',
          startDate: item.trstk_decl_strt_dd || '',
          endDate: item.trstk_decl_end_dd || '',
          declQty: Number(item.trstk_decl_qty) || 0,
          typeCode: item.trstk_tp_cd || '',
        }));
      } catch (e) {
        console.error('[BuybackService] Declared fetch failed:', e);
        return [];
      }
    }

    private async getCompanyCodes(code: string, name: string = ''): Promise<{ kisComCd: string; repIsuCd: string } | null> {
      try {
        const params = [
          'method=searchCorpList',
          'forward=corpList',
          'pageIndex=1',
          'beginIndex=',
          'currentPageSize=10',
          'delistFlag=Y',
          'sub=',
          'kwd=',
          'searchCorp=',
          `corpName=${encodeURIComponent(name)}`,
          'marketType=stockMkt',
        ].join('&');
        const response = await fetch(this.buildProxyUrl(`${this.CORP_LIST_BASE}?${params}`));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const html = await response.text();
        const isurCd = code.slice(0, 5);
        const pattern = new RegExp(`setCorpInfo\\('${isurCd}','(\\d+)','([^']+)'`);
        const match = html.match(pattern);
        return match ? { kisComCd: match[1], repIsuCd: match[2] } : null;
      } catch (e) {
        console.warn('[BuybackService] Company codes lookup failed:', e);
        return null;
      }
    }

    private buildProxyUrl(url: string): string {
      const separator = url.includes('?') ? '&' : '?';
      const targetUrl = `${url}${separator}_t=${Date.now()}`;
      return `${this.CORS_PROXY}${encodeURIComponent(targetUrl)}&_t=${Date.now()}`;
    }

    async getDisclosureList(): Promise<BuybackDisclosure[]> {
      try {
        const now = new Date();
        const fromDate = `${now.getFullYear()}-01-01`;
        const toDate = `${now.getFullYear()}-12-31`;
        const kwd = encodeURIComponent('자기주식매매 신청내역(유가증권시장)');
        const params = [
          'method=searchTotalInfoSub',
          'forward=searchtotalinfo_detail',
          'searchCodeType=char',
          `searchCorpName=${kwd}`,
          'repIsuSrtCd=',
          'isurCd=',
          'fdName=all_mktact_idx',
          'pageIndex=1',
          'currentPageSize=15',
          'scn=mktact',
          'repIsuCd=',
          'srchFd=2',
          `kwd=${kwd}`,
          `fromData=${fromDate}`,
          `toData=${toDate}`,
        ].join('&');
        const url = `${this.SEARCH_BASE}?${params}`;
        const response = await fetch(this.buildProxyUrl(url));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const items: BuybackDisclosure[] = [];
        doc.querySelectorAll('.subject a[onclick*="openDisclsViewer"]').forEach(a => {
          const onclick = a.getAttribute('onclick') || '';
          const match = onclick.match(/openDisclsViewer\('(\d+)', '(\d+)'/);
          if (!match) return;
          const acptNo = match[1];
          const docNo = match[2];
          const dateEl = a.closest('dt')?.querySelector('.date');
          const date = dateEl ? dateEl.textContent?.trim() || '' : '';
          const rawTitle = a.getAttribute('title') || '';
          const title = rawTitle.replace(/<[^>]+>/g, '');
          items.push({
            date,
            title,
            acptNo,
            docNo,
            viewerUrl: `${this.VIEWER_BASE}?method=search&acptno=${acptNo}&docno=${docNo}&viewerhost=&viewerport=`,
          });
        });
        return items;
      } catch (e) {
        console.error('[BuybackService] Disclosure search failed:', e);
        return [];
      }
    }

    async getCompanyInfo(code: string): Promise<BuybackCompanyInfo> {
      const isurCd = code.slice(0, 5);
      const matchedCompany = this.companies.find(c => c.code === code);
      const companyName = matchedCompany ? matchedCompany.name : '';
      const codes = await this.getCompanyCodes(code, companyName);

      let url = `${this.TOTALINFO_BASE}?method=searchTotalInfo&isurCd=${isurCd}`;
      if (codes) {
        url += `&kisComCd=${codes.kisComCd}&repIsuCd=${encodeURIComponent(codes.repIsuCd)}`;
      }
      const response = await fetch(this.buildProxyUrl(url));
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const norm = (s: string) => s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      const parsePairs = (root: Document): Map<string, string> => {
        const pairs = new Map<string, string>();
        root.querySelectorAll('table.detail:not(.tdr) tr').forEach(tr => {
          const ths = tr.querySelectorAll('th');
          const tds = tr.querySelectorAll('td');
          for (let i = 0; i < ths.length && i < tds.length; i++) {
            const key = norm(ths[i].textContent || '');
            const value = norm(tds[i].textContent || '');
            if (key) pairs.set(key, value);
          }
        });
        return pairs;
      };
      const pairs = parsePairs(doc);
      const get = (k: string) => pairs.get(k) || '-';
      const pick = (...keys: string[]) => {
        for (const k of keys) {
          const v = pairs.get(k);
          if (v) return v;
        }
        return '-';
      };

      const pricePairs = new Map<string, string>();
      doc.querySelectorAll('table.tdr tr').forEach(tr => {
        const ths = tr.querySelectorAll('th');
        const tds = tr.querySelectorAll('td');
        for (let i = 0; i < ths.length && i < tds.length; i++) {
          const key = norm(ths[i].textContent || '');
          const value = norm(tds[i].textContent || '');
          if (key) pricePairs.set(key, value);
        }
      });
      const pget = (k: string) => pricePairs.get(k) || '-';

      const outlookH2 = [...doc.querySelectorAll('h2')].find(h => h.textContent?.includes('현황 및 전망'));
      const outlook = outlookH2?.nextElementSibling?.textContent?.replace(/\u00a0/g, ' ').trim()
        || outlookH2?.closest('.section')?.textContent?.replace(/\u00a0/g, ' ').trim()
        || '-';

      return {
        korName: get('한글명'),
        engName: get('영문명'),
        stdCode: get('표준코드'),
        stockCode: get('종목코드'),
        founded: get('설립일'),
        market: get('시장구분'),
        ceo: get('대표이사'),
        listed: get('상장일'),
        capital: pick('자본금(천원)', '자본금 (천원)', '자본금'),
        employees: get('종업원수'),
        closeMonth: get('결산월'),
        phone: get('전화번호'),
        industry: get('업종'),
        products: get('주요제품'),
        address: get('주소'),
        homepage: get('홈페이지'),
        price: {
          current: pget('현재가'),
          ask: pget('매도호가'),
          bid: pget('매수호가'),
          change: pget('전일대비'),
          changePct: pget('등락율(%)'),
          prevClose: pget('전일가'),
          open: pget('시가'),
          high: pget('고가'),
          low: pget('저가'),
          volume: pget('거래량'),
          amount: pget('거래대금'),
          par: pget('액면가'),
          upper: pget('상한가'),
          lower: pget('하한가'),
          prevUpper: pget('전일상한'),
          prevLower: pget('전일하한'),
        },
        outlook,
      };
    }

    async getStockStatus(company: BuybackCompany): Promise<BuybackStockStatusResponse | null> {
      try {
        const url = `https://mkind.krx.co.kr/api/corp-detail/stockstatus?repIsuSrtCd=${company.code}&isurCd=&corpName=${encodeURIComponent(company.name)}`;
        const response = await fetch(this.buildProxyUrl(url));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const json = await response.json();
        return json;
      } catch (e) {
        console.error('[BuybackService] Stock status fetch failed:', e);
        return null;
      }
    }

    async getChart(code: string, months: number = 6): Promise<BuybackChartPoint[]> {
      try {
        const count = Math.min(300, Math.max(30, months * 21));
        const url = `https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=${count}&requestType=0`;
        const response = await fetch(this.buildProxyUrl(url));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const text = await response.text();
        const items = [...text.matchAll(/<item data="(\d{8})\|([\d.]+)\|([\d.]+)\|([\d.]+)\|([\d.]+)\|(\d+)"\s*\/?>/g)];
        return items.map(m => ({
          date: `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`,
          open: Number(m[2]) || 0,
          high: Number(m[3]) || 0,
          low: Number(m[4]) || 0,
          close: Number(m[5]) || 0,
          volume: Number(m[6]) || 0,
          gongsi: false,
        }));
      } catch (e) {
        console.error('[BuybackService] Chart fetch failed:', e);
        return [];
      }
    }

    async searchCompany(keyword: string): Promise<{ code: string; name: string }[]> {
      try {
        const url = `https://mkind.krx.co.kr/api/common/findcorp-ac?search_keyword=${encodeURIComponent(keyword)}`;
        const response = await fetch(this.buildProxyUrl(url));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const json = await response.json();
        const list = json.dataList || [];
        // findcorp-ac는 이름 검색 시 isu_cd=코드/corp_name=이름, 코드 검색 시 반대로 뒤집혀 반환될 수 있음 → 정규화
        return list.map((item: any) => {
          const a = String(item.isu_cd || item.code || '');
          const b = String(item.corp_name || item.name || '');
          const aIsCode = /^\d{6}$/.test(a);
          const bIsCode = /^\d{6}$/.test(b);
          return { code: aIsCode ? a : (bIsCode ? b : a), name: aIsCode ? b : a };
        });
      } catch (e) {
        console.error('[BuybackService] Company search failed:', e);
        return [];
      }
    }

    getDeadline(item: BuybackItem): Date {
      const d = item.applDate;
      const dateStr = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T18:00:00+09:00`;
      return new Date(dateStr);
    }
  }

  return BuybackServiceImpl;
};