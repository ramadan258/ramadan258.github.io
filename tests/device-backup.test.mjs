import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createGuestPlanner as publishedGuestPlanner} from './fixtures/published-guest-store.mjs';
import {createGuestPlanner} from '../guest-store.js';
import {deviceNamespace,plannerPrefix,restorePointer,readDeviceData,createBackup,parseBackup,restoreBackup} from '../device-data.mjs';
import {dayStats,emptyCatalog,emptyDay} from '../model.mjs';
import {restoreFailureMessage} from '../device-settings.mjs';

const namespace=deviceNamespace('demo-device-upgrade','/'),today='2026-10-18',first='2026-10-16';
function storage(){const values=new Map();return {values,get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};}
function unorderedStorage(){
 const local=storage(),rank=key=>createHash('sha256').update(key).digest('hex');
 local.key=index=>[...local.values.keys()].sort((a,b)=>rank(a).localeCompare(rank(b)))[index]??null;
 return local;
}
function multiDayBackup(){
 const catalog=emptyCatalog();
 catalog.habits=Array.from({length:12},(_,index)=>({id:'test_'+index,deletedAt:null,versions:[{effective:first,name:'Dummy habit '+index,days:[0,1,2,3,4,5,6],active:true}]}));
 const days=Object.fromEntries(['2026-10-16','2026-10-17','2026-10-18','2026-10-19'].map(date=>{
   const day=emptyDay(date);day.habitStatus={test_0:'done',test_1:'no',test_2:'unanswered'};day.report.summary='Dummy report '+date;return [date,day];
 }));
 return createBackup({catalog,days,forms:{wa3i_pulse_48_state_v1:'{"dummy":"saved"}',wa3i_guest_streak:'3'}});
}
const reverseKeys=value=>Array.isArray(value)?value.map(reverseKeys):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,child])=>[key,reverseKeys(child)])):value;
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

