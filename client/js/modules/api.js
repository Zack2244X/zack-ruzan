/**
 * @module api
 * @description دوال الاتصال بالسيرفر — API calls
 */
import state from './state.js';

/**
 * إنشاء هيدرز التوثيق
 * @returns {Object} هيدرز HTTP مع التوكن (للتوافق مع الموبايل)
 */
export function getAuthHeaders() {
    return { 'Content-Type': 'application/json' };
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
    const opts = {
        method,
        headers: getAuthHeaders(),
        credentials: 'include'  // إرسال الكوكيز مع كل طلب
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'خطأ في الاتصال بالسيرفر');
    }
    return res.json();
}

/**
 * جلب لوحة الشرف من السيرفر
 * @returns {Promise<Array>} بيانات لوحة الشرف
 */
export async function fetchLeaderboardFromServer() {
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
    if (!state.currentUser) return;
    try {
        const [quizzesRes, notesRes, leaderboardRemote, scoresRemote] = await Promise.all([
            apiCall('GET', '/api/quizzes').catch(() => ({ data: [] })),
            apiCall('GET', '/api/notes').catch(() => ({ data: [] })),
            fetchLeaderboardFromServer().catch(() => []),
            fetchScoresFromServer().catch(() => [])
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
    } catch (e) {
        console.warn('تعذر تحميل البيانات:', e.message);
    }
}
