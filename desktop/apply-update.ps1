# Author: CA
param([Parameter(Mandatory=$true)][string]$Config, [ValidateSet('Prepare','Apply')][string]$Mode)
$ErrorActionPreference = 'Stop'
$settings = Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
$target = [IO.Path]::GetFullPath($settings.target).TrimEnd('\')
$stage = [IO.Path]::GetFullPath($settings.stage).TrimEnd('\')
$parent = [IO.Path]::GetDirectoryName($target)
$payload = Join-Path $stage 'payload'
$backup = Join-Path $stage 'previous'
$exe = Join-Path $target 'Tarkov-Workbench.exe'
if ($target -eq [IO.Path]::GetPathRoot($target).TrimEnd('\') -or [IO.Path]::GetDirectoryName($stage) -ne $parent -or -not ([IO.Path]::GetFileName($stage).StartsWith('.workbench-update-')) -or $target -eq $stage) { throw 'Unsafe update paths.' }
foreach ($path in @($target, $stage, $parent)) {
  if ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked update paths are not supported.' }
}
if (Test-Path -LiteralPath (Join-Path $target '.git')) { throw 'A source-code folder cannot be updated.' }
if (-not (Test-Path -LiteralPath $exe) -or -not (Test-Path -LiteralPath (Join-Path $target 'resources\app.asar'))) { throw 'The portable app could not be identified.' }
$installed = Get-Content -LiteralPath (Join-Path $target 'docs\portable.json') -Raw | ConvertFrom-Json
if ($installed.app -ne 'Tarkov Workbench' -or $installed.distribution -ne 'portable') { throw 'This is not a portable installation.' }
if ($Mode -eq 'Prepare') {
  Add-Type -AssemblyName System.IO.Compression,System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead((Join-Path $stage 'Tarkov-Workbench-Online-Portable.zip'))
  try {
    if ($archive.Entries.Count -gt 5000) { throw 'Too many update files.' }
    $total = 0L
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $archive.Entries) {
      $name = $entry.FullName.Replace('/', '\')
      if ($name.Contains(':') -or [IO.Path]::IsPathRooted($name) -or $name.Split('\') -contains '..' -or ($entry.ExternalAttributes -band 0x400) -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw 'Unsafe update archive entry.' }
      $destination = [IO.Path]::GetFullPath((Join-Path $payload $name))
      if (-not $destination.StartsWith($payload + '\', [StringComparison]::OrdinalIgnoreCase) -or -not $seen.Add($destination)) { throw 'Invalid or duplicate update path.' }
      $total += $entry.Length
      if ($total -gt 2GB) { throw 'The extracted update is too large.' }
    }
    [IO.Directory]::CreateDirectory($payload) | Out-Null
    foreach ($entry in $archive.Entries) {
      $destination = [IO.Path]::GetFullPath((Join-Path $payload $entry.FullName.Replace('/', '\')))
      if ($entry.FullName.EndsWith('/') -or $entry.FullName.EndsWith('\')) { [IO.Directory]::CreateDirectory($destination) | Out-Null }
      else {
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $false)
      }
    }
  } finally { $archive.Dispose() }
  if (-not (Test-Path -LiteralPath (Join-Path $payload 'Tarkov-Workbench.exe')) -or -not (Test-Path -LiteralPath (Join-Path $payload 'resources\app.asar'))) { throw 'The update is missing app files.' }
  $incoming = Get-Content -LiteralPath (Join-Path $payload 'docs\portable.json') -Raw | ConvertFrom-Json
  if ($incoming.app -ne 'Tarkov Workbench' -or $incoming.distribution -ne 'portable' -or $incoming.version -ne $settings.version) { throw 'The portable update version does not match the release.' }
  Set-Content -LiteralPath (Join-Path $stage 'prepared') -Value 'ready' -Encoding ascii
  exit 0
}
if (-not (Test-Path -LiteralPath (Join-Path $stage 'prepared'))) { throw 'The update was not prepared.' }
try {
  $running = Get-Process -Id ([int]$settings.pid) -ErrorAction SilentlyContinue
  if ($running) { Wait-Process -Id $running.Id -Timeout 120 }
  # Rename complete folders on the same volume; retain the previous version for recovery.
  Move-Item -LiteralPath $target -Destination $backup
  try {
    Move-Item -LiteralPath $payload -Destination $target
    Start-Process -FilePath $exe -WorkingDirectory $target -WindowStyle Hidden -ErrorAction Stop
  } catch {
    if (Test-Path -LiteralPath $target) { Move-Item -LiteralPath $target -Destination (Join-Path $stage 'failed-update') }
    Move-Item -LiteralPath $backup -Destination $target
    Start-Process -FilePath $exe -WorkingDirectory $target -WindowStyle Hidden
    throw
  }
} catch {
  $_ | Out-String | Set-Content -LiteralPath (Join-Path $stage 'update-error.txt')
  if ($settings.outcome) {
    @{message='The program update could not be installed. The previous version was retained. Close other running copies and check that the portable folder is writable, then try again.';log=(Join-Path $stage 'update-error.txt')} | ConvertTo-Json | Set-Content -LiteralPath $settings.outcome -Encoding UTF8
  }
  # If replacement was blocked, the original app stays in its original folder.
  if ((Test-Path -LiteralPath $exe) -and -not (Get-Process -Id ([int]$settings.pid) -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $exe -WorkingDirectory $target -WindowStyle Hidden -ErrorAction SilentlyContinue
  }
  exit 1
}
