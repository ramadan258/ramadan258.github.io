export function createServerReadPool({fs,db,isCurrent,onRead=()=>{},getServerSnapshot=(collection,id)=>fs.getDocFromServer(fs.doc(db,collection,id))}) {
  const entries=new Map();
  let closed=false;
  function entry(collection,id){
    if(closed||!isCurrent())throw Error('STALE_SESSION');
    const key=collection+'/'+id;
    if(entries.has(key))return entries.get(key);
    const item={subscribers:new Set(),ready:false,snapshot:null,error:null,stop:null,promise:null};
    entries.set(key,item);
    return item;
  }
  function listen(item,collection,id) {
    if(item.stop)return;
    item.stop=fs.onSnapshot(fs.doc(db,collection,id),{includeMetadataChanges:true},snapshot=>{
        if(closed||!isCurrent())return;
        if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
        item.snapshot=snapshot;item.ready=true;item.error=null;
        for(const subscriber of item.subscribers)subscriber.next(snapshot);
      },error=>{
        item.stop=null;item.error=error;item.ready=false;
        for(const subscriber of item.subscribers)subscriber.error(error);
      });
  }
  return {
    async read(collection,id){
      const item=entry(collection,id);
      if(!item.ready&&!item.promise) {
        const started=performance.now();
        // Bootstrap uses a direct server read, not the first long-lived Listen response.
        item.promise=getServerSnapshot(collection,id).then(snapshot=>{
          if(closed||!isCurrent())throw Error('STALE_SESSION');
          item.snapshot=snapshot;item.ready=true;item.error=null;return snapshot;
        }).finally(()=>{item.promise=null;onRead({ms:performance.now()-started});});
      }
      const snapshot=item.ready?item.snapshot:await item.promise;
      if(closed||!isCurrent())throw Error('STALE_SESSION');
      return snapshot.data();
    },
    subscribe(collection,id,next,error=()=>{}){
      const item=entry(collection,id),subscriber={next,error};item.subscribers.add(subscriber);
      if(item.ready)next(item.snapshot);
      listen(item,collection,id);
      return ()=>{item.subscribers.delete(subscriber);if(!item.subscribers.size){item.stop?.();item.stop=null;}};
    },
    close(){
      closed=true;
      for(const item of entries.values()){item.stop?.();item.subscribers.clear();item.snapshot=null;}
      entries.clear();
    },
  };
}
