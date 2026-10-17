// Author: CA
(() => {
  const root = document.documentElement;
  root.setAttribute('data-theme-loading', '');
  let finished = false, resolveReady;
  globalThis.workbenchThemeReady = new Promise(resolve => { resolveReady = resolve; });
  function finish(theme) {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    root.dataset.theme = theme;
    root.removeAttribute('data-theme-loading');
    resolveReady(theme);
  }
  // A failed module load or unavailable local storage must not hide the app.
  const timeout = setTimeout(() => finish('original'), 5000);
  Promise.all([import('./storage.mjs'), import('./themes.mjs')])
    .then(async ([storage, { normalizeTheme }]) => normalizeTheme(await storage.get('settings:theme')))
    .then(finish, () => finish('original'));
})();
