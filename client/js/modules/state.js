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
    /** @type {string|null} توكن الأدمن */
    adminToken: null,
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
    tokenRefreshTimer: null
};

/**
 * @constant {string} معرف Google OAuth
 * يُستخدم كقيمة افتراضية ويُحدَّث تلقائياً من السيرفر عبر /api/config
 * لتجنب تكرار القيمة في مكانين (state.js + .env)
 */
export let GOOGLE_CLIENT_ID = '124349544803-hr3h69k1uhi78aamk8iacj9e1rjpjsgf.apps.googleusercontent.com';

/**
 * تحديث GOOGLE_CLIENT_ID من السيرفر
 * @param {string} id — معرف Google OAuth من السيرفر
 */
export function setGoogleClientId(id) {
    if (id) GOOGLE_CLIENT_ID = id;
}

/** @constant {string} مفتاح تخزين الثيم */
export const THEME_KEY = 'app-theme';

export default state;
