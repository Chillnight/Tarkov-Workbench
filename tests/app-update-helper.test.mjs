// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, access, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startUpdateHelper } from '../desktop/app-updater.mjs';

const helper = fileURLToPath(new URL('../desktop/apply-update.ps1', import.meta.url));
const createZip = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression,System.IO.Compression.FileSystem
$spec = $env:WB_UPDATE_TEST | ConvertFrom-Json
$zip = [IO.Compression.ZipFile]::Open($spec.zip, [IO.Compression.ZipArchiveMode]::Create)
try { foreach ($file in $spec.files) {
  $entry = $zip.CreateEntry($file.name)
  $output = $entry.Open()
  try { if ($file.source) { $bytes = [IO.File]::ReadAllBytes($file.source) } else { $bytes = [Text.Encoding]::UTF8.GetBytes($file.text) }; $output.Write($bytes,0,$bytes.Length) } finally { $output.Dispose() }
} } finally { $zip.Dispose() }`;
function powershell(args, env = {}) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env }, timeout: 30000 });
}
test('Windows helper validates archives, replaces full folders, cleans up and rolls back launch failures', { skip: process.platform !== 'win32' }, async () => {
  for (const scenario of ['success', 'handoff', 'electron-handoff', 'rollback', 'traversal', 'duplicate', 'missing', 'wrong-version']) {
    const root = await mkdtemp(join(tmpdir(), 'workbench helper test-'));
    const target = join(root, 'Portable app'), stage = join(root, '.workbench-update-test');
    const config = join(stage, 'update.json');
    try {
      await mkdir(join(target, 'resources'), { recursive: true });
      await mkdir(join(target, 'docs'));
      await writeFile(join(target, 'docs', 'portable.json'), JSON.stringify({ app: 'Tarkov Workbench', distribution: 'portable', version: '1.9.0.3' }));
      await mkdir(stage);
      const stagedHelper = join(stage, 'apply-update.ps1');
      await writeFile(stagedHelper, await readFile(helper));
      await writeFile(join(target, 'resources', 'app.asar'), 'old app');
      const launcher = join(process.env.SystemRoot, 'System32', 'where.exe');
      await writeFile(join(target, 'Tarkov-Workbench.exe'), await readFile(launcher));
      const files = [{ name: 'resources/app.asar', text: 'new app' }, { name: 'Tarkov-Workbench.exe', source: launcher }, { name: 'docs/portable.json', text: JSON.stringify({ app: 'Tarkov Workbench', distribution: 'portable', version: scenario === 'wrong-version' ? '1.9.0.2' : '1.9.0.4' }) }];
      if (scenario === 'rollback') files[1] = { name: 'Tarkov-Workbench.exe', text: 'not an executable' };
      if (scenario === 'traversal') files.push({ name: '../outside.txt', text: 'unsafe' });
      if (scenario === 'duplicate') files.push({ name: 'RESOURCES/APP.ASAR', text: 'duplicate' });
      if (scenario === 'missing') files.splice(1, 1);
      powershell(['-Command', createZip], { WB_UPDATE_TEST: JSON.stringify({ zip: join(stage, 'Tarkov-Workbench-Online-Portable.zip'), files }) });
      await writeFile(config, JSON.stringify({ target, stage, pid: 2147483647, version: '1.9.0.4', outcome: join(root, 'outcome.json') }));
      const run = mode => powershell(['-File', stagedHelper, '-Config', config, '-Mode', mode]);
      if (['traversal', 'duplicate', 'missing', 'wrong-version'].includes(scenario)) {
        assert.throws(() => run('Prepare'));
        assert.equal(await readFile(join(target, 'resources', 'app.asar'), 'utf8'), 'old app');
        await assert.rejects(access(join(root, 'outside.txt')));
      } else {
        run('Prepare');
        if (['success', 'handoff', 'electron-handoff'].includes(scenario)) {
          if (scenario.endsWith('handoff')) {
            // Exercise the production launch options and exit the real parent process.
            const parent = join(root, scenario === 'electron-handoff' ? 'handoff-parent.cjs' : 'handoff-parent.mjs');
            const body = `import {readFile,writeFile} from 'node:fs/promises';
import {startUpdateHelper} from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL('../desktop/app-updater.mjs', import.meta.url))).href)};
const config=${JSON.stringify(config)},stage=${JSON.stringify(stage)};
const settings=JSON.parse(await readFile(config,'utf8'));settings.pid=process.pid;
await writeFile(config,JSON.stringify(settings));
await startUpdateHelper(${JSON.stringify(stagedHelper)},config,stage);`;
            const electron = scenario === 'electron-handoff';
            await writeFile(parent, electron ? `const {app}=require('electron');app.setPath('userData',${JSON.stringify(join(root, 'test-profile'))});app.whenReady().then(async()=>{await import('data:text/javascript,'+encodeURIComponent(${JSON.stringify(body)}));app.quit();}).catch(error=>{console.error(error);app.exit(1);});` : `${body}\nprocess.exit(0);`);
            const executable = electron ? fileURLToPath(new URL('../node_modules/electron/dist/electron.exe', import.meta.url)) : process.execPath;
            const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
            execFileSync(executable, [parent], { cwd: target, windowsHide: true, timeout: 20000, stdio: 'pipe', env });
            const deadline = Date.now() + 15000;
            while (true) {
              try { await access(stage); } catch (error) { if (error.code === 'ENOENT') break; throw error; }
              if (Date.now() >= deadline) {
                const details = await readFile(join(stage, 'update-error.txt'), 'utf8').catch(() => 'No helper error log.');
                throw new Error(`The updater did not complete after the parent exited. ${details}`);
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } else run('Apply');
          assert.equal(await readFile(join(target, 'resources', 'app.asar'), 'utf8'), 'new app');
          assert.equal(JSON.parse(await readFile(join(target, 'docs', 'portable.json'), 'utf8')).version, '1.9.0.4');
          await assert.rejects(access(stage));
        } else {
          assert.throws(() => run('Apply'));
          assert.equal(await readFile(join(target, 'resources', 'app.asar'), 'utf8'), 'old app');
          await access(join(stage, 'failed-update'));
          assert.match(await readFile(join(root, 'outcome.json'), 'utf8'), /previous version was retained/);
        }
      }
    } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
  }
});

test('handoff requires execution confirmation and reports an early exit or timeout', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-helper-readiness-'));
  try {
    const config = join(root, 'update.json'), script = join(root, 'helper.ps1');
    await writeFile(config, '{}');
    const fakeLaunch = command => `param($Config,$Mode)
