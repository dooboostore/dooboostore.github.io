import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import lzString from 'lz-string';
import {
  scoreTrendBars,
  splitScoreSegments,
  clipScoredSegments,
  diffZoneSets,
  compactSetsForUrl,
  expandSetsFromUrl,
  parseSetsParam,
  normMaList,
  normExitList,
} from '../src/pages/stock-trading-simulation/StockTradingSimulationPage';

const { compressToEncodedURIComponent } = lzString;
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe('scoreTrendBars', () => {
  it('hand-check: all-down → 0.3, all-up → 0.9', () => {
    const sc = scoreTrendBars([
      { macd: -1, signal: -0.5, rsi: 40, obv: 100 },
      { macd: 1, signal: 0.5, rsi: 70, obv: 300 },
    ], 10);
    assert.ok(near(sc[0]!, 0.3) && near(sc[1]!, 0.9));
  });
  it('partial indicators: rsi only → rsi/100', () => {
    assert.deepEqual(scoreTrendBars([{ macd: null, signal: null, rsi: 80, obv: null }], 10), [0.8]);
  });
  it('no indicators → null', () => {
    assert.deepEqual(scoreTrendBars([{ macd: null, signal: null, rsi: null, obv: null }], 10), [null]);
  });
});

describe('splitScoreSegments', () => {
  it('down/side/up split with mean trends', () => {
    const sg = splitScoreSegments([...Array(30).fill(0.3), ...Array(30).fill(0.5), ...Array(30).fill(0.9)], 10, 6, 0.6, 0.4);
    assert.equal(sg.length, 3);
    assert.deepEqual(sg.map(g => [g.from, g.to]), [[0, 29], [30, 59], [60, 89]]);
    assert.ok(near(sg[0].trend, 0.3) && sg[1].trend === 0.5 && near(sg[2].trend, 0.9, 1e-9));
  });
  it('short segment merges into neighbor', () => {
    const r = splitScoreSegments([...Array(30).fill(0.9), ...Array(3).fill(0.5), ...Array(30).fill(0.1)], 10, 6, 0.6, 0.4);
    assert.equal(r.length, 2);
    assert.deepEqual([r[0].from, r[0].to], [0, 32]);
  });
  it('cap maxSets, empty, all-null', () => {
    const r = splitScoreSegments(Array.from({ length: 80 }, (_, i) => (Math.floor(i / 10) % 2 === 0 ? 1 : -1)), 10, 6, 0.6, 0.4);
    assert.equal(r.length, 6);
    assert.deepEqual(splitScoreSegments([], 10, 6), []);
    const n = splitScoreSegments([null, null, null], 2, 6, 0.6, 0.4);
    assert.equal(n.length, 1);
    assert.equal(n[0].trend, 0.5);
  });
  it('clip: sub-range keeps identical boundaries on overlap', () => {    // 전역 분할 [0-29 dn][30-59 side][60-89 up]에서 [10-69] clipping
    const scores = [...Array(30).fill(0.1), ...Array(30).fill(0.5), ...Array(30).fill(0.9)];
    const global = splitScoreSegments(scores, 10, 6, 0.6, 0.4);
    const clipped = clipScoredSegments(global.map((g, i) => ({ ...g, label: 'z' + i, color: '#111' })), scores, 10, 69);
    assert.deepEqual(clipped.map(g => [g.from, g.to]), [[10, 29], [30, 59], [60, 69]]);
    // clip trend는 clip 범위 평균
    assert.ok(Math.abs(clipped[0].trend - 0.1) < 1e-9 && Math.abs(clipped[2].trend - 0.9) < 1e-9);
    // 자투리도 유지 (짧아도 최적화 시도, 안 되면 null 탈락)
    const tiny = clipScoredSegments(global.map(g => ({ ...g, label: 'x', color: '#000' })), scores, 0, 25);
    assert.deepEqual(tiny.map(g => [g.from, g.to]), [[0, 25]]);
    // 라벨·색상 유지
    assert.equal(tiny[0].label, 'x');
  });
  it('diffZoneSets: name-first match with range check', () => {
    const sets = [
      { label: '상승 1', from: 0, to: 100 },
      { label: '하락 1', from: 101, to: 200 },
      { label: '옛것', from: 300, to: 400 },
    ];
    const zones = [
      { label: '상승 1', from: 0, to: 100 },
      { label: '하락 1', from: 101, to: 200 },
      { label: '상승 2', from: 201, to: 300 },
    ];
    const d = diffZoneSets(sets, zones);
    assert.deepEqual(d.keepIdx, [0, 1]);
    assert.deepEqual(d.freshZones, [{ label: '상승 2', from: 201, to: 300 }]);
    // 같은 이름도 범위 틀어지면 재생성
    const d2 = diffZoneSets(
      [{ label: '상승 1', from: 0, to: 90 }],
      [{ label: '상승 1', from: 0, to: 100 }],
    );
    assert.deepEqual(d2.keepIdx, []);
    assert.deepEqual(d2.freshZones, [{ label: '상승 1', from: 0, to: 100 }]);
  });
});

