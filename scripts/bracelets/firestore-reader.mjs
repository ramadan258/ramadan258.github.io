import {dateKey,addDays,validTimeZone} from '../../model.mjs';
import {readCatalog} from './derive.mjs';

export const projectId='tribe-app-e3e9c';
export const admin={id:'member_9',uid:'OpXzKToeVbd9xp1KHuqnD95yXlm2'};
const prefix=`projects/${projectId}/databases/(default)/documents/`;
const dynamicId=id=>typeof id==='string'&&/^custom_member_new_[a-f0-9]{32}$/.test(id);
const uidOk=uid=>typeof uid==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(uid);
const masks=['schemaVersion','memberId','source','active','uid','managementState','key','value','revision'];

// This transport has no write endpoint, Auth API, retry loop or filesystem output.
export function firestoreTransport(token,{fetcher=fetch}={}) {
  if(typeof token!=='string'||!token)throw Error('MISSING_READ_TOKEN');
  return async(operation,body)=>{
    if(!['runQuery','batchGet'].includes(operation))throw Error('READ_ONLY_TRANSPORT');
    const response=await fetcher(`https://firestore.googleapis.com/v1/${prefix.slice(0,-1)}:${operation}`,{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:'error',
    });
    if(!response.ok)throw Error('FIRESTORE_READ_HTTP_'+response.status);
    return response.json();
  };
}
function decode(fields={}) {
  return Object.fromEntries(Object.entries(fields).map(([key,v])=>[key,'stringValue' in v?v.stringValue:'booleanValue' in v?v.booleanValue:'integerValue' in v?Number(v.integerValue):null]));
}
export async function readCommittedMembers(request,{now=Date.now()}={}) {
  const rows=await request('runQuery',{structuredQuery:{from:[{collectionId:'memberRegistry'}],
    select:{fields:['schemaVersion','memberId','source','active'].map(fieldPath=>({fieldPath}))},
    where:{fieldFilter:{field:{fieldPath:'active'},op:'EQUAL',value:{booleanValue:true}}},limit:101}});
  if(!Array.isArray(rows))throw Error('INVALID_REGISTRY_RESPONSE');
  const documents=rows.filter(row=>row.document);
  if(documents.length>100)throw Error('READ_BUDGET_REVIEW_REQUIRED');
  const registry=documents.flatMap(row=>{
    const id=row.document.name?.split('/').pop(),data=decode(row.document.fields);
    // The protected admin is handled by its fixed UID; legacy entries confer no identity.
    if(!dynamicId(id)||data.schemaVersion!==1||data.memberId!==id||data.source!=='cloud'||data.active!==true)return [];
    return [{id}];
  });
  // 100 members: at most 24 * (7*100 + 2) daily document reads, leaving headroom on Spark.
  const readTime=rows.at(-1)?.readTime,snapshotTime=Date.parse(readTime);
  if(!Number.isSafeInteger(snapshotTime)||snapshotTime>now+30000||now-snapshotTime>60000)throw Error('INVALID_SNAPSHOT_TIME');
  async function batch(paths) {
    const result=new Map();
    for(let i=0;i<paths.length;i+=20){
      const names=paths.slice(i,i+20).map(path=>prefix+path);
      const replies=await request('batchGet',{documents:names,mask:{fieldPaths:masks},readTime});
      if(!Array.isArray(replies))throw Error('INVALID_BATCH_RESPONSE');
      for(const reply of replies){
        const name=reply.found?.name||reply.missing;
        if(!names.includes(name)||result.has(name.slice(prefix.length)))throw Error('UNEXPECTED_BATCH_DOCUMENT');
        result.set(name.slice(prefix.length),reply.found?decode(reply.found.fields):null);
      }
      if(names.some(name=>!result.has(name.slice(prefix.length))))throw Error('INCOMPLETE_SNAPSHOT');
    }
    return result;
  }
  const profiles=await batch(registry.flatMap(({id})=>['memberAccounts/'+id,'featuredMembers/custom__'+id,'featuredMembers/hidden__'+id]));
  const candidates=registry.flatMap(({id})=>{
    const account=profiles.get('memberAccounts/'+id),profile=profiles.get('featuredMembers/custom__'+id);
    return account?.schemaVersion===1&&uidOk(account.uid)&&account.uid!==admin.uid&&profile?.schemaVersion===2
      &&profile.managementState==='ready'&&profile.memberId===id&&!profiles.get('featuredMembers/hidden__'+id)?[{id,uid:account.uid}]:[];
  });
  if(new Set(candidates.map(m=>m.uid)).size!==candidates.length)throw Error('DUPLICATE_ACCOUNT_BINDING');
  const privateRecords=await batch([...candidates.flatMap(({uid})=>['accountBindings/'+uid,`plannerMembers/${uid}/records/catalog`]),`plannerMembers/${admin.uid}/records/catalog`]);
  const members=candidates.filter(({id,uid})=>{
    const binding=privateRecords.get('accountBindings/'+uid);
    return binding?.schemaVersion===1&&binding.active===true&&binding.memberId===id;
  }).concat(admin).map(member=>({...member,catalog:privateRecords.get(`plannerMembers/${member.uid}/records/catalog`)}));
  const dayPath=member=>{
    try{const catalog=readCatalog(member.catalog);return validTimeZone(catalog.timeZone)?`plannerMembers/${member.uid}/records/day:${addDays(dateKey(new Date(snapshotTime),catalog.timeZone),-1)}`:null;}catch{return null;}
  };
  const paths=members.map(dayPath),days=await batch(paths.filter(Boolean));
  return {snapshotTime,members:members.map((member,index)=>({id:member.id,catalog:member.catalog,day:days.get(paths[index])||null}))};
}
