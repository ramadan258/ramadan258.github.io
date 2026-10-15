import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtures,projectId} from './emulator-fixtures.mjs';
import {createServerBatchReader} from '../server-batch-read.js';
import {createServerReadPool} from '../server-read-pool.js';
import {verifySession} from '../verify-session.js';
import {createPlannerStore} from '../planner-store.js';
import {trackingStart as today} from '../tracking-period.mjs';
const fixture=await fixtures(),{members,fs,environment}=fixture;
const endpoint=`http://127.0.0.1:5377/v1/projects/${projectId}/databases/(default)/documents:batchGet`;
const journals=()=>({load:async()=>[],save:async()=>{},close(){}});
const stores=[];
async function open(member){
  const read=createServerBatchReader({projectId,user:member.user,privateUid:member.uid,isCurrent:()=>true,endpoint});
  const store=await createPlannerStore({fs,db:member.db,uid:member.uid,projectId,isCurrent:()=>true,outbox:journals(),today,
    bootstrap:date=>Promise.all([read(`plannerMembers/${member.uid}/records`,'catalog'),read(`plannerMembers/${member.uid}/records`,'day:'+date)])});stores.push(store);return store;
}
test('real emulator rules: bootstrap, save, restore, isolation, admin and revocation',async()=>{
  try{
    for(const member of members){
      const reader=createServerBatchReader({projectId,user:member.user,isCurrent:()=>true,endpoint});
      const pool=createServerReadPool({fs,db:member.db,isCurrent:()=>true,getServerSnapshot:reader});
      const session=await verifySession({user:member.user,memberId:member.id,adminUid:members[2].uid,staticMembers:[members[2]],read:pool.read,dynamicMembers:true});
      assert.equal(session.member.id,member.id);assert.equal(session.isAdmin,member===members[2]);pool.close();
    }
    const member=members[0];
    await environment.withSecurityRulesDisabled(async context=>{
      const records=fs.collection(context.firestore(),'plannerMembers',member.uid,'records');
      for(const [key,value] of [['catalog',{schema:1,trackingPeriod:'2026-10-15',started:'2026-10-15',habits:[{id:'old'}]}],['day:2026-10-15',{schema:1,date:'2026-10-15',habitStatus:{old:'done'}}]])
        await fs.setDoc(fs.doc(records,key),{key,value:JSON.stringify(value),revision:1,updatedAt:fs.serverTimestamp()});
    });
    let store=await open(member);
    assert.equal(store.snapshot().catalog.started,today);assert.equal(store.snapshot().catalog.habits.length,0);
    await store.ensureRange('2026-10-15','2026-10-15');assert.equal(store.snapshot().days['2026-10-15'],undefined);
    store.dispatch({type:'habit',id:'habit_one',name:'عادة اختبار',days:[0,1,2,3,4,5,6]});await store.flush();
    store.dispatch({type:'habitStatus',id:'habit_one',date:today,status:'done'});
    store.dispatch({type:'report',date:today,fields:{summary:'نص وهمي'}});await store.flush();store.close();
    await fixture.signOut(member.auth);await fixture.signInWithEmailAndPassword(member.auth,member.email,member.password);
    store=await open(member);assert.equal(store.snapshot().days[today].habitStatus.habit_one,'done');
    assert.equal(store.snapshot().days[today].report.summary,'نص وهمي');
    store.dispatch({type:'habitStatus',id:'habit_one',date:today,status:'unanswered'});await store.flush();store.close();
    store=await open(member);assert.equal(store.snapshot().days[today].habitStatus.habit_one,'unanswered');
    await assert.rejects(fs.getDocFromServer(fs.doc(members[1].db,'plannerMembers',member.uid,'records','catalog')));
    const attacker=createServerBatchReader({projectId,user:members[1].user,privateUid:members[1].uid,isCurrent:()=>true,endpoint});
    await assert.rejects(attacker(`plannerMembers/${member.uid}/records`,'catalog'),/INVALID_SERVER_PATH/);
    await assert.rejects(fs.setDoc(fs.doc(members[1].db,'accountBindings',members[1].uid),{memberId:member.id}));
    await assert.rejects(fs.setDoc(fs.doc(members[1].db,'bindings',members[1].uid),{memberId:'member_9'}));
    // Concurrent editors never silently overwrite a newer revision. The losing draft stays pending.
    const second=await open(member);store.dispatch({type:'report',date:today,fields:{gratitude:'نسخة أولى'}});
    second.dispatch({type:'report',date:today,fields:{feeling:'نسخة ثانية'}});
    await store.flush();await assert.rejects(second.flush(),/CONFLICT/);assert.equal(second.hasPending(),true);
    second.close();store.close();
    await environment.withSecurityRulesDisabled(context=>fs.updateDoc(fs.doc(context.firestore(),'accountBindings',member.uid),{active:false}));
    await assert.rejects(fs.getDocFromServer(fs.doc(member.db,'plannerMembers',member.uid,'records','catalog')));
  }finally{stores.forEach(store=>store.close());await fixture.close();}
});
