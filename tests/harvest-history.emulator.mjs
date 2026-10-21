import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtures,projectId} from './emulator-fixtures.mjs';
import {createPlannerStore} from '../planner-store.js';
import {emptyCatalog,emptyDay} from '../model.mjs';
import {habitAnswer,reportSteps} from '../report-wizard.mjs';
import {analyze} from '../harvest-model.mjs';
import {deriveBracelet} from '../bracelet-model.mjs';

test('historical member edit persists with existing emulator rules and cannot write another UID',async()=>{
  const fixture=await fixtures(),{members,fs,environment}=fixture,member=members[0],today='2026-10-21',date='2026-10-20',stores=[];
  const open=async()=>{const store=await createPlannerStore({fs,db:member.db,uid:member.uid,projectId,isCurrent:()=>true,today,outbox:{load:async()=>[],save:async()=>{},close(){}}});stores.push(store);return store;};
  try{
    const catalog=emptyCatalog(),day=emptyDay(date);day.report.summary='Keep historical report';day.habitStatus.other='no';
    catalog.habits=[{id:'past',deletedAt:null,versions:[{effective:'2026-10-16',name:'Original historical habit',days:[1],active:true},{effective:today,name:'New current schedule',days:[2],active:true}]},{id:'other',deletedAt:today,versions:[{effective:'2026-10-16',name:'Archived later',days:[1],active:true},{effective:today,name:'Archived later',days:[1],active:false}]}];
    await environment.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();
      for(const [key,value] of [['catalog',catalog],['day:'+date,day]])await fs.setDoc(fs.doc(db,'plannerMembers',member.uid,'records',key),{key,value:JSON.stringify(value),revision:1,updatedAt:fs.serverTimestamp()});
    });
    let store=await open();await store.ensureRange(date,date);
    store.dispatch({type:'habitStatus',id:'past',date,status:'done'});await store.flush();store.close();
    store=await open();await store.ensureRange(date,date);let data=store.snapshot();
    assert.equal(habitAnswer(data.days[date],'past'),'done');assert.equal(data.days[date].habitStatus.other,'no');assert.deepEqual(data.catalog,catalog);assert.deepEqual(data.days[date].report,day.report);
    assert.equal(reportSteps(data.catalog,date).find(step=>step.habitId==='past').title,'Original historical habit');
    assert.equal(analyze({...data,start:date,end:date,today}).stats.percentage,50);assert.equal(deriveBracelet({...data,today}).tier,'blue');
    store.dispatch({type:'habitStatus',id:'other',date,status:'done'});await store.flush();
    store.dispatch({type:'habitStatus',id:'past',date,status:'no'});await store.flush();store.close();
    store=await open();await store.ensureRange(date,date);data=store.snapshot();
    assert.deepEqual(data.days[date].habitStatus,{other:'done',past:'no'});assert.deepEqual(data.days[date].report,day.report);
    const document=await fs.getDocFromServer(fs.doc(member.db,'plannerMembers',member.uid,'records','day:'+date));assert.equal(document.data().revision,4);
    await assert.rejects(fs.getDocFromServer(fs.doc(members[1].db,'plannerMembers',member.uid,'records','day:'+date)));
    await assert.rejects(fs.setDoc(fs.doc(members[1].db,'plannerMembers',member.uid,'records','day:'+date),document.data()));
    assert.equal((await fs.getDocFromServer(fs.doc(member.db,'plannerMembers',member.uid,'records','day:'+date))).data().revision,4);
  }finally{stores.forEach(store=>store.close());await fixture.close();}
});
