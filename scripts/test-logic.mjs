// Unit tests for Home's pure logic (app/logic.js), loaded in a plain sandbox exactly as the TV
// loads it. HOME_LOGIC_FILE points the tests at another copy; scripts/mutate-logic.mjs uses that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const file = process.env.HOME_LOGIC_FILE || new URL('../app/logic.js', import.meta.url).pathname;
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(file, 'utf8'), sandbox);
const L = sandbox.window.HomeLogic;
const plain = value => JSON.parse(JSON.stringify(value)); // Arrays from the sandbox compare by value.

test('plainName drops taglines, case and extra spaces', () => {
  assert.equal(L.plainName('Plex - Free Movies ＆ TV'), 'plex');
  assert.equal(L.plainName('Spotify - Music and Podcasts'), 'spotify');
  assert.equal(L.plainName('HBO Max: Stream TV & Movies'), 'hbo max');
  assert.equal(L.plainName('Peacock | Live'), 'peacock');
  assert.equal(L.plainName('  Amazon   Alexa  '), 'amazon alexa');
  assert.equal(L.plainName('Samsung TV Plus'), 'samsung tv plus');
});

test('safeIcon keeps only absolute or packaged paths', () => {
  assert.equal(L.safeIcon('/opt/usr/apps/x/icon.png'), '/opt/usr/apps/x/icon.png');
  assert.equal(L.safeIcon('file:///opt/x.png'), 'file:///opt/x.png');
  assert.equal(L.safeIcon('wgt-package:///icon.png'), 'wgt-package:///icon.png');
  for (const bad of ['javascript:alert(1)', 'http://x/y.png', '//cdn/y.png', '', 'icon.png', 42, null]) assert.equal(L.safeIcon(bad), '');
  assert.equal(L.safeIcon('/' + 'a'.repeat(2047)).length, 2048);
  assert.equal(L.safeIcon('/' + 'a'.repeat(2048)), '');
});

const brands = [
  { id: 'plex', name: 'Plex', mark: 'plex', bg: '#1', ink: '#2' },
  { id: 'hbomax', name: 'HBO Max', aka: ['max'], mark: 'hbomax', bg: '#3', ink: '#4' },
  { id: 'spotify', name: 'Spotify', mark: 'spotify', bg: '#5', ink: '#6' },
  { id: 'HEPsqFNie0.tvplusstandalone', name: 'Samsung TV Plus', bg: '#7', ink: '#8' } // no logo: never matched
];

test('tvApp matches brands by key, plain name or alias', () => {
  assert.deepEqual(plain(L.tvApp({ appId: 'kIciSQlYEM.plex', name: 'Plex - Free Movies ＆ TV', brand: '' }, brands)),
    { id: 'plex', appId: 'kIciSQlYEM.plex', name: 'Plex', mark: 'plex', bg: '#1', ink: '#2' });
  assert.equal(L.tvApp({ appId: 'x.Spotify', name: 'Something', brand: 'spotify' }, brands).id, 'spotify');
  assert.equal(L.tvApp({ appId: 'x.Max', name: 'Max', brand: '' }, brands).id, 'hbomax');
});

test('tvApp gives an unmatched app a plain tile with a safe icon', () => {
  const a = L.tvApp({ appId: 'HEPsqFNie0.tvplusstandalone', name: 'Samsung TV Plus', icon: '/opt/i.png' }, brands);
  assert.deepEqual(plain(a), { id: 'HEPsqFNie0.tvplusstandalone', appId: 'HEPsqFNie0.tvplusstandalone', name: 'Samsung TV Plus', icon: '/opt/i.png', bg: '#24272b', ink: '#fff' });
  assert.equal(L.tvApp({ appId: 'a.b', name: 'x'.repeat(50), icon: 'javascript:1' }, brands).name.length, 40);
  assert.equal(L.tvApp({ appId: 'a.b', name: 'Y', icon: 'javascript:1' }, brands).icon, '');
});

const names = { plex: 'Plex', youtube: 'YouTube', netflix: 'Netflix', hulu: 'Hulu', alexa: 'Amazon Alexa', disney: 'Disney+', sling: 'Sling TV', spotify: 'Spotify' };
const nameOf = id => names[id];
const owner = ['plex', 'youtube', 'netflix', 'hulu', 'spotify', 'alexa'];

test('homeLists on a first run: owner order, installed only, capped, everything else hidden', () => {
  const installed = ['netflix', 'disney', 'plex', 'sling', 'alexa', 'hulu', 'youtube'];
  const r = plain(L.homeLists(owner, installed, null, 3, nameOf));
  assert.deepEqual(r.fav, ['plex', 'youtube', 'netflix']);
  assert.deepEqual(r.hid, ['disney', 'sling']);
});

