// Accessibility checks for Home (demo/library/), screen by screen, in Chromium at 1920×1080
// with reduced motion and transitions off, so every state is read at rest. A stand-in for the TV's Tizen API
// supplies the apps. Never contacts a TV. A11Y_SCREEN=<text> checks only matching screens; A11Y_VERBOSE=1 lists
// every label instead of the worst of each kind.
//
// (a) Focus is visible. Compared with the same element unfocused, the focused element (or something inside it, or a
//     ::before/::after) changes scale, background, outline, box-shadow, opacity or colour, or a focus indicator
//     (the sliding pill behind the nav, Settings rows and dialog buttons) covers it; and the pixels on screen really
//     change. A change that turns fewer pixels by 3:1 than a 2 px outline would is a warning (WCAG 2.4.13, AAA),
//     because the TV is watched from about 3 m.
// (b) Text contrast meets WCAG AA (1.4.3): 4.5:1, or 3:1 for text at least 24 px bold (700+) or 32 px.
//     Backgrounds are read from the rendered page with all text made transparent, three times: as shown, with every
//     photo turned white and with every photo turned black. Where white and black give the same pixels, the
//     background is solid or semi-opaque colour and the ratio is exact. Where they differ, it depends on the photo:
//     the label passes if it passes over both, fails if it fails over both, and is otherwise reported as a warning
//     with its range and its ratio over the current photo. Text shadows are ignored, as in WCAG's ratio.
//     The white and black bounds use the current wallpaper's capsule tints; lighter wallpapers lighten some tints.
//
// Prints PASS / WARN / FAIL lines and exits 1 on a clear failure: a focused element with no visible focus state, a
// contrast failure whatever the photo, or a page error. Unmeasurable labels and photo-dependent contrast are
// warnings, listed again at the end.
import { inflateSync } from 'node:zlib';
import { hold, launchBrowser, openLauncher, press, settled, startPreview } from './library-harness.mjs';

const NORMAL = 4.5, LARGE = 3;
const isLarge = (size, weight) => size >= 32 || (size >= 24 && weight >= 700);

async function gotoRow(page, label) {
  const rows = await page.$$eval('#panelRows > .p-row', list => list.map(row => [row.querySelector('.p-label').textContent, row.classList.contains('is-focus')]));
  const target = rows.findIndex(([text]) => text === label), at = rows.findIndex(([, focused]) => focused);
  if (target < 0) throw Error('No "' + label + '" row');
  await press(page, target > at ? 'ArrowDown' : 'ArrowUp', Math.abs(target - at));
}
async function openSettings(page) { await press(page, 'ArrowUp'); await press(page, 'ArrowRight', 2); await press(page, 'Enter'); await settled(page); }
async function openRow(page, label) { await gotoRow(page, label); await press(page, 'Enter'); await settled(page); }

