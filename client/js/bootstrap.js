import logger from './utils/logger.js?v=2';
// Lightweight bootstrap: set minimal fallbacks and lazily load the full app when needed.
// Goal: avoid sending the large bundled app to anonymous users and defer heavy modules.
(function () {
  // Capture deep-link quiz id early so it survives OAuth redirect.
  try {
    const params = new URLSearchParams(window.location.search || "");
    const quizId = params.get("quiz");
    if (quizId) {
      sessionStorage.setItem("pending-quiz-id", String(quizId));
      params.delete("quiz");
      const next = params.toString();
      const cleanUrl = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash || ""}`;
      history.replaceState({}, document.title, cleanUrl);
    }
  } catch (e) {
    /* ignore */
  }
  // queue for calls made before the real app loads
  // Keep any calls queued by inline fallbacks before bootstrap executes.
  window.__lazyCalls = window.__lazyCalls || [];
  window.__appLoading = false;
  window.sourceLeaderboard = window.sourceLeaderboard || [];

  function splitInlineArgs(argsText) {
    const out = [];
    let current = "";
    let quote = null;

    for (let i = 0; i < argsText.length; i += 1) {
      const ch = argsText[i];
      if ((ch === '"' || ch === "'") && argsText[i - 1] !== "\\") {
        if (!quote) quote = ch;
        else if (quote === ch) quote = null;
        current += ch;
        continue;
      }

      if (ch === "," && !quote) {
        out.push(current.trim());
        current = "";
        continue;
      }

      current += ch;
    }

    const last = current.trim();
    if (last) out.push(last);
    return out;
  }

  function decodeInlineArg(token, element, event) {
    const t = String(token || "").trim();
    if (t === "this") return element;
    if (t === "event") return event;
    if (t === "true") return true;
    if (t === "false") return false;
    if (t === "null") return null;
    if (t === "undefined") return undefined;
    if (/^-?\d+(?:\.\d+)?$/.test(t)) return Number(t);

    if (
      (t.startsWith("'") && t.endsWith("'")) ||
      (t.startsWith('"') && t.endsWith('"'))
    ) {
      return t.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
    }

    return t;
  }

  // safe error handlers (small)
  window.addEventListener("error", (e) => {
    logger.error("❌ خطأ غير متوقع (boot):", e.message, e.filename, e.lineno);
  });
  window.addEventListener("unhandledrejection", (e) => {
    logger.error("❌ Promise مرفوض (boot):", e.reason);
    e.preventDefault();
  });

  // list of common global functions that HTML may call via inline onclick.
  const lazyNames = [
    "toggleTheme",
    "navToHome",
    "navToSection",
    "openAdminAuthOrPanel",
    "closeStudentMenu",
    "openBottomSheet",
    "closeBottomSheet",
    "closeAdminSheet",
    "closeAllOverlays",
    "startGoogleRedirectLogin",
    "closeAdminAuth",
    "logoutUser",
    "handleStudentGoogleLogin",
    "loadApp",
    "playQuiz",
    "selectAnswer",
    "goToNextQuestion",
    "goToPreviousQuestion",
    "submitQuiz",
    "exitToMain",
    "openCreateSection",
    "closeCreateSection",
    "goToBuilderStep2",
    "renderBuilderQuestion",
    "updateBuilderData",
    "updateBuilderOptionText",
    "setBuilderCorrectOption",
    "addBuilderOption",
    "removeBuilderOption",
    "addBuilderQuestion",
    "navBuilderQuestion",
    "saveBuiltQuiz",
    "loadQuizIntoBuilder",
    "updateExistingQuiz",
    "triggerImportExamFile",
    "reshuffleImportedAnswers",
    "handleImportFileChange",
    "setSubjectFilter",
    "setEditSubjectFilter",
    "renderSubjectFilters",
    "renameSubject",
    "closeRenameModal",
    "executeRenameSubject",
    "confirmDeleteSubject",
    "closeDeleteModal",
    "executeDeleteSubject",
    "openAddNoteModal",
    "closeAddNoteModal",
    "saveNote",
    "loadNoteIntoBuilder",
    "updateExistingNote",
    "forceDownload",
    "openGradesModal",
    "closeGradesModal",
    "openStatsModal",
    "closeStatsModal",
    "openEditSelectionModal",
    "closeEditSelectionModal",
    "switchEditTab",
    "renderDashboard",
    "deleteQuiz",
    "escapeHtml",
    "showAlert",
    "showConfirm",
    "showLoading",
    "getQuickDeviceTier",
    "scrollToTop",
    "scrollToElement",
    "playEntranceAnimation",
    "playExitAnimation",
    "animateElement",
    "pauseAllAnimations",
    "resumeAllAnimations",
    "showGuestModal",
    "closeGuestModal",
    "agreeGuestLogin",
    "startGuestLogin",
  ];

  const INLINE_BRIDGE_ALLOWED_FUNCTIONS = new Set(lazyNames);

  function invokeInlineCode(code, element, event) {
    const statements = String(code || "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    let lastResult;
    for (const stmt of statements) {
      const callMatch = stmt.match(/^([A-Za-z_$][\w$]*)\s*\((.*)\)$/);
      const bareCallMatch = stmt.match(/^([A-Za-z_$][\w$]*)$/);
      const fnName = callMatch
        ? callMatch[1]
        : bareCallMatch
          ? bareCallMatch[1]
          : "";

      if (!fnName || !INLINE_BRIDGE_ALLOWED_FUNCTIONS.has(fnName)) continue;

      const fn = window[fnName];
      if (typeof fn !== "function") continue;

      const rawArgs = callMatch ? splitInlineArgs(callMatch[2]) : [];
      const args = rawArgs.map((arg) => decodeInlineArg(arg, element, event));
      lastResult = fn(...args);
    }

    return lastResult;
  }

  function installInlineHandlerBridge() {
    if (window.__inlineBridgeInstalled) return;

    const migrate = () => {
      const attrs = ["onclick", "onchange", "onsubmit", "oninput", "onblur"];
      attrs.forEach((attr) => {
        document.querySelectorAll(`[${attr}]`).forEach((el) => {
          const val = el.getAttribute(attr);
          if (!val) return;
          el.setAttribute(`data-inline-${attr}`, val);
          el.removeAttribute(attr);
        });
      });
    };

    const handleAttr = (event, domEventName) => {
      const attrName = `data-inline-on${domEventName}`;
      const inlineAttrName = `on${domEventName}`;
      const selector = `[${attrName}], [${inlineAttrName}]`;
      const target = event.target?.closest?.(selector);
      if (!target) return;

      let code = target.getAttribute(attrName);
      if (!code) {
        code = target.getAttribute(inlineAttrName);
        if (code) {
          target.setAttribute(attrName, code);
          target.removeAttribute(inlineAttrName);
        }
      }

      const result = invokeInlineCode(code, target, event);
      if (result === false) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    migrate();
    document.addEventListener("click", (e) => handleAttr(e, "click"), true);
    document.addEventListener("change", (e) => handleAttr(e, "change"), true);
    document.addEventListener("input", (e) => handleAttr(e, "input"), true);
    document.addEventListener("submit", (e) => handleAttr(e, "submit"), true);
    document.addEventListener("blur", (e) => handleAttr(e, "blur"), true);
    window.__inlineBridgeInstalled = true;
  }

  installInlineHandlerBridge();

  function triggerAppLoad() {
    if (window.__appLoadTriggered) return;
    window.__appLoadTriggered = true;
    window.__appLoading = true;
    // FA CSS and font preloads are now injected in HTML <head> as non-blocking preloads.
    // No need to inject them here — avoids double-loading and keeps bootstrap.js light.

    function flushQueue() {
      window.__appLoading = false;
      const queuedCalls = (window.__lazyCalls || []).splice(0);
      for (const call of queuedCalls) {
        try {
          const fn = window[call.name];
          if (typeof fn === "function" && !fn.__isBootstrapStub) {
            fn.apply(null, call.args || []);
          } else {
            // Keep calls queued until the real implementation is attached.
            window.__lazyCalls.push(call);
          }
        } catch (e) {
          logger.error("Error invoking queued call", call.name, e);
        }
      }
      try {
        if (typeof wrapRegisteredFunctions === "function")
          wrapRegisteredFunctions();
      } catch (e) {}
    }

    // Primary: minified IIFE bundle (one request, all modules pre-bundled).
    // Injected as a classic <script> so the IIFE executes and auto-initializes the app.
    // Falls back to dynamic import() of ESM app.js if the bundle is unavailable.
    const bundleUrl = "/js/app.bundle.min.js?v=95";
    const esmUrl = "/js/app.js";

    const bundleScript = document.createElement("script");
    bundleScript.src = bundleUrl;
    bundleScript.async = true;
    bundleScript.onload = function () {
      // Bundle is a self-executing IIFE — app already initialized on script load.
      // Call window.startApp() only if the bundle explicitly exposes it.
      const startPromise =
        typeof window.startApp === "function"
          ? Promise.resolve(window.startApp())
          : Promise.resolve();
      startPromise
        .catch(() => {})
        .finally(() => {
          hideLoadingScreen();
          flushQueue();
        });
    };
    bundleScript.onerror = function (err) {
      logger.warn(
        "[bootstrap] bundle failed, falling back to ESM app.js:",
        err,
      );
      import(esmUrl)
        .then((mod) => {
          const startPromise =
            mod && typeof mod.startApp === "function"
              ? Promise.resolve(mod.startApp())
              : Promise.resolve();
          startPromise
            .catch((e) => logger.error("startApp failed", e))
            .finally(() => {
              hideLoadingScreen();
              flushQueue();
            });
        })
        .catch((e) => {
          logger.error("[bootstrap] Both bundle and ESM fallback failed:", e);
          window.__appLoading = false;
          hideLoadingScreen();
        });
    };
    document.head.appendChild(bundleScript);

    // Wrap real functions once the app has attached them so we log invocations/errors
    function wrapRegisteredFunctions() {
      try {
        lazyNames.forEach((name) => {
          try {
            const fn = window[name];
            if (typeof fn === "function" && !fn.__wrapped_by_bootstrap) {
              const original = fn;
              const wrapped = function (...a) {
                try {
                  const res = original.apply(this, a);
                  return res;
                } catch (err) {
                  logger.error("[LAZY_CALL_ERROR]", name, err);
                  throw err;
                }
              };
              wrapped.__wrapped_by_bootstrap = true;
              window[name] = wrapped;
            }
          } catch (e) {
            /* ignore per-function errors */
          }
        });
      } catch (e) {}
    }
  }

  function hideLoginScreen() {
    const login = document.getElementById("login-screen");
    if (login) login.classList.add("hidden");
  }

  const MIN_LOADING_MS = 6000;

  function showLoadingScreen() {
    const loading = document.getElementById("loading-screen");
    if (loading) loading.classList.add("show");
    document.body.classList.add("loading-active");
    window.__loadingStartTs = Date.now();
  }

  function hideLoadingScreen() {
    const loading = document.getElementById("loading-screen");
    const startedAt = window.__loadingStartTs || 0;
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
    const finalize = () => {
      if (loading) loading.classList.remove("show");
      document.body.classList.remove("loading-active");
      window.__loadingStartTs = 0;
    };
    if (remaining > 0) {
      setTimeout(finalize, remaining);
    } else {
      finalize();
    }
  }

  window.hideLoadingScreen = hideLoadingScreen;

  // Expose loader so inline fallbacks can force app load when needed.
  window.__triggerAppLoad = triggerAppLoad;

  // create stub functions that queue the call and trigger app load
  lazyNames.forEach((name) => {
    if (window[name]) return;
    const stub = function (...args) {
      window.__lazyCalls.push({ name, args });
      // start loading app on first user interaction
      triggerAppLoad();
    };
    stub.__isBootstrapStub = true;
    window[name] = stub;
  });

  // If we are returning from Google OAuth (id_token or error in hash),
  // eagerly load the app to process the redirect without requiring another click.
  // CRITICAL: MUST BE CHECKED BEFORE ANY SESSION STORAGE LOCAL CHECKS!
  const hash = window.location.hash || "";
  if (hash.includes("id_token=") || hash.includes("error=")) {
    hideLoginScreen();
    showLoadingScreen();
    triggerAppLoad();
    return;
  }

  // If sessionStorage claims a user exists, validate cookie session first.
  // This prevents stale local state from briefly showing dashboard/UI before login.
  try {
    const saved = sessionStorage.getItem("currentUser");
    if (saved) {
      hideLoginScreen();
      showLoadingScreen();
      fetch("/api/auth/me", {
        credentials: "include",
      })
        .then((res) => {
          if (res.ok) {
            triggerAppLoad();
            return;
          }
          sessionStorage.removeItem("currentUser");
          sessionStorage.removeItem("isAdmin");
          hideLoadingScreen();
          if (typeof window.showLoginScreenWithDesktop === "function") {
            window.showLoginScreenWithDesktop();
          }
        })
        .catch(() => {
          sessionStorage.removeItem("currentUser");
          sessionStorage.removeItem("isAdmin");
          hideLoadingScreen();
          if (typeof window.showLoginScreenWithDesktop === "function") {
            window.showLoginScreenWithDesktop();
          }
        });
      return;
    }
  } catch (e) {
    /* ignore */
  }

  // No eager app boot for anonymous visits.
  // The app loads on first interaction via lazy stubs.
})();
