export function openOutbox(projectId,uid) {
  const key=projectId+':'+uid;
  const database=new Promise((resolve,reject)=>{
    const request=indexedDB.open('wa3i-owned-planner-drafts-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('DRAFT_STORAGE_UNAVAILABLE'));
  });
  let pending=Promise.resolve();
  const transact=(mode,action)=>database.then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction('drafts',mode),request=action(tx.objectStore('drafts'));
    tx.oncomplete=()=>resolve(request?.result);tx.onabort=tx.onerror=()=>reject(Error('DRAFT_STORAGE_FAILED'));
  }));
  return {
    load:()=>transact('readonly',store=>store.get(key)),
    save:value=>{const snapshot=structuredClone(value);pending=pending.catch(()=>{}).then(()=>transact('readwrite',store=>snapshot.length?store.put(snapshot,key):store.delete(key)));return pending;},
    close:()=>{void pending.finally(()=>database.then(db=>db.close())).catch(()=>{});},
  };
}
