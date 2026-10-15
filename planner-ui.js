import { planner } from './planner-store.js';
import { dateKey,addDays,monday,weekday,weekdays,dayStats,versionAt } from './model.mjs';
import {plannerFeatures,resolvePlannerTab,nextPlannerTab} from './khutay-navigation.mjs';
import {trackingStart} from './tracking-period.mjs';
const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const numberFormat=new Intl.NumberFormat('ar-SA',{maximumFractionDigits:1});
const dateFormat=new Intl.DateTimeFormat('ar-SA',{calendar:'gregory',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const number=value=>numberFormat.format(value),percent=value=>value===null?'—':number(value)+'٪';
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
const fullDate=key=>dateFormat.format(new Date(key+'T12:00:00Z'));
const uid=()=>crypto.randomUUID();
const store=await planner().catch(error=>{
  document.body.classList.remove('session-pending');document.body.replaceChildren();
  const main=document.createElement('main');main.className='preview-home';main.innerHTML='<p>تعذر تحميل بيانات الحساب.</p><button class="save-button" type="button">إعادة المحاولة</button>';
  main.querySelector('button').onclick=()=>location.reload();document.body.append(main);throw error;
});
let {catalog,days}=store.snapshot(),today=dateKey(),selectedDate=today<trackingStart?trackingStart:today,tab='day',detail=null,harvestDate=selectedDate;
const habitDate=()=>today<trackingStart?trackingStart:today;
let archivedHabits=false,expanded={habits:false},editor=null;
let weekCounts=new Map();
let harvest=null,harvestPromise=null;
function ensureHarvest(){
  if(!harvestPromise)harvestPromise=import('./harvest-ui.js').then(({createHarvest})=>{
    if(!window.WA3I_SESSION.session)throw Error('STALE_SESSION');
    return harvest=createHarvest({root:$('#panel-harvest'),store,today,showDay:renderDayDetails});
  });
  return harvestPromise;
}
const currentDay=()=>dayStats(catalog,days,selectedDate,today);
const actions=(kind,id,archived=false)=>`<div class="item-actions"><button type="button" data-edit="${kind}" data-id="${id}">تعديل</button><button type="button" data-archive="${kind}" data-id="${id}">${archived?'استعادة':'أرشفة'}</button><button type="button" data-delete="${kind}" data-id="${id}" class="danger">حذف</button></div>`;
function run(command) {
  try{store.dispatch(command);return true;}catch(e){alert(e.message==='INVALID_SCHEDULE'?'اختر يومًا واحدًا على الأقل.':'راجع الحقول والتاريخ.');return false;}
}
function saveStatus() {
  const state=store.status();$('#saveStatus').textContent=state.error==='CONFLICT'?'تعارض مع جلسة أخرى؛ مسودتك محفوظة هنا':state.error?'لم يكتمل الحفظ؛ أعد المحاولة قبل المغادرة':state.pending?'جارٍ الحفظ…':state.local?'محفوظ على هذا الجهاز فقط':'محفوظ في الحساب';
  $('#retrySave').hidden=!state.error;$('#saveStatus').dataset.error=!!state.error;
  if(today<trackingStart&&!state.error&&!state.pending)$('#saveStatus').textContent='تبدأ المتابعة في 16 أكتوبر 2026';
  if(state.error==='CONFLICT'&&!$('#resolveConflict')) {
    const button=document.createElement('button');button.className='list-toggle';button.id='resolveConflict';button.textContent='مراجعة التعارض';button.onclick=resolveConflict;$('.window-footer').append(button);
  }
  if(!state.error)$('#resolveConflict')?.remove();
}
function renderDaily() {
  const day=currentDay();$('#todayWeekday').textContent=weekdays[weekday(selectedDate)];$('#todayDate').textContent=fullDate(selectedDate);$('#dayPicker').value=selectedDate;$('#dayPicker').max=habitDate();
  $('#dayPicker').min=trackingStart;
  $('#dailyPercent').textContent=percent(day.future?null:day.percentage);$('#dailyProgress').setAttribute('aria-valuenow',day.future?0:day.percentage||0);$('#dailyProgressFill').style.width=(day.future?0:day.percentage||0)+'%';
  $('#dailyHabitCount').textContent=`${number(day.completed)} من ${number(day.required)}`;$('#dailyRemaining').textContent=`${number(day.unanswered)} دون إجابة`;
  $('#dailyHabitList').innerHTML=day.habits.length?day.habits.map(h=>`<label class="habit-row${days[selectedDate]?.habitStatus[h.id]==='done'?' is-complete':''}"><input type="checkbox" data-habit="${h.id}" ${day.future?'disabled':''} ${days[selectedDate]?.habitStatus[h.id]==='done'?'checked':''}><span class="check-indicator">${icon('check')}</span><span class="row-name">${escape(h.name)}</span></label>`).join(''):'<p class="list-empty">أضف عادتك الأولى</p>';
}
function habitWeekCount(id) {
  return weekCounts.get(id)||{required:0,done:0};
}
function updateWeekCounts(){
  weekCounts=new Map();
  for(let i=0;i<7;i++){
    const date=addDays(monday(today),i);if(date>today)break;
    for(const habit of dayStats(catalog,days,date,today).habits){
      const count=weekCounts.get(habit.id)||{required:0,done:0};count.required++;
      if(days[date]?.habitStatus[habit.id]==='done')count.done++;weekCounts.set(habit.id,count);
    }
  }
}
function renderHabits() {
  updateWeekCounts();
  const habits=catalog.habits.filter(h=>!h.deletedAt&&(!versionAt(h,habitDate())?.active)===archivedHabits);
  $('#habitTotal').textContent=number(habits.length)+' عادات';$('#archivedHabits').textContent=archivedHabits?'العودة للعادات':'المؤرشفة';
  $('#habitDirectory').innerHTML=habits.length?habits.map(h=>{
    const v=versionAt(h,habitDate()),stats=habitWeekCount(h.id);
    return `<div class="habit-directory-card"><button class="habit-directory-row" data-detail="${h.id}">${icon('habit')}<span class="habit-directory-info"><strong>${escape(v.name)}</strong><small>${v.days.map(d=>weekdays[d]).join(' · ')}</small></span><span class="habit-directory-count">${number(stats.done)} / ${number(stats.required)}</span>${icon('chevron')}</button>${actions('habit',h.id,!v.active)}</div>`;
  }).join(''):'<p class="list-empty">لا توجد عادات</p>';
  if(detail)renderHabitDetail();
}
function renderHabitDetail() {
  const h=catalog.habits.find(h=>h.id===detail);if(!h||h.deletedAt){detail=null;return toggleDetail();}
  const v=versionAt(h,habitDate()),stats=habitWeekCount(h.id);$('#detailTitle').textContent=v.name;$('#detailSchedule').textContent=v.days.map(d=>weekdays[d]).join(' · ');
  $('#detailHabitCount').textContent=`${number(stats.done)} من ${number(stats.required)}`;
  $('#habitActions').innerHTML=actions('habit',h.id,!v.active);
  $('#habitWeek').innerHTML=weekdays.map((name,i)=>{
    const date=addDays(monday(today),i),scheduled=dayStats(catalog,days,date,today).habits.some(h=>h.id===detail),done=days[date]?.habitStatus[detail]==='done';
    return `<button type="button" class="habit-day${done?' is-done':''}${!scheduled?' is-unscheduled':''}" data-history="${date}" ${!scheduled||date>today||!store.hasRange(date,date)?'disabled':''} aria-pressed="${done}" aria-label="${name} ${done?'مكتملة':'غير مكتملة'}"><span class="day-name">${name}</span><span class="day-number">${number(Number(date.slice(-2)))}</span>${icon('check')}</button>`;
  }).join('');toggleDetail();
}
function toggleDetail(){ $('#habitOverview').hidden=!!detail;$('#habitDetail').hidden=!detail;$('#detailBack').hidden=!detail; }
function dayList(type,items,date,complete=false) {
  const visible=complete||expanded[type]?items:items.slice(0,4);
  return (items.length?`<ul class="detail-item-list">${visible.map(item=>{
    const state=days[date]?.habitStatus[item.id]||'unanswered';
    return `<li class="detail-item${state==='done'?' is-complete':''}"><span class="detail-state-mark">${state==='done'?icon('check'):'<span class="detail-open-mark"></span>'}</span><span class="detail-item-name">${escape(item.name)}</span><span class="detail-item-status">${date>today?'لم يحن بعد':state==='done'?'مكتملة':state==='no'?'غير مكتملة':'دون إجابة'}</span></li>`;
  }).join('')}</ul>`:'<p class="list-empty">لا توجد عناصر مجدولة</p>')+(!complete&&items.length>4?`<button type="button" class="list-toggle" data-expand="${type}">${expanded[type]?'عرض أقل':'عرض الكل'}</button>`:'');
}
function renderDayDetails(date=harvestDate,open=false) {
  if(date!==harvestDate)expanded={habits:false};harvestDate=date;
  if(open)expanded.habits=true;
  const recorded=dayStats(catalog,days,date,today),beforeHistory=date<catalog.started,day=recorded.future||beforeHistory?{...recorded,habits:[],required:0,completed:0,no:0,unanswered:0}:recorded;
  const percentage=day.required?day.completed/day.required*100:null;
  $('#selectedDayStatus').textContent=day.future?'لم يحن بعد':beforeHistory?'قبل بدء سجلك':date===today?'حتى الآن':'يوم سابق';$('#selectedDayDate').textContent=weekdays[weekday(date)]+'، '+fullDate(date);
  $('#selectedDaySummary').innerHTML=`<dl class="day-detail-totals"><div><dt>إنجاز اليوم</dt><dd data-day-percentage>${day.future?'—':percent(percentage)}</dd></div><div><dt>العادات المجدولة</dt><dd data-day-required>${number(day.required)}</dd></div></dl><dl class="habit-state-summary" aria-label="حالات العادات"><div><dt>منجزة (نعم)</dt><dd data-day-done>${number(day.completed)}</dd></div><div><dt>غير منجزة (لا)</dt><dd data-day-no>${number(day.no)}</dd></div><div><dt>دون إجابة</dt><dd data-day-unanswered>${number(day.unanswered)}</dd></div></dl>`;
  $('#selectedDayHabits').innerHTML=dayList('habits',day.habits,date,true);
  $('#selectedDayAnnouncement').textContent=weekdays[weekday(date)]+' '+percent(percentage);
}
function render(){({catalog,days}=store.snapshot());if(tab==='day')renderDaily();if(tab==='habits')renderHabits();if(tab==='harvest')harvest?.render();saveStatus();}
function selectTab(name,focus=false) {
  name=resolvePlannerTab(name);
  tab=name;closeEditor();detail=null;toggleDetail();
  $$('[data-tab]').forEach(button=>{const active=button.dataset.tab===name;button.classList.toggle('is-active',active);button.setAttribute('aria-selected',active);button.tabIndex=active?0:-1;$('#panel-'+button.dataset.tab).hidden=!active;if(active&&focus)button.focus();});
  $('#windowContent').scrollTop=0;
  if(name==='habits')void store.ensureRange(monday(today)<trackingStart?trackingStart:monday(today),today).then(()=>{if(tab==='habits')render();}).catch(()=>{});
  render();if(name==='harvest')void ensureHarvest().then(value=>{if(tab==='harvest')value.activate();})
    .catch(()=>{$('#harvestLoadStateText').textContent='تعذر تحميل حصادي. أعد المحاولة.';});else harvest?.deactivate();
}
const field=(label,name,value='',type='text',extra='')=>`<label class="add-field"><span>${label}</span><input name="${name}" type="${type}" value="${escape(value)}" ${extra}></label>`;
function closeEditor(){if(!editor)return;editor.remove();editor=null;}
function openEditor(kind,id='',mount=null) {
  closeEditor();let contents='',value;
  if(kind==='habit') {
    value=id?versionAt(catalog.habits.find(h=>h.id===id),habitDate()):{name:'',days:[0,1,2,3,4,5,6]};
    contents=field('اسم العادة','name',value.name,'text','required maxlength="120"')+`<fieldset class="repeat-days"><legend>أيام التكرار</legend>${weekdays.map((name,i)=>`<label><input type="checkbox" name="days" value="${i}" ${value.days.includes(i)?'checked':''}><span>${name}</span></label>`).join('')}</fieldset>`;
    mount ||= detail?'#detailHabitForm':tab==='day'?'#dailyHabitForm':'#habitForm';
  } else return;
  const form=document.createElement('form');form.className='inline-add-form';form.dataset.kind=kind;form.dataset.id=id;
  form.innerHTML=contents+'<div class="add-form-actions"><button class="save-button" type="submit">حفظ</button><button class="cancel-button" type="button" data-cancel-add>إلغاء</button></div>';
  $(mount).prepend(form);editor=form;form.scrollIntoView({block:'nearest',behavior:'smooth'});form.querySelector('input')?.focus();
}
document.addEventListener('submit',event=>{
  if(event.target!==editor)return;event.preventDefault();const form=editor,values=new FormData(form),kind=form.dataset.kind;
  const cmd={type:kind,id:form.dataset.id||uid(),name:values.get('name')};
  if(kind==='habit')Object.assign(cmd,{days:values.getAll('days').map(Number)});
  if(run(cmd))closeEditor();
});
document.addEventListener('change',async event=>{
  const input=event.target;
  if(input.dataset.habit)run({type:'habitStatus',id:input.dataset.habit,date:selectedDate,status:input.checked?'done':'no'});
  if(input.id==='dayPicker'&&input.value>=trackingStart&&input.value<=today){
    const requested=input.value;input.value=selectedDate;input.disabled=true;closeEditor();
    try{await store.ensureRange(requested,requested);selectedDate=requested;render();}
    catch{input.value=selectedDate;alert('تعذر تحميل اليوم. بقيت البيانات السابقة دون تغيير.');}
    finally{input.disabled=false;}
  }
});
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.tab)selectTab(button.dataset.tab);
  if(button.dataset.add)openEditor(button.dataset.add,'',button.dataset.formMount);
  if(button.dataset.edit)openEditor(button.dataset.edit,button.dataset.id);
  if(button.hasAttribute('data-cancel-add'))closeEditor();
  if(button.dataset.detail){detail=button.dataset.detail;renderHabitDetail();}
  if(button.id==='detailBack'){detail=null;toggleDetail();}
  if(button.dataset.history)run({type:'habitStatus',id:detail,date:button.dataset.history,status:days[button.dataset.history]?.habitStatus[detail]==='done'?'no':'done'});
  if(button.dataset.archive) {
    const kind=button.dataset.archive,id=button.dataset.id,isArchived=!versionAt(catalog.habits.find(h=>h.id===id),habitDate()).active;
    run({type:kind+(isArchived?'Restore':'Archive'),id});closeEditor();
  }
  if(button.dataset.delete&&confirm('حذف هذا العنصر؟ ستبقى سجلات العادات السابقة محفوظة.')){run({type:button.dataset.delete+'Delete',id:button.dataset.id,date:selectedDate});closeEditor();}
  if(button.id==='archivedHabits'){archivedHabits=!archivedHabits;renderHabits();}
  if(button.dataset.expand){expanded[button.dataset.expand]=!expanded[button.dataset.expand];renderDayDetails(harvestDate);}
  if(button.id==='retrySave')void store.flush().catch(()=>{});
});
$('.tabs').addEventListener('keydown',event=>{
  const next=nextPlannerTab(tab,event.key);
  if(next!==null){event.preventDefault();selectTab(next,true);}
});
$('#khutayWindow').addEventListener('cancel',event=>{if(event.target!==event.currentTarget)return;event.preventDefault();if(editor)closeEditor();else void leave();});
async function leave(){if(await window.WA3I_SESSION.safeLeave())location.href='./index.html?release=20261016-1c76e7a947c6';}
$('#closePreview').onclick=leave;$('#launchPreview').onclick=()=>$('#khutayWindow').showModal();
window.addEventListener('wa3i-session-cleared',()=>{document.body.replaceChildren();});
async function resolveConflict() {
  const draft=store.draft(),blob=new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='khutay-my-draft.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  if(confirm('تم تجهيز نسخة من مسودتك. هل تريد تحميل بيانات الخادم بدل التعديلات المتعارضة؟'))await store.reloadServer();
}
let renderedVersion=-1,renderedReadError=null,frame=0;
store.subscribe(()=>{
  saveStatus();const state=store.status();
  if(state.dataVersion===renderedVersion&&state.readError===renderedReadError)return;
  if(frame)return;frame=requestAnimationFrame(()=>{frame=0;renderedVersion=store.status().dataVersion;renderedReadError=store.status().readError;render();});
});
renderedVersion=store.status().dataVersion;render();$('#khutayWindow').showModal();window.WA3I_PERFORMANCE?.mark('planner-ui-usable');
function fitVisibleWindow(){const viewport=window.visualViewport,dialog=$('#khutayWindow');if(!viewport||!dialog)return;dialog.style.setProperty('--visible-height',viewport.height+'px');dialog.style.setProperty('--visible-top',viewport.offsetTop+'px');}
window.visualViewport?.addEventListener('resize',fitVisibleWindow);window.visualViewport?.addEventListener('scroll',fitVisibleWindow);fitVisibleWindow();
const route=new URL(location.href),initialTab=route.searchParams.get('tab')||route.searchParams.get('view')||route.hash.replace(/^#(?:panel-)?/,'');
if(initialTab){const resolved=resolvePlannerTab(initialTab);selectTab(resolved);if(initialTab==='goals'&&!plannerFeatures.goals){route.searchParams.set('tab','day');route.searchParams.delete('view');route.hash='';history.replaceState(null,'',route);}}
window.addEventListener('wa3i-session-cleared',()=>{cancelAnimationFrame(frame);frame=0;});
async function updateDate(){if(!window.WA3I_SESSION.session)return;const next=dateKey();if(next===today)return;const previous=today;today=next;if(selectedDate===previous)selectedDate=next<trackingStart?trackingStart:next;await store.ensureRange(selectedDate,selectedDate).catch(()=>{});if(!window.WA3I_SESSION.session)return;harvest?.updateToday(next);render();}
const clockTimer=setInterval(()=>{void updateDate();},60000);
window.addEventListener('wa3i-session-cleared',()=>{clearInterval(clockTimer);harvest?.deactivate();window.visualViewport?.removeEventListener('resize',fitVisibleWindow);window.visualViewport?.removeEventListener('scroll',fitVisibleWindow);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void updateDate();});
