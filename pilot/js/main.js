    const CONFIG = {
      AHD_TARGET_DATE_ISO: "2026-10-31T23:59:59+01:00",
      FORCE_HIZB_NUMBER: null,

      LINKS: {
        DEFAULT_TAFSIR: "https://example.com/tafsir",
        DEFAULT_RECOVERY_ARTICLE: "https://example.com/recovery-article",
      },

      CHALLENGES: [
        "تمرين الضغط 10 مرات",
        "ترتيب الغرفة 10 دقائق",
        "مشي 15 دقيقة",
        "شرب 6 أكواب ماء",
        "قراءة 10 صفحات مفيدة",
        "بلانك 45 ثانية",
      ],

      BREATH: {
        TOTAL_SECONDS: 60,
        PATTERN_TEXT: "شهيق 4 • حبس 2 • زفير 6",
      },

      RECOVERY_BOOKS: [
        {
          id: "300-qa-book",
          title: "300 سؤال وجواب",
          href: "books/300 سؤال وجواب.pdf"
        },
        {
          id: "brain-effects-book",
          title: "تأثيرات الإباحية على الدماغ",
          href: "books/تأثيرات الإباحية على الدماغ.pdf"
        },
        {
          id: "fast-recovery-guide",
          title: "وصفة سريعة للتعافي",
          href: "books/وصفة سريعة للتعافي.pdf"
        },
        {
          id: "stop-masturbation-book",
          title: "كيف توقف العادة السرية",
          href: "books/كيف توقف العادة السرية.pdf"
        }
      ],

      AZKAR: {
        MORNING: {
          key: "morning",
          title: "أذكار الصباح",
          url: "https://www.islambook.com/AzkarPrint/1",
          note: "المصدر: islambook (نسخة الطباعة لأذكار الصباح)",
        },
        EVENING: {
          key: "evening",
          title: "أذكار المساء",
          url: "https://www.islambook.com/AzkarPrint/2",
          note: "المصدر: islambook (نسخة الطباعة لأذكار المساء)",
        },
      },

      TAFSIR: {
        NAME: "تفسير ابن كثير",
        RESOURCE_ID: null,
        RESOURCES_API: "https://api.quran.com/api/v4/resources/tafsirs",
      },

      QURAN: {
            START_DATE_ISO: "2026-04-11T00:00:00", // أعيد ضبط بداية الورد لتبدأ من الصفحة 1 اليوم
            TOTAL_PAGES: 604,
            PAGES_PER_DAY: 3,
            PAGE_URL_TEMPLATE: "https://quran.com/page/{page}",
            LOCAL_PDF_URL: "quran/standard1-quran.pdf",
       },
    };

    const TASK_KEYS = [
      "habit_fard_mosque",
      "habit_sleep",
      "habit_adhkar",
      "habit_lower_gaze",
      "habit_obligations",
      "habit_learn",
      "habit_book",
      "habit_exercise",
    ];

    const LEGACY_TASK_ALIASES = {
      habit_fard_mosque: ["habit_fard_mosque"],
      habit_sleep: ["habit_sleep"],
      habit_adhkar: ["habit_adhkar", "morning_adhkar", "evening_adhkar"],
      habit_lower_gaze: ["habit_lower_gaze"],
      habit_obligations: ["habit_obligations"],
      habit_learn: ["habit_learn", "qa_review", "quran_reading"],
      habit_book: ["habit_book", "recovery_book"],
      habit_exercise: ["habit_exercise"],
    };

    const RISK_CHECK_FIELDS = ["mood", "isolation", "urge"];
    const RISK_CHECK_OPTIONS = {
      mood: [
        { value: "calm", label: "مطمئن", score: 0 },
        { value: "tired", label: "متعب", score: 1 },
        { value: "threatened", label: "مهدد", score: 3 },
      ],
      isolation: [
        { value: "connected", label: "بين الناس", score: 0 },
        { value: "semi", label: "شبه وحيد", score: 1 },
        { value: "alone", label: "وحيد", score: 2 },
      ],
      urge: [
        { value: "none", label: "لا توجد", score: 0 },
        { value: "light", label: "خفيفة", score: 1 },
        { value: "high", label: "مرتفعة", score: 3 },
      ],
    };
    const RISK_CHECK_LOOKUP = Object.fromEntries(
      Object.entries(RISK_CHECK_OPTIONS).map(([group, items]) => [
        group,
        Object.fromEntries(items.map((item) => [item.value, item])),
      ])
    );

    const WA3I_CTX = { todayISO: null, state: null, riskEvaluation: null };
    let breathInterval = null;
    let AZKAR_MODAL_WIRED = false;
    let RISK_CHECK_WIRED = false;
    let DAILY_VISIBILITY_WIRED = false;
    let DASHBOARD_QUICK_ACTIONS_WIRED = false;
    const AVATAR_PLACEHOLDER_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
    let DEFERRED_IMAGE_OBSERVER = null;

    function qs(sel) { return document.querySelector(sel); }
    function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
    function pad2(n) { return String(n).padStart(2, "0"); }

    function loadDeferredImage(img) {
      if (!img) return;
      const src = String(img.getAttribute("data-src") || "").trim();
      if (!src) return;
      img.setAttribute("src", src);
      img.removeAttribute("data-src");
    }

    function getDeferredImageObserver() {
      if (DEFERRED_IMAGE_OBSERVER || typeof IntersectionObserver === "undefined") {
        return DEFERRED_IMAGE_OBSERVER;
      }

      DEFERRED_IMAGE_OBSERVER = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          loadDeferredImage(entry.target);
          DEFERRED_IMAGE_OBSERVER.unobserve(entry.target);
        });
      }, {
        rootMargin: "180px 0px",
        threshold: 0.01,
      });

      return DEFERRED_IMAGE_OBSERVER;
    }

    function hydrateDeferredImages(root, eagerCount = 8) {
      if (!root) return;
      const images = Array.from(root.querySelectorAll("img[data-src]"));
      if (!images.length) return;

      images.slice(0, eagerCount).forEach(loadDeferredImage);

      const remaining = images.slice(eagerCount).filter((img) => img.hasAttribute("data-src"));
      if (!remaining.length) return;

      const observer = getDeferredImageObserver();
      if (observer) {
        remaining.forEach((img) => observer.observe(img));
        return;
      }

      window.setTimeout(() => {
        remaining.forEach(loadDeferredImage);
      }, 180);
    }

    

    
// ---------------------------
// Identity (local app user)
// ---------------------------
const USER_STORAGE_KEY = "wa3i_current_user_v1";
const LOCAL_MEMBER_BINDING_KEY = "wa3i_local_member_binding_v1";
let WA3I_USER = null;
let COUNTDOWN_INTERVAL_ID = null;

