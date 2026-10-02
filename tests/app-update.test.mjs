// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_VERSION, REPOSITORY, ZIP_NAME, HASH_NAME, compareVersions, inspectRelease, checkForUpdate, checksumValue } from '../dist/app-update.mjs';
import { downloadVerified, validateInstallPath, createAppUpdater, githubFetch } from '../desktop/app-updater.mjs';

function release(tag = 'v1.9.0.4') {
  return { tag_name: tag, assets: [ZIP_NAME, HASH_NAME].map(name => ({ name, state: 'uploaded', size: name === ZIP_NAME ? 64 : 104, browser_download_url: `https://github.com/${REPOSITORY}/releases/download/${tag}/${name}` })) };
}
test('numeric versions handle fourth components, padding and larger minor versions', () => {
  assert.equal(APP_VERSION, '1.9.0.3');
  for (const [a, b, expected] of [['1.9.0.10', '1.9.0.3', 1], ['v1.9.0.3', '1.9.0.3', 0], ['1.9.0', '1.9.0.0', 0], ['1.10.0', '1.9.0.99', 1], ['1.9.0.2', '1.9.0.3', -1]]) assert.equal(compareVersions(a, b), expected);
  for (const value of ['1.9', '1.9.0-beta', '', '1.9.0.3.4', '9007199254740992.1.0']) assert.throws(() => compareVersions(value, APP_VERSION));
});
test('only a strictly newer stable release offers an update; equal and older never downgrade', () => {
  assert.equal(inspectRelease(release()).status, 'available');
  for (const tag of ['v1.9.0.3', 'v1.9.0.2', 'v1.8.5']) assert.equal(inspectRelease({ tag_name: tag }).status, 'current');
  for (const flags of [{ draft: true }, { prerelease: true }]) assert.throws(() => inspectRelease({ ...release(), ...flags }));
});
test('release assets require expected names, safe sizes, checksum and exact repository URLs', () => {
  for (const mutate of [r => r.assets.pop(), r => { r.assets[0].browser_download_url = 'https://example.com/app.zip'; }, r => { r.assets[0].size = -1; }, r => { r.assets[0].size = 1024 ** 3; }, r => { r.assets[0].state = 'new'; }, r => { r.assets[0].digest = 'md5:123'; }]) {
    const data = release(); mutate(data); assert.throws(() => inspectRelease(data));
  }
});
test('no published release is current; network and rate-limit failures are not no-update results', async () => {
  assert.equal((await checkForUpdate({ fetcher: async () => new Response('', { status: 404 }) })).status, 'current');
  for (const status of [403, 429, 500]) await assert.rejects(checkForUpdate({ fetcher: async () => new Response('', { status }) }));
  await assert.rejects(checkForUpdate({ fetcher: async () => { throw new Error('offline'); } }), /offline/);
  await assert.rejects(checkForUpdate({ fetcher: async () => new Response('not json') }));
  assert.equal((await checkForUpdate({ fetcher: async () => Response.json(release()) })).version, '1.9.0.4');
});
test('checksum must name the exact portable file', () => {
  assert.equal(checksumValue(`${'A'.repeat(64)}  ${ZIP_NAME}\r\n`), 'a'.repeat(64));
  assert.throws(() => checksumValue(`${'a'.repeat(64)}  other.zip`));
});
test('verified downloader rejects corruption, size mismatches and cancellation without replacing the app', async () => {
  const data = Buffer.from('test portable bytes');
  const hash = createHash('sha256').update(data).digest('hex');
  const candidate = { ...inspectRelease(release()), size: data.length, digest: `sha256:${hash}` };
  const fetcher = async url => new Response(url.endsWith('.sha256') ? `${hash}  ${ZIP_NAME}` : data);
  for (const variant of ['valid', 'corrupt', 'size', 'digest', 'cancel', 'large-checksum']) {
    const dir = await mkdtemp(join(tmpdir(), 'workbench-update-test-'));
    try {
      const options = { fetcher };
      const copy = { ...candidate };
      if (variant === 'corrupt') options.fetcher = async url => new Response(url.endsWith('.sha256') ? `${hash}  ${ZIP_NAME}` : Buffer.alloc(data.length));
      if (variant === 'size') copy.size++;
      if (variant === 'digest') copy.digest = `sha256:${'f'.repeat(64)}`;
      if (variant === 'cancel') options.signal = AbortSignal.abort();
      if (variant === 'large-checksum') options.fetcher = async () => new Response('a'.repeat(5000));
      if (variant === 'valid') { await downloadVerified(copy, dir, options); assert.deepEqual(await readFile(join(dir, ZIP_NAME)), data); }
      else await assert.rejects(downloadVerified(copy, dir, options));
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});
test('installer rejects root locations and unrelated executable paths', () => {
  if (process.platform !== 'win32') return;
  assert.throws(() => validateInstallPath('C:\\', 'C:\\Tarkov-Workbench.exe'));
  assert.throws(() => validateInstallPath('F:\\App', 'F:\\Other\\Tarkov-Workbench.exe'));
  assert.equal(validateInstallPath('F:\\App', 'F:\\App\\Tarkov-Workbench.exe'), 'F:\\App');
});
test('desktop backend checks on demand and refuses install without a verified candidate', async () => {
  let calls = 0;
  const updater = createAppUpdater({ app: { isPackaged: false }, sendProgress() {}, fetcher: async () => { calls++; return Response.json(release()); } });
  assert.equal(calls, 0);
  await assert.rejects(updater.install(), /Check/);
  assert.equal((await updater.check()).canInstall, false);
  await assert.rejects(updater.install(), /portable/);
  assert.equal(calls, 1);
});
test('GitHub transport refuses foreign hosts, HTTP and credentials before making a request', async () => {
  for (const url of ['http://github.com/test', 'https://example.com/test', 'https://name:password@github.com/test']) await assert.rejects(githubFetch(url), /outside GitHub/);
});
