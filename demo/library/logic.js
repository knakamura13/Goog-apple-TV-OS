/* Home's pure logic: no DOM, no TV APIs. The launcher uses it as window.HomeLogic, and
   scripts/test-library.mjs loads the same file in Node for unit and mutation tests. ES5 only. */
(function (root) {
  'use strict';
  var L = {};

  // TV app names carry taglines ("Plex - Free Movies & TV"); brands match on the plain name.
  L.plainName = function (name) {
    return String(name).toLowerCase().replace(/\s*[:|].*$|\s+[-–].*$/, '').replace(/\s+/g, ' ').trim();
  };

  // Only an absolute or packaged path is used as an image source, never a remote or script URL.
  L.safeIcon = function (icon) {
    return typeof icon === 'string' && icon.length <= 2048 && /^(?:\/[^\/]|file:\/\/\/|wgt-package:\/\/\/)/.test(icon) ? icon : '';
  };

  // An installed TV app becomes a catalogue brand (with its logo) when one matches, else a plain tile.
  L.tvApp = function (entry, brands) {
    var n = L.plainName(entry.name), b, i;
    for (i = 0; i < brands.length; i++) {
      b = brands[i];
      if (b.mark && (b.id === entry.brand || L.plainName(b.name) === n || (b.aka && b.aka.indexOf(n) >= 0))) {
        return { id: b.id, appId: entry.appId, name: b.name, mark: b.mark, bg: b.bg, ink: b.ink };
      }
    }
    return { id: entry.appId, appId: entry.appId, name: String(entry.name).slice(0, 40), icon: L.safeIcon(entry.icon), bg: '#24272b', ink: '#fff' };
  };

  function unique(list) { return list.filter(function (id, i) { return list.indexOf(id) === i; }); }

  // Favorites and Hidden from saved choices, or the owners' defaults on a first run, kept to installed apps.
  // A first run makes the first installed owner apps favorites and hides every installed app outside the list.
  // Favorites are capped and never empty; nothing is both a favorite and hidden.
  L.homeLists = function (owner, installed, saved, favMax, nameOf) {
    var has = function (id) { return installed.indexOf(id) >= 0; }, fav, hid;
    fav = unique((saved && saved.fav ? saved.fav : owner).filter(has)).slice(0, favMax);
    if (!fav.length) fav = installed.slice().sort(function (a, b) { return nameOf(a).localeCompare(nameOf(b)); }).slice(0, favMax);
    hid = saved && saved.hid ? saved.hid : installed.filter(function (id) { return owner.indexOf(id) < 0; });
    hid = unique(hid.filter(function (id) { return has(id) && fav.indexOf(id) < 0; }));
    return { fav: fav, hid: hid };
  };

  // The library: every installed app that is neither a favorite nor hidden, A–Z.
  L.libraryIds = function (installed, fav, hid, nameOf) {
    return installed.filter(function (id) { return fav.indexOf(id) < 0 && hid.indexOf(id) < 0; })
      .sort(function (a, b) { return nameOf(a).localeCompare(nameOf(b)); });
  };

  // Edit-in-place list changes. Each returns new lists, or { error } and leaves the lists alone.
  L.hide = function (lists, id) {
    if (lists.fav.indexOf(id) >= 0 && lists.fav.length <= 1) return { error: 'Keep at least one favorite.' };
    return { fav: lists.fav.filter(function (x) { return x !== id; }), hid: lists.hid.indexOf(id) < 0 ? lists.hid.concat([id]) : lists.hid.slice() };
  };
  L.unfav = function (lists, id) {
    if (lists.fav.length <= 1) return { error: 'Keep at least one favorite.' };
    return { fav: lists.fav.filter(function (x) { return x !== id; }), hid: lists.hid.slice() };
  };
  L.addFav = function (lists, id, favMax) {
    if (lists.fav.indexOf(id) >= 0) return { fav: lists.fav.slice(), hid: lists.hid.slice() };
    if (lists.fav.length >= favMax) return { error: 'Favorites hold ' + favMax + ' apps. Remove one first.' };
    return { fav: lists.fav.concat([id]), hid: lists.hid.filter(function (x) { return x !== id; }) };
  };

  // Early builds saved two sample input names the owners never chose; clear exactly those.
  var SAMPLE_INPUT_NAMES = ['PlayStation 5', 'Mac mini'];
  L.inputName = function (index, savedName) {
    if (typeof savedName !== 'string') return '';
    return SAMPLE_INPUT_NAMES[index] === savedName ? '' : savedName.slice(0, 24);
  };

  // An index saved for a list stays only while it is a whole number inside the list.
  L.validIndex = function (value, length) {
    return typeof value === 'number' && value % 1 === 0 && value >= 0 && value < length;
  };

  // ---------- Weather (Open-Meteo WMO codes) ----------

  L.WEATHER_MAX_AGE = 30 * 60 * 1000; // Fetch at most every 30 minutes; Home shows the cached reading meanwhile.
  L.isStale = function (at, now, maxAge) { return !at || now - at >= maxAge; };
  L.temperature = function (celsius, units) { return Math.round(units === 'C' ? celsius : celsius * 9 / 5 + 32); };
  L.weatherIcon = function (code, isDay) {
    if (code === 0 || code === 1) return isDay ? 'sun' : 'moon';
    if (code === 2) return isDay ? 'partly' : 'partly-night';
    if (code === 3) return 'cloud';
    if (code === 45 || code === 48) return 'fog';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95 && code <= 99) return 'storm';
    return 'cloud';
  };
  L.WEATHER_WORDS = { sun: 'Clear', moon: 'Clear', partly: 'Partly cloudy', 'partly-night': 'Partly cloudy', cloud: 'Cloudy', fog: 'Fog', rain: 'Rain', snow: 'Snow', storm: 'Thunderstorm' };

  // ---------- Online photos (Lorem Picsum serves Unsplash photos without a key) ----------

  L.dayKey = function (date) {
    var m = date.getMonth() + 1, d = date.getDate();
    return date.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  };
  // Today's daily photo is the saved one while the day matches, so Home keeps one photo all day.
  L.dailyFor = function (saved, today) {
    return saved && saved.day === today && typeof saved.id === 'string' && saved.id ? saved : null;
  };
  L.photoUrl = function (id, w, h) { return 'https://picsum.photos/id/' + encodeURIComponent(id) + '/' + w + '/' + h; };
  L.listUrl = function (page) { return 'https://picsum.photos/v2/list?page=' + page + '&limit=30'; };
  L.credit = function (author) { return author ? 'Photo by ' + String(author).slice(0, 60) + ' on Unsplash' : 'Photo from Unsplash'; };

  // A photo's look, from luminance samples (0–1): the overall average, the top-right corner behind the
  // time, the top-left behind the tabs, and the dock band. Mirrors the catalogue fields photoClasses reads.
  L.photoLook = function (avg, topRight, topLeft, dock) {
    return {
      tone: avg > 0.55 ? 'light' : 'dark',
      ut: { tr: topRight > 0.7 ? 'light' : topRight > 0.45 ? 'mist' : 'dark' },
      clockMist: topLeft > 0.62,
      frostVeil: Math.round(Math.max(0.12, Math.min(0.3, 0.12 + (dock - 0.45) * 0.4)) * 1000) / 1000
    };
  };

  // The wallpaper picker lists Daily photo first, then the bundled photos.
  L.pickerIndex = function (daily, wall) { return daily ? 0 : wall + 1; };
  L.pickerTarget = function (p) { return p === 0 ? { daily: true } : { daily: false, wall: p - 1 }; };

  root.HomeLogic = L;
}(typeof window !== 'undefined' ? window : this));
