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
import state from './state.js';
import { escapeHtml, showAlert, showConfirm, formatTime, showToastMessage, pickRandom, logFunctionStatus } from './helpers.js';
import { apiCall } from './api.js';
import { _showThemeToggle, closeBottomSheet, closeAdminSheet } from './navigation.js';

// =============================================
//  ثوابت النظام
// =============================================

/**
 * مفتاح localStorage لحفظ النتائج المعلّقة حتى تأكيد السيرفر.
 * ملاحظة: حُذف SUBMISSION_KEY_PREFIX — لم تعد هناك حاجة لمنع إعادة المحاولة.
 */
const PENDING_SCORE_KEY_PREFIX = 'quiz_pending_score_';
/** الحد الأقصى لمحاولات إرسال النتيجة تلقائياً */
const MAX_SCORE_RETRIES = 3;
/** التأخير الأساسي بالمللي ثانية — يتضاعف مع كل محاولة (Exponential Backoff) */
const SCORE_RETRY_BASE_DELAY_MS = 1500;

// =============================================
//  رسائل التشجيع والتعزيز
// =============================================

/** @type {string[]} رسائل تشجيعية عند الإجابة الصحيحة */
const toastPraise = [
    'أحسنت بارك الله فيك 🌹', 'نعم العلم ونعم المتعلم 🌒', 'نعم العبد 🎉', 'نعم الفتى 👌',
    'الله أكبر عليك إيه الحلاوة دي 🌟', 'أصبت كبد الحقيقة! 🎯', 'فتح الله عليك فتوح العارفين 🤲',
    'لله درُّك من نبيهٍ أريب! 👑', 'نور على نور، زادك الله علماً 💡', 'هذا الشبل من ذاك الأسد 🦁',
    'إيه الدماغ الألماظ دي! 💎', 'أستاذ ورئيس قسم 🎓', 'يا سيدي على الدماغ العالية والروقان 🧠',
    'عداك العيب وقزح 🚀', 'معلم وابن معلم، جبت التايهة! 😎'
];

/** @type {string[]} رسائل عند الإجابة الخاطئة */
const toastOops = [
    'راجع العلم ✔️', 'لا يفل الحديد إلا الحديد ⚔️', 'وما أصابك من سيئة فمن نفسك 😔',
    'لكل صارم هفوة 🗡️', 'لكل جواد كبوة 🎠', 'لكل عالم زلة 📕', 'جلّ من لا يسهو ☝️',
    'من الخطأ يولد الصواب ✔️', 'قد يُخطئ السهم الهدف، فارمِ من جديد 🏹',
    'المحاولة شرف، والخطأ طريق التعلم 🛤️', 'ليس كل ما يلمع ذهباً، راجع إجابتك 🔍',
    'جليت منك المرة دي يا بطل 😂', 'شكلنا محتاجين كوباية شاي ونركز من تاني ☕',
    'إنت جبت الكلام ده منين يا غالي؟ 🤦‍♂️', 'ولا يهمك، الشاطر بيقع ويقوم 💪',
    'خانتك التعبيرات المرة دي، جرب تاني 😅'
];

/** @type {Object<number, string[]>} رسائل السلاسل المتتالية */
const streakToasts = {
    2: ['شكلك فاهم يا نصة 😂'],
    3: ['بدا أنك درعمي أصيل 👌'],
    4: ['ماشاء الله نفع الله بك الأمة ♥️'],
    5: [
        'بلغ السيل الزبى 🔥', 'إنت واكل إيه النهاردة؟ الدماغ دي متكلفة! 🧠🔥',
        'لا إحنا نقفل اللعبة على كده بقى، مفيش بعد كده! 🎮😎',
        'قطر وماشي مفيش حاجة قادرة توقفه، ما شاء الله! 🚂💨',
        'خمسة وخميسة في عين الحسود، إيه الحلاوة دي كلها! 🧿✨',
        'براحة علينا شوية، إنت كده معدي السحاب! ☁️🚀',
        'سيلٌ من الإبداع لا ينقطع، زادك الله من فضله! 🌊',
        'كالغيْث أينما وقع نفع، إجاباتك كلها صائبة! 🌧️',
        'سلسلة من الانتصارات المتتالية، لله درّ عقلك! ⛓️💡',
        'ما زلت تبرهن أنك فارس هذا الميدان بلا منازع! 🏇',
        'نور على نور، وتألق يتبعه تألق، استمر! 🌟', 'ضرب نار مستمر! 🔥',
        'أداء أسطوري لا يُقهر! 🐉', 'السلسلة مستمرة.. إياك أن تتوقف! 🔄'
    ]
};

