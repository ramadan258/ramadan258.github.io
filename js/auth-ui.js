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
  syncBodyModalLock();
}

let PENDING_ADMIN_USER = null;
let ADMIN_MODAL_WIRED = false;
let SWITCH_USER_WIRED = false;
let APP_POST_LOGIN_BOOTSTRAP_DONE = false;
let APP_HOME_BOOTSTRAP_TIMER = null;
const AMJAD_FIREBASE_UID = "OpXzKToeVbd9xp1KHuqnD95yXlm2";
const AMJAD_CANONICAL_USER = Object.freeze({ id: "member_9", name: "أمجد", kind: "member" });

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

function isAmjadMember(user) {
  const id = String(user?.id || "").trim();
  const name = String(user?.name || "").trim();
  return id === "member_9" || name === "أمجد";
}

function isPrivilegedMember(user) {
  return isAmjadMember(user);
}

function openAdminLoginModal(user) {
  PENDING_ADMIN_USER = user;
  warmFirebaseSoon();

  const modal = qs("#adminLoginModal");
  const title = qs("#adminLoginTitle");
  const sub = qs("#adminLoginSub");
  const status = qs("#adminLoginStatus");
  const email = qs("#adminLoginEmail");
  const pass = qs("#adminLoginPassword");

  if (status) status.textContent = "";
  if (email) email.value = "";
  if (pass) pass.value = "";

  if (title) title.textContent = "دخول أمجد";
  if (sub) sub.textContent = "أدخل بريد حساب Firebase وكلمة مروره. كلمة مرور العضو القصيرة لا تعمل هنا.";
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
  document.body.style.overflow = "";
  PENDING_ADMIN_USER = null;
}

async function submitAdminLogin() {
  const pending = PENDING_ADMIN_USER;
  const status = qs("#adminLoginStatus");
  const email = (qs("#adminLoginEmail")?.value || "").trim();
  const password = String(qs("#adminLoginPassword")?.value || "");

  if (!email || !password) {
    if (status) status.textContent = "اكتب البريد وكلمة المرور.";
    return;
  }

  const trySignIn = async () => {
    if (!fbAvailable()) throw new Error("FB_NOT_READY");
    const { auth, setPersistence, browserSessionPersistence, inMemoryPersistence, signInWithEmailAndPassword } = window.FB;

    await setPersistence(auth, browserSessionPersistence || inMemoryPersistence);
    return signInWithEmailAndPassword(auth, email, password);
  };

  try {
    if (status) status.textContent = "جاري تسجيل الدخول…";
    const credential = await trySignIn();
    if (credential?.user?.uid !== AMJAD_FIREBASE_UID) {
      try { await window.FB.signOut(window.FB.auth); } catch {}
      throw new Error("ADMIN_ACCOUNT_MISMATCH");
    }

    if (pending) {
      // An administrator can intentionally switch away from a member account on
      // the same device, so replace that member's local-only device binding.
      clearLocalMemberBinding();
      writeLocalMemberBinding(AMJAD_CANONICAL_USER.id);
      grantLocalAdminAccess({
        owner: AMJAD_CANONICAL_USER.id,
        memberStatus: true,
        ahd: true,
        memberManage: true,
        qa: true,
      });
      markMemberSessionAuthorized(AMJAD_CANONICAL_USER.id);
      saveCurrentUser(AMJAD_CANONICAL_USER);
      closeAdminLoginModal();
      startApp();
    }
  } catch (e) {
    if (String(e?.message || "").includes("FB_NOT_READY")) {
      if (status) status.textContent = "انتظر لحظة…";
      setTimeout(submitAdminLogin, 250);
      return;
    }
    const code = String(e?.code || e?.message || "").toLowerCase();
    if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
      if (status) status.textContent = "البريد أو كلمة مرور حساب Firebase غير صحيحين.";
      return;
    }
    if (code.includes("network") || code.includes("offline") || code.includes("unavailable")) {
      if (status) status.textContent = "تعذّر الاتصال بـ Firebase. تحقق من الإنترنت ثم أعد المحاولة.";
      return;
    }
    if (code.includes("unauthorized-domain")) {
      if (status) status.textContent = "نطاق الموقع غير مسموح له في Firebase. أعد تحميل الصفحة ثم جرّب.";
      return;
    }
    if (code.includes("too-many-requests")) {
      if (status) status.textContent = "تم إيقاف المحاولات مؤقتًا. انتظر قليلًا ثم جرّب مرة أخرى.";
      return;
    }
    if (code.includes("user-disabled")) {
      if (status) status.textContent = "حساب Firebase هذا موقوف حاليًا.";
      return;
    }
    if (code.includes("admin_account_mismatch")) {
      if (status) status.textContent = "هذا البريد لا يخص حساب أمجد الإداري في Firebase.";
      return;
    }
    if (code.includes("bound_to_other_member")) {
      if (status) status.textContent = "هذا الحساب مربوط بعضو آخر داخل الموقع. تواصل مع أمجد لتصحيح الربط.";
      return;
    }
    if (status) status.textContent = "تعذّر تسجيل الدخول الآن. أعد تحميل الصفحة ثم جرّب مرة أخرى.";
  }
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

