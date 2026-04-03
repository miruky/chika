// ゲーム全体で共有する型。描画(DOM)からは独立させ、ロジックだけで完結させる。

/** 地形。wall=壁、floor=床、stairs=下り階段。 */
export type Tile = 'wall' | 'floor' | 'stairs';

export interface Vec {
  x: number;
  y: number;
}

/** 部屋を表す矩形(座標は内側の床範囲)。 */
export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 生成済みダンジョン1階分。 */
export interface Level {
  width: number;
  height: number;
  tiles: Tile[][];
  rooms: Room[];
  /** プレイヤーの入場位置(最初の部屋の中心)。 */
  entry: Vec;
  /** 下り階段の位置。最深階では使わない。 */
  stairs: Vec;
}

/** 戦闘能力を持つもの(プレイヤー・敵)。 */
export interface Entity {
  id: number;
  name: string;
  /** 画面に表示する1文字。絵文字は使わない。 */
  glyph: string;
  /** 配色を決めるCSSクラスの接尾辞(player / rat / orc ...)。 */
  tint: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  power: number;
  defense: number;
  /** 倒したとき得られる経験値(プレイヤーは0)。 */
  xpReward: number;
  isPlayer: boolean;
  /** プレイヤーを認識して追跡中か。視界に入ると起き、以後追い続ける。 */
  awake: boolean;
  /** 混乱の残りターン数。0より大きいと移動方向がランダムになる。 */
  confused: number;
}

/** 巻物・薬の効果。対象選択UIを避け、効果側で対象を決める。 */
export type Effect =
  | { kind: 'heal'; amount: number }
  | { kind: 'lightning'; damage: number; range: number }
  | { kind: 'fire'; damage: number; radius: number }
  | { kind: 'confuse'; turns: number; range: number }
  | { kind: 'blink' };

/** 持ち物・床落ちアイテムの定義。消耗品か装備品。 */
export type Item =
  | { id: number; name: string; glyph: string; kind: 'consumable'; effect: Effect }
  | { id: number; name: string; glyph: string; kind: 'weapon'; power: number }
  | { id: number; name: string; glyph: string; kind: 'armor'; defense: number }
  | { id: number; name: string; glyph: string; kind: 'amulet' };

/** 床に落ちているアイテム。 */
export interface GroundItem {
  item: Item;
  x: number;
  y: number;
}

/** 画面下部のログ1行。tintで色を変える。 */
export interface Message {
  text: string;
  tint: 'info' | 'good' | 'bad' | 'warn';
}

export type Status = 'playing' | 'dead' | 'won';

/** 移動・行動の入力。 */
export type Command =
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'wait' }
  | { kind: 'descend' }
  | { kind: 'pickup' }
  | { kind: 'use'; index: number }
  | { kind: 'drop'; index: number };
