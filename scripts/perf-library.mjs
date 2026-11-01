// Frame-gap regression guard for the Library Home prototype (demo/library/) in Chromium, with the CPU throttled
// 6× through the DevTools protocol. Never contacts a TV.
//
// The TV's GPU is the real target. This measures main-thread work (JavaScript, style, layout) and Chromium's own
// compositing on this machine, not what the TV's GPU pays for full-screen photo layers, glass copies and squircle
// masks, so a pass here says nothing about smoothness on the TV. Use it to catch regressions between commits.
//
// Each interaction is pressed ROUNDS times. For each press, requestAnimationFrame timestamps are recorded from the
// frame before the key until WINDOW_MS after the last key; a gap over 20 ms is a missed frame at 60 Hz.
// Prints PASS / FAIL against the budgets below and exits 1 if any budget is exceeded.
import { cpus } from 'node:os';
import { launchBrowser, openLauncher, press, startPreview } from './library-harness.mjs';

const THROTTLE = 6, ROUNDS = 3, WINDOW_MS = 800, SLOW_MS = 20;

// Baseline, 31 October 2026: Apple M3 Max, Playwright's Chromium headless shell (build 1243), five runs, one of them
// beside two concurrent check-library runs, with a load average of 7–9 from other work. Frames arrive on the 60 Hz
// clock, so gaps come in whole frames: 16.7 ms is on time and 33.4 ms is one missed frame.
//
//   interaction                median  worst  gaps >20 ms per round
//   dock → library               16.7   33.4   4–6   (single missed frames during the 340 ms page scroll)
//   library → dock               16.7   33.4   4–6
//   Right across the dock        16.7   16.8   0     (five presses, 150 ms apart)
//   open Settings                16.7   16.8   0
//   screensaver in (A)           16.7   33.4   0–3
//   screensaver out (any key)    16.7   33.4   0–2
//
// Budgets: median 20 ms (fails once most frames are late); worst gap twice the baseline's worst, placed between
// whole frames (40 ms allows one missed frame, 75 ms allows three in a row; the first TV test's 167–200 ms stall
// fails either); missed frames per round 1.5× the baseline's most, and at least 3 where the baseline has none.
const BUDGETS = {
  'dock → library': { median: 20, worst: 75, slow: 9 },
  'library → dock': { median: 20, worst: 75, slow: 9 },
  'Right across the dock': { median: 20, worst: 40, slow: 3 },
  'open Settings': { median: 20, worst: 40, slow: 3 },
  'screensaver in (A)': { median: 20, worst: 75, slow: 5 },
  'screensaver out (any key)': { median: 20, worst: 75, slow: 3 }
};

const results = {};
let page, failed = 0;

