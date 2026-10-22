# Launcher acceptance candidate — approval checkpoint

Prepared locally on 22 October 2026 against [LAUNCHER-AUDIT.md](LAUNCHER-AUDIT.md) and [LAUNCHER-TV-TESTS.md](LAUNCHER-TV-TESTS.md). Those documents remain the acceptance baseline. This document adds the exact package, test sequence, failure handling and rollback instructions.

**Status: local preparation passed; physical-TV approval pending.** No SDB command, TV query, installation, application launch, physical test or power action was performed in this preparation. No app source, application identity, certificate/profile, signing workflow, native Home/startup preference or native Art Mode configuration was changed.

## Candidate and prior package

Release directory: `C:\Users\revil\StudioProjects\frameos\Project-FrameOS\artifacts\releases\v0.3.8.1-launcher-rc1`.

| Item | New candidate | Previous signed release |
| --- | --- | --- |
| Release label | `v0.3.8.1-launcher-rc1` | `v0.3.8.1` |
| File | `frameos-v0.3.8.1-launcher-rc1.wgt` | `rollback\frameos-v0.3.8.1.wgt` |
| Size | 16,404,865 bytes | 16,397,417 bytes |
| SHA-256 | `a1f38504cb4c7a0b9ead2743e52410cf10572bd639b61eddfef4f6f479c7eda0` | `7b9cb4fcbea7fbea00b0cb73f863e69c4a4d52b933295864a88dc0e28031ce73` |
| Frontend package version | `0.3.8-1` | `0.3.8-1` |
| Embedded widget version | `1.0.0` | `1.0.0` |
| Application / package | `TdjFk7yyVS.frameos` / `TdjFk7yyVS` | Same |
| Signing profile | `revilodev-frameos` | Same |
| Physical acceptance | Not run | Not recorded for this prior candidate either |

The release suffix is an artifact label, not an invented embedded version increment. The protected manifest is byte-identical to the prior package: SHA-256 `199b7ff2beb2f8db5fd62fcfda8b6fab8ac2dc33cf84384b858dc625561f0f9d`. App permissions and startup metadata therefore did not change. Equal-version in-place update acceptance remains a TV installer check; stop on rejection instead of editing the pinned manifest or uninstalling.

Compared with the prior package, the candidate adds the audited Settings escape, app pinning, focus recovery, performance capture, preference backup/migrations and launch diagnostics. It is 7,448 bytes larger. Changed archive content is limited to the application/polyfill bundles, their `index.html` references and signatures. Wallpaper/font/icon resources and the manifest are unchanged. `comparison.json` records the exact file delta.

The original reference package is also preserved as `rollback\frameos-original-reference.wgt`: 41,944 bytes, SHA-256 `9113a8a3ac8763d9c3195856d49e2b7c59a37bb3c0e122c2de595cc19432ecf4`. It is a legacy recovery reference with fewer features. Its historical role does not prove it matches the currently installed payload. Do not select it silently if the primary rollback fails.

## Local evidence

