import logger from '../utils/logger.js';
/**
 * @module auth
 * @description تسجيل الدخول بـ Google OAuth، إدارة الجلسة، تسجيل الخروج
 */
import state from "./state.js";
import { showAlert, logFunctionStatus } from "./helpers.js";

/**
 * تقوم بفك تشفير توكن JWT بأمان مع معالجة جميع الأخطاء المحتملة
 * @param {string} token - سلسلة التوكن
 * @returns {Object|null} - بيانات المستخدم إذا كانت صالحة، أو null في حال الفشل
 */
function safeParseToken(token) {
    // 1. فحص أولي للنوع والقيمة
    if (!token || typeof token !== 'string') {
        console.warn('[Auth] Token is missing or not a string');
        return null;
    }

    try {
        let payloadPart = token;
        
        // 2. إذا كان التوكن بصيغة JWT (three parts)، استخرج الجزء الأوسط فقط
        if (token.split('.').length === 3) {
            payloadPart = token.split('.')[1];
        }

        // 3. محاولة فك التشفير (قد تفشل إذا كانت السلسلة غير مشفرة بشكل صحيح)
        const decodedString = atob(payloadPart);

        // 4. محاولة تحويل النص المفكك إلى JSON
        try {
            const payload = JSON.parse(decodedString);
            return payload; // نجاح
        } catch (jsonError) {
            console.warn('[Auth] Invalid JSON structure in token payload:', jsonError.message);
            return null;
        }
    } catch (decodeError) {
        // 5. التعامل مع أخطاء atob (مثل الأحرف غير الصالحة)
        console.warn('[Auth] Failed to base64 decode token:', decodeError.message);
        return null;
    }
}

// -------------------------------------------------------------
// Lifecycle Management: Event Listeners Cleanup
// -------------------------------------------------------------
let deferredStudentLoginResponse = null;

export function handleDeferredStudentLogin() {
  if (window.handleStudentGoogleLogin && deferredStudentLoginResponse) {
    window.handleStudentGoogleLogin(deferredStudentLoginResponse);
    deferredStudentLoginResponse = null;
  }
}

export function cleanup() {
  window.removeEventListener("load", handleDeferredStudentLogin);
  if (state.tokenRefreshTimer) {
    clearInterval(state.tokenRefreshTimer);
    state.tokenRefreshTimer = null;
  }
  // أي مستمع أحداث دائم آخر يمكن إزالته هنا
}

import {
  apiCall,
  loadDataFromServer,
  getClientDeviceId,
  startDataPolling,
  stopDataPolling,
} from "./api.js";
import {
  navToHome,
  showLoginScreen,
  _showThemeToggle,
  openAdminAuthOrPanel,
  updateDockUI,
} from "./navigation.js";
import { startLeaderboardAutoRefresh } from "./dashboard.js";

function getClientDevicePayload() {
  return {
    deviceId: getClientDeviceId(),
    deviceName: navigator.userAgent || "Unknown Device",
  };
}

function buildSecurityConsentPayload() {
  return {
    securityConsent: true,
  };
}

/**
 * بدء تسجيل دخول Google عبر Redirect
 * @param {'student'|'admin'} mode — وضع التسجيل
 */
export function startGoogleRedirectLogin(mode) {
  window.startGoogleRedirectLogin = startGoogleRedirectLogin;
  try {
    logFunctionStatus("startGoogleRedirectLogin", false);
    const redirectMode = mode === "admin" ? "admin" : "student";
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const stateToken =
      Math.random().toString(36).slice(2) + Date.now().toString(36);
    // Keep OAuth state ephemeral in sessionStorage only.
    sessionStorage.setItem("googleLoginMode", redirectMode);
    sessionStorage.setItem("googleNonce", nonce);
    sessionStorage.setItem("googleState", stateToken);

    const currentUrl = new URL(window.location.href);
    // Use a stable redirect URI that exactly matches Google Console.
    // For this app we always return to site root and parse id_token from hash.
    const redirectUri = currentUrl.origin + "/";
    const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    oauthUrl.searchParams.set("client_id", state.GOOGLE_CLIENT_ID);
    oauthUrl.searchParams.set("redirect_uri", redirectUri);
    oauthUrl.searchParams.set("response_type", "id_token");
    oauthUrl.searchParams.set("scope", "openid email profile");
    oauthUrl.searchParams.set("nonce", nonce);
    oauthUrl.searchParams.set("state", stateToken);
    oauthUrl.searchParams.set("prompt", "select_account");
    window.location.href = oauthUrl.toString();
  } catch (err) {
    console.error("❌ startGoogleRedirectLogin error:", err);
    logger.warn("Alert:", "خطأ في تسجيل الدخول: " + err.message);
  }
}

