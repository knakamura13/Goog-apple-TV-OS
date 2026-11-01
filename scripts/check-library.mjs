// End-to-end checks for the Library Home prototype (demo/library/), driven with remote keys in Chromium:
// arrows move, Enter is OK, Escape is Back. A stand-in for the TV's public Tizen API reports the owners' installed
// apps, so every screen runs its TV code paths (app discovery, launching, Samsung's screens, Settings › About).
// Each section starts from a fresh profile. Never contacts a TV.
//
// Deliberately not covered, because they are being changed in parallel: the Sleep timer row, the test readout on
// remote keys 0–4, what Inputs-tab tiles do, and the weather temperature.
//
// Prints PASS / FAIL per assertion and exits 1 on any failure, page error or unexpected resource failure.
// A known app bug is printed as FINDING instead of failing (the app is not changed here); once the bug is fixed,
// the same assertion prints PASS. LIBRARY_SECTION=<text> runs only the sections whose names contain <text>.
import { APP, SAMSUNG_HOME, SAMSUNG_SETTINGS, hold, launchBrowser, openLauncher, press, settled, snapshot, startPreview } from './library-harness.mjs';

// First run with the stand-in TV: the first six installed apps from the owners' list are favourites, the rest of
// that list fills the library (A–Z) and every other installed app starts hidden.
const FAVS = ['plex', 'youtube', 'netflix', 'appletv', 'hulu', 'primevideo'];
const FAV_MARKS = ['plex', 'youtube', 'netflix', 'appletv', 'hulu', 'primevideo-wordmark']; // Prime Video uses its wordmark.
const LIBRARY = [['amazonalexa', 'hbomax', 'Samsung TV Plus', 'smartthings', 'spotify']]; // Amazon Alexa … Spotify, A–Z.
const HIDDEN = ['ZmmGjO6VKO.slingtv', 'disneyplus']; // Disney+ and Sling TV (sorted).
const INSTALLED = Object.keys(APP).sort(); // Every installed app except the launcher itself and the AD Player.

