// Author: CA
import { categoryChoices, caliberLabel } from './category-comparison.mjs';
import { validateBuildInputs } from './input-validation.mjs';

const MODE_LABELS = Object.freeze({
  ergo: 'Highest Ergo first',
  recoil: 'Lowest recoil first',
  balanced: 'Target Ergo first, then recoil'
});

const MODE_HELP = Object.freeze({
  ergo: 'Maximum ergonomics',
  recoil: 'Minimum vertical recoil',
  balanced: 'Closest to the Ergo target'
});

const SETTING_TARGETS = Object.freeze({
  'exclude-arena': 'exclude-arena',
  practical: 'practical-mounts',
  lighter: 'prefer-lighter',
  launchers: 'allow-launchers',
  'budget-enabled': 'budget-enabled',
  'budget-amount': 'budget-amount'
});

const number = (value, digits = 1) => Number(value).toLocaleString('en-GB', { maximumFractionDigits: digits });
const countLabel = (value, singular, plural = singular + 's') => Number(value) === 1 ? '1 ' + singular : Number(value) + ' ' + plural;
const formatCaliber = value => value === null || value === undefined ? 'All calibers' : caliberLabel(value);

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeOptions(getSharedOptions) {
  try {
    const value = getSharedOptions?.();
    return value && typeof value === 'object' ? { ...value } : {};
  } catch {
    return {};
  }
}

function emptyController() {
  return {
    invalidate() {},
    refresh() {},
    setUpdating() {},
    cancel() {},
    isRunning() { return false; }
  };
}

