function getClientDeviceId() {
  let id = localStorage.getItem("device_id_progress");
  if (!id) {
    id =
      "dev_" +
      Math.random().toString(36).substring(2) +
      Date.now().toString(36);
    localStorage.setItem("device_id_progress", id);
  }
  return id;
}
/**
 * @module quiz
 * @description محرك الاختبارات التفاعلي — يتحكم في تشغيل الاختبار، الأسئلة، المؤقت، النتائج والتغذية الراجعة
 * @version 3.0.0 — Multi-Attempt Edition
 * @changelog
 *   v3.0.0 — دعم إعادة المحاولة غير المحدودة:
 *     • المحاولة الأولى رسمية (isOfficial = true) وتُحتسب في لوحة الشرف
 *     • المحاولات التالية تدريبية (isOfficial = false) ولا تُحتسب
 *     • state.attemptsMap يتتبع المحاولات محلياً ومزامنتها مع السيرفر
 *     • لافتة توضيحية قبل كل محاولة وبعدها
 */
import state from "./state.js";
import {
  escapeHtml,
  sanitizeHTML,
  showAlert,
  showConfirm,
  formatTime,
  showToastMessage,
  pickRandom,
  logFunctionStatus,
} from "./helpers.js";
import { handleError, withRetry } from "../utils/errorHandler.js";
import { apiCall } from "./api.js";
import {
  _showThemeToggle,
  closeBottomSheet,
  closeAdminSheet,
} from "./navigation.js";

// =============================================
//  ثوابت النظام
// =============================================

/**
 * مفتاح localStorage لحفظ النتائج المعلّقة حتى تأكيد السيرفر.
 * ملاحظة: حُذف SUBMISSION_KEY_PREFIX — لم تعد هناك حاجة لمنع إعادة المحاولة.
 */
const PENDING_SCORE_KEY_PREFIX = "quiz_pending_score_";
/** الحد الأقصى لمحاولات إرسال النتيجة تلقائياً */
const MAX_SCORE_RETRIES = 3;
/** التأخير الأساسي بالمللي ثانية — يتضاعف مع كل محاولة (Exponential Backoff) */
const SCORE_RETRY_BASE_DELAY_MS = 1500;

// =============================================
//  رسائل التشجيع والتعزيز
// =============================================

/** @type {string[]} رسائل تشجيعية عند الإجابة الصحيحة */
const toastPraise = [
  "أحسنت بارك الله فيك 🌹",
  "نعم العلم ونعم المتعلم 🌒",
  "نعم العبد 🎉",
  "نعم الفتى 👌",
  "الله أكبر عليك إيه الحلاوة دي 🌟",
  "أصبت كبد الحقيقة! 🎯",
  "فتح الله عليك فتوح العارفين 🤲",
  "لله درُّك من نبيهٍ أريب! 👑",
  "نور على نور، زادك الله علماً 💡",
  "هذا الشبل من ذاك الأسد 🦁",
  "إيه الدماغ الألماظ دي! 💎",
  "أستاذ ورئيس قسم 🎓",
  "يا سيدي على الدماغ العالية والروقان 🧠",
  "عداك العيب وقزح 🚀",
  "معلم وابن معلم، جبت التايهة! 😎",
];

/** @type {string[]} رسائل عند الإجابة الخاطئة */
const toastOops = [
  "راجع العلم ✔️",
  "لا يفل الحديد إلا الحديد ⚔️",
  "وما أصابك من سيئة فمن نفسك 😔",
  "لكل صارم هفوة 🗡️",
  "لكل جواد كبوة 🎠",
  "لكل عالم زلة 📕",
  "جلّ من لا يسهو ☝️",
  "من الخطأ يولد الصواب ✔️",
  "قد يُخطئ السهم الهدف، فارمِ من جديد 🏹",
  "المحاولة شرف، والخطأ طريق التعلم 🛤️",
  "ليس كل ما يلمع ذهباً، راجع إجابتك 🔍",
  "جليت منك المرة دي يا بطل 😂",
  "شكلنا محتاجين كوباية شاي ونركز من تاني ☕",
  "إنت جبت الكلام ده منين يا غالي؟ 🤦‍♂️",
  "ولا يهمك، الشاطر بيقع ويقوم 💪",
  "خانتك التعبيرات المرة دي، جرب تاني 😅",
];

/** @type {Object<number, string[]>} رسائل السلاسل المتتالية */
const streakToasts = {
  2: ["شكلك فاهم يا نصة 😂"],
  3: ["بدا أنك درعمي أصيل 👌"],
  4: ["ماشاء الله نفع الله بك الأمة ♥️"],
  5: [
    "بلغ السيل الزبى 🔥",
    "إنت واكل إيه النهاردة؟ الدماغ دي متكلفة! 🧠🔥",
    "لا إحنا نقفل اللعبة على كده بقى، مفيش بعد كده! 🎮😎",
    "قطر وماشي مفيش حاجة قادرة توقفه، ما شاء الله! 🚂💨",
    "خمسة وخميسة في عين الحسود، إيه الحلاوة دي كلها! 🧿✨",
    "براحة علينا شوية، إنت كده معدي السحاب! ☁️🚀",
    "سيلٌ من الإبداع لا ينقطع، زادك الله من فضله! 🌊",
    "كالغيْث أينما وقع نفع، إجاباتك كلها صائبة! 🌧️",
    "سلسلة من الانتصارات المتتالية، لله درّ عقلك! ⛓️💡",
    "ما زلت تبرهن أنك فارس هذا الميدان بلا منازع! 🏇",
    "نور على نور، وتألق يتبعه تألق، استمر! 🌟",
    "ضرب نار مستمر! 🔥",
    "أداء أسطوري لا يُقهر! 🐉",
    "السلسلة مستمرة.. إياك أن تتوقف! 🔄",
  ],
};

// =============================================
//  مسجّل الأخطاء المركزي
// =============================================


// =============================================
//  إدارة معرّف الاختبار — Unified ID Handling
// =============================================

/**
 * استخراج معرّف الاختبار بشكل موحّد من بنية quizData.
 * @param {Object} quizData
 * @returns {string|number|null}
 */
