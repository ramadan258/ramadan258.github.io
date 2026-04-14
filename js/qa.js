const FIRESTORE_QA_BUCKET = "featuredMembers";
const QA_CATEGORY_DOC_PREFIX = "qa_category__";
const QA_ITEM_DOC_PREFIX = "qa_item__";

const QA_PREVIEW_CATEGORIES = [
  { id: "qa_preview_relapse", name: "أسئلة عن الزلات والانتكاسات", sortKey: 1 },
  { id: "qa_preview_urges", name: "أسئلة عن الرغبة والاستمناء", sortKey: 2 },
  { id: "qa_preview_beginner", name: "دليل المتعافين الجدد", sortKey: 3 },
];

const QA_PREVIEW_ITEMS = [
  {
    id: "qa_preview_item_1",
    categoryId: "qa_preview_relapse",
    question: "انتكست الآن، ما أول شيء أفعله؟",
    answer: "اهدأ أولًا، اقطع العزلة فورًا، لا تدخل في جلد الذات، ثم عد مباشرة إلى السبب الذي أسقطك وخذ خطوة عملية صغيرة تمنع التكرار الليلة.",
    sortKey: 1,
  },
  {
    id: "qa_preview_item_2",
    categoryId: "qa_preview_relapse",
    question: "هل الانتكاسة تعني أنني عدت إلى الصفر؟",
    answer: "لا. المهم هو سرعة الرجوع، وفهم السبب، وعدم تحويل السقطة إلى سلسلة متصلة من التساهل.",
    sortKey: 2,
  },
  {
    id: "qa_preview_item_3",
    categoryId: "qa_preview_urges",
    question: "ماذا أفعل عندما تشتد الرغبة فجأة؟",
    answer: "تحرك فورًا، بدّل المكان، ابعد الهاتف، خذ نفسًا عميقًا، وافتح شيئًا نافعًا يشغل ذهنك في أول دقيقة.",
    sortKey: 3,
  },
  {
    id: "qa_preview_item_4",
    categoryId: "qa_preview_beginner",
    question: "ما أول قاعدة في بداية التعافي؟",
    answer: "لا تترك نفسك في فراغ صامت مع الهاتف. ابدأ بتنظيم يومك، وتقليل الخلوة، وبناء بدائل واضحة وسريعة.",
    sortKey: 4,
  },
];

const QA_STATE = {
  categories: [],
  items: [],
  adminCategoryId: "",
  editingCategoryId: "",
  editingItemId: "",
  listenersAttached: false,
  controlsWired: false,
  unsubs: [],
};

function sortQaCategories(list) {
  return list.slice().sort((a, b) => {
    const aKey = Number(a?.sortKey || 0);
    const bKey = Number(b?.sortKey || 0);
    if (aKey !== bKey) return aKey - bKey;
    return String(a?.name || "").localeCompare(String(b?.name || ""), "ar");
  });
}

function sortQaItems(list) {
  return list.slice().sort((a, b) => {
    const aKey = Number(a?.sortKey || 0);
    const bKey = Number(b?.sortKey || 0);
    if (aKey !== bKey) return aKey - bKey;
    return String(a?.question || "").localeCompare(String(b?.question || ""), "ar");
  });
}

function getQaCategoriesForView() {
  const categories = QA_STATE.categories.length
    ? QA_STATE.categories
    : (typeof previewModeEnabled === "function" && previewModeEnabled() ? QA_PREVIEW_CATEGORIES : []);
  return sortQaCategories(categories);
}

function getQaItemsForView() {
  const items = QA_STATE.items.length
    ? QA_STATE.items
    : (typeof previewModeEnabled === "function" && previewModeEnabled() ? QA_PREVIEW_ITEMS : []);
  return sortQaItems(items);
}

function getQaCounts() {
  const categories = getQaCategoriesForView();
  const items = getQaItemsForView();
  return {
    categoriesCount: categories.length,
    itemsCount: items.length,
  };
}

function getQaPageSelectedCategoryId() {
  try {
    const url = new URL(window.location.href);
    return String(url.searchParams.get("qaCategory") || "").trim();
  } catch {
    return "";
  }
}

