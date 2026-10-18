import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyCommand,emptyCatalog,emptyDay,dateKey,dayStats} from '../model.mjs';
import {createGuestPlanner} from '../guest-store.js';
import {analyze} from '../harvest-model.mjs';
import {fixedPeriod} from '../harvest-calendar.mjs';
import {reportSteps} from '../report-wizard.mjs';
const today='2026-10-16',habit={type:'habit',id:'h1',name:'عادة اختبار',days:[0,1,2,3,4,5,6]};
function storage(){const data=new Map();return{get length(){return data.size;},key:i=>[...data.keys()][i],getItem:key=>data.get(key)??null,setItem:(key,v)=>data.set(key,String(v)),removeItem:key=>data.delete(key)};}
test('calendar follows each device timezone at midnight and DST, without moving existing date keys',()=>{
 const previous=process.env.TZ;
 try{
   process.env.TZ='America/Los_Angeles';assert.equal(dateKey(new Date('2026-10-16T01:00:00Z')),'2026-10-15');
   process.env.TZ='Asia/Tokyo';assert.equal(dateKey(new Date('2026-10-16T01:00:00Z')),today);
   process.env.TZ='Europe/Stockholm';assert.equal(dateKey(new Date('2026-10-15T22:01:00Z')),today);
   assert.equal(dateKey(new Date('2026-10-25T23:01:00Z')),'2026-10-26');
   assert.equal(dateKey(new Date('2026-10-15T21:59:00Z')),'2026-10-15');
 }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
 const catalog=applyCommand(emptyCatalog(),{},habit,today).catalog,day=emptyDay(today);day.habitStatus.h1='done';
 const original=JSON.stringify(day);dayStats(catalog,{[today]:day},today,'2026-10-17');assert.equal(JSON.stringify(day),original);
});

test('launch configuration agrees, and a preview clock cannot override the production calendar',()=>{
 assert.match(readFileSync(new URL('../session-config.js',import.meta.url),'utf8'),/"officialLaunchDate":"2026-10-16"/);
 assert.equal(JSON.parse(readFileSync(new URL('../khutay-release.json',import.meta.url),'utf8')).officialLaunchDate,today);
 try{
   globalThis.window={location:{hostname:'ramadan258.github.io'},__WA3I_FIREBASE_CONFIG:{projectId:'tribe-app-e3e9c'},__WA3I_SESSION_CONFIG:{reviewToday:'2040-01-01'}};
   assert.notEqual(dateKey(),'2040-01-01');
   window.location.hostname='127.0.0.1';window.__WA3I_FIREBASE_CONFIG.projectId='demo-review';
   assert.equal(dateKey(),'2040-01-01');
 }finally{delete globalThis.window;}
});
test('new tracking period excludes Oct 15 and future dates, without goals/tasks',()=>{
 const catalog=applyCommand(emptyCatalog(),{},habit,today).catalog;
 assert.equal(catalog.started,today);assert.equal(dayStats(catalog,{},'2026-10-15',today).required,0);
 assert.equal(fixedPeriod(7,today,today).start,today);
 assert.throws(()=>applyCommand(catalog,{}, {type:'report',date:'2026-10-15',fields:{summary:'old'}},today),/INVALID_DATE/);
 assert.throws(()=>applyCommand(catalog,{}, {type:'task',id:'task'},today),/UNKNOWN_COMMAND/);
 assert.equal(catalog.habits[0].versions[0].goalId,undefined);
 const report=reportSteps(catalog,today);assert.ok(report.some(step=>step.habitId==='h1'));
});

