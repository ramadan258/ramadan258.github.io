// ---------------------------
// Featured Members (Firebase)
// ---------------------------
function normalizeMemberStatus(data) {
  const raw = String(data?.tier || data?.status || "").trim().toLowerCase();
  if (!raw) {
    if (data && (Object.prototype.hasOwnProperty.call(data, "addedAt") || Object.prototype.hasOwnProperty.call(data, "updatedAt"))) {
      return "elite";
    }
    return null;
  }
  if (raw === "elite" || raw === "featured") return "elite";
  if (raw === "active") return "active";
  if (raw === "lazy" || raw === "needs_attention") return "lazy";
  return null;
}

function parseMemberStatusDocId(docId) {
  const id = String(docId || "").trim();
  if (!id) return null;
  const match = id.match(/^(elite|active|lazy)__(.+)$/);
  if (match) {
    return { status: match[1], memberId: match[2] };
  }
  if (!id.includes("__")) {
    return { status: "elite", memberId: id };
  }
  return null;
}

function memberStatusDocId(memberId, status) {
  return `${status}__${String(memberId || "").trim()}`;
}

function isStandardMemberId(memberId) {
  return /^member_[0-9]+$/.test(String(memberId || "").trim());
}

function isCustomManagedMemberId(memberId) {
  return /^custom_member_.+/.test(String(memberId || "").trim());
}

function memberStatusLabel(status) {
  if (status === "elite") return "العضو المميز جدًا";
  if (status === "active") return "العضو الفعال";
  if (status === "lazy") return "العضو المتكاسل";
  return "بدون تمييز";
}

function memberStatusClass(status) {
  return status ? `member-status-${status}` : "";
}

function memberStatusPriority(status) {
  if (status === "elite") return 0;
  if (status === "active") return 1;
  if (status === "lazy") return 2;
  return 3;
}

function compareMembersByStatusThenName(a, b) {
  const pa = memberStatusPriority(getMemberStatus(a.id));
  const pb = memberStatusPriority(getMemberStatus(b.id));
  if (pa !== pb) return pa - pb;
  return (a.name || "").localeCompare(b.name || "", "ar");
}

const FIRESTORE_MEMBER_STATUS = "featuredMembers";

let MEMBER_STATUS_STATE = {
  map: new Map(), // memberId -> elite | active | lazy
  unsubscribers: [],
};
const PENDING_MEMBER_STATUS = new Map(); // memberId -> elite | active | lazy | "__CLEAR__"

function getMemberStatus(memberId) {
  const id = String(memberId);
  if (PENDING_MEMBER_STATUS.has(id)) {
    const pending = PENDING_MEMBER_STATUS.get(id);
    return pending === "__CLEAR__" ? null : pending;
  }
  return MEMBER_STATUS_STATE.map.get(id) || null;
}

function setMemberStatusAdminVisibility() {
  const wrap = qs("#memberStatusAdminWrap");
  const show = hasMemberStatusAdminAccess() && ADMIN_UI_STATE.activePanel === "member-status";
  if (wrap) {
    wrap.style.display = show ? "block" : "none";
    wrap.setAttribute("aria-hidden", show ? "false" : "true");
  }
}

function refreshMemberStatusUI() {
  try { decorateMemberCardsWithStreaks(); } catch {}
  try {
    const q = qs("#identitySearch")?.value || "";
    renderIdentityGrid(IDENTITY_MEMBERS_CACHE, q);
  } catch {}
  try { renderAhdPublicList(); } catch {}
  if (hasAhdAdminAccess()) {
    try { renderAhdAdminLists(qs("#ahdAdminSearch")?.value || ""); } catch {}
  }
  if (hasMemberStatusAdminAccess()) {
    try { renderMemberStatusAdminList(); } catch {}
  }
  if (hasMemberManageAdminAccess()) {
    try { renderMemberManageAdminList(); } catch {}
  }
}

