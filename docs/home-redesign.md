# Home redesign: Library layout

Status: V1 (version 1.0.0), built and signed on 31 October 2026 and not yet installed on the TV. The owners' decisions were settled the same day (see Owners' decisions); what still needs checking on the TV is listed under Open checks. Target TV: QN65S90DAFXZA (not a Frame). The owners rarely need Samsung Home, but it must stay reachable.

Goals: no ads, no apps the owners don't use, no autoplay, a fast feel on the TV, and more useful than Smart Hub.

## Sources of the design

| Reference | Keep | Reject |
| --- | --- | --- |
| Google TV | Nav pills in the top left, with an obvious active state. System info and settings in the top right. | Ad backdrop, text and promo clutter covering most of the screen, horizontally scrolling app row. |
| Apple tvOS | Full-bleed photo or artwork. Time always visible in the top-right corner. One favourites row, then every other non-hidden app in rows below. The next row peeks in at the bottom edge to show the page scrolls. | Weather missing beside the time. |
| tvOS dock | Glass bar behind the favourites (the nav pills use the same glass). The focused app grows larger. | – |

## Screen zones (Home tab, at rest)

```
┌──────────────────────────────────────────────────────────────┐
│ ((Home) Inputs)                          ⚙    ☁ 64°  9:41  │  top bar
│                                                              │
│                  full-bleed photo / artwork                  │
│                                                              │
│  (↩ Resume [logo])                                           │  Resume pill
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ [Fav1] [Fav2] [Fav3] [Fav4] [Fav5] [Fav6]              │  │  favourites row (glass)
│  └────────────────────────────────────────────────────────┘  │
│   [App ] [App ] [App ] [App ] [App ] [App ]                  │  library row 1, partly
└──────────────────────────────────────────────────────────────┘  below the screen edge
```

- **Top left:** nav pills on a semi-transparent bar that the photo clearly shows through. Tabs: **Home** and **Inputs**. A translucent indicator marks the active tab and a solid one marks focus. Both slide between pills rather than jumping.
- **Top right:** one semi-transparent capsule holding the Settings button, the weather (icon and temperature, see Weather) and the time in the corner, with equal gaps between all three. Weather and time can't be focused. Settings is the only focusable item there.
- **Resume pill:** a capsule just above the left end of the dock: a return arrow, **Resume** and the logo of the app last opened from Home in white, or the app's name when Home has no logo for it. It never repeats the app's full tile, so it doesn't read as a second copy of a dock app (Kyle, 2 November 2026). Focused, it turns solid like the nav pills. OK reopens the app. If it is still running in the background it returns where it was, otherwise it starts again. The pill appears after the first launch from Home, only knows apps opened there and never offers a hidden app. A live preview of an app isn't possible, because Tizen gives web apps no view of other apps' screens.
- **Favourites dock:** a near-full-width semi-transparent bar, after the tvOS dock, holding at most 6 apps so it never scrolls sideways. The focused app lifts so its top overhangs the dock's top edge, grows to 1.14× over a soft drop shadow that ends above its name (v1.1.1: the first, darker shadow reached behind the name) and catches a sheen, and its name appears inside the dock with its baseline on the other apps' bottom edge. A white ring, darkening the other apps, dots, a bar and a glow were tried and rejected (Kyle, 2 November 2026). App names are small (24 px on Home, 22 px in the Apps editor): the logo identifies the app, the name only confirms it.
- **Library:** every installed app that isn't a favourite and isn't hidden, in the owner's order (Move, below), 6 per row in the same columns as the dock. A save from before the library had an order starts A–Z. Apps installed later join at the end, and an app leaving the dock goes to the top (Kyle, 2 November 2026). At rest about the top 47px of the first row peeks above the bottom edge (Kyle, 2 November 2026). The focused app's name appears below it.
- **App list and icons:** the TV supplies the list of installed apps, as CleanFrame's `device.js` already does, leaving out Samsung's internal ones. An app with a bundled logo (Simple Icons or Custom Brand Icons, single colour on its brand-coloured tile) shows that logo. Any other app shows the TV's own icon for it, or its name if that icon can't load. Home reads the list again whenever it comes back to the front, so apps installed meanwhile appear in the library on their own.
- **Shapes:** tiles, the dock, panels and dialogs use squircle (continuous-curvature) corners. Capsules keep fully rounded ends.
- **Sounds:** a soft, quiet tick when focus moves and a slightly fuller one on OK, synthesized from low-passed noise so they add no files. The TV's own menu sounds (`tizen.tvaudiocontrol`) were tried but are loud with no volume control, so they aren't used; the owners wanted the sound much quieter. On this TV, Web Audio adds about 0.1 s of delay, accepted for now. V1 has no switch to turn them off.
- **Motion:** quick and smooth, with transform and opacity only. Focus scales in about 170 ms, selection indicators slide in about 220 ms, and the page scrolls in about 340 ms.

