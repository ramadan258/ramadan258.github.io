const runtime=window.WA3I_SESSION;
if(!runtime.adminMode){
  document.getElementById('openLocalSettings')?.addEventListener('click',async()=>{
    try{const {openDeviceSettings}=await import('./device-settings.mjs?v=restore2');await openDeviceSettings();}
    catch{alert('تعذر فتح الإعدادات. أعد المحاولة.');}
  });
}else{
  const shell=document.createElement('section');shell.id='adminDashboard';shell.className='panel';
  shell.innerHTML='<header><h1>إدارة الموحّدون</h1><a href="index.html" target="_top">الموقع</a><button type="button" id="adminSignOut" hidden>تسجيل الخروج</button></header><p id="adminAccessStatus" role="status">جارٍ التحقق من حساب الإدارة…</p>';
  document.body.prepend(shell);
  shell.append(document.getElementById('adminQuickMenu'));
  document.body.append(document.getElementById('adminPanelModal'));
  const refresh=()=>{
    const allowed=runtime.state==='member'&&runtime.session?.isAdmin===true;
    shell.dataset.authorized=String(allowed);document.getElementById('adminSignOut').hidden=!allowed;
    document.getElementById('adminAccessStatus').textContent=allowed?'أمجد — جلسة إدارية محمية':'يلزم تسجيل دخول أمجد لفتح الإدارة.';
  };
  document.getElementById('adminSignOut').onclick=()=>runtime.logout();
  window.addEventListener('wa3i-session-ready',refresh);window.addEventListener('wa3i-session-state',refresh);
  await runtime.ready.catch(()=>{});refresh();
  if(runtime.state!=='member'){window.wireAdminLoginModal();window.openAdminLoginModal({id:window.__WA3I_SESSION_CONFIG.adminMemberId});}
}
