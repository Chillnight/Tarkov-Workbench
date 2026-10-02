// Author: CA
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, open, rm, lstat } from 'node:fs/promises';
import { dirname, join, resolve, parse } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { checkForUpdate, checksumValue, ZIP_NAME } from '../dist/app-update.mjs';

// Release downloads redirect to GitHub's asset CDN. Never follow an HTTP or unrelated redirect.
export async function githubFetch(url, options = {}) {
  const allowed = new Set(['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);
  for (let redirects = 0; redirects < 6; redirects++) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !allowed.has(parsed.hostname)) throw new Error('The update download redirected outside GitHub.');
    const response = await fetch(parsed, { ...options, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) throw new Error('GitHub returned an incomplete download redirect.');
    url = new URL(location, parsed).href;
  }
  throw new Error('GitHub returned too many download redirects.');
}

export function validateInstallPath(directory, executable) {
  const root = resolve(directory);
  if (root === parse(root).root || dirname(resolve(executable)) !== root || executable !== join(root, 'Tarkov-Workbench.exe')) throw new Error('This app location does not support automatic updates. Download and extract the portable ZIP into its own folder.');
  return root;
}

export async function downloadVerified(candidate, directory, { fetcher = fetch, signal, progress = () => {} } = {}) {
  const hashResponse = await fetcher(candidate.checksumURL, { signal });
  if (!hashResponse.ok) throw new Error('The release checksum could not be downloaded.');
  const checksumBytes = [];
  let hashSize = 0;
  for await (const chunk of hashResponse.body) {
    hashSize += chunk.length;
    if (hashSize > 4096) throw new Error('The checksum file is too large.');
    checksumBytes.push(Buffer.from(chunk));
  }
  const expected = checksumValue(Buffer.concat(checksumBytes).toString('utf8'));
  if (candidate.digest && candidate.digest.toLowerCase() !== `sha256:${expected}`) throw new Error('GitHub and the checksum file disagree. Your current app has not been changed.');
  const response = await fetcher(candidate.url, { signal });
  if (!response.ok || !response.body) throw new Error('The portable update could not be downloaded.');
  const file = await open(join(directory, ZIP_NAME), 'wx');
  let size = 0;
  const hash = createHash('sha256');
  try {
    for await (const chunk of response.body) {
      signal?.throwIfAborted();
      size += chunk.length;
      if (size > candidate.size) throw new Error('The downloaded file exceeds the release size.');
      hash.update(chunk);
      await file.writeFile(chunk);
      progress({ text: `Downloading update · ${Math.floor(size / candidate.size * 100)}%`, percent: size / candidate.size * 100 });
    }
  } finally { await file.close(); }
  signal?.throwIfAborted();
  if (size !== candidate.size || hash.digest('hex') !== expected) throw new Error('The update failed its checksum check. Your current app has not been changed.');
}

function runHelper(script, config, mode, signal) {
  return new Promise((resolveResult, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Config', config, '-Mode', mode], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], signal });
    let errors = '';
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-3000); });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolveResult() : reject(new Error(`Update preparation failed. Your current app has not been changed. ${errors.trim()}`)));
  });
}

// Detached PowerShell can silently exit without executing the script. Launch an
// independent hidden Windows host, then confirm execution before quitting.
export async function startUpdateHelper(script, config, stage, { signal, timeoutMs = 15000 } = {}) {
  signal?.throwIfAborted();
  // Finish the short launch handshake before handling cancellation, so its child
  // can be stopped by PID rather than left waiting after a cancelled update.
  await runHelper(script, config, 'Launch');
  const pid = Number((await readFile(join(stage, 'helper-process'), 'utf8')).trim());
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) throw new Error('The update helper did not provide a valid process ID.');
  const deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      signal?.throwIfAborted();
      try {
        if ((await readFile(join(stage, 'helper-ready'), 'utf8')).trim() === String(pid)) break;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      try { process.kill(pid, 0); }
      catch { throw new Error('The update helper stopped before confirming readiness. Your current app is still running.'); }
      if (Date.now() >= deadline) throw new Error('The update helper did not start in time. Your current app is still running.');
      await delay(100, undefined, { signal });
    }
    return { pid };
  } catch (error) {
    try { process.kill(pid); } catch {}
    throw error;
  }
}

export function createAppUpdater({ app, sendProgress, fetcher = githubFetch, helperPath }) {
  let candidate = null, controller = null, handingOff = false;
  async function supported() {
    if (!app.isPackaged || process.platform !== 'win32') return false;
    try {
      const marker = JSON.parse(await readFile(join(dirname(process.execPath), 'docs', 'portable.json'), 'utf8'));
      return marker.app === 'Tarkov Workbench' && marker.distribution === 'portable';
    } catch { return false; }
  }
  async function check() {
    if (controller || handingOff) throw new Error('An update operation is already in progress.');
    candidate = null;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 20000);
    try {
      const result = await checkForUpdate({ fetcher, signal: controller.signal });
      if (result.status === 'available') candidate = result;
      return { ...result, canInstall: await supported() };
    } finally { clearTimeout(timeout); controller = null; }
  }
  async function install() {
    if (!candidate || controller || handingOff) throw new Error('Check for a newer release before updating.');
    if (!await supported()) throw new Error('Automatic installation is available in the Windows portable app.');
    const target = validateInstallPath(dirname(process.execPath), process.execPath);
    for (const path of [target, join(target, 'resources')]) {
      if ((await lstat(path)).isSymbolicLink()) throw new Error('Automatic updates do not support linked app folders.');
    }
    for (const name of ['.git', 'package.json']) {
      try { await lstat(join(target, name)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      throw new Error('Automatic updates cannot replace a source-code folder. Use a separate portable folder.');
    }
    controller = new AbortController();
    const signal = controller.signal;
    const timeout = setTimeout(() => controller?.abort(), 10 * 60 * 1000);
    let stage;
    try {
      stage = await mkdtemp(join(dirname(target), '.workbench-update-'));
      await downloadVerified(candidate, stage, { fetcher, signal, progress: sendProgress });
      sendProgress({ text: 'Verifying and preparing the update…' });
      const script = join(stage, 'apply-update.ps1'), config = join(stage, 'update.json');
      await writeFile(script, await readFile(helperPath));
      await writeFile(config, JSON.stringify({ target, stage, pid: process.pid, version: candidate.version, outcome: join(app.getPath('userData'), 'app-update-result.json') }));
      await runHelper(script, config, 'Prepare', signal);
      signal.throwIfAborted();
      sendProgress({ text: 'Starting the verified update helper…' });
      await startUpdateHelper(script, config, stage, { signal });
      handingOff = true;
      sendProgress({ text: 'Update verified. Restarting Tarkov Workbench…' });
      setTimeout(() => app.quit(), 300);
      return { restarting: true };
    } catch (error) {
      handingOff = false;
      if (stage) await rm(stage, { recursive: true, force: true }).catch(() => {});
      throw error;
    } finally { clearTimeout(timeout); controller = null; }
  }
  return { check, install, cancel() { if (!handingOff) controller?.abort(); return { cancelled: !handingOff }; } };
}
