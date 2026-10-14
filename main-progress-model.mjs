import {dateKey} from './model.mjs';
import {fixedPeriod} from './harvest-calendar.mjs';
import {analyze,columnBalance} from './harvest-model.mjs';
import {deriveBracelet} from './bracelet-model.mjs';
export function mainProgress({catalog,days,today=dateKey(),launchDate}){
  const current=deriveBracelet({catalog,days,today,scope:'today'});
  if(!launchDate)return {current,period:null,groups:[]};
  const period=fixedPeriod(7,launchDate,today);
  const analysis=analyze({catalog,days,...period,today,unit:'day',compare:false,width:320});
  return {current,period,groups:analysis.groups.map(group=>({...group,...columnBalance(group)}))};
}
// Reuse the existing owner's range cache/listeners; a miniature chart loads at most seven days.
export function createMainProgressTracker({store,isCurrent=()=>true,clock=dateKey,launchDate,onChange=()=>{},schedule=queueMicrotask}){
  let closed=false,queued=false,last='',failed='',loading=null;
  const current=()=>!closed&&isCurrent();
  const publish=value=>{if(current())onChange(value);};
  async function refresh(force=false){
    if(!current())return;const today=clock(),key=today+':'+store.status().dataVersion;
    if(key===last||!force&&key===failed)return;
    try{
      const period=launchDate?fixedPeriod(7,launchDate,today):{start:today,end:today};
      // Before launch, retain today's meter without requesting a reversed future range.
      const start=period.start>today?today:period.start,end=period.end<today?period.end:today;
      if(!store.hasRange(start,end)){
        publish({phase:'loading'});loading||=store.ensureRange(start,end).finally(()=>{loading=null;});await loading;
        if(!current())return;if(clock()!==today)return refresh();
      }
      if(store.status().readError||!store.hasRange(start,end))throw Error('INCOMPLETE_RANGE');
      const result=mainProgress({...store.snapshot({start,end}),today,launchDate});
      last=today+':'+store.status().dataVersion;failed='';publish({...result,phase:'ready'});
    }catch{failed=key;publish({phase:'unavailable'});}
  }
  const unsubscribe=store.subscribe(()=>{if(!queued&&current()){queued=true;schedule(()=>{queued=false;void refresh();});}});
  return {refresh,close(){closed=true;unsubscribe();}};
}
