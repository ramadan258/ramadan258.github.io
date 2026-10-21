import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createGuestPlanner} from '../guest-store.js';
import {deviceNamespace} from '../device-data.mjs';
import {emptyDay,dayStats} from '../model.mjs';
import {analyze,columnBalance} from '../harvest-model.mjs';
import {reportSteps,habitAnswer} from '../report-wizard.mjs';
import {deriveBracelet,createBraceletTracker} from '../bracelet-model.mjs';

const first='2026-10-16',previous='2026-10-20',today='2026-10-21',all=[0,1,2,3,4,5,6];
function storage(){const values=new Map();return {values,get length(){return values.size;},key:i=>[...values.keys()][i],getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
const create=(local,namespace='one',clock=()=>today)=>createGuestPlanner({storage:local,namespace:deviceNamespace('demo-harvest-history',namespace),events:new EventTarget(),clock});
async function populate(local){
  let day=first;const store=create(local,'one',()=>day);
  for(const id of ['changed','archived','deleted','blank','negative'])store.dispatch({type:'habit',id,name:'Original '+id,days:all});
  await store.flush();day=previous;
  store.dispatch({type:'report',date:previous,fields:{summary:'Keep summary',gratitude:'Keep gratitude',finalized:true}});await store.flush();
  day=today;
  store.dispatch({type:'habit',id:'changed',name:'New name',days:[2]});
  store.dispatch({type:'habitArchive',id:'archived'});store.dispatch({type:'habitDelete',id:'deleted'});
  store.dispatch({type:'habit',id:'new',name:'New today',days:all});
  store.dispatch({type:'habitStatus',id:'negative',date:previous,status:'no'});await store.flush();
  return store;
}

test('past-day edits use historical names/schedules, including now archived or deleted habits',async()=>{
  const store=await populate(storage());
  try{
    const before=store.snapshot(),history=dayStats(before.catalog,before.days,previous,today);
    assert.deepEqual(history.habits.map(h=>h.id),['changed','archived','deleted','blank','negative']);
    assert.equal(history.habits[0].name,'Original changed');
    const catalog=structuredClone(before.catalog),report=structuredClone(before.days[previous].report);
    for(const id of ['changed','archived','deleted'])store.dispatch({type:'habitStatus',id,date:previous,status:'done'});
    await store.flush();const after=store.snapshot();
    assert.deepEqual(after.catalog,catalog);assert.deepEqual(after.days[previous].report,report);
    assert.deepEqual(after.days[previous].habitStatus,{negative:'no',changed:'done',archived:'done',deleted:'done'});
    assert.equal(after.days[previous].habitStatus.blank,undefined);
    assert.equal(dayStats(after.catalog,after.days,previous,today).completed,3);
    assert.equal(dayStats(after.catalog,after.days,today,today).completed,0);
    assert.throws(()=>store.dispatch({type:'habitStatus',id:'new',date:previous,status:'done'}),/NOT_SCHEDULED/);
    assert.throws(()=>store.dispatch({type:'habitStatus',id:'changed',date:'2026-10-22',status:'done'}),/NOT_SCHEDULED/);
    assert.throws(()=>store.dispatch({type:'habitStatus',id:'changed',date:'2026-10-15',status:'done'}),/NOT_SCHEDULED/);
  }finally{store.close();}
});

test('saved past answers survive reopen and update the same report, harvest and confirmed personal bracelet',async()=>{
  const local=storage(),store=await populate(local),tracker=createBraceletTracker({store,clock:()=>today});
  try{
    await tracker.refresh();assert.equal(tracker.current().tier,'red');
    for(const id of ['changed','archived','deleted','blank','negative'])store.dispatch({type:'habitStatus',id,date:previous,status:'done'});
    await store.flush();await tracker.refresh();
    assert.equal(tracker.current().tier,'gold');assert.equal(tracker.current().phase,'ready');
    const data=store.snapshot(),report=reportSteps(data.catalog,previous).filter(step=>step.kind==='habit');
    assert.equal(report.length,5);assert.ok(report.every(step=>habitAnswer(data.days[previous],step.habitId)==='done'));
    let harvest=analyze({...data,start:previous,end:previous,today});
    assert.equal(harvest.stats.percentage,100);assert.deepEqual(columnBalance(harvest.groups[0]),{done:100,remaining:0});
    store.dispatch({type:'habitStatus',id:'changed',date:previous,status:'no'});await store.flush();await tracker.refresh();
    assert.equal(tracker.current().tier,'green');assert.equal(tracker.current().percentage,80);
    store.dispatch({type:'habitStatus',id:'changed',date:previous,status:'unanswered'});await store.flush();
    const current=store.snapshot();assert.equal(habitAnswer(current.days[previous],'changed'),'unanswered');
    harvest=analyze({...current,start:previous,end:previous,today});assert.equal(harvest.stats.no,0);assert.equal(harvest.stats.unanswered,1);assert.equal(harvest.stats.percentage,80);
    const reopened=create(local);assert.deepEqual(reopened.snapshot(),current);reopened.close();
    const other=create(local,'other');assert.equal(other.snapshot().catalog.habits.length,0);assert.deepEqual(other.snapshot().days,{});other.close();
    const older=structuredClone(current.days);older[first]=emptyDay(first);older[first].habitStatus.changed='done';
    assert.equal(deriveBracelet({...current,days:older,today}).tier,'green');
  }finally{tracker.close();store.close();}
});

test('a storage failure is not reported as saved and retry preserves other answers and report text',async()=>{
  const local=storage(),store=await populate(local),write=local.setItem;
  try{
    const before=store.snapshot();local.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};
    store.dispatch({type:'habitStatus',id:'changed',date:previous,status:'done'});await assert.rejects(store.flush());
    assert.equal(store.status().error,'LOCAL_SAVE_FAILED');assert.equal(store.hasPending(),true);
    const reopened=create(local);assert.deepEqual(reopened.snapshot(),before);reopened.close();
    local.setItem=write;await store.flush();assert.equal(store.status().error,null);
    assert.equal(store.snapshot().days[previous].habitStatus.changed,'done');assert.equal(store.snapshot().days[previous].habitStatus.negative,'no');
    assert.deepEqual(store.snapshot().days[previous].report,before.days[previous].report);
  }finally{local.setItem=write;store.close();}
});

test('history controls dispatch only to the open, loaded eligible date and preserve unanswered rows during rendering',()=>{
  const source=readFileSync(new URL('../planner-ui.js',import.meta.url),'utf8');
  assert.match(source,/\$\('#khutayWindow > \.window-footer'\)\.append\(button\)/);
  const start=source.indexOf('function canEditDay('),end=source.indexOf('\nfunction renderDayDetails',start),commands=[];
  const scope={catalog:{started:first},trackingStart:first,today,days:{[previous]:{habitStatus:{done:'done',no:'no'}}},expanded:{},escape:value=>String(value).replaceAll('<','&lt;'),icon:()=>'',store:{status:()=>({readError:null}),hasRange:()=>true}};
  vm.createContext(scope);vm.runInContext(source.slice(start,end),scope);
  assert.equal(scope.canEditDay(previous),true);assert.equal(scope.canEditDay('2026-10-15'),false);assert.equal(scope.canEditDay('2026-10-22'),false);
  scope.store.hasRange=()=>false;assert.equal(scope.canEditDay(previous),false);scope.store.hasRange=()=>true;
  scope.store.status=()=>({readError:'READ_FAILED'});assert.equal(scope.canEditDay(previous),false);scope.store.status=()=>({});
  const items=['done','no','blank'].map(id=>({id,name:'Habit <'+id}));
  const rendered=scope.dayList('habits',items,previous,true,true);
  assert.equal((rendered.match(/type="checkbox"/g)||[]).length,3);assert.equal((rendered.match(/ checked/g)||[]).length,1);assert.match(rendered,/دون إجابة/);assert.match(rendered,/غير مكتملة/);assert.match(rendered,/Habit &lt;/);
  assert.doesNotMatch(scope.dayList('habits',items,'2026-10-22',true,false),/type="checkbox"/);
  const blockStart=source.indexOf('  if(input.dataset.dayHabit){'),blockEnd=source.indexOf("\n  if(input.id==='dayPicker'",blockStart),block=source.slice(blockStart,blockEnd);
  Object.assign(scope,{input:{dataset:{dayHabit:'done',date:previous},checked:true},harvest:{selectedDay:()=>previous},$:()=>({open:true}),render:()=>{},renderDayDetails:()=>{},run:command=>{commands.push(command);return true;}});
  vm.runInContext('(function(){'+block+'})()',scope);assert.equal(commands.length,1);assert.equal(commands[0].date,previous);assert.equal(commands[0].status,'done');
  scope.input.checked=false;vm.runInContext('(function(){'+block+'})()',scope);assert.equal(commands[1].status,'no');
  scope.harvest.selectedDay=()=>today;vm.runInContext('(function(){'+block+'})()',scope);assert.equal(commands.length,2);
  scope.harvest.selectedDay=()=>previous;scope.$=()=>({open:false});vm.runInContext('(function(){'+block+'})()',scope);assert.equal(commands.length,2);
});
