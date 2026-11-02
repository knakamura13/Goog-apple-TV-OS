// Development only. Shared setup for Home's browser checks (scripts/check-e2e.mjs, check-a11y.mjs, check-perf.mjs).
// Serves app/ (at /home/) from the loopback preview, drives Playwright's Chromium and installs a stand-in for the
// TV's public Tizen API before the page loads, so the launcher runs its TV code paths. The weather and photo
// services are answered from fixtures (or fail, to check offline behaviour), so no check reaches the internet.
// Never contacts a TV.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repo = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = createRequire(join(repo, 'package.json'))('playwright');

export const STORE = 'library-prototype.v1';
export const SELF_ID = 'Zm209bQNEk.Home';

// What the owners' TV reports from tizen.application.getAppsInfo, with the TV's own names (Plex's carries a
// full-width ampersand). The launcher must leave out its own ID and Samsung's internal ad player.
export const TV_APPS = [
  ['kIciSQlYEM.plex', 'Plex - Free Movies ＆ TV'],
  ['9Ur5IzDKqV.TizenYouTube', 'YouTube'],
  ['org.tizen.netflix-app', 'Netflix'],
  ['com.samsung.tv.aria-video', 'Apple TV'],
  ['LBUAQX1exg.Hulu', 'Hulu'],
  ['org.tizen.primevideo', 'Prime Video'],
  ['5b8c3eb16b.BeamCTVDev', 'HBO Max'],
  ['rJeHak5zRg.Spotify', 'Spotify - Music and Podcasts'],
  ['HEPsqFNie0.tvplusstandalone', 'Samsung TV Plus'],
  ['AQKO41xyKP.AmazonAlexa', 'Amazon Alexa'],
  ['com.samsung.tv.SmartThingsApp', 'SmartThings'],
  ['MCmYXNxgcu.DisneyPlus', 'Disney+'],
  ['ZmmGjO6VKO.slingtv', 'Sling TV'],
  [SELF_ID, 'Home'],
  ['adplatform.ADPlayer', 'AD Player']
].map(([id, name]) => ({ id, name, iconPath: '/opt/usr/globalapps/' + id + '/shared/res/icon.png', show: true }));

// The launcher's app ID (a logo it bundles, or the TV ID for an app without one) and the TV ID it launches.
export const APP = {
  plex: 'kIciSQlYEM.plex', youtube: '9Ur5IzDKqV.TizenYouTube', netflix: 'org.tizen.netflix-app',
  appletv: 'com.samsung.tv.aria-video', hulu: 'LBUAQX1exg.Hulu', primevideo: 'org.tizen.primevideo',
  hbomax: '5b8c3eb16b.BeamCTVDev', spotify: 'rJeHak5zRg.Spotify', 'HEPsqFNie0.tvplusstandalone': 'HEPsqFNie0.tvplusstandalone',
  alexa: 'AQKO41xyKP.AmazonAlexa', smartthings: 'com.samsung.tv.SmartThingsApp', disneyplus: 'MCmYXNxgcu.DisneyPlus',
  'ZmmGjO6VKO.slingtv': 'ZmmGjO6VKO.slingtv'
};
export const SAMSUNG_HOME = 'com.samsung.tv.csfs';
export const SAMSUNG_SETTINGS = 'com.samsung.tv.coba.setting';

// systeminfo values for Settings › About and the Inputs tab's HDMI probe.
const SYSTEM = {
  BUILD: { model: 'QN65S90DAFXZA', buildVersion: 'T-TEST-2130' },
  STORAGE: { units: [{ isRemovable: false, availableCapacity: 5e8, capacity: 4.1e9 }] },
  VIDEOSOURCE: { connected: [{ type: 'HDMI', number: 1 }], disconnected: [] }
};