// Each screen starts from a fresh first run. `target` is the element whose focus state is checked; `away` and
// `back` move focus off it and back. Labels are [name, selector, options]: `own` measures only the element's own
// text (not its children's).
const SCREENS = [
  { name: 'Home dock', setup: async page => { await press(page, 'ArrowRight', 2); await press(page, 'Enter'); },
    target: '#favRow > .tile.is-focus', away: 'ArrowRight', back: 'ArrowLeft',
    labels: [['Time', '#time', { own: true }], ['Time AM/PM', '#time .mer'], ['Nav pills', '#pills > .pill'], ['Resume card heading', '.re-kicker']] },
  { name: 'Library', setup: page => press(page, 'ArrowDown'),
    target: '#library .tile.is-focus', away: 'ArrowRight', back: 'ArrowLeft',
    // A TV-icon tile shows its name only when the icon fails to load.
    labels: [['Focused app name', '#focusName'], ['App name on a TV-icon tile', '#library .t-text', { optional: true }]] },
  { name: 'Nav pills', setup: page => press(page, 'ArrowUp'),
    target: '#pills > .pill.is-focus', away: 'ArrowRight', back: 'ArrowLeft',
    labels: [['Focused pill', '#navInk > .pill'], ['Other pills', '#pills > .pill']] },
  { name: 'Settings gear', setup: async page => { await press(page, 'ArrowUp'); await press(page, 'ArrowRight', 2); },
    target: '#gear', away: 'ArrowLeft', back: 'ArrowRight', labels: [] },
  { name: 'Settings rows', setup: async page => { await openSettings(page); await gotoRow(page, 'Wallpaper'); },
    target: '#panelRows > .p-row.is-focus', away: 'ArrowDown', back: 'ArrowUp',
    labels: [['Title', '#panelTitle'], ['Row labels', '#panelRows .p-label'], ['Row values', '#panelRows .p-value'],
      ['Focused row label', '#panelInk .p-label'], ['Focused row value', '#panelInk .p-value']] },
  { name: 'Wallpaper picker', setup: async page => { await openSettings(page); await openRow(page, 'Wallpaper'); },
    target: '#pkGrid > .pk-item.is-focus', away: 'ArrowRight', back: 'ArrowLeft', // Opens on Daily photo, in the left column.
    labels: [['Breadcrumb', '#picker .p-crumb'], ['Title', '#picker .p-title'], ['Photo names', '#pkGrid .pk-name > span'],
      ['Preview title', '#pkTitle'], ['Preview credit', '#pkCredit']] },
  { name: 'Apps editor', setup: async page => { await openSettings(page); await openRow(page, 'Apps'); },
    target: '.ed-slot.is-focus', away: 'ArrowRight', back: 'ArrowLeft',
    labels: [['Breadcrumb', '.ed-crumb'], ['Title', '.ed-title'], ['Hint', '#edHint'], ['Tile style button', '#edStyle'],
      ['Section labels', '#edFavLabel, #edLibLabel, #edHidLabel', { own: true }], ['Section counts', '.ed-label > span'],
      ['App names', '.ed-name > span'], ['Empty Hidden note', '#edEmpty', { optional: true }]] }, // Shown only when nothing is hidden.
  { name: 'Samsung Home dialog', setup: page => press(page, 'Escape'),
    target: '.d-actions > .d-btn.is-focus', away: 'ArrowRight', back: 'ArrowLeft',
    labels: [['Title', '.d-title'], ['Text', '.d-text'], ['Buttons', '.d-actions > .d-btn'], ['Focused button', '#dialogInk .d-btn']] },
  { name: 'Hold-OK menu', setup: page => hold(page),
    target: '#tilemenuRows > .tm-row.is-focus', away: 'ArrowDown', back: 'ArrowUp',
    labels: [['Title', '#tilemenuTitle'], ['Rows', '#tilemenuRows > .tm-row']] },
  { name: 'About', setup: async page => { await openSettings(page); await openRow(page, 'About'); },
    target: '#panelRows > .p-row.is-focus', away: 'ArrowDown', back: 'ArrowUp',
    labels: [['Breadcrumb', '#panelCrumb'], ['Title', '#panelTitle'], ['Row labels', '#panelRows .p-label'], ['Row values', '#panelRows .p-value'],
      ['Focused row label', '#panelInk .p-label'], ['Focused row value', '#panelInk .p-value']] }
];

// ---------- In the page ----------

