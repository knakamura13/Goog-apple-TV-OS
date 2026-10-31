/* Library Home prototype. ES5 so the same code can run on the TV's web engine.
   Apps, inputs and weather are sample data: the TV build reads installed apps and connected sources. */
(function () {
  'use strict';

  var ASSETS = '/home/assets/', ICONS = ASSETS + 'icons/';
  var KEYS = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'ok', 27: 'back', 8: 'back', 10009: 'back', 461: 'back' };
  var KEY_AMBIENT = 65, KEY_HINTS = 72;

  // Stage geometry in 1920 x 1080 pixels, proportioned after the tvOS Home screen.
  // Favourites and library share six columns starting at the 90px side margin.
  var TILE_W = 250, TILE_H = 150, TILE_R = 32, PITCH = 298, COLS = 6, GRID_LEFT = 90;
  var DOCK_W = 1824, DOCK_H = 230, DOCK_R = 56, DOCK_TOP = 762;
  var LIB_TOP = 1035, ROW_PITCH = 236, LABEL_GAP = 24, LABEL_H = 36, ROW_SPAN = TILE_H + LABEL_GAP + LABEL_H;
  var TOP_LINE = 152, SAFE_BOTTOM = 1026, TOP_EDGE = 140;
  var SHALLOW = TOP_LINE - DOCK_TOP; // The dock sits just below the top bar while the first library rows show.
  var DEEP_ROWS = Math.floor((SAFE_BOTTOM - TOP_LINE - ROW_SPAN) / ROW_PITCH) + 1; // Rows that fit once the dock scrolls away.
  var PANEL = { w: 700, h: 896, r: 48 }, DIALOG = { w: 840, h: 340, r: 48 };
  var PILL_W = 150, PANEL_PITCH = 96, DIALOG_PITCH = 316, SMOOTHING = 0.6;

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
    { port: 'HDMI 3', name: 'No device', empty: true },
    { port: 'Samsung', name: 'Source list', list: true }
  ];
  var TABS = ['Home', 'Inputs'];
  var SLEEP = ['Off', '30 min', '1 hour', '90 min', '2 hours'];
  var AMBIENT = [{ name: 'After 1 min', ms: 60000 }, { name: 'After 5 min', ms: 300000 }, { name: 'After 15 min', ms: 900000 }, { name: 'Off', ms: 0 }];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WALLS = window.CleanFrameWallpapers || [];
  var ROWS = chunk(LIBRARY, COLS);

  var S = { tab: 0, zone: 'fav', nav: 0, fav: 0, lr: 0, lc: 0, inp: 0, panel: 0, dialog: 0, glassTiles: false, wall: 0, homeWall: 0, sleep: 0, amb: 1, ambient: false, scroll: 0 };
  var SETTINGS = [
    { label: 'Sleep timer', value: function () { return SLEEP[S.sleep]; }, ok: function () { S.sleep = (S.sleep + 1) % SLEEP.length; } },
    { label: 'Wallpaper', value: function () { return WALLS[S.wall] ? WALLS[S.wall].name : ''; }, ok: function () { setWall(S.wall + 1); } },
    { label: 'App tiles', value: function () { return S.glassTiles ? 'Glass' : 'Color'; }, ok: function () { S.glassTiles = !S.glassTiles; } },
    { label: 'Screensaver', value: function () { return AMBIENT[S.amb].name; }, ok: function () { S.amb = (S.amb + 1) % AMBIENT.length; armIdle(); } },
    { label: 'Picture and sound', value: function () { return 'Samsung'; }, ok: function () { toast('Opens Samsung’s picture and sound settings on the TV.'); } },
    { label: 'Samsung Home', value: function () { return ''; }, ok: function () { toast('Opens Samsung Home on the TV.'); } }
  ];

  var stage = $('stage'), page = $('page'), dock = $('dock'), dockLayer = $('dockLayer'), library = $('library');
  var favRow = $('favRow'), inRow = $('inRow'), focusName = $('focusName'), gear = $('gear'), toastEl = $('toast'), panelStatus = $('panelStatus');
  var navActive = $('navActive'), navFocus = $('navFocus'), panelInd = $('panelInd'), dialogInd = $('dialogInd');
  var navInk = $('navInk'), panelInk = $('panelInk'), dialogInk = $('dialogInk');
  var timeEl = $('time'), statusEl = stage.querySelector('.status'), ambTime = $('ambTime'), ambDate = $('ambDate'), ambTitle = $('ambTitle'), ambCredit = $('ambCredit'), ambDrift = $('ambDrift');
  var front = $('photoA'), back = $('photoB'), blurImg = $('blur');
  var pills, panelRows, dialogBtns, tileRim = '', focused = null, lastZone = null, credits = {}, wallToken = 0, statusWidth = 0;
  var idleTimer = null, driftTimer = null, rotateTimer = null, toastTimer = null;

  function $(id) { return document.getElementById(id); }
  function chunk(list, n) { var out = [], i; for (i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toggle(el, cls, on) { if (on) el.classList.add(cls); else el.classList.remove(cls); }
  function n2(v) { return Math.round(v * 100) / 100; }

  // ---------- Squircles ----------

  // Continuous-curvature rounded rectangle, after Figma's corner smoothing (as used for Apple's icon shapes).
  // A plain arc covers the middle of each corner; Bezier segments ease into the straight edges.
  function squircle(w, h, r, smoothing) {
    var rad = Math.PI / 180, budget = Math.min(w, h) / 2, s, p, arcDeg, L, c, d, b, a, A, AB, ABC, C, D, BC, R;
    r = Math.min(r, budget);
    s = Math.min(smoothing, Math.max(0, budget / r - 1));
    p = Math.min((1 + s) * r, budget);
    arcDeg = 90 * (1 - s);
    L = Math.sin(arcDeg / 2 * rad) * r * Math.SQRT2;
    c = r * Math.tan((90 - arcDeg) / 4 * rad) * Math.cos(45 * s * rad);
    d = c * Math.tan(45 * s * rad);
    b = (p - L - c - d) / 3;
    a = 2 * b;
    A = n2(a); AB = n2(a + b); ABC = n2(a + b + c); C = n2(c); D = n2(d); BC = n2(b + c); R = n2(r); L = n2(L);
    return 'M' + n2(w - p) + ' 0'
      + 'c' + A + ' 0 ' + AB + ' 0 ' + ABC + ' ' + D + 'a' + R + ' ' + R + ' 0 0 1 ' + L + ' ' + L + 'c' + D + ' ' + C + ' ' + D + ' ' + BC + ' ' + D + ' ' + ABC
      + 'L' + w + ' ' + n2(h - p)
      + 'c0 ' + A + ' 0 ' + AB + ' ' + (-D) + ' ' + ABC + 'a' + R + ' ' + R + ' 0 0 1 ' + (-L) + ' ' + L + 'c' + (-C) + ' ' + D + ' ' + (-BC) + ' ' + D + ' ' + (-ABC) + ' ' + D
      + 'L' + n2(p) + ' ' + h
      + 'c' + (-A) + ' 0 ' + (-AB) + ' 0 ' + (-ABC) + ' ' + (-D) + 'a' + R + ' ' + R + ' 0 0 1 ' + (-L) + ' ' + (-L) + 'c' + (-D) + ' ' + (-C) + ' ' + (-D) + ' ' + (-BC) + ' ' + (-D) + ' ' + (-ABC)
      + 'L0 ' + n2(p)
      + 'c0 ' + (-A) + ' 0 ' + (-AB) + ' ' + D + ' ' + (-ABC) + 'a' + R + ' ' + R + ' 0 0 1 ' + L + ' ' + (-L) + 'c' + C + ' ' + (-D) + ' ' + BC + ' ' + (-D) + ' ' + ABC + ' ' + (-D)
      + 'Z';
  }
  function maskUrl(w, h, path) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><path d="' + path + '"/></svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }
  function shape(name, w, h, r, rimId) {
    var path = squircle(w, h, r, SMOOTHING), rim = rimId && $(rimId);
    stage.style.setProperty('--' + name + '-mask', maskUrl(w, h, path));
    if (rim) { rim.setAttribute('viewBox', '0 0 ' + w + ' ' + h); rim.innerHTML = '<path d="' + path + '"/>'; }
    return path;
  }

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
  function tileHtml(cls, zone, i, col, style, inner, faceStyle) {
    return '<div class="tile' + cls + '" data-z="' + zone + '" data-i="' + i + '" style="left:' + col * PITCH + 'px;' + style + '">'
      + '<div class="t-face squircle"' + (faceStyle ? ' style="' + faceStyle + '"' : '') + '>' + inner + '<div class="t-sheen"></div><div class="t-glow"></div>' + tileRim + '</div></div>';
  }
  function appHtml(a, zone, i, col) {
    return tileHtml('', zone, i, col, '--mk:' + a.ink, a.mark ? markHtml(a.mark) : '<span class="t-text">' + esc(a.name) + '</span>', 'background:' + a.bg);
  }
  function inputHtml(s, i) {
    return tileHtml(' in-tile' + (s.empty ? ' is-empty' : ''), 'inputs', i, i, '', '<span class="in-port">' + esc(s.port) + '</span><span class="in-name">' + esc(s.name) + '</span>', '');
  }
  function build() {
    tileRim = '<svg class="rim" viewBox="0 0 ' + TILE_W + ' ' + TILE_H + '" aria-hidden="true"><path d="' + shape('tile', TILE_W, TILE_H, TILE_R) + '"/></svg>';
    shape('dock', DOCK_W, DOCK_H, DOCK_R, 'dockRim');
    shape('panel', PANEL.w, PANEL.h, PANEL.r, 'panelRim');
    shape('dialog', DIALOG.w, DIALOG.h, DIALOG.r, 'dialogRim');
    favRow.innerHTML = FAVOURITES.map(function (a, i) { return appHtml(a, 'fav', i, i); }).join('');
    inRow.innerHTML = INPUTS.map(inputHtml).join('');
    library.innerHTML = ROWS.map(function (row, r) {
      return '<div class="lib-row" style="top:' + r * ROW_PITCH + 'px">' + row.map(function (a, c) { return appHtml(a, 'lib', r * COLS + c, c); }).join('') + '</div>';
    }).join('');
    $('pills').innerHTML = TABS.map(function (t, i) { return '<div class="pill" data-z="nav" data-i="' + i + '">' + t + '</div>'; }).join('');
    navInk.innerHTML = TABS.map(function (t) { return '<div class="pill">' + t + '</div>'; }).join('');
    $('panelRows').innerHTML = SETTINGS.map(function (s, i) { return '<div class="p-row" data-z="panel" data-i="' + i + '"><span class="p-label">' + s.label + '</span><span class="p-value"></span></div>'; }).join('');
    panelInk.innerHTML = SETTINGS.map(function (s) { return '<div class="p-row"><span class="p-label">' + s.label + '</span><span class="p-value"></span></div>'; }).join('');
    pills = $('pills').children;
    panelRows = $('panelRows').children;
    dialogBtns = stage.querySelectorAll('.d-actions > .d-btn');
  }

  // Each glass layer shows the part of the photo directly behind its element.
  function stagePos(el) { var x = 0, y = 0; while (el && el !== stage) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; } return { x: x, y: y }; }
  function registerGlass() {
    var list = stage.querySelectorAll('.glass'), i, p, layer;
    for (i = 0; i < list.length; i++) {
      p = stagePos(list[i]); layer = list[i].querySelector('.glass-layer');
      layer.style.left = -p.x + 'px'; layer.style.top = -p.y + 'px';
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
  // A selection indicator slides to its new item; it jumps without animating when focus first enters its group.
  // Its dark-ink label copy moves the opposite way on the same curve, so the labels appear to stay still.
  function place(el, ink, x, y, instant) {
    var both = ink ? [el, ink] : [el], i;
    for (i = 0; i < both.length && instant; i++) both[i].style.transition = 'none';
    el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    if (ink) ink.style.transform = 'translate3d(' + (-x) + 'px,' + (-y) + 'px,0)';
    if (!instant) return;
    void el.offsetWidth;
    for (i = 0; i < both.length; i++) both[i].style.transition = '';
  }
  function rowTop(r) { return LIB_TOP + r * ROW_PITCH; }
  function libScroll(r) {
    if (rowTop(r) + SHALLOW + ROW_SPAN <= SAFE_BOTTOM) return SHALLOW;
    return TOP_LINE - rowTop(Math.max(0, r - DEEP_ROWS + 1));
  }
  function scrollTo(t) {
    var r;
    if (t === S.scroll) return;
    S.scroll = t;
    page.style.transform = 'translate3d(0,' + t + 'px,0)';
    dockLayer.style.transform = 'translate3d(0,' + (-t) + 'px,0)';
    toggle(dock, 'is-above', t < SHALLOW);
    for (r = 0; r < ROWS.length; r++) toggle(library.children[r], 'is-above', rowTop(r) + t < TOP_EDGE);
  }
  function label() {
    var on = S.zone === 'lib', a, x;
    toggle(focusName, 'is-on', on);
    if (!on) return;
    a = ROWS[S.lr][S.lc];
    x = GRID_LEFT + S.lc * PITCH + TILE_W / 2 - 210;
    focusName.textContent = a.name;
    focusName.style.transform = 'translate3d(' + x + 'px,' + (rowTop(S.lr) + TILE_H + LABEL_GAP) + 'px,0)';
  }
  function render() {
    var el = focusEl(), entered = S.zone !== lastZone, i;
    if (focused !== el) {
      if (focused) focused.classList.remove('is-focus');
      el.classList.add('is-focus');
      focused = el;
    }
    for (i = 0; i < pills.length; i++) toggle(pills[i], 'is-active', i === S.tab);
    for (i = 0; i < panelRows.length; i++) panelRows[i].lastChild.textContent = panelInk.children[i].lastChild.textContent = SETTINGS[i].value();
    place(navActive, null, S.tab * PILL_W, 0, false);
    if (S.zone === 'nav') place(navFocus, navInk, S.nav * PILL_W, 0, entered);
    if (S.zone === 'panel') place(panelInd, panelInk, 0, S.panel * PANEL_PITCH, entered);
    if (S.zone === 'dialog') place(dialogInd, dialogInk, S.dialog * DIALOG_PITCH, 0, entered);
    toggle(navFocus, 'is-on', S.zone === 'nav');
    toggle(stage, 'tab-inputs', S.tab === 1);
    toggle(stage, 'is-library', S.zone === 'lib');
    toggle(stage, 'is-panel', S.zone === 'panel');
    toggle(stage, 'is-dialog', S.zone === 'dialog');
    toggle(stage, 'tiles-glass', S.glassTiles);
    scrollTo(S.zone === 'lib' ? libScroll(S.lr) : 0);
    label();
    lastZone = S.zone;
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
        else if (k === 'ok') { if (S.dialog === 1) toast('Opens Samsung Home on the TV.'); S.zone = 'fav'; }
        break;
    }
    render();
  }
  function launch(tile, name) {
    tile.classList.remove('is-press');
    void tile.offsetWidth;
    tile.classList.add('is-press');
    toast('Opens ' + name + ' on the TV.');
  }
  function chooseInput(s) {
    if (s.empty) toast('Nothing is connected to ' + s.port + '.');
    else if (s.list) toast('Opens Samsung’s source list on the TV.');
    else toast('Switches to ' + s.name + ' (' + s.port + ') on the TV.');
  }
  // Messages appear inside the settings panel while it is open, so they never cover it.
  function toast(text) {
    var el = S.zone === 'panel' ? panelStatus : toastEl;
    (el === toastEl ? toastEl.firstChild : el).textContent = text;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); panelStatus.classList.remove('is-on'); }, 2800);
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
  function photoClasses(w) {
    var keep = [], i;
    for (i = 0; i < stage.classList.length; i++) if (stage.classList[i].indexOf('tone-') !== 0) keep.push(stage.classList[i]);
    keep.push('tone-' + (w.tone || 'dark'));
    stage.className = keep.join(' ');
    // CleanFrame's per-photo frost veil sets how much the glass tint must darken to keep text readable.
    stage.style.setProperty('--tint', (0.26 + (w.frostVeil || 0.12) * 0.6).toFixed(3));
    stage.style.setProperty('--dock-tint', (0.20 + (w.frostVeil || 0.12) * 0.5).toFixed(3));
  }
  function setWall(i) {
    var w, base, urls, token;
    if (!WALLS.length) return;
    i = (i % WALLS.length + WALLS.length) % WALLS.length;
    w = WALLS[i]; base = ASSETS + 'materials/' + w.id; token = ++wallToken;
    urls = { photo: ASSETS + 'wallpapers/' + w.id + '.jpg', clear: base + '-field-clear.jpg', blur: base + '-field-blur.jpg', frost: base + '-field-frost.jpg' };
    preload([urls.photo, urls.clear, urls.blur, urls.frost], function () {
      var glass = stage.querySelectorAll('.glass-img'), n, swap;
      if (token !== wallToken) return;
      S.wall = i;
      back.src = urls.photo;
      back.classList.add('is-front');
      front.classList.remove('is-front');
      swap = front; front = back; back = swap;
      blurImg.src = urls.blur;
      for (n = 0; n < glass.length; n++) glass[n].src = urls[glass[n].getAttribute('data-material')];
      photoClasses(w);
      ambTitle.textContent = w.name;
      ambCredit.textContent = credits[w.id] ? 'Photographed by ' + credits[w.id] : '';
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

  // ---------- Clock and screensaver ----------

  function ordinal(n) { var v = n % 100, s = ['th', 'st', 'nd', 'rd']; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function tick() {
    var d = new Date(), h = d.getHours(), m = d.getMinutes(), hm = (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m, mer = '<span class="mer">' + (h < 12 ? 'AM' : 'PM') + '</span>';
    timeEl.innerHTML = hm + mer;
    ambTime.innerHTML = hm + mer;
    ambDate.textContent = DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + ordinal(d.getDate());
    // The status capsule grows when the hour gains a digit; its glass must follow its new left edge.
    if (statusEl.offsetWidth !== statusWidth) { statusWidth = statusEl.offsetWidth; registerGlass(); }
  }
  function armIdle() {
    clearTimeout(idleTimer);
    if (AMBIENT[S.amb].ms && !S.ambient) idleTimer = setTimeout(enterAmbient, AMBIENT[S.amb].ms);
  }
  // A slow drift keeps the clock from burning a fixed shape into the OLED panel.
  function drift() { ambDrift.style.transform = 'translate3d(' + Math.round(Math.random() * 40 - 20) + 'px,' + Math.round(Math.random() * 24 - 12) + 'px,0)'; }
  function enterAmbient() {
    if (S.ambient) return;
    if (S.zone === 'panel') S.zone = 'gear';
    if (S.zone === 'dialog') S.zone = 'fav';
    S.ambient = true;
    S.homeWall = S.wall;
    clearTimeout(idleTimer);
    render();
    stage.classList.add('is-ambient');
    driftTimer = setInterval(drift, 20000);
    rotateTimer = setInterval(function () { setWall(S.wall + 1); }, 40000);
  }
  // Home keeps its chosen photo; the screensaver's slideshow is temporary.
  function exitAmbient() {
    S.ambient = false;
    stage.classList.remove('is-ambient');
    clearInterval(driftTimer);
    clearInterval(rotateTimer);
    ambDrift.style.transform = '';
    if (S.wall !== S.homeWall) setWall(S.homeWall);
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
  // A click acts like the remote: the first click moves focus, a click on the focused item is OK.
  stage.addEventListener('click', function (e) {
    var el = e.target, z, i;
    if (S.ambient) { exitAmbient(); return; }
    armIdle();
    while (el && el !== stage && !el.getAttribute('data-z')) el = el.parentNode;
    if (!el || el === stage) return;
    if (el === focused) { act('ok'); return; }
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
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { statusWidth = 0; tick(); });
    loadCredits(function () { setWall(first); });
    setInterval(tick, 5000);
    armIdle();
    stage.focus();
    window.addEventListener('resize', fit);
  }
  start();
}());
