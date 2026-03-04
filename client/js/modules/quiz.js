/**
 * @module quiz
 * @description محرك الاختبارات التفاعلي — يتحكم في تشغيل الاختبار، الأسئلة، المؤقت، النتائج والتغذية الراجعة
 * @version 2.0.0 — Hardened Edition
 */
import state from './state.js';
import { escapeHtml, showAlert, showConfirm, formatTime, showToastMessage, pickRandom, logFunctionStatus } from './helpers.js';
import { apiCall } from './api.js';
import { _showThemeToggle, closeBottomSheet, closeAdminSheet } from './navigation.js';

// =============================================
//  ثوابت النظام
// =============================================

/** مفتاح localStorage لتتبع الاختبارات المُسلَّمة عبر التبويبات والتحميل */
const SUBMISSION_KEY_PREFIX = 'quiz_submitted_';
/** مفتاح localStorage لحفظ النتائج المعلّقة حتى تأكيد السيرفر */
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
 * تسجيل أخطاء الوحدة مركزياً مع السياق الكامل
 * يمكن توسيعه لاحقاً لإرسال الأخطاء لخدمة مراقبة خارجية.
 * @param {string} context — الدالة أو الموضع الذي حدث فيه الخطأ
 * @param {Error|string} error — كائن الخطأ أو رسالته
 * @param {Object} [extra={}] — بيانات سياقية إضافية للتشخيص
 */
function logQuizError(context, error, extra = {}) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error(`[QuizModule][${context}]`, message, { ...extra, ...(stack ? { stack } : {}) });
}

// =============================================
//  إدارة معرّف الاختبار — Unified ID Handling
// =============================================

/**
 * استخراج معرّف الاختبار بشكل موحّد من بنية quizData.
 * يُستخدم في كل موضع يحتاج إلى quizId بدلاً من التكرار.
 * @param {Object} quizData
 * @returns {string|number|null}
 */
function getQuizId(quizData) {
    return quizData?.id ?? quizData?.config?.id ?? null;
}

/**
 * بناء مفتاح localStorage للحماية من التسليم المزدوج.
 * يعتمد على quizId + userName لضمان التفرّد لكل مستخدم واختبار.
 * @param {string|number|null} quizId
 * @param {string} userName
 * @returns {string}
 */
function getSubmissionStorageKey(quizId, userName) {
    const safeId = (quizId !== null && quizId !== undefined) ? String(quizId) : 'unknown';
    const safeUser = userName ? encodeURIComponent(String(userName)) : 'anonymous';
    return `${SUBMISSION_KEY_PREFIX}${safeId}_${safeUser}`;
}

// =============================================
//  الحماية من التسليم المزدوج عبر التبويبات والتحميل
// =============================================

/**
 * يتحقق إذا كان الاختبار قد سُلِّم مسبقاً لهذا المستخدم عبر localStorage.
 * يعمل عبر التبويبات المتعددة وإعادة تحميل الصفحة.
 * عند تعذّر الوصول لـ localStorage يُرجع false (Fail Open).
 * @param {string|number|null} quizId
 * @param {string} userName
 * @returns {boolean}
 */
function isAlreadySubmittedInStorage(quizId, userName) {
    try {
        return localStorage.getItem(getSubmissionStorageKey(quizId, userName)) === 'true';
    } catch (e) {
        logQuizError('isAlreadySubmittedInStorage', e, { quizId, userName });
        return false;
    }
}

/**
 * يُسجِّل الاختبار كمُسلَّم في localStorage بعد النجاح.
 * @param {string|number|null} quizId
 * @param {string} userName
 */
function markSubmittedInStorage(quizId, userName) {
    try {
        localStorage.setItem(getSubmissionStorageKey(quizId, userName), 'true');
    } catch (e) {
        logQuizError('markSubmittedInStorage', e, { quizId, userName });
    }
}

// =============================================
//  استمرارية النتيجة المعلّقة
// =============================================

