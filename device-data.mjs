import {trackingStart} from './tracking-period.mjs';
import {validDate,validTimeZone,emptyCatalog} from './model.mjs';
import {withGuestLock} from './guest-lock.js';

export const deviceNamespace=(project,path)=>`wa3i-device-guest-v1:${encodeURIComponent(project)}:${encodeURIComponent(path)}`;
export const restorePointer=namespace=>namespace+':active-restore-v1';
export const plannerPrefix=namespace=>namespace+':tracking-'+trackingStart+':planner:';
export const formKeys=new Set(['wa3i_daily_report_state_v1','wa3i_daily_report_archive_v1','wa3i_ramadan_report_state_v1','wa3i_ramadan_report_archive_v1',
  'tribe_report_state_v2','tribe_reports_archive_v2','wa3i_slip_report_state_v1','wa3i_pulse_48_state_v1','wa3i_weekly_mirror_state_v1',
  'wa3i_guest_streak','wa3i_guest_last_completed_date','wa3i_guest_rescue_center_v1']);
export function activeNamespace(storage,namespace) {
  const pointer=storage.getItem(restorePointer(namespace));
  if(pointer===null)return namespace;
  if(!pointer.startsWith(namespace+':restore:')||!/^[a-f0-9-]{36}$/.test(pointer.slice((namespace+':restore:').length)))throw Error('LOCAL_RESTORE_POINTER_INVALID');
  return pointer;
}
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const idOk=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
const exact=(value,keys)=>plain(value)&&Object.keys(value).every(key=>keys.includes(key));
function assert(ok){if(!ok)throw Error('INVALID_BACKUP_CONTENT');}
function safeTree(value,depth=0){
  assert(depth<20);
  if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){assert(!['__proto__','constructor','prototype'].includes(key));safeTree(child,depth+1);}
}
export function validateDeviceData(data) {
  safeTree(data);assert(exact(data,['catalog','days','forms']));
  const c=data.catalog;
  assert(exact(c,['schema','trackingPeriod','started','habits','timeZone'])&&c.schema===1&&c.trackingPeriod===trackingStart&&validDate(c.started)&&c.started>=trackingStart);
  assert(c.timeZone===undefined||validTimeZone(c.timeZone));assert(Array.isArray(c.habits)&&c.habits.length<=200);
  const ids=new Set();
  for(const habit of c.habits){
    assert(exact(habit,['id','versions','deletedAt'])&&idOk(habit.id)&&!ids.has(habit.id));ids.add(habit.id);
    assert(habit.deletedAt==null||validDate(habit.deletedAt));assert(Array.isArray(habit.versions)&&habit.versions.length>0&&habit.versions.length<=3660);
    const dates=new Set();
    for(const v of habit.versions){
      assert(exact(v,['effective','name','days','active'])&&validDate(v.effective)&&v.effective>=trackingStart&&!dates.has(v.effective));dates.add(v.effective);
      assert(typeof v.name==='string'&&v.name.length>0&&v.name.length<=120&&typeof v.active==='boolean');
      assert(Array.isArray(v.days)&&v.days.length<=7&&v.days.every(d=>Number.isInteger(d)&&d>=0&&d<7)&&new Set(v.days).size===v.days.length);
    }
  }
  assert(plain(data.days)&&Object.keys(data.days).length<=3660);
  const fields=['dayNo','gratitude','feeling','summary','avoided','motivation','notes','finalized'];
  for(const [date,day] of Object.entries(data.days)){
    assert(validDate(date)&&date>=trackingStart&&exact(day,['schema','trackingPeriod','date','habitStatus','report'])&&day.schema===1&&day.trackingPeriod===trackingStart&&day.date===date);
    assert(plain(day.habitStatus)&&Object.entries(day.habitStatus).every(([id,status])=>idOk(id)&&['done','no','unanswered'].includes(status)));
    assert(exact(day.report,fields)&&fields.every(key=>key==='finalized'?typeof day.report[key]==='boolean':typeof day.report[key]==='string'&&day.report[key].length<=10000));
  }
  assert(plain(data.forms)&&Object.entries(data.forms).every(([key,value])=>formKeys.has(key)&&typeof value==='string'&&value.length<=2000000));
  return structuredClone(data);
}
export function readDeviceData(storage,namespace) {
  const active=activeNamespace(storage,namespace),prefix=plannerPrefix(active),days={},forms={};
  for(let index=0;index<storage.length;index++){
    const key=storage.key(index);
    if(key?.startsWith(prefix+'day:')){const date=key.slice((prefix+'day:').length);if(validDate(date))days[date]=JSON.parse(storage.getItem(key));}
    if(key?.startsWith(active+':forms:')){const form=decodeURIComponent(key.slice((active+':forms:').length));if(formKeys.has(form))forms[form]=storage.getItem(key);}
  }
  return validateDeviceData({catalog:JSON.parse(storage.getItem(prefix+'catalog')||'null')||emptyCatalog(),days,forms});
}
export function createBackup(data,now=new Date()) {
  return {format:'wa3i-device-backup',version:1,createdAt:now.toISOString(),trackingPeriod:trackingStart,data:validateDeviceData(data)};
}
export function parseBackup(text) {
  assert(typeof text==='string'&&text.length<=20000000);
  const value=JSON.parse(text);safeTree(value);
  assert(exact(value,['format','version','createdAt','trackingPeriod','data'])&&value.format==='wa3i-device-backup'&&value.version===1&&value.trackingPeriod===trackingStart&&Number.isFinite(Date.parse(value.createdAt)));
  return createBackup(value.data,new Date(value.createdAt));
}
function sameData(left,right) {
  if(left===right)return true;
  if(!left||!right||typeof left!=='object'||typeof right!=='object')return false;
  if(Array.isArray(left)||Array.isArray(right))return Array.isArray(left)&&Array.isArray(right)
    &&left.length===right.length&&left.every((value,index)=>sameData(value,right[index]));
  const keys=Object.keys(left);
  // Storage enumeration may reorder object keys; array order and all values must still match.
  return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&sameData(left[key],right[key]));
}
export async function restoreBackup({storage,namespace,backup,confirmed=false,expectedCurrent,uuid=()=>crypto.randomUUID()}) {
  if(!confirmed)throw Error('RESTORE_CONFIRMATION_REQUIRED');
  const data=parseBackup(JSON.stringify(backup)).data;
  let reviewed;try{reviewed=JSON.parse(expectedCurrent);}catch{throw Error('LOCAL_DATA_CHANGED_REVIEW_AGAIN');}
  return withGuestLock(plannerPrefix(namespace),()=>{
    if(!sameData(readDeviceData(storage,namespace),reviewed))throw Error('LOCAL_DATA_CHANGED_REVIEW_AGAIN');
    const next=namespace+':restore:'+uuid();
    if(!/^[a-f0-9-]{36}$/.test(next.slice((namespace+':restore:').length)))throw Error('INVALID_RESTORE_ID');
    for(let index=0;index<storage.length;index++)if(storage.key(index)?.startsWith(next+':'))throw Error('RESTORE_ID_ALREADY_USED');
    const prefix=plannerPrefix(next),pointer=restorePointer(namespace),previous=storage.getItem(pointer),staged=[];
    let switched=false;
    const write=(key,value)=>{staged.push(key);storage.setItem(key,value);};
    try{
      write(prefix+'catalog',JSON.stringify(data.catalog));
      for(const [date,day] of Object.entries(data.days))write(prefix+'day:'+date,JSON.stringify(day));
      for(const [key,value] of Object.entries(data.forms))write(next+':forms:'+encodeURIComponent(key),value);
      // Staging is invisible. A single pointer commit switches the complete dataset.
      if(!sameData(readDeviceData(storage,next),data))throw Error('RESTORE_VERIFY_FAILED');
      storage.setItem(pointer,next);switched=true;
      if(!sameData(readDeviceData(storage,namespace),data))throw Error('RESTORE_VERIFY_FAILED');
      return data;
    }catch(error){
      if(switched){
        try{
          if(previous===null)storage.removeItem(pointer);else storage.setItem(pointer,previous);
          if(storage.getItem(pointer)!==previous)throw Error('RESTORE_ROLLBACK_UNCONFIRMED');
        }catch{throw Error('RESTORE_ROLLBACK_UNCONFIRMED');}
      }
      // Remove only this failed attempt's unused staging, never older datasets or an active copy.
      try{if(storage.getItem(pointer)!==next)for(const key of staged)storage.removeItem(key);}catch{}
      throw error;
    }
  });
}
