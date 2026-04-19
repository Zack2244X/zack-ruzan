import logger from '../utils/logger.js';
// 1. الاستيرادات أولاً في أعلى الملف
import state from "./state.js";
import { logFunctionStatus } from "./helpers.js";

const DEVICE_ID_KEY = "client-device-id";

const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{10,50}$/;
export function getClientDeviceId() {
  function generateNewId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return `dev-${crypto.randomUUID()}`;
    }
    return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
  
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id || typeof id !== "string" || !DEVICE_ID_REGEX.test(id)) {
      id = generateNewId();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `dev-fb-${Math.random().toString(36).slice(2, 12)}`;
  }
}

// 2. تعريف الدوال والتصدير
// Provide a fetch-like wrapper for dashboard.js compatibility
export async function apiFetch(url) {
  return await apiCall("GET", url);
}

/**
 * @module api
 * @description دوال الاتصال بالسيرفر — API calls
 */

/**
 * قراءة csrf_token من الكوكيز (يضعه السيرفر بعد تسجيل الدخول)
 * @returns {string}
 */
function getCsrfToken() {
  try {
    return (
      document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("csrf_token="))
        ?.split("=")[1] || ""
    );
  } catch {
    return "";
  }
}

/**
 * إنشاء هيدرز الطلب — يشمل CSRF token على الطلبات المُعدِّلة
 * @returns {Object}
 */
export function getAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  headers["X-Device-Id"] = getClientDeviceId();
  const csrf = getCsrfToken();
  if (csrf) headers["X-CSRF-Token"] = csrf;
  // إرسال هيدر الضيف عندما يكون وضع الضيف مفعلاً أو المستخدم الحالي ضيفاً.
  // لا نمسح العلامات هنا لتجنب فقدان وضع الضيف أثناء تزامن بدء التطبيق.
  try {
    const hasGuestFlag =
      sessionStorage.getItem("guest-mode") === "true" ||
      localStorage.getItem("guest-mode") === "true";
    const isCurrentUserGuest = state.currentUser?.role === "guest";
    if (hasGuestFlag || isCurrentUserGuest) {
      headers["X-Guest-Mode"] = "true";
    }
  } catch (e) {
    /* تجاهل خطأ sessionStorage */
  }
  return headers;
}

/**
 * استدعاء API عام
 * يرسل الكوكيز تلقائياً (httpOnly JWT) + Authorization header كـ fallback
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method — HTTP method
 * @param {string} url — المسار
 * @param {Object} [body] — البيانات المرسلة
 * @param {number} [timeout=30000] — مهلة الانتظار
 * @returns {Promise<Object>} البيانات المرجعة
 * @throws {Error} في حالة فشل الاتصال
 */
const activeRequests = new Map();

export async function apiCall(method, url, body, timeout = 30000) {
  logFunctionStatus(`apiCall ${method} ${url}`, true);
  const tag = `[API] ${method} ${url}`;

  // إلغاء أي طلب متطابق سابق لم يكتمل بعد لتخفيف الضغط
  const requestKey = `${method}:${url}`;
  if (activeRequests.has(requestKey)) {
    activeRequests.get(requestKey).abort("Cancelled by new request");
  }

  const controller = new AbortController();
  activeRequests.set(requestKey, controller);

  const timeoutId = setTimeout(() => {
    controller.abort("Timeout");
  }, timeout);

  logger.log(`${tag} — إرسال...`, body ?? "");
  const opts = {
    method,
    headers: getAuthHeaders(),
    credentials: "include",
    signal: controller.signal,
  };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(url, opts);
    clearTimeout(timeoutId);
    activeRequests.delete(requestKey);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errMsg = data.error || `HTTP ${res.status}`;
      logger.error(`${tag} ✗ فشل — ${res.status}:`, data);
      throw new Error(errMsg);
    }
    const data = await res.json();
    logger.log(`${tag} ✓ نجح — ${res.status}`, data);
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    activeRequests.delete(requestKey);

    if (
      error.name === "AbortError" ||
      (controller.signal && controller.signal.aborted)
    ) {
      const reason = controller.signal.reason;
      if (reason === "Timeout") {
        logger.error(`${tag} ⏳ انتهت مهلة الانتظار (${timeout}ms).`);
        throw new Error(
          "انتهت مهلة الانتظار، السيرفر لا يستجيب أو الشبكة بطيئة.",
        );
      } else {
        logger.warn(`${tag} 🚫 تم إلغاء الطلب:`, reason);
        throw new Error("تم الإلغاء لأنك قمت بطلب أحدث.");
      }
    }
    throw error;
  }
}