function getQuizId(quizData) {
  return quizData?.id ?? quizData?.config?.id ?? null;
}

// =============================================
//  استمرارية النتيجة المعلّقة
// =============================================

/**
 * يحفظ النتيجة محلياً قبل إرسالها للسيرفر —
 * يضمن استمرارية البيانات إذا انقطع الاتصال.
 * @param {string|number} quizId
 * @param {Object}        payload
 */
function savePendingScore(quizId, payload) {
  try {
    localStorage.setItem(
      `${PENDING_SCORE_KEY_PREFIX}${quizId}`,
      JSON.stringify({ payload, timestamp: Date.now() }),
    );
  } catch (e) {
    handleError(e, { context: "savePendingScore", quizId, hideAlert: true });
  }
}

/**
 * يمسح النتيجة المعلّقة بعد تأكيد السيرفر.
 * @param {string|number} quizId
 */
function clearPendingScore(quizId) {
  try {
    localStorage.removeItem(`${PENDING_SCORE_KEY_PREFIX}${quizId}`);
  } catch (e) {
    handleError(e, { context: "clearPendingScore", quizId, hideAlert: true });
  }
}

// =============================================
//  التحقق من صحة بيانات الاختبار
// =============================================

/**
 * يتحقق شاملاً من سلامة بيانات الاختبار قبل أي عرض أو معالجة.
 * @param {Object} quizData
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateQuizData(quizData) {
  const errors = [];

  if (!quizData || typeof quizData !== "object") {
    return {
      valid: false,
      errors: ["بيانات الاختبار غير موجودة أو ذات تنسيق غير صالح."],
    };
  }

  if (!quizData.config || typeof quizData.config !== "object") {
    errors.push("حقل الإعداد (config) مفقود أو غير صالح.");
  } else {
    if (
      !quizData.config.title ||
      typeof quizData.config.title !== "string" ||
      !quizData.config.title.trim()
    ) {
      errors.push("عنوان الاختبار (config.title) مفقود أو فارغ.");
    }
    if (
      typeof quizData.config.timeLimit !== "number" ||
      quizData.config.timeLimit <= 0
    ) {
      errors.push(
        "مدة الاختبار (config.timeLimit) غير صالحة — يجب أن تكون رقماً موجباً.",
      );
    }
  }

  if (!Array.isArray(quizData.questions) || quizData.questions.length === 0) {
    errors.push("قائمة الأسئلة مفقودة أو فارغة.");
    return { valid: false, errors };
  }

  const seenQuestionIds = new Set();

  quizData.questions.forEach((q, idx) => {
    const prefix = `السؤال ${idx + 1}`;
    if (!q || typeof q !== "object") {
      errors.push(`${prefix}: بيانات السؤال غير صالحة.`);
      return;
    }

    if (q.id !== undefined && q.id !== null) {
      const strId = String(q.id);
      if (seenQuestionIds.has(strId))
        errors.push(`${prefix}: معرّف السؤال (${strId}) مكرر.`);
      else seenQuestionIds.add(strId);
    }

    if (!q.question || typeof q.question !== "string" || !q.question.trim()) {
      errors.push(`${prefix}: نص السؤال مفقود أو فارغ.`);
    }

    if (!Array.isArray(q.answerOptions) || q.answerOptions.length < 2) {
      errors.push(`${prefix}: يجب توفير خيارَين على الأقل ضمن answerOptions.`);
    } else {
      const correctOptions = q.answerOptions.filter(
        (o) => o?.isCorrect === true,
      );
      if (correctOptions.length === 0)
        errors.push(`${prefix}: لا يوجد خيار صحيح (isCorrect: true) محدد.`);
      else if (correctOptions.length > 1)
        errors.push(
          `${prefix}: تم تحديد ${correctOptions.length} إجابات صحيحة — يُسمح بواحدة فقط.`,
        );

      q.answerOptions.forEach((opt, oi) => {
        if (!opt || typeof opt !== "object")
          errors.push(`${prefix}، الخيار ${oi + 1}: بيانات الخيار غير صالحة.`);
        else if (!opt.text || typeof opt.text !== "string" || !opt.text.trim())
          errors.push(`${prefix}، الخيار ${oi + 1}: نص الخيار مفقود أو فارغ.`);
      });
    }
  });

  return { valid: errors.length === 0, errors };
}

// =============================================
//  إرسال النتيجة مع إعادة المحاولة التلقائية
// =============================================

/**
 * يُرسِل النتيجة للسيرفر مع Exponential Backoff.
 * @param {Object} payload
 * @param {number} [maxRetries=MAX_SCORE_RETRIES]
 * @param {number} [baseDelayMs=SCORE_RETRY_BASE_DELAY_MS]
 * @returns {Promise<Object>}
 */
async function submitScoreWithRetry(
  payload,
  maxRetries = MAX_SCORE_RETRIES,
  baseDelayMs = SCORE_RETRY_BASE_DELAY_MS,
) {
  try {
    await apiCall(
      "DELETE",
      `/api/attempts/progress/${payload.quizId}?deviceId=${getClientDeviceId()}`,
    );
  } catch (e) {
    handleError(e, { context: "cleanup progress", hideAlert: true });
  }

  return await withRetry(
    () => apiCall("POST", "/api/scores", payload),
    { context: "submitScoreWithRetry", payload, hideAlert: true },
    maxRetries,
    baseDelayMs
  );
}

/**
 * يعرض رسالة خطأ حفظ النتيجة مع زر إعادة محاولة يدوية.
 * @param {HTMLElement|null} errorEl      — عنصر عرض الخطأ
 * @param {number}           numericId    — معرّف الاختبار الرقمي
 * @param {Object}           scorePayload — بيانات النتيجة
 * @param {Function}         [onSuccess]  — callback يُستدعى بعد نجاح إعادة المحاولة
 */