## Library scrolled

Down from favourites scrolls the page up as one block and crossfades in a pre-rendered dimmed and blurred copy of the wallpaper behind the grid. The Resume pill fades out as the page starts to scroll. While the first rows fit, the dock stays visible just below the top bar. Further down, the dock fades away and the rows start directly below the top bar, so no empty band opens. Back, or Up from the first library row, returns to the favourites at rest. The top bar stays visible.

## Inputs tab

The tab shows the HDMI ports as tiles, then Samsung's source list and an **Edit inputs** tile. Each tile shows its port and the name from Settings, or **Connected** for an unnamed port with a device, or **No device**. The TV reports which ports have a device (`tizen.systeminfo` VIDEOSOURCE) each time the tab opens and whenever Home comes back to the front on this tab; until it first does, each port counts as connected. HDMI 4 starts hidden.

- **OK on a connected port** shows it full screen inside Home (`tizen.tvwindow`), with "Press Back to return to Home." Other keys do nothing while it shows; Back returns to the same tile, once however long it is held. Home's screensaver timer pauses meanwhile, and leaving Home closes the view. Whether this is the TV's real input path (sound, game picture mode) is open check 1.
- **OK on a port with nothing connected** says so.
- **Source list** opens Samsung's source app (`org.tizen.SMSourceAPP`) for anything Home doesn't show, such as USB or the antenna.
- **Edit inputs** opens Settings › Inputs.

## Settings (top-right gear)

The gear opens a glass panel on the right. Rows that only change a value do it in place when you press OK; a chevron opens a page or a full screen; an arrow opens a Samsung screen. Pages stack inside the panel with a breadcrumb, slide left going in and right coming back, and queue any key pressed during the slide.

| Row | Behaviour |
| --- | --- |
| Wallpaper › | Full-screen picker (below). The row shows **Random photo** or the chosen photo's name |
| Apps › | Full-screen editor (below) |
| Weather › | Defaults to Costa Mesa, CA (ZIP 92626, where the TV is). Page with **ZIP code ›** (five digits: Up/Down change a digit, Left/Right move, or type with the remote's number buttons; the row names the place once it is known, or says the ZIP code wasn't found) and **Units** (Fahrenheit or Celsius) |
| Screensaver › | Page with **Starts** (After 1 min, 5 min, 15 min, Off) and **Matte** (Off, White, Gray, Navy, Black). The row shows both |
| Picture and sound ↗ | Samsung's picture and sound settings |
| Samsung Home ↗ | The escape route: opens Samsung Home at once |
| About › | Read-only details for troubleshooting: build version and time, app size, free storage, TV model, firmware, Tizen and web engine versions, page size. TV values appear only on the TV |

There is no sleep timer: a web app can't turn the TV off, and the TV's own sleep timer stays in Samsung's settings.

**Inputs** (from the Edit inputs tile): one row per HDMI port; each opens a page with **Name ›** (typed with the TV keyboard: Done or OK saves, Cancel or Back keeps the old name, and the screensaver waits while you type) and **Show on Inputs** (On or Off). Two sample names that test builds saved for HDMI 1 and 2 ("PlayStation 5", "Mac mini") are cleared from those builds' saves only; saves carry a version from V1 on, so a name the owner types is never cleared.

