# Native Home on QN65S90DAFXZA: review and prepared procedure

Prepared 31 October 2026 on branch `native-home-impl`. **Nothing has been run on this TV.** The
read-only survey is a device action too: it stages temporary helper files and executes code as the
SDK user, so it needs its own explicit authorisation. This note is source review and a plan only.

Scope: point the native Home button (and, where the firmware allows it, boot) at the installed
launcher `Zm209bQNEk.Home` on Kyle's 65-inch S90D. The signed launcher and its installation exist,
and its source has a Samsung Home action (`app/device.js` launches `com.samsung.tv.csfs`), but that
escape has not been confirmed on this TV; confirming it is the stage-6 gate below. This note covers
only the undocumented routing change.

## 1. Verdict

The method is right, and two lineages of Tizen 9 work support it: this repository's Frame helper
and couchroot's S90D record. The Kurumi toolkit performs the same three writes, but its own source
says it uses the same native functions as couchroot, so it corroborates the method rather than
adding an independent trial. This handoff's task list, however, is not exactly what the proven
method does. It **writes three things, not six**, and its firmware guard must be **captured from
this TV**, not copied from a reference. The prepared code fixes the defects found while
re-profiling and adds recovery guards. Nothing found needs root beyond the SDK user, a
security-policy change, a downgrade or a disabled compatibility check.

Two limits stay, and neither is a code problem: the 65-inch variant has never been tested by
anyone, and booting straight to a custom app from a cold mains power-on is unsolved upstream.

## 2. Assumptions reviewed

### A1. Retail 2130 equals the reference base, and the guard can key on `prd_info.ini`

**Verdict: strong but unconfirmed, and it must not be guessed.** The `Version=` field in
`/etc/prd_info.ini` is a different field from the `tizen.systeminfo` build string already recorded
(`TIZEN-TRUNK2025-PontusM-OSU-2024-HOTFIX-RELEASE_20260514.3`). The firmware version alone does not
determine it: at the same 2130 generation the published S90D records show two different suffixes.

| TV | `prd_info.ini` version string | Source |
| --- | --- | --- |
| QN55S90DAFXZA (US) | `T-PTMDAKUC-0090-REL-202605141701` | couchroot S90D record |
| QN55S90DAGXZD (BR) | `T-PTMDUABC-0090-2130.0` | Kurumi toolkit |
| QA55LS03DAWXXY (reference Frame) | `T-PTMDUABC-0090-2130.0` | this repository |

The `-0090-` token appears in every observed Tizen 9 string, and the build date matches; that is
why the match is likely. It is not proof for a US 65-inch unit. The implementation therefore makes
`version` a private, per-TV value: `query` prints the exact observed string as `PROFILE_VERSION`,
and `apply`/`restore` refuse an empty or mismatched value. No firmware string is committed or
hard-coded. A `query` result without `-0090-` should be treated as a mismatch and stopped.

The model has two independent sources: the public API `modelName`, which the runner checks before
staging, and `Model=` in `/etc/prd_info.ini`, which the helper checks and `query` prints as
`PROFILE_MODEL`. Both must pass. If they disagree, stop and report; a read-only `query` is allowed
through with a warning precisely so the disagreement can be seen, while `apply` and `restore`
refuse. Do not edit the profile to satisfy one guard and silence the other.

### A2. `Zm209bQNEk.Home` is installed and is the right target; boot eligibility is unproven

**Verdict: installed and correct; boot eligibility is unproven.** The identity is recorded in
`demo/library/config.xml` and in the 31 October owner decisions, and in-place updates use the
existing certificate, so the ID is stable. Boot eligibility is decided by the firmware and has
never been asked on this TV. `query` reports `BOOT_SUPPORTED` from
`util_is_appbooting_supported_webapp_byappid`, and `apply` refuses anything other than `true`.
If it reports false or `unknown`, that is a review point, not something to force.

### A3. The five keys plus the main operation are the complete baseline

**Verdict: the capture set is right; the write set is wrong.** couchroot's S90D record is explicit:
setting `startup_appid` alone did **not** establish startup and Samsung reverted it; the working
configuration sets `home_appid` and `auto_start=1`, after which "Samsung then updated the
startup-app string to the hub itself", and "`db/first_screen/type` remains Samsung Home". Kurumi's
`home.py set` writes exactly three things. This repository's Frame readback shows the
same derivation: Home, startup and boot-backup name the launcher while the first-screen type still
names Samsung Home.

