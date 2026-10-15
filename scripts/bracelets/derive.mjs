import {deriveBracelet} from '../../bracelet-model.mjs';
import {dateKey,addDays,validDate,validTimeZone,emptyCatalog,emptyDay} from '../../model.mjs';
import {trackingStart} from '../../tracking-period.mjs';
import {braceletFreshnessMs,parsePublicBracelets,validBraceletId} from '../../public-bracelet.mjs';

const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
export function readCatalog(record) {
  if(!record)return emptyCatalog();
  const value=readRecord(record,'catalog');
  if(value.trackingPeriod!==trackingStart)return emptyCatalog();
  if(!validDate(value.started)||value.started<trackingStart||!Array.isArray(value.habits)||value.habits.length>200)throw Error('INVALID_CATALOG');
  const ids=new Set();
  for(const habit of value.habits){
    if(!plain(habit)||!validId(habit.id)||ids.has(habit.id)||!Array.isArray(habit.versions)||!habit.versions.length)throw Error('INVALID_HABIT');
    ids.add(habit.id);const dates=new Set();
    for(const v of habit.versions){
      if(!plain(v)||!validDate(v.effective)||v.effective<trackingStart||dates.has(v.effective)||typeof v.active!=='boolean'
        ||!Array.isArray(v.days)||v.days.length>7||v.days.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(v.days).size!==v.days.length)throw Error('INVALID_SCHEDULE');
      dates.add(v.effective);
    }
  }
  return value;
}
function readRecord(record,key) {
  if(record.key!==key||!Number.isSafeInteger(record.revision)||record.revision<1||typeof record.value!=='string'||record.value.length>300000)throw Error('INVALID_RECORD');
  const value=JSON.parse(record.value);if(!plain(value)||value.schema!==1)throw Error('INVALID_RECORD');return value;
}
export function readDay(record,date) {
  if(!record)return emptyDay(date);
  const value=readRecord(record,'day:'+date);
  if(value.trackingPeriod!==trackingStart)return emptyDay(date);
  if(value.date!==date||!plain(value.habitStatus)||Object.entries(value.habitStatus).some(([id,status])=>!validId(id)||!['done','no','unanswered'].includes(status)))throw Error('INVALID_DAY');
  // Report text is deliberately discarded, not copied to the public payload.
  return {date,habitStatus:value.habitStatus};
}
export function nextLocalMidnight(now,zone) {
  const today=dateKey(new Date(now),zone);let low=now,high=now+30*3600000;
  while(high-low>1){const mid=Math.floor((low+high)/2);if(dateKey(new Date(mid),zone)===today)low=mid;else high=mid;}
  return high;
}
export function derivePublicFrame(members,snapshotTime) {
  if(!Number.isSafeInteger(snapshotTime)||!Array.isArray(members)||members.length>500)throw Error('INVALID_PUBLISH_INPUT');
  let validUntil=snapshotTime+braceletFreshnessMs;
  const tiers={},seen=new Set();
  for(const member of members){
    if(!validBraceletId(member.id)||seen.has(member.id))throw Error('INVALID_PUBLIC_MEMBER');seen.add(member.id);
    tiers[member.id]='neutral';
    try{
      const catalog=readCatalog(member.catalog);
      if(!validTimeZone(catalog.timeZone))continue;
      validUntil=Math.min(validUntil,nextLocalMidnight(snapshotTime,catalog.timeZone));
      const today=dateKey(new Date(snapshotTime),catalog.timeZone),yesterday=addDays(today,-1);
      const day=readDay(member.day,yesterday);
      tiers[member.id]=deriveBracelet({catalog,days:{[yesterday]:day},today}).tier;
    }catch{/* Invalid private inputs never become a guessed achievement color. */}
  }
  return parsePublicBracelets({schemaVersion:3,generatedAt:snapshotTime,validUntil,tiers});
}
