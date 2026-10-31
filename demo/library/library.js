/* Library Home prototype. ES5 so the same code can run on the TV's web engine.
   Apps, inputs and weather are sample data: the TV build reads installed apps and connected sources. */
(function () {
  'use strict';

  var ASSETS = '/home/assets/', ICONS = ASSETS + 'icons/';
  var KEYS = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'ok', 27: 'back', 8: 'back', 10009: 'back', 461: 'back' };
  var KEY_AMBIENT = 65, KEY_HINTS = 72;

  // Stage geometry, in 1920 x 1080 pixels. Favourites and library share the same six columns.
  var TILE_W = 250, TILE_H = 150, PITCH = 278, COLS = 6, GRID_LEFT = 140;
  var DOCK_TOP = 724, DOCK_H = 206, LIB_TOP = 1002, ROW_PITCH = 222;
  var LIB_SCROLL = -540, LABEL_GAP = 22, LABEL_BOTTOM = 1048, TOP_EDGE = 150;

  var FAVOURITES = [
    { name: 'Netflix', mark: 'netflix', bg: '#000', ink: '#e50914' },
    { name: 'YouTube', mark: 'youtube', bg: '#fff', ink: '#ff0033' },
    { name: 'Disney+', mark: 'disneyplus', bg: 'linear-gradient(160deg,#1d3a8f,#0a1236 75%)', ink: '#fff' },
    { name: 'HBO Max', mark: 'hbomax', bg: '#0b25cf', ink: '#fff' },
    { name: 'Prime Video', mark: 'primevideo', bg: '#1a98ff', ink: '#fff' },
    { name: 'Apple TV', mark: 'appletv', bg: '#000', ink: '#fff' }
  ];
  var LIBRARY = [
    { name: 'Apple Music', mark: 'applemusic', bg: 'linear-gradient(160deg,#fb5c74,#fa233b)', ink: '#fff' },
    { name: 'Crunchyroll', bg: '#f47521', ink: '#fff' },
    { name: 'ESPN', bg: '#1d1d1f', ink: '#ff2a3b' },
    { name: 'Hulu', bg: '#1ce783', ink: '#0b0c0f' },
    { name: 'Jellyfin', bg: 'linear-gradient(160deg,#aa5cc3,#00a4dc)', ink: '#fff' },
    { name: 'Paramount+', bg: '#0064ff', ink: '#fff' },
    { name: 'PBS', bg: '#2638c4', ink: '#fff' },
    { name: 'Peacock', bg: '#000', ink: '#fff' },
    { name: 'Plex', bg: '#1f2326', ink: '#e5a00d' },
    { name: 'Pluto TV', bg: '#fff200', ink: '#000' },
    { name: 'Spotify', mark: 'spotify', bg: '#121212', ink: '#1ed760' },
    { name: 'Stremio', mark: 'stremio', bg: '#19122f', ink: '#8a5cf6' },
    { name: 'Tubi', mark: 'tubi', bg: '#7408ff', ink: '#ffff13' },
    { name: 'Twitch', bg: '#9146ff', ink: '#fff' },
    { name: 'YouTube TV', bg: '#fff', ink: '#ff0033' }
  ];
  var INPUTS = [
    { port: 'HDMI 1', name: 'PlayStation 5' },
    { port: 'HDMI 2', name: 'Mac mini' },
    { port: 'HDMI 3', name: 'Nothing connected', empty: true },
    { port: 'Samsung', name: 'Source list', list: true }
  ];
  var TABS = ['Home', 'Inputs'];
  var SLEEP = ['Off', '30 min', '1 hour', '90 min', '2 hours'];
  var AMBIENT = [{ name: 'After 1 min', ms: 60000 }, { name: 'After 5 min', ms: 300000 }, { name: 'After 15 min', ms: 900000 }, { name: 'Off', ms: 0 }];
  var WALLS = window.CleanFrameWallpapers || [];
  var ROWS = chunk(LIBRARY, COLS);

  var S = { tab: 0, zone: 'fav', nav: 0, fav: 0, lr: 0, lc: 0, inp: 0, panel: 0, dialog: 0, glassTiles: false, wall: 0, sleep: 0, amb: 0, ambient: false, scroll: 0 };
  var SETTINGS = [
    { label: 'Sleep timer', value: function () { return SLEEP[S.sleep]; }, ok: function () { S.sleep = (S.sleep + 1) % SLEEP.length; } },
    { label: 'Wallpaper', value: function () { return WALLS[S.wall] ? WALLS[S.wall].name : ''; }, ok: function () { setWall(S.wall + 1); } },
    { label: 'App tiles', value: function () { return S.glassTiles ? 'Glass' : 'Color'; }, ok: function () { S.glassTiles = !S.glassTiles; } },
    { label: 'Ambient mode', value: function () { return AMBIENT[S.amb].name; }, ok: function () { S.amb = (S.amb + 1) % AMBIENT.length; armIdle(); } },
    { label: 'Picture and sound', value: function () { return 'Samsung'; }, ok: function () { toast('On the TV, this opens Samsung’s picture and sound settings.'); } },
    { label: 'Samsung Home', value: function () { return ''; }, ok: function () { toast('On the TV, this opens Samsung Home.'); } }
  ];

  var stage = $('stage'), page = $('page'), dock = $('dock'), dockGlass = $('dockGlass'), library = $('library');
  var favRow = $('favRow'), inRow = $('inRow'), focusName = $('focusName'), gear = $('gear'), toastEl = $('toast');
  var timeEl = $('time'), ambTime = $('ambTime'), ambTitle = $('ambTitle'), ambCredit = $('ambCredit'), ambDrift = $('ambDrift');
  var front = $('photoA'), back = $('photoB'), blurImg = $('blur');
  var pills, panelRows, dialogBtns, focused = null, credits = {}, wallToken = 0;
  var idleTimer = null, driftTimer = null, rotateTimer = null, toastTimer = null;

  function $(id) { return document.getElementById(id); }
  function chunk(list, n) { var out = [], i; for (i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toggle(el, cls, on) { if (on) el.classList.add(cls); else el.classList.remove(cls); }

  // ---------- Markup ----------

  // Optical sizing from CleanFrame: each mark is scaled by its measured ink so dense and light marks look equal.
  function markHtml(id) {
    var w = 172, h = 92, size = 100, m = window.FrameIconMetrics && window.FrameIconMetrics[id], st, k, s;
    if (m) {
      k = Math.min(w / m.w, h / m.h, size * clamp(Math.pow(0.45 / m.fill, 0.3), 0.84, 1.25) / Math.sqrt(m.w * m.h));
      s = m.n * k;
      st = 'width:' + s.toFixed(1) + 'px;height:' + s.toFixed(1) + 'px;left:' + (w / 2 - (m.x + m.w / 2) * k).toFixed(1) + 'px;top:' + (h / 2 - (m.y + m.h / 2) * k).toFixed(1) + 'px';
    } else st = 'width:' + w + 'px;height:' + h + 'px;left:0;top:0';
    return '<span class="mark"><span class="mk" style="' + st + ';-webkit-mask-image:url(' + ICONS + id + '.svg);mask-image:url(' + ICONS + id + '.svg)"></span></span>';
  }
  function appHtml(a, zone, i, col) {
    return '<div class="tile" data-z="' + zone + '" data-i="' + i + '" style="left:' + col * PITCH + 'px;--mk:' + a.ink + '">'
      + '<div class="t-face" style="background:' + a.bg + '">' + (a.mark ? markHtml(a.mark) : '<span class="t-text">' + esc(a.name) + '</span>') + '</div></div>';
  }
  function inputHtml(s, i) {
    return '<div class="tile in-tile' + (s.empty ? ' is-empty' : '') + '" data-z="inputs" data-i="' + i + '" style="left:' + i * PITCH + 'px">'
      + '<div class="t-face"><span class="in-port">' + esc(s.port) + '</span><span class="in-name">' + esc(s.name) + '</span></div></div>';
  }
  function build() {
    favRow.innerHTML = FAVOURITES.map(function (a, i) { return appHtml(a, 'fav', i, i); }).join('');
    inRow.innerHTML = INPUTS.map(inputHtml).join('');
    library.innerHTML = ROWS.map(function (row, r) {
      return '<div class="lib-row" style="top:' + r * ROW_PITCH + 'px">' + row.map(function (a, c) { return appHtml(a, 'lib', r * COLS + c, c); }).join('') + '</div>';
    }).join('');
    $('pills').innerHTML = TABS.map(function (t, i) { return '<div class="pill" data-z="nav" data-i="' + i + '">' + t + '</div>'; }).join('');
    $('panelRows').innerHTML = SETTINGS.map(function (s, i) { return '<div class="p-row" data-z="panel" data-i="' + i + '"><span class="p-label">' + s.label + '</span><span class="p-value"></span></div>'; }).join('');
    pills = $('pills').children;
    panelRows = $('panelRows').children;
    dialogBtns = $('dialogActions').children;
  }

  // Each glass layer shows the part of the pre-blurred photo directly behind it.
  function stagePos(el) { var x = 0, y = 0; while (el && el !== stage) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; } return { x: x, y: y }; }
  function registerGlass() {
    var list = stage.querySelectorAll('.glass'), i, p, img;
    for (i = 0; i < list.length; i++) {
      p = stagePos(list[i]); img = list[i].querySelector('.glass-img');
      img.style.left = -p.x + 'px'; img.style.top = -p.y + 'px';
    }
  }

  // ---------- Rendering ----------

  function focusEl() {
    switch (S.zone) {
      case 'nav': return pills[S.nav];
      case 'gear': return gear;
      case 'fav': return favRow.children[S.fav];
      case 'lib': return library.children[S.lr].children[S.lc];
      case 'inputs': return inRow.children[S.inp];
      case 'panel': return panelRows[S.panel];
      default: return dialogBtns[S.dialog];
    }
  }
  function libScroll(r) { return Math.min(LIB_SCROLL, LABEL_BOTTOM - (TILE_H + LABEL_GAP + 36) - (LIB_TOP + r * ROW_PITCH)); }
  function scrollTo(t) {
    var r;
    if (t === S.scroll) return;
    S.scroll = t;
    page.style.transform = 'translate3d(0,' + t + 'px,0)';
    dockGlass.style.transform = 'translate3d(0,' + (-t) + 'px,0)';
    toggle(dock, 'is-above', t < LIB_SCROLL);
    for (r = 0; r < ROWS.length; r++) toggle(library.children[r], 'is-above', LIB_TOP + r * ROW_PITCH + t < TOP_EDGE);
  }
  function label() {
    var a = null, x = 0, y = 0;
    if (S.zone === 'fav') { a = FAVOURITES[S.fav]; x = GRID_LEFT + S.fav * PITCH; y = DOCK_TOP + DOCK_H + 14; }
    else if (S.zone === 'lib') { a = ROWS[S.lr][S.lc]; x = GRID_LEFT + S.lc * PITCH; y = LIB_TOP + S.lr * ROW_PITCH + TILE_H + LABEL_GAP; }
    toggle(focusName, 'is-on', !!a);
    if (!a) return;
    focusName.textContent = a.name;
    focusName.style.transform = 'translate3d(' + (x + TILE_W / 2 - 210) + 'px,' + y + 'px,0)';
  }
  function render() {
    var el = focusEl(), i;
    if (focused !== el) {
      if (focused) focused.classList.remove('is-focus');
      el.classList.add('is-focus');
      focused = el;
    }
    for (i = 0; i < pills.length; i++) toggle(pills[i], 'is-active', i === S.tab);
    for (i = 0; i < panelRows.length; i++) panelRows[i].lastChild.textContent = SETTINGS[i].value();
    toggle(stage, 'tab-inputs', S.tab === 1);
    toggle(stage, 'is-library', S.zone === 'lib');
    toggle(stage, 'is-panel', S.zone === 'panel');
    toggle(stage, 'is-dialog', S.zone === 'dialog');
    toggle(stage, 'tiles-glass', S.glassTiles);
    scrollTo(S.zone === 'lib' ? libScroll(S.lr) : 0);
    label();
  }

  // ---------- Remote ----------

  function content() { return S.tab === 0 ? 'fav' : 'inputs'; }
  function rowLen(r) { return ROWS[r].length; }
  function act(k) {
    switch (S.zone) {
      case 'nav':
        if (k === 'left') S.nav = Math.max(0, S.nav - 1);
        else if (k === 'right') { if (S.nav < TABS.length - 1) S.nav++; else S.zone = 'gear'; }
        else if (k === 'down' || k === 'back') S.zone = content();
        else if (k === 'ok') S.tab = S.nav;
        break;
      case 'gear':
        if (k === 'left') { S.zone = 'nav'; S.nav = TABS.length - 1; }
        else if (k === 'down' || k === 'back') S.zone = content();
        else if (k === 'ok') { S.zone = 'panel'; S.panel = 0; }
        break;
      case 'fav':
        if (k === 'left') S.fav = Math.max(0, S.fav - 1);
        else if (k === 'right') S.fav = Math.min(FAVOURITES.length - 1, S.fav + 1);
        else if (k === 'up') { S.zone = 'nav'; S.nav = S.tab; }
        else if (k === 'down' && ROWS.length) { S.zone = 'lib'; S.lr = 0; S.lc = Math.min(S.fav, rowLen(0) - 1); }
        else if (k === 'ok') launch(focused, FAVOURITES[S.fav].name);
        else if (k === 'back') { S.zone = 'dialog'; S.dialog = 0; }
        break;
      case 'lib':
        if (k === 'left') S.lc = Math.max(0, S.lc - 1);
        else if (k === 'right') S.lc = Math.min(rowLen(S.lr) - 1, S.lc + 1);
        else if (k === 'up' && S.lr === 0) { S.zone = 'fav'; S.fav = Math.min(S.lc, FAVOURITES.length - 1); }
        else if (k === 'up') { S.lr--; S.lc = Math.min(S.lc, rowLen(S.lr) - 1); }
        else if (k === 'down' && S.lr < ROWS.length - 1) { S.lr++; S.lc = Math.min(S.lc, rowLen(S.lr) - 1); }
        else if (k === 'ok') launch(focused, ROWS[S.lr][S.lc].name);
        else if (k === 'back') { S.zone = 'fav'; S.fav = Math.min(S.lc, FAVOURITES.length - 1); }
        break;
      case 'inputs':
        if (k === 'left') S.inp = Math.max(0, S.inp - 1);
        else if (k === 'right') S.inp = Math.min(INPUTS.length - 1, S.inp + 1);
        else if (k === 'up') { S.zone = 'nav'; S.nav = S.tab; }
        else if (k === 'ok') chooseInput(INPUTS[S.inp]);
        else if (k === 'back') { S.tab = 0; S.zone = 'fav'; }
        break;
      case 'panel':
        if (k === 'up') S.panel = Math.max(0, S.panel - 1);
        else if (k === 'down') S.panel = Math.min(SETTINGS.length - 1, S.panel + 1);
        else if (k === 'ok') SETTINGS[S.panel].ok();
        else if (k === 'back' || k === 'left') S.zone = 'gear';
        break;
      case 'dialog':
        if (k === 'left') S.dialog = 0;
        else if (k === 'right') S.dialog = 1;
        else if (k === 'back') S.zone = 'fav';
        else if (k === 'ok') { if (S.dialog === 1) toast('On the TV, this opens Samsung Home.'); S.zone = 'fav'; }
        break;
    }
    render();
  }
  function launch(tile, name) {
    tile.classList.remove('is-press');
    void tile.offsetWidth;
    tile.classList.add('is-press');
    toast('Opening ' + name + '. On the TV, this launches the app.');
  }
  function chooseInput(s) {
    if (s.empty) toast('Nothing is connected to ' + s.port + '.');
    else if (s.list) toast('On the TV, this opens Samsung’s source list.');
    else toast('On the TV, this switches to ' + s.name + ' on ' + s.port + '.');
  }
  function toast(text) {
    toastEl.firstChild.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2800);
  }

  // ---------- Wallpaper ----------

  function preload(urls, done) {
    var left = urls.length;
    urls.forEach(function (u) {
      var im = new Image();
      im.onload = im.onerror = function () { if (--left === 0) done(); };
      im.src = u;
    });
  }
  function setWall(i) {
    var w, base, token;
    if (!WALLS.length) return;
    i = (i % WALLS.length + WALLS.length) % WALLS.length;
    w = WALLS[i]; base = ASSETS + 'materials/' + w.id; token = ++wallToken;
    var urls = { photo: ASSETS + 'wallpapers/' + w.id + '.jpg', blur: base + '-field-blur.jpg', frost: base + '-field-frost.jpg', soft: base + '-study-soft.jpg' };
    preload([urls.photo, urls.blur, urls.frost, urls.soft], function () {
      var glass = stage.querySelectorAll('.glass-img'), n, swap;
      if (token !== wallToken) return;
      S.wall = i;
      back.src = urls.photo;
      back.classList.add('is-front');
      front.classList.remove('is-front');
      swap = front; front = back; back = swap;
      blurImg.src = urls.blur;
      for (n = 0; n < glass.length; n++) glass[n].src = urls[glass[n].getAttribute('data-material')];
      ambTitle.textContent = w.name;
      ambCredit.textContent = credits[w.id] ? 'Photograph by ' + credits[w.id] : '';
      render();
    });
  }
  function loadCredits(done) {
    var xhr = new XMLHttpRequest();
    xhr.onload = xhr.onerror = function () {
      try { JSON.parse(xhr.responseText).forEach(function (s) { credits[s.id] = s.credit; }); } catch (e) { /* Captions fall back to the photo name. */ }
      done();
    };
    xhr.open('GET', ASSETS + 'wallpapers/SOURCES.json');
    xhr.send();
  }

  // ---------- Clock and ambient mode ----------

  function tick() {
    var d = new Date(), h = d.getHours(), m = d.getMinutes(), hm = (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m;
    timeEl.innerHTML = hm + '<span class="mer">' + (h < 12 ? 'AM' : 'PM') + '</span>';
    ambTime.textContent = hm;
  }
  function armIdle() {
    clearTimeout(idleTimer);
    if (AMBIENT[S.amb].ms && !S.ambient) idleTimer = setTimeout(enterAmbient, AMBIENT[S.amb].ms);
  }
  // A slow drift keeps the clock and caption from burning a fixed shape into the OLED panel.
  function drift() { ambDrift.style.transform = 'translate3d(' + Math.round(Math.random() * 48 - 24) + 'px,' + Math.round(Math.random() * 28 - 14) + 'px,0)'; }
  function enterAmbient() {
    if (S.ambient) return;
    if (S.zone === 'panel') S.zone = 'gear';
    if (S.zone === 'dialog') S.zone = 'fav';
    S.ambient = true;
    clearTimeout(idleTimer);
    render();
    stage.classList.add('is-ambient');
    driftTimer = setInterval(drift, 20000);
    rotateTimer = setInterval(function () { setWall(S.wall + 1); }, 40000);
  }
  function exitAmbient() {
    S.ambient = false;
    stage.classList.remove('is-ambient');
    clearInterval(driftTimer);
    clearInterval(rotateTimer);
    ambDrift.style.transform = '';
    armIdle();
  }

  // ---------- Input ----------

  document.addEventListener('keydown', function (e) {
    var k = KEYS[e.keyCode];
    if (e.keyCode === KEY_HINTS) { $('hints').classList.toggle('is-off'); return; }
    if (S.ambient) { e.preventDefault(); if (!e.repeat) exitAmbient(); return; }
    if (e.keyCode === KEY_AMBIENT) { enterAmbient(); return; }
    if (!k) return;
    e.preventDefault();
    armIdle();
    if (e.repeat && (k === 'ok' || k === 'back')) return;
    act(k);
  });
  stage.addEventListener('click', function (e) {
    var el = e.target, z, i;
    if (S.ambient) { exitAmbient(); return; }
    armIdle();
    while (el && el !== stage && !el.getAttribute('data-z')) el = el.parentNode;
    if (!el || el === stage) return;
    z = el.getAttribute('data-z'); i = +el.getAttribute('data-i');
    if ((z === 'panel' && S.zone !== 'panel') || (z === 'dialog' && S.zone !== 'dialog')) return;
    if (z === 'nav') S.nav = i;
    else if (z === 'fav') S.fav = i;
    else if (z === 'lib') { S.lr = Math.floor(i / COLS); S.lc = i % COLS; }
    else if (z === 'inputs') S.inp = i;
    else if (z === 'panel') S.panel = i;
    else if (z === 'dialog') S.dialog = i;
    S.zone = z;
    render();
    act('ok');
  });

  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    if (!s) return; // A hidden preview reports a 0 x 0 window; the next resize fits it.
    stage.style.transform = 'scale(' + s + ')';
    stage.style.left = (window.innerWidth - 1920 * s) / 2 + 'px';
    stage.style.top = (window.innerHeight - 1080 * s) / 2 + 'px';
  }

  function start() {
    var want = /[?&]wall=([a-z]+)/.exec(window.location.search), first = 0, i;
    for (i = 0; i < WALLS.length; i++) if (WALLS[i].id === (want ? want[1] : 'valley')) first = i;
    build();
    fit();
    tick();
    render();
    registerGlass();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(registerGlass);
    loadCredits(function () { setWall(first); });
    setInterval(tick, 5000);
    armIdle();
    stage.focus();
    window.addEventListener('resize', fit);
  }
  start();
}());
