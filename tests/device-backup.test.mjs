import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuestPlanner as publishedGuestPlanner} from './fixtures/published-guest-store.mjs';
import {createGuestPlanner} from '../guest-store.js';
import {deviceNamespace,plannerPrefix,restorePointer,readDeviceData,createBackup,parseBackup,restoreBackup} from '../device-data.mjs';
import {dayStats} from '../model.mjs';

const namespace=deviceNamespace('demo-device-upgrade','/'),today='2026-10-18',first='2026-10-16';
function storage(){const values=new Map();return {values,get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};}
const open=local=>createGuestPlanner({storage:local,namespace,events:new EventTarget(),today});
async function populate(create,local){
 const store=create({storage:local,namespace,events:new EventTarget(),today:first});
 for(const id of ['done','no','empty'])store.dispatch({type:'habit',id,name:'عادة '+id,days:[0,1,2,3,4,5,6]});
 for(const [id,status] of [['done','done'],['no','no'],['empty','unanswered']])store.dispatch({type:'habitStatus',id,date:first,status});
 store.dispatch({type:'report',date:first,fields:{summary:'تقرير محفوظ <script>لا ينفذ</script>',feeling:'مطمئن',gratitude:'نعمة'}});await store.flush();
 const before=store.snapshot();store.close();return before;
}
test('upgrade from the actual published guest implementation preserves the same-origin keys and all historical answers',async()=>{
 const local=storage();
 const expected=await populate(publishedGuestPlanner,local),raw=new Map(local.values);
 const current=open(local);assert.deepEqual(current.snapshot(),expected);current.close();assert.deepEqual(local.values,raw);
 const reopened=open(local);assert.deepEqual(dayStats(reopened.snapshot().catalog,reopened.snapshot().days,first,today),dayStats(expected.catalog,expected.days,first,today));
 assert.equal(reopened.snapshot().days[first].report.gratitude,'نعمة');reopened.close();
 assert.ok([...local.values.keys()].every(key=>key.startsWith(plannerPrefix(namespace))));
});
test('backup restores to a different device without Auth, cloud ownership or date changes',async()=>{
 const old=storage();await populate(createGuestPlanner,old);old.setItem(namespace+':forms:wa3i_pulse_48_state_v1','{"saved":"local"}');
 old.setItem('firebase:authUser:secret','MUST_NOT_EXPORT');old.setItem('wa3i-current-user','MUST_NOT_EXPORT');
 const data=readDeviceData(old,namespace),backup=parseBackup(JSON.stringify(createBackup(data)));
 assert.ok(!JSON.stringify(backup).includes('MUST_NOT_EXPORT'));assert.equal(backup.version,1);assert.equal(backup.trackingPeriod,first);
 const phone=storage(),expectedCurrent=JSON.stringify(readDeviceData(phone,namespace));
 await restoreBackup({storage:phone,namespace,backup,confirmed:true,expectedCurrent});
 const store=open(phone);assert.deepEqual(store.snapshot(),{catalog:data.catalog,days:data.days});store.close();
 assert.deepEqual(readDeviceData(phone,namespace),data);
 const state=JSON.stringify(readDeviceData(phone,namespace));await restoreBackup({storage:phone,namespace,backup,confirmed:true,expectedCurrent:state});
 assert.equal(open(phone).snapshot().catalog.habits.length,3);
});
test('restore is confirmed, fenced against concurrent changes and atomic on quota failure',async()=>{
 const local=storage();await populate(createGuestPlanner,local);const backup=createBackup(readDeviceData(local,namespace)),before=JSON.stringify(readDeviceData(local,namespace));
 await assert.rejects(restoreBackup({storage:local,namespace,backup,expectedCurrent:before}),/CONFIRMATION_REQUIRED/);
 await assert.rejects(restoreBackup({storage:local,namespace,backup,confirmed:true,expectedCurrent:'changed'}),/CHANGED_REVIEW/);
 const set=local.setItem;let writes=0;local.setItem=(key,value)=>{if(++writes===2)throw Error('QUOTA_EXCEEDED');set(key,value);};
 await assert.rejects(restoreBackup({storage:local,namespace,backup,confirmed:true,expectedCurrent:before}));
 assert.equal(local.getItem(restorePointer(namespace)),null);assert.equal(JSON.stringify(readDeviceData(local,namespace)),before);
 local.setItem=set;const stale=open(local);
 const reused='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';local.setItem(namespace+':restore:'+reused+':sentinel','keep');
 await assert.rejects(restoreBackup({storage:local,namespace,backup,confirmed:true,expectedCurrent:before,uuid:()=>reused}),/ID_ALREADY_USED/);
 assert.equal(local.getItem(namespace+':restore:'+reused+':sentinel'),'keep');
 await restoreBackup({storage:local,namespace,backup,confirmed:true,expectedCurrent:before});
 assert.throws(()=>stale.dispatch({type:'report',date:first,fields:{summary:'stale'}}),/RESTORED_RELOAD/);stale.close();
 assert.ok(local.getItem(plannerPrefix(namespace)+'catalog')); // Original data were not removed.
});
test('malformed, foreign-period, credential-bearing and prototype-polluting backups are rejected before writes',async()=>{
 const local=storage();await populate(createGuestPlanner,local);const backup=createBackup(readDeviceData(local,namespace));
 for(const change of [value=>{value.version=99;},value=>{value.trackingPeriod='2026-10-15';},value=>{value.data.forms.firebaseToken='secret';},value=>{value.data.days[first].habitStatus.no='invalid';},value=>{value.data.catalog.habits[0].versions[0].days=[7];}]){
   const copy=structuredClone(backup);change(copy);assert.throws(()=>parseBackup(JSON.stringify(copy)));
 }
 assert.throws(()=>parseBackup('{bad'));assert.throws(()=>parseBackup(JSON.stringify(backup).replace('"forms":{}','"forms":{"__proto__":{}}')));
 assert.equal({}.polluted,undefined);
});
