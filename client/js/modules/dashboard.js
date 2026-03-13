// زر تحديث يدوي للامتحانات
export function addManualRefreshButton() {
    const refreshBtnId = 'dashboard-refresh-btn';
    let btn = document.getElementById(refreshBtnId);
    if (!btn) {
        btn = document.createElement('button');
        btn.id = refreshBtnId;
        btn.className = 'absolute top-2 right-2 px-4 py-2 bg-blue-600 text-white rounded-xl shadow hover:bg-blue-700 z-20';
        btn.innerHTML = '<i class="fas fa-sync-alt"></i> تحديث الامتحانات';
        btn.onclick = async () => {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحديث...';
            await window.forceDashboardRefresh();
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> تحديث الامتحانات';
        };
        const dashboard = document.getElementById('dashboard-view');
        if (dashboard) dashboard.appendChild(btn);
    }
}

// دالة عالمية لإجبار التحديث الكامل من السيرفر
window.forceDashboardRefresh = async function() {
    if (typeof loadDataFromServer === 'function') {
        await loadDataFromServer();
        if (typeof renderDashboard === 'function') renderDashboard(true);
    }
}
// تحديث دوري للوحة الشرف كل دقيقة
let leaderboardRefreshTimer = null;

export function startLeaderboardAutoRefresh() {
    if (leaderboardRefreshTimer) clearInterval(leaderboardRefreshTimer);
    leaderboardRefreshTimer = setInterval(() => {
        // إعادة تحميل لوحة الشرف من السيرفر وتحديث العرض
        if (typeof renderDashboard === 'function') {
            // forceRefresh=true لتجاوز الكاش
            renderDashboard(true);
        }
    }, 60000); // كل 60 ثانية
}

export function stopLeaderboardAutoRefresh() {
    if (leaderboardRefreshTimer) {
        clearInterval(leaderboardRefreshTimer);
        leaderboardRefreshTimer = null;
    }
}
/**
 * @module dashboard
 * @description وحدة لوحة التحكم الرئيسية — عرض آخر الامتحانات والمذكرات ولوحة الشرف
 */
import state from './state.js';
import { escapeHtml, logFunctionStatus } from './helpers.js';
import { apiCall } from './api.js'; // use apiCall wrapper from api.js

// ─────────────────────────────────────────────
//  دوال المساعدة للمحاولات
// ─────────────────────────────────────────────

/**
 * جلب عدد المحاولات لجميع الامتحانات دفعةً واحدة من /api/scores/my/attempts.
 *
 * التحسينات المُطبّقة مقارنةً بالنسخة السابقة:
 *  • طلب واحد بدلاً من N طلب (واحد لكل امتحان).
 *  • كاش كامل: إذا كانت state.attemptsMap مليئة لا يُرسَل أي طلب.
 *  • كاش جزئي: إذا كانت المخزّن يغطي كل الامتحانات المطلوبة لا طلب يُرسَل.
 *  • يُملأ state.attemptsMap بعد كل جلب ليستفيد منه باقي الوحدات.
 *  • عند خطأ الشبكة يُعيد الـ Map الجزئية الموجودة بدلاً من الإلقاء.
 *
 * @param {Array}   quizzes   - قائمة الامتحانات المراد التحقق من محاولاتها
 * @param {boolean} forceRefresh - تجاهل الكاش وإعادة الجلب (مفيد بعد تسليم امتحان)
 * @returns {Promise<Map<string, number>>} خريطة quizId → عدد المحاولات
 */
