import logger from './utils/logger.js';
if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production') {
  logger.log = () => {};
  logger.warn = () => {};
}
/**
 * منصة الاختبارات التفاعلية — app.js (Entry Point)
 * بسم الله الرحمن الرحيم
 * لا تنسَ أن تذكر الله دائمًا، فـ 'ألا بذكر الله تطمئن القلوب'.
 *
 * @description نقطة الدخول الرئيسية — يجمع كل الوحدات ويربطها بالـ DOM والـ window
 */
"use strict";
import { setupFocusManagement } from "./utils/focusManager.js";

// ✅ === Datadog RUM Monitoring (non-blocking) ===
function initDatadogRumDeferred() {
  const isDatadogEnabledByConfig =
    window.__PUBLIC_CONFIG?.datadogRumEnabled === true;
  const datadogClientToken =
    String(window.__PUBLIC_CONFIG?.datadogClientToken || "").trim();
  const isLocalRuntime = ["localhost", "127.0.0.1", "::1"].includes(
    window.location.hostname,
  );
  const hasTrackingOptOut =
    navigator.globalPrivacyControl === true ||
    navigator.doNotTrack === "1" ||
    window.doNotTrack === "1";

  if (
    !isDatadogEnabledByConfig ||
    isLocalRuntime ||
    !datadogClientToken ||
    hasTrackingOptOut
  ) {
    logger.log("[Datadog RUM] disabled by config/runtime");
    return;
  }

  const startRum = () => {
    const script = document.createElement("script");
    script.src =
      "https://www.datadoghq-browser-agent.com/us5/v6/datadog-rum.js";
    script.async = true;

    script.onload = () => {
      try {
        const ddRum = window.DD_RUM;
        if (!ddRum || typeof ddRum.init !== "function") {
          logger.warn("[Datadog RUM] agent loaded but DD_RUM is unavailable");
          return;
        }

        ddRum.init({
          applicationId: "6448291b-03d3-42ba-b7c2-601d82b6dc22",
          clientToken: datadogClientToken,
          site: "us5.datadoghq.com",
          service: "quiz-platform",
          env: "production",
          version: "1.0.0",
          sessionSampleRate: 100,
          sessionReplaySampleRate: 20,
          trackResources: true,
          trackUserInteractions: true,
          trackLongTasks: true,
          defaultPrivacyLevel: "mask-user-input",
        });
        ddRum.startSessionReplayRecording();
        logger.log("[Datadog RUM] initialized and recording sessions");
      } catch (e) {
        logger.warn("[Datadog RUM] init skipped:", e?.message || e);
      }
    };

    script.onerror = () => {
      logger.warn("[Datadog RUM] agent script blocked/unavailable");
    };

    document.head.appendChild(script);
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(
      () => {
        startRum();
      },
      { timeout: 3000 },
    );
  } else {
    setTimeout(() => {
      startRum();
    }, 1500);
  }
}

initDatadogRumDeferred();

// === الوحدات (Modules) ===
import state from "./modules/state.js";
import {
  addManagedListener,
  cleanupListeners,
  sanitizeHTML,
  showAlert,
  showConfirm,
  showLoading,
  formatTime,
  showToastMessage,
  pickRandom,
  shuffleArray,
  logFunctionStatus,
  getQuickDeviceTier,
} from "./modules/helpers.js";
import {
  apiCall,
  loadDataFromServer,
  fetchLeaderboardFromServer,
  fetchScoresFromServer,
} from "./modules/api.js";
import {
  _syncMainInteractionState,
  updateDockUI,
  openBottomSheet,
  closeBottomSheet,
  closeAdminSheet,
  closeAllOverlays,
  navToHome,
  navToSection as _navToSection,
  openAdminAuthOrPanel,
  showLoginScreenWithDesktop,
  closeStudentMenu,
  showLoginScreen,
  toggleTreeNode,
  initOverlayScrollLock,
} from "./modules/navigation.js";
import {
  startGoogleRedirectLogin,
  handleGoogleRedirectToken,
  initGoogleSignIn,
  handleGoogleAdminResponse,
  handleStudentGoogleLogin as _handleStudentGoogleLogin,
  closeAdminAuth,
  showAdminToast,
  logoutUser,
  startTokenRefresh,
} from "./modules/auth.js";
// quiz.js, tree.js, notes.js — loaded lazily via app.features.bundle.min.js on first feature interaction
// grades.js — loaded lazily via app.admin.bundle.min.js on first admin interaction
import {
  renderDashboard as _renderDashboard,
  deleteQuiz as _deleteQuiz,
} from "./modules/dashboard.js";

