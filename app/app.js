/* Home, a launcher for a Samsung TV (a Tizen web app). ES5, so it runs on the TV's web engine.
   On the TV it lists the installed apps and connected HDMI sources; the browser preview shows sample apps. */
(function () {
  'use strict';

  var H = window.HomeLogic; // Pure logic shared with the unit tests (logic.js).

  var ASSETS = '/home/assets/', ICONS = ASSETS + 'icons/';
  // 65376 and 65385 are Done and Cancel on the TV's on-screen keyboard.
  var KEYS = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'ok', 27: 'back', 8: 'back', 10009: 'back', 461: 'back', 65376: 'ok', 65385: 'back' };
  // Code between preview markers is for the browser preview only; scripts/build.py strips it from the TV build.
  /* preview */var KEY_AMBIENT = 65, KEY_HINTS = 72;/* /preview */

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
  var TM = { w: 560, h: 474, r: 44 }; // The edit-in-place menu: a title and four rows.
  // Apps editor: a favourites plate like the dock, then Library and Hidden grids with names under each app.
  var ED_PLATE_H = 262, ED_FAV_Y = 340, ED_LIB_Y = 664, ED_ROW = 222, ED_LABEL_GAP = 60, ED_TOP_SAFE = 256, ED_SPAN = 210, RING_PAD = 8;
  // Wallpaper picker: a glass panel on the left with two columns of photos; the rest of the screen previews.
  var PICKER = { w: 760, h: 762, r: 48 }, THUMB_W = 312, THUMB_H = 176, THUMB_R = 28, PK_LEFT = 56, PK_GAP = 24, PK_TOP = 16, PK_ROW = 244;

  var APPS = [
    { id: 'netflix', name: 'Netflix', mark: 'netflix', bg: '#000', ink: '#e50914' },
    { id: 'youtube', name: 'YouTube', mark: 'youtube', bg: '#fff', ink: '#ff0033' },
    { id: 'disneyplus', name: 'Disney+', mark: 'disneyplus', bg: 'linear-gradient(160deg,#1d3a8f,#0a1236 75%)', ink: '#fff' },
    { id: 'hbomax', name: 'HBO Max', aka: ['max'], mark: 'hbomax', bg: '#0b25cf', ink: '#fff' },
    { id: 'primevideo', name: 'Prime Video', mark: 'primevideo-wordmark', bg: '#fff', ink: '#0b79ff' },
    { id: 'appletv', name: 'Apple TV', mark: 'appletv', bg: '#000', ink: '#fff' },
    { id: 'alexa', name: 'Amazon Alexa', mark: 'amazonalexa', bg: '#00caff', ink: '#fff' },
    { id: 'applemusic', name: 'Apple Music', mark: 'applemusic', bg: 'linear-gradient(160deg,#fb5c74,#fa233b)', ink: '#fff' },
    { id: 'crunchyroll', name: 'Crunchyroll', mark: 'crunchyroll', bg: '#f47521', ink: '#fff' },
    { id: 'hulu', name: 'Hulu', mark: 'hulu', bg: '#1ce783', ink: '#0b0c0f' },
    { id: 'paramount', name: 'Paramount+', mark: 'paramountplus', bg: '#0064ff', ink: '#fff' },
    { id: 'pbs', name: 'PBS', aka: ['pbs video'], mark: 'pbs', bg: '#2638c4', ink: '#fff' },
    { id: 'peacock', name: 'Peacock', aka: ['peacock tv'], mark: 'peacock', bg: '#000', ink: '#fff' },
    { id: 'plex', name: 'Plex', mark: 'plex', bg: '#1f2326', ink: '#e5a00d' },
    { id: 'plutotv', name: 'Pluto TV', mark: 'plutotv', bg: '#fff200', ink: '#000' },
    { id: 'smartthings', name: 'SmartThings', mark: 'smartthings', bg: '#15bfff', ink: '#fff' },
    { id: 'spotify', name: 'Spotify', mark: 'spotify', bg: '#121212', ink: '#1ed760' },
    { id: 'tubi', name: 'Tubi', mark: 'tubi', bg: '#7408ff', ink: '#ffff13' },
    { id: 'twitch', name: 'Twitch', mark: 'twitch', bg: '#9146ff', ink: '#fff' },
    // No free logo, so the TV shows its own icon. The ID is the TV app ID, so this sample matches the TV.
    { id: 'HEPsqFNie0.tvplusstandalone', name: 'Samsung TV Plus', bg: '#24272b', ink: '#fff' }
  ];
  // The owners' apps in their order. A first run makes the first six installed ones favorites and hides every other app. Settings › Apps changes both.
  var OWNER_APPS = ['plex', 'youtube', 'netflix', 'appletv', 'hulu', 'primevideo', 'hbomax', 'spotify',
    'HEPsqFNie0.tvplusstandalone', 'alexa', 'smartthings'];
  var FAV_MAX = 6, STORE = 'home.v1', OLD_STORE = 'library-prototype.v1'; // Builds up to V1 saved under OLD_STORE.
  // HDMI ports. Names and visibility are the owner's choices; each port counts as connected until the TV reports.
  var INPUT_DEFAULTS = [{ port: 'HDMI 1', show: true }, { port: 'HDMI 2', show: true }, { port: 'HDMI 3', show: true }, { port: 'HDMI 4', show: false }];
  var SOURCE_APP = 'org.tizen.SMSourceAPP'; // Samsung's source list, for sources Home doesn't show (USB, antenna).
  var TABS = ['Home', 'Inputs'];
  var AMBIENT = [{ name: 'After 1 min', ms: 60000 }, { name: 'After 5 min', ms: 300000 }, { name: 'After 15 min', ms: 900000 }, { name: 'Off', ms: 0 }];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WALLS = window.CleanFrameWallpapers || [];
  var FAVS = [], ROWS = [], INS = []; // Home's favourites, library rows and input tiles, rebuilt from the owner's choices.

  var S = { tab: 0, zone: 'fav', nav: 0, fav: 0, lr: 0, lc: 0, inp: 0, panel: 0, dialog: 0, glassTiles: false, wall: 0, ambWall: 0, daily: true, dailyPick: null, amb: 0, ambient: false, scroll: 0,
    favIds: [], hiddenIds: [], lastId: '', ed: null, menu: null, menuFrom: 'fav', pages: [], panelFrom: 'gear', paging: false, pageEntered: false, queued: [],
    weather: { zip: '92626', units: 'F' }, place: null, wx: null, zip: [], zipAt: 0, inputAt: 0, // Default location: Costa Mesa, CA (where the TV is).
    inputs: INPUT_DEFAULTS.map(function (p) { return { port: p.port, name: '', show: p.show, connected: true }; }) };
  var SETTINGS = [
    { label: 'Wallpaper', kind: 'screen', value: function () { return S.daily ? 'Daily photo' : WALLS[S.wall] ? WALLS[S.wall].name : ''; }, ok: openPicker },
    { label: 'Apps', kind: 'screen', value: function () { return S.favIds.length + (S.favIds.length === 1 ? ' favorite' : ' favorites'); }, ok: openEditor },
    { label: 'Weather', kind: 'page', value: function () { return S.weather.zip ? S.weather.zip + ' · °' + S.weather.units : 'Set location'; }, ok: function () { pushPage('weather'); } },
    { label: 'Screensaver', value: function () { return AMBIENT[S.amb].name; }, ok: function () { S.amb = (S.amb + 1) % AMBIENT.length; save(); armIdle(); } },
    { label: 'Picture and sound', kind: 'link', ok: function () { openSamsung('Samsung’s picture and sound settings', window.FrameDevice.settings); } },
    { label: 'Samsung Home', kind: 'link', ok: samsungHome },
    { label: 'About', kind: 'page', ok: function () { tvReadAbout(); pushPage('about'); } }
  ];
  // Build details come from scripts/build.py; TV details are read each time About opens.
  var BUILD = window.HomeBuild || null, about = { model: '', firmware: '', tizen: '', storage: '' };
  // Rows that open a Samsung screen show an outward arrow; rows that open a screen of ours show a chevron.
  var LINK_ICON = '<svg class="ico p-link" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>';
  var CHEVRON = '<svg class="ico p-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

  var stage = $('stage'), page = $('page'), dock = $('dock'), dockLayer = $('dockLayer'), library = $('library');
  var favRow = $('favRow'), inRow = $('inRow'), focusName = $('focusName'), gear = $('gear'), toastEl = $('toast'), panelStatus = $('panelStatus');
  var resumeSlot = $('resumeSlot'), resumeTile = null;
  var tilemenuRows = $('tilemenuRows'), tilemenuTitle = $('tilemenuTitle');
  var navActive = $('navActive'), navFocus = $('navFocus'), panelInd = $('panelInd'), dialogInd = $('dialogInd');
  var navInk = $('navInk'), panelInk = $('panelInk'), dialogInk = $('dialogInk');
  var timeEl = $('time'), statusEl = stage.querySelector('.status'), ambTime = $('ambTime'), ambDate = $('ambDate'), ambTitle = $('ambTitle'), ambCredit = $('ambCredit'), ambDrift = $('ambDrift');
  var front = $('photoA'), back = $('photoB'), blurImg = $('blur');
  var pkGrid = $('pkGrid'), pkTitle = $('pkTitle'), pkCredit = $('pkCredit'), pickerEl = $('picker'), previewTimer = null;
  var panelBody = $('panelBody'), panelCrumb = $('panelCrumb'), panelTitle = $('panelTitle'), panelRowsBox = $('panelRowsBox'), panelCustom = $('panelCustom'), panelNote = $('panelNote');
  var wxBox = stage.querySelector('.weather'), wxIcon = wxBox.querySelector('.ico'), tempEl = wxBox.querySelector('span'), wxBusy = false, wxRetry = 0, zipMissing = '';
  var editorEl = $('editor'), edPage = $('edPage'), edTiles = $('edTiles'), edStyle = $('edStyle'), edHint = $('edHint');
  var edFavLabel = $('edFavLabel'), edLibLabel = $('edLibLabel'), edHidLabel = $('edHidLabel'), edEmpty = $('edEmpty'), edFavBox = $('edFavBox'), edSlots = {};
  var pills, panelRows = $('panelRows').children, dialogBtns, tileRim = '', thumbRim = '', tilePath = '', ringSvg = '', focused = null, lastZone = null, credits = {}, statusWidth = 0;
  var idleTimer = null, driftTimer = null, rotateTimer = null, toastTimer = null, statusAt = 0;
  var tvSources = {}, tvWindowOn = false; // On the TV only: real HDMI sources by port name, and whether one is showing.

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
  // A TV app without a logo here shows the TV's own icon, with its name underneath in case the icon fails.
  function appHtml(a, zone, i, col) {
    var inner = a.mark ? markHtml(a.mark) : (a.icon ? '<img class="t-icon" alt="" src="' + esc(a.icon) + '">' : '') + '<span class="t-text">' + esc(a.name) + '</span>';
    return tileHtml('', zone, i, col, '--mk:' + a.ink, inner, 'background:' + a.bg);
  }
  var PENCIL = '<svg class="ico in-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>';
  function inputHtml(s, i) {
    if (s.edit) return tileHtml(' in-tile in-edit', 'inputs', i, i, '', PENCIL + '<span class="in-name">' + esc(s.name) + '</span>', '');
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
    shape('tilemenu', TM.w, TM.h, TM.r, 'tilemenuRim');
    buildHome();
    buildResume();
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
  function nameOf(id) { return byId(id).name; }
  function byName(a, b) { return nameOf(a).localeCompare(nameOf(b)); }
  function allIds() { return APPS.map(function (a) { return a.id; }); }
  function libraryIds(fav, hid) { return H.libraryIds(allIds(), fav, hid, nameOf); }
  function buildHome() {
    FAVS = S.favIds.map(byId);
    ROWS = chunk(libraryIds(S.favIds, S.hiddenIds).map(byId), COLS);
    favRow.innerHTML = FAVS.map(function (a, i) { return appHtml(a, 'fav', i, i); }).join('');
    library.innerHTML = ROWS.map(function (row, r) {
      return '<div class="lib-row" style="top:' + r * ROW_PITCH + 'px">' + row.map(function (a, c) { return appHtml(a, 'lib', r * COLS + c, c); }).join('') + '</div>';
    }).join('');
    addRings(favRow.querySelectorAll('.tile'), library.querySelectorAll('.tile'));
    S.fav = Math.min(S.fav, FAVS.length - 1);
    S.scroll = null;
  }
  // A white ring around the focused tile, the same ring the Apps editor draws round a carried app.
  function addRings() {
    var i, j;
    for (i = 0; i < arguments.length; i++) for (j = 0; j < arguments[i].length; j++) arguments[i][j].insertAdjacentHTML('beforeend', ringSvg);
  }
  // The Resume pill shows the last app opened from Home while it is installed and not hidden.
  function resumeApp() { return S.lastId && S.hiddenIds.indexOf(S.lastId) < 0 ? byId(S.lastId) : null; }
  function buildResume() {
    var a = resumeApp();
    resumeSlot.innerHTML = a ? resumeHtml(a) : '';
    resumeTile = a ? resumeSlot.firstChild : null;
  }
  // A return arrow, "Resume" and the app's logo mark in white: a variant of the dock's tile, never a copy of it.
  // An app without a logo here is named instead.
  var RETURN = '<svg class="ico re-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
  function resumeHtml(a) {
    var mark = a.mark ? '<span class="re-mark">' + markHtml(a.mark) + '</span>' : '';
    var name = mark ? '' : '<span class="re-name">' + esc(a.name) + '</span>';
    return '<div class="re-btn" data-z="resume" data-i="0">' + RETURN + '<span class="re-label">Resume</span>' + mark + name + '</div>';
  }
  // Saves carry a version from V1 on; older saves come from test builds and get their one-time clean-ups.
  var SAVE_VERSION = 1;
  function load() {
    var d, lists, old;
    try { H.moveSave(window.localStorage, OLD_STORE, STORE); } catch (e) { /* Storage full or blocked: read what is there. */ }
    try { d = JSON.parse(window.localStorage.getItem(STORE) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') d = null;
    savedLists = d && { fav: d.fav, hid: d.hid };
    lists = H.homeLists(OWNER_APPS, allIds(), d, FAV_MAX, nameOf);
    S.favIds = lists.fav;
    S.hiddenIds = lists.hid;
    if (!d) return;
    old = d.version !== SAVE_VERSION;
    S.glassTiles = !!d.glass;
    if (typeof d.last === 'string') S.lastId = d.last;
    if (H.validIndex(d.wall, WALLS.length)) S.wall = d.wall;
    S.daily = d.daily === true; // Builds before the daily photo saved only a bundled choice, which stands.
    S.dailyPick = d.photo && typeof d.photo === 'object' ? d.photo : null;
    if (H.validIndex(d.amb, AMBIENT.length)) S.amb = d.amb;
    if (d.weather && typeof d.weather === 'object') S.weather = { zip: typeof d.weather.zip === 'string' && /^\d{5}$/.test(d.weather.zip) ? d.weather.zip : S.weather.zip, units: d.weather.units === 'C' ? 'C' : 'F' };
    S.place = H.savedPlace(d.place, S.weather.zip);
    S.wx = H.savedReading(d.wx, S.weather.zip);
    if (Array.isArray(d.inputs)) S.inputs.forEach(function (inp, n) {
      var saved = d.inputs[n];
      if (!saved) return;
      inp.name = H.inputName(n, saved.name, old);
      if (typeof saved.show === 'boolean') inp.show = saved.show;
    });
  }
  // Saves keep the owner's Favorites and Hidden whole: until the TV's app list has been read they are written back
  // unchanged, and afterwards apps the TV doesn't list right now keep their places (HomeLogic.keepMissing).
  function ownerLists() {
    var installed = allIds();
    return { fav: H.keepMissing(S.favIds, savedLists && savedLists.fav, installed, 24), hid: H.keepMissing(S.hiddenIds, savedLists && savedLists.hid, installed, 200) };
  }
  function save() {
    var inputs = S.inputs.map(function (inp) { return { name: inp.name, show: inp.show }; });
    savedLists = appsFromTv ? ownerLists() : savedLists || { fav: null, hid: null };
    try { window.localStorage.setItem(STORE, JSON.stringify({ version: SAVE_VERSION, fav: savedLists.fav, hid: savedLists.hid, last: S.lastId, wall: S.wall, daily: S.daily, photo: S.dailyPick, amb: S.amb, glass: S.glassTiles, weather: S.weather, place: S.place, wx: S.wx, inputs: inputs })); } catch (e) { /* Home still works without saved choices. */ }
  }
  function inputLabel(inp) { return inp.name || (inp.connected ? 'Connected' : 'No device'); }
  function buildInputs() {
    INS = S.inputs.filter(function (inp) { return inp.show; }).map(function (inp) { return { port: inp.port, name: inputLabel(inp), empty: !inp.connected }; });
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
      case 'resume': return resumeTile;
      case 'menu': return tilemenuRows.children[S.menu.i];
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
  function layoutZone() { return S.zone === 'menu' ? S.menuFrom : S.zone; }
  function label() {
    var on = layoutZone() === 'lib', a, x;
    toggle(focusName, 'is-on', on);
    if (!on) return;
    a = ROWS[S.lr][S.lc];
    x = GRID_LEFT + S.lc * PITCH + TILE_W / 2 - 210;
    focusName.textContent = a.name;
    focusName.style.transform = 'translate3d(' + x + 'px,' + (rowTop(S.lr) + TILE_H + LABEL_GAP) + 'px,0)';
  }
  function render() {
    var el, entered, i;
    if (S.zone === 'resume' && !resumeTile) S.zone = 'fav';
    el = focusEl(); entered = S.zone !== lastZone;
    if (focused !== el) {
      if (focused) focused.classList.remove('is-focus');
      el.classList.add('is-focus');
      focused = el;
    }
    for (i = 0; i < pills.length; i++) toggle(pills[i], 'is-active', i === S.tab);
    if (S.zone === 'panel') updatePanel();
    place(navActive, null, S.tab * PILL_W, 0, false);
    if (S.zone === 'nav') place(navFocus, navInk, S.nav * PILL_W, 0, entered);
    if (S.zone === 'panel' && !pageDef().custom) place(panelInd, panelInk, 0, curPage().i * PANEL_PITCH, entered || S.pageEntered);
    S.pageEntered = false;
    if (S.zone === 'dialog') place(dialogInd, dialogInk, S.dialog * DIALOG_PITCH, 0, entered);
    toggle(navFocus, 'is-on', S.zone === 'nav');
    toggle(stage, 'tab-inputs', S.tab === 1);
    toggle(stage, 'has-resume', S.tab === 0 && !!resumeApp());
    toggle(stage, 'is-library', layoutZone() === 'lib');
    toggle(stage, 'is-fav', S.zone === 'fav');
    toggle(stage, 'is-panel', S.zone === 'panel');
    toggle(stage, 'is-dialog', S.zone === 'dialog');
    toggle(stage, 'is-menu', S.zone === 'menu');
    toggle(stage, 'tiles-glass', S.glassTiles);
    toggle(stage, 'is-editor', S.zone === 'apps');
    if (S.zone === 'apps') renderEditor();
    toggle(stage, 'is-picker', S.zone === 'wallpaper');
    if (S.zone === 'wallpaper') renderPicker();
    scrollTo(layoutZone() === 'lib' ? libScroll(S.lr) : 0);
    label();
    lastZone = S.zone;
  }

  // ---------- Remote ----------

  function content() { return S.tab === 0 ? 'fav' : 'inputs'; }
  // The top of the Home column is the Resume pill when it shows, otherwise the favourites.
  function topZone() { return S.tab === 0 && resumeApp() ? 'resume' : content(); }
  function rowLen(r) { return ROWS[r].length; }
  function act(k) {
    switch (S.zone) {
      case 'nav':
        if (k === 'left') S.nav = Math.max(0, S.nav - 1);
        else if (k === 'right') { if (S.nav < TABS.length - 1) S.nav++; else S.zone = 'gear'; }
        else if (k === 'down' || k === 'back') S.zone = topZone();
        else if (k === 'ok') { S.tab = S.nav; if (S.tab === 1) tvReadSources(); }
        break;
      case 'gear':
        if (k === 'left') { S.zone = 'nav'; S.nav = TABS.length - 1; }
        else if (k === 'down' || k === 'back') S.zone = topZone();
        else if (k === 'ok') openPanel('root', 'gear');
        break;
      case 'resume':
        if (k === 'up') { S.zone = 'nav'; S.nav = S.tab; }
        else if (k === 'down' || k === 'back') S.zone = content();
        else if (k === 'ok') launch(resumeTile, resumeApp());
        break;
      case 'menu':
        if (k === 'up') S.menu.i = Math.max(0, S.menu.i - 1);
        else if (k === 'down') S.menu.i = Math.min(S.menu.items.length - 1, S.menu.i + 1);
        else if (k === 'ok') S.menu.items[S.menu.i].run();
        else if (k === 'back') S.zone = S.menuFrom;
        break;
      case 'fav':
        if (k === 'left') S.fav = Math.max(0, S.fav - 1);
        else if (k === 'right') S.fav = Math.min(FAVS.length - 1, S.fav + 1);
        else if (k === 'up') { if (resumeApp()) S.zone = 'resume'; else { S.zone = 'nav'; S.nav = S.tab; } }
        else if (k === 'down' && ROWS.length) { S.zone = 'lib'; S.lr = 0; S.lc = Math.min(S.fav, rowLen(0) - 1); }
        else if (k === 'ok') launch(focused, FAVS[S.fav]);
        else if (k === 'back') { S.zone = 'dialog'; S.dialog = 0; }
        break;
      case 'lib':
        if (k === 'left') S.lc = Math.max(0, S.lc - 1);
        else if (k === 'right') S.lc = Math.min(rowLen(S.lr) - 1, S.lc + 1);
        else if (k === 'up' && S.lr === 0) { S.zone = 'fav'; S.fav = Math.min(S.lc, FAVS.length - 1); }
        else if (k === 'up') { S.lr--; S.lc = Math.min(S.lc, rowLen(S.lr) - 1); }
        else if (k === 'down' && S.lr < ROWS.length - 1) { S.lr++; S.lc = Math.min(S.lc, rowLen(S.lr) - 1); }
        else if (k === 'ok') launch(focused, ROWS[S.lr][S.lc]);
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
        else if (k === 'ok') { if (S.dialog === 1) samsungHome(); S.zone = 'fav'; }
        break;
    }
    render();
    refreshLater();
  }
  // Restart the press animation on the face. A click that moves focus only grows the tile, without a press.
  function press(tile) {
    /* preview */if (quietPress) return;/* /preview */
    tile.classList.remove('is-press');
    void tile.offsetWidth;
    tile.classList.add('is-press');
  }
  // On the TV an app opens without a message; one appears only if it fails. In the preview, sample apps say what
  // would open; on the TV they only stand in until the TV's app list has been read.
  function launch(tile, a) {
    press(tile);
    if (!a.appId && window.tizen) { toast('Home is still reading the TV’s apps. Try again in a moment.'); return; }
    if (a.id !== S.lastId) { S.lastId = a.id; save(); buildResume(); }
    if (!a.appId) { toast('Opens ' + a.name + ' on the TV.'); return; }
    window.FrameDevice.launchApp(a.appId, function (err) { if (err) toast(err.message); });
  }
  function openSamsung(name, open) {
    if (!window.tizen) { toast('Opens ' + name + ' on the TV.'); return; }
    open(function (err) { if (err) toast(err.message); });
  }
  function samsungHome() { openSamsung('Samsung Home', window.FrameDevice.home); }
  // Hold OK on a Home tile opens this in-place menu. Move reuses the Apps editor (picks the app up there); Hide and
  // the Favorites toggle change the lists directly. Confirming a hold vs a tap uses OK key-up timing (TV open check 5).
  function openTileMenu() {
    var a = S.zone === 'fav' ? FAVS[S.fav] : S.zone === 'lib' ? ROWS[S.lr][S.lc] : null, isFav, items;
    if (!a) return;
    isFav = S.favIds.indexOf(a.id) >= 0;
    items = [{ label: 'Open', run: function () { S.zone = S.menuFrom; launch(S.menu.tile, a); } }, { label: 'Move', run: function () { tileMove(a.id); } }];
    items.push(isFav ? { label: 'Remove from Favorites', run: function () { tileEdit(H.unfav(lists(), a.id), a.id, a.name + ' removed from Favorites.'); } }
                     : { label: 'Add to Favorites', run: function () { tileEdit(H.addFav(lists(), a.id, FAV_MAX), a.id, a.name + ' added to Favorites.'); } });
    items.push({ label: 'Hide', run: function () { tileEdit(H.hide(lists(), a.id), a.id, a.name + ' hidden.'); } });
    S.menuFrom = S.zone;
    S.menu = { i: 0, items: items, tile: focused };
    tilemenuTitle.textContent = a.name;
    tilemenuRows.innerHTML = items.map(function (it, n) { return '<div class="tm-row" data-z="menu" data-i="' + n + '">' + esc(it.label) + '</div>'; }).join('');
    S.zone = 'menu';
    sound('select');
    render();
  }
  function tileMove(id) {
    var col = S.menuFrom === 'lib' ? S.lc : Math.max(0, S.favIds.indexOf(id));
    openEditor('home');
    S.ed.focus = id;
    S.ed.col = col;
    S.ed.carry = { id: id, sec: sectionOf(id), idx: Math.max(0, S.favIds.indexOf(id)), from: sectionOf(id) };
    S.ed.hint = 'Moving ' + byId(id).name + '. Arrows move it, OK drops it, Back cancels.';
  }
  function lists() { return { fav: S.favIds, hid: S.hiddenIds }; }
  // A tile menu change saves and returns to the dock, or says why it can't be made.
  function tileEdit(next, id, msg) {
    if (next.error) { toast(next.error); return; }
    S.favIds = next.fav;
    S.hiddenIds = next.hid;
    save();
    buildHome();
    buildResume();
    toDock(id);
    toast(msg);
  }
  // Focus the dock, on the app when it is a favorite (buildHome keeps S.fav in range otherwise).
  function toDock(id) {
    var fi = S.favIds.indexOf(id);
    S.zone = 'fav';
    if (fi >= 0) S.fav = fi;
  }
  // OK on a Home tile: a tap launches when OK is released, a hold of 450 ms opens the menu (see the held-key rule below).
  var okTimer = null, okPending = false, okArmed = false, okEl = null;
  function okPress() {
    okPending = true; okArmed = false; okEl = focused;
    clearTimeout(okTimer);
    okTimer = setTimeout(function () { if (okPending && focused === okEl) { okArmed = true; openTileMenu(); } }, 450);
  }
  function okCancel() { clearTimeout(okTimer); okPending = false; okArmed = false; okEl = null; }
  function okRelease() {
    var tap = okPending && !okArmed && focused === okEl;
    okCancel();
    if (tap) { sound('select'); act('ok'); }
  }
  function chooseInput(s) {
    press(focused);
    if (s.edit) openPanel('inputs', 'inputs');
    else if (s.list) openSamsung('Samsung’s source list', function (done) { window.FrameDevice.launchApp(SOURCE_APP, done); });
    else if (s.empty) toast('Nothing is connected to ' + s.port + '.');
    else if (!window.tizen) toast('Shows ' + s.port + ' on the TV.');
    else if (!tvShowSource(s.port)) toast(s.port + ' can’t be shown here. Samsung’s source list can switch to it.');
  }
  // Messages appear inside the settings panel while it is open, so they never cover it.
  function toast(text) {
    var el = S.zone === 'panel' ? panelStatus : toastEl;
    statusAt = Date.now();
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
      title: 'Weather', note: 'Home finds this ZIP code’s area with Zippopotam.us, then checks the weather there with Open-Meteo every 30 minutes.',
      rows: function () {
        return [
          { label: 'ZIP code', kind: 'page', value: function () { return S.weather.zip ? S.weather.zip + (S.place ? ' · ' + S.place.name : zipMissing === S.weather.zip ? ' · not found' : '') : 'Not set'; }, ok: function () { S.zip = (S.weather.zip || '00000').split(''); S.zipAt = 0; pushPage('zip'); } },
          { label: 'Units', value: function () { return S.weather.units === 'C' ? 'Celsius' : 'Fahrenheit'; }, ok: function () { S.weather.units = S.weather.units === 'C' ? 'F' : 'C'; save(); showWeather(); } }
        ];
      }
    },
    zip: { title: 'ZIP code', custom: 'zip', note: 'Up and Down change a digit. Left and Right move between digits, or type the numbers on your remote. OK saves.' },
    inputs: {
      title: 'Inputs', note: 'Names appear on the Inputs tab. Hidden inputs stay off it.',
      rows: function () {
        return S.inputs.map(function (inp, n) { return { label: inp.port, kind: 'page', value: function () { return inp.show ? inputLabel(inp) : 'Hidden'; }, ok: function () { S.inputAt = n; pushPage('input'); } }; });
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
    rename: { title: 'Name', custom: 'rename', note: 'Type a name, then press OK. Leave it empty to use the port name.' },
    about: {
      title: 'About',
      rows: function () {
        var engine = /Chrom(?:e|ium)\/(\d+)/.exec(window.navigator.userAgent);
        function tv(key) { return function () { return !window.tizen ? 'TV only' : about[key] || 'Reading…'; }; }
        return [
          { label: 'Version', value: function () { return BUILD ? BUILD.commit + ' · ' + BUILD.date : 'Browser preview'; } },
          { label: 'App size', value: function () { return BUILD ? BUILD.size : 'Not built'; } },
          { label: 'Storage', value: tv('storage') },
          { label: 'TV model', value: tv('model') },
          { label: 'Firmware', value: tv('firmware') },
          { label: 'Tizen', value: tv('tizen') },
          { label: 'Web engine', value: function () { return engine ? 'Chromium ' + engine[1] : 'Unknown'; } },
          { label: 'Page size', value: function () { return window.innerWidth + ' × ' + window.innerHeight; } }
        ];
      }
    }
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
    if (document.activeElement !== stage) stage.focus(); // Never leave the name field focused behind a closed panel.
    panelStatus.classList.remove('is-on');
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
    if (Date.now() - statusAt > 500) panelStatus.classList.remove('is-on'); // A message just shown (e.g. "saved") outlives the page change.
    S.pageEntered = true;
    if (d.custom === 'rename') {
      field = panelCustom.firstChild;
      field.value = S.inputs[S.inputAt].name;
      setTimeout(function () { field.focus({ preventScroll: true }); field.select(); field.parentNode.closest('.panel').scrollLeft = 0; }, 0);
    } else if (document.activeElement !== stage) stage.focus();
    armIdle(); // No screensaver while a name is typed.
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
    else if (k === 'ok' && rows[cur.i].ok) rows[cur.i].ok();
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
    else if (k === 'ok') { setZip(S.zip.join('')); toast('Weather location saved.'); popPage(); }
    else if (k === 'back') popPage();
  }

  // ---------- Wallpaper picker ----------

  // Daily photo comes first, then the bundled photos. Focus resting on a photo previews it full screen after a short
  // pause, so fast browsing never loads every photo. OK applies it; Back returns to Home's photo.
  var CHECK_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  var PHOTO_ICON = '<svg class="ico pk-none" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="15.5" cy="9.5" r="1.5"/></svg>';
  function pickerPhoto(n) { var t = H.pickerTarget(n); return t.daily ? dailyPhoto : bundled(t.wall); }
  function openPicker() {
    if (!pkGrid.firstChild) {
      pkGrid.innerHTML = [{ name: 'Daily photo' }].concat(WALLS).map(function (w, n) {
        return '<div class="pk-item" data-z="pk" data-i="' + n + '" style="transform:translate3d(' + (PK_LEFT + (n % 2) * (THUMB_W + PK_GAP)) + 'px,' + (PK_TOP + Math.floor(n / 2) * PK_ROW) + 'px,0)">'
          + '<div class="pk-thumb"><div class="pk-face squircle">' + (n ? '' : PHOTO_ICON) + '<img alt=""' + (n ? ' src="' + ASSETS + 'wallpapers/' + w.id + '-thumb.jpg"' : '') + '><div class="t-sheen"></div>' + thumbRim + '</div>'
          + '<span class="pk-check">' + CHECK_ICON + '</span></div><div class="pk-name"><span>' + esc(w.name) + '</span></div></div>';
      }).join('');
    }
    S.pk = { i: H.pickerIndex(S.daily, S.wall), scroll: 0, first: true };
    S.zone = 'wallpaper';
    updateDaily(); // So the Daily photo tile can show today's photo.
  }
  function closePicker() {
    clearTimeout(previewTimer);
    photoToken++; // Drops a preview still loading.
    if (shownKey !== homePhoto().key) showHome();
    S.zone = 'panel';
  }
  function renderPicker() {
    var items = pkGrid.children, n = S.pk.i, p = pickerPhoto(n), lastFirst = Math.max(0, Math.ceil(items.length / 2) - 2), thumb = items[0].querySelector('img'), i;
    for (i = 0; i < items.length; i++) toggle(items[i], 'is-applied', i === H.pickerIndex(S.daily, S.wall));
    if (dailyPhoto && thumb.getAttribute('src') !== dailyPhoto.src) thumb.src = dailyPhoto.src;
    toggle(items[0], 'is-none', !dailyPhoto);
    S.pk.scroll = -clamp(Math.floor(n / 2) - 1, 0, lastFirst) * PK_ROW;
    toggle(pickerEl, 'is-instant', S.pk.first);
    pkGrid.style.transform = 'translate3d(0,' + S.pk.scroll + 'px,0)';
    if (S.pk.first) { void pickerEl.offsetWidth; pickerEl.classList.remove('is-instant'); S.pk.first = false; }
    pkTitle.textContent = n ? p.title : 'Daily photo';
    pkCredit.textContent = n ? p.credit : dailyPhoto ? dailyPhoto.credit + ' · a new one each day' : dailyRetry === Infinity ? 'This TV can’t make the daily photo’s glass' : 'A new photo each day, once the TV is online';
    clearTimeout(previewTimer);
    if (p && shownKey !== p.key) previewTimer = setTimeout(function () { showPhoto(p); }, 260);
  }
  function pickerKey(k) {
    var i = S.pk.i, last = pkGrid.children.length - 1, t;
    if (k === 'left' && i % 2) S.pk.i = i - 1;
    else if (k === 'right' && !(i % 2) && i < last) S.pk.i = i + 1;
    else if (k === 'up' && i > 1) S.pk.i = i - 2;
    else if (k === 'down' && i + 2 <= last) S.pk.i = i + 2;
    else if (k === 'down' && Math.floor(i / 2) < Math.floor(last / 2)) S.pk.i = last;
    else if (k === 'ok') {
      clearTimeout(previewTimer);
      t = H.pickerTarget(i);
      S.daily = t.daily;
      if (!t.daily) S.wall = t.wall;
      save();
      showHome();
    }
    else if (k === 'back') closePicker();
  }

  // ---------- Apps editor ----------

  // Favourites keep their order; Library and Hidden stay in A-Z order. OK picks an app up, the arrows carry it while
  // the other apps slide aside, OK drops it and Back cancels. Every drop saves at once.
  var ED_HINT = 'Press OK on an app to pick it up, then move it with the arrows.';
  var SECTION_NAMES = { fav: 'Favorites', lib: 'Library', hid: 'Hidden' };
  function openEditor(from) {
    var i;
    if (!edTiles.firstChild) {
      edTiles.innerHTML = APPS.map(function (a, n) { return '<div class="ed-slot" data-id="' + a.id + '">' + appHtml(a, 'edapp', n, 0) + '<div class="ed-name"><span>' + esc(a.name) + '</span></div></div>'; }).join('');
      edSlots = {};
      for (i = 0; i < edTiles.children.length; i++) {
        edSlots[edTiles.children[i].getAttribute('data-id')] = edTiles.children[i];
        edTiles.children[i].firstChild.insertAdjacentHTML('beforeend', ringSvg);
      }
    }
    if (!$('edFree').firstChild) {
      for (i = 0; i < FAV_MAX; i++) $('edFree').insertAdjacentHTML('beforeend', '<svg class="ed-free" viewBox="0 0 ' + TILE_W + ' ' + TILE_H + '" style="left:' + (GRID_LEFT + i * PITCH) + 'px" aria-hidden="true"><path d="' + tilePath + '"/><text x="125" y="84">Free</text></svg>');
    }
    S.ed = { focus: S.favIds[0], col: 0, carry: null, scroll: 0, hint: ED_HINT, first: true };
    S.edFrom = from === 'home' ? 'home' : 'panel';
    S.zone = 'apps';
  }
  // Back to Settings when opened there; Move from Home's tile menu returns to the dock, on the moved app if it is a
  // favorite. Never back to the library: the lists changed, so its row and column may no longer exist.
  function closeEditor() {
    S.ed.carry = null;
    buildHome();
    buildResume();
    if (S.edFrom === 'home') toDock(S.ed.focus); else S.zone = 'panel';
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
    var L = edLists(), lay = edLayout(L), c = S.ed.carry, id, p, slot, y, s, i;
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
    for (i = 0; i < FAV_MAX; i++) toggle($('edFree').children[i], 'is-used', i < L.fav.length);
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
    // Anything that has scrolled above the view fades out whole, so no slivers show under the header.
    for (id in edSlots) {
      toggle(edSlots[id], 'is-above', lay.pos[id].y + S.ed.scroll < ED_TOP_SAFE - 8);
      toggle(edSlots[id], 'is-low', lay.pos[id].y + S.ed.scroll + ED_SPAN > SAFE_BOTTOM + 10); // Partly visible rows peek without names.
    }
    toggle(edFavBox, 'is-above', ED_FAV_Y + S.ed.scroll < ED_TOP_SAFE - 8);
    toggle(edLibLabel, 'is-above', ED_LIB_Y - ED_LABEL_GAP + S.ed.scroll < ED_TOP_SAFE - 30);
    toggle(edHidLabel, 'is-above', lay.hidLabel + S.ed.scroll < ED_TOP_SAFE - 30);
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

  // ---------- Photos ----------

  // Home shows a bundled photo with its prepared glass materials, or the daily photo: a new Unsplash photo each day
  // from Lorem Picsum (no key needed), whose glass is made on the TV. The screensaver's slideshow shows more online
  // photos (the bundled ones when offline) and changes only the background and caption, never Home's choice or glass.
  // Home writes no image files; the web engine's cache keeps recently loaded photos and evicts them by itself.
  var shownKey = '', photoToken = 0, dailyPhoto = null, dailyBusy = false, dailyRetry = 0, appliedGlass = null, retiredGlass = [];
  var slides = [], nextSlide = null, slideId = '', slid = false, onlineSlides = 0;
  // Samsung's screensaver covers ours after a minute or two while ours keeps running, so each screensaver session
  // loads at most this many online photos and then shows the bundled ones.
  var SLIDE_LIMIT = 10;
  // A photo that hasn't loaded after 20 seconds counts as failed, so a stalled request never blocks the next one.
  function loadImage(src, cors, done) {
    var im = new Image(), timer = setTimeout(function () { finish(null); }, 20000);
    function finish(result) {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      im.onload = im.onerror = null;
      done(result);
    }
    if (cors) im.crossOrigin = 'anonymous';
    im.onload = function () { finish(im); };
    im.onerror = function () { finish(null); };
    im.src = src;
  }
  function preload(urls, done) {
    var left = urls.length;
    urls.forEach(function (u) { loadImage(u, false, function () { if (--left === 0) done(); }); });
  }
  function bundled(i) {
    var w = WALLS[i], base;
    if (!w) return null;
    base = ASSETS + 'materials/' + w.id;
    return { key: 'wall:' + w.id, src: ASSETS + 'wallpapers/' + w.id + '.jpg', title: w.name, credit: credits[w.id] ? 'Photographed by ' + credits[w.id] : '',
      look: w, glass: { clear: base + '-field-clear.jpg', blur: base + '-field-blur.jpg', frost: base + '-field-frost.jpg' } };
  }
  function homePhoto() { return S.daily && dailyPhoto ? dailyPhoto : bundled(S.wall); }
  function photoClasses(w) {
    var keep = [], i, lift;
    for (i = 0; i < stage.classList.length; i++) if (stage.classList[i].indexOf('tone-') !== 0) keep.push(stage.classList[i]);
    keep.push('tone-' + (w.tone || 'dark'));
    stage.className = keep.join(' ');
    // The catalogue (or an online photo's measured look) records how bright the photo is behind the top corners
    // (ut.tr, clockMist) and how much its frost needs veiling; the capsules darken by those amounts to keep text readable.
    stage.style.setProperty('--tint-tl', (0.36 + (w.frostVeil || 0.12) * 0.5 + (w.clockMist ? 0.12 : 0)).toFixed(3));
    stage.style.setProperty('--tint-tr', ({ light: 0.34, mist: 0.5, dark: 0.62 }[w.ut && w.ut.tr] || 0.4) + (w.tone === 'light' ? 0.04 : 0));
    // A bright online photo also darkens the dock, panels, plates and shades over it; bundled photos keep their tints.
    lift = w.lift || 0;
    stage.style.setProperty('--dock-tint', (0.20 + (w.frostVeil || 0.12) * 0.5 + lift).toFixed(3));
    stage.style.setProperty('--panel-tint', (0.56 + lift).toFixed(3));
    stage.style.setProperty('--menu-tint', (0.58 + lift).toFixed(3));
    stage.style.setProperty('--veil', (0.42 + lift).toFixed(3));
    stage.style.setProperty('--plate-tint', (0.56 + lift * 1.5).toFixed(3));
    stage.style.setProperty('--empty-tint', (0.28 + lift).toFixed(3));
    stage.style.setProperty('--caption-shade', (0.55 + lift).toFixed(3));
  }
  function swapPhoto(src) {
    var swap = front;
    back.src = src;
    back.classList.add('is-front');
    front.classList.remove('is-front');
    front = back;
    back = swap;
  }
  // The glass is a blurred, registered copy of the photo, so it has to change WITH the 900ms photo cross-fade, not
  // the instant the new photo starts arriving. A frozen copy of each glass layer is kept on top and faded out over the
  // same 900ms while the real layer, now carrying the new photo's materials, shows through beneath it.
  var PHOTO_FADE = 900, glassFadeTimer = 0;
  function dropGlassGhosts() {
    var g = stage.querySelectorAll('.glass-ghost'), i;
    for (i = 0; i < g.length; i++) if (g[i].parentNode) g[i].parentNode.removeChild(g[i]);
  }
  function crossfadeGlass(glass) {
    var layers, ghosts, i, layer, ghost, imgs, n, img;
    if (glassFadeTimer) { clearTimeout(glassFadeTimer); glassFadeTimer = 0; }
    dropGlassGhosts(); // Snap any still-fading previous swap to done before starting this one.
    layers = stage.querySelectorAll('.glass-layer');
    for (i = 0; i < layers.length; i++) {
      layer = layers[i];
      ghost = layer.cloneNode(true); // Keeps the old photo's materials and the layer's registered offset.
      ghost.removeAttribute('id');
      ghost.className = layer.className + ' glass-ghost';
      // Inline, so it beats the dock layer's own (higher-specificity) transform transition.
      ghost.style.transition = 'opacity ' + PHOTO_FADE + 'ms linear';
      layer.parentNode.insertBefore(ghost, layer.nextSibling);
      imgs = layer.querySelectorAll('.glass-img');
      for (n = 0; n < imgs.length; n++) { img = imgs[n]; img.src = glass[img.getAttribute('data-material')]; }
    }
    void stage.offsetWidth; // Commit the ghosts at full opacity before fading them out, so the swap animates.
    ghosts = stage.querySelectorAll('.glass-ghost');
    for (i = 0; i < ghosts.length; i++) ghosts[i].style.opacity = '0';
    // Keep the retired glass (and any object URLs behind the ghosts) alive until the fade is done.
    glassFadeTimer = setTimeout(function () { glassFadeTimer = 0; dropGlassGhosts(); sweepGlass(); }, PHOTO_FADE);
  }
  function showPhoto(p) {
    var token = ++photoToken;
    preload([p.src, p.glass.clear, p.glass.blur, p.glass.frost], function () {
      if (token !== photoToken) return;
      shownKey = p.key;
      swapPhoto(p.src);
      blurImg.src = p.glass.blur;
      crossfadeGlass(p.glass);
      appliedGlass = p.glass;
      photoClasses(p.look);
      ambTitle.textContent = p.title;
      ambCredit.textContent = p.credit;
      render();
    });
  }
  function showHome() { var p = homePhoto(); if (p) showPhoto(p); }
  // The part of a photo that covers a w × h box, centred, as the background shows it (object-fit: cover).
  function cover(img, w, h) {
    var s = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / s, sh = h / s;
    return [(img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh];
  }
  // An online photo's glass, after CleanFrame's material recipe (scripts/build-materials.mjs): the photo with mirrored
  // edges so the blur doesn't darken them, softened 2 px for the clear layer, blurred 28 px for the library and 42 px
  // for the frost. Made at half size, which the blur hides, once for each new photo and again after a restart.
  // done(null, true) means this TV can't do it at all (no canvas filters, or the photo can't be read back).
  function makeGlass(img, done) {
    var w = 960, h = 540, pad = 48, out = {}, left = 3, r = cover(img, w, h), never = false, padded, pc, x, y;
    function canvas(cw, ch) { var c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; }
    try {
      padded = canvas(w + 2 * pad, h + 2 * pad);
      pc = padded.getContext('2d');
      if (!('filter' in pc)) { never = true; throw new Error('No canvas filters'); }
      for (y = -1; y <= 1; y++) for (x = -1; x <= 1; x++) {
        pc.setTransform(x ? -1 : 1, 0, 0, y ? -1 : 1, pad + (x === 1 ? 2 * w : 0), pad + (y === 1 ? 2 * h : 0));
        pc.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, w, h);
      }
      [['clear', 1, 1.06], ['blur', 14, 0.92], ['frost', 21, 0.92]].forEach(function (m) {
        var c = canvas(w, h), cx = c.getContext('2d');
        cx.filter = 'blur(' + m[1] + 'px) saturate(' + m[2] + ')';
        cx.drawImage(padded, -pad, -pad);
        c.toBlob(function (b) {
          out[m[0]] = b ? window.URL.createObjectURL(b) : '';
          if (--left) return;
          if (out.clear && out.blur && out.frost) done(out); else { retiredGlass.push(out); sweepGlass(); done(null, false); }
        }, 'image/jpeg', 0.86);
      });
    } catch (e) { done(null, never || e.name === 'SecurityError'); }
  }
  // Glass made for an earlier daily photo is released once nothing shows it.
  function sweepGlass() {
    if (glassFadeTimer) return; // The fading copies may still show retired glass; the fade's end sweeps.
    retiredGlass = retiredGlass.filter(function (g) {
      if (g === appliedGlass) return true;
      ['clear', 'blur', 'frost'].forEach(function (m) { if (g[m]) window.URL.revokeObjectURL(g[m]); });
      return false;
    });
  }
  // How bright the photo is behind the top bar and the dock, from a 48 × 27 copy.
  function measureLook(img) {
    var c = document.createElement('canvas'), r = cover(img, H.LOOK_W, H.LOOK_H), cx;
    c.width = H.LOOK_W;
    c.height = H.LOOK_H;
    try {
      cx = c.getContext('2d');
      cx.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, H.LOOK_W, H.LOOK_H);
      return H.lookOf(cx.getImageData(0, 0, H.LOOK_W, H.LOOK_H).data);
    } catch (e) { return H.photoLook(0.5, 0.5, 0.5, 0.5); }
  }
  // Today's photo is picked once a day from a random page of Picsum's list, then loaded and given its glass.
  // A failure retries in 5 minutes, and never on a TV that can't make the glass; meanwhile Home keeps the bundled photo.
  function updateDaily() {
    var today = H.dayKey(new Date()), pick = H.dailyFor(S.dailyPick, today);
    if ((dailyPhoto && pick && dailyPhoto.id === pick.id) || dailyBusy || Date.now() < dailyRetry) return;
    dailyBusy = true;
    function fail(never) {
      dailyBusy = false;
      dailyRetry = never ? Infinity : Date.now() + 5 * 60 * 1000;
      if (!shownKey) showHome(); // Starting offline: show the bundled photo at once.
    }
    function load(p) {
      var src = H.photoUrl(p.id, 1920, 1080);
      loadImage(src, true, function (img) {
        if (!img) { fail(); return; }
        makeGlass(img, function (glass, never) {
          if (!glass) { fail(never); return; }
          if (dailyPhoto) retiredGlass.push(dailyPhoto.glass);
          dailyPhoto = { key: 'daily:' + p.id, id: p.id, src: src, title: '', credit: H.credit(p.author), look: measureLook(img), glass: glass };
          dailyBusy = false;
          sweepGlass();
          if (S.zone === 'wallpaper') render(); else if (S.daily && !S.ambient) showHome();
        });
      });
    }
    if (pick) { load(pick); return; }
    getJson(H.listUrl(1 + Math.floor(Math.random() * H.PHOTO_PAGES)), function (list) {
      var p = H.pickPhoto(list, Math.random, S.dailyPick ? S.dailyPick.id : '');
      if (!p) { fail(); return; }
      S.dailyPick = { day: today, id: p.id, author: p.author };
      save();
      load(S.dailyPick);
    });
  }
  // The screensaver loads its next online photo ahead, so each change shows at once; offline, the bundled photos show.
  function prepareSlide() {
    var p = H.pickPhoto(slides, Math.random, slideId), token = photoToken;
    nextSlide = null;
    if (!p || onlineSlides >= SLIDE_LIMIT) return;
    loadImage(H.photoUrl(p.id, 1920, 1080), false, function (img) {
      if (img && S.ambient && token === photoToken) nextSlide = { id: p.id, src: img.src, credit: H.credit(p.author) };
    });
  }
  function nextPhoto() {
    var s = nextSlide, token = photoToken, w;
    if (s) {
      slideId = s.id;
      onlineSlides++;
      showSlide(s.src, '', s.credit);
    } else {
      S.ambWall = (S.ambWall + 1) % WALLS.length;
      w = bundled(S.ambWall);
      preload([w.src], function () { if (S.ambient && token === photoToken) showSlide(w.src, w.title, w.credit); });
    }
    prepareSlide();
  }
  function showSlide(src, title, credit) {
    slid = true;
    swapPhoto(src);
    ambTitle.textContent = title;
    ambCredit.textContent = credit;
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
    updateWeather();
    showWeather();
    if (S.daily && shownKey && !S.ambient) updateDaily();
  }
  // The status capsule changes width with the hour's digits and the weather; its glass must follow its left edge.
  function fitStatus() { if (statusEl.offsetWidth !== statusWidth) { statusWidth = statusEl.offsetWidth; registerGlass(); } }

  // ---------- Weather ----------

  // Zippopotam.us gives the ZIP code's place once; Open-Meteo gives its current conditions at most every 30 minutes.
  // Readings are saved in °C, so Home shows the last one at once after a restart. Until a reading arrives, or once it
  // is two hours old, the weather stays hidden rather than showing a made-up value. A failed check retries in 5 minutes.
  var CLOUD = '<path d="M7.6 20.4h9.9a4 4 0 0 0 .7-7.9 5.4 5.4 0 0 0-10.4 1A3.5 3.5 0 0 0 7.6 20.4Z"/>';
  var HIGH_CLOUD = '<path d="M6.6 15h9.9a4 4 0 0 0 .7-7.9 5.4 5.4 0 0 0-10.4 1A3.5 3.5 0 0 0 6.6 15Z"/>';
  var WX_ICONS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    moon: '<path d="M20.1 12.7A8.1 8.1 0 1 1 11.3 3.9a6.3 6.3 0 0 0 8.8 8.8Z"/>',
    partly: '<path d="M8 2.6v1.6M3.3 4.6l1.1 1.1M1.6 9.2h1.6M12.7 4.6l-1.1 1.1"/><path d="M4.9 11.6A3.7 3.7 0 0 1 11.7 7"/>' + CLOUD,
    'partly-night': '<path d="M10.1 7A3.6 3.6 0 1 1 6 2.9a3 3 0 0 0 4.1 4.1Z"/>' + CLOUD,
    cloud: '<path d="M6.6 17.7h9.9a4 4 0 0 0 .7-7.9 5.4 5.4 0 0 0-10.4 1A3.5 3.5 0 0 0 6.6 17.7Z"/>',
    fog: HIGH_CLOUD + '<path d="M4 18.5h16M7 21.5h10"/>',
    rain: HIGH_CLOUD + '<path d="M8.5 18l-1 3M12.5 18l-1 3M16.5 18l-1 3"/>',
    snow: HIGH_CLOUD + '<path d="M8 17.6v2.8M6.6 19h2.8M16 17.6v2.8M14.6 19h2.8M12 19.6v2.8M10.6 21h2.8"/>',
    storm: HIGH_CLOUD + '<path d="M13 15.5 10.5 19h3L11 22.5"/>'
  };
  function getJson(url, done) {
    var xhr = new XMLHttpRequest();
    xhr.onload = function () { var d = null; try { d = xhr.status === 200 ? JSON.parse(xhr.responseText) : null; } catch (e) { d = null; } done(d, xhr.status); };
    xhr.onerror = xhr.ontimeout = function () { done(null, 0); };
    xhr.open('GET', url);
    xhr.timeout = 15000;
    xhr.send();
  }
  function updateWeather() {
    var zip = S.weather.zip, now = Date.now();
    if (wxBusy || !zip || zip === zipMissing || now < wxRetry || (S.wx && !H.isStale(S.wx.at, now, H.WEATHER_MAX_AGE))) return;
    wxBusy = true;
    function finish(ok) {
      wxBusy = false;
      if (zip !== S.weather.zip) return; // The ZIP code changed meanwhile; the next tick checks the new one.
      if (!ok) wxRetry = Date.now() + 5 * 60 * 1000;
      save();
      showWeather();
    }
    function forecast(place) {
      getJson(H.weatherUrl(place.lat, place.lon), function (data) {
        var r = H.parseWeather(data, zip, Date.now());
        if (r && zip === S.weather.zip) S.wx = r;
        finish(!!r);
      });
    }
    if (S.place) { forecast(S.place); return; }
    getJson(H.zipUrl(zip), function (data, status) {
      var place = H.parsePlace(data, zip);
      if (!place) { if (status === 404) zipMissing = zip; finish(false); return; }
      if (zip === S.weather.zip) S.place = place;
      forecast(place);
    });
  }
  function showWeather() {
    var r = S.wx, on = !!r && !H.isStale(r.at, Date.now(), H.WEATHER_KEEP), icon, temp;
    if (on) {
      icon = H.weatherIcon(r.code, r.day);
      temp = H.temperature(r.c, S.weather.units) + '°';
      if (wxIcon.getAttribute('data-icon') !== icon) { wxIcon.setAttribute('data-icon', icon); wxIcon.innerHTML = WX_ICONS[icon]; }
      if (tempEl.textContent !== temp) tempEl.textContent = temp;
      wxBox.setAttribute('aria-label', H.WEATHER_WORDS[icon] + ', ' + temp.replace('°', ' degrees'));
    }
    toggle(wxBox, 'is-off', !on);
    fitStatus();
  }
  function setZip(zip) {
    if (zip !== S.weather.zip) { S.weather.zip = zip; S.place = null; S.wx = null; wxRetry = 0; }
    zipMissing = ''; // Saving a ZIP code, even the same one, looks it up again.
    save();
    showWeather();
    updateWeather();
  }
  // No screensaver while an HDMI port shows, or while a name is typed (the TV's keyboard may keep keys from Home).
  function armIdle() {
    clearTimeout(idleTimer);
    if (AMBIENT[S.amb].ms && !S.ambient && !tvWindowOn && !renaming()) idleTimer = setTimeout(enterAmbient, AMBIENT[S.amb].ms);
  }
  function renaming() { return S.zone === 'panel' && pageDef().custom === 'rename'; }
  // On this QD-OLED, Samsung's panel-protection screensaver can't be disabled and takes over after a still-ish
  // minute or two. We don't fight it (it protects the panel); ours shows first, then Samsung's runs on long idle.

  // Our screensaver only counts idle time while Home is in front. Leaving releases a held key and closes the HDMI
  // view; coming back reads the TV's apps (and, on the Inputs tab, its HDMI ports) again.
  document.addEventListener('visibilitychange', function () {
    letGo();
    if (document.hidden) {
      if (tvWindowOn) tvHideSource();
      clearTimeout(idleTimer);
    } else {
      armIdle();
      refreshApps();
      if (S.tab === 1) tvReadSources();
    }
  });
  // A slow drift keeps the clock from burning a fixed shape into the OLED panel.
  function drift() { ambDrift.style.transform = 'translate3d(' + Math.round(Math.random() * 40 - 20) + 'px,' + Math.round(Math.random() * 24 - 12) + 'px,0)'; }
  function enterAmbient() {
    if (S.ambient) return;
    if (S.zone === 'wallpaper') closePicker();
    if (S.zone === 'apps') closeEditor();
    if (S.zone === 'panel') closePanel();
    if (S.zone === 'dialog') S.zone = 'fav';
    if (S.zone === 'menu') S.zone = S.menuFrom;
    okCancel();
    S.ambient = true;
    S.ambWall = S.wall;
    onlineSlides = 0;
    slideId = dailyPhoto && shownKey === dailyPhoto.key ? dailyPhoto.id : ''; // Not shown twice in a row.
    clearTimeout(idleTimer);
    render();
    stage.classList.add('is-ambient');
    driftTimer = setInterval(drift, 20000);
    rotateTimer = setInterval(nextPhoto, 40000);
    getJson(H.listUrl(1 + Math.floor(Math.random() * H.PHOTO_PAGES)), function (list) {
      if (!S.ambient) return;
      slides = Array.isArray(list) ? list : [];
      prepareSlide();
    });
  }
  function exitAmbient() {
    S.ambient = false;
    stage.classList.remove('is-ambient');
    clearInterval(driftTimer);
    clearInterval(rotateTimer);
    ambDrift.style.transform = '';
    photoToken++; // Drops a slideshow photo still loading.
    nextSlide = null;
    slides = [];
    if (slid || shownKey !== homePhoto().key) showHome();
    slid = false;
    armIdle();
    refreshLater();
  }

  // ---------- Sounds ----------
  // A soft, quiet tick when focus moves and a slightly fuller one on OK, synthesized from low-passed noise so
  // they cost no files. The TV's own menu sounds (tizen.tvaudiocontrol) were tried but are loud with no volume
  // control, so they're not used; the owners wanted these much quieter. Web Audio on this TV adds about 0.1 s.
  var audio = null, noise = null, soundBroken = false;
  // Started at launch, so the first key press doesn't wait for the audio engine.
  function soundStart() {
    var Ctx = window.AudioContext || window.webkitAudioContext, data, i;
    if (audio || soundBroken) return;
    if (!Ctx) { soundBroken = true; return; }
    try {
      audio = new Ctx({ latencyHint: 0 });
      noise = audio.createBuffer(1, Math.round(audio.sampleRate * 0.12), audio.sampleRate);
      data = noise.getChannelData(0);
      for (i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) { audio = null; soundBroken = true; }
  }
  function sound(kind) {
    var select = kind === 'select', len = select ? 0.09 : 0.045, peak = select ? 0.1 : 0.07, t, src, filter, gain;
    soundStart();
    if (!audio) return;
    try {
      if (audio.state === 'suspended') audio.resume();
      t = audio.currentTime;
      src = audio.createBufferSource();
      src.buffer = noise;
      filter = audio.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = select ? 900 : 1600;
      gain = audio.createGain();
      // A 3 ms rise instead of an instant start takes the click out of the attack.
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + len);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(audio.destination);
      src.start(t);
      src.stop(t + len + 0.01);
    } catch (e) { audio = null; soundBroken = true; }
  }

  // OK and Back act once per press, and so does any key that wakes Home or meets the HDMI view. Like CleanFrame's
  // held-key map, a held key's repeats are ignored whether or not the TV flags them, until key-up, window blur or
  // leaving the app, or 800 ms after the key's last event if no key-up arrives. Releasing OK resolves a tap.
  var held = {}, fieldActed = -1e9; // performance.now() of the name field's last OK or Back; it never runs backwards.
  function hold(code) {
    clearTimeout(held[code]);
    held[code] = setTimeout(function () { release(code); }, 800);
  }
  function release(code) {
    if (!held[code]) return;
    clearTimeout(held[code]);
    delete held[code];
    if (KEYS[code] === 'ok') okRelease();
  }
  function letGo() {
    Object.keys(held).forEach(function (code) { clearTimeout(held[code]); });
    held = {};
    okCancel();
  }
  document.addEventListener('keydown', function (e) {
    var k = KEYS[e.keyCode], was = focused, digit = e.keyCode >= 96 && e.keyCode <= 105 ? e.keyCode - 96 : e.keyCode >= 48 && e.keyCode <= 57 ? e.keyCode - 48 : -1;
    if (held[e.keyCode]) { e.preventDefault(); hold(e.keyCode); return; }
    if (S.ambient || tvWindowOn) {
      e.preventDefault();
      hold(e.keyCode);
      if (S.ambient) exitAmbient(); else if (k === 'back') tvHideSource();
      return;
    }
    // The TV's keyboard may follow Done or Cancel with Enter or Back for the same press; that second key is ignored.
    if ((k === 'ok' || (k === 'back' && e.keyCode !== 8)) && window.performance.now() - fieldActed < 100) { e.preventDefault(); return; }
    if (document.activeElement && document.activeElement.classList.contains('p-field')) {
      if (k === 'ok' || (k === 'back' && e.keyCode !== 8)) { e.preventDefault(); hold(e.keyCode); fieldActed = window.performance.now(); act(k); }
      return;
    }
    /* preview */if (e.keyCode === KEY_HINTS) { $('hints').classList.toggle('is-off'); return; }/* /preview */
    /* preview */if (e.keyCode === KEY_AMBIENT) { enterAmbient(); return; }/* /preview */
    if (!k && digit < 0) return;
    e.preventDefault();
    armIdle();
    if (digit >= 0) { if (S.zone === 'panel' && !S.paging && pageDef().custom === 'zip') zipDigit(digit); return; }
    if (k !== 'ok' && okPending) okCancel(); // Another key during a hold cancels it.
    if (k === 'ok' || (k === 'back' && e.keyCode !== 8)) {
      if (e.repeat) return;
      hold(e.keyCode);
    } else if (e.repeat && k === 'back') return;
    if (k === 'ok') {
      if (S.zone === 'fav' || S.zone === 'lib') { okPress(); return; }
      sound('select');
    }
    act(k);
    if (k !== 'ok' && focused !== was) sound(k);
  });
  document.addEventListener('keyup', function (e) { release(e.keyCode); });
  window.addEventListener('blur', letGo);
  /* preview */
  var quietPress = false;
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
    else if (z === 'menu' && S.menu) S.menu.i = i;
    else if (z === 'edapp') { if (S.zone !== 'apps') return; S.ed.focus = APPS[i].id; z = 'apps'; }
    else if (z === 'edstyle') { if (S.zone !== 'apps') return; S.ed.focus = 'style'; z = 'apps'; }
    else if (z === 'pk') { if (S.zone !== 'wallpaper') return; S.pk.i = i; z = 'wallpaper'; }
    quietPress = el !== focused;
    S.zone = z;
    render();
    act('ok');
    quietPress = false;
  });
  /* /preview */

  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    if (!s) return; // A hidden preview reports a 0 x 0 window; the next resize fits it.
    stage.style.transform = 'scale(' + s + ')';
    stage.style.left = (window.innerWidth - 1920 * s) / 2 + 'px';
    stage.style.top = (window.innerHeight - 1080 * s) / 2 + 'px';
  }

  // On the TV, the number buttons must be registered before the app receives them (ZIP entry uses them).
  function tvSetup() {
    var i;
    if (!window.tizen || !window.tizen.tvinputdevice) return;
    for (i = 0; i <= 9; i++) { try { window.tizen.tvinputdevice.registerKey(String(i)); } catch (e) { /* Older firmware without the key keeps arrow entry. */ } }
    /* preview */$('hints').classList.add('is-off');/* /preview */
    tvReadSources();
  }
  // Settings › About. Free storage decides how many photos the TV build can carry (about 1 MB each with
  // their glass layers); the page size shows whether photos larger than 1920×1080 would add any detail.
  function tvReadAbout() {
    var si = window.tizen && window.tizen.systeminfo;
    if (!si) return;
    try { about.tizen = si.getCapability('http://tizen.org/feature/platform.version'); } catch (e) { about.tizen = e.name; }
    try {
      si.getPropertyValue('BUILD', function (b) { about.model = b.model; about.firmware = b.buildVersion; render(); }, function (err) { about.model = about.firmware = err.name; render(); });
      si.getPropertyValue('STORAGE', function (st) {
        var free = 0, total = 0;
        (st.units || []).forEach(function (u) { if (!u.isRemovable) { free += u.availableCapacity; total += u.capacity; } });
        about.storage = (free / 1e9).toFixed(1) + ' GB free of ' + (total / 1e9).toFixed(1) + ' GB';
        render();
      }, function (err) { about.storage = err.name; render(); });
    } catch (e) { about.model = about.firmware = about.storage = e.name; }
  }

  // ---------- TV inputs (only on the TV) ----------

  // The TV reports which HDMI ports have a device; tvwindow shows one full screen inside Home until Back.
  function tvReadSources() {
    var si = window.tizen && window.tizen.systeminfo;
    if (!si) return;
    try {
      si.getPropertyValue('VIDEOSOURCE', function (vs) {
        tvSources = {};
        (vs.connected || []).forEach(function (src) { if (src.type === 'HDMI') tvSources['HDMI ' + src.number] = src; });
        S.inputs.forEach(function (inp) { inp.connected = !!tvSources[inp.port]; });
        buildInputs();
        render();
      }, function (err) { toast('Couldn’t read the TV’s inputs: ' + err.message); });
    } catch (e) { toast('Couldn’t read the TV’s inputs: ' + e.message); }
  }
  function tvShowSource(port) {
    var tw = window.tizen && window.tizen.tvwindow, src = tvSources[port];
    if (!tw || !src) return false;
    try {
      tw.setSource(src, function () {
        tw.show(function () { tvWindowOn = true; clearTimeout(idleTimer); toast('Press Back to return to Home.'); },
          function (err) { toast('Couldn’t show ' + port + ': ' + err.message); }, ['0px', '0px', '1920px', '1080px'], 'MAIN', 'FRONT');
      }, function (err) { toast('Couldn’t switch to ' + port + ': ' + err.message); }, 'MAIN');
    } catch (e) { toast('Couldn’t switch to ' + port + ': ' + e.message); }
    return true;
  }
  function tvHideSource() {
    tvWindowOn = false;
    armIdle();
    try { window.tizen.tvwindow.hide(function () {}, function (err) { toast('Couldn’t close the HDMI view: ' + err.message); }, 'MAIN'); } catch (e) { toast('Couldn’t close the HDMI view: ' + e.message); }
  }

  // ---------- Installed apps (only on the TV) ----------

  // CleanFrame's device.js lists the installed apps without Samsung's internal ones and names the brands it
  // knows. Any other app matches a logo here by name ("Tubi - Free Movies & TV" is "tubi"); the rest keep the
  // TV's name and icon (HomeLogic.tvApp). The list is read at start and again whenever Home comes back to the
  // front, so apps installed meanwhile join the library; a failed read retries every 10 seconds. Until a read
  // succeeds, the sample apps hold Home's place and save() keeps the owner's Favorites and Hidden as they were.
  var BRANDS = APPS, appsFromTv = !window.tizen, savedLists = null, appsKey = '', appsBusy = false, appsTimer = null, appsPending = false;
  function onTv() { return !!(window.tizen && window.tizen.application && window.FrameDevice); }
  function readApps(done) {
    appsBusy = true;
    window.FrameDevice.apps(function (err, entries) {
      var seen = {}, list;
      appsBusy = false;
      clearTimeout(appsTimer);
      if (err || !entries || !entries.length) { appsTimer = setTimeout(refreshApps, 10000); done(null); return; }
      list = entries.map(function (e) { return H.tvApp(e, BRANDS); }).filter(function (a) { var dup = seen[a.id]; seen[a.id] = true; return !dup; });
      done(list, list.map(function (a) { return a.id + '=' + a.name; }).join('|'));
    });
  }
  function refreshApps() {
    if (!onTv() || appsBusy || !S.favIds.length) return;
    readApps(function (list, key) {
      var keep = appsFromTv ? ownerLists() : savedLists, next;
      if (!list || key === appsKey) return;
      if (busyWithApps()) { appsPending = true; return; } // Applied when that ends (refreshLater).
      APPS = list;
      appsKey = key;
      appsFromTv = true;
      next = H.homeLists(OWNER_APPS, allIds(), keep, FAV_MAX, nameOf);
      S.favIds = next.fav;
      S.hiddenIds = next.hid;
      edTiles.innerHTML = ''; // The Apps editor rebuilds its tiles when it next opens.
      buildHome();
      buildResume();
      if (S.zone === 'lib') S.zone = 'fav'; // Its rows may have changed.
      render();
    });
  }
  // Not while the screensaver runs, apps are being edited, or OK is held on a tile (its row would be rebuilt).
  function busyWithApps() { return S.ambient || okPending || S.zone === 'apps' || S.zone === 'menu'; }
  function refreshLater() {
    if (!appsPending || busyWithApps()) return;
    appsPending = false;
    refreshApps();
  }
  function start() {
    if (!onTv()) { begin(); return; }
    readApps(function (list, key) {
      if (list) { APPS = list; appsKey = key; appsFromTv = true; }
      begin();
      if (!list) toast('Home couldn’t read the TV’s apps yet and will try again shortly.');
    });
  }
  function begin() {
    var want = 'valley', i;
    /* preview */var forced = /[?&]wall=([a-z]+)/.exec(window.location.search); if (forced) want = forced[1];/* /preview */
    tvSetup();
    soundStart();
    for (i = 0; i < WALLS.length; i++) if (WALLS[i].id === want) S.wall = i;
    load(); // The owner's saved choice wins over the default.
    /* preview */if (forced) S.daily = false;/* /preview */
    build();
    if (resumeApp()) S.zone = 'resume';
    fit();
    tick();
    render();
    registerGlass();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { statusWidth = 0; tick(); });
    loadCredits(function () {
      if (!S.daily) { showHome(); return; }
      // Today's photo usually comes from the cache in a moment; showing it first avoids a flash of the bundled one.
      updateDaily();
      setTimeout(function () { if (!shownKey) showHome(); }, 2500);
    });
    setInterval(tick, 5000);
    armIdle();
    stage.focus();
    window.addEventListener('resize', fit);
    stage.addEventListener('error', function (e) { if (e.target.className === 't-icon') e.target.parentNode.parentNode.classList.add('no-icon'); }, true);
  }
  start();
}());
