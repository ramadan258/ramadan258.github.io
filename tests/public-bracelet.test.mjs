import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyCommand,emptyCatalog,emptyDay,dateKey} from '../model.mjs';
import {bindPlannerClock} from '../planner-clock.mjs';
import {derivePublicFrame,nextLocalMidnight} from '../scripts/bracelets/derive.mjs';
import {readCommittedMembers,firestoreTransport,admin,projectId} from '../scripts/bracelets/firestore-reader.mjs';
import {assertPublisherEnvironment,publishFrame} from '../scripts/bracelets/publish.mjs';
import {parsePublicBracelets,publicBraceletView,createPublicBraceletReader,braceletPollMs,braceletFreshnessMs} from '../public-bracelet.mjs';

const first='2026-10-16',instant=Date.parse('2026-10-17T12:00:00Z');
const id='custom_member_new_'+'a'.repeat(32),uid='fictional-account';
const record=(key,value)=>({key,value:JSON.stringify(value),revision:1});
function fixture(done=1,total=1,zone='UTC') {
  const catalog={...emptyCatalog(),timeZone:zone},day=emptyDay(first);
  for(let i=0;i<total;i++){
    catalog.habits.push({id:'h'+i,versions:[{effective:first,name:'PRIVATE_HABIT',days:[0,1,2,3,4,5,6],active:true}]});
    if(i<done)day.habitStatus['h'+i]='done';
  }
  day.report.summary='PRIVATE_REPORT';day.report.gratitude='PRIVATE_GRATITUDE';
  return {id,catalog:record('catalog',catalog),day:record('day:'+first,day)};
}
const frame=(tier='gold',at=instant)=>({schemaVersion:3,generatedAt:at,validUntil:at+braceletFreshnessMs,tiers:{[id]:tier}});

test('trusted public derivation respects exact color boundaries and publishes color only',()=>{
  for(const [done,tier] of [[49,'red'],[50,'blue'],[70,'blue'],[71,'green'],[90,'green'],[91,'gold'],[100,'gold']]){
    const result=derivePublicFrame([fixture(done,100)],instant);assert.equal(result.tiers[id],tier);
    assert.deepEqual(Object.keys(result).sort(),['generatedAt','schemaVersion','tiers','validUntil']);
    for(const secret of ['PRIVATE_HABIT','PRIVATE_REPORT','PRIVATE_GRATITUDE','habitStatus','timeZone',uid])assert.ok(!JSON.stringify(result).includes(secret));
  }
});

test('first publication uses each owner\'s closed day, never the viewer timezone or today',()=>{
  const time=Date.parse('2026-10-16T16:00:00Z'),tokyo=fixture(1,1,'Asia/Tokyo'),la={...fixture(1,1,'America/Los_Angeles'),id:'member_2'};
  const result=derivePublicFrame([tokyo,la],time);
  assert.equal(result.tiers[id],'gold');assert.equal(result.tiers.member_2,'neutral');
  assert.deepEqual(publicBraceletView(result,id,{now:time}),publicBraceletView(result,id,{now:time}));
  const current=fixture();current.day=record('day:2026-10-17',{...emptyDay('2026-10-17'),habitStatus:{h0:'done'}});
  assert.equal(derivePublicFrame([current],instant).tiers[id],'neutral');
});

test('missing/negative/unanswered stay distinct; no eligible, unknown zone and corrupt data are neutral',()=>{
  const member=fixture(0);const original=JSON.stringify(member);
  assert.equal(derivePublicFrame([member],instant).tiers[id],'red');
  const no=JSON.parse(member.day.value);no.habitStatus.h0='no';member.day=record('day:'+first,no);
  assert.equal(derivePublicFrame([member],instant).tiers[id],'red');assert.notEqual(JSON.stringify(member),original);
  member.day=null;assert.equal(derivePublicFrame([member],instant).tiers[id],'red');
  assert.equal(derivePublicFrame([fixture(0,0)],instant).tiers[id],'neutral');
  assert.equal(derivePublicFrame([fixture(1,1,'not-a-zone')],instant).tiers[id],'neutral');
  assert.equal(derivePublicFrame([{id,catalog:{},day:null}],instant).tiers[id],'neutral');
  const invalid=fixture();invalid.catalog.value=invalid.catalog.value.replace('2026-10-16','2026-10-15');
  assert.equal(derivePublicFrame([invalid],instant).tiers[id],'neutral');
});

