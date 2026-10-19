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
    out.push({id,data,name:document.name,updateTime:document.updateTime});
  }
  // Never use a truncated list as a directory snapshot; the live listener remains the fallback.
  if(out.length>=500)throw Error('PUBLIC_DIRECTORY_LIMIT');
  return out;
}
export function publicDirectoryQuery(projectId,collectionId,{metadataOnly=false}={}){
  if(!['directoryMembers','featuredMembers'].includes(collectionId))throw Error('PUBLIC_DIRECTORY_SCOPE');
  const parent=`projects/${projectId}/databases/(default)/documents`;
  const query={select:{fields:(collectionId==='directoryMembers'?directoryFields:legacyFields).map(fieldPath=>({fieldPath}))},from:[{collectionId}],limit:500};
  if(metadataOnly)query.select.fields=query.select.fields.filter(field=>field.fieldPath!=='src');
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
function publicEndpoint({projectId,apiKey,emulatorPort,hostname=''},method){
  if(!/^[a-z][a-z0-9-]{4,62}$/.test(projectId||'')||typeof apiKey!=='string'||!apiKey||apiKey.length>200)throw Error('PUBLIC_DIRECTORY_CONFIG');
  if(emulatorPort&&!(hostname==='127.0.0.1'&&projectId.startsWith('demo-')&&Number.isInteger(emulatorPort)&&emulatorPort>1023&&emulatorPort<65536))throw Error('PUBLIC_DIRECTORY_EMULATOR_ONLY');
  const parent=`projects/${projectId}/databases/(default)/documents`;
  const origin=emulatorPort?`http://127.0.0.1:${emulatorPort}`:'https://firestore.googleapis.com';
  return `${origin}/v1/${parent}:${method}?key=${encodeURIComponent(apiKey)}`;
}
const photoRefOk=ref=>ref&&/^projects\/[a-z][a-z0-9-]{4,62}\/databases\/\(default\)\/documents\/(directoryMembers\/(member_[0-9]+|custom_member_[A-Za-z0-9_-]{1,100})|featuredMembers\/custom__custom_member_new_[a-f0-9]{32})$/.test(ref.name||'')
  &&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(ref.updateTime||'');
function photoOk(ref,src){
  return typeof src==='string'&&src.length<=210000&&(src===''||/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src)
    ||/^https:\/\/[^\s"<>]+$/.test(src)||/^images\/[A-Za-z0-9_./%-]+$/.test(src)
    ||ref.name.includes('/featuredMembers/')&&/^data:image\/svg\+xml(?:;|,)/.test(src));
}
export function createPublicPhotoCache(options={}){
  let storage,origin;
  try{storage=Object.hasOwn(options,'storage')?options.storage:globalThis.caches;origin=options.origin||globalThis.location?.origin;}catch{}
  let opened;
  const open=()=>opened??=(async()=>{try{return storage&&origin?await storage.open('wa3i-public-member-photos-v1'):null;}catch{return null;}})();
  const key=ref=>new URL('/__wa3i_public_member_photo_v1__/'+encodeURIComponent(ref.name)+'?version='+encodeURIComponent(ref.updateTime),origin).href;
  return {
    async get(ref){try{if(!photoRefOk(ref))return null;const value=await(await open())?.match(key(ref));const src=value?await value.text():null;return photoOk(ref,src)?src:null;}catch{return null;}},
    async put(ref,src){try{if(photoRefOk(ref)&&photoOk(ref,src))await(await open())?.put(key(ref),new Response(src,{headers:{'Content-Type':'text/plain'}}));}catch{}},
    async prune(){try{const cache=await open();if(!cache)return;const keys=await cache.keys();for(const request of keys.slice(0,Math.max(0,keys.length-12)))await cache.delete(request);}catch{}}
  };
}
function visiblePhotos(result){
  const merged=new Map([['member_9',null]]);
  for(const [id] of result.legacy)merged.set(id,result.photoRefs.get('legacy/'+id));
  for(const [id] of result.directory)merged.set(id,result.photoRefs.get('directory/'+id));
  return [...merged.values()].slice(0,3).filter(photoRefOk);
}
export async function readPublicDirectory({projectId,apiKey,emulatorPort,hostname='',request=fetch,signal=AbortSignal.timeout(6000),metadataOnly=false,photoCache=null}){
  const parent=`projects/${projectId}/databases/(default)/documents`;
  const endpoint=publicEndpoint({projectId,apiKey,emulatorPort,hostname},'runQuery');
  const read=async collection=>{
    // These are unauthenticated public reads. Security Rules still authorize both fixed queries.
    const response=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',priority:'high',signal,body:JSON.stringify(publicDirectoryQuery(projectId,collection,{metadataOnly}))});
    if(!response.ok)throw Error('PUBLIC_DIRECTORY_READ_FAILED');
    return records(await response.json(),parent,collection);
  };
  const [current,old]=await Promise.all([read('directoryMembers'),read('featuredMembers')]);
  const directory=new Map(),legacy=new Map(),photoRefs=new Map();
  for(const {id,data,name,updateTime} of current){
    try{if(![1,2].includes(data.schemaVersion)||id!==data.memberId)continue;
      directory.set(id,{...validateDirectoryMember(metadataOnly?{...data,src:''}:data),revision:data.revision});
      if(metadataOnly)photoRefs.set('directory/'+id,{source:'directory',id,name,updateTime});
    }catch{}
  }
  for(const {id,data,name,updateTime} of old){
    if(data.type!=='custom_member'||id!=='custom__'+data.memberId||!/^custom_member_new_[a-f0-9]{32}$/.test(data.memberId||'')||data.schemaVersion!==2||data.managementState!=='ready')continue;
    if(typeof data.name!=='string'||!data.name.trim()||data.name.length>80||!metadataOnly&&(typeof data.src!=='string'||data.src.length>210000))continue;
    legacy.set(data.memberId,{id:data.memberId,name:data.name,src:metadataOnly?'':data.src,source:'custom'});
    if(metadataOnly)photoRefs.set('legacy/'+data.memberId,{source:'legacy',id:data.memberId,name,updateTime});
  }
  if(!metadataOnly)return {directory,legacy};
  const result={directory,legacy,photoRefs,cachedPhotos:new Set()};
  await Promise.all(visiblePhotos(result).map(async ref=>{
    let timer;
    const src=await Promise.race([Promise.resolve().then(()=>photoCache?.get(ref)).catch(()=>null),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),100);})]).finally(()=>clearTimeout(timer));
    if(photoOk(ref,src)){const rows=result[ref.source];rows.set(ref.id,{...rows.get(ref.id),src});result.cachedPhotos.add(ref.name);}
  }));
  return result;
}
export async function readVisiblePublicPhotos(result,options){
  const patches=[],refs=visiblePhotos(result).filter(ref=>!result.cachedPhotos?.has(ref.name));
  if(!refs.length)return patches;
  const endpoint=publicEndpoint(options,'batchGet'),parent=`projects/${options.projectId}/databases/(default)/documents/`;
  if(refs.some(ref=>!ref.name.startsWith(parent)))throw Error('PUBLIC_PHOTO_SCOPE');
  const response=await(options.request||fetch)(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',priority:'high',signal:options.signal||AbortSignal.timeout(6000),
    body:JSON.stringify({documents:refs.map(ref=>ref.name),mask:{fieldPaths:['src']}})});
  if(!response.ok)throw Error('PUBLIC_PHOTO_READ_FAILED');
  const rows=await response.json();if(!Array.isArray(rows)||rows.length>refs.length+1)throw Error('INVALID_PUBLIC_PHOTO_RESPONSE');
  const expected=new Map(refs.map(ref=>[ref.name,ref])),seen=new Set();
  for(const row of rows){
    const document=row.found,name=document?.name||row.missing;
    if(!name)continue;
    const ref=expected.get(name);if(!ref||seen.has(name))throw Error('PUBLIC_PHOTO_SCOPE');seen.add(name);
    // Never pair an older name with a newer image, or cache deleted/unconfirmed documents.
    const src=scalar(document?.fields?.src);
    if(!document||document.updateTime!==ref.updateTime||!photoOk(ref,src))continue;
    patches.push({...ref,src});
  }
  void Promise.all(patches.map(ref=>Promise.resolve().then(()=>options.photoCache?.put(ref,ref.src)))).then(()=>options.photoCache?.prune()).catch(()=>{});
  return patches;
}
export function applyPublicDirectoryPhotos(state,result,patches){
  let changed=false;
  for(const source of ['directory','legacy']){
    const key=source==='directory'?'directoryMembers':'legacyProfiles',seen=source==='directory'?'directoryServerSnapshotSeen':'legacyServerSnapshotSeen';
    if(state[seen]||state[key]!==result[source])continue;
    for(const patch of patches.filter(patch=>patch.source===source)){
      const member=state[key].get(patch.id);if(!member)continue;
      state[key].set(patch.id,{...member,src:patch.src});changed=true;
    }
  }
  return changed;
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
  const options={...config,hostname:location.hostname,emulatorPort:session?.emulators?.firestore,photoCache:createPublicPhotoCache()};
  window.WA3I_PERFORMANCE?.mark('public-directory-request-start');
  window.WA3I_PERFORMANCE?.start('public-directory-first-read');
  window.WA3I_PUBLIC_DIRECTORY_FIRST_READ=readPublicDirectory({...options,metadataOnly:true})
    .then(result=>{
      window.WA3I_PERFORMANCE?.start('public-directory-visible-photos');
      const photos=readVisiblePublicPhotos(result,options).catch(()=>[]).finally(()=>window.WA3I_PERFORMANCE?.end('public-directory-visible-photos'));
      return {result,apply:applyPublicDirectoryFirstRead,photos,applyPhotos:applyPublicDirectoryPhotos};
    }).catch(()=>null)
    .finally(()=>window.WA3I_PERFORMANCE?.end('public-directory-first-read'));
  window.dispatchEvent?.(new Event('wa3i-public-directory-start'));
}
