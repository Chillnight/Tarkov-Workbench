// Author: CA
import { optimize, validateBuild } from './optimizer.mjs';
import { moddableWeapons } from './weapon-picker.mjs';
import { isAvailable } from './availability.mjs';
import { buildCost } from './traders.mjs';

const CATEGORY_LABELS = Object.freeze({
  'Assault carbine': 'Carbine · Assault carbines',
  'Assault rifle': 'AR · Assault rifles',
  'Grenade launcher': 'GL · Grenade launchers',
  Handgun: 'Pistol · Handguns',
  Machinegun: 'MG · Machineguns',
  'Marksman rifle': 'DMR · Marksman rifles',
  Revolver: 'Revolver · Revolvers',
  'Rocket Launcher': 'RL · Rocket launchers',
  Shotgun: 'Shotgun · Shotguns',
  SMG: 'SMG · Submachine guns',
  'Sniper rifle': 'SR · Sniper rifles'
});

// Labels follow the English weapon names in the current regular catalog. Keep
// this explicit: a raw code such as 762x51 does not carry its decimal point.
const CALIBER_LABELS = Object.freeze({
  Caliber1143x23ACP: '.45 ACP',
  Caliber127x33: '.50 AE',
  Caliber127x55: '12.7×55',
  Caliber127x99: '.50 BMG',
  Caliber12g: '12 gauge',
  Caliber20g: '20 gauge',
  Caliber20x1mm: '20×1 mm',
  Caliber23x75: '23×75',
  Caliber26x75: '26×75',
  Caliber366TKM: '.366 TKM',
  Caliber40x46: '40×46',
  Caliber46x30: '4.6×30',
  Caliber545x39: '5.45×39',
  Caliber556x45NATO: '5.56×45',
  Caliber57x28: '5.7×28',
  Caliber58x42: '5.8×42',
  Caliber68x51: '6.8×51',
  Caliber725: '72.5 mm',
  Caliber762x25TT: '7.62×25 TT',
  Caliber762x35: '.300 Blackout',
  Caliber762x39: '7.62×39',
  Caliber762x51: '7.62×51',
  Caliber762x54R: '7.62×54R',
  Caliber784x49: '.308 ME',
  Caliber86x70: '.338 LM',
  Caliber93x64: '9.3×64',
  Caliber9x18PM: '9×18 PM',
  Caliber9x18PMM: '9×18 PMM',
  Caliber9x19PARA: '9×19',
  Caliber9x21: '9×21',
  Caliber9x33R: '.357',
  Caliber9x39: '9×39'
});

const MODES = new Set(['ergo', 'recoil', 'balanced']);
const SOUNDS = new Set(['silenced', 'unsilenced']);
const EPSILON = 1e-8;

const finite = value => typeof value === 'number' && Number.isFinite(value);
const compareNumber = (left, right, direction = 1) => {
  if (!finite(left) || !finite(right)) return 0;
  const difference = left - right;
  if (Math.abs(difference) <= EPSILON) return 0;
  return (difference < 0 ? -1 : 1) * direction;
};

export function caliberLabel(caliber) {
  if (caliber === null || caliber === undefined || caliber === '') return 'Unknown caliber';
  const key = String(caliber);
  return CALIBER_LABELS[key] ?? key.replace(/^Caliber/, '').replace(/x/g, '×');
}

function categoryLabel(category) {
  return CATEGORY_LABELS[category] ?? category;
}

