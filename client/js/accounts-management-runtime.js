(function () {
  // Mark runtime availability so lazy loader can resolve quickly on repeat calls.
  window.__accountsMgmtRuntimeReady = true;

  var accountMgmtState = {
    view: "accounts",
    q: "",
    page: 1,
    limit: 24,
    pagination: {
      page: 1,
      pages: 1,
      total: 0,
      hasNext: false,
      hasPrev: false,
    },
  };
  var accountMgmtControlsBound = false;

  function createCardBase() {
    var card = document.createElement("div");
    card.className =
      "rounded-2xl border border-gray-200 bg-white shadow-sm p-4 sm:p-5";
    return card;
  }

  function createInfoLine(label, value, breakAll) {
    var p = document.createElement("p");
    var spanLabel = document.createElement("span");
    spanLabel.className = "font-bold text-gray-600";
    spanLabel.textContent = label + ": ";

    var spanValue = document.createElement("span");
    spanValue.className = "text-gray-800" + (breakAll ? " break-all" : "");
    spanValue.textContent = value;

    p.appendChild(spanLabel);
    p.appendChild(spanValue);
    return p;
  }

  function createAccountCard(item) {
    var isGuest = item.type === "guest";
    var roleClass = isGuest
      ? "bg-gray-100 text-gray-700"
      : item.role === "admin"
        ? "bg-purple-100 text-purple-700"
        : "bg-blue-100 text-blue-700";
    var roleText = isGuest
      ? "ضيف"
      : item.role === "admin"
        ? "معلم"
        : "طالب";

    var card = createCardBase();

    var head = document.createElement("div");
    head.className = "flex items-start justify-between gap-3 mb-3";

    var title = document.createElement("h3");
    title.className =
      "font-black text-gray-800 text-base sm:text-lg leading-tight";
    title.textContent =
      item.fullName || (isGuest ? "ضيف (بدون حساب)" : "بدون اسم");

    var role = document.createElement("span");
    role.className = "text-xs font-bold px-3 py-1 rounded-full " + roleClass;
    role.textContent = roleText;

    head.appendChild(title);
    head.appendChild(role);
    card.appendChild(head);

    var body = document.createElement("div");
    body.className = "space-y-2 text-sm";
    body.appendChild(
      createInfoLine(
        "البريد",
        item.email || (isGuest ? "تسجيل تجريبي بدون حساب" : "لا يوجد"),
        true,
      ),
    );
    body.appendChild(createInfoLine("IP", item.ipAddress || "غير متاح", false));
    body.appendChild(
      createInfoLine("Device ID", item.deviceId || "غير متاح", true),
    );
    body.appendChild(
      createInfoLine("الجهاز", item.deviceName || "غير معروف", false),
    );
    body.appendChild(
      createInfoLine(
        "آخر ظهور",
        item.lastSeenAt
          ? new Date(item.lastSeenAt).toLocaleString("ar-EG")
          : "غير متاح",
        false,
      ),
    );
    card.appendChild(body);

    var actions = document.createElement("div");
    actions.className = "mt-4 flex flex-wrap gap-2";

    if (!(item.role === "admin" && !isGuest)) {
      var blockBtn = document.createElement("button");
      blockBtn.type = "button";
      blockBtn.className =
        "js-block-device px-3 py-2 text-xs font-bold rounded-xl bg-gray-900 text-white hover:bg-black transition";
      blockBtn.dataset.deviceId = String(item.deviceId || "");
      blockBtn.dataset.ipAddress = String(item.ipAddress || "");
      blockBtn.dataset.deviceName = String(item.deviceName || "");
      blockBtn.dataset.email = String(item.email || "");
      blockBtn.textContent = "حظر هذا الجهاز";
      actions.appendChild(blockBtn);
    }

    if (!isGuest && item.role !== "admin") {
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className =
        "js-delete-account px-3 py-2 text-xs font-bold rounded-xl bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition";
      delBtn.dataset.accountId = String(Number(item.id) || 0);
      delBtn.textContent = "حذف الحساب";
      actions.appendChild(delBtn);
    }

    if (isGuest) {
      var delVisitBtn = document.createElement("button");
      delVisitBtn.type = "button";
      delVisitBtn.className =
        "js-delete-visit px-3 py-2 text-xs font-bold rounded-xl bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition";
      delVisitBtn.dataset.visitId = String(Number(item.id) || 0);
      delVisitBtn.textContent = "حذف الزيارة";
      actions.appendChild(delVisitBtn);
    }

    card.appendChild(actions);
    return card;
  }

  function createBlockedCard(item) {
    var card = createCardBase();

    var title = document.createElement("h3");
    title.className =
      "font-black text-gray-800 text-base sm:text-lg leading-tight mb-3";
    title.textContent = "سجل حظر #" + String(item.id || "-");
    card.appendChild(title);

    var body = document.createElement("div");
    body.className = "space-y-2 text-sm";
    body.appendChild(createInfoLine("البريد", item.email || "غير متاح", true));
    body.appendChild(createInfoLine("IP", item.ipAddress || "غير متاح", false));
    body.appendChild(
      createInfoLine("Device ID", item.deviceId || "غير متاح", true),
    );
    body.appendChild(
      createInfoLine("الجهاز", item.deviceName || "غير معروف", false),
    );
    body.appendChild(createInfoLine("السبب", item.reason || "غير محدد", true));
    body.appendChild(createInfoLine("تم بواسطة", item.blockedBy || "admin", true));
    body.appendChild(
      createInfoLine(
        "التاريخ",
        item.createdAt
          ? new Date(item.createdAt).toLocaleString("ar-EG")
          : "غير متاح",
        false,
      ),
    );
    card.appendChild(body);

    var actions = document.createElement("div");
    actions.className = "mt-4 flex flex-wrap gap-2";
    var unblockBtn = document.createElement("button");
    unblockBtn.type = "button";
    unblockBtn.className =
      "js-unblock-device px-3 py-2 text-xs font-bold rounded-xl bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition";
    unblockBtn.dataset.blockId = String(Number(item.id) || 0);
    unblockBtn.textContent = "فك الحظر";
    actions.appendChild(unblockBtn);
    card.appendChild(actions);

    return card;
  }

  function renderList(items, mode) {
    var list = document.getElementById("accounts-management-list");
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);

    if (!Array.isArray(items) || items.length === 0) {
      var empty = document.createElement("div");
      empty.className = "col-span-full text-center text-gray-500 py-16";
      var icon = document.createElement("i");
      icon.className = "fas fa-folder-open text-4xl mb-3";
      var text = document.createElement("p");
      text.className = "font-medium";
      text.textContent =
        mode === "blocked"
          ? "لا توجد سجلات حظر مطابقة."
          : "لا توجد حسابات أو جلسات مسجلة بعد.";
      empty.appendChild(icon);
      empty.appendChild(text);
      list.appendChild(empty);
      return;
    }

    for (var i = 0; i < items.length; i += 1) {
      list.appendChild(
        mode === "blocked" ? createBlockedCard(items[i]) : createAccountCard(items[i]),
      );
    }
  }

  function renderLoading(label) {
    var list = document.getElementById("accounts-management-list");
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);

    var wrap = document.createElement("div");
    wrap.className = "col-span-full text-center text-gray-500 py-16";
    var icon = document.createElement("i");
    icon.className = "fas fa-spinner fa-spin text-3xl mb-3";
    var text = document.createElement("p");
    text.className = "font-medium";
    text.textContent = label;
    wrap.appendChild(icon);
    wrap.appendChild(text);
    list.appendChild(wrap);
  }

  function renderError(message) {
    var list = document.getElementById("accounts-management-list");
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);

    var wrap = document.createElement("div");
    wrap.className = "col-span-full text-center text-red-500 py-16";
    var icon = document.createElement("i");
    icon.className = "fas fa-exclamation-triangle text-3xl mb-3";
    var text = document.createElement("p");
    text.className = "font-bold";
    text.textContent = message || "حدث خطأ";
    wrap.appendChild(icon);
    wrap.appendChild(text);
    list.appendChild(wrap);
  }

  function updatePaginationUi() {
    var pg = accountMgmtState.pagination || {
      page: 1,
      pages: 1,
      total: 0,
      hasNext: false,
      hasPrev: false,
    };
    var meta = document.getElementById("accounts-management-pagination-meta");
    var prev = document.getElementById("accounts-management-prev");
    var next = document.getElementById("accounts-management-next");
    if (meta)
      meta.textContent =
        "إجمالي " +
        String(pg.total || 0) +
        " - صفحة " +
        String(pg.page || 1) +
        " من " +
        String(pg.pages || 1);
    if (prev) prev.disabled = !pg.hasPrev;
    if (next) next.disabled = !pg.hasNext;
  }

  function updateTabsUi() {
    var accountsTab = document.getElementById("accounts-tab-btn");
    var blockedTab = document.getElementById("blocked-tab-btn");
    var isAccounts = accountMgmtState.view === "accounts";

    if (accountsTab) {
      accountsTab.className =
        "px-3 py-2 text-xs font-bold rounded-xl " +
        (isAccounts
          ? "bg-indigo-600 text-white"
          : "bg-gray-100 text-gray-700");
    }
    if (blockedTab) {
      blockedTab.className =
        "px-3 py-2 text-xs font-bold rounded-xl " +
        (!isAccounts
          ? "bg-indigo-600 text-white"
          : "bg-gray-100 text-gray-700");
    }
  }

  function getCsrfToken() {
    try {
      return (
        document.cookie
          .split(";")
          .map(function (c) {
            return c.trim();
          })
          .find(function (c) {
            return c.indexOf("csrf_token=") === 0;
          })
          ?.split("=")[1] || ""
      );
    } catch (e) {
      return "";
    }
  }

  function getClientDeviceId() {
    try {
      var key = "client-device-id";
      var id = localStorage.getItem(key);
      if (id && id.length >= 12) return id;
      id =
        "dev-" +
        (crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2, 10));
      localStorage.setItem(key, id);
      return id;
    } catch (e) {
      return "dev-fallback-" + Math.random().toString(36).slice(2, 10);
    }
  }

  async function adminJsonRequest(method, url, bodyObj) {
    var headers = {
      "Content-Type": "application/json",
      "X-Device-Id": getClientDeviceId(),
    };
    var csrf = getCsrfToken();
    if (csrf) headers["X-CSRF-Token"] = csrf;

    var res = await fetch(url, {
      method: method,
      credentials: "include",
      headers: headers,
      body: bodyObj ? JSON.stringify(bodyObj) : undefined,
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error(data && data.error ? data.error : "فشل العملية");
    return data;
  }

  window.deleteAccountById = async function (accountId) {
    if (!confirm("هل أنت متأكد من حذف هذا الحساب نهائيًا؟")) return;
    try {
      await adminJsonRequest("DELETE", "/api/auth/accounts/" + accountId);
      await loadCurrentAccountsManagementView();
    } catch (err) {
      alert("تعذر حذف الحساب: " + (err.message || "خطأ غير متوقع"));
    }
  };

  window.blockDeviceFromEntry = async function (
    deviceId,
    ipAddress,
    deviceName,
    email,
  ) {
    var reason = prompt("سبب الحظر (اختياري):", "مخالفة سياسات المنصة");
    if (reason === null) return;
    try {
      await adminJsonRequest("POST", "/api/auth/blocked-devices", {
        email: (email || "").trim().toLowerCase(),
        deviceId: (deviceId || "").trim(),
        ipAddress: (ipAddress || "").trim(),
        deviceName: (deviceName || "").trim(),
        reason: (reason || "").trim(),
      });
      alert("تم حظر الجهاز بنجاح.");
      await loadCurrentAccountsManagementView();
    } catch (err) {
      alert("تعذر حظر الجهاز: " + (err.message || "خطأ غير متوقع"));
    }
  };

  window.unblockDeviceById = async function (blockId) {
    if (!confirm("هل تريد فك الحظر عن هذا السجل؟")) return;
    try {
      await adminJsonRequest("DELETE", "/api/auth/blocked-devices/" + blockId);
      await loadCurrentAccountsManagementView();
    } catch (err) {
      alert("تعذر فك الحظر: " + (err.message || "خطأ غير متوقع"));
    }
  };

  window.deleteVisitById = async function (visitId) {
    if (!confirm("هل تريد حذف هذه الزيارة؟")) return;
    try {
      await adminJsonRequest("DELETE", "/api/auth/account-sessions/" + visitId);
      await loadCurrentAccountsManagementView();
    } catch (err) {
      alert("تعذر حذف الزيارة: " + (err.message || "خطأ غير متوقع"));
    }
  };

  async function loadAccountsView() {
    var query = new URLSearchParams({
      page: String(accountMgmtState.page),
      limit: String(accountMgmtState.limit),
      type: "all",
    });
    if (accountMgmtState.q) query.set("q", accountMgmtState.q);

    renderLoading("جاري تحميل الحسابات...");
    var res = await fetch("/api/auth/accounts-overview?" + query.toString(), {
      credentials: "include",
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok)
      throw new Error(data && data.error ? data.error : "فشل تحميل البيانات");

    accountMgmtState.pagination = data.pagination || {
      page: 1,
      pages: 1,
      total: 0,
      hasNext: false,
      hasPrev: false,
    };
    updatePaginationUi();
    renderList(Array.isArray(data.items) ? data.items : [], "accounts");
  }

  async function loadBlockedView() {
    var query = new URLSearchParams({
      page: String(accountMgmtState.page),
      limit: String(accountMgmtState.limit),
    });
    if (accountMgmtState.q) query.set("q", accountMgmtState.q);

    renderLoading("جاري تحميل سجلات الحظر...");
    var res = await fetch("/api/auth/blocked-devices?" + query.toString(), {
      credentials: "include",
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok)
      throw new Error(data && data.error ? data.error : "فشل تحميل البيانات");

    accountMgmtState.pagination = data.pagination || {
      page: 1,
      pages: 1,
      total: 0,
      hasNext: false,
      hasPrev: false,
    };
    updatePaginationUi();
    renderList(Array.isArray(data.devices) ? data.devices : [], "blocked");
  }

  async function loadCurrentAccountsManagementView() {
    updateTabsUi();
    try {
      if (accountMgmtState.view === "blocked") {
        await loadBlockedView();
      } else {
        await loadAccountsView();
      }
    } catch (err) {
      renderError(err && err.message ? err.message : "حدث خطأ");
    }
  }

  function bindAccountsControls() {
    if (accountMgmtControlsBound) return;
    accountMgmtControlsBound = true;

    var accountsTab = document.getElementById("accounts-tab-btn");
    var blockedTab = document.getElementById("blocked-tab-btn");
    var searchInput = document.getElementById("accounts-management-search");
    var searchBtn = document.getElementById("accounts-management-search-btn");
    var prevBtn = document.getElementById("accounts-management-prev");
    var nextBtn = document.getElementById("accounts-management-next");

    if (accountsTab) {
      accountsTab.addEventListener("click", function () {
        accountMgmtState.view = "accounts";
        accountMgmtState.page = 1;
        loadCurrentAccountsManagementView();
      });
    }

    if (blockedTab) {
      blockedTab.addEventListener("click", function () {
        accountMgmtState.view = "blocked";
        accountMgmtState.page = 1;
        loadCurrentAccountsManagementView();
      });
    }

    var runSearch = function () {
      accountMgmtState.q = (
        searchInput && searchInput.value ? String(searchInput.value) : ""
      ).trim();
      accountMgmtState.page = 1;
      loadCurrentAccountsManagementView();
    };

    if (searchBtn) searchBtn.addEventListener("click", runSearch);
    if (searchInput) {
      searchInput.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") runSearch();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (!accountMgmtState.pagination || !accountMgmtState.pagination.hasPrev)
          return;
        accountMgmtState.page = Math.max(1, accountMgmtState.page - 1);
        loadCurrentAccountsManagementView();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        if (!accountMgmtState.pagination || !accountMgmtState.pagination.hasNext)
          return;
        accountMgmtState.page += 1;
        loadCurrentAccountsManagementView();
      });
    }
  }

  document.addEventListener("click", function (evt) {
    var delBtn =
      evt.target && evt.target.closest
        ? evt.target.closest(".js-delete-account")
        : null;
    if (delBtn) {
      var accountId = Number(delBtn.getAttribute("data-account-id") || 0);
      if (accountId > 0) {
        window.deleteAccountById(accountId);
      }
      return;
    }

    var blockBtn =
      evt.target && evt.target.closest
        ? evt.target.closest(".js-block-device")
        : null;
    if (blockBtn) {
      window.blockDeviceFromEntry(
        blockBtn.getAttribute("data-device-id") || "",
        blockBtn.getAttribute("data-ip-address") || "",
        blockBtn.getAttribute("data-device-name") || "",
        blockBtn.getAttribute("data-email") || "",
      );
      return;
    }

    var delVisitBtn =
      evt.target && evt.target.closest
        ? evt.target.closest(".js-delete-visit")
        : null;
    if (delVisitBtn) {
      var visitId = Number(delVisitBtn.getAttribute("data-visit-id") || 0);
      if (visitId > 0) window.deleteVisitById(visitId);
      return;
    }

    var unblockBtn =
      evt.target && evt.target.closest
        ? evt.target.closest(".js-unblock-device")
        : null;
    if (unblockBtn) {
      var blockId = Number(unblockBtn.getAttribute("data-block-id") || 0);
      if (blockId > 0) window.unblockDeviceById(blockId);
    }
  });

  window.openAccountsManagementModal = async function () {
    var modal = document.getElementById("accounts-management-modal");
    var dock = document.getElementById("ios-bottom-nav");
    if (!modal) return;

    if (typeof window.closeAdminSheet === "function") {
      window.closeAdminSheet();
    }

    document.body.classList.add("accounts-management-open");
    if (dock) dock.classList.add("hidden");
    if (typeof window._showThemeToggle === "function")
      window._showThemeToggle(false);

    // Wait for admin bottom sheet close animation to finish before showing modal.
    await new Promise(function (resolve) {
      setTimeout(resolve, 360);
    });

    modal.classList.remove("hidden");
    if (typeof window._syncMainInteractionState === "function")
      window._syncMainInteractionState();

    bindAccountsControls();
    accountMgmtState.view = "accounts";
    accountMgmtState.page = 1;
    accountMgmtState.q = "";

    var searchInput = document.getElementById("accounts-management-search");
    if (searchInput) searchInput.value = "";

    await loadCurrentAccountsManagementView();
  };

  window.closeAccountsManagementModal = function () {
    var modal = document.getElementById("accounts-management-modal");
    var dock = document.getElementById("ios-bottom-nav");
    if (modal) modal.classList.add("hidden");
    document.body.classList.remove("accounts-management-open");
    if (dock) dock.classList.remove("hidden");
    if (typeof window._showThemeToggle === "function")
      window._showThemeToggle(true);
    if (typeof window._syncMainInteractionState === "function")
      window._syncMainInteractionState();
  };
})();