function showScoreErrorWithRetry(errorEl, numericId, scorePayload, onSuccess) {
  if (!errorEl) return;
  errorEl.classList.remove("hidden");
  errorEl.innerHTML = "";

  const msgSpan = document.createElement("span");
  msgSpan.textContent = "⚠️ تعذّر حفظ نتيجتك على السيرفر. ";

  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.textContent = "إعادة المحاولة";
  retryBtn.className = "underline font-bold cursor-pointer ms-1";

  retryBtn.addEventListener("click", async () => {
    retryBtn.disabled = true;
    retryBtn.textContent = "جارٍ المحاولة...";
    try {
      const result = await submitScoreWithRetry(scorePayload);
      clearPendingScore(numericId);

      // تحديث الـ attemptsMap واستدعاء الـ callback عند النجاح
      if (result?.meta) updateAttemptsMap(numericId, result.meta);
      onSuccess?.(result);

      errorEl.textContent = "✅ تم حفظ نتيجتك بنجاح.";
      errorEl.classList.remove("text-red-700");
      errorEl.classList.add("text-green-700");
      setTimeout(() => errorEl.classList.add("hidden"), 4000);
    } catch (retryErr) {
      handleError(retryErr, { context: "manualRetryScore", numericId, hideAlert: true });
      msgSpan.textContent = "⚠️ فشلت إعادة المحاولة. يرجى التواصل مع المسؤول. ";
      retryBtn.disabled = false;
      retryBtn.textContent = "إعادة المحاولة";
    }
  });

  errorEl.appendChild(msgSpan);
  errorEl.appendChild(retryBtn);
}

// =============================================
//  ★ إدارة المحاولات — Attempt Tracking ★
// =============================================

/**
 * يجلب عدد المحاولات من السيرفر ويُعبِّئ state.attemptsMap.
 * يُستدعى بعد تسجيل الدخول وبعد كل تسليم ناجح.
 * @returns {Promise<void>}
 */
export async function loadAttemptsMap() {
  if (!state.currentUser) return;
  if (!state.attemptsMap) state.attemptsMap = {};

  try {
    const data = await apiCall("GET", "/api/scores/my/attempts");
    if (Array.isArray(data)) {
      data.forEach(({ quizId, attemptCount, hasOfficial }) => {
        state.attemptsMap[String(quizId)] = { attemptCount, hasOfficial };
      });
    }
    console.log(
      "[AttemptsMap] محُمِّل من السيرفر —",
      Object.keys(state.attemptsMap).length,
      "اختبار",
    );
  } catch (e) {
    handleError(e, { context: "loadAttemptsMap", hideAlert: true });
    // Fail-open: نحتفظ بأي بيانات موجودة محلياً
  }
}

/**
 * يُعيد بيانات المحاولات لاختبار معيّن من state.attemptsMap.
 * يعود بـ { attemptCount: 0, hasOfficial: false } إذا لم توجد محاولات.
 * @param {string|number|null} quizId
 * @returns {{ attemptCount: number, hasOfficial: boolean }}
 */
function getAttemptInfo(quizId) {
  if (!quizId) return { attemptCount: 0, hasOfficial: false };

  const key = String(quizId);

  // المصدر الأساسي: attemptsMap (مُحمَّل من السيرفر)
  if (state.attemptsMap?.[key]) return state.attemptsMap[key];

  // Fallback: عدّ النتائج الموجودة في serverScores
  if (Array.isArray(state.serverScores)) {
    const count = state.serverScores.filter(
      (s) => s.quizId && String(s.quizId) === key,
    ).length;
    if (count > 0) return { attemptCount: count, hasOfficial: true };
  }

  return { attemptCount: 0, hasOfficial: false };
}

/**
 * يُحدِّث state.attemptsMap بعد كل تسليم ناجح.
 * @param {string|number}         quizId
 * @param {{ isOfficial: boolean, attemptNumber: number }|null} meta — من رد السيرفر
 */
function updateAttemptsMap(quizId, meta) {
  if (!quizId) return;
  if (!state.attemptsMap) state.attemptsMap = {};

  const key = String(quizId);
  const current = state.attemptsMap[key] || {
    attemptCount: 0,
    hasOfficial: false,
  };

  state.attemptsMap[key] = {
    attemptCount: current.attemptCount + 1,
    hasOfficial: current.hasOfficial || meta?.isOfficial === true,
  };

  console.log(
    `[AttemptsMap] ✓ تحديث — quizId=${quizId}`,
    state.attemptsMap[key],
  );
}

// =============================================
//  ★ واجهة اللافتات — Attempt Banners ★
// =============================================

/**
 * يعرض لافتة توضيحية داخل شاشة الاختبار توضح طبيعة المحاولة.
 * تُدرَج بعد quiz-subtitle إن وُجد، وإلا تُدرَج في أعلى quiz-container.
 * @param {number}  attemptCount — عدد المحاولات السابقة (0 = المحاولة الأولى الحالية)
 */
function renderAttemptBanner(attemptCount) {
  const isOfficial = attemptCount === 0;
  const attemptNumber = attemptCount + 1;

  let bannerEl = document.getElementById("quiz-attempt-banner");
  if (!bannerEl) {
    bannerEl = document.createElement("div");
    bannerEl.id = "quiz-attempt-banner";

    // محاولة إدراج بعد subtitle، وإلا في أعلى quiz-container
    const subtitleEl = document.getElementById("quiz-subtitle");
    const containerEl = document.getElementById("quiz-container");
    if (subtitleEl?.parentNode) {
      subtitleEl.parentNode.insertBefore(bannerEl, subtitleEl.nextSibling);
    } else if (containerEl) {
      containerEl.prepend(bannerEl);
    }
  }

  bannerEl.className = isOfficial
    ? "rounded-xl p-3 my-3 text-sm text-center font-medium bg-blue-50 border border-blue-200 text-blue-800"
    : "rounded-xl p-3 my-3 text-sm text-center font-medium bg-amber-50 border border-amber-200 text-amber-800";

  bannerEl.textContent = isOfficial
    ? "⭐ هذه محاولتك الأولى — ستُحتسب في لوحة الشرف تلقائياً"
    : `📝 محاولة تدريبية رقم ${attemptNumber} — لن تُحتسب في لوحة الشرف. (فقط المحاولة الأولى تُحتسب)`;

  bannerEl.classList.remove("hidden");
}

