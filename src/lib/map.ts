import type { Level, Room, Tile, Vec } from './types';
import type { Rng } from './rng';

export const MAP_W = 54;
export const MAP_H = 30;

const ROOM_MIN = 4;
const ROOM_MAX = 11;
const ROOM_TRIES = 60;

function center(r: Room): Vec {
  return { x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) };
}

/** 1タイルのマージンを含めて2部屋が重なるか。通路で繋ぐ前提なので密着も避ける。 */
function overlaps(a: Room, b: Room): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

function carveRoom(tiles: Tile[][], r: Room): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      tiles[y]![x] = 'floor';
    }
  }
}

function carveH(tiles: Tile[][], x1: number, x2: number, y: number): void {
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) tiles[y]![x] = 'floor';
}

function carveV(tiles: Tile[][], y1: number, y2: number, x: number): void {
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) tiles[y]![x] = 'floor';
}

/**
 * 部屋を置けるだけ置き、各部屋を直前の部屋の中心とL字通路で繋ぐ。
 * 全部屋が鎖状に連結するため、生成されたフロアは必ず行き来できる。
 * 深い階ほど部屋数を増やし、迷宮らしく広げる。
 */
export function generateLevel(rng: Rng, depth: number): Level {
  const tiles: Tile[][] = Array.from({ length: MAP_H }, () =>
    Array.from({ length: MAP_W }, () => 'wall' as Tile),
  );
  const rooms: Room[] = [];
  const targetRooms = Math.min(8 + Math.floor(depth * 0.7), 16);

  for (let t = 0; t < ROOM_TRIES && rooms.length < targetRooms; t++) {
    const w = rng.int(ROOM_MIN, ROOM_MAX);
    const h = rng.int(ROOM_MIN, ROOM_MAX - 2);
    const x = rng.int(1, MAP_W - w - 2);
    const y = rng.int(1, MAP_H - h - 2);
    const room: Room = { x, y, w, h };
    if (rooms.some((other) => overlaps(room, other))) continue;

    carveRoom(tiles, room);
    if (rooms.length > 0) {
      const prev = center(rooms[rooms.length - 1]!);
      const cur = center(room);
      // 水平→垂直か垂直→水平かをランダムに選び、通路の形に変化をつける。
      if (rng.chance(0.5)) {
        carveH(tiles, prev.x, cur.x, prev.y);
        carveV(tiles, prev.y, cur.y, cur.x);
      } else {
        carveV(tiles, prev.y, cur.y, prev.x);
        carveH(tiles, prev.x, cur.x, cur.y);
      }
    }
    rooms.push(room);
  }

  const entry = center(rooms[0]!);
  const stairsRoom = center(rooms[rooms.length - 1]!);
  tiles[stairsRoom.y]![stairsRoom.x] = 'stairs';

  return { width: MAP_W, height: MAP_H, tiles, rooms, entry, stairs: stairsRoom };
}

export function isFloor(level: Level, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
  return level.tiles[y]![x] !== 'wall';
}

export function isWall(level: Level, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return true;
  return level.tiles[y]![x] === 'wall';
}
