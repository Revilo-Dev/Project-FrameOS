# FrameOS manual Windows controller

Uses the installed Samsung Tizen CLI and SDB. Requires the existing Node.js installation (22.12+). It does not need FrameOS to be running, the app's source/build output, signing credentials or a TV-side helper. FrameOS must remain installed for **launch** to work; this utility is not native Home restoration.

The physical test on 22 October 2026 used one `tizen run -s 192.168.0.23:26101 -p TdjFk7yyVS.frameos` request from Samsung Home. CLI exit was 0 and the owner confirmed “FrameOS appeared and is usable.” The one test launch has already been used in this task; do not run another to validate this utility. Automated controller tests use mocks.

## Windows menu

From the repository in PowerShell:

```powershell
& '.\scripts\frameos-controller\FrameOS-Controller.ps1'
```

Choose Status, Manual Launch Once, Connection Diagnostics or Quit. Launch requires typing `LAUNCH` after confirming the TV is available and visible. Diagnostics optionally requires typing `CONNECT`; otherwise it only inspects the existing developer connection. Nothing starts on a timer or login. Closing the menu stops the utility.

CLI equivalents, each a one-shot command:

```powershell
node scripts/frameos-controller/controller.mjs status
node scripts/frameos-controller/controller.mjs diagnose
# Explicit developer connection; no power or application launch:
node scripts/frameos-controller/controller.mjs diagnose --connect
# A NEW deliberate manual launch, only when separately intended:
node scripts/frameos-controller/controller.mjs launch --confirm-launch
```

The target, paths and full application ID are fixed in `controller.mjs`. Serial/model, Tizen version and architecture are checked before launch. Firmware is displayed as the expected owner-reported value, with live firmware unknown; this public launch path does not claim to establish native firmware compatibility.

Status reports transport connection, not installed/running/foreground app state. Diagnostics adds SDB capabilities; an enabled debugger is not proof of any .NET runtime. Neither command sends keys, changes Art Mode, installs anything or launches an app.

## Failure handling and logs

- SDB queries have 8-second deadlines, explicit connect 10 seconds and the SDK launch 20 seconds. The shared existing runner terminates its owned child process tree on timeout. A timed-out launch may already have reached the TV: do not automatically retry.
- Exactly one `tizen run` is sent per accepted launch action. There is no alternate transport, key sequence, reinstall, restart, reconnect/replay or foreground enforcement.
- A PC lock prevents concurrent launches. A connection/timeout/storage failure after intent leaves the lock for inspection. Read `artifacts/frameos-controller/launch.lock` and its corresponding `launch-<id>.json`; confirm the recorded process has exited and inspect the screen before manually clearing only that lock. Locks are never removed by age or automatically retried.
- Launch JSON records the exact command target, SDK response and error. Logs remain in `artifacts/frameos-controller/`. `CLI accepted; display unconfirmed` is not a visual pass. Inspect the TV and record any observation separately.
- SDK exit 0 without recognizable launch confirmation is reported as unrecognized. Missing FrameOS/permission errors stop without installing or substituting an app ID.

Test locally without contacting a TV:

```powershell
node --test scripts/frameos-controller/controller.test.mjs
```

The supported TV syntax uses the **application ID** for `-p`, not the package ID. [Samsung CLI documentation](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/command-line-interface.html).