/**
 * يعرض نتيجة المحاولة في شاشة النتائج مع توضيح الطبيعة الرسمية أو التدريبية.
 * يُدرَج في أعلى results-screen.
 * @param {{ isOfficial: boolean, attemptNumber: number }} meta
 */
function renderResultsAttemptInfo(meta) {
  const isOfficial = meta?.isOfficial ?? true;
  const attemptNumber = meta?.attemptNumber ?? 1;

  let infoEl = document.getElementById("results-attempt-info");
  if (!infoEl) {
    infoEl = document.createElement("div");
    infoEl.id = "results-attempt-info";

    const resultsScreen = document.getElementById("results-screen");
    if (resultsScreen) resultsScreen.prepend(infoEl);
  }

  infoEl.className = isOfficial
    ? "rounded-xl p-4 mb-4 text-center font-semibold text-sm bg-green-50 border border-green-200 text-green-800"
    : "rounded-xl p-4 mb-4 text-center font-semibold text-sm bg-gray-50 border border-gray-200 text-gray-600";

  infoEl.textContent = isOfficial
    ? "✅ نتيجتك الرسمية — تم احتسابها في لوحة الشرف"
    : `📝 محاولة تدريبية رقم ${attemptNumber} — لم تُحتسب في لوحة الشرف`;

  infoEl.classList.remove("hidden");
}

// =============================================
//  عناصر DOM
// =============================================

/** @type {HTMLElement|null} */ let questionTextEl = null;
/** @type {HTMLElement|null} */ let questionHintEl = null;
/** @type {HTMLElement|null} */ let optionsContainerEl = null;
/** @type {HTMLElement|null} */ let currentQuestionNumberEl = null;
/** @type {HTMLElement|null} */ let totalQuestionsEl = null;
/** @type {HTMLElement|null} */ let scoreDisplayEl = null;
/** @type {HTMLElement|null} */ let timerDisplayEl = null;
/** @type {HTMLElement|null} */ let progressBarEl = null;
/** @type {HTMLElement|null} */ let feedbackBoxEl = null;
/** @type {HTMLElement|null} */ let feedbackMessageEl = null;
/** @type {HTMLElement|null} */ let rationaleTextEl = null;
/** @type {HTMLElement|null} */ let nextButton = null;
/** @type {HTMLElement|null} */ let previousButton = null;
/** @type {HTMLElement|null} */ let submitButton = null;

/**
 * تهيئة عناصر DOM الخاصة بالاختبار.
 */
export function initQuizDOM() {
  logFunctionStatus("initQuizDOM", false);
  questionTextEl = document.getElementById("question-text");
  questionHintEl = document.getElementById("question-hint");
  optionsContainerEl = document.getElementById("options-container");
  currentQuestionNumberEl = document.getElementById("current-question-number");
  totalQuestionsEl = document.getElementById("total-questions");
  scoreDisplayEl = document.getElementById("score-display");
  timerDisplayEl = document.getElementById("timer-display");
  progressBarEl = document.getElementById("progress-bar");
  feedbackBoxEl = document.getElementById("feedback-box");
  feedbackMessageEl = document.getElementById("feedback-message");
  rationaleTextEl = document.getElementById("rationale-text");
  nextButton = document.getElementById("next-btn");
  previousButton = document.getElementById("previous-btn");
  submitButton = document.getElementById("submit-btn");
}

// =============================================
//  ★ playQuiz — يدعم إعادة المحاولة ★
// =============================================

/**
 * بدء اختبار من القائمة.
 * يتحقق من عدد المحاولات السابقة ويعرض لافتة توضيحية دون حجب إعادة المحاولة.
 * @param {number} index — فهرس الاختبار في allQuizzes
 */
export async function playQuiz(index) {
  logFunctionStatus("playQuiz", false);

  // 1. التحقق من صحة البيانات
  const quizData = state.allQuizzes[index];
  const { valid, errors } = validateQuizData(quizData);
  if (!valid) {
    const errorSummary = errors.slice(0, 5).join("\n• ");
    handleError(new Error("بيانات الاختبار غير صالحة"), { context: "playQuiz — validateQuizData", index, errors, hideAlert: true });
    showAlert(
      `❌ لا يمكن تشغيل الاختبار — بيانات غير صالحة:\n• ${errorSummary}${errors.length > 5 ? `\n(و ${errors.length - 5} أخطاء أخرى)` : ""}`,
      "error",
    );
    return;
  }

  state.currentQuizData = quizData;

  // 2. استخراج المعرّف
  const quizId = getQuizId(state.currentQuizData);
  console.log(
    `[playQuiz] بدء الامتحان — index: ${index}, ID: ${quizId}, العنوان: "${state.currentQuizData.config.title}", أسئلة: ${state.currentQuizData.questions.length}`,
  );

  // 3. تحديد طبيعة المحاولة (رسمية أم تدريبية) بدلاً من حجبها
  const { attemptCount, hasOfficial } = getAttemptInfo(quizId);
  const isOfficialAttempt = attemptCount === 0; // الأولى فقط رسمية

  // حفظ طبيعة المحاولة في state ليستخدمها submitQuiz كاحتياط
  state.currentAttemptIsOfficial = isOfficialAttempt;

  console.log(
    `[playQuiz] المحاولة رقم ${attemptCount + 1} — ${isOfficialAttempt ? "رسمية ⭐" : "تدريبية 📝"}`,
  );

  // 4. تصفير العدادات
  state.totalQuestions = state.currentQuizData.questions.length;
  state.currentQuestionIndex = 0;
  state.score = 0;
  state.streak = 0;
  state.userAnswers = new Array(state.totalQuestions).fill(null);
  state.timeRemaining = state.currentQuizData.config.timeLimit;
  state.quizStarted = false;

  // Reset button from review mode
  const submitBtn = document.getElementById("submit-btn");
  if (submitBtn) {
    submitBtn.textContent = "تسليم الاختبار";
    submitBtn.onclick =
      window.submitQuiz ||
      function () {
        submitQuiz();
      };
  }

  state.lastSubmitMeta = null;

  // 5. إدارة الواجهة
  closeBottomSheet();
  closeAdminSheet();

  document.getElementById("dashboard-view").classList.add("hidden");
  document.getElementById("quiz-main-title").innerText =
    state.currentQuizData.config.title;

  const subtitleEl = document.getElementById("quiz-subtitle");
  const timeInMinutes = Math.max(
    1,
    Math.round((state.currentQuizData.config.timeLimit || 0) / 60),
  );
  subtitleEl.textContent = `${state.currentQuizData.config.description || "اختبار تفاعلي"} (${state.totalQuestions} سؤالاً في ${timeInMinutes} دقيقة)`;
  timerDisplayEl.textContent = formatTime(state.timeRemaining);

  document.getElementById("results-screen").classList.add("hidden");
  document.getElementById("quiz-container").classList.remove("hidden");
  _showThemeToggle(false);

  // 6. عرض لافتة المحاولة — توضيح قبل البدء
  renderAttemptBanner(attemptCount);

  // 7. استعادة التقدم إن وجد
  try {
    const progressObj = await withRetry(
      () => apiCall(
        "GET",
        `/api/attempts/progress/${quizId}?deviceId=${getClientDeviceId()}`
      ),
      { context: "get progress on playQuiz" }
    );
    if (
      progressObj &&
      progressObj.timeRemaining !== null &&
      progressObj.answers &&
      progressObj.answers.length > 0
    ) {
      console.log("Restoring progress", progressObj);

      // Validate length matches
      if (progressObj.answers.length === state.totalQuestions) {
        state.userAnswers = progressObj.answers;
        state.timeRemaining = progressObj.timeRemaining;
        state.currentQuestionIndex = progressObj.currentQuestionIndex || 0;
      }
    }
  } catch (e) {
    handleError(e, { context: "Failed to load progress", hideAlert: true });
  }

  // 8. بدء الاختبار
  initializeQuiz();
}

