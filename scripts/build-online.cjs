// Author: CA
const path = require('node:path');
const { mkdir, copyFile } = require('node:fs/promises');
const { build, Platform, Arch } = require('electron-builder');
const { listPackage } = require('@electron/asar');
const pkg = require('../package.json');
const root = path.resolve(__dirname, '..');

async function main() {
  const dataDirectory = path.join(root, 'dist', 'data');
  await mkdir(dataDirectory, { recursive: true });
  await copyFile(path.join(root, 'scripts', 'overrides.json'), path.join(dataDirectory, 'overrides.json'));
  const config = {
    ...pkg.build,
    directories: { ...pkg.build.directories, output: path.join('release', 'online') },
    files: [
      'dist/**/*',
      '!dist/data/catalog.json',
      '!dist/data/catalog.next.json',
      '!dist/data/manifest.json',
      '!dist/data/precomputed.json',
      '!dist/images/**/*',
      'desktop/**/*',
      'package.json'
    ],
    win: { ...pkg.build.win, target: 'dir', signExecutable: false }
  };
  await build({ targets: Platform.WINDOWS.createTarget(['dir'], Arch.x64), config, publish: 'never' });
  const archive = path.join(root, 'release', 'online', 'win-unpacked', 'resources', 'app.asar');
  const entries = listPackage(archive).map(entry => entry.replaceAll('\\', '/'));
  if (!entries.includes('/dist/app.mjs') || !entries.includes('/dist/data/overrides.json')) throw new Error('Online runtime is missing required app files.');
  if (entries.some(entry => entry.startsWith('/dist/images/') || ['/dist/data/catalog.json', '/dist/data/catalog.next.json', '/dist/data/manifest.json', '/dist/data/precomputed.json'].includes(entry))) {
    throw new Error('Online runtime unexpectedly contains downloaded game data or images.');
  }
  console.log('Online portable runtime: release/online/win-unpacked');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
