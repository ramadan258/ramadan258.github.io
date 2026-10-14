import {dateKey,validDate} from './model.mjs';
export const braceletFreshnessMs=20*60*1000;
export const braceletColors=['gold','green','blue','red','neutral'];
const validId=id=>/^(member_[0-9]+|custom_member_[^/]+)$/.test(id);
export function parsePublicBracelets(data) {
  if(!data||Object.keys(data).sort().join(',')!=='schemaVersion,tiers,updatedAt,windowEnd'
    ||data.schemaVersion!==2||!validDate(data.windowEnd)||!data.tiers||Array.isArray(data.tiers))throw Error('INVALID_PUBLIC_BRACELET');
  const updatedAt=data.updatedAt?.toMillis?.();
  if(!Number.isFinite(updatedAt))throw Error('INVALID_PUBLIC_BRACELET');
  const entries=Object.entries(data.tiers);
  if(entries.length>500||entries.some(([id,tier])=>!validId(id)||!braceletColors.includes(tier)))throw Error('INVALID_PUBLIC_BRACELET');
  return {windowEnd:data.windowEnd,updatedAt,tiers:Object.fromEntries(entries)};
}
export function publicBraceletView(record,memberId,{today=dateKey(),now=Date.now()}={}) {
  if(!record)return {tier:'neutral',phase:'unavailable'};
  if(record.windowEnd!==today||now-record.updatedAt>braceletFreshnessMs||record.updatedAt>now+30000)return {tier:'neutral',phase:'stale'};
  return Object.hasOwn(record.tiers,memberId)?{tier:record.tiers[memberId],phase:'ready'}:{tier:'neutral',phase:'unavailable'};
}
export function createPublicBraceletReader({listen,onChange=()=>{},clock=dateKey,now=Date.now}) {
  let closed=false,record=null,phase='loading';
  const stop=listen(snapshot=>{
    if(closed)return;
    try{
      if(snapshot.metadata?.fromCache||snapshot.metadata?.hasPendingWrites)throw Error('UNVERIFIED_PUBLIC_CACHE');
      record=parsePublicBracelets(snapshot.data());phase='ready';
    }catch{record=null;phase='unavailable';}
    onChange();
  },()=>{if(!closed){record=null;phase='unavailable';onChange();}});
  return {view(memberId){return closed?{tier:'neutral',phase:'unavailable'}:phase==='loading'?{tier:'neutral',phase}:publicBraceletView(record,memberId,{today:clock(),now:now()});},
    refresh(){if(!closed)onChange();},close(){closed=true;record=null;stop();}};
}
