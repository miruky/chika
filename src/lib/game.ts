import { makeRng, hashSeed, type Rng } from './rng';
import { generateLevel, isWall, MAP_H, MAP_W } from './map';
import { computeFov, FOV_RADIUS } from './fov';
import {
  AMULET,
  itemTable,
  makeItem,
  MAX_DEPTH,
  spawnTable,
  type ItemDef,
  type MonsterDef,
} from './data';
import type { Command, Entity, GroundItem, Item, Level, Message, Status } from './types';

const PLAYER_VISION = FOV_RADIUS;
const INVENTORY_CAP = 18;

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * 冒険の途中状態を保存するスナップショット。地形はシードと階から決まるので持たず、
 * 復元時に作り直す。プレイヤーの行動で変わる部分(敵・床落ち・持ち物・探索済み)だけを残す。
 */
export interface GameSnapshot {
  v: 1;
  seedText: string;
  depth: number;
  entities: Entity[];
  ground: GroundItem[];
  inventory: Item[];
  weapon: Item | null;
  armor: Item | null;
  playerLevel: number;
  xp: number;
  xpToNext: number;
  kills: number;
  explored: string[];
  messages: Message[];
  status: Status;
  turn: number;
  nextId: number;
}

/**
 * 1回の冒険の全状態を持つ。描画はこのオブジェクトを読むだけで、状態を進めるのは
 * perform() に限る。生成と抽選は階ごとに (シード, 階) から導く専用乱数で行うため、
 * 同じシードのダンジョンはプレイヤーの行動に関わらず常に同じ形になる。
 */
export class Game {
  readonly seed: number;
  readonly seedText: string;
  depth = 1;
  level!: Level;
  entities: Entity[] = [];
  ground: GroundItem[] = [];
  inventory: Item[] = [];
  weapon: Item | null = null;
  armor: Item | null = null;
  playerLevel = 1;
  xp = 0;
  xpToNext = 30;
  /** 倒した敵の数。冒険の戦績に使う。 */
  kills = 0;
  visible: Set<string> = new Set();
  explored: Set<string> = new Set();
  messages: Message[] = [];
  status: Status = 'playing';
  turn = 0;
  private nextId = 1;
  // 階生成とは別系統の乱数。瞬間移動先や混乱時の足取りなど実行中の揺らぎに使い、
  // 同じ操作列なら同じ結果になるよう時刻乱数は持ち込まない。
  private runtime: Rng;

  constructor(seedInput: string | number) {
    this.seedText = String(seedInput);
    if (typeof seedInput === 'number') {
      this.seed = seedInput >>> 0;
    } else {
      this.seed = /^\d+$/.test(seedInput) ? Number(seedInput) >>> 0 : hashSeed(seedInput);
    }
    this.runtime = makeRng((this.seed ^ 0x5bd1e995) >>> 0);
    const player: Entity = {
      id: this.nextId++,
      name: '探索者',
      glyph: '@',
      tint: 'player',
      x: 0,
      y: 0,
      hp: 30,
      maxHp: 30,
      power: 5,
      defense: 2,
      xpReward: 0,
      isPlayer: true,
      awake: true,
      confused: 0,
    };
    this.entities = [player];
    this.inventory = [
      makeItem(
        {
          name: '回復の薬',
          glyph: '!',
          kind: 'consumable',
          effect: { kind: 'heal', amount: 16 },
          minDepth: 1,
          weight: 0,
        },
        this.nextId++,
      ),
      makeItem(
        {
          name: '回復の薬',
          glyph: '!',
          kind: 'consumable',
          effect: { kind: 'heal', amount: 16 },
          minDepth: 1,
          weight: 0,
        },
        this.nextId++,
      ),
    ];
    this.buildLevel(1);
    this.log(`地下1階。${this.seedText} の迷宮へ降り立った。`, 'info');
  }

  get player(): Entity {
    return this.entities[0]!;
  }

  // --- セーブと復元 ---------------------------------------------------------

  /** 途中経過を保存用のスナップショットにする。地形は持たず、復元時にシードから作り直す。 */
  serialize(): GameSnapshot {
    return {
      v: 1,
      seedText: this.seedText,
      depth: this.depth,
      entities: this.entities.map((e) => ({ ...e })),
      ground: this.ground.map((g) => ({ x: g.x, y: g.y, item: { ...g.item } })),
      inventory: this.inventory.map((it) => ({ ...it })),
      weapon: this.weapon ? { ...this.weapon } : null,
      armor: this.armor ? { ...this.armor } : null,
      playerLevel: this.playerLevel,
      xp: this.xp,
      xpToNext: this.xpToNext,
      kills: this.kills,
      explored: [...this.explored],
      messages: this.messages.slice(),
      status: this.status,
      turn: this.turn,
      nextId: this.nextId,
    };
  }

