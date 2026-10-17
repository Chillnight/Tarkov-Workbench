// Author: CA
const { app, protocol, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.WB_THEME_ROOT || path.resolve(__dirname, '../../dist');
app.setName('CA Theme Startup Test');
app.setPath('userData', process.env.WB_THEME_PROFILE);
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
protocol.registerSchemesAsPrivileged([{ scheme: 'workbenchtheme', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let activeCase;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function window() { return new BrowserWindow({ show: false, width: 1000, height: 750, webPreferences: { offscreen: true, backgroundThrottling: false, nodeIntegration: false, sandbox: true, contextIsolation: true } }); }
app.whenReady().then(async () => {
  protocol.handle('workbenchtheme', async request => {
    const name = new URL(request.url).pathname;
    if (name === '/seed') return new Response('<!doctype html><title>Theme storage seed</title>');
    if (name === '/app.mjs') { await delay(800); return new Response('// Main application deliberately delayed by the test.', { headers: { 'Content-Type': 'text/javascript' } }); }
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(path.resolve(root) + path.sep)) return new Response('Forbidden', { status: 403 });
    try {
      let bytes = fs.readFileSync(file);
      if (name === '/storage.mjs') bytes = Buffer.from((activeCase.error ? "throw Error('Test storage unavailable');\n" : activeCase.timeout ? 'await new Promise(()=>{});\n' : 'await new Promise(resolve=>setTimeout(resolve,250));\n') + bytes.toString());
      return new Response(bytes, { headers: { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': csp, 'Cache-Control': 'no-store' } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  const results = [];
  const cases = [
    ...['original', 'blue', 'bourbon', 'graphite'].map(theme => ({ theme, expected: theme })),
    { theme: 'invalid', expected: 'original' }, { theme: null, expected: 'original' },
    { theme: 'blue', expected: 'original', error: true }, { theme: 'blue', expected: 'original', timeout: true }
  ];
  for (const selection of cases) {
    activeCase = selection; console.error('Theme case start',JSON.stringify(selection));
    const seed = window();
    await seed.loadURL('workbenchtheme://app/seed'); console.error('Seed loaded');
    await seed.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const r=indexedDB.open('tarkov-workbench',1);r.onupgradeneeded=()=>r.result.createObjectStore('cache');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('cache','readwrite');tx.objectStore('cache').put(${JSON.stringify(selection.theme)},'settings:theme');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error);};})`);
    console.error('Seed saved'); seed.destroy();
    const page = window();
    await page.loadURL('workbenchtheme://app/seed');
    page.webContents.debugger.attach('1.3');
    await page.webContents.debugger.sendCommand('Page.enable');
    await page.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `window.themeFrames=[];function sample(){if(document.body)window.themeFrames.push({theme:document.documentElement.dataset.theme??null,loading:document.documentElement.hasAttribute('data-theme-loading'),visibility:getComputedStyle(document.body).visibility,accent:getComputedStyle(document.documentElement).getPropertyValue('--acid').trim()});requestAnimationFrame(sample)}requestAnimationFrame(sample);` });
    console.error('Page debugger ready'); const loading = page.loadURL('workbenchtheme://app/');
    loading.catch(() => {});
    await delay(selection.timeout ? 5500 : 1250);
    console.error('Reading frame samples'); const evaluated = await page.webContents.debugger.sendCommand('Runtime.evaluate', { expression: '({theme:document.documentElement.dataset.theme,pending:document.documentElement.hasAttribute("data-theme-loading"),frames:window.themeFrames,ready:typeof workbenchThemeReady!=="undefined"})', returnByValue: true });
    const result = evaluated.result.value; console.error('Frame samples read');
    const visible = result.frames.filter(frame => frame.visibility === 'visible');
    if (!visible.length || !result.ready || result.pending || result.theme !== selection.expected || visible.some(frame => frame.loading || frame.theme !== selection.expected)) throw Error('Incorrect first visible theme: ' + JSON.stringify({ selection, result }));
    const expectedAccent = { original: '#c5f576', blue: '#91c9f7', bourbon: '#f2a9ba', graphite: '#d2d8df' }[selection.expected];
    if (visible.some(frame => frame.accent !== expectedAccent)) throw Error('Wrong visible theme accent: ' + JSON.stringify({ selection, visible }));
    results.push({ ...selection, hiddenFrames: result.frames.length - visible.length, visibleFrames: visible.length, firstVisibleFrame: visible[0], finalTheme: result.theme });
    page.destroy();
  }
  fs.writeFileSync(process.env.WB_THEME_OUTPUT, JSON.stringify({ electron: process.versions.electron, root, results }, null, 2));
  app.quit();
}).catch(error => { fs.writeFileSync(process.env.WB_THEME_OUTPUT + '.error.log', String(error.stack)); app.exit(1); });
