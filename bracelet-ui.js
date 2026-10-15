import {planner} from './planner-store.js';
import {createBraceletTracker} from './bracelet-model.mjs';
import {createPublicBraceletReader} from './public-bracelet.mjs';
const runtime=window.WA3I_SESSION;
const publicEnabled=window.__WA3I_SESSION_CONFIG?.publicBracelets===true;
const publicDeferred=window.__WA3I_SESSION_CONFIG?.publicBraceletsDeferred===true;
const labels={gold:'سوار ذهبي: إنجاز أمس ٩٠٪ فأكثر',green:'سوار أخضر: إنجاز أمس من ٧٠٪ إلى أقل من ٩٠٪',blue:'سوار أزرق: إنجاز أمس من ٥٠٪ إلى أقل من ٧٠٪',red:'سوار أحمر: إنجاز أمس أقل من ٥٠٪',neutral:'لا توجد عادات مؤهلة أمس',private:'مؤشر الالتزام خاص بصاحب الحساب'};
let owner=null,tracker=null,starting=null,epoch=0,state=null,timer=null;
let publicReader=null,publicStarting=null,publicTimer=null;
let todayTracker=null,todayState=null;
function label(){return state?.phase==='loading'?'جارٍ حساب سوارك':state?.phase==='unavailable'?'تعذر تحديث سوارك':labels[state?.tier||'neutral'];}
function clear(){epoch++;tracker?.close();tracker=null;todayTracker?.close();todayTracker=null;todayState=null;starting=null;owner=null;state=null;publicReader?.close();publicReader=null;publicStarting=null;clearInterval(publicTimer);publicTimer=null;clearInterval(timer);timer=null;document.querySelectorAll('[data-personal-bracelet],#braceletVisibilityNotice').forEach(el=>el.remove());paint();}
function view(memberId){
  const own=runtime.session===owner&&owner?.member.id===memberId;
  if(publicDeferred&&!(own&&owner.kind==='guest'))return {tier:'neutral',text:'الأساور العامة غير مفعّلة بعد؛ اللون المحايد ليس تقييمًا.'};
  if(own&&(owner.kind==='guest'||!publicEnabled))return {tier:state?.tier||'neutral',text:label()};
  if(publicEnabled){
    const result=publicReader?.view(memberId)||{tier:'neutral',phase:'loading'};
    const text=result.phase==='ready'?labels[result.tier]:result.phase==='stale'?'مؤشر قديم؛ ننتظر إعادة الحساب':result.phase==='loading'?'جارٍ تحميل مؤشر الالتزام':'مؤشر الالتزام غير متاح';
    return {tier:result.tier,text};
  }
  return {tier:'private',text:labels.private};
}
function personalAvatar(){
  document.querySelector('[data-personal-bracelet]')?.remove();
}
function visibilityNotice(){
  if(!publicEnabled||!owner||owner.kind==='guest'||document.getElementById('braceletVisibilityNotice'))return;
  const anchor=document.querySelector('#accountLabel')?.parentElement||document.querySelector('.member-canvas-hub');
  if(!anchor)return;
  const notice=document.createElement('p');notice.id='braceletVisibilityNotice';notice.className='bracelet-visibility-notice';
  notice.textContent='لون سوار أمس ظاهر للجميع؛ عاداتك وتقاريرك تبقى خاصة.';
  if(anchor.matches('.member-canvas-hub'))anchor.after(notice);else {anchor.title=notice.textContent;return;}
}
function paintToday(){
  const card=document.getElementById('personalProgress');if(!card)return;
  card.hidden=!owner;card.dataset.tier=todayState?.current?.tier||'neutral';
  const ready=todayState?.phase==='ready',value=todayState?.current;
  const format=new Intl.NumberFormat('ar-SA',{maximumFractionDigits:1});
  const description=ready?(value.required?`إنجاز عادات اليوم ${format.format(value.percentage)}٪، ${format.format(value.completed)} من ${format.format(value.required)}. فتح يومي.`:'لا توجد عادات مجدولة اليوم. فتح يومي.'):todayState?.phase==='unavailable'?'تعذر تحديث إنجاز اليوم. فتح يومي.':'جارٍ تحميل إنجاز اليوم. فتح يومي.';
  card.querySelector('[data-progress-description]').textContent=description;
  const meter=card.querySelector('.main-progress-meter');meter.setAttribute('title',description);meter.setAttribute('aria-label',description);
  const progress=card.querySelector('[role="progressbar"]');progress.setAttribute('aria-valuenow',ready?value.percentage||0:0);progress.setAttribute('aria-valuetext',description);progress.querySelector('span').style.height=(ready?value.percentage||0:0)+'%';
  card.dataset.phase=todayState?.phase||'loading';
  const chart=card.querySelector('[data-mini-columns]');
  if(!ready){chart.replaceChildren();return;}
  const existing=new Map([...chart.children].map(el=>[el.dataset.date,el]));
  const bars=todayState.groups.map(g=>{let bar=existing.get(g.start);if(!bar){bar=document.createElement('span');bar.className='mini-column';bar.dataset.date=g.start;bar.innerHTML='<i class="mini-done"></i><i class="mini-remaining"></i><small></small>';}
    bar.style.setProperty('--mini-done',(g.done||0)/2+'%');bar.style.setProperty('--mini-remaining',(g.remaining||0)/2+'%');bar.classList.toggle('is-future',g.future);bar.classList.toggle('is-empty',!g.required);bar.querySelector('small').textContent=format.format(Number(g.start.slice(-2)));return bar;});
  if(bars.length!==chart.children.length||bars.some((b,i)=>chart.children[i]!==b))chart.replaceChildren(...bars);
  card.querySelector('.main-progress-chart').setAttribute('aria-label',todayState.period?`فتح حصادي: ${todayState.period.start} إلى ${todayState.period.end}؛ الأقدم يمينًا.`:'فتح حصادي؛ لم يُحدد تاريخ الإطلاق بعد.');
}
function paint(){
  personalAvatar();visibilityNotice();paintToday();
  document.querySelectorAll('[data-bracelet-member-id]').forEach(image=>{
    const {tier:raw,text}=view(image.dataset.braceletMemberId),tier=raw==='private'?'neutral':raw;
    for(const name of ['gold','green','blue','red','neutral'])image.classList.toggle('habit-ring-'+name,tier===name);
    image.setAttribute('title',text);image.setAttribute('aria-label',(image.alt?image.alt+'، ':'')+text);image.dataset.braceletTier=tier;
  });
  // Older rendering entry points are compatibility readers, never status writers.
  window.refreshMemberStatusUI?.();
}
window.WA3I_BRACELET=Object.freeze({
  get(memberId){return view(memberId).tier;},
  label(memberId){return view(memberId).text;},
});
async function startPublic(){
  if(!publicEnabled||publicReader||publicStarting||!document.querySelector('[data-bracelet-member-id]:not([data-bracelet-member-id="guest"])'))return;
  const generation=epoch;
  const pending=(async()=>{
    try{
      await runtime.cloudReady();if(generation!==epoch)return;
      const fs=window.FB;
      publicReader=createPublicBraceletReader({listen:(next,error)=>fs.onSnapshot(fs.doc(fs.db,'publicBracelets','current'),{includeMetadataChanges:true},next,error),onChange:paint});
      publicTimer=setInterval(()=>publicReader?.refresh(),60000);
    }catch{if(generation===epoch)paint();}
  })();
  publicStarting=pending;try{await pending;}finally{if(publicStarting===pending)publicStarting=null;}
}
async function start(){
  const session=runtime.session;
  if(!session){void startPublic();paint();return;}
  if(session===owner){paint();void startPublic();return;}
  if(starting)return starting;
  clear();owner=session;const generation=epoch;
  state={tier:'neutral',phase:'loading'};paint();
  void startPublic();
  if(publicEnabled&&session.kind!=='guest'&&!document.getElementById('personalProgress')){
    return;
  }
  const pending=(async()=>{
    try{
      const store=await planner();if(generation!==epoch||runtime.session!==session)return;
      const isCurrent=()=>generation===epoch&&runtime.session===session;
      if(document.getElementById('personalProgress')){
        const {createMainProgressTracker}=await import('./main-progress-model.mjs');
        if(!isCurrent())return;
        todayTracker=createMainProgressTracker({store,isCurrent,launchDate:window.__WA3I_SESSION_CONFIG?.officialLaunchDate,onChange:next=>{todayState=next;paintToday();}});void todayTracker.refresh();
      }
      if(session.kind==='guest'||!publicEnabled&&!publicDeferred){tracker=createBraceletTracker({store,isCurrent,onChange:next=>{state=next;paint();}});await tracker.refresh();}
      if(generation!==epoch)return;
      timer=setInterval(()=>{void tracker?.refresh(true);void todayTracker?.refresh(true);},60000);
    }catch{if(generation===epoch){state={tier:'neutral',phase:'unavailable'};todayState={tier:'neutral',phase:'unavailable'};paint();}}
  })();
  starting=pending;try{await pending;}finally{if(starting===pending)starting=null;}
}
window.addEventListener('wa3i-session-cleared',clear);
window.addEventListener('wa3i-bracelet-start',()=>{void start();});
window.addEventListener('wa3i-permissions-changed',()=>{void start();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){void tracker?.refresh(true);void todayTracker?.refresh(true);publicReader?.refresh();}});
await runtime.ready;void start();
