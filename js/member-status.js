// Compatibility with existing roster/pledge rendering; legacy ratings are never loaded.
function isStandardMemberId(id){return /^member_[0-9]+$/.test(String(id||''));}
function isCustomManagedMemberId(id){return /^custom_member_.+/.test(String(id||''));}
function getMemberStatus(id){return window.WA3I_BRACELET?.get(String(id))||'private';}
function memberStatusClass(status){return 'habit-ring-'+(['gold','green','blue','red'].includes(status)?status:'neutral');}
function memberStatusLabel(status){return ({gold:'سوار ذهبي',green:'سوار أخضر',blue:'سوار أزرق',red:'سوار أحمر',neutral:'لا توجد بيانات كافية',private:'مؤشر خاص بصاحب الحساب'})[status]||'لا توجد بيانات كافية';}
function memberStatusPriority(){return 0;}
function compareMembersByStatusThenName(a,b){return (a.name||'').localeCompare(b.name||'','ar');}
function setMemberStatusAdminVisibility(){}
function renderMemberStatusAdminList(){}
function refreshMemberStatusUI(){
  document.querySelectorAll('[data-bracelet-member-id]').forEach(image=>{
    const id=image.dataset.braceletMemberId,status=getMemberStatus(id),tier=['gold','green','blue','red'].includes(status)?status:'neutral';
    for(const name of ['gold','green','blue','red','neutral'])image.classList.toggle('habit-ring-'+name,tier===name);
    image.dataset.braceletTier=tier;
    const label=window.WA3I_BRACELET?.label(id)||memberStatusLabel(status);image.setAttribute('title',label);image.setAttribute('aria-label',(image.alt?image.alt+'، ':'')+label);
  });
}
function initMemberStatusSystem(){refreshMemberStatusUI();window.dispatchEvent(new Event('wa3i-bracelet-start'));}
