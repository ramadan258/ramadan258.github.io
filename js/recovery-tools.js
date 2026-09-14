function defaultRescueCenterState() {
  return {
    plan: {
      dangerTime: "",
      dangerPlace: "",
      firstSign: "",
      bestReplacement: "",
      supportPerson: "",
    },
    log: [],
  };
}

function normalizeRescueCenterState(rawState) {
  const base = defaultRescueCenterState();
  if (!rawState || typeof rawState !== "object") return base;

  const rawPlan = rawState.plan && typeof rawState.plan === "object" ? rawState.plan : {};
  base.plan.dangerTime = String(rawPlan.dangerTime || "").trim();
  base.plan.dangerPlace = String(rawPlan.dangerPlace || "").trim();
  base.plan.firstSign = String(rawPlan.firstSign || "").trim();
  base.plan.bestReplacement = String(rawPlan.bestReplacement || "").trim();
  base.plan.supportPerson = String(rawPlan.supportPerson || "").trim();

  const rawLog = Array.isArray(rawState.log) ? rawState.log : [];
  base.log = rawLog
    .map((entry) => ({
      id: String(entry?.id || "").trim(),
      createdAt: typeof entry?.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
      trigger: String(entry?.trigger || "").trim(),
      helped: String(entry?.helped || "").trim(),
      level: ["low", "medium", "high"].includes(String(entry?.level || "")) ? String(entry.level) : "unknown",
    }))
    .filter((entry) => entry.id && (entry.trigger || entry.helped))
    .slice(0, 8);

  return base;
}

function rescueCenterStorageKey() {
  return userKey("rescue_center_v1");
}

function getRescueCenterState() {
  const raw = localStorage.getItem(rescueCenterStorageKey());
  if (!raw) return defaultRescueCenterState();
  return normalizeRescueCenterState(safeJsonParse(raw, defaultRescueCenterState()));
}

function setRescueCenterState(state) {
  localStorage.setItem(rescueCenterStorageKey(), JSON.stringify(normalizeRescueCenterState(state)));
}

