import {addDays,validDate,dateKey} from './model.mjs';
import {dayCount} from './harvest-model.mjs';
export const fixedLengths=[7,14,30,60,90];
const shortArabic=new Intl.DateTimeFormat('ar-SA',{calendar:'gregory',day:'numeric',month:'long',timeZone:'UTC'});
const fullArabic=new Intl.DateTimeFormat('ar-SA',{calendar:'gregory',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
export function formatPeriodArabic(start,end){
  if(!validDate(start)||!validDate(end)||start>end)throw Error('INVALID_DATE');
  const first=new Date(start+'T12:00:00Z'),last=new Date(end+'T12:00:00Z');
  return start===end?fullArabic.format(first):start.slice(0,4)===end.slice(0,4)?shortArabic.format(first)+' — '+fullArabic.format(last):fullArabic.format(first)+' — '+fullArabic.format(last);
}
export function fixedPeriod(length,launch,today=dateKey(),index=null){
  if(!fixedLengths.includes(length)||!validDate(launch))throw Error('LAUNCH_DATE_REQUIRED');
  const current=Math.max(0,Math.floor((dayCount(launch,today)-1)/length));
  const slot=index===null?current:index;
  if(!Number.isSafeInteger(slot)||slot<0||slot>current)throw Error('INVALID_PERIOD_INDEX');
  const start=addDays(launch,slot*length);
  return {start,end:addDays(start,length-1),index:slot,length};
}
export function shiftFixed(period,direction,launch,today=dateKey()){
  return fixedPeriod(period.length,launch,today,period.index+direction);
}
// Data remain ascending; RTL is applied to the chart grid, not to its records.
export const chartKeyboardIndex=(index,key,count)=>key==='ArrowLeft'?(index+1)%count:key==='ArrowRight'?(index+count-1)%count:key==='Home'?0:key==='End'?count-1:null;
