// 再帰的シャドウキャスティングによる視界計算。
// 8つの八分円を走査し、壁に遮られない範囲を可視マスとして集める。
// 光源(プレイヤー)の周囲を対称に照らし、壁の陰に入ったマスは見えなくなる。

export const FOV_RADIUS = 8;

// 八分円ごとの座標変換係数(xx, xy, yx, yy)。Björn Bergströmの実装に倣う。
const MULT = [
  [1, 0, 0, -1, -1, 0, 0, 1],
  [0, 1, -1, 0, 0, -1, 1, 0],
  [0, 1, 1, 0, 0, -1, -1, 0],
  [1, 0, 0, 1, -1, 0, 0, -1],
] as const;

export type Opaque = (x: number, y: number) => boolean;

function castLight(
  cx: number,
  cy: number,
  row: number,
  startSlope: number,
  endSlope: number,
  radius: number,
  xx: number,
  xy: number,
  yx: number,
  yy: number,
  opaque: Opaque,
  visible: Set<string>,
): void {
  if (startSlope < endSlope) return;
  const r2 = radius * radius;
  let start = startSlope;
  for (let j = row; j <= radius; j++) {
    let dx = -j - 1;
    const dy = -j;
    let blocked = false;
    let newStart = 0;
    while (dx <= 0) {
      dx += 1;
      const lSlope = (dx - 0.5) / (dy + 0.5);
      const rSlope = (dx + 0.5) / (dy - 0.5);
      if (start < rSlope) continue;
      if (endSlope > lSlope) break;

      const mx = cx + dx * xx + dy * xy;
      const my = cy + dx * yx + dy * yy;
      if (dx * dx + dy * dy <= r2) visible.add(`${mx},${my}`);

      if (blocked) {
        if (opaque(mx, my)) {
          newStart = rSlope;
          continue;
        }
        blocked = false;
        start = newStart;
      } else if (opaque(mx, my) && j < radius) {
        blocked = true;
        castLight(cx, cy, j + 1, start, lSlope, radius, xx, xy, yx, yy, opaque, visible);
        newStart = rSlope;
      }
    }
    if (blocked) break;
  }
}

/** (ox, oy)から半径radius内で見えるマスの集合("x,y"形式)を返す。原点は常に可視。 */
export function computeFov(ox: number, oy: number, radius: number, opaque: Opaque): Set<string> {
  const visible = new Set<string>();
  visible.add(`${ox},${oy}`);
  for (let oct = 0; oct < 8; oct++) {
    castLight(
      ox,
      oy,
      1,
      1.0,
      0.0,
      radius,
      MULT[0]![oct]!,
      MULT[1]![oct]!,
      MULT[2]![oct]!,
      MULT[3]![oct]!,
      opaque,
      visible,
    );
  }
  return visible;
}