function buildQaPageUrl(categoryId = "") {
  const nextUrl = typeof getStandalonePageUrl === "function"
    ? new URL(getStandalonePageUrl("qa"), window.location.href)
    : new URL("index.html?view=qa", window.location.href);

  const id = String(categoryId || "").trim();
  if (id) nextUrl.searchParams.set("qaCategory", id);
  else nextUrl.searchParams.delete("qaCategory");

  return `${nextUrl.pathname}${nextUrl.search}`;
}

function openQaCategoryPage(categoryId) {
  const id = String(categoryId || "").trim();
  if (!id) return;
  window.location.href = buildQaPageUrl(id);
}

function openQaCategoriesPage() {
  window.location.href = buildQaPageUrl("");
}

function normalizeQaPageSelection(categoryList) {
  const categories = Array.isArray(categoryList) ? categoryList : getQaCategoriesForView();
  if (!categories.length) {
    return "";
  }

  const selectedId = getQaPageSelectedCategoryId();
  const exists = categories.some((category) => category.id === selectedId);
  return exists ? selectedId : "";
}

function getQaAdminSelectedCategoryId() {
  const categories = sortQaCategories(QA_STATE.categories);
  if (!categories.length) {
    QA_STATE.adminCategoryId = "";
    return "";
  }

  const exists = categories.some((category) => category.id === QA_STATE.adminCategoryId);
  if (!exists) {
    QA_STATE.adminCategoryId = categories[0].id;
  }
  return QA_STATE.adminCategoryId;
}

function selectQaCategory(categoryId) {
  openQaCategoryPage(categoryId);
}

function clearQaCategorySelection() {
  openQaCategoriesPage();
}

function selectQaAdminCategory(categoryId) {
  QA_STATE.adminCategoryId = String(categoryId || "").trim();
  getQaAdminSelectedCategoryId();
  renderQaAdminPanel();
}

function categoryQuestionCount(categoryId) {
  return getQaItemsForView().filter((item) => item.categoryId === categoryId).length;
}

function renderQaTaskMeta() {
  const counts = getQaCounts();
  const categoriesEl = qs("#qaDailyCategories");
  const metaEl = qs("#qaDailyMeta");

  if (categoriesEl) {
    categoriesEl.textContent = counts.categoriesCount
      ? `${formatArabicNumber(counts.categoriesCount)} قوائم جاهزة`
      : "لا توجد قوائم بعد";
  }

  if (metaEl) {
    metaEl.textContent = counts.itemsCount
      ? `${formatArabicNumber(counts.itemsCount)} سؤال وجواب متاح`
      : "أضف أول قائمة من لوحة أمجد";
  }
}