**Wallpaper picker:** a glass panel on the left lists **Random photo** first, then every bundled photo (twelve; Sunlit summits, Gold Coast dusk and Sydney Harbour were removed on 2 November 2026), as thumbnails with names, two per row. Resting on a photo previews it full screen after a quarter second, with its title and credit at the bottom right. OK applies it and saves it (a check marks the applied photo); Back restores the applied photo.

**Random photo** (Daily photo until v1.2, Kyle, 2 November 2026): a random Unsplash photo from Lorem Picsum (`picsum.photos`, no account or key), a landscape photo from a random page of Picsum's list. Home takes a new one each time Random photo is chosen in the picker, and again whenever the shown one has been up for the screensaver delay (Settings › Screensaver, 1 minute by default; Off means it changes only when chosen). It doesn't change in the picker or while the screensaver runs, and after the screensaver a full delay passes before the next. The pick is saved, so a restart shows the same photo from the web engine's cache. Planned, not built: a wallpaper cycle of its own, separate from the screensaver delay, that can include random photos, the bundled photos or both. Its glass is made on the TV with CleanFrame's material recipe (`scripts/build-materials.mjs`): the photo, cropped to fill the screen, with mirrored edges, softened 2 px for the clear layer, blurred 28 px for the library and 42 px for the frost, rendered at half size once for each new photo and again after a restart. A 48 × 27 copy measures how bright the photo is behind the top bar and the dock, and the capsules darken accordingly, in the same fields as the bundled catalogue (`HomeLogic.photoLook`). Over a bright photo the panels, menus, dialog, resume card, empty input tiles, library veil and picker caption darken too; bundled photos keep their reviewed tints. Offline, or until the photo arrives, Home shows the bundled photo and tries again every five minutes; a TV that can't make the glass at all stops trying, and the picker says so. A first run starts with Random photo; a save from a build before it keeps its bundled photo. The save names a bundled photo by its id; saves before v1.2 held its index in the V1 catalogue, and a removed photo falls back to Mountain valley. Home writes no image files; the web engine's cache holds recent photos and evicts them by itself.

**Weather:** Home sends the ZIP code to Zippopotam.us once to find its place, then asks Open-Meteo for that place's current conditions (coordinates rounded to about a kilometre) at most every 30 minutes. The reading is saved in Celsius and converted for display, so Home shows it at once after a restart and never waits on the network. Until a reading arrives, or once it is two hours old, the weather is hidden rather than showing a made-up value. A failed check retries in five minutes. Nine icons cover the WMO weather codes by day and night.

**Apps editor:** Favorites (up to 6, in your order, on a plate with outlines for free slots), Library (in your order) and Hidden (A–Z, dimmed), with names under every app. OK picks an app up and a white outline marks it; the arrows carry it while the other apps slide aside; OK drops it and Back cancels. The rules are Move's (below), plus Down past the library into Hidden and Up from Hidden to the end of the library. A **Tile style** button switches between Color and Glass tiles. Every change saves at once and Home rebuilds when the editor closes.

## Screensaver (ambient mode)

After a set idle time on Home (default 1 minute), the top bar and rows fade out and the photo slowly zooms in (to about 106% over 2.4 s) while the text rises into place, for a parallax feel. On exit the photo eases back out quickly.

