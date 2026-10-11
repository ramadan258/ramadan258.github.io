let APP_POST_LOGIN_BOOTSTRAP_DONE = false; let APP_HOME_BOOTSTRAP_TIMER = null;
function closeAllModals() {
  try {
    if (typeof closeMemberCanvasWindow === "function") closeMemberCanvasWindow();
  } catch {}
  document.querySelectorAll(".tafsir-modal-overlay.open").forEach((m) => {
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
  });
  restoreAdminPanelFromModal();
  ADMIN_UI_STATE.activePanel = null;
  setAdminMenuOpen(false);
  setMemberStatusAdminVisibility();
  setAhdAdminVisibility();
  setMemberManageAdminVisibility();
  if (typeof setQaAdminVisibility === "function") setQaAdminVisibility();
  if (typeof setLibraryAdminVisibility === "function") setLibraryAdminVisibility();
  syncBodyModalLock();
}
function warmFirebaseSoon() {
  if (typeof window.scheduleFirebaseWarmup === "function") {
    window.scheduleFirebaseWarmup();
    return;
  }

  if (typeof window.ensureFirebase === "function") {
    window.setTimeout(() => {
      window.ensureFirebase().catch(() => {});
    }, 220);
  }
}
function bootstrapPostLoginSystems() {
  if (APP_POST_LOGIN_BOOTSTRAP_DONE) return;
  APP_POST_LOGIN_BOOTSTRAP_DONE = true;

  if (typeof startSharedStreaksListener === "function") startSharedStreaksListener();
  if (typeof initMemberStatusSystem === "function") initMemberStatusSystem();
  if (typeof setupQaPage === "function") setupQaPage();
  if (typeof setupRecoveryLibrary === "function") setupRecoveryLibrary();
  if (typeof setupRescuePlanModal === "function") setupRescuePlanModal();
  if (typeof setupRescueCenterModal === "function") setupRescueCenterModal();
}
function startApp() {
  warmFirebaseSoon();
  restoreLocalAdminAccessForCurrentUser();
  if (typeof initMemberDirectorySystem === "function") {
    initMemberDirectorySystem({ activateRemote: true, renderMembers: true });
  }
  // The directory listener may already be running after a user switch, so apply
  // the permissions it has in memory instead of waiting for another snapshot.
  if (typeof syncStoredPermissionsForCurrentUser === "function") {
    syncStoredPermissionsForCurrentUser();
  }
  wireSwitchUserButton();
  wireAdminQuickMenu();
  wireMemberCanvasWindows();
  applyStandaloneViewMode();
  mountMemberCanvasMembersSection();
  hideGate();

  // Let the member cards paint first; the rest of the dashboard can initialize immediately after.
  if (APP_HOME_BOOTSTRAP_TIMER) {
    clearTimeout(APP_HOME_BOOTSTRAP_TIMER);
  }
  APP_HOME_BOOTSTRAP_TIMER = setTimeout(() => {
    APP_HOME_BOOTSTRAP_TIMER = null;
    initCountdown();
    initDailyFlow();
    if (typeof initQaPage === "function") initQaPage();
    setupAzkarModal();
    wireDashboardQuickActions();
    initAhdPage();

    if ("requestAnimationFrame" in window) {
      requestAnimationFrame(() => bootstrapPostLoginSystems());
    } else {
      setTimeout(bootstrapPostLoginSystems, 0);
    }
  }, 0);
}
function showIdentityToast(message) {
  const el = qs("#identityToast");
  if (!el) return;
  el.textContent = String(message || "").trim();
  if (!el.textContent) return;
  el.classList.add("open");
  window.clearTimeout(el._t);
  el._t = window.setTimeout(() => el.classList.remove("open"), 5200);
}
let PENDING_IDENTITY = null;
let IDENTITY_CONFIRM_WIRED = false;
let SWITCH_USER_WIRED = false;
function isAmjadMember(user) { return user?.id === 'member_9'; }
function isPrivilegedMember() { return false; }
let PENDING_ADMIN_USER=null,ADMIN_MODAL_WIRED=false;
function openAdminLoginModal(user) {
  PENDING_ADMIN_USER = user;
  warmFirebaseSoon();

  const modal = qs("#adminLoginModal");
  if(modal)document.body.append(modal);
  const title = qs("#adminLoginTitle");
  const sub = qs("#adminLoginSub");
  const status = qs("#adminLoginStatus");
  const email = qs("#adminLoginEmail");
  const pass = qs("#adminLoginPassword");

  if (status) status.textContent = "";
  if (email) email.value = "";
  if (pass) pass.value = "";

  if (title) title.textContent = "دخول أمجد";
  if (sub) sub.textContent = "أدخل بريد حساب Firebase وكلمة مروره. ";
  if (email) {
    email.type = "email";
    email.setAttribute("inputmode", "email");
    email.placeholder = "البريد الإلكتروني";
  }

  if (!modal) return;

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  setTimeout(() => {
    (email || pass)?.focus?.();
  }, 50);
}
function closeAdminLoginModal() {
  const modal = qs("#adminLoginModal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";qs("#adminLoginPassword").value="";qs("#adminLoginEmail").value="";
  PENDING_ADMIN_USER = null;
}
function wireAdminLoginModal() {
  if (ADMIN_MODAL_WIRED) return;
  ADMIN_MODAL_WIRED = true;

  const modal = qs("#adminLoginModal");
  const closeBtn = qs("#closeAdminLoginModal");
  const cancelBtn = qs("#adminLoginCancelBtn");
  const submitBtn = qs("#adminLoginSubmitBtn");
  const pass = qs("#adminLoginPassword");

  closeBtn?.addEventListener("click", closeAdminLoginModal);
  cancelBtn?.addEventListener("click", closeAdminLoginModal);
  submitBtn?.addEventListener("click", submitAdminLogin);

  pass?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitAdminLogin();
  });

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeAdminLoginModal();
  });
}
function initIdentityGate() {
  showGate();
  IDENTITY_MEMBERS_CACHE = readMembersFromDOM();
  renderIdentityGrid(IDENTITY_MEMBERS_CACHE);
  wireSwitchUserButton(); wireIdentityConfirmModal();
}
function memberNameById(id) { return memberById(id)?.name || ''; }
function memberById(id) { return IDENTITY_MEMBERS_CACHE.find((m) => m.id === id) || null; }
function wireSwitchUserButton() {
  if (SWITCH_USER_WIRED) return; SWITCH_USER_WIRED = true;
  qsa('[data-switch-user-btn]').forEach((btn) => {
    btn.setAttribute('aria-label', 'الخروج وتبديل المستخدم');
    btn.addEventListener('click', () => { void window.WA3I_SESSION.logout(); });
  });
}
function openIdentityConfirm(member) {
  if (!member) return;
  if(isAmjadMember(member)){wireAdminLoginModal();openAdminLoginModal(member);return;}
  PENDING_IDENTITY = member;
  qs('#identityConfirmAvatar').src = member.src;
  qs('#identityConfirmName').textContent = member.name;
  qs('#identityConfirmTitle').textContent = 'تسجيل الدخول';
  qs('#identityConfirmHint').textContent = '';
  qs('#identityConfirmPassword').value = '';
  qs('#identityConfirmError').textContent = '';
  qs('#identityConfirmError').classList.add('is-hidden');
  qs('#identityConfirmOverlay').classList.add('open');
  qs('#identityConfirmPassword').focus();
}
function closeIdentityConfirm() {
  qs('#identityConfirmOverlay').classList.remove('open');
  qs('#identityConfirmPassword').value = '';
  PENDING_IDENTITY = null;
}
function wireIdentityConfirmModal() {
  if (IDENTITY_CONFIRM_WIRED) return; IDENTITY_CONFIRM_WIRED = true;
  const yes = qs('#identityConfirmYes');
  const no = qs('#identityConfirmNo');
  no.addEventListener('click', closeIdentityConfirm);
  qs('#identityConfirmPassword').addEventListener('keydown', (event) => { if (event.key === 'Enter') yes.click(); });
  yes.addEventListener('click', async () => {
    const member = PENDING_IDENTITY;
    if (!member || yes.disabled) return;
    let password = qs('#identityConfirmPassword').value;
    qs('#identityConfirmPassword').value = '';
    yes.disabled = true; no.disabled = true;
    try {
      const session = await window.WA3I_SESSION.login(member, password);
      syncStoredPermissionsForCurrentUser();
      saveCurrentUser(session.member); closeIdentityConfirm(); startApp();
    } catch {
      const error = qs('#identityConfirmError'); error.textContent = 'تعذر الدخول. تحقق من كلمة المرور والاتصال.'; error.classList.remove('is-hidden');
    } finally { password = ''; yes.disabled = false; no.disabled = false; }
  });
}
window.addEventListener('wa3i-permissions-changed', () => {
  if (window.WA3I_SESSION.session) { WA3I_USER = window.WA3I_SESSION.session.member; updateUserBar(); }
  syncStoredPermissionsForCurrentUser();
  if (FB_STATE.isAdmin) renderMemberManageAdminList();
});
window.addEventListener('wa3i-session-cleared', () => {
  WA3I_USER = null; FB_STATE.isAdmin = false; LOCAL_ADMIN_ACCESS = { owner: '', qa: false, ahd: false, memberStatus: false, memberManage: false };
  WA3I_CTX.state = null;
  if (typeof breathInterval !== 'undefined' && breathInterval) clearInterval(breathInterval);
  if (COUNTDOWN_INTERVAL_ID) clearInterval(COUNTDOWN_INTERVAL_ID);
  if (APP_HOME_BOOTSTRAP_TIMER) clearTimeout(APP_HOME_BOOTSTRAP_TIMER);
  qsa('#memberManageList, #memberStatusAdminList, #qaAdminCategoryList, #qaAdminItemList, #ahdManageList, #libraryAdminList').forEach((node) => { node.innerHTML = ''; });
  setAdminMenuVisibility();
});

async function submitAdminLogin(){
    const button=qs('#adminLoginSubmitBtn'),status=qs('#adminLoginStatus');if(button.disabled)return;
    let email=qs('#adminLoginEmail').value.trim(),password=qs('#adminLoginPassword').value;button.disabled=true;
    qs('#adminLoginPassword').value='';
    try{const session=await window.WA3I_SESSION.loginAdmin(email,password);syncStoredPermissionsForCurrentUser();saveCurrentUser(session.member);closeAdminLoginModal();startApp();}
    catch{status.textContent='تعذر الدخول. تحقق من بيانات حساب أمجد والاتصال.';}
    finally{email='';password='';button.disabled=false;}
  }