test('a valid 12-habit four-day backup restores when browser key enumeration is not insertion order',async()=>{
 const local=unorderedStorage(),backup=multiDayBackup();
 const before=JSON.stringify(readDeviceData(local,namespace));
 await restoreBackup({storage:local,namespace,backup,confirmed:true,expectedCurrent:before,uuid:()=> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'});
 const actual=readDeviceData(local,namespace);assert.deepEqual(actual,backup.data);
 assert.deepEqual(actual.days[first].habitStatus,{test_0:'done',test_1:'no',test_2:'unanswered'});
 assert.deepEqual(parseBackup(JSON.stringify(createBackup(actual))).data,backup.data);
});

test('review snapshot comparison ignores object key order but not a real data change',async()=>{
 const local=unorderedStorage();await populate(createGuestPlanner,local);
 const current=readDeviceData(local,namespace),backup=multiDayBackup();
 await restoreBackup({storage:local,namespace,backup,confirmed:true,expectedCurrent:JSON.stringify(reverseKeys(current))});
 assert.deepEqual(readDeviceData(local,namespace),backup.data);
 const before=JSON.stringify(readDeviceData(local,namespace)),changed=JSON.parse(before);
 changed.days[first].habitStatus.test_2='no';
 const originalValues=new Map(local.values);
 await assert.rejects(restoreBackup({storage:local,namespace,backup,confirmed:true,expectedCurrent:JSON.stringify(changed)}),/LOCAL_DATA_CHANGED_REVIEW_AGAIN/);
 assert.deepEqual(local.values,originalValues);
});

test('changed staged values or array order still fail verification and leave the original raw data intact',async()=>{
 for(const change of ['answer','array']){
   const local=unorderedStorage();await populate(createGuestPlanner,local);
   const backup=multiDayBackup(),before=JSON.stringify(readDeviceData(local,namespace)),raw=new Map(local.values),set=local.setItem;
   local.setItem=(key,value)=>{
     if(key.includes(':restore:')&&(change==='answer'&&key.endsWith('day:'+first)||change==='array'&&key.endsWith(':catalog'))){
       const record=JSON.parse(value);if(change==='answer')record.habitStatus.test_2='no';else record.habits.reverse();value=JSON.stringify(record);
     }
     set(key,value);
   };
   await assert.rejects(restoreBackup({storage:local,namespace,backup,confirmed:true,expectedCurrent:before}),/RESTORE_VERIFY_FAILED/);
   assert.deepEqual(local.values,raw);assert.equal(local.getItem(restorePointer(namespace)),null);
 }
});

test('quota failure cleans only its new staging and never changes old records or unrelated keys',async()=>{
 const local=unorderedStorage();await populate(createGuestPlanner,local);
 local.setItem('unrelated-user-key','keep');local.setItem(namespace+':restore:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb:sentinel','keep');
 const before=JSON.stringify(readDeviceData(local,namespace)),raw=new Map(local.values),set=local.setItem;let writes=0;
 local.setItem=(key,value)=>{if(key.includes(':restore:')&&++writes===3)throw new DOMException('Dummy storage quota','QuotaExceededError');set(key,value);};
 await assert.rejects(restoreBackup({storage:local,namespace,backup:multiDayBackup(),confirmed:true,expectedCurrent:before}),error=>error.name==='QuotaExceededError');
 assert.deepEqual(local.values,raw);assert.equal(JSON.stringify(readDeviceData(local,namespace)),before);
});

test('post-switch verification failure rolls back to the previous active dataset before removing staging',async()=>{
 const local=unorderedStorage(),backup=multiDayBackup();
 await restoreBackup({storage:local,namespace,backup,confirmed:true,expectedCurrent:JSON.stringify(readDeviceData(local,namespace))});
 const before=JSON.stringify(readDeviceData(local,namespace)),raw=new Map(local.values),previous=local.getItem(restorePointer(namespace)),set=local.setItem;
 local.setItem=(key,value)=>{
   set(key,value);
   if(key===restorePointer(namespace)&&value!==previous){
     const dayKey=plannerPrefix(value)+'day:'+first,day=JSON.parse(local.getItem(dayKey));day.habitStatus.test_2='no';set(dayKey,JSON.stringify(day));
   }
 };
 await assert.rejects(restoreBackup({storage:local,namespace,backup,confirmed:true,expectedCurrent:before}),/RESTORE_VERIFY_FAILED/);
 assert.deepEqual(local.values,raw);assert.equal(local.getItem(restorePointer(namespace)),previous);
});

test('an unconfirmed rollback preserves the active staged copy and does not falsely claim original data are unchanged',async()=>{
 const local=storage(),backup=multiDayBackup(),before=JSON.stringify(readDeviceData(local,namespace)),set=local.setItem,remove=local.removeItem;
 local.setItem=(key,value)=>{
   set(key,value);
   if(key===restorePointer(namespace)){
     const dayKey=plannerPrefix(value)+'day:'+first,day=JSON.parse(local.getItem(dayKey));day.habitStatus.test_2='no';set(dayKey,JSON.stringify(day));
   }
 };
 local.removeItem=key=>{if(key===restorePointer(namespace))throw new DOMException('Dummy denied rollback','SecurityError');remove(key);};
 await assert.rejects(restoreBackup({storage:local,namespace,backup,confirmed:true,expectedCurrent:before}),/RESTORE_ROLLBACK_UNCONFIRMED/);
 const active=local.getItem(restorePointer(namespace));assert.ok(active);assert.ok(local.getItem(plannerPrefix(active)+'catalog'));
 assert.doesNotMatch(restoreFailureMessage(Error('RESTORE_ROLLBACK_UNCONFIRMED')),/لم تُستبدل|مساحة/);
});

test('restore errors identify quota only when storage reports quota and never expose raw error details',()=>{
 const quota=restoreFailureMessage(new DOMException('Dummy quota','QuotaExceededError'));
 assert.match(quota,/مساحة التخزين المخصصة للموقع/);
 assert.match(restoreFailureMessage(Error('RESTORE_VERIFY_FAILED')),/لم تتطابق/);
 assert.match(restoreFailureMessage(Error('LOCAL_DATA_CHANGED_REVIEW_AGAIN')),/تغيّرت بيانات الجهاز/);
 assert.match(restoreFailureMessage(new DOMException('Dummy blocked','SecurityError')),/منع المتصفح/);
 const generic=restoreFailureMessage(Error('DO_NOT_EXPOSE_PRIVATE_ERROR'));
 assert.doesNotMatch(generic,/مساحة|DO_NOT_EXPOSE_PRIVATE_ERROR/);
});

test('settings and restore implementation use fresh dependency URLs without changing stored data keys',()=>{
 const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
 assert.match(read('local-shell.mjs'),/import\('\.\/device-settings.mjs\?v=restore2'\)/);
 assert.match(read('device-settings.mjs'),/from '\.\/device-data.mjs\?v=restore2'/);
 assert.equal(namespace,'wa3i-device-guest-v1:demo-device-upgrade:%2F');
 assert.equal(plannerPrefix(namespace),namespace+':tracking-2026-10-16:planner:');
});