// === وحدات الحركة والتمرير ===
import {
  initAnimations,
  playEntranceAnimation,
  playExitAnimation,
  animateElement,
  pauseAllAnimations,
  resumeAllAnimations,
  setAnimationSpeed,
  setReducedMotion,
} from "./modules/animation.js";
import {
  initScroll,
  scrollToTop,
  scrollToElement,
  enableSmoothScroll,
  disableSmoothScroll,
  onScrollEnter,
  offScrollEnter,
  setScrollTierOptions,
} from "./modules/scroll.js";

// === أداة أداء الجهاز ===
import { getDevicePerformanceTier } from "./modules/helpers.js";

// === CSP Nonce + Inline Handler Bridge ===
function patchDynamicScriptNonce() {
  if (window.__cspNoncePatched) return;
  const nonce =
    document.querySelector('meta[name="csp-nonce"]')?.getAttribute("content") ||
    "";
  if (!nonce) return;

  const originalCreateElement = document.createElement.bind(document);
  document.createElement = function patchedCreateElement(tagName, options) {
    const el = originalCreateElement(tagName, options);
    if (
      String(tagName).toLowerCase() === "script" &&
      !el.getAttribute("nonce")
    ) {
      el.setAttribute("nonce", nonce);
    }
    return el;
  };

  window.__cspNoncePatched = true;
}

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
  const t = token.trim();
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

const INLINE_BRIDGE_ALLOWED_FUNCTIONS = new Set([
  "addBuilderOption",
  "addBuilderQuestion",
  "agreeGuestLogin",
  "closeAccountsManagementModal",
  "closeAddNoteModal",
  "closeAdminAuth",
  "closeAdminSheet",
  "closeBottomSheet",
  "closeCreateSection",
  "closeDeleteExamModal",
  "closeDeleteModal",
  "closeEditSelectionModal",
  "closeGuestModal",
  "closeGradesModal",
  "closeRenameModal",
  "closeStatsModal",
  "closeStudentMenu",
  "confirmDeleteExamOrNote",
  "executeDeleteSubject",
  "executeRenameSubject",
  "exitToMain",
  "goToBuilderStep2",
  "goToNextQuestion",
  "goToPreviousQuestion",
  "handleImportFileChange",
  "logoutUser",
  "navBuilderQuestion",
  "navToHome",
  "navToSection",
  "openAccountsManagementModal",
  "openAddNoteModal",
  "openAdminAuthOrPanel",
  "openCreateSection",
  "openEditSelectionModal",
  "openGradesModal",
  "openStatsModal",
  "reshuffleImportedAnswers",
  "reviewQuiz",
  "saveBuiltQuiz",
  "saveNote",
  "showGuestModal",
  "startGoogleRedirectLogin",
  "submitQuiz",
  "switchEditTab",
  "triggerImportExamFile",
  "updateBuilderData",
]);

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
  // Use capture for click/submit so legacy inline handlers are migrated
  // before the browser attempts blocked inline execution under CSP.
  document.addEventListener("click", (e) => handleAttr(e, "click"), true);
  document.addEventListener("change", (e) => handleAttr(e, "change"));
  document.addEventListener("input", (e) => handleAttr(e, "input"));
  document.addEventListener("submit", (e) => handleAttr(e, "submit"), true);
  // focusout bubbles and covers legacy onblur handlers without capture listeners.
  document.addEventListener("focusout", (e) => handleAttr(e, "blur"));
  window.__inlineBridgeInstalled = true;
}

patchDynamicScriptNonce();
installInlineHandlerBridge();

