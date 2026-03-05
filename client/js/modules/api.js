
// 1. الاستيرادات أولاً في أعلى الملف
import state from './state.js';
import { logFunctionStatus } from './helpers.js';

// 2. تعريف الدوال والتصدير
// Provide a fetch-like wrapper for dashboard.js compatibility
export async function apiFetch(url) {
    return await apiCall('GET', url);
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
        return document.cookie.split(';')
            .map(c => c.trim())
            .find(c => c.startsWith('csrf_token='))
            ?.split('=')[1] || '';
    } catch { return ''; }
}

/**
 * إنشاء هيدرز الطلب — يشمل CSRF token على الطلبات المُعدِّلة
 * @returns {Object}
 */
export function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
    return headers;
}

/**
 * استدعاء API عام
 * يرسل الكوكيز تلقائياً (httpOnly JWT) + Authorization header كـ fallback
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method — HTTP method
 * @param {string} url — المسار
 * @param {Object} [body] — البيانات المرسلة
 * @returns {Promise<Object>} البيانات المرجعة
 * @throws {Error} في حالة فشل الاتصال
 */
export async function apiCall(method, url, body) {
    logFunctionStatus(`apiCall ${method} ${url}`, true);
    const tag = `[API] ${method} ${url}`;
    console.log(`${tag} — إرسال...`, body ?? '');
    const opts = {
        method,
        headers: getAuthHeaders(),
        credentials: 'include'
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errMsg = data.error || `HTTP ${res.status}`;
        console.error(`${tag} ✗ فشل — ${res.status}:`, data);
        throw new Error(errMsg);
    }
    const data = await res.json();
    console.log(`${tag} ✓ نجح — ${res.status}`, data);
    return data;
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
export async function getAttempts(quizId, email = '') {
    logFunctionStatus('getAttempts', true);
    if (!quizId) {
        console.warn('[getAttempts] quizId مطلوب');
        return 0;
    }
    try {
        const params = new URLSearchParams({ quizId });
        if (email) params.append('email', email);
        const data = await apiCall('GET', `/api/attempts?${params.toString()}`);
        const count = Number(data?.attempts) || 0;
        console.log(`[getAttempts] quizId=${quizId} email=${email || 'self'} → ${count} محاولة`);
        return count;
    } catch (err) {
        console.warn('⚠️ [getAttempts] تعذر جلب المحاولات:', err.message);
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
 * console.log(`هذه محاولتك رقم ${newCount}`);
 */
export async function saveAttempt(quizId, email = '') {
    logFunctionStatus('saveAttempt', true);
    if (!quizId) throw new Error('[saveAttempt] quizId مطلوب');
    try {
        const payload = { quizId };
        if (email) payload.email = email;
        const data = await apiCall('POST', '/api/attempts', payload);
        const updated = Number(data?.attempts) || 0;
        console.log(`[saveAttempt] quizId=${quizId} → المحاولة رقم ${updated}`);
        return updated;
    } catch (err) {
        console.warn('⚠️ [saveAttempt] تعذر حفظ المحاولة:', err.message);
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
    isOfficial = true
}) {
    logFunctionStatus('saveScore', true);
    if (!quizId) throw new Error('[saveScore] quizId مطلوب');

    const percentage = Math.round((Number(score) / (Number(total) || 1)) * 100);

    const payload = {
        quizId,
        quizTitle:   quizTitle   || 'امتحان',
        quizSubject: quizSubject || '',
        score:       Number(score) || 0,
        total:       Number(total) || 0,
        percentage,
        isOfficial,          // ← العلامة الرئيسية: رسمي / تدريبي
        date: new Date().toISOString()
    };

    console.log(`[saveScore] إرسال النتيجة — quizId=${quizId} isOfficial=${isOfficial}`, payload);
    return await apiCall('POST', '/api/scores', payload);
}

// ─────────────────────────────────────────────
//  دوال الجلب العام
// ─────────────────────────────────────────────

/**
 * جلب لوحة الشرف من السيرفر
 * @returns {Promise<Array>} بيانات لوحة الشرف
 */
export async function fetchLeaderboardFromServer() {
    logFunctionStatus('fetchLeaderboardFromServer', true);
    try {
        const data = await apiCall('GET', '/api/scores/leaderboard');
        return data.map(item => ({
            userName:       item.userName || 'طالب',
            fullMarksCount: Number(item.fullMarksCount) || 0,
            avgPercentage:  Number(item.avgPercentage)  || 0,
            totalScore:     Number(item.totalScore)     || 0,
            totalMax:       Number(item.totalMax)       || 0,
            examsCount:     Number(item.examsCount)     || 0
        }));
    } catch (err) {
        console.warn('⚠️ تعذر جلب لوحة الشرف:', err.message);
        return [];
    }
}

/**
 * جلب الدرجات من السيرفر
 * @param {boolean} [officialOnly=false] - جلب المحاولات الرسمية فقط
 * @returns {Promise<Array>} بيانات الدرجات
 */
export async function fetchScoresFromServer(officialOnly = false) {
    logFunctionStatus('fetchScoresFromServer', true);
    try {
        const base     = state.isAdmin ? '/api/scores/all' : '/api/scores/my';
        const endpoint = officialOnly ? `${base}?isOfficial=true` : base;
        const raw      = await apiCall('GET', endpoint);
        const data     = Array.isArray(raw) ? raw : (raw?.data || []);
        return data.map(item => ({
            userName:    item.userName || (item.user ? `${item.user.fname || ''} ${item.user.lname || ''}`.trim() : 'طالب'),
            quizId:      item.quizId      || item.quiz?.id   || null,
            quizTitle:   item.quizTitle   || item.quiz?.title   || 'امتحان',
            quizSubject: item.quizSubject || item.quiz?.subject || '',
            score:       Number(item.score)      || 0,
            total:       Number(item.total)      || 0,
            percentage:  Number(item.percentage) || Math.round(((Number(item.score) || 0) / (Number(item.total) || 1)) * 100),
            isOfficial:  item.isOfficial ?? true,   // ← محافظة على العلامة من السيرفر
            date:        item.date || item.createdAt || new Date().toISOString()
        }));
    } catch (err) {
        console.warn('⚠️ تعذر جلب الدرجات:', err.message);
        return [];
    }
}

/**
 * تحميل جميع البيانات من السيرفر
 */
export async function loadDataFromServer() {
    logFunctionStatus('loadDataFromServer', true);
    if (!state.currentUser) { console.warn('[loadData] لا يوجد مستخدم — تخطي'); return; }
    console.log('[loadData] بدء تحميل البيانات من السيرفر...');
    try {
        const [quizzesRes, notesRes, leaderboardRemote, scoresRemote] = await Promise.all([
            apiCall('GET', '/api/quizzes').catch(e => { console.error('[loadData] ✗ فشل تحميل الامتحانات:', e.message);   return { data: [] }; }),
            apiCall('GET', '/api/notes').catch(e   => { console.error('[loadData] ✗ فشل تحميل المذكرات:', e.message);     return { data: [] }; }),
            fetchLeaderboardFromServer().catch(e   => { console.error('[loadData] ✗ فشل تحميل لوحة الشرف:', e.message);  return [];           }),
            fetchScoresFromServer().catch(e        => { console.error('[loadData] ✗ فشل تحميل الدرجات:', e.message);      return [];           })
        ]);

        const quizzes = Array.isArray(quizzesRes) ? quizzesRes : (quizzesRes?.data || []);
        const notes   = Array.isArray(notesRes)   ? notesRes   : (notesRes?.data   || []);

        state.allQuizzes = quizzes.map(q => ({
            id: q.id,
            config: {
                id: q.id, title: q.title, subject: q.subject,
                description: q.description || '', timeLimit: q.timeLimit || 1500,
                closingMessage: q.closingMessage || 'شكراً لمشاركتك!'
            },
            questions: q.questions || []
        }));

        state.allNotes = notes.map(n => ({
            id: n.id,
            config: {
                id: n.id, title: n.title, subject: n.subject,
                link: n.link || '', type: n.type || 'pdf',
                description: n.description || ''
            }
        }));

        state.serverLeaderboard = leaderboardRemote || [];
        state.serverScores      = scoresRemote      || [];

        if (state.serverScores.length > 0) {
            state.allUserScores = state.serverScores.map(s => ({
                userName:   s.userName   || 'طالب',
                quizTitle:  s.quizTitle  || 'امتحان',
                score:      Number(s.score)      || 0,
                total:      Number(s.total)      || 0,
                percentage: Number(s.percentage) || 0,
                isOfficial: s.isOfficial ?? true,   // ← محافظة على العلامة
                date:       s.date || s.createdAt || new Date().toISOString()
            }));
        }

        state.dataLoaded = true;
        console.log(`[loadData] ✓ تم — ${state.allQuizzes.length} امتحان، ${state.allNotes.length} مذكرة، ${state.serverScores.length} نتيجة، ${state.serverLeaderboard.length} في لوحة الشرف`);
    } catch (e) {
        console.error('[loadData] ✗ فشل تحميل البيانات:', e.message);
    }
}