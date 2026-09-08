import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import lzString from 'lz-string';
import {
  TrendRange,
  zoneRegimeOf,
  diffZoneSets,
  compactSetsForUrl,
  expandSetsFromUrl,
  parseSetsParam,
  normMaList,
  normExitList,
} from '../src/pages/stock-trading-simulation/StockTradingSimulationPage';

const { compressToEncodedURIComponent } = lzString;
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// obv=null → MACD파트·RSI파트 평균만. signal은 내부 EMA가 macd를 뒤따라오므로 기울기로 방향 유도
const downBar = (i: number): TrendRange.TrendBar => ({ macd: -1 - i * 0.05, rsi: 30, obv: null }); // 하락지속 → macd<signal → (0+0.3)/2=0.15
const sideBar = (i: number): TrendRange.TrendBar => ({ macd: -1, rsi: 50, obv: null }); // 수렴 → (0.5+0.5)/2=0.5
const upBar = (i: number): TrendRange.TrendBar => ({ macd: 1 + i * 0.05, rsi: 90, obv: null }); // 상승지속 → macd>signal → (1+0.9)/2=0.95
const rep = (n: number, f: (i: number) => TrendRange.TrendBar): TrendRange.TrendBar[] => Array.from({ length: n }, (_, i) => f(i));
const grp = (r: number): string => r > 0.6 ? 'up' : r < 0.4 ? 'dn' : 'side';