// === Global Error Boundary ===
function showGlobalCrashFallback(message) {
  const existing = document.getElementById("global-crash-fallback");
  if (existing) return;

  const panel = document.createElement("div");
  panel.id = "global-crash-fallback";
  panel.setAttribute("role", "alert");
  panel.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:var(--z-overlay)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:16px",
    "background:rgba(15,23,42,0.86)",
    "backdrop-filter:blur(4px)",
  ].join(";");

  panel.innerHTML = `
        <div style="max-width:520px;width:100%;background:#fff;border-radius:16px;padding:20px;text-align:center;box-shadow:0 20px 45px rgba(0,0,0,.25);font-family:Cairo,system-ui,sans-serif;">
            <h2 style="margin:0 0 8px;color:#b91c1c;">حدث خطأ غير متوقع</h2>
            <p style="margin:0 0 16px;color:#334155;line-height:1.8;">${sanitizeHTML(message || "تعذر إكمال العملية. يمكنك إعادة تحميل الصفحة.")}</p>
            <button id="global-crash-reload" style="background:#1d4ed8;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer;">إعادة تحميل الصفحة</button>
        </div>
    `;

  document.body.appendChild(panel);
  const reloadBtn = document.getElementById("global-crash-reload");
  if (reloadBtn)
    reloadBtn.addEventListener("click", () => window.location.reload());
}

const handleGlobalError = (e) => {
  logger.error("❌ خطأ غير متوقع:", e.message, e.filename, e.lineno);
  showGlobalCrashFallback(e.message || "تعذر تشغيل التطبيق بشكل صحيح.");
};
window.addEventListener("error", handleGlobalError);

const handleGlobalRejection = (e) => {
  logger.error("❌ Promise مرفوض:", e.reason);
  const reason =
    typeof e.reason === "string"
      ? e.reason
      : e.reason?.message || "تعذر إكمال الطلب.";
  showGlobalCrashFallback(reason);
  e.preventDefault();
};
window.addEventListener("unhandledrejection", handleGlobalRejection);

// quick startup instrumentation check
try {
  logFunctionStatus(
    "app_init",
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
} catch (e) {
  /* ignore */
}

// === Service Worker Registration (PWA) ===
if ("serviceWorker" in navigator) {
  const SW_SCRIPT_URL = "/sw.js?v=145";
  const registerServiceWorker = () => {
    navigator.serviceWorker
      .register(SW_SCRIPT_URL)
      .then((reg) => {
        // لما يكون في تحديث جديد للـ SW، اعمل reload تلقائي
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "activated" &&
                navigator.serviceWorker.controller
              ) {
                logger.log("[SW] ✓ تحديث جديد — إعادة تحميل...");
                window.location.reload();
              }
            });
          }
        });
      })
      .catch((err) => logger.warn("⚠️ SW registration failed:", err));
  };
  
  if (document.readyState === "complete") {
    registerServiceWorker();
  } else {
    window.addEventListener("load", registerServiceWorker, { once: true });
  }

  // لو الـ controller اتغير (SW جديد استلم)، اعمل reload
  const handleControllerChange = () => window.location.reload();
  navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
}

// === Multi-tab Sync: Logout ===
const handleStorageLogout = (e) => {
  if (e.key === "logout_event") {
    state.currentUser = null;
    state.isAdmin = false;
    sessionStorage.removeItem("currentUser");
    sessionStorage.removeItem("isAdmin");
    showLoginScreenWithDesktop();
  }
};

// ─── تنظيف وضع الضيف فقط قبل أي reload/إغلاق للتبويب ───
// pagehide يُطلَق قبل أن تبدأ الصفحة الجديدة بالتحميل.
window.addEventListener("storage", handleStorageLogout);

// إبقاء sessionStorage للمستخدم العادي يسمح باستمرار الجلسة بعد تسجيل Google
// ويمنع الرجوع للوجين بسبب reload أو SW update.
const handlePageHide = () => {
  const isGuest =
    sessionStorage.getItem("guest-mode") === "true" ||
    localStorage.getItem("guest-mode") === "true";
  if (!isGuest) return;
  sessionStorage.removeItem("guest-mode");
  // مسح guest-mode من localStorage أيضاً حتى لا يبقى الوضع
  // معلقاً بعد الريفريش أو إغلاق التاب
  localStorage.removeItem("guest-mode");
  document.body.classList.remove("guest-mode");
};