// Runs in the page before any launcher script. Callbacks are asynchronous, as they are on the TV. window.__tv holds
// what the stand-in reports, so a check can install an app or plug in a device while Home runs; appsFail counts
// down the app-list reads that fail before one succeeds.
function tizenStandIn({ apps, self, system, appsFail }) {
  const later = fn => setTimeout(fn, 0);
  window.__launches = [];
  window.__tvwindow = [];
  window.__tv = { apps, system, appsFail };
  window.tizen = {
    application: {
      getAppsInfo: (ok, fail) => later(() => {
        if (window.__tv.appsFail > 0) { window.__tv.appsFail--; if (fail) fail({ name: 'UnknownError', message: 'The app list is not ready.' }); return; }
        ok(window.__tv.apps.map(app => ({ ...app })));
      }),
      getCurrentApplication: () => ({ appInfo: { id: self } }),
      launch: (id, ok) => { window.__launches.push(id); if (ok) later(ok); }
    },
    systeminfo: {
      getCapability: () => '9.0',
      getPropertyValue: (name, ok, fail) => later(() => {
        if (window.__tv.system[name]) ok(JSON.parse(JSON.stringify(window.__tv.system[name])));
        else if (fail) fail({ name: 'NotSupportedError', message: name + ' is not available' });
      })
    },
    tvinputdevice: { registerKey: () => {} },
    tvwindow: {
      setSource: (source, ok) => { window.__tvwindow.push('setSource ' + source.type + ' ' + source.number); if (ok) later(ok); },
      show: ok => { window.__tvwindow.push('show'); if (ok) later(ok); },
      hide: ok => { window.__tvwindow.push('hide'); if (ok) later(ok); }
    }
  };
}

// Stands in for the TV's own icon files, which only a TV can serve.
const TV_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="250" height="150"><rect width="250" height="150" fill="#1b4fd8"/></svg>';

// The online services and their fixtures. Zippopotam.us knows Costa Mesa (the default ZIP code), says 404 for
// 00000 and answers any other ZIP code with one test place; Open-Meteo reports 18.9 °C, cloudy, at night (66 °F).
// Picsum's list holds three landscape photos and one portrait photo (never picked); bundled photos stand in for
// the online images. A dark photo (1005) is listed only when a check asks for it with `photoIds`.
export const ONLINE = /^https:\/\/(api\.zippopotam\.us|api\.open-meteo\.com|(?:fastly\.)?picsum\.photos)\//;
const ALL_PHOTOS = [
  { id: '1001', author: 'Ada Lens', width: 5000, height: 3333, file: 'forest' },
  { id: '1002', author: 'Ben Frame', width: 4000, height: 2250, file: 'ridge' },
  { id: '1003', author: 'Cy Shutter', width: 6000, height: 4000, file: 'peaks' },
  { id: '1004', author: 'Dee Tall', width: 3000, height: 4500, file: 'misty' },
  { id: '1005', author: 'Eve Night', width: 6000, height: 4000, file: 'summit' }
];
export const PHOTOS = ALL_PHOTOS.filter(photo => photo.id !== '1005');
const CORS = { 'Access-Control-Allow-Origin': '*' };
async function answerOnline(route, listed) {
  const url = route.request().url();
  const json = body => route.fulfill({ headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
  let match;
  if ((match = /api\.zippopotam\.us\/us\/(\d{5})$/.exec(url))) {
    if (match[1] === '00000') return route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: '{}' });
    return json(match[1] === '92626' ? { places: [{ 'place name': 'Costa Mesa', latitude: '33.6801', longitude: '-117.9085' }] }
      : { places: [{ 'place name': 'Testville', latitude: '34.05', longitude: '-118.24' }] });
  }
  if (/api\.open-meteo\.com\/v1\/forecast\?/.test(url)) return json({ current: { temperature_2m: 18.9, weather_code: 3, is_day: 0 } });
  if (/picsum\.photos\/v2\/list\?/.test(url)) return json(listed.map(({ file, ...entry }) => ({ ...entry, url: 'https://unsplash.com/photos/' + entry.id })));
  if ((match = /picsum\.photos\/id\/(\d+)\/\d+\/\d+$/.exec(url))) {
    const photo = ALL_PHOTOS.find(entry => entry.id === match[1]);
    if (photo) return route.fulfill({ headers: CORS, contentType: 'image/jpeg', body: readFileSync(join(repo, 'app/assets/wallpapers', photo.file + '.jpg')) });
  }
  return route.fulfill({ status: 404, headers: CORS, body: '' });
}

