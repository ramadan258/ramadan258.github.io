export const weekdays = ['الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت','الأحد'];
export const timeZone = 'Europe/Stockholm';
export function dateKey(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
export function validDate(key) {
  const date=new Date(key+'T12:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === key;
}
export function addDays(key, offset) {
  const date=new Date(key+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);
}
export const weekday = key => (new Date(key+'T12:00:00Z').getUTCDay()+6)%7;
export const monday = key => addDays(key,-weekday(key));
export function range(start,end) {
  if(!validDate(start)||!validDate(end)||start>end)return [];
  const days=[];for(let key=start;key<=end;key=addDays(key,1)){days.push(key);if(days.length>3660)throw Error('RANGE_TOO_LONG');}return days;
}
export function emptyCatalog(today=dateKey()) {
  return {schema:1,started:today,plans:{},areas:[],habits:[],goals:[]};
}
export function emptyDay(date) {
  return {schema:1,date,habitStatus:{},tasks:[],report:{dayNo:'',gratitude:'',feeling:'',summary:'',avoided:'',motivation:'',notes:'',finalized:false}};
}
export function versionAt(habit,date) {
  let latest;
  for(const version of habit.versions)if(version.effective<=date&&(!latest||version.effective>=latest.effective))latest=version;
  return latest;
}
export function habitsFor(catalog,date) {
  const day=weekday(date),result=[];
  for(const habit of catalog.habits){const version=versionAt(habit,date);
    if(version?.active&&version.days.includes(day))result.push({id:habit.id,...version});
  }
  return result;
}
export function dayStats(catalog,days,date,today=dateKey()) {
  const habits=habitsFor(catalog,date),day=days[date]||emptyDay(date),tasks=day.tasks.filter(t=>!t.deleted);
  const completed=habits.filter(h=>day.habitStatus[h.id]==='done').length;
  const no=habits.filter(h=>day.habitStatus[h.id]==='no').length;
  return {date,habits,tasks,required:habits.length,completed,no,unanswered:habits.length-completed-no,
    percentage:habits.length?Math.round(100*completed/habits.length):null,
    taskCompleted:tasks.filter(t=>t.state==='done').length,future:date>today};
}
export function periodStats(catalog,days,start,end,today=dateKey()) {
  const entries=range(start,end<today?end:today).map(key=>dayStats(catalog,days,key,today));
  const required=entries.reduce((n,d)=>n+d.required,0),completed=entries.reduce((n,d)=>n+d.completed,0);
  const tasks=entries.reduce((n,d)=>n+d.tasks.length,0),taskCompleted=entries.reduce((n,d)=>n+d.taskCompleted,0);
  return {required,completed,percentage:required?Math.round(completed/required*100):null,tasks,taskCompleted};
}
export function weekComparison(catalog,days,start,today=dateKey()) {
  // Compare only finished weekdays in the current week with the same weekdays last week.
  const cutoff=start===monday(today)?addDays(today,-1):addDays(start,6);
  const current=periodStats(catalog,days,start,cutoff,today),previous=periodStats(catalog,days,addDays(start,-7),addDays(cutoff,-7),today);
  return current.percentage===null||previous.percentage===null?null:current.percentage-previous.percentage;
}
export function goalPeriod(goal) {
  if(goal.level==='annual')return {start:goal.period+'-01-01',end:goal.period+'-12-31'};
  if(goal.level==='monthly') {
    const start=goal.period+'-01',date=new Date(start+'T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);date.setUTCDate(0);
    return {start,end:date.toISOString().slice(0,10)};
  }
  return {start:goal.period,end:addDays(goal.period,6)};
}
export function goalStats(catalog,days,goal,today=dateKey()) {
  let done=goal.value;
  if(goal.metric==='linked') {
    done=0;const {start,end}=goalPeriod(goal);
    const belongs=id=>{
      const visited=new Set();while(id&&!visited.has(id)){if(id===goal.id)return true;visited.add(id);id=catalog.goals.find(g=>g.id===id)?.parentId;}return false;
    };
    for(const key of range(start,end<today?end:today)) {
      const day=days[key]||emptyDay(key);
      done+=habitsFor(catalog,key).filter(h=>belongs(h.goalId)&&day.habitStatus[h.id]==='done').length;
      done+=day.tasks.filter(t=>!t.deleted&&belongs(t.goalId)&&t.state==='done').length;
    }
  }
  return {done,total:goal.target,percentage:Math.min(100,Math.round(done/goal.target*100))};
}
const clone=value=>structuredClone(value);
const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
const text=(value,max=120)=>{requireValue(typeof value==='string'&&value.trim().length>0&&value.trim().length<=max,'INVALID_NAME');return value.trim();};
const safeId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
export function applyCommand(catalog,days,cmd,today=dateKey()) {
  const c=clone(catalog),changed={};
  const day=key=>{requireValue(validDate(key),'INVALID_DATE');return changed['day:'+key]||=(clone(days[key]||emptyDay(key)));};
  const existingGoal=id=>!id||c.goals.some(g=>g.id===id&&!g.deletedAt&&!g.archived);
  if(cmd.type==='habit') {
    requireValue(safeId(cmd.id),'INVALID_ID');requireValue(existingGoal(cmd.goalId),'INVALID_GOAL');
    requireValue(Array.isArray(cmd.days)&&cmd.days.length>0&&cmd.days.every(d=>Number.isInteger(d)&&d>=0&&d<7),'INVALID_SCHEDULE');
    let habit=c.habits.find(h=>h.id===cmd.id);
    if(!habit){requireValue(c.habits.length<200,'HABIT_LIMIT');habit={id:cmd.id,versions:[],deletedAt:null};c.habits.push(habit);}
    requireValue(!habit.deletedAt,'DELETED_HABIT');
    habit.versions=habit.versions.filter(v=>v.effective!==today);
    habit.versions.push({effective:today,name:text(cmd.name),days:[...new Set(cmd.days)].sort(),goalId:cmd.goalId||'',active:true});
  } else if(cmd.type==='habitArchive'||cmd.type==='habitDelete'||cmd.type==='habitRestore') {
    const h=c.habits.find(h=>h.id===cmd.id);requireValue(h&&!h.deletedAt,'UNKNOWN_HABIT');
    const version=versionAt(h,today);h.versions=h.versions.filter(v=>v.effective!==today);
    h.versions.push({...version,effective:today,active:cmd.type==='habitRestore'});
    if(cmd.type==='habitDelete')h.deletedAt=today;
  } else if(cmd.type==='habitStatus') {
    requireValue(cmd.date<=today&&habitsFor(c,cmd.date).some(h=>h.id===cmd.id),'NOT_SCHEDULED');
    requireValue(['done','no','unanswered'].includes(cmd.status),'INVALID_STATUS');
    day(cmd.date).habitStatus[cmd.id]=cmd.status;
  } else if(cmd.type==='task') {
    requireValue(safeId(cmd.id)&&existingGoal(cmd.goalId),'INVALID_TASK');const record=day(cmd.date);
    let task=record.tasks.find(t=>t.id===cmd.id);
    if(!task){requireValue(record.tasks.length<100,'TASK_LIMIT');task={id:cmd.id,state:'unanswered',deleted:false};record.tasks.push(task);}
    requireValue(!task.deleted,'DELETED_TASK');Object.assign(task,{name:text(cmd.name),priority:cmd.priority===true,goalId:cmd.goalId||''});
  } else if(cmd.type==='taskStatus'||cmd.type==='taskDelete') {
    const task=day(cmd.date).tasks.find(t=>t.id===cmd.id&&!t.deleted);requireValue(task,'UNKNOWN_TASK');
    if(cmd.type==='taskDelete')task.deleted=true;
    else {requireValue(cmd.date<=today&&['done','no','unanswered'].includes(cmd.status),'INVALID_STATUS');task.state=cmd.status;}
  } else if(cmd.type==='goal') {
    requireValue(safeId(cmd.id)&&['annual','monthly','weekly'].includes(cmd.level)&&['manual','linked'].includes(cmd.metric),'INVALID_GOAL');
    const period=cmd.level==='annual'?/^20\d{2}$/.test(cmd.period):cmd.level==='monthly'?/^20\d{2}-(0[1-9]|1[0-2])$/.test(cmd.period):validDate(cmd.period)&&monday(cmd.period)===cmd.period;
    requireValue(period&&Number.isFinite(cmd.target)&&cmd.target>0&&cmd.target<=100000&&Number.isFinite(cmd.value)&&cmd.value>=0&&cmd.value<=100000,'INVALID_METRIC');
    const previous=c.goals.find(g=>g.id===cmd.id&&!g.deletedAt);
    requireValue(c.areas.some(a=>a.id===cmd.areaId&&!a.deletedAt&&(!a.archived||previous?.areaId===a.id)),'INVALID_AREA');
    const plan=cmd.planId?(c.areaPlans||[]).find(p=>p.id===cmd.planId&&!p.deletedAt&&(!p.archived||previous?.planId===p.id)):null;
    requireValue(!cmd.planId||plan&&plan.areaId===cmd.areaId&&plan.year===cmd.period.slice(0,4),'INVALID_PLAN');
    if(cmd.parentId){const parent=c.goals.find(g=>g.id===cmd.parentId&&!g.deletedAt&&(!g.archived||previous?.parentId===g.id));requireValue(parent&&parent.id!==cmd.id&&parent.areaId===cmd.areaId&&(parent.planId||'')===(cmd.planId||'')&&((cmd.level==='monthly'&&parent.level==='annual'&&cmd.period.startsWith(parent.period))||
      (cmd.level==='weekly'&&parent.level==='monthly'&&cmd.period.startsWith(parent.period))),'INVALID_PARENT');}
    for(const child of c.goals.filter(g=>g.parentId===cmd.id&&!g.deletedAt))requireValue(child.areaId===cmd.areaId&&(child.planId||'')===(cmd.planId||'')&&((cmd.level==='annual'&&child.level==='monthly'&&child.period.startsWith(cmd.period))||(cmd.level==='monthly'&&child.level==='weekly'&&child.period.startsWith(cmd.period))),'DEPENDENT_GOALS');
    let goal=c.goals.find(g=>g.id===cmd.id);if(!goal){requireValue(c.goals.length<200,'GOAL_LIMIT');goal={id:cmd.id,archived:false,deletedAt:null};c.goals.push(goal);}
    requireValue(!goal.deletedAt,'DELETED_GOAL');
    Object.assign(goal,{name:text(cmd.name),areaId:cmd.areaId,planId:cmd.planId||'',level:cmd.level,period:cmd.period,parentId:cmd.parentId||'',metric:cmd.metric,target:cmd.target,value:cmd.metric==='manual'?cmd.value:0});
  } else if(cmd.type==='goalArchive'||cmd.type==='goalDelete'||cmd.type==='goalRestore') {
    const goal=c.goals.find(g=>g.id===cmd.id&&!g.deletedAt);requireValue(goal,'UNKNOWN_GOAL');
    if(cmd.type==='goalDelete'){
      requireValue(!c.goals.some(g=>g.parentId===cmd.id&&!g.deletedAt)&&!c.habits.some(h=>!h.deletedAt&&versionAt(h,today)?.goalId===cmd.id),'DEPENDENT_GOALS');
      // Tombstones preserve historical task/habit links; records are never physically removed.
      goal.deletedAt=today;
    }else goal.archived=cmd.type!=='goalRestore';
  } else if(cmd.type==='plan') {
    requireValue(/^20\d{2}$/.test(cmd.year),'INVALID_YEAR');c.plans[cmd.year]=text(cmd.name);
    if(c.planState?.[cmd.year]?.deletedAt)delete c.planState[cmd.year];
  } else if(['planArchive','planRestore','planDelete'].includes(cmd.type)) {
    requireValue(c.plans[cmd.year],'UNKNOWN_PLAN');
    if(cmd.type==='planDelete')requireValue(!c.goals.some(g=>!g.deletedAt&&g.period.startsWith(cmd.year))&&!(c.areaPlans||[]).some(p=>!p.deletedAt&&p.year===cmd.year),'DEPENDENT_GOALS');
    c.planState||={};c.planState[cmd.year]={archived:cmd.type==='planArchive',deletedAt:cmd.type==='planDelete'?today:null};
  } else if(cmd.type==='areaPlan') {
    const previous=(c.areaPlans||[]).find(p=>p.id===cmd.id&&!p.deletedAt);
    requireValue(safeId(cmd.id)&&/^20\d{2}$/.test(cmd.year)&&c.areas.some(a=>a.id===cmd.areaId&&!a.deletedAt&&(!a.archived||previous?.areaId===a.id)),'INVALID_PLAN');
    c.areaPlans||=[];let p=c.areaPlans.find(p=>p.id===cmd.id);
    if(!p){requireValue(c.areaPlans.length<100,'PLAN_LIMIT');p={id:cmd.id,archived:false,deletedAt:null};c.areaPlans.push(p);}
    requireValue(!p.deletedAt,'DELETED_PLAN');
    requireValue(!c.goals.some(g=>g.planId===cmd.id&&!g.deletedAt&&(g.areaId!==cmd.areaId||!g.period.startsWith(cmd.year))),'DEPENDENT_GOALS');
    Object.assign(p,{name:text(cmd.name),areaId:cmd.areaId,year:cmd.year});
  } else if(['areaPlanArchive','areaPlanRestore','areaPlanDelete'].includes(cmd.type)) {
    const p=(c.areaPlans||[]).find(p=>p.id===cmd.id&&!p.deletedAt);requireValue(p,'UNKNOWN_PLAN');
    if(cmd.type==='areaPlanDelete'){requireValue(!c.goals.some(g=>g.planId===cmd.id&&!g.deletedAt),'DEPENDENT_GOALS');p.deletedAt=today;}
    else p.archived=cmd.type!=='areaPlanRestore';
  } else if(cmd.type==='area') {
    requireValue(safeId(cmd.id),'INVALID_AREA');let a=c.areas.find(a=>a.id===cmd.id);
    if(!a){requireValue(c.areas.length<30,'AREA_LIMIT');a={id:cmd.id};c.areas.push(a);}
    requireValue(!a.deletedAt,'DELETED_AREA');a.name=text(cmd.name);
  } else if(['areaArchive','areaRestore','areaDelete'].includes(cmd.type)) {
    const a=c.areas.find(a=>a.id===cmd.id&&!a.deletedAt);requireValue(a,'UNKNOWN_AREA');
    if(cmd.type==='areaDelete'){requireValue(!c.goals.some(g=>g.areaId===cmd.id&&!g.deletedAt)&&!(c.areaPlans||[]).some(p=>p.areaId===cmd.id&&!p.deletedAt),'DEPENDENT_GOALS');a.deletedAt=today;}
    else a.archived=cmd.type!=='areaRestore';
  } else if(cmd.type==='report') {
    requireValue(cmd.date<=today,'FUTURE_REPORT');const report=day(cmd.date).report;
    for(const [key,value] of Object.entries(cmd.fields)) {
      requireValue(Object.hasOwn(report,key),'INVALID_REPORT_FIELD');
      requireValue(key==='finalized'?typeof value==='boolean':typeof value==='string'&&value.length<=10000,'INVALID_REPORT_VALUE');report[key]=value;
    }
  } else throw Error('UNKNOWN_COMMAND');
  if(!['habitStatus','task','taskStatus','taskDelete','report'].includes(cmd.type))changed.catalog=c;
  for(const value of Object.values(changed))requireValue(JSON.stringify(value).length<280000,'RECORD_TOO_LARGE');
  return changed;
}
