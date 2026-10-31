# Home redesign: Library layout

Status: draft spec with a browser prototype, 31 October 2026. Target TV: QN65S90DAFXZA (not a Frame). The owners rarely need Samsung Home, but it must stay reachable.

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
│  ┌────────────────────────────────────────────────────────┐  │
│  │ [Fav1] [Fav2] [Fav3] [Fav4] [Fav5] [Fav6]              │  │  favourites row (glass)
│  └────────────────────────────────────────────────────────┘  │
│   [App ] [App ] [App ] [App ] [App ] [App ]                  │  library row 1, partly
└──────────────────────────────────────────────────────────────┘  below the screen edge
```

- **Top left:** nav pills on a semi-transparent bar that the photo clearly shows through. Proposed tabs: **Home** and **Inputs**. A translucent indicator marks the active tab and a solid one marks focus. Both slide between pills rather than jumping.
- **Top right:** one semi-transparent capsule holding the Settings button, the weather (icon and temperature) and the time in the corner, with equal gaps between all three. Weather and time can't be focused. Settings is the only focusable item there.
- **Favourites dock:** a near-full-width semi-transparent bar, after the tvOS dock, holding at most 6 apps so it never scrolls sideways. The focused app grows (about 1.18×), lifts a shadow and catches a sheen.
- **Library:** every installed app that isn't a favourite and isn't hidden, in alphabetical order, 6 per row in the same columns as the dock. At rest only about 15% of the first row peeks above the bottom edge. The focused app's name appears below it.
- **Shapes:** tiles, the dock, panels and dialogs use squircle (continuous-curvature) corners. Capsules keep fully rounded ends.
- **Motion:** quick and smooth, with transform and opacity only. Focus scales in about 170 ms, selection indicators slide in about 220 ms, and the page scrolls in about 340 ms.

## Library scrolled

Down from favourites scrolls the page up as one block and crossfades in a pre-rendered dimmed and blurred copy of the wallpaper behind the grid. While the first rows fit, the dock stays visible just below the top bar. Further down, the dock fades away and the rows start directly below the top bar, so no empty band opens. Back, or Up from the first library row, returns to the favourites at rest. The top bar stays visible.

## Inputs tab

The tab shows HDMI sources as tiles that you can rename, such as "PlayStation" or "Mac". It may also offer a shortcut to Samsung's own source list. Whether a web app can switch the TV's real input on this model has to be confirmed on the TV (see Open checks).

## Settings (top-right gear)

Settings reuses CleanFrame's grouped Settings and adds:

- Favourites and hidden apps, extending the existing Apps on Home editor to three groups: Favourites, Library and Hidden.
- Weather location and units.
- Ambient mode timing.
- Sleep timer and TV settings shortcuts.
- **Samsung Home**, the escape route. Back from the favourites row still offers the existing "stay or open Samsung Home" choice.

## Screensaver (ambient mode)

After a set idle time on Home (default 5 minutes), the top bar and rows fade out and the photo slowly zooms in (to about 106% over 2.4 s) while the text rises into place, for a parallax feel. On exit the photo eases back out quickly.

- **Bottom left:** the time, large, with the date below it ("Saturday, October 31st").
- **Bottom right:** the photo's title and credit ("Desert stars / Photographed by Mohammad Alizade"). The bundled CleanFrame photos all have credits.
- **No weather** in the screensaver.
- **Slideshow:** the photos rotate while it runs, and Home returns to its chosen photo afterwards.

The text drifts a few pixels every few minutes using `transform`, to protect the OLED from burn-in. Any key brings the UI back without acting on that key. The TV's own screensaver stays enabled.

## Remote navigation

| From | Key | Result |
| --- | --- | --- |
| Launch | – | Focus on the last-launched favourite, else the first |
| Favourites | Left/Right | Move along the row, without wrapping |
| Favourites | Up | Active nav pill |
| Favourites | Down | Same column in library row 1, and the page scrolls |
| Library | arrows | Grid movement, without wrapping. Up from row 1 returns to favourites |
| Library | Back | Favourites, same column if possible |
| Nav pills | Left/Right | Between pills. Right of the last pill jumps to Settings |
| Nav pills / Settings | Down | Favourites (Home tab) or the first input (Inputs tab) |
| Nav pill | OK | Switch tab. Focus alone does not switch, matching CleanFrame's rule that focus never acts |
| Favourites | Back | Existing "stay or open Samsung Home" choice |
| Any app tile | OK | Launch. Nothing ever autoplays or launches from focus |

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

- **Keys:** arrows move, Enter is OK, Escape is Back, A starts ambient mode, H hides the key hints.
- **Real:** CleanFrame's photos, pre-rendered glass, brand marks and fonts; remote navigation; ambient mode; the settings panel.
- **Sample data:** the apps, HDMI inputs and weather.
- **Options:** `?wall=<id>` picks a wallpaper, for example `?wall=night`. Settings → App tiles switches between Color and Glass tiles.

## Quality bar for the production build

The prototype only explores the design. Once the spec is locked, the launcher is rebuilt as a production front end:

- unit tests for state, navigation and storage logic
- mutation testing to prove those tests catch real faults
- end-to-end tests that drive every screen with remote keys
- performance budgets and measurements: frame times for focus, scroll and crossfade, plus startup time, checked against the TV's engine
- current accessibility and TV design standards on every screen: focus visibility, contrast, text size at 3 m, reduced motion
- the same design language applied to every screen, including Settings, the Home editor and dialogs

## Open checks on the TV

1. Tizen version and web engine on this firmware.
2. Whether `tizen.tvwindow.setSource` changes the real input or only a preview window, and which privilege it needs. Fallback: launch Samsung's source list.
3. Whether a sleep timer is reachable from a web app. Fallback: a TV settings shortcut.
4. Weather network access from the signed app (`<access origin>` in `config.xml`).
5. Rendering speed of the scrolled library and the crossfades on the panel.

## Open choices for the owners

- Nav tabs: only Home and Inputs, or a third such as Photos (wallpaper and ambient)?
- Weather location (city or ZIP) and °F or °C.
- Whether favourites can hold more than 6 apps (that would mean a second favourites row, never sideways scrolling).