function weaponSort(left, right) {
  return left.shortName.localeCompare(right.shortName) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function normalizedSharedOptions(options = {}) {
  const source = options && typeof options === 'object' ? options : {};
  return {
    ...source,
    // A scope or a specific magazine belongs to one weapon and cannot be
    // transferred safely across a category comparison.
    scopeId: null,
    magazineId: null,
    // A capacity target of one keeps the comparison fair while letting the
    // existing optimizer select any compatible magazine independently.
    magazine: 1
  };
}

function availableWeapons(catalog, options = {}) {
  if (!catalog?.items || typeof catalog.items !== 'object') return [];
  const shared = normalizedSharedOptions(options);
  return moddableWeapons(catalog)
    .filter(item => isAvailable(item, { ...shared, weaponId: item.id }, catalog))
    .sort(weaponSort);
}

export function comparisonWeapons(catalog, { category, caliber = null, ...shared } = {}) {
  if (typeof category !== 'string' || !category) return [];
  return availableWeapons(catalog, shared)
    .filter(item => item.category === category && (caliber === null || item.caliber === caliber));
}

export function categoryChoices(catalog, sharedOptions = {}) {
  const groups = new Map();
  for (const item of availableWeapons(catalog, sharedOptions)) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  return [...groups.entries()]
    .map(([id, items]) => {
      const calibers = new Map();
      for (const item of items) {
        const caliber = item.caliber ?? null;
        const key = caliber ?? '';
        const current = calibers.get(key) ?? { id: caliber, label: caliberLabel(caliber), count: 0 };
        current.count += 1;
        calibers.set(key, current);
      }
      return {
        id,
        label: categoryLabel(id),
        count: items.length,
        calibers: [...calibers.values()].sort((left, right) => left.label.localeCompare(right.label) || String(left.id).localeCompare(String(right.id)))
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
}

function comparisonSelection(options, weaponId) {
  const { category: _category, caliber: _caliber, ...shared } = normalizedSharedOptions(options);
  const mode = options?.mode;
  const sound = options?.sound;
  return {
    ...shared,
    weaponId,
    mode,
    sound,
    balance: options?.balance,
    scopeId: null,
    magazineId: null,
    magazine: 1
  };
}

function finiteCost(cost) {
  return Boolean(cost && finite(cost.priceRUB) && Number.isInteger(cost.unpriced) && cost.unpriced >= 0 &&
    Number.isInteger(cost.barterCount) && cost.barterCount >= 0 && Number.isInteger(cost.factoryCount) && cost.factoryCount >= 0 &&
    Number.isInteger(cost.fleaCount) && cost.fleaCount >= 0);
}

function sameNumber(left, right, tolerance = EPSILON) {
  return finite(left) && finite(right) && Math.abs(left - right) <= tolerance;
}

function recomputedMetrics(catalog, selection, rows) {
  const weapon = catalog.items[selection.weaponId];
  const ids = [selection.weaponId, ...rows.map(row => row.itemId)];
  const rawErgo = ids.reduce((sum, id) => sum + (catalog.items[id]?.ergo ?? 0), 0);
  const recoil = ids.reduce((sum, id) => sum + (catalog.items[id]?.recoil ?? 0), 0);
  const weight = ids.reduce((sum, id) => sum + (catalog.items[id]?.weight ?? 0), 0);
  return {
    rawErgo,
    ergo: Math.min(100, Math.max(0, rawErgo)),
    recoil,
    vertical: Math.max(0, weapon.vertical * (1 + recoil)),
    horizontal: Math.max(0, weapon.horizontal * (1 + recoil)),
    weight,
    cost: buildCost(catalog, selection, rows)
  };
}

function validateCandidate(catalog, selection, result) {
  if (!result || !['optimal', 'feasible'].includes(result.status)) {
    const message = result?.message ?? (result?.status === 'infeasible'
      ? 'No compatible build fits the current availability and attachment budget.'
      : 'The optimizer did not produce a ranked build.');
    return { ok: false, status: result?.status ?? 'error', message };
  }
  if (!Array.isArray(result.rows)) return { ok: false, status: 'error', message: 'The optimizer returned no assembly rows.' };
  const errors = validateBuild(catalog, selection, result.rows);
  if (errors.length) return { ok: false, status: 'error', message: `Compatibility validation failed: ${errors.join('; ')}` };
  const metrics = recomputedMetrics(catalog, selection, result.rows);
  const numericFields = ['ergo', 'rawErgo', 'recoil', 'vertical', 'horizontal', 'weight', 'seconds', 'considered', 'conflictCount'];
  if (numericFields.some(field => !finite(result[field]))) return { ok: false, status: 'error', message: 'The optimizer returned a non-finite result field.' };
  if (!finite(result.cost?.priceRUB) || !finite(result.cost?.unpriced) || !finite(result.cost?.barterCount) || !finite(result.cost?.factoryCount) || !finite(result.cost?.fleaCount)) {
    return { ok: false, status: 'error', message: 'The optimizer returned invalid build cost data.' };
  }
  if (!finiteCost(metrics.cost)) return { ok: false, status: 'error', message: 'The recomputed build cost is invalid.' };
  if (!sameNumber(result.rawErgo, metrics.rawErgo, 1e-6) || !sameNumber(result.ergo, metrics.ergo, 1e-6) ||
      !sameNumber(result.recoil, metrics.recoil, 1e-8) || !sameNumber(result.vertical, metrics.vertical, 1e-6) ||
      !sameNumber(result.horizontal, metrics.horizontal, 1e-6) || !sameNumber(result.weight, metrics.weight, 1e-6) ||
      !sameNumber(result.cost.priceRUB, metrics.cost.priceRUB, 0.01) || result.cost.unpriced !== metrics.cost.unpriced ||
      result.cost.barterCount !== metrics.cost.barterCount || result.cost.factoryCount !== metrics.cost.factoryCount ||
      result.cost.fleaCount !== metrics.cost.fleaCount) {
    return { ok: false, status: 'error', message: 'The reported build statistics do not match its assembled parts.' };
  }
  return { ok: true, metrics };
}

function rankComparator(catalog, mode, balance, preferLighterParts) {
  return (left, right) => {
    const a = left.result;
    const b = right.result;
    let comparison = 0;
    if (mode === 'ergo') {
      comparison = compareNumber(b.ergo, a.ergo) || compareNumber(a.vertical, b.vertical) || compareNumber(a.horizontal, b.horizontal);
    } else if (mode === 'recoil') {
      comparison = compareNumber(a.vertical, b.vertical) || compareNumber(a.horizontal, b.horizontal) || compareNumber(b.ergo, a.ergo);
    } else {
      const aShortfall = Math.max(0, balance - a.ergo);
      const bShortfall = Math.max(0, balance - b.ergo);
      comparison = compareNumber(aShortfall, bShortfall) || compareNumber(a.vertical, b.vertical) || compareNumber(a.horizontal, b.horizontal) || compareNumber(b.ergo, a.ergo);
    }
    if (comparison) return comparison;
    const aCost = a.cost;
    const bCost = b.cost;
    const compareWeight = compareNumber(a.weight, b.weight);
    const comparePrice = compareNumber(aCost.unpriced, bCost.unpriced) || compareNumber(aCost.priceRUB, bCost.priceRUB);
    comparison = preferLighterParts === false ? comparePrice || compareWeight : compareWeight || comparePrice;
    if (comparison) return comparison;
    const aItem = catalog.items[left.weaponId] ?? { id: left.weaponId, name: left.weaponId, shortName: left.weaponId };
    const bItem = catalog.items[right.weaponId] ?? { id: right.weaponId, name: right.weaponId, shortName: right.weaponId };
    return weaponSort(aItem, bItem);
  };
}

function validateOptions(options = {}) {
  if (!MODES.has(options.mode)) throw new Error('Invalid category comparison objective.');
  if (!SOUNDS.has(options.sound)) throw new Error('Invalid category comparison suppressor variant.');
  if (!finite(options.balance) || options.balance < 0 || options.balance > 100) throw new Error('Invalid category comparison ergonomics target.');
  if (options.maxBudget !== null && options.maxBudget !== undefined &&
      (!Number.isSafeInteger(options.maxBudget) || options.maxBudget < 1 || options.maxBudget > 100000000)) {
    throw new Error('Invalid category comparison attachment budget.');
  }
}

export function compareCategory(catalog, options = {}, solver, progress = () => {}) {
  validateOptions(options);
  const category = typeof options.category === 'string' ? options.category : null;
  const caliber = options.caliber === null || options.caliber === undefined ? null : options.caliber;
  const weapons = category ? comparisonWeapons(catalog, { ...options, category, caliber }) : [];
  const total = weapons.length;
  const started = Date.now();
  const entries = [];
  const excluded = [];
  let checked = 0;
  const emit = message => progress(message, checked, total);
  if (!category || !total) {
    return { status: 'empty', category, caliber, mode: options.mode, sound: options.sound, entries, excluded, checked, total, completeRanking: false, seconds: (Date.now() - started) / 1000 };
  }
  for (const item of weapons) {
    const selection = comparisonSelection(options, item.id);
    emit(`Calculating ${item.shortName} …`);
    try {
      const result = optimize(catalog, selection, solver, message => emit(`${item.shortName}: ${message}`));
      const validation = validateCandidate(catalog, selection, result);
      if (validation.ok) entries.push({ weaponId: item.id, selection, result });
      else excluded.push({ weaponId: item.id, status: validation.status, message: validation.message });
    } catch (error) {
      excluded.push({ weaponId: item.id, status: 'error', message: error?.message || 'The optimizer failed for this weapon.' });
    } finally {
      checked += 1;
      emit(`Finished ${item.shortName}.`);
    }
  }
  entries.sort(rankComparator(catalog, options.mode, options.balance, options.preferLighterParts));
  entries.forEach((entry, index) => { entry.rank = index + 1; });
  const completeRanking = checked === total && excluded.every(item => item.status === 'infeasible') && entries.every(item => item.result.status === 'optimal');
  const incompleteExclusions = excluded.some(item => item.status !== 'infeasible');
  return {
    status: incompleteExclusions ? 'partial' : 'complete',
    category,
    caliber,
    mode: options.mode,
    sound: options.sound,
    entries,
    excluded,
    checked,
    total,
    completeRanking,
    seconds: (Date.now() - started) / 1000
  };
}
