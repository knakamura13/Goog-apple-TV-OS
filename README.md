# Home

A personal launcher for a Samsung Tizen TV: favourite apps, the full app library, inputs, weather and a daily photo, driven entirely by the remote. No ads, no autoplay, nothing the owners don't use.

Home began as a fork of [CleanFrame](https://github.com/nthnclrk/CleanFrame), a quieter home screen for Samsung The Frame. It keeps CleanFrame's device adapter, photographs, pre-rendered glass materials, brand marks, fonts and TV tools, and replaces the interface. The target TV is a Samsung QN65S90DAFXZA (not a Frame). The design, owner decisions and open TV checks are in [the Home spec](docs/home-redesign.md).

**Use it at your own risk.** It is built for one TV. The TV tools and the native Home helper carry reference-machine assumptions; expect to adapt them and to test the result on your own hardware.

## Preview in a browser

You need Node.js 22.13+ (22 LTS) or 24+, and Python 3.10+.

```sh
npm ci
npm run dev
```

Open [localhost:4795/home/](http://localhost:4795/home/). Arrows move, Enter is OK, Escape is Back, A starts the screensaver and H hides the key hints. The browser has no TV, so it shows sample apps and says what a launch would do.

## Build, sign and install

```sh
npm run build
```

`build` assembles `dist/home/`, a self-contained, unsigned Tizen web app: the browser-only code between `preview` markers is stripped, asset paths become relative and only the assets Home uses are copied. Sign it with the official Samsung SDK and your own certificate profile, then install it with the TV tools; see [development](docs/development.md#build-and-sign).

The app identity is `Zm209bQNEk.Home` in `app/config.xml`. Every later version installs in place over it, so keep that identity and its author certificate.

## Develop and check

```sh
npm run check        # ES5 lint, manifest and resource check, device adapter and logic unit tests
npm run check:tools  # signing-config, private-file and installer guards, offline
npm run check:public # private-file and credential scan of the working tree and Git history
npx playwright install chromium-headless-shell
npm run check:all    # unit, mutation, end-to-end, accessibility and frame-gap checks
```

None of the checks contacts a TV or the internet. [Testing](docs/testing.md) describes each one.

| Location | Purpose |
| --- | --- |
| `app/` | Home: `index.html`, `app.css`, `app.js`, `logic.js`, `config.xml`, the shared `device.js` adapter, icon and assets |
| `scripts/` | Preview, build, checks, asset generation and TV tools |
| `scripts/native-home/` | The optional helper that makes Home the TV's native Home/startup app |
| [Development](docs/development.md) / [testing](docs/testing.md) | Runtime map, build and signing, checks and device boundaries |
| [Assets](docs/assets.md) / [third-party notices](THIRD_PARTY_NOTICES.md) | Rendering recipes and asset provenance |
| `.local/`, `dist/` | Ignored private setup, recovery data, builds and packages |

## Licence and credits

The original code and documentation use the [MIT licence](LICENSE). Fonts, photographs and logos keep their own terms; read [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This is an independent project with no Samsung or streaming-service affiliation.
