# Author: CA
param([string] $CertificateThumbprint)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1')
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1')
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Archive\Microsoft.PowerShell.Archive.psd1')
Import-Module (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\Modules\PKI\PKI.psd1')

$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$sourcePath = Join-Path $projectRoot 'Portable'
$outputPath = Join-Path $projectRoot 'Portable-SelfSigned'
$identityPath = Join-Path $projectRoot '.signing'
$thumbprintPath = Join-Path $identityPath 'self-signed-thumbprint.txt'
if (-not (Test-Path -LiteralPath (Join-Path $sourcePath 'Tarkov-Workbench.exe') -PathType Leaf)) { throw 'Run desktop:build and portable:package first.' }
if (Test-Path -LiteralPath $outputPath) { throw 'Portable-SelfSigned already exists. Move the previous test package aside before creating another.' }

if (-not $CertificateThumbprint -and (Test-Path -LiteralPath $thumbprintPath)) {
    $CertificateThumbprint = (Get-Content -LiteralPath $thumbprintPath -Raw).Trim()
}
if ($CertificateThumbprint) {
    if ($CertificateThumbprint -notmatch '^[A-Fa-f0-9]{40}$') { throw 'Invalid certificate thumbprint.' }
    $certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$CertificateThumbprint"
} else {
    # Personal signing identity only. This does not establish Windows trust.
    $certificate = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=CA' -FriendlyName 'Tarkov Workbench self-signed test (CA)' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable -NotAfter (Get-Date).AddYears(2)
    New-Item -ItemType Directory -Path $identityPath -Force | Out-Null
    Set-Content -LiteralPath $thumbprintPath -Value $certificate.Thumbprint -Encoding ascii
}
if (-not $certificate.HasPrivateKey -or $certificate.Subject -ne 'CN=CA' -or $certificate.NotAfter -le (Get-Date)) { throw 'A current CA signing certificate with its private key is required.' }
if (-not ($certificate.EnhancedKeyUsageList.ObjectId -contains '1.3.6.1.5.5.7.3.3')) { throw 'Certificate is not enabled for code signing.' }

Copy-Item -LiteralPath $sourcePath -Destination $outputPath -Recurse
$docsPath = Join-Path $outputPath 'docs'
$report = @()
foreach ($file in (Get-ChildItem -LiteralPath $outputPath -Recurse -File | Where-Object { $_.Extension -in @('.exe','.dll') })) {
    $before = Get-AuthenticodeSignature -LiteralPath $file.FullName
    if ($before.Status -eq 'Valid') {
        $action = 'Preserved existing trusted signature'
    } elseif ($before.Status -eq 'NotSigned') {
        $signed = Set-AuthenticodeSignature -LiteralPath $file.FullName -Certificate $certificate -HashAlgorithm SHA256 -IncludeChain Signer
        if ($signed.SignerCertificate.Thumbprint -ne $certificate.Thumbprint -or $signed.Status -in @('NotSigned','HashMismatch','NotSupportedFileFormat','Incompatible')) {
            throw "Signing failed: $($file.Name): $($signed.Status) $($signed.StatusMessage)"
        }
        $action = 'Self-signed test signature added'
    } else {
        throw "Refusing to replace an existing invalid/untrusted signature: $($file.Name)"
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
    $report += [pscustomobject]@{
        file = $file.FullName.Substring($outputPath.Length + 1).Replace('\','/')
        action = $action
        status = [string] $signature.Status
        message = $signature.StatusMessage
        signer = $signature.SignerCertificate.Subject
        thumbprint = $signature.SignerCertificate.Thumbprint
    }
}

# Export only the public certificate. No private key or trust-store import.
$publicPath = Join-Path $docsPath 'CA-self-signed.cer'
Export-Certificate -Cert $certificate -FilePath $publicPath -Type CERT | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\SELF-SIGNED.txt') -Destination (Join-Path $docsPath 'README.txt') -Force
$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $docsPath 'SIGNATURES.json') -Encoding UTF8
@(
    'Author: CA'
    'Purpose: self-signed code-signing experiment, not a publicly trusted release'
    "Subject: $($certificate.Subject)"
    "Certificate thumbprint (SHA-1 identifier): $($certificate.Thumbprint)"
    "Certificate file SHA-256: $((Get-FileHash -LiteralPath $publicPath -Algorithm SHA256).Hash)"
    "Expires UTC: $($certificate.NotAfter.ToUniversalTime().ToString('u'))"
    'File digest: SHA-256; no timestamp service used.'
    'Windows trust stores and Smart App Control settings are unchanged.'
) | Set-Content -LiteralPath (Join-Path $docsPath 'CERTIFICATE.txt') -Encoding ascii

$manifestPath = Join-Path $docsPath 'SHA256SUMS.txt'
$manifest = Get-ChildItem -LiteralPath $outputPath -Recurse -File | Where-Object { $_.FullName -ne $manifestPath } | Sort-Object FullName | ForEach-Object {
    '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash,$_.FullName.Substring($outputPath.Length + 1).Replace('\','/')
}
Set-Content -LiteralPath $manifestPath -Value $manifest -Encoding ascii
$archivePath = Join-Path $projectRoot 'Tarkov-Workbench-SelfSigned.zip'
$entries = Get-ChildItem -LiteralPath $outputPath -Force | Select-Object -ExpandProperty FullName
Compress-Archive -LiteralPath $entries -DestinationPath $archivePath -CompressionLevel Optimal -Force
Set-Content -LiteralPath (Join-Path $projectRoot 'Tarkov-Workbench-SelfSigned.sha256') -Value "$((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash)  Tarkov-Workbench-SelfSigned.zip" -Encoding ascii
Write-Output "Self-signed test ZIP: $archivePath"
Write-Output "Certificate: $($certificate.Thumbprint) (CurrentUser\My, private key not exported)"
$report | Format-Table file,status,action -AutoSize