async function resolveAttemptsMap(quizzes, forceRefresh = false) {
    // ── تهيئة الكاش إن لم يوجد ────────────────────────────────────────────
    if (!state.attemptsMap) state.attemptsMap = new Map();

    // ── الكاش الكامل: لا حاجة لأي طلب ──────────────────────────────────
    // إذا كان الكاش يغطي جميع الامتحانات المطلوبة نعود فوراً
    if (!forceRefresh) {
        const allCached = quizzes.every(q => state.attemptsMap.has(String(q.id)));
        if (allCached && state.attemptsMap.size > 0) {
            console.log('[dashboard] ✓ attemptsMap من الكاش — لا طلب مُرسَل');
            return state.attemptsMap;
        }
    }

    // ── طلب واحد يجلب كل المحاولات ──────────────────────────────────────
    console.log('[dashboard] ← جلب /api/scores/my/attempts (طلب واحد)...');

    try {
        // GET /api/scores/my/attempts → [{ quizId, attemptCount, hasOfficial }, ...]
        const rows = await apiCall('GET', '/api/scores/my/attempts');

        if (!Array.isArray(rows)) {
            throw new TypeError(`استجابة غير متوقعة من السيرفر: ${JSON.stringify(rows)}`);
        }

        // ── تعبئة state.attemptsMap بالبيانات الجديدة ─────────────────────
        rows.forEach(row => {
            if (row?.quizId != null) {
                state.attemptsMap.set(String(row.quizId), Number(row.attemptCount) || 0);
            }
        });

        // ── ضمان وجود مدخل لكل امتحان مطلوب (حتى غير الموجود في قاعدة البيانات) ──
        quizzes.forEach(q => {
            const key = String(q.id);
            if (!state.attemptsMap.has(key)) {
                state.attemptsMap.set(key, 0); // لم يحاول بعد
            }
        });

        console.log(`[dashboard] ✓ attemptsMap جاهزة — ${state.attemptsMap.size} اختبار`);

    } catch (err) {
        // ── معالجة أخطاء الشبكة: نستمر بالكاش الجزئي ────────────────────
        console.warn('[dashboard] ⚠️ تعذر جلب المحاولات — سيُعرض fallback نصي:', err.message);

        // نضمن أن كل امتحان مطلوب له قيمة (0 أو من الكاش)
        quizzes.forEach(q => {
            const key = String(q.id);
            if (!state.attemptsMap.has(key)) {
                state.attemptsMap.set(key, null); // null = خطأ في الجلب (يُعرض fallback)
            }
        });

        // نخزن حالة الخطأ لإظهار الـ fallback في الواجهة
        state.attemptsFetchError = true;
    }

    return state.attemptsMap;
}

/**
 * حساب هل المحاولة القادمة رسمية أم تدريبية بناءً على الحد الأقصى للمحاولات الرسمية.
 *
 * @param {number} attempts      - عدد المحاولات السابقة
 * @param {number|null} maxLimit - الحد الأقصى للمحاولات الرسمية (null = بلا حد)
 * @returns {boolean}
 */
function isNextAttemptPractice(attempts, maxLimit) {
    if (maxLimit == null || maxLimit <= 0) return false; // بلا حد = كل المحاولات رسمية
    return attempts >= maxLimit;
}

/**
 * بناء HTML لقسم المحاولات أسفل بطاقة الامتحان.
 * يتضمن عداد المحاولات وشارة التحذير إذا كانت المحاولة القادمة تدريبية.
 * يعرض fallback نصي إذا كانت قيمة المحاولات null (خطأ شبكة).
 *
 * @param {number|null} attempts       - عدد المحاولات السابقة، أو null عند خطأ الجلب
 * @param {boolean}     willBePractice - هل المحاولة القادمة تدريبية؟
 * @returns {string} HTML string
 */