// ─────────────────────────────────────────────
//  دوال المحاولات
// ─────────────────────────────────────────────

/**
 * جلب عدد المحاولات من السيرفر لطالب محدد واختبار محدد.
 *
 * يُستخدم عند بدء الاختبار للتحقق من عدد المرات التي حاول فيها الطالب مسبقاً.
 * المسؤول (admin) يمكنه جلب محاولات أي طالب عبر تمرير email صريح،
 * أما الطالب العادي فيُستخرج بريده تلقائياً من الجلسة على السيرفر.
 *
 * @param {string} quizId  - معرّف الاختبار
 * @param {string} [email] - البريد الإلكتروني للطالب (اختياري — للأدمن فقط)
 * @returns {Promise<number>} عدد المحاولات (0 إذا لم تُوجد سجلات)
 *
 * @example
 * // طالب يجلب محاولاته الخاصة
 * const count = await getAttempts('quiz_01');
 *
 * // أدمن يجلب محاولات طالب آخر
 * const count = await getAttempts('quiz_01', 'student@example.com');
 */
export async function getAttempts(quizId, email = "") {
  logFunctionStatus("getAttempts", true);
  if (!quizId) {
    logger.warn("[getAttempts] quizId مطلوب");
    return 0;
  }
  try {
    const params = new URLSearchParams({ quizId });
    if (email) params.append("email", email);
    const data = await apiCall("GET", `/api/attempts?${params.toString()}`);
    const count = Number(data?.attempts) || 0;
    logger.log(
      `[getAttempts] quizId=${quizId} email=${email || "self"} → ${count} محاولة`,
    );
    return count;
  } catch (err) {
    logger.warn("⚠️ [getAttempts] تعذر جلب المحاولات:", err.message);
    return 0;
  }
}

/**
 * إرسال محاولة جديدة للسيرفر (زيادة العداد بمقدار 1).
 *
 * يجب استدعاء هذه الدالة عند بدء الاختبار فعلياً لا عند فتح الصفحة،
 * لضمان دقة العد. تُعيد العدد المحدَّث كما حسبه السيرفر.
 *
 * @param {string} quizId     - معرّف الاختبار
 * @param {string} [email]    - البريد الإلكتروني (يُستخرج من الجلسة إن لم يُمرَّر)
 * @returns {Promise<number>} عدد المحاولات بعد التحديث
 *
 * @example
 * const newCount = await saveAttempt('quiz_01');
 * logger.log(`هذه محاولتك رقم ${newCount}`);
 */
export async function saveAttempt(quizId, email = "") {
  logFunctionStatus("saveAttempt", true);
  if (!quizId) throw new Error("[saveAttempt] quizId مطلوب");
  try {
    const payload = { quizId };
    if (email) payload.email = email;
    const data = await apiCall("POST", "/api/attempts", payload);
    const updated = Number(data?.attempts) || 0;
    logger.log(`[saveAttempt] quizId=${quizId} → المحاولة رقم ${updated}`);
    return updated;
  } catch (err) {
    logger.warn("⚠️ [saveAttempt] تعذر حفظ المحاولة:", err.message);
    return 0;
  }
}

// ─────────────────────────────────────────────
//  دوال الدرجات
// ─────────────────────────────────────────────

