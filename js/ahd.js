function setAhdAdminVisibility() {
  const wrap = qs("#ahdAdminWrap");
  const manageBox = qs("#ahdManageBox");
  const show = hasAhdAdminAccess() && ADMIN_UI_STATE.activePanel === "ahd";
  if (wrap) {
    wrap.style.display = show ? "block" : "none";
    wrap.setAttribute("aria-hidden", show ? "false" : "true");
  }
  if (manageBox) manageBox.style.display = show ? "block" : "none";
}

const PENDING_AHD_MEMBER_ACTIONS = new Set();
const LOCAL_AHD_MEMBERS_CACHE_KEY = "wa3i_ahd_members_cache_v1";
const AHD_MEMBERS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
let AHD_MEMBERS_CACHE_LOADED = false;
let AHD_REMOTE_SNAPSHOT_READY = false;
let AHD_CACHED_MEMBERS = new Map();

function loadAhdMembersCache() {
  if (AHD_MEMBERS_CACHE_LOADED) return;
  AHD_MEMBERS_CACHE_LOADED = true;

  try {
    const raw = localStorage.getItem(LOCAL_AHD_MEMBERS_CACHE_KEY);
    const cached = raw ? JSON.parse(raw) : null;
    const updatedAt = Number(cached?.updatedAt || 0);
    if (!cached || !updatedAt || Date.now() - updatedAt > AHD_MEMBERS_CACHE_MAX_AGE_MS) return;
    if (!Array.isArray(cached.memberIds)) return;

    FB_STATE.ahd = new Set(
      cached.memberIds.map((id) => String(id || "").trim()).filter(Boolean)
    );

    const cachedMembers = new Map();
    if (Array.isArray(cached.members)) {
      cached.members.forEach((member) => {
        const id = String(member?.id || "").trim();
        const name = String(member?.name || "").trim();
        const src = String(member?.src || "").trim();
        if (id && name && src) cachedMembers.set(id, { id, name, src });
      });
    }
    AHD_CACHED_MEMBERS = cachedMembers;
  } catch {}
}

function saveAhdMembersCache() {
  try {
    const members = Array.from(FB_STATE.ahd)
      .map((id) => {
        const member = FB_STATE.tribe.get(id) || AHD_CACHED_MEMBERS.get(id);
        if (!member?.name || !member?.src) return null;
        return { id, name: String(member.name), src: String(member.src) };
      })
      .filter(Boolean);

    localStorage.setItem(LOCAL_AHD_MEMBERS_CACHE_KEY, JSON.stringify({
      updatedAt: Date.now(),
      memberIds: Array.from(FB_STATE.ahd),
      members,
    }));
  } catch {}
}

function setAhdAdminFeedback(message, isError = false) {
  const el = qs("#ahdAdminFeedback");
  if (!el) return;
  el.textContent = String(message || "").trim();
  el.style.color = isError ? "#ffb4b4" : "";
}

async function ensureAhdAdminWriteAccess() {
  if (!hasAhdAdminAccess()) throw new Error("AHD_ACCESS_DENIED");

  if (!fbAvailable() && typeof window.ensureFirebase === "function") {
    await window.ensureFirebase();
  }
  if (!fbAvailable()) throw new Error("AHD_FIREBASE_UNAVAILABLE");

  const isFirebaseAdmin = Boolean(
    FB_STATE.isAdmin || window.FB?.auth?.currentUser?.uid === AMJAD_ADMIN_UID
  );
  if (isFirebaseAdmin) return;

  const memberId = String(currentUserId() || "").trim();
  if (!memberId || memberId === "guest") throw new Error("AHD_MEMBER_REQUIRED");

  const binding = await ensureMemberBinding(memberId);
  if (binding?.localOnly) throw new Error("AHD_BINDING_UNAVAILABLE");
  await getFreshFirebaseIdToken();
}

function ahdActionErrorMessage(error) {
  const code = String(error?.code || error?.message || "").toUpperCase();
  if (code.includes("AHD_ACCESS_DENIED")) return "لا تملك صلاحية إدارة عهد الثبات الآن.";
  if (code.includes("AHD_MEMBER_REQUIRED")) return "سجّل الدخول بعضو مفوّض أولًا.";
  if (code.includes("BOUND_TO_OTHER_MEMBER")) return "هذا الجهاز مرتبط بعضو آخر. استخدم تبديل المستخدم ثم سجّل الدخول مجددًا.";
  if (code.includes("AHD_BINDING_UNAVAILABLE") || code.includes("AHD_FIREBASE_UNAVAILABLE")) {
    return "تعذّر تأكيد ربط حسابك بـ Firebase. تحقق من الإنترنت ثم أعد المحاولة.";
  }
  if (code.includes("PERMISSION-DENIED") || code.includes("PERMISSION_DENIED") || code.includes("INSUFFICIENT PERMISSIONS")) {
    return "تعذّر الحفظ: الصلاحية لم تعد مفعلة في Firebase. اطلب من أمجد مراجعة صلاحية إدارة عهد الثبات.";
  }
  if (code.includes("NETWORK") || code.includes("OFFLINE") || code.includes("UNAVAILABLE")) {
    return "تعذّر الحفظ بسبب الاتصال. تحقق من الإنترنت ثم أعد المحاولة.";
  }
  return "تعذّر حفظ التغيير الآن. أعد المحاولة بعد لحظة.";
}