export function setupCategoryComparison({
  getCatalog = () => null,
  getSharedOptions = () => ({}),
  imageURL = path => path,
  notify = () => {},
  onOpenBuild = () => {}
} = {}) {
  const root = document.getElementById('category-builder-panel');
  if (!root) return emptyController();

  root.innerHTML = [
    '<div class="category-builder" aria-labelledby="category-builder-title">',
    '<header class="category-heading"><div><p class="category-kicker">BEST IN CATEGORY</p><h2 id="category-builder-title">Find your next weapon.</h2><p class="category-subtitle">Compare complete builds across a weapon category.</p></div><p class="category-data-status" data-category-data-status role="status"></p></header>',
    '<div class="category-workspace"><aside class="category-options" aria-label="Best in category options">',
    '<p class="category-kicker">01 / COMPARISON</p>',
    '<div class="category-field"><label for="category-category-select">Weapon category</label><select id="category-category-select" data-category-category disabled></select></div>',
    '<div class="category-field"><label for="category-caliber-select">Caliber</label><select id="category-caliber-select" data-category-caliber disabled><option value="">All calibers</option></select><p class="category-hint">All calibers compares every validated weapon in this category. Same-caliber filtering is recommended when comparing raw recoil values.</p></div>',
    '<div class="category-field"><span class="category-label">Build objective</span><div class="category-modes" role="group" aria-label="Build objective">',
    '<button type="button" data-category-objective="ergo" aria-pressed="true"><b>Ergo</b><span>Maximum ergonomics</span></button>',
    '<button type="button" data-category-objective="recoil" aria-pressed="false"><b>Recoil</b><span>Minimum vertical recoil</span></button>',
    '<button type="button" data-category-objective="balanced" aria-pressed="false"><b>Balanced</b><span>Recoil with an Ergo target</span></button>',
    '</div></div>',
    '<div class="category-field"><span class="category-label">Suppressor</span><div class="category-choices" role="group" aria-label="Suppressor"><button type="button" data-category-sound="silenced" aria-pressed="true">Silenced</button><button type="button" data-category-sound="unsilenced" aria-pressed="false">Unsilenced</button></div></div>',
    '<div class="category-field category-target-field" data-category-target-panel hidden><label for="category-target-range">Target Ergo <output data-category-target-value>75 Ergo</output></label><input id="category-target-range" type="range" min="0" max="100" step="5" value="75" data-category-target><p class="category-hint">Builds below the target remain visible with their shortfall.</p></div>',
    '<div class="category-fixed-settings" aria-label="Fixed comparison settings"><p class="category-label">Assembly settings</p><p><span>Scope</span><b>Iron sights · no scope</b></p><p><span>Magazine</span><b>Automatic · any capacity</b></p><p class="category-hint">The selected weapon is assumed owned. Costs below cover attachments only.</p></div>',
    '<div class="category-shared-settings"><div class="category-shared-heading"><span class="category-label">Shared settings</span><button type="button" class="subtle" data-category-settings>Settings</button></div>',
    '<p class="category-shared-summary" data-category-shared-summary>Loading shared settings …</p>',
    '<label class="category-check" for="category-exclude-arena"><input id="category-exclude-arena" type="checkbox" data-category-setting="exclude-arena" checked><span>Exclude Arena unlocks</span></label>',
    '<label class="category-check" for="category-practical"><input id="category-practical" type="checkbox" data-category-setting="practical" checked><span>Prefer practical mounts</span></label>',
    '<label class="category-check" for="category-lighter"><input id="category-lighter" type="checkbox" data-category-setting="lighter" checked><span>Prefer lighter parts</span></label>',
    '<label class="category-check" for="category-launchers"><input id="category-launchers" type="checkbox" data-category-setting="launchers"><span>Allow underbarrel launchers</span></label>',
    '<label class="category-check" for="category-budget-enabled"><input id="category-budget-enabled" type="checkbox" data-category-setting="budget-enabled"><span>Maximum attachment budget</span></label>',
    '<div class="category-budget-entry" data-category-budget-entry hidden><label for="category-budget-amount">Maximum · RUB</label><input id="category-budget-amount" type="number" min="1" max="100000000" step="1000" value="150000" inputmode="numeric" data-category-setting="budget-amount"><p class="category-hint">Weapon cost is excluded because the selected weapon is already owned.</p></div>',
    '</div><button type="button" class="primary category-wide" data-category-calculate disabled>Find best weapons <span>↗</span></button><button type="button" class="subtle category-cancel category-wide" data-category-cancel hidden>Cancel comparison</button><p class="category-hint category-operation-status" data-category-operation-status role="status"></p>',
    '</aside>',
    '<section class="category-results" role="tabpanel" aria-labelledby="workbench-tab-category" aria-label="Best in category results"><p class="category-kicker">02 / RESULTS</p><div class="category-section-heading"><div><h2 data-category-results-title>Choose a category</h2><p class="category-results-meta" data-category-results-meta>Choose options and find validated builds when you are ready.</p></div><span class="category-result-tag" data-category-result-tag>No comparison run</span></div>',
    '<div class="category-empty" data-category-empty><h3>Compare complete weapon builds.</h3><p>Choose a category, objective and suppressor mode, then select <b>Find best weapons</b>. The comparison does not start automatically.</p></div>',
    '<div class="category-table-wrap" data-category-table-wrap hidden><table class="category-table" aria-label="Validated weapon build ranking"><thead><tr><th>Weapon</th><th>Ergo</th><th>V. recoil (raw)</th><th>H. recoil (raw)</th><th>Weight</th><th>Attachment cost</th><th>Build</th></tr></thead><tbody data-category-rows></tbody></table></div>',
    '<p class="category-hint category-sort-note" data-category-sort-note hidden></p><details class="category-excluded" data-category-excluded hidden><summary data-category-excluded-summary>Excluded candidates</summary><p class="category-hint" data-category-excluded-note></p><ul data-category-excluded-list></ul></details><section class="category-detail" data-category-detail hidden aria-live="polite"></section>',
    '</section></div></div>'
  ].join('');

  const query = selector => root.querySelector(selector);
  const state = {
    catalog: null,
    choices: [],
    category: null,
    caliber: null,
    mode: 'ergo',
    sound: 'silenced',
    balance: 75,
    result: null,
    selectedWeaponId: null,
    worker: null,
    run: 0,
    running: false,
    updating: false,
    opening: false
  };

  function sharedOptions() {
    return safeOptions(getSharedOptions);
  }

  function currentChoice() {
    return state.choices.find(choice => choice.id === state.category) ?? null;
  }

  function currentSelection() {
    return {
      ...sharedOptions(),
      category: state.category,
      caliber: state.caliber,
      mode: state.mode,
      sound: state.sound,
      balance: state.balance,
      scopeId: null,
      magazineId: null,
      magazine: 1
    };
  }

  function stopWorker() {
    state.worker?.terminate();
    state.worker = null;
    state.running = false;
    query('[data-category-calculate]').disabled = state.updating || !state.catalog || !state.category;
    query('[data-category-cancel]').hidden = true;
  }

  function renderEmpty(message = 'Choose options and find validated builds when you are ready.') {
    query('[data-category-table-wrap]').hidden = true;
    query('[data-category-empty]').hidden = false;
    query('[data-category-detail]').hidden = true;
    query('[data-category-detail]').replaceChildren();
    query('[data-category-rows]').replaceChildren();
    query('[data-category-excluded]').hidden = true;
    query('[data-category-sort-note]').hidden = true;
    const cancelled = /cancelled/i.test(message);
    const failed = /failed|could not|unavailable/i.test(message);
    const heading = cancelled ? 'Comparison cancelled.' : failed ? 'Comparison unavailable.' : 'Compare complete weapon builds.';
    const copy = cancelled
      ? 'The worker stopped before a validated ranking was available. Change an option or select Find best weapons to start again.'
      : failed
        ? 'The comparison did not produce a validated result. Review the current data snapshot and settings, then try again.'
        : 'Choose a category, objective and suppressor mode, then select Find best weapons. The comparison does not start automatically.';
    query('[data-category-empty]').replaceChildren(createElement('h3', null, heading), createElement('p', null, copy));
    query('[data-category-operation-status]').textContent = message;
    query('[data-category-result-tag]').textContent = 'No comparison run';
    query('[data-category-results-meta]').textContent = message;
  }

  function setPressed(selector, value) {
    root.querySelectorAll(selector).forEach(button => button.setAttribute('aria-pressed', String(value(button))));
  }

  function renderSharedControls() {
    const options = sharedOptions();
    const arena = query('[data-category-setting="exclude-arena"]');
    const practical = query('[data-category-setting="practical"]');
    const lighter = query('[data-category-setting="lighter"]');
    const launchers = query('[data-category-setting="launchers"]');
    const budget = query('[data-category-setting="budget-enabled"]');
    const amount = query('[data-category-setting="budget-amount"]');
    arena.checked = options.excludeArenaUnlocks !== false;
    practical.checked = options.preferPracticalMounts !== false;
    lighter.checked = options.preferLighterParts !== false;
    launchers.checked = options.allowGrenadeLaunchers === true;
    budget.checked = options.maxBudget !== null && options.maxBudget !== undefined;
    if (options.maxBudget !== null && options.maxBudget !== undefined) amount.value = String(options.maxBudget);
    query('[data-category-budget-entry]').hidden = !budget.checked;
    const summary = [];
    summary.push(options.restrictTraders === false ? 'Trader limits off' : 'Trader levels applied');
    summary.push(options.includeFleaMarket === false ? 'Flea off' : 'Flea on');
    summary.push(options.includeBarters === false ? 'Barters off' : 'Barters on');
    summary.push(options.includeQuestOffers === false ? 'Quest offers off' : 'Quest offers on');
    summary.push(arena.checked ? 'Arena unlocks excluded' : 'Arena unlocks included');
    summary.push(practical.checked ? 'Practical mounts' : 'Maximum stats');
    summary.push(lighter.checked ? 'Lighter parts' : 'Factory/price tie-break');
    if (budget.checked) summary.push('Attachment budget ' + number(Number(amount.value), 0) + ' RUB');
    query('[data-category-shared-summary]').textContent = summary.join(' · ');
  }

  function renderControls() {
    query('[data-category-target-panel]').hidden = state.mode !== 'balanced';
    query('[data-category-target]').value = String(state.balance);
    query('[data-category-target-value]').textContent = state.balance + ' Ergo';
    setPressed('[data-category-objective]', button => button.dataset.categoryObjective === state.mode);
    setPressed('[data-category-sound]', button => button.dataset.categorySound === state.sound);
    query('[data-category-calculate]').disabled = state.updating || state.running || !state.catalog || !state.category;
    query('[data-category-cancel]').hidden = !state.running;
    renderSharedControls();
  }

  function renderCategoryChoices() {
    const categorySelect = query('[data-category-category]');
    const caliberSelect = query('[data-category-caliber]');
    categorySelect.replaceChildren();
    for (const choice of state.choices) {
      const option = document.createElement('option');
      option.value = choice.id;
      option.textContent = choice.label + ' · ' + countLabel(choice.count, 'weapon', 'weapons');
      categorySelect.append(option);
    }
    categorySelect.disabled = !state.choices.length || state.updating;
    if (state.category && state.choices.some(choice => choice.id === state.category)) categorySelect.value = state.category;
    else categorySelect.value = '';
    caliberSelect.replaceChildren();
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'All calibers';
    caliberSelect.append(all);
    for (const caliber of currentChoice()?.calibers ?? []) {
      const option = document.createElement('option');
      option.value = caliber.id ?? '';
      option.textContent = caliber.label + ' · ' + countLabel(caliber.count, 'weapon', 'weapons');
      caliberSelect.append(option);
    }
    caliberSelect.disabled = !currentChoice() || state.updating;
    caliberSelect.value = state.caliber ?? '';
    const count = currentChoice()?.count ?? 0;
    query('[data-category-data-status]').textContent = state.catalog
      ? countLabel(state.choices.length, 'category', 'categories') + ' · ' + countLabel(count, 'weapon', 'weapons') + ' in this category'
      : 'Waiting for the local database …';
  }

  function renderChoices() {
    renderCategoryChoices();
    renderControls();
  }

  function updateChoices() {
    const catalog = getCatalog?.() ?? null;
    const changedCatalog = catalog !== state.catalog;
    state.catalog = catalog;
    state.choices = catalog ? categoryChoices(catalog, sharedOptions()) : [];
    const preferred = state.choices.find(choice => choice.id === 'Marksman rifle') ?? state.choices[0] ?? null;
    if (!state.category || !state.choices.some(choice => choice.id === state.category)) {
      state.category = preferred?.id ?? null;
      state.caliber = null;
    }
    if (!currentChoice()?.calibers.some(caliber => caliber.id === state.caliber)) state.caliber = null;
    renderChoices();
    if (changedCatalog && (state.result || state.running)) invalidate('Database changed. Find best weapons to calculate against the new snapshot.');
  }

  function syncExistingSetting(name, value) {
    const target = document.getElementById(SETTING_TARGETS[name]);
    if (!target) return;
    if (name === 'budget-amount') {
      target.value = String(value);
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const checked = Boolean(value);
    if (target.checked === checked) return;
    target.checked = checked;
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function formatCost(cost) {
    if (!cost) return 'Unknown';
    const value = number(cost.priceRUB ?? 0, 0) + ' RUB';
    return cost.unpriced ? value + ' · ' + cost.unpriced + ' unpriced' : value;
  }

  function resultStatus(result) {
    if (result.status === 'complete' && result.completeRanking) {
      return 'Complete ranking · ' + result.entries.length + ' validated builds' + (result.excluded.length ? ' · ' + result.excluded.length + ' infeasible' : '');
    }
    if (result.entries.length) return 'Partial ranking · ' + result.entries.length + ' valid builds · proof incomplete';
    return 'No valid builds were proven for these options';
  }

  function appendImage(parent, item, className, alt = '') {
    if (!item) return;
    const image = document.createElement('img');
    if (className) image.className = className;
    image.src = imageURL(item.image || item.icon);
    image.alt = alt;
    image.loading = 'lazy';
    image.addEventListener('error', () => { image.hidden = true; }, { once: true });
    parent.append(image);
  }

  function renderExcluded(result) {
    const excluded = query('[data-category-excluded]');
    if (!result.excluded.length) {
      excluded.hidden = true;
      return;
    }
    const counts = new Map();
    for (const item of result.excluded) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
    const reasons = [...counts.entries()].map(([status, count]) => count + ' ' + status).join(' · ');
    query('[data-category-excluded-summary]').textContent = 'Excluded candidates · ' + result.excluded.length;
    query('[data-category-excluded-note]').textContent = 'Reasons: ' + reasons + '. Exclusions remain visible so a partial ranking is never presented as complete.';
    const list = query('[data-category-excluded-list]');
    list.replaceChildren();
    for (const item of result.excluded) {
      const catalogItem = state.catalog?.items[item.weaponId];
      const row = document.createElement('li');
      row.append(createElement('b', null, catalogItem?.shortName ?? item.weaponId), document.createTextNode(' – ' + (catalogItem?.name ?? 'Unknown weapon') + ' · ' + item.status + ': ' + item.message));
      list.append(row);
    }
    excluded.hidden = false;
  }

  function renderDetail(entry) {
    const detail = query('[data-category-detail]');
    detail.replaceChildren();
    if (!entry) {
      detail.hidden = true;
      return;
    }
    const item = state.catalog.items[entry.weaponId];
    const heading = createElement('div', 'category-detail-heading');
    const copy = document.createElement('div');
    copy.append(createElement('p', 'category-kicker', 'SELECTED RESULT'), createElement('h2', null, item.shortName), createElement('p', 'category-muted', item.name));
    const badge = createElement('span', 'category-result-tag', entry.result.status === 'optimal' ? 'Validated candidate' : 'Feasible candidate · proof incomplete');
    heading.append(copy, badge);
    const hero = createElement('div', 'category-detail-hero');
    appendImage(hero, item, 'category-weapon-image', item.name);
    const summary = document.createElement('div');
    summary.append(createElement('p', 'category-detail-meta', formatCaliber(item.caliber) + ' · ' + (state.sound === 'silenced' ? 'Silenced' : 'Unsilenced') + ' · ' + MODE_HELP[state.mode]));
    if (state.mode === 'balanced') {
      const shortfall = Math.max(0, state.balance - entry.result.ergo);
      summary.append(createElement('p', 'category-detail-meta', shortfall ? 'Target ' + state.balance + ' Ergo · ' + number(shortfall) + ' below target' : 'Target ' + state.balance + ' Ergo reached'));
    }
    const stats = createElement('div', 'category-detail-stats');
    stats.append(createElement('div', 'category-stat', 'Ergo ' + number(entry.result.ergo)), createElement('div', 'category-stat', 'V recoil (raw) ' + number(entry.result.vertical)), createElement('div', 'category-stat', 'H recoil (raw) ' + number(entry.result.horizontal)), createElement('div', 'category-stat', 'Magazine ' + (entry.result.magazineCapacity ? entry.result.magazineCapacity + ' rounds' : 'automatic')), createElement('div', 'category-stat', 'Attachments ' + formatCost(entry.result.cost)));
    summary.append(stats);
    hero.append(summary);
    const assembly = createElement('ol', 'category-assembly');
    for (const row of entry.result.rows) {
      const part = state.catalog.items[row.itemId];
      const line = document.createElement('li');
      appendImage(line, part, 'category-part-image');
      const partCopy = document.createElement('span');
      partCopy.append(createElement('b', null, part.shortName), document.createTextNode(' – ' + part.name), createElement('small', 'category-muted', row.path));
      line.append(partCopy);
      assembly.append(line);
    }
    const open = createElement('button', 'primary category-open', 'Open in weapon builder');
    open.type = 'button';
    open.dataset.categoryOpen = entry.weaponId;
    open.disabled = state.opening;
    open.setAttribute('aria-busy', String(state.opening));
    detail.append(heading, hero, createElement('p', 'category-assembly-title', 'Complete assembly · ' + entry.result.rows.length + ' attachment' + (entry.result.rows.length === 1 ? '' : 's')), assembly, open, createElement('p', 'category-open-note', 'Transfers this validated build and its settings without recalculating it.'));
    detail.hidden = false;
  }

  function selectEntry(entry) {
    state.selectedWeaponId = entry.weaponId;
    renderTable(state.result);
    renderDetail(entry);
  }

  function renderTable(result) {
    const table = query('[data-category-rows]');
    table.replaceChildren();
    for (const entry of result.entries) {
      const item = state.catalog.items[entry.weaponId];
      const row = document.createElement('tr');
      row.className = entry.weaponId === state.selectedWeaponId ? 'category-row-selected' : '';
      const weaponCell = document.createElement('td');
      weaponCell.append(createElement('span', 'category-weapon-name', entry.rank + '. ' + item.shortName), createElement('span', 'category-muted category-weapon-full', item.name));
      const actionCell = document.createElement('td');
      const view = createElement('button', 'subtle category-view', 'View');
      view.type = 'button';
      view.dataset.categoryView = entry.weaponId;
      view.setAttribute('aria-label', 'View validated build for ' + item.name);
      view.setAttribute('aria-pressed', String(entry.weaponId === state.selectedWeaponId));
      actionCell.append(view);
      row.append(weaponCell, createElement('td', state.mode === 'ergo' ? 'category-value' : '', number(entry.result.ergo)), createElement('td', state.mode !== 'ergo' ? 'category-value' : '', number(entry.result.vertical)), createElement('td', state.mode !== 'ergo' ? 'category-value' : '', number(entry.result.horizontal)), createElement('td', null, number(entry.result.weight, 2) + ' kg'), createElement('td', 'category-cost', formatCost(entry.result.cost)), actionCell);
      row.addEventListener('click', event => {
        if (event.target instanceof HTMLButtonElement) return;
        selectEntry(entry);
      });
      table.append(row);
    }
    query('[data-category-table-wrap]').hidden = !result.entries.length;
  }

  function renderResult(result) {
    state.result = result;
    state.selectedWeaponId = result.entries[0]?.weaponId ?? null;
    query('[data-category-result-tag]').textContent = resultStatus(result);
    const shortCategory = (currentChoice()?.label ?? 'category').split(' · ')[0];
    query('[data-category-results-title]').textContent = 'Best ' + shortCategory + ' builds';
    query('[data-category-results-meta]').textContent = result.checked + ' of ' + result.total + ' candidates checked · ' + MODE_LABELS[state.mode] + ' · ' + (state.sound === 'silenced' ? 'Silenced' : 'Unsilenced') + ' · ' + formatCaliber(result.caliber);
    query('[data-category-operation-status]').textContent = resultStatus(result);
    query('[data-category-sort-note]').textContent = state.mode === 'balanced'
      ? 'Target: ' + state.balance + ' Ergo. After target shortfall, raw vertical recoil ranks first, then raw horizontal recoil.'
      : state.mode === 'ergo'
        ? 'Ranked by highest Ergo first. Raw vertical and horizontal recoil are shown as comparative proxies; they are not percentage reductions.'
        : 'Ranked by lowest raw vertical recoil, then raw horizontal recoil. These are comparative proxies, not percentage reductions.';
    query('[data-category-sort-note]').hidden = !result.entries.length;
    renderTable(result);
    renderExcluded(result);
    renderDetail(result.entries[0] ?? null);
    query('[data-category-empty]').hidden = result.entries.length > 0;
    if (!result.entries.length) {
      query('[data-category-empty]').replaceChildren(createElement('h3', null, 'No valid builds were proven.'), createElement('p', null, 'Review the exclusion details, trader settings, availability rules and suppressor mode, then try again.'));
    }
  }

  function showProgress(message, checked, total) {
    query('[data-category-operation-status]').textContent = (checked ?? 0) + ' of ' + (total ?? 0) + ' candidates checked · ' + message;
    query('[data-category-result-tag]').textContent = 'Comparison in progress';
    query('[data-category-calculate]').disabled = true;
    query('[data-category-cancel]').hidden = false;
  }

  function calculate() {
    if (!state.catalog || state.running || state.updating || !state.category) return;
    const selection = currentSelection();
    const issue = validateBuildInputs(selection);
    if (issue) {
      const focus = issue.field === 'budget-amount'
        ? query('[data-category-setting="budget-amount"]')
        : issue.field === 'balance' ? query('[data-category-target]') : null;
      query('[data-category-operation-status]').textContent = issue.message;
      notify(issue.title, issue.message, focus ?? undefined);
      focus?.focus();
      return;
    }
    const localRun = ++state.run;
    state.running = true;
    state.result = null;
    state.selectedWeaponId = null;
    query('[data-category-empty]').hidden = false;
    query('[data-category-empty]').replaceChildren(createElement('h3', null, 'Checking complete builds …'), createElement('p', null, 'Each weapon is validated with the current compatibility, availability and budget rules.'));
    query('[data-category-detail]').hidden = true;
    query('[data-category-table-wrap]').hidden = true;
    query('[data-category-excluded]').hidden = true;
    showProgress('Starting comparison …', 0, 0);
    renderControls();
    try {
      const worker = new Worker('./category-worker.mjs', { type: 'module' });
      state.worker = worker;
      worker.onmessage = event => {
        if (localRun !== state.run) return;
        const message = event.data ?? {};
        if (message.type === 'progress') {
          showProgress(message.message, message.checked, message.total);
          return;
        }
        stopWorker();
        if (message.type === 'error') {
          state.result = null;
          renderEmpty('Comparison failed: ' + message.message);
          notify('Category comparison failed', message.message);
          return;
        }
        if (message.type === 'result' && message.result) {
          renderResult(message.result);
          renderControls();
          return;
        }
        state.result = null;
        renderEmpty('Comparison failed: the worker returned no validated result.');
        notify('Category comparison failed', 'The comparison worker returned no validated result.');
      };
      worker.onerror = () => {
        if (localRun !== state.run) return;
        stopWorker();
        renderEmpty('The category comparison could not start. Try again or open the desktop app.');
        notify('Category comparison failed', 'The comparison worker could not start.');
      };
      worker.postMessage({ catalog: state.catalog, options: selection });
    } catch (error) {
      if (localRun !== state.run) return;
      stopWorker();
      const message = error?.message || 'The comparison worker could not start.';
      renderEmpty('Comparison failed: ' + message);
      notify('Category comparison failed', message);
    }
  }

  function invalidate(message = 'Options changed. Find best weapons to refresh the comparison.') {
    state.run += 1;
    stopWorker();
    state.result = null;
    state.selectedWeaponId = null;
    renderEmpty(message);
    renderControls();
  }

  root.addEventListener('change', event => {
    if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) return;
    if (event.target.dataset.categorySetting) {
      const name = event.target.dataset.categorySetting;
      const value = name === 'budget-amount' ? event.target.value : event.target.checked;
      invalidate('Shared settings changed. Find best weapons to refresh the comparison.');
      syncExistingSetting(name, value);
      renderSharedControls();
      return;
    }
    if (event.target.matches('[data-category-category]')) {
      state.category = event.target.value || null;
      state.caliber = null;
      updateChoices();
      invalidate();
    } else if (event.target.matches('[data-category-caliber]')) {
      state.caliber = event.target.value || null;
      invalidate();
    }
  });

  root.addEventListener('input', event => {
    if (event.target instanceof HTMLInputElement && event.target.matches('[data-category-target]')) {
      state.balance = Number(event.target.value);
      renderControls();
      invalidate();
    }
  });

  root.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    if (!target) return;
    if (target.matches('[data-category-objective]')) {
      state.mode = target.dataset.categoryObjective;
      invalidate();
      renderControls();
    } else if (target.matches('[data-category-sound]')) {
      state.sound = target.dataset.categorySound;
      invalidate();
      renderControls();
    } else if (target.matches('[data-category-calculate]')) {
      calculate();
    } else if (target.matches('[data-category-cancel]')) {
      invalidate('Comparison cancelled. Find best weapons to start again.');
    } else if (target.matches('[data-category-settings]')) {
      document.getElementById('settings-open')?.click();
    } else if (target.matches('[data-category-view]')) {
      const entry = state.result?.entries.find(item => item.weaponId === target.dataset.categoryView);
      if (entry) selectEntry(entry);
    } else if (target.matches('[data-category-open]')) {
      const entry = state.result?.entries.find(item => item.weaponId === target.dataset.categoryOpen);
      if (!entry || state.opening) return;
      state.opening = true;
      target.disabled = true;
      target.setAttribute('aria-busy', 'true');
      try {
        Promise.resolve(onOpenBuild(entry))
          .catch(error => notify('Could not open build', error.message))
          .finally(() => {
            state.opening = false;
            if (state.result && state.selectedWeaponId === entry.weaponId) renderDetail(entry);
          });
      } catch (error) {
        state.opening = false;
        notify('Could not open build', error.message);
      }
    }
  });

  const controller = {
    invalidate,
    refresh: updateChoices,
    setUpdating(value) {
      state.updating = Boolean(value);
      if (state.updating) invalidate('Database update in progress. Category comparison is paused.');
      renderChoices();
    },
    cancel() {
      if (state.running) invalidate('Comparison cancelled. Find best weapons to start again.');
    },
    isRunning() {
      return state.running;
    }
  };

  updateChoices();
  return controller;
}
