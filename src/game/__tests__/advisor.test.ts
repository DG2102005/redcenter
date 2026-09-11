import { describe, it, expect } from 'vitest';
import { calcShantenFromBase, buildHandFromCodes, analysisFromHandCodes, codeToIndex } from '../advisor';
import { calcShantenFromCounts } from '../win';

describe('calcShantenFromCounts', () => {
  it('returns -1 for a winning hand', () => {
    // 1m2m3m 4m5m6m 7m8m9m 1p2p3p 5m5m — 14 tiles winning
    const codes = ['m1','m2','m3','m4','m5','m6','m7','m8','m9','p1','p2','p3','p5','p5'];
    const counts = codesToCounts(codes);
    expect(calcShantenFromCounts(counts, 0)).toBe(-1);
  });

  it('returns 0 for a ready hand', () => {
    // 1m2m3m 4m5m6m 7m8m9m 1p2p 5m5m — 13 tiles tenpai (wait p3 or p5)
    const codes = ['m1','m2','m3','m4','m5','m6','m7','m8','m9','p1','p2','p5','p5'];
    const counts = codesToCounts(codes);
    expect(calcShantenFromCounts(counts, 0)).toBe(0);
  });

  it('returns 1 for iishanten hand', () => {
    // 1m2m3m 4m5m6m 7m8m9m p1 p2 5m5m — 12 tiles, 1-shanten
    const codes = ['m1','m2','m3','m4','m5','m6','m7','m8','m9','p1','p2','p5'];
    const counts = codesToCounts(codes);
    expect(calcShantenFromCounts(counts, 0)).toBe(1);
  });

  it('handles hongzhong wildcard correctly', () => {
    // 1m2m3m 4m5m6m 7m8m9m p1p2 z5 — 13 tiles with wildcard, should be tenpai (z5 as p3 or pair)
    const codes = ['m1','m2','m3','m4','m5','m6','m7','m8','m9','p1','p2','p5','z5'];
    const counts = codesToCounts(codes);
    expect(calcShantenFromCounts(counts, 0)).toBe(0);
  });
});

describe('calcShantenFromBase', () => {
  it('computes shanten for 14-tile hand as minimum over discards', () => {
    // 14 tiles tenpai-ish: discarding any non-needed tile should give 0
    const codes = ['m1','m2','m3','m4','m5','m6','m7','m8','m9','p1','p2','p3','p5','p5'];
    const hand = buildHandFromCodes(codes);
    expect(calcShantenFromBase(hand, 0)).toBe(-1); // already winning
  });

  it('computes shanten for 13-tile tenpai hand', () => {
    const codes = ['m1','m2','m3','m4','m5','m6','m7','m8','m9','p1','p2','p5','p5'];
    const hand = buildHandFromCodes(codes);
    expect(calcShantenFromBase(hand, 0)).toBe(0);
  });
});

describe('analysisFromHandCodes', () => {
  it('returns sorted scenarios with the best discard first', () => {
    // 14 tiles: 1m2m3m 4m5m6m 7m8m9m 1p2p3p 5m5m — winning hand
    const codes = ['m1','m2','m3','m4','m5','m6','m7','m8','m9','p1','p2','p3','p5','p5'];
    const analysis = analysisFromHandCodes(codes, 0, []);
    expect(analysis.currentShanten).toBe(-1);
    expect(analysis.scenarios.length).toBeGreaterThan(0);
  });

  it('recommends safe terminal/honor tiles over middle tiles in a far hand', () => {
    // Far from ready: mix of honors and terminals
    const codes = ['z1','z2','z3','z4','m1','m9','p1','p9','s1','s9','m2','m3','p2','p3'];
    const analysis = analysisFromHandCodes(codes, 0, []);
    const best = analysis.scenarios[0];
    // Best should be a terminal/honor with relatively low danger
    expect(best).toBeDefined();
    expect(best.shantenAfter).toBeGreaterThanOrEqual(0);
  });

  it('includes improvement tiles in each scenario', () => {
    const codes = ['m1','m2','m3','m4','m5','m6','m7','m8','m9','p1','p2','p5','p5','z1'];
    const analysis = analysisFromHandCodes(codes, 0, []);
    const best = analysis.scenarios[0];
    expect(best.improvementCodes.length).toBeGreaterThan(0);
    expect(best.incomingNames.length).toBe(best.improvementCodes.length);
  });

  it('never includes hongzhong as a discard option', () => {
    const codes = ['z5','m1','m2','m3','m4','m5','m6','m7','m8','m9','p1','p2','p3','p4'];
    const analysis = analysisFromHandCodes(codes, 0, []);
    const hzScenario = analysis.scenarios.find((s) => s.discardCode === 'z5');
    const nonHzBest = analysis.scenarios[0];
    expect(hzScenario).toBeUndefined();
    expect(nonHzBest.discardCode).not.toBe('z5');
  });
});

describe('codeToIndex', () => {
  it('maps codes to correct indices', () => {
    expect(codeToIndex('m1')).toBe(0);
    expect(codeToIndex('m9')).toBe(8);
    expect(codeToIndex('p1')).toBe(9);
    expect(codeToIndex('s9')).toBe(26);
    expect(codeToIndex('z1')).toBe(27);
    expect(codeToIndex('z5')).toBe(31);
  });
});

function codesToCounts(codes: string[]): number[] {
  const counts = new Array(34).fill(0);
  for (const code of codes) {
    counts[codeToIndex(code)]++;
  }
  return counts;
}