export async function startPreview() {
  const args = ['-u', 'scripts/preview.py', '--port', '0'];
  const server = spawn('python3', args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  process.once('exit', () => server.kill()); // Never leave the server behind, even after an unexpected exit.
  let diagnostics = '';
  server.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
  try {
    const base = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(Error('Preview startup timed out')), 10000);
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', code => { clearTimeout(timer); reject(Error('Preview exited: ' + code + ' ' + diagnostics)); });
      server.stdout.on('data', chunk => {
        const match = (output += chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
    });
    return { base, stop: async () => { if (server.exitCode === null) { server.kill(); await once(server, 'exit'); } } };
  } catch (error) {
    server.kill();
    throw error;
  }
}

// Serves a built package (a folder such as dist/home) on loopback, to check what the TV runs.
export async function startStatic(dir) {
  const server = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1', '--directory', dir], { stdio: ['ignore', 'pipe', 'pipe'] });
  process.once('exit', () => server.kill());
  try {
    const base = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(Error('Static server startup timed out')), 10000);
      server.once('exit', code => { clearTimeout(timer); reject(Error('Static server exited: ' + code)); });
      server.stdout.on('data', chunk => {
        const match = (output += chunk).match(/port (\d+)/);
        if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + match[1]); }
      });
    });
    return { base, stop: async () => { if (server.exitCode === null) { server.kill(); await once(server, 'exit'); } } };
  } catch (error) {
    server.kill();
    throw error;
  }
}

export function launchBrowser() {
  return chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
}

// A fresh profile per call. `seed` is written to the launcher's storage once, before the first load only, so a
// reload sees what the launcher itself saved. `clock` installs Playwright's fake clock before navigation.
// `offline` makes every request to the online services fail, as on a TV without internet. `requests` lists the
// online requests the page made, in order. `appsFail` fails the first app-list reads, `photoIds` picks which
// fixture photos Picsum's list offers, and `path` opens another page (a built package's index.html).
export async function openLauncher(browser, base, { seed, clock, offline = false, appsFail = 0, photoIds, path = '/home/', reducedMotion = 'no-preference' } = {}) {
  const listed = photoIds ? ALL_PHOTOS.filter(photo => photoIds.includes(photo.id)) : PHOTOS;
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion });
  const page = await context.newPage();
  const errors = [], failures = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (ONLINE.test(request.url())) requests.push(request.url()); });
  page.on('response', response => {
    if (response.status() >= 400) failures.push(response.status() + ' ' + response.url());
  });
  page.on('requestfailed', request => {
    const reason = request.failure()?.errorText;
    if (!page.__closing && reason !== 'net::ERR_ABORTED' && !(offline && ONLINE.test(request.url()))) failures.push(reason + ' ' + request.url());
  });
  await context.route('**/opt/usr/globalapps/**', route => route.fulfill({ contentType: 'image/svg+xml', body: TV_ICON }));
  await context.route(ONLINE, route => (offline ? route.abort('internetdisconnected') : answerOnline(route, listed)));
  await page.addInitScript(tizenStandIn, { apps: TV_APPS, self: SELF_ID, system: SYSTEM, appsFail });
  if (seed) {
    await page.addInitScript(([key, value]) => {
      if (sessionStorage.getItem('__seeded')) return;
      localStorage.setItem(key, value);
      sessionStorage.setItem('__seeded', '1');
    }, [STORE, JSON.stringify(seed)]);
  }
  if (clock) await page.clock.install({ time: clock });
  await page.goto(base + path);
  await ready(page);
  return { context, page, errors, failures, requests, close: async () => { page.__closing = true; await context.close(); } };
}

// Home is built and the wallpaper (with its glass layers) has been applied.
export async function ready(page) {
  await page.waitForFunction(() => document.querySelector('#favRow .tile') && document.querySelector('#stage .is-focus')
    && document.querySelector('.bg-photo.is-front'), null, { timeout: 15000 });
}

export async function press(page, key, times = 1) {
  for (let n = 0; n < times; n++) await page.keyboard.press(key);
}

// Hold OK past the launcher's 450 ms threshold; a quick press launches instead.
export async function hold(page, ms = 600) {
  await page.keyboard.down('Enter');
  await page.waitForTimeout(ms);
  await page.keyboard.up('Enter');
}