// =============================================
//  تهيئة الاختبار وعرض الأسئلة (unchanged)
// =============================================

export function initializeQuiz() {
  logFunctionStatus("initializeQuiz", false);
  totalQuestionsEl.textContent = state.totalQuestions;

  if (state.totalQuestions > 0) {
    renderQuestion();
    startTimer();
    state.quizStarted = true;

    // إخفاء الشريط السفلي أثناء الاختبار
    const dockBar = document.getElementById("ios-bottom-nav");
    if (dockBar) dockBar.classList.add("hidden"); // ✅ add وليس remove

    addQuizExitButton();
  }
}

function addQuizExitButton() {
  // إزالة الزر إن وُجد مسبقاً
  const existing = document.getElementById("quiz-exit-btn");
  if (existing) existing.remove();

  const btn = document.createElement("button");
  btn.id = "quiz-exit-btn";
  btn.textContent = "خروج";
  // Position fixed to screen edge on mobile to avoid overlapping quiz card
  btn.className =
    "fixed top-2 left-2 sm:top-6 sm:left-6 z-50 px-4 py-2 bg-red-600 text-white rounded-xl font-bold shadow-lg text-sm sm:text-base";

  btn.onclick = () => {
    showCustomExitModal();
  };

  // Attach to body relative to viewport instead of quiz-container so it stays strictly fixed outside the card on mobile
  document.body.appendChild(btn);
}

function showCustomExitModal() {
  // منع التكرار
  if (document.getElementById("quiz-exit-modal")) return;

  const modal = document.createElement("div");
  modal.id = "quiz-exit-modal";
  modal.className = "fixed inset-0 flex items-center justify-center z-50";
  const card = document.createElement("div");
  card.className =
    "rounded-2xl shadow-2xl p-8 max-w-[90vw] min-w-[320px] text-center bg-slate-900/70 border border-white/20";

  const message = document.createElement("div");
  message.className = "text-white text-lg font-bold mb-6 leading-8";
  message.textContent = "هل أنت متأكد أنك تريد الخروج من الاختبار؟";

  const warn = document.createElement("span");
  warn.className = "block text-sm text-orange-300 mt-2";
  warn.textContent = "سيتم فقدان التقدم الحالي.";
  message.appendChild(warn);

  const actions = document.createElement("div");
  actions.className = "flex gap-4 justify-center";

  const cancelBtn = document.createElement("button");
  cancelBtn.id = "exit-cancel-btn";
  cancelBtn.type = "button";
  cancelBtn.className =
    "px-8 py-3 bg-white text-slate-900 rounded-xl font-bold shadow";
  cancelBtn.textContent = "إلغاء";

  const okBtn = document.createElement("button");
  okBtn.id = "exit-ok-btn";
  okBtn.type = "button";
  okBtn.className =
    "px-8 py-3 bg-rose-600 text-white rounded-xl font-bold shadow hover:bg-rose-700 transition";
  okBtn.textContent = "خروج";

  actions.appendChild(cancelBtn);
  actions.appendChild(okBtn);
  card.appendChild(message);
  card.appendChild(actions);
  modal.appendChild(card);

  document.body.appendChild(modal);

  document.getElementById("exit-cancel-btn").addEventListener("click", () => {
    modal.remove();
  });

  document.getElementById("exit-ok-btn").addEventListener("click", async () => {
    const exitBtn = document.getElementById("exit-ok-btn");
    exitBtn.textContent = "جارٍ الحفظ...";
    exitBtn.disabled = true;

    try {
      const quizId = getQuizId(state.currentQuizData);
      if (quizId) {
        await apiCall("POST", "/api/attempts/progress", {
          quizId: String(quizId),
          answers: state.userAnswers,
          timeRemaining: state.timeRemaining,
          currentQuestionIndex: state.currentQuestionIndex,
          deviceId: getClientDeviceId(),
        });
      }
    } catch (e) {
      handleError(e, { context: "Failed to save progress", hideAlert: true });
    }

    modal.remove();
    clearInterval(state.timerInterval); // ✅ إيقاف التايمر عند الخروج
    state.quizStarted = false;

    document.getElementById("quiz-container").classList.add("hidden");
    document.getElementById("dashboard-view").classList.remove("hidden");

    const dockBar = document.getElementById("ios-bottom-nav");
    if (dockBar) dockBar.classList.remove("hidden");

    const outBtn = document.getElementById("quiz-exit-btn");
    if (outBtn) outBtn.remove();

    _showThemeToggle(true);
  });
}

