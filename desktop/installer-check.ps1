# Author: CA
param(
    [ValidateSet('Processes','Writable')][string]$Mode = 'Processes',
    [Parameter(Mandatory=$true)][string]$InstallDirectory
)
$ErrorActionPreference = 'Stop'

function Test-WorkbenchRunning([string]$Directory, [object[]]$Processes) {
    $executable = [IO.Path]::GetFullPath((Join-Path $Directory 'Tarkov-Workbench.exe'))
    foreach ($entry in $Processes) {
        if ($entry.Name -ine 'Tarkov-Workbench.exe') { continue }
        if (-not $entry.ExecutablePath) { throw 'A Workbench process could not be inspected. Close running Workbench copies and try again.' }
        if ([IO.Path]::GetFullPath($entry.ExecutablePath).Equals($executable, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}

function Test-WorkbenchWritable([string]$Directory) {
    $target = [IO.Path]::GetFullPath($Directory)
    if ($target.TrimEnd('\') -eq [IO.Path]::GetPathRoot($target).TrimEnd('\')) { throw 'Choose a dedicated application folder.' }
    # Check the closest existing ancestor without creating a partial installation.
    $existing = $target
    while (-not [IO.Directory]::Exists($existing)) {
        $parent = [IO.Path]::GetDirectoryName($existing)
        if (-not $parent -or $parent -eq $existing) { throw 'The installation drive is unavailable.' }
        $existing = $parent
    }
    $probe = Join-Path $existing ('.workbench-write-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $stream = $null
    try { $stream = [IO.File]::Open($probe, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None) }
    finally {
        if ($stream) { $stream.Dispose(); [IO.File]::Delete($probe) }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        if ($Mode -eq 'Writable') { Test-WorkbenchWritable $InstallDirectory; exit 0 }
        $processes = @(Get-CimInstance -ClassName Win32_Process -Filter "Name='Tarkov-Workbench.exe'" -OperationTimeoutSec 8)
        if (Test-WorkbenchRunning $InstallDirectory $processes) { exit 10 }
        exit 0
    } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 20 }
}
