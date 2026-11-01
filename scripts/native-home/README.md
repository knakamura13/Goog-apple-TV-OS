# Native Home control

This one-shot development helper changes the native Home assignment on one TV at a time. It does not run inside CleanFrame or remain active on the TV. It uses the existing SDB developer connection and the published package-name command workaround to execute as SDK UID 901. It does not request root or change security policy.

`Control.cs` exposes read-only query, guarded apply and exact-value restore through native Home and vconf APIs. Every TV needs its own profile; tracked source contains no device address, device identifier, baseline or compiled binary. This repository's docs name the target model and application; the private profile holds the exact firmware string.

## Per-TV profile

Copy `profile.example.json` to `.local/native-home/profile.json` (ignored) and fill it from your own readings:

| Field | Where it comes from |
| --- | --- |
| `model` | Both identity sources must match: the public device API `modelName` and `Model=` in `/etc/prd_info.ini`, which `query` prints as `PROFILE_MODEL`. `apply` and `restore` refuse either mismatch; a read-only `query` warns instead so the dispute can be seen. |
| `version` | The exact value `run.py query` prints as `PROFILE_VERSION`. A trailing `;` is ignored. |
| `app_id` | Your installed launcher's SDK-generated application id. |

`query` tolerates an empty `version`, so a new TV can be surveyed before its firmware string is pinned. `apply` and `restore` refuse an empty or mismatched `version` or `model`.

## Commands

From the project root:

```sh
python3 scripts/native-home/run.py inspect   # read-only environment survey
python3 scripts/native-home/run.py query     # read-only values; saves .local/native-home/query.json
python3 scripts/native-home/run.py apply
python3 scripts/native-home/run.py restore
```

`apply` writes only the native `main` Home operation, `db/appfw/home_appid` and `db/menu/smart_hub/ontvsetting/auto_start=1`. The firmware derives `startup_appid` and `booting_appid_backup`, and `db/first_screen/type` stays Samsung Home. The helper still captures all five typed values plus the operation and restores them. Restore verifies every value except the two the firmware re-derives, which are printed as `CLEANFRAME_HOME_RESTORE_PENDING` for a post-reboot check. That write set matches the published S90D work; writing `startup_appid` directly did not establish startup and was reverted by the firmware.

Before `apply`, copy `query.json` to `original.json` once, after reviewing it. The runner only reads `original.json` and never writes it. A baseline that names the launcher in the native operation or in `home_appid`, or that pairs `auto_start=1` with a derived `startup_appid` on the launcher, is rejected, because restoring it would silently change nothing or re-apply part of the applied state. That check only recognises this profile's app id, so a baseline captured after apply under a *different* app id, with no provenance fields, is not detected; review old baselines by hand. A baseline whose provenance names another model or app is rejected too, so two TVs' recovery files cannot be swapped by mistake. Baselines from the earlier build carry no provenance and still load; restore then checks live state before writing, holds the hard gate on the three values apply writes, and notes the firmware-owned keys instead.

## Guarded behaviour

Apply refuses a non-32-bit runtime, any UID other than 901, a model or firmware mismatch, a missing or empty setting, a configuration that changed since the snapshot, a missing `/opt/usr/apps/<package>` directory, or a launcher the firmware does not report as boot-eligible. Each write is read back through the same native API, and the three applied values are re-read and asserted. A failed apply writes the three original values back; if that also fails, the error names both failures. Reapply needs a successful restore first.

Restore writes every captured value back, refuses live state the baseline does not explain for the three values apply writes, and verifies every value except the two the firmware re-derives. It is firmware-guarded too: after a firmware change, run `query` (read-only) and re-pin `version` before restoring.

## Transport and recovery

One invocation performs one package-manager injection. On S90D-family firmware `sdbd` and the package manager can stay busy for minutes afterwards, so wait before the next command and do not loop a failed run. The TV connects back to this computer over TCP, so a local firewall must allow it.

Even query and inspect stage temporary files on the device. A clone without the private profile, baseline, SDK and compiled output cannot perform the rollback that was tested on the reference Frame. Keep the recovery folder outside the project as well: GitHub is a source backup only.

## Pins, limits and stop conditions

This method pins no firmware binary hashes or offsets. The transport is a shell injection, and the helper binds exported library functions by name. The pins that matter are the exact firmware string, the settings above, and the presence of `/usr/bin/dotnet` plus `libbundle`, `libaul`, `libapp-context-manager-common`, `libcapi-appfw-app-operation-tv` and `libvconf`. `inspect` reports them; confirm before apply.

Never use `vconftool set` on these keys: it corrupted the Home key's privilege fields on S90D 2130 and needed root to repair. `inspect` keeps `vconftool get` only as a read-only fallback.

Stop and report rather than working around a guard if the model or firmware differs, the boot-eligibility probe disagrees, the runtime or a library is missing, recovery cannot be made exact-value reversible, or a repair would need root beyond UID 901, a security-policy change, a firmware downgrade or a disabled compatibility check.

Per-TV results, the untested parts (65-inch variants, cold mains power-on) and the full procedure are in [the S90D preparation note](../../docs/native-home-s90d.md) and [compatibility evidence](../../docs/compatibility.md).

## Build

The implementation was reviewed against the [published S90D native Home work](https://github.com/splitcipher/couchroot/blob/83906b468836869933012da03a4018fb339462b3/docs/devices/s90d/README.md). Source review does not replace device testing after future firmware changes.

Rebuild with the private verified SDK when `Control.cs` changes, then stamp the reviewed source:

```sh
DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 DOTNET_CLI_HOME="$PWD/.local/native-home/cli" .local/native-home/dotnet-sdk/dotnet build scripts/native-home/Control.csproj -c Release --nologo -p:BaseIntermediateOutputPath="$PWD/.local/native-home/obj/" -o .local/native-home/out && shasum -a 256 scripts/native-home/Control.cs > .local/native-home/out/CONTROL_SHA256
```

Keep the two steps chained, or a stamp written without a rebuild would certify a stale helper. `run.py` compares that stamp with `Control.cs`: a missing stamp or a mismatch stops `apply` and `restore` before anything is staged, so a helper built from an unstamped `Control.cs` cannot reach the TV in a writing mode, and `query` warns and continues, because it writes no settings. A missing `Control.cs` stops every mode that stages the helper, since the build cannot be reviewed at all. `inspect` never loads the helper.

The helper's output is not packaged inside the web app. Keep the original values, compiler, runtime output and all device diagnostics ignored. No local address, device identifier, compiled binary or signing secret belongs in this source folder.
