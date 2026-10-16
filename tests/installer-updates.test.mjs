// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { APP_VERSION, REPOSITORY, ZIP_NAME, HASH_NAME, SETUP_NAME, SETUP_HASH_NAME, inspectRelease, checksumValue } from '../dist/app-update.mjs';
import { createAppUpdater, installationKind, cleanupInstallerDownloads, launchSetup } from '../desktop/app-updater.mjs';
const next = APP_VERSION.split('.').map((value, i) => i === 3 ? Number(value) + 1 : value).join('.');
const bytes = Buffer.from('verified installer fixture');
const digest = createHash('sha256').update(bytes).digest('hex');
function release(names = [ZIP_NAME, HASH_NAME, SETUP_NAME, SETUP_HASH_NAME]) {
  return { tag_name: 'v' + next, assets: names.map(name => ({ name, state: 'uploaded', size: name.endsWith('.sha256') ? 104 : bytes.length, digest: name.endsWith('.sha256') ? undefined : 'sha256:' + digest, browser_download_url: `https://github.com/${REPOSITORY}/releases/download/v${next}/${name}` })) };
}
test('each distribution requires its own verified release assets and checksum filename', () => {
  assert.equal(inspectRelease(release()).assetName, ZIP_NAME);
  assert.equal(inspectRelease(release(), APP_VERSION, 'installer').assetName, SETUP_NAME);
  assert.throws(() => inspectRelease(release([ZIP_NAME, HASH_NAME]), APP_VERSION, 'installer'), /installer/);
  assert.throws(() => inspectRelease(release([SETUP_NAME, SETUP_HASH_NAME])), /portable/);
  assert.equal(inspectRelease({ tag_name: 'v' + APP_VERSION }, APP_VERSION, 'installer').status, 'current');
  assert.equal(checksumValue(`${digest}  ${SETUP_NAME}`, SETUP_NAME), digest);
  assert.throws(() => checksumValue(`${digest}  ${ZIP_NAME}`, SETUP_NAME));
  assert.throws(() => checksumValue(`${digest}  ${SETUP_NAME}`));
  assert.throws(() => inspectRelease(release(), APP_VERSION, 'other'));
});
test('installed updates launch only the verified installer at the existing path; failure and cancellation retain the app', { skip: process.platform !== 'win32' }, async () => {
  for (const scenario of ['success', 'launch-failure', 'corrupt', 'cancel']) {
    const root = await mkdtemp(join(tmpdir(), 'workbench installer update-'));
    const target = join(root, 'Tarkov Workbench ü [app]'), profile = join(root, 'profile');
    let launched = null, quits = 0;
    try {
      await mkdir(join(target, 'resources'), { recursive: true });
      await mkdir(profile);
      const executable = join(target, 'Tarkov-Workbench.exe');
      await writeFile(executable, 'original executable');
      await writeFile(join(target, 'Uninstall Tarkov-Workbench.exe'), 'original uninstaller');
      await writeFile(join(target, 'resources', 'installation.json'), JSON.stringify({ app: 'Tarkov Workbench', distribution: 'installer', version: APP_VERSION }));
      await writeFile(join(profile, 'settings.json'), 'original settings');
      const app = { isPackaged: true, getPath: () => profile, quit: () => { quits++; } };
      assert.equal(await installationKind(app, executable), 'installer');
      let updater;
      updater = createAppUpdater({ app, executable, sendProgress() {},
        fetcher: async url => {
          if (url.endsWith('/latest')) return Response.json(release());
          if (scenario === 'cancel') updater.cancel();
          return new Response(url.endsWith('.sha256') ? `${digest}  ${SETUP_NAME}` : scenario === 'corrupt' ? Buffer.alloc(bytes.length) : bytes);
        },
        launchInstaller: async (file, directory) => {
          assert.equal(directory, target);
          assert.equal(await readFile(file, 'utf8'), bytes.toString());
          if (scenario === 'launch-failure') throw Error('launch failed');
          launched = file;
        }
      });
      const check = await updater.check();
      assert.equal(check.canInstall, true);
      assert.equal(check.assetName, SETUP_NAME);
      if (scenario === 'success') {
        assert.deepEqual(await updater.install(), { restarting: true, installer: true });
        assert.ok(launched.endsWith(SETUP_NAME));
        await new Promise(resolve => setTimeout(resolve, 350));
        assert.equal(quits, 1);
      } else {
        await assert.rejects(updater.install());
        assert.equal(launched, null);
        assert.equal(quits, 0);
        assert.deepEqual(await readdir(join(profile, 'Installer Updates')), []);
      }
      assert.equal(await readFile(executable, 'utf8'), 'original executable');
      assert.equal(await readFile(join(target, 'Uninstall Tarkov-Workbench.exe'), 'utf8'), 'original uninstaller');
      assert.equal(await readFile(join(profile, 'settings.json'), 'utf8'), 'original settings');
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});
test('installer cache cleanup retains unrelated files and removes only its own setup downloads', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'workbench installer cleanup-'));
  try {
    const cache = join(profile, 'Installer Updates');
    for (const name of ['setup-valid123', 'setup-unrelated', 'other']) await mkdir(join(cache, name), { recursive: true });
    await writeFile(join(cache, 'setup-valid123', SETUP_NAME), bytes);
    await writeFile(join(cache, 'setup-unrelated', 'keep.txt'), 'personal data');
    await writeFile(join(cache, 'other', SETUP_NAME), bytes);
    await cleanupInstallerDownloads(profile);
    assert.deepEqual((await readdir(cache)).sort(), ['other', 'setup-unrelated']);
  } finally { await rm(profile, { recursive: true, force: true }); }
});
test('installer launcher refuses malformed target arguments before starting a process', async () => {
  for (const target of ['C:\\Bad"Folder', 'C:\\Bad\nFolder', 'C:\\Bad\rFolder']) assert.throws(() => launchSetup(join(tmpdir(), SETUP_NAME), target), /Invalid installer/);
  assert.throws(() => launchSetup(join(tmpdir(), 'other.exe'), 'C:\\App'), /Invalid installer/);
});