$worker=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList '-NoProfile -NonInteractive -Command "${command}"' -WindowStyle Hidden -PassThru
Set-Content -LiteralPath (Join-Path (Split-Path -Parent $Config) 'helper-process') -Value $worker.Id -Encoding ascii`;
    await writeFile(script, fakeLaunch('exit 0'));
    await assert.rejects(startUpdateHelper(script, config, root), /stopped before confirming/);
    await writeFile(script, fakeLaunch('Start-Sleep -Seconds 30'));
    await assert.rejects(startUpdateHelper(script, config, root, { timeoutMs: 1500 }), /did not start in time/);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
});

test('Windows helper handles brackets, non-ASCII paths and locked files without leaving a partial app', { skip: process.platform !== 'win32' }, async () => {
  for (const [scenario, folder] of [['brackets', 'Tarkov Workbench [test]'], ['non-ascii', 'Jürgen Ördner ß'], ['transient-lock', 'Portable app'], ['locked', 'Portable app']]) {
    const root = await mkdtemp(join(tmpdir(), 'workbench helper paths-'));
    const target = join(root, folder), stage = join(root, '.workbench-update-test'), config = join(stage, 'update.json');
    let lock = null;
    try {
      await mkdir(join(target, 'resources'), { recursive: true });
      await mkdir(join(target, 'docs'));
      await writeFile(join(target, 'docs', 'portable.json'), JSON.stringify({ app: 'Tarkov Workbench', distribution: 'portable', version: '1.9.0.3' }));
      await writeFile(join(target, 'resources', 'app.asar'), 'old app');
      const launcher = join(process.env.SystemRoot, 'System32', 'where.exe');
      await writeFile(join(target, 'Tarkov-Workbench.exe'), await readFile(launcher));
      await mkdir(stage);
      const stagedHelper = join(stage, 'apply-update.ps1');
      await writeFile(stagedHelper, await readFile(helper));
      const files = [{ name: 'resources/app.asar', text: 'new app' }, { name: 'Tarkov-Workbench.exe', source: launcher }, { name: 'docs/portable.json', text: JSON.stringify({ app: 'Tarkov Workbench', distribution: 'portable', version: '1.9.0.4' }) }];
      powershell(['-Command', createZip], { WB_UPDATE_TEST: JSON.stringify({ zip: join(stage, 'Tarkov-Workbench-Online-Portable.zip'), files }) });
      // Same serialization as the desktop updater: UTF-8 without BOM.
      await writeFile(config, JSON.stringify({ target, stage, pid: 2147483647, version: '1.9.0.4', outcome: join(root, 'outcome.json') }));
      const run = mode => powershell(['-File', stagedHelper, '-Config', config, '-Mode', mode]);
      run('Prepare');
      if (scenario.endsWith('lock') || scenario === 'locked') {
        // Hold app.asar without sharing, as antivirus scans or lingering processes can.
        const quote = value => value.replace(/'/g, "''");
        const seconds = scenario === 'locked' ? 40 : 3;
        lock = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$f=[IO.File]::Open('${quote(join(target, 'resources', 'app.asar'))}','Open','Read','None'); Set-Content -LiteralPath '${quote(join(root, 'locked'))}' 'yes'; Start-Sleep ${seconds}; $f.Close()`], { windowsHide: true, stdio: 'ignore' });
        const deadline = Date.now() + 15000;
        for (;;) {
          try { await access(join(root, 'locked')); break; }
          catch { if (Date.now() > deadline) throw new Error('The file lock did not start.'); await new Promise(resolve => setTimeout(resolve, 100)); }
        }
      }
      if (scenario === 'locked') {
        assert.throws(() => run('Apply'));
        lock.kill(); lock = null;
        await new Promise(resolve => setTimeout(resolve, 500));
        // The installation stays complete in its folder, and the report says so.
        assert.deepEqual((await readdir(target)).sort(), ['Tarkov-Workbench.exe', 'docs', 'resources']);
        assert.equal(await readFile(join(target, 'resources', 'app.asar'), 'utf8'), 'old app');
        assert.match(await readFile(join(root, 'outcome.json'), 'utf8'), /previous version was retained in its original folder/);
      } else {
        run('Apply');
        assert.equal(await readFile(join(target, 'resources', 'app.asar'), 'utf8'), 'new app');
        await assert.rejects(access(stage));
      }
    } finally {
      lock?.kill();
      await new Promise(resolve => setTimeout(resolve, 300));
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    }
  }
});
