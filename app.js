/* A small browser playground. All commands are local; nothing executes as shell code. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const companion = $('companion');
  const catTouch = $('cat-touch');
  const terminal = $('terminal');
  const input = $('terminal-input');
  const output = $('terminal-output');
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const colorPreference = matchMedia('(prefers-color-scheme: dark)');
  const MAX_HISTORY = 50;
  const MAX_LINES = 160;
  const STARTED = performance.now();
  let state = 'awake';
  let lastActivity = STARTED;
  let happyUntil = 0;
  let manualSleep = false;
  let messageTimer;
  let pats = 0;
  let motion = !motionPreference.matches;
  let motionOverridden = false;
  let theme = 'dark';
  let frameId = 0;
  let pointer = null;
  let gaze = { x: 0, y: 0 };
  let strokeDistance = 0;
  let strokePoint = null;
  let lastStroke = -Infinity;
  let lastPet = -Infinity;
  let history = [];
  let historyIndex = 0;
  let draft = '';
  let completion = null;
  const terminalDialog = $('playground');
  const launcher = $('terminal-launcher');
  let terminalReturnFocus = null;
  const stateNames = { awake: '清醒', happy: '开心', drowsy: '犯困', sleeping: '熟睡' };
  const themeNames = { dark: '深色', light: '浅色', auto: '跟随系统' };
  const petMessages = ['呼噜引擎启动中。', '好吧，你可以留下来。', '这个手法，再来一点。', '你的喜欢，我收到啦。', '决定了，你就是我的人类。'];
  const fortunes = ['慢一点也没关系，每一步都算数。', '打盹也是一种进步。——气气', '保持好奇，尤其是对那些看似理所当然的事。', '没有什么地方比 127.0.0.1 更像家。', '撸猫最好的时间，就是现在。', '做点小东西，留下自己的印记。', '今天也要给好奇心留一点时间。'];

  function remember(key, value) { try { localStorage.setItem(key, value); } catch { /* Storage is optional. */ } }
  try {
    const stored = Number(localStorage.getItem('neko.pats.v1'));
    if (Number.isSafeInteger(stored) && stored >= 0) pats = Math.min(stored, 999999);
    const savedTheme = localStorage.getItem('chen.theme.v1');
    if (['dark', 'light', 'auto'].includes(savedTheme)) theme = savedTheme;
  } catch { /* The full playground works with storage disabled. */ }

  function say(message, duration = 4200) {
    clearTimeout(messageTimer);
    $('cat-message').textContent = message;
    if (duration) messageTimer = setTimeout(() => { $('cat-message').textContent = ''; }, duration);
  }
  function updateState(next) {
    state = next;
    companion.dataset.state = next;
    const labels = { awake: '好奇心在线', happy: '呼噜引擎已启动', drowsy: '正在进入打盹模式…', sleeping: '梦里全是小鱼干' };
    $('state-label').textContent = labels[next];
    $('affection-value').textContent = `已撸 ${pats} 次`;
    $('sleep-label').textContent = next === 'sleeping' ? '叫醒气气' : '让它打个盹';
    $('sleep-button').setAttribute('aria-pressed', String(next === 'sleeping'));
    $('terminal-cat-state').textContent = `/ ${stateNames[next]}`;
    catTouch.setAttribute('aria-label', next === 'sleeping' ? '叫醒并摸摸气气' : '摸摸气气');
    if (next !== 'awake') resetGaze();
  }
  function pet(zone = 'head') {
    const now = performance.now();
    if (now - lastPet < 250 && state === 'happy') return false;
    lastPet = lastActivity = now;
    manualSleep = false;
    pats = Math.min(pats + 1, 999999);
    remember('neko.pats.v1', String(pats));
    companion.dataset.petZone = zone;
    happyUntil = now + 2900;
    updateState('happy');
    say(zone === 'chin' ? '对，就是下巴这里，舒服。' : petMessages[(pats - 1) % petMessages.length]);
    return true;
  }
  function sleep(manual = true) {
    manualSleep = manual;
    happyUntil = 0;
    updateState('sleeping');
    say('先睡一觉，醒了再征服世界。', 0);
  }
  function wake() {
    manualSleep = false;
    happyUntil = 0;
    lastActivity = performance.now();
    updateState('awake');
    say('醒啦，刚刚聊到哪了？');
  }
  function activity(event) {
    lastActivity = performance.now();
    // Do not wake on pointerdown then accidentally put it back to sleep on click.
    if (event?.target instanceof Element && event.target.closest('#sleep-button')) return;
    if ((state === 'sleeping' && !manualSleep) || state === 'drowsy') wake();
  }
  function resetGaze() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    gaze = { x: 0, y: 0 };
    $('head-track').removeAttribute('transform');
    $('pupilL').removeAttribute('transform');
    $('pupilR').removeAttribute('transform');
  }
  function track() {
    frameId = 0;
    if (!motion || document.hidden || state !== 'awake' || !pointer) return;
    const rect = $('cat').getBoundingClientRect();
    if (!rect.width) return;
    const scale = rect.width / 260;
    const dx = (pointer.x - rect.left) / scale - 130;
    const dy = (pointer.y - rect.top) / scale - 92;
    const distance = Math.hypot(dx, dy) || 1;
    const reach = 7.5 * (1 - Math.exp(-distance / 150));
    const target = { x: dx / distance * reach, y: dy / distance * reach };
    gaze.x += (target.x - gaze.x) * .16;
    gaze.y += (target.y - gaze.y) * .16;
    for (const eye of ['pupilL', 'pupilR']) $(eye).setAttribute('transform', `translate(${gaze.x.toFixed(2)} ${gaze.y.toFixed(2)})`);
    $('head-track').setAttribute('transform', `rotate(${(gaze.x * .4).toFixed(2)} 130 150)`);
    if (Math.abs(target.x - gaze.x) + Math.abs(target.y - gaze.y) > .04) frameId = requestAnimationFrame(track);
  }
  function applyMotion() {
    root.dataset.motion = motion ? 'on' : 'off';
    if (!motion) resetGaze();
  }
  function applyTheme() {
    root.dataset.theme = theme === 'auto' ? (colorPreference.matches ? 'dark' : 'light') : theme;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    $('theme-toggle').setAttribute('aria-label', `切换到${themeNames[next]}主题`);
    $('theme-toggle').title = `切换到${themeNames[next]}主题`;
    const themeExample = document.querySelector('.command-guide [data-command^="theme "]');
    themeExample.dataset.command = `theme ${next}`;
    themeExample.querySelector('code').textContent = `theme ${next}`;
  }
  document.addEventListener('pointermove', (event) => {
    const moved = !pointer || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 2;
    pointer = { x: event.clientX, y: event.clientY };
    if (moved) activity(event);
    if (motion && !frameId && state === 'awake') frameId = requestAnimationFrame(track);
  }, { passive: true });
  document.addEventListener('pointerdown', activity, { passive: true });
  document.addEventListener('keydown', activity);
  document.addEventListener('scroll', activity, { passive: true, capture: true });
  root.addEventListener('pointerleave', () => { pointer = null; resetGaze(); });
  window.addEventListener('resize', resetGaze);
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('page-hidden', document.hidden);
    if (document.hidden) resetGaze();
    else { lastActivity = performance.now(); updateClock(); }
  });
  function zoneAt(event) {
    const rect = $('cat').getBoundingClientRect();
    const y = rect.height ? (event.clientY - rect.top) / rect.height * 250 : 0;
    return event.detail !== 0 && y > 106 && y < 150 ? 'chin' : 'head';
  }
  catTouch.addEventListener('click', (event) => { if (performance.now() - lastStroke > 500) pet(zoneAt(event)); });
  catTouch.addEventListener('pointerdown', (event) => { strokePoint = { x: event.clientX, y: event.clientY }; strokeDistance = 0; });
  catTouch.addEventListener('pointermove', (event) => {
    // Touch remains scrollable; tapping is the mobile pet gesture.
    if (event.pointerType !== 'mouse' || !event.buttons || !strokePoint) return;
    strokeDistance += Math.hypot(event.clientX - strokePoint.x, event.clientY - strokePoint.y);
    strokePoint = { x: event.clientX, y: event.clientY };
    if (strokeDistance > 45 && performance.now() - lastStroke > 900) {
      pet(zoneAt(event)); lastStroke = performance.now(); strokeDistance = 0;
    }
  }, { passive: true });
  for (const event of ['pointerup', 'pointercancel', 'pointerleave']) catTouch.addEventListener(event, () => { strokePoint = null; });
  $('pet-button').addEventListener('click', () => pet());
  $('sleep-button').addEventListener('click', () => { if (state === 'sleeping') wake(); else sleep(); });
  motionPreference.addEventListener('change', () => { if (!motionOverridden) { motion = !motionPreference.matches; applyMotion(); } });
  $('theme-toggle').addEventListener('click', () => { theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; remember('chen.theme.v1', theme); applyTheme(); });
  colorPreference.addEventListener('change', () => { if (theme === 'auto') applyTheme(); });

  const greeting = $('greet');
  const lens = greeting.querySelector('.lens');
  let lensTimer;
  function moveLens(event) {
    const rect = lens.getBoundingClientRect();
    lens.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    lens.style.setProperty('--my', `${rect.height / 2}px`);
  }
  greeting.addEventListener('pointermove', moveLens, { passive: true });
  greeting.addEventListener('pointerenter', moveLens, { passive: true });
  greeting.addEventListener('pointerdown', (event) => {
    moveLens(event);
    if (event.pointerType !== 'mouse') {
      clearTimeout(lensTimer); greeting.classList.add('lens-touch');
      lensTimer = setTimeout(() => greeting.classList.remove('lens-touch'), 1800);
    }
  }, { passive: true });

  function line(text, className = '', link) {
    const paragraph = document.createElement('p');
    paragraph.className = `terminal-line ${className}`.trim();
    paragraph.textContent = text;
    if (link) {
      const anchor = document.createElement('a');
      anchor.href = link.href;
      anchor.textContent = link.label;
      if (link.href.startsWith('https:')) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
      paragraph.append(anchor);
    }
    output.append(paragraph);
    while (output.childElementCount > MAX_LINES) output.firstElementChild.remove();
    output.scrollTop = output.scrollHeight;
  }
  function banner() {
    line('你好，欢迎来访。', 'banner');
    line('欢迎来到我在互联网上的小角落。');
    line('这里有些小东西可以探索，还有气气陪你。');
    line('输入 help 四处逛逛，或者用 pet 和气气交个朋友。', 'success');
    line('────────────────────────────────────', 'system');
    line('chen.sh v1.0  /  气气已连接  /  欢迎好奇心', 'system');
  }
  function focusTerminal() {
    if (!terminalDialog.open) {
      terminalReturnFocus = document.activeElement;
      terminalDialog.showModal();
      root.classList.add('terminal-open');
      launcher.setAttribute('aria-expanded', 'true');
    }
    input.focus({ preventScroll: true });
  }
  function closeTerminal() {
    if (!terminalDialog.open) return;
    terminalDialog.close();
    root.classList.remove('terminal-open');
    launcher.setAttribute('aria-expanded', 'false');
    const target = terminalReturnFocus instanceof HTMLElement && terminalReturnFocus !== document.body ? terminalReturnFocus : launcher;
    target.focus({ preventScroll: true });
  }
  launcher.addEventListener('click', focusTerminal);
  $('terminal-close').addEventListener('click', closeTerminal);
  terminalDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeTerminal(); });
  terminalDialog.addEventListener('click', (event) => {
    const rect = terminalDialog.getBoundingClientRect();
    if (event.target === terminalDialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeTerminal();
  });
  $('terminal-clear').addEventListener('click', () => { output.replaceChildren(); input.focus({ preventScroll: true }); });
  $('terminal-expand').addEventListener('click', () => {
    const expanded = terminal.classList.toggle('expanded');
    $('terminal-expand').setAttribute('aria-expanded', String(expanded));
    $('terminal-expand').setAttribute('aria-label', expanded ? '收起终端' : '展开终端');
    $('terminal-expand').title = expanded ? '收起终端' : '展开终端';
  });
  document.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Escape' && terminalDialog.open) { event.preventDefault(); closeTerminal(); return; }
    const editable = event.target instanceof HTMLElement && (event.target.matches('input, textarea, select') || event.target.isContentEditable);
    if (((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') || (event.key === '`' && !editable && !event.metaKey && !event.ctrlKey && !event.altKey)) {
      event.preventDefault(); focusTerminal();
    }
  });
  if (!/Mac|iPhone|iPad/.test(navigator.platform)) $('focus-shortcut').textContent = 'Ctrl K';

  // Only parse arithmetic. Never hand user input to JavaScript or a shell.
  function calculate(expression) {
    const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|pi|e|[()+\-*/%^]/gi) || [];
    if (!tokens.length || tokens.join('').toLowerCase() !== expression.replace(/\s+/g, '').toLowerCase()) throw new Error('请使用数字、pi、e、括号和 + - * / % ^ 运算符。');
    let index = 0;
    function primary() {
      const token = tokens[index++];
      if (token === '(') { const result = sum(); if (tokens[index++] !== ')') throw new Error('少了一个右括号。'); return result; }
      if (/^(pi|e)$/i.test(token || '')) return token.toLowerCase() === 'pi' ? Math.PI : Math.E;
      if (!token || !/^(\d|\.)/.test(token)) throw new Error('这里需要一个数字或括号。');
      return Number(token);
    }
    function power() { const value = primary(); return tokens[index] === '^' ? (index++, value ** unary()) : value; }
    function unary() { if (tokens[index] === '+') { index++; return unary(); } if (tokens[index] === '-') { index++; return -unary(); } return power(); }
    function product() {
      let value = unary();
      while (['*', '/', '%'].includes(tokens[index])) {
        const operator = tokens[index++]; const right = unary();
        if ((operator === '/' || operator === '%') && right === 0) throw new Error('不能除以零哦。');
        value = operator === '*' ? value * right : operator === '/' ? value / right : value % right;
      }
      return value;
    }
    function sum() { let value = product(); while (['+', '-'].includes(tokens[index])) { const operator = tokens[index++]; const right = product(); value = operator === '+' ? value + right : value - right; } return value; }
    const result = sum();
    if (index !== tokens.length) throw new Error('表达式格式有误，可以试试 calc (2 + 3) * 4。');
    if (!Number.isFinite(result)) throw new Error('结果超出了可表示的有限数值范围。');
    return Number(result.toPrecision(12));
  }
  function tokenize(text) {
    const args = []; let word = ''; let quote = ''; let started = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '\\' && quote !== "'") {
        if (++i === text.length) throw new Error('末尾的反斜杠后面还需要一个字符。');
        word += text[i]; started = true;
      } else if (quote) {
        if (char === quote) quote = ''; else word += char;
      } else if (char === '"' || char === "'") { quote = char; started = true; }
      else if (/\s/.test(char)) { if (started) { args.push(word); word = ''; started = false; } }
      else { word += char; started = true; }
    }
    if (quote) throw new Error('引号还没闭合，补上后再试一次。');
    if (started) args.push(word);
    return args;
  }
  const files = {
    'readme.txt': '欢迎来到陈辰的网络小角落。\n撸撸猫，让它做个梦，也记得带上好奇心。\n这个终端里藏着一座虚拟小书架，随便翻翻吧。\nTab 补全命令和参数；↑ / ↓ 回看历史命令。',
    'human.txt': '陈辰 / Chen Chen\n中国 · alibaba · UTC+8\nimchench@gmail.com\ngithub.com/z1cheng',
    'dreams.txt': '吃不完的小鱼干。\n永远不会挪走的一束阳光。\n还有一个愿意再摸摸我的人。',
    'links.txt': 'GitHub: https://github.com/z1cheng\n源码：https://github.com/z1cheng/z1cheng.github.io\n邮箱：imchench@gmail.com'
  };
  const commands = Object.create(null);
  function command(name, group, usage, description, run) { commands[name] = { group, usage, description, run }; }
  function usage(condition, text) { if (!condition) throw new Error(`用法：${text}`); }
  function noArgs(args, name) { usage(!args.length, name); }
  function link(text, href, label) { line(text, '', { href, label }); }
  function localDate() { return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'full', timeStyle: 'medium' }).format(new Date()); }
  function elapsed() { const seconds = Math.floor((performance.now() - STARTED) / 1000); return `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds / 60) % 60} 分 ${seconds % 60} 秒`; }
  command('help', '探索', 'help [命令]', '查看全部命令或某个命令的用法', (args) => {
    usage(args.length <= 1, 'help [命令]');
    if (args.length) {
      const item = commands[args[0].toLowerCase()];
      if (!item) throw new Error(`没有找到 ${args[0]} 的帮助，输入 help 查看命令列表。`);
      line(item.usage, 'heading'); line(item.description); return;
    }
    for (const group of ['探索', '逗猫', '工具', '会话']) {
      line(group, 'heading');
      line(Object.entries(commands).filter(([, item]) => item.group === group).map(([name, item]) => `${name.padEnd(11)} ${item.description}`).join('\n'));
    }
    line('输入 help <命令> 查看用法，用引号可以保留文本中的空格。\nTab：补全 · ↑/↓：历史 · Esc：关闭终端', 'system');
  });
  command('whoami', '探索', 'whoami', '认识一下我', (args) => { noArgs(args, 'whoami'); line(files['human.txt']); });
  command('about', '探索', 'about', '关于我和这个小角落', (args) => { noArgs(args, 'about'); line('陈辰 / Chen Chen\n在 alibaba 工作，生活在中国，时区 UTC+8。\n这里是我在互联网上的小角落，还有气气陪着。'); });
  command('projects', '探索', 'projects', '看看我做过的项目', (args) => { noArgs(args, 'projects'); link('公开项目 → ', 'https://github.com/z1cheng?tab=repositories', 'github.com/z1cheng'); link('这个小网站 → ', 'https://github.com/z1cheng/z1cheng.github.io', 'z1cheng.github.io'); });
  command('github', '探索', 'github', '在 GitHub 找到我', (args) => { noArgs(args, 'github'); link('找到我 → ', 'https://github.com/z1cheng', 'github.com/z1cheng'); });
  command('email', '探索', 'email', '给我发封邮件', (args) => { noArgs(args, 'email'); link('邮箱：', 'mailto:imchench@gmail.com', 'imchench@gmail.com'); });
  command('ls', '探索', 'ls', '翻翻虚拟小书架', (args) => { noArgs(args, 'ls'); line(Object.keys(files).join('   ')); });
  command('cat', '探索', 'cat [readme.txt|human.txt|dreams.txt|links.txt]', '读一份文件，不带参数就叫一声猫', (args) => {
    usage(args.length <= 1, 'cat [文件名]');
    if (!args.length) { commands.meow.run([]); return; }
    if (!Object.hasOwn(files, args[0])) throw new Error(`没有这份文件：${args[0]}。输入 ls 看看有哪些。`);
    line(files[args[0]]);
  });
  command('pwd', '探索', 'pwd', '看看自己逛到哪里了', (args) => { noArgs(args, 'pwd'); line('/home/chen（虚拟书架）'); });
  command('tree', '探索', 'tree', '看看书架的目录结构', (args) => { noArgs(args, 'tree'); line('/home/chen\n'+Object.keys(files).map((name, i, all) => `${i === all.length - 1 ? '└──' : '├──'} ${name}`).join('\n')); });
  command('pet', '逗猫', 'pet [head|chin]', '撸猫：head 摸头，chin 挠下巴', (args) => { usage(args.length <= 1 && (!args.length || ['head', 'chin'].includes(args[0])), 'pet [head|chin]'); line(pet(args[0]) ? '呼噜引擎启动，气气很开心。' : '还在呼噜呢，一下下慢慢来。', 'success'); });
  command('feed', '逗猫', 'feed', '喂一条虚拟小鱼干', (args) => { noArgs(args, 'feed'); pet(); say('小鱼干收到，友谊升级。'); line('><(((°>  小鱼干收下了，你很懂猫。', 'success'); });
  command('sleep', '逗猫', 'sleep', '让气气做个好梦', (args) => { noArgs(args, 'sleep'); sleep(); line('打盹模式已开启。输入 wake 或 pet 就能叫醒它。', 'success'); });
  command('wake', '逗猫', 'wake', '轻轻叫醒气气', (args) => { noArgs(args, 'wake'); wake(); line('胡须雷达已上线，欢迎回来。', 'success'); });
  command('status', '逗猫', 'status', '看看气气现在怎么样', (args) => { noArgs(args, 'status'); line(`气气 / 01\n状态：${stateNames[state]}\n已撸：${pats} 次\n梦境：${state === 'sleeping' ? '小鱼干' : '还没入梦'}\n动效：${motion ? '开启' : '关闭'}\n主题：${themeNames[theme]}\n本次停留：${elapsed()}`); });
  command('meow', '逗猫', 'meow', '来一段跨物种交流', (args) => { noArgs(args, 'meow'); line(' /\\_/\\\n( o.o )  喵，你好呀。\n > ^ <', 'success'); say('谁在叫我？'); });
  command('sudo', '逗猫', 'sudo pet', '试着和猫管理员商量一下', (args) => { usage(args.join(' ') === 'pet', 'sudo pet'); line('权限不足。猫不接受人类的命令。\n要不客气一点试试：pet', 'error'); say('在这里，我才是管理员。'); });
  command('date', '工具', 'date', '看看中国现在几点', (args) => { noArgs(args, 'date'); line(`${localDate()} (UTC+8)`); });
  command('time', '工具', 'time', '对比你和我的当地时间', (args) => { noArgs(args, 'time'); line(`我这里  ${localDate()} (UTC+8)\n你那里  ${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'long' }).format(new Date())}`); });
  command('calc', '工具', 'calc (2 + 3) * 4', '口袋计算器（+ - * / % ^）', (args) => { usage(args.length > 0, 'calc (2 + 3) * 4'); line(`= ${calculate(args.join(' '))}`, 'success'); });
  command('echo', '工具', 'echo "你好，世界"', '把你说的话原样显示出来', (args) => line(args.join(' ')));
  command('base64', '工具', 'base64 encode|decode <文本>', 'UTF-8 文本编码 encode / 解码 decode', (args) => {
    usage(args.length >= 2 && ['encode', 'decode'].includes(args[0]), 'base64 encode|decode <文本>');
    const text = args.slice(1).join(' ');
    if (args[0] === 'encode') line(btoa(String.fromCharCode(...new TextEncoder().encode(text))));
    else {
      try { line(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(text), (c) => c.charCodeAt(0)))); }
      catch { throw new Error('Base64 或 UTF-8 文本无效，可以试试 base64 decode aGVsbG8=。'); }
    }
  });
  command('uuid', '工具', 'uuid', '生成一个 UUID v4', (args) => {
    noArgs(args, 'uuid');
    const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    line(`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`);
  });
  command('roll', '工具', 'roll [面数：2–1000]', '掷个骰子，默认六面', (args) => {
    const sides = args.length ? Number(args[0]) : 6;
    usage(args.length <= 1 && Number.isInteger(sides) && sides >= 2 && sides <= 1000, 'roll [面数：2–1000]');
    line(`${sides} 面骰子 → ${1 + Math.floor(Math.random() * sides)}`, 'success');
  });
  command('fortune', '工具', 'fortune', '送给今天的一句话', (args) => { noArgs(args, 'fortune'); line(fortunes[Math.floor(Math.random() * fortunes.length)], 'success'); });
  command('theme', '会话', 'theme [dark|light|auto]', '切换主题：dark 深色 / light 浅色 / auto 跟随系统', (args) => {
    if (!args.length) { line(`主题：${themeNames[theme]}（当前为${themeNames[root.dataset.theme]}）。\n可选：dark 深色、light 浅色、auto 跟随系统。`); return; }
    usage(args.length === 1 && ['dark','light','auto'].includes(args[0]), 'theme [dark|light|auto]');
    theme = args[0]; remember('chen.theme.v1', theme); applyTheme(); line(`主题已设为${themeNames[theme]}。`, 'success');
  });
  command('motion', '会话', 'motion [on|off]', '切换动效：on 开启 / off 关闭', (args) => {
    if (!args.length) { line(`动效：${motion ? '开启' : '关闭'}。`); return; }
    usage(args.length === 1 && ['on','off'].includes(args[0]), 'motion [on|off]');
    motionOverridden = true; motion = args[0] === 'on'; applyMotion(); line(`动效已${motion ? '开启' : '关闭'}。`, 'success');
  });
  command('uptime', '会话', 'uptime', '看看这次待了多久', (args) => { noArgs(args, 'uptime'); line(`这次已经待了 ${elapsed()}，谢谢你多坐一会儿。`); });
  command('history', '会话', 'history', '查看本次访问的命令历史', (args) => { noArgs(args, 'history'); line(history.map((item, i) => `${String(i + 1).padStart(2)}  ${item}`).join('\n')); });
  command('neofetch', '会话', 'neofetch', '一份猫味十足的系统简报', (args) => { noArgs(args, 'neofetch'); line(` /\\_/\\     visitor@chen\n( o.o )    ────────────\n > ^ <     系统     ChenOS / 浏览器小天地\n           主人     陈辰\n           气气     ${stateNames[state]}\n           主题     ${themeNames[theme]}\n           停留     ${elapsed()}\n           燃料     好奇心和小鱼干`, 'success'); });
  command('banner', '会话', 'banner', '重新显示欢迎语', (args) => { noArgs(args, 'banner'); banner(); });
  command('clear', '会话', 'clear', '清空输出', (args) => { noArgs(args, 'clear'); output.replaceChildren(); });
  command('exit', '会话', 'exit', '收起终端，保留命令记录', (args) => { noArgs(args, 'exit'); line('下次见，气气会帮你把座位捂热。'); closeTerminal(); });
  $('command-count').textContent = String(Object.keys(commands).length);

  function execute(raw) {
    const text = raw.trim().slice(0, 512);
    if (!text) return;
    activity(); completion = null;
    line(`visitor@chen ~ ❯ ${text}`, 'command');
    if (history.at(-1) !== text) history.push(text);
    history = history.slice(-MAX_HISTORY); historyIndex = history.length; draft = '';
    try {
      const [name, ...args] = tokenize(text);
      const item = commands[name.toLowerCase()];
      if (!item) {
        const suggestion = Object.keys(commands).find((candidate) => candidate.startsWith(name.toLowerCase().slice(0, 3)));
        throw new Error(`未知命令：${name}。${suggestion ? `你是不是想输入 ${suggestion}？` : ''}\n输入 help 看看可以玩些什么。`);
      }
      item.run(args);
    } catch (error) { line(error.message || '这次没成功，输入 help 看看用法吧。', 'error'); }
  }
  $('terminal-form').addEventListener('submit', (event) => { event.preventDefault(); execute(input.value); input.value = ''; });
  document.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('click', () => {
    execute(button.dataset.command); input.value = '';
    if (matchMedia('(pointer: fine)').matches) focusTerminal();
  }));
  const completions = [
    ...Object.keys(commands), ...Object.keys(files).map((file) => `cat ${file}`),
    'pet head', 'pet chin', 'sudo pet', 'theme dark', 'theme light', 'theme auto', 'motion on', 'motion off',
    'base64 encode', 'base64 decode', ...Object.keys(commands).map((name) => `help ${name}`)
  ];
  input.addEventListener('input', () => { completion = null; });
  input.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key !== 'Tab') completion = null;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (historyIndex === history.length) draft = input.value;
      historyIndex = Math.max(0, Math.min(history.length, historyIndex + (event.key === 'ArrowUp' ? -1 : 1)));
      input.value = historyIndex === history.length ? draft : history[historyIndex];
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (event.key === 'Tab' && !event.shiftKey && input.value.trim()) {
      if (!completion || !completion.matches.includes(input.value)) {
        const prefix = input.value.trimStart().toLowerCase();
        const matches = completions.filter((item) => item.startsWith(prefix));
        // Completing a command name should not also choose all of its arguments.
        const candidates = prefix.includes(' ') ? matches : matches.filter((item) => !item.includes(' '));
        if (!candidates.length) return;
        completion = { matches: candidates, index: -1 };
        if (candidates.length > 1) line(`候选命令：${candidates.join('  ')}（按 Tab 切换）`, 'system');
      }
      event.preventDefault();
      completion.index = (completion.index + 1) % completion.matches.length;
      input.value = completion.matches[completion.index];
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (event.ctrlKey && event.key.toLowerCase() === 'c' && input.selectionStart === input.selectionEnd) {
      event.preventDefault(); line(`visitor@chen ~ ❯ ${input.value} ^C`, 'command'); input.value = ''; historyIndex = history.length; draft = '';
    }
  });

  const clockFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  function updateClock() { const now = new Date(); $('local-time').textContent = clockFormat.format(now); $('local-time').dateTime = now.toISOString(); $('year').textContent = now.getFullYear(); }
  setInterval(() => {
    if (document.hidden) return;
    updateClock();
    if (state === 'happy' && performance.now() >= happyUntil) updateState('awake');
    if (manualSleep || state === 'happy') return;
    const idle = performance.now() - lastActivity;
    if (idle >= 30000 && state !== 'sleeping') sleep(false);
    else if (idle >= 18000 && state === 'awake') { updateState('drowsy'); say('我只是闭目养神一会儿…', 0); }
  }, 1000);
  updateState('awake'); applyMotion(); applyTheme(); updateClock(); banner();
  say(pats ? '你回来啦，我还记得你摸过我。' : '哦，你好呀，人类。', 6000);
})();