The five-row table in the setup guide is a **baseline** table, not a write list. Writing
`startup_appid` or `booting_appid_backup` directly would be an unproven mutation of a field the
firmware derives, and writing `first_screen/type` would move a field that the proven configuration
leaves alone.

**Implementation:** apply writes the native `main` operation, `db/appfw/home_appid` and
`auto_start=1`. All five typed values and the operation are still captured and restored. Restore
verifies every value except the two the firmware re-derives, and reports those that have not
settled.

The reference originals are `com.samsung.tv.csfs` for Home, `org.tizen.tv-viewer` for startup and
boot-backup, `com.samsung.tv.csfs` for the first-screen type, and `0` for autostart. They are
recorded across the published S90D material and the Frame readback, but not every row is named by
every source. **Do not seed a baseline from them.** They are evidence about the model family, not
this TV's state.

### A4. Guards, readback and exact-value rollback are sound once re-profiled

**Verdict: sound in design, with the defects below fixed.** Found while re-profiling:

1. The firmware guard was hard-coded and applied to **every** mode, including `query`. On a new TV
   that makes the only read-only diagnostic fail before it can print anything. The guard is now
   per-TV and applies only to `apply`/`restore`; `query` reports the observed value so it can be
   pinned.
2. The boot-eligibility probe was called unconditionally at the start of `query`. If that symbol is
   absent or differs on this model, the first read-only step would die. It is now advisory in
   `query` (`BOOT_SUPPORTED=true|false|unknown`) and required only for `apply`.
3. A failed `apply` attempted an automatic restore, and a failure inside that restore would hide
   the original error. Both errors are now reported.
4. There is **no per-firmware hash or offset to re-verify** for this method, contrary to the
   handoff's instruction: the transport is a shell injection and the helper binds exported library
   functions by name, not addresses. The pins that actually matter are the exact firmware string,
   the settings above, and the presence of `/usr/bin/dotnet` plus `libbundle`, `libaul`,
   `libapp-context-manager-common`, `libcapi-appfw-app-operation-tv` and `libvconf`. `inspect`
   reports all of them.

One added recovery guard: a baseline whose Home value names the launcher is rejected, because
restoring it would "succeed" without changing anything. A baseline that carries provenance for a
different model or application is rejected too, so the two TVs' recovery files cannot be swapped by
mistake. Baselines from the earlier build have no provenance fields and still load, so `restore`
also compares live state for every value apply can change: each must be either the captured value
or the launcher value this profile's apply produces. Anything else is another change or another
TV's baseline, and restore refuses rather than writing over it. A change to
`db/first_screen/type`, which apply never touches, is only noted before the captured value goes
back. After writing, restore verifies every value except the two the firmware re-derives, and
reports those instead of pretending the rollback is complete.

### Corrections to the framing in the handoff and research file

- **The "physical Home always works" floor is only true before the change.** Samsung Home stays
  installed and the assignment is reversible configuration, but once the operation points at the
  launcher, the Home button reaches that app. Whether this platform falls back to Samsung Home when
  the assigned app fails to launch is **unverified**. The real floor is: Samsung Home remains
  installed, the launcher carries a Samsung Home action, and the TV's own menus plus the SDB
  recovery path stay available. That is why the setup guide's stage 6 gate (a *visibly confirmed*
  route back to Samsung's interface) must be closed before apply. That gate is still open for this
  TV, and the launcher's escape has not been seen working there.
- **The research file's "three independent projects" overstates the independence.** Two lineages
  exist: this repository's Frame helper and couchroot's S90D work. Kurumi's toolkit writes the same
  three artifacts, and its source says it uses the same native functions as couchroot, so it
  corroborates rather than independently reproduces the result. That does not weaken the method;
  it does mean the count should not be used as evidence.
- **couchroot's S90D rollback tooling is not a maintained recovery path.** The device record opens
  with a 2026-10-12 correction that its direct `restore.py` commands are historical and use
  placeholder addressing, and the boot-recovery guide says it does not touch the Home assignment.
  The precedent is a *record of a working trial*, not a currently exercised undo. Recovery here
  depends on our own helper and our own captured baseline.
- **chris-ritsen's S90D row is about root, not Home routing**, and it is marked "Reported,
  downstream". It supports the existence of the SDK foothold on this firmware family; it is weaker
  evidence for this specific method than the two Home-assignment records. It also notes one Tizen
  10 build where the injection is rejected, so the foothold is worth proving before anything else.
