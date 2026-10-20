[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$ExistingProject)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$distPath = Join-Path $repoRoot 'dist'
$sourcePath = (Resolve-Path -LiteralPath $ExistingProject).Path
$manifestPath = Join-Path $sourcePath 'config.xml'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "Existing project has no config.xml: $sourcePath" }
if (-not (Test-Path -LiteralPath (Join-Path $distPath 'index.html'))) { throw 'Run npm run build before staging.' }
[xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
$content = $manifest.SelectSingleNode("/*[local-name()='widget']/*[local-name()='content']")
if ($content.GetAttribute('src') -ne 'index.html') { throw 'Existing entry point is not index.html. Review the integration before staging.' }
$identity = $manifest.SelectSingleNode("/*[local-name()='widget']/*[local-name()='application']")
if ($null -eq $identity) { throw 'Existing manifest is missing its Tizen application identity.' }
$manifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash
$artifactRoot = Join-Path $repoRoot 'artifacts'
$stagePath = Join-Path $artifactRoot ('tizen-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6))
New-Item -Path $stagePath -ItemType Directory -Force | Out-Null
# Only the fresh staging directory is written. The original project is read-only.
Get-ChildItem -LiteralPath $distPath -Force | Copy-Item -Destination $stagePath -Recurse
foreach ($name in @('config.xml', 'icon.png', '.project', '.tproject')) {
    $itemPath = Join-Path $sourcePath $name
    if (Test-Path -LiteralPath $itemPath -PathType Leaf) { Copy-Item -LiteralPath $itemPath -Destination (Join-Path $stagePath $name) }
}
if ((Get-FileHash -LiteralPath (Join-Path $stagePath 'config.xml') -Algorithm SHA256).Hash -ne $manifestHash) { throw 'Staged manifest differs from the original.' }
if ((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash -ne $manifestHash) { throw 'Original manifest changed during staging.' }
Write-Host ('Staged application: ' + $identity.GetAttribute('id'))
Write-Host 'Original project and signing material were not modified. No TV commands were run.'
Write-Output $stagePath