// ============================================
//  ضبط إعدادات الحركة بناءً على أداء الجهاز
//  — يُستدعى مرة واحدة عند بدء التشغيل
// ============================================

/**
 * @description يقرأ مستوى أداء الجهاز ويضبط وحدتَي الحركة والتمرير وفقاً له.
 *
 * المستويات المتوقعة من getDevicePerformanceTier():
 *  - 'high'   → تجربة كاملة: حركات سلسة + تمرير ناعم + scroll-enter callbacks
 *  - 'medium' → حركات مخففة (سرعة مخفضة) + تمرير ناعم بدون scroll-enter
 *  - 'low'    → reduced-motion كامل + تعطيل التمرير الناعم توفيراً للموارد
 */
async function applyPerformanceBasedAnimationSettings(perf) {
  logFunctionStatus("applyPerformanceBasedAnimationSettings", true);
  if (!perf) perf = await getDevicePerformanceTier();
  const tier =
    perf && perf.tier ? perf.tier : typeof perf === "string" ? perf : "low";
  const gpu = perf?.gpu;
  const dpr = perf?.dpr || window.devicePixelRatio || 1;
  const bat = perf?.batteryLevel ?? -1;
  const webgl2 = gpu?.webgl2 ?? false;

  logger.log(
    `[app] 🖥️ أداء الجهاز — tier:${tier} / GPU:${gpu?.tier}(${gpu?.renderer || "?"}) ` +
      `/ DPR:${dpr.toFixed(1)} / WebGL2:${webgl2} / 🔋${bat === -1 ? "N/A" : Math.round(bat * 100) + "%"}`,
    perf,
  );

  // ── تطبيق CSS classes على body لتفعيل قواعد styles.css المشروطة ──────────
  document.body.classList.remove("gpu-high", "gpu-medium", "gpu-low");
  document.body.classList.add(`gpu-${gpu?.tier || tier}`);
  if (tier === "low") document.body.classList.add("reduced-graphics");

  // ── ضبط Lenis بناءً على tier والجهاز ──────────────────────────────────────
  const _isMobile =
    navigator.maxTouchPoints > 1 &&
    !!window.matchMedia?.("(hover: none)").matches;
  setScrollTierOptions(tier, _isMobile);

  switch (tier) {
    case "high":
      setReducedMotion(false);
      setAnimationSpeed(1.0);
      enableSmoothScroll();
      onScrollEnter();
      logger.log("[app] ✓ إعدادات الحركة: وضع الأداء العالي");
      break;

    case "medium":
      setReducedMotion(false);
      // DPR عالٍ على GPU متوسط = pixel fill pressure → سرعة أقل
      setAnimationSpeed(dpr > 2.5 ? 0.5 : 0.75);

      enableSmoothScroll();
      offScrollEnter();
      logger.log("[app] ✓ إعدادات الحركة: وضع الأداء المتوسط");
      break;

    case "low":
    default:
      setReducedMotion(true);
      setAnimationSpeed(0);
      disableSmoothScroll();
      offScrollEnter();
      logger.log(
        "[app] ✓ إعدادات الحركة: وضع الأداء المنخفض (reduced-motion)",
      );
      break;
  }
}

// ============================================
//  دوال الربط (Bound Functions)
//  — تربط الوحدات التي تحتاج بعضها بلا circular import
// ============================================

/** @private رسم لوحة القيادة مع ربط الدوال — يستخدم window.X للحزمة الكسولة */
function renderDashboard() {
  _renderDashboard(window.playQuiz, window.forceDownload);
}

/** @private حذف امتحان */
function deleteQuiz(index) {
  _deleteQuiz(index, renderDashboard);
}