/**
 * يحفظ النتيجة محلياً قبل إرسالها للسيرفر.
 * تضمن استمرارية البيانات إذا انقطع الاتصال أثناء الإرسال.
 * @param {string|number} quizId
 * @param {Object} payload — بيانات النتيجة كما تُرسَل للـ API
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
 * يفحص: البنية العامة، تفرّد المعرّفات، نصوص الأسئلة، سلامة الخيارات.
 * @param {Object} quizData — بيانات الاختبار الكاملة
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateQuizData(quizData) {
    const errors = [];

    if (!quizData || typeof quizData !== 'object') {
        return { valid: false, errors: ['بيانات الاختبار غير موجودة أو ذات تنسيق غير صالح.'] };
    }

    // التحقق من حقل الإعداد
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

    // التحقق من قائمة الأسئلة
    if (!Array.isArray(quizData.questions) || quizData.questions.length === 0) {
        errors.push('قائمة الأسئلة مفقودة أو فارغة.');
        return { valid: false, errors };
    }

    const seenQuestionIds = new Set();

    quizData.questions.forEach((q, idx) => {
        const prefix = `السؤال ${idx + 1}`;

        if (!q || typeof q !== 'object') {
            errors.push(`${prefix}: بيانات السؤال غير صالحة.`);
            return;
        }

        // فحص تفرّد معرّف السؤال
        if (q.id !== undefined && q.id !== null) {
            const strId = String(q.id);
            if (seenQuestionIds.has(strId)) {
                errors.push(`${prefix}: معرّف السؤال (${strId}) مكرر.`);
            } else {
                seenQuestionIds.add(strId);
            }
        }

        // فحص نص السؤال
        if (!q.question || typeof q.question !== 'string' || !q.question.trim()) {
            errors.push(`${prefix}: نص السؤال مفقود أو فارغ.`);
        }

        // فحص الخيارات
        if (!Array.isArray(q.answerOptions) || q.answerOptions.length < 2) {
            errors.push(`${prefix}: يجب توفير خيارَين على الأقل ضمن answerOptions.`);
        } else {
            const correctOptions = q.answerOptions.filter(o => o?.isCorrect === true);
            if (correctOptions.length === 0) {
                errors.push(`${prefix}: لا يوجد خيار صحيح (isCorrect: true) محدد.`);
            } else if (correctOptions.length > 1) {
                errors.push(`${prefix}: تم تحديد ${correctOptions.length} إجابات صحيحة — يُسمح بواحدة فقط.`);
            }
            q.answerOptions.forEach((opt, oi) => {
                if (!opt || typeof opt !== 'object') {
                    errors.push(`${prefix}، الخيار ${oi + 1}: بيانات الخيار غير صالحة.`);
                } else if (!opt.text || typeof opt.text !== 'string' || !opt.text.trim()) {
                    errors.push(`${prefix}، الخيار ${oi + 1}: نص الخيار مفقود أو فارغ.`);
                }
            });
        }
    });

    return { valid: errors.length === 0, errors };
}

// =============================================
//  إرسال النتيجة مع إعادة المحاولة التلقائية
// =============================================

/**
 * يُرسِل النتيجة للسيرفر مع إعادة المحاولة التلقائية عند الفشل
 * باستخدام Exponential Backoff لتجنّب إغراق السيرفر.
 * @param {Object} payload — بيانات النتيجة المُرسَلة
 * @param {number} [maxRetries=MAX_SCORE_RETRIES]
 * @param {number} [baseDelayMs=SCORE_RETRY_BASE_DELAY_MS]
 * @returns {Promise<Object>}
 * @throws {Error} آخر خطأ إذا فشلت جميع المحاولات
 */
async function submitScoreWithRetry(payload, maxRetries = MAX_SCORE_RETRIES, baseDelayMs = SCORE_RETRY_BASE_DELAY_MS) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await apiCall('POST', '/api/scores', payload);
        } catch (e) {
            lastError = e;
            logQuizError(`submitScoreWithRetry (${attempt}/${maxRetries})`, e, { payload });
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, baseDelayMs * attempt));
            }
        }
    }
    throw lastError;
}

/**
 * يعرض رسالة خطأ حفظ النتيجة مع زر إعادة محاولة يدوية.
 * يبني العناصر برمجياً لتجنّب أي ثغرات XSS.
 * @param {HTMLElement|null} errorEl — عنصر عرض الخطأ
 * @param {number} numericId — معرّف الاختبار الرقمي
 * @param {Object} scorePayload — بيانات النتيجة
 * @param {string} userName — اسم المستخدم الحالي
 */