test('prelaunch configuration starts on Oct 16, with no premature achievements or reports',()=>{
 const catalog=applyCommand(emptyCatalog(),{},habit,'2026-10-15').catalog;
 assert.equal(catalog.habits[0].versions[0].effective,today);
 assert.equal(dayStats(catalog,{},'2026-10-15','2026-10-15').required,0);
 assert.equal(analyze({catalog,days:{},start:today,end:'2026-10-22',today:'2026-10-15'}).stats.required,0);
 assert.throws(()=>applyCommand(catalog,{}, {type:'habitStatus',id:'h1',date:today,status:'done'},'2026-10-15'),/NOT_SCHEDULED/);
 assert.throws(()=>applyCommand(catalog,{}, {type:'report',date:today,fields:{summary:'future'}},'2026-10-15'),/FUTURE_REPORT/);
 assert.equal(dayStats(catalog,{},today,today).required,1);
 assert.equal(dayStats(catalog,{},'2026-10-17','2026-10-17').required,1);
 assert.equal(dayStats(catalog,{},'2026-10-18','2026-10-18').required,1);
});

test('habit edits and tombstones preserve historical schedules and dated answers',()=>{
 let catalog=applyCommand(emptyCatalog(),{},habit,today).catalog;
 const days={[today]:emptyDay(today)};days[today].habitStatus.h1='done';
 catalog=applyCommand(catalog,days,{...habit,name:'اسم معدل'},'2026-10-17').catalog;
 assert.equal(dayStats(catalog,days,today,today).completed,1);
 assert.equal(dayStats(catalog,days,today,today).habits[0].name,habit.name);
 catalog=applyCommand(catalog,days,{type:'habitDelete',id:'h1'},'2026-10-18').catalog;
 assert.equal(dayStats(catalog,days,today,today).completed,1);
 assert.equal(dayStats(catalog,days,'2026-10-18','2026-10-18').required,0);
});
test('guest persistence and report/planner statuses share one dated record, with no automatic legacy import',async()=>{
 const local=storage();local.setItem('guest:planner:catalog',JSON.stringify({schema:1,habits:[{id:'old'}]}));
 let current=true;const open=()=>createGuestPlanner({storage:local,namespace:'guest',events:new EventTarget(),today,isCurrent:()=>current});
 let store=open();store.dispatch(habit);store.dispatch({type:'habitStatus',date:today,id:'h1',status:'done'});
 store.dispatch({type:'report',date:today,fields:{summary:'تجريبي'}});await store.flush();store.close();store=open();
 let snapshot=store.snapshot();assert.equal(snapshot.catalog.habits.length,1);assert.equal(snapshot.days[today].habitStatus.h1,'done');
 store.dispatch({type:'habitStatus',date:today,id:'h1',status:'no'});assert.equal(dayStats(store.snapshot().catalog,store.snapshot().days,today,today).no,1);
 store.dispatch({type:'habitStatus',date:today,id:'h1',status:'unanswered'});snapshot=store.snapshot();
 assert.equal(analyze({...snapshot,start:today,end:'2026-10-21',today}).stats.unanswered,1);
 current=false;assert.throws(()=>store.snapshot(),/STALE_SESSION/);store.close();
 assert.ok(local.getItem('guest:planner:catalog')); // Original data were not deleted.
});
test('requested controls are absent and the public shell is not gated',()=>{
 const html=readFileSync(new URL('../khutay.html',import.meta.url),'utf8');
 for(const text of ['أولوياتي','مهامي','الهدف المرتبط','data-add="task"'])assert.ok(!html.includes(text));
 const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(home,/id="openLocalSettings"/);
 assert.doesNotMatch(home,/id="identityGate"|id="identityConfirmPassword"/);
});
test('two guest editors serialize record updates instead of losing another tab\'s habit',async()=>{
 const local=storage(),events=new EventTarget(),a=createGuestPlanner({storage:local,namespace:'concurrent',events,today}),b=createGuestPlanner({storage:local,namespace:'concurrent',events,today});
 a.dispatch(habit);b.dispatch({...habit,id:'h2'});await Promise.all([a.flush(),b.flush()]);a.close();b.close();
 const restored=createGuestPlanner({storage:local,namespace:'concurrent',events,today});assert.deepEqual(restored.snapshot().catalog.habits.map(h=>h.id).sort(),['h1','h2']);restored.close();
});