  /**
   * スナップショットから冒険を復元する。地形はシードと階から作り直し、敵・床落ち・
   * 持ち物・探索済みは保存値で上書きする。実行中の揺らぎ用乱数はシードから取り直すため、
   * 瞬間移動先などの出目の連続性は持ち越さないが、地形と敵配置はシードで決まるので
   * 再開後の手応えは変わらない。
   */
  static restore(snap: GameSnapshot): Game {
    const game = new Game(snap.seedText);
    game.restoreLevel(snap.depth);
    game.entities = snap.entities.map((e) => ({ ...e }));
    game.ground = snap.ground.map((g) => ({ x: g.x, y: g.y, item: { ...g.item } }));
    game.inventory = snap.inventory.map((it) => ({ ...it }));
    game.weapon = snap.weapon ? { ...snap.weapon } : null;
    game.armor = snap.armor ? { ...snap.armor } : null;
    game.playerLevel = snap.playerLevel;
    game.xp = snap.xp;
    game.xpToNext = snap.xpToNext;
    game.kills = snap.kills ?? 0;
    game.explored = new Set(snap.explored);
    game.messages = snap.messages.slice();
    game.status = snap.status;
    game.turn = snap.turn;
    game.nextId = snap.nextId;
    game.refreshFov();
    return game;
  }

  private restoreLevel(depth: number): void {
    this.level = this.makeGeometry(this.levelRng(depth), depth);
    this.depth = depth;
  }

  combatPower(e: Entity): number {
    return e.power + (e.isPlayer && this.weapon?.kind === 'weapon' ? this.weapon.power : 0);
  }

  combatDefense(e: Entity): number {
    return e.defense + (e.isPlayer && this.armor?.kind === 'armor' ? this.armor.defense : 0);
  }

  // --- 階の構築 -------------------------------------------------------------

  private levelRng(depth: number): Rng {
    return makeRng((this.seed ^ Math.imul(depth, 0x9e3779b1)) >>> 0);
  }

  /**
   * 地形だけを生成する。最深階は階段マスを床に変え、護符を置く場所にする。これは
   * levelRng の最初の消費なので、同じ (シード, 階) からは常に同じ地形が決まり、
   * セーブの復元では敵やアイテムを撒き直さずに地形だけを作り直せる。
   */
  private makeGeometry(rng: Rng, depth: number): Level {
    const level = generateLevel(rng, depth);
    if (depth === MAX_DEPTH) level.tiles[level.stairs.y]![level.stairs.x] = 'floor';
    return level;
  }

  private buildLevel(depth: number): void {
    const rng = this.levelRng(depth);
    const level = this.makeGeometry(rng, depth);
    this.depth = depth;
    this.level = level;

    const player = this.player;
    player.x = level.entry.x;
    player.y = level.entry.y;
    this.entities = [player];
    this.ground = [];

    if (depth === MAX_DEPTH) {
      // 最深階には階段の代わりに護符を置く。
      this.ground.push({
        item: { ...AMULET, id: this.nextId++ },
        x: level.stairs.x,
        y: level.stairs.y,
      });
    }

    this.spawnMonsters(rng, depth);
    this.spawnItems(rng, depth);

    this.visible = new Set();
    this.explored = new Set();
    this.refreshFov();
  }

  private occupied(x: number, y: number): boolean {
    return this.entities.some((e) => e.x === x && e.y === y);
  }

  private freeFloorIn(rng: Rng, roomIndex: number): { x: number; y: number } | null {
    const room = this.level.rooms[roomIndex];
    if (!room) return null;
    for (let t = 0; t < 30; t++) {
      const x = rng.int(room.x, room.x + room.w - 1);
      const y = rng.int(room.y, room.y + room.h - 1);
      if (this.level.tiles[y]![x] !== 'floor') continue;
      if (this.occupied(x, y)) continue;
      if (this.ground.some((g) => g.x === x && g.y === y)) continue;
      return { x, y };
    }
    return null;
  }

  private spawnMonsters(rng: Rng, depth: number): void {
    const table = spawnTable(depth);
    const count = Math.min(4 + depth + rng.int(0, 2), 22);
    for (let i = 0; i < count; i++) {
      const roomIndex = rng.int(1, Math.max(1, this.level.rooms.length - 1));
      const spot = this.freeFloorIn(rng, roomIndex);
      if (!spot) continue;
      const def = rng.pick(table) as MonsterDef;
      this.entities.push({
        id: this.nextId++,
        name: def.name,
        glyph: def.glyph,
        tint: def.tint,
        x: spot.x,
        y: spot.y,
        hp: def.hp,
        maxHp: def.hp,
        power: def.power,
        defense: def.defense,
        xpReward: def.xpReward,
        isPlayer: false,
        awake: false,
        confused: 0,
      });
    }
  }

