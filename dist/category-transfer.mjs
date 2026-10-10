// Author: CA

const PROFILE_KEYS = Object.freeze([
  'weaponId', 'mode', 'sound', 'balance', 'scopeId', 'magazineId', 'magazine',
  'maxBudget', 'allowGrenadeLaunchers', 'restrictTraders', 'traderLevels',
  'includeFleaMarket', 'includeBarters', 'includeQuestOffers',
  'excludeArenaUnlocks', 'preferPracticalMounts', 'preferLighterParts'
]);

function stableLevels(levels) {
  if (!levels || typeof levels !== 'object') return null;
  return Object.fromEntries(Object.entries(levels).sort(([left], [right]) => left.localeCompare(right)));
}

export function profileFingerprint(profile = {}) {
  const normalized = {};
  for (const key of PROFILE_KEYS) normalized[key] = key === 'traderLevels' ? stableLevels(profile[key]) : profile[key] ?? null;
  return JSON.stringify(normalized);
}

export function transferIsCurrent({
  catalog,
  expectedCatalog,
  currentProfile,
  expectedProfile,
  token,
  expectedToken
} = {}) {
  return catalog === expectedCatalog && token === expectedToken && profileFingerprint(currentProfile) === expectedProfile;
}
