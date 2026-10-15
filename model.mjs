import {trackingStart,trackingTimeZone,localTimeZone} from './tracking-period.mjs';
export const weekdays = ['الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت','الأحد'];
export const timeZone = trackingTimeZone;
const keyFormats = new Map();
export function dateKey(date,zone=localTimeZone()) {
  if(!keyFormats.has(zone))keyFormats.set(zone,new Intl.DateTimeFormat('sv-SE',{timeZone:zone,calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit'}));
  const local=keyFormats.get(zone).format(date??new Date());
  // A simulated day is allowed only on the isolated, loopback emulator preview.
  const preview=globalThis.window;
  const simulated=preview?.__WA3I_SESSION_CONFIG?.reviewToday;
  if(date===undefined&&preview?.location.hostname==='127.0.0.1'&&preview.__WA3I_FIREBASE_CONFIG?.projectId?.startsWith('demo-')&&validDate(simulated))return local>simulated?local:simulated;
  return local;
}
export function validDate(key) {
  const date=new Date(key+'T12:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===key;
}
export function addDays(key,offset) {
  const date=new Date(key+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);
}
export const weekday=key=>(new Date(key+'T12:00:00Z').getUTCDay()+6)%7;
export const monday=key=>addDays(key,-weekday(key));
export function range(start,end) {
  if(!validDate(start)||!validDate(end)||start>end)return [];
  const days=[];for(let key=start;key<=end;key=addDays(key,1)){days.push(key);if(days.length>3660)throw Error('RANGE_TOO_LONG');}return days;
}
export function emptyCatalog() {
  return {schema:1,trackingPeriod:trackingStart,started:trackingStart,habits:[]};
}
export function emptyDay(date) {
  return {schema:1,trackingPeriod:trackingStart,date,habitStatus:{},report:{dayNo:'',gratitude:'',feeling:'',summary:'',avoided:'',motivation:'',notes:'',finalized:false}};
}
export function versionAt(habit,date) {
  let latest;for(const version of habit.versions)if(version.effective<=date&&(!latest||version.effective>=latest.effective))latest=version;return latest;
}
export function habitsFor(catalog,date) {
  if(date<trackingStart)return [];
  const day=weekday(date),result=[];
  for(const habit of catalog.habits){const version=versionAt(habit,date);if(version?.active&&version.days.includes(day))result.push({id:habit.id,...version});}
  return result;
}
export function dayStats(catalog,days,date,today=dateKey()) {
  const habits=habitsFor(catalog,date),day=days[date]||emptyDay(date);
  const completed=habits.filter(h=>day.habitStatus[h.id]==='done').length,no=habits.filter(h=>day.habitStatus[h.id]==='no').length;
  return {date,habits,required:habits.length,completed,no,unanswered:habits.length-completed-no,
    percentage:habits.length?Math.round(100*completed/habits.length):null,future:date>today};
}
export function periodStats(catalog,days,start,end,today=dateKey()) {
  const entries=range(start<trackingStart?trackingStart:start,end<today?end:today).map(key=>dayStats(catalog,days,key,today));
  const required=entries.reduce((n,d)=>n+d.required,0),completed=entries.reduce((n,d)=>n+d.completed,0);
  return {required,completed,percentage:required?Math.round(completed/required*100):null};
}
const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
const safeId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
export function applyCommand(catalog,days,cmd,today=dateKey()) {
  const effective=today<trackingStart?trackingStart:today;
  const c=structuredClone(catalog),changed={};
  const day=key=>{requireValue(validDate(key)&&key>=trackingStart,'INVALID_DATE');return changed['day:'+key]||=structuredClone(days[key]||emptyDay(key));};
  if(cmd.type==='habit') {
    requireValue(safeId(cmd.id),'INVALID_ID');
    requireValue(typeof cmd.name==='string'&&cmd.name.trim().length>0&&cmd.name.trim().length<=120,'INVALID_NAME');
    requireValue(Array.isArray(cmd.days)&&cmd.days.length>0&&cmd.days.every(d=>Number.isInteger(d)&&d>=0&&d<7),'INVALID_SCHEDULE');
    let habit=c.habits.find(h=>h.id===cmd.id);
    if(!habit){requireValue(c.habits.length<200,'HABIT_LIMIT');habit={id:cmd.id,versions:[],deletedAt:null};c.habits.push(habit);}
    requireValue(!habit.deletedAt,'DELETED_HABIT');
    habit.versions=habit.versions.filter(v=>v.effective!==effective);
    habit.versions.push({effective,name:cmd.name.trim(),days:[...new Set(cmd.days)].sort(),active:true});
  } else if(['habitArchive','habitDelete','habitRestore'].includes(cmd.type)) {
    const habit=c.habits.find(h=>h.id===cmd.id);requireValue(habit&&!habit.deletedAt,'UNKNOWN_HABIT');
    const version=versionAt(habit,effective);habit.versions=habit.versions.filter(v=>v.effective!==effective);
    habit.versions.push({...version,effective,active:cmd.type==='habitRestore'});
    if(cmd.type==='habitDelete')habit.deletedAt=effective;
  } else if(cmd.type==='habitStatus') {
    requireValue(cmd.date<=today&&habitsFor(c,cmd.date).some(h=>h.id===cmd.id),'NOT_SCHEDULED');
    requireValue(['done','no','unanswered'].includes(cmd.status),'INVALID_STATUS');day(cmd.date).habitStatus[cmd.id]=cmd.status;
  } else if(cmd.type==='report') {
    requireValue(cmd.date<=today,'FUTURE_REPORT');const report=day(cmd.date).report;
    for(const [key,value] of Object.entries(cmd.fields)) {
      requireValue(Object.hasOwn(report,key),'INVALID_REPORT_FIELD');
      requireValue(key==='finalized'?typeof value==='boolean':typeof value==='string'&&value.length<=10000,'INVALID_REPORT_VALUE');report[key]=value;
    }
  } else throw Error('UNKNOWN_COMMAND');
  if(!['habitStatus','report'].includes(cmd.type))changed.catalog=c;
  for(const value of Object.values(changed))requireValue(JSON.stringify(value).length<280000,'RECORD_TOO_LARGE');
  return changed;
}
