// ---------------------------
// Quran (3 pages/day)
// ---------------------------
function getOrInitQuranStartDate(today) {
  const startDateRaw = new Date(CONFIG.QURAN.START_DATE_ISO);
  if (!Number.isNaN(startDateRaw.getTime())) {
    return new Date(startDateRaw.getFullYear(), startDateRaw.getMonth(), startDateRaw.getDate());
  }

  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function computeDailyQuranPages(today) {
  const total = CONFIG.QURAN.TOTAL_PAGES;
  const perDay = CONFIG.QURAN.PAGES_PER_DAY;

  const startDate = getOrInitQuranStartDate(today);
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const rawDiffDays = Math.floor((todayLocal.getTime() - startDate.getTime()) / 86400000);
  const diffDays = Math.max(0, rawDiffDays);
  const cycleLength = Math.max(1, Math.ceil(total / perDay));
  const dayInCycle = diffDays % cycleLength;
  const cycleNumber = Math.floor(diffDays / cycleLength) + 1;

  const start = (dayInCycle * perDay) + 1;
  const end = Math.min(total, start + perDay - 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return {
    start,
    end,
    pages,
    perDay,
    cycleLength,
    cycleDay: dayInCycle + 1,
    cycleNumber,
    absoluteDay: diffDays + 1,
  };
}

function buildLocalQuranUrl(page) {
  const safePage = Math.max(1, Math.min(CONFIG.QURAN.TOTAL_PAGES, Number(page || 1)));
  return `${String(CONFIG.QURAN.LOCAL_PDF_URL || "quran/standard1-quran.pdf")}#page=${safePage}&view=FitH`;
}

let LOCAL_QURAN_PDF_AVAILABLE = null;
let LOCAL_QURAN_PDF_CHECK = null;
let ACTIVE_QURAN_PLAN = null;

async function canUseLocalQuranPdf() {
  if (LOCAL_QURAN_PDF_AVAILABLE !== null) {
    return LOCAL_QURAN_PDF_AVAILABLE;
  }

  if (String(window.location?.protocol || "").toLowerCase() === "file:") {
    LOCAL_QURAN_PDF_AVAILABLE = true;
    return true;
  }

  if (LOCAL_QURAN_PDF_CHECK) {
    return LOCAL_QURAN_PDF_CHECK;
  }

  const pdfUrl = String(CONFIG.QURAN.LOCAL_PDF_URL || "quran/standard1-quran.pdf").split("#")[0];
  LOCAL_QURAN_PDF_CHECK = fetch(pdfUrl, {
    method: "HEAD",
    cache: "no-store",
  })
    .then((response) => {
      LOCAL_QURAN_PDF_AVAILABLE = Boolean(response?.ok);
      return LOCAL_QURAN_PDF_AVAILABLE;
    })
    .catch(() => {
      LOCAL_QURAN_PDF_AVAILABLE = false;
      return false;
    })
    .finally(() => {
      LOCAL_QURAN_PDF_CHECK = null;
    });

  return LOCAL_QURAN_PDF_CHECK;
}

function buildWebQuranUrl(page) {
  const safePage = Math.max(1, Math.min(CONFIG.QURAN.TOTAL_PAGES, Number(page || 1)));
  return String(CONFIG.QURAN.PAGE_URL_TEMPLATE || "https://quran.com/page/{page}")
    .replace("{page}", String(safePage));
}

function describeQuranPlan(quranPlan) {
  if (!quranPlan) {
    return {
      rangeText: "ورد غير متاح",
      cycleText: "",
      dayText: "",
    };
  }

  const startText = formatArabicNumber(quranPlan.start);
  const endText = formatArabicNumber(quranPlan.end);
  return {
    rangeText: quranPlan.start === quranPlan.end
      ? `الصفحة ${startText}`
      : `الصفحات ${startText} - ${endText}`,
    cycleText: `الدورة ${formatArabicNumber(quranPlan.cycleNumber)} • اليوم ${formatArabicNumber(quranPlan.cycleDay)} من ${formatArabicNumber(quranPlan.cycleLength)}`,
    dayText: `اليوم ${formatArabicNumber(quranPlan.absoluteDay)} منذ بداية الورد`,
  };
}

async function renderStandaloneQuranPage(quranPlan) {
  const page = qs("#quran");
  const rangeEl = qs("#quranPlanRange");
  const navEl = qs("#quranPageNav");
  const frameEl = qs("#quranReaderFrame");
  const hintEl = qs("#quranReaderHint");
  if (!page || !rangeEl || !navEl || !frameEl) return;

  ACTIVE_QURAN_PLAN = quranPlan || WA3I_CTX.quranPlan || computeDailyQuranPages(new Date());
  const summary = describeQuranPlan(ACTIVE_QURAN_PLAN);
  rangeEl.textContent = summary.rangeText;

  navEl.innerHTML = ACTIVE_QURAN_PLAN.pages.map((pageNumber) => `
    <button class="quran-page-chip${pageNumber === ACTIVE_QURAN_PLAN.start ? " is-active" : ""}" type="button" data-quran-page="${pageNumber}">
      <span class="quran-page-chip-label">الصفحة</span>
      <strong class="quran-page-chip-number">${formatArabicNumber(pageNumber)}</strong>
      <span class="quran-page-chip-hint">${pageNumber === ACTIVE_QURAN_PLAN.start ? "ابدأ هنا" : "ثم أكمل"}</span>
    </button>
  `).join("");

  navEl.querySelectorAll("[data-quran-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveQuranPage(Number(btn.getAttribute("data-quran-page")));
    });
  });

  const hasLocalPdf = await canUseLocalQuranPdf();
  if (!hasLocalPdf) {
    frameEl.removeAttribute("src");
    if (hintEl) {
      hintEl.hidden = false;
      hintEl.textContent = "المصحف المحلي غير متاح هنا الآن. استخدم زر فتح المصحف لفتح الورد في تبويب مستقل.";
    }
    return;
  }

  if (hintEl) {
    hintEl.hidden = true;
    hintEl.textContent = "";
  }

  setActiveQuranPage(ACTIVE_QURAN_PLAN.start);
}

