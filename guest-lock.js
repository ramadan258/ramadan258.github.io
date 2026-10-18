const queues=new Map();
export async function withGuestLock(name,task) {
  // Always return a promise so a synchronous storage error also releases the lock.
  if(globalThis.navigator?.locks)return navigator.locks.request(name,async()=>task());
  if(globalThis.indexedDB){
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('wa3i-guest-locks-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('locks');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    try{return await new Promise((resolve,reject)=>{
      const transaction=db.transaction('locks','readwrite'),request=transaction.objectStore('locks').get(name);let result;
      request.onsuccess=()=>{try{result=task();}catch(error){transaction.abort();reject(error);}};
      transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>reject(transaction.error);
      transaction.onabort=()=>reject(transaction.error||Error('LOCAL_LOCK_FAILED'));
    });}finally{db.close();}
  }
  // Only non-browser unit-test stores use this fallback.
  const previous=queues.get(name)||Promise.resolve(),next=previous.catch(()=>{}).then(task);queues.set(name,next);
  try{return await next;}finally{if(queues.get(name)===next)queues.delete(name);}
}
