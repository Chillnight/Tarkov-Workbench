// Author: CA
import { validateGearOffers } from './gear-offers.mjs';
import { filterRigs } from './rigs.mjs';

export function importBackpacks(source, locale) {
  const backpacks = {};
  const translate = value => locale[value] ?? value;
  for (const item of Object.values(source.items)) {
    const p = item.properties ?? {};
    if (p.propertiesType !== 'ItemPropertiesBackpack') continue;
    backpacks[item.id] = { id: item.id, name: translate(item.name), shortName: translate(item.shortName), icon: `images/${item.id}.webp`, iconSource: item.iconLink, width: item.width, height: item.height, weight: item.weight, capacity: p.capacity, grids: (p.grids ?? []).map(g => ({ width: g.width, height: g.height })), speedPenalty: Number.isFinite(p.speedPenalty) ? p.speedPenalty : null, turnPenalty: Number.isFinite(p.turnPenalty) ? p.turnPenalty : null, ergoPenalty: Number.isFinite(p.ergoPenalty) ? p.ergoPenalty : null, wiki: item.wikiLink ?? null, updated: item.updated ?? null };
  }
  validateBackpackData({ backpacks });
  return { backpacks };
}

export function validateBackpackData(catalog, validateImageSource = () => true) {
  const fail = message => { throw new Error(`Data validation failed: ${message}`); };
  if (catalog.backpacks === undefined) { if (catalog.meta?.backpackCount !== undefined) fail('missing backpack database'); return; }
  if (!catalog.backpacks || Array.isArray(catalog.backpacks) || typeof catalog.backpacks !== 'object' || Object.keys(catalog.backpacks).length > 500) fail('invalid backpack database');
  if (catalog.meta?.backpackCount !== undefined && catalog.meta.backpackCount !== Object.keys(catalog.backpacks).length) fail('backpack totals do not match');
  for (const [id, bag] of Object.entries(catalog.backpacks)) {
    if (!bag || !/^[a-f0-9]{24}$/.test(id) || bag.id !== id || typeof bag.name !== 'string' || !bag.name || bag.name.length > 500 || typeof bag.shortName !== 'string' || bag.shortName.length > 100) fail('invalid backpack identity');
    if (![bag.width, bag.height].every(n => Number.isInteger(n) && n > 0 && n <= 16) || !Number.isFinite(bag.weight) || bag.weight < 0 || !Number.isInteger(bag.capacity) || bag.capacity < 1 || bag.capacity > 200) fail('invalid backpack storage stats');
    if (bag.icon !== `images/${id}.webp` || !validateImageSource(bag.iconSource)) fail('invalid backpack image');
    if (!Array.isArray(bag.grids) || !bag.grids.length || bag.grids.length > 64 || bag.grids.some(g => !g || ![g.width, g.height].every(n => Number.isInteger(n) && n > 0 && n <= 16)) || bag.grids.reduce((sum, g) => sum + g.width * g.height, 0) !== bag.capacity) fail('backpack pocket sizes do not match capacity');
    for (const key of ['speedPenalty', 'turnPenalty', 'ergoPenalty']) if (!(bag[key] === null || Number.isFinite(bag[key]) && Math.abs(bag[key]) <= 1)) fail('invalid backpack penalty');
    validateGearOffers(bag);
  }
}

export function filterBackpacks(backpacks, options) { return filterRigs(backpacks, { ...options, type: 'backpacks' }); }