// Records frame timestamps and key times in the page; the recorder adds one requestAnimationFrame per frame.
function record() {
  return page.evaluate(() => {
    const perf = window.__perf || (window.__perf = { on: false });
    if (!perf.listening) {
      document.addEventListener('keydown', () => { if (perf.on) perf.keys.push(performance.now()); }, true);
      new PerformanceObserver(list => { if (perf.on) list.getEntries().forEach(entry => perf.long.push(entry.duration)); }).observe({ type: 'longtask' });
      perf.listening = true;
    }
    Object.assign(perf, { on: true, times: [], keys: [], long: [] });
    const frame = time => { perf.times.push(time); if (perf.on) requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });
}
// Presses the keys (spaced `spacing` ms apart) and returns the frame gaps around them.
async function measure(name, keys, spacing = 0) {
  await record();
  await page.waitForTimeout(100); // A few frames before the key anchor the first gap.
  for (const [n, key] of keys.entries()) {
    if (n) await page.waitForTimeout(spacing);
    await page.keyboard.press(key);
  }
  await page.waitForTimeout(WINDOW_MS);
  const raw = await page.evaluate(() => { const perf = window.__perf; perf.on = false; return { times: perf.times, keys: perf.keys, long: perf.long }; });
  if (!raw.keys.length) throw Error(name + ': the key never reached the page');
  const start = raw.keys[0], end = raw.keys[raw.keys.length - 1] + WINDOW_MS;
  const from = Math.max(0, raw.times.findLastIndex(time => time <= start));
  const frames = raw.times.slice(from).filter(time => time <= end);
  const gaps = frames.slice(1).map((time, n) => time - frames[n]);
  (results[name] ||= []).push({ frames: frames.length, gaps, long: raw.long });
  await page.waitForTimeout(400); // Let the last transition finish before the next interaction.
}
const median = list => { const sorted = [...list].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0; };
const ms = value => value.toFixed(1).padStart(6);

let preview, browser, launcher;
try {
  preview = await startPreview();
  browser = await launchBrowser();
  launcher = await openLauncher(browser, preview.base);
  page = launcher.page;
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

  // First run: focus starts on the first favourite.
  for (let round = 0; round < ROUNDS; round++) {
    await measure('dock → library', ['ArrowDown']);
    await measure('library → dock', ['ArrowUp']);
  }
  for (let round = 0; round < ROUNDS; round++) {
    await measure('Right across the dock', Array(5).fill('ArrowRight'), 150);
    await press(page, 'ArrowLeft', 5);
    await page.waitForTimeout(400);
  }
  await press(page, 'ArrowUp');
  await press(page, 'ArrowRight', 2);
  for (let round = 0; round < ROUNDS; round++) {
    await measure('open Settings', ['Enter']);
    await press(page, 'Escape');
    await page.waitForTimeout(400);
  }
  await press(page, 'ArrowDown');
  for (let round = 0; round < ROUNDS; round++) {
    await measure('screensaver in (A)', ['a']);
    await page.waitForTimeout(1200); // The screensaver keeps fading in after the window.
    await measure('screensaver out (any key)', ['ArrowLeft']);
    await page.waitForTimeout(600);
  }
  if (launcher.errors.length) throw Error('Page errors: ' + launcher.errors.join('; '));
} catch (error) {
  failed++;
  console.log('FAIL Measurement ran to the end — ' + error.message.split('\n')[0]);
} finally {
  if (launcher) await launcher.close();
  if (browser) await browser.close();
  if (preview) await preview.stop();
}

console.log('Library Home frame gaps in Chromium, CPU throttled ' + THROTTLE + '×, ' + ROUNDS + ' rounds of each interaction, ' + WINDOW_MS + ' ms windows.');
console.log('Measured on ' + cpus()[0].model + '. Regression guard only: the TV\'s GPU is the real target, and this does not measure it.\n');
console.log('interaction                  frames  median   worst  >' + SLOW_MS + 'ms  long tasks');
for (const [name, rounds] of Object.entries(results)) {
  const gaps = rounds.flatMap(round => round.gaps), worst = Math.max(...gaps), slow = Math.max(...rounds.map(round => round.gaps.filter(gap => gap > SLOW_MS).length));
  const long = rounds.flatMap(round => round.long);
  const row = { median: median(gaps), worst, slow };
  results[name].summary = row;
  console.log(name.padEnd(28) + String(median(rounds.map(round => round.frames))).padStart(6) + ms(row.median) + '  ' + ms(row.worst) + String(slow).padStart(7)
    + '  ' + (long.length ? long.length + ', max ' + Math.max(...long).toFixed(0) + ' ms' : 'none'));
  // PERF_VERBOSE=1 lists each round's gaps over 20 ms, in order, to see where in the window they fall.
  if (process.env.PERF_VERBOSE) rounds.forEach((round, n) => console.log('    round ' + (n + 1) + ': ' + round.frames + ' frames; slow gaps at '
    + (round.gaps.map((gap, i) => gap > SLOW_MS ? '#' + (i + 1) + ' ' + gap.toFixed(1) : '').filter(Boolean).join(', ') || 'none')));
}
console.log('(frames: median per round; median: over every gap; worst: any round; >' + SLOW_MS + 'ms: most in one round; long tasks: main-thread tasks over 50 ms)\n');
for (const [name, budget] of Object.entries(BUDGETS)) {
  const row = results[name]?.summary;
  if (!row) { failed++; console.log('FAIL ' + name + ': not measured'); continue; }
  const say = { median: value => 'median gap ' + value.toFixed(1) + ' ms', worst: value => 'worst gap ' + value.toFixed(1) + ' ms', slow: value => value + ' gap' + (value === 1 ? '' : 's') + ' over ' + SLOW_MS + ' ms in one round' };
  for (const key of ['median', 'worst', 'slow']) {
    const ok = row[key] <= budget[key];
    if (!ok) failed++;
    console.log((ok ? 'PASS ' : 'FAIL ') + name + ': ' + say[key](row[key]) + ' (budget ' + budget[key] + (key === 'slow' ? ')' : ' ms)'));
  }
}
console.log('\n' + (failed ? failed + ' budget(s) exceeded.' : 'All frame budgets met.') + ' This guards against regressions in the browser; check smoothness on the TV itself.');
if (failed) process.exitCode = 1;
