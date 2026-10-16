// Author: CA
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const { build, Platform, Arch } = require('electron-builder');
const { onlineConfig, prepareOnline, verifyOnline } = require('./online-package.cjs');
const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));

async function main() {
  await prepareOnline();
  const output = path.join(root, 'release', 'installer');
  mkdirSync(output, { recursive: true });
  const marker = path.join(output, 'installation.json');
  writeFileSync(marker, JSON.stringify({ app: 'Tarkov Workbench', distribution: 'installer', version: pkg.build.buildVersion }) + '\n');
  const config = {
    ...onlineConfig('release/installer'),
    win: { ...pkg.build.win, target: 'nsis', signExecutable: false },
    extraResources: [...pkg.build.extraResources, { from: marker, to: 'installation.json' }, { from: 'LICENSE', to: 'LICENSE.txt' }],
    nsis: {
      oneClick: false, perMachine: false, selectPerMachineByDefault: true,
      allowElevation: true, allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true, createStartMenuShortcut: true,
      shortcutName: 'Tarkov Workbench', runAfterFinish: true,
      deleteAppDataOnUninstall: false, packElevateHelper: false,
      installerLanguages: ['en_US'], language: '1033', multiLanguageInstaller: false,
      displayLanguageSelector: false, include: 'desktop/installer.nsh',
      uninstallDisplayName: 'Tarkov Workbench',
      artifactName: 'Tarkov-Workbench-Setup.${ext}'
    }
  };
  await build({ targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64), config, publish: 'never' });
  await verifyOnline(path.join(output, 'win-unpacked'));
  const installer = path.join(output, 'Tarkov-Workbench-Setup.exe');
  const checksum = createHash('sha256').update(readFileSync(installer)).digest('hex');
  writeFileSync(path.join(output, 'Tarkov-Workbench-Setup.sha256'), `${checksum}  Tarkov-Workbench-Setup.exe\n`, 'ascii');
  console.log(`Installer: ${installer}`);
  console.log(`SHA-256: ${checksum}`);
}
main().catch(error => { console.error(error); process.exit(1); });
