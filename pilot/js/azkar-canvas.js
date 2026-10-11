const AZKAR_CANVAS_STATE = {
  screen: "choices",
  type: "",
  dataPromise: null,
};

function azkarCanvasIsOpen() {
  return document.querySelector("#memberCanvasAzkar")?.classList.contains("member-canvas-window-mounted") || false;
}

function escapeAzkarCanvasHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAzkarCanvasNumber(value) {
  return String(value).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
}

function normalizeAzkarCanvasType(value) {
  return String(value || "").trim().toLowerCase() === "evening" ? "evening" : "morning";
}

function setAzkarCanvasHeader(titleText, backLabel = "") {
  if (!azkarCanvasIsOpen()) return;

  const title = document.querySelector("#memberCanvasWindowTitle");
  const back = document.querySelector("#memberCanvasWindowBack");
  if (title) title.textContent = String(titleText || "الأذكار").trim();
  if (!back) return;

  const destination = String(backLabel || "").trim();
  back.hidden = !destination;
  back.textContent = "→";
  back.setAttribute("aria-label", destination ? `العودة إلى ${destination}` : "العودة");
  if (destination) back.title = `العودة إلى ${destination}`;
  else back.removeAttribute("title");
}

function loadAzkarCanvasData() {
  if (window.AZKAR_DATA) return Promise.resolve(window.AZKAR_DATA);
  if (AZKAR_CANVAS_STATE.dataPromise) return AZKAR_CANVAS_STATE.dataPromise;

  AZKAR_CANVAS_STATE.dataPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "azkar-data.js?v=20260914azkar1";
    script.async = true;
    script.onload = () => window.AZKAR_DATA ? resolve(window.AZKAR_DATA) : reject(new Error("AZKAR_DATA_MISSING"));
    script.onerror = () => reject(new Error("AZKAR_DATA_LOAD_FAILED"));
    document.head.appendChild(script);
  });

  return AZKAR_CANVAS_STATE.dataPromise;
}

function renderAzkarCanvasChoices() {
  const list = document.querySelector("#memberCanvasAzkarList");
  if (!list) return;

  AZKAR_CANVAS_STATE.screen = "choices";
  AZKAR_CANVAS_STATE.type = "";
  setAzkarCanvasHeader("الأذكار");
  list.innerHTML = `
    <button type="button" class="member-canvas-azkar-choice is-morning" data-azkar-canvas-choice="morning">
      <span class="member-canvas-azkar-choice__title">أذكار الصباح</span>
      <span class="member-canvas-azkar-choice__copy">ابدأ يومك بذكر الله</span>
    </button>
    <button type="button" class="member-canvas-azkar-choice is-evening" data-azkar-canvas-choice="evening">
      <span class="member-canvas-azkar-choice__title">أذكار المساء</span>
      <span class="member-canvas-azkar-choice__copy">اختم يومك بذكر الله</span>
    </button>
  `;

  list.querySelectorAll("[data-azkar-canvas-choice]").forEach((button) => {
    button.addEventListener("click", () => openAzkarCanvasReader(button.getAttribute("data-azkar-canvas-choice")));
  });
}

function renderAzkarCanvasReader(items) {
  const list = document.querySelector("#memberCanvasAzkarList");
  if (!list) return;

  const type = normalizeAzkarCanvasType(AZKAR_CANVAS_STATE.type);
  const title = type === "evening" ? "أذكار المساء" : "أذكار الصباح";
  setAzkarCanvasHeader(title, "الأذكار");

  if (!Array.isArray(items) || !items.length) {
    list.innerHTML = '<div class="member-canvas-choice-empty">تعذر تحميل الأذكار الآن. أعد المحاولة بعد قليل.</div>';
    return;
  }

  list.innerHTML = `
    <div class="member-canvas-azkar-reader-note">اقرأ بهدوء، وستجد العدد المطلوب بجانب كل ذكر.</div>
    ${items.map((item, index) => {
      const count = String(item?.count_description || (item?.count ? `${item.count} مرات` : "مرة واحدة")).trim();
      const content = escapeAzkarCanvasHtml(item?.content || "");
      const fadl = String(item?.fadl || "").trim();
      const source = String(item?.source || "").trim();
      const details = fadl || source;

      return `
        <article class="member-canvas-zikr-card">
          <div class="member-canvas-zikr-card__head">
            <span class="member-canvas-zikr-card__order">${formatAzkarCanvasNumber(index + 1)}</span>
            <span class="member-canvas-zikr-card__count">${escapeAzkarCanvasHtml(count)}</span>
          </div>
          <div class="member-canvas-zikr-card__content">${content}</div>
          ${details ? `
            <details class="member-canvas-zikr-card__details">
              <summary>الفائدة والمصدر</summary>
              <div class="member-canvas-zikr-card__extra">
                ${fadl ? `<div><strong>الفضل</strong>${escapeAzkarCanvasHtml(fadl)}</div>` : ""}
                ${source ? `<div><strong>المصدر</strong>${escapeAzkarCanvasHtml(source)}</div>` : ""}
              </div>
            </details>
          ` : ""}
        </article>
      `;
    }).join("")}
  `;
}

function openAzkarCanvasChoices() {
  renderAzkarCanvasChoices();
}

async function openAzkarCanvasReader(type) {
  AZKAR_CANVAS_STATE.screen = "reader";
  AZKAR_CANVAS_STATE.type = normalizeAzkarCanvasType(type);

  const list = document.querySelector("#memberCanvasAzkarList");
  const title = AZKAR_CANVAS_STATE.type === "evening" ? "أذكار المساء" : "أذكار الصباح";
  setAzkarCanvasHeader(title, "الأذكار");
  if (list) list.innerHTML = '<div class="member-canvas-azkar-loading">جاري تجهيز الأذكار...</div>';

  try {
    const data = await loadAzkarCanvasData();
    if (!azkarCanvasIsOpen() || AZKAR_CANVAS_STATE.screen !== "reader") return;
    renderAzkarCanvasReader(Array.isArray(data?.[AZKAR_CANVAS_STATE.type]) ? data[AZKAR_CANVAS_STATE.type] : []);
  } catch {
    if (list && azkarCanvasIsOpen()) {
      list.innerHTML = '<div class="member-canvas-choice-empty">تعذر تحميل الأذكار الآن. أعد المحاولة بعد قليل.</div>';
    }
  }
}

function goBackInAzkarCanvas() {
  if (AZKAR_CANVAS_STATE.screen !== "reader") return;
  openAzkarCanvasChoices();
}

function openAzkarCanvas() {
  if (typeof openMemberCanvasWindow !== "function") return;
  openMemberCanvasWindow("#memberCanvasAzkar", "الأذكار", "", "azkar");
}
