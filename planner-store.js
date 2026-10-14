import { emptyCatalog,emptyDay,dateKey,addDays,applyCommand,validDate } from './model.mjs';
import { missingRanges,rangePages } from './range-cache.mjs';
import { openOutbox } from './outbox.js';

export async function createPlannerStore({fs,db,uid,projectId,isCurrent,onState=()=>{},outbox=openOutbox(projectId,uid),today=dateKey(),clock=()=>today,delay=240}) {
  const records=new Map(),revisions=new Map(),pending=new Map(),listeners=new Set();
  let closed=false,error=null,operation=null,timer,sequence=0,catalogError=null,dataVersion=0;
  const intervals=[];
  const current=()=>!closed&&isCurrent();
  const assertCurrent=()=>{if(!current())throw Error('STALE_SESSION');};
  const collection=fs.collection(db,'plannerMembers',uid,'records');
  const status=()=>({pending:pending.size,error,saving:!!operation,readError:catalogError,loading:intervals.filter(i=>i.state==='loading').length,dataVersion});
  function notify(){if(current()){onState(status());listeners.forEach(fn=>fn());}}
  const parse=snap=>{
    if(!snap.exists())return null;const r=snap.data();
    if(r.key!==snap.id||!Number.isSafeInteger(r.revision)||r.revision<1||typeof r.value!=='string')throw Error('INVALID_RECORD');
    const value=JSON.parse(r.value);if(value.schema!==1||(r.key!=='catalog'&&value.date!==r.key.slice(4)))throw Error('INVALID_RECORD');
    return {value,revision:r.revision};
  };
  function accept(snap) {
    const record=parse(snap),revision=record?.revision||0;
    if(pending.has(snap.id)) {
      if(revision!==pending.get(snap.id).revision && !operation){error='CONFLICT';notify();}return;
    }
    if(record){if(revisions.get(snap.id)===revision)return;records.set(snap.id,record.value);revisions.set(snap.id,revision);dataVersion++;}
    else {
      if(revisions.has(snap.id))dataVersion++;
      if(snap.id==='catalog')records.set('catalog',emptyCatalog(today));
      else records.delete(snap.id);
      revisions.delete(snap.id);
    }
  }
  records.set('catalog',emptyCatalog(today));
  const recovery=outbox.load();
  let catalogResolve,catalogReject;
  const catalogReady=new Promise((resolve,reject)=>{catalogResolve=resolve;catalogReject=reject;});
  catalogReady.catch(()=>{});
  const stopCatalog=fs.onSnapshot(fs.doc(collection,'catalog'),{includeMetadataChanges:true},snap=>{
    if(!current()||snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
    try{accept(snap);catalogError=null;catalogResolve();notify();}catch(error){catalogError='INVALID_RECORD';catalogReject(error);notify();}
  },error=>{catalogError='READ_FAILED';catalogReject(error);notify();});
  const recovered=await recovery;assertCurrent();
  // Only this project and authenticated UID's app-created journal is considered, never legacy reports.
  for(const draft of recovered||[]) {
    if(!/^(catalog|day:\d{4}-\d{2}-\d{2})$/.test(draft.key)||!Number.isSafeInteger(draft.revision)||draft.value?.schema!==1)throw Error('INVALID_DRAFT');
    pending.set(draft.key,{...draft,sequence:++sequence});records.set(draft.key,draft.value);dataVersion++;
  }
  function hasRange(start,end=today) {
    return !catalogError && !missingRanges(start,end,intervals.filter(i=>i.state==='ready')).length;
  }
  async function loadPage(start,end) {
    const interval={start,end,state:'loading',stop:null,reject:null,promise:null};intervals.push(interval);
    const query=fs.query(collection,fs.where('key','>=','day:'+start),fs.where('key','<=','day:'+end),fs.orderBy('key'),fs.limit(63));
    interval.promise=new Promise((resolve,reject)=>{
      interval.reject=reject;let ready=false;
      interval.stop=fs.onSnapshot(query,{includeMetadataChanges:true},snap=>{
        if(!current()){reject(Error('STALE_SESSION'));return;}
        if(snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
        try {
          if(snap.size>=63)throw Error('INCOMPLETE_PAGE');
          snap.docs.forEach(accept);if(interval.state!=='ready')dataVersion++;interval.state='ready';
          if(!ready){ready=true;resolve();}notify();
        }catch(e){interval.state='error';interval.stop?.();notify();if(!ready)reject(e);}
      },e=>{interval.state='error';interval.stop?.();notify();if(!ready)reject(e);});
    });
    notify();return interval.promise;
  }
  async function ensureRange(start,end=today) {
    assertCurrent();if(!validDate(start)||!validDate(end))throw Error('INVALID_DATE');if(start>end)return;
    // Reserve all missing pages before yielding, so overlapping requests reuse in-flight work.
    const pages=missingRanges(start,end,intervals).flatMap(i=>rangePages(i.start,i.end));
    const reservations=pages.map(p=>({...p,state:'loading',promise:null,stop:null,reject:null}));intervals.push(...reservations);
    const work=(async()=>{
      let cursor=0;
      const worker=async()=>{while(cursor<reservations.length){
        const reservation=reservations[cursor++],index=intervals.indexOf(reservation);if(index>=0)intervals.splice(index,1);
        await loadPage(reservation.start,reservation.end);assertCurrent();
      }};
      try{await Promise.all(Array.from({length:Math.min(4,reservations.length)},worker));}
      catch(e){reservations.forEach(r=>{if(intervals.includes(r))r.state='error';});notify();throw e;}
    })();
    reservations.forEach(r=>{r.promise=work;});
    const waiting=intervals.filter(i=>i.state==='loading'&&i.end>=start&&i.start<=end).map(i=>i.promise).filter(Boolean);
    await Promise.all([work,...waiting]);assertCurrent();
    if(!hasRange(start,end))throw Error('READ_FAILED');
  }
  try{await Promise.all([catalogReady,ensureRange(addDays(today,-6),today)]);}
  catch(error){stopCatalog();intervals.forEach(i=>i.stop?.());outbox.close();throw error;}
  for(const key of pending.keys())if(key.startsWith('day:'))await ensureRange(key.slice(4),key.slice(4));
  assertCurrent();
  const journal=()=>outbox.save([...pending].map(([key,item])=>({key,...item})));
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>{void flush().catch(()=>{});},delay);};
  function snapshot(period=null) {
    assertCurrent();const days={};
    if(period&&(!validDate(period.start)||!validDate(period.end)||period.start>period.end))throw Error('INVALID_DATE');
    for(const [key,value] of records)if(key.startsWith('day:')&&(!period||key.slice(4)>=period.start&&key.slice(4)<=period.end))days[key.slice(4)]=structuredClone(value);
    return {catalog:structuredClone(records.get('catalog')),days};
  }
  function dispatch(command) {
    assertCurrent();if(command.date&&!hasRange(command.date,command.date))throw Error('DATE_NOT_LOADED');
    // A command changes at most one day; do not clone the entire loaded history.
    const days=command.date?{[command.date]:records.get('day:'+command.date)}:{};
    const changed=applyCommand(records.get('catalog'),days,command,clock());
    for(const [key,value] of Object.entries(changed)) {
      records.set(key,value);pending.set(key,{value,revision:pending.get(key)?.revision??revisions.get(key)??0,sequence:++sequence});
    }
    dataVersion++;if(error!=='CONFLICT')error=null;
    void journal().catch(()=>{error='DRAFT_STORAGE_FAILED';notify();});notify();schedule();
  }
  async function commit() {
    const batch=[...pending].map(([key,item])=>({key,...structuredClone(item)}));
    await journal();assertCurrent();
    await fs.runTransaction(db,async tx=>{
      assertCurrent();const snapshots=[];for(const item of batch)snapshots.push(await tx.get(fs.doc(collection,item.key)));
      assertCurrent();
      batch.forEach((item,i)=>{
        if((snapshots[i].data()?.revision||0)!==item.revision)throw Error('CONFLICT');
        const value=JSON.stringify(item.value);if(value.length>280000)throw Error('RECORD_TOO_LARGE');
        tx.set(fs.doc(collection,item.key),{key:item.key,value,revision:item.revision+1,updatedAt:fs.serverTimestamp()});
      });
    });
    assertCurrent();
    for(const item of batch) {
      revisions.set(item.key,item.revision+1);
      if(pending.get(item.key)?.sequence===item.sequence)pending.delete(item.key);
      else if(pending.has(item.key))pending.get(item.key).revision=item.revision+1;
    }
    await journal();
  }
  async function flush() {
    assertCurrent();clearTimeout(timer);if(operation)return operation;
    const work=(async()=>{try{while(pending.size){await commit();assertCurrent();}error=null;}
      catch(e){error=e.message==='CONFLICT'?'CONFLICT':'SAVE_FAILED';throw e;}})();
    operation=work;notify();try{await work;}finally{operation=null;notify();}
  }
  if(pending.size)schedule();notify();
  return {snapshot,dispatch,flush,hasPending:()=>pending.size>0,status,
    subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
    ensureRange,hasRange,
    coverage:()=>intervals.map(i=>({start:i.start,end:i.end,state:i.state})),
    draft:()=>{assertCurrent();return [...pending].map(([key,item])=>({key,value:structuredClone(item.value)}));},
    reloadServer:async()=>{
      assertCurrent();if(operation)await operation.catch(()=>{});
      const keys=[...pending.keys()];for(const key of keys){const snap=await fs.getDocFromServer(fs.doc(collection,key));assertCurrent();pending.delete(key);accept(snap);}
      await journal();error=null;notify();
    },
    close:()=>{closed=true;clearTimeout(timer);intervals.forEach(i=>{i.stop?.();i.reject?.(Error('STALE_SESSION'));});stopCatalog();listeners.clear();records.clear();revisions.clear();pending.clear();outbox.close();},
  };
}
let instance;
export async function planner() {
  await window.WA3I_SESSION.ready;
  if(!window.WA3I_SESSION.session)throw Error('AUTH_REQUIRED');
  if(!instance) {
    const session=window.WA3I_SESSION.session,{uid}=session,fs=window.FB;
    const isCurrent=()=>window.WA3I_SESSION.session===session;
    instance=session.kind==='guest'?import('./guest-store.js').then(({createGuestPlanner})=>createGuestPlanner({namespace:window.WA3I_SESSION.guestNamespace,isCurrent,clock:dateKey})):
      createPlannerStore({fs,db:fs.db,uid,projectId:fs.projectId,isCurrent,clock:dateKey});
    window.WA3I_SESSION.planner=await instance;
  }
  return instance;
}
if(typeof window!=='undefined')window.addEventListener('wa3i-session-cleared',()=>{instance=null;});
