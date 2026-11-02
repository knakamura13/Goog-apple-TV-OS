# Native Home on QN65S90DAFXZA: review and prepared procedure

Prepared 31 October 2026 on branch `native-home-impl`. **The read-only survey (`inspect` + `query`)
ran on this TV on 1 November 2026 with Kyle watching; it wrote no settings. `apply` and `restore`
have not run.** The read-only survey is a device action too: it stages temporary helper files and
executes code as the SDK user, so it had its own explicit authorisation, and each writing step still
needs one of its own. An independent agent cross-reviewed this text and the code in three rounds on
31 October; a fourth round, and a fifth (the survey and the model-guard fix it forced), are in the
review record in section 4.

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

The model has two independent sources, and the 1 November survey showed they carry **different**
identifiers on this TV, by design: the public API `modelName` is the sales code `QN65S90DAFXZA`,
while `Model=` in `/etc/prd_info.ini` is the platform code `T-PTMDAKUC-0090` (`query` prints the
latter as `PROFILE_MODEL`). The earlier assumption that the two match was wrong. The profile now
carries both: `model` is the sales code the runner checks against the public API, and
`platform_model` is the platform code the on-device helper checks against `/etc/prd_info.ini`. Each
guard checks the source it actually reads, and neither is edited to satisfy the other; a wrong TV
still fails, because a different sales code trips the runner and a different platform code or firmware
trips the helper.

### A2. `Zm209bQNEk.Home` is installed and is the right target; boot eligibility is unproven

**Verdict: installed and correct; boot eligibility confirmed by the 1 November survey.** The identity
is recorded in `app/config.xml` and in the 31 October owner decisions, and in-place updates
use the existing certificate, so the ID is stable. Boot eligibility is decided by the firmware; the
1 November `query` returned `BOOT_SUPPORTED=true` and `TARGET_PACKAGE_PRESENT=true` here, so the
launcher is installed and the firmware reports it boot-eligible. Cold-boot-to-launcher is a separate
matter and stays unproven (section 7). `query` reports `BOOT_SUPPORTED` from
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

The five-row table in the setup guide is a **baseline** table, not a write list. In `apply`, writing
`startup_appid` or `booting_appid_backup` would be an unproven mutation of a field the firmware
derives, and writing `first_screen/type` would move a field that the proven configuration leaves
alone. `restore` does write all five, because its job is to put the captured pre-change state back;
the two derived keys are then reported separately, since only the firmware can re-settle them.

**Implementation:** apply writes the native `main` operation, `db/appfw/home_appid` and
`auto_start=1`, then re-reads and asserts those three before reporting success. All five typed
values and the operation are still captured and restored. Restore verifies every value except the
two the firmware re-derives, and reports those that have not settled.

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
   the original error. Both errors are now reported. The automatic undo also writes only the three
   values apply sets, so a half-failed apply no longer rewrites firmware-owned fields, and `apply`
   now re-reads and asserts its own result instead of trusting the per-write readbacks alone.
4. There is **no per-firmware hash or offset to re-verify** for this method, contrary to the
   handoff's instruction: the transport is a shell injection and the helper binds exported library
   functions by name, not addresses. The pins that actually matter are the exact firmware string,
   the settings above, and the presence of `/usr/bin/dotnet` plus `libbundle`, `libaul`,
   `libapp-context-manager-common`, `libcapi-appfw-app-operation-tv` and `libvconf`. `inspect`
   reports all of them.

One added recovery guard: a baseline that names the launcher in the native operation or in
`home_appid`, or that pairs `auto_start=1` with a derived `startup_appid` on the launcher, is
rejected, because restoring it would "succeed" without changing anything or would quietly re-apply
part of the applied state. The derived field is only treated as evidence when `auto_start=1` is
also present, so a fresh capture after a restore whose derived values have not settled is still
accepted. That check only recognises **this profile's** app id: a baseline captured after apply
under a different app id, with no provenance fields, is not detected, so old baselines deserve a
manual look. A baseline
whose provenance names a different model or application is rejected too, so the two TVs' recovery
files cannot be swapped by mistake. Baselines from the earlier build have no provenance fields and
still load, so `restore` also checks live state before writing. The hard gate covers the three
values apply writes — the native operation, `home_appid` and autostart — and each must be either
the captured value or the launcher value this profile's apply produces. Anything else is another
change or another TV's baseline, and restore refuses rather than writing over it. The two
firmware-derived keys and
`db/first_screen/type` are only noted, because refusing there would block the very rollback that
repairs a misrouted Home button; restore writes the captured values back and reports what does not
follow.

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
| Model (sales) | `QN65S90DAFXZA` | profile `model`; runner checks it against the public API `modelName` before staging |
| Model (platform) | `T-PTMDAKUC-0090` | profile `platform_model`; helper checks it against `/etc/prd_info.ini Model=`; captured by the 1 Nov survey |
| Firmware | retail 2130, Tizen 9 OSU-2024 build 2026-05-14; `prd_info.ini` = `T-PTMDAKUC-0090-2130.0` | Captured by the 1 Nov survey and pinned in the profile |
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

