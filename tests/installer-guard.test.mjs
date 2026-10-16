// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const helper = fileURLToPath(new URL('../desktop/installer-check.ps1', import.meta.url));
function run(directory, mode = 'Processes') {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Mode', mode, '-InstallDirectory', directory], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', chunk => text += chunk); child.stderr.on('data', chunk => text += chunk);
    child.on('error', reject); child.on('exit', code => resolve({ code, text }));
  });
}
test('installer guard ignores setup/uninstaller and other copies but detects a running app at the exact target', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench process guard-'));
  const target = join(root, 'Target'), other = join(root, 'Target-other');
  let child;
  try {
    await mkdir(target); await mkdir(other);
    const fixture = join(other, 'Tarkov-Workbench.exe');
    await copyFile(process.execPath, fixture);
    child = spawn(fixture, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    assert.equal((await run(target)).code, 0, 'a different portable copy must not block setup');
    assert.equal((await run(other)).code, 10, 'the exact running installation must block setup');
    assert.doesNotThrow(() => process.kill(child.pid, 0), 'the guard must not terminate the running copy');
    const script = join(root, 'guard-fixtures.ps1');
    const ps = String.raw`$ErrorActionPreference='Stop'
. $env:WB_GUARD_HELPER -InstallDirectory $env:WB_GUARD_TARGET
$records=@(
  [pscustomobject]@{Name='Tarkov-Workbench-Setup.exe';ExecutablePath=(Join-Path $env:WB_GUARD_TARGET 'Tarkov-Workbench-Setup.exe')},
  [pscustomobject]@{Name='Uninstall Tarkov-Workbench.exe';ExecutablePath=(Join-Path $env:WB_GUARD_TARGET 'Uninstall Tarkov-Workbench.exe')},
  [pscustomobject]@{Name='other.exe';ExecutablePath=(Join-Path $env:WB_GUARD_TARGET 'other.exe')}
)
if(Test-WorkbenchRunning $env:WB_GUARD_TARGET $records){throw 'Setup or uninstaller was mistaken for the app.'}
if(-not(Test-WorkbenchRunning $env:WB_GUARD_TARGET @([pscustomobject]@{Name='TARKOV-WORKBENCH.EXE';ExecutablePath=(Join-Path $env:WB_GUARD_TARGET 'Tarkov-Workbench.exe')}))){throw 'Case-insensitive app path was missed.'}
`;
    await writeFile(script, ps);
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, env: { ...process.env, WB_GUARD_HELPER: helper, WB_GUARD_TARGET: target } });
  } finally {
    if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
    await rm(root, { recursive: true, force: true });
  }
});
test('installer checks write access without creating a partial target or leaving probe files', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench write guard-'));
  try {
    assert.equal((await run(join(root, 'Not created', 'Tarkov-Workbench'), 'Writable')).code, 0);
    assert.deepEqual(await readdir(root), []);
    const drive = root.slice(0, 3);
    assert.equal((await run(drive, 'Writable')).code, 20, 'drive roots must be rejected');
    const isAdmin = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'], { windowsHide: true, encoding: 'utf8' }).trim() === 'True';
    if (!isAdmin) assert.equal((await run(join(process.env.ProgramFiles, 'Tarkov-Workbench-write-check'), 'Writable')).code, 20, 'Program Files must fail before extraction without elevation');
  } finally { await rm(root, { recursive: true, force: true }); }
});
