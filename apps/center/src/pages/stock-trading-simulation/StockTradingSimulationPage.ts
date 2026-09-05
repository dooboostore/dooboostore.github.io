import { elementDefine, onConnectedBodyShadow, onConnectedBefore, onConnectedAfter, onInitialize, addEventListener, addEventListenerDocument, innerHtml, setAttribute } from '@dooboostore/simple-web-component';
import { Router } from '@dooboostore/core-web';
import { inject } from '@dooboostore/simple-boot';
import { TossService, TossChartTimeframe } from '../../services/toss/TossService';
import { findBestConfig, simulate, isResolveMode } from '../../services/stock/TradingSimulator';
import type { ExitConfig, MaConfig, ResolveMode, SimCandle, SimTrade } from '../../services/stock/TradingSimulator';

const tagName = 'center-stock-trading-simulation-page';

const DEFAULT_CANDLE_COUNT = 360;
const DEFAULT_TIMEFRAME: TossChartTimeframe = 'day:1';
const DEFAULT_CAPITAL = 100_000_000;
const DEFAULT_STOCK_CODE = 'A005930';

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class StockTradingSimulationPage extends w.HTMLElement {
    @onConnectedBefore
    @innerHtml((c, helper) => helper.$w.document.querySelector('title'), { valueKey: 'titleBody' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:title"]'), 'content', { valueKey: 'ogTitle' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="description"]'), 'content', { valueKey: 'desc' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:description"]'), 'content', { valueKey: 'ogDesc' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:image"]'), 'content', { valueKey: 'ogImage' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:image"]'), 'content', { valueKey: 'twitterImage' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:title"]'), 'content', { valueKey: 'twitterTitle' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:description"]'), 'content', { valueKey: 'twitterDesc' })
    setPageMeta() {
      return {
        titleBody: '주식 트레이딩 시뮬레이션 | @dooboostore',
        ogTitle: '주식 트레이딩 시뮬레이션 | @dooboostore',
        desc: '이동평균 골든/데드 크로스로 매매를 시뮬레이션하고 수익률을 확인해보세요.',
        ogDesc: '이동평균 골든/데드 크로스로 매매를 시뮬레이션하고 수익률을 확인해보세요.',
        ogImage: '/assets/images/stock-trading-simulation-og.png',
        twitterImage: '/assets/images/stock-trading-simulation-og.png',
        twitterTitle: '주식 트레이딩 시뮬레이션 | @dooboostore',
        twitterDesc: '이동평균 골든/데드 크로스로 매매를 시뮬레이션하고 수익률을 확인해보세요.',
      };
    }

    private router!: Router;
    private tossService!: TossService;
    private currentCode = DEFAULT_STOCK_CODE;
    private currentName = DEFAULT_STOCK_CODE;
    private chartCandles: SimCandle[] = [];
    // --- 시뮬레이션 구간 (chartCandles 인덱스, 양쪽 포함) — 기본 전체 ---
    private rangeStart = 0;
    private rangeEnd = -1;
    // URL(rs/re)로 복원된 구간 — 다음 로드 1회에만 리셋을 건너뜀
    private rangeFromUrl = false;
    // --- 트레이딩 설정 (상수에서 초기화) ---
    private candleCount = DEFAULT_CANDLE_COUNT;
    private timeframe: TossChartTimeframe = DEFAULT_TIMEFRAME;
    private initialCapital = DEFAULT_CAPITAL;
    private maConfigs: MaConfig[] = [];
    // --- 익절/손절 (상수에서 초기화) ---
    private takeProfitEnabled = false;
    private takeProfitPercent = 15;
    private takeProfitSellPercent = 80;
    private takeProfitSkip = 5;
    private takeProfitCandleFilter: 'any'|'bull'|'bear' = 'bull';
    private takeProfitVolumeFilter: 'any'|'higher'|'lower' = 'higher';
    private takeProfitBasis: 'profitRise'|'profitFall'|'peakFall'|'peakRise'|'none' = 'profitRise';
    private showCross = false;
    private requireAllMas = false;
    // 봉당 겹친 조건 확정 방식: 첫 조건만 / 마지막 조건만 / 방향별 합산 / 순합산 1건
    private maResolveMode: ResolveMode = 'minFirst';
    private exitResolveMode: ResolveMode = 'minFirst';
    // 종료일시 ('' = 최신). date input 값(YYYY-MM-DD) + time input 값(HH:MM, 분봉만)
    private endDate = '';
    private endTime = '';
    // 예상 추세 지수 0~1 (0=하락, 0.5=중립, 1=상승). 셀렉트 프리셋: 모름/횡보=0.5, 상승=1, 하락=0
    private trendScore = 0.5;
    private feePercent = 0.015;
    private stopLossEnabled = false;
    private stopLossPercent = 10;
    private stopLossSellPercent = 80;
    private stopLossSkip = 5;
    private stopLossCandleFilter: 'any'|'bull'|'bear' = 'bear';
    private stopLossVolumeFilter: 'any'|'higher'|'lower' = 'higher';
    private stopLossBasis: 'profitRise'|'profitFall'|'peakFall'|'peakRise'|'none' = 'profitFall';
    private exitConfigs: ExitConfig[] = [{ basis: 'profitRise', percent: 15, sellPercent: 100, skip: 5, candle: 'any', volume: 'any' }];
    // --- 시뮬레이션 결과 (마지막 계산값)
    private simCash = 0;
    private simShares = 0;
    private simFirstPrice = 0;
    private simReasonMap = new Map<number, string>();
    private simLastPrice = 0;
    private simTrades: SimTrade[] = [];

    private restoreSimFromUrl() {
      try {
        const p = this.router?.getSearchParams?.();
        if (!p) return;
        const cap = p.get('cap');
        if (cap) { const v = Number(cap); if (Number.isFinite(v) && v >= 10000) this.initialCapital = Math.floor(v); }
        const cnt = p.get('cnt');
        if (cnt) { const v = Number(cnt); if (Number.isFinite(v) && v >= 30 && v <= 1000) this.candleCount = Math.floor(v); }
        const tf = p.get('tf');
        if (tf && /^(min:\d+|day:1|week:1|month:1)$/.test(tf)) this.timeframe = tf as TossChartTimeframe;
        const ed = p.get('ed');
        if (ed && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(ed)) {
          const probe = new Date(ed.length <= 10 ? `${ed}T23:59:00` : `${ed}:00`);
          if (Number.isFinite(probe.getTime()) && probe.getTime() <= Date.now()) {
            this.endDate = ed.slice(0, 10);
            this.endTime = ed.length > 10 ? ed.slice(11, 16) : '';
          }
        }
        const tpEn = p.get('tpEn'); if (tpEn) this.takeProfitEnabled = tpEn === '1';
        const tp = p.get('tp'); if (tp) { const v = Number(tp); if (Number.isFinite(v) && v >= 0 && v <= 100) this.takeProfitPercent = v; }
        const tpSell = p.get('tpSell'); if (tpSell) { const v = Number(tpSell); if (Number.isFinite(v) && v >= 1 && v <= 100) this.takeProfitSellPercent = Math.floor(v); }
        const tpSkip = p.get('tpSkip'); if (tpSkip) { const v = Number(tpSkip); if (Number.isFinite(v) && v >= 0 && v <= 20) this.takeProfitSkip = Math.floor(v); }
        const tpCandle = p.get('tpCandle'); if (tpCandle && ['any','bull','bear'].includes(tpCandle)) this.takeProfitCandleFilter = tpCandle as any;
        const tpVol = p.get('tpVol'); if (tpVol && ['any','higher','lower'].includes(tpVol)) this.takeProfitVolumeFilter = tpVol as any;
        const cross = p.get('cross'); if (cross) this.showCross = cross === '1';
        const mall = p.get('mall'); if (mall) this.requireAllMas = mall === '1';
        const mres = p.get('mres'); const xres = p.get('xres'); const dup = p.get('dup');
        if (mres === 'sum') this.maResolveMode = 'all'; else if (isResolveMode(mres)) this.maResolveMode = mres; else if (mres === 'firstOne') this.maResolveMode = 'minFirst'; else if (mres === 'lastOne') this.maResolveMode = 'maxFirst'; else if (dup) this.maResolveMode = dup === '1' ? 'all' : 'minFirst';
        if (xres === 'sum') this.exitResolveMode = 'all'; else if (isResolveMode(xres)) this.exitResolveMode = xres; else if (xres === 'firstOne') this.exitResolveMode = 'minFirst'; else if (xres === 'lastOne') this.exitResolveMode = 'maxFirst'; else if (dup) this.exitResolveMode = 'minFirst';
        const trend = p.get('trend');
        if (trend === 'up') this.trendScore = 1;
        else if (trend === 'down') this.trendScore = 0;
        else if (trend !== null && trend !== '' && Number.isFinite(Number(trend))) this.trendScore = Math.max(0, Math.min(1, Number(trend)));
        const lambda = p.get('lambda');
        if (lambda !== null && lambda !== '' && Number.isFinite(Number(lambda))) {
          const v = Math.max(0, Number(lambda));
          this.riskAversion = [0, 0.5, 1].reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
        }
        const slEn = p.get('slEn'); if (slEn) this.stopLossEnabled = slEn === '1';
        const sl = p.get('sl'); if (sl) { const v = Number(sl); if (Number.isFinite(v) && v >= 0 && v <= 100) this.stopLossPercent = v; }
        const slSell = p.get('slSell'); if (slSell) { const v = Number(slSell); if (Number.isFinite(v) && v >= 1 && v <= 100) this.stopLossSellPercent = Math.floor(v); }
        const slSkip = p.get('slSkip'); if (slSkip) { const v = Number(slSkip); if (Number.isFinite(v) && v >= 0 && v <= 20) this.stopLossSkip = Math.floor(v); }
        const slCandle = p.get('slCandle'); if (slCandle && ['any','bull','bear'].includes(slCandle)) this.stopLossCandleFilter = slCandle as any;
        const slVol = p.get('slVol'); if (slVol && ['any','higher','lower'].includes(slVol)) this.stopLossVolumeFilter = slVol as any;
        const tpBasis = p.get('tpBasis'); if (tpBasis && ['profit','peak','profitRise','profitFall','peakFall','peakRise'].includes(tpBasis)) { if (tpBasis==='profit') this.takeProfitBasis='profitRise' as any; else if(tpBasis==='peak') this.takeProfitBasis='peakFall' as any; else this.takeProfitBasis=tpBasis as any; }
        const slBasis = p.get('slBasis'); if (slBasis && ['profit','peak','profitRise','profitFall','peakFall','peakRise'].includes(slBasis)) { if (slBasis==='profit') this.stopLossBasis='profitFall' as any; else if(slBasis==='peak') this.stopLossBasis='peakFall' as any; else this.stopLossBasis=slBasis as any; }
        const fee = p.get('fee'); if (fee) { const v = Number(fee); if (Number.isFinite(v) && v >= 0 && v <= 1) this.feePercent = v; }
        const rs = p.get('rs'); const re = p.get('re');
        if (rs !== null || re !== null) {
          const s = rs !== null ? Math.floor(Number(rs)) : 0;
          const e = re !== null ? Math.floor(Number(re)) : -1;
          if (Number.isFinite(s) && s >= 0 && Number.isFinite(e) && (e < 0 || e >= s)) {
            this.rangeStart = s; this.rangeEnd = e; this.rangeFromUrl = true;
          }
        }
        const exits = p.get('exits');
        if (exits) {
          try {
            const arr = JSON.parse(decodeURIComponent(exits));
            if (Array.isArray(arr) && arr.length) {
              const valid = arr.filter((x: any) => x && typeof x.basis === 'string');
              // 구버전 URL의 basis 'none'은 삭제 개념이므로 제외 (하위호환)
              const filtered = valid.filter((x: any) => x.basis !== 'none');
              if (filtered.length) {
                this.exitConfigs = filtered.map((x: any) => ({
                  basis: (['profitRise','profitFall','peakFall','peakRise'] as any).includes(x.basis) ? x.basis : 'profitRise',
                  percent: Math.max(1, Math.min(100, Number(x.percent) || 15)),
                  sellPercent: Math.max(1, Math.min(100, Number(x.sellPercent) || 100)),
                  skip: Math.max(0, Math.min(20, Number(x.skip) || 5)),
                  candle: x.candle === 'bull' ? 'bull' : x.candle === 'bear' ? 'bear' : 'any' as const,
                  volume: x.volume === 'higher' ? 'higher' : x.volume === 'lower' ? 'lower' : 'any' as const,
                }));
                const first = this.exitConfigs[0] as any;
                if (first) {
                  this.takeProfitBasis = first.basis;
                  this.takeProfitPercent = first.percent;
                  this.takeProfitSellPercent = first.sellPercent;
                  this.takeProfitSkip = first.skip;
                  this.takeProfitCandleFilter = first.candle;
                  this.takeProfitVolumeFilter = first.volume;
                  this.takeProfitEnabled = true;
                }
                if ((this.exitConfigs as any)[1]) {
                  const sec = (this.exitConfigs as any)[1];
                  this.stopLossBasis = sec.basis;
                  this.stopLossPercent = sec.percent;
                  this.stopLossSellPercent = sec.sellPercent;
                  this.stopLossSkip = sec.skip;
                  this.stopLossCandleFilter = sec.candle;
                  this.stopLossVolumeFilter = sec.volume;
                  this.stopLossEnabled = true;
                }
              } else {
                // 구버전에서 전부 안함이었으면 조건 없음으로 취급
                this.exitConfigs = [];
              }
            }
          } catch {}
        } else if (p.get('tpBasis') || p.get('slBasis') || p.get('tpEn') || p.get('slEn')) {
          const list: any[] = [];
          list.push({ basis: this.takeProfitBasis, percent: this.takeProfitPercent, sellPercent: this.takeProfitSellPercent, skip: this.takeProfitSkip, candle: this.takeProfitCandleFilter, volume: this.takeProfitVolumeFilter });
          if (this.stopLossBasis !== 'none') list.push({ basis: this.stopLossBasis, percent: this.stopLossPercent, sellPercent: this.stopLossSellPercent, skip: this.stopLossSkip, candle: this.stopLossCandleFilter, volume: this.stopLossVolumeFilter });
          if (list.length) this.exitConfigs = list as any;
        }
        const mas = p.get('mas');
        if (mas) {
          try {
            const decoded = decodeURIComponent(mas);
            const arr = JSON.parse(decoded);
            if (Array.isArray(arr) && arr.length) {
              const valid = arr.filter((x: any) => x && typeof x.period === 'number' && typeof x.color === 'string' && x.pyramiding && (x.pyramiding.signals || (x.pyramiding.golden && x.pyramiding.dead)));
              if (valid.length) {
                const normCandle = (v: any) => v === 'bull' ? 'bull' : v === 'bear' ? 'bear' : 'any' as const;
                const normVol = (v: any) => v === 'higher' ? 'higher' : v === 'lower' ? 'lower' : 'any' as const;
                const normAlign = (v: any) => ['aligned','reverse','largerAbove','largerBelow','smallerAbove','smallerBelow'].includes(v) ? v : 'any' as const;
                const TRADE_CONDS = ['consecutiveBuy','consecutiveSell','consecutiveSelected'] as const;
                const CANDLE_CONDS = ['consecutiveBullish','consecutiveBearish'] as const;
                const MA_CONDS = ['maDeviation','maSlope'] as const;
                const normOp = (v: any) => ['<','<=','=','>=','>','!='].includes(v) ? v : 'any' as const;
                const normCond = (c: any, valid: readonly string[], isMa: boolean) => ({
                  type: valid.includes(c?.type) ? c.type : 'any' as const,
                  operator: normOp(c?.operator),
                  value: isMa ? Math.max(-50, Math.min(50, Number(c?.value) || 0)) : Math.max(1, Math.min(20, Math.floor(Number(c?.value) || 1)))
                });
                const normSignal = (s: any) => {
                  const legacy = s.condition ?? {};
                  const route = (group: any, valid: readonly string[]) => group ?? ((valid as readonly string[]).includes(legacy.type) ? legacy : undefined);
                  return {
                    signal: s.signal === 'dead' ? 'dead' as const : 'golden' as const,
                    action: s.action === 'sell' ? 'sell' as const : 'buy' as const,
                    percent: Math.max(1, Math.min(100, Number(s.percent) || 20)),
                    candleFilter: normCandle(s.candleFilter),
                    volumeFilter: normVol(s.volumeFilter),
                    consecutive: Math.max(1, Math.min(10, Math.floor(Number(s.consecutive) || 2))),
                    alignment: normAlign(s.alignment),
                    condTrade: normCond(route(s.condTrade, TRADE_CONDS), TRADE_CONDS, false),
                    condCandle: normCond(route(s.condCandle, CANDLE_CONDS), CANDLE_CONDS, false),
                    condMa: normCond(route(s.condMa, MA_CONDS), MA_CONDS, true)
                  };
                };
                this.maConfigs = valid.map((x: any) => {
                  let signals: any[] = [];
                  if (Array.isArray(x.pyramiding.signals)) {
                    signals = x.pyramiding.signals.map(normSignal).filter((s:any)=> s.signal==='golden'||s.signal==='dead');
                  } else {
                    const g = x.pyramiding?.golden ?? {}; const d = x.pyramiding?.dead ?? {};
                    if (g && g.action !== 'none') signals.push(normSignal({ signal: 'golden', ...g }));
                    if (d && d.action !== 'none') signals.push(normSignal({ signal: 'dead', ...d }));
                    if (!signals.length) signals.push(normSignal({ signal: 'golden', action: 'buy', percent: 20, candleFilter: 'any', volumeFilter: 'any', consecutive: 2, alignment: 'any', condTrade: { type: 'any', operator: 'any', value: 1 }, condCandle: { type: 'any', operator: 'any', value: 1 }, condMa: { type: 'any', operator: 'any', value: 1 } }));
                  }
                  return {
                    period: Math.max(2, Math.min(500, Math.floor(Number(x.period)) || 10)),
                    color: typeof x.color === 'string' && /^#([0-9a-fA-F]{3,8})$/.test(x.color) ? x.color : '#6366f1',
                    pyramiding: { signals },
                  };
                });
                this.maConfigs.sort((a,b)=>a.period-b.period);
              }
            }
          } catch {}
        }
      } catch {}
    }

    private syncSimParamsToUrl() {
      try {
        const masStr = encodeURIComponent(JSON.stringify(this.maConfigs));
        const exitsStr = encodeURIComponent(JSON.stringify(this.exitConfigs));
        this.router?.replaceUpsertSearchParam?.({
          cap: String(this.initialCapital), cnt: String(this.candleCount), tf: this.timeframe, mas: masStr, exits: exitsStr,
          tpEn: this.takeProfitEnabled ? '1' : '0', tp: String(this.takeProfitPercent), tpSell: String(this.takeProfitSellPercent), tpSkip: String(this.takeProfitSkip), tpCandle: this.takeProfitCandleFilter, tpVol: this.takeProfitVolumeFilter, tpBasis: this.takeProfitBasis,
          cross: this.showCross ? '1' : '0',
          mall: this.requireAllMas ? '1' : '0',
          mres: this.maResolveMode, xres: this.exitResolveMode, trend: String(this.trendScore), lambda: String(this.riskAversion),
          ...(this.chartCandles.length ? (() => { const [zs, ze] = this.zoneRange(); return { rs: String(zs), re: String(ze) }; })() : {}),
          ed: this.endDate ? (this.endTime ? `${this.endDate}T${this.endTime}` : this.endDate) : '',
          slEn: this.stopLossEnabled ? '1' : '0', sl: String(this.stopLossPercent), slSell: String(this.stopLossSellPercent), slSkip: String(this.stopLossSkip), slCandle: this.stopLossCandleFilter, slVol: this.stopLossVolumeFilter, slBasis: this.stopLossBasis,
          fee: String(this.feePercent),
        });
      } catch {}
    }

    private syncUrlWithoutReload() {
      try {
        const url = new URL(window.location.href);
        const masStr = encodeURIComponent(JSON.stringify(this.maConfigs));
        url.searchParams.set('cap', String(this.initialCapital));
        url.searchParams.set('cnt', String(this.candleCount));
        url.searchParams.set('tf', this.timeframe);
        url.searchParams.set('mas', masStr);
        const exitsStr2 = encodeURIComponent(JSON.stringify(this.exitConfigs));
        url.searchParams.set('exits', exitsStr2);
        url.searchParams.set('tpEn', this.takeProfitEnabled ? '1' : '0');
        url.searchParams.set('tp', String(this.takeProfitPercent));
        url.searchParams.set('tpSell', String(this.takeProfitSellPercent));
        url.searchParams.set('tpSkip', String(this.takeProfitSkip));
        url.searchParams.set('tpCandle', this.takeProfitCandleFilter);
        url.searchParams.set('tpVol', this.takeProfitVolumeFilter);
        url.searchParams.set('tpBasis', this.takeProfitBasis);
        url.searchParams.set('cross', this.showCross ? '1' : '0');
        url.searchParams.set('mall', this.requireAllMas ? '1' : '0');
        url.searchParams.set('mres', this.maResolveMode);
        url.searchParams.set('xres', this.exitResolveMode);
        url.searchParams.set('trend', String(this.trendScore));
        url.searchParams.set('lambda', String(this.riskAversion));
        if (this.endDate) url.searchParams.set('ed', this.endTime ? `${this.endDate}T${this.endTime}` : this.endDate);
        else url.searchParams.delete('ed');
        if (this.chartCandles.length) {
          const [zs, ze] = this.zoneRange();
          url.searchParams.set('rs', String(zs));
          url.searchParams.set('re', String(ze));
        } else {
          url.searchParams.delete('rs');
          url.searchParams.delete('re');
        }
        url.searchParams.set('slEn', this.stopLossEnabled ? '1' : '0');
        url.searchParams.set('sl', String(this.stopLossPercent));
        url.searchParams.set('slSell', String(this.stopLossSellPercent));
        url.searchParams.set('slSkip', String(this.stopLossSkip));
        url.searchParams.set('slCandle', this.stopLossCandleFilter);
        url.searchParams.set('slVol', this.stopLossVolumeFilter);
        url.searchParams.set('slBasis', this.stopLossBasis);
        url.searchParams.set('fee', String(this.feePercent));
        window.history.replaceState(null, '', url.toString());
      } catch {}
    }

    private applySimConfigToForm() {
      const active = this.shadowRoot?.activeElement as HTMLElement | null;
      const capEl = this.shadowRoot?.querySelector('#sim-capital') as HTMLInputElement;
      const cntEl = this.shadowRoot?.querySelector('#sim-candle-count') as HTMLInputElement;
      const tfEl = this.shadowRoot?.querySelector('#sim-timeframe') as HTMLSelectElement;
      if (capEl && capEl !== active) capEl.value = String(this.initialCapital);
      if (cntEl && cntEl !== active) cntEl.value = String(this.candleCount);
      if (tfEl && tfEl !== active) tfEl.value = this.timeframe;
      const endDateEl = this.shadowRoot?.querySelector('#sim-end-date') as HTMLInputElement;
      const endDtEl = this.shadowRoot?.querySelector('#sim-end-datetime') as HTMLInputElement;
      if (endDateEl && endDateEl !== active) endDateEl.value = this.endDate;
      if (endDtEl && endDtEl !== active) endDtEl.value = this.endTime ? `${this.endDate}T${this.endTime}` : '';
      this.updateEndTimeVisibility();
      const tpEl = this.shadowRoot?.querySelector('#sim-tp') as HTMLInputElement;
      const tpSellEl = this.shadowRoot?.querySelector('#sim-tp-sell') as HTMLInputElement;
      const tpSkipEl = this.shadowRoot?.querySelector('#sim-tp-skip') as HTMLInputElement;
      const tpCandleEl = this.shadowRoot?.querySelector('#sim-tp-candle') as HTMLSelectElement;
      const tpVolEl = this.shadowRoot?.querySelector('#sim-tp-volume') as HTMLSelectElement;
      const crossEl = this.shadowRoot?.querySelector('#sim-show-cross') as HTMLInputElement;
      const slEl = this.shadowRoot?.querySelector('#sim-sl') as HTMLInputElement;
      const slSellEl = this.shadowRoot?.querySelector('#sim-sl-sell') as HTMLInputElement;
      const slSkipEl = this.shadowRoot?.querySelector('#sim-sl-skip') as HTMLInputElement;
      const slCandleEl = this.shadowRoot?.querySelector('#sim-sl-candle') as HTMLSelectElement;
      const slVolEl = this.shadowRoot?.querySelector('#sim-sl-volume') as HTMLSelectElement;
      if (tpEl) tpEl.value = String(this.takeProfitPercent);
      if (tpSellEl) tpSellEl.value = String(this.takeProfitSellPercent);
      if (tpSkipEl) tpSkipEl.value = String(this.takeProfitSkip);
      if (tpCandleEl) tpCandleEl.value = this.takeProfitCandleFilter;
      if (tpVolEl) tpVolEl.value = this.takeProfitVolumeFilter;
      const tpBasisEl = this.shadowRoot?.querySelector('#sim-tp-basis') as HTMLSelectElement;
      const slBasisEl = this.shadowRoot?.querySelector('#sim-sl-basis') as HTMLSelectElement;
      if (tpBasisEl) tpBasisEl.value = this.takeProfitBasis;
      if (slBasisEl) slBasisEl.value = this.stopLossBasis;
      this.updateTpSlVisibility();
      if (crossEl) crossEl.checked = this.showCross;
      const mallEl = this.shadowRoot?.querySelector('#sim-require-all-mas') as HTMLInputElement;
      if (mallEl) mallEl.checked = this.requireAllMas;
      const mresEl = this.shadowRoot?.querySelector('#sim-resolve-mode') as HTMLSelectElement;
      if (mresEl) mresEl.value = this.maResolveMode;
      const xresEl = this.shadowRoot?.querySelector('#sim-exit-resolve-mode') as HTMLSelectElement;
      if (xresEl) xresEl.value = this.exitResolveMode;
      const trendEl = this.shadowRoot?.querySelector('#sim-trend-type') as HTMLSelectElement;
      // 모름/횡보가 같은 값(0.5)이라 무조건 대입하면 첫 옵션(모름)으로 뒤집힘.
      // trend는 입력값이라 결과가 바꾸지 않음: 수치상 다를 때만(예: URL 복원) 갱신.
      if (trendEl && (!Number.isFinite(Number(trendEl.value)) || Number(trendEl.value) !== this.trendScore)) trendEl.value = String(this.trendScore);
      const presetEl = this.shadowRoot?.querySelector('#sim-optimize-preset') as HTMLSelectElement;
      if (presetEl) presetEl.value = String(this.riskAversion);
      if (slEl) slEl.value = String(this.stopLossPercent);
      if (slSellEl) slSellEl.value = String(this.stopLossSellPercent);
      if (slSkipEl) slSkipEl.value = String(this.stopLossSkip);
      if (slCandleEl) slCandleEl.value = this.stopLossCandleFilter;
      if (slVolEl) slVolEl.value = this.stopLossVolumeFilter;
      const feeEl = this.shadowRoot?.querySelector('#sim-fee') as HTMLInputElement;
      if (feeEl) feeEl.value = String(this.feePercent);
    }

    private updateTpSlVisibility() {
      const tpBasisEl = this.shadowRoot?.querySelector('#sim-tp-basis') as HTMLSelectElement;
      const slBasisEl = this.shadowRoot?.querySelector('#sim-sl-basis') as HTMLSelectElement;
      const tpIsNone = (tpBasisEl?.value ?? this.takeProfitBasis) === 'none';
      const slIsNone = (slBasisEl?.value ?? this.stopLossBasis) === 'none';
      const tpInputs = this.shadowRoot?.querySelector('#sim-tp-inputs') as HTMLElement;
      const slInputs = this.shadowRoot?.querySelector('#sim-sl-inputs') as HTMLElement;
      if (tpInputs) tpInputs.style.display = tpIsNone ? 'none' : '';
      if (slInputs) slInputs.style.display = slIsNone ? 'none' : '';
      const tpLabel = tpBasisEl?.closest('label') as HTMLElement;
      const slLabel = slBasisEl?.closest('label') as HTMLElement;
      if (tpLabel) tpLabel.classList.toggle('is-disabled', tpIsNone);
      if (slLabel) slLabel.classList.toggle('is-disabled', slIsNone);
      const tpOpts = tpLabel?.querySelector('.tp-sl-opts') as HTMLElement;
      const slOpts = slLabel?.querySelector('.tp-sl-opts') as HTMLElement;
      if (tpOpts) tpOpts.style.display = tpIsNone ? 'none' : '';
      if (slOpts) slOpts.style.display = slIsNone ? 'none' : '';
      const grid = this.shadowRoot?.querySelector('.tp-sl-grid') as HTMLElement;
      if (grid) grid.classList.toggle('is-single', tpIsNone || slIsNone);
    }

    private updateMaRowFieldsSingle() {
      this.shadowRoot?.querySelectorAll('.ma-row').forEach(row => {
        const fields = row.querySelector('.ma-row-fields') as HTMLElement;
        if (!fields) return;
        const signals = row.querySelectorAll('.ma-field');
        const isSingle = signals.length <= 1;
        fields.classList.toggle('is-single', isSingle);
      });
    }

    private autoOptimizeDone = false;

    @onInitialize
    async onInit(@inject(TossService.SYMBOL) tossService: TossService, router: Router) {
      this.tossService = tossService;
      this.router = router;
      this.restoreSimFromUrl();
      // 초기 파라미터(mas)가 없으면 하드코딩 기본값 URL 동기화 대신 최적화 1회로 채움
      let needsAutoOptimize = false;
      try {
        const p = router?.getSearchParams?.();
        needsAutoOptimize = !p?.get('mas');
      } catch {}
      try {
        const code = router?.getSearchParams?.()?.get('code');
        if (code) {
          const norm = code.trim();
          if (norm) {
            this.currentCode = /^[A-Z]/.test(norm) ? norm : `A${norm.replace(/^A/, '')}`;
            this.currentName = norm;
            try {
              let nm: string | undefined = (await this.tossService.getOverview(this.currentCode).catch(() => null))?.company?.name?.trim();
              if (!nm) {
                const prod = (await this.tossService.searchProduct(norm).catch(() => []))?.[0];
                nm = prod?.productName?.trim();
              }
              if (nm) this.currentName = nm;
            } catch {}
          }
        }
      } catch {}
      await this.loadStock(this.currentCode, this.currentName);
      // 초기값 없었으면 차트 로드 후 최적화 1회 실행해 기본 옵션 채움 (하드코딩 DEFAULT 대신)
      if (needsAutoOptimize && !this.autoOptimizeDone && this.chartCandles.length) {
        this.autoOptimizeDone = true;
        try {
          const titleEl = this.shadowRoot?.querySelector('#chart-title') as HTMLElement;
          if (titleEl) titleEl.textContent = '최적 조건 탐색 중... (데이터 분석 + 탐색)';
          await new Promise(r => setTimeout(r, 50));
          const best = findBestConfig(this.chartCandles, { ...this.engineOpts(), trend: this.trendScore });
          if (best) {
            this.maConfigs = (best.maConfigs as typeof this.maConfigs).slice().sort((a,b)=>a.period-b.period);
            this.requireAllMas = true; // 최적화 결과 적용 시 전체존재 조건 강제 (체크박스 포함)
            const _bm = (best as any).mres, _bx = (best as any).xres;
            if (isResolveMode(_bm)) this.maResolveMode = _bm; // 이긴 쪽 모드로 셀렉트 동기화
            if (isResolveMode(_bx)) this.exitResolveMode = _bx;
            if ((best as any).exits) {
              this.exitConfigs = (best as any).exits as any;
              const f = this.exitConfigs[0] as any; if (f) { this.takeProfitBasis = f.basis; this.takeProfitPercent = f.percent; this.takeProfitSellPercent = f.sellPercent; this.takeProfitSkip = f.skip; this.takeProfitCandleFilter = f.candle; this.takeProfitVolumeFilter = f.volume; this.takeProfitEnabled = true; }
              const s = (this.exitConfigs as any)[1]; if (s) { this.stopLossBasis = s.basis; this.stopLossPercent = s.percent; this.stopLossSellPercent = s.sellPercent; this.stopLossSkip = s.skip; this.stopLossCandleFilter = s.candle; this.stopLossVolumeFilter = s.volume; this.stopLossEnabled = true; } else { this.stopLossBasis = 'none' as any; this.stopLossEnabled = false; }
            } else {
              this.takeProfitEnabled = (best as any).tp.enabled;
              this.takeProfitPercent = (best as any).tp.percent;
              this.takeProfitSellPercent = (best as any).tp.sellPercent;
              this.takeProfitSkip = (best as any).tp.skip;
              this.takeProfitCandleFilter = (best as any).tp.candle as any;
              this.takeProfitVolumeFilter = (best as any).tp.volume as any;
              this.takeProfitBasis = (best as any).tp.basis ?? 'profitRise';
              this.stopLossEnabled = (best as any).sl.enabled;
              this.stopLossPercent = (best as any).sl.percent;
              this.stopLossSellPercent = (best as any).sl.sellPercent;
              this.stopLossSkip = (best as any).sl.skip;
              this.stopLossCandleFilter = (best as any).sl.candle as any;
              this.stopLossVolumeFilter = (best as any).sl.volume as any;
              this.stopLossBasis = (best as any).sl.basis ?? 'profitFall';
            }
            this.applySimConfigToForm();
            this.renderMaList();
            this.renderExitList();
            this.syncUrlWithoutReload();
            this.syncMasToChart();
            this.updateChartTitle();
          } else {
            // 최적화 실패 시에만 하드코딩 기본값 URL 반영 (fallback)
            this.syncSimParamsToUrl();
            this.updateChartTitle();
          }
        } catch {
          this.syncSimParamsToUrl();
        }
      } else if (needsAutoOptimize && !this.chartCandles.length) {
        // 캔들 로드 실패 시 fallback으로 기본값 URL 반영
        try { this.syncSimParamsToUrl(); } catch {}
      }
    }

    private lastStockPrice: { close: number; base: number | null } | null = null;

    private updateChartTitle() {
      const titleEl = this.shadowRoot?.querySelector('#chart-title') as HTMLElement;
      if (!titleEl) return;
      const tfLabel = this.timeframe.replace('day:','일봉 ').replace('week:','주봉 ').replace('month:','월봉 ').replace('min:','분봉 ');
      const activeLen = this.getActiveCandles().length;
      const rangeSuffix = (this.chartCandles.length && activeLen !== this.chartCandles.length)
        ? ` (구간 ${activeLen}개)`
        : '';
      // 종료일 지정 시 실제 데이터 마지막 봉 날짜 표시 (URL 공유 시 동일 화면 확인용)
      const endSuffix = (this.endDate && this.chartCandles.length)
        ? ` (~${this.chartCandles[this.chartCandles.length - 1]?.date ?? this.endDate})` : '';
      const countText = `${this.candleCount}개${rangeSuffix}${endSuffix}`;
      let pricePart = '';
      // stock-prices API 우선, 없으면 캔들 기반
      if (this.lastStockPrice && this.lastStockPrice.close != null) {
        const close = this.lastStockPrice.close;
        const base = this.lastStockPrice.base;
        const rate = base && base !== 0 ? ((close - base) / base) * 100 : null;
        const rateStr = rate == null ? '' : ` ${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`;
        const rateColor = rate == null ? '#64748b' : rate > 0 ? '#dc2626' : rate < 0 ? '#2563eb' : '#64748b';
        const isUS = /^(US|NAS|AMX|NYS)/.test(this.currentCode);
        const priceStr = `${Math.round(close).toLocaleString()}${isUS ? '$' : '원'}`;
        titleEl.innerHTML = `${this.currentName} (${this.currentCode.replace(/^A/, '')}) · <span style="font-weight:800;color:#1e293b">${priceStr}</span>${rateStr ? ` <span style="font-weight:700;color:${rateColor}">${rateStr}</span>` : ''} · ${tfLabel} ${countText}`;
        return;
      }
      if (this.chartCandles.length >= 2) {
        const last = this.chartCandles[this.chartCandles.length - 1];
        const prev = this.chartCandles[this.chartCandles.length - 2];
        const rate = prev.close ? ((last.close - prev.close) / prev.close) * 100 : 0;
        const rateStr = `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`;
        const isUS = /^(US|NAS|AMX|NYS)/.test(this.currentCode);
        const priceStr = `${Math.round(last.close).toLocaleString()}${isUS ? '$' : '원'}`;
        // 색상은 텍스트로만 전달할 수 있어 title은 문자열로, 색상은 별도 span이 필요하면 innerHTML로
        titleEl.innerHTML = `${this.currentName} (${this.currentCode.replace(/^A/, '')}) · <span style="font-weight:800;color:#1e293b">${priceStr}</span> <span style="font-weight:700;color:${rate > 0 ? '#dc2626' : rate < 0 ? '#2563eb' : '#64748b'}">${rateStr}</span> · ${tfLabel} ${countText}`;
        return;
      } else if (this.chartCandles.length === 1) {
        const last = this.chartCandles[0];
        const isUS = /^(US|NAS|AMX|NYS)/.test(this.currentCode);
        pricePart = ` · ${Math.round(last.close).toLocaleString()}${isUS ? '$' : '원'}`;
      }
      titleEl.textContent = `${this.currentName} (${this.currentCode.replace(/^A/, '')})${pricePart} · ${tfLabel} ${countText}`;
    }

    private async loadStock(code: string, name: string) {
      this.currentCode = code;
      this.currentName = name;
      try {
        const cur = this.router?.getSearchParams?.()?.get('code');
        if (cur !== code) this.router?.replaceUpsertSearchParam?.({ code });
      } catch {}
      const searchInput = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      if (searchInput) searchInput.value = name;
      this.updateChartTitle();

      try {
        const from = this.endDateToFrom();
        const chartRes = await this.tossService.getChart(code, { count: this.candleCount, timeframe: this.timeframe, ...(from ? { from } : {}) }).catch(() => null);
        const raw = chartRes?.candles ?? [];
        const isMin = this.timeframe.startsWith('min:');
        const isDayWeekMonth = this.timeframe === 'day:1' || this.timeframe === 'week:1' || this.timeframe === 'month:1';
        const sortedRaw = [...raw].sort((a, b) => a.dt.localeCompare(b.dt));
        const candles = sortedRaw.map(c => ({ date: isMin ? `${c.dt.slice(5, 10)} ${c.dt.slice(11, 16)}` : isDayWeekMonth ? c.dt.slice(2, 10) : c.dt, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
        this.chartCandles = candles;
        const sharedZone = this.rangeFromUrl;
        this.syncRangeSliderBounds(true);

        // 차트에 전체 tick + 구간 시뮬 마커 + 구간 rect 오버레이 + ma 주입
        const chartEl = this.shadowRoot?.querySelector('stock-chart') as HTMLElement;
        if (chartEl) {
          chartEl.innerHTML = this.buildChartHtml();
        }
        // 공유 링크 구간이면 차트 뷰도 해당 구간으로 (같은 화면 재현)
        if (sharedZone) this.focusZoneOnChart();
        this.updateResultDisplay();
        this.updateChartTitle();
        // 현재가 API로 타이틀 갱신 (code 진입 시에도 정확히 표시) — 실제 응답: { productCode, base, close }
        try {
          const sp = await this.tossService.getStockPrice(code).catch(() => null);
          if (sp && sp.close != null && sp.base != null) {
            this.lastStockPrice = { close: Number(sp.close), base: Number(sp.base) };
            this.updateChartTitle();
          }
        } catch {}

        // 개요로 이름 재확정
        if (!chartRes) {
          const inp2 = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
          if (inp2 && this.currentName === code) inp2.value = this.currentName;
        } else {
          try {
            const overview = await this.tossService.getOverview(code).catch(() => null);
            let resolvedName = overview?.company?.name?.trim();
            if (!resolvedName) {
              const prod = (await this.tossService.searchProduct(code).catch(() => []))?.[0];
              resolvedName = prod?.productName?.trim();
            }
            const isCodeLike = (v: string) => /^(A\d{6}|US.+|\d{6})$/.test(v.trim());
            if (resolvedName && (this.currentName === code || isCodeLike(this.currentName))) {
              this.currentName = resolvedName;
              const inp2 = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
              if (inp2) inp2.value = this.currentName;
              this.updateChartTitle();
            }
          } catch {}
        }
      } catch (e) { console.error(e); }
    }

    @addEventListener('.header-back', 'click')
    onBack() { this.router.go('/'); }

    @addEventListener('#stock-search-btn', 'click')
    onSearchBtn() { this.doSearch(); }

    private async doSearch() {
      const input = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      const q = input?.value.trim();
      if (!q) return;
      const box = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      const btn = this.shadowRoot?.querySelector('#stock-search-btn') as HTMLButtonElement;
      if (box) { box.innerHTML = `<div style="padding:12px;color:#64748b;display:flex;align-items:center;gap:8px"><span style="width:14px;height:14px;border:2px solid #e2e8f0;border-top-color:#f59e0b;border-radius:50%;display:inline-block;animation:spin 0.7s linear infinite"></span> 검색 중...</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>`; box.classList.add('show'); }
      if (btn) { btn.disabled = true; btn.textContent = '검색 중'; }
      if (input) input.setAttribute('aria-busy', 'true');
      let list: readonly any[] = [];
      try { list = await this.tossService.searchProduct(q); } catch { list = []; }
      if (!box) return;
      // stock-prices로 정확한 현재가 보강 (wts-auto-complete base/close보다 최신) — 실제 응답: { productCode, currency, base, close, volume }
      let priceMap = new Map<string, { close: number; base: number }>();
      try {
        const codes = list.slice(0, 10).map(it => it.productCode);
        const prices = await this.tossService.getStockPrices(codes).catch(() => [] as readonly any[]);
        for (const p of prices as any[]) {
          if (!p?.productCode || p.close == null || p.base == null) continue;
          priceMap.set(p.productCode, { close: Number(p.close), base: Number(p.base) });
        }
      } catch {}
      const fmtPrice = (v: number | null) => v == null ? '-' : Math.round(v).toLocaleString();
      box.innerHTML = list.slice(0, 10).map(it => {
        const isUS = /^(NSQ|NYS|NAS|AMX)/.test(it.market);
        const pm = priceMap.get(it.productCode);
        const close = pm?.close ?? (isUS ? it.close.usd : it.close.krw);
        const base = pm?.base ?? (isUS ? it.base.usd : it.base.krw);
        const rate = close != null && base != null && base !== 0 ? ((close - base) / base) * 100 : null;
        const rateStr = rate == null ? '' : `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`;
        const rateColor = rate == null ? '#64748b' : rate > 0 ? '#dc2626' : rate < 0 ? '#2563eb' : '#64748b';
        const priceStr = close == null ? '' : `${fmtPrice(close)}${isUS ? '$' : '원'}`;
        return `
        <div class="search-item" data-code="${it.productCode}" data-name="${it.productName}">
          <div style="flex:1"><div style="font-weight:700;font-size:13px">${it.productName}</div><div style="font-size:11px;color:#64748b">${it.productCode} · ${it.market}</div></div>
          <div style="text-align:right;min-width:92px"><div style="font-size:12px;font-weight:800;color:#1e293b">${priceStr}</div><div style="font-size:11px;font-weight:700;color:${rateColor}">${rateStr}</div></div>
          <div style="font-size:11px;color:#0ea5e9;margin-left:8px">선택</div>
        </div>`;
      }).join('') || `<div style="padding:12px;color:#64748b">결과 없음</div>`;
      box.classList.add('show');
      if (btn) { btn.disabled = false; btn.textContent = '검색'; }
      if (input) input.removeAttribute('aria-busy');
    }

    @addEventListener('#stock-search', 'keydown')
    onSearchKey(e: KeyboardEvent) {
      if (e.key === 'Enter') { e.preventDefault(); this.doSearch(); }
      if (e.key === 'Escape') {
        const b = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
        b?.classList.remove('show');
      }
    }

    @addEventListener('#stock-search-clear', 'click')
    onClearSearch() {
      const input = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      if (input) input.value = '';
      const box = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      box?.classList.remove('show');
      input?.focus();
    }

    @addEventListenerDocument('click')
    onDocClick(e: MouseEvent) {
      const box = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      if (!box?.classList.contains('show')) return;
      const wrap = this.shadowRoot?.querySelector('.search-wrap') as HTMLElement;
      const target = e.target as Node;
      if (wrap && target.isConnected && wrap.contains(target)) return;
      box.classList.remove('show');
    }

    @addEventListener('#search-results', 'click', { delegate: true })
    onPick(e: Event) {
      const el = (e.target as HTMLElement).closest('.search-item') as HTMLElement;
      if (!el) return;
      const code = el.dataset.code!;
      const name = el.dataset.name!;
      const box = this.shadowRoot?.querySelector('#search-results') as HTMLElement;
      box?.classList.remove('show');
      const input = this.shadowRoot?.querySelector('#stock-search') as HTMLInputElement;
      if (input) input.value = name;
      // 종목 변경 시 종료일 초기화 (최신 기준)
      this.endDate = ''; this.endTime = '';
      const endDateEl = this.shadowRoot?.querySelector('#sim-end-date') as HTMLInputElement;
      if (endDateEl) endDateEl.value = '';
      const endDtEl = this.shadowRoot?.querySelector('#sim-end-datetime') as HTMLInputElement;
      if (endDtEl) endDtEl.value = '';
      this.loadStock(code, name);
    }

    @onConnectedAfter
    onAfterConnected() {
      // URL에서 복원된 설정으로 폼/리스트 동기화
      this.applySimConfigToForm();
      this.renderMaList();
      this.renderExitList();
      this.syncRangeSliderBounds();
      this.updateChartTitle();
    }

    @addEventListener('#sim-config', 'change')
    onConfigFormChange(e: Event) {
      const target = e.target as HTMLElement;
      const isCandleRelated = !!target.closest('#sim-candle-count, #sim-timeframe');
      const prevCount = this.candleCount;
      const prevTf = this.timeframe;
      this.syncConfigFromForm();
      this.updateTpSlVisibility();
      if (isCandleRelated && (prevCount !== this.candleCount || prevTf !== this.timeframe)) {
        this.syncSimParamsToUrl();
        this.loadStock(this.currentCode, this.currentName);
      } else {
        this.syncUrlWithoutReload();
        this.syncMasToChart();
      }
    }

    @addEventListener('#sim-config', 'input')
    onConfigFormInput(e: Event) {
      const target = e.target as HTMLElement;
      const isCandleRelated = !!target.closest('#sim-candle-count, #sim-timeframe');
      const prevCount = this.candleCount;
      const prevTf = this.timeframe;
      this.syncConfigFromForm();
      this.updateTpSlVisibility();
      // input 중에는 URL 갱신 없이 차트만 갱신해 포커스 유지 (change에서 URL 반영)
      if (isCandleRelated && (prevCount !== this.candleCount || prevTf !== this.timeframe)) {
        this.syncSimParamsToUrl();
        this.loadStock(this.currentCode, this.currentName);
      } else {
        this.syncUrlWithoutReload();
        this.syncMasToChart();
      }
    }

    /** 종료일시 → from ISO (일봉 이하는 날짜 00:00, 분봉은 date+time). '' = 최신 */
    private endDateToFrom(): string {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(this.endDate)) return '';
      const isMin = this.timeframe.startsWith('min:');
      const hm = isMin && /^\d{2}:\d{2}$/.test(this.endTime) ? this.endTime : '00:00';
      return `${this.endDate}T${hm}:00+09:00`;
    }

    @addEventListener('#sim-candle-form', 'change')
    onCandleFormChange() {
      // alert(1)
      const prevCount = this.candleCount;
      const prevTf = this.timeframe;
      const prevEnd = `${this.endDate}|${this.endTime}`;
      this.syncConfigFromForm();
      this.updateEndTimeVisibility();
      this.syncSimParamsToUrl();
      if (prevCount !== this.candleCount || prevTf !== this.timeframe || prevEnd !== `${this.endDate}|${this.endTime}`) {
        this.loadStock(this.currentCode, this.currentName);
      } else {
        this.syncMasToChart();
      }
    }

    private updateEndTimeVisibility() {
      const isMin = this.timeframe.startsWith('min:');
      const dateField = this.shadowRoot?.querySelector('#sim-end-date-field') as HTMLElement;
      const dtField = this.shadowRoot?.querySelector('#sim-end-datetime-field') as HTMLElement;
      if (dateField) dateField.style.display = isMin ? 'none' : '';
      if (dtField) dtField.style.display = isMin ? '' : 'none';
    }



    private applyZone(start: number, end: number, focus: boolean) {
      const n = this.chartCandles.length;
      if (!n) return;
      const e = Math.max(0, Math.min(Math.floor(end), n - 1));
      const s = Math.max(0, Math.min(Math.floor(start), e));
      if (s === this.rangeStart && e === this.rangeEnd) return;
      this.rangeStart = s;
      this.rangeEnd = e;
      this.updateRangeLabels();
      this.syncMasToChart();
      this.syncUrlWithoutReload();
      if (focus) this.focusZoneOnChart();
    }

    @addEventListener('#sim-zone', 'input')
    onZoneInput(e: Event) {
      const v = (e.target as any)?.value;
      if (!v || typeof v !== 'object') return;
      const s = Number(v.start);
      const ed = Number(v.end);
      if (!Number.isFinite(s) || !Number.isFinite(ed)) return;
      this.applyZone(s, ed, false);
    }

    @addEventListener('#sim-zone', 'change')
    onZoneChange(e: Event) {
      const v = (e.target as any)?.value;
      if (!v || typeof v !== 'object') return;
      const s = Number(v.start);
      const ed = Number(v.end);
      if (!Number.isFinite(s) || !Number.isFinite(ed)) return;
      this.applyZone(s, ed, true);
    }

    @addEventListener('#add-ma-btn', 'click')
    onAddMa() {
      const maxPeriod = this.maConfigs.length ? Math.max(...this.maConfigs.map(m => m.period)) : 0;
      const cap = Math.max(5, Math.min(500, this.candleCount - 1));
      const nextPeriod = Math.min(cap, (maxPeriod || 0) + 10 || 10);
      const colors = ['#ef4444','#f59e0b','#10b981','#6366f1','#ec4899','#06b6d4'];
      const color = colors[this.maConfigs.length % colors.length];
      this.maConfigs.push({ period: nextPeriod, color, pyramiding: { signals: [
        { signal: 'golden', action: 'buy', percent: 20, candleFilter: 'bull', volumeFilter: 'higher', consecutive: 2, alignment: 'aligned', condTrade: { type: 'consecutiveSelected', operator: '>=', value: 4 }, condCandle: { type: 'any', operator: 'any', value: 1 }, condMa: { type: 'any', operator: 'any', value: 1 } },
        { signal: 'dead', action: 'sell', percent: 20, candleFilter: 'bear', volumeFilter: 'any', consecutive: 2, alignment: 'any', condTrade: { type: 'consecutiveSelected', operator: '>=', value: 4 }, condCandle: { type: 'any', operator: 'any', value: 1 }, condMa: { type: 'any', operator: 'any', value: 1 } }
      ] } });
      this.maConfigs.sort((a,b)=>a.period-b.period);
      this.renderMaList();
      this.syncConfigFromForm();
      this.syncSimParamsToUrl();
      this.syncMasToChart();
    }

    @addEventListener('#ma-list', 'click', { delegate: true })
    onAddSignal(e: Event) {
      const btn = (e.target as HTMLElement).closest('.add-signal-btn') as HTMLElement;
      if (!btn) return;
      const idx = Number(btn.dataset.idx);
      if (!Number.isFinite(idx)) return;
      const ma = this.maConfigs[idx];
      if (!ma) return;
      ma.pyramiding.signals.push({ signal: 'golden', action: 'buy', percent: 20, candleFilter: 'any', volumeFilter: 'any', consecutive: 2, alignment: 'any', condTrade: { type: 'any', operator: 'any', value: 1 }, condCandle: { type: 'any', operator: 'any', value: 1 }, condMa: { type: 'any', operator: 'any', value: 1 } });
      this.renderMaList();
      this.syncConfigFromForm();
      this.syncUrlWithoutReload();
      this.syncMasToChart();
    }

    @addEventListener('#ma-list', 'click', { delegate: true })
    onRemoveSignal(e: Event) {
      const btn = (e.target as HTMLElement).closest('.signal-remove') as HTMLElement;
      if (!btn) return;
      const field = btn.closest('.ma-field') as HTMLElement;
      const row = btn.closest('.ma-row') as HTMLElement;
      if (!field || !row) return;
      const idx = Number(row.dataset.idx);
      const sIdx = Number(btn.dataset.sidx);
      if (!Number.isFinite(idx) || !Number.isFinite(sIdx)) return;
      const ma = this.maConfigs[idx];
      if (!ma) return;
      ma.pyramiding.signals.splice(sIdx, 1);
      if (!ma.pyramiding.signals.length) {
        ma.pyramiding.signals.push({ signal: 'golden', action: 'buy', percent: 20, candleFilter: 'any', volumeFilter: 'any', consecutive: 2, alignment: 'any', condTrade: { type: 'any', operator: 'any', value: 1 }, condCandle: { type: 'any', operator: 'any', value: 1 }, condMa: { type: 'any', operator: 'any', value: 1 } });
      }
      this.renderMaList();
      this.syncConfigFromForm();
      this.syncUrlWithoutReload();
      this.syncMasToChart();
    }

    @addEventListener('#ma-list', 'input', { delegate: true })
    onMaListInput(e: Event) {
      const target = e.target as HTMLElement;
      if (!target.closest('.ma-row')) return;
      if (target.classList.contains('ma-color-input')) {
        const dot = target.closest('.ma-color') as HTMLElement;
        const v = (target as HTMLInputElement).value;
        if (dot && /^#[0-9a-fA-F]{6}$/.test(v)) { dot.setAttribute('data-color', v); dot.style.background = v; }
      }
      this.syncConfigFromForm();
      this.syncUrlWithoutReload();
      this.syncMasToChart();
    }

    @addEventListener('#ma-list', 'change', { delegate: true })
    onMaListChange(e: Event) {
      const target = e.target as HTMLElement;
      if (!target.closest('.ma-row')) return;
      if (target.classList.contains('ma-action') || target.classList.contains('ma-signal')) {
        (target as HTMLElement).dataset.v = (target as HTMLSelectElement).value;
      }
      this.syncConfigFromForm();
      this.updateMaRowFieldsSingle();
      this.syncUrlWithoutReload();
      this.syncMasToChart();
    }

    @addEventListener('#add-exit-btn', 'click')
    onAddExit() {
      this.exitConfigs.push({ basis: 'profitRise', percent: 15, sellPercent: 100, skip: 5, candle: 'any', volume: 'any' });
      this.renderExitList();
      this.syncConfigFromForm();
      this.syncSimParamsToUrl();
      this.syncMasToChart();
    }

    @addEventListener('#exit-list', 'click', { delegate: true })
    onRemoveExit(e: Event) {
      const btn = (e.target as HTMLElement).closest('.exit-remove') as HTMLElement;
      if (!btn) return;
      const idx = Number(btn.dataset.idx);
      if (Number.isFinite(idx)) {
        this.exitConfigs.splice(idx, 1);
        this.renderExitList();
        this.syncConfigFromForm();
        this.syncSimParamsToUrl();
        this.syncMasToChart();
      }
    }

    @addEventListener('#exit-list', 'change', { delegate: true })
    onExitChange(e: Event) {
      const target = e.target as HTMLElement;
      if (!target.matches('.exit-basis, .exit-candle, .exit-volume')) return;
      if (!target.closest('.ma-row')) return;
      this.syncConfigFromForm();
      this.syncUrlWithoutReload();
      this.syncMasToChart();
    }


    @addEventListener('#sim-optimize-preset', 'change')
    onPresetChange() {
      this.syncConfigFromForm();
      this.syncUrlWithoutReload();
    }

    @addEventListener('#sim-optimize-btn', 'click', { preventDefault: true, stopPropagation: true })
    async onOptimizeClick(e: Event) {
      const btn = e.target as HTMLButtonElement;
      this.syncConfigFromForm();
      if (!this.chartCandles.length) {
        await this.loadStock(this.currentCode, this.currentName);
        if (!this.chartCandles.length) return;
      }
      btn.disabled = true;
      const origText = btn.textContent;
      btn.textContent = '최적 탐색 중...';
      try {
        await new Promise(r => setTimeout(r, 50));
        console.log('[sim] optimize input:', JSON.stringify({ candles: this.chartCandles.length, ...this.engineOpts(), riskAversion: this.riskAversion, trend: this.trendScore }));
        const best = findBestConfig(this.chartCandles, { ...this.engineOpts(), riskAversion: this.riskAversion, trend: this.trendScore });
        if (best) {
          this.maConfigs = (best.maConfigs as typeof this.maConfigs).slice().sort((a,b)=>a.period-b.period);
          this.requireAllMas = true; // 최적화 결과 적용 시 전체존재 조건 강제 (체크박스 포함)
          const _bm = (best as any).mres, _bx = (best as any).xres;
          if (isResolveMode(_bm)) this.maResolveMode = _bm; // 이긴 쪽 모드로 셀렉트 동기화
          if (isResolveMode(_bx)) this.exitResolveMode = _bx;
          if ((best as any).exits) {
            this.exitConfigs = (best as any).exits as any;
            const f2 = this.exitConfigs[0] as any; if (f2) { this.takeProfitBasis = f2.basis; this.takeProfitPercent = f2.percent; this.takeProfitSellPercent = f2.sellPercent; this.takeProfitSkip = f2.skip; this.takeProfitCandleFilter = f2.candle; this.takeProfitVolumeFilter = f2.volume; this.takeProfitEnabled = true; }
            const s2 = (this.exitConfigs as any)[1]; if (s2) { this.stopLossBasis = s2.basis; this.stopLossPercent = s2.percent; this.stopLossSellPercent = s2.sellPercent; this.stopLossSkip = s2.skip; this.stopLossCandleFilter = s2.candle; this.stopLossVolumeFilter = s2.volume; this.stopLossEnabled = true; } else { this.stopLossBasis = 'none' as any; this.stopLossEnabled = false; }
          } else {
            this.takeProfitEnabled = (best as any).tp.enabled;
            this.takeProfitPercent = (best as any).tp.percent;
            this.takeProfitSellPercent = (best as any).tp.sellPercent;
            this.takeProfitSkip = (best as any).tp.skip;
            this.takeProfitCandleFilter = (best as any).tp.candle as any;
            this.takeProfitVolumeFilter = (best as any).tp.volume as any;
            this.takeProfitBasis = (best as any).tp.basis ?? 'profitRise';
            this.stopLossEnabled = (best as any).sl.enabled;
            this.stopLossPercent = (best as any).sl.percent;
            this.stopLossSellPercent = (best as any).sl.sellPercent;
            this.stopLossSkip = (best as any).sl.skip;
            this.stopLossCandleFilter = (best as any).sl.candle as any;
            this.stopLossVolumeFilter = (best as any).sl.volume as any;
            this.stopLossBasis = (best as any).sl.basis ?? 'profitFall';
          }
          this.showCross = false;
          this.applySimConfigToForm();
          this.renderMaList();
          this.renderExitList();
          this.syncUrlWithoutReload();
          this.syncMasToChart();
        }
      } finally {
        btn.disabled = false;
        if (origText) btn.textContent = origText;
      }
    }

    @addEventListener('#sim-reload-btn', 'click', { preventDefault: true, stopPropagation: true })
    onReloadCandles() {
      this.syncConfigFromForm();
      this.syncSimParamsToUrl();
      this.loadStock(this.currentCode, this.currentName);
    }

    @addEventListener('#sim-candle-form', 'submit', { preventDefault: true, stopPropagation: true })
    onCandleFormSubmit() {
      this.syncConfigFromForm();
      this.syncSimParamsToUrl();
      this.loadStock(this.currentCode, this.currentName);
    }



    @addEventListener('#sim-share-fab', 'click')
    async onShareFab() {
      const url = window.location.href;
      const title = `주식 트레이딩 · ${this.currentName}`;
      const text = `[${this.currentName}]의 종목 트레이딩을 확인해보세요!`;
      const fab = this.shadowRoot?.querySelector('#sim-share-fab') as HTMLElement;
      const flash = () => {
        if (!fab) return;
        fab.textContent = '✓';
        fab.classList.add('copied');
        setTimeout(() => { if (fab.textContent === '✓') { fab.textContent = '🔗'; fab.classList.remove('copied'); } }, 1500);
      };
      try {
        if ((navigator as any).share) {
          await (navigator as any).share({ title, text, url });
        } else {
          await navigator.clipboard?.writeText(url);
          flash();
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          try { await navigator.clipboard?.writeText(url); flash(); } catch {}
        }
      }
    }

    @addEventListener('#ma-list', 'change', { delegate: true })
    onMaCondTypeChange(e: Event) {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('ma-condtrade-type') && !target.classList.contains('ma-condcandle-type') && !target.classList.contains('ma-condma-type')) return;
      const label = (target as HTMLElement).closest('label') as HTMLElement;
      if (!label) return;
      const isAny = (target as HTMLSelectElement).value === 'any';
      const selects = label.querySelectorAll('select');
      const input = label.querySelector('input') as HTMLElement;
      const op = selects[1] as HTMLElement;
      if (op) op.style.display = isAny ? 'none' : '';
      if (input) input.style.display = isAny ? 'none' : '';
    }

    @addEventListener('#ma-list', 'click', { delegate: true })
    onMaHelpClick(e: Event) {
      const raw = ((e as any).composedPath?.()?.[0] ?? e.target) as HTMLElement;
      const help = raw.closest('.ma-help') as HTMLElement;
      if (!help) return;
      console.log('[MA-HELP-DBG] help', help?.getAttribute?.('data-help')?.slice(0,60));
      e.preventDefault();
      e.stopPropagation();
      let tip = help.getAttribute('data-help');
      if (!tip) return;
      // 배지는 이미 이스케이프된 HTML 엔티티를 포함하므로 디코딩
      tip = tip.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const pop = this.shadowRoot?.querySelector('#ma-help-popover') as HTMLElement;
      if (!pop) return;
      if (pop.classList.contains('show') && pop.textContent === tip) {
        pop.classList.remove('show');
        return;
      }
      pop.textContent = tip;
      pop.classList.add('show');
      const rect = help.getBoundingClientRect();
      const popW = 280;
      let left = rect.left + rect.width / 2 - popW / 2;
      left = Math.max(8, Math.min(window.innerWidth - popW - 8, left));
      let top = rect.bottom + 8;
      if (top + 60 > window.innerHeight) top = rect.top - 50;
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
      setTimeout(() => {
        const hide = (ev: Event) => {
          const t = ((ev as any).composedPath?.()?.[0] ?? ev.target) as Node;
          if (pop.contains(t) || help.contains(t as Node)) return;
          pop.classList.remove('show');
          document.removeEventListener('click', hide);
        };
        setTimeout(() => document.addEventListener('click', hide), 0);
      }, 0);
    }

    @addEventListener('#sim-history-body', 'click', { delegate: true })
    onHistoryHelpClick(e: Event) {
      const raw = ((e as any).composedPath?.()?.[0] ?? e.target) as HTMLElement;
      const help = raw.closest('.ma-help') as HTMLElement;
      if (!help) return;
      e.preventDefault();
      e.stopPropagation();
      let tip = help.getAttribute('data-help');
      if (!tip) return;
      tip = tip.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const pop = this.shadowRoot?.querySelector('#ma-help-popover') as HTMLElement;
      if (!pop) return;
      if (pop.classList.contains('show') && pop.textContent === tip) {
        pop.classList.remove('show');
        return;
      }
      pop.textContent = tip;
      pop.classList.add('show');
      const rect = help.getBoundingClientRect();
      const popW = 280;
      let left = rect.left + rect.width / 2 - popW / 2;
      left = Math.max(8, Math.min(window.innerWidth - popW - 8, left));
      let top = rect.bottom + 8;
      if (top + 60 > window.innerHeight) top = rect.top - 50;
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
      setTimeout(() => {
        const hide = (ev: Event) => {
          const t = ((ev as any).composedPath?.()?.[0] ?? ev.target) as Node;
          if (pop.contains(t) || help.contains(t as Node)) return;
          pop.classList.remove('show');
          document.removeEventListener('click', hide);
        };
        setTimeout(() => document.addEventListener('click', hide), 0);
      }, 0);
    }

    @addEventListener('#sim-config', 'click', { delegate: true })
    onSimConfigHelpClick(e: Event) {
      const raw = ((e as any).composedPath?.()?.[0] ?? e.target) as HTMLElement;
      const help = raw.closest('.ma-help') as HTMLElement;
      if (!help) return;
      if (help.closest('#ma-list')) return;
      e.preventDefault();
      e.stopPropagation();
      let tip = help.getAttribute('data-help');
      if (!tip) return;
      tip = tip.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const pop = this.shadowRoot?.querySelector('#ma-help-popover') as HTMLElement;
      if (!pop) return;
      if (pop.classList.contains('show') && pop.textContent === tip) {
        pop.classList.remove('show');
        return;
      }
      pop.textContent = tip;
      pop.classList.add('show');
      const rect = help.getBoundingClientRect();
      const popW = 280;
      let left = rect.left + rect.width / 2 - popW / 2;
      left = Math.max(8, Math.min(window.innerWidth - popW - 8, left));
      let top = rect.bottom + 8;
      if (top + 60 > window.innerHeight) top = rect.top - 50;
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
      setTimeout(() => {
        const hide = (ev: Event) => {
          const t = ((ev as any).composedPath?.()?.[0] ?? ev.target) as Node;
          if (pop.contains(t) || help.contains(t as Node)) return;
          pop.classList.remove('show');
          document.removeEventListener('click', hide);
        };
        setTimeout(() => document.addEventListener('click', hide), 0);
      }, 0);
    }

    @addEventListener('#ma-list', 'click', { delegate: true })
    onRemoveMa(e: Event) {
      const btn = (e.target as HTMLElement).closest('.ma-remove') as HTMLElement;
      if (!btn) return;
      const idx = Number(btn.dataset.idx);
      if (Number.isFinite(idx)) {
        this.maConfigs.splice(idx, 1);
        this.renderMaList();
        this.syncConfigFromForm();
        this.syncSimParamsToUrl();
        this.syncMasToChart();
      }
    }

    private buildTicksHtml(candles: SimCandle[], simFrom = 0, simTo = candles.length - 1): string {
      const r = simulate(candles, this.maConfigs, this.exitConfigs, {
        initialCapital: this.initialCapital, feePercent: this.feePercent,
        requireAll: this.requireAllMas, maMode: this.maResolveMode, xMode: this.exitResolveMode,
        simFrom, simTo,
      });
      this.simReasonMap.clear();
      for (const { idx, reason } of r.reasons) this.simReasonMap.set(idx, reason);
      this.simCash = r.cash;
      this.simShares = r.shares;
      this.simFirstPrice = r.firstPrice;
      this.simLastPrice = r.lastPrice;
      this.simTrades = r.trades;
      const tradeAtIdx = r.tradeAtIdx;
      const crossAtIdx = r.crossAtIdx;

      return candles.map((c, i) => {
        const crosses = crossAtIdx.get(i) ?? [];
        const trades = tradeAtIdx.get(i) ?? [];
        // G/D: 크로스표시 체크 시에만 라인+라벨 생성
        const crossHtml = this.showCross ? crosses.map(x => `<line width="1" color="${x.color}"></line><tooltip position="${x.label==='G'?'bottom':'top'}" label="${x.label}" label-color="${x.color}" line-color="${x.color}"></tooltip>`).join('') : '';
        // B/S: 실제 체결 — 캔들 팁에 붙는 라벨 (fill로 강조, 라인 없음)
        const tradeHtml = trades.map(t => `<tooltip position="${t.position}" label="${t.label}" fill-color="${t.color}" label-color="#fff"></tooltip>`).join('');
        return `<candle date="${c.date}" open="${c.open}" high="${c.high}" low="${c.low}" close="${c.close}" volume="${c.volume}">${crossHtml}${tradeHtml}</candle>`;
      }).join('');
    }

    /** 구간 슬라이더로 선택된 캔들만 반환 (최적화·시뮬 공통 — 차트는 전체 유지) */
    /** 선택 구간 [start, end] (엔진 simFrom/simTo 공용) */
    private zoneRange(): [number, number] {
      const n = this.chartCandles.length;
      if (!n) return [0, -1];
      const end = this.rangeEnd < 0 ? n - 1 : Math.min(this.rangeEnd, n - 1);
      return [Math.max(0, Math.min(this.rangeStart, end)), end];
    }

    // 낙폭 회피 계수 λ (score = profit − λ·MDD). 0=수익만, 0.5=기본, 1.5=손실회피
    private riskAversion = 0.5;

    private engineOpts() {
      const [simFrom, simTo] = this.zoneRange();
      return {
        simFrom, simTo,
        initialCapital: this.initialCapital, feePercent: this.feePercent,
        maMode: this.maResolveMode, xMode: this.exitResolveMode,
        riskAversion: this.riskAversion,
      };
    }

    private getActiveCandles(): SimCandle[] {
      if (!this.chartCandles.length) return [];
      const end = this.rangeEnd < 0 ? this.chartCandles.length - 1 : Math.min(this.rangeEnd, this.chartCandles.length - 1);
      const start = Math.max(0, Math.min(this.rangeStart, end));
      return this.chartCandles.slice(start, end + 1);
    }

    /** 캔들 로드 후 슬라이더 범위 재설정 (reset=true면 전체 선택) */
    private syncRangeSliderBounds(reset = false) {
      const n = this.chartCandles.length;
      const slider = this.shadowRoot?.querySelector('#sim-zone') as any;
      if (!n) return;
      if (this.rangeFromUrl) { this.rangeFromUrl = false; }
      else if (reset || this.rangeEnd < 0) { this.rangeStart = 0; this.rangeEnd = n - 1; }
      this.rangeStart = Math.max(0, Math.min(this.rangeStart, n - 1));
      this.rangeEnd = Math.max(this.rangeStart, Math.min(this.rangeEnd < 0 ? n - 1 : this.rangeEnd, n - 1));
      if (slider) {
        slider.setAttribute('min', '0');
        slider.setAttribute('max', String(n - 1));
        slider.setAttribute('step', '1');
        if (typeof slider.setValues === 'function') {
          slider.setValues({ start: this.rangeStart, end: this.rangeEnd });
        }
      }
      this.updateRangeLabels();
    }

    private updateRangeLabels() {
      const n = this.chartCandles.length;
      const sEl = this.shadowRoot?.querySelector('#sim-range-start') as HTMLElement | null;
      const eEl = this.shadowRoot?.querySelector('#sim-range-end') as HTMLElement | null;
      const cEl = this.shadowRoot?.querySelector('#sim-range-count') as HTMLElement | null;
      if (!n) {
        if (sEl) sEl.textContent = '-';
        if (eEl) eEl.textContent = '-';
        if (cEl) cEl.textContent = '0개';
        return;
      }
      const end = this.rangeEnd < 0 ? n - 1 : Math.min(this.rangeEnd, n - 1);
      const start = Math.max(0, Math.min(this.rangeStart, end));
      if (sEl) sEl.textContent = this.chartCandles[start]?.date ?? '-';
      if (eEl) eEl.textContent = this.chartCandles[end]?.date ?? '-';
      if (cEl) cEl.textContent = `${end - start + 1}개`;
      // 슬라이더를 현재 구간에 동기화 (속성 변경은 input/change를 발생시키지 않음)
      const zone = this.shadowRoot?.querySelector('#sim-zone') as any;
      if (zone && typeof zone.setValues === 'function') {
        const cur = zone.value;
        if (!cur || cur.start !== start || cur.end !== end) {
          zone.setValues({ start, end });
        }
      }
    }

    /** 차트는 불러온 캔들 전체 + 전체 기준 MA로 그리고, 매매 마커만 선택 구간에 표시 */
    private buildChartHtml(): string {
      const n = this.chartCandles.length;
      if (!n) return '';
      const end = this.rangeEnd < 0 ? n - 1 : Math.min(this.rangeEnd, n - 1);
      const start = Math.max(0, Math.min(this.rangeStart, end));
      // MA·크로스는 전체 캔들 기준, 매매 시뮬은 구간으로만 (마커 절대위치 부착)
      const ticksHtml = this.buildTicksHtml(this.chartCandles, start, end);
      const sDate = this.chartCandles[start]?.date ?? '';
      const eDate = this.chartCandles[end]?.date ?? '';
      const zoneRect = (start > 0 || end < n - 1) && sDate && eDate
        ? `<rect date-start="${sDate}" date-end="${eDate}" fill="rgba(124,58,237,0.08)" stroke="#7c3aed" stroke-width="1" target="all"></rect>`
        : '';
      return ticksHtml + zoneRect + this.maConfigs.map(ma => `<ma color="${ma.color}" size="${ma.period}"></ma>`).join('');
    }

    /** 차트 뷰를 선택 구간으로 포커싱 (슬라이더 조작 시에만 호출) */
    private focusZoneOnChart() {
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as any;
      const n = this.chartCandles.length;
      if (!chartEl || !n || typeof chartEl.setView !== 'function') return;
      const end = this.rangeEnd < 0 ? n - 1 : Math.min(this.rangeEnd, n - 1);
      const start = Math.max(0, Math.min(this.rangeStart, end));
      if (start > 0 || end < n - 1) chartEl.setView(start, end);
    }

    private syncMasToChart() {
      const chartEl = this.shadowRoot?.querySelector('stock-chart') as HTMLElement;
      if (!chartEl || !this.chartCandles.length) return;
      chartEl.innerHTML = this.buildChartHtml();
      this.updateResultDisplay();
    }

    private updateResultDisplay() {
      const evalAmt = this.simCash + this.simShares * this.simLastPrice;
      const profit = evalAmt - this.initialCapital;
      const rate = this.initialCapital ? (profit / this.initialCapital) * 100 : 0;
      const fmt = (n: number) => Math.round(n).toLocaleString();
      const fmtRate = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
      const sharesEl = this.shadowRoot?.querySelector('#sim-shares') as HTMLElement;
      const evalEl = this.shadowRoot?.querySelector('#sim-eval') as HTMLElement;
      const rateEl = this.shadowRoot?.querySelector('#sim-rate') as HTMLElement;
      const cashEl = this.shadowRoot?.querySelector('#sim-cash') as HTMLElement;
      const holdingEl = this.shadowRoot?.querySelector('#sim-holding') as HTMLElement;
      const profitEl = this.shadowRoot?.querySelector('#sim-profit') as HTMLElement;
      const countEl = this.shadowRoot?.querySelector('#sim-trade-count') as HTMLElement;
      if (sharesEl) sharesEl.textContent = `${Math.floor(this.simShares).toLocaleString()}주`;
      if (evalEl) evalEl.textContent = `${fmt(evalAmt)}원`;
      if (rateEl) {
        rateEl.textContent = fmtRate(rate);
        rateEl.style.color = rate > 0 ? '#dc2626' : rate < 0 ? '#2563eb' : '#64748b';
      }
      if (cashEl) cashEl.textContent = `${fmt(this.simCash)}원`;
      if (holdingEl) holdingEl.textContent = `${fmt(Math.floor(this.simShares) * this.simLastPrice)}원`;
      if (profitEl) {
        profitEl.textContent = `${profit >= 0 ? '+' : ''}${fmt(profit)}원`;
        profitEl.style.color = profit > 0 ? '#dc2626' : profit < 0 ? '#2563eb' : '#64748b';
      }
      if (countEl) countEl.textContent = `${this.simTrades.length}건`;
      const feeTotalEl = this.shadowRoot?.querySelector('#sim-fee-total') as HTMLElement;
      if (feeTotalEl) {
        const totalFee = this.simTrades.reduce((s, t) => s + (t.fee || 0), 0);
        feeTotalEl.textContent = `${fmt(totalFee)}원`;
      }
      // 단순 보유(첫틱 종가 → 마지막틱 종가) 가정 수익률/평가액 — 거래 없어도 항상 표시
      const holdRate = this.simFirstPrice ? ((this.simLastPrice - this.simFirstPrice) / this.simFirstPrice) * 100 : 0;
      const holdEval = this.simFirstPrice ? Math.round(this.initialCapital * (this.simLastPrice / this.simFirstPrice)) : this.initialCapital;
      const holdRateEl = this.shadowRoot?.querySelector('#sim-hold-rate') as HTMLElement;
      const holdEvalEl = this.shadowRoot?.querySelector('#sim-hold-eval') as HTMLElement;
      const holdFirstEl = this.shadowRoot?.querySelector('#sim-hold-first') as HTMLElement;
      const holdLastEl = this.shadowRoot?.querySelector('#sim-hold-last') as HTMLElement;
      if (holdRateEl) {
        holdRateEl.textContent = this.simFirstPrice ? fmtRate(holdRate) : '-';
        holdRateEl.style.color = holdRate > 0 ? '#dc2626' : holdRate < 0 ? '#2563eb' : '#64748b';
      }
      if (holdEvalEl) holdEvalEl.textContent = this.simFirstPrice ? `${fmt(holdEval)}원` : '-';
      if (holdFirstEl) holdFirstEl.textContent = this.simFirstPrice ? `${fmt(this.simFirstPrice)}원` : '-';
      if (holdLastEl) holdLastEl.textContent = this.simLastPrice ? `${fmt(this.simLastPrice)}원` : '-';
      // 모달이 열려있으면 리스트도 갱신
      const modal = this.shadowRoot?.querySelector('#sim-history-modal') as HTMLElement;
      if (modal?.classList.contains('show')) this.renderHistoryList();
    }

    @addEventListener('#sim-history-btn', 'click')
    onHistoryOpen() {
      this.renderHistoryList();
      const modal = this.shadowRoot?.querySelector('#sim-history-modal') as HTMLElement;
      modal?.classList.add('show');
    }

    @addEventListener('#sim-history-close', 'click')
    onHistoryClose() {
      const modal = this.shadowRoot?.querySelector('#sim-history-modal') as HTMLElement;
      modal?.classList.remove('show');
    }

    @addEventListener('#sim-history-modal', 'click')
    onHistoryBackdrop(e: Event) {
      const modal = e.currentTarget as HTMLElement;
      if (e.target === modal) modal.classList.remove('show');
    }

    @addEventListener('#sim-history-body', 'click', { delegate: true })
    onCondSumClick(e: Event) {
      const el = (e.target as HTMLElement).closest('.hcond-sum') as HTMLElement;
      if (!el) return;
      const tidx = Number(el.dataset.tidx);
      if (!Number.isFinite(tidx)) return;
      this.renderCondDetail(tidx);
      const modal = this.shadowRoot?.querySelector('#sim-cond-modal') as HTMLElement;
      modal?.classList.add('show');
    }

    private renderCondDetail(tidx: number) {
      const body = this.shadowRoot?.querySelector('#sim-cond-body') as HTMLElement;
      const title = this.shadowRoot?.querySelector('#sim-cond-title') as HTMLElement;
      if (!body) return;
      const t = this.simTrades.find(x => x.idx === tidx);
      if (!t) { body.innerHTML = `<div style="padding:16px;color:#94a3b8;font-size:12px">해당 거래를 찾을 수 없습니다.</div>`; return; }
      const fmt = (n: number) => Math.round(n).toLocaleString();
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const isExit = t.maPeriod === 0;
      const badgeText = isExit ? '매도 (청산)' : (t.action === 'buy' ? '매수' : '매도');
      const profitText = t.profitRate == null ? '-' : `${t.profitRate >= 0 ? '+' : ''}${t.profitRate.toFixed(2)}%`;
      const condList = (t.conds && t.conds.length ? t.conds : []);
      // 칩을 건별로 그룹핑: 선행 '+ '/'− ' 칩이 새 멤버 조건의 시작 (집행분은 첫 그룹)
      const groups: { kind: 'exec' | 'plus' | 'minus'; chips: string[] }[] = [];
      let cur: { kind: 'exec' | 'plus' | 'minus'; chips: string[] } = { kind: 'exec', chips: [] };
      for (const part of condList) {
        if (part.startsWith('+ ')) { groups.push(cur); cur = { kind: 'plus', chips: [part.slice(2)] }; }
        else if (part.startsWith('− ') || part.startsWith('- ')) { groups.push(cur); cur = { kind: 'minus', chips: [part.slice(2)] }; }
        else cur.chips.push(part);
      }
      groups.push(cur);
      const chip = (s: string, extra = '') => `<span class="hcond" style="cursor:default${extra}">${esc(s)}</span>`;
      const execChips = groups.length && groups[0].kind === 'exec' ? groups[0].chips : [];
      const memberGroups = groups.length && groups[0].kind === 'exec' ? groups.slice(1) : groups;
      let plusNo = 0; let minusNo = 0;
      const memberRows = memberGroups.filter(g => g.chips.length).map(g => {
        const label = g.kind === 'plus' ? `합산 ${++plusNo}` : `상쇄 ${++minusNo}`;
        return `<div class="cond-detail-row"><span class="k">${label}</span><span class="v">${g.chips.map(c => chip(c)).join('')}</span></div>`;
      }).join('');
      const detailList = (t.condDetail && t.condDetail.length ? t.condDetail : []);
      const detailRows = detailList.length
        ? `<div class="cond-detail-row"><span class="k">구성</span><span class="v">${detailList.map((d, di) => `<div class="hdetail">${di + 1}. ${esc(d)}</div>`).join('')}</span></div>` : '';
      if (title) title.textContent = `🔍 조건 상세 #${t.idx} (${t.date})`;
      body.innerHTML = `
        <div class="cond-detail-row"><span class="k">구분</span><span class="v">${badgeText}</span></div>
        <div class="cond-detail-row"><span class="k">시세</span><span class="v">${fmt(t.price)}원</span></div>
        <div class="cond-detail-row"><span class="k">수량</span><span class="v">${Math.floor(t.sharesDelta).toLocaleString()}주 (${fmt(t.amount)}원)</span></div>
        <div class="cond-detail-row"><span class="k">수익률</span><span class="v">${profitText}</span></div>
        <div class="cond-detail-row"><span class="k">체결</span><span class="v">${execChips.map((c, i) => chip(c, i === 0 ? ';background:#ede9fe;color:#6d28d9;font-weight:800' : '')).join('') || '-'}</span></div>
        ${memberRows}
        ${detailRows}
        <div class="cond-detail-reason">${esc(this.simReasonMap.get(t.idx) || '사유 없음')}</div>`;
    }

    @addEventListener('#sim-cond-close', 'click')
    onCondClose() {
      const modal = this.shadowRoot?.querySelector('#sim-cond-modal') as HTMLElement;
      modal?.classList.remove('show');
    }

    @addEventListener('#sim-cond-modal', 'click')
    onCondBackdrop(e: Event) {
      const modal = e.currentTarget as HTMLElement;
      if (e.target === modal) modal.classList.remove('show');
    }

    @addEventListenerDocument('keydown')
    onHistoryEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        const cond = this.shadowRoot?.querySelector('#sim-cond-modal') as HTMLElement;
        if (cond?.classList.contains('show')) { cond.classList.remove('show'); return; }
        const modal = this.shadowRoot?.querySelector('#sim-history-modal') as HTMLElement;
        if (modal?.classList.contains('show')) modal.classList.remove('show');
      }
    }

    private renderHistoryList() {
      const body = this.shadowRoot?.querySelector('#sim-history-body') as HTMLElement;
      if (!body) return;
      const fmtHold = (n: number) => Math.round(n).toLocaleString();
      const holdRate = this.simFirstPrice ? ((this.simLastPrice - this.simFirstPrice) / this.simFirstPrice) * 100 : 0;
      const holdEval = this.simFirstPrice ? Math.round(this.initialCapital * (this.simLastPrice / this.simFirstPrice)) : this.initialCapital;
      const holdHeader = this.simFirstPrice ? `<div style="padding:8px 14px;font-size:11px;color:#64748b;display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid #f1f5f9;background:#fffbeb"> <span>단순보유 <b style="color:${holdRate>0?'#dc2626':holdRate<0?'#2563eb':'#64748b'}">${holdRate>=0?'+':''}${holdRate.toFixed(2)}%</b> (${fmtHold(this.simFirstPrice)}원 → ${fmtHold(this.simLastPrice)}원)</span> <span>평가 <b style="color:#1e293b">${fmtHold(holdEval)}원</b></span> <span style="margin-left:auto;color:#94a3b8">첫틱~마지막틱 종가 기준</span></div>` : '';
      if (!this.simTrades.length) {
        body.innerHTML = `${holdHeader}<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px">체결된 거래가 없습니다.<br/>매매 조건을 완화하거나 기간을 조정해 보세요.</div>`;
        return;
      }
      const fmt = (n: number) => Math.round(n).toLocaleString();
      const fmtDate = (s: string) => {
        if (s.includes('T')) {
          const d = s.slice(0, 10);
          const t = s.slice(11, 16);
          if (/^\d{2}:\d{2}$/.test(t)) return `${d} ${t}`;
          return d;
        }
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        return s.slice(0, 16);
      };
      const evalAmt = this.simCash + this.simShares * this.simLastPrice;
      const buyCnt = this.simTrades.filter(t=>t.action==='buy').length;
      const sellCnt = this.simTrades.filter(t=>t.action==='sell').length;
      const exitCnt = this.simTrades.filter(t=>t.maPeriod===0).length;
      const holdingVal = Math.round(this.simShares * this.simLastPrice);
      const totalFee = this.simTrades.reduce((s, t) => s + (t.fee || 0), 0);
      body.innerHTML = `
        <div class="hist-summary">
          <div class="hist-stat"><div class="k">총 체결</div><div class="v">${this.simTrades.length}건</div></div>
          <div class="hist-stat"><div class="k">매수</div><div class="v" style="color:#2563eb">${buyCnt}건</div></div>
          <div class="hist-stat"><div class="k">매도</div><div class="v" style="color:#ef4444">${sellCnt}건</div><div class="s">(청산 ${exitCnt}건)</div></div>
          <div class="hist-stat"><div class="k">수수료</div><div class="v" style="font-size:12px">${fmt(totalFee)}원</div></div>
        </div>
        <div class="hist-sub"><span>최종 평가 <b>${fmt(evalAmt)}원</b> <span style="color:#94a3b8">(보유 ${Math.floor(this.simShares).toLocaleString()}주 ${fmt(holdingVal)}원 + 현금 ${fmt(Math.round(this.simCash))}원)</span></span><span style="margin-left:auto">단순보유 <b style="color:${holdRate>0?'#dc2626':holdRate<0?'#2563eb':'#64748b'}">${holdRate>=0?'+':''}${holdRate.toFixed(2)}%</b> <span style="color:#94a3b8">(${fmtHold(this.simFirstPrice)}원 → ${fmtHold(this.simLastPrice)}원)</span></span></div>
        <div class="hist-scroll">
        <table class="hist-table">
          <thead>
            <tr class="hgroup"><th colspan="9">매매</th><th colspan="5" class="hold">보유</th></tr>
            <tr><th style="text-align:left">#</th><th style="text-align:left">날짜</th><th>구분</th><th>조건</th><th class="num">시세</th><th class="num">수량</th><th class="num">금액</th><th class="num">수수료</th><th class="num">수익률</th><th class="num hold">보유주식</th><th class="num hold">평가금액</th><th class="num hold">평균가격</th><th class="num hold">현금</th><th class="num hold">총자산</th></tr>
          </thead>
          <tbody>
            ${this.simTrades.map((t, i) => {
        const isExit = t.maPeriod === 0;
        const badgeText = isExit ? '매도 (청산)' : (t.action==='buy'?'매수 B':'매도 S');
        const badgeCls = isExit ? 'hbadge exit' : (t.action==='buy'?'hbadge buy':'hbadge sell');
        const condList = (t.conds && t.conds.length ? t.conds : (isExit ? [`청산 ${t.percent}%`] : [`MA${t.maPeriod} ${t.percent}%`]));
        // 요약 숫자는 칩 개수가 아니라 건수(팝업 그룹 수) 기준: 단건 청산(1)/MA(1), 합산 멤버 추가마다 +1
        const grpCount = (() => {
          let n = 0; let has = false;
          for (const part of condList) {
            if (part.startsWith('+ ') || part.startsWith('− ') || part.startsWith('- ')) n++;
            else if (!has) { has = true; }
          }
          return (has ? 1 : 0) + n;
        })();
        const condSum = isExit ? `청산(${grpCount})` : `MA${t.maPeriod}(${grpCount})`;
        const profitText = t.profitRate == null ? '-' : `${t.profitRate >= 0 ? '+' : ''}${t.profitRate.toFixed(2)}%`;
        const profitColor = t.profitRate == null ? '#94a3b8' : t.profitRate > 0 ? '#dc2626' : t.profitRate < 0 ? '#2563eb' : '#64748b';
        const avgPriceText = t.sharesAfter > 0 ? `${fmt(Math.round(t.avgPrice))}원` : '-';
        const holdingValText = `${fmt(Math.round(t.holdingValue))}원`;
        const total = Math.round(t.cashAfter + t.holdingValue);
        const prevTotal = i === 0 ? this.initialCapital : Math.round(this.simTrades[i-1].cashAfter + this.simTrades[i-1].holdingValue);
        const totalColor = total > prevTotal ? '#dc2626' : total < prevTotal ? '#2563eb' : '#1e293b';
        return `
              <tr class="hrow">
                <td class="dim">${t.idx}</td>
                <td>${fmtDate(t.date)}</td>
                <td style="text-align:center"><span class="${badgeCls}">${badgeText}</span></td>
                <td style="text-align:center"><span class="hcond-sum" data-tidx="${t.idx}" title="클릭하면 조건 상세">${condSum}</span></td>
                <td class="num">${fmt(t.price)}원</td>
                <td class="num">${Math.floor(t.sharesDelta).toLocaleString()}주</td>
                <td class="num">${fmt(t.amount)}원</td>
                <td class="num" style="color:#64748b">${fmt(t.fee || 0)}원</td>
                <td class="num" style="color:${profitColor};font-weight:700">${profitText}</td>
                <td class="num hold">${Math.floor(t.sharesAfter).toLocaleString()}주</td>
                <td class="num hold">${holdingValText}</td>
                <td class="num hold">${avgPriceText}</td>
                <td class="num hold">${fmt(t.cashAfter)}원</td>
                <td class="num hold" style="font-weight:700;color:${totalColor}">${fmt(total)}원</td>
              </tr>
              `; }).join('')}
          </tbody>
        </table>
        </div>`;
    }

    private syncConfigFromForm() {
      const capEl = this.shadowRoot?.querySelector('#sim-capital') as HTMLInputElement;
      const cntEl = this.shadowRoot?.querySelector('#sim-candle-count') as HTMLInputElement;
      const tfEl = this.shadowRoot?.querySelector('#sim-timeframe') as HTMLSelectElement;
      if (capEl) {
        const v = Number(capEl.value.replace(/,/g, ''));
        if (Number.isFinite(v)) this.initialCapital = Math.max(10000, Math.floor(v));
      }
      if (cntEl) {
        const v = Number(cntEl.value);
        if (Number.isFinite(v)) this.candleCount = Math.max(30, Math.min(1000, Math.floor(v)));
      }
      if (tfEl && tfEl.value) this.timeframe = tfEl.value as TossChartTimeframe;
      const isMinTf = this.timeframe.startsWith('min:');
      const endDateEl = this.shadowRoot?.querySelector('#sim-end-date') as HTMLInputElement;
      const endDtEl = this.shadowRoot?.querySelector('#sim-end-datetime') as HTMLInputElement;
      // 분봉은 datetime-local(YYYY-MM-DDTHH:MM), 나머지는 date(YYYY-MM-DD)
      const rawEnd = isMinTf ? (endDtEl?.value || '').slice(0, 16) : (endDateEl?.value || '').slice(0, 10);
      // 미래 일시 입력 시 최신으로 취급 (서버 빈 응답 방지)
      if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(rawEnd)) {
        const probe = new Date(rawEnd.length <= 10 ? `${rawEnd}T23:59:00` : `${rawEnd}:00`);
        if (Number.isFinite(probe.getTime()) && probe.getTime() <= Date.now()) {
          this.endDate = rawEnd.slice(0, 10);
          this.endTime = rawEnd.length > 10 ? rawEnd.slice(11, 16) : '';
        } else {
          this.endDate = ''; this.endTime = '';
        }
      } else {
        this.endDate = ''; this.endTime = '';
      }
      // MA rows -> signals
      const rows = this.shadowRoot?.querySelectorAll('#ma-list .ma-row');
      if (rows) {
        const newConfigs: typeof this.maConfigs = [];
        rows.forEach((row: any) => {
          const period = Number(row.querySelector('.ma-period')?.value) || 0;
          const color = row.querySelector('.ma-color')?.getAttribute('data-color') || '#6366f1';
          const fields = row.querySelectorAll('.ma-field');
          const signals: any[] = [];
          fields.forEach((field: any) => {
            const signal = (field.querySelector('.ma-signal') as HTMLSelectElement)?.value as 'golden'|'dead' || 'golden';
            const action = (field.querySelector('.ma-action') as HTMLSelectElement)?.value as 'buy'|'sell' || 'buy';
            const pct = Number((field.querySelector('.ma-pct') as HTMLInputElement)?.value) || 20;
            const candle = (field.querySelector('.ma-candle') as HTMLSelectElement)?.value as any || 'any';
            const volume = (field.querySelector('.ma-volume') as HTMLSelectElement)?.value as any || 'any';
            const con = Number(field.querySelector('.ma-consecutive')?.value) || 2;
            const align = (field.querySelector('.ma-alignment') as HTMLSelectElement)?.value as any || 'any';
            const ctType = (field.querySelector('.ma-condtrade-type') as HTMLSelectElement)?.value as any || 'any';
            const ctOp = (field.querySelector('.ma-condtrade-op') as HTMLSelectElement)?.value as any || 'any';
            const ctVal = Number((field.querySelector('.ma-condtrade-val') as HTMLInputElement)?.value) || 1;
            const ccType = (field.querySelector('.ma-condcandle-type') as HTMLSelectElement)?.value as any || 'any';
            const ccOp = (field.querySelector('.ma-condcandle-op') as HTMLSelectElement)?.value as any || 'any';
            const ccVal = Number((field.querySelector('.ma-condcandle-val') as HTMLInputElement)?.value) || 1;
            const cmType = (field.querySelector('.ma-condma-type') as HTMLSelectElement)?.value as any || 'any';
            const cmOp = (field.querySelector('.ma-condma-op') as HTMLSelectElement)?.value as any || 'any';
            const cmVal = Number((field.querySelector('.ma-condma-val') as HTMLInputElement)?.value) || 0;
            const normOp2 = (v: any) => ['<','<=','=','!=','>=','>'].includes(v) ? v : 'any';
            signals.push({ signal: signal==='dead'?'dead':'golden', action: action==='sell'?'sell':'buy', percent: Math.max(1, Math.min(100, pct)), candleFilter: candle==='bull'?'bull':candle==='bear'?'bear':'any', volumeFilter: volume==='higher'?'higher':volume==='lower'?'lower':'any', consecutive: Math.max(1, Math.min(10, Math.floor(con)||2)), alignment: align as any, condTrade: { type: ['consecutiveBuy','consecutiveSell','consecutiveSelected'].includes(ctType)?ctType:'any', operator: normOp2(ctOp), value: Math.max(1, Math.min(20, Math.floor(Number(ctVal)||1))) }, condCandle: { type: ['consecutiveBullish','consecutiveBearish'].includes(ccType)?ccType:'any', operator: normOp2(ccOp), value: Math.max(1, Math.min(20, Math.floor(Number(ccVal)||1))) }, condMa: { type: ['maDeviation','maSlope'].includes(cmType)?cmType:'any', operator: normOp2(cmOp), value: Math.max(-50, Math.min(50, Number(cmVal)||0)) } });
          });
          if (period > 0) newConfigs.push({ period, color, pyramiding: { signals: signals.length ? signals : [{ signal: 'golden', action: 'buy', percent: 20, candleFilter: 'any', volumeFilter: 'any', consecutive: 2, alignment: 'any', condTrade: { type: 'any', operator: 'any', value: 1 }, condCandle: { type: 'any', operator: 'any', value: 1 }, condMa: { type: 'any', operator: 'any', value: 1 } }] } });
        });
        if (newConfigs.length) this.maConfigs = newConfigs.sort((a,b)=>a.period-b.period);
      }
      // 실현 (exitConfigs) — 이동평균선처럼 추가/삭제
      const exitRows = this.shadowRoot?.querySelectorAll('#exit-list .ma-row');
      if (exitRows) {
        const newExits: typeof this.exitConfigs = [];
        exitRows.forEach((row: any) => {
          const basis = (row.querySelector('.exit-basis') as HTMLSelectElement)?.value as any || 'profitRise';
          const pct = Number((row.querySelector('.exit-pct') as HTMLInputElement)?.value) || 0;
          const sell = Number((row.querySelector('.exit-sell') as HTMLInputElement)?.value) || 0;
          const skip = Number((row.querySelector('.exit-skip') as HTMLInputElement)?.value) || 0;
          const candle = (row.querySelector('.exit-candle') as HTMLSelectElement)?.value as any || 'any';
          const volume = (row.querySelector('.exit-volume') as HTMLSelectElement)?.value as any || 'any';
          newExits.push({ basis: ['profitRise','profitFall','peakFall','peakRise'].includes(basis) ? basis : 'profitRise', percent: Math.max(1, Math.min(100, pct)), sellPercent: Math.max(1, Math.min(100, sell)), skip: Math.max(0, Math.min(20, skip)), candle: candle==='bull'?'bull':candle==='bear'?'bear':'any', volume: volume==='higher'?'higher':volume==='lower'?'lower':'any' });
        });
        if (newExits.length) this.exitConfigs = newExits;
        else if (exitRows.length === 0) this.exitConfigs = [];
        // legacy fields 동기화 (하위호환)
        const first = this.exitConfigs[0];
        if (first) {
          this.takeProfitBasis = first.basis as any;
          this.takeProfitPercent = first.percent;
          this.takeProfitSellPercent = first.sellPercent;
          this.takeProfitSkip = first.skip;
          this.takeProfitCandleFilter = first.candle as any;
          this.takeProfitVolumeFilter = first.volume as any;
          this.takeProfitEnabled = true;
          if (this.exitConfigs[1]) {
            const sec = this.exitConfigs[1] as any;
            this.stopLossBasis = sec.basis as any;
            this.stopLossPercent = sec.percent;
            this.stopLossSellPercent = sec.sellPercent;
            this.stopLossSkip = sec.skip;
            this.stopLossCandleFilter = sec.candle as any;
            this.stopLossVolumeFilter = sec.volume as any;
            this.stopLossEnabled = true;
          } else {
            this.stopLossBasis = 'none' as any;
            this.stopLossEnabled = false;
          }
        } else {
          this.takeProfitBasis = 'none' as any;
          this.takeProfitEnabled = false;
          this.stopLossBasis = 'none' as any;
          this.stopLossEnabled = false;
        }
      }
      const crossEl = this.shadowRoot?.querySelector('#sim-show-cross') as HTMLInputElement;
      if (crossEl) this.showCross = !!crossEl.checked;
      const mallEl = this.shadowRoot?.querySelector('#sim-require-all-mas') as HTMLInputElement;
      if (mallEl) this.requireAllMas = !!mallEl.checked;
      const mresEl = this.shadowRoot?.querySelector('#sim-resolve-mode') as HTMLSelectElement;
      if (mresEl && isResolveMode(mresEl.value)) this.maResolveMode = mresEl.value;
      const xresEl = this.shadowRoot?.querySelector('#sim-exit-resolve-mode') as HTMLSelectElement;
      if (xresEl && isResolveMode(xresEl.value)) this.exitResolveMode = xresEl.value;
      const trendEl = this.shadowRoot?.querySelector('#sim-trend-type') as HTMLSelectElement;
      if (trendEl && trendEl.value !== '' && Number.isFinite(Number(trendEl.value))) this.trendScore = Math.max(0, Math.min(1, Number(trendEl.value)));
      const presetEl = this.shadowRoot?.querySelector('#sim-optimize-preset') as HTMLSelectElement;
      if (presetEl && ['0', '0.5', '1'].includes(presetEl.value)) this.riskAversion = Number(presetEl.value);
      const feeEl = this.shadowRoot?.querySelector('#sim-fee') as HTMLInputElement;
      if (feeEl) { const v = Number(feeEl.value); if (Number.isFinite(v) && v >= 0 && v <= 1) this.feePercent = v; }
    }

    private renderMaList() {
      const list = this.shadowRoot?.querySelector('#ma-list') as HTMLElement;
      if (!list) return;
      const signalFieldHtml = (sig: any, sIdx: number) => `
            <div class="ma-field" data-sidx="${sIdx}">
              <div class="ma-field-head">
                <div class="ma-action-box">
                  <select class="ma-signal" data-v="${sig.signal}" title="신호 종류"><option value="golden" ${sig.signal==='golden'?'selected':''}>● 골든</option><option value="dead" ${sig.signal==='dead'?'selected':''}>● 데드</option></select>
                  <select class="ma-action" data-v="${sig.action}"><option value="buy" ${sig.action==='buy'?'selected':''}>매수</option><option value="sell" ${sig.action==='sell'?'selected':''}>매도</option></select>
                  <input class="ma-pct" type="number" min="1" max="100" value="${sig.percent}" /><span class="pct">%</span>
                </div>
                <button type="button" class="signal-remove" data-sidx="${sIdx}" title="신호 삭제">✕</button>
              </div>
              <div class="ma-field-opts">
                <label class="ma-mini-opt"><span class="ma-help" data-help="크로스 상태 유지(발생 포함). 크로스 발생봉을 1봉째로 셈하고, 종가가 MA 위(골든)/아래(데드)에 입력한 봉수만큼 연속 머물면 그 봉에 매매합니다. 유지되는 동안 매 봉 체결됩니다.">유지</span> <input class="ma-consecutive" type="number" min="1" max="10" value="${sig.consecutive ?? 2}" />봉째 매매</label>

                <label class="ma-mini-opt"><span class="ma-help" data-help="캔들 종가 기준 필터.">캔들</span> <select class="ma-candle"><option value="any" ${sig.candleFilter==='any'?'selected':''}>무관</option><option value="bull" ${sig.candleFilter==='bull'?'selected':''}>양봉</option><option value="bear" ${sig.candleFilter==='bear'?'selected':''}>음봉</option></select></label>
                <label class="ma-mini-opt"><span class="ma-help" data-help="전봉 거래량 대비 필터.">거래량</span> <select class="ma-volume"><option value="any" ${sig.volumeFilter==='any'?'selected':''}>무관</option><option value="higher" ${sig.volumeFilter==='higher'?'selected':''}>증가</option><option value="lower" ${sig.volumeFilter==='lower'?'selected':''}>감소</option></select></label>
                <label class="ma-mini-opt"><span class="ma-help" data-help="현재 MA와 다른 MA들의 위치 관계">배열</span> <select class="ma-alignment"><option value="any" ${sig.alignment==='any'?'selected':''}>무관</option><option value="aligned" ${sig.alignment==='aligned'?'selected':''}>정배열</option><option value="reverse" ${sig.alignment==='reverse'?'selected':''}>역배열</option><option value="largerAbove" ${sig.alignment==='largerAbove'?'selected':''}>큰MA 위</option><option value="largerBelow" ${sig.alignment==='largerBelow'?'selected':''}>큰MA 아래</option><option value="smallerAbove" ${sig.alignment==='smallerAbove'?'selected':''}>작은MA 위</option><option value="smallerBelow" ${sig.alignment==='smallerBelow'?'selected':''}>작은MA 아래</option></select></label>
                <label class="ma-mini-opt"><span class="ma-help" data-help="최근 체결 끝에서 해당 방향이 이어진 횟수. 연속선택은 이 신호와 같은 방향. 무관=항상 통과.">연속매매</span> <select class="ma-condtrade-type"><option value="any" ${sig.condTrade?.type==='any'?'selected':''}>무관</option><option value="consecutiveBuy" ${sig.condTrade?.type==='consecutiveBuy'?'selected':''}>연속매수</option><option value="consecutiveSell" ${sig.condTrade?.type==='consecutiveSell'?'selected':''}>연속매도</option><option value="consecutiveSelected" ${sig.condTrade?.type==='consecutiveSelected'?'selected':''}>연속선택</option></select><select class="ma-condtrade-op" style="${(sig.condTrade?.type ?? 'any')==='any'?'display:none':''}"><option value="<" ${sig.condTrade?.operator==='<'?'selected':''}>&lt;</option><option value="<=" ${sig.condTrade?.operator==='<='?'selected':''}>&lt;=</option><option value="=" ${sig.condTrade?.operator==='='?'selected':''}>=</option><option value="!=" ${sig.condTrade?.operator==='!='?'selected':''}>!=</option><option value=">=" ${sig.condTrade?.operator==='>='?'selected':''}>&gt;=</option><option value=">" ${sig.condTrade?.operator==='>'?'selected':''}>&gt;</option></select><input class="ma-condtrade-val" type="number" min="1" max="20" step="1" value="${sig.condTrade?.value ?? 1}" style="${(sig.condTrade?.type ?? 'any')==='any'?'display:none':''}" /></label><label class="ma-mini-opt"><span class="ma-help" data-help="현재봉까지 같은 캔들이 이어진 개수. 무관=항상 통과.">연속봉</span> <select class="ma-condcandle-type"><option value="any" ${sig.condCandle?.type==='any'?'selected':''}>무관</option><option value="consecutiveBullish" ${sig.condCandle?.type==='consecutiveBullish'?'selected':''}>연속양봉</option><option value="consecutiveBearish" ${sig.condCandle?.type==='consecutiveBearish'?'selected':''}>연속음봉</option></select><select class="ma-condcandle-op" style="${(sig.condCandle?.type ?? 'any')==='any'?'display:none':''}"><option value="<" ${sig.condCandle?.operator==='<'?'selected':''}>&lt;</option><option value="<=" ${sig.condCandle?.operator==='<='?'selected':''}>&lt;=</option><option value="=" ${sig.condCandle?.operator==='='?'selected':''}>=</option><option value="!=" ${sig.condCandle?.operator==='!='?'selected':''}>!=</option><option value=">=" ${sig.condCandle?.operator==='>='?'selected':''}>&gt;=</option><option value=">" ${sig.condCandle?.operator==='>'?'selected':''}>&gt;</option></select><input class="ma-condcandle-val" type="number" min="1" max="20" step="1" value="${sig.condCandle?.value ?? 1}" style="${(sig.condCandle?.type ?? 'any')==='any'?'display:none':''}" /></label><label class="ma-mini-opt"><span class="ma-help" data-help="이격도=(종가-MA)/MA×100%. 기울기=(MA-전봉MA)/전봉MA×100%. 무관=항상 통과.">평균선</span> <select class="ma-condma-type"><option value="any" ${sig.condMa?.type==='any'?'selected':''}>무관</option><option value="maDeviation" ${sig.condMa?.type==='maDeviation'?'selected':''}>이격도</option><option value="maSlope" ${sig.condMa?.type==='maSlope'?'selected':''}>기울기</option></select><select class="ma-condma-op" style="${(sig.condMa?.type ?? 'any')==='any'?'display:none':''}"><option value="<" ${sig.condMa?.operator==='<'?'selected':''}>&lt;</option><option value="<=" ${sig.condMa?.operator==='<='?'selected':''}>&lt;=</option><option value="=" ${sig.condMa?.operator==='='?'selected':''}>=</option><option value="!=" ${sig.condMa?.operator==='!='?'selected':''}>!=</option><option value=">=" ${sig.condMa?.operator==='>='?'selected':''}>&gt;=</option><option value=">" ${sig.condMa?.operator==='>'?'selected':''}>&gt;</option></select><input class="ma-condma-val" type="number" min="-50" max="50" step="0.1" value="${sig.condMa?.value ?? 0}" style="width:54px;${(sig.condMa?.type ?? 'any')==='any'?'display:none':''}" /></label>
              </div>
            </div>`;
      // 포커스 유지: signals 길이 같을 때만 빠른 갱신
      const canFastUpdate = list.children.length === this.maConfigs.length && this.maConfigs.every((ma, idx) => {
        const row = list.children[idx] as HTMLElement;
        if (!row) return false;
        const fields = row.querySelectorAll('.ma-field');
        return fields.length === (ma.pyramiding.signals?.length ?? 0);
      });
      if (canFastUpdate && list.children.length > 0) {
        const active = this.shadowRoot?.activeElement as HTMLElement | null;
        this.maConfigs.forEach((ma, idx) => {
          const row = list.children[idx] as HTMLElement;
          if (!row) return;
          const colorEl = row.querySelector('.ma-color') as HTMLElement | null;
          if (colorEl) { colorEl.setAttribute('data-color', ma.color); (colorEl as HTMLElement).style.background = ma.color; }
          const picker = row.querySelector('.ma-color-input') as HTMLInputElement | null;
          if (picker && picker !== active && picker.value.toLowerCase() !== ma.color.toLowerCase()) picker.value = ma.color;
          const periodEl = row.querySelector('.ma-period') as HTMLInputElement | null;
          if (periodEl && periodEl !== active) periodEl.value = String(ma.period);
          ma.pyramiding.signals.forEach((sig: any, sIdx: number) => {
            const field = row.querySelector(`.ma-field[data-sidx="${sIdx}"]`) as HTMLElement | null;
            if (!field) return;
            const setVal = (sel: string, val: string) => {
              const el = field.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null;
              if (!el || el === active) return;
              if ((el as HTMLInputElement).value !== val) (el as HTMLInputElement).value = val;
            };
            const setSel = (sel: string, val: string) => {
              const el = field.querySelector(sel) as HTMLSelectElement | null;
              if (!el || el === active) return;
              if (el.value !== val) el.value = val;
            };
            setSel('.ma-signal', sig.signal);
            const sigEl = field.querySelector('.ma-signal') as HTMLElement | null;
            if (sigEl && sigEl !== active) sigEl.dataset.v = sig.signal;
            setSel('.ma-action', sig.action);
            const actEl = field.querySelector('.ma-action') as HTMLElement | null;
            if (actEl && actEl !== active) actEl.dataset.v = sig.action;
            setVal('.ma-pct', String(sig.percent));
            setVal('.ma-consecutive', String(sig.consecutive ?? 2));
            setSel('.ma-candle', sig.candleFilter);
            setSel('.ma-volume', sig.volumeFilter);
            setSel('.ma-alignment', sig.alignment);
            setSel('.ma-condtrade-type', sig.condTrade?.type ?? 'any');
            setSel('.ma-condtrade-op', sig.condTrade?.operator ?? 'any');
            setVal('.ma-condtrade-val', String(sig.condTrade?.value ?? 1));
            setSel('.ma-condcandle-type', sig.condCandle?.type ?? 'any');
            setSel('.ma-condcandle-op', sig.condCandle?.operator ?? 'any');
            setVal('.ma-condcandle-val', String(sig.condCandle?.value ?? 1));
            setSel('.ma-condma-type', sig.condMa?.type ?? 'any');
            setSel('.ma-condma-op', sig.condMa?.operator ?? 'any');
            setVal('.ma-condma-val', String(sig.condMa?.value ?? 0));
            // 빠른 갱신에서도 무관이면 연산자/값 숨김 (전체 리렌더와 동일 상태 유지)
            const syncCondVis = (typeSel: string, opSel: string, valSel: string) => {
              const t = field.querySelector(typeSel) as HTMLSelectElement | null;
              const isAny = !t || t.value === 'any';
              const op = field.querySelector(opSel) as HTMLElement | null;
              const val = field.querySelector(valSel) as HTMLElement | null;
              if (op) op.style.display = isAny ? 'none' : '';
              if (val) val.style.display = isAny ? 'none' : '';
            };
            syncCondVis('.ma-condtrade-type', '.ma-condtrade-op', '.ma-condtrade-val');
            syncCondVis('.ma-condcandle-type', '.ma-condcandle-op', '.ma-condcandle-val');
            syncCondVis('.ma-condma-type', '.ma-condma-op', '.ma-condma-val');
          });
        });
        this.updateMaRowFieldsSingle();
        return;
      }
      list.innerHTML = this.maConfigs.map((ma, idx) => `
        <div class="ma-row" data-idx="${idx}">
          <div class="ma-row-head">
            <div class="ma-identity">
              <span class="ma-color" data-color="${ma.color}" style="background:${ma.color}" title="선 색상 변경"><input class="ma-color-input" type="color" value="${ma.color}" tabindex="-1" /></span>
              <input class="ma-period" type="number" min="2" max="500" value="${ma.period}" title="틱수" />
              <span class="ma-unit ma-help" data-help="이동평균 기간(틱수). 예: 5MA = 최근 5봉 종가 평균.">MA</span>
              <span style="font-size:10px;color:#b45309;background:#fef3c7;border:1px solid #fde68a;border-radius:999px;padding:2px 8px;font-weight:800">${ma.pyramiding.signals.length}개 신호</span>
            </div>
            <div class="ma-row-actions">
              <button type="button" class="add-signal-btn" data-idx="${idx}" title="신호 추가">+ 신호</button>
              <button type="button" class="ma-remove" data-idx="${idx}" title="MA 삭제">✕</button>
            </div>
          </div>
          <div class="ma-row-fields">
            ${ma.pyramiding.signals.map((sig: any, sIdx: number) => signalFieldHtml(sig, sIdx)).join('')}
          </div>
        </div>
      `).join('');
      this.updateMaRowFieldsSingle();
    }

    private renderExitList() {
      const list = this.shadowRoot?.querySelector('#exit-list') as HTMLElement;
      if (!list) return;
      if (!this.exitConfigs.length) {
        list.innerHTML = `<div style="padding:12px;color:#94a3b8;font-size:11px;border:1px dashed #e2e8f0;border-radius:10px;background:#f8fafc;text-align:center">조건 없음 — 청산 없이 보유</div>`;
        return;
      }
      list.innerHTML = this.exitConfigs.map((ex, idx) => `
        <div class="ma-row exit-row" data-idx="${idx}">
          <div class="exit-head">
            <div class="exit-title"><span class="exit-badge">${idx+1}</span> 실현 조건</div>
            <button type="button" class="ma-remove exit-remove" data-idx="${idx}" title="삭제">✕</button>
          </div>
          <div class="exit-main">
            <span class="lbl ma-help" data-help="수익률±=(현재가-평균)/평균, 보유고점−=(보유중최고가-현재)/보유중최고가, 보유저점+=(현재-보유중최저가)/보유중최저가. 고점/저점은 보유 기간 중에 갱신되는 값으로, 종목의 신고가·신저가와 무관합니다.">조건</span>
            <select class="exit-basis" data-idx="${idx}"><option value="profitRise" ${ex.basis==='profitRise'?'selected':''}>수익률 +</option><option value="profitFall" ${ex.basis==='profitFall'?'selected':''}>수익률 −</option><option value="peakFall" ${ex.basis==='peakFall'?'selected':''}>보유고점 −</option><option value="peakRise" ${ex.basis==='peakRise'?'selected':''}>보유저점 +</option></select>
            <span class="exit-inputs">
              <input class="exit-pct" data-idx="${idx}" type="number" min="1" max="100" value="${ex.percent}" />% 도달 시
              <input class="exit-sell" data-idx="${idx}" type="number" min="1" max="100" value="${ex.sellPercent}" />% 청산
            </span>
          </div>
          <div class="exit-opts tp-sl-opts">
            <label class="exit-opt"><span class="ma-help" data-help="캔들 필터">캔들</span> <select class="exit-candle" data-idx="${idx}"><option value="any" ${ex.candle==='any'?'selected':''}>무관</option><option value="bull" ${ex.candle==='bull'?'selected':''}>양봉</option><option value="bear" ${ex.candle==='bear'?'selected':''}>음봉</option></select></label>
            <label class="exit-opt"><span class="ma-help" data-help="거래량 필터">거래량</span> <select class="exit-volume" data-idx="${idx}"><option value="any" ${ex.volume==='any'?'selected':''}>무관</option><option value="higher" ${ex.volume==='higher'?'selected':''}>증가</option><option value="lower" ${ex.volume==='lower'?'selected':''}>감소</option></select></label>
            <label class="exit-opt"><span>스킵</span> <input class="exit-skip" data-idx="${idx}" type="number" min="0" max="20" value="${ex.skip}" />회</label>
          </div>
        </div>
      `).join('');
    }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display: block; min-height: 100vh; background: #f0f2f5; font-family: var(--font-family, sans-serif); }
          .header { display:flex; align-items:center; gap:12px; padding:16px 24px; background:linear-gradient(135deg,#f59e0b 0%,#f97316 60%,#fb923c 100%); color:white; }
          .header-back { background:rgba(255,255,255,0.2); border:none; color:white; width:40px; height:40px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:20px; }
          .header-back:hover { background:rgba(255,255,255,0.3); }
          .header-title { font-size:20px; font-weight:700; flex:1; }
          .header-hits { height:20px; border-radius:4px; opacity:0.9; margin-left:auto; }
          .content { padding:20px; }
          @media(max-width:600px){ .header{padding:14px 16px} .header-title{font-size:18px} .content{padding:12px} }
          .card{background:white;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);overflow:hidden}
          .card-header{background:var(--accent);color:white;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;border-radius:12px 12px 0 0}
          .card-title{font-size:15px;font-weight:700}
          .search-wrap{display:flex;gap:6px;align-items:center;position:relative;min-width:0;flex:1}
          .search-icon{font-size:12px;opacity:.6;color:#c7d2fe}
          .search-wrap input{flex:1;min-width:0;height:32px;padding:0 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.4);outline:none;font-size:12px;background:#fff;box-sizing:border-box}
          .search-wrap input:focus{border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,0.25)}
          .search-wrap button,.search-clear{height:32px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.35);background:rgba(255,255,255,0.2);color:#fff;font-weight:600;cursor:pointer;font-size:12px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center}
          .search-wrap button:hover,.search-clear:hover{background:rgba(255,255,255,0.35)}
          .search-results{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);overflow:hidden;display:none;z-index:10;color:#334155}
          .search-results.show{display:block}
          .search-item{padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f1f5f9;color:#334155}
          .search-item:hover{background:#f8fafc}
          .chart-wrap{height:340px;padding:4px 12px 8px}
          @media(max-width:600px){ .chart-wrap{height:280px} }
          stock-chart{width:100%;height:100%;display:block}
          .config-grid{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px}
          @media(max-width:900px){ .config-grid{grid-template-columns:1fr 1fr} }
          @media(max-width:600px){ .config-grid{grid-template-columns:1fr} }
          .config-field{display:flex;flex-direction:column;gap:4px}
          .config-field label{font-size:11px;font-weight:700;color:#64748b}
          .config-field input,.config-field select{height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff}
          .config-field input:focus,.config-field select:focus{border-color:#f59e0b}
          .ma-list{display:flex;flex-direction:column;gap:12px;margin-top:10px}
          .ma-row{display:flex;flex-direction:column;gap:10px;background:#fffbeb;border:1px solid #fde68a;border-radius:16px;padding:14px;box-shadow:0 1px 4px rgba(180,120,20,0.06)}
          .ma-row-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
          .ma-identity{display:flex;align-items:center;gap:8px}
          .ma-color{position:relative;width:16px;height:16px;border-radius:50%;flex-shrink:0;border:2px solid #fff;box-shadow:0 0 0 2px #fbbf24;cursor:pointer;overflow:hidden}
          .ma-color-input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:none;padding:0}
          .ma-period{width:58px;height:32px;text-align:center;font-weight:800;font-size:14px;border-radius:8px;border:1px solid #f59e0b;background:#fff;outline:none}
          .ma-period:focus{border-color:#d97706;box-shadow:0 0 0 3px #fef3c7}
          .ma-unit{font-size:12px;color:#92400e;font-weight:800}
          .ma-remove{width:32px;height:32px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#94a3b8;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;transition:all .15s}
          .ma-remove:hover{background:#fef2f2;color:#ef4444;border-color:#fecaca}
          .ma-row-actions{display:flex;gap:6px;align-items:center}
          .add-signal-btn{height:32px;padding:0 10px;border:1px solid #fcd34d;background:#fff;color:#b45309;border-radius:8px;cursor:pointer;font-size:11px;font-weight:800;white-space:nowrap}
          .add-signal-btn:hover{background:#fef3c7}
          .ma-row-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
          .ma-row-fields.is-single{grid-template-columns:1fr}
          .ma-field{display:flex;flex-direction:column;gap:8px;background:#fff;border:1px solid #fde68a;border-radius:12px;padding:10px}
          .ma-field-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
          .ma-action-box{flex:1;display:flex;align-items:center;gap:6px;min-width:0}
          .ma-signal,.ma-action{height:32px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;font-weight:800;background:#f8fafc;padding:0 6px;color:#334155}
          .ma-signal[data-v="golden"]{color:#b45309;border-color:#fcd34d;background:#fffbeb}
          .ma-signal[data-v="dead"]{color:#b91c1c;border-color:#fecaca;background:#fef2f2}
          .ma-action[data-v="sell"]{color:#dc2626}
          .ma-action[data-v="buy"]{color:#2563eb}
          .ma-pct{width:52px;height:32px;border-radius:8px;border:1px solid #e2e8f0;font-size:13px;font-weight:800;text-align:center;background:#fff}
          .ma-action-box .pct{font-size:11px;color:#92400e;font-weight:800}
          .signal-remove{border:1px solid #fecaca;background:#fff;color:#fca5a5;border-radius:8px;min-width:28px;height:28px;font-size:11px;font-weight:800;cursor:pointer;flex-shrink:0}
          .signal-remove:hover{background:#fef2f2;color:#ef4444;border-color:#fca5a5}
          .ma-field-opts{display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:start}
          .ma-mini-opt{display:flex;align-items:center;gap:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px 8px;font-size:11px;font-weight:600;color:#475569;min-width:0;flex-wrap:wrap}
          .ma-mini-opt input{width:40px;height:32px;text-align:center;border-radius:8px;border:1px solid #e2e8f0;font-size:13px;font-weight:700;background:#fff}
          .ma-mini-opt select{flex:1;min-width:60px;height:32px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:600;background:#fff;padding:0 4px;color:#334155}
          .ma-condtrade-val,.ma-condcandle-val,.ma-condma-val{width:54px !important}
          /* 실현(청산) — 바이올렛 테마로 MA와 명확히 구분 */
          #exit-list{display:flex;flex-direction:column;gap:10px}
          .ma-row.exit-row{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:16px;padding:14px;box-shadow:0 1px 4px rgba(109,88,246,0.08)}
          .exit-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
          .exit-title{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:#5b21b6}
          .exit-badge{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#7c3aed;color:#fff;font-size:10px;font-weight:800}
          .exit-remove:hover{background:#ede9fe !important;color:#7c3aed !important;border-color:#c4b5fd !important}
          .exit-main{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px;background:#fff;border:1px solid #ede9fe;border-radius:10px;padding:8px}
          .exit-main .lbl{font-size:11px;font-weight:800;color:#6d28d9}
          .exit-basis{height:32px;border-radius:8px;border:1px solid #c4b5fd;font-size:11px;font-weight:800;background:#ede9fe;color:#5b21b6;padding:0 8px}
          .exit-inputs{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#6d28d9;font-weight:700}
          .exit-pct,.exit-sell{width:52px;height:32px;border-radius:8px;border:1px solid #e2e8f0;text-align:center;font-weight:800;font-size:13px;background:#fff}
          .exit-opts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:8px}
          .exit-opt{display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #ede9fe;border-radius:8px;padding:6px 8px;font-size:11px;font-weight:600;color:#5b21b6;justify-content:center}
          .exit-opt select{flex:1;min-width:60px;height:32px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:600;background:#fff;padding:0 4px;color:#334155}
          .exit-skip{width:38px;height:32px;border-radius:8px;border:1px solid #e2e8f0;text-align:center;font-weight:800;font-size:13px;background:#fff}
          /* 섹션 헤더 */
          .section-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
          .section-title{font-size:12px;font-weight:800}
          .section-title.ma{color:#92400e}
          .section-title.exit{color:#5b21b6}
          .section-badge{font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;letter-spacing:0.02em}
          .section-badge.ma{background:#fef3c7;color:#b45309;border:1px solid #fde68a}
          .section-badge.exit{background:#ede9fe;color:#6d28d9;border:1px solid #ddd6fe}
          .section-desc{font-size:10px;color:#94a3b8;font-weight:500}
          .section-box{border-top:1px solid #f1f5f9;padding-top:12px}
          .section-box.exit{border:1px solid #ede9fe;background:#faf9ff;border-radius:12px;padding:12px}
          .section-box.ma{border:1px solid #fef3c7;background:#fffdf5;border-radius:12px;padding:12px}
          .add-ma-btn{margin-top:8px;width:100%;height:32px;border:1px dashed #fbbf24;background:#fff;color:#b45309;border-radius:8px;cursor:pointer;font-size:12px;font-weight:800}
          .add-ma-btn:hover{background:#fef3c7}
          .add-exit-btn{margin-top:8px;width:100%;height:32px;border:1px dashed #a78bfa;background:#fff;color:#6d28d9;border-radius:8px;cursor:pointer;font-size:12px;font-weight:800}
          .add-exit-btn:hover{background:#ede9fe}
          .ma-help{cursor:help;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px}
          .ma-popover{position:fixed;max-width:280px;background:#1e293b;color:#fff;font-size:11px;line-height:1.5;padding:10px 12px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.25);z-index:999;display:none;pointer-events:none;white-space:normal}
          .ma-popover.show{display:block;pointer-events:auto}
          #stock-search {font-size: 16px !important;}
          @media(max-width:600px){
            .ma-row,.ma-row.exit-row{padding:10px}
            .ma-row-fields{grid-template-columns:1fr}
            .ma-field{padding:10px}
            .ma-field-opts{grid-template-columns:1fr}
            .exit-opts{grid-template-columns:1fr}
            .section-box.ma,.section-box.exit{padding:10px}
          }
          @media(max-width:820px) and (min-width:601px){
            .ma-row-fields{grid-template-columns:1fr}
            .ma-field-opts{grid-template-columns:1fr 1fr}
          }
          .tp-sl-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
          .tp-sl-grid.is-single{grid-template-columns:1fr}
          .tp-sl-opts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
          @media(max-width:600px){
            .tp-sl-grid{grid-template-columns:1fr}
            .tp-sl-opts{grid-template-columns:1fr}
          }
          .share-fab{position:fixed;bottom:24px;right:24px;width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff;border:none;box-shadow:0 6px 20px rgba(245,158,11,0.45);cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:900;transition:transform .15s ease,box-shadow .15s ease}
          .share-fab:hover{transform:scale(1.08);box-shadow:0 8px 24px rgba(245,158,11,0.55)}
          .share-fab.copied{background:#10b981;box-shadow:0 6px 20px rgba(16,185,129,0.45)}
          .result-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:12px 14px;background:#f8fafc;border-top:1px solid #f1f5f9}
          .result-item{background:white;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;text-align:center}
          .result-label{font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.02em}
          .result-value{margin-top:4px;font-size:16px;font-weight:800;color:#1e293b;line-height:1}
          .result-sub{display:flex;gap:10px;flex-wrap:wrap;padding:8px 14px 12px;background:#f8fafc;border-top:1px solid #f1f5f9;font-size:11px;color:#64748b}
          .result-sub b{color:#334155}
          .history-btn{margin-left:auto;height:32px;padding:0 10px;border-radius:999px;border:1px solid #f59e0b;background:#fff;color:#d97706;font-size:11px;font-weight:700;cursor:pointer}
          .history-btn:hover{background:#fffbeb}
          .history-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,0.45);z-index:50;padding:16px}
          .history-modal.show{display:flex}
          .history-panel{width:min(860px,100%);max-height:85vh;background:#fff;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,0.2);overflow:hidden;display:flex;flex-direction:column}
          .history-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #f1f5f9}
          .history-title{font-size:14px;font-weight:800;color:#1e293b}
          .history-close{width:32px;height:32px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#64748b;cursor:pointer}
          .history-close:hover{background:#f8fafc}
          .hist-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:10px 14px;background:#f8fafc;border-bottom:1px solid #f1f5f9}
          .hist-stat .s{font-size:10px;font-weight:700;color:#7c3aed}
          .hist-stat{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:7px 4px;text-align:center}
          .hist-stat .k{font-size:10px;font-weight:700;color:#94a3b8}
          .hist-stat .v{margin-top:2px;font-size:14px;font-weight:800;color:#1e293b}
          .hist-sub{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:8px 14px;font-size:11px;color:#64748b;border-bottom:1px solid #f1f5f9;background:#fff}
          .hist-sub b{color:#1e293b}
          .hist-scroll{overflow:auto;max-height:62vh}
          .hist-table{width:100%;min-width:880px;border-collapse:collapse;font-size:11px}
          .hist-table thead{position:sticky;top:0;background:#fff;z-index:1}
          .hist-table .hgroup th{padding:6px 8px;text-align:center;font-weight:800;color:#334155;border-bottom:1px solid #f1f5f9;background:#f8fafc}
          .hist-table .hgroup th.hold{color:#5b21b6;background:#f5f3ff}
          .hist-table thead tr:last-child th{padding:7px 8px;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap}
          .hist-table td{padding:6px 8px;border-bottom:1px solid #f1f5f9;white-space:nowrap}
          .hist-table .num{text-align:right;font-variant-numeric:tabular-nums}
          .hist-table th.hold,.hist-table td.hold{background:#faf9ff}
          .hbadge{display:inline-block;min-width:64px;padding:2px 8px;border-radius:999px;font-weight:800;font-size:10px;color:#fff;text-align:center}
          .hbadge.buy{background:#3b82f6}
          .hbadge.sell{background:#ef4444}
          .hbadge.exit{background:#7c3aed}
          .hcond{display:inline-block;margin:1px 2px;padding:1px 7px;border-radius:999px;background:#f1f5f9;color:#475569;font-size:10px;font-weight:700;cursor:help;white-space:nowrap}
          .hcond-sum{display:inline-block;padding:2px 10px;border-radius:999px;background:#ede9fe;color:#6d28d9;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap;border:1px solid #ddd6fe}
          .hcond-sum:hover{background:#ddd6fe}
          .cond-detail-row{display:flex;gap:8px;align-items:baseline;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:12px}
          .hdetail{font-size:11px;color:#334155;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:3px 8px;margin:2px 0;line-height:1.5}
          .cond-detail-row .k{min-width:52px;font-weight:800;color:#94a3b8;font-size:11px}
          .cond-detail-row .v{color:#1e293b;font-weight:600}
          .cond-detail-reason{margin-top:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;font-size:11px;line-height:1.6;color:#475569}
          .hrow:hover{background:#f8fafc}
          td.dim{color:#94a3b8}
          @media(max-width:600px){.hist-summary{grid-template-columns:repeat(2,1fr)}}
          @media(max-width:600px){ .result-value{font-size:15px} .history-panel{max-height:90vh} }
        </style>

        <div class="header">
          <button class="header-back" aria-label="Go home" title="홈으로">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
          </button>
          <div class="header-title">📈 주식 트레이딩 시뮬레이션</div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-stock-trading-simulation.svg?style=plastic&amp;"/>
        </div>

        <main class="content">
          <div class="card">
            <div class="card-header" style="--accent:#f59e0b">
              <div class="search-wrap">
                <span class="search-icon">🔍</span>
                <input id="stock-search" placeholder="종목 검색 — 예: 삼성전자, SK하이닉스" value="" />
                <button id="stock-search-clear" class="search-clear" title="지우기">✕</button>
                <button id="stock-search-btn">검색</button>
                <div id="search-results" class="search-results"></div>
              </div>
            </div>
            <div style="padding:8px 14px;font-size:12px;color:#64748b" id="chart-title">로딩 중...</div>
            <div class="chart-wrap">
              <stock-chart id="sim-chart" enabled-control enabled-readout show-last-line></stock-chart>
            </div>
            <div id="sim-range-row" style="display:flex;align-items:center;gap:8px;padding:4px 14px 10px;background:#fff;border-top:1px solid #f1f5f9;font-size:11px;color:#64748b">
              <span id="sim-range-start" style="font-weight:700;white-space:nowrap;min-width:64px;font-size: 10px;">-</span>
              <range-slider id="sim-zone" orientation="horizontal" min="0" max="359" step="1" style="flex:1">
                <thumb-group label="구간" color="#7c3aed">
                  <thumb name="start" value="0"></thumb>
                  <thumb name="end" min="start" value="359"></thumb>
                </thumb-group>
              </range-slider>
              <div style="display: flex; flex-direction: column">
              <span id="sim-range-end" style="font-weight:700;white-space:nowrap;min-width:64px;text-align:right;font-size: 10px;">-</span>
              <span id="sim-range-count" style="font-weight:800;color:#7c3aed;white-space:nowrap">-</span>
              </div>
            </div>
            <form id="sim-candle-form" style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;padding:8px 14px;background:#fffbeb;border-top:1px solid #fef3c7" onsubmit="return false">
              <div class="config-field" style="flex:1;min-width:90px"><label style="font-size:11px;font-weight:700;color:#64748b">캔들 수</label><input id="sim-candle-count" type="number" min="30" max="1000" value="360" style="width:100%;height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff;box-sizing:border-box;font-size:16px;"/></div>
              <div class="config-field" style="flex:1;min-width:120px"><label style="font-size:11px;font-weight:700;color:#64748b">타임프레임</label><select id="sim-timeframe" style="width:100%;height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff;box-sizing:border-box"><option value="min:1">1분</option><option value="min:3">3분</option><option value="min:5">5분</option><option value="min:15">15분</option><option value="min:30">30분</option><option value="min:60">60분</option><option value="day:1" selected>일봉</option><option value="week:1">주봉</option><option value="month:1">월봉</option></select></div>
              <div class="config-field" id="sim-end-date-field" style="flex:1;min-width:110px"><label style="font-size:11px;font-weight:700;color:#64748b">종료일 (비우면 최신)</label><input id="sim-end-date" type="date" style="width:100%;height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff;box-sizing:border-box;"/></div>
              <div class="config-field" id="sim-end-datetime-field" style="flex:1;min-width:150px;display:none"><label style="font-size:11px;font-weight:700;color:#64748b">종료일시 (비우면 최신)</label><input id="sim-end-datetime" type="datetime-local" step="60" style="width:100%;height:32px;padding:0 8px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;outline:none;background:#fff;box-sizing:border-box;"/></div>
              <button type="submit" id="sim-reload-btn" style="height:32px;padding:0 14px;border-radius:999px;border:1px solid #f59e0b;background:#fff;color:#d97706;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;align-self:end">다시불러오기</button>
            </form>
          </div>

          <form class="card" id="sim-config" style="margin-top:12px" onsubmit="return false">
            <div class="card-header" style="--accent:#f59e0b"><span class="card-title">⚙️ 설정</span><label style="display:inline-flex;align-items:center;gap:4px;margin-left:auto;font-size:11px;font-weight:700;color:#fff;cursor:pointer;user-select:none"><input id="sim-show-cross" type="checkbox" style="width:14px;height:14px" />크로스표시</label></div>
            <div style="background:#f8fafc;border-bottom:1px solid #f1f5f9">
              <div class="result-grid" id="sim-result">
                <div class="result-item"><div class="result-label">보유주식수</div><div class="result-value" id="sim-shares">-주</div></div>
                <div class="result-item"><div class="result-label">평가금액</div><div class="result-value" id="sim-eval">-원</div></div>
                <div class="result-item"><div class="result-label">수익률</div><div class="result-value" id="sim-rate">-</div></div>
              </div>
              <div class="result-sub" id="sim-result-detail">
                <span>현금 <b id="sim-cash">-원</b></span>
                <span>주식평가 <b id="sim-holding">-원</b></span>
                <span>손익 <b id="sim-profit">-원</b></span>
                <span>수수료 <b id="sim-fee-total">-원</b></span>
                <span style="color:#94a3b8"><span id="sim-trade-count">0건</span> 체결</span>
                <button type="button" class="history-btn" id="sim-history-btn">거래내역보기</button>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 14px 12px;background:#fffbeb;border-top:1px solid #fef3c7;font-size:11px;color:#92400e" id="sim-hold-row">
                <span>단순보유 <b id="sim-hold-rate" style="color:#64748b">-</b> <span style="color:#94a3b8">(<span id="sim-hold-first">-</span> → <span id="sim-hold-last">-</span>)</span></span>
                <span>평가 <b id="sim-hold-eval">-원</b></span>
                <span style="margin-left:auto;color:#94a3b8">첫틱~마지막틱 종가 기준 · 매수 후 보유 가정</span>
              </div>
            </div>
            <div style="padding:12px 14px;display:flex;flex-direction:column;gap:12px">
              <div class="config-grid" style="grid-template-columns:1fr 1fr">
                <div class="config-field"><label>투자원금 (원)</label><input id="sim-capital" type="number" min="100000" step="100000" value="100000000" style="font-size: 16px;" /></div>
                <div class="config-field"><label><span class="ma-help" data-help="거래금액(체결금액) 대비 수수료율. 매수 시 체결금액 * 수수료, 매도 시 체결금액 * 수수료가 차감됩니다. 예: 0.015% → 1,000,000원 거래 시 150원.">수수료 (%)</span></label><input id="sim-fee" type="number" min="0" max="1" step="0.001" value="0.015" style="font-size: 16px;" /></div>
              </div>
              <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;flex-wrap:wrap;align-items:center">
                <select id="sim-optimize-preset" title="최적화 성향: 적극형(λ0) / 균형형(λ0.5) / 안정형(λ1). score = profit − λ·MDD" style="height:32px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;color:#334155;font-size:11px;font-weight:700;padding:0 10px;cursor:pointer"><option value="1">안정형</option><option value="0.5" selected>균형형</option><option value="0">적극형</option></select>
                <select id="sim-trend-type" title="추세 예상: 최적화 탐색 방향 prior" style="height:32px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;color:#334155;font-size:11px;font-weight:700;padding:0 10px;cursor:pointer"><option value="0.5" selected>추세 모름</option><option value="1">상승 예상</option><option value="0">하락 예상</option><option value="0.5">횡보 예상</option></select>
                <button type="button" id="sim-optimize-btn" style="height:32px;padding:0 14px;border-radius:999px;border:1px solid #f59e0b;background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(245,158,11,0.3);display:inline-flex;align-items:center;gap:4px">🎲 최적화</button>
              </div>
              <div class="section-box exit">
                <div class="section-head"><span class="section-title exit">💜 실현</span><label style="display:inline-flex;align-items:center;gap:4px;margin-left:auto;font-size:11px;font-weight:700;color:#5b21b6;white-space:nowrap" title="같은 봉에 겹친 실현 조건 확정 방식 (매도% 기준)">조건중복<select id="sim-exit-resolve-mode" style="height:32px;border-radius:8px;border:1px solid #c4b5fd;font-size:11px;font-weight:800;background:#ede9fe;color:#5b21b6;padding:0 4px;outline:none"><option value="minFirst">최소값 우선</option><option value="maxFirst">최대값 우선</option><option value="all">복리 합산</option></select></label></div>
                <div id="exit-list"></div>
                <button type="button" class="add-exit-btn" id="add-exit-btn">+ 실현 조건 추가</button>
                <div style="font-size:10px;color:#94a3b8;margin-top:6px">조건 충족 시 보유주수의 일부를 청산하고, 이후 N회 MA 매매를 스킵합니다.</div>
              </div>
              <div class="section-box ma" style="margin-top:12px">
                <div class="section-head"><span class="section-title ma">📈 진입점</span><label style="display:inline-flex;align-items:center;gap:4px;margin-left:auto;font-size:11px;font-weight:700;color:#92400e;cursor:pointer;user-select:none;white-space:nowrap" title="체크 시 최장기 이평선이 형성되기 전 구간에서는 매매하지 않고, 모든 이평선이 존재하는 봉부터 처리합니다"><input id="sim-require-all-mas" type="checkbox" style="width:14px;height:14px" />이평선 존재시 처리</label><label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#92400e;white-space:nowrap" title="같은 봉에 겹친 조건 확정 방식 (매수/매도% 기준)">조건중복<select id="sim-resolve-mode" style="height:32px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;background:#fff;color:#92400e;padding:0 4px;outline:none"><option value="minFirst">최소값 우선</option><option value="maxFirst">최대값 우선</option><option value="all">복리 합산</option></select></label></div>
                <div id="ma-list" class="ma-list"></div>
                <button type="button" class="add-ma-btn" id="add-ma-btn">+ 이동평균선 추가</button>
                <div style="font-size:10px;color:#94a3b8;margin-top:6px">신호별 <b>매수 %</b>는 현금 기준, <b>매도 %</b>는 보유주식 기준.</div>
              </div>
            </div>
          </form>
        </main>

        <div class="history-modal" id="sim-history-modal" role="dialog" aria-modal="true" aria-label="거래내역">
          <div class="history-panel">
            <div class="history-head">
              <div class="history-title">📋 거래내역</div>
              <button type="button" class="history-close" id="sim-history-close" aria-label="닫기">✕</button>
            </div>
            <div id="sim-history-body"></div>
          </div>
        </div>
        <div class="history-modal" id="sim-cond-modal" role="dialog" aria-modal="true" aria-label="조건 상세">
          <div class="history-panel" style="width:min(480px,100%)">
            <div class="history-head">
              <div class="history-title" id="sim-cond-title">🔍 조건 상세</div>
              <button type="button" class="history-close" id="sim-cond-close" aria-label="닫기">✕</button>
            </div>
            <div id="sim-cond-body" style="padding:12px 14px;overflow:auto;max-height:60vh"></div>
          </div>
        </div>
        <button id="sim-share-fab" class="share-fab" title="공유하기">🔗</button>
        <div id="ma-help-popover" class="ma-popover" role="tooltip"></div>
      `;
    }
  }

  return tagName;
};