function renderQaPage() {
  const categoryRail = qs("#qaCategoryRail");
  const questionPanel = qs("#qaQuestionPanel");
  const backBtn = qs("#qaBackToCategories");
  const categoryName = qs("#qaCurrentCategoryName");
  const categoryMeta = qs("#qaCurrentCategoryMeta");
  const questionList = qs("#qaQuestionList");
  const emptyEl = qs("#qaPageEmpty");

  if (!categoryRail || !questionPanel || !backBtn || !categoryName || !categoryMeta || !questionList || !emptyEl) return;

  const categories = getQaCategoriesForView();
  const items = getQaItemsForView();
  const selectedCategoryId = normalizeQaPageSelection(categories);
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) || null;
  const selectedItems = items.filter((item) => item.categoryId === selectedCategoryId);

  emptyEl.hidden = categories.length > 0;
  categoryRail.hidden = categories.length === 0 || Boolean(selectedCategoryId);
  categoryRail.style.display = categories.length === 0 || Boolean(selectedCategoryId) ? "none" : "";
  questionPanel.hidden = !selectedCategoryId;
  questionPanel.style.display = selectedCategoryId ? "grid" : "none";
  backBtn.setAttribute("href", buildQaPageUrl(""));

  if (!categories.length) {
    categoryRail.innerHTML = "";
    categoryName.textContent = "لا توجد قوائم بعد";
    categoryMeta.textContent = "عندما يضيف أمجد المحتوى سيظهر هنا مباشرة.";
    questionList.innerHTML = "";
    questionPanel.hidden = true;
    questionPanel.style.display = "none";
    renderQaTaskMeta();
    return;
  }

  categoryRail.innerHTML = categories.map((category) => {
    const count = categoryQuestionCount(category.id);
    const active = category.id === selectedCategoryId;
    return `
      <a class="qa-category-card${active ? " is-active" : ""}" href="${escapeHtml(buildQaPageUrl(category.id))}" data-qa-category="${escapeHtml(category.id)}">
        <span class="qa-category-card-title">${escapeHtml(category.name)}</span>
        <span class="qa-category-card-count">${formatArabicNumber(count)} سؤال</span>
      </a>
    `;
  }).join("");

  if (!selectedCategoryId || !selectedCategory) {
    categoryName.textContent = "—";
    categoryMeta.textContent = "";
    questionList.innerHTML = "";
    renderQaTaskMeta();
    return;
  }

  categoryName.textContent = selectedCategory?.name || "—";
  categoryMeta.textContent = selectedItems.length
    ? `${formatArabicNumber(selectedItems.length)} سؤال داخل هذه القائمة`
    : "لا يوجد أسئلة داخل هذه القائمة بعد.";

  questionList.innerHTML = selectedItems.length
    ? selectedItems.map((item, index) => `
        <details class="qa-question-item">
          <summary class="qa-question-summary">
            <span class="qa-question-index">${formatArabicNumber(index + 1)}</span>
            <span class="qa-question-text">${escapeHtml(item.question)}</span>
          </summary>
          <div class="qa-answer-body">${escapeHtml(item.answer).replace(/\n/g, "<br>")}</div>
        </details>
      `).join("")
    : `<div class="qa-inline-empty">لا يوجد أسئلة داخل هذه القائمة حتى الآن.</div>`;

  renderQaTaskMeta();
}

function setQaAdminVisibility() {
  const wrap = qs("#qaAdminWrap");
  const show = hasQaAdminAccess() && ADMIN_UI_STATE.activePanel === "qa";
  if (wrap) {
    wrap.style.display = show ? "block" : "none";
    wrap.setAttribute("aria-hidden", show ? "false" : "true");
  }
}

function setQaAdminCategoryStatus(message, isError = false) {
  const el = qs("#qaAdminCategoryStatus");
  if (!el) return;
  el.textContent = String(message || "").trim();
  el.style.color = isError ? "#ffb4b4" : "";
}

function setQaAdminItemStatus(message, isError = false) {
  const el = qs("#qaAdminItemStatus");
  if (!el) return;
  el.textContent = String(message || "").trim();
  el.style.color = isError ? "#ffb4b4" : "";
}

function refreshQaAdminFormState() {
  const categoryAddBtn = qs("#qaAdminAddCategoryBtn");
  const categoryResetBtn = qs("#qaAdminResetCategoryBtn");
  const itemAddBtn = qs("#qaAdminAddItemBtn");
  const itemResetBtn = qs("#qaAdminResetItemBtn");

  if (categoryAddBtn) {
    categoryAddBtn.textContent = QA_STATE.editingCategoryId ? "حفظ تعديل القائمة" : "إضافة القائمة";
  }
  if (categoryResetBtn) {
    categoryResetBtn.textContent = QA_STATE.editingCategoryId ? "إلغاء التعديل" : "إفراغ";
  }
  if (itemAddBtn) {
    itemAddBtn.textContent = QA_STATE.editingItemId ? "حفظ التعديل" : "إضافة سؤال وجواب";
  }
  if (itemResetBtn) {
    itemResetBtn.textContent = QA_STATE.editingItemId ? "إلغاء التعديل" : "إفراغ الحقول";
  }
}

function resetQaAdminCategoryForm() {
  const input = qs("#qaAdminCategoryName");
  if (input) input.value = "";
  QA_STATE.editingCategoryId = "";
  setQaAdminCategoryStatus("");
  refreshQaAdminFormState();
  renderQaAdminPanel();
}