describe('normMaList / normExitList', () => {
  const sig = { signal: 'golden', action: 'buy', percent: 20, candleFilter: 'any', volumeFilter: 'any', consecutive: 2, alignment: 'any', condTrade: { type: 'any', operator: 'any', value: 1 }, condCandle: { type: 'any', operator: 'any', value: 1 }, condMa: { type: 'any', operator: 'any', value: 1 } };
  it('valid passes, clamps applied', () => {
    const ma = normMaList([{ period: 1, color: 'nope', pyramiding: { signals: [sig] } }]);
    assert.equal(ma![0].period, 2);
    assert.equal(ma![0].color, '#6366f1');
  });
  it('garbage → null', () => {
    assert.equal(normMaList(null), null);
    assert.equal(normMaList([{ nope: 1 }]), null);
    assert.equal(normExitList('x'), null);
  });
  it('exits: none-filtered → [], valid kept', () => {
    assert.deepEqual(normExitList([{ basis: 'none' }]), []);
    const ex = normExitList([{ basis: 'profitRise', percent: 15, sellPercent: 100, skip: 5, candle: 'any', volume: 'any' }]);
    assert.equal(ex!.length, 1);
    assert.equal(ex![0].basis, 'profitRise');
  });
});

describe('sets URL round-trip', () => {
  const sig = (signal: string, action: string) => ({ signal, action, percent: 20, candleFilter: 'any', volumeFilter: 'higher', consecutive: 2, alignment: 'aligned', condTrade: { type: 'consecutiveBuy', operator: '>=', value: 2 }, condCandle: { type: 'any', operator: 'any', value: 1 }, condMa: { type: 'maSlope', operator: '>', value: 5 } });
  const mkSet = (i: number, trend: number) => ({
    id: i, label: trend === 1 ? `상승 ${i}` : `하락 ${i}`, trend, from: i * 50, to: i * 50 + 49, color: '#7c3aed',
    maConfigs: [
      { period: 20, color: '#ef4444', pyramiding: { signals: [sig('golden', 'buy'), sig('dead', 'sell')] } },
      { period: 60, color: '#6366f1', pyramiding: { signals: [sig('dead', 'sell')] } },
    ],
    exitConfigs: [{ basis: 'profitRise', percent: 15, sellPercent: 100, skip: 5, candle: 'any', volume: 'any' }],
    mres: 'minFirst', xres: 'all', profit: 0, rate: 0, trades: 0,
  });
  const toParam = (sets: any[]) => {
    // 실제 흐름: pre-encode + searchParams.set() → 2중 인코딩
    const jar = new URLSearchParams();
    jar.set('sets', encodeURIComponent(compressToEncodedURIComponent(JSON.stringify(compactSetsForUrl(sets as any)))));
    return jar.get('sets')!;
  };
  it('compact+compress round-trip equals original (after norm)', () => {
    const sets = [mkSet(0, 1), mkSet(1, 0), mkSet(2, 0.5)] as any[];
    const expanded = expandSetsFromUrl(parseSetsParam(toParam(sets))!);
    assert.equal(expanded.length, 3);
    expanded.forEach((s: any, i: number) => {
      const o = sets[i];
      assert.equal(s.label, o.label);
      assert.equal(s.trend, o.trend);
      assert.equal(s.from, o.from);
      assert.equal(s.to, o.to);
      assert.deepEqual(normMaList(s.maConfigs), o.maConfigs);
      assert.deepEqual(normExitList(s.exitConfigs), o.exitConfigs);
    });
  });
  it('legacy verbose still parses, garbage → null', () => {
    const sets = [mkSet(0, 1)] as any[];
    const legacy = new URLSearchParams();
    legacy.set('sets', encodeURIComponent(JSON.stringify(sets)));
    const parsed = parseSetsParam(legacy.get('sets')!);
    assert.ok(Array.isArray(parsed) && parsed!.length === 1);
    assert.equal(parseSetsParam('!!!not-valid!!!'), null);
  });
});