export function renderQuestion() {
  logFunctionStatus("renderQuestion", false);
  const currentQ = state.currentQuizData.questions[state.currentQuestionIndex];

  currentQuestionNumberEl.textContent = state.currentQuestionIndex + 1;
  questionTextEl.innerHTML = `<span class="quiz-question-gradient">${state.currentQuestionIndex + 1}. ${sanitizeHTML(currentQ.question)}</span>`;
  const safeHint = sanitizeHTML(currentQ.hint || "").trim();
  if (safeHint) {
    questionHintEl.innerHTML = `<span class="font-bold">تلميح:</span> ${safeHint}`;
    questionHintEl.classList.remove("hidden");
  } else {
    questionHintEl.textContent = "";
    questionHintEl.classList.add("hidden");
  }

  previousButton.disabled =
    state.currentQuestionIndex === 0 || !state.quizStarted;

  if (state.currentQuestionIndex === state.totalQuestions - 1) {
    nextButton.classList.add("hidden");
    submitButton.classList.remove("hidden");
  } else {
    nextButton.classList.remove("hidden");
    submitButton.classList.add("hidden");
  }

  updateProgressBar();
  optionsContainerEl.innerHTML = "";

  currentQ.answerOptions.forEach((option, index) => {
    const optionEl = document.createElement("div");
    optionEl.className =
      "answer-option p-4 border-2 border-gray-300 rounded-xl cursor-pointer transition duration-300 shadow-sm text-gray-800 font-medium text-arabic";
    optionEl.textContent = option.text;
    optionEl.setAttribute("data-index", index);
    optionEl.onclick = () => selectAnswer(index);
    optionsContainerEl.appendChild(optionEl);

    if (state.userAnswers[state.currentQuestionIndex] !== null) {
      const { selectedIndex } = state.userAnswers[state.currentQuestionIndex];
      // disableOptions();
      if (index === selectedIndex) {
        optionEl.classList.add("selected");
        optionEl.style.borderColor = "#10b981";
        optionEl.style.backgroundColor = "rgba(16, 185, 129, 0.2)";
        optionEl.style.color = "#10b981";
        optionEl.style.fontWeight = "bold";
      }
    }
  });

  // Feedback disabled in normal running

  nextButton.disabled = state.userAnswers[state.currentQuestionIndex] === null;
  hideFeedback();
}

export function selectAnswer(selectedIndex) {
  logFunctionStatus("selectAnswer", false);

  const currentQ = state.currentQuizData.questions[state.currentQuestionIndex];
  const isCorrect = currentQ.answerOptions[selectedIndex].isCorrect;

  // Save answer silently (overwrite previous if any)
  state.userAnswers[state.currentQuestionIndex] = {
    selectedIndex,
    isCorrect,
    rationale: "",
    feedbackMessage: "",
  };

  // Recalculate score from all answers
  state.score = state.userAnswers.reduce((total, answer) => {
    return total + (answer && answer.isCorrect ? 1 : 0);
  }, 0);

  // Only mark visually as selected, without correct/incorrect colors
  Array.from(optionsContainerEl.children).forEach((el) => {
    const index = parseInt(el.getAttribute("data-index"));
    el.classList.remove("selected");
    // Clear previous styles inline
    el.style.borderColor = "";
    el.style.backgroundColor = "";
    el.style.color = "";
    el.style.fontWeight = "";

    if (index === selectedIndex) {
      el.classList.add("selected");
      el.style.borderColor = "#10b981"; /* Tailwind emerald-500 */
      el.style.backgroundColor =
        "rgba(16, 185, 129, 0.2)"; /* transparent emerald for dark/light mode */
      el.style.color = "#10b981";
      el.style.fontWeight = "bold";
    }
  });

  nextButton.disabled = false;
  // Auto proceed after short delay (optional, let's just let user click next)
}

export function showFeedback(isCorrect, rationale, message) {
  logFunctionStatus("showFeedback", false);
  const safeMessage = escapeHtml(
    message || (isCorrect ? "إجابة صحيحة." : "إجابة غير صحيحة."),
  );
  const safeRationale = escapeHtml(
    rationale || "لا يوجد تبرير متاح لهذا الخيار.",
  );

  feedbackMessageEl.textContent = safeMessage;
  rationaleTextEl.textContent = `التبرير: ${safeRationale}`;

  feedbackBoxEl.classList.remove("scale-y-0", "h-0", "opacity-0");
  feedbackBoxEl.classList.add("scale-y-100", "h-auto", "opacity-100", "p-4");

  if (isCorrect) {
    feedbackBoxEl.classList.replace("incorrect-bg", "correct-bg") ||
      feedbackBoxEl.classList.add("correct-bg");
    feedbackMessageEl.classList.replace("text-red-900", "text-white") ||
      feedbackMessageEl.classList.add("text-white");
    rationaleTextEl.classList.replace("text-red-900", "text-white") ||
      rationaleTextEl.classList.add("text-white");
  } else {
    feedbackBoxEl.classList.replace("correct-bg", "incorrect-bg") ||
      feedbackBoxEl.classList.add("incorrect-bg");
    feedbackMessageEl.classList.replace("text-white", "text-red-900") ||
      feedbackMessageEl.classList.add("text-red-900");
    rationaleTextEl.classList.replace("text-white", "text-red-900") ||
      rationaleTextEl.classList.add("text-red-900");
  }
}

export function hideFeedback() {
  logFunctionStatus("hideFeedback", false);
  feedbackBoxEl.classList.add("scale-y-0", "h-0", "opacity-0");
  feedbackBoxEl.classList.remove(
    "scale-y-100",
    "h-auto",
    "opacity-100",
    "p-4",
    "correct-bg",
    "incorrect-bg",
  );
}

