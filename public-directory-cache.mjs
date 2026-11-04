import {validateDirectoryMember} from './directory-service.mjs';

const maxBytes=2500000,legacyId=/^custom_member_new_[a-f0-9]{32}$/;
export function publicDirectorySnapshot(result,projectId){
  if(!/^[a-z][a-z0-9-]{4,62}$/.test(projectId||''))throw Error('INVALID_PUBLIC_PROJECT');
  const snapshot={schema:1,projectId,directory:[],legacy:[]},seen=new Set();let bytes=0;
  for(const source of ['directory','legacy']){
    const rows=result[source];if(!(rows instanceof Map)||rows.size>499)throw Error('INVALID_PUBLIC_SNAPSHOT');
    for(const [id,row] of rows){
      let value;
      if(source==='directory'){
        value=validateDirectoryMember({...row,memberId:id});
        if(row.memberId!==id)throw Error('INVALID_PUBLIC_SNAPSHOT');
        if(Number.isSafeInteger(row.revision)&&row.revision>=0)value.revision=row.revision;
      }else{
        if(!legacyId.test(id)||row.id!==id||typeof row.name!=='string'||!row.name.trim()||row.name.length>80||typeof row.src!=='string'||row.src.length>210000)throw Error('INVALID_PUBLIC_SNAPSHOT');
        const image=row.src;
        if(image&&!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)&&!/^data:image\/svg\+xml(?:;|,)/.test(image)&&!/^https:\/\/[^\s"<>]+$/.test(image)&&!/^images\/[A-Za-z0-9_./%-]+$/.test(image))throw Error('INVALID_PUBLIC_IMAGE');
        value={id,name:row.name.trim(),src:image,source:'custom'};
      }
      if(seen.has(source+'/'+id))throw Error('DUPLICATE_PUBLIC_MEMBER');seen.add(source+'/'+id);
      bytes+=JSON.stringify(value).length;if(bytes>maxBytes)throw Error('PUBLIC_SNAPSHOT_TOO_LARGE');
      snapshot[source].push([id,value]);
    }
  }
  if(JSON.stringify(snapshot).length>maxBytes)throw Error('PUBLIC_SNAPSHOT_TOO_LARGE');
  return snapshot;
}
export function parsePublicDirectorySnapshot(value,projectId){
  if(typeof value==='string'&&value.length>maxBytes)throw Error('PUBLIC_SNAPSHOT_TOO_LARGE');
  const snapshot=typeof value==='string'?JSON.parse(value):value;
  if(!snapshot||snapshot.schema!==1||snapshot.projectId!==projectId||Object.keys(snapshot).some(key=>!['schema','projectId','directory','legacy'].includes(key)))throw Error('INVALID_PUBLIC_SNAPSHOT');
  for(const source of ['directory','legacy']){
    if(!Array.isArray(snapshot[source])||snapshot[source].length>499||snapshot[source].some(row=>!Array.isArray(row)||row.length!==2)||new Set(snapshot[source].map(row=>row[0])).size!==snapshot[source].length)throw Error('INVALID_PUBLIC_SNAPSHOT');
    const keys=source==='directory'?['memberId','name','src','revision']:['id','name','src','source'];
    if(snapshot[source].some(([,row])=>!row||Object.keys(row).some(key=>!keys.includes(key))))throw Error('PRIVATE_FIELD_IN_PUBLIC_SNAPSHOT');
  }
  const clean=publicDirectorySnapshot({directory:new Map(snapshot.directory),legacy:new Map(snapshot.legacy)},projectId);
  return {directory:new Map(clean.directory),legacy:new Map(clean.legacy)};
}
export function createPublicDirectoryCache({projectId,storage,origin,onRemoval=()=>{}}={}){
  let opened,chain=Promise.resolve(),generation=0;
  const open=()=>opened??=(async()=>{try{storage??=globalThis.caches;origin||=globalThis.location?.origin;return storage&&origin?await storage.open('wa3i-public-directory-v1'):null;}catch{return null;}})();
  const key=()=>new URL('/__wa3i_public_directory_v1__/'+encodeURIComponent(projectId),origin).href;
  return {
    async read(){try{const cache=await open(),response=await cache?.match(key());return response?parsePublicDirectorySnapshot(await response.text(),projectId):null;}catch{return null;}},
    remember(result){
      let value;try{value=JSON.stringify(publicDirectorySnapshot(result,projectId));}catch{return Promise.resolve(false);}
      const next=++generation;
      chain=chain.catch(()=>{}).then(async()=>{try{
        const cache=await open();if(!cache||next!==generation)return false;
        const old=await cache.match(key()),current=parsePublicDirectorySnapshot(value,projectId),ids=new Set([...current.directory.keys(),...current.legacy.keys()]);
        if(old)try{const prior=parsePublicDirectorySnapshot(await old.text(),projectId);for(const id of new Set([...prior.directory.keys(),...prior.legacy.keys()]))if(!ids.has(id))onRemoval(id);}catch{}
        await cache.put(key(),new Response(value,{headers:{'Content-Type':'application/json'}}));return true;
      }catch{return false;}});
      return chain;
    }
  };
}
export function applyPublicDirectoryPreview(state,result){
  if(!result||state.firstReadApplied||state.directoryServerSnapshotSeen||state.legacyServerSnapshotSeen)return false;
  state.directoryMembers=result.directory;state.legacyProfiles=result.legacy;
  state.publicPreviewApplied=true;
  return true;
}
export function embeddedPublicDirectory(document,projectId){
  try{
    const node=document.getElementById('publicDirectorySnapshot');if(!node||node.textContent.length>maxBytes)return null;
    const result=parsePublicDirectorySnapshot(node.textContent,projectId);
    const images=new Map(Array.from(document.querySelectorAll('#members .slide-card'),card=>[card.dataset.memberId,card.querySelector('img')?.getAttribute('src')||'']));
    for(const source of ['directory','legacy'])for(const [id,row] of result[source])row.src=images.get(id)||'';
    return parsePublicDirectorySnapshot(publicDirectorySnapshot(result,projectId),projectId);
  }catch{return null;}
}
