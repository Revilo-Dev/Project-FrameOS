param(
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [string]$ProfilesPath,
    [string]$ProfileName,
    [string]$ReferencePackage
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\tv-certificates.ps1"

function Read-SafeXml([string]$Path) {
    $options = New-Object System.Xml.XmlReaderSettings
    $options.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $options.XmlResolver = $null
    $reader = [System.Xml.XmlReader]::Create($Path, $options)
    try {
        $document = New-Object System.Xml.XmlDocument
        $document.XmlResolver = $null
        $document.Load($reader)
        return ,$document
    } finally { $reader.Dispose() }
}

try {
    $manifest = Read-SafeXml $ManifestPath
    $application = $manifest.SelectSingleNode("/*[local-name()='widget']/*[local-name()='application']")
    $content = $manifest.SelectSingleNode("/*[local-name()='widget']/*[local-name()='content']")
    if ($null -eq $application -or $null -eq $content) { throw 'Manifest is missing its application identity or content entry.' }
    $resources = @($manifest.SelectNodes('//*[@src or @href]') | ForEach-Object {
        if ($_.LocalName -ne 'content') {
            foreach ($attribute in $_.Attributes) {
                if ($attribute.Name -in @('src', 'href') -and $attribute.Value -notmatch '^[a-z]+:') { $attribute.Value }
            }
        }
    })
    $result = @{
        appId = $application.GetAttribute('id'); packageId = $application.GetAttribute('package')
        version = $manifest.DocumentElement.GetAttribute('version'); entry = $content.GetAttribute('src'); resources = $resources
    }
    if ($ProfilesPath) {
        $profiles = Read-SafeXml $ProfilesPath
        $selected = @($profiles.SelectNodes("/*[local-name()='profiles']/*[local-name()='profile']") | Where-Object { $_.GetAttribute('name') -ceq $ProfileName })
        if ($selected.Count -ne 1) { throw 'The requested existing certificate profile was not found.' }
        $keys = @($selected[0].SelectNodes("*[local-name()='profileitem']") | Where-Object { $_.GetAttribute('key') } | ForEach-Object { $_.GetAttribute('key') })
        if ($keys.Count -lt 2) { throw 'The existing profile must contain author and distributor certificates.' }
        foreach ($key in $keys) {
            if (-not (Test-Path -LiteralPath $key -PathType Leaf)) { throw 'An existing profile certificate file is missing.' }
        }
        $result.certificateCount = $keys.Count
        $result.activeProfile = $profiles.DocumentElement.GetAttribute('active')
        $authors = @($selected[0].SelectNodes("*[local-name()='profileitem']") | Where-Object { $_.GetAttribute('distributor') -eq '0' -and $_.GetAttribute('key') })
        if ($authors.Count -ne 1) { throw 'The existing profile must identify exactly one author certificate.' }
        $publicPath = [IO.Path]::ChangeExtension($authors[0].GetAttribute('key'), '.crt')
        if (-not (Test-Path -LiteralPath $publicPath -PathType Leaf)) { throw 'The existing profile author public certificate (.crt) is missing.' }
        if (-not $ReferencePackage -or -not (Test-Path -LiteralPath $ReferencePackage -PathType Leaf)) { throw 'Reference package is missing; author continuity cannot be verified.' }
        $result.authorSha256 = Get-FramePublicCertificateHash ([IO.File]::ReadAllBytes($publicPath))
        $result.referenceAuthorSha256 = Get-FramePackageAuthorHash $ReferencePackage
    }
    $result | ConvertTo-Json -Compress -Depth 5
} catch {
    $message = 'Manifest/profile inspection failed. Check the existing XML and certificate files.'
    if ($_.Exception.Message -match '^(Manifest is missing|The requested existing|The existing profile|An existing profile|Reference package)') { $message = $_.Exception.Message }
    [Console]::Error.WriteLine($message)
    exit 1
}
