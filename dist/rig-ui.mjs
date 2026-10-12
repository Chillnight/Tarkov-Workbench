// Author: CA
import { filterRigs, rigEfficiency, rigNetSlots, armorSummary } from './rigs.mjs';
import { rigLayout } from './rig-layouts.mjs';
import { filterBackpacks } from './backpacks.mjs';
import { gearOfferEntries, gearOfferLabel, barterIngredientLabel } from './gear-offers.mjs';
import { defaultTraderSettings } from './traders.mjs';

const number = (value, digits = 2) => Number(value).toLocaleString('en-GB', { maximumFractionDigits: digits });
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const safeWiki = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && ['escapefromtarkov.fandom.com', 'escapefromtarkov.wiki.gg', 'tarkov.dev'].includes(url.hostname) ? url.href : null; } catch { return null; }
};
const svgNode = (tag, attrs = {}, text) => {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
};

export function createPocketDiagram(rig, large = false) {
  const layout = rigLayout(rig), unit = 27, padding = 3;
  const wrap = node('div', large ? 'rig-pocket-wrap rig-pocket-large' : 'rig-pocket-wrap');
  const svg = svgNode('svg', { viewBox: `0 0 ${layout.width * unit + padding * 2} ${layout.height * unit + padding * 2}`, role: 'img', 'aria-label': `${rig.shortName}: ${rig.capacity} cells in ${rig.grids.length} separate ${rig.grids.length === 1 ? 'pocket' : 'pockets'}` });
  svg.append(svgNode('title', {}, `${rig.grids.map(g => `${g.width}×${g.height}`).join(', ')}. ${layout.reviewed ? 'Reference arrangement.' : 'Schematic arrangement; pocket sizes are exact.'}`));
  for (const pocket of layout.pockets) {
    const x = padding + pocket.x * unit, y = padding + pocket.y * unit;
    svg.append(svgNode('rect', { x, y, width: pocket.width * unit, height: pocket.height * unit, class: 'rig-pocket-outline' }));
    for (let column = 1; column < pocket.width; column++) svg.append(svgNode('line', { x1: x + column * unit, x2: x + column * unit, y1: y, y2: y + pocket.height * unit, class: 'rig-pocket-divider' }));
    for (let row = 1; row < pocket.height; row++) svg.append(svgNode('line', { x1: x, x2: x + pocket.width * unit, y1: y + row * unit, y2: y + row * unit, class: 'rig-pocket-divider' }));
  }
  wrap.append(svg);
  wrap.append(node('small', 'rig-layout-status', layout.reviewed ? 'Reference layout' : 'Schematic layout'));
  return wrap;
}

