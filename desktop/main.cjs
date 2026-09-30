// Author: CA
const { app, BrowserWindow, Menu, protocol, session, shell, dialog } = require('electron');
const { readFile } = require('node:fs/promises');
const { resolve, relative, isAbsolute, extname, join } = require('node:path');
const { pathToFileURL } = require('node:url');

app.setName('Tarkov Workbench');
protocol.registerSchemesAsPrivileged([{ scheme: 'workbench', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, allowServiceWorkers: true
} }]);
const baseURL='workbench://app/';
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const csp="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://json.tarkov.dev https://assets.tarkov.dev; object-src 'none'; base-uri 'none'; frame-src 'none'";
let mainWindow;

function openReference(url) {
  try {
    const parsed=new URL(url);
    if(parsed.protocol==='https:'&&['tarkov.dev','escapefromtarkov.fandom.com','escapefromtarkov.wiki.gg'].includes(parsed.hostname))shell.openExternal(parsed.href);
  }catch{}
}

if(!app.requestSingleInstanceLock())app.quit();
else {
  app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}});
  app.whenReady().then(async()=>{
    const root=join(app.getAppPath(),'dist');
    const {imageResponse}=await import(pathToFileURL(join(__dirname,'image-download.mjs')).href);
    protocol.handle('workbench',async request=>{
      try{
        const url=new URL(request.url);
        if(url.hostname!=='app'||request.method!=='GET')return new Response('Forbidden',{status:403});
        const pathname=decodeURIComponent(url.pathname);
        if(pathname==='/api/image')return imageResponse(url.searchParams.get('source'),request.signal);
        const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
        const rel=relative(root,file);
        if(!rel||rel.startsWith('..')||isAbsolute(rel))return new Response('Forbidden',{status:403});
        const bytes=await readFile(file);
        return new Response(bytes,{headers:{'Content-Type':mime[extname(file)]??'application/octet-stream','Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff'}});
      }catch{return new Response('Not found',{status:404});}
    });
    session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>{
      callback(contents.getURL().startsWith(baseURL)&&permission==='clipboard-sanitized-write');
    });
    session.defaultSession.setPermissionCheckHandler((contents,permission)=>Boolean(contents?.getURL().startsWith(baseURL)&&permission==='clipboard-sanitized-write'));
    Menu.setApplicationMenu(null);
    mainWindow=new BrowserWindow({
      title:'Tarkov Workbench',width:1440,height:960,minWidth:560,minHeight:650,show:false,
      backgroundColor:'#101415',icon:join(__dirname,'icon.ico'),
      webPreferences:{nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false,spellcheck:false}
    });
    mainWindow.webContents.setWindowOpenHandler(({url})=>{openReference(url);return {action:'deny'};});
    mainWindow.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(baseURL)){event.preventDefault();openReference(url);}});
    mainWindow.webContents.on('will-attach-webview',event=>event.preventDefault());
    mainWindow.webContents.on('console-message',(_event,details)=>{if(details.level==='error')console.error(details.message);});
    mainWindow.once('ready-to-show',()=>mainWindow.show());
    await mainWindow.loadURL(baseURL);
  }).catch(error=>{dialog.showErrorBox('Tarkov Workbench could not start',error.message);app.quit();});
  app.on('window-all-closed',()=>app.quit());
}
