# Validation

## Offline checks

```sh
npm ci
npm run check
npm run check:tools
npm run check:public
```

`check` runs ES5 lint over `app/`, validates Home's manifest identity (`Zm209bQNEk.Home`), that its version matches `package.json`, and that every file `index.html`, the CSS, the wallpaper catalogue and the brand marks need is present; then it tests the device adapter (`device.js`) with a synthetic API and clock, and runs the logic unit tests. It does not contact a TV.

`check:tools` uses synthetic credentials and a fake SDB in isolated temporary folders. It checks the local signing configuration, private-file and credential detection, signed-widget identity checks, that the installer rejects a bad package before any SDB call, and `check:public` against real Git index/history blobs. Temporary fixtures are retained for inspection instead of permanently deleted.

`check:public` checks working files, index blobs and all reachable Git refs for the shared private-file policy and recognisable credential patterns. A working-file edit cannot hide a staged credential. These checks are bounded and do not detect every possible secret. The generated-path policy rejects any `bin` or `obj` directory in source, plus widget/DLL/debug-symbol/executable files.

Optional local commit/push guards are in `.githooks/`; they run `check:public`. To enable them for this clone, run `git config --local core.hooksPath .githooks` after checking that this will not replace an existing hooks setup, and run `npm run check:public` first: the all-ref audit must pass or every commit/push is blocked. The hooks are not enabled automatically and can be bypassed. A later fix commit does not remove sensitive data from earlier commits.

## Browser checks

```sh
npx playwright install chromium-headless-shell
npm run check:all
```

`check:all` runs Home's checks in Playwright Chromium (set `CHROMIUM_PATH` to use another browser). None of them contacts a TV or the internet: a stand-in for the Tizen API reports the apps and one HDMI port, and fixtures answer the weather and photo services (or fail, for the offline checks).

- `test:unit`: unit tests for the pure logic in `app/logic.js` (`scripts/test-logic.mjs`).
- `check:mutation`: changes `logic.js` one operator at a time; the unit tests must catch at least 90% of the changes (`scripts/mutate-logic.mjs`).
- `check:e2e`: every screen driven with remote keys, including hold-OK editing, inputs, weather, the random photo, the screensaver slideshow, offline behaviour, saves from earlier builds and a run from the built files (`scripts/check-e2e.mjs`; `E2E_SECTION=<text>` runs matching sections only).
- `check:a11y`: visible focus and WCAG AA text contrast on every screen; contrast that depends on the photo is a warning (`scripts/check-a11y.mjs`; `A11Y_SCREEN=<text>`, `A11Y_VERBOSE=1`).
- `check:perf`: frame gaps for the main moves with the CPU throttled 6×, a regression guard rather than a TV benchmark (`scripts/check-perf.mjs`). Its budgets are sensitive to load on this machine: on 1 November 2026 three idle runs met every budget on both main and this layout, while runs beside other browser work exceeded 3–9 budgets on either. It is therefore not part of CI.

The shared setup is `scripts/harness.mjs`. The GitHub workflow runs `check`, `check:tools`, `check:public`, `check:e2e` and `check:a11y`.

If the default browser cache location is unavailable, set `PLAYWRIGHT_BROWSERS_PATH="$PWD/.local/playwright"` for both the install and the checks.

For manual review, use `npm run dev` and open `/home/`.

## Physical TV checks

Run these only under a task that includes TV testing. Announce any installation or launch first, then follow `development.md`. SDK success alone is not a visible result. Ask the owner to confirm the normal remote behaviour and record the version, firmware, result and any open checks; Home's open TV checks are listed in `home-redesign.md`.

1. Move in both directions through Home, the library, Settings and the menus; check focus, response and readable labels from the sofa.
2. Launch apps from Favorites and the library, press Home to return, and check the selected app. Treat streaming apps' own Back handling separately.
3. Check Samsung Home, Picture and sound, the Source list and an HDMI input; verify the actual visible destinations.
4. Check saved Favorites, Hidden apps, ZIP code and photo choice after relaunch.
5. Test normal power-on and native Home assignment only when that work is included. Preserve the native Home recovery baseline and restore it before any uninstall/identity change.

Browser CPU throttling is a development comparison, not a TV performance measurement.
