/**
 * @module state
 * @description الحالة العامة للتطبيق — كل المتغيرات المشتركة بين الوحدات
 * يتم استيراد هذا الكائن في كل وحدة تحتاج الوصول للحالة العامة.
 */

/** @type {Object} الحالة المركزية للتطبيق */
const state = {
    /** @type {Object|null} بيانات الاختبار الحالي */
    currentQuizData: null,
    /** @type {string} فلتر المادة النشط */
    currentSubjectFilter: 'الكل',
    /** @type {Array} جميع الاختبارات */
    allQuizzes: [],
    /** @type {string} فلتر المادة في نافذة التعديل */
    editSubjectFilter: 'الكل',
    /** @type {Array} درجات المستخدم */
    allUserScores: [],
    /** @type {string|null} العرض الحالي (exams/notes) */
    currentViewMode: null,
    /** @type {Object|null} المستخدم الحالي */
    currentUser: null,
    /** @type {Array} جميع المذكرات */
    allNotes: [],
    /** @type {string} تبويب التعديل النشط */
    editTabMode: 'exams',
    /** @type {number} رقم المذكرة قيد التعديل */
    editingNoteIndex: -1,
    /** @type {number} رقم السؤال الحالي */
    currentQuestionIndex: 0,
    /** @type {number} النتيجة */
    score: 0,
    /** @type {string|null} المادة المراد حذفها */
    subjectToDelete: null,
    /** @type {number} عدد الإجابات الصحيحة المتتالية */
    streak: 0,
    /** @type {number|null} مؤقت الاختبار */
    timerInterval: null,
    /** @type {number} الوقت المتبقي */
    timeRemaining: 0,
    /** @type {Array} إجابات المستخدم */
    userAnswers: [],
    /** @type {number} عدد الأسئلة الكلي */
    totalQuestions: 0,
    /** @type {Array} لوحة الشرف من السيرفر */
    serverLeaderboard: [],
    /** @type {Array} الدرجات من السيرفر */
    serverScores: [],
    /** @type {boolean} هل بدأ الاختبار */
    quizStarted: false,
    /** @type {boolean} هل في وضع التعديل */
    isEditMode: false,
    /** @type {boolean} هل أدمن */
    isAdmin: false,
    /** @type {boolean} هل تم تحميل البيانات */
    dataLoaded: false,
    /** @type {number} بداية المؤقت */
    timerStartTime: 0,
    /** @type {number} إجمالي ثواني المؤقت */
    timerTotalSeconds: 0,
    /** @type {string} وضع تسجيل الدخول بجوجل */
    googleLoginMode: 'student',
    /** @type {number} عدد محاولات إعادة GSI */
    gsiRetries: 0,
    /** @type {Object|null} مسودة الاختبار في البناء */
    quizDraft: null,
    /** @type {number} رقم السؤال الحالي في البناء */
    bCurrentQIndex: 0,
    /** @type {string|null} المادة المراد تعديل اسمها */
    subjectToRename: null,
    /** @type {number|null} مؤقت تجديد التوكن */
    tokenRefreshTimer: null,
    /** @type {string} معرف Google OAuth */
    GOOGLE_CLIENT_ID: '124349544803-hr3h69k1uhi78aamk8iacj9e1rjpjsgf.apps.googleusercontent.com',

    /**
     * @type {Object} عدد محاولات كل طالب لكل اختبار
     * @description هيكل البيانات: { [studentEmail]: { [quizId]: attemptCount } }
     * @example
     * // { "student@example.com": { "quiz_01": 3, "quiz_02": 1 } }
     */
    quizAttempts: {}
};

// ─────────────────────────────────────────────
//  دوال إدارة عدد المحاولات
// ─────────────────────────────────────────────

/**
 * إرجاع عدد محاولات طالب معين لاختبار معين.
 *
 * @param {string} email   - البريد الإلكتروني للطالب
 * @param {string} quizId  - معرّف الاختبار
 * @returns {number} عدد المحاولات (0 إذا لم توجد سجلات بعد)
 *
 * @example
 * const attempts = getAttemptCount('student@example.com', 'quiz_01');
 * console.log(attempts); // 2
 */
export function getAttemptCount(email, quizId) {
    if (!email || !quizId) return 0;
    return state.quizAttempts[email]?.[quizId] ?? 0;
}

/**
 * زيادة عدد محاولات طالب معين لاختبار معين بمقدار 1،
 * مع إنشاء السجل تلقائياً إن لم يكن موجوداً.
 *
 * @param {string} email   - البريد الإلكتروني للطالب
 * @param {string} quizId  - معرّف الاختبار
 * @returns {number} عدد المحاولات المحدَّث
 * @throws {Error} إذا كان email أو quizId فارغاً
 *
 * @example
 * updateAttemptCount('student@example.com', 'quiz_01'); // 1
 * updateAttemptCount('student@example.com', 'quiz_01'); // 2
 */
export function updateAttemptCount(email, quizId) {
    if (!email || !quizId) {
        throw new Error('updateAttemptCount: يجب توفير email و quizId صالحَين.');
    }

    // أنشئ مدخل الطالب إن لم يكن موجوداً
    if (!state.quizAttempts[email]) {
        state.quizAttempts[email] = {};
    }

    // أنشئ مدخل الاختبار إن لم يكن موجوداً، ثم زد العداد
    state.quizAttempts[email][quizId] =
        (state.quizAttempts[email][quizId] ?? 0) + 1;

    return state.quizAttempts[email][quizId];
}

// ─────────────────────────────────────────────

/** @constant {string} مفتاح تخزين الثيم */
export const THEME_KEY = 'app-theme';

export default state;