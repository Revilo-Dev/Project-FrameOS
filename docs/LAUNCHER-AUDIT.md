# FrameOS launcher reliability audit

Assessment date: 22 October 2026. Target: **QA32LS03TBWXXY, T-KSU2FUABC-2743.0, Tizen 5.5, ARMv7**. FrameOS application `TdjFk7yyVS.frameos`, package `TdjFk7yyVS`.

**Normal launcher improvements are implemented locally. Native Home reassignment is not ready for this firmware. A Windows controller that launches this sideloaded app without SDB remains unproven.** No physical-TV connection, query, pairing, deployment, app launch, power operation or native change was performed during this audit. Device facts below use the owner's configuration and the earlier read-only investigation, not fresh measurements.

FrameOS surviving overnight is positive installation-retention evidence. It does not prove cold-boot autostart, but there is no observed removal problem to fix. Automatic reinstallation remains a secondary contingency.

## Reference comparison

Reviewed revisions are pinned so findings do not silently change with repository updates.

| Project / revision | Evidence and useful ideas | Limits for this TV |
| --- | --- | --- |
| [arn0-tv](https://github.com/NelsonEU/arn0-tv/tree/28b0f4d4a2e59ded29b5bf93a8eab99c802c7483) · `28b0f4d` | A launcher with real installed-app discovery, saved preferences and an opt-in rendering probe. Its separate native procedure was tested on a 2022 Q70B, Tizen 6.5, T-PTMDEUC-1720.7. | Home-button success on its reference TV does not establish power-on behavior or compatibility with this 2020 Frame. The native guard rejects this firmware. [Setup evidence](https://github.com/NelsonEU/arn0-tv/blob/28b0f4d4a2e59ded29b5bf93a8eab99c802c7483/docs/setup-tv.md). |
| [CleanFrame](https://github.com/nthnclrk/CleanFrame/tree/fa537d1892b71d2de2bf94c24cbff3812e9f70d5) · `fa537d1` | App editing, public launch calls, pre-rendered materials, bounded catalogs and desktop performance checks. Physical Home from Netflix was observed on QA55LS03DAWXXY, Tizen 9.0, T-PTMDUABC-0090-2130.0. | Its record still lists corrected Samsung Home escape, system Settings, native Art Mode and normal startup as pending physical checks. Its model/firmware differ. [Device record](https://github.com/nthnclrk/CleanFrame/blob/fa537d1892b71d2de2bf94c24cbff3812e9f70d5/docs/tv-status.md). |
| [tvremote-app](https://github.com/sturlese/tvremote-app/tree/7880e2c026c102053ccfbfbf6a05b452fafa310d) · `7880e2c` | Local phone remote targeting 2020 LS03T/token-authenticated TVs. Separates WebSocket keys, REST launch, device information, token storage and session management. | This is a React Native/Expo controller, not a native Home installer. Protocol tests use mocks; its target claim is not proof on this exact firmware. [README](https://github.com/sturlese/tvremote-app/blob/7880e2c026c102053ccfbfbf6a05b452fafa310d/README.md). |

arn0's [app discovery](https://github.com/NelsonEU/arn0-tv/blob/28b0f4d4a2e59ded29b5bf93a8eab99c802c7483/src/js/apps.js) treats consumer apps separately from background components. Its [render probe](https://github.com/NelsonEU/arn0-tv/blob/28b0f4d4a2e59ded29b5bf93a8eab99c802c7483/src/js/render-probe.js) checks actual rendered geometry and bounded callback samples. These are sound ideas for FrameOS; discovery flags remain heuristics, and callback rates alone cannot prove presented frames.

CleanFrame's [device adapter](https://github.com/nthnclrk/CleanFrame/blob/fa537d1892b71d2de2bf94c24cbff3812e9f70d5/app/device.js) separates ordinary app launch, Samsung Home and native Art Mode. Its [UI source](https://github.com/nthnclrk/CleanFrame/blob/fa537d1892b71d2de2bf94c24cbff3812e9f70d5/app/main.js) and [performance checks](https://github.com/nthnclrk/CleanFrame/blob/fa537d1892b71d2de2bf94c24cbff3812e9f70d5/scripts/check-performance.mjs) inform material caching and focus/DOM checks. Desktop CPU throttling is useful for comparison, not a Tizen benchmark.

Licences: [arn0 MIT](https://github.com/NelsonEU/arn0-tv/blob/28b0f4d4a2e59ded29b5bf93a8eab99c802c7483/LICENSE), [CleanFrame MIT](https://github.com/nthnclrk/CleanFrame/blob/fa537d1892b71d2de2bf94c24cbff3812e9f70d5/LICENSE); tvremote-app declares MIT in its README, without a standalone licence file in the reviewed tree. No reference code, UI design, artwork or font was copied. New implementation is original; existing FrameOS asset licences remain in place. Any future copying must preserve the applicable notices and check individual asset terms.

## Safe source improvements

The seven dock positions, Media Hub, player, thumbnails, wallpaper collection and minimal internal Art Mode remain intact. New controls live under **Settings → Appearance → Launcher & recovery**. No dependency, manifest, application identity, certificate, signing profile or deployment-script changes were needed.

| Improvement | Implemented behavior | Main source |
| --- | --- | --- |
| Samsung Home escape | Explicit user selection launches only the previously identified `com.samsung.tv.csfs`. It can be attempted even if a system component is omitted from the public catalog. Permission/launch failure produces a notice. This does not assign Home. | `src/platform/launchTvApp.ts`, `src/screens/LauncherSettings.tsx` |
| Installed-app selector | Reads `getAppsInfo`, handles inherited WebIDL fields, deduplicates actual IDs, excludes FrameOS/Home/Art/Settings and service noise. Six choices per page; replaces one of five ordinary shortcuts. Art/Settings stay available. Refresh and restore-original controls are provided. No fixture catalog in browser preview. | `src/platform/installedApps.ts`, `src/services/launcherPreferences.ts` |
| Focus preservation | Stable dock focus IDs survive pin changes. Resume restores the remembered visible element in the active navigation graph, with a fallback if removed. Active editors keep focus; Art Mode stays under its existing wake handler. There is no foreground-app request. | `src/navigation/useFocusRecovery.ts` |
| Performance capture | Explicit six-second capture, 500 ms warm-up, live UI geometry/runtime/context, frame-interval median/p95/worst, callback FPS, handler timing and input-to-next-callback timing. Samples are bounded; hidden/pagehide/unmount cancels it; no idle measurement loop. | `src/services/uiPerformance.ts` |
| Preference backup/migrations | Versioned, bounded JSON export/review/import; only allowlisted preferences. Backup v1 migrates missing launcher preferences; existing legacy wallpaper/widget migrations run. Unknown backup/section versions are refused. A verified previous-state recovery copy precedes writes; partial failures attempt rollback and report incomplete recovery. | `src/services/preferenceBackup.ts` |
| Launch reliability | Discovery has a four-second deadline, single-flight caching and a 60-second TTL. Pinned IDs are rechecked before launch. A launch has a ten-second deadline, no overlapping request, no retry on permission denial, and ignores late callbacks. An unsent request is cancelled if FrameOS becomes hidden; resume never replays it. | `src/platform/launchTvApp.ts` |
| Diagnostics | Last 20 requests in memory: resolved ID, method, discovery result, error, API acknowledgement and FrameOS visibility observations. Reports have D-pad reachable scroll buttons. An acknowledgement or FrameOS becoming hidden is explicitly **not** proof that the intended app appeared. | `src/platform/LaunchDiagnostics.ts` |

Samsung documents `getAppsInfo` and `launch` as longstanding application APIs. Discovery is a snapshot and launch requires the appropriate privilege; it does not guarantee permission to open every installed system component. The existing approved packaging policy already includes `application.launch`. No new privilege was added. [Samsung Application API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/application-api.html).

Catalog filtering is deliberately conservative, so a genuine app may need a future filter correction after reviewing this TV's returned metadata. A pin is an app ID, never a name-based substitution. Backup text must be saved outside the TV to survive uninstall/storage loss; the local recovery copy shares the app's storage. Neither preference recovery nor the Settings escape is an independent native-system recovery route.

**Asset optimization deferred:** FrameOS already uses preblurred ambient wallpapers. There is no new TV benchmark proving that changing wallpaper/glass assets helps. First compare matching captures on the TV; then trial one material change, measuring focus timing and memory/decoded-image cost with the same scene. Browser measurements cannot justify claiming a TV improvement.

## Tizen 5.5 compatibility matrix

“Verified” states its evidence scope. Locally verified source behavior is not physical-TV acceptance.

| Capability | Classification | Evidence / unresolved point |
| --- | --- | --- |
| Exact model, firmware, Tizen 5.5, ARMv7, app/package identity | Verified device baseline | Owner data plus earlier read-only evidence. Firmware came from the owner's About page; the prior REST value was `Unknown`, and protected firmware-file reads failed. |
| FrameOS installation retained overnight | Verified observation | Owner's new finding; duration and conditions only, not a general persistence guarantee. |
| Consumer-app discovery/launch API family | Plausible on this firmware; implementation locally verified | Public API predates 5.5; real catalog completeness, flags and installed-package privilege behavior need physical testing. |
| Samsung Home component installed | Verified earlier | `com.samsung.tv.csfs`; successful public launch and visible Samsung Home still need acceptance. |
| Current native `main` owner and Home/startup values | Unresolved | Installed component presence does not establish default-operation ownership. No trustworthy native baseline was obtained. |
| Focus, backup, launch failure handling, internal Art Mode regression | Verified locally | Unit/native-shaped browser tests; real remote feel, lifecycle events and Tizen storage quota remain physical tests. |
| Current web build syntax/assets | Verified locally | Classic relative scripts, ES2019 parsing, offline assets and Chrome 69 CSS checks pass. |
| Local token WebSocket keys | Plausible | tvremote-app targets LS03T; exact pairing, TLS and permission persistence untested here. |
| REST/WS launch of `TdjFk7yyVS.frameos` without SDB | Unresolved | Numeric store-app REST IDs in reference code do not establish a mapping or launch path for this sideloaded Tizen ID. |
| Viewing/standby/Art state from connectivity | Unsupported assumption | Reachability, socket connection and installed Art components do not establish screen state. |
| arn0/CleanFrame native helpers unchanged | Incompatible as supplied | Firmware guards reject this device; CleanFrame runner also rejects its model. Their target app IDs belong to their own packages. |
| Native libraries/ABI/SDK-user permissions | Unresolved | Matching ARMv7 is insufficient; symbols and access on 2743.0 are not verified. |
| Native runtime / FrameOS boot eligibility | Unresolved | No runtime or eligibility query established on this TV. A debugger capability does not prove a compatible .NET runtime. |
| Home reassignment implies cold startup / missing-app fallback | Unsupported assumption | Distinct mechanisms; no test proves safe fallback after removal/restart on this firmware. |

Samsung's platform table lists Tizen 5.5 for 2020 and a Tizen .NET v2.1 baseline. arn0's [query project](https://github.com/NelsonEU/arn0-tv/blob/28b0f4d4a2e59ded29b5bf93a8eab99c802c7483/native/Query.csproj) targets `netcoreapp3.1`; CleanFrame's [control project](https://github.com/nthnclrk/CleanFrame/blob/fa537d1892b71d2de2bf94c24cbff3812e9f70d5/scripts/native-home/Control.csproj) targets `net6.0`. This is a compatibility concern, not a measurement of this TV's installed runtime. [Samsung platform specifications](https://developer.samsung.com/smarttv/develop/specifications/general-specifications.html).

## Windows controller feasibility

**No controller prototype was built:** the prerequisite of a supported, verified launch mechanism for FrameOS has not been met. Research used repository code/documentation and existing evidence only. No LAN scan, device-info request, TLS connection, pairing attempt or remote key was sent. Even a GET is active discovery and would require the owner's approval under this task.

| Area | What the reference actually establishes | Windows implications / acceptance gate |
| --- | --- | --- |
| Pairing | WebSocket transport distinguishes TCP/WS open from channel authorization. It handles `ms.channel.unauthorized`, connect/ready messages and tokens. | Owner-approved pairing on a viewing TV; inspect the Allow prompt, denial and timeout. Connect alone must never be reported as ready. |
| Persistence | Tokens are reused on reconnect; the Expo adapter uses OS secure storage. | Use Windows Credential Manager or DPAPI scoped to this user/device; redact tokens and avoid plaintext URL logs. Re-pairing may be required after revocation or TV changes. |
| TLS | Reference notes self-signed TV-certificate/platform limitations. | Validate/pin the approved TV's certificate identity using a narrowly scoped trust decision. Do not disable TLS checks globally. Exact behavior remains untested. |
| App launch | REST adapter POSTs to port 8001 `/api/v2/applications/<id>` and returns `response.ok`. Its catalog uses numeric Samsung app IDs; WebSocket transport sends remote keys. | Neither the Tizen package ID nor numeric store IDs should be guessed as FrameOS's REST ID. REST launch does not visibly verify the result. WS key support does not establish WS app-launch support. |
| State | Device information can identify a responding device. | Track transport, authorization, reported app state and observed screen state separately. Offline can mean standby, disconnected LAN, isolation or refusal. HTTP/WS availability does not prove viewing. |
| Art Mode | The reviewed controller has no verified Art-state implementation. | Treat Art state as unknown. Do not use power toggles or launches as state probes, or wake/leave Art automatically. |
| Network interruption | Transport/session separation is reusable design. | Cancel pending launches on disconnect, bound reconnection, discard old responses, require a new user gesture after recovery. Never replay launch commands or pair on a schedule. |

Sources: [WebSocket transport](https://github.com/sturlese/tvremote-app/blob/7880e2c026c102053ccfbfbf6a05b452fafa310d/src/services/remote/providers/SamsungWebSocketTransport.ts), [REST launcher](https://github.com/sturlese/tvremote-app/blob/7880e2c026c102053ccfbfbf6a05b452fafa310d/src/services/remote/providers/SamsungRestAppLauncher.ts), [app catalog](https://github.com/sturlese/tvremote-app/blob/7880e2c026c102053ccfbfbf6a05b452fafa310d/src/domain/models/SamsungApp.ts), [secure token store](https://github.com/sturlese/tvremote-app/blob/7880e2c026c102053ccfbfbf6a05b452fafa310d/src/repositories/implementations/SecureTokenStore.ts), [device-info client](https://github.com/sturlese/tvremote-app/blob/7880e2c026c102053ccfbfbf6a05b452fafa310d/src/services/remote/providers/SamsungDeviceInfoClient.ts).

One implementation concern for a future port: the WebSocket transport clears its connection deadline on any parsed JSON message, before recognizing a channel event. An unrelated JSON message can leave authorization pending without a pairing deadline. Retain an absolute authorization deadline and test unexpected/late messages rather than copying that behavior.

A future prototype must be **manual Open FrameOS only**, with one launch per deliberate gesture, a visible pending/failed/unconfirmed result, a deadline and no automatic replay. Health checks must never launch apps. No Home/Power key sequence, streaming-app close, periodic foreground enforcement, wake-on-LAN or automatic reinstall is part of the proposal. If reliable app-state evidence is unavailable, require the owner's on-screen confirmation; report “request accepted, display unconfirmed” meanwhile.

After approval, first collect model/capability and documented application information without launching. Identify whether this TV exposes the exact sideloaded app and a usable launch route. Only a separately approved one-shot launch plus actual screen observation can clear the prototype gate. If arbitrary sideloaded launch is unavailable, retain the manual Samsung app-list/SDB workflow rather than inventing repeated key navigation.

## Native Home and startup assessment

The following are different operations: public app launch; default ownership of the `main` app-control operation; Samsung's Home ID; web-app boot eligibility; startup/boot-backup/first-screen preferences; and Smart Hub autostart. A JavaScript Home-key handler or ordinary app manifest does not establish any global reassignment.

arn0's native control queries the default main operation with AUL and changes it through `app_operation_set_current_app`, then writes `home_appid` and the unchanged saved autostart integer. It checks firmware, UID 901 and 32-bit execution; verifies the baseline and readbacks; and attempts restore after partial failure. Its private runner is not supplied as a ready public procedure. Restore remains guarded, so a firmware change can obstruct recovery. [Native control](https://github.com/NelsonEU/arn0-tv/blob/28b0f4d4a2e59ded29b5bf93a8eab99c802c7483/native/Control.cs).

CleanFrame's control changes the main operation, Home ID and autostart to 1. Apply does not directly write the three saved startup/boot-backup/first-screen strings; derived readbacks are not evidence of identical Tizen 5.5 behavior. Its restore reapplies the saved typed baseline. [Native control](https://github.com/nthnclrk/CleanFrame/blob/fa537d1892b71d2de2bf94c24cbff3812e9f70d5/scripts/native-home/Control.cs). Its runner checks the exact other model, uploads files even for query/inspect, and executes through an undocumented install-dispatcher workaround. It is not an ordinary read-only SDB query and was not run. [Runner](https://github.com/nthnclrk/CleanFrame/blob/fa537d1892b71d2de2bf94c24cbff3812e9f70d5/scripts/native-home/run.py).

Dependencies to establish independently include `libbundle.so.0`, `libaul.so.0`, `libapp-context-manager-common.so`, `libcapi-appfw-app-operation-tv.so.0`, `libvconf.so.0`, their exact exports/ABI and SDK-user access. Neither a successful SDB connection nor ARMv7 establishes those. Earlier ordinary shell attempts yielded no trustworthy native output and interactive shell support was disabled. Do not bypass guards or access restrictions to fill that gap.

**Missing FrameOS:** after reassignment, a persistent native target could reference an absent package. Failed Home, failed startup or a Samsung fallback are plausible outcomes; none was observed on this firmware. Neither reference proves a persistent missing-package watchdog. Apply-time rollback does not protect against later removal. Do not uninstall or restart to investigate this risk.

**Native Art Mode, Settings and startup:** existing native Art components and `com.samsung.tv.coba.setting` were recorded as installed. Their operation after native Home changes remains unresolved. Short/long Power, wake from Art, Home while in Art, last-app resume and cold boot may route differently. Internal FrameOS Art Mode remains its wallpaper/clock UI; it does not control native Samsung Art Mode. This audit changed neither system routing nor native Art/startup behavior.

## Recovery and rollback requirements

For the current ordinary app, preserve the pre-audit PC checkpoint at `artifacts/launcher-audit/checkpoint/` and the prior signed release at `artifacts/releases/v0.3.8.1/frameos-v0.3.8.1.wgt`. Its recorded SHA-256 is `7b9cb4fcbea7fbea00b0cb73f863e69c4a4d52b933295864a88dc0e28031ce73`. The prior WGT does **not** include this audit's new controls. No new WGT was signed or deployed. Preference backup is separate from application rollback; keep exported text off-TV. Avoid a whole-tree Git reset because earlier user work was already present.

Before any native experiment, all of the following need a separate proposal and explicit approval:

1. Obtain this TV's actual default-operation owner and typed values, including absent-key/error results, for `db/appfw/home_appid`, `db/appfw/startup_appid`, `db/appfw/booting_appid_backup`, `db/first_screen/type` and integer `db/menu/smart_hub/ontvsetting/auto_start`. Save model, firmware, tool revision and hashes off-TV, with a second independent copy. Do not substitute `com.samsung.tv.csfs` merely because the component is installed.
2. Establish a firmware-compatible PC-side recovery route that runs with FrameOS closed and does not need its package. Verify exact-value restoration and physical Samsung Home independently before reassignment is considered. No such route is currently verified. Restricted SDB access is not a recovery guarantee.
3. Verify a separate physical-remote/system-Settings escape or already authorized external control route. The button inside FrameOS is insufficient if FrameOS is missing. Reinstalling the same signed app is a secondary repair, not proof that native routing can be restored.
4. Confirm library/runtime/permission and boot-eligibility compatibility without weakening guards. Stop if any baseline, recovery or eligibility check is unavailable. Firmware updates require a new review because guarded restore tools can reject the new version.
5. Test native Home separately from startup and Art transitions. Restore the captured baseline **before** any future uninstall or identity change. Uninstall, reboot, service-menu changes and factory reset are not routine rollback steps in this proposal.

The current recommendation is to retain Samsung's native Home assignment and improve FrameOS as an ordinary manually launched application.

## Validation and roadmap

Local validation: **178 unit/integration tests passed**, production typecheck/build/Chrome 69 verification passed, and **87 browser tests passed**. After final error-message and report-scrolling refinements, the build and all 178 unit/integration tests passed again, plus **14 targeted browser tests** covering launcher reliability and existing launch/media behavior. The browser suite includes native-shaped APIs and the new escape, installed-ID pinning/removal, focus restoration/editor protection, backup review/recovery and opt-in capture cases. Settings screenshots were also reviewed. These are local results, not hardware or network-protocol validation. Existing Media Hub/player/thumbnail/minimal-Art regressions remain covered.

| Priority | Next step | Gate |
| --- | --- | --- |
| 1 | Review this local candidate, export current TV preferences when available, then build a separately identified signed candidate through the existing workflow. | Explicit approval before any TV interaction/deployment; preserve author and app identity. |
| 2 | Perform the normal-app acceptance tests in [TV acceptance plan](LAUNCHER-TV-TESTS.md). | Observe real Samsung Home escape, installed IDs, focus return, storage and Media/Art regressions. |
| 3 | Capture matched TV performance baselines; trial material optimization only against reproducible evidence. | No claim based solely on desktop FPS or empty scenes. |
| 4 | Approve bounded local-network discovery/pairing, then establish FrameOS-specific launch capability and visible verification. | No Windows launch prototype until the mechanism is established; no background launches. |
| 5 | Revisit native Home only if exact firmware compatibility and independent recovery can be demonstrated. | Separate native proposal and approval; otherwise leave routing unchanged. |
| 6 | Add optional manual recovery installation tooling only if a real removal/corruption failure appears. | Installation retention is currently observed; no periodic reinstall service. |

See [physical-TV tests](LAUNCHER-TV-TESTS.md) for remaining observations and stop conditions. No approval for TV actions is implied by completing these local checks.
