import { planner } from './planner-store.js';
import { dateKey,dayStats,emptyDay } from './model.mjs';
const $=selector=>document.querySelector(selector);
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const store=await planner().catch(error=>{
  document.body.classList.remove('session-pending');document.body.replaceChildren();
  const main=document.createElement('main');main.className='preview-home';main.innerHTML='<p>تعذر تحميل بيانات الحساب.</p><button class="save-button" type="button">إعادة المحاولة</button>';
  main.querySelector('button').onclick=()=>location.reload();document.body.append(main);throw error;
}),today=dateKey();let selected=today,message='';
function render() {
  const {catalog,days}=store.snapshot(),record=days[selected]||emptyDay(selected),day=dayStats(catalog,days,selected,today);
  $('#reportDay').value=selected;$('#reportDay').max=today;
  $('#reportDate').textContent=new Date(selected+'T12:00:00Z').toLocaleDateString('ar-SA',{weekday:'long',day:'numeric',month:'long',year:'numeric',calendar:'islamic-umalqura',timeZone:'UTC'});
  $('#reportCount').textContent=`${day.completed.toLocaleString('ar-SA')} من ${day.required.toLocaleString('ar-SA')}`;
  $('#reportHabits').innerHTML=day.habits.length?day.habits.map(h=>`<div class="report-habit"><span>${escape(h.name)}</span><div class="answer-options" role="group" aria-label="${escape(h.name)}">${[['done','نعم'],['no','لا'],['unanswered','دون إجابة']].map(([state,label])=>`<button type="button" data-habit="${h.id}" data-answer="${state}" aria-pressed="${(record.habitStatus[h.id]||'unanswered')===state}">${label}</button>`).join('')}</div></div>`).join(''):'<a class="list-toggle" href="khutay.html">أضف عاداتك في خُطاي</a>';
  for(const input of $('#reportFields').querySelectorAll('input,textarea'))if(document.activeElement!==input)input.value=record.report[input.name]||'';
  const state=store.status();$('#saveStatus').dataset.error=!!state.error;
  $('#saveStatus').textContent=state.error==='CONFLICT'?'تعارض مع جلسة أخرى؛ مسودتك محفوظة هنا':state.error?'لم يكتمل الحفظ؛ مسودتك محفوظة على هذا الجهاز':state.pending?'جارٍ الحفظ…':message||'محفوظ في الحساب';
  $('#retrySave').hidden=!state.error;$('#resolveConflict').hidden=state.error!=='CONFLICT';
  if(!$('#reportText').hidden)$('#reportText').value=reportText();
}
function reportText() {
  const {catalog,days}=store.snapshot(),record=days[selected]||emptyDay(selected),day=dayStats(catalog,days,selected,today),r=record.report;
  const group=state=>day.habits.filter(h=>(record.habitStatus[h.id]||'unanswered')===state).map(h=>`${state==='done'?'✅':state==='no'?'❌':'⬜'} ${h.name}`).join('\n')||'—';
  return `🧭 تقرير التعافي اليومي\n\n📆 اليوم: ${$('#reportDate').textContent}\n🕰️ اليوم رقم: ${r.dayNo||'—'} في رحلة التعافي\n\n🌿 جوانب التعافي\n\n✅ العادات التي التزمت بها اليوم:\n${group('done')}\n\n❌ العادات التي لم ألتزم بها:\n${group('no')}\n\n⬜ عادات دون إجابة:\n${group('unanswered')}\n\n🚫 جانب «لا تقربوا»\n${r.avoided||'—'}\n\n🤲 الحمد\n${r.gratitude||'—'}\n\n⭐ التقييم اليومي\n📈 عدد العادات المنجزة: ${day.completed} من أصل ${day.required}\n😌 شعوري العام: ${r.feeling||'—'}\n\n🗒️ ملخص يومي\n${r.summary||'—'}\n\n🎁 التحفيز الذاتي\n${r.motivation||'—'}\n\n📌 ملاحظات مهمة\n${r.notes||'—'}\n\n#قبيلة_الموحدون`;
}
$('#reportHabits').onclick=event=>{const button=event.target.closest('[data-answer]');if(!button)return;message='';store.dispatch({type:'habitStatus',date:selected,id:button.dataset.habit,status:button.dataset.answer});};
$('#reportFields').addEventListener('input',event=>{
  if(!event.target.name)return;message='';store.dispatch({type:'report',date:selected,fields:{[event.target.name]:event.target.value}});
});
$('#reportDay').onchange=async event=>{
  const input=event.target,date=input.value;if(!date||date>today)return;
  input.value=selected;input.disabled=true;
  try{await store.ensureRange(date,date);selected=date;message='';render();}catch{input.value=selected;alert('تعذر تحميل التقرير؛ لم نغيّر البيانات.');}
  finally{input.disabled=false;}
};
$('#saveReport').onclick=async()=>{
  $('#saveReport').disabled=true;message='';
  try{store.dispatch({type:'report',date:selected,fields:{finalized:true}});await store.flush();message='تم تأكيد الحفظ من الخادم';}
  catch{message='';}finally{$('#saveReport').disabled=false;render();}
};
$('#copyReport').onclick=async()=>{
  const text=reportText();$('#reportText').value=text;$('#reportText').hidden=false;
  try{await navigator.clipboard.writeText(text);message='تم النسخ';render();}catch{$('#reportText').focus();$('#reportText').select();}
};
$('#retrySave').onclick=()=>{void store.flush().catch(()=>{});};
$('#resolveConflict').onclick=async()=>{
  const blob=new Blob([JSON.stringify(store.draft(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='my-report-draft.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  if(confirm('تم تجهيز نسخة مسودتك. هل تريد تحميل نسخة الخادم بدل التعديلات المتعارضة؟'))await store.reloadServer();
};
async function leave(){if(await window.WA3I_SESSION.safeLeave())location.href='./index.html';}
$('#closeReport').onclick=leave;$('#reportWindow').addEventListener('cancel',event=>{event.preventDefault();void leave();});
$('#accountLabel').textContent=window.WA3I_SESSION.session.member.name;
window.addEventListener('wa3i-session-cleared',()=>document.body.replaceChildren());
store.subscribe(render);render();$('#reportWindow').showModal();
setInterval(()=>{if(dateKey()!==today)location.reload();},60000);