// Settings pages slide for 140 ms; keys pressed meanwhile are queued, so wait for the slide to end.
export async function settled(page) {
  await page.waitForFunction(() => document.getElementById('panelBody').className === 'p-body');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

// Everything the checks read, from the page as a viewer would see it plus the launcher's saved state.
export function snapshot(page) {
  return page.evaluate(store => {
    const $ = selector => document.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
    // A tile shows either a bundled logo (named by its file) or the TV's name for the app.
    const tile = el => {
      const mark = /icons\/([\w-]+)\.svg/.exec(el.querySelector('.mk')?.getAttribute('style') || '');
      return mark ? mark[1] : text(el.querySelector('.t-text'));
    };
    const focus = $$('#stage [data-z].is-focus').map(el => ({
      z: el.getAttribute('data-z'), i: el.getAttribute('data-i') === null ? null : +el.getAttribute('data-i'),
      id: el.closest('[data-id]')?.getAttribute('data-id') || null,
      label: text(el.querySelector('.p-label') || el)
    }));
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(store)); } catch { saved = 'unreadable'; }
    const rows = $$('#panelRows > .p-row').map(row => ({ label: text(row.querySelector('.p-label')), value: text(row.querySelector('.p-value')) }));
    return {
      classes: [...$('#stage').classList],
      focus, f: focus[0] || null,
      fav: $$('#favRow > .tile').map(tile), library: $$('#library .lib-row').map(row => $$('.tile', row).map(tile)),
      resume: $('#resumeSlot .tile') ? tile($('#resumeSlot .tile')) : null,
      focusName: text($('#focusName')),
      panel: { crumb: text($('#panelCrumb')), title: text($('#panelTitle')), rows, focused: rows[+($('#panelRows > .p-row.is-focus')?.getAttribute('data-i') ?? -1)]?.label || null,
        zip: $$('.zip-cell').map(cell => cell.textContent).join(''), status: $('#panelStatus').classList.contains('is-on') ? text($('#panelStatus')) : '' },
      menu: { title: text($('#tilemenuTitle')), rows: $$('#tilemenuRows > .tm-row').map(text) },
      dialog: $$('.d-actions > .d-btn').map(text),
      editor: { carry: $$('.ed-slot.is-carry').map(slot => slot.getAttribute('data-id')), hint: text($('#edHint')),
        hidden: $$('.ed-slot.is-hidden').map(slot => slot.getAttribute('data-id')), apps: $$('.ed-slot').map(slot => slot.getAttribute('data-id')) },
      picker: { focused: +($('#pkGrid > .pk-item.is-focus')?.getAttribute('data-i') ?? -1), applied: +($('#pkGrid > .pk-item.is-applied')?.getAttribute('data-i') ?? -1), title: text($('#pkTitle')),
        credit: text($('#pkCredit')), dailyThumb: $('#pkGrid > .pk-item img')?.getAttribute('src') || '' },
      photo: $('.bg-photo.is-front')?.getAttribute('src') || '',
      // The live glass layers. During a photo cross-fade, frozen copies of the previous glass (.glass-ghost) sit on top
      // and fade out over 900 ms; they are reported separately in `ghosts`.
      glass: [...new Set($$('.glass-layer:not(.glass-ghost) .glass-img').map(img => img.getAttribute('data-material') + ' ' + (img.src.startsWith('blob:') ? 'blob' : img.getAttribute('src'))))].sort(),
      ghosts: $$('.glass-ghost').map(el => ({ opacity: el.style.opacity, transition: el.style.transition })),
      // A live glass image that failed to decode (for example a revoked object URL) would show nothing.
      brokenGlass: $$('.glass-layer:not(.glass-ghost) .glass-img').filter(img => img.getAttribute('src') && img.complete && !img.naturalWidth).map(img => img.getAttribute('data-material')),
      caption: { title: text($('#ambTitle')), credit: text($('#ambCredit')) },
      weather: { on: !$('.weather').classList.contains('is-off'), text: text($('.weather span')), label: $('.weather').getAttribute('aria-label') },
      inputs: $$('#inRow > .tile').map(el => text(el.querySelector('.in-name'))),
      tvwindow: (window.__tvwindow || []).slice(),
      toast: $('#toast').classList.contains('is-on') ? text($('#toast')) : '',
      launches: (window.__launches || []).slice(),
      saved
    };
  }, STORE);
}
