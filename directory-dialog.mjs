export function confirmDirectoryHide(name) {
  if(document.getElementById('directoryHideConfirm'))return Promise.resolve(false);
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.id='directoryHideConfirm';dialog.className='device-settings';dialog.dir='rtl';
    dialog.setAttribute('aria-labelledby','directoryHideTitle');dialog.setAttribute('aria-describedby','directoryHideDetails');
    dialog.innerHTML='<header><h2 id="directoryHideTitle">إخفاء العضو من الدليل</h2></header><div class="device-settings-body"><p data-name></p><p id="directoryHideDetails">لن يُحذف حساب Firebase أو سجلات العهد أو التقارير. الإخفاء ليس محوًا للبيانات. يمكن إظهار العضو مجددًا من الإدارة.</p><button type="button" data-confirm>تأكيد الإخفاء</button><button type="button" data-cancel>إلغاء</button></div>';
    dialog.querySelector('[data-name]').textContent='هل تريد إخفاء «'+name+'»؟';
    let settled=false;const finish=value=>{if(settled)return;settled=true;dialog.close();dialog.remove();resolve(value);};
    dialog.querySelector('[data-confirm]').onclick=()=>finish(true);dialog.querySelector('[data-cancel]').onclick=()=>finish(false);
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});dialog.addEventListener('close',()=>finish(false));
    document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-cancel]').focus();
  });
}
