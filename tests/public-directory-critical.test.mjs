import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {readPublicDirectory,readVisiblePublicPhotos,applyPublicDirectoryFirstRead,applyPublicDirectoryPhotos,createPublicPhotoCache} from '../public-directory-first-read.mjs';

const projectId='demo-directory-critical',apiKey='public-test-key',parent=`projects/${projectId}/databases/(default)/documents/`,stamp='2026-10-20T00:00:00.123456Z';
const image='data:image/png;base64,dGVzdA==';
const docs=[
  {source:'directory',id:'member_9',name:'أمجد'},
  ...Array.from({length:5},(_,index)=>({source:'legacy',id:'custom_member_new_'+String(index+1).repeat(32),name:'Dummy '+index}))
].map(item=>({...item,path:parent+(item.source==='directory'?'directoryMembers/'+item.id:'featuredMembers/custom__'+item.id)}));
const fields=data=>Object.fromEntries(Object.entries(data).map(([key,value])=>[key,Number.isInteger(value)?{integerValue:String(value)}:{stringValue:value}]));
function transport({rows=docs,photoDelay,photoRows}={}){
  const calls=[];
  return {calls,request:async(url,options)=>{
    const body=JSON.parse(options.body);calls.push({url,options,body});
    if(url.includes(':runQuery')){
      const source=body.structuredQuery.from[0].collectionId==='directoryMembers'?'directory':'legacy';
      return {ok:true,json:async()=>rows.filter(row=>row.source===source).map(row=>({document:{name:row.path,updateTime:stamp,fields:fields({schemaVersion:2,memberId:row.id,name:row.name,revision:1,...(source==='legacy'?{type:'custom_member',managementState:'ready'}:{})})}}))};
    }
    await photoDelay;
    return {ok:true,json:async()=>photoRows||body.documents.map(name=>({found:{name,updateTime:stamp,fields:fields({src:image})}}))};
  }};
}
const load=options=>readPublicDirectory({projectId,apiKey,metadataOnly:true,...options});
const photoOptions=m=>({projectId,apiKey,...m});

test('fresh names do not wait for any image payload and projections exclude src',async()=>{
  let release;const m=transport({photoDelay:new Promise(resolve=>{release=resolve;})}),result=await load(m);
  assert.equal(result.directory.size,1);assert.equal(result.legacy.size,5);assert.equal(m.calls.length,2);
  assert.ok(m.calls.every(call=>!call.body.structuredQuery.select.fields.some(field=>field.fieldPath==='src')));
  const pending=readVisiblePublicPhotos(result,photoOptions(m));assert.equal(m.calls.length,3);
  const state={ready:false};assert.equal(applyPublicDirectoryFirstRead(state,result),true);
  assert.equal(state.legacyProfiles.size,5);assert.equal(state.ready,false);
  release();const patches=await pending;assert.equal(patches.length,3);
  assert.equal(applyPublicDirectoryPhotos(state,result,patches),true);
  assert.equal(state.directoryMembers.get('member_9').src,image);
});

test('photo batch is public-only, bounded to the first three displayed members and masked to src',async()=>{
  const m=transport(),result=await load(m);await readVisiblePublicPhotos(result,photoOptions(m));
  const call=m.calls[2];assert.ok(call.url.includes(':batchGet?key='));assert.equal(call.body.documents.length,3);
  assert.deepEqual(call.body.mask,{fieldPaths:['src']});assert.equal(call.options.credentials,'omit');assert.equal(call.options.cache,'no-store');
  assert.deepEqual(call.options.headers,{'Content-Type':'application/json'});
  assert.ok(call.body.documents.every(path=>path.startsWith(parent)&&/directoryMembers|featuredMembers/.test(path)));
});

test('matching-version cached photos display with names and avoid the photo batch, including empty photos',async()=>{
  const m=transport(),seen=[];const result=await load({...m,photoCache:{get:async ref=>{seen.push(ref);return ref.id==='member_9'?'':image;}}});
  assert.equal(result.directory.get('member_9').src,'');assert.equal(result.legacy.values().next().value.src,image);
  assert.equal(seen.length,3);assert.equal(result.cachedPhotos.size,3);
  assert.deepEqual(await readVisiblePublicPhotos(result,photoOptions(m)),[]);assert.equal(m.calls.length,2);
  assert.ok(seen.every(ref=>ref.updateTime===stamp));
});

