function decode(value) {
  if('nullValue' in value)return null;
  if('stringValue' in value)return value.stringValue;
  if('booleanValue' in value)return value.booleanValue;
  if('integerValue' in value)return Number(value.integerValue);
  if('doubleValue' in value)return Number(value.doubleValue);
  if('timestampValue' in value)return value.timestampValue;
  if('arrayValue' in value)return (value.arrayValue.values||[]).map(decode);
  if('mapValue' in value)return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([key,value])=>[key,decode(value)]));
  throw Error('INVALID_SERVER_VALUE');
}
// This uses the member's Firebase ID token. Firestore Security Rules still authorize every document.
export function createServerBatchReader({projectId,user,isCurrent,request=fetch,onBatch=()=>{},privateUid=null,endpoint=null}) {
  const parent=`projects/${projectId}/databases/(default)/documents`;
  const allowed=new Set(['accountBindings','memberAccounts','memberRegistry','featuredMembers','memberPermissions']);
  let waiting=[],scheduled=false;
  async function send() {
    const work=waiting;waiting=[];scheduled=false;
    try {
      if(!isCurrent())throw Error('STALE_SESSION');
      const token=await user.getIdToken();
      if(!isCurrent())throw Error('STALE_SESSION');
      const start=performance.now();
      const response=await request(endpoint||`https://firestore.googleapis.com/v1/${parent}:batchGet`,{
        method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({documents:work.map(item=>`${parent}/${item.collection}/${item.id}`)}),
        signal:AbortSignal.timeout(15000),cache:'no-store'
      });
      onBatch({documents:work.length,ms:performance.now()-start});
      const rows=await response.json();
      if(!response.ok){const error=Error('MEMBERSHIP_READ_FAILED');error.code=rows.error?.status==='PERMISSION_DENIED'?'permission-denied':'unavailable';throw error;}
      if(!Array.isArray(rows)||!isCurrent())throw Error(isCurrent()?'INVALID_SERVER_RESPONSE':'STALE_SESSION');
      const results=new Map(rows.map(row=>[row.found?.name||row.missing,row]));
      for(const item of work){
        const name=`${parent}/${item.collection}/${item.id}`,row=results.get(name);
        if(!row)throw Error('INCOMPLETE_SERVER_RESPONSE');
        const data=row.found?Object.fromEntries(Object.entries(row.found.fields||{}).map(([key,value])=>[key,decode(value)])):undefined;
        item.snapshot={id:item.id,data:()=>data,exists:()=>Boolean(row.found),metadata:{fromCache:false,hasPendingWrites:false}};
      }
      work.forEach(item=>item.resolve(item.snapshot));
    }catch(error){work.forEach(item=>item.reject(error));}
  }
  return (collection,id)=>new Promise((resolve,reject)=>{
    const privatePath=privateUid===user.uid&&collection===`plannerMembers/${privateUid}/records`&&/^(catalog|day:\d{4}-\d{2}-\d{2})$/.test(id);
    if(!privatePath&&(!allowed.has(collection)||typeof id!=='string'||!/^[\p{L}\p{N}_-]{1,160}$/u.test(id)))return reject(Error('INVALID_SERVER_PATH'));
    waiting.push({collection,id,resolve,reject});if(!scheduled){scheduled=true;queueMicrotask(()=>{void send();});}
  });
}
