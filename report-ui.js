import { planner } from './planner-store.js';
import { dateKey,dayStats,emptyDay } from './model.mjs';
import {reportSteps,reportStepIndex,reportProgress,habitAnswer,reportCursorKey} from './report-wizard.mjs';
import {trackingStart} from './tracking-period.mjs';
const $=selector=>document.querySelector(selector);
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const store=await planner().catch(error=>{
  document.body.classList.remove('session-pending');document.body.replaceChildren();
  const main=document.createElement('main');main.className='preview-home';main.innerHTML='<p>تعذر تحميل بيانات الحساب.</p><button class="save-button" type="button">إعادة المحاولة</button>';
  main.querySelector('button').onclick=()=>location.reload();document.body.append(main);throw error;
});
let today=dateKey();
let selected=today<trackingStart?trackingStart:today,message='',cursorId='',stepIndex=0,mounted='',cached=null,renderedVersion=-1,frame=0;
const numbers=new Intl.NumberFormat('ar-SA');
const dates=new Intl.DateTimeFormat('ar-SA',{weekday:'long',day:'numeric',month:'long',year:'numeric',calendar:'islamic-umalqura',timeZone:'UTC'});
const cursorKey=()=>reportCursorKey(window.WA3I_SESSION.session.kind==='guest'?window.WA3I_SESSION.guestNamespace:window.WA3I_SESSION.projectId||window.FB.projectId,window.WA3I_SESSION.session.uid,selected);
function restoreCursor(){try{cursorId=sessionStorage.getItem(cursorKey())||'';}catch{cursorId='';}stepIndex=0;}
function rememberCursor(){try{sessionStorage.setItem(cursorKey(),cursorId);}catch{}}
function view(){
  const version=store.status().dataVersion;
  if(!cached||cached.version!==version||cached.date!==selected){
    const {catalog,days}=store.snapshot();
    cached={version,date:selected,catalog,days,record:days[selected]||emptyDay(selected),day:dayStats(catalog,days,selected,today),steps:reportSteps(catalog,selected)};
  }
  return cached;
}
function saveStatus() {
  const state=store.status();$('#saveStatus').dataset.error=!!state.error;
  $('#saveStatus').textContent=state.error==='CONFLICT'?'تعارض مع جلسة أخرى؛ مسودتك محفوظة هنا':state.error?'لم يكتمل الحفظ؛ أعد المحاولة قبل المغادرة':state.pending?'جارٍ الحفظ…':message||(state.local?'محفوظ على هذا الجهاز فقط':'محفوظ في الحساب');
  $('#retrySave').hidden=!state.error;$('#resolveConflict').hidden=state.error!=='CONFLICT';
  if(selected>today&&!state.error)$('#saveStatus').textContent='تبدأ المتابعة في 16 أكتوبر 2026';
}
function render() {
  const {record,day,steps,version}=view();
  stepIndex=reportStepIndex(steps,cursorId,stepIndex);const step=steps[stepIndex];cursorId=step.id;
  $('#reportDay').value=selected;$('#reportDay').max=today<trackingStart?trackingStart:today;$('#reportDay').min=trackingStart;
  $('#reportDate').textContent=dates.format(new Date(selected+'T12:00:00Z'));
  $('#reportCount').textContent=`${numbers.format(day.completed)} من ${numbers.format(day.required)}`;
  $('#stepSection').textContent=step.section;$('#reportQuestion').textContent=step.title;
  const percent=reportProgress(stepIndex,steps.length);
  $('#stepCount').textContent=`الخطوة ${numbers.format(stepIndex+1)} من ${numbers.format(steps.length)}`;
  $('#stepPercent').textContent=numbers.format(percent)+'٪';$('#stepProgress').value=percent;
  $('#reportHabits').hidden=step.kind!=='habit';$('#reportFields').hidden=step.kind!=='field';$('#reportReview').hidden=step.kind!=='review';
  const mountKey=selected+'|'+step.id;
  if(mounted!==mountKey){
    $('#reportHabits').replaceChildren();$('#reportFields').replaceChildren();
    if(step.kind==='habit')$('#reportHabits').innerHTML=`<div class="answer-options" role="group" aria-label="${escape(step.title)}">${[['done','نعم'],['no','لا'],['unanswered','دون إجابة']].map(([state,label])=>`<button type="button" data-habit="${escape(step.habitId)}" data-answer="${state}" aria-pressed="false">${label}</button>`).join('')}</div>`;
    if(step.kind==='field')$('#reportFields').innerHTML=`<label class="add-field">${step.input?`<input id="reportAnswer" name="${step.name}" type="${step.input}" ${step.input==='number'?'min="0" max="100000"':'maxlength="10000"'} aria-label="${escape(step.label)}">`:`<textarea id="reportAnswer" name="${step.name}" maxlength="10000" aria-label="${escape(step.label)}"></textarea>`}</label>`;
    mounted=mountKey;
  }
  if(step.kind==='habit')for(const button of $('#reportHabits').querySelectorAll('[data-answer]'))button.setAttribute('aria-pressed',String(button.dataset.answer===habitAnswer(record,step.habitId)));
  const input=$('#reportAnswer');if(input&&document.activeElement!==input)input.value=record.report[step.name]||'';
  if(input)input.disabled=selected>today;
  for(const button of $('#reportHabits').querySelectorAll('[data-answer]'))button.disabled=selected>today;
  $('#saveReport').disabled=selected>today;
  $('#previousQuestion').disabled=stepIndex===0;$('#nextQuestion').hidden=step.kind==='review';
  $('#nextQuestion').textContent=steps[stepIndex+1]?.kind==='review'?'عرض التقرير':'التالي';
  $('#copyReport').hidden=step.kind!=='review';
  if(step.kind==='review')$('#reportText').value=reportText();
  renderedVersion=version;
  saveStatus();
}
function reportText() {
  const {record,day}=view(),r=record.report;
  const group=state=>day.habits.filter(h=>(record.habitStatus[h.id]||'unanswered')===state).map(h=>`${state==='done'?'✅':state==='no'?'❌':'⬜'} ${h.name}`).join('\n')||'—';
  return `🧭 تقرير التعافي اليومي\n\n📆 اليوم: ${$('#reportDate').textContent}\n🕰️ اليوم رقم: ${r.dayNo||'—'} في رحلة التعافي\n\n🌿 جوانب التعافي\n\n✅ العادات التي التزمت بها اليوم:\n${group('done')}\n\n❌ العادات التي لم ألتزم بها:\n${group('no')}\n\n⬜ عادات دون إجابة:\n${group('unanswered')}\n\n🚫 جانب «لا تقربوا»\n${r.avoided||'—'}\n\n🤲 الحمد\n${r.gratitude||'—'}\n\n⭐ التقييم اليومي\n📈 عدد العادات المنجزة: ${day.completed} من أصل ${day.required}\n\n🗒️ ملخص يومي\n${r.summary||'—'}\n\n🎁 التحفيز الذاتي\n${r.motivation||'—'}\n\n📌 ملاحظات مهمة\n${r.notes||'—'}\n\n#قبيلة_الموحدون`;
}
$('#reportHabits').onclick=event=>{
  const button=event.target.closest('[data-answer]');if(!button)return;
  const current=view(),step=current.steps[stepIndex];if(step?.kind!=='habit'||step.habitId!==button.dataset.habit)return;
  if(habitAnswer(current.record,step.habitId)===button.dataset.answer)return;
  message='';store.dispatch({type:'habitStatus',date:selected,id:step.habitId,status:button.dataset.answer});
  cancelAnimationFrame(frame);frame=0;render();
};
$('#reportFields').addEventListener('input',event=>{
  if(!event.target.name||view().record.report[event.target.name]===event.target.value)return;
  message='';store.dispatch({type:'report',date:selected,fields:{[event.target.name]:event.target.value}});
});
function moveQuestion(direction){
  const {steps}=view();stepIndex=Math.max(0,Math.min(steps.length-1,stepIndex+direction));cursorId=steps[stepIndex].id;rememberCursor();
  render();$('#reportQuestion').focus({preventScroll:true});$('.window-content').scrollTop=0;
}
$('#previousQuestion').onclick=()=>moveQuestion(-1);$('#nextQuestion').onclick=()=>moveQuestion(1);
$('#reportDay').onchange=async event=>{
  const input=event.target,date=input.value;if(!date||date<trackingStart||date>today||date===selected)return;
  input.value=selected;input.disabled=true;
  try{await store.ensureRange(date,date);selected=date;message='';restoreCursor();render();}catch{input.value=selected;alert('تعذر تحميل التقرير؛ لم نغيّر البيانات.');}
  finally{input.disabled=false;}
};
$('#saveReport').onclick=async()=>{
  $('#saveReport').disabled=true;message='';
  try{store.dispatch({type:'report',date:selected,fields:{finalized:true}});await store.flush();message=store.status().local?'تم الحفظ على هذا الجهاز':'تم تأكيد الحفظ من الخادم';}
  catch{message='';}finally{if($('#saveReport')){$('#saveReport').disabled=false;saveStatus();}}
};
$('#copyReport').onclick=async()=>{
  const text=reportText();$('#reportText').value=text;
  try{await navigator.clipboard.writeText(text);message='تم النسخ';saveStatus();}catch{$('#reportText').focus();$('#reportText').select();}
};
$('#retrySave').onclick=()=>{void store.flush().catch(()=>{});};
$('#resolveConflict').onclick=async()=>{
  const blob=new Blob([JSON.stringify(store.draft(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='my-report-draft.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  if(confirm('تم تجهيز نسخة مسودتك. هل تريد تحميل نسخة الخادم بدل التعديلات المتعارضة؟'))await store.reloadServer();
};
async function leave(){if(await window.WA3I_SESSION.safeLeave())location.href='./index.html?release=20261016-627cf2efd8fc';}
$('#closeReport').onclick=leave;$('#reportWindow').addEventListener('cancel',event=>{event.preventDefault();void leave();});
window.addEventListener('wa3i-session-cleared',()=>{cancelAnimationFrame(frame);frame=0;cached=null;cursorId='';document.body.replaceChildren();});
store.subscribe(()=>{
  saveStatus();if(store.status().dataVersion===renderedVersion||frame)return;
  frame=requestAnimationFrame(()=>{frame=0;renderedVersion=store.status().dataVersion;render();});
});
restoreCursor();render();$('#reportWindow').showModal();window.WA3I_PERFORMANCE?.mark('report-ui-usable');
function updateDate(){if(!window.WA3I_SESSION.session)return;const next=dateKey();if(next===today)return;today=next;cached=null;render();}
const clockTimer=setInterval(updateDate,60000);
window.addEventListener('wa3i-session-cleared',()=>clearInterval(clockTimer));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateDate();});