function renderQuranTaskMeta(quranPlan) {
  const rangeEl = qs("#quranDailyPages");
  const metaEl = qs("#quranDailyMeta");
  const summary = describeQuranPlan(quranPlan);
  if (rangeEl) rangeEl.textContent = summary.rangeText;
  if (metaEl) metaEl.textContent = `${summary.cycleText} • ${summary.dayText}`;

  if (typeof getStandaloneView === "function" && getStandaloneView() === "quran") {
    renderStandaloneQuranPage(quranPlan);
  }
}

function openUrlInNewTab(url) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function openDailyQuran(quranPlan) {
  const startPage = Math.max(1, Number(quranPlan?.start || 1));
  const hasLocalPdf = await canUseLocalQuranPdf();
  if (!hasLocalPdf) {
    openUrlInNewTab(buildWebQuranUrl(startPage));
    showToast("المصحف المحلي غير متاح على النسخة المنشورة، فتم فتح quran.com بدلًا منه.");
    return false;
  }

  openUrlInNewTab(buildLocalQuranUrl(startPage));
  return true;
}

function setActiveQuranPage(page) {
  const frameEl = qs("#quranReaderFrame");
  const navEl = qs("#quranPageNav");
  const safePage = Math.max(1, Math.min(CONFIG.QURAN.TOTAL_PAGES, Number(page || ACTIVE_QURAN_PLAN?.start || 1)));

  if (frameEl) {
    frameEl.src = buildLocalQuranUrl(safePage);
  }

  navEl?.querySelectorAll("[data-quran-page]").forEach((btn) => {
    const btnPage = Number(btn.getAttribute("data-quran-page"));
    btn.classList.toggle("is-active", btnPage === safePage);
  });
}

function setupQuranModal() {
  const page = qs("#quran");
  const openBtn = qs("#openQuranReading");
  const localBtn = qs("#quranOpenLocalTab");
  if (!page) return;

  function getPlan() {
    return WA3I_CTX.quranPlan || computeDailyQuranPages(new Date());
  }

  function openPage() {
    if (typeof getStandalonePageUrl === "function") {
      window.location.href = getStandalonePageUrl("quran");
      return;
    }

    try {
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("view", "quran");
      window.location.href = `${url.pathname}${url.search}`;
    } catch {
      window.location.href = "index.html?view=quran";
    }
  }

  openBtn?.addEventListener("click", openPage);

  localBtn?.addEventListener("click", () => {
    openDailyQuran(ACTIVE_QURAN_PLAN || getPlan());
  });

  if (typeof getStandaloneView === "function" && getStandaloneView() === "quran") {
    renderStandaloneQuranPage(getPlan());
  }
}