- **`vconftool set` is hazardous on this firmware generation.** On couchroot's S90D it corrupted the
  Home key's privilege fields and needed temporary root (`buxton2ctl set-read-priv`/
  `set-write-priv`) to repair. This helper uses native setters only. `inspect` keeps `vconftool get`
  as a read-only fallback and says not to set. A privilege-field repair would need root beyond UID
  901: that is a stop condition, not a workaround.

## 3. Resolved target and exact writes

| Item | Value | Status |
| --- | --- | --- |
| Model | `QN65S90DAFXZA` | Recorded; runner checks the public API before staging, helper checks `/etc/prd_info.ini Model=` |
| Firmware | retail 2130, Tizen 9 OSU-2024 build dated 2026-05-14 | Read from the TV's settings; `prd_info.ini` value to be captured |
| Platform | Tizen 9.0, armv7, 32-bit | Same as the tested S90D/Frame generation; re-checked by `inspect` |
| Application | `Zm209bQNEk.Home` (package `Zm209bQNEk`, name "Home") | Installed and in use |
| Package path | `/opt/usr/apps/Zm209bQNEk` | Derived from the package ID; `query` reports whether it exists |
| Transport | SDB developer connection, SDK user UID 901 | Proven on this TV for installation; foothold itself unproven here |
| Runtime | TV .NET 6, `/usr/bin/dotnet`, 32-bit | Reported by `inspect` |

| Setting | Apply | Capture | Restore | Reason |
| --- | --- | --- | --- | --- |
| `http://tizen.org/appcontrol/operation/main` | set to launcher | yes | yes | The Home button resolves this operation |
| `db/appfw/home_appid` | set to launcher | yes | yes | `app-boot-manager` chooses the Home app from it |
| `db/menu/smart_hub/ontvsetting/auto_start` | `1` | yes | yes | Foreground rather than background launch at boot |
| `db/appfw/startup_appid` | **no** | yes | yes | Derived by the firmware; a direct write was reverted and did not establish startup |
| `db/appfw/booting_appid_backup` | **no** | yes | yes | Derived by the firmware |
| `db/first_screen/type` | **no** | yes | yes | Stays Samsung Home in the proven configuration |

Both model checks must pass; `PROFILE_MODEL` is the on-device one. A disagreement between them is a
stop-and-report condition, not something to reconcile by editing the profile.

## 4. Code changes on this branch

- `scripts/native-home/Control.cs`: the target app ID and the model/firmware guard come from a
  required profile file; `query` is read-only and unguarded by firmware; the boot probe is
  advisory in `query`; a missing or unreadable `/etc/prd_info.ini` prints `<absent>` instead of
  killing the survey; the failure path reports both errors; a baseline naming the launcher is
  rejected; restore refuses live values the baseline does not explain and verifies what it wrote;
  the "already applied" retry gets a clear message; query prints `PROFILE_MODEL`,
  `PROFILE_VERSION`, `TARGET_PACKAGE_DIR`, `TARGET_PACKAGE_PRESENT` and `BOOT_SUPPORTED`.
- `scripts/native-home/run.py`: requires the private profile, validates the app ID before staging,
  checks the public API model **before staging anything**, verifies every local file before the
  first push, pushes the profile, and extracts the query snapshot to `.local/native-home/query.json`.
  It still never writes `original.json`. `inspect` needs neither the profile nor the compiled helper.
  A missing marker and a non-zero helper exit are reported separately, so a refusal is no longer
  described as "device state is unknown". The transport (injection shape, length cap, callback peer
  check, output cap) is unchanged.
- `query.sh`, `apply.sh`, `restore.sh`: pass the staged profile and snapshot paths, and always print
  the helper's exit status before the end marker.
- `inspect.sh`: adds the boot ID, `/usr/bin/dotnet`, `libaul`/`libbundle`, and labels the
  `vconftool` reads as read-only.
- `profile.example.json`: tracked placeholder with no TV identity.

Not changed on purpose: the assembly name, the staged paths, the base64 injection, the 400-byte
argument cap, the 100 KB output cap and the callback peer check. couchroot used a distinct assembly
name to avoid a stale same-named assembly resolving on its TV; no `CleanFrameHomeControl.dll` has
ever been staged on this S90D, and the Frame's private compiled copy is untouched, so there is
nothing stale to avoid here.