function resetQaAdminItemForm() {
  const question = qs("#qaAdminQuestion");
  const answer = qs("#qaAdminAnswer");
  if (question) question.value = "";
  if (answer) answer.value = "";
  QA_STATE.editingItemId = "";
  setQaAdminItemStatus("");
  refreshQaAdminFormState();
  renderQaAdminPanel();
}

function createQaCategoryId(name) {
  return `qa_category_${slugifyName(name)}_${Date.now().toString(36)}`;
}

function createQaItemId(categoryId) {
  return `qa_item_${slugifyName(categoryId)}_${Date.now().toString(36)}`;
}

function qaCategoryDocId(categoryId) {
  return `${QA_CATEGORY_DOC_PREFIX}${String(categoryId || "").trim()}`;
}

function qaItemDocId(itemId) {
  return `${QA_ITEM_DOC_PREFIX}${String(itemId || "").trim()}`;
}

function beginEditQaCategory(categoryId) {
  const id = String(categoryId || "").trim();
  const category = QA_STATE.categories.find((entry) => entry.id === id);
  if (!category) return;

  const input = qs("#qaAdminCategoryName");
  if (input) input.value = category.name || "";
  QA_STATE.editingCategoryId = id;
  setQaAdminCategoryStatus("عدّل اسم القائمة ثم اضغط حفظ التعديل.");
  refreshQaAdminFormState();
  renderQaAdminPanel();
  input?.focus?.();
}

function beginEditQaItem(itemId) {
  const id = String(itemId || "").trim();
  const item = QA_STATE.items.find((entry) => entry.id === id);
  if (!item) return;

  const categorySelect = qs("#qaAdminCategorySelect");
  const questionInput = qs("#qaAdminQuestion");
  const answerInput = qs("#qaAdminAnswer");

  QA_STATE.editingItemId = id;
  QA_STATE.adminCategoryId = item.categoryId;
  if (categorySelect) categorySelect.value = item.categoryId;
  if (questionInput) questionInput.value = item.question || "";
  if (answerInput) answerInput.value = item.answer || "";
  setQaAdminItemStatus("عدّل السؤال أو الجواب ثم اضغط حفظ التعديل.");
  refreshQaAdminFormState();
  renderQaAdminPanel();
  questionInput?.focus?.();
}

