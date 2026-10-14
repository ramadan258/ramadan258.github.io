import {analyze,columnBalance,chartY,comparisonWindow,dayCount,validatePeriod} from './harvest-model.mjs';
import {weekdays,weekday,dateKey} from './model.mjs';
import {fixedPeriod,formatPeriodArabic,chartKeyboardIndex} from './harvest-calendar.mjs';
import {periodSummary,columnAction} from './harvest-presentation.mjs';
const numberFormat=new Intl.NumberFormat('ar-SA',{maximumFractionDigits:1});
const shortDateFormat=new Intl.DateTimeFormat('ar-SA',{calendar:'gregory',day:'numeric',month:'short',timeZone:'UTC'});
const monthFormat=new Intl.DateTimeFormat('ar-SA',{calendar:'gregory',month:'short',timeZone:'UTC'});
const number=value=>numberFormat.format(value);
const percent=value=>value===null?'—':number(value)+'٪';
const shortDate=key=>shortDateFormat.format(new Date(key+'T12:00:00Z'));
const dates=(start,end)=>start===end?shortDate(start):shortDate(start)+' — '+shortDate(end);
export function createHarvest({root,store,today=dateKey(),showDay,launchDate=window.__WA3I_SESSION_CONFIG?.officialLaunchDate||null}) {
  const $=selector=>root.querySelector(selector);
  let principal=launchDate?fixedPeriod(7,launchDate,today):{start:today,end:today},view={...principal,unit:null,selected:null,focus:0},stack=[],quick=launchDate?7:'custom',data=null,autoCurrent=true;
  let active=false,loading=false,loadError=null,request=0,detailDate=null,detailOrigin=null,detailScroll=0;
  let analyzedKey='';
  let trendVisible=innerWidth>700,trendChosen=false;
  const chart=$('#weekChart'),scroll=$('#chartScroll'),pane=root.closest('.window-content'),dialog=$('#dayDetails');
  const titleUnit={day:'الأيام',week:'الأسابيع',month:'الشهور'};
  function targetRanges() {
    const {catalog}=store.snapshot(),end=view.end<today?view.end:today;
    const start=view.start<catalog.started?catalog.started:view.start,comparison=comparisonWindow(view.start,view.end,today);
    const ranges=[{start,end}];
    if(comparison&&comparison.previous.start>=catalog.started)ranges.push(comparison.previous);
    return ranges;
  }
  async function load() {
    const generation=++request;loading=true;loadError=null;render();
    try{
      await Promise.all(targetRanges().filter(range=>range.start<=range.end).map(range=>store.ensureRange(range.start,range.end)));
      if(generation!==request)return;
    }catch{if(generation!==request)return;loadError='READ_FAILED';}
    finally{if(generation===request){loading=false;render();}}
  }
  function available(){return targetRanges().every(r=>r.start>r.end||store.hasRange(r.start,r.end));}
  function setPeriod(period,choice='custom',automatic=false) {
    closeDetails(false);
    autoCurrent=automatic;
    principal={...period};view={...period,unit:null,selected:null,focus:0};stack=[];quick=choice;
    $('#historicalPeriod').hidden=true;
    $('#customPeriod').hidden=choice!=='custom';$('#periodFrom').value=period.start;$('#periodTo').value=period.end;
    $('#periodError').textContent='';scroll.scrollLeft=0;void load();
  }
  function controls() {
    const {catalog}=store.snapshot();
    root.querySelectorAll('[data-period]').forEach(b=>{const selected=String(quick)===b.dataset.period;b.setAttribute('aria-checked',selected);b.disabled=b.dataset.period!=='custom'&&!launchDate;});
    $('#periodChoice').textContent=quick==='custom'?'فترة مخصصة':number(quick)+(quick===7?' أيام':' يومًا');
    $('#periodFrom').min=catalog.started;$('#periodFrom').removeAttribute('max');$('#periodTo').min=$('#periodFrom').value||catalog.started;$('#periodTo').removeAttribute('max');
    $('#harvestWeekLabel').textContent=stack.length?'تفاصيل الفترة':'';$('#harvestHeading').textContent=stack.length?titleUnit[view.unit]||'حصادي':'حصادي';
    $('#weekPeriod').textContent=formatPeriodArabic(view.start,view.end);
    root.dataset.periodStart=view.start;root.dataset.periodEnd=view.end;
    $('#harvestBack').hidden=!stack.length;$('#chooseHistoricalPeriod').disabled=!launchDate;
    $('#chooseHistoricalPeriod').hidden=!launchDate||fixedPeriod(quick==='custom'?7:Number(quick),launchDate,today).index===0;
    $('#historicalDate').min=launchDate||catalog.started;$('#historicalDate').max=today;
    $('#harvestPath').textContent=stack.length?dates(principal.start,principal.end):'';
  }
  function render() {
    if(!active)return;controls();
    const readError=store.status().readError;
    const ready=!loading&&!loadError&&!readError&&available();
    $('#harvestContent').hidden=!ready;$('#harvestLoadState').hidden=ready;
    $('#harvestLoadStateText').textContent=loadError||readError||!loading&&!available()?'تعذر تحميل الفترة كاملة':'جارٍ تحميل الفترة…';
    $('#harvestRetry').hidden=loading;root.setAttribute('aria-busy',loading);
    if(!ready)return;
    const analyticKey=[store.status().dataVersion,view.start,view.end,view.unit,root.clientWidth>=700?'wide':'narrow'].join(':');
    if(analyticKey===analyzedKey&&data){renderSelection();return;}
    const {catalog,days}=store.snapshot();
    data=analyze({catalog,days,...view,today,width:root.clientWidth});analyzedKey=analyticKey;
    if(!data.groups.length){$('#harvestContent').hidden=true;$('#harvestLoadState').hidden=false;$('#harvestLoadStateText').textContent='لا توجد أيام متاحة';$('#harvestRetry').hidden=true;return;}
    view.focus=Math.min(Math.max(0,view.focus),data.groups.length-1);
    const analytic=dayCount(view.start,view.end)>14;
    $('#chartTitle').textContent=analytic?'الالتزام خلال الفترة':'الالتزام بالعادات';
    root.classList.toggle('is-analytic',analytic);root.style.setProperty('--columns',data.groups.length);
    const compact=data.groups.length>7;chart.classList.toggle('is-compact',compact);
    chart.style.gridTemplateColumns=`repeat(${data.groups.length}, minmax(0, 1fr))`;
    $('#chartCanvas').style.minWidth=compact?data.groups.length*38+'px':'';
    renderColumns(compact);
    drawLines(analytic);renderSelection();renderStats();
  }
  function renderColumns(compact) {
    const existing=new Map([...chart.children].map(button=>[button.dataset.harvestKey,button]));
    const columns=data.groups.map((group,i)=>{
      const label=data.unit==='day'?dayCount(view.start,view.end)<=7?weekdays[weekday(group.start)]:number(Number(group.start.slice(-2))):data.unit==='week'?compact?number(i+1):shortDate(group.start):monthFormat.format(new Date(group.start+'T12:00:00Z'));
      const key=`${data.unit}:${group.start}:${group.end}`,balance=columnBalance(group);
      let button=existing.get(key);
      if(!button){
        button=document.createElement('button');button.type='button';button.className='chart-column';button.dataset.harvestKey=key;
        button.innerHTML='<span class="column-track" aria-hidden="true"><span class="column-positive"></span><span class="column-negative"></span><span class="column-value column-done-label"></span><span class="column-value column-remaining-label"></span><span class="column-empty">—</span></span><span class="column-day"></span>';
      }
      button.dataset.harvestColumn=i;button.dataset.date=group.start;button.classList.toggle('is-empty',!group.required);button.classList.toggle('is-future',group.future);
      button.classList.toggle('has-done',balance.done>0);button.classList.toggle('has-remaining',balance.remaining>0);
      button.style.setProperty('--done-height',(balance.done||0)/2+'%');
      button.style.setProperty('--remaining-height',(balance.remaining||0)/2+'%');
      button.setAttribute('aria-label',`${dates(group.start,group.end)}: ${group.future?'لم يحن بعد':group.required?`منجزة ${percent(balance.done)}، لم تُسجّل منجزة ${percent(balance.remaining)}`:'لا توجد عادات مجدولة'}${data.unit==='day'?'':'، فتح التفاصيل'}`);
      button.querySelector('.column-empty').textContent=group.future?'':'—';
      for(const [selector,text] of [['.column-done-label',percent(balance.done)],['.column-remaining-label',percent(balance.remaining)],['.column-day',label]]){
        const element=button.querySelector(selector);if(element.textContent!==text)element.textContent=text;
      }
      return button;
    });
    // Preserve column nodes/focus during achievement updates so only their heights transition.
    if(columns.length!==chart.children.length||columns.some((button,i)=>button!==chart.children[i]))chart.replaceChildren(...columns);
  }
  function drawLines(analytic) {
    const svg=$('#chartLines'),width=1000,n=data.groups.length;
    const canvas=$('#chartCanvas').getBoundingClientRect();
    const tracks=[...chart.querySelectorAll('.column-track')].map(el=>el.getBoundingClientRect());
    const x=i=>canvas.width?(tracks[i].x+tracks[i].width/2-canvas.x)*width/canvas.width:(i+.5)*width/n,y=chartY;
    let markup='';
    if(analytic&&data.stats.percentage!==null)markup+=`<line class="average-line" x1="0" x2="1000" y1="${y(data.stats.percentage)}" y2="${y(data.stats.percentage)}"/>`;
    const enough=analytic&&data.trend.filter(p=>p!==null).length>=2;
    $('#trendControl').hidden=!enough;$('#trendToggle').checked=trendVisible;
    if(enough&&trendVisible) {
      let segments=[],current=[];
      data.trend.forEach((value,i)=>{if(value===null){if(current.length>1)segments.push(current);current=[];}else current.push(`${x(i)},${y(value)}`);});
      if(current.length>1)segments.push(current);
      markup+=segments.map(segment=>`<polyline class="trend-line" points="${segment.join(' ')}"/>`).join('');
    }
    svg.innerHTML=markup;$('#chartLegend').hidden=false;
    $('#legendAverage').hidden=!analytic||data.stats.percentage===null;$('#legendTrend').hidden=!enough||!trendVisible;
    $('#chartAxisTitle').textContent=titleUnit[data.unit];
  }
  function renderSelection() {
    if(!data)return;
    chart.querySelectorAll('[data-harvest-column]').forEach(button=>{const index=Number(button.dataset.harvestColumn),selected=index===view.selected;button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',selected);button.tabIndex=index===view.focus?0:-1;});
    if(dialog.open&&detailDate)showDay(detailDate,true);
  }
  function renderStats() {
    const s=periodSummary(data,today);
    $('#summaryPercent').textContent=percent(s.percentage);
    $('#summaryHabits').textContent=number(s.completed)+' من '+number(s.required);
    $('#summaryDays').textContent=number(s.eligibleDays)+' من '+number(s.calendarDays);
    $('#summaryScope').textContent=formatPeriodArabic(s.start,s.end);
    $('#summaryMetrics').hidden=!s.hasSchedule;
    const note=quick!=='custom'&&view.start>today?'لم تبدأ الفترة بعد':!s.hasSchedule?'لا توجد عادات مجدولة خلال هذه الفترة':[
      s.unscheduledDays?`${number(s.unscheduledDays)} أيام دون جدولة مؤهلة`:'',
      s.futureDays?`${number(s.futureDays)} أيام مستقبلية`:''
    ].filter(Boolean).join(' · ');
    $('#summaryNote').textContent=note;$('#summaryNote').hidden=!note;
  }
  function focusColumn(index) {
    if(!data)return;view.focus=index;renderSelection();
  }
  function revealSelection() {
    const button=chart.querySelector(`[data-harvest-column="${view.focus}"]`);if(!button)return;
    const container=scroll.getBoundingClientRect(),rect=button.getBoundingClientRect();
    if(rect.left<container.left)scroll.scrollLeft+=rect.left-container.left;
    else if(rect.right>container.right)scroll.scrollLeft+=rect.right-container.right;
  }
  function activateColumn(index) {
    if(!data)return;autoCurrent=false;view.selected=index;view.focus=index;
    const action=columnAction(data,index);renderSelection();
    if(action.type==='day'){
      detailDate=action.date;detailOrigin=chart.querySelector(`[data-harvest-column="${index}"]`);detailScroll=pane?.scrollTop||0;
      showDay(detailDate,true);dialog.showModal();$('#closeDayDetails').focus({preventScroll:true});return;
    }
    stack.push({...view,scrollLeft:scroll.scrollLeft,scrollTop:pane?.scrollTop||0});
    view={start:action.start,end:action.end,unit:action.unit,selected:null,focus:0};scroll.scrollLeft=0;
    void load();$('#harvestBack').focus({preventScroll:true});
  }
  function closeDetails(restore=true) {
    if(!dialog.open)return;
    const origin=restore?detailOrigin:null,top=detailScroll;
    detailDate=null;detailOrigin=null;dialog.close();
    $('#selectedDayHabits').replaceChildren();$('#selectedDaySummary').replaceChildren();$('#selectedDayDate').textContent='';
    if(origin?.isConnected){origin.focus({preventScroll:true});if(pane)pane.scrollTop=top;}
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();closeDetails();});
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.period) {
      $('#periodMenu').hidePopover();
      if(button.dataset.period==='custom') {quick='custom';autoCurrent=false;$('#historicalPeriod').hidden=true;$('#customPeriod').hidden=false;controls();$('#periodFrom').focus();}
      else setPeriod(fixedPeriod(Number(button.dataset.period),launchDate,today),Number(button.dataset.period),true);
    }
    if(button.dataset.harvestColumn!==undefined)activateColumn(Number(button.dataset.harvestColumn));
    if(button.id==='harvestBack'&&stack.length){view=stack.pop();render();scroll.scrollLeft=view.scrollLeft||0;chart.querySelector(`[data-harvest-column="${view.focus}"]`)?.focus({preventScroll:true});if(pane)pane.scrollTop=view.scrollTop||0;}
    if(button.id==='closeDayDetails')closeDetails();
    if(button.id==='harvestRetry'){if(store.status().readError)location.reload();else void load();}
    if(button.id==='chooseHistoricalPeriod'){
      menu.hidePopover();$('#customPeriod').hidden=true;$('#historicalPeriod').hidden=false;
      $('#historicalDate').value=principal.start>today?today:principal.start;$('#historicalError').textContent='';$('#historicalDate').focus();
    }
  });
  root.addEventListener('change',event=>{
    if(event.target.id==='trendToggle'){trendVisible=event.target.checked;trendChosen=true;drawLines(dayCount(view.start,view.end)>14);}
    if(event.target.id==='periodFrom')$('#periodTo').min=event.target.value;
  });
  $('#customPeriod').addEventListener('submit',event=>{
    event.preventDefault();const start=$('#periodFrom').value,end=$('#periodTo').value;
    try{validatePeriod(start,end);if(start<store.snapshot().catalog.started)throw Error('OUTSIDE_HISTORY');setPeriod({start,end});}
    catch{$('#periodError').textContent='اختر بداية ونهاية صحيحتين ضمن سجلك.';}
  });
  $('#historicalPeriod').addEventListener('submit',event=>{
    event.preventDefault();const date=$('#historicalDate').value,length=quick==='custom'?7:Number(quick);
    try{if(!launchDate||date<launchDate||date>today)throw Error('INVALID_DATE');setPeriod(fixedPeriod(length,launchDate,date),length);}
    catch{$('#historicalError').textContent='اختر تاريخًا من الإطلاق وحتى اليوم؛ للسجلات الأقدم استخدم الفترة المخصصة.';}
  });
  chart.addEventListener('focusin',event=>{if(event.target.dataset.harvestColumn!==undefined)focusColumn(Number(event.target.dataset.harvestColumn));});
  chart.addEventListener('keydown',event=>{
    const index=Number(event.target.dataset.harvestColumn);if(!Number.isInteger(index))return;
    const next=chartKeyboardIndex(index,event.key,data.groups.length);
    if(next!==null){event.preventDefault();focusColumn(next);chart.querySelector(`[data-harvest-column="${next}"]`).focus({preventScroll:true});revealSelection();}
  });
  const menu=$('#periodMenu'),trigger=$('#periodTrigger');
  function positionMenu(){const box=trigger.getBoundingClientRect(),height=Math.min(300,window.innerHeight-20);menu.style.left=Math.max(8,Math.min(box.right-190,innerWidth-198))+'px';menu.style.top=Math.max(8,Math.min(box.bottom+6,innerHeight-height-8))+'px';}
  menu.addEventListener('toggle',event=>{const open=event.newState==='open';trigger.setAttribute('aria-expanded',open);if(open){positionMenu();menu.querySelector('[aria-checked="true"]')?.focus({preventScroll:true});}});
  menu.addEventListener('keydown',event=>{const choices=[...menu.querySelectorAll('button:not(:disabled)')],index=choices.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();choices[event.key==='Home'?0:event.key==='End'?choices.length-1:(index+(event.key==='ArrowDown'?1:choices.length-1))%choices.length]?.focus();}});
  scroll.addEventListener('scroll',()=>{if(menu.matches(':popover-open'))menu.hidePopover();},{passive:true});
  window.addEventListener('resize',()=>{if(menu.matches(':popover-open'))positionMenu();});
  let width=root.clientWidth;
  const resize=new ResizeObserver(()=>{
    if(!active||width===root.clientWidth)return;width=root.clientWidth;
    if(!trendChosen)trendVisible=width>650;analyzedKey='';render();
  });resize.observe(root);
  $('#periodFrom').value=principal.start;$('#periodTo').value=principal.end;
  return {render,updateToday(next){today=next;analyzedKey='';if(autoCurrent&&quick!=='custom'&&!stack.length)setPeriod(fixedPeriod(Number(quick),launchDate,today),quick,true);else void load();},activate(){active=true;view.selected=null;void load();},deactivate(){active=false;closeDetails(false);if(menu.matches(':popover-open'))menu.hidePopover();},
    selectedDay:()=>detailDate};
}
