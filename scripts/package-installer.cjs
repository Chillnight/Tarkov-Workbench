// Author: CA
const { createHash } = require('node:crypto');
const { createReadStream, existsSync, readdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { finished } = require('node:stream/promises');
const { build, Platform, Arch } = require('electron-builder');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const catalog = path.join(root, 'dist', 'data', 'catalog.json');
const images = path.join(root, 'dist', 'images');
const installer = path.join(root, 'release', 'Tarkov-Workbench-Setup.exe');

async function sha256(file) {
  const hash = createHash('sha256');
  const stream = createReadStream(file);
  stream.on('data', chunk => hash.update(chunk));
  await finished(stream);
  return hash.digest('hex').toUpperCase();
}

async function main() {
  if (!existsSync(catalog) || !existsSync(images) || readdirSync(images).length === 0) {
    throw new Error('The local game-data snapshot is missing. Run npm run sync before building an offline installer.');
  }
  const config = {
    ...pkg.build,
    win: {
      ...pkg.build.win,
      target: 'nsis',
      signExecutable: false
    },
    nsis: {
      oneClick: true,
      perMachine: false,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      runAfterFinish: true,
      artifactName: 'Tarkov-Workbench-Setup.${ext}'
    }
  };
  await build({ targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64), config, publish: 'never' });
  if (!existsSync(installer)) throw new Error('Installer was not created.');
  const checksum = await sha256(installer);
  writeFileSync(path.join(root, 'release', 'Tarkov-Workbench-Setup.sha256'), `${checksum}  Tarkov-Workbench-Setup.exe\n`, 'ascii');
  console.log(`Installer: ${installer}`);
  console.log(`SHA-256: ${checksum}`);
  console.log('Installer is unsigned; public trust depends on Windows reputation or a future trusted signing channel.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