export function disableOptions() {
  logFunctionStatus("disableOptions", false);
  Array.from(optionsContainerEl.children).forEach((el) => (el.onclick = null));
}

export function goToNextQuestion() {
  logFunctionStatus("goToNextQuestion", false);
  if (state.currentQuestionIndex < state.totalQuestions - 1) {
    state.currentQuestionIndex++;
    renderQuestion();
  }
}

export function goToPreviousQuestion() {
  logFunctionStatus("goToPreviousQuestion", false);
  if (state.currentQuestionIndex > 0) {
    state.currentQuestionIndex--;
    renderQuestion();
  }
}

export function updateProgressBar() {
  logFunctionStatus("updateProgressBar", false);
  const progress =
    state.totalQuestions > 0
      ? ((state.currentQuestionIndex + 1) / state.totalQuestions) * 100
      : 0;
  progressBarEl.style.width = `${progress}%`;
}

export function startTimer() {
  logFunctionStatus("startTimer", false);
  if (state.timerInterval) clearInterval(state.timerInterval);
  if (timerDisplayEl)
    timerDisplayEl.classList.remove(
      "text-orange-500",
      "text-red-600",
      "animate-pulse",
    );

  state.timerStartTime = Date.now();
  state.timerTotalSeconds = state.timeRemaining;

  state.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.timerStartTime) / 1000);
    state.timeRemaining = Math.max(0, state.timerTotalSeconds - elapsed);
    timerDisplayEl.textContent = formatTime(state.timeRemaining);

    if (state.timeRemaining <= 60) {
      timerDisplayEl.classList.remove("text-orange-500");
      timerDisplayEl.classList.add("text-red-600", "animate-pulse");
    } else if (state.timeRemaining <= 300) {
      timerDisplayEl.classList.remove("text-red-600");
      timerDisplayEl.classList.add("text-orange-500", "animate-pulse");
    }

    if (state.timeRemaining <= 0) {
      clearInterval(state.timerInterval);
      timerDisplayEl.textContent = "انتهى الوقت!";
      submitQuiz();
    }
  }, 1000);
}

// =============================================
//  ★ submitQuiz — يدعم المحاولات المتعددة ★
// =============================================

/**
 * تسليم الاختبار — يقبل محاولات غير محدودة.
 * • المحاولة الأولى: السيرفر يحفظها كرسمية (isOfficial = true) وتُحسب في لوحة الشرف.
 * • المحاولات التالية: السيرفر يحفظها كتدريبية (isOfficial = false).
 * • يحدِّث state.attemptsMap بعد كل تسليم ناجح.
 * • محمي من التسليم المزدوج في نفس التبويب عبر _isSubmitting فقط.
 */
let _isSubmitting = false;
export async function submitQuiz() {
  logFunctionStatus("submitQuiz", true);

  // الحماية الوحيدة المتبقية: منع Race Condition داخل نفس التبويب
  if (_isSubmitting) return;
  _isSubmitting = true;

  try {
    if (state.timeRemaining > 0) {
      const confirmed = await showConfirm(
        "إنهاء الاختبار",
        "هل أنت متأكد؟ لا يمكنك العودة بعد التسليم.",
        "⏱️",
      );
      if (!confirmed) {
        _isSubmitting = false;
        return;
      }
    }
    clearInterval(state.timerInterval);

    const quizId = getQuizId(state.currentQuizData);
    const numericId = Number(quizId);

    // حفظ النتيجة محلياً (للعرض في لوحة التحكم بدون reload)
    if (state.currentUser) {
      state.allUserScores.push({
        userName: state.currentUser.fullName,
        quizTitle: state.currentQuizData.config.title,
        score: state.score,
        total: state.totalQuestions,
        date: new Date().toLocaleDateString("ar-EG"),
      });
    }

    // إرسال النتيجة للسيرفر — السيرفر يحدد isOfficial تلقائياً
    if (
      state.currentUser &&
      quizId &&
      Number.isFinite(numericId) &&
      numericId > 0
    ) {
      const scorePayload = {
        quizId: numericId,
        answers: state.userAnswers.map((a, i) => ({
          questionId: state.currentQuizData.questions[i]?.id ?? i,
          selectedIndex: a ? a.selectedIndex : -1,
        })),
        timeTaken: state.currentQuizData.config.timeLimit - state.timeRemaining,
      };

      console.log(
        `[submitScore] إرسال — quizId: ${quizId}, نتيجة: ${state.score}/${state.totalQuestions}, isOfficial: ${state.currentAttemptIsOfficial}`,
      );
      savePendingScore(numericId, scorePayload);

      try {
        const scoreResult = await submitScoreWithRetry(scorePayload);
        clearPendingScore(numericId);

        // قراءة meta من رد السيرفر
        const meta = scoreResult.meta || {
          isOfficial: state.currentAttemptIsOfficial ?? true,
          attemptNumber: getAttemptInfo(quizId).attemptCount + 1,
        };

        // تحديث عداد المحاولات محلياً
        updateAttemptsMap(quizId, meta);

        // حفظ meta لعرضها في شاشة النتائج
        state.lastSubmitMeta = meta;

        console.log(
          `[submitScore] ✓ تم — محاولة رقم ${meta.attemptNumber}, ${meta.isOfficial ? "رسمية ⭐" : "تدريبية 📝"}`,
        );
      } catch (e) {
        handleError(e, { context: "submitQuiz — submitScoreWithRetry", quizId, numericId, hideAlert: true });
        const saveErrEl = document.getElementById("save-score-error");
        showScoreErrorWithRetry(
          saveErrEl,
          numericId,
          scorePayload,
          (result) => {
            if (result?.meta) {
              updateAttemptsMap(quizId, result.meta);
              state.lastSubmitMeta = result.meta;
              // تحديث لافتة النتائج بعد نجاح إعادة المحاولة
              renderResultsAttemptInfo(result.meta);
            }
          },
        );
      }
    } else {
      console.warn(
        `[submitScore] ⚠️ معرّف غير صالح (${quizId}) — النتيجة محلية فقط`,
      );
    }

    // ========================
    //  عرض شاشة النتائج
    // ========================
    document.getElementById("quiz-container").classList.add("hidden");
    document.getElementById("results-screen").classList.remove("hidden");

    // Show result modal
    if (window.Swal) {
      Swal.fire({
        title: "انتهى الاختبار!",
        html: `لقد حصلت على <b>${state.score}</b> من <b>${state.totalQuestions}</b>`,
        icon: "success",
        confirmButtonText: "مراجعة الإجابات",
        confirmButtonColor: "#007bff",
        allowOutsideClick: false,
      });
    }

    const percentage = (state.score / state.totalQuestions) * 100;
    document.getElementById("final-score").textContent = state.score;
    document.getElementById("final-total").textContent = state.totalQuestions;
    document.getElementById("custom-closing-text").textContent =
      state.currentQuizData.config.closingMessage || "شكراً لمشاركتك!";

    let finalMessage = "ما شاء الله تبارك الرحمن! نتائجك مُبهرة.";
    if (percentage < 50)
      finalMessage = "هون عليك! لكل جواد كبوة، والتعلم رحلة مستمرة.";
    else if (percentage < 75) finalMessage = "مستوى جيد جداً! لديك أساس متين.";
    else if (percentage < 90) finalMessage = "ممتاز يا بطل! أداؤك قوي.";
    document.getElementById("final-message").textContent = finalMessage;

    // عرض لافتة الطبيعة الرسمية / التدريبية في النتائج
    renderResultsAttemptInfo(
      state.lastSubmitMeta || {
        isOfficial: state.currentAttemptIsOfficial ?? true,
        attemptNumber: getAttemptInfo(quizId).attemptCount, // بعد التحديث
      },
    );
  } catch (unexpectedError) {
    handleError(unexpectedError, { context: "submitQuiz — unexpected" });
  } finally {
    _isSubmitting = false;
  }
}

