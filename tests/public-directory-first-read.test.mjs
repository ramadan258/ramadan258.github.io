import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicDirectoryQuery,readPublicDirectory,applyPublicDirectoryFirstRead} from '../public-directory-first-read.mjs';

const projectId='demo-directory-read',apiKey='public-emulator-key';
const parent=`projects/${projectId}/databases/(default)/documents`;
const oldId='custom_member_new_'+'a'.repeat(32);
const profile={schemaVersion:2,memberId:'custom_member_directory_test',name:'Test member',src:'images/test.png',revision:1};
const legacy={schemaVersion:2,type:'custom_member',managementState:'ready',memberId:oldId,name:'Legacy member',src:'images/legacy.png'};
function document(collection,id,data){
  return {document:{name:`${parent}/${collection}/${id}`,fields:Object.fromEntries(Object.entries(data).map(([key,value])=>[key,Number.isInteger(value)?{integerValue:String(value)}:{stringValue:value}]))}};
}
function mock(current=[document('directoryMembers',profile.memberId,profile)],old=[document('featuredMembers','custom__'+oldId,legacy)]){
  const calls=[];
  return {calls,request:async(url,options)=>{
    calls.push({url,...options});const collection=JSON.parse(options.body).structuredQuery.from[0].collectionId;
    return {ok:true,json:async()=>collection==='directoryMembers'?current:old};
  }};
}
const load=options=>readPublicDirectory({projectId,apiKey,...options});

test('first read makes exactly two fixed public queries without authentication, cookies, writes or persistent caching',async()=>{
  const m=mock(),result=await load(m);assert.equal(m.calls.length,2);
  assert.equal(result.directory.size,1);assert.equal(result.legacy.size,1);
  for(const call of m.calls){
    assert.equal(call.url,`https://firestore.googleapis.com/v1/${parent}:runQuery?key=${apiKey}`);
    assert.equal(call.method,'POST');assert.equal(call.credentials,'omit');assert.equal(call.cache,'no-store');
    assert.deepEqual(call.headers,{'Content-Type':'application/json'});
    const query=JSON.parse(call.body).structuredQuery;assert.equal(query.limit,500);
    assert.ok(query.select.fields.every(({fieldPath})=>['schemaVersion','memberId','name','src','revision','type','managementState'].includes(fieldPath)));
  }
  assert.deepEqual(result.directory.get(profile.memberId),{memberId:profile.memberId,name:profile.name,src:profile.src,revision:1});
});

test('legacy query is restricted to approved dynamic public profiles; private collections cannot be selected',()=>{
  const query=publicDirectoryQuery(projectId,'featuredMembers');
  assert.match(JSON.stringify(query),/custom__custom_member_new_/);
  assert.match(JSON.stringify(query),/custom_member/);
  for(const collection of ['accountBindings','memberAccounts','reports','privateData'])assert.throws(()=>publicDirectoryQuery(projectId,collection),/PUBLIC_DIRECTORY_SCOPE/);
});

test('untrusted, invalid and private fields never become displayed directory records',async()=>{
  const current=[
    document('directoryMembers',profile.memberId,{...profile,password:'not-public',report:'not-public'}),
    document('directoryMembers','wrong-id',profile),
    document('directoryMembers','member_9',{...profile,memberId:'member_9',name:'Impersonation'}),
    document('directoryMembers','custom_member_bad',{...profile,memberId:'custom_member_bad',src:'javascript:alert(1)'}),
    document('directoryMembers','custom_member_schema',{...profile,memberId:'custom_member_schema',schemaVersion:99})
  ];
  const result=await load(mock(current));assert.equal(result.directory.size,1);
  assert.equal(result.directory.get(profile.memberId).password,undefined);
  assert.equal(result.directory.get(profile.memberId).report,undefined);
});

test('legacy reader excludes wrong paths, unmanaged accounts and old static member links',async()=>{
  const old=[document('featuredMembers','custom__'+oldId,legacy),
    document('featuredMembers','custom__member_9',{...legacy,memberId:'member_9'}),
    document('featuredMembers','custom__member_2',{...legacy,memberId:'member_2'}),
    document('featuredMembers','custom__custom_member_new_'+'b'.repeat(32),{...legacy,memberId:'custom_member_new_'+'b'.repeat(32),managementState:'pending'}),
    document('featuredMembers','wrong-path',legacy)];
  const result=await load(mock([],old));assert.deepEqual([...result.legacy.keys()],[oldId]);
});

test('permission denial or a failed source rejects the bootstrap, without retries or writes',async()=>{
  let requests=0;await assert.rejects(load({request:async()=>{requests++;return {ok:false};}}),/PUBLIC_DIRECTORY_READ_FAILED/);
  assert.equal(requests,2);
});

test('unexpected project paths, private paths and truncated responses are rejected',async()=>{
  for(const name of ['projects/other/databases/(default)/documents/directoryMembers/x',`${parent}/reports/x`,`${parent}/directoryMembers/x/private/y`]){
    await assert.rejects(load(mock([{document:{name,fields:{}}}])),/INVALID_PUBLIC_DIRECTORY_PATH/);
  }
  await assert.rejects(load(mock(Array.from({length:500},()=>document('directoryMembers',profile.memberId,profile)))),/PUBLIC_DIRECTORY_LIMIT/);
  await assert.rejects(load(mock({error:'not a query response'})),/INVALID_PUBLIC_DIRECTORY_RESPONSE/);
});