Both model checks must pass, but against **different** values: the runner checks `model` (sales code)
against the public API, and the helper checks `platform_model` (the `PROFILE_MODEL` platform code)
against `/etc/prd_info.ini`. They are two identifiers for the same TV, confirmed distinct by the
survey; neither is edited to satisfy the other.

## 4. Code changes on this branch

- `scripts/native-home/Control.cs`: the target app ID and the model/firmware guard come from a
  required profile file; `query` is read-only and unguarded by firmware; the boot probe is
  advisory in `query`; a missing or unreadable `/etc/prd_info.ini` prints `<absent>` instead of
  killing the survey. `apply` re-reads and asserts the three values it writes, and a failed apply
  undoes only those three instead of rewriting firmware-owned fields. A baseline that names the
  launcher in the operation or `home_appid`, or that pairs `auto_start=1` with a derived
  `startup_appid` on the launcher, is rejected as an applied-state capture; `restore` holds a hard
  gate on the three
  values apply writes, notes firmware-owned differences, and verifies the result. Every failure
  prints a single `CLEANFRAME_HOME_ERROR=` line before the stack trace; the "already applied" retry
  gets a clear message; query prints `PROFILE_MODEL`, `PROFILE_VERSION`, `TARGET_PACKAGE_DIR`,
  `TARGET_PACKAGE_PRESENT` and `BOOT_SUPPORTED`.
- `scripts/native-home/run.py`: requires the private profile, validates the profile JSON and types
  before staging, checks the public API model **before staging anything**, verifies every local file
  plus `.local/device.json` and the SDK's `sdb` before the first push, pushes the profile, and
  extracts the query snapshot to `.local/native-home/query.json`.
  It still never writes `original.json`. `inspect` needs neither the profile nor the compiled helper,
  and continues as a shell-only survey if the device API is unreachable; `query` also continues,
  because it writes no settings, while `apply` and `restore` stop.
  A missing marker, a non-zero helper exit and a bad snapshot are reported separately, with the
  helper's own `CLEANFRAME_HOME_ERROR=` line as the summary; a callback that never arrives and a
  stream that stalls or overruns the output cap all say the result is unknown, save the partial
  output and transport record, and point at a read-only `query` rather than claiming nothing was
  written. The runner also compares `Control.cs` with the `CONTROL_SHA256` stamp beside the
  compiled helper: a missing stamp or a mismatch blocks `apply`/`restore` and warns in `query`,
  and a missing `Control.cs` stops both, because the build cannot be reviewed. `inspect` never uses
  the helper. The transport (injection shape,
  length cap, callback peer check, output cap) is unchanged.
- `query.sh`, `apply.sh`, `restore.sh`: pass the staged profile and snapshot paths, and always print
  the helper's exit status before the end marker.
- `inspect.sh`: adds the boot ID, `/usr/bin/dotnet`, `libaul`/`libbundle`, and labels the
  `vconftool` reads as read-only.
- `profile.example.json`: tracked placeholder with no TV identity.

**Review record.** Three cross-review rounds found and fixed: a restore gate that refused
immediately after a successful apply (the one state it exists for); a failed-apply undo that rewrote
firmware-owned fields; a runner regression that skipped the model guard when the TV's API answered
without `modelName`; a timeout path that claimed "nothing was written"; a stale-helper path with no
build check; and several doc statements that overstated what the evidence shows. The final round's
verdict was that the read-only step is safe and that the remaining items were writing-mode guards.

**Fourth round (the spawning session plus a separate reviewer).** Two further items, fixed here.
(1) `restore` wrote the two firmware-derived keys with a strict readback before it reset autostart,
so a synchronous re-derivation could throw and leave autostart in the applied state (the Home button
still returns to stock, so it is not a brick). `restore` now writes every value `VerifyRestore`
checks hard first, as `UndoApply` does, then writes the two derived keys loosely. (2) The
build-integrity wording is softened: the stamp catches a stale source, not a swapped binary, so the
binary-to-source match is procedural — rebuild from the reviewed source immediately before any
device step. The derivation timing behind (1) is unproven on this TV; confirm it with a
firmware-literate engineer. The falsifying observation is a `restore` that throws naming a
firmware-derived key. This review record is therefore not a claim that no defect remains.