describe('TrendRange.trendRanges', () => {
  it('down/side/up split with mean scoreRates', () => {
    const zs = TrendRange.trendRanges([...rep(30, downBar), ...rep(30, sideBar), ...rep(30, upBar)], { groupBy: grp });
    assert.equal(zs.length, 3);
    assert.deepEqual(zs.map(g => [g.startIndex, g.endIndex]), [[0, 29], [30, 59], [60, 89]]);
    // 경계 봉의 signal 수렴 과정이 섞여 평균이 이론값에서 미세 이탈
    assert.ok(Math.abs(zs[0].scoreRate - 0.15) < 0.02 && zs[1].scoreRate === 0.5 && near(zs[2].scoreRate, 0.95));
    assert.deepEqual(zs.map(g => g.group), ['dn', 'side', 'up']);
  });
  it('short flat run merges forward (earlier zones immutable)', () => {
    const zs = TrendRange.trendRanges([...rep(30, upBar), ...rep(3, sideBar), ...rep(30, downBar)], { groupBy: grp });
    assert.equal(zs.length, 2);
    assert.deepEqual(zs.map(g => [g.startIndex, g.endIndex]), [[0, 29], [30, 62]]);
    assert.deepEqual(zs.map(g => g.group), ['up', 'dn']);
  });
  it('maxSets caps zone count (default 12), no adjacent duplicates', () => {
    const alt = (i: number): TrendRange.TrendBar => (Math.floor(i / 10) % 2 === 0 ? upBar(i) : downBar(i));
    const zs = TrendRange.trendRanges(rep(200, alt), { groupBy: grp });
    assert.ok(zs.length <= 12 && zs.length >= 1);
    for (let i = 1; i < zs.length; i++) assert.notEqual(zs[i].group, zs[i - 1].group);
  });
  it('empty → []', () => {
    assert.deepEqual(TrendRange.trendRanges([], { groupBy: grp }), []);
  });
  it('uuid: same input → same, different → different, 16 hex', () => {
    const a = [...rep(30, downBar), ...rep(30, upBar)];
    const z1 = TrendRange.trendRanges(a, { groupBy: grp });
    const z2 = TrendRange.trendRanges([...rep(30, downBar), ...rep(30, upBar)], { groupBy: grp });
    assert.deepEqual(z1.map(g => g.uuid), z2.map(g => g.uuid));
    assert.ok(z1.every(g => /^[0-9a-f]{16}$/.test(g.uuid)));
    const z3 = TrendRange.trendRanges([...rep(30, downBar), ...rep(30, sideBar)], { groupBy: grp });
    assert.notDeepEqual(z1.map(g => g.uuid), z3.map(g => g.uuid));
  });
  it('zoneRegimeOf thresholds', () => {
    assert.equal(zoneRegimeOf(0.95).label, '상승');
    assert.equal(zoneRegimeOf(0.15).label, '하락');
    assert.equal(zoneRegimeOf(0.5).label, '횡보');
  });
  it('strengthRate: strong trend → high, chop → low', () => {
    // 강력 상승: 장대양봉 연속 (몸통=폭, 효율 1)
    const strong = rep(30, (i) => ({ ...upBar(i), open: 100 + i * 10, high: 110 + i * 10, low: 100 + i * 10, close: 110 + i * 10 }));
    const zStrong = TrendRange.trendRanges(strong, { groupBy: grp, minLen: 1, maxSets: 0 });
    assert.ok(zStrong.length >= 1 && zStrong.every(g => g.strengthRate > 0.7), JSON.stringify(zStrong.map(g => g.strengthRate)));
    // 횡보: 도지 연속 (몸통 0, 효율 0)
    const chop = rep(30, () => ({ macd: 0.1, rsi: 50, obv: null, open: 100, high: 110, low: 90, close: 100 }));
    const zChop = TrendRange.trendRanges(chop, { groupBy: grp, minLen: 1, maxSets: 0 });
    assert.ok(zChop.length >= 1 && zChop.every(g => g.strengthRate < 0.4), JSON.stringify(zChop.map(g => g.strengthRate)));
  });
  it('strengthRate without OHLC falls back to distance only', () => {
    const zs = TrendRange.trendRanges(rep(30, upBar), { groupBy: grp, minLen: 1, maxSets: 0 });
    // score 0.95 → 거리 0.9
    assert.ok(zs.length === 1 && Math.abs(zs[0].strengthRate - 0.9) < 0.05);
  });
  it('appending bars never shrinks fixed zones (live edge exempt)', () => {
    // 앞 60봉으로 확정한 구간들은 뒤에 30봉이 붙어도 시작점·끝점 유지 (맨 끝 제외)
    const mk = (n: number, f: (i: number) => TrendRange.TrendBar): TrendRange.TrendBar[] => Array.from({ length: n }, (_, i) => f(i));
    const seg = (base: number, slope: number, rsi: number) => (i: number): TrendRange.TrendBar => ({ macd: base + i * slope, rsi, obv: null });
    const prefix = [...mk(30, seg(1, 0.05, 90)), ...mk(30, seg(-1, -0.05, 30))];
    const full = [...prefix, ...mk(30, seg(1, 0.05, 90))];
    const zPre = TrendRange.trendRanges(prefix, { groupBy: grp });
    const zFull = TrendRange.trendRanges(full, { groupBy: grp });
    assert.ok(zPre.length >= 2 && zFull.length >= 2);
    // 확정 구간(맨 끝 제외)은 그대로
    for (let k = 0; k < zPre.length - 1; k++) {
      const same = zFull.find(z => z.startIndex === zPre[k].startIndex && z.endIndex === zPre[k].endIndex);
      assert.ok(same, `zone ${k} changed: [${zPre[k].startIndex}-${zPre[k].endIndex}]`);
    }
    // 맨 끝 구간의 시작점도 유지 (끝만 늘어날 수 있음)
    const lastPre = zPre[zPre.length - 1];
    assert.ok(zFull.some(z => z.startIndex === lastPre.startIndex));
  });
});

describe('diffZoneSets: name-first match with range check', () => {
  it('keeps matching, fresh for new', () => {
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
  const sig = (signal: string, action: string) => ({ signal, action, percent: 20, candleFilter: 'any', volumeFilter: 'higher', consecutive: 2, alignment: 'aligned', skipAfter: 0, condTrade: { type: 'consecutiveBuy', operator: '>=', value: 2 }, condCandle: { type: 'any', operator: 'any', value: 1 }, condMa: { type: 'maSlope', operator: '>', value: 5 } });
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
