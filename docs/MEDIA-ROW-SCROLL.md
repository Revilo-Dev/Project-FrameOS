# Media scrolling and FRIENDS previews

Prepared locally on 22 October 2026. No physical TV connection, installation or launch performed.

## Changes

- Media viewport advances in whole rows as remote focus crosses the visible boundary. Up reverses through rows; virtualization remains bounded.
- The Home indicator and folder breadcrumb path are display-only. Options remains selectable. Back still traverses parent folders and returns to the launcher; Up from Options returns to the launcher.
- Empty folders, disconnects and pending discovery now focus Options instead of the removed Home button.

## Verification

- Build/typecheck and Tizen-compatible production verification passed.
- All 178 unit/integration tests passed.
- Browser run: 59 passed, 1 failed. Row stepping (280 pixels at seven columns), focus visibility, display-only path, folder Back navigation, thumbnails and player tests passed.
- Remaining failure: `tests/launcher.spec.ts:345`, clock timezone choices bottom measured 1008.39 pixels against the expected boundary of 940. Clock UI was not changed by this task; this failure remains unresolved and must not be reported as a full browser pass.
- Logs: `artifacts/row-scroll-build.log`, `artifacts/row-scroll-tests.log`, `artifacts/row-scroll-browser.log`.

## FRIENDS thumbnails

Read `C:\Users\revil\Desktop\1.FRIENDS` recursively using the existing FFmpeg/FFprobe workflow. Generated 311 previews, zero failures, across 12 video directories, including a nested bonus directory. Videos were not rewritten. Verified all manifest entries against local video sizes/timestamps and JPEG signatures.

The adjacent `.frameos-thumbnails.json` and `.frameos-thumbnails` directories have been created beside the local videos. A transfer bundle contains only these generated files, with the original folder structure:

`artifacts/friends-thumbnails/FRIENDS-thumbnails.zip`

Size: 2,722,702 bytes. SHA-256: `fe0ebf739f4aa4f2d69ed037c4b508ecabe36538aca49389f7f46ef746787311`.

Extract the bundle into the matching `1.FRIENDS` directory on the USB drive, merging the season/bonus directories. Do not extract into an individual season. Preserve the exact video filenames and modification times; the importer validates metadata. If USB copies differ, generate directly on the PC-connected USB instead. No running PC/server is needed afterward.

The owner subsequently supplied `D:\01-Friends` as the episode directory and `D:\05-My Projects\thumb` as backup storage. Actual drive files differ from the Desktop collection, so fresh previews were generated directly from the drive instead of reusing mismatched images.

Drive result: **376 previews across 15 manifests**, including extras/Joey, with two failed Season 1 MKVs: `EP10 The One With the Monkey .mkv` and `EP13 The One With the Boobies.mkv`. FFprobe rejected their MKV headers. Original videos were unchanged. All 376 images were decoded locally and verified as 320 x 180; manifests were checked against current video metadata.

Previews are already adjacent to the drive videos. Backup: `D:\05-My Projects\thumb\FRIENDS-D-drive-thumbnails.zip`, 3,379,042 bytes, SHA-256 `804b22b34dd3925db760cc33ea5f3160f1b2db7a8710eb3e7fbb010ef907e629`. ZIP entry readback passed. `FRIENDS-D-drive-verification.json` and `FrameOS-thumbnails-README.txt` are saved beside it. The earlier ZIP is retained as `FRIENDS-desktop-source-thumbnails.zip` and is not the matching drive bundle.

No physical-TV connection occurred. TV rendering remains unverified. Reconnect the USB and use Media Hub; Thumbnail Diagnostics > Retry Thumbnail can bypass an existing negative cache.

## USB disconnect follow-up

Detected removal now shows **USB disconnected**. Known removal is retained across empty or failed discovery so a follow-up filesystem error cannot replace it with the generic updating state. Opening a newly discovered drive clears the removal state. Initial startup without a drive retains the connect-USB prompt. Build passed and all **10 targeted browser checks passed**, including failed rediscovery after removal and successful reconnection. Logs: `artifacts/usb-disconnect-build.log` and `artifacts/usb-disconnect-browser.log`; these are local software results.

## Remaining deployment boundary

Episode display-title follow-up: underscores become spaces, redundant whitespace collapses, the first title word after an episode prefix is capitalized, and the video extension is omitted in the focused title and player heading. Example: `EP03-the_first_one.mkv` displays as `EP03-The first one`. Original filenames, playback paths, thumbnail identities and episode sorting remain unchanged. Compact numbered episode card captions remain intact. Build and all 179 unit tests passed; browser evidence is in `artifacts/readable-titles-browser.log`.

Source changes are built locally but have not been signed into a new release or installed. Preserve the previous signed package, prepare/verify a new candidate with the existing identity/certificate workflow, then obtain approval before any physical-TV connection, update, launch or test. Verify row scrolling, nonselectable path, Back navigation and imported JPEGs on screen separately from API responses.