function showScoreErrorWithRetry(errorEl, numericId, scorePayload, userName) {
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
            await submitScoreWithRetry(scorePayload);
            clearPendingScore(numericId);
            markSubmittedInStorage(numericId, userName);
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
//  عناصر DOM — تُعيَّن عند استدعاء initQuizDOM()
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
 * تهيئة عناصر DOM الخاصة بالاختبار — يجب استدعاؤها بعد تحميل الصفحة
 */
export function initQuizDOM() {
    logFunctionStatus('initQuizDOM', false);
    questionTextEl = document.getElementById('question-text');
    questionHintEl = document.getElementById('question-hint');
    optionsContainerEl = document.getElementById('options-container');
    currentQuestionNumberEl = document.getElementById('current-question-number');
    totalQuestionsEl = document.getElementById('total-questions');
    scoreDisplayEl = document.getElementById('score-display');
    timerDisplayEl = document.getElementById('timer-display');
    progressBarEl = document.getElementById('progress-bar');
    feedbackBoxEl = document.getElementById('feedback-box');
    feedbackMessageEl = document.getElementById('feedback-message');
    rationaleTextEl = document.getElementById('rationale-text');
    nextButton = document.getElementById('next-btn');
    previousButton = document.getElementById('previous-btn');
    submitButton = document.getElementById('submit-btn');
}

// =============================================
//  دوال محرك الاختبار
// =============================================

/**
 * بدء اختبار من القائمة
 * @param {number} index — فهرس الاختبار في allQuizzes
 */
export function playQuiz(index) {
    logFunctionStatus('playQuiz', false);

    // 1. استدعاء بيانات الاختبار والتحقق من صحتها أولاً
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

    // 2. استخراج المعرّف بشكل موحّد
    const quizId = getQuizId(state.currentQuizData);
    const userName = state.currentUser?.fullName ?? null;
    console.log(`[playQuiz] بدء الامتحان — index: ${index}, ID: ${quizId}, العنوان: "${state.currentQuizData.config.title}", أسئلة: ${state.currentQuizData.questions.length}`);

    // 3. التحقق من التسليم المسبق — السيرفر أولاً، ثم المحلي، ثم localStorage
    const takenServer = state.serverScores.find(
        s => s.quizId && quizId && String(s.quizId) === String(quizId)
    );
    const takenLocal = (!takenServer && userName)
        ? state.allUserScores.find(
            s => s.quizTitle === state.currentQuizData.config.title && s.userName === userName
          )
        : null;
    const takenStorage = quizId && userName
        ? isAlreadySubmittedInStorage(quizId, userName)
        : false;

    if (takenServer || takenLocal || takenStorage) {
        showAlert('⚠️ لقد أجبت على هذا الامتحان من قبل. لا يمكن إعادته بنفس الحساب.', 'warning');
        return;
    }

    state.totalQuestions = state.currentQuizData.questions.length;

    // 4. تصفير العدادات
    state.currentQuestionIndex = 0;
    state.score = 0;
    state.streak = 0;
    state.userAnswers = new Array(state.totalQuestions).fill(null);
    state.timeRemaining = state.currentQuizData.config.timeLimit;
    state.quizStarted = false;

    // 5. إدارة الواجهة
    closeBottomSheet();
    closeAdminSheet();

    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('quiz-main-title').innerText = state.currentQuizData.config.title;

    const subtitleEl = document.getElementById('quiz-subtitle');
    const timeInMinutes = Math.max(1, Math.round((state.currentQuizData.config.timeLimit || 0) / 60));
    subtitleEl.textContent = `${state.currentQuizData.config.description || 'اختبار تفاعلي'} (${state.totalQuestions} سؤالاً في ${timeInMinutes} دقيقة)`;
    timerDisplayEl.textContent = formatTime(state.timeRemaining);

    document.getElementById('results-screen').classList.add('hidden');

    // 6. بدء الاختبار
    document.getElementById('quiz-container').classList.remove('hidden');
    _showThemeToggle(false);
    initializeQuiz();
}

/**
 * تهيئة الاختبار — ضبط العدد الكلي وبدء العرض والمؤقت
 */
export function initializeQuiz() {
    logFunctionStatus('initializeQuiz', false);
    totalQuestionsEl.textContent = state.totalQuestions;
    if (state.totalQuestions > 0) {
        renderQuestion();
        startTimer();
        state.quizStarted = true;
    }
}

/**
 * عرض السؤال الحالي مع الخيارات والتقدم
 */
export function renderQuestion() {
    logFunctionStatus('renderQuestion', false);
    const currentQ = state.currentQuizData.questions[state.currentQuestionIndex];

    currentQuestionNumberEl.textContent = state.currentQuestionIndex + 1;

    // XSS: escapeHtml لكل البيانات الواردة من السيرفر قبل innerHTML
    questionTextEl.innerHTML = `${state.currentQuestionIndex + 1}. ${escapeHtml(currentQ.question)}`;
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
        // XSS: textContent آمن دائماً لعرض بيانات المستخدم/السيرفر
        optionEl.textContent = option.text;
        optionEl.setAttribute('data-index', index);
        optionEl.onclick = () => selectAnswer(index);
        optionsContainerEl.appendChild(optionEl);

        if (state.userAnswers[state.currentQuestionIndex] !== null) {
            const { selectedIndex, isCorrect } = state.userAnswers[state.currentQuestionIndex];
            disableOptions();
            if (index === selectedIndex) {
                optionEl.classList.add('selected', isCorrect ? 'correct-answer' : 'incorrect-answer');
            }
            if (option.isCorrect) {
                optionEl.classList.add('correct-answer');
            }
        }
    });

    if (state.userAnswers[state.currentQuestionIndex] !== null) {
        const { isCorrect, rationale, feedbackMessage } = state.userAnswers[state.currentQuestionIndex];
        showFeedback(isCorrect, rationale, feedbackMessage);
    }

    nextButton.disabled = state.userAnswers[state.currentQuestionIndex] === null;
    if (state.userAnswers[state.currentQuestionIndex] === null) {
        hideFeedback();
    }
}

