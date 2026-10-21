# FrameOS TV deployment

The current [v0.4 packaging policy and handoff](V0.4.md) add native thumbnail creation and local-video CSP declarations only in the fresh packaging copy. The working `revilodev-frameos` author profile and source app identity are preserved. Installation requires user approval.

Use a normal PowerShell session; Administrator permissions are not required.

```powershell
Set-Location 'C:\Users\revil\StudioProjects\frameos\Project-FrameOS'
npm run check:tv
npm run stage:tv
# Only when you intend to update the physical TV:
npm run deploy:tv
```

## Command behavior

| Command | Behavior |
| --- | --- |
| `npm run check:tv` | Checks SDK tools, metadata, certificate availability and author continuity against the known-good WGT, then the exact SDB serial/model. Does not stage or install. |
| `npm run stage:tv` | Builds with the existing Chromium 69 configuration, validates referenced production files, verifies/creates the original backup, and stages required frontend files. No signing, TV connection or installation required. |
| `npm run deploy:tv` | Checks prerequisites and the TV; builds/stages; creates a fresh local packaging copy; builds/signs/verifies the WGT; rechecks the TV/manifest; installs and launches. Stops on the first failure. |
| `node scripts/tv.mjs package` | Builds/signs/verifies in a fresh local copy without staging or changing any original Tizen project file. Never installs/launches or requires a TV connection. |

`scripts/tv.config.json` explicitly selects:

- Existing project: `C:\Users\revil\workspace\frameos`
- SDK: `C:\samsungdev\tizen-studio`
- SDB: `C:\samsungdev\tizen-studio\tools\sdb.exe`
- CLI: `C:\samsungdev\tizen-studio\tools\ide\bin\tizen.bat`
- Serial: `192.168.0.23:26101`; expected model: `QA32LS03TBWXXY`
- Signing profile: `revilodev-frameos`
- Reference package: the original `frameos.wgt` in the existing project
- Pinned author SHA-256: `52abc2ad0bbfa4e2aea4a9effd08efa7e4f535a8b23ec7ebcff45fa425ddcc6c`

The existing manifest supplies application `TdjFk7yyVS.frameos`, package `TdjFk7yyVS`, widget version `1.0.0` and entry `index.html`. These values are read from XML rather than guessed or rewritten. The protected source manifest, icon, signing configuration and unrelated resources are preserved. A different content entry is rejected rather than changing `config.xml`.

For frontend v0.3, `scripts/tv.config.json` selects the reviewed [packaging policy](../tizen/README.md). Only the fresh local packaging copy receives read-only USB privileges (`filesystem.read`, `externalstorage`), `internet`, indexed-thumbnail `content.read`, media-key `tv.inputdevice`, the single Open-Meteo API access origin and a narrow CSP. Review the [exact XML diff](../tizen/config.xml.v0.3.diff) and [v0.3 handoff](V0.3.md). The original manifest must match its pinned SHA-256, and none of its existing bytes or metadata are rewritten. No filesystem/content write or geolocation permission is requested. Native storage-listener APIs can require write permission; the adapter falls back to active Media Hub/player discovery when the listener is blocked. The production HTML also loads the exact documented TV-local Samsung SDK script for AVPlay; this runtime resource is narrowly exempted from packaged file checks.

The author in the original signed WGT and original `.sign/author-signature.xml` matches the existing `revilodev-frameos` profile. The profile named `frameos` uses a different author and caused TV error `118, -11: Author certificate not match`. Signing now explicitly uses `-s revilodev-frameos`; the global active profile is not switched, and no profiles, keys or certificates are modified.

Before building/signing, `check:tv`, `deploy:tv` and the local package operation compare the selected profile's public author `.crt` and original WGT author against the pinned SHA-256 fingerprint. The newly signed WGT's embedded author is checked again before installation, catching a stale public sidecar or changed signing profile. A mismatch stops the pipeline; it never uninstalls the existing app or changes identity to bypass the check. These comparisons use public certificates only. Signer diagnostics remain suppressed to avoid exposing credentials.

## Backup, ownership and repeat runs

Before the first frontend change, every original project file is copied to a fresh **`artifacts/tv/backups/original-<uuid>/`** folder in the React repository. SHA-256 verification completes before staging starts. `artifacts/tv/original.json` records the original snapshot. Backup files are never overwritten/pruned and are reverified on every run. Backups include the original WGT and signing configuration and remain outside the packaged application.

`artifacts/tv/managed.json` records exact paths and hashes of frontend files owned by successful stages. Only `index.html`, `assets/` and `wallpapers/` can be managed. Unreferenced source artwork is not copied. Repeating an unchanged build reports zero changed/deleted files. No directory is recursively deleted from the Tizen project: stale files are unlinked individually only if owned by a prior stage and still matching the recorded hash.