/** @private نسخ رابط الامتحان */
function copyQuizLink(quizId, event) {
  if (event && typeof event.stopPropagation === "function")
    event.stopPropagation();
  try {
    const base = window.location.origin;
    const url = `${base}/?quiz=${encodeURIComponent(String(quizId))}`;
    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          showAlert("✅ تم نسخ رابط الامتحان.", "success");
        })
        .catch(() => {
          showAlert("⚠️ تعذر نسخ الرابط تلقائياً.", "warning");
        });
    } else {
      const temp = document.createElement("textarea");
      temp.value = url;
      temp.setAttribute("readonly", "");
      temp.style.position = "absolute";
      temp.style.left = "-9999px";
      document.body.appendChild(temp);
      temp.select();
      try {
        document.execCommand("copy");
      } catch (e) {
        /* ignore */
      }
      document.body.removeChild(temp);
      showAlert("✅ تم نسخ رابط الامتحان.", "success");
    }
  } catch (e) {
    showAlert("⚠️ تعذر نسخ رابط الامتحان.", "warning");
  }
}

/** @private الانتقال لقسم — يستخدم window.X للحزمة الكسولة */
function navToSection(section) {
  _navToSection(section, window.renderSubjectFilters, window.renderHistoryTree);
}

/** @private معالجة تسجيل دخول الطالب */
function handleStudentGoogleLogin(response) {
  _handleStudentGoogleLogin(
    response,
    window.renderSubjectFilters,
    window.renderHistoryTree,
    renderDashboard,
    startTokenRefresh,
  );
}

// ============================================
//  تحميل التطبيق
// ============================================

/** @description تحميل التطبيق عند بدء التشغيل */
async function loadApp() {
  logFunctionStatus("loadApp", true);
  logger.log("[app] بدء تحميل التطبيق...");
  try {
    // Scores are loaded from server via loadAllDataFromServer() — no localStorage fallback

    const savedUser = sessionStorage.getItem("currentUser");
    if (savedUser) {
      state.currentUser = JSON.parse(savedUser);
      state.isAdmin = sessionStorage.getItem("isAdmin") === "true";

      document.getElementById("login-screen").classList.add("hidden");
      document.getElementById("dashboard-view").classList.remove("hidden");
      document.getElementById("ios-bottom-nav").classList.remove("hidden");

      const isGuest = state.currentUser.role === "guest";
      const safeName = sanitizeHTML(
        state.currentUser.fname || state.currentUser.fullName || "صديقنا",
      );
      document.getElementById("welcome-msg").innerText = isGuest
        ? "مَرْحَبًا بِكَ يَا ضَيْفَنَا الكَرِيم — الدخول تجريبي ولن تُحفظ الدرجات"
        : `مَرْحَبًا بِكَ يَا أَيُّهَا الدَّرْعَمِيُّ ${safeName}`;

      navToHome();
      renderDashboard(); // يعرض spinner أولاً ريثما تُحمَّل البيانات

      // ── تحميل الحزمة الكسولة للميزات مبكّراً (قبل الاشتباك مع السيرفر) ──
      // بحلول وقت وصول البيانات تكون الحزمة جاهزة بالفعل
      window.__loadFeatures?.();

      if (isGuest) {
        // وضع الضيف: لا توكن، لا تجديد، لكن نجلب البيانات العامة (امتحانات + مذكرات + لوحة الشرف)
        logger.log("[app] ✓ وضع الضيف — تحميل البيانات العامة...");

        // Import polling function
        const { startDataPolling } = await import("./modules/api.js");

        loadDataFromServer()
          .then(() => {
            state.dataLoaded = true;

            try {
              window.renderSubjectFilters?.();
            } catch (e) {
              logger.error("Sidebar/Filters failed:", e);
            }
            try {
              window.renderHistoryTree?.();
            } catch (e) {
              logger.error("History Tree failed:", e);
            }
            try {
              renderDashboard();
            } catch (e) {
              logger.error("Dashboard failed:", e);
            }
            // Start auto-polling for guest mode too
            startDataPolling(180000);
            logger.log("[app] ✓ الضيف — البيانات العامة جاهزة + polling نشط");
          })
          .catch((e) => {
            logger.warn("[app] ⚠️ فشل جلب البيانات للضيف:", e);
            state.dataLoaded = true;
            renderDashboard();
          });
        return;
      }

      startTokenRefresh();
      loadDataFromServer().then(() => {
        state.dataLoaded = true;

        try {
          window.renderSubjectFilters?.();
        } catch (e) {
          logger.error("Sidebar/Filters failed:", e);
        }
        try {
          window.renderHistoryTree?.();
        } catch (e) {
          logger.error("History Tree failed:", e);
        }
        try {
          renderDashboard();
        } catch (e) {
          logger.error("Dashboard failed:", e);
        }
        logger.log("[app] ✓ التطبيق جاهز — البيانات محمّلة من السيرفر");
        window.openPendingQuizIfAny?.();
      });
      return;
    }
    showLoginScreenWithDesktop();
  } catch (e) {
    logger.warn("تعذر الوصول للذاكرة المحلية:", e);
    showLoginScreenWithDesktop();
  }
}

