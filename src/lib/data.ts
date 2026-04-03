import type { Effect, Item } from './types';

/** 敵の種別定義。出現はminDepth以上の階に限られ、weightで頻度を調整する。 */
export interface MonsterDef {
  name: string;
  glyph: string;
  tint: string;
  hp: number;
  power: number;
  defense: number;
  xpReward: number;
  minDepth: number;
  weight: number;
}

// 浅い階は弱い小動物、深い階は重装・大型へ。最深階の番人としてドラゴンを置く。
export const MONSTERS: readonly MonsterDef[] = [
  {
    name: 'どぶねずみ',
    glyph: 'r',
    tint: 'beast',
    hp: 4,
    power: 3,
    defense: 0,
    xpReward: 2,
    minDepth: 1,
    weight: 10,
  },
  {
    name: 'こうもり',
    glyph: 'b',
    tint: 'beast',
    hp: 5,
    power: 3,
    defense: 0,
    xpReward: 3,
    minDepth: 1,
    weight: 8,
  },
  {
    name: 'コボルト',
    glyph: 'k',
    tint: 'fiend',
    hp: 7,
    power: 4,
    defense: 0,
    xpReward: 5,
    minDepth: 1,
    weight: 7,
  },
  {
    name: 'へび',
    glyph: 's',
    tint: 'beast',
    hp: 8,
    power: 4,
    defense: 1,
    xpReward: 6,
    minDepth: 2,
    weight: 7,
  },
  {
    name: 'ゴブリン',
    glyph: 'g',
    tint: 'fiend',
    hp: 10,
    power: 5,
    defense: 1,
    xpReward: 9,
    minDepth: 2,
    weight: 8,
  },
  {
    name: 'オーク',
    glyph: 'o',
    tint: 'fiend',
    hp: 13,
    power: 6,
    defense: 1,
    xpReward: 12,
    minDepth: 3,
    weight: 8,
  },
  {
    name: 'がいこつ',
    glyph: 'z',
    tint: 'undead',
    hp: 11,
    power: 6,
    defense: 2,
    xpReward: 12,
    minDepth: 3,
    weight: 6,
  },
  {
    name: 'グール',
    glyph: 'G',
    tint: 'undead',
    hp: 16,
    power: 7,
    defense: 2,
    xpReward: 18,
    minDepth: 4,
    weight: 6,
  },
  {
    name: 'オーガ',
    glyph: 'O',
    tint: 'fiend',
    hp: 20,
    power: 9,
    defense: 2,
    xpReward: 24,
    minDepth: 5,
    weight: 5,
  },
  {
    name: 'レイス',
    glyph: 'W',
    tint: 'undead',
    hp: 17,
    power: 10,
    defense: 3,
    xpReward: 30,
    minDepth: 6,
    weight: 5,
  },
  {
    name: 'トロル',
    glyph: 'T',
    tint: 'fiend',
    hp: 30,
    power: 11,
    defense: 3,
    xpReward: 42,
    minDepth: 7,
    weight: 4,
  },
  {
    name: 'ドラゴン',
    glyph: 'D',
    tint: 'boss',
    hp: 44,
    power: 14,
    defense: 4,
    xpReward: 90,
    minDepth: 8,
    weight: 3,
  },
];

/** その階に出現しうる敵を、出現重みを反映した抽選用リストとして展開する。 */
export function spawnTable(depth: number): MonsterDef[] {
  const table: MonsterDef[] = [];
  for (const m of MONSTERS) {
    if (m.minDepth > depth) continue;
    // 登場したばかりの敵を厚めにし、深くなるほど浅い敵の重みを下げる。
    const freshness = Math.max(1, 4 - (depth - m.minDepth));
    const count = m.weight + freshness;
    for (let i = 0; i < count; i++) table.push(m);
  }
  return table;
}

/** 消耗品・装備の定義。これを複製してユニークidを振り、床やインベントリに置く。 */
export interface ItemDef {
  name: string;
  glyph: string;
  kind: Item['kind'];
  effect?: Effect;
  power?: number;
  defense?: number;
  minDepth: number;
  weight: number;
}

export const ITEMS: readonly ItemDef[] = [
  {
    name: '回復の薬',
    glyph: '!',
    kind: 'consumable',
    effect: { kind: 'heal', amount: 16 },
    minDepth: 1,
    weight: 12,
  },
  {
    name: '稲妻の巻物',
    glyph: '?',
    kind: 'consumable',
    effect: { kind: 'lightning', damage: 18, range: 6 },
    minDepth: 2,
    weight: 6,
  },
  {
    name: '火炎の巻物',
    glyph: '?',
    kind: 'consumable',
    effect: { kind: 'fire', damage: 12, radius: 3 },
    minDepth: 3,
    weight: 5,
  },
  {
    name: '混乱の巻物',
    glyph: '?',
    kind: 'consumable',
    effect: { kind: 'confuse', turns: 8, range: 6 },
    minDepth: 2,
    weight: 5,
  },
  {
    name: '瞬間移動の巻物',
    glyph: '?',
    kind: 'consumable',
    effect: { kind: 'blink' },
    minDepth: 2,
    weight: 4,
  },
  { name: '短剣', glyph: ')', kind: 'weapon', power: 2, minDepth: 1, weight: 4 },
  { name: '剣', glyph: ')', kind: 'weapon', power: 4, minDepth: 3, weight: 4 },
  { name: '戦斧', glyph: ')', kind: 'weapon', power: 6, minDepth: 5, weight: 3 },
  { name: '革鎧', glyph: '[', kind: 'armor', defense: 2, minDepth: 1, weight: 4 },
  { name: '鎖帷子', glyph: '[', kind: 'armor', defense: 4, minDepth: 4, weight: 3 },
  { name: '板金鎧', glyph: '[', kind: 'armor', defense: 6, minDepth: 6, weight: 2 },
];

export function itemTable(depth: number): ItemDef[] {
  const table: ItemDef[] = [];
  for (const it of ITEMS) {
    if (it.minDepth > depth) continue;
    for (let i = 0; i < it.weight; i++) table.push(it);
  }
  return table;
}

/** 最深階。ここに護符を置き、回収するとゲームクリアになる。 */
export const MAX_DEPTH = 8;

export function makeItem(def: ItemDef, id: number): Item {
  switch (def.kind) {
    case 'consumable':
      return { id, name: def.name, glyph: def.glyph, kind: 'consumable', effect: def.effect! };
    case 'weapon':
      return { id, name: def.name, glyph: def.glyph, kind: 'weapon', power: def.power! };
    case 'armor':
      return { id, name: def.name, glyph: def.glyph, kind: 'armor', defense: def.defense! };
    case 'amulet':
      return { id, name: def.name, glyph: def.glyph, kind: 'amulet' };
  }
}

export const AMULET: Item = { id: -1, name: '地下の護符', glyph: '"', kind: 'amulet' };