let passed = 0, failed = 0;
const findings = [];
function check(name, ok, detail) {
  if (ok) passed++; else failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || detail === undefined ? '' : ' — ' + JSON.stringify(detail)));
  return ok;
}
function known(name, ok, bug, detail) {
  if (ok) { passed++; console.log('PASS ' + name + ' (known bug no longer reproduces: ' + bug + ')'); return; }
  findings.push(name + ': ' + bug);
  console.log('FINDING ' + name + ' — app bug: ' + bug + (detail === undefined ? '' : ' ' + JSON.stringify(detail)));
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
    launcher = await openLauncher(browser, preview.base, options);
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
    check('Favourite menu offers Move, Remove from Favorites, Hide', same(s.menu.rows, ['Move', 'Remove from Favorites', 'Hide']), s.menu.rows);
    check('The menu opens with Move focused', focusIs(s, 'menu', 0));
    await press(page, 'Escape');
    s = await snapshot(page);
    check('Back closes the menu and returns to the same favourite', !has(s, 'is-menu') && focusIs(s, 'fav', 0), s.f);

    await press(page, 'ArrowDown');
    await hold(page);
    s = await snapshot(page);
    const before = s.saved;
    check('Library app menu offers Move, Add to Favorites, Hide', s.menu.title === 'Amazon Alexa' && same(s.menu.rows, ['Move', 'Add to Favorites', 'Hide']), s.menu);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    s = await snapshot(page);
    check('With 6 favourites, Add to Favorites explains the limit', /Favorites hold 6 apps/.test(s.toast), s.toast);
    check('With 6 favourites, Add to Favorites changes nothing (lists, saved state, menu stays open)', same(s.fav, FAV_MARKS) && same(s.library, LIBRARY) && same(s.saved, before) && has(s, 'is-menu'), [s.fav, s.library, s.saved]);
    await press(page, 'Escape');
    check('Back closes the library menu and returns to the same app', focusIs(await snapshot(page), 'lib', 0));

    await press(page, 'ArrowUp');
    await hold(page);
    await press(page, 'ArrowDown', 2);
    await press(page, 'Enter');
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
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    s = await snapshot(page);
    check('With 5 favourites, Add to Favorites moves Amazon Alexa to the end of the dock', same(s.fav, FAV_MARKS.slice(1).concat('amazonalexa')) && s.saved?.fav.at(-1) === 'alexa', [s.fav, s.saved?.fav]);
    check('Add focuses the added favourite', focusIs(s, 'fav', 5), s.f);
    await hold(page);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    s = await snapshot(page);
    check('Remove from Favorites moves Amazon Alexa back to the library, A–Z', same(s.fav, FAV_MARKS.slice(1)) && same(s.library, LIBRARY) && !s.saved?.hid.includes('alexa'), [s.fav, s.library]);

    await press(page, 'ArrowLeft', 5);
    await press(page, 'ArrowDown');
    await hold(page);
    await press(page, 'Enter');
    s = await snapshot(page);
    check('Move opens the Apps editor carrying the app', has(s, 'is-editor') && same(s.editor.carry, ['alexa']), [s.classes, s.editor]);
    check('The editor says what is being moved', /^Moving Amazon Alexa\./.test(s.editor.hint), s.editor.hint);
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    s = await snapshot(page);
    check('Carrying the app up and pressing OK makes it a favourite', s.saved?.fav.includes('alexa') && same(s.editor.carry, []), [s.saved?.fav, s.editor]);
    check('The launcher launched nothing while editing', same(s.launches, []), s.launches);
  });

  await section('Edit in place: leaving the Apps editor after Move', {}, async (launcher, page) => {
    await hold(page);
    await press(page, 'Enter');
    check('Move from the menu opens the Apps editor', has(await snapshot(page), 'is-editor'));
    await press(page, 'Escape');
    const errorsBefore = launcher.errors.length;
    await press(page, 'Escape');
    const s = await snapshot(page), thrown = launcher.errors.slice(errorsBefore);
    known('Back out of an editor opened by Move returns to Home without an error', !thrown.length && !has(s, 'is-editor') && focusIs(s, 'fav'),
      'closeEditor() always returns to the Settings panel, whose page stack is empty when the editor came from the hold-OK menu; render() throws, every later key throws again, and the editor stays on screen until the idle screensaver closes it',
      { thrown, classes: s.classes.filter(c => c.startsWith('is-')) });
    // The thrown errors are this finding, not a new failure.
    launcher.errors.splice(errorsBefore, thrown.length);
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
    check('Weather defaults to ZIP 92626 in Fahrenheit', rowValue(s, 'ZIP code') === '92626' && rowValue(s, 'Units') === 'Fahrenheit', s.panel.rows);
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
    check('OK saves the ZIP code and returns to the Weather page', s.panel.title === 'Weather' && rowValue(s, 'ZIP code') === '90229' && s.saved?.weather?.zip === '90229', [s.panel.title, s.saved?.weather]);
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
    check('The Weather ZIP code persists across a reload', rowValue(s, 'ZIP code') === '90229', s.panel.rows);
  });

  await section('Wallpaper picker', {}, async (launcher, page) => {
    await openSettings(page);
    let s = await snapshot(page);
    const start = rowValue(s, 'Wallpaper');
    await openRow(page, 'Wallpaper');
    s = await snapshot(page);
    check('Wallpaper opens the picker on the applied photo (Mountain valley)', has(s, 'is-picker') && start === 'Mountain valley' && s.picker.focused === s.picker.applied && s.picker.title === 'Mountain valley', [start, s.picker]);
    const first = s.picker.focused;
    await press(page, 'ArrowLeft');
    check('Left moves to the photo beside it', (await snapshot(page)).picker.focused === first - 1);
    await press(page, 'ArrowRight');
    check('Right moves back across the row', (await snapshot(page)).picker.focused === first);
    await press(page, 'ArrowDown');
    s = await snapshot(page);
    check('Down moves to the next row (Blue peaks)', s.picker.focused === first + 2 && s.picker.title === 'Blue peaks', s.picker);
    await page.waitForFunction(() => /\/peaks\.jpg$/.test(document.querySelector('.bg-photo.is-front').getAttribute('src')), null, { timeout: 5000 });
    check('Resting on a photo previews it full screen', /\/peaks\.jpg$/.test((await snapshot(page)).photo));
    await press(page, 'Enter');
    await page.waitForFunction(applied => document.querySelector('#pkGrid > .pk-item.is-applied')?.getAttribute('data-i') === String(applied), first + 2, { timeout: 5000 }).catch(() => {});
    s = await snapshot(page);
    check('OK applies the photo (check mark moves to it)', s.picker.applied === first + 2, s.picker);
    await press(page, 'ArrowLeft');
    await page.waitForFunction(() => /\/night\.jpg$/.test(document.querySelector('.bg-photo.is-front').getAttribute('src')), null, { timeout: 5000 });
    await press(page, 'Escape');
    await page.waitForFunction(() => /\/peaks\.jpg$/.test(document.querySelector('.bg-photo.is-front').getAttribute('src')), null, { timeout: 5000 }).catch(() => {});
    s = await snapshot(page);
    check('Back closes the picker and restores the applied photo, not the preview', !has(s, 'is-picker') && has(s, 'is-panel') && /\/peaks\.jpg$/.test(s.photo), [s.classes, s.photo]);
    check('The Wallpaper row shows the applied photo', rowValue(s, 'Wallpaper') === 'Blue peaks', rowValue(s, 'Wallpaper'));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.bg-photo.is-front'));
    s = await snapshot(page);
    known('The applied wallpaper persists across a reload', /\/peaks\.jpg$/.test(s.photo) && s.saved?.wall === first + 2,
      'OK in the picker applies the photo but never calls save(); it is kept only if another setting happens to be saved afterwards', { photo: s.photo, saved: s.saved });
  });

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

console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + findings.length + ' known app bug(s) reported.');
for (const finding of findings) console.log('  FINDING ' + finding);
if (failed) process.exitCode = 1;
