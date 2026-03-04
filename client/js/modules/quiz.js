/**
 * @module quiz
 * @description محرك الاختبارات التفاعلي — يتحكم في تشغيل الاختبار، الأسئلة، المؤقت، النتائج والتغذية الراجعة
 */
import state from './state.js';
import { escapeHtml, showAlert, showConfirm, formatTime, showToastMessage, pickRandom, logFunctionStatus } from './helpers.js';
import { apiCall } from './api.js';
import { _showThemeToggle, closeBottomSheet, closeAdminSheet } from './navigation.js';

// =============================================
//  رسائل التشجيع والتعزيز
// =============================================

/** @type {string[]} رسائل تشجيعية عند الإجابة الصحيحة */
const toastPraise = [
    'أحسنت بارك الله فيك 🌹',
    'نعم العلم ونعم المتعلم 🌒',
    'نعم العبد 🎉',
    'نعم الفتى 👌',
    'الله أكبر عليك إيه الحلاوة دي 🌟',
    'أصبت كبد الحقيقة! 🎯',
    'فتح الله عليك فتوح العارفين 🤲',
    'لله درُّك من نبيهٍ أريب! 👑',
    'نور على نور، زادك الله علماً 💡',
    'هذا الشبل من ذاك الأسد 🦁',
    'إيه الدماغ الألماظ دي! 💎',
    'أستاذ ورئيس قسم 🎓',
    'يا سيدي على الدماغ العالية والروقان 🧠',
    'عداك العيب وقزح 🚀',
    'معلم وابن معلم، جبت التايهة! 😎'
];

/** @type {string[]} رسائل عند الإجابة الخاطئة */
const toastOops = [
    'راجع العلم ✔️',
    'لا يفل الحديد إلا الحديد ⚔️',
    'وما أصابك من سيئة فمن نفسك 😔',
    'لكل صارم هفوة 🗡️',
    'لكل جواد كبوة 🎠',
    'لكل عالم زلة 📕',
    'جلّ من لا يسهو ☝️',
    'من الخطأ يولد الصواب ✔️',
    'قد يُخطئ السهم الهدف، فارمِ من جديد 🏹',
    'المحاولة شرف، والخطأ طريق التعلم 🛤️',
    'ليس كل ما يلمع ذهباً، راجع إجابتك 🔍',
    'جليت منك المرة دي يا بطل 😂',
    'شكلنا محتاجين كوباية شاي ونركز من تاني ☕',
    'إنت جبت الكلام ده منين يا غالي؟ 🤦‍♂️',
    'ولا يهمك، الشاطر بيقع ويقوم 💪',
    'خانتك التعبيرات المرة دي، جرب تاني 😅'
];