/**
 * معالجة اختيار إجابة — تسجيل النقاط، السلسلة، التغذية الراجعة
 * @param {number} selectedIndex — فهرس الخيار المُختار
 */
export function selectAnswer(selectedIndex) {
    logFunctionStatus('selectAnswer', false);
    if (state.userAnswers[state.currentQuestionIndex] !== null) return;

    const currentQ = state.currentQuizData.questions[state.currentQuestionIndex];
    const isCorrect = currentQ.answerOptions[selectedIndex].isCorrect;

    // XSS: escapeHtml على rationale عند التخزين — مصدره السيرفر
    const rationale = escapeHtml(
        currentQ.answerOptions[selectedIndex].rationale || 'لا يوجد تبرير متاح لهذا الخيار.'
    );

    const feedbackConfig = state.currentQuizData?.config?.feedback || {};
    const correctFeedback = feedbackConfig.correct || {};
    const incorrectFeedback = feedbackConfig.incorrect || {};
    const streakGoal = Number(state.currentQuizData?.config?.streakGoal) || 0;

    let newStreak = isCorrect ? state.streak + 1 : 0;
    let feedbackMsg = isCorrect
        ? escapeHtml(correctFeedback.message || '✅ إجابة صحيحة')
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

    // rationale مُعقَّم مسبقاً بـ escapeHtml أعلاه — آمن للتخزين والعرض
    state.userAnswers[state.currentQuestionIndex] = { selectedIndex, isCorrect, rationale, feedbackMessage: feedbackMsg };

    disableOptions();
    showFeedback(isCorrect, rationale, feedbackMsg);

    const optionElements = optionsContainerEl.children;
    Array.from(optionElements).forEach(el => {
        const index = parseInt(el.getAttribute('data-index'));
        el.classList.remove('selected');
        el.onclick = null;
        if (currentQ.answerOptions[index].isCorrect) el.classList.add('correct-answer');
        if (index === selectedIndex && !isCorrect) el.classList.add('incorrect-answer');
    });

    nextButton.disabled = false;
}

/**
 * إظهار صندوق التغذية الراجعة
 * @param {boolean} isCorrect
 * @param {string} rationale — مُعقَّم بـ escapeHtml عند التخزين في selectAnswer
 * @param {string} message — مُعقَّم بـ escapeHtml عند البناء في selectAnswer
 */