// =============================================
//  مسجّل الأخطاء المركزي
// =============================================

/**
 * تسجيل أخطاء الوحدة مركزياً مع السياق الكامل.
 * @param {string}       context — الدالة أو الموضع الذي حدث فيه الخطأ
 * @param {Error|string} error   — كائن الخطأ أو رسالته
 * @param {Object}       [extra={}] — بيانات سياقية إضافية
 */
function logQuizError(context, error, extra = {}) {
    const message = error instanceof Error ? error.message : String(error);
    const stack   = error instanceof Error ? error.stack   : undefined;
    console.error(`[QuizModule][${context}]`, message, { ...extra, ...(stack ? { stack } : {}) });
}

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
            JSON.stringify({ payload, timestamp: Date.now() })
        );
    } catch (e) {
        logQuizError('savePendingScore', e, { quizId });
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
        logQuizError('clearPendingScore', e, { quizId });
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

    if (!quizData || typeof quizData !== 'object') {
        return { valid: false, errors: ['بيانات الاختبار غير موجودة أو ذات تنسيق غير صالح.'] };
    }

    if (!quizData.config || typeof quizData.config !== 'object') {
        errors.push('حقل الإعداد (config) مفقود أو غير صالح.');
    } else {
        if (!quizData.config.title || typeof quizData.config.title !== 'string' || !quizData.config.title.trim()) {
            errors.push('عنوان الاختبار (config.title) مفقود أو فارغ.');
        }
        if (typeof quizData.config.timeLimit !== 'number' || quizData.config.timeLimit <= 0) {
            errors.push('مدة الاختبار (config.timeLimit) غير صالحة — يجب أن تكون رقماً موجباً.');
        }
    }

    if (!Array.isArray(quizData.questions) || quizData.questions.length === 0) {
        errors.push('قائمة الأسئلة مفقودة أو فارغة.');
        return { valid: false, errors };
    }

    const seenQuestionIds = new Set();

    quizData.questions.forEach((q, idx) => {
        const prefix = `السؤال ${idx + 1}`;
        if (!q || typeof q !== 'object') { errors.push(`${prefix}: بيانات السؤال غير صالحة.`); return; }

        if (q.id !== undefined && q.id !== null) {
            const strId = String(q.id);
            if (seenQuestionIds.has(strId)) errors.push(`${prefix}: معرّف السؤال (${strId}) مكرر.`);
            else seenQuestionIds.add(strId);
        }

        if (!q.question || typeof q.question !== 'string' || !q.question.trim()) {
            errors.push(`${prefix}: نص السؤال مفقود أو فارغ.`);
        }

        if (!Array.isArray(q.answerOptions) || q.answerOptions.length < 2) {
            errors.push(`${prefix}: يجب توفير خيارَين على الأقل ضمن answerOptions.`);
        } else {
            const correctOptions = q.answerOptions.filter(o => o?.isCorrect === true);
            if (correctOptions.length === 0) errors.push(`${prefix}: لا يوجد خيار صحيح (isCorrect: true) محدد.`);
            else if (correctOptions.length > 1) errors.push(`${prefix}: تم تحديد ${correctOptions.length} إجابات صحيحة — يُسمح بواحدة فقط.`);

            q.answerOptions.forEach((opt, oi) => {
                if (!opt || typeof opt !== 'object') errors.push(`${prefix}، الخيار ${oi + 1}: بيانات الخيار غير صالحة.`);
                else if (!opt.text || typeof opt.text !== 'string' || !opt.text.trim()) errors.push(`${prefix}، الخيار ${oi + 1}: نص الخيار مفقود أو فارغ.`);
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
async function submitScoreWithRetry(payload, maxRetries = MAX_SCORE_RETRIES, baseDelayMs = SCORE_RETRY_BASE_DELAY_MS) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await apiCall('POST', '/api/scores', payload);
        } catch (e) {
            lastError = e;
            logQuizError(`submitScoreWithRetry (${attempt}/${maxRetries})`, e, { payload });
            if (attempt < maxRetries) await new Promise(r => setTimeout(r, baseDelayMs * attempt));
        }
    }
    throw lastError;
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
    errorEl.classList.remove('hidden');
    errorEl.innerHTML = '';

    const msgSpan = document.createElement('span');
    msgSpan.textContent = '⚠️ تعذّر حفظ نتيجتك على السيرفر. ';

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.textContent = 'إعادة المحاولة';
    retryBtn.className = 'underline font-bold cursor-pointer ms-1';

    retryBtn.addEventListener('click', async () => {
        retryBtn.disabled = true;
        retryBtn.textContent = 'جارٍ المحاولة...';
        try {
            const result = await submitScoreWithRetry(scorePayload);
            clearPendingScore(numericId);

            // تحديث الـ attemptsMap واستدعاء الـ callback عند النجاح
            if (result?.meta) updateAttemptsMap(numericId, result.meta);
            onSuccess?.(result);

            errorEl.textContent = '✅ تم حفظ نتيجتك بنجاح.';
            errorEl.classList.remove('text-red-700');
            errorEl.classList.add('text-green-700');
            setTimeout(() => errorEl.classList.add('hidden'), 4000);
        } catch (retryErr) {
            logQuizError('manualRetryScore', retryErr, { numericId });
            msgSpan.textContent = '⚠️ فشلت إعادة المحاولة. يرجى التواصل مع المسؤول. ';
            retryBtn.disabled = false;
            retryBtn.textContent = 'إعادة المحاولة';
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
        const data = await apiCall('GET', '/api/scores/my/attempts');
        if (Array.isArray(data)) {
            data.forEach(({ quizId, attemptCount, hasOfficial }) => {
                state.attemptsMap[String(quizId)] = { attemptCount, hasOfficial };
            });
        }
        console.log('[AttemptsMap] محُمِّل من السيرفر —', Object.keys(state.attemptsMap).length, 'اختبار');
    } catch (e) {
        logQuizError('loadAttemptsMap', e);
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
        const count = state.serverScores.filter(s => s.quizId && String(s.quizId) === key).length;
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

    const key     = String(quizId);
    const current = state.attemptsMap[key] || { attemptCount: 0, hasOfficial: false };

    state.attemptsMap[key] = {
        attemptCount: current.attemptCount + 1,
        hasOfficial:  current.hasOfficial || (meta?.isOfficial === true)
    };

    console.log(`[AttemptsMap] ✓ تحديث — quizId=${quizId}`, state.attemptsMap[key]);
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
    const isOfficial     = attemptCount === 0;
    const attemptNumber  = attemptCount + 1;

    let bannerEl = document.getElementById('quiz-attempt-banner');
    if (!bannerEl) {
        bannerEl = document.createElement('div');
        bannerEl.id = 'quiz-attempt-banner';

        // محاولة إدراج بعد subtitle، وإلا في أعلى quiz-container
        const subtitleEl     = document.getElementById('quiz-subtitle');
        const containerEl    = document.getElementById('quiz-container');
        if (subtitleEl?.parentNode) {
            subtitleEl.parentNode.insertBefore(bannerEl, subtitleEl.nextSibling);
        } else if (containerEl) {
            containerEl.prepend(bannerEl);
        }
    }

    bannerEl.className = isOfficial
        ? 'rounded-xl p-3 my-3 text-sm text-center font-medium bg-blue-50 border border-blue-200 text-blue-800'
        : 'rounded-xl p-3 my-3 text-sm text-center font-medium bg-amber-50 border border-amber-200 text-amber-800';

    bannerEl.textContent = isOfficial
        ? '⭐ هذه محاولتك الأولى — ستُحتسب في لوحة الشرف تلقائياً'
        : `📝 محاولة تدريبية رقم ${attemptNumber} — لن تُحتسب في لوحة الشرف. (فقط المحاولة الأولى تُحتسب)`;

    bannerEl.classList.remove('hidden');
}

/**
 * يعرض نتيجة المحاولة في شاشة النتائج مع توضيح الطبيعة الرسمية أو التدريبية.
 * يُدرَج في أعلى results-screen.
 * @param {{ isOfficial: boolean, attemptNumber: number }} meta
 */
function renderResultsAttemptInfo(meta) {
    const isOfficial    = meta?.isOfficial    ?? true;
    const attemptNumber = meta?.attemptNumber ?? 1;

    let infoEl = document.getElementById('results-attempt-info');
    if (!infoEl) {
        infoEl = document.createElement('div');
        infoEl.id = 'results-attempt-info';

        const resultsScreen = document.getElementById('results-screen');
        if (resultsScreen) resultsScreen.prepend(infoEl);
    }

    infoEl.className = isOfficial
        ? 'rounded-xl p-4 mb-4 text-center font-semibold text-sm bg-green-50 border border-green-200 text-green-800'
        : 'rounded-xl p-4 mb-4 text-center font-semibold text-sm bg-gray-50 border border-gray-200 text-gray-600';

    infoEl.textContent = isOfficial
        ? '✅ نتيجتك الرسمية — تم احتسابها في لوحة الشرف'
        : `📝 محاولة تدريبية رقم ${attemptNumber} — لم تُحتسب في لوحة الشرف`;

    infoEl.classList.remove('hidden');
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
    logFunctionStatus('initQuizDOM', false);
    questionTextEl         = document.getElementById('question-text');
    questionHintEl         = document.getElementById('question-hint');
    optionsContainerEl     = document.getElementById('options-container');
    currentQuestionNumberEl= document.getElementById('current-question-number');
    totalQuestionsEl       = document.getElementById('total-questions');
    scoreDisplayEl         = document.getElementById('score-display');
    timerDisplayEl         = document.getElementById('timer-display');
    progressBarEl          = document.getElementById('progress-bar');
    feedbackBoxEl          = document.getElementById('feedback-box');
    feedbackMessageEl      = document.getElementById('feedback-message');
    rationaleTextEl        = document.getElementById('rationale-text');
    nextButton             = document.getElementById('next-btn');
    previousButton         = document.getElementById('previous-btn');
    submitButton           = document.getElementById('submit-btn');
}

// =============================================
//  ★ playQuiz — يدعم إعادة المحاولة ★
// =============================================

/**
 * بدء اختبار من القائمة.
 * يتحقق من عدد المحاولات السابقة ويعرض لافتة توضيحية دون حجب إعادة المحاولة.
 * @param {number} index — فهرس الاختبار في allQuizzes
 */
export function playQuiz(index) {
    logFunctionStatus('playQuiz', false);

    // 1. التحقق من صحة البيانات
    const quizData = state.allQuizzes[index];
    const { valid, errors } = validateQuizData(quizData);
    if (!valid) {
        const errorSummary = errors.slice(0, 5).join('\n• ');
        logQuizError('playQuiz — validateQuizData', 'بيانات الاختبار غير صالحة', { index, errors });
        showAlert(
            `❌ لا يمكن تشغيل الاختبار — بيانات غير صالحة:\n• ${errorSummary}${errors.length > 5 ? `\n(و ${errors.length - 5} أخطاء أخرى)` : ''}`,
            'error'
        );
        return;
    }

    state.currentQuizData = quizData;

    // 2. استخراج المعرّف
    const quizId = getQuizId(state.currentQuizData);
    console.log(`[playQuiz] بدء الامتحان — index: ${index}, ID: ${quizId}, العنوان: "${state.currentQuizData.config.title}", أسئلة: ${state.currentQuizData.questions.length}`);

    // 3. تحديد طبيعة المحاولة (رسمية أم تدريبية) بدلاً من حجبها
    const { attemptCount, hasOfficial } = getAttemptInfo(quizId);
    const isOfficialAttempt = attemptCount === 0; // الأولى فقط رسمية

    // حفظ طبيعة المحاولة في state ليستخدمها submitQuiz كاحتياط
    state.currentAttemptIsOfficial = isOfficialAttempt;

    console.log(`[playQuiz] المحاولة رقم ${attemptCount + 1} — ${isOfficialAttempt ? 'رسمية ⭐' : 'تدريبية 📝'}`);

    // 4. تصفير العدادات
    state.totalQuestions       = state.currentQuizData.questions.length;
    state.currentQuestionIndex = 0;
    state.score                = 0;
    state.streak               = 0;
    state.userAnswers          = new Array(state.totalQuestions).fill(null);
    state.timeRemaining        = state.currentQuizData.config.timeLimit;
    state.quizStarted          = false;
    state.lastSubmitMeta       = null;

    // 5. إدارة الواجهة
    closeBottomSheet();
    closeAdminSheet();

    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('quiz-main-title').innerText = state.currentQuizData.config.title;

    const subtitleEl       = document.getElementById('quiz-subtitle');
    const timeInMinutes    = Math.max(1, Math.round((state.currentQuizData.config.timeLimit || 0) / 60));
    subtitleEl.textContent = `${state.currentQuizData.config.description || 'اختبار تفاعلي'} (${state.totalQuestions} سؤالاً في ${timeInMinutes} دقيقة)`;
    timerDisplayEl.textContent = formatTime(state.timeRemaining);

    document.getElementById('results-screen').classList.add('hidden');
    document.getElementById('quiz-container').classList.remove('hidden');
    _showThemeToggle(false);

    // 6. عرض لافتة المحاولة — توضيح قبل البدء
    renderAttemptBanner(attemptCount);

    // 7. بدء الاختبار
    initializeQuiz();
}

// =============================================
//  تهيئة الاختبار وعرض الأسئلة (unchanged)
// =============================================

export function initializeQuiz() {
    logFunctionStatus('initializeQuiz', false);
    totalQuestionsEl.textContent = state.totalQuestions;
    if (state.totalQuestions > 0) {
        renderQuestion();
        startTimer();
        state.quizStarted = true;
        addQuizExitButton();
        // إخفاء الشريط السفلي أثناء الاختبار
        const dockBar = document.getElementById('ios-bottom-nav');
			if (dockBar) dockBar.classList.remove('hidden');
        btn.onclick = async () => {
            showCustomExitModal();
        };
        const quizContainer = document.getElementById('quiz-container');
        if (quizContainer) quizContainer.appendChild(btn);
    }
}

// مودل تأكيد الخروج المخصص
function showCustomExitModal() {
    let modal = document.getElementById('quiz-exit-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'quiz-exit-modal';
        modal.className = 'fixed inset-0 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div style="background: #222b; border-radius: 18px; box-shadow: 0 8px 32px #0005; padding: 2.5rem 2rem; min-width:320px; max-width:90vw; text-align:center;">
                <div style="font-size:1.2rem; color:#fff; margin-bottom:1.5rem; font-weight:bold;">هل أنت متأكد أنك تريد الخروج من الاختبار؟<br><span style='font-size:0.95rem; color:#ff9100;'>سيتم فقدان التقدم الحالي.</span></div>
                <div style="display:flex; gap:1rem; justify-content:center;">
                    <button id="exit-cancel-btn" style="padding:0.7rem 2.2rem; background:#fff; color:#222; border-radius:10px; font-weight:bold; font-size:1rem; border:none; box-shadow:0 2px 8px #0002;">إلغاء</button>
                    <button id="exit-ok-btn" style="padding:0.7rem 2.2rem; background:#ff1744; color:#fff; border-radius:10px; font-weight:bold; font-size:1rem; border:none; box-shadow:0 2px 8px #0002;">خروج</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('exit-cancel-btn').onclick = () => {
            modal.remove();
        };
        document.getElementById('exit-ok-btn').onclick = () => {
            modal.remove();
            state.quizStarted = false;
            document.getElementById('quiz-container').classList.add('hidden');
            document.getElementById('dashboard-view').classList.remove('hidden');
            const dockBar = document.getElementById('ios-bottom-nav');
            if (dockBar) dockBar.classList.remove('hidden');
            if (typeof updateDockUI === 'function') updateDockUI('home');
            const btn = document.getElementById('quiz-exit-btn');
            if (btn) btn.remove();
            }
        }
        const quizContainer = document.getElementById('quiz-container');
        if (quizContainer) quizContainer.appendChild(btn);
    }
}
}

export function renderQuestion() {
    logFunctionStatus('renderQuestion', false);
    const currentQ = state.currentQuizData.questions[state.currentQuestionIndex];

    currentQuestionNumberEl.textContent = state.currentQuestionIndex + 1;
    questionTextEl.innerHTML = `<span style="background: linear-gradient(90deg, #ff9100, #fffde7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight:bold; font-size:1.3rem; text-shadow: 1px 2px 8px rgba(0,0,0,0.10);">${state.currentQuestionIndex + 1}. ${escapeHtml(currentQ.question)}</span>`;
    questionHintEl.innerHTML = `<span class="font-bold">تلميح:</span> ${escapeHtml(currentQ.hint || '')}`;

    previousButton.disabled = state.currentQuestionIndex === 0 || !state.quizStarted;

    if (state.currentQuestionIndex === state.totalQuestions - 1) {
        nextButton.classList.add('hidden');
        submitButton.classList.remove('hidden');
    } else {
        nextButton.classList.remove('hidden');
        submitButton.classList.add('hidden');
    }

    updateProgressBar();
    optionsContainerEl.innerHTML = '';

    currentQ.answerOptions.forEach((option, index) => {
        const optionEl = document.createElement('div');
        optionEl.className = 'answer-option p-4 border-2 border-gray-300 rounded-xl cursor-pointer transition duration-300 shadow-sm text-gray-800 font-medium text-arabic';
        optionEl.textContent = option.text;
        optionEl.setAttribute('data-index', index);
        optionEl.onclick = () => selectAnswer(index);
        optionsContainerEl.appendChild(optionEl);

        if (state.userAnswers[state.currentQuestionIndex] !== null) {
            const { selectedIndex, isCorrect } = state.userAnswers[state.currentQuestionIndex];
            disableOptions();
            if (index === selectedIndex) optionEl.classList.add('selected', isCorrect ? 'correct-answer' : 'incorrect-answer');
            if (option.isCorrect) optionEl.classList.add('correct-answer');
        }
    });

    if (state.userAnswers[state.currentQuestionIndex] !== null) {
        const { isCorrect, rationale, feedbackMessage } = state.userAnswers[state.currentQuestionIndex];
        showFeedback(isCorrect, rationale, feedbackMessage);
    }

    nextButton.disabled = state.userAnswers[state.currentQuestionIndex] === null;
    if (state.userAnswers[state.currentQuestionIndex] === null) hideFeedback();
}

export function selectAnswer(selectedIndex) {
    logFunctionStatus('selectAnswer', false);
    if (state.userAnswers[state.currentQuestionIndex] !== null) return;

    const currentQ       = state.currentQuizData.questions[state.currentQuestionIndex];
    const isCorrect      = currentQ.answerOptions[selectedIndex].isCorrect;
    const rationale      = escapeHtml(currentQ.answerOptions[selectedIndex].rationale || 'لا يوجد تبرير متاح لهذا الخيار.');
    const feedbackConfig = state.currentQuizData?.config?.feedback || {};
    const correctFeedback   = feedbackConfig.correct   || {};
    const incorrectFeedback = feedbackConfig.incorrect || {};
    const streakGoal     = Number(state.currentQuizData?.config?.streakGoal) || 0;

    let newStreak    = isCorrect ? state.streak + 1 : 0;
    let feedbackMsg  = isCorrect
        ? escapeHtml(correctFeedback.message   || '✅ إجابة صحيحة')
        : escapeHtml(incorrectFeedback.message || '❌ إجابة غير صحيحة');

    if (isCorrect) {
        state.score++;
        if (streakGoal > 0 && newStreak % streakGoal === 0) {
            const streakMsg = escapeHtml(correctFeedback.onStreak || '🔥 سلسلة إجابات صحيحة رائعة');
            feedbackMsg += `<br><span class="text-xl font-black block mt-2 text-green-700">${streakMsg}</span>`;
        }
    }

    state.streak = newStreak;
    scoreDisplayEl.textContent = `النقاط: ${state.score}`;

    if (isCorrect) {
        showToastMessage(pickRandom(toastPraise), 'success');
        if (newStreak >= 2) {
            const streakBucket = newStreak >= 5 ? streakToasts[5] : (streakToasts[newStreak] || []);
            if (streakBucket.length > 0) showToastMessage(pickRandom(streakBucket), 'streak');
        }
    } else {
        showToastMessage(pickRandom(toastOops), 'error');
    }

    state.userAnswers[state.currentQuestionIndex] = { selectedIndex, isCorrect, rationale, feedbackMessage: feedbackMsg };

    disableOptions();
    showFeedback(isCorrect, rationale, feedbackMsg);

    Array.from(optionsContainerEl.children).forEach(el => {
        const index = parseInt(el.getAttribute('data-index'));
        el.classList.remove('selected');
        el.onclick = null;
        if (currentQ.answerOptions[index].isCorrect) el.classList.add('correct-answer');
        if (index === selectedIndex && !isCorrect)   el.classList.add('incorrect-answer');
    });

    nextButton.disabled = false;
}

export function showFeedback(isCorrect, rationale, message) {
    logFunctionStatus('showFeedback', false);
    const safeMessage   = message   || (isCorrect ? 'إجابة صحيحة.'  : 'إجابة غير صحيحة.');
    const safeRationale = rationale || 'لا يوجد تبرير متاح لهذا الخيار.';

    feedbackMessageEl.innerHTML  = safeMessage;
    rationaleTextEl.textContent  = `التبرير: ${safeRationale}`;

    feedbackBoxEl.classList.remove('scale-y-0', 'h-0', 'opacity-0');
    feedbackBoxEl.classList.add('scale-y-100', 'h-auto', 'opacity-100', 'p-4');

    if (isCorrect) {
        feedbackBoxEl.classList.replace('incorrect-bg', 'correct-bg')    || feedbackBoxEl.classList.add('correct-bg');
        feedbackMessageEl.classList.replace('text-red-900', 'text-white') || feedbackMessageEl.classList.add('text-white');
        rationaleTextEl.classList.replace('text-red-900', 'text-white')   || rationaleTextEl.classList.add('text-white');
    } else {
        feedbackBoxEl.classList.replace('correct-bg', 'incorrect-bg')    || feedbackBoxEl.classList.add('incorrect-bg');
        feedbackMessageEl.classList.replace('text-white', 'text-red-900') || feedbackMessageEl.classList.add('text-red-900');
        rationaleTextEl.classList.replace('text-white', 'text-red-900')   || rationaleTextEl.classList.add('text-red-900');
    }
    questionHintEl.classList.remove('hidden');
}

export function hideFeedback() {
    logFunctionStatus('hideFeedback', false);
    feedbackBoxEl.classList.add('scale-y-0', 'h-0', 'opacity-0');
    feedbackBoxEl.classList.remove('scale-y-100', 'h-auto', 'opacity-100', 'p-4', 'correct-bg', 'incorrect-bg');
    questionHintEl.classList.add('hidden');
}

export function disableOptions() {
    logFunctionStatus('disableOptions', false);
    Array.from(optionsContainerEl.children).forEach(el => el.onclick = null);
}

export function goToNextQuestion() {
    logFunctionStatus('goToNextQuestion', false);
    if (state.currentQuestionIndex < state.totalQuestions - 1) {
        state.currentQuestionIndex++;
        renderQuestion();
    }
}

export function goToPreviousQuestion() {
    logFunctionStatus('goToPreviousQuestion', false);
    if (state.currentQuestionIndex > 0) {
        state.currentQuestionIndex--;
        renderQuestion();
    }
}

export function updateProgressBar() {
    logFunctionStatus('updateProgressBar', false);
    const progress = state.totalQuestions > 0
        ? ((state.currentQuestionIndex + 1) / state.totalQuestions) * 100
        : 0;
    progressBarEl.style.width = `${progress}%`;
}

export function startTimer() {
    logFunctionStatus('startTimer', false);
    if (state.timerInterval) clearInterval(state.timerInterval);
    if (timerDisplayEl) timerDisplayEl.classList.remove('text-orange-500', 'text-red-600', 'animate-pulse');

    state.timerStartTime   = Date.now();
    state.timerTotalSeconds = state.timeRemaining;

    state.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.timerStartTime) / 1000);
        state.timeRemaining = Math.max(0, state.timerTotalSeconds - elapsed);
        timerDisplayEl.textContent = formatTime(state.timeRemaining);

        if (state.timeRemaining <= 60) {
            timerDisplayEl.classList.remove('text-orange-500');
            timerDisplayEl.classList.add('text-red-600', 'animate-pulse');
        } else if (state.timeRemaining <= 300) {
            timerDisplayEl.classList.remove('text-red-600');
            timerDisplayEl.classList.add('text-orange-500', 'animate-pulse');
        }

        if (state.timeRemaining <= 0) {
            clearInterval(state.timerInterval);
            timerDisplayEl.textContent = 'انتهى الوقت!';
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
    logFunctionStatus('submitQuiz', true);

    // الحماية الوحيدة المتبقية: منع Race Condition داخل نفس التبويب
    if (_isSubmitting) return;
    _isSubmitting = true;

    try {
        if (state.timeRemaining > 0) {
            const confirmed = await showConfirm('إنهاء الاختبار', 'هل أنت متأكد؟ لا يمكنك العودة بعد التسليم.', '⏱️');
            if (!confirmed) { _isSubmitting = false; return; }
        }
        clearInterval(state.timerInterval);

        const quizId    = getQuizId(state.currentQuizData);
        const numericId = Number(quizId);

        // حفظ النتيجة محلياً (للعرض في لوحة التحكم بدون reload)
        if (state.currentUser) {
            state.allUserScores.push({
                userName:  state.currentUser.fullName,
                quizTitle: state.currentQuizData.config.title,
                score:     state.score,
                total:     state.totalQuestions,
                date:      new Date().toLocaleDateString('ar-EG')
            });
        }

        // إرسال النتيجة للسيرفر — السيرفر يحدد isOfficial تلقائياً
        if (state.currentUser && quizId && Number.isFinite(numericId) && numericId > 0) {
            const scorePayload = {
                quizId:    numericId,
                answers:   state.userAnswers.map((a, i) => ({
                    questionId:    state.currentQuizData.questions[i]?.id ?? i,
                    selectedIndex: a ? a.selectedIndex : -1
                })),
                timeTaken: state.currentQuizData.config.timeLimit - state.timeRemaining
            };

            console.log(`[submitScore] إرسال — quizId: ${quizId}, نتيجة: ${state.score}/${state.totalQuestions}, isOfficial: ${state.currentAttemptIsOfficial}`);
            savePendingScore(numericId, scorePayload);

            try {
                const scoreResult = await submitScoreWithRetry(scorePayload);
                clearPendingScore(numericId);

                // قراءة meta من رد السيرفر
                const meta = scoreResult.meta || {
                    isOfficial:    state.currentAttemptIsOfficial ?? true,
                    attemptNumber: (getAttemptInfo(quizId).attemptCount + 1)
                };

                // تحديث عداد المحاولات محلياً
                updateAttemptsMap(quizId, meta);

                // حفظ meta لعرضها في شاشة النتائج
                state.lastSubmitMeta = meta;

                console.log(`[submitScore] ✓ تم — محاولة رقم ${meta.attemptNumber}, ${meta.isOfficial ? 'رسمية ⭐' : 'تدريبية 📝'}`);

            } catch (e) {
                logQuizError('submitQuiz — submitScoreWithRetry', e, { quizId, numericId });
                const saveErrEl = document.getElementById('save-score-error');
                showScoreErrorWithRetry(saveErrEl, numericId, scorePayload, (result) => {
                    if (result?.meta) {
                        updateAttemptsMap(quizId, result.meta);
                        state.lastSubmitMeta = result.meta;
                        // تحديث لافتة النتائج بعد نجاح إعادة المحاولة
                        renderResultsAttemptInfo(result.meta);
                    }
                });
            }
        } else {
            console.warn(`[submitScore] ⚠️ معرّف غير صالح (${quizId}) — النتيجة محلية فقط`);
        }

        // ========================
        //  عرض شاشة النتائج
        // ========================
        document.getElementById('quiz-container').classList.add('hidden');
        document.getElementById('results-screen').classList.remove('hidden');

        const percentage = (state.score / state.totalQuestions) * 100;
        document.getElementById('final-score').textContent = state.score;
        document.getElementById('final-total').textContent = state.totalQuestions;
        document.getElementById('custom-closing-text').textContent =
            state.currentQuizData.config.closingMessage || 'شكراً لمشاركتك!';

        let finalMessage = 'ما شاء الله تبارك الرحمن! نتائجك مُبهرة.';
        if (percentage < 50)      finalMessage = 'هون عليك! لكل جواد كبوة، والتعلم رحلة مستمرة.';
        else if (percentage < 75) finalMessage = 'مستوى جيد جداً! لديك أساس متين.';
        else if (percentage < 90) finalMessage = 'ممتاز يا بطل! أداؤك قوي.';
        document.getElementById('final-message').textContent = finalMessage;

        // عرض لافتة الطبيعة الرسمية / التدريبية في النتائج
        renderResultsAttemptInfo(state.lastSubmitMeta || {
            isOfficial:    state.currentAttemptIsOfficial ?? true,
            attemptNumber: getAttemptInfo(quizId).attemptCount  // بعد التحديث
        });

    } catch (unexpectedError) {
        logQuizError('submitQuiz — unexpected', unexpectedError);
        showAlert('❌ حدث خطأ غير متوقع أثناء تسليم الاختبار. يرجى التواصل مع المسؤول.', 'error');
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
    const attemptBanner = document.getElementById('quiz-attempt-banner');
    if (attemptBanner) attemptBanner.classList.add('hidden');

    const resultsInfo = document.getElementById('results-attempt-info');
    if (resultsInfo) resultsInfo.classList.add('hidden');

    document.getElementById('results-screen').classList.add('hidden');
    document.getElementById('quiz-container').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    renderDashboard();
    _showThemeToggle(true);
}