function formatRescueLogDate(isoString) {
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return "الآن";
  return dt.toLocaleString("ar", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getRescueCenterPlanItems(plan) {
  return [
    { title: "أخطر وقت", value: plan.dangerTime },
    { title: "أخطر مكان أو وضع", value: plan.dangerPlace },
    { title: "أول علامة", value: plan.firstSign },
    { title: "أفضل بديل سريع", value: plan.bestReplacement },
    { title: "رفيق التثبيت", value: plan.supportPerson },
  ].filter((item) => item.value);
}

function getCurrentRescueCenterEvaluation() {
  return WA3I_CTX.riskEvaluation || evaluateRiskCheck(WA3I_CTX.state?.riskCheck);
}

function syncRescueCenterPanelBadges() {
  qsa("#rescue .rescue-center-panel").forEach((panel) => {
    const badge = panel.querySelector(".rescue-center-panel-badge");
    if (!badge) return;
    badge.textContent = panel.open ? "إخفاء" : "افتح";
  });
}

function setRescueCenterPanelDefaults(state, evaluation) {
  const planPanel = qs("#rescueCenterPlanPanel");
  const logPanel = qs("#rescueCenterLogPanel");
  const hasPlan = getRescueCenterPlanItems(state.plan).length > 0;

  if (planPanel) {
    planPanel.open = !hasPlan && evaluation?.level !== "high";
  }

  if (logPanel) {
    logPanel.open = false;
  }

  syncRescueCenterPanelBadges();
}

function renderRescueCenterOverview(state, evaluation) {
  const planItems = getRescueCenterPlanItems(state.plan);
  const levelMeta = qs("#rescueCenterLevelMeta");
  const planMeta = qs("#rescueCenterPlanMeta");
  const logMeta = qs("#rescueCenterLogMeta");
  const planSummary = qs("#rescueCenterPlanSummaryText");
  const logSummary = qs("#rescueCenterLogSummaryText");
  const breathBtn = qs("#rescueCenterBreathBtn");
  const breathTitle = qs("#rescueCenterBreathTitle");
  const breathDesc = qs("#rescueCenterBreathDesc");
  const runningBreath = Boolean(WA3I_CTX.state?.breathRunning);

  if (levelMeta) {
    levelMeta.textContent = evaluation?.pill || "لم يُفحص بعد";
  }

  if (planMeta) {
    planMeta.textContent = planItems.length ? `${formatArabicNumber(planItems.length)}/٥ مكتوبة` : "غير مكتوبة";
  }

  if (logMeta) {
    logMeta.textContent = state.log.length ? `${formatArabicNumber(state.log.length)} محاولة` : "فارغ";
  }

  if (planSummary) {
    planSummary.textContent = planItems.length
      ? `مكتوب منها ${formatArabicNumber(planItems.length)} من ٥ عناصر تساعدك وقت الضعف.`
      : "اكتبها مرة واحدة، ثم ارجع إليها وقت الضعف بدل أن تبدأ من الصفر.";
  }

  if (logSummary) {
    logSummary.textContent = state.log.length
      ? `لديك ${formatArabicNumber(state.log.length)} محاولة نجاة مسجلة. ارجع إليها لتعرف ما الذي نفعك.`
      : "فارغ الآن. كل مرة تنجو فيها من موجة ضعف، سجّل ما نفعك هنا.";
  }

  if (breathBtn) {
    breathBtn.classList.toggle("urgent", evaluation?.level === "high");
  }

  if (breathTitle) {
    breathTitle.textContent = runningBreath
      ? "التنفس جارٍ الآن"
      : evaluation?.level === "high"
        ? "ابدأ التهدئة الآن"
        : "دقيقة تهدئة";
  }

  if (breathDesc) {
    breathDesc.textContent = runningBreath
      ? "أكمل الدقيقة ثم اختر الخطوة التالية."
      : evaluation?.level === "high"
        ? "هذه أول خطوة قبل أي شيء آخر."
        : "اقطع التوتر الأول قبل أن يكبر.";
  }
}

function renderRescuePlanPreview(plan) {
  const preview = qs("#rescueCenterPlanPreview");
  if (!preview) return;

  const items = getRescueCenterPlanItems(plan);

  if (!items.length) {
    preview.innerHTML = `<div class="rescue-center-empty">لم تُكتب خطتك الشخصية بعد. املأ الحقول أعلاه، وعندما يأتيك الضعف سيظهر لك ما يلزمك أنت بالذات بدل النص العام.</div>`;
    return;
  }

  preview.innerHTML = items.map((item) => `
    <div class="rescue-center-preview-card">
      <div class="rescue-center-preview-title">${escapeHtml(item.title)}</div>
      <div class="rescue-center-preview-value">${escapeHtml(item.value)}</div>
    </div>
  `).join("");
}

function renderRescueLog(logItems) {
  const list = qs("#rescueCenterLogList");
  if (!list) return;
  if (!logItems.length) {
    list.innerHTML = `<div class="rescue-center-empty">لا يوجد سجل بعد. عندما تنجو من موجة ضعف، اكتب باختصار ما الذي ضغط عليك وما الذي أنقذك. بعد مدة ستظهر أنماطك بوضوح.</div>`;
    return;
  }

  list.innerHTML = logItems.map((entry, idx) => `
    <div class="rescue-center-log-item">
      <div class="rescue-center-log-head">
        <span class="rescue-center-log-badge">نجاة ${formatArabicNumber(idx + 1)}</span>
        <span class="rescue-center-log-time">${escapeHtml(formatRescueLogDate(entry.createdAt))}</span>
      </div>
      <div class="rescue-center-log-body">
        <div class="rescue-center-log-line"><span>الضغط:</span> ${escapeHtml(entry.trigger || "—")}</div>
        <div class="rescue-center-log-line"><span>الذي نفع:</span> ${escapeHtml(entry.helped || "—")}</div>
      </div>
    </div>
  `).join("");
}

function fillRescueCenterPlanInputs(plan) {
  const map = {
    rescuePlanDangerTime: plan.dangerTime,
    rescuePlanDangerPlace: plan.dangerPlace,
    rescuePlanFirstSign: plan.firstSign,
    rescuePlanBestReplacement: plan.bestReplacement,
    rescuePlanSupportPerson: plan.supportPerson,
  };
  Object.entries(map).forEach(([id, value]) => {
    const el = qs(`#${id}`);
    if (el) el.value = value || "";
  });
}

function renderRescueCenterStatus(evaluation) {
  const statusBox = qs("#rescueCenterStatusBox");
  const pill = qs("#rescueCenterStatusPill");
  const title = qs("#rescueCenterStatusTitle");
  const desc = qs("#rescueCenterStatusDesc");
  const list = qs("#rescueCenterAdviceList");
  if (!statusBox || !pill || !title || !desc || !list) return;

  statusBox.classList.remove("low", "medium", "high");
  pill.className = "rescue-center-status-pill";

  if (evaluation.level === "low") {
    statusBox.classList.add("low");
    pill.classList.add("low");
  } else if (evaluation.level === "medium") {
    statusBox.classList.add("medium");
    pill.classList.add("medium");
  } else if (evaluation.level === "high") {
    statusBox.classList.add("high");
    pill.classList.add("high");
  }

  pill.textContent = evaluation.pill;
  title.textContent = evaluation.title;
  desc.textContent = evaluation.description;
  list.innerHTML = evaluation.advices.map((item) => `
    <div class="rescue-center-advice-item">
      <span class="rescue-center-advice-mark">•</span>
      <span>${escapeHtml(item)}</span>
    </div>
  `).join("");
}

function renderRescueCenterModal() {
  const state = getRescueCenterState();
  const evaluation = getCurrentRescueCenterEvaluation();
  fillRescueCenterPlanInputs(state.plan);
  renderRescuePlanPreview(state.plan);
  renderRescueLog(state.log);
  renderRescueCenterStatus(evaluation);
  renderRescueCenterOverview(state, evaluation);
  return { state, evaluation };
}

function saveRescueCenterPlan() {
  const current = getRescueCenterState();
  current.plan = {
    dangerTime: String(qs("#rescuePlanDangerTime")?.value || "").trim(),
    dangerPlace: String(qs("#rescuePlanDangerPlace")?.value || "").trim(),
    firstSign: String(qs("#rescuePlanFirstSign")?.value || "").trim(),
    bestReplacement: String(qs("#rescuePlanBestReplacement")?.value || "").trim(),
    supportPerson: String(qs("#rescuePlanSupportPerson")?.value || "").trim(),
  };
  setRescueCenterState(current);
  renderRescuePlanPreview(current.plan);
  renderRescueCenterOverview(current, getCurrentRescueCenterEvaluation());
  showToast("تم حفظ خطتك الشخصية ✅");
}

function saveRescueLogEntry() {
  const trigger = String(qs("#rescueLogTrigger")?.value || "").trim();
  const helped = String(qs("#rescueLogHelped")?.value || "").trim();
  if (!trigger && !helped) {
    showToast("اكتب سبب الضغط أو ما الذي نفعك أولًا.");
    return;
  }

  const current = getRescueCenterState();
  current.log.unshift({
    id: `log_${Date.now()}`,
    createdAt: new Date().toISOString(),
    trigger,
    helped,
    level: WA3I_CTX.riskEvaluation?.level || "unknown",
  });
  current.log = current.log.slice(0, 8);
  setRescueCenterState(current);
  renderRescueLog(current.log);
  renderRescueCenterOverview(current, getCurrentRescueCenterEvaluation());

  const triggerInput = qs("#rescueLogTrigger");
  const helpedInput = qs("#rescueLogHelped");
  if (triggerInput) triggerInput.value = "";
  if (helpedInput) helpedInput.value = "";
  showToast("تمت إضافة النجاة إلى السجل ✅");
}

function setupRescueCenterModal() {
  const page = qs("#rescue");
  const openBtn = qs("#openRescueCenter");
  const breathBtn = qs("#rescueCenterBreathBtn");
  const azkarBtn = qs("#rescueCenterAzkarBtn");
  const libraryBtn = qs("#rescueCenterLibraryBtn");
  const classicPlanBtn = qs("#rescueCenterClassicPlanBtn");
  const savePlanBtn = qs("#saveRescuePlanBtn");
  const saveLogBtn = qs("#saveRescueLogBtn");
  if (!page) return;

  qsa("#rescue .rescue-center-panel").forEach((panel) => {
    panel.addEventListener("toggle", () => syncRescueCenterPanelBadges());
  });

  function openPage() {
    if (typeof getStandalonePageUrl === "function") {
      window.location.href = getStandalonePageUrl("rescue");
      return;
    }

    try {
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("view", "rescue");
      window.location.href = `${url.pathname}${url.search}`;
    } catch {
      window.location.href = "index.html?view=rescue";
    }
  }

  if (openBtn) openBtn.onclick = () => openPage();

  if (typeof getStandaloneView === "function" && getStandaloneView() === "rescue") {
    const snapshot = renderRescueCenterModal();
    setRescueCenterPanelDefaults(snapshot.state, snapshot.evaluation);
  }

  if (breathBtn) {
    breathBtn.onclick = () => {
      const todayISO = WA3I_CTX.todayISO;
      const state = WA3I_CTX.state;
      if (!todayISO || !state) return;
      if (!state.breathRunning) {
        startBreathTimer(todayISO, state);
        renderRescueCenterOverview(getRescueCenterState(), getCurrentRescueCenterEvaluation());
      } else {
        showToast("مؤقت التنفس يعمل بالفعل.");
      }
    };
  }

  if (azkarBtn) {
    azkarBtn.onclick = () => {
      openAzkarReader(chooseRiskAzkarConfig(WA3I_CTX.state));
    };
  }

  if (libraryBtn) {
    libraryBtn.onclick = () => {
      qs("#openRecoveryLibrary")?.click();
    };
  }

  if (classicPlanBtn) {
    classicPlanBtn.onclick = () => {
      if (typeof window.openRescuePlanModal === "function") {
        window.openRescuePlanModal();
      }
    };
  }

  if (savePlanBtn) savePlanBtn.onclick = () => saveRescueCenterPlan();
  if (saveLogBtn) saveLogBtn.onclick = () => saveRescueLogEntry();
}

// ---------------------------
// Recovery Library
// ---------------------------
const FIRESTORE_LIBRARY_BOOKS = "libraryBooks";
const LIBRARY_BOOK_DOC_PREFIX = "book__";
const LIBRARY_DEFAULT_HIDDEN_DOC_PREFIX = "hidden__";

const LIBRARY_STATE = {
  remoteBooks: new Map(),
  hiddenDefaultIds: new Set(),
  listenersAttached: false,
  uiWired: false,
  adminControlsWired: false,
};

function isValidLibraryBookId(value) {
  return /^[A-Za-z0-9_-]{1,120}$/.test(String(value || "").trim());
}

function normalizeLibraryBook(rawBook, source = "custom") {
  const raw = rawBook && typeof rawBook === "object" ? rawBook : {};
  const id = String(raw.id || raw.bookId || "").trim();
  const href = String(raw.href || "").trim();
  if (!isValidLibraryBookId(id) || !href) return null;

  const parsedMinutes = Number(raw.minutes);
  return {
    id,
    title: String(raw.title || "كتاب بلا عنوان").trim().slice(0, 240),
    author: String(raw.author || "").trim().slice(0, 180),
    description: String(raw.description || "").trim().slice(0, 2000),
    href: href.slice(0, 2000),
    minutes: Number.isFinite(parsedMinutes) ? Math.max(0, Math.min(999, Math.round(parsedMinutes))) : 0,
    source,
  };
}

function getRecoveryLibraryBooks() {
  const booksById = new Map();
  const defaultBooks = Array.isArray(CONFIG.RECOVERY_BOOKS) ? CONFIG.RECOVERY_BOOKS : [];

  defaultBooks.forEach((book) => {
    const normalized = normalizeLibraryBook(book, "default");
    if (normalized && !LIBRARY_STATE.hiddenDefaultIds.has(normalized.id)) {
      booksById.set(normalized.id, normalized);
    }
  });

  LIBRARY_STATE.remoteBooks.forEach((book, id) => {
    booksById.set(id, book);
  });

  return Array.from(booksById.values());
}

function renderRecoveryLibrary() {
  const listEl = qs("#recoveryLibraryList");
  const countChip = qs("#libraryCountChip");
  const books = getRecoveryLibraryBooks();

  if (countChip) {
    countChip.textContent = `${formatArabicNumber(books.length)} كتاب`;
  }

  if (!listEl) return;
  if (!books.length) {
    listEl.innerHTML = `
      <div class="library-empty">
        لا توجد كتب مضافة في المكتبة الآن.
      </div>
    `;
    return;
  }

  listEl.innerHTML = books.map((book) => `
    <button class="library-book-entry" type="button" data-open-book="${escapeHtml(book.id)}" aria-label="فتح ${escapeHtml(book.title || "كتاب")}">
      ${escapeHtml(book.title || "كتاب بلا عنوان")}
    </button>
  `).join("");

  listEl.querySelectorAll("[data-open-book]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open-book");
      const book = getRecoveryLibraryBooks().find((entry) => entry.id === id);
      if (!book?.href) {
        showToast("هذا الكتاب لا يملك رابطًا صالحًا بعد.");
        return;
      }
      window.open(book.href, "_blank", "noopener,noreferrer");
    });
  });
}

