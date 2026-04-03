import { describe, it, expect } from 'vitest';
import { Game, MAX_DEPTH, type GameSnapshot } from './game';
import { makeItem } from './data';
import type { Entity, Tile } from './types';

/** 周囲を壁で囲んだ開けた部屋にプレイヤーだけを置く。戦闘や移動を狙って試すための舞台。 */
function arena(seed: string | number = 'arena'): Game {
  const g = new Game(seed);
  const W = 20;
  const H = 12;
  const tiles: Tile[][] = Array.from({ length: H }, () =>
    Array.from({ length: W }, () => 'floor' as Tile),
  );
  for (let x = 0; x < W; x++) {
    tiles[0]![x] = 'wall';
    tiles[H - 1]![x] = 'wall';
  }
  for (let y = 0; y < H; y++) {
    tiles[y]![0] = 'wall';
    tiles[y]![W - 1] = 'wall';
  }
  tiles[H - 2]![W - 2] = 'stairs';
  g.level = {
    width: W,
    height: H,
    tiles,
    rooms: [{ x: 1, y: 1, w: W - 2, h: H - 2 }],
    entry: { x: 5, y: 5 },
    stairs: { x: W - 2, y: H - 2 },
  };
  g.entities = [g.player];
  g.player.x = 5;
  g.player.y = 5;
  g.ground = [];
  return g;
}

function monster(over: Partial<Entity> = {}): Entity {
  return {
    id: 900 + Math.floor(Math.random() * 1000),
    name: 'どぶねずみ',
    glyph: 'r',
    tint: 'beast',
    x: 6,
    y: 5,
    hp: 4,
    maxHp: 4,
    power: 3,
    defense: 0,
    xpReward: 2,
    isPlayer: false,
    awake: true,
    confused: 0,
    ...over,
  };
}

describe('Game 初期状態', () => {
  it('地下1階のプレイヤーから始まる', () => {
    const g = new Game('hello');
    expect(g.status).toBe('playing');
    expect(g.depth).toBe(1);
    expect(g.player.isPlayer).toBe(true);
    expect(g.player.hp).toBe(30);
    expect(g.inventory).toHaveLength(2);
    expect(g.player.x).toBe(g.level.entry.x);
  });

  it('同じシードからは同じ盤面と敵配置になる', () => {
    const a = new Game('同一シード');
    const b = new Game('同一シード');
    expect(b.level.tiles).toEqual(a.level.tiles);
    expect(b.entities.map((e) => [e.x, e.y, e.name])).toEqual(
      a.entities.map((e) => [e.x, e.y, e.name]),
    );
  });
});

describe('移動と攻撃', () => {
  it('床へ歩くと位置が変わりターンが進む', () => {
    const g = arena();
    g.perform({ kind: 'move', dx: 1, dy: 0 });
    expect(g.player.x).toBe(6);
    expect(g.player.y).toBe(5);
    expect(g.turn).toBe(1);
  });

  it('壁にはぶつかって進めず、ターンも消費しない', () => {
    const g = arena();
    g.player.x = 1;
    g.player.y = 1;
    g.perform({ kind: 'move', dx: -1, dy: 0 }); // 左は外壁
    expect(g.player.x).toBe(1);
    expect(g.turn).toBe(0);
  });

  it('敵のいるマスへ動くと攻撃になり、倒すと経験値を得る', () => {
    const g = arena();
    g.entities.push(monster({ x: 6, y: 5 }));
    g.perform({ kind: 'move', dx: 1, dy: 0 });
    expect(g.entities).toHaveLength(1); // ねずみは消える
    expect(g.xp).toBe(2);
    expect(g.player.x).toBe(5); // 攻撃した手は移動しない
  });

  it('硬い敵を殴ると反撃でこちらも傷つく', () => {
    const g = arena();
    g.entities.push(
      monster({ name: 'オーク', x: 6, y: 5, hp: 13, maxHp: 13, power: 6, defense: 1 }),
    );
    const before = g.player.hp;
    g.perform({ kind: 'move', dx: 1, dy: 0 });
    const orc = g.entities.find((e) => !e.isPlayer)!;
    expect(orc.hp).toBe(13 - (5 - 1)); // 攻撃力5 - 防御1
    expect(g.player.hp).toBe(before - (6 - 2)); // 敵攻撃6 - 防御2
  });
});

