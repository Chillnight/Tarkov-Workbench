# Author: CA
param([Parameter(Mandatory=$true)][string]$Config, [ValidateSet('Prepare','Launch','Apply')][string]$Mode)
$ErrorActionPreference = 'Stop'
# The app writes UTF-8 without BOM. Windows PowerShell 5.1 would otherwise read ANSI
# and corrupt non-ASCII install or profile paths.
$settings = Get-Content -LiteralPath $Config -Raw -Encoding UTF8 | ConvertFrom-Json
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
$installed = Get-Content -LiteralPath (Join-Path $target 'docs\portable.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($installed.app -ne 'Tarkov Workbench' -or $installed.distribution -ne 'portable') { throw 'This is not a portable installation.' }
# Start-Process treats [ and ] in paths as wildcards. Process.Start uses literal paths.
function Start-Literal([string]$file, [string]$arguments, [string]$directory, [Diagnostics.ProcessWindowStyle]$style) {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $file
  $info.Arguments = $arguments
  $info.WorkingDirectory = $directory
  $info.UseShellExecute = $true
  $info.WindowStyle = $style
  $process = [Diagnostics.Process]::Start($info)
  if (-not $process) { throw "Could not start $file" }
  return $process
}
if ($Mode -eq 'Launch') {
  if (-not (Test-Path -LiteralPath (Join-Path $stage 'prepared'))) { throw 'The update was not prepared.' }
  # A shell-started process is an independent hidden Windows host that survives app exit.
  $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Config "' + $Config + '" -Mode Apply'
  $worker = Start-Literal (Join-Path $PSHOME 'powershell.exe') $arguments $parent 'Hidden'
  Set-Content -LiteralPath (Join-Path $stage 'helper-process') -Value ([string]$worker.Id) -Encoding ascii
  exit 0
}
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
  $incoming = Get-Content -LiteralPath (Join-Path $payload 'docs\portable.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($incoming.app -ne 'Tarkov Workbench' -or $incoming.distribution -ne 'portable' -or $incoming.version -ne $settings.version) { throw 'The portable update version does not match the release.' }
  Set-Content -LiteralPath (Join-Path $stage 'prepared') -Value 'ready' -Encoding ascii
  exit 0
}
function Move-UpdateFolder([string]$source, [string]$destination) {
  # Directory.Move is a single rename on this volume: a failed attempt leaves the
  # source complete. Move-Item may move files one by one and leave a partial folder.
  if (Test-Path -LiteralPath $destination) { throw "The update destination already exists: $destination" }
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  while ($true) {
    try { [IO.Directory]::Move($source, $destination); return }
    catch {
      if ([DateTime]::UtcNow -ge $deadline -or -not (Test-Path -LiteralPath $source) -or (Test-Path -LiteralPath $destination)) { throw }
      Start-Sleep -Milliseconds 250
    }
  }
}
function Wait-AppProcesses {
  # Electron helper processes can outlive the main process for a moment and keep
  # files in the app folder open.
  $prefix = $target + '\'
  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  while ($true) {
    $active = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
      try { $_.Path -and $_.Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) } catch { $false }
    })
    if (-not $active.Count) { return }
    if ([DateTime]::UtcNow -ge $deadline) { throw 'Tarkov Workbench is still running from the app folder. Close all copies and try again.' }
    Start-Sleep -Milliseconds 250
  }
}
function Test-AppFolder { (Test-Path -LiteralPath $exe) -and (Test-Path -LiteralPath (Join-Path $target 'resources\app.asar')) }
function Remove-UpdateStage {
  # Only remove the validated, generated sibling folder, never the installation.
  if ([IO.Path]::GetDirectoryName($stage) -ne $parent -or -not ([IO.Path]::GetFileName($stage).StartsWith('.workbench-update-')) -or $stage -eq $target) { throw 'Unsafe cleanup path.' }
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  while ($true) {
    try {
      $items = @((Get-Item -LiteralPath $stage -Force)) + @(Get-ChildItem -LiteralPath $stage -Recurse -Force)
      if ($items | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'Linked cleanup paths are not supported.' }
      Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction Stop
      return
    } catch {
      if ([DateTime]::UtcNow -ge $deadline) { throw }
      Start-Sleep -Milliseconds 250
    }
  }
}
try {
  if (-not (Test-Path -LiteralPath (Join-Path $stage 'prepared'))) { throw 'The update was not prepared.' }
  # The inherited working directory must not hold the old app folder open.
  Set-Location -LiteralPath $parent
  Set-Content -LiteralPath (Join-Path $stage 'helper-ready') -Value ([string]$PID) -Encoding ascii
  $running = Get-Process -Id ([int]$settings.pid) -ErrorAction SilentlyContinue
  if ($running) { Wait-Process -Id $running.Id -Timeout 120 }
  Wait-AppProcesses
  # Keep rollback files only while installing; remove them after a successful launch.
  # A failed first move leaves the installation untouched.
  Move-UpdateFolder $target $backup
  try {
    Move-UpdateFolder $payload $target
    Start-Literal $exe '' $target 'Normal' | Out-Null
  } catch {
    if (Test-Path -LiteralPath $target) { Move-UpdateFolder $target (Join-Path $stage 'failed-update') }
    Move-UpdateFolder $backup $target
    throw
  }
} catch {
  $_ | Out-String | Set-Content -LiteralPath (Join-Path $stage 'update-error.txt')
  # Report the state that is actually on disk, not the intended one.
  $restored = (Test-AppFolder) -and -not (Test-Path -LiteralPath $backup)
  if ($settings.outcome) {
    $message = "The program update could not be completed and the app folder may be incomplete. The previous version is kept in: $stage. Move its 'previous' folder back to the original location, or extract the portable ZIP again."
    if ($restored) { $message = 'The program update could not be installed. The previous version was retained in its original folder. Close other running copies and check that the portable folder is writable, then try again.' }
    @{message=$message;log=(Join-Path $stage 'update-error.txt')} | ConvertTo-Json | Set-Content -LiteralPath $settings.outcome -Encoding UTF8
  }
  # If replacement was blocked, the original app stays in its original folder.
  if ($restored -and -not (Get-Process -Id ([int]$settings.pid) -ErrorAction SilentlyContinue)) {
    try { Start-Literal $exe '' $target 'Normal' | Out-Null } catch {}
  }
  exit 1
}
try {
  Remove-UpdateStage
} catch {
  # Cleanup errors must never roll back a successfully installed, running version.
  $_ | Out-String | Set-Content -LiteralPath (Join-Path $stage 'update-error.txt')
  if ($settings.outcome) {
    @{title='Update installed; cleanup incomplete';message='The new version was installed in the original folder, but temporary update files could not be removed. Close other copies and remove the folder listed below.';log=$stage} | ConvertTo-Json | Set-Content -LiteralPath $settings.outcome -Encoding UTF8
  }
  exit 1
}