  private spawnItems(rng: Rng, depth: number): void {
    const table = itemTable(depth);
    if (table.length === 0) return;
    const count = 2 + Math.floor(depth / 3) + rng.int(0, 2);
    for (let i = 0; i < count; i++) {
      const roomIndex = rng.int(1, Math.max(1, this.level.rooms.length - 1));
      const spot = this.freeFloorIn(rng, roomIndex);
      if (!spot) continue;
      const def = rng.pick(table) as ItemDef;
      this.ground.push({ item: makeItem(def, this.nextId++), x: spot.x, y: spot.y });
    }
  }

  // --- 視界 -----------------------------------------------------------------

  private refreshFov(): void {
    const p = this.player;
    this.visible = computeFov(p.x, p.y, PLAYER_VISION, (x, y) => isWall(this.level, x, y));
    for (const k of this.visible) this.explored.add(k);
    // 視界に入った敵は目を覚まし、以後プレイヤーを追い続ける。
    for (const e of this.entities) {
      if (!e.isPlayer && this.visible.has(key(e.x, e.y))) e.awake = true;
    }
  }

  // --- 入力の処理 -----------------------------------------------------------

  /** プレイヤーの1手を適用し、ターンを消費したなら敵を行動させる。 */
  perform(cmd: Command): void {
    if (this.status !== 'playing') return;
    let acted = false;
    switch (cmd.kind) {
      case 'move':
        acted = this.movePlayer(cmd.dx, cmd.dy);
        break;
      case 'wait':
        acted = true;
        break;
      case 'descend':
        acted = this.descend();
        break;
      case 'pickup':
        acted = this.pickup();
        break;
      case 'use':
        acted = this.useItem(cmd.index);
        break;
      case 'drop':
        acted = this.dropItem(cmd.index);
        break;
    }
    if (!acted || this.status !== 'playing') return;
    this.refreshFov();
    this.enemyTurn();
    this.refreshFov();
    this.turn++;
  }

  private canStep(fromX: number, fromY: number, toX: number, toY: number): boolean {
    if (isWall(this.level, toX, toY)) return false;
    if (this.occupied(toX, toY)) return false;
    // 斜め移動で壁の角をすり抜けないよう、両隣が壁なら不可とする。
    if (fromX !== toX && fromY !== toY) {
      if (isWall(this.level, toX, fromY) && isWall(this.level, fromX, toY)) return false;
    }
    return true;
  }

  private movePlayer(dx: number, dy: number): boolean {
    const p = this.player;
    const tx = p.x + dx;
    const ty = p.y + dy;
    const target = this.entities.find((e) => !e.isPlayer && e.x === tx && e.y === ty);
    if (target) {
      this.attack(p, target);
      return true;
    }
    if (this.canStep(p.x, p.y, tx, ty)) {
      p.x = tx;
      p.y = ty;
      this.announceGround();
      return true;
    }
    return false;
  }

  private announceGround(): void {
    const here = this.ground.find((g) => g.x === this.player.x && g.y === this.player.y);
    if (here) this.log(`足元に ${here.item.name} がある。`, 'info');
    if (this.level.tiles[this.player.y]![this.player.x] === 'stairs') {
      this.log('下りの階段がある。', 'info');
    }
  }

  private attack(attacker: Entity, defender: Entity): void {
    const dmg = Math.max(0, this.combatPower(attacker) - this.combatDefense(defender));
    if (dmg <= 0) {
      this.log(
        attacker.isPlayer
          ? `${defender.name}に攻撃は通らなかった。`
          : `${attacker.name}の攻撃をはじいた。`,
        'info',
      );
      return;
    }
    defender.hp -= dmg;
    if (attacker.isPlayer) {
      this.log(`${defender.name}に${dmg}のダメージ。`, 'good');
    } else {
      this.log(`${attacker.name}に${dmg}のダメージを受けた。`, 'bad');
    }
    if (defender.hp <= 0) this.die(defender, attacker);
  }

  private die(victim: Entity, killer: Entity): void {
    if (victim.isPlayer) {
      this.status = 'dead';
      this.log(`${killer.name}に倒された。地下${this.depth}階で力尽きた。`, 'bad');
      return;
    }
    this.entities = this.entities.filter((e) => e.id !== victim.id);
    this.kills++;
    this.log(`${victim.name}を倒した。`, 'good');
    this.gainXp(victim.xpReward);
  }

