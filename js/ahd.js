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

function getAhdResolvedState() {
  const resolvedMembers = [];
  const orphanIds = [];

  Array.from(FB_STATE.ahd)
    .map((id) => String(id || "").trim())
    .filter(Boolean)
    .forEach((id) => {
      const member = FB_STATE.tribe.get(id);
      if (member && String(member.name || "").trim()) {
        resolvedMembers.push({ id, ...member });
      } else {
        orphanIds.push(id);
      }
    });

  resolvedMembers.sort(compareMembersByStatusThenName);
  orphanIds.sort((a, b) => a.localeCompare(b, "en"));

  return { resolvedMembers, orphanIds };
}

function renderAhdPublicList() {
  const el = qs("#ahdPublicList");
  const count = qs("#ahdCount");
  const canvasEl = qs("#memberCanvasAhdStrip");
  if (!el && !count && !canvasEl) return;

  const { resolvedMembers, orphanIds } = getAhdResolvedState();

  const previewFallbackMembers =
    !resolvedMembers.length &&
    typeof previewModeEnabled === "function" &&
    previewModeEnabled() &&
    typeof readMembersFromDOM === "function"
      ? readMembersFromDOM().slice(0, 6)
      : [];

  const publicMembers = resolvedMembers.length ? resolvedMembers : previewFallbackMembers;
  const visibleCanvasMembers = publicMembers.slice(0, 6);
  const extraCanvasCount = Math.max(0, publicMembers.length - visibleCanvasMembers.length);

  if (count) {
    count.textContent = `${formatArabicNumber(publicMembers.length)} عضو`;
  }

  if (el) {
    el.innerHTML = publicMembers.length
      ? publicMembers
          .map((member) => {
            const status = getMemberStatus(member.id);
            const statusClass = status ? memberStatusClass(status) : "";
            const avatarClass = status ? `member-avatar ${statusClass}` : "member-avatar";
            const cardClass = status ? `slide-card ahd-slide-card ${statusClass}` : "slide-card ahd-slide-card";
            return `
        <div class="${cardClass}" data-member-id="${escapeHtml(member.id)}" style="cursor:default">
          <img class="${avatarClass}" src="${member.src || "images/person1.jpg"}" alt="${escapeHtml(member.name || member.id)}" />
          <h3>${escapeHtml(member.name || member.id)}</h3>
        </div>
      `;
          })
          .join("")
      : `<div class="identity-empty ahd-public-empty">لا يوجد أعضاء في العهد بعد.</div>`;
  }

  if (canvasEl) {
    canvasEl.innerHTML = visibleCanvasMembers.length
      ? visibleCanvasMembers
          .map((member) => {
            const status = getMemberStatus(member.id);
            const avatarClass = status
              ? `member-canvas-ahd-avatar member-avatar ${memberStatusClass(status)}`
              : "member-canvas-ahd-avatar member-avatar";
            return `
        <div class="member-canvas-ahd-item" title="${escapeHtml(member.name || member.id)}" aria-label="${escapeHtml(member.name || member.id)}">
          <img class="${avatarClass}" src="${member.src || "images/person1.jpg"}" alt="${escapeHtml(member.name || member.id)}" />
        </div>
      `;
          })
          .join("") +
        (extraCanvasCount ? `<div class="member-canvas-ahd-more">+${formatArabicNumber(extraCanvasCount)}</div>` : "")
      : "";
  }

  if (FB_STATE.isAdmin) {
    renderAhdAdminLists(qs("#ahdAdminSearch")?.value || "", orphanIds);
  }
}

function renderAhdAdminLists(filterText = "", orphanIdsArg = null) {
  const notInEl = qs("#tribeNotInAhdList");
  const ahdEl = qs("#ahdManageList");
  const orphanWrap = qs("#ahdOrphanWrap");
  const orphanEl = qs("#ahdOrphanList");
  if (!notInEl || !ahdEl) return;

  const q = String(filterText || "").trim();
  const orphanIds = Array.isArray(orphanIdsArg) ? orphanIdsArg : getAhdResolvedState().orphanIds;

  const tribeList = Array.from(FB_STATE.tribe.entries()).map(([id, member]) => ({ id, ...member }));
  const notIn = tribeList
    .filter((member) => !FB_STATE.ahd.has(member.id))
    .filter((member) => (q ? String(member.name || "").includes(q) : true))
    .sort(compareMembersByStatusThenName);

  const inAhd = tribeList
    .filter((member) => FB_STATE.ahd.has(member.id))
    .sort(compareMembersByStatusThenName);

  notInEl.innerHTML = notIn.length
    ? notIn
        .map((member) => {
          const status = getMemberStatus(member.id);
          const avatarClass = status ? `identity-avatar member-avatar ${memberStatusClass(status)}` : "identity-avatar member-avatar";
          return `
        <button class="identity-item" type="button" data-add-ahd="${member.id}" aria-label="إضافة ${escapeHtml(member.name)}">
          <img class="${avatarClass}" src="${member.src}" alt="${escapeHtml(member.name)}" />
          <div class="identity-name">${escapeHtml(member.name)}</div>
        </button>
      `;
        })
        .join("")
    : `<div class="identity-empty">لا يوجد أعضاء متاحون للإضافة.</div>`;

  ahdEl.innerHTML = inAhd.length
    ? inAhd
        .map((member) => {
          const status = getMemberStatus(member.id);
          const avatarClass = status ? `identity-avatar member-avatar ${memberStatusClass(status)}` : "identity-avatar member-avatar";
          return `
        <button class="identity-item" type="button" data-remove-ahd="${member.id}" aria-label="حذف ${escapeHtml(member.name)}">
          <img class="${avatarClass}" src="${member.src}" alt="${escapeHtml(member.name)}" />
          <div class="identity-name">${escapeHtml(member.name)}</div>
        </button>
      `;
        })
        .join("")
    : `<div class="identity-empty">لا يوجد أعضاء في العهد.</div>`;

  if (orphanWrap && orphanEl) {
    orphanWrap.style.display = orphanIds.length ? "block" : "none";
    orphanEl.innerHTML = orphanIds.length
      ? orphanIds
          .map((id) => `
        <button class="identity-item" type="button" data-remove-ahd-orphan="${escapeHtml(id)}" aria-label="حذف ${escapeHtml(id)} من العهد">
          <img class="identity-avatar member-avatar" src="images/person1.jpg" alt="${escapeHtml(id)}" />
          <div class="identity-name">${escapeHtml(id)}</div>
        </button>
      `)
          .join("")
      : "";
  }

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

  orphanEl?.querySelectorAll("[data-remove-ahd-orphan]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-remove-ahd-orphan");
      const ok = confirm("هذا المعرّف غير موجود بين الأعضاء الظاهرين. هل تريد حذفه من قائمة العهد؟");
      if (!ok) return;
      await removeMemberFromAhd(id);
    });
  });
}

async function addMemberToAhd(memberId) {
  if (!FB_STATE.isAdmin) return;
  const id = String(memberId || "").trim();
  if (!id) return;
  if (!FB_STATE.tribe.has(id)) {
    if (typeof showIdentityToast === "function") {
      showIdentityToast("لا يمكن إضافة معرّف غير موجود في قائمة الأعضاء.");
    }
    return;
  }

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

  FB_STATE.unsubscribers.forEach((unsubscribe) => {
    try {
      unsubscribe();
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
