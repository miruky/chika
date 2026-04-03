// シード付き擬似乱数。同じシードからは常に同じダンジョン・同じ敵配置が再現される。
// ダンジョン生成・敵やアイテムの抽選はすべてこの乱数を通すため、シードが冒険の identity になる。

export interface Rng {
  /** 0以上1未満の浮動小数を返し、内部状態を進める。 */
  next(): number;
  /** min以上max以下の整数を返す(両端を含む)。 */
  int(min: number, max: number): number;
  /** 確率pでtrueを返す。 */
  chance(p: number): boolean;
  /** 配列から1要素を選ぶ。空配列はエラー。 */
  pick<T>(items: readonly T[]): T;
  /** 配列を破壊的にシャッフルし、その配列を返す(Fisher-Yates)。 */
  shuffle<T>(items: T[]): T[];
}

/** 文字列シードを32bit整数へ畳み込む。URL共有のシードに任意文字列を使えるようにする。 */
export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32。状態32bitの軽量PRNG。分布は実用十分で、再現性のために採用している。 */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    chance: (p) => next() < p,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('空配列からは選べない');
      return items[int(0, items.length - 1)]!;
    },
    shuffle<T>(items: T[]): T[] {
      for (let i = items.length - 1; i > 0; i--) {
        const j = int(0, i);
        const a = items[i]!;
        items[i] = items[j]!;
        items[j] = a;
      }
      return items;
    },
  };
}