test('homeLists honours saved lists, drops uninstalled and duplicate ids, never overlaps', () => {
  const installed = ['plex', 'youtube', 'netflix', 'disney'];
  const r = plain(L.homeLists(owner, installed, { fav: ['netflix', 'gone', 'netflix', 'plex'], hid: ['plex', 'disney', 'disney', 'gone'] }, 6, nameOf));
  assert.deepEqual(r.fav, ['netflix', 'plex']);
  assert.deepEqual(r.hid, ['disney']);
});

test('homeLists with saved favorites but no saved hidden list hides only non-owner apps', () => {
  // An older saved shape: the first owner app is installed but not a saved favorite, so it must stay visible.
  const r = plain(L.homeLists(owner, ['plex', 'netflix', 'disney'], { fav: ['netflix'] }, 6, nameOf));
  assert.deepEqual(r.fav, ['netflix']);
  assert.deepEqual(r.hid, ['disney']);
});

test('homeLists treats damaged saved lists as missing', () => {
  const r = plain(L.homeLists(owner, ['plex', 'netflix', 'disney'], { fav: 'netflix', hid: 7 }, 6, nameOf));
  assert.deepEqual(r.fav, ['plex', 'netflix']);
  assert.deepEqual(r.hid, ['disney']);
});

test('homeLists never leaves Favorites empty', () => {
  const r = plain(L.homeLists(owner, ['sling', 'disney'], { fav: ['gone'], hid: [] }, 6, nameOf));
  assert.deepEqual(r.fav, ['disney', 'sling']);
  const first = plain(L.homeLists(['nothing'], ['sling', 'disney'], null, 1, nameOf));
  assert.deepEqual(first.fav, ['disney']);
  assert.deepEqual(first.hid, ['sling']);
});

test('keepMissing keeps saved apps the TV doesn\'t list right now, in their saved places', () => {
  // Plex is being updated: Home shows the rest, and the save keeps Plex first.
  assert.deepEqual(plain(L.keepMissing(['youtube', 'netflix'], ['plex', 'youtube', 'netflix'], ['youtube', 'netflix'], 24)), ['plex', 'youtube', 'netflix']);
  // An installed app the owner removed stays removed.
  assert.deepEqual(plain(L.keepMissing(['youtube'], ['plex', 'youtube'], ['plex', 'youtube'], 24)), ['youtube']);
  // A missing app saved past the end of the shown list goes last.
  assert.deepEqual(plain(L.keepMissing(['a'], ['a', 'b', 'c', 'gone'], ['a', 'b', 'c'], 24)), ['a', 'gone']);
  // Duplicates and damaged entries are dropped; a damaged list counts as empty.
  assert.deepEqual(plain(L.keepMissing(['a'], ['x', 'x', 7, null], ['a'], 24)), ['x', 'a']);
  assert.deepEqual(plain(L.keepMissing(['a'], 'oops', ['a'], 24)), ['a']);
  // The list never grows past its cap.
  assert.deepEqual(plain(L.keepMissing(['a', 'b'], ['z'], ['a', 'b'], 2)), ['z', 'a']);
});

test('libraryIds lists the rest A–Z when no order is saved', () => {
  assert.deepEqual(plain(L.libraryIds(['sling', 'plex', 'alexa', 'disney', 'hulu'], ['plex'], ['disney'], null, nameOf)), ['alexa', 'hulu', 'sling']);
  assert.deepEqual(plain(L.libraryIds(['sling', 'alexa'], [], [], 'oops', nameOf)), ['alexa', 'sling']);
});

test('libraryIds keeps the saved order and puts apps it does not place after it, A–Z', () => {
  const installed = ['sling', 'plex', 'spotify', 'disney', 'hulu', 'alexa'];
  // Sling and Hulu are placed; Spotify and Alexa are new; Plex (a favorite), Disney (hidden) and Gone are skipped.
  assert.deepEqual(plain(L.libraryIds(installed, ['plex'], ['disney'], ['sling', 'gone', 'plex', 'hulu', 'disney', 'sling'], nameOf)), ['sling', 'hulu', 'alexa', 'spotify']);
});

const base = { fav: ['a', 'b', 'c'], lib: ['d', 'e', 'f', 'g', 'h'], hid: ['z'] };

