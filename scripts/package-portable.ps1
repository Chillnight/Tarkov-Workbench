# Author: CA
param([switch] $Online)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1')
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Archive\Microsoft.PowerShell.Archive.psd1')
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$releasePath = Join-Path $projectRoot 'release'
$folderName = if ($Online) { 'Online-Portable' } else { 'Portable' }
$archiveName = if ($Online) { 'Tarkov-Workbench-Online-Portable.zip' } else { 'Tarkov-Workbench-Portable.zip' }
$readmeName = if ($Online) { 'ONLINE-PORTABLE-README.txt' } else { 'PORTABLE-README.txt' }
$portablePath = Join-Path $projectRoot $folderName
$runtimePath = if ($Online) { Join-Path $releasePath 'online\win-unpacked' } else { Join-Path $releasePath 'win-unpacked' }
$stagePath = Join-Path $releasePath ($folderName + '-stage')
$backupPath = Join-Path $releasePath ($folderName + '-previous')

function Assert-ProjectPath([string] $path) {
    $resolved = [IO.Path]::GetFullPath($path)
    if (-not $resolved.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside the project: $resolved"
    }
    # Generated folders must not be junctions or links to another location.
    $current = $resolved
    while ($current -ne $projectRoot) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if ($item.LinkType -in @('Junction','SymbolicLink') -or $item.Target) {
                throw "Refusing to replace a linked path: $current"
            }
        }
        $current = Split-Path -Parent $current
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $runtimePath 'resources\app.asar') -PathType Leaf)) { throw 'Run npm run desktop:build first.' }
if (-not (Test-Path -LiteralPath (Join-Path $runtimePath 'Tarkov-Workbench.exe') -PathType Leaf)) { throw 'The unpacked runtime EXE is missing.' }
Assert-ProjectPath $stagePath
if (Test-Path -LiteralPath $stagePath) { Remove-Item -LiteralPath $stagePath -Recurse -Force }
Copy-Item -LiteralPath $runtimePath -Destination $stagePath -Recurse
$docsPath = Join-Path $stagePath 'docs'
New-Item -ItemType Directory -Path $docsPath -Force | Out-Null
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
@{app='Tarkov Workbench';distribution='portable';version=$package.build.buildVersion} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $docsPath 'portable.json') -Encoding ascii

Copy-Item -LiteralPath (Join-Path $projectRoot ('docs\' + $readmeName)) -Destination (Join-Path $docsPath 'README.txt')
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\UPDATES.md') -Destination $docsPath
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\AVAILABILITY.md') -Destination $docsPath
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\PRACTICAL-MOUNTS.md') -Destination $docsPath
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\TRADERS-AND-LOADOUT.md') -Destination $docsPath
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\CATEGORY-COMPARISON.md') -Destination $docsPath
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist\vendor\HIGHS-LICENSE.txt') -Destination $docsPath
Copy-Item -LiteralPath (Join-Path $projectRoot 'LICENSE') -Destination (Join-Path $stagePath 'LICENSE.txt')
$stagedArchive = Join-Path $releasePath $archiveName
$archiveEntries = Get-ChildItem -LiteralPath $stagePath -Force | Select-Object -ExpandProperty FullName
Compress-Archive -LiteralPath $archiveEntries -DestinationPath $stagedArchive -CompressionLevel Optimal -Force

# Keep the previous prepared folder until its replacement is complete.
Assert-ProjectPath $portablePath
Assert-ProjectPath $backupPath
if (Test-Path -LiteralPath $portablePath) {
    if (Test-Path -LiteralPath $backupPath) { Remove-Item -LiteralPath $backupPath -Recurse -Force }
    Move-Item -LiteralPath $portablePath -Destination $backupPath
}
Move-Item -LiteralPath $stagePath -Destination $portablePath
$archivePath = Join-Path $projectRoot $archiveName
Copy-Item -LiteralPath $stagedArchive -Destination $archivePath -Force
$zipHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
Set-Content -LiteralPath (Join-Path $projectRoot ($archiveName -replace '\.zip$','.sha256')) -Value "$zipHash  $archiveName" -Encoding ascii
if (-not $Online) {
    Copy-Item -LiteralPath (Join-Path $projectRoot ('docs\' + $readmeName)) -Destination (Join-Path $releasePath 'README.txt') -Force
}
Write-Output "Portable folder: $portablePath"
Write-Output "Distribution ZIP: $archivePath"
