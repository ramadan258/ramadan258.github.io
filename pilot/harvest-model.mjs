import {addDays,validDate,monday,dayStats,dateKey} from './model.mjs';
export const dayCount=(start,end)=>Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000)+1;
const minimum=(a,b)=>a<b?a:b;
const maximum=(a,b)=>a>b?a:b;
export function validatePeriod(start,end) {
  if(!validDate(start)||!validDate(end))throw Error('INVALID_DATE');
  if(start>end)throw Error('REVERSED_PERIOD');
  return {start,end};
}
export const quickPeriod=(length,today=dateKey())=>({start:addDays(today,1-length),end:today});
export function aggregation(start,end,width=800) {
  const count=dayCount(start,end);
  return count<=14?'day':count<=90||count<=180&&width>=700?'week':'month';
}
function monthEnd(key) {
  const date=new Date(key.slice(0,7)+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);date.setUTCDate(0);return date.toISOString().slice(0,10);
}
export function partition(start,end,unit,today=end) {
  validatePeriod(start,end);end=minimum(end,today);const groups=[];
  for(let key=start;key<=end;) {
    const last=minimum(end,unit==='day'?key:unit==='week'?addDays(monday(key),6):monthEnd(key));
    groups.push({start:key,end:last,unit});key=addDays(last,1);
  }
  return groups;
}
export function comparisonWindow(start,end,today=dateKey()) {
  validatePeriod(start,end);end=minimum(end,today);
  const length=dayCount(start,end),finishedEnd=minimum(end,addDays(today,-1)),finishedDays=dayCount(start,finishedEnd);
  if(length<1||finishedDays<1)return null;
  const previousStart=addDays(start,-length);
  return {current:{start,end:finishedEnd},previous:{start:previousStart,end:addDays(previousStart,finishedDays-1)},
    length:finishedDays,includesToday:end===today};
}
export function blankStats() {return {required:0,completed:0,no:0,unanswered:0,tasks:0,taskCompleted:0,taskNo:0,taskUnanswered:0,percentage:null,taskPercentage:null};}
function finish(stats) {
  stats.percentage=stats.required?stats.completed/stats.required*100:null;
  stats.taskPercentage=stats.tasks?stats.taskCompleted/stats.tasks*100:null;return stats;
}
export function sumDays(dayMap,start,end) {
  const result=blankStats();
  for(let key=start;key<=end;key=addDays(key,1)) {
    const d=dayMap.get(key);if(!d)continue;
    result.required+=d.required;result.completed+=d.completed;result.no+=d.no;result.unanswered+=d.unanswered;
    result.tasks+=d.tasks.length;result.taskCompleted+=d.taskCompleted;
    result.taskNo+=d.tasks.filter(t=>t.state==='no').length;result.taskUnanswered+=d.tasks.filter(t=>t.state==='unanswered').length;
  }
  return finish(result);
}
export function trendPoints(groups) {
  if(groups.filter(g=>g.required>0).length<3)return groups.map(()=>null);
  return groups.map((group,i)=>{
    if(!group.required)return null;
    const window=[];
    for(let j=i;j>=Math.max(0,i-2);j--){if(!groups[j].required)break;window.unshift(groups[j]);}
    if(window.length<2)return null;
    return window.reduce((n,g)=>n+g.completed,0)/window.reduce((n,g)=>n+g.required,0)*100;
  });
}
export function analyze({catalog,days,start,end,today=dateKey(),width=800,unit=null,compare=true}) {
  validatePeriod(start,end);const effectiveEnd=minimum(end,today),mode=unit||aggregation(start,effectiveEnd,width);
  const comparison=compare?comparisonWindow(start,end,today):null;
  const earliest=maximum(catalog.started,comparison?.previous.start||start),dayMap=new Map();
  // One date pass feeds bars, weighted totals, rankings and comparison; no stored percentage documents.
  for(let key=earliest;key<=effectiveEnd;key=addDays(key,1))dayMap.set(key,dayStats(catalog,days,key,today));
  const groups=partition(start,end,mode,today).map(g=>({...g,...sumDays(dayMap,g.start,g.end)}));
  const stats=sumDays(dayMap,start,effectiveEnd),rankings=[];
  const byHabit=new Map();
  for(const [key,day] of dayMap) {
    if(key<start)continue;
    for(const h of day.habits) {
      const entry=byHabit.get(h.id)||{id:h.id,name:h.name,required:0,completed:0};entry.name=h.name;entry.required++;
      if(days[key]?.habitStatus[h.id]==='done')entry.completed++;byHabit.set(h.id,entry);
    }
  }
  for(const entry of byHabit.values())rankings.push({...entry,percentage:entry.completed/entry.required*100});
  // At least three scheduled occurrences; ties do not imply a meaningful best/worst ordering.
  const qualified=rankings.filter(r=>r.required>=3).sort((a,b)=>b.percentage-a.percentage||b.required-a.required||a.id.localeCompare(b.id));
  let comparisonStats=null;
  if(comparison&&comparison.previous.start>=catalog.started) {
    const current=sumDays(dayMap,comparison.current.start,comparison.current.end),previous=sumDays(dayMap,comparison.previous.start,comparison.previous.end);
    if(current.required&&previous.required)comparisonStats={...comparison,current:{...comparison.current,...current},previous:{...comparison.previous,...previous},difference:current.percentage-previous.percentage};
  }
  const fullWeeks=partition(start,end,'week',today).filter(g=>dayCount(g.start,g.end)===7&&g.end<today)
    .map(g=>({...g,...sumDays(dayMap,g.start,g.end)})).filter(g=>g.required>=3);
  const bestWeek=fullWeeks.length>=2?fullWeeks.sort((a,b)=>b.percentage-a.percentage||b.required-a.required)[0]:null;
  return {start,end,effectiveEnd,unit:mode,groups,stats,trend:trendPoints(groups),comparison:comparisonStats,
    comparisonWindow:comparison,rankings,most:qualified[0]||null,
    least:qualified.length>1&&qualified.at(-1).percentage<qualified[0].percentage?qualified.at(-1):null,bestWeek};
}
