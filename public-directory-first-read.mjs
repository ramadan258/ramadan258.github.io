import {validateDirectoryMember} from './directory-service.mjs';

const directoryFields=['schemaVersion','memberId','name','src','revision'];
const legacyFields=['type','schemaVersion','managementState','memberId','name','src'];
function scalar(value){
  if(value&&typeof value.stringValue==='string')return value.stringValue;
  if(value&&typeof value.integerValue==='string'&&/^-?\d+$/.test(value.integerValue))return Number(value.integerValue);
  return undefined;
}
function records(rows,parent,collection){
  if(!Array.isArray(rows)||rows.length>501)throw Error('INVALID_PUBLIC_DIRECTORY_RESPONSE');
  const prefix=parent+'/'+collection+'/',out=[];
  for(const row of rows){
    if(!row.document)continue;
    const document=row.document;
    if(typeof document.name!=='string'||!document.name.startsWith(prefix))throw Error('INVALID_PUBLIC_DIRECTORY_PATH');
    const id=document.name.slice(prefix.length);if(!id||id.includes('/'))throw Error('INVALID_PUBLIC_DIRECTORY_PATH');
    const allowed=collection==='directoryMembers'?directoryFields:legacyFields;
    const data=Object.fromEntries(allowed.map(key=>[key,scalar(document.fields?.[key])]));
    out.push({id,data});
  }
  // Never use a truncated list as a directory snapshot; the live listener remains the fallback.
  if(out.length>=500)throw Error('PUBLIC_DIRECTORY_LIMIT');
  return out;
}
export function publicDirectoryQuery(projectId,collectionId){
  if(!['directoryMembers','featuredMembers'].includes(collectionId))throw Error('PUBLIC_DIRECTORY_SCOPE');
  const parent=`projects/${projectId}/databases/(default)/documents`;
  const query={select:{fields:(collectionId==='directoryMembers'?directoryFields:legacyFields).map(fieldPath=>({fieldPath}))},from:[{collectionId}],limit:500};
  if(collectionId==='featuredMembers'){
    const field=(fieldPath,op,value)=>({fieldFilter:{field:{fieldPath},op,value}});
    const prefix=parent+'/featuredMembers/custom__custom_member_new_';
    query.where={compositeFilter:{op:'AND',filters:[
      field('type','IN',{arrayValue:{values:[{stringValue:'custom_member'}]}}),
      {compositeFilter:{op:'OR',filters:[{compositeFilter:{op:'AND',filters:[
        field('__name__','GREATER_THAN_OR_EQUAL',{referenceValue:prefix}),
        field('__name__','LESS_THAN_OR_EQUAL',{referenceValue:prefix+'\uf8ff'})
      ]}}]}}
    ]}};
  }
  return {structuredQuery:query};
}
export async function readPublicDirectory({projectId,apiKey,emulatorPort,hostname='',request=fetch,signal=AbortSignal.timeout(6000)}){
  if(!/^[a-z][a-z0-9-]{4,62}$/.test(projectId||'')||typeof apiKey!=='string'||!apiKey||apiKey.length>200)throw Error('PUBLIC_DIRECTORY_CONFIG');
  if(emulatorPort&&!(hostname==='127.0.0.1'&&projectId.startsWith('demo-')&&Number.isInteger(emulatorPort)&&emulatorPort>1023&&emulatorPort<65536))throw Error('PUBLIC_DIRECTORY_EMULATOR_ONLY');
  const parent=`projects/${projectId}/databases/(default)/documents`;
  const origin=emulatorPort?`http://127.0.0.1:${emulatorPort}`:'https://firestore.googleapis.com';
  const endpoint=`${origin}/v1/${parent}:runQuery?key=${encodeURIComponent(apiKey)}`;
  const read=async collection=>{
    // These are unauthenticated public reads. Security Rules still authorize both fixed queries.
    const response=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',signal,body:JSON.stringify(publicDirectoryQuery(projectId,collection))});
    if(!response.ok)throw Error('PUBLIC_DIRECTORY_READ_FAILED');
    return records(await response.json(),parent,collection);
  };
  const [current,old]=await Promise.all([read('directoryMembers'),read('featuredMembers')]);
  const directory=new Map(),legacy=new Map();
  for(const {id,data} of current){
    try{if(![1,2].includes(data.schemaVersion)||id!==data.memberId)continue;
      directory.set(id,{...validateDirectoryMember(data),revision:data.revision});
    }catch{}
  }
  for(const {id,data} of old){
    if(data.type!=='custom_member'||id!=='custom__'+data.memberId||!/^custom_member_new_[a-f0-9]{32}$/.test(data.memberId||'')||data.schemaVersion!==2||data.managementState!=='ready')continue;
    if(typeof data.name!=='string'||!data.name.trim()||data.name.length>80||typeof data.src!=='string'||data.src.length>210000)continue;
    legacy.set(data.memberId,{id:data.memberId,name:data.name,src:data.src,source:'custom'});
  }
  return {directory,legacy};
}
export function applyPublicDirectoryFirstRead(state,result){
  if(!result||state.firstReadApplied)return false;
  state.firstReadApplied=true;
  let changed=false;
  if(!state.directoryServerSnapshotSeen){state.directoryMembers=result.directory;changed=true;}
  if(!state.legacyServerSnapshotSeen){state.legacyProfiles=result.legacy;changed=true;}
  // A public bootstrap is not permission to edit. Only the administrative live snapshot sets ready.
  return changed;
}
if(typeof window!=='undefined'&&window.WA3I_SESSION&&!window.WA3I_SESSION.adminMode&&!window.WA3I_PUBLIC_DIRECTORY_FIRST_READ){
  const config=window.__WA3I_FIREBASE_CONFIG,session=window.__WA3I_SESSION_CONFIG;
  window.WA3I_PERFORMANCE?.start('public-directory-first-read');
  window.WA3I_PUBLIC_DIRECTORY_FIRST_READ=readPublicDirectory({...config,hostname:location.hostname,emulatorPort:session?.emulators?.firestore})
    .then(result=>({result,apply:applyPublicDirectoryFirstRead})).catch(()=>null)
    .finally(()=>window.WA3I_PERFORMANCE?.end('public-directory-first-read'));
}
