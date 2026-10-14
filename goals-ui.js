import {dateKey,monday,addDays,goalPeriod,goalStats,versionAt} from './model.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>new Intl.NumberFormat('ar-SA',{maximumFractionDigits:1}).format(value);
const messages={INVALID_NAME:'اكتب اسمًا من ١ إلى ١٢٠ حرفًا.',INVALID_PARENT:'اختر هدفًا أعلى من المجال والخطة والفترة نفسها.',INVALID_PLAN:'راجع مجال الخطة وسنتها.',INVALID_AREA:'اختر مجالًا نشطًا.',INVALID_METRIC:'راجع الفترة والأعداد؛ يبدأ الأسبوع يوم الإثنين.',DEPENDENT_GOALS:'هذا العنصر مرتبط بعناصر أخرى. أعد ربطها أولًا، أو استخدم الأرشفة دون حذفها.',STALE_SESSION:'انتهت الجلسة. أعد تسجيل الدخول.',LOCAL_SAVE_FAILED:'لم يُحفظ التعديل على الجهاز. أعد المحاولة.',LOCAL_DATA_INVALID:'تعذر قراءة البيانات المحلية دون تغييرها.'};
export function createGoals({root,store,clock=dateKey}) {
  const $=s=>root.querySelector(s);let year=clock().slice(0,4),archived=false,editor=null,catalog,days;
  let loading=new Set(),generation=0,viewKey='';
  const live=item=>!item.deletedAt;
  const actions=(kind,item)=>`<div class="planning-actions"><button type="button" data-planning-edit="${kind}" data-id="${escape(item.id||year)}" aria-label="تعديل ${escape(item.name)}">تعديل</button><button type="button" data-planning-action="${kind}${item.archived?'Restore':'Archive'}" data-id="${escape(item.id||year)}">${item.archived?'استعادة':'أرشفة'}</button><button type="button" class="danger" data-planning-action="${kind}Delete" data-id="${escape(item.id||year)}">حذف</button></div>`;
  const add=(kind,areaId='',planId='',parentId='')=>`<button type="button" class="list-toggle" data-planning-add="${kind}" data-area="${escape(areaId)}" data-plan="${escape(planId)}" data-parent="${escape(parentId)}">+ ${kind==='areaPlan'?'خطة':'هدف'}</button>`;
  function goalCard(goal,all,seen=new Set()) {
    if(seen.has(goal.id))return '';const visited=new Set(seen);visited.add(goal.id);
    const period=goalPeriod(goal),end=period.end<clock()?period.end:clock(),complete=goal.metric==='manual'||period.start>end||store.hasRange(period.start,end);
    const stats=complete?goalStats(catalog,days,goal,clock()):null;
    const habits=catalog.habits.filter(h=>!h.deletedAt&&versionAt(h,clock())?.goalId===goal.id);
    const tasks=Object.values(days).flatMap(day=>day.tasks.filter(t=>!t.deleted&&t.goalId===goal.id).map(t=>({...t,date:day.date})));
    const children=all.filter(g=>g.parentId===goal.id);
    return `<details class="planning-goal" data-tree-key="goal:${escape(goal.id)}"><summary><span><small>${{annual:'سنوي',monthly:'شهري',weekly:'أسبوعي'}[goal.level]} · <bdi>${escape(goal.period)}</bdi>${goal.archived?' · مؤرشف':''}</small><strong>${escape(goal.name)}</strong>${stats?`<span class="goal-track"><span style="width:${stats.percentage}%"></span></span>`:''}</span><span class="planning-progress">${stats?number(stats.percentage)+'٪':'—'}</span></summary><div class="planning-body">${stats?`<p class="planning-caption">${number(stats.done)} / ${number(stats.total)} · ${goal.metric==='manual'?'تقدم يدوي':'إنجازات مرتبطة'}</p>`:'<p class="planning-caption">بيانات التقدم لم تكتمل بعد</p>'}${actions('goal',goal)}${!goal.archived&&goal.level!=='weekly'?add('goal',goal.areaId,goal.planId||'',goal.id):''}${children.map(g=>goalCard(g,all,visited)).join('')}${habits.length||tasks.length?`<details class="planning-links"><summary>العادات والمهام المرتبطة</summary><ul>${habits.map(h=>`<li>${escape(versionAt(h,clock()).name)} · عادة</li>`).join('')}${tasks.map(t=>`<li>${escape(t.name)} · <bdi>${t.date}</bdi></li>`).join('')}</ul><small>المهام من السجلات المحمّلة</small></details>`:''}</div></details>`;
  }
  function goalGroup(goals) {
    const ids=new Set(goals.map(g=>g.id));
    return goals.filter(g=>!g.parentId||!ids.has(g.parentId)).map(g=>goalCard(g,goals)).join('')||'<p class="list-empty">لا توجد أهداف</p>';
  }
  function render(){
    const state=store.status(),key=[state.dataVersion,year,archived,state.readError||''].join(':');if(key===viewKey)return;viewKey=key;
    ({catalog,days}=store.snapshot());const known=new Set([...root.querySelectorAll('details[data-tree-key]')].map(d=>d.dataset.treeKey)),opened=new Set([...root.querySelectorAll('details[open][data-tree-key]')].map(d=>d.dataset.treeKey));
    const currentYear=Number(clock().slice(0,4));
    const years=[...new Set([String(currentYear-1),String(currentYear),String(currentYear+1),year,...Object.keys(catalog.plans),...(catalog.areaPlans||[]).map(p=>p.year),...catalog.goals.map(g=>g.period.slice(0,4))])].sort();
    $('#planPeriod').innerHTML=`<label>السنة <select id="planYear" aria-label="سنة الخطة">${years.map(y=>`<option ${y===year?'selected':''}>${y}</option>`).join('')}</select></label>${catalog.plans[year]&&!catalog.planState?.[year]?.deletedAt?`<div class="annual-plan"><strong>${escape(catalog.plans[year])}</strong>${actions('plan',{name:catalog.plans[year],archived:catalog.planState?.[year]?.archived})}</div>`:'<button type="button" class="list-toggle" data-planning-edit="plan">خطة السنة</button>'}`;
    $('#archivedGoals').textContent=archived?'إخفاء المؤرشفة':'عرض المؤرشفة';$('#archivedGoals').setAttribute('aria-pressed',archived);
    const goals=catalog.goals.filter(g=>live(g)&&g.period.startsWith(year));
    const areas=catalog.areas.filter(a=>live(a)&&(archived||!a.archived));
    $('#goalList').innerHTML=areas.map(area=>{
      const plans=(catalog.areaPlans||[]).filter(p=>live(p)&&p.areaId===area.id&&p.year===year&&(archived||!p.archived));
      const areaGoals=goals.filter(g=>g.areaId===area.id&&(archived||!g.archived));
      return `<section class="planning-area"><header><h3>${escape(area.name)}</h3>${area.archived?'<small>مؤرشف</small>':''}</header>${actions('area',area)}${!area.archived?`<div class="planning-additions">${add('areaPlan',area.id)}${add('goal',area.id)}</div>`:''}${plans.map(p=>`<details class="planning-plan" data-tree-key="plan:${escape(p.id)}" open><summary><strong>${escape(p.name)}</strong>${p.archived?'<small>مؤرشفة</small>':''}</summary><div class="planning-body">${actions('areaPlan',p)}${!p.archived&&!area.archived?add('goal',area.id,p.id):''}${goalGroup(areaGoals.filter(g=>g.planId===p.id))}</div></details>`).join('')}${areaGoals.some(g=>!g.planId)?`<div class="planning-unassigned"><h4>أهداف المجال</h4>${goalGroup(areaGoals.filter(g=>!g.planId))}</div>`:!plans.length?'<p class="list-empty">أضف خطة أو هدفًا لهذا المجال</p>':''}</section>`;
    }).join('')||'<p class="list-empty">أضف مجالًا لبدء التخطيط</p>';
    // Old orphaned metadata, if present, remains visible and editable rather than silently disappearing.
    const unassigned=goals.filter(g=>!catalog.areas.some(a=>live(a)&&a.id===g.areaId)||(g.planId&&!(catalog.areaPlans||[]).some(p=>live(p)&&p.id===g.planId)));
    if(unassigned.length)$('#goalList').insertAdjacentHTML('beforeend',`<section class="planning-area"><h3>علاقات تحتاج مراجعة</h3>${goalGroup(unassigned)}</section>`);
    root.querySelectorAll('details[data-tree-key]').forEach(d=>{if(known.has(d.dataset.treeKey)||d.dataset.treeKey.startsWith('goal:'))d.open=opened.has(d.dataset.treeKey);});
    for(const g of goals.filter(g=>g.metric==='linked')){
      const p=goalPeriod(g),end=p.end<clock()?p.end:clock(),key=p.start+':'+end;
      if(p.start>end||store.hasRange(p.start,end)||loading.has(key))continue;
      loading.add(key);const current=generation;
      void store.ensureRange(p.start,end).then(()=>{loading.delete(key);if(current===generation){$('#planningError').replaceChildren();render();}}).catch(()=>{loading.delete(key);if(current===generation)$('#planningError').innerHTML='تعذر تحميل تقدم الأهداف. <button type="button" class="list-toggle" data-planning-retry>إعادة المحاولة</button>';});
    }
  }
  const field=(label,name,value='',type='text',extra='')=>`<label class="add-field"><span>${label}</span><input name="${name}" type="${type}" value="${escape(value)}" ${extra}></label>`;
  const select=(label,name,items,value)=>`<label class="add-field"><span>${label}</span><select name="${name}">${items.map(i=>`<option value="${escape(i.id)}" ${i.id===value?'selected':''}>${escape(i.name)}</option>`).join('')}</select></label>`;
  function close(){editor?.close();editor?.remove();editor=null;}
  function openEditor(kind,id='',context={}) {
    close();({catalog,days}=store.snapshot());let value,contents='',command=null;
    if(kind.endsWith('Delete')||kind.endsWith('Archive')||kind.endsWith('Restore')){
      const base=kind.replace(/(Delete|Archive|Restore)$/,'');value=base==='plan'?{name:catalog.plans[year]}:base==='areaPlan'?(catalog.areaPlans||[]).find(p=>p.id===id):base==='area'?catalog.areas.find(a=>a.id===id):catalog.goals.find(g=>g.id===id);
      command={type:kind,id,year};contents=`<p>${escape(value?.name)}</p><p class="planning-caption">${kind.endsWith('Delete')?'لن تُحذف السجلات التاريخية. إذا كانت هناك عناصر تابعة، سيُرفض الحذف؛ يمكنك أرشفة العنصر بدلًا منه.':'الأرشفة لا تحذف العناصر التابعة أو سجلات الإنجاز.'}</p>`;
    } else if(kind==='area'){
      value=catalog.areas.find(a=>a.id===id)||{name:''};contents=field('اسم المجال','name',value.name,'text','required maxlength="120"');
    } else if(kind==='plan'){
      contents=field('اسم خطة السنة','name',catalog.plans[year]||'','text','required maxlength="120"');
    } else if(kind==='areaPlan'){
      value=(catalog.areaPlans||[]).find(p=>p.id===id)||{name:'',areaId:context.areaId||catalog.areas.find(a=>live(a)&&!a.archived)?.id,year};
      contents=field('اسم الخطة','name',value.name,'text','required maxlength="120"')+select('المجال','areaId',catalog.areas.filter(a=>live(a)&&(!a.archived||id&&a.id===value.areaId)),value.areaId)+field('السنة','year',value.year,'number','min="2000" max="2099" required');
    } else {
      const parent=catalog.goals.find(g=>g.id===context.parentId);
      const firstMonday=parent?.level==='monthly'?monday(parent.period+'-01'):null;
      value=catalog.goals.find(g=>g.id===id)||{name:'',areaId:context.areaId||catalog.areas.find(a=>live(a)&&!a.archived)?.id,planId:context.planId||'',parentId:context.parentId||'',level:parent?.level==='annual'?'monthly':parent?'weekly':'annual',period:parent?.level==='annual'?parent.period+'-01':parent?(firstMonday.startsWith(parent.period)?firstMonday:addDays(firstMonday,7)):year,metric:'manual',target:1,value:0};
      if(!value.areaId){$('#planningError').textContent='أضف مجالًا نشطًا أولًا.';return openEditor('area');}
      contents=field('اسم الهدف','name',value.name,'text','required maxlength="120"')+select('المجال','areaId',catalog.areas.filter(a=>live(a)&&(!a.archived||id&&a.id===value.areaId)),value.areaId)+select('الخطة','planId',[],value.planId)+select('نوع الهدف','level',[{id:'annual',name:'سنوي'},{id:'monthly',name:'شهري'},{id:'weekly',name:'أسبوعي'}],value.level)+field('الفترة','period',value.period,value.level==='annual'?'number':value.level==='monthly'?'month':'date','required')+select('الهدف الأعلى','parentId',[],value.parentId)+select('مقياس التقدم','metric',[{id:'manual',name:'تقدم يدوي'},{id:'linked',name:'إنجازات العادات والمهام'}],value.metric)+field('المستهدف','target',value.target,'number','min="1" max="100000" step="any" required')+`<div data-manual ${value.metric==='linked'?'hidden':''}>${field('المنجز','value',value.value,'number','min="0" max="100000" step="any" required')}</div>`;
    }
    editor=document.createElement('dialog');editor.className='planning-editor';editor.setAttribute('aria-label',command?'تأكيد الإجراء':'إدارة '+({area:'المجال',plan:'خطة السنة',areaPlan:'الخطة',goal:'الهدف'}[kind]));
    editor.innerHTML=`<form><h3>${command?'تأكيد الإجراء':(id?'تعديل ':'إضافة ')+({area:'المجال',plan:'خطة السنة',areaPlan:'الخطة',goal:'الهدف'}[kind])}</h3>${contents}<p class="planning-error" role="alert"></p><div class="add-form-actions"><button type="submit" class="save-button">${command?'تأكيد':'حفظ'}</button><button type="button" class="cancel-button" data-planning-cancel>إلغاء</button></div></form>`;
    $('#khutayWindow')?.append(editor);if(!editor.isConnected)root.append(editor);
    const form=editor.querySelector('form');
    const choices=(initial=false)=>{
      if(kind!=='goal')return;const f=form.elements,plan=initial?value.planId:f.planId.value,parent=initial?value.parentId:f.parentId.value;
      const plans=(catalog.areaPlans||[]).filter(p=>live(p)&&(!p.archived||id&&p.id===value.planId)&&p.areaId===f.areaId.value&&p.year===f.period.value.slice(0,4));
      f.planId.innerHTML=`<option value="">بلا خطة</option>`+plans.map(p=>`<option value="${escape(p.id)}" ${p.id===plan?'selected':''}>${escape(p.name)}</option>`).join('');
      const parents=catalog.goals.filter(g=>live(g)&&(!g.archived||id&&g.id===value.parentId)&&g.id!==id&&g.areaId===f.areaId.value&&(g.planId||'')===f.planId.value&&((f.level.value==='monthly'&&g.level==='annual'&&f.period.value.startsWith(g.period))||(f.level.value==='weekly'&&g.level==='monthly'&&f.period.value.startsWith(g.period))));
      f.parentId.innerHTML='<option value="">مستقل</option>'+parents.map(p=>`<option value="${escape(p.id)}" ${p.id===parent?'selected':''}>${escape(p.name)}</option>`).join('');
    };
    choices(true);form.addEventListener('change',event=>{
      if(kind!=='goal')return;const f=form.elements;
      if(event.target.name==='level'){f.period.type=f.level.value==='annual'?'number':f.level.value==='monthly'?'month':'date';f.period.value=f.level.value==='annual'?year:f.level.value==='monthly'?year+clock().slice(4,7):monday(year+clock().slice(4));}
      form.querySelector('[data-manual]').hidden=f.metric.value==='linked';choices();
    });
    form.addEventListener('submit',event=>{
      event.preventDefault();const data=new FormData(form),cmd=command||{type:kind,id:id||crypto.randomUUID(),name:data.get('name'),year:data.get('year')||year};
      if(kind==='areaPlan')cmd.areaId=data.get('areaId');
      if(kind==='goal')Object.assign(cmd,{areaId:data.get('areaId'),planId:data.get('planId'),level:data.get('level'),period:data.get('period'),parentId:data.get('parentId'),metric:data.get('metric'),target:Number(data.get('target')),value:Number(data.get('value'))});
      try{store.dispatch(cmd);close();}catch(error){form.querySelector('[role="alert"]').textContent=messages[error.message]||'تعذر حفظ التعديل. راجع الحقول وحالة الاتصال.';}
    });
    form.querySelector('[data-planning-cancel]').onclick=close;editor.addEventListener('cancel',event=>{event.preventDefault();close();});editor.showModal();
  }
  root.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.planningAdd)openEditor(b.dataset.planningAdd,'',{areaId:b.dataset.area,planId:b.dataset.plan,parentId:b.dataset.parent});
    if(b.dataset.planningEdit)openEditor(b.dataset.planningEdit,b.dataset.id||'');
    if(b.dataset.planningAction)openEditor(b.dataset.planningAction,b.dataset.id);
    if(b.id==='archivedGoals'){archived=!archived;render();}
    if(b.hasAttribute('data-planning-retry')){viewKey='';$('#planningError').replaceChildren();render();}
    if(b.dataset.add==='goal')openEditor('goal');if(b.dataset.add==='area')openEditor('area');
  });
  root.addEventListener('change',e=>{if(e.target.id==='planYear'){year=e.target.value;render();}});
  return {render,openEditor,close,dispose(){generation++;close();},updateToday(){loading.clear();viewKey='';render();}};
}
