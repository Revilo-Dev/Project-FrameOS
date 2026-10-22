param([string]$Directory, [string]$FFmpeg = 'ffmpeg', [string]$FFprobe = 'ffprobe')
$ErrorActionPreference = 'Stop'
if (-not $Directory) {
    Add-Type -AssemblyName System.Windows.Forms
    $picker = New-Object System.Windows.Forms.FolderBrowserDialog
    $picker.Description = 'Select the USB drive or video folder for FrameOS thumbnails'
    try {
        if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
        $Directory = $picker.SelectedPath
    } finally { $picker.Dispose() }
}
& node (Join-Path $PSScriptRoot 'generate.mjs') $Directory --ffmpeg $FFmpeg --ffprobe $FFprobe
exit $LASTEXITCODE