test('unavailable or stalled image cache cannot block fresh names',async()=>{
  for(const get of [async()=>{throw Error('DENIED');},()=>new Promise(()=>{})]){
    const result=await load({...transport(),photoCache:{get}});assert.equal(result.legacy.size,5);assert.equal(result.cachedPhotos.size,0);
  }
});

test('late photo replies cannot overwrite a live deletion, rename or photo edit',async()=>{
  const m=transport(),result=await load(m),state={};applyPublicDirectoryFirstRead(state,result);
  const newer=new Map([['member_9',{name:'أمجد',src:'images/new.png'}]]);
  state.directoryServerSnapshotSeen=true;state.directoryMembers=newer;state.legacyServerSnapshotSeen=true;state.legacyProfiles=new Map();
  const patches=await readVisiblePublicPhotos(result,photoOptions(m));
  assert.equal(applyPublicDirectoryPhotos(state,result,patches),false);assert.equal(state.directoryMembers,newer);assert.equal(state.legacyProfiles.size,0);
});

test('missing or changed-version photo documents are not shown or cached',async()=>{
  const m=transport({photoRows:[{missing:docs[0].path},{found:{name:docs[1].path,updateTime:'2026-10-20T01:00:00Z',fields:fields({src:image})}}]});
  let writes=0;const result=await load(m),patches=await readVisiblePublicPhotos(result,photoOptions({...m,photoCache:{put:async()=>writes++,prune:async()=>{}}}));
  assert.deepEqual(patches,[]);assert.equal(writes,0);
});

test('foreign project/private path/unrequested photo responses are rejected',async()=>{
  for(const name of [parent+'accountBindings/private',parent+'directoryMembers/unrequested',docs[0].path.replace(projectId,'other-project')]){
    const m=transport({photoRows:[{found:{name,updateTime:stamp,fields:fields({src:image})}}]}),result=await load(m);
    await assert.rejects(readVisiblePublicPhotos(result,photoOptions(m)),/PUBLIC_PHOTO_SCOPE/);
  }
});

test('failed image request leaves fresh names usable without retries or administrative readiness',async()=>{
  const m=transport(),result=await load(m);let calls=0;
  await assert.rejects(readVisiblePublicPhotos(result,photoOptions({request:async()=>{calls++;return {ok:false};}})),/PUBLIC_PHOTO_READ_FAILED/);
  assert.equal(calls,1);const state={ready:false};assert.ok(applyPublicDirectoryFirstRead(state,result));assert.equal(state.legacyProfiles.size,5);assert.equal(state.ready,false);
});

test('blocked metadata does not read a stale roster or cached photos',async()=>{
  let reads=0;await assert.rejects(load({request:async()=>({ok:false}),photoCache:{get:async()=>{reads++;return image;}}}),/PUBLIC_DIRECTORY_READ_FAILED/);
  assert.equal(reads,0);
  const m=transport({rows:[]}),result=await load({...m,photoCache:{get:async()=>image}});
  assert.equal(result.directory.size,0);assert.equal(result.legacy.size,0);assert.deepEqual(await readVisiblePublicPhotos(result,photoOptions(m)),[]);
});

test('photos become available before slow cache writes complete',async()=>{
  const m=transport(),result=await load(m);let release;
  const writes=new Promise(resolve=>{release=resolve;});
  const patches=await readVisiblePublicPhotos(result,photoOptions({...m,photoCache:{put:()=>writes,prune:async()=>{}}}));
  assert.equal(patches.length,3);release();
});

