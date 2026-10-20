# FrameOS 0.1

A quiet, remote-first launcher for a 2020 Samsung Frame. React 18, TypeScript and Vite; no runtime services, fonts, CDNs or component libraries. Built in this repository, independently of the existing Tizen Studio project.

```powershell
Set-Location 'C:\Users\revil\StudioProjects\frameos\Project-FrameOS'
npm ci
npm run dev
```

Open the printed local URL. Use arrows to move, Enter to select, and Escape/Backspace to go back. Mouse and Tab/Shift+Tab also work. Browser preview preserves the TV's 16:9 composition and scales it to the window.

## Included

- Home, eight favourite tiles, prominent USB entry, local clock/date.
- Three original bundled wallpapers: Tidal, Dune and Dusk. Small, offline JPEGs with pre-baked soft companions; no live blur.
- Slate, Midnight and Warm themes; Fluid, Subtle and Off motion settings. Reduced motion overrides animation.
- Immediate remote navigation, Samsung Back key `10009`, modal focus containment and restoration. Back at Home returns focus to USB Media; it does not exit the application.
- Validated versioned localStorage settings, with graceful recovery from corrupt or unavailable storage.
- Typed browser/Tizen adapter boundary. Native integrations return explicit unsupported states.
- Classic production scripts targeted to Chrome 69, relative asset paths and no runtime network access.

USB discovery/browsing, playback/AVPlay, launching installed apps, photo libraries, native Art Mode, TV browser and Samsung system settings remain future integrations. There is no fake USB content. Settings controls only FrameOS preferences. Availability has not been verified on physical TV hardware.

## Validate

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run preview
```

The build validates relative HTML references, classic scripts without CORS attributes, ES2019 syntax (including Chrome 69's optional catch bindings), bundled wallpapers and incompatible CSS features. Browser tests run against **production output**, including a direct `file:` launch, remote repeat bursts, Tizen Back, all tiles, focus restoration, persistence, blocked storage, offline assets, reduced motion and scaling. Visual review images are written to `artifacts/home.png` and `artifacts/settings.png`.

There was no existing lint configuration; TypeScript's strict, unused-local and unused-parameter checks are enabled. This project uses Node's test runner with `tsx` for unit tests. Node 22.12+ is required for development; Node 24 was used here. Dependency versions are locked in `package-lock.json`.

If your Windows trust store supplies your organisation's npm root certificate, use `$env:NODE_OPTIONS='--use-system-ca'` for the current PowerShell session (Node 24). Do not disable TLS verification.

## Source map

| Path | Responsibility |
| --- | --- |
| `src/app/App.tsx` | UI state, panels, settings and action results |
| `src/screens/` | Home, settings and native-action notice |
| `src/components/` | Focus buttons, icons, clock, TV scaling |
| `src/navigation/` | Pure spatial navigation and one keyboard listener |
| `src/platform/` | Typed browser/Tizen boundary |
| `src/services/` | Launcher catalog, settings storage, wallpapers |
| `src/styles/app.css` | Chrome 69 compatible styling |
| `public/wallpapers/` | Original SVG artwork and baked JPEG assets |
| `scripts/` | Offline artwork bake, build verification, safe Tizen staging |
| `tests/` | Production browser tests |

To regenerate baked artwork after editing its SVG source: `node scripts/bake-wallpapers.mjs`. The checked-in JPEGs are used by normal builds; Playwright is not needed to build.

## Tizen integration

```powershell
npm run check:tv   # Inspect SDK, certificate profile, metadata and exact connected TV
npm run stage:tv   # Build, validate, back up and stage frontend assets; no installation
npm run deploy:tv  # Build, stage, sign, verify the WGT, install and launch
```

The existing project is `C:\Users\revil\workspace\frameos`. The pipeline reads its application ID from `config.xml`, preserves that file byte for byte, and signs explicitly with the existing `revilodev-frameos` profile without changing global certificate settings. This profile's author certificate matches the known-good original `frameos.wgt`; the profile named `frameos` uses a different author and cannot update the installed application. Paths, the selected profile and the pinned public author fingerprint are in `scripts/tv.config.json`.

`check:tv` checks the reference WGT and selected profile against that fingerprint. The signed WGT's embedded author is checked again before installation. No private keys or certificate passwords are read for those comparisons. The obsolete `C:\samsungdev\frameos-ui` path is not used; run all commands from this repository.

`stage:tv` writes production `index.html`, `assets/` and `wallpapers/` into the existing project. A verified, immutable original backup and ownership ledger live in **`artifacts/tv/` inside this repository**, outside the packaged application. Cleanup only removes files owned by previous runs whose hashes still match. Manually edited managed files and unrelated collisions stop staging. Keep `artifacts/tv/`; it is ignored by Git and essential for backup/cleanup safety.

See [the deployment guide](docs/DEPLOYMENT.md) for recovery and optional local signing validation. The older `stage:tizen` command remains available for its original read-only scratch-copy workflow.

`deploy:tv` updates the physical TV; it is not run during validation. Installation awaits explicit user approval in this development session. It never enables automatic startup or modifies firmware/system settings. Test focus responsiveness and rendering on the TV before extending native integrations. Chrome 69 targeting and browser tests cannot certify the television's engine or GPU performance.
