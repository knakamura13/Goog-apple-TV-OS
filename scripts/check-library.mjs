// End-to-end checks for Home (demo/library/), driven with remote keys in Chromium: arrows move, Enter is OK,
// Escape is Back. A stand-in for the TV's public Tizen API reports the owners' installed apps and one connected
// HDMI port, so every screen runs its TV code paths (app discovery, launching, Samsung's screens, the HDMI view,
// Settings › About). The weather and photo services answer from fixtures, or fail in the offline sections.
// Each section starts from a fresh profile. Never contacts a TV or the internet.
//
// Prints PASS / FAIL per assertion and exits 1 on any failure, page error or unexpected resource failure.
// LIBRARY_SECTION=<text> runs only the sections whose names contain <text>.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP, PHOTOS, SAMSUNG_HOME, SAMSUNG_SETTINGS, hold, launchBrowser, openLauncher, press, repo, settled, snapshot, startPreview, startStatic } from './library-harness.mjs';

// First run with the stand-in TV: the first six installed apps from the owners' list are favourites, the rest of
// that list fills the library (A–Z) and every other installed app starts hidden.
const FAVS = ['plex', 'youtube', 'netflix', 'appletv', 'hulu', 'primevideo'];
const FAV_MARKS = ['plex', 'youtube', 'netflix', 'appletv', 'hulu', 'primevideo-wordmark']; // Prime Video uses its wordmark.
const LIBRARY = [['amazonalexa', 'hbomax', 'Samsung TV Plus', 'smartthings', 'spotify']]; // Amazon Alexa … Spotify, A–Z.
const HIDDEN = ['ZmmGjO6VKO.slingtv', 'disneyplus']; // Disney+ and Sling TV (sorted).
const INSTALLED = Object.keys(APP).sort(); // Every installed app except the launcher itself and the AD Player.

const SOURCE_APP = 'org.tizen.SMSourceAPP';
const ONLINE_PHOTO = /^https:\/\/picsum\.photos\/id\/(100[123])\/1920\/1080$/; // The three landscape fixtures.

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) passed++; else failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || detail === undefined ? '' : ' — ' + JSON.stringify(detail)));
  return ok;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const focusIs = (s, z, i) => !!s.f && s.f.z === z && (i === undefined || s.f.i === i);
const has = (s, cls) => s.classes.includes(cls);

let preview, browser;
// Each section gets its own profile and fails on any page error or resource failure it caused.
async function section(name, options, body) {
  if (process.env.LIBRARY_SECTION && !name.toLowerCase().includes(process.env.LIBRARY_SECTION.toLowerCase())) return;
  console.log('\n## ' + name);
  let launcher;
  try {
    launcher = await openLauncher(browser, options.base || preview.base, options);
    await body(launcher, launcher.page);
  } catch (error) {
    check(name + ': ran to the end', false, error.message.split('\n')[0]);
  } finally {
    if (launcher) {
      check(name + ': no page errors', launcher.errors.length === 0, launcher.errors);
      check(name + ': no unexpected resource failures', launcher.failures.length === 0, launcher.failures);
      await launcher.close();
    }
  }
}

// Home → Settings the way a viewer does it: up to the nav pills, right past the last pill to the gear, then OK.
async function openSettings(page) {
  for (let n = 0; n < 3 && (await snapshot(page)).f?.z !== 'nav'; n++) await press(page, 'ArrowUp');
  for (let n = 0; n < 3 && (await snapshot(page)).f?.z !== 'gear'; n++) await press(page, 'ArrowRight');
  await press(page, 'Enter');
  await settled(page);
}
// Rows are found by label, never by position, so adding or removing a row elsewhere does not break these checks.
async function gotoRow(page, label) {
  const s = await snapshot(page);
  const target = s.panel.rows.findIndex(row => row.label === label), at = s.panel.rows.findIndex(row => row.label === s.panel.focused);
  if (target < 0) throw Error('No "' + label + '" row on the ' + s.panel.title + ' page');
  await press(page, target > at ? 'ArrowDown' : 'ArrowUp', Math.abs(target - at));
  if ((await snapshot(page)).panel.focused !== label) throw Error('Could not focus the "' + label + '" row');
}
async function openRow(page, label) { await gotoRow(page, label); await press(page, 'Enter'); await settled(page); }
const rowValue = (s, label) => s.panel.rows.find(row => row.label === label)?.value;
// The tile menu opens on its first row; rows are found by label.
async function chooseFromMenu(page, label) {
  const s = await snapshot(page), at = s.menu.rows.indexOf(label);
  if (!has(s, 'is-menu') || at < 0) throw Error('No "' + label + '" row in the tile menu: ' + JSON.stringify(s.menu));
  await press(page, 'ArrowDown', at);
  await press(page, 'Enter');
}
// A key event with no key-up, as from a TV that never sends one.
const keyDownOnly = (page, keyCode) => page.evaluate(code => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'keyCode', { get: () => code });
  document.dispatchEvent(event);
}, keyCode);
const photoMatches = (page, pattern, timeout = 8000) => page.waitForFunction(source => new RegExp(source).test(document.querySelector('.bg-photo.is-front')?.getAttribute('src') || ''), pattern.source, { timeout });
const onlineId = url => (ONLINE_PHOTO.exec(url) || [])[1];
const author = id => PHOTOS.find(photo => photo.id === id)?.author;
const DAILY_GLASS = ['blur blob', 'clear blob', 'frost blob']; // All three layers made in the page.
const tintsOf = page => page.evaluate(() => Object.fromEntries(['--tint-tr', '--panel-tint', '--plate-tint'].map(name => [name, parseFloat(getComputedStyle(document.getElementById('stage')).getPropertyValue(name))])));
const visibility = (page, hidden) => page.evaluate(value => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => value }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
// Back out of Settings to Home: the picker or editor, every page, then the panel.
async function closeSettings(page) {
  const open = s => ['is-panel', 'is-picker', 'is-editor'].some(cls => has(s, cls));
  for (let n = 0; n < 6 && open(await snapshot(page)); n++) { await press(page, 'Escape'); await settled(page); }
}
const launched = page => page.evaluate(() => window.__launches.slice());
// The messages device.js and the launcher show when the TV refuses or ignores a launch.
const failure = message => /could not|did not respond|failed|Opens .* on the TV|Open CleanFrame on the TV/i.test(message || '');
// Launch callbacks arrive asynchronously; give an error message the chance to appear before asserting there is none.
const afterCallbacks = page => page.waitForTimeout(150);

