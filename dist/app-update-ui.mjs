// Author: CA
import { APP_VERSION, checkForUpdate } from './app-update.mjs';

export function setupAppUpdates() {
  const trigger = document.getElementById('check-app-updates');
  const bridge = window.workbenchUpdates;
  const dialog = document.createElement('dialog');
  dialog.id = 'app-update-dialog';
  dialog.className = 'feedback-dialog';
  dialog.setAttribute('aria-labelledby', 'app-update-title');
  dialog.innerHTML = '<p class="eyebrow">PROGRAM UPDATE · GITHUB</p><h2 id="app-update-title">Check for updates</h2><p id="app-update-message" role="status"></p><p id="app-update-note" class="hint"></p><progress id="app-update-progress" max="100" hidden aria-label="Update download progress"></progress><div class="update-actions"><a id="app-update-zip" class="subtle" target="_blank" rel="noreferrer" hidden>Download portable ZIP</a><button id="app-update-close" type="button" class="subtle">Close</button><button id="app-update-install" type="button" class="primary" hidden>Download and restart</button></div>';
  document.body.append(dialog);
  const title = dialog.querySelector('#app-update-title'), message = dialog.querySelector('#app-update-message');
  const note = dialog.querySelector('#app-update-note'), progress = dialog.querySelector('progress');
  const close = dialog.querySelector('#app-update-close'), install = dialog.querySelector('#app-update-install'), zip = dialog.querySelector('#app-update-zip');
  let busy = false, controller = null, generation = 0, restarting = false;
  function setBusy(value) {
    busy = value;
    trigger.disabled = value;
    install.disabled = value;
    close.textContent = value ? 'Cancel' : 'Close';
    dialog.setAttribute('aria-busy', String(value));
  }
  function showError(error) {
    title.textContent = 'Update could not be completed';
    message.textContent = error.message || 'Please check your internet connection and try again.';
    note.textContent = 'Your current app, database and settings have not been changed.';
    install.hidden = true;
    zip.hidden = true;
  }
  bridge?.onProgress(value => {
    if (!busy || !dialog.open) return;
    message.textContent = value.text;
    if (typeof value.percent === 'number') { progress.hidden = false; progress.value = value.percent; }
  });
  async function dismiss() {
    if (restarting) return;
    controller?.abort();
    if (busy && bridge) {
      const response = await bridge.cancel();
      if (!response.cancelled) return;
    }
    generation++;
    setBusy(false);
    dialog.close();
    trigger.focus();
  }
  close.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  trigger.addEventListener('click', async () => {
    const ownGeneration = ++generation;
    title.textContent = 'Checking for updates';
    message.textContent = 'Contacting GitHub for the latest stable release…';
    note.textContent = `Installed version: ${APP_VERSION}. No download starts without your confirmation.`;
    progress.hidden = true; install.hidden = true; zip.hidden = true;
    setBusy(true); dialog.showModal(); close.focus();
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 20000);
    try {
      const result = bridge ? await bridge.check() : await checkForUpdate({ signal: controller.signal });
      if (ownGeneration !== generation) return;
      if (result.status === 'current') {
        title.textContent = 'You’re up to date';
        message.textContent = 'No newer version was found.';
        note.textContent = `Installed version: ${APP_VERSION}. Equal or older releases are not offered as updates.`;
      } else {
        title.textContent = `Version ${result.version} is available`;
        message.textContent = `Download the update from GitHub? Download size: ${(result.size / 1024 / 1024).toFixed(1)} MB.`;
        if (result.canInstall) {
          note.textContent = 'The download is verified before the app files are replaced. Tarkov Workbench will restart. Your database and settings in your user profile are kept. The previous app folder is retained as a recovery backup.';
          install.hidden = false;
        } else {
          note.textContent = 'Download and extract the ZIP into a separate folder, then open Tarkov-Workbench.exe. Your existing database and settings are kept. Automatic replacement is available in the Windows portable app.';
          zip.href = result.url;
          zip.hidden = false;
        }
      }
    } catch (error) { if (ownGeneration === generation) showError(error); }
    finally {
      clearTimeout(timeout);
      if (ownGeneration === generation) { controller = null; setBusy(false); }
    }
  });
  install.addEventListener('click', async () => {
    const ownGeneration = ++generation;
    setBusy(true);
    message.textContent = 'Downloading the verified portable update…';
    try {
      const result = await bridge.install();
      if (ownGeneration !== generation) return;
      restarting = Boolean(result.restarting);
      if (restarting) { close.disabled = true; close.textContent = 'Restarting…'; }
    } catch (error) { if (ownGeneration === generation) showError(error); }
    finally { if (ownGeneration === generation && !restarting) setBusy(false); }
  });
}
