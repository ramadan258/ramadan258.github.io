import {readDeviceData,createBackup,parseBackup,restoreBackup} from './device-data.mjs';

function download(backup,prefix='wa3i-backup') {
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=prefix+'-'+backup.createdAt.slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export async function openDeviceSettings() {
  let dialog=document.getElementById('deviceSettings');
  if(dialog){dialog.showModal();return;}
  const session=window.WA3I_SESSION,namespace=session.guestNamespace;
  dialog=document.createElement('dialog');dialog.id='deviceSettings';dialog.className='device-settings';dialog.dir='rtl';
  dialog.innerHTML='<header><h2>إعدادات الجهاز</h2><button type="button" data-close aria-label="إغلاق الإعدادات">×</button></header>'+
    '<div class="device-settings-body"><p>بياناتك على هذا الجهاز فقط. احتفظ بنسخة احتياطية دوريًا؛ مسح بيانات المتصفح قد يفقدها.</p>'+
    '<p>قد تحتوي النسخة على تقارير شخصية؛ احفظها في مكان آمن.</p><button type="button" data-export>تصدير نسخة احتياطية</button>'+
    '<button type="button" data-import>استيراد نسخة احتياطية</button><input type="file" accept="application/json,.json" hidden data-file>'+
    '<section data-review hidden><h3>مراجعة الاستعادة</h3><p data-summary></p><p>الاستعادة تستبدل البيانات الحالية، وليست دمجًا. أغلق تبويبات الموقع الأخرى أولًا. ستبقى البيانات السابقة محفوظة داخليًا.</p>'+
    '<button type="button" data-save-current>حفظ نسخة من البيانات الحالية</button><label><input type="checkbox" data-confirm>أوافق على استبدال بيانات هذا الجهاز بالنسخة المحددة</label>'+
    '<button type="button" data-restore disabled>استعادة البيانات</button></section><p role="status" aria-live="polite" data-status></p></div>';
  document.body.append(dialog);
  const find=selector=>dialog.querySelector(selector),status=find('[data-status]');let candidate=null,current=null,savedCurrent=false,busy=false,restored=false,selection=0;
  const message=text=>{status.textContent=text;};
  const currentData=async()=>{await session.flush();return readDeviceData(localStorage,namespace);};
  find('[data-close]').onclick=()=>{if(!busy&&!restored)dialog.close();};
  dialog.addEventListener('cancel',event=>{if(busy||restored)event.preventDefault();});
  find('[data-export]').onclick=async()=>{try{download(createBackup(await currentData()));message('تم تجهيز النسخة الاحتياطية للتنزيل.');}catch{message('تعذر تجهيز النسخة. تحقق من مساحة الجهاز وحفظ التعديلات.');}};
  find('[data-import]').onclick=()=>{if(busy||restored)return;find('[data-file]').value='';find('[data-file]').click();};
  const canRestore=()=>{find('[data-restore]').disabled=!candidate||!savedCurrent||!find('[data-confirm]').checked||busy;};
  find('[data-confirm]').onchange=canRestore;
  find('[data-file]').onchange=async event=>{
    if(busy||restored)return;
    const request=++selection;
    candidate=null;savedCurrent=false;current=null;find('[data-review]').hidden=true;find('[data-confirm]').checked=false;canRestore();
    const file=event.target.files?.[0];if(!file)return;
    try{
      if(file.size>20000000)throw Error('FILE_TOO_LARGE');
      const parsed=parseBackup(await file.text()),snapshot=await currentData();
      if(request!==selection)return;
      candidate=parsed;current=snapshot;
      const occupied=current.catalog.habits.length||Object.keys(current.days).length||Object.keys(current.forms).length;
      savedCurrent=!occupied;find('[data-save-current]').hidden=!occupied;
      find('[data-summary]').textContent=`العادات: ${candidate.data.catalog.habits.length}، الأيام المحفوظة: ${Object.keys(candidate.data.days).length}. تاريخ النسخة: ${new Date(candidate.createdAt).toLocaleDateString('ar')}.`;
      find('[data-review]').hidden=false;message('راجع النسخة وأكد الاستعادة.');canRestore();
    }catch{if(request!==selection)return;candidate=null;message('الملف غير صالح أو غير متوافق. لم تتغير بياناتك.');}
  };
  find('[data-save-current]').onclick=()=>{if(!current)return;download(createBackup(current),'wa3i-before-restore');savedCurrent=true;canRestore();message('احفظ الملف الذي تم تنزيله قبل تأكيد الاستعادة.');};
  find('[data-restore]').onclick=async()=>{
    if(!candidate||!savedCurrent||!find('[data-confirm]').checked||busy)return;
    busy=true;find('[data-import]').disabled=true;canRestore();
    try{
      await session.flush();
      await restoreBackup({storage:localStorage,namespace,backup:candidate,confirmed:true,expectedCurrent:JSON.stringify(current)});
      message('تم حفظ البيانات والتحقق من قراءتها بنجاح. أعد فتح الصفحة لعرضها.');
      restored=true;find('[data-close]').disabled=true;
      const button=document.createElement('button');button.type='button';button.textContent='فتح البيانات المستعادة';button.onclick=()=>location.reload();status.after(button);
      find('[data-review]').hidden=true;find('[data-export]').disabled=true;find('[data-import]').disabled=true;
      session.planner?.close();
    }catch(error){message(error.message==='LOCAL_DATA_CHANGED_REVIEW_AGAIN'?'تغيّرت بيانات الجهاز أثناء المراجعة. اختر الملف مجددًا؛ لم تُستبدل البيانات.':'تعذرت الاستعادة. لم تُستبدل بياناتك السابقة؛ تحقق من المساحة المتاحة.');}
    finally{busy=false;find('[data-import]').disabled=restored;canRestore();}
  };
  dialog.showModal();
}
