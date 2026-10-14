import {periodStats,dateKey,addDays} from './model.mjs';
const dayWindow=(today,scope='yesterday')=>{const date=scope==='today'?today:addDays(today,-1);return {start:date,end:date};};

export function braceletTier(completed,required) {
  if(!required)return 'neutral';
  if(completed*10>=required*9)return 'gold';
  if(completed*10>=required*7)return 'green';
  return completed*2>=required?'blue':'red';
}
export function deriveBracelet({catalog,days,today=dateKey(),scope='yesterday'}) {
  const period=dayWindow(today,scope),stats=periodStats(catalog,days,catalog.started>period.start?catalog.started:period.start,period.end,today);
  return {...period,tier:braceletTier(stats.completed,stats.required),completed:stats.completed,required:stats.required,percentage:stats.required?stats.completed/stats.required*100:null};
}

// Own cached records only. No writes, public summary or per-member queries.
export function createBraceletTracker({store,isCurrent=()=>true,clock=dateKey,onChange=()=>{},schedule=queueMicrotask,scope='yesterday'}) {
  let closed=false,queued=false,loading=null,lastKey='',failedKey='',value=null;
  const valid=()=>!closed&&isCurrent();
  const publish=next=>{if(!valid())return;value=next;onChange({...next});};
  async function refresh(force=false) {
    if(!valid())return;
    const today=clock(),period=dayWindow(today,scope);
    if(!force&&failedKey===today+':'+store.status().dataVersion)return value;
    try{
      if(!store.hasRange(period.start,period.end)){
        publish({tier:'neutral',phase:'loading',...period});
        loading||=store.ensureRange(period.start,period.end).finally(()=>{loading=null;});
        await loading;if(!valid())return;
        // A midnight change during the read must not publish yesterday's window.
        if(clock()!==today)return refresh();
        if(!store.hasRange(period.start,period.end))throw Error('INCOMPLETE_DAY');
      }
      if(store.status().readError)throw Error('READ_FAILED');
      const key=today+':'+store.status().dataVersion;
      if(key===lastKey&&value?.phase==='ready')return value;
      const data=store.snapshot(period),next={...deriveBracelet({...data,today,scope}),phase:'ready'};
      lastKey=key;failedKey='';publish(next);return next;
    }catch{
      if(valid()){lastKey='';failedKey=today+':'+store.status().dataVersion;publish({tier:'neutral',phase:'unavailable',...period});}
    }
  }
  function enqueue(){if(queued||!valid())return;queued=true;schedule(()=>{queued=false;void refresh();});}
  const unsubscribe=store.subscribe(enqueue);
  return {refresh,current:()=>valid()&&value?{...value}:null,close(){closed=true;unsubscribe();value=null;}};
}
