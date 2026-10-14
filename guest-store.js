import {applyCommand,emptyCatalog,dateKey,validDate} from './model.mjs';

// Guest records never share keys, journals, or owners with cloud/member records.
export function createGuestPlanner({storage=localStorage,namespace,isCurrent=()=>true,events=window,today=dateKey(),clock=()=>today}) {
  const prefix=namespace+':planner:',listeners=new Set();
  let closed=false,dataVersion=0,error=null,failedCommand=null,catalog,days;
  const current=()=>!closed&&isCurrent();
  const assertCurrent=()=>{if(!current())throw Error('STALE_SESSION');};
  function read(key) {
    const raw=storage.getItem(prefix+key);if(raw===null)return null;
    const value=JSON.parse(raw);
    if(value?.schema!==1||(key==='catalog'? !Array.isArray(value.habits)||!Array.isArray(value.goals)||!Array.isArray(value.areas):value.date!==key.slice(4)))throw Error('LOCAL_DATA_INVALID');
    return value;
  }
  function load() {
    const nextCatalog=read('catalog')||emptyCatalog(today),nextDays={};
    for(let i=0;i<storage.length;i++) {
      const key=storage.key(i);if(key?.startsWith(prefix+'day:')&&validDate(key.slice((prefix+'day:').length))) {
        const value=read(key.slice(prefix.length));if(value)nextDays[value.date]=value;
      }
    }
    catalog=nextCatalog;days=nextDays;
  }
  load();
  const status=()=>({pending:0,error,saving:false,readError:null,loading:0,dataVersion,local:true});
  const notify=()=>{if(current())listeners.forEach(fn=>fn());};
  function dispatch(command) {
    assertCurrent();
    if(failedCommand&&command!==failedCommand)dispatch(failedCommand);
    let latest,record;
    try {
      // Read the affected records immediately before the synchronous write, including edits from another tab.
      latest=read('catalog')||catalog;record=command.date?read('day:'+command.date):null;
    } catch(failure) {error='LOCAL_DATA_INVALID';notify();throw failure;}
    const changed=applyCommand(latest,command.date?{[command.date]:record||days[command.date]}:{},command,clock());
    const entries=Object.entries(changed);if(entries.length!==1)throw Error('LOCAL_ATOMIC_RECORD_REQUIRED');
    const [key,value]=entries[0];
    try {storage.setItem(prefix+key,JSON.stringify(value));}
    catch(failure){failedCommand=structuredClone(command);error='LOCAL_SAVE_FAILED';notify();throw failure;}
    catalog=key==='catalog'?value:latest;if(key.startsWith('day:'))days[key.slice(4)]=value;
    failedCommand=null;error=null;dataVersion++;notify();
  }
  const validRange=(start,end)=>{assertCurrent();if(!validDate(start)||!validDate(end))throw Error('INVALID_DATE');};
  const onStorage=event=>{
    if(!current()||event.storageArea&&event.storageArea!==storage||event.key!==null&&!event.key?.startsWith(prefix))return;
    try{load();if(!failedCommand)error=null;dataVersion++;}catch{error='LOCAL_DATA_INVALID';}notify();
  };
  events?.addEventListener('storage',onStorage);
  return {snapshot:(period=null)=>{
      assertCurrent();if(period&&(!validDate(period.start)||!validDate(period.end)||period.start>period.end))throw Error('INVALID_DATE');
      const scoped=period?Object.fromEntries(Object.entries(days).filter(([date])=>date>=period.start&&date<=period.end)):days;
      return structuredClone({catalog,days:scoped});
    },dispatch,status,
    flush:async()=>{assertCurrent();if(failedCommand)dispatch(failedCommand);if(error)throw Error(error);},hasPending:()=>Boolean(error),
    subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
    ensureRange:async(start,end=today)=>validRange(start,end),hasRange:(start,end)=>{validRange(start,end);return true;},
    coverage:()=>[{start:'2000-01-01',end:'2099-12-31',state:'ready'}],draft:()=>[],
    reloadServer:async()=>{assertCurrent();load();failedCommand=null;error=null;dataVersion++;notify();},
    close:()=>{closed=true;events?.removeEventListener('storage',onStorage);listeners.clear();catalog=null;days=null;},
  };
}