/**
 * @typedef {Object} ScorePayload
 * @property {string}  quizId      - معرّف الاختبار
 * @property {string}  quizTitle   - عنوان الاختبار
 * @property {string}  quizSubject - مادة الاختبار
 * @property {number}  score       - الدرجة المحصلة
 * @property {number}  total       - الدرجة الكلية
 * @property {boolean} [isOfficial=true]
 *   - true  → محاولة رسمية (تُحتسب في لوحة الشرف والإحصائيات)
 *   - false → محاولة تدريبية (تُخزَّن للمراجعة دون احتساب رسمي)
 */

/**
 * إرسال نتيجة الاختبار إلى السيرفر مع تمييز نوع المحاولة.
 *
 * عند `isOfficial = false` يُخزِّن السيرفر النتيجة بعلامة "تدريبي"
 * وتستطيع لوحة الشرف تجاهلها أو إبرازها بشكل منفصل حسب المنطق الخلفي.
 *
 * @param {ScorePayload} scoreData - بيانات النتيجة
 * @returns {Promise<Object>} استجابة السيرفر
 * @throws {Error} إذا فشل الإرسال
 *
 * @example
 * // نتيجة رسمية
 * await saveScore({ quizId: 'quiz_01', quizTitle: 'الفيزياء', quizSubject: 'علوم',
 *                   score: 8, total: 10, isOfficial: true });
 *
 * // نتيجة تدريبية
 * await saveScore({ quizId: 'quiz_01', quizTitle: 'الفيزياء', quizSubject: 'علوم',
 *                   score: 5, total: 10, isOfficial: false });
 */
export async function saveScore({
  quizId,
  quizTitle,
  quizSubject,
  score,
  total,
  isOfficial = true,
}) {
  logFunctionStatus("saveScore", true);
  if (!quizId) throw new Error("[saveScore] quizId مطلوب");

  const percentage = Math.round((Number(score) / (Number(total) || 1)) * 100);

  const payload = {
    quizId,
    quizTitle: quizTitle || "امتحان",
    quizSubject: quizSubject || "",
    score: Number(score) || 0,
    total: Number(total) || 0,
    percentage,
    isOfficial, // ← العلامة الرئيسية: رسمي / تدريبي
    date: new Date().toISOString(),
  };

  logger.log(
    `[saveScore] إرسال النتيجة — quizId=${quizId} isOfficial=${isOfficial}`,
    payload,
  );
  return await apiCall("POST", "/api/scores", payload);
}

// ─────────────────────────────────────────────
//  دوال الجلب العام
// ─────────────────────────────────────────────

/**
 * جلب لوحة الشرف من السيرفر
 * @returns {Promise<Array>} بيانات لوحة الشرف
 */
export async function fetchLeaderboardFromServer() {
  logFunctionStatus("fetchLeaderboardFromServer", true);
  try {
    const data = await apiCall("GET", "/api/scores/leaderboard");
    return data.map((item) => ({
      userName: item.userName || "طالب",
      fullMarksCount: Number(item.fullMarksCount) || 0,
      avgPercentage: Number(item.avgPercentage) || 0,
      totalScore: Number(item.totalScore) || 0,
      totalMax: Number(item.totalMax) || 0,
      examsCount: Number(item.examsCount) || 0,
    }));
  } catch (err) {
    logger.warn("⚠️ تعذر جلب لوحة الشرف:", err.message);
    return [];
  }
}

/**
 * جلب الدرجات من السيرفر
 * @param {boolean} [officialOnly=false] - جلب المحاولات الرسمية فقط
 * @returns {Promise<Array>} بيانات الدرجات
 */