test('dropAt moves an app within and between sections', () => {
  assert.deepEqual(plain(L.dropAt(base, { id: 'a', sec: 'fav', idx: 2 }, 6)), { fav: ['b', 'c', 'a'], lib: ['d', 'e', 'f', 'g', 'h'], hid: ['z'] });
  assert.deepEqual(plain(L.dropAt(base, { id: 'a', sec: 'lib', idx: 1 }, 6)), { fav: ['b', 'c'], lib: ['d', 'a', 'e', 'f', 'g', 'h'], hid: ['z'] });
  assert.deepEqual(plain(L.dropAt(base, { id: 'g', sec: 'fav', idx: 0 }, 6)), { fav: ['g', 'a', 'b', 'c'], lib: ['d', 'e', 'f', 'h'], hid: ['z'] });
  assert.deepEqual(plain(L.dropAt(base, { id: 'z', sec: 'lib', idx: 99 }, 6)), { fav: ['a', 'b', 'c'], lib: ['d', 'e', 'f', 'g', 'h', 'z'], hid: [] });
  assert.deepEqual(plain(L.dropAt(base, { id: 'd', sec: 'hid', idx: 0 }, 6)), { fav: ['a', 'b', 'c'], lib: ['e', 'f', 'g', 'h'], hid: ['d', 'z'] });
});

test('dropAt into a full dock pushes its last app to the top of the library', () => {
  assert.deepEqual(plain(L.dropAt(base, { id: 'e', sec: 'fav', idx: 1 }, 3)), { fav: ['a', 'e', 'b'], lib: ['c', 'd', 'f', 'g', 'h'], hid: ['z'] });
  assert.deepEqual(plain(L.dropAt(base, { id: 'b', sec: 'fav', idx: 0 }, 3)), { fav: ['b', 'a', 'c'], lib: ['d', 'e', 'f', 'g', 'h'], hid: ['z'] });
});

test('carryStep in the dock: Left and Right stop at the ends, a full dock has no extra slot', () => {
  const at = (sec, idx, id = 'a') => ({ id, sec, idx });
  assert.deepEqual(plain(L.carryStep(base, at('fav', 0), 'left', 6, 3)), at('fav', 0));
  assert.deepEqual(plain(L.carryStep(base, at('fav', 1), 'right', 6, 3)), at('fav', 2));
  assert.deepEqual(plain(L.carryStep(base, at('fav', 2), 'right', 6, 3)), at('fav', 2)); // Two others: slots 0–2.
  assert.deepEqual(plain(L.carryStep(base, at('fav', 2, 'd'), 'right', 6, 3)), at('fav', 3, 'd')); // From the library: room at the end.
  assert.deepEqual(plain(L.carryStep(base, at('fav', 2, 'd'), 'right', 3, 3)), at('fav', 2, 'd')); // Full dock: no slot past the last.
  assert.deepEqual(plain(L.carryStep(base, at('fav', 1), 'up', 6, 3)), at('fav', 1));
});

test('carryStep between dock and library', () => {
  const at = (sec, idx, id = 'a') => ({ id, sec, idx });
  assert.deepEqual(plain(L.carryStep(base, at('fav', 2), 'down', 6, 3)), at('lib', 2));
  assert.deepEqual(plain(L.carryStep({ fav: ['a'], lib: ['d'], hid: [] }, at('fav', 0), 'down', 6, 3)), { error: 'Keep at least one favorite.' });
  assert.deepEqual(plain(L.carryStep({ fav: ['a', 'b', 'c', 'x'], lib: [], hid: [] }, at('fav', 3), 'down', 6, 3)), at('lib', 0)); // An empty library.
  assert.deepEqual(plain(L.carryStep(base, at('lib', 2, 'd'), 'up', 6, 3)), at('fav', 2, 'd'));
  assert.deepEqual(plain(L.carryStep(base, at('lib', 2, 'd'), 'up', 3, 3)), at('fav', 2, 'd'));
  assert.deepEqual(plain(L.carryStep({ fav: ['a', 'b'], lib: ['d', 'e', 'f'], hid: [] }, at('lib', 2, 'd'), 'up', 6, 3)), at('fav', 2, 'd'));
  assert.deepEqual(plain(L.carryStep({ fav: ['a', 'b', 'c'], lib: ['d', 'e', 'f'], hid: [] }, at('lib', 2, 'd'), 'up', 3, 3)), at('fav', 2, 'd'));
});