/**
 * معالجة رد Google بعد Redirect
 * @returns {boolean} هل تم معالجة التوكن
 */
export function handleGoogleRedirectToken() {
  logFunctionStatus("handleGoogleRedirectToken", false);
  // Handle Google error redirect (e.g., access_denied)
  if (window.location.hash && window.location.hash.includes("error=")) {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const error = hashParams.get("error");
    const errorDesc = hashParams.get("error_description") || error;
    history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.search,
    );
    sessionStorage.removeItem("googleNonce");
    sessionStorage.removeItem("googleLoginMode");
    sessionStorage.removeItem("googleState");
    console.error("❌ Google OAuth error:", error, errorDesc);
    const errorEl = document.getElementById("login-error");
    if (errorEl) {
      errorEl.textContent =
        "❌ خطأ من Google: " + decodeURIComponent(errorDesc || "غير معروف");
      errorEl.classList.remove("hidden");
    }
    return true;
  }

  if (!window.location.hash || !window.location.hash.includes("id_token="))
    return false;
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const idToken = hashParams.get("id_token");
  const returnedState = hashParams.get("state");
  const expectedNonce = sessionStorage.getItem("googleNonce");
  const expectedState = sessionStorage.getItem("googleState");
  const savedMode = sessionStorage.getItem("googleLoginMode") || "student";

  history.replaceState(
    {},
    document.title,
    window.location.pathname + window.location.search,
  );
  sessionStorage.removeItem("googleNonce");
  sessionStorage.removeItem("googleLoginMode");
  sessionStorage.removeItem("googleState");

  // ✅ CRITICAL: Clear old consent to force re-validation (prevent checkbox bypass)
  sessionStorage.removeItem("security-consent");
  sessionStorage.removeItem("security-consent-version");
  sessionStorage.removeItem("security-consent-ts");

  if (!idToken) return false;

  if (expectedState && returnedState && expectedState !== returnedState) {
    showAlert(
      "❌ فشل التحقق من تسجيل Google (state mismatch). حاول مرة أخرى.",
      "error",
    );
    return true;
  }

  // Nonce verification: decode the JWT payload to extract the nonce
  // (Google implicit flow embeds nonce inside the id_token, not as a URL parameter)
  if (expectedNonce) {
    const payload = safeParseToken(idToken);
    if (!payload) {
      logoutUser().catch(() => {});
      return true;
    }
    if (payload.nonce !== expectedNonce) {
      showAlert("❌ فشل التحقق من تسجيل Google (nonce mismatch). حاول مرة أخرى.", "error");
      return true;
    }
  }

  state.googleLoginMode = savedMode;
  const response = { credential: idToken };
  if (savedMode === "admin") {
    handleGoogleAdminResponse(response);
  } else {
    // Always use the window wrapper (set by app.js) which includes all callbacks
    if (window.handleStudentGoogleLogin) {
      window.handleStudentGoogleLogin(response);
    } else {
      logger.warn("handleStudentGoogleLogin wrapper not ready, deferring...");
      if (document.readyState === "complete") {
        window.handleStudentGoogleLogin(response);
      } else {
        deferredStudentLoginResponse = response;
        window.addEventListener("load", handleDeferredStudentLogin, { once: true });
      }
    }
  }
  return true;
}

/** @private */
export function initGoogleSignIn() {
  state.gsiRetries = 0;
}

export function initGoogleSignInWrapper() {
  logFunctionStatus("initGoogleSignIn", false);
  initGoogleSignIn();
}

/**
 * معالجة تسجيل دخول المعلم (أدمن) عبر Google
 * @param {{ credential: string }} response — استجابة Google
 */