function wireSwitchUserButton() {
  if (SWITCH_USER_WIRED) return;
  SWITCH_USER_WIRED = true;

  qsa("[data-switch-user-btn]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      closeAllModals();
      if (COUNTDOWN_INTERVAL_ID) {
        clearInterval(COUNTDOWN_INTERVAL_ID);
        COUNTDOWN_INTERVAL_ID = null;
      }

      clearCurrentUser();

      try {
        if (fbAvailable()) await window.FB.signOut(window.FB.auth);
      } catch {}

      initIdentityGate();
    });
  });
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

function initIdentityGate() {
  showGate();

  IDENTITY_MEMBERS_CACHE = readMembersFromDOM();
  const members = IDENTITY_MEMBERS_CACHE;
  resetLocalStreaksForAllMembersOnce();
  renderIdentityGrid(members);
  warmFirebaseSoon();

  const lastBox = qs("#identityLast");
  if (lastBox) {
    lastBox.classList.add("is-hidden");
    lastBox.innerHTML = "";
  }

  wireGuestEntry();
  wireSwitchUserButton();
  wireIdentityConfirmModal();
}

let PENDING_IDENTITY = null;
let IDENTITY_CONFIRM_WIRED = false;

function memberNameById(memberId) {
  const list = IDENTITY_MEMBERS_CACHE || [];
  const m = list.find((x) => x.id === String(memberId));
  return m?.name || "";
}