| Check | Result |
| --- | --- |
| Working tree/checkpoints | 62 existing modified/untracked files copied with hashes; staged/unstaged patches and status preserved in `source-checkpoint/`. Earlier audit/release checkpoints retained. No reset or commit. |
| App identity | Local source and embedded WGT agree with the supplied app/package IDs. Earlier read-only installed-app evidence agrees. **Current installed identity/version has not been queried**; reconfirm after approval before installation. |
| Profile continuity | Existing author and distributor files available; selected and global active profile remain `revilodev-frameos`. Author SHA-256 matches the original reference: `52abc2ad0bbfa4e2aea4a9effd08efa7e4f535a8b23ec7ebcff45fa425ddcc6c`. |
| Unit/integration regressions | **178 passed**, zero failed/skipped; `unit.log`. SDK deployment tests use fixtures, not the TV. |
| Browser regressions | **87 passed**, zero failed/skipped; `browser.log`. Includes real-shaped native mocks and Media/player/thumbnail/minimal-Art regression cases. |
| Build | Typecheck, classic scripts, ES2019, relative/offline assets and Chrome 69 CSS passed; `build.log`. |
| Existing packaging workflow | `pipeline('package')` from `scripts/tv.mjs`; 156 production files prepared, SDK web build/signing passed, expected manifest/resources verified. No stage/deploy/check mode used. A local execution guard rejected SDB/install/run commands. |
| Archive integrity | 165 file entries; required production/manifest/icon hashes verified, both signatures present, pinned author matched, unsafe/duplicate/private-key entries rejected. |
| Cryptographic signatures | RSA-SHA512 author and distributor SignatureValues, all SHA-512 file references and C14N 1.1 internal properties verified offline. Author covers 163 files; distributor covers 164, including the author signature. Both signer certificates are within their recorded validity periods. |
| Negative checks | Altered content, author signature, internal properties and distributor SignedInfo rejected in temporary test copies; candidate unchanged. Both preserved rollback packages also passed cryptographic verification. |
| External project | Full before/after hash snapshot equal; original `config.xml` remains `df9616f0175d656253ad7f55a534f07f6dca6c8e62be0e5695bd6d15fd54dd78`. |

No local application regression was found. The existing archive verifier checks signature presence, signer identity and expected file hashes; the separate `verify-signatures.py` in the release directory adds cryptographic checks using the SDK's bundled xmllint/OpenSSL. It neither reads private keys nor contacts a service. This offline verification does not establish Samsung certificate-chain/device authorization, successful installation or visible rendering. Those remain physical acceptance items.

## Controlled sequence after explicit approval

Target only: **QA32LS03TBWXXY / T-KSU2FUABC-2743.0 / Tizen 5.5 / ARMv7 / `192.168.0.23:26101`**.

1. Confirm the owner is present to observe the screen and the TV is available for ordinary app testing. Do not interrupt an unattended streaming session. Recheck candidate and rollback hashes locally.
2. Connect using the established SDB path. Confirm this exact serial/model in the device list, read the ordinary capability information, and confirm the current installed FrameOS app/package with the supported SDK installed-app inspector. Use the owner's About-page firmware record if protected files remain unreadable. Stop if identity differs or the normal inspector cannot establish it; no helper/workaround is allowed.
3. Confirm an independent physical-remote route to Samsung Home/apps before updating. Record current appearance/preferences, and save an existing export if available. The prior UI may not have an export function; do not promise a pre-update private-data backup that has not been made.
4. Install **this exact saved WGT**, as an in-place update using the existing CLI/profile. Do not use `npm run deploy:tv`, which would rebuild a different package and combine installation with launch. Do not uninstall. Record installer stdout/exit status and reconfirm the exact installed identity before continuing.
5. After successful installation/identity checks, issue **one initial SDK launch** of `TdjFk7yyVS.frameos`. Wait for the owner's screen observation. A successful SDK response is only command evidence. If FrameOS is not visible, stop; do not repeatedly launch/reinstall.
6. Perform the checklist below in order. After an external app opens, the owner returns through Samsung's app list. These deliberate manual returns are distinct from automatic launch retries. Keep API logs and physical observations separate.
7. Stop the sequence at the first unexpected failure, retain logs and screen notes, and decide on recovery. Rollback is manual and requires approval for that installation; it is not an automatic retry. Retention is observed during later ordinary owner standby use, with no scripted power operation.

The release's `physical-results.json` starts with every API result, screen observation and verdict unset. Log time, candidate SHA, action/ID, software response, exact visible result, observer and recovery action. Use “unconfirmed” until an observation exists; do not convert a callback to a pass.

## Concise physical checklist

Every row is **UNVERIFIED**. All apply to this candidate, even where the prior implementation has local tests.

