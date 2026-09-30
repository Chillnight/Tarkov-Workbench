// Author: CA
import * as storage from './storage.mjs';
import {prepareUpdate,imageJobs} from './data-update.mjs';
import {validateCatalog,validateImageSource} from './data-validation.mjs';

export function validateSnapshot(snapshot,bundled){
  if(snapshot?.schemaVersion!==1||!Array.isArray(snapshot.images))throw new Error('Unsupported saved update');
  validateCatalog(snapshot.catalog);
  const sources=new Map(imageJobs(bundled).map(job=>[job.path,job.source]));
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
      if(sourceTime(saved.catalog.meta)<sourceTime(bundled.meta))break;
      return {snapshot:saved,warning};
    }catch(error){warning=/trader offers|barter offers/.test(error.message)?'The saved database predates current trader/barter support. Bundled data is active; Update database can refresh it.':'A saved update could not be loaded. A verified local database has been restored.';}
  }
  return {snapshot:{catalog:bundled,images:[],schemaVersion:1},warning};
}

export function setupDatabaseUpdates({getSnapshot,getBundled,activate,setBusy}){
  const $=id=>document.getElementById(id),dialog=$('update-dialog');
  let controller=null,updating=false;
  const status=(message,error=false)=>{$('update-status').textContent=message;$('update-status').classList.toggle('update-error',error);};
  function resetDialog(){
    $('update-progress').textContent='No internet request is made until you choose “Download update”.';
    $('update-download').hidden=false;$('update-download').disabled=false;
    $('update-dismiss').disabled=false;$('update-dismiss').textContent='Stay offline';
    $('update-dialog').removeAttribute('aria-busy');
  }
  $('update-data').addEventListener('click',()=>{if(updating)return;resetDialog();dialog.showModal();});
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
      const candidate=await prepareUpdate({current:current.catalog,bundled:getBundled(),storedImages:current.images,overrides:await response.json(),signal,onProgress:message=>{if(!signal.aborted)$('update-progress').textContent=message;}});
      signal.throwIfAborted();
      if(candidate.unchanged){
        status(`No changes found · Checked ${new Date(candidate.checkedAt).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}`);
        $('update-progress').textContent='Your local database already matches the current source export.';
      }else{
        validateSnapshot(candidate,getBundled());
        $('update-dismiss').disabled=true;controller=null;
        await storage.saveUpdate(candidate,current);committed=true;
        await activate(candidate);
        status('Database updated · Calculated results cleared.');
        $('update-progress').textContent='Database updated and saved locally. Your weapon choice is kept where available. Select Calculate build when you are ready; no build is calculated automatically.';
      }
    }catch(error){
      const cancelled=controller?.signal.aborted;
      status(committed?'Database saved. Reopen the app to load it.':cancelled?'Update cancelled · Existing database kept.':'Update failed · Existing database kept.',!cancelled);
      $('update-progress').textContent=committed?'The new database was saved, but the view could not refresh. Please reopen the app.':cancelled?'The download was cancelled. Your existing local database is unchanged.':`Nothing was replaced. ${error.message||'The database could not be saved.'} Check your connection and free disk space, then try again.`;
      controller?.abort();
    }finally{
      controller=null;updating=false;setBusy(false);$('update-data').disabled=false;$('update-dismiss').disabled=false;$('update-dismiss').textContent='Close';dialog.removeAttribute('aria-busy');
    }
  });
}
