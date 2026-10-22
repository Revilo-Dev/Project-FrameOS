# Native Home experiment — phase 1 implementation results

22 October 2026. Exact target: QA32LS03TBWXXY, owner-reported firmware T-KSU2FUABC-2743.0, Tizen 5.5, ARMv7; app `TdjFk7yyVS.frameos`, package `TdjFk7yyVS`.

**Direct launch works. The Windows manual controller and PC recovery framework are implemented. Native assignment and independent live restoration remain blocked by unavailable permitted native inspection. No Home-only trial is executable or approved.** This report records new implementation and test evidence; it does not repeat the earlier general audit.

## One physical launch, separately confirmed

The owner first confirmed Samsung Home was visible and they were watching. Exactly one command was sent through the official CLI:

```text
C:\samsungdev\tizen-studio\tools\ide\bin\tizen.bat run -s 192.168.0.23:26101 -p TdjFk7yyVS.frameos
```

- Software evidence: exact serial/model matched; CLI exit 0, “Tizen application is successfully launched,” PID 2379.
- Physical evidence: the owner replied **“FrameOS appeared and is usable.”** This establishes an observed return from Samsung Home, not merely an SDK acknowledgement.
- `artifacts/native-home-phase1/launch-test.json` records the command, result, starting-screen readiness and separate owner observation. Its launch intent was saved before sending; no second launch was sent.

The owner also reports recent deployment, overnight retention, Samsung Home escape and FrameOS preference recovery working, with identity/signing preserved. These are owner observations, not native routing/restore evidence. The installed binary's exact release SHA was not re-established during this task.

## Implemented tools

| Location | Implemented behavior |
| --- | --- |
| `scripts/frameos-controller/FrameOS-Controller.ps1` | Standalone Windows console menu: Status, Manual Launch Once and Connection Diagnostics. No scheduler, service, power/key commands or foreground enforcement. |
| `scripts/frameos-controller/controller.mjs` | Supported SDK launch with the full app ID; exact model/platform checks; 8/10/20-second deadlines; durable launch intent; concurrency lock; readable per-launch logs; no fallback transport or automatic retry. Status explicitly leaves foreground/running/installed identity unknown. |
| `scripts/native-home/spec.mjs` | Exact field/type and library/export inventory from the pinned reference query/control sources. No foreign firmware guard was removed or helper copied/executed. |
| `scripts/native-home/cli.mjs` | Permitted SDB inventory/capability inspection, offline baseline validation/copying and nonexecuting restore-plan generation. `apply` and `restore` reject before any TV command. No dynamic transport loader or native-write flag exists. |
| `scripts/native-home/recovery.mjs` | Strict typed snapshots, SHA-256 envelopes, two exclusive/readback-verified PC copies, firmware/model/app guards and a mock-only Home restoration engine. Partial/missing reads, corrupt copies, changed firmware or unexpected native values stop it. |

Open the controller for later deliberate use:

```powershell
& '.\scripts\frameos-controller\FrameOS-Controller.ps1'
```

**Do not repeat the physical launch to validate this utility in the current task; the single permitted test has been used.** Its implementation was tested with mocks. CLI usage, timeouts, lock handling and limitations are in [the controller README](../scripts/frameos-controller/README.md). The full recovery data contract and blocked commands are in [the recovery README](../scripts/native-home/README.md).

## Exact native results

Fresh SDB capability evidence reconfirms `platform_version:5.5`, `cpu_arch:armv7`, `intershell_support:disabled` and disabled root access. No root operation was attempted. `netcoredbg_support:enabled` does not identify the installed runtime.

A single standard SDB pull of the required-library candidate `/usr/lib/libaul.so.0` failed with exit 1, **“You cannot pull files from this path.”** No ELF bytes or exports were obtained. The prior permitted `/etc/prd_info.ini` and OS-file pulls were also refused; earlier ordinary shell reads had no useful output. No protected-file retry, arbitrary shell workaround or command injection was used. A denied path does not establish whether a library is absent or whether the same ABI exists elsewhere.

| Native item | Result on this device |
| --- | --- |
| Main app-control operation owner | Unread/unverified |
| `db/appfw/home_appid` | Unread/unverified; working `com.samsung.tv.csfs` escape is not a value query |
| `db/appfw/startup_appid` | Unread/unverified |
| `db/appfw/booting_appid_backup` | Unread/unverified |
| `db/first_screen/type` | Unread/unverified |
| Integer `db/menu/smart_hub/ontvsetting/auto_start` | Unread/unverified; no assumed 0/1 default |
| FrameOS web-app boot eligibility | Unverified; native eligibility call could not be established |
| Required AUL/vconf/app-operation/context-manager libraries and exports | None confirmed through the permitted inspection path |
| Actual native runtime, process bitness, UID and ABI/permissions | Unverified; matching ARMv7 alone is insufficient |

