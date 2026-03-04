/**
 * @module api
 * @description دوال الاتصال بالسيرفر — API calls
 */
import state from './state.js';
import { logFunctionStatus } from './helpers.js';

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
    console.log(`${tag} — إرسال...`, body ? body : '');
    const opts = {
        method,
        headers: getAuthHeaders(),
        credentials: 'include'  // إرسال الكوكيز مع كل طلب
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

/**
 * جلب لوحة الشرف من السيرفر
 * @returns {Promise<Array>} بيانات لوحة الشرف
 */
export async function fetchLeaderboardFromServer() {
    logFunctionStatus('fetchLeaderboardFromServer', true);
    try {
        const data = await apiCall('GET', '/api/scores/leaderboard');
        return data.map(item => ({
            userName: item.userName || 'طالب',
            fullMarksCount: Number(item.fullMarksCount) || 0,
            avgPercentage: Number(item.avgPercentage) || 0,
            totalScore: Number(item.totalScore) || 0,
            totalMax: Number(item.totalMax) || 0,
            examsCount: Number(item.examsCount) || 0
        }));
    } catch (err) {
        console.warn('⚠️ تعذر جلب لوحة الشرف:', err.message);
        return [];
    }
}

/**
 * جلب الدرجات من السيرفر
 * @returns {Promise<Array>} بيانات الدرجات
 */
export async function fetchScoresFromServer() {
    logFunctionStatus('fetchScoresFromServer', true);
    try {
        const endpoint = state.isAdmin ? '/api/scores/all' : '/api/scores/my';
        const raw = await apiCall('GET', endpoint);
        const data = Array.isArray(raw) ? raw : (raw?.data || []);
        return data.map(item => ({
            userName: item.userName || (item.user ? `${item.user.fname || ''} ${item.user.lname || ''}`.trim() : 'طالب'),
            quizId: item.quizId || item.quiz?.id || null,
            quizTitle: item.quizTitle || (item.quiz ? item.quiz.title : 'امتحان'),
            quizSubject: item.quizSubject || (item.quiz ? item.quiz.subject : ''),
            score: Number(item.score) || 0,
            total: Number(item.total) || 0,
            percentage: Number(item.percentage) || Math.round(((Number(item.score) || 0) / (Number(item.total) || 1)) * 100),
            date: item.date || item.createdAt || new Date().toISOString()
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
            apiCall('GET', '/api/quizzes').catch(e => { console.error('[loadData] ✗ فشل تحميل الامتحانات:', e.message); return { data: [] }; }),
            apiCall('GET', '/api/notes').catch(e => { console.error('[loadData] ✗ فشل تحميل المذكرات:', e.message); return { data: [] }; }),
            fetchLeaderboardFromServer().catch(e => { console.error('[loadData] ✗ فشل تحميل لوحة الشرف:', e.message); return []; }),
            fetchScoresFromServer().catch(e => { console.error('[loadData] ✗ فشل تحميل الدرجات:', e.message); return []; })
        ]);
        const quizzes = Array.isArray(quizzesRes) ? quizzesRes : (quizzesRes?.data || []);
        const notes = Array.isArray(notesRes) ? notesRes : (notesRes?.data || []);

        state.allQuizzes = (quizzes || []).map(q => ({
            id: q.id,
            config: {
                id: q.id, title: q.title, subject: q.subject,
                description: q.description || '', timeLimit: q.timeLimit || 1500,
                closingMessage: q.closingMessage || 'شكراً لمشاركتك!'
            },
            questions: q.questions || []
        }));
        state.allNotes = (notes || []).map(n => ({
            id: n.id,
            config: {
                id: n.id, title: n.title, subject: n.subject,
                link: n.link || '', type: n.type || 'pdf',
                description: n.description || ''
            }
        }));

        state.serverLeaderboard = leaderboardRemote || [];
        state.serverScores = scoresRemote || [];
        if (state.serverScores.length > 0) {
            state.allUserScores = state.serverScores.map(s => ({
                userName: s.userName || 'طالب',
                quizTitle: s.quizTitle || 'امتحان',
                score: Number(s.score) || 0,
                total: Number(s.total) || 0,
                percentage: Number(s.percentage) || 0,
                date: s.date || s.createdAt || new Date().toISOString()
            }));
        }
        state.dataLoaded = true;
        console.log(`[loadData] ✓ تم — ${state.allQuizzes.length} امتحان، ${state.allNotes.length} مذكرة، ${state.serverScores.length} نتيجة، ${state.serverLeaderboard.length} في لوحة الشرف`);
    } catch (e) {
        console.error('[loadData] ✗ فشل تحميل البيانات:', e.message);
    }
}