export async function fetchScoresFromServer(officialOnly = false) {
  logFunctionStatus("fetchScoresFromServer", true);
  try {
    // للضيف أو من لم يسجل الدخول: لا نطلب درجاته الشخصية، نطلب فقط لوحة الشرف
    if (!state.currentUser || state.currentUser.role === "guest") {
      logger.log("[scores] ✓ ضيف/لم يسجل الدخول — تخطي جلب الدرجات الشخصية");
      return [];
    }

    const base = state.isAdmin ? "/api/scores/all" : "/api/scores/my";
    const endpoint = officialOnly ? `${base}?isOfficial=true` : base;
    const raw = await apiCall("GET", endpoint);
    const data = Array.isArray(raw) ? raw : raw?.data || [];
    return data.map((item) => ({
      userName:
        item.userName ||
        (item.user
          ? `${item.user.fname || ""} ${item.user.lname || ""}`.trim()
          : "طالب"),
      userId: item.userId || item.user?.id || null,
      quizId: item.quizId || item.quiz?.id || null,
      quizTitle: item.quizTitle || item.quiz?.title || "امتحان",
      quizSubject: item.quizSubject || item.quiz?.subject || "",
      score: Number(item.score) || 0,
      total: Number(item.total) || 0,
      percentage:
        Number(item.percentage) ||
        Math.round(
          ((Number(item.score) || 0) / (Number(item.total) || 1)) * 100,
        ),
      isOfficial: item.isOfficial ?? true, // ← محافظة على العلامة من السيرفر
      date: item.date || item.createdAt || new Date().toISOString(),
    }));
  } catch (err) {
    logger.warn("⚠️ تعذر جلب الدرجات:", err.message);
    return [];
  }
}

/**
 * تحميل جميع البيانات من السيرفر
 */
export async function loadDataFromServer() {
  logFunctionStatus("loadDataFromServer", true);
  if (!state.currentUser) {
    logger.warn("[loadData] لا يوجد مستخدم — تخطي");
    return;
  }
  logger.log("[loadData] بدء تحميل البيانات من السيرفر...");
  try {
    // Staggered Requests - توجيه الطلبات بفارق زمني لتقليل حمل السيرفر اللحظي (Spike)
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const quizzesRes = await apiCall("GET", "/api/quizzes").catch((e) => {
      logger.error("[loadData] ✗ فشل تحميل الامتحانات:", e.message);
      return { data: [] };
    });
    await delay(300);

    const notesRes = await apiCall("GET", "/api/notes").catch((e) => {
      logger.error("[loadData] ✗ فشل تحميل المذكرات:", e.message);
      return { data: [] };
    });
    await delay(300);

    const leaderboardRemote = await fetchLeaderboardFromServer().catch((e) => {
      logger.error("[loadData] ✗ فشل تحميل لوحة الشرف:", e.message);
      return [];
    });
    await delay(300);

    const scoresRemote = await fetchScoresFromServer().catch((e) => {
      logger.error("[loadData] ✗ فشل تحميل الدرجات:", e.message);
      return [];
    });

    const quizzes = Array.isArray(quizzesRes)
      ? quizzesRes
      : quizzesRes?.data || [];
    const notes = Array.isArray(notesRes) ? notesRes : notesRes?.data || [];

    state.allQuizzes = quizzes.map((q) => ({
      id: q.id,
      config: {
        id: q.id,
        title: q.title,
        subject: q.subject,
        description: q.description || "",
        timeLimit: q.timeLimit || 1500,
        closingMessage: q.closingMessage || "شكراً لمشاركتك!",
      },
      questions: q.questions || [],
    }));

    state.allNotes = notes.map((n) => ({
      id: n.id,
      config: {
        id: n.id,
        title: n.title,
        subject: n.subject,
        link: n.link || "",
        type: n.type || "pdf",
        description: n.description || "",
      },
    }));

    state.serverLeaderboard = leaderboardRemote || [];
    state.serverScores = scoresRemote || [];

    if (state.serverScores.length > 0) {
      state.allUserScores = state.serverScores.map((s) => ({
        userName: s.userName || "طالب",
        userId: s.userId || null,
        quizTitle: s.quizTitle || "امتحان",
        score: Number(s.score) || 0,
        total: Number(s.total) || 0,
        percentage: Number(s.percentage) || 0,
        isOfficial: s.isOfficial ?? true, // ← محافظة على العلامة
        date: s.date || s.createdAt || new Date().toISOString(),
      }));
    }

    state.dataLoaded = true;
    logger.log(
      `[loadData] ✓ تم — ${state.allQuizzes.length} امتحان، ${state.allNotes.length} مذكرة، ${state.serverScores.length} نتيجة، ${state.serverLeaderboard.length} في لوحة الشرف`,
    );
  } catch (e) {
    logger.error("[loadData] ✗ فشل تحميل البيانات:", e.message);
  }
}

