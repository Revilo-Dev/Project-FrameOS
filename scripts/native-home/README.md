# Native Home compatibility and recovery framework — phase 1

This is PC-side inspection, baseline validation, duplicate-copy verification, nonexecuting restore planning and a mock-only restore engine. **No live native reader/writer, helper binary or apply/restore transport is registered.** It cannot change the TV's Home/startup configuration. Do not interpret passing local tests as physical recovery verification.

## Current device result

The owner's TV still reports Tizen 5.5/ARMv7 and `intershell_support:disabled`. Prior ordinary shell queries produced empty output; protected firmware/OS pulls were refused. No permitted path to inspect the native runtime, exported symbols or configuration was established. Those restrictions are recorded as blockers, not bypassed. No native helper was created. Opening Samsung Home from FrameOS and successful SDK launch do not read or restore the native Home assignment.

Read-only inspection uses only the same SDB inventory/capability diagnostics as the manual controller:

```powershell
node scripts/native-home/cli.mjs inspect
```

It never attempts arbitrary shell commands, file pulls, native calls or uploads. It records each unread native setting as `state: unread`, `value: null`, each export as unverified and boot eligibility as unverified. This output is an **inspection dossier**, not a usable original-value baseline.

`spec.mjs` lists the six routing/preference fields and separate boot eligibility call actually used by the reviewed reference sources. Native APIs/libraries remain unconfirmed on this TV. The reference .NET targets, UID assumptions and firmware guards are preserved as research facts; nothing from either repository is executed or has its guard weakened.

## Baseline framework

`recovery.mjs` accepts complete typed `frameos.native-home.snapshot` records. It validates the exact serial/model/firmware/platform/architecture/application identity, a matching stable device fingerprint, a permitted device firmware reading, all field names, read states, integer/string types, capture metadata and schema version. An IP/model match or owner-entered firmware is insufficient for native recovery. It does not fill missing keys or substitute installed Samsung Home as the original operation owner. An absent/failed/ambiguous read is retained in an inspection record, but cannot become a restore baseline in this implementation. Empty *successfully read* startup strings are preserved exactly.

The state includes:

- Main app-control operation owner and `db/appfw/home_appid`.
- `db/appfw/startup_appid`, `db/appfw/booting_appid_backup`, `db/first_screen/type` as strings.
- `db/menu/smart_hub/ontvsetting/auto_start` as a typed integer.
- FrameOS boot-eligibility status separately; no manifest flag is substituted for this native result.

There is no real original-value baseline for this device yet. Test fixtures are explicitly `kind: mock` and use invented `mock.original.Home` values, never another TV's Samsung defaults. Production CLI baseline commands reject mock records.

If a later approved, permitted reader produces reliable device data, the offline commands are:

```powershell
node scripts/native-home/cli.mjs verify-baseline <envelope.json>
node scripts/native-home/cli.mjs save-baseline <captured-snapshot.json> <absolute-primary-path> <absolute-second-path>
node scripts/native-home/cli.mjs restore-plan <primary-envelope.json> <second-envelope.json> <fresh-current-snapshot.json>
```

Create two distinct PC directories first, preferably with the second outside the repository and on independent backup storage. New copies use exclusive creation, disk sync, SHA-256 envelopes and complete readback. Existing files are never overwritten. Same-directory aliases, symlinks, hard links, mismatched checksums and incomplete copies are rejected. If the second write fails, the first is retained, and no verified pair is claimed. Use fresh paths after investigation rather than overwriting originals.

A checksum protects against accidental corruption; importing a JSON file does not authenticate its device provenance or prove its values are true. A future reviewed reader must establish the raw capture's origin, runtime/ABI and permissions before a baseline can authorize anything. These tools never convert imported metadata claims into live native-write capability.

## Guarded restoration logic

The offline restore planner requires matching complete snapshots, verified runtime/ABI metadata and unchanged startup fields. It allows only an original Home value or FrameOS as the current main/Home values; an unrelated owner causes a stop. It plans only necessary main/Home restoration steps and **zero startup writes**. It never calls FrameOS, requires its process/package, or launches Samsung Home as a substitute for restoring native ownership.

`simulateRestore()` exercises that logic exclusively with a mock transport. Each operation is bounded, its intent is journaled before writing, identity/state are checked again, and typed readback is verified. Interruption, journal failure, changed firmware or unexpected side effects stop without replay. An unconfirmed write remains uncertain and requires a fresh inspection. Mock tests include restoration with FrameOS absent and boot eligibility unavailable.

There is deliberately no live backend or dynamic adapter loader. `cli.mjs restore` and `apply` reject before any TV command regardless of flags. No command can enable a native write. A mock engine that restores its in-memory fixture is **not** an independently verified recovery route for the physical TV.

Run the meaningful local failure scenarios:

```powershell
node --test scripts/frameos-controller/controller.test.mjs scripts/native-home/recovery.test.mjs
```

## Required before a Home-only trial

1. A reviewed, permitted reader for this exact firmware, usable outside FrameOS, and reliable live device/firmware identity checks.
2. Verified actual runtime, bitness, ABI, native library exports and access permissions **before** creating a helper.
3. A complete trusted original main/Home/startup/first-screen/autostart capture and two verified PC copies. No missing-key guesses.
4. A real boot-eligibility result for `TdjFk7yyVS.frameos`.
5. A reviewed independent restore transport that works with FrameOS closed and does not need its package. Physically verified exact-value restore/readback and Samsung Home recovery, bound to this baseline and firmware. Such a native write also needs its own explicit approval.
6. A separate Home-only experiment proposal, with only main-operation/Home-ID writes, unchanged startup fields verified after each step, Samsung Home accessible, native Art preserved, failure restoration and explicit approval before writing.

These prerequisites are unmet, so phase 1 does **not** produce a runnable Home-only trial. An SDK launch, SDB connection, FrameOS Settings escape or local preference recovery cannot clear these gates.

Targeted reference source: [arn0 query](https://github.com/NelsonEU/arn0-tv/blob/28b0f4d4a2e59ded29b5bf93a8eab99c802c7483/native/Query.cs), [arn0 control](https://github.com/NelsonEU/arn0-tv/blob/28b0f4d4a2e59ded29b5bf93a8eab99c802c7483/native/Control.cs), [CleanFrame control](https://github.com/nthnclrk/CleanFrame/blob/fa537d1892b71d2de2bf94c24cbff3812e9f70d5/scripts/native-home/Control.cs). API names/behavior were studied; no reference helper implementation or UI was copied.