function getAhdResolvedState() {
  const resolvedMembers = [];
  const orphanIds = [];

  Array.from(FB_STATE.ahd)
    .map((id) => String(id || "").trim())
    .filter(Boolean)
    .forEach((id) => {
      const member = FB_STATE.tribe.get(id) || AHD_CACHED_MEMBERS.get(id);
      if (member && String(member.name || "").trim()) {
        resolvedMembers.push({ id, ...member });
      } else {
        orphanIds.push(id);
      }
    });

  resolvedMembers.sort(compareMembersByStatusThenName);
  orphanIds.sort((a, b) => a.localeCompare(b, "en"));

  return { resolvedMembers, orphanIds };
}

function renderAhdPublicList() {
  const el = qs("#ahdPublicList");
  const count = qs("#ahdCount");
  const canvasEl = qs("#memberCanvasAhdStrip");
  if (!el && !count && !canvasEl) return;

  loadAhdMembersCache();
  const { resolvedMembers, orphanIds } = getAhdResolvedState();
  if (AHD_REMOTE_SNAPSHOT_READY) saveAhdMembersCache();

  const previewFallbackMembers =
    !resolvedMembers.length &&
    typeof previewModeEnabled === "function" &&
    previewModeEnabled() &&
    typeof readMembersFromDOM === "function"
      ? readMembersFromDOM().slice(0, 6)
      : [];

  const publicMembers = resolvedMembers.length ? resolvedMembers : previewFallbackMembers;
  const visibleCanvasMembers = publicMembers.slice(0, 6);
  const extraCanvasCount = Math.max(0, publicMembers.length - visibleCanvasMembers.length);

  if (count) {
    count.textContent = (publicMembers.length || AHD_REMOTE_SNAPSHOT_READY)
      ? `${formatArabicNumber(publicMembers.length)} مشارك`
      : "جارٍ الإظهار...";
  }

  if (el) {
    el.innerHTML = publicMembers.length
      ? publicMembers
          .map((member) => {
            const status = getMemberStatus(member.id);
            const statusClass = status ? memberStatusClass(status) : "";
            const avatarClass = status ? `member-avatar ${statusClass}` : "member-avatar";
            const cardClass = status ? `slide-card ahd-slide-card ${statusClass}` : "slide-card ahd-slide-card";
            return `
        <div class="${cardClass}" data-member-id="${escapeHtml(member.id)}" style="cursor:default">
          <img class="${avatarClass}" loading="lazy" decoding="async" src="${typeof resolveMemberAvatarSrc === "function" ? resolveMemberAvatarSrc(member.src) : (member.src || window.WA3I_DEFAULT_MEMBER_AVATAR_SRC || "")}" alt="${escapeHtml(member.name || member.id)}" />
          <h3>${escapeHtml(member.name || member.id)}</h3>
        </div>
      `;
          })
          .join("")
      : AHD_REMOTE_SNAPSHOT_READY
        ? `<div class="identity-empty ahd-public-empty">لا يوجد مشاركون في عهد الثبات بعد.</div>`
        : `<div class="identity-empty ahd-public-empty">جارٍ إظهار المشاركين...</div>`;
  }

  if (canvasEl) {
    canvasEl.innerHTML = visibleCanvasMembers.length
      ? visibleCanvasMembers
          .map((member) => {
            const status = getMemberStatus(member.id);
            const avatarClass = status
              ? `member-canvas-ahd-avatar member-avatar ${memberStatusClass(status)}`
              : "member-canvas-ahd-avatar member-avatar";
            return `
        <div class="member-canvas-ahd-item" title="${escapeHtml(member.name || member.id)}" aria-label="${escapeHtml(member.name || member.id)}">
          <img class="${avatarClass}" loading="lazy" decoding="async" src="${typeof resolveMemberAvatarSrc === "function" ? resolveMemberAvatarSrc(member.src) : (member.src || window.WA3I_DEFAULT_MEMBER_AVATAR_SRC || "")}" alt="${escapeHtml(member.name || member.id)}" />
        </div>
      `;
          })
          .join("") +
        (extraCanvasCount ? `<div class="member-canvas-ahd-more">+${formatArabicNumber(extraCanvasCount)}</div>` : "")
      : "";
  }

  if (hasAhdAdminAccess()) {
    renderAhdAdminLists(qs("#ahdAdminSearch")?.value || "", orphanIds);
  }
}

