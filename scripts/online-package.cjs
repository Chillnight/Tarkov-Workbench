// Author: CA
const path = require('node:path');
const { mkdir, copyFile } = require('node:fs/promises');
const { listPackage } = require('@electron/asar');
const pkg = require('../package.json');
const root = path.resolve(__dirname, '..');
function onlineConfig(output = 'release/online') {
  return {
    ...pkg.build,
    directories: { ...pkg.build.directories, output },
    files: [
      'dist/**/*', '!dist/data/catalog.json', '!dist/data/catalog.next.json',
      '!dist/data/manifest.json', '!dist/data/precomputed.json', '!dist/images/**/*',
      'desktop/**/*', '!desktop/native-solver/**/*', '!desktop/cp-solver/**/*',
      '!desktop/installer.nsh', '!desktop/installer-check.ps1', 'package.json'
    ],
    win: { ...pkg.build.win, target: 'dir', signExecutable: false }
  };
}
async function prepareOnline() {
  const { verifyNativeRuntime } = await import('./prepare-cp-solver.mjs');
  await verifyNativeRuntime();
  await mkdir(path.join(root, 'dist', 'data'), { recursive: true });
  await copyFile(path.join(root, 'scripts', 'overrides.json'), path.join(root, 'dist', 'data', 'overrides.json'));
}
async function verifyOnline(runtime) {
  const { verifyNativeRuntime } = await import('./prepare-cp-solver.mjs');
  await verifyNativeRuntime(path.join(runtime, 'resources', 'cp-solver'));
  const entries = listPackage(path.join(runtime, 'resources', 'app.asar')).map(entry => entry.replaceAll('\\', '/'));
  if (!entries.includes('/dist/app.mjs') || !entries.includes('/dist/data/overrides.json')) throw new Error('Online runtime is missing required app files.');
  if (entries.some(entry => entry.startsWith('/dist/images/') || ['/dist/data/catalog.json', '/dist/data/catalog.next.json', '/dist/data/manifest.json', '/dist/data/precomputed.json'].includes(entry))) throw new Error('Online runtime unexpectedly contains downloaded game data or images.');
}
module.exports = { onlineConfig, prepareOnline, verifyOnline };
