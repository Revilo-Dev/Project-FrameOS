param(
    [Parameter(Mandatory = $true)][string]$PackagePath,
    [Parameter(Mandatory = $true)][string]$ExpectedPath,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedAuthorSha256
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\tv-certificates.ps1"
try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $expected = Get-Content -LiteralPath $ExpectedPath -Raw | ConvertFrom-Json
    $archive = [System.IO.Compression.ZipFile]::OpenRead($PackagePath)
    try {
        $names = @{}
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName.Replace('\', '/')
            if ($name.StartsWith('/') -or ($name.Split('/') -contains '..') -or $names.ContainsKey($name.ToLowerInvariant())) { throw 'Unsafe or duplicate archive entry.' }
            $names[$name.ToLowerInvariant()] = $true
            if ($name -match '(?i)(^|/)\.sign/|\.(p12|pfx|pem|key|wgt)$|(^|/)profiles\.xml$') { throw 'Signing material or nested package found in archive.' }
        }
        foreach ($signature in @('author-signature.xml', 'signature1.xml')) {
            $entry = $archive.GetEntry($signature)
            if ($null -eq $entry -or $entry.Length -eq 0) { throw 'Package is missing its author or distributor signature.' }
        }
        foreach ($property in $expected.PSObject.Properties) {
            $entry = $archive.GetEntry($property.Name)
            if ($null -eq $entry) { throw 'Package is missing a required application file.' }
            $stream = $entry.Open()
            $sha = [Security.Cryptography.SHA256]::Create()
            try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
            finally { $stream.Dispose(); $sha.Dispose() }
            if ($hash -cne $property.Value) { throw 'Packaged application file differs from its verified source.' }
        }
        $authorHash = Get-FramePackageAuthorHash $PackagePath
        if ($authorHash -cne $ExpectedAuthorSha256.ToLowerInvariant()) { throw 'Author certificate mismatch.' }
        @{ verified = $true; entries = $archive.Entries.Count; authorSha256 = $authorHash } | ConvertTo-Json -Compress
    } finally { $archive.Dispose() }
} catch {
    if ($_.Exception.Message -eq 'Author certificate mismatch.') {
        [Console]::Error.WriteLine('Signed package author certificate does not match the known-good application. Installation was not started.')
    } else {
        [Console]::Error.WriteLine('Signed package verification failed: required files, metadata, author certificate, signatures or excluded signing material did not match.')
    }
    exit 1
}
