> **v0.3.6 widget release:** [features, validation and deployment](docs/V0.3.6.md) · [Google Calendar deferred integration](docs/GOOGLE-CALENDAR.md). Five configurable widgets, up to three active. Google account connection will be added later.

> **v0.3.5 interface release:** [behavior, checks and deployment](docs/V0.3.5.md) · [changed files](docs/V0.3.5-FILES.md). Existing media work and the successful TV deployment pipeline are preserved.

# FrameOS v0.3.8

Latest follow-up replaces Foxtel with Prime Video and wires all six native app destinations. Bitcoin's successive five-minute updates, pause in Media and overdue refresh on Home return have automated coverage. See the [follow-up report and signed candidate](docs/V0.3.8.md#native-app-destinations-and-refresh-follow-up). TV thumbnail failure remains under investigation; the diagnostic summary now keeps the key result fields visible above Retry.

See the [v0.3.8 follow-up](docs/V0.3.8.md): restored Previous / −10 / Play-Pause / +10 / Next, thumb-only blue timeline focus, time above the right end of the bar, blurred Media wallpaper, Bitcoin replacing the default Calendar card, and native YouTube launch with the approved app-launch privilege.

See the [v0.3.7 repair report](docs/V0.3.7.md) for thumbnail diagnostics and real MP4/MKV evidence, system volume handling, the corrected player layout/focus and full-width folder surfaces. The signed build is prepared; physical-TV acceptance awaits installation approval.

See the [v0.4 handoff](docs/V0.4.md) for autoplay, channel skipping, continuous scrolling, persistent caching, native/HTML/FFmpeg thumbnail fallbacks and startup feasibility. Physical-TV installation requires approval.

A quiet, remote-first launcher, read-only USB Media Hub and Samsung AVPlay video player for a 2020 Samsung Frame. React 18, TypeScript and Vite; no component libraries, remote scripts or CDNs. Artwork, SVG branding and the licensed clock font are bundled locally. Weather uses Open-Meteo; the installed TV provides its local Samsung SDK script.

See the [v0.3 verification and TV handoff](docs/V0.3.md) for player behavior, episode detection, Hide/Unhide, thumbnails, compatibility limits, changed files and exact deployment steps. **No v0.3 TV installation or physical video playback verification has been performed.**

```powershell
Set-Location 'C:\Users\revil\StudioProjects\frameos\Project-FrameOS'
npm ci
npm run dev
```

Open the printed local URL. Use arrows to move, Enter to select, and Escape/Backspace to go back. Mouse and Tab/Shift+Tab also work. Browser preview preserves the TV's 16:9 composition and scales it to the window.

## Included

- Centred clock/date with six local fonts, five configurable widgets (zero to three active), pre-blurred widget surfaces and seven branded squircle shortcuts that expand on remote focus. Calendar is disconnected pending the later Google API integration; local Reminders and To-do work now.
- Settings → Clock selects 12-hour (default) or 24-hour time and one of 18 time zones, including device local time and UTC. Brisbane remains the default zone. Clock/date respect daylight saving; hourly weather uses the selected time format and its own weather city's zone. Preferences survive restarts.
- All 47 supplied wallpapers, available in four Settings pages. Optimized TV-compatible JPEGs, 320px thumbnails and pre-baked soft companions; no runtime AVIF decoding or live blur.
- Slate, Midnight and Warm themes; All animations, Subtle and Off motion settings. Reduced motion overrides animation. Temporary FPS counter below the logo, switchable in Settings.
- Immediate remote navigation, Samsung Back key `10009`, panel focus containment and restoration. Down from the bottom dock row or the Media prompt scrolls to Media Hub on the same page. Back goes up a folder, then restores the previous Home tile.
- Validated versioned localStorage settings, with graceful recovery from corrupt or unavailable storage.
- Typed read-only Tizen USB adapter: removable storage discovery, async root/folder reads, multiple drives, hotplug handling, manual Refresh, name sorting and All Files/Videos/Photos/Folders filters.
- Lazy directory cache (32 directories, five-minute expiry), no recursive scanning, at most 12 thumbnail-driven file cards (8 in compact preview), and on-demand nested folders.
- Native MP4/MKV selection via AVPlay, fullscreen controls, pause/resume/seek, ordered Next/Previous, buffering/errors and safe cleanup. Images, audio and unsupported files retain honest details views. Playback availability depends on native APIs and TV codecs.
- Deterministic episode labels and natural order, fixed focused-title area, lazy native-index thumbnails with bounded URI-only caching and placeholders, and persistent read-only Hide/Unhide via long OK or Options with Show Hidden Files.
- Open-Meteo current conditions plus the next six local hours, temperature/rain probability, seven selectable Australian locations including New Beith and Brisbane, 45-minute refresh, bounded request timeout and honest saved/unavailable states offline. Provider/license credits are in Settings → Weather. No geolocation or API key.
- Settings → USB diagnostics: actual packaged privilege declaration, raw storage labels/types/states, resolved directories, counts, timestamps, native errors and Rescan USB. Errors never become an empty-drive or disconnected state.
- Network status control and an explicit Close FrameOS action. The power icon closes the current Tizen app after confirmation; TV power and network settings remain under Samsung's controls.
- Classic production scripts targeted to Chrome 69, relative assets and a narrow weather-only network policy in packaged builds.

Subtitles/track selection, installed-app launching, Gallery, native Art Mode, TV browser and Samsung system settings remain future integrations. Native USB browsing and AVPlay are implemented and covered by API fixtures, but this build has **not been validated on the physical Samsung Frame**. No USB file contents are modified. Browser production mode reports missing native APIs; explicit development USB fixtures are available at `http://127.0.0.1:5173/?mockUsb=1` with `npm run dev` only, clearly labelled as development data. Browser preview does not simulate video playback.