Migration note for the reference Frame: the tracked runner and helper now need a private
`.local/native-home/profile.json` pinned to that TV (its model, its exact `PROFILE_VERSION`,
`nClrkHome1.FrameHome`) before the next rebuild or restore. Its existing `original.json` still
loads, and the only snapshot field that changed is the advisory boot probe, which restore never
used. Until the profile is pinned, the tracked scripts refuse before staging; the Frame's previous
tracked revision (`git show <previous>:scripts/native-home/...`) plus its already-compiled private
output remain an offline fallback, so its recovery path is not lost.

## 5. Procedure, ready for review

Each numbered device step below is a separate authorisation. One invocation performs one package
manager injection; on S90D-family firmware `sdbd` can stay busy for minutes afterwards, so wait
between steps and never loop a failed run.

**0. Offline, before any device step**

```sh
cd <project>
mkdir -p .local/native-home
cp scripts/native-home/profile.example.json .local/native-home/profile.json
# edit model -> QN65S90DAFXZA, app_id -> Zm209bQNEk.Home, leave version null
```

Review the profile, the compiled helper revision in `.local/native-home/out/`, and this note. The
runner refuses an empty model or app ID before it connects.

**1. Read-only device survey** (stages temporary files; no settings writes)

```sh
python3 scripts/native-home/run.py inspect
python3 scripts/native-home/run.py query
```

Expected in `query` output: `PROFILE_MODEL`, `PROFILE_VERSION`, `TARGET_PACKAGE_PRESENT=true`,
`BOOT_SUPPORTED=true`, the five current values, `CLEANFRAME_HOME_EXIT=0`, and one
`CLEANFRAME_HOME_JSON=` line. `query` saves that snapshot to `.local/native-home/query.json`.
**Stop here and review.**

**2. Offline, after reviewing the survey**

- Copy `PROFILE_MODEL` and `PROFILE_VERSION` into `.local/native-home/profile.json` exactly. A
  trailing `;` is ignored. `PROFILE_MODEL` must also equal the public API value the runner already
  checked; if the two sources disagree, stop and report rather than picking one.
- Confirm the captured values match the reference pattern for this model family (Home
  `com.samsung.tv.csfs`, startup and boot-backup `org.tizen.tv-viewer`, first-screen
  `com.samsung.tv.csfs`, autostart `0`). A different value is not automatically wrong, but it is a
  review point.
- If `BOOT_SUPPORTED` is not `true`, stop and report.
- Save the baseline once: `test ! -e .local/native-home/original.json && cp .local/native-home/query.json .local/native-home/original.json`
  (then `chmod 600`). If it already exists, do not overwrite it.
- Copy `.local/native-home/` (baseline, profile, compiled helper, source revision) to a private
  location outside the project.

**3. Apply, once**

```sh
python3 scripts/native-home/run.py apply
```

The helper re-reads the live state, refuses if anything changed since the baseline, writes the three
artifacts with readback after each, and prints `CLEANFRAME_HOME_APPLIED=` with the complete
post-write snapshot. That printed snapshot is the readback; a separate `query` is optional and, if
run, must be spaced out.

**4. Physical checks** (record pass, fail and unverified separately)

| Check | Required observation |
| --- | --- |
| Home from the launcher | Returns to the launcher |
| Home from Netflix or YouTube | Opens the launcher, not Samsung's Home |
| Home from one more app | Opens the launcher |
| Samsung Home escape | The launcher's Samsung Home action visibly opens Samsung's interface; Home returns |
| Standby, then wake | Record the screen that actually appears |
| Controlled reboot | Record the boot ID change and the first screen |
| Full mains power-off | Record what appears. Samsung's fastboot is expected to win; do not record this as a success from settings |

**5. Rollback test, then decide**

```sh
python3 scripts/native-home/run.py restore
```

The helper checks that every live value is either the captured one or the value this profile's
apply produces, so another TV's baseline is refused instead of written over this one. It then
verifies every value except the two the firmware re-derives, failing if a write did not stick.
`CLEANFRAME_HOME_RESTORED` shows the complete live state. If
`CLEANFRAME_HOME_RESTORE_PENDING` appears, the firmware-derived startup and boot-backup values
still name the launcher: the firmware owns those fields, so recheck after a reboot instead of
writing them by hand. Then confirm the physical Home button opens Samsung Home. Reapply only after
that passes, and only if Kyle wants the change retained.

## 6. Risks and recovery

