# FrameOS v0.2 packaging policy review

The protected `C:\Users\revil\workspace\frameos\config.xml` is **not edited**. The pipeline copies that project into an ignored, fresh `artifacts/tv/packages/package-*/project/` directory and adds the reviewed policy to that copy before the SDK build. [The exact XML diff](config.xml.v0.2.diff) and [complete resulting manifest](config.xml.v0.2.preview) are supplied for review. They are documentation, not a replacement source project.

`policy-v0.2.json` pins the original manifest SHA-256 to `df9616f0175d656253ad7f55a534f07f6dca6c8e62be0e5695bd6d15fd54dd78`. `scripts/tv-policy.mjs` accepts only this baseline and the following additions. Every original byte survives the insertion, including the current author details, widget URL, `frameos-icon.png`, app ID `TdjFk7yyVS.frameos`, package `TdjFk7yyVS`, widget version `1.0.0`, minimum version `2.3`, icon, name, feature, metadata, and settings. The frontend version is `0.2.0`; app metadata is preserved for update continuity.

The exact resulting manifest SHA-256 is `c732fac244398331c3328a7771d32400bc4ad77826a08c37f445b3876e923e45`.

| Addition | Reason |
| --- | --- |
| `http://tizen.org/privilege/filesystem.read` | Read USB roots and directory entries. |
| `http://tizen.org/privilege/externalstorage` | Permit access to removable USB storage. |
| `http://tizen.org/privilege/internet` | Fetch weather over HTTPS. |
| `<access origin="https://api.open-meteo.com" subdomains="false"/>` | Permit only the documented forecast API origin. |
| `tizen:content-security-policy` | Restrict requests and loaded resources as detailed below. |

The CSP allows packaged resources, inline script/style required by Vite's existing classic SystemJS bootstrap and local CSS injection, and local/data images. Same-origin requests read the packaged manifest for USB privilege diagnostics. Its **only remote connection destination** is `https://api.open-meteo.com`. There is no wildcard, remote script source, `unsafe-eval`, geolocation request, filesystem-write privilege, navigation permission, media-player privilege or background/autostart change. Frames, objects and base-URL changes are denied. City selection uses configured coordinates rather than a geolocation or geocoding request.

Samsung documents read/write privileges separately: storage listener registration/removal can require `filesystem.write` even when browsing needs only reads. The adapter tries the listener and falls back to non-overlapping discovery every five seconds only while Media Hub is visible if listener permission is denied. No write privilege is added to enable notifications; no media file operation writes to USB.

The pipeline hashes both source and patched manifests separately. The Tizen build and WGT must contain the **exact expected patched bytes**, and the protected source must retain the **original hash**. Author fingerprint checks and signed asset verification remain enabled. A changed baseline or existing policy stops the operation for review; it is never merged loosely or silently replaced.

Local verification without staging the external source or installing on a TV:

```powershell
node scripts/tv.mjs package
```

This builds the current React app and packages required production assets directly in a fresh local copy. Only files explicitly recorded by the earlier frontend ownership ledger can be omitted as stale; unrelated project resources remain. The local package operation verifies the immutable original backup and never changes its files. Physical installation remains an explicit separate `npm run deploy:tv` action.

The verified v0.1 WGT is retained at ignored `artifacts/releases/v0.1/frameos-v0.1.wgt` with `expected-assets.json` and `release.json`. Package SHA-256: `479b713bb67ff8940dabd2e0f6c4cab9a8dca64eeb42a05a18bc600093f7a70a`. It uses the same pinned author fingerprint as v0.2. These artifacts contain the signed application, not private keys. Keep this directory and `artifacts/tv/`; no automatic rollback or installation is performed.

Official references: [Samsung Filesystem API and storage privileges](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/filesystem-api.html), [Samsung handling USB storages](https://developer.samsung.com/smarttv/develop/guides/data-handling/handling-usb-storages.html), [Samsung/Tizen network access and CSP documentation](https://github.com/Samsung/tizen-docs/blob/master/docs/application/web/guides/development/setting-properties.md), [Samsung/Tizen internet privilege reference](https://github.com/Samsung/tizen-docs/blob/master/docs/application/web/reference/security-privileges.md), [Open-Meteo forecast API](https://open-meteo.com/en/docs).
