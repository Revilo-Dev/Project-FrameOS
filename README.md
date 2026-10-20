# FrameOS 0.2

A quiet, remote-first launcher and read-only USB Media Hub for a 2020 Samsung Frame. React 18, TypeScript and Vite; no component libraries, remote scripts or CDNs. Artwork, SVG branding and the licensed clock font are bundled locally. Weather uses Open-Meteo.

```powershell
Set-Location 'C:\Users\revil\StudioProjects\frameos\Project-FrameOS'
npm ci
npm run dev
```

Open the printed local URL. Use arrows to move, Enter to select, and Escape/Backspace to go back. Mouse and Tab/Shift+Tab also work. Browser preview preserves the TV's 16:9 composition and scales it to the window.

## Included

- Minimal home with one bold serif Brisbane clock/date, hourly weather, supplied FrameOS logo, restored separators, and seven labelled gradient app tiles using the supplied icons.
- Settings → Clock selects 12-hour (default) or 24-hour time and one of 18 time zones, including device local time and UTC. Brisbane remains the default zone. Clock/date respect daylight saving; hourly weather uses the selected time format and its own weather city's zone. Preferences survive restarts.
- All 47 supplied wallpapers, available in four Settings pages. Optimized TV-compatible JPEGs, 320px thumbnails and pre-baked soft companions; no runtime AVIF decoding or live blur.
- Slate, Midnight and Warm themes; All animations, Subtle and Off motion settings. Reduced motion overrides animation. Temporary FPS counter below the logo, switchable in Settings.
- Immediate remote navigation, Samsung Back key `10009`, panel focus containment and restoration. Down from the bottom dock row or the Media prompt scrolls to Media Hub on the same page. Back goes up a folder, then restores the previous Home tile.
- Validated versioned localStorage settings, with graceful recovery from corrupt or unavailable storage.
- Typed read-only Tizen USB adapter: removable storage discovery, async root/folder reads, multiple drives, hotplug handling, manual Refresh, name sorting and All Files/Videos/Photos/Folders filters.
- Lazy directory cache (32 directories, five-minute expiry), no recursive scanning, at most 18 rendered file cards (12 in compact preview), and exact file metadata retained for future playback.
- MP4/MKV recognition plus image/audio/other classification. Selecting a file opens details; playback is not implemented.
- Open-Meteo current conditions plus the next six local hours, temperature/rain probability, six selectable Australian cities, 45-minute refresh, bounded request timeout and honest saved/unavailable states offline. Provider/license credits are in Settings → Weather. No geolocation or API key.
- Settings → USB diagnostics: actual packaged privilege declaration, raw storage labels/types/states, resolved directories, counts, timestamps, native errors and Rescan USB. Errors never become an empty-drive or disconnected state.
- Network status control and an explicit Close FrameOS action. The power icon closes the current Tizen app after confirmation; TV power and network settings remain under Samsung's controls.
- Classic production scripts targeted to Chrome 69, relative assets and a narrow weather-only network policy in packaged builds.

AVPlay, subtitles/codecs, installed-app launching, Gallery, native Art Mode, TV browser and Samsung system settings remain future integrations. Native USB browsing is implemented and covered by API fixtures, but has **not been validated on the physical Samsung Frame**. No USB file contents are modified. Browser production mode reports missing native APIs; explicit development fixtures are available at `http://127.0.0.1:5173/?mockUsb=1` with `npm run dev` only, clearly labelled as development data.

Weather uses the free API for personal/non-commercial use and retains [Open-Meteo attribution](https://open-meteo.com/en/licence). See [API documentation](https://open-meteo.com/en/docs) and [terms](https://open-meteo.com/en/terms). Daily values are genuine provider data rounded only for display; automated test screenshots use controlled weather and USB fixtures.

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
| `tizen/` | Exact v0.2 manifest policy diff, preview and explanation |
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

For v0.2, review [the precise manifest additions](tizen/README.md). The protected original `config.xml` remains unchanged. Only a fresh local packaging copy gains `filesystem.read`, `externalstorage`, `internet`, API-origin access and restrictive CSP. No write permission is requested. Samsung storage listeners can require write permission, so denied listeners use read-only discovery every five seconds only while Media Hub is visible. No background USB polling runs on Home.

To build and sign locally without staging or installing anything outside this repository:

```powershell
node scripts/tv.mjs package
```

The verified v0.1 and original v0.2 rollback packages are preserved under `artifacts/releases/v0.1/` and `artifacts/releases/v0.2/`; the pre-v0.2 code checkpoint is Git commit `93c110a`. See [the refresh and native USB notes](docs/V0.2-REFRESH.md) before physical-TV testing.

`stage:tv` writes production `index.html`, `assets/` and `wallpapers/` into the existing project. A verified, immutable original backup and ownership ledger live in **`artifacts/tv/` inside this repository**, outside the packaged application. Cleanup only removes files owned by previous runs whose hashes still match. Manually edited managed files and unrelated collisions stop staging. Keep `artifacts/tv/`; it is ignored by Git and essential for backup/cleanup safety.

See [the deployment guide](docs/DEPLOYMENT.md) for recovery and optional local signing validation. The older `stage:tizen` command remains available for its original read-only scratch-copy workflow.

`deploy:tv` updates the physical TV; it is not run during validation. Installation awaits explicit user approval in this development session. It never enables automatic startup or modifies firmware/system settings. Test focus responsiveness and rendering on the TV before extending native integrations. Chrome 69 targeting and browser tests cannot certify the television's engine or GPU performance.