| Test | Expected outcome / evidence to keep | Possible failure | Recovery and stop behavior |
| --- | --- | --- | --- |
| 1. Initial appearance | Actual Home shows seven dock positions, clock/widgets/wallpaper and Media entry. Keep launch response separate from owner's visible confirmation. | Blank/stale layout, clipping, missing controls or no visible app despite SDK success. | Stop. Use physical Home/apps; retain screenshot/description. If needed, approve the prior-WGT rollback below. No relaunch loop. |
| 2. Samsung Home escape | Select Settings → Appearance → Open Samsung Home once. Record `com.samsung.tv.csfs`, API result and actual Samsung Home separately. | Security/NotFound/timeout, wrong screen or FrameOS remains visible. | Stop; use physical Home/apps. Keep diagnostics. Do not guess another system ID or change assignment. |
| 3. Installed apps/pinning | Refresh real catalog; pin one known consumer app, launch once, observe the intended app. Art/Settings remain available. | Missing catalog entry, service listed, wrong ID/app, pin not saved. | Stop launch testing; return manually. Restore selected shortcut from Settings if usable; otherwise retain evidence and approve package rollback. Do not uninstall to create a missing-app case. |
| 4. Focus recovery | Return manually after Samsung Home and one consumer app; remembered Home/Media/Settings focus is visible and D-pad/Back/CH work. | No focus, focus moves to an unrelated control, editor loses focus, repeated app launch. | Physical Home/apps and stop. A single manual reopen may be used only to inspect/recover; no foreground enforcement. Roll back on reproducible navigation regression. |
| 5. Backup/restore | Export text to the PC; review one reversible appearance change, apply it, then restore original export. Save/review/recovery messages agree with actual settings. | TV IME/copy impractical, quota/import error, incomplete rollback, preferences differ after restore. | Stop edits. Keep PC export and app-local recovery text; use recovery copy only after review. Do not clear storage or reinstall as a data-repair shortcut. Older WGT lacks the new import UI; package rollback alone does not restore data. |
| 6. Media folders | Browse root/nested folders and Back; selection, breadcrumb, hidden preferences and grid stay consistent. | Stale/wrong folder, lost selection, slow or failed reads. | Back/Home first; inspect error without rescanning repeatedly. Do not modify USB files. Stop and consider package rollback if regression persists. |
| 7. Thumbnails/player | Inspect actual MP4/MKV images and diagnostics; play/pause/seek/stop/return. Confirm visible image separately from file-resolution success; keep volume Samsung owned. | Placeholder/broken image, decoder error, seek overlap, blank playback or lost return focus. | Stop playback once, then physical Home if needed. Preserve path/codec/diagnostics without editing media. No repeated installs, thumbnail generation or USB writes during acceptance. |
| 8. Minimal Art Mode | Internal FrameOS Art shows the same wallpaper/clock, hides controls and exits on one normal wake input with restored focus. | Extra controls, shifted clock, double entry/exit or native Art unexpectedly invoked. | One Back/direction to recover; otherwise physical Home/apps and stop. Do not adjust native Samsung Art settings or use power as a diagnostic. |
| 9. Performance diagnostics | Three matching six-second captures with recorded wallpaper/motion/widgets/FPS-overlay state; navigate identically after warm-up. Read reports using remote scrolling; background cancels capture. | Empty/misleading samples, capture continues hidden, report inaccessible or obvious lag. | Cancel capture; keep results and stop benchmarking. Do not optimize assets from an unverified capture. rAF callbacks are not presented frames or physical input latency. |
| 10. Ordinary standby retention | During the owner's later normal standby/wake use, FrameOS remains in the app list and saved preferences persist. Record observed TV state/duration; distinguish native Art, standby and actual restart. | App absent, storage lost, unexpected startup destination. | Record once; preserve original system behavior. Return manually if installed. Stop if absent—no automatic reinstall or startup change. No scripted Power, reboot, mains cycle or native Art toggle. |