// Installed once per page. Hit tests follow what the eye sees: anything visible can be hit and nothing invisible
// can, whatever pointer-events says, so text under a solid focus pill or clipped by a scroller counts as hidden.
function pageHelpers() {
  const opacityOf = el => { let o = 1; for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; };
  function asSeen(fn) {
    const all = [...document.querySelectorAll('#stage, #stage *')];
    const saved = all.map(el => [el, el.style.getPropertyValue('pointer-events'), el.style.getPropertyPriority('pointer-events')]);
    all.forEach(el => el.style.setProperty('pointer-events', opacityOf(el) < 0.05 ? 'none' : 'auto', 'important'));
    try { return fn(); } finally {
      saved.forEach(([el, value, priority]) => { if (value) el.style.setProperty('pointer-events', value, priority); else el.style.removeProperty('pointer-events'); });
    }
  }
  function texts(el, own) {
    if (own) return [...el.childNodes].filter(node => node.nodeType === 3 && node.textContent.trim());
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), out = [];
    while (walker.nextNode()) if (walker.currentNode.textContent.trim()) out.push(walker.currentNode);
    return out;
  }
  function labels(specs) {
    return asSeen(() => specs.map(([name, selector, options = {}]) => {
      const found = [];
      for (const el of document.querySelectorAll(selector)) {
        const style = getComputedStyle(el), nodes = texts(el, options.own), rects = [];
        if (style.visibility !== 'visible' || !nodes.length) continue;
        for (const node of nodes) {
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) {
            const box = [Math.max(0, r.left), Math.max(0, r.top), Math.min(innerWidth, r.right), Math.min(innerHeight, r.bottom)];
            if (box[2] - box[0] < 3 || box[3] - box[1] < 3) continue;
            const hit = document.elementFromPoint((box[0] + box[2]) / 2, (box[1] + box[3]) / 2);
            if (hit && el.contains(hit)) rects.push(box);
          }
        }
        if (rects.length) {
          found.push({ text: nodes.map(node => node.textContent).join('').replace(/\s+/g, ' ').trim(), rects, color: style.color,
            opacity: opacityOf(el), size: parseFloat(style.fontSize), weight: parseInt(style.fontWeight, 10) });
        }
      }
      return { name, selector, optional: !!options.optional, found };
    }));
  }
  const PROPS = ['transform', 'opacity', 'background-color', 'background-image', 'outline-style', 'outline-width', 'outline-color', 'box-shadow', 'color',
    'border-top-style', 'border-top-color', 'visibility'];
  // The styles that can show focus, on the element, everything inside it and their ::before/::after.
  function signature(root) {
    const out = {};
    [root, ...root.querySelectorAll('*')].forEach((el, n) => {
      const name = n ? (el.classList[0] || el.tagName.toLowerCase()) + '#' + n : 'element';
      for (const pseudo of ['', '::before', '::after']) {
        const style = getComputedStyle(el, pseudo || null);
        if (style.display === 'none' || (pseudo && (style.content === 'none' || style.content === 'normal'))) continue;
        for (const prop of PROPS) out[name + pseudo + ' ' + prop] = style.getPropertyValue(prop);
      }
    });
    return out;
  }
  // Sliding focus pills (.ind) that cover most of the element. The nav's active-tab marker is not a focus indicator.
  function indicators(el) {
    const r = el.getBoundingClientRect();
    return [...document.querySelectorAll('#stage .ind:not(.nav-active)')].filter(ind => {
      const q = ind.getBoundingClientRect(), w = Math.min(r.right, q.right) - Math.max(r.left, q.left), h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
      return w > 0 && h > 0 && w * h >= 0.6 * r.width * r.height && opacityOf(ind) > 0.5 && getComputedStyle(ind).visibility === 'visible';
    }).map(ind => '#' + ind.id);
  }
  function target() {
    const el = document.querySelector('[data-a11y-target]'), r = el.getBoundingClientRect();
    // A logo tile has no text; name it by its logo file instead. The gear is named by its aria-label.
    const mark = /icons\/([\w-]+)\.svg/.exec(el.querySelector('.mk')?.getAttribute('style') || '');
    return { rect: [r.left, r.top, r.right, r.bottom], signature: signature(el), indicators: indicators(el),
      focused: el.classList.contains('is-focus') || !!el.querySelector('.is-focus'),
      label: (el.querySelector('.p-label') || el).textContent.replace(/\s+/g, ' ').trim().slice(0, 40) || (mark ? mark[1] + ' tile' : el.getAttribute('aria-label') || '') };
  }
  window.__a11y = { labels, target };
}

// ---------- Pixels ----------

// Playwright's screenshots are 8-bit RGB(A) PNGs without interlacing; this is all the decoding they need.
function decodePng(png) {
  let at = 8, width = 0, height = 0, channels = 0;
  const data = [];
  while (at < png.length) {
    const length = png.readUInt32BE(at), type = png.toString('latin1', at + 4, at + 8), body = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4); channels = { 2: 3, 6: 4 }[body[9]];
      if (body[8] !== 8 || body[12] !== 0 || !channels) throw Error('Unsupported screenshot PNG format');
    } else if (type === 'IDAT') data.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data)), stride = width * channels, rgb = Buffer.alloc(width * height * 3);
  let previous = Buffer.alloc(stride), line = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], source = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0, b = previous[x];
      let value = source[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const c = x >= channels ? previous[x - channels] : 0, p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = value; // Byte storage wraps modulo 256, as PNG filters expect.
    }
    for (let x = 0, out = y * width * 3; x < width; x++, out += 3) {
      const at = x * channels;
      rgb[out] = line[at]; rgb[out + 1] = line[at + 1]; rgb[out + 2] = line[at + 2];
    }
    [previous, line] = [line, previous];
  }
  return { width, height, rgb };
}
const linear = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (r, g, b) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const low = list => [...list].sort((a, b) => a - b)[Math.floor(list.length * 0.1)]; // 10th percentile: ignores stray rim pixels.
const parseColor = css => { const [r, g, b, a = 1] = css.match(/[\d.]+/g).map(Number); return [r, g, b, a]; };

