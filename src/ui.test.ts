// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { MAP_W, MAP_H } from './lib/game';

// main.ts は読み込み時に boot() が一度だけ走り、window にキー操作を結線する。
// テスト内で複数回起動するとリスナが多重化するため、ファイルで一度だけ起動する。
beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  location.hash = 'seed=uitest';
  await import('./main');
});

function press(key: string, code = ''): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
}

describe('UI のDOM結線', () => {
  it('盤面のセルをすべて生成し、プレイヤーの記号を描く', () => {
    const cells = document.querySelectorAll('#grid .cell');
    expect(cells).toHaveLength(MAP_W * MAP_H);
    const glyphs = Array.from(cells, (c) => c.textContent);
    expect(glyphs).toContain('@');
  });

  it('状態パネルにHPと階が表示される', () => {
    expect(document.querySelector('.vital-name')?.textContent).toBe('HP');
    expect(document.getElementById('hp-label')?.textContent).toMatch(/^\d+ \/ \d+$/);
    expect(document.getElementById('st-depth')?.textContent).toContain('地下');
  });

  it('移動・待機・拾うキーで例外を投げない', () => {
    expect(() => {
      press('ArrowRight');
      press('h');
      press('j');
      press('k');
      press('.');
      press('g');
    }).not.toThrow();
  });

  it('シード入力中はゲームのキー操作を奪わない', () => {
    const seed = document.getElementById('seed') as HTMLInputElement;
    seed.focus();
    const depthBefore = document.getElementById('st-depth')?.textContent;
    press('j');
    expect(document.getElementById('st-depth')?.textContent).toBe(depthBefore);
    seed.blur();
  });

  it('操作すると途中経過が保存される', () => {
    // jsdomのlocalStorageは無効なことがあるため、保存先を差し替えて配線だけ確かめる。
    const mem: Record<string, string> = {};
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => (k in mem ? mem[k] : null),
        setItem: (k: string, v: string) => {
          mem[k] = v;
        },
        removeItem: (k: string) => {
          delete mem[k];
        },
      },
    });
    press('.'); // その場で待機して1ターン進める
    expect(mem['chika-save']).toBeTruthy();
    const snap = JSON.parse(mem['chika-save']!);
    expect(snap.seedText).toBe('uitest');
    expect(snap.status).toBe('playing');
    expect(snap.v).toBe(1);
  });
});
