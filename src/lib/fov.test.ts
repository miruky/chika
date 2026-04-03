import { describe, it, expect } from 'vitest';
import { computeFov } from './fov';

const open = () => false;

describe('computeFov', () => {
  it('原点は常に見える', () => {
    const vis = computeFov(5, 5, 4, open);
    expect(vis.has('5,5')).toBe(true);
  });

  it('開けた場所では半径内が見え、半径外は見えない', () => {
    const vis = computeFov(5, 5, 4, open);
    // ユークリッド距離4(=16)は半径4の内側、距離5(=25)は外側。
    expect(vis.has('5,9')).toBe(true);
    expect(vis.has('9,5')).toBe(true);
    expect(vis.has('5,10')).toBe(false);
    expect(vis.has('5,11')).toBe(false);
  });

  it('壁はその先のマスを遮る', () => {
    // (7,5)だけが壁。原点(5,5)から見て真後ろのマスは影に入る。
    const opaque = (x: number, y: number) => x === 7 && y === 5;
    const vis = computeFov(5, 5, 8, opaque);
    expect(vis.has('6,5')).toBe(true); // 壁の手前は見える
    expect(vis.has('7,5')).toBe(true); // 壁そのものは見える
    expect(vis.has('8,5')).toBe(false); // 壁の真後ろは見えない
    expect(vis.has('10,5')).toBe(false); // さらに奥も見えない
  });

  it('部屋の角の壁越しに反対側は見えない', () => {
    // 縦の壁(x=7)で左右を仕切る。原点は左側。
    const opaque = (x: number) => x === 7;
    const vis = computeFov(5, 5, 8, opaque);
    expect(vis.has('7,5')).toBe(true); // 壁は見える
    expect(vis.has('9,5')).toBe(false); // 壁の向こうは見えない
  });
});