  private gainXp(amount: number): void {
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.playerLevel++;
      const p = this.player;
      p.maxHp += 12;
      p.hp = p.maxHp;
      p.power += 1;
      if (this.playerLevel % 2 === 0) p.defense += 1;
      this.xpToNext = Math.floor(this.xpToNext * 1.5);
      this.log(`レベル${this.playerLevel}に上がった。気力が満ちる。`, 'good');
    }
  }

  // --- アイテム -------------------------------------------------------------

  private pickup(): boolean {
    const idx = this.ground.findIndex((g) => g.x === this.player.x && g.y === this.player.y);
    if (idx < 0) {
      this.log('足元に拾えるものはない。', 'info');
      return false;
    }
    const picked = this.ground[idx]!;
    if (picked.item.kind === 'amulet') {
      this.ground.splice(idx, 1);
      this.status = 'won';
      this.log(`${picked.item.name}を手にした。地下の謎は解かれた。`, 'good');
      return true;
    }
    if (this.inventory.length >= INVENTORY_CAP) {
      this.log('持ち物がいっぱいで拾えない。', 'warn');
      return false;
    }
    this.ground.splice(idx, 1);
    this.inventory.push(picked.item);
    this.log(`${picked.item.name}を拾った。`, 'info');
    return true;
  }

  private dropItem(index: number): boolean {
    const item = this.inventory[index];
    if (!item) return false;
    if (this.ground.some((g) => g.x === this.player.x && g.y === this.player.y)) {
      this.log('このマスには既に物が置かれている。', 'warn');
      return false;
    }
    this.inventory.splice(index, 1);
    this.ground.push({ item, x: this.player.x, y: this.player.y });
    this.log(`${item.name}を置いた。`, 'info');
    return true;
  }

  private useItem(index: number): boolean {
    const item = this.inventory[index];
    if (!item) return false;
    if (item.kind === 'weapon') return this.equipWeapon(index, item);
    if (item.kind === 'armor') return this.equipArmor(index, item);
    if (item.kind === 'consumable') return this.quaffOrRead(index, item);
    return false;
  }

  private equipWeapon(index: number, item: Item & { kind: 'weapon' }): boolean {
    this.inventory.splice(index, 1);
    if (this.weapon) this.inventory.push(this.weapon);
    this.weapon = item;
    this.log(`${item.name}を装備した。攻撃が鋭くなる。`, 'good');
    return true;
  }

  private equipArmor(index: number, item: Item & { kind: 'armor' }): boolean {
    this.inventory.splice(index, 1);
    if (this.armor) this.inventory.push(this.armor);
    this.armor = item;
    this.log(`${item.name}を身につけた。守りが固くなる。`, 'good');
    return true;
  }

  private quaffOrRead(index: number, item: Item & { kind: 'consumable' }): boolean {
    const effect = item.effect;
    let consumed = false;
    switch (effect.kind) {
      case 'heal': {
        const p = this.player;
        if (p.hp >= p.maxHp) {
          this.log('傷はない。薬を残しておく。', 'info');
          break;
        }
        const before = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + effect.amount);
        this.log(`${item.name}を飲んだ。${p.hp - before}回復した。`, 'good');
        consumed = true;
        break;
      }
      case 'lightning': {
        const target = this.nearestVisibleEnemy(effect.range);
        if (!target) {
          this.log('放電する相手が見当たらない。', 'info');
          break;
        }
        target.hp -= effect.damage;
        this.log(`${item.name}。稲妻が${target.name}を貫き${effect.damage}ダメージ。`, 'good');
        if (target.hp <= 0) this.die(target, this.player);
        consumed = true;
        break;
      }
      case 'fire': {
        const hits = this.entities.filter(
          (e) =>
            !e.isPlayer &&
            this.visible.has(key(e.x, e.y)) &&
            chebyshev(e.x, e.y, this.player.x, this.player.y) <= effect.radius,
        );
        if (hits.length === 0) {
          this.log('炎を浴びせる相手がいない。', 'info');
          break;
        }
        this.log(`${item.name}。炎が${hits.length}体を包む。`, 'good');
        for (const e of hits) {
          e.hp -= effect.damage;
          if (e.hp <= 0) this.die(e, this.player);
        }
        consumed = true;
        break;
      }
      case 'confuse': {
        const target = this.nearestVisibleEnemy(effect.range);
        if (!target) {
          this.log('惑わす相手が見当たらない。', 'info');
          break;
        }
        target.confused = effect.turns;
        this.log(`${target.name}は混乱し、足元がおぼつかなくなった。`, 'good');
        consumed = true;
        break;
      }
      case 'blink': {
        const spot = this.randomFloor();
        if (spot) {
          this.player.x = spot.x;
          this.player.y = spot.y;
        }
        this.log(`${item.name}。景色が歪み、別の場所へ移った。`, 'good');
        consumed = true;
        break;
      }
    }
    if (consumed) this.inventory.splice(index, 1);
    return consumed;
  }

  private nearestVisibleEnemy(range: number): Entity | null {
    let best: Entity | null = null;
    let bestDist = Infinity;
    for (const e of this.entities) {
      if (e.isPlayer) continue;
      if (!this.visible.has(key(e.x, e.y))) continue;
      const d = chebyshev(e.x, e.y, this.player.x, this.player.y);
      if (d <= range && d < bestDist) {
        best = e;
        bestDist = d;
      }
    }
    return best;
  }

  private randomFloor(): { x: number; y: number } | null {
    for (let t = 0; t < 200; t++) {
      const x = this.runtime.int(1, MAP_W - 2);
      const y = this.runtime.int(1, MAP_H - 2);
      if (this.level.tiles[y]![x] === 'wall') continue;
      if (this.occupied(x, y)) continue;
      return { x, y };
    }
    return null;
  }

  private descend(): boolean {
    if (this.level.tiles[this.player.y]![this.player.x] !== 'stairs') {
      this.log('ここに階段はない。', 'info');
      return false;
    }
    this.buildLevel(this.depth + 1);
    this.log(`地下${this.depth}階へ降りた。空気が重くなる。`, 'info');
    if (this.depth === MAX_DEPTH) this.log('最深部。護符の気配がする。', 'warn');
    return true;
  }

  // --- 敵の行動 -------------------------------------------------------------

  /** プレイヤー位置からの距離場(4近傍BFS)。追跡の勾配として使う。 */
  private distanceField(): number[][] {
    const dist: number[][] = Array.from({ length: this.level.height }, () =>
      Array.from({ length: this.level.width }, () => Infinity),
    );
    const queue: Array<[number, number]> = [[this.player.x, this.player.y]];
    dist[this.player.y]![this.player.x] = 0;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    while (queue.length > 0) {
      const [x, y] = queue.shift()!;
      const d = dist[y]![x]!;
      for (const [dx, dy] of dirs) {
        const nx = x + dx!;
        const ny = y + dy!;
        if (isWall(this.level, nx, ny)) continue;
        if (dist[ny]![nx]! <= d + 1) continue;
        dist[ny]![nx] = d + 1;
        queue.push([nx, ny]);
      }
    }
    return dist;
  }

  private enemyTurn(): void {
    const dist = this.distanceField();
    // entitiesはdie()で再代入されるため、ターン開始時点の敵集合を固定して走査する。
    const actors = this.entities.filter((e) => !e.isPlayer);
    for (const e of actors) {
      if (e.hp <= 0) continue;
      if (!e.awake) continue;
      if (chebyshev(e.x, e.y, this.player.x, this.player.y) === 1) {
        this.attack(e, this.player);
        if (this.status !== 'playing') return;
        continue;
      }
      if (e.confused > 0) {
        e.confused--;
        this.stepConfused(e);
        continue;
      }
      this.stepToward(e, dist);
    }
  }

  private stepConfused(e: Entity): void {
    const dirs = this.shuffleDirs();
    for (const [dx, dy] of dirs) {
      if (this.canStep(e.x, e.y, e.x + dx, e.y + dy)) {
        e.x += dx;
        e.y += dy;
        return;
      }
    }
  }

  private stepToward(e: Entity, dist: number[][]): void {
    let bestDx = 0;
    let bestDy = 0;
    let best = dist[e.y]![e.x]!;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = e.x + dx;
        const ny = e.y + dy;
        if (!this.canStep(e.x, e.y, nx, ny)) continue;
        const d = dist[ny]![nx]!;
        if (d < best) {
          best = d;
          bestDx = dx;
          bestDy = dy;
        }
      }
    }
    if (bestDx !== 0 || bestDy !== 0) {
      e.x += bestDx;
      e.y += bestDy;
    }
  }

  private shuffleDirs(): Array<[number, number]> {
    return this.runtime.shuffle<[number, number]>([
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]);
  }

  // --- ログ -----------------------------------------------------------------

  private log(text: string, tint: Message['tint']): void {
    this.messages.push({ text, tint });
    if (this.messages.length > 60) this.messages.shift();
  }
}

export { MAX_DEPTH, MAP_W, MAP_H };