Unrelated collisions, edited managed files, damaged/missing backups, unsafe paths, links/junctions and concurrent runs stop staging. Writes use temporary files and atomic replacement. Pre-change copies under `artifacts/tv/runs/` allow automatic rollback when a stage fails. Interrupted or incomplete recovery leaves `pending.json` and blocks further staging for review.

**Keep `artifacts/tv/` between deployments.** It holds the original backup, ownership records, recovery copies and signed packages. Do not move it into the application or commit it. It is ignored by Git, as are signing directories and certificate/private-key extensions. The legacy `stage:tizen` command remains a separate read-only scratch-copy workflow.

## Packaging and installation

The SDK builds a fresh copy under `artifacts/tv/packages/`, preserving application resources while excluding old WGTs, signing directories, private certificates and prior build outputs. No SDK build output is written into the original Tizen project. The CLI operations are:

```text
tizen build-web -- <fresh-project-copy>
tizen package -t wgt -s revilodev-frameos -- <fresh-project-copy>\.buildResult
```

The WGT ZIP must contain both author/distributor signatures, the pinned matching author certificate, the exact expected **patched packaging manifest**, byte-identical resources and verified frontend hashes. The protected source manifest is independently checked against its unchanged original hash. Each package directory includes `manifest-policy.json` recording both hashes. Duplicate/unsafe entries, nested WGTs and included private signing material are rejected. These checks establish packaging integrity and author continuity; the TV still validates certificate trust and device installation permissions.

Immediately before installing, the exact SDB serial must still be in `device` state with the expected model, and the original manifest must still match. Then:

```text
tizen install -s 192.168.0.23:26101 -n <new-wgt-name> -- <new-wgt-folder>
tizen run -s 192.168.0.23:26101 -p <application-id-read-from-config.xml>
```

No uninstall, automatic startup, firmware or system-setting operations are performed. Build, signing, verification, connection, installation and launch errors produce a nonzero exit status and stop subsequent steps. If installation succeeds but launch fails, the newly installed app remains on the TV; there is no automatic TV rollback.

The existing Vite compatibility settings remain: relative paths, classic/SystemJS scripts, removal of local-script CORS attributes, and Chromium 69 compatible CSS. Samsung requires updates to use the same author certificate as the original. References: [Samsung signing continuity](https://developer.samsung.com/smarttv/develop/getting-started/quick-start-guide.html), [Vite 6 compatibility](https://v6.vite.dev/guide/build), [Samsung SDK commands](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/command-line-interface.html).

## Validate without installing

```powershell
npm test
npm run build
npm run test:e2e
npm run check:tv
npm run stage:tv
npm run stage:tv  # Should report zero changes for the same build
node scripts/tv.mjs package  # Local signing/archive verification; external project unchanged
```

On a new machine, install the test browser with `npx playwright install chromium`. Pipeline tests use isolated ignored fixtures and simulated SDK operations; they never deploy to the TV. They exercise backups, repeated staging, stale cleanup, collision/edit refusal, partial-failure rollback, locking, and stopping at each failure. Browser tests include direct production `file:` loading without security overrides.

## Connection and recovery

If the TV is disconnected, reconnect with the working SDB and retry:

```powershell
& 'C:\samsungdev\tizen-studio\tools\sdb.exe' connect '192.168.0.23:26101'
npm run check:tv
```

The pipeline never changes authorization or certificate profiles to bypass a failure. Inspect missing/expired certificates in the existing profile through Certificate Manager; do not generate replacement identities.

If `deploy.lock` remains, inspect its recorded PID and confirm the process has stopped before removing only that lock file. If `pending.json` exists, inspect its recovery directory and listed changed/removed paths, then restore only affected frontend files from the pre-stage copies. Resolve concurrent manual edits before clearing the pending record. Preserve the original backup, `original.json` and `managed.json`. Missing/damaged original backups must be restored before further staging.

The known-good original signed WGT remains at `C:\Users\revil\workspace\frameos\frameos.wgt` and in the immutable backup. A verified v0.1 rollback WGT is also preserved at `artifacts/releases/v0.1/frameos-v0.1.wgt`, accompanied by its release record and expected file hashes. Its SHA-256 is `479b713bb67ff8940dabd2e0f6c4cab9a8dca64eeb42a05a18bc600093f7a70a`. Keep the rollback directory. Reinstalling either package is a separate, explicitly approved TV action; no automatic rollback is performed.

The first user-run installation was rejected because the old configured author did not match the installed app. It was not uninstalled or replaced. After correcting the selected existing profile and validating locally, run `npm run deploy:tv` again from this repository to retry the update. The obsolete `C:\samsungdev\frameos-ui` path does not exist and is not needed.
