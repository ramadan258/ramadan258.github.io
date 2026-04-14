// ---------------------------
// Hadith (5/day, ثابت لنفس اليوم)
// ---------------------------
const HADITH_CFG = {
  CACHE_KEY: "wa3i_hadith_bank_cache_v1",
  CACHE_TTL_MS: 1000 * 60 * 60 * 24 * 30,
  REMOTE: {
    BUKHARI: "https://raw.githubusercontent.com/AhmedBaset/hadith-json/main/db/by_book/the_9_books/bukhari.json",
    MUSLIM: "https://raw.githubusercontent.com/AhmedBaset/hadith-json/main/db/by_book/the_9_books/muslim.json",
  },
  FALLBACK: [{"id": "fallback_1", "book": "متفق عليه", "text": "إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ."}, {"id": "fallback_2", "book": "متفق عليه", "text": "مَنْ كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الآخِرِ فَلْيَقُلْ خَيْرًا أَوْ لِيَصْمُتْ."}, {"id": "fallback_3", "book": "متفق عليه", "text": "لَا يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لِأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ."}, {"id": "fallback_4", "book": "صحيح مسلم", "text": "الدِّينُ النَّصِيحَةُ."}, {"id": "fallback_5", "book": "صحيح مسلم", "text": "إِنَّ اللَّهَ جَمِيلٌ يُحِبُّ الْجَمَالَ."}, {"id": "fallback_6", "book": "صحيح البخاري", "text": "لَا تَغْضَبْ."}, {"id": "fallback_7", "book": "متفق عليه", "text": "أَحَبُّ الأَعْمَالِ إِلَى اللَّهِ أَدْوَمُهَا وَإِنْ قَلَّ."}, {"id": "fallback_8", "book": "صحيح مسلم", "text": "مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ بِهِ طَرِيقًا إِلَى الْجَنَّةِ."}, {"id": "fallback_9", "book": "صحيح مسلم", "text": "لَا يَدْخُلُ الْجَنَّةَ مَنْ كَانَ فِي قَلْبِهِ مِثْقَالُ ذَرَّةٍ مِنْ كِبْرٍ."}, {"id": "fallback_10", "book": "متفق عليه", "text": "الْمَرْءُ مَعَ مَنْ أَحَبَّ."}],
};

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeRemoteHadith(bookLabel, item) {
  const id = item?.id;
  const text = (item?.arabic || "").trim();
  if (!Number.isFinite(id) || !text) return null;
  return {
    id: `${bookLabel}_${id}`,
    book: bookLabel === "bukhari" ? "صحيح البخاري" : "صحيح مسلم",
    text,
  };
}

async function loadHadithBank() {
  const cachedRaw = localStorage.getItem(HADITH_CFG.CACHE_KEY);
  const cached = cachedRaw ? safeJsonParse(cachedRaw, null) : null;

  if (cached?.savedAt && Array.isArray(cached?.data)) {
    const age = Date.now() - Number(cached.savedAt);
    if (age >= 0 && age < HADITH_CFG.CACHE_TTL_MS) return cached.data;
  }

  try {
    const [bRes, mRes] = await Promise.all([
      fetch(HADITH_CFG.REMOTE.BUKHARI, { headers: { Accept: "application/json" } }),
      fetch(HADITH_CFG.REMOTE.MUSLIM, { headers: { Accept: "application/json" } }),
    ]);

    if (!bRes.ok || !mRes.ok) throw new Error("Hadith fetch failed");

    const [bJson, mJson] = await Promise.all([bRes.json(), mRes.json()]);
    const bArr = Array.isArray(bJson) ? bJson : [];
    const mArr = Array.isArray(mJson) ? mJson : [];

    const bank = [];
    bArr.forEach((it) => {
      const v = normalizeRemoteHadith("bukhari", it);
      if (v) bank.push(v);
    });
    mArr.forEach((it) => {
      const v = normalizeRemoteHadith("muslim", it);
      if (v) bank.push(v);
    });

    if (bank.length < 50) throw new Error("Hadith bank too small");

    localStorage.setItem(HADITH_CFG.CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data: bank }));
    return bank;
  } catch {
    return HADITH_CFG.FALLBACK;
  }
}

function pickDailyHadithIds(todayISO, allIds, usedSet) {
  const available = allIds.filter((id) => !usedSet.has(id));
  const pool = available.length >= 5 ? available : allIds;

  const rng = mulberry32(hash32(`${todayISO}|${currentUserId()}`));
  const arr = pool.slice();

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr.slice(0, 5);
}

