// Author: CA
export const APP_VERSION = '1.9.0.6';
export const REPOSITORY = 'Chillnight/Tarkov-Workbench';
export const RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
export const ZIP_NAME = 'Tarkov-Workbench-Online-Portable.zip';
export const HASH_NAME = 'Tarkov-Workbench-Online-Portable.sha256';

export function versionParts(value) {
  if (typeof value !== 'string' || !/^v?\d+\.\d+\.\d+(?:\.\d+)?$/.test(value)) return null;
  const parts = value.replace(/^v/, '').split('.').map(Number);
  if (parts.some(part => !Number.isSafeInteger(part))) return null;
  return [...parts, ...Array(4 - parts.length).fill(0)];
}

export function compareVersions(left, right) {
  const a = versionParts(left), b = versionParts(right);
  if (!a || !b) throw new Error('The release version could not be verified.');
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

function assetURL(asset, tag) {
  const expected = `https://github.com/${REPOSITORY}/releases/download/${encodeURIComponent(tag)}/${asset.name}`;
  if (asset.browser_download_url !== expected || asset.state !== 'uploaded') throw new Error('The release download could not be verified.');
  return expected;
}

export function inspectRelease(release, current = APP_VERSION) {
  if (!release || release.draft || release.prerelease) throw new Error('No stable release could be verified. Please try again later.');
  if (compareVersions(release.tag_name, current) <= 0) return { status: 'current', current };
  const zip = release.assets?.find(asset => asset.name === ZIP_NAME);
  const checksum = release.assets?.find(asset => asset.name === HASH_NAME);
  if (!zip || !checksum) throw new Error('The newer release is missing its portable download or checksum. Please try again later.');
  if (!Number.isSafeInteger(zip.size) || zip.size < 1 || zip.size > 512 * 1024 * 1024 || !Number.isSafeInteger(checksum.size) || checksum.size < 1 || checksum.size > 4096) throw new Error('The release download size could not be verified.');
  if (zip.digest && !/^sha256:[a-f\d]{64}$/i.test(zip.digest)) throw new Error('The release checksum format is not supported.');
  return { status: 'available', current, version: release.tag_name.replace(/^v/, ''), size: zip.size,
    url: assetURL(zip, release.tag_name), checksumURL: assetURL(checksum, release.tag_name), digest: zip.digest ?? null };
}

export function checksumValue(text) {
  const match = /^([a-f\d]{64})\s+\*?Tarkov-Workbench-Online-Portable\.zip\s*$/i.exec(text.trim());
  if (!match) throw new Error('The downloaded checksum file is invalid. Your current app has not been changed.');
  return match[1].toLowerCase();
}

export async function checkForUpdate({ fetcher = fetch, signal, current = APP_VERSION } = {}) {
  const response = await fetcher(RELEASE_API, { signal, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' } });
  if (response.status === 404) return { status: 'current', current };
  if (response.status === 403 || response.status === 429) throw new Error('GitHub temporarily limited update checks. Please try again later.');
  if (!response.ok) throw new Error('GitHub could not be reached. Please try again later.');
  const body = await response.text();
  if (body.length > 2 * 1024 * 1024) throw new Error('The release response is too large.');
  return inspectRelease(JSON.parse(body), current);
}
