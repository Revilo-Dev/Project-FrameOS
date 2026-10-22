# Offline USB thumbnails

Run this optional tool on Windows with Node.js and FFmpeg/FFprobe. The TV does
not contact this computer. FFmpeg's official download page links Windows builds:
https://ffmpeg.org/download.html#build-windows

From the FrameOS repository, open the Windows folder picker:

```powershell
.\scripts\media-thumbnails\Generate-Thumbnails.ps1
```

Or select a drive/directory explicitly:

```powershell
node scripts/media-thumbnails/generate.mjs 'E:\TV Shows'
```

If FFmpeg is not on PATH, provide both executable paths. On this development
machine the portable tools used for verification are available here:

```powershell
.\scripts\media-thumbnails\Generate-Thumbnails.ps1 `
  -FFmpeg "$PWD\artifacts\tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe" `
  -FFprobe "$PWD\artifacts\tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffprobe.exe"
```

Select the USB drive or the video directory **on that drive**. Read the displayed
destination and type `YES` to approve creating/updating FrameOS files. Cancelling
writes nothing. FFmpeg and FFprobe are checked before this prompt. For an
explicitly approved unattended run, `--approve-write` replaces the prompt.

The tool recursively reads supported videos, including MP4/MKV, spaces and
Unicode names. It skips links/junctions, its own thumbnail directory and Windows
drive housekeeping directories. Each video directory receives:

```text
video directory/
  Original video.mkv
  .frameos-thumbnails.json
  .frameos-thumbnails/
    <24-character identity>.jpg
```

Large folders use a version-2 index and `manifest-00.json` through
`manifest-ff.json` inside `.frameos-thumbnails`; the TV reads only the relevant
shard. Each manifest read is limited to 256 KiB. There is no recursive TV scan.

Files are matched by exact directory-relative name, size and modification time
(with a two-second filesystem precision tolerance when the TV supplies a time).
Windows letters and Tizen mount labels need not match. Keep the adjacent manifest
and thumbnail directory together with the videos when copying to USB.

Generation samples bounded intervals, excludes nearly black frames and retries
later positions when needed. Images are 320 x 180 JPEGs, letterboxed to preserve
aspect ratio. Changed videos or missing images are processed again. Unchanged
videos are skipped. Failed paths and errors appear in the final JSON report and
produce exit code 1. Original videos are never modified, renamed, transcoded or
deleted. Obsolete generated JPEGs are retained; the utility does not delete them.

Safely eject the drive, reconnect it to the TV, then open Media Hub. FrameOS reads
the imported image first, then native Tizen thumbnails, then a successfully
decoded HTML video frame. If these fail, the video icon remains. It never substitutes
artwork for a screenshot. No server, running PC or additional privilege is needed.

For diagnostics, focus a video, hold OK (or right-click), choose **Thumbnail
Diagnostics**, then **Retry Thumbnail**. The same section is under Settings >
USB diagnostics > Advanced. Retry bypasses the failure and manifest caches.

The legacy `scripts/generate-thumbnails.mjs` remains available for selected-file
and separate-output workflows, with the same approval prompt:

```powershell
node scripts/generate-thumbnails.mjs 'C:\Media' --recursive --output 'C:\ThumbnailExport'
```

For separate output, copy `.frameos-thumbnails.json` and `.frameos-thumbnails`
from each exported directory into the matching video directory on USB. Choosing
the USB directly with the new utility needs no copying step.
