import {localTimeZone} from './tracking-period.mjs';
import {validTimeZone} from './model.mjs';

// Private metadata only; never re-date historical answers or overwrite a pending edit.
export function bindPlannerClock(store,{isCurrent,clock=localTimeZone,events=globalThis.window,setTimer=setInterval,clearTimer=clearInterval}) {
  let closed=false;
  function sync() {
    if(closed||!isCurrent())return;
    const status=store.status();
    if(status.pending||status.saving||status.error||status.readError)return;
    const zone=clock();
    if(validTimeZone(zone)&&store.snapshot().catalog.timeZone!==zone)store.dispatch({type:'timeZone',zone});
  }
  const unsubscribe=store.subscribe(sync),timer=setTimer(sync,60000),close=store.close;
  events?.addEventListener('focus',sync);
  store.close=()=>{if(closed)return;closed=true;unsubscribe();clearTimer(timer);events?.removeEventListener('focus',sync);close();};
  sync();
}