test('historical schedule and report edits use the existing habit status source',()=>{
  let catalog=JSON.parse(fixture().catalog.value),day=JSON.parse(fixture().day.value);
  catalog=applyCommand(catalog,{[first]:day},{type:'habitArchive',id:'h0'},'2026-10-17').catalog;
  assert.equal(derivePublicFrame([{id,catalog:record('catalog',catalog),day:record('day:'+first,day)}],instant).tiers[id],'gold');
  day=applyCommand(catalog,{[first]:day},{type:'habitStatus',id:'h0',date:first,status:'no'},'2026-10-17')['day:'+first];
  assert.equal(derivePublicFrame([{id,catalog:record('catalog',catalog),day:record('day:'+first,day)}],instant).tiers[id],'red');
  assert.equal(derivePublicFrame([{id,catalog:record('catalog',catalog),day:null}],instant+86400000).tiers[id],'neutral');
});

test('UTC expiry neutralizes all old colors at earliest local midnight, including DST',()=>{
  for(const [iso,zone,next] of [
    ['2026-10-17T23:50:00Z','UTC','2026-10-18T00:00:00Z'],
    ['2026-10-24T22:30:00Z','Europe/Stockholm','2026-10-25T23:00:00Z'],
    ['2026-10-16T15:10:00Z','Asia/Tokyo','2026-10-17T15:00:00Z'],
  ])assert.equal(nextLocalMidnight(Date.parse(iso),zone),Date.parse(next));
  const time=Date.parse('2026-10-17T23:50:00Z'),value=derivePublicFrame([fixture()],time);
  assert.equal(value.validUntil,Date.parse('2026-10-18T00:00:00Z'));
  assert.equal(publicBraceletView(value,id,{now:value.validUntil-1}).tier,'gold');
  assert.equal(publicBraceletView(value,id,{now:value.validUntil}).tier,'neutral');
});

test('public schema refuses private extras, arbitrary levels, legacy schema and excessive validity',()=>{
  for(const value of [{...frame(),uid}, {...frame(),tiers:{[id]:'elite'}}, {...frame(),schemaVersion:2},
    {...frame(),validUntil:instant+braceletFreshnessMs+1}, {...frame(),tiers:{'../x':'gold'}}])assert.throws(()=>parsePublicBracelets(value),/INVALID_PUBLIC/);
});

test('one HTTP read serves every member; polling is deduplicated, visible-only and credential-free',async()=>{
  let now=instant,calls=0,visible=true;
  const reader=createPublicBraceletReader({now:()=>now,visible:()=>visible,fetcher:async(url,options)=>{
    calls++;assert.match(url,/^https:\/\/raw\.githubusercontent\.com\/ramadan258\/ramadan258.github.io\/bracelet-data\/current.json\?v=/);
    assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);
    return {ok:true,text:async()=>JSON.stringify(frame())};
  }});
  await Promise.all([reader.refresh(),reader.refresh(),reader.refresh()]);assert.equal(calls,1);
  for(let i=0;i<100;i++)reader.view('member_'+i);
  assert.equal(reader.view(id).tier,'gold');assert.equal(calls,1);
  now+=braceletPollMs;visible=false;await reader.refresh();assert.equal(calls,1);
  visible=true;await reader.refresh();assert.equal(calls,2);reader.close();assert.equal(reader.view(id).tier,'neutral');
});

test('two independent viewers receive the same color; network failure never extends expiry',async()=>{
  let now=instant,fail=false;
  const open=()=>createPublicBraceletReader({now:()=>now,visible:()=>true,fetcher:async()=>{
    if(fail)throw Error('offline');return {ok:true,text:async()=>JSON.stringify(frame())};
  }});
  const a=open(),b=open();await Promise.all([a.refresh(),b.refresh()]);assert.deepEqual(a.view(id),b.view(id));
  fail=true;now+=braceletFreshnessMs;await Promise.all([a.refresh(),b.refresh()]);
  assert.equal(a.view(id).tier,'neutral');assert.deepEqual(a.view(id),b.view(id));a.close();b.close();
});