**Fifth round (the 1 November read-only survey).** The survey ran on this TV (`inspect` + `query`,
no settings written) and confirmed the SDK user, the 32-bit runtime, the TV's .NET 6 runtime, every
bound library, `TARGET_PACKAGE_PRESENT=true`, `BOOT_SUPPORTED=true`, and the firmware string. It also
showed that the public API model (`QN65S90DAFXZA`, sales) and `/etc/prd_info.ini` Model
(`T-PTMDAKUC-0090`, platform) are **different** identifiers — which the earlier single-`model` design
treated as a stop-and-report disagreement, so it would have blocked `apply` permanently. Fixed here:
the profile gains a `platform_model` field, the on-device helper checks it against `/etc/prd_info.ini`
while the runner keeps checking `model` against the public API, and the helper was rebuilt and
re-stamped. This updates A1, A2 and section 7 (boot eligibility and the transport are now confirmed
on this TV). The change overturns a documented assumption and has not yet been cross-reviewed; the
open question for the reviewers is whether splitting the model guard into two pinned identifiers
preserves the "right TV" guarantee as well as the original intent (question 5).

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
# edit model -> QN65S90DAFXZA (sales code), app_id -> Zm209bQNEk.Home; leave version and platform_model null
```

Then rebuild the helper and stamp the reviewed source. Run both commands from
`scripts/native-home/README.md`; they need this Mac's private verified SDK, which a public clone
does not have. The runner compares `Control.cs` against the `CONTROL_SHA256` stamp beside the
compiled copy and **refuses `apply` and `restore`** when the two disagree or the stamp is missing.
That catches a source edited after the build, but it does **not** tie the compiled DLL to the
reviewed source: the stamp and the DLL share one operator-writable folder and nothing hashes the
binary. The binary-to-source match is therefore procedural, not enforced. Rebuild from the reviewed
`Control.cs` immediately before any device step and treat the stamp only as a staleness tripwire.
`query` only warns, since it writes no settings, and `inspect` never loads the helper.

Review the profile, the compiled helper and the stamp in `.local/native-home/out/`, and this note.
The runner refuses an empty model or app ID before it connects.

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

- Copy `PROFILE_MODEL` into `.local/native-home/profile.json` as `platform_model` and
  `PROFILE_VERSION` as `version`, exactly. A trailing `;` is ignored. `PROFILE_MODEL` is the
  `/etc/prd_info.ini` platform code and is expected to differ from the sales `model` the runner checks
  against the public API; that difference is normal, not a stop condition. On this TV they are
  `T-PTMDAKUC-0090` and `QN65S90DAFXZA`.
- Confirm the captured values. The reference pattern for this model family is Home
  `com.samsung.tv.csfs`, startup and boot-backup `org.tizen.tv-viewer`, first-screen
  `com.samsung.tv.csfs`, autostart `0`. The 1 November capture here differs in explainable ways: Home,
  startup and first-screen are `com.samsung.tv.csfs`, autostart is already `1`, and boot-backup names a
  leftover third-party dev app from earlier testing. A different value is not automatically wrong, but
  it is a review point; the baseline restores to exactly this captured state.
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
| Foothold rejected on this exact build | No callback within 18 s, or no markers | The result is unknown, not "nothing happened". Run a read-only `query` before retrying; do not loop | Unexplained |
| Runtime or library missing/changed | `inspect` or the helper errors | Inspect first; stop rather than substituting a library or a different runtime | Low |
| Boot-eligibility probe says no/unknown | `apply` refuses | Stop and report; do not bypass | Blocks the change |
| Partial write | Readback or exception after one setter | Automatic undo of the three applied values; if that fails the message names both errors. Samsung Home is still installed | Mixed state until restore |
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
- **Boot eligibility** of this web app on this firmware is now confirmed: the 1 November probe
  returned `true`. (Cold-boot-to-launcher, above, is the separate unproven part.)
- **The foothold / transport** on this exact retail build is now confirmed: the 1 November read-only
  survey executed the helper as the SDK user. (Listed here before the survey; kept for the record.)
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
5. The 1 November survey showed the public API model and `/etc/prd_info.ini` Model are different
   identifiers (sales vs platform), so the model guard was split into `model` (runner, public API) and
   `platform_model` (helper, `prd_info`). Does checking both pinned identifiers preserve the "right TV"
   guarantee as well as the original single-value check, or is a further cross-check wanted?

## 9. Sources

- couchroot S90D record: <https://github.com/splitcipher/couchroot/blob/83906b468836869933012da03a4018fb339462b3/docs/devices/s90d/README.md>
- couchroot porting guide: <https://github.com/splitcipher/couchroot/blob/main/docs/guides/porting-to-a-new-tv.md>
- couchroot S90D boot/recovery (historical correction): <https://github.com/splitcipher/couchroot/blob/main/docs/guides/s90d-boot-recovery.md>
- couchroot issue 40 (cold boot, recovery floor): <https://github.com/splitcipher/couchroot/issues/40>
- Kurumi S90D toolkit, `tools/home.py` and `tools/home-route/Program.cs`: <https://github.com/IgorRichard13/kurumi-s90d-toolkit>
- samsung-tv-root, compatibility table (SVE-2025-50109): <https://github.com/chris-ritsen/samsung-tv-root>
- In-repo: `docs/agent-tv-setup-guide.md` stages 6-8, `docs/tv-status.md`, `docs/compatibility.md`,
  `docs/home-redesign.md`, `scripts/native-home/README.md`