/** @type {Object<number, string[]>} رسائل السلاسل المتتالية */
const streakToasts = {
    2: ['شكلك فاهم يا نصة 😂'],
    3: ['بدا أنك درعمي أصيل 👌'],
    4: ['ماشاء الله نفع الله بك الأمة ♥️'],
    5: [
        'بلغ السيل الزبى 🔥',
        'إنت واكل إيه النهاردة؟ الدماغ دي متكلفة! 🧠🔥',
        'لا إحنا نقفل اللعبة على كده بقى، مفيش بعد كده! 🎮😎',
        'قطر وماشي مفيش حاجة قادرة توقفه، ما شاء الله! 🚂💨',
        'خمسة وخميسة في عين الحسود، إيه الحلاوة دي كلها! 🧿✨',
        'براحة علينا شوية، إنت كده معدي السحاب! ☁️🚀',
        'سيلٌ من الإبداع لا ينقطع، زادك الله من فضله! 🌊',
        'كالغيْث أينما وقع نفع، إجاباتك كلها صائبة! 🌧️',
        'سلسلة من الانتصارات المتتالية، لله درّ عقلك! ⛓️💡',
        'ما زلت تبرهن أنك فارس هذا الميدان بلا منازع! 🏇',
        'نور على نور، وتألق يتبعه تألق، استمر! 🌟',
        'ضرب نار مستمر! 🔥',
        'أداء أسطوري لا يُقهر! 🐉',
        'السلسلة مستمرة.. إياك أن تتوقف! 🔄'
    ]
};

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
    // 1. استدعاء بيانات الاختبار
    state.currentQuizData = state.allQuizzes[index];
    const quizId = state.currentQuizData.id || state.currentQuizData.config?.id;
    console.log(`[playQuiz] بدء الامتحان — index: ${index}, ID: ${quizId}, العنوان: "${state.currentQuizData.config.title}", أسئلة: ${state.currentQuizData.questions.length}`);

    // منع إعادة الامتحان لنفس الحساب (حتى لو أدمن)
    const takenServer = state.serverScores.find(s => s.quizId && quizId && String(s.quizId) === String(quizId));
    const takenLocal = (!takenServer && state.currentUser)
        ? state.allUserScores.find(s => s.quizTitle === state.currentQuizData.config.title && s.userName === state.currentUser.fullName)
        : null;
    if (takenServer || takenLocal) {
        showAlert('⚠️ لقد أجبت على هذا الامتحان من قبل. لا يمكن إعادته بنفس الحساب.', 'warning');
        return;
    }
    state.totalQuestions = state.currentQuizData.questions.length;

    // 2. تصفير العدادات
    state.currentQuestionIndex = 0;
    state.score = 0;
    state.streak = 0;
    state.userAnswers = new Array(state.totalQuestions).fill(null);
    state.timeRemaining = state.currentQuizData.config.timeLimit;
    state.quizStarted = false;

    // 3. إدارة الواجهة
    closeBottomSheet();
    closeAdminSheet();

    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('quiz-main-title').innerText = state.currentQuizData.config.title;
    // تحديث الوصف بعدد الأسئلة والوقت الفعلي
    const subtitleEl = document.getElementById('quiz-subtitle');
    const timeInMinutes = Math.max(1, Math.round((state.currentQuizData.config.timeLimit || 0) / 60));
    subtitleEl.textContent = `${state.currentQuizData.config.description || 'اختبار تفاعلي'} (${state.totalQuestions} سؤالاً في ${timeInMinutes} دقيقة)`;
    // ضبط المؤقت المبدئي
    timerDisplayEl.textContent = formatTime(state.timeRemaining);

    // إخفاء شاشة النتائج لو كانت مفتوحة
    document.getElementById('results-screen').classList.add('hidden');

    // 4. بدء الاختبار
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

    // تحديث العناوين
    currentQuestionNumberEl.textContent = state.currentQuestionIndex + 1;

    // تحديث نص السؤال والتلميح (مع حماية XSS)
    questionTextEl.innerHTML = `${state.currentQuestionIndex + 1}. ${escapeHtml(currentQ.question)}`;
    questionHintEl.innerHTML = `<span class="font-bold">تلميح:</span> ${escapeHtml(currentQ.hint)}`;

    // تفعيل/تعطيل أزرار التنقل
    previousButton.disabled = state.currentQuestionIndex === 0 || !state.quizStarted;

    // إظهار زر الإنهاء في السؤال الأخير، وإظهار التالي قبله
    if (state.currentQuestionIndex === state.totalQuestions - 1) {
        nextButton.classList.add('hidden');
        submitButton.classList.remove('hidden');
    } else {
        nextButton.classList.remove('hidden');
        submitButton.classList.add('hidden');
    }

    // تحديث شريط التقدم
    updateProgressBar();

    // عرض الخيارات
    optionsContainerEl.innerHTML = '';
    currentQ.answerOptions.forEach((option, index) => {
        const optionEl = document.createElement('div');
        optionEl.className = 'answer-option p-4 border-2 border-gray-300 rounded-xl cursor-pointer transition duration-300 shadow-sm text-gray-800 font-medium text-arabic';
        optionEl.textContent = option.text;
        optionEl.setAttribute('data-index', index);
        optionEl.onclick = () => selectAnswer(index);
        optionsContainerEl.appendChild(optionEl);

        // إعادة تفعيل التحديد والتعطيل إذا كان قد أجاب مسبقاً
        if (state.userAnswers[state.currentQuestionIndex] !== null) {
            const selectedIndex = state.userAnswers[state.currentQuestionIndex].selectedIndex;
            disableOptions();

            if (index === selectedIndex) {
                optionEl.classList.add('selected');
                if (state.userAnswers[state.currentQuestionIndex].isCorrect) {
                    optionEl.classList.add('correct-answer');
                } else {
                    optionEl.classList.add('incorrect-answer');
                }
            }
            // إظهار الجواب الصحيح دائماً بعد الإجابة
            if (option.isCorrect) {
                optionEl.classList.add('correct-answer');
            }
        }
    });

    // استدعاء showFeedback مرة واحدة بعد الانتهاء من عرض الخيارات
    if (state.userAnswers[state.currentQuestionIndex] !== null) {
        const answeredData = state.userAnswers[state.currentQuestionIndex];
        showFeedback(answeredData.isCorrect, answeredData.rationale, answeredData.feedbackMessage);
    }

    // تعطيل زر 'التالي' إذا لم يتم الإجابة على السؤال الحالي
    nextButton.disabled = state.userAnswers[state.currentQuestionIndex] === null;
    // إخفاء صندوق التغذية الراجعة عند عرض سؤال جديد لم يُجب عليه
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
    if (state.userAnswers[state.currentQuestionIndex] !== null) return; // منع الإجابة مرتين

    const currentQ = state.currentQuizData.questions[state.currentQuestionIndex];
    const isCorrect = currentQ.answerOptions[selectedIndex].isCorrect;
    const rationale = currentQ.answerOptions[selectedIndex].rationale || "لا يوجد تبرير متاح لهذا الخيار.";

    const feedbackConfig = state.currentQuizData?.config?.feedback || {};
    const correctFeedback = feedbackConfig.correct || {};
    const incorrectFeedback = feedbackConfig.incorrect || {};
    const streakGoal = Number(state.currentQuizData?.config?.streakGoal) || 0;

    // تحديث النتيجة والـ Streak
    let newStreak = isCorrect ? state.streak + 1 : 0;
    let feedbackMsg = isCorrect
        ? escapeHtml(correctFeedback.message || "✅ إجابة صحيحة")
        : escapeHtml(incorrectFeedback.message || "❌ إجابة غير صحيحة");

    if (isCorrect) {
        state.score++;
        if (streakGoal > 0 && newStreak % streakGoal === 0) {
            const streakMsg = escapeHtml(correctFeedback.onStreak || "🔥 سلسلة إجابات صحيحة رائعة");
            feedbackMsg += `<br><span class="text-xl font-black block mt-2 text-green-700">${streakMsg}</span>`;
        }
    }

    // تحديث المتغيرات العامة
    state.streak = newStreak;
    scoreDisplayEl.textContent = `النقاط: ${state.score}`;

    if (isCorrect) {
        showToastMessage(pickRandom(toastPraise), 'success');
        if (newStreak >= 2) {
            const streakBucket = newStreak >= 5 ? streakToasts[5] : (streakToasts[newStreak] || []);
            showToastMessage(pickRandom(streakBucket), 'streak');
        }
    } else {
        showToastMessage(pickRandom(toastOops), 'error');
    }

    // حفظ الإجابة مع رسالة التغذية الراجعة الكاملة
    state.userAnswers[state.currentQuestionIndex] = { selectedIndex, isCorrect, rationale, feedbackMessage: feedbackMsg };

    // تحديث الواجهة
    disableOptions();

    // إظهار التغذية الراجعة
    showFeedback(isCorrect, rationale, feedbackMsg);

    // تلوين الخيارات
    const optionElements = optionsContainerEl.children;
    Array.from(optionElements).forEach(el => {
        const index = parseInt(el.getAttribute('data-index'));
        el.classList.remove('selected');
        el.onclick = null;

        // تلوين الجواب الصحيح
        if (currentQ.answerOptions[index].isCorrect) {
            el.classList.add('correct-answer');
        }

        // تلوين الجواب الخاطئ الذي اختاره المستخدم
        if (index === selectedIndex && !isCorrect) {
            el.classList.add('incorrect-answer');
        }
    });

    // تفعيل زر التالي
    nextButton.disabled = false;
}