No test changes Home ownership, startup preferences, firmware/system files or native Art configuration. Native Home feasibility and Windows controllers remain outside this approval request.

## Exact manual rollback — do not execute before approval

Primary target: the **previous locally validated v0.3.8.1 signed WGT**, copied into this release's rollback folder. Its physical reliability and the current installed payload are not proven by local preparation. Reinstalling it is an app rollback; it neither restores Samsung native routing nor guarantees preference restoration.

After an explicitly approved rollback, leave FrameOS/player through the physical Home route if possible. Then run these commands in PowerShell. Each command is one attempt; a nonzero exit, author/identity/version mismatch or missing result means **stop**, not uninstall or retry.

```powershell
Set-Location 'C:\Users\revil\StudioProjects\frameos\Project-FrameOS'
$rollbackDirectory = Join-Path $PWD 'artifacts\releases\v0.3.8.1-launcher-rc1\rollback'
$rollbackPackage = Join-Path $rollbackDirectory 'frameos-v0.3.8.1.wgt'
$rollbackExpectedHash = '7b9cb4fcbea7fbea00b0cb73f863e69c4a4d52b933295864a88dc0e28031ce73'
if ((Get-FileHash -LiteralPath $rollbackPackage -Algorithm SHA256).Hash.ToLowerInvariant() -ne $rollbackExpectedHash) {
    throw 'Rollback hash mismatch; stop.'
}
$rollbackSdb = 'C:\samsungdev\tizen-studio\tools\sdb.exe'
$rollbackTizen = 'C:\samsungdev\tizen-studio\tools\ide\bin\tizen.bat'
$rollbackSerial = '192.168.0.23:26101'
& $rollbackSdb connect $rollbackSerial
if ($LASTEXITCODE -ne 0) { throw 'Connection failed; stop.' }
$rollbackDeviceOutput = & $rollbackSdb devices
if ($LASTEXITCODE -ne 0 -or -not ($rollbackDeviceOutput -match '^192\.168\.0\.23:26101\s+device\s+QA32LS03TBWXXY(?:\s|$)')) {
    throw 'Exact authorized TV not confirmed; stop.'
}
```

**Pause.** Confirm current installed app/package through the supported SDK inspector: `TdjFk7yyVS.frameos` / `TdjFk7yyVS`. Stop if it differs or cannot be confirmed. Then install the preserved WGT directly; do not rebuild, uninstall or change profiles:

```powershell
& $rollbackTizen install -s $rollbackSerial -n 'frameos-v0.3.8.1.wgt' -- $rollbackDirectory
if ($LASTEXITCODE -ne 0) { throw 'Rollback installation failed; stop and retain output.' }
```

**Pause again.** Read the installer completion result and reconfirm installed identity. Stop on any unexpected result even if the exit code was zero. Only after those checks, launch once:

```powershell
& $rollbackTizen run -s $rollbackSerial -p 'TdjFk7yyVS.frameos'
if ($LASTEXITCODE -ne 0) { throw 'Rollback launch failed; stop and retain output.' }
```

The owner must then confirm the actual prior UI and basic navigation on screen. A successful command is insufficient. Keep preference exports; shared preference records retain schema version 1, but older code ignores launcher pins and has no new backup/import control. Do not erase those records. If this rollback is rejected or unusable, stop for a separate decision about the preserved legacy original-reference WGT; never substitute it automatically.

## Approval required

The prepared scope is: connect/query this exact TV; confirm model/platform/current installed identity; install the WGT with SHA-256 `a1f38504cb4c7a0b9ead2743e52410cf10572bd639b61eddfef4f6f479c7eda0` in place; verify installation/identity; launch once; perform ordinary app tests 1–9 with owner observations; and later record owner-initiated standby retention. Stop on unexpected failure. No rollback installation or excluded native/system action is automatic.

**Awaiting the owner's explicit approval. No physical-TV step has started.**