function renderQaAdminPanel() {
  const categoryList = qs("#qaAdminCategoryList");
  const categorySelect = qs("#qaAdminCategorySelect");
  const itemList = qs("#qaAdminItemList");
  if (!categoryList || !categorySelect || !itemList) return;

  const categories = sortQaCategories(QA_STATE.categories);
  const items = sortQaItems(QA_STATE.items);
  const selectedCategoryId = getQaAdminSelectedCategoryId();
  const selectedItems = items.filter((item) => item.categoryId === selectedCategoryId);

  categorySelect.innerHTML = categories.length
    ? categories.map((category) => `
        <option value="${escapeHtml(category.id)}" ${category.id === selectedCategoryId ? "selected" : ""}>
          ${escapeHtml(category.name)}
        </option>
      `).join("")
    : `<option value="">أضف قائمة أولًا</option>`;

  categoryList.innerHTML = categories.length
    ? categories.map((category) => {
        const count = items.filter((item) => item.categoryId === category.id).length;
        const active = category.id === selectedCategoryId;
        const editing = category.id === QA_STATE.editingCategoryId;
        return `
          <div class="qa-admin-category-card${active ? " is-active" : ""}${editing ? " is-editing" : ""}">
            <button class="qa-admin-category-main" type="button" data-qa-admin-select="${escapeHtml(category.id)}">
              <span class="qa-admin-category-name">${escapeHtml(category.name)}</span>
              <span class="qa-admin-category-count">${formatArabicNumber(count)} سؤال</span>
            </button>
            <div class="qa-admin-action-stack">
              <button class="qa-admin-edit-btn" type="button" data-qa-admin-edit-category="${escapeHtml(category.id)}">تعديل</button>
              <button class="qa-admin-delete-btn" type="button" data-qa-admin-delete-category="${escapeHtml(category.id)}">حذف</button>
            </div>
          </div>
        `;
      }).join("")
    : `<div class="qa-admin-empty">لا توجد قوائم بعد.</div>`;

  itemList.innerHTML = selectedCategoryId
    ? (selectedItems.length
        ? selectedItems.map((item, index) => `
            <div class="qa-admin-item-card${item.id === QA_STATE.editingItemId ? " is-editing" : ""}">
              <div class="qa-admin-item-copy">
                <div class="qa-admin-item-question">${formatArabicNumber(index + 1)}. ${escapeHtml(item.question)}</div>
                <div class="qa-admin-item-answer">${escapeHtml(item.answer).replace(/\n/g, "<br>")}</div>
              </div>
              <div class="qa-admin-action-stack">
                <button class="qa-admin-edit-btn" type="button" data-qa-admin-edit-item="${escapeHtml(item.id)}">تعديل</button>
                <button class="qa-admin-delete-btn" type="button" data-qa-admin-delete-item="${escapeHtml(item.id)}">حذف</button>
              </div>
            </div>
          `).join("")
        : `<div class="qa-admin-empty">لا يوجد أسئلة داخل هذه القائمة بعد.</div>`)
    : `<div class="qa-admin-empty">اختر قائمة أولًا ثم أضف داخلها السؤال والجواب.</div>`;

  categoryList.querySelectorAll("[data-qa-admin-select]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectQaAdminCategory(btn.getAttribute("data-qa-admin-select"));
    });
  });

  categoryList.querySelectorAll("[data-qa-admin-edit-category]").forEach((btn) => {
    btn.addEventListener("click", () => {
      beginEditQaCategory(btn.getAttribute("data-qa-admin-edit-category"));
    });
  });

  categoryList.querySelectorAll("[data-qa-admin-delete-category]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await deleteQaCategory(btn.getAttribute("data-qa-admin-delete-category"));
    });
  });

  itemList.querySelectorAll("[data-qa-admin-edit-item]").forEach((btn) => {
    btn.addEventListener("click", () => {
      beginEditQaItem(btn.getAttribute("data-qa-admin-edit-item"));
    });
  });

  itemList.querySelectorAll("[data-qa-admin-delete-item]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await deleteQaItem(btn.getAttribute("data-qa-admin-delete-item"));
    });
  });
}

