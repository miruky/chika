import './style.css';
import { Game, MAP_W, MAP_H, MAX_DEPTH, type GameSnapshot } from './lib/game';
import type { Command, Entity, GroundItem, Item } from './lib/types';

const SAVE_KEY = 'chika-save';

const TILE_GLYPH = { wall: '#', floor: '·', stairs: '>' } as const;

// localStorageはプライベートモードや無効化時に参照・書き込みで例外を投げる。
// 設定は保存できなくても遊べるべきなので、失敗しても黙って続ける薄いラッパで包む。
const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* 保存不可なら諦める */
    }
  },
  remove(k: string): void {
    try {
      localStorage.removeItem(k);
    } catch {
      /* 削除不可なら諦める */
    }
  },
};

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function itemTint(item: Item): string {
  switch (item.kind) {
    case 'weapon':
      return 'weapon';
    case 'armor':
      return 'armor';
    case 'amulet':
      return 'amulet';
    case 'consumable':
      return item.glyph === '!' ? 'pot' : 'scroll';
  }
}

const LOGO = `
<svg class="logo" viewBox="0 0 64 64" role="img" aria-labelledby="logo-title">
  <title id="logo-title">chika</title>
  <rect x="6" y="6" width="52" height="52" rx="11" fill="none" stroke="currentColor" stroke-width="3"/>
  <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 22h10v8"/>
    <path d="M26 30h10v8"/>
    <path d="M36 38h10v8"/>
  </g>
  <path d="M41 17h7v7" fill="none" stroke="var(--c-amulet, #ffd24a)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const SHELL = `
<header class="site-header">
  <div class="brand">
    ${LOGO}
    <div>
      <h1>chika</h1>
      <div class="tagline">地下へ潜るターミナル・ローグライク</div>
    </div>
  </div>
  <div class="header-tools">
    <span class="seed-field">
      <label for="seed">シード</label>
      <input id="seed" type="text" autocomplete="off" spellcheck="false" />
    </span>
    <button id="restart" type="button">この種でやり直す</button>
    <button id="newgame" type="button" class="primary">新しい冒険</button>
    <button id="theme" type="button" aria-label="テーマ切替">テーマ: 自動</button>
    <button id="scan" type="button" aria-pressed="true">走査線</button>
    <button id="help-open" type="button" aria-haspopup="dialog">操作</button>
  </div>
</header>

<main class="layout">
  <section class="pane screen-pane" aria-label="ダンジョン画面">
    <div class="screen scanlines">
      <div class="grid" id="grid" aria-hidden="true"></div>
    </div>
    <div class="banner" id="banner" role="status"></div>
    <div class="touchpad" aria-label="操作パッド">
      <div class="dpad">
        <button data-dx="-1" data-dy="-1" aria-label="左上へ">\\</button>
        <button data-dx="0" data-dy="-1" aria-label="上へ">^</button>
        <button data-dx="1" data-dy="-1" aria-label="右上へ">/</button>
        <button data-dx="-1" data-dy="0" aria-label="左へ">&lt;</button>
        <button data-wait="1" aria-label="待機">.</button>
        <button data-dx="1" data-dy="0" aria-label="右へ">&gt;</button>
        <button data-dx="-1" data-dy="1" aria-label="左下へ">/</button>
        <button data-dx="0" data-dy="1" aria-label="下へ">v</button>
        <button data-dx="1" data-dy="1" aria-label="右下へ">\\</button>
      </div>
      <div class="actions-pad">
        <button data-act="pickup" type="button">拾う</button>
        <button data-act="descend" type="button">降りる</button>
      </div>
    </div>
  </section>

  <aside class="pane hud">
    <section>
      <h2>状態</h2>
      <div class="vitals">
        <div class="vital">
          <div class="vital-head"><span class="vital-name">HP</span><span class="vital-num" id="hp-label"></span></div>
          <div class="bar hp"><span class="fill" id="hp-fill"></span></div>
        </div>
        <div class="vital">
          <div class="vital-head"><span class="vital-name">経験値</span><span class="vital-num" id="xp-label"></span></div>
          <div class="bar xp"><span class="fill" id="xp-fill"></span></div>
        </div>
      </div>
      <div class="stat-grid" style="margin-top:12px">
        <span class="k">階</span><span class="v" id="st-depth"></span>
        <span class="k">レベル</span><span class="v" id="st-level"></span>
        <span class="k">攻撃</span><span class="v" id="st-atk"></span>
        <span class="k">防御</span><span class="v" id="st-def"></span>
      </div>
      <div class="equip" style="margin-top:12px">
        <span>武器 <b id="eq-weapon"></b></span>
        <span>防具 <b id="eq-armor"></b></span>
      </div>
    </section>

    <section>
      <h2>持ち物</h2>
      <ul class="inv" id="inv"></ul>
    </section>

    <section>
      <h2>ログ</h2>
      <div class="log" id="log" aria-hidden="true"></div>
      <div id="announcer" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"></div>
    </section>
  </aside>