test('carryStep in the library: reading order, rows, and Hidden only in the editor', () => {
  const at = (sec, idx, id = 'd') => ({ id, sec, idx });
  assert.deepEqual(plain(L.carryStep(base, at('lib', 0), 'left', 6, 3)), at('lib', 0));
  assert.deepEqual(plain(L.carryStep(base, at('lib', 2), 'right', 6, 3)), at('lib', 3)); // Wraps to the next row.
  assert.deepEqual(plain(L.carryStep(base, at('lib', 4), 'right', 6, 3)), at('lib', 4)); // Four others: places 0–4.
  assert.deepEqual(plain(L.carryStep(base, at('lib', 4), 'up', 6, 3)), at('lib', 1));
  assert.deepEqual(plain(L.carryStep(base, at('lib', 3), 'up', 6, 3)), at('lib', 0)); // The second row's first place.
  assert.deepEqual(plain(L.carryStep(base, at('lib', 2), 'down', 6, 3)), at('lib', 4)); // The short last row.
  assert.deepEqual(plain(L.carryStep(base, at('lib', 4), 'down', 6, 3)), at('lib', 4));
  assert.deepEqual(plain(L.carryStep(base, at('lib', 4), 'down', 6, 3, true)), at('hid', 0));
  assert.deepEqual(plain(L.carryStep(base, at('hid', 0, 'z'), 'up', 6, 3, true)), at('lib', 5, 'z'));
  assert.deepEqual(plain(L.carryStep(base, at('hid', 0, 'z'), 'left', 6, 3, true)), at('hid', 0, 'z'));
});

test('hide moves an app to Hidden and keeps one favorite', () => {
  assert.deepEqual(plain(L.hide({ fav: ['plex', 'hulu'], hid: ['sling'] }, 'plex')), { fav: ['hulu'], hid: ['sling', 'plex'] });
  assert.deepEqual(plain(L.hide({ fav: ['plex'], hid: [] }, 'alexa')), { fav: ['plex'], hid: ['alexa'] });
  assert.deepEqual(plain(L.hide({ fav: ['plex'], hid: ['alexa'] }, 'alexa')), { fav: ['plex'], hid: ['alexa'] });
  assert.equal(L.hide({ fav: ['plex'], hid: [] }, 'plex').error, 'Keep at least one favorite.');
});

test('unfav keeps one favorite', () => {
  assert.deepEqual(plain(L.unfav({ fav: ['plex', 'hulu'], hid: ['x'] }, 'hulu')), { fav: ['plex'], hid: ['x'] });
  assert.equal(L.unfav({ fav: ['plex'], hid: [] }, 'plex').error, 'Keep at least one favorite.');
});

test('addFav respects the cap and unhides', () => {
  assert.deepEqual(plain(L.addFav({ fav: ['plex'], hid: ['alexa', 'sling'] }, 'alexa', 2)), { fav: ['plex', 'alexa'], hid: ['sling'] });
  assert.equal(L.addFav({ fav: ['plex', 'hulu'], hid: [] }, 'alexa', 2).error, 'Favorites hold 2 apps. Remove one first.');
  assert.deepEqual(plain(L.addFav({ fav: ['plex', 'hulu'], hid: [] }, 'plex', 2)), { fav: ['plex', 'hulu'], hid: [] });
});

test('inputName clears the two sample names from a test build\'s save, in their own slots only', () => {
  assert.equal(L.inputName(0, 'PlayStation 5', true), '');
  assert.equal(L.inputName(1, 'Mac mini', true), '');
  assert.equal(L.inputName(1, 'PlayStation 5', true), 'PlayStation 5');
  assert.equal(L.inputName(2, 'Mac mini', true), 'Mac mini');
  assert.equal(L.inputName(0, 'Apple TV', true), 'Apple TV');
  assert.equal(L.inputName(0, 'x'.repeat(30), true).length, 24);
  assert.equal(L.inputName(0, undefined, true), '');
});

test('inputName keeps an owner\'s name that matches a sample name in a V1 save', () => {
  assert.equal(L.inputName(0, 'PlayStation 5', false), 'PlayStation 5');
  assert.equal(L.inputName(1, 'Mac mini', false), 'Mac mini');
  assert.equal(L.inputName(0, 'x'.repeat(30), false).length, 24);
  assert.equal(L.inputName(0, 7, false), '');
});

test('validIndex accepts whole numbers inside the list only', () => {
  assert.equal(L.validIndex(0, 3), true);
  assert.equal(L.validIndex(2, 3), true);
  for (const bad of [3, -1, 1.5, '1', null, NaN]) assert.equal(L.validIndex(bad, 3), false);
});

