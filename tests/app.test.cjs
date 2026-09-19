const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

// DOM integration tests with a deterministic clock. Visual layout is checked in a browser.
function setup(t, { reduced = false, stored = null, storageDenied = false } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/a-subpath/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  t.after(() => window.close());
  let now = 0;
  let id = 0;
  const timers = new Map();
  const media = { matches: reduced, addEventListener(event, handler) { this.handler = handler; } };
  const colorMedia = { matches: true, addEventListener(event, handler) { this.handler = handler; } };
  window.matchMedia = (query) => query.includes('reduced-motion') ? media : query.includes('color-scheme') ? colorMedia : { matches: true };
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  Object.defineProperty(window.performance, 'now', { value: () => now });
  window.setTimeout = (callback, delay = 0) => { timers.set(++id, { callback, at: now + delay }); return id; };
  window.setInterval = (callback, delay) => { timers.set(++id, { callback, at: now + delay, interval: delay }); return id; };
  window.clearTimeout = window.clearInterval = (timer) => timers.delete(timer);
  window.requestAnimationFrame = (callback) => window.setTimeout(callback, 16);
  window.cancelAnimationFrame = window.clearTimeout;
  if (stored !== null) window.localStorage.setItem('neko.pats.v1', stored);
  if (storageDenied) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage denied'); } });
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  window.eval(script);
  const $ = (id) => window.document.getElementById(id);
  function advance(ms) {
    const end = now + ms;
    for (let iterations = 0; iterations < 20000; iterations++) {
      const next = [...timers].filter(([,timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [key, timer] = next;
      now = timer.at;
      if (timer.interval) timer.at += timer.interval; else timers.delete(key);
      timer.callback(now);
    }
    now = end;
  }
  function command(text) {
    $('terminal-input').value = text;
    $('terminal-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    return $('terminal-output').textContent;
  }
  function key(key, extra = {}, target = $('terminal-input')) {
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
    target.dispatchEvent(event);
    return event;
  }
  return { window, $, advance, command, key, media, colorMedia, state: () => $('companion').dataset.state };
}

test('pet buttons and cat share state, count, persistence and cooldown', (t) => {
  const app = setup(t);
  app.$('cat-touch').click();
  assert.equal(app.state(), 'happy');
  assert.equal(app.$('affection-value').textContent, '已撸 1 次');
  assert.equal(app.window.localStorage.getItem('neko.pats.v1'), '1');
  app.$('pet-button').click();
  assert.equal(app.$('affection-value').textContent, '已撸 1 次');
  app.advance(350);
  app.$('pet-button').click();
  assert.equal(app.$('affection-value').textContent, '已撸 2 次');
  app.advance(4000);
  assert.equal(app.state(), 'awake');
});

test('idle dozes at 18s, sleeps at 30s, and meaningful pointer input wakes it', (t) => {
  const app = setup(t);
  app.advance(18000);
  assert.equal(app.state(), 'drowsy');
  app.advance(12000);
  assert.equal(app.state(), 'sleeping');
  assert.equal(app.$('sleep-label').textContent, '叫醒气气');
  app.window.document.dispatchEvent(new app.window.MouseEvent('pointermove', { clientX: 200, clientY: 100, bubbles: true }));
  assert.equal(app.state(), 'awake');
});

test('wake button is not reversed by preceding pointerdown or keyboard input', (t) => {
  const app = setup(t);
  app.advance(30000);
  app.$('sleep-button').dispatchEvent(new app.window.MouseEvent('pointerdown', { bubbles: true }));
  assert.equal(app.state(), 'sleeping');
  app.$('sleep-button').click();
  assert.equal(app.state(), 'awake');
  app.advance(30000);
  app.key(' ', {}, app.$('sleep-button'));
  app.$('sleep-button').click();
  assert.equal(app.state(), 'awake');
});

test('manual sleep persists across input; pet and terminal wake end it', (t) => {
  const app = setup(t);
  app.$('sleep-button').click();
  app.window.document.dispatchEvent(new app.window.MouseEvent('pointermove', { clientX: 90, clientY: 100 }));
  assert.equal(app.state(), 'sleeping');
  app.advance(40000);
  assert.equal(app.state(), 'sleeping');
  app.$('cat-touch').click();
  assert.equal(app.state(), 'happy');
  app.command('sleep');
  app.advance(10000);
  assert.equal(app.state(), 'sleeping');
  app.command('wake');
  assert.equal(app.state(), 'awake');
});

test('terminal commands control the cat and expose real profile links', (t) => {
  const app = setup(t);
  assert.match(app.command('whoami'), /陈辰 \/ Chen Chen/);
  assert.match(app.command('pet'), /呼噜引擎/);
  assert.equal(app.state(), 'happy');
  assert.match(app.command('status'), /状态：开心/);
  app.command('projects');
  const links = [...app.$('terminal-output').querySelectorAll('a')];
  assert.equal(links.length, 2);
  assert.equal(links[0].href, 'https://github.com/z1cheng?tab=repositories');
  assert.ok(links.every((link) => link.rel.includes('noopener')));
  assert.match(app.command('cat dreams.txt'), /小鱼干/);
  assert.match(app.command('sudo pet'), /权限不足/);
  assert.match(app.command('meow'), /喵，你好呀/);
  assert.match(app.command('date'), /UTC\+8/);
});

test('unknown commands render as text, with bounded output and history', (t) => {
  const app = setup(t);
  const attack = '<img src=x onerror=alert(1)>';
  assert.match(app.command(attack), /未知命令/);
  assert.equal(app.$('terminal-output').querySelector('img'), null);
  assert.ok(app.$('terminal-output').textContent.includes(attack));
  for (let i = 0; i < 80; i++) app.command(`unknown-${i}`);
  assert.ok(app.$('terminal-output').childElementCount <= 160);
  for (let i = 0; i < 80; i++) app.key('ArrowUp');
  assert.equal(app.$('terminal-input').value, 'unknown-30');
  app.command('clear');
  assert.equal(app.$('terminal-output').childElementCount, 0);
});

test('terminal drawer opens with shortcuts and closes with exit or Escape', (t) => {
  const app = setup(t);
  assert.equal(app.$('terminal').tagName, 'DIV');
  assert.equal(app.$('playground').open, false);
  assert.match(app.$('terminal-output').textContent, /你好，欢迎来访/);
  assert.notEqual(app.window.document.activeElement, app.$('terminal-input'));
  app.key('k', { ctrlKey: true }, app.window.document);
  assert.equal(app.window.document.activeElement, app.$('terminal-input'));
  assert.equal(app.window.document.body.style.overflow, '');
  app.command('exit');
  assert.equal(app.window.document.activeElement, app.$('terminal-launcher'));
  assert.equal(app.$('playground').open, false);
  app.key('`', {}, app.window.document);
  assert.equal(app.window.document.activeElement, app.$('terminal-input'));
  app.key('Escape');
  assert.equal(app.window.document.activeElement, app.$('terminal-launcher'));
  app.$('terminal-expand').click();
  assert.equal(app.$('terminal-expand').getAttribute('aria-expanded'), 'true');
  assert.ok(app.$('terminal').classList.contains('expanded'));
});

test('history restores drafts and Tab completes only unambiguous input', (t) => {
  const app = setup(t);
  app.command('whoami');
  app.command('status');
  app.$('terminal-input').value = 'unfinished';
  app.key('ArrowUp');
  assert.equal(app.$('terminal-input').value, 'status');
  app.key('ArrowUp');
  assert.equal(app.$('terminal-input').value, 'whoami');
  app.key('ArrowDown');
  app.key('ArrowDown');
  assert.equal(app.$('terminal-input').value, 'unfinished');
  app.$('terminal-input').value = 'wh';
  assert.equal(app.key('Tab').defaultPrevented, true);
  assert.equal(app.$('terminal-input').value, 'whoami');
  app.$('terminal-input').value = '';
  assert.equal(app.key('Tab').defaultPrevented, false, 'Tab must allow leaving the input');
});

test('reduced motion follows system setting until the user overrides it', (t) => {
  const app = setup(t, { reduced: true });
  assert.equal(app.window.document.documentElement.dataset.motion, 'off');
  app.media.matches = false;
  app.media.handler();
  assert.equal(app.window.document.documentElement.dataset.motion, 'on');
  app.command('motion off');
  app.media.handler();
  assert.equal(app.window.document.documentElement.dataset.motion, 'off');
  app.$('pet-button').click();
  assert.equal(app.state(), 'happy', 'motion preference does not disable interaction');
});

test('storage denial or corrupt data does not break the page', (t) => {
  for (const options of [{ storageDenied: true }, { stored: '-1' }, { stored: 'NaN' }, { stored: 'Infinity' }]) {
    const app = setup(t, options);
    assert.equal(app.$('affection-value').textContent, '已撸 0 次');
    app.$('pet-button').click();
    assert.equal(app.$('affection-value').textContent, '已撸 1 次');
  }
  const returning = setup(t, { stored: '42' });
  assert.equal(returning.$('affection-value').textContent, '已撸 42 次');
  assert.match(returning.$('cat-message').textContent, /你回来啦/);
});

test('typing resets idle, an idle terminal can sleep, and hidden pages suspend timers', (t) => {
  const app = setup(t);
  app.key('k', { ctrlKey: true }, app.window.document);
  app.advance(17000);
  app.key('h');
  app.advance(17000);
  assert.equal(app.state(), 'awake');
  app.advance(13000);
  assert.equal(app.state(), 'sleeping');
  app.key('e');
  assert.equal(app.state(), 'awake');
  Object.defineProperty(app.window.document, 'hidden', { configurable: true, value: true });
  app.window.document.dispatchEvent(new app.window.Event('visibilitychange'));
  app.advance(60000);
  assert.equal(app.state(), 'awake');
  assert.ok(app.window.document.body.classList.contains('page-hidden'));
  Object.defineProperty(app.window.document, 'hidden', { configurable: true, value: false });
  app.window.document.dispatchEvent(new app.window.Event('visibilitychange'));
  app.advance(17000);
  assert.equal(app.state(), 'awake');
});

test('touch reveals the bilingual lens and keeps language metadata', (t) => {
  const app = setup(t);
  app.$('greet').dispatchEvent(new app.window.MouseEvent('pointerdown', { clientX: 50, bubbles: true }));
  assert.ok(app.$('greet').classList.contains('lens-touch'));
  assert.equal(app.$('greet').querySelector('.name-primary').lang, 'en');
  assert.equal(app.$('greet').getAttribute('aria-label'), "Hi, I'm Chen Chen");
  app.advance(1800);
  assert.ok(!app.$('greet').classList.contains('lens-touch'));
});

test('static assets resolve under a Pages subpath and SVG references are valid', (t) => {
  const app = setup(t);
  const doc = app.window.document;
  const ids = [...doc.querySelectorAll('[id]')].map((element) => element.id);
  assert.equal(ids.length, new Set(ids).size, 'IDs must be unique');
  const resources = [...doc.querySelectorAll('script[src], link[rel="stylesheet"]')];
  assert.equal(resources.length, 2, 'the script and stylesheet must both be parsed');
  assert.match(doc.querySelector('link[rel="stylesheet"]').getAttribute('href'), /^\.\/style\.css\?v=[a-f0-9]{12}$/);
  for (const element of resources) {
    const value = element.getAttribute('src') || element.getAttribute('href');
    assert.ok(value.startsWith('./'));
    const [filename, query] = value.split('?');
    const file = path.resolve(root, filename);
    assert.ok(fs.existsSync(file));
    const hash = require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
    assert.equal(new URLSearchParams(query).get('v'), hash, 'asset URL must match its content');
  }
  for (const [, id] of html.matchAll(/url\(#([^)]*)\)/g)) assert.ok(doc.getElementById(id), `missing SVG definition ${id}`);
  assert.ok(fs.existsSync(path.join(root, '.nojekyll')));
  assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|eval)\s*\(/.test(script));
});

test('calculator respects precedence, powers, unary operators and rejects invalid input', (t) => {
  const app = setup(t);
  for (const [expression, expected] of [['(2 + 3) * 4', '20'], ['2^3^2', '512'], ['-2^2', '-4'], ['2^-2', '0.25'], ['0.1 + 0.2', '0.3'], ['2*pi', '6.28318530718'], ['1e3/4', '250']]) {
    app.command(`calc ${expression}`);
    assert.equal(app.$('terminal-output').lastElementChild.textContent, `= ${expected}`);
  }
  for (const expression of ['1/0', '1%0', 'alert(1)', '2**3', '(2+3', '2 3', '1e999', '(-1)^0.5']) {
    app.command(`calc ${expression}`);
    assert.ok(app.$('terminal-output').lastElementChild.classList.contains('error'), expression);
  }
});

test('UTF-8 Base64 round trips, UUID shape and quoted text are correct', (t) => {
  const app = setup(t);
  app.command('base64 encode "你好，猫 🐱"');
  const encoded = app.$('terminal-output').lastElementChild.textContent;
  assert.equal(encoded, Buffer.from('你好，猫 🐱').toString('base64'));
  app.command(`base64 decode ${encoded}`);
  assert.equal(app.$('terminal-output').lastElementChild.textContent, '你好，猫 🐱');
  for (const invalid of ['%%%', '/w==']) {
    app.command(`base64 decode ${invalid}`);
    assert.match(app.$('terminal-output').lastElementChild.textContent, /Base64 或 UTF-8 文本无效/);
  }
  app.command('uuid');
  assert.match(app.$('terminal-output').lastElementChild.textContent, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  app.command('echo "Two  Spaces"');
  assert.equal(app.$('terminal-output').lastElementChild.textContent, 'Two  Spaces');
  app.command('echo "unfinished');
  assert.match(app.$('terminal-output').lastElementChild.textContent, /引号还没闭合/);
  app.command('cat constructor');
  assert.match(app.$('terminal-output').lastElementChild.textContent, /没有这份文件/);
  app.command('constructor');
  assert.match(app.$('terminal-output').lastElementChild.textContent, /未知命令/);
});

test('theme commands persist choices, follow auto and stay in sync with the visible button', (t) => {
  const app = setup(t);
  const root = app.window.document.documentElement;
  app.command('theme light');
  assert.equal(root.dataset.theme, 'light');
  assert.equal(app.window.localStorage.getItem('chen.theme.v1'), 'light');
  assert.equal(app.$('theme-toggle').getAttribute('aria-label'), '切换到深色主题');
  app.command('theme auto');
  assert.equal(root.dataset.theme, 'dark');
  app.colorMedia.matches = false; app.colorMedia.handler();
  assert.equal(root.dataset.theme, 'light');
  app.$('theme-toggle').click();
  assert.equal(root.dataset.theme, 'dark');
  app.command('theme ultraviolet');
  assert.equal(root.dataset.theme, 'dark');
  assert.match(app.$('terminal-output').lastElementChild.textContent, /用法：/);
});

test('Tab completes arguments and cycles ambiguous commands; Shift Tab can leave', (t) => {
  const app = setup(t);
  app.$('terminal-input').value = 'cat dr';
  app.key('Tab');
  assert.equal(app.$('terminal-input').value, 'cat dreams.txt');
  app.$('terminal-input').value = 'theme ';
  app.key('Tab');
  assert.equal(app.$('terminal-input').value, 'theme dark');
  app.key('Tab');
  assert.equal(app.$('terminal-input').value, 'theme light');
  app.key('Tab');
  assert.equal(app.$('terminal-input').value, 'theme auto');
  assert.equal(app.key('Tab', { shiftKey: true }).defaultPrevented, false);
  const previousOutput = app.$('terminal-output').textContent;
  assert.equal(app.key('l', { ctrlKey: true }).defaultPrevented, false);
  assert.equal(app.$('terminal-output').textContent, previousOutput);
});

test('documented commands all run and invalid arguments leave settings unchanged', (t) => {
  const app = setup(t);
  app.command('help');
  assert.equal(app.$('command-count').textContent, '33');
  for (const text of ['help calc', 'whoami', 'about', 'projects', 'github', 'email', 'ls', 'cat readme.txt', 'pwd', 'tree', 'pet chin', 'feed', 'sleep', 'wake', 'status', 'meow', 'date', 'time', 'calc 1+2', 'echo hello', 'base64 encode hi', 'uuid', 'roll 20', 'fortune', 'theme', 'motion', 'uptime', 'history', 'neofetch', 'banner', 'clear', 'exit']) {
    app.command(text);
    assert.ok(!app.$('terminal-output').lastElementChild?.classList.contains('error'), text);
  }
  for (const text of ['pet tail', 'roll 0', 'roll 1001', 'roll 2.5', 'motion maybe', 'sleep now', 'base64 reverse hi', 'cat missing.txt']) {
    app.command(text);
    assert.ok(app.$('terminal-output').lastElementChild.classList.contains('error'), text);
  }
});

test('mouse strokes avoid double-counting clicks and keyboard petting wakes manual sleep', (t) => {
  const app = setup(t);
  function pointer(type, x, extra = {}) {
    const event = new app.window.MouseEvent(type, { clientX: x, clientY: 90, buttons: 1, bubbles: true, ...extra });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    app.$('cat-touch').dispatchEvent(event);
  }
  pointer('pointerdown', 100);
  pointer('pointermove', 160);
  assert.equal(app.$('affection-value').textContent, '已撸 1 次');
  pointer('pointerup', 160);
  app.$('cat-touch').click();
  assert.equal(app.$('affection-value').textContent, '已撸 1 次');
  app.advance(600);
  app.command('sleep');
  app.$('cat-touch').click();
  assert.equal(app.state(), 'happy');
  assert.equal(app.$('affection-value').textContent, '已撸 2 次');
});

test('drawer preserves cat state, output and drafts across closing and reopening', (t) => {
  const app = setup(t);
  app.$('pet-button').click();
  app.$('terminal-launcher').focus();
  app.$('terminal-launcher').click();
  assert.equal(app.$('playground').open, true);
  assert.equal(app.$('terminal-launcher').getAttribute('aria-expanded'), 'true');
  app.command('echo preserved');
  app.$('terminal-input').value = 'unfinished';
  app.$('terminal-close').click();
  assert.equal(app.$('playground').open, false);
  assert.equal(app.window.document.documentElement.classList.contains('terminal-open'), false);
  assert.equal(app.window.document.activeElement, app.$('terminal-launcher'));
  app.$('terminal-launcher').click();
  assert.match(app.$('terminal-output').textContent, /preserved/);
  assert.equal(app.$('terminal-input').value, 'unfinished');
  assert.equal(app.state(), 'happy');
  app.$('playground').dispatchEvent(new app.window.Event('cancel', { cancelable: true }));
  assert.equal(app.$('playground').open, false);
});
