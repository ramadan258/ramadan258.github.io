export function confirmDirectoryDelete(name) {
  if(document.getElementById('directoryDeleteConfirm'))return Promise.resolve(false);
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.id='directoryDeleteConfirm';dialog.className='device-settings';dialog.dir='rtl';
    dialog.setAttribute('aria-labelledby','directoryDeleteTitle');dialog.setAttribute('aria-describedby','directoryDeleteDetails');
    dialog.innerHTML='<header><h2 id="directoryDeleteTitle">حذف العضو نهائيًا</h2></header><div class="device-settings-body"><p data-name></p><p id="directoryDeleteDetails">سيُحذف اسم العضو وصورته من الدليل نهائيًا. لا يمكن التراجع عن الحذف.</p><button type="button" data-confirm>حذف نهائي</button><button type="button" data-cancel>إلغاء</button></div>';
    dialog.querySelector('[data-name]').textContent='هل تريد حذف «'+name+'» من الدليل؟';
    let settled=false;const finish=value=>{if(settled)return;settled=true;dialog.close();dialog.remove();resolve(value);};
    dialog.querySelector('[data-confirm]').onclick=()=>finish(true);dialog.querySelector('[data-cancel]').onclick=()=>finish(false);
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});dialog.addEventListener('close',()=>finish(false));
    document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-cancel]').focus();
  });
}