test('weather cache goes stale after 30 minutes', () => {
  const max = L.WEATHER_MAX_AGE;
  assert.equal(max, 1800000);
  assert.equal(L.isStale(0, 5, max), true);
  assert.equal(L.isStale(1000, 1000 + max - 1, max), false);
  assert.equal(L.isStale(1000, 1000 + max, max), true);
  assert.equal(L.isStale(1000, 999, max), true); // The clock moved back.
  assert.equal(L.isStale(1000, 1000, max), false); // Just fetched.
  assert.equal(L.WEATHER_KEEP, 7200000);
});

test('weather URLs', () => {
  assert.equal(L.zipUrl('92626'), 'https://api.zippopotam.us/us/92626');
  assert.equal(L.weatherUrl(33.68, -117.91), 'https://api.open-meteo.com/v1/forecast?latitude=33.68&longitude=-117.91&current=temperature_2m,weather_code,is_day');
});

test('parsePlace reads Zippopotam.us and rejects anything else', () => {
  const costaMesa = { places: [{ 'place name': 'Costa Mesa', longitude: '-117.9085', latitude: '33.6801' }] };
  assert.deepEqual(plain(L.parsePlace(costaMesa, '92626')), { zip: '92626', lat: 33.68, lon: -117.91, name: 'Costa Mesa' });
  assert.equal(L.parsePlace({ places: [{ 'place name': 'X'.repeat(50), longitude: '0', latitude: '0' }] }, '1').name.length, 40);
  assert.equal(L.parsePlace({ places: [{ longitude: '180', latitude: '-90' }] }, '1').name, '');
  for (const bad of [null, {}, { places: [] }, { places: 'abc' }, { places: [{ latitude: 'x', longitude: '1' }] }, { places: [{ latitude: '1', longitude: 'x' }] },
    { places: [{ latitude: '91', longitude: '0' }] }, { places: [{ latitude: '-91', longitude: '0' }] }, { places: [{ latitude: '0', longitude: '181' }] },
    { places: [{ latitude: '0', longitude: '-181' }] }]) assert.equal(L.parsePlace(bad, '1'), null, JSON.stringify(bad));
});

test('parseWeather reads Open-Meteo current conditions', () => {
  const night = { current: { temperature_2m: 18.9, weather_code: 3, is_day: 0 } };
  assert.deepEqual(plain(L.parseWeather(night, '92626', 5)), { zip: '92626', at: 5, c: 18.9, code: 3, day: false });
  assert.equal(L.parseWeather({ current: { temperature_2m: 20, weather_code: 0, is_day: 1 } }, 'z', 1).day, true);
  assert.equal(L.parseWeather({ current: { temperature_2m: 20, weather_code: 0 } }, 'z', 1).day, true);
  for (const bad of [null, {}, { current: {} }, { current: { temperature_2m: '18', weather_code: 3 } }, { current: { temperature_2m: Infinity, weather_code: 3 } },
    { current: { temperature_2m: 18, weather_code: '3' } }]) assert.equal(L.parseWeather(bad, 'z', 1), null, JSON.stringify(bad));
});

test('saved places and readings count only for the current ZIP code', () => {
  const place = { zip: '92626', lat: 33.68, lon: -117.91, name: 'Costa Mesa' };
  assert.deepEqual(plain(L.savedPlace(place, '92626')), place);
  assert.equal(L.savedPlace(Object.assign({}, place, { name: 7 }), '92626').name, '');
  assert.equal(L.savedPlace(Object.assign({}, place, { name: 'N'.repeat(50) }), '92626').name.length, 40);
  for (const bad of [null, place && Object.assign({}, place, { zip: '10001' }), Object.assign({}, place, { lat: '33' }), Object.assign({}, place, { lon: '1' }),
    Object.assign({}, place, { lat: NaN }), Object.assign({}, place, { lon: Infinity })]) assert.equal(L.savedPlace(bad, '92626'), null);
  const reading = { zip: '92626', at: 10, c: 18.9, code: 3, day: false };
  assert.deepEqual(plain(L.savedReading(reading, '92626')), reading);
  assert.equal(L.savedReading(Object.assign({}, reading, { day: undefined }), '92626').day, true);
  for (const bad of [null, Object.assign({}, reading, { zip: '1' }), Object.assign({}, reading, { at: '10' }), Object.assign({}, reading, { c: '18' }),
    Object.assign({}, reading, { c: NaN }), Object.assign({}, reading, { code: '3' })]) assert.equal(L.savedReading(bad, '92626'), null);
});

test('temperature converts and rounds', () => {
  assert.equal(L.temperature(20, 'F'), 68);
  assert.equal(L.temperature(18.5, 'F'), 65);
  assert.equal(L.temperature(18.5, 'C'), 19);
  assert.equal(L.temperature(-3.6, 'C'), -4);
});

