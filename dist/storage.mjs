// Author: CA
let connection;
function open() {
  if(!globalThis.indexedDB) return Promise.reject(new Error('Local storage unavailable'));
  return connection??=new Promise((resolve,reject)=>{
    const request=indexedDB.open('tarkov-workbench',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('cache');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
export async function get(key) {
  try {const db=await open();return await new Promise((resolve,reject)=>{const r=db.transaction('cache').objectStore('cache').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}catch{return undefined;}
}
export async function put(key,value) {
  try{const db=await open();await new Promise((resolve,reject)=>{const tx=db.transaction('cache','readwrite');tx.objectStore('cache').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});return true;}catch{return false;}
}

export function isStaleCacheKey(key,dataVersion,engineVersion) {
  return typeof key==='string'&&(
    (key.startsWith('catalog:')&&key!==`catalog:${dataVersion}`)||
    (key.startsWith('build:')&&!key.startsWith(`build:${engineVersion}:${dataVersion}:`))
  );
}

export async function prepareSnapshot(dataVersion,engineVersion) {
  try {
    const db=await open();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction('cache','readwrite'),store=tx.objectStore('cache');let removed=0;
      const cursor=store.openCursor();
      cursor.onsuccess=()=>{const row=cursor.result;if(!row)return;if(isStaleCacheKey(row.key,dataVersion,engineVersion)){row.delete();removed++;}row.continue();};
      tx.oncomplete=()=>resolve(removed);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  }catch{return 0;}
}

export async function saveUpdate(snapshot,previousSnapshot){
  const db=await open();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('cache','readwrite'),store=tx.objectStore('cache');
    if(previousSnapshot)store.put(previousSnapshot,'updates:previous');
    store.put(snapshot,'updates:active');
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
