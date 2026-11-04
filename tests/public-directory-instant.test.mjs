import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {publicDirectorySnapshot,parsePublicDirectorySnapshot,createPublicDirectoryCache,applyPublicDirectoryPreview,embeddedPublicDirectory} from '../public-directory-cache.mjs';
import {renderPublicDirectorySnapshot,snapshotStart,snapshotEnd} from '../scripts/public-directory-build.mjs';
const project='demo-directory-instant',src='data:image/png;base64,dGVzdA==',id='custom_member_new_'+'a'.repeat(32);
const roster=()=>({directory:new Map([['member_9',{memberId:'member_9',name:'أمجد',src,revision:2}]]),legacy:new Map([[id,{id,name:'Fake public member',src,source:'custom'}]])});
function storage(){const values=new Map();return {values,open:async()=>({match:async key=>values.get(key)?.clone(),put:async(key,value)=>values.set(key,value.clone())})};}
const cache=(store,extra={})=>createPublicDirectoryCache({projectId:project,storage:store,origin:'https://example.test',...extra});
test('all public names and photos, not only the first three, are remembered without guest keys or Auth',async()=>{
  const local=storage(),service=cache(local),data=roster();
  for(let i=0;i<10;i++){const member='custom_member_new_'+i.toString(16).padStart(32,'0');data.legacy.set(member,{id:member,name:'Fake '+i,src,source:'custom'});}
  assert.equal(await service.remember(data),true);assert.deepEqual(await service.read(),data);assert.equal(local.values.size,1);
  assert.match([...local.values.keys()][0],/\/__wa3i_public_directory_v1__\//);
  const raw=await[...local.values.values()][0].clone().text();assert.doesNotMatch(raw,/uid|password|token|habitStatus|report|permission/);
});
test('a confirmed empty directory replaces the full cache and cannot resurrect deleted entries',async()=>{
  const local=storage(),removed=[],service=cache(local,{onRemoval:value=>removed.push(value)});await service.remember(roster());
  const empty={directory:new Map(),legacy:new Map()};assert.equal(await service.remember(empty),true);
  assert.deepEqual(await service.read(),empty);assert.ok(removed.includes(id));assert.equal(local.values.size,1);
});
test('serial cache updates retain the latest complete state, not an older in-flight write',async()=>{
  const local=storage(),service=cache(local),first=roster(),second=roster();second.legacy.delete(id);
  await Promise.all([service.remember(first),service.remember(second)]);assert.deepEqual(await service.read(),second);
});
test('blocked, corrupt or unavailable public cache is harmless and does not create guest records',async()=>{
  const denied=cache({open:async()=>{throw Error('BLOCKED');}});assert.equal(await denied.read(),null);assert.equal(await denied.remember(roster()),false);
  const local=storage(),service=cache(local);await service.remember(roster());local.values.set([...local.values.keys()][0],new Response('{broken'));
  assert.equal(await service.read(),null);assert.equal(await cache(local,{projectId:'other-project'}).read(),null);
});
test('snapshot only serializes allowed public fields and rejects private fields or foreign projects on read',()=>{
  const data=roster();data.directory.get('member_9').password='NEVER_EXPORT';data.legacy.get(id).uid='NEVER_EXPORT';
  const value=publicDirectorySnapshot(data,project);assert.doesNotMatch(JSON.stringify(value),/NEVER_EXPORT|password|uid/);
  assert.throws(()=>parsePublicDirectorySnapshot(value,'another-project'),/INVALID_PUBLIC/);
  for(const key of ['uid','password','permissions','report']){const invalid=structuredClone(value);invalid.legacy[0][1][key]='private';assert.throws(()=>parsePublicDirectorySnapshot(invalid,project),/PRIVATE_FIELD/);}
  assert.throws(()=>parsePublicDirectorySnapshot('x'.repeat(2500001),project),/TOO_LARGE/);
});
test('unmanaged IDs, duplicate records, unsafe image URLs and an altered administrative name are rejected',()=>{
  for(const mutate of [data=>data.directory.get('member_9').name='Other',data=>data.directory.get('member_9').src='javascript:alert(1)',data=>data.legacy.set('member_1',{id:'member_1',name:'Old link',src,source:'custom'})]){const value=roster();mutate(value);assert.throws(()=>publicDirectorySnapshot(value,project));}
  const duplicate=publicDirectorySnapshot(roster(),project);duplicate.legacy.push(duplicate.legacy[0]);assert.throws(()=>parsePublicDirectorySnapshot(duplicate,project),/INVALID_PUBLIC/);
});
test('public previews never establish edit readiness and late cache cannot undo a server edit or deletion',()=>{
  const result=roster(),state={ready:false};assert.equal(applyPublicDirectoryPreview(state,result),true);assert.equal(state.ready,false);
  for(const flags of [{firstReadApplied:true},{directoryServerSnapshotSeen:true},{legacyServerSnapshotSeen:true}]){
    const newer={...flags,directoryMembers:new Map(),legacyProfiles:new Map(),ready:false};assert.equal(applyPublicDirectoryPreview(newer,result),false);assert.equal(newer.directoryMembers.size,0);assert.equal(newer.ready,false);
  }
});
const template=`<html><head>${snapshotStart}${snapshotEnd}</head><body><section id="members"><div class="slider-container"><div class="slider" aria-live="polite"></div></div><div id="memberManageAdminSlot" hidden></div></section></body></html>`;
test('cold first paint contains all public cards and inline images before any JavaScript or Firebase response',()=>{
  const value=publicDirectorySnapshot(roster(),project),html=renderPublicDirectorySnapshot(template,value,project);
  assert.equal((html.match(/class="slide-card"/g)||[]).length,2);assert.equal((html.match(/loading="eager"/g)||[]).length,2);assert.equal((html.match(/data:image\/png/g)||[]).length,2);
  assert.ok(html.includes('أمجد')&&html.includes('Fake public member'));
  const again=renderPublicDirectorySnapshot(html,value,project);assert.equal(again,html);
  assert.doesNotMatch(html,/firebase-auth|private_key|accountBindings|signInAnonymously/);
});
test('rendering escapes public names and image attributes, without duplicating photo data in JSON',()=>{
  const value=roster();value.legacy.get(id).name='</script><img src=x onerror=alert(1)>';
  const html=renderPublicDirectorySnapshot(template,publicDirectorySnapshot(value,project),project);
  assert.ok(html.includes('&lt;/script&gt;'));assert.ok(html.includes('\\u003c/script>'));assert.doesNotMatch(html,/<img src=x/);
  const inline=JSON.parse(html.match(/id="publicDirectorySnapshot">([\s\S]*?)<\/script>/)[1]);assert.equal(inline.legacy[0][1].src,'');
});
test('embedded cards are revalidated and restored to source maps without using permissions or account data',()=>{
  const value=publicDirectorySnapshot(roster(),project);for(const source of ['directory','legacy'])for(const [,row]of value[source])row.src='';
  const doc={getElementById:()=>({textContent:JSON.stringify(value)}),querySelectorAll:()=>['member_9',id].map(memberId=>({dataset:{memberId},querySelector:()=>({getAttribute:()=>src})}))};
  assert.deepEqual(embeddedPublicDirectory(doc,project),roster());assert.equal(embeddedPublicDirectory(doc,'other-project'),null);
  doc.querySelectorAll=()=>[{dataset:{memberId:'member_9'},querySelector:()=>({getAttribute:()=> 'javascript:alert(1)'})}];assert.equal(embeddedPublicDirectory(doc,project),null);
});
function early({admin=false,raw='[]',blocked=false}={}){
  const values=new Map([['wa3i-public-directory-removals-v1:'+project,raw]]),styles=[],scope={window:{__WA3I_FIREBASE_CONFIG:{projectId:project},WA3I_SESSION:{adminMode:admin}},localStorage:{getItem:key=>{if(blocked)throw Error('BLOCKED');return values.get(key)??null;},setItem:(key,value)=>values.set(key,value)},document:{createElement:()=>({}),head:{append:node=>styles.push(node)}},Set,Array,JSON};
  vm.runInNewContext(readFileSync(new URL('../public-directory-early.js',import.meta.url),'utf8'),scope);return {scope,values,styles};
}
test('known removals are hidden before the static cards can paint, while Amjad and admin views are protected',()=>{
  const boot=early({raw:JSON.stringify([id,'member_9','bad\"]{display:none}'])});assert.equal(boot.styles.length,1);assert.match(boot.styles[0].textContent,new RegExp(id));assert.doesNotMatch(boot.styles[0].textContent,/member_9|bad/);
  assert.equal(early({admin:true,raw:JSON.stringify([id])}).styles.length,0);assert.equal(early({blocked:true}).styles.length,0);
  const clean=early();clean.scope.window.WA3I_PUBLIC_DIRECTORY_REMOVALS.remove(id);assert.ok([...clean.values.values()][0].includes(id));
});
test('live paths remain authoritative, keep static cards until both sources arrive, and update the public cache only from complete state',()=>{
  const main=readFileSync(new URL('../js/main.js',import.meta.url),'utf8'),reader=readFileSync(new URL('../public-directory-first-read.mjs',import.meta.url),'utf8');
  assert.match(main,/!\(MEMBER_DIRECTORY_STATE.directoryServerSnapshotSeen&&MEMBER_DIRECTORY_STATE.legacyServerSnapshotSeen\)/);
  assert.match(readFileSync(new URL('../index.html',import.meta.url),'utf8'),/id="members"[^>]*style="animation:none"/);
  assert.match(reader,/!state.publicFirstReadComplete&&/);assert.match(reader,/!window.WA3I_SESSION.adminMode/);
  assert.ok(main.indexOf('WA3I_PUBLIC_DIRECTORY_REMOVALS?.remove(id)')>main.indexOf('await deleteDirectoryMember('));
});
