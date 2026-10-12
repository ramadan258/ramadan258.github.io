export function createServerReadPool({fs,db,isCurrent}) {
  const entries=new Map();
  let closed=false;
  function entry(collection,id){
    if(closed||!isCurrent())throw Error('STALE_SESSION');
    const key=collection+'/'+id;
    if(entries.has(key))return entries.get(key);
    const item={subscribers:new Set(),ready:false,snapshot:null,error:null,stop:null};
    entries.set(key,item);
    item.promise=new Promise((resolve,reject)=>{
      item.reject=reject;
      item.stop=fs.onSnapshot(fs.doc(db,collection,id),{includeMetadataChanges:true},snapshot=>{
        if(closed||!isCurrent())return;
        if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
        item.snapshot=snapshot;
        if(!item.ready){item.ready=true;resolve(snapshot);}
        for(const subscriber of item.subscribers)subscriber.next(snapshot);
      },error=>{
        item.error=error;reject(error);
        for(const subscriber of item.subscribers)subscriber.error(error);
      });
    });
    item.promise.catch(()=>{});
    return item;
  }
  return {
    async read(collection,id){
      const item=entry(collection,id);
      if(item.error)throw item.error;
      const snapshot=item.ready?item.snapshot:await item.promise;
      if(closed||!isCurrent())throw Error('STALE_SESSION');
      return snapshot.data();
    },
    subscribe(collection,id,next,error=()=>{}){
      const item=entry(collection,id),subscriber={next,error};item.subscribers.add(subscriber);
      if(item.error)error(item.error);else if(item.ready)next(item.snapshot);
      return ()=>item.subscribers.delete(subscriber);
    },
    close(){
      closed=true;
      for(const item of entries.values()){item.stop?.();item.reject?.(Error('STALE_SESSION'));item.subscribers.clear();item.snapshot=null;}
      entries.clear();
    },
  };
}
