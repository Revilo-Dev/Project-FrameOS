# Physical-TV acceptance plan — approval required

Target only: QA32LS03TBWXXY / T-KSU2FUABC-2743.0 / Tizen 5.5 / ARMv7. Application `TdjFk7yyVS.frameos`, package `TdjFk7yyVS`. None of these tests was performed during the launcher audit. No TV interaction is authorized by this document.

## Normal app candidate

Before a later approved deployment, create a distinct signed candidate with the existing `revilodev-frameos` workflow and verify identity/author/archive integrity. Preserve the prior signed WGT and source checkpoint. The original external Tizen manifest, certificate and global profile must remain unchanged. Export current preferences if possible; the older release has no new backup screen. Updates should retain storage, but do not rely on this without a backup.

| Test | Procedure after explicit approval | Evidence / pass condition |
| --- | --- | --- |
| Initial appearance | Open the approved candidate manually from Samsung's apps. Inspect Home at normal viewing distance. | Seven dock positions, clock/widgets/wallpaper/Media entry remain correct; no startup assignment change. Record candidate hash. |
| Samsung escape | Settings → Appearance → Open Samsung Home, once. | Actual Samsung Home appears; record API result separately. Home component is `com.samsung.tv.csfs`; do not try alternate system IDs. Stop on denial/failure. |
| Return/focus | Reopen FrameOS manually after escape and after one consumer-app launch. Repeat from Media and a Settings subview. | Visible focus returns to the intended element; D-pad/Back/CH work; no launch repeats on return or network recovery. |
| Real catalog | Open installed apps; record non-sensitive IDs/metadata needed to diagnose omissions. Pick one known consumer app, pin it, close Settings and launch once. | Intended app visibly appears; selected ID matches discovery. Art/Settings remain reachable. Services are excluded. Restore original shortcut afterward if desired. |
| Missing/unavailable app | Prefer a nonexistent ID in an isolated local mock; do not uninstall a TV app to create this condition. If a naturally missing stale pin exists, select it once. | Honest missing/permission error; no unrelated replacement launch or reinstall. |
| Diagnostics | Inspect the last request after manually returning. | Correct ID/method/error, API accepted versus screen confirmation kept separate. Visibility is contextual evidence only. |
| Storage/backup | Create backup text and save it on the PC. Review a copy with one reversible appearance change, apply, then restore the original. | Recovery copy predates import; fonts/widgets/pins/hidden paths/autoplay survive. No account-token export. Confirm text editing and navigation work with the TV IME; Back from the IME remains native. |
| Performance | Capture Home at least three times with identical wallpaper/motion/widgets/FPS-overlay state. Move focus through the same sequence after warm-up. Repeat a matching Media/Settings sequence by starting capture then navigating. | Save report and observed feel; check samples/viewport/context. rAF timing is not presented-frame or physical input latency. Cancel/background must stop capture. No hidden keep-alive loop. |
| Assets | Compare one proposed pre-rendered material change only after baseline. Keep viewport, source image and interaction sequence fixed. | Repeatable p95/worst improvement without excessive decoded-image memory or visual degradation; otherwise retain current assets. |
| Media/player | Browse real MP4/MKV folders, including nested Unicode paths and cached thumbnails. Play, pause, seek, stop, return; exercise naturally available USB removal safely. | No AVPlay lifecycle regressions, thumbnail decoder conflict or changed focus. Volume/Power remain Samsung owned. |
| Internal Art | Enter FrameOS Art, then wake with existing Back/direction/Select behavior. | Same wallpaper/clock, hidden controls, one wake transition; native Samsung Art has not been invoked. |
| Retention/startup observation | Use normal existing owner behavior only in a separately approved session. Record what appears at the next ordinary power-on and whether FrameOS remains installed. | Distinguish standby/wake from cold restart. No scripted reboot or app removal. Retention and startup are separate observations. |

The preference backup UI currently exports text for copying. TV clipboard/IME practicality is unverified; keep a PC-held copy rather than relying on the app-local recovery key. If the TV cannot practically export text, design a separately reviewed transfer mechanism before treating this as a complete off-device backup workflow.

## Windows controller discovery gate

1. Approve the specific viewing-state/network session. Read device information and any supported application metadata without keys, launches, scans outside this device or power changes. Verify the exact target identity; log no serial/MAC/token unnecessarily.
2. Separately approve pairing if needed; observe Allow/Deny and test authorization timeout. Store any token in Windows-protected storage. A socket opening is insufficient.
3. Establish whether the exact sideloaded FrameOS application is addressable through a supported app-launch route. Numeric store IDs and the package ID are not interchangeable evidence. If unknown, stop without a launch prototype.
4. With separate permission, issue one manual launch while the owner can observe the screen. Record transport result, app-state evidence if available and the owner's visible confirmation independently. No Home/Power fallback sequence.
5. Only after this succeeds, build a small manual controller. Test denied/revoked tokens, unexpected JSON, timeouts and interrupted connections with mocks first; test real reconnect later with approval. Reconnect must not replay a launch. No monitor may enforce FrameOS while another app streams.

Art/standby detection remains unknown until an actual state source is documented and checked on this firmware. Do not infer it from the remote channel or use state-changing probes.

## Native Home gate — separate research proposal

No native test, helper upload, command workaround, preference write, guard change, system-package modification, Art toggle, restart or uninstall is authorized. The references' guards reject this TV. Unknowns include current operation ownership, native ABI/runtime/permissions, boot eligibility, typed preference baseline and missing-app fallback.

A future proposal must identify a permitted inspection route, capture this TV's actual baseline, demonstrate recovery independently of FrameOS and define exact stop conditions before requesting approval for any native modification. The [audit's recovery requirements](LAUNCHER-AUDIT.md#recovery-and-rollback-requirements) are prerequisites. Until then, retain Samsung Home routing.
