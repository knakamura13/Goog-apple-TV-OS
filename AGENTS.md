# Home

`app/` is the launcher: `index.html`, `app.css`, `app.js` (the interface), `logic.js` (pure logic shared with the unit tests), `config.xml`, the shared `device.js` adapter and `assets/`. Read `docs/home-redesign.md` (the spec and owner decisions) and `docs/development.md` before app changes.

Use simple HTML, CSS and ES5-compatible JavaScript in `app/`; Node tooling can use modern JavaScript. Code between `/* preview */ … /* /preview */` or `<!-- preview --> … <!-- /preview -->` markers serves only the browser preview and is stripped by `scripts/build.py`. Preserve remote focus/navigation, the saved-state format and pre-rendered rendering. Read `docs/assets.md` before changing images, glass or icon sizing; keep live blur and pixel analysis off the TV animation path.

Run `npm run check` for app changes and `npm run check:tools` for signing, install or validation-tool changes. For interaction or visual changes, also run `npm run check:all`. Run `npm run check:public` before publishing anything. Retain third-party notices.

Browser/repository tasks do not authorise device access. Read `docs/tv-status.md` and `docs/compatibility.md` before compatibility claims and `docs/agent-tv-setup-guide.md` before a new TV setup. An explicit device task is required even for queries that stage a helper. Announce any installation, app launch or restart; confirm visible results with the owner. Treat native Home/startup writes as a separate task with explicit authority and an exact-value recovery baseline (`docs/native-home-s90d.md`, `scripts/native-home/README.md`).

Preserve the stable application identity `Zm209bQNEk.Home`, its author certificate and any native Home assignment. The install/launch tools use the identity selected in ignored `.local/signing.json` (see `signing.example.json`), falling back to `app/config.xml`. Keep the identity guard in `scripts/check.py` intact. The TV tools and native helper retain reference-machine assumptions; they are not an unattended installer.

Keep signing keys, passwords, device identifiers, addresses, SDKs, recovery values and generated packages in ignored `.local/` or `dist/`. Preserve shared or uncommitted work. Never reset, force-push or rewrite history without explicit authority.