</main>

<footer class="site-footer">
  矢印 / hjkl で移動、yubn で斜め、g 拾う、&gt; 降りる、数字で道具。
  <a href="https://github.com/miruky/chika">ソース</a>
</footer>

<dialog class="help" id="help">
  <h2>操作方法</h2>
  <dl>
    <dt>矢印 / h j k l</dt><dd>上下左右へ移動。敵に向かって進むと攻撃する。</dd>
    <dt>y u b n</dt><dd>斜め移動。テンキーの 1-9 でも動ける。</dd>
    <dt>. または 5</dt><dd>その場で待機して1ターン進める。</dd>
    <dt>g または ,</dt><dd>足元のアイテムを拾う。</dd>
    <dt>&gt;</dt><dd>階段の上で押すと下の階へ降りる。</dd>
    <dt>1 - 9</dt><dd>持ち物のその番号を使う・装備する。</dd>
    <dt>?</dt><dd>このヘルプを開閉する。</dd>
  </dl>
  <p style="margin-top:14px;color:var(--muted);font-size:13px">
    地下${MAX_DEPTH}階に眠る護符を持ち帰れば勝ち。倒れたら一度きりの冒険は終わる。
  </p>
  <div class="close-row"><button id="help-close" type="button" class="primary">閉じる</button></div>