/**
 * إظهار صندوق التغذية الراجعة مع التلوين حسب صحة الإجابة
 * @param {boolean} isCorrect — هل الإجابة صحيحة
 * @param {string} rationale — التبرير
 * @param {string} message — رسالة التغذية الراجعة (مُعقَّمة مسبقاً)
 */
export function showFeedback(isCorrect, rationale, message) {
    logFunctionStatus('showFeedback', false);
    const safeMessage = message || (isCorrect ? "إجابة صحيحة." : "إجابة غير صحيحة.");
    const safeRationale = rationale || "لا يوجد تبرير متاح لهذا الخيار.";
    feedbackMessageEl.innerHTML = safeMessage; // Safe: already escaped in selectAnswer()
    rationaleTextEl.textContent = `التبرير: ${safeRationale}`;

    feedbackBoxEl.classList.remove('scale-y-0', 'h-0', 'opacity-0');
    feedbackBoxEl.classList.add('scale-y-100', 'h-auto', 'opacity-100', 'p-4');

    if (isCorrect) {
        feedbackBoxEl.classList.remove('incorrect-bg');
        feedbackBoxEl.classList.add('correct-bg');
        feedbackMessageEl.classList.remove('text-red-900');
        feedbackMessageEl.classList.add('text-white');
        rationaleTextEl.classList.add('text-white');
        rationaleTextEl.classList.remove('text-red-900');
    } else {
        feedbackBoxEl.classList.remove('correct-bg');
        feedbackBoxEl.classList.add('incorrect-bg');
        feedbackMessageEl.classList.remove('text-white');
        feedbackMessageEl.classList.add('text-red-900');
        rationaleTextEl.classList.remove('text-white');
        rationaleTextEl.classList.add('text-red-900');
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
 * تحديث عرض شريط التقدم بناءً على السؤال الحالي
 */
export function updateProgressBar() {
    logFunctionStatus('updateProgressBar', false);
    const progress = state.totalQuestions > 0 ? ((state.currentQuestionIndex + 1) / state.totalQuestions) * 100 : 0;
    progressBarEl.style.width = `${progress}%`;
}

/**
 * بدء المؤقت التنازلي باستخدام Date.now() لدقة أعلى
 */
export function startTimer() {
    logFunctionStatus('startTimer', false);
    if (state.timerInterval) clearInterval(state.timerInterval);
    // Reset timer display styles from previous quiz
    if (timerDisplayEl) {
        timerDisplayEl.classList.remove('text-orange-500', 'text-red-600', 'animate-pulse');
    }
    state.timerStartTime = Date.now();
    state.timerTotalSeconds = state.timeRemaining;
    state.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.timerStartTime) / 1000);
        state.timeRemaining = Math.max(0, state.timerTotalSeconds - elapsed);
        timerDisplayEl.textContent = formatTime(state.timeRemaining);

        if (state.timeRemaining <= 300) { // تنبيه آخر 5 دقائق
            timerDisplayEl.classList.remove('text-red-600');
            timerDisplayEl.classList.add('text-orange-500', 'animate-pulse');
        }

        if (state.timeRemaining <= 0) {
            clearInterval(state.timerInterval);
            timerDisplayEl.textContent = "انتهى الوقت!";
            submitQuiz();
        }
    }, 1000);
}