export function showFeedback(isCorrect, rationale, message) {
    logFunctionStatus('showFeedback', false);
    const safeMessage = message || (isCorrect ? 'إجابة صحيحة.' : 'إجابة غير صحيحة.');
    const safeRationale = rationale || 'لا يوجد تبرير متاح لهذا الخيار.';

    // innerHTML آمن: message مُعقَّم في selectAnswer، rationale عبر textContent
    feedbackMessageEl.innerHTML = safeMessage;
    rationaleTextEl.textContent = `التبرير: ${safeRationale}`;

    feedbackBoxEl.classList.remove('scale-y-0', 'h-0', 'opacity-0');
    feedbackBoxEl.classList.add('scale-y-100', 'h-auto', 'opacity-100', 'p-4');

    if (isCorrect) {
        feedbackBoxEl.classList.replace('incorrect-bg', 'correct-bg') || feedbackBoxEl.classList.add('correct-bg');
        feedbackMessageEl.classList.replace('text-red-900', 'text-white') || feedbackMessageEl.classList.add('text-white');
        rationaleTextEl.classList.replace('text-red-900', 'text-white') || rationaleTextEl.classList.add('text-white');
    } else {
        feedbackBoxEl.classList.replace('correct-bg', 'incorrect-bg') || feedbackBoxEl.classList.add('incorrect-bg');
        feedbackMessageEl.classList.replace('text-white', 'text-red-900') || feedbackMessageEl.classList.add('text-red-900');
        rationaleTextEl.classList.replace('text-white', 'text-red-900') || rationaleTextEl.classList.add('text-red-900');
    }
    questionHintEl.classList.remove('hidden');
}

/**
 * إخفاء صندوق التغذية الراجعة
 */
export function hideFeedback() {
    logFunctionStatus('hideFeedback', false);
    feedbackBoxEl.classList.add('scale-y-0', 'h-0', 'opacity-0');
    feedbackBoxEl.classList.remove('scale-y-100', 'h-auto', 'opacity-100', 'p-4', 'correct-bg', 'incorrect-bg');
    questionHintEl.classList.add('hidden');
}

/**
 * تعطيل جميع الخيارات بعد الإجابة
 */
export function disableOptions() {
    logFunctionStatus('disableOptions', false);
    Array.from(optionsContainerEl.children).forEach(el => el.onclick = null);
}

/**
 * الانتقال للسؤال التالي
 */
export function goToNextQuestion() {
    logFunctionStatus('goToNextQuestion', false);
    if (state.currentQuestionIndex < state.totalQuestions - 1) {
        state.currentQuestionIndex++;
        renderQuestion();
    }
}

/**
 * الانتقال للسؤال السابق
 */
export function goToPreviousQuestion() {
    logFunctionStatus('goToPreviousQuestion', false);
    if (state.currentQuestionIndex > 0) {
        state.currentQuestionIndex--;
        renderQuestion();
    }
}

/**
 * تحديث شريط التقدم
 */
export function updateProgressBar() {
    logFunctionStatus('updateProgressBar', false);
    const progress = state.totalQuestions > 0
        ? ((state.currentQuestionIndex + 1) / state.totalQuestions) * 100
        : 0;
    progressBarEl.style.width = `${progress}%`;
}

/**
 * بدء المؤقت التنازلي باستخدام Date.now() لدقة أعلى.
 * يُضيف تحذيرات بصرية متدرّجة: برتقالي (≤5 دقائق)، أحمر نابض (≤60 ثانية).
 */
