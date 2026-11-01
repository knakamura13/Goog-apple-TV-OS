# Home redesign: Library layout

Status: the owners' decisions were settled on 31 October 2026 (see Owners' decisions), and the checks on the TV are still open. Target TV: QN65S90DAFXZA (not a Frame). The owners rarely need Samsung Home, but it must stay reachable.

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
│  ┌──────────────┐                                            │
│  │ [Last app]   │                                            │  resume card
│  └──────────────┘                                            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ [Fav1] [Fav2] [Fav3] [Fav4] [Fav5] [Fav6]              │  │  favourites row (glass)
│  └────────────────────────────────────────────────────────┘  │
│   [App ] [App ] [App ] [App ] [App ] [App ]                  │  library row 1, partly
└──────────────────────────────────────────────────────────────┘  below the screen edge
```

- **Top left:** nav pills on a semi-transparent bar that the photo clearly shows through. Tabs: **Home** and **Inputs**. A translucent indicator marks the active tab and a solid one marks focus. Both slide between pills rather than jumping.
- **Top right:** one semi-transparent capsule holding the Settings button, the weather (icon and temperature) and the time in the corner, with equal gaps between all three. Weather and time can't be focused. Settings is the only focusable item there.
- **Resume card:** a glass card above the left end of the dock showing the app last opened from Home: its logo, or the TV's icon for it, and **Resume**. OK reopens the app. If it is still running in the background it returns where it was, otherwise it starts again. The card appears after the first launch from Home and only knows apps opened there. A live preview of an app isn't possible, because Tizen gives web apps no view of other apps' screens. If the TV test shows `tizen.tvwindow` can do it, an HDMI device opened from the Inputs tab shows its live picture in the card instead.
- **Favourites dock:** a near-full-width semi-transparent bar, after the tvOS dock, holding at most 6 apps so it never scrolls sideways. The focused app grows (about 1.18×), lifts a shadow and catches a sheen.
- **Library:** every installed app that isn't a favourite and isn't hidden, in alphabetical order, 6 per row in the same columns as the dock. At rest about 40% of the first row peeks above the bottom edge. The focused app's name appears below it.
- **App list and icons:** the TV supplies the list of installed apps, as CleanFrame's `device.js` already does, leaving out Samsung's internal ones. An app with a bundled logo (Simple Icons or Custom Brand Icons, single colour on its brand-coloured tile) shows that logo. Any other app shows the TV's own icon for it, or its name if that icon can't load. Apps installed later appear in the library on their own.
- **Shapes:** tiles, the dock, panels and dialogs use squircle (continuous-curvature) corners. Capsules keep fully rounded ends.
- **Sounds:** a soft, quiet tick when focus moves and a slightly fuller one on OK, synthesized from low-passed noise so they add no files. The TV's own menu sounds (`tizen.tvaudiocontrol`) were tried but are loud with no volume control, so they aren't used; the owners wanted the sound much quieter. On this TV, Web Audio adds about 0.1 s of delay, accepted for now. A switch to turn them off comes with the Settings redesign.
- **Motion:** quick and smooth, with transform and opacity only. Focus scales in about 170 ms, selection indicators slide in about 220 ms, and the page scrolls in about 340 ms.

## Library scrolled

Down from favourites scrolls the page up as one block and crossfades in a pre-rendered dimmed and blurred copy of the wallpaper behind the grid. The resume card fades out as the page starts to scroll. While the first rows fit, the dock stays visible just below the top bar. Further down, the dock fades away and the rows start directly below the top bar, so no empty band opens. Back, or Up from the first library row, returns to the favourites at rest. The top bar stays visible.

## Inputs tab

The tab shows HDMI sources as tiles, then Samsung's own source list and an **Edit inputs** tile. Whether a web app can switch the TV's real input on this model has to be confirmed on the TV (see Open checks).

## Settings (top-right gear)

The gear opens a glass panel on the right. Rows that only change a value do it in place when you press OK; a chevron opens a page or a full screen; an arrow opens a Samsung screen. Pages stack inside the panel with a breadcrumb, slide left going in and right coming back, and queue any key pressed during the slide.

| Row | Behaviour |
| --- | --- |
| Sleep timer | Steps through Off, 30 min, 1 hour, 90 min, 2 hours (not yet functional; V1) |
| Wallpaper › | Full-screen picker (below) |
| Apps › | Full-screen editor (below) |
| Weather › | Defaults to Costa Mesa, CA (ZIP 92626, where the TV is). Page with **ZIP code ›** (five digits: Up/Down change a digit, Left/Right move, or type with the remote's number buttons) and **Units** (Fahrenheit or Celsius) |
| Screensaver | Steps through After 1 min, 5 min, 15 min, Off |
| Picture and sound ↗ | Samsung's picture and sound settings |
| Samsung Home ↗ | The escape route. Back from the favourites row still offers the "stay or open Samsung Home" choice |
| About › | Read-only details for troubleshooting: build version and time, app size, free storage, TV model, firmware, Tizen and web engine versions, page size. TV values appear only on the TV |

**Inputs** (from the Edit inputs tile): one row per HDMI port; each opens a page with **Name ›** (typed with the TV keyboard) and **Show on Inputs** (On or Off).

**Wallpaper picker:** a glass panel on the left lists every photo as a thumbnail with its name, two per row. Resting on a photo previews it full screen after a quarter second, with its title and credit at the bottom right. OK applies it (a check marks the applied photo); Back restores the applied photo.

**Apps editor:** Favorites (up to 6, in your order, on a plate with outlines for free slots), Library (A–Z) and Hidden (A–Z, dimmed), with names under every app. OK picks an app up and a white outline marks it; the arrows carry it while the other apps slide aside; OK drops it and Back cancels. Favorites can't exceed 6 or drop below 1. A **Tile style** button switches between Color and Glass tiles. Every change saves at once and Home rebuilds when the editor closes.

## Screensaver (ambient mode)

After a set idle time on Home (default 1 minute), the top bar and rows fade out and the photo slowly zooms in (to about 106% over 2.4 s) while the text rises into place, for a parallax feel. On exit the photo eases back out quickly.

- **Bottom left:** the time, large, with the date below it ("Saturday, October 31st").
- **Bottom right:** the photo's title and credit ("Desert stars / Photographed by Mohammad Alizade"). The bundled CleanFrame photos all have credits.
- **No weather** in the screensaver.
- **Slideshow:** the photos rotate while it runs, and Home returns to its chosen photo afterwards.

The photo does a slow one-shot zoom and the text drifts every few minutes to protect the OLED. This is a QD-OLED, and Samsung's own panel-protection screensaver cannot be disabled by any app: confirmed on the TV that it takes over after a still minute or two, and even strong continuous motion does not prevent it (it yields only to actual video playback). So the launcher does not fight it — ours shows first, then Samsung's runs on longer idle, which protects the panel. Any key brings the UI back without acting on that key. While the launcher's screensaver is on and the launcher is in front, Samsung's own screensaver is held off (`webapis.appcommon.setScreenSaver`) so it can't cover ours. It's handed back after two hours without a button press, whenever another app is in front, and when ours is set to Off, so a paused video or an unattended TV keeps Samsung's panel protection and power saving.

## Remote navigation

| From | Key | Result |
| --- | --- | --- |
| Launch | – | The resume card when it shows, else the first favourite |
| Favourites | Left/Right | Move along the row, without wrapping |
| Favourites | Up | Resume card when it shows, else the active nav pill |
| Resume card | Up / Down | Active nav pill / first favourite |
| Resume card | OK | Reopen the last app |
| Favourites | Down | Same column in library row 1, and the page scrolls |
| Library | arrows | Grid movement, without wrapping. Up from row 1 returns to favourites |
| Library | Back | Favourites, same column if possible |
| Nav pills | Left/Right | Between pills. Right of the last pill jumps to Settings |
| Nav pills / Settings | Down | Resume card or favourites (Home tab), or the first input (Inputs tab) |
| Nav pill | OK | Switch tab. Focus alone does not switch, matching CleanFrame's rule that focus never acts |
| Favourites | Back | Existing "stay or open Samsung Home" choice |
| Any app tile | OK | Launch, with no message. A message appears only if the launch fails. Nothing ever autoplays or launches from focus |
| Any app tile | hold OK | A small menu: **Move**, **Hide**, and **Add to Favorites** or **Remove from Favorites**. Move picks the app up as in the Apps editor: the arrows carry it, OK drops it and Back cancels |

## Reused from CleanFrame

- `device.js` app launching and installed-app discovery
- preference storage and migrations
- the wallpaper gallery and rotation
- pre-rendered glass materials
- the Settings panel framework
- the Apps on Home editor
- the focus-handling rules in `docs/interaction-behaviour.md`

List and Dock stay available as layouts, and the new layout is added as **Library**. Art Mode is removed from Home on this TV because it isn't a Frame.

## Performance rules

- ES5 only.
- No live `backdrop-filter` or CSS blur on the TV. Use pre-rendered blur and dim images.
- Animate only `transform` and `opacity`.
- Fetch weather at most every 30 minutes and cache it, so Home never waits on the network.
- Load app icons from local files.

## Prototype

`demo/library/` is a throwaway browser prototype for settling this spec. It isn't packaged into the TV app. Run `npm run dev:public` and open `http://127.0.0.1:4795/demo/library/`.

