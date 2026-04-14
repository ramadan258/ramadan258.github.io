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

function renderAhdPublicList() {
  const el = qs("#ahdPublicList");
  const count = qs("#ahdCount");
  const canvasEl = qs("#memberCanvasAhdStrip");
  if (!el && !count && !canvasEl) return;

  const ahdMembers = Array.from(FB_STATE.ahd)
    .map((id) => ({ id, ...(FB_STATE.tribe.get(id) || { name: id, src: "" }) }))
    .sort(compareMembersByStatusThenName);

  const previewFallbackMembers =
    !ahdMembers.length && typeof previewModeEnabled === "function" && previewModeEnabled() && typeof readMembersFromDOM === "function"
      ? readMembersFromDOM().slice(0, 6)
      : [];

  const publicMembers = ahdMembers.length ? ahdMembers : previewFallbackMembers;
  const visibleCanvasMembers = publicMembers.slice(0, 6);
  const extraCanvasCount = Math.max(0, publicMembers.length - visibleCanvasMembers.length);

  if (count) {
    count.textContent = `${formatArabicNumber(publicMembers.length)} عضو`;
  }

  if (el) {
    el.innerHTML = publicMembers.length
      ? publicMembers
          .map((m) => {
            const status = getMemberStatus(m.id);
            const statusClass = status ? memberStatusClass(status) : "";
            const avatarClass = status ? `member-avatar ${statusClass}` : "member-avatar";
            const cardClass = status ? `slide-card ahd-slide-card ${statusClass}` : "slide-card ahd-slide-card";
            return `
        <div class="${cardClass}" data-member-id="${escapeHtml(m.id)}" style="cursor:default">
          <img class="${avatarClass}" src="${m.src || "images/person1.jpg"}" alt="${escapeHtml(m.name || m.id)}" />
          <h3>${escapeHtml(m.name || m.id)}</h3>
        </div>
      `;
          })
          .join("")
      : `<div class="identity-empty ahd-public-empty">لا يوجد أعضاء في العهد بعد.</div>`;
  }

  if (canvasEl) {
    canvasEl.innerHTML = visibleCanvasMembers.length
      ? visibleCanvasMembers
          .map((m) => {
            const status = getMemberStatus(m.id);
            const avatarClass = status ? `member-canvas-ahd-avatar member-avatar ${memberStatusClass(status)}` : "member-canvas-ahd-avatar member-avatar";
            return `
        <div class="member-canvas-ahd-item" title="${escapeHtml(m.name || m.id)}" aria-label="${escapeHtml(m.name || m.id)}">
          <img class="${avatarClass}" src="${m.src || "images/person1.jpg"}" alt="${escapeHtml(m.name || m.id)}" />
        </div>
      `;
          })
          .join("") + (extraCanvasCount ? `<div class="member-canvas-ahd-more">+${formatArabicNumber(extraCanvasCount)}</div>` : "")
      : "";
  }

  if (FB_STATE.isAdmin) {
    renderAhdAdminLists(qs("#ahdAdminSearch")?.value || "");
  }
}

function renderAhdAdminLists(filterText = "") {
  const notInEl = qs("#tribeNotInAhdList");
  const ahdEl = qs("#ahdManageList");
  if (!notInEl || !ahdEl) return;

  const q = String(filterText || "").trim();

  const tribeList = Array.from(FB_STATE.tribe.entries()).map(([id, m]) => ({ id, ...m }));
  const notIn = tribeList
    .filter((m) => !FB_STATE.ahd.has(m.id))
    .filter((m) => (q ? (m.name || "").includes(q) : true))
    .sort(compareMembersByStatusThenName);

  const inAhd = tribeList
    .filter((m) => FB_STATE.ahd.has(m.id))
    .sort(compareMembersByStatusThenName);

  notInEl.innerHTML = notIn.length
    ? notIn
        .map((m) => {
          const status = getMemberStatus(m.id);
          const avatarClass = status ? `identity-avatar member-avatar ${memberStatusClass(status)}` : "identity-avatar member-avatar";
          return `
        <button class="identity-item" type="button" data-add-ahd="${m.id}" aria-label="إضافة ${escapeHtml(m.name)}">
          <img class="${avatarClass}" src="${m.src}" alt="${escapeHtml(m.name)}" />
          <div class="identity-name">${escapeHtml(m.name)}</div>
        </button>
      `;
        })
        .join("")
    : `<div class="identity-empty">لا يوجد أعضاء متاحون للإضافة.</div>`;

  ahdEl.innerHTML = inAhd.length
    ? inAhd
        .map((m) => {
          const status = getMemberStatus(m.id);
          const avatarClass = status ? `identity-avatar member-avatar ${memberStatusClass(status)}` : "identity-avatar member-avatar";
          return `
        <button class="identity-item" type="button" data-remove-ahd="${m.id}" aria-label="حذف ${escapeHtml(m.name)}">
          <img class="${avatarClass}" src="${m.src}" alt="${escapeHtml(m.name)}" />
          <div class="identity-name">${escapeHtml(m.name)}</div>
        </button>
      `;
        })
        .join("")
    : `<div class="identity-empty">لا يوجد أعضاء في العهد.</div>`;

  notInEl.querySelectorAll("[data-add-ahd]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-add-ahd");
      await addMemberToAhd(id);
    });
  });

  ahdEl.querySelectorAll("[data-remove-ahd]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-remove-ahd");
      const ok = confirm("هل تريد حذف هذا العضو من العهد؟");
      if (!ok) return;
      await removeMemberFromAhd(id);
    });
  });
}

async function addMemberToAhd(memberId) {
  if (!FB_STATE.isAdmin) return;
  const id = String(memberId || "").trim();
  if (!id) return;

  const { db, doc, setDoc, serverTimestamp } = window.FB;
  await setDoc(doc(db, "ahdMembers", id), { joinedAt: serverTimestamp() }, { merge: true });
}

async function removeMemberFromAhd(memberId) {
  if (!FB_STATE.isAdmin) return;
  const id = String(memberId || "").trim();
  if (!id) return;

  const { db, doc, deleteDoc } = window.FB;
  await deleteDoc(doc(db, "ahdMembers", id));
}

function attachAhdFirestoreListener() {
  const { db, onSnapshot, collection } = window.FB;

  FB_STATE.unsubscribers.forEach((u) => {
    try {
      u();
    } catch {}
  });
  FB_STATE.unsubscribers = [];

  const unsubAhd = onSnapshot(collection(db, "ahdMembers"), (snap) => {
    FB_STATE.ahd = new Set();
    snap.forEach((docSnap) => FB_STATE.ahd.add(docSnap.id));
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