function buildAttemptsHtml(attempts, willBePractice) {
    // ── fallback عند خطأ الشبكة ──────────────────────────────────────────
    if (attempts === null) {
        return `
            <div class="mt-3 pt-3 border-t border-gray-100 relative z-10">
                <div class="flex items-center gap-2 text-xs text-gray-400 italic">
                    <i class="fas fa-exclamation-circle text-amber-400 shrink-0"></i>
                    <span>لم يتمكن من جلب عدد المحاولات</span>
                </div>
            </div>`;
    }

    const attemptsLabel = attempts === 0
        ? `<span class="text-gray-400 font-semibold">لم تحاول بعد</span>`
        : `<span class="font-black text-blue-600 text-sm">${attempts}</span>`;

    const practiceWarning = willBePractice
        ? `<div class="mt-2 flex items-center gap-2 text-xs font-bold
                       bg-amber-50 text-amber-700 border border-amber-200
                       rounded-xl px-3 py-2">
               <i class="fas fa-graduation-cap shrink-0"></i>
               <span>المحاولة القادمة ستُسجَّل كتدريبية</span>
           </div>`
        : '';

    return `
        <div class="mt-3 pt-3 border-t border-gray-100 relative z-10">
            <div class="flex items-center gap-2 text-xs text-gray-500">
                <i class="fas fa-redo-alt text-blue-400 shrink-0"></i>
                <span>عدد مرات حلّك لهذا الامتحان: ${attemptsLabel}</span>
            </div>
            ${practiceWarning}
        </div>`;
}

// ─────────────────────────────────────────────
//  الدالة الرئيسية
// ─────────────────────────────────────────────

/**
 * رسم لوحة التحكم الرئيسية: آخر 4 امتحانات، آخر 3 مذكرات، وأعلى 3 في لوحة الشرف.
 * Renders the dashboard view with latest exams, notes, and leaderboard.
 * Uses window.playQuiz and window.forceDownload for event handlers.
 *
 * @param {boolean} forceRefresh - تمريرها true بعد تسليم امتحان لتحديث المحاولات
 * @returns {Promise<void>}
 */

export async function deleteQuiz(index, renderDashboardFn) {
    logFunctionStatus('deleteQuiz', true);
    const quiz = state.allQuizzes[index];
    if (!quiz) {
        showAlert('⚠️ الاختبار غير موجود.');
        return;
    }
    const confirmed = await showConfirm('حذف الاختبار', 'هل أنت متأكد من حذف هذا الاختبار؟ لا يمكن التراجع.', '🗑️');
    if (!confirmed) return;
    try {
        await apiCall('DELETE', `/api/quizzes/${quiz.id}`);
        state.allQuizzes.splice(index, 1);
        if (typeof renderDashboardFn === 'function') renderDashboardFn(true);
        showToastMessage('✅ تم حذف الاختبار.', 2000);
    } catch (e) {
        console.error('[deleteQuiz] ✗', e.message);
        showAlert('⚠️ فشل حذف الاختبار: ' + e.message, 'warning');
    }
}