/**
 * تسليم الاختبار — حفظ النتيجة وعرض شاشة النتائج
 * يتضمن حماية من التسليم المزدوج (race condition مع المؤقت)
 */
let _isSubmitting = false;
export async function submitQuiz() {
    logFunctionStatus('submitQuiz', true);
    // منع التسليم المزدوج
    if (_isSubmitting) return;
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

            // إرسال النتيجة للسيرفر
            const quizId = state.currentQuizData.id || state.currentQuizData.config?.id;
            const numericId = Number(quizId);
            console.log(`[submitScore] بدء إرسال النتيجة — quizId: ${quizId} (type: ${typeof quizId}), النتيجة: ${state.score}/${state.totalQuestions}`);
            if (quizId && Number.isFinite(numericId) && numericId > 0) {
                try {
                    const scoreResult = await apiCall('POST', '/api/scores', {
                        quizId: numericId,
                        answers: state.userAnswers.map((a, i) => ({
                            questionId: state.currentQuizData.questions[i]?.id || i,
                            selectedIndex: a ? a.selectedIndex : -1
                        })),
                        timeTaken: state.currentQuizData.config.timeLimit - state.timeRemaining
                    });
                    console.log(`[submitScore] ✓ تم حفظ النتيجة على السيرفر`, scoreResult.result || scoreResult);
                } catch (e) {
                    console.error(`[submitScore] ✗ فشل حفظ النتيجة:`, e.message);
                    const saveErrEl = document.getElementById('save-score-error');
                    if (saveErrEl) {
                        saveErrEl.textContent = '⚠️ تعذّر حفظ نتيجتك على السيرفر: ' + e.message;
                        saveErrEl.classList.remove('hidden');
                        setTimeout(() => saveErrEl.classList.add('hidden'), 6000);
                    }
                }
            } else {
                console.warn(`[submitScore] ⚠️ الامتحان ليس له ID سيرفر صالح (${quizId}) — النتيجة محفوظة محلياً فقط`);
            }
        }
        // ========================================

        document.getElementById('quiz-container').classList.add('hidden');
        document.getElementById('results-screen').classList.remove('hidden');

        const percentage = (state.score / state.totalQuestions) * 100;

        // تحديث النقاط والعدد
        document.getElementById('final-score').textContent = state.score;
        document.getElementById('final-total').textContent = state.totalQuestions;

        // عرض الرسالة المخصصة
        document.getElementById('custom-closing-text').textContent = state.currentQuizData.config.closingMessage || "شكراً لمشاركتك!";

        let finalMessage = "ما شاء الله تبارك الرحمن! نتائجك مُبهرة.";

        if (percentage < 50) {
            finalMessage = "هون عليك! لكل جواد كبوة، والتعلم رحلة مستمرة.";
        } else if (percentage < 75) {
            finalMessage = "مستوى جيد جداً! لديك أساس متين.";
        } else if (percentage < 90) {
            finalMessage = "ممتاز يا بطل! أداؤك قوي.";
        }

        document.getElementById('final-message').textContent = finalMessage;
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

    // تحديث البيانات
    renderDashboard();
    _showThemeToggle(true);
}
