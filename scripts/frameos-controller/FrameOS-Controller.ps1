param([ValidateSet('Menu','Status','Diagnostics','Launch')][string]$Action = 'Menu')
$ErrorActionPreference = 'Stop'
$controllerScript = Join-Path $PSScriptRoot 'controller.mjs'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required. Use the existing FrameOS development installation.' }
function Invoke-FrameController([string]$Choice) {
    if ($Choice -eq 'Status') { & node $controllerScript status; return }
    if ($Choice -eq 'Diagnostics') {
        $connectAnswer = Read-Host 'Connect to 192.168.0.23:26101 first? Type CONNECT, or Enter to inspect only'
        if ($connectAnswer -ceq 'CONNECT') { & node $controllerScript diagnose --connect } else { & node $controllerScript diagnose }
        return
    }
    if ($Choice -eq 'Launch') {
        $launchAnswer = Read-Host 'This may interrupt the current app. With the TV available and visible, type LAUNCH to open FrameOS once'
        if ($launchAnswer -cne 'LAUNCH') { Write-Output 'Cancelled. No launch sent.'; return }
        & node $controllerScript launch --confirm-launch
        Write-Output 'Check the actual TV screen. CLI acceptance does not confirm the display. No launch will be retried.'
    }
}
if ($Action -ne 'Menu') { Invoke-FrameController $Action; exit $LASTEXITCODE }
do {
    Write-Output "`nFrameOS manual controller — 1 Status | 2 Launch once | 3 Connection diagnostics | Q Quit"
    $menuAnswer = Read-Host 'Choose'
    switch ($menuAnswer) { '1' { Invoke-FrameController 'Status' } '2' { Invoke-FrameController 'Launch' } '3' { Invoke-FrameController 'Diagnostics' } }
} while ($menuAnswer -notin @('q','Q'))