The reference API dependencies are enumerated in `spec.mjs`: bundle/AUL default-main query, vconf typed getters/setters, web-app boot eligibility and the app-operation setter. [arn0 query source](https://github.com/NelsonEU/arn0-tv/blob/28b0f4d4a2e59ded29b5bf93a8eab99c802c7483/native/Query.cs), [CleanFrame control source](https://github.com/nthnclrk/CleanFrame/blob/fa537d1892b71d2de2bf94c24cbff3812e9f70d5/scripts/native-home/Control.cs). These identify what needs verification; they do not establish exports on this TV. No native helper was created before runtime/ABI verification.

## Recovery outcome and copies

**Independent native recovery is not currently viable as a verified procedure.** There is no reliable original-value baseline or permitted live reader/writer. The PC framework is independent of the FrameOS process, and mock restoration works with FrameOS absent and current boot eligibility unavailable. Physical restoration with FrameOS closed or missing has not been demonstrated.

The restore planner permits only original/FrameOS main/Home values and preserves startup fields. It refuses unexpected startup drift; it does not blindly write those values back. A future recovery implementation must establish how to recover any actual platform side effects before a trial can proceed. The current mock engine is not a complete live startup-repair tool.

Two readback/SHA-256 verified copies of the **inspection dossier** were saved on the PC, one in `artifacts/native-home-phase1/inspection.json`, one outside the repository under `C:\Users\revil\FrameOS-Recovery\QA32LS03TBWXXY\T-KSU2FUABC-2743.0\`. Exact paths/hashes are in `inspection-copies.json`. The final evidence bundle additionally includes the owner-confirmed launch and fresh library-pull refusal; its two copy paths/hashes are in `evidence-copies.json`.

**These are evidence copies, not original-setting backups.** Unknown native values remain null/unread. The baseline serializer refuses to turn those into a usable baseline. Future two-copy capture support is implemented but cannot be exercised with genuine original values until a permitted reader exists. Two files on this PC do not by themselves provide independent-disk protection; keep an additional offline copy before any later native experiment.

## Verification

- **25 new tool tests passed**, zero failed/skipped: exact target/full ID; one launch per action; explicit connect; deadline termination; concurrent/uncertain launch locks; incomplete/ambiguous reads; typed values; corruption, partial copies and hard-link rejection; missing FrameOS; changed firmware; stable device binding; partial restoration; journal failure; stalled operations; failed readback; production-write rejection.
- **178 existing unit/integration regressions passed**, zero failed/skipped. FrameOS app source and existing changed/untracked work were preserved; the 63-file pre-task checkpoint is in `artifacts/native-home-phase1/source-checkpoint/`.
- Node and PowerShell syntax checks passed. The menu/launch was not run again. No new application build, signing, installation, uninstall, native helper upload, Art change, reboot or power cycle occurred.
- Logs: `tools-tests.log`, `regression-tests.log`, `launch-test.json`, `capability.json`, `native-library-pull.json`, `inspection.json` under `artifacts/native-home-phase1/`.

## Gate for an authorised Home-only trial

Phase D remains blocked. All of the following are prerequisites, not optional flags to bypass:

1. A permitted native inspection route, stable physical-device fingerprint and reliable live exact-model/firmware identity check that work independently of FrameOS. An IP/model or owner-reported firmware match alone is insufficient for native recovery. Current protected access cannot be bypassed with an undocumented runner.
2. Actual runtime/ABI, bitness, symbols and SDK-user permission verification before creating any helper.
3. Complete trusted original typed main/Home/startup/boot-backup/first-screen/autostart readings, with missing-key/error handling resolved and two verified off-TV copies. No defaults from `com.samsung.tv.csfs` presence or another TV.
4. A positive native boot-eligibility result for `TdjFk7yyVS.frameos`.
5. A reviewed independent restore transport and separately approved restoration validation while FrameOS is closed, with exact-value readback and physical Samsung Home observation. Its operation must not require FrameOS's package; effects/recovery if the package is unavailable must be established without uninstalling it in this phase.
6. A separate Home-only proposal that limits intended writes to main-operation/Home ID, verifies startup values remain unchanged after every step, preserves native Art and Samsung Home access, and has verified failure restoration. Then obtain explicit approval for those exact native writes.

No live trial/apply/restore procedure has been prepared because the prerequisite evidence is absent. All native Home and startup settings remain unchanged.