test('weatherIcon maps WMO codes and day/night', () => {
  const cases = [[0, 1, 'sun'], [0, 0, 'moon'], [1, 1, 'sun'], [2, 1, 'partly'], [2, 0, 'partly-night'], [3, 1, 'cloud'],
    [45, 1, 'fog'], [48, 0, 'fog'], [51, 1, 'rain'], [67, 1, 'rain'], [80, 1, 'rain'], [82, 1, 'rain'], [71, 1, 'snow'],
    [77, 1, 'snow'], [85, 1, 'snow'], [86, 1, 'snow'], [95, 1, 'storm'], [99, 1, 'storm'], [50, 1, 'cloud'], [68, 1, 'cloud'],
    [83, 1, 'cloud'], [100, 1, 'cloud']];
  for (const [code, day, icon] of cases) assert.equal(L.weatherIcon(code, day), icon, 'code ' + code);
  assert.equal(L.WEATHER_WORDS.storm, 'Thunderstorm');
});

test('savedPick keeps a usable saved photo, whatever day a V1 save gave it', () => {
  assert.deepEqual(plain(L.savedPick({ day: '2026-10-31', id: '1015', author: 'A' })), { id: '1015', author: 'A' });
  assert.deepEqual(plain(L.savedPick({ id: '7' })), { id: '7', author: '' });
  assert.equal(L.savedPick({ id: '7', author: 'B'.repeat(70) }).author.length, 60);
  for (const bad of [null, 5, 'x', { id: '' }, { id: 12 }, { id: 'a1' }]) assert.equal(L.savedPick(bad), null, JSON.stringify(bad));
});

test('randomDue: a new random photo after the screensaver delay, never while it is Off or nothing has shown', () => {
  assert.equal(L.randomDue(160000, 100000, 60000, 0), true);
  assert.equal(L.randomDue(159999, 100000, 60000, 0), false);
  assert.equal(L.randomDue(999999, 100000, 0, 0), false);
  assert.equal(L.randomDue(999999, 0, 60000, 0), false);
});

test('randomDue: not when the screensaver starts before the next 5 s check', () => {
  assert.equal(L.randomDue(160000, 100000, 60000, 165000), false);
  assert.equal(L.randomDue(160000, 100000, 60000, 165001), true);
  assert.equal(L.randomDue(160000, 100000, 60000, 158000), false); // Already due: it is starting.
});

test('photo URLs and credits', () => {
  assert.equal(L.photoUrl('1015', 1920, 1080), 'https://picsum.photos/id/1015/1920/1080');
  assert.equal(L.photoUrl('a/b', 1, 2), 'https://picsum.photos/id/a%2Fb/1/2');
  assert.equal(L.listUrl(4), 'https://picsum.photos/v2/list?page=4&limit=30');
  assert.equal(L.credit('Ann Lee'), 'Photo by Ann Lee on Unsplash');
  assert.equal(L.credit(''), 'Photo from Unsplash');
  assert.equal(L.credit('x'.repeat(80)), 'Photo by ' + 'x'.repeat(60) + ' on Unsplash');
});

test('photoLook darkens the glass over brighter areas', () => {
  assert.deepEqual(plain(L.photoLook(0.6, 0.8, 0.7, 0.5)), { tone: 'light', ut: { tr: 'dark' }, clockMist: true, frostVeil: 0.44, lift: 0.09 });
  assert.deepEqual(plain(L.photoLook(0.45, 0.75, 0.6, 0.2)), { tone: 'dark', ut: { tr: 'dark' }, clockMist: false, frostVeil: 0.12, lift: 0 });
  assert.deepEqual(plain(L.photoLook(0.2, 0.35, 0.1, 0.3)), { tone: 'dark', ut: { tr: 'mist' }, clockMist: false, frostVeil: 0.248, lift: 0 });
  assert.equal(L.photoLook(0.7, 0.2, 0.2, 0.2).lift, 0.15); // Brighter photos darken the panels more ...
  assert.equal(L.photoLook(0.95, 0.2, 0.2, 0.2).lift, 0.25); // ... up to a limit.
  assert.equal(L.photoLook(0.86, 0.2, 0.2, 0.2).lift, 0.246);
  assert.equal(L.photoLook(0.2, 0.34, 0.1, 0.1).ut.tr, 'light');
  assert.equal(L.photoLook(0.2, 0.74, 0.1, 0.1).ut.tr, 'mist');
  assert.equal(L.photoLook(0.46, 0.2, 0.61, 0.1).tone, 'light');
  assert.equal(L.photoLook(0.46, 0.2, 0.61, 0.1).clockMist, true);
  assert.equal(L.photoLook(0.2, 0.2, 0.2, 0.45).frostVeil, 0.44);
  assert.equal(L.photoLook(0.2, 0.2, 0.2, 0.4).frostVeil, 0.376);
});

