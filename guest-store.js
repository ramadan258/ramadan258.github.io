import {applyCommand,emptyCatalog,dateKey,validDate} from './model.mjs';
import {trackingStart} from './tracking-period.mjs';
import {withGuestLock} from './guest-lock.js';

// Guest records never share keys, journals, or owners with cloud/member records.
export function createGuestPlanner({storage=localStorage,namespace,isCurrent=()=>true,events=window,today=dateKey(),clock=()=>today}) {
  const prefix=namespace+':tracking-'+trackingStart+':planner:',listeners=new Set();
  let closed=false,dataVersion=0,error=null,catalog,days,working=null;
  const pending=[];
  const current=()=>!closed&&isCurrent();
  const assertCurrent=()=>{if(!current())throw Error('STALE_SESSION');};
  function read(key) {
    const raw=storage.getItem(prefix+key);if(raw===null)return null;
    const value=JSON.parse(raw);
    if(value?.schema!==1||value.trackingPeriod!==trackingStart||(key==='catalog'?!Array.isArray(value.habits):value.date!==key.slice(4)))throw Error('LOCAL_DATA_INVALID');
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
  const status=()=>({pending:pending.length,error,saving:!!working,readError:null,loading:0,dataVersion,local:true});
  const notify=()=>{if(current())listeners.forEach(fn=>fn());};
  function applyLocal(command){
    for(const [key,value] of Object.entries(applyCommand(catalog,days,command,clock()))) {
      if(key==='catalog')catalog=value;else days[key.slice(4)]=value;
    }
  }
  async function flush(){
    assertCurrent();if(working)return working;
    working=(async()=>{
      try{while(pending.length){
        const command=pending[0];
        await withGuestLock(prefix,()=>{
          assertCurrent();const latest=read('catalog')||emptyCatalog(),record=command.date?read('day:'+command.date):null;
          const entries=Object.entries(applyCommand(latest,command.date?{[command.date]:record}:{},command,clock()));
          if(entries.length!==1)throw Error('LOCAL_ATOMIC_RECORD_REQUIRED');
          const [key,value]=entries[0];storage.setItem(prefix+key,JSON.stringify(value));
        });
        assertCurrent();pending.shift();load();for(const command of pending)applyLocal(command);dataVersion++;notify();
      }error=null;}catch(failure){error='LOCAL_SAVE_FAILED';throw failure;}
    })();
    try{await working;}finally{working=null;notify();}
  }
  function dispatch(command){
    assertCurrent();applyLocal(command);pending.push(structuredClone(command));error=null;dataVersion++;notify();void flush().catch(()=>{});
  }
  const validRange=(start,end)=>{assertCurrent();if(!validDate(start)||!validDate(end))throw Error('INVALID_DATE');};
  const onStorage=event=>{
    if(!current()||event.storageArea&&event.storageArea!==storage||event.key!==null&&!event.key?.startsWith(prefix))return;
    try{load();for(const command of pending)applyLocal(command);if(!pending.length)error=null;dataVersion++;}catch{error='LOCAL_DATA_INVALID';}notify();
  };
  events?.addEventListener('storage',onStorage);
  return {snapshot:(period=null)=>{
      assertCurrent();if(period&&(!validDate(period.start)||!validDate(period.end)||period.start>period.end))throw Error('INVALID_DATE');
      const scoped=period?Object.fromEntries(Object.entries(days).filter(([date])=>date>=period.start&&date<=period.end)):days;
      return structuredClone({catalog,days:scoped});
    },dispatch,status,
    flush,hasPending:()=>pending.length>0||Boolean(error),
    subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
    ensureRange:async(start,end=today)=>validRange(start,end),hasRange:(start,end)=>{validRange(start,end);return true;},
    coverage:()=>[{start:'2000-01-01',end:'2099-12-31',state:'ready'}],draft:()=>[],
    reloadServer:async()=>{assertCurrent();await flush();load();error=null;dataVersion++;notify();},
    close:()=>{closed=true;events?.removeEventListener('storage',onStorage);listeners.clear();catalog=null;days=null;},
  };
}
