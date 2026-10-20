# Public certificates only. Never opens a private key, password file or P12 container.
function Get-FramePublicCertificateHash([byte[]]$Bytes) {
    $certificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList (,$Bytes)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($certificate.RawData)).Replace('-', '').ToLowerInvariant() }
    finally { $certificate.Dispose(); $sha.Dispose() }
}

function Get-FramePackageAuthorHash([string]$Path) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $entry = $archive.GetEntry('author-signature.xml')
        if ($null -eq $entry) { throw 'Reference package has no author signature.' }
        $stream = $entry.Open()
        $options = New-Object System.Xml.XmlReaderSettings
        $options.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
        $options.XmlResolver = $null
        $reader = [System.Xml.XmlReader]::Create($stream, $options)
        try {
            $document = New-Object System.Xml.XmlDocument
            $document.XmlResolver = $null
            $document.Load($reader)
            # The signer is the first certificate in the author's signature chain.
            $leaf = $document.SelectSingleNode("/*[local-name()='Signature']/*[local-name()='KeyInfo']/*[local-name()='X509Data']/*[local-name()='X509Certificate']")
            if ($null -eq $leaf) { throw 'Reference package has no author certificate.' }
            return Get-FramePublicCertificateHash ([Convert]::FromBase64String($leaf.InnerText))
        } finally { $reader.Dispose(); $stream.Dispose() }
    } finally { $archive.Dispose() }
}