// Contrast of one label over each background, pixel by pixel across its text boxes. Like the ratios, "depends on
// the photo" ignores the least favourable 10% of pixels, such as the rounded corners of a pill behind the text.
function measure(label, shots) {
  const [r, g, b, a] = parseColor(label.color), alpha = a * label.opacity;
  const runs = { actual: [], white: [], black: [] }, worst = [], best = [];
  let dependent = 0;
  for (const [x0, y0, x1, y1] of label.rects) {
    for (let y = Math.ceil(y0) + 1; y < Math.floor(y1) - 1; y++) for (let x = Math.ceil(x0) + 1; x < Math.floor(x1) - 1; x++) {
      const i = (y * shots.actual.width + x) * 3, sign = {}, value = {};
      for (const run of Object.keys(runs)) {
        const { rgb } = shots[run];
        const back = luminance(rgb[i], rgb[i + 1], rgb[i + 2]);
        const text = luminance(alpha * r + (1 - alpha) * rgb[i], alpha * g + (1 - alpha) * rgb[i + 1], alpha * b + (1 - alpha) * rgb[i + 2]);
        runs[run].push(value[run] = ratio(text, back));
        sign[run] = Math.sign(text - back);
      }
      if (Math.max(...[0, 1, 2].map(k => Math.abs(shots.white.rgb[i + k] - shots.black.rgb[i + k]))) > 3) dependent++;
      // If the text is lighter than the white-photo background and darker than the black-photo one (or the reverse),
      // some photo in between would match it.
      worst.push(sign.white !== sign.black ? 1 : Math.min(value.white, value.black));
      best.push(Math.max(value.white, value.black));
    }
  }
  if (!runs.actual.length) return null;
  return { actual: low(runs.actual), white: low(runs.white), black: low(runs.black), worst: low(worst), best: low(best), dependent: dependent > runs.actual.length * 0.1 };
}

// ---------- Report ----------

const failures = [], warnings = [];
function report(status, line) {
  console.log(status.padEnd(5) + line);
  if (status === 'FAIL') failures.push(line);
  if (status === 'WARN') warnings.push(line);
}
const r1 = value => value.toFixed(1) + ':1';
const quote = text => '"' + (text.length > 28 ? text.slice(0, 27) + '…' : text) + '"';
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function rest(page) { await page.waitForTimeout(150); await frames(page); }

const HIDE_TEXT = '#stage,#stage *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}#stage svg text{fill:transparent!important}';
const PHOTOS = { white: '#stage img{filter:brightness(0) invert(1)!important}', black: '#stage img{filter:brightness(0)!important}' };
async function backgrounds(page) {
  const shots = {}, hide = await page.addStyleTag({ content: HIDE_TEXT });
  for (const run of ['actual', 'white', 'black']) {
    const photos = PHOTOS[run] && await page.addStyleTag({ content: PHOTOS[run] });
    await frames(page);
    shots[run] = decodePng(await page.screenshot());
    if (photos) await photos.evaluate(el => el.remove());
  }
  await hide.evaluate(el => el.remove());
  await frames(page);
  return shots;
}