// =============================================
//  العودة للصفحة الرئيسية
// =============================================

/**
 * العودة إلى لوحة التحكم من شاشة النتائج.
 * يُخفي لافتات المحاولة قبل الخروج.
 * @param {Function} renderDashboard
 */
export function exitToMain(renderDashboard) {
  // إخفاء لافتات المحاولة
  const attemptBanner = document.getElementById("quiz-attempt-banner");
  if (attemptBanner) attemptBanner.classList.add("hidden");

  const resultsInfo = document.getElementById("results-attempt-info");
  if (resultsInfo) resultsInfo.classList.add("hidden");

  document.getElementById("results-screen").classList.add("hidden");
  document.getElementById("quiz-container").classList.add("hidden");
  document.getElementById("dashboard-view").classList.remove("hidden");
  renderDashboard();
  _showThemeToggle(true);
}

window.reviewQuiz = function () {
  state.isReviewMode = true;

  document.getElementById("results-screen").classList.add("hidden");
  document.getElementById("quiz-container").classList.remove("hidden");

  // Hide timer
  const timerDisplayEl = document.getElementById("timer-display");
  if (timerDisplayEl) timerDisplayEl.classList.add("hidden");

  // Disable submit
  const submitBtn = document.getElementById("submit-btn");
  if (submitBtn) {
    submitBtn.textContent = "إنهاء المراجعة";
    submitBtn.onclick = () => window.exitToMain();
  }

  state.currentQuestionIndex = 0;
  renderReviewQuestion();
};

function renderReviewQuestion() {
  const currentQ = state.currentQuizData.questions[state.currentQuestionIndex];
  document.getElementById("current-question-number").textContent =
    state.currentQuestionIndex + 1;
  document.getElementById("question-text").innerHTML =
    `<span class="quiz-question-gradient">${state.currentQuestionIndex + 1}. ${sanitizeHTML(currentQ.question)}</span>`;
  const hintEl = document.getElementById("question-hint");
  if (currentQ.hint) {
    hintEl.innerHTML = `<span class="font-bold">تلميح:</span> ${sanitizeHTML(currentQ.hint)}`;
    hintEl.classList.remove("hidden");
  } else {
    hintEl.classList.add("hidden");
  }

  const previousBtn = document.getElementById("previous-btn");
  const nextBtn = document.getElementById("next-btn");
  const submitBtn = document.getElementById("submit-btn");

  previousBtn.disabled = state.currentQuestionIndex === 0;

  if (state.currentQuestionIndex === state.totalQuestions - 1) {
    nextBtn.classList.add("hidden");
    submitBtn.classList.remove("hidden");
  } else {
    nextBtn.classList.remove("hidden");
    submitBtn.classList.add("hidden");
  }

  // Set next and previous cleanly for review mode
  nextBtn.onclick = () => {
    if (state.currentQuestionIndex < state.totalQuestions - 1) {
      state.currentQuestionIndex++;
      renderReviewQuestion();
    }
  };

  previousBtn.onclick = () => {
    if (state.currentQuestionIndex > 0) {
      state.currentQuestionIndex--;
      renderReviewQuestion();
    }
  };

  // ensure it is enabled in review
  nextBtn.disabled = false;

  const optContainer = document.getElementById("options-container");
  optContainer.innerHTML = "";

  const ans = state.userAnswers[state.currentQuestionIndex];
  const selectedIdx = ans ? ans.selectedIndex : -1;

  currentQ.answerOptions.forEach((option, index) => {
    const optionEl = document.createElement("div");
    optionEl.className =
      "answer-option p-4 border-2 border-gray-300 rounded-xl m-1 font-medium text-arabic";
    optionEl.textContent = option.text;

    // No clicking in review mode
    optionEl.onclick = null;

    if (option.isCorrect) {
      optionEl.classList.add("correct-answer");
      optionEl.style.backgroundColor = "#d4edda";
      optionEl.style.borderColor = "#28a745";
    }

    if (index === selectedIdx && !option.isCorrect) {
      optionEl.classList.add("incorrect-answer");
      optionEl.style.backgroundColor = "#f8d7da";
      optionEl.style.borderColor = "#dc3545";
    }

    optContainer.appendChild(optionEl);
  });
}