function renderAhdAdminLists(filterText = "", orphanIdsArg = null) {
  const notInEl = qs("#tribeNotInAhdList");
  const ahdEl = qs("#ahdManageList");
  const orphanWrap = qs("#ahdOrphanWrap");
  const orphanEl = qs("#ahdOrphanList");
  if (!notInEl || !ahdEl) return;

  const q = String(filterText || "").trim();
  const orphanIds = Array.isArray(orphanIdsArg) ? orphanIdsArg : getAhdResolvedState().orphanIds;

  const tribeList = Array.from(FB_STATE.tribe.entries()).map(([id, member]) => ({ id, ...member }));
  const notIn = tribeList
    .filter((member) => !FB_STATE.ahd.has(member.id))
    .filter((member) => (q ? String(member.name || "").includes(q) : true))
    .sort(compareMembersByStatusThenName);

  const inAhd = tribeList
    .filter((member) => FB_STATE.ahd.has(member.id))
    .sort(compareMembersByStatusThenName);

  notInEl.innerHTML = notIn.length
    ? notIn
        .map((member) => {
          const status = getMemberStatus(member.id);
          const avatarClass = status ? `identity-avatar member-avatar ${memberStatusClass(status)}` : "identity-avatar member-avatar";
          return `
        <button class="identity-item" type="button" data-add-ahd="${member.id}" aria-label="إضافة ${escapeHtml(member.name)}">
          <img class="${avatarClass}" loading="lazy" decoding="async" src="${member.src}" alt="${escapeHtml(member.name)}" />
          <div class="identity-name">${escapeHtml(member.name)}</div>
        </button>
      `;
        })
        .join("")
    : `<div class="identity-empty">لا يوجد أعضاء متاحون للإضافة.</div>`;

  ahdEl.innerHTML = inAhd.length
    ? inAhd
        .map((member) => {
          const status = getMemberStatus(member.id);
          const avatarClass = status ? `identity-avatar member-avatar ${memberStatusClass(status)}` : "identity-avatar member-avatar";
          return `
        <button class="identity-item" type="button" data-remove-ahd="${member.id}" aria-label="حذف ${escapeHtml(member.name)}">
          <img class="${avatarClass}" loading="lazy" decoding="async" src="${member.src}" alt="${escapeHtml(member.name)}" />
          <div class="identity-name">${escapeHtml(member.name)}</div>
        </button>
      `;
        })
        .join("")
    : `<div class="identity-empty">لا يوجد مشاركون في عهد الثبات.</div>`;

  if (orphanWrap && orphanEl) {
    orphanWrap.style.display = orphanIds.length ? "block" : "none";
    orphanEl.innerHTML = orphanIds.length
      ? orphanIds
          .map((id) => `
        <button class="identity-item" type="button" data-remove-ahd-orphan="${escapeHtml(id)}" aria-label="حذف ${escapeHtml(id)} من عهد الثبات">
          <img class="identity-avatar member-avatar" loading="lazy" decoding="async" src="${window.WA3I_DEFAULT_MEMBER_AVATAR_SRC || ""}" alt="${escapeHtml(id)}" />
          <div class="identity-name">${escapeHtml(id)}</div>
        </button>
      `)
          .join("")
      : "";
  }

  notInEl.querySelectorAll("[data-add-ahd]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-add-ahd");
      await addMemberToAhd(id);
    });
  });

  ahdEl.querySelectorAll("[data-remove-ahd]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-remove-ahd");
      const ok = confirm("هل تريد حذف هذا العضو من عهد الثبات؟");
      if (!ok) return;
      await removeMemberFromAhd(id);
    });
  });

  orphanEl?.querySelectorAll("[data-remove-ahd-orphan]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-remove-ahd-orphan");
      const ok = confirm("هذا المعرّف غير موجود بين الأعضاء الظاهرين. هل تريد حذفه من قائمة المشاركين؟");
      if (!ok) return;
      await removeMemberFromAhd(id);
    });
  });
}