// ─────────────────────────────────────────────
//  نظام التحديث التلقائي (Polling)
// ─────────────────────────────────────────────

let dataPollingTimer = null;
let dataPollingIntervalMs = 180000;

function clearPollingTimer() {
  if (dataPollingTimer) {
    clearInterval(dataPollingTimer);
    dataPollingTimer = null;
  }

  if (typeof window !== "undefined" && window.dataPollingTimer) {
    clearInterval(window.dataPollingTimer);
    window.dataPollingTimer = null;
  }
}

export function isDataPollingActive() {
  return !!dataPollingTimer;
}

export function getDataPollingInterval() {
  return dataPollingIntervalMs;
}

/**
 * بدء التحديث التلقائي للبيانات من السيرفر
 * يقوم بجلب الامتحانات والمذكرات والدرجات بشكل دوري
 * @param {number} [interval=30000] - الفترة الزمنية بالمللي ثانية (افتراضياً 30 ثانية)
 * @example
 * startDataPolling(30000); // تحديث كل 30 ثانية
 */
export function startDataPolling(interval = 180000) {
  // زادت المدة لـ 3 دقائق כحد أدنى
  logFunctionStatus("startDataPolling", false);

  dataPollingIntervalMs =
    Number.isFinite(interval) && interval > 0
      ? Math.floor(interval)
      : 180000;

  clearPollingTimer();

  // دعم الـ Visibility API لمنع Polling والخلفية غير نشطة
  if (!window._visibilityListenerAdded) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        logger.log("[polling] 👁 عاد المستخدم متاحاً، سيتم التحديث قريباً...");
        // لا نريد أن نغرق السيرفر بمجرد العودة، نعتمد على استئناف الـ interval مع تأخير بسيط
        setTimeout(
          () => loadDataFromServer().catch(() => logger.warn("تخطى")),
          500,
        );
        startDataPolling(dataPollingIntervalMs); // استئناف
      } else {
        logger.log("[polling] 💤 تبويب في الخلفية، إيقاف التحديث...");
        clearPollingTimer();
      }
    });
    window._visibilityListenerAdded = true;
  }

  logger.log(
    `[polling] ✓ بدء التحديث التلقائي كل ${dataPollingIntervalMs / 1000} ثانية`,
  );

  dataPollingTimer = setInterval(() => {
    if (document.visibilityState === "hidden") return; // خط دفاع إضافي
    logger.log("[polling] ↻ جاري جلب البيانات الجديدة من السيرفر...");
    loadDataFromServer().catch((err) => {
      logger.warn("[polling] ⚠️ فشل جلب البيانات:", err.message);
    });
  }, dataPollingIntervalMs);

  if (typeof window !== "undefined") {
    window.dataPollingTimer = dataPollingTimer;
  }
}

/**
 * إيقاف التحديث التلقائي للبيانات
 * @example
 * stopDataPolling(); // إيقاف كل التحديثات التلقائية
 */
export function stopDataPolling() {
  logFunctionStatus("stopDataPolling", false);

  if (isDataPollingActive()) {
    clearPollingTimer();
    logger.log("[polling] ✓ تم إيقاف التحديث التلقائي");
  }
}