function renderMemberStatusAdminList() {
  const el = qs("#memberStatusAdminList");
  if (!el) return;

  const tribeList = Array.from(FB_STATE.tribe.entries())
    .map(([id, m]) => ({ id, ...m }))
    .sort(compareMembersByStatusThenName);

  el.innerHTML = tribeList.map((m) => {
    const status = getMemberStatus(m.id);
    const avatarClass = status ? `identity-avatar member-avatar ${memberStatusClass(status)}` : "identity-avatar member-avatar";
    return `
      <div class="status-admin-card">
        <div class="status-admin-head">
          <img class="${avatarClass}" src="${m.src}" alt="${escapeHtml(m.name)}" />
          <div>
            <div class="status-admin-name">${escapeHtml(m.name)}</div>
            <div class="status-admin-current">الحالة الحالية: ${memberStatusLabel(status)}</div>
          </div>
        </div>
        <div class="status-admin-actions">
          <button class="status-btn elite ${status === "elite" ? "is-selected" : ""}" type="button" data-member-status="${m.id}" data-status-value="elite">مميز جدًا</button>
          <button class="status-btn active ${status === "active" ? "is-selected" : ""}" type="button" data-member-status="${m.id}" data-status-value="active">فعال</button>
          <button class="status-btn lazy ${status === "lazy" ? "is-selected" : ""}" type="button" data-member-status="${m.id}" data-status-value="lazy">متكاسل</button>
          <button class="status-btn clear ${!status ? "is-selected" : ""}" type="button" data-member-status="${m.id}" data-status-value="">بدون سوار</button>
        </div>
      </div>
    `;
  }).join("");

  el.querySelectorAll("[data-member-status]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const memberId = btn.getAttribute("data-member-status");
      const status = btn.getAttribute("data-status-value") || null;
      try {
        await updateMemberStatus(memberId, status);
      } catch (e) {
        console.error("Failed to update member status", e);
        const code = String(e?.code || e?.message || "UNKNOWN");
        const normalizedCode = code.toUpperCase();
        const authInfo = FB_STATE.isAdmin
          ? "صلاحية أمجد مفعلة"
          : (hasMemberStatusAdminAccess() ? "صلاحية محلية مفعلة" : "لا توجد صلاحية مفعلة");
        if (code === "LOCAL_MEMBER_STATUS_BINDING_ONLY") {
          showIdentityToast("تعذّر الحفظ: الربط المحلي موجود فقط، ولم يكتمل الربط السحابي بعد.");
          return;
        }
        if (!FB_STATE.isAdmin && hasMemberStatusAdminAccess() && (
          normalizedCode.includes("PERMISSION-DENIED") ||
          normalizedCode.includes("PERMISSION_DENIED") ||
          normalizedCode.includes("MISSING OR INSUFFICIENT PERMISSIONS")
        )) {
          if (isCustomManagedMemberId(memberId)) {
            showIdentityToast("تعذّر الحفظ: هذا عضو مضاف يدويًا، وقواعد Firebase الحالية لا تسمح للحساب الحالي بتقييم هذا النوع من الأعضاء.");
            return;
          }
          showIdentityToast("تعذّر الحفظ: قواعد Firebase الحالية لا تسمح للحساب الحالي بحفظ تقييم الأعضاء.");
          return;
        }
        showIdentityToast(`تعذّر الحفظ: ${code} — ${authInfo}`);
      }
    });
  });
}

async function updateMemberStatus(memberId, status) {
  if (!hasMemberStatusAdminAccess()) return;
  if (!fbAvailable()) throw new Error("FB_NOT_READY");
  const isLimitedAdmin = !FB_STATE.isAdmin;
  if (isLimitedAdmin) {
    const binding = await ensureMemberBinding(currentUserId());
    if (binding?.localOnly) {
      throw new Error("LOCAL_MEMBER_STATUS_BINDING_ONLY");
    }
    await getFreshFirebaseIdToken();
  }
  const id = String(memberId || "").trim();
  if (!id) return;

  const prev = MEMBER_STATUS_STATE.map.has(id) ? MEMBER_STATUS_STATE.map.get(id) : null;
  PENDING_MEMBER_STATUS.set(id, status || "__CLEAR__");
  refreshMemberStatusUI();

  try {
    if (isLimitedAdmin) {
      try {
        await updateMemberStatusViaSdk(id, status, { strictDeletes: true });
      } catch (sdkError) {
        if (!isPermissionDeniedError(sdkError)) throw sdkError;
        await updateMemberStatusViaRest(id, status);
      }
    } else {
      await updateMemberStatusViaSdk(id, status);
    }

    showIdentityToast(
      status
        ? `تم تعيين الحالة: ${memberStatusLabel(status)}`
        : "تمت إزالة السوار عن العضو"
    );
  } catch (e) {
    PENDING_MEMBER_STATUS.delete(id);
    if (prev) MEMBER_STATUS_STATE.map.set(id, prev);
    else MEMBER_STATUS_STATE.map.delete(id);
    refreshMemberStatusUI();
    throw e;
  }
}

function attachMemberStatusFirestoreListeners() {
  MEMBER_STATUS_STATE.unsubscribers.forEach((u) => { try { u(); } catch {} });
  MEMBER_STATUS_STATE.unsubscribers = [];

  const { db, onSnapshot, collection } = window.FB;
  const unsub = onSnapshot(collection(db, FIRESTORE_MEMBER_STATUS), (snap) => {
    MEMBER_STATUS_STATE.map = new Map();
    snap.forEach((d) => {
      const parsed = parseMemberStatusDocId(d.id);
      if (parsed?.status && parsed?.memberId) {
        MEMBER_STATUS_STATE.map.set(parsed.memberId, parsed.status);
        return;
      }
      const status = normalizeMemberStatus(d.data() || {});
      if (status) MEMBER_STATUS_STATE.map.set(d.id, status);
    });
    for (const [id, pending] of Array.from(PENDING_MEMBER_STATUS.entries())) {
      const serverStatus = MEMBER_STATUS_STATE.map.get(id) || null;
      const wanted = pending === "__CLEAR__" ? null : pending;
      if (serverStatus === wanted) {
        PENDING_MEMBER_STATUS.delete(id);
      }
    }
    refreshMemberStatusUI();
  });

  MEMBER_STATUS_STATE.unsubscribers.push(unsub);
}

function initMemberStatusSystem() {
  const tryInit = () => {
    if (!fbAvailable()) return setTimeout(tryInit, 80);

    if (!FB_STATE.tribe || FB_STATE.tribe.size === 0) {
      rebuildTribeMapFromDOM();
    }

    attachMemberStatusFirestoreListeners();
    setMemberStatusAdminVisibility();
  };
  tryInit();
}
