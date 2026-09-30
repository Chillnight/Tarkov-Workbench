# Author: CA
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1')
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Archive\Microsoft.PowerShell.Archive.psd1')
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$releasePath = Join-Path $projectRoot 'release'
$portablePath = Join-Path $projectRoot 'Portable'
$runtimePath = Join-Path $releasePath 'win-unpacked'
$stagePath = Join-Path $releasePath 'portable-stage'
$backupPath = Join-Path $releasePath 'portable-previous'

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

Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\PORTABLE-README.txt') -Destination (Join-Path $docsPath 'README.txt')
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\UPDATES.md') -Destination $docsPath
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\AVAILABILITY.md') -Destination $docsPath
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\PRACTICAL-MOUNTS.md') -Destination $docsPath
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\TRADERS-AND-LOADOUT.md') -Destination $docsPath
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist\vendor\HIGHS-LICENSE.txt') -Destination $docsPath
$manifest = Get-ChildItem -LiteralPath $stagePath -File -Recurse | Sort-Object FullName | ForEach-Object {
    $relativeName = $_.FullName.Substring($stagePath.Length + 1).Replace('\','/')
    '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash,$relativeName
}
Set-Content -LiteralPath (Join-Path $docsPath 'SHA256SUMS.txt') -Value $manifest -Encoding ascii
$stagedArchive = Join-Path $releasePath 'Tarkov-Workbench-Portable.zip'
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
$archivePath = Join-Path $projectRoot 'Tarkov-Workbench-Portable.zip'
Copy-Item -LiteralPath $stagedArchive -Destination $archivePath -Force
$zipHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
Set-Content -LiteralPath (Join-Path $projectRoot 'Tarkov-Workbench-Portable.sha256') -Value "$zipHash  Tarkov-Workbench-Portable.zip" -Encoding ascii
Copy-Item -LiteralPath (Join-Path $portablePath 'docs\SHA256SUMS.txt') -Destination (Join-Path $releasePath 'SHA256SUMS.txt') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\PORTABLE-README.txt') -Destination (Join-Path $releasePath 'README.txt') -Force
Write-Output "Portable folder: $portablePath"
Write-Output "Distribution ZIP: $archivePath"
