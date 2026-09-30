// Author: CA
import * as storage from './storage.mjs';
import {prepareUpdate,imageJobs} from './data-update.mjs';
import {validateCatalog,validateImageSource} from './data-validation.mjs';

export function validateSnapshot(snapshot,bundled){
  if(snapshot?.schemaVersion!==1||!Array.isArray(snapshot.images))throw new Error('Unsupported saved update');
  validateCatalog(snapshot.catalog);
  const sources=new Map((bundled?imageJobs(bundled):[]).map(job=>[job.path,job.source]));
  for(const image of snapshot.images){
    if(!/^images\/[a-f0-9]{24}(?:-reference)?\.webp$/.test(image.path)||!validateImageSource(image.source)||!(image.blob instanceof Blob)||!['image/webp','image/jpeg'].includes(image.blob.type))throw new Error('Invalid saved image');
    sources.set(image.path,image.source);
  }
  if(imageJobs(snapshot.catalog).some(job=>sources.get(job.path)!==job.source))throw new Error('Saved update is missing images');
  return snapshot;
}

export async function loadDatabase(bundled){
  let warning='';
  for(const key of ['updates:active','updates:previous']){
    const saved=await storage.get(key);if(!saved)continue;
    try {
      validateSnapshot(saved,bundled);
      const sourceTime=meta=>Date.parse(meta.sourceModified||meta.fetchedAt);
      if(bundled&&sourceTime(saved.catalog.meta)<sourceTime(bundled.meta))break;
      return {snapshot:saved,warning};
    }catch(error){warning=bundled?(/trader offers|barter offers/.test(error.message)?'The saved database predates current trader/barter support. Bundled data is active; Update database can refresh it.':'A saved update could not be loaded. A verified local database has been restored.'):'The saved database could not be loaded. Download a fresh copy to set up the workbench.';}
  }
  return {snapshot:bundled?{catalog:bundled,images:[],schemaVersion:1}:null,warning};
}

export function setupDatabaseUpdates({getSnapshot,getBundled,activate,setBusy,onReady=()=>{}}){
  const $=id=>document.getElementById(id),dialog=$('update-dialog');
  let controller=null,updating=false,readyPending=false;
  const status=(message,error=false)=>{$('update-status').textContent=message;$('update-status').classList.toggle('update-error',error);};
  function resetDialog(){
    const initial=!getSnapshot();
    $('update-title').textContent=initial?'Set up your local database':'Update your database';
    $('update-intro').innerHTML=initial?'Download the game data and item images from <b>tarkov.dev / The Hideout</b> to start using Tarkov Workbench?':'Download the latest available community export from <b>tarkov.dev / The Hideout</b>?';
    $('update-image-detail').textContent=initial?'All required item images, saved locally for offline use.':'Missing or changed item images, saved for offline use.';
    $('update-size-hint').textContent=initial?'The initial download includes all required images (currently around 20 MB) and the item exports (roughly 20 MB before compression). No account is required. Nothing downloads until you choose Download data.':'Item exports are roughly 20 MB before compression, plus any new images. No account is required. This is a manual download, not permission for background updates. Community data may lag behind an EFT patch.';
    $('update-preserve-hint').textContent=initial?'The workbench remains empty if you stay offline or the download fails. A successful download is validated and saved on this PC for later offline use.':'The current database stays active until the new data has been validated and saved. Cached build results are cleared after a data change.';
    $('update-progress').textContent='No internet request is made until you choose “Download data”.';
    $('update-download').textContent=initial?'Download data':'Download update';
    $('update-download').hidden=false;$('update-download').disabled=false;
    $('update-dismiss').disabled=false;$('update-dismiss').textContent='Stay offline';
    $('update-dialog').removeAttribute('aria-busy');
  }
  function openDialog(){if(updating||dialog.open)return;resetDialog();dialog.showModal();}
  $('update-data').addEventListener('click',openDialog);
  dialog.addEventListener('close',()=>{if(readyPending){readyPending=false;Promise.resolve(onReady()).catch(()=>status('Database saved, but settings could not open. Restart the app.',true));}});
  $('update-dismiss').addEventListener('click',()=>{if(updating){controller?.abort();}else dialog.close();});
  dialog.addEventListener('cancel',event=>{if(updating){event.preventDefault();if(controller)controller.abort();}});
  $('update-download').addEventListener('click',async()=>{
    if(updating)return;
    updating=true;controller=new AbortController();setBusy(true);$('update-data').disabled=true;
    $('update-download').hidden=true;$('update-dismiss').textContent='Cancel download';dialog.setAttribute('aria-busy','true');
    let committed=false;
    try {
      const response=await fetch('./data/overrides.json');if(!response.ok)throw new Error('The bundled importer configuration is missing');
      const current=getSnapshot(),signal=controller.signal;
      const candidate=await prepareUpdate({current:current?.catalog??null,bundled:getBundled(),storedImages:current?.images??[],overrides:await response.json(),signal,onProgress:message=>{if(!signal.aborted)$('update-progress').textContent=message;}});
      signal.throwIfAborted();
      if(candidate.unchanged){
        status(`No changes found · Checked ${new Date(candidate.checkedAt).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}`);
        $('update-progress').textContent='Your local database already matches the current source export.';
      }else{
        validateSnapshot(candidate,getBundled());
        $('update-dismiss').disabled=true;controller=null;
        await storage.saveUpdate(candidate,current);committed=true;
        await activate(candidate);
        if(!current)readyPending=true;
        status('Database updated · Calculated results cleared.');
        $('update-progress').textContent='Database updated and saved locally. Your weapon choice is kept where available. Select Calculate build when you are ready; no build is calculated automatically.';
      }
    }catch(error){
      const cancelled=controller?.signal.aborted;
      const hasData=Boolean(getSnapshot());
      status(committed?'Database saved. Reopen the app to load it.':cancelled?(hasData?'Update cancelled · Existing database kept.':'Setup cancelled · No database saved.'):(hasData?'Update failed · Existing database kept.':'Setup failed · No database saved.'),!cancelled);
      $('update-progress').textContent=committed?'The new database was saved, but the view could not refresh. Please reopen the app.':cancelled?(hasData?'The download was cancelled. Your existing local database is unchanged.':'The download was cancelled. Open Update database when you are ready to set up the workbench.'):`Nothing was replaced. ${error.message||'The database could not be saved.'} Check your connection and free disk space, then try again.`;
      controller?.abort();
    }finally{
      controller=null;updating=false;setBusy(false);$('update-data').disabled=false;$('update-dismiss').disabled=false;$('update-dismiss').textContent='Close';dialog.removeAttribute('aria-busy');
    }
  });
  return {showInitialSetup:openDialog};
}