function memberById(memberId) {
  const list = IDENTITY_MEMBERS_CACHE || [];
  return list.find((x) => x.id === String(memberId)) || null;
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

function openIdentityConfirm(user, options = {}) {
  const requiresPassword = Boolean(options?.requiresPassword);
  PENDING_IDENTITY = { user, requiresPassword };
  const overlay = qs("#identityConfirmOverlay");
  const img = qs("#identityConfirmAvatar");
  const name = qs("#identityConfirmName");
  const title = qs("#identityConfirmTitle");
  const hint = qs("#identityConfirmHint");
  const passwordWrap = qs("#identityConfirmPasswordWrap");
  const password = qs("#identityConfirmPassword");
  const err = qs("#identityConfirmError");
  const resetActions = qs("#identityResetActions");
  const yes = qs("#identityConfirmYes");
  const no = qs("#identityConfirmNo");

  if (err) {
    err.classList.add("is-hidden");
    err.textContent = "";
  }
  if (resetActions) resetActions.classList.add("is-hidden");
  if (title) title.textContent = requiresPassword ? "دخول العضو" : "تأكيد الدخول";
  if (hint) {
    hint.textContent = requiresPassword
      ? "بعد اختيار صورتك، أدخل كلمة المرور الخاصة بك للمتابعة."
      : "تأكد أنك اخترت اسمك الصحيح، ثم تابع الدخول.";
  }
  if (passwordWrap) passwordWrap.style.display = requiresPassword ? "" : "none";
  if (password) password.value = "";
  if (yes) yes.disabled = false;
  if (no) no.disabled = false;
  if (yes) yes.textContent = requiresPassword ? "دخول" : "نعم هذا أنا";

  if (img) {
    img.src = user?.src || "";
    img.alt = user?.name || "عضو";
  }
  if (name) name.textContent = user?.name || "—";

  overlay?.classList.add("open");
  setTimeout(() => {
    if (requiresPassword) password?.focus?.();
    else yes?.focus?.();
  }, 50);
}

function closeIdentityConfirm() {
  qs("#identityConfirmOverlay")?.classList.remove("open");
  const passwordWrap = qs("#identityConfirmPasswordWrap");
  const password = qs("#identityConfirmPassword");
  const err = qs("#identityConfirmError");
  if (passwordWrap) passwordWrap.style.display = "";
  if (password) password.value = "";
  if (err) {
    err.textContent = "";
    err.classList.add("is-hidden");
  }
  PENDING_IDENTITY = null;
}

async function resetDeviceIdentity() {
  try { clearCurrentUser(); } catch {}
  try { clearLocalMemberBinding(); } catch {}
  try {
    if (fbAvailable()) await window.FB.signOut(window.FB.auth);
  } catch {}
  window.location.reload();
}

function wireIdentityConfirmModal() {
  if (IDENTITY_CONFIRM_WIRED) return;
  IDENTITY_CONFIRM_WIRED = true;

  const yes = qs("#identityConfirmYes");
  const no = qs("#identityConfirmNo");
  const password = qs("#identityConfirmPassword");
  const reset = qs("#identityResetBtn");
  const resetCancel = qs("#identityResetCancel");

  if (no) no.addEventListener("click", () => closeIdentityConfirm());
  if (resetCancel) resetCancel.addEventListener("click", () => closeIdentityConfirm());
  if (reset) reset.addEventListener("click", () => resetDeviceIdentity());
  password?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") yes?.click();
  });

  if (yes) {
    yes.addEventListener("click", async () => {
      const pending = PENDING_IDENTITY;
      const user = pending?.user;
      const requiresPassword = Boolean(pending?.requiresPassword);
      if (!user) return;

      const errBox = qs("#identityConfirmError");
      const resetActions = qs("#identityResetActions");
      const typedPassword = String(qs("#identityConfirmPassword")?.value || "").trim();
      yes.disabled = true;
      if (no) no.disabled = true;

      try {
        if (requiresPassword && !isValidMemberAccessPin(typedPassword)) {
          if (errBox) {
            errBox.textContent = "اكتب كلمة المرور من 1 إلى 5 أرقام.";
            errBox.classList.remove("is-hidden");
          }
          return;
        }

        if (requiresPassword) {
          const accessRecord = await resolveMemberAccessRecord(user.id);
          if (!accessRecord?.passwordHash) {
            if (errBox) {
              errBox.textContent = "هذا العضو لم تعد له كلمة مرور حاليًا، يمكنك الدخول مباشرة بعد تحديث الصفحة.";
              errBox.classList.remove("is-hidden");
            }
            return;
          }

          const typedHash = await sha256Hex(normalizeMemberAccessPin(typedPassword));
          if (typedHash !== accessRecord.passwordHash) {
            if (errBox) {
              errBox.textContent = "كلمة المرور غير صحيحة.";
              errBox.classList.remove("is-hidden");
            }
            return;
          }
        }

        markMemberSessionAuthorized(user.id);
        saveCurrentUser({ id: user.id, name: user.name, kind: "member" });
        const binding = await ensureMemberBinding(user.id);
        closeIdentityConfirm();
        startApp();
        if (binding?.localOnly) {
          showIdentityToast("تم الدخول بنجاح. بعض المزامنة السحابية غير متاحة حاليًا، لكن يمكنك استخدام الموقع بشكل طبيعي.");
        }
      } catch (e) {
        clearCurrentUser();
        const msg = String(e?.message || "");
        if (msg === "BOUND_TO_OTHER_MEMBER") {
          const bound = memberNameById(e.boundMemberId) || e.boundMemberId;
          if (errBox) {
            errBox.textContent = `هذا الجهاز مربوط مسبقًا بالعضو “${bound}”. لا يمكن تثبيت عضو آخر بدون إعادة ضبط الجهاز.`;
            errBox.classList.remove("is-hidden");
          }
          if (resetActions) resetActions.classList.remove("is-hidden");
        } else {
          if (errBox) {
            errBox.textContent = "تعذّر تأكيد الدخول الآن. جرّب مرة أخرى.";
            errBox.classList.remove("is-hidden");
          }
          showIdentityToast("تعذّر تأكيد الدخول. تحقق من الاتصال ثم أعد المحاولة.");
        }
      } finally {
        yes.disabled = false;
        if (no) no.disabled = false;
      }
    });
  }
}

async function tryAutoStartFromBinding() {
  if (!fbAvailable()) return false;
  try {
    const user = await ensureAnonSignedIn();
    const { db, doc, getDoc } = window.FB;
    const ref = doc(db, FIRESTORE_BINDINGS, user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;

    const data = snap.data() || {};
    const memberId = String(data.memberId || "");
    if (!memberId) return false;

    const member = memberById(memberId);
    if (!member) return false;

    if (!(await canResumeMemberSession(member.id))) return false;

    saveCurrentUser({ id: member.id, name: member.name, kind: "member" });
    return true;
  } catch {
    return false;
  }
}
