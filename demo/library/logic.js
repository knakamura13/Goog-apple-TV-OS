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
  // Favorites are capped and never empty; nothing is both a favorite and hidden. A saved list that isn't an
  // array counts as missing, so a damaged save never stops Home from starting.
  L.homeLists = function (owner, installed, saved, favMax, nameOf) {
    var has = function (id) { return installed.indexOf(id) >= 0; }, fav, hid;
    fav = unique((saved && Array.isArray(saved.fav) ? saved.fav : owner).filter(has)).slice(0, favMax);
    if (!fav.length) fav = installed.slice().sort(function (a, b) { return nameOf(a).localeCompare(nameOf(b)); }).slice(0, favMax);
    hid = saved && Array.isArray(saved.hid) ? saved.hid : installed.filter(function (id) { return owner.indexOf(id) < 0; });
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
  L.WEATHER_KEEP = 2 * 60 * 60 * 1000; // An older reading is hidden rather than shown as current.
  // A clock that moved back (the TV setting its time after start-up) also makes a reading stale.
  L.isStale = function (at, now, maxAge) { return !at || now - at >= maxAge || now < at; };
  L.zipUrl = function (zip) { return 'https://api.zippopotam.us/us/' + zip; };
  L.weatherUrl = function (lat, lon) {
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current=temperature_2m,weather_code,is_day';
  };
  // A ZIP code's place from Zippopotam.us: coordinates rounded to about a kilometre, and its name. Null if unusable.
  L.parsePlace = function (data, zip) {
    var p = data && data.places && data.places[0], lat, lon;
    if (!p) return null;
    lat = parseFloat(p.latitude);
    lon = parseFloat(p.longitude);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { zip: zip, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, name: String(p['place name'] || '').slice(0, 40) };
  };
  // Open-Meteo's current conditions (°C, WMO code, day or night), or null.
  L.parseWeather = function (data, zip, now) {
    var c = data && data.current;
    if (!c || typeof c.temperature_2m !== 'number' || !isFinite(c.temperature_2m) || typeof c.weather_code !== 'number') return null;
    return { zip: zip, at: now, c: c.temperature_2m, code: c.weather_code, day: c.is_day !== 0 };
  };
  // Saved readings and places count only for the current ZIP code and with sane values.
  L.savedPlace = function (p, zip) {
    return p && p.zip === zip && typeof p.lat === 'number' && typeof p.lon === 'number' && isFinite(p.lat) && isFinite(p.lon)
      ? { zip: zip, lat: p.lat, lon: p.lon, name: typeof p.name === 'string' ? p.name.slice(0, 40) : '' } : null;
  };
  L.savedReading = function (r, zip) {
    return r && r.zip === zip && typeof r.at === 'number' && typeof r.c === 'number' && isFinite(r.c) && typeof r.code === 'number'
      ? { zip: zip, at: r.at, c: r.c, code: r.code, day: r.day !== false } : null;
  };
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
  L.PHOTO_PAGES = 33; // Picsum's list holds about 990 photos, 30 a page.
  // A random landscape photo from a page of Picsum's list, other than the one showing. Null if none fits.
  L.pickPhoto = function (list, random, avoid) {
    var fit = (Array.isArray(list) ? list : []).filter(function (e) {
      return e && typeof e.id === 'string' && /^\d+$/.test(e.id) && e.id !== avoid && e.height > 0 && e.width / e.height >= 1.3;
    }), e;
    if (!fit.length) return null;
    e = fit[Math.floor(random() * fit.length)];
    return { id: e.id, author: typeof e.author === 'string' ? e.author.slice(0, 60) : '' };
  };
  L.credit = function (author) { return author ? 'Photo by ' + String(author).slice(0, 60) + ' on Unsplash' : 'Photo from Unsplash'; };

  // An online photo's look, in the bundled catalogue's fields, from luminance (0–1): the whole photo, the top-right
  // corner behind the time, the top-left behind the tabs, and the dock band. In the catalogue ut.tr names the ink
  // that reads there, so a bright corner is 'dark'. The brighter an area, the more the glass over it is darkened
  // (photoClasses), so white text stays readable. Calibrated on the bundled photos, erring towards darker glass.
  L.photoLook = function (avg, topRight, topLeft, dock) {
    return {
      tone: avg > 0.45 ? 'light' : 'dark',
      ut: { tr: topRight < 0.35 ? 'light' : topRight < 0.75 ? 'mist' : 'dark' },
      clockMist: topLeft > 0.6,
      frostVeil: Math.round(Math.max(0.12, Math.min(0.44, 0.12 + (dock - 0.2) * 1.28)) * 1000) / 1000
    };
  };
  // The look from a 48 × 27 RGBA copy of the photo, one sample per 40 × 40 screen pixels.
  L.LOOK_W = 48;
  L.LOOK_H = 27;
  L.lookOf = function (rgba) {
    function region(x0, y0, x1, y1) {
      var sum = 0, n = 0, x, y, i;
      for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) { i = (y * L.LOOK_W + x) * 4; sum += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]; n++; }
      return sum / n / 255;
    }
    // The time's capsule, the tabs' capsule and the dock, in samples.
    return L.photoLook(region(0, 0, 47, 26), region(37, 1, 45, 2), region(2, 1, 10, 2), region(1, 19, 46, 24));
  };

  // The wallpaper picker lists Daily photo first, then the bundled photos.
  L.pickerIndex = function (daily, wall) { return daily ? 0 : wall + 1; };
  L.pickerTarget = function (p) { return p === 0 ? { daily: true } : { daily: false, wall: p - 1 }; };

  root.HomeLogic = L;
}(typeof window !== 'undefined' ? window : this));
