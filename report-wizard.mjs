import {habitsFor} from './model.mjs';

const fields=[
  {name:'dayNo',label:'اليوم رقم في رحلة التعافي',title:'اليوم رقم كم في رحلة التعافي؟',section:'بيانات التقرير',input:'number'},
  {name:'avoided',label:'جانب «لا تقربوا»',title:'ما العادات السلبية التي تجنبتها اليوم؟',section:'جانب «لا تقربوا»'},
  {name:'gratitude',label:'الحمد',title:'ما النعم التي تحمد الله عليها اليوم؟',section:'الحمد'},
  {name:'summary',label:'ملخص يومي',title:'كيف كان يومك؟',section:'ملخص يومي'},
  {name:'motivation',label:'التحفيز الذاتي',title:'ماذا تقول لنفسك اليوم؟',section:'التحفيز الذاتي'},
  {name:'notes',label:'ملاحظات مهمة',title:'ما الملاحظات التي تريد تسجيلها؟',section:'ملاحظات مهمة'},
];
const fieldStep=field=>({...field,id:'field:'+field.name,kind:'field'});
export function reportSteps(catalog,date){
  return [fieldStep(fields[0]),...habitsFor(catalog,date).map(habit=>({
    id:'habit:'+habit.id,habitId:habit.id,title:habit.name,section:'عادات التعافي',kind:'habit',
  })),...fields.slice(1).map(fieldStep),{id:'review',kind:'review',title:'التقرير النهائي',section:'مراجعة التقرير'}];
}
export function reportStepIndex(steps,id,fallback=0){
  if(id==='field:feeling')id='field:summary';
  const index=steps.findIndex(step=>step.id===id);
  return index<0?Math.max(0,Math.min(steps.length-1,fallback)):index;
}
export function reportProgress(index,total){
  return total<2?100:Math.round(Math.max(0,Math.min(total-1,index))/(total-1)*100);
}
export function habitAnswer(record,id){
  return ['done','no'].includes(record.habitStatus[id])?record.habitStatus[id]:'unanswered';
}
export function reportCursorKey(projectId,uid,date){
  return 'wa3i-report-cursor-v1:'+encodeURIComponent(projectId)+':'+encodeURIComponent(uid)+':'+date;
}