function setLibraryAdminStatus(message = "", isError = false) {
  const el = qs("#libraryAdminStatus");
  if (!el) return;
  el.textContent = String(message || "").trim();
  el.style.color = isError ? "#ffb4b4" : "";
}

function resetLibraryAdminForm() {
  ["#libraryAdminTitle", "#libraryAdminHref"].forEach((selector) => {
    const input = qs(selector);
    if (input) input.value = "";
  });
  setLibraryAdminStatus("");
}

function normalizePublicBookUrl(value) {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) return "";

  try {
    const url = new URL(rawUrl);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function createLibraryBookId() {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replaceAll("-", "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `book_${Date.now().toString(36)}_${random}`;
}

async function addLibraryBook() {
  if (!hasLibraryAdminAccess()) return;
  if (!fbAvailable()) {
    setLibraryAdminStatus("يتعذر الاتصال الآن. أعد المحاولة بعد لحظة.", true);
    return;
  }

  const title = String(qs("#libraryAdminTitle")?.value || "").trim();
  const href = normalizePublicBookUrl(qs("#libraryAdminHref")?.value);

  if (!title) {
    setLibraryAdminStatus("اكتب اسم الكتاب أولًا.", true);
    return;
  }
  if (title.length > 240) {
    setLibraryAdminStatus("اسم الكتاب طويل جدًا. اختصره ثم أعد المحاولة.", true);
    return;
  }
  if (!href) {
    setLibraryAdminStatus("ضع رابطًا عامًا صحيحًا يبدأ بـ https:// أو http://.", true);
    return;
  }
  const addBtn = qs("#libraryAdminAddBtn");
  if (addBtn) addBtn.disabled = true;
  setLibraryAdminStatus("تُضاف إلى المكتبة الآن...");

  try {
    const { db, doc, setDoc, serverTimestamp } = window.FB;
    const bookId = createLibraryBookId();
    await setDoc(doc(db, FIRESTORE_LIBRARY_BOOKS, `${LIBRARY_BOOK_DOC_PREFIX}${bookId}`), {
      type: "library_book",
      bookId,
      title,
      href,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    resetLibraryAdminForm();
    setLibraryAdminStatus("تمت إضافة الكتاب، وسيظهر لجميع الأعضاء فورًا.");
  } catch (error) {
    console.error("Unable to add library book", error);
    setLibraryAdminStatus("تعذرت إضافة الكتاب. تأكد من تسجيل دخول أمجد ومن الرابط ثم أعد المحاولة.", true);
  } finally {
    if (addBtn) addBtn.disabled = false;
  }
}

async function deleteLibraryBook(bookId) {
  if (!hasLibraryAdminAccess()) return;
  const book = getRecoveryLibraryBooks().find((entry) => entry.id === String(bookId || ""));
  if (!book || !fbAvailable()) return;
  if (!window.confirm(`هل تريد حذف كتاب «${book.title}» من المكتبة العامة؟`)) return;

  setLibraryAdminStatus("يُحذف الكتاب الآن...");
  try {
    const { db, doc, setDoc, deleteDoc, serverTimestamp } = window.FB;
    if (book.source === "default") {
      await setDoc(doc(db, FIRESTORE_LIBRARY_BOOKS, `${LIBRARY_DEFAULT_HIDDEN_DOC_PREFIX}${book.id}`), {
        type: "library_default_hidden",
        bookId: book.id,
        hiddenAt: serverTimestamp(),
      });
    } else {
      await deleteDoc(doc(db, FIRESTORE_LIBRARY_BOOKS, `${LIBRARY_BOOK_DOC_PREFIX}${book.id}`));
    }
    setLibraryAdminStatus("تم حذف الكتاب من المكتبة العامة.");
  } catch (error) {
    console.error("Unable to delete library book", error);
    setLibraryAdminStatus("تعذر حذف الكتاب. أعد المحاولة بعد لحظة.", true);
  }
}

function renderLibraryAdminPanel() {
  const listEl = qs("#libraryAdminList");
  if (!listEl) return;
  if (!hasLibraryAdminAccess()) {
    listEl.innerHTML = "";
    return;
  }

  const books = getRecoveryLibraryBooks();
  if (!books.length) {
    listEl.innerHTML = `<div class="member-manage-empty">لا توجد كتب في المكتبة الآن.</div>`;
    return;
  }

  listEl.innerHTML = books.map((book) => `
    <article class="library-admin-book">
      <div class="library-admin-book-head">
        <div class="library-admin-book-title">${escapeHtml(book.title)}</div>
        <button class="library-admin-delete" type="button" data-delete-library-book="${escapeHtml(book.id)}">حذف</button>
      </div>
    </article>
  `).join("");

  listEl.querySelectorAll("[data-delete-library-book]").forEach((btn) => {
    btn.addEventListener("click", () => deleteLibraryBook(btn.getAttribute("data-delete-library-book")));
  });
}

function wireLibraryAdminControls() {
  if (LIBRARY_STATE.adminControlsWired) return;
  LIBRARY_STATE.adminControlsWired = true;

  qs("#libraryAdminAddBtn")?.addEventListener("click", addLibraryBook);
  qs("#libraryAdminResetBtn")?.addEventListener("click", resetLibraryAdminForm);
  qs("#libraryAdminTitle")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addLibraryBook();
    }
  });
}

function setLibraryAdminVisibility() {
  const wrap = qs("#libraryAdminWrap");
  const show = hasLibraryAdminAccess() && typeof ADMIN_UI_STATE !== "undefined" && ADMIN_UI_STATE.activePanel === "library";
  if (wrap) {
    wrap.style.display = show ? "block" : "none";
    wrap.setAttribute("aria-hidden", show ? "false" : "true");
  }
  if (show) {
    wireLibraryAdminControls();
    renderLibraryAdminPanel();
  }
}

function attachLibraryFirestoreListener() {
  if (LIBRARY_STATE.listenersAttached) return;
  LIBRARY_STATE.listenersAttached = true;

  const tryInit = () => {
    if (!fbAvailable()) {
      setTimeout(tryInit, 80);
      return;
    }

    const { db, onSnapshot, collection } = window.FB;
    onSnapshot(
      collection(db, FIRESTORE_LIBRARY_BOOKS),
      (snapshot) => {
        const remoteBooks = new Map();
        const hiddenDefaultIds = new Set();

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const docId = String(docSnap.id || "");
          if (docId.startsWith(LIBRARY_BOOK_DOC_PREFIX)) {
            const book = normalizeLibraryBook({ ...data, id: data.bookId || docId.replace(LIBRARY_BOOK_DOC_PREFIX, "") }, "custom");
            if (book) remoteBooks.set(book.id, book);
          }
          if (docId.startsWith(LIBRARY_DEFAULT_HIDDEN_DOC_PREFIX)) {
            const hiddenId = String(data.bookId || docId.replace(LIBRARY_DEFAULT_HIDDEN_DOC_PREFIX, "")).trim();
            if (isValidLibraryBookId(hiddenId)) hiddenDefaultIds.add(hiddenId);
          }
        });

        LIBRARY_STATE.remoteBooks = remoteBooks;
        LIBRARY_STATE.hiddenDefaultIds = hiddenDefaultIds;
        renderRecoveryLibrary();
        renderLibraryAdminPanel();
      },
      (error) => {
        console.error("Library listener failed", error);
      }
    );
  };

  tryInit();
}

function setupRecoveryLibrary() {
  const modal = qs("#recoveryLibraryModal");
  const openBtn = qs("#openRecoveryLibrary");
  const closeBtn = qs("#closeRecoveryLibraryModal");

  function openModal() {
    renderRecoveryLibrary();
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  if (!LIBRARY_STATE.uiWired) {
    LIBRARY_STATE.uiWired = true;
    openBtn?.addEventListener("click", openModal);
    closeBtn?.addEventListener("click", closeModal);
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  attachLibraryFirestoreListener();
  renderRecoveryLibrary();
}

// ---------------------------
// Rescue Plan
// ---------------------------
function setupRescuePlanModal() {
  const modal = qs("#rescuePlanModal");
  const closeBtn = qs("#closeRescuePlanModal");
  const closeBtn2 = qs("#closeRescuePlanModal2");

  function openModal() {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  window.openRescuePlanModal = openModal;
  window.closeRescuePlanModal = closeModal;
  closeBtn?.addEventListener("click", closeModal);
  closeBtn2?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}