Weather uses the free API for personal/non-commercial use and retains [Open-Meteo attribution](https://open-meteo.com/en/licence). See [API documentation](https://open-meteo.com/en/docs) and [terms](https://open-meteo.com/en/terms). Hourly values are genuine provider data rounded only for display; automated test screenshots use controlled weather and native API fixtures.

## Validate

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run preview
```

The build validates relative HTML references, classic scripts without CORS attributes, ES2019 syntax (including Chrome 69's optional catch bindings), bundled wallpapers and incompatible CSS features. Tests cover weather mapping/cache/offline fallback, clock formatting, old settings migration, native USB errors/hotplug/cache, large directories, focus restoration and deployment safety. Browser tests run against **production output**, including the actual packaged CSP and direct `file:` loading without security overrides. Visual review images: `artifacts/v02-home.png`, `artifacts/v02-settings.png`, `artifacts/v02-media.png`.

There was no existing lint configuration; TypeScript's strict, unused-local and unused-parameter checks are enabled. This project uses Node's test runner with `tsx` for unit tests. Node 22.12+ is required for development; Node 24 was used here. Dependency versions are locked in `package-lock.json`.

If your Windows trust store supplies your organisation's npm root certificate, use `$env:NODE_OPTIONS='--use-system-ca'` for the current PowerShell session (Node 24). Do not disable TLS verification.

## Source map

| Path | Responsibility |
| --- | --- |
| `src/app/App.tsx` | UI state, panels, settings and action results |
| `src/screens/` | Home, settings, Media Hub state/view, file details and unavailable-action notice |
| `src/components/` | Focus buttons, icons, clock, TV scaling |
| `src/navigation/` | Pure spatial navigation and one keyboard listener |
| `src/platform/` | Typed browser/Tizen boundary, async read-only filesystem, explicit development adapter |
| `src/services/` | Weather, bounded directory cache, file classification, settings, catalog, wallpapers |
| `src/styles/app.css` | Chrome 69 compatible styling |
| `public/wallpapers/` | Original SVG artwork and baked JPEG assets |
| `scripts/` | Offline artwork bake, build verification, author-verified deployment and manifest overlay |
| `tizen/` | Exact versioned manifest policy diffs, previews and explanation |
| `tests/` | Production browser tests |

Original uploads were preserved under ignored `artifacts/imports/user-assets-2026-10-20/wallpapers/` before replacing generated output. To regenerate optimized artwork from those originals: `node scripts/import-wallpapers.mjs` (or the compatible `bake-wallpapers.mjs` entry). Normal builds use checked-in JPEGs and never need Playwright or the originals. Do not put source assets only in `dist`; Vite rebuilds that directory.

## Tizen integration

```powershell
npm run check:tv   # Inspect SDK, certificate profile, metadata and exact connected TV
npm run stage:tv   # Build, validate, back up and stage frontend assets; no installation
npm run deploy:tv  # Build, stage, sign, verify the WGT, install and launch
```

The existing project is `C:\Users\revil\workspace\frameos`. The pipeline reads its application ID from `config.xml`, preserves that file byte for byte, and signs explicitly with the existing `revilodev-frameos` profile without changing global certificate settings. This profile's author certificate matches the known-good original `frameos.wgt`; the profile named `frameos` uses a different author and cannot update the installed application. Paths, the selected profile and the pinned public author fingerprint are in `scripts/tv.config.json`.

`check:tv` checks the reference WGT and selected profile against that fingerprint. The signed WGT's embedded author is checked again before installation. No private keys or certificate passwords are read for those comparisons. The obsolete `C:\samsungdev\frameos-ui` path is not used; run all commands from this repository.

For v0.3, review [the precise manifest additions](tizen/README.md). The protected original `config.xml` remains unchanged. Only a fresh local packaging copy gains `filesystem.read`, `externalstorage`, `internet`, `content.read`, `tv.inputdevice`, API-origin access and restrictive CSP. No write permission is requested. Samsung storage listeners can require write permission, so denied listeners use read-only discovery every five seconds only while Media Hub/player is open. No background USB polling runs on Home.

To build and sign locally without staging or installing anything outside this repository:

```powershell
node scripts/tv.mjs package
```

Verified signed rollback packages remain under `artifacts/releases/v0.1/`, `v0.2/`, `v0.2-refresh/` and `v0.2-clock/`. The complete v0.2 source checkpoint is Git commit `0bb987d`; the earlier pre-v0.2 checkpoint is `93c110a`. See [the v0.3 verification and acceptance steps](docs/V0.3.md) before physical-TV testing.

`stage:tv` writes production `index.html`, `assets/` and `wallpapers/` into the existing project. A verified, immutable original backup and ownership ledger live in **`artifacts/tv/` inside this repository**, outside the packaged application. Cleanup only removes files owned by previous runs whose hashes still match. Manually edited managed files and unrelated collisions stop staging. Keep `artifacts/tv/`; it is ignored by Git and essential for backup/cleanup safety.

See [the deployment guide](docs/DEPLOYMENT.md) for recovery and optional local signing validation. The older `stage:tizen` command remains available for its original read-only scratch-copy workflow.

`deploy:tv` updates the physical TV; it is not run during validation. Installation awaits explicit user approval in this development session. It never enables automatic startup or modifies firmware/system settings. Test focus responsiveness and rendering on the TV before extending native integrations. Chrome 69 targeting and browser tests cannot certify the television's engine or GPU performance.
