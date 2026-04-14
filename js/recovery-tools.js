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
function setupRecoveryLibrary() {
  const modal = qs("#recoveryLibraryModal");
  const openBtn = qs("#openRecoveryLibrary");
  const closeBtn = qs("#closeRecoveryLibraryModal");
  const closeBtn2 = qs("#closeRecoveryLibraryModal2");
  const listEl = qs("#recoveryLibraryList");
  const countChip = qs("#libraryCountChip");
  const books = Array.isArray(CONFIG.RECOVERY_BOOKS) ? CONFIG.RECOVERY_BOOKS : [];

  if (countChip) {
    countChip.textContent = `${formatArabicNumber(books.length)} كتاب`;
  }

  function renderBooks() {
    if (!listEl) return;
    if (!books.length) {
      listEl.innerHTML = `
        <div class="library-empty">
          لا توجد كتب مضافة بعد.<br>
          أضف ملفات الكتب لاحقًا داخل المجلد <code>books/</code> أو اربطها بروابط عامة مباشرة، وستظهر هنا للجميع.
        </div>
      `;
      return;
    }

    listEl.innerHTML = books.map((book) => `
      <div class="library-item">
        <div class="library-item-title">${escapeHtml(book.title || "كتاب بلا عنوان")}</div>
        <div class="library-item-author">${escapeHtml(book.author || "مؤلف غير محدد")}</div>
        <div class="library-meta">
          ${book.minutes ? `<span class="library-chip">${formatArabicNumber(book.minutes)} دقائق</span>` : ""}
          <span class="library-chip">مفتوح للجميع</span>
        </div>
        <div class="library-item-desc">${escapeHtml(book.description || "كتاب مضاف للمكتبة العامة.")}</div>
        <div class="library-item-actions">
          <button class="library-btn primary" type="button" data-open-book="${escapeHtml(book.id || "")}">فتح الكتاب</button>
        </div>
      </div>
    `).join("");

    listEl.querySelectorAll("[data-open-book]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-open-book");
        const book = books.find((b) => String(b.id || "") === String(id || ""));
        if (!book?.href) {
          showToast("هذا الكتاب لا يملك رابطًا صالحًا بعد.");
          return;
        }
        window.open(book.href, "_blank", "noopener,noreferrer");
      });
    });
  }

  function openModal() {
    renderBooks();
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  openBtn?.addEventListener("click", openModal);
  closeBtn?.addEventListener("click", closeModal);
  closeBtn2?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  renderBooks();
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