async function getHadithOfDay(todayISO) {
  const dailyKey = userKey(`hadith_daily_${todayISO}_v1`);
  const usedKey = userKey("hadith_used_v1");

  const stored = safeJsonParse(localStorage.getItem(dailyKey) || "", null);
  if (stored?.ids && Array.isArray(stored.ids) && stored.ids.length === 5) {
    const bank = await loadHadithBank();
    const map = new Map(bank.map((h) => [h.id, h]));
    const out = stored.ids.map((id) => map.get(id)).filter(Boolean);
    if (out.length === 5) return out;
  }

  const bank = await loadHadithBank();
  const allIds = bank.map((h) => h.id);

  const usedArr = safeJsonParse(localStorage.getItem(usedKey) || "", []);
  const usedSet = new Set(Array.isArray(usedArr) ? usedArr : []);

  const ids = pickDailyHadithIds(todayISO, allIds, usedSet);
  const map = new Map(bank.map((h) => [h.id, h]));
  const hadiths = ids.map((id) => map.get(id)).filter(Boolean);

  localStorage.setItem(dailyKey, JSON.stringify({ ids, savedAt: Date.now() }));

  const nextUsed = new Set(usedSet);
  if (hadiths.length === 5) hadiths.forEach((h) => nextUsed.add(h.id));
  if (allIds.filter((id) => !usedSet.has(id)).length < 5) {
    localStorage.setItem(usedKey, JSON.stringify(hadiths.map((h) => h.id)));
  } else {
    localStorage.setItem(usedKey, JSON.stringify(Array.from(nextUsed)));
  }

  return hadiths.length === 5 ? hadiths : HADITH_CFG.FALLBACK.slice(0, 5);
}

function renderHadithUI(todayISO, hadiths) {
  const sub = qs("#hadithModalSub");
  if (sub) {
    sub.textContent = `٥ أحاديث ثابتة لليوم • ${todayISO}`;
  }

  const meta = qs("#hadithMeta");
  if (meta) {
    meta.innerHTML = `
      <span class="tafsir-page-chip">مصادر: الصحيحين</span>
      <span class="tafsir-page-chip">لا تتكرر حتى تنفد القائمة</span>
    `;
  }

  const list = qs("#hadithList");
  if (!list) return;

  list.innerHTML = hadiths.map((h, i) => {
    const num = formatArabicNumber(i + 1);
    return `
      <div class="tafsir-page">
        <div class="tafsir-page-head">
          <span class="tafsir-page-badge">حديث ${num}</span>
          <span class="tafsir-page-badge secondary">${escapeHtml(h.book || "—")}</span>
        </div>
        <div class="quran-text" style="font-size:18px;line-height:2.1">${escapeHtml(h.text)}</div>
      </div>
    `;
  }).join("");
}

function setupHadithModal(todayISO, state) {
  const modal = qs("#hadithModal");
  if (!modal) return;

  const openBtn = qs("#openHadithModal");
  const closeBtn = qs("#closeHadithModal");
  const closeBtn2 = qs("#closeHadithModal2");
  const copyBtn = qs("#hadithCopy");
  const doneBtn = qs("#hadithMarkDone");

  async function openModal() {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    const list = qs("#hadithList");
    if (list) list.innerHTML = `<div class="tafsir-loader">جارِ تحميل أحاديث اليوم…</div>`;

    const hadiths = await getHadithOfDay(todayISO);
    renderHadithUI(todayISO, hadiths);
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  if (openBtn) openBtn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (closeBtn2) closeBtn2.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) closeModal();
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const hadiths = await getHadithOfDay(todayISO);
      const txt = hadiths.map((h, i) => `${i + 1}) ${h.text} — (${h.book})`).join("\n\n");
      try {
        await navigator.clipboard.writeText(txt);
        showToast("تم نسخ الأحاديث ✅");
      } catch {
        showToast("تعذّر النسخ تلقائيًا");
      }
    });
  }

  if (doneBtn) {
    doneBtn.addEventListener("click", () => {
      if (!WA3I_CTX.state || !WA3I_CTX.todayISO) return;

      const curISO = WA3I_CTX.todayISO;
      const curState = WA3I_CTX.state;

      updateProgressUI(curState);
      maybeUpdateStreakOnFullCompletion(curISO, curState);
      setDailyState(curISO, curState);
      closeModal();
    });
  }
}