// Try to launch a deep-linked quiz after data is loaded.
function openPendingQuizIfAny() {
  try {
    const quizId = sessionStorage.getItem("pending-quiz-id");
    if (!quizId) return false;
    const idx = (state.allQuizzes || []).findIndex(
      (q) => String(q?.id ?? q?.config?.id) === String(quizId),
    );
    if (idx === -1) return false;
    sessionStorage.removeItem("pending-quiz-id");
    const run = () => {
      if (typeof window.playQuiz === "function") window.playQuiz(idx);
    };
    if (typeof window.__loadFeatures === "function") {
      window.__loadFeatures().then(run).catch(run);
    } else {
      run();
    }
    return true;
  } catch (e) {
    return false;
  }
}

/** إغلاق نافذة تعديل المحتوى وإعادة تشغيل Lenis عبر _syncMainInteractionState */
function closeEditSelectionModal() {
  const el = document.getElementById("edit-selection-modal");
  if (el) el.classList.add("hidden");
  _syncMainInteractionState();
}

// ============================================
//  ربط الدوال بـ window (للاستدعاء من HTML onclick)
// ============================================
Object.assign(window, {
  // Navigation
  navToHome,
  navToSection,
  openAdminAuthOrPanel,
  closeStudentMenu,
  openBottomSheet,
  closeBottomSheet,
  closeAdminSheet,
  closeAllOverlays,
  updateDockUI,
  toggleTreeNode,
  _syncMainInteractionState,

  // Auth
  startGoogleRedirectLogin,
  closeAdminAuth,
  logoutUser,
  handleStudentGoogleLogin,
  loadApp,

  // Quiz / Tree / Notes — stubs installed by registerFeatureStubs() below;
  // real implementations loaded lazily via app.features.bundle.min.js

  // Admin UI (closeEditSelectionModal is a core fn; rest loaded lazily)
  closeEditSelectionModal,

  // Dashboard
  renderDashboard,
  deleteQuiz,
  copyQuizLink,

  // Helpers
  sanitizeHTML,
  showAlert,
  showConfirm,
  showLoading,
  // Quick perf helper for inline scripts
  getQuickDeviceTier,

  // Animations & Scroll (exposed for use from HTML/other scripts if needed)
  scrollToTop,
  scrollToElement,
  playEntranceAnimation,
  playExitAnimation,
  animateElement,
  pauseAllAnimations,
  resumeAllAnimations,
  // Expose startApp so bootstrap.js can invoke it after bundle injection
  startApp,
  openPendingQuizIfAny,
});

// ============================================
//  Lazy Admin Bundle
//  builder.js (~19 KB) + grades.js (~11 KB)
//  Loads app.admin.bundle.min.js on first admin interaction.
//  Admin bundle overrides these stubs with real implementations.
// ============================================
(function registerAdminStubs() {
  const ADMIN_FNS = [
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
    "openGradesModal",
    "closeGradesModal",
    "openStatsModal",
    "closeStatsModal",
    "openEditSelectionModal",
    "switchEditTab",
  ];

  let _adminLoaded = false;
  let _adminLoadPromise = null;

  function _loadAdmin() {
    if (_adminLoaded) return Promise.resolve();
    if (!_adminLoadPromise) {
      _adminLoadPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "/js/app.admin.bundle.min.js?v=88";
        s.onload = () => {
          _adminLoaded = true;
          resolve();
        };
        s.onerror = () => reject(new Error("Admin bundle failed to load"));
        document.head.appendChild(s);
      });
    }
    return _adminLoadPromise;
  }

  ADMIN_FNS.forEach((name) => {
    window[name] = function (...args) {
      _loadAdmin()
        .then(() => {
          if (typeof window[name] === "function") window[name](...args);
        })
        .catch((err) => logger.error("[admin]", err));
    };
  });
})();