function slugifyName(name) {
  const s = String(name || "").trim();
  if (!s) return "guest";
  return s
    .replace(/[^\u0600-\u06FFa-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "guest";
}

function currentUserId() {
  return WA3I_USER?.id || "guest";
}

const MEMBER_AUTH_SESSION_KEY = "wa3i_member_auth_session_v1";
const MEMBER_AUTH_DEVICE_KEY = "wa3i_member_auth_device_v1";

function readPersistedMemberAuthorization() {
  try {
    const raw = window.WA3I_SESSION.storage.getItem(MEMBER_AUTH_DEVICE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    const id = String(parsed?.memberId || "").trim();
    return id;
  } catch {
    return "";
  }
}

function hasPersistedLocalAdminAccess() { return false; }

function markMemberSessionAuthorized() {}

function hasMemberSessionAuthorization(id) { return window.WA3I_SESSION.session?.member.id === id; }

function clearMemberSessionAuthorization() {}

function readCurrentUser() { return window.WA3I_SESSION.session?.member || null; }

function saveCurrentUser(user) { if (user?.id !== window.WA3I_SESSION.session?.member.id) throw new Error('UNVERIFIED_IDENTITY'); WA3I_USER = user; updateUserBar(); }

function clearCurrentUser() {
  WA3I_USER = null;
  try { window.WA3I_SESSION.storage.removeItem(USER_STORAGE_KEY); } catch {}
  clearMemberSessionAuthorization();
  try { resetLocalAdminAccess(); } catch {}
  updateUserBar();
}

function readLocalMemberBinding() { return window.WA3I_SESSION.session?.member.id || ''; }

function writeLocalMemberBinding() {}

function clearLocalMemberBinding() {}

function createBoundToOtherMemberError(boundMemberId) {
  const err = new Error("BOUND_TO_OTHER_MEMBER");
  err.boundMemberId = String(boundMemberId || "").trim();
  return err;
}

function assertLocalMemberBinding(memberId) {
  const target = String(memberId || "").trim();
  const bound = readLocalMemberBinding();
  if (bound && bound !== target) {
    throw createBoundToOtherMemberError(bound);
  }
  return bound;
}

function bindingErrorCode(error) {
  return String(error?.code || error?.message || "").trim().toUpperCase();
}

function isBindingUnavailableError(error) {
  const code = bindingErrorCode(error);
  return (
    code.includes("PERMISSION-DENIED") ||
    code.includes("PERMISSION_DENIED") ||
    code.includes("MISSING OR INSUFFICIENT PERMISSIONS") ||
    code.includes("UNAVAILABLE") ||
    code.includes("NETWORK") ||
    code.includes("OFFLINE") ||
    code.includes("FETCH") ||
    code.includes("AUTH/NETWORK-REQUEST-FAILED") ||
    code.includes("FB_NOT_READY")
  );
}

function updateUserBar() {
  qsa("[data-current-user-pill]").forEach((pill) => {
    pill.textContent = WA3I_USER?.name || "ضيف";
  });
}

const FIRESTORE_CUSTOM_MEMBERS = "featuredMembers";
const FIRESTORE_HIDDEN_MEMBERS = "featuredMembers";
const FIRESTORE_MEMBER_ACCESS = "featuredMembers";
const FIRESTORE_MEMBER_PERMISSIONS = "memberPermissions";
const LOCAL_MEMBER_DIRECTORY_CUSTOM_KEY = "wa3i_member_directory_custom_v1";
const LOCAL_MEMBER_DIRECTORY_HIDDEN_KEY = "wa3i_member_directory_hidden_v1";
const LOCAL_REMOTE_MEMBER_DIRECTORY_CACHE_KEY = "wa3i_member_directory_remote_cache_v1";
const REMOTE_MEMBER_DIRECTORY_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const LOCAL_LEGACY_MEMBER_CLEANUP_KEY = "wa3i_legacy_member_cleanup_v1";
const MEMBER_DIRECTORY_STATE = {
  baseMembers: [],
  remoteCustomMembers: new Map(),
  remoteAccessById: new Map(),
  remoteAccessSnapshotReady: false,
  localCustomMembers: new Map(),
  remoteHiddenMemberIds: new Set(),
  localHiddenMemberIds: new Set(),
  pendingHiddenMemberIds: new Set(),
  pendingDeletedCustomMemberIds: new Set(),
  listenersAttached: false,
  controlsWired: false,
  pendingImageDataUrl: "",
  editingMemberId: "",
  pendingAccessPinRemoval: false,
  pendingLegacyAccessCleanupIds: new Set(),
  legacyAccessCleanupTimer: null,
  legacyRemovedMembersCleanupRunning: false,
};

const AMJAD_MEMBER_ID = "member_9";
const AMJAD_MEMBER_NAME = "أمجد";
const DEFAULT_MEMBER_AVATAR_SRC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23132633'/%3E%3Cstop offset='1' stop-color='%230e2430'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='160' height='160' rx='36' fill='url(%23g)'/%3E%3Ccircle cx='80' cy='58' r='28' fill='%23d8e6eb' fill-opacity='.92'/%3E%3Cpath d='M34 132c8-26 31-40 46-40s38 14 46 40' fill='%23d8e6eb' fill-opacity='.92'/%3E%3C/svg%3E";
const LEGACY_REMOVED_STATIC_MEMBER_IDS = new Set([
  "member_0",
  "member_2",
  "member_3",
  "member_4",
  "member_5",
  "member_6",
  "member_7",
  "member_8",
  "member_10",
  "member_11",
  "member_12",
  "member_13",
  "member_14",
  "member_15",
  "member_16",
  "member_17",
  "member_18",
  "member_19",
  "member_20",
  "member_21",
  "member_22",
  "member_23",
  "member_24",
  "member_25",
  "member_26",
  "member_27",
  "member_28",
  "member_29",
  "member_30",
]);
window.WA3I_DEFAULT_MEMBER_AVATAR_SRC = DEFAULT_MEMBER_AVATAR_SRC;

function resolveMemberAvatarSrc(src) {
  return String(src || "").trim() || DEFAULT_MEMBER_AVATAR_SRC;
}

function isLegacyRemovedStaticMemberId(memberId) {
  return LEGACY_REMOVED_STATIC_MEMBER_IDS.has(String(memberId || "").trim());
}

const STATIC_BASE_MEMBERS = [{"id":"member_9","name":"أمجد","src":"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23132633'/%3E%3Cstop offset='1' stop-color='%230e2430'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='160' height='160' rx='36' fill='url(%23g)'/%3E%3Ccircle cx='80' cy='58' r='28' fill='%23d8e6eb' fill-opacity='.92'/%3E%3Cpath d='M34 132c8-26 31-40 46-40s38 14 46 40' fill='%23d8e6eb' fill-opacity='.92'/%3E%3C/svg%3E","source":"static"},{"id":"custom_member_pilot_20261011","name":"تجربة خُطاي","src":"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23132633'/%3E%3Cstop offset='1' stop-color='%230e2430'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='160' height='160' rx='36' fill='url(%23g)'/%3E%3Ccircle cx='80' cy='58' r='28' fill='%23d8e6eb' fill-opacity='.92'/%3E%3Cpath d='M34 132c8-26 31-40 46-40s38 14 46 40' fill='%23d8e6eb' fill-opacity='.92'/%3E%3C/svg%3E","source":"static"}];

function extractMembersFromCards(cards) {
  const out = [];
  cards.forEach((card, idx) => {
    const img = card.querySelector("img");
    const nameEl = card.querySelector("h3");
    const name = (nameEl?.textContent || img?.getAttribute("alt") || "").trim();
    const src = img?.getAttribute("src") || "";
    const explicitId = (card.getAttribute("data-member-id") || "").trim();
    if (!name || !src) return;
    out.push({
      id: explicitId || `member_${idx}`,
      name,
      src,
      source: card.getAttribute("data-member-source") === "custom" ? "custom" : "static",
    });
  });
  return out;
}

function customMemberDocId(memberId) {
  return `custom__${String(memberId || "").trim()}`;
}

function hiddenMemberDocId(memberId) {
  return `hidden__${String(memberId || "").trim()}`;
}

function memberAccessDocId(memberId) {
  return `access__${String(memberId || "").trim()}`;
}

function memberPermissionsDocId(memberId) {
  return String(memberId || "").trim();
}

const ASSIGNABLE_MEMBER_PERMISSIONS = Object.freeze({
  memberStatus: "تقييم الأعضاء",
  ahd: "إدارة عهد الثبات",
  qa: "سؤال وجواب",
});

function normalizeMemberPermissions(value = {}) {
  return {
    memberStatus: Boolean(value?.memberStatus),
    ahd: Boolean(value?.ahd),
    qa: Boolean(value?.qa),
  };
}

function memberPermissionsSummary(value = {}) {
  const permissions = normalizeMemberPermissions(value);
  const labels = Object.entries(ASSIGNABLE_MEMBER_PERMISSIONS)
    .filter(([key]) => permissions[key])
    .map(([, label]) => label);
  return labels.length ? labels.join("، ") : "لا توجد صلاحيات إضافية";
}

function normalizeMemberAccessPin(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 5);
}

function isValidMemberAccessPin(value) {
  return /^[0-9]{1,5}$/.test(String(value || "").trim());
}

function memberAccessRecordFromData(docId, data = {}) {
  const memberId = String(data.memberId || docId.replace(/^access__/, "")).trim();
  const passwordHash = String(data.passwordHash || "").trim();
  const hasLegacyPlaintext = String(data.passwordPlain || "").trim().length > 0;
  if (!memberId) return null;
  return {
    memberId,
    passwordHash,
    hasLegacyPlaintext,
    permissions: normalizeMemberPermissions(data.permissions),
    type: String(data.type || "member_access").trim(),
  };
}

function getMemberAccessRecord(id) { return id === 'member_9' || window.WA3I_SESSION.accounts.has(id) ? {accountManaged:true} : null; }

async function resolveMemberAccessRecord(id) { return getMemberAccessRecord(id); }

function queueLegacyMemberAccessCleanup() {}

async function canResumeMemberSession(id) { return window.WA3I_SESSION.session?.member.id === id; }

function persistLocalMemberDirectoryState() {
  try {
    const custom = Array.from(MEMBER_DIRECTORY_STATE.localCustomMembers.values()).map((member) => ({
      id: String(member.id || "").trim(),
      name: String(member.name || "").trim(),
      src: String(member.src || "").trim(),
      source: "custom",
    })).filter((member) => member.id && member.name && member.src);
    window.WA3I_SESSION.storage.setItem(LOCAL_MEMBER_DIRECTORY_CUSTOM_KEY, JSON.stringify(custom));
  } catch {}

  try {
    const hidden = Array.from(MEMBER_DIRECTORY_STATE.localHiddenMemberIds.values()).map((id) => String(id || "").trim()).filter(Boolean);
    window.WA3I_SESSION.storage.setItem(LOCAL_MEMBER_DIRECTORY_HIDDEN_KEY, JSON.stringify(hidden));
  } catch {}
}

function loadLocalMemberDirectoryState() {
  try {
    const rawCustom = window.WA3I_SESSION.storage.getItem(LOCAL_MEMBER_DIRECTORY_CUSTOM_KEY);
    const arr = rawCustom ? JSON.parse(rawCustom) : [];
    const next = new Map();
    if (Array.isArray(arr)) {
      arr.forEach((member) => {
        const id = String(member?.id || "").trim();
        const name = String(member?.name || "").trim();
        const src = String(member?.src || "").trim();
        if (!id || !name || !src || isLegacyRemovedStaticMemberId(id)) return;
        next.set(id, { id, name, src, source: "custom" });
      });
    }
    MEMBER_DIRECTORY_STATE.localCustomMembers = next;
  } catch {
    MEMBER_DIRECTORY_STATE.localCustomMembers = new Map();
  }

  try {
    const rawHidden = window.WA3I_SESSION.storage.getItem(LOCAL_MEMBER_DIRECTORY_HIDDEN_KEY);
    const arr = rawHidden ? JSON.parse(rawHidden) : [];
    const next = new Set();
    if (Array.isArray(arr)) {
      arr.forEach((id) => {
        const value = String(id || "").trim();
        if (value) next.add(value);
      });
    }
    MEMBER_DIRECTORY_STATE.localHiddenMemberIds = next;
  } catch {
    MEMBER_DIRECTORY_STATE.localHiddenMemberIds = new Set();
  }
}

function saveRemoteMemberDirectoryCache() {
  try {
    const custom = Array.from(MEMBER_DIRECTORY_STATE.remoteCustomMembers.values()).map((member) => ({
      id: String(member?.id || "").trim(),
      name: String(member?.name || "").trim(),
      src: String(member?.src || "").trim(),
      source: "custom",
    })).filter((member) => member.id && member.name && member.src);
    const hidden = Array.from(MEMBER_DIRECTORY_STATE.remoteHiddenMemberIds)
      .map((id) => String(id || "").trim())
      .filter(Boolean);

    window.WA3I_SESSION.storage.setItem(LOCAL_REMOTE_MEMBER_DIRECTORY_CACHE_KEY, JSON.stringify({
      updatedAt: Date.now(),
      custom,
      hidden,
    }));
  } catch {}
}

function loadRemoteMemberDirectoryCache() {
  try {
    const raw = window.WA3I_SESSION.storage.getItem(LOCAL_REMOTE_MEMBER_DIRECTORY_CACHE_KEY);
    const cached = raw ? JSON.parse(raw) : null;
    const updatedAt = Number(cached?.updatedAt || 0);
    if (!cached || !updatedAt || Date.now() - updatedAt > REMOTE_MEMBER_DIRECTORY_CACHE_MAX_AGE_MS) {
      return;
    }

    const custom = new Map();
    if (Array.isArray(cached.custom)) {
      cached.custom.forEach((member) => {
        const id = String(member?.id || "").trim();
        const name = String(member?.name || "").trim();
        const src = String(member?.src || "").trim();
        if (!id || !name || !src || isLegacyRemovedStaticMemberId(id)) return;
        custom.set(id, { id, name, src, source: "custom" });
      });
    }

    const hidden = new Set();
    if (Array.isArray(cached.hidden)) {
      cached.hidden.forEach((id) => {
        const value = String(id || "").trim();
        if (value) hidden.add(value);
      });
    }

    MEMBER_DIRECTORY_STATE.remoteCustomMembers = custom;
    MEMBER_DIRECTORY_STATE.remoteHiddenMemberIds = hidden;
  } catch {}
}

function getMergedCustomMembersMap() {
  const merged = new Map(MEMBER_DIRECTORY_STATE.remoteCustomMembers);
  MEMBER_DIRECTORY_STATE.localCustomMembers.forEach((value, key) => {
    if (isLegacyRemovedStaticMemberId(key)) return;
    merged.set(key, value);
  });
  MEMBER_DIRECTORY_STATE.pendingDeletedCustomMemberIds.forEach((id) => {
    merged.delete(id);
  });
  return merged;
}

function getMergedHiddenMemberIds() {
  const merged = new Set([
    ...MEMBER_DIRECTORY_STATE.remoteHiddenMemberIds,
    ...MEMBER_DIRECTORY_STATE.localHiddenMemberIds,
    ...MEMBER_DIRECTORY_STATE.pendingHiddenMemberIds,
  ]);
  return merged;
}

function getAllMembersList(options = {}) {
  const includeHidden = Boolean(options.includeHidden);
  const base = Array.isArray(MEMBER_DIRECTORY_STATE.baseMembers) ? MEMBER_DIRECTORY_STATE.baseMembers : [];
  const hidden = getMergedHiddenMemberIds();
  const merged = new Map();
  base.forEach((member) => {
    const id = String(member?.id || "").trim();
    if (!id || isLegacyRemovedStaticMemberId(id)) return;
    merged.set(id, member);
  });
  getMergedCustomMembersMap().forEach((member, id) => {
    const key = String(id || member?.id || "").trim();
    if (!key || !member?.name || !member?.src || isLegacyRemovedStaticMemberId(key)) return;
    merged.set(key, { id: key, name: member.name, src: member.src, source: "custom" });
  });

  return Array.from(merged.values()).filter((member) => {
    if (includeHidden) return true;
    const id = String(member.id || "").trim();
    return !hidden.has(id);
  });
}

function renderMembersSection() {
  const slider = qs("#members .slider");
  if (!slider) return;

  const members = getAllMembersList();
  slider.innerHTML = members.map((member) => `
        <div class="slide-card" data-member-id="${escapeHtml(member.id)}" data-member-source="${member.source === "custom" ? "custom" : "static"}">
          <img loading="lazy" decoding="async" fetchpriority="low" src="${resolveMemberAvatarSrc(member.src)}" alt="${escapeHtml(member.name)}" />
          <h3>${escapeHtml(member.name)}</h3>
        </div>
      `).join("");
}

function shouldRenderMembersSectionUI() {
  const app = qs("#appRoot");
  return Boolean(app && !app.classList.contains("is-hidden"));
}

function refreshMemberDirectoryUI(options = {}) {
  const renderMembers = typeof options.renderMembers === "boolean"
    ? options.renderMembers
    : shouldRenderMembersSectionUI();

  if (renderMembers) {
    renderMembersSection();
  }
  IDENTITY_MEMBERS_CACHE = readMembersFromDOM();
  if (renderMembers) {
    try { decorateMemberCardsWithStreaks(); } catch {}
  }

  const gateVisible = !qs("#identityGate")?.classList.contains("is-hidden");
  if (gateVisible) {
    try {
      const q = qs("#identitySearch")?.value || "";
      renderIdentityGrid(IDENTITY_MEMBERS_CACHE, q);
    } catch {}
  }

  if (!shouldRenderMembersSectionUI()) return;

  rebuildTribeMapFromDOM();
  try { renderAhdPublicList(); } catch {}
  if (FB_STATE.isAdmin) {
    cleanupLegacyRemovedMembersCloudOnce().catch((error) => {
      console.warn("Legacy member cleanup did not finish", error);
    });
  }
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

async function cleanupLegacyRemovedMembersCloudOnce() {}

function showGate() {
  qs("#identityGate")?.classList.remove("is-hidden");
  const app = qs("#appRoot");
  if (app) {
    app.classList.add("is-hidden");
    app.setAttribute("aria-hidden", "true");
  }
}

function hideGate() {
  qs("#identityGate")?.classList.add("is-hidden");
  const app = qs("#appRoot");
  if (app) {
    app.classList.remove("is-hidden");
    app.setAttribute("aria-hidden", "false");
  }
  updateUserBar();
}

function readMembersFromDOM() {
  return getAllMembersList();
}


function decorateMemberCardsWithStreaks() {
  const cards = qsa("#members .slide-card");
  cards.forEach((card, idx) => {
    // Keep stable IDs (member_0..), but visually sort by member status first.
    if (!card.dataset.origIndex) card.dataset.origIndex = String(idx);
    const orig = parseInt(card.dataset.origIndex || "0", 10);

    const nameEl = card.querySelector("h3");
    if (!nameEl) return;

    let row = card.querySelector(".member-name-row");
    if (!row) {
      row = document.createElement("div");
      row.className = "member-name-row";
      nameEl.parentNode?.insertBefore(row, nameEl);
      row.appendChild(nameEl);
    }
    const explicitMemberId = String(card.getAttribute("data-member-id") || "").trim();
    const memberId = explicitMemberId || `member_${Number.isFinite(orig) ? orig : idx}`;
    const status = getMemberStatus(memberId);
    const orderKey = (memberStatusPriority(status) * 100000) + (Number.isFinite(orig) ? orig : idx);
    card.style.order = String(orderKey);

    const img = card.querySelector("img");
    card.classList.remove("member-status-elite", "member-status-active", "member-status-lazy");
    if (img) img.classList.remove("member-avatar", "member-status-elite", "member-status-active", "member-status-lazy");
    if (status) {
      card.classList.add(memberStatusClass(status));
      if (img) {
        img.classList.add("member-avatar", memberStatusClass(status));
        img.setAttribute("title", memberStatusLabel(status));
      }
    } else if (img) {
      img.classList.add("member-avatar");
      img.removeAttribute("title");
    }
  });
}

function renderIdentityGrid(members) {
    const grid = qs('#identityGrid'); if (!grid) return;
    grid.innerHTML = members.map((m) => '<button class="identity-item" data-user-id="'+escapeHtml(m.id)+'" aria-label="'+escapeHtml(m.name)+'"><img class="identity-avatar member-avatar" src="'+escapeHtml(m.src)+'" alt=""/><div class="identity-name">'+escapeHtml(m.name)+'</div></button>').join('');
    grid.querySelectorAll('[data-user-id]').forEach((btn) => btn.addEventListener('click', () => openIdentityConfirm(members.find((m) => m.id === btn.dataset.userId))));
  }

function wireGuestEntry() {
  if (wireGuestEntry._wired) return;
  wireGuestEntry._wired = true;

  const btn = qs("#enterGuestBtn");
  const input = qs("#guestName");

  const enter = () => {
    const raw = (input?.value || "").trim();
    const name = raw || "ضيف";
    const id = raw ? `guest_${slugifyName(raw)}` : "guest";
    saveCurrentUser({ id, name, kind: "guest" });
    if (input) input.value = "";
    startApp();
  };

  btn?.addEventListener("click", enter);
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") enter();
  });
}

function userKey(suffix) {
  return `wa3i_${currentUserId()}_${suffix}`;
}

// ---------------------------
// Shared streaks (Firestore) + Anonymous Auth (no UI login)
// ---------------------------
const FIRESTORE_BINDINGS = "bindings";
const FIRESTORE_STREAKS = "streaks";
const SHARED_STREAKS = new Map();
let SHARED_STREAKS_LISTENING = false;
function resetLocalStreaksForAllMembersOnce() {}

async function resetFirestoreStreaksForAllMembersOnce() {}
let IDENTITY_MEMBERS_CACHE = [];
function refreshIdentityStreaksUI() {
  try { decorateMemberCardsWithStreaks(); } catch {}
  const grid = qs("#identityGrid");
  if (!grid) return;
  const q = qs("#identitySearch")?.value || "";
  renderIdentityGrid(IDENTITY_MEMBERS_CACHE, q);
}

function startSharedStreaksListener() {
  if (SHARED_STREAKS_LISTENING) return;
  const tryInit = () => {
    if (!fbAvailable()) return setTimeout(tryInit, 80);
    SHARED_STREAKS_LISTENING = true;

    const { db, onSnapshot, collection } = window.FB;
    onSnapshot(collection(db, FIRESTORE_STREAKS), (snap) => {
      SHARED_STREAKS.clear();
      snap.forEach((d) => SHARED_STREAKS.set(d.id, Number(d.data()?.count || 0)));
      refreshIdentityStreaksUI();
    });
  };
  tryInit();
}

async function ensureAnonSignedIn() { if (!window.WA3I_SESSION.session || !window.FB.auth.currentUser) throw new Error('AUTH_REQUIRED'); return window.FB.auth.currentUser; }

async function ensureRemoteMemberBinding(id) { return window.WA3I_SESSION.verify(id); }

async function ensureMemberBinding(id) { return window.WA3I_SESSION.verify(id); }

function isPermissionDeniedError(error) {
  const code = bindingErrorCode(error);
  return (
    code.includes("PERMISSION-DENIED") ||
    code.includes("PERMISSION_DENIED") ||
    code.includes("MISSING OR INSUFFICIENT PERMISSIONS")
  );
}

async function getFreshFirebaseIdToken() {
  if (!fbAvailable()) throw new Error("FB_NOT_READY");
  const user = window.FB.auth?.currentUser || await ensureAnonSignedIn();
  if (!user?.getIdToken) throw new Error("AUTH_USER_MISSING");
  return user.getIdToken(true);
}

function firestoreRestDocUrl(collectionName, docId) {
  const projectId = String(
    window.FB?.projectId ||
    window.FB?.auth?.app?.options?.projectId ||
    window.FB?.db?.app?.options?.projectId ||
    ""
  ).trim();
  if (!projectId) throw new Error("FB_PROJECT_ID_MISSING");

  const safeCollection = encodeURIComponent(String(collectionName || "").trim());
  const safeDocId = encodeURIComponent(String(docId || "").trim());
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${safeCollection}/${safeDocId}`;
}

async function firestoreRestRequest(url, init = {}) {
  const token = await getFreshFirebaseIdToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(init.headers || {}),
  };

  const response = await fetch(url, { ...init, headers });
  if (response.ok) {
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  if (response.status === 404 && String(init.method || "GET").toUpperCase() === "DELETE") {
    return null;
  }

  let errCode = `HTTP_${response.status}`;
  let errMessage = response.statusText || errCode;

  try {
    const payload = await response.json();
    errCode = String(payload?.error?.status || errCode);
    errMessage = String(payload?.error?.message || errMessage);
  } catch {}

  const err = new Error(errMessage);
  err.code = errCode;
  throw err;
}

async function updateMemberStatusViaRest(memberId, status) {
  const id = String(memberId || "").trim();
  if (!id) return;

  await firestoreRestRequest(
    firestoreRestDocUrl(FIRESTORE_MEMBER_STATUS, memberStatusOverrideDocId(id)),
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          type: { stringValue: "member_status" },
          memberId: { stringValue: id },
          tier: { stringValue: status || "none" },
          updatedAt: { timestampValue: new Date().toISOString() },
        },
      }),
    }
  );
}

async function updateMemberStatusViaSdk(memberId, status) {
  const id = String(memberId || "").trim();
  if (!id) return;

  const { db, doc, setDoc, serverTimestamp } = window.FB;
  await setDoc(
    doc(db, FIRESTORE_MEMBER_STATUS, memberStatusOverrideDocId(id)),
    {
      type: "member_status",
      memberId: id,
      tier: status || "none",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}


async function syncStreakToFirestore(memberId, count, todayISO) {
  try {
    const binding = await ensureMemberBinding(memberId);
    if (binding?.localOnly) return;
    const { db, doc, setDoc, serverTimestamp } = window.FB;

    await setDoc(
      doc(db, FIRESTORE_STREAKS, String(memberId)),
      { count: Number(count) || 0, lastCompletedDate: String(todayISO), updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    // Keep local streak working, but surface binding mismatch clearly.
    if (String(e?.message || "") === "BOUND_TO_OTHER_MEMBER") {
      const name = memberNameById(e.boundMemberId) || e.boundMemberId;
      showIdentityToast(`هذا الجهاز مربوط بـ “${name}”. اضغط “تبديل المستخدم” لتصحيح الاختيار.`);
    }
  }
}
function getStreakForUserId(userId) {
  const shared = SHARED_STREAKS.get(userId);
  if (Number.isFinite(shared)) return shared;
  const raw = window.WA3I_SESSION.storage.getItem(`wa3i_${userId}_streak`);
  const n = parseInt(raw || "0", 10);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------
// Ahd (Firebase Firestore + Auth)
// ---------------------------
// Firebase Ahd (Firestore + Auth)
// ---------------------------
const AMJAD_ADMIN_UID = "OpXzKToeVbd9xp1KHuqnD95yXlm2";

let FB_STATE = {
  ready: false,
  user: null,
  isAdmin: false,
  tribe: new Map(), // memberId -> {name, src}
  ahd: new Set(),   // memberId
  unsubscribers: [],
};

let LOCAL_ADMIN_ACCESS = {
  owner: "",
  memberStatus: false,
  ahd: false,
  memberManage: false,
  qa: false,
};

const LOCAL_ADMIN_ACCESS_STORAGE_KEY = "wa3i_local_admin_access_v1";

const ADMIN_UI_STATE = {
  activePanel: null,
  menuOpen: false,
  wired: false,
};

const CANVAS_WINDOW_STATE = {
  wired: false,
  activeNode: null,
  originalParent: null,
  originalNextSibling: null,
  originalHidden: false,
};

const CANVAS_INLINE_STATE = {
  membersMounted: false,
};

function fbAvailable() {
  return typeof window.FB !== "undefined" && window.FB?.db && window.FB?.auth;
}

function hasMemberStatusAdminAccess() {
  return Boolean(FB_STATE.isAdmin || LOCAL_ADMIN_ACCESS.memberStatus);
}

function hasAhdAdminAccess() {
  return Boolean(FB_STATE.isAdmin || LOCAL_ADMIN_ACCESS.ahd);
}

function hasMemberManageAdminAccess() {
  return Boolean(FB_STATE.isAdmin || LOCAL_ADMIN_ACCESS.memberManage);
}

function hasQaAdminAccess() {
  return Boolean(FB_STATE.isAdmin || LOCAL_ADMIN_ACCESS.qa);
}

function hasLibraryAdminAccess() {
  return Boolean(FB_STATE.isAdmin);
}

function hasAnyAdminAccess() {
  return Boolean(
    hasMemberStatusAdminAccess() ||
    hasAhdAdminAccess() ||
    hasMemberManageAdminAccess() ||
    hasQaAdminAccess() ||
    hasLibraryAdminAccess()
  );
}

function canAccessAdminPanel(panelKey) {
  if (panelKey === "member-status") return hasMemberStatusAdminAccess();
  if (panelKey === "ahd") return hasAhdAdminAccess();
  if (panelKey === "member-manage") return hasMemberManageAdminAccess();
  if (panelKey === "qa") return hasQaAdminAccess();
  if (panelKey === "library") return hasLibraryAdminAccess();
  return false;
}

function persistLocalAdminAccess() {}

function restoreLocalAdminAccessForCurrentUser() { syncStoredPermissionsForCurrentUser(); }

function grantLocalAdminAccess(nextAccess = {}) {
  LOCAL_ADMIN_ACCESS = {
    owner: String(nextAccess.owner || "").trim(),
    memberStatus: Boolean(nextAccess.memberStatus),
    ahd: Boolean(nextAccess.ahd),
    memberManage: Boolean(nextAccess.memberManage),
    qa: Boolean(nextAccess.qa),
  };
  persistLocalAdminAccess();
  setAdminMenuVisibility();
  setMemberStatusAdminVisibility();
  setAhdAdminVisibility();
  setMemberManageAdminVisibility();
  if (typeof setQaAdminVisibility === "function") setQaAdminVisibility();
  if (typeof setLibraryAdminVisibility === "function") setLibraryAdminVisibility();
}

function syncStoredPermissionsForCurrentUser() {
    const session = window.WA3I_SESSION.session;
    FB_STATE.isAdmin = Boolean(session?.isAdmin);
    grantLocalAdminAccess({ owner: session?.member.id || '', memberManage: Boolean(session?.isAdmin), ...session?.permissions });
  }

function resetLocalAdminAccess() {
  grantLocalAdminAccess();
}

function rebuildTribeMapFromDOM() {
  const members = readMembersFromDOM();
  FB_STATE.tribe = new Map(members.map((m) => [m.id, { name: m.name, src: m.src }]));
}

function setAdminMenuOpen(isOpen) {
  ADMIN_UI_STATE.menuOpen = Boolean(isOpen && hasAnyAdminAccess());
  const toggle = qs("#adminQuickToggle");
  const panel = qs("#adminQuickPanel");
  if (toggle) toggle.setAttribute("aria-expanded", ADMIN_UI_STATE.menuOpen ? "true" : "false");
  if (panel) {
    panel.classList.toggle("is-open", ADMIN_UI_STATE.menuOpen);
    panel.setAttribute("aria-hidden", ADMIN_UI_STATE.menuOpen ? "false" : "true");
  }
}

function setAdminMenuVisibility() {
  const menu = qs("#adminQuickMenu");
  if (!menu) return;

  if (hasAnyAdminAccess()) {
    menu.style.display = "block";
  } else {
    menu.style.display = "none";
    setAdminMenuOpen(false);
    restoreAdminPanelFromModal();
    const modal = qs("#adminPanelModal");
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
    ADMIN_UI_STATE.activePanel = null;
    setMemberStatusAdminVisibility();
    setAhdAdminVisibility();
    setMemberManageAdminVisibility();
    if (typeof setQaAdminVisibility === "function") setQaAdminVisibility();
    if (typeof setLibraryAdminVisibility === "function") setLibraryAdminVisibility();
    syncBodyModalLock();
  }

  document.querySelectorAll("[data-admin-open]").forEach((btn) => {
    const panelKey = btn.getAttribute("data-admin-open");
    const allowed = canAccessAdminPanel(panelKey);
    btn.style.display = allowed ? "" : "none";
    btn.classList.toggle("is-active", allowed && panelKey === ADMIN_UI_STATE.activePanel);
  });
}

function setActiveAdminPanel(panelKey) {
  ADMIN_UI_STATE.activePanel = panelKey && canAccessAdminPanel(panelKey) ? panelKey : null;
  setAdminMenuOpen(false);
  setAdminMenuVisibility();
  setMemberStatusAdminVisibility();
  setAhdAdminVisibility();
  setMemberManageAdminVisibility();
  if (typeof setQaAdminVisibility === "function") setQaAdminVisibility();
  if (typeof setLibraryAdminVisibility === "function") setLibraryAdminVisibility();
}

function syncBodyModalLock() {
  const hasOpenModal = Boolean(document.querySelector(".tafsir-modal-overlay.open, .member-canvas-window.open"));
  document.body.style.overflow = hasOpenModal ? "hidden" : "";
}

function openMemberCanvasWindow(targetSelector, titleText = "", subText = "", windowStyle = "") {
  const modal = qs("#memberCanvasWindow");
  const mount = qs("#memberCanvasWindowMount");
  const title = qs("#memberCanvasWindowTitle");
  const sub = qs("#memberCanvasWindowSub");
  const target = qs(targetSelector);

  if (!modal || !mount || !target) return;

  closeMemberCanvasWindow();
  const normalizedWindowStyle = String(windowStyle || "").trim();
  if (normalizedWindowStyle) {
    modal.dataset.windowStyle = normalizedWindowStyle;
  } else {
    delete modal.dataset.windowStyle;
  }

  CANVAS_WINDOW_STATE.activeNode = target;
  CANVAS_WINDOW_STATE.originalParent = target.parentNode;
  CANVAS_WINDOW_STATE.originalNextSibling = target.nextSibling;
  CANVAS_WINDOW_STATE.originalHidden = target.hidden;

  target.hidden = false;
  target.classList.add("member-canvas-window-mounted");
  mount.appendChild(target);

  if (title) title.textContent = String(titleText || "").trim() || "نافذة";
  if (sub) sub.textContent = String(subText || "").trim() || "—";

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  if (targetSelector === "#memberCanvasQa" && typeof openQaCanvasCategories === "function") {
    openQaCanvasCategories();
  }
  if (targetSelector === "#memberCanvasAzkar" && typeof openAzkarCanvasChoices === "function") {
    openAzkarCanvasChoices();
  }
  syncBodyModalLock();
}

function closeMemberCanvasWindow() {
  const modal = qs("#memberCanvasWindow");
  const mount = qs("#memberCanvasWindowMount");

  if (CANVAS_WINDOW_STATE.activeNode && CANVAS_WINDOW_STATE.originalParent) {
    const node = CANVAS_WINDOW_STATE.activeNode;
    const parent = CANVAS_WINDOW_STATE.originalParent;
    const nextSibling = CANVAS_WINDOW_STATE.originalNextSibling;

    node.classList.remove("member-canvas-window-mounted");
    node.hidden = Boolean(CANVAS_WINDOW_STATE.originalHidden);

    if (nextSibling && nextSibling.parentNode === parent) {
      parent.insertBefore(node, nextSibling);
    } else {
      parent.appendChild(node);
    }
  }

  CANVAS_WINDOW_STATE.activeNode = null;
  CANVAS_WINDOW_STATE.originalParent = null;
  CANVAS_WINDOW_STATE.originalNextSibling = null;
  CANVAS_WINDOW_STATE.originalHidden = false;

  if (mount) mount.innerHTML = "";
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    delete modal.dataset.windowStyle;
  }
  const back = qs("#memberCanvasWindowBack");
  if (back) {
    back.hidden = true;
    back.textContent = "→";
    back.setAttribute("aria-label", "العودة");
    back.removeAttribute("title");
  }

  syncBodyModalLock();
}

function mountMemberCanvasMembersSection() {
  if (CANVAS_INLINE_STATE.membersMounted) return;
  if (typeof getStandaloneView === "function" && getStandaloneView()) return;

  const slot = qs("#memberCanvasMembersSlot");
  const membersSection = qs("#members");
  if (!slot || !membersSection) return;

  slot.appendChild(membersSection);
  CANVAS_INLINE_STATE.membersMounted = true;
}

function getStandaloneView() {
  try {
    const value = new URL(window.location.href).searchParams.get("view");
    return String(value || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function getStandalonePageUrl(viewKey) {
  const url = new URL(window.location.href);
  url.pathname = /index\.html$/i.test(url.pathname) ? url.pathname : `${url.pathname.replace(/\/?$/, "/")}index.html`;
  url.search = "";
  url.hash = "";
  url.searchParams.set("view", String(viewKey || "").trim().toLowerCase());
  if (typeof previewModeEnabled === "function" && previewModeEnabled()) {
    url.searchParams.set("preview", "1");
  }
  return `${url.pathname}${url.search}`;
}

function getHomePageUrl() {
  const url = new URL(window.location.href);
  url.pathname = /index\.html$/i.test(url.pathname) ? url.pathname : `${url.pathname.replace(/\/?$/, "/")}index.html`;
  url.search = "";
  url.hash = "";
  url.searchParams.set("resume", "1");
  if (typeof previewModeEnabled === "function" && previewModeEnabled()) {
    url.searchParams.set("preview", "1");
  }
  return `${url.pathname}${url.search}`;
}

function openStandalonePage(viewKey) {
  const nextUrl = getStandalonePageUrl(viewKey);
  window.location.assign(nextUrl);
}

function mountStandalonePageTopbar() {
  const topbar = qs("#standalonePageTopbar");
  const homeBtn = qs("#standaloneBackHomeBtn");
  if (homeBtn) {
    homeBtn.setAttribute("href", getHomePageUrl());
  }
  if (getStandaloneView()) {
    topbar?.removeAttribute("hidden");
  }
}

function mountAhdStandaloneExtras() {
  const countdownSlot = qs("#ahdStandaloneCountdownSlot");
  const countdownSection = qs("#countdown");

  if (getStandaloneView() !== "ahd") return;

  countdownSlot?.removeAttribute("hidden");

  if (countdownSlot && countdownSection) {
    countdownSlot.appendChild(countdownSection);
    countdownSection.classList.add("ahd-embedded-countdown");
  }
}

function applyStandaloneViewMode() {
  const view = getStandaloneView();
  if (!view) return;

  document.body.classList.add("member-standalone-view");

  mountStandalonePageTopbar();

  const standaloneTargets = {
    ahd: "#ahd",
    feelings: "#feelings",
    quran: "#qa",
    qa: "#qa",
    rescue: "#rescue",
  };
  const target = qs(standaloneTargets[view] || "");
  if (target) {
    target.classList.add("member-standalone-active");
  }

  if (view === "ahd") {
    mountAhdStandaloneExtras();
  }
}

function wireMemberCanvasWindows() {
  if (CANVAS_WINDOW_STATE.wired) return;
  CANVAS_WINDOW_STATE.wired = true;

  qsa("[data-canvas-window]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openMemberCanvasWindow(
        btn.getAttribute("data-canvas-window") || "",
        btn.getAttribute("data-window-title") || "",
        btn.getAttribute("data-window-sub") || "",
        btn.getAttribute("data-window-style") || ""
      );
    });
  });

  const canvasBack = qs("#memberCanvasWindowBack");
  if (canvasBack) {
    canvasBack.addEventListener("click", () => {
      if (canvasBack.hidden) return;
      if (typeof qaCanvasIsOpen === "function" && qaCanvasIsOpen() && typeof goBackInQaCanvas === "function") {
        goBackInQaCanvas();
      } else if (typeof azkarCanvasIsOpen === "function" && azkarCanvasIsOpen() && typeof goBackInAzkarCanvas === "function") {
        goBackInAzkarCanvas();
      }
    });
  }

  qsa("[data-canvas-scroll]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = qs(btn.getAttribute("data-canvas-scroll") || "");
      if (!target) return;
      try {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {
        target.scrollIntoView();
      }
    });
  });

  qsa("[data-canvas-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const viewKey = String(btn.getAttribute("data-canvas-page") || "").trim();
      if (!viewKey) return;
      openStandalonePage(viewKey);
    });
  });

  qs("#closeMemberCanvasWindow")?.addEventListener("click", closeMemberCanvasWindow);
  qs("#closeMemberCanvasWindow2")?.addEventListener("click", closeMemberCanvasWindow);

  qs("#memberCanvasWindow")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeMemberCanvasWindow();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && qs("#memberCanvasWindow")?.classList.contains("open")) {
      closeMemberCanvasWindow();
    }
  });
}

function getAdminPanelConfig(panelKey) {
  if (panelKey === "member-status") {
    return {
      title: "تقييم الأعضاء",
      sub: "إدارة تمييز الأعضاء من داخل نافذة مستقلة.",
      wrap: "#memberStatusAdminWrap",
      slot: "#memberStatusAdminSlot",
    };
  }

  if (panelKey === "ahd") {
    return {
      title: "إدارة عهد الثبات",
      sub: "إضافة المشاركين إلى المسابقة أو حذفهم من نافذة مستقلة.",
      wrap: "#ahdAdminWrap",
      slot: "#ahdAdminSlot",
    };
  }

  if (panelKey === "member-manage") {
    return {
      title: "إدارة الأعضاء",
      sub: "إضافة عضو جديد أو تعديل اسم عضو وصورته أو حذفه من نافذة مستقلة.",
      wrap: "#memberManageAdminWrap",
      slot: "#memberManageAdminSlot",
    };
  }

  if (panelKey === "qa") {
    return {
      title: "تعديل صفحة سؤال وجواب",
      sub: "أضف القوائم والأسئلة والأجوبة أو احذفها مباشرة من هذه اللوحة.",
      wrap: "#qaAdminWrap",
      slot: "#qaAdminSlot",
    };
  }

  if (panelKey === "library") {
    return {
      title: "إدارة المكتبة",
      sub: "أضف كتابًا برابط عام أو احذف كتابًا من مكتبة التعافي.",
      wrap: "#libraryAdminWrap",
      slot: "#libraryAdminSlot",
    };
  }

  return null;
}

function restoreAdminPanelFromModal() {
  const mount = qs("#adminPanelModalMount");
  if (!mount) return;

  ["member-status", "ahd", "member-manage", "qa", "library"].forEach((panelKey) => {
    const cfg = getAdminPanelConfig(panelKey);
    const wrap = cfg ? qs(cfg.wrap) : null;
    const slot = cfg ? qs(cfg.slot) : null;
    if (!cfg || !wrap || !slot) return;
    if (wrap.parentElement === mount) {
      slot.insertAdjacentElement("afterend", wrap);
    }
  });
}

function setMemberManageStatus(message, isError = false) {
  const el = qs("#memberManageStatus");
  if (!el) return;
  el.textContent = String(message || "").trim();
  el.style.color = isError ? "#ffb4b4" : "";
}

function getEditingManagedMember() {
  const id = String(MEMBER_DIRECTORY_STATE.editingMemberId || "").trim();
  if (!id) return null;
  return getAllMembersList({ includeHidden: true }).find((member) => String(member.id || "").trim() === id) || null;
}

function refreshMemberManageFormState() {
    const m = getEditingManagedMember(); qs('#memberManageFormTitle').textContent = m ? 'تعديل العضو' : 'إضافة عضو جديد';
    qs('#memberManageAddBtn').textContent = m ? 'حفظ التعديل' : 'إضافة العضو'; qs('#memberManageFormHint').textContent = '';
  }

function resetMemberManageForm() {
  MEMBER_DIRECTORY_STATE.pendingImageDataUrl = "";
  MEMBER_DIRECTORY_STATE.editingMemberId = "";
  MEMBER_DIRECTORY_STATE.pendingAccessPinRemoval = false;
  const name = qs("#memberManageName");
  const pin = qs("#memberManageAccessPin");
  const image = qs("#memberManageImage");
  const preview = qs("#memberManagePreview");
  if (name) name.value = "";
  if (pin) pin.value = "";
  if (image) image.value = "";
  if (preview) preview.src = DEFAULT_MEMBER_AVATAR_SRC;
  setMemberManageStatus("");
  refreshMemberManageFormState();
}

function beginEditManagedMember(memberId) {
  const id = String(memberId || "").trim();
  if (!id) return;
  const member = getAllMembersList({ includeHidden: true }).find((item) => String(item.id || "").trim() === id);
  if (!member) return;

  MEMBER_DIRECTORY_STATE.editingMemberId = id;
  MEMBER_DIRECTORY_STATE.pendingImageDataUrl = String(member.src || "").trim();
  MEMBER_DIRECTORY_STATE.pendingAccessPinRemoval = false;

  const name = qs("#memberManageName");
  const pin = qs("#memberManageAccessPin");
  const image = qs("#memberManageImage");
  const preview = qs("#memberManagePreview");
  if (name) name.value = member.name || "";
  if (pin) pin.value = "";
  if (image) image.value = "";
  if (preview) preview.src = resolveMemberAvatarSrc(member.src);

  setMemberManageStatus(memberHasAccessPin(id) ? "يمكنك تعديل الاسم أو الصورة أو كتابة كلمة مرور جديدة." : "هذا العضو لا يملك كلمة مرور دخول بعد. أضف واحدة إذا أردت.");
  refreshMemberManageFormState();
  renderMemberManageAdminList();
  name?.focus?.();
}

function markManagedMemberPinForRemoval() {
  const editingMember = getEditingManagedMember();
  if (!editingMember) return;
  if (!memberHasAccessPin(editingMember.id)) {
    setMemberManageStatus("هذا العضو لا يملك كلمة سر محفوظة أصلًا.", true);
    return;
  }
  const ok = confirm(`هل تريد مسح كلمة السر والصلاحيات الممنوحة عن العضو “${editingMember.name}”؟`);
  if (!ok) return;
  MEMBER_DIRECTORY_STATE.pendingAccessPinRemoval = true;
  const pin = qs("#memberManageAccessPin");
  if (pin) pin.value = "";
  setMemberManageStatus("سيتم مسح كلمة السر والصلاحيات الممنوحة عند حفظ التعديل.");
  refreshMemberManageFormState();
}

function createManagedMemberId(name) {
  return `custom_member_${slugifyName(name)}_${Date.now().toString(36)}`;
}

function dataUrlSizeEstimate(dataUrl) {
  const value = String(dataUrl || "");
  const commaIndex = value.indexOf(",");
  const payload = commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
  return Math.ceil((payload.length * 3) / 4);
}

function readImageAsOptimizedDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("NO_FILE"));

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("READ_FAILED"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("IMAGE_INVALID"));
      img.onload = () => {
        try {
          const attempts = [
            { maxSide: 320, quality: 0.72 },
            { maxSide: 280, quality: 0.68 },
            { maxSide: 240, quality: 0.64 },
            { maxSide: 220, quality: 0.58 },
            { maxSide: 180, quality: 0.54 },
          ];
          let best = "";

          for (const attempt of attempts) {
            const scale = Math.min(1, attempt.maxSide / Math.max(img.width || 1, img.height || 1));
            const width = Math.max(1, Math.round((img.width || 1) * scale));
            const height = Math.max(1, Math.round((img.height || 1) * scale));
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("CANVAS_FAILED"));
            ctx.fillStyle = "#0f1622";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL("image/jpeg", attempt.quality);
            best = dataUrl;
            if (dataUrlSizeEstimate(dataUrl) <= 110 * 1024) {
              resolve(dataUrl);
              return;
            }
          }

          if (best && dataUrlSizeEstimate(best) <= 150 * 1024) {
            resolve(best);
            return;
          }

          reject(new Error("IMAGE_TOO_LARGE"));
        } catch (e) {
          reject(e);
        }
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

async function updateManagedMemberPermission(id, key, enabled) {
    if (!FB_STATE.isAdmin || !Object.hasOwn(ASSIGNABLE_MEMBER_PERMISSIONS, key)) return;
    const { db, doc, setDoc, serverTimestamp } = window.FB;
    await setDoc(doc(db, FIRESTORE_MEMBER_PERMISSIONS, id), { memberId: id, ...getMemberPermissions(id), [key]: Boolean(enabled), updatedAt: serverTimestamp() });
    setMemberManageStatus('تم حفظ الصلاحية.');
  }

function renderMemberManageAdminList() {
  const el = qs("#memberManageList");
  if (!el) return;

  const members = getAllMembersList()
    .slice()
    .sort(compareMembersByStatusThenName);

  el.innerHTML = members.length
    ? members.map((member) => {
        const locked = isAmjadMember(member);
        const isCustom = member.source === "custom" && !locked;
        const status = getMemberStatus(member.id);
        const accessRecord = getMemberAccessRecord(member.id);
        const hasPin = Boolean(accessRecord?.accountManaged);
        const permissions = getMemberPermissions(member.id);
        const isEditing = String(MEMBER_DIRECTORY_STATE.editingMemberId || "").trim() === String(member.id || "").trim();
        return `
          <div class="member-manage-card${isEditing ? " is-editing" : ""}">
            <div class="member-manage-head">
              <img class="${status ? `member-avatar ${memberStatusClass(status)}` : "member-avatar"}" loading="lazy" decoding="async" fetchpriority="low" src="${resolveMemberAvatarSrc(member.src)}" alt="${escapeHtml(member.name)}" />
              <div>
                <div class="member-manage-name">${escapeHtml(member.name)}</div>
                <div class="member-manage-meta">المعرّف: ${escapeHtml(member.id)}</div>
              </div>
            </div>
            <div class="member-manage-badges">
              <span class="member-manage-badge ${isCustom ? "custom" : "static"}">${isCustom ? "مضاف من أمجد" : "عضو أساسي"}</span>
              <span class="member-manage-badge">${escapeHtml(memberStatusLabel(status))}</span>
              <span class="member-manage-badge ${hasPin ? "secure" : "unsecured"}">${hasPin ? "بكلمة مرور" : "بانتظار حساب"}</span>
            </div>
            <div class="member-manage-access-line">
              ${
                hasPin
                  ? `الحساب يُدار بأداة الإدارة المحلية.`
                  : `لم يُنشأ حساب دخول لهذا العضو بعد.`
              }
            </div>
            <div class="member-manage-permission-box">
              <div class="member-manage-permission-head">
                <span>صلاحيات الإدارة</span>
                <span>${locked ? "كاملة" : escapeHtml(memberPermissionsSummary(permissions))}</span>
              </div>
              ${
                locked
                  ? `<div class="member-manage-permission-note">أمجد يدير الأعضاء والصلاحيات كاملة.</div>`
                  : !hasPin
                    ? `<div class="member-manage-permission-note">الحساب يُدار بأداة الإدارة المحلية.</div>`
                    : `<div class="member-manage-permission-actions">
                        ${Object.entries(ASSIGNABLE_MEMBER_PERMISSIONS).map(([key, label]) => {
                          const granted = Boolean(permissions[key]);
                          return `<button class="member-manage-permission-btn${granted ? " is-granted" : ""}" type="button" data-member-permission="${escapeHtml(member.id)}" data-member-permission-key="${escapeHtml(key)}" data-member-permission-enabled="${granted ? "true" : "false"}" aria-pressed="${granted ? "true" : "false"}">${granted ? "مسموح" : "منح"}: ${escapeHtml(label)}</button>`;
                        }).join("")}
                      </div>`
              }
            </div>
            <div class="member-manage-card-actions">
              <button class="member-manage-edit" type="button" data-member-edit="${escapeHtml(member.id)}">تعديل</button>
              <button class="member-manage-pin-toggle" type="button" disabled>
                مخفية للأمان
              </button>
              <button class="member-manage-remove" type="button" data-member-remove="${escapeHtml(member.id)}" ${locked ? "disabled" : ""}>
                ${locked ? "لا يمكن حذف أمجد" : "حذف العضو"}
              </button>
            </div>
          </div>
        `;
      }).join("")
    : `<div class="member-manage-empty">لا يوجد أعضاء ظاهرون الآن.</div>`;

  el.querySelectorAll("[data-member-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      beginEditManagedMember(btn.getAttribute("data-member-edit"));
    });
  });

  el.querySelectorAll("[data-member-remove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const memberId = btn.getAttribute("data-member-remove");
      await deleteManagedMember(memberId);
    });
  });

  el.querySelectorAll("[data-member-permission]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const memberId = btn.getAttribute("data-member-permission");
      const permissionKey = btn.getAttribute("data-member-permission-key");
      const granted = btn.getAttribute("data-member-permission-enabled") === "true";
      await updateManagedMemberPermission(memberId, permissionKey, !granted);
    });
  });
}

async function addManagedMember() {
    if (!FB_STATE.isAdmin) return;
    const previous = getEditingManagedMember(); const name = String(qs('#memberManageName').value || '').trim();
    const src = MEMBER_DIRECTORY_STATE.pendingImageDataUrl || previous?.src || DEFAULT_MEMBER_AVATAR_SRC;
    if (!name) return setMemberManageStatus('اكتب اسم العضو.', true);
    const id = previous?.id || createManagedMemberId(name); const { db, doc, setDoc, serverTimestamp } = window.FB;
    try { await setDoc(doc(db, FIRESTORE_CUSTOM_MEMBERS, customMemberDocId(id)), { type: 'custom_member', memberId: id, name, src, updatedAt: serverTimestamp(), ...(previous ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
      resetMemberManageForm(); setMemberManageStatus('تم حفظ العضو.');
    } catch { setMemberManageStatus('تعذر حفظ العضو.', true); }
  }

async function deleteManagedMember(memberId) {
  if (!FB_STATE.isAdmin) return;

  const id = String(memberId || "").trim();
  const member = getAllMembersList({ includeHidden: true }).find((item) => String(item.id) === id);
  if (!member) return;
  if (isAmjadMember(member)) {
    showIdentityToast("لا يمكن حذف أمجد من لوحة الإدارة.");
    return;
  }

  const ok = confirm(`هل تريد حذف العضو “${member.name}”؟`);
  if (!ok) return;

  const mergedCustomMembers = getMergedCustomMembersMap();
  const wasCustom = mergedCustomMembers.has(id);
  const wasLocallyHidden = MEMBER_DIRECTORY_STATE.localHiddenMemberIds.has(id);

  if (wasCustom) {
    MEMBER_DIRECTORY_STATE.localCustomMembers.delete(id);
    MEMBER_DIRECTORY_STATE.localHiddenMemberIds.add(id);
    MEMBER_DIRECTORY_STATE.pendingDeletedCustomMemberIds.add(id);
  } else {
    MEMBER_DIRECTORY_STATE.localHiddenMemberIds.add(id);
    MEMBER_DIRECTORY_STATE.pendingHiddenMemberIds.add(id);
  }
  persistLocalMemberDirectoryState();
  refreshMemberDirectoryUI();

  const { db, doc, deleteDoc, setDoc, serverTimestamp } = window.FB;
  try {
    const primaryOps = wasCustom
      ? [
          deleteDoc(doc(db, FIRESTORE_CUSTOM_MEMBERS, customMemberDocId(id))),
          deleteDoc(doc(db, FIRESTORE_HIDDEN_MEMBERS, hiddenMemberDocId(id))),
        ]
      : [
          setDoc(
            doc(db, FIRESTORE_HIDDEN_MEMBERS, hiddenMemberDocId(id)),
            { type: "hidden_member", memberId: id, hiddenAt: serverTimestamp(), name: member.name },
            { merge: true }
          ),
        ];

    await Promise.all(primaryOps);

    const cleanup = [
      deleteDoc(doc(db, "ahdMembers", id)),
      deleteDoc(doc(db, FIRESTORE_STREAKS, id)),
      deleteDoc(doc(db, FIRESTORE_MEMBER_STATUS, id)),
      deleteDoc(doc(db, FIRESTORE_MEMBER_STATUS, memberStatusDocId(id, "elite"))),
      deleteDoc(doc(db, FIRESTORE_MEMBER_STATUS, memberStatusDocId(id, "active"))),
      deleteDoc(doc(db, FIRESTORE_MEMBER_STATUS, memberStatusDocId(id, "lazy"))),
      deleteDoc(doc(db, FIRESTORE_MEMBER_STATUS, memberStatusOverrideDocId(id))),
      deleteDoc(doc(db, FIRESTORE_MEMBER_ACCESS, memberAccessDocId(id))),
      deleteDoc(doc(db, FIRESTORE_MEMBER_PERMISSIONS, memberPermissionsDocId(id))),
    ];

    const cleanupResults = await Promise.allSettled(cleanup);
    const cleanupFailed = cleanupResults.some((item) => item.status === "rejected");
    if (cleanupFailed) {
      console.warn("Member deleted but some related cleanup operations failed", { memberId: id, cleanupResults });
    }
    showIdentityToast(`تم حذف العضو ${member.name}`);
  } catch (e) {
    MEMBER_DIRECTORY_STATE.pendingDeletedCustomMemberIds.delete(id);
    MEMBER_DIRECTORY_STATE.pendingHiddenMemberIds.delete(id);
    if (!wasCustom && !wasLocallyHidden) {
      MEMBER_DIRECTORY_STATE.localHiddenMemberIds.add(id);
    }
    persistLocalMemberDirectoryState();
    refreshMemberDirectoryUI();
    showIdentityToast("تم حذف العضو على هذا الجهاز، لكن المزامنة السحابية تعذّرت.");
    console.error("Failed to sync deleted member", e);
  }
}

function wireMemberManageAdminControls() {
  if (MEMBER_DIRECTORY_STATE.controlsWired) return;
  MEMBER_DIRECTORY_STATE.controlsWired = true;

  const fileInput = qs("#memberManageImage");
  const preview = qs("#memberManagePreview");
  const nameInput = qs("#memberManageName");
  const pinInput = qs("#memberManageAccessPin");
  const addBtn = qs("#memberManageAddBtn");
  const resetBtn = qs("#memberManageResetBtn");
  const clearPinBtn = qs("#memberManageClearPinBtn");

  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      const editingMember = getEditingManagedMember();
      MEMBER_DIRECTORY_STATE.pendingImageDataUrl = editingMember?.src || "";
      if (preview) preview.src = resolveMemberAvatarSrc(editingMember?.src);
      return;
    }

    setMemberManageStatus("جارٍ تجهيز الصورة...");
    try {
      const dataUrl = await readImageAsOptimizedDataUrl(file);
      MEMBER_DIRECTORY_STATE.pendingImageDataUrl = dataUrl;
      if (preview) preview.src = dataUrl;
      setMemberManageStatus("الصورة جاهزة للإضافة.");
    } catch (e) {
      MEMBER_DIRECTORY_STATE.pendingImageDataUrl = "";
      if (preview) preview.src = DEFAULT_MEMBER_AVATAR_SRC;
      const code = String(e?.message || "");
      setMemberManageStatus(code === "IMAGE_TOO_LARGE" ? "الصورة ما تزال كبيرة جدًا بعد الضغط. اختر صورة أصغر." : "تعذّر قراءة الصورة المختارة.", true);
    }
  });

  addBtn?.addEventListener("click", addManagedMember);
  resetBtn?.addEventListener("click", resetMemberManageForm);
  clearPinBtn?.addEventListener("click", markManagedMemberPinForRemoval);
  nameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addManagedMember();
  });
  pinInput?.addEventListener("input", () => {
    if (String(pinInput.value || "").trim()) {
      MEMBER_DIRECTORY_STATE.pendingAccessPinRemoval = false;
      refreshMemberManageFormState();
    }
  });
  refreshMemberManageFormState();
}

function initMemberDirectorySystem(options = {}) {
  const activateRemote = Boolean(options.activateRemote);
  const renderMembers = Boolean(options.renderMembers);

  if (!MEMBER_DIRECTORY_STATE.baseMembers.length) {
    MEMBER_DIRECTORY_STATE.baseMembers = STATIC_BASE_MEMBERS.map((member) => ({ ...member }));
  }

  loadLocalMemberDirectoryState();
  loadRemoteMemberDirectoryCache();
  wireMemberManageAdminControls();
  refreshMemberDirectoryUI({ renderMembers });

  if (!activateRemote || MEMBER_DIRECTORY_STATE.listenersAttached) return;

  const tryInit = () => {
    if (!fbAvailable()) return setTimeout(tryInit, 80);
    MEMBER_DIRECTORY_STATE.listenersAttached = true;

    const { db, onSnapshot, collection } = window.FB;

    window.FB.publicBucketSnapshot(['custom__','hidden__'], (snap) => {
      const customMembers = new Map();
      const hiddenMemberIds = new Set();
      const accessById = new Map();

      snap.forEach((docSnap) => {
        const docId = String(docSnap.id || "");
        const data = docSnap.data() || {};

        if (docId.startsWith("custom__")) {
          const memberId = String(data.memberId || docId.replace(/^custom__/, "")).trim();
          const name = String(data.name || "").trim();
          const src = String(data.src || "").trim();
          if (memberId && name && src && !isLegacyRemovedStaticMemberId(memberId)) {
            customMembers.set(memberId, { id: memberId, name, src, source: "custom" });
          }
          return;
        }

        if (docId.startsWith("hidden__")) {
          const memberId = String(data.memberId || docId.replace(/^hidden__/, "")).trim();
          if (memberId) hiddenMemberIds.add(memberId);
          return;
        }

        if (docId.startsWith("access__")) {
          const record = memberAccessRecordFromData(docId, data);
          if (!record) return;
          accessById.set(record.memberId, record);
          if (record.hasLegacyPlaintext) queueLegacyMemberAccessCleanup(record.memberId);
        }
      });

      MEMBER_DIRECTORY_STATE.pendingDeletedCustomMemberIds.forEach((id) => {
        if (!customMembers.has(id)) MEMBER_DIRECTORY_STATE.pendingDeletedCustomMemberIds.delete(id);
      });
      MEMBER_DIRECTORY_STATE.pendingHiddenMemberIds.forEach((id) => {
        if (hiddenMemberIds.has(id)) MEMBER_DIRECTORY_STATE.pendingHiddenMemberIds.delete(id);
      });

      MEMBER_DIRECTORY_STATE.remoteCustomMembers = customMembers;
      MEMBER_DIRECTORY_STATE.remoteHiddenMemberIds = hiddenMemberIds;
      MEMBER_DIRECTORY_STATE.remoteAccessById = accessById;
      MEMBER_DIRECTORY_STATE.remoteAccessSnapshotReady = true;
      syncStoredPermissionsForCurrentUser();
      saveRemoteMemberDirectoryCache();
      refreshMemberDirectoryUI();
    });
  };

  tryInit();
}

function openAdminPanelModal(panelKey) {
  if (!canAccessAdminPanel(panelKey)) return;

  const cfg = getAdminPanelConfig(panelKey);
  const modal = qs("#adminPanelModal");
  const mount = qs("#adminPanelModalMount");
  const title = qs("#adminPanelModalTitle");
  const sub = qs("#adminPanelModalSub");
  const wrap = cfg ? qs(cfg.wrap) : null;

  if (!cfg || !modal || !mount || !wrap) return;

  restoreAdminPanelFromModal();
  setActiveAdminPanel(panelKey);

  if (title) title.textContent = cfg.title;
  if (sub) sub.textContent = cfg.sub;

  mount.appendChild(wrap);
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  syncBodyModalLock();

  if (panelKey === "member-status") {
    renderMemberStatusAdminList();
  }
  if (panelKey === "ahd") {
    renderAhdAdminLists(qs("#ahdAdminSearch")?.value || "");
  }
  if (panelKey === "member-manage") {
    renderMemberManageAdminList();
    setTimeout(() => qs("#memberManageName")?.focus?.(), 60);
  }
  if (panelKey === "qa" && typeof renderQaAdminPanel === "function") {
    renderQaAdminPanel();
    setTimeout(() => qs("#qaAdminCategoryName")?.focus?.(), 60);
  }
  if (panelKey === "library" && typeof renderLibraryAdminPanel === "function") {
    renderLibraryAdminPanel();
    setTimeout(() => qs("#libraryAdminTitle")?.focus?.(), 60);
  }
}

function closeAdminPanelModal() {
  restoreAdminPanelFromModal();
  setActiveAdminPanel(null);

  const modal = qs("#adminPanelModal");
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  syncBodyModalLock();
}

function wireAdminQuickMenu() {
  if (ADMIN_UI_STATE.wired) return;
  ADMIN_UI_STATE.wired = true;

  const toggle = qs("#adminQuickToggle");
  const panel = qs("#adminQuickPanel");
  const modal = qs("#adminPanelModal");
  const closeBtn = qs("#closeAdminPanelModal");
  const closeBtn2 = qs("#closeAdminPanelModal2");

  toggle?.addEventListener("click", (e) => {
    e.stopPropagation();
    setAdminMenuOpen(!ADMIN_UI_STATE.menuOpen);
  });

  panel?.addEventListener("click", (e) => e.stopPropagation());

  document.querySelectorAll("[data-admin-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openAdminPanelModal(btn.getAttribute("data-admin-open"));
    });
  });

  document.querySelectorAll("[data-admin-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeAdminPanelModal();
    });
  });

  closeBtn?.addEventListener("click", closeAdminPanelModal);
  closeBtn2?.addEventListener("click", closeAdminPanelModal);

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeAdminPanelModal();
  });

  document.addEventListener("click", (e) => {
    const menu = qs("#adminQuickMenu");
    if (!ADMIN_UI_STATE.menuOpen || !menu || menu.contains(e.target)) return;
    setAdminMenuOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (ADMIN_UI_STATE.menuOpen) setAdminMenuOpen(false);
      else if (modal?.classList.contains("open")) closeAdminPanelModal();
    }
  });
}

function setMemberManageAdminVisibility() {
  const wrap = qs("#memberManageAdminWrap");
  const show = hasMemberManageAdminAccess() && ADMIN_UI_STATE.activePanel === "member-manage";
  if (wrap) {
    wrap.style.display = show ? "block" : "none";
    wrap.setAttribute("aria-hidden", show ? "false" : "true");
  }
}

function toLocalISODate(d) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }

    function dayOfYear(d) {
      const start = new Date(d.getFullYear(), 0, 0);
      return Math.floor((d - start) / 86400000);
    }

    function formatArabicNumber(n) {
      return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
    }

    function storageKeyForToday(isoDate) {
      return `wa3i_${currentUserId()}_daily_${isoDate}`;
    }

    function getDailyState(isoDate) {
      const raw = window.WA3I_SESSION.storage.getItem(storageKeyForToday(isoDate));
      if (!raw) return null;
      try {
        return normalizeDailyState(JSON.parse(raw));
      } catch {
        return null;
      }
    }

    function setDailyState(isoDate, state) {
      window.WA3I_SESSION.storage.setItem(storageKeyForToday(isoDate), JSON.stringify(state));
    }

    function defaultDailyState() {
      const tasks = {};
      TASK_KEYS.forEach((k) => (tasks[k] = false));
      return {
        tasks,
        breathSecondsLeft: CONFIG.BREATH.TOTAL_SECONDS,
        breathRunning: false,
        breathCompleted: false,
        completedAll: false,
        completedAt: null,
        riskCheck: defaultRiskCheckState(),
      };
    }

    function defaultRiskCheckState() {
      return {
        mood: "",
        isolation: "",
        urge: "",
        level: "unknown",
        score: null,
        answeredAt: null,
      };
    }

    function normalizeRiskCheckState(risk) {
      const base = defaultRiskCheckState();
      if (!risk || typeof risk !== "object") return base;

      RISK_CHECK_FIELDS.forEach((field) => {
        const raw = String(risk[field] || "");
        if (raw && RISK_CHECK_LOOKUP[field]?.[raw]) base[field] = raw;
      });

      base.level = ["low", "medium", "high"].includes(String(risk.level || "")) ? String(risk.level) : "unknown";
      base.answeredAt = typeof risk.answeredAt === "string" ? risk.answeredAt : null;

      const parsedScore = Number(risk.score);
      if (Number.isFinite(parsedScore)) base.score = parsedScore;

      return base;
    }

    function normalizeDailyState(rawState) {
      const base = defaultDailyState();
      if (!rawState || typeof rawState !== "object") return base;

      TASK_KEYS.forEach((k) => {
        const aliases = Array.isArray(LEGACY_TASK_ALIASES[k]) ? LEGACY_TASK_ALIASES[k] : [k];
        base.tasks[k] = aliases.some((alias) => Boolean(rawState.tasks && rawState.tasks[alias]));
      });

      const seconds = Number(rawState.breathSecondsLeft);
      if (Number.isFinite(seconds)) base.breathSecondsLeft = Math.max(0, Math.min(CONFIG.BREATH.TOTAL_SECONDS, Math.floor(seconds)));

      base.breathRunning = Boolean(rawState.breathRunning);
      base.breathCompleted = Boolean(rawState.breathCompleted || (rawState.tasks && rawState.tasks.deep_breath));
      base.completedAll = Boolean(rawState.completedAll) && TASK_KEYS.every((k) => Boolean(base.tasks[k]));
      base.completedAt = base.completedAll && typeof rawState.completedAt === "string" ? rawState.completedAt : null;
      base.riskCheck = normalizeRiskCheckState(rawState.riskCheck);

      return base;
    }

    function isRiskCheckComplete(risk) {
      return RISK_CHECK_FIELDS.every((field) => Boolean(risk?.[field]));
    }

    function evaluateRiskCheck(risk) {
      const normalized = normalizeRiskCheckState(risk);
      if (!isRiskCheckComplete(normalized)) {
        return {
          complete: false,
          level: "neutral",
          pill: "لم يُفحص بعد",
          title: "ابدأ الفحص السريع أولًا",
          description: "اختر إجابة واحدة من كل سطر، وسيظهر لك مستوى الخطر الحالي وما الأنسب فعله الآن.",
          advices: [
            "اختر حالتك بصدق حتى يعطيك المؤشر التدخل الأنسب.",
            "أعد الفحص في أي لحظة إذا تغير مزاجك أو شعرت ببداية ضعف.",
          ],
          score: null,
        };
      }

      const moodScore = RISK_CHECK_LOOKUP.mood[normalized.mood]?.score || 0;
      const isolationScore = RISK_CHECK_LOOKUP.isolation[normalized.isolation]?.score || 0;
      const urgeScore = RISK_CHECK_LOOKUP.urge[normalized.urge]?.score || 0;
      const score = moodScore + isolationScore + urgeScore;

      let level = "low";
      if (
        normalized.mood === "threatened" ||
        normalized.urge === "high" ||
        score >= 5 ||
        (normalized.isolation === "alone" && normalized.urge !== "none")
      ) {
        level = "high";
      } else if (
        score >= 2 ||
        normalized.isolation === "alone" ||
        normalized.mood === "tired"
      ) {
        level = "medium";
      }

      if (level === "high") {
        return {
          complete: true,
          level,
          pill: "وضع نجدة",
          title: "الخطر مرتفع الآن، لا تفاوض الرغبة.",
          description: "المؤشر يرى أنك تحتاج تدخلًا مباشرًا هذه اللحظة. غيّر المكان، ابدأ التنفس، ثم افتح خطة النجاة فورًا.",
          advices: [
            "لا تبق وحدك ولا تترك نفسك مع الشاشة في فراغ صامت.",
            "ابدأ 60 ثانية تنفس الآن ثم نفّذ أول خطوة من خطة النجاة مباشرة.",
            "افتح الأذكار أو سؤالًا وجوابًا لتشغل ذهنك ووقتك بشيء نافع فورًا.",
            "إذا أمكن، اقترب من الناس أو أرسل رسالة سريعة لشخص تثق به.",
          ],
          score,
        };
      }

      if (level === "medium") {
        return {
          complete: true,
          level,
          pill: "تنبيه مبكر",
          title: "هناك مؤشرات ضعف، خذ التدخل الصغير الآن.",
          description: "الوضع ليس طارئًا بعد، لكنه لا يناسب التسويف. تدخل خفيف الآن قد يمنع موجة أكبر بعد قليل.",
          advices: [
            "ابدأ دقيقة التنفس الآن لكسر التوتر الأول.",
            "لا تطل الجلوس في عزلة؛ تحرك أو بدّل مكانك ولو لدقائق.",
            "افتح الأذكار أو سؤالًا وجوابًا قبل أن يتحول التعب إلى انجراف.",
          ],
          score,
        };
      }

      return {
        complete: true,
        level,
        pill: "وضع مطمئن",
        title: "وضعك الحالي مطمئن، حافظ على الإيقاع.",
        description: "المؤشر مطمئن الآن، لكن الأفضل أن تبدأ مهمة نافعة مباشرة حتى لا يعود الفراغ ويتغير مزاجك لاحقًا.",
        advices: [
          "اختر خطوة وقائية نافعة الآن ولا تؤجل البداية.",
          "إذا أحسست بتغير مفاجئ خلال اليوم فأعد الفحص في أقل من 30 ثانية.",
        ],
        score,
      };
    }

    function formatRiskAnsweredAt(isoString) {
      if (!isoString) return "لا يوجد تقييم محفوظ لهذا اليوم بعد.";
      const dt = new Date(isoString);
      if (Number.isNaN(dt.getTime())) return "تم حفظ التقييم لهذا اليوم.";
      return `آخر تقييم: ${dt.toLocaleTimeString("ar", { hour: "numeric", minute: "2-digit" })}`;
    }

    function chooseRiskAzkarConfig(state) {
      const hour = new Date().getHours();
      const adhkarDone = Boolean(state?.tasks?.habit_adhkar || state?.tasks?.morning_adhkar || state?.tasks?.evening_adhkar);
      if (!adhkarDone) return hour < 15 ? CONFIG.AZKAR.MORNING : CONFIG.AZKAR.EVENING;
      return hour < 15 ? CONFIG.AZKAR.MORNING : CONFIG.AZKAR.EVENING;
    }

    function renderRiskCheckUI(state) {
      const card = qs("#riskCheckCard");
      const pill = qs("#riskLevelPill");
      const meta = qs("#riskAnsweredAt");
      const resultBox = qs("#riskResultBox");
      const title = qs("#riskResultTitle");
      const desc = qs("#riskResultDesc");
      const adviceList = qs("#riskAdviceList");
      const breathBtn = qs("#riskActionBreath");
      const rescueCard = qs("#tcard-rescue");
      if (!card || !pill || !meta || !resultBox || !title || !desc || !adviceList) return;

      const risk = normalizeRiskCheckState(state?.riskCheck);
      const evaluation = evaluateRiskCheck(risk);
      WA3I_CTX.riskEvaluation = evaluation;

      qsa(".risk-option-btn").forEach((btn) => {
        const group = btn.getAttribute("data-risk-group");
        const value = btn.getAttribute("data-risk-value");
        const selected = risk[group] === value;
        btn.classList.toggle("is-selected", selected);
        btn.setAttribute("aria-pressed", selected ? "true" : "false");
      });

      card.classList.remove("is-low", "is-medium", "is-high");
      resultBox.classList.remove("is-low", "is-medium", "is-high");
      pill.className = "risk-level-pill";

      if (evaluation.level === "low") {
        card.classList.add("is-low");
        resultBox.classList.add("is-low");
        pill.classList.add("is-low");
      } else if (evaluation.level === "medium") {
        card.classList.add("is-medium");
        resultBox.classList.add("is-medium");
        pill.classList.add("is-medium");
      } else if (evaluation.level === "high") {
        card.classList.add("is-high");
        resultBox.classList.add("is-high");
        pill.classList.add("is-high");
      } else {
        pill.classList.add("is-neutral");
      }

      pill.textContent = evaluation.pill;
      meta.textContent = formatRiskAnsweredAt(risk.answeredAt);
      title.textContent = evaluation.title;
      desc.textContent = evaluation.description;
      adviceList.innerHTML = evaluation.advices.map((item) => `
        <div class="risk-advice-item">
          <span class="risk-advice-mark">•</span>
          <span>${escapeHtml(item)}</span>
        </div>
      `).join("");

      if (breathBtn) {
        if (state?.breathRunning) breathBtn.textContent = "التنفس جارٍ الآن";
        else if (state?.breathCompleted) breathBtn.textContent = "أعد دقيقة تنفس";
        else breathBtn.textContent = evaluation.level === "high" ? "ابدأ النجدة الآن" : "ابدأ التنفس الآن";
        breathBtn.classList.toggle("emergency", evaluation.level === "high");
      }

      if (rescueCard) {
        rescueCard.classList.remove("is-watch", "is-urgent");
        if (evaluation.level === "high") rescueCard.classList.add("is-urgent");
        else if (evaluation.level === "medium") rescueCard.classList.add("is-watch");
      }

      if (getStandaloneView() === "rescue" && typeof renderRescueCenterModal === "function") {
        renderRescueCenterModal();
      }
    }

    function applyRiskCheckAnswer(group, value) {
      const todayISO = WA3I_CTX.todayISO;
      const state = WA3I_CTX.state;
      if (!todayISO || !state) return;

      const next = normalizeRiskCheckState(state.riskCheck);
      next[group] = next[group] === value ? "" : value;

      const evaluation = evaluateRiskCheck(next);
      next.level = evaluation.complete ? evaluation.level : "unknown";
      next.score = evaluation.complete ? evaluation.score : null;
      next.answeredAt = new Date().toISOString();

      state.riskCheck = next;
      renderRiskCheckUI(state);
      setDailyState(todayISO, state);
    }

    function resetRiskCheck() {
      const todayISO = WA3I_CTX.todayISO;
      const state = WA3I_CTX.state;
      if (!todayISO || !state) return;
      state.riskCheck = defaultRiskCheckState();
      renderRiskCheckUI(state);
      setDailyState(todayISO, state);
    }

    function wireRiskCheckUI() {
      if (RISK_CHECK_WIRED) return;
      RISK_CHECK_WIRED = true;

      qsa(".risk-option-btn").forEach((btn) => {
        btn.onclick = () => {
          const group = btn.getAttribute("data-risk-group");
          const value = btn.getAttribute("data-risk-value");
          if (!group || !value) return;
          applyRiskCheckAnswer(group, value);
        };
      });

      const resetBtn = qs("#riskResetBtn");
      if (resetBtn) resetBtn.onclick = () => resetRiskCheck();

      const breathBtn = qs("#riskActionBreath");
      if (breathBtn) {
        breathBtn.onclick = () => {
          const todayISO = WA3I_CTX.todayISO;
          const state = WA3I_CTX.state;
          if (!todayISO || !state) return;
          if (state.breathRunning) {
            showToast("مؤقت التنفس يعمل بالفعل.");
            return;
          }
          startBreathTimer(todayISO, state);
          showToast("ابدأ التنفس الآن وخفف التوتر الأول.");
        };
      }

      const rescueBtn = qs("#riskActionRescue");
      if (rescueBtn) {
        rescueBtn.onclick = () => {
          qs("#openRescueCenter")?.click();
        };
      }

      const azkarBtn = qs("#riskActionAzkar");
      if (azkarBtn) {
        azkarBtn.onclick = () => {
          openAzkarReader(chooseRiskAzkarConfig(WA3I_CTX.state));
        };
      }
    }

    function wireDailyVisibilityPause() {
      if (DAILY_VISIBILITY_WIRED) return;
      DAILY_VISIBILITY_WIRED = true;

      document.addEventListener("visibilitychange", () => {
        const todayISO = WA3I_CTX.todayISO;
        const state = WA3I_CTX.state;
        if (!todayISO || !state) return;
        if (document.hidden && state.breathRunning) {
          stopBreathTimer(state);
          setDailyState(todayISO, state);
        }
      });
    }

    function setCheckbox(taskKey, checked) {
      const el = qs(`input[type="checkbox"][data-task="${taskKey}"]`);
      if (el) el.checked = Boolean(checked);
    }

    function isAllCompleted(state) {
      return TASK_KEYS.every((k) => Boolean(state.tasks[k]));
    }

    function getStreak() {
      const raw = window.WA3I_SESSION.storage.getItem(userKey("streak"));
      const n = parseInt(raw || "0", 10);
      return Number.isFinite(n) ? n : 0;
    }

function setStreak(n) {
      window.WA3I_SESSION.storage.setItem(userKey("streak"), String(n));
      // Also update shared streaks map so getStreakForUserId returns correct value immediately
      const uid = currentUserId();
      if (uid) SHARED_STREAKS.set(uid, n);
      const el = qs("#streakCount");
      if (el) el.textContent = String(n);
    }

function getLastCompletedDate() {
      return window.WA3I_SESSION.storage.getItem(userKey("last_completed_date"));
    }

function setLastCompletedDate(isoDate) {
      window.WA3I_SESSION.storage.setItem(userKey("last_completed_date"), isoDate);
    }

function previousISODate(isoDate) {
      const [y, m, d] = isoDate.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() - 1);
      return toLocalISODate(dt);
    }

    function updateProgressUI(state) {
      const done = TASK_KEYS.filter((k) => state.tasks[k]).length;
      const pct = Math.round((done / TASK_KEYS.length) * 100);

      // Text
      const ptEl = qs("#progressText"); if(ptEl) ptEl.textContent = `${pct}%`;
      const pfEl = qs("#progressFill"); if(pfEl) pfEl.style.width = `${pct}%`;

      const msg = pct === 100 ? "ثبتك الله 🤍" :
        pct >= 75 ? "قريب جداً…" :
        pct >= 50 ? "نصفها! واصل." :
        pct >= 25 ? "بداية رائعة." :
        "خطوة واحدة…";
      const psEl = qs("#progressSub"); if(psEl) psEl.textContent = msg;

      // Ring (circumference = 2π×50 ≈ 314)
      const ring = qs("#ringFill");
      if (ring) {
        const offset = 314 - (314 * pct / 100);
        ring.style.strokeDashoffset = offset;
      }

      // Done-state glow on cards
      document.querySelectorAll(".tcard[id]").forEach(card => {
        const taskMap = {
          "tcard-prayer": "habit_fard_mosque",
          "tcard-sleep": "habit_sleep",
          "tcard-adhkar": "habit_adhkar",
          "tcard-gaze": "habit_lower_gaze",
          "tcard-obligations": "habit_obligations",
          "tcard-learning": "habit_learn",
          "tcard-book": "habit_book",
          "tcard-exercise": "habit_exercise"
        };
        const key = taskMap[card.id];
        if (key) card.classList.toggle("is-done", Boolean(state.tasks[key]));
      });
    }

    function maybeUpdateStreakOnFullCompletion(todayISO, state) {
      if (!isAllCompleted(state)) return;
      if (state.completedAll) return;

      const last = getLastCompletedDate();
      const yesterday = previousISODate(todayISO);

      let streak = getStreak();
      if (last === yesterday) streak += 1;
      else if (last === todayISO) streak = streak;
      else streak = 1;

      state.completedAll = true;
      state.completedAt = new Date().toISOString();

      setStreak(streak);
      setLastCompletedDate(todayISO);
    

      syncStreakToFirestore(currentUserId(), streak, todayISO);
}

    function applyLinks() {}

    // ---------------------------
    // Countdown
    // ---------------------------
    function initCountdown() {
      const targetDate = new Date(CONFIG.AHD_TARGET_DATE_ISO).getTime();

      function updateCountdown() {
        const now = new Date().getTime();
        const diff = targetDate - now;

        if (diff <= 0) {
          const el = document.querySelector(".countdown");
          if (el) el.innerHTML = "<p style='color:#7cf2a4;font-size:22px'>تم عهد الثبات بحمد الله</p>";
          return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        const seconds = Math.floor((diff / 1000) % 60);

        qs("#days").textContent = days;
        qs("#hours").textContent = hours;
        qs("#minutes").textContent = minutes;
        qs("#seconds").textContent = seconds;
      }

      updateCountdown();
      if (COUNTDOWN_INTERVAL_ID) clearInterval(COUNTDOWN_INTERVAL_ID);
      COUNTDOWN_INTERVAL_ID = setInterval(updateCountdown, 1000);
    }

    // ---------------------------
    // Breath timer
    // ---------------------------
    function fmtTime(totalSeconds) {
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return `${pad2(m)}:${pad2(s)}`;
    }

    function setBreathUI(state) {
      const timeEl = qs("#breathTime");
      const hintEl = qs("#breathHint");
      const startEl = qs("#breathStart");
      if (timeEl) timeEl.textContent = fmtTime(state.breathSecondsLeft);
      if (hintEl) hintEl.textContent = CONFIG.BREATH.PATTERN_TEXT;

      const done = Boolean(state.breathCompleted);
      const pill = qs("#breathStatus");
      if (pill) {
        pill.textContent = done ? "مكتمل ✅️" : "جاهز الآن";
        pill.classList.toggle("ok", done);
      }

      if (startEl) startEl.textContent = state.breathRunning ? "إيقاف" : "ابدأ";
    }

    function stopBreathTimer(state) {
      if (breathInterval) {
        clearInterval(breathInterval);
        breathInterval = null;
      }
      state.breathRunning = false;
      setBreathUI(state);
      renderRiskCheckUI(state);
    }

    function startBreathTimer(todayISO, state) {
      if (state.breathRunning) {
        stopBreathTimer(state);
        setDailyState(todayISO, state);
        return;
      }

      if (state.breathCompleted && state.breathSecondsLeft === 0) {
        state.breathSecondsLeft = CONFIG.BREATH.TOTAL_SECONDS;
      }
      state.breathCompleted = false;
      state.breathRunning = true;
      setBreathUI(state);
      renderRiskCheckUI(state);
      setDailyState(todayISO, state);

      breathInterval = setInterval(() => {
        if (!state.breathRunning) return;

        state.breathSecondsLeft = Math.max(0, state.breathSecondsLeft - 1);

        if (state.breathSecondsLeft === 0) {
          state.breathCompleted = true;
          stopBreathTimer(state);
          updateProgressUI(state);
          maybeUpdateStreakOnFullCompletion(todayISO, state);
        }

        setBreathUI(state);
        setDailyState(todayISO, state);
      }, 1000);
    }

    function resetBreathTimer(todayISO, state) {
      stopBreathTimer(state);
      state.breathSecondsLeft = CONFIG.BREATH.TOTAL_SECONDS;
      state.breathCompleted = false;
      setBreathUI(state);
      renderRiskCheckUI(state);
      setDailyState(todayISO, state);
    }

    // ---------------------------
    // Toast
    // ---------------------------
    function showToast(msg) {
      const t = qs("#azkarToast");
      if (!t) return;
      t.textContent = msg;
      t.classList.add("open");
      window.setTimeout(() => t.classList.remove("open"), 2400);
    }

    function getAzkarReaderUrl(cfg) {
      const key = String(cfg?.key || "morning").trim().toLowerCase() === "evening" ? "evening" : "morning";
      const url = new URL("azkar.html", window.location.href);
      url.searchParams.set("type", key);
      url.searchParams.set("fresh", "20260411p");
      if (previewModeEnabled()) {
        url.searchParams.set("preview", "1");
      }
      return `${url.pathname}${url.search}`;
    }

    function openAzkarReader(cfg) {
      if (typeof openAzkarCanvas === "function") {
        openAzkarCanvas();
        return;
      }
      window.open(getAzkarReaderUrl(cfg), "_blank", "noopener");
    }

    // ---------------------------
    // Azkar Reader
    // ---------------------------
    function setupAzkarModal() {
      if (AZKAR_MODAL_WIRED) return;
      AZKAR_MODAL_WIRED = true;
      qs("#openMorningAzkar")?.addEventListener("click", () => openAzkarReader(CONFIG.AZKAR.MORNING));
      qs("#openEveningAzkar")?.addEventListener("click", () => openAzkarReader(CONFIG.AZKAR.EVENING));
    }

    function wireDashboardQuickActions() {
      if (DASHBOARD_QUICK_ACTIONS_WIRED) return;
      DASHBOARD_QUICK_ACTIONS_WIRED = true;

      qsa("[data-forward-click]").forEach((btn) => {
        const selector = String(btn.getAttribute("data-forward-click") || "").trim();
        if (!selector) return;

        btn.addEventListener("click", () => {
          const target = qs(selector);
          if (!target) return;
          target.click();
        });
      });
    }

    function safeJsonParse(raw, fallbackValue) {
      try {
        const v = JSON.parse(raw);
        return (v === null || v === undefined) ? fallbackValue : v;
      } catch {
        return fallbackValue;
      }
    }

    function escapeHtml(s) {
      return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    // ---------------------------
    // Daily init
    // ---------------------------
    function initDailyFlow() {
      const today = new Date();
      const todayISO = toLocalISODate(today);

      const weekdayEl = qs("#todayWeekday");
      const dateEl = qs("#todayDate");
      const weekdayText = today.toLocaleDateString("ar", { weekday: "long" });
      const dateText = today.toLocaleDateString("ar", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      if (weekdayEl) weekdayEl.textContent = weekdayText;
      if (dateEl) dateEl.textContent = dateText;

      let state = getDailyState(todayISO);
      if (!state) state = defaultDailyState();
      state = normalizeDailyState(state);

      WA3I_CTX.todayISO = todayISO;
      WA3I_CTX.state = state;

      wireRiskCheckUI();
      wireDailyVisibilityPause();
      if (typeof renderQaTaskMeta === "function") renderQaTaskMeta();

      TASK_KEYS.forEach((k) => {
        if (typeof state.tasks?.[k] !== "boolean") state.tasks[k] = false;
        setCheckbox(k, state.tasks[k]);
      });

      // Prefer the current member's local streak so daily completion never appears to "reset"
      // when Firestore sync is delayed or unavailable.
      const sharedStreak = getStreakForUserId(currentUserId());
      const localStreak = getStreak();
      const initialStreak = Math.max(localStreak, sharedStreak);
      setStreak(initialStreak);
      setBreathUI(state);
      updateProgressUI(state);
      renderRiskCheckUI(state);

      qsa('input[type="checkbox"][data-task]').forEach((el) => {
        el.onchange = () => {
          const key = el.getAttribute("data-task");
          state.tasks[key] = el.checked;

          setBreathUI(state);
          updateProgressUI(state);
          renderRiskCheckUI(state);
          maybeUpdateStreakOnFullCompletion(todayISO, state);
          setDailyState(todayISO, state);
        };
      });

      const breathStart = qs("#breathStart");
      if (breathStart) breathStart.onclick = () => startBreathTimer(todayISO, state);

      const breathReset = qs("#breathReset");
      if (breathReset) breathReset.onclick = () => resetBreathTimer(todayISO, state);

      const resetToday = qs("#resetToday");
      if (resetToday) resetToday.onclick = () => {
        stopBreathTimer(state);
        state = defaultDailyState();
        state = normalizeDailyState(state);
        WA3I_CTX.state = state;

        TASK_KEYS.forEach((k) => setCheckbox(k, false));
        setBreathUI(state);
        updateProgressUI(state);
        renderRiskCheckUI(state);
        setDailyState(todayISO, state);
      };
    }

    function previewModeEnabled() {
      try {
        return new URL(window.location.href).searchParams.get("preview") === "1";
      } catch {
        return false;
      }
    }

    function seedPreviewDailyState() {
      const today = new Date();
      const todayISO = toLocalISODate(today);
      const previewState = defaultDailyState();

      previewState.tasks.habit_fard_mosque = true;
      previewState.tasks.habit_adhkar = true;
      previewState.tasks.habit_obligations = true;
      previewState.tasks.habit_learn = true;
      previewState.tasks.habit_book = true;
      previewState.riskCheck = {
        mood: "calm",
        isolation: "connected",
        urge: "light",
        level: "low",
        score: 1,
        answeredAt: new Date().toISOString(),
      };

      setDailyState(todayISO, previewState);
    }

document.addEventListener('DOMContentLoaded', async () => {
    try { await window.WA3I_SESSION.ready;
      initMemberDirectorySystem({activateRemote:true,renderMembers:false}); initMemberStatusSystem();
      if(window.WA3I_SESSION.session){saveCurrentUser(window.WA3I_SESSION.session.member);startApp();}else initIdentityGate();
    } catch {document.body.classList.remove('session-pending');qs('#identityGrid').textContent='تعذر الاتصال. أعد المحاولة.';}
  });