test('lookOf measures the top corners and the dock band of a 48 x 27 copy', () => {
  const size = L.LOOK_W * L.LOOK_H * 4;
  const fill = (value, cells) => { const a = new Uint8ClampedArray(size).fill(value); for (const [x0, y0, x1, y1, v] of cells || []) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a.fill(v, (y * L.LOOK_W + x) * 4, (y * L.LOOK_W + x) * 4 + 3); return a; };
  assert.equal(L.LOOK_W, 48);
  assert.equal(L.LOOK_H, 27);
  assert.deepEqual(plain(L.lookOf(fill(255))), { tone: 'light', ut: { tr: 'dark' }, clockMist: true, frostVeil: 0.44, lift: 0.25 });
  assert.deepEqual(plain(L.lookOf(fill(0))), { tone: 'dark', ut: { tr: 'light' }, clockMist: false, frostVeil: 0.12, lift: 0 });
  // Only the time's corner is bright.
  assert.deepEqual(plain(L.lookOf(fill(0, [[37, 1, 45, 2, 255]]))), { tone: 'dark', ut: { tr: 'dark' }, clockMist: false, frostVeil: 0.12, lift: 0 });
  // Only the tabs' corner is bright.
  assert.equal(L.lookOf(fill(0, [[2, 1, 10, 2, 255]])).clockMist, true);
  // Bright just outside each region changes nothing.
  assert.deepEqual(plain(L.lookOf(fill(0, [[36, 0, 47, 0, 255], [46, 1, 47, 2, 255], [36, 3, 47, 3, 255], [0, 1, 1, 2, 255], [11, 1, 11, 2, 255]]))).ut, { tr: 'light' });
  assert.equal(L.lookOf(fill(0, [[0, 0, 12, 0, 255], [0, 3, 12, 3, 255], [0, 1, 1, 2, 255], [11, 1, 12, 2, 255]])).clockMist, false);
  assert.equal(L.lookOf(fill(0, [[0, 18, 47, 18, 255], [0, 25, 47, 26, 255], [0, 19, 0, 24, 255], [47, 19, 47, 24, 255]])).frostVeil, 0.12);
  // A region's last row and last column count too.
  assert.equal(L.lookOf(fill(0, [[37, 1, 45, 1, 178], [37, 2, 45, 2, 255]])).ut.tr, 'dark');
  assert.equal(L.lookOf(fill(0, [[37, 1, 44, 2, 186], [45, 1, 45, 2, 255]])).ut.tr, 'dark');
  // Only the dock band is bright; channels weigh as luminance (green most).
  assert.equal(L.lookOf(fill(0, [[1, 19, 46, 24, 255]])).frostVeil, 0.44);
  const green = new Uint8ClampedArray(size); for (let i = 1; i < size; i += 4) green[i] = 255;
  assert.equal(L.lookOf(green).tone, 'light');
  const red = new Uint8ClampedArray(size); for (let i = 0; i < size; i += 4) red[i] = 255;
  assert.equal(L.lookOf(red).tone, 'dark');
});

test('pickPhoto picks a random landscape photo other than the one showing', () => {
  const list = [{ id: '1', author: 'A', width: 5000, height: 3333 }, { id: '2', author: 'B', width: 3000, height: 4000 }, { id: '3', author: 'C', width: 1920, height: 1080 },
    { id: 'x', width: 100, height: 50 }, null, { id: '4', width: 100, height: 0 }, { id: 5, width: 100, height: 50 }];
  assert.deepEqual(plain(L.pickPhoto(list, () => 0, '')), { id: '1', author: 'A' });
  assert.deepEqual(plain(L.pickPhoto(list, () => 0.99, '')), { id: '3', author: 'C' });
  assert.deepEqual(plain(L.pickPhoto(list, () => 0, '1')), { id: '3', author: 'C' });
  assert.equal(L.pickPhoto([{ id: '5', width: 13, height: 10 }], () => 0, '').author, '');
  assert.equal(L.pickPhoto([{ id: '5', width: 129, height: 100 }], () => 0, ''), null);
  assert.equal(L.pickPhoto([{ id: '5', author: 'Z'.repeat(70), width: 2, height: 1 }], () => 0, '').author.length, 60);
  for (const bad of ['nope', [], null]) assert.equal(L.pickPhoto(bad, () => 0, ''), null);
  assert.equal(L.PHOTO_PAGES, 33);
});