async function addMemberToAhd(memberId) {
  if (!hasAhdAdminAccess()) {
    setAhdAdminFeedback("لا تملك صلاحية إدارة عهد الثبات الآن.", true);
    return false;
  }
  const id = String(memberId || "").trim();
  if (!id || PENDING_AHD_MEMBER_ACTIONS.has(id)) return false;
  if (!FB_STATE.tribe.has(id)) {
    const message = "لا يمكن إضافة معرّف غير موجود في قائمة الأعضاء.";
    setAhdAdminFeedback(message, true);
    if (typeof showIdentityToast === "function") showIdentityToast(message);
    return false;
  }

  PENDING_AHD_MEMBER_ACTIONS.add(id);
  setAhdAdminFeedback("جارٍ إضافة العضو إلى عهد الثبات...");
  try {
    await ensureAhdAdminWriteAccess();
    const { db, doc, setDoc, serverTimestamp } = window.FB;
    await setDoc(doc(db, "ahdMembers", id), { joinedAt: serverTimestamp() }, { merge: true });
    setAhdAdminFeedback("تمت إضافة العضو إلى عهد الثبات.");
    if (typeof showIdentityToast === "function") showIdentityToast("تمت إضافة العضو إلى عهد الثبات.");
    return true;
  } catch (error) {
    console.error("Failed to add Ahd member", error);
    const message = ahdActionErrorMessage(error);
    setAhdAdminFeedback(message, true);
    if (typeof showIdentityToast === "function") showIdentityToast(message);
    return false;
  } finally {
    PENDING_AHD_MEMBER_ACTIONS.delete(id);
  }
}

async function removeMemberFromAhd(memberId) {
  if (!hasAhdAdminAccess()) {
    setAhdAdminFeedback("لا تملك صلاحية إدارة عهد الثبات الآن.", true);
    return false;
  }
  const id = String(memberId || "").trim();
  if (!id || PENDING_AHD_MEMBER_ACTIONS.has(id)) return false;

  PENDING_AHD_MEMBER_ACTIONS.add(id);
  setAhdAdminFeedback("جارٍ حذف العضو من عهد الثبات...");
  try {
    await ensureAhdAdminWriteAccess();
    const { db, doc, deleteDoc } = window.FB;
    await deleteDoc(doc(db, "ahdMembers", id));
    setAhdAdminFeedback("تم حذف العضو من عهد الثبات.");
    if (typeof showIdentityToast === "function") showIdentityToast("تم حذف العضو من عهد الثبات.");
    return true;
  } catch (error) {
    console.error("Failed to remove Ahd member", error);
    const message = ahdActionErrorMessage(error);
    setAhdAdminFeedback(message, true);
    if (typeof showIdentityToast === "function") showIdentityToast(message);
    return false;
  } finally {
    PENDING_AHD_MEMBER_ACTIONS.delete(id);
  }
}

function attachAhdFirestoreListener() {
  const { db, onSnapshot, collection } = window.FB;

  FB_STATE.unsubscribers.forEach((unsubscribe) => {
    try {
      unsubscribe();
    } catch {}
  });
  FB_STATE.unsubscribers = [];

  const unsubAhd = onSnapshot(collection(db, "ahdMembers"), (snap) => {
    FB_STATE.ahd = new Set();
    snap.forEach((docSnap) => FB_STATE.ahd.add(docSnap.id));
    AHD_REMOTE_SNAPSHOT_READY = true;
    renderAhdPublicList();
  });

  FB_STATE.unsubscribers.push(unsubAhd);
}

function initAhdPage() {
  rebuildTribeMapFromDOM();

  const tryInit = () => {
    if (!fbAvailable()) return setTimeout(tryInit, 50);
    if (FB_STATE.ready) return;

    FB_STATE.ready = true;

    window.FB.onAuthStateChanged(window.FB.auth, (user) => {
      FB_STATE.user = user || null;
      FB_STATE.isAdmin = Boolean(user && user.uid === AMJAD_ADMIN_UID);

      // Re-check delegated permissions as soon as Firebase finishes restoring
      // the member session, including after switching between members.
      if (typeof syncStoredPermissionsForCurrentUser === "function") {
        syncStoredPermissionsForCurrentUser();
      }

      setAdminMenuVisibility();
      setAhdAdminVisibility();
      renderAhdPublicList();
      setMemberStatusAdminVisibility();
      setMemberManageAdminVisibility();
      if (typeof setQaAdminVisibility === "function") setQaAdminVisibility();
      if (hasMemberStatusAdminAccess()) {
        renderMemberStatusAdminList();
      }
      if (hasMemberManageAdminAccess()) {
        renderMemberManageAdminList();
      }
      if (typeof renderQaAdminPanel === "function" && hasQaAdminAccess()) {
        renderQaAdminPanel();
      }

      resetFirestoreStreaksForAllMembersOnce();
    });

    qs("#ahdAdminSearch")?.addEventListener("input", (e) => {
      if (!hasAhdAdminAccess()) return;
      renderAhdAdminLists(e.target.value || "");
    });

    attachAhdFirestoreListener();
    setAdminMenuVisibility();
    setAhdAdminVisibility();
    setMemberManageAdminVisibility();
    if (typeof setQaAdminVisibility === "function") setQaAdminVisibility();
    renderAhdPublicList();
  };

  tryInit();
}
