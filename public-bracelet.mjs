export const braceletFreshnessMs=65*60*1000;
export const braceletPollMs=5*60*1000;
export const publicBraceletUrl='https://raw.githubusercontent.com/ramadan258/ramadan258.github.io/bracelet-data/current.json';
export const braceletColors=['gold','green','blue','red','neutral'];
export const validBraceletId=id=>typeof id==='string'&&id.length<=100&&/^(member_[0-9]+|custom_member_[A-Za-z0-9_-]+)$/.test(id);
export function parsePublicBracelets(data) {
  if(!data||Object.keys(data).sort().join(',')!=='generatedAt,schemaVersion,tiers,validUntil'
    ||data.schemaVersion!==3||!data.tiers||typeof data.tiers!=='object'||Array.isArray(data.tiers)
    ||!Number.isSafeInteger(data.generatedAt)||!Number.isSafeInteger(data.validUntil)
    ||data.validUntil<=data.generatedAt||data.validUntil-data.generatedAt>braceletFreshnessMs)throw Error('INVALID_PUBLIC_BRACELET');
  const entries=Object.entries(data.tiers);
  if(entries.length>500||entries.some(([id,tier])=>!validBraceletId(id)||!braceletColors.includes(tier)))throw Error('INVALID_PUBLIC_BRACELET');
  return {schemaVersion:3,generatedAt:data.generatedAt,validUntil:data.validUntil,tiers:Object.fromEntries(entries)};
}
export function publicBraceletView(record,memberId,{now=Date.now()}={}) {
  if(!record)return {tier:'neutral',phase:'unavailable'};
  if(now>=record.validUntil||record.generatedAt>now+30000||now-record.generatedAt>braceletFreshnessMs)return {tier:'neutral',phase:'stale'};
  return Object.hasOwn(record.tiers,memberId)?{tier:record.tiers[memberId],phase:'ready'}:{tier:'neutral',phase:'unavailable'};
}
export function createPublicBraceletReader({fetcher=fetch,onChange=()=>{},now=Date.now,visible=()=>!globalThis.document?.hidden}={}) {
  let closed=false,record=null,loading=null,lastAttempt=-Infinity,controller=null;
  const view=memberId=>closed?{tier:'neutral',phase:'unavailable'}:!record&&loading?{tier:'neutral',phase:'loading'}:publicBraceletView(record,memberId,{now:now()});
  async function refresh() {
    if(closed||!visible())return;
    if(loading||now()-lastAttempt<braceletPollMs){onChange();return loading;}
    lastAttempt=now();controller=new AbortController();
    const timeout=setTimeout(()=>controller?.abort(),10000);
    loading=Promise.resolve().then(async()=>{
      try{
        const response=await fetcher(publicBraceletUrl+'?v='+Math.floor(lastAttempt/braceletPollMs),{signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
        if(!response.ok)throw Error('PUBLIC_READ_FAILED');
        const body=await response.text();if(body.length>65536)throw Error('PUBLIC_TOO_LARGE');
        const next=parsePublicBracelets(JSON.parse(body));
        if(!closed)record=next;
      }catch{/* Keep only the last still-valid frame; view() neutralizes it at expiry. */}
      finally{clearTimeout(timeout);loading=null;if(!closed)onChange();}
    });
    onChange();
    return loading;
  }
  return {view,refresh,close(){closed=true;record=null;controller?.abort();}};
}
