import { describe, it, expect } from 'vitest';
import { generateLevel, isFloor, MAP_W, MAP_H } from './map';
import { makeRng } from './rng';
import type { Level } from './types';

function build(seed: number, depth: number): Level {
  return generateLevel(makeRng(seed), depth);
}

/** entryから非壁マスを4近傍で塗りつぶし、到達できた床マス数を数える。 */
function reachableFloors(level: Level): number {
  const seen = new Set<string>();
  const stack = [`${level.entry.x},${level.entry.y}`];
  seen.add(stack[0]!);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (stack.length > 0) {
    const [x, y] = stack.pop()!.split(',').map(Number) as [number, number];
    for (const [dx, dy] of dirs) {
      const nx = x + dx!;
      const ny = y + dy!;
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      if (!isFloor(level, nx, ny)) continue;
      seen.add(k);
      stack.push(k);
    }
  }
  return seen.size;
}

function totalFloors(level: Level): number {
  let n = 0;
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (level.tiles[y]![x] !== 'wall') n++;
    }
  }
  return n;
}

describe('generateLevel', () => {
  it('指定どおりの広さの盤面を作る', () => {
    const level = build(1, 1);
    expect(level.width).toBe(MAP_W);
    expect(level.height).toBe(MAP_H);
    expect(level.tiles).toHaveLength(MAP_H);
    expect(level.tiles[0]).toHaveLength(MAP_W);
  });

  it('入口と階段は床(歩けるマス)の上にある', () => {
    const level = build(2, 1);
    expect(isFloor(level, level.entry.x, level.entry.y)).toBe(true);
    expect(level.tiles[level.stairs.y]![level.stairs.x]).toBe('stairs');
  });

  it('外周は必ず壁で、盤外へは出られない', () => {
    const level = build(3, 4);
    for (let x = 0; x < level.width; x++) {
      expect(level.tiles[0]![x]).toBe('wall');
      expect(level.tiles[level.height - 1]![x]).toBe('wall');
    }
    for (let y = 0; y < level.height; y++) {
      expect(level.tiles[y]![0]).toBe('wall');
      expect(level.tiles[y]![level.width - 1]).toBe('wall');
    }
  });

  it('全ての床マスが入口から到達できる(連結性)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const depth = (seed % 8) + 1;
      const level = build(seed * 131, depth);
      expect(reachableFloors(level)).toBe(totalFloors(level));
    }
  });

  it('深い階ほど部屋数が多くなる傾向がある', () => {
    const shallow = build(500, 1);
    const deep = build(500, 8);
    expect(deep.rooms.length).toBeGreaterThanOrEqual(shallow.rooms.length);
  });

  it('同じシードと階からは同一の盤面が再現される', () => {
    const a = build(777, 5);
    const b = build(777, 5);
    expect(b.tiles).toEqual(a.tiles);
    expect(b.entry).toEqual(a.entry);
    expect(b.stairs).toEqual(a.stairs);
  });
});