- **Bottom left:** the time, large, with the date below it ("Saturday, October 31st").
- **Bottom right:** the photo's title and credit ("Desert stars / Photographed by Mohammad Alizade"), or for an online photo the credit alone ("Photo by … on Unsplash"). The bundled CleanFrame photos all have credits.
- **Legibility:** one full-width band darkens the bottom of the screen (to 70% at the edge) and the text has a tight shadow. Shaded blobs behind the clock and the credit were removed because they showed as dark ovals over dark photos (Kyle, 2 November 2026). Over all twelve bundled photos the clock keeps at least 3.3:1, the date 5:1 and the credit 6.7:1 against the brightest 5% of the photo behind them.
- **No weather** in the screensaver.
- **Photo:** always Home's own photo, so leaving the screensaver never changes it. The random photo keeps changing on its one timer while the screensaver runs, each new photo's glass made before it shows; a bundled photo stays (Kyle, 2 November 2026).
- **Matte** (Settings › Screensaver › Matte): like a Samsung Frame, the photo sits scaled into a 16:9 window (1440 × 810) cut in paper board, White, Gray, Navy or Black. The paper is a full-screen texture made once by `scripts/build-matte.py` (soft laid grain, faint mottling, fibres; nothing repeats), with a 6 px bevel showing the board's core (white on White and Gray, black on Navy and Black) and an inner shadow deepest under the top edge. The time, date and credit become a small gallery label on the board below the photo, dark on White and Gray, light on Navy and Black.
- **Leaving:** any key, or the remote's Home button: with Home as the TV's home app it relaunches Home, which wakes it (the `appcontrol` event, or Home becoming visible again).

The photo does a slow one-shot zoom and every 3 minutes the text glides for 30 seconds to a new spot at most 24 px away (about 0.5 px a second, never over 0.8, too slow to see) to protect the OLED (Kyle, 2 November 2026). This is a QD-OLED, and Samsung's own panel-protection screensaver cannot be disabled by any app: confirmed on the TV that it takes over after a still minute or two, and even strong continuous motion does not prevent it (it yields only to actual video playback). So the launcher does not fight it: ours shows first, then Samsung's runs on longer idle, which protects the panel. A key press from Samsung's screensaver returns to this Home (confirmed on the TV). Any key brings the UI back without acting on that key, however long it is held. Home's idle timer only runs while Home is in front.

## Remote navigation

| From | Key | Result |
| --- | --- | --- |
| Launch | – | The Resume pill when it shows, else the first favourite |
| Favourites | Left/Right | Move along the row, without wrapping |
| Favourites | Up | Resume pill when it shows, else the active nav pill |
| Resume pill | Up / Down | Active nav pill / first favourite |
| Resume pill | OK | Reopen the last app |
| Favourites | Down | Same column in library row 1, and the page scrolls |
| Library | arrows | Grid movement, without wrapping. Up from row 1 returns to favourites |
| Library | Back | Favourites, same column if possible |
| Nav pills | Left/Right | Between pills. Right of the last pill jumps to Settings |
| Nav pills / Settings | Down | Resume pill or favourites (Home tab), or the first input (Inputs tab) |
| Nav pill | OK | Switch tab. Focus alone does not switch, matching CleanFrame's rule that focus never acts |
| Favourites | Back | The first favourite; on the first favourite, the screensaver (Kyle, 2 November 2026: Back never offers Samsung Home, which Settings opens) |
| Any app tile | OK | Launch, with no message. A message appears only if the launch fails. Nothing ever autoplays or launches from focus |
| Any app tile | hold OK | After 450 ms, a small menu: **Open**, **Move**, **Add to Favorites** or **Remove from Favorites**, and **Hide**. Move picks the app up right on Home: Left/Right carry it along the dock or through the library in reading order, Up/Down move it a row and between dock and library, and the other apps slide aside. Carried into a full dock it pushes the dock's last app to the top of the library; the dock keeps at least one app. OK drops it and saves, Back puts everything back (Kyle, 2 November 2026). The others apply in place and save. A quick tap launches on key-up. Key repeats while OK is held are ignored whether or not the TV flags them, any other key cancels the hold, and if the TV never sends key-up the hold ends 800 ms after the last OK event, so Open in the menu still opens apps (TV open check 5) |

## Reused from CleanFrame

Home is its own app in `app/`; CleanFrame's Frame interface has been removed. Home uses:

- `device.js` for app launching and installed-app discovery
- the bundled photos, their credits and catalogue values, and their pre-rendered glass materials, whose recipe Home also follows for online photos
- the brand marks with their optical-size metrics, and the fonts
- CleanFrame's focus rule: focus alone never acts; OK does

Art Mode isn't offered because this TV isn't a Frame.

## Performance rules

