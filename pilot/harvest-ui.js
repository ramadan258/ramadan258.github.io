import {analyze,comparisonWindow,dayCount,quickPeriod,validatePeriod} from './harvest-model.mjs';
import {addDays,weekdays,weekday,dateKey} from './model.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numberFormat=new Intl.NumberFormat('ar-SA',{maximumFractionDigits:1});
const shortDateFormat=new Intl.DateTimeFormat('ar-SA',{calendar:'gregory',day:'numeric',month:'short',timeZone:'UTC'});
const monthFormat=new Intl.DateTimeFormat('ar-SA',{calendar:'gregory',month:'short',timeZone:'UTC'});
const number=value=>numberFormat.format(value);
const percent=value=>value===null?'—':number(value)+'٪';
const shortDate=key=>shortDateFormat.format(new Date(key+'T12:00:00Z'));
const dates=(start,end)=>start===end?shortDate(start):shortDate(start)+' — '+shortDate(end);
export function createHarvest({root,store,today=dateKey(),showDay}) {
  const $=selector=>root.querySelector(selector);
  let principal=quickPeriod(7,today),view={...principal,unit:null,selected:6},stack=[],quick=7,data=null;
  let active=false,loading=false,loadError=null,request=0,listsOpen=false;
  let analyzedKey='';
  let trendVisible=innerWidth>700,trendChosen=false;
  const chart=$('#weekChart'),scroll=$('#chartScroll');
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
  function setPeriod(period,choice='custom') {
    principal={...period};view={...period,unit:null,selected:dayCount(period.start,period.end)-1};stack=[];quick=choice;listsOpen=false;
    $('#customPeriod').hidden=choice!=='custom';$('#periodFrom').value=period.start;$('#periodTo').value=period.end;
    $('#periodError').textContent='';scroll.scrollLeft=0;void load();
  }
  function controls() {
    const {catalog}=store.snapshot();
    root.querySelectorAll('[data-period]').forEach(b=>{const selected=String(quick)===b.dataset.period;b.setAttribute('aria-pressed',selected);});
    $('#periodFrom').min=catalog.started;$('#periodFrom').max=today;$('#periodTo').min=$('#periodFrom').value||catalog.started;$('#periodTo').max=today;
    $('#harvestWeekLabel').textContent=stack.length?'تفاصيل الفترة':'حصادي';$('#harvestHeading').textContent=stack.length?titleUnit[view.unit]||'حصادي':'حصاد الفترة';
    $('#weekPeriod').textContent=dates(view.start,view.end)+' · '+view.end.slice(0,4);
    $('#harvestBack').hidden=!stack.length;$('#previousWeek').hidden=!!stack.length;$('#nextWeek').hidden=!!stack.length;
    $('#previousWeek').disabled=view.start<=catalog.started;$('#nextWeek').disabled=view.end>=today;
    $('#previousWeek').setAttribute('aria-label','الفترة السابقة');$('#nextWeek').setAttribute('aria-label','الفترة التالية');
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
    view.selected=Math.min(Math.max(0,view.selected),data.groups.length-1);
    const analytic=dayCount(view.start,view.end)>14;
    $('#chartTitle').textContent=analytic?'الالتزام خلال الفترة':'الالتزام بالعادات';
    $('#weeklyPercent').textContent=percent(data.stats.percentage);
    $('#weeklyHabitCount').textContent=`${number(data.stats.completed)} من ${number(data.stats.required)} إنجاز`;
    $('#weekComparison').textContent=analytic?'متوسط الفترة':view.end===today?'حتى الآن':'الفترة المحددة';
    root.classList.toggle('is-analytic',analytic);root.style.setProperty('--columns',data.groups.length);
    const compact=data.groups.length>7;chart.classList.toggle('is-compact',compact);
    chart.style.gridTemplateColumns=`repeat(${data.groups.length}, minmax(0, 1fr))`;
    $('#chartCanvas').style.minWidth=compact?data.groups.length*38+'px':'';
    const previousFocus=Number(document.activeElement?.dataset.harvestColumn);
    chart.innerHTML=data.groups.map((group,i)=>{
      const label=data.unit==='day'?dayCount(view.start,view.end)<=7?weekdays[weekday(group.start)]:number(Number(group.start.slice(-2))):data.unit==='week'?compact?number(i+1):shortDate(group.start):monthFormat.format(new Date(group.start+'T12:00:00Z'));
      return `<button class="chart-column${group.required?'':' is-empty'}" type="button" data-harvest-column="${i}" aria-label="${dates(group.start,group.end)}: ${percent(group.percentage)}${data.unit==='day'?'':'، فتح التفاصيل'}"><span class="column-percent">${compact?'':percent(group.percentage)}</span><span class="column-track"><span class="column-bar" style="--height:${group.percentage||0}%"></span><span class="column-badge" style="bottom:calc(${group.percentage||0}% + 9px)">${percent(group.percentage)}</span></span><span class="column-day">${escape(label)}</span></button>`;
    }).join('');
    if(Number.isInteger(previousFocus))chart.querySelector(`[data-harvest-column="${Math.min(previousFocus,data.groups.length-1)}"]`)?.focus({preventScroll:true});
    drawLines(analytic);renderSelection();renderStats();
    revealSelection();
  }
  function drawLines(analytic) {
    const svg=$('#chartLines'),width=1000,n=data.groups.length;
    const canvas=$('#chartCanvas').getBoundingClientRect();
    const tracks=[...chart.querySelectorAll('.column-track')].map(el=>el.getBoundingClientRect());
    const x=i=>canvas.width?(tracks[i].x+tracks[i].width/2-canvas.x)*width/canvas.width:(i+.5)*width/n,y=value=>200-value*2;
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
    svg.innerHTML=markup;$('#chartLegend').hidden=!analytic;
    $('#legendAverage').hidden=data.stats.percentage===null;$('#legendTrend').hidden=!enough||!trendVisible;
    $('#chartAxisTitle').textContent=titleUnit[data.unit];
  }
  function renderSelection() {
    if(!data)return;const group=data.groups[view.selected];
    chart.querySelectorAll('[data-harvest-column]').forEach(button=>{const selected=Number(button.dataset.harvestColumn)===view.selected;button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',selected);button.tabIndex=selected?0:-1;});
    $('#periodDetails').hidden=data.unit==='day';$('#dayDetails').hidden=data.unit!=='day';
    if(data.unit==='day') {
      showDay(group.start,listsOpen);$('#dayDetails .detail-lists').hidden=!listsOpen;
      $('#toggleDayDetails').textContent=listsOpen?'إخفاء التفاصيل':'عرض العادات والمهام';$('#toggleDayDetails').setAttribute('aria-expanded',listsOpen);
    } else {
      $('#selectedPeriodDate').textContent=dates(group.start,group.end);
      $('#selectedPeriodPercent').textContent=percent(group.percentage);
      $('#selectedPeriodCount').textContent=`${number(group.completed)} / ${number(group.required)} إنجاز`;
      $('#openPeriod').textContent=data.unit==='month'?'عرض الأسابيع':'عرض الأيام';
    }
  }
  function renderStats() {
    const s=data.stats,comparison=data.comparison;
    $('#weeklyTaskCount').textContent=`${number(s.taskCompleted)} من ${number(s.tasks)} مهمة`;
    $('#weeklyTaskPercent').textContent=percent(s.taskPercentage);
    $('#periodComparison').innerHTML=comparison?`<div class="comparison-values"><span>الحالية <strong>${percent(comparison.current.percentage)}</strong></span><span>السابقة <strong>${percent(comparison.previous.percentage)}</strong></span><strong class="comparison-delta">${comparison.difference>0?'+':''}${number(comparison.difference)} نقطة</strong></div><small>${dates(comparison.previous.start,comparison.previous.end)}${comparison.includesToday?` · مقارنة ${number(comparison.length)} يومًا مكتملًا`:''}</small>`:'<span class="section-count">لا توجد بيانات كافية للمقارنة</span>';
    const rows=[data.most?`<div><span>الأكثر انتظامًا</span><strong>${escape(data.most.name)}</strong><small>${percent(data.most.percentage)} · ${number(data.most.completed)} / ${number(data.most.required)}</small></div>`:'',
      data.least?`<div><span>الأقل انتظامًا</span><strong>${escape(data.least.name)}</strong><small>${percent(data.least.percentage)} · ${number(data.least.completed)} / ${number(data.least.required)}</small></div>`:'',
      data.bestWeek?`<div><span>أفضل أسبوع مكتمل</span><strong>${dates(data.bestWeek.start,data.bestWeek.end)}</strong><small>${percent(data.bestWeek.percentage)}</small></div>`:''];
    $('#periodInsights').innerHTML=rows.join('')||'<p class="list-empty">لا توجد جدولة كافية للترتيب</p>';
    $('#consistencyList').innerHTML=data.rankings.map(h=>`<div class="consistency-row"><span>${escape(h.name)}</span><span class="consistency-track"><span style="width:${h.percentage}%"></span></span><span>${number(h.completed)} / ${number(h.required)}</span></div>`).join('')||'<p class="list-empty">لا توجد عادات مجدولة</p>';
  }
  function select(index,open=false) {
    if(!data)return;view.selected=index;listsOpen=open&&data.unit==='day';renderSelection();
  }
  function revealSelection() {
    const button=chart.querySelector('[aria-pressed="true"]');if(!button)return;
    const container=scroll.getBoundingClientRect(),rect=button.getBoundingClientRect();
    if(rect.left<container.left)scroll.scrollLeft+=rect.left-container.left;
    else if(rect.right>container.right)scroll.scrollLeft+=rect.right-container.right;
  }
  function drill() {
    const group=data?.groups[view.selected];if(!group)return;
    if(data.unit==='day'){listsOpen=true;renderSelection();return;}
    stack.push({...view,scrollLeft:scroll.scrollLeft});
    view={start:group.start,end:group.end,unit:data.unit==='month'?'week':'day',selected:99};listsOpen=false;
    void load();$('#harvestBack').focus({preventScroll:true});
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.period) {
      if(button.dataset.period==='custom') {quick='custom';$('#customPeriod').hidden=false;controls();$('#periodFrom').focus();}
      else setPeriod(quickPeriod(Number(button.dataset.period),today),Number(button.dataset.period));
    }
    if(button.dataset.harvestColumn!==undefined){select(Number(button.dataset.harvestColumn),true);if(data.unit!=='day')drill();}
    if(button.id==='openPeriod')drill();
    if(button.id==='harvestBack'){view=stack.pop();listsOpen=false;render();scroll.scrollLeft=view.scrollLeft||0;chart.querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});}
    if(button.id==='toggleDayDetails'){listsOpen=!listsOpen;renderSelection();}
    if(button.id==='harvestRetry'){if(store.status().readError)location.reload();else void load();}
    if(button.id==='previousWeek'||button.id==='nextWeek') {
      const length=dayCount(principal.start,principal.end),direction=button.id==='previousWeek'?-1:1;
      const end=addDays(principal.end,direction*length);setPeriod({start:addDays(end>today?today:end,1-length),end:end>today?today:end},quick);
    }
  });
  root.addEventListener('change',event=>{
    if(event.target.id==='trendToggle'){trendVisible=event.target.checked;trendChosen=true;drawLines(dayCount(view.start,view.end)>14);}
    if(event.target.id==='periodFrom')$('#periodTo').min=event.target.value;
  });
  $('#customPeriod').addEventListener('submit',event=>{
    event.preventDefault();const start=$('#periodFrom').value,end=$('#periodTo').value;
    try{validatePeriod(start,end);if(end>today||start<store.snapshot().catalog.started)throw Error('OUTSIDE_HISTORY');setPeriod({start,end});}
    catch{$('#periodError').textContent='اختر بداية ونهاية صحيحتين ضمن سجلك.';}
  });
  chart.addEventListener('focusin',event=>{if(event.target.dataset.harvestColumn!==undefined)select(Number(event.target.dataset.harvestColumn));});
  chart.addEventListener('keydown',event=>{
    const index=Number(event.target.dataset.harvestColumn);if(!Number.isInteger(index))return;
    const n=data.groups.length,next=event.key==='ArrowRight'?(index+1)%n:event.key==='ArrowLeft'?(index+n-1)%n:event.key==='Home'?0:event.key==='End'?n-1:null;
    if(next!==null){event.preventDefault();select(next);chart.querySelector(`[data-harvest-column="${next}"]`).focus();revealSelection();}
  });
  let width=root.clientWidth;
  const resize=new ResizeObserver(()=>{
    if(!active||width===root.clientWidth)return;width=root.clientWidth;
    if(!trendChosen)trendVisible=width>650;analyzedKey='';render();
  });resize.observe(root);
  $('#periodFrom').value=principal.start;$('#periodTo').value=principal.end;
  return {render,activate(){active=true;void load();},deactivate(){active=false;},
    selectedDay:()=>data?.unit==='day'?data.groups[view.selected]?.start:null};
}
