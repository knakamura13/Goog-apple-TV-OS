# Development

## Browser preview

Start with Node.js 22.13+ (22 LTS), or 24+, and Python 3.10+, then `npm ci`. These are the supported development baselines; lower versions have not been checked. The browser checks need Playwright's Chromium: `npx playwright install chromium-headless-shell` (Linux hosts may also need `--with-deps`).

`npm run dev` starts http://localhost:4795/home/, bound to this computer only. `/home/` serves `app/` directly, so `/home/assets/` is `app/assets/`. Arrows, Enter and Escape mirror the remote; the preview's extra keys and sample data are listed in [the Home spec](home-redesign.md#build-preview-and-tests). `/build/` serves `scripts/materials/`, the blank page the asset generators render in.

## Runtime map and compatibility

- `app/index.html` loads the fonts, `app.css`, the icon metrics and wallpaper catalogue, `device.js`, `logic.js` and `app.js`.
- `app.js` owns the screens, focus, saved state, weather, photos and the screensaver. `logic.js` holds the pure logic (`window.HomeLogic`) that the unit and mutation tests load on their own. `device.js` (`window.FrameDevice`, from CleanFrame) owns installed-app discovery, launching and the other Tizen calls; keep device details in that adapter.
- Saved state is one JSON record in localStorage under `home.v1`, with a `version` field. Builds up to V1 saved under `library-prototype.v1`; on load, if `home.v1` is absent and the old key exists, Home copies the save to `home.v1` and then removes the old key (`HomeLogic.moveSave`), so the owners keep their Favorites, Hidden apps, ZIP code and photo choice. Change the key again only together with such a move.
- The logical stage is 1920 × 1080. `build-info.js`, written by the build, sets `window.HomeBuild` (commit, build time, size) for Settings › About; the preview has none.

The manifest's `required_version="6.5"` is a package declaration, not proof of broad Tizen 6.5 support. `npm run lint` uses ESLint's ES5 grammar for all JavaScript in `app/` and checks undefined names, unused code and dynamic evaluation. It does not check DOM/CSS or TV API availability; verify new APIs on the TV before relying on them. `scripts/check.py` rejects `inset` and flex `gap` declarations; use explicit edges and child margins. See [ESLint's language options](https://eslint.org/docs/latest/use/configure/language-options).

Keep material rendering in the development tools. See [asset generation](assets.md) and [testing](testing.md).

## Build and sign

`npm run build` writes `dist/home/`: `index.html`, `app.css`, `app.js` and `logic.js` with the preview blocks stripped and `/home/` paths made relative, plus `config.xml`, `icon.png`, `device.js`, `build-info.js`, `THIRD_PARTY_NOTICES.md` and only the assets Home uses (fonts, the brand marks named in `app.js`, every catalogue photo with its thumbnail and three glass fields). It refuses to replace a folder that is not a previous build. `--out <folder>` builds elsewhere.

The build is unsigned. Sign a copy of it with the official SDK and your existing certificate profile, writing the package to its own timestamped folder:

```sh
copy="$(mktemp -d)/home" && cp -R dist/home "$copy"
.local/tizen-sdk/tools/ide/bin/tizen package -t wgt -s <profile> -o "dist/signed-home-$(date +%Y%m%d-%H%M%S)" -- "$copy"
```

The SDK names the package after `<name>` in `config.xml`, so each run writes `dist/signed-home-<time>/Home.wgt` (V1 was `dist/signed-home-20261031-213802/Home.wgt`). `npm run tv:install` installs the newest of those by folder name, or the package given with `-- --widget <path>`, and prints which one. Check the SDK's exit status before installing; `tv:install` does not establish that the package is the latest source build. The initial custom XML-signature implementation was rejected by the reference TV; use the official SDK packager. See [Samsung's CLI configuration and packaging documentation](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/command-line-interface.html).

## Local TV tools

This Mac's setup lives under ignored `.local/`:

- `tizen-sdk/`: official Tizen SDK command-line tools, embedded Java and SDB.
- `certificates/`: Samsung-issued author/distributor certificates and their CA certificates.
- `signing.json` (optional): selects the SDK path, certificate profile and app identity; copy `signing.example.json`.
- `device.json`: TV host address.

`scripts/local_config.py` reads `.local/signing.json`. An existing config must select `profile`; both identity fields must be set together. Paths may be absolute or relative to the repo, and `~` is supported. Without a config, the defaults are `.local/tizen-sdk` and the identity in `app/config.xml`. The install and launch tools use the selected identity, and the installer refuses a signed widget whose manifest identity differs or that contains private files (`scripts/private_files.py`).

## Another checkout or Mac

Install the official [Samsung TV SDK](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html) and select its path in `.local/signing.json`. To keep installing in place over the existing app, securely transfer its author certificate and password. Keep those credentials local.

For new certificates, use Samsung's [certificate setup](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html). The distributor certificate must include the target TV's DUID.

Create `.local/device.json` with:

```json
{"host": "YOUR_TV_IP_ADDRESS"}
```

For developer access, connect the TV and Mac to the same network, enable Developer Mode in Apps → App Settings → 12345 and enter the Mac's local address. Fully restart the TV if the developer port remains closed.

## Install and launch

`npm run tv:install` uploads the signed widget with a unique build filename and calls Samsung's `vd_appinstall` command. It checks for `install completed` and confirms the app appears in the installed-app list. `sdb install` on this TV only uploaded the widget and did not install it.

`npm run tv:launch` opens the selected app. It does not change startup defaults. The TV tools use the SDK path and identity selected in `.local/signing.json`, falling back to the reference SDK and source manifest. Before any install connection, the installer checks the signed widget's identity and private-file policy. Changing an installed app's identity creates a different application; preserve existing identity and author certificates for updates. These tools remain reference installation commands, not an unattended installer for every TV.

## Sources

- [Samsung developer connection steps](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html)
- [Samsung app-launch sample](https://github.com/SamsungDForum/LaunchApp)
- [Samsung remote input guide](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html)

## Native Home and recovery

Native Home/startup was configured separately from the app installer. Physical Home from Netflix is confirmed. The one-shot helper runs as the SDK user. See scripts/native-home/README.md and docs/tv-status.md for the tested firmware and pending visual checks; docs/native-home-s90d.md holds the assumption review and prepared, still unrun procedure for the 65-inch target.

Query with `python3 scripts/native-home/run.py query`. Restore the saved pre-integration Home/startup values with `python3 scripts/native-home/run.py restore`. The private baseline is `.local/native-home/original.json`; preserve it and do not replace it with the applied state. Each TV also needs `.local/native-home/profile.json` (see `profile.example.json`); the runner and helper refuse to apply or restore without a matching model and firmware value. The legacy `.local/native-home/run.py` command is also retained. Restore before uninstalling Home or changing its stable app identity.

To rebuild the one-shot helper with this Mac's private verified SDK:

```sh
DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 DOTNET_CLI_HOME="$PWD/.local/native-home/cli" .local/native-home/dotnet-sdk/dotnet build scripts/native-home/Control.csproj -c Release --nologo -p:BaseIntermediateOutputPath="$PWD/.local/native-home/obj/" -o .local/native-home/out
```

The helper's output is not packaged inside the web app. Keep the original values, compiler, runtime output and all device diagnostics ignored.
