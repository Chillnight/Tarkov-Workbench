// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const executable = fileURLToPath(new URL('../node_modules/electron/dist/electron.exe', import.meta.url));
test('saved themes precede every visible frame, independently of application startup; unavailable storage recovers', { skip: process.platform !== 'win32' || !existsSync(executable), timeout: 45000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench theme startup-'));
  const output = join(root, 'result.json');
  let child;
  try {
    const env = { ...process.env, WB_THEME_ROOT: fileURLToPath(new URL('../dist', import.meta.url)), WB_THEME_PROFILE: join(root, 'profile'), WB_THEME_OUTPUT: output };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(executable, [fileURLToPath(new URL('./fixtures/theme-startup-electron.cjs', import.meta.url))], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = '';
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-4000); });
    const timer = setTimeout(() => child.kill(), 35000);
    const code = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', resolveExit); }).finally(() => clearTimeout(timer));
    assert.equal(code, 0, errors || 'Electron startup assertions failed');
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.results.length, 8);
    for (const entry of report.results) {
      assert.equal(entry.finalTheme, entry.expected);
      assert.equal(entry.firstVisibleFrame.theme, entry.expected);
      assert.equal(entry.firstVisibleFrame.loading, false);
    }
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) { const exited = new Promise(resolveExit => child.once('exit', resolveExit)); child.kill(); await exited; }
    await rm(root, { recursive: true, force: true });
  }
});
