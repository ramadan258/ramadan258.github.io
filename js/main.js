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
    pill.textContent = window.WA3I_SESSION.state === 'member' ? WA3I_USER?.name || '' : "تسجيل الدخول";
    pill.closest('button')?.setAttribute('aria-label',window.WA3I_SESSION.state==='member'?'اختيار المستخدم: '+pill.textContent:'تسجيل الدخول');
  });
}

const FIRESTORE_MEMBER_ACCESS = "featuredMembers";
const FIRESTORE_MEMBER_PERMISSIONS = "memberPermissions";
const LOCAL_LEGACY_MEMBER_CLEANUP_KEY = "wa3i_legacy_member_cleanup_v1";
const MEMBER_DIRECTORY_STATE = {
  baseMembers: [],
  directoryMembers: new Map(),
  legacyProfiles: new Map(),
  ready: false,
  listenersAttached: false,
  controlsWired: false,
  pendingImageDataUrl: "",
  editingMemberId: "",
  editingRevision: 0,
  imageRequest: 0,
  imagePending: false,
  firstReadAttached: false,
  firstReadWatchAttached: false,
  firstReadApplied: false,
  directoryServerSnapshotSeen: false,
  legacyServerSnapshotSeen: false,
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

const STATIC_BASE_MEMBERS = [{"id":"member_9","name":"أمجد","src":"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23132633'/%3E%3Cstop offset='1' stop-color='%230e2430'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='160' height='160' rx='36' fill='url(%23g)'/%3E%3Ccircle cx='80' cy='58' r='28' fill='%23d8e6eb' fill-opacity='.92'/%3E%3Cpath d='M34 132c8-26 31-40 46-40s38 14 46 40' fill='%23d8e6eb' fill-opacity='.92'/%3E%3C/svg%3E","source":"static"}];

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

function memberAccessDocId(memberId) {
  return `access__${String(memberId || "").trim()}`;
}

function memberPermissionsDocId(memberId) {
  return String(memberId || "").trim();
}

const ASSIGNABLE_MEMBER_PERMISSIONS = Object.freeze({
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

function memberHasAccessPin() { return true; }

function getMemberPermissions(id) { return window.WA3I_SESSION.permissions.get(id) || normalizeMemberPermissions(); }

async function sha256Hex(value) {
  const text = String(value || "");
  if (!(window.crypto && window.crypto.subtle && typeof TextEncoder !== "undefined")) {
    throw new Error("CRYPTO_UNAVAILABLE");
  }
  const bytes = new TextEncoder().encode(text);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function resolveMemberAccessRecord(id) { return getMemberAccessRecord(id); }

async function queueLegacyMemberAccessCleanup(){}

async function canResumeMemberSession(id) { return window.WA3I_SESSION.session?.member.id === id; }

function getAllMembersList() {
  const base = Array.isArray(MEMBER_DIRECTORY_STATE.baseMembers) ? MEMBER_DIRECTORY_STATE.baseMembers : [];
  const merged = new Map();
  base.forEach((member) => {
    const id = String(member?.id || "").trim();
    if (!id || isLegacyRemovedStaticMemberId(id)) return;
    merged.set(id, member);
  });
  // Read existing public profiles until edited; deletion erases both copies atomically.
  MEMBER_DIRECTORY_STATE.legacyProfiles.forEach((member,id)=>merged.set(id,member));
  MEMBER_DIRECTORY_STATE.directoryMembers.forEach((member,id)=>{
    merged.set(id,{id,name:member.name,src:member.src||DEFAULT_MEMBER_AVATAR_SRC,source:'directory'});
  });
  return Array.from(merged.values());
}

function renderMembersSection() {
  const slider = qs("#members .slider");
  if (!slider) return;

  const existing=new Map(Array.from(slider.children,card=>[card.dataset.memberId,card]));
  let cursor=slider.firstElementChild;
  getAllMembersList().forEach((member,index)=>{
    let card=existing.get(member.id);
    if(!card){
      card=document.createElement('div');card.className='slide-card';card.dataset.memberId=member.id;
      const image=document.createElement('img');image.decoding='async';
      card.append(image,document.createElement('h3'));
    }
    existing.delete(member.id);
    card.dataset.origIndex=String(index);
    card.dataset.memberSource=member.source==='custom'?'custom':'static';
    const image=card.querySelector('img'),name=card.querySelector('h3'),src=resolveMemberAvatarSrc(member.src);
    image.loading=index<3?'eager':'lazy';image.fetchPriority=index===0?'high':'auto';
    if(image.getAttribute('src')!==src)image.src=src;
    if(image.getAttribute('alt')!==member.name)image.alt=member.name;
    if(name.textContent!==member.name)name.textContent=member.name;
    // Keep unchanged cards/images mounted, including the user's carousel position.
    if(card!==cursor)slider.insertBefore(card,cursor);
    cursor=card.nextElementSibling;
  });
  for(const card of existing.values())card.remove();
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

  const gateVisible = Boolean(qs("#identityGate")&&!qs("#identityGate").classList.contains("is-hidden"));
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

async function cleanupLegacyRemovedMembersCloudOnce(){}

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
    qsa('#members .slide-card').forEach((card,index)=>{
      if(!card.dataset.origIndex)card.dataset.origIndex=String(index);
      const id=card.dataset.memberId||'member_'+card.dataset.origIndex,img=card.querySelector('img');
      card.style.order=card.dataset.origIndex;
      card.classList.remove('member-status-elite','member-status-active','member-status-lazy');
      if(img){img.classList.remove('member-status-elite','member-status-active','member-status-lazy');img.classList.add('member-avatar');img.dataset.braceletMemberId=id;}
    });refreshMemberStatusUI();
  }

function renderIdentityGrid(members) {
    const grid = qs('#identityGrid'); if (!grid) return;
    grid.innerHTML = members.map((m) => '<button class="identity-item" data-user-id="'+escapeHtml(m.id)+'" aria-label="'+escapeHtml(m.name)+'"><img class="identity-avatar member-avatar habit-ring-neutral" data-bracelet-member-id="'+escapeHtml(m.id)+'" src="'+escapeHtml(m.src)+'" alt=""/><div class="identity-name">'+escapeHtml(m.name)+'</div></button>').join('');
    grid.querySelectorAll('[data-user-id]').forEach((btn) => btn.addEventListener('click', () => openIdentityConfirm(members.find((m) => m.id === btn.dataset.userId))));
    refreshMemberStatusUI();
  }

function wireGuestEntry() {}

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

async function resetFirestoreStreaksForAllMembersOnce(){}
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
    if(SHARED_STREAKS_LISTENING)return;
    if (!fbAvailable()) {void window.ensureFirebase().then(tryInit).catch(()=>{});return;}
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

async function getFreshFirebaseIdToken(){
    if(window.WA3I_SESSION.session?.kind==='guest')throw Error('GUEST_READ_ONLY');
    const user=window.FB?.auth?.currentUser;if(!user?.getIdToken)throw Error('AUTH_REQUIRED');return user.getIdToken(true);
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

async function updateMemberStatusViaRest() { throw Error('MANUAL_STATUS_DISABLED'); }

async function updateMemberStatusViaSdk() { throw Error('MANUAL_STATUS_DISABLED'); }


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

function hasMemberStatusAdminAccess() { return false; }

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
  ADMIN_UI_STATE.menuOpen = Boolean((isOpen || window.WA3I_SESSION?.adminMode) && hasAnyAdminAccess());
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
    if (window.WA3I_SESSION?.adminMode) setAdminMenuOpen(true);
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
    const url=new URL(location.href),view=(url.searchParams.get('view')||'').toLowerCase();
    if(['feelings','rescue','forms'].includes(view)||['#feelings','#rescue','#memberCanvasForms'].includes(url.hash)){
      url.searchParams.delete('view');url.hash='';history.replaceState(null,'',url);return '';
    }
    return view;
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
  return getAllMembersList().find((member) => String(member.id || "").trim() === id) || null;
}

function refreshMemberManageFormState() {
    const m = getEditingManagedMember(), avatarOnly=m?.id==='member_9';
    qs('#memberManageName').disabled=avatarOnly;
    qs('#memberManageFormTitle').textContent = avatarOnly ? 'تغيير صورة أمجد' : m ? 'تعديل العضو' : 'إضافة عضو إلى الدليل';
    qs('#memberManageAddBtn').textContent = avatarOnly ? 'حفظ الصورة' : m ? 'حفظ التعديل' : 'إضافة العضو';
    qs('#memberManageFormHint').textContent = avatarOnly ? 'تغيير صورة العرض فقط.' : 'اسم وصورة فقط، دون حساب أو كلمة مرور.';
  }

function resetMemberManageForm() {
  MEMBER_DIRECTORY_STATE.imageRequest++;
  MEMBER_DIRECTORY_STATE.imagePending = false;
  MEMBER_DIRECTORY_STATE.pendingImageDataUrl = "";
  MEMBER_DIRECTORY_STATE.editingMemberId = "";
  MEMBER_DIRECTORY_STATE.editingRevision = 0;
  const name = qs("#memberManageName");
  const image = qs("#memberManageImage");
  const preview = qs("#memberManagePreview");
  if (name) name.value = "";
  if (image) image.value = "";
  if (preview) { preview.src = DEFAULT_MEMBER_AVATAR_SRC; preview.hidden = true; }
  setMemberManageStatus("");
  refreshMemberManageFormState();
  qs('#memberManageAddBtn').disabled=window.__WA3I_SESSION_CONFIG.directoryWritesEnabled!==true;
}

function beginEditManagedMember(memberId) {
  const id = String(memberId || "").trim();
  if (!id) return;
  const member = getAllMembersList().find((item) => String(item.id || "").trim() === id);
  if (!member) return;

  MEMBER_DIRECTORY_STATE.editingMemberId = id;
  MEMBER_DIRECTORY_STATE.editingRevision = MEMBER_DIRECTORY_STATE.directoryMembers.get(id)?.revision || 0;
  MEMBER_DIRECTORY_STATE.imageRequest++;
  MEMBER_DIRECTORY_STATE.imagePending = false;
  MEMBER_DIRECTORY_STATE.pendingImageDataUrl = String(member.src || "").trim();

  const name = qs("#memberManageName");
  const image = qs("#memberManageImage");
  const preview = qs("#memberManagePreview");
  if (name) name.value = member.name || "";
  if (image) image.value = "";
  if (preview) { preview.src = resolveMemberAvatarSrc(member.src); preview.hidden = false; }

  setMemberManageStatus('');
  refreshMemberManageFormState();
  renderMemberManageAdminList();
  if(id==='member_9')image?.focus?.();else name?.focus?.();
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

function renderMemberManageAdminList(){
      const el=qs('#memberManageList');if(!el)return;el.replaceChildren();
      const enabled=window.__WA3I_SESSION_CONFIG.directoryWritesEnabled===true&&MEMBER_DIRECTORY_STATE.ready;
      qs('#memberManageAddBtn').disabled=!enabled||MEMBER_DIRECTORY_STATE.imagePending;
      if(window.__WA3I_SESSION_CONFIG.directoryWritesEnabled!==true)setMemberManageStatus('الحذف النهائي ينتظر الموافقة على قواعد الدليل الجديدة؛ لم يتغير الإنتاج.');
      for(const member of getAllMembersList()){
        const row=document.createElement('article');row.className='member-manage-card';
        const head=document.createElement('div');head.className='member-manage-head';
        const image=document.createElement('img');image.src=resolveMemberAvatarSrc(member.src);image.alt=member.name;
        image.width=48;image.height=48;
        const name=document.createElement('strong');name.className='member-manage-name';name.textContent=member.name;head.append(image,name);
        const actions=[[member.id==='member_9'?'تغيير الصورة':'تعديل',()=>beginEditManagedMember(member.id)]];
        if(member.id!=='member_9')actions.push(['حذف العضو',()=>deleteManagedMember(member.id)]);
        const controls=document.createElement('div');controls.className='member-manage-card-actions'+(actions.length===1?' is-single':'');
        for(const [title,action] of actions){
          const button=document.createElement('button');button.type='button';button.className=title==='حذف العضو'?'member-manage-remove':'member-manage-edit';button.textContent=title;button.disabled=!enabled;button.onclick=action;controls.append(button);
        }
        row.append(head,controls);
        el.append(row);
      }
    }

async function persistDirectoryMember(member,expectedRevision=MEMBER_DIRECTORY_STATE.directoryMembers.get(member.memberId)?.revision||0){
  // Preserve legacy inline avatars without allowing raw SVG in the new directory.
  if(/^data:image\/svg\+xml(?:;|,)/.test(member.src))member={...member,src:await readImageAsOptimizedDataUrl(await(await fetch(member.src)).blob())};
  const {saveDirectoryMember}=await import('../directory-service.mjs');
  await saveDirectoryMember({fs:window.FB,session:window.WA3I_SESSION,adminUid:window.__WA3I_SESSION_CONFIG.adminUid,
    enabled:window.__WA3I_SESSION_CONFIG.directoryWritesEnabled===true,member,expectedRevision});
}
async function addManagedMember(){
  if(!FB_STATE.isAdmin)return;
  const button=qs('#memberManageAddBtn');if(button.disabled||MEMBER_DIRECTORY_STATE.imagePending)return;button.disabled=true;
  try{
    const id=MEMBER_DIRECTORY_STATE.editingMemberId||'custom_member_directory_'+crypto.randomUUID().replaceAll('-','');
    let src=MEMBER_DIRECTORY_STATE.pendingImageDataUrl||'';if(src===DEFAULT_MEMBER_AVATAR_SRC)src='';
    await persistDirectoryMember({memberId:id,name:qs('#memberManageName').value,src},MEMBER_DIRECTORY_STATE.editingRevision);
    resetMemberManageForm();setMemberManageStatus(id==='member_9'?'تم تحديث صورة أمجد.':'تم حفظ العضو في الدليل دون إنشاء حساب دخول.');
  }catch(error){setMemberManageStatus(error.message==='DIRECTORY_CONFLICT'?'تغيّر العضو في جلسة أخرى. أعد فتح التعديل.':'تعذر الحفظ. تحقق من الاسم والصورة والصلاحيات والاتصال.',true);}
  finally{button.disabled=window.__WA3I_SESSION_CONFIG.directoryWritesEnabled!==true;}
}

async function deleteManagedMember(id){
  if(!FB_STATE.isAdmin||id==='member_9')return;
  const member=getAllMembersList().find(m=>m.id===id);if(!member)return;
  const revision=MEMBER_DIRECTORY_STATE.directoryMembers.get(id)?.revision||0;
  const {confirmDirectoryDelete}=await import('../directory-dialog.mjs');
  if(!await confirmDirectoryDelete(member.name))return;
  try{
    const {deleteDirectoryMember}=await import('../directory-service.mjs');
    await deleteDirectoryMember({fs:window.FB,session:window.WA3I_SESSION,adminUid:window.__WA3I_SESSION_CONFIG.adminUid,
      enabled:window.__WA3I_SESSION_CONFIG.directoryWritesEnabled===true,memberId:id,expectedRevision:revision});
    MEMBER_DIRECTORY_STATE.directoryMembers.delete(id);MEMBER_DIRECTORY_STATE.legacyProfiles.delete(id);
    if(MEMBER_DIRECTORY_STATE.editingMemberId===id)resetMemberManageForm();
    refreshMemberDirectoryUI();setMemberManageStatus('حُذف اسم العضو وصورته من الدليل نهائيًا.');
  }catch(error){setMemberManageStatus(error.message==='DIRECTORY_CONFLICT'?'تغيّر العضو في جلسة أخرى. راجع القائمة وأعد المحاولة.':'تعذر الحذف. لم يتغير الدليل؛ تحقق من الاتصال والصلاحيات.',true);}
}

function wireMemberManageAdminControls(){
  if(MEMBER_DIRECTORY_STATE.controlsWired)return;MEMBER_DIRECTORY_STATE.controlsWired=true;
  qs('#memberManageAddBtn')?.addEventListener('click',addManagedMember);qs('#memberManageResetBtn')?.addEventListener('click',resetMemberManageForm);
  qs('#memberManageImage')?.addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    const request=++MEMBER_DIRECTORY_STATE.imageRequest;MEMBER_DIRECTORY_STATE.imagePending=true;qs('#memberManageAddBtn').disabled=true;
    try{if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10000000)throw Error('INVALID_IMAGE');
      const src=await readImageAsOptimizedDataUrl(file);if(request!==MEMBER_DIRECTORY_STATE.imageRequest)return;
      MEMBER_DIRECTORY_STATE.pendingImageDataUrl=src;qs('#memberManagePreview').src=src;qs('#memberManagePreview').hidden=false;
    }catch{if(request===MEMBER_DIRECTORY_STATE.imageRequest)setMemberManageStatus('تعذر تجهيز الصورة. استخدم صورة JPEG أو PNG أو WebP أصغر.',true);}
    finally{if(request===MEMBER_DIRECTORY_STATE.imageRequest){MEMBER_DIRECTORY_STATE.imagePending=false;qs('#memberManageAddBtn').disabled=window.__WA3I_SESSION_CONFIG.directoryWritesEnabled!==true;}}
  });
}

function initMemberDirectorySystem(options = {}) {
  const activateRemote = Boolean(options.activateRemote);
  const renderMembers = Boolean(options.renderMembers);

  if (!MEMBER_DIRECTORY_STATE.baseMembers.length) {
    MEMBER_DIRECTORY_STATE.baseMembers = STATIC_BASE_MEMBERS.map((member) => ({ ...member }));
  }

  wireMemberManageAdminControls();
  refreshMemberDirectoryUI({ renderMembers });

  const attachFirstRead=()=>{
    if(MEMBER_DIRECTORY_STATE.firstReadAttached||!window.WA3I_PUBLIC_DIRECTORY_FIRST_READ)return;
    MEMBER_DIRECTORY_STATE.firstReadAttached=true;
    void window.WA3I_PUBLIC_DIRECTORY_FIRST_READ.then(value=>{
      if(value?.apply(MEMBER_DIRECTORY_STATE,value.result)){
        refreshMemberDirectoryUI();window.WA3I_PERFORMANCE?.mark('public-directory-first-render');
      }
      if(value?.photos)void value.photos.then(patches=>{
        if(value.applyPhotos(MEMBER_DIRECTORY_STATE,value.result,patches)){
          refreshMemberDirectoryUI();window.WA3I_PERFORMANCE?.mark('public-directory-photos-render');
        }
      }).catch(()=>{});
    }).catch(()=>{});
  };
  if(!MEMBER_DIRECTORY_STATE.firstReadWatchAttached){
    MEMBER_DIRECTORY_STATE.firstReadWatchAttached=true;
    window.addEventListener('wa3i-public-directory-start',attachFirstRead,{once:true});
  }
  attachFirstRead();

  if (!activateRemote || MEMBER_DIRECTORY_STATE.listenersAttached) return;

  const tryInit = () => {
    if(MEMBER_DIRECTORY_STATE.listenersAttached)return;
    if (!fbAvailable()) {void window.ensureFirebase().then(tryInit).catch(()=>{});return;}
    MEMBER_DIRECTORY_STATE.listenersAttached = true;

    const { db, onSnapshot, collection } = window.FB;

    void import('../directory-service.mjs').then(({validateDirectoryMember})=>{
      onSnapshot(collection(db,'directoryMembers'),{includeMetadataChanges:true},snapshot=>{
        // No local directory fallback, including Firestore's stale initial cache.
        if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
        MEMBER_DIRECTORY_STATE.directoryServerSnapshotSeen=true;
        const rows=new Map();
        snapshot.forEach(doc=>{try{const data=doc.data();if(![1,2].includes(data.schemaVersion)||doc.id!==data.memberId)return;rows.set(doc.id,{...validateDirectoryMember(data),revision:data.revision});}catch{}});
        MEMBER_DIRECTORY_STATE.directoryMembers=rows;MEMBER_DIRECTORY_STATE.ready=true;refreshMemberDirectoryUI();
      },()=>{MEMBER_DIRECTORY_STATE.ready=false;renderMemberManageAdminList();setMemberManageStatus('تعذر تحميل الدليل. تحقق من الاتصال؛ لن يُستخدم دليل قديم.',true);});
    }).catch(()=>setMemberManageStatus('تعذر تحميل الدليل. أعد المحاولة.',true));
    window.FB.publicBucketSnapshot(['custom__custom_member_new_'],snapshot=>{
      if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
      MEMBER_DIRECTORY_STATE.legacyServerSnapshotSeen=true;
      const rows=new Map();
      snapshot.forEach(doc=>{
        const data=doc.data();
        if(data.type!=='custom_member'||doc.id!=='custom__'+data.memberId)return;
        if(data.memberId==='member_9')return;
        if(!/^custom_member_new_[a-f0-9]{32}$/.test(data.memberId||'')||data.schemaVersion!==2||data.managementState!=='ready')return;
        if(typeof data.name!=='string'||!data.name.trim()||typeof data.src!=='string')return;
        rows.set(data.memberId,{id:data.memberId,name:data.name,src:resolveMemberAvatarSrc(data.src),source:'custom'});
      });
      MEMBER_DIRECTORY_STATE.legacyProfiles=rows;refreshMemberDirectoryUI();
    },()=>setMemberManageStatus('تعذر تحميل الأسماء القديمة. تحقق من الاتصال.',true),{includeMetadataChanges:true});
  };

  tryInit();
}

async function openAdminPanelModal(panelKey) {
  if (!canAccessAdminPanel(panelKey)) return;
  if(panelKey==='qa')attachQaFirestoreListeners();
  if(panelKey==='library')attachLibraryFirestoreListener();

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

    function renderRiskCheckUI() {}

    function applyRiskCheckAnswer() {}

    function resetRiskCheck() {}

    function wireRiskCheckUI() {}

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
      const url = new URL("azkar.html?release=20261016-74f887098e5a", window.location.href);
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
    initMemberDirectorySystem({activateRemote:false,renderMembers:true});initIdentityGate(false);startApp();
    document.body.classList.remove('session-pending');
    window.WA3I_PERFORMANCE?.mark('public-ui-usable');
    try { await window.WA3I_SESSION.ready;
      initMemberDirectorySystem({activateRemote:true,renderMembers:false}); initMemberStatusSystem();
      if(window.WA3I_SESSION.session){saveCurrentUser(window.WA3I_SESSION.session.member);startApp();}
    } catch {document.body.classList.remove('session-pending');updateUserBar();}
  });