async function addQaCategory() {
  if (!hasQaAdminAccess()) return;

  const input = qs("#qaAdminCategoryName");
  const name = String(input?.value || "").trim();
  if (!name) {
    setQaAdminCategoryStatus("اكتب اسم القائمة أولًا.", true);
    return;
  }

  const exists = QA_STATE.categories.some((category) => (
    String(category.name || "").trim() === name && category.id !== QA_STATE.editingCategoryId
  ));
  if (exists) {
    setQaAdminCategoryStatus("هذه القائمة موجودة بالفعل.", true);
    return;
  }

  setQaAdminCategoryStatus(QA_STATE.editingCategoryId ? "جارٍ حفظ تعديل القائمة..." : "جارٍ إضافة القائمة...");

  const { db, doc, setDoc, serverTimestamp } = window.FB;
  const existingCategory = QA_STATE.categories.find((category) => category.id === QA_STATE.editingCategoryId);
  const id = QA_STATE.editingCategoryId || createQaCategoryId(name);
  try {
    await setDoc(doc(db, FIRESTORE_QA_BUCKET, qaCategoryDocId(id)), {
      type: "qa_category",
      categoryId: id,
      name,
      sortKey: existingCategory?.sortKey || Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    if (input) input.value = "";
    QA_STATE.adminCategoryId = id;
    QA_STATE.editingCategoryId = "";
    setQaAdminCategoryStatus(existingCategory ? "تم حفظ تعديل القائمة." : "تمت إضافة القائمة.");
    refreshQaAdminFormState();
    renderQaAdminPanel();
    showIdentityToast(existingCategory ? "تم تعديل اسم القائمة." : "تمت إضافة قائمة جديدة إلى سؤال وجواب.");
  } catch (error) {
    console.error("Failed to add QA category", error);
    setQaAdminCategoryStatus(QA_STATE.editingCategoryId ? "تعذّر حفظ تعديل القائمة الآن." : "تعذّرت إضافة القائمة الآن.", true);
  }
}

async function deleteQaCategory(categoryId) {
  if (!hasQaAdminAccess()) return;
  const id = String(categoryId || "").trim();
  if (!id) return;

  const category = QA_STATE.categories.find((entry) => entry.id === id);
  if (!category) return;

  const linkedItems = QA_STATE.items.filter((item) => item.categoryId === id);
  const ok = confirm(`هل تريد حذف قائمة “${category.name}” وكل ما بداخلها؟`);
  if (!ok) return;

  setQaAdminCategoryStatus("جارٍ حذف القائمة...");

  const { db, doc, deleteDoc } = window.FB;
  try {
    const jobs = [
      deleteDoc(doc(db, FIRESTORE_QA_BUCKET, qaCategoryDocId(id))),
      ...linkedItems.map((item) => deleteDoc(doc(db, FIRESTORE_QA_BUCKET, qaItemDocId(item.id)))),
    ];
    await Promise.all(jobs);
    if (QA_STATE.adminCategoryId === id) QA_STATE.adminCategoryId = "";
    if (QA_STATE.editingCategoryId === id) QA_STATE.editingCategoryId = "";
    setQaAdminCategoryStatus("تم حذف القائمة.");
    refreshQaAdminFormState();
    renderQaAdminPanel();
    showIdentityToast("تم حذف القائمة وما بداخلها.");
  } catch (error) {
    console.error("Failed to delete QA category", error);
    setQaAdminCategoryStatus("تعذّر حذف القائمة الآن.", true);
  }
}

async function addQaItem() {
  if (!hasQaAdminAccess()) return;

  const categorySelect = qs("#qaAdminCategorySelect");
  const questionInput = qs("#qaAdminQuestion");
  const answerInput = qs("#qaAdminAnswer");

  const categoryId = String(categorySelect?.value || "").trim();
  const question = String(questionInput?.value || "").trim();
  const answer = String(answerInput?.value || "").trim();

  if (!categoryId) {
    setQaAdminItemStatus("اختر القائمة أولًا.", true);
    return;
  }
  if (!question) {
    setQaAdminItemStatus("الصق السؤال أولًا.", true);
    return;
  }
  if (!answer) {
    setQaAdminItemStatus("الصق الجواب أولًا.", true);
    return;
  }

  setQaAdminItemStatus(QA_STATE.editingItemId ? "جارٍ حفظ التعديل..." : "جارٍ إضافة السؤال والجواب...");

  const { db, doc, setDoc, serverTimestamp } = window.FB;
  const existingItem = QA_STATE.items.find((item) => item.id === QA_STATE.editingItemId);
  const id = QA_STATE.editingItemId || createQaItemId(categoryId);
  try {
    await setDoc(doc(db, FIRESTORE_QA_BUCKET, qaItemDocId(id)), {
      type: "qa_item",
      itemId: id,
      categoryId,
      question,
      answer,
      sortKey: existingItem?.sortKey || Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    QA_STATE.adminCategoryId = categoryId;
    resetQaAdminItemForm();
    setQaAdminItemStatus(existingItem ? "تم حفظ التعديل." : "تمت إضافة السؤال والجواب.");
    showIdentityToast(existingItem ? "تم تعديل السؤال والجواب." : "تمت إضافة سؤال وجواب جديد.");
  } catch (error) {
    console.error("Failed to add QA item", error);
    setQaAdminItemStatus(QA_STATE.editingItemId ? "تعذّر حفظ التعديل الآن." : "تعذّرت إضافة السؤال والجواب الآن.", true);
  }
}

async function deleteQaItem(itemId) {
  if (!hasQaAdminAccess()) return;
  const id = String(itemId || "").trim();
  if (!id) return;

  const item = QA_STATE.items.find((entry) => entry.id === id);
  if (!item) return;

  const ok = confirm("هل تريد حذف هذا السؤال والجواب؟");
  if (!ok) return;

  setQaAdminItemStatus("جارٍ حذف السؤال والجواب...");

  const { db, doc, deleteDoc } = window.FB;
  try {
    await deleteDoc(doc(db, FIRESTORE_QA_BUCKET, qaItemDocId(id)));
    if (QA_STATE.editingItemId === id) QA_STATE.editingItemId = "";
    setQaAdminItemStatus("تم حذف السؤال والجواب.");
    refreshQaAdminFormState();
    renderQaAdminPanel();
    showIdentityToast("تم حذف السؤال والجواب.");
  } catch (error) {
    console.error("Failed to delete QA item", error);
    setQaAdminItemStatus("تعذّر حذف السؤال والجواب الآن.", true);
  }
}

function wireQaAdminControls() {
  if (QA_STATE.controlsWired) return;
  QA_STATE.controlsWired = true;

  qs("#qaAdminAddCategoryBtn")?.addEventListener("click", addQaCategory);
  qs("#qaAdminResetCategoryBtn")?.addEventListener("click", resetQaAdminCategoryForm);
  qs("#qaAdminCategoryName")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addQaCategory();
  });

  qs("#qaAdminCategorySelect")?.addEventListener("change", (e) => {
    selectQaAdminCategory(e.target.value || "");
  });

  qs("#qaAdminAddItemBtn")?.addEventListener("click", addQaItem);
  qs("#qaAdminResetItemBtn")?.addEventListener("click", resetQaAdminItemForm);
}

function attachQaFirestoreListeners() {
  if (QA_STATE.listenersAttached) return;
  QA_STATE.listenersAttached = true;

  const tryInit = () => {
    if (!fbAvailable()) {
      setTimeout(tryInit, 80);
      return;
    }

    QA_STATE.unsubs.forEach((unsub) => {
      try { unsub(); } catch {}
    });
    QA_STATE.unsubs = [];

    const { db, onSnapshot, collection } = window.FB;

    const unsubCategories = onSnapshot(
      collection(db, FIRESTORE_QA_BUCKET),
      (snap) => {
        const next = [];
        snap.forEach((docSnap) => {
          if (!String(docSnap.id || "").startsWith(QA_CATEGORY_DOC_PREFIX)) return;
          const data = docSnap.data() || {};
          const id = String(data.categoryId || docSnap.id.replace(QA_CATEGORY_DOC_PREFIX, "")).trim();
          const name = String(data.name || "").trim();
          if (!id || !name) return;
          next.push({
            id,
            name,
            sortKey: Number(data.sortKey || 0),
          });
        });
        QA_STATE.categories = sortQaCategories(next);
        getQaAdminSelectedCategoryId();
        renderQaTaskMeta();
        renderQaPage();
        renderQaAdminPanel();
      },
      (error) => {
        console.error("QA categories listener failed", error);
      }
    );

    const unsubItems = onSnapshot(
      collection(db, FIRESTORE_QA_BUCKET),
      (snap) => {
        const next = [];
        snap.forEach((docSnap) => {
          if (!String(docSnap.id || "").startsWith(QA_ITEM_DOC_PREFIX)) return;
          const data = docSnap.data() || {};
          const id = String(data.itemId || docSnap.id.replace(QA_ITEM_DOC_PREFIX, "")).trim();
          const categoryId = String(data.categoryId || "").trim();
          const question = String(data.question || "").trim();
          const answer = String(data.answer || "").trim();
          if (!id || !categoryId || !question || !answer) return;
          next.push({
            id,
            categoryId,
            question,
            answer,
            sortKey: Number(data.sortKey || 0),
          });
        });
        QA_STATE.items = sortQaItems(next);
        renderQaTaskMeta();
        renderQaPage();
        renderQaAdminPanel();
      },
      (error) => {
        console.error("QA items listener failed", error);
      }
    );

    QA_STATE.unsubs.push(unsubCategories, unsubItems);
  };

  tryInit();
}

function setupQaPage() {
  const openBtn = qs("#openQaPage");
  if (openBtn && !openBtn.dataset.qaWired) {
    openBtn.dataset.qaWired = "1";
    openBtn.addEventListener("click", () => {
      openQaCategoriesPage();
    });
  }
}

function initQaPage() {
  setupQaPage();
  wireQaAdminControls();
  refreshQaAdminFormState();
  renderQaTaskMeta();
  renderQaPage();
  renderQaAdminPanel();
  attachQaFirestoreListeners();
}