function fakeCacheStorage(){
  const values=new Map();let openedName;
  return {values,get name(){return openedName;},open:async name=>{openedName=name;return {
    match:async key=>values.get(key)?.clone(),put:async(key,value)=>values.set(key,value.clone()),keys:async()=>[...values.keys()],delete:async key=>values.delete(key)
  };}};
}
test('persistent image cache stores only public image strings, isolated by document version and project',async()=>{
  const storage=fakeCacheStorage(),cache=createPublicPhotoCache({storage,origin:'https://example.test'}),ref={name:docs[0].path,updateTime:stamp};
  await cache.put(ref,image);assert.equal(await cache.get(ref),image);
  assert.equal(await cache.get({...ref,updateTime:'2026-10-21T00:00:00Z'}),null);
  assert.equal(await cache.get({...ref,name:ref.name.replace(projectId,'other-project')}),null);
  assert.equal(storage.name,'wa3i-public-member-photos-v1');
  assert.equal(await[...storage.values.values()][0].text(),image);
  for(const name of [parent+'accountBindings/private',parent+'plannerMembers/private/records/catalog'])await cache.put({name,updateTime:stamp},image);
  assert.equal(storage.values.size,1);
});

test('image cache remains bounded and ignores errors or invalid images without touching guest storage',async()=>{
  const storage=fakeCacheStorage(),cache=createPublicPhotoCache({storage,origin:'https://example.test'});
  for(let index=0;index<16;index++)await cache.put({name:parent+'directoryMembers/custom_member_'+index,updateTime:stamp},image);
  await cache.prune();assert.equal(storage.values.size,12);
  await cache.put({name:docs[0].path,updateTime:stamp},'javascript:alert(1)');assert.equal(storage.values.size,12);
  const blocked=createPublicPhotoCache({storage:{open:async()=>{throw Error('BLOCKED');}},origin:'https://example.test'});
  assert.equal(await blocked.get({name:docs[0].path,updateTime:stamp}),null);await blocked.put({name:docs[0].path,updateTime:stamp},image);await blocked.prune();
});

test('a restricted CacheStorage getter cannot abort the public first read',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'caches');
  try{
    Object.defineProperty(globalThis,'caches',{configurable:true,get(){throw new DOMException('Blocked','SecurityError');}});
    const cache=createPublicPhotoCache();assert.equal(await cache.get({name:docs[0].path,updateTime:stamp}),null);
    const result=await load({...transport(),photoCache:cache});assert.equal(result.legacy.size,5);
  }finally{if(previous)Object.defineProperty(globalThis,'caches',previous);else delete globalThis.caches;}
});

test('cache write failure cannot discard already confirmed visible photos',async()=>{
  const m=transport(),result=await load(m);
  const patches=await readVisiblePublicPhotos(result,photoOptions({...m,photoCache:{put(){throw Error('NO_STORAGE');}}}));
  assert.equal(patches.length,3);
});

test('async bootstrap attaches even when its module arrives after DOMContentLoaded',async()=>{
  const source=readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
  const start=source.indexOf('  const attachFirstRead=()=>{'),end=source.indexOf('\n  if (!activateRemote',start),events=new EventTarget();
  const state={firstReadAttached:false,firstReadWatchAttached:false};let paints=0;
  const scope={MEMBER_DIRECTORY_STATE:state,window:{addEventListener:events.addEventListener.bind(events)},refreshMemberDirectoryUI:()=>paints++};
  vm.createContext(scope);vm.runInContext(source.slice(start,end),scope);assert.equal(state.firstReadAttached,false);
  scope.window.WA3I_PUBLIC_DIRECTORY_FIRST_READ=Promise.resolve({result:{},apply:()=>true});events.dispatchEvent(new Event('wa3i-public-directory-start'));
  await Promise.resolve();await Promise.resolve();assert.equal(state.firstReadAttached,true);assert.equal(paints,1);
});

test('live directory query excludes obsolete static legacy records without broadening any permissions',()=>{
  const main=readFileSync(new URL('../js/main.js',import.meta.url),'utf8'),runtime=readFileSync(new URL('../session-runtime.js',import.meta.url),'utf8');
  assert.match(main,/publicBucketSnapshot\(\['custom__custom_member_new_'\]/);
  assert.match(runtime,/custom__custom_member_new_:'custom_member'/);
  assert.match(runtime,/guardCloudWrites\(fs,\(\)=>adminMode&&SESSION.state==='member'&&SESSION.session\?\.isAdmin===true\)/);
});