// One line per label kind: the worst of its visible instances, with how many there are.
function contrast(screen, spec, shots, wallpaper) {
  const results = spec.found.map(label => ({ label, m: measure(label, shots) })).filter(result => result.m);
  if (!results.length) {
    if (!spec.optional) report('WARN', screen + ' › ' + spec.name + ': not measured, no visible text matched ' + spec.selector);
    return;
  }
  const graded = results.map(({ label, m }) => {
    const need = isLarge(label.size, label.weight) ? LARGE : NORMAL, font = label.size + 'px/' + label.weight + ' ' + quote(label.text);
    if (!m.dependent) return { status: m.actual >= need ? 'PASS' : 'FAIL', key: m.actual / need, line: r1(m.actual) + ' on a solid background (needs ' + need + ':1; ' + font + ')' };
    if (m.worst >= need) return { status: 'PASS', key: m.worst / need, line: 'at least ' + r1(m.worst) + ' whatever the photo (white ' + r1(m.white) + ', black ' + r1(m.black) + '; needs ' + need + ':1; ' + font + ')' };
    if (m.best < need) return { status: 'FAIL', key: m.best / need, line: 'below ' + need + ':1 whatever the photo (at best ' + r1(m.best) + '; ' + font + ')' };
    return { status: 'WARN', key: m.actual / need, line: 'depends on the photo: ' + r1(m.worst) + ' to ' + r1(m.best) + ', and ' + r1(m.actual) + ' over ' + wallpaper
      + (m.actual < need ? ', below AA there' : '') + ' (needs ' + need + ':1; ' + font + ')' };
  });
  const order = { FAIL: 0, WARN: 1, PASS: 2 };
  graded.sort((x, y) => order[x.status] - order[y.status] || x.key - y.key);
  const worst = graded[0], alike = graded.filter(g => g.status === worst.status).length;
  const count = graded.length > 1 ? ' [' + graded.length + (alike < graded.length ? ', ' + alike + ' ' + worst.status : '') + ', worst shown]' : '';
  report(worst.status, screen + ' › ' + spec.name + count + ': ' + worst.line);
  // A11Y_VERBOSE=1 lists every instance, not just the worst.
  if (process.env.A11Y_VERBOSE && graded.length > 1) for (const g of graded) console.log('        ' + g.status + ' ' + g.line);
}

async function focus(page, screen) {
  const marked = await page.evaluate(selector => { const el = document.querySelector(selector); if (el) el.setAttribute('data-a11y-target', ''); return !!el; }, screen.target);
  if (!marked) { report('FAIL', screen.name + ' › focus: nothing focused matches ' + screen.target); return; }
  const on = await page.evaluate(() => window.__a11y.target()), shotOn = decodePng(await page.screenshot());
  await press(page, screen.away);
  await rest(page);
  const off = await page.evaluate(() => window.__a11y.target()), shotOff = decodePng(await page.screenshot());
  await press(page, screen.back);
  await rest(page);
  const restored = await page.evaluate(() => window.__a11y.target());
  if (!on.focused || off.focused || !restored.focused) { report('FAIL', screen.name + ' › focus: could not move focus off ' + quote(on.label) + ' and back'); return; }

  const scale = transform => { const m = /matrix\(([^)]+)\)/.exec(transform); if (!m) return 1; const [a, b] = m[1].split(',').map(Number); return Math.hypot(a, b); };
  const changes = [], drawn = (state, where, line) => state.signature[where + ' ' + line + '-style'] !== 'none';
  for (const key of new Set([...Object.keys(on.signature), ...Object.keys(off.signature)])) {
    const [where, prop] = key.split(' '), a = on.signature[key], b = off.signature[key];
    if (a === b) continue;
    if (a === undefined) continue; // Shown only when unfocused: not a focus state.
    if (b === undefined) { if (prop === 'visibility') changes.push(where + ' appears'); continue; }
    // An outline or border colour that changes while none is drawn (they follow the text colour) shows nothing.
    const line = /^(outline|border-top)-(color|width)$/.exec(prop);
    if (line && !drawn(on, where, line[1]) && !drawn(off, where, line[1])) continue;
    if (prop === 'transform') { if (Math.abs(scale(a) - scale(b)) >= 0.02) changes.push(where + ' scale ' + scale(b).toFixed(2) + ' → ' + scale(a).toFixed(2)); }
    else changes.push(where + ' ' + prop + (process.env.A11Y_VERBOSE ? ' ' + b + ' → ' + a : ''));
  }
  const indicator = on.indicators.filter(id => !off.indicators.includes(id));
  // Pixels that change between the two states, inside both boxes and a small margin.
  const box = [Math.min(on.rect[0], off.rect[0]) - 4, Math.min(on.rect[1], off.rect[1]) - 4, Math.max(on.rect[2], off.rect[2]) + 4, Math.max(on.rect[3], off.rect[3]) + 4].map(Math.round);
  let visible = 0, strong = 0, total = 0;
  for (let y = Math.max(0, box[1]); y < Math.min(shotOn.height, box[3]); y++) for (let x = Math.max(0, box[0]); x < Math.min(shotOn.width, box[2]); x++) {
    const i = (y * shotOn.width + x) * 3;
    const change = ratio(luminance(shotOn.rgb[i], shotOn.rgb[i + 1], shotOn.rgb[i + 2]), luminance(shotOff.rgb[i], shotOff.rgb[i + 1], shotOff.rgb[i + 2]));
    total++;
    if (change >= 1.1) visible++;
    if (change >= 3) strong++;
  }
  const w = off.rect[2] - off.rect[0], h = off.rect[3] - off.rect[1], outline = Math.round(4 * (w + h)); // A 2 px perimeter.
  const how = (indicator.length ? 'focus pill ' + indicator.join(', ') + (changes.length ? '; ' : '') : '') + changes.slice(0, 3).join(', ') + (changes.length > 3 ? ', …' : '');
  const name = screen.name + ' › focus on ' + quote(on.label || screen.target);
  if (!changes.length && !indicator.length) report('FAIL', name + ': no visible focus state (no scale, background, outline, shadow, opacity or colour change, no indicator)');
  else if (visible < Math.max(50, total * 0.01)) report('FAIL', name + ': styles change (' + how + ') but almost no pixels do (' + visible + ' of ' + total + ')');
  else if (strong < outline) report('WARN', name + ': visible but weak; ' + how + '; only ' + strong + ' px change by 3:1 or more, a 2 px outline would be ' + outline + ' px (WCAG 2.4.13, AAA)');
  else report('PASS', name + ': ' + how + '; ' + strong + ' px change by 3:1 or more (2 px outline: ' + outline + ')');
}