test('private timezone sync writes once, waits for drafts and leaves dated answers untouched',()=>{
  let zone='Asia/Tokyo',pending=1,listener,stopped=false,closed=false,writes=0;
  let catalog=emptyCatalog();const days={[first]:emptyDay(first)},before=JSON.stringify(days);
  const store={status:()=>({pending}),snapshot:()=>({catalog,days}),subscribe:fn=>{listener=fn;return()=>{stopped=true;};},close:()=>{closed=true;},
    dispatch:cmd=>{writes++;catalog=applyCommand(catalog,days,cmd,first).catalog;}};
  bindPlannerClock(store,{isCurrent:()=>true,clock:()=>zone,events:new EventTarget(),setTimer:()=>1,clearTimer:()=>{}});
  assert.equal(writes,0);pending=0;listener();listener();assert.equal(writes,1);
  zone='America/Los_Angeles';listener();assert.equal(writes,2);assert.equal(catalog.timeZone,zone);assert.equal(JSON.stringify(days),before);
  store.close();assert.ok(stopped&&closed);listener();assert.equal(writes,2);
});

const encode=fields=>Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,typeof value==='boolean'?{booleanValue:value}:typeof value==='number'?{integerValue:String(value)}:{stringValue:value}]));
function cloudFixture() {
  const member=fixture(),docs=new Map([
    ['memberAccounts/'+id,{schemaVersion:1,uid}],['featuredMembers/custom__'+id,{schemaVersion:2,managementState:'ready',memberId:id}],
    ['accountBindings/'+uid,{schemaVersion:1,active:true,memberId:id}],
    [`plannerMembers/${uid}/records/catalog`,member.catalog],[`plannerMembers/${uid}/records/day:${first}`,member.day],
  ]),calls=[];
  const prefix=`projects/${projectId}/databases/(default)/documents/`;
  async function request(operation,body){
    calls.push({operation,body});
    if(operation==='runQuery')return [{readTime:new Date(instant).toISOString(),document:{name:prefix+'memberRegistry/'+id,fields:encode({schemaVersion:1,memberId:id,source:'cloud',active:true})}}];
    assert.equal(operation,'batchGet');assert.equal(body.readTime,new Date(instant).toISOString());
    return body.documents.map(name=>docs.has(name.slice(prefix.length))?{found:{name,fields:encode(docs.get(name.slice(prefix.length)))}}:{missing:name});
  }
  return {docs,calls,request};
}
test('publisher reads mutually verified memberships at one server snapshot; ignores legacy links',async()=>{
  const cloud=cloudFixture(),result=await readCommittedMembers(cloud.request,{now:instant});
  assert.equal(result.members.length,2);assert.equal(derivePublicFrame(result.members,result.snapshotTime).tiers[id],'gold');
  const paths=cloud.calls.flatMap(c=>c.body.documents||[]).join(' ');
  assert.ok(!paths.includes('/bindings/'));assert.ok(!paths.includes('memberPermissions'));assert.ok(!paths.includes('chatAccess'));
  assert.ok(paths.includes('accountBindings/'+uid));assert.ok(paths.includes(admin.uid));
  cloud.docs.set('accountBindings/'+uid,{schemaVersion:1,active:true,memberId:'member_999'});
  assert.equal((await readCommittedMembers(cloud.request,{now:instant})).members.length,1);
  const old=await readCommittedMembers(async(op,body)=>op==='runQuery'?[...(await cloud.request(op,body)),
    {readTime:new Date(instant).toISOString(),document:{name:'x/member_9',fields:encode({schemaVersion:1,memberId:'member_9',active:true,source:'static'})}},
    {readTime:new Date(instant).toISOString(),document:{name:'x/custom_member_legacy',fields:encode({schemaVersion:1,memberId:'custom_member_legacy',active:true,source:'cloud'})}}]:cloud.request(op,body),{now:instant});
  assert.deepEqual(old.members.map(member=>member.id),[admin.id]);
});