test('emulator overrides are accepted only for a demo project on the exact loopback host',async()=>{
  const m=mock();await load({...m,hostname:'127.0.0.1',emulatorPort:5377});
  assert.ok(m.calls.every(call=>call.url.startsWith('http://127.0.0.1:5377/')));
  for(const options of [{hostname:'example.com',emulatorPort:5377},{hostname:'127.0.0.1',emulatorPort:443},{projectId:'tribe-app-e3e9c',hostname:'127.0.0.1',emulatorPort:5377},{projectId:'../private'}]){
    await assert.rejects(load({...mock(),...options}),/PUBLIC_DIRECTORY_(EMULATOR_ONLY|CONFIG)/);
  }
});

test('late bootstrap cannot overwrite a newer live rename, avatar update or deletion',()=>{
  const current=new Map(),old=new Map([['old',{name:'newer name'}]]),state={directoryMembers:current,legacyProfiles:old,directoryServerSnapshotSeen:true,legacyServerSnapshotSeen:true,ready:true};
  assert.equal(applyPublicDirectoryFirstRead(state,{directory:new Map([['deleted',{}]]),legacy:new Map()}),false);
  assert.equal(state.directoryMembers,current);assert.equal(state.legacyProfiles,old);assert.equal(state.ready,true);
});

test('a fresh source remains usable when only the other live source has arrived',()=>{
  const current=new Map([['current',{}]]),legacy=new Map([['fresh',{}]]),state={directoryMembers:current,directoryServerSnapshotSeen:true,ready:false};
  assert.equal(applyPublicDirectoryFirstRead(state,{directory:new Map(),legacy}),true);
  assert.equal(state.directoryMembers,current);assert.equal(state.legacyProfiles,legacy);assert.equal(state.ready,false);
});

test('empty authoritative results clear older view data and cannot grant administrative readiness',()=>{
  const state={directoryMembers:new Map([['old',{}]]),legacyProfiles:new Map([['old',{}]]),ready:false};
  assert.equal(applyPublicDirectoryFirstRead(state,{directory:new Map(),legacy:new Map()}),true);
  assert.equal(state.directoryMembers.size,0);assert.equal(state.legacyProfiles.size,0);assert.equal(state.ready,false);
  assert.equal(applyPublicDirectoryFirstRead(state,{directory:new Map([['old',{}]]),legacy:new Map()}),false);
  assert.equal(state.directoryMembers.size,0);
});

test('bootstrap is early, public-only and single-run; administrative live guards remain authoritative',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),source=readFileSync(new URL('../public-directory-first-read.mjs',import.meta.url),'utf8');
  assert.equal((html.match(/<script type="module" src="public-directory-first-read.mjs(?:\?v=[a-z0-9]+)?"><\/script>/g)||[]).length,1);
  assert.ok(html.indexOf('src="public-directory-first-read.mjs')<html.indexOf('</head>'));
  assert.ok(!/<link rel="modulepreload" href="public-directory-first-read.mjs/.test(html));
  assert.match(source,/!window.WA3I_SESSION.adminMode&&!window.WA3I_PUBLIC_DIRECTORY_FIRST_READ/);
  assert.doesNotMatch(source,/localStorage|indexedDB|Authorization|setInterval/);
  const main=readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
  assert.match(main,/if\(snapshot.metadata.fromCache\|\|snapshot.metadata.hasPendingWrites\)return;\s*MEMBER_DIRECTORY_STATE.directoryServerSnapshotSeen=true/);
  assert.match(main,/if\(snapshot.metadata.fromCache\|\|snapshot.metadata.hasPendingWrites\)return;\s*MEMBER_DIRECTORY_STATE.legacyServerSnapshotSeen=true/);
});

test('administrative page never starts the public REST bootstrap',async()=>{
  const previous={window:globalThis.window,location:globalThis.location,fetch:globalThis.fetch};let calls=0;
  try{
    globalThis.window={WA3I_SESSION:{adminMode:true}};globalThis.location={hostname:'127.0.0.1'};
    globalThis.fetch=async()=>{calls++;throw Error('ADMIN_BOOTSTRAP_NOT_ALLOWED');};
    await import('../public-directory-first-read.mjs?admin-test');
    assert.equal(calls,0);assert.equal(window.WA3I_PUBLIC_DIRECTORY_FIRST_READ,undefined);
  }finally{Object.assign(globalThis,previous);}
});

test('public auto-start has two reads only, handles failure and never creates an Auth account',async()=>{
  const previous={window:globalThis.window,location:globalThis.location,fetch:globalThis.fetch};let calls=0;
  try{
    globalThis.window={WA3I_SESSION:{adminMode:false},__WA3I_FIREBASE_CONFIG:{projectId,apiKey}};
    globalThis.location={hostname:'example.test'};
    globalThis.fetch=async()=>{calls++;return {ok:false};};
    await import('../public-directory-first-read.mjs?public-test');
    assert.equal(await window.WA3I_PUBLIC_DIRECTORY_FIRST_READ,null);assert.equal(calls,2);
    await import('../public-directory-first-read.mjs?duplicate-test');
    assert.equal(calls,2);
  }finally{Object.assign(globalThis,previous);}
});