let preview, browser;
try {
  preview = await startPreview();
  browser = await launchBrowser();
  for (const screen of SCREENS) {
    if (process.env.A11Y_SCREEN && !screen.name.toLowerCase().includes(process.env.A11Y_SCREEN.toLowerCase())) continue;
    console.log('\n## ' + screen.name);
    const launcher = await openLauncher(browser, preview.base, { reducedMotion: 'reduce' });
    const { page } = launcher;
    try {
      // The preview's key hints sit outside the TV stage. Reduced motion still runs 1 ms transitions on every
      // property, so they are switched off to read each state exactly.
      await page.addStyleTag({ content: '#hints{display:none!important}#stage *,#stage *::before,#stage *::after{transition:none!important;animation:none!important}' });
      await page.evaluate(pageHelpers);
      await screen.setup(page);
      await page.waitForFunction(() => document.getElementById('panelBody').className === 'p-body');
      await rest(page);
      const wallpaper = await page.evaluate(() => document.querySelector('.bg-photo.is-front').getAttribute('src').replace(/^.*\/|\.jpg$/g, ''));
      const specs = await page.evaluate(specs => window.__a11y.labels(specs), screen.labels);
      if (specs.length) {
        const shots = await backgrounds(page);
        for (const spec of specs) contrast(screen.name, spec, shots, 'the "' + wallpaper + '" photo');
      } else console.log('      ' + screen.name + ': an icon only, no text to measure');
      await focus(page, screen);
    } catch (error) {
      report('FAIL', screen.name + ': could not be checked — ' + error.message.split('\n')[0]);
    } finally {
      if (launcher.errors.length) report('FAIL', screen.name + ': page errors — ' + launcher.errors.join('; '));
      await launcher.close();
    }
  }
} catch (error) {
  report('FAIL', 'Checks ran to the end — ' + error.message.split('\n')[0]);
} finally {
  if (browser) await browser.close();
  if (preview) await preview.stop();
}

console.log('\nWarnings (' + warnings.length + '):');
for (const line of warnings) console.log('  ' + line);
console.log('Failures (' + failures.length + '):');
for (const line of failures) console.log('  ' + line);
if (failures.length) process.exitCode = 1;