test('cloud transport exposes only read operations and rejects non-OK responses without dumping bodies',async()=>{
  let calls=0;
  const request=firestoreTransport('fictional-short-lived-token',{fetcher:async(url,options)=>{
    calls++;assert.match(url,/:batchGet$/);assert.equal(options.method,'POST');return {ok:false,status:403};
  }});
  await assert.rejects(request('commit',{}),/READ_ONLY_TRANSPORT/);assert.equal(calls,0);
  await assert.rejects(request('batchGet',{}),/^Error: FIRESTORE_READ_HTTP_403$/);assert.equal(calls,1);
});

test('incomplete snapshots and over-budget membership lists fail closed without partial publication',async()=>{
  const cloud=cloudFixture();
  await assert.rejects(readCommittedMembers((op,body)=>op==='batchGet'?[]:cloud.request(op,body),{now:instant}),/INCOMPLETE_SNAPSHOT/);
  await assert.rejects(readCommittedMembers(async()=>Array.from({length:101},(_,i)=>({document:{name:'x/custom_member_new_'+i.toString(16).padStart(32,'0'),fields:encode({schemaVersion:1,active:true,memberId:'custom_member_new_'+i.toString(16).padStart(32,'0'),source:'cloud'})}})),{now:instant}),/READ_BUDGET_REVIEW_REQUIRED/);
});

test('activation stays disabled; public workflow has no PR trigger, private keys or Firebase write grants',()=>{
  const config=readFileSync(new URL('../session-config.js',import.meta.url),'utf8'),workflow=readFileSync(new URL('../.github/workflows/public-bracelets.yml',import.meta.url),'utf8');
  assert.match(config,/"publicBracelets":false/);assert.match(config,/"publicBraceletsDeferred":true/);
  assert.match(workflow,/vars.PUBLIC_BRACELETS_ENABLED == 'true'/);assert.doesNotMatch(workflow,/pull_request|credentials_json|secrets\./);
  assert.match(workflow,/create_credentials_file: false/);assert.match(workflow,/access_token_lifetime: 600s/);
  assert.match(workflow,/persist-credentials: false/);assert.match(workflow,/github.ref == 'refs\/heads\/main'/);
  const env={GITHUB_ACTIONS:'true',PUBLIC_BRACELETS_ENABLED:'true',GITHUB_REPOSITORY:'ramadan258/ramadan258.github.io',GITHUB_REPOSITORY_ID:'1210383914',GITHUB_REPOSITORY_OWNER_ID:'179522853',GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:'ramadan258/ramadan258.github.io/.github/workflows/public-bracelets.yml@refs/heads/main',GITHUB_EVENT_NAME:'schedule'};
  assert.doesNotThrow(()=>assertPublisherEnvironment(env));
  for(const changes of [{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/heads/feature'},{PUBLIC_BRACELETS_ENABLED:'false'},{GITHUB_REPOSITORY_ID:'999'}])assert.throws(()=>assertPublisherEnvironment({...env,...changes}),/NOT_APPROVED/);
});

test('Git publication contains only a fixed color file on a separate branch, never main or private inputs',async()=>{
  const calls=[];
  await publishFrame(frame(),async(path,method='GET',body)=>{
    calls.push({path,method,body});
    if(method==='GET')return null;
    return {sha:'fictional-sha'};
  },()=>instant);
  const writes=calls.filter(c=>c.method!=='GET');assert.equal(writes.at(-1).body.ref,'refs/heads/bracelet-data');
  const tree=writes.find(c=>c.path==='/git/trees');assert.deepEqual(tree.body.tree.map(row=>row.path),['current.json']);
  const blob=writes.find(c=>c.path==='/git/blobs');assert.deepEqual(JSON.parse(blob.body.content),frame());
  assert.ok(!JSON.stringify(calls).includes('PRIVATE_REPORT'));assert.ok(!JSON.stringify(writes).includes('refs/heads/main'));
  await assert.rejects(publishFrame(frame(),async()=>{throw Error('NO_CALL_EXPECTED');},()=>instant+braceletFreshnessMs),/EXPIRED_BEFORE/);
  await assert.rejects(publishFrame(frame(),async path=>path.includes('/git/ref/')?{ref:'refs/heads/bracelet-data',object:{type:'commit',sha:'parent'}}:path.includes('/git/commits/')?{tree:{sha:'tree'}}:{tree:[{path:'private.json',type:'blob'}]},()=>instant),/DATA_BRANCH_REVIEW_REQUIRED/);
});