describe('敵のAI', () => {
  it('起きた敵は距離場をたどってプレイヤーへ近づく', () => {
    const g = arena();
    const m = monster({ x: 10, y: 5, hp: 99, awake: true });
    g.entities.push(m);
    const before = Math.max(Math.abs(m.x - g.player.x), Math.abs(m.y - g.player.y));
    g.perform({ kind: 'wait' });
    const after = Math.max(Math.abs(m.x - g.player.x), Math.abs(m.y - g.player.y));
    expect(after).toBeLessThan(before);
  });

  it('眠っている敵は動かない', () => {
    const g = arena();
    const m = monster({ x: 15, y: 8, awake: false });
    g.entities.push(m);
    g.perform({ kind: 'wait' });
    expect([m.x, m.y]).toEqual([15, 8]);
  });

  it('隣接した敵はプレイヤーを攻撃する', () => {
    const g = arena();
    g.entities.push(monster({ x: 6, y: 5, awake: true }));
    const before = g.player.hp;
    g.perform({ kind: 'wait' });
    expect(g.player.hp).toBe(before - (3 - 2)); // ねずみの攻撃3 - 防御2
  });

  it('HPが尽きると死亡状態になる', () => {
    const g = arena();
    g.player.hp = 3;
    g.entities.push(monster({ name: 'オーガ', x: 6, y: 5, awake: true, power: 10 }));
    g.perform({ kind: 'wait' });
    expect(g.status).toBe('dead');
  });
});

describe('アイテム', () => {
  it('足元のアイテムを拾うと持ち物に入る', () => {
    const g = arena();
    g.ground.push({
      item: makeItem(
        {
          name: '回復の薬',
          glyph: '!',
          kind: 'consumable',
          effect: { kind: 'heal', amount: 16 },
          minDepth: 1,
          weight: 0,
        },
        71,
      ),
      x: 5,
      y: 5,
    });
    const n = g.inventory.length;
    g.perform({ kind: 'pickup' });
    expect(g.inventory).toHaveLength(n + 1);
    expect(g.ground).toHaveLength(0);
  });

  it('回復の薬でHPが戻る', () => {
    const g = arena();
    g.player.hp = 10;
    g.perform({ kind: 'use', index: 0 });
    expect(g.player.hp).toBe(26);
    expect(g.inventory).toHaveLength(1);
  });

  it('満タンでは薬を消費しない', () => {
    const g = arena();
    g.perform({ kind: 'use', index: 0 });
    expect(g.inventory).toHaveLength(2);
    expect(g.turn).toBe(0);
  });

  it('武器を使うと装備され、攻撃力が上がる', () => {
    const g = arena();
    const idx = g.inventory.length;
    g.inventory.push(
      makeItem({ name: '剣', glyph: ')', kind: 'weapon', power: 4, minDepth: 1, weight: 0 }, 72),
    );
    const basePower = g.player.power;
    g.perform({ kind: 'use', index: idx });
    expect(g.weapon?.name).toBe('剣');
    expect(g.combatPower(g.player)).toBe(basePower + 4);
  });

  it('稲妻の巻物は視界内の敵を撃つ', () => {
    const g = arena();
    g.perform({ kind: 'wait' }); // 視界をこの舞台に合わせて更新する
    g.entities.push(monster({ x: 7, y: 5, hp: 4, awake: true }));
    const idx = g.inventory.length;
    g.inventory.push(
      makeItem(
        {
          name: '稲妻の巻物',
          glyph: '?',
          kind: 'consumable',
          effect: { kind: 'lightning', damage: 18, range: 6 },
          minDepth: 2,
          weight: 0,
        },
        73,
      ),
    );
    g.perform({ kind: 'use', index: idx });
    expect(g.entities.some((e) => e.name === 'どぶねずみ')).toBe(false);
  });
});

describe('階層の移動', () => {
  it('階段の上で降りると階が深くなる', () => {
    const g = arena();
    g.player.x = g.level.stairs.x;
    g.player.y = g.level.stairs.y;
    g.perform({ kind: 'descend' });
    expect(g.depth).toBe(2);
    expect(g.status).toBe('playing');
  });

  it('階段のない場所では降りられない', () => {
    const g = arena();
    g.perform({ kind: 'descend' });
    expect(g.depth).toBe(1);
    expect(g.turn).toBe(0);
  });
});