export async function handleGoogleAdminResponse(response) {
  const errorEl = document.getElementById("admin-auth-error");
  const loadingEl = document.getElementById("admin-auth-loading");
  logFunctionStatus("handleGoogleAdminResponse", true);
  errorEl.classList.add("hidden");
  loadingEl.classList.remove("hidden");
  try {
    const res = await fetch("/api/auth/google", {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": getClientDeviceId(),
      },
      credentials: "include",
      body: JSON.stringify({
        idToken: response.credential,
        ...getClientDevicePayload(),
        ...buildSecurityConsentPayload(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل التحقق");
    // تأكد من إنهاء أي وضع ضيف قديم قبل تهيئة جلسة Google
    sessionStorage.removeItem("guest-mode");
    localStorage.removeItem("guest-mode");
    document.body.classList.remove("guest-mode");
    if (data.user.role === "admin") {
      state.isAdmin = true;
      loadingEl.classList.add("hidden");
      // Load core CSS immediately before showing admin panel
      if (window.__loadCoreCss) window.__loadCoreCss();
      closeAdminAuth();
      openAdminAuthOrPanel();
    } else {
      loadingEl.classList.add("hidden");
      errorEl.textContent =
        "❌ هذا الحساب ليس لديه صلاحيات إدارة. تواصل مع المعلم.";
      errorEl.classList.remove("hidden");
    }
  } catch (err) {
    loadingEl.classList.add("hidden");
    errorEl.textContent = "❌ " + (err.message || "حدث خطأ أثناء التحقق");
    errorEl.classList.remove("hidden");
  }
}

/** إغلاق مودل مصادقة الأدمن */
export function closeAdminAuth() {
  document.getElementById("admin-auth-modal").classList.add("hidden");
  _showThemeToggle(true);
  const errorEl = document.getElementById("admin-auth-error");
  const loadingEl = document.getElementById("admin-auth-loading");
  if (errorEl) errorEl.classList.add("hidden");
  if (loadingEl) loadingEl.classList.add("hidden");
  state.googleLoginMode = "student";
  updateDockUI("home");
}

/** رسالة ترحيب المعلم */
export function showAdminToast() {
  const toast = document.createElement("div");
  toast.className =
    "fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-green-500 text-white px-8 py-4 rounded-2xl shadow-2xl font-extrabold text-lg flex items-center gap-3 transition-all duration-500";
  toast.innerHTML =
    '<i class="fas fa-crown text-yellow-300 text-xl"></i> مرحباً بك، حساب معلم <i class="fas fa-check-circle"></i>';
  toast.style.opacity = "0";
  toast.style.transform = "translate(-50%, -20px)";
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translate(-50%, 0)";
  });
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translate(-50%, -20px)";
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

/**
 * معالجة تسجيل دخول الطالب عبر Google
 * @param {{ credential: string }} response — استجابة Google
 * @param {Function} renderSubjectFilters — دالة رسم الفلاتر
 * @param {Function} renderHistoryTree — دالة رسم الشجرة
 * @param {Function} renderDashboard — دالة رسم لوحة القيادة
 * @param {Function} startTokenRefresh — دالة بدء تجديد التوكن
 */
export async function handleStudentGoogleLogin(
  response,
  renderSubjectFilters,
  renderHistoryTree,
  renderDashboard,
  startTokenRefresh,
) {
  logFunctionStatus("handleStudentGoogleLogin", true);
  logger.log("[auth] بدء تسجيل دخول الطالب...");
  const errorEl = document.getElementById("login-error");
  const loadingEl = document.getElementById("login-loading");
  errorEl.classList.add("hidden");
  loadingEl.classList.remove("hidden");

  try {
    const res = await fetch("/api/auth/google", {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": getClientDeviceId(),
      },
      credentials: "include",
      body: JSON.stringify({
        idToken: response.credential,
        ...getClientDevicePayload(),
        ...buildSecurityConsentPayload(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data && data.debug) logger.warn("[auth] Login debug:", data.debug);
      throw new Error(data.error || "فشل تسجيل الدخول");
    }

    // تأكد من إنهاء أي وضع ضيف قديم قبل متابعة التحميل بعد Google login
    sessionStorage.removeItem("guest-mode");
    localStorage.removeItem("guest-mode");
    document.body.classList.remove("guest-mode");

    let fname = data.user.fname || "";
    let lname = data.user.lname || "";
    if (!fname) {
      const payload = safeParseToken(response.credential);
      if (!payload) {
        logoutUser().catch(() => {});
        return;
      }
      const fullName = payload.name || payload.email.split("@")[0];
      const parts = fullName.trim().split(/\s+/);
      fname = parts[0] || "";
      lname = parts.slice(1).join(" ") || "";
      if (fname) {
        // إرسال الاسم حتى لو lname فارغة (أسماء أحادية)
        await fetch("/api/auth/complete-profile", {
          credentials: "include",
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ fname, lname: lname || "" }),
        }).catch(() => {});
      }
    }

    state.currentUser = {
      fname: fname || data.user.fname,
      lname: lname || data.user.lname,
      fullName: (
        (fname + " " + lname).trim() ||
        data.user.fullName ||
        data.user.email ||
        ""
      ).trim(),
      avatar: data.user.avatar || "",
      role: data.user.role,
      email: data.user.email || "",
    };

    if (data.user.role === "admin") {
      state.isAdmin = true;
    }
    loadingEl.classList.add("hidden");
    logger.log(
      `[auth] ✓ تسجيل دخول ناجح — ${state.currentUser.fullName} (${state.isAdmin ? "أدمن" : "طالب"})`,
    );

    // Load core CSS immediately before showing dashboard
    if (window.__loadCoreCss) window.__loadCoreCss();

    // Store user info immediately to prevent losing state
    sessionStorage.setItem("currentUser", JSON.stringify(state.currentUser));
    sessionStorage.setItem("isAdmin", state.isAdmin.toString());

    const safeName = (
      state.currentUser.fname ||
      state.currentUser.fullName ||
      state.currentUser.email ||
      "صديقنا"
    ).trim();
    const greetings = [
      `مَرْحَبًا بِكَ يَا أَيُّهَا الدَّرْعَمِيُّ ${safeName}، قال تعالى: ﴿وَقُل رَّبِّ زِدْنِي عِلْمًا﴾`,
      `مَرْحَبًا بِكَ يَا أَيُّهَا الدَّرْعَمِيُّ ${safeName}، أَسْأَلُ اللهَ أَنْ يَنْفَعَكَ بِمَا تَعَلَّمْتَ`,
    ];
    document.getElementById("welcome-msg").innerText =
      greetings[Math.floor(Math.random() * greetings.length)];
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("dashboard-view").classList.remove("hidden");
    document.getElementById("ios-bottom-nav").classList.remove("hidden");
    if (data.user.role === "admin") showAdminToast();

    navToHome();
    if (typeof renderDashboard === "function") renderDashboard();
    if (typeof startTokenRefresh === "function") startTokenRefresh();

    loadDataFromServer().then(() => {
      state.dataLoaded = true;
      if (typeof renderSubjectFilters === "function") renderSubjectFilters();
      if (typeof renderHistoryTree === "function") renderHistoryTree();
      if (typeof renderDashboard === "function") renderDashboard();
      if (typeof window.openPendingQuizIfAny === "function")
        window.openPendingQuizIfAny();

      // Start automatic data polling (refresh every 30 seconds)
      startDataPolling(180000);
    });
  } catch (err) {
    loadingEl.classList.add("hidden");
    console.error("❌ Login error details:", err);
    errorEl.textContent = "❌ " + (err.message || "حدث خطأ أثناء تسجيل الدخول");
    errorEl.classList.remove("hidden");
  }
}

/**
 * تسجيل الخروج مع إلغاء التوكن ومزامنة بين التبويبات
 */
export async function logoutUser() {
  logFunctionStatus("logoutUser", true);
  logger.log("[auth] بدء تسجيل الخروج...");

  // Turn off the lamp on logout
  if (window.toggleLamp) {
    // Set lamp to off state (!1 means false/off)
    const lampSvg = document.getElementById("lamp-svg");
    if (lampSvg) {
      // Only turn off if lamp is currently on
      if (!lampSvg.classList.contains("off")) {
        window.toggleLamp();
      }
    }
  }

  // Stop automatic data polling on logout
  stopDataPolling();

  // Execute lifecycle cleanup to prevent memory leaks
  cleanup();

  const isGuest =
    state.currentUser?.role === "guest" ||
    localStorage.getItem("guest-mode") === "true";
  if (!isGuest) {
    try {
      await apiCall("POST", "/api/auth/logout").catch(() => {});
    } catch (e) {
      /* ignore */
    }
  }
  state.currentUser = null;
  state.isAdmin = false;
  sessionStorage.removeItem("currentUser");
  sessionStorage.removeItem("isAdmin");
  sessionStorage.removeItem("guest-mode");
  localStorage.removeItem("guest-mode");
  document.body.classList.remove("guest-mode");
  // Signal other tabs to logout (non-guest only)
  if (!isGuest) {
    localStorage.setItem("logout_event", Date.now().toString());
    localStorage.removeItem("logout_event");
  }
  logger.log("[auth] ✓ تم تسجيل الخروج");
  location.reload();
}

/**
 * بدء تجديد التوكن تلقائياً كل 6 ساعات
 */
export function startTokenRefresh() {
  logFunctionStatus("startTokenRefresh", true);
  if (state.tokenRefreshTimer) clearInterval(state.tokenRefreshTimer);
  logger.log("[auth] ✓ بدء تجديد التوكن التلقائي (كل 6 ساعات)");
  state.tokenRefreshTimer = setInterval(
    async () => {
      if (!state.currentUser) return;
      try {
        await apiCall("POST", "/api/auth/refresh");
        logger.log("[auth] ✓ تم تجديد التوكن تلقائياً");
        // Token refreshed in httpOnly cookie automatically
        sessionStorage.setItem(
          "currentUser",
          JSON.stringify(state.currentUser),
        );
      } catch (e) {
        console.error("[auth] ✗ فشل تجديد التوكن:", e.message);
      }
    },
    6 * 60 * 60 * 1000,
  );
}

// ملاحظة: startLeaderboardAutoRefresh تُستدعى من dashboard.js بعد تسجيل الدخول فعلياً
// لا تستدعِها هنا عند تحميل الموديول تجنباً للـ polling قبل وجود جلسة