// ============================================
//  Lazy Features Bundle
//  quiz.js (34 KB) + tree.js (26 KB) + notes.js (7 KB)
//  Loads app.features.bundle.min.js on first feature interaction.
//  Features bundle overrides these stubs with real implementations.
// ============================================
(function registerFeatureStubs() {
  const FEATURE_FNS = [
    // Quiz
    "playQuiz",
    "selectAnswer",
    "goToNextQuestion",
    "goToPreviousQuestion",
    "submitQuiz",
    "exitToMain",
    "showFeedback",
    "hideFeedback",
    // Tree & Subjects
    "getDynamicSubjects",
    "setSubjectFilter",
    "setEditSubjectFilter",
    "renderSubjectFilters",
    "renderHistoryTree",
    "renderEditTree",
    "renameSubject",
    "closeRenameModal",
    "executeRenameSubject",
    "confirmDeleteSubject",
    "closeDeleteModal",
    "executeDeleteSubject",
    // Notes
    "openAddNoteModal",
    "closeAddNoteModal",
    "saveNote",
    "loadNoteIntoBuilder",
    "updateExistingNote",
    "forceDownload",
  ];

  let _featuresLoaded = false;
  let _featuresPromise = null;

  function _loadFeatures() {
    if (_featuresLoaded) return Promise.resolve();
    if (!_featuresPromise) {
      _featuresPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "/js/app.features.bundle.min.js?v=95";
        s.onload = () => {
          _featuresLoaded = true;
          resolve();
        };
        s.onerror = () => reject(new Error("Features bundle failed to load"));
        document.head.appendChild(s);
      });
    }
    return _featuresPromise;
  }

  // Expose loader so loadApp() can trigger proactive prefetch
  window.__loadFeatures = _loadFeatures;

  FEATURE_FNS.forEach((name) => {
    window[name] = function (...args) {
      _loadFeatures()
        .then(() => {
          if (typeof window[name] === "function") window[name](...args);
        })
        .catch((err) => logger.error("[features]", err));
    };
  });
})();

// Fallback: addEventListener for login button (in case onclick doesn't fire)
const fallbackLoginListener = () => {
  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) {
    loginBtn.addEventListener("click", (e) => {
      e.preventDefault();
      try {
        startGoogleRedirectLogin("student");
      } catch (err) {
        logger.error("❌ Login error:", err);
        logger.warn("Alert:", "خطأ في تسجيل الدخول: " + err.message);
      }
    });
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", fallbackLoginListener, { once: true });
} else {
  fallbackLoginListener();
}

