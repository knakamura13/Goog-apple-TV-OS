// Unit tests for Home's pure logic (demo/library/logic.js), loaded in a plain sandbox exactly as the TV
// loads it. HOME_LOGIC_FILE points the tests at another copy; scripts/mutate-library.mjs uses that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const file = process.env.HOME_LOGIC_FILE || new URL('../demo/library/logic.js', import.meta.url).pathname;
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

test('homeLists never leaves Favorites empty', () => {
  const r = plain(L.homeLists(owner, ['sling', 'disney'], { fav: ['gone'], hid: [] }, 6, nameOf));
  assert.deepEqual(r.fav, ['disney', 'sling']);
  const first = plain(L.homeLists(['nothing'], ['sling', 'disney'], null, 1, nameOf));
  assert.deepEqual(first.fav, ['disney']);
  assert.deepEqual(first.hid, ['sling']);
});

test('libraryIds lists the rest A–Z', () => {
  assert.deepEqual(plain(L.libraryIds(['sling', 'plex', 'alexa', 'disney', 'hulu'], ['plex'], ['disney'], nameOf)), ['alexa', 'hulu', 'sling']);
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

test('inputName clears only the two old sample names in their own slots', () => {
  assert.equal(L.inputName(0, 'PlayStation 5'), '');
  assert.equal(L.inputName(1, 'Mac mini'), '');
  assert.equal(L.inputName(1, 'PlayStation 5'), 'PlayStation 5');
  assert.equal(L.inputName(2, 'Mac mini'), 'Mac mini');
  assert.equal(L.inputName(0, 'Apple TV'), 'Apple TV');
  assert.equal(L.inputName(0, 'x'.repeat(30)).length, 24);
  assert.equal(L.inputName(0, undefined), '');
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

test('dayKey zero-pads the local date', () => {
  assert.equal(L.dayKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(L.dayKey(new Date(2026, 10, 30)), '2026-11-30');
  assert.equal(L.dayKey(new Date(2026, 9, 10)), '2026-10-10');
  assert.equal(L.dayKey(new Date(2026, 8, 9)), '2026-09-09');
});

test('dailyFor keeps today\'s photo only', () => {
  const saved = { day: '2026-10-31', id: '1015', author: 'A' };
  assert.equal(L.dailyFor(saved, '2026-10-31'), saved);
  assert.equal(L.dailyFor(saved, '2026-11-01'), null);
  assert.equal(L.dailyFor({ day: '2026-10-31', id: '' }, '2026-10-31'), null);
  assert.equal(L.dailyFor(null, '2026-10-31'), null);
});

test('photo URLs and credits', () => {
  assert.equal(L.photoUrl('1015', 1920, 1080), 'https://picsum.photos/id/1015/1920/1080');
  assert.equal(L.photoUrl('a/b', 1, 2), 'https://picsum.photos/id/a%2Fb/1/2');
  assert.equal(L.listUrl(4), 'https://picsum.photos/v2/list?page=4&limit=30');
  assert.equal(L.credit('Ann Lee'), 'Photo by Ann Lee on Unsplash');
  assert.equal(L.credit(''), 'Photo from Unsplash');
  assert.equal(L.credit('x'.repeat(80)), 'Photo by ' + 'x'.repeat(60) + ' on Unsplash');
});

test('photoLook derives the catalogue fields from brightness', () => {
  assert.deepEqual(plain(L.photoLook(0.6, 0.8, 0.7, 0.45)), { tone: 'light', ut: { tr: 'light' }, clockMist: true, frostVeil: 0.12 });
  assert.deepEqual(plain(L.photoLook(0.55, 0.7, 0.62, 0.7)), { tone: 'dark', ut: { tr: 'mist' }, clockMist: false, frostVeil: 0.22 });
  assert.deepEqual(plain(L.photoLook(0.2, 0.45, 0.1, 0.95)), { tone: 'dark', ut: { tr: 'dark' }, clockMist: false, frostVeil: 0.3 });
  assert.equal(L.photoLook(0.2, 0.46, 0.1, 0.1).ut.tr, 'mist');
  assert.equal(L.photoLook(0.56, 0.2, 0.63, 0.3).frostVeil, 0.12);
});

test('picker index maps Daily photo first, then bundled photos', () => {
  assert.equal(L.pickerIndex(true, 5), 0);
  assert.equal(L.pickerIndex(false, 0), 1);
  assert.equal(L.pickerIndex(false, 4), 5);
  assert.deepEqual(plain(L.pickerTarget(0)), { daily: true });
  assert.deepEqual(plain(L.pickerTarget(1)), { daily: false, wall: 0 });
  assert.deepEqual(plain(L.pickerTarget(6)), { daily: false, wall: 5 });
});
