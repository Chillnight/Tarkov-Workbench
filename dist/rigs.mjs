// Author: CA
import { validateGearOffers } from './gear-offers.mjs';
const idPattern = /^[a-f0-9]{24}$/;
const knownNumber = value => Number.isFinite(value) ? value : null;
const armorClass = value => value !== null && value !== undefined && value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 6 ? Number(value) : null;
const armorLabels = { Front_plate: 'Front plate', Back_plate: 'Back plate', Left_side_plate: 'Left side plate', Right_side_plate: 'Right side plate', Soft_armor_front: 'Front built-in armour', Soft_armor_back: 'Back built-in armour', Soft_armor_left: 'Left built-in armour', Soft_armor_right: 'Right built-in armour', Groin: 'Groin', Groin_back: 'Rear groin', Collar: 'Collar', Shoulder_l: 'Left shoulder', Shoulder_r: 'Right shoulder' };

export function rigEfficiency(rig) { return rig.capacity / (rig.width * rig.height); }
export function rigNetSlots(rig) { return rig.capacity - rig.width * rig.height; }

export function importRigs(source, locale) {
  const rigs = {}, plates = {};
  const translate = value => locale[value] ?? value;
  const readable = value => typeof value === 'string' ? String(translate(value)).replaceAll('_', ' ') : '';
  function plate(id) {
    if (plates[id]) return;
    const item = source.items[id];
    if (!item) throw new Error('Rig data contains an unknown compatible plate.');
    const p = item.properties ?? {};
    plates[id] = { id, name: translate(item.name), shortName: translate(item.shortName), class: armorClass(p.class), weight: knownNumber(item.weight), durability: knownNumber(p.durability), material: readable(p.material), wiki: item.wikiLink ?? null };
  }
  for (const item of Object.values(source.items)) {
    const p = item.properties ?? {};
    if (p.propertiesType !== 'ItemPropertiesChestRig') continue;
    const armor = (p.armorSlots ?? []).map(slot => {
      const removable = Array.isArray(slot.allowedPlates);
      const allowed = removable ? [...new Set(slot.allowedPlates)] : [];
      allowed.forEach(plate);
      return { name: armorLabels[slot.nameId] ?? readable(slot.nameId), removable, allowedPlates: allowed, class: removable ? null : armorClass(slot.class), durability: removable ? null : knownNumber(slot.durability), material: removable ? '' : readable(slot.armorMaterial), zones: [...new Set((slot.zones ?? []).flatMap(zone => readable(zone).split(',').map(z => z.trim())).filter(Boolean))] };
    });
    rigs[item.id] = {
      id: item.id, name: translate(item.name), shortName: translate(item.shortName),
      icon: `images/${item.id}.webp`, iconSource: item.iconLink,
      width: item.width, height: item.height, weight: item.weight, capacity: p.capacity,
      grids: (p.grids ?? []).map(grid => ({ width: grid.width, height: grid.height })),
      armoured: armor.some(slot => slot.removable || slot.class > 0) || Number(p.class) > 0 || item.types.includes('armor'),
      armor, speedPenalty: knownNumber(p.speedPenalty), turnPenalty: knownNumber(p.turnPenalty), ergoPenalty: knownNumber(p.ergoPenalty),
      wiki: item.wikiLink ?? null, updated: item.updated ?? null
    };
  }
  validateRigData({ rigs, rigPlates: plates });
  return { rigs, rigPlates: plates };
}

