import { describe, it, expect } from 'vitest';
import { makeRng, hashSeed } from './rng';

describe('makeRng', () => {
  it('同じシードからは同じ数列を返す', () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('異なるシードでは数列が分かれる', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('next()は0以上1未満に収まる', () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int()は両端を含む範囲を返す', () => {
    const r = makeRng(99);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 2000; i++) {
      const v = r.int(3, 6);
      expect(Number.isInteger(v)).toBe(true);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBe(3);
    expect(max).toBe(6);
  });

  it('shuffleは要素を保ったまま並べ替える', () => {
    const r = makeRng(42);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle([...arr]);
    expect([...out].sort((x, y) => x - y)).toEqual(arr);
  });

  it('pickは空配列で例外を投げる', () => {
    const r = makeRng(1);
    expect(() => r.pick([])).toThrow();
  });
});

describe('hashSeed', () => {
  it('同じ文字列からは同じ値を返す', () => {
    expect(hashSeed('地下')).toBe(hashSeed('地下'));
  });

  it('異なる文字列は基本的に別の値になる', () => {
    expect(hashSeed('chika')).not.toBe(hashSeed('chikb'));
  });

  it('32bit符号なし整数の範囲に収まる', () => {
    const v = hashSeed('長めのシード文字列をいれてみる');
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(v)).toBe(true);
  });
});
