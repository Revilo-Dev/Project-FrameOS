param([Parameter(Mandatory = $true)][string]$RequestBase64)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Read-SafeXml([string]$Path) {
    $options = New-Object System.Xml.XmlReaderSettings
    $options.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $options.XmlResolver = $null
    $reader = [System.Xml.XmlReader]::Create($Path, $options)
    try { $document = New-Object System.Xml.XmlDocument; $document.XmlResolver = $null; $document.Load($reader); return ,$document }
    finally { $reader.Dispose() }
}

try {
    $request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($RequestBase64)) | ConvertFrom-Json
    if ($request.action -eq 'metadata') {
        $manifest = Read-SafeXml (Join-Path $request.project 'config.xml')
        $widget = $manifest.DocumentElement
        $application = $manifest.SelectSingleNode("/*[local-name()='widget']/*[local-name()='application']")
        $content = $manifest.SelectSingleNode("/*[local-name()='widget']/*[local-name()='content']")
        if ($null -eq $application -or $null -eq $content) { throw 'Manifest is missing its application identity or content entry.' }
        $resources = @($manifest.SelectNodes('//*[@src or @href]') | ForEach-Object {
            if ($_.LocalName -ne 'content') {
                foreach ($attribute in $_.Attributes) { if ($attribute.Name -in @('src', 'href') -and $attribute.Value -notmatch '^[a-z]+:') { $attribute.Value } }
            }
        })
        $result = @{
            appId = $application.GetAttribute('id'); packageId = $application.GetAttribute('package')
            version = $widget.GetAttribute('version'); entry = $content.GetAttribute('src'); resources = $resources
        }
        if ($request.certificate) {
            $profileOutput = (& $request.tizen security-profiles list 2>&1 | Out-String)
            if ($LASTEXITCODE -ne 0) { throw 'Unable to list existing Tizen certificate profiles.' }
            $profileMatch = [regex]::Match($profileOutput, "Loaded in '([^']+)'")
            if (-not $profileMatch.Success) { throw 'Tizen CLI did not report the profiles.xml location.' }
            $profiles = Read-SafeXml $profileMatch.Groups[1].Value
            $selected = @($profiles.SelectNodes("/*[local-name()='profiles']/*[local-name()='profile']") | Where-Object { $_.GetAttribute('name') -ceq $request.profile })
            if ($selected.Count -ne 1) { throw 'The requested existing certificate profile was not found.' }
            $keys = @($selected[0].SelectNodes("*[local-name()='profileitem']") | Where-Object { $_.GetAttribute('key') } | ForEach-Object { $_.GetAttribute('key') })
            if ($keys.Count -lt 2) { throw 'The existing profile must contain author and distributor certificates.' }
            foreach ($key in $keys) { if (-not (Test-Path -LiteralPath $key -PathType Leaf)) { throw 'An existing profile certificate file is missing.' } }
            $result.certificateCount = $keys.Count
            $result.activeProfile = $profiles.DocumentElement.GetAttribute('active')
        }
        $result | ConvertTo-Json -Compress -Depth 5
    } elseif ($request.action -eq 'command') {
        $toolArguments = @($request.arguments | ForEach-Object { [string]$_ })
        $output = (& $request.executable @toolArguments 2>&1 | Out-String)
        $code = $LASTEXITCODE
        # Never forward signing-tool output, even on failure: it may include credentials.
        if ($toolArguments[0] -eq 'package') { $output = '' }
        else { $output = [regex]::Replace($output, '(?im)(password|passwd|pwd|secret)\s*[:=].*$', '$1=[redacted]') }
        @{ exitCode = $code; output = $output } | ConvertTo-Json -Compress
    } else { throw 'Unknown SDK helper action.' }
} catch {
    # XML/profile exceptions may contain sensitive values; return a fixed diagnostic.
    $message = 'SDK metadata or command inspection failed. Check the existing manifest, SDK and certificate profile.'
    if ($_.Exception.Message -match '^(Manifest is missing|Unable to list|Tizen CLI did not|The requested existing|The existing profile|An existing profile)') { $message = $_.Exception.Message }
    [Console]::Error.WriteLine($message)
    exit 1
}