describe('踏破', () => {
  it('全階を降りて最深部の護符を回収すると勝利する', () => {
    const g = new Game('降下テスト');
    while (g.depth < MAX_DEPTH) {
      g.player.x = g.level.stairs.x;
      g.player.y = g.level.stairs.y;
      const here = g.depth;
      g.perform({ kind: 'descend' });
      expect(g.depth).toBe(here + 1);
      expect(g.status).toBe('playing');
    }
    const amulet = g.ground.find((gi) => gi.item.kind === 'amulet');
    expect(amulet).toBeDefined();
    g.player.x = amulet!.x;
    g.player.y = amulet!.y;
    g.perform({ kind: 'pickup' });
    expect(g.status).toBe('won');
  });
});

describe('成長', () => {
  it('しきい値を超える経験値でレベルが上がる', () => {
    const g = arena();
    g.xp = g.xpToNext - 1; // あと2の経験値で到達
    g.entities.push(monster({ x: 6, y: 5, xpReward: 2 }));
    g.perform({ kind: 'move', dx: 1, dy: 0 });
    expect(g.playerLevel).toBe(2);
    expect(g.player.maxHp).toBe(42);
    expect(g.player.power).toBe(6);
  });
});

describe('セーブと復元', () => {
  function played(seed = '保存テスト'): Game {
    const g = new Game(seed);
    // 何手か進め、探索済み・ターン・ログを溜める。
    g.perform({ kind: 'wait' });
    g.perform({ kind: 'move', dx: 1, dy: 0 });
    g.perform({ kind: 'move', dx: 0, dy: 1 });
    return g;
  }

  it('serialize→restoreで主要な状態が一致する', () => {
    const g = played();
    const restored = Game.restore(g.serialize());
    expect(restored.seedText).toBe(g.seedText);
    expect(restored.depth).toBe(g.depth);
    expect(restored.turn).toBe(g.turn);
    expect(restored.status).toBe(g.status);
    expect(restored.player.hp).toBe(g.player.hp);
    expect([restored.player.x, restored.player.y]).toEqual([g.player.x, g.player.y]);
    expect(restored.inventory.map((i) => i.name)).toEqual(g.inventory.map((i) => i.name));
    expect(restored.entities.map((e) => [e.x, e.y, e.hp])).toEqual(
      g.entities.map((e) => [e.x, e.y, e.hp]),
    );
    expect(restored.explored).toEqual(g.explored);
    expect([...restored.messages]).toEqual([...g.messages]);
  });

  it('復元した地形は元と同一になる', () => {
    const g = played('地形復元');
    const restored = Game.restore(g.serialize());
    expect(restored.level.tiles).toEqual(g.level.tiles);
  });

  it('復元後も冒険を続けられる', () => {
    const g = played('継続');
    const restored = Game.restore(g.serialize());
    const turnBefore = restored.turn;
    expect(() => restored.perform({ kind: 'wait' })).not.toThrow();
    expect(restored.turn).toBe(turnBefore + 1);
  });

  it('深い階のセーブも地形ごと復元できる', () => {
    const g = new Game('深層保存');
    while (g.depth < 4) {
      g.player.x = g.level.stairs.x;
      g.player.y = g.level.stairs.y;
      g.perform({ kind: 'descend' });
    }
    const restored = Game.restore(g.serialize());
    expect(restored.depth).toBe(4);
    expect(restored.level.tiles).toEqual(g.level.tiles);
  });

  it('最深階の護符が残ったセーブも復元できる', () => {
    const g = new Game('護符保存');
    while (g.depth < MAX_DEPTH) {
      g.player.x = g.level.stairs.x;
      g.player.y = g.level.stairs.y;
      g.perform({ kind: 'descend' });
    }
    const restored = Game.restore(g.serialize());
    expect(restored.ground.some((gi) => gi.item.kind === 'amulet')).toBe(true);
  });

  it('バージョンの違う保存は弾ける形にしてある', () => {
    const snap = new Game('x').serialize();
    expect(snap.v).toBe(1);
    const bad = { ...snap, v: 2 } as unknown as GameSnapshot;
    // 呼び出し側がvで判定できるよう、versionは数値で持つ。
    expect(bad.v).not.toBe(1);
  });
});
