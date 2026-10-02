// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
test('Windows helper validates archives, replaces full folders, retains backup and rolls back launch failures', { skip: process.platform !== 'win32' }, async () => {
  for (const scenario of ['success', 'rollback', 'traversal', 'duplicate', 'missing', 'wrong-version']) {
    const root = await mkdtemp(join(tmpdir(), 'workbench-helper-test-'));
    const target = join(root, 'Portable app'), stage = join(root, '.workbench-update-test');
    const config = join(stage, 'update.json');
    try {
      await mkdir(join(target, 'resources'), { recursive: true });
      await mkdir(join(target, 'docs'));
      await writeFile(join(target, 'docs', 'portable.json'), JSON.stringify({ app: 'Tarkov Workbench', distribution: 'portable', version: '1.9.0.3' }));
      await mkdir(stage);
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
      const run = mode => powershell(['-File', helper, '-Config', config, '-Mode', mode]);
      if (['traversal', 'duplicate', 'missing', 'wrong-version'].includes(scenario)) {
        assert.throws(() => run('Prepare'));
        assert.equal(await readFile(join(target, 'resources', 'app.asar'), 'utf8'), 'old app');
        await assert.rejects(access(join(root, 'outside.txt')));
      } else {
        run('Prepare');
        if (scenario === 'success') {
          run('Apply');
          assert.equal(await readFile(join(target, 'resources', 'app.asar'), 'utf8'), 'new app');
          assert.equal(await readFile(join(stage, 'previous', 'resources', 'app.asar'), 'utf8'), 'old app');
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