export function setupRigComparison({ getCatalog, imageURL = path => path, kind = 'rigs', getSettings = defaultTraderSettings } = {}) {
  const bags = kind === 'backpacks', prefix = bags ? 'bag' : 'rig', noun = bags ? 'backpack' : 'rig';
  const root = document.getElementById(bags ? 'bag-builder-panel' : 'rig-builder-panel');
  if (!root) return { refresh() {}, setUpdating() {} };
  const state = { type: bags ? 'backpacks' : 'unarmoured', search: '', minSlots: 0, squarePocket: false, sort: 'capacity', descending: false, updating: false, selected: null };
  root.innerHTML = `
    <div class="rig-browser">
      <div class="rig-heading"><div><p class="eyebrow">${bags ? 'STORAGE &amp; CARRYING' : 'STORAGE &amp; PROTECTION'} <span class="rig-preview-badge">LOCAL DATABASE</span></p><h2>${bags ? 'Room for what matters.' : 'Carry what matters.'}</h2><p class="muted">${bags ? 'Compare backpacks, their compartments and purchase options.' : 'Compare tactical rigs, their pockets, armour coverage and purchase options.'}</p></div><p id="rig-data-status" class="rig-data-status"></p></div>
      <div class="rig-toolbar"><div class="rig-types" ${bags ? 'hidden' : ''} role="group" aria-label="Rig type"><button type="button" data-rig-type="unarmoured" aria-pressed="true">Unarmoured</button><button type="button" data-rig-type="armoured" aria-pressed="false">Armoured</button></div><div class="rig-search-field"><label for="rig-search">Find a ${noun}</label><input id="rig-search" type="search" placeholder="${bags ? 'Scav, Beta 2, Mechanism …' : 'Scav, MPPV, TV-110 …'}" autocomplete="off"></div><div class="rig-slot-field"><label for="rig-min-slots">Minimum slots</label><select id="rig-min-slots"><option value="0">Any capacity</option><option value="12">12+ slots</option><option value="16">16+ slots</option><option value="20">20+ slots</option><option value="24">24+ slots</option>${bags ? '<option value="30">30+ slots</option><option value="40">40+ slots</option><option value="50">50+ slots</option><option value="60">60+ slots</option>' : ''}</select></div><label class="rig-square-filter"><input id="rig-square-pocket" type="checkbox"><span>Has a 2×2 or larger pocket</span></label><button id="rig-reset" type="button" class="subtle">Clear filters</button></div>
      <p id="rig-count" class="rig-count" role="status" aria-live="polite"></p>
      <div id="rig-empty" class="rig-empty" hidden><h3 id="rig-empty-title"></h3><p id="rig-empty-text"></p><button id="rig-load-data" type="button" class="subtle">Update database</button></div>
      <div id="rig-table-scroll" class="rig-table-scroll" role="region" aria-label="${bags ? 'Backpack' : 'Rig'} comparison table" tabindex="0"><table class="rig-table"><caption class="rig-sr-only">${bags ? 'Backpack comparison. Select a backpack to inspect its compartments and purchase options.' : 'Tactical rig comparison. Select a rig to inspect its storage, protection and purchase options.'}</caption><thead id="rig-table-head"></thead><tbody id="rig-table-body"></tbody></table></div>
      <div class="rig-footnotes"><p>Efficiency = internal slots / stash footprint. ${bags ? 'Weight is the empty backpack weight.' : 'Weight excludes removable plates.'} Select a ${noun} for details and all purchase offers.</p><p>Pocket sizes come from the saved database. Reference layouts preserve the original pocket arrangement. New or changed items without matching reference data are labelled schematic. This reference catalogue shows all ${bags ? 'backpacks' : 'rigs'}, independently of weapon build filters.</p></div>
    </div>`.replaceAll('id="rig-', 'id="' + prefix + '-').replaceAll('for="rig-', 'for="' + prefix + '-');
  const dialog = node('dialog', 'rig-dialog');
  dialog.id = prefix + '-detail-dialog'; dialog.setAttribute('aria-labelledby', prefix + '-detail-title');
  dialog.innerHTML = '<div class="rig-dialog-head"><div><p class="eyebrow">RIG DETAILS</p><h2 id="rig-detail-title"></h2></div><button type="button" class="subtle" id="rig-detail-close" aria-label="Close rig details">Close ×</button></div><div id="rig-detail-content"></div>'.replaceAll('rig-detail-', prefix + '-detail-').replace('RIG DETAILS', bags ? 'BACKPACK DETAILS' : 'RIG DETAILS').replace('Close rig details', 'Close ' + noun + ' details');
  document.body.append(dialog);
  const $ = id => document.getElementById(id.replace(/^rig-/, prefix + '-'));
  const image = (rig, large = false) => {
    const wrap = node('div', large ? 'rig-image-wrap rig-image-large' : 'rig-image-wrap');
    const img = node('img'); img.src = imageURL(rig.icon); img.alt = rig.shortName; img.loading = 'lazy';
    img.addEventListener('error', () => { img.hidden = true; wrap.append(node('span', 'rig-image-missing', 'Image unavailable')); }, { once: true });
    wrap.append(img); return wrap;
  };
  function purchaseOptions(item, compact) {
    const wrap = node('div', 'gear-offers');
    if (item.offers === undefined) { wrap.append(node('p', 'muted', 'Update database to load purchase offers.')); return wrap; }
    const all = gearOfferEntries(item, getSettings());
    const displayed = compact ? ['cash', 'barter', 'flea'].map(kind => all.find(o => o.kind === kind)).filter(Boolean) : all;
    for (const offer of displayed) {
      const block = node(offer.kind === 'barter' ? 'details' : 'div', 'gear-offer' + (offer.enabled ? '' : ' gear-offer-locked'));
      const label = node(offer.kind === 'barter' ? 'summary' : 'b', 'gear-offer-label', gearOfferLabel(offer) + (offer.kind === 'barter' && !offer.enabled ? ' · ' + offer.status : '')); block.append(label);
      block.append(node('small', 'gear-offer-status', offer.status));
      if (offer.kind === 'barter') {
        const ingredients = node('ul');
        offer.requiredItems.forEach(item => ingredients.append(node('li', null, barterIngredientLabel(item)))); block.append(ingredients);
        if (offer.rewardCount !== 1) block.append(node('small', null, 'Trade gives ' + number(offer.rewardCount) + ' items. Estimated value above is per item.'));
      }
      wrap.append(block);
    }
    if (!all.length) wrap.append(node('p', 'muted', 'No recorded purchase offers.'));
    if (item.flea?.allowed === false) wrap.append(node('small', 'gear-offer-status', 'Not available on Flea Market'));
    if (compact && all.length > displayed.length) {
      const more = node('button', 'gear-more-offers', 'View all ' + all.length + ' offers'); more.type = 'button'; more.addEventListener('click', () => openRig(item)); wrap.append(more);
    }
    if (!compact) wrap.append(node('p', 'rig-detail-note', 'Prices are from the saved database. Flea Market prices are 24h average estimates; stock and live listings are not checked. Barter values estimate the exchange items, not a cash purchase. Trader levels and offer toggles come from Settings. Recorded quest offers are assumed unlocked when included. Account unlocks and live stock are not checked.'));
    return wrap;
  }
  function stat(label, value) { const el = node('div', 'rig-stat'); el.append(node('span', null, label), node('b', null, value)); return el; }
  function openRig(rig) {
    state.selected = rig.id;
    $('rig-detail-title').textContent = rig.shortName;
    const content = $('rig-detail-content'); content.replaceChildren();
    content.append(node('p', 'muted', rig.name));
    const hero = node('div', 'rig-detail-hero'); hero.append(image(rig, true), createPocketDiagram(rig, true)); content.append(hero);
    const stats = node('div', 'rig-detail-stats');
    stats.append(stat('Internal slots', number(rig.capacity)), stat('Stash footprint', `${rig.width}×${rig.height}`), stat('Storage efficiency', `${number(rigEfficiency(rig))}×`), stat('Base weight', `${number(rig.weight, 3)} kg`)); content.append(stats);
    const sizes = new Map(); rig.grids.forEach(g => { const key = `${g.width}×${g.height}`; sizes.set(key, (sizes.get(key) ?? 0) + 1); });
    content.append(node('p', 'rig-detail-note', [...sizes].map(([size, count]) => `${count} pocket${count === 1 ? '' : 's'} ${size}`).join(' · ') + ` · ${rigNetSlots(rig) >= 0 ? '+' : ''}${rigNetSlots(rig)} net stash slots`));
    if (!bags) {
    content.append(node('h3', null, rig.armoured ? 'Protection & plate slots' : 'Protection'));
    if (!rig.armoured) content.append(node('p', 'muted', 'Storage only. This rig has no built-in armour or plate slots.'));
    else {
      content.append(node('p', 'rig-detail-note', 'Built-in armour and removable plates are shown separately. Plate slots below are not equipped. Protection and final weight depend on the plates fitted.'));
      if (!rig.armor.length) content.append(node('p', 'muted', 'The source marks this rig as armoured but does not record its protection components.'));
      for (const slot of rig.armor) {
        const block = node('section', 'rig-armor-component');
        const title = node('h4', null, slot.name); block.append(title);
        if (slot.removable) {
          block.append(node('p', 'muted', `Removable plate slot · ${slot.allowedPlates.length} compatible plate${slot.allowedPlates.length === 1 ? '' : 's'}`));
          if (slot.allowedPlates.length) {
            const details = node('details', 'rig-plate-list'), list = node('ul'); details.append(node('summary', null, 'View compatible plates'));
            const plates = slot.allowedPlates.map(id => getCatalog().rigPlates[id]).sort((a, b) => (a.class ?? -1) - (b.class ?? -1) || (a.weight ?? Infinity) - (b.weight ?? Infinity) || a.name.localeCompare(b.name));
            plates.forEach(plate => { const li = node('li'); li.append(node('b', null, plate.name), node('span', null, `${plate.class === null ? 'Class unknown' : 'Class ' + plate.class} · ${plate.weight === null ? 'Weight unknown' : number(plate.weight, 3) + ' kg'}${plate.material ? ' · ' + plate.material : ''}${plate.durability === null ? '' : ' · ' + number(plate.durability) + ' durability'}`)); list.append(li); });
            details.append(list); block.append(details);
          }
        } else block.append(node('p', 'muted', `${slot.class === null ? 'Class unknown' : 'Class ' + slot.class}${slot.material ? ' · ' + slot.material : ''}${slot.durability === null ? '' : ' · ' + number(slot.durability) + ' durability'}`));
        if (slot.zones.length) block.append(node('p', 'rig-zones', 'Coverage: ' + slot.zones.join(', ')));
        content.append(block);
      }
    }
    }
    content.append(node('h3', null, 'Purchase options'));
    content.append(purchaseOptions(rig, false));
    const penalties = node('div', 'rig-penalties');
    const penalty = value => value === null ? 'Not recorded' : `${value > 0 ? '+' : ''}${number(value * 100)}%`;
    penalties.append(stat('Movement speed', penalty(rig.speedPenalty)), stat('Turning speed', penalty(rig.turnPenalty)), stat('Ergonomics', penalty(rig.ergoPenalty))); content.append(penalties);
    const link = safeWiki(rig.wiki);
    if (link) { const anchor = node('a', 'rig-wiki-link', 'View wiki reference ↗'); anchor.href = link; anchor.target = '_blank'; anchor.rel = 'noreferrer'; content.append(anchor); }
    dialog.showModal();
  }
  function sortHeader(label, key) {
    const th = node('th'); th.scope = 'col';
    th.setAttribute('aria-sort', state.sort === key ? state.descending ? 'descending' : 'ascending' : 'none');
    const button = node('button', 'rig-sort', `${label} ${state.sort === key ? state.descending ? '↓' : '↑' : '↕'}`); button.type = 'button'; button.dataset.rigSort = key;
    button.addEventListener('click', () => { state.descending = state.sort === key ? !state.descending : ['efficiency', 'net'].includes(key); state.sort = key; render(); $('rig-table-head').querySelector(`[data-rig-sort="${key}"]`).focus({ preventScroll: true }); }); th.append(button); return th;
  }
  function render() {
    const catalog = getCatalog(), all = catalog?.[kind];
    const hasData = Boolean(all && Object.keys(all).length);
    for (const button of root.querySelectorAll('[data-rig-type]')) button.setAttribute('aria-pressed', String(button.dataset.rigType === state.type));
    const filtered = bags ? filterBackpacks(all, state) : filterRigs(all, state), total = Object.values(all ?? {}).filter(r => bags || r.armoured === (state.type === 'armoured')).length;
    $('rig-data-status').textContent = hasData ? `${Object.keys(all).length} ${bags ? 'backpacks' : 'rigs'} · saved locally\nRetrieved: ${new Date(catalog.meta.fetchedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : `${bags ? 'Backpack' : 'Rig'} data not loaded`;
    $('rig-count').textContent = hasData ? `${filtered.length} of ${total} ${bags ? 'backpacks' : state.type + ' rigs'} · Click a name for details` : '';
    const empty = !hasData || !filtered.length;
    $('rig-empty').hidden = !empty; $('rig-table-scroll').hidden = empty;
    $('rig-empty-title').textContent = !hasData ? `Add ${bags ? 'backpacks' : 'rigs'} to your local database` : `No matching ${bags ? 'backpacks' : 'rigs'}`;
    $('rig-empty-text').textContent = !hasData ? `Your weapon database still works. Use Update database to download ${bags ? 'backpack' : 'rig'} data and images from tarkov.dev after confirmation.` : 'Try another name, lower the minimum slots or clear the pocket filter.';
    $('rig-load-data').hidden = hasData; $('rig-load-data').disabled = state.updating;
    if (empty) return;
    const head = node('tr');
    const plain = label => { const th = node('th', null, label); th.scope = 'col'; return th; };
    head.append(plain('Image'), sortHeader(bags ? 'Backpack' : 'Rig', 'name'), sortHeader('Slots', 'capacity'), plain('Pocket layout'));
    if (state.type === 'armoured') head.append(plain('Protection'));
    head.append(sortHeader('Base weight', 'weight'), sortHeader('Efficiency', 'efficiency'), plain('Offers & prices'));
    $('rig-table-head').replaceChildren(head);
    $('rig-table-body').replaceChildren(...filtered.map(rig => {
      const row = node('tr'); row.dataset.rigId = rig.id;
      const iconCell = node('td'); iconCell.append(image(rig));
      const nameCell = node('td', 'rig-name-cell');
      const button = node('button', 'rig-name-button'); button.type = 'button'; button.setAttribute('aria-label', 'Inspect ' + rig.name); button.append(node('b', null, rig.shortName), node('span', null, rig.name)); button.addEventListener('click', () => openRig(rig));
      nameCell.append(button); const slots = node('td', 'rig-slots', number(rig.capacity)), layout = node('td', 'rig-layout-cell'); layout.append(createPocketDiagram(rig));
      row.append(iconCell, nameCell, slots, layout);
      if (state.type === 'armoured') row.append(node('td', 'rig-protection', armorSummary(rig)));
      row.append(node('td', 'rig-numeric', `${number(rig.weight, 3)} kg`), node('td', 'rig-numeric', `${number(rigEfficiency(rig))}×`));
      const offers = node('td', 'rig-offer-cell'); offers.append(purchaseOptions(rig, true)); row.append(offers);
      return row;
    }));
  }
  function resetFilters() {
    state.search = ''; state.minSlots = 0; state.squarePocket = false;
    $('rig-search').value = ''; $('rig-min-slots').value = '0'; $('rig-square-pocket').checked = false; render();
  }
  root.querySelectorAll('[data-rig-type]').forEach(button => button.addEventListener('click', () => { state.type = button.dataset.rigType; render(); }));
  $('rig-search').addEventListener('input', event => { state.search = event.target.value; render(); });
  $('rig-min-slots').addEventListener('change', event => { state.minSlots = Number(event.target.value); render(); });
  $('rig-square-pocket').addEventListener('change', event => { state.squarePocket = event.target.checked; render(); });
  $('rig-reset').addEventListener('click', resetFilters);
  $('rig-load-data').addEventListener('click', () => document.getElementById('update-data').click());
  $('rig-detail-close').addEventListener('click', () => dialog.close());
  render();
  return {
    refresh() { if (dialog.open) dialog.close(); state.selected = null; render(); },
    setUpdating(value) { state.updating = value; $('rig-load-data').disabled = value; }
  };
}
