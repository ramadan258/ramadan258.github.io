import {dayCount} from './harvest-model.mjs';
import {addDays,dateKey} from './model.mjs';

export function periodSummary(analysis,today=dateKey()){
  const calendarDays=dayCount(analysis.start,analysis.end);
  const futureDays=analysis.end>today?dayCount(analysis.start>today?analysis.start:addDays(today,1),analysis.end):0;
  return {start:analysis.start,end:analysis.end,calendarDays,eligibleDays:analysis.eligibleDays,
    futureDays,unscheduledDays:Math.max(0,calendarDays-futureDays-analysis.eligibleDays),
    completed:analysis.stats.completed,required:analysis.stats.required,
    percentage:analysis.stats.percentage,hasSchedule:analysis.stats.required>0};
}
// Resolve the stored chronological group, never an index inferred from RTL pixels.
export function columnAction(analysis,index){
  if(!Number.isInteger(index)||index<0||index>=analysis.groups.length)throw Error('INVALID_COLUMN');
  const group=analysis.groups[index];
  return analysis.unit==='day'?{type:'day',date:group.start}:{type:'period',start:group.start,end:group.end,unit:analysis.unit==='month'?'week':'day'};
}