export function validateRigData(catalog, validateImageSource = () => true) {
  const fail = message => { throw new Error(`Data validation failed: ${message}`); };
  // Existing weapon snapshots remain usable until the user requests a database update.
  if (catalog.rigs === undefined) {
    if (catalog.rigPlates !== undefined || catalog.meta?.rigCount !== undefined) fail('missing rig database');
    return;
  }
  if (!catalog.rigs || Array.isArray(catalog.rigs) || typeof catalog.rigs !== 'object' || !catalog.rigPlates || Array.isArray(catalog.rigPlates) || typeof catalog.rigPlates !== 'object') fail('invalid rig database');
  const rigs = Object.values(catalog.rigs);
  if (rigs.length > 500 || Object.keys(catalog.rigPlates).length > 500) fail('oversized rig database');
  if (catalog.meta?.rigCount !== undefined && catalog.meta.rigCount !== rigs.length) fail('rig totals do not match');
  const names = item => typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 500 && typeof item.shortName === 'string' && item.shortName.length <= 100;
  for (const [id, plate] of Object.entries(catalog.rigPlates)) {
    if (!plate || !idPattern.test(id) || plate.id !== id || !names(plate) || !(plate.class === null || Number.isInteger(plate.class) && plate.class >= 0 && plate.class <= 6) || !(plate.weight === null || Number.isFinite(plate.weight) && plate.weight >= 0) || !(plate.durability === null || Number.isFinite(plate.durability) && plate.durability >= 0) || typeof plate.material !== 'string') fail('invalid rig plate');
  }
  for (const [id, rig] of Object.entries(catalog.rigs)) {
    if (!rig || !idPattern.test(id) || rig.id !== id || !names(rig) || typeof rig.armoured !== 'boolean') fail('invalid rig identity');
    if (![rig.width, rig.height].every(n => Number.isInteger(n) && n > 0 && n <= 16) || !Number.isFinite(rig.weight) || rig.weight < 0 || !Number.isInteger(rig.capacity) || rig.capacity < 1 || rig.capacity > 200) fail('invalid rig storage stats');
    if (rig.icon !== `images/${id}.webp` || !validateImageSource(rig.iconSource)) fail('invalid rig image');
    if (!Array.isArray(rig.grids) || rig.grids.length < 1 || rig.grids.length > 64 || rig.grids.some(g => !g || ![g.width, g.height].every(n => Number.isInteger(n) && n > 0 && n <= 16)) || rig.grids.reduce((sum, g) => sum + g.width * g.height, 0) !== rig.capacity) fail('rig pocket sizes do not match capacity');
    if (!Array.isArray(rig.armor) || rig.armor.length > 32) fail('invalid rig armour components');
    for (const slot of rig.armor) {
      if (!slot || typeof slot.name !== 'string' || typeof slot.material !== 'string' || !Array.isArray(slot.zones) || slot.zones.length > 32 || slot.zones.some(z => typeof z !== 'string') || typeof slot.removable !== 'boolean' || !Array.isArray(slot.allowedPlates) || slot.allowedPlates.length > 100 || slot.allowedPlates.some(id => !idPattern.test(id) || !catalog.rigPlates[id]) || !(slot.class === null || Number.isInteger(slot.class) && slot.class >= 0 && slot.class <= 6) || !(slot.durability === null || Number.isFinite(slot.durability) && slot.durability >= 0) || (slot.removable && (slot.class !== null || slot.durability !== null)) || (!slot.removable && slot.allowedPlates.length)) fail('invalid rig armour slot');
    }
    if (!rig.armoured && rig.armor.some(s => s.removable || s.class > 0)) fail('incorrect rig armour classification');
    for (const key of ['speedPenalty', 'turnPenalty', 'ergoPenalty']) if (!(rig[key] === null || Number.isFinite(rig[key]) && Math.abs(rig[key]) <= 1)) fail('invalid rig penalty');
    validateGearOffers(rig);
  }
}

export function filterRigs(rigs, { type = 'unarmoured', search = '', minSlots = 0, squarePocket = false, sort = 'capacity', descending = false } = {}) {
  const normalize = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const terms = normalize(search).trim().split(/\s+/).filter(Boolean);
  const values = Object.values(rigs ?? {}).filter(rig => (type === 'backpacks' || rig.armoured === (type === 'armoured')) && rig.capacity >= minSlots && (!squarePocket || rig.grids.some(g => g.width >= 2 && g.height >= 2)) && terms.every(term => normalize(rig.name + ' ' + rig.shortName).includes(term)));
  const numeric = { capacity: r => r.capacity, weight: r => r.weight, efficiency: rigEfficiency, net: rigNetSlots };
  return values.sort((a, b) => {
    const order = numeric[sort] ? numeric[sort](a) - numeric[sort](b) : a.name.localeCompare(b.name, 'en');
    return (descending ? -order : order) || a.name.localeCompare(b.name, 'en');
  });
}

export function armorSummary(rig) {
  if (!rig.armoured) return 'Unarmoured';
  const classes = [...new Set(rig.armor.filter(s => !s.removable && s.class > 0).map(s => s.class))].sort((a, b) => a - b);
  const builtIn = classes.length ? `Built-in class ${classes.join(' / ')}` : 'No built-in protection recorded';
  const slots = rig.armor.filter(s => s.removable).length;
  return builtIn + (slots ? ` · ${slots} plate slots` : '');
}