// ============================================
//  نقطة البداية
// ============================================
export async function startApp() {
  setupFocusManagement();
  logFunctionStatus("window.onload", false);

  // Hide any bootstrap loading overlay once the app bootstraps
  if (typeof window.hideLoadingScreen === "function") {
    window.hideLoadingScreen();
  }

  // Expose shared state for lazy-loaded admin bundle (builder.js / grades.js)
  window.__appState = state;
  // Expose api singletons for admin bundle (avoids duplicating state-aware modules)
  window.__api = { apiCall, fetchScoresFromServer, fetchLeaderboardFromServer };

  // اقرَأ الإعدادات العامة المضمّنة بواسطة /config.js مبكراً
  try {
    const cfg =
      typeof window !== "undefined" && window.__PUBLIC_CONFIG
        ? window.__PUBLIC_CONFIG
        : null;
    if (cfg && cfg.googleClientId) {
      state.GOOGLE_CLIENT_ID = cfg.googleClientId;
    }
  } catch (e) {
    logger.warn("⚠️ لم تتوفر الإعدادات العامة في window.__PUBLIC_CONFIG:", e);
  }

  // ── تفعيل قفل scroll الخلفية عند فتح أي مودال ──────────────────────────
  // DOMContentLoaded قد يكون فات بالفعل، استخدم شرط الجاهزية
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOverlayScrollLock, { once: true });
  } else {
    initOverlayScrollLock();
  }

  // تهيئة DOM الاختبار + ربط Enter في حقل التسمية تتم داخل app.features.bundle.min.js
  // (quiz.js + tree.js + notes.js محمَّلة كسولاً — لا initQuizDOM هنا)

  // Patch: Inject guest-mode header for score submission
  const originalSubmitScore = window.submitScore;
  window.submitScore = function (data) {
    const isGuest =
      localStorage.getItem("guest-mode") === "true" ||
      sessionStorage.getItem("guest-mode") === "true";
    if (isGuest) {
      if (!data.headers) data.headers = {};
      data.headers["x-guest-mode"] = "true";
    }
    return originalSubmitScore ? originalSubmitScore(data) : null;
  };

  // معالجة Google redirect أو تحميل التطبيق
  const handledRedirect = handleGoogleRedirectToken();
  initGoogleSignIn();

  // IMPORTANT: Always call loadApp initialization code, even after Google redirect
  // This ensures state setup, theme initialization, and DOM setup happen
  if (!handledRedirect) {
    loadApp();
  } else {
    // After Google redirect is handled, ensure minimal setup is done
    // (theme init, overlay lock) that would normally run in loadApp()
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () =>
        initOverlayScrollLock(),
      );
    } else {
      initOverlayScrollLock();
    }
  }

  // ── تهيئة وحدات الحركة والتمرير بشكل غير حاجب للعرض الأول ───────────────
  (async function initNonCriticalRuntime() {
    // قياس مستوى الجهاز أولاً ثم قرر تحميل مكتبات الحركة الثقيلة.
    const perf = await getDevicePerformanceTier({ skipFPSTest: true });
    try {
      window.__devicePerf = perf;
    } catch (e) {
      /* ignore */
    }

    const tier = perf?.tier || "high";

    // Load motion libs only for devices that can benefit from them.
    if (window.__loadMotionLibs && tier !== "low") {
      window.__loadMotionLibs();
    }

    if (perf && perf.tier === "low") {
      document.body.classList.add("reduced-graphics");
    }

    if (tier !== "low") {
      await initAnimations(perf);
    } else {
      logger.log("[app] ⏭️ تخطي initAnimations على الأجهزة الضعيفة");
    }

    await applyPerformanceBasedAnimationSettings(perf);

    // تهيئة Lenis بشكل مؤجل لتفادي التأثير على الطلاء الأول
    try {
      if (document && document.fonts) {
        const fontsReady = document.fonts.ready;
        const timeout = new Promise((res) => setTimeout(res, 1000));
        await Promise.race([fontsReady, timeout]);
      }
    } catch (e) {
      /* ignore */
    }

    const startScroll = () => {
      try {
        const _p = window.__devicePerf;
        const _t = _p?.tier || "high";
        const _m =
          navigator.maxTouchPoints > 1 &&
          !!window.matchMedia?.("(hover: none)").matches;

        if (_t === "low") {
          // Keep native scrolling for weakest devices to cut RAF/GPU overhead.
          disableSmoothScroll();
          offScrollEnter();
          return;
        }

        const scrollOpts = {};
        if (_t === "medium" || _m) {
          scrollOpts.duration = _m ? 0.8 : 1.0;
          scrollOpts.touchMultiplier = _m ? 1.0 : 1.5;
        }
        initScroll(scrollOpts);
      } catch (err) {
        logger.warn("[scroll] deferred init failed:", err);
      }
    };

    if ("requestIdleCallback" in window) {
      requestIdleCallback(startScroll, { timeout: 2000 });
    } else {
      setTimeout(startScroll, 700);
    }
  })().catch((e) => {
    logger.warn("[app] non-critical init skipped:", e?.message || e);
  });
}
