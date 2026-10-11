import {addDays,validDate} from './model.mjs';
export function missingRanges(start,end,intervals) {
  if(!validDate(start)||!validDate(end)||start>end)return [];
  const sorted=intervals.filter(i=>i.state!=='error'&&i.end>=start&&i.start<=end).sort((a,b)=>a.start.localeCompare(b.start));
  let cursor=start;const missing=[];
  for(const interval of sorted) {
    if(interval.start>cursor)missing.push({start:cursor,end:addDays(interval.start,-1)});
    if(interval.end>=cursor)cursor=addDays(interval.end,1);
    if(cursor>end)break;
  }
  if(cursor<=end)missing.push({start:cursor,end});return missing;
}
export function rangePages(start,end,size=62) {
  const pages=[];for(let key=start;key<=end;) {const last=addDays(key,size-1);const next=last<end?last:end;pages.push({start:key,end:next});key=addDays(next,1);}return pages;
}
