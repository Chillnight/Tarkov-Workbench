// Author: CA
const path = require('node:path');
const { build, Platform, Arch } = require('electron-builder');
const { onlineConfig, prepareOnline, verifyOnline } = require('./online-package.cjs');
async function main() {
  await prepareOnline();
  await build({ targets: Platform.WINDOWS.createTarget(['dir'], Arch.x64), config: onlineConfig(), publish: 'never' });
  await verifyOnline(path.resolve(__dirname, '../release/online/win-unpacked'));
  console.log('Online portable runtime: release/online/win-unpacked');
}
main().catch(error => { console.error(error); process.exit(1); });