- **Keys:** arrows move, Enter is OK, Escape is Back, A starts ambient mode, H hides the key hints. Clicking a tile focuses it and presses OK. The TV build has none of these extras.
- **Real:** CleanFrame's photos, pre-rendered glass, brand marks and fonts; remote navigation; ambient mode; the settings panel.
- **Sample data:** the HDMI inputs and the weather temperature (a placeholder; the location defaults to Costa Mesa but real weather fetch is a V1 item), and in the browser the apps. Messages such as "Opens Netflix on the TV." stand in for launches the browser can't do.
- **On the TV:** Home lists the installed apps as described under App list and icons, OK opens them, and Samsung Home and Picture and sound open Samsung's screens. On a first run, Favorites holds the first six installed apps from the owners' list (see Owners' decisions), the rest of that list fills the library, and every other installed app starts in Hidden. With nothing from the list installed, Favorites holds the first six apps A–Z.
- **Options:** `?wall=<id>` picks a wallpaper, for example `?wall=night`. Settings → Apps → Tile style switches between Color and Glass tiles.
- **TV build:** `npm run build:demo` assembles `dist/library-demo/`, a self-contained Tizen web app (about 15 MB) with relative asset paths and its own `config.xml` (SDK-generated identity `Zm209bQNEk.Home`, CleanFrame's proven profile, privileges and settings). It is unsigned; sign it with the owner's certificate profile, for example `tizen package -t wgt -s <profile> -- dist/library-demo`. Code between `preview` markers (key hints, the A and H keys, mouse clicks, `?wall=`) is stripped, and only the logos in use are copied. `build-info.js` records the commit, build time and size for Settings › About. On the TV, the number buttons are registered for ZIP entry.
- **Package size:** 15.2 MB, of which code is 86 KB. Each photo costs about 1 MB: the 1920×1080 photo about 690 KB, three pre-rendered glass layers about 236 KB and the thumbnail about 38 KB. The two variable fonts take 0.6 MB as TTF files.
- **Test readout (TV test builds only):** the remote's 0 button shows the firmware, free storage, the sound state and frame timings for the last moves between the dock and the library and for the screensaver. Buttons 1 to 3 switch off the blurred photo, the squircle masks and the glass images for comparison; button 4 drops the composited fade layers back (the lag fix), to confirm it. Remove before V1.
- **HDMI probe (TV only):** the Inputs tab reads which HDMI ports really have a device (`tizen.systeminfo` VIDEOSOURCE). OK on a connected input tries `tizen.tvwindow.setSource` and shows it full screen; any button closes it. Success or the exact error appears as a message, which answers open check 2 on the first run.
- **Performance so far:** with Chrome's CPU throttled 6×, every interaction reached its next frame in 17–30 ms (median), worst 50 ms (a settings page slide), with no main-thread task over 50 ms. That covers JavaScript, style and layout only; the GPU cost of full-screen photo layers, glass copies and squircle masks still needs measuring on the TV.

## Quality bar for the production build

The prototype only explores the design. Once the spec is locked, the launcher is rebuilt as a production front end:

- unit tests for state, navigation and storage logic
- mutation testing to prove those tests catch real faults
- end-to-end tests that drive every screen with remote keys
- performance budgets and measurements: frame times for focus, scroll and crossfade, plus startup time, checked against the TV's engine
- current accessibility and TV design standards on every screen: focus visibility, contrast, text size at 3 m, reduced motion
- the same design language applied to every screen, including Settings, the Home editor and dialogs

## Open checks on the TV

1. Tizen version, web engine, page size and free storage on this firmware (all shown in Settings › About). Free storage sets how many photos the build can carry. The first test showed 0.5 GB free of 4.1 GB, with the app at 15.2 MB, a 1920 × 1080 page and the platform build `TIZEN-TRUNK2025-PontusM-OSU-2024-HOTFIX-RELEASE_20260514.3` (the 2025 OS upgrade).
2. Whether `tizen.tvwindow.setSource` changes the real input or only a preview window, and which privilege it needs. Fallback: launch Samsung's source list.
3. Whether a sleep timer is reachable from a web app. Fallback: a TV settings shortcut.
4. Weather network access from the signed app (`<access origin>` in `config.xml`).
5. Entering and leaving the screensaver (the dock/library scroll lag was fixed by compositing the fade layers). In the first TV test, moving between the dock and the library lagged, with one long stall per move (worst frame 167–200 ms). The cause was the first fade frame promoting the blur, veil and glass layers to the compositor; keeping them composited (CSS `will-change: opacity`) cut the worst frame to about 20 ms on the TV, and that is now the default. Entering and leaving the screensaver still needs its own measurement on the TV.
6. Whether holding OK on the remote reaches the app as key repeats or a key-up it can time, which editing in place needs.
7. Whether an app reopened from Home returns where it was or starts again, and how long the TV keeps apps such as Plex running in the background. The current build answers this through each app's tile, since the resume card makes the same launch call.
8. How much of the roughly 0.1 s Web Audio delay is audible in normal use (the TV's own menu sounds, via `tizen.tvaudiocontrol`, avoid it but are loud with no volume control; `tizen.feedback` doesn't exist on this TV).
9. Confirm a remote key press from Samsung's panel-protection screensaver returns to our launcher Home, not Samsung Home. (Settled: that screensaver can't be disabled by any app, so the launcher no longer tries to suppress it.)

## Owners' decisions (31 October 2026)

- App name: **Home**, with the SDK-generated identity `Zm209bQNEk.Home` (created 31 October 2026). Test builds and V1 share it, so every later version installs in place and the Home button is pointed at it once. The first test used `xTZbrxm7Ut.LibraryDemo`, now retired.
- Tabs: Home and Inputs only.
- Favourites: at most 6, in one row.
- Glass: if the TV can't animate it smoothly, glass becomes a plain semi-transparent tint with no blurred photo behind it (Kyle, 31 October 2026, after the first TV test showed lag on the dock-to-library move and around the screensaver).
- Apps: Plex, YouTube, Netflix, Apple TV, Hulu, Prime Video, HBO Max, Spotify, Samsung TV Plus, Amazon Alexa and SmartThings, in that order (`OWNER_APPS`). The first six start as favourites. Every other installed app starts hidden, and apps installed later appear in the library.
- In V1: editing apps in place by holding OK on Home (see Remote navigation), and the resume card for the last app (see Screen zones). A live preview of an app isn't possible. Not in V1: a night look, two favourite sets for two people, and Text size and Reduce motion settings.