try {
  preview = await startPreview();
  browser = await launchBrowser();

  await section('First run: apps from the TV', {}, async (launcher, page) => {
    const s = await snapshot(page);
    check('Favourites are Plex, YouTube, Netflix, Apple TV, Hulu, Prime Video in that order', same(s.fav, FAV_MARKS), s.fav);
    check('Library is Amazon Alexa, HBO Max, Samsung TV Plus, SmartThings, Spotify (A–Z, one row)', same(s.library, LIBRARY), s.library);
    check('Disney+ and Sling TV are on neither Home row', !s.fav.concat(...s.library).some(app => /disney|sling/i.test(app)), s);
    check('First focus is the first favourite (no resume card before any launch)', focusIs(s, 'fav', 0) && !has(s, 'has-resume'), s.f);
    await page.waitForFunction(() => document.querySelector('#library .t-icon')?.complete, null, { timeout: 5000 }).catch(() => {});
    const icon = await page.evaluate(() => {
      const img = document.querySelector('#library .t-icon');
      return img && { src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0, fallback: !!img.closest('.no-icon') };
    });
    check('Samsung TV Plus (no bundled logo) shows the icon the TV reports', icon && icon.src.includes('HEPsqFNie0.tvplusstandalone') && icon.loaded && !icon.fallback, icon);
    await openSettings(page);
    await openRow(page, 'Apps');
    const editor = await snapshot(page);
    check('Apps editor lists every installed app, without the launcher itself or the AD Player', same([...editor.editor.apps].sort(), INSTALLED), editor.editor.apps);
    check('Apps editor shows Disney+ and Sling TV as Hidden', same([...editor.editor.hidden].sort(), HIDDEN), editor.editor.hidden);
    await press(page, 'Escape');
    check('Back from the Apps editor returns to Settings', has(await snapshot(page), 'is-panel'));
  });

  await section('Home navigation: dock, library and the Samsung Home dialog', {}, async (launcher, page) => {
    await press(page, 'ArrowLeft');
    check('Left on the first favourite stays there (no wrapping)', focusIs(await snapshot(page), 'fav', 0));
    await press(page, 'ArrowRight', 5);
    check('Right moves along the dock to the sixth favourite', focusIs(await snapshot(page), 'fav', 5));
    await press(page, 'ArrowRight');
    check('Right on the last favourite stays there (no wrapping)', focusIs(await snapshot(page), 'fav', 5));
    await press(page, 'ArrowLeft', 3);
    await press(page, 'ArrowDown');
    let s = await snapshot(page);
    check('Down from the third favourite focuses the third app in library row 1', focusIs(s, 'lib', 2) && has(s, 'is-library'), s.f);
    check('The focused library app is named under it', s.focusName === 'Samsung TV Plus', s.focusName);
    await press(page, 'ArrowUp');
    s = await snapshot(page);
    check('Up from library row 1 returns to the same favourite', focusIs(s, 'fav', 2) && !has(s, 'is-library'), s.f);
    await press(page, 'ArrowRight', 3);
    await press(page, 'ArrowDown');
    s = await snapshot(page);
    check('Down from a column past the end of row 1 lands on its last app', focusIs(s, 'lib', 4) && s.focusName === 'Spotify', [s.f, s.focusName]);
    await press(page, 'Escape');
    check('Back from the library returns to the favourites in the same column', focusIs(await snapshot(page), 'fav', 4));

    await press(page, 'Escape');
    s = await snapshot(page);
    check('Back from the dock opens "Open Samsung Home?" with Stay here focused', has(s, 'is-dialog') && focusIs(s, 'dialog', 0) && same(s.dialog, ['Stay here', 'Samsung Home']), [s.f, s.dialog]);
    await press(page, 'ArrowRight');
    check('Dialog Right focuses Samsung Home', focusIs(await snapshot(page), 'dialog', 1));
    await press(page, 'ArrowLeft');
    check('Dialog Left focuses Stay here', focusIs(await snapshot(page), 'dialog', 0));
    await press(page, 'Enter');
    s = await snapshot(page);
    check('OK on Stay here closes the dialog and returns to the same favourite', !has(s, 'is-dialog') && focusIs(s, 'fav', 4), s.f);
    await press(page, 'Escape');
    await press(page, 'Escape');
    s = await snapshot(page);
    check('Back in the dialog also returns to the dock', !has(s, 'is-dialog') && focusIs(s, 'fav', 4), s.f);
    check('Leaving the dialog without choosing launches nothing', same(await launched(page), []), await launched(page));
    await press(page, 'Escape');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await afterCallbacks(page);
    s = await snapshot(page);
    check('OK on Samsung Home opens Samsung Home (com.samsung.tv.csfs)', same(s.launches, [SAMSUNG_HOME]), s.launches);
    check('Samsung Home closes the dialog back to the dock without an error message', !has(s, 'is-dialog') && focusIs(s, 'fav') && !s.toast, [s.f, s.toast]);
  });

  await section('Launching: a quick OK opens the app', {}, async (launcher, page) => {
    await press(page, 'Enter');
    await afterCallbacks(page);
    let s = await snapshot(page);
    check('OK on Plex launches its TV app (kIciSQlYEM.plex)', same(s.launches, [APP.plex]), s.launches);
    check('A launch shows no message and no menu', !s.toast && !has(s, 'is-menu'), [s.toast, s.classes]);
    check('The launch saves Plex as the app to resume', s.saved?.last === 'plex', s.saved);
    check('The save keeps the first-run favourites and hidden apps', same(s.saved?.fav, FAVS) && same([...(s.saved?.hid || [])].sort(), HIDDEN), s.saved);
    check('The resume card appears, showing Plex', has(s, 'has-resume') && s.resume === 'plex', [s.classes, s.resume]);
    await press(page, 'ArrowDown');
    await press(page, 'ArrowRight', 2);
    await press(page, 'Enter');
    await afterCallbacks(page);
    s = await snapshot(page);
    check('OK on Samsung TV Plus (the TV icon tile) launches HEPsqFNie0.tvplusstandalone', s.launches[1] === APP['HEPsqFNie0.tvplusstandalone'] && !s.toast, [s.launches, s.toast]);
    await press(page, 'ArrowLeft', 2);
    await press(page, 'Enter');
    await afterCallbacks(page);
    s = await snapshot(page);
    check('OK on Amazon Alexa launches AQKO41xyKP.AmazonAlexa', s.launches[2] === APP.alexa && !s.toast, [s.launches, s.toast]);
  });

  await section('Resume card', {}, async (launcher, page) => {
    await press(page, 'ArrowRight', 2);
    await press(page, 'Enter');
    await afterCallbacks(page);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#stage .is-focus'));
    let s = await snapshot(page);
    check('After a launch and a reload the resume card shows the last app (Netflix)', has(s, 'has-resume') && s.resume === 'netflix', [s.classes, s.resume]);
    check('After a reload, focus starts on the resume card', focusIs(s, 'resume'), s.f);
    await press(page, 'ArrowUp');
    check('Up from the resume card focuses the active nav pill (Home)', focusIs(await snapshot(page), 'nav', 0));
    await press(page, 'ArrowDown');
    check('Down from the nav pills returns to the resume card', focusIs(await snapshot(page), 'resume'));
    await press(page, 'ArrowUp');
    await press(page, 'ArrowRight', 2);
    check('Right past the last nav pill reaches the Settings gear', focusIs(await snapshot(page), 'gear'));
    await press(page, 'ArrowDown');
    check('Down from the gear goes to the resume card', focusIs(await snapshot(page), 'resume'));
    await press(page, 'ArrowDown');
    check('Down from the resume card focuses the first favourite', focusIs(await snapshot(page), 'fav', 0));
    await press(page, 'ArrowUp');
    check('Up from the favourites returns to the resume card', focusIs(await snapshot(page), 'resume'));
    await press(page, 'Enter');
    await afterCallbacks(page);
    s = await snapshot(page);
    check('OK on the resume card reopens Netflix (org.tizen.netflix-app)', same(s.launches, [APP.netflix]) && !s.toast, [s.launches, s.toast]);
    await press(page, 'ArrowUp');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    s = await snapshot(page);
    check('On the Inputs tab the resume card is hidden', has(s, 'tab-inputs') && !has(s, 'has-resume'), s.classes);
    await press(page, 'ArrowLeft');
    await press(page, 'Enter');
    s = await snapshot(page);
    check('Back on the Home tab the resume card shows again', !has(s, 'tab-inputs') && has(s, 'has-resume'), s.classes);
    await press(page, 'ArrowDown');
    check('Down from the Home pill goes to the resume card', focusIs(await snapshot(page), 'resume'));
  });

  await section('Edit in place: hold OK on a Home tile', {}, async (launcher, page) => {
    await hold(page);
    let s = await snapshot(page);
    check('Holding OK on a favourite opens its menu instead of launching', has(s, 'is-menu') && s.menu.title === 'Plex' && same(s.launches, []), [s.menu, s.launches]);
    check('Favourite menu offers Open, Move, Remove from Favorites, Hide', same(s.menu.rows, ['Open', 'Move', 'Remove from Favorites', 'Hide']), s.menu.rows);
    check('The menu opens with Open focused', focusIs(s, 'menu', 0) && s.f.label === 'Open', s.f);
    await page.waitForTimeout(300); // The menu settles at full size.
    const fits = await page.evaluate(() => {
      const menu = document.querySelector('.tilemenu').getBoundingClientRect();
      return [...document.querySelectorAll('.tm-row')].every(row => { const r = row.getBoundingClientRect(); return r.top >= menu.top && r.bottom <= menu.bottom - 12; });
    });
    check('All four rows fit inside the menu', fits);
    await press(page, 'Escape');
    s = await snapshot(page);
    check('Back closes the menu and returns to the same favourite', !has(s, 'is-menu') && focusIs(s, 'fav', 0), s.f);

    await press(page, 'ArrowDown');
    await hold(page);
    s = await snapshot(page);
    const before = s.saved;
    check('Library app menu offers Open, Move, Add to Favorites, Hide', s.menu.title === 'Amazon Alexa' && same(s.menu.rows, ['Open', 'Move', 'Add to Favorites', 'Hide']), s.menu);
    check('A library menu keeps the library in view', has(s, 'is-library'), s.classes);
    await chooseFromMenu(page, 'Add to Favorites');
    s = await snapshot(page);
    check('With 6 favourites, Add to Favorites explains the limit', /Favorites hold 6 apps/.test(s.toast), s.toast);
    check('With 6 favourites, Add to Favorites changes nothing (lists, saved state, menu stays open)', same(s.fav, FAV_MARKS) && same(s.library, LIBRARY) && same(s.saved, before) && has(s, 'is-menu'), [s.fav, s.library, s.saved]);
    await press(page, 'Escape');
    check('Back closes the library menu and returns to the same app', focusIs(await snapshot(page), 'lib', 0));

    await press(page, 'ArrowUp');
    await hold(page);
    await chooseFromMenu(page, 'Hide');
    s = await snapshot(page);
    check('Hide removes Plex from the dock, and it does not move to the library', same(s.fav, FAV_MARKS.slice(1)) && same(s.library, LIBRARY), [s.fav, s.library]);
    check('Hide confirms with "Plex hidden."', s.toast === 'Plex hidden.', s.toast);
    check('Hide saves Plex as hidden', same(s.saved?.fav, FAVS.slice(1)) && s.saved?.hid.includes('plex'), s.saved);
    check('After Hide, focus is on the dock', focusIs(s, 'fav', 0) && !has(s, 'is-menu'), s.f);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#stage .is-focus'));
    s = await snapshot(page);
    check('Hidden Plex stays off Home after a reload', same(s.fav, FAV_MARKS.slice(1)) && same(s.library, LIBRARY), [s.fav, s.library]);

    await press(page, 'ArrowDown');
    await hold(page);
    await chooseFromMenu(page, 'Add to Favorites');
    s = await snapshot(page);
    check('With 5 favourites, Add to Favorites moves Amazon Alexa to the end of the dock', same(s.fav, FAV_MARKS.slice(1).concat('amazonalexa')) && s.saved?.fav.at(-1) === 'alexa', [s.fav, s.saved?.fav]);
    check('Add focuses the added favourite', focusIs(s, 'fav', 5), s.f);
    await hold(page);
    await chooseFromMenu(page, 'Remove from Favorites');
    s = await snapshot(page);
    check('Remove from Favorites moves Amazon Alexa back to the library, A–Z', same(s.fav, FAV_MARKS.slice(1)) && same(s.library, LIBRARY) && !s.saved?.hid.includes('alexa'), [s.fav, s.library]);

    await press(page, 'ArrowLeft', 5);
    await press(page, 'ArrowDown');
    await hold(page);
    await chooseFromMenu(page, 'Move');
    s = await snapshot(page);
    check('Move opens the Apps editor carrying the app', has(s, 'is-editor') && same(s.editor.carry, ['alexa']), [s.classes, s.editor]);
    check('The editor says what is being moved', /^Moving Amazon Alexa\./.test(s.editor.hint), s.editor.hint);
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    s = await snapshot(page);
    check('Carrying the app up and pressing OK makes it a favourite', s.saved?.fav.includes('alexa') && same(s.editor.carry, []), [s.saved?.fav, s.editor]);
    check('The launcher launched nothing while editing', same(s.launches, []), s.launches);
  });

  await section('Edit in place: hold and tap timing', {}, async (launcher, page) => {
    await page.keyboard.down('Enter');
    await page.waitForTimeout(200);
    await page.keyboard.down('Enter'); // A key repeat while held.
    await page.waitForTimeout(400);
    await page.keyboard.up('Enter');
    let s = await snapshot(page);
    check('Repeats while OK is held open the menu once and launch nothing', has(s, 'is-menu') && focusIs(s, 'menu', 0) && same(s.launches, []), [s.classes, s.f, s.launches]);
    await chooseFromMenu(page, 'Open');
    await afterCallbacks(page);
    s = await snapshot(page);
    check('Open in the tile menu launches the app and closes the menu', same(s.launches, [APP.plex]) && !has(s, 'is-menu') && focusIs(s, 'fav', 0), [s.launches, s.f]);
    await page.keyboard.down('Enter');
    await page.waitForTimeout(200);
    await press(page, 'ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.up('Enter');
    await afterCallbacks(page);
    s = await snapshot(page);
    check('Another key during a hold cancels it: no menu, no launch, focus moves', !has(s, 'is-menu') && same(s.launches, [APP.plex]) && focusIs(s, 'fav', 1), [s.classes, s.launches, s.f]);
    await keyDownOnly(page, 13);
    await page.waitForTimeout(600);
    s = await snapshot(page);
    check('Without key-up, a held OK still opens the menu', has(s, 'is-menu') && s.menu.title === 'YouTube', s.menu);
    await page.waitForTimeout(900); // Past the 800 ms release.
    await keyDownOnly(page, 13);
    await afterCallbacks(page);
    s = await snapshot(page);
    check('Without key-up, the next OK works the menu (Open launches YouTube)', same(s.launches, [APP.plex, APP.youtube]) && !has(s, 'is-menu'), [s.launches, s.classes]);
    await page.waitForTimeout(900);
    await keyDownOnly(page, 13);
    await page.waitForTimeout(200);
    await keyDownOnly(page, 13); // A repeat the TV doesn't flag as one.
    await page.waitForTimeout(400);
    s = await snapshot(page);
    check('A repeat the TV doesn\'t flag still counts as holding: the menu opens and nothing launches', has(s, 'is-menu') && same(s.launches, [APP.plex, APP.youtube]), [s.classes, s.launches]);
  });

  await section('Edit in place: leaving the Apps editor after Move', {}, async (launcher, page) => {
    await press(page, 'ArrowRight', 2);
    await hold(page);
    await chooseFromMenu(page, 'Move');
    check('Move from the menu opens the Apps editor', has(await snapshot(page), 'is-editor'));
    await press(page, 'Escape');
    await press(page, 'Escape');
    let s = await snapshot(page);
    check('Back twice (drop the app, leave the editor) returns to the moved app on the dock', !has(s, 'is-editor') && !has(s, 'is-panel') && focusIs(s, 'fav', 2), [s.classes, s.f]);
    await press(page, 'ArrowRight');
    check('Keys work normally afterwards', focusIs(await snapshot(page), 'fav', 3));
    await press(page, 'ArrowDown');
    await hold(page);
    await chooseFromMenu(page, 'Move');
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await press(page, 'Escape');
    s = await snapshot(page);
    check('With Favorites full, a library app stays in the library and Back returns to the dock', !has(s, 'is-editor') && same(s.fav, FAV_MARKS) && focusIs(s, 'fav', 3), [s.fav, s.f]);
  });

  await section('Settings panel', {}, async (launcher, page) => {
    await openSettings(page);
    let s = await snapshot(page);
    check('Up, Right to the gear and OK opens Settings', has(s, 'is-panel') && s.panel.title === 'Settings' && focusIs(s, 'panel', 0), [s.panel.title, s.f]);
    for (const label of ['Wallpaper', 'Apps', 'Weather', 'Screensaver', 'Picture and sound', 'Samsung Home', 'About']) {
      check('Settings has a "' + label + '" row', s.panel.rows.some(row => row.label === label), s.panel.rows.map(row => row.label));
    }

    await openRow(page, 'Apps');
    s = await snapshot(page);
    check('Apps opens the editor with the first favourite focused', has(s, 'is-editor') && s.f?.id === 'plex', s.f);
    await press(page, 'Enter');
    check('OK picks the app up', same((await snapshot(page)).editor.carry, ['plex']));
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    s = await snapshot(page);
    check('Right then OK drops Plex one place later, and saves at once', same(s.saved?.fav, ['youtube', 'plex', 'netflix', 'appletv', 'hulu', 'primevideo']) && same(s.editor.carry, []), s.saved?.fav);
    check('The editor confirms the reorder', s.editor.hint === 'Favorites reordered.', s.editor.hint);
    await press(page, 'Escape');
    await settled(page);
    s = await snapshot(page);
    check('Back from the editor returns to the Apps row', has(s, 'is-panel') && s.panel.focused === 'Apps', [s.classes, s.panel.focused]);

    await gotoRow(page, 'Screensaver');
    check('Screensaver starts at "After 1 min"', rowValue(await snapshot(page), 'Screensaver') === 'After 1 min');
    await press(page, 'Enter');
    s = await snapshot(page);
    check('OK on Screensaver steps to "After 5 min" and saves it', rowValue(s, 'Screensaver') === 'After 5 min' && s.saved?.amb === 1, [rowValue(s, 'Screensaver'), s.saved?.amb]);

    await openRow(page, 'Weather');
    s = await snapshot(page);
    check('Weather opens its own page', s.panel.title === 'Weather' && s.panel.crumb === 'Settings', s.panel);
    check('Weather defaults to ZIP 92626 (Costa Mesa) in Fahrenheit', rowValue(s, 'ZIP code') === '92626 · Costa Mesa' && rowValue(s, 'Units') === 'Fahrenheit', s.panel.rows);
    await openRow(page, 'ZIP code');
    s = await snapshot(page);
    check('ZIP code opens five digits with the first one focused', s.panel.title === 'ZIP code' && s.panel.zip === '92626' && focusIs(s, 'zip', 0), [s.panel.zip, s.f]);
    for (const digit of '90210') await press(page, digit);
    s = await snapshot(page);
    check('The remote\'s number keys type digits and advance', s.panel.zip === '90210' && focusIs(s, 'zip', 4), [s.panel.zip, s.f]);
    await press(page, 'ArrowLeft');
    await press(page, 'ArrowUp');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowDown');
    s = await snapshot(page);
    check('Left/Right move between digits and Up/Down change them', s.panel.zip === '90229' && focusIs(s, 'zip', 4), [s.panel.zip, s.f]);
    await press(page, 'Enter');
    await settled(page);
    s = await snapshot(page);
    check('OK saves the ZIP code and returns to the Weather page', s.panel.title === 'Weather' && /^90229/.test(rowValue(s, 'ZIP code')) && s.saved?.weather?.zip === '90229', [s.panel.title, s.saved?.weather]);
    check('Saving the ZIP code says so inside the panel', s.panel.status === 'Weather location saved.', s.panel.status);
    await gotoRow(page, 'Units');
    await press(page, 'Enter');
    s = await snapshot(page);
    check('Units switches to Celsius and saves it', rowValue(s, 'Units') === 'Celsius' && s.saved?.weather?.units === 'C', [rowValue(s, 'Units'), s.saved?.weather]);
    await press(page, 'Enter');
    s = await snapshot(page);
    check('Units switches back to Fahrenheit and saves it', rowValue(s, 'Units') === 'Fahrenheit' && s.saved?.weather?.units === 'F', [rowValue(s, 'Units'), s.saved?.weather]);
    await press(page, 'Escape');
    await settled(page);
    check('Back returns from Weather to the Settings page', (await snapshot(page)).panel.title === 'Settings');

    await gotoRow(page, 'Picture and sound');
    await press(page, 'Enter');
    await afterCallbacks(page);
    s = await snapshot(page);
    check('Picture and sound opens Samsung\'s settings (com.samsung.tv.coba.setting)', same(s.launches, [SAMSUNG_SETTINGS]) && !failure(s.panel.status), [s.launches, s.panel.status]);
    await gotoRow(page, 'Samsung Home');
    await press(page, 'Enter');
    await afterCallbacks(page);
    s = await snapshot(page);
    check('Samsung Home opens Samsung Home (com.samsung.tv.csfs)', same(s.launches, [SAMSUNG_SETTINGS, SAMSUNG_HOME]) && !failure(s.panel.status), [s.launches, s.panel.status]);

    await openRow(page, 'About');
    await page.waitForFunction(() => /QN65S90DAFXZA/.test(document.getElementById('panelRows').textContent), null, { timeout: 5000 }).catch(() => {});
    s = await snapshot(page);
    check('About shows the TV model from the TV', s.panel.title === 'About' && rowValue(s, 'TV model') === 'QN65S90DAFXZA', s.panel.rows);
    check('About shows free storage as "0.5 GB free of 4.1 GB"', rowValue(s, 'Storage') === '0.5 GB free of 4.1 GB', rowValue(s, 'Storage'));
    check('About shows the firmware and Tizen version from the TV', rowValue(s, 'Firmware') === 'T-TEST-2130' && rowValue(s, 'Tizen') === '9.0', s.panel.rows);
    check('About shows the web engine and the 1920 × 1080 page', /^Chromium \d+$/.test(rowValue(s, 'Web engine')) && rowValue(s, 'Page size') === '1920 × 1080', s.panel.rows);
    await press(page, 'Escape');
    await settled(page);
    await press(page, 'Escape');
    s = await snapshot(page);
    check('Back from the Settings page closes the panel onto the gear', !has(s, 'is-panel') && focusIs(s, 'gear'), [s.classes, s.f]);
    await press(page, 'ArrowDown');
    s = await snapshot(page);
    check('Home shows the favourites in the order set in the editor', same(s.fav, ['youtube', 'plex', 'netflix', 'appletv', 'hulu', 'primevideo-wordmark']), s.fav);

    await page.reload();
    await page.waitForFunction(() => document.querySelector('#stage .is-focus'));
    s = await snapshot(page);
    check('The favourites order persists across a reload', same(s.fav, ['youtube', 'plex', 'netflix', 'appletv', 'hulu', 'primevideo-wordmark']), s.fav);
    await openSettings(page);
    s = await snapshot(page);
    check('The Screensaver choice persists across a reload', rowValue(s, 'Screensaver') === 'After 5 min', rowValue(s, 'Screensaver'));
    await openRow(page, 'Weather');
    s = await snapshot(page);
    check('The Weather ZIP code and its place persist across a reload', rowValue(s, 'ZIP code') === '90229 · Testville', s.panel.rows);
  });

  await section('Wallpaper picker', {}, async (launcher, page) => {
    await openSettings(page);
    let s = await snapshot(page);
    const start = rowValue(s, 'Wallpaper');
    await openRow(page, 'Wallpaper');
    s = await snapshot(page);
    const names = await page.evaluate(() => window.CleanFrameWallpapers.map(w => w.name));
    check('A first run uses the daily photo, and the picker opens on it', has(s, 'is-picker') && start === 'Daily photo' && s.picker.focused === 0 && s.picker.applied === 0 && s.picker.title === 'Daily photo', [start, s.picker]);
    await press(page, 'ArrowRight');
    s = await snapshot(page);
    check('Right moves to the first bundled photo', s.picker.focused === 1 && s.picker.title === names[0], s.picker);
    await press(page, 'ArrowLeft');
    check('Left moves back to Daily photo', (await snapshot(page)).picker.focused === 0);
    await press(page, 'ArrowDown', 3);
    s = await snapshot(page);
    check('Down moves a row at a time (to ' + names[5] + ')', s.picker.focused === 6 && s.picker.title === names[5], s.picker);
    await photoMatches(page, /\/peaks\.jpg$/);
    check('Resting on a photo previews it full screen', /\/peaks\.jpg$/.test((await snapshot(page)).photo));
    await press(page, 'Enter');
    await page.waitForFunction(() => document.querySelector('#pkGrid > .pk-item.is-applied')?.getAttribute('data-i') === '6', null, { timeout: 5000 }).catch(() => {});
    s = await snapshot(page);
    check('OK applies the photo (check mark moves to it) and saves it', s.picker.applied === 6 && s.saved?.daily === false && s.saved?.wall === 5, [s.picker, s.saved?.daily, s.saved?.wall]);
    await press(page, 'ArrowRight');
    await photoMatches(page, /\/bridge\.jpg$/);
    await press(page, 'Escape');
    await photoMatches(page, /\/peaks\.jpg$/).catch(() => {});
    s = await snapshot(page);
    check('Back closes the picker and restores the applied photo, not the preview', !has(s, 'is-picker') && has(s, 'is-panel') && /\/peaks\.jpg$/.test(s.photo), [s.classes, s.photo]);
    check('The Wallpaper row shows the applied photo', rowValue(s, 'Wallpaper') === names[5], rowValue(s, 'Wallpaper'));
    await page.reload();
    await photoMatches(page, /\/peaks\.jpg$/).catch(() => {});
    s = await snapshot(page);
    check('The applied wallpaper persists across a reload', /\/peaks\.jpg$/.test(s.photo) && s.saved?.wall === 5, { photo: s.photo, saved: s.saved?.wall });
  });

  await section('Daily photo', {}, async (launcher, page) => {
    await photoMatches(page, ONLINE_PHOTO);
    let s = await snapshot(page);
    const id = onlineId(s.photo);
    check('A first run shows an online photo (a landscape one)', !!id, s.photo);
    check('Its glass is made in the page: softened, blurred and frosted copies', same(s.glass, DAILY_GLASS), s.glass);
    check('Its caption credits the photographer', s.caption.credit === 'Photo by ' + author(id) + ' on Unsplash' && s.caption.title === '', s.caption);
    check('Today\'s pick is saved', s.saved?.daily === true && s.saved?.photo?.id === id && /^\d{4}-\d\d-\d\d$/.test(s.saved?.photo?.day), s.saved?.photo);
    check('One list page was asked for', launcher.requests.filter(url => /v2\/list/.test(url)).length === 1, launcher.requests);
    const tints = await page.evaluate(() => ['--tint-tl', '--tint-tr', '--dock-tint'].map(name => getComputedStyle(document.getElementById('stage')).getPropertyValue(name).trim()));
    check('The measured look sets the capsule tints', tints.every(value => /^0\.\d+$/.test(value)), tints);
    launcher.requests.length = 0;
    await page.reload();
    await photoMatches(page, new RegExp('/id/' + id + '/'));
    check('The same day keeps the same photo after a restart, without asking the list again', !launcher.requests.some(url => /v2\/list/.test(url)), launcher.requests);

    await openSettings(page);
    await openRow(page, 'Wallpaper');
    s = await snapshot(page);
    check('The Daily photo tile shows today\'s photo', s.picker.dailyThumb === s.photo, [s.picker.dailyThumb, s.photo]);
    check('Its caption credits the photographer and says it changes daily', s.picker.credit === 'Photo by ' + author(id) + ' on Unsplash · a new one each day', s.picker.credit);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await photoMatches(page, /wallpapers\/[a-z]+\.jpg$/);
    s = await snapshot(page);
    check('Choosing a bundled photo replaces the daily one, glass included', s.glass.every(entry => /materials\//.test(entry)) && s.saved?.daily === false, [s.glass, s.saved?.daily]);
    await press(page, 'ArrowLeft');
    await press(page, 'Enter');
    await photoMatches(page, new RegExp('/id/' + id + '/'));
    s = await snapshot(page);
    check('Choosing Daily photo again brings back today\'s photo and its glass', s.saved?.daily === true && same(s.glass, DAILY_GLASS), [s.saved?.daily, s.glass]);
    await press(page, 'Escape');
    await settled(page);
    check('The Wallpaper row says Daily photo', rowValue(await snapshot(page), 'Wallpaper') === 'Daily photo');
  });

  await section('Daily photo: a new one after midnight', { clock: new Date('2026-10-31T23:58:00') }, async (launcher, page) => {
    await photoMatches(page, ONLINE_PHOTO);
    const before = await snapshot(page), id = onlineId(before.photo);
    check('Before midnight the pick is for October 31', before.saved?.photo?.day === '2026-10-31', before.saved?.photo);
    await page.clock.fastForward(61000); // The screensaver starts at 23:59.
    await page.clock.fastForward(2 * 60 * 1000);
    await page.clock.fastForward(6000); // The clock checks every 5 s.
    await page.waitForTimeout(300);
    let after = await snapshot(page);
    check('Past midnight no new daily photo is picked while the screensaver runs', has(after, 'is-ambient') && after.saved?.photo?.day === '2026-10-31', [after.classes, after.saved?.photo]);
    await press(page, 'ArrowDown'); // Wake: Home picks and shows its photo for the new day.
    await page.waitForFunction(old => { const src = document.querySelector('.bg-photo.is-front')?.getAttribute('src') || ''; return /picsum/.test(src) && !src.includes('/id/' + old + '/'); }, id, { timeout: 8000 }).catch(() => {});
    after = await snapshot(page);
    check('After midnight Home shows a different photo, picked for November 1', onlineId(after.photo) && onlineId(after.photo) !== id && after.saved?.photo?.day === '2026-11-01', [before.photo, after.photo, after.saved?.photo]);
    check('The new photo gets its own glass', same(after.glass, DAILY_GLASS), after.glass);
  });

  await section('Daily photo: the screensaver slideshow', { clock: new Date('2026-10-31T12:00:00') }, async (launcher, page) => {
    await photoMatches(page, ONLINE_PHOTO);
    const home = await snapshot(page);
    launcher.requests.length = 0;
    await page.clock.fastForward(61000);
    await page.waitForTimeout(300);
    let s = await snapshot(page);
    check('The screensaver starts on Home\'s photo and asks for a list page', has(s, 'is-ambient') && s.photo === home.photo && launcher.requests.filter(url => /v2\/list/.test(url)).length === 1, [s.photo, launcher.requests]);
    await page.waitForTimeout(500); // The next photo loads ahead.
    await page.clock.fastForward(40000);
    await page.waitForTimeout(300);
    s = await snapshot(page);
    check('After 40 s it shows another online photo with its credit', onlineId(s.photo) && s.photo !== home.photo && s.caption.credit === 'Photo by ' + author(onlineId(s.photo)) + ' on Unsplash' && s.caption.title === '', [s.photo, s.caption]);
    check('The slideshow leaves Home\'s glass alone', same(s.glass, home.glass), s.glass);
    check('The slideshow never changes Home\'s saved choice', s.saved?.daily === true && s.saved?.photo?.id === onlineId(home.photo), s.saved?.photo);
    await press(page, 'ArrowDown');
    await photoMatches(page, new RegExp(home.photo.replace(/[/.?]/g, '\\$&') + '$'));
    s = await snapshot(page);
    check('Waking restores Home\'s photo and glass', !has(s, 'is-ambient') && s.photo === home.photo && same(s.glass, home.glass), [s.photo, s.glass]);
  });

  await section('Offline', { offline: true, clock: new Date('2026-10-31T12:00:00') }, async (launcher, page) => {
    await photoMatches(page, /\/valley\.jpg$/, 5000);
    let s = await snapshot(page);
    check('Without internet a first run shows the bundled photo with its glass', s.glass.every(entry => /materials\/valley-/.test(entry)), s.glass);
    check('Without internet the weather stays hidden (no made-up temperature)', !s.weather.on && s.weather.text === '', s.weather);
    check('Daily photo stays the setting, to show once the TV is online', s.saved === null || s.saved?.daily !== false, s.saved);
    await openSettings(page);
    check('The Wallpaper row says Daily photo', rowValue(await snapshot(page), 'Wallpaper') === 'Daily photo');
    await openRow(page, 'Wallpaper');
    s = await snapshot(page);
    check('The Daily photo tile has no photo yet and says why', s.picker.dailyThumb === '' && s.picker.credit === 'A new photo each day, once the TV is online', s.picker);
    await closeSettings(page);
    await page.clock.fastForward(61000);
    await page.clock.fastForward(40000);
    await page.waitForTimeout(500);
    s = await snapshot(page);
    check('The offline slideshow shows the bundled photos with their titles', has(s, 'is-ambient') && /wallpapers\/(?!valley)[a-z]+\.jpg$/.test(s.photo) && s.caption.title !== '', [s.photo, s.caption]);
    await press(page, 'ArrowDown');
    await photoMatches(page, /\/valley\.jpg$/);
    check('Waking restores the bundled Home photo', !has(await snapshot(page), 'is-ambient'));
  });

  await section('Offline: retries', { offline: true, clock: new Date('2026-10-31T12:00:00'), seed: { version: 1, daily: true, amb: 3 } }, async (launcher, page) => {
    await photoMatches(page, /\/valley\.jpg$/, 5000);
    await page.waitForTimeout(300);
    const first = launcher.requests.length;
    check('A first try was made for the weather and the daily photo', launcher.requests.some(url => /zippopotam/.test(url)) && launcher.requests.some(url => /v2\/list/.test(url)), launcher.requests);
    await page.clock.fastForward(4 * 60 * 1000);
    await page.waitForTimeout(300);
    check('Nothing is tried again within 5 minutes', launcher.requests.length === first, launcher.requests.slice(first));
    await page.clock.fastForward(66 * 1000);
    await page.waitForTimeout(300);
    const later = launcher.requests.slice(first);
    check('After 5 minutes the weather and the daily photo are tried again', later.some(url => /zippopotam/.test(url)) && later.some(url => /v2\/list/.test(url)), later);
  });

  const tints = {};
  for (const [label, ids] of [['bright', ['1003']], ['dark', ['1005']]]) {
    await section('Daily photo: the tints over a ' + label + ' photo', { photoIds: ids }, async (launcher, page) => {
      await photoMatches(page, new RegExp('/id/' + ids[0] + '/'));
      tints[label] = await tintsOf(page);
      check('The tints are set from the ' + label + ' photo', Object.values(tints[label]).every(value => value > 0 && value < 1), tints[label]);
    });
  }
  if (tints.bright && tints.dark) {
    check('A bright photo darkens the time\'s capsule more than a dark one', tints.bright['--tint-tr'] > tints.dark['--tint-tr'], tints);
    check('A bright photo darkens the panels and the resume plate; a dark one keeps the bundled tints', tints.bright['--panel-tint'] > 0.56 && tints.dark['--panel-tint'] === 0.56 && tints.bright['--plate-tint'] > tints.dark['--plate-tint'], tints);
  }

  await section('Weather', { clock: new Date('2026-10-31T12:00:00') }, async (launcher, page) => {
    await page.waitForFunction(() => !document.querySelector('.weather').classList.contains('is-off'), null, { timeout: 5000 });
    let s = await snapshot(page);
    check('The weather shows the reading for Costa Mesa (18.9 °C is 66 °F, cloudy)', s.weather.text === '66°' && s.weather.label === 'Cloudy, 66 degrees', s.weather);
    const weatherCalls = () => launcher.requests.filter(url => /zippopotam|open-meteo/.test(url));
    check('It asks Zippopotam.us for the ZIP code\'s place, then Open-Meteo for that place', same(weatherCalls().map(url => url.replace(/\?.*/, '')), ['https://api.zippopotam.us/us/92626', 'https://api.open-meteo.com/v1/forecast'])
      && /latitude=33\.68&longitude=-117\.91&/.test(weatherCalls()[1]), weatherCalls());
    check('The place and reading are saved', s.saved?.place?.name === 'Costa Mesa' && s.saved?.wx?.c === 18.9 && s.saved?.wx?.code === 3, [s.saved?.place, s.saved?.wx]);
    await openSettings(page);
    await openRow(page, 'Weather');
    await gotoRow(page, 'Units');
    await press(page, 'Enter');
    s = await snapshot(page);
    check('Celsius converts the saved reading at once (19°)', s.weather.text === '19°' && s.weather.label === 'Cloudy, 19 degrees', s.weather);
    await closeSettings(page);
    const calls = weatherCalls().length;
    await page.clock.fastForward(29 * 60 * 1000);
    await page.waitForTimeout(200);
    check('No new check within 30 minutes', weatherCalls().length === calls, weatherCalls());
    await page.clock.fastForward(2 * 60 * 1000);
    await page.waitForTimeout(300);
    const later = weatherCalls().slice(calls);
    check('After 30 minutes one new forecast, reusing the saved place', later.length === 1 && /open-meteo/.test(later[0]), later);
    await openSettings(page);
    await openRow(page, 'Weather');
    await openRow(page, 'ZIP code');
    for (const digit of '00000') await press(page, digit);
    await press(page, 'Enter');
    await settled(page);
    await page.waitForFunction(() => /not found/.test(document.getElementById('panelRows').textContent), null, { timeout: 5000 }).catch(() => {});
    s = await snapshot(page);
    check('A ZIP code Zippopotam.us doesn\'t know shows as not found, and the weather hides', rowValue(s, 'ZIP code') === '00000 · not found' && !s.weather.on, [s.panel.rows, s.weather]);
    const expected = launcher.failures.filter(failure => /zippopotam\.us\/us\/00000$/.test(failure));
    check('Its lookup was the only failed request', expected.length >= 1 && expected.length === launcher.failures.length, launcher.failures);
    launcher.failures.length = 0;
    const lookups = () => launcher.requests.filter(url => /zippopotam\.us\/us\/00000$/.test(url)).length, tried = lookups();
    await page.clock.fastForward(6 * 60 * 1000);
    await page.waitForTimeout(300);
    check('An unknown ZIP code isn\'t looked up again until it changes', lookups() === tried, [tried, lookups()]);
  });

  await section('Inputs tab', {}, async (launcher, page) => {
    await press(page, 'ArrowUp');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await press(page, 'ArrowDown');
    let s = await snapshot(page);
    check('Inputs lists the shown HDMI ports as the TV reports them, then Source list and Edit inputs', has(s, 'tab-inputs') && same(s.inputs, ['Connected', 'No device', 'No device', 'Source list', 'Edit inputs']) && focusIs(s, 'inputs', 0), [s.inputs, s.f]);
    await press(page, 'Enter');
    await afterCallbacks(page);
    s = await snapshot(page);
    check('OK on HDMI 1 shows it full screen through tvwindow', same(s.tvwindow, ['setSource HDMI 1', 'show']) && s.toast === 'Press Back to return to Home.', [s.tvwindow, s.toast]);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    s = await snapshot(page);
    check('Other keys do nothing while HDMI 1 shows', same(s.tvwindow, ['setSource HDMI 1', 'show']) && focusIs(s, 'inputs', 0), [s.tvwindow, s.f]);
    await keyDownOnly(page, 27);
    await page.waitForTimeout(200);
    await keyDownOnly(page, 27); // Back still held, on a TV that doesn't flag repeats.
    await afterCallbacks(page);
    s = await snapshot(page);
    check('Back closes the HDMI view onto the same tile, and holding it does nothing more', same(s.tvwindow, ['setSource HDMI 1', 'show', 'hide']) && focusIs(s, 'inputs', 0) && has(s, 'tab-inputs'), [s.tvwindow, s.f, s.classes]);
    await page.waitForTimeout(900);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    s = await snapshot(page);
    check('A port with nothing connected says so', s.toast === 'Nothing is connected to HDMI 2.', s.toast);
    await press(page, 'ArrowRight', 2);
    await press(page, 'Enter');
    await afterCallbacks(page);
    s = await snapshot(page);
    check('Source list opens Samsung\'s source app', same(s.launches, [SOURCE_APP]) && !failure(s.toast), [s.launches, s.toast]);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await settled(page);
    s = await snapshot(page);
    check('Edit inputs opens the Inputs page', has(s, 'is-panel') && s.panel.title === 'Inputs' && same(s.panel.rows.map(row => row.value), ['Connected', 'No device', 'No device', 'Hidden']), s.panel);
    await openRow(page, 'HDMI 1');
    await openRow(page, 'Name');
    await page.keyboard.type('Game console');
    await press(page, 'Enter');
    await settled(page);
    await closeSettings(page);
    s = await snapshot(page);
    check('A name typed for HDMI 1 shows on its tile and is saved', s.inputs[0] === 'Game console' && s.saved?.inputs?.[0]?.name === 'Game console', [s.inputs, s.saved?.inputs]);
    await press(page, 'ArrowLeft', 4);
    await press(page, 'Enter');
    await afterCallbacks(page);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    s = await snapshot(page);
    check('Leaving Home while an HDMI port shows closes the HDMI view', s.tvwindow.slice(-1)[0] === 'hide' && s.tvwindow.filter(step => step === 'show').length === 2, s.tvwindow);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await press(page, 'ArrowRight');
    check('Keys work normally on returning', focusIs(await snapshot(page), 'inputs', 1));
    await page.evaluate(() => window.__tv.system.VIDEOSOURCE.connected.push({ type: 'HDMI', number: 2 }));
    await press(page, 'ArrowUp');
    await press(page, 'ArrowLeft');
    await press(page, 'Enter');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await afterCallbacks(page);
    s = await snapshot(page);
    check('A device plugged in later shows when the Inputs tab opens again', has(s, 'tab-inputs') && s.inputs[1] === 'Connected', s.inputs);
  });

  await section('Renaming an input: the TV keyboard and the screensaver', { clock: new Date('2026-10-31T12:00:00') }, async (launcher, page) => {
    await press(page, 'ArrowUp');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowRight', 4);
    await press(page, 'Enter');
    await settled(page);
    await openRow(page, 'HDMI 1');
    await openRow(page, 'Name');
    await page.clock.fastForward(3 * 60 * 1000);
    let s = await snapshot(page);
    check('No screensaver while a name is typed', !has(s, 'is-ambient') && has(s, 'is-panel') && s.panel.title === 'Name', [s.classes, s.panel.title]);
    await page.keyboard.type('Den TV');
    await keyDownOnly(page, 65376); // Done on the TV's keyboard ...
    await keyDownOnly(page, 13); // ... which may be followed by Enter for the same press.
    await settled(page);
    await page.waitForTimeout(300);
    s = await snapshot(page);
    check('Done on the TV keyboard saves the name, once', s.panel.title === 'HDMI 1' && rowValue(s, 'Name') === 'Den TV' && s.saved?.inputs?.[0]?.name === 'Den TV', [s.panel.title, s.panel.rows, s.saved?.inputs]);
    check('The name field lets go of focus', await page.evaluate(() => document.activeElement === document.getElementById('stage')));
    await openRow(page, 'Name');
    await page.keyboard.type('Garage');
    await keyDownOnly(page, 65385); // Cancel on the TV's keyboard.
    await settled(page);
    s = await snapshot(page);
    check('Cancel on the TV keyboard keeps the old name', s.panel.title === 'HDMI 1' && rowValue(s, 'Name') === 'Den TV', [s.panel.title, s.panel.rows]);
    await page.clock.fastForward(61000);
    s = await snapshot(page);
    check('The screensaver comes back once typing is over, closing Settings', has(s, 'is-ambient') && !has(s, 'is-panel'), s.classes);
    await press(page, 'Enter');
    await afterCallbacks(page);
    s = await snapshot(page);
    check('OK wakes Home without acting', !has(s, 'is-ambient') && same(s.launches, []) && !has(s, 'is-dialog'), [s.classes, s.launches]);
  });

  await section('Saved choices from earlier builds', { seed: { fav: ['netflix', 'plex'], hid: ['disneyplus'], wall: 4, amb: 1, inputs: [{ name: 'PlayStation 5', show: true }, { name: 'Mac mini', show: true }, { name: 'Xbox', show: true }, { name: '', show: false }] } }, async (launcher, page) => {
    await photoMatches(page, /\/night\.jpg$/);
    let s = await snapshot(page);
    check('A save from before the daily photo keeps its bundled photo', /\/night\.jpg$/.test(s.photo) && !launcher.requests.some(url => /picsum/.test(url)), [s.photo, launcher.requests]);
    check('Its favourites stand', same(s.fav, ['netflix', 'plex']), s.fav);
    await press(page, 'ArrowUp');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    s = await snapshot(page);
    check('The two sample input names earlier builds saved are cleared; an owner\'s name stays', same(s.inputs.slice(0, 3), ['Connected', 'No device', 'Xbox']), s.inputs);
  });

  await section('A V1 save', { seed: { version: 1, inputs: [{ name: 'PlayStation 5', show: true }, { name: 'Mac mini', show: true }, { name: '', show: true }, { name: '', show: false }] } }, async (launcher, page) => {
    await press(page, 'ArrowUp');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    const s = await snapshot(page);
    check('Names the owner typed are kept, even ones that match the old samples', same(s.inputs.slice(0, 2), ['PlayStation 5', 'Mac mini']), s.inputs);
  });

  await section('The TV\'s app list fails at first', { appsFail: 1, clock: new Date('2026-10-31T12:00:00'), seed: { version: 1, fav: ['netflix', 'plex'], hid: ['ZmmGjO6VKO.slingtv'] } }, async (launcher, page) => {
    let s = await snapshot(page);
    check('Home says it couldn\'t read the TV\'s apps yet', /couldn’t read the TV’s apps/.test(s.toast), s.toast);
    await press(page, 'Enter');
    await afterCallbacks(page);
    s = await snapshot(page);
    check('A stand-in app launches nothing and says why', same(s.launches, []) && /still reading the TV’s apps/.test(s.toast), [s.launches, s.toast]);
    await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('library-prototype.v1') || '{}').wx, null, { timeout: 5000 }).catch(() => {});
    s = await snapshot(page);
    check('A save meanwhile keeps the owner\'s Favorites and Hidden as they were', !!s.saved?.wx && same(s.saved?.fav, ['netflix', 'plex']) && same(s.saved?.hid, ['ZmmGjO6VKO.slingtv']), s.saved);
    await page.clock.fastForward(10000);
    await page.waitForFunction(() => document.querySelectorAll('#library .tile').length > 5, null, { timeout: 5000 }).catch(() => {});
    s = await snapshot(page);
    check('10 s later the TV\'s apps arrive, arranged by the owner\'s lists', same(s.fav, ['netflix', 'plex']) && !s.library.flat().some(app => /sling/i.test(app)) && s.library.flat().includes('disneyplus'), [s.fav, s.library]);
    await press(page, 'Enter');
    await afterCallbacks(page);
    check('Apps launch once the list has arrived', same((await snapshot(page)).launches, [APP.netflix]));
  });

  await section('Apps installed while Home runs', {}, async (launcher, page) => {
    await openSettings(page);
    await openRow(page, 'Apps');
    await page.evaluate(() => window.__tv.apps.push({ id: '3KA0pm7a7V.TubiTV', name: 'Tubi - Free Movies & TV', iconPath: '/opt/usr/globalapps/3KA0pm7a7V.TubiTV/shared/res/icon.png', show: true }));
    await visibility(page, true);
    await visibility(page, false);
    await page.waitForTimeout(300);
    let s = await snapshot(page);
    check('While the Apps editor is open, a newly installed app waits', has(s, 'is-editor') && !s.editor.apps.includes('tubi'), s.editor.apps);
    await press(page, 'Escape');
    await page.waitForFunction(() => document.querySelectorAll('#library .tile').length === 6, null, { timeout: 5000 }).catch(() => {});
    await closeSettings(page);
    s = await snapshot(page);
    check('Once the editor closes, the app joins the library, A–Z', same(s.library, [['amazonalexa', 'hbomax', 'Samsung TV Plus', 'smartthings', 'spotify', 'tubi']]), s.library);
    check('The favourites are unchanged', same(s.fav, FAV_MARKS), s.fav);
    await openSettings(page);
    await openRow(page, 'Apps');
    s = await snapshot(page);
    check('The Apps editor lists it too', s.editor.apps.includes('tubi') && s.editor.apps.length === INSTALLED.length + 1, s.editor.apps);
  });

  await section('An app the TV briefly doesn\'t list', {}, async (launcher, page) => {
    await page.evaluate(() => { window.__tv.all = window.__tv.apps; window.__tv.apps = window.__tv.apps.filter(app => !/plex|slingtv/i.test(app.id)); });
    await visibility(page, true);
    await visibility(page, false);
    await page.waitForFunction(() => document.querySelectorAll('#favRow .tile').length === 5, null, { timeout: 5000 }).catch(() => {});
    let s = await snapshot(page);
    check('While Plex is missing from the TV\'s list, Home shows the other favourites', same(s.fav, FAV_MARKS.slice(1)), s.fav);
    await press(page, 'Enter'); // A launch saves.
    await afterCallbacks(page);
    s = await snapshot(page);
    check('A save meanwhile keeps Plex first in Favorites and Sling TV hidden', s.saved?.fav?.[0] === 'plex' && !!s.saved?.hid?.includes('ZmmGjO6VKO.slingtv') && same(s.launches, [APP.youtube]), [s.saved, s.launches]);
    await page.evaluate(() => { window.__tv.apps = window.__tv.all; });
    await visibility(page, true);
    await visibility(page, false);
    await page.waitForFunction(() => document.querySelectorAll('#favRow .tile').length === 6, null, { timeout: 5000 }).catch(() => {});
    s = await snapshot(page);
    check('Listed again, Plex is back first in the dock and Sling TV is still hidden', same(s.fav, FAV_MARKS) && !s.library.flat().some(app => /sling/i.test(app)), [s.fav, s.library]);
  });

  await section('A damaged save', { seed: { fav: 'netflix', hid: 5, inputs: 'abc', wall: 99, amb: -1, weather: 7, place: [], wx: 'x', photo: 5, daily: 'yes' } }, async (launcher, page) => {
    const s = await snapshot(page);
    check('Home starts with the owners\' defaults', same(s.fav, FAV_MARKS) && same(s.library, LIBRARY), [s.fav, s.library]);
    check('A damaged daily flag counts as off', /wallpapers\/[a-z]+\.jpg$/.test(s.photo), s.photo);
  });

  const buildDir = mkdtempSync(join(tmpdir(), 'home-build-'));
  let built;
  try {
    execFileSync('python3', ['scripts/build-demo.py', '--out', buildDir], { cwd: repo, stdio: 'pipe' });
    built = await startStatic(buildDir);
    await section('The built package', { base: built.base, path: '/index.html' }, async (launcher, page) => {
      let s = await snapshot(page);
      check('Home starts from the built files', same(s.fav, FAV_MARKS) && same(s.library, LIBRARY), [s.fav, s.library]);
      check('The build has no preview key hints', await page.evaluate(() => !document.getElementById('hints')));
      await press(page, 'a');
      check('The preview\'s screensaver key does nothing', !has(await snapshot(page), 'is-ambient'));
      await page.mouse.click(215, 862);
      await afterCallbacks(page);
      check('Mouse clicks do nothing', same((await snapshot(page)).launches, []));
      await openSettings(page);
      await openRow(page, 'About');
      s = await snapshot(page);
      check('About shows the build\'s commit and size', !/Browser preview/.test(rowValue(s, 'Version')) && /MB$/.test(rowValue(s, 'App size')), s.panel.rows);
    });
  } finally {
    if (built) await built.stop();
    rmSync(buildDir, { recursive: true, force: true });
  }

  await section('Screensaver', { clock: new Date('2026-10-31T12:00:00') }, async (launcher, page) => {
    await openSettings(page);
    check('The screensaver is set to "After 1 min"', rowValue(await snapshot(page), 'Screensaver') === 'After 1 min');
    await press(page, 'Escape');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowRight', 2);
    let s = await snapshot(page);
    if (!focusIs(s, 'fav', 2)) throw Error('Expected focus on the third favourite, found ' + JSON.stringify(s.f));
    await page.clock.fastForward(58000);
    check('58 s after the last key Home is still showing', !has(await snapshot(page), 'is-ambient'));
    await page.clock.fastForward(3000);
    s = await snapshot(page);
    check('61 s after the last key the screensaver starts', has(s, 'is-ambient'), s.classes);
    const date = await page.evaluate(() => document.getElementById('ambDate').textContent);
    check('The screensaver shows the date ("Saturday, October 31st")', date === 'Saturday, October 31st', date);
    await press(page, 'Enter');
    await afterCallbacks(page);
    s = await snapshot(page);
    check('OK wakes Home from the screensaver', !has(s, 'is-ambient'), s.classes);
    check('The waking OK is not acted on: no launch, no menu, focus unchanged', same(s.launches, []) && !has(s, 'is-menu') && focusIs(s, 'fav', 2), [s.launches, s.f]);
    await page.clock.fastForward(61000);
    check('The idle timer restarts after waking (screensaver again after 61 s)', has(await snapshot(page), 'is-ambient'));
    await keyDownOnly(page, 13);
    await page.waitForTimeout(200);
    await keyDownOnly(page, 13); // OK still held, on a TV that doesn't flag repeats.
    await page.waitForTimeout(600);
    s = await snapshot(page);
    check('Holding OK to wake Home opens no menu and launches nothing', !has(s, 'is-ambient') && !has(s, 'is-menu') && same(s.launches, []), [s.classes, s.launches]);
    await page.waitForTimeout(900);
    await page.clock.fastForward(61000);
    await press(page, 'ArrowRight');
    s = await snapshot(page);
    check('An arrow wakes Home without moving focus', !has(s, 'is-ambient') && focusIs(s, 'fav', 2), [s.classes, s.f]);
  });
} catch (error) {
  check('Checks ran to the end', false, error.stack);
} finally {
  if (browser) await browser.close();
  if (preview) await preview.stop();
}

console.log('\n' + passed + ' passed, ' + failed + ' failed.');
if (failed) process.exitCode = 1;
