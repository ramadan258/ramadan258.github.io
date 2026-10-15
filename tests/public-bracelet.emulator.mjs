import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,serverTimestamp} from 'firebase/firestore';
import {emptyCatalog,emptyDay,applyCommand} from '../model.mjs';
import {readCommittedMembers,projectId as targetProject} from '../scripts/bracelets/firestore-reader.mjs';
import {derivePublicFrame} from '../scripts/bracelets/derive.mjs';

const projectId='demo-wa3i-bracelets';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:5377')throw Error('EXISTING_LOOPBACK_EMULATOR_REQUIRED');
const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:5377,rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}});
const id='custom_member_new_'+'b'.repeat(32),uid='fictional-bracelet-owner',other='fictional-other-owner',date='2026-10-16';
try{
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,'memberRegistry',id),{schemaVersion:1,active:true,memberId:id,source:'cloud'});
    await setDoc(doc(db,'memberAccounts',id),{schemaVersion:1,uid});
    await setDoc(doc(db,'accountBindings',uid),{schemaVersion:1,active:true,memberId:id,authValidAfter:0});
    await setDoc(doc(db,'featuredMembers','custom__'+id),{schemaVersion:2,managementState:'ready',memberId:id,type:'custom_member'});
  });
  const owner=env.authenticatedContext(uid,{firebase:{sign_in_provider:'password'},auth_time:100}).firestore();
  const outsider=env.authenticatedContext(other,{firebase:{sign_in_provider:'password'},auth_time:100}).firestore();
  let catalog=applyCommand(emptyCatalog(),{},{type:'habit',id:'h1',name:'PRIVATE_EMULATOR_HABIT',days:[0,1,2,3,4,5,6]},date).catalog;
  catalog=applyCommand(catalog,{},{type:'timeZone',zone:'Europe/Stockholm'},date).catalog;
  const day=emptyDay(date);day.habitStatus.h1='done';day.report.summary='PRIVATE_EMULATOR_REPORT';
  const record=(key,value)=>({key,value:JSON.stringify(value),revision:1,updatedAt:serverTimestamp()});
  await assertSucceeds(setDoc(doc(owner,`plannerMembers/${uid}/records/catalog`),record('catalog',catalog)));
  await assertSucceeds(setDoc(doc(owner,`plannerMembers/${uid}/records/day:${date}`),record('day:'+date,day)));
  await assertFails(getDoc(doc(outsider,`plannerMembers/${uid}/records/catalog`)));
  await assertFails(getDoc(doc(outsider,`plannerMembers/${uid}/records/day:${date}`)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),`plannerMembers/${uid}/records/day:${date}`)));
  await assertFails(setDoc(doc(owner,'publicBracelets/current'),{tiers:{[id]:'gold'}}));
  await assertFails(setDoc(doc(owner,'featuredMembers','status__'+id),{tier:'gold'}));
  const request=async(operation,body)=>{
    assert.ok(['runQuery','batchGet'].includes(operation));
    const response=await fetch(`http://127.0.0.1:5377/v1/projects/${projectId}/databases/(default)/documents:${operation}`,{
      method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},
      body:JSON.stringify(body).replaceAll('projects/'+targetProject+'/', 'projects/'+projectId+'/'),
    });
    if(!response.ok)throw Error('EMULATOR_READ_HTTP_'+response.status);
    return JSON.parse((await response.text()).replaceAll('projects/'+projectId+'/', 'projects/'+targetProject+'/'));
  };
  const snapshot=await readCommittedMembers(request);
  assert.equal(snapshot.members.find(m=>m.id===id).catalog.value,JSON.stringify(catalog));
  const result=derivePublicFrame(snapshot.members,Date.parse('2026-10-17T12:00:00Z'));
  // The live snapshot may be before Oct 17, so read the test day explicitly for the pure replay.
  const saved=await getDoc(doc(owner,`plannerMembers/${uid}/records/day:${date}`));
  const replay=derivePublicFrame([{id,catalog:snapshot.members.find(m=>m.id===id).catalog,day:saved.data()}],Date.parse('2026-10-17T12:00:00Z'));
  assert.equal(replay.tiers[id],'gold');assert.ok(!JSON.stringify(result).includes('PRIVATE_EMULATOR'));
  console.log('PUBLIC_BRACELET_EMULATOR_OK: private clock save, isolation, forged publication denied, consistent REST read, derivation replay');
}finally{await env.clearFirestore();await env.cleanup();}