| Risk | How it shows up | Mitigation | Residual |
| --- | --- | --- | --- |
| Foothold rejected on this exact build | `query` returns no markers or the SDB call fails | Fail closed; no settings written. Try a later SDB invocation, then stop | Unexplained |
| Runtime or library missing/changed | `inspect` or the helper errors | Inspect first; stop rather than substituting a library or a different runtime | Low |
| Boot-eligibility probe says no/unknown | `apply` refuses | Stop and report; do not bypass | Blocks the change |
| Partial write | Readback or exception after one setter | Automatic exact restore; if that fails the message names both errors. Samsung Home is still installed | Mixed state until restore |
| Launcher fails to launch after being assigned | Home button appears broken | Restore from the baseline; reach Samsung Home from the TV's own menus meanwhile | Platform fallback unverified |
| Live state the baseline does not explain | `restore` refuses and names the keys | Do not swap baselines between TVs; capture fresh values and review before writing anything | Manual review |
| `vconftool`-style privilege damage | Home key privilege fields read as `0` | Never use `vconftool set`; if observed, stop (repair needs root) | Out of scope |
| Firmware update during the experiment | `apply`/`restore` refuse on version mismatch | Re-run `query` (read-only) and re-pin `version` before restoring. Consider pausing auto-update during the trial | Manual step |
| SDB transport unavailable when recovery is needed | Cannot stage the helper | Keep Developer Mode on, keep the network unchanged, keep the SDK and the private baseline, keep the compiled helper. This is the only real brick path | Accepted |

**The only true brick risk is losing the SDB/foothold transport while Home points at an app that
cannot start.** Everything else is recoverable from the captured baseline. Samsung Home is never
removed, and the launcher is never uninstalled as part of this work.

**Stop and report instead of working around a guard if:** the model or firmware differs; the boot
probe disagrees; the runtime or a library is missing; the launcher is not installed under this
identity; the captured baseline cannot be restored exactly; or a repair would need root beyond UID
901, a security-policy change, a downgrade, or a disabled compatibility check.

## 7. What stays unproven

- **65-inch variant.** Every recorded S90D success is a 55-inch or 83-inch unit. Same firmware
  generation is strong evidence, not a result.
- **Cold mains power-on.** The Home button reassignment is a configuration the platform reads; the
  cold-boot first screen is a separate fastboot path. couchroot confirmed from firmware analysis
  that the first boot skips the configurable first-screen job. Expect Samsung's own Home after a
  full power-off; do not claim otherwise from a settings readback.
- **Boot eligibility** of this web app on this firmware (the probe has never been run here).
- **The foothold** on this exact retail build. It is proven on this TV for `vd_appinstall`, not for
  the package-name injection.
- **Whether the platform falls back** to Samsung Home if the assigned app fails to launch.
- **Derived startup/backup behaviour on the 65-inch.** Recorded on a 55-inch unit and on the Frame.

## 8. Questions for the reviewers

1. Is the reduced write set right for the goal? Alternatively, a first trial could write only the
   native operation and leave `auto_start` alone (Home button without boot behaviour). That variant
   is unproven; the three-artifact set is the one with precedent.
2. Should `restore` stay firmware-guarded, given that re-pinning the profile from a fresh `query` is
   the documented way through a firmware change?
3. Is deriving `/opt/usr/apps/<package>` from the app ID acceptable as the "installed" check, or
   should the helper read the app registry instead?
4. Is keeping `vconftool get` in `inspect.sh` acceptable as a read-only fallback, given the
   documented `set` failure on this firmware generation?

## 9. Sources

- couchroot S90D record: <https://github.com/splitcipher/couchroot/blob/83906b468836869933012da03a4018fb339462b3/docs/devices/s90d/README.md>
- couchroot porting guide: <https://github.com/splitcipher/couchroot/blob/main/docs/guides/porting-to-a-new-tv.md>
- couchroot S90D boot/recovery (historical correction): <https://github.com/splitcipher/couchroot/blob/main/docs/guides/s90d-boot-recovery.md>
- couchroot issue 40 (cold boot, recovery floor): <https://github.com/splitcipher/couchroot/issues/40>
- Kurumi S90D toolkit, `tools/home.py` and `tools/home-route/Program.cs`: <https://github.com/IgorRichard13/kurumi-s90d-toolkit>
- samsung-tv-root, compatibility table (SVE-2025-50109): <https://github.com/chris-ritsen/samsung-tv-root>
- In-repo: `docs/agent-tv-setup-guide.md` stages 6-8, `docs/tv-status.md`, `docs/compatibility.md`,
  `docs/home-redesign.md`, `scripts/native-home/README.md`
