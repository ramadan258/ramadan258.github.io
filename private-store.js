import { openOutbox } from './outbox.js';

export async function createPrivateStore({fs,db,uid,memberId,isCurrent,onState,delay=180,
  outbox=openOutbox(db.app.options.projectId + ':private-forms',uid)}) {
  const values=new Map(),revisions=new Map(),pending=new Map(),ephemeral=new Map();
  let sequence=0,timer=null,operation=null,lastError=null,closed=false;
  const known=new Set(['wa3i_daily_report_state_v1','wa3i_daily_report_archive_v1','wa3i_ramadan_report_state_v1','wa3i_ramadan_report_archive_v1',
    'tribe_report_state_v2','tribe_reports_archive_v2','wa3i_slip_report_state_v1','wa3i_pulse_48_state_v1','wa3i_weekly_mirror_state_v1']);
  const privateKey=key=>known.has(key)||key.startsWith(`wa3i_${memberId}_`);
  const current=()=>!closed&&isCurrent();
  const state=()=>onState?.({pending:pending.size,error:lastError,working:Boolean(operation)});
  const assertCurrent=()=>{if(!current())throw Error('STALE_SESSION');};
  const hash=async key=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),n=>n.toString(16).padStart(2,'0')).join('');
  const collection=fs.collection(db,'privateMembers',uid,'records');
  const initial=await fs.getDocsFromServer(collection);assertCurrent();
  for(const doc of initial.docs){const r=doc.data();
    if(!privateKey(r.key)||typeof r.value!=='string'||!Number.isSafeInteger(r.revision)||r.revision<1)throw Error('INVALID_PRIVATE_RECORD');
    if(r.value!=='')values.set(r.key,r.value);revisions.set(r.key,r.revision);
  }
  for(const draft of await outbox.load()||[]){
    if(!privateKey(draft.key)||!Number.isSafeInteger(draft.revision)||draft.revision<0
      ||(draft.value!==null&&typeof draft.value!=='string'))throw Error('INVALID_PRIVATE_DRAFT');
    if((revisions.get(draft.key)||0)!==draft.revision)lastError='CONFLICT';
    pending.set(draft.key,{value:draft.value,revision:draft.revision,sequence:++sequence});
    if(draft.value===null)values.delete(draft.key);else values.set(draft.key,draft.value);
  }
  assertCurrent();
  const journal=()=>outbox.save([...pending].map(([key,item])=>({key,...item})));
  function schedule(){clearTimeout(timer);timer=setTimeout(()=>{timer=null;void flush().catch(()=>{});},delay);}
  function put(key,value){
    assertCurrent();
    if(!privateKey(key)){if(value===null)ephemeral.delete(key);else ephemeral.set(key,value);return;}
    if(value==='')value=null;
    if((values.get(key)??null)===value)return;
    if(value===null)values.delete(key);else values.set(key,value);
    pending.set(key,{value,revision:pending.get(key)?.revision??revisions.get(key)??0,sequence:++sequence});
    void journal().catch(()=>{lastError='DRAFT_STORAGE_FAILED';state();});state();schedule();
  }
  async function commitBatch(){
    assertCurrent();const batch=[...pending].map(([key,change])=>({key,...change}));
    await outbox.save(batch);assertCurrent();
    if(batch.some(i=>i.value?.length>390000))throw Error('PRIVATE_RECORD_TOO_LARGE');
    const prepared=await Promise.all(batch.map(async i=>({...i,ref:fs.doc(collection,await hash(i.key))})));
    assertCurrent();
    const result=await fs.runTransaction(db,async tx=>{
      assertCurrent();const snapshots=[];for(const item of prepared)snapshots.push(await tx.get(item.ref));
      assertCurrent();const next=[];
      for(const [i,item] of prepared.entries()){
        if((snapshots[i].data()?.revision||0)!==item.revision)throw Error('PRIVATE_DATA_CONFLICT');
        // An empty tombstone preserves revision history across clear/recreate.
        tx.set(item.ref,{key:item.key,value:item.value??'',revision:item.revision+1,updatedAt:fs.serverTimestamp()});
        next.push({key:item.key,revision:item.revision+1});
      }return next;
    });
    assertCurrent();for(const item of result)revisions.set(item.key,item.revision);
    for(const item of batch){const latest=pending.get(item.key);if(latest?.sequence===item.sequence)pending.delete(item.key);
      else if(latest)latest.revision=revisions.get(item.key)||0;}
    await journal();assertCurrent();
  }
  async function flush(){
    assertCurrent();clearTimeout(timer);timer=null;if(operation)return operation;
    const work=(async()=>{try{while(pending.size){await commitBatch();assertCurrent();}lastError=null;}
      catch(error){lastError=error.message==='PRIVATE_DATA_CONFLICT'?'CONFLICT':'SAVE_FAILED';throw error;}})();
    operation=work;state();try{return await work;}finally{operation=null;state();}
  }
  if(pending.size&&lastError!=='CONFLICT')schedule();state();
  return {storage:{getItem:key=>current()?(privateKey(key)?values.get(key)??null:ephemeral.get(key)??null):null,
    setItem:(key,value)=>put(String(key),String(value)),removeItem:key=>put(String(key),null)},
    flush,hasPending:()=>pending.size>0,
    close(){closed=true;clearTimeout(timer);values.clear();revisions.clear();ephemeral.clear();pending.clear();outbox.close();},
  };
}