- ES5 only.
- No live `backdrop-filter` or CSS blur on the TV. Use pre-rendered blur and dim images. An online photo's glass is drawn once per photo on a canvas, never during an animation.
- Animate only `transform` and `opacity`.
- Fetch weather at most every 30 minutes and cache it, so Home never waits on the network.
- Load app icons from local files.

## Build, preview and tests

The code is in `app/`: `index.html`, `app.css`, `app.js` (the app) and `logic.js` (pure logic shared with the unit tests), plus `config.xml`. Run `npm run dev` and open `http://127.0.0.1:4795/home/` to preview it in a browser.

- **Preview keys:** arrows move, Enter is OK, Escape is Back, A starts the screensaver, H hides the key hints. Clicking a tile focuses it and presses OK. `?wall=<id>` shows a bundled photo, for example `?wall=night`. The TV build has none of these extras.
- **Preview data:** the browser has no TV, so it shows sample apps and says what a launch or an HDMI tile would do ("Opens Netflix on the TV."). Weather and photos are real in the browser too.
- **On the TV:** Home lists the installed apps as described under App list and icons, OK opens them with no message, and Samsung Home, Picture and sound and Source list open Samsung's screens. On a first run, Favorites holds the first six installed apps from the owners' list (see Owners' decisions), the rest of that list fills the library, and every other installed app starts in Hidden. With nothing from the list installed, Favorites holds the first six apps A–Z. A damaged save falls back to these defaults. If the TV's app list can't be read, the sample apps hold Home's place without launching, the owner's saved Favorites and Hidden are kept as they were, and Home tries again every 10 seconds.
- **TV build:** `npm run build` assembles `dist/home/`, a self-contained Tizen web app with relative asset paths and its own `config.xml` (SDK-generated identity `Zm209bQNEk.Home`, version 1.0.0). It is unsigned; sign it with the owner's certificate profile, for example `tizen package -t wgt -s <profile> -o dist/signed-home-<time> -- <copy of dist/home>`, which writes `Home.wgt` (see `docs/development.md`). Code between `preview` markers is stripped, and only the logos in use are copied. `build-info.js` records the commit, build time and size for Settings › About. On the TV, the number buttons are registered for ZIP entry.
- **Network:** `config.xml` grants the `internet` privilege and access to `api.zippopotam.us`, `api.open-meteo.com` and `picsum.photos` (with its `fastly` subdomain) only. Home sends the ZIP code, the place's rounded coordinates and photo requests; nothing else.
- **Package size:** about 15.3 MB, of which code is about 100 KB. Each bundled photo costs about 1 MB: the 1920×1080 photo about 690 KB, three pre-rendered glass layers about 236 KB and the thumbnail about 38 KB. The two variable fonts take 0.6 MB as TTF files.
- **Tests:** `npm run check:all` runs the unit tests for `logic.js`, mutation testing (every mutant caught), end-to-end checks that drive every screen with remote keys, accessibility checks (visible focus and WCAG AA contrast on every screen) and frame-gap budgets with the CPU throttled 6×. A stand-in for the Tizen API and fixtures for the online services keep them off the TV and the internet; `docs/testing.md` has the details. Contrast over the photo is reported as a warning where it depends on the photo: text on glass passes on the photos the checks use, but its bounds over a pure white or black photo keep that photo's tints, so they don't model how the glass over an online photo darkens with its brightness. The tile menu's focus is visible but faint by the AAA measure.
- **Performance in the browser:** with the CPU throttled 6×, every interaction keeps a median frame gap of 16.7 ms, and the worst gap stays under 75 ms (a page slide or the screensaver). The GPU cost of full-screen photos, glass copies and squircle masks can only be measured on the TV.

## Quality bar

The rebuild bar set when the spec was locked, and where V1 stands:

- unit tests for state, navigation and storage logic: the pure logic (lists, saved values, weather, photos) is in `logic.js` with unit tests; navigation and storage are covered end to end
- mutation testing to prove those tests catch real faults: every mutant caught
- end-to-end tests that drive every screen with remote keys: yes
- performance budgets and measurements: frame gaps in the browser; focus, scroll and the dock/library crossfade measured on the TV in test builds (worst frame about 20 ms); the screensaver and the daily photo's glass still to measure on the TV
- accessibility and TV design standards on every screen: focus visibility and contrast are checked on every screen (see the contrast note under Tests); text is 24 px or larger on the 1920 × 1080 page apart from the time's AM/PM (22 px); with reduced motion requested, transitions are instant and the screensaver doesn't zoom
- the same design language on every screen, including Settings, the Apps editor and dialogs: yes

## Open checks on the TV

Still to check:

1. Whether OK on an HDMI tile (`tizen.tvwindow` full screen) is the TV's real input path, with sound and the game picture mode, or only a window, and whether the "Press Back" message shows over it (the window is in front of the page); and that Source list opens Samsung's source app (`org.tizen.SMSourceAPP`).
2. Weather and photos from the signed app: the `internet` privilege and `<access>` origins in `config.xml`, and the canvas glass, which needs the photos' CORS headers (Picsum sends `Access-Control-Allow-Origin: *`).
3. How long the random photo's glass takes to render on the TV, how it looks next to the bundled photos' glass, and how readable the top bar, panels and menus are over a bright random photo.
4. Entering and leaving the screensaver, and the slideshow's photo changes. The dock/library scroll lag was fixed by compositing the fade layers (worst frame 167–200 ms before, about 20 ms after); the screensaver still needs its own measurement on the TV.
5. Whether holding OK reaches the app as key repeats and a key-up it can time, which editing in place needs. If no key-up arrives, the hold ends on its own and the menu's Open row still opens apps. Also whether the TV keyboard's Done and Cancel keys reach Home while a name is typed.
6. Whether an app reopened from Home returns where it was or starts again, and how long the TV keeps apps such as Plex running in the background. Each app's tile answers this, since the resume card makes the same launch call.
7. How much of the roughly 0.1 s Web Audio delay is audible in normal use (the TV's own menu sounds, via `tizen.tvaudiocontrol`, avoid it but are loud with no volume control; `tizen.feedback` doesn't exist on this TV).

Settled on the TV or by design:

- Tizen 9.0, a 1920 × 1080 page and 0.5 GB free of 4.1 GB in the first test, on platform build `TIZEN-TRUNK2025-PontusM-OSU-2024-HOTFIX-RELEASE_20260514.3` (retail firmware 2130). Settings › About shows these values.
- Sleep timer: a web app can't turn the TV off, so the row is gone.
- Samsung's panel-protection screensaver can't be disabled by any app, and a key press from it returns to this Home.
- Installing over an earlier build works in place (same identity and certificate).

## Owners' decisions (31 October 2026)

- App name: **Home**, with the SDK-generated identity `Zm209bQNEk.Home` (created 31 October 2026). Test builds and V1 share it, so every later version installs in place and the Home button is pointed at it once. The first test used `xTZbrxm7Ut.LibraryDemo`, now retired.
- Tabs: Home and Inputs only.
- Favourites: at most 6, in one row.
- Glass: if the TV can't animate it smoothly, glass becomes a plain semi-transparent tint with no blurred photo behind it (Kyle, 31 October 2026, after the first TV test showed lag on the dock-to-library move and around the screensaver).
- Apps: Plex, YouTube, Netflix, Apple TV, Hulu, Prime Video, HBO Max, Spotify, Samsung TV Plus, Amazon Alexa and SmartThings, in that order (`OWNER_APPS`). The first six start as favourites. Every other installed app starts hidden, and apps installed later appear in the library.
- In V1: editing apps in place by holding OK on Home (see Remote navigation), and the Resume pill for the last app (see Screen zones). A live preview of an app isn't possible. Not in V1: a night look, two favourite sets for two people, and Text size and Reduce motion settings.
- Weather: Costa Mesa, CA (ZIP 92626) by default.
- Screensaver: after 1 minute by default. Samsung's own screensaver is accepted rather than fought (Kyle, 31 October 2026).
- Photos: endless online photos for the screensaver and, as the random photo, for Home, holding only a photo or two at a time (Kyle, 31 October 2026).
