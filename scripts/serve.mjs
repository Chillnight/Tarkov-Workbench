// Author: CA
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { imageResponse } from '../desktop/image-download.mjs';
const root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
  try {
    if(req.method!=='GET'){res.writeHead(405).end('Method not allowed');return;}
    const url=new URL(req.url,'http://localhost'),path=decodeURIComponent(url.pathname);
    if(path==='/api/image'){
      const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
      const response=await imageResponse(url.searchParams.get('source'),controller.signal);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(new Uint8Array(await response.arrayBuffer()));return;
    }
    const file=resolve(root,'.'+(path==='/'?'/index.html':path));
    if(!file.startsWith(root+sep)||!(await stat(file)).isFile()) {res.writeHead(404).end('Not found');return;}
    res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    res.end(await readFile(file));
  }catch{res.writeHead(404).end('Not found');}
}).on('error',error=>{console.error(`Server could not start: ${error.message}`);process.exitCode=1;}).listen(4173,'127.0.0.1',()=>{
  console.log('Tarkov Workbench: http://127.0.0.1:4173');
  console.log('Press Ctrl+C or close this window to stop.');
  if(process.argv.includes('--open')){
    if(process.platform==='win32')spawn('powershell.exe',['-NoProfile','-Command',"Start-Process 'http://127.0.0.1:4173'"],{windowsHide:true,stdio:'ignore'}).unref();
    else spawn(process.platform==='darwin'?'open':'xdg-open',['http://127.0.0.1:4173'],{stdio:'ignore'}).unref();
  }
});