</dialog>`;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`要素が見つからない: ${id}`);
  return node as T;
}

class UI {
  private game: Game;
  private cells: HTMLSpanElement[] = [];
  private lastMessages = 0;

  private grid = el<HTMLDivElement>('grid');
  private hpFill = el<HTMLSpanElement>('hp-fill');
  private hpLabel = el<HTMLSpanElement>('hp-label');
  private hpBar = this.hpFill.parentElement as HTMLElement;
  private xpFill = el<HTMLSpanElement>('xp-fill');
  private xpLabel = el<HTMLSpanElement>('xp-label');
  private stDepth = el<HTMLSpanElement>('st-depth');
  private stLevel = el<HTMLSpanElement>('st-level');
  private stAtk = el<HTMLSpanElement>('st-atk');
  private stDef = el<HTMLSpanElement>('st-def');
  private eqWeapon = el<HTMLElement>('eq-weapon');
  private eqArmor = el<HTMLElement>('eq-armor');
  private inv = el<HTMLUListElement>('inv');
  private logBox = el<HTMLDivElement>('log');
  private announcer = el<HTMLDivElement>('announcer');
  private banner = el<HTMLDivElement>('banner');
  private screen = this.grid.parentElement as HTMLElement;
  private seedInput = el<HTMLInputElement>('seed');

  constructor(game: Game) {
    this.game = game;
    this.buildGrid();
    this.seedInput.value = this.game.seedText;
    this.bind();
    this.render(new Set(), false);
  }

  private buildGrid(): void {
    this.grid.style.setProperty('--cols', String(MAP_W));
    const frag = document.createDocumentFragment();
    this.cells = [];
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      const span = document.createElement('span');
      span.className = 'cell';
      this.cells.push(span);
      frag.appendChild(span);
    }
    this.grid.replaceChildren(frag);
  }

  private entityAt(x: number, y: number): Entity | undefined {
    return this.game.entities.find((e) => e.x === x && e.y === y);
  }

  private groundAt(x: number, y: number): GroundItem | undefined {
    return this.game.ground.find((g) => g.x === x && g.y === y);
  }

  private render(flash: Set<string>, hurt: boolean): void {
    const g = this.game;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const cell = this.cells[y * MAP_W + x]!;
        const k = key(x, y);
        if (!g.explored.has(k)) {
          cell.className = 'cell';
          cell.textContent = ' ';
          continue;
        }
        const tile = g.level.tiles[y]![x]!;
        const tg = TILE_GLYPH[tile];
        if (g.visible.has(k)) {
          const ent = this.entityAt(x, y);
          const gi = this.groundAt(x, y);
          if (ent) {
            cell.className = `cell e-${ent.tint}`;
            cell.textContent = ent.glyph;
          } else if (gi) {
            cell.className = `cell i-${itemTint(gi.item)}`;
            cell.textContent = gi.item.glyph;
          } else {
            cell.className = `cell t-${tile}`;
            cell.textContent = tg;
          }
        } else {
          cell.className = `cell mem t-${tile}`;
          cell.textContent = tg;
        }
      }
    }
    for (const k of flash) {
      const [fx, fy] = k.split(',').map(Number) as [number, number];
      const cell = this.cells[fy * MAP_W + fx];
      if (cell) {
        void cell.offsetWidth;
        cell.classList.add('hit');
      }
    }
    if (hurt) {
      this.screen.classList.remove('hurt');
      void this.screen.offsetWidth;
      this.screen.classList.add('hurt');
    }

    this.renderVitals();
    this.renderInventory();
    this.renderLog();
    this.renderBanner();
    this.persist();
  }

  // 状態が変わるたびに途中経過を保存する。冒険が終わったらセーブを消し、
  // 次回はその場で終局を再生せず新しい迷宮から始められるようにする。
  private persist(): void {
    if (this.game.status === 'playing') {
      store.set(SAVE_KEY, JSON.stringify(this.game.serialize()));
    } else {
      store.remove(SAVE_KEY);
    }
  }

  private renderVitals(): void {
    const g = this.game;
    const p = g.player;
    const hpPct = Math.max(0, Math.round((p.hp / p.maxHp) * 100));
    this.hpFill.style.width = `${hpPct}%`;
    this.hpBar.classList.toggle('low', p.hp / p.maxHp < 0.3);
    this.hpLabel.textContent = `${Math.max(0, p.hp)} / ${p.maxHp}`;
    this.xpFill.style.width = `${Math.round((g.xp / g.xpToNext) * 100)}%`;
    this.xpLabel.textContent = `あと ${Math.max(0, g.xpToNext - g.xp)}`;
    this.stDepth.textContent = `地下 ${g.depth} 階`;
    this.stLevel.textContent = String(g.playerLevel);
    this.stAtk.textContent = String(g.combatPower(p));
    this.stDef.textContent = String(g.combatDefense(p));
    this.eqWeapon.textContent = g.weapon ? g.weapon.name : 'なし';
    this.eqArmor.textContent = g.armor ? g.armor.name : 'なし';
  }

  private renderInventory(): void {
    const g = this.game;
    this.inv.replaceChildren();
    if (g.inventory.length === 0) {
      const li = document.createElement('li');
      li.className = 'inv-empty';
      li.textContent = '何も持っていない';
      this.inv.appendChild(li);
      return;
    }
    g.inventory.forEach((item, i) => {
      const li = document.createElement('li');
      const use = document.createElement('button');
      use.className = 'use';
      use.dataset.use = String(i);
      const verb = item.kind === 'weapon' || item.kind === 'armor' ? '装備' : '使う';
      use.innerHTML = `<span class="slot">${i + 1}</span><span class="glyph i-${itemTint(item)}">${item.glyph}</span><span>${item.name}</span>`;
      use.title = `${item.name}を${verb}`;
      const drop = document.createElement('button');
      drop.className = 'drop';
      drop.dataset.drop = String(i);
      drop.textContent = '置く';
      drop.title = `${item.name}を足元に置く`;
      li.append(use, drop);
      this.inv.appendChild(li);
    });
  }

  private renderLog(): void {
    const g = this.game;
    const recent = g.messages.slice(-14);
    this.logBox.replaceChildren();
    for (const m of recent) {
      const line = document.createElement('div');
      line.className = `line tint-${m.tint}`;
      line.textContent = m.text;
      this.logBox.appendChild(line);
    }
    this.logBox.scrollTop = this.logBox.scrollHeight;
    if (g.messages.length > this.lastMessages) {
      const fresh = g.messages.slice(this.lastMessages).map((m) => m.text);
      this.announcer.textContent = fresh.join(' ');
    }
    this.lastMessages = g.messages.length;
  }

  private renderBanner(): void {
    const g = this.game;
    if (g.status === 'playing') {
      this.banner.className = 'banner';
      this.banner.replaceChildren();
      return;
    }
    this.banner.className = `banner show ${g.status}`;
    const text =
      g.status === 'won'
        ? `<b>生還した。</b> 地下の護符を持ち帰り、${g.turn}ターンの冒険を終えた。`
        : `<b>倒れた。</b> 地下${g.depth}階、${g.turn}ターンで力尽きた。`;
    this.banner.innerHTML = `${text} <button id="banner-retry" type="button" class="primary" style="margin-left:8px">もう一度挑む</button>`;
    el<HTMLButtonElement>('banner-retry').addEventListener('click', () => {
      this.reset(this.game.seedText);
    });
  }

  // --- 入力 -----------------------------------------------------------------

  private turn(cmd: Command): void {
    if (this.game.status !== 'playing') return;
    const before = new Map(this.game.entities.map((e) => [e.id, { hp: e.hp, x: e.x, y: e.y }]));
    const playerHp = this.game.player.hp;
    this.game.perform(cmd);
    const flash = new Set<string>();
    for (const [id, snap] of before) {
      const cur = this.game.entities.find((e) => e.id === id);
      if (!cur) flash.add(key(snap.x, snap.y));
      else if (cur.hp < snap.hp) flash.add(key(cur.x, cur.y));
    }
    this.render(flash, this.game.player.hp < playerHp);
  }

  private reset(seed: string): void {
    this.game = new Game(seed);
    this.lastMessages = 0;
    this.seedInput.value = this.game.seedText;
    location.hash = `seed=${encodeURIComponent(this.game.seedText)}`;
    this.render(new Set(), false);
  }

  private bind(): void {
    const help = el<HTMLDialogElement>('help');
    el<HTMLButtonElement>('help-open').addEventListener('click', () => help.showModal());
    el<HTMLButtonElement>('help-close').addEventListener('click', () => help.close());

    el<HTMLButtonElement>('newgame').addEventListener('click', () => {
      this.reset(String(Math.floor(Math.random() * 900000) + 100000));
    });
    el<HTMLButtonElement>('restart').addEventListener('click', () => {
      const v = this.seedInput.value.trim();
      if (v) this.reset(v);
    });
    this.seedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = this.seedInput.value.trim();
        if (v) this.reset(v);
        this.seedInput.blur();
      }
    });

    el<HTMLButtonElement>('theme').addEventListener('click', () => this.cycleTheme());
    el<HTMLButtonElement>('scan').addEventListener('click', () => this.toggleScanlines());

    this.inv.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.dataset.use !== undefined) this.turn({ kind: 'use', index: Number(t.dataset.use) });
      else if (t.dataset.drop !== undefined)
        this.turn({ kind: 'drop', index: Number(t.dataset.drop) });
    });

    document.querySelector('.touchpad')?.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button');
      if (!t) return;
      if (t.dataset.wait !== undefined) this.turn({ kind: 'wait' });
      else if (t.dataset.act === 'pickup') this.turn({ kind: 'pickup' });
      else if (t.dataset.act === 'descend') this.turn({ kind: 'descend' });
      else if (t.dataset.dx !== undefined)
        this.turn({ kind: 'move', dx: Number(t.dataset.dx), dy: Number(t.dataset.dy) });
    });

    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  private onKey(e: KeyboardEvent): void {
    if (document.activeElement === this.seedInput) return;
    const help = el<HTMLDialogElement>('help');
    if (e.key === '?') {
      e.preventDefault();
      if (help.open) help.close();
      else help.showModal();
      return;
    }
    if (help.open) return;

    const cmd = keyToCommand(e);
    if (cmd) {
      e.preventDefault();
      this.turn(cmd);
    }
  }

  private cycleTheme(): void {
    const order = ['auto', 'light', 'dark'] as const;
    const cur = (store.get('chika-theme') as (typeof order)[number]) || 'auto';
    const next = order[(order.indexOf(cur) + 1) % order.length]!;
    store.set('chika-theme', next);
    applyTheme(next);
  }

  private toggleScanlines(): void {
    const on = this.screen.classList.toggle('scanlines');
    store.set('chika-scanlines', on ? '1' : '0');
    el<HTMLButtonElement>('scan').setAttribute('aria-pressed', String(on));
  }
}

const KEY_DIRS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  h: [-1, 0],
  l: [1, 0],
  k: [0, -1],
  j: [0, 1],
  y: [-1, -1],
  u: [1, -1],
  b: [-1, 1],
  n: [1, 1],
};

const CODE_DIRS: Record<string, [number, number]> = {
  Numpad4: [-1, 0],
  Numpad6: [1, 0],
  Numpad8: [0, -1],
  Numpad2: [0, 1],
  Numpad7: [-1, -1],
  Numpad9: [1, -1],
  Numpad1: [-1, 1],
  Numpad3: [1, 1],
};

function keyToCommand(e: KeyboardEvent): Command | null {
  const dir = KEY_DIRS[e.key] ?? CODE_DIRS[e.code];
  if (dir) return { kind: 'move', dx: dir[0], dy: dir[1] };
  if (e.key === '.' || e.code === 'Numpad5') return { kind: 'wait' };
  if (e.key === 'g' || e.key === ',') return { kind: 'pickup' };
  if (e.key === '>') return { kind: 'descend' };
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit) return { kind: 'use', index: Number(digit[1]) - 1 };
  return null;
}

function applyTheme(mode: 'auto' | 'light' | 'dark'): void {
  const root = document.documentElement;
  if (mode === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  const label = { auto: '自動', light: '明', dark: '暗' }[mode];
  const btn = document.getElementById('theme');
  if (btn) btn.textContent = `テーマ: ${label}`;
}

function seedInHash(): string | null {
  const m = /seed=([^&]+)/.exec(location.hash);
  return m && m[1] ? decodeURIComponent(m[1]) : null;
}

function randomSeed(): string {
  return String(Math.floor(Math.random() * 900000) + 100000);
}

// 途中経過のセーブを読む。壊れた値や古い形式は黙って捨てる。
function loadSave(): GameSnapshot | null {
  const raw = store.get(SAVE_KEY);
  if (!raw) return null;
  try {
    const snap = JSON.parse(raw) as GameSnapshot;
    if (snap?.v === 1 && snap.status === 'playing' && Array.isArray(snap.entities)) return snap;
  } catch {
    /* 壊れた保存は無視して新規に始める */
  }
  return null;
}

function chooseGame(): Game {
  const seed = seedInHash();
  const save = loadSave();
  // 共有リンク(URLに別シード)を開いたときは、そのシードを優先して新しく始める。
  // それ以外(URLにシードが無い/セーブと同じ)なら途中の冒険を再開する。
  if (save && (!seed || seed === save.seedText)) return Game.restore(save);
  if (seed) return new Game(seed);
  return new Game(randomSeed());
}

function boot(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = SHELL;

  const theme = (store.get('chika-theme') as 'auto' | 'light' | 'dark') || 'auto';
  applyTheme(theme);

  if (store.get('chika-scanlines') === '0') {
    document.querySelector('.screen')?.classList.remove('scanlines');
    document.getElementById('scan')?.setAttribute('aria-pressed', 'false');
  }

  const game = chooseGame();
  location.hash = `seed=${encodeURIComponent(game.seedText)}`;
  new UI(game);
}

boot();