test('picker index maps Random photo first, then bundled photos', () => {
  assert.equal(L.pickerIndex(true, 5), 0);
  assert.equal(L.pickerIndex(false, 0), 1);
  assert.equal(L.pickerIndex(false, 4), 5);
  assert.deepEqual(plain(L.pickerTarget(0)), { random: true });
  assert.deepEqual(plain(L.pickerTarget(1)), { random: false, wall: 0 });
  assert.deepEqual(plain(L.pickerTarget(6)), { random: false, wall: 5 });
});

test('wallIndex reads a saved photo by id, or by its place in the V1 catalogue', () => {
  const ids = ['misty', 'valley', 'amber'], v1 = ['misty', 'valley', 'summit', 'amber'];
  assert.equal(L.wallIndex('amber', ids, v1, 1), 2);
  assert.equal(L.wallIndex(3, ids, v1, 1), 2); // V1 index 3 was Amber hills.
  assert.equal(L.wallIndex(0, ids, v1, 1), 0);
  assert.equal(L.wallIndex(2, ids, v1, 1), 1); // A removed photo falls back.
  assert.equal(L.wallIndex('summit', ids, v1, 1), 1);
  for (const bad of [4, -1, 1.5, null, undefined, '', 'nope']) assert.equal(L.wallIndex(bad, ids, v1, 1), 1, String(bad));
});

// A stand-in for localStorage: getItem returns null for a missing key, as the browser does.
function storage(entries, failSet = false) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { if (failSet) throw new Error('QuotaExceededError'); map.set(key, String(value)); },
    removeItem: key => { map.delete(key); }
  };
}

test('moveSave copies an old save to the new key once, then removes the old key', () => {
  const s = storage({ old: '{"fav":["plex"]}' });
  assert.equal(L.moveSave(s, 'old', 'new'), true);
  assert.deepEqual([...s.map.entries()], [['new', '{"fav":["plex"]}']]);
  assert.equal(L.moveSave(s, 'old', 'new'), false);
  assert.deepEqual([...s.map.entries()], [['new', '{"fav":["plex"]}']]);
});

test('moveSave never overwrites a save under the new key, and leaves the old key alone then', () => {
  const s = storage({ old: 'old save', new: 'new save' });
  assert.equal(L.moveSave(s, 'old', 'new'), false);
  assert.equal(s.getItem('new'), 'new save');
  assert.equal(s.getItem('old'), 'old save');
});

test('moveSave keeps an empty-string save under the new key', () => {
  const s = storage({ old: 'old save', new: '' });
  assert.equal(L.moveSave(s, 'old', 'new'), false);
  assert.equal(s.getItem('new'), '');
});

test('moveSave does nothing without an old save', () => {
  const s = storage({});
  assert.equal(L.moveSave(s, 'old', 'new'), false);
  assert.equal(s.map.size, 0);
});

test('moveSave keeps the old save if the copy cannot be stored', () => {
  const s = storage({ old: 'old save' }, true);
  assert.throws(() => L.moveSave(s, 'old', 'new'));
  assert.equal(s.getItem('old'), 'old save');
  assert.equal(s.getItem('new'), null);
});

test('driftTarget keeps a near point and shortens a far one to the maximum leg, in the same direction', () => {
  assert.deepEqual(plain(L.driftTarget({ x: 0, y: 0 }, { x: 18, y: -12 }, 30)), { x: 18, y: -12 });
  assert.deepEqual(plain(L.driftTarget({ x: 0, y: 0 }, { x: 30, y: 0 }, 30)), { x: 30, y: 0 }); // Exactly the maximum.
  assert.deepEqual(plain(L.driftTarget({ x: 5, y: 5 }, { x: 5, y: 5 }, 30)), { x: 5, y: 5 }); // Already there.
  assert.deepEqual(plain(L.driftTarget({ x: -20, y: 0 }, { x: 20, y: 0 }, 30)), { x: 10, y: 0 });
  assert.deepEqual(plain(L.driftTarget({ x: 2, y: 4 }, { x: 2, y: -46 }, 30)), { x: 2, y: -26 });
  const far = L.driftTarget({ x: -20, y: -12 }, { x: 20, y: 12 }, 30);
  assert.ok(Math.abs(Math.hypot(far.x + 20, far.y + 12) - 30) < 1e-9 && Math.abs(far.y + 12 - (far.x + 20) * 0.6) < 1e-9, JSON.stringify(far));
});