export async function renderDashboard(forceRefresh = false) {
    logFunctionStatus('renderDashboard', false);

    // ── حالة التحميل ──────────────────────────────────────────────────────
    if (!state.dataLoaded) {
        console.log('[dashboard] ⏳ البيانات لم تُحمّل بعد...');
        const spinner = `
            <div class="col-span-full py-12 text-center text-gray-400">
                <i class="fas fa-spinner fa-spin text-3xl mb-3"></i>
                <p class="font-medium">جاري تحميل البيانات...</p>
            </div>`;
        document.getElementById('latest-exams-grid')?.replaceChildren();
        document.getElementById('latest-notes-grid')?.replaceChildren();
        document.getElementById('leaderboard-list')?.replaceChildren();
        document.getElementById('latest-exams-grid').innerHTML = spinner;
        document.getElementById('latest-notes-grid').innerHTML = spinner;
        document.getElementById('leaderboard-list').innerHTML  = spinner;
        return;
    }

    // ── إعداد متغيرات أساسية ──────────────────────────────────────────────
    // ترتيب الامتحانات حسب تاريخ الإضافة (الأحدث أولاً)
    const sortedQuizzes = [...state.allQuizzes].sort((a, b) => {
        const aDate = new Date(a.config.createdAt || a.createdAt || 0);
        const bDate = new Date(b.config.createdAt || b.createdAt || 0);
        return bDate - aDate;
    });
    const latestExams = sortedQuizzes.slice(0, 4);
    const globalMaxOfficial  = state.maxOfficialAttempts ?? null;

    // ── جلب المحاولات: طلب واحد للجميع قبل رسم أي بطاقة ─────────────────
    // إذا المستخدم غير مسجّل أو لا توجد امتحانات نتجاوز الطلب كلياً
    let attemptsMap = new Map();
    if (state.currentUser && latestExams.length > 0) {
        // نصفّر حالة خطأ الجلب السابقة قبل المحاولة الجديدة
        state.attemptsFetchError = false;
        attemptsMap = await resolveAttemptsMap(latestExams, forceRefresh);
    }

// ─────────────────────────────────────────────
//  1. آخر 4 امتحانات
// ─────────────────────────────────────────────
const latestExamsGrid = document.getElementById('latest-exams-grid');
latestExamsGrid.innerHTML = '';

if (latestExams.length === 0) {
    latestExamsGrid.innerHTML = `
        <div class="col-span-full py-12 bg-gray-50/50 rounded-3xl border-2 border-dashed
                    border-gray-200 text-center text-gray-400 font-medium">
            لا توجد امتحانات مضافة حتى الآن.
        </div>`;
} else {
    let examsHtml = '';

    latestExams.forEach((q) => {
        const quizIdentity = String(q.id ?? q.config?.id ?? '');
        let realIndex = state.allQuizzes.findIndex(item => {
            if (item === q) return true;
            const itemIdentity = String(item.id ?? item.config?.id ?? '');
            return quizIdentity && itemIdentity && itemIdentity === quizIdentity;
        });
        if (realIndex < 0) realIndex = state.allQuizzes.indexOf(q);
        const safeTitle       = escapeHtml(q.config.title);
        const safeDesc        = escapeHtml(q.config.description || '');
        const safeSubject     = escapeHtml(q.config.subject || 'عام');
        const quizMaxOfficial = q.config.maxOfficialAttempts ?? globalMaxOfficial;

        // attempts: number → عدد المحاولات | null → خطأ شبكة
        const attempts       = attemptsMap.get(String(q.id)) ?? 0;
        const willBePractice = state.currentUser && attempts !== null
            ? isNextAttemptPractice(attempts, quizMaxOfficial)
            : false;

        examsHtml += `
            <div class="bg-white rounded-3xl p-6 shadow-sm hover:shadow-xl transition duration-300
                        cursor-pointer border border-gray-100 hover:border-blue-400 group
                        relative overflow-hidden flex flex-col">
                <div onclick="playQuiz(${realIndex})" class="h-full w-full">

                    <div class="absolute -left-6 -top-6 w-24 h-24 exam-card-hover-glow rounded-full
                            opacity-0 group-hover:opacity-100 transition duration-500"></div>

                    <div class="flex justify-between items-start mb-5 relative z-10">
                        <div class="w-14 h-14 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600
                                    rounded-2xl flex items-center justify-center text-2xl shadow-inner
                                    group-hover:scale-110 transition duration-300">
                            <i class="fas fa-file-alt"></i>
                        </div>
                        <span class="time-badge-anim text-xs bg-blue-50 text-blue-600 px-3 py-1.5
                                     rounded-lg font-bold flex items-center gap-1">
                            <i class="far fa-clock"></i> ${q.config.timeLimit / 60} دقيقة
                        </span>
                    </div>

                    <h3 class="font-extrabold text-gray-800 text-lg mb-2 break-words relative z-10">
                        ${safeTitle}
                    </h3>

                    ${q.config.description
                        ? `<p class="text-sm text-gray-500 mb-3 line-clamp-2 break-words relative z-10">${safeDesc}</p>`
                        : '<div class="h-1 mb-3"></div>'}

                    <div class="flex items-center justify-between pt-4 border-t border-gray-100
                                relative z-10 mt-auto">
                        <span class="text-xs bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-md
                                     font-bold truncate max-w-[120px]">${safeSubject}</span>
                        <span class="text-xs text-gray-500 font-bold bg-gray-50 px-2.5 py-1.5
                                     rounded-md">${q.questions.length} أسئلة</span>
                    </div>

                    ${state.currentUser ? buildAttemptsHtml(attempts, willBePractice) : ''}
                </div>
            </div>`;
    });

    latestExamsGrid.innerHTML = examsHtml;
}

    // ─────────────────────────────────────────────
    //  2. آخر 3 مذكرات
    // ─────────────────────────────────────────────
    const latestNotesGrid = document.getElementById('latest-notes-grid');
    latestNotesGrid.innerHTML = '';

    const latestNotes = state.allNotes.slice(-3).reverse();
    if (latestNotes.length === 0) {
        latestNotesGrid.innerHTML = `
            <div class="col-span-full py-12 bg-gray-50/50 rounded-3xl border-2 border-dashed
                        border-gray-200 text-center text-gray-400 font-medium">
                لا توجد مذكرات أو ملفات مضافة حتى الآن.
            </div>`;
    } else {
        let notesHtml = '';
        latestNotes.forEach(n => {
            const { config }  = n;
            const iconClass   = config.type === 'ppt' ? 'fa-file-powerpoint text-red-500'  : 'fa-file-pdf text-orange-500';
            const bgClass     = config.type === 'ppt' ? 'from-red-50 to-red-100'           : 'from-orange-50 to-orange-100';
            const safeTitle   = escapeHtml(config.title);
            const safeDesc    = escapeHtml(config.description || '');
            const safeSubject = escapeHtml(config.subject || 'عام');

            notesHtml += `
                <div onclick="forceDownload('${escapeHtml(config.link)}')"
                     class="bg-white rounded-3xl p-6 shadow-sm hover:shadow-xl transition duration-300
                            cursor-pointer border border-gray-100 hover:border-orange-400 group
                            relative overflow-hidden">

                    <div class="absolute -left-6 -top-6 w-24 h-24 notes-card-hover-glow rounded-full
                                opacity-0 group-hover:opacity-100 transition duration-500"></div>

                    <div class="flex justify-between items-start mb-5 relative z-10">
                        <div class="w-14 h-14 bg-gradient-to-br ${bgClass} rounded-2xl flex items-center
                                    justify-center text-3xl shadow-inner group-hover:scale-110
                                    transition duration-300">
                            <i class="fas ${iconClass}"></i>
                        </div>
                        <span class="text-xs bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg
                                     font-bold flex items-center gap-1 group-hover:bg-orange-600
                                     group-hover:text-white transition">
                            <i class="fas fa-download"></i> تحميل مباشر
                        </span>
                    </div>

                    <h3 class="font-extrabold text-gray-800 text-lg mb-2 break-words relative z-10">
                        ${safeTitle}
                    </h3>

                    ${config.description
                        ? `<p class="text-sm text-gray-500 mb-3 line-clamp-2 break-words relative z-10">${safeDesc}</p>`
                        : '<div class="h-1 mb-3"></div>'}

                    <div class="flex items-center justify-between pt-4 border-t border-gray-100
                                relative z-10 mt-auto">
                        <span class="text-xs bg-orange-50 text-orange-800 px-2.5 py-1.5 rounded-md
                                     font-bold truncate max-w-[150px]">${safeSubject}</span>
                        <span class="text-xs text-gray-400 font-medium flex items-center gap-1">
                            <i class="fas fa-link"></i>
                            ${escapeHtml((config.type || 'pdf').toUpperCase())}
                        </span>
                    </div>
                </div>`;
        });
        latestNotesGrid.innerHTML = notesHtml;
    }

    // ─────────────────────────────────────────────
    //  3. لوحة الشرف — أعلى 3
    // ─────────────────────────────────────────────
    const leaderboardList = document.getElementById('leaderboard-list');
    leaderboardList.innerHTML = '';

    const totalExams    = state.allQuizzes.length || 1;
    // Prefer leaderboard from server if available (always includes names)
    const sourceLeaderboard = Array.isArray(state.serverLeaderboard) && state.serverLeaderboard.length > 0
        ? state.serverLeaderboard
        : (() => {
            // fallback: calculate locally from scores (may lack names for students)
            const scoresByUser = {};
            const sourceScores = (state.serverScores?.length > 0) ? state.serverScores : state.allUserScores;
            sourceScores.forEach(entry => {
                if (entry.isOfficial === false) return;
                const userName = entry.userName || 'طالب';
                const total    = Number(entry.total) || 0;
                const score    = Number(entry.score) || 0;
                if (total <= 0) return;
                if (!scoresByUser[userName]) {
                    scoresByUser[userName] = { userName, totalScore: 0, totalMax: 0, examsCount: 0, fullMarksCount: 0 };
                }
                scoresByUser[userName].totalScore    += score;
                scoresByUser[userName].totalMax      += total;
                scoresByUser[userName].examsCount    += 1;
                if (score === total) scoresByUser[userName].fullMarksCount += 1;
            });
            return Object.values(scoresByUser).map(u => ({
                ...u,
                avgPercentage: u.totalMax > 0 ? Math.round((u.totalScore / u.totalMax) * 100) : 0
            }));
        })();

    const ranked = sourceLeaderboard
        .filter(item => item.totalScore > 0)
        .sort((a, b) => {
            if (b.fullMarksCount !== a.fullMarksCount) return b.fullMarksCount - a.fullMarksCount;
            if (b.avgPercentage  !== a.avgPercentage)  return b.avgPercentage  - a.avgPercentage;
            if (b.totalScore     !== a.totalScore)     return b.totalScore     - a.totalScore;
            return String(a.userName).localeCompare(String(b.userName), 'ar');
        });

    if (ranked.length === 0) {
        leaderboardList.innerHTML = `
            <div class="text-center text-gray-400 py-10 bg-gray-50 rounded-2xl">
                لا توجد نتائج مسجلة بعد.
            </div>`;
    } else {
        const rankNames = ['المركز الأول', 'المركز الثاني', 'المركز الثالث'];
        const colors    = [
            'bg-gradient-to-l from-yellow-50 to-white border-yellow-200 text-yellow-700',
            'bg-gradient-to-l from-gray-50 to-white border-gray-200 text-gray-600',
            'bg-gradient-to-l from-orange-50 to-white border-orange-200 text-orange-700'
        ];
        const medals = ['🥇', '🥈', '🥉'];

        let lbHtml = '';
        ranked.slice(0, 3).forEach((entry, i) => {
            const safeName      = escapeHtml(entry.userName);
            const fullMarkLabel = entry.fullMarksCount > 0
                ? `🌟 ${entry.fullMarksCount}/${totalExams} درجة نهائية`
                : `${entry.examsCount}/${totalExams} امتحان`;

            lbHtml += `
                <div class="bg-white rounded-3xl p-6 shadow-sm hover:shadow-xl transition duration-300
                            border ${colors[i] || colors[2]} flex items-center gap-4 mb-3">
                    <span class="text-2xl">${medals[i] || '🏅'}</span>
                    <div class="flex-1">
                        <div class="font-extrabold text-lg">${safeName}</div>
                        <div class="text-xs font-bold text-gray-500">${rankNames[i] || 'متميز'} • ${fullMarkLabel}</div>
                    </div>
                </div>`;
        });
        leaderboardList.innerHTML = lbHtml;
    }

    console.log(`[dashboard] ✓ تم رسم لوحة التحكم — ${state.allQuizzes.length} امتحان، ${state.allNotes.length} مذكرة، ${sourceLeaderboard.length} في الشرف`);
}