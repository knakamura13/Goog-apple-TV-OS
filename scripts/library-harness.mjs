// Development only. Shared setup for the Library Home prototype checks (scripts/*-library.mjs).
// Serves demo/library/ from the loopback preview, drives Playwright's Chromium and installs a stand-in for the
// TV's public Tizen API before the page loads, so the launcher runs its TV code paths. Never contacts a TV.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
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

// Runs in the page before any launcher script. Callbacks are asynchronous, as they are on the TV.
function tizenStandIn({ apps, self, system }) {
  const later = fn => setTimeout(fn, 0);
  window.__launches = [];
  window.__tvwindow = [];
  window.tizen = {
    application: {
      getAppsInfo: ok => later(() => ok(apps.map(app => ({ ...app })))),
      getCurrentApplication: () => ({ appInfo: { id: self } }),
      launch: (id, ok) => { window.__launches.push(id); if (ok) later(ok); }
    },
    systeminfo: {
      getCapability: () => '9.0',
      getPropertyValue: (name, ok, fail) => later(() => {
        if (system[name]) ok(JSON.parse(JSON.stringify(system[name])));
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
// Samsung's library only exists on the TV, so the preview's request for it is expected to fail.
const TV_ONLY = /\/\$WEBAPIS\/webapis\/webapis\.js$/;

export async function startPreview() {
  const args = ['-u', 'scripts/preview.py', '--port', '0'];
  if (process.env.CLEANFRAME_PUBLIC_FONTS === '1') args.push('--public-fonts');
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

export function launchBrowser() {
  return chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
}

// A fresh profile per call. `seed` is written to the launcher's storage once, before the first load only, so a
// reload sees what the launcher itself saved. `clock` installs Playwright's fake clock before navigation.
export async function openLauncher(browser, base, { seed, clock, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion });
  const page = await context.newPage();
  const errors = [], failures = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && !TV_ONLY.test(response.url())) failures.push(response.status() + ' ' + response.url());
  });
  page.on('requestfailed', request => {
    const reason = request.failure()?.errorText;
    if (!page.__closing && reason !== 'net::ERR_ABORTED' && !TV_ONLY.test(request.url())) failures.push(reason + ' ' + request.url());
  });
  await context.route('**/opt/usr/globalapps/**', route => route.fulfill({ contentType: 'image/svg+xml', body: TV_ICON }));
  await page.addInitScript(tizenStandIn, { apps: TV_APPS, self: SELF_ID, system: SYSTEM });
  if (seed) {
    await page.addInitScript(([key, value]) => {
      if (sessionStorage.getItem('__seeded')) return;
      localStorage.setItem(key, value);
      sessionStorage.setItem('__seeded', '1');
    }, [STORE, JSON.stringify(seed)]);
  }
  if (clock) await page.clock.install({ time: clock });
  await page.goto(base + '/demo/library/');
  await ready(page);
  return { context, page, errors, failures, close: async () => { page.__closing = true; await context.close(); } };
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
      picker: { focused: +($('#pkGrid > .pk-item.is-focus')?.getAttribute('data-i') ?? -1), applied: +($('#pkGrid > .pk-item.is-applied')?.getAttribute('data-i') ?? -1), title: text($('#pkTitle')) },
      photo: $('.bg-photo.is-front')?.getAttribute('src') || '',
      toast: $('#toast').classList.contains('is-on') ? text($('#toast')) : '',
      launches: (window.__launches || []).slice(),
      saved
    };
  }, STORE);
}
