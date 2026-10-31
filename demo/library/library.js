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
  var DOCK_W = 1824, DOCK_H = 230, DOCK_R = 56, DOCK_TOP = 747;
  var LIB_TOP = 1020, ROW_PITCH = 236, LABEL_GAP = 24, LABEL_H = 36, ROW_SPAN = TILE_H + LABEL_GAP + LABEL_H;
  var TOP_LINE = 152, SAFE_BOTTOM = 1026, TOP_EDGE = 140;
  var SHALLOW = TOP_LINE - DOCK_TOP; // The dock sits just below the top bar while the first library rows show.
  var DEEP_ROWS = Math.floor((SAFE_BOTTOM - TOP_LINE - ROW_SPAN) / ROW_PITCH) + 1; // Rows that fit once the dock scrolls away.
  var PANEL = { w: 700, h: 866, r: 48 }, DIALOG = { w: 728, h: 340, r: 48 };
  var PILL_W = 150, PANEL_PITCH = 88, DIALOG_PITCH = 316, SMOOTHING = 0.6, ZIP_LEN = 5;
  // Apps editor: a favourites plate like the dock, then Library and Hidden grids with names under each app.
  var ED_PLATE_H = 262, ED_FAV_Y = 300, ED_LIB_Y = 624, ED_ROW = 222, ED_LABEL_GAP = 60, ED_TOP_SAFE = 256, ED_SPAN = 210, RING_PAD = 8;
  // Wallpaper picker: a glass panel on the left with two columns of photos; the rest of the screen previews.
  var PICKER = { w: 760, h: 896, r: 48 }, THUMB_W = 312, THUMB_H = 176, THUMB_R = 28, PK_LEFT = 56, PK_GAP = 24, PK_TOP = 16, PK_ROW = 244, PK_VIEW = 708;

  var APPS = [
    { id: 'netflix', name: 'Netflix', mark: 'netflix', bg: '#000', ink: '#e50914' },
    { id: 'youtube', name: 'YouTube', mark: 'youtube', bg: '#fff', ink: '#ff0033' },
    { id: 'disneyplus', name: 'Disney+', mark: 'disneyplus', bg: 'linear-gradient(160deg,#1d3a8f,#0a1236 75%)', ink: '#fff' },
    { id: 'hbomax', name: 'HBO Max', mark: 'hbomax', bg: '#0b25cf', ink: '#fff' },
    { id: 'primevideo', name: 'Prime Video', mark: 'primevideo', bg: '#1a98ff', ink: '#fff' },
    { id: 'appletv', name: 'Apple TV', mark: 'appletv', bg: '#000', ink: '#fff' },
    { id: 'applemusic', name: 'Apple Music', mark: 'applemusic', bg: 'linear-gradient(160deg,#fb5c74,#fa233b)', ink: '#fff' },
    { id: 'crunchyroll', name: 'Crunchyroll', bg: '#f47521', ink: '#fff' },
    { id: 'espn', name: 'ESPN', bg: '#1d1d1f', ink: '#ff2a3b' },
    { id: 'hulu', name: 'Hulu', bg: '#1ce783', ink: '#0b0c0f' },
    { id: 'jellyfin', name: 'Jellyfin', bg: 'linear-gradient(160deg,#aa5cc3,#00a4dc)', ink: '#fff' },
    { id: 'paramount', name: 'Paramount+', bg: '#0064ff', ink: '#fff' },
    { id: 'pbs', name: 'PBS', bg: '#2638c4', ink: '#fff' },
    { id: 'peacock', name: 'Peacock', bg: '#000', ink: '#fff' },
    { id: 'plex', name: 'Plex', bg: '#1f2326', ink: '#e5a00d' },
    { id: 'plutotv', name: 'Pluto TV', bg: '#fff200', ink: '#000' },
    { id: 'spotify', name: 'Spotify', mark: 'spotify', bg: '#121212', ink: '#1ed760' },
    { id: 'stremio', name: 'Stremio', mark: 'stremio', bg: '#19122f', ink: '#8a5cf6' },
    { id: 'tubi', name: 'Tubi', mark: 'tubi', bg: '#7408ff', ink: '#ffff13' },
    { id: 'twitch', name: 'Twitch', bg: '#9146ff', ink: '#fff' },
    { id: 'youtubetv', name: 'YouTube TV', bg: '#fff', ink: '#ff0033' }
  ];
  var DEFAULT_FAVS = ['netflix', 'youtube', 'disneyplus', 'hbomax', 'primevideo', 'appletv'], FAV_MAX = 6, STORE = 'library-prototype.v1';
  // HDMI ports as the TV reports them; names and visibility are the owner's choices.
  var INPUT_DEFAULTS = [
    { port: 'HDMI 1', name: 'PlayStation 5', show: true, connected: true },
    { port: 'HDMI 2', name: 'Mac mini', show: true, connected: true },
    { port: 'HDMI 3', name: '', show: true, connected: false },
    { port: 'HDMI 4', name: '', show: false, connected: false }
  ];
  var TABS = ['Home', 'Inputs'];
  var SLEEP = ['Off', '30 min', '1 hour', '90 min', '2 hours'];
  var AMBIENT = [{ name: 'After 1 min', ms: 60000 }, { name: 'After 5 min', ms: 300000 }, { name: 'After 15 min', ms: 900000 }, { name: 'Off', ms: 0 }];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WALLS = window.CleanFrameWallpapers || [];
  var FAVS = [], ROWS = [], INS = []; // Home's favourites, library rows and input tiles, rebuilt from the owner's choices.

  var S = { tab: 0, zone: 'fav', nav: 0, fav: 0, lr: 0, lc: 0, inp: 0, panel: 0, dialog: 0, glassTiles: false, wall: 0, homeWall: 0, sleep: 0, amb: 1, ambient: false, scroll: 0,
    favIds: DEFAULT_FAVS.slice(), hiddenIds: [], ed: null, pages: [], panelFrom: 'gear', paging: false, pageEntered: false, queued: [],
    weather: { zip: '', units: 'F' }, zip: [], zipAt: 0, inputAt: 0,
    inputs: INPUT_DEFAULTS.map(function (p) { return { port: p.port, name: p.name, show: p.show, connected: p.connected }; }) };
  var SETTINGS = [
    { label: 'Sleep timer', value: function () { return SLEEP[S.sleep]; }, ok: function () { S.sleep = (S.sleep + 1) % SLEEP.length; } },
    { label: 'Wallpaper', kind: 'screen', value: function () { return WALLS[S.wall] ? WALLS[S.wall].name : ''; }, ok: openPicker },
    { label: 'Apps', kind: 'screen', value: function () { return S.favIds.length + ' favorites'; }, ok: openEditor },
    { label: 'Weather', kind: 'page', value: function () { return S.weather.zip ? S.weather.zip + ' · °' + S.weather.units : 'Set location'; }, ok: function () { pushPage('weather'); } },
    { label: 'Screensaver', value: function () { return AMBIENT[S.amb].name; }, ok: function () { S.amb = (S.amb + 1) % AMBIENT.length; armIdle(); } },
    { label: 'Picture and sound', kind: 'link', ok: function () { toast('Opens Samsung’s picture and sound settings on the TV.'); } },
    { label: 'Samsung Home', kind: 'link', ok: function () { toast('Opens Samsung Home on the TV.'); } }
  ];
  // Rows that open a Samsung screen show an outward arrow; rows that open a screen of ours show a chevron.
  var LINK_ICON = '<svg class="ico p-link" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>';
  var CHEVRON = '<svg class="ico p-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

  var stage = $('stage'), page = $('page'), dock = $('dock'), dockLayer = $('dockLayer'), library = $('library');
  var favRow = $('favRow'), inRow = $('inRow'), focusName = $('focusName'), gear = $('gear'), toastEl = $('toast'), panelStatus = $('panelStatus');
  var navActive = $('navActive'), navFocus = $('navFocus'), panelInd = $('panelInd'), dialogInd = $('dialogInd');
  var navInk = $('navInk'), panelInk = $('panelInk'), dialogInk = $('dialogInk');
  var timeEl = $('time'), statusEl = stage.querySelector('.status'), ambTime = $('ambTime'), ambDate = $('ambDate'), ambTitle = $('ambTitle'), ambCredit = $('ambCredit'), ambDrift = $('ambDrift');
  var front = $('photoA'), back = $('photoB'), blurImg = $('blur'), shownWall = -1;
  var pkGrid = $('pkGrid'), pkTitle = $('pkTitle'), pkCredit = $('pkCredit'), pickerEl = $('picker'), previewTimer = null;
  var panelBody = $('panelBody'), panelCrumb = $('panelCrumb'), panelTitle = $('panelTitle'), panelRowsBox = $('panelRowsBox'), panelCustom = $('panelCustom'), panelNote = $('panelNote');
  var tempEl = stage.querySelector('.weather span');
  var editorEl = $('editor'), edPage = $('edPage'), edTiles = $('edTiles'), edStyle = $('edStyle'), edHint = $('edHint');
  var edFavLabel = $('edFavLabel'), edLibLabel = $('edLibLabel'), edHidLabel = $('edHidLabel'), edEmpty = $('edEmpty'), edSlots = {};
  var pills, panelRows = $('panelRows').children, dialogBtns, tileRim = '', thumbRim = '', tilePath = '', ringSvg = '', focused = null, lastZone = null, credits = {}, wallToken = 0, statusWidth = 0;
  var idleTimer = null, driftTimer = null, rotateTimer = null, toastTimer = null, quietPress = false;

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
      + '<div class="t-face squircle"' + (faceStyle ? ' style="' + faceStyle + '"' : '') + '>' + inner + '<div class="t-sheen"></div>' + tileRim + '</div></div>';
  }
  function appHtml(a, zone, i, col) {
    return tileHtml('', zone, i, col, '--mk:' + a.ink, a.mark ? markHtml(a.mark) : '<span class="t-text">' + esc(a.name) + '</span>', 'background:' + a.bg);
  }
  function inputHtml(s, i) {
    return tileHtml(' in-tile' + (s.empty ? ' is-empty' : ''), 'inputs', i, i, '', '<span class="in-port">' + esc(s.port) + '</span><span class="in-name">' + esc(s.name) + '</span>', '');
  }
  function build() {
    tilePath = shape('tile', TILE_W, TILE_H, TILE_R);
    tileRim = '<svg class="rim" viewBox="0 0 ' + TILE_W + ' ' + TILE_H + '" aria-hidden="true"><path d="' + tilePath + '"/></svg>';
    ringSvg = '<svg class="ed-ring" viewBox="0 0 ' + (TILE_W + 2 * RING_PAD) + ' ' + (TILE_H + 2 * RING_PAD) + '" aria-hidden="true"><path d="' + squircle(TILE_W + 2 * RING_PAD, TILE_H + 2 * RING_PAD, TILE_R + RING_PAD, SMOOTHING) + '"/></svg>';
    shape('dock', DOCK_W, DOCK_H, DOCK_R, 'dockRim');
    shape('panel', PANEL.w, PANEL.h, PANEL.r, 'panelRim');
    shape('dialog', DIALOG.w, DIALOG.h, DIALOG.r, 'dialogRim');
    shape('edplate', DOCK_W, ED_PLATE_H, DOCK_R);
    shape('picker', PICKER.w, PICKER.h, PICKER.r, 'pickerRim');
    thumbRim = '<svg class="rim" viewBox="0 0 ' + THUMB_W + ' ' + THUMB_H + '" aria-hidden="true"><path d="' + shape('thumb', THUMB_W, THUMB_H, THUMB_R) + '"/></svg>';
    buildHome();
    buildInputs();
    $('pills').innerHTML = TABS.map(function (t, i) { return '<div class="pill" data-z="nav" data-i="' + i + '">' + t + '</div>'; }).join('');
    navInk.innerHTML = TABS.map(function (t) { return '<div class="pill">' + t + '</div>'; }).join('');
    pills = $('pills').children;
    dialogBtns = stage.querySelectorAll('.d-actions > .d-btn');
  }

  function rowHtml(s, attrs) {
    return '<div class="p-row"' + attrs + '><span class="p-label">' + esc(s.label) + '</span><span class="p-end"><span class="p-value"></span>' + (s.kind === 'link' ? LINK_ICON : s.kind ? CHEVRON : '') + '</span></div>';
  }
  function byId(id) { var i; for (i = 0; i < APPS.length; i++) if (APPS[i].id === id) return APPS[i]; return null; }
  function byName(a, b) { return byId(a).name.localeCompare(byId(b).name); }
  function libraryIds(favIds, hiddenIds) { return APPS.map(function (a) { return a.id; }).filter(function (id) { return favIds.indexOf(id) < 0 && hiddenIds.indexOf(id) < 0; }).sort(byName); }
  function buildHome() {
    FAVS = S.favIds.map(byId);
    ROWS = chunk(libraryIds(S.favIds, S.hiddenIds).map(byId), COLS);
    favRow.innerHTML = FAVS.map(function (a, i) { return appHtml(a, 'fav', i, i); }).join('');
    library.innerHTML = ROWS.map(function (row, r) {
      return '<div class="lib-row" style="top:' + r * ROW_PITCH + 'px">' + row.map(function (a, c) { return appHtml(a, 'lib', r * COLS + c, c); }).join('') + '</div>';
    }).join('');
    S.fav = Math.min(S.fav, FAVS.length - 1);
    S.scroll = null;
  }
  function load() {
    var d, ok = function (id) { return !!byId(id); };
    try { d = JSON.parse(window.localStorage.getItem(STORE) || 'null'); } catch (e) { d = null; }
    if (!d) return;
    if (d.fav && d.fav.filter(ok).length) S.favIds = d.fav.filter(ok).slice(0, FAV_MAX);
    if (d.hid) S.hiddenIds = d.hid.filter(function (id) { return ok(id) && S.favIds.indexOf(id) < 0; });
    S.glassTiles = !!d.glass;
    if (d.weather) S.weather = { zip: /^\d{5}$/.test(d.weather.zip) ? d.weather.zip : '', units: d.weather.units === 'C' ? 'C' : 'F' };
    if (d.inputs) S.inputs.forEach(function (inp, n) {
      var saved = d.inputs[n];
      if (!saved) return;
      if (typeof saved.name === 'string') inp.name = saved.name.slice(0, 24);
      if (typeof saved.show === 'boolean') inp.show = saved.show;
    });
  }
  function save() {
    var inputs = S.inputs.map(function (inp) { return { name: inp.name, show: inp.show }; });
    try { window.localStorage.setItem(STORE, JSON.stringify({ fav: S.favIds, hid: S.hiddenIds, glass: S.glassTiles, weather: S.weather, inputs: inputs })); } catch (e) { /* The prototype still works without saved choices. */ }
  }
  function inputName(inp) { return inp.name || (inp.connected ? inp.port : 'No device'); }
  function buildInputs() {
    INS = S.inputs.filter(function (inp) { return inp.show; }).map(function (inp) { return { port: inp.port, name: inputName(inp), empty: !inp.connected }; });
    INS.push({ port: 'Samsung', name: 'Source list', list: true }, { port: 'Settings', name: 'Edit inputs', edit: true });
    inRow.innerHTML = INS.map(inputHtml).join('');
    S.inp = Math.min(S.inp, INS.length - 1);
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
      case 'panel': return pageDef().custom === 'zip' ? panelCustom.querySelectorAll('.zip-cell')[S.zipAt] : pageDef().custom === 'rename' ? panelCustom.querySelector('.p-field') : panelRows[curPage().i];
      case 'apps': return S.ed.focus === 'style' ? edStyle : edSlots[S.ed.focus].firstChild;
      case 'wallpaper': return pkGrid.children[S.pk.i];
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
    if (S.zone === 'panel') updatePanel();
    tempEl.textContent = S.weather.units === 'C' ? '18°' : '64°';
    place(navActive, null, S.tab * PILL_W, 0, false);
    if (S.zone === 'nav') place(navFocus, navInk, S.nav * PILL_W, 0, entered);
    if (S.zone === 'panel' && !pageDef().custom) place(panelInd, panelInk, 0, curPage().i * PANEL_PITCH, entered || S.pageEntered);
    S.pageEntered = false;
    if (S.zone === 'dialog') place(dialogInd, dialogInk, S.dialog * DIALOG_PITCH, 0, entered);
    toggle(navFocus, 'is-on', S.zone === 'nav');
    toggle(stage, 'tab-inputs', S.tab === 1);
    toggle(stage, 'is-library', S.zone === 'lib');
    toggle(stage, 'is-panel', S.zone === 'panel');
    toggle(stage, 'is-dialog', S.zone === 'dialog');
    toggle(stage, 'tiles-glass', S.glassTiles);
    toggle(stage, 'is-editor', S.zone === 'apps');
    if (S.zone === 'apps') renderEditor();
    toggle(stage, 'is-picker', S.zone === 'wallpaper');
    if (S.zone === 'wallpaper') renderPicker();
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
        else if (k === 'ok') openPanel('root', 'gear');
        break;
      case 'fav':
        if (k === 'left') S.fav = Math.max(0, S.fav - 1);
        else if (k === 'right') S.fav = Math.min(FAVS.length - 1, S.fav + 1);
        else if (k === 'up') { S.zone = 'nav'; S.nav = S.tab; }
        else if (k === 'down' && ROWS.length) { S.zone = 'lib'; S.lr = 0; S.lc = Math.min(S.fav, rowLen(0) - 1); }
        else if (k === 'ok') launch(focused, FAVS[S.fav].name);
        else if (k === 'back') { S.zone = 'dialog'; S.dialog = 0; }
        break;
      case 'lib':
        if (k === 'left') S.lc = Math.max(0, S.lc - 1);
        else if (k === 'right') S.lc = Math.min(rowLen(S.lr) - 1, S.lc + 1);
        else if (k === 'up' && S.lr === 0) { S.zone = 'fav'; S.fav = Math.min(S.lc, FAVS.length - 1); }
        else if (k === 'up') { S.lr--; S.lc = Math.min(S.lc, rowLen(S.lr) - 1); }
        else if (k === 'down' && S.lr < ROWS.length - 1) { S.lr++; S.lc = Math.min(S.lc, rowLen(S.lr) - 1); }
        else if (k === 'ok') launch(focused, ROWS[S.lr][S.lc].name);
        else if (k === 'back') { S.zone = 'fav'; S.fav = Math.min(S.lc, FAVS.length - 1); }
        break;
      case 'inputs':
        if (k === 'left') S.inp = Math.max(0, S.inp - 1);
        else if (k === 'right') S.inp = Math.min(INS.length - 1, S.inp + 1);
        else if (k === 'up') { S.zone = 'nav'; S.nav = S.tab; }
        else if (k === 'ok') chooseInput(INS[S.inp]);
        else if (k === 'back') { S.tab = 0; S.zone = 'fav'; }
        break;
      case 'panel':
        panelKey(k);
        break;
      case 'apps':
        editorKey(k);
        break;
      case 'wallpaper':
        pickerKey(k);
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
  // Restart the press animation on the face. A click that moves focus only grows the tile, without a press.
  function press(tile) {
    if (quietPress) return;
    tile.classList.remove('is-press');
    void tile.offsetWidth;
    tile.classList.add('is-press');
  }
  function launch(tile, name) {
    press(tile);
    toast('Opens ' + name + ' on the TV.');
  }
  function chooseInput(s) {
    press(focused);
    if (s.edit) openPanel('inputs', 'inputs');
    else if (s.empty) toast('Nothing is connected to ' + s.port + '.');
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

  // ---------- Settings panel pages ----------

  // The panel holds a stack of pages. A row changes its value in place, opens a page (chevron), opens a full
  // screen (chevron) or opens a Samsung screen (arrow). Pages slide left going in and right coming back.
  var PAGES = {
    root: { title: 'Settings', rows: function () { return SETTINGS; } },
    weather: {
      title: 'Weather', note: 'The TV checks the weather every 30 minutes and sends only your ZIP code.',
      rows: function () {
        return [
          { label: 'ZIP code', kind: 'page', value: function () { return S.weather.zip || 'Not set'; }, ok: function () { S.zip = (S.weather.zip || '00000').split(''); S.zipAt = 0; pushPage('zip'); } },
          { label: 'Units', value: function () { return S.weather.units === 'C' ? 'Celsius' : 'Fahrenheit'; }, ok: function () { S.weather.units = S.weather.units === 'C' ? 'F' : 'C'; save(); } }
        ];
      }
    },
    zip: { title: 'ZIP code', custom: 'zip', note: 'Up and Down change a digit. Left and Right move between digits, or type the numbers on your remote. OK saves.' },
    inputs: {
      title: 'Inputs', note: 'Names appear on the Inputs tab. Hidden inputs stay off it.',
      rows: function () {
        return S.inputs.map(function (inp, n) { return { label: inp.port, kind: 'page', value: function () { return inp.show ? inputName(inp) : 'Hidden'; }, ok: function () { S.inputAt = n; pushPage('input'); } }; });
      }
    },
    input: {
      title: function () { return S.inputs[S.inputAt].port; },
      rows: function () {
        var inp = S.inputs[S.inputAt];
        return [
          { label: 'Name', kind: 'page', value: function () { return inp.name || 'None'; }, ok: function () { pushPage('rename'); } },
          { label: 'Show on Inputs', value: function () { return inp.show ? 'On' : 'Off'; }, ok: function () { inp.show = !inp.show; save(); } }
        ];
      }
    },
    rename: { title: 'Name', custom: 'rename', note: 'Type a name, then press OK. Leave it empty to use the port name.' }
  };
  function curPage() { return S.pages[S.pages.length - 1]; }
  function pageDef() { return PAGES[curPage().id]; }
  function pageRows() { var d = pageDef(); return d.rows ? d.rows() : []; }
  function titleOf(d) { return typeof d.title === 'function' ? d.title() : d.title; }
  function openPanel(id, from) {
    S.pages = [{ id: id, i: 0 }];
    S.panelFrom = from;
    S.zone = 'panel';
    buildPanelPage();
  }
  function closePanel() {
    if (S.panelFrom === 'inputs') buildInputs();
    S.zone = S.panelFrom;
  }
  function pushPage(id) { slidePage(1, function () { S.pages.push({ id: id, i: 0 }); }); }
  function popPage() {
    if (S.pages.length === 1) { closePanel(); return; }
    slidePage(-1, function () { S.pages.pop(); });
  }
  function slidePage(dir, change) {
    S.paging = true;
    panelBody.className = 'p-body is-out-' + (dir > 0 ? 'left' : 'right');
    setTimeout(function () {
      change();
      buildPanelPage();
      panelBody.className = 'p-body is-in-' + (dir > 0 ? 'right' : 'left');
      void panelBody.offsetWidth;
      panelBody.className = 'p-body';
      S.paging = false;
      S.pageEntered = true;
      render();
      // Keys pressed during the slide apply to the new page, so a quick press is never lost.
      S.queued.splice(0).forEach(act);
    }, 140);
  }
  function buildPanelPage() {
    var d = pageDef(), rows = pageRows(), parent = S.pages.length > 1 ? PAGES[S.pages[S.pages.length - 2].id] : null, field;
    panelCrumb.textContent = parent ? titleOf(parent) : '';
    panelTitle.textContent = titleOf(d);
    $('panelRows').innerHTML = rows.map(function (s, i) { return rowHtml(s, ' data-z="panel" data-i="' + i + '"'); }).join('');
    panelInk.innerHTML = rows.map(function (s) { return rowHtml(s, ''); }).join('');
    panelRowsBox.style.display = rows.length ? '' : 'none';
    panelCustom.innerHTML = d.custom === 'zip' ? zipHtml() : d.custom === 'rename' ? '<input class="p-field" type="text" maxlength="24" spellcheck="false" autocomplete="off" aria-label="Input name">' : '';
    panelNote.textContent = d.note || '';
    S.pageEntered = true;
    if (d.custom === 'rename') {
      field = panelCustom.firstChild;
      field.value = S.inputs[S.inputAt].name;
      setTimeout(function () { field.focus(); field.select(); }, 0);
    } else if (document.activeElement !== stage) stage.focus();
  }
  function updatePanel() {
    var rows = pageRows(), i;
    for (i = 0; i < rows.length; i++) if (rows[i].value) panelRows[i].querySelector('.p-value').textContent = panelInk.children[i].querySelector('.p-value').textContent = rows[i].value();
    if (pageDef().custom === 'zip') updateZip();
  }
  function panelKey(k) {
    var d = pageDef(), cur = curPage(), rows;
    if (S.paging) { S.queued.push(k); return; }
    if (d.custom === 'zip') { zipKey(k); return; }
    if (d.custom === 'rename') {
      if (k === 'ok') { S.inputs[S.inputAt].name = panelCustom.firstChild.value.replace(/\s+/g, ' ').trim(); save(); popPage(); }
      else if (k === 'back') popPage();
      return;
    }
    rows = pageRows();
    if (k === 'up') cur.i = Math.max(0, cur.i - 1);
    else if (k === 'down') cur.i = Math.min(rows.length - 1, cur.i + 1);
    else if (k === 'ok') rows[cur.i].ok();
    else if (k === 'back' || k === 'left') popPage();
  }
  // ZIP code entry works with arrows alone, because the TV's own keyboard is slow with a remote.
  function zipHtml() { var h = '', i; for (i = 0; i < ZIP_LEN; i++) h += '<div class="zip-cell" data-z="zip" data-i="' + i + '"></div>'; return '<div class="zip">' + h + '</div>'; }
  function updateZip() { var cells = panelCustom.querySelectorAll('.zip-cell'), i; for (i = 0; i < cells.length; i++) cells[i].textContent = S.zip[i]; }
  function zipDigit(n) { S.zip[S.zipAt] = String(n); S.zipAt = Math.min(ZIP_LEN - 1, S.zipAt + 1); render(); }
  function zipKey(k) {
    if (k === 'left') S.zipAt = Math.max(0, S.zipAt - 1);
    else if (k === 'right') S.zipAt = Math.min(ZIP_LEN - 1, S.zipAt + 1);
    else if (k === 'up' || k === 'down') S.zip[S.zipAt] = String((+S.zip[S.zipAt] + (k === 'up' ? 1 : 9)) % 10);
    else if (k === 'ok') { S.weather.zip = S.zip.join(''); save(); toast('Weather location saved.'); popPage(); }
    else if (k === 'back') popPage();
  }

  // ---------- Wallpaper picker ----------

  // Focus resting on a photo previews it full screen after a short pause, so fast browsing never loads every photo.
  // OK applies it; Back returns to the applied photo.
  var CHECK_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  function openPicker() {
    if (!pkGrid.firstChild) {
      pkGrid.innerHTML = WALLS.map(function (w, n) {
        return '<div class="pk-item" data-z="pk" data-i="' + n + '" style="transform:translate3d(' + (PK_LEFT + (n % 2) * (THUMB_W + PK_GAP)) + 'px,' + (PK_TOP + Math.floor(n / 2) * PK_ROW) + 'px,0)">'
          + '<div class="pk-thumb"><div class="pk-face squircle"><img alt="" src="' + ASSETS + 'wallpapers/' + w.id + '-thumb.jpg"><div class="t-sheen"></div>' + thumbRim + '</div>'
          + '<span class="pk-check">' + CHECK_ICON + '</span></div><div class="pk-name">' + esc(w.name) + '</div></div>';
      }).join('');
    }
    S.pk = { i: S.wall, scroll: 0, first: true };
    S.zone = 'wallpaper';
  }
  function closePicker() {
    clearTimeout(previewTimer);
    if (shownWall !== S.wall) showWall(S.wall, false);
    S.zone = 'panel';
  }
  function renderPicker() {
    var items = pkGrid.children, w = WALLS[S.pk.i], y = PK_TOP + Math.floor(S.pk.i / 2) * PK_ROW, s = S.pk.scroll, i;
    for (i = 0; i < items.length; i++) toggle(items[i], 'is-applied', i === S.wall);
    if (y + s < PK_TOP) s = PK_TOP - y;
    if (y + PK_ROW + s > PK_VIEW) s = PK_VIEW - PK_ROW - y;
    S.pk.scroll = Math.min(0, s);
    toggle(pickerEl, 'is-instant', S.pk.first);
    pkGrid.style.transform = 'translate3d(0,' + S.pk.scroll + 'px,0)';
    if (S.pk.first) { void pickerEl.offsetWidth; pickerEl.classList.remove('is-instant'); S.pk.first = false; }
    pkTitle.textContent = w.name;
    pkCredit.textContent = credits[w.id] ? 'Photographed by ' + credits[w.id] : '';
    clearTimeout(previewTimer);
    if (shownWall !== S.pk.i) previewTimer = setTimeout(function () { showWall(S.pk.i, false); }, 260);
  }
  function pickerKey(k) {
    var i = S.pk.i, last = WALLS.length - 1;
    if (k === 'left' && i % 2) S.pk.i = i - 1;
    else if (k === 'right' && !(i % 2) && i < last) S.pk.i = i + 1;
    else if (k === 'up' && i > 1) S.pk.i = i - 2;
    else if (k === 'down' && i + 2 <= last) S.pk.i = i + 2;
    else if (k === 'down' && Math.floor(i / 2) < Math.floor(last / 2)) S.pk.i = last;
    else if (k === 'ok') { clearTimeout(previewTimer); setWall(i); }
    else if (k === 'back') closePicker();
  }

  // ---------- Apps editor ----------

  // Favourites keep their order; Library and Hidden stay in A-Z order. OK picks an app up, the arrows carry it while
  // the other apps slide aside, OK drops it and Back cancels. Every drop saves at once.
  var ED_HINT = 'Press OK on an app to pick it up, then move it with the arrows.';
  var SECTION_NAMES = { fav: 'Favorites', lib: 'Library', hid: 'Hidden' };
  function openEditor() {
    var i;
    if (!edTiles.firstChild) {
      edTiles.innerHTML = APPS.map(function (a, n) { return '<div class="ed-slot" data-id="' + a.id + '">' + appHtml(a, 'edapp', n, 0) + '<div class="ed-name">' + esc(a.name) + '</div></div>'; }).join('');
      for (i = 0; i < edTiles.children.length; i++) {
        edSlots[edTiles.children[i].getAttribute('data-id')] = edTiles.children[i];
        edTiles.children[i].firstChild.insertAdjacentHTML('beforeend', ringSvg);
      }
      for (i = 0; i < FAV_MAX; i++) $('edFree').insertAdjacentHTML('beforeend', '<svg class="ed-free" viewBox="0 0 ' + TILE_W + ' ' + TILE_H + '" style="left:' + (GRID_LEFT + i * PITCH) + 'px" aria-hidden="true"><path d="' + tilePath + '"/></svg>');
    }
    S.ed = { focus: S.favIds[0], col: 0, carry: null, scroll: 0, hint: ED_HINT, first: true };
    S.zone = 'apps';
  }
  function closeEditor() {
    S.ed.carry = null;
    buildHome();
    S.zone = 'panel';
  }
  function count(n) { return n + (n === 1 ? ' app' : ' apps'); }
  function sectionOf(id) { return S.favIds.indexOf(id) >= 0 ? 'fav' : S.hiddenIds.indexOf(id) >= 0 ? 'hid' : 'lib'; }
  // The lists as they would be if the carried app were dropped where it is now.
  function edLists() {
    var c = S.ed.carry, fav = S.favIds.slice(), hid = S.hiddenIds.slice(), drop = function (list) { var i = list.indexOf(c.id); if (i >= 0) list.splice(i, 1); };
    if (c) {
      drop(fav); drop(hid);
      if (c.sec === 'fav') fav.splice(c.idx, 0, c.id);
      else if (c.sec === 'hid') hid.push(c.id);
    }
    return { fav: fav, lib: libraryIds(fav, hid), hid: hid.sort(byName) };
  }
  function edLayout(L) {
    var pos = {}, rows = [['style'], L.fav], libRows = Math.max(1, Math.ceil(L.lib.length / COLS)), hidLabel = ED_LIB_Y + libRows * ED_ROW + 4, hidY = hidLabel + ED_LABEL_GAP;
    function grid(ids, top) {
      var i;
      ids.forEach(function (id, n) { pos[id] = { x: GRID_LEFT + (n % COLS) * PITCH, y: top + Math.floor(n / COLS) * ED_ROW }; });
      for (i = 0; i < ids.length; i += COLS) rows.push(ids.slice(i, i + COLS));
    }
    L.fav.forEach(function (id, n) { pos[id] = { x: GRID_LEFT + n * PITCH, y: ED_FAV_Y }; });
    grid(L.lib, ED_LIB_Y);
    grid(L.hid, hidY);
    return { pos: pos, rows: rows, hidLabel: hidLabel, hidY: hidY };
  }
  function renderEditor() {
    var L = edLists(), lay = edLayout(L), c = S.ed.carry, id, p, slot, y, s;
    S.ed.layout = lay;
    toggle(editorEl, 'is-instant', S.ed.first);
    for (id in edSlots) {
      slot = edSlots[id]; p = lay.pos[id];
      slot.style.transform = 'translate3d(' + p.x + 'px,' + p.y + 'px,0)';
      toggle(slot, 'is-focus', S.ed.focus === id);
      toggle(slot, 'is-carry', !!c && c.id === id);
      toggle(slot, 'is-hidden', L.hid.indexOf(id) >= 0);
    }
    edFavLabel.innerHTML = 'Favorites<span>' + L.fav.length + ' of ' + FAV_MAX + '</span>';
    edLibLabel.innerHTML = 'Library<span>' + count(L.lib.length) + ', A–Z</span>';
    edHidLabel.innerHTML = 'Hidden<span>' + (L.hid.length ? count(L.hid.length) : '') + '</span>';
    edHidLabel.style.transform = 'translate3d(0,' + lay.hidLabel + 'px,0)';
    edEmpty.style.transform = 'translate3d(0,' + (lay.hidY + 4) + 'px,0)';
    toggle(edEmpty, 'is-on', !L.hid.length);
    edStyle.textContent = 'Tile style: ' + (S.glassTiles ? 'Glass' : 'Color');
    edHint.textContent = S.ed.hint;
    // Scroll just enough to keep the focused app and its name in view below the header.
    y = S.ed.focus === 'style' ? 0 : lay.pos[S.ed.focus].y;
    s = S.ed.scroll;
    if (y + s < ED_TOP_SAFE) s = ED_TOP_SAFE - y;
    if (y + ED_SPAN + s > SAFE_BOTTOM) s = SAFE_BOTTOM - ED_SPAN - y;
    S.ed.scroll = Math.min(0, s);
    edPage.style.transform = 'translate3d(0,' + S.ed.scroll + 'px,0)';
    if (S.ed.first) { void editorEl.offsetWidth; editorEl.classList.remove('is-instant'); S.ed.first = false; }
  }
  function editorKey(k) {
    var rows = S.ed.layout.rows, r, col;
    if (S.ed.carry) { carryKey(k); return; }
    for (r = 0; r < rows.length; r++) { col = rows[r].indexOf(S.ed.focus); if (col >= 0) break; }
    if (r > 0 && (k === 'left' || k === 'right')) {
      col = clamp(col + (k === 'left' ? -1 : 1), 0, rows[r].length - 1);
      S.ed.focus = rows[r][col];
      S.ed.col = col;
    } else if (k === 'up' && r > 0) S.ed.focus = rows[r - 1][r === 1 ? 0 : Math.min(S.ed.col, rows[r - 1].length - 1)];
    else if (k === 'down' && r < rows.length - 1) S.ed.focus = rows[r + 1][Math.min(S.ed.col, rows[r + 1].length - 1)];
    else if (k === 'ok' && S.ed.focus === 'style') { S.glassTiles = !S.glassTiles; save(); }
    else if (k === 'ok') {
      S.ed.carry = { id: S.ed.focus, sec: sectionOf(S.ed.focus), idx: Math.max(0, S.favIds.indexOf(S.ed.focus)), from: sectionOf(S.ed.focus) };
      S.ed.hint = 'Moving ' + byId(S.ed.focus).name + '. Arrows move it, OK drops it here, Back cancels.';
    } else if (k === 'back') closeEditor();
  }
  function carryKey(k) {
    var c = S.ed.carry, others = S.favIds.filter(function (id) { return id !== c.id; }).length, L;
    if (k === 'left' || k === 'right') {
      if (c.sec === 'fav') c.idx = clamp(c.idx + (k === 'left' ? -1 : 1), 0, others);
      else S.ed.hint = 'Library and Hidden stay in A–Z order. Move up to Favorites to choose a spot.';
    } else if (k === 'up') {
      if (c.sec === 'hid') c.sec = 'lib';
      else if (c.sec === 'lib' && others >= FAV_MAX) S.ed.hint = 'Favorites hold ' + FAV_MAX + ' apps. Move one out first.';
      else if (c.sec === 'lib') { c.sec = 'fav'; c.idx = Math.min(S.ed.col, others); }
    } else if (k === 'down') {
      if (c.sec === 'fav' && !others) S.ed.hint = 'Keep at least one favorite.';
      else if (c.sec === 'fav') c.sec = 'lib';
      else if (c.sec === 'lib') c.sec = 'hid';
    } else if (k === 'ok') {
      L = edLists();
      S.favIds = L.fav; S.hiddenIds = L.hid;
      save();
      S.ed.hint = c.sec !== c.from ? byId(c.id).name + ' moved to ' + SECTION_NAMES[c.sec] + '.' : c.sec === 'fav' ? 'Favorites reordered.' : ED_HINT;
      S.ed.carry = null;
    } else if (k === 'back') { S.ed.carry = null; S.ed.hint = ED_HINT; }
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
    // CleanFrame's catalogue records how bright each photo is behind the top corners (ut.tr, clockMist)
    // and how much its frost needs veiling; the capsules darken by those amounts to keep text readable.
    stage.style.setProperty('--tint-tl', (0.36 + (w.frostVeil || 0.12) * 0.5 + (w.clockMist ? 0.12 : 0)).toFixed(3));
    stage.style.setProperty('--tint-tr', ({ light: 0.34, mist: 0.5, dark: 0.62 }[w.ut && w.ut.tr] || 0.4) + (w.tone === 'light' ? 0.04 : 0));
    stage.style.setProperty('--dock-tint', (0.20 + (w.frostVeil || 0.12) * 0.5).toFixed(3));
  }
  function setWall(i) { showWall(i, true); }
  function showWall(i, apply) {
    var w, base, urls, token;
    if (!WALLS.length) return;
    i = (i % WALLS.length + WALLS.length) % WALLS.length;
    w = WALLS[i]; base = ASSETS + 'materials/' + w.id; token = ++wallToken;
    urls = { photo: ASSETS + 'wallpapers/' + w.id + '.jpg', clear: base + '-field-clear.jpg', blur: base + '-field-blur.jpg', frost: base + '-field-frost.jpg' };
    preload([urls.photo, urls.clear, urls.blur, urls.frost], function () {
      var glass = stage.querySelectorAll('.glass-img'), n, swap;
      if (token !== wallToken) return;
      if (apply) S.wall = i;
      shownWall = i;
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
    if (S.zone === 'wallpaper') closePicker();
    if (S.zone === 'apps') closeEditor();
    if (S.zone === 'panel') closePanel();
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
    if (document.activeElement && document.activeElement.className === 'p-field') {
      if (k === 'ok' || (k === 'back' && e.keyCode !== 8)) { e.preventDefault(); act(k); }
      return;
    }
    if (e.keyCode === KEY_HINTS) { $('hints').classList.toggle('is-off'); return; }
    if (S.ambient) { e.preventDefault(); if (!e.repeat) exitAmbient(); return; }
    if (S.zone === 'panel' && pageDef().custom === 'zip' && ((e.keyCode >= 48 && e.keyCode <= 57) || (e.keyCode >= 96 && e.keyCode <= 105))) { zipDigit(e.keyCode - (e.keyCode >= 96 ? 96 : 48)); return; }
    if (e.keyCode === KEY_AMBIENT) { enterAmbient(); return; }
    if (!k) return;
    e.preventDefault();
    armIdle();
    if (e.repeat && (k === 'ok' || k === 'back')) return;
    act(k);
  });
  // A click focuses the item and presses OK on it, so one click switches a tab or launches an app.
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
    else if (z === 'panel') curPage().i = i;
    else if (z === 'zip') { S.zipAt = i; render(); return; }
    else if (z === 'dialog') S.dialog = i;
    else if (z === 'edapp') { if (S.zone !== 'apps') return; S.ed.focus = APPS[i].id; z = 'apps'; }
    else if (z === 'edstyle') { if (S.zone !== 'apps') return; S.ed.focus = 'style'; z = 'apps'; }
    else if (z === 'pk') { if (S.zone !== 'wallpaper') return; S.pk.i = i; z = 'wallpaper'; }
    quietPress = el !== focused;
    S.zone = z;
    render();
    act('ok');
    quietPress = false;
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
    load();
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