export function startTimer() {
    logFunctionStatus('startTimer', false);
    if (state.timerInterval) clearInterval(state.timerInterval);
    if (timerDisplayEl) {
        timerDisplayEl.classList.remove('text-orange-500', 'text-red-600', 'animate-pulse');
    }
    state.timerStartTime = Date.now();
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

/**
 * تسليم الاختبار — حفظ النتيجة وعرض شاشة النتائج.
 * محمي من التسليم المزدوج بطبقتين: flag في الذاكرة + localStorage عبر التبويبات.
 * يُرسِل النتيجة مع إعادة المحاولة ويحفظها محلياً حتى تأكيد السيرفر.
 */
let _isSubmitting = false;
export async function submitQuiz() {
    logFunctionStatus('submitQuiz', true);

    // الطبقة الأولى: منع التسليم المزدوج في نفس التبويب (Race Condition مع المؤقت)
    if (_isSubmitting) return;

    // الطبقة الثانية: منع التسليم عبر التبويبات وإعادة التحميل
    const quizId = getQuizId(state.currentQuizData);
    const userName = state.currentUser?.fullName ?? null;
    if (quizId && userName && isAlreadySubmittedInStorage(quizId, userName)) {
        showAlert('⚠️ تم تسليم هذا الاختبار مسبقاً من هذا الحساب.', 'warning');
        return;
    }

    _isSubmitting = true;

    try {
        if (state.timeRemaining > 0) {
            const confirmed = await showConfirm('إنهاء الاختبار', 'هل أنت متأكد؟ لا يمكنك العودة بعد التسليم.', '⏱️');
            if (!confirmed) {
                _isSubmitting = false;
                return;
            }
        }
        clearInterval(state.timerInterval);

        // === حفظ النتيجة على السيرفر + محلياً ===
        if (state.currentUser) {
            const resultEntry = {
                userName: state.currentUser.fullName,
                quizTitle: state.currentQuizData.config.title,
                score: state.score,
                total: state.totalQuestions,
                date: new Date().toLocaleDateString('ar-EG')
            };
            state.allUserScores.push(resultEntry);

            const numericId = Number(quizId);
            console.log(`[submitScore] بدء إرسال النتيجة — quizId: ${quizId}, النتيجة: ${state.score}/${state.totalQuestions}`);

            if (quizId && Number.isFinite(numericId) && numericId > 0) {
                const scorePayload = {
                    quizId: numericId,
                    answers: state.userAnswers.map((a, i) => ({
                        questionId: state.currentQuizData.questions[i]?.id ?? i,
                        selectedIndex: a ? a.selectedIndex : -1
                    })),
                    timeTaken: state.currentQuizData.config.timeLimit - state.timeRemaining
                };

                // حفظ النتيجة محلياً قبل الإرسال — ضمان الاستمرارية
                savePendingScore(numericId, scorePayload);

                try {
                    const scoreResult = await submitScoreWithRetry(scorePayload);
                    console.log(`[submitScore] ✓ تم حفظ النتيجة على السيرفر`, scoreResult.result || scoreResult);
                    clearPendingScore(numericId);
                    markSubmittedInStorage(quizId, userName);
                } catch (e) {
                    logQuizError('submitQuiz — submitScoreWithRetry', e, { quizId, numericId });
                    const saveErrEl = document.getElementById('save-score-error');
                    showScoreErrorWithRetry(saveErrEl, numericId, scorePayload, userName);
                }
            } else {
                console.warn(`[submitScore] ⚠️ الامتحان ليس له ID سيرفر صالح (${quizId}) — النتيجة محفوظة محلياً فقط`);
                // نُسجِّل التسليم في الـ storage حتى للاختبارات بلا ID سيرفر
                if (quizId && userName) markSubmittedInStorage(quizId, userName);
            }
        }
        // ========================================

        document.getElementById('quiz-container').classList.add('hidden');
        document.getElementById('results-screen').classList.remove('hidden');

        const percentage = (state.score / state.totalQuestions) * 100;
        document.getElementById('final-score').textContent = state.score;
        document.getElementById('final-total').textContent = state.totalQuestions;
        document.getElementById('custom-closing-text').textContent =
            state.currentQuizData.config.closingMessage || 'شكراً لمشاركتك!';

        let finalMessage = 'ما شاء الله تبارك الرحمن! نتائجك مُبهرة.';
        if (percentage < 50) {
            finalMessage = 'هون عليك! لكل جواد كبوة، والتعلم رحلة مستمرة.';
        } else if (percentage < 75) {
            finalMessage = 'مستوى جيد جداً! لديك أساس متين.';
        } else if (percentage < 90) {
            finalMessage = 'ممتاز يا بطل! أداؤك قوي.';
        }
        document.getElementById('final-message').textContent = finalMessage;

    } catch (unexpectedError) {
        // أي خطأ غير متوقع في تدفق التسليم
        logQuizError('submitQuiz — unexpected', unexpectedError);
        showAlert('❌ حدث خطأ غير متوقع أثناء تسليم الاختبار. يرجى التواصل مع المسؤول.', 'error');
    } finally {
        _isSubmitting = false;
    }
}

/**
 * العودة إلى الصفحة الرئيسية من شاشة النتائج
 * @param {Function} renderDashboard — دالة إعادة رسم لوحة التحكم
 */
export function exitToMain(renderDashboard) {
    document.getElementById('results-screen').classList.add('hidden');
    document.getElementById('quiz-container').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    renderDashboard();
    _showThemeToggle(true);
}